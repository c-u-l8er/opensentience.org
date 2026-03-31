# Research Overview

This document is the research-oriented companion for the OpenSentience protocol suite.

Its purpose is to explain **why each cognitive protocol is grounded in a specific area of cognitive science**, how that grounding constrains design, and which open questions remain. Each numbered protocol (OS-001 through OS-008) maps to a research thread that provides both theoretical justification and falsifiable design constraints.

This is not a literature review. It is a structured overview of the research threads that support the protocol design.

---

## Executive Summary

OpenSentience publishes eight numbered protocols, each defining a cognitive primitive for machine intelligence. Every protocol is grounded in an established area of cognitive science, neuroscience, or systems biology. The grounding is not decorative — it provides design constraints that shape implementation and generate testable predictions.

The eight research threads are:

| # | Protocol | Research Thread | Core Reference |
|---|----------|----------------|----------------|
| 1 | OS-001: Continual Learning | Hippocampal consolidation | McClelland et al. 1995 |
| 2 | OS-002: Topological Routing | Working memory gating | O'Reilly & Frank 2006 |
| 3 | OS-003: Deliberation | Dual-process theory | Kahneman 2011 |
| 4 | OS-004: Attention Engine | Endogenous attention | Desimone & Duncan 1995 |
| 5 | OS-005: Model Tier Adaptation | Resource rationality | Lieder & Griffiths 2020 |
| 6 | OS-006: Governance Shim | Executive function | Miyake et al. 2000 |
| 7 | OS-007: Adversarial Robustness | Immune system | Adaptive immunity theory |
| 8 | OS-008: Agent Harness | Supervisory attentional system | Norman & Shallice 1986 |

The common pattern: each protocol takes a well-understood biological or cognitive mechanism, identifies the architectural constraint it implies, and translates that constraint into a protocol-level requirement.

---

## 1. Hippocampal Consolidation (OS-001: Continual Learning)

### The biological system

The brain does not store memories in a single pass. McClelland, McNaughton, and O'Reilly (1995) proposed Complementary Learning Systems (CLS) theory: the hippocampus rapidly encodes new episodic memories, which are then gradually consolidated into neocortical semantic representations over time — primarily during sleep.

This two-system architecture solves a fundamental problem: integrating new information into an existing knowledge structure without destroying what was already learned (catastrophic interference).

### How it maps to OS-001

| Biological System | OS-001 Analog |
|-------------------|---------------|
| Hippocampus (fast encoding) | Fast episodic ingestion — new nodes stored immediately with full provenance |
| Neocortex (slow integration) | Scheduled consolidation cycles — merging, pruning, strengthening |
| Sleep-dependent consolidation | Idle-time graph operations — runs when the system is not under active query load |
| Catastrophic interference | Design constraint: new memories must be buffered before integration |

### Design constraints derived from the theory

1. **Buffer before integrate.** New episodic nodes are stored at low confidence and are not immediately merged into the semantic graph. This prevents a single misleading interaction from corrupting established knowledge.
2. **Four timescales.** OS-001 specifies four consolidation timescales, inspired by the multiple timescales of biological memory:
   - **Fast** (seconds) — immediate episodic capture
   - **Medium** (hours) — session-boundary consolidation
   - **Slow** (days) — cross-session merging and generalization
   - **Glacial** (months) — deep structural reorganization and pruning
3. **Sleep analog.** Sleep-dependent memory consolidation maps to idle-time graph merging and pruning. The system consolidates when it is not under active demand, allowing expensive graph operations (community detection, edge weight redistribution, node merging) without affecting query latency.
4. **No weight modification.** All learning is graph-structural — no model weight changes. The frozen language model is the neocortex analog; the knowledge graph is the hippocampal encoding.

### Key reference

| Reference | Contribution |
|-----------|-------------|
| McClelland, McNaughton & O'Reilly 1995 | Complementary Learning Systems theory — fast hippocampal encoding, slow neocortical consolidation |
| Walker & Stickgold 2004 | Sleep-dependent memory consolidation — role of REM and NREM in memory transformation |
| French 1999 | Catastrophic forgetting in connectionist networks — the problem CLS architecture solves |

