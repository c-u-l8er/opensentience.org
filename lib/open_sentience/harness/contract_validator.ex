defmodule OpenSentience.Harness.ContractValidator do
  @moduledoc """
  OS-008 Contract Validator — [&] governance block enforcement.

  Validates actions against governance blocks at runtime. Hard constraints are
  inviolable (action is blocked). Soft constraints generate warnings. Escalation
  triggers route to human review.

  ## Constraint Types

  | Type                              | Composition Time                  | Runtime                                        |
  |-----------------------------------|-----------------------------------|------------------------------------------------|
  | `hard`                            | Validated by `ampersand compose`  | Enforced pre-execution by ContractValidator    |
  | `soft`                            | Passed to planner as preferences  | Logged as warnings if overridden               |
  | `escalate_when.confidence_below`  | N/A                               | Checked against coverage_score before dispatch |
  | `escalate_when.cost_exceeds_usd`  | N/A                               | Checked against cumulative session cost        |
  | `autonomy.level`                  | Capped by Delegatic org policy    | Enforced by OS-006 + PipelineEnforcer          |
  | `autonomy.budget`                 | Validated for tier compatibility  | Enforced per-cycle by PipelineEnforcer         |

  ## Enforcement Order

  ```
  1. PipelineEnforcer: Prerequisites met?  NO → Block (operational)
  2. ContractValidator: [&] governance OK?  NO → Block (contractual)
  3. Delegatic (via OS-006): Org policy OK? NO → Block (organizational)
  4. All pass → Execute
  ```
  """

  use GenServer

  require Logger

  alias OpenSentience.Harness.AuditEntry

  @type constraint_result ::
          {:allow, [binary()]}
          | {:block, :hard_constraint_violation, [map()]}
          | {:escalate, [map()]}

  @type governance_block :: %{
          optional(:hard) => [map()],
          optional(:soft) => [map()],
          optional(:escalate_when) => map(),
          optional(:autonomy) => map()
        }

  @type state :: %{
          session_id: binary(),
          governance_block: governance_block() | nil,
          cumulative_cost_usd: float(),
          audit_log: [AuditEntry.t()]
        }

  ## Public API

  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opts \\ []) do
    name = Keyword.get(opts, :name)
    GenServer.start_link(__MODULE__, opts, name: name)
  end

  @doc """
  Validate an action against the governance block.

  ## Returns

    * `{:allow, warnings}` — action may proceed (warnings are soft constraint messages)
    * `{:block, :hard_constraint_violation, violations}` — action is blocked
    * `{:escalate, triggers}` — action needs human review

  """
  @spec validate(GenServer.server(), map()) :: constraint_result()
  def validate(server, action) do
    GenServer.call(server, {:validate, action})
  end

  @doc """
  Check confidence gate against the governance block's escalation threshold.

  ## Parameters

    * `coverage_assessment` — map with `:decision_confidence` key
    * Returns `:ok` or `{:escalate, :confidence_below_threshold, details}`

  """
  @spec check_confidence_gate(GenServer.server(), map()) ::
          :ok | {:escalate, :confidence_below_threshold, map()}
  def check_confidence_gate(server, coverage_assessment) do
    GenServer.call(server, {:check_confidence_gate, coverage_assessment})
  end

  @doc """
  Record a cost against the session's cumulative cost tracker.
  Returns `:ok` or `{:escalate, :cost_exceeds_budget, details}`.
  """
  @spec record_cost(GenServer.server(), float()) ::
          :ok | {:escalate, :cost_exceeds_budget, map()}
  def record_cost(server, cost_usd) do
    GenServer.call(server, {:record_cost, cost_usd})
  end

  @doc """
  Load or replace the governance block for this session.
  """
  @spec load_governance(GenServer.server(), governance_block()) :: :ok
  def load_governance(server, governance_block) do
    GenServer.call(server, {:load_governance, governance_block})
  end

  @doc """
  Returns the current governance block.
  """
  @spec governance_block(GenServer.server()) :: governance_block() | nil
  def governance_block(server) do
    GenServer.call(server, :governance_block)
  end

  @doc """
  Returns the audit log.
  """
  @spec audit_log(GenServer.server()) :: [AuditEntry.t()]
  def audit_log(server) do
    GenServer.call(server, :audit_log)
  end

  ## GenServer callbacks

  @impl true
  def init(opts) do
    session_id = Keyword.get(opts, :session_id, "unknown")
    governance_block = Keyword.get(opts, :governance_block)

    {:ok,
     %{
       session_id: session_id,
       governance_block: governance_block,
       cumulative_cost_usd: 0.0,
       audit_log: []
     }}
  end

  @impl true
  def handle_call({:validate, action}, _from, state) do
    case state.governance_block do
      nil ->
        {:reply, {:allow, []}, state}

      gov ->
        {result, state} = do_validate(action, gov, state)
        {:reply, result, state}
    end
  end

  @impl true
  def handle_call({:check_confidence_gate, coverage_assessment}, _from, state) do
    result = do_check_confidence_gate(coverage_assessment, state.governance_block)
    {:reply, result, state}
  end

  @impl true
  def handle_call({:record_cost, cost_usd}, _from, state) do
    new_total = state.cumulative_cost_usd + cost_usd
    state = %{state | cumulative_cost_usd: new_total}

    result = do_check_cost_gate(new_total, state.governance_block)
    {:reply, result, state}
  end

  @impl true
  def handle_call({:load_governance, governance_block}, _from, state) do
    {:reply, :ok, %{state | governance_block: governance_block}}
  end

  @impl true
  def handle_call(:governance_block, _from, state) do
    {:reply, state.governance_block, state}
  end

  @impl true
  def handle_call(:audit_log, _from, state) do
    {:reply, Enum.reverse(state.audit_log), state}
  end

  ## Internal logic

  defp do_validate(action, governance_block, state) do
    hard_violations = check_hard_constraints(action, Map.get(governance_block, :hard, []))
    soft_warnings = check_soft_constraints(action, Map.get(governance_block, :soft, []))

    escalation_triggers =
      check_escalation_rules(action, Map.get(governance_block, :escalate_when, %{}))

    cond do
      hard_violations != [] ->
        entry =
          AuditEntry.new(:contract_violated, state.session_id,
            metadata: %{violations: hard_violations, action: summarize_action(action)}
          )

        Logger.warning("[OS-008] Hard constraint violated: #{inspect(hard_violations)}")

        state = %{state | audit_log: [entry | state.audit_log]}
        {{:block, :hard_constraint_violation, hard_violations}, state}

      escalation_triggers != [] ->
        entry =
          AuditEntry.new(:confidence_gate_triggered, state.session_id,
            metadata: %{triggers: escalation_triggers, action: summarize_action(action)}
          )

        state = %{state | audit_log: [entry | state.audit_log]}
        {{:escalate, escalation_triggers}, state}

      true ->
        entry =
          AuditEntry.new(:contract_validated, state.session_id,
            metadata: %{warnings: soft_warnings, action: summarize_action(action)}
          )

        state = %{state | audit_log: [entry | state.audit_log]}
        {{:allow, soft_warnings}, state}
    end
  end

  defp check_hard_constraints(action, hard_constraints) do
    Enum.filter(hard_constraints, fn constraint ->
      violates_constraint?(action, constraint)
    end)
  end

  defp check_soft_constraints(action, soft_constraints) do
    soft_constraints
    |> Enum.filter(fn constraint -> violates_constraint?(action, constraint) end)
    |> Enum.map(fn constraint ->
      Map.get(constraint, :message, "Soft constraint overridden: #{inspect(constraint)}")
    end)
  end

  defp check_escalation_rules(_action, escalation_rules) when map_size(escalation_rules) == 0,
    do: []

  defp check_escalation_rules(action, escalation_rules) do
    triggers = []

    triggers =
      case Map.get(escalation_rules, :confidence_below) do
        nil ->
          triggers

        threshold ->
          confidence = Map.get(action, :confidence, 1.0)

          if confidence < threshold do
            [%{rule: :confidence_below, threshold: threshold, actual: confidence} | triggers]
          else
            triggers
          end
      end

    triggers =
      case Map.get(escalation_rules, :cost_exceeds_usd) do
        nil ->
          triggers

        limit ->
          cost = Map.get(action, :cost_usd, 0.0)

          if cost > limit do
            [%{rule: :cost_exceeds_usd, limit: limit, actual: cost} | triggers]
          else
            triggers
          end
      end

    triggers
  end

  defp violates_constraint?(action, constraint) do
    case Map.get(constraint, :check_fn) do
      nil ->
        # Match-based constraint: check if action fields violate
        check_field_constraint(action, constraint)

      check_fn when is_function(check_fn, 1) ->
        check_fn.(action) == :violation
    end
  end

  defp check_field_constraint(action, constraint) do
    case constraint do
      %{field: field, not_in: forbidden_values} ->
        Map.get(action, field) in forbidden_values

      %{field: field, must_be: required_value} ->
        Map.get(action, field) != required_value

      %{field: field, max: max_value} ->
        value = Map.get(action, field, 0)
        is_number(value) and value > max_value

      %{field: field, min: min_value} ->
        value = Map.get(action, field, 0)
        is_number(value) and value < min_value

      _ ->
        false
    end
  end

  defp do_check_confidence_gate(_coverage, nil), do: :ok

  defp do_check_confidence_gate(coverage_assessment, governance_block) do
    threshold =
      governance_block
      |> Map.get(:escalate_when, %{})
      |> Map.get(:confidence_below, 0.7)

    confidence = Map.get(coverage_assessment, :decision_confidence, 1.0)

    if confidence < threshold do
      {:escalate, :confidence_below_threshold, %{score: confidence, threshold: threshold}}
    else
      :ok
    end
  end

  defp do_check_cost_gate(_total, nil), do: :ok

  defp do_check_cost_gate(total, governance_block) do
    limit =
      governance_block
      |> Map.get(:escalate_when, %{})
      |> Map.get(:cost_exceeds_usd)

    if limit && total > limit do
      {:escalate, :cost_exceeds_budget, %{total: total, limit: limit}}
    else
      :ok
    end
  end

  defp summarize_action(action) when is_map(action) do
    Map.take(action, [:type, :tool, :target, :description])
  end

  defp summarize_action(action), do: %{raw: inspect(action)}
end
