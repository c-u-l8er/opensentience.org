# Runtime Walkthrough

This page follows a concrete agent through the full OpenSentience governance lifecycle (OS-006) and harness orchestration (OS-008), step by step.

The goal is to make the runtime operational, not just conceptual. It answers practical questions such as:

- what happens when an agent is installed, enabled, and started
- how permission checks work on the hot path
- how autonomy levels change agent behavior
- how the harness enforces pipeline ordering and quality gates
- how OS-006 and OS-008 work together as a dual enforcement stack
- what the audit trail looks like at the end

---

## 1. What this walkthrough is

This is a **reference workflow** for the OpenSentience governance shim and harness runtime.

It follows a single agent -- `fleet-optimizer` -- through seven stages:

1. agent installation (OS-006)
2. agent enable and start (OS-006)
3. permission checks on the hot path (OS-006)
4. autonomy enforcement at each level (OS-006)
5. a full harness session with sprint decomposition and quality gates (OS-008)
6. the dual enforcement stack (OS-006 + OS-008 together)
7. audit trail query

The example is concrete and reproducible. The module names, function signatures, and ETS table names match the spec in `docs/spec/README.md` and `docs/spec/OS-008-HARNESS.md`.

---

## 2. The agent

The agent under governance is a fleet route optimizer for the GeoFleetic product. It needs:

- read access to fleet data files
- outbound network access to the GeoFleetic API
- four Graphonomous MCP tools
- read/write access to a knowledge graph

It starts at the most restrictive autonomy level (`:observe`) and will be promoted as trust is established.

---

## 3. Part 1: Agent Installation (OS-006)

An operator installs the agent by calling `OpenSentience.install_agent/1`:

```elixir
OpenSentience.install_agent(%{
  agent_id: "fleet-optimizer",
  name: "Fleet Route Optimizer",
  child_spec: {FleetOptimizer.Worker, []},
  permissions: %{
    filesystem: %{read: ["/data/fleet/**"]},
    network: %{outbound: ["api.geofleetic.com"]},
    tool_invocation: %{allowed: ["retrieve_context", "store_node", "topology_analyze", "coverage_query"]},
    graph_access: %{read: ["fleet-knowledge"], write: ["fleet-knowledge"]}
  },
  autonomy: :observe
})
```

### What happens internally

```
install_agent/1 called
  |
  v
PermissionEngine: write grants to ETS (:os_permissions)
  |  {fleet-optimizer, filesystem, read, "/data/fleet/**"}   -> :allow
  |  {fleet-optimizer, network, outbound, "api.geofleetic.com"} -> :allow
  |  {fleet-optimizer, tool_invocation, retrieve_context}    -> :allow
  |  {fleet-optimizer, tool_invocation, store_node}          -> :allow
  |  {fleet-optimizer, tool_invocation, topology_analyze}    -> :allow
  |  {fleet-optimizer, tool_invocation, coverage_query}      -> :allow
  |  {fleet-optimizer, graph_access, read, "fleet-knowledge"}  -> :allow
  |  {fleet-optimizer, graph_access, write, "fleet-knowledge"} -> :allow
  |
  v
AgentSupervisor: start AgentLifecycle GenStateMachine
  |  child_spec = {FleetOptimizer.Worker, []}
  |  initial state = :installed
  |  agent process NOT started yet
  |
  v
AutonomyController: write level to ETS (:os_autonomy)
  |  {fleet-optimizer} -> :observe
  |
  v
AuditWriter: log install event
  |  %Audit.Entry{
  |    agent_id: "fleet-optimizer",
  |    event_type: :lifecycle_transition,
  |    operation: "install",
  |    result: :allowed,
  |    actor: "operator:admin",
  |    reason: "initial installation",
  |    metadata: %{autonomy: :observe, permissions_count: 8}
  |  }
  |
  v
Return {:ok, "fleet-optimizer"}
```

At this point the agent is **installed but not running**. The supervision tree looks like:

