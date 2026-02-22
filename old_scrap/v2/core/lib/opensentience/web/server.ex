defmodule OpenSentience.Web.Server do
  @moduledoc """
  Localhost-only admin UI server (Phase 1).

  This server is intentionally small:
  - It ensures the admin token exists on disk at startup.
  - It runs the HTML Plug router (`OpenSentience.Web.Router`) under Cowboy.

  Phase 1 security stance (safe-by-default):
  - Bind to loopback (`127.0.0.1`) by default.
  - Do not enable permissive CORS.
  - Any state-changing routes (non-GET) are token-gated by the router.
  """

  use Supervisor
  require Logger

  @default_ip {127, 0, 0, 1}
  @default_port 6767

  @type web_cfg :: [
          ip: :inet.ip_address() | String.t(),
          port: :inet.port_number() | String.t() | integer(),
          server: boolean(),
          require_token: boolean()
        ]

  @spec child_spec(term()) :: Supervisor.child_spec()
  def child_spec(arg) do
    %{
      id: __MODULE__,
      start: {__MODULE__, :start_link, [arg]},
      type: :supervisor,
      restart: :permanent,
      shutdown: 5_000
    }
  end

  @spec start_link(term()) :: Supervisor.on_start()
  def start_link(arg \\ []) do
    Supervisor.start_link(__MODULE__, arg, name: __MODULE__)
  end

  @impl true
  def init(arg) do
    cfg = normalize_cfg(arg)

    # Phase 1: ensure admin token exists (do NOT log token value).
    ensure_admin_token_exists(cfg)

    # Cookie sessions require conn.secret_key_base. Ensure we have a persistent one.
    secret_key_base =
      case ensure_web_secret_key_base() do
        {:ok, value} -> value
        {:error, reason} ->
          Logger.error("Failed to ensure web secret_key_base (falling back to ephemeral): #{inspect(reason)}")
          generate_secret_key_base()
      end

    # Start the HTML router under Cowboy (wrapped to set secret_key_base).
    children = [
      Plug.Cowboy.child_spec(
        scheme: :http,
        plug: {OpenSentience.Web.EndpointPlug, secret_key_base: secret_key_base},
        options: cowboy_opts(cfg)
      )
    ]

    Logger.info("Admin UI listening on #{format_bind(cfg)}")

    Supervisor.init(children, strategy: :one_for_one)
  end

  # ----------------------------------------------------------------------------
  # Config helpers
  # ----------------------------------------------------------------------------

  defp normalize_cfg(arg) do
    base =
      case Application.get_env(:opensentience_core, :web) do
        cfg when is_list(cfg) -> cfg
        _ -> []
      end

    merged =
      case arg do
        cfg when is_list(cfg) -> Keyword.merge(base, cfg)
        _ -> base
      end

    ip =
      merged
      |> Keyword.get(:ip, @default_ip)
      |> normalize_ip()

    port =
      merged
      |> Keyword.get(:port, @default_port)
      |> normalize_port()

    server = Keyword.get(merged, :server, true) == true
    require_token = Keyword.get(merged, :require_token, true) == true

    [
      ip: ip,
      port: port,
      server: server,
      require_token: require_token
    ]
  end

  defp normalize_ip({a, b, c, d} = ip)
       when is_integer(a) and is_integer(b) and is_integer(c) and is_integer(d),
       do: ip

  defp normalize_ip(ip) when is_tuple(ip) do
    # Accept other tuples (IPv6) if provided correctly.
    ip
  end

  defp normalize_ip(ip) when is_binary(ip) do
    case ip |> String.trim() |> String.split(".", parts: 4) do
      [a, b, c, d] ->
        with {ai, ""} <- Integer.parse(a),
             {bi, ""} <- Integer.parse(b),
             {ci, ""} <- Integer.parse(c),
             {di, ""} <- Integer.parse(d) do
          {ai, bi, ci, di}
        else
          _ -> @default_ip
        end

      _ ->
        @default_ip
    end
  end

  defp normalize_ip(_), do: @default_ip

  defp normalize_port(port) when is_integer(port) and port >= 0 and port <= 65_535, do: port

  defp normalize_port(port) when is_binary(port) do
    case Integer.parse(String.trim(port)) do
      {n, ""} -> normalize_port(n)
      _ -> @default_port
    end
  end

  defp normalize_port(_), do: @default_port

  defp cowboy_opts(cfg) do
    [
      ip: Keyword.fetch!(cfg, :ip),
      port: Keyword.fetch!(cfg, :port)
    ]
  end

  defp format_bind(cfg) do
    ip = Keyword.fetch!(cfg, :ip)
    port = Keyword.fetch!(cfg, :port)
    "#{:inet.ntoa(ip) |> to_string()}:#{port}"
  rescue
    _ -> "#{inspect(Keyword.fetch!(cfg, :ip))}:#{Keyword.fetch!(cfg, :port)}"
  end

  # ----------------------------------------------------------------------------
  # Admin token bootstrap
  # ----------------------------------------------------------------------------

  defp ensure_admin_token_exists(_cfg) do
    # Prefer the dedicated token manager if present.
    if Code.ensure_loaded?(OpenSentience.Web.Auth) and
         function_exported?(OpenSentience.Web.Auth, :ensure_admin_token, 1) do
      token_path =
        if Code.ensure_loaded?(OpenSentience.Web.Auth) and
             function_exported?(OpenSentience.Web.Auth, :token_path, 0) do
          OpenSentience.Web.Auth.token_path()
        else
          default_token_path()
        end

      case OpenSentience.Web.Auth.ensure_admin_token(token_path) do
        {:ok, _token} ->
          Logger.info("Admin token ensured at #{token_path}")

        {:error, reason} ->
          Logger.error("Failed to ensure admin token (path=#{token_path}): #{inspect(reason)}")
      end
    else
      # Fallback: ensure file exists with a random token.
      token_path = default_token_path()

      case File.read(token_path) do
        {:ok, contents} ->
          if String.trim(contents) == "" do
            _ = write_fallback_token(token_path)
          end

        {:error, :enoent} ->
          _ = write_fallback_token(token_path)

        {:error, reason} ->
          Logger.error("Failed to read admin token (path=#{token_path}): #{inspect(reason)}")
      end
    end
  rescue
    err ->
      Logger.error("Admin token bootstrap failed: #{Exception.message(err)}")
      :ok
  end

  defp write_fallback_token(token_path) do
    dir = Path.dirname(token_path)
    _ = File.mkdir_p(dir)

    token =
      32
      |> :crypto.strong_rand_bytes()
      |> Base.url_encode64(padding: false)

    case File.write(token_path, token <> "\n", [:write]) do
      :ok ->
        _ = File.chmod(token_path, 0o600)
        Logger.info("Admin token created at #{token_path}")
        :ok

      {:error, reason} ->
        Logger.error("Failed to write admin token (path=#{token_path}): #{inspect(reason)}")
        {:error, reason}
    end
  end

  defp default_token_path do
    # Use the shared path helper if present.
    if Code.ensure_loaded?(OpenSentience.Paths) and
         function_exported?(OpenSentience.Paths, :admin_token_path, 0) do
      OpenSentience.Paths.admin_token_path()
    else
      home =
        System.get_env("OPENSENTIENCE_HOME") ||
          Path.join(System.user_home!(), ".opensentience")

      Path.join([Path.expand(home), "state", "admin.token"])
    end
  end

  # ----------------------------------------------------------------------------
  # Session secret_key_base (cookie sessions)
  # ----------------------------------------------------------------------------

  defp ensure_web_secret_key_base do
    case System.get_env("OPENSENTIENCE_SECRET_KEY_BASE") |> normalize_optional() do
      secret when is_binary(secret) ->
        {:ok, secret}

      _ ->
        path = web_secret_key_base_path()
        _ = File.mkdir_p(Path.dirname(path))

        case File.read(path) do
          {:ok, contents} ->
            case normalize_optional(contents) do
              nil ->
                secret = generate_secret_key_base()

                case File.write(path, secret <> "\n", [:write]) do
                  :ok ->
                    _ = File.chmod(path, 0o600)
                    {:ok, secret}

                  {:error, reason} ->
                    {:error, reason}
                end

              secret ->
                {:ok, secret}
            end

          {:error, :enoent} ->
            secret = generate_secret_key_base()

            case File.write(path, secret <> "\n", [:write]) do
              :ok ->
                _ = File.chmod(path, 0o600)
                {:ok, secret}

              {:error, reason} ->
                {:error, reason}
            end

          {:error, reason} ->
            {:error, reason}
        end
    end
  end

  defp web_secret_key_base_path do
    from_cfg =
      case Application.get_env(:opensentience_core, :paths) do
        cfg when is_list(cfg) -> Keyword.get(cfg, :web_secret_key_base_path) || Keyword.get(cfg, :secret_key_base_path)
        cfg when is_map(cfg) -> Map.get(cfg, :web_secret_key_base_path) || Map.get(cfg, :secret_key_base_path)
        _ -> nil
      end ||
        get_in(Application.get_env(:opensentience_core, :web, []), [:secret_key_base_path])

    from_cfg ||
      if Code.ensure_loaded?(OpenSentience.Paths) and function_exported?(OpenSentience.Paths, :state_dir, 0) do
        Path.join(OpenSentience.Paths.state_dir(), "web.secret_key_base")
      else
        home =
          System.get_env("OPENSENTIENCE_HOME") ||
            Path.join(System.user_home!(), ".opensentience")

        Path.join([Path.expand(home), "state", "web.secret_key_base"])
      end
  end

  defp generate_secret_key_base do
    64
    |> :crypto.strong_rand_bytes()
    |> Base.url_encode64(padding: false)
  end

  defp normalize_optional(nil), do: nil

  defp normalize_optional(v) when is_binary(v) do
    v = String.trim(v)
    if v == "", do: nil, else: v
  end

  defp normalize_optional(v), do: v |> to_string() |> normalize_optional()
end

defmodule OpenSentience.Web.EndpointPlug do
  @moduledoc false

  @behaviour Plug

  def init(opts) do
    secret_key_base = Keyword.fetch!(opts, :secret_key_base)
    router_opts = OpenSentience.Web.Router.init([])
    %{secret_key_base: secret_key_base, router_opts: router_opts}
  end

  def call(conn, %{secret_key_base: secret_key_base, router_opts: router_opts}) do
    conn = %{conn | secret_key_base: secret_key_base}
    OpenSentience.Web.Router.call(conn, router_opts)
  end
end
