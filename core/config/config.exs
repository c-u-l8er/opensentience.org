import Config

# Core state directory (durable, secret-bearing files live under here).
# Override with OPENSENTIENCE_HOME if you want to relocate Core state.
state_dir =
  System.get_env("OPENSENTIENCE_HOME") ||
    Path.join(System.user_home!(), ".opensentience")

state_dir = Path.expand(state_dir)

# Default scan roots for discovery (NO code execution during discovery).
default_scan_roots = [
  Path.join(System.user_home!(), "Projects"),
  Path.join(state_dir, "agents")
]

config :opensentience_core,
  state_dir: state_dir,
  scan_roots: default_scan_roots,
  launcher: [
    agents_dir: Path.join(state_dir, "agents"),
    logs_dir: Path.join(state_dir, "logs")
  ],
  web: [
    # Phase 1 requirement: localhost-only by default.
    ip: {127, 0, 0, 1},
    port: 6767,
    # State-changing UI actions must be token-gated in Phase 1.
    require_token: true,
    token_path: Path.join(state_dir, "admin_token")
  ]

# Ecto / SQLite storage for Phase 1 durable state:
# - agents
# - permission_approvals
# - runs
# - audit_events
config :opensentience_core,
  ecto_repos: [OpenSentience.Repo]

config :opensentience_core, OpenSentience.Repo,
  database: Path.join(state_dir, "core.sqlite3"),
  pool_size: 5,
  # Reasonable durability/perf defaults for local SQLite usage.
  journal_mode: :wal,
  temp_store: :memory

# Keep stdout clean for any future stdio protocol work; log to stderr via Logger.
config :logger, :console,
  level: :info,
  format: "[$level] $message\n"

# Load environment-specific config last (dev/test/prod).
import_config "#{config_env()}.exs"
