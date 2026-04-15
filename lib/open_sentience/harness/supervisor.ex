defmodule OpenSentience.Harness.Supervisor do
  @moduledoc """
  DynamicSupervisor for OS-008 harness sessions.

  Manages the lifecycle of Session processes — one per active orchestrated task.
  Sessions are independent and concurrent.
  """

  use DynamicSupervisor

  alias OpenSentience.Harness.Session

  @spec start_link(keyword()) :: Supervisor.on_start()
  def start_link(opts \\ []) do
    name = Keyword.get(opts, :name, __MODULE__)
    DynamicSupervisor.start_link(__MODULE__, opts, name: name)
  end

  @impl true
  def init(_opts) do
    DynamicSupervisor.init(strategy: :one_for_one)
  end

  @doc """
  Starts a new harness session under this supervisor.

  ## Options

    * `:session_id` — identifier (auto-generated if omitted)
    * `:workspace_id` — workspace scope (required for multi-tenant)
    * `:user_id` — who/what started the session
    * `:agent_id` — which agent is being orchestrated
    * `:goal_id` — Delegatic goal ID
    * `:autonomy_level` — `:observe`, `:advise`, or `:act`
    * `:model_tier` — `:local_small`, `:local_large`, or `:cloud_frontier`

  """
  @spec start_session(keyword()) :: DynamicSupervisor.on_start_child()
  def start_session(opts \\ []) do
    child_spec = {Session, opts}
    DynamicSupervisor.start_child(__MODULE__, child_spec)
  end

  @doc """
  Terminates a harness session by its pid.
  """
  @spec stop_session(pid()) :: :ok | {:error, :not_found}
  def stop_session(pid) when is_pid(pid) do
    DynamicSupervisor.terminate_child(__MODULE__, pid)
  end

  @doc """
  Returns the count of active sessions.
  """
  @spec active_count() :: non_neg_integer()
  def active_count do
    DynamicSupervisor.count_children(__MODULE__).active
  end
end
