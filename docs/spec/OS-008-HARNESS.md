# OS-008: Agent Harness Protocol

**Status:** Draft
**Implements:** `&govern.harness` (orchestration enforcement subsystem)
**Reference Implementation:** OpenSentience harness module (planned)
**Cognitive Grounding:** Supervisory attentional system — Norman & Shallice (1986)
**Date:** March 31, 2026
**Author:** [&] Ampersand Box Design
**Version:** 0.1.0
**Depends on:** OS-001 (Continual Learning), OS-002 (κ-Routing), OS-004 (Attention Engine), OS-005 (Model Tier Adaptation), OS-006 (Agent Governance Shim), OS-007 (Adversarial Robustness)

---

## 0. The One-Sentence Idea

**The Harness Protocol is the enforcement runtime that sits above agents and below humans — it orchestrates the [&] pipelines, enforces governance contracts, gates execution on epistemic confidence, and ensures that no agent skips retrieval, fabricates provenance, or acts beyond its coverage.**

---

## 1. Why This Exists (The Enforcement Gap)

The [&] ecosystem has complete cognitive infrastructure:

| Capability | Protocol | Implementation | Limitation |
|-----------|----------|----------------|------------|
| **Remember** — persistent knowledge graph | OS-001 | Graphonomous | Agent chooses when to call it |
| **Route** — topology-aware κ gating | OS-002 | Graphonomous | Agent can skip topology check |
| **Deliberate** — multi-agent consensus | OS-003 | AgenTroMatic | Agent can ignore deliberation result |
| **Attend** — proactive survey/triage/dispatch | OS-004 | Graphonomous Attention | Agent can override dispatch mode |
| **Adapt** — model tier selection | OS-005 | Graphonomous/Agentelic | Agent can request wrong tier |
| **Govern** — permissions, lifecycle, audit | OS-006 | OpenSentience shim | Enforces permissions, not pipelines |
| **Defend** — adversarial robustness | OS-007 | Planned | Detects attacks, doesn't enforce workflow |

Every piece is advisory. Nothing enforces the composition. The governance shim (OS-006) enforces **permissions** (can this agent call this tool?) but not **pipelines** (did this agent retrieve before acting? did it check coverage before dispatching? did it store its outcome?).

The industry has converged on the same insight. Anthropic's harness research (2026) demonstrated that separating generation from evaluation — and having an external orchestrator enforce the loop — was the difference between non-functional output and working software. OpenAI's Codex harness engineering showed that mechanical invariants in CI outperform prompt-based instructions. The formal finding: **the agent model is not the bottleneck; the harness is.**

### 1.1 What a Harness Is (and Is Not)

A harness is **not** a tool the agent calls. It is the runtime that **calls the agent**.

| Layer | Position | Controls | Example |
|-------|----------|----------|---------|
| **Harness** | Above agent | Agent lifecycle, pipeline sequencing, quality gates | OS-008 (this protocol) |
| **Governance** | At agent boundary | Permissions, audit, autonomy levels | OS-006 |
| **Tools** | Below agent | Memory, reasoning, deliberation | Graphonomous MCP, AgenTroMatic |

The harness wraps agents like a supervisor wraps processes — it doesn't do the work, it ensures the work is done correctly.

### 1.2 Cognitive Science Grounding

Norman & Shallice's Supervisory Attentional System (SAS, 1986) proposes that routine behavior is managed by "contention scheduling" (automatic, schema-driven) while novel or dangerous situations require a supervisory system that can override, inhibit, or redirect automatic routines.

OS-008 maps this directly:
- **Contention scheduling** = the reactive pipeline (`query |> recall |> topology |> deliberate |> store`). Runs automatically.
- **Supervisory system** = the harness. Intervenes when coverage is low, confidence drops, constraints are violated, or quality gates fail.

