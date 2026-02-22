defmodule Mix.Tasks.Opensentience.Agents.Stop do
  @shortdoc "Stop an agent by calling the local admin server over HTTP (token + CSRF)"

  @moduledoc """
  Stops an agent by calling the running OpenSentience Core admin server over HTTP.

  This task is intentionally an **HTTP client** (it does not try to run/host Core).
  Core must already be running (e.g. `mix run --no-halt` in `opensentience.org/core`).

  Security posture (Phase 1):
  - localhost-only admin server
  - state-changing actions require **admin token** + **CSRF** (session cookie)

  This task performs the required flow:
  1) GET  /api/csrf
  2) POST /api/login (token + csrf + cookie)
  3) POST /agents/:id/stop (csrf + cookie)

  Usage:

      mix opensentience.agents.stop com.example.agent
      mix opensentience.agents.stop com.example.agent --json

  Options:
    --admin-url URL           Base URL (default: env OPENSENTIENCE_ADMIN_URL or http://127.0.0.1:6767)
    --token TOKEN             Admin token (default: env OPENSENTIENCE_ADMIN_TOKEN or token file)
    --connect-timeout-ms MS   Connect timeout in ms (default: 2000)
    --timeout-ms MS           Request timeout in ms (default: 15000)
    --correlation-id ID       Optional correlation id (for audit linkage)
    --causation-id ID         Optional causation id (for audit linkage)
    --json                    Output JSON (for scripting)
    -h, --help                Show this help

  Notes:
  - The admin token is a secret; this task never prints it.
  - If you omit `--token`, it will read `OPENSENTIENCE_ADMIN_TOKEN` or the default token file
    (typically `~/.opensentience/state/admin.token`).
  """

  use Mix.Task

  @impl true
  def run(args) do
    {opts, rest, invalid} =
      OptionParser.parse(args,
        strict: [
          "admin-url": :string,
          token: :string,
          "connect-timeout-ms": :integer,
          "timeout-ms": :integer,
          "correlation-id": :string,
          "causation-id": :string,
          json: :boolean,
          help: :boolean
        ],
        aliases: [h: :help]
      )

    if opts[:help] do
      Mix.shell().info(@moduledoc)
      exit({:shutdown, 0})
    end

    if invalid != [] do
      Mix.raise("Invalid options: #{inspect(invalid)}")
    end

    agent_id =
      case rest do
        [id] -> id |> to_string() |> String.trim()
        _ -> Mix.raise("Usage: mix opensentience.agents.stop <agent_id> [options]")
      end

    if agent_id == "" do
      Mix.raise("agent_id must be non-empty")
    end

    http_opts =
      []
      |> maybe_put(:base_url, normalize_optional(opts[:"admin-url"]))
      |> maybe_put(:token, normalize_optional(opts[:token]))
      |> maybe_put(:connect_timeout_ms, normalize_nonneg_int(opts[:"connect-timeout-ms"]))
      |> maybe_put(:timeout_ms, normalize_nonneg_int(opts[:"timeout-ms"]))
      |> Keyword.put(:correlation_id, normalize_optional(opts[:"correlation-id"]))
      |> Keyword.put(:causation_id, normalize_optional(opts[:"causation-id"]))

    case OpenSentience.AdminHTTP.stop_agent(agent_id, http_opts) do
      :ok ->
        if opts[:json] do
          Mix.shell().info(
            Jason.encode!(%{ok: true, result: %{agent_id: agent_id}}, pretty: true)
          )
        else
          Mix.shell().info("Stop requested for agent: #{agent_id}")
        end

      {:error, %{} = err} ->
        if opts[:json] do
          Mix.shell().error(Jason.encode!(%{ok: false, error: err}, pretty: true))
        else
          Mix.shell().error("Stop failed: " <> (err[:message] || inspect(err)))
          if err[:code], do: Mix.shell().error("  code: #{err[:code]}")

          if is_map(err[:details]) and map_size(err[:details]) > 0 do
            Mix.shell().error("  details: " <> Jason.encode!(err[:details]))
          end
        end

        Mix.raise("Stop failed")
    end
  end

  defp maybe_put(opts, _k, nil), do: opts
  defp maybe_put(opts, _k, ""), do: opts
  defp maybe_put(opts, k, v), do: Keyword.put(opts, k, v)

  defp normalize_optional(nil), do: nil

  defp normalize_optional(v) when is_binary(v) do
    v = String.trim(v)
    if v == "", do: nil, else: v
  end

  defp normalize_optional(v), do: v |> to_string() |> normalize_optional()

  defp normalize_nonneg_int(nil), do: nil
  defp normalize_nonneg_int(v) when is_integer(v) and v >= 0, do: v
  defp normalize_nonneg_int(_), do: nil
end
