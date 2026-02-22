defmodule OpenSentience.Client do
  @moduledoc """
  Thin wrappers for **client-side ACP methods** (Zed-provided tools) such as:

  - `fs/read_text_file`
  - `fs/write_text_file`
  - `terminal/*`
  - `session/request_permission`

  These methods are *invoked by the agent* and executed by the client (e.g. Zed).
  Under the hood, this module uses `OpenSentience.ACP.Router` to send JSON-RPC
  requests and correlate responses.

  This module is intentionally conservative:
  - It validates absolute file paths where required (ACP requires absolute paths).
  - It checks client capabilities (from `initialize.clientCapabilities`) before calling
    optional client methods, returning `{:error, :unsupported}` when unavailable.

  ## Return values

  Most functions return the router's result shape:

  - `{:ok, result}` on success
  - `{:error, error_obj}` on JSON-RPC error response from the client
  - `{:error, {:timeout, id}}`, `{:error, {:send_failed, reason}}`, `{:error, :router_stopped}`

  Plus some local validation errors:

  - `{:error, :unsupported}`
  - `{:error, {:invalid_path, path}}`
  - `{:error, {:invalid_params, detail}}`

  ## Router discovery

  If you don't pass a router pid explicitly, these helpers will try
  `Process.get(:acp_router)` (as set by `OpenSentience.CLI`).
  """

  alias OpenSentience.ACP.Router

  @type client_capabilities :: map()
  @type session_id :: String.t()
  @type abs_path :: String.t()

  # -------------------------
  # Router helpers
  # -------------------------

  @doc """
  Returns the ACP router pid from the current process dictionary, or `nil`.
  """
  @spec router() :: pid() | nil
  def router do
    case Process.get(:acp_router) do
      pid when is_pid(pid) -> pid
      _ -> nil
    end
  end

  @doc """
  Returns the router pid (explicit or from process dictionary), otherwise raises.

  Prefer passing an explicit router pid from your agent state when practical.
  """
  @spec router!(pid() | nil) :: pid()
  def router!(router_pid \\ nil)

  def router!(router_pid) when is_pid(router_pid), do: router_pid

  def router!(nil) do
    case router() do
      pid when is_pid(pid) ->
        pid

      _ ->
        raise ArgumentError,
              "ACP router pid not available (expected Process.get(:acp_router) or an explicit pid)"
    end
  end

  # -------------------------
  # Capability checks
  # -------------------------

  @doc """
  True if the client supports `fs/read_text_file`.
  """
  @spec supports_fs_read?(client_capabilities()) :: boolean()
  def supports_fs_read?(caps), do: truthy?(get_in_any(caps, ["fs", "readTextFile"]))

  @doc """
  True if the client supports `fs/write_text_file`.
  """
  @spec supports_fs_write?(client_capabilities()) :: boolean()
  def supports_fs_write?(caps), do: truthy?(get_in_any(caps, ["fs", "writeTextFile"]))

  @doc """
  True if the client supports `terminal/*`.
  """
  @spec supports_terminal?(client_capabilities()) :: boolean()
  def supports_terminal?(caps), do: truthy?(get_in_any(caps, ["terminal"]))

  # -------------------------
  # fs/*
  # -------------------------

  @doc """
  Calls `fs/read_text_file`.

  Options:
  - `:line` (1-based integer)
  - `:limit` (max lines)
  - `:timeout_ms` (router wait timeout)
  """
  @spec fs_read_text_file(pid() | nil, client_capabilities(), session_id(), abs_path(), keyword()) ::
          Router.request_result() | {:error, :unsupported} | {:error, {:invalid_path, String.t()}}
  def fs_read_text_file(router_pid, client_caps, session_id, path, opts \\ [])
      when is_binary(session_id) and is_binary(path) and is_list(opts) do
    if not supports_fs_read?(client_caps) do
      {:error, :unsupported}
    else
      with :ok <- validate_absolute_path(path),
           {:ok, params} <- build_fs_read_params(session_id, path, opts) do
        Router.request(router!(router_pid), "fs/read_text_file", params, timeout_opt(opts))
      end
    end
  end

  @doc """
  Calls `fs/write_text_file`.

  Options:
  - `:timeout_ms`
  """
  @spec fs_write_text_file(
          pid() | nil,
          client_capabilities(),
          session_id(),
          abs_path(),
          String.t(),
          keyword()
        ) ::
          Router.request_result() | {:error, :unsupported} | {:error, {:invalid_path, String.t()}}
  def fs_write_text_file(router_pid, client_caps, session_id, path, content, opts \\ [])
      when is_binary(session_id) and is_binary(path) and is_binary(content) and is_list(opts) do
    if not supports_fs_write?(client_caps) do
      {:error, :unsupported}
    else
      with :ok <- validate_absolute_path(path) do
        params = %{
          "sessionId" => session_id,
          "path" => path,
          "content" => content
        }

        Router.request(router!(router_pid), "fs/write_text_file", params, timeout_opt(opts))
      end
    end
  end

  # -------------------------
  # terminal/*
  # -------------------------

  @doc """
  Calls `terminal/create`.

  `env` may be:
  - a map of `"NAME" => "VALUE"` pairs
  - a keyword list `[NAME: "VALUE"]`
  - a list of `%{"name" => ..., "value" => ...}` objects (already in ACP shape)

  Options:
  - `:cwd` (absolute path)
  - `:env` (see above)
  - `:args` (list of strings)
  - `:output_byte_limit` (integer)
  - `:timeout_ms`
  """
  @spec terminal_create(pid() | nil, client_capabilities(), session_id(), String.t(), keyword()) ::
          Router.request_result()
          | {:error, :unsupported}
          | {:error, {:invalid_path, String.t()}}
          | {:error, {:invalid_params, String.t()}}
  def terminal_create(router_pid, client_caps, session_id, command, opts \\ [])
      when is_binary(session_id) and is_binary(command) and is_list(opts) do
    if not supports_terminal?(client_caps) do
      {:error, :unsupported}
    else
      with {:ok, params} <- build_terminal_create_params(session_id, command, opts) do
        Router.request(router!(router_pid), "terminal/create", params, timeout_opt(opts))
      end
    end
  end

  @doc """
  Calls `terminal/output`.
  """
  @spec terminal_output(pid() | nil, client_capabilities(), session_id(), String.t(), keyword()) ::
          Router.request_result() | {:error, :unsupported}
  def terminal_output(router_pid, client_caps, session_id, terminal_id, opts \\ [])
      when is_binary(session_id) and is_binary(terminal_id) and is_list(opts) do
    if not supports_terminal?(client_caps) do
      {:error, :unsupported}
    else
      params = %{"sessionId" => session_id, "terminalId" => terminal_id}
      Router.request(router!(router_pid), "terminal/output", params, timeout_opt(opts))
    end
  end

  @doc """
  Calls `terminal/wait_for_exit`.
  """
  @spec terminal_wait_for_exit(
          pid() | nil,
          client_capabilities(),
          session_id(),
          String.t(),
          keyword()
        ) :: Router.request_result() | {:error, :unsupported}
  def terminal_wait_for_exit(router_pid, client_caps, session_id, terminal_id, opts \\ [])
      when is_binary(session_id) and is_binary(terminal_id) and is_list(opts) do
    if not supports_terminal?(client_caps) do
      {:error, :unsupported}
    else
      params = %{"sessionId" => session_id, "terminalId" => terminal_id}
      Router.request(router!(router_pid), "terminal/wait_for_exit", params, timeout_opt(opts))
    end
  end

  @doc """
  Calls `terminal/kill`.
  """
  @spec terminal_kill(pid() | nil, client_capabilities(), session_id(), String.t(), keyword()) ::
          Router.request_result() | {:error, :unsupported}
  def terminal_kill(router_pid, client_caps, session_id, terminal_id, opts \\ [])
      when is_binary(session_id) and is_binary(terminal_id) and is_list(opts) do
    if not supports_terminal?(client_caps) do
      {:error, :unsupported}
    else
      params = %{"sessionId" => session_id, "terminalId" => terminal_id}
      Router.request(router!(router_pid), "terminal/kill", params, timeout_opt(opts))
    end
  end

  @doc """
  Calls `terminal/release`.
  """
  @spec terminal_release(pid() | nil, client_capabilities(), session_id(), String.t(), keyword()) ::
          Router.request_result() | {:error, :unsupported}
  def terminal_release(router_pid, client_caps, session_id, terminal_id, opts \\ [])
      when is_binary(session_id) and is_binary(terminal_id) and is_list(opts) do
    if not supports_terminal?(client_caps) do
      {:error, :unsupported}
    else
      params = %{"sessionId" => session_id, "terminalId" => terminal_id}
      Router.request(router!(router_pid), "terminal/release", params, timeout_opt(opts))
    end
  end

  # -------------------------
  # session/request_permission
  # -------------------------

  @doc """
  Calls `session/request_permission` for a given tool call.

  You typically call this after reporting a tool call via `session/update` with
  `sessionUpdate: "tool_call"` and before actually performing the operation.

  `tool_call_ref` should include at least:
  - `%{"toolCallId" => "call_001"}`

  `options` should be a list of permission options:
  - `%{"optionId" => "...", "name" => "...", "kind" => "allow_once" | ...}`

  If you pass `options: :default`, a standard allow/reject once set is used.

  Returns `{:ok, %{"outcome" => ...}}` on success (per ACP schema).
  """
  @spec request_permission(
          pid() | nil,
          session_id(),
          map(),
          list(map()) | :default,
          keyword()
        ) :: Router.request_result() | {:error, {:invalid_params, String.t()}}
  def request_permission(router_pid, session_id, tool_call_ref, options \\ :default, opts \\ [])
      when is_binary(session_id) and is_map(tool_call_ref) and is_list(opts) do
    with {:ok, tool_call} <- validate_tool_call_ref(tool_call_ref),
         {:ok, options} <- normalize_permission_options(options) do
      params = %{
        "sessionId" => session_id,
        "toolCall" => tool_call,
        "options" => options
      }

      Router.request(router!(router_pid), "session/request_permission", params, timeout_opt(opts))
    end
  end

  # -------------------------
  # Internals
  # -------------------------

  defp timeout_opt(opts) when is_list(opts) do
    case Keyword.get(opts, :timeout_ms) do
      n when is_integer(n) and n > 0 -> n
      _ -> 30_000
    end
  end

  defp validate_absolute_path(path) when is_binary(path) do
    if Path.type(path) == :absolute do
      :ok
    else
      {:error, {:invalid_path, path}}
    end
  end

  defp build_fs_read_params(session_id, path, opts) do
    base = %{"sessionId" => session_id, "path" => path}

    base =
      case Keyword.get(opts, :line) do
        nil -> base
        n when is_integer(n) and n >= 0 -> Map.put(base, "line", n)
        _ -> :invalid
      end

    if base == :invalid do
      {:error, {:invalid_params, ":line must be an integer >= 0"}}
    else
      base =
        case Keyword.get(opts, :limit) do
          nil -> base
          n when is_integer(n) and n >= 0 -> Map.put(base, "limit", n)
          _ -> :invalid
        end

      if base == :invalid do
        {:error, {:invalid_params, ":limit must be an integer >= 0"}}
      else
        {:ok, base}
      end
    end
  end

  defp build_terminal_create_params(session_id, command, opts) do
    args = Keyword.get(opts, :args, [])

    cond do
      not is_list(args) or not Enum.all?(args, &is_binary/1) ->
        {:error, {:invalid_params, ":args must be a list of strings"}}

      true ->
        cwd = Keyword.get(opts, :cwd)

        with :ok <- validate_optional_absolute_path(:cwd, cwd),
             {:ok, env} <- normalize_env(Keyword.get(opts, :env, [])),
             {:ok, out_limit} <- normalize_optional_nonneg_int(:output_byte_limit, opts) do
          params =
            %{
              "sessionId" => session_id,
              "command" => command,
              "args" => args,
              "env" => env
            }
            |> maybe_put("cwd", cwd)
            |> maybe_put("outputByteLimit", out_limit)

          {:ok, params}
        end
    end
  end

  defp validate_optional_absolute_path(_label, nil), do: :ok

  defp validate_optional_absolute_path(label, path) when is_atom(label) and is_binary(path) do
    if Path.type(path) == :absolute do
      :ok
    else
      {:error, {:invalid_path, "#{label}=#{path}"}}
    end
  end

  defp validate_optional_absolute_path(label, _other),
    do: {:error, {:invalid_params, "#{label} must be a string (absolute path) or nil"}}

  defp normalize_optional_nonneg_int(key, opts) when is_atom(key) and is_list(opts) do
    val = Keyword.get(opts, key)

    cond do
      is_nil(val) -> {:ok, nil}
      is_integer(val) and val >= 0 -> {:ok, val}
      true -> {:error, {:invalid_params, "#{key} must be an integer >= 0"}}
    end
  end

  defp normalize_env(nil), do: {:ok, []}

  defp normalize_env(env) when is_list(env) do
    # Either already-in-shape list of %{name,value}, or keyword list.
    cond do
      Enum.all?(env, &is_map/1) ->
        if Enum.all?(env, fn m ->
             is_binary(Map.get(m, "name")) and is_binary(Map.get(m, "value"))
           end) do
          {:ok, env}
        else
          {:error, {:invalid_params, ":env map entries must have string \"name\" and \"value\""}}
        end

      Keyword.keyword?(env) ->
        env =
          Enum.map(env, fn {k, v} ->
            %{"name" => to_string(k), "value" => to_string(v)}
          end)

        {:ok, env}

      true ->
        {:error, {:invalid_params, ":env must be a map, keyword list, or list of %{name,value}"}}
    end
  end

  defp normalize_env(env) when is_map(env) do
    env =
      Enum.map(env, fn {k, v} ->
        %{"name" => to_string(k), "value" => to_string(v)}
      end)

    {:ok, env}
  end

  defp normalize_env(_other),
    do: {:error, {:invalid_params, ":env must be a map, keyword list, or list"}}

  defp validate_tool_call_ref(%{"toolCallId" => tool_call_id} = tool_call)
       when is_binary(tool_call_id) do
    # Pass through any other included fields; ACP schema expects a ToolCallUpdate-ish object.
    {:ok, tool_call}
  end

  defp validate_tool_call_ref(_),
    do: {:error, {:invalid_params, "tool_call_ref must include a string toolCallId"}}

  defp normalize_permission_options(:default) do
    {:ok,
     [
       %{"optionId" => "allow-once", "name" => "Allow once", "kind" => "allow_once"},
       %{"optionId" => "reject-once", "name" => "Reject", "kind" => "reject_once"}
     ]}
  end

  defp normalize_permission_options(options) when is_list(options) do
    ok? =
      Enum.all?(options, fn opt ->
        is_map(opt) and
          is_binary(Map.get(opt, "optionId")) and
          is_binary(Map.get(opt, "name")) and
          is_binary(Map.get(opt, "kind"))
      end)

    if ok? do
      {:ok, options}
    else
      {:error,
       {:invalid_params,
        "options must be a list of %{optionId: string, name: string, kind: string} maps"}}
    end
  end

  defp normalize_permission_options(_),
    do: {:error, {:invalid_params, "options must be a list or :default"}}

  # Handles both string-keyed maps (from JSON) and atom-keyed maps (if built internally).
  defp get_in_any(map, [k | rest]) when is_map(map) do
    value =
      cond do
        Map.has_key?(map, k) ->
          Map.get(map, k)

        is_binary(k) and Map.has_key?(map, String.to_atom(k)) ->
          Map.get(map, String.to_atom(k))

        true ->
          nil
      end

    case rest do
      [] -> value
      _ when is_map(value) -> get_in_any(value, rest)
      _ -> nil
    end
  end

  defp get_in_any(_other, _path), do: nil

  defp truthy?(true), do: true
  defp truthy?(_), do: false

  defp maybe_put(map, _key, nil), do: map
  defp maybe_put(map, key, value), do: Map.put(map, key, value)
end