```
OpenSentience.Application
├── OpenSentience.PermissionEngine (GenServer + ETS owner)
├── OpenSentience.AuditWriter (GenServer, batched append-only)
├── OpenSentience.AutonomyController (GenServer + ETS owner)
├── OpenSentience.AgentSupervisor (DynamicSupervisor)
│   └── OpenSentience.AgentLifecycle ("fleet-optimizer" -- state: :installed)
│       └── (child process NOT started)
├── OpenSentience.MCP.Server
└── OpenSentience.Telemetry
```

---

## 4. Part 2: Agent Enable and Start

The operator enables and starts the agent in two transitions:

```elixir
# Transition 1: installed -> enabled
OpenSentience.enable_agent("fleet-optimizer", reason: "manifest validated, permissions reviewed")

# Transition 2: enabled -> running
OpenSentience.start_agent("fleet-optimizer", reason: "deployment approved by ops lead")
```

### State machine transitions

```
:installed ──enable──> :enabled ──start──> :running
```

Each transition produces an audit entry:

| Transition | Actor | Timestamp | Reason |
|---|---|---|---|
| `:installed` -> `:enabled` | `operator:admin` | `2026-03-31T10:00:01Z` | manifest validated, permissions reviewed |
| `:enabled` -> `:running` | `operator:admin` | `2026-03-31T10:00:02Z` | deployment approved by ops lead |

When the agent enters `:running`, the `AgentLifecycle` GenStateMachine starts the wrapped child spec (`FleetOptimizer.Worker`) under supervision. The worker process is now live.

The autonomy level remains `:observe` -- the agent can generate recommendations but cannot execute actions.

---

## 5. Part 3: Permission Check (Hot Path)

Every tool invocation by the agent passes through the `PermissionEngine` before execution. The engine uses ETS for microsecond-latency lookups.

### Allowed permission check

```
fleet-optimizer wants to call retrieve_context
  |
  v
PermissionEngine: ETS lookup
  key: {fleet-optimizer, tool_invocation, retrieve_context}
  result: :allow
  |
  v
AuditWriter: log permission check
  %Audit.Entry{
    agent_id: "fleet-optimizer",
    event_type: :permission_check,
    operation: "tool_invocation:retrieve_context",
    result: :allowed,
    actor: "fleet-optimizer",
    metadata: %{latency_us: 1.2}
  }
  |
  v
Tool call proceeds.
Total time: < 2 microseconds for ETS lookup.
```

### Denied permission check

```
fleet-optimizer wants to write /etc/config
  |
  v
PermissionEngine: ETS lookup
  key: {fleet-optimizer, filesystem, write, "/etc/config"}
  result: no matching grant
  |
  v
Default deny applied.
  reason: "no matching grant for filesystem.write:/etc/config"
  |
  v
AuditWriter: log denied permission
  %Audit.Entry{
    agent_id: "fleet-optimizer",
    event_type: :permission_check,
    operation: "filesystem:write:/etc/config",
    result: :denied,
    actor: "fleet-optimizer",
    reason: "no matching grant",
    metadata: %{latency_us: 0.8}
  }
  |
  v
Tool call BLOCKED. Error returned to agent.
```

### Permission evaluation order

The evaluation follows a strict precedence:

```
explicit deny  >  explicit allow  >  default deny
```

There are no implicit permissions. If a grant does not exist in ETS, the answer is always `:denied`.

---

## 6. Part 4: Autonomy Enforcement

The agent wants to perform an action: "reroute delivery fleet through alternate corridor." Here is how the same action behaves at each autonomy level.

### Level: :observe (current)

```
fleet-optimizer proposes: reroute fleet through corridor B
  |
  v
AutonomyController: ETS lookup
  key: {fleet-optimizer}
  level: :observe
  |
  v
Action intercepted. Converted to recommendation.
  NOT executed.
  |
  v
AuditWriter: log
  %Audit.Entry{
    event_type: :action_recommended,
    operation: "reroute_fleet",
    result: :logged,
    reason: "autonomy=observe; action logged as recommendation only"
  }
  |
  v
Recommendation visible on operator dashboard.
Agent receives: {:recommendation_logged, "reroute_fleet"}
```

