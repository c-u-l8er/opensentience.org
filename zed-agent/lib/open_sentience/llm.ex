defmodule OpenSentience.LLM do
  @moduledoc """
  LLM provider selection + OpenRouter (OpenAI-compatible) implementation.

  This module is intentionally self-contained and transport-agnostic. It does not
  emit ACP messages itself; instead it returns results (or streams deltas via a
  callback) so higher layers (e.g. `OpenSentience.Agent`) can decide how to
  surface output via `session/update`.

  ## Provider selection

  Provider is selected via env:

  - `OPENSENTIENCE_LLM_PROVIDER`:
      - `openrouter` (default)
      - `mock` (deterministic stub; useful for tests)

  OpenRouter configuration env:

  - `OPENSENTIENCE_OPENROUTER_API_KEY` (preferred) or `OPENROUTER_API_KEY`
  - `OPENSENTIENCE_OPENROUTER_MODEL` (default: `openai/gpt-4o-mini`)
  - `OPENSENTIENCE_OPENROUTER_BASE_URL` (default: `https://openrouter.ai/api/v1`)
  - `OPENSENTIENCE_OPENROUTER_APP_URL` (optional, sent as `HTTP-Referer`)
  - `OPENSENTIENCE_OPENROUTER_APP_NAME` (optional, sent as `X-Title`)

  ## Notes

  - OpenRouter is OpenAI-compatible at `/chat/completions`.
  - Streaming uses SSE-style `data:` frames with a terminal `[DONE]` sentinel.
  - This module uses `Req` and `Jason` (already in `mix.exs`).
  """

  require Logger

  @typedoc "OpenAI-style role"
  @type role :: String.t()

  @typedoc "OpenAI-style message"
  @type message :: %{
          required(:role) => role(),
          required(:content) => String.t()
        }

  @typedoc "Provider atoms"
  @type provider :: :openrouter | :mock

  @type t :: %__MODULE__{
          provider: provider(),
          timeout_ms: pos_integer(),
          openrouter: %{
            api_key: String.t() | nil,
            model: String.t(),
            base_url: String.t(),
            app_url: String.t() | nil,
            app_name: String.t() | nil
          }
        }

  defstruct provider: :openrouter,
            timeout_ms: 60_000,
            openrouter: %{
              api_key: nil,
              model: "openai/gpt-4o-mini",
              base_url: "https://openrouter.ai/api/v1",
              app_url: nil,
              app_name: nil
            }

  @doc """
  Build an LLM config from environment variables.
  """
  @spec from_env() :: t()
  def from_env do
    provider =
      System.get_env("OPENSENTIENCE_LLM_PROVIDER")
      |> normalize_provider()
      |> case do
        nil -> :openrouter
        p -> p
      end

    api_key =
      System.get_env("OPENSENTIENCE_OPENROUTER_API_KEY") ||
        System.get_env("OPENROUTER_API_KEY")

    model = System.get_env("OPENSENTIENCE_OPENROUTER_MODEL") || "openai/gpt-4o-mini"

    base_url =
      System.get_env("OPENSENTIENCE_OPENROUTER_BASE_URL") || "https://openrouter.ai/api/v1"

    app_url = System.get_env("OPENSENTIENCE_OPENROUTER_APP_URL")
    app_name = System.get_env("OPENSENTIENCE_OPENROUTER_APP_NAME")

    timeout_ms =
      case System.get_env("OPENSENTIENCE_LLM_TIMEOUT_MS") do
        nil -> 60_000
        v -> parse_positive_int(v) || 60_000
      end

    %__MODULE__{
      provider: provider,
      timeout_ms: timeout_ms,
      openrouter: %{
        api_key: api_key,
        model: model,
        base_url: base_url,
        app_url: app_url,
        app_name: app_name
      }
    }
  end

  @doc """
  Returns true if the configured provider appears usable (e.g., API key present).
  """
  @spec configured?(t()) :: boolean()
  def configured?(%__MODULE__{provider: :openrouter, openrouter: %{api_key: key}})
      when is_binary(key) and byte_size(key) > 0,
      do: true

  def configured?(%__MODULE__{provider: :mock}), do: true
  def configured?(_), do: false

  @doc """
  Perform a non-streaming chat completion.

  Returns `{:ok, %{text: String.t(), tool_calls: list(), raw: map()}}` or `{:error, reason}`.

  If the model responds with tool calls (OpenAI-style `message.tool_calls`), this adapter
  surfaces them via `:tool_calls` even when `:text` is empty.
  """
  @spec chat(t(), [message()], keyword()) ::
          {:ok, %{text: String.t(), tool_calls: list(), raw: map()}} | {:error, term()}
  def chat(%__MODULE__{provider: :mock} = _cfg, messages, _opts) when is_list(messages) do
    {:ok,
     %{
       text: mock_reply(messages),
       tool_calls: [],
       raw: %{"provider" => "mock"}
     }}
  end

  def chat(%__MODULE__{provider: :openrouter} = cfg, messages, opts) when is_list(messages) do
    with :ok <- validate_messages(messages),
         :ok <- ensure_openrouter_key(cfg) do
      openrouter_chat(cfg, messages, opts)
    end
  end

  def chat(_cfg, _messages, _opts) do
    {:error, :invalid_arguments}
  end

  @doc """
  Perform a streaming chat completion.

  `on_delta` will be called with each text delta chunk (binary) as it arrives.

  Returns `{:ok, %{text: full_text, tool_calls: list(), raw: final_json_map_or_partial}}`
  or `{:error, reason}`.

  Notes:
  - This is best-effort streaming; any parse errors in intermediate SSE frames are skipped.
  - Tool calls may be streamed as `choices[].delta.tool_calls` (OpenAI-style). We accumulate
    best-effort tool call objects and return them as `:tool_calls`.
  - The caller should handle cancellation at a higher layer (ACP `session/cancel`).
  """
  @spec chat_stream(t(), [message()], (String.t() -> any()), keyword()) ::
          {:ok, %{text: String.t(), tool_calls: list(), raw: map()}} | {:error, term()}
  def chat_stream(%__MODULE__{provider: :mock} = _cfg, messages, on_delta, _opts)
      when is_list(messages) and is_function(on_delta, 1) do
    text = mock_reply(messages)
    _ = on_delta.(text)
    {:ok, %{text: text, tool_calls: [], raw: %{"provider" => "mock"}}}
  end

  def chat_stream(%__MODULE__{provider: :openrouter} = cfg, messages, on_delta, opts)
      when is_list(messages) and is_function(on_delta, 1) do
    with :ok <- validate_messages(messages),
         :ok <- ensure_openrouter_key(cfg) do
      openrouter_chat_stream(cfg, messages, on_delta, opts)
    end
  end

  def chat_stream(_cfg, _messages, _on_delta, _opts) do
    {:error, :invalid_arguments}
  end

  # -------------------------
  # OpenRouter (OpenAI-compatible) implementation
  # -------------------------

  defp openrouter_chat(%__MODULE__{} = cfg, messages, opts) do
    url = openrouter_url(cfg, "/chat/completions")

    body =
      %{
        "model" => cfg.openrouter.model,
        "messages" => messages,
        "stream" => false
      }
      |> maybe_put("temperature", Keyword.get(opts, :temperature))
      |> maybe_put("max_tokens", Keyword.get(opts, :max_tokens))
      |> maybe_put("top_p", Keyword.get(opts, :top_p))
      |> maybe_put("tools", Keyword.get(opts, :tools))
      |> maybe_put("tool_choice", Keyword.get(opts, :tool_choice))

    headers = openrouter_headers(cfg)

    req =
      Req.new(
        url: url,
        method: :post,
        headers: headers,
        json: body,
        receive_timeout: cfg.timeout_ms
      )

    case Req.request(req) do
      {:ok, %{status: status, body: %{} = json}} when status in 200..299 ->
        case extract_openai_text_and_tool_calls(json) do
          {:ok, text, tool_calls} -> {:ok, %{text: text, tool_calls: tool_calls, raw: json}}
          {:error, reason} -> {:error, {:unexpected_response, reason, json}}
        end

      {:ok, %{status: status, body: body}} ->
        {:error, {:http_error, status, body}}

      {:error, reason} ->
        {:error, {:request_failed, reason}}
    end
  end

  defp openrouter_chat_stream(%__MODULE__{} = cfg, messages, on_delta, opts) do
    url = openrouter_url(cfg, "/chat/completions")

    body =
      %{
        "model" => cfg.openrouter.model,
        "messages" => messages,
        "stream" => true
      }
      |> maybe_put("temperature", Keyword.get(opts, :temperature))
      |> maybe_put("max_tokens", Keyword.get(opts, :max_tokens))
      |> maybe_put("top_p", Keyword.get(opts, :top_p))
      |> maybe_put("tools", Keyword.get(opts, :tools))
      |> maybe_put("tool_choice", Keyword.get(opts, :tool_choice))

    headers =
      openrouter_headers(cfg)
      |> List.keystore("accept", 0, {"accept", "text/event-stream"})

    # We parse SSE frames of the shape: "data: {...}\n\n" and "data: [DONE]\n\n"
    # and accumulate:
    # - streamed text deltas
    # - streamed tool call deltas (best-effort)
    into_fun =
      fn
        {:data, chunk}, {buffer, acc_text, last_json, acc_tool_calls} ->
          {new_buffer, new_text, new_last_json, new_tool_calls} =
            consume_sse(buffer <> chunk, acc_text, last_json, acc_tool_calls, on_delta)

          {new_buffer, new_text, new_last_json, new_tool_calls}

        {:halt, _}, state ->
          state

        other, state ->
          Logger.debug("openrouter stream into: unexpected #{inspect(other)}")
          state
      end

    req =
      Req.new(
        url: url,
        method: :post,
        headers: headers,
        json: body,
        receive_timeout: cfg.timeout_ms,
        # `into:` streams response body chunks into a reducer-like function.
        into: {into_fun, {"", "", %{}, []}}
      )

    case Req.request(req) do
      {:ok, %{status: status, body: {_buffer, text, last_json, tool_calls}}}
      when status in 200..299 ->
        {:ok,
         %{
           text: text,
           tool_calls: tool_calls,
           raw: %{"provider" => "openrouter", "stream" => true, "last" => last_json}
         }}

      {:ok, %{status: status}} when status in 200..299 ->
        # Fallback if the underlying HTTP client doesn't surface the accumulator as `body`.
        {:ok, %{text: "", tool_calls: [], raw: %{"provider" => "openrouter", "stream" => true}}}

      {:ok, %{status: status, body: body}} ->
        {:error, {:http_error, status, body}}

      {:error, reason} ->
        {:error, {:request_failed, reason}}
    end
  end

  defp consume_sse(buffer, acc_text, last_json, acc_tool_calls, on_delta) do
    # SSE frames are delimited by a blank line.
    case String.split(buffer, "\n\n", parts: 2) do
      [frame, rest] ->
        {acc_text2, last_json2, acc_tool_calls2} =
          consume_sse_frame(frame, acc_text, last_json, acc_tool_calls, on_delta)

        consume_sse(rest, acc_text2, last_json2, acc_tool_calls2, on_delta)

      [_incomplete] ->
        {buffer, acc_text, last_json, acc_tool_calls}
    end
  end

  defp consume_sse_frame(frame, acc_text, last_json, acc_tool_calls, on_delta) do
    # We only care about lines starting with "data:".
    data_lines =
      frame
      |> String.split("\n")
      |> Enum.filter(&String.starts_with?(&1, "data:"))
      |> Enum.map(&String.trim_leading(&1, "data:"))
      |> Enum.map(&String.trim/1)

    Enum.reduce(data_lines, {acc_text, last_json, acc_tool_calls}, fn
      "[DONE]", {text_acc, json_acc, tool_acc} ->
        {text_acc, json_acc, tool_acc}

      raw_json, {text_acc, _json_acc, tool_acc} ->
        case Jason.decode(raw_json) do
          {:ok, %{} = json} ->
            {delta_text, delta_tool_calls} = extract_openai_stream_delta_parts(json)

            text_acc =
              if delta_text == "" do
                text_acc
              else
                _ = safe_on_delta(on_delta, delta_text)
                text_acc <> delta_text
              end

            tool_acc = merge_tool_call_deltas(tool_acc, delta_tool_calls)
            {text_acc, json, tool_acc}

          {:error, _} ->
            {text_acc, last_json, tool_acc}
        end
    end)
  end

  defp extract_openai_text_and_tool_calls(%{"choices" => [choice | _]}) when is_map(choice) do
    # OpenAI-style: choices[0].message.content + choices[0].message.tool_calls
    content = get_in(choice, ["message", "content"])
    tool_calls = normalize_tool_calls(get_in(choice, ["message", "tool_calls"]))

    cond do
      is_binary(content) ->
        {:ok, content, tool_calls}

      tool_calls != [] ->
        # Tool-only response: no text, but tool calls present.
        {:ok, "", tool_calls}

      true ->
        {:error, :missing_message_content}
    end
  end

  defp extract_openai_text_and_tool_calls(_), do: {:error, :missing_choices}

  defp extract_openai_text(%{"choices" => [choice | _]}) when is_map(choice) do
    # OpenAI-style: choices[0].message.content
    content = get_in(choice, ["message", "content"])

    if is_binary(content) do
      {:ok, content}
    else
      {:error, :missing_message_content}
    end
  end

  defp extract_openai_text(_), do: {:error, :missing_choices}

  defp extract_openai_stream_delta(%{"choices" => [choice | _]}) when is_map(choice) do
    # OpenAI-style stream: choices[0].delta.content
    delta = get_in(choice, ["delta", "content"])

    if is_binary(delta) do
      {:ok, delta}
    else
      {:ok, ""}
    end
  end

  defp extract_openai_stream_delta(_), do: {:ok, ""}

  defp extract_openai_stream_delta_parts(%{"choices" => [choice | _]}) when is_map(choice) do
    delta_text =
      case get_in(choice, ["delta", "content"]) do
        t when is_binary(t) -> t
        _ -> ""
      end

    delta_tool_calls = normalize_tool_calls(get_in(choice, ["delta", "tool_calls"]))
    {delta_text, delta_tool_calls}
  end

  defp extract_openai_stream_delta_parts(_), do: {"", []}

  defp normalize_tool_calls(list) when is_list(list), do: list
  defp normalize_tool_calls(_), do: []

  defp merge_tool_call_deltas(acc, deltas) when is_list(acc) and is_list(deltas) do
    Enum.reduce(deltas, acc, fn delta, acc2 ->
      idx =
        case Map.get(delta, "index") do
          i when is_integer(i) and i >= 0 -> i
          _ -> nil
        end

      if is_integer(idx) do
        acc2 = ensure_list_size(acc2, idx + 1)
        existing = Enum.at(acc2, idx) || %{}
        merged = deep_merge_tool_call(existing, delta)
        List.replace_at(acc2, idx, merged)
      else
        acc2 ++ [delta]
      end
    end)
  end

  defp merge_tool_call_deltas(acc, _), do: acc

  defp ensure_list_size(list, n) when is_list(list) and is_integer(n) and n >= 0 do
    missing = n - length(list)

    if missing > 0 do
      list ++ List.duplicate(%{}, missing)
    else
      list
    end
  end

  defp deep_merge_tool_call(existing, delta) when is_map(existing) and is_map(delta) do
    # Merge top-level keys except function; function.arguments is typically streamed as fragments
    merged = Map.merge(existing, Map.drop(delta, ["function"]))

    func_existing =
      case Map.get(existing, "function") do
        %{} = m -> m
        _ -> %{}
      end

    func_delta =
      case Map.get(delta, "function") do
        %{} = m -> m
        _ -> %{}
      end

    merged_func = Map.merge(func_existing, func_delta)

    merged_args =
      case {Map.get(func_existing, "arguments"), Map.get(func_delta, "arguments")} do
        {a, b} when is_binary(a) and is_binary(b) -> a <> b
        {_, b} when is_binary(b) -> b
        {a, _} when is_binary(a) -> a
        _ -> nil
      end

    merged_func =
      if is_binary(merged_args) do
        Map.put(merged_func, "arguments", merged_args)
      else
        merged_func
      end

    Map.put(merged, "function", merged_func)
  end

  defp deep_merge_tool_call(_existing, delta), do: delta

  defp openrouter_headers(%__MODULE__{} = cfg) do
    # OpenRouter recommends optional "HTTP-Referer" and "X-Title" for attribution.
    base = [
      {"authorization", "Bearer " <> cfg.openrouter.api_key},
      {"content-type", "application/json"}
    ]

    base
    |> maybe_header("http-referer", cfg.openrouter.app_url)
    |> maybe_header("x-title", cfg.openrouter.app_name)
  end

  defp openrouter_url(%__MODULE__{} = cfg, path) do
    base = cfg.openrouter.base_url |> String.trim_trailing("/")
    p = path |> to_string() |> String.trim_leading("/")
    base <> "/" <> p
  end

  defp ensure_openrouter_key(%__MODULE__{openrouter: %{api_key: key}})
       when is_binary(key) and byte_size(key) > 0,
       do: :ok

  defp ensure_openrouter_key(_cfg), do: {:error, :missing_openrouter_api_key}

  # -------------------------
  # Validation and small utilities
  # -------------------------

  defp validate_messages(messages) when is_list(messages) do
    ok? =
      Enum.all?(messages, fn
        %{"role" => role} = msg when is_binary(role) ->
          content = Map.get(msg, "content")
          is_nil(content) or is_binary(content)

        %{role: role} = msg when is_binary(role) ->
          content = Map.get(msg, :content)
          is_nil(content) or is_binary(content)

        _ ->
          false
      end)

    if ok?, do: :ok, else: {:error, :invalid_messages}
  end

  defp normalize_provider(nil), do: nil

  defp normalize_provider(v) when is_binary(v) do
    case v |> String.trim() |> String.downcase() do
      "" ->
        nil

      "openrouter" ->
        :openrouter

      "mock" ->
        :mock

      other ->
        Logger.warning("Unknown OPENSENTIENCE_LLM_PROVIDER=#{inspect(other)}; defaulting")
        nil
    end
  end

  defp parse_positive_int(v) when is_binary(v) do
    case Integer.parse(String.trim(v)) do
      {i, ""} when i > 0 -> i
      _ -> nil
    end
  end

  defp maybe_put(map, _key, nil), do: map
  defp maybe_put(map, key, value), do: Map.put(map, key, value)

  defp maybe_header(headers, _name, nil), do: headers

  defp maybe_header(headers, name, value) when is_binary(value) and byte_size(value) > 0 do
    headers ++ [{name, value}]
  end

  defp maybe_header(headers, _name, _other), do: headers

  defp safe_on_delta(on_delta, delta) when is_function(on_delta, 1) and is_binary(delta) do
    try do
      on_delta.(delta)
    rescue
      _ -> :ok
    catch
      _, _ -> :ok
    end
  end

  defp mock_reply(messages) do
    last_user =
      messages
      |> Enum.reverse()
      |> Enum.find_value("", fn
        %{"role" => "user", "content" => c} when is_binary(c) -> c
        %{role: "user", content: c} when is_binary(c) -> c
        _ -> false
      end)

    "Mock LLM reply. You said:\n\n" <> String.trim(last_user)
  end
end
