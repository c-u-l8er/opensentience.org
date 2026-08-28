# box-and-box

**A faithful runtime of Invariant + Heuristic Arithmetic** — the algebra, not a paraphrase of it.

- A **Value** is a *product of monoids* across families (`n`, `κ` cyclicity, `β` confidence, `σ` conflicts, `π` phase, governance). Five operations move it: `combine`, `chain` (phase-graded, *partial* — refuses a backward step), `promote`, `reconcile`, `deliberate`; `consume` is the boolean gate.
- A **Score** lives in a *semiring* `(K, ⊕, ⊗, 0̲, 1̲)`. `vote` aggregates alternatives (⊕), `rollout` chains evidence discounted (⊗), and `reinforce`, `dominate`, `anneal`, `select` do the rest.
- The **bridge** ties them: `consume` gates each option; a vetoed option gets score `0̲`, which annihilates through any `⊗`. **No heuristic utility, however large, can resurrect a vetoed option.**

All **210 laws** are property-tested — run `npm test`. (Invariant **L1–L14**, heuristic **H1–H13**, bridge **B1–B3**; deontic, temporal, reflexive, epistemic, strategic, and resource are documented per rung below; plus the **evolution bridge EV1–EV6** — measured, priced, certified self-revision on a provenance chain, a *join across rungs*, not a ninth — and the **compose runtime CA1–CA4 · CP1–CP4 · CX1–CX7 · CD1–CD17 · VX1–VX5 · QX1–QX6 · AD1–AD5 · CERT1–CERT40 · TREE1–TREE4 · WIRE0–WIRE7** — capability bricks snapping together with `&` and `|>` over the shared floor, "a brick of bricks is a brick", **CX6** asserting fail-closed: a malformed/partial brick yields `0̲` or a valid brick, never an exception. See [The compose runtime](#the-compose-runtime--admission-and-certificates) for the admission gate and the presented-vs-authenticated boundary.)

```
npm install box-and-box

# the CLI (four surfaces; also `npm test` runs the law harness)
box-and-box govern decision.json          # real verdict: JSON in → certificate out (exit 0/1/2/3 for CI)
box-and-box compile agent.ampersand.json  # the [&] govern bridge: an ampersand.json governance block → policy
box-and-box laws                          # the 109-law core conformance harness (2000 trials each)
box-and-box compose-laws                  # the 76-law compose-runtime harness (& |> floor, admission, certificates)
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

## The compose runtime — admission and certificates

Two operators snap capability **bricks** together and yield another brick: `&` (combine, parallel)
and `|>` (pipeline, sequence). Both rest on one floor. What a brick must pass to *enter* the algebra
is a separate question from whether its fields parse, and the two were conflated until 2026-08-22.

### The carrier

```
RawBrick  --Brick()-->  CanonicalBrick  --the floor-->  AdmittedBrick | 0̲  -->  the algebra
```

`admitted(x)` is the exported predicate. `LIVE` used to mean only *the constructor could read every
field*; an uncertified brick is structurally perfect and **unadmitted**. Real composition always knew
that — `u |> f` is `0̲` — and the identity did not, because it short-circuits before the floor. So the
one route through the algebra applying no floor was the element whose entire job is to change
nothing, and `u |> ID` returned a non-carrier element out of a composition. The algebra was not
closed. Identity laws quantify over the carrier, so restricting them costs no law (**AD1–AD3**).

The line is drawn **at the floor and nowhere else**. `undeclared` is not a floor condition, so an
undeclared brick still passes through the identity unchanged and still refuses at its next real
hand-off. `uncertified` is one, so it floors here exactly as it floors everywhere else.

### The units are operator-typed

`&none` is the identity of `&`; `id` is the identity of `|>`. Each is a frozen singleton recognised
by **reference** — the one property a caller cannot forge by writing data — and each has algebraic
meaning **only under its own operator** (**CD15/CD16**). A unit under the other operator is `0̲`, not
an ordinary brick. This is the standard situation rather than a local ruling: a
[duoidal category](https://ncatlab.org/nlab/show/duoidal+category) carries two monoidal structures
with *distinct* units, related only by an explicitly declared structure map. Absent that map there is
nothing to assume.

The units are **transitively** immutable (**CD14**). `Object.freeze` is shallow, and a shallow freeze
on a process-wide singleton is a writable global: `idBrick().cost.verdict.certified = false` used to
take, permanently.

### Crossing a boundary

`encodeTerm` → wire → `decodeTerm` is the **only** valid crossing, and it is now enforced rather than
advised. A raw `postMessage(idBrick())` lands as a *counterfeit* — the canonical tag survives the
copy, the reference does not — and is refused by name (**CD17**). Verified against a real
`worker_threads` realm: `npm run transport`.

### Certificates: presented vs authenticated

The cost certificate is the fourth carrier, and it is duck-typed on purpose so that box-and-box stays
dependency-free and [weave](../../weave) stays an optional producer. That is a trust-boundary
decision, and the public language now names it rather than letting the word *certificate* imply more
than it earns:

| | meaning | mechanism |
|---|---|---|
| **well-formed certificate** | the object parses, binds a subject, is coherent, says `certified: true` | structural validation (**CERT1/CERT2/CERT11/CERT23**) |
| **`presentedFor(brick)`** | that certificate is about *this brick* — well formed **and** bound | **CERT20/CERT21** |
| **`authenticatedFor(brick)`** | `presentedFor` **and** a verifier established the claim | the attestation capability (**CERT8/CERT9/CERT12/CERT14**) |

`{ verdict: { certified: true, costClass: 'poly' } }` is **not** a certificate. A certificate binds
`subject` and `analyzer`, carries a boolean `certified` (`!!` made the string `'false'` certify), a
`costClass` in the lattice, and a `policy.resourceDecision` no more permissive than its own verdict
implies. A certified verdict of `costClass: 'unknown'` certifies nothing and does not clear the floor
(**CERT5**).

### Attestation is a capability

`attest()` used to be a free export, honestly documented as *unforgeable by data, not by code*. That is
not a boundary once the same brand carries WORLD revisions and authority delegations, so the authority
is now minted **once per module instance** and handed to whichever component actually verifies:

```js
import { createAttestationAuthority } from 'box-and-box/compose';

// at bootstrap, as early as the module graph allows — FIRST CALLER WINS
const authority = createAttestationAuthority({ name: 'weave', verify: checkSignature });
const cert = authority.verifyAndAttest(rawCert, { kind: 'weave-ir', hash: expectedHash });
```

`verifyAndAttest` validates the structure, runs the injected `verify`, **requires an expected subject**,
deep-freezes, and only then brands. Each step closes a specific hole: attesting without an expected
subject established *"this certificate object was verified"* rather than *"verified for this thing"*,
and branding a mutable object let an attested certificate change what it claimed to authenticate while
staying attested.

`verifyAndAttest` takes a **complete subject**, not a hash: a bare hash is refused by name, because
comparing one selected field is not binding — `{weave-ir, H}` and `{world-revision, H}` are different
subjects, and once WORLD adds a second namespace, equal payload hashes across namespaces are ordinary.

A runtime **owns its attestation store**, which is the shape this should have had from the start:

```js
import { createComposeRuntime } from 'box-and-box/compose';

const rt = createComposeRuntime({ name: 'weave', verify: checkSignature });
const cert = rt.verifyAndAttest(raw, { kind: 'weave-ir', hash });
rt.composePipe(a, b);        // attestation is read from THIS runtime's store
```

Two runtimes in one process share **no** authentication state: a certificate attested by one is
merely *presented* to the other (**CERT24**). That matters as soon as the same brand carries WORLD
revisions and authority delegations — a security root whose extent is "whoever imported this file
first" is not a scope.

> **HISTORY, and a limitation that is now closed.** For three rounds the store was a single
> module-level WeakSet, and this file documented it as *once per realm* <!-- doc-claim:frozen: this paragraph RECORDS the retired claim --> — then, after outside review
> measured it, as *module-instance-order security*. Loading `compose.mjs?i=1` and `compose.mjs?i=2`
> in a single Node realm mints two authorities with independent stores, so "realm" was the wrong
> noun; bundler duplication and multiple package copies produce the same topology. Both statements
> were honest and neither was a design. The module-level operators still use a **default** store —
> identical behaviour for anything that never asks for isolation, and `createAttestationAuthority`
> still guards it once per module instance — but a host that cares constructs its own runtime.
`isAttested()` stays a free export — asking whether a fact is authenticated must never require the
power to make it so.

A certificate arriving as JSON, over `postMessage`, or out of a store can never be attested, because a
WeakSet brand does not survive serialisation. Composition never upgrades evidence — a composite of one
authenticated and one merely presented certificate is presented (**CERT3**). The status is deliberately
*not* a field; a privileged status stored as data is one any caller can write (**CERT4**).

### Binding, and what `presented` promises

Binding and authentication answer different questions, and they used to be entangled:

| | asks |
|---|---|
| **binding** | what does this evidence purport to be evidence *about*? |
| **authentication** | who established that the evidence is genuine? |

A certificate for `A` attached to an artifact `X` is not an *unauthenticated* certificate for X — it
is the **wrong certificate**, and it was admitted at the baseline floor. So binding moved down to the
baseline and authentication layers on top of it:

```js
presentedFor(b)      // artifact present ∧ sameSubject(b.artifact, b.cost.subject)
authenticatedFor(b)  // presentedFor(b) ∧ isAttested(b.cost)
```

A **present** artifact that disagrees with the certificate's subject is `0̲` — `certificate-misbound`
— whether or not the certificate is attested. An **absent** artifact is not a contradiction: the
brick has not said what it is, so it stays admitted, is neither `presentedFor` nor
`authenticatedFor`, and `floor: ['bound']` turns the baseline rule into a positive requirement. That
is the ABSENT-vs-PRESENT+INVALID line this runtime draws on every other carrier.

### Policy composes monotonically, and the subject is a composition identity

A certificate's `policy.resourceDecision` may be **stricter** than its verdict implies and never more
permissive — and that rule now survives composition. The composite decision is the join over both
operands and the cost-derived minimum on `allow < budget_check < escalate < annihilate`, so strictness
only accumulates (**CERT6**). `annihilate` does not merely propagate: a certificate whose own
instruction is *do not admit this* is not admitted (**CERT7**). `escalate` and `budget_check` are
live-with-an-obligation and are carried up at full strength.

A composite's certificate subject is a **canonical term** over leaf hashes, not a deduplicated set
(**CERT10**):

```
subject(a |> b)   =  ["pipe",["leaf","weave-ir","A"],["leaf","weave-ir","B"]]
subject(a &  b)   =  ["and", …]      — different programs, different subjects
subject(a |> a)   =  ["pipe",A,A]    — multiplicity survives
subject((x&y)&z)  =  ["and",X,Y,Z]   — & flattens: CA1 associativity is a passing law
subject(x&y) ≠ subject(y&x)          — & does NOT commute: CA2 is lattice-only, CP7 is open
subject(x&x) ≠ subject(x)            — & does NOT dedupe: cost and quantities accrue
```

> **CORRECTED 2026-08-22.** This section previously showed the identity as a term *string* —
> `pipe(A,B)`, `and(A,B,C)` — and asserted that **"a canonical term cannot collide."** <!-- doc-claim:frozen: a correction must quote what it corrects --> That was
> false and outside review falsified it the same day: leaf hashes are arbitrary strings, so they
> shared a namespace with the grammar meant to distinguish them. A leaf whose hash *was*
> `pipe(A,B)` had the same subject as `A |> B`, and the `&` flattener parsed leaf strings as
> composite syntax, so `leaf("and(A,B)") & C` collided with `(A&B)&C`. **A canonical form built by
> concatenating untrusted strings is not canonical, it is a template.** The encoding is now
> structured, and flattening reads a structured term from a module-private map rather than parsing
> a string.

> **CORRECTED AGAIN 2026-08-22.** The structured encoding above first kept its term in a
> module-private WeakMap keyed on the subject *object*. That made the meaning of a subject depend on
> whether that exact JS object had been minted by that module instance — and `Brick()` erased it when
> canonicalising an artifact into a fresh `{kind, hash}`. So binding held for `A & B` and broke for
> `(A & B) & C`: the certificate kept its term by reference, the artifact did not, and the two
> derivations stopped being the same derivation. **A canonical identity is not canonical if
> reconstructing the same value erases information needed to extend that identity.** The term is now
> durable data on the subject, checked against the hash it ships beside.

> **CORRECTED A THIRD TIME 2026-08-22.** Making `term` merely *optional* left two representations of
> one subject with different extension semantics — `{kind, hash, term}` and `{kind, hash}` compared
> **equal** under `sameSubject`, and composing each with the same operand produced different
> identities. **Two subjects are equal only if replacing one with the other cannot change any future
> canonical identity.** Subjects are now a discriminated union: `kind` fixes the shape, and the
> second representation does not exist.

Subjects are a **discriminated union** on `kind`, and the discriminator is semantic as well as
structural:

| | shape | term |
|---|---|---|
| **leaf** | `{kind, hash}` — `kind ≠ 'weave-composite'` | must be **absent**; derived as `['leaf', kind, hash]` |
| **composite** | `{kind: 'weave-composite', hash, term}` | must be **present**, root `and`/`pipe`, in normal form, `hash === canonicalJSON(term)` |

A caller may hand a composite subject in and have it understood (transport stability) and cannot lie
about it. Every nested leaf inside a term obeys the same non-empty rules as a root subject, because
*a recursively canonical object must enforce its invariants recursively*.

**Validity is not canonicality**, and the difference is enforced:

```
wellFormedTerm(t)   grammar + recursive field validity
canonicalTerm(t)    wellFormedTerm ∧ root ≠ leaf ∧ t = normalize(t)
```

`normalize` flattens `and` and **nothing else**, because CA1 (associativity over
carrier+quantities+cost) is the only equation the suite proves here. `&` operand order is untouched
(CA2 is lattice-only; CP7 is the open counterexample), duplicates are kept (CA3 is lattice-only; cost
and quantities accrue), and `|>` association is preserved exactly as supplied — normalising it would
assert an equation CP5/CP6 currently falsify.

A noncanonical term is **refused, not repaired**. A supplied term is an identity *assertion*, and a
default may not overwrite a claim: ABSENT takes a documented default, PRESENT + NONCANONICAL is `0̲`.
The consequence is the one that matters once these become WORLD revision ids and replay keys — two
peers describing the same associative assembly mint the *same* authoritative identity (**CERT27**).

> **An identity is canonical only if every admissible representation of the same proved algebraic
> object produces the same identity — and noncanonical representations are refused, not repaired.** Leaf identity includes `kind`, not just `hash`. What the
identity may normalise is decided by which equations the suite actually *proves*. It is a canonical
**string** rather than a digest because this package has no crypto; a host needing fixed width hashes
these bytes, and hashes something already canonical.

> **NAMING, corrected 2026-08-22.** This line read *"the floor requires **presented** by default"*
> while `presentedFor(brick)` returns `false` for an unbound brick that the baseline floor admits.
> Two different concepts under one word, in the file WORLD prose will be written against. They are
> now kept apart:
>
> | | |
> |---|---|
> | **a well-formed certificate** | the object parses, binds a subject, and is internally coherent — what the baseline requires of the *certificate* |
> | **`presentedFor(brick)`** | that certificate is about *this brick* — well formed **and** bound |
> | **`authenticatedFor(brick)`** | `presentedFor` **and** a verifier established it |

The baseline floor requires a **well-formed certificate**, and refuses a *misbound* one. A brick that
needs the stronger reading declares it, and
the requirement is unioned into every composite it enters:

```js
import { Brick, composePipe, admitted } from 'box-and-box/compose';

// A brick that must satisfy an `authenticated` floor declares WHAT IT IS, or the certificate has
// nothing to bind to — absence is fail-closed (CERT9).
const strict = Brick({ /* … */ cost: attestedCert, floor: ['authenticated'],
                       artifact: { kind: 'weave-ir', hash: attestedCert.subject.hash } });
composePipe(presentedBrick, strict);   // 0̲  — 'certificate-presented-not-authenticated'
composePipe(mismatchedBrick, strict);  // 0̲  — 'certificate-subject-mismatch'
composePipe(unboundBrick, strict);     // 0̲  — 'certificate-unbound'
```

Recognised floor tokens are a **closed set** and an unrecognised one refuses (**AD5**) — a brick
demanding `floor: ['signed-by-treasury']` from a runtime that has never heard of it must not have the
demand quietly dropped. Fail-closed means the unknown requirement is *unmet*, not *unnoticed*.

---

## Numerics (normative)

For two conformant runtimes to "agree like calculators," the numeric domain is specified, not left
to each language's defaults. The single source is [`numerics.mjs`](./numerics.mjs) (one exported
`round` + tolerance; it replaces four previously-duplicated `round` helpers in `value`, `bridge`,
`govern`, `evolution`).

**Two classes of field:**

| Class | Fields | Comparison |
|---|---|---|
| **EXACT** | integers / scaled-integers: norm counts, ledger token balances, phase indices, and the **tropical (min-plus / max-plus) hard-floor semiring** | `===` — never rounded; a floor decision must never hinge on a rounding tie |
| **TOLERANCE** | reals: `β` confidence, axiological scores, the **probability** and **log-sum-exp** semirings, evolution `Δ` | display-rounded with `round`; compared with `approxEq` at `EPS = 1e-9` |

The `logsumexp` / probability semirings are **tolerance-class by construction** (non-associative in
floating point); the **tropical** semiring is **exact-class** and is what hard safety floors use, so
the un-weakenable floor is decided by integer/`===` logic, not by a rounded real.

**Canonical rounding rule** (a conformant runtime in another language MUST reproduce it):

```
round(x, dp) = Math.round(x * 10^dp) / 10^dp     // IEEE-754 binary64
```

where `Math.round` is **round-half-toward-+∞** (JS semantics — *not* C's half-away-from-zero), `dp`
defaults to **3** for public carriers (`β`, scores) and **6** for the evolution non-regression delta.
`±Infinity` and `NaN` pass through unchanged (an annihilated `0̲` branch carries `±∞`; rounding must
not make it finite).

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
operations of seven modalities plus the resource economy, the algebraic bridge, the evolution surface, the compose runtime (capability bricks under `&` and `|>` over the shared floor), 210 laws.

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
economy, one bridge, an evolution surface that measures, prices, and certifies its own revisions, and a compose runtime that snaps capability bricks together over the shared floor — **210 property-tested laws**.

MIT licensed.
