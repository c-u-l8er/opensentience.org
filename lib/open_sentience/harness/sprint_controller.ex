defmodule OpenSentience.Harness.SprintController do
  @moduledoc """
  OS-008 Sprint Controller — GenStateMachine managing the planner → generator →
  evaluator loop.

  ## Sprint Lifecycle States

      planned → generating → evaluating → passed → committed → completed
                                        ↘ feedback → generating (next iteration)
                                        ↘ escalated (max iterations)

  ## Sprint Contract

  Before each sprint begins, the controller produces a sprint contract — an
  explicit agreement between planner, generator, and evaluator containing
  acceptance criteria, budget constraints, and governance policy.
  """

  use GenServer

  require Logger

  alias OpenSentience.Harness.AuditEntry
  alias OpenSentience.Harness.TierAdapter

  @type sprint_state ::
          :idle
          | :planning
          | :planned
          | :generating
          | :evaluating
          | :passed
          | :feedback
          | :committed
          | :escalated
          | :completed

  @type sprint_contract :: %{
          sprint_id: binary(),
          task_id: binary(),
          description: binary(),
          acceptance_criteria: [map()],
          generator_constraints: map(),
          evaluator_constraints: map(),
          governance: map(),
          provenance: map()
        }

  @type sprint :: %{
          id: binary(),
          contract: sprint_contract() | nil,
          state: sprint_state(),
          iteration: non_neg_integer(),
          max_iterations: non_neg_integer(),
          evaluations: [map()],
          artifacts: map() | nil,
          started_at: DateTime.t() | nil,
          completed_at: DateTime.t() | nil
        }

  @type state :: %{
          session_id: binary(),
          task_id: binary(),
          model_tier: TierAdapter.tier(),
          sprints: [sprint()],
          current_sprint_index: non_neg_integer(),
          overall_state: :idle | :in_progress | :completed | :escalated | :failed,
          audit_log: [AuditEntry.t()]
        }

  ## Public API

  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opts \\ []) do
    name = Keyword.get(opts, :name)
    GenServer.start_link(__MODULE__, opts, name: name)
  end

  @doc """
  Load a task plan — a list of sprint specs produced by the planner.

  Each sprint spec should have: `:id`, `:description`, `:acceptance_criteria`.
  """
  @spec load_plan(GenServer.server(), binary(), [map()]) :: :ok
  def load_plan(server, task_id, sprint_specs) do
    GenServer.call(server, {:load_plan, task_id, sprint_specs})
  end

  @doc """
  Advance to the next sprint state.

  ## Events

    * `:start_generating` — begin generating (from :planned or :feedback)
    * `:submit_artifacts` — submit generator output for evaluation
    * `:evaluation_passed` — evaluator reports pass
    * `:evaluation_failed` — evaluator reports fail with feedback
    * `:commit` — commit sprint output
    * `:escalate` — escalate to human
    * `:complete` — mark overall task as completed

  """
  @spec transition(GenServer.server(), atom(), map()) ::
          {:ok, sprint_state()} | {:error, binary()}
  def transition(server, event, payload \\ %{}) do
    GenServer.call(server, {:transition, event, payload})
  end

  @doc """
  Returns the current sprint status.
  """
  @spec current_sprint(GenServer.server()) :: sprint() | nil
  def current_sprint(server) do
    GenServer.call(server, :current_sprint)
  end

  @doc """
  Returns the overall task status.
  """
  @spec status(GenServer.server()) :: map()
  def status(server) do
    GenServer.call(server, :status)
  end

  @doc """
  Returns the sprint contract for the current (or specified) sprint.
  """
  @spec sprint_contract(GenServer.server(), binary() | nil) :: sprint_contract() | nil
  def sprint_contract(server, sprint_id \\ nil) do
    GenServer.call(server, {:sprint_contract, sprint_id})
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
    model_tier = Keyword.get(opts, :model_tier, :cloud_frontier)

    {:ok,
     %{
       session_id: session_id,
       task_id: nil,
       model_tier: model_tier,
       sprints: [],
       current_sprint_index: 0,
       overall_state: :idle,
       audit_log: []
     }}
  end

  @impl true
  def handle_call({:load_plan, task_id, sprint_specs}, _from, state) do
    tier_config = TierAdapter.config_for(state.model_tier)
    max_sprints = tier_config.max_sprints_per_task
    max_iterations = tier_config.max_iterations_per_sprint

    # Truncate to tier limit
    specs = Enum.take(sprint_specs, max_sprints)

    sprints =
      Enum.map(specs, fn spec ->
        contract = build_contract(spec, task_id, tier_config, state)

        %{
          id: Map.fetch!(spec, :id),
          contract: contract,
          state: :planned,
          iteration: 0,
          max_iterations: max_iterations,
          evaluations: [],
          artifacts: nil,
          started_at: nil,
          completed_at: nil
        }
      end)

    entry =
      AuditEntry.new(:sprint_started, state.session_id,
        sprint_id: List.first(sprints) && List.first(sprints).id,
        metadata: %{task_id: task_id, sprint_count: length(sprints)}
      )

    state = %{
      state
      | task_id: task_id,
        sprints: sprints,
        current_sprint_index: 0,
        overall_state: :in_progress,
        audit_log: [entry | state.audit_log]
    }

    {:reply, :ok, state}
  end

  @impl true
  def handle_call({:transition, event, payload}, _from, state) do
    case do_transition(state, event, payload) do
      {:ok, new_sprint_state, state} ->
        {:reply, {:ok, new_sprint_state}, state}

      {:error, reason} ->
        {:reply, {:error, reason}, state}
    end
  end

  @impl true
  def handle_call(:current_sprint, _from, state) do
    sprint = get_current_sprint(state)
    {:reply, sprint, state}
  end

  @impl true
  def handle_call(:status, _from, state) do
    current = get_current_sprint(state)

    reply = %{
      session_id: state.session_id,
      task_id: state.task_id,
      model_tier: state.model_tier,
      overall_state: state.overall_state,
      total_sprints: length(state.sprints),
      current_sprint_index: state.current_sprint_index,
      current_sprint:
        current && %{id: current.id, state: current.state, iteration: current.iteration}
    }

    {:reply, reply, state}
  end

  @impl true
  def handle_call({:sprint_contract, nil}, _from, state) do
    sprint = get_current_sprint(state)
    {:reply, sprint && sprint.contract, state}
  end

  @impl true
  def handle_call({:sprint_contract, sprint_id}, _from, state) do
    sprint = Enum.find(state.sprints, fn s -> s.id == sprint_id end)
    {:reply, sprint && sprint.contract, state}
  end

  @impl true
  def handle_call(:audit_log, _from, state) do
    {:reply, Enum.reverse(state.audit_log), state}
  end

  ## State machine transitions

  defp do_transition(state, :start_generating, _payload) do
    with_current_sprint(state, fn sprint ->
      if sprint.state in [:planned, :feedback] do
        sprint = %{
          sprint
          | state: :generating,
            iteration: sprint.iteration + 1,
            started_at: sprint.started_at || DateTime.utc_now()
        }

        state = update_current_sprint(state, sprint)
        {:ok, :generating, state}
      else
        {:error, "Cannot start generating from state #{sprint.state}"}
      end
    end)
  end

  defp do_transition(state, :submit_artifacts, %{artifacts: artifacts}) do
    with_current_sprint(state, fn sprint ->
      if sprint.state == :generating do
        sprint = %{sprint | state: :evaluating, artifacts: artifacts}
        state = update_current_sprint(state, sprint)
        {:ok, :evaluating, state}
      else
        {:error, "Cannot submit artifacts from state #{sprint.state}"}
      end
    end)
  end

  defp do_transition(state, :evaluation_passed, %{evaluation: evaluation}) do
    with_current_sprint(state, fn sprint ->
      if sprint.state == :evaluating do
        sprint = %{
          sprint
          | state: :passed,
            evaluations: [evaluation | sprint.evaluations]
        }

        entry =
          AuditEntry.new(:sprint_passed, state.session_id,
            sprint_id: sprint.id,
            iteration: sprint.iteration,
            metadata: %{confidence: evaluation[:evaluator_confidence]}
          )

        state = update_current_sprint(state, sprint)
        state = %{state | audit_log: [entry | state.audit_log]}
        {:ok, :passed, state}
      else
        {:error, "Cannot mark as passed from state #{sprint.state}"}
      end
    end)
  end

  defp do_transition(state, :evaluation_failed, %{evaluation: evaluation}) do
    with_current_sprint(state, fn sprint ->
      if sprint.state == :evaluating do
        sprint = %{
          sprint
          | evaluations: [evaluation | sprint.evaluations]
        }

        if sprint.iteration >= sprint.max_iterations do
          sprint = %{sprint | state: :escalated}

          entry =
            AuditEntry.new(:sprint_escalated, state.session_id,
              sprint_id: sprint.id,
              iteration: sprint.iteration,
              metadata: %{max_iterations: sprint.max_iterations}
            )

          state = update_current_sprint(state, sprint)
          state = %{state | audit_log: [entry | state.audit_log]}

          Logger.warning(
            "[OS-008] Sprint #{sprint.id} escalated after #{sprint.iteration} iterations"
          )

          {:ok, :escalated, state}
        else
          sprint = %{sprint | state: :feedback}

          entry =
            AuditEntry.new(:sprint_failed, state.session_id,
              sprint_id: sprint.id,
              iteration: sprint.iteration,
              metadata: %{remaining: sprint.max_iterations - sprint.iteration}
            )

          state = update_current_sprint(state, sprint)
          state = %{state | audit_log: [entry | state.audit_log]}
          {:ok, :feedback, state}
        end
      else
        {:error, "Cannot evaluate from state #{sprint.state}"}
      end
    end)
  end

  defp do_transition(state, :commit, _payload) do
    with_current_sprint(state, fn sprint ->
      if sprint.state == :passed do
        sprint = %{sprint | state: :committed, completed_at: DateTime.utc_now()}
        state = update_current_sprint(state, sprint)

        # Advance to next sprint
        next_index = state.current_sprint_index + 1

        if next_index >= length(state.sprints) do
          state = %{state | overall_state: :completed}
          {:ok, :committed, state}
        else
          state = %{state | current_sprint_index: next_index}
          {:ok, :committed, state}
        end
      else
        {:error, "Cannot commit from state #{sprint.state}"}
      end
    end)
  end

  defp do_transition(state, :escalate, payload) do
    with_current_sprint(state, fn sprint ->
      sprint = %{sprint | state: :escalated}

      entry =
        AuditEntry.new(:sprint_escalated, state.session_id,
          sprint_id: sprint.id,
          metadata: Map.get(payload, :reason, %{})
        )

      state = update_current_sprint(state, sprint)
      state = %{state | overall_state: :escalated, audit_log: [entry | state.audit_log]}
      {:ok, :escalated, state}
    end)
  end

  defp do_transition(state, :complete, _payload) do
    all_committed =
      Enum.all?(state.sprints, fn s -> s.state in [:committed, :escalated] end)

    if all_committed or state.overall_state == :completed do
      state = %{state | overall_state: :completed}
      {:ok, :completed, state}
    else
      {:error, "Not all sprints are committed or escalated"}
    end
  end

  defp do_transition(_state, event, _payload) do
    {:error, "Unknown event: #{inspect(event)}"}
  end

  ## Helpers

  defp get_current_sprint(state) do
    Enum.at(state.sprints, state.current_sprint_index)
  end

  defp update_current_sprint(state, sprint) do
    sprints = List.replace_at(state.sprints, state.current_sprint_index, sprint)
    %{state | sprints: sprints}
  end

  defp with_current_sprint(state, fun) do
    case get_current_sprint(state) do
      nil -> {:error, "No current sprint"}
      sprint -> fun.(sprint)
    end
  end

  defp build_contract(spec, task_id, tier_config, state) do
    %{
      sprint_id: Map.fetch!(spec, :id),
      task_id: task_id,
      description: Map.get(spec, :description, ""),
      acceptance_criteria: Map.get(spec, :acceptance_criteria, []),
      generator_constraints: %{
        max_iterations: tier_config.max_iterations_per_sprint,
        must_retrieve_before_generating: true,
        must_commit_after_implementation: true
      },
      evaluator_constraints: %{
        max_evaluation_time_seconds: 120,
        separate_context: tier_config.separate_evaluator_context,
        adversarial_tuning: tier_config.evaluator_enabled,
        evidence_required: true
      },
      governance: %{},
      provenance: %{
        session_id: state.session_id,
        model_tier: state.model_tier
      }
    }
  end
end
