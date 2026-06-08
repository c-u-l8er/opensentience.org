# box-and-box

**A faithful runtime of Invariant + Heuristic Arithmetic** — the algebra, not a paraphrase of it.

- A **Value** is a *product of monoids* across families (`n`, `κ` cyclicity, `β` confidence, `σ` conflicts, `π` phase, governance). Five operations move it: `combine`, `chain` (phase-graded, *partial* — refuses a backward step), `promote`, `reconcile`, `deliberate`; `consume` is the boolean gate.
- A **Score** lives in a *semiring* `(K, ⊕, ⊗, 0̲, 1̲)`. `vote` aggregates alternatives (⊕), `rollout` chains evidence discounted (⊗), and `reinforce`, `dominate`, `anneal`, `select` do the rest.
- The **bridge** ties them: `consume` gates each option; a vetoed option gets score `0̲`, which annihilates through any `⊗`. **No heuristic utility, however large, can resurrect a vetoed option.**

All **103 laws** are property-tested — run `npm test`. (Invariant **L1–L14**, heuristic **H1–H13**, bridge **B1–B3**; deontic, temporal, reflexive, epistemic, strategic, and resource are documented per rung below; plus the **evolution bridge EV1–EV6** — measured, priced, certified self-revision on a provenance chain, a *join across rungs*, not a ninth.)

```
npm install box-and-box

# the CLI (four surfaces; also `npm test` runs the law harness)
box-and-box govern decision.json          # real verdict: JSON in → certificate out (exit 0/1/2/3 for CI)
box-and-box compile agent.ampersand.json  # the [&] govern bridge: an ampersand.json governance block → policy
box-and-box laws                          # the 103-law conformance harness (2000 trials each)
box-and-box demo <name>                   # a bundled teaching example (see below)

# the bridge end-to-end — an [&] declaration, judged by the eight rungs:
box-and-box compile agent.ampersand.json --options opts.json | box-and-box govern

# demos: rag | select | govern | supervise | evolve | know | strategy | economy | assistant | harness
box-and-box demo select   # the bridge: a high-utility but unsafe action is annihilated to 0-bar
box-and-box demo assistant # APP: a governed research assistant (epistemic + resource + deontic)
```

> **What this package is, in one line.** box-and-box is the **governance kernel** of the
> [&] Protocol — the verdict engine that a composed capability set compiles *down to*. It is
> **not** the `ampersand.json` schema validator (that is `@ampersand-protocol/validate`) and it
> is **not** a capability-composition protocol. `[&]`/CC2 *declares and composes*; box-and-box
> *decides* `feasible ▸ permitted ▸ best`. `box-and-box compile` is the bridge between the two.
> See `AmpersandBoxDesign/docs/UMBRELLA.md` for the full layer map.

---

## Invariant Arithmetic

```js
import { V, combine, chain, promote, reconcile, deliberate, consume } from 'box-and-box';

const s1 = V({ pi: 'retrieve', beta: 0.90 });
const s2 = V({ pi: 'retrieve', beta: 0.70, sigma: ['conflict:date'] }); // weaker, conflicting

const ctx    = combine(s1, s2);                      // beta -> min (0.70), sigma -> union
const answer = chain(ctx, V({ pi: 'act' }));         // ok: retrieve <= act
const bad    = chain(answer, V({ pi: 'retrieve' })); // { error: "pi-violation: cannot chain 'retrieve' after 'act'" }

consume(answer, { beta_min: 0.85, sigma_empty: true, acyclic: true });
// { ok: false, failures: [ {family:'beta',...}, {family:'sigma',...} ] }  -- refuses, by family
```

`combine` is a monoid (associative, identity `V0`) but **not** globally commutative — the temporal
(`pi`,`iota`,`psi`, first-non-null) and governance (`authority`, concat) families encode order.
The endomorphisms repair a value: `deliberate` forces `kappa -> false`, `reconcile` removes
resolved conflicts, `promote` raises `beta` monotonically.

## Heuristic Arithmetic

```js
import { Score, vote, rollout, dominate, anneal } from 'box-and-box';

rollout([Score({ u: 6 }), Score({ u: 4 })], 0.9, 'tropical'); // chain evidence, gamma-discounted
vote(Score({ u: 6 }), Score({ u: 8 }), 'tropical');           // aggregate alternatives (+ = max)
```

Three semiring **personalities**: `tropical` (max,+) — the only idempotent one, so it induces a
ranking; `probability` (+,*); `log` (logsumexp,+). Idempotence (H6) holds only on the dioid —
the harness shows it failing on the others, which is the point.

## The bridge — floor-then-gradient