---

## 2. Working Memory Gating (OS-002: Topological Routing)

### The biological system

O'Reilly and Frank (2006) demonstrated that the prefrontal cortex and basal ganglia form a gating system for working memory. Information does not passively flow into working memory — it is actively gated. The basal ganglia act as a learned gate, selectively admitting task-relevant information and blocking irrelevant information based on reinforcement signals.

This is the difference between passive retrieval (everything similar gets in) and active gating (only what is topologically and contextually relevant gets in).

### How it maps to OS-002

| Biological System | OS-002 Analog |
|-------------------|---------------|
| Prefrontal cortex (working memory store) | Context window — the active information the agent reasons over |
| Basal ganglia (gating mechanism) | Topological routing via the kappa parameter |
| Dopaminergic reinforcement signal | Outcome feedback that adjusts edge weights and routing preferences |
| Gate open (admit information) | Low kappa — exploitation, follow strong edges |
| Gate selective (filter information) | High kappa — exploration, traverse weak/novel paths |

### The kappa parameter

The kappa parameter controls the balance between exploitation and exploration in graph traversal:

- **kappa = 0** — pure exploitation. The query follows highest-weight edges only. The induced subgraph is a DAG (directed acyclic graph). This is the fast path — no deliberation needed.
- **kappa > 0** — exploration increases. The routing function traverses weaker and more novel edges. When the induced subgraph contains strongly connected components (SCCs), this signals cyclical reasoning that requires deliberation (OS-003).
- **kappa approaching infinity** — pure exploration. Uniformly random walk, useful for creative divergence but expensive.

### Tarjan's algorithm

OS-002 uses Tarjan's algorithm (1972) for detecting strongly connected components in the induced subgraph. The presence of SCCs is the signal that triggers deliberation — cyclical dependencies in the knowledge graph mean the query cannot be resolved by simple traversal alone.

### Design constraints derived from the theory

1. **Active gating, not passive retrieval.** Context window access must be actively controlled. Vector similarity alone is insufficient — topological structure provides additional signal about relevance, dependency, and reasoning complexity.
2. **Topology determines routing.** The structural properties of the induced subgraph (DAG vs SCC) determine the processing path. This is not a heuristic — it is a formal topological property.
3. **Kappa is a policy parameter.** Like the dopaminergic signal in the biological system, kappa can be tuned by context, task type, or learned from feedback.

### Key reference

| Reference | Contribution |
|-----------|-------------|
| O'Reilly & Frank 2006 | Prefrontal-basal ganglia gating model for working memory |
| Tarjan 1972 | Depth-first search algorithm for strongly connected components |
| Todd & Marois 2004 | Capacity limits of visual working memory — constraints on gating selectivity |

---

## 3. Dual-Process Theory (OS-003: Deliberation)

### The cognitive framework

Kahneman (2011) popularized the distinction between two modes of cognitive processing:

- **System 1** — fast, automatic, heuristic-based. Handles routine decisions with minimal effort.
- **System 2** — slow, deliberate, effortful. Engages when tasks are novel, complex, or contested.

The key insight is not that one system is better than the other, but that an effective cognitive architecture must support both and must have a reliable mechanism for deciding when to escalate from fast to slow processing.

### How it maps to OS-003

| Cognitive Mode | OS-003 Analog |
|----------------|---------------|
| System 1 (fast heuristic) | Direct routing — kappa = 0, DAG subgraph, no deliberation |
| System 2 (slow deliberate) | Multi-agent deliberation — kappa > 0, SCC detected, structured debate |
| Escalation trigger | Topological signal (SCC presence) from OS-002 |
| Consensus formation | Argumentation framework — weighted bipolar (attacks + supports) |

### Argumentation framework

OS-003 specifies a weighted bipolar argumentation framework, drawing on Dung (1995) and Potyka (2018):

- Arguments carry weights derived from source confidence, evidence strength, and reputation
- Arguments can attack (undermine) or support (reinforce) other arguments
- Deliberation proceeds through structured phases: bid, debate, vote, commit
- Consensus mechanisms: Raft fast-path for agreement, PBFT conflict-path for Byzantine tolerance