### Level: :advise

```
fleet-optimizer proposes: reroute fleet through corridor B
  |
  v
AutonomyController: ETS lookup -> :advise
  |
  v
Action queued for human approval.
  queued_action_id: "qa-20260331-001"
  |
  v
AuditWriter: log
  %Audit.Entry{
    event_type: :action_blocked,
    result: :queued,
    reason: "autonomy=advise; awaiting human approval"
  }
  |
  v
Operator reviews action plan + rationale.
  Operator approves -> action forwarded to PermissionEngine -> execute.
  Operator rejects -> action discarded, audit logged.
```

### Level: :act

```
fleet-optimizer proposes: reroute fleet through corridor B
  |
  v
AutonomyController: ETS lookup -> :act
  |
  v
PermissionEngine: does agent have permission?
  key: {fleet-optimizer, network, outbound, "api.geofleetic.com"} -> :allow
  |
  v
Action executes.
  |
  v
AuditWriter: log
  %Audit.Entry{
    event_type: :action_executed,
    operation: "reroute_fleet",
    result: :allowed,
    reason: "autonomy=act; permission check passed"
  }
```

### Summary table

| Level | What happens | Human involvement | Audit event type |
|---|---|---|---|
| `:observe` | Logged as recommendation, not executed | Acts on recommendation manually | `:action_recommended` |
| `:advise` | Queued, awaits human approval | Approves or rejects each action | `:action_blocked` (result: `:queued`) |
| `:act` | Permission check, then execute if allowed | Monitors dashboard and audit trail | `:action_executed` |

---

## 7. Part 5: Harness Session (OS-008)

The agent is now running at `:observe` autonomy. A task arrives that triggers a full harness session.

### Step 1: Task arrives

```
Task: "Optimize delivery routes for Seattle region"
Source: operator:ops-lead
Priority: high
```

The harness creates a new session:

```elixir
{:ok, session} = OpenSentience.Harness.start_session(%{
  agent_id: "fleet-optimizer",
  task: "Optimize delivery routes for Seattle region",
  source: "operator:ops-lead"
})
# session_id: "session-20260331-001"
```

The supervision tree now includes:

```
OpenSentience.Harness.Supervisor (DynamicSupervisor)
└── OpenSentience.Harness.Session ("session-20260331-001")
    ├── OpenSentience.Harness.PipelineEnforcer
    ├── OpenSentience.Harness.QualityGate
    ├── OpenSentience.Harness.ContractValidator
    ├── OpenSentience.Harness.SprintController
    └── OpenSentience.Harness.ContextManager
```

---

### Step 2: PipelineEnforcer -- retrieve MUST happen first

The agent's first instinct might be to start optimizing routes immediately. The PipelineEnforcer prevents this.

```
fleet-optimizer attempts: store_node (write route data)
  |
  v
PipelineEnforcer: check_prerequisite
  tool: store_node
  required: [{:completed, :retrieve_context}]
  completed_stages: MapSet<[]>
  |
  v
BLOCKED.
  reason: "Prerequisites not met: retrieve_context must complete
           before any write-class tool call"
  |
  v
AuditWriter: log violation
  %Audit.Entry{
    event_type: :action_blocked,
    operation: "store_node",
    result: :denied,
    reason: "pipeline prerequisite: retrieve_context not completed"
  }
```

The agent must call `retrieve_context` first:

```
fleet-optimizer calls: retrieve_context("seattle delivery routes")
  |
  v
PipelineEnforcer: no prerequisites for retrieve_context -> :allow
OS-006 PermissionEngine: tool_invocation:retrieve_context -> :allow
  |
  v
Graphonomous returns prior context:
  - 3 semantic nodes about Seattle routing
  - 1 episodic node from last optimization run
  - 2 procedural nodes with route heuristics
  |
  v
PipelineEnforcer: mark :retrieve_context as :completed
  completed_stages: MapSet<[:retrieve_context]>
```

