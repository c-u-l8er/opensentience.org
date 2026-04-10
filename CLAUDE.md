# OpenSentience — Research Protocols for Machine Cognition

Research arm of [&] Ampersand Box Design. Publishes theoretical foundations, empirical protocols, and open questions that guide the [&] product ecosystem.

## Source-of-truth spec

- `docs/spec/README.md` — OpenSentience research protocols specification

## Published protocols

| Protocol | ID | [&] Primitive | Status |
|---|---|---|---|
| Continual Learning | OS-001 | `&memory.graph` | v0.3.3 shipped (Graphonomous) |
| Topological Routing (κ) | OS-002 | `&reason.deliberate` | spec complete |
| Deliberation Orchestrator | OS-003 | `&reason.deliberate` | spec complete |
| Attention Engine | OS-004 | meta-reasoning | spec complete |
| Model Tier Adaptation | OS-005 | system | spec complete |
| Agent Governance Shim | OS-006 | governance | in development |
| Adversarial Robustness | OS-007 | `&govern.identity` | draft |
| Agent Harness | OS-008 | `&govern.harness` | draft |
| **PRISM** (Rating Iterative System Memory) | **OS-009** | `&memory + &reason` | v3.0 in development (`/PRISM/` codebase, subdomain `prism.opensentience.org`) |
| **PULSE** (Uniform Loop State Exchange) | **OS-010** | `&memory + &govern + &time` | v0.1 draft (`/PULSE/` directory, subdomain `pulse.opensentience.org`) |

OS-009 (PRISM) and OS-010 (PULSE) are sibling cross-cutting protocols. PRISM is the diagnostic algebra (measures loops over time). PULSE is the temporal algebra (declares how loops cycle). Together they form the diagnostic + temporal layers above the eight cognitive primitives (OS-001 through OS-008) and the [&] structural composition layer.

## Separate spec documents

- `docs/spec/OS-008-HARNESS.md` — Agent Harness Protocol (pipeline enforcement, quality gates, sprint contracts, context management)
- `docs/spec/OS-009-PRISM-SPECIFICATION.md` — PRISM Protocol for Rating Iterative System Memory (9 CL dimensions, 4-phase evaluation loop, BYOR, IRT calibration)
- `docs/spec/OS-010-PULSE-SPECIFICATION.md` — PULSE Protocol for Uniform Loop State Exchange (loop manifest schema, 5 canonical phase kinds, 5 canonical tokens, 7 invariants, BYOL)
- `docs/spec/OS-E001-EMPIRICAL-EVALUATION.md` — Empirical Evaluation of Topology-Aware Continual Learning (Graphonomous benchmark on [&] portfolio)

## Relationship to other projects

- OpenSentience defines the theoretical protocols; [&] portfolio companies implement them
- Graphonomous implements OS-001 (continual learning) and is the canonical PULSE substrate for `memory`
- AmpersandBoxDesign implements OS-002 through OS-005 as prompts and contracts
- Delegatic implements OS-006 (governance) and is the canonical PULSE substrate for `policy` and `audit`
- OS-008 (Harness) sits above OS-006 — enforces pipeline ordering, quality gates, and governance contracts at runtime
- OS-009 (PRISM) lives in `/home/travis/ProjectAmp2/PRISM/` (Elixir codebase, Fly.io deploy)
- OS-010 (PULSE) lives in `/home/travis/ProjectAmp2/PULSE/` (manifest standard + reference manifests + JSON Schema)
- Every portfolio product declares its own loop topology via a PULSE manifest in `<project>/docs/spec/README.md` under the "PULSE Loop Manifest" section
- This is a static site — no build process