### Design constraints derived from the theory

1. **Both paths must exist.** A system with only System 1 cannot handle novel problems. A system with only System 2 is too slow for routine tasks. OS-003 requires both fast routing and full deliberation.
2. **Escalation must be principled.** The decision to escalate from fast to slow processing is based on topological structure (kappa routing from OS-002), not on vague heuristics. SCCs in the knowledge graph are a concrete signal.
3. **Deliberation must terminate.** Unlike open-ended discussion, structured deliberation has defined phases, quorum requirements, and termination conditions. This prevents indefinite System 2 processing.

### Key reference

| Reference | Contribution |
|-----------|-------------|
| Kahneman 2011 | Dual-process theory — System 1 (fast) vs System 2 (slow) |
| Dung 1995 | Abstract argumentation frameworks — acceptability semantics |
| Potyka 2018 | Weighted bipolar argumentation — continuous-valued framework |
| Evans 2008 | Dual-process theories of higher cognition — theoretical synthesis |

---

## 4. Endogenous Attention (OS-004: Attention Engine)

### The biological system

Desimone and Duncan (1995) proposed the biased competition model of attention. In this framework, multiple stimuli compete for neural representation, and top-down (endogenous) signals from the prefrontal cortex bias this competition in favor of goal-relevant stimuli.

This is the distinction between bottom-up salience (a loud noise captures attention) and top-down direction (you actively look for your keys). Effective attention requires both, but goal-directed bias is what makes attention purposeful rather than reactive.

### How it maps to OS-004

| Biological System | OS-004 Analog |
|-------------------|---------------|
| Sensory competition | Multiple active knowledge sources competing for processing |
| Top-down bias (prefrontal cortex) | Active goals bias the salience map |
| Bottom-up salience | Novelty and urgency signals from incoming data |
| Attentional selection | Triage phase — ranking items by urgency, novelty, goal-relevance |
| Attentional engagement | Dispatch phase — routing selected items to appropriate pipelines |

### Three-phase attention cycle

OS-004 specifies a continuous three-phase cycle:

1. **Survey** — scan all active knowledge sources (graph regions, pending tasks, external signals). Produce a salience map that scores each item on urgency, novelty, and relevance to active goals.
2. **Triage** — rank items by their salience scores. Apply priority thresholds. Active goals bias rankings — goal-relevant items receive priority even when less novel than distractors.
3. **Dispatch** — route top-priority items to appropriate processing pipelines (consolidation, deliberation, immediate response). Dispatch mode is determined by coverage analysis, not agent preference.

### Design constraints derived from the theory

1. **Continuous, not on-demand.** The attention engine runs as a background cycle. Like biological attention, it operates continuously rather than being invoked by explicit requests. Cycle frequency is adaptive — faster when novelty is high, slower when the system is stable.
2. **Goal-directed bias.** Active goals bias the salience map. Without this, the system degenerates into pure novelty-chasing. The prefrontal bias ensures the system attends to what matters for its objectives, not just what is new or loud.
3. **Salience is computed, not assumed.** Items are scored on multiple dimensions (urgency, novelty, goal-relevance, recency) rather than using a single ranking criterion. This mirrors the multidimensional nature of biological attention.

### Key reference

| Reference | Contribution |
|-----------|-------------|
| Desimone & Duncan 1995 | Biased competition model of visual attention |
| Corbetta & Shulman 2002 | Two attentional systems — goal-directed (dorsal) and stimulus-driven (ventral) |
| Posner & Petersen 1990 | Attentional networks — alerting, orienting, executive control |

---

## 5. Resource Rationality (OS-005: Model Tier Adaptation)

### The theoretical framework

Lieder and Griffiths (2020) proposed resource rationality as a framework for understanding cognitive effort allocation. The core claim: the brain allocates cognitive effort proportional to the expected utility of that effort, given the computational costs involved. Simple problems get fast, cheap processing. Complex problems get slow, expensive processing. The system learns over time which problems warrant which level of effort.

