# Skill 07 — Cognitive Science Foundations

> Research grounding for each of the ten protocols: the theories, the papers,
> the design constraints, and the open questions. Eight cognitive primitives
> grounded in cognitive science / neuroscience, plus two cross-cutting
> protocols (OS-009 PRISM, OS-010 PULSE) grounded in psychometrics and
> closed-loop control theory.

---

## Why This Matters

OpenSentience protocols are not arbitrary architecture decisions. Each one
maps to a specific cognitive science finding about how intelligent systems
manage knowledge, attention, and self-regulation. Understanding the research
helps you understand *why* the protocols work the way they do and where
the boundaries of the analogy lie.

---

## OS-001: Hippocampal Consolidation

**Key paper:** McClelland, McNaughton & O'Reilly (1995). "Why there are
complementary learning systems in the hippocampus and neocortex."

**Theory:** The brain uses two complementary systems for memory. The
hippocampus rapidly encodes new experiences (fast write). The neocortex
slowly integrates this knowledge into long-term structure (consolidation).
Replaying memories during sleep transfers hippocampal traces into neocortical
representations without catastrophic forgetting.

**Design constraints for OS-001:**
- New knowledge must be stored immediately without disrupting existing memory
- Background consolidation must merge, decay, and prune to maintain quality
- Episodic memories (events) are stored differently from semantic memories (facts)
- Confidence decays over time unless reinforced by retrieval or outcomes

**What Graphonomous implements:**
- Immediate `store_node` writes (hippocampal fast-write analog)
- `run_consolidation` background cycle (neocortical integration analog)
- Three node types mapping to memory systems: episodic, semantic, procedural

---

## OS-002: Working Memory Gating

**Key paper:** O'Reilly & Frank (2006). "Making working memory work: A
computational model of learning in the prefrontal cortex and basal ganglia."

**Theory:** The prefrontal cortex maintains active representations in working
memory, but not everything gets in. The basal ganglia acts as a gate —
deciding what information is relevant enough to enter working memory based on
learned relevance signals and conflict detection.

**Design constraints for OS-002:**
- Not all retrieved knowledge should be acted upon equally
- Cyclic knowledge (contradictions, self-reinforcing claims) needs detection
- The kappa parameter serves as the conflict signal: kappa = 0 means no
  conflict (open the gate), kappa > 0 means conflict (engage deliberation)
- Routing must be fast for the common case (acyclic) and thorough for the
  rare case (cyclic)

**What Graphonomous implements:**
- SCC detection on retrieved neighborhoods (basal ganglia conflict signal)
- Kappa computation (gating threshold)
- Fast vs deliberate routing based on kappa value

---

## OS-003: Dual-Process Theory

**Key paper:** Kahneman (2011). "Thinking, Fast and Slow."

**Theory:** Human cognition operates in two modes. System 1 is fast,
automatic, and heuristic-based — it handles routine decisions effortlessly.
System 2 is slow, effortful, and analytical — it engages when System 1
encounters novelty, conflict, or high stakes.

**Design constraints for OS-003:**
- Most agent decisions should be fast (System 1 analog)
- Deliberation should engage only when triggered by conflict signals (kappa > 0)
- The deliberation protocol must structure argumentation (bid, debate, vote,
  commit) to resolve conflict rather than amplify it
- Timeout mechanisms prevent deliberation from stalling indefinitely

**What AgenTroMatic implements:**
- Four-phase deliberation pipeline (bid/debate/vote/commit)
- Argumentation framework with claims, warrants, and rebuttals
- Consensus and escalation mechanisms

---

## OS-004: Endogenous Attention

**Key paper:** Desimone & Duncan (1995). "Neural mechanisms of selective
visual attention."

**Theory:** Attention is not just stimulus-driven (exogenous — a loud noise
grabs your attention). It is also goal-directed (endogenous — you look for
your car keys because you intend to drive). Endogenous attention biases
perception toward goal-relevant information, filtering out distractions.

**Design constraints for OS-004:**
- The attention engine must prioritize based on active goals, not just recency
  or novelty
- Salience scoring combines urgency, recency, goal relevance, and confidence
- The survey/triage/dispatch cycle mirrors the scan/filter/act structure of
  biological attention
