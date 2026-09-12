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

Run `node _rebuild/build/prove-gate.mjs` and it proves three things in one pass: **112 deliberate
breaks, each of which must fail with the message that break targets** (SHELL.md r12 — a table of
refusals that all refuse for one unrelated reason proves nothing), **30 soundness probes, which
are correct or unusual-but-legitimate inputs the gate must still PERMIT** (SHELL.md r11 — a check
that refuses everything scores perfectly on a refusal-only harness), and **3 boundary crossings**
(below). It sandboxes into a private `mkdtemp`; the working tree is never written to. **Run it with
`TMPDIR` off `/tmp`** — that is a 16 GB tmpfs on this machine and the harness mkdtemps per stage.

### The boundary table — why a single build cannot prove an offer

A SOUND probe proves "this record is accepted". It does not prove "a real launch will transition
correctly", because an offer has two sides and a build only ever stands on one of them. So
`build.mjs --as-of=YYYY-MM-DD` moves the build day **for analysis only** and is a trapdoor that
does not open outwards: **a build on a moved clock refuses to write anything at all**, so it can
never be used to keep an expired offer alive by lying to the clock. The `BOUNDARY` stages install
ONE offer, build it on both sides of its end date, and assert on the **rendered CTA markup** each
time. `--as-of` moves the clock for EVERY day-sensitive check, not just the offer — a mode that
aged one field and froze another would describe a page that could never exist.

`PUB2E` is the rule that came out of it: an `expiry_check` of `{kind, cadence, how}` was three
fields of **prose**, and nothing in this repository rebuilds on a clock, so a record could pass
every check while the offer sat on a deployed static page forever. An offer is now always checked
as a **prospective** record, and may only be **printed** when it names a workflow that exists, that
declares a `schedule:` cron at least as frequent as the claimed cadence, and cites a receipt that
exited 0 with an `exercised_after` date past the offer's end. `kind: "none"` is the honest default
and publishes nothing. An expired offer **transitions** rather than refusing: refusing takes the
SITE off the next deploy while the stale offer stays live in front of every visitor.

**The shell revision this page meets in full is recorded in `_rebuild/data/surface.json` as
`shell_revision`**, with the later items it does and does not carry spelled out beside it.

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
- **The information architecture is gated** (`SEC1`–`SEC4`). OPENSENTIENCE_SURFACE §3 approves
  **seven units — the hero plus six numbered sections** — with the references as an unnumbered
  appendix. The page had TEN and nothing said so. Nothing was cut to reach six: "The Gap" folded
  into the hero, "The Loop" folded into The Stack as its spine, "Protocols" merged with The Stack,
  and every folded block **keeps its id**, so every anchor that ever worked still does — `SEC4`
  refuses a build that drops one. It also added `#kappa`, which two other pages on this site have
  been linking to and this page had never had. **The heading COUNT is deliberately not gated**: the
  brief called this "a 45-heading research-paper structure", but measured per section 26 of the 45
  were in two sections and 15 of those were the twelve protocol cards' own `h3` titles — correct
  markup for a card grid. A gate on the total is satisfied by demoting card titles out of headings,
  which is an accessibility regression dressed as a structural win.
- **The rail and the section are ONE name** (`SEC3`). They were typed separately and disagreed: the
  spine said "Proof" where the page said "The Receipts". `SecLabel(id)` derives both from `SECTIONS`.
- **The three research questions are data, and their status is derived** (`QST1`–`QST3`,
  `_rebuild/data/questions.json`). The five "Open Questions" cards they replaced asserted maturity
  in prose, so a protocol could be re-adjudicated and the question beside it would go on describing
  the old one. `QST2` refuses a status word typed into the prose beside the derived chip; `QST3`
  refuses a question with no `settles_it`, because a question nobody could answer is a slogan.
- **Accessibility is four rules, not four repairs** (`A11Y1`–`A11Y4`). Exactly one `<main>` with an
  id and `tabindex="-1"`; a `.skip-link` that is the FIRST focusable element in `<body>`; one `h1`,
  no level jump **and no empty heading** (a sequence gate alone is satisfied by inserting an empty
  `h3` in front of the skip); every `<svg>` either `aria-hidden="true"` **or** named, never neither
  and never both; and the informational `.loop-ring`'s name **derived from `loop.json`**.
  **A11Y1 also bounds the skip link's stacking against `--amp-nav-z`, which `amp-nav.js`
  publishes** — the link shipped present, focusable, correctly styled and INVISIBLE under 57px of
  that fixed bar, which `getBoundingClientRect` reports as on-screen and only
  `document.elementFromPoint` catches. If the nav lane raises that number, this build goes red.
- **The book's cover is DRAWN FROM THE REGISTRY** (`COV1`–`COV3`). It is not an
  illustration: one mark per chapter, coloured by the rung that chapter's evidence has earned, so
  the first thing the jacket tells a reader is how much of the book is witnessed — today **16 of 32
  chapters have no witness rung at all**, and the cover shows that as 16 empty rings. `COV1` refuses
  a cover whose mark count differs from `derived_counts.chapters`. **`COV3` refuses a jacket that
  implies an artifact the record does not have** — no `download`, `PDF`, `EPUB`, `paperback`, and no
  spine, page edge or tilt in the drawing, because `delivery` is `web` and a jacket promising a file
  is the Download verb drawn instead of written. It skips NEGATIONS: its first version refused this
  very cover, whose caption explains that there *is no file to download*, and a gate that refuses
  the sentence denying a promise teaches the next person to delete the denial.
