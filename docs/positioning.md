# The Missing Constraint: Runtime Governance in the Agent Stack

> "The industry builds agents like scripts — deploy and pray."

---

## 1. Introduction

OpenSentience is the research arm and runtime governance layer of the [&] Protocol ecosystem. It publishes ten numbered protocols organized in two layers: eight cognitive primitives (OS-001 through OS-008), each grounded in cognitive science, and two cross-cutting protocols — **OS-009 PRISM** (diagnostic algebra that measures how well a closed memory loop actually learns over time) and **OS-010 PULSE** (temporal algebra that lets every loop in the ecosystem declare how it cycles, nests, and signals across boundaries). It ships three runtime artifacts: the `open_sentience` hex package implementing OS-006 (Agent Governance Shim), the **PRISM benchmark engine** (`/PRISM/`, Elixir/OTP, Fly.io, 6 MCP machines, [prism.opensentience.org](https://prism.opensentience.org)), and the **PULSE manifest standard** (`/PULSE/`, JSON Schema + reference manifests, [pulse.opensentience.org](https://pulse.opensentience.org)).

OpenSentience is not a product. It is a research organization that produces specifications, cognitive science grounding, and three enforcement/diagnostic artifacts. The [&] portfolio companies implement the protocols. OpenSentience defines them, validates their theoretical foundations, and provides the minimal governance, diagnostic, and temporal layers that tie them together at runtime.

The problem it addresses is straightforward: the agent ecosystem has mature tools for building agents but no standard primitives for governing them.

---

## 2. The Governance Vacuum in AI Agents

Agent frameworks have converged on a recognizable capability stack. You can wire tools, chain prompts, coordinate multiple agents, and deploy behind an API. What you cannot do, with any mainstream framework, is answer basic governance questions at runtime:

- What is this agent permitted to do?
- What did this agent actually do, and in what order?
- Can this agent's authority be revoked without restarting the system?
- How much autonomy does this agent have, and who changed it last?
- Did this agent follow the required pipeline, or did it skip retrieval and fabricate provenance?

These are not hypothetical concerns. They are the questions that any regulated enterprise, any safety-critical deployment, and any multi-agent system operating beyond demo scale must answer before production.

The gap is not in capability — it is in constraint.

| What exists today | What is missing |
|---|---|
| Tool connectivity (MCP) | Permission model for tool access |
| Agent coordination (A2A) | Lifecycle management for coordinated agents |
| Prompt chains and DAGs | Audit trail across decision paths |
| Role-based agent design | Graduated autonomy with runtime enforcement |
| Ad-hoc safety guardrails | Cognitive science grounding for governance design |
| Pipeline definitions | Pipeline enforcement (did the agent actually follow the pipeline?) |

Frameworks like CrewAI, LangGraph, and AutoGen provide the building blocks. None of them provide the governance primitives. The result is that governance is either absent, hand-rolled per deployment, or reduced to prompt-level instructions that the model may or may not follow.

---

## 3. Where OpenSentience Sits in the Stack

OpenSentience occupies a specific layer: between capability declaration and capability implementation.

```
┌─────────────────────────────────────────────────────────────┐
│                    Human Operators                          │
│              (monitoring, approval, policy)                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   OS-009: PRISM  (diagnostic — measures loops over time)    │
│   9 CL dimensions, BYOR, IRT, leaderboards                  │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   OS-010: PULSE  (temporal — declares how loops cycle)      │
│   Loop manifest standard, 5 phase kinds, 5 tokens           │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   OS-008: Agent Harness                                     │
│   Pipeline enforcement, quality gates, sprint contracts     │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   OS-006: Governance Shim  (open_sentience hex package)     │
│   Permissions, lifecycle, autonomy, audit                   │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   [&] Protocol  (structural — composes capabilities)        │
│   &memory, &reason, &time, &space, &govern                  │
│   (ampersand.json)                                          │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   Implementations                                           │
│   Graphonomous (OS-001, OS-002, OS-004, OS-005)             │
│   AgenTroMatic (OS-003)                                     │
│   Delegatic (policy)                                        │
│   Agentelic (model selection)                               │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   Infrastructure                                            │
│   MCP servers, A2A coordination, Supabase, OTP runtime      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

PRISM and PULSE sit **above** OS-008 in this stack, but they are conceptually
sibling cross-cutting protocols rather than another layer of enforcement: PULSE
declares how every loop in the ecosystem cycles, nests, and signals; PRISM
reads any PULSE-conforming manifest and benchmarks the inner loop's learning
quality. Both are independent of [&], independent of OS-006/OS-007/OS-008, and
independent of one another — a system may adopt one without the others.

The key relationship: the [&] Protocol declares *what* an agent is composed of. OpenSentience governs *how* that composition behaves at runtime. The implementations do the actual cognitive work. OpenSentience does not do work — it constrains work.

The protocols are specifications, not implementations. OS-001 (Continual Learning) defines how a knowledge graph should behave. Graphonomous implements it. OS-003 (Deliberation) defines how multi-agent consensus should work. AgenTroMatic implements it. OS-006 (Governance Shim) is the exception: OpenSentience both specifies and implements it, because the governance layer must be a single, trusted enforcement point.

---

## 4. What Other Governance Approaches Exist

OpenSentience is not the first project to address agent governance. Several approaches exist, each solving a different slice of the problem.

| Approach | What it governs | Mechanism | Limitation |
|---|---|---|---|
| **Anthropic Constitutional AI** | Model output alignment | Training-time constitutional principles | Applies at generation, not at runtime execution. Cannot enforce pipeline ordering or revoke permissions mid-session. |
| **Guardrails AI** | Input/output validation | Schema-based validators on LLM calls | Validates content, not behavior. No lifecycle management, no autonomy levels, no audit trail. |
| **NVIDIA NeMo Guardrails** | Conversational flow | Colang dialogue rails | Constrains conversation topology. Does not address tool permissions, agent lifecycle, or multi-agent governance. |
| **LangGraph state machines** | Workflow sequencing | Graph-based state transitions | Defines *what* happens next. Does not enforce *whether it is permitted*, audit *what happened*, or manage agent lifecycle. |
| **CrewAI roles** | Agent responsibility | Role assignment with backstory/goal | Descriptive, not enforceable. Roles are prompt context, not runtime constraints. No deny-by-default permission model. |
| **AutoGen groupchat** | Turn-taking in multi-agent conversations | Speaker selection function | Manages who speaks, not what they are allowed to do. No permission taxonomy, no lifecycle states. |
| **OpenAI function calling** | Tool selection | Schema-constrained function invocation | Controls tool interface shape, not tool access policy. No mechanism to revoke tool access or audit tool usage history. |

These approaches share a common pattern: they govern at the content level (what the model says) or the workflow level (what step comes next), but not at the runtime level (what the agent is permitted to do, what it actually did, and whether its authority can be changed).

OpenSentience operates at the runtime level. It governs the agent process itself — its lifecycle, its permissions, its autonomy, and its audit trail.

---

## 5. What OpenSentience Adds

### 5.1 Ten Protocols (Eight Cognitive Primitives + Two Cross-Cutting)

OpenSentience publishes ten protocols organized in two layers. The eight cognitive primitives each define one capability, ground it in established cognitive science, and specify the interface contract that implementations must satisfy. The two cross-cutting protocols sit above them and above [&]'s structural composition layer.

| Protocol | Name | Cognitive Grounding | [&] Primitive | Status |
|---|---|---|---|---|
| OS-001 | Continual Learning | Hippocampal consolidation (McClelland et al. 1995) | `&memory.graph` | Shipped (Graphonomous v0.4) |
| OS-002 | Topological Routing (kappa) | Working memory gating (O'Reilly & Frank 2006) | `&reason.deliberate` | Spec complete |
| OS-003 | Deliberation Orchestrator | Dual-process theory (Kahneman 2011) | `&reason.deliberate` | Spec complete |
| OS-004 | Attention Engine | Endogenous attention (Desimone & Duncan 1995) | meta-reasoning | Spec complete |
| OS-005 | Model Tier Adaptation | Resource rationality (Lieder & Griffiths 2020) | system | Spec complete |
| OS-006 | Agent Governance Shim | Executive function (Miyake et al. 2000) | governance | In development |
| OS-007 | Adversarial Robustness | Immune system — self/non-self discrimination | `&govern.identity` | Draft |
| OS-008 | Agent Harness | Supervisory attentional system (Norman & Shallice 1986) | `&govern.harness` | Draft |
| **OS-009** | **PRISM** — Protocol for Rating Iterative System Memory | Meta-cognition + psychometrics (IRT, signal detection theory) | `&memory + &reason` (diagnostic) | v3.0 in development |
| **OS-010** | **PULSE** — Protocol for Uniform Loop State Exchange | Closed-loop control theory + temporal cognition | `&memory + &govern + &time` (temporal) | v0.1 draft |

The first five protocols (OS-001 through OS-005) define cognitive capabilities. OS-006 through OS-008 define the governance stack. OS-009 PRISM and OS-010 PULSE are sibling cross-cutting protocols: PULSE declares how loops cycle and signal, PRISM measures how well those loops actually learn over time. Together, the ten protocols provide a complete specification for how an agent system should remember, reason, attend, adapt, defend itself, be governed, declare its temporal structure, and prove its learning capacity over time.

### 5.2 The Governance Shim (OS-006)

The governance shim is the only protocol that OpenSentience implements directly. It is distributed as the `open_sentience` hex package — a dependency, not a daemon. You add it to `mix.exs` and it wraps your existing OTP supervision tree.

The shim provides four runtime primitives:

**Lifecycle management.** Every agent has a formal lifecycle: installed, enabled, running, disabled. Transitions between states are policy-governed and audit-logged. An agent cannot run without being explicitly enabled. An agent can be emergency-stopped by transitioning directly from running to disabled.

**Permission engine.** Deny-by-default permission model with a four-category taxonomy: filesystem, network, tool invocation, and graph access. Permissions are evaluated as explicit deny > explicit allow > default deny. Permission lookups use ETS for sub-microsecond latency.

**Graduated autonomy.** Three levels — observe, advise, act — let organizations increase agent authority incrementally. At observe, the agent generates recommendations but takes no action. At advise, the agent prepares actions and waits for human approval. At act, the agent executes within policy boundaries. Autonomy level is per-agent, changeable at runtime, and audit-logged on every change.

**Append-only audit.** Every permission check, lifecycle transition, autonomy change, and action execution is logged immutably. No updates. No deletes. The audit trail is the ground truth for what happened.

### 5.3 The Agent Harness (OS-008)

OS-008 sits above OS-006. Where the governance shim enforces *permissions* (can this agent call this tool?), the harness enforces *pipelines* (did this agent retrieve before acting? did it check coverage before dispatching? did it store its outcome?).

The harness is the runtime that calls the agent, not a tool the agent calls. It enforces:

- **Pipeline ordering** — the reactive pipeline (`query |> recall |> topology |> deliberate |> store`) must execute in sequence. No skipping steps.
- **Quality gates** — each pipeline stage must meet confidence thresholds before the next stage proceeds.
- **Sprint contracts** — bounded execution contexts with explicit goals, budgets, and success criteria.
- **Context management** — the harness controls what enters the agent's context window, preventing context pollution and enforcing retrieval.

The cognitive grounding is Norman and Shallice's Supervisory Attentional System (1986): routine behavior runs automatically through contention scheduling, but a supervisory system intervenes when novel, dangerous, or constraint-violating situations arise. OS-008 is that supervisory system for agent pipelines.

### 5.4 Design Principles That Distinguish OpenSentience

**Deny by default.** No implicit permissions. This is the opposite of the current industry default, where agents have access to everything unless explicitly blocked. OpenSentience inverts the model: nothing is permitted unless explicitly allowed.

**Append-only audit.** The audit trail cannot be modified after the fact. This is a hard constraint, not a best practice. It makes the system suitable for regulated environments where post-hoc reconstruction of agent behavior is legally required.

**Graduated autonomy.** The three-level model (observe, advise, act) is a practical response to a real deployment problem: organizations need to build trust in agents incrementally. Binary on/off autonomy forces a premature commitment.

**Protocols, not products.** The ten protocols are specifications that any implementation can satisfy. This keeps the governance, diagnostic, and temporal layers open and prevents vendor lock-in. OpenSentience ships three implementations directly (OS-006 governance shim, OS-009 PRISM benchmark engine, OS-010 PULSE manifest standard); the rest are implemented by other [&] portfolio companies or by any conforming third party. PULSE in particular is BYOL — Bring Your Own Loop — any system that publishes a manifest validating against `pulse-loop-manifest.v0.1.json` is automatically PULSE-conforming and PRISM-evaluable.

---

## 6. The Research-First Approach

OpenSentience's protocols are not named after cognitive science concepts for marketing purposes. Each protocol's design constraints are derived from the cognitive science grounding, and those constraints are falsifiable.

For example:

- OS-001 (Continual Learning) is grounded in hippocampal consolidation. The design constraint: new memories must be buffered before integration to avoid catastrophic interference. This is not a metaphor — it is a structural requirement that prevents the knowledge graph from being destabilized by rapid ingestion. If you skip the buffer, you get interference effects analogous to those documented in McClelland et al. (1995).

- OS-002 (Topological Routing) is grounded in working memory gating by the prefrontal cortex. The design constraint: context window access must be actively gated based on topological relevance, not passively retrieved by embedding similarity alone. This produces measurably different retrieval behavior than pure vector search.

- OS-006 (Governance Shim) is grounded in executive function — specifically, inhibitory control and self-monitoring (Miyake et al. 2000). The design constraint: the governance layer must be able to inhibit (block), monitor (audit), and switch (change autonomy level) agent behavior. These three operations map directly to the three core executive functions.

The research-first approach produces two practical benefits:

1. **Design constraints are principled, not arbitrary.** When a design decision arises (should the audit trail allow updates? should permissions be allow-by-default?), the cognitive science grounding provides a justified answer rather than an opinion.

2. **Open questions are explicit.** OpenSentience publishes its open research questions — optimal consolidation frequency, kappa calibration, deliberation termination criteria, attention fatigue, autonomy trust metrics. These are active research directions, not solved problems, and the organization is transparent about that.

---

## 7. Why Elixir/OTP

The governance shim is implemented in Elixir on OTP. This is a deliberate technology choice driven by the governance domain's requirements, not by language preference.

| Governance requirement | OTP pattern | Why it fits |
|---|---|---|
| Agent lifecycle states (installed, enabled, running, disabled) | `GenStateMachine` | Formal state machines with typed transitions are the native abstraction. No state machine library needed. |
| Permission lookups at microsecond latency | ETS tables | In-memory concurrent reads with no contention. Permission checks are on the hot path of every agent operation. |
| Append-only audit at high throughput | `GenServer` with batched writes | Broadway-style batching absorbs burst audit events without backpressure on the governed agent. |
| Wrapping existing agent processes | `Supervisor.child_spec/1` decoration | The shim wraps any OTP child spec. It does not require agents to inherit from a base class or implement a specific interface. |
| Hot policy updates without restart | Hot code upgrades | Governance policy can change at runtime — new permissions, new autonomy levels — without restarting governed agents. |
| Fault isolation between governed agents | Process isolation + supervision trees | One agent crashing does not affect other governed agents. The supervisor restarts the failed agent within its lifecycle constraints. |
| Multi-node governance | Distributed Erlang / `libcluster` | Governance state can be replicated across nodes. ETS tables are per-node, but the permission engine can synchronize policy via distributed calls. |

The key insight is that agent governance is fundamentally a supervision problem. You have a population of processes (agents) that need lifecycle management, permission enforcement, state tracking, and fault isolation. OTP was designed for exactly this class of problem — it has been solving it in telecom and distributed systems for decades.

An alternative implementation in Python or TypeScript would need to import a state machine library, build a concurrent cache, implement process isolation (likely via containers or subprocess management), and handle fault recovery manually. In OTP, these are built-in language-level constructs.

---

## 8. Reading Path

### If you want to understand the governance problem

1. This document (positioning and context)
2. `docs/spec/README.md` section 1 — the problem statement, design principles, and founding thesis

### If you want to understand the protocols

1. `docs/spec/README.md` section 4 — all ten protocols with cognitive science grounding
2. `docs/spec/README.md` section 5 — cognitive science mapping table and open research questions
3. `docs/spec/OS-008-HARNESS.md` — the harness protocol in full (pipeline enforcement, quality gates, sprint contracts)
4. `docs/spec/OS-009-PRISM-SPECIFICATION.md` — PRISM diagnostic benchmark protocol
5. `docs/spec/OS-010-PULSE-SPECIFICATION.md` — PULSE loop manifest standard
6. `docs/spec/OS-E001-EMPIRICAL-EVALUATION.md` — empirical evaluation of topology-aware continual learning

### If you want to understand the governance shim implementation

1. `docs/spec/README.md` section 2 — architecture diagram and OTP supervision tree
2. `docs/spec/README.md` section 4.6 — permission taxonomy, lifecycle states, autonomy levels, audit trail schema
3. `docs/spec/README.md` section 3 — technology stack and rationale

### If you want to understand how OpenSentience relates to the [&] ecosystem

1. Section 3 of this document (stack diagram)
2. `AmpersandBoxDesign/docs/positioning.md` — the [&] Protocol positioning (the composition layer that OpenSentience governs)
3. `graphonomous/docs/spec/README.md` — the primary implementation of OS-001, OS-002, OS-004, OS-005
4. `agentromatic.com/docs/spec/README.md` — the implementation of OS-003 (deliberation)

### If you want to compare OpenSentience to other governance approaches

1. Section 4 of this document (comparison table)
2. `docs/spec/README.md` section 1.1 — the governance gap table

---

*OpenSentience is part of the [&] Protocol ecosystem. Apache 2.0 licensed. Research and governance for machine cognition.*
