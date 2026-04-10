# OpenSentience Protocol Layer — How the 10 Protocols Connect Across the [&] Ecosystem

**April 2026 -- OpenSentience**

---

## What this document covers

The [&] ecosystem has twelve products. OpenSentience sits above all of them as the **protocol layer** -- ten numbered protocols organized in two layers: eight cognitive primitives (OS-001 through OS-008) and two cross-cutting protocols (OS-009 PRISM, OS-010 PULSE). This document maps those protocols: what each one governs, which products implement it, how they depend on each other, and how data flows between them at runtime.

---

## The 10 protocols

### Cognitive primitives (OS-001 — OS-008)

| Protocol | Name | [&] Primitive | Cognitive Basis | Implemented By | Status |
|----------|------|---------------|-----------------|----------------|--------|
| OS-001 | Continual Learning | `&memory.graph` | Hippocampal consolidation (McClelland 1995) | Graphonomous | Shipped v0.4 |
| OS-002 | Topological Routing (kappa) | `&reason.deliberate` | Working memory gating (O'Reilly & Frank 2006) | Graphonomous | Spec complete |
| OS-003 | Deliberation Orchestrator | `&reason.deliberate` | Dual-process theory (Kahneman 2011) | AgenTroMatic | Spec complete |
| OS-004 | Attention Engine | meta-reasoning | Endogenous attention (Desimone & Duncan 1995) | Graphonomous | Spec complete |
| OS-005 | Model Tier Adaptation | system | Resource rationality (Lieder & Griffiths 2020) | Graphonomous/Agentelic | Spec complete |
| OS-006 | Agent Governance Shim | governance | Executive function (Miyake 2000) | `open_sentience` hex | In development |
| OS-007 | Adversarial Robustness | `&govern.identity` | Immune system analogy | OpenSentience security | Draft |
| OS-008 | Agent Harness | `&govern.harness` | Supervisory Attentional System (Norman & Shallice 1986) | OpenSentience harness | Draft |

### Cross-cutting protocols (OS-009, OS-010)

| Protocol | Name | Layer | Implemented By | Status |
|----------|------|-------|----------------|--------|
| **OS-009** | **PRISM** — Protocol for Rating Iterative System Memory | Diagnostic algebra (measures loops over time) | `/PRISM/` Elixir/OTP, Fly.io, 6 MCP machines | v3.0 in development |
| **OS-010** | **PULSE** — Protocol for Uniform Loop State Exchange | Temporal algebra (declares how loops cycle) | `/PULSE/` manifest standard, JSON Schema, reference manifests | v0.1 draft |

OS-009 and OS-010 are sibling protocols that sit **above** the eight cognitive primitives and **above** the [&] structural composition layer. PRISM measures how well a closed memory loop performs over time. PULSE declares how any loop in the ecosystem cycles, nests, and signals across boundaries. Both are independent of one another and independent of [&] — a system may adopt one without the others.

### What each protocol does

**OS-001 Continual Learning** -- Typed knowledge graph (episodic, semantic, procedural, temporal, outcome, goal nodes) with multi-timescale consolidation (fast/medium/slow/glacial). Agents learn from experience rather than forgetting between sessions.

**OS-002 Topological Routing (kappa)** -- Detects strongly connected components in the knowledge graph to determine whether a decision needs deliberation (kappa > 0) or can use the fast path (kappa = 0). Prevents both unnecessary committee overhead and unsafe unilateral action.

**OS-003 Deliberation Orchestrator** -- Multi-agent task orchestration with reputation-weighted routing. When kappa-routing triggers deliberation, OS-003 runs the 7-phase GenStateMachine: bid, overlap, negotiate, elect, execute, commit, reputation.

**OS-004 Attention Engine** -- Proactive survey-triage-dispatch loop. Scans the knowledge graph for anomalies, stale goals, low-confidence nodes, and unreviewed outcomes, then dispatches actions without waiting for external triggers.

**OS-005 Model Tier Adaptation** -- Hardware-adaptive budgets across three tiers (local_small/8B, local_large/70B+, cloud_frontier). Same topology, different depth. Ensures agents degrade gracefully on constrained hardware.

**OS-006 Agent Governance Shim** -- Permission engine, lifecycle management (installed/enabled/running/disabled), autonomy levels (observe/advise/act), and append-only audit. The thin runtime layer that wraps OTP supervision trees with policy enforcement.

**OS-007 Adversarial Robustness** -- Five threat categories (prompt injection, model poisoning, side-channel, identity spoofing, resource exhaustion) with detection and defense protocols. The immune system for the agent ecosystem.

**OS-008 Agent Harness** -- Pipeline enforcement, quality gates, sprint contracts, and context management. Ensures agents follow the correct process end-to-end, sitting above OS-006 to enforce ordering and completeness.

**OS-009 PRISM (Protocol for Rating Iterative System Memory)** -- Diagnostic benchmark engine that measures how well a closed memory loop actually learns over time. Defines the 9 continual-learning dimensions, the 4-phase evaluation loop (compose → interact → observe → reflect → diagnose), BYOR (Bring Your Own Repo) ingestion, and IRT calibration. PRISM is **PULSE-aware**: it reads any system's PULSE manifest at runtime and injects scenarios at the declared `retrieve` boundary, observing outcomes via the declared `learn` phase — no bespoke per-system integration required.

**OS-010 PULSE (Protocol for Uniform Loop State Exchange)** -- Temporal algebra that lets every loop in the ecosystem declare how it cycles, nests, and signals across boundaries. Defines the loop manifest schema, 5 canonical phase kinds (`retrieve`, `route`, `act`, `learn`, `consolidate`) plus custom phases, 5 canonical cross-loop tokens (`TopologyContext`, `DeliberationResult`, `OutcomeSignal`, `ReputationUpdate`, `ConsolidationEvent`) modeled as CloudEvents v1, 6 cadence types, 6 substrate slots, 7 invariants, and a 12-test conformance suite. Adoption is BYOL (Bring Your Own Loop) — any system that publishes a manifest validating against `pulse-loop-manifest.v0.1.json` is **PULSE-conforming** and automatically becomes **PRISM-evaluable**.

---

## Protocol dependency graph

```
OS-009 PRISM (diagnostic — measures any PULSE-conforming loop)
 |  depends on: OS-010 (reads PULSE manifests at runtime)
 |
OS-010 PULSE (temporal — declares how loops cycle and signal)
 |  depends on: (none — sibling of [&] structural layer)
 |
OS-008 Agent Harness
 |  depends on: OS-001, OS-002, OS-004, OS-005, OS-006, OS-007
 |
 +-- OS-006 Agent Governance Shim (standalone -- no protocol dependencies)
 |
 +-- OS-007 Adversarial Robustness (standalone -- feeds into OS-006 and OS-008)
 |
 +-- OS-004 Attention Engine
 |    +-- uses OS-001 (surveys the knowledge graph)
 |
 +-- OS-005 Model Tier Adaptation (standalone -- used by OS-004, OS-008)
 |
 +-- OS-003 Deliberation Orchestrator
 |    +-- builds on OS-002 (kappa routing informs deliberation)
 |
 +-- OS-002 Topological Routing
 |    +-- operates on OS-001 graph structure
 |
 +-- OS-001 Continual Learning (foundational -- no dependencies)
```

### Dependency matrix

| Protocol | Depends on | Depended on by |
|----------|-----------|----------------|
| OS-001 | (none) | OS-002, OS-004, OS-008 |
| OS-002 | OS-001 | OS-003, OS-008 |
| OS-003 | OS-002 | OS-008 |
| OS-004 | OS-001 | OS-008 |
| OS-005 | (none) | OS-004, OS-008 |
| OS-006 | (none) | OS-007, OS-008 |
| OS-007 | (none) | OS-008 |
| OS-008 | OS-001, OS-002, OS-004, OS-005, OS-006, OS-007 | (none) |
| OS-009 PRISM | OS-010 (reads manifests) | (top — diagnostic) |
| OS-010 PULSE | (none — independent of [&] and the cognitive primitives) | OS-009; every portfolio loop |

---

## How protocols connect to products

Each [&] portfolio product implements or consumes one or more OpenSentience protocols:

| Product | Implements | Consumes | PULSE loop ID | Role |
|---------|-----------|----------|---------------|------|
| **Graphonomous** | OS-001, OS-002, OS-004, OS-005 | OS-010 (publishes manifest) | `graphonomous.continual_learning` | Primary protocol implementation engine; canonical PULSE `memory` substrate |
| **AgenTroMatic** | OS-003 | OS-002, OS-010 | `agentromatic.deliberation` | Deliberation orchestrator |
| **Delegatic** | -- | OS-010 | `delegatic.governance` | Feeds policy into OS-006; canonical PULSE `policy`/`audit` substrate |
| **Agentelic** | -- | OS-005, OS-006, OS-010 | `agentelic.build_pipeline` | Agents deploy into OS-006 runtime |
| **FleetPrompt** | -- | OS-006, OS-010 | `fleetprompt.publish`, `fleetprompt.trust` | Marketplace + canonical reputation broker |
| **SpecPrompt** | -- | OS-008, OS-010 | `specprompt.spec_lifecycle` | Acceptance criteria feed OS-008 quality gates |
| **BendScript** | -- | OS-010 | `bendscript.kag_curation` | Human-curated knowledge graphs complement OS-001 |
| **TickTickClock** | -- | OS-005, OS-010 | `ticktickclock.temporal_loop` | Canonical PULSE `time` substrate (`ticktickclock://workspace/{ws_id}`) |
| **GeoFleetic** | -- | OS-005, OS-010 | `geofleetic.spatial_loop` | Spatial intelligence; nests TickTickClock for spatiotemporal pairing |
| **WebHost.Systems** | -- | OS-006, OS-010 | `webhost.deploy_invoke` | Hosting layer with swappable runtime providers (Cloudflare + AgentCore) |
| **Deliberatic** | -- | OS-003, OS-010 | `deliberatic.argumentation` | Provides formal argumentation to OS-003 |
| **PRISM** (`/PRISM/`) | OS-009 | OS-010 (reads manifests) | `prism.benchmark` | Diagnostic engine; reads any PULSE-conforming inner loop at runtime |
| **OpenSentience** | OS-006, OS-007, OS-008, OS-009, OS-010 | -- | -- | Defines all protocols, implements governance + diagnostic + temporal layers |

### Product-protocol map (visual)

```
                    OS-001 OS-002 OS-003 OS-004 OS-005 OS-006 OS-007 OS-008 OS-009 OS-010
                    ------ ------ ------ ------ ------ ------ ------ ------ ------ ------
Graphonomous          X      X             X      X                                  P
AgenTroMatic                        X                                                P
OpenSentience                                            X      X      X      X      X
PRISM                                                                         X      c
Delegatic                                              feeds                         P
Agentelic                                        c      c                            P
FleetPrompt                                             c                            P
SpecPrompt                                                            c              P
BendScript          comp                                                             P
TickTickClock                                    c                                   P
GeoFleetic                                       c                                   P
WebHost.Systems                                         c                            P
Deliberatic                         c                                                P

X = implements    c = consumes    comp = complements    feeds = provides policy input
P = publishes a PULSE loop manifest    (every product is a PULSE-conforming loop)
```

---

## Cross-protocol data flows

### 1. Governance flow (top-down)

```
Delegatic policy tree
  |
  v
OS-006 enforcement (permission check, autonomy level, deny-by-default)
  |
  v
OS-008 harness (pipeline ordering, quality gates, sprint contracts)
  |
  v
Governed agent execution
```

Policy flows downward. Delegatic defines what agents are allowed to do (boolean capabilities AND down org tree, numeric limits MIN down tree, allow-lists INTERSECTION, deny-lists UNION). OS-006 enforces those policies at runtime with microsecond-latency ETS lookups. OS-008 ensures agents follow the correct process given those permissions.

---

### 2. Knowledge flow (bottom-up)

```
Agent actions produce outcomes
  |
  v
OS-001 storage (learn_from_outcome, confidence updates)
  |
  v
OS-004 attention (survey anomalies, stale goals, low-confidence nodes)
  |
  v
Better decisions (retrieval context improves next action)
```

Knowledge flows upward. Every agent action produces an outcome node in the OS-001 knowledge graph. OS-004 periodically surveys the graph, triages findings by urgency, and dispatches corrective actions. This is the learning loop that makes the ecosystem self-improving.

---

### 3. Routing flow (kappa-driven)

```
Decision point arrives
  |
  v
OS-002 kappa-analysis (SCC detection on feedback topology)
  |
  +-- kappa = 0 --> fast path (direct execution, no deliberation)
  |
  +-- kappa > 0 --> OS-003 deliberation
                      |
                      v
                    Multi-agent bid/negotiate/elect/execute
                      |
                      v
                    OS-008 pipeline enforcement (correct process followed?)
```

Routing flows from topology to orchestration. The kappa value determines whether a decision is structurally simple (no feedback loops, safe for unilateral action) or structurally complex (feedback loops exist, deliberation required). This is earned by graph structure, not assigned by role.

---

### 4. Loop flow (PULSE temporal exchange)

```
Inner loop (e.g., graphonomous.continual_learning)
  |
  | publishes <loop>.pulse.json declaring 5 phases
  | retrieve --> route --> act --> learn --> consolidate
  |
  v
PULSE manifest (validated against pulse-loop-manifest.v0.1.json)
  |
  +-- Outer loop (e.g., prism.benchmark) reads inner manifest
  |    +-- compose: generates scenarios for declared `retrieve` boundary
  |    +-- interact: drives inner loop through declared phases
  |    +-- observe: judges outcomes via declared `learn` phase
  |    +-- reflect: evolves scenarios based on failure patterns
  |    +-- diagnose: produces leaderboard, fix suggestions, regressions
  |
  +-- Cross-loop signals (CloudEvents v1)
       +-- TopologyContext      (kappa-aware routing hints)
       +-- DeliberationResult   (AgenTroMatic outcome)
       +-- OutcomeSignal        (any learn-phase result)
       +-- ReputationUpdate     (FleetPrompt trust broker)
       +-- ConsolidationEvent   (consolidate-phase rollup)
```

PULSE turns ad-hoc inter-system integration into algebraic composition: any loop that publishes a conforming manifest is automatically composable with any other PULSE-conforming loop, without bespoke per-pair adapters. PRISM is the canonical consumer, but Delegatic governance, FleetPrompt reputation, and OS-008 harness orchestration all read manifests at runtime.

---

### 5. Security flow (threat response)

```
OS-007 threat detection (5 categories)
  |
  +-- prompt injection detected  --> OS-006 permission revocation
  +-- identity spoofing detected --> OS-006 session termination
  +-- resource exhaustion        --> OS-005 tier downgrade
  +-- model poisoning            --> OS-001 confidence quarantine
  +-- side-channel               --> OS-008 circuit breaker
```

Security flows laterally. OS-007 detects threats, then dispatches responses through the appropriate protocol. Each threat category maps to a specific enforcement mechanism in the protocol stack.

---

## The three enforcement layers

These three protocols form the runtime governance stack, each answering a different question:

```
+-----------------------------------------------------------------+
|  OS-008 Harness:   "Has this agent followed the correct process?" |
|                     Pipeline ordering, quality gates, contracts   |
+-----------------------------------------------------------------+
|  OS-006 Shim:      "Is this agent allowed to do this?"           |
|                     Permissions, lifecycle, autonomy levels       |
+-----------------------------------------------------------------+
|  OS-007 Security:  "Is this agent under attack?"                 |
|                     Threat detection, defense, circuit breakers   |
+-----------------------------------------------------------------+
```

**OS-008** is the outermost layer. It enforces that an agent's actions occur in the correct order and meet quality thresholds. A well-governed agent that skips a required step is still a broken agent.

**OS-006** is the middle layer. It enforces that the agent has permission to perform each action and is operating at the correct autonomy level. This is where Delegatic policy meets runtime enforcement.

**OS-007** is the innermost layer. It monitors for adversarial conditions and can trigger emergency responses in the layers above (permission revocation, circuit breaking, tier downgrade).

Together, they form a defense-in-depth stack: security detects threats, governance enforces permissions, and the harness enforces process.

---

## Protocol lifecycle

Each protocol progresses through a defined lifecycle:

```
Draft --> Spec Complete --> Reference Implementation --> Shipped
```

Current status (April 2026):

```
OS-001 Continual Learning        [====================================] Shipped v0.4
OS-002 Topological Routing       [========================            ] Spec complete
OS-003 Deliberation Orchestrator [========================            ] Spec complete
OS-004 Attention Engine          [========================            ] Spec complete
OS-005 Model Tier Adaptation     [========================            ] Spec complete
OS-006 Agent Governance Shim     [==================                  ] In development
OS-007 Adversarial Robustness    [============                        ] Draft
OS-008 Agent Harness             [============                        ] Draft
OS-009 PRISM                     [==============================      ] v3.0 in development
OS-010 PULSE                     [============                        ] v0.1 draft
```

---

## How the protocol layer relates to the product layer

The AmpersandBoxDesign ecosystem-overview.md describes the [&] ecosystem from the **product perspective** -- twelve products across six layers, connected by the [&] Protocol composition layer.

This document describes the same ecosystem from the **protocol perspective** -- ten cognitive, governance, diagnostic, and temporal protocols that define what those products must do, grounded in cognitive science and distributed systems theory.

The relationship is:

```
[&] Protocol (AmpersandBoxDesign)       OpenSentience Protocols (this document)
---------------------------------       ----------------------------------------
Defines HOW capabilities compose        Defines WHAT cognitive primitives exist
Product-facing: ampersand.json          Research-facing: OS-00X specifications
Compilation target: MCP, A2A            Grounding: cognitive science literature
Enforces: type safety, adjacency        Enforces: governance, process, security
```

Both layers are necessary. The [&] Protocol ensures agents are **well-typed**. OpenSentience protocols ensure agents are **well-governed**. An agent that composes correctly but ignores governance is dangerous. An agent that is well-governed but poorly composed is useless.

---

## Summary

OpenSentience defines ten protocols organized in two layers. OS-001 through OS-005 define the cognitive primitives (learning, routing, deliberation, attention, adaptation). OS-006 through OS-008 define the governance stack (permissions, security, process enforcement). OS-009 PRISM and OS-010 PULSE are sibling cross-cutting protocols that sit above both the cognitive primitives and the [&] structural layer — PULSE declares how loops cycle and signal, PRISM measures how well those loops actually learn over time.

Graphonomous is the primary implementation engine for the cognitive protocols. OpenSentience itself implements the governance, diagnostic, and temporal layers. Every [&] portfolio product publishes a PULSE loop manifest, which means every product is automatically PRISM-evaluable without bespoke per-system integration.

The key architectural insight: protocols are **defined** by OpenSentience but **implemented** by products. This separation ensures that cognitive, governance, diagnostic, and temporal primitives have a stable theoretical foundation independent of any single product's implementation choices. PULSE is what makes the composition algebraic instead of ad-hoc — manifests are the contract; runtimes are pluggable.
