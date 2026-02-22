defmodule OpenSentience.Build do
  @moduledoc """
  Build orchestration for OpenSentience Core (Phase 1).

  Phase 1 intent:
  - Build is an explicit **trust boundary**: it executes agent code indirectly via `mix`.
  - Build updates catalog lifecycle fields (`build_status`, `build_last_at`, `last_error`) and
    emits audit events (best-effort).
  - Build does **not** run or enable the agent; it only compiles dependencies.

  Default build steps (in the agent install directory):
  1) `mix deps.get`
  2) `mix deps.compile`

  Security invariants:
  - Do not persist build output durably (it may contain secrets).
  - Audit metadata stores only safe summaries (commands, exit codes, timings, truncated flags).
  - Environment is controlled and minimal (best-effort).
  """

  require Logger

  alias OpenSentience.AuditLog
  alias OpenSentience.Build.Sandbox
  alias OpenSentience.Catalog
  alias OpenSentience.Catalog.Agent

  defmodule Error do
    @moduledoc "Structured, secret-safe error for build orchestration."
    @enforce_keys [:code, :message]
    defstruct [:code, :message, details: %{}]

    @type t :: %__MODULE__{
            code: atom(),
            message: String.t(),
            details: map()
          }
  end

  @type actor_type :: :human | :system | :agent

  @typedoc "A single build step summary (safe for audit/UI)."
  @type step_summary :: %{
          name: String.t(),
          command: [String.t()],
          exit_code: integer() | nil,
          duration_ms: non_neg_integer(),
          output_bytes: non_neg_integer(),
          output_truncated: boolean(),
          timeout_ms: non_neg_integer() | nil
        }

  @type build_result :: %{
          agent_id: String.t(),
          install_path: String.t(),
          ok: boolean(),
          steps: [step_summary()],
          started_at: DateTime.t(),
          finished_at: DateTime.t()
        }

  @default_timeout_ms 5 * 60_000
  @default_max_output_bytes 200_000

  # Allow overriding the `mix` executable used for build trust-boundary commands.
  # This is useful when the Core process is running in an environment where `mix`
  # is not on PATH (e.g., service managers, constrained shells, etc.).
  #
  # Example:
  #   OPENSENTIENCE_MIX_BIN=/usr/local/bin/mix
  defp mix_bin do
    case System.get_env("OPENSENTIENCE_MIX_BIN") do
      v when is_binary(v) ->
        v = String.trim(v)
        if v == "", do: "mix", else: v

      _ ->
        "mix"
    end
  end

  # If OPENSENTIENCE_MIX_BIN points at an absolute mix *script* path, prefer running it via the
  # absolute `elixir` in the same directory:
  #
  #   /path/to/elixir /path/to/mix deps.get
  #
  # This avoids relying on the mix script's shebang:
  #   #!/usr/bin/env elixir
  #
  # which can fail when the Core process PATH does not include an `elixir` executable.
  defp mix_cmd_and_prefix(mix) when is_binary(mix) do
    mix = String.trim(mix)

    cond do
      mix == "" ->
        {"mix", []}

      String.contains?(mix, "/") and Path.basename(mix) == "mix" ->
        dir = Path.dirname(mix)
        elixir = Path.join(dir, "elixir")

        cmd =
          case File.lstat(elixir) do
            {:ok, %File.Stat{type: type}} when type in [:regular, :symlink] ->
              elixir

            _ ->
              "elixir"
          end

        {cmd, [mix]}

      true ->
        {mix, []}
    end
  end

  defp command_available?(cmd) when is_binary(cmd) do
    cmd = String.trim(cmd)

    cond do
      cmd == "" ->
        false

      # `System.find_executable/1` does not work for absolute/relative paths (strings containing "/").
      # For paths, fall back to filesystem checks.
      #
      # Note: asdf installs may place executables as symlinks (e.g. .../bin/elixir -> ...),
      # and `File.regular?/1` returns false for symlinks. Treat symlinked paths as available.
      String.contains?(cmd, "/") ->
        case File.lstat(cmd) do
          {:ok, %File.Stat{type: type}} when type in [:regular, :symlink] -> true
          _ -> false
        end

      true ->
        not is_nil(System.find_executable(cmd))
    end
  end

  # When using an absolute `mix` path, remember that `mix` is an Elixir script:
  #   #!/usr/bin/env elixir
  #
  # That means `elixir` must be discoverable on PATH for the build subprocess.
  # If `OPENSENTIENCE_MIX_BIN` points at `.../bin/mix`, we can safely prepend that same
  # directory to PATH because it typically also contains `elixir`.
  defp ensure_path_for_mix(env, cmd) when is_list(env) and is_binary(cmd) do
    cmd = String.trim(cmd)

    if cmd != "" and String.contains?(cmd, "/") do
      mix_dir = Path.dirname(cmd)

      existing_path =
        env
        |> Enum.find_value(fn
          {"PATH", v} -> v
          _ -> nil
        end)

      new_path =
        case existing_path do
          nil ->
            mix_dir

          v when is_binary(v) ->
            v = String.trim(v)

            cond do
              v == "" ->
                mix_dir

              String.starts_with?(v, mix_dir <> ":") or v == mix_dir or
                String.contains?(v, ":" <> mix_dir <> ":") or
                  String.ends_with?(v, ":" <> mix_dir) ->
                v

              true ->
                mix_dir <> ":" <> v
            end

          _ ->
            mix_dir
        end

      env
      |> Enum.reject(fn
        {"PATH", _} -> true
        _ -> false
      end)
      |> then(fn rest -> [{"PATH", new_path} | rest] end)
    else
      env
    end
  end

  @doc """
  Builds an installed agent by id.

  Options:
  - `:timeout_ms` (default #{@default_timeout_ms}) - per-step timeout, bounded
  - `:max_output_bytes` (default #{@default_max_output_bytes}) - bound captured stdout/stderr per step
  - `:mix_env` (default `"prod"`) - MIX_ENV for build commands
  - `:actor_type` (default `:system`)
  - `:actor_id` (default `"core"`)
  - `:audit?` (default `true`)
  - `:correlation_id` / `:causation_id` - optional audit linkage

  Returns:
  - `{:ok, build_result}` on success
  - `{:error, %OpenSentience.Build.Error{...}}` on failure
  """
  @spec build(String.t(), Keyword.t()) :: {:ok, build_result()} | {:error, Error.t()}
  def build(agent_id, opts \\ []) when is_binary(agent_id) and is_list(opts) do
    actor_type = normalize_actor_type(Keyword.get(opts, :actor_type, :system))
    actor_id = normalize_actor_id(Keyword.get(opts, :actor_id, "core"))
    audit? = Keyword.get(opts, :audit?, true) != false
    correlation_id = normalize_optional_string(Keyword.get(opts, :correlation_id))
    causation_id = normalize_optional_string(Keyword.get(opts, :causation_id))

    timeout_ms = normalize_timeout_ms(Keyword.get(opts, :timeout_ms, @default_timeout_ms))

    max_output_bytes =
      normalize_max_output_bytes(Keyword.get(opts, :max_output_bytes, @default_max_output_bytes))

    mix_env = normalize_mix_env(Keyword.get(opts, :mix_env, "prod"))

    with :ok <- validate_agent_id(agent_id),
         %Agent{} = agent <- Catalog.get_agent(agent_id) || :not_found,
         {:ok, install_path} <- resolve_install_path(agent),
         {:ok, _build_sandbox} <- ensure_build_sandbox(agent_id) do
      started_at = DateTime.utc_now()

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
          trust_boundary: "executes_code",
          install_path: install_path,
          mix_env: mix_env
        }
      })

      _ = Catalog.set_build_status(agent_id, "building", build_last_at: started_at)

      mix = mix_bin()
      {cmd, prefix} = mix_cmd_and_prefix(mix)

      steps = [
        %{name: "deps.get", cmd: cmd, args: prefix ++ ["deps.get"]},
        %{name: "deps.compile", cmd: cmd, args: prefix ++ ["deps.compile"]}
      ]

      env =
        Sandbox.env_for_build(agent_id, mix_env: mix_env)
        |> ensure_path_for_mix(cmd)

      case run_steps(install_path, steps, env, timeout_ms, max_output_bytes) do
        {:ok, step_summaries} ->
          finished_at = DateTime.utc_now()
          _ = Catalog.set_build_status(agent_id, "built", build_last_at: finished_at)
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
              trust_boundary: "executes_code",
              install_path: install_path,
              mix_env: mix_env,
              steps: step_summaries_for_audit(step_summaries)
            }
          })

          {:ok,
           %{
             agent_id: agent_id,
             install_path: install_path,
             ok: true,
             steps: step_summaries,
             started_at: started_at,
             finished_at: finished_at
           }}

        {:error, {:step_failed, %{} = failed_step, %{} = partial_summaries}} ->
          finished_at = DateTime.utc_now()
          _ = Catalog.set_build_status(agent_id, "failed", build_last_at: finished_at)

          safe_msg =
            cond do
              failed_step.exit_code == 127 and is_list(failed_step.command) ->
                cmd0 =
                  failed_step.command
                  |> List.first()
                  |> to_string()

                hint =
                  cond do
                    is_binary(cmd0) and String.contains?(cmd0, "/") and
                        Path.basename(cmd0) == "mix" ->
                      "The mix script uses '#!/usr/bin/env elixir'; ensure 'elixir' is available on PATH for the Core process. (Tip: set OPENSENTIENCE_MIX_BIN to an asdf Elixir bin path like .../bin/mix; Core will prepend that directory to PATH for build steps.)"

                    true ->
                      "Ensure the build command is available to the Core process (OPENSENTIENCE_MIX_BIN and/or PATH)."
                  end

                "build failed at #{failed_step.name} (exit_code=127). #{hint}"

              true ->
                "build failed at #{failed_step.name} (exit_code=#{inspect(failed_step.exit_code)})"
            end

          safe_msg =
            case Map.get(failed_step, :output_preview) do
              v when is_binary(v) and v != "" ->
                safe_msg <> " Output: " <> v

              _ ->
                safe_msg
            end

          _ = Catalog.set_error(agent_id, safe_msg)

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
              trust_boundary: "executes_code",
              install_path: install_path,
              mix_env: mix_env,
              failed_step: step_summary_for_audit(failed_step),
              steps: step_summaries_for_audit(Map.get(partial_summaries, :steps, []))
            }
          })

          {:error,
           error(:build_failed, "Build failed", %{
             agent_id: agent_id,
             step: failed_step.name,
             exit_code: failed_step.exit_code
           })}

        {:error, reason} ->
          finished_at = DateTime.utc_now()
          _ = Catalog.set_build_status(agent_id, "failed", build_last_at: finished_at)

          safe_msg = "build failed: #{safe_reason(reason)}"
          _ = Catalog.set_error(agent_id, safe_msg)

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
              trust_boundary: "executes_code",
              install_path: install_path,
              mix_env: mix_env,
              error: %{
                code: "build_failed",
                message: safe_reason(reason)
              }
            }
          })

          {:error, error(:build_failed, "Build failed", %{agent_id: agent_id})}
      end
    else
      :not_found ->
        {:error, error(:not_found, "No agent with id #{agent_id} in the catalog")}

      {:error, %Error{} = e} ->
        {:error, e}

      {:error, other} ->
        {:error, error(:build_failed, "Build failed", %{reason: safe_reason(other)})}
    end
  end

  # ----------------------------------------------------------------------------
  # Step runner
  # ----------------------------------------------------------------------------

  defp run_steps(install_path, steps, env, timeout_ms, max_output_bytes)
       when is_binary(install_path) and is_list(steps) and is_list(env) and is_integer(timeout_ms) and
              is_integer(max_output_bytes) do
    Enum.reduce_while(steps, {:ok, []}, fn step, {:ok, acc} ->
      case run_step(install_path, step, env, timeout_ms, max_output_bytes) do
        {:ok, summary} ->
          {:cont, {:ok, acc ++ [summary]}}

        {:error, {:timeout, summary}} ->
          {:halt, {:error, {:step_failed, summary, %{steps: acc ++ [summary]}}}}

        {:error, {:exit, summary}} ->
          {:halt, {:error, {:step_failed, summary, %{steps: acc ++ [summary]}}}}

        {:error, reason} ->
          {:halt, {:error, reason}}
      end
    end)
  end

  defp run_step(
         install_path,
         %{name: name, cmd: cmd, args: args},
         env,
         timeout_ms,
         max_output_bytes
       )
       when is_binary(name) and is_binary(cmd) and is_list(args) do
    started = System.monotonic_time(:millisecond)

    # If the build tool isn't available, fail fast with a clear, safe summary.
    #
    # Note: `System.find_executable/1` does not work for absolute/relative paths (strings containing "/").
    if not command_available?(cmd) do
      finished = System.monotonic_time(:millisecond)
      duration_ms = max(finished - started, 0)

      summary = %{
        name: name,
        command: [cmd | Enum.map(args, &to_string/1)],
        exit_code: 127,
        duration_ms: duration_ms,
        output_bytes: 0,
        output_truncated: false,
        output_preview: nil,
        timeout_ms: timeout_ms
      }

      {:error, {:exit, summary}}
    else
      {out, exit_code, failure} =
        try do
          {output, status} =
            System.cmd(cmd, args,
              cd: install_path,
              env: env,
              stderr_to_stdout: true,
              timeout: timeout_ms
            )

          {output, status, nil}
        rescue
          e ->
            # Ensure unexpected exceptions from System.cmd/3 don't strand build_status at "building".
            #
            # Also: include the exception message in the in-memory output so callers can surface a
            # useful, bounded `output_preview` (helps debug "exit_code=127" cases that are actually
            # port failures / missing executables, etc.).
            msg = e |> Exception.message() |> to_string()
            out = "exception: " <> msg
            {out, 127, {:exception, msg}}
        catch
          :exit, {:timeout, _} ->
            {"", nil, :timeout}

          :exit, other ->
            {"", nil, {:exit, other}}
        end

      finished = System.monotonic_time(:millisecond)
      duration_ms = max(finished - started, 0)

      {clamped, output_bytes, output_truncated} = clamp_output(out, max_output_bytes)

      output_preview =
        clamped
        |> String.split(~r/\r\n|\r|\n/, parts: 2)
        |> List.first()
        |> to_string()
        |> String.replace("\u0000", "")
        |> String.trim()
        |> String.replace(~r/(bearer\s+)[A-Za-z0-9\-\._~\+\/]+=*/i, "\\1[REDACTED]")
        |> String.replace(~r/(token|api[_-]?key|secret|password)\s*[:=]\s*\S+/i, "\\1=[REDACTED]")
        |> String.slice(0, 200)

      output_preview = if output_preview == "", do: nil, else: output_preview

      summary = %{
        name: name,
        command: [cmd | Enum.map(args, &to_string/1)],
        exit_code: exit_code,
        duration_ms: duration_ms,
        output_bytes: output_bytes,
        output_truncated: output_truncated,
        output_preview: output_preview,
        timeout_ms: timeout_ms
      }

      cond do
        failure == :timeout ->
          # Do not store output; do not include it in the error.
          {:error, {:timeout, summary}}

        match?({:exit, _}, failure) ->
          {:error, error(:command_failed, "Build command crashed", %{step: name})}

        match?({:exception, _}, failure) ->
          # Keep output in memory only; return a step failure so callers mark build as failed.
          _ = clamped
          {:error, {:exit, summary}}

        is_integer(exit_code) and exit_code == 0 ->
          # Keep clamped output in memory only (not persisted); currently unused, but handy for future UI streaming.
          _ = clamped
          {:ok, summary}

        is_integer(exit_code) ->
          _ = clamped
          {:error, {:exit, summary}}

        true ->
          {:error, error(:command_failed, "Build command failed", %{step: name})}
      end
    end
  end

  # ----------------------------------------------------------------------------
  # Validation / path resolution
  # ----------------------------------------------------------------------------

  defp resolve_install_path(%Agent{} = agent) do
    install_path =
      agent.install_path
      |> normalize_optional_string()

    cond do
      is_nil(install_path) ->
        {:error,
         error(:not_installed, "Agent is not installed (install_path missing)", %{
           agent_id: agent.agent_id
         })}

      not File.dir?(install_path) ->
        {:error,
         error(:invalid_install_path, "Agent install_path does not exist", %{
           agent_id: agent.agent_id,
           install_path: install_path
         })}

      not File.exists?(Path.join(install_path, "mix.exs")) ->
        {:error,
         error(
           :invalid_agent_project,
           "No mix.exs found at install_path (not an Elixir Mix project?)",
           %{
             agent_id: agent.agent_id,
             install_path: install_path
           }
         )}

      true ->
        {:ok, install_path}
    end
  end

  defp validate_agent_id(agent_id) when is_binary(agent_id) do
    agent_id = String.trim(agent_id)

    cond do
      agent_id == "" ->
        {:error, error(:invalid_agent_id, "agent_id is empty")}

      byte_size(agent_id) > 200 ->
        {:error, error(:invalid_agent_id, "agent_id is too long")}

      not String.match?(agent_id, ~r/^[A-Za-z0-9][A-Za-z0-9._-]*$/) ->
        {:error,
         error(:invalid_agent_id, "agent_id has invalid format", %{
           expected: "^[A-Za-z0-9][A-Za-z0-9._-]*$"
         })}

      true ->
        :ok
    end
  end

  # ----------------------------------------------------------------------------
  # Environment + dirs control (best-effort sandbox)
  # ----------------------------------------------------------------------------

  defp ensure_build_sandbox(agent_id) when is_binary(agent_id) do
    if Code.ensure_loaded?(Sandbox) and function_exported?(Sandbox, :ensure_build_dirs!, 1) do
      try do
        _dirs = Sandbox.ensure_build_dirs!(agent_id)
        {:ok, :ensured}
      rescue
        e ->
          {:error,
           error(:sandbox_failed, "Failed to prepare build sandbox", %{
             exception: Exception.message(e)
           })}
      end
    else
      {:ok, :skipped}
    end
  end

  # ----------------------------------------------------------------------------
  # Audit helpers (best-effort)
  # ----------------------------------------------------------------------------

  defp emit_audit(false, _attrs), do: :ok

  defp emit_audit(true, attrs) when is_map(attrs) do
    # Best-effort: audit failures should not block builds.
    try do
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
    rescue
      e ->
        Logger.debug("audit append failed (ignored): #{Exception.message(e)}")
        :ok
    end
  end

  defp step_summaries_for_audit(list) when is_list(list) do
    Enum.map(list, &step_summary_for_audit/1)
  end

  defp step_summary_for_audit(%{} = s) do
    %{
      name: Map.get(s, :name) || Map.get(s, "name"),
      command: Map.get(s, :command) || Map.get(s, "command"),
      exit_code: Map.get(s, :exit_code) || Map.get(s, "exit_code"),
      duration_ms: Map.get(s, :duration_ms) || Map.get(s, "duration_ms"),
      output_bytes: Map.get(s, :output_bytes) || Map.get(s, "output_bytes"),
      output_truncated: Map.get(s, :output_truncated) || Map.get(s, "output_truncated"),
      timeout_ms: Map.get(s, :timeout_ms) || Map.get(s, "timeout_ms")
    }
  end

  # ----------------------------------------------------------------------------
  # Output clamping (in-memory only)
  # ----------------------------------------------------------------------------

  defp clamp_output(output, max_bytes)
       when is_binary(output) and is_integer(max_bytes) and max_bytes > 0 do
    size = byte_size(output)

    if size <= max_bytes do
      {output, size, false}
    else
      {binary_part(output, 0, max_bytes), size, true}
    end
  end

  defp clamp_output(_output, _max_bytes), do: {"", 0, false}

  # ----------------------------------------------------------------------------
  # Small normalization utilities
  # ----------------------------------------------------------------------------

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

  defp normalize_actor_id(v) do
    v
    |> to_string()
    |> String.trim()
    |> case do
      "" -> "core"
      s -> String.slice(s, 0, 200)
    end
  end

  defp normalize_optional_string(nil), do: nil

  defp normalize_optional_string(v) when is_binary(v) do
    v = String.trim(v)
    if v == "", do: nil, else: String.slice(v, 0, 4_096)
  end

  defp normalize_optional_string(v), do: v |> to_string() |> normalize_optional_string()

  defp normalize_timeout_ms(n) when is_integer(n) and n > 0, do: min(n, 60 * 60_000)
  defp normalize_timeout_ms(_), do: @default_timeout_ms

  defp normalize_max_output_bytes(n) when is_integer(n) and n > 0, do: min(n, 2_000_000)
  defp normalize_max_output_bytes(_), do: @default_max_output_bytes

  defp normalize_mix_env(v) when is_binary(v) do
    v = String.trim(v)

    cond do
      v == "" -> "prod"
      byte_size(v) > 20 -> "prod"
      String.contains?(v, ["\u0000", "\n", "\r", " "]) -> "prod"
      true -> v
    end
  end

  defp normalize_mix_env(_), do: "prod"

  defp safe_reason(reason) when is_binary(reason), do: String.slice(String.trim(reason), 0, 500)

  defp safe_reason(reason) do
    reason
    |> inspect(limit: 20, printable_limit: 500)
    |> String.replace(~r/\r\n|\r|\n/, " ")
    |> String.slice(0, 500)
  end

  defp error(code, message, details \\ %{})
       when is_atom(code) and is_binary(message) and is_map(details) do
    %Error{code: code, message: message, details: details}
  end
end