---

### Step 3: Planner decomposes into sprints

The `SprintController` activates the planner role:

```elixir
%{
  sprints: [
    %{
      id: "sprint-001",
      description: "Analyze current Seattle routes and identify cost bottlenecks",
      acceptance_criteria: [
        %{id: "ac-001", description: "Current route costs calculated for all 12 Seattle zones"},
        %{id: "ac-002", description: "Top 3 bottleneck corridors identified with cost breakdown"}
      ]
    },
    %{
      id: "sprint-002",
      description: "Generate optimized routes with cost within 15% of baseline",
      acceptance_criteria: [
        %{id: "ac-003", description: "Optimized routes generated for all 12 zones"},
        %{id: "ac-004", description: "Route cost within 15% of calculated baseline"},
        %{id: "ac-005", description: "No route exceeds 45-minute delivery window"}
      ]
    }
  ],
  retrieval_context_id: "node-fleet-ctx-001",
  coverage_assessment: %{decision: :act, coverage_score: 0.72}
}
```

The planner stores this plan in Graphonomous as procedural knowledge.

---

### Step 4: Generator implements sprint 1

The `SprintController` routes sprint-001 to the generator role. The generator:

1. Retrieves zone-specific route data (PipelineEnforcer allows -- `retrieve_context` already completed)
2. Calculates current costs across all 12 Seattle zones
3. Identifies the top 3 bottleneck corridors

Generator output: cost analysis with corridors ranked by inefficiency.

---

### Step 5: PipelineEnforcer blocks sprint completion without store_node

The generator attempts to advance to sprint-002 without storing outcomes:

```
SprintController attempts: advance to sprint-002
  |
  v
PipelineEnforcer: check_prerequisite
  action: {:sprint, :advance}
  required: [{:completed, :quality_gate, result: :pass}]
  |
  v
BLOCKED. Quality gate has not run yet.
```

The generator must also call `store_node` before the session can eventually complete:

```
PipelineEnforcer prerequisite check:
  {:session, :complete} => [{:completed, :store_node}]
```

This is enforced at session end, not at sprint boundaries.

---

### Step 6: QualityGate spawns evaluator in separate context

The `QualityGate` engine creates an evaluator agent in an isolated context:

```
QualityGate: spawn evaluator for sprint-001
  |
  v
Evaluator receives (fresh context, no generator reasoning):
  - Sprint spec: "Analyze current Seattle routes and identify cost bottlenecks"
  - Acceptance criteria: [ac-001, ac-002]
  - Generator output: cost analysis artifact
  |
  v
Evaluator grades each criterion independently.
```

The evaluator operates in a **separate context window** from the generator. It does not see the generator's planning context, reasoning, or prior iterations. This separation prevents sunk-cost bias and self-evaluation over-praising.

---

### Step 7: Evaluator fails sprint 1

```elixir
%{
  sprint_id: "sprint-001",
  overall: :fail,
  criteria_results: [
    %{id: "ac-001", result: :pass,
      evidence: "Costs calculated for all 12 zones, range $142-$387 per route"},
    %{id: "ac-002", result: :fail,
      feedback: "Only 2 bottleneck corridors identified. Zone 7 (Ballard-Fremont)
                 has the 2nd highest cost but was not analyzed. Re-examine zones
                 with cost > $300."}
  ],
  iteration: 1,
  max_iterations: 5,
  evaluator_confidence: 0.82
}
```

The `SprintController` routes the failure feedback back to the generator.

---

### Step 8: Generator iterates with evaluator feedback

The generator receives the specific feedback from the evaluator:

```
Generator iteration 2:
  - Feedback: "Zone 7 (Ballard-Fremont) has the 2nd highest cost but was not analyzed"
  - Action: Re-examine all zones with cost > $300
  - Result: Correctly identifies Zone 7 ($341), Zone 3 ($387), Zone 11 ($312)
            as the top 3 bottleneck corridors
```

