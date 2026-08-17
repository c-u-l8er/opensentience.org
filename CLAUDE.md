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

- `_rebuild/data/{site,surface,protocols,loop,receipts,rungs,references,retractions}.json` — single source of truth. The protocol **count** and **OS-NNN range** in the hero/headings are DERIVED from `protocols.length`, never typed — so "missing OS-011/OS-012" or a wrong count is structurally impossible.
- `_rebuild/build/templates.mjs` — zero-dependency template-literal components.
- `_rebuild/build/build.mjs` — validates the data, then **gates the emitted artifact**, then emits, **hashes and publishes** it. It fails on drift and on a page that would not be publishable.
- `_rebuild/styles/site.css` + `_rebuild/build/proof.js` — design tokens + the κ proof UI; `_rebuild/build/idanim.js` is the identifying animation. `kappa_proof.js` and `amp-nav.js` already live at the site root.

To change the homepage: edit the JSON/templates and run `node _rebuild/build/build.mjs`. **There is
no copy step any more, and that is deliberate.** The build stages each file beside its destination,
reads it back off disk, re-hashes it, and only then renames it into place — into `dist/` *and* into
the site root, which is what actually serves. A hand-typed `cp` sat outside every check in that
file, and a copy step a human performs is a copy step a human forgets; the failure mode was a gate
that passed over yesterday's page. `node _rebuild/build/build.mjs --verify` re-checks what is on
disk against `_rebuild/dist/artifact.json` and builds nothing — run it before a deploy. The
standalone arithmetic/playground/scope pages at the root are authored separately and are not
generated.

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
- **No `mailto:`**, in the record, in a CTA, in the form's endpoint, or anywhere in the artifact.
- **Contact is a Formspree form** (`surface.contact`, SHELL.md r9 — ruled by Travis 2026-08-17,
  ending the `[TRAVIS]` blocker fourteen surfaces reported). The endpoint is declared **once** in the
  record and the artifact gate re-reads it off the emitted `action`, so no template can invent its
  own or keep a stale one through a refactor. The build also refuses a missing `_gotcha` honeypot or
  any of its three attributes, a reply paragraph without `role="status" aria-live="polite"`, a form
  without `method="POST"` / `novalidate`, and a handler that never reads `res.ok` — **success is
  printed on an actual 2xx or not at all.** It is a real `<form action>`: with scripting off it
  posts and works, which is the same contract the identifying animation holds. The issues link stays
  as the public second route.
- **Contrast.** No declared text token may measure below 4.5:1 against its own surface. Three of
  this site's own colours were under the floor and were darkened: `--text-dim` (3.32:1), `--cyan`
  (3.55:1), `--amber` (3.20:1).
- **The identifying animation asserts nothing.** `idanim.js` declares its two countable constants
  in an `IDENTITY-CONSTANTS` block, and the build fails if either number appears as text on the
  page. **Every integer from 2 to 28 is already page text** — the reference list is 28 entries — so
  a small count will be refused; 11 and 7 both were. The geometry is not duplicated: build.mjs
  extracts the `GRAPH-START … GRAPH-END` region from the driver and the template draws from it, so
  the drawing and the driver cannot disagree, and the build re-checks the emitted counts and
  coordinates and that every selector the script looks up exists.
- **The animation may not be built out of long horizontal lines.** It used to be a 29-rung ladder,
  which on paper stock rendered as ruled notebook paper; its rails were reported as stray `<hr>`s on
  a page that has never had one. The build refuses an arc that runs within 8° of horizontal for more
  than 72 px, refuses a `<line>` anywhere in the animation, and refuses an `<hr>` anywhere on the
  page.
- **Retractions are COUNTED, not detected** (`data/retractions.json`, SHELL.md r6). Each entry
  carries `min`/`max`: too many occurrences is a reinstatement, too few is a retraction that quietly
  disappeared, and an occurrence in a comment or an attribute — where a reader cannot see it — is
  refused outright. Testing *presence* is what let a sibling page keep its retraction and reinstate
  the retracted sentence elsewhere.
- **The artifact is proved to be this build's** (SHELL.md r6). Bytes are hashed before they are
  written, read back off disk and re-hashed, staged then renamed, and recorded in
  `dist/artifact.json`. Nothing published is a file this run did not produce, and `--verify` answers
  the question afterwards.
- **No `IntersectionObserver`.** Both were removed — the scroll-reveal and the spine scrollspy. IO
  does not fire in a non-compositing renderer, and the reveal made the page's *content* depend on
  JavaScript. Do not reintroduce one; the build refuses it.
- **The law counts stay derived.** `lawCount` is retired; `kernelLaws + composeLaws` is computed in
  the template and the total is typed nowhere. Re-derive by running both suites and move
  `rungs.measured` in the same commit.