The SAS is not the attention system (OS-004) — it is the system that **governs** the attention system. OS-004 decides *what* to attend to. OS-008 ensures the attention system's decisions are *followed through*.

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        OS-008: HARNESS                           │
│                                                                  │
│   ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐  │
│   │  Pipeline         │  │  Quality Gate    │  │  Contract    │  │
│   │  Enforcer         │  │  Engine          │  │  Validator   │  │
│   │                   │  │                  │  │              │  │
│   │  Ensures pipeline │  │  Evaluator role. │  │  Validates   │  │
│   │  stages execute   │  │  Grades agent    │  │  [&] govern  │  │
│   │  in order. Blocks │  │  outputs against │  │  blocks at   │  │
│   │  act without      │  │  acceptance      │  │  composition │  │
│   │  retrieve.        │  │  criteria.       │  │  + runtime.  │  │
│   └──────┬───────────┘  └──────┬───────────┘  └──────┬───────┘  │
│          │                     │                      │          │
│   ┌──────▼─────────────────────▼──────────────────────▼───────┐  │
│   │              Sprint Controller                             │  │
│   │                                                            │  │
│   │  Decomposes work into bounded sprints with acceptance      │  │
│   │  criteria. Routes between planner/generator/evaluator.     │  │
│   │  Loops on quality gate failure. Commits on pass.           │  │
│   └────────────────────────┬───────────────────────────────────┘  │
│                            │                                     │
│   ┌────────────────────────▼───────────────────────────────────┐  │
│   │              Context Manager                                │  │
│   │                                                            │  │
│   │  Monitors context utilization. Triggers compaction at 60%. │  │
│   │  Manages subagent delegation. Filesystem-based overflow.   │  │
│   │  Injects Graphonomous retrieval into fresh contexts.       │  │
│   └────────────────────────────────────────────────────────────┘  │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│   Integrations                                                   │
│   ├── OS-006 (permissions + lifecycle + audit)                   │
│   ├── Graphonomous (retrieve, store, coverage, attention)        │
│   ├── Delegatic (policy source)                                  │
│   ├── [&] Protocol (governance block contracts)                  │
│   └── SpecPrompt (acceptance criteria source)                    │
└──────────────────────────────────────────────────────────────────┘
```

### 2.1 OTP Supervision Tree

```
OpenSentience.Application
├── ... (existing OS-006 components)
├── OpenSentience.Harness.Supervisor (DynamicSupervisor)
│   ├── OpenSentience.Harness.Session ("session-001")
│   │   ├── OpenSentience.Harness.PipelineEnforcer
│   │   ├── OpenSentience.Harness.QualityGate
│   │   ├── OpenSentience.Harness.ContractValidator
│   │   ├── OpenSentience.Harness.SprintController
│   │   └── OpenSentience.Harness.ContextManager
│   ├── OpenSentience.Harness.Session ("session-002")
│   │   └── ...
│   └── ...
└── OpenSentience.Harness.Telemetry
```

Each `Harness.Session` supervises one orchestrated task — a bounded unit of work with a goal, acceptance criteria, and a pipeline to execute. Sessions are independent and concurrent.

### 2.2 Component Summary

| Component | Responsibility | OTP Pattern |
|-----------|---------------|-------------|
| `Harness.PipelineEnforcer` | Ensures pipeline stages execute in order. Blocks tool calls that violate prerequisites. | GenServer with stage state machine |
| `Harness.QualityGate` | Evaluator agent. Grades outputs against acceptance criteria. Returns pass/fail with actionable feedback. | GenServer spawning evaluator agent |
| `Harness.ContractValidator` | Validates [&] governance blocks at composition and runtime. Enforces hard constraints, routes soft constraints. | GenServer + ETS |
| `Harness.SprintController` | Decomposes tasks into sprints. Routes between planner/generator/evaluator roles. Manages iteration loops. | GenStateMachine |
| `Harness.ContextManager` | Monitors context window utilization. Triggers compaction. Manages subagent delegation. Injects retrieval. | GenServer |

---

## 3. The Two Enforced Pipelines

OS-008 enforces the two [&] Protocol pipelines as mandatory sequences — not suggestions.

### 3.1 Reactive Pipeline (Query-Triggered)

```
query
  |> &memory.graph.recall()        # STAGE 1: Retrieve (MANDATORY)
  |> &memory.graph.topology()      # STAGE 2: Topology analysis
  |> &reason.deliberate(budget: :κ) # STAGE 3: Deliberate (if κ > 0)
  |> &memory.graph.store()         # STAGE 4: Store outcomes (MANDATORY)
```

**Enforcement rules:**

| Rule | Constraint | Enforcement |
|------|-----------|-------------|
| **Retrieve-before-act** | Stage 1 MUST complete before any tool call that modifies state | PipelineEnforcer blocks write-class tool calls until retrieval completes |
| **Topology-before-deliberate** | Stage 2 MUST complete before Stage 3 | PipelineEnforcer sequences stages |
| **κ-gated deliberation** | Stage 3 is skipped if κ = 0 (DAG) | PipelineEnforcer checks topology result |
| **Mandatory outcome storage** | Stage 4 MUST execute after any action | PipelineEnforcer blocks session completion without store |

### 3.2 Proactive Pipeline (Heartbeat-Triggered)

```
heartbeat
  |> &reason.attend.survey()    # STAGE 1: Survey active goals + coverage
  |> &reason.attend.triage()    # STAGE 2: Rank by urgency/gap/κ/surprise
  |> &reason.attend.dispatch()  # STAGE 3: Route to handler
  |> &memory.graph.store()      # STAGE 4: Store outcomes
