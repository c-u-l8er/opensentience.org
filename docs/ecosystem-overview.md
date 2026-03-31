# OpenSentience Protocol Layer — How the 8 Protocols Connect Across the [&] Ecosystem

**March 2026 -- OpenSentience**

---

## What this document covers

The [&] ecosystem has twelve products and five cognitive primitives. OpenSentience sits above all of them as the **protocol layer** -- eight numbered protocols (OS-001 through OS-008) that define the cognitive and governance primitives every product implements. This document maps those protocols: what each one governs, which products implement it, how they depend on each other, and how data flows between them at runtime.

---

## The 8 protocols

| Protocol | Name | [&] Primitive | Cognitive Basis | Implemented By | Status |
|----------|------|---------------|-----------------|----------------|--------|
| OS-001 | Continual Learning | `&memory.graph` | Hippocampal consolidation (McClelland 1995) | Graphonomous | Shipped v0.1.12 |
| OS-002 | Topological Routing (kappa) | `&reason.deliberate` | Working memory gating (O'Reilly & Frank 2006) | Graphonomous | Spec complete |
| OS-003 | Deliberation Orchestrator | `&reason.deliberate` | Dual-process theory (Kahneman 2011) | AgenTroMatic | Spec complete |
| OS-004 | Attention Engine | meta-reasoning | Endogenous attention (Desimone & Duncan 1995) | Graphonomous | Spec complete |
| OS-005 | Model Tier Adaptation | system | Resource rationality (Lieder & Griffiths 2020) | Graphonomous/Agentelic | Spec complete |
| OS-006 | Agent Governance Shim | governance | Executive function (Miyake 2000) | `open_sentience` hex | In development |
| OS-007 | Adversarial Robustness | `&govern.identity` | Immune system analogy | OpenSentience security | Draft |
| OS-008 | Agent Harness | `&govern.harness` | Supervisory Attentional System (Norman & Shallice 1986) | OpenSentience harness | Draft |

### What each protocol does

**OS-001 Continual Learning** -- Typed knowledge graph (episodic, semantic, procedural, temporal, outcome, goal nodes) with multi-timescale consolidation (fast/medium/slow/glacial). Agents learn from experience rather than forgetting between sessions.

**OS-002 Topological Routing (kappa)** -- Detects strongly connected components in the knowledge graph to determine whether a decision needs deliberation (kappa > 0) or can use the fast path (kappa = 0). Prevents both unnecessary committee overhead and unsafe unilateral action.

**OS-003 Deliberation Orchestrator** -- Multi-agent task orchestration with reputation-weighted routing. When kappa-routing triggers deliberation, OS-003 runs the 7-phase GenStateMachine: bid, overlap, negotiate, elect, execute, commit, reputation.

**OS-004 Attention Engine** -- Proactive survey-triage-dispatch loop. Scans the knowledge graph for anomalies, stale goals, low-confidence nodes, and unreviewed outcomes, then dispatches actions without waiting for external triggers.

**OS-005 Model Tier Adaptation** -- Hardware-adaptive budgets across three tiers (local_small/8B, local_large/70B+, cloud_frontier). Same topology, different depth. Ensures agents degrade gracefully on constrained hardware.

**OS-006 Agent Governance Shim** -- Permission engine, lifecycle management (installed/enabled/running/disabled), autonomy levels (observe/advise/act), and append-only audit. The thin runtime layer that wraps OTP supervision trees with policy enforcement.

**OS-007 Adversarial Robustness** -- Five threat categories (prompt injection, model poisoning, side-channel, identity spoofing, resource exhaustion) with detection and defense protocols. The immune system for the agent ecosystem.

**OS-008 Agent Harness** -- Pipeline enforcement, quality gates, sprint contracts, and context management. Ensures agents follow the correct process end-to-end, sitting above OS-006 to enforce ordering and completeness.

---

## Protocol dependency graph

```
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
| OS-008 | OS-001, OS-002, OS-004, OS-005, OS-006, OS-007 | (none -- top of stack) |

---

## How protocols connect to products

Each [&] portfolio product implements or consumes one or more OpenSentience protocols:

| Product | Implements | Consumes | Role |
|---------|-----------|----------|------|
| **Graphonomous** | OS-001, OS-002, OS-004, OS-005 | -- | Primary protocol implementation engine |
| **AgenTroMatic** | OS-003 | OS-002 (routing triggers deliberation) | Deliberation orchestrator |
| **Delegatic** | -- | -- | Feeds policy into OS-006 enforcement |
| **Agentelic** | -- | OS-005 (tier budgets), OS-006 (deploy gate) | Agents deploy into OS-006 runtime |
| **FleetPrompt** | -- | OS-006 (install gate) | Marketplace agents enter OS-006 on install |
| **SpecPrompt** | -- | OS-008 (quality gates) | Acceptance criteria feed OS-008 quality gates |
| **BendScript** | -- | -- | Human-curated knowledge graphs complement OS-001 |
| **TickTickClock** | -- | OS-005 (tier adaptation) | Temporal intelligence uses OS-005 for tier adaptation |
| **GeoFleetic** | -- | OS-005 (tier adaptation) | Spatial intelligence uses OS-005 for tier adaptation |
| **WebHost.Systems** | -- | OS-006 (hosting) | Hosts OS-006 runtimes for deployed agents |
| **Deliberatic** | -- | OS-003 (argumentation engine) | Provides formal argumentation to OS-003 |
| **OpenSentience** | OS-006, OS-007, OS-008 | -- | Defines all protocols, implements governance layer |

### Product-protocol map (visual)

```
                    OS-001  OS-002  OS-003  OS-004  OS-005  OS-006  OS-007  OS-008
                    ------  ------  ------  ------  ------  ------  ------  ------
Graphonomous          X       X               X       X
AgenTroMatic                          X
OpenSentience                                                 X       X       X
Delegatic                                                   feeds
Agentelic                                             c       c
FleetPrompt                                                   c
SpecPrompt                                                                    c
BendScript          comp
TickTickClock                                         c
GeoFleetic                                            c
WebHost.Systems                                               c

X = implements    c = consumes    comp = complements    feeds = provides policy input
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

### 4. Security flow (threat response)

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

Current status (March 2026):

```
OS-001 Continual Learning        [====================================] Shipped v0.1.12
OS-002 Topological Routing       [========================            ] Spec complete
OS-003 Deliberation Orchestrator [========================            ] Spec complete
OS-004 Attention Engine          [========================            ] Spec complete
OS-005 Model Tier Adaptation     [========================            ] Spec complete
OS-006 Agent Governance Shim     [==================                  ] In development
OS-007 Adversarial Robustness    [============                        ] Draft
OS-008 Agent Harness             [============                        ] Draft
```

---

## How the protocol layer relates to the product layer

The AmpersandBoxDesign ecosystem-overview.md describes the [&] ecosystem from the **product perspective** -- twelve products across six layers, connected by the [&] Protocol composition layer.

This document describes the same ecosystem from the **protocol perspective** -- eight cognitive and governance protocols that define what those products must do, grounded in cognitive science and distributed systems theory.

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

OpenSentience defines eight protocols spanning cognition, governance, and security. OS-001 through OS-005 define the cognitive primitives (learning, routing, deliberation, attention, adaptation). OS-006 through OS-008 define the governance stack (permissions, security, process enforcement).

Graphonomous is the primary implementation engine for the cognitive protocols. OpenSentience itself implements the governance stack. Every other [&] product either feeds into or consumes from one or more protocols.

The key architectural insight: protocols are **defined** by OpenSentience but **implemented** by products. This separation ensures that cognitive and governance primitives have a stable theoretical foundation independent of any single product's implementation choices.
