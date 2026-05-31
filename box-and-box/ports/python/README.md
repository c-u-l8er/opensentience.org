# box-and-box governance kernel — Python port

An idiomatic Python 3 port of the **box-and-box governance kernel** (the eight-rung
arithmetic of alethic, deontic, axiological, temporal, reflexive, epistemic,
strategic, and resource logic, plus their bridges). Standard library only — no
external dependencies.

The modules mirror the JavaScript reference (`../../*.mjs`) function-for-function,
preserving the exact algebra: tropical semiring zero = `-inf`, first-non-null
merge for the temporal/governance families, free-monoid concat for audit/authority,
LTL formula progression, AGM policy revision with entrenchment, S5/KD45 modal
accessibility, ATL controllable-predecessor fixpoints, and the linear-logic ledger.

## Modules

| Python | Ports from | What it is |
|---|---|---|
| `value.py` | `value.mjs` | Invariant / alethic arithmetic (Value monoid) — L1–L14 |
| `score.py` | `score.mjs` | Heuristic / axiological semirings (tropical/probability/log) — H1–H13 |
| `bridge.py` | `bridge.mjs` | floor-then-gradient (`gated_score`/`select`) — B1–B3 |
| `norm.py` | `norm.mjs` | Deontic arithmetic (status lattice) — D1–D9 |
| `govern.py` | `govern.mjs` | three-modality decision — DB1–DB3 |
| `temporal.py` | `temporal.mjs` | LTL formula progression / monitoring — T1–T8 |
| `supervise.py` | `supervise.mjs` | trajectory supervision (shield + liveness) — TB1–TB3 |
| `reflexive.py` | `reflexive.mjs` | AGM policy revision — R1–R8, RB1–RB3 |
| `epistemic.py` | `epistemic.mjs` | S5/KD45 modal logic — E1–E8, EB1–EB3 |
| `strategic.py` | `strategic.mjs` | ATL / coalition logic — S1–S8, SB1–SB3 |
| `resource.py` | `resource.mjs` | linear-logic ledger — C1–C8, CB1–CB3 |
| `laws.py` | `test/laws.mjs` | the 97-law property suite (2000 trials/law) + runner |

## Run the conformance suite

```
cd ports/python
python3 laws.py
```

It prints per-suite pass counts, a grand total, the cross-personality checks
(H6 idempotence per semiring, S5-vs-KD45 factivity, coalition power, linear-vs-`!`
resource use), and exits `0` iff all 97 laws pass.

## Conformance

**JavaScript is the conformance reference; this port passes the same 97 laws**
(15 suites: L1–14, H1–13, B1–3, D1–9, DB1–3, T1–8, TB1–3, R1–8, RB1–3, E1–8,
EB1–3, S1–8, SB1–3, C1–8, CB1–3), 2000 randomized trials per law, exactly as
`../../test/laws.mjs`.
