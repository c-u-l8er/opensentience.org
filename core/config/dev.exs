import Config

# Development configuration for OpenSentience Core (Phase 1).
#
# Security stance:
# - Bind admin UI to localhost only by default.
# - Token-protect state-changing operations (token generation/storage handled in code).
# - Do not persist secrets in SQLite/audit/logs.

# -----------------------------------------------------------------------------
# Logger
# -----------------------------------------------------------------------------
config :logger, level: :debug

config :logger, :console,
  device: :standard_error,
  format: "[$level] $message\n",
  metadata: [:request_id]

# -----------------------------------------------------------------------------
# Storage (SQLite via Ecto)
# -----------------------------------------------------------------------------
home = System.user_home!()

db_path =
  System.get_env("OPENSENTIENCE_DB_PATH") ||
    Path.join([home, ".opensentience", "core", "dev.sqlite3"])

config :opensentience_core, ecto_repos: [OpenSentience.Repo]

config :opensentience_core, OpenSentience.Repo,
  database: db_path,
  pool_size: 5,
  journal_mode: :wal

# -----------------------------------------------------------------------------
# Discovery roots (NO code execution during discovery)
# -----------------------------------------------------------------------------
scan_roots =
  case System.get_env("OPENSENTIENCE_SCAN_ROOTS") do
    nil ->
      [
        Path.join(home, "Projects"),
        Path.join([home, ".opensentience", "agents"])
      ]

    "" ->
      [
        Path.join(home, "Projects"),
        Path.join([home, ".opensentience", "agents"])
      ]

    raw ->
      raw
      |> String.split(",", trim: true)
      |> Enum.map(&String.trim/1)
      |> Enum.reject(&(&1 == ""))
      |> Enum.map(&Path.expand/1)
  end

# -----------------------------------------------------------------------------
# Core app configuration
# -----------------------------------------------------------------------------
config :opensentience_core,
  scan_roots: scan_roots,
  agents_dir: Path.join([home, ".opensentience", "agents"]),
  logs_dir: Path.join([home, ".opensentience", "logs"]),
  admin_token_path: Path.join([home, ".opensentience", "core", "admin.token"])

# -----------------------------------------------------------------------------
# Admin UI (Plug/Cowboy) (localhost-only)
# -----------------------------------------------------------------------------
port =
  System.get_env("OPENSENTIENCE_WEB_PORT") ||
    System.get_env("OPENSENTIENCE_PORT") ||
    "6767"

port = String.to_integer(port)

config :opensentience_core, :web,
  ip: {127, 0, 0, 1},
  port: port,
  server: true,
  require_token: true
