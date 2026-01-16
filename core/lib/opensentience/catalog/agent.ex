defmodule OpenSentience.Catalog.Agent do
  @moduledoc """
  Catalog schema for a discovered/known agent.

  Phase 1 scope:
  - discovery/indexing records (NO code execution)
  - install/build lifecycle metadata
  - operational status summaries (secret-free)

  This table is the canonical catalog view that the CLI/UI queries.

  Notes:
  - Do not store secrets in this schema.
  - `last_error` must be a *safe summary* suitable for durable storage.
  """

  use Ecto.Schema
  import Ecto.Changeset

  @primary_key false
  schema "agents" do
    field(:agent_id, :string, primary_key: true)

    field(:name, :string)
    field(:version, :string)
    field(:description, :string)

    field(:source_git_url, :string)
    field(:source_ref, :string)

    field(:manifest_path, :string)
    field(:manifest_hash, :string)

    field(:discovered_at, :utc_datetime_usec)
    field(:last_seen_at, :utc_datetime_usec)

    field(:status, :string)

    field(:install_path, :string)
    field(:build_status, :string)
    field(:build_last_at, :utc_datetime_usec)

    field(:last_error, :string)
  end

  @typedoc "Database-backed agent record."
  @type t :: %__MODULE__{
          agent_id: String.t(),
          name: String.t() | nil,
          version: String.t() | nil,
          description: String.t() | nil,
          source_git_url: String.t() | nil,
          source_ref: String.t() | nil,
          manifest_path: String.t(),
          manifest_hash: String.t(),
          discovered_at: DateTime.t(),
          last_seen_at: DateTime.t(),
          status: String.t(),
          install_path: String.t() | nil,
          build_status: String.t() | nil,
          build_last_at: DateTime.t() | nil,
          last_error: String.t() | nil
        }

  @allowed_statuses ~w(
    local_dev
    local_uninstalled
    installed
    enabled
    running
    stopped
    error
  )

  @allowed_build_statuses ~w(
    not_built
    building
    built
    failed
  )

  @doc """
  Returns allowed `agents.status` values.
  """
  @spec allowed_statuses() :: [String.t()]
  def allowed_statuses, do: @allowed_statuses

  @doc """
  Returns allowed `agents.build_status` values.
  """
  @spec allowed_build_statuses() :: [String.t()]
  def allowed_build_statuses, do: @allowed_build_statuses

  @doc """
  Changeset for creating/updating an agent record.

  Callers should prefer `upsert_changeset/2` for discovery scans, since it applies
  "last_seen" semantics and safe defaults.
  """
  @spec changeset(t(), map()) :: Ecto.Changeset.t()
  def changeset(%__MODULE__{} = agent, attrs) when is_map(attrs) do
    agent
    |> cast(attrs, [
      :agent_id,
      :name,
      :version,
      :description,
      :source_git_url,
      :source_ref,
      :manifest_path,
      :manifest_hash,
      :discovered_at,
      :last_seen_at,
      :status,
      :install_path,
      :build_status,
      :build_last_at,
      :last_error
    ])
    |> update_change(:status, &normalize_enum_value/1)
    |> update_change(:build_status, &normalize_enum_value/1)
    |> update_change(:last_error, &safe_error_summary/1)
    |> validate_required([
      :agent_id,
      :manifest_path,
      :manifest_hash,
      :discovered_at,
      :last_seen_at,
      :status
    ])
    |> validate_length(:agent_id, min: 1, max: 200)
    |> validate_length(:name, max: 200)
    |> validate_length(:version, max: 100)
    |> validate_length(:manifest_path, min: 1, max: 4_096)
    |> validate_length(:manifest_hash, min: 16, max: 128)
    |> validate_length(:source_git_url, max: 4_096)
    |> validate_length(:source_ref, max: 512)
    |> validate_length(:install_path, max: 4_096)
    |> validate_inclusion(:status, @allowed_statuses)
    |> validate_inclusion(:build_status, @allowed_build_statuses,
      message: "must be one of: #{Enum.join(@allowed_build_statuses, ", ")}"
    )
    |> validate_manifest_hash_format()
  end

  @doc """
  Discovery upsert changeset.

  Intended usage:
  - Discovery finds a manifest and parses it
  - It computes `manifest_hash`
  - It upserts the row keyed by `agent_id` (or `manifest_path`, depending on policy)

  This helper:
  - ensures `last_seen_at` updates to "now" if not provided
  - sets `discovered_at` on first insert if not provided by the caller
  - sets `status` to `local_uninstalled` if missing (safe default)
  """
  @spec upsert_changeset(t(), map()) :: Ecto.Changeset.t()
  def upsert_changeset(%__MODULE__{} = agent, attrs) when is_map(attrs) do
    now = DateTime.utc_now()

    attrs =
      attrs
      |> Map.put_new("last_seen_at", now)
      |> Map.put_new(:last_seen_at, now)
      |> Map.put_new("discovered_at", now)
      |> Map.put_new(:discovered_at, now)
      |> Map.put_new("status", "local_uninstalled")
      |> Map.put_new(:status, "local_uninstalled")

    changeset(agent, attrs)
  end

  @doc """
  Returns `true` if `status` represents a running agent process.
  """
  @spec running?(t() | String.t() | atom()) :: boolean()
  def running?(%__MODULE__{status: status}), do: running?(status)
  def running?(status) when is_atom(status), do: status == :running
  def running?(status) when is_binary(status), do: String.downcase(status) == "running"

  @doc """
  Produces a safe, bounded error summary suitable for storing in `agents.last_error`.
  """
  @spec safe_error_summary(term()) :: String.t() | nil
  def safe_error_summary(nil), do: nil

  def safe_error_summary(value) when is_binary(value) do
    value
    |> String.replace("\u0000", "")
    |> String.replace(~r/\r\n|\r|\n/, " ")
    |> String.trim()
    |> case do
      "" -> nil
      s -> String.slice(s, 0, 1_000)
    end
  end

  def safe_error_summary(value) do
    value
    |> inspect(limit: 50, printable_limit: 1_000)
    |> safe_error_summary()
  end

  # ----------------------------------------------------------------------------
  # Internal helpers
  # ----------------------------------------------------------------------------

  defp normalize_enum_value(nil), do: nil
  defp normalize_enum_value(value) when is_atom(value), do: Atom.to_string(value)
  defp normalize_enum_value(value) when is_binary(value), do: String.trim(value)
  defp normalize_enum_value(value), do: value |> to_string() |> String.trim()

  defp validate_manifest_hash_format(changeset) do
    # Best-effort sanity check: allow hex-ish hashes and common base64url-ish tokens.
    # The discovery component should define the canonical hash algorithm.
    validate_change(changeset, :manifest_hash, fn :manifest_hash, hash ->
      cond do
        is_binary(hash) and String.match?(hash, ~r/^[A-Za-z0-9+\/=_:-]+$/) ->
          []

        true ->
          [manifest_hash: "has invalid format"]
      end
    end)
  end
end