```js
import { V, Score, rollout, select } from 'box-and-box';

const u = (a, b) => rollout([Score({ u: a }), Score({ u: b })], 1.0, 'tropical');
const options = [
  { id: 'read_doc',    value: V({ beta: 0.92, kappa: false, authority: ['cap:read'], denyDefault: false }), utility: u(6, 4) },
  { id: 'delete_self', value: V({ beta: 0.97, kappa: true,  authority: [],            denyDefault: true  }), utility: u(9, 6) }
];

select(options, { beta_min: 0.90, acyclic: true, deny_default: 'must_allow' }, 'tropical');
// decision: 'read_doc'
// vetoed:   [{ id:'delete_self', rawWouldBe: 15, gatedScore: 0, failures:[{family:'kappa',...},{family:'governance',...}] }]
```

`delete_self` scored **highest**. It loops on itself (`kappa`) and has no authority, so `consume`
vetoes it, `0-bar` annihilates it, and the gradient selects the best *feasible* action. This is the
case a scoring policy gets wrong and a content classifier never sees — OWASP **LLM06**, excessive agency.

---

## Deontic Arithmetic — the third rung

The invariant layer says what *cannot* be; the heuristic layer says what is *better*. The deontic
layer says what *ought* to be: obligation, permission, prohibition. A norm assigns an action a
status in a diamond lattice — `OPTIONAL` (bottom), `OBLIGATORY` / `FORBIDDEN` (incomparable
middles), `CONFLICT` (top); `join` accrues norms, `resolve` clears a conflict by priority, and a
**contrary-to-duty** repair escalates when an obligation is breached.

```js
import { V, Norm, govern } from 'box-and-box';

const norms = [
  Norm({ id: 'forbid-PII',  modality: 'forbidden',  priority: 10, condition: (c) => c.transmitsPII && !c.hasConsent }),
  Norm({ id: 'get-consent', modality: 'obligatory', priority: 8,  condition: (c) => c.containsPII && c.obtainsConsent,
         ctd: Norm({ id: 'escalate-to-DPO', modality: 'obligatory' }) })
];

govern(options, { req: { beta_min: 0.9, acyclic: true }, norms });
```

`govern` stacks all three modalities with a principled precedence — **alethic ▸ deontic ▸
axiological**:

- a **FORBIDDEN** option is excluded, but recorded as *overridable* (a norm, not a wall);
- an **OBLIGATORY** feasible option is *forced* — chosen over anything that merely scores higher;
- an **OBLIGATORY** option that the alethic floor makes infeasible triggers a **contrary-to-duty
  escalation** (e.g. escalate-to-DPO) — never a silent fall-back to a permitted action.

This is the difference between "refuse / rank" and "refuse / rank / **oblige & escalate**". Laws
D1–D9 (norm algebra) and DB1–DB3 (the three-modality interaction) are property-tested with the
rest. `npx box-and-box govern` runs a regulated-PII workflow showing all three behaviours.

---

## Temporal Arithmetic — the fourth rung

The first three rungs judge a single state. An agent produces a *trajectory*, and the properties
that matter most range over the whole run. A `Spec` is an LTL formula over predicates on states;
the core operation is `progress(φ, s)` — the LTL derivative, the residual obligation on the rest
of the trajectory. Monitoring is a fold of `progress`; the residual collapses to `⊤`/`⊥` the moment
the outcome is forced.

```js
import { temporal, TemporalSpec, supervise, residualOf, guard } from 'box-and-box';
const { atom, always, eventually } = temporal;

const specs = [
  TemporalSpec({ id: 'confidence-floor', formula: always(atom('β≥0.8', s => s.beta >= 0.8)), kind: 'safety' }),
  TemporalSpec({ id: 'reach-goal',       formula: eventually(atom('done', s => s.done)),    kind: 'liveness', ctd: 'escalate-replan' })
];
supervise(trajectory, specs);
```

Every linear property splits into **safety** and **liveness** (Alpern & Schneider), and that split
is the seam with the rest of the ladder:

- **safety** (`G ¬bad`) has a finite witness, so it extends the alethic floor across time — a
  runtime **shield**: `guard` prunes any action whose successor would drive the residual to `⊥`;
- **liveness** (`F goal`, `GF progress`) can only fail at the horizon, so it extends the deontic
  *ought* across time — a temporal obligation that fires the same **contrary-to-duty** escalation
  when unmet. (A one-step deontic obligation is the horizon-1 case.)

Laws T1–T8 (the temporal algebra) and TB1–TB3 (the shield/obligation interaction) are
property-tested. The keystone is **T4** — progression is checked against an *independent* recursive
evaluator on random formulas. `npx box-and-box supervise` runs the worked example.

---

## Reflexive Arithmetic — the fifth rung

