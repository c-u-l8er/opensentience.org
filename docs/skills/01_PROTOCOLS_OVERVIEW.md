# Skill 01 — The Ten Protocols

> OS-001 through OS-010: what each protocol specifies, which product
> implements it, and the cognitive science behind it. Eight cognitive
> primitives plus two cross-cutting protocols (PRISM diagnostic, PULSE
> temporal).

---

## Overview

OpenSentience publishes ten numbered protocols organized in two layers:

- **Cognitive primitives (OS-001 — OS-008)** — eight individual capabilities,
  each grounded in a cognitive science thread.
- **Cross-cutting protocols (OS-009 PRISM, OS-010 PULSE)** — two sibling
  protocols that sit above the cognitive primitives and above the [&]
  structural composition layer. PULSE declares how every loop in the
  ecosystem cycles, nests, and signals; PRISM measures how well those loops
  actually learn over time.

The protocols are independent specifications — they can be adopted
individually or composed together. A system may publish a PULSE manifest
without implementing any cognitive primitive, and PRISM can benchmark any
PULSE-conforming system without bespoke per-system integration.

---

## OS-001: Continual Learning

**Cognitive basis:** Hippocampal consolidation (McClelland et al. 1995)

**What it specifies:**
- Three node types: episodic (events), semantic (facts), procedural (workflows)
- Typed, weighted edges between nodes
- Confidence scores with evidence-calibrated assignment
- Consolidation cycle: decay low-confidence nodes, prune stale entries,
  merge near-duplicates, strengthen co-retrieved edges
- Memory timescales: working memory (session), short-term (hours), long-term
  (persistent)

**Design constraint from cognitive science:** New memories must be stored
quickly (hippocampal fast-write) without disrupting existing knowledge
(neocortical slow-consolidation). This maps to immediate ETS/SQLite writes
with background consolidation.

**Implemented by:** Graphonomous (`store_node`, `store_edge`, `retrieve_context`,
`run_consolidation`)

---

## OS-002: Topological Routing (kappa)