This resolves the paradox of human cognition: we are simultaneously capable of brilliant insight and lazy heuristic shortcuts. Resource rationality says both behaviors are rational — the system is optimizing expected utility under computational constraints.

### How it maps to OS-005

| Resource Rationality Concept | OS-005 Analog |
|------------------------------|---------------|
| Low cognitive effort | `local_small` tier — 1B-3B parameter models, sub-second, on-device |
| Moderate cognitive effort | `local_large` tier — 7B-14B parameter models, multi-second, local GPU |
| High cognitive effort | `cloud_frontier` tier — 70B+ or frontier API (Claude, GPT), high latency |
| Effort proportional to utility | Selection criteria: complexity, confidence threshold, latency budget, cost |
| Learned effort allocation | De-escalation: successful patterns cached as procedures for cheaper tiers |

### Three tiers

OS-005 defines three model tiers with distinct cost-performance profiles:

- **`local_small`** — trivial tasks: retrieval, classification, simple generation. Fast and cheap.
- **`local_large`** — moderate tasks: reasoning, synthesis, complex generation. More capable but slower.
- **`cloud_frontier`** — novel tasks: creative problems, high-stakes decisions, tasks requiring broad world knowledge. Most capable but most expensive.

### Escalation and de-escalation

The escalation rule is straightforward: if the current tier's confidence falls below threshold, escalate to the next tier. The more interesting dynamic is de-escalation: when a higher tier succeeds on a problem type, the successful pattern is cached as a procedure (via OS-001 consolidation). Future instances of that problem type can be handled at a lower tier, reducing cost over time.

This is the computational analog of skill acquisition: what once required effortful System 2 processing becomes automatic System 1 processing through practice and consolidation.

### Design constraints derived from the theory

1. **No single tier.** A system that always uses the cheapest model under-performs on hard problems. A system that always uses the most expensive model wastes resources on easy problems. Resource rationality requires adaptive selection.
2. **Cost is a first-class constraint.** Cognitive effort has a cost — in latency, in compute, in API spend. The tier selection function must account for cost alongside accuracy.
3. **Learning transfers down.** The most important long-term dynamic is not escalation but de-escalation. The system should get cheaper over time as it learns which problems can be handled at lower tiers.

### Key reference

| Reference | Contribution |
|-----------|-------------|
| Lieder & Griffiths 2020 | Resource-rational analysis — cognitive effort proportional to expected utility |
| Anderson 1990 | Rational analysis of cognition — adaptive optimization under constraints |
| Shiffrin & Schneider 1977 | Automatic vs controlled processing — skill acquisition reduces effort |

---

## 6. Executive Function (OS-006: Governance Shim)

### The cognitive framework

Miyake, Friedman, Emerson, Witzki, Howerter, and Wager (2000) identified three core executive functions that are partially separable but share a common underlying mechanism:

1. **Inhibitory control** — suppressing prepotent but inappropriate responses
2. **Working memory updating/monitoring** — tracking and updating active information
3. **Task switching** — flexibly shifting between tasks or mental sets

These executive functions are what distinguish purposeful, governed behavior from reflexive, ungoverned behavior. They are the cognitive analog of runtime governance.

### How it maps to OS-006

| Executive Function | OS-006 Analog |
|-------------------|---------------|
| Inhibitory control | Deny-by-default permissions — suppress unauthorized actions |
| Self-monitoring | Append-only audit trail — continuous record of all decisions and actions |
| Task switching | Lifecycle state machine — installed, enabled, running, disabled with formal transitions |
| Executive override | Autonomy levels — observe/advise/act with runtime adjustment |

### Design constraints derived from the theory

1. **Inhibition is the default.** In the biological system, executive control often manifests as suppression — stopping an automatic response that would be inappropriate. OS-006 mirrors this with deny-by-default permissions. Every action is blocked unless explicitly allowed.
2. **Monitoring is continuous.** Self-monitoring in executive function is not intermittent — it is a constant background process. The audit trail captures every permission check, lifecycle transition, and autonomy change without gaps.
3. **State transitions are formal.** Task switching in executive function is not arbitrary — it follows contextual rules and has cognitive costs. OS-006 models this as a formal state machine with defined transitions, each requiring explicit actor authorization and logged reasoning.
4. **Graduated control.** Executive function is not all-or-nothing. The three autonomy levels (observe, advise, act) provide graduated control that mirrors the spectrum from full executive override to automatic processing.

