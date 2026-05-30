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
| **PULSE** (Uniform Loop State Exchange) | **OS-010** | `&memory + &govern + &time` | v0.1.1 (`/PULSE/` directory, subdomain `pulse.opensentience.org`) |
| **Embodiment Protocol** | **OS-011** | `&body.*` (new sensorimotor primitive) | v0.1 draft (subdomain `embodiment.opensentience.org`) |
| **SCOPE** (Spatial Claims & Coordination) | **OS-012** | `&space.region + &space.claim` | v0.1 draft (subdomain `scope.opensentience.org`) |

OS-009 (PRISM) and OS-010 (PULSE) are sibling cross-cutting protocols. PRISM is the diagnostic algebra (measures loops over time). PULSE is the temporal algebra (declares how loops cycle). OS-011 (Embodiment) is the sensorimotor behavioral protocol for `&body.*` providers — closes the perception-action gap by defining the typed `perceive/act/affordances/encode_state/replay` loop. Together with the eight cognitive primitives (OS-001 through OS-008) and the [&] structural composition layer, they form the complete protocol stack.

## Separate spec documents

- `docs/spec/OS-008-HARNESS.md` — Agent Harness Protocol (pipeline enforcement, quality gates, sprint contracts, context management)
- `docs/spec/OS-009-PRISM-SPECIFICATION.md` — PRISM Protocol for Rating Iterative System Memory (9 CL dimensions, 4-phase evaluation loop, BYOR, IRT calibration)
- `docs/spec/OS-010-PULSE-SPECIFICATION.md` — PULSE Protocol for Uniform Loop State Exchange (loop manifest schema, 5 canonical phase kinds, 6 canonical tokens as of v0.1.1, 7 invariants, BYOL)
- `docs/spec/OS-011-EMBODIMENT.md` — Embodiment Protocol (typed perceive/act/affordances/encode_state/replay loop for `&body.*`, InteractionTrace schema, SurpriseSignal PULSE token, 5 invariants, 12 conformance tests)
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

## Homepage build (data-driven, anti-drift)

The homepage (`index.html`) is **generated**, not hand-edited. Source lives in `_rebuild/`:

- `_rebuild/data/{site,protocols,rungs,references}.json` — single source of truth. The protocol **count** and **OS-NNN range** in the hero/headings are DERIVED from `protocols.length`, never typed — so "missing OS-011/OS-012" or a wrong count is structurally impossible.
- `_rebuild/build/templates.mjs` — zero-dependency template-literal components.
- `_rebuild/build/build.mjs` — validates data (fails the build on drift: bad id, unknown status, missing field, out-of-order ids) then renders.
- `_rebuild/styles/site.css` + `_rebuild/build/proof.js` — design tokens + the κ proof UI; `kappa_proof.js` and `amp-nav.js` already live at the site root.

To change the homepage: edit the JSON/templates, run `node _rebuild/build/build.mjs`, then copy `dist/index.html` → `index.html`, `dist/styles/site.css` → `styles/site.css`, `dist/proof.js` → `proof.js`. The standalone arithmetic/playground/scope pages at the root are authored separately and are not generated.
