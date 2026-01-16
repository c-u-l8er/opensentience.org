defmodule OpenSentience.Permissions do
  @moduledoc """
  Permission utilities for Phase 1 (validation, normalization, and subset checks).

  Phase 1 requirements (from `project_spec`):
  - Deny-by-default enablement.
  - Approved permissions must be a subset of requested permissions.
  - Persist only secret-free durable records (this module does not handle persistence).

  This module intentionally keeps permission semantics lightweight in Phase 1:
  - It validates that permissions are well-formed, bounded strings.
  - It provides helpers to compare requested vs approved lists.
  - It provides basic pattern matching helpers for permission patterns like:
    - `event:publish:<pattern>`
    - `event:subscribe:<pattern>`
    - `fs:read:<path-or-glob>`
    - `fs:write:<path-or-glob>`
    - `network:egress:<host-or-tag>`

  It does **not** enforce permissions at runtime in Phase 1; it supports the approval gate
  and lays groundwork for Phase 2+ enforcement.
  """

  @type permission :: String.t()

  @typedoc """
  Parsed permission structure (best-effort).

  Examples:
  - `"event:publish:foo.*"` => `%{domain: "event", action: "publish", pattern: "foo.*"}`
  - `"fs:read:/tmp/*.txt"` => `%{domain: "fs", action: "read", pattern: "/tmp/*.txt"}`
  """
  @type parsed :: %{
          domain: String.t(),
          action: String.t(),
          pattern: String.t() | nil,
          raw: permission()
        }

  # Conservative bounds; keep stored permissions readable and safe.
  @max_permission_len 300

  # Characters that can cause trouble in logs/JSON lines.
  @forbidden_chars ["\u0000", "\n", "\r", "\t"]

  @doc """
  Normalizes a permission string:
  - trims leading/trailing whitespace
  - collapses internal whitespace (does **not** attempt to be clever; whitespace is usually invalid)
  - returns `nil` for empty strings
  """
  @spec normalize(permission() | nil) :: permission() | nil
  def normalize(nil), do: nil

  def normalize(permission) when is_binary(permission) do
    permission
    |> String.trim()
    |> case do
      "" -> nil
      s -> s
    end
  end

  @doc """
  Normalizes a list of permissions:
  - trims each string
  - drops empty/nil entries
  - preserves order
  """
  @spec normalize_list([permission() | nil]) :: [permission()]
  def normalize_list(list) when is_list(list) do
    list
    |> Enum.map(&normalize/1)
    |> Enum.reject(&is_nil/1)
  end

  @doc """
  Validates a single permission string.

  Returns:
  - `:ok`
  - `{:error, reason}` where `reason` is an atom or tuple
  """
  @spec validate(permission()) :: :ok | {:error, term()}
  def validate(permission) when is_binary(permission) do
    permission = normalize(permission)

    cond do
      is_nil(permission) ->
        {:error, :empty}

      byte_size(permission) > @max_permission_len ->
        {:error, {:too_long, @max_permission_len}}

      Enum.any?(@forbidden_chars, &String.contains?(permission, &1)) ->
        {:error, :invalid_characters}

      String.contains?(permission, " ") ->
        # Permissions should be compact tokens; whitespace is almost always accidental.
        {:error, :contains_whitespace}

      not String.contains?(permission, ":") ->
        {:error, :missing_colons}

      true ->
        # Best-effort: ensure first two segments exist (domain:action:...).
        case String.split(permission, ":", parts: 3) do
          [domain, action, rest] ->
            validate_segments(domain, action, rest)

          [domain, action] ->
            validate_segments(domain, action, nil)

          _ ->
            {:error, :invalid_format}
        end
    end
  end

  def validate(_other), do: {:error, :not_a_string}

  @doc """
  Validates a list of permissions.

  Returns:
  - `:ok` if all validate
  - `{:error, %{index: i, permission: p, reason: r}}` for the first failure
  """
  @spec validate_all([permission()]) :: :ok | {:error, map()}
  def validate_all(list) when is_list(list) do
    list
    |> Enum.with_index()
    |> Enum.reduce_while(:ok, fn {perm, idx}, :ok ->
      case validate(perm) do
        :ok -> {:cont, :ok}
        {:error, reason} -> {:halt, {:error, %{index: idx, permission: perm, reason: reason}}}
      end
    end)
  end

  @doc """
  Parses a permission string into a `%{domain, action, pattern, raw}` map.

  This is best-effort and intended for UI display / enforcement scaffolding.

  Returns `{:ok, parsed}` or `{:error, reason}`.
  """
  @spec parse(permission()) :: {:ok, parsed()} | {:error, term()}
  def parse(permission) when is_binary(permission) do
    with :ok <- validate(permission) do
      permission = normalize(permission)

      case String.split(permission, ":", parts: 3) do
        [domain, action, rest] ->
          {:ok, %{domain: domain, action: action, pattern: rest, raw: permission}}

        [domain, action] ->
          {:ok, %{domain: domain, action: action, pattern: nil, raw: permission}}

        _ ->
          {:error, :invalid_format}
      end
    end
  end

  def parse(_), do: {:error, :not_a_string}

  @doc """
  Returns `true` if every approved permission is present in the requested permission list.

  Notes:
  - Comparison uses exact string equality after normalization.
  - This is Phase 1's core enablement constraint: `approved ⊆ requested`.
  """
  @spec subset?([permission()], [permission()]) :: boolean()
  def subset?(requested, approved) when is_list(requested) and is_list(approved) do
    requested_set =
      requested
      |> normalize_list()
      |> MapSet.new()

    approved
    |> normalize_list()
    |> Enum.all?(fn perm -> MapSet.member?(requested_set, perm) end)
  end

  @doc """
  Computes set-like difference between requested and approved permissions.

  Returns:
  - `{:ok, %{extra_approved: [...], missing_approved: [...]}}`

  Where:
  - `extra_approved` are approved permissions not present in requested (should be empty).
  - `missing_approved` are requested permissions not approved (expected for partial approval).
  """
  @spec diff([permission()], [permission()]) ::
          {:ok, %{extra_approved: [permission()], missing_approved: [permission()]}}
  def diff(requested, approved) when is_list(requested) and is_list(approved) do
    r = requested |> normalize_list() |> MapSet.new()
    a = approved |> normalize_list() |> MapSet.new()

    extra_approved =
      a
      |> MapSet.difference(r)
      |> MapSet.to_list()
      |> Enum.sort()

    missing_approved =
      r
      |> MapSet.difference(a)
      |> MapSet.to_list()
      |> Enum.sort()

    {:ok, %{extra_approved: extra_approved, missing_approved: missing_approved}}
  end

  @doc """
  Normalizes and canonicalizes a permission list for stable comparisons/hashing:
  - normalize strings (trim, drop empty)
  - de-duplicate
  - sort
  """
  @spec canonicalize([permission()]) :: [permission()]
  def canonicalize(perms) when is_list(perms) do
    perms
    |> normalize_list()
    |> Enum.uniq()
    |> Enum.sort()
  end

  @doc """
  Computes a stable SHA-256 hex hash for a permission list.

  This is intended to back "approval drift detection" (Phase 1).

  If `OpenSentience.Discovery.Hashing` is available, it uses it; otherwise it falls back
  to hashing a JSON encoding of the canonicalized list.
  """
  @spec hash_list([permission()]) :: String.t()
  def hash_list(perms) when is_list(perms) do
    perms = canonicalize(perms)

    if Code.ensure_loaded?(OpenSentience.Discovery.Hashing) and
         function_exported?(OpenSentience.Discovery.Hashing, :hash_permissions_list!, 1) do
      OpenSentience.Discovery.Hashing.hash_permissions_list!(perms)
    else
      json = Jason.encode!(perms)

      :crypto.hash(:sha256, json)
      |> Base.encode16(case: :lower)
    end
  end

  @doc """
  Returns `true` if the given permission (pattern) allows a specific target string.

  This is a convenience helper for Phase 2+ enforcement scaffolding. It supports:
  - exact match (no glob characters)
  - glob match where `*` matches any substring

  Examples:
  - `match_pattern?("foo.*", "foo.bar") == true`
  - `match_pattern?("foo.*", "bar.foo") == false`
  """
  @spec match_pattern?(String.t(), String.t()) :: boolean()
  def match_pattern?(pattern, target) when is_binary(pattern) and is_binary(target) do
    pattern = String.trim(pattern)
    target = String.trim(target)

    cond do
      pattern == "" or target == "" ->
        false

      String.contains?(pattern, "*") ->
        regex =
          pattern
          |> Regex.escape()
          |> String.replace("\\*", ".*")
          |> then(&("^" <> &1 <> "$"))
          |> Regex.compile!()

        Regex.match?(regex, target)

      true ->
        pattern == target
    end
  end

  @doc """
  Best-effort permission match for domain/action/pattern permissions.

  Examples:
  - `permission_allows?("event:publish:foo.*", "event:publish:foo.bar") == true`
  - `permission_allows?("event:subscribe:foo.*", "event:publish:foo.bar") == false`
  """
  @spec permission_allows?(permission(), permission()) :: boolean()
  def permission_allows?(allowed_perm, requested_perm)
      when is_binary(allowed_perm) and is_binary(requested_perm) do
    with {:ok, a} <- parse(allowed_perm),
         {:ok, r} <- parse(requested_perm) do
      if a.domain != r.domain or a.action != r.action do
        false
      else
        case {a.pattern, r.pattern} do
          {nil, nil} ->
            true

          {nil, _} ->
            false

          {a_pat, r_pat} when is_binary(a_pat) and is_binary(r_pat) ->
            match_pattern?(a_pat, r_pat)

          _ ->
            false
        end
      end
    else
      _ -> false
    end
  end

  # ----------------------------------------------------------------------------
  # Internal validation helpers
  # ----------------------------------------------------------------------------

  defp validate_segments(domain, action, rest) do
    domain = normalize(domain)
    action = normalize(action)

    cond do
      is_nil(domain) or domain == "" ->
        {:error, :invalid_domain}

      is_nil(action) or action == "" ->
        {:error, :invalid_action}

      not safe_segment?(domain) ->
        {:error, :invalid_domain}

      not safe_segment?(action) ->
        {:error, :invalid_action}

      rest == nil ->
        :ok

      is_binary(rest) ->
        # Pattern can contain slashes/dots/stars etc, but keep it bounded and printable.
        rest = String.trim(rest)

        cond do
          rest == "" ->
            {:error, :invalid_pattern}

          byte_size(rest) > @max_permission_len ->
            {:error, {:too_long, @max_permission_len}}

          Enum.any?(@forbidden_chars, &String.contains?(rest, &1)) ->
            {:error, :invalid_pattern}

          true ->
            :ok
        end

      true ->
        {:error, :invalid_pattern}
    end
  end

  # Domain/action segments are simple tokens.
  defp safe_segment?(segment) when is_binary(segment) do
    String.match?(segment, ~r/^[A-Za-z][A-Za-z0-9_-]*$/)
  end
end
