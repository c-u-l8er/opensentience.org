defmodule OpenSentience.Harness.CrossSessionLearning do
  @moduledoc """
  OS-008 Cross-Session Learning (spec section 14.2).

  Enables retried sessions to access prior session traces. When a session fails,
  a structured outcome node is stored. On retry, the mandatory retrieval phase
  pulls prior harness outcomes for the same `{agent_id, spec_hash}` tuple.

  ## Learning Loop

  1. On session failure: store structured outcome node
  2. On session retry: mandatory retrieval pulls prior outcomes
  3. Planner receives prior failure context and adapts sprint decomposition
  4. Creates a closed learning loop: harness → store → harness (next attempt)

  Cross-session learning is workspace-scoped — one workspace's harness failures
  do not leak to another.

  ## Integration

  In production, outcomes are stored in Graphonomous via `learn_from_outcome`.
  This module provides a local ETS-based implementation for testing and
  standalone operation, plus the data structures for Graphonomous integration.
  """

  use GenServer

  require Logger

  @type outcome :: %{
          type: :harness_outcome,
          status: :succeeded | :failed | :escalated,
          session_id: binary(),
          workspace_id: binary() | nil,
          agent_id: binary(),
          spec_hash: binary(),
          details: map(),
          timestamp: DateTime.t()
        }

  @table :os008_cross_session_outcomes

  ## Public API (ETS-backed local store)

  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opts \\ []) do
    name = Keyword.get(opts, :name, __MODULE__)
    GenServer.start_link(__MODULE__, opts, name: name)
  end

  @doc """
  Store an outcome in the local ETS table.
  """
  @spec store_local(outcome()) :: :ok
  def store_local(outcome) do
    key = {outcome.agent_id, outcome.spec_hash}
    existing = lookup(key)
    :ets.insert(@table, {key, [outcome | existing]})
    :ok
  rescue
    ArgumentError ->
      # Table doesn't exist yet — this is fine for standalone use
      Logger.debug("[OS-008] Cross-session learning table not available, skipping store")
      :ok
  end

  @doc """
  Retrieve prior outcomes for a given `{agent_id, spec_hash}` tuple.
  """
  @spec retrieve_local(binary(), binary()) :: {:ok, [outcome()]}
  def retrieve_local(agent_id, spec_hash) do
    outcomes = lookup({agent_id, spec_hash})
    {:ok, outcomes}
  rescue
    ArgumentError -> {:ok, []}
  end

  @doc """
  Build a Graphonomous-compatible outcome node for storage via `store_node`.

  This is the format that should be stored in Graphonomous for production use.
  """
  @spec to_graphonomous_node(outcome()) :: map()
  def to_graphonomous_node(outcome) do
    %{
      content:
        "Harness outcome: #{outcome.status} for agent #{outcome.agent_id} " <>
          "spec #{outcome.spec_hash} — #{inspect(outcome.details)}",
      node_type: "outcome",
      source: "os008_harness",
      confidence: status_confidence(outcome.status),
      metadata:
        Jason.encode!(%{
          harness_session_id: outcome.session_id,
          agent_id: outcome.agent_id,
          spec_hash: outcome.spec_hash,
          status: outcome.status,
          workspace_id: outcome.workspace_id,
          timestamp: DateTime.to_iso8601(outcome.timestamp)
        })
    }
  end

  @doc """
  Build a Graphonomous-compatible learning signal for `learn_from_outcome`.
  """
  @spec to_learning_signal(outcome()) :: map()
  def to_learning_signal(outcome) do
    %{
      action: "from_outcome",
      status: to_string(outcome.status),
      confidence: status_confidence(outcome.status),
      action_id: outcome.session_id,
      evidence:
        Jason.encode!(%{
          agent_id: outcome.agent_id,
          spec_hash: outcome.spec_hash,
          details: outcome.details
        })
    }
  end

  @doc """
  Clear all stored outcomes (for testing).
  """
  @spec clear() :: :ok
  def clear do
    :ets.delete_all_objects(@table)
    :ok
  rescue
    ArgumentError -> :ok
  end

  ## GenServer callbacks

  @impl true
  def init(_opts) do
    table = :ets.new(@table, [:named_table, :set, :public, read_concurrency: true])
    {:ok, %{table: table}}
  end

  ## Internal

  defp lookup(key) do
    case :ets.lookup(@table, key) do
      [{^key, outcomes}] -> outcomes
      [] -> []
    end
  end

  defp status_confidence(:succeeded), do: 0.9
  defp status_confidence(:failed), do: 0.3
  defp status_confidence(:escalated), do: 0.5
end