```

**Enforcement rules:**

| Rule | Constraint | Enforcement |
|------|-----------|-------------|
| **Heartbeat cadence** | Proactive pipeline runs on `governance.autonomy.heartbeat_seconds` | Harness timer, not agent initiative |
| **Coverage-gated dispatch** | Dispatch mode determined by `Coverage.recommend/2`, not agent preference | PipelineEnforcer injects coverage result |
| **Autonomy-gated execution** | Execution filtered by autonomy level (observe/advise/act) | PipelineEnforcer enforces OS-006 autonomy |
| **Budget enforcement** | Per-cycle limits (max_items, max_explore, max_actions) from model tier | PipelineEnforcer tracks budget consumption |

### 3.3 The Coverage → Dispatch Routing Matrix

The harness enforces this routing matrix. Agents cannot override it.

```
coverage.decision    κ value    autonomy    → dispatch_mode
─────────────────    ───────    ─────────   ─────────────────
:escalate            any        any         → :escalate (always)
:learn               < 0.45    any         → :explore
:learn               ≥ 0.45    any         → :focus (deliberate)
:act                 > 0        any         → :focus (κ-driven)
:act                 = 0        :act        → :act
:act                 = 0        :advise     → :deferred (needs approval)
:act                 = 0        :observe    → :log (no action)
none + gap > 0.3     any        :act        → :propose
none + gap > 0.3     any        other       → :deferred
none + gap ≤ 0.3     any        any         → :idle (consolidate)
```

---

## 4. The Three Agent Roles

OS-008 defines three agent roles within a harness session. These are not separate agent types — they are **capability contracts** that any agent may satisfy. An agent's role determines what [&] capabilities it may invoke during its turn.

### 4.1 Planner Role

**[&] Capability Contract:** `&reason.plan`

```json
{
  "capability": "&reason.plan",
  "operations": {
    "decompose": { "in": "task_description", "out": "sprint_spec" },
    "criteria":  { "in": "sprint_spec",      "out": "acceptance_criteria" }
  },
  "accepts_from": ["&memory.graph", "context", "spec"],
  "feeds_into":   ["&reason.generate", "&memory.graph"],
  "governance": {
    "must_retrieve_before_planning": true,
    "max_sprints_per_task": 10
  }
}
```

The planner:
1. Receives a task description (from user or upstream goal)
2. Retrieves relevant context from Graphonomous (enforced)
3. Decomposes the task into bounded sprints
4. For each sprint, produces acceptance criteria (measurable, testable)
5. Stores the plan in Graphonomous as procedural knowledge

**Planner output schema:**

```json
{
  "sprints": [
    {
      "id": "sprint-001",
      "description": "Implement user authentication flow",
      "acceptance_criteria": [
        {"id": "ac-001", "description": "Login form renders with email and password fields", "testable": true},
        {"id": "ac-002", "description": "Supabase auth session persists across page reload", "testable": true}
      ],
      "estimated_complexity": "medium",
      "depends_on": []
    }
  ],
  "retrieval_context_id": "node-abc123",
  "coverage_assessment": { "decision": "act", "coverage_score": 0.78 }
}
```

### 4.2 Generator Role

**[&] Capability Contract:** `&reason.generate`

```json
{
  "capability": "&reason.generate",
  "operations": {
    "implement": { "in": "sprint_spec",       "out": "implementation" },
    "iterate":   { "in": "evaluator_feedback", "out": "revised_implementation" }
  },
  "accepts_from": ["&reason.plan", "&memory.graph", "evaluator_feedback"],
  "feeds_into":   ["&reason.evaluate", "&memory.graph"],
  "governance": {
    "must_retrieve_before_generating": true,
    "must_commit_after_sprint": true,
    "max_iterations_per_sprint": 5
  }
}
```

The generator:
1. Receives a sprint spec with acceptance criteria
2. Retrieves relevant context from Graphonomous (enforced)
3. Implements the sprint
4. Commits changes (git or equivalent)
5. Passes output to evaluator
6. If evaluator returns failure, receives specific feedback and iterates (up to `max_iterations_per_sprint`)
7. Stores outcomes via `learn_from_outcome` (enforced)

### 4.3 Evaluator Role

**[&] Capability Contract:** `&reason.evaluate`

```json
{
  "capability": "&reason.evaluate",
  "operations": {
    "grade":    { "in": "implementation",      "out": "evaluation_result" },
    "verify":   { "in": "acceptance_criteria",  "out": "verification_report" }
  },
  "accepts_from": ["&reason.generate", "&reason.plan", "runtime_state"],
  "feeds_into":   ["&reason.generate", "&memory.graph", "output"],
  "governance": {
    "must_be_adversarial": true,
    "must_grade_against_criteria": true,
    "must_not_share_context_with_generator": true
  }
}
```

The evaluator:
1. Receives the generator's output AND the planner's acceptance criteria
2. Operates in a **separate context window** from the generator (enforced — this is the key insight from Anthropic's research: self-evaluation consistently over-praises)
3. Grades each acceptance criterion as pass/fail with specific rationale
4. If any criterion fails, returns actionable feedback (not vague criticism)
5. Does not investigate or explore — only grades against criteria
6. Stores evaluation results in Graphonomous for confidence calibration

**Evaluation result schema:**

```json
{
  "sprint_id": "sprint-001",
  "overall": "fail",
  "criteria_results": [
    {"id": "ac-001", "result": "pass", "evidence": "Login form renders correctly at /login"},
    {"id": "ac-002", "result": "fail", "feedback": "Session token is stored but not checked on reload — add useEffect check in App.tsx"}
  ],
  "iteration": 1,
  "max_iterations": 5,
  "evaluator_confidence": 0.85
}
```

### 4.4 Why Separate Contexts Matter

Anthropic's research demonstrated that when a generator evaluates its own work, it consistently produces over-praising ("the code looks great, all tests pass") even when the output is non-functional. The generator has sunk-cost bias toward its own decisions.

OS-008 enforces this separation:
- The evaluator gets a **fresh context** containing only: the sprint spec, acceptance criteria, and the generator's output artifacts
- The evaluator does NOT see the generator's reasoning, planning context, or prior iterations
- The evaluator is tuned toward skepticism — it must find specific evidence for each criterion, not infer correctness

This maps to the cognitive science concept of **metacognitive monitoring** — the brain's ability to evaluate its own cognitive processes is separate from the processes themselves (Flavell, 1979). OS-008 makes this separation architectural.

---

## 5. Pipeline Enforcement (Prerequisites)

The PipelineEnforcer implements a **prerequisite constraint model** — the key missing piece identified in the OS-006 gap analysis.

### 5.1 Prerequisite Rules

```elixir
@prerequisites %{
  # Before any state-modifying tool call, retrieval must have occurred
  {:any, :write} => [{:completed, :retrieve_context}],

  # Before deliberation, topology must be analyzed
  {:call, :deliberate} => [{:completed, :topology_analyze}],

  # Before acting on coverage decision, coverage must be assessed
  {:call, :execute_action} => [{:completed, :coverage_query}],

  # Before storing outcome, action must have been taken
  {:call, :learn_from_outcome} => [{:completed, :execute_action}],

  # Before session completion, outcomes must be stored
  {:session, :complete} => [{:completed, :store_node}],

  # Before sprint advancement, quality gate must pass
  {:sprint, :advance} => [{:completed, :quality_gate, result: :pass}]
}
```

### 5.2 Enforcement Mechanism

The PipelineEnforcer wraps MCP tool dispatch:

```elixir
defmodule OpenSentience.Harness.PipelineEnforcer do
  use GenServer

  @type stage :: :idle | :retrieving | :analyzing | :deliberating | :acting | :storing

  defstruct [
    :session_id,
    :current_stage,
    :completed_stages,
    :prerequisites,
    :violations
  ]

  @doc """
  Called before every MCP tool invocation within a harness session.
  Returns {:allow, state} or {:block, reason, state}.
  """
  def check_prerequisite(state, tool_name, tool_args) do
    required = Map.get(state.prerequisites, tool_key(tool_name), [])

    missing = Enum.reject(required, fn {status, stage} ->
      MapSet.member?(state.completed_stages, {stage, status})
    end)

    case missing do
      [] ->
        {:allow, state}

      missing_list ->
        violation = %{
          tool: tool_name,
          missing_prerequisites: missing_list,
          timestamp: DateTime.utc_now(),
          session_id: state.session_id
        }

        state = %{state | violations: [violation | state.violations]}
        {:block, "Prerequisites not met: #{inspect(missing_list)}", state}
    end
  end
