defmodule OpenSentience.Discovery.Hashing do
  @moduledoc """
  Hashing helpers for discovery/change detection.

  Phase 1 use-cases:
  - Compute `manifest_hash` from the *raw manifest file contents* to detect any change.
  - Compute stable hashes for manifest-derived lists (e.g., requested permissions) to
    detect approval drift.

  Design notes:
  - Hash algorithm is SHA-256.
  - Manifest hashing intentionally uses the raw bytes of the manifest file, not a
    parsed/canonical JSON representation. This is simple, deterministic, and avoids
    canonicalization pitfalls. It does mean whitespace-only edits change the hash,
    which is acceptable for a "re-approval required" drift signal.
  """

  @algo :sha256

  @type hash :: String.t()

  @doc """
  Returns the hashing algorithm used by this module.
  """
  @spec algorithm() :: atom()
  def algorithm, do: @algo

  @doc """
  Computes a SHA-256 hex hash (lowercase) of the given binary.

  This is the primitive used by all other functions in this module.
  """
  @spec hash_bytes(binary()) :: hash()
  def hash_bytes(bytes) when is_binary(bytes) do
    bytes
    |> :crypto.hash(@algo)
    |> Base.encode16(case: :lower)
  end

  @doc """
  Computes the manifest hash for the given manifest file path.

  Returns `{:ok, hash}` or `{:error, reason}` (from `File.read/1`).

  Note: the hash is computed over the raw file contents.
  """
  @spec hash_manifest_file(Path.t()) :: {:ok, hash()} | {:error, term()}
  def hash_manifest_file(path) when is_binary(path) do
    case File.read(path) do
      {:ok, contents} -> {:ok, hash_manifest_contents(contents)}
      {:error, reason} -> {:error, reason}
    end
  end

  @doc """
  Same as `hash_manifest_file/1`, but raises on failure.
  """
  @spec hash_manifest_file!(Path.t()) :: hash()
  def hash_manifest_file!(path) when is_binary(path) do
    path
    |> File.read!()
    |> hash_manifest_contents()
  end

  @doc """
  Computes the manifest hash from the given raw manifest file contents.
  """
  @spec hash_manifest_contents(binary()) :: hash()
  def hash_manifest_contents(contents) when is_binary(contents) do
    hash_bytes(contents)
  end

  @doc """
  Computes a stable hash for a list of requested permissions.

  This is intended to back the `permission_approvals.requested_permissions_hash`
  drift check.

  Stability rules:
  - Only binaries are accepted (errors otherwise).
  - Each permission is trimmed.
  - Empty entries are removed.
  - The list is de-duplicated and sorted.
  - The normalized list is JSON-encoded (stable for arrays of strings) and hashed.

  Returns `{:ok, hash}` or `{:error, reason}`.
  """
  @spec hash_permissions_list([String.t()]) :: {:ok, hash()} | {:error, term()}
  def hash_permissions_list(perms) when is_list(perms) do
    with :ok <- validate_all_binaries(perms) do
      normalized =
        perms
        |> Enum.map(&String.trim/1)
        |> Enum.reject(&(&1 == ""))
        |> Enum.uniq()
        |> Enum.sort()

      # JSON encoding a list of strings is stable; no map key ordering concerns.
      {:ok, hash_bytes(Jason.encode!(normalized))}
    end
  end

  @doc """
  Same as `hash_permissions_list/1`, but raises on invalid inputs.
  """
  @spec hash_permissions_list!([String.t()]) :: hash()
  def hash_permissions_list!(perms) when is_list(perms) do
    case hash_permissions_list(perms) do
      {:ok, hash} -> hash
      {:error, reason} -> raise ArgumentError, "invalid permissions list: #{inspect(reason)}"
    end
  end

  # ----------------------------------------------------------------------------
  # Internal helpers
  # ----------------------------------------------------------------------------

  defp validate_all_binaries(list) do
    case Enum.find(list, fn v -> not is_binary(v) end) do
      nil -> :ok
      bad -> {:error, {:non_string_permission, bad}}
    end
  end
end
