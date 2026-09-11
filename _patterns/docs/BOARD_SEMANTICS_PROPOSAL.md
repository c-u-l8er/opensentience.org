# Board semantics — what the circuitry can and cannot carry, and the minimal obligation for more (proposal)

**Status: PROPOSAL. Nothing here changes WRL Core 0.1.2 (frozen), the forge, or any identity.** Written
2026-09-13 for the WRL lane, beside `BOOK_SURFACE_PROFILE_PROPOSAL.md` and the pending
`graphonomous.semantic.v3` obligation. Measured at WRL `32160fec77a1`, TRVM `bf8670d57347`, over the book's
circuit board (`_patterns/wrl/chain/`, `_conclusion.wrl`).

**The question (Travis, 2026-09-13):** *does this circuitry handle input and output parameters, variables,
settings or configuration?* This document answers from the language's own tables, states what the book had
to do by convention, and proposes the smallest additions that would make those conventions language.

## 0. What the board is, and what the book had to fake

The board is one WRL world: 111 objects, 101 wires, 9 clock domains, 40 relays, 17 doors, 22 inter-chapter
links; sealed at every chapter (`P17` refuses a step that drops anything); reduced whole by the forge.
To make 32 chapters compose into it, the book used four conventions **that are not in the language**:

| Convention | Count | What it stands in for |
|---|---|---|
| an id prefix per chapter (`lc_`, `rj_`, …) | 32 | a **module boundary** |
| an entry relay with an open input port (`<pfx>_in`, or a router such as `lc_thread`, `rj_r`, `cc_grant`) | 21 | a module's **input port** — one per bench |
| a test bench (`<id>.bench.wrl`: a pulser driving the entry), used for the module's own film only | 21 | a **harness**; never part of the chain |
| links (`<id>.links.wrl`: an earlier router's output into this entry), used only in the chain | 22 | **instantiation / wiring** of a module |
| a `ScenarioV1` per module (23), the forge's own run-input document, bound to the module's id | 23 | **runtime inputs** — the one convention that is already language |

`chain.mjs` composes these textually; wrl.js seals the result. Every one of these conventions is honest,
and every one is invisible to WRL: a fragment is just declarations and edges.

## 1. What WRL Core has (from `wrl.js`'s frozen tables)

- **Static configuration, part of identity.** `Pulser`: `mode`, `period`, `phase`, `epoch` (sugar `every K, phase P`
  / `once at E`). `Spinner`: `w`, `n`, a four-lane `rotor` (or a named one: `identity`, `reverse_x/y/z`,
  `quarter_turn_z` by sugar) and `configurable`. `Mailbox`: `w`, `cap` — unwritable in source. `Relay`, `Door`,
  `Orb`: none. Any change moves the `sem-` id.
- **I/O is fixed port signatures.** `Pulser{sig_out}`, `Relay{sig_in, sig_out}`, `Door{sig_in}`,
  `Spinner{sig_in, socket}`, `Orb{pose}`. The `{…}` group is a checked projection, not a definition.
- **Two wire types, one of them valued.** `SignalWire` (`--sig-->`) carries one bit per epoch (`cur=0|1`).
  `SocketControl` (`--socket-->`) carries the spinner's **four rotor lanes** into the orb's pose — so WRL already
  has a typed, valued wire; it has exactly one, and it is fixed to Spinner→Orb.
- **At most one edge on any input port; fan-out unrestricted.** This is what makes relays routers and doors
  latching switches, and what made two producers into one Door the language's own refusing join.
- **Runtime state lives in the Film**, not in source: rotor and pose lanes, `open`, `cur_out`, `armed/done/nf`,
  the orb's numeric-fault latch, and the claim/receipt/recognition projection.
- **Runtime inputs are a separate document by design (D3).** A claim in world source is refused
  (`WRL_WORLD_SOURCE_HAS_SCENARIO`). `ScenarioV1` carries `initial_runtime.numeric_faults` and one claim
  batch per epoch — `SetRotor(spinner, r0.r1.r2.r3)` (accepted only if the spinner is `configurable`) and
  `ResetFault(orb)` — with writer ids and sequences; it has its own identity, the **ScenarioDigest**, and a
  `ReplayBundleID = H(SemanticArtifactID, ScenarioDigest, initial runtime)`.
- **Bounded admission.** `MAX_BATCH = 4` claims per epoch, `MAX_FACTS = MAX_EVENTS = 6` per world: a world of
  111 objects admits at most six facts in total before the capacity fault latches. The board therefore runs on
  its clocks alone; its modules carry their claims in their own films.
- **Settings that do not change meaning:** the lowering profile (`counter_encoding`, `onehot_max`, …) moves the
  `BackendArtifactID` and leaves the `SemanticArtifactID` fixed.

## 2. What it does not have

No variables. No expressions or arithmetic. No parameters on declarations beyond the fixed config keys. No
user-declared ports. No module, import or instantiation construct. No valued wire other than socket→pose. No
way to carry a value from one spinner's lanes into another object's input. The board's "routers" route a
bit; its "switches" latch on a bit.

## 3. Measured: what the book did with what exists, and what each chapter had to say instead

Ten chapters use claims (ScenarioV1) as their inputs; two use a seeded fault; one uses a determinism
double-run; twenty-one use a bench; twenty-two are wired by links; two are the empty world. Where a chapter's
idea needed a value to flow (Semantic Membrane's "what crosses the boundary", Projection's "derived view"),
the book used the one valued wire, socket→pose, and said so; where it needed a parameter (Progress-Aware
Placement's "where progress is greatest"), it used topology (which home is wired) and said the number is
unrun.

## 4. The minimal obligation, in three steps of increasing cost

**Step 0 — done, and needs no ruling: adopt `ScenarioV1`.** The book's ad-hoc sidecars were converted to the
forge's document, validated by `validate_scenario_v1`, bound to each module's `SemanticArtifactID` (a mismatch
refuses: `WRL_SCENARIO_WORLD_MISMATCH`), and digested; every module page prints the ScenarioDigest beside the
world id. Runtime inputs now have the identity the forge gives them.

**Step 1 — a module boundary as data, not syntax (a V2 static profile row, no runtime).** Exactly what §0's
conventions state: a `MODULE` role with attributes `{prefix, entry, exits}`; kinds `CONTAINS [MODULE, *]`,
`ENTERS [SignalWire-source, MODULE]` (a link into an entry), `BENCHES [MODULE, Pulser]` (the harness,
excluded from the chain's identity). This makes the board's structure sealable and checkable — "chapter 12
draws from chapter 10's router" becomes a relation with an id — and adds no execution. Same path as
`book.surface.v1`.

**Step 2 — instance parameters (Core, not V2; needs a ruling on identity).** A declaration-level parameter is
already what `period`, `phase`, `rotor` and `configurable` are. The obligation is to say whether a *module*
may carry named parameters that its members' config keys reference (`(every $rate)`), and whether they
enter identity (the sealed value) or the run (a scenario field). The identity-bearing reading is the one the
frozen tables already take for every config key; the run-bearing reading is what `SetRotor` already is for
one key. Recommendation: parameters are identity; runtime overrides are claims; do not add a third kind.

**Step 3 — valued wires beyond socket→pose (a new edge kind; a runtime change in TRVM).** Carrying lanes
from a spinner into a relay or another spinner is a new `EDGE_KIND` with a new port pair and reducer rules,
subject to Law 6 (the carried value must be in the Film) and to the cost cliff (the term grows with width).
This is the only step that touches the forge's reduction; it is the one this document does *not* recommend
starting before steps 1 and 2 are ruled.

## 5. What the book does meanwhile

Keeps the conventions, states them on every page (fragment, bench, links, ScenarioV1 with its digest), and
keeps the checks that make them honest: the seal at every step, the superset refusal, the completeness check
that every sink changes by the last epoch, reducer parity where the native binary can parse the term.

## 6. Not done here

No row added, no edge kind, no parameter syntax, no identity moved. Two facts recorded for the TRVM lane:
the native reducer refuses the whole board and two small modules at parse (exit 4; `MAXNAMES 8192` in
`ic32.c` suspected, unconfirmed), and `MAX_FACTS = 6` bounds a world's claims regardless of its size.

## Questions for adjudication

1. Is a module boundary a V2 static row (structure only) or a Core 0.2 construct (with a text surface)?
2. Do module parameters enter identity, the run, or is the question refused because config keys already are
   the parameters?
3. Should a bench be representable at all in the language, or is "harness ≠ world" a rule worth keeping as
   a refusal?
4. Is a second valued wire wanted, and if so which port pair — spinner→spinner (state to state) or
   spinner→relay (state onto a bit)?
