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
generated. **`invariants.html` USED to be in that list and no longer is** — see the next section.

> **`_rebuild/dist/amp-nav.js` is NOT this repository's file.** Building refreshes it as a side
> effect. Its source is `ampersand-nav/src/amp-nav.js`, fanned out by `sync-nav.sh`, and only the
> nav lane may change it. Run `git checkout -- _rebuild/dist/amp-nav.js` before committing.

## The invariants table build (`invariants.html`, v0.8+)

**`invariants.html` is generated. Do not hand-edit it.** Source is `_invariants/`:

- `_invariants/data/cells.json` — the 46 cells' AUTHORED fields (symbol, prose, protocol,
  authority, source, status, kind). Extracted verbatim at v0.8 from the `const families = [...]`
  literal that used to live inside the page.
- `_invariants/data/axes.json` — the four registers and their rules, the status glosses, the
  evidence tiers. The **kind vocabulary is not here**: it is read from `mosaic/occupancy.json`,
  which owns it.
- `_invariants/data/copy.json` — page copy. Counts are `{{PLACEHOLDER}}`s.
- `_invariants/styles/table.css` — inlined into the artifact at build time.
- `_invariants/build/{build,templates,prove-gate}.mjs`

```
node opensentience.org/_invariants/build/build.mjs           # emit
node opensentience.org/_invariants/build/build.mjs --verify  # check what is served, build nothing
node opensentience.org/_invariants/build/prove-gate.mjs      # prove the refusals
```

**Why it stopped being hand-authored.** The cells were a JS literal inside the page, and
`scripts/check-mosaic.mjs` and `scripts/check-claim-ledger.mjs` both recovered their subject by
string-slicing that literal out of the HTML and calling `eval()` on it — two gates parsing a web
page to find the thing they check. Both now read `cells.json`. Everything countable was typed by
hand beside the data that decides it, and the page shipped one revision's cells and inspector under
an older revision's masthead for two rounds with nothing to notice.

**The reorganization.** Cells are grouped by **register** — `decided` (an evidence anchor exists),
`built` (code exists, nothing settled), `named` (a name and nothing else), `proposed` (the economic
addendum, annexed) — and inside `decided`, by **semantic kind**. The ten protocol groups survive as
sub-labels in the bands that still need them. The old grouping was by which spec folder owned the
cell, which is an org chart: an empty slot in it means nobody wrote that spec, so it predicts
nothing, and the table closed zero cells across nine rounds.

**What the build refuses**, each proven by `prove-gate.mjs` to fire for its own reason — 20 breaks
and 7 soundness probes (SHELL.md r11 + r12):

- **A count typed in prose** where a derived one exists (`R10`). Write `{{CELL_COUNT}} cells`.
- **A page-version marker typed literally** in `table.css` or `templates.mjs` (`R20`) — use
  `{{VERSION}}`. This is the defect that shipped for two rounds.
- **Calling a property test a proof** (`R22`). Only the `machine` tier's `link_text` may say
  "proof"; a bounded randomized search corroborates a universal and cannot discharge it, which is
  what `LED-C9` cost. The link text is generated from the tier, never written per cell.
- **A dead proof link** (`R12`) — R3's "a witness present and dead" on the public surface.
- **A kind token outside `mosaic/occupancy.json`** (`R6`), and an **authored kind with no
  `kind_why`** (`R8`) — an assignment must name the line of the cell's own record it is read off,
  and the page prints how many are authored.
- **A conditional cell with no hypothesis** (`R3`), and the converse (`R4`).
- **An annexed proposal that carries evidence** (`R15`) — the annex's claim is that these have none.
- **A ledger `cell:NN` binding that does not resolve** (`R18`).

`R23-NOT-A-PARTITION` guards the build's own grouping code and **cannot be fired from data** —
`prove-gate.mjs` says so rather than letting it look covered. It exists because that code was wrong:
grouping by `kind.includes(k)` drew every multi-kind cell once per kind and rendered 52 cells over a
table of 46, inflating every count a reader could see while the derived facts stayed correct.

### Witness pages — `/witness/*.html`, and they RUN the witness

Six decided cells have no static proof page; their evidence is a module. Each gets a generated page
at `/witness/<num>-<slug>.html` with a **Run it here** button that executes **the real module in the
browser**, not a port of it.

- **`/witness/src/**` is the staged witness tree** — every runnable witness plus its transitive
  relative-import closure, byte-identical to source, hashed per file into `dist/artifact.json`.
  `build.mjs --verify` re-reads each against **both** its source and the served copy and refuses
  either drift. **This is the check `opensentience.org/box-and-box/` has never had**, and that
  hand-made copy has already served a playground reporting a stale law count while every other
  surface disagreed. Do not add a third unsynced copy.