- Dispatch modes (act, learn, escalate, idle) prevent attention from always
  demanding action

**What Graphonomous implements:**
- `attention_survey` (endogenous scan of goal-relevant state)
- `attention_run_cycle` (full survey/triage/dispatch loop)
- Goal bias in salience scoring

---

## OS-005: Resource Rationality

**Key paper:** Lieder & Griffiths (2020). "Resource-rational analysis: Understanding
human cognition as the optimal use of limited computational resources."

**Theory:** Optimal cognition is not about always computing the best answer.
It is about allocating computational effort proportional to the value of
the decision. Simple decisions warrant fast, cheap heuristics. High-stakes
decisions justify expensive, thorough analysis.

**Design constraints for OS-005:**
- Three model tiers map to three levels of computational investment
- The same tool surface and topology are available at every tier
- Escalation rules define when to upgrade from cheap to expensive processing
- Budget constraints (tokens, latency, cost) prevent unbounded computation

**What Graphonomous and Agentelic implement:**
- local_small / local_large / cloud_frontier tier definitions
- Escalation thresholds based on confidence and decision stakes
- Token and latency budgets per tier

---

## OS-006: Executive Function

**Key paper:** Miyake, Friedman et al. (2000). "The unity and diversity of
executive functions and their contributions to complex frontal lobe tasks."

**Theory:** Executive function is an umbrella term for the cognitive processes
that regulate, control, and manage other cognitive processes. Miyake et al.
identified three core components: inhibitory control (suppressing
inappropriate responses), task switching (flexibly shifting between tasks),
and working memory updating (monitoring and revising held information).

**Design constraints for OS-006:**
- Inhibitory control maps to the permission system (blocking disallowed actions)
- Task switching maps to the lifecycle state machine (managing agent state)
- Working memory updating maps to graduated autonomy (adapting the level of
  agent independence based on accumulated trust)
- The audit trail provides metacognitive monitoring — awareness of what the
  system has done

**What `open_sentience` implements:**
- PermissionEngine (inhibitory control)
- AgentLifecycle GenStateMachine (task switching)
- AutonomyController (working memory updating / cognitive flexibility)
- AuditWriter (metacognitive monitoring)

---

## OS-007: Adversarial Robustness — Self/Non-Self Discrimination

**Theoretical grounding:** Adaptive immunity theory (Burnet 1959; Janeway 1989).

**Theory:** Biological immune systems distinguish self from non-self through
a combination of innate pattern recognition and adaptive memory. The same
architecture maps cleanly to agent threat detection: known-good behavior is
"self," novel attack patterns are "non-self," and the system must learn to
recognize new threats without misclassifying legitimate variation.

**Design constraints for OS-007:**
- Five threat categories with explicit detection rules
- Defense protocols must be reversible (quarantine before destroy)
- Integration with OS-006 for permission revocation and OS-008 for circuit
  breaking — the immune response is enacted by the governance and harness
  layers

---

## OS-008: Supervisory Attentional System

**Key paper:** Norman & Shallice (1986). "Attention to action: Willed and
automatic control of behavior."

**Theory:** Routine behavior runs automatically through contention scheduling
between learned action schemas. A *supervisory attentional system* intervenes
when novel, dangerous, or constraint-violating situations arise. The
supervisory system does not execute behavior directly — it modulates which
schemas are allowed to run.

**Design constraints for OS-008:**
- The harness is the runtime that calls the agent, not a tool the agent calls
- It enforces pipeline ordering, quality gates, sprint contracts, and context
  management
- It intervenes when prerequisites are not met or when quality thresholds are
  not crossed — but it does not generate the agent's outputs

---

## OS-009: PRISM — Meta-Cognition + Psychometrics

**Key references:**
- Rasch, G. (1960). "Probabilistic models for some intelligence and attainment
  tests." (Item Response Theory foundation)
- Lord, F. M. (1980). "Applications of item response theory to practical testing
  problems."
- Green, D. M. & Swets, J. A. (1966). "Signal detection theory and
  psychophysics."
- Flavell, J. H. (1979). "Metacognition and cognitive monitoring." (Meta-cognition)

