defmodule Mix.Tasks.Opensentience.Audit.Tail do
  @shortdoc "Tail the OpenSentience Core audit log"
  @moduledoc """
  Tails the OpenSentience Core audit log.

  Usage:

      mix opensentience.audit.tail
      mix opensentience.audit.tail --limit 100
      mix opensentience.audit.tail --follow
      mix opensentience.audit.tail --follow --interval-ms 500

  Notes:
  - This reads from the Core SQLite database via `OpenSentience.Repo`.
  - Events are expected to be secret-free already; printing still avoids any extra enrichment.
  """

  use Mix.Task

  @default_limit 50
  @default_interval_ms 1000

  @impl true
  def run(args) do
    opts = parse_args!(args)

    ensure_core_available!()
    Mix.Task.run("app.start")

    if opts[:follow] do
      follow(opts)
    else
      tail_once(opts)
    end
  end

  defp tail_once(opts) do
    limit = opts[:limit]
    events = OpenSentience.AuditLog.tail(limit)

    events
    |> Enum.reverse()
    |> Enum.each(&print_event/1)
  end

  defp follow(opts) do
    limit = opts[:limit]
    interval_ms = opts[:interval_ms]

    # We poll by timestamp. This is intentionally simple for Phase 1.
    last_seen_at =
      case OpenSentience.AuditLog.tail(1) do
        [%{at: %DateTime{} = at}] -> at
        _ -> nil
      end

    # Print an initial tail snapshot
    tail_once(%{opts | limit: limit})

    loop_follow(last_seen_at, interval_ms)
  end

  defp loop_follow(last_seen_at, interval_ms) do
    Process.sleep(interval_ms)

    new_events =
      OpenSentience.AuditLog.list_events(
        since: last_seen_at,
        order: :at_asc,
        limit: 200
      )

    # If we used `since: last_seen_at`, we might get the last event again.
    new_events =
      case last_seen_at do
        %DateTime{} = at ->
          Enum.reject(new_events, fn e -> match?(%{at: ^at}, e) end)

        _ ->
          new_events
      end

    Enum.each(new_events, &print_event/1)

    new_last =
      case List.last(new_events) do
        %{at: %DateTime{} = at} -> at
        _ -> last_seen_at
      end

    loop_follow(new_last, interval_ms)
  end

  defp print_event(event) do
    at = event.at |> dt_to_iso8601()
    severity = normalize_optional_string(event.severity) || "info"

    actor =
      [normalize_optional_string(event.actor_type), normalize_optional_string(event.actor_id)]
      |> Enum.reject(&is_nil/1)
      |> Enum.join(":")

    subject =
      [normalize_optional_string(event.subject_type), normalize_optional_string(event.subject_id)]
      |> Enum.reject(&is_nil/1)
      |> Enum.join(":")

    correlation = normalize_optional_string(event.correlation_id)
    causation = normalize_optional_string(event.causation_id)

    header =
      [
        at,
        "[#{severity}]",
        normalize_optional_string(event.event_type) || "(missing event_type)",
        "actor=#{actor}",
        "subject=#{subject}"
      ]
      |> maybe_append("correlation_id", correlation)
      |> maybe_append("causation_id", causation)
      |> Enum.join(" ")

    Mix.shell().info(header)

    case decode_metadata_json(event.metadata_json) do
      {:ok, %{} = metadata} ->
        pretty = Jason.encode!(metadata, pretty: true)

        pretty
        |> String.split("\n")
        |> Enum.each(fn line -> Mix.shell().info("  " <> line) end)

      {:ok, other} ->
        Mix.shell().info("  metadata: " <> inspect(other))

      {:error, _reason} ->
        Mix.shell().info("  metadata_json: " <> truncate(event.metadata_json, 2000))
    end

    Mix.shell().info("")
  end

  defp maybe_append(parts, _k, nil), do: parts
  defp maybe_append(parts, k, v), do: parts ++ ["#{k}=#{v}"]

  defp dt_to_iso8601(nil), do: "(missing at)"
  defp dt_to_iso8601(%DateTime{} = dt), do: DateTime.to_iso8601(dt)

  defp decode_metadata_json(nil), do: {:ok, %{}}

  defp decode_metadata_json(json) when is_binary(json) do
    case Jason.decode(json) do
      {:ok, decoded} -> {:ok, decoded}
      {:error, reason} -> {:error, reason}
    end
  end

  defp parse_args!(args) do
    {opts, _rest, invalid} =
      OptionParser.parse(args,
        strict: [
          limit: :integer,
          follow: :boolean,
          "interval-ms": :integer
        ],
        aliases: [
          l: :limit,
          f: :follow
        ]
      )

    if invalid != [] do
      Mix.raise("Invalid arguments: #{inspect(invalid)}")
    end

    limit =
      case Keyword.get(opts, :limit, @default_limit) do
        n when is_integer(n) and n > 0 -> min(n, 500)
        _ -> @default_limit
      end

    interval_ms =
      case Keyword.get(opts, :"interval-ms", @default_interval_ms) do
        n when is_integer(n) and n > 0 -> min(n, 60_000)
        _ -> @default_interval_ms
      end

    %{
      limit: limit,
      follow: Keyword.get(opts, :follow, false) == true,
      interval_ms: interval_ms
    }
  end

  defp ensure_core_available! do
    unless Code.ensure_loaded?(OpenSentience.AuditLog) do
      Mix.raise("""
      OpenSentience Core modules are not available.

      Ensure you are running this task inside the OpenSentience Core Mix project
      and that dependencies compile successfully.
      """)
    end

    unless Code.ensure_loaded?(OpenSentience.Repo) do
      Mix.raise("""
      OpenSentience.Repo is not available.

      Ensure the Core storage layer is implemented and compiled.
      """)
    end
  end

  defp normalize_optional_string(nil), do: nil

  defp normalize_optional_string(v) when is_binary(v) do
    v = String.trim(v)
    if v == "", do: nil, else: v
  end

  defp normalize_optional_string(v), do: v |> to_string() |> normalize_optional_string()

  defp truncate(nil, _max), do: ""

  defp truncate(str, max) when is_binary(str) and is_integer(max) and max >= 0 do
    if String.length(str) <= max, do: str, else: String.slice(str, 0, max)
  end
end
