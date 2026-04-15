defmodule OpenSentience.Harness.QualityGate do
  @moduledoc """
  OS-008 Quality Gate Engine — evaluator orchestrator.

  Grades sprint outputs against acceptance criteria using an isolated evaluator
  context. The evaluator never sees the generator's reasoning — only the sprint
  spec, acceptance criteria, and output artifacts.

  ## Tuning Parameters

  | Parameter             | Default | Rationale                                    |
  |-----------------------|---------|----------------------------------------------|
  | `pass_threshold`      | 1.0     | All criteria must pass. No partial credit.   |
  | `require_evidence`    | true    | Pass judgments must cite specific evidence.   |
  | `max_evaluation_time` | 120s    | Evaluators should only grade, not explore.   |
  | `adversarial_prompt`  | true    | System prompt emphasizes finding failures.    |
  | `separate_context`    | true    | Evaluator never sees generator reasoning.     |

  ## Iteration Loop

  Generator implements → evaluator grades → if fail, feedback to generator →
  repeat up to `max_iterations_per_sprint`. On max iterations → escalate.
  """

  use GenServer

  require Logger

  @default_config %{
    pass_threshold: 1.0,
    require_evidence: true,
    max_evaluation_time_ms: 120_000,
    adversarial_prompt: true,
    separate_context: true
  }

  @type criterion_result :: %{
          id: binary(),
          result: :pass | :fail,
          evidence: binary() | nil,
          feedback: binary() | nil
        }

  @type evaluation_result :: %{
          sprint_id: binary(),
          overall: :pass | :fail,
          criteria_results: [criterion_result()],
          iteration: non_neg_integer(),
          max_iterations: non_neg_integer(),
          evaluator_confidence: float()
        }

  @type state :: %{
          session_id: binary(),
          config: map(),
          evaluations: %{binary() => [evaluation_result()]}
        }

  ## Public API

  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opts \\ []) do
    name = Keyword.get(opts, :name)
    GenServer.start_link(__MODULE__, opts, name: name)
  end

  @doc """
  Grade a sprint's output against its acceptance criteria.

  Builds an isolated evaluator context (no generator history), evaluates each
  criterion, and returns a structured result.

  ## Parameters

    * `server` — the QualityGate process
    * `sprint_id` — identifier for the sprint being evaluated
    * `output_artifacts` — map of artifacts produced by the generator
    * `acceptance_criteria` — list of criteria maps with `:id` and `:description`

  ## Returns

    * `{:pass, evaluation_result}` — all criteria passed
    * `{:fail, evaluation_result}` — one or more criteria failed (includes feedback)

  """
  @spec grade(GenServer.server(), binary(), map(), [map()]) ::
          {:pass, evaluation_result()} | {:fail, evaluation_result()}
  def grade(server, sprint_id, output_artifacts, acceptance_criteria) do
    GenServer.call(server, {:grade, sprint_id, output_artifacts, acceptance_criteria}, 130_000)
  end

  @doc """
  Run the full iteration loop for a sprint.

  Calls the `generate_fn` to produce output, then grades it. If it fails,
  feeds back to the generator and retries up to `max_iterations`.

  ## Parameters

    * `server` — the QualityGate process
    * `sprint_id` — sprint identifier
    * `acceptance_criteria` — list of criteria
    * `generate_fn` — `(iteration, feedback | nil) -> {:ok, artifacts} | {:error, reason}`
    * `opts` — `:max_iterations` (default from tier config)

  ## Returns

    * `{:pass, evaluation_result, artifacts}` — sprint passed
    * `{:escalate, evaluations}` — max iterations reached, needs human intervention

  """
  @spec iterate(GenServer.server(), binary(), [map()], function(), keyword()) ::
          {:pass, evaluation_result(), map()} | {:escalate, [evaluation_result()]}
  def iterate(server, sprint_id, acceptance_criteria, generate_fn, opts \\ []) do
    GenServer.call(
      server,
      {:iterate, sprint_id, acceptance_criteria, generate_fn, opts},
      :infinity
    )
  end

  @doc """
  Returns all evaluations for a sprint.
  """
  @spec evaluations(GenServer.server(), binary()) :: [evaluation_result()]
  def evaluations(server, sprint_id) do
    GenServer.call(server, {:evaluations, sprint_id})
  end

  @doc """
  Returns the current configuration.
  """
  @spec config(GenServer.server()) :: map()
  def config(server) do
    GenServer.call(server, :config)
  end

  ## GenServer callbacks

  @impl true
  def init(opts) do
    session_id = Keyword.get(opts, :session_id, "unknown")
    user_config = Keyword.get(opts, :config, %{})

    {:ok,
     %{
       session_id: session_id,
       config: Map.merge(@default_config, user_config),
       evaluations: %{}
     }}
  end

  @impl true
  def handle_call({:grade, sprint_id, output_artifacts, acceptance_criteria}, _from, state) do
    iteration = current_iteration(state, sprint_id)

    evaluation = do_evaluate(sprint_id, output_artifacts, acceptance_criteria, iteration, state)

    state = record_evaluation(state, sprint_id, evaluation)

    emit_telemetry(state.session_id, sprint_id, evaluation)

    case evaluation.overall do
      :pass -> {:reply, {:pass, evaluation}, state}
      :fail -> {:reply, {:fail, evaluation}, state}
    end
  end

  @impl true
  def handle_call(
        {:iterate, sprint_id, acceptance_criteria, generate_fn, opts},
        _from,
        state
      ) do
    max_iterations = Keyword.get(opts, :max_iterations, 5)

    {result, state} =
      do_iterate(sprint_id, acceptance_criteria, generate_fn, max_iterations, 1, state)

    {:reply, result, state}
  end

  @impl true
  def handle_call({:evaluations, sprint_id}, _from, state) do
    evals = Map.get(state.evaluations, sprint_id, []) |> Enum.reverse()
    {:reply, evals, state}
  end

  @impl true
  def handle_call(:config, _from, state) do
    {:reply, state.config, state}
  end

  ## Internal logic

  defp do_iterate(sprint_id, _criteria, _generate_fn, max_iterations, iteration, state)
       when iteration > max_iterations do
    evals = Map.get(state.evaluations, sprint_id, []) |> Enum.reverse()

    Logger.warning(
      "[OS-008] Sprint #{sprint_id} reached max iterations (#{max_iterations}), escalating"
    )

    {{:escalate, evals}, state}
  end

  defp do_iterate(sprint_id, criteria, generate_fn, max_iterations, iteration, state) do
    # Get feedback from previous iteration (if any)
    feedback = last_feedback(state, sprint_id)

    case generate_fn.(iteration, feedback) do
      {:ok, artifacts} ->
        evaluation = do_evaluate(sprint_id, artifacts, criteria, iteration, state)
        state = record_evaluation(state, sprint_id, evaluation)
        emit_telemetry(state.session_id, sprint_id, evaluation)

        case evaluation.overall do
          :pass ->
            Logger.info("[OS-008] Sprint #{sprint_id} passed on iteration #{iteration}")
            {{:pass, evaluation, artifacts}, state}

          :fail ->
            Logger.info(
              "[OS-008] Sprint #{sprint_id} failed iteration #{iteration}/#{max_iterations}"
            )

            do_iterate(sprint_id, criteria, generate_fn, max_iterations, iteration + 1, state)
        end

      {:error, reason} ->
        Logger.error("[OS-008] Generator failed for sprint #{sprint_id}: #{inspect(reason)}")

        error_eval = %{
          sprint_id: sprint_id,
          overall: :fail,
          criteria_results: [],
          iteration: iteration,
          max_iterations: max_iterations,
          evaluator_confidence: 0.0
        }

        state = record_evaluation(state, sprint_id, error_eval)
        do_iterate(sprint_id, criteria, generate_fn, max_iterations, iteration + 1, state)
    end
  end

  defp do_evaluate(sprint_id, output_artifacts, acceptance_criteria, iteration, state) do
    criteria_results =
      Enum.map(acceptance_criteria, fn criterion ->
        evaluate_criterion(criterion, output_artifacts, state.config)
      end)

    all_pass = Enum.all?(criteria_results, fn r -> r.result == :pass end)
    pass_count = Enum.count(criteria_results, fn r -> r.result == :pass end)
    total = length(criteria_results)
    confidence = if total > 0, do: pass_count / total, else: 0.0

    %{
      sprint_id: sprint_id,
      overall: if(all_pass, do: :pass, else: :fail),
      criteria_results: criteria_results,
      iteration: iteration,
      max_iterations: 0,
      evaluator_confidence: confidence
    }
  end

  defp evaluate_criterion(criterion, output_artifacts, config) do
    # The actual evaluation logic depends on the evaluation strategy.
    # For now, this provides the structure — real evaluation will be done
    # by an external evaluator agent (spawned via OS-006 AgentLifecycle).
    #
    # The harness checks for:
    # 1. Does the artifact contain evidence matching the criterion?
    # 2. If require_evidence is true, is there specific evidence cited?

    criterion_id = Map.fetch!(criterion, :id)
    test_fn = Map.get(criterion, :test_fn)

    cond do
      # If the criterion has an executable test function, run it
      is_function(test_fn, 1) ->
        case test_fn.(output_artifacts) do
          {:pass, evidence} ->
            %{id: criterion_id, result: :pass, evidence: evidence, feedback: nil}

          {:fail, feedback} ->
            %{id: criterion_id, result: :fail, evidence: nil, feedback: feedback}

          true ->
            %{id: criterion_id, result: :pass, evidence: "test_fn returned true", feedback: nil}

          false ->
            %{
              id: criterion_id,
              result: :fail,
              evidence: nil,
              feedback: "Criterion test returned false"
            }
        end

      # If there's an evaluator_fn for external evaluation
      Map.has_key?(criterion, :evaluator_fn) ->
        criterion.evaluator_fn.(output_artifacts)

      # Default: criterion passes if the artifact key exists and is non-nil
      Map.has_key?(criterion, :artifact_key) ->
        key = criterion.artifact_key

        if Map.get(output_artifacts, key) do
          %{
            id: criterion_id,
            result: :pass,
            evidence: "Artifact #{key} present",
            feedback: nil
          }
        else
          %{
            id: criterion_id,
            result: :fail,
            evidence: nil,
            feedback: "Artifact #{key} missing or nil"
          }
        end

      # Fallback: mark as needing manual evaluation
      true ->
        if config.require_evidence do
          %{
            id: criterion_id,
            result: :fail,
            evidence: nil,
            feedback: "No evaluation strategy defined and evidence is required"
          }
        else
          %{
            id: criterion_id,
            result: :pass,
            evidence: "No evaluation strategy; auto-pass",
            feedback: nil
          }
        end
    end
  end

  defp current_iteration(state, sprint_id) do
    case Map.get(state.evaluations, sprint_id) do
      nil -> 1
      evals -> length(evals) + 1
    end
  end

  defp last_feedback(state, sprint_id) do
    case Map.get(state.evaluations, sprint_id) do
      nil ->
        nil

      [] ->
        nil

      [latest | _] ->
        failed = Enum.filter(latest.criteria_results, fn r -> r.result == :fail end)

        if failed == [] do
          nil
        else
          Enum.map(failed, fn r -> %{criterion_id: r.id, feedback: r.feedback} end)
        end
    end
  end

  defp record_evaluation(state, sprint_id, evaluation) do
    evals = Map.get(state.evaluations, sprint_id, [])
    %{state | evaluations: Map.put(state.evaluations, sprint_id, [evaluation | evals])}
  end

  defp emit_telemetry(session_id, sprint_id, evaluation) do
    :telemetry.execute(
      [:open_sentience, :harness, :quality_gate, :graded],
      %{system_time: System.system_time()},
      %{
        session_id: session_id,
        sprint_id: sprint_id,
        overall: evaluation.overall,
        iteration: evaluation.iteration,
        confidence: evaluation.evaluator_confidence
      }
    )
  end
end
