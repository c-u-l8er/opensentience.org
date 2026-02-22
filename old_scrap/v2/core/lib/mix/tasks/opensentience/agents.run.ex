defmodule Mix.Tasks.Opensentience.Agents.Run do
  @shortdoc "Run an agent by calling the local admin server over HTTP (token + CSRF)"

  @moduledoc """
  Runs an agent by making an HTTP request to a **running** OpenSentience Core admin server.

  This is intentionally implemented as an HTTP client (not a direct Core API call) so that:
  - Core can run persistently (`mix run --no-halt`, release, etc.)
  - the CLI can operate cleanly without keeping the BEAM alive after the task exits
  - Phase 1 security invariants are preserved (token + CSRF + localhost-only)

  Flow (handled internally):
  1) `GET /api/csrf` to obtain a CSRF token and session cookie
  2) `POST /api/login` with admin token + CSRF to establish an admin session
  3) `POST /agents/:id/run` under that session

  Usage:

      mix opensentience.agents.run com.example.agent
      mix opensentience.agents.run com.example.agent --json
      mix opensentience.agents.run com.example.agent --admin-url http://127.0.0.1:6767
      mix opensentience.agents.run com.example.agent --base-url http://127.0.0.1:6767
      mix opensentience.agents.run com.example.agent --token "$OPENSENTIENCE_ADMIN_TOKEN"

  Options:
    --admin-url URL           Base URL for admin server (preferred name)
    --base-url URL            Base URL for admin server (back-compat; same as --admin-url)
    --token TOKEN             Admin token (default: OPENSENTIENCE_ADMIN_TOKEN or token file under ~/.opensentience/state/admin.token)
    --connect-timeout-ms MS   TCP connect timeout (default: 2000)
    --timeout-ms MS           Request timeout (default: 15000)
    --correlation-id ID       Optional correlation id (audit linkage)
    --causation-id ID         Optional causation id (audit linkage)
    --json                    Output machine-readable JSON
    -h, --help                Show this help

  Notes:
  - This task requires Core to already be running with the admin server enabled.
  - The admin token is a secret and is never printed by this task.
  """

  use Mix.Task

  alias OpenSentience.AdminHTTP

  @impl true
  def run(args) do
    {opts, rest, invalid} =
      OptionParser.parse(args,
        strict: [
          "admin-url": :string,
          "base-url": :string,
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
        _ -> Mix.raise("Usage: mix opensentience.agents.run <agent_id> [options]")
      end

    base_url =
      normalize_optional(opts[:"admin-url"]) ||
        normalize_optional(opts[:"base-url"])

    http_opts =
      []
      |> maybe_put(:base_url, base_url)
      |> maybe_put(:token, normalize_optional(opts[:token]))
      |> maybe_put(:connect_timeout_ms, normalize_nonneg_int(opts[:"connect-timeout-ms"]))
      |> maybe_put(:timeout_ms, normalize_nonneg_int(opts[:"timeout-ms"]))
      |> maybe_put(:correlation_id, normalize_optional(opts[:"correlation-id"]))
      |> maybe_put(:causation_id, normalize_optional(opts[:"causation-id"]))

    case AdminHTTP.run_agent(agent_id, http_opts) do
      {:ok, result} ->
        if opts[:json] do
          Mix.shell().info(Jason.encode!(%{ok: true, result: result}, pretty: true))
        else
          print_pretty_success(agent_id, result)
        end

      {:error, err} ->
        if opts[:json] do
          Mix.shell().error(Jason.encode!(%{ok: false, error: err}, pretty: true))
        else
          Mix.shell().error(format_error(err))
        end

        Mix.raise("Run failed")
    end
  end

  # ----------------------------------------------------------------------------
  # Output helpers
  # ----------------------------------------------------------------------------

  defp print_pretty_success(agent_id, result) when is_map(result) do
    Mix.shell().info("Run started for #{agent_id}")

    run_id = safe_string(result["run_id"] || result[:run_id])
    os_pid = result["os_pid"] || result[:os_pid]
    log_path = safe_string(result["log_path"] || result[:log_path])

    if run_id, do: Mix.shell().info("  run_id: #{run_id}")
    if os_pid, do: Mix.shell().info("  os_pid: #{os_pid}")
    if log_path, do: Mix.shell().info("  log_path: #{log_path}")

    :ok
  end

  defp format_error(err) when is_map(err) do
    code = err[:code] || err["code"] || :error
    message = err[:message] || err["message"] || "Request failed"
    details = err[:details] || err["details"]

    base = "#{message} (code=#{code})"

    if is_map(details) and map_size(details) > 0 do
      base <> "\n  details: " <> Jason.encode!(details)
    else
      base
    end
  end

  defp format_error(other), do: "Request failed: " <> inspect(other)

  # ----------------------------------------------------------------------------
  # Small option helpers
  # ----------------------------------------------------------------------------

  defp maybe_put(list, _k, nil), do: list
  defp maybe_put(list, _k, ""), do: list
  defp maybe_put(list, k, v), do: Keyword.put(list, k, v)

  defp normalize_optional(nil), do: nil

  defp normalize_optional(v) when is_binary(v) do
    v = String.trim(v)
    if v == "", do: nil, else: v
  end

  defp normalize_optional(v), do: v |> to_string() |> normalize_optional()

  defp normalize_nonneg_int(nil), do: nil
  defp normalize_nonneg_int(v) when is_integer(v) and v >= 0, do: v

  defp normalize_nonneg_int(v) do
    case normalize_optional(v) do
      nil ->
        nil

      s ->
        case Integer.parse(s) do
          {n, ""} when n >= 0 -> n
          _ -> Mix.raise("Expected a non-negative integer, got: #{inspect(v)}")
        end
    end
  end

  defp safe_string(nil), do: nil
  defp safe_string(v) when is_binary(v), do: v
  defp safe_string(v), do: to_string(v)
end
