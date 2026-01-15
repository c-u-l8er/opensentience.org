defmodule OpenSentience.Transport.Stdio do
  @moduledoc """
  JSON-RPC 2.0 stdio transport for ACP.

  ACP uses newline-delimited JSON-RPC messages over stdio:

  - Read JSON-RPC messages from stdin, one JSON object per line.
  - Write JSON-RPC messages to stdout, one JSON object per line.
  - Do not write anything non-JSON-RPC to stdout (use Logger/stderr for logs).
  - Outgoing messages MUST NOT contain embedded newlines.

  This module provides a small, dependency-light transport layer that:
  - streams decoded incoming messages,
  - writes encoded outgoing messages safely,
  - optionally runs a blocking read loop that dispatches to a handler.

  It does **not** implement ACP semantics; it only moves JSON-RPC messages.
  """

  require Logger

  @type jsonrpc_id :: integer() | String.t() | nil
  @type json :: map()
  @type handler_result :: :ok | {:ok, any()} | {:error, any()}

  @doc """
  Returns a stream of decoded JSON-RPC messages from stdin.

  Each element is:
    - `{:ok, map}` on successful decode
    - `{:error, reason}` on decode/shape errors (the stream continues)

  The stream is lazy; enumerating it will block on stdin.
  """
  @spec stream_incoming() :: Enumerable.t()
  def stream_incoming do
    IO.stream(:stdio, :line)
    |> Stream.map(&normalize_line/1)
    |> Stream.reject(&(&1 == ""))
    |> Stream.map(&decode_json_line/1)
  end

  @doc """
  Runs a blocking read loop, calling `handler.(msg)` for each decoded message.

  The handler receives the decoded JSON map (already parsed).
  Invalid lines are logged to stderr and skipped.

  This function blocks until stdin closes (EOF).
  """
  @spec run((json() -> handler_result())) :: :ok
  def run(handler) when is_function(handler, 1) do
    stream_incoming()
    |> Enum.each(fn
      {:ok, msg} ->
        safe_call_handler(handler, msg)

      {:error, reason} ->
        Logger.warning("stdio: dropping invalid JSON-RPC line: #{inspect(reason)}")
    end)

    :ok
  end

  @doc """
  Writes a JSON-RPC message to stdout as a single line.

  Returns:
    - `:ok` on success
    - `{:error, reason}` on encode/IO errors
  """
  @spec send_message(json()) :: :ok | {:error, term()}
  def send_message(message) when is_map(message) do
    with {:ok, line} <- encode_single_line(message),
         :ok <- write_line(line) do
      :ok
    end
  end

  @doc """
  Convenience for sending a JSON-RPC response:
  `{ "jsonrpc": "2.0", "id": id, "result": result }`
  """
  @spec send_result(jsonrpc_id(), any()) :: :ok | {:error, term()}
  def send_result(id, result) do
    send_message(%{
      "jsonrpc" => "2.0",
      "id" => id,
      "result" => result
    })
  end

  @doc """
  Convenience for sending a JSON-RPC error response:
  `{ "jsonrpc": "2.0", "id": id, "error": %{ "code": code, "message": message, "data": data? } }`

  `data` is optional and may be any JSON-encodable value.
  """
  @spec send_error(jsonrpc_id(), integer(), String.t(), any() | nil) :: :ok | {:error, term()}
  def send_error(id, code, message, data \\ nil)
      when (is_integer(id) or is_binary(id) or is_nil(id)) and is_integer(code) and
             is_binary(message) do
    error =
      %{
        "code" => code,
        "message" => message
      }
      |> maybe_put("data", data)

    send_message(%{
      "jsonrpc" => "2.0",
      "id" => id,
      "error" => error
    })
  end

  @doc """
  Convenience for sending a JSON-RPC request:
  `{ "jsonrpc": "2.0", "id": id, "method": method, "params": params }`

  `params` may be omitted (nil) to send no params.
  """
  @spec send_request(jsonrpc_id(), String.t(), map() | nil) :: :ok | {:error, term()}
  def send_request(id, method, params \\ nil)
      when (is_integer(id) or is_binary(id)) and is_binary(method) do
    msg =
      %{
        "jsonrpc" => "2.0",
        "id" => id,
        "method" => method
      }
      |> maybe_put("params", params)

    send_message(msg)
  end

  @doc """
  Convenience for sending a JSON-RPC notification:
  `{ "jsonrpc": "2.0", "method": method, "params": params }`

  `params` may be omitted (nil) to send no params.
  """
  @spec send_notification(String.t(), map() | nil) :: :ok | {:error, term()}
  def send_notification(method, params \\ nil) when is_binary(method) do
    msg =
      %{
        "jsonrpc" => "2.0",
        "method" => method
      }
      |> maybe_put("params", params)

    send_message(msg)
  end

  # -------------------------
  # Internals
  # -------------------------

  defp normalize_line(line) when is_binary(line) do
    line
    |> String.trim_trailing("\n")
    |> String.trim_trailing("\r")
  end

  defp decode_json_line(line) when is_binary(line) do
    case Jason.decode(line) do
      {:ok, %{} = msg} ->
        case validate_jsonrpc_shape(msg) do
          :ok -> {:ok, msg}
          {:error, reason} -> {:error, reason}
        end

      {:ok, other} ->
        {:error, {:not_an_object, other}}

      {:error, err} ->
        {:error, err}
    end
  end

  # Minimal validation for "JSON-RPC-ish" shape.
  # ACP uses JSON-RPC 2.0, so "jsonrpc": "2.0" should always be present.
  defp validate_jsonrpc_shape(%{"jsonrpc" => "2.0"}), do: :ok

  defp validate_jsonrpc_shape(%{"jsonrpc" => other}),
    do: {:error, {:invalid_jsonrpc_version, other}}

  defp validate_jsonrpc_shape(msg),
    do: {:error, {:missing_jsonrpc_version, Map.take(msg, ["id", "method"])}}

  defp encode_single_line(message) do
    try do
      json = Jason.encode!(message)

      if String.contains?(json, ["\n", "\r"]) do
        {:error, :encoded_json_contains_newline}
      else
        {:ok, json}
      end
    rescue
      e ->
        {:error, {:encode_failed, e}}
    end
  end

  defp write_line(line) when is_binary(line) do
    try do
      IO.write(:stdio, line)
      IO.write(:stdio, "\n")
      :ok
    rescue
      e ->
        {:error, {:write_failed, e}}
    end
  end

  defp safe_call_handler(handler, msg) do
    try do
      _ = handler.(msg)
      :ok
    rescue
      e ->
        # Important: do not crash the transport loop due to handler errors.
        Logger.error("stdio handler crashed: #{Exception.format(:error, e, __STACKTRACE__)}")
        :ok
    catch
      kind, value ->
        Logger.error("stdio handler threw: #{inspect({kind, value})}")
        :ok
    end
  end

  defp maybe_put(map, _key, nil), do: map
  defp maybe_put(map, key, value), do: Map.put(map, key, value)
end
