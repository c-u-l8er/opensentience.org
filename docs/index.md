# OpenSentience Documentation

> **"Intelligence is not generation. It is structured accumulation."**

Welcome to the documentation hub for **OpenSentience** — the research arm and
runtime governance layer of the [&] Protocol ecosystem.

---

## What Is OpenSentience?

OpenSentience is **not a product**. It is three things:

1. **A research organization** that publishes cognitive protocols — formal
   specifications grounding AI agent architecture in cognitive science.
2. **A thin governance shim** (`open_sentience` hex package) that enforces
   permission, lifecycle, and autonomy policies on OTP-supervised agents.
3. **The home of two cross-cutting protocols** — OS-009 PRISM (diagnostic
   benchmark) and OS-010 PULSE (loop manifest standard) — that sit above the
   eight cognitive primitives and turn the [&] portfolio into a measurable,
   composable, accountable agent substrate.

The research output is **ten numbered protocols** organized in two layers:
- **Cognitive primitives** (OS-001 through OS-008) — one capability each
- **Cross-cutting protocols** (OS-009 PRISM, OS-010 PULSE) — diagnostic + temporal layers above the primitives

The runtime output includes the Elixir governance package implementing OS-006
(shim) and OS-008 (harness), the **PRISM benchmark engine** (`/PRISM/`,
Elixir/OTP, Fly.io, 6 MCP machines), and the **PULSE manifest standard**
(`/PULSE/`, JSON Schema + reference manifests).

---

## The Ten Protocols

### Cognitive Primitives (OS-001 — OS-008)

| Protocol | Name | Cognitive Basis | Implemented By |
|----------|------|-----------------|----------------|
| OS-001 | Continual Learning | Hippocampal consolidation | Graphonomous |
| OS-002 | Topological Routing (κ) | Prefrontal gating | Graphonomous routing layer |
| OS-003 | Deliberation Orchestrator | Dual-process theory | AgenTroMatic |
| OS-004 | Attention Engine | Endogenous attention | Graphonomous attention module |
| OS-005 | Model Tier Adaptation | Resource rationality | Graphonomous / Agentelic |
| OS-006 | Agent Governance Shim | Executive function | `open_sentience` hex package |
| OS-007 | Adversarial Robustness | Immune system | OpenSentience security module |
| OS-008 | Agent Harness | Supervisory attentional system | OpenSentience harness module |

### Cross-Cutting Protocols (OS-009, OS-010)

