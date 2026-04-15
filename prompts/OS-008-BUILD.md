# OS-008 Agent Harness Protocol — Implementation Build Prompt
**Version:** 1.0 | **Date:** April 2026 | **Type:** Full Implementation (OTP Supervision Tree + MCP)

---

## Your Mission

You are building the **OS-008 Agent Harness Protocol** — the enforcement runtime that sits above agents and below humans. The harness orchestrates [&] pipelines, enforces governance contracts, gates execution on epistemic confidence, and ensures no agent skips retrieval, fabricates provenance, or acts beyond its coverage.

**Read `docs/spec/OS-008-HARNESS.md` fully before writing a single line.** It is the authoritative spec.

OS-008 is the **enforcement layer** of the dark factory pipeline:
```
SpecPrompt (spec in) → Agentelic (build) → OS-008 (enforce) → FleetPrompt (distribute) → RuneFort (observe)
```

The harness wraps agents like an OTP supervisor wraps processes — it doesn't do the work, it ensures the work is done correctly.

---

## Target Stack

```
Language:      Elixir 1.17+ / OTP 27
OTP Patterns:  DynamicSupervisor, GenServer, GenStateMachine
MCP:           JSON-RPC over HTTP (harness_start_session, harness_sprint_status,
               harness_approve_action, harness_escalation_response)
Integration:   Graphonomous MCP (memory), Delegatic (policy), OS-006 (permissions)
Auth:          Supabase Auth (shared [&] ecosystem — workspace-scoped sessions)
Testing:       ExUnit + property-based testing for state machine transitions
Deploy:        Part of OpenSentience runtime (not standalone)
```

---

## Repository Structure

Create this structure inside `opensentience.org/lib/`:

```
opensentience.org/
├── lib/
│   ├── open_sentience/
│   │   ├── harness/
│   │   │   ├── supervisor.ex           # DynamicSupervisor for harness sessions
│   │   │   ├── session.ex              # Session GenServer — supervises one orchestrated task
│   │   │   ├── pipeline_enforcer.ex    # Prerequisite constraint model (section 5)
│   │   │   ├── quality_gate.ex         # Evaluator orchestrator (section 6)
│   │   │   ├── contract_validator.ex   # [&] governance block enforcement (section 7)
│   │   │   ├── sprint_controller.ex    # GenStateMachine — planner→generator→evaluator loop (section 9)
│   │   │   ├── context_manager.ex      # Context window management + compaction (section 8)
│   │   │   ├── coverage.ex             # Coverage→dispatch routing matrix (section 3.3)
│   │   │   ├── audit_entry.ex          # Extended audit entry with provenance (section 10)
│   │   │   ├── tier_adapter.ex         # Model tier adaptation (section 11)
│   │   │   └── telemetry.ex            # :telemetry events for harness operations
│   │   ├── harness.ex                  # Public API — start_session, sprint_status, etc.
│   │   └── harness_mcp/
│   │       ├── server.ex               # MCP JSON-RPC server (section 13)
│   │       └── tools.ex                # Tool definitions and handlers
│   └── open_sentience.ex              # Add harness supervisor to application tree
├── test/
│   ├── harness/
│   │   ├── pipeline_enforcer_test.exs
│   │   ├── quality_gate_test.exs
│   │   ├── contract_validator_test.exs
│   │   ├── sprint_controller_test.exs
│   │   ├── context_manager_test.exs
│   │   ├── coverage_test.exs
│   │   └── session_test.exs
│   └── fixtures/
│       ├── customer_support_governance.json   # [&] governance block
│       ├── sprint_contract.json               # Sample sprint contract
│       └── coverage_scenarios.json            # Coverage→dispatch test cases
├── mix.exs
├── Dockerfile
└── fly.toml
```

---

## Implementation Order

### Phase 1: Pipeline Enforcer (weeks 1-3)

1. **Implement PipelineEnforcer** (`harness/pipeline_enforcer.ex`)
   - GenServer tracking stage state machine: `:idle → :retrieving → :analyzing → :deliberating → :acting → :storing`
   - Prerequisite rules from section 5.1:
     - `{:any, :write}` requires `{:completed, :retrieve_context}`
     - `{:call, :deliberate}` requires `{:completed, :topology_analyze}`
     - `{:call, :execute_action}` requires `{:completed, :coverage_query}`
     - `{:call, :learn_from_outcome}` requires `{:completed, :execute_action}`
     - `{:session, :complete}` requires `{:completed, :store_node}`
     - `{:sprint, :advance}` requires `{:completed, :quality_gate, result: :pass}`
   - `check_prerequisite/3` returns `{:allow, state}` or `{:block, reason, state}`
   - Tracks violations as audit entries
   - Wraps MCP tool dispatch — called before every tool invocation