- **It is not a port.** `kappa_proof.js` is — "the same routine ported to run in your browser" —
  and nothing checks the two agree. These pages import the witness itself. Measured 2026-08-24:
  `node test/laws.mjs` prints *all 109 enforced kernel laws hold*; the page prints
  *109 laws · 109 passing · 0 failing*. Same module, same verdict.
- **Runnability is DERIVED, never assumed.** `runnable` (pure ESM, whole closure touches no `node:`
  builtin and no `fs` call) · `node-only` (`check-mosaic.mjs` reads the tree) · `data` (a `.json`) ·
  `page` (an `.html`). A page lists what it cannot run **with the reason**, and `R28` refuses a
  witness page where nothing can run.
- **Two run shapes, because the witnesses have two.** `side-effect` — `scripts/check-*.mjs` run at
  module scope and `process.exit` last, so shim `process`, capture `console`, `import()`.
  `suite` — `test/{laws,compose-laws}.mjs` guard `typeof window === 'undefined'`, import cleanly and
  deliberately do not self-run; drive their exported `runSet` over `SUITES`, the same call
  `playground.html` makes. The `GAP` laws print as **declared-open**, not failures — they are
  FALSIFIED by design and the build fails if one starts PASSING.
- **Where the page runs something WEAKER than the CLI it says so, beside the button.** The
  federation gate runs `--preflight` (pinned constructions, no exhaustive corroboration); the law
  suites run 200 trials against the CLI's 2,000. A reduced run presented as the full one is the same
  laundering as calling a property test a proof.
- **One build-stamped cache token on every module URL.** A query on the module you import does not
  bust the cache of the modules *it* imports — that is how the playground once read
  `106 laws · 3 failing`.

> **Changing `cells.json` changes research-lane state.** `scripts/check-mosaic.mjs` derives
> `mosaic/derived/occupancy.json` from these cells, and the head receipt binds it. After editing,
> run `node scripts/check-mosaic.mjs --regen`, and treat the receipt digest mismatch as a real
> question about which revision the change belongs to — not as noise to refresh away.

## What the build refuses — and each of these has been seen to refuse

Run `node _rebuild/build/prove-gate.mjs` and it proves both halves in one pass: **27 deliberate
breaks, each of which must fail with the message that break targets** (SHELL.md r12 — a table of
refusals that all refuse for one unrelated reason proves nothing), and **6 soundness probes, which
are correct or unusual-but-legitimate inputs the gate must still PERMIT** (SHELL.md r11 — a check
that refuses everything scores perfectly on a refusal-only harness). It sandboxes into a private
`mkdtemp`; the working tree is never written to. **The shell revision this page meets in full is
recorded in `_rebuild/data/surface.json` as `shell_revision`, with the later items it does and does
not carry spelled out beside it.**

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
  page. **The integers already standing as page text are every one from 0 to 28, plus 46, 55 and
  60** — measured 2026-08-17, not assumed; the run to 28 is the reference list's length. A small
  count will therefore be refused; 11 and 7 both were. It is also why the traces have **no count**:
  a number of walkers would be countable on screen and every plausible value is page text, so a
  trace is a pulse spreading over whatever arcs are present and how many are alive is decided by the
  graph. The geometry is not duplicated: build.mjs extracts the `GRAPH-START … GRAPH-END` region
  from the driver and the template draws from it, so the drawing and the driver cannot disagree, and
  the build re-checks the emitted counts and coordinates and that every selector the script looks up
  exists.
- **The trace layer ships silent and stays drivable.** Every `<path class="idt">` carries its dash
  pattern (written by the build from the arc length the geometry already computed) and
  `opacity="0"`, so with scripting off the layer is invisible and the graph beneath it is whole. The
  build refuses an overlay without either, and refuses **an `opacity` declaration on `.idt` in
  site.css** — a stylesheet rule beats the presentation attribute the driver writes, so that one
  line would make every trace invisible forever with nothing reporting it.
- **The animation may not be built out of long horizontal lines.** It used to be a 29-rung ladder,
  which on paper stock rendered as ruled notebook paper; its rails were reported as stray `<hr>`s on
  a page that has never had one. The build refuses an arc that runs within 8° of horizontal for more
  than **60** px, refuses a `<line>` anywhere in the animation, and refuses an `<hr>` anywhere on the
  page. The bound came down from 72 because the arc chooser now refuses such a pair outright above
  50 px and the graph contains **no arc within 8° of horizontal at any length**.
- **A retracted string may not hide in any file the build publishes.** Found by
  `_rebuild/build/prove-gate.mjs`: `117 laws` was planted in a comment in `build/idanim.js` and the
  build passed, because the blocklist read `index.html` and the scripts here are separate published
  files rather than inlined ones — three of the four published files were exempt. It now reads
  `site.css`, `proof.js` and `idanim.js` too. `amp-nav.js` is deliberately excluded: another
  repository's file, and this repository's retractions do not govern it.
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
