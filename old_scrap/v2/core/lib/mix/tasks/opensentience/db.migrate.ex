defmodule Mix.Tasks.Opensentience.Db.Migrate do
  @shortdoc "Runs OpenSentience Core database migrations"

  @moduledoc """
  Runs Ecto migrations for OpenSentience Core (SQLite-backed).

  By default, this runs all pending migrations for the configured repos.

  ## Usage

      mix opensentience.db.migrate
      mix opensentience.db.migrate --step 1
      mix opensentience.db.migrate --to 20260116000000

  ## Options

    * `--all` (default) - Run all pending migrations
    * `--step N` - Run N migrations (positive integer)
    * `--to VERSION` - Migrate up to VERSION (integer)
    * `--quiet` - Reduce output

  Notes:
  - This task starts the application to ensure runtime config is loaded.
  - Migrations are expected under `priv/repo/migrations`.
  """

  use Mix.Task

  @switches [
    all: :boolean,
    step: :integer,
    to: :integer,
    quiet: :boolean
  ]

  @impl true
  def run(args) do
    {opts, _rest, invalid} = OptionParser.parse(args, switches: @switches)

    if invalid != [] do
      Mix.raise("Invalid options: #{inspect(invalid)}")
    end

    # Ensure config (including runtime.exs) and Repo are available.
    Mix.Task.run("app.start")

    repos = Application.get_env(:opensentience_core, :ecto_repos, [OpenSentience.Repo])

    Enum.each(List.wrap(repos), fn repo ->
      ensure_repo_started!(repo)
      run_migrations!(repo, opts)
    end)
  end

  defp run_migrations!(repo, opts) do
    migrations_path = migrations_path!()

    unless opts[:quiet] do
      Mix.shell().info("Running migrations for #{inspect(repo)}")
      Mix.shell().info("Migrations path: #{migrations_path}")
    end

    run_opts =
      cond do
        is_integer(opts[:to]) ->
          [to: opts[:to]]

        is_integer(opts[:step]) ->
          if opts[:step] <= 0 do
            Mix.raise("--step must be a positive integer")
          end

          [step: opts[:step]]

        true ->
          [all: true]
      end

    applied = Ecto.Migrator.run(repo, migrations_path, :up, run_opts)

    unless opts[:quiet] do
      case applied do
        [] ->
          Mix.shell().info("No pending migrations.")

        versions when is_list(versions) ->
          Mix.shell().info(
            "Applied migrations: #{Enum.join(Enum.map(versions, &to_string/1), ", ")}"
          )
      end
    end
  end

  defp migrations_path! do
    # Prefer running from the core project root, but fall back to app_dir if needed.
    cwd = File.cwd!()
    from_cwd = Path.join([cwd, "priv", "repo", "migrations"])

    cond do
      File.dir?(from_cwd) ->
        from_cwd

      true ->
        from_app = Application.app_dir(:opensentience_core, "priv/repo/migrations")

        if File.dir?(from_app) do
          from_app
        else
          Mix.raise("""
          Could not find migrations directory.

          Looked in:
          - #{from_cwd}
          - #{from_app}
          """)
        end
    end
  end

  defp ensure_repo_started!(repo) do
    case repo.start_link() do
      {:ok, _pid} ->
        :ok

      {:error, {:already_started, _pid}} ->
        :ok

      {:error, reason} ->
        Mix.raise("Failed to start repo #{inspect(repo)}: #{inspect(reason)}")
    end
  end
end
