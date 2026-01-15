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

  alias OpenSentience.{LLM, Tooling, Prompt}

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
      user_text = Prompt.render_prompt(prompt_blocks)
      prior_history = session.history

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
            "content" => "Call LLM (if configured)",
            "priority" => "high",
            "status" => "completed"
          },
          %{
            "content" => "Execute requested tools (if any) and respond",
            "priority" => "high",
            "status" => "completed"
          }
        ]
      })

      llm_cfg = LLM.from_env()

      final_text =
        if LLM.configured?(llm_cfg) do
          base_messages =
            [
              %{"role" => "system", "content" => llm_system_prompt(session)}
            ] ++
              history_to_llm_messages(prior_history) ++
              [%{"role" => "user", "content" => user_text}]

          case run_llm_with_tools(
                 llm_cfg,
                 base_messages,
                 session_id,
                 notify,
                 state.client_capabilities
               ) do
            {:ok, text} ->
              text

            {:error, reason} ->
              fallback_text =
                [
                  "LLM backend is configured but failed at runtime (#{inspect(reason)}).",
                  "",
                  "Falling back to stub response.",
                  "",
                  "Your prompt (rendered):",
                  user_text
                ]
                |> Enum.join("\n")

              fallback_text
              |> chunk_text(600)
              |> Enum.each(fn chunk ->
                send_update(notify, session_id, %{
                  "sessionUpdate" => "agent_message_chunk",
                  "content" => %{"type" => "text", "text" => chunk}
                })
              end)

              fallback_text
          end
        else
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
              "To enable the LLM backend (OpenRouter), set:",
              "- OPENSENTIENCE_OPENROUTER_API_KEY (or OPENROUTER_API_KEY)",
              "- OPENSENTIENCE_OPENROUTER_MODEL (optional)",
              "",
              "Your prompt (rendered):",
              user_text
            ]
            |> Enum.join("\n")

          response_text
          |> chunk_text(600)
          |> Enum.each(fn chunk ->
            send_update(notify, session_id, %{
              "sessionUpdate" => "agent_message_chunk",
              "content" => %{"type" => "text", "text" => chunk}
            })
          end)

          response_text
        end

      # Record agent response in history
      session =
        Map.update!(session, :history, fn hist ->
          hist ++ [%{role: :agent, content: [%{"type" => "text", "text" => final_text}]}]
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

  defp error_response(id, code, message, data) do
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

  defp llm_system_prompt(session) do
    cwd =
      case Map.get(session, :cwd) do
        p when is_binary(p) -> p
        _ -> ""
      end

    mode =
      case Map.get(session, :mode) do
        m when is_binary(m) -> m
        _ -> "default"
      end

    [
      "You are OpenSentience, an external coding agent running inside Zed via ACP.",
      "Follow the user's instructions and be concise and precise.",
      "If you need to read or write files or run commands, use the available tools.",
      "All file paths MUST be absolute when using file tools.",
      "Session working directory: #{cwd}",
      "Session mode: #{mode}"
    ]
    |> Enum.join("\n")
  end

  defp history_to_llm_messages(history) when is_list(history) do
    history
    |> Enum.flat_map(fn
      %{role: :user, content: blocks} when is_list(blocks) ->
        text = Prompt.render_prompt(blocks)
        if String.trim(text) == "", do: [], else: [%{"role" => "user", "content" => text}]

      %{role: :agent, content: blocks} when is_list(blocks) ->
        text = Prompt.render_prompt(blocks)
        if String.trim(text) == "", do: [], else: [%{"role" => "assistant", "content" => text}]

      _ ->
        []
    end)
  end

  defp llm_tools do
    [
      %{
        "type" => "function",
        "function" => %{
          "name" => "read_file",
          "description" =>
            "Read a text file from disk via the client. Path must be an absolute path (or a file:// URI with an absolute path).",
          "parameters" => %{
            "type" => "object",
            "properties" => %{
              "path" => %{
                "type" => "string",
                "description" => "Absolute file path (or file:// URI)."
              },
              "line" => %{"type" => "integer", "description" => "1-based start line (optional)."},
              "limit" => %{"type" => "integer", "description" => "Max lines to read (optional)."}
            },
            "required" => ["path"]
          }
        }
      },
      %{
        "type" => "function",
        "function" => %{
          "name" => "write_file",
          "description" =>
            "Write a text file via the client. Path must be an absolute path (or a file:// URI with an absolute path).",
          "parameters" => %{
            "type" => "object",
            "properties" => %{
              "path" => %{
                "type" => "string",
                "description" => "Absolute file path (or file:// URI)."
              },
              "content" => %{"type" => "string", "description" => "Full new file contents."}
            },
            "required" => ["path", "content"]
          }
        }
      },
      %{
        "type" => "function",
        "function" => %{
          "name" => "run_command",
          "description" =>
            "Run a shell command in the user's environment via the client terminal. Use absolute cwd when provided.",
          "parameters" => %{
            "type" => "object",
            "properties" => %{
              "command" => %{
                "type" => "string",
                "description" => "Executable name, e.g. 'mix' or 'npm'."
              },
              "args" => %{
                "type" => "array",
                "items" => %{"type" => "string"},
                "description" => "Command arguments."
              },
              "cwd" => %{
                "type" => "string",
                "description" => "Absolute working directory (optional)."
              },
              "env" => %{
                "type" => "array",
                "items" => %{
                  "type" => "object",
                  "properties" => %{
                    "name" => %{"type" => "string"},
                    "value" => %{"type" => "string"}
                  },
                  "required" => ["name", "value"]
                },
                "description" => "Environment variables (optional)."
              }
            },
            "required" => ["command"]
          }
        }
      }
    ]
  end

  defp llm_tools_for_client(client_capabilities) when is_map(client_capabilities) do
    llm_tools()
    |> Enum.filter(fn
      %{"type" => "function", "function" => %{"name" => "read_file"}} ->
        client_supports_fs_read?(client_capabilities)

      %{"type" => "function", "function" => %{"name" => "write_file"}} ->
        client_supports_fs_write?(client_capabilities)

      %{"type" => "function", "function" => %{"name" => "run_command"}} ->
        client_supports_terminal?(client_capabilities)

      _ ->
        true
    end)
  end

  defp llm_tools_for_client(_), do: llm_tools()

  defp client_supports_fs_read?(caps) when is_map(caps) do
    fs = Map.get(caps, "fs") || Map.get(caps, :fs) || %{}
    Map.get(fs, "readTextFile") == true or Map.get(fs, :readTextFile) == true
  end

  defp client_supports_fs_read?(_), do: false

  defp client_supports_fs_write?(caps) when is_map(caps) do
    fs = Map.get(caps, "fs") || Map.get(caps, :fs) || %{}
    Map.get(fs, "writeTextFile") == true or Map.get(fs, :writeTextFile) == true
  end

  defp client_supports_fs_write?(_), do: false

  defp client_supports_terminal?(caps) when is_map(caps) do
    Map.get(caps, "terminal") == true or Map.get(caps, :terminal) == true
  end

  defp client_supports_terminal?(_), do: false

  defp run_llm_with_tools(llm_cfg, messages, session_id, notify, client_capabilities) do
    run_llm_with_tools(llm_cfg, messages, session_id, notify, client_capabilities, 1, 3, "")
  end

  defp run_llm_with_tools(
         llm_cfg,
         messages,
         session_id,
         notify,
         client_capabilities,
         turn,
         max_turns,
         acc_text
       ) do
    router_pid = Process.get(:acp_router)

    # Only advertise tools to the model when we can actually execute them.
    tools =
      if is_pid(router_pid) do
        llm_tools_for_client(client_capabilities)
      else
        []
      end

    llm_opts =
      if tools == [] do
        []
      else
        [tools: tools, tool_choice: "auto"]
      end

    case LLM.chat(llm_cfg, messages, llm_opts) do
      {:ok, %{text: text, tool_calls: tool_calls}} when is_list(tool_calls) ->
        if is_binary(text) and String.trim(text) != "" do
          text
          |> chunk_text(600)
          |> Enum.each(fn chunk ->
            send_update(notify, session_id, %{
              "sessionUpdate" => "agent_message_chunk",
              "content" => %{"type" => "text", "text" => chunk}
            })
          end)
        end

        acc_text = acc_text <> (text || "")

        cond do
          tool_calls == [] ->
            {:ok, acc_text}

          turn >= max_turns ->
            {:ok, acc_text}

          true ->
            router = router_pid

            if not is_pid(router) do
              {:error, :acp_router_unavailable}
            else
              {:ok, results} =
                Tooling.execute_tool_calls(
                  session_id,
                  tool_calls,
                  router,
                  notify,
                  client_capabilities,
                  timeout_ms: 30_000,
                  request_permission: true
                )

              tool_messages = Tooling.to_model_tool_results(results, :openai_chat)

              assistant_content =
                if is_binary(text) and String.trim(text) != "" do
                  text
                else
                  nil
                end

              messages2 =
                messages ++
                  [
                    %{
                      "role" => "assistant",
                      "content" => assistant_content,
                      "tool_calls" => tool_calls
                    }
                  ] ++ tool_messages

              run_llm_with_tools(
                llm_cfg,
                messages2,
                session_id,
                notify,
                client_capabilities,
                turn + 1,
                max_turns,
                acc_text
              )
            end
        end

      {:ok, %{text: text}} ->
        if is_binary(text) and String.trim(text) != "" do
          text
          |> chunk_text(600)
          |> Enum.each(fn chunk ->
            send_update(notify, session_id, %{
              "sessionUpdate" => "agent_message_chunk",
              "content" => %{"type" => "text", "text" => chunk}
            })
          end)
        end

        {:ok, acc_text <> (text || "")}

      {:error, reason} ->
        {:error, reason}
    end
  end
end
