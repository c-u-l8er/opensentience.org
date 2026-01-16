defmodule OpenSentience.Repo.Migrations.InitCore do
  use Ecto.Migration

  def change do
    # -------------------------------------------------------------------------
    # agents
    # -------------------------------------------------------------------------
    create table(:agents, primary_key: false) do
      add(:agent_id, :string, primary_key: true)

      add(:name, :string)
      add(:version, :string)
      add(:description, :text)

      add(:source_git_url, :text)
      add(:source_ref, :text)

      add(:manifest_path, :text, null: false)
      add(:manifest_hash, :string, null: false)

      # Stored as UTC datetimes; SQLite persists these as TEXT.
      add(:discovered_at, :utc_datetime_usec, null: false)
      add(:last_seen_at, :utc_datetime_usec, null: false)

      add(:status, :string, null: false)

      add(:install_path, :text)
      add(:build_status, :string)
      add(:build_last_at, :utc_datetime_usec)

      # MUST be safe/non-secret; keep messages short in application code.
      add(:last_error, :text)
    end

    create(index(:agents, [:status]))
    create(index(:agents, [:last_seen_at]))
    create(unique_index(:agents, [:manifest_path]))

    # -------------------------------------------------------------------------
    # permission_approvals
    # -------------------------------------------------------------------------
    create table(:permission_approvals, primary_key: false) do
      add(:id, :string, primary_key: true)

      add(
        :agent_id,
        references(:agents, column: :agent_id, type: :string, on_delete: :delete_all),
        null: false
      )

      # Stored as a JSON array string; application code validates it is a subset
      # of requested permissions and is secret-free.
      add(:approved_permissions_json, :text, null: false)

      add(:approved_at, :utc_datetime_usec, null: false)
      add(:approved_by, :string, null: false)

      # Hash of the requested permissions list to detect drift.
      add(:requested_permissions_hash, :string, null: false)

      # Optional but recommended for drift prevention across upgrades.
      add(:source_ref, :text)
      add(:manifest_hash, :string)

      # enum-ish: active | revoked
      add(:status, :string, null: false)

      add(:revoked_at, :utc_datetime_usec)
      add(:revoked_by, :string)
    end

    create(index(:permission_approvals, [:agent_id]))
    create(index(:permission_approvals, [:status]))
    create(index(:permission_approvals, [:approved_at]))
    create(index(:permission_approvals, [:manifest_hash]))
    create(index(:permission_approvals, [:source_ref]))

    # -------------------------------------------------------------------------
    # runs
    # -------------------------------------------------------------------------
    create table(:runs, primary_key: false) do
      add(:run_id, :string, primary_key: true)

      add(
        :agent_id,
        references(:agents, column: :agent_id, type: :string, on_delete: :delete_all),
        null: false
      )

      add(:started_at, :utc_datetime_usec, null: false)
      add(:stopped_at, :utc_datetime_usec)

      # enum-ish: starting | running | stopped | crashed
      add(:status, :string, null: false)

      add(:pid, :integer)
      add(:exit_code, :integer)

      # MUST be safe/non-secret
      add(:reason, :text)

      # Phase 2+ reserved fields
      add(:last_heartbeat_at, :utc_datetime_usec)
      add(:session_id, :string)
    end

    create(index(:runs, [:agent_id]))
    create(index(:runs, [:status]))
    create(index(:runs, [:started_at]))

    # -------------------------------------------------------------------------
    # audit_events (append-only at the application layer)
    # -------------------------------------------------------------------------
    create table(:audit_events, primary_key: false) do
      add(:event_id, :string, primary_key: true)

      add(:at, :utc_datetime_usec, null: false)
      add(:event_type, :string, null: false)

      # enum-ish: human | system | agent
      add(:actor_type, :string, null: false)
      add(:actor_id, :string, null: false)

      add(:subject_type, :string, null: false)
      add(:subject_id, :string, null: false)

      add(:correlation_id, :string)
      add(:causation_id, :string)

      # Stored as a JSON object string; MUST be secret-free.
      add(:metadata_json, :text, null: false)

      # enum-ish: info | warn | error | security
      add(:severity, :string)
    end

    create(index(:audit_events, [:at]))
    create(index(:audit_events, [:event_type]))
    create(index(:audit_events, [:actor_type, :actor_id]))
    create(index(:audit_events, [:subject_type, :subject_id]))
    create(index(:audit_events, [:correlation_id]))

    # -------------------------------------------------------------------------
    # logs (optional in Phase 1; useful for indexing recent captured output)
    # -------------------------------------------------------------------------
    create table(:logs, primary_key: false) do
      add(:log_id, :string, primary_key: true)

      add(:at, :utc_datetime_usec, null: false)

      add(
        :agent_id,
        references(:agents, column: :agent_id, type: :string, on_delete: :delete_all),
        null: false
      )

      add(:run_id, references(:runs, column: :run_id, type: :string, on_delete: :nilify_all))

      # enum-ish: stdout | stderr | core
      add(:stream, :string, null: false)

      # MUST be redacted/bounded in application code.
      add(:line, :text, null: false)
    end

    create(index(:logs, [:agent_id, :at]))
    create(index(:logs, [:run_id, :at]))
  end
end