The revised output is sent back to the `QualityGate`.

---

### Step 9: Evaluator passes sprint 1 on iteration 2

```elixir
%{
  sprint_id: "sprint-001",
  overall: :pass,
  criteria_results: [
    %{id: "ac-001", result: :pass,
      evidence: "Costs calculated for all 12 zones"},
    %{id: "ac-002", result: :pass,
      evidence: "Top 3 corridors: Zone 3 ($387), Zone 7 ($341), Zone 11 ($312).
                 Cost breakdowns include fuel, time, and congestion factors."}
  ],
  iteration: 2,
  max_iterations: 5,
  evaluator_confidence: 0.91
}
```

The `SprintController` advances to sprint-002.

```
PipelineEnforcer: check_prerequisite
  action: {:sprint, :advance}
  required: [{:completed, :quality_gate, result: :pass}]
  completed: YES (sprint-001 passed on iteration 2)
  -> :allow
```

---

### Step 10: Sprint 2 executes and passes

Sprint-002 follows the same cycle:

1. Generator retrieves context (PipelineEnforcer allows)
2. Generator produces optimized routes for all 12 zones
3. QualityGate spawns evaluator in fresh context
4. Evaluator grades against acceptance criteria:
   - ac-003: pass -- optimized routes generated for all 12 zones
   - ac-004: pass -- average cost is 11% below baseline (within 15% threshold)
   - ac-005: pass -- maximum delivery window is 42 minutes (under 45-minute limit)
5. Sprint-002 passes on iteration 1

---

### Step 11: Session completes

With both sprints passed, the harness enforces final pipeline stages:

```
Session completion sequence:
  |
  v
PipelineEnforcer: has store_node been called? -> YES (plan + outcomes stored)
  |
  v
fleet-optimizer calls: learn_from_outcome
  causal_ids: ["node-fleet-ctx-001", "node-sprint-001-result", "node-sprint-002-result"]
  outcome: :success
  confidence_delta: +0.08
  |
  v
fleet-optimizer calls: run_consolidation
  scope: "fleet-knowledge"
  |
  v
Harness.Session: mark session as :completed
AuditWriter: log session completion
  %Audit.Entry{
    event_type: :lifecycle_transition,
    operation: "session_complete",
    result: :allowed,
    actor: "harness:session-20260331-001",
    metadata: %{
      sprints_completed: 2,
      total_iterations: 3,
      quality_gate_passes: 2,
      quality_gate_failures: 1,
      duration_seconds: 47
    }
  }
```

---

## 8. Part 6: The Dual Enforcement Stack

OS-006 and OS-008 are complementary layers. OS-006 asks "is this agent allowed to do this?" OS-008 asks "has this agent done the prerequisite work?" Both must pass for a tool call to proceed.

### Example: store_node call

```
Agent requests tool call: store_node
  |
  v
OS-008 PipelineEnforcer: Has retrieve_context completed?
  completed_stages check: :retrieve_context in MapSet -> YES
  -> :allow
  |
  v
OS-006 PermissionEngine: Does agent have graph_access.write permission?
  ETS lookup: {fleet-optimizer, graph_access, write, "fleet-knowledge"} -> :allow
  -> :allow
  |
  v
Tool executes.
  store_node writes to fleet-knowledge graph.
  |
  v
OS-008 PipelineEnforcer: Update stage state
  completed_stages: MapSet<[:retrieve_context, :store_node, ...]>
  |
  v
OS-006 AuditWriter: Log execution
  %Audit.Entry{
    event_type: :action_executed,
    operation: "tool_invocation:store_node",
    result: :allowed,
    actor: "fleet-optimizer",
    metadata: %{
      pipeline_stage: :storing,
      session_id: "session-20260331-001"
    }
  }
```

### Example: blocked at OS-008 layer (pipeline)

