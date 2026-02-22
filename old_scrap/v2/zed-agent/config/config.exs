import Config

# Basic application configuration for the OpenSentience ACP agent.
#
# Notes:
# - This project is intended to be run as a CLI speaking ACP over stdio.
# - Avoid logging to stdout (ACP uses stdout for JSON-RPC messages). Prefer stderr.

config :logger,
  level: :info

# Elixir's Logger backend writes to stderr by default; ensure formatting stays compact.
config :logger, :console,
  format: "[$level] $message\n",
  metadata: [:pid]

config :opensentience_acp,
  # ACP major protocol version this agent implements.
  protocol_version: 1,

  # Identifiers reported in the ACP `initialize` response.
  agent_info: %{
    name: "opensentience",
    title: "OpenSentience",
    version: "0.1.0"
  },

  # Default behavior knobs (can be overridden by environment variables in the CLI).
  defaults: %{
    # Whether to emit verbose diagnostic logs (to stderr).
    debug: false,
    # Whether to stream agent_message_chunk updates character-by-character (vs. whole chunks).
    stream_chunks: true
  }
