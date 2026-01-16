defmodule OpenSentience.Repo do
  @moduledoc """
  Ecto Repo for OpenSentience Core Phase 1 durable storage.

  Storage backend: SQLite (local file).

  Notes:
  - This repo is intended to store only durable, *secret-free* operational records:
    catalog, permission approvals, runs, audit events, and optional log indexes.
  - Any secret-bearing artifacts (e.g., admin token) must live on disk with
    restricted permissions, not in SQLite.
  """

  use Ecto.Repo,
    otp_app: :opensentience_core,
    adapter: Ecto.Adapters.SQLite3

  @impl true
  def init(_type, config) do
    config =
      case Keyword.fetch(config, :database) do
        {:ok, db_path} when is_binary(db_path) ->
          expanded = Path.expand(db_path)

          # Ensure the parent directory exists so SQLite can create/open the file.
          expanded
          |> Path.dirname()
          |> File.mkdir_p!()

          Keyword.put(config, :database, expanded)

        _ ->
          config
      end

    {:ok, config}
  end
end
