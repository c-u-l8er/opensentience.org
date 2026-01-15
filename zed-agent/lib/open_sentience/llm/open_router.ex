defmodule OpenSentience.LLM.OpenRouter do
  @moduledoc """
  OpenRouter client for the OpenAI-compatible Chat Completions API.

  OpenRouter exposes an OpenAI-style endpoint:

  - `POST https://openrouter.ai/api/v1/chat/completions`

  Authentication:

  - `Authorization: Bearer <OPENROUTER_API_KEY>`

  Recommended (optional) headers:

  - `HTTP-Referer: <your site url>`
  - `X-Title: <your app name>`

  This module intentionally focuses on **non-streaming** chat completions first,
  because it's the most reliable baseline to build on. You can layer ACP streaming
  (`session/update`) on top by chunking the returned text.
  """

  @endpoint "https://openrouter.ai/api/v1/chat/completions"

  @type role :: String.t()
  @type content :: String.t()

  @type message ::
          %{required(:role) => role(), required(:content) => content()}
          | %{required(String.t()) => term()}

  @typedoc """
  Options for `chat/2`.

  - `:api_key` - OpenRouter API key (defaults to `OPENROUTER_API_KEY`)
  - `:model` - model id (defaults to `OPENROUTER_MODEL`)
  - `:endpoint` - override full URL (defaults to OpenRouter chat completions endpoint)
  - `:site_url` - sets `HTTP-Referer` header (defaults to `OPENROUTER_SITE_URL`)
  - `:app_name` - sets `X-Title` header (defaults to `OPENROUTER_APP_NAME`)

  OpenAI-compatible request parameters (all optional):

  - `:temperature` (number)
  - `:top_p` (number)
  - `:max_tokens` (integer)
  - `:stop` (string | [string])
  - `:presence_penalty` (number)
  - `:frequency_penalty` (number)
  - `:seed` (integer)
  - `:tools` (list)
  - `:tool_choice` (map | string)
  - `:response_format` (map)
  - `:extra` (map) - merged into the request payload (advanced/forward compatibility)

  Transport options:

  - `:timeout_ms` - passed to Req as `receive_timeout` (best-effort; defaults to 60_000)
  """
  @type chat_opt ::
          {:api_key, String.t()}
          | {:model, String.t()}
          | {:endpoint, String.t()}
          | {:site_url, String.t()}
          | {:app_name, String.t()}
          | {:temperature, number()}
          | {:top_p, number()}
          | {:max_tokens, integer()}
          | {:stop, String.t() | [String.t()]}
          | {:presence_penalty, number()}
          | {:frequency_penalty, number()}
          | {:seed, integer()}
          | {:tools, list()}
          | {:tool_choice, map() | String.t()}
          | {:response_format, map()}
          | {:extra, map()}
          | {:timeout_ms, non_neg_integer()}

  @type chat_result :: %{
          text: String.t(),
          model: String.t() | nil,
          id: String.t() | nil,
          raw: map()
        }

  @doc """
  Perform a non-streaming chat completion.

  Expects `messages` in OpenAI format, for example:

      [
        %{"role" => "system", "content" => "You are helpful."},
        %{"role" => "user", "content" => "Say hi"}
      ]

  Returns:

  - `{:ok, %{text: ..., raw: ..., model: ..., id: ...}}`
  - `{:error, reason}`

  This function does not raise on HTTP/API errors.
  """
  @spec chat([message()], [chat_opt()]) :: {:ok, chat_result()} | {:error, term()}
  def chat(messages, opts \\ []) when is_list(messages) and is_list(opts) do
    with :ok <- validate_messages(messages),
         {:ok, endpoint} <- endpoint(opts),
         {:ok, headers} <- headers(opts),
         {:ok, payload} <- payload(messages, opts),
         {:ok, resp} <- post_json(endpoint, headers, payload, opts),
         {:ok, body} <- decode_json_body(resp.body),
         {:ok, text} <- extract_assistant_text(body) do
      {:ok,
       %{
         text: text,
         raw: body,
         model: Map.get(body, "model"),
         id: Map.get(body, "id")
       }}
    end
  end

  @doc """
  Same as `chat/2`, but raises on error.
  """
  @spec chat!([message()], [chat_opt()]) :: chat_result()
  def chat!(messages, opts \\ []) do
    case chat(messages, opts) do
      {:ok, result} -> result
      {:error, reason} -> raise RuntimeError, "OpenRouter chat failed: #{inspect(reason)}"
    end
  end

  # -------------------------
  # Request building
  # -------------------------

  defp endpoint(opts) do
    case Keyword.get(opts, :endpoint) || System.get_env("OPENROUTER_ENDPOINT") || @endpoint do
      url when is_binary(url) and byte_size(url) > 0 -> {:ok, url}
      _ -> {:error, :missing_endpoint}
    end
  end

  defp headers(opts) do
    api_key =
      Keyword.get(opts, :api_key) ||
        System.get_env("OPENROUTER_API_KEY")

    if not (is_binary(api_key) and byte_size(api_key) > 0) do
      {:error, {:missing_api_key, "Set OPENROUTER_API_KEY or pass :api_key"}}
    else
      base = [
        {"authorization", "Bearer " <> api_key},
        {"content-type", "application/json"},
        {"accept", "application/json"}
      ]

      site_url =
        Keyword.get(opts, :site_url) ||
          System.get_env("OPENROUTER_SITE_URL")

      app_name =
        Keyword.get(opts, :app_name) ||
          System.get_env("OPENROUTER_APP_NAME")

      headers =
        base
        |> maybe_put_header("http-referer", site_url)
        |> maybe_put_header("x-title", app_name)

      {:ok, headers}
    end
  end

  defp payload(messages, opts) do
    model =
      Keyword.get(opts, :model) ||
        System.get_env("OPENROUTER_MODEL")

    if not (is_binary(model) and byte_size(model) > 0) do
      {:error, {:missing_model, "Set OPENROUTER_MODEL or pass :model"}}
    else
      base =
        %{
          "model" => model,
          "messages" => messages
        }
        |> maybe_put_param("temperature", Keyword.get(opts, :temperature))
        |> maybe_put_param("top_p", Keyword.get(opts, :top_p))
        |> maybe_put_param("max_tokens", Keyword.get(opts, :max_tokens))
        |> maybe_put_param("stop", Keyword.get(opts, :stop))
        |> maybe_put_param("presence_penalty", Keyword.get(opts, :presence_penalty))
        |> maybe_put_param("frequency_penalty", Keyword.get(opts, :frequency_penalty))
        |> maybe_put_param("seed", Keyword.get(opts, :seed))
        |> maybe_put_param("tools", Keyword.get(opts, :tools))
        |> maybe_put_param("tool_choice", Keyword.get(opts, :tool_choice))
        |> maybe_put_param("response_format", Keyword.get(opts, :response_format))

      extra = Keyword.get(opts, :extra, %{})

      if is_map(extra) do
        {:ok, Map.merge(base, extra)}
      else
        {:error, {:invalid_extra, "expected :extra to be a map"}}
      end
    end
  end

  # -------------------------
  # HTTP
  # -------------------------

  defp post_json(endpoint, headers, payload, opts) do
    timeout_ms =
      case Keyword.get(opts, :timeout_ms, 60_000) do
        t when is_integer(t) and t >= 0 -> t
        _ -> 60_000
      end

    # Req will encode `json:` for us. Response decoding may vary by config,
    # so we handle both binary and already-decoded maps downstream.
    case Req.post(endpoint, headers: headers, json: payload, receive_timeout: timeout_ms) do
      {:ok, %Req.Response{status: status} = resp} when status in 200..299 ->
        {:ok, resp}

      {:ok, %Req.Response{status: status, body: body}} ->
        {:error, {:http_error, status, normalize_error_body(body)}}

      {:error, exception} ->
        {:error, {:transport_error, exception}}
    end
  rescue
    e -> {:error, {:client_exception, e}}
  end

  defp decode_json_body(%{} = body), do: {:ok, body}

  defp decode_json_body(body) when is_binary(body) do
    case Jason.decode(body) do
      {:ok, %{} = map} -> {:ok, map}
      {:ok, other} -> {:error, {:unexpected_json_shape, other}}
      {:error, err} -> {:error, {:invalid_json, err}}
    end
  end

  defp decode_json_body(nil), do: {:error, :empty_body}
  defp decode_json_body(other), do: {:error, {:unexpected_body_type, other}}

  defp normalize_error_body(%{} = body), do: body

  defp normalize_error_body(body) when is_binary(body) do
    case Jason.decode(body) do
      {:ok, decoded} -> decoded
      {:error, _} -> body
    end
  end

  defp normalize_error_body(other), do: other

  # -------------------------
  # Response parsing
  # -------------------------

  defp extract_assistant_text(%{"choices" => [choice | _]}) when is_map(choice) do
    # OpenAI chat completions format:
    # {"choices":[{"message":{"role":"assistant","content":"..."}, ...}], ...}
    content =
      get_in(choice, ["message", "content"]) ||
        get_in(choice, ["delta", "content"]) ||
        get_in(choice, ["text"])

    cond do
      is_binary(content) ->
        {:ok, content}

      is_list(content) ->
        # Some implementations use content parts. Try to concatenate text parts.
        {:ok, concat_content_parts(content)}

      true ->
        {:error, {:missing_assistant_content, choice}}
    end
  end

  defp extract_assistant_text(%{"choices" => []}), do: {:error, :no_choices}
  defp extract_assistant_text(%{"choices" => other}), do: {:error, {:invalid_choices, other}}
  defp extract_assistant_text(other), do: {:error, {:unexpected_response_shape, other}}

  defp concat_content_parts(parts) when is_list(parts) do
    parts
    |> Enum.map(fn
      %{"type" => "text", "text" => t} when is_binary(t) -> t
      %{"text" => t} when is_binary(t) -> t
      t when is_binary(t) -> t
      _ -> ""
    end)
    |> Enum.join()
  end

  # -------------------------
  # Validation
  # -------------------------

  defp validate_messages(messages) do
    ok? =
      Enum.all?(messages, fn
        %{"role" => role, "content" => content}
        when is_binary(role) and role != "" and is_binary(content) ->
          true

        %{role: role, content: content}
        when is_binary(role) and role != "" and is_binary(content) ->
          true

        _ ->
          false
      end)

    if ok? do
      :ok
    else
      {:error,
       {:invalid_messages,
        "expected a list of maps like %{role: \"user\", content: \"...\"} or %{\"role\" => \"user\", \"content\" => \"...\"}"}}
    end
  end

  # -------------------------
  # Helpers
  # -------------------------

  defp maybe_put_header(headers, _name, value) when not is_binary(value) or value == "",
    do: headers

  defp maybe_put_header(headers, name, value), do: headers ++ [{name, value}]

  defp maybe_put_param(map, _key, nil), do: map
  defp maybe_put_param(map, _key, ""), do: map
  defp maybe_put_param(map, key, value), do: Map.put(map, key, value)
end