2. **Implement the two enforced pipelines** (section 3)
   - Reactive pipeline: `query |> recall |> topology |> deliberate(if κ>0) |> store`
   - Proactive pipeline: `heartbeat |> survey |> triage |> dispatch |> store`
   - Coverage→dispatch routing matrix (section 3.3) — 10 routing rules

3. **Integration with OS-006** (section 5.3)
   - OS-008 PipelineEnforcer runs BEFORE OS-006 PermissionEngine
   - Both must pass for action to execute
   - Both log to same audit trail

### Phase 2: Quality Gate Engine (weeks 3-5)

1. **Implement QualityGate** (`harness/quality_gate.ex`)
   - `grade/4` — grade sprint output against acceptance criteria
   - Build isolated evaluator context (no generator history)
   - Spawn evaluator agent via OS-006 `AgentLifecycle.install`
   - Store evaluation in Graphonomous
   - Cleanup evaluator on completion
   - Tuning params: `pass_threshold: 1.0`, `require_evidence: true`, `max_evaluation_time: 120s`, `adversarial_prompt: true`, `separate_context: true`

2. **Implement iteration loop** (section 6.3)
   - Generator implements → evaluator grades → if fail, feedback to generator → repeat
   - Up to `max_iterations_per_sprint` (tier-dependent: 2/3/5)
   - On max iterations reached → escalate to human

### Phase 3: Contract Validator (weeks 5-7)

1. **Implement ContractValidator** (`harness/contract_validator.ex`)
   - `validate/2` — validate action against governance block
   - Hard constraints → `:block` (inviolable)
   - Soft constraints → `:allow` with warnings
   - Escalation triggers → `:escalate` (confidence_below, cost_exceeds_usd)
   - Confidence-gated execution (section 7.3)

2. **Parse [&] governance blocks** from `ampersand.json`
   - Hard/soft constraint extraction
   - Escalation rule extraction
   - Autonomy level caps

### Phase 4: Sprint Controller (weeks 7-10)

1. **Implement SprintController** (`harness/sprint_controller.ex`) as GenStateMachine
   - States: `planned → generating → evaluating → passed → feedback → committed → escalated → completed`
   - Sprint contract production (section 9.2)
   - Planner → generator → evaluator routing
   - Iteration tracking with budget enforcement
   - Git commit integration on sprint pass

2. **Implement the three agent roles** (section 4)
   - Planner: `&reason.plan` contract — decompose task → sprint specs
   - Generator: `&reason.generate` contract — implement sprint
   - Evaluator: `&reason.evaluate` contract — grade against criteria (separate context)

### Phase 5: Context Manager (weeks 10-12)

1. **Implement ContextManager** (`harness/context_manager.ex`)
   - 60% rule: trigger compaction at 55% utilization
   - Overflow threshold: 20K token tool results offloaded to filesystem
   - Compaction: offload large results, summarize history, inject fresh Graphonomous retrieval
   - Compaction counter for telemetry

2. **Implement subagent delegation** (section 8.3)
   - Spawn subagent with fresh context via OS-006
   - Inject Graphonomous retrieval into subagent
   - Only return final summary to parent context
   - Graphonomous as shared memory between parent and subagent

### Phase 6: Session Orchestrator + MCP (weeks 12-15)

1. **Implement Session** (`harness/session.ex`)
   - GenServer supervising one orchestrated task
   - Owns: PipelineEnforcer, QualityGate, ContractValidator, SprintController, ContextManager
   - Workspace-scoped (section 14.1): workspace_id, user_id, agent_id, trigger_event
   - Sessions are independent and concurrent via DynamicSupervisor

2. **Implement Harness.Supervisor** — DynamicSupervisor for sessions

3. **Implement Model Tier Adaptation** (`harness/tier_adapter.ex`)
   - Tier-specific params from section 11.1
   - local_small: no separate planner/evaluator, single sprint, compaction at 40%
   - local_large: lightweight evaluator, 3 sprints, 3 iterations
   - cloud_frontier: full adversarial evaluator, 10 sprints, 5 iterations
   - Graceful degradation: local_small → local_large → cloud_frontier → human

4. **Implement MCP server** (`harness_mcp/server.ex`)
   - 4 tools: `harness_start_session`, `harness_sprint_status`, `harness_approve_action`, `harness_escalation_response`
   - `harness_start_session` requires `workspace_id` (section 14.1)