end
```

### 5.3 Integration with OS-006

The PipelineEnforcer operates **above** OS-006's permission checks:

```
Agent requests tool call
  │
  ▼
OS-008 PipelineEnforcer: Are prerequisites met?
  │ NO → Block with reason + audit log
  │ YES ↓
  ▼
OS-006 PermissionEngine: Does the agent have permission?
  │ NO → Block with audit log
  │ YES ↓
  ▼
Tool executes
  │
  ▼
OS-008 PipelineEnforcer: Update stage state
OS-006 AuditWriter: Log execution
```

---

## 6. Quality Gate Engine

The QualityGate is the evaluator orchestrator. It manages evaluator agent lifecycle, grades outputs, and controls the generator iteration loop.

### 6.1 Grading Process

```elixir
defmodule OpenSentience.Harness.QualityGate do
  use GenServer

  @doc """
  Grade a sprint's output against its acceptance criteria.
  Spawns an evaluator agent in an isolated context.
  """
  def grade(sprint_id, output_artifacts, acceptance_criteria, opts \\ []) do
    # 1. Build evaluator context (isolated — no generator history)
    evaluator_context = build_evaluator_context(
      sprint_id,
      output_artifacts,
      acceptance_criteria
    )

    # 2. Spawn evaluator agent via OS-006
    {:ok, eval_agent} = OpenSentience.AgentLifecycle.install(%{
      agent_id: "evaluator-#{sprint_id}",
      role: :evaluator,
      autonomy: :act,
      context: evaluator_context
    })

    # 3. Run evaluation
    result = run_evaluation(eval_agent, acceptance_criteria)

    # 4. Store evaluation in Graphonomous
    store_evaluation(sprint_id, result)

    # 5. Cleanup evaluator
    OpenSentience.AgentLifecycle.disable(eval_agent)

    result
  end
end
```

### 6.2 Evaluator Tuning

The evaluator is deliberately tuned toward skepticism:

| Parameter | Default | Rationale |
|-----------|---------|-----------|
| `pass_threshold` | 1.0 (all criteria must pass) | No partial credit. Every criterion is testable. |
| `require_evidence` | true | Pass judgments must cite specific evidence |
| `max_evaluation_time` | 120 seconds | Evaluators should not investigate — only grade |
| `adversarial_prompt` | true | System prompt emphasizes finding failures |
| `separate_context` | true (enforced) | Evaluator never sees generator reasoning |

### 6.3 Iteration Loop

```
Planner produces sprint spec + acceptance criteria
  │
  ▼
Generator implements sprint (iteration 1)
  │
  ▼
Evaluator grades against criteria
  │
  ├── ALL PASS → Commit + advance to next sprint
  │
  └── ANY FAIL → Return specific feedback to generator
                    │
                    ▼
                Generator iterates (iteration 2)
                    │
                    ▼
                Evaluator grades again
                    │
                    ├── ALL PASS → Commit + advance
                    │
                    └── ANY FAIL → Loop (up to max_iterations)
                                    │
                                    └── max_iterations reached
                                         │
                                         ▼
                                    ESCALATE to human
```

---

## 7. Contract Validation

The ContractValidator enforces [&] Protocol governance blocks as runtime constraints — not documentation.

### 7.1 Hard Constraint Enforcement

```elixir
defmodule OpenSentience.Harness.ContractValidator do
  @doc """
  Validate an action against the agent's governance block.
  Hard constraints are inviolable. Soft constraints generate warnings.
  """
  def validate(action, governance_block) do
    hard_violations = check_hard_constraints(action, governance_block.hard)
    soft_warnings = check_soft_constraints(action, governance_block.soft)
    escalation_triggers = check_escalation_rules(action, governance_block.escalate_when)

    cond do
      hard_violations != [] ->
        {:block, :hard_constraint_violation, hard_violations}

      escalation_triggers != [] ->
        {:escalate, escalation_triggers}

      true ->
        {:allow, soft_warnings}
    end
  end
