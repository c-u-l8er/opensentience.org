defmodule OpenSentience.Paths do
  @moduledoc """
  Shared path helpers for OpenSentience Core durable storage locations.

  Phase 1 stores state under `~/.opensentience` by default, unless overridden via
  application config (typically via `config/runtime.exs`).

  This module is intentionally side-effect free: it computes paths but does not
  create directories. Callers that need directories should `File.mkdir_p!/1`
  explicitly at the trust boundary where they perform I/O.
  """

  @app :opensentience_core

  @doc """
  Returns the OpenSentience "home" directory (default: `~/.opensentience`).

  Preference order:
  1) `config :opensentience_core, :paths, home: ...`
  2) `config :opensentience_core, :state_dir` (legacy-ish single root)
  3) `~/.opensentience`
  """
  @spec home() :: String.t()
  def home do
    from_paths(:home) ||
      Application.get_env(@app, :state_dir) ||
      Path.join(System.user_home!(), ".opensentience")
      |> expand()
  end

  @doc """
  Directory where agents are stored (default: `~/.opensentience/agents`).
  """
  @spec agents_dir() :: String.t()
  def agents_dir do
    from_paths(:agents_dir) ||
      Application.get_env(@app, :agents_dir) ||
      get_in(Application.get_env(@app, :launcher, []), [:agents_dir]) ||
      Path.join(home(), "agents")
      |> expand()
  end

  @doc """
  Directory where launcher log capture is stored (default: `~/.opensentience/logs`).
  """
  @spec logs_dir() :: String.t()
  def logs_dir do
    from_paths(:logs_dir) ||
      Application.get_env(@app, :logs_dir) ||
      get_in(Application.get_env(@app, :launcher, []), [:logs_dir]) ||
      Path.join(home(), "logs")
      |> expand()
  end

  @doc """
  Directory where Core stores durable state (default: `~/.opensentience/state`).

  Note: some configs use `:state_dir` as the *root* (~/.opensentience). In those
  cases, prefer `home/0` and keep state under `state/`.
  """
  @spec state_dir() :: String.t()
  def state_dir do
    # If someone configured :state_dir as the root, keep a stable subdir for "state".
    from_paths(:state_dir) ||
      Path.join(home(), "state")
      |> expand()
  end

  @doc """
  Path to the admin UI token file (default: `~/.opensentience/state/admin.token`).

  Preference order:
  1) `config :opensentience_core, :paths, admin_token_path: ...`
  2) `config :opensentience_core, :admin_token_path` (dev convenience)
  3) `config :opensentience_core, :web, token_path: ...` (Phase 1 work breakdown)
  4) `~/.opensentience/state/admin.token`
  """
  @spec admin_token_path() :: String.t()
  def admin_token_path do
    from_paths(:admin_token_path) ||
      Application.get_env(@app, :admin_token_path) ||
      get_in(Application.get_env(@app, :web, []), [:token_path]) ||
      Path.join(state_dir(), "admin.token")
      |> expand()
  end

  @doc """
  Returns the configured SQLite DB path for Core, if available.

  This reads `config :opensentience_core, OpenSentience.Repo, database: ...`.

  If not configured, it falls back to `~/.opensentience/state/core.sqlite3`.
  """
  @spec db_path() :: String.t()
  def db_path do
    case Application.get_env(@app, OpenSentience.Repo) do
      repo_cfg when is_list(repo_cfg) ->
        (Keyword.get(repo_cfg, :database) || Path.join(state_dir(), "core.sqlite3"))
        |> expand()

      _ ->
        Path.join(state_dir(), "core.sqlite3")
        |> expand()
    end
  end

  defp from_paths(key) when is_atom(key) do
    case Application.get_env(@app, :paths) do
      paths when is_list(paths) -> Keyword.get(paths, key)
      paths when is_map(paths) -> Map.get(paths, key)
      _ -> nil
    end
  end

  defp expand(nil), do: nil

  defp expand(path) when is_binary(path) do
    Path.expand(path)
  end
end
