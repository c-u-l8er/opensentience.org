defmodule OpenSentience.AuditLog.Event do
  @moduledoc """
  Audit event schema for Phase 1.

  This is the durable, queryable record of security-relevant actions in Core.

  Storage model (per Phase 1 breakdown):
  - append-only at the application layer (do not `update`/`delete` rows)
  - `metadata_json` is a JSON object string and MUST be secret-free
  - `at` is a UTC timestamp

  Notes:
  - This schema intentionally stores `metadata_json` as a `:string` field to match the
    SQLite migration (`:text`). A virtual `metadata` field is provided for convenience
    when constructing events in code.
  """

  use Ecto.Schema
  import Ecto.Changeset

  @primary_key false
  schema "audit_events" do
    field(:event_id, :string, primary_key: true)

    field(:at, :utc_datetime_usec)
    field(:event_type, :string)

    # enum-ish: human | system | agent
    field(:actor_type, :string)
    field(:actor_id, :string)

    field(:subject_type, :string)
    field(:subject_id, :string)

    field(:correlation_id, :string)
    field(:causation_id, :string)

    # Persisted (SQLite TEXT). MUST be a JSON object string.
    field(:metadata_json, :string)

    # enum-ish: info | warn | error | security
    field(:severity, :string)

    # Convenience: allow callers to pass a map and have it encoded into `metadata_json`.
    field(:metadata, :map, virtual: true)
  end

  @type t :: %__MODULE__{
          event_id: String.t(),
          at: DateTime.t(),
          event_type: String.t(),
          actor_type: String.t(),
          actor_id: String.t(),
          subject_type: String.t(),
          subject_id: String.t(),
          correlation_id: String.t() | nil,
          causation_id: String.t() | nil,
          metadata_json: String.t(),
          severity: String.t() | nil,
          metadata: map() | nil
        }

  @allowed_actor_types ~w(human system agent)
  @allowed_severities ~w(info warn error security)

  @doc """
  Creates a new `Event` struct with generated `event_id` and `at` timestamp.

  You still need to call `changeset/2` (or `create_changeset/1`) to validate/encode.
  """
  @spec new(map() | Keyword.t()) :: t()
  def new(attrs \\ %{}) do
    attrs = if is_list(attrs), do: Map.new(attrs), else: attrs

    %__MODULE__{
      event_id: Ecto.UUID.generate(),
      at: DateTime.utc_now()
    }
    |> cast(attrs, [
      :event_id,
      :at,
      :event_type,
      :actor_type,
      :actor_id,
      :subject_type,
      :subject_id,
      :correlation_id,
      :causation_id,
      :metadata_json,
      :severity,
      :metadata
    ])
    |> apply_changes()
  end

  @doc """
  Changeset for validating and preparing an audit event for insertion.

  Accepted inputs:
  - `metadata_json` as a JSON object string, or
  - `metadata` as a map (encoded into `metadata_json`)

  This changeset is intentionally conservative:
  - validates required fields
  - enforces enum-ish inclusions for `actor_type` and `severity`
  - enforces that `metadata_json` decodes to an object (map)
  - bounds key string lengths and payload size (defense-in-depth)

  It does **not** attempt perfect "no secrets" enforcement. That is handled by
  `OpenSentience.AuditLog.Redaction` / higher-level policy checks.
  """
  @spec changeset(t(), map()) :: Ecto.Changeset.t()
  def changeset(%__MODULE__{} = event, attrs) when is_map(attrs) do
    event
    |> cast(attrs, [
      :event_id,
      :at,
      :event_type,
      :actor_type,
      :actor_id,
      :subject_type,
      :subject_id,
      :correlation_id,
      :causation_id,
      :metadata_json,
      :severity,
      :metadata
    ])
    |> put_metadata_json_from_metadata()
    |> normalize_strings()
    |> validate_required([
      :event_id,
      :at,
      :event_type,
      :actor_type,
      :actor_id,
      :subject_type,
      :subject_id,
      :metadata_json
    ])
    |> validate_length(:event_id, min: 1, max: 100)
    |> validate_length(:event_type, min: 1, max: 200)
    |> validate_length(:actor_type, min: 1, max: 20)
    |> validate_length(:actor_id, min: 1, max: 200)
    |> validate_length(:subject_type, min: 1, max: 50)
    |> validate_length(:subject_id, min: 1, max: 200)
    |> validate_length(:correlation_id, max: 200)
    |> validate_length(:causation_id, max: 200)
    |> validate_length(:severity, max: 20)
    |> validate_length(:metadata_json, min: 2, max: 50_000)
    |> validate_inclusion(:actor_type, @allowed_actor_types,
      message: "must be one of: #{Enum.join(@allowed_actor_types, ", ")}"
    )
    |> validate_inclusion(:severity, @allowed_severities,
      message: "must be one of: #{Enum.join(@allowed_severities, ", ")}"
    )
    |> validate_metadata_json_is_object()
  end

  @doc """
  Convenience for building a validated changeset for insertion.

  Ensures `event_id` and `at` are set if not provided.
  """
  @spec create_changeset(map() | Keyword.t()) :: Ecto.Changeset.t()
  def create_changeset(attrs) do
    attrs = if is_list(attrs), do: Map.new(attrs), else: attrs

    base = %__MODULE__{
      event_id: Map.get(attrs, :event_id) || Map.get(attrs, "event_id") || Ecto.UUID.generate(),
      at: Map.get(attrs, :at) || Map.get(attrs, "at") || DateTime.utc_now()
    }

    changeset(base, attrs)
  end

  @doc """
  Returns allowed `actor_type` values.
  """
  @spec allowed_actor_types() :: [String.t()]
  def allowed_actor_types, do: @allowed_actor_types

  @doc """
  Returns allowed `severity` values.
  """
  @spec allowed_severities() :: [String.t()]
  def allowed_severities, do: @allowed_severities

  # ----------------------------------------------------------------------------
  # Internal helpers
  # ----------------------------------------------------------------------------

  defp put_metadata_json_from_metadata(changeset) do
    metadata = get_field(changeset, :metadata)

    cond do
      is_map(metadata) ->
        json = Jason.encode!(metadata)
        changeset |> put_change(:metadata_json, json)

      true ->
        changeset
    end
  end

  defp normalize_strings(changeset) do
    fields = [
      :event_id,
      :event_type,
      :actor_type,
      :actor_id,
      :subject_type,
      :subject_id,
      :correlation_id,
      :causation_id,
      :metadata_json,
      :severity
    ]

    Enum.reduce(fields, changeset, fn field, cs ->
      update_change(cs, field, fn
        nil -> nil
        v when is_binary(v) -> String.trim(v)
        v -> v |> to_string() |> String.trim()
      end)
    end)
  end

  defp validate_metadata_json_is_object(changeset) do
    validate_change(changeset, :metadata_json, fn :metadata_json, json ->
      case Jason.decode(json) do
        {:ok, %{} = obj} ->
          # Keep a virtual copy for convenience (not persisted).
          # Avoid huge virtual payloads; only store if reasonably small.
          cs = put_change(changeset, :metadata, obj)
          _ = cs
          []

        {:ok, _other} ->
          [metadata_json: "must be a JSON object (map)"]

        {:error, _} ->
          [metadata_json: "must be valid JSON"]
      end
    end)
  end
end
