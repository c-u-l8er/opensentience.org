defmodule OpenSentience.Tooling do
  @moduledoc """
  Tool execution loop that maps **model tool calls** to **ACP client methods**.

  This module is meant to sit between your LLM adapter and ACP:

  - The model yields tool calls (typically OpenAI-style: `%{"id", "type", "function" => %{"name","arguments"}}`)
  - The agent executes them by calling ACP *client* methods over JSON-RPC (via `OpenSentience.ACP.Router`)
  - Progress/results are streamed to Zed via `session/update` using `tool_call` / `tool_call_update`

  ## Supported tool names (default mapping)

  - `read_file` -> `fs/read_text_file`
  - `write_file` -> `fs/write_text_file`
  - `run_command` -> `terminal/create` + `terminal/wait_for_exit` + `terminal/output` + `terminal/release`

  You can also pass through ACP method names directly:
  - `fs/read_text_file`, `fs/write_text_file`, `terminal/create`, ...

  ## Permission requests

  If `:request_permission` is enabled (default: true), `write_file` and `run_command`
  will call `session/request_permission` before executing.

  ## Return value

  `execute_tool_calls/6` returns:

  - `{:ok, results}` where `results` is a list of per-call results (success or error)
  - You can convert those into model "tool result" messages using `to_model_tool_results/2`
  """

  require Logger

  @type router :: GenServer.server()
  @type notify_fun :: (map() -> any())

  @typedoc "OpenAI-style tool call object (string keys)."
  @type model_tool_call :: map()

  @typedoc "Result item for one tool call."
  @type tool_result :: %{
          required(:tool_call_id) => String.t(),
          required(:name) => String.t(),
          required(:ok) => boolean(),
          optional(:output) => any(),
          optional(:error) => any()
        }

  @default_timeout_ms 30_000
  @default_terminal_output_limit 1_048_576

  @doc """
  Execute a list of model tool calls.

  - `session_id` is the ACP session id
  - `tool_calls` is a list of model tool calls (OpenAI-style or compatible)
  - `router` is the ACP router process used to call client methods
  - `notify` emits `session/update` notifications
  - `client_capabilities` should be the `clientCapabilities` object received in `initialize`
  - `opts` controls behavior (timeouts, permission prompts, etc.)

  Options:
  - `:request_permission` (boolean, default: true)
  - `:timeout_ms` (integer, default: #{@default_timeout_ms})
  - `:terminal_output_byte_limit` (integer, default: #{@default_terminal_output_limit})
  - `:cancelled?` (`fun/0`, optional) if provided and returns true, execution stops early

  Returns `{:ok, results}`. Each result item is marked `ok: true/false` and includes output or error.
  """
  @spec execute_tool_calls(
          String.t(),
          [model_tool_call()],
          router(),
          notify_fun(),
          map(),
          keyword()
        ) :: {:ok, [tool_result()]}
  def execute_tool_calls(session_id, tool_calls, router, notify, client_capabilities, opts \\ [])
      when is_binary(session_id) and is_list(tool_calls) and is_function(notify, 1) do
    timeout_ms = Keyword.get(opts, :timeout_ms, @default_timeout_ms)
    request_permission? = Keyword.get(opts, :request_permission, true)
    cancelled? = Keyword.get(opts, :cancelled?, nil)

    results =
      Enum.reduce(tool_calls, [], fn tool_call, acc ->
        if is_function(cancelled?, 0) and cancelled?.() do
          # Spec-wise, cancellations should resolve the prompt with stopReason=cancelled.
          # We just stop running further tools here.
          acc
        else
          [
            execute_one(
              session_id,
              tool_call,
              router,
              notify,
              client_capabilities,
              timeout_ms,
              request_permission?,
              opts
            )
            | acc
          ]
        end
      end)
      |> Enum.reverse()

    {:ok, results}
  end

  @doc """
  Convert tool execution results into model-facing "tool result" messages.

  This is intentionally adapter-friendly: you may need to tweak the exact schema
  to match your LLM provider. For OpenAI-compatible chat completions, tool results
  are typically:

    `%{ "role" => "tool", "tool_call_id" => "...", "content" => "..." }`

  `format` can be:
  - `:openai_chat` (default)
  - `:raw` (returns the `tool_result` list unchanged)
  """
  @spec to_model_tool_results([tool_result()], atom()) :: list()
  def to_model_tool_results(results, format \\ :openai_chat)

  def to_model_tool_results(results, :raw) when is_list(results), do: results

  def to_model_tool_results(results, :openai_chat) when is_list(results) do
    Enum.map(results, fn r ->
      content =
        cond do
          r[:ok] == true ->
            stringify_tool_output(r[:output])

          true ->
            "Tool call failed: " <> stringify_tool_output(r[:error])
        end

      %{
        "role" => "tool",
        "tool_call_id" => r.tool_call_id,
        "content" => content
      }
    end)
  end

  # ----------------------------------------------------------------------------
  # Per-call execution
  # ----------------------------------------------------------------------------

  defp execute_one(
         session_id,
         tool_call,
         router,
         notify,
         client_capabilities,
         timeout_ms,
         request_permission?,
         opts
       ) do
    {tool_call_id, name, args} = normalize_model_tool_call(tool_call)

    kind = tool_kind(name)
    title = tool_title(name, args)

    # Announce tool call
    send_update(notify, session_id, %{
      "sessionUpdate" => "tool_call",
      "toolCallId" => tool_call_id,
      "title" => title,
      "kind" => kind,
      "status" => "pending",
      "rawInput" => %{"name" => name, "arguments" => args}
    })

    case maybe_request_permission(
           session_id,
           tool_call_id,
           name,
           args,
           kind,
           router,
           client_capabilities,
           timeout_ms,
           request_permission?
         ) do
      :ok ->
        # Start execution
        send_update(notify, session_id, %{
          "sessionUpdate" => "tool_call_update",
          "toolCallId" => tool_call_id,
          "status" => "in_progress"
        })

        case dispatch_tool(
               session_id,
               name,
               args,
               router,
               notify,
               client_capabilities,
               timeout_ms,
               opts,
               tool_call_id
             ) do
          {:ok, output, raw_output} ->
            content_items =
              case {name, output} do
                {"write_file", %{"writtenPath" => path, "newText" => new_text} = out}
                when is_binary(path) and is_binary(new_text) ->
                  [
                    %{
                      "type" => "diff",
                      "path" => path,
                      "oldText" => Map.get(out, "oldText"),
                      "newText" => new_text
                    },
                    %{
                      "type" => "content",
                      "content" => %{"type" => "text", "text" => "Wrote #{path}."}
                    }
                  ]

                _ ->
                  [
                    %{
                      "type" => "content",
                      "content" => %{"type" => "text", "text" => stringify_tool_output(output)}
                    }
                  ]
              end

            send_update(notify, session_id, %{
              "sessionUpdate" => "tool_call_update",
              "toolCallId" => tool_call_id,
              "status" => "completed",
              "rawOutput" => raw_output,
              "content" => content_items
            })

            %{
              tool_call_id: tool_call_id,
              name: name,
              ok: true,
              output: output
            }

          {:error, error, raw_output} ->
            send_update(notify, session_id, %{
              "sessionUpdate" => "tool_call_update",
              "toolCallId" => tool_call_id,
              "status" => "failed",
              "rawOutput" => raw_output,
              "content" => [
                %{
                  "type" => "content",
                  "content" => %{
                    "type" => "text",
                    "text" =>
                      case {error, raw_output} do
                        {{:timeout, id}, %{"method" => method}} when is_binary(method) ->
                          "Timeout calling #{method} (id=#{id})"

                        _ ->
                          "Error: " <> stringify_tool_output(error)
                      end
                  }
                }
              ]
            })

            %{
              tool_call_id: tool_call_id,
              name: name,
              ok: false,
              error: error
            }
        end

      {:error, :rejected} ->
        # Permission explicitly rejected
        send_update(notify, session_id, %{
          "sessionUpdate" => "tool_call_update",
          "toolCallId" => tool_call_id,
          "status" => "failed",
          "content" => [
            %{
              "type" => "content",
              "content" => %{"type" => "text", "text" => "Permission rejected by user."}
            }
          ]
        })

        %{
          tool_call_id: tool_call_id,
          name: name,
          ok: false,
          error: :permission_rejected
        }

      {:error, :cancelled} ->
        # Client cancelled the prompt turn while permission was pending.
        # Client will mark tools cancelled; we just fail this one.
        send_update(notify, session_id, %{
          "sessionUpdate" => "tool_call_update",
          "toolCallId" => tool_call_id,
          "status" => "failed",
          "content" => [
            %{
              "type" => "content",
              "content" => %{"type" => "text", "text" => "Cancelled."}
            }
          ]
        })

        %{
          tool_call_id: tool_call_id,
          name: name,
          ok: false,
          error: :cancelled
        }

      {:error, other} ->
        # Permission flow errored
        send_update(notify, session_id, %{
          "sessionUpdate" => "tool_call_update",
          "toolCallId" => tool_call_id,
          "status" => "failed",
          "content" => [
            %{
              "type" => "content",
              "content" => %{
                "type" => "text",
                "text" => "Permission request failed: " <> inspect(other)
              }
            }
          ]
        })

        %{
          tool_call_id: tool_call_id,
          name: name,
          ok: false,
          error: {:permission_request_failed, other}
        }
    end
  end

  defp normalize_model_tool_call(%{"id" => id, "type" => "function", "function" => %{} = f})
       when is_binary(id) do
    name = Map.get(f, "name") || Map.get(f, :name) || "unknown"
    args_raw = Map.get(f, "arguments") || Map.get(f, :arguments) || %{}

    args =
      cond do
        is_map(args_raw) ->
          args_raw

        is_binary(args_raw) ->
          case Jason.decode(args_raw) do
            {:ok, %{} = m} -> m
            {:ok, other} -> %{"_raw_arguments" => other}
            {:error, err} -> %{"_arguments_decode_error" => inspect(err), "_raw" => args_raw}
          end

        true ->
          %{"_raw_arguments" => args_raw}
      end

    {id, to_string(name), args}
  end

  # Support looser shapes for easier integration.
  defp normalize_model_tool_call(%{"toolCallId" => id, "name" => name} = tc) when is_binary(id) do
    args = Map.get(tc, "arguments", %{})
    {id, to_string(name), normalize_args_map(args)}
  end

  defp normalize_model_tool_call(other) when is_map(other) do
    id =
      Map.get(other, "id") ||
        Map.get(other, :id) ||
        "call_" <> Base.encode16(:crypto.strong_rand_bytes(6), case: :lower)

    name = Map.get(other, "name") || Map.get(other, :name) || "unknown"
    args = Map.get(other, "arguments") || Map.get(other, :arguments) || %{}
    {to_string(id), to_string(name), normalize_args_map(args)}
  end

  defp normalize_model_tool_call(_other) do
    id = "call_" <> Base.encode16(:crypto.strong_rand_bytes(6), case: :lower)
    {id, "unknown", %{}}
  end

  defp normalize_args_map(%{} = m), do: m
  defp normalize_args_map(_), do: %{}

  # ----------------------------------------------------------------------------
  # Permission
  # ----------------------------------------------------------------------------

  defp maybe_request_permission(
         _session_id,
         _tool_call_id,
         _name,
         _args,
         _kind,
         _router,
         _caps,
         _timeout_ms,
         false
       ),
       do: :ok

  defp maybe_request_permission(
         session_id,
         tool_call_id,
         name,
         args,
         kind,
         router,
         client_capabilities,
         timeout_ms,
         true
       ) do
    if needs_permission?(name, kind) do
      request_permission(
        session_id,
        tool_call_id,
        name,
        args,
        router,
        client_capabilities,
        timeout_ms
      )
    else
      :ok
    end
  end

  defp needs_permission?(name, kind) do
    # Conservative default: ask before writes and execution.
    kind in ["edit", "delete", "move", "execute"] or
      name in ["write_file", "run_command", "fs/write_text_file", "terminal/create"]
  end

  defp request_permission(
         session_id,
         tool_call_id,
         name,
         args,
         router,
         _client_capabilities,
         timeout_ms
       ) do
    # ACP baseline client method: `session/request_permission`
    # NOTE: Zed may auto-allow/deny depending on user settings.
    params = %{
      "sessionId" => session_id,
      "toolCall" => %{
        "toolCallId" => tool_call_id,
        "title" => tool_title(name, args),
        "kind" => tool_kind(name),
        "rawInput" => %{"name" => name, "arguments" => args}
      },
      "options" => [
        %{"optionId" => "allow-once", "name" => "Allow once", "kind" => "allow_once"},
        %{"optionId" => "reject-once", "name" => "Reject", "kind" => "reject_once"}
      ]
    }

    case OpenSentience.ACP.Router.request(
           router,
           "session/request_permission",
           params,
           timeout_ms
         ) do
      {:ok, %{"outcome" => %{"outcome" => "selected", "optionId" => option_id}}} ->
        if option_id in ["allow-once", "allow-always"] do
          :ok
        else
          {:error, :rejected}
        end

      {:ok, %{"outcome" => %{"outcome" => "cancelled"}}} ->
        {:error, :cancelled}

      {:ok, other} ->
        {:error, {:unexpected_permission_response, other}}

      {:error, reason} ->
        {:error, reason}
    end
  end

  # ----------------------------------------------------------------------------
  # Dispatch/mapping
  # ----------------------------------------------------------------------------

  defp dispatch_tool(
         session_id,
         "read_file",
         args,
         router,
         _notify,
         client_capabilities,
         timeout_ms,
         _opts,
         _tool_call_id
       ) do
    path = Map.get(args, "path") || Map.get(args, "file") || Map.get(args, "uri")
    line = Map.get(args, "line")
    limit = Map.get(args, "limit")

    with :ok <- ensure_fs_read_supported(client_capabilities),
         {:ok, abs_path} <- ensure_absolute_path(path) do
      params =
        %{
          "sessionId" => session_id,
          "path" => abs_path
        }
        |> maybe_put("line", line)
        |> maybe_put("limit", limit)

      case OpenSentience.ACP.Router.request(router, "fs/read_text_file", params, timeout_ms) do
        {:ok, %{"content" => content}} ->
          {:ok, %{"content" => content}, %{"contentBytes" => byte_size(content)}}

        {:ok, other} ->
          {:error, {:unexpected_fs_read_response, other}, other}

        {:error, reason} ->
          {:error, reason, %{"method" => "fs/read_text_file", "path" => abs_path}}
      end
    else
      {:error, reason} ->
        {:error, reason, %{"method" => "fs/read_text_file", "path" => path}}
    end
  end

  defp dispatch_tool(
         session_id,
         "write_file",
         args,
         router,
         _notify,
         client_capabilities,
         timeout_ms,
         _opts,
         _tool_call_id
       ) do
    path = Map.get(args, "path") || Map.get(args, "file") || Map.get(args, "uri")
    content = Map.get(args, "content") || Map.get(args, "text") || ""

    with :ok <- ensure_fs_write_supported(client_capabilities),
         {:ok, abs_path} <- ensure_absolute_path(path),
         true <- is_binary(content) do
      old_text =
        case ensure_fs_read_supported(client_capabilities) do
          :ok ->
            case OpenSentience.ACP.Router.request(
                   router,
                   "fs/read_text_file",
                   %{"sessionId" => session_id, "path" => abs_path},
                   timeout_ms
                 ) do
              {:ok, %{"content" => existing}} when is_binary(existing) -> existing
              _ -> nil
            end

          _ ->
            nil
        end

      params = %{
        "sessionId" => session_id,
        "path" => abs_path,
        "content" => content
      }

      case OpenSentience.ACP.Router.request(router, "fs/write_text_file", params, timeout_ms) do
        {:ok, _nil_or_obj} ->
          {:ok,
           %{
             "writtenPath" => abs_path,
             "contentBytes" => byte_size(content),
             "oldText" => old_text,
             "newText" => content
           },
           %{
             "path" => abs_path,
             "oldTextBytes" => (is_binary(old_text) && byte_size(old_text)) || nil,
             "newTextBytes" => byte_size(content)
           }}

        {:error, reason} ->
          {:error, reason, %{"method" => "fs/write_text_file", "path" => abs_path}}
      end
    else
      false ->
        {:error, {:invalid_params, "content must be a string"}, %{"content" => content}}

      {:error, reason} ->
        {:error, reason, %{"method" => "fs/write_text_file", "path" => path}}
    end
  end

  defp dispatch_tool(
         session_id,
         "run_command",
         args,
         router,
         notify,
         client_capabilities,
         timeout_ms,
         opts,
         tool_call_id
       ) do
    cmd = Map.get(args, "command") || Map.get(args, "cmd")
    argv = Map.get(args, "args") || []
    cwd = Map.get(args, "cwd")
    env = Map.get(args, "env") || []
    output_limit = Keyword.get(opts, :terminal_output_byte_limit, @default_terminal_output_limit)

    mode = run_command_mode()

    cond do
      not is_binary(cmd) ->
        {:error, {:invalid_params, "command must be a string"}, %{"command" => cmd}}

      mode == :local ->
        run_local_command(cmd, argv, cwd, env, timeout_ms, output_limit)

      true ->
        case ensure_terminal_supported(client_capabilities) do
          :ok ->
            create_params =
              %{
                "sessionId" => session_id,
                "command" => cmd,
                "args" => normalize_string_list(argv),
                "env" => normalize_env(env),
                "outputByteLimit" => output_limit
              }
              |> maybe_put("cwd", cwd)

            case OpenSentience.ACP.Router.request(
                   router,
                   "terminal/create",
                   create_params,
                   timeout_ms
                 ) do
              {:ok, %{"terminalId" => terminal_id}} when is_binary(terminal_id) ->
                # Embed terminal into the tool call so Zed can show live output.
                send_update(notify, session_id, %{
                  "sessionUpdate" => "tool_call_update",
                  "toolCallId" => tool_call_id,
                  "content" => [
                    %{"type" => "terminal", "terminalId" => terminal_id}
                  ]
                })

                # Wait for exit (bounded by timeout_ms, but add slack on the router side)
                _ =
                  OpenSentience.ACP.Router.request(
                    router,
                    "terminal/wait_for_exit",
                    %{"sessionId" => session_id, "terminalId" => terminal_id},
                    timeout_ms
                  )

                # Fetch final output
                output =
                  case OpenSentience.ACP.Router.request(
                         router,
                         "terminal/output",
                         %{"sessionId" => session_id, "terminalId" => terminal_id},
                         timeout_ms
                       ) do
                    {:ok, %{"output" => out} = resp} ->
                      {out, resp}

                    {:ok, other} ->
                      {"", other}

                    {:error, reason} ->
                      {"", %{"error" => inspect(reason)}}
                  end

                # Release terminal (best-effort)
                _ =
                  OpenSentience.ACP.Router.request(
                    router,
                    "terminal/release",
                    %{"sessionId" => session_id, "terminalId" => terminal_id},
                    timeout_ms
                  )

                {out_text, raw_output} = output

                summary = %{
                  "terminalId" => terminal_id,
                  "output" => out_text
                }

                {:ok, summary, Map.put(raw_output, "terminalId", terminal_id)}

              {:ok, other} ->
                {:error, {:unexpected_terminal_create_response, other}, other}

              {:error, reason} ->
                # If the client terminal path is broken (e.g. Zed doesn't respond to terminal/create),
                # fall back to local execution in :auto mode.
                if mode == :auto do
                  run_local_command(cmd, argv, cwd, env, timeout_ms, output_limit)
                else
                  {:error, reason, %{"method" => "terminal/create"}}
                end
            end

          {:error, _unsupported} ->
            # Client terminal not supported; local fallback
            run_local_command(cmd, argv, cwd, env, timeout_ms, output_limit)
        end
    end
  end

  # Allow calling ACP methods directly by name (advanced / passthrough).
  defp dispatch_tool(
         session_id,
         method,
         args,
         router,
         _notify,
         client_capabilities,
         timeout_ms,
         _opts,
         _tool_call_id
       )
       when is_binary(method) do
    case ensure_method_supported(method, client_capabilities) do
      :ok ->
        params = Map.put(args, "sessionId", session_id)

        case OpenSentience.ACP.Router.request(router, method, params, timeout_ms) do
          {:ok, result} -> {:ok, result, %{"method" => method}}
          {:error, reason} -> {:error, reason, %{"method" => method}}
        end

      {:error, reason} ->
        {:error, reason, %{"method" => method}}
    end
  end

  # ----------------------------------------------------------------------------
  # Capability checks (do not crash the agent; return tool-call failure instead)
  # ----------------------------------------------------------------------------

  defp ensure_fs_read_supported(caps) do
    supported? =
      get_in(caps, ["fs", "readTextFile"]) == true or
        get_in(caps, [:fs, :readTextFile]) == true

    if supported? do
      :ok
    else
      {:error, {:unsupported, "fs/read_text_file"}}
    end
  end

  defp ensure_fs_write_supported(caps) do
    supported? =
      get_in(caps, ["fs", "writeTextFile"]) == true or
        get_in(caps, [:fs, :writeTextFile]) == true

    if supported? do
      :ok
    else
      {:error, {:unsupported, "fs/write_text_file"}}
    end
  end

  defp ensure_terminal_supported(caps) do
    supported? = Map.get(caps, "terminal") == true or Map.get(caps, :terminal) == true

    if supported? do
      :ok
    else
      {:error, {:unsupported, "terminal/*"}}
    end
  end

  defp ensure_method_supported(method, caps) when is_binary(method) and is_map(caps) do
    cond do
      String.starts_with?(method, "fs/") and String.ends_with?(method, "read_text_file") ->
        ensure_fs_read_supported(caps)

      String.starts_with?(method, "fs/") and String.ends_with?(method, "write_text_file") ->
        ensure_fs_write_supported(caps)

      String.starts_with?(method, "terminal/") ->
        ensure_terminal_supported(caps)

      true ->
        :ok
    end
  end

  defp ensure_method_supported(_method, _caps), do: :ok

  # ----------------------------------------------------------------------------
  # ACP update helpers
  # ----------------------------------------------------------------------------

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

  # ----------------------------------------------------------------------------
  # Tool metadata
  # ----------------------------------------------------------------------------

  defp tool_kind(name) do
    case name do
      "read_file" -> "read"
      "fs/read_text_file" -> "read"
      "write_file" -> "edit"
      "fs/write_text_file" -> "edit"
      "run_command" -> "execute"
      "terminal/create" -> "execute"
      _ -> "other"
    end
  end

  defp tool_title(name, args) do
    case name do
      "read_file" ->
        "Reading file" <> maybe_suffix(args, "path")

      "write_file" ->
        "Writing file" <> maybe_suffix(args, "path")

      "run_command" ->
        cmd = Map.get(args, "command") || Map.get(args, "cmd") || "command"
        "Running #{cmd}"

      other when is_binary(other) ->
        "Running #{other}"

      _ ->
        "Running tool"
    end
  end

  defp maybe_suffix(args, key) when is_map(args) do
    val = Map.get(args, key)

    if is_binary(val) and val != "" do
      " (#{val})"
    else
      ""
    end
  end

  # ----------------------------------------------------------------------------
  # Misc helpers
  # ----------------------------------------------------------------------------

  defp maybe_put(map, _key, nil), do: map
  defp maybe_put(map, key, value), do: Map.put(map, key, value)

  defp ensure_absolute_path(path) when is_binary(path) do
    cond do
      String.starts_with?(path, "file://") ->
        # ACP expects absolute file paths, not file URIs, for fs methods.
        uri = URI.parse(path)

        if is_binary(uri.path) and Path.type(uri.path) == :absolute do
          {:ok, uri.path}
        else
          {:error, {:invalid_path, "file URI must contain an absolute path"}}
        end

      Path.type(path) == :absolute ->
        {:ok, path}

      true ->
        {:error, {:invalid_path, "path must be absolute"}}
    end
  end

  defp ensure_absolute_path(_other), do: {:error, {:invalid_path, "path must be a string"}}

  defp normalize_string_list(list) when is_list(list) do
    Enum.map(list, &to_string/1)
  end

  defp normalize_string_list(_), do: []

  defp normalize_env(env) when is_list(env) do
    # ACP expects env as a list of %{name, value} objects.
    Enum.flat_map(env, fn
      %{"name" => n, "value" => v} when is_binary(n) and is_binary(v) ->
        [%{"name" => n, "value" => v}]

      %{name: n, value: v} when is_binary(n) and is_binary(v) ->
        [%{"name" => n, "value" => v}]

      {n, v} ->
        [%{"name" => to_string(n), "value" => to_string(v)}]

      other ->
        Logger.debug("Ignoring invalid env entry: #{inspect(other)}")
        []
    end)
  end

  defp normalize_env(_), do: []

  # ----------------------------------------------------------------------------
  # Local command execution (host-side fallback)
  # ----------------------------------------------------------------------------
  #
  # This is useful when the ACP client either:
  # - does not implement `terminal/*`, or
  # - advertises it but fails to respond (e.g. terminal/create timeouts).
  #
  # Configure via:
  # - OPENSENTIENCE_RUN_COMMAND_MODE=local  -> always run locally
  # - OPENSENTIENCE_RUN_COMMAND_MODE=client -> always use client terminal (default)
  # - OPENSENTIENCE_RUN_COMMAND_MODE=auto   -> try client terminal, fallback to local on failure
  defp run_command_mode do
    case System.get_env("OPENSENTIENCE_RUN_COMMAND_MODE") do
      nil ->
        :client

      v when is_binary(v) ->
        v = v |> String.trim() |> String.downcase()

        cond do
          v in ["local", "host", "native"] -> :local
          v in ["client", "terminal"] -> :client
          v in ["auto"] -> :auto
          true -> :client
        end
    end
  end

  defp run_local_command(cmd, argv, cwd, env, timeout_ms, output_limit)
       when is_binary(cmd) and is_list(argv) and is_integer(timeout_ms) and timeout_ms > 0 and
              is_integer(output_limit) and output_limit > 0 do
    exe = System.find_executable(cmd)
    args = normalize_string_list(argv)

    if not is_binary(exe) do
      {:error, {:local_command_not_found, cmd},
       %{"method" => "local/run_command", "command" => cmd}}
    else
      port_opts =
        [
          :binary,
          :exit_status,
          :stderr_to_stdout,
          args: Enum.map(args, &to_charlist/1),
          env: port_env(env)
        ]
        |> maybe_add_cd(cwd)

      port = Port.open({:spawn_executable, exe}, port_opts)

      case collect_port_output(port, timeout_ms, output_limit, "", false) do
        {:ok, out, exit_status, truncated?} ->
          {:ok,
           %{
             "output" => out,
             "exitCode" => exit_status,
             "outputTruncated" => truncated?
           },
           %{
             "method" => "local/run_command",
             "command" => cmd,
             "exitCode" => exit_status,
             "outputBytes" => byte_size(out),
             "outputTruncated" => truncated?
           }}

        {:error, reason, partial, truncated?} ->
          {:error, reason,
           %{
             "method" => "local/run_command",
             "command" => cmd,
             "partialOutput" => partial,
             "outputBytes" => byte_size(partial),
             "outputTruncated" => truncated?
           }}
      end
    end
  end

  defp run_local_command(cmd, argv, cwd, env, timeout_ms, output_limit) do
    {:error, {:invalid_params, "invalid local command arguments"},
     %{
       "method" => "local/run_command",
       "command" => cmd,
       "args" => argv,
       "cwd" => cwd,
       "env" => env,
       "timeout_ms" => timeout_ms,
       "output_limit" => output_limit
     }}
  end

  defp port_env(env) when is_list(env) do
    normalize_env(env)
    |> Enum.map(fn %{"name" => n, "value" => v} ->
      {to_charlist(n), to_charlist(v)}
    end)
  end

  defp port_env(_), do: []

  defp maybe_add_cd(opts, cwd) when is_list(opts) do
    if is_binary(cwd) and String.trim(cwd) != "" do
      opts ++ [cd: to_charlist(cwd)]
    else
      opts
    end
  end

  defp collect_port_output(port, timeout_ms, output_limit, acc, truncated?)
       when is_port(port) and is_integer(timeout_ms) and timeout_ms > 0 and
              is_integer(output_limit) and output_limit > 0 and is_binary(acc) and
              is_boolean(truncated?) do
    receive do
      {^port, {:data, chunk}} when is_binary(chunk) ->
        {acc2, truncated2} = append_limited(acc, chunk, output_limit, truncated?)
        collect_port_output(port, timeout_ms, output_limit, acc2, truncated2)

      {^port, {:exit_status, status}} when is_integer(status) ->
        _ = Port.close(port)
        {:ok, acc, status, truncated?}
    after
      timeout_ms ->
        _ = Port.close(port)
        {:error, {:timeout, :local_run_command}, acc, truncated?}
    end
  end

  defp append_limited(acc, chunk, limit, truncated?) do
    remaining = limit - byte_size(acc)

    cond do
      remaining <= 0 ->
        {acc, true}

      byte_size(chunk) <= remaining ->
        {acc <> chunk, truncated?}

      true ->
        {acc <> binary_part(chunk, 0, remaining), true}
    end
  end

  defp stringify_tool_output(nil), do: "null"

  defp stringify_tool_output(output) when is_binary(output), do: output

  defp stringify_tool_output(output) when is_map(output) or is_list(output) do
    # JSON is often nicer for model/tool outputs.
    try do
      Jason.encode!(output)
    rescue
      _ -> inspect(output)
    end
  end

  defp stringify_tool_output(other), do: inspect(other)
end