**Theory:** Measuring whether a system *learns* (rather than merely *answers*)
requires the same toolkit psychometricians built for measuring human learning:
calibrated item difficulty, separation of item-quality from learner-quality
parameters, and detection of response bias. PRISM applies IRT to scenario
calibration and signal detection theory to dimension scoring, then closes the
meta-cognitive loop by reflecting on its own scenarios and evolving them.

**Design constraints for OS-009:**
- 9 continual-learning dimensions (retention, plasticity, transfer,
  contradiction handling, etc.) — each with calibrated scoring rubrics
- 4-phase evaluation loop: compose → interact → observe → reflect → diagnose
  (the diagnostic must itself be a closed loop)
- BYOR ingestion — point PRISM at any repo and it generates scenarios
- IRT calibration of scenario difficulty across cycles
- **PULSE-aware:** PRISM's `interact` phase reads any system's PULSE manifest
  at runtime and drives the inner loop through its declared phases

---

## OS-010: PULSE — Closed-Loop Control Theory + Temporal Cognition

**Key references:**
- Wiener, N. (1948). "Cybernetics: or Control and Communication in the Animal
  and the Machine." (Closed-loop control foundation)
- Allen, J. F. (1983). "Maintaining knowledge about temporal intervals."
  (Interval algebra)
- CloudEvents v1 specification (CNCF, 2019). (Event envelope standard)

**Theory:** Wiener's cybernetics established that intelligent behavior — in
animals or machines — requires closed feedback loops with explicit phases:
sense, decide, act, observe, adjust. Allen's interval algebra formalized the
13 possible relationships between temporal intervals, providing a vocabulary
for describing how loops can nest, overlap, and signal one another. PULSE
combines these into a manifest standard: every loop in the [&] portfolio
declares its phases in the same vocabulary, and cross-loop signals use
CloudEvents v1 envelopes so that loops can compose without bespoke adapters.

**Design constraints for OS-010:**
- 5 canonical phase kinds (`retrieve`, `route`, `act`, `learn`, `consolidate`)
  cover the closed-loop control archetype; custom phases extend it without
  breaking the schema
- 5 canonical cross-loop tokens (`TopologyContext`, `DeliberationResult`,
  `OutcomeSignal`, `ReputationUpdate`, `ConsolidationEvent`) cover the
  observed inter-system signaling needs
- 7 invariants (phase atomicity, feedback immutability, append-only audit,
  kappa routing, quorum before commit, outcome grounding, trace ID
  propagation) encode the structural correctness conditions
- A 12-test conformance suite makes "PULSE-conforming" objectively verifiable

---

## Open Research Questions

1. **Cross-protocol interaction:** How do attention biases (OS-004) affect
   deliberation engagement thresholds (OS-003)? Should high goal salience
   lower the kappa threshold for deliberation?

2. **Consolidation and governance:** Should memory consolidation events
   (OS-001) be subject to governance (OS-006)? Can an agent with
   `graph_access:write` permission consolidate knowledge it cannot read?

3. **Multi-agent executive function:** Miyake's model applies to individual
   cognition. How does executive function work when governance spans multiple
   agents with different trust levels?

4. **Tier-aware governance:** Should autonomy levels (OS-006) automatically
   adjust based on model tier (OS-005)? A local_small model may warrant
   lower autonomy than a cloud_frontier model.

5. **Attention-governance feedback:** Should the attention engine (OS-004)
   flag agents whose audit trails show increasing denial rates?

6. **Temporal cognition:** Is time-awareness a distinct cognitive capability
   that warrants its own protocol, or is it a cross-cutting concern? *Status:*
   addressed by OS-010 PULSE as a temporal algebra (loop manifest standard)
   sitting above the cognitive primitives — a cross-cutting protocol rather
   than a ninth cognitive primitive.

7. **PRISM scenario evolution (OS-009):** How aggressively should PRISM evolve
   scenarios between cycles? Too aggressive and the system optimizes for
   adversarial noise; too conservative and learning improvement plateaus.

8. **PULSE nesting depth (OS-010):** What is the practical maximum nesting
   depth before cross-loop signal volume becomes a substrate burden? The
   triple-loop case (PRISM → Graphonomous → Deliberation) is well-understood;
   four- and five-loop nesting (e.g., adding OS-008 Harness as an outer
   layer) is an open empirical question.
