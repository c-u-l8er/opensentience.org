# OpenSentience

**Open research protocols for machine cognition, structured memory, deliberation topology, and agent governance.**

Published by [Ampersand Box Design](https://ampersandboxdesign.com) under the [&] Protocol ecosystem.

> "Intelligence is not generation. It is structured accumulation."

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](https://www.apache.org/licenses/LICENSE-2.0)
[![Spec Status](https://img.shields.io/badge/spec-v0.1%20draft-orange.svg)]()
[![Docs](https://img.shields.io/badge/docs-ReadTheDocs-informational.svg)]()
[![Stack](https://img.shields.io/badge/stack-Elixir%20%7C%20OTP-purple.svg)]()

---

## What is OpenSentience?

OpenSentience is the **research arm** of the [&] Protocol ecosystem. It is **not a product** — it is a research organization that publishes:

1. **Ten numbered protocols** (OS-001 through OS-010) — each defining one cognitive capability or cross-cutting concern, grounded in cognitive science
2. **Three runtime artifacts** — a governance shim (OS-006), a benchmark engine (OS-009 PRISM), and a loop manifest standard (OS-010 PULSE)
3. **Published research** — cognitive science grounding, empirical benchmarks, and open questions

Other [&] portfolio products implement the protocols. OpenSentience defines them, grounds them in theory, and provides the thin enforcement layer that ties them together at runtime.

---

## The Ten Protocols

Eight **cognitive primitives** (OS-001–OS-008) plus two **cross-cutting protocols** (OS-009, OS-010):

| ID | Protocol | [&] Primitive | Status | Implementation |
|----|----------|---------------|--------|----------------|
| OS-001 | Continual Learning | `&memory.graph` | v0.3.3 shipped | [Graphonomous](../graphonomous/) |
| OS-002 | Topological Routing (κ) | `&reason.deliberate` | Spec complete | Graphonomous routing layer |
| OS-003 | Deliberation Orchestrator | `&reason.deliberate` | Spec complete | AgenTroMatic |
| OS-004 | Attention Engine | meta-reasoning | Spec complete | Graphonomous attention module |
| OS-005 | Model Tier Adaptation | system | Spec complete | Graphonomous / Agentelic |
| OS-006 | Agent Governance Shim | governance | In development | `open_sentience` hex package |
| OS-007 | Adversarial Robustness | `&govern.identity` | Draft | OpenSentience security module |
| OS-008 | Agent Harness | `&govern.harness` | Draft | OpenSentience harness module |
| **OS-009** | **PRISM** (Rating Iterative System Memory) | `&memory + &reason` | v3.0 in development | [`/PRISM/`](../PRISM/) — Fly.io deploy |
| **OS-010** | **PULSE** (Uniform Loop State Exchange) | `&memory + &govern + &time` | v0.1 draft | [`/PULSE/`](../PULSE/) — manifest standard |

### The Three-Protocol Stack

```
┌──────────────────────────────────────────────────────────┐
│  PRISM (OS-009)  — measures loops over time   diagnostic │
├──────────────────────────────────────────────────────────┤
│  PULSE (OS-010)  — declares loops + signals    temporal  │
├──────────────────────────────────────────────────────────┤
│  OS-001 … OS-008 — cognitive primitives       capability │
├──────────────────────────────────────────────────────────┤
│  [&]             — composes capabilities      structural │
└──────────────────────────────────────────────────────────┘
```

- **[&]** composes agents (`*.ampersand.json`) — structural layer
- **PULSE** gives them a heartbeat (`*.pulse.json`) — temporal layer
- **PRISM** measures their effect — diagnostic layer

Each protocol is independent. Adoption order is typically [&] → PULSE → PRISM.

---

## Protocol Summaries

### OS-001: Continual Learning
Hippocampal consolidation-inspired memory. Self-evolving knowledge graph with four node types (episodic, semantic, procedural, temporal), typed/weighted/decaying edges, multi-timescale consolidation, and no model weight modification — all learning is graph-structural.

### OS-002: Topological Routing (κ-Routing)
Routes queries through knowledge graphs using topological structure, not just embedding similarity. The κ parameter balances exploitation (κ=0, follow strong edges) vs exploration (κ→∞, random walk). Inspired by prefrontal cortex working memory gating.

### OS-003: Deliberation Orchestrator
Multi-agent consensus through structured phases: bid → debate → vote → commit. Uses weighted bipolar argumentation, Raft fast-path for agreement, PBFT for Byzantine tolerance, and reputation-weighted bid credibility. Maps to Kahneman's System 2.

### OS-004: Attention Engine
Three-phase proactive attention cycle — survey (scan all sources, produce salience map) → triage (rank by urgency/novelty/goals) → dispatch (route to pipelines). Runs continuously with adaptive frequency. Grounded in endogenous top-down attention.

### OS-005: Model Tier Adaptation
Graduated model selection across three tiers: `local_small` (1B–3B), `local_large` (7B–14B), `cloud_frontier` (70B+/API). Escalates when confidence falls below threshold; de-escalates by caching successful patterns as procedures. Based on resource rationality theory.

### OS-006: Agent Governance Shim
The only protocol OpenSentience implements directly. Deny-by-default permissions, five lifecycle states (installed → enabled → running → disabled → removed), three autonomy levels (observe / advise / act), append-only audit trail. ETS-backed lookups at microsecond latency. Ships as the `open_sentience` hex package.

### OS-007: Adversarial Robustness
Defense against prompt injection, model poisoning, side-channel attacks, identity spoofing, and resource exhaustion. Specification-stage protocol.

### OS-008: Agent Harness
Pipeline enforcement above governance. Two enforced pipelines (reactive: `query → recall → topology → deliberate → store`; sprint: planner → generator → evaluator → commit). Quality gates with adversarial grading. Sprint contracts with acceptance criteria. Context management with 60% utilization threshold. Grounded in Norman & Shallice's Supervisory Attentional System.

### OS-009: PRISM
**Protocol for Rating Iterative System Memory.** The first self-improving continual learning benchmark. Measures 9 CL dimensions (retrieval, transfer, uncertainty, feedback integration, forgetting, consolidation, temporal reasoning, multi-agent deliberation, composition). Four-phase evaluation loop: compose → interact → observe → reflect → diagnose. Features BYOR (Bring Your Own Repo), IRT calibration, three-layer judging, closed-loop verification, leaderboards, and actionable diagnostics.

### OS-010: PULSE
**Protocol for Uniform Loop State Exchange.** Temporal algebra declaring how loops cycle, nest, and signal. Five canonical phase kinds (retrieve, route, act, learn, consolidate). Six cadence types (event, periodic, streaming, idle, cross_loop_signal, manual). Five canonical cross-loop tokens via CloudEvents v1.0 envelopes. BYOL (Bring Your Own Loop) — any system publishing a conforming manifest is automatically PRISM-evaluable.

---

## Architecture

### Governance Shim (OS-006) — OTP Supervision Tree

```
OpenSentience.Application
├── OpenSentience.PermissionEngine     (GenServer + ETS — deny-by-default policy)
├── OpenSentience.AuditWriter          (GenServer — batched append-only)
├── OpenSentience.AutonomyController   (GenServer + ETS — observe/advise/act)
├── OpenSentience.AgentSupervisor      (DynamicSupervisor)
│   ├── AgentLifecycle "agent-001"     (GenStateMachine → wraps real process)
│   ├── AgentLifecycle "agent-002"
│   └── ...
├── OpenSentience.MCP.Server           (Hermes MCP — governance tools)
└── OpenSentience.Telemetry            (telemetry handler)
```

### Triple-Loop Nesting

The reference [&] ecosystem operates with three nested closed loops:

```
PRISM (outer)              compose → interact → observe → reflect → diagnose
  │
  └─ Graphonomous         retrieve → route → act → learn → consolidate
       │
       └─ Deliberation    survey → triage → dispatch → act → learn
```

PULSE manifests encode this nesting declaratively.

---

## Cognitive Science Grounding

Every protocol maps to published research:

| Protocol | Theory | Key Reference |
|----------|--------|---------------|
| OS-001 | Hippocampal consolidation | McClelland et al. 1995 |
| OS-002 | Working memory gating | O'Reilly & Frank 2006 |
| OS-003 | Dual-process theory | Kahneman 2011 |
| OS-004 | Endogenous attention | Desimone & Duncan 1995 |
| OS-005 | Resource rationality | Lieder & Griffiths 2020 |
| OS-006 | Executive function | Miyake et al. 2000 |
| OS-007 | Immune system analogy | — |
| OS-008 | Supervisory attentional system | Norman & Shallice 1986 |
| OS-009 | Meta-cognition + IRT | Signal detection theory |
| OS-010 | Closed-loop control + temporal cognition | Wiener 1948 |

---

## Empirical Results (OS-E001)

Benchmark of Graphonomous v0.3.3 on the full [&] portfolio (18,165 files across 14 projects):

| Metric | Result |
|--------|--------|
| QA proxy accuracy (LongMemEval, 500 questions) | 92.6% |
| Session hit rate | 98.7% |
| Mean retrieval latency | 1.4s |
| F1 gain from graph-expanded retrieval vs flat | +0.024 |
| Recall gain from graph-expanded retrieval | +0.103 |
| Automated edges extracted | 12,871 |
| Naturally occurring SCCs | 22 (max κ=27) |
| κ detection accuracy | 100% at 27K-node scale |
| Test pass rate | 455/455 (100%) |
| Consolidation throughput | ~27.1M nodes/sec |
| Abstention accuracy (learned ANN threshold) | 96.7% |

Full results: [`docs/spec/OS-E001-EMPIRICAL-EVALUATION.md`](docs/spec/OS-E001-EMPIRICAL-EVALUATION.md)

---

## κ Proof

[`kappa_proof.js`](kappa_proof.js) is a browser-runnable proof verifying the κ-routing theorem across **1,926,351 test cases**:

- 1,052,740 directed graphs (n=2–5): κ(G) > 0 ⟺ β₁(G) > 0 ⟺ nontrivial SCC
- 873,611 finite dynamical systems (n=2–7): κ(f) > 0 ⟺ periodic orbit (period > 1)
- **Zero counterexamples**

---

## Repository Structure

```
opensentience.org/
├── docs/
│   ├── spec/
│   │   ├── README.md                       # Master spec — all 10 protocols (source of truth)
│   │   ├── OS-008-HARNESS.md               # Agent Harness Protocol
│   │   ├── OS-009-PRISM-SPECIFICATION.md   # PRISM benchmark engine spec
│   │   ├── OS-010-PULSE-SPECIFICATION.md   # PULSE loop manifest spec
│   │   └── OS-E001-EMPIRICAL-EVALUATION.md # Empirical benchmark results
│   ├── skills/                             # Agent skill guides (8 numbered modules)
│   ├── index.md                            # ReadTheDocs homepage
│   ├── architecture.md                     # OTP supervision tree details
│   ├── ecosystem-overview.md               # 10 protocols + 12 product relationships
│   ├── positioning.md                      # Governance stack & market positioning
│   ├── competitive-landscape.md            # Comparison with CrewAI, LangGraph, etc.
│   ├── harness-engineering.md              # Pipeline enforcement deep-dive
│   ├── runtime-walkthrough.md              # Concrete agent lifecycle walkthrough
│   ├── comparison-table.md                 # Feature matrix vs alternatives
│   ├── research.md                         # Cognitive science grounding (7+ hours)
│   ├── quickstart.md                       # Elixir integration guide
│   ├── faq.md                              # Common questions
│   ├── conf.py                             # Sphinx configuration
│   └── requirements.txt                    # sphinx>=8, myst-parser>=4
├── index.html                              # Marketing landing page
├── kappa_proof.js                          # Browser-runnable κ proof (1.9M test cases)
├── CLAUDE.md                               # Agent context
├── AGENTS.md                               # Agent interface guide
├── .readthedocs.yaml                       # ReadTheDocs build config
└── old_scrap/                              # Historical v1/v2 iterations (not current)
```

---

## Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Language | Elixir 1.17+ / OTP 27 | GenStateMachine for lifecycle, ETS for microsecond policy lookups |
| Distribution | Hex package (`open_sentience`) | Dependency, not daemon — add to `mix.exs` |
| MCP Server | `hermes_mcp` (v0.8+) | Governance tools exposed as MCP tools |
| State Machine | `gen_state_machine` | Formal lifecycle transition rules |
| Hot Cache | ETS | Permission, lifecycle, and autonomy lookups — sub-microsecond |
| Audit Storage | Pluggable (ETS / File / Ecto) | ETS for dev, file for single-node, Ecto+Postgres for production |
| Telemetry | `:telemetry` | Permission check latency, lifecycle transitions, audit throughput |
| Documentation | Sphinx + MyST | ReadTheDocs build (Ubuntu 24.04, Python 3.13) |

---

## Quickstart

The governance shim wraps any OTP supervision tree:

```elixir
# 1. Add dependency
defp deps do
  [{:open_sentience, "~> 0.1"}]
end

# 2. Add to your supervision tree
children = [
  {OpenSentience, policy: "priv/governance/policy.yaml"},
  # ... your existing children
]

# 3. Install an agent
OpenSentience.install_agent("my-agent",
  permissions: %{filesystem: %{read: ["priv/**"]}},
  autonomy: :observe
)
```

Full integration guide: [`docs/quickstart.md`](docs/quickstart.md)

---

## Ecosystem Relationships

OpenSentience defines protocols. Portfolio products implement them:

| Product | Protocols Implemented | Role |
|---------|----------------------|------|
| [Graphonomous](../graphonomous/) | OS-001, OS-002, OS-004, OS-005 | Continual learning engine; primary PULSE substrate for `memory` |
| [AgenTroMatic](../agentromatic.com/) | OS-003 | Deliberation orchestrator |
| [Delegatic](../delegatic.com/) | OS-006 | Governance policy source; PULSE substrate for `policy` and `audit` |
| [Agentelic](../agentelic.com/) | OS-005 | Model tier adaptation |
| [FleetPrompt](../fleetprompt.com/) | OS-006 lifecycle | Agent marketplace consuming governance lifecycle |
| [SpecPrompt](../specprompt.com/) | OS-008 quality gates | Acceptance criteria for harness evaluation |
| [PRISM](../PRISM/) | OS-009 | Diagnostic benchmark engine (Elixir/OTP, Fly.io, 6 machines) |
| [PULSE](../PULSE/) | OS-010 | Loop manifest standard (JSON Schema, npm package) |

**Does not use Supabase.** The governance shim uses ETS (dev/edge) or pluggable backends. PRISM uses SQLite. PULSE uses embedded SQLite + sqlite-vec.

---

## Documentation

Documentation is built with Sphinx + MyST and configured for ReadTheDocs:

```bash
# Build locally
cd docs
pip install -r requirements.txt
sphinx-build -b html . _build/html
```

### Key documents

- **[Master Spec](docs/spec/README.md)** — All 10 protocols, architecture, implementation roadmap
- **[OS-008 Harness](docs/spec/OS-008-HARNESS.md)** — Pipeline enforcement, quality gates, sprint contracts
- **[OS-009 PRISM](docs/spec/OS-009-PRISM-SPECIFICATION.md)** — 9 CL dimensions, 4-phase evaluation, BYOR, IRT
- **[OS-010 PULSE](docs/spec/OS-010-PULSE-SPECIFICATION.md)** — Loop manifests, 5 phase kinds, 5 tokens, BYOL
- **[Empirical Evaluation](docs/spec/OS-E001-EMPIRICAL-EVALUATION.md)** — Graphonomous v0.3.3 benchmark results
- **[Architecture](docs/architecture.md)** — OTP supervision tree, component details
- **[Cognitive Science](docs/research.md)** — Research grounding for all protocols
- **[Competitive Landscape](docs/competitive-landscape.md)** — Comparison with CrewAI, LangGraph, AutoGen, etc.
- **[FAQ](docs/faq.md)** — Common questions answered
- **[Quickstart](docs/quickstart.md)** — Elixir integration guide

---

## Design Principles

1. **Research first, code second** — Every protocol is grounded in cognitive science before implementation
2. **Thin shim, not thick runtime** — Hex package dependency, not a daemon
3. **Graduated autonomy** — Three levels (observe, advise, act) build trust incrementally
4. **Deny by default** — No implicit permissions; every operation requires explicit policy
5. **Append-only audit** — Every event is logged immutably; no updates, no deletes
6. **Protocol-driven** — Numbered specs (OS-00X) are the source of truth; implementations reference them
7. **OTP-native** — GenServer, ETS, supervision trees; no external dependencies beyond BEAM

---

## License

Apache 2.0 — Open research.

---

## Author

**Travis Burandt** — [Ampersand Box Design](https://ampersandboxdesign.com)
