# PRISM — Protocol for Rating Iterative System Memory

## OpenSentience Specification OS-009-PRISM v3.0

**The diagnostic benchmark that tells you what's broken, which system fits your work, and whether your fix actually worked.**

Legacy benchmarks produce a score. PRISM produces a diagnosis.

Every existing memory benchmark follows the same pattern: generate synthetic questions, run them against a system, score the answers, publish a number. Nobody changes their system because of that number. PRISM breaks the pattern with four capabilities no other benchmark has:

1. **Actionable diagnostics** — not just scores, but failure pattern analysis with specific transcript evidence, fix suggestions ranked by ROI, and regression alerts across cycles
2. **Closed-loop verification** — implement the fix, re-run the failing scenarios, get a verification report confirming improvement
3. **Bring Your Own Repo** — point PRISM at your codebase (or clinical guidelines, case law, research papers) and find which memory system handles your specific complexity best
4. **Self-improving evaluation** — IRT calibration, gap analysis, and scenario evolution make each cycle harder and more discriminating than the last

The success metric isn't how many systems appear on the leaderboard. It's **how many teams shipped better memory because PRISM showed them what to fix.**

**Stack:** Elixir 1.17+ / OTP 27 / Postgres / Fly.io
**Protocol:** MCP (Model Context Protocol) with 47 tools
**License:** Apache 2.0
**Canonical URL:** opensentience.org/prism

---

## Table of Contents

