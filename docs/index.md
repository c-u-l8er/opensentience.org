# OpenSentience Documentation

> **"Intelligence is not generation. It is structured accumulation."**

Welcome to the documentation hub for **OpenSentience** — the research arm and
runtime governance layer of the [&] Protocol ecosystem.

---

## What Is OpenSentience?

OpenSentience is **not a product**. It is two things:

1. **A research organization** that publishes cognitive protocols — formal
   specifications grounding AI agent architecture in cognitive science.
2. **A thin governance shim** (`open_sentience` hex package) that enforces
   permission, lifecycle, and autonomy policies on OTP-supervised agents.

The research output is eight numbered protocols (OS-001 through OS-008).
The runtime output is the Elixir package implementing OS-006 (governance shim)
and OS-008 (agent harness).

---

## The Eight Cognitive Protocols

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

Each protocol maps a well-established cognitive science finding to a concrete
software architecture. The protocols are independent but composable — an agent
can adopt any subset.

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
5. **ecosystem-overview** — how all eight protocols connect across the [&] ecosystem
6. **harness-engineering** — the emerging discipline of harness design and OS-008's position
7. **runtime-walkthrough** — follow a concrete agent through governance + harness orchestration
8. **competitive-landscape** — how OpenSentience compares to alternative approaches
9. **comparison-table** — quick-reference feature comparison
10. **research** — cognitive science grounding for each protocol
11. **faq** — fill in remaining questions
12. **skills/** — hands-on implementation skills for the governance shim

For deep protocol specifics:
- **spec/README** — the full technical specification (OS-001 through OS-007)
- **spec/OS-008-HARNESS** — the Agent Harness Protocol specification

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
without accumulation. The eight protocols formalize what structured accumulation
requires: memory that consolidates, routing that detects cycles, deliberation
that resolves conflict, attention that prioritizes, resources that adapt,
governance that enforces boundaries, security that detects threats, and a
harness that orchestrates the entire pipeline.

The shim is deliberately thin. Governance should cost less than 1% of the
system it governs.