### Key reference

| Reference | Contribution |
|-----------|-------------|
| Miyake et al. 2000 | Unity and diversity of executive functions — three-factor model |
| Diamond 2013 | Executive functions — comprehensive review of development and neural bases |
| Baddeley 1996 | Central executive component of working memory — supervisory control |

---

## 7. Immune System (OS-007: Adversarial Robustness)

### The biological system

The adaptive immune system provides a powerful model for adversarial defense. It operates through two complementary mechanisms:

1. **Innate immunity** — fast, non-specific defense. Recognizes broad classes of threats through pattern recognition receptors. Does not require prior exposure.
2. **Adaptive immunity** — slow, highly specific defense. Learns to recognize specific threats (antigens) and generates targeted responses (antibodies). Retains memory of past threats for faster future response.

The critical concept is **self/non-self discrimination**: the immune system must distinguish the body's own cells from foreign invaders. Failure in either direction is catastrophic — autoimmune disease (attacking self) or immunodeficiency (failing to attack non-self).

### How it maps to OS-007

| Immune System Concept | OS-007 Analog |
|----------------------|---------------|
| Innate immunity (pattern recognition) | Structured input validation, canary token detection |
| Adaptive immunity (learned response) | Confidence drift detection, outcome-based down-weighting |
| Self/non-self discrimination | Manifest hash verification, agent identity binding |
| Immune memory | Known-signature defense — cached threat patterns |
| Autoimmune failure | False positive: blocking legitimate agent actions |
| Immunodeficiency | False negative: failing to detect adversarial input |

### Five threat categories

OS-007 identifies five categories of adversarial threat, each with defense mechanisms inspired by the dual innate/adaptive model:

| Threat | Defense Type | Mechanism |
|--------|-------------|-----------|
| Prompt injection | Innate | Permission checks on tool outputs, structured input validation, canary tokens |
| Knowledge poisoning (BadRAG/TrojanRAG) | Adaptive | Provenance tracking, confidence decay, outcome verification via `learn_from_outcome` |
| Agent impersonation | Innate | Manifest hash verification, A2A handshake validation, OTP process binding |
| Privilege escalation | Innate | Monotonic policy inheritance (Delegatic), goal-scoped audit, ETS cache flush on policy change |
| Denial of service | Adaptive | Budget enforcement, deliberation depth limits, circuit breaker with auto-demotion |

### Design constraints derived from the theory

1. **Both signature and anomaly defense.** Like the dual innate/adaptive immune system, OS-007 requires both known-signature defense (manifest verification, canary tokens) and anomaly-based defense (confidence drift detection, budget monitoring). Neither alone is sufficient.
2. **Low-confidence quarantine.** New nodes from external sources start at low confidence, analogous to how the immune system quarantines unfamiliar antigens before determining threat status. Unverified information must earn trust through empirical validation before influencing high-stakes decisions.
3. **Cost of false positives.** Blocking legitimate actions (autoimmune analog) has operational cost. The system must balance sensitivity against specificity — overly aggressive defense is itself a form of denial of service.

### Key reference

| Reference | Contribution |
|-----------|-------------|
| Janeway & Medzhitov 2002 | Innate immune recognition — pattern recognition receptors |
| Dasgupta 2006 | Artificial immune systems — computational models of self/non-self discrimination |
| Forrest et al. 1994 | Self-nonself discrimination in a computer — negative selection algorithm |

---

## 8. Supervisory Attentional System (OS-008: Agent Harness)

### The cognitive framework

Norman and Shallice (1986) proposed the Supervisory Attentional System (SAS) as a two-level model of behavioral control:

