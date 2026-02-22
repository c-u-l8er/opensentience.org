defmodule OpenSentience.Web.Auth do
  @moduledoc """
  Token auth for OpenSentience Core admin UI (Phase 1).

  Phase 1 requirement: state-changing UI actions must require an admin token.

  This module provides:
  - a Plug that denies state-changing requests without a valid token
  - token file management under `~/.opensentience/` (or configured path)

  Security notes:
  - The token is a *secret* and MUST NOT be stored in SQLite or audit metadata.
  - We only ever store the token in a local file with restricted permissions.
  - On auth failures we emit `security.denied` with secret-free metadata (best-effort).

  Token sources supported:
  - `authorization: Bearer <token>`
  - `x-opensentience-token: <token>`
  """

  import Plug.Conn

  require Logger

  @default_header "x-opensentience-token"
  @default_authz_header "authorization"

  @default_require_token true
  @default_require_for_methods ~w(POST PUT PATCH DELETE)
  @default_token_length 48

  @typedoc "Plug options for token auth."
  @type opts :: %{
          optional(:require_token) => boolean(),
          optional(:token_path) => String.t(),
          optional(:require_for_methods) => [String.t()],
          optional(:token_header) => String.t(),
          optional(:authorization_header) => String.t()
        }

  # ----------------------------------------------------------------------------
  # Plug callbacks
  # ----------------------------------------------------------------------------

  @doc """
  Plug init: normalizes options.

  Options (all optional):
  - `:require_token` (default: true)
  - `:token_path` (default: `OpenSentience.Paths.admin_token_path/0`)
  - `:require_for_methods` (default: ~w(POST PUT PATCH DELETE))
  - `:token_header` (default: "x-opensentience-token")
  - `:authorization_header` (default: "authorization")
  """
  @spec init(Keyword.t()) :: opts()
  def init(opts) when is_list(opts) do
    require_token =
      case Keyword.get(opts, :require_token, @default_require_token) do
        true -> true
        false -> false
        "true" -> true
        "false" -> false
        1 -> true
        0 -> false
        _ -> @default_require_token
      end

    token_path =
      Keyword.get(opts, :token_path) ||
        configured_token_path() ||
        default_token_path()

    require_for_methods =
      opts
      |> Keyword.get(:require_for_methods, @default_require_for_methods)
      |> List.wrap()
      |> Enum.map(&normalize_method/1)
      |> Enum.reject(&is_nil/1)
      |> Enum.uniq()

    %{
      require_token: require_token,
      token_path: token_path,
      require_for_methods: require_for_methods,
      token_header: Keyword.get(opts, :token_header, @default_header),
      authorization_header: Keyword.get(opts, :authorization_header, @default_authz_header)
    }
  end

  @doc """
  Plug call: enforces token for state-changing requests.

  If `require_token: false`, the plug is a no-op.
  """
  @spec call(Plug.Conn.t(), opts()) :: Plug.Conn.t()
  def call(%Plug.Conn{} = conn, %{} = opts) do
    if opts.require_token do
      enforce(conn, opts)
    else
      conn
    end
  end

  # ----------------------------------------------------------------------------
  # Token enforcement
  # ----------------------------------------------------------------------------

  defp enforce(conn, opts) do
    method = normalize_method(conn.method)

    if method in opts.require_for_methods do
      case read_token_from_request(conn, opts) do
        nil ->
          deny(conn, opts, :missing_token, "missing admin token")

        token ->
          case read_admin_token(opts.token_path) do
            {:ok, expected} ->
              if secure_compare(token, expected) do
                conn
              else
                deny(conn, opts, :invalid_token, "invalid admin token")
              end

            {:error, reason} ->
              # If token file can't be read, treat as denial (safe-by-default).
              deny(conn, opts, :token_unavailable, "admin token unavailable: #{inspect(reason)}")
          end
      end
    else
      conn
    end
  end

  defp read_token_from_request(conn, opts) do
    token =
      conn
      |> get_req_header(opts.token_header)
      |> List.first()

    cond do
      is_binary(token) and token != "" ->
        String.trim(token)

      true ->
        conn
        |> get_req_header(opts.authorization_header)
        |> List.first()
        |> parse_bearer_token()
    end
  end

  defp parse_bearer_token(nil), do: nil

  defp parse_bearer_token(value) when is_binary(value) do
    value = String.trim(value)

    case String.split(value, ~r/\s+/, parts: 2, trim: true) do
      [scheme, token] ->
        if String.downcase(scheme) == "bearer" do
          token = String.trim(token)
          if token == "", do: nil, else: token
        else
          nil
        end

      _ ->
        nil
    end
  end

  defp deny(conn, _opts, reason_code, message) do
    audit_denied(conn, reason_code)

    body =
      Jason.encode!(%{
        "error" => %{
          "code" => Atom.to_string(reason_code),
          "message" => message
        }
      })

    conn
    |> put_resp_content_type("application/json")
    |> send_resp(403, body)
    |> halt()
  end

  # ----------------------------------------------------------------------------
  # Token management
  # ----------------------------------------------------------------------------

  @doc """
  Ensures an admin token file exists. If missing, creates it and returns the token.

  Returns `{:ok, token}` or `{:error, reason}`.
  """
  @spec ensure_admin_token(String.t() | nil) :: {:ok, String.t()} | {:error, term()}
  def ensure_admin_token(token_path \\ nil) do
    token_path = token_path || configured_token_path() || default_token_path()

    case read_admin_token(token_path) do
      {:ok, token} ->
        {:ok, token}

      {:error, :enoent} ->
        token = generate_token(@default_token_length)

        case write_admin_token(token_path, token) do
          :ok -> {:ok, token}
          {:error, reason} -> {:error, reason}
        end

      {:error, reason} ->
        {:error, reason}
    end
  end

  @doc """
  Reads the admin token from disk.

  Returns `{:ok, token}` or `{:error, reason}` (from File.read/1).
  """
  @spec read_admin_token(String.t()) :: {:ok, String.t()} | {:error, term()}
  def read_admin_token(token_path) when is_binary(token_path) do
    case File.read(token_path) do
      {:ok, contents} ->
        token =
          contents
          |> String.replace("\u0000", "")
          |> String.trim()

        if token == "" do
          {:error, :empty_token}
        else
          {:ok, token}
        end

      {:error, reason} ->
        {:error, reason}
    end
  end

  @doc """
  Writes the admin token to disk with restricted permissions (best-effort).

  Returns `:ok` or `{:error, reason}`.
  """
  @spec write_admin_token(String.t(), String.t()) :: :ok | {:error, term()}
  def write_admin_token(token_path, token) when is_binary(token_path) and is_binary(token) do
    token = String.trim(token)

    cond do
      token == "" ->
        {:error, :empty_token}

      String.contains?(token, ["\n", "\r", "\u0000"]) ->
        {:error, :invalid_token}

      true ->
        dir = Path.dirname(token_path)

        with :ok <- File.mkdir_p(dir),
             :ok <- atomic_write(token_path, token <> "\n"),
             :ok <- chmod_600_best_effort(token_path) do
          :ok
        else
          {:error, reason} -> {:error, reason}
          other -> {:error, other}
        end
    end
  end

  @doc """
  Rotates (regenerates) the admin token and writes it to disk.

  Returns `{:ok, token}` or `{:error, reason}`.
  """
  @spec rotate_admin_token(String.t() | nil) :: {:ok, String.t()} | {:error, term()}
  def rotate_admin_token(token_path \\ nil) do
    token_path = token_path || configured_token_path() || default_token_path()
    token = generate_token(@default_token_length)

    case write_admin_token(token_path, token) do
      :ok -> {:ok, token}
      {:error, reason} -> {:error, reason}
    end
  end

  @doc """
  Returns the admin token path used by default resolution (config + fallback).

  This does not create directories or files.
  """
  @spec token_path() :: String.t()
  def token_path do
    configured_token_path() || default_token_path()
  end

  # ----------------------------------------------------------------------------
  # Audit (best-effort)
  # ----------------------------------------------------------------------------

  defp audit_denied(conn, reason_code) do
    # Secret-free metadata only.
    metadata = %{
      action: "web.auth",
      reason: Atom.to_string(reason_code),
      method: conn.method,
      path: conn.request_path
    }

    if Code.ensure_loaded?(OpenSentience.AuditLog) and
         function_exported?(OpenSentience.AuditLog, :append, 1) do
      _ =
        OpenSentience.AuditLog.append(%{
          event_type: "security.denied",
          actor_type: :human,
          actor_id: "unknown",
          subject_type: "web",
          subject_id: conn.request_path || "/",
          severity: :security,
          metadata: metadata,
          correlation_id: get_req_header(conn, "x-correlation-id") |> List.first(),
          causation_id: nil
        })

      :ok
    else
      :noop
    end
  rescue
    _ -> :noop
  end

  # ----------------------------------------------------------------------------
  # Path/config helpers
  # ----------------------------------------------------------------------------

  defp configured_token_path do
    # Preference order:
    # 1) config :opensentience_core, :paths, admin_token_path
    # 2) config :opensentience_core, :admin_token_path
    # 3) config :opensentience_core, :web, token_path
    cond do
      Code.ensure_loaded?(OpenSentience.Paths) and
          function_exported?(OpenSentience.Paths, :admin_token_path, 0) ->
        OpenSentience.Paths.admin_token_path()

      true ->
        Application.get_env(:opensentience_core, :admin_token_path) ||
          get_in(Application.get_env(:opensentience_core, :web, []), [:token_path]) ||
          nil
    end
  end

  defp default_token_path do
    home =
      System.get_env("OPENSENTIENCE_HOME") ||
        Path.join(System.user_home!(), ".opensentience")

    Path.join([Path.expand(home), "state", "admin.token"])
  end

  defp normalize_method(nil), do: nil
  defp normalize_method(m) when is_binary(m), do: m |> String.trim() |> String.upcase()
  defp normalize_method(m), do: m |> to_string() |> normalize_method()

  # ----------------------------------------------------------------------------
  # File write & permissions
  # ----------------------------------------------------------------------------

  defp atomic_write(path, contents) when is_binary(path) and is_binary(contents) do
    dir = Path.dirname(path)
    tmp = Path.join(dir, ".tmp." <> Path.basename(path) <> "." <> unique_suffix())

    try do
      case File.write(tmp, contents) do
        :ok ->
          File.rename(tmp, path)

        {:error, reason} ->
          {:error, reason}
      end
    after
      _ = File.rm(tmp)
    end
  end

  defp chmod_600_best_effort(path) do
    # Best-effort: on some platforms/filesystems this may be ignored.
    case File.chmod(path, 0o600) do
      :ok -> :ok
      {:error, _} -> :ok
    end
  end

  defp unique_suffix do
    # This value is not the admin token; it's just a temp filename nonce.
    :crypto.strong_rand_bytes(8)
    |> Base.url_encode64(padding: false)
  end

  # ----------------------------------------------------------------------------
  # Token generation & comparison
  # ----------------------------------------------------------------------------

  defp generate_token(length) when is_integer(length) and length > 0 do
    # Generate more bytes than needed, then slice to requested length.
    token =
      :crypto.strong_rand_bytes(length)
      |> Base.url_encode64(padding: false)

    if String.length(token) >= length do
      String.slice(token, 0, length)
    else
      # Very unlikely, but keep deterministic.
      token <> generate_token(length - String.length(token))
    end
  end

  defp secure_compare(a, b) when is_binary(a) and is_binary(b) do
    a = String.trim(a)
    b = String.trim(b)

    # Plug.Crypto is available in Plug; use it if present.
    if Code.ensure_loaded?(Plug.Crypto) and function_exported?(Plug.Crypto, :secure_compare, 2) do
      Plug.Crypto.secure_compare(a, b)
    else
      # Constant-time compare fallback (best-effort).
      secure_compare_fallback(a, b)
    end
  end

  defp secure_compare(_a, _b), do: false

  defp secure_compare_fallback(a, b) do
    a_bytes = :erlang.iolist_to_binary(a)
    b_bytes = :erlang.iolist_to_binary(b)

    if byte_size(a_bytes) != byte_size(b_bytes) do
      false
    else
      a_list = :binary.bin_to_list(a_bytes)
      b_list = :binary.bin_to_list(b_bytes)

      result =
        Enum.zip(a_list, b_list)
        |> Enum.reduce(0, fn {x, y}, acc -> Bitwise.bor(acc, Bitwise.bxor(x, y)) end)

      result == 0
    end
  end

  defp safe_to_string(nil), do: ""
  defp safe_to_string(v) when is_binary(v), do: v
  defp safe_to_string(v), do: to_string(v)
end
