defmodule OpenSentience.AdminHTTP do
  @moduledoc """
  Small HTTP client helper for CLI tasks to call the local OpenSentience Core admin server
  with **token + CSRF**.

  This module is intentionally dependency-light:
  - Uses Erlang `:httpc` (from `:inets`) to avoid adding extra deps.
  - Uses `Jason` for JSON encoding/decoding (already a Core dependency).

  ## Why this exists

  Phase 1 UI/HTTP security posture includes:
  - localhost-only bind (default `127.0.0.1:6767`)
  - admin token gate for state-changing actions
  - CSRF enabled (session cookie required)

  A CLI that wants to call lifecycle actions over HTTP should:
  1. `GET /api/csrf` to obtain a CSRF token and session cookie.
  2. `POST /api/login` with the admin token + CSRF token + cookie to establish an admin session.
  3. Call state-changing endpoints (e.g., `POST /agents/:id/run`) with CSRF token + cookie.

  This helper implements that flow.

  ## Secrets

  - The admin token is a secret. This module never logs it and does not persist it.
  - Prefer supplying the token via `OPENSENTIENCE_ADMIN_TOKEN` for automation,
    otherwise it reads the default token file under `~/.opensentience/state/admin.token`.

  ## Configuration

  Base URL resolution order:
  1. `OPENSENTIENCE_ADMIN_URL` (e.g., `http://127.0.0.1:6767`)
  2. `OPENSENTIENCE_WEB_IP` + `OPENSENTIENCE_WEB_PORT`
  3. defaults: `127.0.0.1:6767`

  Timeouts can be provided per call via options (see `request_opts()`).
  """

  require Logger

  @default_ip "127.0.0.1"
  @default_port 6767

  @default_connect_timeout_ms 2_000
  @default_timeout_ms 15_000

  @type request_opts :: [
          base_url: String.t(),
          connect_timeout_ms: non_neg_integer(),
          timeout_ms: non_neg_integer(),
          token: String.t()
        ]

  @type error :: %{
          code: atom(),
          message: String.t(),
          details: map()
        }

  # ----------------------------------------------------------------------------
  # Public API (high-level)
  # ----------------------------------------------------------------------------

  @doc """
  Starts an agent via the admin server.

  Calls: `POST /agents/:agent_id/run`

  Options (optional):
  - `:correlation_id`, `:causation_id` (sent as JSON body params)
  - plus any `t:request_opts/0` fields
  """
  @spec run_agent(String.t(), Keyword.t()) :: {:ok, map()} | {:error, error()}
  def run_agent(agent_id, opts \\ []) when is_binary(agent_id) and is_list(opts) do
    agent_id = String.trim(agent_id)

    body =
      %{}
      |> maybe_put("correlation_id", Keyword.get(opts, :correlation_id))
      |> maybe_put("causation_id", Keyword.get(opts, :causation_id))

    with_admin_session(opts, fn session ->
      post_json("/agents/#{URI.encode(agent_id)}/run", body, session)
    end)
  end

  @doc """
  Stops an agent via the admin server.

  Calls: `POST /agents/:agent_id/stop`

  Options (optional):
  - `:correlation_id`, `:causation_id` (sent as JSON body params)
  - plus any `t:request_opts/0` fields
  """
  @spec stop_agent(String.t(), Keyword.t()) :: :ok | {:error, error()}
  def stop_agent(agent_id, opts \\ []) when is_binary(agent_id) and is_list(opts) do
    agent_id = String.trim(agent_id)

    body =
      %{}
      |> maybe_put("correlation_id", Keyword.get(opts, :correlation_id))
      |> maybe_put("causation_id", Keyword.get(opts, :causation_id))

    with_admin_session(opts, fn session ->
      case post_json("/agents/#{URI.encode(agent_id)}/stop", body, session) do
        {:ok, %{"ok" => true}} ->
          :ok

        {:ok, %{"ok" => true, "result" => _}} ->
          :ok

        {:ok, other} ->
          {:error, err(:unexpected_response, "Unexpected stop response", %{body: other})}

        {:error, e} ->
          {:error, e}
      end
    end)
  end

  # ----------------------------------------------------------------------------
  # Public API (generic helpers)
  # ----------------------------------------------------------------------------

  @doc """
  Performs a JSON `GET` request under an authenticated admin session.
  """
  @spec get_json(String.t(), map(), Keyword.t()) :: {:ok, map()} | {:error, error()}
  def get_json(path, query_params \\ %{}, opts \\ [])
      when is_binary(path) and is_map(query_params) and is_list(opts) do
    with_admin_session(opts, fn session ->
      url = session.base_url <> normalize_path(path) <> encode_query(query_params)
      do_json_request(:get, url, "", session)
    end)
  end

  @doc """
  Performs a JSON `POST` request under an authenticated admin session.
  """
  @spec post_json(String.t(), map(), map()) :: {:ok, map()} | {:error, error()}
  def post_json(path, %{} = body, %{} = session) when is_binary(path) do
    url = session.base_url <> normalize_path(path)
    json_body = Jason.encode!(body)
    do_json_request(:post, url, json_body, session)
  end

  @doc """
  Runs the token+CSRF login flow and yields an authenticated session map to `fun`.

  `fun` receives:
  - `session.base_url`
  - `session.csrf_token`
  - `session.cookie` (Cookie header value)
  - `session.httpc_opts` (internal)
  """
  @spec with_admin_session(Keyword.t(), (map() -> any())) :: any()
  def with_admin_session(opts \\ [], fun) when is_list(opts) and is_function(fun, 1) do
    base_url = Keyword.get(opts, :base_url) || base_url()
    token = Keyword.get(opts, :token) || admin_token!()

    httpc_opts = httpc_opts(opts)

    with {:ok, csrf_1, cookie_1} <- fetch_csrf(base_url, httpc_opts),
         {:ok, csrf_2, cookie_2} <- login(base_url, token, csrf_1, cookie_1, httpc_opts) do
      session = %{
        base_url: base_url,
        csrf_token: csrf_2,
        cookie: cookie_2,
        httpc_opts: httpc_opts
      }

      fun.(session)
    else
      {:error, %{} = e} ->
        {:error, e}

      {:error, other} ->
        {:error,
         err(:session_failed, "Failed to establish admin session", %{reason: inspect(other)})}
    end
  end

  # ----------------------------------------------------------------------------
  # Session bootstrap
  # ----------------------------------------------------------------------------

  defp fetch_csrf(base_url, httpc_opts) do
    url = base_url <> "/api/csrf"

    with {:ok, status, headers, body} <- request(:get, url, [], "", httpc_opts),
         :ok <- expect_http(status, 200, url, body),
         {:ok, json} <- decode_json(body, url),
         csrf when is_binary(csrf) and csrf != "" <-
           header_value(headers, "x-csrf-token") || json["csrf_token"],
         cookie when is_binary(cookie) and cookie != "" <- build_cookie_header(headers) do
      {:ok, csrf, cookie}
    else
      nil ->
        {:error, err(:csrf_missing, "Missing CSRF token", %{url: url})}

      "" ->
        {:error, err(:csrf_missing, "Missing CSRF token", %{url: url})}

      {:error, %{} = e} ->
        {:error, e}

      {:error, other} ->
        {:error, err(:csrf_failed, "Failed to fetch CSRF", %{url: url, reason: inspect(other)})}
    end
  end

  defp login(base_url, token, csrf, cookie, httpc_opts) do
    url = base_url <> "/api/login"

    headers = [
      {"x-csrf-token", csrf},
      {"cookie", cookie},
      {"x-opensentience-token", token}
    ]

    # Router accepts either header token or token param; we still send token in body
    # to allow future server changes that stop reading the header.
    body = Jason.encode!(%{"token" => token})

    with {:ok, status, resp_headers, resp_body} <- request(:post, url, headers, body, httpc_opts),
         :ok <- expect_http(status, 200, url, resp_body),
         {:ok, json} <- decode_json(resp_body, url),
         true <- json["ok"] == true,
         csrf2 when is_binary(csrf2) and csrf2 != "" <-
           header_value(resp_headers, "x-csrf-token") || json["csrf_token"] || csrf,
         cookie2 when is_binary(cookie2) and cookie2 != "" <-
           merge_cookie_headers(cookie, resp_headers) do
      {:ok, csrf2, cookie2}
    else
      false ->
        {:error, err(:login_failed, "Login failed", %{url: url})}

      {:error, %{} = e} ->
        {:error, e}

      {:error, other} ->
        {:error, err(:login_failed, "Login failed", %{url: url, reason: inspect(other)})}
    end
  end

  # ----------------------------------------------------------------------------
  # HTTP + JSON plumbing
  # ----------------------------------------------------------------------------

  defp do_json_request(method, url, body, %{} = session) do
    headers = [
      {"accept", "application/json"},
      {"content-type", "application/json"},
      {"x-csrf-token", session.csrf_token},
      {"cookie", session.cookie}
    ]

    with {:ok, status, _headers, resp_body} <-
           request(method, url, headers, body, session.httpc_opts),
         :ok <- expect_http(status, 200, url, resp_body),
         {:ok, json} <- decode_json(resp_body, url) do
      if json["ok"] == true do
        {:ok, json["result"] || json}
      else
        {:error,
         err(:request_failed, "Request failed", %{
           url: url,
           response: json
         })}
      end
    else
      {:error, %{} = e} ->
        {:error, e}

      {:error, other} ->
        {:error, err(:request_failed, "Request failed", %{url: url, reason: inspect(other)})}
    end
  end

  defp request(method, url, headers, body, httpc_opts) when is_atom(method) do
    ensure_httpc_started()

    url = to_charlist(url)

    http_headers =
      [{"user-agent", "opensentience-cli/phase1"} | headers]
      |> Enum.map(fn {k, v} ->
        {to_charlist(String.downcase(to_string(k))), to_charlist(to_string(v))}
      end)

    http_opts_erlang = [
      timeout: httpc_opts.timeout_ms,
      connect_timeout: httpc_opts.connect_timeout_ms
    ]

    req =
      case method do
        :get ->
          {url, http_headers}

        :post ->
          {url, http_headers, ~c"application/json", to_charlist(body)}

        :put ->
          {url, http_headers, ~c"application/json", to_charlist(body)}

        :delete ->
          {url, http_headers}

        other ->
          raise ArgumentError, "unsupported method: #{inspect(other)}"
      end

    case :httpc.request(method, req, http_opts_erlang, []) do
      {:ok, {{_http_version, status, _reason_phrase}, resp_headers, resp_body}} ->
        {:ok, status, normalize_headers(resp_headers), iodata_to_string(resp_body)}

      {:error, reason} ->
        {:error,
         err(:http_error, "HTTP request failed", %{
           reason: inspect(reason),
           url: List.to_string(url)
         })}
    end
  rescue
    e ->
      {:error, err(:http_exception, "HTTP request crashed", %{exception: Exception.message(e)})}
  end

  defp normalize_headers(resp_headers) when is_list(resp_headers) do
    Enum.map(resp_headers, fn
      {k, v} -> {String.downcase(to_string(k)), to_string(v)}
      other -> {"unknown", to_string(other)}
    end)
  end

  defp iodata_to_string(body) when is_binary(body), do: body
  defp iodata_to_string(body), do: IO.iodata_to_binary(body)

  defp decode_json(body, url) when is_binary(body) do
    case Jason.decode(body) do
      {:ok, %{} = map} ->
        {:ok, map}

      {:ok, other} ->
        {:ok, %{"value" => other}}

      {:error, reason} ->
        {:error, err(:bad_json, "Invalid JSON response", %{url: url, reason: inspect(reason)})}
    end
  end

  defp expect_http(status, expected, url, body) when is_integer(status) do
    if status == expected do
      :ok
    else
      {:error,
       err(:http_status, "Unexpected HTTP status", %{
         url: url,
         expected: expected,
         got: status,
         body_preview: preview(body)
       })}
    end
  end

  defp preview(body) when is_binary(body) do
    max = 500
    if byte_size(body) <= max, do: body, else: binary_part(body, 0, max) <> "…"
  end

  # ----------------------------------------------------------------------------
  # Cookie helpers
  # ----------------------------------------------------------------------------

  defp header_value(headers, key) when is_list(headers) and is_binary(key) do
    key = String.downcase(key)

    headers
    |> Enum.find_value(fn
      {^key, v} -> normalize_optional(v)
      _ -> nil
    end)
  end

  defp build_cookie_header(headers) do
    cookies =
      headers
      |> Enum.filter(fn {k, _v} -> k == "set-cookie" end)
      |> Enum.map(fn {_k, v} -> v end)
      |> Enum.map(&cookie_pair/1)
      |> Enum.reject(&is_nil/1)

    cookies
    |> Enum.uniq()
    |> Enum.join("; ")
    |> normalize_optional()
  end

  defp merge_cookie_headers(existing_cookie, resp_headers) do
    base = parse_cookie_header(existing_cookie)
    added = parse_cookie_header(build_cookie_header(resp_headers))

    merged = Map.merge(base, added)

    merged
    |> Enum.map_join("; ", fn {k, v} -> "#{k}=#{v}" end)
    |> normalize_optional()
  end

  defp parse_cookie_header(nil), do: %{}
  defp parse_cookie_header(""), do: %{}

  defp parse_cookie_header(cookie_header) when is_binary(cookie_header) do
    cookie_header
    |> String.split(";", trim: true)
    |> Enum.map(&String.trim/1)
    |> Enum.map(fn part ->
      case String.split(part, "=", parts: 2) do
        [k, v] -> {String.trim(k), String.trim(v)}
        _ -> nil
      end
    end)
    |> Enum.reject(&is_nil/1)
    |> Map.new()
  end

  defp cookie_pair(value) when is_binary(value) do
    value
    |> String.split(";", parts: 2)
    |> List.first()
    |> normalize_optional()
  end

  defp cookie_pair(_), do: nil

  # ----------------------------------------------------------------------------
  # Token + base URL
  # ----------------------------------------------------------------------------

  @doc false
  def base_url do
    env = normalize_optional(System.get_env("OPENSENTIENCE_ADMIN_URL"))

    cond do
      is_binary(env) ->
        String.trim_trailing(env, "/")

      true ->
        ip = normalize_optional(System.get_env("OPENSENTIENCE_WEB_IP")) || @default_ip

        port =
          case normalize_optional(System.get_env("OPENSENTIENCE_WEB_PORT")) do
            nil -> @default_port
            v -> parse_int(v, @default_port)
          end

        "http://#{ip}:#{port}"
    end
  end

  defp admin_token! do
    from_env = normalize_optional(System.get_env("OPENSENTIENCE_ADMIN_TOKEN"))

    cond do
      is_binary(from_env) ->
        from_env

      true ->
        path = token_path()

        case File.read(path) do
          {:ok, contents} ->
            token = normalize_optional(contents)

            if is_binary(token) do
              token
            else
              raise "admin token file is empty: #{path}"
            end

          {:error, reason} ->
            raise "failed to read admin token file (#{path}): #{inspect(reason)}"
        end
    end
  end

  defp token_path do
    # Avoid hard dependency on a particular implementation detail; prefer Paths if available.
    cond do
      Code.ensure_loaded?(OpenSentience.Paths) and
          function_exported?(OpenSentience.Paths, :admin_token_path, 0) ->
        OpenSentience.Paths.admin_token_path()

      true ->
        Path.join([System.user_home!(), ".opensentience", "state", "admin.token"])
    end
    |> Path.expand()
  end

  # ----------------------------------------------------------------------------
  # Misc helpers
  # ----------------------------------------------------------------------------

  defp ensure_httpc_started do
    # Ensure :inets is started (for :httpc). :ssl is needed for https.
    _ = Application.ensure_all_started(:inets)
    _ = Application.ensure_all_started(:ssl)
    :ok
  end

  defp httpc_opts(opts) do
    %{
      connect_timeout_ms:
        Keyword.get(opts, :connect_timeout_ms, @default_connect_timeout_ms)
        |> normalize_nonneg_int(@default_connect_timeout_ms),
      timeout_ms:
        Keyword.get(opts, :timeout_ms, @default_timeout_ms)
        |> normalize_nonneg_int(@default_timeout_ms)
    }
  end

  defp normalize_path(path) when is_binary(path) do
    path = String.trim(path)

    cond do
      path == "" -> "/"
      String.starts_with?(path, "/") -> path
      true -> "/" <> path
    end
  end

  defp encode_query(%{} = params) do
    pairs =
      params
      |> Enum.reduce([], fn
        {k, nil}, acc -> acc
        {k, ""}, acc -> acc
        {k, v}, acc -> [{to_string(k), to_string(v)} | acc]
      end)
      |> Enum.reverse()

    case pairs do
      [] -> ""
      _ -> "?" <> URI.encode_query(pairs)
    end
  end

  defp normalize_optional(nil), do: nil

  defp normalize_optional(v) when is_binary(v) do
    v = String.trim(v)
    if v == "", do: nil, else: v
  end

  defp normalize_optional(v), do: v |> to_string() |> normalize_optional()

  defp normalize_nonneg_int(v, default) when is_integer(v) and v >= 0, do: v
  defp normalize_nonneg_int(v, default) when is_binary(v), do: parse_int(v, default)
  defp normalize_nonneg_int(_v, default), do: default

  defp parse_int(v, default) when is_binary(v) do
    case Integer.parse(String.trim(v)) do
      {n, ""} -> n
      _ -> default
    end
  end

  defp maybe_put(map, _k, nil), do: map
  defp maybe_put(map, _k, ""), do: map
  defp maybe_put(map, k, v), do: Map.put(map, k, v)

  defp err(code, message, details \\ %{})
       when is_atom(code) and is_binary(message) and is_map(details) do
    %{code: code, message: message, details: details}
  end
end
