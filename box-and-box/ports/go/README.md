# box-and-box governance kernel — Go port

An idiomatic Go port of the **box-and-box governance kernel** — the layered algebra
of invariant / deontic / heuristic / temporal / reflexive / epistemic / strategic /
resource arithmetic that underpins the [&] ecosystem's governance reasoning.

This is a genuinely working implementation, not stubs: it ports every module of the
JavaScript reference (`../../*.mjs`) and the full **97-law property-test suite**
(`../../test/laws.mjs`), and passes all 97 laws at 2000 trials/law.

## What it is

Twelve algebraic layers, each a module:

| Go file        | Ports          | Algebra |
|----------------|----------------|---------|
| `value.go`     | `value.mjs`    | Invariant / alethic Value monoid (combine/chain/promote/reconcile/deliberate/consume) — laws **L1–L14** |
| `norm.go`      | `norm.mjs`     | Deontic status lattice (join/adjudicate/resolve/detach/comply/escalate) — laws **D1–D9** |
| `score.go`     | `score.mjs`    | Heuristic/axiological semirings (tropical/probability/log; vote/rollout/reinforce/dominate/anneal/softmax) — laws **H1–H13** |
| `bridge.go`    | `bridge.mjs`   | floor-then-gradient (gatedScore/select) — laws **B1–B3** |
| `govern.go`    | `govern.mjs`   | three-modality decision — laws **DB1–DB3** |
| `temporal.go`  | `temporal.mjs` | LTL formula progression (progress/monitor/evalDirect/monitorLasso/character) — laws **T1–T8** |
| `supervise.go` | `supervise.mjs`| trajectory supervision (supervise/residualOf/guard) — laws **TB1–TB3** |
| `reflexive.go` | `reflexive.mjs`| AGM policy revision (enact/repeal/amend/admissible/arbitrate/revise/entrench/stabilize) — laws **R1–R8, RB1–RB3** |
| `epistemic.go` | `epistemic.mjs`| S5/KD45 modal logic (knows/believes/announce/common/distributed/route) — laws **E1–E8, EB1–EB3** |
| `strategic.go` | `strategic.mjs`| ATL/coalition logic (effectivity/canMaintain/canReach/canUntil/oblige/executable) — laws **S1–S8, SB1–SB3** |
| `resource.go`  | `resource.mjs` | linear-logic ledger (transfer/spend/refill/use/allocate/consolidate/forget/repair) — laws **C1–C8, CB1–CB3** |
| `laws.go`, `laws2.go`, `laws3.go` | `test/laws.mjs` | the 97-law property suite + runner |

## Run

```
cd ports/go
go run .
```

Prints per-suite pass counts and a grand total, then exits **0 iff all 97 laws pass**
(exit 1 otherwise). Tested with Go 1.25; standard library only (`math`, `math/rand`,
`fmt`, `sort`, `os`, `strings`, `strconv`) — no external modules, builds offline.

Each property is checked across **2000 random trials/law**, mirroring the JS harness.
`math/rand` is auto-seeded, so every run exercises fresh randomness.

## Conformance

**JavaScript is the conformance reference; this port passes the same 97 laws.**

The Go semantics mirror the JS exactly: first-non-null merges, free-monoid slice
concatenation, partial phase-graded `chain`, fixpoint loops (ATL μ/ν calculus, policy
stabilization), ledger conservation under double-entry transfer, and LTL progression
with boolean-simplifying constructors (`tAnd`/`tOr`/`tNot` collapse residuals to ⊤/⊥).
The tropical/log semiring zero is `math.Inf(-1)`. Worlds (epistemic) and states
(strategic) use pointer identity to reproduce JS object-identity semantics.
