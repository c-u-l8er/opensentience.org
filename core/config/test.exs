import Config

# Keep test output readable; bump to :debug while developing specific failures.
config :logger, level: :warning

# SQLite-backed durable storage for Phase 1 primitives (catalog/approvals/runs/audit).
# Use a file DB (not :memory:) so multiple connections can see the same schema/state.
config :opensentience_core, OpenSentience.Repo,
  database: Path.expand("../tmp/opensentience_core_test.sqlite3", __DIR__),
  pool: Ecto.Adapters.SQL.Sandbox,
  pool_size: 5

config :opensentience_core,
  ecto_repos: [OpenSentience.Repo],

  # Test-local OpenSentience home directory (never write to real ~/.opensentience in tests).
  opensentience_home: Path.expand("../tmp/opensentience_home_test", __DIR__),

  # Default to no scan roots in tests; individual tests can override.
  scan_roots: [],

  # Admin UI should not bind a real port during tests unless explicitly requested.
  web: [
    bind: "127.0.0.1",
    port: 0,
    server: false
  ]