- **`COV2` measures every string on the jacket against the width it has.** SVG `<text>` does not
  wrap: a string that outgrows the cover is clipped at the edge, the markup stays valid, every gate
  stays green, and it appears only in a screenshot after it ships. That is exactly what the footer
  did. A `<text>` whose class the gate has no font metrics for is refused rather than skipped.
- **A receipt may not claim a comparative with nothing on the other side of it** (`REC1`), and may
  not type a status the protocol record derives (`REC2`). The front page's first receipt read
  *"Graphonomous (OS-001), shipped · graph-backed memory beats flat RAG"*: it typed a derived
  status, and **no flat-RAG baseline has ever been measured** — the only comparison that was run is
  the topology ablation, and it is **+0.3pp**. It also pointed at graphonomous.com, which has since
  retracted that engine's figures by name. A comparative now requires `baseline {what, value}`.
- **A protocol's tags may not restate its status or version** (`PRO1`). All twelve typed their
  status as a tag beside the `status` field, and **OS-010's had already drifted** — the record said
  `v0.1.1` and the tag printed `v0.1`. The chip is derived in the template now.
- **`/styles/site.css` IS NOT THIS PAGE'S PRIVATE STYLESHEET** (`SHARED1`). Other pages in this
  repository load it, and a class added here lands on every one of them. `.book` did exactly that:
  the catalog at `/patterns/` has its own top-level `<div class="book">`, and this page's new 3-D
  rule squeezed it to **205px and rotated it in three dimensions**. This page built green, every
  gate passed, and the damage was on a DIFFERENT page that nothing was looking at. The intersection
  is small enough to name — seven classes are shared on purpose (playground.html deliberately wears
  the shell's band, rung and button) and anything else that collides is refused. The book's own
  classes are namespaced `osbook-*` for the same reason.
- **The book is the hero, above the fold** (`COV2`–`COV4`). Travis 2026-09-12: the identifying
  animation IS the cover art, on a 3-D jacket that stands beside the headline — one root, not two,
  because two copies of the same animation a hand-span apart is one copy too many. The title,
  subtitle and destination are **derived from `publication.json`** (`COV2`), the book is a real
  `<a href>` so it opens with scripting off, on a keyboard and in a new tab (`COV4`), and it must be
  **inside the hero** — a probe that moves it below the fold is refused. Its size is one custom
  property bounded on BOTH axes (`min(27vw, 40vh)`): width alone gave a book that stood 575px tall
  and crossed the fold on a 900px screen, and **the fold is a height**.
- **`COV3` refuses a jacket that promises a file the record has no download for** — and it skips
  NEGATIONS. Its first version refused this very page, whose caption explains there *is no file to
  download*: a gate that refuses the sentence denying a promise teaches the next person to delete
  the denial. It was also once written to refuse a spine, a page edge and a tilt; that over-reached
  and was narrowed — a 3-D render is how every book on every store page is shown, web-only ones
  included. The claim is made in words, and the words are what it reads.
- **Every gate that reaches OUTSIDE `_rebuild/` must be given its subject in the sandbox.** `SHARED1`
  reads sibling pages; until they were staged it found no subject, refused, and **every soundness
  probe in the table went red for one unrelated reason** — including "the tree exactly as it is".
  That is r12's meaningless-table failure recurring in the same harness for the same cause.
- **A gate whose subject moves reads exactly like a gate that passes.** Two did, in one session: the
  `<line>` check matched `<div class="idanim">`, which stopped existing when the hero's graph became
  the book's cover art, so it silently tested `""`; and `COV1`'s refusal was written AFTER the
  `errors.length` exit, so it could never fire. Both were caught only because a probe reported the
  wrong message — which is why the harness matches messages and not exit codes.
- **The chapter banner on `/patterns/`** (`_patterns/build/build.mjs`). Every page of the book now
  carries a band between the nav and the sidebar: the SAME identifying graph, its geometry read out
  of `_rebuild/build/idanim.js`'s own GRAPH region — the one file that owns it — and emitted with
  the same four layers and class names, so `/idanim.js` mounts it like any other root. **The driver
  refuses a root whose counts disagree with its own graph and fails QUIET when it does**, so nothing
  is trimmed to fit. **The band is TILED with `<use>`**: it is about 9:1 and the drawing is 0.7:1,
  so one copy can only ever occupy a fraction of the width — measured at **41%, with 7 of its 31
  nodes inside the band's height** and the rest blank. Padding the viewBox to fix that pads with
  nothing. `<use>` shadow instances mirror the referenced subtree *including the attribute values
  the driver writes at run time*, so four tiles animate together while `querySelectorAll('.idn')`
  still returns exactly 31 — one real element set, four tiles, **96% span and 15 nodes in the
  band**. The y offsets stop the repeat reading as a repeat. The overlay —
  book title and *"Chapter N of M · Family"* — is derived from `ORDER`, never typed. The four
  animation classes are on `SHARED1`'s deliberate-sharing list for exactly this reason; `SHARED1`
  caught the addition on the next build and made the decision be stated, which is what it is for.
  **`ROOT` in that build is ProjectAmp2, not the site dir** — reading the geometry from
  `join(ROOT, …)` silently produced an empty banner, so a missing source now throws.
- **The law counts stay derived.** `lawCount` is retired; `kernelLaws + composeLaws` is computed in
  the template and the total is typed nowhere. Re-derive by running both suites and move
  `rungs.measured` in the same commit.
