defmodule OpenSentience.Core.MixProject do
  use Mix.Project

  def project do
    [
      app: :opensentience_core,
      version: "0.1.0",
      elixir: "~> 1.15",
      start_permanent: Mix.env() == :prod,
      elixirc_paths: elixirc_paths(Mix.env()),
      deps: deps(),
      description:
        "OpenSentience Core MVP (catalog, discovery, enablement, audit log, launcher, admin UI scaffold).",
      source_url: "https://opensentience.org",
      homepage_url: "https://opensentience.org"
    ]
  end

  def application do
    [
      mod: {OpenSentience.Application, []},
      extra_applications: [:logger, :crypto, :ssl]
    ]
  end

  defp elixirc_paths(:test), do: ["lib", "test/support"]
  defp elixirc_paths(_), do: ["lib"]

  defp deps do
    [
      # JSON encoding/decoding for manifests + audit metadata
      {:jason, "~> 1.4"},

      # Options validation for CLI/Core APIs
      {:nimble_options, "~> 1.1"},

      # SQLite-backed durable storage (catalog, approvals, runs, audit)
      {:ecto_sql, "~> 3.11"},
      {:ecto_sqlite3, "~> 0.15"},

      # Minimal HTTP surface for Phase 1 admin UI skeleton (localhost-only)
      {:plug_cowboy, "~> 2.7"}
    ]
  end
end