end
```

### 7.2 Governance Block Runtime Semantics

| Constraint Type | Composition Time | Runtime |
|----------------|-----------------|---------|
| `hard` | Validated by `ampersand compose` | Enforced by ContractValidator pre-execution |
| `soft` | Passed to planner as preferences | Logged as warnings if overridden |
| `escalate_when.confidence_below` | N/A | Checked against coverage_score before dispatch |
| `escalate_when.cost_exceeds_usd` | N/A | Checked against cumulative session cost |
| `autonomy.level` | Capped by Delegatic org policy | Enforced by OS-006 + PipelineEnforcer |
| `autonomy.budget` | Validated for tier compatibility | Enforced per-cycle by PipelineEnforcer |

### 7.3 Confidence-Gated Execution

A key gap in OS-006 was the lack of confidence-based gating. OS-008 adds:

```elixir
def check_confidence_gate(coverage_assessment, governance_block) do
  threshold = get_in(governance_block, [:escalate_when, :confidence_below]) || 0.7

  if coverage_assessment.decision_confidence < threshold do
    {:escalate, :confidence_below_threshold,
     %{score: coverage_assessment.decision_confidence, threshold: threshold}}
  else
    :ok
  end
end
```

---

## 8. Context Management

The ContextManager addresses the central technical challenge of long-running agent harnesses: **context degradation**.

### 8.1 The 60% Rule

Research consensus (Chroma 2026, Factory.ai 2026, morphllm 2026): output quality degrades at approximately 60% context utilization, not at the hard limit. A 200K-token model becomes unreliable around 130K tokens. Performance follows a U-shaped curve — models attend strongly to beginning and end of context but poorly to the middle ("lost in the middle").

### 8.2 Context Management Strategy

```elixir
defmodule OpenSentience.Harness.ContextManager do
  use GenServer

  @compaction_threshold 0.55  # Trigger at 55% to stay below 60%
  @overflow_threshold 20_000  # Tool results > 20K tokens get offloaded

  defstruct [
    :session_id,
    :model_tier,
    :max_context_tokens,
    :current_utilization,
    :overflow_files,
    :compaction_count
  ]

  @doc """
  Called after every tool result. Manages context size.
  """
  def on_tool_result(state, tool_name, result, result_tokens) do
    state = update_utilization(state, result_tokens)

    cond do
      # Large tool result → offload to filesystem
      result_tokens > @overflow_threshold ->
        offload_to_filesystem(state, tool_name, result)

      # Approaching threshold → trigger compaction
      state.current_utilization > @compaction_threshold ->
        trigger_compaction(state)

      true ->
        {:ok, state}
    end
  end

  defp trigger_compaction(state) do
    # 1. Offload large tool results to files
    # 2. Summarize conversation history (preserve first + last messages)
    # 3. Inject fresh Graphonomous retrieval for key topics
    # 4. Increment compaction count for telemetry
    {:compacted, %{state | compaction_count: state.compaction_count + 1}}
  end
end
```

### 8.3 Subagent Delegation

For tasks that would exceed context limits, the harness delegates to subagents:

```elixir
def delegate_to_subagent(state, subtask, opts \\ []) do
  # 1. Spawn subagent with fresh context (via OS-006)
  # 2. Inject relevant Graphonomous retrieval into subagent context
  # 3. Subagent executes independently
  # 4. Only the subagent's final summary returns to parent context
  # 5. Subagent stores durable knowledge in Graphonomous (accessible to parent)
  # 6. Subagent lifecycle managed by OS-006 (permissions, audit)
end
```

Key design: **Graphonomous is the shared memory substrate between parent and subagent contexts.** The parent doesn't need to receive the full subagent transcript — durable knowledge is stored in the graph and retrievable by any future context.

---

## 9. Sprint Controller

The SprintController manages the planner → generator → evaluator loop as a state machine.

### 9.1 Sprint Lifecycle States

```
                    plan
                     │
                     ▼
              ┌─────────────┐
              │   planned     │
              └──────┬────────┘
                     │ generate
                     ▼
              ┌─────────────┐
         ┌────│  generating   │
         │    └──────┬────────┘
         │           │ submit
         │           ▼
         │    ┌─────────────┐
         │    │  evaluating   │
         │    └──────┬────────┘
         │           │
         │    ┌──────┴──────┐
         │    │             │
         │    ▼ pass        ▼ fail
         │  ┌──────┐   ┌──────────┐
         │  │passed │   │ feedback │──┐
         │  └──┬───┘   └──────────┘  │
         │     │                      │ iterate (< max)
         │     │                      ▼
         │     │              ┌─────────────┐
         │     │              │  generating   │ (next iteration)
         │     │              └──────────────┘
         │     │
         │     │ fail at max_iterations
         │     │              │
         │     │              ▼
         │     │       ┌─────────────┐
         │     │       │  escalated   │
         │     │       └─────────────┘
         │     │
         │     ▼
         │  ┌──────────┐
         │  │ committed │ (git commit + graphonomous store)
         │  └──────┬───┘
         │         │ next sprint
         │         ▼
         │  ┌─────────────┐
         └──│  generating   │ (next sprint)
            └─────────────┘

All sprints passed:
         ┌──────────┐
         │ completed │ → learn_from_outcome + consolidate
         └──────────┘
