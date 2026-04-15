defmodule OpenSentience.Harness do
  @moduledoc """
  Public API for the OS-008 Agent Harness Protocol.

  The harness is NOT a tool the agent calls. It is the runtime that CALLS the
  agent. It wraps agents like an OTP supervisor wraps processes — it doesn't
  do the work, it ensures the work is done correctly.

  ## Quick Start

      {:ok, pid} = OpenSentience.Harness.start_session(
        workspace_id: "ws-123",
        autonomy_level: :act,
        model_tier: :cloud_frontier
      )

      :ok = OpenSentience.Harness.check_prerequisites(pid, :store_node)
      # => {:block, "Prerequisites not met for store_node", [:retrieve_context]}

      :ok = OpenSentience.Harness.record_completion(pid, :retrieve_context)
      :ok = OpenSentience.Harness.check_prerequisites(pid, :store_node)
      # => :ok

  """

  alias OpenSentience.Harness.Coverage
  alias OpenSentience.Harness.Session
  alias OpenSentience.Harness.Supervisor, as: HarnessSupervisor

  @doc """
  Starts a new harness session.

  ## Options

    * `:session_id` — identifier (auto-generated if omitted)
    * `:workspace_id` — workspace scope (required for multi-tenant)
    * `:user_id` — who/what started the session
    * `:agent_id` — which agent is being orchestrated
    * `:goal_id` — Delegatic goal ID
    * `:autonomy_level` — `:observe`, `:advise`, or `:act` (default: `:act`)
    * `:model_tier` — `:local_small`, `:local_large`, or `:cloud_frontier` (default: `:cloud_frontier`)

  ## Returns

  `{:ok, pid}` on success.
  """
  @spec start_session(keyword()) :: {:ok, pid()} | {:error, term()}
  def start_session(opts \\ []) do
    HarnessSupervisor.start_session(opts)
  end

  @doc """
  Stops a harness session.
  """
  @spec stop_session(pid()) :: :ok | {:error, :not_found}
  def stop_session(pid) do
    HarnessSupervisor.stop_session(pid)
  end

  @doc """
  Returns the session status and metadata.
  """
  @spec session_status(GenServer.server()) :: map()
  def session_status(server) do
    Session.status(server)
  end

  @doc """
  Checks whether a tool call's prerequisites are met within a session.

  Returns `:ok` if allowed, or `{:block, reason, missing_stages}` if blocked.
  """
  @spec check_prerequisites(GenServer.server(), atom()) ::
          :ok | {:block, binary(), [atom()]}
  def check_prerequisites(server, tool_name) do
    Session.check_prerequisites(server, tool_name)
  end

  @doc """
  Records that a pipeline stage has completed within a session.
  """
  @spec record_completion(GenServer.server(), atom(), map()) :: :ok
  def record_completion(server, stage, metadata \\ %{}) do
    Session.record_completion(server, stage, metadata)
  end

  @doc """
  Checks a lifecycle prerequisite (session complete, sprint advance).
  """
  @spec check_lifecycle(GenServer.server(), {:session | :sprint, atom()}) ::
          :ok | {:block, binary(), [atom()]}
  def check_lifecycle(server, lifecycle_key) do
    Session.check_lifecycle(server, lifecycle_key)
  end

  @doc """
  Returns the session's audit log.
  """
  @spec audit_log(GenServer.server()) :: [OpenSentience.Harness.AuditEntry.t()]
  def audit_log(server) do
    Session.audit_log(server)
  end

  @doc """
  Recommends a dispatch mode based on coverage decision, κ value, and autonomy.

  This is the coverage → dispatch routing matrix (spec section 3.3).
  Pure function — does not require a session.
  """
  @spec recommend_dispatch(Coverage.coverage_decision(), number(), Coverage.autonomy(), keyword()) ::
          Coverage.dispatch_mode()
  defdelegate recommend_dispatch(decision, kappa, autonomy, opts \\ []),
    to: Coverage,
    as: :recommend

  @doc """
  Returns the count of active harness sessions.
  """
  @spec active_sessions() :: non_neg_integer()
  def active_sessions do
    HarnessSupervisor.active_count()
  end

  @doc """
  Looks up a session by its ID via the Registry.
  """
  @spec lookup_session(binary()) :: {:ok, pid()} | :error
  def lookup_session(session_id) do
    case Registry.lookup(OpenSentience.Harness.Registry, session_id) do
      [{pid, _}] -> {:ok, pid}
      [] -> :error
    end
  end
end
