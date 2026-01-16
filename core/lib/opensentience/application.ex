defmodule OpenSentience.Application do
  @moduledoc """
  OpenSentience Core application supervision tree.

  Phase 1 focus:
  - durable local storage (Repo)
  - discovery/indexing (no code execution)
  - install/build/enable/run lifecycle (explicit trust boundary)
  - durable audit log
  - minimal localhost-only admin UI skeleton (optional, token-gated)

  This module is intentionally defensive about optional children: it only starts
  components when they are both enabled in config and implemented in the codebase.
  """

  use Application

  require Logger

  @impl true
  def start(_type, _args) do
    children =
      []
      |> with_repo()
      |> with_task_supervisor()
      |> with_optional(:discovery, OpenSentience.Discovery, [])
      |> with_optional(:launcher, OpenSentience.Launcher.Supervisor, [])
      |> with_optional_web_server()

    opts = [strategy: :one_for_one, name: OpenSentience.Supervisor]

    Logger.info("OpenSentience Core starting (children=#{length(children)})")

    Supervisor.start_link(children, opts)
  end

  defp with_repo(children) do
    # Repo is expected to exist for Phase 1 durability; if it doesn't yet,
    # we don't crash-start here, but you should implement `OpenSentience.Repo`
    # before trying to boot the application.
    if Code.ensure_loaded?(OpenSentience.Repo) do
      children ++ [OpenSentience.Repo]
    else
      Logger.warning("Repo module not available; skipping OpenSentience.Repo child")
      children
    end
  end

  defp with_task_supervisor(children) do
    children ++ [{Task.Supervisor, name: OpenSentience.TaskSupervisor}]
  end

  defp with_optional(children, cfg_key, module, arg) do
    enabled? =
      :opensentience_core
      |> Application.get_env(cfg_key, true)
      |> truthy?()

    if enabled? and Code.ensure_loaded?(module) do
      children ++ [{module, arg}]
    else
      children
    end
  end

  defp with_optional_web_server(children) do
    web_cfg = Application.get_env(:opensentience_core, :web, [])
    server? = web_cfg |> Keyword.get(:server, false) |> truthy?()

    if server? and Code.ensure_loaded?(OpenSentience.Web.Server) do
      children ++ [{OpenSentience.Web.Server, web_cfg}]
    else
      children
    end
  end

  defp truthy?(value) when value in [true, "true", "1", 1], do: true
  defp truthy?(_), do: false
end
