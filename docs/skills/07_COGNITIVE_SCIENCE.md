# Skill 07 — Cognitive Science Foundations

> Research grounding for each of the eight protocols: the theories, the papers,
> the design constraints, and the open questions.

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
   that warrants a seventh protocol, or is it a cross-cutting concern
   addressed by existing protocols?
