# box-and-box — Elixir port

An idiomatic Elixir port of the **box-and-box governance kernel** — the seven-rung
arithmetic ladder (invariant, heuristic, deontic, temporal, reflexive, epistemic,
strategic) plus the resource economy and the bridges that compose them.

This is a genuine working implementation, not stubs: it ships the full **97-law
property-test suite** (the same one the JavaScript reference runs) and passes all 97.

> **JavaScript is the conformance reference.** The canonical source lives in
> `../../*.mjs` and `../../test/laws.mjs`. This port mirrors that semantics exactly
> and passes the same 97 laws at 2000 trials/law.

## What's here

| Module | Ports | Laws |
|---|---|---|
| `BoxAndBox.Value` | `value.mjs` — invariant/alethic Value monoid | L1–L14 |
| `BoxAndBox.Score` | `score.mjs` — tropical/probability/log semirings | H1–H13 |
| `BoxAndBox.Bridge` | `bridge.mjs` — floor-then-gradient | B1–B3 |
| `BoxAndBox.Norm` | `norm.mjs` — deontic status lattice | D1–D9 |
| `BoxAndBox.Govern` | `govern.mjs` — three-modality decision | DB1–DB3 |
| `BoxAndBox.Temporal` | `temporal.mjs` — LTL progression | T1–T8 |
| `BoxAndBox.Supervise` | `supervise.mjs` — trajectory supervision | TB1–TB3 |
| `BoxAndBox.Reflexive` | `reflexive.mjs` — AGM policy revision | R1–R8, RB1–RB3 |
| `BoxAndBox.Epistemic` | `epistemic.mjs` — S5/KD45 modal logic | E1–E8, EB1–EB3 |
| `BoxAndBox.Strategic` | `strategic.mjs` — ATL/coalition logic | S1–S8, SB1–SB3 |
| `BoxAndBox.Resource` | `resource.mjs` — linear-logic ledger | C1–C8, CB1–CB3 |
| `BoxAndBox.Laws` | `test/laws.mjs` — the 97-law suite + runner | all 15 suites |

97 laws total across 15 suites.

## Run it

From this directory (`ports/elixir/`):

```sh
mix run run_laws.exs
```

This prints per-suite pass counts and a grand total, and exits `0` iff all 97 laws
pass (non-zero otherwise). Each law runs 2000 random trials, matching the JS
`trial(n, body)` harness. No external Hex dependencies — only what ships with
Elixir/OTP. Tested on Erlang/OTP 28 + Elixir 1.19.

## Notes on the port

- Values, scores, formulas, models, and ledgers are plain immutable maps.
- The tropical/log semiring zero (`0̲`) is the sentinel `:neg_infinity`; it annihilates
  `⊗` exactly as `-Infinity` does in JS. Tropical `max`, `logsumexp`, and the
  `⊗ = +` operator handle the sentinel explicitly.
- `combine` is first-non-null on the temporal/governance families and free-monoid
  list-concat on `authority`/`audit`; `chain` is the partial phase-graded composition
  (returns `%{error: ...}` on a backward step).
- LTL `progress/2` uses the Boolean-simplifying constructors so residuals collapse to
  `⊤`/`⊥`; `monitor` folds progression; `eval_direct` is the independent reference
  semantics used by law T4.
- `canMaintain`/`canReach`/`canUntil` are greatest/least fixpoint loops over the
  controllable predecessor.
- The ledger conserves the grand total under `transfer`; depletable vs. reusable (`!`)
  resources are distinguished by `kind`.
- Epistemic worlds carry a unique `:wid` tag in the test generators so structural
  equality coincides with JS object reference identity (preserving the S5
  reflexive/symmetric/transitive accessibility relations).
