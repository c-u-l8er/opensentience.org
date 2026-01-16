defmodule OpenSentience.AuditLog.Redaction do
  @moduledoc """
  Best-effort redaction utilities for audit metadata and logs.

  Phase 1 invariants:
  - Durable artifacts (audit events, logs table entries, etc.) MUST be secret-free.
  - Redaction is defense-in-depth, not a guarantee.
  - Prefer storing *summaries* over raw payloads whenever possible.

  This module provides:
  - `redact/2` for maps/lists/strings with depth & size limits
  - `redact_string/2` for best-effort string sanitization
  - `truncate/2` to bound stored content
  - `safe_metadata_json/2` to produce a JSON object string suitable for durable storage

  Notes:
  - By default, we redact values for keys that look secret-ish.
  - We also scrub obvious secret patterns in strings (bearer tokens, private keys, etc.).
  - We intentionally avoid being overly clever: predictable, bounded behavior matters.
  """

  @type redacted :: term()

  # Conservative defaults; callers can override.
  @default_opts [
    max_depth: 6,
    max_keys: 200,
    max_list: 200,
    max_string: 2_000,
    max_total_bytes: 200_000,
    placeholder: "[REDACTED]"
  ]

  # Keys that are almost always sensitive (case-insensitive substring match).
  @sensitive_key_fragments [
    "authorization",
    "auth",
    "token",
    "access_token",
    "refresh_token",
    "id_token",
    "session",
    "cookie",
    "set-cookie",
    "password",
    "passwd",
    "secret",
    "api_key",
    "apikey",
    "private_key",
    "ssh_key",
    "signature",
    "sig",
    "bearer",
    "jwt",
    "credentials",
    "client_secret"
  ]

  # Some keys are safe-ish but can be huge; we truncate aggressively.
  @large_value_key_fragments [
    "prompt",
    "input",
    "output",
    "response",
    "request",
    "stacktrace",
    "trace",
    "stderr",
    "stdout",
    "body"
  ]

  @doc """
  Best-effort redaction for any Elixir term.

  The returned term is intended to be safe for:
  - durable audit metadata (`metadata_json`)
  - bounded log persistence (`logs.line`)

  Options (all optional):
  - `:max_depth` (default #{Keyword.get(@default_opts, :max_depth)})
  - `:max_keys` (default #{Keyword.get(@default_opts, :max_keys)})
  - `:max_list` (default #{Keyword.get(@default_opts, :max_list)})
  - `:max_string` (default #{Keyword.get(@default_opts, :max_string)})
  - `:max_total_bytes` (default #{Keyword.get(@default_opts, :max_total_bytes)})
  - `:placeholder` (default "#{Keyword.get(@default_opts, :placeholder)}")

  This function is total: it will never raise; on unexpected terms it returns a
  safe inspected string (bounded).
  """
  @spec redact(term(), Keyword.t()) :: redacted()
  def redact(value, opts \\ []) do
    opts = normalize_opts(opts)

    try do
      {redacted, _state} = do_redact(value, opts, %{depth: 0, bytes: 0})
      redacted
    rescue
      _ ->
        value
        |> safe_inspect()
        |> truncate(opts[:max_string])
        |> redact_string(opts)
    end
  end

  @doc """
  Redacts secrets from a string (best-effort) and truncates it.

  This is useful for:
  - `agents.last_error`
  - `runs.reason`
  - log capture lines
  """
  @spec redact_string(String.t(), Keyword.t()) :: String.t()
  def redact_string(str, opts \\ []) when is_binary(str) do
    opts = normalize_opts(opts)

    str
    |> normalize_string()
    |> redact_secret_patterns()
    |> truncate(opts[:max_string])
  end

  @doc """
  Truncates a string to `max_len` UTF-8 codepoints (best-effort).
  Returns `nil` if given `nil`.
  """
  @spec truncate(String.t() | nil, non_neg_integer()) :: String.t() | nil
  def truncate(nil, _max_len), do: nil

  def truncate(str, max_len) when is_binary(str) and is_integer(max_len) and max_len >= 0 do
    if String.length(str) <= max_len do
      str
    else
      String.slice(str, 0, max_len)
    end
  end

  @doc """
  Produces a JSON-encoded object string suitable for storing in `audit_events.metadata_json`.

  Returns:
  - `{:ok, json}` on success (json is always a JSON object string)
  - `{:error, reason}` on encoding failure

  If `metadata` is not a map, it is wrapped as `%{"value" => ...}`.
  """
  @spec safe_metadata_json(map() | term(), Keyword.t()) :: {:ok, String.t()} | {:error, term()}
  def safe_metadata_json(metadata, opts \\ []) do
    opts = normalize_opts(opts)

    metadata =
      case metadata do
        %{} = map -> map
        other -> %{"value" => other}
      end

    redacted = redact(metadata, opts)

    # Ensure it's a JSON object; if redaction produced something else, wrap it.
    json_obj =
      case redacted do
        %{} = m -> stringify_keys(m, opts)
        other -> %{"value" => other}
      end

    try do
      {:ok, Jason.encode!(json_obj)}
    rescue
      err ->
        {:error, err}
    end
  end

  @doc """
  Returns true if the given key name looks sensitive and should have its value redacted.
  """
  @spec sensitive_key?(String.t() | atom()) :: boolean()
  def sensitive_key?(key) when is_atom(key), do: key |> Atom.to_string() |> sensitive_key?()

  def sensitive_key?(key) when is_binary(key) do
    k = String.downcase(String.trim(key))

    Enum.any?(@sensitive_key_fragments, fn frag ->
      String.contains?(k, frag)
    end)
  end

  @doc """
  Returns true if the given key name is likely to contain very large values.
  We don't necessarily redact these, but we truncate aggressively.
  """
  @spec large_value_key?(String.t() | atom()) :: boolean()
  def large_value_key?(key) when is_atom(key), do: key |> Atom.to_string() |> large_value_key?()

  def large_value_key?(key) when is_binary(key) do
    k = String.downcase(String.trim(key))

    Enum.any?(@large_value_key_fragments, fn frag ->
      String.contains?(k, frag)
    end)
  end

  # ----------------------------------------------------------------------------
  # Internal redaction
  # ----------------------------------------------------------------------------

  defp do_redact(_value, [{:max_depth, max_depth} | _] = opts, %{depth: depth} = state)
       when depth >= max_depth do
    {"[TRUNCATED:depth]", bump_bytes("[TRUNCATED:depth]", state, opts)}
  end

  defp do_redact(%DateTime{} = dt, _opts, state), do: {DateTime.to_iso8601(dt), state}
  defp do_redact(%NaiveDateTime{} = ndt, _opts, state), do: {NaiveDateTime.to_iso8601(ndt), state}
  defp do_redact(%URI{} = uri, _opts, state), do: {URI.to_string(uri), state}

  defp do_redact(str, opts, state) when is_binary(str) do
    s =
      str
      |> normalize_string()
      |> redact_secret_patterns()
      |> truncate(opts[:max_string])

    {s, bump_bytes(s, state, opts)}
  end

  defp do_redact(num, _opts, state) when is_number(num), do: {num, state}
  defp do_redact(bool, _opts, state) when is_boolean(bool), do: {bool, state}
  defp do_redact(nil, _opts, state), do: {nil, state}

  defp do_redact(list, opts, state) when is_list(list) do
    {state, items} =
      list
      |> Enum.take(opts[:max_list])
      |> Enum.reduce({inc_depth(state), []}, fn item, {st, acc} ->
        {v, st} = do_redact(item, opts, st)
        {st, [v | acc]}
      end)

    {Enum.reverse(items), dec_depth(state)}
  end

  defp do_redact(%{} = map, opts, state) do
    # Bound keys and normalize to string keys for JSON.
    entries =
      map
      |> Map.to_list()
      |> Enum.take(opts[:max_keys])

    {state, acc} =
      Enum.reduce(entries, {inc_depth(state), %{}}, fn {k, v}, {st, out} ->
        key = key_to_string(k)

        if sensitive_key?(key) do
          red = opts[:placeholder]
          out = Map.put(out, key, red)
          {bump_bytes(red, st, opts), out}
        else
          {rv, st} = do_redact(v, opts, st)

          # Aggressive truncation for large-ish keys
          rv =
            if is_binary(rv) and large_value_key?(key) do
              truncate(rv, min(opts[:max_string], 500))
            else
              rv
            end

          out = Map.put(out, key, rv)
          {st, out}
        end
      end)

    {acc, dec_depth(state)}
  end

  defp do_redact(other, opts, state) do
    s =
      other
      |> safe_inspect()
      |> truncate(opts[:max_string])
      |> redact_secret_patterns()

    {s, bump_bytes(s, state, opts)}
  end

  # ----------------------------------------------------------------------------
  # Key/value normalization
  # ----------------------------------------------------------------------------

  defp stringify_keys(%{} = map, opts) do
    map
    |> Map.to_list()
    |> Enum.take(opts[:max_keys])
    |> Enum.reduce(%{}, fn {k, v}, acc ->
      Map.put(acc, key_to_string(k), v)
    end)
  end

  defp key_to_string(k) when is_binary(k), do: k
  defp key_to_string(k) when is_atom(k), do: Atom.to_string(k)

  defp key_to_string(k) do
    try do
      to_string(k)
    rescue
      _ -> safe_inspect(k)
    end
  end

  defp normalize_string(str) when is_binary(str) do
    str
    |> String.replace("\u0000", "")
    |> String.replace(~r/\r\n|\r|\n/, " ")
    |> String.trim()
  end

  defp safe_inspect(term) do
    inspect(term, limit: 50, printable_limit: 2_000)
    |> String.replace(~r/\r\n|\r|\n/, " ")
  end

  # ----------------------------------------------------------------------------
  # Secret-pattern redaction (best-effort)
  # ----------------------------------------------------------------------------

  # IMPORTANT: keep these patterns conservative. False positives are acceptable;
  # false negatives are expected but we want to catch common cases.
  defp redact_secret_patterns(str) when is_binary(str) do
    str
    |> redact_bearer_tokens()
    |> redact_basic_auth()
    |> redact_jwt_like()
    |> redact_private_key_blocks()
    |> redact_api_key_assignments()
  end

  defp redact_bearer_tokens(str) do
    # "Authorization: Bearer <token>" or "bearer <token>"
    Regex.replace(~r/\bBearer\s+[A-Za-z0-9\-._~+\/]+=*\b/i, str, "Bearer [REDACTED]")
  end

  defp redact_basic_auth(str) do
    # "Authorization: Basic <base64>"
    Regex.replace(~r/\bBasic\s+[A-Za-z0-9+\/]+=*\b/i, str, "Basic [REDACTED]")
  end

  defp redact_jwt_like(str) do
    # JWTs often look like: header.payload.signature (base64url)
    # This is intentionally loose; it may redact other dotted tokens too.
    Regex.replace(
      ~r/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
      str,
      "[REDACTED_JWT]"
    )
  end

  defp redact_private_key_blocks(str) do
    # PEM blocks: -----BEGIN ... PRIVATE KEY----- ... -----END ... PRIVATE KEY-----
    Regex.replace(
      ~r/-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----/s,
      str,
      "[REDACTED_PRIVATE_KEY]"
    )
  end

  defp redact_api_key_assignments(str) do
    # Common "key=value" or JSON-ish `"key":"value"` patterns; best-effort.
    # We try to avoid redacting innocuous small values by requiring length >= 8.
    Regex.replace(
      ~r/\b(api[_-]?key|token|secret|password)\b\s*[:=]\s*["']?([A-Za-z0-9\-._~+\/]{8,})["']?/i,
      str,
      "\\1=[REDACTED]"
    )
  end

  # ----------------------------------------------------------------------------
  # Bounding state
  # ----------------------------------------------------------------------------

  defp inc_depth(%{depth: d} = st), do: %{st | depth: d + 1}
  defp dec_depth(%{depth: d} = st) when d > 0, do: %{st | depth: d - 1}
  defp dec_depth(st), do: st

  defp bump_bytes(str, %{bytes: bytes} = st, opts) when is_binary(str) do
    new_bytes = bytes + byte_size(str)

    if new_bytes > opts[:max_total_bytes] do
      # Once we exceed the budget, we keep the counter but callers should still get
      # bounded strings; the depth/list/key limits already help. This marker makes
      # it obvious in stored metadata that truncation happened.
      %{st | bytes: new_bytes}
    else
      %{st | bytes: new_bytes}
    end
  end

  defp bump_bytes(_other, st, _opts), do: st

  defp normalize_opts(opts) do
    opts = Keyword.merge(@default_opts, opts)

    # Ensure sane bounds even if someone passes weird values.
    opts
    |> Keyword.update!(:max_depth, &normalize_nonneg(&1, Keyword.get(@default_opts, :max_depth)))
    |> Keyword.update!(:max_keys, &normalize_pos(&1, Keyword.get(@default_opts, :max_keys)))
    |> Keyword.update!(:max_list, &normalize_pos(&1, Keyword.get(@default_opts, :max_list)))
    |> Keyword.update!(
      :max_string,
      &normalize_nonneg(&1, Keyword.get(@default_opts, :max_string))
    )
    |> Keyword.update!(
      :max_total_bytes,
      &normalize_pos(&1, Keyword.get(@default_opts, :max_total_bytes))
    )
    |> Keyword.update!(:placeholder, fn
      s when is_binary(s) and s != "" -> s
      _ -> Keyword.get(@default_opts, :placeholder)
    end)
  end

  defp normalize_nonneg(v, _default) when is_integer(v) and v >= 0, do: v
  defp normalize_nonneg(_v, default), do: default

  defp normalize_pos(v, _default) when is_integer(v) and v > 0, do: v
  defp normalize_pos(_v, default), do: default
end
