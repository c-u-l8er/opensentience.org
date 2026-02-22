defmodule OpenSentience.Launcher.Supervisor do
  @moduledoc """
  Launcher supervision tree (Phase 1).

  This supervisor intentionally provides only the minimal plumbing needed for the
  launcher runtime:

  - A `Registry` for naming/lookup (if higher-level launcher code chooses to use it)
  - A `DynamicSupervisor` for starting per-run/per-agent worker processes

  Any higher-level launcher APIs (start/stop/list) and any legacy runner modules
  are intentionally **not** defined here.
  """

  use Supervisor

  @registry OpenSentience.Launcher.Registry
  @dynsup OpenSentience.Launcher.DynamicSupervisor

  @spec child_spec(term()) :: Supervisor.child_spec()
  def child_spec(arg) do
    %{
      id: __MODULE__,
      start: {__MODULE__, :start_link, [arg]},
      type: :supervisor,
      restart: :permanent,
      shutdown: 5_000
    }
  end

  @spec start_link(term()) :: Supervisor.on_start()
  def start_link(arg \\ []) do
    Supervisor.start_link(__MODULE__, arg, name: __MODULE__)
  end

  @impl true
  def init(_arg) do
    children = [
      {Registry, keys: :unique, name: @registry},
      {DynamicSupervisor, name: @dynsup, strategy: :one_for_one}
    ]

    Supervisor.init(children, strategy: :one_for_all)
  end

  @doc false
  @spec registry_name() :: atom()
  def registry_name, do: @registry

  @doc false
  @spec dynamic_supervisor_name() :: atom()
  def dynamic_supervisor_name, do: @dynsup
end