```

### 9.2 Sprint Contract

Before each sprint begins, the SprintController produces a **sprint contract** — an explicit agreement between planner, generator, and evaluator:

```json
{
  "sprint_id": "sprint-001",
  "task_id": "task-abc",
  "description": "Implement user authentication flow",
  "acceptance_criteria": [...],
  "generator_constraints": {
    "max_iterations": 5,
    "max_tokens_per_iteration": 50000,
    "must_retrieve_before_generating": true,
    "must_commit_after_implementation": true
  },
  "evaluator_constraints": {
    "max_evaluation_time_seconds": 120,
    "separate_context": true,
    "adversarial_tuning": true,
    "evidence_required": true
  },
  "governance": {
    "hard": ["...from ampersand.json..."],
    "autonomy_level": "act",
    "budget_remaining": { "tokens": 100000, "cost_usd": 5.00 }
  },
  "provenance": {
    "retrieval_context_ids": ["node-abc", "node-def"],
    "coverage_assessment": { "decision": "act", "score": 0.82 },
    "goal_id": "goal-123"
  }
}
```

---

## 10. Unified Audit Trail

OS-008 extends the OS-006 audit schema with harness-specific events and provenance linking.

### 10.1 Extended Event Types

```elixir
# OS-008 additions to audit event_type
:pipeline_stage_completed    # A pipeline stage finished
:pipeline_stage_blocked      # A prerequisite check blocked execution
:sprint_started              # Sprint began
:sprint_passed               # Sprint passed quality gate
:sprint_failed               # Sprint failed quality gate (with iteration count)
:sprint_escalated            # Sprint hit max iterations, escalated to human
:quality_gate_graded         # Evaluator produced a grade
:contract_validated          # Governance block validated at runtime
:contract_violated           # Hard constraint violated (action blocked)
:confidence_gate_triggered   # Coverage confidence below threshold
:context_compacted           # Context manager triggered compaction
:subagent_delegated          # Work delegated to subagent
:harness_session_started     # Harness session began
:harness_session_completed   # Harness session finished successfully
```

### 10.2 Provenance Fields

Every harness audit entry includes provenance linking:

```elixir
defmodule OpenSentience.Harness.AuditEntry do
  @type t :: %__MODULE__{
    # ... all OS-006 fields ...

    # OS-008 provenance additions
    session_id: String.t(),
    sprint_id: String.t() | nil,
    goal_id: String.t() | nil,
    retrieval_context_ids: [String.t()],
    coverage_assessment: map() | nil,
    causal_node_ids: [String.t()],
    iteration: non_neg_integer() | nil,
    evaluator_agent_id: String.t() | nil,
    delegatic_policy_id: String.t() | nil
  }
end
```

This closes the audit trail continuity gap identified in the portfolio analysis — every harness action can be traced back to: what knowledge informed it (Graphonomous node IDs), what goal it serves (Delegatic goal ID), what policy governed it (Delegatic policy ID), and how confident the system was (coverage assessment).

---

## 11. Model Tier Adaptation

OS-008 adapts its behavior to the model tier (per OS-005), since the harness overhead must be proportional to model capability.

### 11.1 Tier-Specific Harness Behavior

| Parameter | local_small | local_large | cloud_frontier |
|-----------|------------|-------------|----------------|
| `planner_enabled` | false (skip, single-sprint) | true | true |
| `evaluator_enabled` | false (self-evaluate) | true (lightweight) | true (full adversarial) |
| `separate_evaluator_context` | false | false | true |
| `max_sprints_per_task` | 1 | 3 | 10 |
| `max_iterations_per_sprint` | 2 | 3 | 5 |
| `context_compaction_threshold` | 0.40 (4K context is tiny) | 0.55 | 0.55 |
| `subagent_delegation` | disabled | limited | full |
| `sprint_contracts` | implicit | explicit | explicit with negotiation |

**Key design:** On `local_small`, the harness is minimal — no separate planner, no separate evaluator, single sprint. The pipeline enforcement and prerequisite checks still apply (retrieve-before-act is enforced at all tiers). The harness scales with the model, not against it.

### 11.2 Graceful Degradation

When the current tier fails (confidence too low, iterations exhausted), the harness can escalate:

```
local_small fails → retry at local_large
local_large fails → retry at cloud_frontier
cloud_frontier fails → escalate to human
```

This is specified in OS-005 but enforced by OS-008. The SprintController manages tier escalation as a fallback strategy.

---

## 12. Integration Points

### 12.1 Graphonomous

Graphonomous is the **memory substrate** for the harness. Every harness session:
1. **Retrieves** before any action (enforced by PipelineEnforcer)
2. **Stores** sprint plans, outcomes, and evaluations as durable knowledge
3. **Queries coverage** before dispatch decisions
4. **Reports outcomes** via `learn_from_outcome` for confidence calibration
5. **Consolidates** at session end or during idle cycles

The harness does not replace Graphonomous — it ensures Graphonomous is used correctly.

### 12.2 Delegatic

Delegatic is the **policy source** for the harness:
- Governance block hard/soft constraints come from Delegatic policy trees
- Autonomy level caps are enforced at composition time (Delegatic) and runtime (OS-006 + OS-008)
- Budget limits (tokens, cost, compute) are sourced from Delegatic and enforced by the SprintController
- Goal IDs link harness sessions to Delegatic organizational goals

### 12.3 [&] Protocol

The [&] Protocol is the **contract language** for the harness:
- `ampersand.json` governance blocks define the constraints the harness enforces
- Capability contracts (`accepts_from`, `feeds_into`) validate pipeline stage compatibility
- Provenance records link harness audit entries to [&] trace chains
- The three new capability contracts (`&reason.plan`, `&reason.generate`, `&reason.evaluate`) extend the `&reason` primitive

### 12.4 SpecPrompt

SpecPrompt is the **acceptance criteria source**:
- Sprint acceptance criteria derive from SpecPrompt's formal spec sections
- The planner maps SpecPrompt acceptance tests to sprint-level criteria
- The evaluator grades against these criteria mechanically

### 12.5 Agentelic

Agentelic is the **agent builder** that produces agents the harness orchestrates:
- Agents built in Agentelic carry manifests with governance blocks → consumed by OS-008
- Agentelic's build pipeline (PARSE → GENERATE → COMPILE → TEST) is itself a harness pattern that OS-008 can orchestrate
- The harness validates that Agentelic-built agents satisfy their declared capability contracts before deployment

### 12.6 OS-006 (Governance Shim)

OS-008 sits **above** OS-006 in the enforcement stack:
- OS-006 answers: "Is this agent allowed to call this tool?" (permissions)
- OS-008 answers: "Has this agent followed the correct process to reach this point?" (pipeline enforcement)
- Both must pass for an action to execute
- Both log to the same audit trail (with OS-008 adding provenance fields)

---

## 13. MCP Tools (Harness Operations)

OS-008 exposes harness operations as MCP tools for external orchestrators:

### 13.1 `harness_start_session`

```json
{
  "name": "harness_start_session",
  "description": "Start a new harness session for a task. Returns session_id.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "workspace_id":     { "type": "string", "format": "uuid", "description": "amp.workspaces ID — scopes all retrieval, storage, and policy checks" },
      "task_description": { "type": "string" },
      "agent_id":         { "type": "string", "format": "uuid", "description": "agentelic.agents ID (dark factory mode)" },
      "goal_id":          { "type": "string", "description": "Delegatic goal ID" },
      "ampersand_spec":   { "type": "string", "description": "Path or URL to ampersand.json" },
      "model_tier":       { "type": "string", "enum": ["local_small", "local_large", "cloud_frontier"] },
      "autonomy_level":   { "type": "string", "enum": ["observe", "advise", "act"] }
    },
    "required": ["workspace_id", "task_description"]
  }
}
```

### 13.2 `harness_sprint_status`

```json
{
  "name": "harness_sprint_status",
  "description": "Get the current sprint status for a harness session.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "session_id": { "type": "string" }
    },
    "required": ["session_id"]
  }
}
```

### 13.3 `harness_approve_action`

```json
{
  "name": "harness_approve_action",
  "description": "Approve a deferred action (advise mode). Required when autonomy is advise and dispatch mode is act or propose.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "session_id": { "type": "string" },
      "action_id":  { "type": "string" },
      "approved":   { "type": "boolean" },
      "reason":     { "type": "string" }
    },
    "required": ["session_id", "action_id", "approved"]
  }
}
```

### 13.4 `harness_escalation_response`

```json
{
  "name": "harness_escalation_response",
  "description": "Respond to a harness escalation (sprint failure at max iterations, confidence gate, etc.).",
  "inputSchema": {
    "type": "object",
    "properties": {
      "session_id":   { "type": "string" },
      "escalation_id": { "type": "string" },
      "action":       { "type": "string", "enum": ["retry", "skip", "abort", "override"] },
      "guidance":     { "type": "string" }
    },
    "required": ["session_id", "escalation_id", "action"]
  }
}
```

---

## 14. Multi-Tenant Dark Factory Integration

### 14.1 Workspace-Scoped Sessions

OS-008 sessions operate within the shared [&] Supabase ecosystem. Each session is scoped to a workspace:

```elixir
defmodule OpenSentience.Harness.Session do
  # Session is always workspace-scoped
  field :workspace_id, :binary_id          # amp.workspaces — inherited from triggering agent
  field :user_id, :binary_id              # amp.profiles (Supabase Auth) — who/what started the session
  field :agent_id, :binary_id             # agentelic.agents — which agent is being built/tested
  field :trigger_event, :map              # CloudEvents envelope that triggered this session
