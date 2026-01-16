defmodule OpenSentience.Enablement.PermissionApproval do
  @moduledoc """
  Enablement approval schema for Phase 1.

  This table stores the approved subset of permissions for a given agent, along with
  drift detection fields to ensure upgrades/manifest changes require re-approval.

  Storage fields (SQLite; see migration):
  - `approved_permissions_json` is a JSON array string (list of strings)
  - `requested_permissions_hash` is a hash of the requested permission list (stable)
  - `status` is enum-ish: `active | revoked`

  Security invariants:
  - Never store secrets here.
  - Persist *only* permission strings and safe metadata.
  """

  use Ecto.Schema
  import Ecto.Changeset

  alias OpenSentience.AuditLog.Redaction

  @primary_key false
  schema "permission_approvals" do
    field(:id, :string, primary_key: true)

    field(:agent_id, :string)

    # Persisted JSON array string (SQLite TEXT).
    field(:approved_permissions_json, :string)

    field(:approved_at, :utc_datetime_usec)
    field(:approved_by, :string)

    field(:requested_permissions_hash, :string)

    field(:source_ref, :string)
    field(:manifest_hash, :string)

    # enum-ish: active | revoked
    field(:status, :string)

    field(:revoked_at, :utc_datetime_usec)
    field(:revoked_by, :string)

    # Convenience virtual fields:
    field(:approved_permissions, {:array, :string}, virtual: true)
  end

  @type status :: :active | :revoked

  @type t :: %__MODULE__{
          id: String.t(),
          agent_id: String.t(),
          approved_permissions_json: String.t(),
          approved_at: DateTime.t(),
          approved_by: String.t(),
          requested_permissions_hash: String.t(),
          source_ref: String.t() | nil,
          manifest_hash: String.t() | nil,
          status: String.t(),
          revoked_at: DateTime.t() | nil,
          revoked_by: String.t() | nil,
          approved_permissions: [String.t()] | nil
        }

  @allowed_statuses ~w(active revoked)

  # Keep these conservative; we want durable records to be bounded and predictable.
  @max_permissions_count 1_000
  @max_permission_len 300
  @max_json_len 100_000

  @doc """
  Returns allowed `permission_approvals.status` values.
  """
  @spec allowed_statuses() :: [String.t()]
  def allowed_statuses, do: @allowed_statuses

  @doc """
  Builds a changeset for creating/updating an approval.

  Typical create attrs (minimum):
  - `:agent_id`
  - `:approved_permissions` (list of strings) OR `:approved_permissions_json`
  - `:approved_by` (safe actor id)
  - `:requested_permissions_hash` (drift detection)
  - `:status` (defaults to `active` via `create_changeset/1`)

  Notes:
  - This changeset validates that the persisted JSON is a JSON array of strings.
  - Subset validation (approved ⊆ requested) is enforced by
    `validate_approved_subset/2` when the caller provides requested permissions.
  """
  @spec changeset(t(), map()) :: Ecto.Changeset.t()
  def changeset(%__MODULE__{} = approval, attrs) when is_map(attrs) do
    approval
    |> cast(attrs, [
      :id,
      :agent_id,
      :approved_permissions_json,
      :approved_at,
      :approved_by,
      :requested_permissions_hash,
      :source_ref,
      :manifest_hash,
      :status,
      :revoked_at,
      :revoked_by,
      :approved_permissions
    ])
    |> normalize_strings([
      :id,
      :agent_id,
      :approved_permissions_json,
      :approved_by,
      :requested_permissions_hash,
      :source_ref,
      :manifest_hash,
      :status,
      :revoked_by
    ])
    |> put_json_from_virtual_permissions()
    |> validate_required([
      :id,
      :agent_id,
      :approved_permissions_json,
      :approved_at,
      :approved_by,
      :requested_permissions_hash,
      :status
    ])
    |> validate_length(:id, min: 1, max: 64)
    |> validate_length(:agent_id, min: 1, max: 200)
    |> validate_length(:approved_by, min: 1, max: 200)
    |> validate_length(:requested_permissions_hash, min: 16, max: 128)
    |> validate_length(:source_ref, max: 512)
    |> validate_length(:manifest_hash, max: 128)
    |> validate_length(:approved_permissions_json, min: 2, max: @max_json_len)
    |> validate_inclusion(:status, @allowed_statuses,
      message: "must be one of: #{Enum.join(@allowed_statuses, ", ")}"
    )
    |> validate_approved_permissions_json()
  end

  @doc """
  Convenience changeset for creating an approval.

  Ensures:
  - `id` is set (`Ecto.UUID.generate/0`) if not provided
  - `approved_at` is set to `DateTime.utc_now/0` if not provided
  - `status` defaults to `active` if not provided
  """
  @spec create_changeset(map() | Keyword.t()) :: Ecto.Changeset.t()
  def create_changeset(attrs) do
    attrs = if is_list(attrs), do: Map.new(attrs), else: attrs

    base = %__MODULE__{
      id: Map.get(attrs, :id) || Map.get(attrs, "id") || Ecto.UUID.generate(),
      approved_at:
        Map.get(attrs, :approved_at) || Map.get(attrs, "approved_at") || DateTime.utc_now(),
      status: Map.get(attrs, :status) || Map.get(attrs, "status") || "active"
    }

    changeset(base, attrs)
  end

  @doc """
  Convenience changeset for revoking an approval.

  Sets:
  - `status` -> `revoked`
  - `revoked_at` -> now (unless provided)
  - `revoked_by` -> provided actor id
  """
  @spec revoke_changeset(t(), String.t(), Keyword.t()) :: Ecto.Changeset.t()
  def revoke_changeset(%__MODULE__{} = approval, revoked_by, opts \\ [])
      when is_binary(revoked_by) and is_list(opts) do
    revoked_at = Keyword.get(opts, :revoked_at, DateTime.utc_now())

    approval
    |> changeset(%{
      status: "revoked",
      revoked_at: revoked_at,
      revoked_by: revoked_by
    })
  end

  @doc """
  Decodes `approved_permissions_json` into a normalized list of permission strings.

  Returns `{:ok, list}` or `{:error, reason}`.
  """
  @spec decode_permissions_json(String.t()) :: {:ok, [String.t()]} | {:error, term()}
  def decode_permissions_json(json) when is_binary(json) do
    case Jason.decode(json) do
      {:ok, list} when is_list(list) ->
        if Enum.all?(list, &is_binary/1) do
          {:ok, normalize_permissions_list(list)}
        else
          {:error, :non_string_permission}
        end

      {:ok, _other} ->
        {:error, :not_a_list}

      {:error, err} ->
        {:error, err}
    end
  end

  @doc """
  Encodes a permission list to a JSON array string after normalization.
  """
  @spec encode_permissions_json([String.t()]) :: String.t()
  def encode_permissions_json(perms) when is_list(perms) do
    perms
    |> normalize_permissions_list()
    |> Jason.encode!()
  end

  @doc """
  Validates (and optionally enforces) that approved permissions are a subset of requested.

  This is intended to be called by the enablement orchestration layer (CLI/UI flow)
  after reading requested permissions from the manifest.

  If the changeset includes `approved_permissions` virtual, it validates against that.
  Otherwise, it decodes `approved_permissions_json` and validates against that.

  Adds an error on `:approved_permissions` when invalid.
  """
  @spec validate_approved_subset(Ecto.Changeset.t(), [String.t()]) :: Ecto.Changeset.t()
  def validate_approved_subset(%Ecto.Changeset{} = changeset, requested_permissions)
      when is_list(requested_permissions) do
    requested = MapSet.new(normalize_permissions_list(requested_permissions))

    approved =
      cond do
        is_list(get_field(changeset, :approved_permissions)) ->
          normalize_permissions_list(get_field(changeset, :approved_permissions))

        is_binary(get_field(changeset, :approved_permissions_json)) ->
          case decode_permissions_json(get_field(changeset, :approved_permissions_json)) do
            {:ok, perms} -> perms
            {:error, _} -> []
          end

        true ->
          []
      end

    not_subset =
      approved
      |> Enum.reject(fn p -> MapSet.member?(requested, p) end)

    if not_subset == [] do
      changeset
    else
      add_error(
        changeset,
        :approved_permissions,
        "must be a subset of requested permissions",
        not_subset: Enum.take(not_subset, 20)
      )
    end
  end

  # ----------------------------------------------------------------------------
  # Internal helpers
  # ----------------------------------------------------------------------------

  defp normalize_strings(changeset, fields) when is_list(fields) do
    Enum.reduce(fields, changeset, fn field, cs ->
      update_change(cs, field, fn
        nil -> nil
        v when is_binary(v) -> String.trim(v)
        v -> v |> to_string() |> String.trim()
      end)
    end)
  end

  defp put_json_from_virtual_permissions(changeset) do
    perms = get_field(changeset, :approved_permissions)

    cond do
      is_list(perms) ->
        normalized = normalize_permissions_list(perms)
        json = Jason.encode!(normalized)
        changeset |> put_change(:approved_permissions_json, json)

      true ->
        changeset
    end
  end

  defp validate_approved_permissions_json(changeset) do
    validate_change(changeset, :approved_permissions_json, fn :approved_permissions_json, json ->
      cond do
        not is_binary(json) ->
          [approved_permissions_json: "must be a JSON string"]

        byte_size(json) > @max_json_len ->
          [approved_permissions_json: "is too large (max #{@max_json_len} bytes)"]

        true ->
          case decode_permissions_json(json) do
            {:ok, perms} ->
              # Also backfill the virtual field for convenience (not persisted).
              _ = perms
              []

            {:error, :not_a_list} ->
              [approved_permissions_json: "must be a JSON array"]

            {:error, :non_string_permission} ->
              [approved_permissions_json: "must be a JSON array of strings"]

            {:error, _} ->
              [approved_permissions_json: "must be valid JSON"]
          end
      end
    end)
  end

  defp normalize_permissions_list(perms) do
    perms
    |> Enum.map(fn
      s when is_binary(s) -> String.trim(s)
      other -> other |> to_string() |> String.trim()
    end)
    |> Enum.reject(&(&1 == ""))
    |> Enum.map(&sanitize_permission/1)
    |> Enum.reject(&is_nil/1)
    |> Enum.take(@max_permissions_count)
  end

  defp sanitize_permission(permission) when is_binary(permission) do
    permission =
      permission
      |> String.replace("\u0000", "")
      |> String.replace(~r/\r\n|\r|\n/, " ")
      |> String.trim()

    cond do
      permission == "" ->
        nil

      String.length(permission) > @max_permission_len ->
        String.slice(permission, 0, @max_permission_len)

      true ->
        # Defense-in-depth: best-effort redaction (should typically be a no-op for permission strings).
        Redaction.redact_string(permission, max_string: @max_permission_len)
    end
  end
end
