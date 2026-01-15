defmodule OpenSentience.Agent do
  @moduledoc """
  Core implementation of an ACP (Agent Client Protocol) agent.

  This module is intentionally transport-agnostic: callers provide a `notify/1`
  function that delivers JSON-RPC notifications (e.g. writing a single-line JSON
  message to stdout).

  ACP basics (per spec):
  - JSON-RPC 2.0
  - stdio transport: one JSON message per line, no embedded newlines
  - file paths in ACP payloads MUST be absolute (we validate where applicable)
  - prompt turns stream progress via `session/update` notifications and end by
    responding to `session/prompt` with a stop reason.
  """

  @supported_protocol_versions MapSet.new([1])

  @agent_info %{
    "name" => "opensentience",
    "title" => "OpenSentience",
    "version" => "0.1.0"
  }

  # Keep this conservative; only advertise what you actually support.
  @default_agent_capabilities %{
    # Only set true if you can load sessions across restarts (or otherwise truly support it).
    "loadSession" => false,
    # Prompt capabilities are about what the agent accepts in `session/prompt`.
    "promptCapabilities" => %{
      "image" => false,
      "audio" => false,
      "embeddedContext" => true
    },
    # MCP transport support (agent-side). If you don't connect to MCP servers yourself,
    # leave this out or set to false.
    "mcpCapabilities" => %{
      "http" => false,
      "sse" => false
    }
  }

  defstruct protocol_version: nil,
            client_capabilities: %{},
            client_info: %{},
            sessions: %{}

  @type t :: %__MODULE__{
          protocol_version: integer() | nil,
          client_capabilities: map(),
          client_info: map(),
          sessions: %{optional(String.t()) => session()}
        }

  @type session :: %{
          id: String.t(),
          cwd: String.t(),
          mcp_servers: list(),
          mode: String.t() | nil,
          history: list()
        }

  @typedoc """
  Function used to emit JSON-RPC notifications (e.g. `session/update`).
  """
  @type notify_fun :: (map() -> any())

  @doc """
  Create a new agent state.
  """
  @spec new() :: t()
  def new, do: %__MODULE__{}

  @doc """
  Handle a decoded JSON-RPC message.

  Returns `{new_state, response_or_nil}`. For notifications, `response_or_nil`
  will always be `nil`.

  The caller is responsible for:
  - writing responses to stdout
  - writing notifications (from `notify/1`) to stdout
  - ensuring stdout only contains ACP JSON messages
  """
  @spec handle(t(), map(), notify_fun()) :: {t(), map() | nil}
  def handle(%__MODULE__{} = state, %{"jsonrpc" => "2.0"} = msg, notify)
      when is_function(notify, 1) do
    cond do
      is_map_key(msg, "method") and is_map_key(msg, "id") ->
        handle_request(state, msg, notify)

      is_map_key(msg, "method") and not is_map_key(msg, "id") ->
        # Notification
        {handle_notification(state, msg, notify), nil}

      true ->
        # Invalid JSON-RPC payload (no method)
        {state,
         error_response(msg["id"], -32600, "Invalid Request", %{
           "detail" => "Missing method or invalid JSON-RPC shape"
         })}
    end
  end

  def handle(%__MODULE__{} = state, msg, _notify) when is_map(msg) do
    {state,
     error_response(msg["id"], -32600, "Invalid Request", %{"detail" => "jsonrpc must be '2.0'"})}
  end

  # -------------------------
  # Requests (id + method)
  # -------------------------

  defp handle_request(%__MODULE__{} = state, %{"method" => method, "id" => id} = msg, notify) do
    params = Map.get(msg, "params", %{})

    case method do
      "initialize" ->
        case do_initialize(state, params) do
          {:ok, new_state, result} -> {new_state, ok_response(id, result)}
          {:error, code, message, data} -> {state, error_response(id, code, message, data)}
        end

      "authenticate" ->
        # Many agents don't require auth; ACP allows returning no methods in initialize.
        # Still, some clients might call this anyway.
        {state, ok_response(id, %{"outcome" => %{"outcome" => "not_required"}})}

      "session/new" ->
        case do_session_new(state, params) do
          {:ok, new_state, result} -> {new_state, ok_response(id, result)}
          {:error, code, message, data} -> {state, error_response(id, code, message, data)}
        end

      "session/load" ->
        # Only supported if you genuinely support it; we default to not supported.
        {state, error_response(id, -32601, "Method not found", %{"method" => "session/load"})}

      "session/prompt" ->
        case do_session_prompt(state, params, notify) do
          {:ok, new_state, result} -> {new_state, ok_response(id, result)}
          {:error, code, message, data} -> {state, error_response(id, code, message, data)}
        end

      "session/set_mode" ->
        case do_session_set_mode(state, params, notify) do
          {:ok, new_state, result} -> {new_state, ok_response(id, result)}
          {:error, code, message, data} -> {state, error_response(id, code, message, data)}
        end

      # Client-side methods (fs/*, terminal/*) are not handled here; the agent calls those on the client.
      _ ->
        {state, error_response(id, -32601, "Method not found", %{"method" => method})}
    end
  end

  # -------------------------
  # Notifications (method only)
  # -------------------------

  defp handle_notification(%__MODULE__{} = state, %{"method" => "session/cancel"} = msg, notify) do
    params = Map.get(msg, "params", %{})
    session_id = Map.get(params, "sessionId")

    # For a minimal agent, cancellation is best-effort. If a prompt is in-flight,
    # you should stop LLM/tool work and ultimately return stopReason=cancelled.
    #
    # This reference implementation is synchronous and typically finishes promptly,
    # so we just emit an informational update (optional) and move on.
    if is_binary(session_id) do
      send_update(notify, session_id, %{
        "sessionUpdate" => "agent_message_chunk",
        "content" => %{
          "type" => "text",
          "text" => "Cancellation requested."
        }
      })
    end

    state
  end

  defp handle_notification(%__MODULE__{} = state, _msg, _notify), do: state

  # -------------------------
  # ACP method implementations
  # -------------------------

  defp do_initialize(%__MODULE__{} = state, params) when is_map(params) do
    client_version = Map.get(params, "protocolVersion")
    client_caps = Map.get(params, "clientCapabilities", %{})
    client_info = Map.get(params, "clientInfo", %{})

    with {:ok, chosen_version} <- negotiate_protocol_version(client_version),
         {:ok, _} <- validate_client_capabilities(client_caps) do
      result = %{
        "protocolVersion" => chosen_version,
        "agentCapabilities" => @default_agent_capabilities,
        "agentInfo" => @agent_info,
        # If you require authentication, list methods here; otherwise empty list.
        "authMethods" => []
      }

      new_state = %__MODULE__{
        state
        | protocol_version: chosen_version,
          client_capabilities: client_caps,
          client_info: client_info
      }

      {:ok, new_state, result}
    else
      {:error, code, message, data} ->
        {:error, code, message, data}
    end
  end

  defp do_initialize(_state, _params) do
    {:error, -32602, "Invalid params", %{"detail" => "initialize params must be an object"}}
  end

  defp do_session_new(%__MODULE__{protocol_version: nil}, _params) do
    {:error, -32000, "Not initialized", %{"detail" => "Call initialize before session/new"}}
  end

  defp do_session_new(%__MODULE__{} = state, params) when is_map(params) do
    cwd = Map.get(params, "cwd")
    mcp_servers = Map.get(params, "mcpServers", [])

    with {:ok, cwd} <- validate_absolute_dir(cwd),
         {:ok, mcp_servers} <- validate_mcp_servers(mcp_servers) do
      session_id = new_session_id()

      session = %{
        id: session_id,
        cwd: cwd,
        mcp_servers: mcp_servers,
        mode: nil,
        history: []
      }

      new_state = put_in(state.sessions[session_id], session)
      {:ok, new_state, %{"sessionId" => session_id}}
    else
      {:error, code, message, data} -> {:error, code, message, data}
    end
  end

  defp do_session_new(_state, _params) do
    {:error, -32602, "Invalid params", %{"detail" => "session/new params must be an object"}}
  end

  defp do_session_set_mode(%__MODULE__{} = state, params, notify) when is_map(params) do
    session_id = Map.get(params, "sessionId")
    mode = Map.get(params, "mode")

    with {:ok, session} <- fetch_session(state, session_id),
         true <- is_binary(mode) do
      new_state =
        put_in(state.sessions[session_id], %{
          session
          | mode: mode
        })

      # Inform the client (optional but helpful)
      send_update(notify, session_id, %{
        "sessionUpdate" => "mode",
        "mode" => mode
      })

      {:ok, new_state, nil}
    else
      false ->
        {:error, -32602, "Invalid params", %{"detail" => "mode must be a string"}}

      {:error, code, message, data} ->
        {:error, code, message, data}
    end
  end

  defp do_session_set_mode(_state, _params, _notify) do
    {:error, -32602, "Invalid params", %{"detail" => "session/set_mode params must be an object"}}
  end

  defp do_session_prompt(%__MODULE__{} = state, params, notify) when is_map(params) do
    session_id = Map.get(params, "sessionId")
    prompt = Map.get(params, "prompt")

    with {:ok, session} <- fetch_session(state, session_id),
         {:ok, prompt_blocks} <- validate_prompt(prompt) do
      # Record the user prompt in session history (simple, in-memory)
      user_text = render_prompt_blocks(prompt_blocks)

      session =
        Map.update!(session, :history, fn hist ->
          hist ++ [%{role: :user, content: prompt_blocks}]
        end)

      state = put_in(state.sessions[session_id], session)

      # Stream a minimal plan (optional)
      send_update(notify, session_id, %{
        "sessionUpdate" => "plan",
        "entries" => [
          %{"content" => "Understand the request", "priority" => "high", "status" => "completed"},
          %{
            "content" => "Respond with guidance or next actions",
            "priority" => "high",
            "status" => "completed"
          }
        ]
      })

      # Stream the agent's response as chunks.
      response_text =
        [
          "I received your prompt via ACP.",
          "",
          "What I can do right now:",
          "- Accept sessions and prompts correctly over JSON-RPC 2.0 (stdio).",
          "- Stream updates back to Zed via `session/update`.",
          "",
          "What I *don't* do yet:",
          "- Call an LLM provider (no model backend configured).",
          "- Execute tools (fs/terminal) or apply edits.",
          "",
          "Your prompt (rendered):",
          user_text
        ]
        |> Enum.join("\n")

      # Chunking is optional; but Zed handles streaming nicely.
      response_text
      |> chunk_text(600)
      |> Enum.each(fn chunk ->
        send_update(notify, session_id, %{
          "sessionUpdate" => "agent_message_chunk",
          "content" => %{"type" => "text", "text" => chunk}
        })
      end)

      # Record agent response in history
      session =
        Map.update!(session, :history, fn hist ->
          hist ++ [%{role: :agent, content: [%{"type" => "text", "text" => response_text}]}]
        end)

      state = put_in(state.sessions[session_id], session)

      {:ok, state, %{"stopReason" => "end_turn"}}
    else
      {:error, code, message, data} -> {:error, code, message, data}
    end
  end

  defp do_session_prompt(_state, _params, _notify) do
    {:error, -32602, "Invalid params", %{"detail" => "session/prompt params must be an object"}}
  end

  # -------------------------
  # Validation & helpers
  # -------------------------

  defp negotiate_protocol_version(client_version) when is_integer(client_version) do
    if MapSet.member?(@supported_protocol_versions, client_version) do
      {:ok, client_version}
    else
      # Spec: agent should respond with latest it supports; client decides whether to proceed.
      # Since we only support 1, we "offer" 1.
      {:ok, 1}
    end
  end

  defp negotiate_protocol_version(_other) do
    {:error, -32602, "Invalid params", %{"detail" => "protocolVersion must be an integer"}}
  end

  defp validate_client_capabilities(caps) when is_map(caps), do: {:ok, caps}

  defp validate_client_capabilities(_caps) do
    {:error, -32602, "Invalid params", %{"detail" => "clientCapabilities must be an object"}}
  end

  defp validate_absolute_dir(path) when is_binary(path) do
    if Path.type(path) == :absolute do
      {:ok, path}
    else
      {:error, -32602, "Invalid params", %{"detail" => "cwd must be an absolute path"}}
    end
  end

  defp validate_absolute_dir(_path) do
    {:error, -32602, "Invalid params", %{"detail" => "cwd must be a string"}}
  end

  defp validate_mcp_servers(servers) when is_list(servers) do
    # This agent currently ignores MCP servers; we only validate basic shape.
    # You may want to validate that `command` paths are absolute for stdio servers.
    {:ok, servers}
  end

  defp validate_mcp_servers(_servers) do
    {:error, -32602, "Invalid params", %{"detail" => "mcpServers must be a list"}}
  end

  defp validate_prompt(blocks) when is_list(blocks) do
    # Baseline requirement: must accept Text + ResourceLink; we also accept Resource (embeddedContext).
    # We validate minimally, passing through blocks.
    case Enum.all?(blocks, &is_map/1) do
      true ->
        {:ok, blocks}

      false ->
        {:error, -32602, "Invalid params", %{"detail" => "prompt must be a list of objects"}}
    end
  end

  defp validate_prompt(_blocks) do
    {:error, -32602, "Invalid params", %{"detail" => "prompt must be a list"}}
  end

  defp fetch_session(%__MODULE__{} = state, session_id) when is_binary(session_id) do
    case Map.fetch(state.sessions, session_id) do
      {:ok, session} ->
        {:ok, session}

      :error ->
        {:error, -32602, "Invalid params",
         %{"detail" => "Unknown sessionId", "sessionId" => session_id}}
    end
  end

  defp fetch_session(_state, _session_id) do
    {:error, -32602, "Invalid params", %{"detail" => "sessionId must be a string"}}
  end

  defp new_session_id do
    # ACP doesn't mandate format; Zed examples use sess_*
    rand = :crypto.strong_rand_bytes(12) |> Base.encode16(case: :lower)
    "sess_" <> rand
  end

  defp send_update(notify, session_id, update) when is_function(notify, 1) do
    notify.(%{
      "jsonrpc" => "2.0",
      "method" => "session/update",
      "params" => %{
        "sessionId" => session_id,
        "update" => update
      }
    })
  end

  defp ok_response(id, result) do
    %{
      "jsonrpc" => "2.0",
      "id" => id,
      "result" => result
    }
  end

  defp error_response(id, code, message, data \\ %{}) do
    base = %{
      "jsonrpc" => "2.0",
      "id" => id,
      "error" => %{
        "code" => code,
        "message" => message
      }
    }

    if data == %{} do
      base
    else
      put_in(base, ["error", "data"], data)
    end
  end

  defp render_prompt_blocks(blocks) when is_list(blocks) do
    blocks
    |> Enum.map(&render_prompt_block/1)
    |> Enum.reject(&(&1 == ""))
    |> Enum.join("\n\n")
  end

  defp render_prompt_block(%{"type" => "text", "text" => text}) when is_binary(text), do: text

  defp render_prompt_block(%{"type" => "resource_link", "uri" => uri}) when is_binary(uri),
    do: "Resource: #{uri}"

  defp render_prompt_block(%{"type" => "resource", "resource" => %{"uri" => uri} = res})
       when is_binary(uri) do
    text = Map.get(res, "text")

    if is_binary(text) do
      "Resource: #{uri}\n\n#{text}"
    else
      "Resource: #{uri}"
    end
  end

  defp render_prompt_block(other) when is_map(other) do
    # Unknown block type; keep something readable.
    type = Map.get(other, "type", "unknown")
    "Unsupported content block type: #{inspect(type)}"
  end

  defp render_prompt_block(_), do: ""

  defp chunk_text(text, max) when is_binary(text) and is_integer(max) and max > 0 do
    do_chunk_text(text, max, [])
    |> Enum.reverse()
  end

  defp do_chunk_text("", _max, acc), do: acc

  defp do_chunk_text(text, max, acc) do
    {chunk, rest} =
      if String.length(text) <= max do
        {text, ""}
      else
        String.split_at(text, max)
      end

    do_chunk_text(rest, max, [chunk | acc])
  end
end
