defmodule OpenSentience.CLI do
  @moduledoc false

  require Logger

  def main(args) do
    configure_logger()

    cond do
      "--help" in args or "-h" in args ->
        print_help()
        System.halt(0)

      args == [] or "--acp" in args ->
        ensure_runtime_started()
        run_acp_loop()

      true ->
        IO.puts(:stderr, "Unknown arguments: #{Enum.join(args, " ")}\n")
        print_help()
        System.halt(2)
    end
  end

  defp print_help do
    IO.puts("""
    OpenSentience ACP Agent (stdio JSON-RPC)

    Usage:
      opensentience --acp
      opensentience --help

    Notes:
      - In ACP mode, this process reads newline-delimited JSON-RPC 2.0 messages from stdin
        and writes newline-delimited JSON-RPC 2.0 messages to stdout.
      - Do not write non-ACP output to stdout; use stderr for logs.
    """)
  end

  defp configure_logger do
    # Ensure Logger doesn't accidentally write to stdout.
    # (Console backend defaults vary; we force stderr.)
    try do
      Application.ensure_all_started(:logger)
      Logger.configure_backend(:console, device: :stderr)
      Logger.configure(level: :info)
    rescue
      _ -> :ok
    end
  end

  defp ensure_runtime_started do
    # In an escript, dependencies may not be started automatically in all scenarios.
    _ = Application.ensure_all_started(:logger)
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