**Cognitive basis:** Working memory gating (O'Reilly & Frank 2006)

**What it specifies:**
- The kappa parameter: a measure of cyclicity in a knowledge subgraph
- Strongly connected component (SCC) detection on retrieved neighborhoods
- Routing decision: kappa = 0 implies fast path (acyclic, no conflict),
  kappa > 0 implies deliberate path (cycles exist, may contain contradictions)
- Topological features: SCC count, max SCC size, edge density within cycles

**Design constraint from cognitive science:** The prefrontal cortex gates
information into working memory based on relevance and conflict signals.
Kappa serves as the conflict signal — cyclic knowledge regions indicate
unresolved tension that requires deliberation before action.

**Implemented by:** Graphonomous routing layer (`topology_analyze`,
`retrieve_context` topology annotations)

---

## OS-003: Deliberation Orchestrator

**Cognitive basis:** Dual-process theory (Kahneman 2011)

**What it specifies:**
- Four-phase deliberation: bid, debate, vote, commit
- Argumentation framework: claims, warrants, rebuttals
- Consensus mechanisms: majority, supermajority, unanimity
- Timeout and escalation policies
- Triggered when kappa routing indicates deliberation is needed

**Design constraint from cognitive science:** System 1 (fast, automatic)
handles routine decisions. System 2 (slow, deliberate) engages when conflict
is detected. The kappa threshold is the trigger that shifts from fast to
deliberate processing.

**Implemented by:** AgenTroMatic (`deliberate` tool in Graphonomous provides
the single-agent deliberation path)

---

## OS-004: Attention Engine

**Cognitive basis:** Endogenous attention (Desimone & Duncan 1995)

**What it specifies:**
- Three-phase cycle: survey (scan environment), triage (rank by salience),
  dispatch (act on highest-priority items)
- Salience scoring: combines urgency, recency, goal relevance, and confidence
- Goal bias: active goals increase salience of related knowledge
- Dispatch modes: act (execute), learn (gather more context), escalate
  (request human intervention), idle (nothing needed)

**Design constraint from cognitive science:** Biological attention is
goal-directed (endogenous) not just stimulus-driven (exogenous). The
attention engine prioritizes based on the agent's active goals, not just
what is new or loud.

**Implemented by:** Graphonomous attention module (`attention_survey`,
`attention_run_cycle`)

---

## OS-005: Model Tier Adaptation

**Cognitive basis:** Resource rationality (Lieder & Griffiths 2020)

**What it specifies:**
- Three tiers: `local_small` (8B parameter models), `local_large` (70B+),
  `cloud_frontier` (largest available)
- Same topology and tool surface at every tier — only depth and latency differ
- Escalation rules: when local_small confidence is below threshold, escalate
  to local_large; when local_large is insufficient, escalate to cloud_frontier
- Budget constraints: token limits, latency targets, cost caps per tier

**Design constraint from cognitive science:** Optimal cognition allocates
computational resources proportional to decision importance. Simple decisions
use fast/cheap processing; high-stakes decisions justify expensive computation.

**Implemented by:** Graphonomous and Agentelic (tier selection and escalation
logic)

---

## OS-006: Agent Governance Shim

**Cognitive basis:** Executive function (Miyake et al. 2000)

**What it specifies:**
- Permission taxonomy: filesystem, network, tool_invocation, graph_access
- Lifecycle state machine: installed, enabled, running, disabled, removed
- Graduated autonomy: observe, advise, act
- Append-only audit trail with typed events
- OTP-native implementation: GenStateMachine, ETS, DynamicSupervisor

**Design constraint from cognitive science:** Executive function provides
inhibitory control (permissions), task switching (lifecycle), and cognitive
flexibility (autonomy levels). Without executive function, an agent cannot
self-regulate — it either does nothing or does everything.

**Implemented by:** `open_sentience` hex package (this project)

---

## OS-007: Adversarial Robustness

**Cognitive basis:** Immune system — self/non-self discrimination

**What it specifies:**
- Five threat categories: prompt injection, model poisoning, side-channel,
  identity spoofing, resource exhaustion
- Detection rules per category
- Defense protocols: quarantine, circuit-break, escalate
- Integration with OS-006 for permission revocation and OS-008 for circuit
  breaking

**Implemented by:** OpenSentience security module (draft)

---

## OS-008: Agent Harness

**Cognitive basis:** Supervisory attentional system (Norman & Shallice 1986)

**What it specifies:**
- Pipeline ordering enforcement (retrieve → route → act → learn)
- Quality gates between pipeline stages
- Sprint contracts: bounded execution with explicit goals and success criteria
- Context management: 60% threshold, compaction, Graphonomous overflow
- Generator-evaluator separation for adversarial grading

**Implemented by:** OpenSentience harness module (draft)

---

## OS-009: PRISM — Protocol for Rating Iterative System Memory

**Cognitive basis:** Meta-cognition + psychometrics (Item Response Theory,
signal detection theory)

**What it specifies:**
- 9 continual-learning dimensions (retention, plasticity, transfer,
  contradiction handling, etc.)
- 4-phase evaluation loop: compose → interact → observe → reflect → diagnose
- BYOR (Bring Your Own Repo) ingestion — point PRISM at any repo and it will
  generate scenarios
- IRT calibration of scenario difficulty
- Leaderboards, regression detection, fix suggestions
- **PULSE-aware:** reads any system's PULSE manifest at runtime and injects
  scenarios at the declared `retrieve` boundary, observing outcomes via the
  declared `learn` phase

**Design constraint:** A diagnostic that measures *learning over time* must
itself be a closed loop — it must reflect on its own scenarios and evolve
them based on what the inner loop fails on. Hence the 4-phase evaluation
structure.

**Implemented by:** `/PRISM/` Elixir/OTP codebase, Fly.io, 6 MCP machines
(`compose`, `interact`, `observe`, `reflect`, `diagnose`, `config`),
[prism.opensentience.org](https://prism.opensentience.org)

---

## OS-010: PULSE — Protocol for Uniform Loop State Exchange

**Cognitive basis:** Closed-loop control theory (Wiener cybernetics 1948) +
temporal cognition (Allen interval algebra 1983)

**What it specifies:**
- Loop manifest schema (JSON Schema): `pulse-loop-manifest.v0.1.json`
- 5 canonical phase kinds: `retrieve`, `route`, `act`, `learn`, `consolidate`
  (+ custom phases via `custom_kind`)
- 5 canonical cross-loop tokens (CloudEvents v1 envelopes):
  `TopologyContext`, `DeliberationResult`, `OutcomeSignal`, `ReputationUpdate`,
  `ConsolidationEvent`
- 6 cadence types: `event`, `periodic`, `streaming`, `idle`,
  `cross_loop_signal`, `manual`
- 6 substrate slots: `memory`, `policy`, `audit`, `auth`, `transport`, `time`
- 7 invariants: `phase_atomicity`, `feedback_immutability`,
  `append_only_audit`, `kappa_routing`, `quorum_before_commit`,
  `outcome_grounding`, `trace_id_propagation`
- 12-test conformance suite — a runtime is **PULSE-conforming** when its
  manifest validates and all 12 tests pass

**Design constraint:** Loops must be declarable in a vocabulary that is
independent of their implementation language, runtime, or cognitive
architecture. The same manifest schema must work for a SQLite-backed
knowledge graph, a Cloudflare Worker, and a Phoenix LiveView.

**Implemented by:** `/PULSE/` directory — JSON Schema + 11 reference
manifests covering every [&] portfolio loop, [pulse.opensentience.org](https://pulse.opensentience.org)

---

## Protocol-to-Product Map

| Protocol | Primary Implementation | Secondary |
|----------|----------------------|-----------|
| OS-001 | Graphonomous | — |
| OS-002 | Graphonomous | — |
| OS-003 | AgenTroMatic | Graphonomous (single-agent path) |
| OS-004 | Graphonomous | — |
| OS-005 | Graphonomous | Agentelic |
| OS-006 | open_sentience | — |
| OS-007 | OpenSentience security module | — |
| OS-008 | OpenSentience harness module | — |
| **OS-009** | **`/PRISM/` Elixir/OTP** | — |
| **OS-010** | **`/PULSE/` manifest standard** | Every portfolio product publishes a conforming manifest |

---

## Open Research Questions

1. **Cross-protocol feedback:** How should attention (OS-004) influence
   deliberation thresholds (OS-003)?
2. **Tier-aware governance:** Should autonomy levels (OS-006) vary by model
   tier (OS-005)?
3. **Consolidation governance:** Should the governance shim audit memory
   consolidation events (OS-001)?
4. **Multi-agent kappa:** How does topological routing (OS-002) work across
   agent boundaries?
5. **PRISM scenario evolution:** How aggressively should PRISM evolve scenarios
   between cycles? Too aggressive and the system optimizes for adversarial
   noise; too conservative and improvement plateaus.
6. **PULSE nesting depth:** What is the practical maximum nesting depth before
   the cross-loop signal volume becomes a substrate burden?
