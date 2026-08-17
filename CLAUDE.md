# OpenSentience — Research Protocols for Machine Cognition

Research arm of [&] Ampersand Box Design. Publishes theoretical foundations, empirical protocols, and open questions that guide the [&] product ecosystem.

## Source-of-truth spec

- `docs/spec/README.md` — OpenSentience research protocols specification

## Published protocols

| Protocol | ID | [&] Primitive | Status |
|---|---|---|---|
| Continual Learning | OS-001 | `&memory.graph` | v0.4.3 shipped (Graphonomous) |
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

- `_rebuild/data/{site,surface,protocols,loop,receipts,rungs,references}.json` — single source of truth. The protocol **count** and **OS-NNN range** in the hero/headings are DERIVED from `protocols.length`, never typed — so "missing OS-011/OS-012" or a wrong count is structurally impossible.
- `_rebuild/build/templates.mjs` — zero-dependency template-literal components.
- `_rebuild/build/build.mjs` — validates the data, then **gates the emitted artifact**, then renders. It fails on drift and on a page that would not be publishable.
- `_rebuild/styles/site.css` + `_rebuild/build/proof.js` — design tokens + the κ proof UI; `_rebuild/build/ladder.js` is the identifying animation. `kappa_proof.js` and `amp-nav.js` already live at the site root.

To change the homepage: edit the JSON/templates, run `node _rebuild/build/build.mjs`, then copy
`dist/index.html` → `index.html`, `dist/styles/site.css` → `styles/site.css`,
`dist/proof.js` → `proof.js`, `dist/ladder.js` → `ladder.js`. The standalone
arithmetic/playground/scope pages at the root are authored separately and are not generated.

> **`_rebuild/dist/amp-nav.js` is NOT this repository's file.** Building refreshes it as a side
> effect. Its source is `ampersand-nav/src/amp-nav.js`, fanned out by `sync-nav.sh`, and only the
> nav lane may change it. Run `git checkout -- _rebuild/dist/amp-nav.js` before committing.

## What the build refuses — and each of these has been seen to refuse

The page-level treatment is `ProjectAmp2/agents/SHELL.md`. The tokens block in
`_rebuild/styles/site.css` between `TOKENS-START` / `TOKENS-END` is this site's own; everything
after `TOKENS-END` is the shared shell.

- **`surface_rung` may not be written down.** The band's rung is **derived** from the protocol
  statuses: unanimous → a rung, mixed → `?`. Today it is `?`, from four distinct statuses across
  twelve protocols, which reproduces what `amp-nav` records (`rung: null`, "mixed across
  OS-001…OS-011") from the data rather than by copying it.
- **The `covers` span is mandatory** and must be long enough to bound something.
- **The verb table (SITES.md §0.7).** A CTA whose verb the rung has not earned is refused.
- **The review ledger** — an `approved` gate with no evidence/reviewer/date is refused.
- **No `mailto:`**, in the record, in a CTA, or anywhere in the artifact.
- **Contrast.** No declared text token may measure below 4.5:1 against its own surface. Three of
  this site's own colours were under the floor and were darkened: `--text-dim` (3.32:1), `--cyan`
  (3.55:1), `--amber` (3.20:1).
- **The identifying animation asserts nothing.** `ladder.js` declares its constants in an
  `IDENTITY-CONSTANTS` block, and the build fails if either number appears as text on the page; it
  also checks the SVG the template draws agrees with the driver, and that the nodes the script
  looks up exist.
- **No `IntersectionObserver`.** Both were removed — the scroll-reveal and the spine scrollspy. IO
  does not fire in a non-compositing renderer, and the reveal made the page's *content* depend on
  JavaScript. Do not reintroduce one; the build refuses it.
- **The law counts stay derived.** `lawCount` is retired; `kernelLaws + composeLaws` is computed in
  the template and the total is typed nowhere. Re-derive by running both suites and move
  `rungs.measured` in the same commit.
