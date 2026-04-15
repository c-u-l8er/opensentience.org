defmodule OpenSentience.Harness.Session do
  @moduledoc """
  Session GenServer — supervises one orchestrated task.

  Each session owns a PipelineEnforcer and holds workspace-scoped identity.
  Sessions are started by `Harness.Supervisor` and run concurrently.

  ## Workspace Scoping

  Every session is scoped to a workspace (section 14.1):
  - PipelineEnforcer only allows retrieval from workspace-scoped data
  - Audit trail entries include `workspace_id` for multi-tenant compliance
  - Subagent delegation inherits parent session's workspace scope
  """

  use GenServer

  require Logger

  alias OpenSentience.Harness.AuditEntry
  alias OpenSentience.Harness.PipelineEnforcer
  alias OpenSentience.Harness.Telemetry

  @type autonomy :: :observe | :advise | :act
  @type model_tier :: :local_small | :local_large | :cloud_frontier

  @type t :: %{
          session_id: binary(),
          workspace_id: binary() | nil,
          user_id: binary() | nil,
          agent_id: binary() | nil,
          goal_id: binary() | nil,
          autonomy_level: autonomy(),
          model_tier: model_tier(),
          started_at: DateTime.t(),
          enforcer: pid() | nil,
          status: :active | :completed | :escalated | :failed
        }

  ## Public API

  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opts) do
    session_id = Keyword.get(opts, :session_id, generate_id())
    opts = Keyword.put(opts, :session_id, session_id)
    name = Keyword.get(opts, :name, via_name(session_id))
    GenServer.start_link(__MODULE__, opts, name: name)
  end

  @doc """
  Returns the session status and metadata.
  """
  @spec status(GenServer.server()) :: map()
  def status(server) do
    GenServer.call(server, :status)
  end

  @doc """
  Checks prerequisites for a tool call within this session.
  Delegates to the session's PipelineEnforcer.
  """
  @spec check_prerequisites(GenServer.server(), atom()) ::
          :ok | {:block, binary(), [atom()]}
  def check_prerequisites(server, tool_name) do
    GenServer.call(server, {:check_prerequisites, tool_name})
  end

  @doc """
  Records a pipeline stage completion within this session.
  """
  @spec record_completion(GenServer.server(), atom(), map()) :: :ok
  def record_completion(server, stage, metadata \\ %{}) do
    GenServer.call(server, {:record_completion, stage, metadata})
  end

  @doc """
  Checks a lifecycle prerequisite (session complete, sprint advance).
  """
  @spec check_lifecycle(GenServer.server(), {:session | :sprint, atom()}) ::
          :ok | {:block, binary(), [atom()]}
  def check_lifecycle(server, lifecycle_key) do
    GenServer.call(server, {:check_lifecycle, lifecycle_key})
  end

  @doc """
  Returns the session's audit log.
  """
  @spec audit_log(GenServer.server()) :: [AuditEntry.t()]
  def audit_log(server) do
    GenServer.call(server, :audit_log)
  end

  def child_spec(opts) do
    id = Keyword.get(opts, :session_id, :erlang.unique_integer())

    %{
      id: {__MODULE__, id},
      start: {__MODULE__, :start_link, [opts]},
      restart: :temporary
    }
  end

  ## GenServer callbacks

  @impl true
  def init(opts) do
    session_id = Keyword.fetch!(opts, :session_id)

    # Start the PipelineEnforcer as a linked process
    enforcer_opts = [
      session_id: session_id,
      workspace_id: Keyword.get(opts, :workspace_id)
    ]

    {:ok, enforcer_pid} = PipelineEnforcer.start_link(enforcer_opts)

    state = %{
      session_id: session_id,
      workspace_id: Keyword.get(opts, :workspace_id),
      user_id: Keyword.get(opts, :user_id),
      agent_id: Keyword.get(opts, :agent_id),
      goal_id: Keyword.get(opts, :goal_id),
      autonomy_level: Keyword.get(opts, :autonomy_level, :act),
      model_tier: Keyword.get(opts, :model_tier, :cloud_frontier),
      started_at: DateTime.utc_now(),
      enforcer: enforcer_pid,
      status: :active
    }

    Telemetry.session_event(:start, session_id, %{
      workspace_id: state.workspace_id,
      model_tier: state.model_tier
    })

    Logger.info("[OS-008] Session started: #{session_id}")

    {:ok, state}
  end

  @impl true
  def handle_call(:status, _from, state) do
    reply = %{
      session_id: state.session_id,
      workspace_id: state.workspace_id,
      agent_id: state.agent_id,
      goal_id: state.goal_id,
      autonomy_level: state.autonomy_level,
      model_tier: state.model_tier,
      status: state.status,
      started_at: state.started_at
    }

    {:reply, reply, state}
  end

  @impl true
  def handle_call({:check_prerequisites, tool_name}, _from, state) do
    result = PipelineEnforcer.check_prerequisites(state.enforcer, tool_name)
    {:reply, result, state}
  end

  @impl true
  def handle_call({:record_completion, stage, metadata}, _from, state) do
    result = PipelineEnforcer.record_completion(state.enforcer, stage, metadata)
    {:reply, result, state}
  end

  @impl true
  def handle_call({:check_lifecycle, lifecycle_key}, _from, state) do
    result = PipelineEnforcer.check_lifecycle(state.enforcer, lifecycle_key)
    {:reply, result, state}
  end

  @impl true
  def handle_call(:audit_log, _from, state) do
    log = PipelineEnforcer.audit_log(state.enforcer)
    {:reply, log, state}
  end

  @impl true
  def terminate(reason, state) do
    Telemetry.session_event(:stop, state.session_id, %{reason: reason})
    Logger.info("[OS-008] Session stopped: #{state.session_id} (#{inspect(reason)})")
    :ok
  end

  ## Internal

  defp generate_id do
    :crypto.strong_rand_bytes(8) |> Base.url_encode64(padding: false)
  end

  defp via_name(session_id) do
    {:via, Registry, {OpenSentience.Harness.Registry, session_id}}
  end
end