### Phase 7: Multi-Tenant Dark Factory (weeks 15-18)

1. **Implement dark factory session lifecycle** (section 14.4)
   - SpecPrompt ConsolidationEvent → Agentelic retrieve → OS-008 session start
   - Full pipeline: retrieve → topology → deliberate(if κ>0) → act
   - Quality gate per sprint
   - On all sprints pass: Agentelic.Build.status = :succeeded
   - Emit ConsolidationEvent to FleetPrompt

2. **Implement cross-session learning** (section 14.2)
   - On session failure: store structured outcome node in Graphonomous
   - On retry: mandatory retrieval pulls prior harness outcomes for `{agent_id, spec_hash}`
   - Planner adapts sprint decomposition from prior failure context

3. **Implement Delegatic conflict resolution** (section 14.3)
   - Enforcement order: PipelineEnforcer → ContractValidator → Delegatic (via OS-006)
   - Delegatic wins over OS-008 on policy conflicts

---

## Key Constraints

- **The harness is NOT a tool the agent calls. It is the runtime that CALLS the agent.** The harness wraps agents like a supervisor wraps processes.
- **Retrieve-before-act is enforced at ALL model tiers.** Even local_small must retrieve before any state-modifying tool call.
- **Evaluator operates in a SEPARATE context from generator.** This is non-negotiable for cloud_frontier tier. The evaluator never sees generator reasoning.
- **Sprint contracts are explicit agreements** between planner, generator, and evaluator. They include acceptance criteria, budget constraints, and governance policy.
- **The harness does NOT make LLM model choices.** It defers to Agentelic's model tier configuration.
- **Workspace scoping is mandatory.** PipelineEnforcer only allows retrieval from workspace-scoped Graphonomous data.
- **Delegatic wins over OS-008** when pipeline says "proceed" but policy says "block."
- **Context compaction triggers at 55%** (below the 60% quality degradation threshold).

---

## Audit Trail Integration

Every harness action generates an audit entry with provenance fields (section 10):

```elixir
%AuditEntry{
  session_id: "...",
  sprint_id: "...",
  goal_id: "...",
  retrieval_context_ids: ["node-abc", "node-def"],
  coverage_assessment: %{decision: :act, score: 0.82},
  causal_node_ids: ["..."],
  iteration: 2,
  evaluator_agent_id: "evaluator-sprint-001",
  delegatic_policy_id: "..."
}
```

Extended event types include: `pipeline_stage_completed`, `pipeline_stage_blocked`, `sprint_started`, `sprint_passed`, `sprint_failed`, `sprint_escalated`, `quality_gate_graded`, `contract_validated`, `contract_violated`, `confidence_gate_triggered`, `context_compacted`, `subagent_delegated`, `harness_session_started`, `harness_session_completed`.

---

## Integration Points

| System | Direction | What |
|--------|-----------|------|
| **Graphonomous** | OS-008 ↔ Graphonomous | Memory substrate — retrieval, storage, coverage queries, outcome learning |
| **Delegatic** | OS-008 ← Delegatic | Policy source — governance blocks, autonomy caps, budget limits |
| **OS-006** | OS-008 above OS-006 | Permissions — OS-008 enforces pipeline, OS-006 enforces permissions |
| **SpecPrompt** | OS-008 ← SpecPrompt | Acceptance criteria source for sprint grading |
| **Agentelic** | OS-008 ↔ Agentelic | Agentelic triggers harness sessions; harness orchestrates build agents |
| **[&] Protocol** | OS-008 ← [&] | Contract language — ampersand.json governance blocks |

---

## Success Criteria

- [ ] PipelineEnforcer blocks tool calls that violate prerequisites (retrieve-before-act)
- [ ] QualityGate spawns evaluator in isolated context and grades against acceptance criteria
- [ ] ContractValidator enforces hard constraints as blocks, soft as warnings, escalation triggers
- [ ] SprintController manages planner→generator→evaluator state machine with iteration loop
- [ ] ContextManager triggers compaction at 55% and offloads >20K token results
- [ ] Session supervises all 5 components and is workspace-scoped
- [ ] MCP server exposes 4 harness tools and responds to tool discovery
- [ ] Model tier adaptation adjusts harness behavior for local_small/local_large/cloud_frontier
- [ ] Dark factory session lifecycle processes SpecPrompt → Agentelic → OS-008 chain
- [ ] Cross-session learning retrieves prior failures for same {agent_id, spec_hash}
- [ ] Delegatic policy blocks override OS-008 pipeline approvals
- [ ] Full audit trail with provenance linking for every harness action