The first four rungs are fixed once written. The reflexive rung lets a `Policy` — the deontic
norms and temporal specs, plus a set of **entrenched** ids — revise itself. Revision follows AGM
belief-revision discipline (success, consistency, minimal change) with the deontic norm-change
principles (**lex superior** = priority wins, **lex posterior** = recency wins) for conflicts.

```js
import { Policy, enact, repeal, amend, entrench, revise } from 'box-and-box';

let p = entrench(Policy({ norms: [forbidLeak], specs: [safetyFloor] }), 'forbid-leak');
revise(p, enact(obligeCite));                 // accepted — a new duty
revise(p, repeal('forbid-leak'));             // REJECTED — entrenched
revise(p, amend('forbid-leak', weaker));      // REJECTED — would weaken the core
revise(p, amend('forbid-leak', stronger));    // accepted — strengthening is allowed
```

The capstone is the **entrenchment** guard: an amendment is admissible only if it does not weaken
an entrenched norm — you cannot repeal the core, amend it weaker, or enact a higher-priority norm
that out-ranks it. The system can make itself **more** constrained, never less, so self-modification
can never relax the safety floor. The revised policy feeds straight back into `govern` and
`supervise`. Laws R1–R8 (the revision algebra) and RB1–RB3 (the wiring to the rest) are
property-tested; the keystone **R4** is the safety guarantee. `npx box-and-box evolve` runs a constitution
that amends itself five times.

---

## Epistemic Arithmetic — the sixth rung

Every rung above governs what an agent should *do*; none say what it *knows*. This one is the
missing modality: knowledge and graded belief over **possible worlds**. `K φ` holds iff φ is true
in every world the agent still considers possible; learning is a truthful **public announcement**
that deletes the ruled-out worlds (so knowledge only grows — the continual-learning link); and the
gap between *not knowing* and *knowing that you don't know* (`K¬Kφ`) is exactly the κ signal that
routes to deliberation.

```js
import { epistemic } from 'box-and-box';
const { Model, knows, knowsItDoesntKnow, route, announce, distributed } = epistemic;

knows(m, 'a', p);                 // true in all accessible worlds
knowsItDoesntKnow(m, 'a', p);     // K¬Kp — a detected gap (the κ signal)
route(m, 'a', p);                 // → "deliberate"
knows(announce(m, p), 'a', p);    // learn p → the gap closes → true
```

Knowledge is **S5** (an equivalence relation → factive: `Kφ → φ`, and introspective); belief is
**KD45** (serial but not reflexive → consistent and introspective, but *not* factive — you can
believe falsehoods). The harness shows that split as a cross-check: factivity holds for knowledge
and fails ~30% of the time for belief. Multi-agent gives everyone-knows, **common knowledge** (its
fixpoint — the coordination prerequisite), and **distributed knowledge** (pooled — the group knows
more than any member). Laws E1–E8 + EB1–EB3; `β` is the graded-belief strength, and EB2 is the κ
link. `npx box-and-box know` runs the worked example.

---

## Strategic Arithmetic — the seventh rung

The last rung is about *groups*. Over a **concurrent game structure** — states, agents, the moves
each agent has at each state, and a transition that consumes one move from *every* agent at once —
a coalition **can ensure** φ when it has a joint strategy that forces φ *no matter what the other
agents do*. Everything is built from the **controllable predecessor** (`∃ moves for C, ∀ moves for
the rest, the successor lands in the target`); the temporal abilities follow as fixpoints, the same
machinery the temporal rung uses but now played against an adversary.

```js
import { strategic } from 'box-and-box';
const { Game, canKeep, canEnsure, oblige } = strategic;

canKeep(g, ['ctrl'], safe, init);          // ⟨⟨ctrl⟩⟩□ safe — can keep it safe forever?  true
canEnsure(g, ['ctrl'], goal, init);        // ⟨⟨ctrl⟩⟩◊ goal — alone?  false (the env can hinder)
canEnsure(g, ['ctrl', 'env'], goal, init); // ⟨⟨ctrl,env⟩⟩◊ goal — together?  true
oblige(g, ['ctrl'], goal, init);           // → "escalate"  (ought-implies-can: it can't, alone)
```

`canKeep` is a greatest fixpoint (maintenance / safety), `canEnsure` a least fixpoint (reachability
/ liveness). The bridges are where it joins the stack: a one-agent game collapses to the **temporal**
rung's reachability (SB1); an obligation a coalition *can't* ensure escalates back to the **deontic**
rung — *ought-implies-can* (SB2); and a joint strategy is only executable with the **epistemic**
rung's common knowledge of the plan (SB3). Laws S1–S8 + SB1–SB3; superadditivity (S4) is the
cooperation law that lets disjoint coalitions combine. `npx box-and-box strategy` runs the worked example.

---

## Resource Arithmetic — the economy beneath the ladder

