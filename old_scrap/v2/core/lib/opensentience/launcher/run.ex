defmodule OpenSentience.Launcher.Run do
  @moduledoc """
  `runs` table schema + persistence helpers for launcher lifecycle (Phase 1).

  This module provides:
  - an Ecto schema for the `runs` table (see migration)
  - convenience changesets for common lifecycle transitions
  - small Repo-backed helpers for creating/updating run records

  Phase 1 constraints:
  - Runs are launcher-level lifecycle records (starting/running/stopped/crashed).
  - Stored fields must be **secret-free**. In particular, `reason` must be a safe,
    bounded summary (never raw stderr/stdout, never tokens, never headers).

  Notes:
  - This module is intentionally conservative and avoids storing large payloads.
  - Audit logging is handled elsewhere (e.g., `OpenSentience.AuditLog`), but these helpers
    are designed to make it easy to keep run lifecycle updates consistent.
  """

  use Ecto.Schema
  import Ecto.Changeset
  import Ecto.Query, warn: false

  alias OpenSentience.Repo

  @primary_key false
  schema "runs" do
    field(:run_id, :string, primary_key: true)

    field(:agent_id, :string)

    field(:started_at, :utc_datetime_usec)
    field(:stopped_at, :utc_datetime_usec)

    # enum-ish: starting | running | stopped | crashed
    field(:status, :string)

    field(:pid, :integer)
    field(:exit_code, :integer)

    # MUST be safe/non-secret
    field(:reason, :string)

    # Phase 2+ reserved fields
    field(:last_heartbeat_at, :utc_datetime_usec)
    field(:session_id, :string)
  end

  @type t :: %__MODULE__{
          run_id: String.t(),
          agent_id: String.t(),
          started_at: DateTime.t(),
          stopped_at: DateTime.t() | nil,
          status: String.t(),
          pid: integer() | nil,
          exit_code: integer() | nil,
          reason: String.t() | nil,
          last_heartbeat_at: DateTime.t() | nil,
          session_id: String.t() | nil
        }

  @allowed_statuses ~w(starting running stopped crashed)

  @max_agent_id_len 200
  @max_reason_len 1_000
  @max_session_id_len 200

  # ----------------------------------------------------------------------------
  # Public constants
  # ----------------------------------------------------------------------------

  @doc "Returns allowed `runs.status` values."
  @spec allowed_statuses() :: [String.t()]
  def allowed_statuses, do: @allowed_statuses

  # ----------------------------------------------------------------------------
  # Changesets
  # ----------------------------------------------------------------------------

  @doc """
  Base changeset for the `runs` schema.

  Callers should prefer the lifecycle-specific convenience changesets below.
  """
  @spec changeset(t(), map()) :: Ecto.Changeset.t()
  def changeset(%__MODULE__{} = run, attrs) when is_map(attrs) do
    attrs = normalize_params(attrs)

    run
    |> cast(attrs, [
      :run_id,
      :agent_id,
      :started_at,
      :stopped_at,
      :status,
      :pid,
      :exit_code,
      :reason,
      :last_heartbeat_at,
      :session_id
    ])
    |> normalize_strings([:run_id, :agent_id, :status, :reason, :session_id])
    |> update_change(:reason, &safe_reason/1)
    |> validate_required([:run_id, :agent_id, :started_at, :status])
    |> validate_length(:run_id, min: 1, max: 64)
    |> validate_length(:agent_id, min: 1, max: @max_agent_id_len)
    |> validate_length(:reason, max: @max_reason_len)
    |> validate_length(:session_id, max: @max_session_id_len)
    |> validate_inclusion(:status, @allowed_statuses,
      message: "must be one of: #{Enum.join(@allowed_statuses, ", ")}"
    )
    |> validate_agent_id_format()
  end

  @doc """
  Changeset for starting a run record.

  Ensures:
  - `run_id` is generated if missing
  - `started_at` is set to `DateTime.utc_now/0` if missing
  - `status` defaults to `"starting"` if missing
  """
  @spec start_changeset(map() | Keyword.t()) :: Ecto.Changeset.t()
  def start_changeset(attrs) do
    attrs = if is_list(attrs), do: Map.new(attrs), else: attrs

    base = %__MODULE__{
      run_id: Map.get(attrs, :run_id) || Map.get(attrs, "run_id") || Ecto.UUID.generate(),
      started_at:
        Map.get(attrs, :started_at) || Map.get(attrs, "started_at") || DateTime.utc_now(),
      status: Map.get(attrs, :status) || Map.get(attrs, "status") || "starting"
    }

    changeset(base, attrs)
  end

  @doc """
  Marks a run as `running` and optionally records `pid` and `session_id`.

  Does not set `stopped_at`.
  """
  @spec mark_running_changeset(t(), Keyword.t()) :: Ecto.Changeset.t()
  def mark_running_changeset(%__MODULE__{} = run, opts \\ []) when is_list(opts) do
    changeset(run, %{
      status: "running",
      pid: Keyword.get(opts, :pid),
      session_id: Keyword.get(opts, :session_id),
      reason: nil,
      exit_code: nil
    })
  end

  @doc """
  Marks a run as `stopped` and sets `stopped_at` (defaults to now).

  `reason` must be secret-free; it will be sanitized and bounded.
  """
  @spec mark_stopped_changeset(t(), Keyword.t()) :: Ecto.Changeset.t()
  def mark_stopped_changeset(%__MODULE__{} = run, opts \\ []) when is_list(opts) do
    stopped_at = Keyword.get(opts, :stopped_at, DateTime.utc_now())
    exit_code = Keyword.get(opts, :exit_code)
    reason = Keyword.get(opts, :reason)

    changeset(run, %{
      status: "stopped",
      stopped_at: stopped_at,
      exit_code: exit_code,
      reason: reason
    })
  end

  @doc """
  Marks a run as `crashed` and sets `stopped_at` (defaults to now).

  `reason` must be secret-free; it will be sanitized and bounded.
  """
  @spec mark_crashed_changeset(t(), Keyword.t()) :: Ecto.Changeset.t()
  def mark_crashed_changeset(%__MODULE__{} = run, opts \\ []) when is_list(opts) do
    stopped_at = Keyword.get(opts, :stopped_at, DateTime.utc_now())
    exit_code = Keyword.get(opts, :exit_code)
    reason = Keyword.get(opts, :reason)

    changeset(run, %{
      status: "crashed",
      stopped_at: stopped_at,
      exit_code: exit_code,
      reason: reason
    })
  end

  @doc """
  Updates heartbeat fields (Phase 2+ reserved).

  This is safe to call in Phase 1, but may not be used until protocol heartbeats exist.
  """
  @spec heartbeat_changeset(t(), DateTime.t()) :: Ecto.Changeset.t()
  def heartbeat_changeset(%__MODULE__{} = run, %DateTime{} = at) do
    changeset(run, %{last_heartbeat_at: at})
  end

  # ----------------------------------------------------------------------------
  # Repo-backed helpers (Phase 1 convenience)
  # ----------------------------------------------------------------------------

  @typedoc "Common result type for Repo operations."
  @type result(t) :: {:ok, t} | {:error, Ecto.Changeset.t()} | {:error, term()}

  @doc """
  Creates a new run record with `status="starting"` (unless overridden).

  Options:
  - `:run_id` (string) override generated id
  - `:started_at` (DateTime)
  - `:status` one of `starting|running|stopped|crashed` (starting is typical)
  - `:pid` (integer)
  - `:session_id` (string) reserved for Phase 2+
  """
  @spec start_run(String.t(), Keyword.t()) :: result(t())
  def start_run(agent_id, opts \\ []) when is_binary(agent_id) and is_list(opts) do
    attrs =
      opts
      |> Keyword.put(:agent_id, agent_id)
      |> Map.new()

    attrs
    |> start_changeset()
    |> Repo.insert()
  end

  @doc """
  Fetches a run by `run_id`.
  """
  @spec get(String.t()) :: t() | nil
  def get(run_id) when is_binary(run_id) do
    Repo.get(__MODULE__, run_id)
  end

  @doc """
  Lists runs for an agent, newest first by `started_at`.

  Options:
  - `:limit` (default 50, max 500)
  - `:offset` (default 0)
  - `:status` (optional status filter)
  """
  @spec list_for_agent(String.t(), Keyword.t()) :: [t()]
  def list_for_agent(agent_id, opts \\ []) when is_binary(agent_id) and is_list(opts) do
    limit = opts |> Keyword.get(:limit, 50) |> normalize_limit()
    offset = opts |> Keyword.get(:offset, 0) |> normalize_offset()
    status = opts |> Keyword.get(:status) |> normalize_optional_string()

    __MODULE__
    |> where([r], r.agent_id == ^agent_id)
    |> maybe_where_status(status)
    |> order_by([r], desc: r.started_at, desc: r.run_id)
    |> limit(^limit)
    |> offset(^offset)
    |> Repo.all()
  end

  @doc """
  Returns the most recent run for an agent (any status), or `nil`.
  """
  @spec latest_for_agent(String.t()) :: t() | nil
  def latest_for_agent(agent_id) when is_binary(agent_id) do
    __MODULE__
    |> where([r], r.agent_id == ^agent_id)
    |> order_by([r], desc: r.started_at, desc: r.run_id)
    |> limit(1)
    |> Repo.one()
  end

  @doc """
  Returns the most recent "active-ish" run for an agent (starting or running), or `nil`.
  """
  @spec latest_active_for_agent(String.t()) :: t() | nil
  def latest_active_for_agent(agent_id) when is_binary(agent_id) do
    __MODULE__
    |> where([r], r.agent_id == ^agent_id and r.status in ["starting", "running"])
    |> order_by([r], desc: r.started_at, desc: r.run_id)
    |> limit(1)
    |> Repo.one()
  end

  @doc """
  Marks an existing run as `running` and stores `pid` (optional) and `session_id` (optional).
  """
  @spec mark_running(String.t(), Keyword.t()) :: result(t())
  def mark_running(run_id, opts \\ []) when is_binary(run_id) and is_list(opts) do
    with %__MODULE__{} = run <- get(run_id) do
      run
      |> mark_running_changeset(opts)
      |> Repo.update()
    else
      nil -> {:error, :not_found}
    end
  end

  @doc """
  Marks an existing run as `stopped`.

  Options:
  - `:exit_code` (integer)
  - `:reason` (string; will be sanitized)
  - `:stopped_at` (DateTime; defaults to now)
  """
  @spec mark_stopped(String.t(), Keyword.t()) :: result(t())
  def mark_stopped(run_id, opts \\ []) when is_binary(run_id) and is_list(opts) do
    with %__MODULE__{} = run <- get(run_id) do
      run
      |> mark_stopped_changeset(opts)
      |> Repo.update()
    else
      nil -> {:error, :not_found}
    end
  end

  @doc """
  Marks an existing run as `crashed`.

  Options:
  - `:exit_code` (integer)
  - `:reason` (string; will be sanitized)
  - `:stopped_at` (DateTime; defaults to now)
  """
  @spec mark_crashed(String.t(), Keyword.t()) :: result(t())
  def mark_crashed(run_id, opts \\ []) when is_binary(run_id) and is_list(opts) do
    with %__MODULE__{} = run <- get(run_id) do
      run
      |> mark_crashed_changeset(opts)
      |> Repo.update()
    else
      nil -> {:error, :not_found}
    end
  end

  @doc """
  Updates `pid` for a run (if you learn it after creation).
  """
  @spec set_pid(String.t(), integer() | nil) :: result(t())
  def set_pid(run_id, pid) when is_binary(run_id) do
    with %__MODULE__{} = run <- get(run_id) do
      run
      |> changeset(%{pid: pid})
      |> Repo.update()
    else
      nil -> {:error, :not_found}
    end
  end

  @doc """
  Updates `last_heartbeat_at` (Phase 2+ reserved).
  """
  @spec touch_heartbeat(String.t(), DateTime.t()) :: result(t())
  def touch_heartbeat(run_id, %DateTime{} = at) when is_binary(run_id) do
    with %__MODULE__{} = run <- get(run_id) do
      run
      |> heartbeat_changeset(at)
      |> Repo.update()
    else
      nil -> {:error, :not_found}
    end
  end

  # ----------------------------------------------------------------------------
  # Internal helpers
  # ----------------------------------------------------------------------------

  defp maybe_where_status(query, nil), do: query
  defp maybe_where_status(query, status), do: where(query, [r], r.status == ^status)

  defp normalize_limit(n) when is_integer(n) and n > 0, do: min(n, 500)
  defp normalize_limit(_), do: 50

  defp normalize_offset(n) when is_integer(n) and n >= 0, do: n
  defp normalize_offset(_), do: 0

  defp normalize_params(attrs) when is_map(attrs) do
    Enum.reduce(attrs, %{}, fn
      {k, v}, acc when is_binary(k) ->
        Map.put(acc, k, v)

      {k, v}, acc when is_atom(k) ->
        Map.put_new(acc, Atom.to_string(k), v)

      {k, v}, acc ->
        Map.put_new(acc, to_string(k), v)
    end)
  end

  defp normalize_strings(%Ecto.Changeset{} = cs, fields) when is_list(fields) do
    Enum.reduce(fields, cs, fn field, acc ->
      update_change(acc, field, &normalize_optional_string/1)
    end)
  end

  defp normalize_optional_string(nil), do: nil

  defp normalize_optional_string(v) when is_binary(v) do
    v = String.trim(v)
    if v == "", do: nil, else: v
  end

  defp normalize_optional_string(v) do
    v
    |> to_string()
    |> normalize_optional_string()
  rescue
    _ -> nil
  end

  defp validate_agent_id_format(%Ecto.Changeset{} = cs) do
    validate_change(cs, :agent_id, fn :agent_id, agent_id ->
      cond do
        not is_binary(agent_id) ->
          [agent_id: "must be a string"]

        byte_size(agent_id) > @max_agent_id_len ->
          [agent_id: "is too long"]

        not String.match?(agent_id, ~r/^[A-Za-z0-9][A-Za-z0-9._-]*$/) ->
          [agent_id: "has invalid format"]

        true ->
          []
      end
    end)
  end

  defp safe_reason(nil), do: nil

  defp safe_reason(value) when is_binary(value) do
    value =
      value
      |> String.replace("\u0000", "")
      |> String.replace(~r/\r\n|\r|\n/, " ")
      |> String.trim()

    if value == "" do
      nil
    else
      # Best-effort redaction if the redaction module exists; otherwise just clamp.
      redacted =
        if Code.ensure_loaded?(OpenSentience.AuditLog.Redaction) and
             function_exported?(OpenSentience.AuditLog.Redaction, :redact_string, 2) do
          OpenSentience.AuditLog.Redaction.redact_string(value, max_string: @max_reason_len)
        else
          String.slice(value, 0, @max_reason_len)
        end

      # Final clamp for safety.
      String.slice(redacted, 0, @max_reason_len)
    end
  end

  defp safe_reason(value) do
    value
    |> inspect(limit: 50, printable_limit: 1_000)
    |> safe_reason()
  end
end