end
```

Workspace scoping ensures:
- PipelineEnforcer only allows retrieval from workspace-scoped Graphonomous data
- QualityGate evaluators cannot access other workspaces' knowledge
- ContractValidator checks governance policies scoped to the workspace's Delegatic org
- Audit trail entries include `workspace_id` for multi-tenant audit compliance
- Subagent delegation inherits parent session's workspace scope

### 14.2 Cross-Session Learning (Resolved)

**Previously open question #5.** Now resolved:

Yes — retried sessions SHOULD access prior session traces. Implementation:

1. On session failure, the harness stores a structured outcome node in Graphonomous:
   ```
   {type: "harness_outcome", status: "failed", session_id, workspace_id,
    sprint_results: [...], failure_reason, context_snapshot_ref}
   ```
2. On session retry, PipelineEnforcer's mandatory retrieval phase pulls prior harness outcomes for the same `{agent_id, spec_hash}` tuple
3. The planner receives prior failure context and adapts its sprint decomposition
4. This creates a closed learning loop: harness → Graphonomous → harness (next attempt)

Cross-session learning is workspace-scoped — one workspace's harness failures do not leak to another.

### 14.3 Pipeline Enforcement × Delegatic Conflict Resolution

When OS-008 pipeline says "proceed" but Delegatic policy says "block", **Delegatic wins**. Rationale:

- OS-008 enforces **operational correctness** (did you retrieve before acting?)
- Delegatic enforces **organizational policy** (are you allowed to act at all?)
- Policy is a superset of pipeline: an action that passes pipeline checks may still violate policy
- An action that violates pipeline checks is blocked before Delegatic is consulted

**Enforcement order (unchanged from section 6, clarified):**
```
1. PipelineEnforcer: Prerequisites met? NO → Block (operational)
2. ContractValidator: [&] governance OK? NO → Block (contractual)
3. Delegatic (via OS-006): Org policy OK? NO → Block (organizational)
4. All pass → Execute
```

Delegatic blocks are logged as `policy_violation` audit events (not `pipeline_violation`), enabling distinct operational vs. policy failure analysis.

### 14.4 Dark Factory Session Lifecycle

In dark factory mode, harness sessions are triggered by Agentelic pipeline events (not human invocation):

```
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
```

The harness does NOT make LLM model choices — it defers to Agentelic's model tier configuration. The harness enforces the pipeline regardless of which model runs the generation.

---

## 15. Open Research Questions

OS-008 raises several research questions that extend OpenSentience's existing agenda:

1. **Harness overhead calibration:** At what point does harness overhead (separate evaluator contexts, prerequisite checks, sprint decomposition) cost more than the quality it provides? Anthropic showed they could remove sprint decomposition when models improved. How do we detect when harness components become unnecessary overhead?

2. **Evaluator adversarial tuning:** How adversarial should the evaluator be? Too lenient produces the over-praising problem. Too strict produces infinite iteration loops. Can evaluator calibration be learned from historical sprint pass rates?

3. **Coverage threshold optimization:** The current coverage → dispatch routing matrix uses hardcoded thresholds (0.45 for explore/focus boundary, 0.65 for learn/act boundary). Can these be adapted per domain? Per agent? Per model tier?

4. **Harness-as-governance-topology:** The harness itself (planner → generator → evaluator) has κ > 0 — the evaluator's feedback creates a cycle. Does this meta-level κ need its own deliberation strategy? Is the iteration loop itself a deliberation?

5. ~~**Cross-session harness learning:**~~ Resolved in section 14.2 above.

6. **Context degradation as cognitive fatigue:** The 60% rule mirrors human cognitive fatigue — sustained focus degrades performance before physical limits are reached. Can the harness detect quality degradation before the 60% threshold by monitoring evaluation pass rates over time?

7. **Autonomy trust calibration (extension of OS open question #6):** OS-008 provides concrete data for trust calibration — sprint pass rates, evaluation scores, escalation frequency. Can these metrics drive automatic autonomy level promotion?

---

## 16. Relationship to Industry Harness Patterns

OS-008 is positioned relative to the emerging harness engineering discipline:

| Pattern | Industry Standard | OS-008 Approach | Differentiation |
|---------|-------------------|-----------------|-----------------|
| Generator-Evaluator separation | Anthropic three-agent harness | `&reason.generate` + `&reason.evaluate` as [&] capability contracts | Contracts are composable and validated at composition time |
| Sprint decomposition | Anthropic sprint contracts | SprintController with acceptance criteria from SpecPrompt | Criteria are machine-parseable, not ad-hoc |
| Context management | LangChain Deep Agents offload + summarize | ContextManager with Graphonomous as persistent substrate | Knowledge survives context resets via graph, not filesystem |
| Prerequisite enforcement | OpenAI CI invariants | PipelineEnforcer with prerequisite rules | Runtime enforcement, not just CI-time |
| Filesystem memory | All major harnesses | Graphonomous knowledge graph | Topology-aware, confidence-weighted, consolidating |
| Subagent delegation | Claude Code, LangGraph | OS-006 supervised subagents with shared Graphonomous | Subagents share knowledge graph, not just filesystem |
| Autonomy levels | None (binary human/agent) | Three-level graduated autonomy (observe/advise/act) | Policy-driven, auditable, per-agent |
| Governance contracts | None (ad-hoc constraints) | [&] Protocol governance blocks | Formal, composable, validated |
| κ-routed deliberation | None | Topology-gated reasoning depth | Circular dependencies get deliberation; DAGs get fast-path |
| Coverage-driven routing | None | Coverage.recommend → act/learn/escalate | Epistemic self-modeling before action |

**Unique to OS-008 (not found in any current harness framework):**
1. Knowledge graph as shared memory substrate (vs. filesystem)
2. Topology-aware deliberation gating (κ-routing)
3. Coverage-driven dispatch (epistemic self-modeling)
4. Governance contracts as first-class protocol primitives
5. Graduated autonomy with policy-driven transitions
6. Cognitive science grounding (Norman & Shallice SAS)

---

## 17. Implementation Phases

### Phase 1: Pipeline Enforcement (Weeks 1–4)
- PipelineEnforcer with prerequisite rules
- Retrieve-before-act enforcement
- Mandatory outcome storage
- Integration with existing OS-006 permission checks
- Audit trail extensions

### Phase 2: Quality Gate + Sprint Controller (Weeks 5–8)
- QualityGate with separate evaluator context
- SprintController state machine
- Sprint contract schema
- Generator iteration loop
- Planner role implementation

### Phase 3: Contract Validation + Context Management (Weeks 9–12)
- ContractValidator for [&] governance blocks
- Confidence-gated execution
- ContextManager with compaction + offload
- Subagent delegation via OS-006
- Graphonomous integration for cross-context knowledge sharing

### Phase 4: Model Tier Adaptation + MCP (Weeks 13–16)
- Tier-specific harness behavior
- Graceful degradation (tier escalation)
- MCP tools for external orchestration
- Telemetry integration
- Production hardening

---

## 18. Cognitive Science References

| Concept | Reference | Application in OS-008 |
|---------|-----------|----------------------|
| Supervisory Attentional System | Norman & Shallice 1986 | The harness IS the SAS — it overrides automatic routines when novel/dangerous situations arise |
| Metacognitive monitoring | Flavell 1979 | Evaluator role — separating cognitive process from its assessment |
| Resource rationality | Lieder & Griffiths 2020 | Model tier adaptation — harness overhead proportional to expected utility |
| Cognitive fatigue | Baumeister et al. 1998 (ego depletion) | Context degradation — quality drops before hard limits |
| Dual-process theory | Kahneman 2011 | Sprint controller — fast path (κ=0, single sprint) vs. slow path (κ>0, deliberation loop) |
| Executive function | Miyake et al. 2000 | Pipeline enforcement — inhibitory control (blocking premature action), task switching (sprint transitions) |

---

*OS-008 is the skeleton that gives the [&] ecosystem's organs a body. The tools (Graphonomous, AgenTroMatic, Delegatic) are powerful. The harness ensures they're used together, correctly, every time.*
