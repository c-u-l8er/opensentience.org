defmodule OpenSentience.ACP.Router do
  @moduledoc """
  ACP stdio router that supports **agent-initiated client requests** (JSON-RPC 2.0)
  with **response correlation**.

  ## Why this exists

  In ACP, the *client* (e.g. Zed) sends requests to the *agent* (`initialize`,
  `session/new`, `session/prompt`, ...). But during a prompt turn, the *agent*
  may also need to call *client* methods (e.g. `fs/read_text_file`,
  `fs/write_text_file`, `terminal/create`, `session/request_permission`).

  Those are JSON-RPC **requests from the agent to the client**, so the agent must:
  - assign an `id`
  - send the request
  - correlate the eventual response back to the caller

  This module implements that correlation and timeout handling.

  ## Intended integration

  Run the stdio reader loop in one process (your existing transport) and feed every
  decoded JSON-RPC message into this router using `handle_incoming/2`.

  When your agent needs to call the client, use `request/4` or `notify/3`.

  > Note: This router only solves *response correlation*. You still need a higher-level
  > component (often your CLI/main loop) to route **client->agent requests** into your
  > agent implementation and write the agent's responses back to stdout.

  ## Options

  - `:send_message_fun` (required)
      A function `fn map -> :ok | {:error, term} end` that writes a single JSON-RPC
      message to the client (typically via stdio as one JSON object per line).

  - `:id_start` (optional, default: 1)
      Starting integer for request ids.

  ## Return conventions

  - `request/4` returns:
      - `{:ok, result}` when the client returns a JSON-RPC result
      - `{:error, error_obj}` when the client returns a JSON-RPC error object
      - `{:error, {:timeout, id}}` if the request times out
      - `{:error, {:send_failed, reason}}` if sending failed

  ## Safety

  - Never logs to stdout (uses Logger).
  - Ensures pending calls are failed if the router crashes/stops.
  """

  use GenServer
  require Logger

  @type jsonrpc_id :: integer()
  @type jsonrpc_message :: map()
  @type send_message_fun :: (map() -> :ok | {:error, term()})

  @type request_result ::
          {:ok, any()}
          | {:error, map()}
          | {:error, {:timeout, jsonrpc_id()}}
          | {:error, {:send_failed, term()}}
          | {:error, :router_stopped}

  defstruct next_id: 1,
            pending: %{},
            send_message_fun: nil

  @type t :: %__MODULE__{
          next_id: pos_integer(),
          pending: %{optional(jsonrpc_id()) => {GenServer.from(), reference()}},
          send_message_fun: send_message_fun()
        }

  # -------------------------
  # Public API
  # -------------------------

  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opts) when is_list(opts) do
    GenServer.start_link(__MODULE__, opts, name: Keyword.get(opts, :name))
  end

  @doc """
  Feed an incoming decoded JSON-RPC message into the router.

  This should be called for **every** line your stdio transport decodes successfully.

  If the message is a response to an agent-initiated request, the router will resolve
  the pending call. Otherwise, it is ignored and should be handled by your normal
  client->agent request handling pipeline.
  """
  @spec handle_incoming(GenServer.server(), jsonrpc_message()) :: :ok
  def handle_incoming(server, msg) when is_map(msg) do
    GenServer.cast(server, {:incoming, msg})
  end

  @doc """
  Send a JSON-RPC notification to the client (no `id`, no response expected).
  """
  @spec notify(GenServer.server(), String.t(), map() | nil) :: :ok | {:error, term()}
  def notify(server, method, params \\ nil) when is_binary(method) do
    GenServer.call(server, {:notify, method, params})
  end

  @doc """
  Send a JSON-RPC request to the client and await the correlated response.

  `timeout_ms` governs how long the router will wait for the client's response.
  """
  @spec request(GenServer.server(), String.t(), map() | nil, timeout()) :: request_result()
  def request(server, method, params \\ nil, timeout_ms \\ 30_000)
      when is_binary(method) and (is_map(params) or is_nil(params)) do
    GenServer.call(server, {:request, method, params, timeout_ms}, timeout_ms + 5_000)
  end

  # -------------------------
  # GenServer callbacks
  # -------------------------

  @impl true
  def init(opts) do
    send_fun = Keyword.get(opts, :send_message_fun)
    id_start = Keyword.get(opts, :id_start, 1)

    cond do
      not is_function(send_fun, 1) ->
        {:stop, {:invalid_options, :send_message_fun_required}}

      not (is_integer(id_start) and id_start > 0) ->
        {:stop, {:invalid_options, :id_start_must_be_positive_integer}}

      true ->
        state = %__MODULE__{send_message_fun: send_fun, next_id: id_start, pending: %{}}
        {:ok, state}
    end
  end

  @impl true
  def handle_call({:notify, method, params}, _from, %__MODULE__{} = state) do
    msg =
      %{"jsonrpc" => "2.0", "method" => method}
      |> maybe_put("params", params)

    case safe_send(state.send_message_fun, msg) do
      :ok -> {:reply, :ok, state}
      {:error, reason} -> {:reply, {:error, reason}, state}
    end
  end

  @impl true
  def handle_call({:request, method, params, timeout_ms}, from, %__MODULE__{} = state) do
    id = state.next_id
    timer_ref = Process.send_after(self(), {:request_timeout, id}, timeout_ms)

    msg =
      %{"jsonrpc" => "2.0", "id" => id, "method" => method}
      |> maybe_put("params", params)

    Logger.debug(
      "ACP -> client request id=#{inspect(id)} method=#{inspect(method)} timeout_ms=#{inspect(timeout_ms)}"
    )

    case safe_send(state.send_message_fun, msg) do
      :ok ->
        new_state = %__MODULE__{
          state
          | next_id: id + 1,
            pending: Map.put(state.pending, id, {from, timer_ref})
        }

        Logger.debug("ACP pending request id=#{inspect(id)} method=#{inspect(method)}")
        {:noreply, new_state}

      {:error, reason} ->
        _ = Process.cancel_timer(timer_ref)

        Logger.debug(
          "ACP -> client send failed id=#{inspect(id)} method=#{inspect(method)} reason=#{inspect(reason)}"
        )

        {:reply, {:error, {:send_failed, reason}}, %__MODULE__{state | next_id: id + 1}}
    end
  end

  @impl true
  def handle_cast({:incoming, %{"jsonrpc" => "2.0"} = msg}, %__MODULE__{} = state) do
    # We only intercept responses (id + result/error, and no method).
    # Requests/notifications from the client should be handled elsewhere.
    cond do
      is_response_result?(msg) ->
        {:noreply, resolve_pending(state, msg["id"], {:ok, msg["result"]})}

      is_response_error?(msg) ->
        {:noreply, resolve_pending(state, msg["id"], {:error, msg["error"]})}

      true ->
        {:noreply, state}
    end
  end

  def handle_cast({:incoming, _other}, %__MODULE__{} = state), do: {:noreply, state}

  @impl true
  def handle_info({:request_timeout, id}, %__MODULE__{} = state) do
    case Map.pop(state.pending, id) do
      {nil, _pending} ->
        Logger.debug(
          "ACP request timeout fired for unknown id=#{inspect(id)} (already resolved?)"
        )

        {:noreply, state}

      {{from, _timer_ref}, pending} ->
        Logger.debug("ACP <- client timeout id=#{inspect(id)}")
        GenServer.reply(from, {:error, {:timeout, id}})
        {:noreply, %__MODULE__{state | pending: pending}}
    end
  end

  def handle_info(_other, %__MODULE__{} = state), do: {:noreply, state}

  @impl true
  def terminate(reason, %__MODULE__{} = state) do
    # Fail any pending calls so callers don't hang forever.
    Enum.each(state.pending, fn {id, {from, timer_ref}} ->
      _ = Process.cancel_timer(timer_ref)
      GenServer.reply(from, {:error, :router_stopped})

      Logger.debug(
        "ACP router terminating; failed pending request id=#{inspect(id)} reason=#{inspect(reason)}"
      )
    end)

    :ok
  end

  # -------------------------
  # Internals
  # -------------------------

  defp resolve_pending(%__MODULE__{} = state, id, reply) do
    case Map.pop(state.pending, id) do
      {nil, _pending} ->
        # Response for an unknown id. Ignore (could be for some other layer).
        Logger.debug(
          "ACP <- client response for unknown id=#{inspect(id)} reply_kind=#{inspect(reply_kind(reply))}"
        )

        state

      {{from, timer_ref}, pending} ->
        _ = Process.cancel_timer(timer_ref)

        Logger.debug(
          "ACP <- client response id=#{inspect(id)} reply_kind=#{inspect(reply_kind(reply))}"
        )

        GenServer.reply(from, reply)
        %__MODULE__{state | pending: pending}
    end
  end

  defp reply_kind({:ok, _}), do: :ok
  defp reply_kind({:error, _}), do: :error
  defp reply_kind(_), do: :unknown

  defp is_response_result?(%{"id" => id, "result" => _} = msg) do
    has_no_method = not Map.has_key?(msg, "method")
    has_no_method and is_integer(id)
  end

  defp is_response_result?(_), do: false

  defp is_response_error?(%{"id" => id, "error" => _} = msg) do
    has_no_method = not Map.has_key?(msg, "method")
    has_no_method and is_integer(id)
  end

  defp is_response_error?(_), do: false

  defp maybe_put(map, _key, nil), do: map
  defp maybe_put(map, key, value), do: Map.put(map, key, value)

  defp safe_send(send_fun, msg) when is_function(send_fun, 1) and is_map(msg) do
    try do
      case send_fun.(msg) do
        :ok -> :ok
        {:error, reason} -> {:error, reason}
        other -> {:error, {:unexpected_send_return, other}}
      end
    rescue
      e -> {:error, {:send_exception, e}}
    catch
      kind, value -> {:error, {:send_throw, {kind, value}}}
    end
  end
end
