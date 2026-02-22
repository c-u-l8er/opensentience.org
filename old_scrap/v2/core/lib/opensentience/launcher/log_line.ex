defmodule OpenSentience.Launcher.LogLine do
  @moduledoc """
  Logs table schema for storing **redacted** launcher output lines (Phase 1).

  This schema backs the `logs` table created in the Phase 1 migration and is intended
  for indexing *bounded*, *secret-free* log lines originating from:
  - agent stdout/stderr streams (launcher capture)
  - core/launcher internal messages (`stream="core"`)

  Security invariants:
  - Durable artifacts MUST be secret-free.
  - This changeset applies best-effort redaction and clamping for `line`.
  - Callers should avoid persisting large raw outputs; store summaries where possible.

  Table columns (see migration):
  - `log_id` TEXT PRIMARY KEY
  - `at` UTC datetime
  - `agent_id` TEXT (FK -> agents.agent_id)
  - `run_id` TEXT NULL (FK -> runs.run_id)
  - `stream` TEXT: stdout|stderr|core
  - `line` TEXT (redacted; bounded)
  """

  use Ecto.Schema
  import Ecto.Changeset

  alias OpenSentience.AuditLog.Redaction

  @primary_key false
  schema "logs" do
    field(:log_id, :string, primary_key: true)

    field(:at, :utc_datetime_usec)

    field(:agent_id, :string)
    field(:run_id, :string)

    field(:stream, :string)
    field(:line, :string)
  end

  @type stream :: :stdout | :stderr | :core

  @type t :: %__MODULE__{
          log_id: String.t(),
          at: DateTime.t(),
          agent_id: String.t(),
          run_id: String.t() | nil,
          stream: String.t(),
          line: String.t()
        }

  @allowed_streams ~w(stdout stderr core)

  # Keep persisted log lines small and predictable. This is about *durable* storage,
  # not about what the launcher can display in-memory.
  @max_line_len 2_000

  @max_agent_id_len 200
  @max_run_id_len 64
  @max_stream_len 16
  @max_log_id_len 64

  @doc """
  Returns allowed `logs.stream` values.
  """
  @spec allowed_streams() :: [String.t()]
  def allowed_streams, do: @allowed_streams

  @doc """
  Builds a changeset for inserting/updating a `LogLine`.

  This changeset:
  - normalizes string fields
  - redacts and clamps `line`
  - enforces required fields and bounded lengths
  """
  @spec changeset(t(), map()) :: Ecto.Changeset.t()
  def changeset(%__MODULE__{} = log, attrs) when is_map(attrs) do
    log
    |> cast(attrs, [:log_id, :at, :agent_id, :run_id, :stream, :line])
    |> normalize_strings([:log_id, :agent_id, :run_id, :stream])
    |> update_change(:stream, &normalize_stream/1)
    |> update_change(:line, &sanitize_line/1)
    |> validate_required([:log_id, :at, :agent_id, :stream, :line])
    |> validate_length(:log_id, min: 1, max: @max_log_id_len)
    |> validate_length(:agent_id, min: 1, max: @max_agent_id_len)
    |> validate_length(:run_id, max: @max_run_id_len)
    |> validate_length(:stream, min: 1, max: @max_stream_len)
    |> validate_length(:line, min: 1, max: @max_line_len)
    |> validate_inclusion(:stream, @allowed_streams,
      message: "must be one of: #{Enum.join(@allowed_streams, ", ")}"
    )
  end

  @doc """
  Convenience constructor changeset for inserting a new log line.

  Ensures:
  - `log_id` is set (UUID) if not provided
  - `at` is set to `DateTime.utc_now/0` if not provided
  """
  @spec create_changeset(map() | Keyword.t()) :: Ecto.Changeset.t()
  def create_changeset(attrs) do
    attrs = if is_list(attrs), do: Map.new(attrs), else: attrs

    base = %__MODULE__{
      log_id: Map.get(attrs, :log_id) || Map.get(attrs, "log_id") || Ecto.UUID.generate(),
      at: Map.get(attrs, :at) || Map.get(attrs, "at") || DateTime.utc_now()
    }

    changeset(base, attrs)
  end

  # ----------------------------------------------------------------------------
  # Internal helpers
  # ----------------------------------------------------------------------------

  defp normalize_strings(%Ecto.Changeset{} = cs, fields) when is_list(fields) do
    Enum.reduce(fields, cs, fn field, acc ->
      update_change(acc, field, &normalize_optional_string/1)
    end)
  end

  defp normalize_stream(nil), do: nil
  defp normalize_stream(v) when is_atom(v), do: v |> Atom.to_string() |> normalize_stream()
  defp normalize_stream(v) when is_binary(v), do: v |> String.trim() |> String.downcase()
  defp normalize_stream(v), do: v |> to_string() |> normalize_stream()

  defp sanitize_line(nil), do: nil

  defp sanitize_line(v) when is_binary(v) do
    # Best-effort redaction and clamping. This is defense-in-depth; callers should
    # avoid persisting secrets in the first place.
    v
    |> Redaction.redact_string(max_string: @max_line_len)
    |> String.trim_trailing()
    |> case do
      "" -> nil
      s -> s
    end
  end

  defp sanitize_line(v), do: v |> to_string() |> sanitize_line()

  defp normalize_optional_string(nil), do: nil

  defp normalize_optional_string(v) when is_binary(v) do
    v = String.trim(v)
    if v == "", do: nil, else: v
  end

  defp normalize_optional_string(v), do: v |> to_string() |> normalize_optional_string()
end
