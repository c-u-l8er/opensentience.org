# OpenSentience vs. Alternatives

Comparison tables for OpenSentience runtime governance relative to agent frameworks, guardrail libraries, and harness architectures.

---

## How to read this table

- **Yes/No** indicates presence or absence of the feature as a first-class, enforceable mechanism (not just documentation or convention).
- **None** means the system has no equivalent concept.
- **Partial** or qualified entries describe limited coverage.
- Comparisons reflect each system's public documentation as of early 2026. Features may change.
- OpenSentience protocols (OS-001 through OS-010) are defined in `opensentience.org/docs/spec/README.md`. OS-009 (PRISM) and OS-010 (PULSE) have separate specification files.

---

## Agent Governance and Runtime Enforcement

| Feature | OpenSentience | CrewAI | LangGraph | AutoGen | Guardrails AI | NeMo Guardrails | AWS Bedrock |
|---------|--------------|--------|-----------|---------|--------------|-----------------|-------------|
| Permission model | Deny-by-default, ETS-cached, 4 categories (filesystem, network, tool, graph) | None | None | None | Input/output validation only | Input/output rails | IAM-based (cloud) |
| Lifecycle management | 5 states (installed, enabled, running, disabled, removed) | None | None | None | None | None | Cloud-managed |
| Graduated autonomy | 3 levels (observe / advise / act) | None | None | None | None | None | None |
| Audit trail | Append-only, immutable, batched, pluggable backends | None | None | None | Per-call logs | Per-call logs | CloudTrail |
| Pipeline enforcement | OS-008: prerequisite constraints, retrieve-before-act | None | Static graph routing | Conversation flow | None | Topical flow | None |
| Quality gates | OS-008: separate evaluator context, adversarial grading | None | None | None | Validators | None | None |
| Sprint contracts | OS-008: planner, generator, evaluator with acceptance criteria | Task assignment | None | None | None | None | None |
| Context management | OS-008: 60% threshold, compaction, Graphonomous overflow | None | Checkpoints | None | None | None | None |
| Cognitive grounding | 10 protocols (8 cognitive primitives + PRISM diagnostic + PULSE temporal), each mapped to cognitive science | None | None | None | None | None | None |
| Loop manifest standard | OS-010 PULSE: declarative manifest with 5 phase kinds, 5 cross-loop tokens, 12-test conformance suite | None | None | None | None | None | None |
| Continual-learning benchmark | OS-009 PRISM: 9 CL dimensions, BYOR ingestion, IRT calibration, leaderboards | None | None | None | None | None | None |
| Runtime overhead | < 1% CPU, < 2us permission check | N/A | N/A | N/A | Per-call latency | Per-call latency | Cloud latency |
| Architecture | Elixir/OTP hex package (shim) | Python framework | Python framework | Python/.NET framework | Python library | Python library | Cloud service |
| Portability | Apache 2.0, any OTP child_spec | Framework-locked | Framework-locked | Framework-locked | Provider-agnostic | Provider-agnostic | AWS-locked |
| Multi-agent governance | Per-agent permissions + autonomy + Delegatic policy | Role-based | Graph-based | Conversation-based | N/A | N/A | IAM-based |

---

## Protocol Layer Map

| Protocol | Layer | What it governs | Enforcement type |
|----------|-------|----------------|------------------|
| OS-001 | Memory | How knowledge is stored, consolidated, retrieved | Spec (Graphonomous enforces) |
| OS-002 | Routing | When to fast-path vs. deliberate | Spec (Graphonomous enforces) |
| OS-003 | Deliberation | How agents reach consensus | Spec (AgenTroMatic enforces) |
| OS-004 | Attention | What gets priority | Spec (Graphonomous enforces) |
| OS-005 | Resources | Which model tier handles a task | Spec (Graphonomous/Agentelic enforce) |
| OS-006 | Governance | Permissions, lifecycle, autonomy | Runtime (open_sentience hex) |
| OS-007 | Security | Adversarial threats | Runtime (planned) |
| OS-008 | Harness | Pipeline ordering, quality gates, sprint contracts | Runtime (planned) |
| **OS-009** | **Diagnostic** | How well a closed memory loop actually learns over time | **Runtime (PRISM Elixir/OTP, Fly.io, 6 MCP machines)** |
| **OS-010** | **Temporal** | How loops cycle, nest, and signal across boundaries | **Manifest standard (no required runtime; JSON Schema validation + 12-test conformance suite)** |

---

## Harness Comparison

| Feature | Anthropic Harness | OpenAI Codex Harness | LangChain Deep Agents | OS-008 |
|---------|------------------|---------------------|----------------------|--------|
| Generator-evaluator separation | Yes (3-agent) | Implied (CI gate) | No | Yes (capability contracts) |
| Sprint decomposition | Ad-hoc | Implicit | No | Formal (SprintController + acceptance criteria) |
| Context management | Filesystem offload | Filesystem | Agent delegation | Graphonomous knowledge graph + compaction |
| Prerequisite enforcement | Prompt-based | CI invariants | None | Runtime (PipelineEnforcer) |
| Governance integration | None | None | None | [&] Protocol contracts + Delegatic policy |
| Topology-aware routing | None | None | None | kappa-routing (OS-002) |
| Coverage-driven dispatch | None | None | None | Coverage.recommend: act / learn / escalate |
| Model tier adaptation | Fixed model | Fixed model | Fixed model | 3-tier with graceful degradation |
