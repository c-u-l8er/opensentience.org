# Skill 01 — The Eight Cognitive Protocols

> OS-001 through OS-008: what each protocol specifies, which product
> implements it, and the cognitive science behind it.

---

## Overview

OpenSentience publishes eight numbered protocols. Each formalizes a cognitive
capability required for governed, self-improving AI agents. The protocols
are independent specifications — they can be adopted individually or
composed together.

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

## Protocol-to-Product Map

| Protocol | Primary Implementation | Secondary |
|----------|----------------------|-----------|
| OS-001 | Graphonomous | — |
| OS-002 | Graphonomous | — |
| OS-003 | AgenTroMatic | Graphonomous (single-agent path) |
| OS-004 | Graphonomous | — |
| OS-005 | Graphonomous | Agentelic |
| OS-006 | open_sentience | — |

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
5. **Temporal protocols:** Should time-awareness be a seventh protocol?
