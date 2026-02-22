defmodule Mix.Tasks.Opensentience.Agents.Install do
  @shortdoc "Install an agent (git clone/fetch into the OpenSentience agents directory)"

  @moduledoc """
  Installs an agent by cloning/fetching its source repository into the OpenSentience
  agents directory (default: `~/.opensentience/agents/<agent_id>/src`).

  Phase 1 intent:
  - Install is an explicit trust boundary (executes `git` as a subprocess).
  - Install does not build or run the agent.
  - Install updates the catalog lifecycle fields and appends audit events (best-effort).

  Usage:

      mix opensentience.agents.install com.example.side_effects --git-url https://github.com/org/repo.git
      mix opensentience.agents.install com.example.side_effects --ref main
      mix opensentience.agents.install com.example.side_effects --force
      mix opensentience.agents.install com.example.side_effects --timeout-ms 300000

  Options:
    --git-url URL            Override the git URL (otherwise uses catalog `source_git_url`)
    --ref REF                Checkout this ref/branch/tag/commit (optional)
    --agents-dir PATH        Override agents dir (default from `OpenSentience.Paths.agents_dir/0`)
    --force                  Force checkout (`git checkout --force`) when `--ref` is provided
    --timeout-ms MS          Git command timeout in milliseconds (bounded)
    --max-output-bytes BYTES Bound captured git output (bounded)
    --actor-type TYPE        human|system|agent (default: system)
    --actor-id ID            Actor identifier (default: core)
    --no-audit               Do not emit audit events
    --json                   Output JSON (for scripting)
    -h, --help               Show this help

  Notes:
  - This task expects the agent already exists in the catalog (e.g., after a scan).
    If the agent is missing and you want to install anyway, pass `--git-url` and
    ensure a record exists by running `mix opensentience.agents.scan` first.
  """

  use Mix.Task

  @impl true
  def run(args) do
    {opts, rest, invalid} =
      OptionParser.parse(args,
        strict: [
          "git-url": :string,
          ref: :string,
          "agents-dir": :string,
          force: :boolean,
          "timeout-ms": :integer,
          "max-output-bytes": :integer,
          "actor-type": :string,
          "actor-id": :string,
          "no-audit": :boolean,
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
        _ -> Mix.raise("Usage: mix opensentience.agents.install <agent_id> [options]")
      end

    # Ensure app + Repo are started (install updates catalog + audit).
    Mix.Task.run("app.start")

    install_opts =
      []
      |> put_if_present(:git_url, opts[:"git-url"])
      |> put_if_present(:ref, opts[:ref])
      |> put_if_present(:agents_dir, opts[:"agents-dir"])
      |> put_if_present(:timeout_ms, normalize_pos_int(opts[:"timeout-ms"], "--timeout-ms"))
      |> put_if_present(:max_output_bytes, normalize_pos_int(opts[:"max-output-bytes"], "--max-output-bytes"))
      |> Keyword.put(:force, opts[:force] == true)
      |> Keyword.put(:actor_type, normalize_actor_type(opts[:"actor-type"] || "system"))
      |> Keyword.put(:actor_id, normalize_actor_id(opts[:"actor-id"] || "core"))
      |> Keyword.put(:audit?, not (opts[:"no-audit"] == true))

    case OpenSentience.Install.install(agent_id, install_opts) do
      {:ok, result} ->
        if opts[:json] do
          Mix.shell().info(Jason.encode!(to_jsonable(result), pretty: true))
        else
          print_pretty(result)
        end

      {:error, err} ->
        # Keep output secret-safe: print code/message + minimal details.
        if opts[:json] do
          Mix.shell().error(
            Jason.encode!(
              %{
                ok: false,
                error: %{
                  code: Map.get(err, :code),
                  message: Map.get(err, :message),
                  details: Map.get(err, :details, %{})
                }
              },
              pretty: true
            )
          )
        else
          Mix.shell().error("Install failed: #{Map.get(err, :message, inspect(err))}")

          code = Map.get(err, :code)
          if code, do: Mix.shell().error("  code: #{code}")

          details = Map.get(err, :details, %{})
          if is_map(details) and map_size(details) > 0 do
            Mix.shell().error("  details: " <> Jason.encode!(details))
          end
        end

        Mix.raise("Install failed")
    end
  end

  defp print_pretty(result) when is_map(result) do
    Mix.shell().info("Installed: #{result.agent_id}")
    Mix.shell().info("  dest_dir: #{result.dest_dir}")
    Mix.shell().info("  git_url:   #{result.git_url}")

    if result.ref do
      Mix.shell().info("  ref:       #{result.ref}")
    end

    steps = result.steps || %{}

    if is_map(steps) do
      Enum.each([:clone, :fetch, :checkout], fn k ->
        case Map.get(steps, k) do
          nil ->
            :ok

          %{} = step ->
            cmd = Map.get(step, :command) || Map.get(step, "command")
            exit_code = Map.get(step, :exit_code) || Map.get(step, "exit_code")
            Mix.shell().info("  #{k}: exit_code=#{exit_code}")

            if is_list(cmd) do
              Mix.shell().info("    command: " <> Enum.join(cmd, " "))
            end

          _ ->
            :ok
        end
      end)
    end

    Mix.shell().info("")
    Mix.shell().info("Tip: refresh the admin UI agent page to see updated lifecycle fields.")
  end

  defp to_jsonable(result) when is_map(result) do
    %{
      ok: true,
      agent_id: result.agent_id,
      dest_dir: result.dest_dir,
      git_url: result.git_url,
      ref: result.ref,
      steps: result.steps
    }
  end

  defp put_if_present(opts, _key, nil), do: opts
  defp put_if_present(opts, _key, ""), do: opts
  defp put_if_present(opts, key, value), do: Keyword.put(opts, key, value)

  defp normalize_actor_id(v) do
    v
    |> to_string()
    |> String.trim()
    |> case do
      "" -> "core"
      s -> s
    end
  end

  defp normalize_actor_type(v) when v in [:human, :system, :agent], do: v

  defp normalize_actor_type(v) do
    v =
      v
      |> to_string()
      |> String.trim()
      |> String.downcase()

    case v do
      "human" -> :human
      "agent" -> :agent
      _ -> :system
    end
  end

  defp normalize_pos_int(nil, _flag), do: nil

  defp normalize_pos_int(n, flag) when is_integer(n) and n > 0 do
    n
  end

  defp normalize_pos_int(_other, flag) do
    Mix.raise("#{flag} must be a positive integer")
  end
end
