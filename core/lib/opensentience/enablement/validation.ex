defmodule OpenSentience.Enablement.Validation do
  @moduledoc """
  Enablement validation helpers for Phase 1.

  Primary responsibilities:
  - Validate that approved permissions are a subset of requested permissions
    (deny-by-default + explicit approval UX).
  - Detect "permission drift" using a stable hash of the requested permissions list.

  Notes:
  - This module is intentionally pure (no DB access).
  - This module does not attempt "perfect secret detection"; it assumes permissions
    are non-secret strings. Persisted summaries should be bounded and safe.
  """

  alias OpenSentience.Discovery.Hashing

  @type permission :: String.t()
  @type permissions :: [permission()]

  @type validation_error :: %{
          required(:code) => atom(),
          required(:message) => String.t(),
          optional(:details) => map()
        }

  @doc """
  Normalizes a permissions list into a canonical form for comparisons.

  Rules:
  - Trim whitespace
  - Remove empty entries
  - Preserve original order
  - Remove duplicates (first occurrence wins)
  - Reject entries containing control characters that can corrupt logs/stores

  Returns `{:ok, normalized}` or `{:error, validation_error}`.
  """
  @spec normalize_permissions(term()) :: {:ok, permissions()} | {:error, validation_error()}
  def normalize_permissions(perms) when is_list(perms) do
    perms
    |> Enum.with_index()
    |> Enum.reduce_while({:ok, []}, fn {perm, idx}, {:ok, acc} ->
      cond do
        not is_binary(perm) ->
          {:halt,
           {:error,
            %{
              code: :invalid_permission,
              message: "permission at index #{idx} must be a string",
              details: %{index: idx}
            }}}

        true ->
          p = String.trim(perm)

          cond do
            p == "" ->
              {:cont, {:ok, acc}}

            contains_invalid_chars?(p) ->
              {:halt,
               {:error,
                %{
                  code: :invalid_permission,
                  message: "permission at index #{idx} contains invalid characters",
                  details: %{index: idx}
                }}}

            Enum.member?(acc, p) ->
              {:cont, {:ok, acc}}

            true ->
              {:cont, {:ok, acc ++ [p]}}
          end
      end
    end)
  end

  def normalize_permissions(_other) do
    {:error,
     %{
       code: :invalid_permissions,
       message: "permissions must be a list of strings",
       details: %{}
     }}
  end

  @doc """
  Validates that `approved` permissions are a subset of `requested` permissions.

  Returns:
  - `{:ok, %{requested: req, approved: app}}` when valid
  - `{:error, %{code: :approved_not_subset, ...}}` when invalid
  """
  @spec validate_approved_subset(permissions(), permissions()) ::
          {:ok, %{requested: permissions(), approved: permissions()}}
          | {:error, validation_error()}
  def validate_approved_subset(requested, approved) do
    with {:ok, req} <- normalize_permissions(requested),
         {:ok, app} <- normalize_permissions(approved) do
      req_set = MapSet.new(req)
      extra = app |> Enum.reject(&MapSet.member?(req_set, &1))

      if extra == [] do
        {:ok, %{requested: req, approved: app}}
      else
        {:error,
         %{
           code: :approved_not_subset,
           message: "approved permissions must be a subset of requested permissions",
           details: %{
             extra_approved: extra,
             requested_count: length(req),
             approved_count: length(app)
           }
         }}
      end
    end
  end

  @doc """
  Computes a stable hash (SHA-256 hex) for a requested permissions list.

  This is the drift detector stored in `permission_approvals.requested_permissions_hash`.

  Returns `{:ok, hash}` or `{:error, validation_error}`.
  """
  @spec requested_permissions_hash(permissions()) ::
          {:ok, String.t()} | {:error, validation_error()}
  def requested_permissions_hash(perms) do
    with {:ok, normalized} <- normalize_permissions(perms),
         {:ok, hash} <- Hashing.hash_permissions_list(normalized) do
      {:ok, hash}
    else
      {:error, {:non_string_permission, bad}} ->
        {:error,
         %{
           code: :invalid_permission,
           message: "permissions list contains non-string entry",
           details: %{value: safe_inspect(bad)}
         }}

      {:error, %{} = err} ->
        {:error, err}

      {:error, other} ->
        {:error,
         %{
           code: :hash_failed,
           message: "failed to compute requested permissions hash",
           details: %{reason: safe_inspect(other)}
         }}
    end
  end

  @doc """
  Returns true if the stored requested-permissions hash does not match the current
  requested permissions list.
  """
  @spec permission_drift?(String.t(), permissions()) :: boolean()
  def permission_drift?(stored_hash, current_requested) when is_binary(stored_hash) do
    case requested_permissions_hash(current_requested) do
      {:ok, current_hash} -> current_hash != String.downcase(String.trim(stored_hash))
      {:error, _} -> true
    end
  end

  @doc """
  Validates that the stored requested-permissions hash matches the current
  requested permissions list.

  This is the primary Phase 1 "drift detection" gate: if the manifest's requested
  permissions change, approvals must be re-done.
  """
  @spec validate_no_permission_drift(String.t(), permissions()) ::
          :ok | {:error, validation_error()}
  def validate_no_permission_drift(stored_hash, current_requested) when is_binary(stored_hash) do
    stored = String.downcase(String.trim(stored_hash))

    case requested_permissions_hash(current_requested) do
      {:ok, current_hash} ->
        if current_hash == stored do
          :ok
        else
          {:error,
           %{
             code: :permission_drift,
             message: "requested permissions have changed; re-approval is required",
             details: %{stored_hash: stored, current_hash: current_hash}
           }}
        end

      {:error, %{} = err} ->
        {:error, Map.put(err, :code, err.code || :permission_drift)}

      {:error, other} ->
        {:error,
         %{
           code: :permission_drift,
           message: "requested permissions drift check failed",
           details: %{reason: safe_inspect(other)}
         }}
    end
  end

  @doc """
  Validates that the approval's stored `manifest_hash` (if present) matches the
  current manifest hash.

  This is an optional stronger drift gate (useful when approvals are tied to an
  exact manifest version, not just a permissions list).
  """
  @spec validate_manifest_hash_match(String.t() | nil, String.t()) ::
          :ok | {:error, validation_error()}
  def validate_manifest_hash_match(nil, _current_manifest_hash), do: :ok

  def validate_manifest_hash_match(stored_manifest_hash, current_manifest_hash)
      when is_binary(stored_manifest_hash) and is_binary(current_manifest_hash) do
    stored = String.downcase(String.trim(stored_manifest_hash))
    current = String.downcase(String.trim(current_manifest_hash))

    if stored == "" or current == "" do
      {:error,
       %{
         code: :invalid_manifest_hash,
         message: "manifest hash is missing or invalid",
         details: %{}
       }}
    else
      if stored == current do
        :ok
      else
        {:error,
         %{
           code: :manifest_drift,
           message: "manifest has changed; re-approval is required",
           details: %{stored_manifest_hash: stored, current_manifest_hash: current}
         }}
      end
    end
  end

  @doc """
  Produces a safe summary of permissions for audit metadata.

  Returns a small, bounded map like:
  `%{count: 12, sample: ["fs:read:**", ...]}`.

  Options:
  - `:sample_size` (default 10)
  """
  @spec summarize_permissions(permissions(), Keyword.t()) :: map()
  def summarize_permissions(perms, opts \\ []) when is_list(perms) do
    sample_size =
      case Keyword.get(opts, :sample_size, 10) do
        n when is_integer(n) and n >= 0 -> min(n, 50)
        _ -> 10
      end

    case normalize_permissions(perms) do
      {:ok, normalized} ->
        %{
          count: length(normalized),
          sample: Enum.take(normalized, sample_size)
        }

      {:error, _} ->
        %{
          count: 0,
          sample: [],
          invalid: true
        }
    end
  end

  # ----------------------------------------------------------------------------
  # Internal helpers
  # ----------------------------------------------------------------------------

  defp contains_invalid_chars?(str) when is_binary(str) do
    String.contains?(str, ["\u0000", "\n", "\r"])
  end

  defp safe_inspect(term) do
    term
    |> inspect(limit: 20, printable_limit: 500)
    |> String.replace(~r/\r\n|\r|\n/, " ")
    |> String.slice(0, 500)
  end
end