```
Agent requests tool call: store_node (before retrieval)
  |
  v
OS-008 PipelineEnforcer: Has retrieve_context completed?
  completed_stages: MapSet<[]> -> NO
  -> BLOCKED
  reason: "Prerequisites not met: retrieve_context must complete first"
  |
  v
OS-006 PermissionEngine: never reached.
Tool: never reached.
```

### Example: blocked at OS-006 layer (permission)

```
Agent requests tool call: store_node to graph "admin-config"
  |
  v
OS-008 PipelineEnforcer: Has retrieve_context completed?
  -> YES, allow
  |
  v
OS-006 PermissionEngine: Does agent have graph_access.write for "admin-config"?
  ETS lookup: no matching grant
  -> BLOCKED
  reason: "no matching grant for graph_access.write:admin-config"
  |
  v
Tool: never reached.
```

### Enforcement stack diagram

```
                ┌───────────────────────────────┐
                │          Agent Request          │
                └──────────────┬────────────────┘
                               |
                               v
                ┌───────────────────────────────┐
                │  OS-008: Pipeline Enforcer      │
                │  "Has the agent done the        │
                │   prerequisite work?"            │
                │                                  │
                │  BLOCK if prerequisites unmet    │
                └──────────────┬────────────────┘
                               | PASS
                               v
                ┌───────────────────────────────┐
                │  OS-006: Permission Engine       │
                │  "Is this agent allowed to       │
                │   perform this operation?"        │
                │                                  │
                │  BLOCK if no matching grant       │
                └──────────────┬────────────────┘
                               | PASS
                               v
                ┌───────────────────────────────┐
                │  OS-006: Autonomy Controller     │
                │  "Is the agent's autonomy level  │
                │   sufficient for this action?"    │
                │                                  │
                │  observe: log only                │
                │  advise:  queue for approval      │
                │  act:     proceed                 │
                └──────────────┬────────────────┘
                               | PROCEED
                               v
                ┌───────────────────────────────┐
                │        Tool Executes             │
                └──────────────┬────────────────┘
                               |
                               v
                ┌───────────────────────────────┐
                │  OS-008: Update pipeline state   │
                │  OS-006: Audit log entry          │
                └───────────────────────────────┘
```

---

## 9. Part 7: Audit Trail Query

After the session completes, the operator queries the full audit trail:

```elixir
entries = OpenSentience.audit("fleet-optimizer", limit: 20)
```

### Returned entries (abbreviated)

```
 # | Timestamp            | Event Type            | Operation                        | Result    | Reason
---+----------------------+-----------------------+----------------------------------+-----------+------------------------------------------
 1 | 2026-03-31T10:00:00Z | lifecycle_transition  | install                          | allowed   | initial installation
 2 | 2026-03-31T10:00:01Z | lifecycle_transition  | installed -> enabled             | allowed   | manifest validated, permissions reviewed
 3 | 2026-03-31T10:00:02Z | lifecycle_transition  | enabled -> running               | allowed   | deployment approved by ops lead
 4 | 2026-03-31T10:01:00Z | permission_check      | tool:retrieve_context            | allowed   |
 5 | 2026-03-31T10:01:00Z | action_executed       | retrieve_context                 | allowed   | pipeline stage: retrieving
 6 | 2026-03-31T10:01:03Z | action_blocked        | store_node                       | denied    | pipeline prerequisite: retrieve not done
 7 | 2026-03-31T10:01:05Z | permission_check      | tool:store_node                  | allowed   | plan stored
 8 | 2026-03-31T10:01:10Z | action_executed       | sprint-001 generator iteration 1 | allowed   |
 9 | 2026-03-31T10:01:15Z | action_blocked        | sprint advance                   | denied    | quality gate not passed
10 | 2026-03-31T10:01:16Z | action_executed       | quality_gate sprint-001 iter 1   | allowed   | result: fail (ac-002 missing zone 7)
11 | 2026-03-31T10:01:20Z | action_executed       | sprint-001 generator iteration 2 | allowed   |
12 | 2026-03-31T10:01:25Z | action_executed       | quality_gate sprint-001 iter 2   | allowed   | result: pass
13 | 2026-03-31T10:01:26Z | lifecycle_transition  | sprint advance: 001 -> 002       | allowed   | quality gate passed
14 | 2026-03-31T10:01:30Z | action_executed       | sprint-002 generator iteration 1 | allowed   |
15 | 2026-03-31T10:01:35Z | action_executed       | quality_gate sprint-002 iter 1   | allowed   | result: pass
16 | 2026-03-31T10:01:40Z | permission_check      | tool:store_node                  | allowed   | outcomes stored
17 | 2026-03-31T10:01:41Z | action_executed       | learn_from_outcome               | allowed   | confidence +0.08
18 | 2026-03-31T10:01:42Z | action_executed       | run_consolidation                | allowed   | scope: fleet-knowledge
19 | 2026-03-31T10:01:43Z | lifecycle_transition  | session_complete                 | allowed   | 2 sprints, 3 iterations, 47s
20 | 2026-03-31T10:02:00Z | permission_check      | filesystem:write:/etc/config     | denied    | no matching grant
```

