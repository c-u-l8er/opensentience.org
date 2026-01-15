defmodule OpenSentience.MixProject do
  use Mix.Project

  def project do
    [
      app: :opensentience_acp,
      version: "0.1.0",
      elixir: "~> 1.15",
      start_permanent: Mix.env() == :prod,
      deps: deps(),

      # Build as a standalone CLI executable (for Zed external agents / ACP).
      escript: [
        main_module: OpenSentience.CLI,
        name: "opensentience"
      ],
      description: "OpenSentience ACP agent CLI for Zed (stdio JSON-RPC).",
      source_url: "https://opensentience.org",
      homepage_url: "https://opensentience.org"
    ]
  end

  def cli do
    [preferred_envs: [test: :test]]
  end

  def application do
    [
      mod: {OpenSentience.Application, []},
      extra_applications: [:logger]
    ]
  end

  defp deps do
    [
      # JSON encoding/decoding for ACP's JSON-RPC 2.0 messages
      {:jason, "~> 1.4"},

      # HTTP client for calling OpenRouter (OpenAI-compatible API)
      {:req, "~> 0.5"}
    ]
  end
end
