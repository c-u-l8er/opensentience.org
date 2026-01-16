defmodule OpenSentience.AuditLog do
  @moduledoc """
  Audit log API for OpenSentience Core (Phase 1).

  Goals (per Phase 1 acceptance):
  - Durable, queryable audit log for security-relevant actions.
  - Append-only semantics at the application layer.
  - Secret-free persistence (defense-in-depth best-effort redaction).

  Storage:
  - SQLite via `OpenSentience.Repo`
  - Table: `audit_events` (see migrations)

  Design notes:
  - This module is intentionally strict about bounding and sanitizing persisted metadata.
  - Redaction is best-effort; callers should prefer storing *summaries* over raw payloads.
  """

  import Ecto.Query, warn: false

  alias OpenSentience.AuditLog.Event
  alias OpenSentience.AuditLog.Redaction
  alias OpenSentience.Repo

  @type actor_type :: :human | :system | :agent
  @type severity :: :info | :warn | :error | :security
  @type result(t) :: {:ok, t} | {:error, Ecto.Changeset.t()}

  @type append_attrs :: %{
          required(:event_type) => String.t(),
          required(:actor_type) => actor_type() | String.t(),
          required(:actor_id) => String.t(),
          required(:subject_type) => String.t(),
          required(:subject_id) => String.t(),
          optional(:at) => DateTime.t(),
          optional(:event_id) => String.t(),
          optional(:correlation_id) => String.t() | nil,
          optional(:causation_id) => String.t() | nil,
          optional(:severity) => severity() | String.t() | nil,
          optional(:metadata) => map() | nil
        }

  # Reasonable bounds for durable persistence.
  @max_metadata_json_bytes 16_384

  # Conservative redaction bounds. Note: this is best-effort; we still clamp final JSON size.
  @redaction_opts [
    max_depth: 6,
    max_keys: 200,
    max_list: 200,
    max_string: 2_000,
    max_total_bytes: 200_000,
    placeholder: "[REDACTED]"
  ]

  @doc """
  Appends an audit event (append-only).

  Required attributes:
  - `event_type` (string, e.g. `"agent.installed"`)
  - `actor_type` (`:human | :system | :agent`)
  - `actor_id` (string, e.g. username, `"core"`)
  - `subject_type` (string, e.g. `"agent"`, `"run"`)
  - `subject_id` (string, e.g. `agent_id`, `run_id`)

  Optional attributes:
  - `metadata` (map) - will be redacted/bounded and encoded into `metadata_json`
  - `correlation_id`, `causation_id`
  - `severity` (`:info | :warn | :error | :security`)
  - `at` (DateTime) - defaults to `DateTime.utc_now()`
  - `event_id` (string) - defaults to `Ecto.UUID.generate()`

  Returns `{:ok, %OpenSentience.AuditLog.Event{}}` or `{:error, changeset}`.
  """
  @spec append(append_attrs()) :: result(Event.t())
  def append(attrs) when is_map(attrs) do
    now = DateTime.utc_now()

    metadata =
      attrs
      |> Map.get(:metadata, Map.get(attrs, "metadata"))
      |> normalize_metadata()

    metadata_json = encode_metadata_json!(metadata)

    event_attrs = %{
      event_id: Map.get(attrs, :event_id) || Map.get(attrs, "event_id") || Ecto.UUID.generate(),
      at: Map.get(attrs, :at) || Map.get(attrs, "at") || now,
      event_type: Map.get(attrs, :event_type) || Map.get(attrs, "event_type"),
      actor_type: Map.get(attrs, :actor_type) || Map.get(attrs, "actor_type"),
      actor_id: Map.get(attrs, :actor_id) || Map.get(attrs, "actor_id"),
      subject_type: Map.get(attrs, :subject_type) || Map.get(attrs, "subject_type"),
      subject_id: Map.get(attrs, :subject_id) || Map.get(attrs, "subject_id"),
      correlation_id: Map.get(attrs, :correlation_id) || Map.get(attrs, "correlation_id"),
      causation_id: Map.get(attrs, :causation_id) || Map.get(attrs, "causation_id"),
      severity: Map.get(attrs, :severity) || Map.get(attrs, "severity"),
      metadata_json: metadata_json
    }

    event_attrs
    |> Event.create_changeset()
    |> Repo.insert()
  end

  @doc """
  Same as `append/1`, but raises on error.
  """
  @spec append!(append_attrs()) :: Event.t()
  def append!(attrs) do
    case append(attrs) do
      {:ok, event} ->
        event

      {:error, %Ecto.Changeset{} = changeset} ->
        raise ArgumentError, "audit append failed: #{format_changeset(changeset)}"
    end
  end

  @doc """
  Lists audit events with simple filtering.

  Options:
  - `:limit` (default 100, max 500)
  - `:offset` (default 0)
  - `:event_type` (string)
  - `:actor_type` (string/atom)
  - `:actor_id` (string)
  - `:subject_type` (string)
  - `:subject_id` (string)
  - `:correlation_id` (string)
  - `:since` (DateTime)
  - `:until` (DateTime)
  - `:order` (`:at_desc` default, or `:at_asc`)
  """
  @spec list_events(Keyword.t()) :: [Event.t()]
  def list_events(opts \\ []) when is_list(opts) do
    limit = opts |> Keyword.get(:limit, 100) |> normalize_limit()
    offset = opts |> Keyword.get(:offset, 0) |> normalize_offset()
    order = Keyword.get(opts, :order, :at_desc)

    Event
    |> base_query()
    |> maybe_where(:event_type, Keyword.get(opts, :event_type))
    |> maybe_where(:actor_type, normalize_optional_enum(Keyword.get(opts, :actor_type)))
    |> maybe_where(:actor_id, Keyword.get(opts, :actor_id))
    |> maybe_where(:subject_type, Keyword.get(opts, :subject_type))
    |> maybe_where(:subject_id, Keyword.get(opts, :subject_id))
    |> maybe_where(:correlation_id, Keyword.get(opts, :correlation_id))
    |> maybe_since(Keyword.get(opts, :since))
    |> maybe_until(Keyword.get(opts, :until))
    |> apply_order(order)
    |> limit(^limit)
    |> offset(^offset)
    |> Repo.all()
  end

  @doc """
  Returns a single audit event by `event_id`, or `nil` if not found.
  """
  @spec get_event(String.t()) :: Event.t() | nil
  def get_event(event_id) when is_binary(event_id) do
    Repo.get(Event, event_id)
  end

  @doc """
  Tails the audit log: returns the most recent `limit` events (default 50).
  """
  @spec tail(non_neg_integer()) :: [Event.t()]
  def tail(limit \\ 50) when is_integer(limit) and limit >= 0 do
    list_events(limit: limit, order: :at_desc)
  end

  @doc false
  @spec max_metadata_json_bytes() :: pos_integer()
  def max_metadata_json_bytes, do: @max_metadata_json_bytes

  # ----------------------------------------------------------------------------
  # Query helpers
  # ----------------------------------------------------------------------------

  defp base_query(queryable), do: from(e in queryable)

  defp maybe_where(query, _field, nil), do: query

  defp maybe_where(query, field, value) when is_atom(field) do
    from(e in query, where: field(e, ^field) == ^value)
  end

  defp maybe_since(query, %DateTime{} = since), do: from(e in query, where: e.at >= ^since)
  defp maybe_since(query, _), do: query

  defp maybe_until(query, %DateTime{} = until), do: from(e in query, where: e.at <= ^until)
  defp maybe_until(query, _), do: query

  defp apply_order(query, :at_asc), do: from(e in query, order_by: [asc: e.at, asc: e.event_id])

  defp apply_order(query, :at_desc),
    do: from(e in query, order_by: [desc: e.at, desc: e.event_id])

  defp apply_order(query, _), do: apply_order(query, :at_desc)

  defp normalize_limit(limit) when is_integer(limit) and limit > 0, do: min(limit, 500)
  defp normalize_limit(_), do: 100

  defp normalize_offset(offset) when is_integer(offset) and offset >= 0, do: offset
  defp normalize_offset(_), do: 0

  defp normalize_optional_enum(nil), do: nil
  defp normalize_optional_enum(v) when is_atom(v), do: Atom.to_string(v)
  defp normalize_optional_enum(v) when is_binary(v), do: String.trim(v)
  defp normalize_optional_enum(v), do: v |> to_string() |> String.trim()

  # ----------------------------------------------------------------------------
  # Metadata sanitization / encoding
  # ----------------------------------------------------------------------------

  defp normalize_metadata(nil), do: %{}
  defp normalize_metadata(%{} = map), do: map
  defp normalize_metadata(other), do: %{"value" => other}

  defp encode_metadata_json!(metadata) when is_map(metadata) do
    json =
      case Redaction.safe_metadata_json(metadata, @redaction_opts) do
        {:ok, json} -> json
        {:error, _} -> Jason.encode!(%{"redaction_failed" => true})
      end

    if byte_size(json) <= @max_metadata_json_bytes do
      json
    else
      Jason.encode!(%{
        "truncated" => true,
        "reason" => "metadata_json too large",
        "max_bytes" => @max_metadata_json_bytes
      })
    end
  end

  defp format_changeset(%Ecto.Changeset{} = cs) do
    cs
    |> Ecto.Changeset.traverse_errors(fn {msg, opts} ->
      Enum.reduce(opts, msg, fn {k, v}, acc ->
        String.replace(acc, "%{#{k}}", to_string(v))
      end)
    end)
    |> Jason.encode!()
  rescue
    _ -> "invalid_changeset"
  end
end
