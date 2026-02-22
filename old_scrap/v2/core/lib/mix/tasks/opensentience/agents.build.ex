defmodule Mix.Tasks.Opensentience.Agents.Build do
  @shortdoc "Build an installed agent (mix deps.get + mix deps.compile) and append audit events"

  @moduledoc """
  Builds an installed agent from its `install_path` by running:

  - `mix deps.get`
  - `mix deps.compile`

  Phase 1 intent:
  - Build is an explicit **trust boundary** (executes agent code during compilation).
  - Build is audited (best-effort) and catalog build fields are updated.
  - Output is bounded in memory (and not stored durably by this task).

  Usage:

      mix opensentience.agents.build com.example.agent
      mix opensentience.agents.build com.example.agent --mix-env prod
      mix opensentience.agents.build com.example.agent --timeout-ms 600000
      mix opensentience.agents.build com.example.agent --json

  Options:
    --mix-env ENV             MIX_ENV to use (default: "dev")
    --timeout-ms MS           Per-command timeout in milliseconds (default: 600000)
    --max-output-bytes BYTES  Bound captured output per command (default: 200000)
    --actor-type TYPE         human|system|agent (default: system)
    --actor-id ID             Actor identifier (default: core)
    --correlation-id ID       Optional correlation id for audit events
    --causation-id ID         Optional causation id for audit events
    --no-audit                Do not emit audit events
    --json                    Output JSON (for scripting)
    -h, --help                Show this help

  Notes:
  - This task expects the agent exists in the catalog and has an `install_path`
    (typically after `mix opensentience.agents.install`).
  - If you later add a dedicated `OpenSentience.Build` module, this task will
    prefer it when available, and fall back to its internal implementation otherwise.
  """

  use Mix.Task
  require Logger

  alias OpenSentience.AuditLog
  alias OpenSentience.Catalog
  alias OpenSentience.Paths

  @default_timeout_ms 600_000
  @default_max_output_bytes 200_000

  # ----------------------------------------------------------------------------
  # Public entrypoint
  # ----------------------------------------------------------------------------

  @impl true
  def run(args) do
    {opts, rest, invalid} =
      OptionParser.parse(args,
        strict: [
          "mix-env": :string,
          "timeout-ms": :integer,
          "max-output-bytes": :integer,
          "actor-type": :string,
          "actor-id": :string,
          "correlation-id": :string,
          "causation-id": :string,
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
        _ -> Mix.raise("Usage: mix opensentience.agents.build <agent_id> [options]")
      end

    Mix.Task.run("app.start")

    timeout_ms = normalize_pos_int(opts[:"timeout-ms"] || @default_timeout_ms, "--timeout-ms")

    max_output_bytes =
      normalize_pos_int(
        opts[:"max-output-bytes"] || @default_max_output_bytes,
        "--max-output-bytes"
      )

    build_opts =
      []
      |> Keyword.put(:mix_env, normalize_mix_env(opts[:"mix-env"] || "dev"))
      |> Keyword.put(:timeout_ms, timeout_ms)
      |> Keyword.put(:max_output_bytes, max_output_bytes)
      |> Keyword.put(:actor_type, normalize_actor_type(opts[:"actor-type"] || "system"))
      |> Keyword.put(:actor_id, normalize_actor_id(opts[:"actor-id"] || "core"))
      |> Keyword.put(:correlation_id, normalize_optional_string(opts[:"correlation-id"]))
      |> Keyword.put(:causation_id, normalize_optional_string(opts[:"causation-id"]))
      |> Keyword.put(:audit?, not (opts[:"no-audit"] == true))

    case do_build(agent_id, build_opts) do
      {:ok, result} ->
        if opts[:json] do
          Mix.shell().info(Jason.encode!(%{ok: true, result: result}, pretty: true))
        else
          print_pretty_success(result)
        end

      {:error, err} ->
        if opts[:json] do
          Mix.shell().error(Jason.encode!(%{ok: false, error: err}, pretty: true))
        else
          Mix.shell().error("Build failed: " <> (err[:message] || inspect(err)))
          if err[:code], do: Mix.shell().error("  code: #{err[:code]}")

          if is_map(err[:details]) and map_size(err[:details]) > 0 do
            Mix.shell().error("  details: " <> Jason.encode!(err[:details]))
          end
        end

        Mix.raise("Build failed")
    end
  end

  # ----------------------------------------------------------------------------
  # Core build orchestration (prefers OpenSentience.Build if present)
  # ----------------------------------------------------------------------------

  defp do_build(agent_id, opts) when is_binary(agent_id) and is_list(opts) do
    # If a dedicated build orchestrator exists, prefer it.
    if Code.ensure_loaded?(OpenSentience.Build) and
         function_exported?(OpenSentience.Build, :build, 2) do
      try do
        case OpenSentience.Build.build(agent_id, opts) do
          {:ok, result} ->
            {:ok, result}

          {:error, reason} ->
            {:error, normalize_external_error(reason)}

          other ->
            {:error,
             %{
               code: :unexpected_result,
               message: "Unexpected build result",
               details: %{got: inspect(other)}
             }}
        end
      rescue
        e ->
          {:error,
           %{
             code: :build_exception,
             message: "Build crashed",
             details: %{exception: Exception.message(e)}
           }}
      end
    else
      do_build_internal(agent_id, opts)
    end
  end

  defp do_build_internal(agent_id, opts) do
    actor_type = Keyword.fetch!(opts, :actor_type)
    actor_id = Keyword.fetch!(opts, :actor_id)
    audit? = Keyword.get(opts, :audit?, true) != false
    correlation_id = Keyword.get(opts, :correlation_id)
    causation_id = Keyword.get(opts, :causation_id)

    timeout_ms = Keyword.fetch!(opts, :timeout_ms)
    max_output_bytes = Keyword.fetch!(opts, :max_output_bytes)
    mix_env = Keyword.fetch!(opts, :mix_env)

    with :ok <- validate_agent_id(agent_id),
         {:ok, agent} <- fetch_catalog_agent(agent_id),
         {:ok, install_path} <- validate_install_path(agent),
         {:ok, sandbox_env} <- build_sandbox_env(agent_id, mix_env) do
      _ = Catalog.set_build_status(agent_id, "building")

      emit_audit(audit?, %{
        event_type: "agent.build_started",
        actor_type: actor_type,
        actor_id: actor_id,
        subject_type: "agent",
        subject_id: agent_id,
        correlation_id: correlation_id,
        causation_id: causation_id,
        severity: :info,
        metadata: %{
          install_path: install_path,
          mix_env: mix_env,
          trust_boundary: "build_executes_code"
        }
      })

      started_at = System.monotonic_time(:millisecond)

      steps = [
        {:deps_get, ["deps.get"]},
        {:deps_compile, ["deps.compile"]}
      ]

      {step_results, first_error} =
        Enum.reduce(steps, {[], nil}, fn {step_name, args}, {acc, err} ->
          if err do
            {acc, err}
          else
            case run_mix_step(install_path, step_name, args, sandbox_env,
                   timeout_ms: timeout_ms,
                   max_output_bytes: max_output_bytes
                 ) do
              {:ok, res} -> {[res | acc], nil}
              {:error, e} -> {[e.step_result | acc], e}
            end
          end
        end)

      duration_ms = System.monotonic_time(:millisecond) - started_at
      step_results = Enum.reverse(step_results)

      case first_error do
        nil ->
          _ = Catalog.set_build_status(agent_id, "built")
          _ = Catalog.clear_error(agent_id)

          emit_audit(audit?, %{
            event_type: "agent.built",
            actor_type: actor_type,
            actor_id: actor_id,
            subject_type: "agent",
            subject_id: agent_id,
            correlation_id: correlation_id,
            causation_id: causation_id,
            severity: :info,
            metadata: %{
              install_path: install_path,
              mix_env: mix_env,
              duration_ms: duration_ms,
              steps: summarize_step_results(step_results)
            }
          })

          {:ok,
           %{
             agent_id: agent_id,
             install_path: install_path,
             mix_env: mix_env,
             duration_ms: duration_ms,
             steps: step_results
           }}

        %{code: code, message: message, details: details} = e ->
          _ = Catalog.set_build_status(agent_id, "failed")
          _ = Catalog.set_error(agent_id, "build failed: #{message}")

          emit_audit(audit?, %{
            event_type: "agent.build_failed",
            actor_type: actor_type,
            actor_id: actor_id,
            subject_type: "agent",
            subject_id: agent_id,
            correlation_id: correlation_id,
            causation_id: causation_id,
            severity: :error,
            metadata: %{
              install_path: install_path,
              mix_env: mix_env,
              duration_ms: duration_ms,
              error: %{
                code: code,
                message: message,
                details: safe_details(details)
              },
              steps: summarize_step_results(step_results)
            }
          })

          {:error, %{code: code, message: message, details: safe_details(details)}}
      end
    else
      {:error, err} when is_map(err) ->
        {:error, err}

      {:error, other} ->
        {:error,
         %{code: :build_failed, message: "Build failed", details: %{reason: inspect(other)}}}
    end
  end

  # ----------------------------------------------------------------------------
  # Running mix (bounded output)
  # ----------------------------------------------------------------------------

  defmodule LimitedCollector do
    @moduledoc false
    defstruct limit: 0, data: "", truncated?: false, bytes: 0

    def new(limit) when is_integer(limit) and limit > 0 do
      %__MODULE__{limit: limit}
    end
  end

  defimpl Collectable, for: LimitedCollector do
    def into(%LimitedCollector{} = collector) do
      {collector,
       fn
         %LimitedCollector{} = acc, {:cont, chunk} ->
           chunk = if is_binary(chunk), do: chunk, else: IO.iodata_to_binary(chunk)

           if acc.truncated? do
             acc
           else
             remaining = acc.limit - acc.bytes

             cond do
               remaining <= 0 ->
                 %LimitedCollector{acc | truncated?: true}

               byte_size(chunk) <= remaining ->
                 %LimitedCollector{
                   acc
                   | data: acc.data <> chunk,
                     bytes: acc.bytes + byte_size(chunk)
                 }

               true ->
                 prefix = binary_part(chunk, 0, remaining)

                 %LimitedCollector{
                   acc
                   | data: acc.data <> prefix,
                     bytes: acc.bytes + remaining,
                     truncated?: true
                 }
             end
           end

         %LimitedCollector{} = acc, :done ->
           acc

         %LimitedCollector{} = acc, :halt ->
           acc
       end}
    end
  end

  defp run_mix_step(cwd, step_name, mix_args, env, opts)
       when is_binary(cwd) and is_atom(step_name) and is_list(mix_args) and is_list(env) and
              is_list(opts) do
    timeout_ms = Keyword.fetch!(opts, :timeout_ms)
    max_output_bytes = Keyword.fetch!(opts, :max_output_bytes)

    cmd = "mix"
    args = mix_args

    started_at = System.monotonic_time(:millisecond)

    collector = LimitedCollector.new(max_output_bytes)

    {collector, exit_status} =
      try do
        System.cmd(cmd, args,
          cd: cwd,
          env: env,
          stderr_to_stdout: true,
          into: collector,
          timeout: timeout_ms
        )
      rescue
        e ->
          # System.cmd can raise (e.g., executable not found, or other port failures).
          col = %LimitedCollector{collector | truncated?: collector.truncated? || true}

          {col, {:exception, Exception.message(e)}}
      end

    duration_ms = System.monotonic_time(:millisecond) - started_at

    step_result = %{
      step: step_name,
      command: [cmd | args],
      cwd: cwd,
      exit_code: normalize_exit_code(exit_status),
      duration_ms: duration_ms,
      output_truncated: collector.truncated?,
      output_bytes: collector.bytes
    }

    cond do
      exit_status == 0 ->
        {:ok, step_result}

      match?({:exception, _}, exit_status) ->
        {:error,
         %{
           code: :command_failed,
           message: "Command execution failed",
           details: %{step: step_name, command: step_result.command, reason: exit_status},
           step_result: step_result
         }}

      exit_status == :timeout ->
        {:error,
         %{
           code: :timeout,
           message: "Command timed out",
           details: %{step: step_name, command: step_result.command, timeout_ms: timeout_ms},
           step_result: Map.put(step_result, :timed_out, true)
         }}

      is_integer(exit_status) ->
        # Do not include raw command output in durable records; console output is fine.
        {:error,
         %{
           code: :nonzero_exit,
           message: "Command exited non-zero (#{exit_status})",
           details: %{step: step_name, command: step_result.command, exit_code: exit_status},
           step_result: step_result
         }}

      true ->
        {:error,
         %{
           code: :command_failed,
           message: "Command failed",
           details: %{
             step: step_name,
             command: step_result.command,
             exit_code: inspect(exit_status)
           },
           step_result: step_result
         }}
    end
  end

  defp normalize_exit_code(code) when is_integer(code), do: code
  defp normalize_exit_code(:timeout), do: :timeout

  defp normalize_exit_code({:exception, _}), do: :exception
  defp normalize_exit_code(other), do: other

  # ----------------------------------------------------------------------------
  # Sandbox env (best-effort isolation)
  # ----------------------------------------------------------------------------

  defp build_sandbox_env(agent_id, mix_env) do
    # Keep build caches under OPENSENTIENCE_HOME/state to reduce cross-project coupling.
    state_dir =
      try do
        Paths.state_dir()
      rescue
        _ -> Path.join([System.user_home!(), ".opensentience", "state"])
      end

    sandbox_root = Path.join([state_dir, "build", agent_id])
    mix_home = Path.join(sandbox_root, "mix")
    hex_home = Path.join(sandbox_root, "hex")

    # Creating directories is part of the build trust boundary and is local-only.
    case File.mkdir_p(mix_home) do
      :ok ->
        :ok

      {:error, reason} ->
        return_error(:mkdir_failed, "Failed to create build sandbox directory", %{
          path: mix_home,
          reason: reason
        })
    end

    case File.mkdir_p(hex_home) do
      :ok ->
        :ok

      {:error, reason} ->
        return_error(:mkdir_failed, "Failed to create build sandbox directory", %{
          path: hex_home,
          reason: reason
        })
    end

    # Minimal env: preserve PATH so "mix" can be found.
    base =
      []
      |> put_env("PATH", System.get_env("PATH") || "")
      |> put_env("LANG", System.get_env("LANG") || "C.UTF-8")
      |> put_env("LC_ALL", System.get_env("LC_ALL") || "C.UTF-8")
      |> put_env("MIX_ENV", mix_env)
      |> put_env("MIX_HOME", mix_home)
      |> put_env("HEX_HOME", hex_home)
      |> put_env("ERL_AFLAGS", "")

    {:ok, base}
  rescue
    e ->
      {:error,
       %{
         code: :sandbox_env_failed,
         message: "Failed to prepare sandbox env",
         details: %{exception: Exception.message(e)}
       }}
  end

  defp put_env(env, _k, nil), do: env
  defp put_env(env, k, v) when is_binary(k) and is_binary(v), do: [{k, v} | env]

  defp return_error(code, message, details) do
    throw({:build_error, %{code: code, message: message, details: details}})
  end

  # ----------------------------------------------------------------------------
  # Catalog + validation
  # ----------------------------------------------------------------------------

  defp fetch_catalog_agent(agent_id) do
    case Catalog.get_agent(agent_id) do
      nil ->
        {:error,
         %{
           code: :not_found,
           message: "Agent not found in catalog",
           details: %{agent_id: agent_id}
         }}

      agent ->
        {:ok, agent}
    end
  rescue
    e ->
      {:error,
       %{
         code: :catalog_error,
         message: "Catalog lookup failed",
         details: %{exception: Exception.message(e)}
       }}
  end

  defp validate_install_path(agent) do
    install_path =
      agent
      |> Map.get(:install_path)
      |> normalize_optional_string()

    cond do
      is_nil(install_path) ->
        {:error,
         %{
           code: :not_installed,
           message: "Agent has no install_path; install it first",
           details: %{agent_id: Map.get(agent, :agent_id)}
         }}

      not File.dir?(install_path) ->
        {:error,
         %{
           code: :missing_install_path,
           message: "install_path does not exist",
           details: %{install_path: install_path}
         }}

      true ->
        {:ok, install_path}
    end
  end

  defp validate_agent_id(agent_id) do
    agent_id = String.trim(agent_id)

    cond do
      agent_id == "" ->
        {:error, %{code: :invalid_agent_id, message: "agent_id is empty", details: %{}}}

      byte_size(agent_id) > 200 ->
        {:error,
         %{code: :invalid_agent_id, message: "agent_id is too long", details: %{max: 200}}}

      not String.match?(agent_id, ~r/^[A-Za-z0-9][A-Za-z0-9._-]*$/) ->
        {:error,
         %{
           code: :invalid_agent_id,
           message: "agent_id has invalid format",
           details: %{expected: "^[A-Za-z0-9][A-Za-z0-9._-]*$"}
         }}

      true ->
        :ok
    end
  end

  # ----------------------------------------------------------------------------
  # Audit (best-effort)
  # ----------------------------------------------------------------------------

  defp emit_audit(false, _attrs), do: :ok

  defp emit_audit(true, attrs) when is_map(attrs) do
    if Code.ensure_loaded?(AuditLog) and function_exported?(AuditLog, :append, 1) do
      _ =
        AuditLog.append(%{
          event_type: Map.fetch!(attrs, :event_type),
          actor_type: Map.fetch!(attrs, :actor_type),
          actor_id: Map.fetch!(attrs, :actor_id),
          subject_type: Map.fetch!(attrs, :subject_type),
          subject_id: Map.fetch!(attrs, :subject_id),
          correlation_id: Map.get(attrs, :correlation_id),
          causation_id: Map.get(attrs, :causation_id),
          severity: Map.get(attrs, :severity),
          metadata: Map.get(attrs, :metadata, %{})
        })

      :ok
    else
      :noop
    end
  rescue
    _ -> :noop
  end

  # ----------------------------------------------------------------------------
  # Output helpers
  # ----------------------------------------------------------------------------

  defp print_pretty_success(result) when is_map(result) do
    Mix.shell().info("Built: #{result.agent_id}")
    Mix.shell().info("  install_path: #{result.install_path}")
    Mix.shell().info("  mix_env:       #{result.mix_env}")
    Mix.shell().info("  duration_ms:   #{result.duration_ms}")

    Enum.each(result.steps || [], fn step ->
      Mix.shell().info(
        "  step: #{step.step} exit_code=#{inspect(step.exit_code)} duration_ms=#{step.duration_ms}"
      )

      if step.output_truncated do
        Mix.shell().info("    output: (truncated at #{step.output_bytes} bytes)")
      end
    end)

    Mix.shell().info("")
    Mix.shell().info("Tip: refresh the admin UI agent page to see updated build fields.")
  end

  defp summarize_step_results(step_results) when is_list(step_results) do
    Enum.map(step_results, fn s ->
      %{
        step: s.step,
        exit_code: s.exit_code,
        duration_ms: s.duration_ms
      }
    end)
  end

  defp safe_details(%{} = details) do
    details
    |> Map.take([
      :step,
      :command,
      :exit_code,
      :timeout_ms,
      :reason,
      :exception,
      :install_path,
      :mix_env
    ])
    |> Enum.into(%{}, fn {k, v} -> {to_string(k), v} end)
  end

  defp safe_details(_), do: %{}

  defp normalize_external_error(%{code: code, message: msg} = e) do
    %{
      code: code,
      message: msg,
      details: safe_details(Map.get(e, :details, %{}))
    }
  end

  defp normalize_external_error(other) do
    %{code: :build_failed, message: "Build failed", details: %{reason: inspect(other)}}
  end

  # ----------------------------------------------------------------------------
  # Normalization helpers
  # ----------------------------------------------------------------------------

  defp normalize_actor_id(v) do
    v
    |> to_string()
    |> String.trim()
    |> case do
      "" -> "core"
      s -> String.slice(s, 0, 200)
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

  defp normalize_optional_string(nil), do: nil

  defp normalize_optional_string(v) when is_binary(v) do
    v = String.trim(v)
    if v == "", do: nil, else: String.slice(v, 0, 4_096)
  end

  defp normalize_optional_string(v), do: v |> to_string() |> normalize_optional_string()

  defp normalize_pos_int(n, _flag) when is_integer(n) and n > 0, do: n
  defp normalize_pos_int(_other, flag), do: Mix.raise("#{flag} must be a positive integer")

  defp normalize_mix_env(v) do
    v
    |> to_string()
    |> String.trim()
    |> String.downcase()
    |> case do
      "" -> "dev"
      env -> env
    end
  end
end
