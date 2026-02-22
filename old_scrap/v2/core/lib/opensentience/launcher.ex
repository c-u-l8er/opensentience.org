defmodule OpenSentience.Launcher do
  @moduledoc """
  OpenSentience Core launcher (Phase 1): start/stop agent OS processes, persist run/log records,
  and emit audit events (best-effort, secret-free).

  This module is intentionally an **API wrapper** around:
  - catalog/discovery (manifest read; no code execution)
  - enablement approvals (deny-by-default; drift detection)
  - a per-run OS subprocess runner (`OpenSentience.Launcher.Runner`)
  - durable storage (`runs` + optional `logs` indexing)
  - audit log append-only events

  ## Safety posture

  - Running an agent is a trust boundary (executes code).
  - We never persist env vars (session tokens, etc.) to durable storage.
  - Log indexing into SQLite is optional and bounded; log lines are redacted/clamped.
  - File-backed log capture is handled by the runner and is bounded.

  ## Process model

  This module can run as a named GenServer (`OpenSentience.Launcher`) to track live runs
  (run_id -> runner pid) and coordinate stop requests.

  If the server isn't started (e.g., in early Phase 1 wiring), `ensure_started/0` will
  start it lazily so CLI tasks can still function.
  """

  use GenServer
  require Logger

  import Ecto.Query, warn: false

  alias OpenSentience.AuditLog
  alias OpenSentience.Catalog
  alias OpenSentience.Catalog.Agent
  alias OpenSentience.Discovery.ManifestReader
  alias OpenSentience.Enablement.Approvals
  alias OpenSentience.Launcher.CommandBuilder
  alias OpenSentience.Launcher.LogLine
  alias OpenSentience.Launcher.Run
  alias OpenSentience.Launcher.Runner
  alias OpenSentience.Paths
  alias OpenSentience.Repo

  defmodule Error do
    @moduledoc "Structured, secret-safe error for launcher operations."
    @enforce_keys [:code, :message]
    defstruct [:code, :message, details: %{}]

    @type t :: %__MODULE__{
            code: atom(),
            message: String.t(),
            details: map()
          }
  end

  @type actor_type :: :human | :system | :agent

  @default_mix_env "prod"
  @default_require_enabled true

  @default_stop_timeout_ms 5_000
  @default_exit_wait_ms 10_000

  # SQLite log indexing (optional) bounds:
  @default_log_db_lines 500

  # ----------------------------------------------------------------------------
  # Public API
  # ----------------------------------------------------------------------------

  @spec child_spec(term()) :: Supervisor.child_spec()
  def child_spec(arg) do
    %{
      id: __MODULE__,
      start: {__MODULE__, :start_link, [arg]},
      type: :worker,
      restart: :permanent,
      shutdown: 10_000
    }
  end

  @spec start_link(term()) :: GenServer.on_start()
  def start_link(arg \\ []) do
    GenServer.start_link(__MODULE__, arg, name: __MODULE__)
  end

  @doc """
  Ensures the launcher GenServer is running.

  This is useful for Phase 1 CLI tasks when the supervision tree wiring is not complete yet.
  """
  @spec ensure_started() :: :ok
  def ensure_started do
    case Process.whereis(__MODULE__) do
      pid when is_pid(pid) ->
        :ok

      nil ->
        case GenServer.start_link(__MODULE__, [], name: __MODULE__) do
          {:ok, _pid} -> :ok
          {:error, {:already_started, _pid}} -> :ok
          {:error, reason} -> raise "failed to start launcher: #{inspect(reason)}"
        end
    end
  end

  @doc """
  Starts an agent process.

  Options:
  - `:require_enabled?` (default #{inspect(@default_require_enabled)}) — enforce enablement drift gate before run
  - `:mix_env` (default #{inspect(@default_mix_env)}) — used for `mix_task` entrypoints
  - `:extra_args` — extra argv appended to the entrypoint-derived argv
  - `:actor_type` (default `:system`)
  - `:actor_id` (default `"core"`)
  - `:audit?` (default true)
  - `:correlation_id`, `:causation_id` — optional audit linkage

  Returns `{:ok, %{run_id, runner_pid, os_pid, log_path}}` or `{:error, %Error{...}}`.
  """
  @spec start_agent(String.t(), Keyword.t()) ::
          {:ok, map()} | {:error, Error.t()}
  def start_agent(agent_id, opts \\ []) when is_binary(agent_id) and is_list(opts) do
    ensure_started()
    GenServer.call(__MODULE__, {:start_agent, agent_id, opts}, 60_000)
  catch
    :exit, {:timeout, _} ->
      {:error, error(:timeout, "start_agent timed out", %{agent_id: agent_id})}
  end

  @doc """
  Stops the most recent active run for an agent (best-effort).

  Options:
  - `:timeout_ms` (default #{@default_stop_timeout_ms})
  - `:exit_wait_ms` (default #{@default_exit_wait_ms}) — how long to wait for runner exit after requesting stop
  - `:actor_type`, `:actor_id`, `:audit?`, `:correlation_id`, `:causation_id`

  Returns `:ok` or `{:error, %Error{...}}`.
  """
  @spec stop_agent(String.t(), Keyword.t()) :: :ok | {:error, Error.t()}
  def stop_agent(agent_id, opts \\ []) when is_binary(agent_id) and is_list(opts) do
    ensure_started()
    GenServer.call(__MODULE__, {:stop_agent, agent_id, opts}, 30_000)
  catch
    :exit, {:timeout, _} ->
      {:error, error(:timeout, "stop_agent timed out", %{agent_id: agent_id})}
  end

  @doc """
  Stops a specific run by run_id (best-effort).

  Options: same as `stop_agent/2`.
  """
  @spec stop_run(String.t(), Keyword.t()) :: :ok | {:error, Error.t()}
  def stop_run(run_id, opts \\ []) when is_binary(run_id) and is_list(opts) do
    ensure_started()
    GenServer.call(__MODULE__, {:stop_run, run_id, opts}, 30_000)
  catch
    :exit, {:timeout, _} ->
      {:error, error(:timeout, "stop_run timed out", %{run_id: run_id})}
  end

  @doc """
  Returns a list of live runs tracked by the launcher server (in-memory).
  """
  @spec live_runs() :: [map()]
  def live_runs do
    ensure_started()
    GenServer.call(__MODULE__, :live_runs, 10_000)
  end

  # ----------------------------------------------------------------------------
  # Runner callback entrypoints (called from runner process)
  # ----------------------------------------------------------------------------

  @doc false
  @spec __runner_log__(map()) :: :ok
  def __runner_log__(payload) when is_map(payload) do
    case Process.whereis(__MODULE__) do
      pid when is_pid(pid) ->
        GenServer.cast(pid, {:runner_log, payload})
        :ok

      _ ->
        :ok
    end
  end

  @doc false
  @spec __runner_exit__(map()) :: :ok
  def __runner_exit__(payload) when is_map(payload) do
    case Process.whereis(__MODULE__) do
      pid when is_pid(pid) ->
        GenServer.cast(pid, {:runner_exit, payload})
        :ok

      _ ->
        :ok
    end
  end

  # ----------------------------------------------------------------------------
  # GenServer
  # ----------------------------------------------------------------------------

  @impl true
  def init(_arg) do
    state = %{
      # run_id => %{agent_id, runner_pid, os_pid, log_path, stop_requested?: boolean, log_db_lines: integer}
      live: %{},
      # agent_id => run_id (latest live)
      by_agent: %{}
    }

    {:ok, state}
  end

  @impl true
  def handle_call(:live_runs, _from, state) do
    runs =
      state.live
      |> Enum.map(fn {run_id, info} ->
        Map.merge(%{run_id: run_id}, info)
      end)
      |> Enum.sort_by(& &1.run_id)

    {:reply, runs, state}
  end

  @impl true
  def handle_call({:start_agent, agent_id, opts}, _from, state) do
    case do_start_agent(agent_id, opts, state) do
      {:ok, reply, new_state} -> {:reply, {:ok, reply}, new_state}
      {:error, %Error{} = e, new_state} -> {:reply, {:error, e}, new_state}
    end
  end

  @impl true
  def handle_call({:stop_agent, agent_id, opts}, _from, state) do
    case do_stop_agent(agent_id, opts, state) do
      {:ok, new_state} -> {:reply, :ok, new_state}
      {:error, %Error{} = e, new_state} -> {:reply, {:error, e}, new_state}
    end
  end

  @impl true
  def handle_call({:stop_run, run_id, opts}, _from, state) do
    case do_stop_run(run_id, opts, state) do
      {:ok, new_state} -> {:reply, :ok, new_state}
      {:error, %Error{} = e, new_state} -> {:reply, {:error, e}, new_state}
    end
  end

  @impl true
  def handle_cast({:runner_log, payload}, state) do
    state = maybe_index_log_line(payload, state)
    {:noreply, state}
  end

  @impl true
  def handle_cast({:runner_exit, payload}, state) do
    state = handle_runner_exit(payload, state)
    {:noreply, state}
  end

  @impl true
  def handle_info({:DOWN, _ref, :process, pid, reason}, state) do
    # Best-effort: if a runner died without calling on_exit, attempt to reconcile.
    {run_id, info} =
      Enum.find(state.live, fn {_run_id, info} ->
        info.runner_pid == pid
      end) || {nil, nil}

    if run_id do
      Logger.debug("runner process down (run_id=#{run_id}): #{safe_reason(reason)}")

      # Mark crashed if still active in DB.
      _ =
        finalize_run_exit(run_id, info.agent_id, info.os_pid, nil,
          stop_requested?: info.stop_requested?,
          reason: reason
        )

      new_state =
        state
        |> drop_live_run(run_id)

      {:noreply, new_state}
    else
      {:noreply, state}
    end
  end

  # ----------------------------------------------------------------------------
  # Start logic
  # ----------------------------------------------------------------------------

  defp do_start_agent(agent_id, opts, state) do
    actor_type = normalize_actor_type(Keyword.get(opts, :actor_type, :system))
    actor_id = normalize_actor_id(Keyword.get(opts, :actor_id, "core"))
    audit? = Keyword.get(opts, :audit?, true) != false
    correlation_id = normalize_optional_string(Keyword.get(opts, :correlation_id))
    causation_id = normalize_optional_string(Keyword.get(opts, :causation_id))

    require_enabled? = Keyword.get(opts, :require_enabled?, @default_require_enabled) == true
    mix_env = normalize_mix_env(Keyword.get(opts, :mix_env, @default_mix_env))

    extra_args = Keyword.get(opts, :extra_args, [])

    with :ok <- validate_agent_id(agent_id),
         %Agent{} = agent <- Catalog.get_agent(agent_id) || :not_found,
         {:ok, install_path} <- resolve_install_path(agent),
         {:ok, manifest} <- read_manifest(agent),
         :ok <- maybe_require_enabled(require_enabled?, agent, manifest),
         {:ok, command} <- build_command(manifest, install_path, mix_env, extra_args),
         {:ok, run} <- create_run_record(agent_id),
         {:ok, log_path} <- ensure_log_path(agent_id, run.run_id) do
      # Start runner (prefer DynamicSupervisor if present, otherwise start_link directly).
      env =
        build_run_env(agent_id, run.run_id, install_path)
        |> maybe_put_env_mix_env(command.kind, mix_env)

      on_log = fn log_payload -> __runner_log__(log_payload) end
      on_exit = fn exit_payload -> __runner_exit__(exit_payload) end

      runner_opts = [
        run_id: run.run_id,
        agent_id: agent_id,
        command: [command.cmd | command.args],
        cwd: command.cwd || install_path,
        env: env,
        # Runner writes to <logs_dir>/<agent_id>/<run_id>.log by default; we pass log_dir for clarity.
        log_dir: Paths.logs_dir(),
        on_log: on_log,
        on_exit: on_exit
      ]

      case start_runner_child(runner_opts) do
        {:ok, runner_pid} ->
          Process.monitor(runner_pid)

          os_pid =
            try do
              Runner.os_pid(runner_pid)
            catch
              _, _ -> nil
            end

          _ = Run.mark_running(run.run_id, pid: os_pid)
          _ = Catalog.set_status(agent_id, "running")

          emit_audit(audit?, %{
            event_type: "agent.run_started",
            actor_type: actor_type,
            actor_id: actor_id,
            subject_type: "run",
            subject_id: run.run_id,
            correlation_id: correlation_id,
            causation_id: causation_id,
            severity: :info,
            metadata: %{
              agent_id: agent_id,
              trust_boundary: "executes_code",
              pid: os_pid,
              log_path: log_path,
              command: CommandBuilder.safe_summary(command)
            }
          })

          new_state =
            state
            |> put_live_run(run.run_id, %{
              agent_id: agent_id,
              runner_pid: runner_pid,
              os_pid: os_pid,
              log_path: log_path,
              stop_requested?: false,
              log_db_lines: 0,
              max_log_db_lines:
                opts
                |> Keyword.get(:log_db_lines, @default_log_db_lines)
                |> normalize_log_db_lines()
            })

          {:ok,
           %{
             run_id: run.run_id,
             runner_pid: runner_pid,
             os_pid: os_pid,
             log_path: log_path
           }, new_state}

        {:error, reason} ->
          _ = Catalog.set_error(agent_id, "run failed: #{safe_reason(reason)}")
          _ = Run.mark_crashed(run.run_id, exit_code: nil, reason: "failed_to_start")

          {:error, error(:run_failed, "Failed to start runner", %{reason: safe_reason(reason)}),
           state}
      end
    else
      :not_found ->
        {:error, error(:not_found, "No agent with id #{agent_id} in the catalog"), state}

      {:error, %Error{} = e} ->
        emit_audit(audit?, %{
          event_type: "security.denied",
          actor_type: actor_type,
          actor_id: actor_id,
          subject_type: "agent",
          subject_id: agent_id,
          correlation_id: correlation_id,
          causation_id: causation_id,
          severity: :security,
          metadata: %{
            action: "agent.run",
            reason: e.message,
            code: to_string(e.code)
          }
        })

        {:error, e, state}

      {:error, other} ->
        {:error, error(:run_failed, "Run failed", %{reason: safe_reason(other)}), state}
    end
  end

  defp resolve_install_path(%Agent{} = agent) do
    path = agent.install_path |> normalize_optional_string()

    cond do
      is_nil(path) ->
        {:error,
         error(:not_installed, "Agent is not installed (install_path missing)", %{
           agent_id: agent.agent_id
         })}

      not File.dir?(path) ->
        {:error,
         error(:invalid_install_path, "Agent install_path does not exist", %{
           agent_id: agent.agent_id,
           install_path: path
         })}

      true ->
        {:ok, Path.expand(path)}
    end
  end

  defp read_manifest(%Agent{} = agent) do
    manifest_path = agent.manifest_path |> normalize_optional_string()

    cond do
      is_nil(manifest_path) ->
        {:error,
         error(:missing_manifest, "Agent has no manifest_path in catalog", %{
           agent_id: agent.agent_id
         })}

      true ->
        case ManifestReader.read(manifest_path) do
          {:ok, m} ->
            {:ok, m}

          {:error, err} ->
            {:error,
             error(:invalid_manifest, "Failed to read manifest", %{
               message: Map.get(err, :message),
               path: manifest_path
             })}
        end
    end
  end

  defp maybe_require_enabled(false, _agent, _manifest), do: :ok

  defp maybe_require_enabled(true, %Agent{} = agent, manifest) do
    requested_hash =
      Map.get(manifest, :requested_permissions_hash) ||
        Map.get(manifest, "requested_permissions_hash")

    manifest_hash = Map.get(manifest, :manifest_hash) || Map.get(manifest, "manifest_hash")

    scope = %{
      manifest_hash: normalize_optional_string(manifest_hash),
      source_ref: normalize_optional_string(agent.source_ref)
    }

    if is_binary(requested_hash) do
      case Approvals.ensure_enabled(agent.agent_id, requested_hash, scope) do
        {:ok, _approved_permissions} ->
          :ok

        {:error, :not_enabled} ->
          {:error,
           error(:not_enabled, "Agent is not enabled (no active approval)", %{
             agent_id: agent.agent_id
           })}

        {:error, :approval_drift} ->
          {:error,
           error(
             :approval_drift,
             "Approval drift: manifest permissions changed; re-approve to run",
             %{agent_id: agent.agent_id}
           )}

        {:error, other} ->
          {:error, error(:not_enabled, "Enablement check failed", %{reason: safe_reason(other)})}
      end
    else
      {:error,
       error(:invalid_manifest, "Manifest missing requested_permissions_hash", %{
         agent_id: agent.agent_id
       })}
    end
  end

  defp build_command(manifest, install_path, mix_env, extra_args) do
    entrypoint = Map.get(manifest, :entrypoint) || Map.get(manifest, "entrypoint") || %{}

    opts = [
      cwd: install_path,
      env: %{},
      extra_args: extra_args,
      allow_types: [:mix_task, :command]
    ]

    case CommandBuilder.build(entrypoint, opts) do
      {:ok, %CommandBuilder.Command{} = cmd} ->
        # For mix tasks, we rely on env MIX_ENV rather than baking it into argv.
        {:ok, cmd}

      {:error, %CommandBuilder.Error{} = err} ->
        {:error, error(:invalid_entrypoint, err.message, err.details)}

      other ->
        {:error,
         error(:invalid_entrypoint, "Failed to build entrypoint command", %{
           reason: safe_reason(other)
         })}
    end
  rescue
    e ->
      {:error,
       error(:invalid_entrypoint, "Failed to build entrypoint command", %{
         exception: Exception.message(e)
       })}
  end

  defp create_run_record(agent_id) do
    case Run.start_run(agent_id) do
      {:ok, %Run{} = run} ->
        {:ok, run}

      {:error, %Ecto.Changeset{} = cs} ->
        {:error,
         error(:db_error, "Failed to create run record", %{errors: safe_changeset_errors(cs)})}

      {:error, other} ->
        {:error, error(:db_error, "Failed to create run record", %{reason: safe_reason(other)})}
    end
  rescue
    e ->
      {:error,
       error(:db_error, "Failed to create run record", %{exception: Exception.message(e)})}
  end

  defp ensure_log_path(agent_id, run_id) do
    dir = Path.join(Paths.logs_dir(), agent_id)

    with :ok <- mkdir_p(dir) do
      {:ok, Path.join(dir, "#{run_id}.log")}
    end
  rescue
    e ->
      {:error,
       error(:log_path_failed, "Failed to prepare log path", %{exception: Exception.message(e)})}
  end

  defp mkdir_p(path) do
    case File.mkdir_p(path) do
      :ok ->
        :ok

      {:error, reason} ->
        {:error,
         error(:mkdir_failed, "Failed to create log directory", %{
           path: path,
           reason: inspect(reason)
         })}
    end
  end

  defp start_runner_child(runner_opts) when is_list(runner_opts) do
    dynsup = Process.whereis(OpenSentience.Launcher.DynamicSupervisor)

    if is_pid(dynsup) do
      case DynamicSupervisor.start_child(
             OpenSentience.Launcher.DynamicSupervisor,
             {Runner, runner_opts}
           ) do
        {:ok, pid} -> {:ok, pid}
        {:error, {:already_started, pid}} -> {:ok, pid}
        {:error, reason} -> {:error, reason}
      end
    else
      # Fallback: run un-supervised (still separate OS process boundary).
      case Runner.start_link(runner_opts) do
        {:ok, pid} -> {:ok, pid}
        {:error, reason} -> {:error, reason}
      end
    end
  end

  defp build_run_env(agent_id, run_id, install_path) do
    # Never persist these env vars durably. They are passed only to the agent process.
    session_token = generate_session_token()

    parent_path =
      case System.get_env("PATH") do
        nil -> "/usr/local/bin:/usr/bin:/bin"
        v -> v |> to_string() |> String.trim()
      end

    mix_bin =
      case System.get_env("OPENSENTIENCE_MIX_BIN") do
        nil ->
          nil

        v ->
          v = v |> to_string() |> String.trim()
          if v == "", do: nil, else: v
      end

    path =
      case mix_bin do
        nil ->
          parent_path

        v ->
          if String.contains?(v, "/") do
            dir = Path.dirname(v)

            if parent_path == "" do
              dir
            else
              dir <> ":" <> parent_path
            end
          else
            parent_path
          end
      end

    env =
      %{
        "OPENSENTIENCE_HOME" => Paths.home(),
        "OPENSENTIENCE_AGENT_ID" => agent_id,
        "OPENSENTIENCE_RUN_ID" => run_id,
        "OPENSENTIENCE_INSTALL_PATH" => install_path,
        "OPENSENTIENCE_SESSION_TOKEN" => session_token,
        "PATH" => path
      }

    if is_binary(mix_bin) do
      Map.put(env, "OPENSENTIENCE_MIX_BIN", mix_bin)
    else
      env
    end
  end

  defp maybe_put_env_mix_env(env_map, :mix_task, mix_env) when is_map(env_map) do
    Map.put(env_map, "MIX_ENV", mix_env)
  end

  defp maybe_put_env_mix_env(env_map, _kind, _mix_env), do: env_map

  defp generate_session_token do
    32
    |> :crypto.strong_rand_bytes()
    |> Base.url_encode64(padding: false)
  end

  # ----------------------------------------------------------------------------
  # Stop logic
  # ----------------------------------------------------------------------------

  defp do_stop_agent(agent_id, opts, state) do
    actor_type = normalize_actor_type(Keyword.get(opts, :actor_type, :system))
    actor_id = normalize_actor_id(Keyword.get(opts, :actor_id, "core"))
    audit? = Keyword.get(opts, :audit?, true) != false
    correlation_id = normalize_optional_string(Keyword.get(opts, :correlation_id))
    causation_id = normalize_optional_string(Keyword.get(opts, :causation_id))

    timeout_ms =
      opts
      |> Keyword.get(:timeout_ms, @default_stop_timeout_ms)
      |> normalize_timeout_ms(@default_stop_timeout_ms)

    exit_wait_ms =
      opts
      |> Keyword.get(:exit_wait_ms, @default_exit_wait_ms)
      |> normalize_timeout_ms(@default_exit_wait_ms)

    with :ok <- validate_agent_id(agent_id),
         {:ok, run_id} <- find_active_run_id_for_agent(agent_id, state) do
      emit_audit(audit?, %{
        event_type: "agent.run_stop_requested",
        actor_type: actor_type,
        actor_id: actor_id,
        subject_type: "agent",
        subject_id: agent_id,
        correlation_id: correlation_id,
        causation_id: causation_id,
        severity: :info,
        metadata: %{
          run_id: run_id,
          timeout_ms: timeout_ms
        }
      })

      case do_stop_run(run_id, Keyword.put(opts, :timeout_ms, timeout_ms), state) do
        {:ok, new_state} ->
          # Best-effort wait for exit to reflect status quickly in CLI flows.
          _ = best_effort_wait_for_run_exit(run_id, exit_wait_ms)
          {:ok, new_state}

        {:error, e, new_state} ->
          {:error, e, new_state}
      end
    else
      {:error, %Error{} = e} ->
        {:error, e, state}

      {:error, other} ->
        {:error, error(:stop_failed, "Stop failed", %{reason: safe_reason(other)}), state}
    end
  end

  defp do_stop_run(run_id, opts, state) do
    timeout_ms =
      opts
      |> Keyword.get(:timeout_ms, @default_stop_timeout_ms)
      |> normalize_timeout_ms(@default_stop_timeout_ms)

    info = state.live[run_id]

    cond do
      is_map(info) and is_pid(info.runner_pid) ->
        # Ask the runner to stop; it will TERM then KILL and eventually call on_exit.
        _ = Runner.stop(info.runner_pid, :stop_requested)

        new_state =
          state
          |> put_in([:live, run_id, :stop_requested?], true)

        {:ok, new_state}

      true ->
        # Fallback: if we can't find the runner pid, attempt to kill by OS pid from the runs record.
        case Repo.get(Run, run_id) do
          nil ->
            {:error, error(:not_found, "No run with id #{run_id}", %{run_id: run_id}), state}

          %Run{} = run ->
            _ = best_effort_kill_pid(run.pid, timeout_ms)
            {:ok, state}
        end
    end
  rescue
    e ->
      {:error, error(:stop_failed, "Stop failed", %{exception: Exception.message(e)}), state}
  end

  defp find_active_run_id_for_agent(agent_id, state) do
    # Prefer in-memory mapping
    run_id = state.by_agent[agent_id]

    if is_binary(run_id) and Map.has_key?(state.live, run_id) do
      {:ok, run_id}
    else
      # Fallback to durable latest active run
      run =
        Run
        |> where([r], r.agent_id == ^agent_id and r.status in ["starting", "running"])
        |> order_by([r], desc: r.started_at, desc: r.run_id)
        |> limit(1)
        |> Repo.one()

      if run do
        {:ok, run.run_id}
      else
        {:error, error(:not_running, "Agent is not running", %{agent_id: agent_id})}
      end
    end
  end

  defp best_effort_wait_for_run_exit(run_id, wait_ms) do
    deadline = System.monotonic_time(:millisecond) + wait_ms

    Stream.repeatedly(fn -> :ok end)
    |> Enum.reduce_while(:ok, fn _, _ ->
      if System.monotonic_time(:millisecond) >= deadline do
        {:halt, :timeout}
      else
        case Repo.get(Run, run_id) do
          %Run{status: status} when status in ["stopped", "crashed"] ->
            {:halt, :ok}

          _ ->
            Process.sleep(50)
            {:cont, :ok}
        end
      end
    end)

    :ok
  rescue
    _ -> :ok
  end

  defp best_effort_kill_pid(nil, _timeout_ms), do: :noop

  defp best_effort_kill_pid(pid, timeout_ms) when is_integer(pid) and pid > 0 do
    # TERM then wait then KILL.
    _ = kill_signal(pid, "TERM")

    if wait_pid_gone?(pid, timeout_ms) do
      :ok
    else
      _ = kill_signal(pid, "KILL")
      _ = wait_pid_gone?(pid, min(timeout_ms, 2_000))
      :ok
    end
  rescue
    _ -> :noop
  end

  defp kill_signal(pid, sig) when is_integer(pid) and is_binary(sig) do
    case System.find_executable("kill") do
      nil ->
        :noop

      kill_path ->
        _ = System.cmd(kill_path, ["-#{sig}", Integer.to_string(pid)], stderr_to_stdout: true)
        :ok
    end
  end

  defp wait_pid_gone?(pid, timeout_ms)
       when is_integer(pid) and is_integer(timeout_ms) and timeout_ms >= 0 do
    deadline = System.monotonic_time(:millisecond) + timeout_ms

    Stream.repeatedly(fn -> :ok end)
    |> Enum.reduce_while(false, fn _, _ ->
      if System.monotonic_time(:millisecond) >= deadline do
        {:halt, false}
      else
        case System.find_executable("kill") do
          nil ->
            {:halt, false}

          kill_path ->
            {_out, code} =
              System.cmd(kill_path, ["-0", Integer.to_string(pid)], stderr_to_stdout: true)

            if code == 0 do
              Process.sleep(50)
              {:cont, false}
            else
              {:halt, true}
            end
        end
      end
    end)
  rescue
    _ -> false
  end

  # ----------------------------------------------------------------------------
  # Log indexing (SQLite) (optional)
  # ----------------------------------------------------------------------------

  defp maybe_index_log_line(payload, state) do
    run_id = payload[:run_id] || payload["run_id"]
    agent_id = payload[:agent_id] || payload["agent_id"]
    line = payload[:line] || payload["line"]
    at = payload[:at] || payload["at"] || DateTime.utc_now()

    cond do
      not (is_binary(run_id) and is_binary(agent_id) and is_binary(line)) ->
        state

      not Map.has_key?(state.live, run_id) ->
        # We only index logs while the run is live (keeps DB bounded).
        state

      true ->
        info = state.live[run_id]
        current = info.log_db_lines || 0
        max_lines = info.max_log_db_lines || @default_log_db_lines

        if current >= max_lines do
          state
        else
          _ =
            %{
              agent_id: agent_id,
              run_id: run_id,
              at: at,
              stream: "stdout",
              line: line
            }
            |> LogLine.create_changeset()
            |> Repo.insert()

          put_in(state, [:live, run_id, :log_db_lines], current + 1)
        end
    end
  rescue
    _ -> state
  end

  # ----------------------------------------------------------------------------
  # Exit handling
  # ----------------------------------------------------------------------------

  defp handle_runner_exit(payload, state) do
    run_id = payload[:run_id] || payload["run_id"]
    agent_id = payload[:agent_id] || payload["agent_id"]
    os_pid = payload[:os_pid] || payload["os_pid"]
    exit_code = payload[:exit_code] || payload["exit_code"]
    reason = payload[:reason] || payload["reason"]

    info = state.live[run_id] || %{}
    stop_requested? = Map.get(info, :stop_requested?, false)

    _ =
      finalize_run_exit(run_id, agent_id, os_pid, exit_code,
        stop_requested?: stop_requested?,
        reason: reason
      )

    drop_live_run(state, run_id)
  end

  defp drop_live_run(state, run_id) do
    agent_id = get_in(state, [:live, run_id, :agent_id])

    state =
      state
      |> update_in([:live], &Map.delete(&1, run_id))

    # Clean by_agent mapping if it points at this run_id
    if is_binary(agent_id) and state.by_agent[agent_id] == run_id do
      update_in(state, [:by_agent], &Map.delete(&1, agent_id))
    else
      state
    end
  end

  defp finalize_run_exit(run_id, agent_id, os_pid, exit_code, opts) do
    stop_requested? = Keyword.get(opts, :stop_requested?, false) == true
    reason = Keyword.get(opts, :reason)

    status =
      cond do
        stop_requested? -> "stopped"
        is_integer(exit_code) and exit_code == 0 -> "stopped"
        true -> "crashed"
      end

    _ =
      case status do
        "stopped" ->
          Run.mark_stopped(run_id,
            exit_code: normalize_exit_code(exit_code),
            reason: safe_exit_reason(reason)
          )

        "crashed" ->
          Run.mark_crashed(run_id,
            exit_code: normalize_exit_code(exit_code),
            reason: safe_exit_reason(reason)
          )
      end

    if is_binary(agent_id) do
      case status do
        "stopped" ->
          _ = Catalog.set_status(agent_id, "stopped")
          :ok

        "crashed" ->
          _ = Catalog.set_error(agent_id, "run crashed (exit_code=#{inspect(exit_code)})")
          :ok
      end
    end

    emit_audit(true, %{
      event_type: if(status == "stopped", do: "agent.run_stopped", else: "agent.run_crashed"),
      actor_type: :system,
      actor_id: "core",
      subject_type: "run",
      subject_id: run_id,
      severity: if(status == "stopped", do: :info, else: :error),
      metadata: %{
        agent_id: agent_id,
        pid: os_pid,
        exit_code: normalize_exit_code(exit_code)
      }
    })

    :ok
  rescue
    _ -> :ok
  end

  # ----------------------------------------------------------------------------
  # State helpers
  # ----------------------------------------------------------------------------

  defp put_live_run(state, run_id, info) do
    agent_id = info.agent_id

    state
    |> put_in([:live, run_id], info)
    |> put_in([:by_agent, agent_id], run_id)
  end

  # ----------------------------------------------------------------------------
  # Audit helpers (best-effort)
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
    _ -> :ok
  end

  # ----------------------------------------------------------------------------
  # Validation / normalization
  # ----------------------------------------------------------------------------

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

  defp validate_agent_id(_), do: {:error, error(:invalid_agent_id, "agent_id must be a string")}

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

  defp normalize_mix_env(v) when is_binary(v) do
    v = String.trim(v)

    cond do
      v == "" -> @default_mix_env
      byte_size(v) > 20 -> @default_mix_env
      String.contains?(v, ["\u0000", "\n", "\r", " "]) -> @default_mix_env
      true -> v
    end
  end

  defp normalize_mix_env(v), do: v |> to_string() |> normalize_mix_env()

  defp normalize_timeout_ms(n, default) when is_integer(n) and n > 0, do: min(n, 60_000)
  defp normalize_timeout_ms(_, default), do: default

  defp normalize_exit_code(code) when is_integer(code) and code >= 0, do: code
  defp normalize_exit_code(_), do: nil

  defp normalize_log_db_lines(n) when is_integer(n) and n >= 0, do: min(n, 5_000)
  defp normalize_log_db_lines(_), do: @default_log_db_lines

  defp safe_exit_reason(nil), do: nil
  defp safe_exit_reason(reason) when is_binary(reason), do: safe_reason(reason)
  defp safe_exit_reason(reason), do: safe_reason(reason)

  defp safe_reason(reason) when is_binary(reason) do
    reason
    |> String.replace(~r/\r\n|\r|\n/, " ")
    |> String.slice(0, 500)
  end

  defp safe_reason(reason) do
    reason
    |> inspect(limit: 20, printable_limit: 500)
    |> String.replace(~r/\r\n|\r|\n/, " ")
    |> String.slice(0, 500)
  end

  defp safe_changeset_errors(%Ecto.Changeset{} = cs) do
    try do
      Ecto.Changeset.traverse_errors(cs, fn {msg, opts} ->
        Enum.reduce(opts, msg, fn {k, v}, acc ->
          String.replace(acc, "%{#{k}}", to_string(v))
        end)
      end)
    rescue
      _ -> %{"error" => "invalid_changeset"}
    end
  end

  defp error(code, message, details \\ %{})
       when is_atom(code) and is_binary(message) and is_map(details) do
    %Error{code: code, message: message, details: details}
  end
end