1. **Contention scheduling** — routine behavior managed by automatic schemas. Multiple schemas compete for execution based on environmental triggers. No supervisory intervention needed.
2. **Supervisory attentional system** — a higher-level system that intervenes when automatic schemas are insufficient. Activates for novel situations, error correction, danger, and tasks requiring planning or inhibition of strong habitual responses.

The SAS is distinct from the attention system itself. Attention (OS-004) determines *what* to focus on. The SAS determines *whether the attention system's decisions are being followed correctly* — it is the meta-level that governs the object-level.

### How it maps to OS-008

| SAS Concept | OS-008 Analog |
|-------------|---------------|
| Contention scheduling (automatic) | Reactive pipeline: `query -> recall -> topology -> deliberate -> store` |
| Supervisory system (intervention) | Harness — intervenes on low coverage, confidence drops, constraint violations, quality gate failures |
| Schema activation | Pipeline stages activating in sequence |
| Supervisory override | Quality gates blocking progression, forced re-planning |
| Novel situation detection | Coverage analysis — low coverage triggers exploration mode |

### Additional cognitive science grounding

OS-008 draws on two additional research threads:

**Metacognitive monitoring (Flavell 1979):** The ability to monitor and evaluate one's own cognitive processes. OS-008's evaluator role is a direct implementation — a separate agent grades the generator agent's output against acceptance criteria. The evaluator does not do the work; it assesses the work's quality.

**Cognitive fatigue (Baumeister, Bratslavsky, Muraven & Tice 1998):** Sustained cognitive effort depletes a limited resource, reducing subsequent performance. OS-008 translates this into the 60% context utilization rule: when context window usage exceeds 60%, the harness triggers compaction to prevent degradation. The system acknowledges that prolonged context accumulation reduces quality, and proactively manages it.

### Design constraints derived from the theory

1. **The harness calls the agent, not the reverse.** Like the SAS, the harness is above the agent in the control hierarchy. It is not a tool the agent invokes — it is the runtime that orchestrates agent execution. This inversion is fundamental.
2. **Automatic processing is the default.** Most pipeline execution follows the automatic path (contention scheduling). The harness intervenes only when quality gates fail, coverage is low, or constraints are violated. Excessive intervention would defeat the purpose.
3. **Separate generation from evaluation.** The evaluator (quality gate) is distinct from the generator. This separation mirrors metacognitive monitoring — the system that produces output is not the system that judges output quality.
4. **Context degradation is real.** The 60% context utilization rule is a design constraint, not a suggestion. Cognitive fatigue research shows that performance degrades under sustained load. The harness enforces compaction before degradation occurs.

### Key reference

| Reference | Contribution |
|-----------|-------------|
| Norman & Shallice 1986 | Supervisory Attentional System — automatic vs supervisory control |
| Flavell 1979 | Metacognition and cognitive monitoring — evaluating one's own processing |
| Baumeister et al. 1998 | Ego depletion — cognitive fatigue under sustained effort |
| Burgess & Simons 2005 | SAS and executive function — translating theory into neuropsychological assessment |

---

## 9. Open Research Questions

OpenSentience publishes these as active research directions. They represent genuine unknowns — areas where the protocol design implies questions that have not yet been empirically resolved.

### 9.1 Consolidation scheduling (OS-001)

What is the optimal consolidation frequency for a given knowledge graph density? The current four-timescale model (fast/medium/slow/glacial) is based on biological analogy, but the optimal parameters are not yet empirically determined. Is there a useful analog to REM/NREM cycling — alternating between different consolidation strategies within a single consolidation window?

### 9.2 Kappa calibration (OS-002)

Can kappa be learned from task feedback, or must it remain a policy parameter? The biological gating signal is dopaminergic and reinforcement-driven, which suggests kappa should be learnable. But policy-driven kappa provides deterministic, auditable routing. The tradeoff between adaptiveness and auditability is unresolved. What is the relationship between kappa and exploration-exploitation tradeoffs in reinforcement learning (e.g., UCB, Thompson sampling)?

### 9.3 Deliberation termination (OS-003)