### Filtering by event type

```elixir
# Just lifecycle transitions
OpenSentience.audit("fleet-optimizer", event_type: :lifecycle_transition, limit: 10)

# Just permission denials
OpenSentience.audit("fleet-optimizer", result: :denied, limit: 10)

# Just quality gate results
OpenSentience.audit("fleet-optimizer", operation: "quality_gate*", limit: 10)
```

### What the audit trail proves

The audit trail for this session demonstrates:

1. **Complete lifecycle provenance** -- every state transition from install through session completion is recorded with actor, timestamp, and reason.
2. **Pipeline enforcement works** -- the blocked `store_node` at entry 6 proves the PipelineEnforcer prevented a write before retrieval.
3. **Quality gates work** -- the failed sprint at entry 10 and subsequent pass at entry 12 proves the evaluator caught a real deficiency and the generator corrected it.
4. **Permission enforcement works** -- the denied filesystem write at entry 20 proves default-deny is active.
5. **No gaps** -- there are no unlogged operations. Every tool call, every state transition, every quality gate result has a corresponding audit entry.

---

## 10. What is normative and what is illustrative

### Normative at the protocol level

These ideas are central to the OpenSentience runtime model:

- agents progress through lifecycle states (installed, enabled, running, disabled)
- permissions are evaluated as explicit deny > explicit allow > default deny
- every permission check, lifecycle transition, and autonomy change is audit-logged
- autonomy levels (observe, advise, act) change agent behavior, not just logging
- the harness enforces pipeline ordering -- retrieve before act, store before complete
- quality gates use separate evaluator contexts, not self-evaluation
- OS-006 and OS-008 are complementary enforcement layers

### Illustrative in this page

These details are examples rather than mandatory:

- the specific agent name ("fleet-optimizer") and its permissions
- the exact task ("optimize delivery routes for Seattle region")
- the specific acceptance criteria and sprint decomposition
- the exact ETS key formats
- the exact audit entry field values and timestamps
- the tabular audit trail format

That distinction matters. The protocol defines the enforcement model and lifecycle. Implementations choose the surface syntax.

---

## 11. Short summary

A runtime processing the OpenSentience governance and harness protocols should be understandable as:

1. **Install the agent** -- register permissions in ETS, start lifecycle state machine, log to audit trail
2. **Enable and start** -- transition lifecycle states, start the agent process under supervision
3. **Enforce permissions on every tool call** -- ETS lookup, default deny, sub-microsecond latency
4. **Enforce autonomy levels** -- observe (log only), advise (queue for approval), act (execute)
5. **Enforce pipeline ordering** -- retrieve before write, topology before deliberate, store before complete
6. **Gate quality** -- evaluator in separate context, iterate on failure, advance on pass
7. **Audit everything** -- append-only, queryable, no gaps

That is how the OpenSentience runtime moves from governance specification to enforced agent behavior.
