defmodule Mix.Tasks.Opensentience.Agents.Scan do
  @shortdoc "Scan for opensentience.agent.json manifests and upsert the agent catalog"

  @moduledoc """
  Scans configured roots for `opensentience.agent.json` and (by default) upserts
  discovered agents into the Core catalog.

  Phase 1 invariants:
  - Discovery performs filesystem reads only (no code execution).
  - Results and errors should be actionable and secret-free.
  - Upsert is optional (`--no-upsert`).

  Usage:

      mix opensentience.agents.scan
      mix opensentience.agents.scan --roots ~/Projects,~/.opensentience/agents
      mix opensentience.agents.scan --no-upsert
      mix opensentience.agents.scan --format json

  Options:
    * `--roots`               Comma-separated list of scan roots (overrides config)
    * `--ignore-dirs`         Comma-separated directory basenames to skip (optional)
    * `--max-bytes`           Max manifest file bytes to read (default: 262144)
    * `--no-upsert`           Do not upsert into catalog (scan only)
    * `--format`              `pretty` (default) or `json`
    * `--actor-type`          `human|system|agent` (default: system)
    * `--actor-id`            Actor identifier (default: core)
    * `--no-audit`            Do not emit audit events (best-effort by default)

  Exit status:
  - Returns normally on success.
  - Raises (non-zero) if any scan errors were encountered.
  """

  use Mix.Task

  @switches [
    roots: :string,
    ignore_dirs: :string,
    max_bytes: :integer,
    no_upsert: :boolean,
    format: :string,
    actor_type: :string,
    actor_id: :string,
    no_audit: :boolean
  ]

  @aliases [
    r: :roots,
    f: :format
  ]

  @impl true
  def run(args) do
    # Ensure Repo/application supervision tree is running.
    Mix.Task.run("app.start")

    {opts, _rest, invalid} = OptionParser.parse(args, strict: @switches, aliases: @aliases)

    if invalid != [] do
      Mix.raise("Invalid options: #{inspect(invalid)}")
    end

    format = (opts[:format] || "pretty") |> String.downcase()
    upsert? = not (opts[:no_upsert] == true)

    scan_roots =
      opts
      |> Keyword.get(:roots)
      |> parse_csv_paths()

    ignore_dirs =
      opts
      |> Keyword.get(:ignore_dirs)
      |> parse_csv_strings()
      |> case do
        [] -> nil
        list -> MapSet.new(list)
      end

    max_bytes =
      case opts[:max_bytes] do
        n when is_integer(n) and n >= 1024 -> n
        nil -> 262_144
        _ -> Mix.raise("--max-bytes must be an integer >= 1024")
      end

    actor_type = normalize_actor_type(opts[:actor_type] || "system")
    actor_id = (opts[:actor_id] || "core") |> to_string() |> String.trim()
    no_audit? = opts[:no_audit] == true

    audit_fun =
      if no_audit? do
        nil
      else
        fn event ->
          # Discovery emits maps in this shape:
          # %{event_type, actor_type, actor_id, subject_type, subject_id, metadata}
          # Keep this best-effort: failures must not break scanning.
          if Code.ensure_loaded?(OpenSentience.AuditLog) and
               function_exported?(OpenSentience.AuditLog, :append, 1) do
            _ =
              OpenSentience.AuditLog.append(%{
                event_type: Map.get(event, :event_type) || Map.get(event, "event_type"),
                actor_type: Map.get(event, :actor_type) || Map.get(event, "actor_type"),
                actor_id: Map.get(event, :actor_id) || Map.get(event, "actor_id"),
                subject_type: Map.get(event, :subject_type) || Map.get(event, "subject_type"),
                subject_id: Map.get(event, :subject_id) || Map.get(event, "subject_id"),
                correlation_id:
                  Map.get(event, :correlation_id) || Map.get(event, "correlation_id"),
                causation_id: Map.get(event, :causation_id) || Map.get(event, "causation_id"),
                severity: Map.get(event, :severity) || Map.get(event, "severity"),
                metadata: Map.get(event, :metadata) || Map.get(event, "metadata") || %{}
              })

            :ok
          else
            :noop
          end
        end
      end

    scan_opts =
      []
      |> maybe_put(:scan_roots, scan_roots)
      |> maybe_put(:ignore_dirs, ignore_dirs)
      |> Keyword.put(:max_manifest_bytes, max_bytes)
      |> Keyword.put(:upsert?, upsert?)
      |> Keyword.put(:actor_type, actor_type)
      |> Keyword.put(:actor_id, actor_id)
      |> maybe_put(:audit_fun, audit_fun)

    result = OpenSentience.Discovery.scan_now(scan_opts)

    case format do
      "json" ->
        result
        |> to_jsonable()
        |> Jason.encode!(pretty: true)
        |> Mix.shell().info()

      "pretty" ->
        print_pretty(result)

      other ->
        Mix.raise("--format must be pretty|json (got: #{inspect(other)})")
    end

    if (result[:errors] || []) != [] do
      Mix.raise("Scan completed with errors (count=#{length(result.errors)})")
    end
  end

  defp print_pretty(result) do
    roots = Enum.join(result.scan_roots || [], ", ")
    duration_ms = diff_ms(result.started_at, result.finished_at)

    Mix.shell().info("Scan roots: #{roots}")
    Mix.shell().info("Manifests found: #{result.manifests_found}")
    Mix.shell().info("Agents upserted: #{result.agents_upserted}")
    Mix.shell().info("Agents unchanged: #{result.agents_unchanged}")
    Mix.shell().info("Duration: #{duration_ms}ms")

    agents = result.agents || []

    if agents != [] do
      Mix.shell().info("\nAgents:")

      Enum.each(agents, fn a ->
        Mix.shell().info("  - #{a.agent_id} (#{a.action})")
        Mix.shell().info("    manifest: #{a.manifest_path}")
      end)
    end

    errors = result.errors || []

    if errors != [] do
      Mix.shell().error("\nErrors:")

      Enum.each(errors, fn e ->
        root = e[:root] || "-"
        path = e[:path] || "-"
        kind = e[:kind] || :unknown
        msg = e[:message] || "unknown error"
        Mix.shell().error("  - #{kind} root=#{root} path=#{path} msg=#{msg}")
      end)
    end
  end

  defp to_jsonable(result) when is_map(result) do
    result
    |> Map.update(:started_at, nil, &dt_to_iso/1)
    |> Map.update(:finished_at, nil, &dt_to_iso/1)
  end

  defp dt_to_iso(%DateTime{} = dt), do: DateTime.to_iso8601(dt)
  defp dt_to_iso(other), do: other

  defp diff_ms(%DateTime{} = a, %DateTime{} = b) do
    DateTime.diff(b, a, :millisecond)
  end

  defp diff_ms(_, _), do: 0

  defp parse_csv_paths(nil), do: nil

  defp parse_csv_paths(str) when is_binary(str) do
    str
    |> String.split(",", trim: true)
    |> Enum.map(&String.trim/1)
    |> Enum.reject(&(&1 == ""))
    |> Enum.map(&Path.expand/1)
    |> Enum.uniq()
  end

  defp parse_csv_strings(nil), do: []

  defp parse_csv_strings(str) when is_binary(str) do
    str
    |> String.split(",", trim: true)
    |> Enum.map(&String.trim/1)
    |> Enum.reject(&(&1 == ""))
    |> Enum.uniq()
  end

  defp normalize_actor_type(v) when is_atom(v) and v in [:human, :system, :agent], do: v

  defp normalize_actor_type(v) do
    v =
      v
      |> to_string()
      |> String.trim()
      |> String.downcase()

    case v do
      "human" -> :human
      "system" -> :system
      "agent" -> :agent
      _ -> :system
    end
  end

  defp maybe_put(opts, _k, nil), do: opts
  defp maybe_put(opts, _k, []), do: opts
  defp maybe_put(opts, k, v), do: Keyword.put(opts, k, v)
end