| Protocol | Name | Layer | Implemented By |
|----------|------|-------|----------------|
| **OS-009** | **PRISM** — Protocol for Rating Iterative System Memory | **Diagnostic algebra** (measures loops over time) | `/PRISM/` Elixir/OTP, Fly.io, 6 MCP machines, [prism.opensentience.org](https://prism.opensentience.org) |
| **OS-010** | **PULSE** — Protocol for Uniform Loop State Exchange | **Temporal algebra** (declares how loops cycle) | `/PULSE/` manifest standard, JSON Schema, reference manifests, [pulse.opensentience.org](https://pulse.opensentience.org) |

Each cognitive primitive maps a well-established cognitive science finding to a
concrete software architecture. The cross-cutting protocols sit above them:
PRISM measures how well a closed memory loop performs over time; PULSE
declares how any loop in the [&] ecosystem cycles, nests, and signals across
boundaries. Both are independent of one another and independent of [&] — a
system may adopt one without the others.

---

## Documentation Map


```{toctree}
:maxdepth: 1
:caption: Homepages

[&] Ampersand Box <https://ampersandboxdesign.com>
Graphonomous <https://graphonomous.com>
BendScript <https://bendscript.com>
WebHost.Systems <https://webhost.systems>
Agentelic <https://agentelic.com>
AgenTroMatic <https://agentromatic.com>
Delegatic <https://delegatic.com>
Deliberatic <https://deliberatic.com>
FleetPrompt <https://fleetprompt.com>
GeoFleetic <https://geofleetic.com>
OpenSentience <https://opensentience.org>
SpecPrompt <https://specprompt.com>
TickTickClock <https://ticktickclock.com>
```

```{toctree}
:maxdepth: 1
:caption: Root Docs

[&] Protocol Docs <https://docs.ampersandboxdesign.com>
Graphonomous Docs <https://docs.graphonomous.com>
BendScript Docs <https://docs.bendscript.com>
WebHost.Systems Docs <https://docs.webhost.systems>
Agentelic Docs <https://docs.agentelic.com>
AgenTroMatic Docs <https://docs.agentromatic.com>
Delegatic Docs <https://docs.delegatic.com>
Deliberatic Docs <https://docs.deliberatic.com>
FleetPrompt Docs <https://docs.fleetprompt.com>
GeoFleetic Docs <https://docs.geofleetic.com>
OpenSentience Docs <https://docs.opensentience.org>
SpecPrompt Docs <https://docs.specprompt.com>
TickTickClock Docs <https://docs.ticktickclock.com>
```

```{toctree}
:maxdepth: 2
:caption: OpenSentience Docs

architecture
quickstart
positioning
ecosystem-overview
competitive-landscape
harness-engineering
runtime-walkthrough
comparison-table
research
faq
spec/README
spec/OS-008-HARNESS
spec/OS-009-PRISM-SPECIFICATION
spec/OS-010-PULSE-SPECIFICATION
spec/OS-E001-EMPIRICAL-EVALUATION
```

```{toctree}
:maxdepth: 1
:caption: Skills

skills/SKILLS
skills/01_PROTOCOLS_OVERVIEW
skills/02_AGENT_LIFECYCLE
skills/03_PERMISSIONS
skills/04_AUTONOMY_LEVELS
skills/05_AUDIT_TRAILS
skills/06_INTEGRATION
skills/07_COGNITIVE_SCIENCE
skills/08_ANTI_PATTERNS
```

---

## Suggested Reading Order

If you are new to OpenSentience, follow this path:

1. **This page** — understand scope and structure
2. **positioning** — where OpenSentience fits in the agent governance landscape
3. **architecture** — how the governance shim is built (OTP internals)
4. **quickstart** — install the hex package and run your first governed agent
5. **ecosystem-overview** — how all ten protocols connect across the [&] ecosystem
6. **harness-engineering** — the emerging discipline of harness design and OS-008's position
7. **runtime-walkthrough** — follow a concrete agent through governance + harness orchestration
8. **competitive-landscape** — how OpenSentience compares to alternative approaches
9. **comparison-table** — quick-reference feature comparison
10. **research** — cognitive science grounding for each protocol
11. **faq** — fill in remaining questions
12. **skills/** — hands-on implementation skills for the governance shim

For deep protocol specifics:
- **spec/README** — the full technical specification (all ten protocols)
- **spec/OS-008-HARNESS** — the Agent Harness Protocol specification
- **spec/OS-009-PRISM-SPECIFICATION** — PRISM diagnostic benchmark protocol
- **spec/OS-010-PULSE-SPECIFICATION** — PULSE loop manifest standard
- **spec/OS-E001-EMPIRICAL-EVALUATION** — empirical evaluation of topology-aware continual learning

---

## The Three Enforcement Layers

OpenSentience provides three layers of runtime enforcement:

```
OS-008 Harness:   "Has this agent followed the correct process?"
                   Pipeline ordering, quality gates, sprint contracts

OS-006 Shim:      "Is this agent allowed to do this?"
                   Permissions, lifecycle, autonomy levels

OS-007 Security:  "Is this agent under attack?"
                   Threat detection, identity verification, circuit breakers
```

All three log to the same append-only audit trail, creating a unified
compliance record from protocol to permission to pipeline.

---

## The Three-Protocol Stack

Above the cognitive primitives, OpenSentience publishes three sibling protocols
that together turn the [&] portfolio into a measurable, composable, accountable
agent substrate:

```
┌──────────────────────────────────────────────────────────┐
│  PRISM (OS-009) — measures loops over time   diagnostic │
├──────────────────────────────────────────────────────────┤
│  PULSE (OS-010) — declares loops + signals    temporal  │
├──────────────────────────────────────────────────────────┤
│  [&] Protocol     — composes capabilities     structural│
└──────────────────────────────────────────────────────────┘
```

| Layer  | Question                                          | Artifact                           |
|--------|---------------------------------------------------|------------------------------------|
| [&]    | What can each agent do, and how do they compose?  | `*.ampersand.json`                 |
| PULSE  | How do their processes cycle and signal each other? | `*.pulse.json` (loop manifest)   |
| PRISM  | How well do those cycles actually work over time? | Diagnostic reports + leaderboards  |

A loop is **PULSE-conforming** if its manifest validates against
`pulse-loop-manifest.v0.1.json` and its runtime passes the 12-test conformance
suite. A system is **PRISM-evaluable** automatically once it is PULSE-conforming
— PRISM's `compose` phase reads the manifest, injects scenarios at the declared
`retrieve` boundary, and observes outcomes via the declared `learn` phase.
Adoption order is typically [&] → PULSE → PRISM.

---

## Relationship to the [&] Ecosystem

OpenSentience occupies the **governance and research layer** of the [&] stack:

```
  [&] Protocol        — capability composition (what an agent CAN do)
  OpenSentience       — governance + harness (what an agent MAY do, and how)
  Graphonomous        — memory + learning (OS-001, OS-002, OS-004, OS-005)
  AgenTroMatic        — deliberation (OS-003)
  Delegatic           — policy authoring (feeds into OS-006 enforcement)
  Agentelic           — agent manifests (consumed by OS-006 install)
  FleetPrompt         — marketplace (agents enter governance on install)
  SpecPrompt          — acceptance criteria (consumed by OS-008 quality gates)
```

The governance shim wraps any OTP `child_spec`. It does not replace the
supervised process — it interposes permission checks, lifecycle management,
autonomy control, pipeline enforcement, and audit logging around it.

---

## Founding Thesis

OpenSentience exists because intelligence without governance is generation
without accumulation. The ten protocols formalize what structured accumulation
requires: memory that consolidates, routing that detects cycles, deliberation
that resolves conflict, attention that prioritizes, resources that adapt,
governance that enforces boundaries, security that detects threats, a harness
that orchestrates the entire pipeline, **diagnostics that measure whether the
loop actually learns** (PRISM), and a **temporal manifest** that lets every
loop in the ecosystem declare how it cycles and signals (PULSE).

The shim is deliberately thin. Governance should cost less than 1% of the
system it governs. PULSE is a manifest standard with no required runtime.
PRISM runs as a separate benchmark engine that any system can opt into via
its PULSE manifest.
