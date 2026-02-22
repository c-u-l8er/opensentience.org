defmodule OpenSentience.CLI do
  @moduledoc false

  require Logger

  def main(args) do
    # Configure Logger early so we never accidentally emit anything to stdout.
    # This can be overridden later by `--log-level` (ACP mode only).
    env_level = System.get_env("OPENSENTIENCE_LOG_LEVEL")
    configure_logger(env_level || :info)

    {opts, remaining, invalid} =
      OptionParser.parse(args,
        strict: [
          help: :boolean,
          acp: :boolean,
          version: :boolean,
          log_level: :string
        ],
        aliases: [
          h: :help,
          v: :version
        ]
      )

    cond do
      opts[:help] ->
        print_help()
        System.halt(0)

      opts[:version] ->
        print_version()
        System.halt(0)

      invalid != [] or remaining != [] ->
        invalid_display =
          invalid
          |> Enum.map(&format_invalid_arg/1)
          |> Enum.reject(&(&1 == ""))
          |> Enum.join(" ")

        remaining_display = Enum.join(remaining, " ")

        lines =
          []
          |> append_if_present("Invalid options", invalid_display)
          |> append_if_present("Unexpected arguments", remaining_display)

        message =
          case lines do
            [] -> "Unknown arguments.\n"
            _ -> Enum.join(lines, "\n") <> "\n"
          end

        IO.puts(:stderr, message)
        print_help()
        System.halt(2)

      args == [] or opts[:acp] ->
        if is_binary(opts[:log_level]) do
          configure_logger(opts[:log_level])
        end

        ensure_runtime_started()
        run_acp_loop()

      is_binary(opts[:log_level]) ->
        IO.puts(:stderr, "--log-level must be used with --acp (or run with no arguments).\n")
        print_help()
        System.halt(2)

      true ->
        IO.puts(:stderr, "Unknown arguments: #{Enum.join(args, " ")}\n")
        print_help()
        System.halt(2)
    end
  end

  defp format_invalid_arg({key, nil}), do: format_key(key)
  defp format_invalid_arg({key, value}), do: format_key(key) <> "=" <> inspect(value)
  defp format_invalid_arg(other), do: inspect(other)

  defp format_key(key) when is_atom(key) do
    "--" <> (key |> Atom.to_string() |> String.replace("_", "-"))
  end

  defp format_key(key) when is_binary(key), do: key
  defp format_key(key), do: to_string(key)

  defp append_if_present(lines, _label, ""), do: lines

  defp append_if_present(lines, label, content)
       when is_list(lines) and is_binary(label) and is_binary(content) do
    lines ++ ["#{label}: #{content}"]
  end

  defp print_help do
    IO.puts("""
    OpenSentience ACP Agent (stdio JSON-RPC)

    Usage:
      opensentience --acp [--log-level LEVEL]
      opensentience --help
      opensentience --version

    Options:
      --acp                  Run ACP stdio loop (default when no args)
      --log-level LEVEL       debug|info|warning|error (ACP mode only)
      -h, --help              Print this help text
      -v, --version           Print version and exit

    Notes:
      - In ACP mode, this process reads newline-delimited JSON-RPC 2.0 messages from stdin
        and writes newline-delimited JSON-RPC 2.0 messages to stdout.
      - Do not write non-ACP output to stdout; use stderr for logs.
      - You can also set OPENSENTIENCE_LOG_LEVEL=debug|info|warning|error (overridden by --log-level).
    """)
  end

  defp configure_logger(level) do
    # Ensure Logger doesn't accidentally write to stdout.
    # (Console backend defaults vary; we force stderr.)
    level = normalize_log_level(level)

    try do
      Application.ensure_all_started(:logger)
      Logger.configure_backend(:console, device: :stderr)
      Logger.configure(level: level)
    rescue
      _ -> :ok
    end
  end

  defp normalize_log_level(level) when is_atom(level) do
    if level in [:debug, :info, :warning, :error] do
      level
    else
      :info
    end
  end

  defp normalize_log_level(level) when is_binary(level) do
    case String.downcase(level) do
      "debug" ->
        :debug

      "info" ->
        :info

      "warning" ->
        :warning

      "warn" ->
        :warning

      "error" ->
        :error

      other ->
        IO.puts(:stderr, "Invalid log level: #{other}. Expected: debug|info|warning|error\n")
        :info
    end
  end

  defp normalize_log_level(_other), do: :info

  defp print_version do
    IO.puts("opensentience #{version_string()}")
  end

  defp version_string do
    case Application.spec(:opensentience_acp, :vsn) do
      nil -> "0.0.0"
      vsn -> to_string(vsn)
    end
  end

  defp ensure_runtime_started do
    # In an escript, dependencies may not be started automatically in all scenarios.
    # Ensure TLS stack is up before Req (Mint/Finch) tries to negotiate HTTPS.
    _ = Application.ensure_all_started(:logger)
    _ = Application.ensure_all_started(:crypto)
    _ = Application.ensure_all_started(:ssl)
    _ = Application.ensure_all_started(:jason)
    _ = Application.ensure_all_started(:req)
    :ok
  end

  defp run_acp_loop do
    # Persist agent state across incoming messages using the process dictionary.
    # This keeps the transport handler signature simple while still letting
    # OpenSentience maintain sessions/history.
    Process.put(:acp_state, OpenSentience.Agent.new())

    # Start an ACP router to support agent-initiated client tool calls (fs/*, terminal/*,
    # session/request_permission) with JSON-RPC response correlation.
    send_message_fun = &OpenSentience.Transport.Stdio.send_message/1

    case OpenSentience.ACP.Router.start_link(send_message_fun: send_message_fun) do
      {:ok, router_pid} ->
        Process.put(:acp_router, router_pid)

      {:error, reason} ->
        Logger.error("Failed to start ACP router: #{inspect(reason)}")
    end

    notify = fn notification ->
      # Notifications are JSON-RPC messages sent by the agent (e.g. session/update).
      # They must be written to stdout as single-line JSON.
      case OpenSentience.Transport.Stdio.send_message(notification) do
        :ok ->
          :ok

        {:error, reason} ->
          Logger.error("Failed to send ACP notification: #{inspect(reason)}")
          :ok
      end
    end

    Process.put(:acp_notify, notify)

    OpenSentience.Transport.Stdio.run(fn incoming ->
      handle_acp_message(incoming)
    end)
  end

  defp handle_acp_message(%{"jsonrpc" => "2.0"} = msg) do
    # Always feed incoming messages to the router so it can resolve responses
    # to agent-initiated client requests.
    router = Process.get(:acp_router)
    if is_pid(router), do: OpenSentience.ACP.Router.handle_incoming(router, msg)

    # If this is a JSON-RPC response (result/error) from the client, the router will
    # handle it; do not route it into the agent request handler.
    if Map.has_key?(msg, "method") do
      notify = Process.get(:acp_notify)

      # Pass the message into the shared ACP agent implementation.
      state = Process.get(:acp_state) || OpenSentience.Agent.new()
      {new_state, response} = OpenSentience.Agent.handle(state, msg, notify)
      Process.put(:acp_state, new_state)

      # If there's a JSON-RPC response, send it back to the client.
      if is_map(response) do
        _ = OpenSentience.Transport.Stdio.send_message(response)
      end
    end

    :ok
  end

  defp handle_acp_message(_other), do: :ok
end
