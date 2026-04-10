# Frequently Asked Questions

> Common questions about OpenSentience scope, design, integration, and the
> harness protocol.

---

## Is OpenSentience a product?

No. OpenSentience is a **research organization** that publishes ten numbered
protocols organized in two layers — eight cognitive primitives (OS-001 through
OS-008) and two cross-cutting protocols (OS-009 PRISM diagnostic, OS-010 PULSE
temporal) — and ships three runtime artifacts: the `open_sentience` hex package
implementing OS-006 (governance shim) and OS-008 (agent harness), the **PRISM
benchmark engine** (`/PRISM/`, Elixir/OTP, Fly.io, 6 MCP machines), and the
**PULSE manifest standard** (`/PULSE/`, JSON Schema + reference manifests).

It does not have a UI, a SaaS offering, or a pricing page. The hex package is
a library dependency consumed by other [&] ecosystem products. PRISM runs as
a separate benchmark engine that any system can opt into via its PULSE
manifest. PULSE is a manifest standard with no required runtime.

---

## Why ten protocols?

The eight cognitive primitives each map to a well-established finding in
cognitive science. The two cross-cutting protocols add diagnostic and temporal
algebras above the cognitive layer:

| Protocol | Cognitive Basis |
|----------|----------------|
| OS-001 Continual Learning | Hippocampal consolidation (McClelland et al. 1995) |
| OS-002 Topological Routing | Working memory gating (O'Reilly & Frank 2006) |
| OS-003 Deliberation | Dual-process theory (Kahneman 2011) |
| OS-004 Attention Engine | Endogenous attention (Desimone & Duncan 1995) |
| OS-005 Model Tier Adaptation | Resource rationality (Lieder & Griffiths 2020) |
| OS-006 Governance Shim | Executive function (Miyake et al. 2000) |
| OS-007 Adversarial Robustness | Immune system — self/non-self discrimination |
| OS-008 Agent Harness | Supervisory attentional system (Norman & Shallice 1986) |
| **OS-009 PRISM** | Meta-cognition + psychometrics (IRT, signal detection theory) |
| **OS-010 PULSE** | Closed-loop control theory + temporal cognition |

The original six protocols covered cognitive primitives and runtime governance.
OS-007 was added to address adversarial threats (prompt injection, knowledge
poisoning, agent impersonation). OS-008 was added to enforce pipeline ordering,
quality gates, and sprint contracts — the missing orchestration layer above
OS-006. OS-009 PRISM was added once we needed a way to measure how well a
closed memory loop actually learns over time. OS-010 PULSE was added once we
realized every loop in the [&] portfolio could be described with the same
manifest schema, and that PRISM could read those manifests at runtime instead
of requiring bespoke per-system integration.

---

## Why Elixir for the governance shim?

OTP patterns map directly to the governance domain:

- **GenStateMachine** models agent lifecycle states and validated transitions
- **DynamicSupervisor** manages variable numbers of governed agents at runtime
- **ETS** provides microsecond-latency permission lookups without GenServer bottlenecks
- **GenServer** serializes state mutations (permission changes, audit writes)
- **PubSub** enables real-time policy propagation from Delegatic

The shim needs exactly the concurrency, fault-tolerance, and state management
primitives that OTP provides natively.

---

## How does OpenSentience relate to Delegatic?

**Delegatic defines policy. OpenSentience enforces it.**

Delegatic is the governance authoring layer — it lets operators write policies
about what agents may do. OpenSentience subscribes to those policies and
enforces them at runtime via the PermissionEngine and AutonomyController.

Without Delegatic, you can still use OpenSentience with locally configured
permissions. But for multi-agent, multi-stakeholder governance, Delegatic
provides the policy source of truth.

---

## What is the runtime overhead?

The shim is designed to be negligible:

| Metric | Target |
|--------|--------|
| CPU | < 1% overhead |
| Memory | < 5 MB RSS |
| Permission check | < 2 microseconds (ETS direct read) |
| Audit write | < 1 ms (batched) |
| Agent install | < 10 ms |

If your application already runs OTP, the shim adds one supervision subtree
with a handful of GenServers and two ETS tables.

---

## Can I use it without the rest of [&]?

Yes. The `open_sentience` hex package wraps any OTP `child_spec`. It does not
depend on Graphonomous, Delegatic, AgenTroMatic, or any other [&] package.

You lose cross-product features (Delegatic policy sync, Graphonomous
graph_access governance, Agentelic manifest import), but the core governance
loop — install, permission, lifecycle, autonomy, audit — works standalone.

---

## What is graduated autonomy?

A trust-building progression for agent capabilities:

1. **Observe** — the agent generates recommendations but takes no action.
   All proposed actions are logged. The operator reviews.
2. **Advise** — the agent prepares actions and queues them for human approval.
   The operator approves or rejects each action before execution.
3. **Act** — the agent executes autonomously within its granted permissions.
   Actions are still audited but no longer require approval.

Every agent starts at `observe`. Promotion to higher levels is an explicit
operator action, recorded in the audit trail. Demotion is always available
and immediate.

---

## Do the protocols prescribe implementation details?

No. The protocols are specifications, not implementations. OS-001 specifies
*what* continual learning must do (consolidate, decay, merge). It does not
mandate SQLite, ETS, or any particular storage engine.

Graphonomous is the reference implementation of OS-001, OS-002, OS-004, and
OS-005. Other implementations are welcome — the protocol is the contract,
not the code.

---

## What is OS-007 (Adversarial Robustness)?

OS-007 defines how agent systems detect and defend against adversarial inputs,
compromised agents, and knowledge poisoning. It covers five threat categories:

| Threat | Defense |
|--------|---------|
| Prompt injection | Input sanitization, structured validation, canary tokens |
| Knowledge poisoning (BadRAG/TrojanRAG) | Provenance tracking, confidence decay, outcome verification |
| Agent impersonation | Manifest hash verification, A2A handshake, PID binding |
| Privilege escalation | Monotonic policy inheritance, goal-scoped audit |
| Denial of service | Budget enforcement, deliberation depth limits, circuit breakers |

The cognitive grounding is the adaptive immune system — combining known-signature
defense (like T-cell receptors) with anomaly detection (like innate immunity).

---

## What is OS-008 (Agent Harness)?

OS-008 is the **enforcement runtime that sits above agents and below humans**.
It orchestrates the [&] pipelines, enforces governance contracts, gates execution
on epistemic confidence, and ensures that no agent skips retrieval, fabricates
provenance, or acts beyond its coverage.

The harness is not a tool the agent calls — it is the runtime that calls the
agent. It consists of five components:

| Component | Responsibility |
|-----------|---------------|
| PipelineEnforcer | Ensures retrieve-before-act, topology-before-deliberate |
| QualityGate | Spawns evaluator in separate context, grades against criteria |
| ContractValidator | Enforces [&] governance blocks at runtime |
| SprintController | Manages planner → generator → evaluator loop |
| ContextManager | Handles 60% degradation threshold with compaction |

See [harness-engineering.md](harness-engineering.md) for the discipline overview,
or [spec/OS-008-HARNESS](spec/OS-008-HARNESS.md) for the full specification.

---

## What is the difference between OS-006 and OS-008?

**OS-006 answers:** "Is this agent allowed to do this?" (permissions)
**OS-008 answers:** "Has this agent followed the correct process?" (pipeline enforcement)

OS-006 checks that an agent has the right to call a tool. OS-008 checks that
the agent has completed all prerequisite steps before calling that tool. Both
must pass for an action to execute. Both log to the same audit trail.

```
Agent requests tool call
  → OS-008: Are prerequisites met? (retrieve-before-act, etc.)
  → OS-006: Does the agent have permission?
  → Both pass → tool executes
```

---

## What is a harness vs. a tool?

A harness wraps **around** an agent. A tool sits **below** an agent.

| Layer | Position | Controls |
|-------|----------|----------|
| Harness | Above agent | Pipeline order, quality gates, sprint contracts |
| Governance | At agent boundary | Permissions, audit, autonomy |
| Tools | Below agent | Memory, reasoning, deliberation |

The harness decides *when* the agent runs and *what* it runs. Tools are what
the agent uses during its run. OS-008 is the harness. Graphonomous MCP tools
are the tools.

---

## Why separate the evaluator from the generator?

Anthropic's harness research (2026) demonstrated that when a generator evaluates
its own work, it consistently over-praises — even when the output is non-functional.
The generator has sunk-cost bias toward its own decisions.

OS-008 enforces evaluator isolation: the evaluator gets a fresh context containing
only the sprint spec, acceptance criteria, and output artifacts. It does not see
the generator's reasoning or prior iterations. This separation is architectural,
not advisory.

The cognitive science grounding is **metacognitive monitoring** (Flavell 1979) —
the brain's ability to evaluate its own cognitive processes is separate from
the processes themselves.

---

## What is the 60% rule?

Research consensus: output quality degrades at approximately 60% context
utilization, not at the hard limit. A 200K-token model becomes unreliable
around 130K tokens. Performance follows a U-shaped curve — strong attention
at beginning and end, poor attention in the middle.

OS-008's ContextManager triggers compaction at 55% to stay below this threshold.
It offloads large tool results to filesystem and injects fresh Graphonomous
retrieval into compacted contexts.

---

## How do I contribute?

OpenSentience protocols are published in `opensentience.org/docs/spec/`.
The governance shim source will live in a dedicated hex package repository.
Contributions should align with the relevant protocol specification before
modifying implementation code.

See the [&] Protocol contributing guidelines in
`AmpersandBoxDesign/CONTRIBUTING.md` for general conventions.
