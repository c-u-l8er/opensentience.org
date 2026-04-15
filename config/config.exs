import Config

config :open_sentience,
  # Context compaction threshold (fraction of max context tokens)
  compaction_threshold: 0.55,
  # Tool results above this token count get offloaded to filesystem
  overflow_threshold: 20_000

import_config "#{config_env()}.exs"
