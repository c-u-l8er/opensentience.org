defmodule OpenSentience.JSONRPC do
  @moduledoc """
  Helpers for JSON-RPC 2.0 message handling for ACP stdio transport.

  ACP uses newline-delimited JSON-RPC messages:
  - exactly one JSON object per line (no embedded newlines)
  - UTF-8 encoded
  - stdout must contain only protocol messages

  This module provides helpers for:
  - building request/response/notification maps
  - encoding messages as single-line JSON
  - decoding and validating incoming lines
  """

  @jsonrpc_version "2.0"

  # JSON-RPC error codes
  @parse_error -32700
  @invalid_request -32600
  @method_not_found -32601
  @invalid_params -32602
  @internal_error -32603

  @type id :: integer() | binary() | nil
  @type method :: binary()

  @typedoc """
  JSON-RPC 2.0 message map (string-keyed).

  We keep this typespec intentionally permissive for broad compiler compatibility,
  since detailed map types with literal string keys can be fragile across Elixir
  versions and tooling.
  """
  @type message :: %{optional(String.t()) => any()}

  @doc """
  Build a JSON-RPC request.
  """
  @spec request(id(), method(), map()) :: message()
  def request(id, method, params \\ %{}) when is_binary(method) and is_map(params) do
    %{
      "jsonrpc" => @jsonrpc_version,
      "id" => id,
      "method" => method,
      "params" => params
    }
    |> drop_nils()
  end

  @doc """
  Build a JSON-RPC notification (no id).
  """
  @spec notification(method(), map()) :: message()
  def notification(method, params \\ %{}) when is_binary(method) and is_map(params) do
    %{
      "jsonrpc" => @jsonrpc_version,
      "method" => method,
      "params" => params
    }
    |> drop_nils()
  end

  @doc """
  Build a JSON-RPC success response.
  """
  @spec result(id(), any()) :: message()
  def result(id, value) do
    %{
      "jsonrpc" => @jsonrpc_version,
      "id" => id,
      "result" => value
    }
  end

  @doc """
  Build a JSON-RPC error response.

  `code` should be one of the JSON-RPC codes or an application-specific negative integer.
  """
  @spec error(id(), integer(), binary(), map()) :: message()
  def error(id, code, message, data \\ %{}) when is_integer(code) and is_binary(message) do
    %{
      "jsonrpc" => @jsonrpc_version,
      "id" => id,
      "error" => error_object(code, message, data)
    }
  end

  @doc """
  Convenience builders for standard JSON-RPC errors.
  """
  @spec parse_error(id(), binary(), map()) :: message()
  def parse_error(id, message \\ "Parse error", data \\ %{}),
    do: error(id, @parse_error, message, data)

  @spec invalid_request(id(), binary(), map()) :: message()
  def invalid_request(id, message \\ "Invalid Request", data \\ %{}),
    do: error(id, @invalid_request, message, data)

  @spec method_not_found(id(), binary(), map()) :: message()
  def method_not_found(id, message \\ "Method not found", data \\ %{}),
    do: error(id, @method_not_found, message, data)

  @spec invalid_params(id(), binary(), map()) :: message()
  def invalid_params(id, message \\ "Invalid params", data \\ %{}),
    do: error(id, @invalid_params, message, data)

  @spec internal_error(id(), binary(), map()) :: message()
  def internal_error(id, message \\ "Internal error", data \\ %{}),
    do: error(id, @internal_error, message, data)

  @doc """
  Encode a JSON-RPC message as a single-line JSON string (no trailing newline).
  """
  @spec encode!(message()) :: binary()
  def encode!(msg) when is_map(msg) do
    json = Jason.encode!(msg)

    if String.contains?(json, "\n") or String.contains?(json, "\r") do
      raise ArgumentError, "JSON-RPC messages must not contain embedded newlines"
    end

    json
  end

  @doc """
  Encode a JSON-RPC message as newline-delimited JSON (NDJSON): `<json>\\n`.
  """
  @spec encode_line!(message()) :: binary()
  def encode_line!(msg), do: encode!(msg) <> "\n"

  @doc """
  Decode a single incoming line (with or without trailing newline) into a map.

  Returns:
  - `{:ok, map}` for valid JSON objects
  - `{:error, :empty}` for empty/whitespace-only lines
  - `{:error, {:invalid_json, reason}}` for JSON parse errors
  - `{:error, {:not_object, value}}` when decoded JSON isn't an object
  """
  @spec decode_line(binary()) ::
          {:ok, map()}
          | {:error, :empty}
          | {:error, {:invalid_json, any()}}
          | {:error, {:not_object, any()}}
  def decode_line(line) when is_binary(line) do
    trimmed =
      line
      |> String.trim_trailing("\n")
      |> String.trim_trailing("\r")
      |> String.trim()

    if trimmed == "" do
      {:error, :empty}
    else
      case Jason.decode(trimmed) do
        {:ok, %{} = obj} -> {:ok, obj}
        {:ok, other} -> {:error, {:not_object, other}}
        {:error, err} -> {:error, {:invalid_json, err}}
      end
    end
  end

  @doc """
  Lightweight validation that a decoded map resembles a JSON-RPC 2.0 message.

  Returns `:ok` or `{:error, reason}`.

  This checks:
  - `"jsonrpc" == "2.0"`
  - message is either a request/notification (has `"method"`) or a response (has `"result"` or `"error"`)
  - if present, `"id"` is a string/number/null (JSON-RPC allows both string and number IDs)
  """
  @spec validate_message(map()) :: :ok | {:error, atom()}
  def validate_message(%{"jsonrpc" => @jsonrpc_version} = msg) do
    with :ok <- validate_id(msg),
         :ok <- validate_shape(msg) do
      :ok
    end
  end

  def validate_message(_), do: {:error, :invalid_jsonrpc_version}

  @doc """
  Extract an id from a message (request or response).

  Returns `nil` if no id is present (e.g. notifications).
  """
  @spec id_from(map()) :: id()
  def id_from(%{"id" => id}), do: id
  def id_from(_), do: nil

  defp validate_id(%{"id" => id}) when is_integer(id) or is_binary(id) or is_nil(id), do: :ok
  defp validate_id(%{"id" => _}), do: {:error, :invalid_id_type}
  defp validate_id(_), do: :ok

  defp validate_shape(%{"method" => method}) when is_binary(method), do: :ok
  defp validate_shape(%{"method" => _}), do: {:error, :invalid_method_type}

  defp validate_shape(%{"result" => _}), do: :ok

  defp validate_shape(%{"error" => %{} = err}) do
    # Minimal validation for error object shape
    case {Map.get(err, "code"), Map.get(err, "message")} do
      {code, message} when is_integer(code) and is_binary(message) -> :ok
      _ -> {:error, :invalid_error_object}
    end
  end

  defp validate_shape(%{"error" => _}), do: {:error, :invalid_error_object}
  defp validate_shape(_), do: {:error, :invalid_message_shape}

  defp error_object(code, message, data) when is_map(data) and map_size(data) > 0 do
    %{"code" => code, "message" => message, "data" => data}
  end

  defp error_object(code, message, _data) do
    %{"code" => code, "message" => message}
  end

  defp drop_nils(map) do
    Enum.reduce(map, %{}, fn
      {_k, nil}, acc -> acc
      {k, v}, acc -> Map.put(acc, k, v)
    end)
  end
end