When should a multi-agent deliberation be terminated early? The current protocol specifies quorum-based termination, but "enough" debate is subjective. Information-theoretic stopping criteria (e.g., marginal information gain below threshold) are promising but untested in this context. What is the cost of premature termination vs the cost of excessive deliberation?

### 9.4 Attention fatigue (OS-004)

Do attention engines degrade under sustained high-novelty input? In humans, sustained attention to novel stimuli produces measurable fatigue and performance decline. If the survey phase consistently returns high-novelty results, does the triage phase degrade? Is there an analog to attentional fatigue that requires periodic disengagement?

### 9.5 Tier boundary learning (OS-005)

How quickly can the system learn which tasks belong to which model tier? Sample efficiency matters — if the system requires hundreds of examples to learn that a task class can be handled by `local_small`, the de-escalation benefit is slow to materialize. What representations make tier classification sample-efficient?

### 9.6 Autonomy trust calibration (OS-006)

What metrics should drive autonomy level changes? The current model supports manual adjustment, but computational trust metrics could enable semi-automated trust calibration. What does it mean to "trust" an agent computationally? Candidate signals include: task success rate, policy violation rate, audit anomaly frequency, and human override frequency.

### 9.7 Harness overhead (OS-008)

When does harness overhead exceed the quality benefit? The harness adds latency (pipeline enforcement, quality gates, coverage checks) and cost (evaluator agent invocations). For simple tasks, this overhead may exceed the quality improvement. The boundary between "harness-worthy" and "direct-execution" tasks needs empirical determination.

### 9.8 Evaluator adversarial tuning (OS-008)

What is the optimal skepticism level for the evaluator? Too lenient and it passes low-quality outputs. Too strict and it creates infinite retry loops. The evaluator's acceptance criteria must be calibrated — but calibration requires ground truth about what constitutes "good enough." How should the evaluator's threshold evolve over time?

### 9.9 Cross-session harness learning (OS-008)

Can the harness learn to harness more effectively? If quality gate failures are stored as episodic memories (via OS-001), the harness could learn common failure patterns and pre-emptively adjust pipeline parameters. This creates a meta-learning loop: the harness uses the cognitive infrastructure it governs to improve its own governance. The circularity is intentional but raises questions about stability and convergence.

---

## 10. Cross-Cutting Theme: The Protocol Stack as Cognitive Architecture

The eight protocols are not independent modules — they form a layered cognitive architecture where each protocol depends on and constrains the others.

```
OS-008 (Harness)           — orchestrates everything below
  |
  +-- OS-006 (Governance)  — permissions, lifecycle, audit
  |
  +-- OS-004 (Attention)   — what to focus on
  |     |
  |     +-- OS-002 (Routing) — how to traverse the knowledge graph
  |           |
  |           +-- OS-001 (Learning) — the knowledge graph itself
  |
  +-- OS-003 (Deliberation) — how to resolve contested decisions
  |
  +-- OS-005 (Model Tiers)  — how much compute to spend
  |
  +-- OS-007 (Robustness)   — how to defend against adversarial inputs
```

This layering is itself a research claim: that machine cognition benefits from the same kind of functional decomposition found in biological cognitive architectures. The protocols are separable (unity/diversity, per Miyake et al. 2000), but they share a common substrate — the knowledge graph (OS-001) and the governance layer (OS-006).

The strongest evidence for this architecture is not theoretical but practical: the [&] portfolio companies implement these protocols independently, yet they compose into coherent systems because the protocol interfaces are well-defined.

---

## 11. Reading Map

If you are exploring the repository through the lens of this research overview, a useful order is:

1. This document — research grounding and open questions
2. `docs/spec/README.md` — full protocol specification (OS-001 through OS-007)
3. `docs/spec/OS-008-HARNESS.md` — agent harness protocol
4. `docs/architecture.md` — system architecture
5. `docs/faq.md` — frequently asked questions

This path moves from: theory, to protocol, to architecture, to practical concerns.

---

## Suggested Next Reading

- `docs/spec/README.md` — OpenSentience protocol specification
- `docs/spec/OS-008-HARNESS.md` — Agent Harness Protocol
- `docs/architecture.md` — system architecture overview
