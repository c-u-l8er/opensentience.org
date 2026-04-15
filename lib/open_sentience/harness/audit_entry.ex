defmodule OpenSentience.Harness.AuditEntry do
  @moduledoc """
  Extended audit entry with provenance fields for OS-008 harness events.

  Every harness action generates an audit entry linking what knowledge informed
  the action (Graphonomous node IDs), what goal it serves, what policy governed
  it, and how confident the system was.
  """

  @type event_type ::
          :pipeline_stage_completed
          | :pipeline_stage_blocked
          | :sprint_started
          | :sprint_passed
          | :sprint_failed
          | :sprint_escalated
          | :quality_gate_graded
          | :contract_validated
          | :contract_violated
          | :confidence_gate_triggered
          | :context_compacted
          | :subagent_delegated
          | :harness_session_started
          | :harness_session_completed

  @type t :: %__MODULE__{
          event_type: event_type(),
          session_id: binary(),
          sprint_id: binary() | nil,
          goal_id: binary() | nil,
          tool_name: atom() | nil,
          timestamp: DateTime.t(),
          retrieval_context_ids: [binary()],
          coverage_assessment: map() | nil,
          causal_node_ids: [binary()],
          iteration: non_neg_integer() | nil,
          evaluator_agent_id: binary() | nil,
          delegatic_policy_id: binary() | nil,
          workspace_id: binary() | nil,
          metadata: map()
        }

  @enforce_keys [:event_type, :session_id, :timestamp]
  defstruct [
    :event_type,
    :session_id,
    :sprint_id,
    :goal_id,
    :tool_name,
    :timestamp,
    :evaluator_agent_id,
    :delegatic_policy_id,
    :workspace_id,
    :iteration,
    retrieval_context_ids: [],
    coverage_assessment: nil,
    causal_node_ids: [],
    metadata: %{}
  ]

  @doc """
  Creates a new audit entry with the current UTC timestamp.

  ## Options

    * `:tool_name` — the tool involved
    * `:sprint_id` — current sprint ID
    * `:goal_id` — Delegatic goal ID
    * `:workspace_id` — workspace scope
    * `:retrieval_context_ids` — Graphonomous node IDs that informed the action
    * `:coverage_assessment` — coverage decision map
    * `:causal_node_ids` — causal provenance chain
    * `:iteration` — sprint iteration number
    * `:evaluator_agent_id` — evaluator agent for quality gate events
    * `:delegatic_policy_id` — governing policy ID
    * `:metadata` — additional context

  """
  @spec new(event_type(), binary(), keyword()) :: t()
  def new(event_type, session_id, opts \\ []) do
    %__MODULE__{
      event_type: event_type,
      session_id: session_id,
      timestamp: DateTime.utc_now(),
      tool_name: Keyword.get(opts, :tool_name),
      sprint_id: Keyword.get(opts, :sprint_id),
      goal_id: Keyword.get(opts, :goal_id),
      workspace_id: Keyword.get(opts, :workspace_id),
      retrieval_context_ids: Keyword.get(opts, :retrieval_context_ids, []),
      coverage_assessment: Keyword.get(opts, :coverage_assessment),
      causal_node_ids: Keyword.get(opts, :causal_node_ids, []),
      iteration: Keyword.get(opts, :iteration),
      evaluator_agent_id: Keyword.get(opts, :evaluator_agent_id),
      delegatic_policy_id: Keyword.get(opts, :delegatic_policy_id),
      metadata: Keyword.get(opts, :metadata, %{})
    }
  end
end
