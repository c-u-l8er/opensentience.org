defmodule OpenSentience.Harness.PolicyResolver do
  @moduledoc """
  OS-008 Delegatic Conflict Resolution (spec section 14.3).

  When OS-008 pipeline says "proceed" but Delegatic policy says "block",
  **Delegatic wins**. This module implements the enforcement order:

      1. PipelineEnforcer: Prerequisites met?  NO → Block (operational)
      2. ContractValidator: [&] governance OK?  NO → Block (contractual)
      3. Delegatic (via OS-006): Org policy OK?  NO → Block (organizational)
      4. All pass → Execute

  Delegatic blocks are logged as `:policy_violation` audit events (not
  `:pipeline_violation`), enabling distinct operational vs. policy failure analysis.

  ## Design

  OS-008 enforces **operational correctness** (did you retrieve before acting?).
  Delegatic enforces **organizational policy** (are you allowed to act at all?).
  Policy is a superset of pipeline: an action that passes pipeline checks may
  still violate policy.
  """

  require Logger

  alias OpenSentience.Harness.AuditEntry

  @type delegatic_result :: :allow | {:block, binary()} | {:escalate, binary()}

  @doc """
  Resolve the full enforcement chain for an action.

  Applies the three-layer enforcement order:
  1. Pipeline check (already done by caller)
  2. Contract check (already done by caller)
  3. Delegatic policy check

  ## Parameters

    * `action` — the action to validate
    * `contract_result` — result from ContractValidator (`:allow` or tuple)
    * `delegatic_fn` — `(action) -> :allow | {:block, reason} | {:escalate, reason}`

  ## Returns

    * `:ok` — all checks pass
    * `{:block, reason}` — Delegatic policy blocks the action
    * `{:escalate, reason}` — Delegatic requires human approval

  """
  @spec resolve(map(), term(), function() | nil) :: :ok | {:block, term()} | {:escalate, term()}
  def resolve(action, contract_result, delegatic_fn)

  def resolve(_action, {:block, _, violations}, _delegatic_fn) do
    # Contract already blocked — no need to check Delegatic
    {:block, violations}
  end

  def resolve(_action, {:escalate, triggers}, _delegatic_fn) do
    # Contract escalated — no need to check Delegatic
    {:escalate, triggers}
  end

  def resolve(action, {:allow, _warnings}, delegatic_fn) when is_function(delegatic_fn, 1) do
    case delegatic_fn.(action) do
      :allow ->
        :ok

      {:block, reason} ->
        Logger.warning("[OS-008] Delegatic policy blocked action: #{inspect(reason)}")
        {:block, reason}

      {:escalate, reason} ->
        Logger.info("[OS-008] Delegatic policy requires escalation: #{inspect(reason)}")
        {:escalate, reason}
    end
  end

  def resolve(_action, {:allow, _warnings}, nil) do
    # No Delegatic integration — allow
    :ok
  end

  def resolve(_action, _contract_result, _delegatic_fn) do
    :ok
  end

  @doc """
  Build an audit entry for a Delegatic policy decision.

  Delegatic blocks use `:contract_violated` with a `policy_source: :delegatic`
  metadata field, distinguishing them from OS-008 contract violations.
  """
  @spec audit_entry(binary(), delegatic_result(), map()) :: AuditEntry.t()
  def audit_entry(session_id, result, action_summary \\ %{}) do
    case result do
      :allow ->
        AuditEntry.new(:contract_validated, session_id,
          metadata: %{policy_source: :delegatic, action: action_summary}
        )

      {:block, reason} ->
        AuditEntry.new(:contract_violated, session_id,
          metadata: %{
            policy_source: :delegatic,
            reason: reason,
            action: action_summary
          }
        )

      {:escalate, reason} ->
        AuditEntry.new(:confidence_gate_triggered, session_id,
          metadata: %{
            policy_source: :delegatic,
            reason: reason,
            action: action_summary
          }
        )
    end
  end
end
