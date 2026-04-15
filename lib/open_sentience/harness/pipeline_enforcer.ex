defmodule OpenSentience.Harness.PipelineEnforcer do
  @moduledoc """
  OS-008 Pipeline stage enforcement.

  Tracks which pipeline stages have completed in the current session and
  blocks tool calls whose prerequisites have not been met. Read operations
  are always allowed; write operations require prior retrieval.

  ## Prerequisite rules

  | Tool call                | Must complete first               |
  |--------------------------|-----------------------------------|
  | Any write tool           | `retrieve_context`                |
  | `deliberate`             | `topology_analyze`                |
  | `execute_action`         | `coverage_query`                  |
  | `learn_from_outcome`     | `execute_action`                  |
  | Session complete         | `store_node`                      |
  | Sprint advance           | quality gate pass                 |

  ## Pipeline stages

  Reactive: `:idle → :retrieving → :analyzing → :deliberating → :acting → :storing`
  Proactive: `:surveying → :triaging → :dispatching → :storing`

  The enforcer is lenient on read operations — retrieval, query, stats,
  and traversal tools never require prerequisites.
  """

  use GenServer

  require Logger

  alias OpenSentience.Harness.AuditEntry
  alias OpenSentience.Harness.Telemetry

  # -- Tool classification --

  @write_tools [
    :store_node,
    :store_edge,
    :learn_from_outcome,
    :learn_from_feedback,
    :learn_from_interaction
  ]

  @read_tools [
    :retrieve_context,
    :retrieve_episodic,
    :retrieve_procedural,
    :query_graph,
    :graph_stats,
    :graph_traverse,
    :topology_analyze,
    :coverage_query,
    :attention_survey,
    :attention_run_cycle,
    :run_consolidation,
    :learn_detect_novelty
  ]

  # -- Prerequisite definitions --

  @prerequisites [
    {{:any, :write}, [{:completed, :retrieve_context}]},
    {{:call, :deliberate}, [{:completed, :topology_analyze}]},
    {{:call, :execute_action}, [{:completed, :coverage_query}]},
    {{:call, :learn_from_outcome}, [{:completed, :execute_action}]},
    {{:session, :complete}, [{:completed, :store_node}]},
    {{:sprint, :advance}, [{:completed, :quality_gate, result: :pass}]}
  ]

  # -- Pipeline stage definitions --

  @reactive_stages [:idle, :retrieving, :analyzing, :deliberating, :acting, :storing]
  @proactive_stages [:surveying, :triaging, :dispatching, :storing]

  @type stage_key :: atom()
  @type completion_entry :: %{stage: stage_key(), completed_at: DateTime.t(), metadata: map()}

  @type state :: %{
          session_id: binary(),
          workspace_id: binary() | nil,
          current_stage: stage_key(),
          pipeline_type: :reactive | :proactive | nil,
          completed_stages: %{stage_key() => completion_entry()},
          audit_log: [AuditEntry.t()],
          violations: non_neg_integer()
        }

  ## Public API

  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opts \\ []) do
    name = Keyword.get(opts, :name)
    GenServer.start_link(__MODULE__, opts, name: name)
  end

  @doc """
  Checks whether all prerequisites for `tool_name` are satisfied.

  Returns `:ok` if the tool may proceed, or `{:block, reason, missing_stages}`
  if prerequisites are missing.
  """
  @spec check_prerequisites(GenServer.server(), atom()) ::
          :ok | {:block, binary(), [atom()]}
  def check_prerequisites(server, tool_name) do
    GenServer.call(server, {:check_prerequisites, tool_name})
  end

  @doc """
  Records that a pipeline stage has completed.
  """
  @spec record_completion(GenServer.server(), atom(), map()) :: :ok
  def record_completion(server, stage, metadata \\ %{}) do
    GenServer.call(server, {:record_completion, stage, metadata})
  end

  @doc """
  Checks a session-level or sprint-level prerequisite.

  Used for `:session_complete` and `:sprint_advance` checks which are not
  triggered by individual tool calls.
  """
  @spec check_lifecycle(GenServer.server(), {:session | :sprint, atom()}) ::
          :ok | {:block, binary(), [atom()]}
  def check_lifecycle(server, lifecycle_key) do
    GenServer.call(server, {:check_lifecycle, lifecycle_key})
  end

  @doc """
  Resets all session state — clears completed stages and audit log.
  """
  @spec reset(GenServer.server()) :: :ok
  def reset(server) do
    GenServer.call(server, :reset)
  end

  @doc """
  Returns the current audit log (oldest first).
  """
  @spec audit_log(GenServer.server()) :: [AuditEntry.t()]
  def audit_log(server) do
    GenServer.call(server, :audit_log)
  end

  @doc """
  Returns the set of completed stages.
  """
  @spec completed_stages(GenServer.server()) :: %{atom() => completion_entry()}
  def completed_stages(server) do
    GenServer.call(server, :completed_stages)
  end

  @doc """
  Returns the current pipeline stage.
  """
  @spec current_stage(GenServer.server()) :: stage_key()
  def current_stage(server) do
    GenServer.call(server, :current_stage)
  end

  @doc """
  Returns the list of valid reactive pipeline stages.
  """
  @spec reactive_stages() :: [atom()]
  def reactive_stages, do: @reactive_stages

  @doc """
  Returns the list of valid proactive pipeline stages.
  """
  @spec proactive_stages() :: [atom()]
  def proactive_stages, do: @proactive_stages

  ## GenServer callbacks

  @impl true
  def init(opts) do
    session_id = Keyword.get(opts, :session_id, generate_session_id())
    workspace_id = Keyword.get(opts, :workspace_id)

    {:ok,
     %{
       session_id: session_id,
       workspace_id: workspace_id,
       current_stage: :idle,
       pipeline_type: nil,
       completed_stages: %{},
       audit_log: [],
       violations: 0
     }}
  end

  @impl true
  def handle_call({:check_prerequisites, tool_name}, _from, state) do
    case do_check(tool_name, state.completed_stages) do
      :ok ->
        {:reply, :ok, state}

      {:block, reason, missing} ->
        entry =
          AuditEntry.new(:pipeline_stage_blocked, state.session_id,
            tool_name: tool_name,
            workspace_id: state.workspace_id,
            metadata: %{reason: reason, missing_stages: missing}
          )

        Telemetry.stage_blocked(state.session_id, tool_name, missing)

        Logger.warning("[OS-008] Blocked #{tool_name}: #{reason} (missing: #{inspect(missing)})")

        state = %{
          state
          | audit_log: [entry | state.audit_log],
            violations: state.violations + 1
        }

        {:reply, {:block, reason, missing}, state}
    end
  end

  @impl true
  def handle_call({:record_completion, stage, metadata}, _from, state) do
    entry =
      AuditEntry.new(:pipeline_stage_completed, state.session_id,
        tool_name: stage,
        workspace_id: state.workspace_id,
        metadata: metadata
      )

    completion = %{
      stage: stage,
      completed_at: DateTime.utc_now(),
      metadata: metadata
    }

    new_stages = Map.put(state.completed_stages, stage, completion)

    Telemetry.stage_completed(state.session_id, stage, metadata)

    Logger.debug("[OS-008] Stage completed: #{stage}")

    new_stage = advance_stage(state.current_stage, stage, state.pipeline_type)

    {:reply, :ok,
     %{
       state
       | completed_stages: new_stages,
         audit_log: [entry | state.audit_log],
         current_stage: new_stage
     }}
  end

  @impl true
  def handle_call({:check_lifecycle, lifecycle_key}, _from, state) do
    missing = collect_lifecycle_missing(lifecycle_key, state.completed_stages)

    if missing == [] do
      {:reply, :ok, state}
    else
      reason = "Lifecycle prerequisites not met for #{inspect(lifecycle_key)}"
      {:reply, {:block, reason, missing}, state}
    end
  end

  @impl true
  def handle_call(:reset, _from, state) do
    {:reply, :ok,
     %{
       state
       | completed_stages: %{},
         audit_log: [],
         current_stage: :idle,
         pipeline_type: nil,
         violations: 0
     }}
  end

  @impl true
  def handle_call(:audit_log, _from, state) do
    {:reply, Enum.reverse(state.audit_log), state}
  end

  @impl true
  def handle_call(:completed_stages, _from, state) do
    {:reply, state.completed_stages, state}
  end

  @impl true
  def handle_call(:current_stage, _from, state) do
    {:reply, state.current_stage, state}
  end

  ## Internal logic

  defp do_check(tool_name, completed) do
    if read_tool?(tool_name) do
      :ok
    else
      missing = collect_missing(tool_name, completed)

      if missing == [] do
        :ok
      else
        reason = "Prerequisites not met for #{tool_name}"
        {:block, reason, missing}
      end
    end
  end

  defp collect_missing(tool_name, completed) do
    @prerequisites
    |> Enum.filter(fn {match_key, _reqs} -> matches_tool?(match_key, tool_name) end)
    |> Enum.flat_map(fn {_key, reqs} -> reqs end)
    |> Enum.reject(fn req -> requirement_met?(req, completed) end)
    |> Enum.map(&requirement_stage/1)
    |> Enum.uniq()
  end

  defp collect_lifecycle_missing(lifecycle_key, completed) do
    @prerequisites
    |> Enum.filter(fn {match_key, _reqs} -> match_key == lifecycle_key end)
    |> Enum.flat_map(fn {_key, reqs} -> reqs end)
    |> Enum.reject(fn req -> requirement_met?(req, completed) end)
    |> Enum.map(&requirement_stage/1)
    |> Enum.uniq()
  end

  defp matches_tool?({:call, name}, tool_name), do: name == tool_name
  defp matches_tool?({:any, :write}, tool_name), do: write_tool?(tool_name)
  defp matches_tool?({:session, _}, _tool_name), do: false
  defp matches_tool?({:sprint, _}, _tool_name), do: false

  defp requirement_met?({:completed, stage}, completed), do: Map.has_key?(completed, stage)

  defp requirement_met?({:completed, stage, opts}, completed) do
    case Map.get(completed, stage) do
      nil ->
        false

      entry ->
        Enum.all?(opts, fn {k, v} -> Map.get(entry.metadata, k) == v end)
    end
  end

  defp requirement_stage({:completed, stage}), do: stage
  defp requirement_stage({:completed, stage, _opts}), do: stage

  defp write_tool?(name), do: name in @write_tools
  defp read_tool?(name), do: name in @read_tools

  defp advance_stage(current, completed_stage, _pipeline_type) do
    # Map tool completions to pipeline stage transitions
    case completed_stage do
      :retrieve_context -> :analyzing
      :topology_analyze -> :deliberating
      :deliberate -> :acting
      :coverage_query -> :acting
      :execute_action -> :storing
      :store_node -> :idle
      :attention_survey -> :triaging
      :attention_run_cycle -> :dispatching
      _ -> current
    end
  end

  defp generate_session_id do
    :crypto.strong_rand_bytes(8) |> Base.url_encode64(padding: false)
  end
end
