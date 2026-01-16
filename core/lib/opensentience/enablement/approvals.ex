defmodule OpenSentience.Enablement.Approvals do
  @moduledoc """
  Enablement approvals API (Phase 1).

  This module implements the **deny-by-default** permission approval lifecycle:

  - Agents declare *requested permissions* in their `opensentience.agent.json` manifest.
  - A human explicitly approves either:
    - all requested permissions, or
    - a safe subset (approved ⊆ requested).
  - Approvals are durable in SQLite (`permission_approvals`).
  - Drift detection: if the requested permissions list changes (hash mismatch),
    the approval is considered stale.

  Security invariants:
  - Never execute agent code here.
  - Never persist secrets in approvals/audit metadata.
  """

  import Ecto.Query, warn: false

  alias OpenSentience.AuditLog
  alias OpenSentience.Catalog
  alias OpenSentience.Enablement.PermissionApproval
  alias OpenSentience.Enablement.Validation
  alias OpenSentience.Repo

  @type approval_id :: String.t()
  @type agent_id :: String.t()
  @type permission :: String.t()

  @type actor_type :: :human | :system | :agent
  @type actor_id :: String.t()

  @typedoc """
  Scope pins to prevent approvals being reused across upgrades/ref changes.
  """
  @type approval_scope :: %{
          optional(:manifest_hash) => String.t(),
          optional(:source_ref) => String.t()
        }

  @type approve_opts :: [
          actor_type: actor_type(),
          actor_id: actor_id(),
          correlation_id: String.t() | nil,
          causation_id: String.t() | nil,
          revoke_existing?: boolean(),
          manifest_hash: String.t() | nil,
          source_ref: String.t() | nil
        ]

  @type revoke_opts :: [
          actor_type: actor_type(),
          actor_id: actor_id(),
          correlation_id: String.t() | nil,
          causation_id: String.t() | nil,
          reason: String.t() | nil
        ]

  @doc """
  Approves a subset of requested permissions for an agent.

  Inputs:
  - `agent_id` - catalog agent id
  - `requested_permissions` - permissions declared in the manifest
  - `approved_permissions` - subset to approve (must be ⊆ requested)

  Options:
  - `:actor_type` (default `:human`)
  - `:actor_id` (default `"unknown"`)
  - `:correlation_id`, `:causation_id` (optional)
  - `:revoke_existing?` (default `true`)
  - `:manifest_hash`, `:source_ref` (optional scope pins)

  Emits audit events (best-effort):
  - `agent.enable_requested`
  - `agent.enabled`
  - `security.denied` on validation failure
  """
  @spec approve(agent_id(), [permission()], [permission()], approve_opts()) ::
          {:ok, PermissionApproval.t()} | {:error, term()}
  def approve(agent_id, requested_permissions, approved_permissions, opts \\ [])
      when is_binary(agent_id) and is_list(requested_permissions) and
             is_list(approved_permissions) and
             is_list(opts) do
    actor_type = Keyword.get(opts, :actor_type, :human) |> normalize_actor_type()
    actor_id = Keyword.get(opts, :actor_id, "unknown") |> normalize_actor_id()
    correlation_id = Keyword.get(opts, :correlation_id)
    causation_id = Keyword.get(opts, :causation_id)

    revoke_existing? = Keyword.get(opts, :revoke_existing?, true) == true
    manifest_hash = Keyword.get(opts, :manifest_hash) |> normalize_optional_string()
    source_ref = Keyword.get(opts, :source_ref) |> normalize_optional_string()

    with {:ok, requested_norm} <- Validation.normalize_permissions(requested_permissions),
         {:ok, approved_norm} <- Validation.normalize_permissions(approved_permissions),
         {:ok, _} <- Validation.validate_approved_subset(requested_norm, approved_norm),
         {:ok, requested_hash} <- Validation.requested_permissions_hash(requested_norm) do
      emit_audit(%{
        event_type: "agent.enable_requested",
        actor_type: actor_type,
        actor_id: actor_id,
        subject_type: "agent",
        subject_id: agent_id,
        correlation_id: correlation_id,
        causation_id: causation_id,
        severity: :info,
        metadata: %{
          requested_permissions_hash: requested_hash,
          requested_permissions: Validation.summarize_permissions(requested_norm),
          approved_permissions: Validation.summarize_permissions(approved_norm),
          scope: %{
            manifest_hash: manifest_hash,
            source_ref: source_ref
          }
        }
      })

      Repo.transaction(fn ->
        if revoke_existing? do
          revoke_existing_active_for_agent!(
            agent_id,
            actor_id,
            %{
              manifest_hash: manifest_hash,
              source_ref: source_ref
            }
          )
        end

        approval =
          %{
            agent_id: agent_id,
            approved_permissions: approved_norm,
            approved_by: actor_id,
            requested_permissions_hash: requested_hash,
            manifest_hash: manifest_hash,
            source_ref: source_ref,
            status: "active"
          }
          |> PermissionApproval.create_changeset()
          |> Repo.insert!()

        _ = maybe_mark_agent_enabled(agent_id)

        approval
      end)
      |> case do
        {:ok, %PermissionApproval{} = approval} ->
          emit_audit(%{
            event_type: "agent.enabled",
            actor_type: actor_type,
            actor_id: actor_id,
            subject_type: "permission_approval",
            subject_id: approval.id,
            correlation_id: correlation_id,
            causation_id: causation_id,
            severity: :info,
            metadata: %{
              agent_id: approval.agent_id,
              requested_permissions_hash: approval.requested_permissions_hash,
              approved_permissions: approval |> decoded_permissions_summary(),
              scope: %{
                manifest_hash: approval.manifest_hash,
                source_ref: approval.source_ref
              }
            }
          })

          {:ok, approval}

        {:error, reason} ->
          {:error, reason}
      end
    else
      {:error, reason} ->
        emit_audit(%{
          event_type: "security.denied",
          actor_type: actor_type,
          actor_id: actor_id,
          subject_type: "agent",
          subject_id: agent_id,
          correlation_id: correlation_id,
          causation_id: causation_id,
          severity: :security,
          metadata: %{
            action: "agent.enable",
            reason: safe_reason(reason)
          }
        })

        {:error, reason}
    end
  end

  @doc """
  Revokes an approval by `approval_id`.

  Emits audit event (best-effort):
  - `agent.permissions_revoked` (subject: `permission_approval:<id>`)
  """
  @spec revoke(approval_id(), revoke_opts()) :: {:ok, PermissionApproval.t()} | {:error, term()}
  def revoke(approval_id, opts \\ []) when is_binary(approval_id) and is_list(opts) do
    actor_type = Keyword.get(opts, :actor_type, :human) |> normalize_actor_type()
    actor_id = Keyword.get(opts, :actor_id, "unknown") |> normalize_actor_id()
    correlation_id = Keyword.get(opts, :correlation_id)
    causation_id = Keyword.get(opts, :causation_id)
    reason = Keyword.get(opts, :reason) |> normalize_optional_string()

    Repo.transaction(fn ->
      case Repo.get(PermissionApproval, approval_id) do
        nil ->
          Repo.rollback({:not_found, :permission_approval, approval_id})

        %PermissionApproval{status: "revoked"} = approval ->
          approval

        %PermissionApproval{} = approval ->
          approval
          |> PermissionApproval.revoke_changeset(actor_id, revoked_at: DateTime.utc_now())
          |> Repo.update!()
      end
    end)
    |> case do
      {:ok, %PermissionApproval{} = approval} ->
        emit_audit(%{
          event_type: "agent.permissions_revoked",
          actor_type: actor_type,
          actor_id: actor_id,
          subject_type: "permission_approval",
          subject_id: approval.id,
          correlation_id: correlation_id,
          causation_id: causation_id,
          severity: :info,
          metadata: %{
            agent_id: approval.agent_id,
            reason: reason,
            scope: %{
              manifest_hash: approval.manifest_hash,
              source_ref: approval.source_ref
            }
          }
        })

        {:ok, approval}

      {:error, reason} ->
        {:error, reason}
    end
  end

  @doc """
  Revokes any active approvals for an agent (optionally scoped).

  Scope matching rules:
  - If `scope.manifest_hash` is provided, only rows with that exact `manifest_hash` match.
  - If `scope.source_ref` is provided, only rows with that exact `source_ref` match.
  - If a scope field is `nil`, it is not used as a filter.

  Returns the number of approvals revoked.
  """
  @spec revoke_active_for_agent(agent_id(), approval_scope(), revoke_opts()) ::
          {:ok, non_neg_integer()} | {:error, term()}
  def revoke_active_for_agent(agent_id, scope \\ %{}, opts \\ [])
      when is_binary(agent_id) and is_map(scope) and is_list(opts) do
    actor_type = Keyword.get(opts, :actor_type, :human) |> normalize_actor_type()
    actor_id = Keyword.get(opts, :actor_id, "unknown") |> normalize_actor_id()
    correlation_id = Keyword.get(opts, :correlation_id)
    causation_id = Keyword.get(opts, :causation_id)
    reason = Keyword.get(opts, :reason) |> normalize_optional_string()

    manifest_hash =
      (Map.get(scope, :manifest_hash) || Map.get(scope, "manifest_hash"))
      |> normalize_optional_string()

    source_ref =
      (Map.get(scope, :source_ref) || Map.get(scope, "source_ref"))
      |> normalize_optional_string()

    query =
      from(a in PermissionApproval,
        where: a.agent_id == ^agent_id and a.status == "active"
      )
      |> maybe_where(:manifest_hash, manifest_hash)
      |> maybe_where(:source_ref, source_ref)

    now = DateTime.utc_now()

    Repo.transaction(fn ->
      approvals = Repo.all(query)

      approvals
      |> Enum.reduce(0, fn approval, acc ->
        _ =
          approval
          |> PermissionApproval.revoke_changeset(actor_id, revoked_at: now)
          |> Repo.update!()

        acc + 1
      end)
    end)
    |> case do
      {:ok, count} ->
        if count > 0 do
          emit_audit(%{
            event_type: "agent.permissions_revoked",
            actor_type: actor_type,
            actor_id: actor_id,
            subject_type: "agent",
            subject_id: agent_id,
            correlation_id: correlation_id,
            causation_id: causation_id,
            severity: :info,
            metadata: %{
              reason: reason,
              revoked_count: count,
              scope: %{
                manifest_hash: manifest_hash,
                source_ref: source_ref
              }
            }
          })
        end

        {:ok, count}

      {:error, reason} ->
        {:error, reason}
    end
  end

  @doc """
  Returns the most recent active approval for an agent, optionally scoped.

  If scope fields are provided, they must match exactly.

  Returns:
  - `{:ok, approval}` if an active approval exists
  - `:none` if none exists
  """
  @spec get_active_for_agent(agent_id(), approval_scope()) ::
          {:ok, PermissionApproval.t()} | :none
  def get_active_for_agent(agent_id, scope \\ %{}) when is_binary(agent_id) and is_map(scope) do
    manifest_hash =
      (Map.get(scope, :manifest_hash) || Map.get(scope, "manifest_hash"))
      |> normalize_optional_string()

    source_ref =
      (Map.get(scope, :source_ref) || Map.get(scope, "source_ref"))
      |> normalize_optional_string()

    PermissionApproval
    |> where([a], a.agent_id == ^agent_id and a.status == "active")
    |> maybe_where(:manifest_hash, manifest_hash)
    |> maybe_where(:source_ref, source_ref)
    |> order_by([a], desc: a.approved_at)
    |> limit(1)
    |> Repo.one()
    |> case do
      nil -> :none
      %PermissionApproval{} = approval -> {:ok, approval}
    end
  end

  @doc """
  Validates that an agent is enabled for the given `requested_permissions_hash`.

  This is the Phase 1 drift-detection gate to apply before running an agent:

  - If there is **no** active approval => `{:error, :not_enabled}`
  - If the stored hash does **not** match => `{:error, :approval_drift}`
  - If it matches => `{:ok, approved_permissions_list}`

  Optional scope pins:
  - `manifest_hash` and/or `source_ref` can be provided to ensure the approval matches a specific version/ref.
  """
  @spec ensure_enabled(agent_id(), String.t(), approval_scope()) ::
          {:ok, [permission()]} | {:error, :not_enabled | :approval_drift | term()}
  def ensure_enabled(agent_id, requested_permissions_hash, scope \\ %{})
      when is_binary(agent_id) and is_binary(requested_permissions_hash) and is_map(scope) do
    requested_permissions_hash = requested_permissions_hash |> String.trim() |> String.downcase()

    case get_active_for_agent(agent_id, scope) do
      :none ->
        {:error, :not_enabled}

      {:ok, %PermissionApproval{} = approval} ->
        stored =
          approval.requested_permissions_hash |> to_string() |> String.trim() |> String.downcase()

        if stored == requested_permissions_hash do
          decode_approved_permissions(approval)
        else
          {:error, :approval_drift}
        end
    end
  end

  @doc """
  Decodes the approved permissions list from a `PermissionApproval`.

  Returns `{:ok, list}` or `{:error, reason}`.
  """
  @spec decode_approved_permissions(PermissionApproval.t()) ::
          {:ok, [permission()]} | {:error, term()}
  def decode_approved_permissions(%PermissionApproval{} = approval) do
    PermissionApproval.decode_permissions_json(approval.approved_permissions_json)
  end

  @doc """
  Lists approvals for an agent.

  Options:
  - `:status` ("active" | "revoked" | nil)
  - `:limit` (default 50, max 500)
  - `:offset` (default 0)
  """
  @spec list_for_agent(agent_id(), Keyword.t()) :: [PermissionApproval.t()]
  def list_for_agent(agent_id, opts \\ []) when is_binary(agent_id) and is_list(opts) do
    status = opts |> Keyword.get(:status) |> normalize_optional_string()
    limit = opts |> Keyword.get(:limit, 50) |> normalize_limit()
    offset = opts |> Keyword.get(:offset, 0) |> normalize_offset()

    PermissionApproval
    |> where([a], a.agent_id == ^agent_id)
    |> maybe_where(:status, status)
    |> order_by([a], desc: a.approved_at)
    |> limit(^limit)
    |> offset(^offset)
    |> Repo.all()
  end

  # ----------------------------------------------------------------------------
  # Internal helpers
  # ----------------------------------------------------------------------------

  defp revoke_existing_active_for_agent!(agent_id, revoked_by, scope) do
    manifest_hash = Map.get(scope, :manifest_hash) |> normalize_optional_string()
    source_ref = Map.get(scope, :source_ref) |> normalize_optional_string()

    query =
      from(a in PermissionApproval,
        where: a.agent_id == ^agent_id and a.status == "active"
      )
      |> maybe_where(:manifest_hash, manifest_hash)
      |> maybe_where(:source_ref, source_ref)

    now = DateTime.utc_now()

    Repo.all(query)
    |> Enum.each(fn approval ->
      approval
      |> PermissionApproval.revoke_changeset(revoked_by, revoked_at: now)
      |> Repo.update!()
    end)
  end

  defp maybe_mark_agent_enabled(agent_id) do
    if Code.ensure_loaded?(Catalog) do
      _ = Catalog.set_status(agent_id, "enabled")
      :ok
    else
      :noop
    end
  rescue
    _ -> :noop
  end

  defp maybe_where(query, _field, nil), do: query

  defp maybe_where(query, field, value) when is_atom(field) do
    from(a in query, where: field(a, ^field) == ^value)
  end

  defp normalize_actor_type(t) when t in [:human, :system, :agent], do: t

  defp normalize_actor_type(t) when is_binary(t) do
    case String.downcase(String.trim(t)) do
      "human" -> :human
      "system" -> :system
      "agent" -> :agent
      _ -> :human
    end
  end

  defp normalize_actor_type(_), do: :human

  defp normalize_actor_id(id) when is_binary(id) do
    id
    |> String.trim()
    |> case do
      "" -> "unknown"
      s -> String.slice(s, 0, 200)
    end
  end

  defp normalize_actor_id(id), do: id |> to_string() |> normalize_actor_id()

  defp normalize_optional_string(nil), do: nil

  defp normalize_optional_string(v) when is_binary(v) do
    v = String.trim(v)
    if v == "", do: nil, else: String.slice(v, 0, 4_096)
  end

  defp normalize_optional_string(v), do: v |> to_string() |> normalize_optional_string()

  defp normalize_limit(n) when is_integer(n) and n > 0, do: min(n, 500)
  defp normalize_limit(_), do: 50

  defp normalize_offset(n) when is_integer(n) and n >= 0, do: n
  defp normalize_offset(_), do: 0

  defp decoded_permissions_summary(%PermissionApproval{} = approval) do
    case decode_approved_permissions(approval) do
      {:ok, perms} -> Validation.summarize_permissions(perms)
      {:error, _} -> %{count: 0, sample: [], invalid: true}
    end
  end

  defp emit_audit(attrs) when is_map(attrs) do
    if Code.ensure_loaded?(AuditLog) and function_exported?(AuditLog, :append, 1) do
      _ =
        AuditLog.append(%{
          event_type: Map.fetch!(attrs, :event_type),
          actor_type: Map.fetch!(attrs, :actor_type),
          actor_id: Map.fetch!(attrs, :actor_id),
          subject_type: Map.fetch!(attrs, :subject_type),
          subject_id: Map.fetch!(attrs, :subject_id),
          correlation_id: Map.get(attrs, :correlation_id),
          causation_id: Map.get(attrs, :causation_id),
          severity: Map.get(attrs, :severity),
          metadata: Map.get(attrs, :metadata, %{})
        })

      :ok
    else
      :noop
    end
  rescue
    _ -> :noop
  end

  defp safe_reason(reason) when is_binary(reason), do: String.slice(String.trim(reason), 0, 500)

  defp safe_reason(reason) do
    reason
    |> inspect(limit: 20, printable_limit: 500)
    |> String.replace(~r/\r\n|\r|\n/, " ")
    |> String.slice(0, 500)
  end
end
