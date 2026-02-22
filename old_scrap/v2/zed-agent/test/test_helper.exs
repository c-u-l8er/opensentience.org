ExUnit.start(assert_receive_timeout: 1_000, refute_receive_timeout: 250)

# Keep Logger noise down in tests by default.
# Note: The agent must never write to stdout in ACP mode; logs go to stderr.
Logger.configure(level: :warning)

# Ensure the JSON library is available for tests that encode/decode messages.
Application.ensure_all_started(:jason)
