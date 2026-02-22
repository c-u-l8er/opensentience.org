defmodule Mix.Tasks.Opensentience.Agents.List do
  @moduledoc """
  Lists agents in the OpenSentience Core catalog.

  Phase 1 intent:
  - List discovered agents (from local scan roots).
  - This command is read-only and should not execute agent code.

  Usage:
      mix opensentience.agents.list
      mix opensentience.agents.list --status installed
      mix opensentience.agents.list --search fleet --limit 200
      mix opensentience.agents.list --order agent_id_asc
      mix opensentience.agents.list --json

  Options:
    --status STATUS         Filter by status (e.g., local_uninstalled|installed|enabled|running|stopped|error)
    --search TERM           Substring match against agent_id and name
    --limit N               Max rows (default: 100, max: 500)
    --offset N              Offset rows (default: 0)
    --order ORDER           last_seen_desc (default) | agent_id_asc | name_asc
    --json                  Output JSON array instead of a table
    --no-header             Omit table header (table output only)
    -h, --help              Show this help
  """

  use Mix.Task

  @shortdoc "List agents in the OpenSentience catalog"

  @impl true
  def run(args) do
    {opts, _rest, invalid} =
      OptionParser.parse(args,
        strict: [
          status: :string,
          search: :string,
          limit: :integer,
          offset: :integer,
          order: :string,
          json: :boolean,
          header: :boolean,
          help: :boolean
        ],
        aliases: [h: :help]
      )

    if opts[:help] do
      Mix.shell().info(@moduledoc)
      exit({:shutdown, 0})
    end

    if invalid != [] do
      Mix.raise("Invalid arguments: #{inspect(invalid)}")
    end

    # Ensure app + Repo are started (read-only query, but still needs Repo).
    Mix.Task.run("app.start")

    list_opts =
      []
      |> put_if_present(:status, opts[:status])
      |> put_if_present(:search, opts[:search])
      |> put_if_present(:limit, normalize_limit(opts[:limit]))
      |> put_if_present(:offset, normalize_offset(opts[:offset]))
      |> put_if_present(:order, normalize_order(opts[:order]))

    agents = OpenSentience.Catalog.list_agents(list_opts)

    if opts[:json] do
      json =
        agents
        |> Enum.map(&agent_to_map/1)
        |> Jason.encode!(pretty: true)

      Mix.shell().info(json)
    else
      show_header? = Keyword.get(opts, :header, true) != false
      render_table(agents, show_header?: show_header?)
    end
  end

  defp put_if_present(opts, _key, nil), do: opts
  defp put_if_present(opts, _key, ""), do: opts
  defp put_if_present(opts, key, value), do: Keyword.put(opts, key, value)

  defp normalize_limit(nil), do: nil
  defp normalize_limit(n) when is_integer(n) and n > 0, do: min(n, 500)
  defp normalize_limit(_), do: Mix.raise("--limit must be a positive integer")

  defp normalize_offset(nil), do: nil
  defp normalize_offset(n) when is_integer(n) and n >= 0, do: n
  defp normalize_offset(_), do: Mix.raise("--offset must be a non-negative integer")

  defp normalize_order(nil), do: nil

  defp normalize_order(order) when is_binary(order) do
    case String.trim(order) do
      "" ->
        nil

      "last_seen_desc" ->
        :last_seen_desc

      "agent_id_asc" ->
        :agent_id_asc

      "name_asc" ->
        :name_asc

      other ->
        Mix.raise(
          "--order must be one of: last_seen_desc | agent_id_asc | name_asc (got #{inspect(other)})"
        )
    end
  end

  defp agent_to_map(agent) do
    %{
      agent_id: agent.agent_id,
      name: agent.name,
      version: agent.version,
      description: agent.description,
      status: agent.status,
      discovered_at: dt_iso(agent.discovered_at),
      last_seen_at: dt_iso(agent.last_seen_at),
      manifest_path: agent.manifest_path,
      manifest_hash: agent.manifest_hash,
      source_git_url: agent.source_git_url,
      source_ref: agent.source_ref,
      install_path: agent.install_path,
      build_status: agent.build_status,
      build_last_at: dt_iso(agent.build_last_at),
      last_error: agent.last_error
    }
  end

  defp dt_iso(nil), do: nil
  defp dt_iso(%DateTime{} = dt), do: DateTime.to_iso8601(dt)
  defp dt_iso(other), do: to_string(other)

  defp render_table(agents, opts) do
    show_header? = Keyword.get(opts, :show_header?, true)

    rows =
      Enum.map(agents, fn a ->
        [
          a.agent_id,
          a.status || "",
          a.name || "",
          a.version || "",
          dt_iso(a.last_seen_at) || "",
          a.manifest_path || ""
        ]
      end)

    headers = ["AGENT_ID", "STATUS", "NAME", "VERSION", "LAST_SEEN_AT", "MANIFEST_PATH"]

    widths =
      [headers | rows]
      |> transpose()
      |> Enum.map(fn col ->
        col
        |> Enum.map(&String.length/1)
        |> Enum.max(fn -> 0 end)
        |> min(80)
      end)

    if show_header? do
      Mix.shell().info(format_row(headers, widths))
      Mix.shell().info(format_row(Enum.map(widths, &String.duplicate("-", &1)), widths))
    end

    Enum.each(rows, fn row ->
      Mix.shell().info(format_row(row, widths))
    end)
  end

  defp format_row(cells, widths) do
    cells
    |> Enum.zip(widths)
    |> Enum.map(fn {cell, width} ->
      cell
      |> to_string()
      |> truncate(width)
      |> String.pad_trailing(width)
    end)
    |> Enum.join("  ")
  end

  defp truncate(str, width) when is_binary(str) and is_integer(width) and width >= 0 do
    if String.length(str) <= width do
      str
    else
      # Keep it readable in narrow terminals.
      if width <= 1 do
        String.slice(str, 0, width)
      else
        String.slice(str, 0, width - 1) <> "…"
      end
    end
  end

  defp transpose([]), do: []
  defp transpose([[] | _]), do: []

  defp transpose(rows) do
    [Enum.map(rows, &hd/1) | transpose(Enum.map(rows, &tl/1))]
  end
end