The seven modalities say what is possible, preferable, permitted, durable, revisable, known, and
forceable; none of them say what any of it *costs*. Resource Arithmetic is the economy the ladder
runs on. A **ledger** is a closed double-entry system — the only primitive is a transfer that can't
move more than an account holds, spending is a transfer to a sink, refilling a transfer from a
treasury — so **conservation** holds by construction (value is never created from nothing; that is
the currency invariant). Depletable resources follow linear logic (used once, no duplication, no
discard); resources marked **reusable** (the `!` "of-course" modality) may be copied freely.

```js
import { resource } from 'box-and-box';
const { Ledger, feasible, repair, allocate, consolidate, forget } = resource;

feasible(wallet, 'agent', { tokens: 8 });        // budget gate — false ⇒ carries 0̲, annihilates
repair(L, 'agent', { value: 6, cost: 2 });        // → "invoke"  (Type II: worth more than it costs)
repair(L, 'agent', { value: 1, cost: 4 });        // → "skip"    (act on the current best instead)
```

Two payoffs make this more than budgets. **Continual learning** is conserved capacity: `allocate`
moves capacity from free to committed (plasticity spent on stability), `consolidate` mints reusable
`!` knowledge that costs nothing to reuse, and `forget` reclaims capacity — but releases the
knowledge with it. You cannot keep the knowledge and reclaim its capacity, and that impossibility
*is* the stability–plasticity dilemma as a conservation law. And the rung **prices the ladder's own
repairs**: a deliberation or escalation is invoked only when its value beats its cost (I. J. Good's
"Type II" rationality) — the epistemic rung detects a known-unknown, this rung decides whether
closing it is rational. Laws C1–C8 + CB1–CB3; the multi-agent market companion (bidding, prices,
allocation) belongs next to the strategic rung. `npx box-and-box economy` runs the worked example.

---

## Browser

This package ships runnable code only. The browser surfaces are published as research pages on
[opensentience.org](https://opensentience.org): the interactive
[playground](https://opensentience.org/playground.html) runs the cross-layer harness client-side
(the RAG composition demo, the bridge selection, and 64 of the 97 laws — same code, no install),
and each rung has its own living-paper page —
[deontic](https://opensentience.org/deontic-arithmetic.html),
[temporal](https://opensentience.org/temporal-arithmetic.html),
[reflexive](https://opensentience.org/reflexive-arithmetic.html),
[epistemic](https://opensentience.org/epistemic-arithmetic.html),
[strategic](https://opensentience.org/strategic-arithmetic.html),
[resource](https://opensentience.org/resource-arithmetic.html) — alongside the existing
[invariant arithmetic](https://opensentience.org/invariant-arithmetic.html) (rungs 1–2) and the
full [/laws](https://ampersandboxdesign.com/laws.html) conformance page.

## What it is / isn't

**Is:** the actual substrate as runnable, property-tested infrastructure — families, the
operations of seven modalities plus the resource economy, the algebraic bridge, the evolution surface, 103 laws.

**Isn't:** new mathematics. The ranking side is **semiring-based soft constraints** (Bistarelli,
Montanari & Rossi, *JACM* 1997); the bridge is the **shielding** pattern from safe RL (Alshiekh
et al., AAAI 2017); `sigma` as a join-semilattice is the CRDT/lattice tradition; the deontic layer
is **von Wright**'s triad with **contrary-to-duty** repair (Chisholm 1963); the temporal layer is
**LTL** (Pnueli 1977) with the **safety/liveness** split (Alpern & Schneider 1985) and **formula
progression** (Bacchus & Kabanza 2000); the reflexive layer is **AGM** revision (Alchourrón,
Gärdenfors & Makinson 1985) with norm-change principles (Governatori & Rotolo) and the
provably-safe-self-modification idea (Schmidhuber's Gödel machines; MIRI tiling agents); the
epistemic layer is possible-worlds **knowledge/belief** (Hintikka 1962; Fagin/Halpern/Moses/Vardi
1995) with **public-announcement** learning (Plaza 1989) and **common knowledge** (Aumann 1976);
the strategic layer is **coalition logic** (Pauly 2002) and **ATL** (Alur, Henzinger & Kupferman
2002) with controllable-predecessor fixpoints; the resource layer is **linear logic** (Girard 1987)
with **Type-II** metareasoning (Good 1971; Russell & Wefald 1989) and **market-based control**
(Clearwater 1996) as its multi-agent companion. The contribution is the executable synthesis and
the agent-native packaging.

The ladder is complete, and the economy beneath it is in place: **alethic · axiological · deontic ·
temporal · reflexive · epistemic · strategic**, running on **resource** — seven modalities, one
economy, one bridge, and an evolution surface that measures, prices, and certifies its own revisions — **103 property-tested laws**.

MIT licensed.
