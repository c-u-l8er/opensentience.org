defmodule OpenSentience.MixProject do
  use Mix.Project

  def project do
    [
      app: :open_sentience,
      version: "0.1.0",
      elixir: "~> 1.17",
      start_permanent: Mix.env() == :prod,
      deps: deps(),
      name: "OpenSentience",
      description: "OS-008 Agent Harness Protocol — enforcement runtime for [&] ecosystem agents"
    ]
  end

  def application do
    [
      extra_applications: [:logger],
      mod: {OpenSentience.Application, []}
    ]
  end

  defp deps do
    [
      {:jason, "~> 1.4"},
      {:telemetry, "~> 1.2"}
    ]
  end
end
