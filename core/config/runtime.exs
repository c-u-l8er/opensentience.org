import Config

# OpenSentience Core runtime configuration.
#
# Phase 1 goals:
# - Durable, local-only storage paths under ~/.opensentience (or OPENSENTIENCE_HOME)
# - Web surface binds to 127.0.0.1:6767 by default (safe-by-default)
# - Configurable discovery scan roots

opensentience_home =
  System.get_env("OPENSENTIENCE_HOME") ||
    Path.join(System.user_home!(), ".opensentience")

# Normalize and ensure durable directories exist.
opensentience_home = Path.expand(opensentience_home)

agents_dir =
  System.get_env("OPENSENTIENCE_AGENTS_DIR") ||
    Path.join(opensentience_home, "agents")

logs_dir =
  System.get_env("OPENSENTIENCE_LOGS_DIR") ||
    Path.join(opensentience_home, "logs")

state_dir =
  System.get_env("OPENSENTIENCE_STATE_DIR") ||
    Path.join(opensentience_home, "state")

# Token used by the localhost admin UI for state-changing actions (Phase 1).
admin_token_path =
  System.get_env("OPENSENTIENCE_ADMIN_TOKEN_PATH") ||
    Path.join(state_dir, "admin.token")

_ = File.mkdir_p!(opensentience_home)
_ = File.mkdir_p!(agents_dir)
_ = File.mkdir_p!(logs_dir)
_ = File.mkdir_p!(state_dir)

config :opensentience_core, :paths,
  home: opensentience_home,
  agents_dir: agents_dir,
  logs_dir: logs_dir,
  state_dir: state_dir,
  admin_token_path: admin_token_path

# Discovery roots: comma-separated list of directories.
# Defaults: ~/Projects and ~/.opensentience/agents
default_scan_roots = [
  Path.join(System.user_home!(), "Projects"),
  agents_dir
]

scan_roots =
  case System.get_env("OPENSENTIENCE_SCAN_ROOTS") do
    nil ->
      default_scan_roots

    raw ->
      raw
      |> String.split(",", trim: true)
      |> Enum.map(&String.trim/1)
      |> Enum.reject(&(&1 == ""))
      |> Enum.map(&Path.expand/1)
  end

config :opensentience_core, :discovery, scan_roots: scan_roots

# SQLite durable storage (Ecto Repo)
db_path =
  System.get_env("OPENSENTIENCE_DB_PATH") ||
    Path.join(state_dir, "core.sqlite3")

config :opensentience_core, OpenSentience.Repo,
  database: Path.expand(db_path),
  pool_size: String.to_integer(System.get_env("OPENSENTIENCE_DB_POOL_SIZE", "5")),
  journal_mode: :wal,
  cache_size: -64_000

# Admin UI binding (localhost-only by default)
web_ip =
  System.get_env("OPENSENTIENCE_WEB_IP", "127.0.0.1")
  |> String.split(".", trim: true)
  |> Enum.map(&String.to_integer/1)
  |> List.to_tuple()

web_port = String.to_integer(System.get_env("OPENSENTIENCE_WEB_PORT", "6767"))

config :opensentience_core, :web,
  ip: web_ip,
  port: web_port