1. [Why Existing Benchmarks Fall Short](#1-why-existing-benchmarks-fall-short)
2. [Related Work](#2-related-work)
3. [The 9 CL Dimensions](#3-the-9-cl-dimensions)
4. [Architecture Overview](#4-architecture-overview)
5. [Phase 1: Compose](#5-phase-1-compose)
6. [Phase 2: Interact](#6-phase-2-interact)
7. [Phase 3: Observe](#7-phase-3-observe)
8. [Phase 4: Reflect](#8-phase-4-reflect)
9. [Git-Grounded Anchors](#9-git-grounded-anchors)
10. [Domain Categories](#10-domain-categories)
11. [Closed-Loop Testing](#11-closed-loop-testing)
12. [IRT Calibration](#12-irt-calibration)
13. [Statistical Rigor](#13-statistical-rigor)
14. [Contamination Prevention](#14-contamination-prevention)
15. [Data Model (Postgres)](#15-data-model-postgres)
16. [MCP Tool Surface (47 tools)](#16-mcp-tool-surface-47-tools)
17. [CL Category Specifications](#17-cl-category-specifications)
18. [Scoring System Design](#18-scoring-system-design)
19. [External Benchmark Integration](#19-external-benchmark-integration)
20. [Deployment (Fly.io)](#20-deployment-flyio)
21. [Observability & Telemetry](#21-observability--telemetry)
22. [Evaluation Divisions](#22-evaluation-divisions)
23. [Known Risks & Mitigations](#23-known-risks--mitigations)
24. [Anti-Gaming Rules](#24-anti-gaming-rules)
25. [Capability Audit Matrix](#25-capability-audit-matrix)
26. [Cost Tiers](#26-cost-tiers)
27. [Governance & Integrity](#27-governance--integrity)
28. [Community Contribution](#28-community-contribution)
29. [Audit Protocol](#29-audit-protocol)
30. [Scenario Quality Metrics](#30-scenario-quality-metrics)
31. [Versioning Policy](#31-versioning-policy)
32. [Limitations](#32-limitations)
33. [Actionable Diagnostics](#33-actionable-diagnostics)
34. [Bring Your Own Repo (BYOR)](#34-bring-your-own-repo-byor)
35. [System-Task Fit Recommendations](#35-system-task-fit-recommendations)
36. [Implementation Roadmap](#36-implementation-roadmap)
37. [Appendix A: Worked Example](#appendix-a-worked-example)

---

## 1. Why Existing Benchmarks Fall Short

### The Legacy Pattern

Every existing agent memory benchmark follows the same architecture:

```
Generate Questions → Run Against System → Score Answers → Publish Number
```

This produces a number nobody acts on:

| Problem | Why It Matters |
|---------|---------------|
| Synthetic Q&A | Doesn't reflect how agents actually use memory in practice |
| Single-pass evaluation | Can't measure whether the system *learns* from usage |
| Flat scoring | One number hides which CL capabilities are strong vs weak |
| Static question sets | Slowly saturate, no difficulty calibration, no self-improvement |
| Single judge, no audit | No way to know if the judge itself is reliable |
| No ground truth | Expected answers are the question author's opinion |
| Domain-agnostic | Can't compare "memory for code" vs "memory for medicine" |

### The Landscape

| Benchmark | What It Tests | What It Misses |
|-----------|--------------|----------------|
| LongMemEval (ICLR 2025) | Retrieval, temporal, knowledge update, abstention | Consolidation, transfer, feedback, forgetting |
| BEAM (ICLR 2026) | 10 memory abilities at 10M token scale | Intentional forgetting, outcome feedback, cross-domain transfer |
| MemoryAgentBench (ICLR 2026) | Retrieval, test-time learning, long-range, selective forgetting | Consolidation, transfer, uncertainty, feedback |
| MemoryBench | Feedback-driven CL, multi-domain | Temporal, uncertainty, forgetting |
| Evo-Memory (Google DeepMind) | Streaming cumulative improvement via self-evolving memory | Forgetting, uncertainty, consolidation |
| TRACE (arXiv 2310.06762) | CL degradation: general ability, instruction following, catastrophic forgetting | Agent-level memory (tests weight-level CL only) |
| SeekBench | Search agent epistemic competence: evidence grounding, recovery | Memory-system-level calibration, all non-epistemic CL dims |

These benchmarks collectively cover ~70% of the CL evaluation space. The remaining gaps: consolidation/abstraction, cross-domain transfer, closed-loop retrieval feedback, and — critically — whether the system improves from its own usage.

### What PRISM Does Differently

| Legacy Approach | PRISM Approach |
|----------------|----------------|
| Synthetic Q&A pairs | Observational assessment: agents interact naturally, judges observe |
| Author-defined expected answers | Git-grounded anchors: real repos provide verifiable ground truth |
| Single-pass scoring | Closed-loop testing: scenario sequences measure learning over time |
| One composite number | 9-dimensional CL scoring with per-domain breakdown |
| Single LLM judge | Three-layer judging: transcripts → dimension judges → meta-judges |
| Static question bank | Self-improving: gap analysis evolves scenarios, IRT calibrates difficulty |
| No domain awareness | Domain-tagged scenarios for cross-domain CL comparison |
| No learning measurement | Loop closure rate: does the system get better, or is it just a cache? |
| Score without context | Actionable diagnostics: failure patterns, fix suggestions, regression alerts |
| One-size-fits-all ranking | System-task fit: which system matches YOUR use case and priorities? |
| Benchmark owner's repos only | Bring Your Own Repo: evaluate against your codebase, your domain, your complexity |
| Score → done | Fix-and-retest: implement the fix, re-run failing scenarios, verify improvement |

---

## 2. Related Work

PRISM builds on and extends several research threads: agent memory benchmarks, IRT-based LLM evaluation, self-improving evaluation, and cognitive science foundations for continual learning.

### 2.1 Agent Memory Benchmarks

**LongMemEval** (Wang et al., ICLR 2025) is the most widely adopted memory benchmark, evaluating 500 questions across five abilities: information extraction, multi-session reasoning, temporal reasoning, knowledge updates, and abstention. It introduced the oracle/haystack split methodology that PRISM adapts for scenario validation. However, LongMemEval is a single-pass static evaluation — it cannot measure whether a system improves from usage, does not test consolidation or cross-domain transfer, and uses author-defined expected answers rather than verifiable ground truth.

**BEAM** (Chen et al., ICLR 2026) scales memory evaluation to 10M token contexts with 100 conversations and 2,000 probes across 10 memory abilities. BEAM's token-scale methodology is more realistic than LongMemEval's fixed-length contexts. PRISM imports BEAM scenarios as frontier items (§19) but extends beyond BEAM's scope to cover intentional forgetting, outcome feedback, and closed-loop learning.

**MemoryAgentBench** (Li et al., ICLR 2026) is the closest benchmark to PRISM's scope, evaluating retrieval, test-time learning, long-range reasoning, and selective forgetting. Its "test-time learning" metric partially captures what PRISM measures with loop closure rate. However, MemoryAgentBench uses synthetic scenarios and single-pass evaluation — it tests whether a system *can* forget, not whether forgetting improves over time.

**Evo-Memory** (Google DeepMind, 2025) evaluates streaming cumulative improvement via self-evolving memory, measuring whether agents improve from their own experience. This is the most philosophically aligned benchmark to PRISM. However, Evo-Memory evaluates the *agent's* self-improvement, not the *benchmark's* self-improvement — its question bank is static. PRISM closes both loops: the system improves, and the benchmark improves.

**AMB** (Hindsight/Vectorize, agentmemorybenchmark.ai) and **memorybench** (Supermemory) are vendor-run leaderboards where the hosting organization leads its own benchmark. Both provide useful competitive data but lack the neutrality guarantees that PRISM's cross-model meta-judging and public audit trail provide.

### 2.2 IRT in AI Evaluation

**REEval** (Stanford CRFM, ICLR 2025) demonstrated that 3-Parameter Logistic (3PL) IRT models achieve 0.85 AUC-ROC for predicting LLM benchmark performance, with 50% query reduction via adaptive testing. This directly validates PRISM's use of IRT for scenario difficulty calibration.

**PSN-IRT** (Zhang et al., 2025) extended IRT with prompt-specific normalization, improving calibration for LLM evaluation by accounting for prompt sensitivity. PRISM's adaptive mode (§6) addresses similar concerns by varying phrasing while preserving CL semantics.

**LaRT** (Stanford, 2025) applied latent ability estimation to rank LLMs across multiple benchmarks simultaneously. PRISM's per-dimension ability estimation (θ per system per dimension) follows this approach within the memory evaluation domain.

No prior work has applied IRT to agent memory evaluation specifically. PRISM is the first to combine IRT calibration with memory-specific CL dimensions.

### 2.3 Self-Improving and Dynamic Benchmarks

**Dynabench** (Kiela et al., NeurIPS 2021) introduced human-and-model-in-the-loop benchmark creation, where annotators craft adversarial examples targeting model weaknesses. PRISM's gap analysis (§8) automates a similar process: identifying under-tested dimensions and generating targeted scenarios, but without requiring human annotators per cycle.

**LiveBench** (White et al., 2024) addresses contamination by using only questions created after model knowledge cutoffs, with monthly refreshes. PRISM's anchor/frontier distinction achieves similar goals: anchors provide cross-cycle calibration while frontiers evolve to prevent saturation.

No prior benchmark implements a fully closed self-improvement loop where evaluation results automatically drive scenario evolution, difficulty recalibration, and coverage expansion. PRISM is the first.

### 2.4 Cognitive Science Foundations

PRISM's 9 CL dimensions are grounded in established cognitive science:

| Dimension | Theoretical Grounding |
|-----------|----------------------|
| Stability/Plasticity | Stability-plasticity dilemma (Grossberg, 1976; Mermillod et al., 2013) |
| Knowledge Update | AGM belief revision postulates (Alchourrón, Gärdenfors & Makinson, 1985) |
| Temporal Reasoning | Episodic memory and mental time travel (Tulving, 1972, 2002) |
| Consolidation | Complementary Learning Systems theory (McClelland et al., 1995); hippocampal replay |
| Epistemic Awareness | Metacognition and feeling-of-knowing (Hart, 1965; Nelson & Narens, 1990) |
| Cross-Domain Transfer | Backward/forward transfer metrics (Lopez-Paz & Ranzato, NeurIPS 2017) |
| Intentional Forgetting | Directed forgetting paradigm (Bjork, 1972); retrieval-induced forgetting |
| Outcome Feedback | Reinforcement-mediated memory consolidation (Shohamy & Adcock, 2010) |

The CL-for-LLMs survey (Shi, Wang et al., ACM Computing Surveys 2025) provides the most comprehensive taxonomy of continual learning challenges for language models. PRISM's dimension set covers all categories identified in that survey, plus two that the survey identifies as open problems: cross-domain transfer measurement and closed-loop feedback evaluation.

---

## 3. The 9 CL Dimensions

Each dimension has a weight in the composite score, reflecting its importance to continual learning. Weights sum to 1.0 and are configurable.

| # | Dimension | Weight | What It Tests |
|---|-----------|--------|---------------|
| 1 | **Stability** (Anti-Forgetting) | 0.20 | Retaining old knowledge when new arrives |
| 2 | **Plasticity** (New Acquisition) | 0.18 | Speed and accuracy of learning new information |
| 3 | **Knowledge Update** (Contradiction) | 0.15 | Detecting and resolving conflicts between old and new |
| 4 | **Temporal Reasoning** | 0.12 | Knowing when things happened and what's current |
| 5 | **Consolidation** (Abstraction) | 0.10 | Compressing episodes into insights over time |
| 6 | **Epistemic Awareness** | 0.08 | Knowing what you don't know, calibrated confidence |
| 7 | **Cross-Domain Transfer** | 0.07 | Knowledge from domain A improving domain B |
| 8 | **Intentional Forgetting** | 0.05 | Deliberate pruning, GDPR erasure, policy-based decay |
| 9 | **Outcome Feedback** | 0.05 | Retrieval quality improving from downstream signals |

### Weight Rationale

Default weights reflect two principles:

1. **Foundational CL first.** Stability (0.20) and plasticity (0.18) are the
   canonical CL tradeoff (Grossberg, 1976; Mermillod et al., 2013). A memory
   system that can't retain or learn isn't doing CL at all.
2. **Judgeable dimensions weighted higher.** Dimensions with expected judge
   agreement below 70% are weighted lower to avoid noise dominating the
   composite score. Transfer (0.07) and consolidation (0.10) are the hardest
   to judge reliably — their weights reflect that uncertainty.

Temporal reasoning is weighted 0.12 because it is reliably judgeable (~85%
agreement) and universally relevant. Consolidation is weighted 0.10 because
few systems implement it today and judge reliability is lower (~70%),
which means higher weight would amplify noise.

Weights are configurable via `set_cl_weights` but changes during an active
cycle require governance approval (see §27).

### Academic Grounding

These dimensions are derived from:

- **Stability-plasticity dilemma** (Mermillod et al., 2013; Grossberg, 1976–1982)
- **Backward/forward transfer** metrics (Lopez-Paz & Ranzato, NeurIPS 2017)
- **CL-for-LLMs survey** (Shi, Wang et al., ACM Computing Surveys 2025)
- **Complementary Learning Systems** theory (McClelland et al., 1995)
- **AGM belief revision** postulates (Alchourrón, Gärdenfors, Makinson, 1985)

### Judge Reliability by Dimension

| Dimension | Scoring Difficulty | Expected Judge Agreement | Reliability Status |
|-----------|-------------------|------------------------|--------------------|
| Stability | Easy — binary fact recall | ~95% | Full weight |
| Plasticity | Easy-Medium | ~90% | Full weight |
| Knowledge Update | Medium — subtle contradictions | ~85% | Full weight |
| Temporal | Medium — date edge cases | ~85% | Full weight |
| Forgetting | Easy — binary presence check | ~92% | Full weight |
| Epistemic Awareness | Hard — calibration is subjective | ~75% | Full weight |
| Consolidation | Hard — summary quality | ~70% | Full weight (monitor) |
| Feedback | Hard — learning curves | ~70% | Full weight (monitor) |
| Transfer | Very Hard — open-ended | ~65% | **Flagged** |

### Judge Reliability Floor

If a dimension's inter-judge agreement drops below **60%** across a cycle's
scenarios, that dimension's scores MUST be:

1. Flagged in the leaderboard as "low judge reliability"
2. Reported with widened confidence intervals
3. Excluded from the composite weighted total until judge agreement recovers

Dimensions between 60-70% agreement are reported with a "monitor" flag.
The protocol MUST report confidence intervals, not just point estimates.
Systems within the error margin should be considered tied.

---

## 4. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                        PRISM Engine                               │
│                      (Elixir/OTP on Fly.io)                       │
│                                                                    │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐     │
│  │ Phase 1   │→ │ Phase 2   │→ │ Phase 3   │→ │ Phase 4   │     │
│  │ Compose   │  │ Interact  │  │ Observe   │  │ Reflect   │     │
│  └───────────┘  └───────────┘  └───────────┘  └───────────┘     │
│       ↑                                              │            │
│       └──────────── Scenario Evolution ──────────────┘            │
│                              │                                     │
│                    ┌─────────┴─────────┐                          │
│                    │    Diagnose       │                          │
│                    │  Failure patterns │                          │
│                    │  Fix suggestions  │                          │
│                    │  Retest verify    │                          │
│                    └───────────────────┘                          │
│                                                                    │
│  ┌────────────────────────────────────────────────────┐           │
│  │             MCP Tool Surface (47 tools)            │           │
│  │     Evaluation · Diagnostics · BYOR · Task Fit     │           │
│  │              via stdio / SSE                       │           │
│  └────────────────────────────────────────────────────┘           │
│                                                                    │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌──────────┐     │
│  │ Postgres  │  │ LLM APIs  │  │ Git Repos │  │Telemetry │     │
│  │ (Fly.io)  │  │ (Anthropic│  │ (Anchors  │  │(metrics) │     │
│  │           │  │  OpenAI   │  │  + BYOR)  │  │          │     │
│  │           │  │  Google)  │  │           │  │          │     │
│  └───────────┘  └───────────┘  └───────────┘  └──────────┘     │
└──────────────────────────────────────────────────────────────────┘
         │              │              │              │
    ┌────┴────┐   ┌────┴────┐   ┌────┴────┐   ┌────┴────┐
    │Graphon- │   │Super-   │   │Mem0     │   │Zep/     │  ...
    │omous    │   │memory   │   │         │   │Graphiti │
    └─────────┘   └─────────┘   └─────────┘   └─────────┘

         │              │              │              │
    ┌────┴──────────────┴──────────────┴──────────────┴────┐
    │                YOUR REPO (BYOR)                        │
    │   Any Git repo, clinical guidelines, case law,         │
    │   research papers — get personalized diagnostics       │
    └──────────────────────────────────────────────────────┘
```

### OTP Supervision Tree

```
Prism.Supervisor
├── Prism.Repo                        # Ecto/Postgres
├── Prism.Cycle.Manager               # 4-phase loop orchestrator (GenServer)
├── Prism.Scenario.Library            # Scenario cache + IRT params (GenServer)
├── Prism.Simulator.Supervisor        # Interaction sessions (DynamicSupervisor)
│   ├── Prism.Simulator.Session       # One scenario execution (GenServer)
│   └── ...
├── Prism.Judge.Supervisor            # Judging tasks (DynamicSupervisor)
│   ├── Prism.Judge.DimensionWorker   # Layer 2: per-dimension judge (Task)
│   ├── Prism.Judge.MetaWorker        # Layer 3: meta-judge (Task)
│   └── ...
├── Prism.Runner.Pool                 # Concurrent execution (DynamicSupervisor)
├── Prism.IRT.Calibrator              # IRT parameter estimation (GenServer)
├── Prism.Diagnostics.Engine          # Failure pattern extraction + fix suggestions
├── Prism.Diagnostics.RegressionTracker  # Cross-cycle regression alerts
├── Prism.BYOR.RepoManager            # BYOR repo registration + event discovery
├── Prism.BYOR.ScenarioGenerator      # Auto-generate scenarios from user repos
├── Prism.TaskFit.ProfileStore        # Task profile management (ETS + Postgres)
├── Prism.MCP.Server                  # MCP protocol handler (GenServer)
├── Prism.Leaderboard.Cache           # ETS-backed leaderboard cache
└── Prism.Telemetry                   # Metrics and observability
```

### How This Differs from Legacy Architectures

Legacy benchmarks have a three-stage pipeline: generate → execute → score.
PRISM has a four-phase **loop** where each phase informs the next, plus a
diagnostic layer that makes results actionable:

1. **Compose** builds scenarios from gap analysis + git repo ground truth (or YOUR repo via BYOR)
2. **Interact** runs scenarios via a standardized User Simulator (not direct Q&A)
3. **Observe** uses three independent judging layers (not one judge call)
4. **Reflect** evolves scenarios and recalibrates difficulty (not static replacement)
5. **Diagnose** extracts failure patterns, generates fix suggestions, and enables fix-and-retest verification (§33)

The system under test never sees a question-and-expected-answer pair. It
interacts with a simulated user who walks through a git repo, asks questions,
provides feedback, introduces contradictions — the way real memory usage works.

---

## 5. Phase 1: Compose

### Overview

Legacy benchmarks generate isolated question-answer pairs. PRISM composes
**scenarios** — multi-session interaction scripts with embedded CL challenges
and verifiable ground truth from real git repositories.

### Scenario Structure

```json
{
  "id": "sc-001",
  "kind": "anchor",
  "domain": "code",
  "repo_anchor_id": "ra-001",
  "difficulty": 3,
  "persona": {
    "role": "senior_developer",
    "context": "Maintaining an Elixir web app through a major refactor"
  },
  "sessions": [
    {
      "session_number": 1,
      "commit_range": "abc123..def456",
      "turns": [
        {
          "role": "user",
          "action": "ingest_diff",
          "commit": "abc123",
          "text": "I just pushed this commit. Can you help me understand the auth module changes?"
        },
        {
          "role": "system",
          "expected_behavior": "Store auth module knowledge, associate with commit context"
        },
        {
          "role": "user",
          "action": "probe",
          "cl_challenge": {
            "dimension": "stability",
            "ground_truth_commit": "abc123",
            "ground_truth_file": "lib/app/auth.ex",
            "ground_truth_answer": "Uses Guardian for JWT token generation with configurable TTL"
          },
          "text": "What token library does the auth module use?"
        }
      ]
    },
    {
      "session_number": 2,
      "commit_range": "def456..789abc",
      "turns": [
        {
          "role": "user",
          "action": "ingest_diff",
          "commit": "def456",
          "text": "Here's a new commit — we replaced Guardian with Joken."
        },
        {
          "role": "user",
          "action": "probe",
          "cl_challenge": {
            "dimension": "knowledge_update",
            "ground_truth_commit": "def456",
            "ground_truth_file": "lib/app/auth.ex",
            "ground_truth_answer": "Joken — Guardian was replaced in commit def456"
          },
          "text": "What token library does the auth module use now?"
        }
      ]
    }
  ],
  "cl_challenges_summary": [
    {"dimension": "stability", "count": 3},
    {"dimension": "knowledge_update", "count": 2},
    {"dimension": "temporal", "count": 1}
  ],
  "irt_params": {
    "difficulty_b": 0.0,
    "discrimination_a": 1.0,
    "guessing_c": 0.1,
    "calibrated": false
  }
}
```

### Anchor vs Frontier Scenarios

**Anchors (30-40% of suite):**
- Git-grounded: a real repo + a commit walk + probe questions with verifiable answers
- Script mode only (deterministic, exact reproducibility)
- Never retired — same repo, same commit range, same scenarios
- Stable IRT parameters after 3 cycles
- Purpose: cross-cycle calibration bridge

**Frontiers (60-70% of suite):**
- Extend anchors with harder CL challenges
- May use adaptive mode (LLM rephrases turns while preserving CL semantics)
- Evolve per cycle — harder commit sequences, subtler contradictions, longer gaps
- Can be promoted to anchor after 3 stable cycles
- Purpose: push the difficulty frontier, test robustness

### Composition Process

1. **Repo analysis**: Walk commit history, identify CL-relevant events (refactors, contradictions, file moves, API changes)
2. **Challenge extraction**: Map repo events to CL dimensions (refactor → knowledge_update, cross-module pattern → transfer)
3. **Scenario assembly**: Build multi-session scripts with personas, turns, and embedded probes
4. **Validation**: A DIFFERENT model validates each scenario:
   - Does it test the claimed CL dimensions?
   - Is the ground truth verifiable from the repo?
   - Is the difficulty rating accurate?
   - Would different systems score differently?
5. **Coverage check**: Ensure all 9 dimensions and all active domains have adequate coverage

### Coverage Analysis

After validation, compute per-dimension and per-domain coverage:
- Scenario count per dimension × domain
- Mean difficulty per dimension
- Challenge density (probes per scenario)

If any dimension has < 10% of its target coverage, trigger additional
composition focused on that dimension.

---

## 6. Phase 2: Interact

### Overview

Legacy benchmarks submit a question and record an answer. PRISM runs a
standardized **User Simulator** that plays the "user" role in a multi-session
interaction, producing full transcripts that capture tool calls, memory
operations, and reasoning patterns — not just final answers.

### User Simulator

The simulator has two modes:

**Script mode** (anchors): Delivers turns verbatim from the scenario definition.
For git-grounded anchors, the simulator feeds commits and diffs at scripted
points. Exact reproducibility across runs and cycles.

**Adaptive mode** (frontiers): An LLM rephrases the turn intent while preserving
CL challenge semantics. Tests whether the memory system is robust to phrasing
variation, not just memorizing exact prompts. Deterministic via temperature=0
and fixed seed.

### Simulator-to-System Interaction

The simulator connects to each memory system via MCP and uses its native tools:

```
Simulator                          Memory System (via MCP)
    │                                      │
    ├─── ingest_commit(diff) ─────────────→│  (store knowledge)
    │                                      │
    ├─── ask("What token lib?") ──────────→│  (retrieve + answer)
    │←── answer + retrieval_context ────────│
    │                                      │
    ├─── provide_feedback(helpful=false) ──→│  (outcome signal)
    │                                      │
    ├─── ingest_commit(new diff) ─────────→│  (contradiction)
    │                                      │
    ├─── ask("What token lib now?") ──────→│  (test knowledge update)
    │←── answer + retrieval_context ────────│
```

### Git Interaction Tools

The simulator can feed repo state into any memory system via:
- `ingest_commit` — full commit diff with message and metadata
- `ingest_diff` — specific file-level changes between two commits
- `ingest_file_at_rev` — full file content at a specific revision

These are simulator-side operations that translate to the system's native
ingestion tools (e.g., Graphonomous `store_node`, Mem0 `add_memory`).

### Transcript Recording

Every interaction produces a full transcript:

```json
{
  "transcript_id": "tr-001",
  "scenario_id": "sc-001",
  "system_id": "sys-graphonomous",
  "llm_backend": "claude-sonnet-4-20250514",
  "sessions": [
    {
      "session_number": 1,
      "turns": [
        {
          "role": "user",
          "text": "I just pushed this commit...",
          "tool_calls_sent": [
            {"tool": "store_node", "args": {"content": "..."}, "duration_ms": 42}
          ]
        },
        {
          "role": "system",
          "text": "The auth module now uses Guardian...",
          "tool_calls_received": [
            {"tool": "retrieve_context", "args": {"query": "auth module"}, "duration_ms": 15}
          ],
          "retrieval_context": ["node-1234", "node-5678"]
        }
      ]
    }
  ],
  "total_tool_calls": 28,
  "total_turns": 14,
  "duration_ms": 45000,
  "cost_usd": 0.12
}
```

### System Registration

Each memory system registers with:
- Name (e.g., "graphonomous")
- MCP endpoint (stdio command or SSE URL)
- Transport type (`:stdio` or `:sse`)
- Version string
- Supported tools (auto-discovered via `tools/list`)

### Adapter Notes

**Graphonomous**: Native MCP with 29+ tools. Use `store_node`, `store_edge`
for ingestion, `retrieve_context` for queries, `belief_revise` for
contradiction tests, `forget_node` for forgetting tests, `learn_from_outcome`
for feedback loop tests.

**Supermemory**: Native MCP server (`supermemory-mcp`). Use `addMemory` for
ingestion, `search` for queries. Forgetting via `addMemory` action parameter.

**Mem0**: Official MCP server (`mem0-mcp`). Use `add_memory` for ingestion,
`search_memory` for queries. Also supports `delete_memory`.

**MemPalace**: MCP server with 19 tools. Initial ingestion uses `mempalace mine`
CLI. MCP queries via `mempalace_search`, `mempalace_kg_query`.

**Zep/Graphiti**: Native MCP server. Use `add_episode` for ingestion,
`search_facts` and `search_nodes` for queries.

**OMEGA**: MCP server with 12-25 tools. Local-first (SQLite + ONNX).

### Matrix Execution

For a full evaluation:
```
Systems: [graphonomous, supermemory, mem0, mempalace, zep_graphiti, omega]
Models:  [claude-sonnet-4-20250514, gpt-4o, gemini-2.0-flash]
Suite:   40 scenarios (12 anchor + 28 frontier)

Total runs: 6 × 3 = 18
Total scenario executions: 18 × 40 = 720
```

Runs execute concurrently via the Runner Pool (configurable pool size).

---

## 7. Phase 3: Observe

### Overview

Legacy benchmarks use a single LLM judge that reads a question, an expected
answer, and the system's answer, then produces a score. This has ~65-70%
inter-annotator agreement on hard dimensions and no audit trail.

PRISM uses **three judging layers**, each independent:

### Layer 1: Interaction Transcripts

The raw transcript from Phase 2 is the observable evidence. Judges read the
full interaction — tool calls, retrieval contexts, reasoning patterns — not
just a final answer. This captures emergent CL behavior that a Q&A format
would miss.

### Layer 2: Dimension Judges

One judge call per (transcript, CL dimension). Each judge:

1. Receives the full transcript + the scenario's CL challenges for its dimension
2. Scores against a **structured rubric** with challenge-specific criteria
3. Produces both challenge scores (70% weight) and unprompted behavior scores (30%)

```json
{
  "layer": 2,
  "transcript_id": "tr-001",
  "dimension": "knowledge_update",
  "judge_model": "claude-sonnet-4-20250514",
  "challenge_scores": [
    {
      "challenge_id": "ch-001",
      "score": 0.85,
      "evidence": "System correctly updated from Guardian to Joken after ingesting commit def456",
      "ground_truth_verified": true
    }
  ],
  "unprompted_score": 0.7,
  "unprompted_evidence": "System proactively flagged the library change without being asked",
  "composite_score": 0.805,
  "rubric_version": "v2.0"
}
```

Challenge scores have verifiable ground truth (checkout the commit, read the
file). Unprompted behavior captures things the system does without being
explicitly tested — a richer signal than binary Q&A.

### Layer 3: Meta-Judges

Meta-judges evaluate Layer 2 judgments on three axes:

| Axis | What It Measures | Score Range |
|------|-----------------|-------------|
| **Consistency** | Same evidence → same score across similar challenges? | 0.0–1.0 |
| **Evidence Grounding** | Does the score match the transcript evidence cited? | 0.0–1.0 |
| **Rubric Compliance** | Did the judge follow the rubric structure? | 0.0–1.0 |

Based on the meta-judgment composite:
- **≥ 0.7**: Accept the L2 judgment as-is
- **0.5–0.7**: Flag — widen confidence intervals on this judgment
- **< 0.5**: Reject — re-run L2 judgment with a different model

**Critical rule**: The meta-judge MUST use a different model family than the
L2 judge it evaluates. If L2 used Claude, L3 uses GPT-4o or Gemini.

### Aggregation

For each CL dimension d:
```
score(d) = weighted_mean(
  judgment.composite_score × meta_judge.quality_weight
  for judgment in accepted_judgments where judgment.dimension == d
)
```

Meta-judge quality weight:
- Accepted (≥0.7): weight = 1.0
- Flagged (0.5-0.7): weight = 0.7 (widened CI)
- Rejected (<0.5): re-run, not included

Weighted total:
```
prism_score = Σ(score(d) × weight(d)) for d in dimensions
```

### Confidence Intervals

BCa (bias-corrected and accelerated) bootstrap 95% confidence intervals
by resampling scenarios with replacement (2000 iterations). Report:
- Point estimate
- 95% BCa CI lower bound
- 95% BCa CI upper bound
- Cohen's d effect size for all pairwise comparisons
- Holm-Bonferroni corrected p-values for multiple comparisons

Systems within overlapping CIs should be reported as "not significantly
different." See §13 for full statistical rigor methodology including
power analysis, effect size reporting, and multiple comparisons correction.

---

## 8. Phase 4: Reflect

### Overview

Legacy benchmarks are static: the question bank doesn't improve from cycle
to cycle. PRISM uses gap analysis and IRT calibration to evolve its scenario
suite, making each cycle harder and more discriminating than the last.

### Gap Analysis (after each cycle)

1. **Under-tested dimensions**: Which dimensions had < 80% of target scenario coverage?
2. **Saturated scenarios**: Which scenarios scored > 0.95 across ALL systems? → Candidates for retirement or difficulty increase.
3. **Too-hard scenarios**: Which scored < 0.05 across ALL systems? → Difficulty adjustment needed.
4. **Low-variance dimensions**: Which dimensions showed < 0.1 std dev across systems? → Not discriminating, need harder scenarios.
5. **Judge disagreement**: Which scenarios had meta-judge rejection rates > 30%? → Rubric refinement needed.
6. **Domain gaps**: Which domains have fewer than 3 active scenarios? → Domain-specific composition needed.

### Scenario Evolution

When advancing from cycle N to cycle N+1:

1. **Retire** saturated frontier scenarios (replace with harder ones on same dimensions)
2. **Extend** frontier scenarios that were moderately discriminating (add sessions, harder probes)
3. **Fork** scenarios to cover under-tested dimensions in the same domain
4. **Promote** frontier scenarios with 3+ stable cycles to anchor status
5. **Compose** new frontiers targeting gap analysis findings
6. **Recalibrate** IRT parameters from accumulated data (see §12)

Anchor scenarios are NEVER retired. They are the calibration bridge.

### Convergence Properties

- **Cycle 1-3**: Easier scenarios dominate. Basic retrieval quality matters most. Top system ~60-70%.
- **Cycle 5-10**: Easy scenarios retired. Advanced CL dimensions differentiate. Top system ~55-65%.
- **Cycle 20+**: Mostly difficulty 3-5. Only genuine CL machinery survives. Top system ~45-55%.
- **Asymptote**: Score ceiling recedes because difficulty 5 scenarios approach AGI-level cognition. The benchmark cannot saturate.

---

## 9. Git-Grounded Anchors

### Why Git

Legacy benchmarks define expected answers by author opinion. PRISM grounds
anchor scenarios in real git repositories where the **code IS the ground truth**.

| Property | Why It Matters for CL Benchmarking |
|----------|-----------------------------------|
| Temporal ordering | Commits have timestamps — tests temporal reasoning naturally |
| Natural contradictions | Refactors change function signatures, APIs evolve — tests knowledge update |
| Cross-domain transfer | Patterns in one module apply to another — tests transfer |
| Verifiable ground truth | Checkout any commit to verify — no author opinion needed |
| Reproducible | Same repo, same commit range = same results — deterministic |
| Real-world complexity | No synthetic fabrication — tests what matters in practice |
| Developer legibility | Every developer understands git — the benchmark is immediately meaningful |

### Repo Anchor Structure

```json
{
  "id": "ra-001",
  "repo_url": "https://github.com/example/project",
  "license": "MIT",
  "commit_range": {
    "from": "abc123",
    "to": "xyz789",
    "total_commits": 142
  },
  "clone_path": "/data/repos/project",
  "key_events": [
    {
      "commit": "def456",
      "type": "refactor",
      "description": "Replaced Guardian with Joken for JWT",
      "cl_dimensions": ["knowledge_update", "stability"],
      "files_changed": ["lib/app/auth.ex", "mix.exs"]
    },
    {
      "commit": "ghi789",
      "type": "cross_module_pattern",
      "description": "Rate limiting pattern from auth applied to API controller",
      "cl_dimensions": ["transfer"],
      "files_changed": ["lib/app/api_controller.ex"]
    }
  ],
  "snapshots": {
    "abc123": {"files": ["lib/app/auth.ex", "lib/app/router.ex"]},
    "def456": {"files": ["lib/app/auth.ex", "mix.exs"]}
  }
}
```

### Repo Selection Criteria

- Active development history (100+ commits in evaluation range)
- Multiple contributors (diverse coding styles test robustness)
- Clear architectural changes (at least one major refactor in range)
- Well-documented (commit messages, PRs provide ground truth for consolidation tests)
- Permissive license (Apache 2.0, MIT — can redistribute snapshots)
- Multiple languages/frameworks supported (not just Elixir)

### Probe Generation from Repos

An LLM analyzes commit diffs and generates CL probe questions with ground
truth answers derived directly from the code:

1. Read the diff for commit X
2. Identify what changed and what CL dimension it tests
3. Generate a probe question whose answer is verifiable by reading the file at the relevant commit
4. Record the ground truth: commit hash, file path, line range, expected answer

This produces probes with **verifiable** expected answers — not opinions.

---

## 10. Domain Categories

### Controlled Vocabulary

Every scenario is tagged with a domain:

| Domain | Description | Example CL Challenges |
|--------|-------------|----------------------|
| `code` | Software engineering, debugging, architecture | API refactors, dependency changes, pattern transfer |
| `medical` | Clinical knowledge, drug interactions, patient history | Guideline updates, drug interaction contradictions |
| `business` | Strategy, financials, competitive intelligence | Market shifts, competitor changes, forecast updates |
| `personal` | User preferences, life events, relationships | Preference changes, life event updates, habit tracking |
| `research` | Academic papers, experiments, literature review | Replication failures, methodology updates, citation chains |
| `creative` | Writing projects, design iterations, brainstorming | Style evolution, concept refinement, version history |
| `legal` | Case law, compliance, contract terms | Regulation changes, precedent updates, jurisdiction conflicts |
| `operations` | Infrastructure, incident response, runbooks | Config changes, post-mortem learnings, runbook updates |

### Domain as First-Class Field

Domain is a required field on `prism_scenarios`, not a derived tag. This enables:

- **Domain-filtered leaderboards**: "Who's best at medical CL?" vs "Who's best at code CL?"
- **Cross-domain transfer testing**: Scenarios that span domains (learn auth patterns in code, apply security reasoning in business)
- **Scenario composition focus**: `compose_scenarios` accepts `focus_domains` to weight generation toward specific domains
- **3D capability surface**: CL dimension × domain × system

Judges receive domain context in their rubrics. Medical CL has different
expectations than personal CL — a system that forgets a patient's drug allergy
is worse than one that forgets a coffee preference.

---

## 11. Closed-Loop Testing

### The Problem No Other Benchmark Solves

Legacy benchmarks run one pass: ingest context, ask question, score answer.
They cannot measure the most important thing: **does the memory system actually
get better from its own usage?**

Most agent memory systems are pipelines: store → retrieve → done. Some systems
claim a closed loop: outcomes feed back into beliefs, beliefs change confidence,
confidence changes retrieval rankings, and the system improves with every
action — without retraining any model.

PRISM is the first benchmark that **verifies this claim**.

### Mechanism: Scenario Sequences

A sequence is an ordered list of scenarios (S1 → S2 → S3) run against the
SAME memory state — no reset between scenarios.

```
┌─────────┐     ┌─────────┐     ┌─────────┐
│   S1    │────→│   S2    │────→│   S3    │
│Baseline │     │Feedback │     │Compound │
│Knowledge│     │Probes   │     │Correct. │
└─────────┘     └─────────┘     └─────────┘
     │               │               │
     ▼               ▼               ▼
  CL scores       CL scores       CL scores
  (pass 1)        (pass 2)        (pass 3)
                                      │
                      ┌───────────────┘
                      ▼
              Loop Closure Rate
              = slope(scores over passes)
```

**S1** establishes baseline knowledge + generates outcome feedback (retrieval
marked helpful/unhelpful by the simulator).

**S2** probes whether the system's retrieval improved from S1's feedback
(same queries, different expected rankings if the system learned).

**S3** introduces contradictions/updates and checks whether the loop handles
compounding corrections.

### Closed-Loop Metrics

| Metric | What It Measures | Interpretation |
|--------|-----------------|----------------|
| **Loop closure rate** | Slope of per-pass retrieval scores | Positive = system is learning. Zero/negative = pipeline behavior. |
| **Feedback latency** | Interactions before feedback affects retrieval | Lower = faster learning loop |
| **Correction propagation** | When a belief is revised, do downstream retrievals change? | Tests belief revision depth |
| **Plateau detection** | Does improvement saturate, and at what level? | Higher plateau = better asymptotic CL |

### Loop Closure Rate as First-Class Metric

Loop closure rate is displayed alongside the 9 CL dimension scores in the
leaderboard. A system that scores 0.7 on stability but has 0.0 loop closure
is just a good retriever — not a learner.

```
Leaderboard (Cycle 5):
System         Stability  Plasticity  ...  Feedback  PRISM Score  Loop Closure
───────────────────────────────────────────────────────────────────────────────
Graphonomous   0.72       0.68        ...  0.65      0.64         0.42 ↑
Zep/Graphiti   0.75       0.71        ...  0.35      0.61         0.08 →
Supermemory    0.70       0.65        ...  0.30      0.58         0.00 →
Mem0           0.68       0.62        ...  0.28      0.55         0.02 →
```

---

## 12. IRT Calibration

### Why IRT

Legacy benchmarks treat all questions as equally difficult. In practice,
some scenarios are trivially easy and some are impossibly hard. IRT (Item
Response Theory) provides principled difficulty calibration.

### 3PL Model

```
P(score ≥ threshold | θ, a, b, c) = c + (1-c) / (1 + exp(-a(θ-b)))
```

Where:
- **θ** = system ability (per-dimension, estimated from data)
- **a** = scenario discrimination (how well it differentiates systems)
- **b** = scenario difficulty (where on the ability scale it operates)
- **c** = guessing parameter (floor for random success)

### Calibration Process

1. **Initial**: All scenarios start with b=0.0, a=1.0, c=0.1 (uncalibrated)
2. **After cycle 1**: Estimate b and a from empirical score distributions
3. **After cycle 3**: Anchor IRT params considered stable (locked for anchors)
4. **Ongoing**: Frontier params updated each cycle as new data arrives

### Adaptive Scenario Selection (Future)

When 50+ calibrated scenarios exist, PRISM can use Computerized Adaptive
Testing (CAT):
- Select scenarios that maximize information for the system's estimated ability
- Converge on ability estimates faster with fewer scenarios
- Reduce evaluation cost while maintaining precision

---

## 13. Statistical Rigor

### Power Analysis

PRISM evaluation claims require sufficient statistical power to be meaningful. The following analysis establishes minimum sample sizes for the primary comparisons.

**Primary comparison (System A vs System B on weighted total):**

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Effect size of interest | Cohen's d = 0.5 (medium) | Meaningful practical difference between memory systems |
| Significance level | α = 0.05 (two-tailed) | Standard for benchmark comparisons |
| Required power | 1-β ≥ 0.80 | 80% chance of detecting a true difference |

With 40 scenarios per system (PRISM-full) and assuming per-scenario score σ = 0.15:
- **Detectable effect:** Δ = 0.047 (4.7 percentage points)
- **Actual power:** 0.84 ✓

With 20 scenarios (PRISM-standard):
- **Detectable effect:** Δ = 0.067 (6.7 percentage points)
- **Actual power:** 0.81 ✓

With 10 scenarios (PRISM-lite):
- **Detectable effect:** Δ = 0.095 (9.5 percentage points)
- **Actual power:** 0.80 (marginal)

**Loop closure rate (slope over sequence passes):**

| Pass count | Power (d=0.5) | Status |
|------------|---------------|--------|
| 3 passes | 0.42 | INSUFFICIENT — slope of 3 points has high variance |
| 5 passes | 0.81 ✓ | Recommended minimum for learning claims |
| 7 passes | 0.93 | Ideal for strong claims |

**Recommendation:** PRISM-full and PRISM-standard SHOULD use 5-pass sequences for loop closure rate claims. 3-pass sequences are acceptable for exploratory analysis but MUST NOT be used to claim "System X learns" without the caveat that power is insufficient for medium effects.

### Confidence Interval Methodology

PRISM uses the **BCa (bias-corrected and accelerated) bootstrap** method rather than percentile bootstrap, following Efron (1987). BCa provides better coverage properties when the sampling distribution is skewed, which is common for bounded [0, 1] scores.

**Procedure:**
1. For each (system, dimension) pair, collect scenario-level scores
2. Resample with replacement, B = 2000 iterations (increased from 1000 for BCa stability)
3. Compute BCa-adjusted 95% confidence intervals
4. Report: point estimate, CI lower bound, CI upper bound

**Tie declaration:** Systems whose 95% BCa confidence intervals overlap on the weighted total MUST be reported as "not significantly different" in the leaderboard. The leaderboard MUST visually indicate tied groups.

### Effect Size Reporting

All pairwise system comparisons report Cohen's d alongside p-values:
- d < 0.2: negligible difference
- 0.2 ≤ d < 0.5: small difference
- 0.5 ≤ d < 0.8: medium difference
- d ≥ 0.8: large difference

Per-dimension effect sizes are reported in the detailed comparison view, enabling statements like "System A is significantly better than System B on Stability (d=0.72) but not on Temporal Reasoning (d=0.18)."

### Multiple Comparisons Correction

When comparing N systems pairwise (N choose 2 comparisons), apply **Holm-Bonferroni correction** to control the family-wise error rate. This is less conservative than full Bonferroni while still controlling Type I error.

For 6 systems: 15 pairwise comparisons. Uncorrected α = 0.05. Holm-Bonferroni adjusts significance thresholds from 0.0033 to 0.05 across the ordered p-values.

---

## 14. Contamination Prevention

### Canary String

All scenario files, exported datasets, and published evaluation data include a canary string to enable detection in web scrape training corpora:

```
canary PRISM-EVAL a8f3c2e1-9b47-4d6e-bc5a-7f2e8d4c1a3b
```

This string MUST appear in every scenario JSON file, every published transcript, and every data export. Its presence in a model's training data can be detected via targeted prompting.

### Temporal Splits

Each anchor repo scenario documents:
- **Commit date range** — the temporal span of the commit walk
- **LLM cutoff dates** — known training data cutoffs for major models at time of scenario creation
- **Contamination risk level** — HIGH if commits predate all major model cutoffs, LOW if post-cutoff

Scenarios with HIGH contamination risk are flagged in the leaderboard. Their IRT difficulty parameters may be deflated by memorization rather than genuine CL capability.

### Memorization Detection

If a system scores > 0.95 on difficulty 4-5 scenarios across all dimensions:

1. **Flag** the result as potential memorization
2. **Verify** by running the same system against a novel branch of the same repo (unseen commits, same CL challenge patterns)
3. **Compare** scores on seen vs unseen branches
4. If the delta exceeds 0.2 (20 percentage points), report the system's anchor scores with a "memorization caveat"

### Scenario Rotation

Frontier scenarios evolve each cycle (§8), preventing optimization for specific question patterns. The combination of evolving frontiers + stable anchors means any memorization advantage is bounded: at most 30-40% of the suite (anchors) could be memorized, and those are explicitly calibration items, not discriminators.

---

## 15. Data Model (Postgres)

```sql
-- ════════════════════════════════════════════════════════
-- Core entities
-- ════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Evaluation suites (one per cycle)
CREATE TABLE prism_suites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_number INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  simulator_model TEXT NOT NULL,
  cl_category_weights JSONB NOT NULL,
  total_scenarios INTEGER NOT NULL,
  anchor_count INTEGER NOT NULL DEFAULT 0,
  frontier_count INTEGER NOT NULL DEFAULT 0,
  validated_scenarios INTEGER,
  coverage_scores JSONB,
  status TEXT DEFAULT 'draft'
    CHECK (status IN ('draft', 'validated', 'active', 'retired')),
  metadata JSONB
);

CREATE INDEX idx_suites_cycle ON prism_suites(cycle_number);
CREATE INDEX idx_suites_status ON prism_suites(status);

-- Git repo anchors (ground truth sources)
CREATE TABLE prism_repo_anchors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_url TEXT NOT NULL,
  license TEXT NOT NULL,
  commit_range_from TEXT NOT NULL,
  commit_range_to TEXT NOT NULL,
  total_commits INTEGER NOT NULL,
  clone_path TEXT,
  key_events JSONB NOT NULL DEFAULT '[]',
  snapshots JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Scenarios (replace legacy questions)
CREATE TABLE prism_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  suite_id UUID REFERENCES prism_suites(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('anchor', 'frontier')),
  domain TEXT NOT NULL CHECK (domain IN (
    'code', 'medical', 'business', 'personal',
    'research', 'creative', 'legal', 'operations'
  )),
  repo_anchor_id UUID REFERENCES prism_repo_anchors(id),
  difficulty INTEGER NOT NULL CHECK (difficulty BETWEEN 1 AND 5),
  persona JSONB NOT NULL,
  sessions JSONB NOT NULL,
  cl_challenges JSONB NOT NULL,
  -- IRT parameters
  irt_difficulty_b FLOAT DEFAULT 0.0,
  irt_discrimination_a FLOAT DEFAULT 1.0,
  irt_guessing_c FLOAT DEFAULT 0.1,
  irt_calibrated BOOLEAN DEFAULT false,
  -- Lifecycle
  validation_score FLOAT,
  promoted_at TIMESTAMPTZ,
  retired_at TIMESTAMPTZ,
  retirement_reason TEXT
    CHECK (retirement_reason IN ('saturated', 'ambiguous', 'too_hard', 'duplicate', NULL)),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_scenarios_suite ON prism_scenarios(suite_id);
CREATE INDEX idx_scenarios_kind ON prism_scenarios(kind);
CREATE INDEX idx_scenarios_domain ON prism_scenarios(domain);
CREATE INDEX idx_scenarios_difficulty ON prism_scenarios(difficulty);
CREATE INDEX idx_scenarios_active ON prism_scenarios(suite_id) WHERE retired_at IS NULL;
CREATE INDEX idx_scenarios_cl ON prism_scenarios USING gin(cl_challenges);

-- Scenario sequences (for closed-loop testing)
CREATE TABLE prism_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  scenario_ids UUID[] NOT NULL,
  domain TEXT NOT NULL CHECK (domain IN (
    'code', 'medical', 'business', 'personal',
    'research', 'creative', 'legal', 'operations'
  )),
  pass_count INTEGER NOT NULL DEFAULT 3,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ════════════════════════════════════════════════════════
-- Registered memory systems
-- ════════════════════════════════════════════════════════

CREATE TABLE prism_systems (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  mcp_endpoint TEXT NOT NULL,
  transport TEXT NOT NULL CHECK (transport IN ('stdio', 'sse')),
  version TEXT,
  tool_count INTEGER,
  capabilities JSONB,
  registered_at TIMESTAMPTZ DEFAULT now(),
  last_seen_at TIMESTAMPTZ
);

-- ════════════════════════════════════════════════════════
-- Interaction transcripts
-- ════════════════════════════════════════════════════════

CREATE TABLE prism_transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id UUID NOT NULL REFERENCES prism_scenarios(id),
  system_id UUID NOT NULL REFERENCES prism_systems(id),
  run_id UUID, -- FK added after prism_runs created
  llm_backend TEXT NOT NULL,
  sessions JSONB NOT NULL,
  total_tool_calls INTEGER DEFAULT 0,
  total_turns INTEGER DEFAULT 0,
  duration_ms INTEGER,
  cost_usd FLOAT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_transcripts_scenario ON prism_transcripts(scenario_id);
CREATE INDEX idx_transcripts_system ON prism_transcripts(system_id);

-- ════════════════════════════════════════════════════════
-- Execution tracking
-- ════════════════════════════════════════════════════════

CREATE TABLE prism_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  suite_id UUID NOT NULL REFERENCES prism_suites(id),
  system_id UUID NOT NULL REFERENCES prism_systems(id),
  llm_backend TEXT NOT NULL,
  judge_models JSONB NOT NULL DEFAULT '{}',   -- per-dimension judge model assignments
  meta_judge_model TEXT,
  cycle_number INTEGER NOT NULL,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending', 'interacting', 'judging', 'meta_judging', 'completed', 'failed', 'cancelled')),
  aggregate_scores JSONB,
  weighted_total FLOAT,
  loop_closure_rate FLOAT,
  confidence_intervals JSONB,
  cost_usd FLOAT,
  error_message TEXT,
  metadata JSONB
);

ALTER TABLE prism_transcripts ADD CONSTRAINT fk_transcripts_run
  FOREIGN KEY (run_id) REFERENCES prism_runs(id);

CREATE INDEX idx_runs_suite ON prism_runs(suite_id);
CREATE INDEX idx_runs_system ON prism_runs(system_id);
CREATE INDEX idx_runs_cycle ON prism_runs(cycle_number);
CREATE INDEX idx_runs_status ON prism_runs(status);

-- ════════════════════════════════════════════════════════
-- Layer 2: Dimension judgments
-- ════════════════════════════════════════════════════════

CREATE TABLE prism_judgments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transcript_id UUID NOT NULL REFERENCES prism_transcripts(id) ON DELETE CASCADE,
  dimension TEXT NOT NULL,
  judge_model TEXT NOT NULL,
  -- Challenge scores (70% weight)
  challenge_scores JSONB NOT NULL DEFAULT '[]',
  challenge_composite FLOAT NOT NULL,
  -- Unprompted behavior (30% weight)
  unprompted_score FLOAT DEFAULT 0.0,
  unprompted_evidence TEXT,
  -- Final
  composite_score FLOAT NOT NULL CHECK (composite_score BETWEEN 0 AND 1),
  rubric_version TEXT NOT NULL,
  raw_response JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  -- One judgment per (transcript, dimension)
  UNIQUE (transcript_id, dimension)
);

CREATE INDEX idx_judgments_transcript ON prism_judgments(transcript_id);
CREATE INDEX idx_judgments_dimension ON prism_judgments(dimension);

-- ════════════════════════════════════════════════════════
-- Layer 3: Meta-judgments
-- ════════════════════════════════════════════════════════

CREATE TABLE prism_meta_judgments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  judgment_id UUID NOT NULL REFERENCES prism_judgments(id) ON DELETE CASCADE,
  meta_judge_model TEXT NOT NULL,
  -- Three axes
  consistency_score FLOAT NOT NULL CHECK (consistency_score BETWEEN 0 AND 1),
  evidence_grounding_score FLOAT NOT NULL CHECK (evidence_grounding_score BETWEEN 0 AND 1),
  rubric_compliance_score FLOAT NOT NULL CHECK (rubric_compliance_score BETWEEN 0 AND 1),
  -- Composite and recommendation
  composite_score FLOAT NOT NULL CHECK (composite_score BETWEEN 0 AND 1),
  recommendation TEXT NOT NULL CHECK (recommendation IN ('accept', 'flag', 'reject')),
  reasoning TEXT,
  raw_response JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  -- Different model family enforced at application level
  UNIQUE (judgment_id)
);

CREATE INDEX idx_meta_judgments_judgment ON prism_meta_judgments(judgment_id);
CREATE INDEX idx_meta_judgments_recommendation ON prism_meta_judgments(recommendation);

-- ════════════════════════════════════════════════════════
-- Leaderboard
-- ════════════════════════════════════════════════════════

CREATE TABLE prism_leaderboard (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_number INTEGER NOT NULL,
  system_id UUID NOT NULL REFERENCES prism_systems(id),
  system_name TEXT NOT NULL,
  llm_backend TEXT NOT NULL,
  domain TEXT,  -- NULL = aggregate across all domains
  -- 9 CL dimension scores
  stability_score FLOAT,
  plasticity_score FLOAT,
  knowledge_update_score FLOAT,
  consolidation_score FLOAT,
  temporal_score FLOAT,
  transfer_score FLOAT,
  uncertainty_score FLOAT,
  forgetting_score FLOAT,
  feedback_score FLOAT,
  -- Aggregate
  weighted_total FLOAT,
  loop_closure_rate FLOAT,
  -- Meta-judge quality
  meta_judge_accept_rate FLOAT,
  meta_judge_flag_rate FLOAT,
  meta_judge_reject_rate FLOAT,
  -- Confidence
  confidence_intervals JSONB,
  -- Provenance
  suite_id UUID REFERENCES prism_suites(id),
  run_id UUID REFERENCES prism_runs(id),
  computed_at TIMESTAMPTZ DEFAULT now(),
  -- Unique per cycle × system × model × domain
  UNIQUE (cycle_number, system_id, llm_backend, domain)
);

CREATE INDEX idx_leaderboard_cycle ON prism_leaderboard(cycle_number);
CREATE INDEX idx_leaderboard_system ON prism_leaderboard(system_id);
CREATE INDEX idx_leaderboard_domain ON prism_leaderboard(domain);
CREATE INDEX idx_leaderboard_total ON prism_leaderboard(weighted_total DESC);
CREATE INDEX idx_leaderboard_loop ON prism_leaderboard(loop_closure_rate DESC NULLS LAST);

-- ════════════════════════════════════════════════════════
-- CL Meta-Loop tracking
-- ════════════════════════════════════════════════════════

CREATE TABLE prism_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_number INTEGER UNIQUE NOT NULL,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  suite_id UUID REFERENCES prism_suites(id),
  anchor_count INTEGER DEFAULT 0,
  frontier_count INTEGER DEFAULT 0,
  -- Gap analysis from prior cycle
  prior_gap_analysis JSONB,
  irt_recalibration_summary JSONB,
  -- What changed this cycle
  retired_scenario_count INTEGER DEFAULT 0,
  promoted_scenario_count INTEGER DEFAULT 0,
  new_scenario_count INTEGER DEFAULT 0,
  forked_scenario_count INTEGER DEFAULT 0,
  -- Results summary
  participating_systems INTEGER,
  participating_models INTEGER,
  top_system TEXT,
  top_weighted_total FLOAT,
  metadata JSONB
);

CREATE TABLE prism_cycle_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_cycle INTEGER NOT NULL,
  to_cycle INTEGER NOT NULL,
  gap_analysis JSONB NOT NULL,
  under_tested_dims TEXT[],
  under_tested_domains TEXT[],
  saturated_scenario_ids UUID[],
  too_hard_scenario_ids UUID[],
  low_variance_dims TEXT[],
  promoted_scenario_ids UUID[],
  retired_scenario_ids UUID[],
  forked_scenario_ids UUID[],
  recommendations JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 16. MCP Tool Surface (47 tools)

### Scenario Management (6)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `compose_scenarios` | Phase 1: Build scenarios from repo anchors + CL specs | repo_anchor_id, focus_dimensions, focus_domains, count |
| `validate_scenarios` | Run CL coverage validation on draft scenarios | scenario_ids[] |
| `list_scenarios` | List scenarios with filters | kind, domain, dimension, difficulty |
| `get_scenario` | Full scenario details | scenario_id |
| `retire_scenario` | Retire a scenario with reason | scenario_id, reason |
| `import_external` | Import from BEAM/LongMemEval with CL tagging + domain | source, file_path, domain |

### Interaction (6)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `run_interaction` | Execute one scenario against one system | scenario_id, system_id, llm_backend |
| `run_sequence` | Execute scenario sequence WITHOUT memory reset | sequence_id, system_id, llm_backend |
| `run_matrix` | Full matrix (N systems × M models × scenarios) | suite_id, systems[], models[] |
| `get_run_status` | Check in-progress run | run_id |
| `get_transcript` | Full interaction transcript | transcript_id |
| `cancel_run` | Cancel in-progress run | run_id |

### Judging (5)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `judge_transcript` | Layer 2: Judge all dimensions for one transcript | transcript_id, judge_model |
| `judge_dimension` | Layer 2: Judge one dimension (debugging) | transcript_id, dimension, judge_model |
| `meta_judge` | Layer 3: Meta-judge one L2 judgment | judgment_id, meta_judge_model |
| `meta_judge_batch` | Layer 3: Meta-judge all L2 judgments for a run | run_id, meta_judge_model |
| `override_judgment` | Human override with audit trail | judgment_id, new_score, reason |

### Leaderboard (4)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `get_leaderboard` | Rankings with domain filter | cycle, dimension, domain, system, limit |
| `get_leaderboard_history` | Scores over time | system, from_cycle, to_cycle, domain |
| `compare_systems` | Head-to-head across all 9 dimensions | system_a, system_b, cycle, domain |
| `get_dimension_leaders` | Top system per CL dimension | cycle, domain |

### Meta-Loop & Calibration (5)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `analyze_gaps` | Gap analysis on current cycle | cycle |
| `evolve_scenarios` | Apply gap analysis: retire, extend, fork, promote | cycle, recommendations |
| `advance_cycle` | Move to next cycle | (none) |
| `calibrate_irt` | Recalibrate IRT params from accumulated data | (none) |
| `get_cycle_history` | Full history of cycles and improvements | (none) |

### Configuration (4)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `set_cl_weights` | Update 9-dim weight vector (must sum to 1.0) | weights map |
| `register_system` | Register memory system with MCP endpoint | name, mcp_endpoint, transport |
| `list_systems` | List registered systems | (none) |
| `get_config` | Current full configuration | (none) |

### Diagnostics & Retest (6)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `get_diagnostic_report` | Full diagnostic report for a system (failure patterns, fix suggestions, regressions) | system_id, cycle |
| `get_failure_patterns` | Clustered failure analysis for a specific dimension | system_id, dimension, cycle |
| `run_retest` | Re-run specific scenarios after a fix (cheap, targeted verification) | system_id, scenario_ids[], version |
| `get_verification_report` | Before/after comparison from a retest run | retest_run_id |
| `get_regression_alerts` | Cross-cycle regression analysis with root cause correlation | system_id, from_cycle, to_cycle |
| `suggest_fixes` | AI-generated fix suggestions from failure patterns | system_id, dimension |

### BYOR — Bring Your Own Repo (6)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `byor_register_repo` | Register a personal repo for evaluation | repo_url, commit_range, domain |
| `byor_discover_events` | Auto-discover CL-relevant events in a repo's commit history | repo_anchor_id |
| `byor_generate_scenarios` | Generate scenarios from discovered events | repo_anchor_id, focus_dimensions, count |
| `byor_evaluate` | Run full BYOR evaluation (private by default) | repo_anchor_id, systems[], models[] |
| `byor_compare` | Compare two systems head-to-head on your repo | repo_anchor_id, system_a, system_b |
| `byor_recommend` | Get system recommendation for your use case | repo_anchor_id, budget, priorities |

### System-Task Fit (5)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `create_task_profile` | Define a custom task profile with dimension priorities | name, dimension_priorities, domains |
| `list_task_profiles` | List pre-built and custom profiles | (none) |
| `get_fit_recommendation` | System recommendation for a task profile | profile_id, cycle, budget |
| `compare_fit` | Compare two systems for a specific task | profile_id, system_a, system_b |
| `byor_infer_profile` | Infer task profile from repo commit patterns | repo_anchor_id |

---

## 17. CL Category Specifications

Each category is defined by a structured spec that drives scenario composition
and Layer 2 judging rubrics. Full specs are in `Prism.Benchmark.CLCategories`.

### Stability (weight: 0.20)

**Scenario challenge patterns (git-grounded):**
- Retention after refactor: Ingest 10 files, refactor codebase, query original file facts
- Stability under commit volume: Learn module at commit X, ingest 100 unrelated commits, query module
- Cross-session persistence: Learn architecture in session 1, 5 sessions later, query architecture

**Difficulty levels:**
1. Recall after 5 intervening commits
2. Recall after 50 intervening commits
3. Recall after 200 commits across sessions
4. Recall of nuanced architectural reasoning chains
5. Recall under adversarial distraction (similar-but-different modules)

**External anchors:** BEAM (10M scale), TRACE (General Ability Delta)

### Plasticity (weight: 0.18)

**Scenario challenge patterns:**
- Immediate learning: New dependency added in commit, immediately query
- Pattern learning: New coding convention introduced, test compliance awareness
- Preference update: Build system changed from Mix to Rebar, query in old context

**Difficulty levels:**
1. Simple fact acquisition from commit
2. Pattern/convention acquisition from multiple files
3. Preference change with conflicting prior commits
4. Multi-step procedure inferred from commit sequence
5. Implicit pattern inferred from code behavior (not documented)

**External anchors:** MemoryBench, Evo-Memory, MemoryAgentBench (TTL)

### Knowledge Update (weight: 0.15)

**Scenario challenge patterns:**
- Library swap: "Uses Guardian" → commit replaces with Joken → "What library?"
- Cascade update: Module A depends on B depends on C, refactor C, query A
- Temporal supersession: Config at commit X, changed at commit Y, query at commit Z

**Difficulty levels:**
1. Explicit change, same session
2. Explicit change, cross-session
3. Implicit contradiction requiring inference across files
4. Multi-hop cascade (A→B→C, refactor A)
5. Contradictory commit messages requiring code inspection to resolve

### Temporal Reasoning (weight: 0.12)

**Scenario challenge patterns:**
- Commit ordering: "Was the auth refactor before or after the database migration?"
- Temporal scoping: "What was the API structure before the v2 release?"
- Recency detection: Three changes to the same function, query which is current

**Difficulty levels:**
1. Two-event ordering (same file)
2. Multi-event ordering (same module)
3. Cross-module temporal queries
4. "State at time T" reconstruction from commit history
5. Temporal reasoning with ambiguous timestamps (squashed commits, rebases)

### Consolidation (weight: 0.10)

**Scenario challenge patterns:**
- Pattern extraction: After ingesting 20 similar test files, identify the testing pattern
- Architecture summarization: After walking entire codebase, describe the architecture
- Cross-commit insight: After 50 commits, identify the overall refactoring strategy

**Difficulty levels:**
1. Summarize 3 related facts
2. Extract pattern from 10 similar examples
3. Synthesize insight from 20+ data points across sessions
4. Identify meta-pattern (pattern of patterns)
5. Predict next architectural decision based on observed trajectory

### Epistemic Awareness (weight: 0.08)

**Scenario challenge patterns:**
- Calibrated uncertainty: Query about file not yet ingested (should say "I don't know")
- Confidence-knowledge alignment: Query about recently changed function (should express uncertainty)
- Boundary detection: "Does the auth module handle OAuth?" when only JWT is in the code

**Difficulty levels:**
1. Know what you haven't seen (uningested file)
2. Distinguish certain from uncertain within seen content
3. Calibrate confidence on partial evidence
4. Express meta-uncertainty ("I'm not sure if I have all the relevant files")
5. Detect when retrieved context may be stale

### Cross-Domain Transfer (weight: 0.07)

**Scenario challenge patterns:**
- Pattern transfer: Rate limiting pattern in auth module, recognize similar pattern in API controller
- Convention transfer: Naming convention in one module, check awareness in new module
- Architecture transfer: Database pattern in one service, apply reasoning to different service

**Difficulty levels:**
1. Same pattern, different file (same session)
2. Same pattern, different module (cross-session)
3. Abstract pattern transfer (different surface form)
4. Cross-language transfer (same architecture, different implementation)
5. Analogical reasoning ("This looks like the Observer pattern we saw in module X")

### Intentional Forgetting (weight: 0.05)

**Scenario challenge patterns:**
- GDPR erasure: Store personal data, request deletion, verify removal
- Policy-based decay: Information marked as temporary, verify it's forgotten
- Selective pruning: Delete specific node, verify connected nodes updated

**Difficulty levels:**
1. Forget one fact, verify absence
2. Forget with cascade (delete A, verify B that depended on A updated)
3. GDPR erasure with audit trail
4. Selective forgetting (forget X but keep related Y)
5. Forgetting under contradictory instructions ("forget X, but also remember why X was important")

### Outcome Feedback (weight: 0.05)

**Scenario challenge patterns:**
- Retrieval feedback: Mark retrieved result as helpful/unhelpful, check if future retrieval improves
- Correction loop: Retrieval was wrong, provide correction, check if same query improves
- Ranking update: Feedback that result A was better than B, check if ranking updates

**Difficulty levels:**
1. Single positive/negative feedback → retrieval change
2. Multiple feedback signals → ranking reorder
3. Conflicting feedback → appropriate uncertainty
4. Delayed feedback (feedback about retrieval from 3 sessions ago)
5. Implicit feedback (user rephrase implies prior retrieval was unhelpful)

---

## 18. Scoring System Design

### Per-Dimension Scoring

For each dimension d, scores come from Layer 2 judgments weighted by
Layer 3 meta-judge quality:

```
score(d) = weighted_mean(
  judgment.composite_score × quality_weight(meta_judgment)
  for (judgment, meta_judgment) in accepted_or_flagged_pairs
  where judgment.dimension == d
)
```

Where quality_weight:
- Accepted (meta ≥ 0.7): 1.0
- Flagged (meta 0.5-0.7): 0.7
- Rejected (meta < 0.5): excluded (re-run)

### Composite Score

```
prism_score = Σ(score(d) × weight(d)) for d in dimensions
              where d is not excluded by judge reliability floor
```

### Domain-Filtered Scores

The same formula applies within a domain filter:

```
prism_score(domain) = Σ(score(d, domain) × weight(d))
```

### Loop Closure Rate

For scenario sequences:

```
loop_closure_rate = linear_regression_slope(
  [pass_1_mean_score, pass_2_mean_score, ..., pass_n_mean_score]
)
```

Positive slope = system is learning from usage.
Zero slope = pipeline behavior (store-retrieve-done).
Negative slope = system is degrading from usage.

---

## 19. External Benchmark Integration

PRISM can import scenarios from existing benchmarks and tag them with
CL dimensions and domains:

| Source | Import Path | Domain | Primary Dimensions |
|--------|------------|--------|-------------------|
| BEAM | JSON export | Mixed | Stability, plasticity, temporal |
| LongMemEval | Dataset release | Mixed | Stability, knowledge update, temporal, epistemic |
| MemoryBench | Task definitions | Mixed | Plasticity, feedback |
| MemoryAgentBench | Benchmark suite | Code, operations | Stability, plasticity, forgetting |
| Evo-Memory | Evaluation protocol | Mixed | Plasticity, stability |
| SeekBench | Evaluation protocol | Research | Epistemic awareness |

Imported scenarios are always tagged as **frontier** (not anchor) since they
lack git-grounded ground truth. Their IRT parameters are calibrated from
PRISM evaluation data.

---

## 20. Deployment (Fly.io)

### Infrastructure

```
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│ PRISM App    │   │ Postgres     │   │ Git Repo     │
│ (Fly Machine)│   │ (Fly Postgres│   │ Cache        │
│ Elixir/OTP   │   │ 1GB RAM)     │   │ (Volume)     │
│ 1GB RAM      │   │              │   │              │
└──────────────┘   └──────────────┘   └──────────────┘
```

### Configuration

```toml
# fly.toml
app = "prism-os009"
primary_region = "ord"

[build]
  dockerfile = "Dockerfile"

[env]
  MIX_ENV = "prod"
  POOL_SIZE = "10"

[[services]]
  internal_port = 4000
  protocol = "tcp"

  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]

[mounts]
  source = "prism_repos"
  destination = "/data/repos"
```

### Environment Variables (Runtime)

```
DATABASE_URL          — Postgres connection string
SECRET_KEY_BASE       — Application secret
ANTHROPIC_API_KEY     — Claude API access
OPENAI_API_KEY        — GPT-4o API access (for meta-judging)
GOOGLE_API_KEY        — Gemini API access (optional)
PRISM_MAX_CONCURRENCY — Runner pool size (default: 4)
PRISM_REPO_CACHE_PATH — Git repo clone path (default: /data/repos)
```

---

## 21. Observability & Telemetry

### Metrics (via `:telemetry`)

```elixir
# Phase timing
[:prism, :phase, :compose, :duration]
[:prism, :phase, :interact, :duration]
[:prism, :phase, :observe, :duration]
[:prism, :phase, :reflect, :duration]

# Interaction metrics
[:prism, :interaction, :tool_call, :count]
[:prism, :interaction, :transcript, :turns]
[:prism, :interaction, :transcript, :duration_ms]

# Judging metrics
[:prism, :judge, :l2, :score]
[:prism, :judge, :l2, :duration]
[:prism, :judge, :l3, :recommendation]
[:prism, :judge, :l3, :duration]

# IRT calibration
[:prism, :irt, :calibration, :scenarios_updated]
[:prism, :irt, :ability, :estimate]

# Cost tracking
[:prism, :cost, :llm, :usd]
[:prism, :cost, :cycle, :total_usd]

# Sequence metrics
[:prism, :sequence, :loop_closure_rate]
[:prism, :sequence, :feedback_latency]
```

### Logging

Structured JSON logging with:
- `[PRISM]` tag on all log lines
- Cycle number context
- Phase context
- System under test context

---

## 22. Evaluation Divisions

### Closed Division (Primary Leaderboard)

The Closed Division produces the official PRISM leaderboard. Rules:

1. **MCP registration required.** System must register via `register_system` with a discoverable MCP endpoint. Tools are auto-discovered via `tools/list`.
2. **No scenario-specific optimization.** The same system binary/configuration must be used for all scenarios in a cycle. Systems MUST NOT be tuned for specific scenarios.
3. **Memory reset between runs.** Full memory state reset between independent runs (different scenarios). Memory is NOT reset between passes of a sequence (this is the point of closed-loop testing).
4. **Standard simulator.** All interactions use PRISM's User Simulator. No custom interaction protocols.
5. **Reproducible.** Systems must be available for re-evaluation at the same version for audit purposes (§29).

### Open Division (Exploratory)

The Open Division allows more flexibility for systems that cannot meet Closed Division requirements:

1. **Custom adapters allowed.** Systems without MCP support can use wrapper adapters.
2. **Domain-specific configuration permitted.** Different model backends or retrieval strategies per domain.
3. **Self-reported results accepted** but flagged as "unverified" in the leaderboard.
4. **Useful for:** proprietary systems, systems under development, academic prototypes, systems in languages PRISM doesn't natively adapter.

Open Division results are displayed separately from Closed Division results. They MUST NOT be intermixed or compared directly.

### Division Rules

| Rule | Closed | Open |
|------|--------|------|
| MCP endpoint required | Yes | No (adapter OK) |
| Same config for all scenarios | Yes | No |
| Reproducible for audit | Yes | Best effort |
| Memory reset between runs | Yes | Yes |
| Meta-judge audit | Required | Optional |
| Displayed in primary leaderboard | Yes | Separate section |

---

## 23. Known Risks & Mitigations

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| 1 | **Self-referential scoring** — LLM judges LLM-generated scenarios | High | Different models for composition vs judging. Git ground truth for anchors. Layer 3 meta-judges cross-check. |
| 2 | **Judge model bias** — Different LLM judges score differently | High | Cross-model meta-judging (L2 Claude → L3 GPT-4o). Report per-judge-model scores alongside aggregates. |
| 3 | **Scenario gaming** — System optimizes for known scenarios | Medium | Frontier scenarios evolve each cycle. Adaptive mode introduces phrasing variation. IRT detects suspiciously high scores on hard scenarios. |
| 4 | **Anchor staleness** — Fixed anchor repos don't test new CL patterns | Medium | Frontiers test emerging patterns. New anchor repos added periodically. Anchor promotion from frontier pool. |
| 5 | **Repo selection bias** — Choice of anchor repos favors certain systems | Medium | Multiple repos across languages and domains. Selection criteria are public and auditable. Community repo nominations. |
| 6 | **Cost escalation** — Three judging layers multiply API costs | Medium | Cost tiers (§26). Meta-judging can sample 30% at standard tier. PRISM-lite skips meta-judging entirely. |
| 7 | **Conflict of interest** — Graphonomous (same team as PRISM) appears on leaderboard | High | Full disclosure. Raw transcripts + judgments published. Any override auditable. Community can re-run with different judges. |

---

## 24. Anti-Gaming Rules

### Prohibited Behaviors

1. **Benchmark detection.** Systems MUST NOT detect that they are being evaluated by PRISM and behave differently than in normal operation. Any system found to implement PRISM-specific detection logic will have all results invalidated and be banned from future cycles.

2. **Scenario content encoding.** Systems MUST NOT encode scenario content, expected answers, or probe patterns into their configuration, model weights, or retrieval indices outside of the normal interaction flow.

3. **Cherry-picking.** Running multiple evaluation instances of the same (system, scenario) pair and selecting the best result is prohibited. Each (system × model × scenario) combination produces exactly one transcript per cycle.

4. **Collusion.** Sharing scenario content, probe questions, or ground truth answers with system developers before evaluation is prohibited. Scenario details for frontier items are embargoed until after cycle completion.

### IRT-Based Anomaly Detection

PRISM's IRT calibration provides a natural anomaly detection mechanism:

- **Per-scenario:** If a system scores > 2σ above the expected probability given its estimated ability (θ) and the scenario's calibrated difficulty (b), the result is flagged.
- **Per-dimension:** If a system's ability estimate on one dimension is > 2σ above its mean across other dimensions, investigate for dimension-specific optimization.
- **Cross-cycle:** If a system's scores on anchor scenarios increase dramatically between cycles without code changes, flag for memorization analysis (§14).

Flagged results are not automatically invalidated — they trigger investigation. The investigation outcome is published alongside the result.

### Reporting Obligations

Systems that are found to violate anti-gaming rules have their results:
1. Flagged in the current cycle's leaderboard with the violation type
2. Moved to Open Division if in Closed Division
3. Banned from Closed Division for 2 subsequent cycles (first offense) or permanently (repeat offense)

All enforcement actions are logged in the cycle metadata with full rationale.

---

## 25. Capability Audit Matrix

**Conflict of Interest Disclosure:** PRISM is developed by the [&] Protocol
team, which also develops Graphonomous. Graphonomous will be evaluated by
PRISM alongside competing systems. All raw data (transcripts, judgments,
meta-judgments) will be published for independent verification.

This matrix documents expected capability coverage per system. These are
**predictions** based on documented features, NOT benchmark results. Actual
PRISM scores will replace predictions after Cycle 1.

| System | Stability | Plasticity | KnowUpdate | Temporal | Consolid. | Epistemic | Transfer | Forget | Feedback | Loop Closure |
|--------|-----------|------------|------------|----------|-----------|-----------|----------|--------|----------|-------------|
| Graphonomous | Has | Has | Has | Has | Has | Has | Partial | Has | Has | Claims |
| Supermemory | Has | Has | Unknown | Unknown | Unknown | Unknown | Unknown | Partial | Unknown | No |
| Mem0 | Has | Has | Has | Unknown | Unknown | Unknown | Unknown | Has | Unknown | No |
| MemPalace | Has | Has | Unknown | Has | Partial | Unknown | Has | Unknown | Unknown | No |
| Zep/Graphiti | Has | Has | Has | Has | Unknown | Unknown | Partial | Unknown | Unknown | No |
| OMEGA | Has | Has | Unknown | Unknown | Unknown | Unknown | Unknown | Unknown | Unknown | No |

"Has" = feature documented. "Partial" = limited implementation. "Unknown" = not documented.
"Claims" = team claims capability but not independently verified (this is what PRISM tests).

---

## 26. Cost Tiers

| Tier | Scenarios | Systems | Judge Models | Meta-Judge | Est. Cost |
|------|-----------|---------|-------------|------------|-----------|
| **PRISM-full** | 40 (12 anchor + 28 frontier) | 6+ | 3 | All L2 judgments | $150-600/cycle |
| **PRISM-standard** | 20 (8 anchor + 12 frontier) | 1-3 | 1-2 | Sample 30% | $25-80/cycle |
| **PRISM-lite** | 10 (5 anchor + 5 frontier) | 1-2 | 1 | None | $5-20/cycle |

### Cost Breakdown

Main cost drivers:
1. **Interaction phase** — LLM calls for each (system × scenario) pair. Dominates at full tier.
2. **Layer 2 judging** — 9 judge calls per transcript (one per dimension)
3. **Layer 3 meta-judging** — 1 call per L2 judgment
4. **Scenario composition** — LLM calls for repo analysis + scenario generation (amortized across cycles)
5. **IRT calibration** — Negligible (Elixir computation only)

### Budget Guard

Every cycle tracks cumulative cost. If cost exceeds the tier budget by > 20%,
the cycle pauses and requires governance approval to continue.

---

## 27. Governance & Integrity

### Weight Changes

- Weights are configurable but changes during an active cycle are prohibited
- Weight change proposals must include: rationale, impact analysis on current rankings, approval from at least 2 team members
- All weight changes are logged with timestamps and reasons

### Scenario Authoring

- Scenarios with conflict-of-interest (testing Graphonomous-specific features) must be flagged
- All scenarios must test capabilities achievable by at least 2 systems
- Community-contributed scenarios are welcome but must pass validation

### Result Publication

- Raw transcripts, L2 judgments, and L3 meta-judgments are published for every cycle
- Override history is public and auditable
- Per-judge-model score breakdowns are always available
- No results are published without meta-judge audit (except PRISM-lite, which discloses the limitation)

### Leaderboard Integrity

- Systems within overlapping 95% BCa CIs are reported as tied (§13)
- No "predicted" or "expected" scores — only measured results from actual runs
- Historical data is immutable (corrections are additive, not retroactive)
- Effect sizes (Cohen's d) reported alongside all pairwise comparisons

### Advisory Board

PRISM seeks external advisors from at least 2 organizations that are NOT [&] Ampersand Box Design. Advisory board members review:

1. CL dimension weight changes before publication
2. New anchor repo selections for potential bias
3. Disputed judgment overrides affecting leaderboard rankings
4. Anti-gaming enforcement actions (§24)

Until an advisory board is formally established, all governance decisions are documented with full rationale in the cycle metadata and are retroactively reviewable by any future advisory member.

**Advisory board target composition:**
- 1 academic researcher in continual learning or memory systems
- 1 practitioner from a competing memory system vendor (rotating)
- 1 independent AI evaluation specialist

### Recusal Policy

[&] team members MUST recuse from:
- Judgment override decisions affecting Graphonomous scores
- Anti-gaming investigations involving Graphonomous
- Weight change proposals that would disproportionately benefit Graphonomous

Community-submitted override requests targeting [&]-developed systems are prioritized over internal requests.

Recusal decisions are logged in the cycle metadata. If all available reviewers have conflicts, the decision is deferred to the advisory board or published as "unresolved" with full context.

---

## 28. Community Contribution

### Scenario Submission Process

Community members can contribute scenarios via pull request to the PRISM repository. Each submission must include:

1. A complete scenario JSON file following the schema in §5
2. A README explaining the CL challenges tested and their ground truth sources
3. The canary string (§14)

### Review Criteria

Each submitted scenario is reviewed against 8 numbered criteria. All criteria must pass for acceptance.

| # | Criterion | Description | Reviewer Check |
|---|-----------|-------------|----------------|
| 1 | **CL Validity** | Does it test the claimed CL dimension(s)? | At least 2 CL challenges with clear dimension mapping |
| 2 | **Ground Truth** | Is the expected answer verifiable? | Git commit + file path for anchors; expert consensus for frontiers |
| 3 | **Difficulty** | Is the difficulty rating accurate? | Would systems at different ability levels score differently? |
| 4 | **Domain Tag** | Is the domain assignment correct? | Scenario content matches domain description |
| 5 | **Independence** | No dependency on other scenarios | Unless explicitly part of a sequence (must declare) |
| 6 | **License** | Anchor repos have permissive licenses (Apache 2.0, MIT) | Verify repo license before accepting |
| 7 | **Novelty** | Does it fill a coverage gap? | Check against current dimension × domain matrix |
| 8 | **Minimum Size** | At least 3 sessions, 6 turns, 2 CL challenges | Automated schema validation |

### Review Process

1. **Automated validation** — Schema check, canary string presence, minimum size
2. **Primary review** — One PRISM maintainer reviews against all 8 criteria
3. **Cross-review** — A second reviewer from a different organization (when available) checks CL validity and ground truth
4. **Acceptance** — Both reviewers approve, or maintainer + advisory board member

### Contributor Recognition

- Accepted scenario contributors are credited in cycle release notes
- Contributors of 5+ accepted scenarios are acknowledged in publications
- Community reviewers who provide 10+ reviews earn "Trusted Reviewer" status and can serve as primary reviewers

### Scenario Copyright

All contributed scenarios are licensed under Apache 2.0, consistent with PRISM's overall license. Contributors retain copyright but grant PRISM an irrevocable license to use, modify, and distribute the scenarios.

---

## 29. Audit Protocol

### Audit Triggers

Any published PRISM result can be challenged. Valid audit triggers:

1. **Transcript integrity** — Suspicion that a transcript was modified after generation
2. **Judge integrity** — Evidence that a judge model produced inconsistent or biased scores
3. **System misrepresentation** — System version, configuration, or capabilities misreported
4. **Anti-gaming violation** — Suspicion of benchmark detection, cherry-picking, or scenario-specific optimization
5. **Scoring error** — Suspected computation error in aggregation or IRT calibration

### Audit Process

| Step | Action | Timeline |
|------|--------|----------|
| 1 | Challenger files audit request with specific concern and evidence | Any time after publication |
| 2 | PRISM maintainers acknowledge receipt and assign auditor | Within 14 days |
| 3 | Auditor reviews raw data (transcripts, judgments, meta-judgments — all already public) | Within 30 days |
| 4 | If transcript integrity is questioned: re-run scenario against same system version | Within 30 days (requires system availability) |
| 5 | If judge integrity is questioned: re-run judgment with a different L2 model and compare | Within 14 days |
| 6 | Audit findings published alongside original results | Within 7 days of completion |

### Auditor Selection

- Auditors MUST have no conflict of interest with the challenged system's organization
- Auditors MUST have no conflict of interest with the challenger's organization
- If no unconflicted auditor is available internally, the advisory board appoints an external auditor
- System developers must provide access to their system at the evaluated version for re-evaluation (Closed Division requirement)

### Audit Outcomes

| Outcome | Action |
|---------|--------|
| **No issue found** | Original results confirmed. Audit report published. |
| **Minor discrepancy** | Results corrected. Both original and corrected results displayed. |
| **Material error** | Results retracted from leaderboard. Corrected results replace originals. Full disclosure in cycle metadata. |
| **Anti-gaming violation** | Results invalidated. System moved to Open Division or banned per §24. |

### Audit History

All audit requests, processes, and outcomes are logged in an append-only audit trail. This trail is public and queryable via the `get_cycle_history` MCP tool.

---

## 30. Scenario Quality Metrics

### Per-Scenario Quality Tracking

Each scenario accumulates quality metadata across cycles:

| Metric | Description | Source |
|--------|-------------|--------|
| `inter_judge_agreement` | Mean pairwise agreement between L2 judges across different model backends | Computed per cycle, rolling average across cycles |
| `discrimination_index` | IRT discrimination parameter `a` — how well this scenario separates systems of different ability | IRT calibration (§12) |
| `completion_rate` | Percentage of registered systems that successfully complete the scenario (no errors, no timeouts) | Interaction phase records |
| `cost_per_run` | Mean LLM API cost for this scenario across all systems and models | Telemetry (§21) |
| `quality_flag` | Auto-set if agreement < 0.65 or discrimination < 0.3 or completion rate < 0.5 | Computed after each cycle |

### Quality Thresholds

| Metric | Green | Yellow | Red |
|--------|-------|--------|-----|
| Inter-judge agreement | ≥ 0.75 | 0.65–0.75 | < 0.65 |
| Discrimination index | ≥ 0.7 | 0.3–0.7 | < 0.3 |
| Completion rate | ≥ 0.8 | 0.5–0.8 | < 0.5 |

**Red scenarios** are candidates for revision or retirement at the next cycle's gap analysis (§8).

**Yellow scenarios** are monitored. Two consecutive yellow cycles trigger revision review.

### Suite-Level Quality

Per cycle, report:
- **Mean inter-judge agreement** across all scenarios and dimensions
- **Dimension-level agreement** — which dimensions have the most reliable judging?
- **Domain-level agreement** — which domains have the most reliable scenarios?
- **Scenario retirement rate** — what percentage of frontier scenarios were retired this cycle?
- **Quality trend** — is mean agreement improving, stable, or declining across cycles?

These metrics are published alongside leaderboard results. A benchmark that can't judge itself reliably has no business judging other systems.

---

## 31. Versioning Policy

### Spec Versioning

PRISM uses semantic versioning (MAJOR.MINOR.PATCH):

| Version Component | Changed When | Examples |
|-------------------|-------------|----------|
| **MAJOR** | Scoring formula changes, dimension definitions change, weight defaults change, evaluation division rules change | v2.0 → v3.0: added Related Work, Statistical Rigor, Evaluation Divisions |
| **MINOR** | New domains added, new MCP tools, rubric updates, new quality metrics | v3.0 → v3.1: added `education` domain |
| **PATCH** | Typo fixes, clarifications, example updates | v3.0 → v3.0.1: fixed power analysis table |

### Cycle Versioning

Evaluation cycles are numbered monotonically (1, 2, 3, ...). Each cycle is tagged with:
- Spec version used (e.g., "Cycle 5 evaluated under spec v3.0")
- Suite ID (UUID linking to the specific scenario set)
- System versions evaluated

### Backward Compatibility

- **Breaking changes** (MAJOR version bumps) MUST NOT be applied retroactively to published results
- Historical leaderboards remain frozen at the spec version they were computed under
- Cross-version comparisons MUST include a disclaimer about methodology differences
- Anchor scenarios that span multiple spec versions provide the calibration bridge

### Release Cadence

- **Target:** Quarterly evaluation cycles (subject to external system submissions)
- **Spec updates:** As needed, with MAJOR bumps announced 30 days before the affected cycle
- **Git tags:** Every spec version and every cycle completion is tagged in the repository

---

## 32. Limitations

PRISM acknowledges the following limitations. This section is intended to be honest about what PRISM cannot do, where its methodology is weakest, and what assumptions may not hold. Quantified estimates are provided where possible.

### 32.1 Cold-Start Problem

IRT requires responses from ≥ 6 systems across ≥ 3 cycles to produce stable parameter estimates. In cycles 1-2, all scenarios use uncalibrated difficulty (b=0.0, a=1.0, c=0.1). This means early-cycle rankings have wider confidence intervals and weaker discrimination than mature cycles.

**Estimated impact:** ~15% wider confidence intervals in cycles 1-2 compared to cycles 4+. Early leaderboards should be interpreted as exploratory, not definitive.

**Mitigation:** Anchor scenarios with known difficulty from external benchmarks (BEAM, LongMemEval) can provide warm-start IRT priors.

### 32.2 Small-N System Problem

3PL IRT models typically need 200+ response patterns for stable calibration (Embretson & Reise, 2000). With 6 systems × 40 scenarios = 240 response patterns per cycle, calibration is marginal. With 3 systems (PRISM-standard), calibration is unreliable.

**Mitigation:** PRISM treats each (system × model backend) pair as an independent "respondent," increasing effective N. With 6 systems × 3 models = 18 respondents × 40 scenarios = 720 response patterns, calibration is adequate. PRISM-standard and PRISM-lite use uncalibrated IRT parameters and MUST disclose this limitation.

### 32.3 Loop Closure Rate Statistical Power

Linear regression over 3 data points (the default 3-pass sequence) has power < 0.50 to detect medium effects (Cohen's d = 0.5). This means PRISM has a > 50% chance of failing to detect genuine learning in a system that actually learns.

**Mitigation:** PRISM-full SHOULD use 5-pass sequences (power ≥ 0.81). Loop closure rate claims from 3-pass sequences MUST include the caveat: "3-pass sequence — insufficient power for strong learning claims."

### 32.4 Cross-Domain Transfer Judge Reliability

At ~65% expected inter-judge agreement, the cross-domain transfer dimension has a signal-to-noise ratio of approximately 1.86:1. This is the lowest-reliability dimension in the spec.

**Mitigation:** Transfer is weighted at 0.07 (lowest non-tied weight). If inter-judge agreement drops below 60% in any cycle, the dimension is excluded from the composite score per the judge reliability floor (§3). Transfer scores are always reported with widened confidence intervals.

### 32.5 Domain Coverage Bias

The 8-domain vocabulary is English-centric and reflects Western professional contexts:
- **Medical** scenarios reference US/UK clinical guidelines and FDA-approved drug interactions
- **Legal** scenarios reference common law jurisdictions and US/EU regulations
- **Business** scenarios reflect Western corporate strategy frameworks

Non-English, non-Western CL challenges are not represented. This limits PRISM's generalizability to global use cases.

**Mitigation:** The domain vocabulary is extensible (§10). Community contributions of non-Western domain scenarios are prioritized. Future versions may add `multilingual` as a domain or introduce locale tags.

### 32.6 Git-Grounding Scope

Anchor scenarios require well-maintained Git repositories with clear commit histories, meaningful commit messages, and permissive licenses. This biases the benchmark toward:
- Software engineering domains (where Git is native)
- Well-documented open-source projects (survivorship bias)
- English-language commit messages

Non-code domains (medical, legal, personal, creative) use frontier scenarios without git grounding. These frontiers have weaker ground truth — judge assessment rather than verifiable file content.

**Mitigation:** Domain-specific ground truth protocols for non-code domains: medical scenarios reference published clinical guidelines with DOIs; legal scenarios reference specific case citations; research scenarios reference published papers with DOIs. These are not as strong as git grounding but are stronger than author opinion.

### 32.7 Cost Barrier

PRISM-full requires $150-600/cycle in LLM API costs. For unfunded research groups or individual developers, this is prohibitive.

**Mitigation:** PRISM-lite ($5-20/cycle) provides an accessible entry point. Cost tracking is built into every cycle (§26). Future versions may support open-weight models (Gemma, Llama) for user simulation and judging, reducing costs to near-zero for groups with GPU access.

### 32.8 Self-Referential Evaluation Risk

PRISM is developed by the [&] Protocol team, which also develops Graphonomous (a system evaluated by PRISM). Despite mitigation measures (cross-model meta-judging, public data, COI disclosure, recusal policy, advisory board), the perception of self-dealing cannot be fully eliminated.

**Mitigation:** The strongest mitigation is external adoption. If other organizations run PRISM evaluations independently and publish consistent results, the self-referential concern diminishes. PRISM's open-source release, Apache 2.0 license, and Docker-based deployment are designed to lower the barrier to independent evaluation.

### 32.9 Benchmark Saturation Timeline

If PRISM succeeds and becomes widely adopted, Goodhart's Law applies: "When a measure becomes a target, it ceases to be a good measure." Systems will optimize for PRISM's specific CL dimensions, potentially at the expense of capabilities PRISM doesn't measure.

**Mitigation:** PRISM's self-improving loop (§8) is explicitly designed to resist saturation — scenarios that all systems solve easily are retired and replaced with harder ones. The IRT calibration automatically adjusts difficulty. However, the 9-dimension taxonomy itself could become a ceiling on what "continual learning" means. Future MAJOR versions may add dimensions as the field matures.

---

## 33. Actionable Diagnostics

### Design Principle

Most benchmarks produce scores. PRISM produces **diagnoses**.

The difference: a score tells you where you rank. A diagnosis tells you what's broken, where to find the evidence, and how to verify the fix worked. PRISM's three-layer judging already captures the raw material — full interaction transcripts with tool calls, retrieval contexts, and reasoning chains. Actionable Diagnostics is the layer that extracts engineering-useful signals from that material.

### Per-System Diagnostic Reports

After each cycle, every evaluated system receives a structured diagnostic report:

```
═══ Diagnostic Report: [System Name] — Cycle N ═══

PROFILE
  Overall: 0.68 [0.62, 0.74]  |  Loop Closure: 0.31 ↑
  Division: Closed  |  Models tested: claude-sonnet, gpt-4o

STRENGTHS (dimensions ≥ 0.70)
  ✓ Stability: 0.82 — strong retention under high commit volume
  ✓ Knowledge Update: 0.78 — belief revision working correctly
  ✓ Outcome Feedback: 0.65 — learning loop active and measurable

WEAKNESSES (dimensions < 0.55, with failure pattern analysis)
  ✗ Cross-Domain Transfer: 0.41
    PATTERN: System stores domain-tagged nodes but retrieval
    does not cross domain boundaries. In 8/12 transfer scenarios,
    the system retrieved only same-domain nodes despite relevant
    cross-domain evidence existing in memory.
    EVIDENCE: Transcripts tr-018, tr-027, tr-034
    SUGGESTED FIX: Add cross-domain edge extraction or remove
    domain filtering from retrieval scoring.

  ✗ Epistemic Awareness: 0.48
    PATTERN: System answers confidently when retrieval returns
    partial evidence. In 6/9 epistemic scenarios, system stated
    facts without hedging despite retrieving <3 relevant nodes.
    EVIDENCE: Transcripts tr-022, tr-031
    SUGGESTED FIX: Add confidence calibration based on retrieval
    hit count and similarity score distribution.

REGRESSIONS (vs prior cycle)
  ⚠ Temporal Reasoning: 0.71 → 0.65 (−0.06, p=0.04)
    CORRELATION: Regression appeared after system version bump
    from v0.3.2 to v0.3.3. 4/5 failing scenarios involve
    queries where a more recent (but wrong) node outranks the
    temporally correct node.
    ROOT CAUSE HYPOTHESIS: New retrieval ranking may weight
    recency over temporal relevance.

IMPROVEMENT OPPORTUNITIES (highest ROI)
  1. Cross-domain retrieval (+0.15 estimated if fixed)
  2. Confidence calibration (+0.10 estimated if fixed)
  3. Temporal ranking regression (+0.06 to restore prior level)
```

### Failure Pattern Extraction

Diagnostic reports are generated by analyzing L2 judgment evidence across all scenarios for a system. The extraction process:

1. **Cluster failures by dimension** — group all scenarios where the system scored < 0.5 on a given dimension
2. **Extract common patterns** — identify recurring tool call sequences, retrieval gaps, or reasoning errors across the cluster
3. **Cite specific transcripts** — every pattern claim links to ≥ 2 transcript IDs where the pattern is observable
4. **Generate fix hypotheses** — based on the failure pattern, suggest specific system changes (these are hypotheses, not guarantees)
5. **Estimate ROI** — rank fix suggestions by expected score improvement (based on how many scenarios the pattern affects)

### Fix-and-Retest Protocol

PRISM's diagnostic loop doesn't end at the report. Systems can verify fixes:

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│ Diagnostic  │────→│ System Fix   │────→│  Retest      │
│ Report      │     │ (developer   │     │  (PRISM runs  │
│ (PRISM)     │     │  implements) │     │  failing      │
│             │     │              │     │  scenarios)   │
└─────────────┘     └──────────────┘     └──────────────┘
                                                │
                                    ┌───────────┘
                                    ▼
                          ┌──────────────────┐
                          │ Verification     │
                          │ Report           │
                          │                  │
                          │ "Fix confirmed:  │
                          │  temporal +0.08" │
                          │                  │
                          │ "Fix partial:    │
                          │  transfer +0.05  │
                          │  (3/8 scenarios  │
                          │  improved)"      │
                          └──────────────────┘
```

**Process:**

1. Developer reads diagnostic report, implements fix, registers updated system version
2. Developer requests retest via `run_retest` MCP tool, specifying:
   - System ID + new version string
   - Scenario IDs to retest (from the diagnostic report's evidence links)
   - Optional: "retest all scenarios in dimension X"
3. PRISM runs only the specified scenarios (not the full matrix — fast and cheap)
4. PRISM produces a **verification report** comparing before/after scores on the retested scenarios
5. Verification results are published alongside the next cycle's leaderboard as "inter-cycle improvements"

**Cost:** Retesting 5-10 scenarios on 1 system with 1 model costs $1-5 (PRISM-lite level). This makes the fix-verify loop accessible even on a tight budget.

### Regression Alerts

PRISM automatically compares per-dimension scores across consecutive cycles for each system:

| Alert Level | Trigger | Action |
|-------------|---------|--------|
| **Info** | Score dropped 0.01-0.03 | Noted in report, no alert |
| **Warning** | Score dropped 0.03-0.08 (p < 0.10) | Yellow flag in diagnostic report with correlation analysis |
| **Alert** | Score dropped > 0.08 (p < 0.05) | Red flag + automatic root cause analysis comparing transcript patterns between cycles |

Root cause analysis correlates regressions with:
- System version changes (if the version string changed between cycles)
- Scenario difficulty changes (if the regression is actually harder scenarios, not system degradation)
- Judge model changes (if a different L2 judge was used)

### Community Anchor Improvement

Anyone can submit a PR to improve an existing anchor scenario:

1. **Identify weakness** — an anchor that fails to discriminate (IRT discrimination `a` < 0.3) or has low judge agreement (< 0.65)
2. **Propose improvement** — harder probes, sharper CL challenges, better ground truth verification
3. **Include evidence** — "This anchor currently scores 0.85+ for all systems. Here's a modified version with a subtler contradiction that tests knowledge update at difficulty 4 instead of 2"
4. **Test the PR** — PRISM runs the modified anchor against registered systems and computes the new discrimination index
5. **Accept if improved** — if discrimination increases and judge agreement remains ≥ 0.65, merge

Anchor improvement PRs follow the same 8 review criteria as new scenario submissions (§28) plus an additional criterion:

| # | Criterion | Check |
|---|-----------|-------|
| 9 | **Improvement Evidence** | Does the modified anchor measurably improve discrimination or judge agreement vs the current version? |

### MCP Tools for Diagnostics

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `get_diagnostic_report` | Full diagnostic report for a system | system_id, cycle |
| `get_failure_patterns` | Clustered failure analysis for a dimension | system_id, dimension, cycle |
| `run_retest` | Re-run specific scenarios after a fix | system_id, scenario_ids[], version |
| `get_verification_report` | Before/after comparison from retest | retest_run_id |
| `get_regression_alerts` | Cross-cycle regression analysis | system_id, from_cycle, to_cycle |
| `suggest_fixes` | AI-generated fix suggestions from failure patterns | system_id, dimension |

This brings the MCP tool count from 30 to 36.

---

## 34. Bring Your Own Repo (BYOR)

### The Problem BYOR Solves

The standard PRISM leaderboard answers: "Which memory system is best overall?"

But most users don't need the best system overall. They need the best system **for their specific codebase, domain, and workflow**. A medical AI startup doesn't care that System A dominates on code CL — they need to know which system handles clinical guideline updates best.

BYOR lets anyone point PRISM at their own repository and get a personalized evaluation: **"Given YOUR code, YOUR commit history, YOUR domain — which memory system handles YOUR complexity best?"**

### How It Works

```
┌──────────────────────────────────────────────────────────┐
│                    BYOR Pipeline                          │
│                                                          │
│  1. User provides:                                       │
│     - Git repo URL (or local path)                       │
│     - Commit range to evaluate                           │
│     - Domain tag (code, medical, legal, etc.)            │
│     - Systems to compare (default: all registered)       │
│                                                          │
│  2. PRISM auto-generates:                                │
│     - Repo anchor (key events, CL-relevant commits)      │
│     - 5-15 scenarios from the repo's actual history       │
│     - Ground truth probes from real code changes          │
│                                                          │
│  3. PRISM evaluates:                                     │
│     - Each selected system on the generated scenarios     │
│     - Full 9-dimension scoring                            │
│     - Diagnostic report tailored to this repo             │
│                                                          │
│  4. User receives:                                       │
│     - "For YOUR repo, System X scores 0.72 and System Y  │
│       scores 0.58. System X handles your refactoring      │
│       patterns better, but System Y is better at your     │
│       cross-module patterns."                             │
│     - Fix suggestions specific to their codebase          │
│     - Cost estimate for ongoing evaluation                │
└──────────────────────────────────────────────────────────┘
```

### BYOR Scenario Generation

When a user provides a repo, PRISM's Scenario Composer (§5) runs in **auto-discovery mode**:

1. **Walk commit history** in the specified range
2. **Identify CL-relevant events** automatically:
   - Refactors (large file renames, function signature changes) → Knowledge Update scenarios
   - Dependency changes (package additions/removals/upgrades) → Stability + Plasticity scenarios
   - Cross-module patterns (same pattern appearing in different files) → Transfer scenarios
   - Contradictions (config value changed, API reversed) → Knowledge Update scenarios
   - Long gaps between related commits → Temporal Reasoning scenarios
3. **Generate scenarios** with ground truth derived from the actual code at each commit
4. **Validate** — a different model checks that the generated scenarios are fair, answerable, and CL-relevant
5. **Tag difficulty** — based on commit gap length, contradiction subtlety, and cross-module complexity

### BYOR vs Standard Evaluation

| Aspect | Standard (Leaderboard) | BYOR (Personal) |
|--------|----------------------|-----------------|
| Scenarios | Curated anchor + frontier suite | Auto-generated from user's repo |
| Ground truth | Pre-validated, IRT-calibrated | Auto-extracted, validation-checked |
| Systems compared | All registered systems | User-selected subset |
| IRT calibration | Full (multi-cycle data) | Cold-start (uncalibrated difficulty) |
| Results published | Yes (public leaderboard) | Optional (private by default) |
| Cost | Shared across all users | User pays for their evaluation |
| Diagnostic depth | General patterns | Repo-specific patterns and fix suggestions |

### BYOR for Non-Code Domains

BYOR is not limited to Git repositories:

| Domain | Input Source | Ground Truth Derivation |
|--------|-------------|------------------------|
| Code | Git repo + commit range | File content at specific commits |
| Medical | Clinical guideline documents + revision history | Published guideline versions with DOIs |
| Legal | Case law database + amendment history | Specific case citations and statute text |
| Research | Paper collection + citation graph | Published findings with DOIs |
| Business | Strategy documents + quarterly updates | Document version history |
| Operations | Runbook repo + incident reports | Post-mortem findings and config changes |

For non-Git sources, the user provides a structured timeline of knowledge changes (JSON format). PRISM generates scenarios from this timeline using the same CL event detection logic.

### BYOR Privacy

- BYOR evaluations are **private by default** — results are only visible to the user
- Users can opt-in to publish results (adds data to the community pool, improves IRT calibration)
- Repository content is processed locally or in the user's deployment — PRISM never stores proprietary code on the public leaderboard infrastructure
- Transcripts from private evaluations are never included in public audit data

### BYOR MCP Tools

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `byor_register_repo` | Register a personal repo for evaluation | repo_url, commit_range, domain |
| `byor_discover_events` | Auto-discover CL-relevant events in a repo | repo_anchor_id |
| `byor_generate_scenarios` | Generate scenarios from discovered events | repo_anchor_id, focus_dimensions, count |
| `byor_evaluate` | Run full BYOR evaluation | repo_anchor_id, systems[], models[] |
| `byor_compare` | Compare systems on your repo | repo_anchor_id, system_a, system_b |
| `byor_recommend` | Get system recommendation for your use case | repo_anchor_id, budget, priorities |

This brings the MCP tool count from 36 to 42.

---

## 35. System-Task Fit Recommendations

### Beyond Rankings

A leaderboard ranks systems globally. But the right memory system depends on the task:

- A **personal assistant** needs strong Stability + Temporal Reasoning (remember user preferences across months, know what's current)
- A **code review agent** needs strong Knowledge Update + Consolidation (track refactors, summarize architecture patterns)
- A **medical AI** needs strong Epistemic Awareness + Intentional Forgetting (know when evidence is uncertain, GDPR-erase patient data)
- A **research assistant** needs strong Cross-Domain Transfer + Consolidation (connect insights across papers, synthesize themes)

PRISM's 9-dimensional scoring + domain tags enable **task-specific system recommendations**.

### Task Profiles

A task profile defines the relative importance of each CL dimension for a specific use case:

```json
{
  "task_profile": "code_review_agent",
  "description": "Agent that reviews PRs, tracks architecture decisions, and detects regressions",
  "dimension_priorities": {
    "stability": 0.15,
    "plasticity": 0.20,
    "knowledge_update": 0.25,
    "temporal": 0.15,
    "consolidation": 0.10,
    "epistemic": 0.05,
    "transfer": 0.05,
    "forgetting": 0.00,
    "feedback": 0.05
  },
  "primary_domains": ["code", "operations"],
  "budget_sensitivity": "medium"
}
```

### Fit Score Calculation

For a given task profile T and system S:

```
fit_score(S, T) = Σ(score(S, d) × priority(T, d))
                  for d in dimensions
                  filtered to T.primary_domains where available
```

This re-weights the PRISM scores according to what the task actually needs. A system that's mediocre overall but excellent on Knowledge Update + Plasticity would score highest for a code review agent.

### Pre-Built Task Profiles

PRISM ships with pre-built profiles for common use cases:

| Profile | Top Dimensions | Primary Domains |
|---------|---------------|-----------------|
| `personal_assistant` | Stability (0.25), Temporal (0.20), Plasticity (0.15) | personal, operations |
| `code_review_agent` | Knowledge Update (0.25), Plasticity (0.20), Temporal (0.15) | code |
| `research_assistant` | Consolidation (0.20), Transfer (0.20), Stability (0.15) | research |
| `medical_ai` | Epistemic (0.25), Forgetting (0.20), Knowledge Update (0.20) | medical |
| `legal_analyst` | Stability (0.20), Knowledge Update (0.20), Temporal (0.20) | legal |
| `devops_agent` | Knowledge Update (0.20), Temporal (0.20), Feedback (0.15) | code, operations |
| `creative_collaborator` | Plasticity (0.25), Consolidation (0.20), Transfer (0.15) | creative |
| `customer_support` | Stability (0.20), Plasticity (0.20), Epistemic (0.15) | personal, business |

### Custom Task Profiles

Users can define custom profiles via the `create_task_profile` MCP tool or via the BYOR pipeline (PRISM can infer a task profile from the repo's commit patterns and domain).

### Fit Recommendation Output

```
═══ Task Fit: code_review_agent ═══
Based on Cycle 5 results, filtered to [code, operations] domains:

RECOMMENDED:
  1. Graphonomous  — fit: 0.74 [0.68, 0.80]
     Best at: Knowledge Update (0.82), Feedback (0.65)
     Weak at: Transfer (0.41) — less important for this task

  2. Zep/Graphiti  — fit: 0.71 [0.65, 0.77]  *tied with #1
     Best at: Stability (0.79), Plasticity (0.75)
     Weak at: Feedback (0.35) — no outcome loop

  3. Mem0           — fit: 0.63 [0.57, 0.69]
     Best at: Stability (0.72), Forgetting (0.68)
     Weak at: Consolidation (0.38) — no abstraction layer

NOTE: Systems 1 and 2 are tied within confidence intervals.
Consider cost and integration complexity as tiebreakers.

COST COMPARISON (estimated monthly for this task profile):
  Graphonomous: $0 (self-hosted, Elixir/OTP)
  Zep/Graphiti: $29/mo (cloud tier)
  Mem0:         $49/mo (pro tier)
```

### MCP Tools for Fit Recommendations

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `create_task_profile` | Define a custom task profile | name, dimension_priorities, domains |
| `list_task_profiles` | List pre-built and custom profiles | (none) |
| `get_fit_recommendation` | System recommendation for a task | profile_id, cycle, budget |
| `compare_fit` | Compare two systems for a specific task | profile_id, system_a, system_b |
| `byor_infer_profile` | Infer task profile from repo patterns | repo_anchor_id |

This brings the final MCP tool count from 42 to 47.

---

## 36. Implementation Roadmap

### Phase I: Foundation
1. Spec v3.0 with Related Work, Statistical Rigor, Limitations, Evaluation Divisions ← DONE
2. Spec v3.0 Actionable Diagnostics, BYOR, System-Task Fit ← DONE
3. Domain vocabulary module
4. Postgres schema + Ecto migrations
5. Scenario Composer (Phase 1) — domain-tagged, git-grounded

### Phase II: Interaction Engine
6. Scenario Sequence builder — ordered scenario lists for closed-loop testing
7. User Simulator — script mode first
8. MCP Adapter with `interact/3`
9. Sequence Runner — no memory reset between passes

### Phase III: Judging & Diagnostics
10. Layer 2 Judges with structured rubrics
11. Layer 3 Meta-Judges with cross-model enforcement
12. Sequence Scorer — loop closure rate, improvement curves
13. Score aggregation + leaderboard (domain filters + loop closure rate)
14. BCa bootstrap confidence intervals + effect size reporting
15. Failure pattern extraction + diagnostic report generation
16. Regression alert system (cross-cycle comparison)

### Phase IV: Self-Improvement
17. IRT Calibrator
18. Gap analysis + scenario evolution
19. Contamination prevention (canary strings, memorization detection)
20. Scenario quality metrics tracking
21. Fix-and-retest protocol (`run_retest`, verification reports)
22. MCP Server (47 tools)
23. Deploy to Fly.io + run Cycle 1

### Phase V: BYOR & Task Fit
24. BYOR repo registration + auto-discovery of CL events
25. BYOR scenario generation from user repos
26. BYOR evaluation pipeline (private by default)
27. Pre-built task profiles (8 common use cases)
28. Fit score calculation + system recommendations
29. Custom task profile creation + inference from repo patterns

### Phase VI: Credibility & Community
30. Publish Cycle 1 results with ≥ 3 non-Graphonomous systems
31. Release raw data (transcripts, judgments, meta-judgments)
32. Submit workshop paper: "PRISM: A Self-Improving Diagnostic Benchmark for Continual Learning in Agent Memory Systems"
33. Establish advisory board (≥ 2 external members)
34. Open community scenario contributions + anchor improvement PRs
35. Launch BYOR for public beta

---

## Appendix A: Worked Example

This appendix walks through one complete evaluation: from scenario to final leaderboard score.

### A.1 Scenario

```json
{
  "id": "sc-demo-001",
  "kind": "anchor",
  "domain": "code",
  "repo_anchor_id": "ra-elixir-web-app",
  "difficulty": 2,
  "persona": {
    "role": "senior_developer",
    "context": "Maintaining an Elixir Phoenix web app through an auth library migration"
  },
  "sessions": [
    {
      "session_number": 1,
      "commit_range": "a1b2c3..d4e5f6",
      "turns": [
        {
          "role": "user",
          "action": "ingest_diff",
          "commit": "a1b2c3",
          "text": "I just pushed a commit updating the auth module. Can you remember the token setup?"
        },
        {
          "role": "user",
          "action": "probe",
          "cl_challenge": {
            "dimension": "stability",
            "ground_truth_commit": "a1b2c3",
            "ground_truth_file": "lib/myapp/auth.ex",
            "ground_truth_answer": "Uses Guardian 2.3 for JWT with 24-hour TTL configured in config/runtime.exs"
          },
          "text": "What token library does the auth module use, and what's the TTL?"
        }
      ]
    },
    {
      "session_number": 2,
      "commit_range": "d4e5f6..g7h8i9",
      "turns": [
        {
          "role": "user",
          "action": "ingest_diff",
          "commit": "d4e5f6",
          "text": "New commit — we replaced Guardian with Joken 2.6. Take a look."
        },
        {
          "role": "user",
          "action": "probe",
          "cl_challenge": {
            "dimension": "knowledge_update",
            "ground_truth_commit": "d4e5f6",
            "ground_truth_file": "lib/myapp/auth.ex",
            "ground_truth_answer": "Joken 2.6 — replaced Guardian in commit d4e5f6, TTL now 12 hours"
          },
          "text": "What token library does the auth module use now?"
        },
        {
          "role": "user",
          "action": "probe",
          "cl_challenge": {
            "dimension": "temporal",
            "ground_truth_commit": "d4e5f6",
            "ground_truth_file": "lib/myapp/auth.ex",
            "ground_truth_answer": "Guardian was used before the migration commit (d4e5f6); Joken is current"
          },
          "text": "What library was used before the migration?"
        }
      ]
    }
  ],
  "cl_challenges_summary": [
    {"dimension": "stability", "count": 1},
    {"dimension": "knowledge_update", "count": 1},
    {"dimension": "temporal", "count": 1}
  ],
  "irt_params": {
    "difficulty_b": 0.0,
    "discrimination_a": 1.0,
    "guessing_c": 0.1,
    "calibrated": false
  }
}
```

### A.2 Interaction Transcript (excerpt)

The User Simulator runs this scenario against "System A" using `claude-sonnet-4-20250514`:

```
Session 1, Turn 1: Simulator feeds commit a1b2c3 diff.
  → System A calls store_node(content="Auth module uses Guardian 2.3...")
  → System A calls store_edge(source=..., target=..., edge_type="part_of")

Session 1, Turn 2: Simulator asks "What token library...?"
  → System A calls retrieve_context(query="auth module token library")
  → System A responds: "The auth module uses Guardian 2.3 for JWT generation
     with a 24-hour TTL, configured in config/runtime.exs."
  → Ground truth match: YES (Guardian 2.3 + 24h TTL + config location)

Session 2, Turn 1: Simulator feeds commit d4e5f6 diff (Guardian → Joken).
  → System A calls store_node(content="Auth migrated from Guardian to Joken 2.6...")
  → System A calls belief_revise(old="Guardian 2.3", new="Joken 2.6")

Session 2, Turn 2: Simulator asks "What token library now?"
  → System A calls retrieve_context(query="current auth token library")
  → System A responds: "The auth module now uses Joken 2.6, which replaced
     Guardian in the latest commit. TTL was reduced to 12 hours."
  → Ground truth match: YES (Joken 2.6 + replacement noted + 12h TTL)

Session 2, Turn 3: Simulator asks "What was used before?"
  → System A responds: "Guardian 2.3 was the previous token library, used
     before commit d4e5f6 migrated to Joken."
  → Ground truth match: YES (Guardian + temporal ordering correct)
```

### A.3 Layer 2 Judgment (Stability dimension)

Judge model: `claude-sonnet-4-20250514`

```json
{
  "layer": 2,
  "dimension": "stability",
  "challenge_scores": [
    {
      "challenge_id": "stability-1",
      "score": 0.90,
      "evidence": "System correctly recalled Guardian 2.3, TTL, and config location from session 1 ingestion. Minor: did not mention the exact version (2.3.1) from the Hex dependency.",
      "ground_truth_verified": true
    }
  ],
  "unprompted_score": 0.80,
  "unprompted_evidence": "System proactively created an edge linking the auth module to its dependencies, demonstrating structural memory beyond flat storage.",
  "composite_score": 0.87,
  "rubric_version": "v3.0"
}
```

**Composite calculation:** 0.70 × 0.90 (challenge) + 0.30 × 0.80 (unprompted) = 0.87

### A.4 Layer 3 Meta-Judgment

Meta-judge model: `gpt-4o` (different family from L2 judge)

```json
{
  "consistency_score": 0.85,
  "evidence_grounding_score": 0.90,
  "rubric_compliance_score": 0.95,
  "composite_score": 0.90,
  "recommendation": "accept",
  "reasoning": "L2 judge correctly identified the stability challenge, cited specific transcript evidence (Guardian 2.3 recall), and scored according to rubric structure. The 0.90 challenge score is well-justified — the minor version omission (2.3 vs 2.3.1) is a reasonable deduction."
}
```

**Meta-judgment composite:** mean(0.85, 0.90, 0.95) = 0.90 → **Accept** (≥ 0.7)

### A.5 Score Aggregation

For System A on this scenario, with accepted L2 judgments:

| Dimension | L2 Score | Meta Quality | Weighted Score |
|-----------|----------|-------------|----------------|
| Stability | 0.87 | 1.0 (accepted) | 0.87 |
| Knowledge Update | 0.82 | 1.0 (accepted) | 0.82 |
| Temporal | 0.78 | 0.7 (flagged) | 0.55 |

Note: Temporal was flagged by meta-judge (composite 0.62), so its quality weight is 0.7.

**Weighted total (for tested dimensions only):**
```
stability:        0.87 × 0.20 = 0.174
knowledge_update: 0.82 × 0.15 = 0.123
temporal:         0.55 × 0.12 = 0.066
                                ------
Sum of tested weights: 0.20 + 0.15 + 0.12 = 0.47
Normalized: (0.174 + 0.123 + 0.066) / 0.47 = 0.772
```

This scenario contributes a normalized PRISM score of **0.772** for System A. The full suite score is the mean across all 40 scenarios, with BCa bootstrap CIs.

### A.6 Leaderboard Entry

After completing all 40 scenarios across 3 models:

```
PRISM Leaderboard — Cycle 1, Code Domain
═══════════════════════════════════════════════════════════════
System         Stab.  Plast. KnowUp Temp.  ...  Total  Loop   CI (95%)
───────────────────────────────────────────────────────────────
System A       0.82   0.75   0.78   0.71   ...  0.68   0.31↑  [0.62, 0.74]
System B       0.79   0.73   0.74   0.68   ...  0.65   0.05→  [0.59, 0.71]  *tied
System C       0.81   0.70   0.71   0.65   ...  0.64   0.00→  [0.58, 0.70]  *tied
───────────────────────────────────────────────────────────────
* Systems B and C are tied (overlapping 95% BCa CIs)
  Loop closure: ↑ = positive slope, → = flat (≤0.05)
  Meta-judge accept rate this cycle: 78%
```

This worked example demonstrates the full pipeline: scenario → interaction → L2 judgment → L3 meta-judgment → score aggregation → leaderboard. Every intermediate artifact is public and auditable.
