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

The research output is the six numbered protocols (OS-001 through OS-006).
The runtime output is the Elixir package implementing OS-006.

---

## The Six Cognitive Protocols

| Protocol | Name | Cognitive Basis | Implemented By |
|----------|------|-----------------|----------------|
| OS-001 | Continual Learning | Hippocampal consolidation | Graphonomous |
| OS-002 | Topological Routing (kappa) | Prefrontal gating | Graphonomous routing layer |
| OS-003 | Deliberation Orchestrator | Dual-process theory | AgenTroMatic |
| OS-004 | Attention Engine | Endogenous attention | Graphonomous attention module |
| OS-005 | Model Tier Adaptation | Resource rationality | Graphonomous / Agentelic |
| OS-006 | Agent Governance Shim | Executive function | `open_sentience` hex package |

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
```

```{toctree}
:maxdepth: 1
:caption: Root Docs

[&] Protocol Docs <https://docs.ampersandboxdesign.com>
Graphonomous Docs <https://docs.graphonomous.com>
BendScript Docs <https://docs.bendscript.com>
WebHost.Systems Docs <https://docs.webhost.systems>
```

```{toctree}
:maxdepth: 2
:caption: OpenSentience Docs

architecture
quickstart
faq
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
2. **skills/01_PROTOCOLS_OVERVIEW** — the six protocols and their cognitive grounding
3. **architecture** — how the governance shim is built
4. **quickstart** — install the hex package and run your first governed agent
5. **skills/02_AGENT_LIFECYCLE** — understand the state machine
6. **skills/03_PERMISSIONS** — learn the permission model
7. **skills/04_AUTONOMY_LEVELS** — graduated autonomy
8. **skills/05_AUDIT_TRAILS** — compliance and forensics
9. **skills/06_INTEGRATION** — connecting to the [&] ecosystem
10. **skills/07_COGNITIVE_SCIENCE** — research foundations
11. **faq** — fill in remaining questions

---

## Relationship to the [&] Ecosystem

OpenSentience occupies the **governance and research layer** of the [&] stack:

```
  [&] Protocol        — capability composition (what an agent CAN do)
  OpenSentience       — governance (what an agent MAY do, and how we know)
  Graphonomous        — memory + learning (OS-001, OS-002, OS-004, OS-005)
  AgenTroMatic        — deliberation (OS-003)
  Delegatic           — policy authoring (feeds into OS-006 enforcement)
  Agentelic           — agent manifests (consumed by OS-006 install)
  FleetPrompt         — marketplace (agents enter governance on install)
```

The governance shim wraps any OTP `child_spec`. It does not replace the
supervised process — it interposes permission checks, lifecycle management,
autonomy control, and audit logging around it.

---

## Founding Thesis

OpenSentience exists because intelligence without governance is generation
without accumulation. The six protocols formalize what structured accumulation
requires: memory that consolidates, routing that detects cycles, deliberation
that resolves conflict, attention that prioritizes, resources that adapt, and
governance that enforces boundaries.

The shim is deliberately thin. Governance should cost less than 1% of the
system it governs.
