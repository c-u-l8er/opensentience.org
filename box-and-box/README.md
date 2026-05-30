# box-and-box — reference implementation (served mirror)

The complete, MIT-licensed JavaScript reference implementation of **box-and-box**,
the [&] governance kernel: eight modal rungs + one bridge (`feasible ▸ permitted ▸
best`), with **97 property-tested laws**. Pure arithmetic — no LLM, no network, no I/O.

This directory is a **same-origin served mirror** so that `opensentience.org/playground.html`
can import the real `.mjs` modules and so people and agents can read, download, and
port the source directly. **Canonical source / npm package:** `AmpersandBoxDesign/box-and-box/`.
Do not edit here — edit the canonical copy, run the harness, and re-sync (same pattern
as `amp-nav.js`).

## Read it, run it, port it

```bash
npm install -g box-and-box     # the published package
box-and-box laws               # the 97-law conformance harness (2000 trials/law)
box-and-box govern decision.json   # a real verdict: alethic ▸ deontic ▸ axiological → certificate JSON
box-and-box demo govern        # a worked example
```

Or read the source straight from this directory:

| File | What it is |
|---|---|
| `value.mjs` | rung 1 — alethic / feasibility (the `consume` floor, laws L1–L14) |
| `score.mjs`, `bridge.mjs` | rung 3 — axiological ranking + the bridge (H1–H13, B1–B3) |
| `norm.mjs`, `govern.mjs` | rung 2 — deontic permissions + the full verdict (D1–D9, DB1–DB3) |
| `temporal.mjs`, `supervise.mjs` | rung 4 — LTL safety/liveness over trajectories (T1–T8, TB1–TB3) |
| `reflexive.mjs` | rung 8 — self-amending norms, entrenched core (R1–R8, RB1–RB3) |
| `epistemic.mjs` | rung 6 — knowledge (S5) vs belief (E1–E8, EB1–EB3) |
| `strategic.mjs` | rung 7 — coalitional ability, ought-implies-can (S1–S8, SB1–SB3) |
| `resource.mjs` | rung 5 — the closed economy (C1–C8, CB1–CB3) |
| `test/laws.mjs` | the full conformance suite — **the spec is the suite** |
| `bin/govern.mjs` | the verdict CLI (JSON in → certificate out; CI exit codes) |
| `aios/box_and_box_aios.ex` | an Elixir reference *host* (illustrative; see its header) |

**Conformance** is defined by the laws, not by this implementation: pass `test/laws.mjs`
in your own language and your verdicts are identical. The 97 laws are documented at
[ampersandboxdesign.com/laws.html](https://ampersandboxdesign.com/laws.html).

`test/laws.mjs` is dual-mode: under Node it runs the harness and `process.exit`s; in the
browser it exports `SUITES` / `runSet` / `setSemiring` for the playground (the run-block
is guarded by `typeof window === 'undefined'`).
