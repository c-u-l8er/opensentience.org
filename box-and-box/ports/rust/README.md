# box-and-box — Rust port

A faithful, idiomatic Rust port of the **box-and-box governance kernel** — the
seven-rung algebra of machine governance (invariant / heuristic / deontic / temporal /
reflexive / epistemic / strategic arithmetic, plus the resource ledger and the bridges
that wire them together).

This is a genuinely working implementation, not stubs: it ports every module and the
full property-test suite, and it passes the same conformance laws as the reference.

> **JavaScript is the conformance reference; this port passes the same 97 laws.**
> The canonical source lives in the parent directory (`value.mjs`, `norm.mjs`, … and
> `test/laws.mjs`). The Rust here mirrors that semantics exactly (first-non-null merge,
> free-monoid `Vec` concat, fixpoint loops, ledger conservation, `f64::NEG_INFINITY` for
> the tropical/log semiring zero, etc.).

## Run it

```
cd ports/rust
cargo run --release
```

It prints a per-suite pass count, a grand total, and **exits 0 iff all 97 laws pass**
(non-zero otherwise). Each law is checked with **2000 random trials**, matching the JS
harness.

## Zero dependencies

The crate uses **only the Rust standard library** — no `rand`, no anything. A tiny
xorshift64\* PRNG (`src/rng.rs`), seeded from the system clock, plays the role of
`Math.random()` in the JS suite. So `cargo run --release` works fully offline.

## The 97 laws (15 suites)

| Suite | Laws | Module |
|---|---|---|
| Invariant            | L1–L14  | `value.rs` |
| Heuristic (tropical) | H1–H13  | `score.rs` |
| Bridge               | B1–B3   | `bridge.rs` |
| Deontic              | D1–D9   | `norm.rs` |
| Deontic bridge       | DB1–DB3 | `govern.rs` |
| Temporal             | T1–T8   | `temporal.rs` |
| Temporal bridge      | TB1–TB3 | `supervise.rs` |
| Reflexive            | R1–R8   | `reflexive.rs` |
| Reflexive bridge     | RB1–RB3 | `reflexive.rs` + `govern.rs` + `supervise.rs` |
| Epistemic            | E1–E8   | `epistemic.rs` |
| Epistemic bridge     | EB1–EB3 | `epistemic.rs` |
| Strategic            | S1–S8   | `strategic.rs` |
| Strategic bridge     | SB1–SB3 | `strategic.rs` |
| Resource             | C1–C8   | `resource.rs` |
| Resource bridge      | CB1–CB3 | `resource.rs` |

Total: **97 laws**.

## Layout

```
ports/rust/
├── Cargo.toml
├── README.md
└── src/
    ├── lib.rs         # crate root (re-exports every module)
    ├── rng.rs         # zero-dependency xorshift64* PRNG
    ├── value.rs       # Invariant arithmetic (Value monoid)
    ├── score.rs       # Heuristic semirings (tropical / probability / log)
    ├── bridge.rs      # floor-then-gradient bridge
    ├── norm.rs        # Deontic status lattice
    ├── govern.rs      # three-modality decision
    ├── temporal.rs    # LTL formula progression
    ├── supervise.rs   # trajectory supervision (safety shield + liveness)
    ├── reflexive.rs   # AGM policy revision + entrenchment
    ├── epistemic.rs   # S5 / KD45 modal logic
    ├── strategic.rs   # ATL / coalition logic
    ├── resource.rs    # linear-logic ledger
    └── main.rs        # the 97-law property-test harness (bin: `laws`)
```

## Notes on fidelity

- **Worlds carry an identity.** In the JS reference, possible worlds are distinct objects,
  so an agent's accessibility partition is keyed by object identity (`indexOf`), not by the
  p/q/r valuation — two worlds with the same valuation are still distinct cells. The Rust
  `World` carries an explicit `id` and compares by it, which is required for the S5
  introspection laws (E3/E4) to hold.
- **Semiring zero is `f64::NEG_INFINITY`** for tropical and log; `otimes` returns exactly
  `NEG_INFINITY` when either operand is the zero, so the annihilation law (H5) and the
  bridge veto (B1) use exact equality just like the JS `=== -Infinity` checks.
- **`chain` is partial**: a backward PULSE-phase step is refused, returned as
  `ChainResult::Error` (mirroring the JS `{error}` object).
- **The resource ledger uses `i64`** (all reference amounts are integers) so conservation
  and equality checks are exact.
