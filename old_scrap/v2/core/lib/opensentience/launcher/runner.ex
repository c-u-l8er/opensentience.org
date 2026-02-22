defmodule OpenSentience.Launcher.Runner do
  @moduledoc """
  Per-run process owner + log capture GenServer (Phase 1).

  This server owns the OS process Port for a single agent run and is responsible for:
  - starting the subprocess in a controlled way (explicit command + cwd + env)
  - capturing stdout/stderr (merged) as **redacted, bounded** log lines
  - persisting logs to a run-scoped file (best-effort)
  - notifying listeners about log lines and exit

  Security invariants (portfolio):
  - Do NOT persist secrets in durable logs.
  - Redaction here is defense-in-depth; callers should avoid sending secrets to subprocesses.
  - All persisted output is bounded (max line length, max total bytes).

  Notes:
  - In Phase 1, we merge stderr into stdout for simplicity. Phase 2 can split streams.
  - Stop semantics are best-effort: we send SIGTERM then SIGKILL (Unix-like),
    and also close the port (stdin). This should be reliable for most agent processes.
  """

  use GenServer
  require Logger

  alias OpenSentience.AuditLog.Redaction
  alias OpenSentience.Paths

  @type run_id :: String.t()
  @type agent_id :: String.t()

  @default_line_max_bytes 8_192
  @default_max_log_bytes 5_000_000
  @default_exit_grace_ms 3_000

  @typedoc """
  Runner start options.

  Required:
  - `:run_id` (string)
  - `:agent_id` (string)
  - `:command` (list of strings) - `["/path/to/exe", "arg1", ...]` OR `["exe", ...]`
  - `:cwd` (string) - working directory

  Optional:
  - `:env` (keyword or map) - environment vars for the process
  - `:name` - GenServer name
  - `:log_dir` - override directory to write logs (default: `OpenSentience.Paths.logs_dir/0`)
  - `:line_max_bytes` - max bytes per stored line (default: #{@default_line_max_bytes})
  - `:max_log_bytes` - max total bytes persisted for this run (default: #{@default_max_log_bytes})
  - `:exit_grace_ms` - grace period between TERM and KILL (default: #{@default_exit_grace_ms})
  - `:on_exit` - optional callback `(exit_info_map -> any)` invoked when process exits
  - `:on_log` - optional callback `(log_line_map -> any)` invoked per log line (in addition to listeners)
  """
  @type start_opt ::
          {:run_id, run_id()}
          | {:agent_id, agent_id()}
          | {:command, [String.t()]}
          | {:cwd, String.t()}
          | {:env, map() | Keyword.t()}
          | {:name, GenServer.name()}
          | {:log_dir, String.t()}
          | {:line_max_bytes, pos_integer()}
          | {:max_log_bytes, pos_integer()}
          | {:exit_grace_ms, non_neg_integer()}
          | {:on_exit, (map() -> any())}
          | {:on_log, (map() -> any())}

  @typedoc "A safe log line notification payload."
  @type log_line :: %{
          run_id: run_id(),
          agent_id: agent_id(),
          at: DateTime.t(),
          stream: :stdout,
          line: String.t(),
          truncated?: boolean()
        }

  @typedoc "A safe exit notification payload."
  @type exit_info :: %{
          run_id: run_id(),
          agent_id: agent_id(),
          at: DateTime.t(),
          os_pid: non_neg_integer() | nil,
          exit_code: non_neg_integer() | nil,
          reason: term()
        }

  # ----------------------------------------------------------------------------
  # Public API
  # ----------------------------------------------------------------------------

  @spec child_spec([start_opt()]) :: Supervisor.child_spec()
  def child_spec(opts) when is_list(opts) do
    %{
      id: {__MODULE__, Keyword.get(opts, :run_id) || make_ref()},
      start: {__MODULE__, :start_link, [opts]},
      restart: :transient,
      shutdown: 10_000,
      type: :worker
    }
  end

  @spec start_link([start_opt()]) :: GenServer.on_start()
  def start_link(opts) when is_list(opts) do
    name = Keyword.get(opts, :name)

    if name do
      GenServer.start_link(__MODULE__, opts, name: name)
    else
      GenServer.start_link(__MODULE__, opts)
    end
  end

  @doc "Returns a snapshot of runner state (safe fields only)."
  @spec status(GenServer.server()) :: map()
  def status(server) do
    GenServer.call(server, :status)
  end

  @doc "Returns the OS pid for the subprocess if available."
  @spec os_pid(GenServer.server()) :: non_neg_integer() | nil
  def os_pid(server) do
    GenServer.call(server, :os_pid)
  end

  @doc """
  Adds a listener process. The listener receives:
  - `{:opensentience_runner_log, run_id, log_line_map}`
  - `{:opensentience_runner_exit, run_id, exit_info_map}`
  """
  @spec add_listener(GenServer.server(), pid()) :: :ok
  def add_listener(server, pid) when is_pid(pid) do
    GenServer.call(server, {:add_listener, pid})
  end

  @doc "Removes a previously added listener."
  @spec remove_listener(GenServer.server(), pid()) :: :ok
  def remove_listener(server, pid) when is_pid(pid) do
    GenServer.call(server, {:remove_listener, pid})
  end

  @doc """
  Requests the runner to stop the subprocess.

  This is best-effort:
  - sends SIGTERM (if possible)
  - waits `exit_grace_ms`
  - sends SIGKILL (if needed)
  - closes the port

  Returns `:ok` once the stop request is issued (not necessarily when exited).
  """
  @spec stop(GenServer.server(), term()) :: :ok
  def stop(server, reason \\ :stop_requested) do
    GenServer.cast(server, {:stop, reason})
  end

  # ----------------------------------------------------------------------------
  # GenServer callbacks
  # ----------------------------------------------------------------------------

  @impl true
  def init(opts) do
    Process.flag(:trap_exit, true)

    run_id = opts |> Keyword.fetch!(:run_id) |> to_string() |> String.trim()
    agent_id = opts |> Keyword.fetch!(:agent_id) |> to_string() |> String.trim()
    command = opts |> Keyword.fetch!(:command) |> normalize_command!()
    cwd = opts |> Keyword.fetch!(:cwd) |> to_string() |> String.trim() |> Path.expand()

    env = opts |> Keyword.get(:env, %{}) |> normalize_env()

    line_max_bytes =
      opts
      |> Keyword.get(:line_max_bytes, @default_line_max_bytes)
      |> normalize_pos_int(@default_line_max_bytes)

    max_log_bytes =
      opts
      |> Keyword.get(:max_log_bytes, @default_max_log_bytes)
      |> normalize_pos_int(@default_max_log_bytes)

    exit_grace_ms =
      opts
      |> Keyword.get(:exit_grace_ms, @default_exit_grace_ms)
      |> normalize_nonneg_int(@default_exit_grace_ms)

    log_dir =
      opts
      |> Keyword.get(:log_dir)
      |> case do
        nil -> Paths.logs_dir()
        p -> Path.expand(to_string(p))
      end

    on_exit = opts |> Keyword.get(:on_exit)
    on_log = opts |> Keyword.get(:on_log)

    with :ok <- validate_id(:run_id, run_id),
         :ok <- validate_id(:agent_id, agent_id),
         :ok <- validate_cwd(cwd),
         {:ok, log_path} <- build_log_path(log_dir, agent_id, run_id),
         {:ok, io} <- open_log_file(log_path) do
      {exe, args} = split_command(command)

      port =
        Port.open(
          {:spawn_executable, to_charlist(exe)},
          [
            :binary,
            :exit_status,
            :use_stdio,
            :stderr_to_stdout,
            {:args, Enum.map(args, &to_charlist/1)},
            {:cd, to_charlist(cwd)},
            {:env, Enum.map(env, fn {k, v} -> {to_charlist(k), to_charlist(v)} end)},
            {:line, line_max_bytes}
          ]
        )

      os_pid = port_os_pid(port)

      state = %{
        run_id: run_id,
        agent_id: agent_id,
        cwd: cwd,
        command: command,
        env: env,
        port: port,
        os_pid: os_pid,
        log_dir: log_dir,
        log_path: log_path,
        log_io: io,
        log_bytes: 0,
        max_log_bytes: max_log_bytes,
        line_max_bytes: line_max_bytes,
        exit_grace_ms: exit_grace_ms,
        listeners: MapSet.new(),
        stop_requested?: false,
        stop_reason: nil,
        on_exit: if(is_function(on_exit, 1), do: on_exit, else: nil),
        on_log: if(is_function(on_log, 1), do: on_log, else: nil),
        started_at: DateTime.utc_now()
      }

      Logger.info(
        "runner started (run_id=#{run_id} agent_id=#{agent_id} os_pid=#{inspect(os_pid)})"
      )

      {:ok, state}
    else
      {:error, reason} ->
        Logger.error("runner init failed: #{safe_reason(reason)}")
        {:stop, reason}
    end
  end

  @impl true
  def handle_call(:status, _from, state) do
    snapshot = %{
      run_id: state.run_id,
      agent_id: state.agent_id,
      cwd: state.cwd,
      command: state.command,
      os_pid: state.os_pid,
      log_path: state.log_path,
      started_at: state.started_at,
      stop_requested?: state.stop_requested?,
      stop_reason: state.stop_reason,
      log_bytes: state.log_bytes,
      max_log_bytes: state.max_log_bytes
    }

    {:reply, snapshot, state}
  end

  @impl true
  def handle_call(:os_pid, _from, state) do
    {:reply, state.os_pid, state}
  end

  @impl true
  def handle_call({:add_listener, pid}, _from, state) do
    Process.monitor(pid)
    {:reply, :ok, %{state | listeners: MapSet.put(state.listeners, pid)}}
  end

  @impl true
  def handle_call({:remove_listener, pid}, _from, state) do
    {:reply, :ok, %{state | listeners: MapSet.delete(state.listeners, pid)}}
  end

  @impl true
  def handle_cast({:stop, reason}, state) do
    state =
      state
      |> Map.put(:stop_requested?, true)
      |> Map.put(:stop_reason, reason)

    # Best-effort stop: TERM then (after grace) KILL, and close the port.
    _ = send_term(state.os_pid)
    Process.send_after(self(), :kill_if_still_running, state.exit_grace_ms)

    # Closing the port may also terminate the process (or at least close stdin).
    safe_port_close(state.port)

    {:noreply, state}
  end

  @impl true
  def handle_info({port, {:data, data}}, %{port: port} = state) do
    # With {:line, n}, `data` is a single line without newline (binary).
    at = DateTime.utc_now()
    raw_line = normalize_line(data)
    redacted = Redaction.redact_string(raw_line, max_string: min(state.line_max_bytes, 2_000))

    {persisted?, state} = maybe_persist_log_line(state, at, redacted)

    payload = %{
      run_id: state.run_id,
      agent_id: state.agent_id,
      at: at,
      stream: :stdout,
      line: redacted,
      truncated?: not persisted?
    }

    notify_listeners(state.listeners, {:opensentience_runner_log, state.run_id, payload})
    maybe_call(state.on_log, payload)

    {:noreply, state}
  end

  @impl true
  def handle_info({port, {:exit_status, code}}, %{port: port} = state) do
    exit_code = normalize_exit_code(code)
    at = DateTime.utc_now()

    Logger.info(
      "runner exit (run_id=#{state.run_id} agent_id=#{state.agent_id} exit_code=#{inspect(exit_code)})"
    )

    exit_info = %{
      run_id: state.run_id,
      agent_id: state.agent_id,
      at: at,
      os_pid: state.os_pid,
      exit_code: exit_code,
      reason: state.stop_reason || :exited
    }

    notify_listeners(state.listeners, {:opensentience_runner_exit, state.run_id, exit_info})
    maybe_call(state.on_exit, exit_info)

    _ = close_log_io(state.log_io)
    {:stop, :normal, %{state | log_io: nil}}
  end

  @impl true
  def handle_info(:kill_if_still_running, state) do
    # If we've already exited, this message arrives after termination and is ignored.
    # If still running, send SIGKILL.
    if state.stop_requested? do
      _ = send_kill(state.os_pid)
      safe_port_close(state.port)
    end

    {:noreply, state}
  end

  @impl true
  def handle_info({:DOWN, _ref, :process, pid, _reason}, state) do
    {:noreply, %{state | listeners: MapSet.delete(state.listeners, pid)}}
  end

  @impl true
  def handle_info({:EXIT, port, reason}, %{port: port} = state) do
    # Port crashed / closed. We'll treat this similarly to exit_status, but we may not have a code.
    at = DateTime.utc_now()

    Logger.info(
      "runner port exit (run_id=#{state.run_id} agent_id=#{state.agent_id} reason=#{safe_reason(reason)})"
    )

    exit_info = %{
      run_id: state.run_id,
      agent_id: state.agent_id,
      at: at,
      os_pid: state.os_pid,
      exit_code: nil,
      reason: reason
    }

    notify_listeners(state.listeners, {:opensentience_runner_exit, state.run_id, exit_info})
    maybe_call(state.on_exit, exit_info)

    _ = close_log_io(state.log_io)
    {:stop, :normal, %{state | log_io: nil}}
  end

  @impl true
  def terminate(_reason, state) do
    safe_port_close(state.port)
    _ = close_log_io(state.log_io)
    :ok
  end

  # ----------------------------------------------------------------------------
  # Log persistence (file-backed, bounded)
  # ----------------------------------------------------------------------------

  defp build_log_path(log_dir, agent_id, run_id) do
    # Default structure: <logs_dir>/<agent_id>/<run_id>.log
    log_dir = Path.expand(log_dir)
    dir = Path.join(log_dir, agent_id)

    case File.mkdir_p(dir) do
      :ok -> {:ok, Path.join(dir, "#{run_id}.log")}
      {:error, reason} -> {:error, {:mkdir_failed, dir, reason}}
    end
  end

  defp open_log_file(path) do
    case File.open(path, [:append, :utf8]) do
      {:ok, io} ->
        {:ok, io}

      {:error, reason} ->
        {:error, {:open_failed, path, reason}}
    end
  end

  defp close_log_io(nil), do: :ok

  defp close_log_io(io) do
    try do
      File.close(io)
    rescue
      _ -> :ok
    end

    :ok
  end

  defp maybe_persist_log_line(state, at, line) do
    # If we've already exceeded max_log_bytes, do not persist further.
    if state.log_bytes >= state.max_log_bytes do
      {false, state}
    else
      rendered = format_log_line(at, line)
      bytes = byte_size(rendered)

      # If this single line would exceed the cap, persist a single truncation marker (once) and stop persisting.
      if state.log_bytes + bytes > state.max_log_bytes do
        marker = format_log_line(at, "[TRUNCATED] max_log_bytes exceeded")
        _ = safe_write(state.log_io, marker)
        {false, %{state | log_bytes: state.max_log_bytes}}
      else
        _ = safe_write(state.log_io, rendered)
        {true, %{state | log_bytes: state.log_bytes + bytes}}
      end
    end
  end

  defp format_log_line(%DateTime{} = at, line) when is_binary(line) do
    "#{DateTime.to_iso8601(at)} stdout #{line}\n"
  end

  defp safe_write(nil, _data), do: :ok

  defp safe_write(io, data) when is_binary(data) do
    try do
      IO.write(io, data)
    rescue
      _ -> :ok
    end

    :ok
  end

  # ----------------------------------------------------------------------------
  # Process control (best-effort)
  # ----------------------------------------------------------------------------

  defp port_os_pid(nil), do: nil

  defp port_os_pid(port) do
    case Port.info(port, :os_pid) do
      {:os_pid, pid} when is_integer(pid) and pid > 0 -> pid
      _ -> nil
    end
  end

  defp send_term(nil), do: :noop

  defp send_term(pid) when is_integer(pid) and pid > 0 do
    send_signal(pid, "TERM")
  end

  defp send_kill(nil), do: :noop

  defp send_kill(pid) when is_integer(pid) and pid > 0 do
    send_signal(pid, "KILL")
  end

  defp send_signal(pid, sig) when is_integer(pid) and pid > 0 and is_binary(sig) do
    # Use System.cmd with fixed argv to avoid shell injection.
    # If `kill` isn't available, ignore.
    case System.find_executable("kill") do
      nil ->
        :noop

      kill_path ->
        _ = System.cmd(kill_path, ["-#{sig}", Integer.to_string(pid)], stderr_to_stdout: true)
        :ok
    end
  rescue
    _ -> :noop
  end

  defp safe_port_close(nil), do: :ok

  defp safe_port_close(port) do
    try do
      Port.close(port)
    rescue
      _ -> :ok
    end

    :ok
  end

  # ----------------------------------------------------------------------------
  # Validation / normalization
  # ----------------------------------------------------------------------------

  defp validate_id(_field, value) when is_binary(value) and value != "" do
    if byte_size(value) > 512 or String.contains?(value, ["\u0000", "\n", "\r"]) do
      {:error, :invalid_id}
    else
      :ok
    end
  end

  defp validate_id(field, _), do: {:error, {:invalid_id, field}}

  defp validate_cwd(cwd) when is_binary(cwd) do
    case File.stat(cwd) do
      {:ok, %File.Stat{type: :directory}} -> :ok
      {:ok, %File.Stat{type: other}} -> {:error, {:cwd_not_directory, other}}
      {:error, reason} -> {:error, {:cwd_inaccessible, reason}}
    end
  end

  defp normalize_command!(list) when is_list(list) do
    list =
      list
      |> Enum.map(&to_string/1)
      |> Enum.map(&String.trim/1)
      |> Enum.reject(&(&1 == ""))

    if list == [] do
      raise ArgumentError, "command is empty"
    end

    # Prevent weird control characters in executable path/args.
    if Enum.any?(list, &String.contains?(&1, ["\u0000", "\n", "\r"])) do
      raise ArgumentError, "command contains invalid characters"
    end

    list
  end

  defp normalize_command!(other) do
    raise ArgumentError, "command must be a list of strings, got: #{inspect(other)}"
  end

  defp split_command([exe | args]) do
    exe =
      case System.find_executable(exe) do
        nil -> exe
        path -> path
      end

    {exe, args}
  end

  defp normalize_env(%{} = env) do
    env
    |> Enum.reduce(%{}, fn {k, v}, acc ->
      k = k |> to_string() |> String.trim()
      v = v |> to_string() |> String.trim()

      cond do
        k == "" -> acc
        String.contains?(k, "\u0000") -> acc
        String.contains?(v, "\u0000") -> acc
        true -> Map.put(acc, k, v)
      end
    end)
    |> Map.to_list()
    |> Enum.sort_by(fn {k, _} -> k end)
  end

  defp normalize_env(list) when is_list(list) do
    list
    |> Enum.into(%{}, fn
      {k, v} -> {k, v}
      other -> {other, nil}
    end)
    |> normalize_env()
  end

  defp normalize_env(_), do: []

  defp normalize_line(data) when is_binary(data) do
    data
    |> String.replace("\u0000", "")
    |> String.replace(~r/\r\n|\r|\n/, " ")
    |> String.trim()
  end

  defp normalize_line(other) do
    other
    |> inspect(limit: 30, printable_limit: 2_000)
    |> normalize_line()
  end

  defp normalize_exit_code(code) when is_integer(code) and code >= 0, do: code
  defp normalize_exit_code(_), do: nil

  defp normalize_pos_int(n, default) when is_integer(n) and n > 0, do: n
  defp normalize_pos_int(_, default), do: default

  defp normalize_nonneg_int(n, default) when is_integer(n) and n >= 0, do: n
  defp normalize_nonneg_int(_, default), do: default

  # ----------------------------------------------------------------------------
  # Notifications
  # ----------------------------------------------------------------------------

  defp notify_listeners(listeners, msg) do
    Enum.each(listeners, fn pid ->
      if is_pid(pid) and Process.alive?(pid) do
        send(pid, msg)
      end
    end)
  end

  defp maybe_call(nil, _payload), do: :ok

  defp maybe_call(fun, payload) when is_function(fun, 1) do
    try do
      _ = fun.(payload)
      :ok
    rescue
      _ -> :ok
    end
  end

  # ----------------------------------------------------------------------------
  # Safe error formatting
  # ----------------------------------------------------------------------------

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
end
