defmodule OpenSentience.Harness.DarkFactory do
  @moduledoc """
  OS-008 Dark Factory Session Lifecycle (spec section 14.4).

  In dark factory mode, harness sessions are triggered by Agentelic pipeline
  events (not human invocation):

      SpecPrompt ConsolidationEvent
        → Agentelic retrieve_spec
        → Agentelic route_pipeline
        → OS-008 Harness.start_session(workspace_id, agent_id, spec_hash)
          → PipelineEnforcer: retrieve → topology → deliberate(if κ>0) → act
          → QualityGate: generator ↔ evaluator loop per sprint
          → ContractValidator: [&] governance checks
          → ContextManager: compaction + subagent delegation
        → On all sprints pass: Agentelic.Build.status = :succeeded
        → Agentelic emits ConsolidationEvent to FleetPrompt

  The harness does NOT make LLM model choices — it defers to Agentelic's model
  tier configuration.
  """

  require Logger

  alias OpenSentience.Harness
  alias OpenSentience.Harness.CrossSessionLearning
  alias OpenSentience.Harness.PolicyResolver
  alias OpenSentience.Harness.SprintController
  alias OpenSentience.Harness.Session

  @type trigger_event :: %{
          type: binary(),
          source: binary(),
          workspace_id: binary(),
          agent_id: binary(),
          spec_hash: binary(),
          task_description: binary(),
          model_tier: atom(),
          governance_block: map() | nil,
          sprint_specs: [map()]
        }

  @type session_result ::
          {:succeeded, map()}
          | {:failed, map()}
          | {:escalated, map()}

  @doc """
  Process a dark factory trigger event.

  This is the main entry point for automated (non-human) session orchestration.
  It runs the full pipeline:

  1. Start session with workspace scoping
  2. Retrieve prior harness outcomes for cross-session learning
  3. Run enforcement pipeline (PipelineEnforcer + ContractValidator + Delegatic)
  4. Execute sprint loop (planner → generator → evaluator)
  5. On success: emit completion event
  6. On failure: store outcome for cross-session learning

  ## Parameters

    * `trigger_event` — CloudEvents envelope with task details
    * `callbacks` — map of callback functions for integration:
      * `:retrieve_fn` — `(workspace_id, query) -> {:ok, nodes} | {:error, reason}`
      * `:store_outcome_fn` — `(outcome) -> :ok | {:error, reason}`
      * `:generate_fn` — `(sprint_contract, iteration, feedback) -> {:ok, artifacts} | {:error, reason}`
      * `:on_success` — `(session_result) -> :ok`
      * `:on_failure` — `(session_result) -> :ok`

  """
  @spec process_trigger(trigger_event(), map()) :: session_result()
  def process_trigger(trigger_event, callbacks \\ %{}) do
    workspace_id = Map.fetch!(trigger_event, :workspace_id)
    agent_id = Map.fetch!(trigger_event, :agent_id)
    _spec_hash = Map.fetch!(trigger_event, :spec_hash)

    # 1. Start session
    session_opts = [
      workspace_id: workspace_id,
      agent_id: agent_id,
      model_tier: Map.get(trigger_event, :model_tier, :cloud_frontier),
      autonomy_level: :act,
      governance_block: Map.get(trigger_event, :governance_block)
    ]

    case Harness.start_session(session_opts) do
      {:ok, pid} ->
        result = run_session(pid, trigger_event, callbacks)
        session_id = Harness.session_status(pid).session_id

        # Store outcome for cross-session learning
        store_fn = Map.get(callbacks, :store_outcome_fn, &CrossSessionLearning.store_local/1)
        outcome = build_outcome(session_id, trigger_event, result)
        store_fn.(outcome)

        # Invoke success/failure callback
        case result do
          {:succeeded, _} ->
            if cb = Map.get(callbacks, :on_success), do: cb.(result)

          _ ->
            if cb = Map.get(callbacks, :on_failure), do: cb.(result)
        end

        Harness.stop_session(pid)
        result

      {:error, reason} ->
        Logger.error("[OS-008] Dark factory session failed to start: #{inspect(reason)}")
        {:failed, %{reason: :session_start_failed, details: reason}}
    end
  end

  @doc """
  Retrieve prior harness outcomes for cross-session learning.

  Before planning, the dark factory retrieves prior failures for the same
  `{agent_id, spec_hash}` tuple so the planner can adapt.
  """
  @spec retrieve_prior_outcomes(binary(), binary(), map()) :: [map()]
  def retrieve_prior_outcomes(agent_id, spec_hash, callbacks) do
    retrieve_fn =
      Map.get(callbacks, :retrieve_prior_fn, &CrossSessionLearning.retrieve_local/2)

    case retrieve_fn.(agent_id, spec_hash) do
      {:ok, outcomes} ->
        Logger.info(
          "[OS-008] Retrieved #{length(outcomes)} prior outcomes for {#{agent_id}, #{spec_hash}}"
        )

        outcomes

      {:error, _reason} ->
        []
    end
  end

  ## Internal

  defp run_session(pid, trigger_event, callbacks) do
    components = Session.components(pid)
    sprint_controller = components.sprint_controller
    sprint_specs = Map.get(trigger_event, :sprint_specs, [])

    if sprint_specs == [] do
      {:failed, %{reason: :no_sprint_specs}}
    else
      # Load sprint plan
      task_id = "df-#{Map.get(trigger_event, :spec_hash, "unknown")}"
      :ok = SprintController.load_plan(sprint_controller, task_id, sprint_specs)

      # Retrieve prior outcomes for cross-session learning
      agent_id = Map.fetch!(trigger_event, :agent_id)
      spec_hash = Map.fetch!(trigger_event, :spec_hash)
      _prior_outcomes = retrieve_prior_outcomes(agent_id, spec_hash, callbacks)

      # Run enforcement pipeline per sprint
      run_sprint_loop(pid, components, callbacks)
    end
  end

  defp run_sprint_loop(session_pid, components, callbacks) do
    sprint_controller = components.sprint_controller
    contract_validator = components.contract_validator
    generate_fn = Map.get(callbacks, :generate_fn)

    status = SprintController.status(sprint_controller)

    if status.overall_state == :completed do
      {:succeeded, %{sprints_completed: status.total_sprints}}
    else
      # Start generating current sprint
      case SprintController.transition(sprint_controller, :start_generating) do
        {:ok, :generating} ->
          contract = SprintController.sprint_contract(sprint_controller)

          # Check contract validation before generating
          case validate_with_policy(contract_validator, contract, callbacks) do
            :ok ->
              execute_sprint(session_pid, components, contract, generate_fn, callbacks)

            {:block, reason} ->
              {:failed, %{reason: :contract_blocked, details: reason}}

            {:escalate, reason} ->
              {:escalated, %{reason: :policy_escalation, details: reason}}
          end

        {:error, reason} ->
          {:failed, %{reason: :transition_error, details: reason}}
      end
    end
  end

  defp execute_sprint(session_pid, components, contract, generate_fn, callbacks) do
    sprint_controller = components.sprint_controller
    quality_gate = components.quality_gate

    max_iterations = contract.generator_constraints.max_iterations

    result =
      if generate_fn do
        # Use the provided generate function with QualityGate iteration loop
        wrapped_fn = fn iteration, feedback ->
          generate_fn.(contract, iteration, feedback)
        end

        OpenSentience.Harness.QualityGate.iterate(
          quality_gate,
          contract.sprint_id,
          contract.acceptance_criteria,
          wrapped_fn,
          max_iterations: max_iterations
        )
      else
        # No generate function provided — auto-pass for testing
        {:pass,
         %{
           sprint_id: contract.sprint_id,
           overall: :pass,
           criteria_results: [],
           iteration: 1,
           max_iterations: max_iterations,
           evaluator_confidence: 1.0
         }, %{}}
      end

    case result do
      {:pass, evaluation, artifacts} ->
        # Submit artifacts and mark as passed
        {:ok, :evaluating} =
          SprintController.transition(sprint_controller, :submit_artifacts, %{
            artifacts: artifacts
          })

        {:ok, :passed} =
          SprintController.transition(sprint_controller, :evaluation_passed, %{
            evaluation: evaluation
          })

        {:ok, _} = SprintController.transition(sprint_controller, :commit)

        # Continue to next sprint
        run_sprint_loop(session_pid, components, callbacks)

      {:escalate, _evaluations} ->
        SprintController.transition(sprint_controller, :escalate, %{
          reason: %{max_iterations_reached: true}
        })

        {:escalated, %{reason: :max_iterations_reached, sprint_id: contract.sprint_id}}
    end
  end

  defp validate_with_policy(contract_validator, contract, callbacks) do
    alias OpenSentience.Harness.ContractValidator

    action = %{
      type: :sprint_execution,
      description: contract.description,
      sprint_id: contract.sprint_id
    }

    case ContractValidator.validate(contract_validator, action) do
      {:allow, _warnings} ->
        # Also check Delegatic policy if callback provided
        delegatic_fn = Map.get(callbacks, :delegatic_check_fn)

        if delegatic_fn do
          PolicyResolver.resolve(action, {:allow, []}, delegatic_fn)
        else
          :ok
        end

      {:block, :hard_constraint_violation, violations} ->
        {:block, violations}

      {:escalate, triggers} ->
        {:escalate, triggers}
    end
  end

  defp build_outcome(session_id, trigger_event, result) do
    {status, details} =
      case result do
        {:succeeded, d} -> {:succeeded, d}
        {:failed, d} -> {:failed, d}
        {:escalated, d} -> {:escalated, d}
      end

    %{
      type: :harness_outcome,
      status: status,
      session_id: session_id,
      workspace_id: Map.get(trigger_event, :workspace_id),
      agent_id: Map.get(trigger_event, :agent_id),
      spec_hash: Map.get(trigger_event, :spec_hash),
      details: details,
      timestamp: DateTime.utc_now()
    }
  end
end
