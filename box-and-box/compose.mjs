// compose.mjs — the CC2 compose runtime: the lego layer (COMPOSE_RUNTIME.md §2–4).
//
// A BRICK is a capability annotated with everything needed to compose it lawfully: a holder
// (provenance), a contract (the |> hand-off types), a box-and-box modal Value (the alethic floor
// input), a Weave-shaped cost certificate (the invariant), plus utility/laws/floor. Two operators
// snap bricks together and YIELD ANOTHER BRICK (closure — "a brick of bricks is a brick"):
//
//   &   combine (parallel)   — lifts value.combine: lattice merge of capabilities, holder-tagged.
//   |>  pipeline (sequence)  — lifts value.chain:   governed, phase-graded, type-checked hand-off.
//
// Both rest on the SAME floor: any infeasible / backward / forbidden / UNCERTIFIED branch collapses
// to 0̲ (ZERO) — the absorbing element — never a down-ranked-but-surviving option. This is the alethic
// `consume` gate lifted to bricks. The composite carries a composite cost certificate and the CC2
// semiring quantities (confidence = product, cost = sum, latency = max).
//
// Pure library, zero deps: the cost certificate is DUCK-TYPED (weave emits it; we only read
// verdict.certified / verdict.costClass / policy.resourceDecision), so box-and-box stays
// dependency-free and weave stays an optional producer.

import { V, V0, combine, chain, consume, phaseIdx, PHASES} from './value.mjs';

// ---------------------------------------------------------------------------
// cost-class lattice — worst (join) wins under composition. unknown ⇒ uncertified ⇒ 0̲.
// ---------------------------------------------------------------------------
const COST_ORDER = ['poly', 'elementary', 'exponential', 'tower', 'unknown'];
const costRank = (c) => { const i = COST_ORDER.indexOf(c); return i < 0 ? COST_ORDER.length : i; };
const worseCost = (a, b) => (costRank(a) >= costRank(b) ? a : b);

// resource decision from a composite cost class — fail-closed (mirrors weave-certificate.mjs).
const decisionOf = (certified, costClass) =>
  !certified ? 'annihilate'
  : costClass === 'poly' ? 'allow'
  : costClass === 'tower' ? 'escalate'
  : 'budget_check'; // elementary | exponential

// a certified-poly identity certificate (used by the identity bricks none/id; they cost nothing).
const FREE_COST = () => ({
  subject: { kind: 'weave-ir', hash: '00000000' },
  analyzer: { name: 'identity', version: '0' },
  verdict: { certified: true, total: true, oracleFree: true, costClass: 'poly' },
  policy: { resourceDecision: 'allow', reason: 'identity brick — costless' }
});
// fail-closed default for a brick that arrives without a certificate: uncertified ⇒ 0̲.
const UNCERTIFIED_COST = () => ({
  subject: { kind: 'weave-ir', hash: '00000000' },
  analyzer: { name: 'none', version: '0' },
  verdict: { certified: false, total: false, oracleFree: false, costClass: 'unknown' },
  policy: { resourceDecision: 'annihilate', reason: 'no certificate supplied — fail-closed' }
});

function composeCost(a, b) {
  const certified = !!(a?.verdict?.certified && b?.verdict?.certified);
  const ca = a?.verdict?.costClass ?? 'unknown';
  const cb = b?.verdict?.costClass ?? 'unknown';
  let costClass = worseCost(ca, cb);
  if (!certified) costClass = costClass === 'poly' ? 'unknown' : costClass; // uncertified can't be "poly"
  const resourceDecision = decisionOf(certified, costClass);
  return {
    subject: { kind: 'weave-composite', parts: [a?.subject?.hash, b?.subject?.hash].filter(Boolean) },
    analyzer: { name: 'compose', version: '0.1.0' },
    verdict: { certified, costClass },
    policy: { resourceDecision, reason: `composite of {${ca}, ${cb}} ⇒ ${costClass}` }
  };
}

// ---------------------------------------------------------------------------
// CC2 semiring quantities — confidence (product), cost (sum), latency (max). One identity
// {confidence:1, cost:0, latency:0} serves both operators (1 = ⊗-id, 0 = +-id and max-id over ℝ≥0).
// ---------------------------------------------------------------------------
const Q0 = () => ({ confidence: 1, cost: 0, latency: 0 });
const q = (b) => ({ ...Q0(), ...(b.q || {}) });

// Q0 IS AN IDENTITY, NOT A DEFAULT — the same lesson `*` and `V0()` each taught, arriving a third
// time on a third carrier (QX1–QX6, outside review 2026-08-22).
//
//     missing contract  ->  ANY      CD1–CD5
//     malformed Value   ->  V0()     CX7, VX1–VX5
//     malformed q       ->  Q0()     here
//
// `q:'nope'`, `q:42`, `q:[]` and a wholly ABSENT `q` all became `{confidence:1, cost:0, latency:0}`,
// so unreadable measurement evidence read as PERFECT CONFIDENCE, ZERO COST, ZERO LATENCY — the most
// favourable point in the lattice, handed out for saying nothing. Per field it was no better:
// `confidence:'high'` composed to NaN, `latency:'fast'` composed to NaN, and `cost:'free'` composed
// to the STRING `'free0'`, because `+` on a string concatenates.
//
// Q0 is the true identity of the CC2 semiring (1 for a product, 0 for a sum, 0 for a max) and it is
// the correct, MEASURED quantity for `id` and `&none`, which cost nothing. It is wrong for an
// ordinary brick that merely arrived without measurements, because there every component is a
// maximal CLAIM rather than a neutral value. The identities keep it by supplying it explicitly and
// passing the same validation as everyone else — they are not exempt, they simply qualify.
const Q_VALID = {
  confidence: (x) => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1,
  cost: (x) => typeof x === 'number' && Number.isFinite(x) && x >= 0,
  latency: (x) => typeof x === 'number' && Number.isFinite(x) && x >= 0,
};
// All three must be PRESENT and valid. A partial `q` is the same defect as an absent one for the
// components it omits, so it is not completed from defaults.
function unreadableQ(qq) {
  if (qq == null || typeof qq !== 'object' || Array.isArray(qq)) return true;
  return Object.entries(Q_VALID).some(([k, ok]) => !ok(qq[k]));
}
function composeQ(a, b) {
  return {
    confidence: a.confidence * b.confidence,
    cost: a.cost + b.cost,
    latency: Math.max(a.latency, b.latency)
  };
}

// ---------------------------------------------------------------------------
// MISSING ≠ UNIVERSAL (CD1–CD5, 2026-08-22). Until that day an ABSENT contract field was defaulted
// to '*' by Brick() and typeMatch() waved through null on either side, so an assembly that declared
// no interface received the MOST PERMISSIVE one in the algebra and every hand-off passed a check
// with nothing left to check. Fail-open, in a runtime whose entire claim is that it refuses.
//
// THE CONTRACT CARRIER. Four kinds, tagged, and every one of them representable.
//
//     {kind:'undeclared'}            nothing was said. Refuses.
//     {kind:'any'}                   a CLAIM: "anything". Directional — see below.
//     {kind:'types', values:[...]}   a specific set. [] is the empty set, and means nothing.
//     {kind:'var', name:'α'}         a polymorphic passthrough: whatever came in, unchanged.
//
// Was raw `undefined` for UNDECLARED and the bare string '*' for everything universal. Two problems,
// both raised on outside review and both real:
//
//   1. `undefined` is not representable. It does not survive JSON, so a contract could not appear
//      in a receipt, a hash, a provenance record, a replay artifact or a WRL world — precisely the
//      places this algebra is meant to end up. A carrier whose most important value vanishes at the
//      serialisation boundary is not a carrier. A magic string was rejected too: any in-band
//      sentinel can collide with a real type name.
//   2. ONE WILDCARD CANNOT MEAN TWO THINGS. '*' was doing duty as both "any possible output" and
//      "whatever came in" — and under the old intersection test those were indistinguishable, so
//      nothing forced the question. The subset test below separates them immediately:
//          ANY as an OUTPUT  = "I may emit anything"      ⇒ NOT safe into a narrow consumer
//          ANY as an INPUT   = "I accept anything"        ⇒ always safe
//          VAR α             = a FREE VARIABLE, unbound ⇒ refuses, like any unchecked claim
//      This last line said "⇒ safe either side; this is the identity" until 2026-08-22, and that
//      was CD8: `α` was implemented as an endpoint MATCHER rather than a BINDING, so the identity
//      laundered forbidden hand-offs. The identity is no longer typed into existence at all — it
//      is a distinguished TERM (see IDENTITY TERMS below), so `α` here is only ever an ordinary
//      brick's unbound variable, and unknown refuses.
export const UNDECLARED = Object.freeze({ kind: 'undeclared' });
export const ANY = Object.freeze({ kind: 'any' });
export const TYPES = (...vs) => Object.freeze({ kind: 'types', values: [...new Set(vs.flat())] });
export const VAR = (name = 'α') => Object.freeze({ kind: 'var', name });

// Legacy forms still arrive from JSON, from older callers and from tests that poke raw arrays onto
// a brick after construction. Normalisation is total and idempotent, and runs at every comparison
// rather than only at construction, so a raw value assigned later cannot bypass it.
// NEVER FILTER. Changed 2026-08-22 on outside review (CD10/CD11), and the deleted `.filter()` is
// the whole point: it took input the normaliser could not read, dropped the parts it did not
// understand, and returned what was left as a well-formed DECLARATION. For an output endpoint the
// residue was usually `TYPES()` — the empty set — and under the subset rule
//
//     ∅ ⊆ X   holds for every X
//
// so the least readable input in the algebra produced the MOST permissive output endpoint in it.
// `{kind:'types', values:[1,2,3]}`, a bare `42`, `[null]` and `{}` all composed into a narrow
// consumer that a correct reading would have refused.
//
// This is `missing → *` again with a different carrier. The tagged form fixed the REPRESENTATION
// of the old bug and left its META-ERROR untouched: unknown or malformed evidence being
// canonicalised into a stronger claim than the input justified. Filtering is that error in one
// line — it silently converts "I could not parse this" into "this parsed, and it said nothing".
//
// So: a malformed end is UNDECLARED, and UNDECLARED refuses on either side. Only an EXPLICITLY
// supplied empty set still means "emits nothing", because that is a claim someone made.
export function norm(t) {
  if (t == null) return UNDECLARED;
  if (t === '*') return ANY;
  if (typeof t === 'string') return TYPES(t);
  if (Array.isArray(t)) {
    // all-or-nothing: one unreadable element makes the whole list unreadable
    if (!t.every((v) => typeof v === 'string')) return UNDECLARED;
    return t.includes('*') ? ANY : TYPES(t);
  }
  if (typeof t === 'object' && typeof t.kind === 'string') {
    switch (t.kind) {
      case 'undeclared': return UNDECLARED;
      case 'any': return ANY;
      // an unnamed variable is not "α by default" — defaulting a name INVENTS the binding the
      // whole CD8 finding is about
      case 'var': return typeof t.name === 'string' ? VAR(t.name) : UNDECLARED;
      case 'types': return Array.isArray(t.values) && t.values.every((v) => typeof v === 'string')
        ? TYPES(t.values) : UNDECLARED;
      default: return UNDECLARED;                         // an unknown tag is not a claim
    }
  }
  return UNDECLARED;                                      // numbers, booleans, kindless objects
}
const isDeclared = (t) => norm(t).kind !== 'undeclared';

// ---------------------------------------------------------------------------
// COMPATIBILITY — Option U, ruled 2026-08-22 on outside review.
//
//     a |> b   is feasible iff   OUT(a) ⊆ IN(b)
//
// A SUBSET, not a non-empty intersection. The old test asked whether the producer and consumer had
// *something* in common, which is a question about existence when the safety property is universal:
// every type the producer may emit has to be one the consumer accepts. That gap is CD6 — a
// coalition handing off on behalf of a member that could not have handed off itself.
//
// Rejected alternatives, recorded because the ruling only means something next to them:
//   MEET — make the coalition's contract the INTERSECTION of its parts. Sound, but it hides real
//          outputs: if a emits U and b emits T, saying (a&b) emits U∩T forgets behaviour rather
//          than constraining it.
//   ROUTED — keep the permissive test and have the certificate record WHICH member the hand-off
//          went to. Probably the better eventual system, and deliberately NOT the default yet:
//          without a route witness it is the same unsoundness wearing an optimistic interpretation.
//          It lands later as an explicit |route> carrying {member, emitted, consumer}.
// A FREE VARIABLE IS NOT POLYMORPHISM. This line used to read
//
//     if (O.kind === 'var' || I.kind === 'var') return true;            // α passes through
//
// and it was unsound (CD8, found on outside review 2026-08-22). `α → α` means "whatever concrete
// type enters THIS instance is the type that leaves it" — a binding. What the code implemented was
// "either endpoint mentioning α is compatible with everything", which is a different and much
// stronger claim, and it let the identity LAUNDER a forbidden hand-off:
//
//     x emits U · d accepts T          x |> d          = 0̲     (correct)
//     insert the identity              x |> id |> d    = LIVE   (11 of 64 endpoint pairs)
//
// So `id` was not an identity of the contracted algebra at all: it changed feasibility. The
// value-preservation law (CD4) was green throughout, because it only ever asked about the value.
//
// The fix is NOT a stricter endpoint matcher. Making `var` directional the way ANY is would break
// the identity law instead of the soundness, because a var OUTPUT is genuinely unknown until it is
// bound, and an identity has to be usable on the right. The real object is unify/substitute:
//
//     U → α    establishes    α := U    so    U → id → T    reduces to    U → U → T    and refuses
//
// That is a type system, and it is deliberately NOT being built today. Instead the identity is a
// DISTINGUISHED ALGEBRAIC ELEMENT (see composePipe / composeAnd): `a |> ID = a` by construction,
// so it cannot change feasibility because it does not participate in the check. An UNBOUND `var`
// on any ordinary brick is then what it always was — a claim with no binding to check it against —
// and unknown refuses, exactly like UNDECLARED.
function subsetOf(out, inn) {
  const O = norm(out), I = norm(inn);
  if (O.kind === 'undeclared' || I.kind === 'undeclared') return false;  // unknown refuses, either side
  if (O.kind === 'var' || I.kind === 'var') return false;                // unbound ⇒ unknown ⇒ refuse
  if (I.kind === 'any') return true;                                     // consumer accepts anything
  if (O.kind === 'any') return false;                                    // producer MAY emit anything
  return O.values.every((t) => I.values.includes(t));                    // set containment
}

// ---------------------------------------------------------------------------
// & — OUTPUTS JOIN, INPUTS MEET. The coalition emits whatever ANY part may emit (so nothing is
// forgotten), and safely accepts only what EVERY part accepts (so nothing is over-promised).
// The old code unioned both, which over-promised the input side in exactly the way CD6 describes.
//
// Undeclaredness is ABSORBING under both: a coalition one of whose parts declared no interface has
// no declared interface either. Without it the union launders the absence, and the hand-off the
// declared partner could make is silently made on the undeclared one's behalf (CD3).
// `var` is ABSORBING in both, for the same reason UNDECLARED is: an unbound variable is not a
// checkable claim, and a coalition one of whose members made an uncheckable claim has not made a
// checkable one either.
//
// This also repairs commutativity (CD9). `meetIn` used to return "the other operand" when it met a
// variable, so two differently-named free variables gave
//
//     (a & b).accepts_from = VAR β        (b & a).accepts_from = VAR α
//
// and & — the operator this project calls the parallel/coalitional one, and proves commutative —
// projected an operand-order-dependent interface. No verdict differed at the time, because `var`
// matched everything anyway, which is exactly why nothing caught it: it was a latent bug held
// harmless by a second bug. Absorbing to UNDECLARED is symmetric, so the projection is now
// order-independent by construction rather than by luck.
function joinOut(a, b) {
  const A = norm(a), B = norm(b);
  if (A.kind === 'undeclared' || B.kind === 'undeclared') return UNDECLARED;
  if (A.kind === 'var' || B.kind === 'var') return UNDECLARED;
  if (A.kind === 'any' || B.kind === 'any') return ANY;
  return TYPES(A.values, B.values);
}
function meetIn(a, b) {
  const A = norm(a), B = norm(b);
  if (A.kind === 'undeclared' || B.kind === 'undeclared') return UNDECLARED;
  if (A.kind === 'var' || B.kind === 'var') return UNDECLARED;
  if (A.kind === 'any') return B;                        // ANY is the identity of meet
  if (B.kind === 'any') return A;
  return TYPES(A.values.filter((t) => B.values.includes(t)));
}

// ---------------------------------------------------------------------------
// total constructors — a Brick may be handed a PARTIAL or GARBAGE value/array by an
// external caller; the operators must never throw (fail-closed, directive 1). We normalize
// every untrusted field through a total constructor: a non-object / error value floors to
// the identity V0(), and array fields are coerced so combine/chain can never hit a
// non-iterable. (See compose-law CX6.)
// ---------------------------------------------------------------------------
const asArr = (x) => (Array.isArray(x) ? x : x == null ? [] : [x]);
// A DEFAULT IS JUSTIFIED BY ABSENCE — and by nothing else. It may not overwrite, reinterpret, or
// sit quietly beside an explicit malformed assertion. This is the refinement of the non-laundering
// principle that CD10/CD11/CX7 established for the contract carrier, applied per-FIELD to the
// semantic one, and it is a genuinely different line from the one drawn before:
//
//     ABSENT           →  documented default        {} and {beta:0.9} are legitimate partials
//     PRESENT + VALID  →  preserved
//     PRESENT + INVALID→  0̲                          {beta:'high'}, {pi:'wat'}, {kappa:'false'}
//
// The old rule asked only "is this an object at all", so `{beta:'high'}` spread over V0()'s
// defaults, stayed LIVE, and handed `beta = NaN` downstream — where the floor could not test it
// because no beta_min had been required. `{pi:'not-a-phase'}` could leave a composite carrying a
// phase `phaseIdx` has no index for. Spreading over defaults is what made both survivable: the
// default was there to fill a hole and instead excused a wrong answer.
const isFiniteNum = (x) => typeof x === 'number' && Number.isFinite(x);
const FIELD_VALID = {
  n: isFiniteNum,
  beta: (x) => isFiniteNum(x) && x >= 0 && x <= 1,
  kappa: (x) => typeof x === 'boolean',
  denyDefault: (x) => typeof x === 'boolean',
  pi: (x) => x === null || PHASES.includes(x),
  iota: (x) => x === null || typeof x === 'string',
  psi: (x) => x === null || typeof x === 'string',
  sigma: Array.isArray,
  authority: Array.isArray,
  audit: Array.isArray,
};
// `undefined` counts as ABSENT (it is what a missing key reads as), `null` does NOT except where a
// field's domain includes it — `{n:null}` is an assertion that n is null, and n is a real number.
function invalidValueField(v) {
  for (const [k, ok] of Object.entries(FIELD_VALID)) {
    if (!(k in v) || v[k] === undefined) continue;                 // absent ⇒ default applies
    if (!ok(v[k])) return k;
  }
  return null;
}

function normValue(v) {
  // null / non-object / a chain-error sentinel ⇒ the identity Value (empty, feasible). The BRICK
  // built on such a value is annihilated (CX7); this only keeps the carrier total so that nothing
  // downstream has to null-check a field.
  if (v == null || typeof v !== 'object' || v.error) return V0();
  // Arrays are still coerced, because a free-monoid field is genuinely a container and `{sigma:42}`
  // is a shape error rather than a false claim — but the shape is now CHECKED above, so a
  // non-array sigma annihilates instead of being silently wrapped.
  return V({ ...v, sigma: asArr(v.sigma), authority: asArr(v.authority), audit: asArr(v.audit) });
}

// ---------------------------------------------------------------------------
// Brick + the distinguished elements.
// ---------------------------------------------------------------------------
export function Brick(p = {}) {
  const o = p && typeof p === 'object' ? p : {};
  return {
    id: typeof o.id === 'string' ? o.id : 'brick',
    holder: o.holder ?? null,
    // Contract ends are stored NORMALISED, so a brick always carries the tagged form regardless of
    // what a caller handed in. An absent (or null) field becomes {kind:'undeclared'} — it is NOT
    // defaulted to ANY; see the MISSING ≠ UNIVERSAL note above.
    contract: { accepts_from: norm(o.contract?.accepts_from), feeds_into: norm(o.contract?.feeds_into) },
    refusal: typeof o.refusal === 'string' ? o.refusal : null,
    // NOTE THE ABSENCE. Brick() deliberately does NOT read an `identity` field off its input, and
    // there is no way to construct a privileged term through it — see the IDENTITY TERMS block
    // below. A previous version of this constructor did copy one, and CD12 is the falsifier for
    // what that allowed.
    value: normValue(o.value),
    cost: o.cost ?? UNCERTIFIED_COST(),
    q: { ...Q0(), ...(o.q && typeof o.q === 'object' ? o.q : {}) },
    utility: typeof o.utility === 'number' ? o.utility : 0,
    laws: asArr(o.laws),
    floor: asArr(o.floor),
    // A value the runtime could not interpret makes the brick 0̲ (CX7). It used to floor to V0()
    // — the BENIGN identity value: feasible, acyclic, no conflict — so
    //
    //     "I cannot interpret this value"  became  "the harmless value"  and stayed LIVE.
    //
    // CX6 did not catch it and could not: CX6 asks for "0̲ or a valid Brick, never an exception",
    // and V0() is a valid Brick, so a fuzzer aimed at crashes was satisfied by the laundering.
    // Directive 1 says FAIL-CLOSED; the code had read it as DO-NOT-THROW. Not throwing is
    // necessary and is not sufficient — the floor for an uninterpretable value is 0̲.
    // Three carriers, one rule: unreadable evidence floors rather than defaulting to the most
    // favourable reading. `utility` is included because `typeof NaN === 'number'` and a NaN utility
    // silently poisons every ranking it enters.
    annihilated: !!o.annihilated || unreadableValue(o.value) || unreadableQ(o.q)
      // `undefined` is ABSENT and defaults to 0 — the additive identity of utility, and the LEAST
      // favourable value, so defaulting it claims nothing. `null` is an assertion that utility is
      // null, and utility is a number; same line the Value carrier draws for `{n:null}`.
      || !(o.utility === undefined ? true : typeof o.utility === 'number' && Number.isFinite(o.utility))
  };
}

// Absent, non-object, array, or error-sentinel. A PARTIAL object (`{beta:0.9}`) is deliberately NOT
// unreadable — its fields are readable and the rest take documented defaults, which is the total
// constructor CX6 tests. The line is between "incomplete" and "not a Value at all".
function unreadableValue(v) {
  if (v == null || typeof v !== 'object' || Array.isArray(v) || v.error) return true;
  // ...and now the per-FIELD half: a value that IS an object but carries an explicitly invalid
  // field is malformed evidence, not an incomplete one. See FIELD_VALID above (VX1–VX5).
  return invalidValueField(v) !== null;
}

// 0̲ — the absorbing zero of BOTH operators (an annihilated branch).
export const ZERO = Object.freeze(Brick({
  id: '0̲', annihilated: true,
  value: V({ sigma: ['annihilated'] }),
  cost: UNCERTIFIED_COST(),
  q: { confidence: 0, cost: Infinity, latency: Infinity },
  utility: 0
}));
export const isZero = (b) => !b || b === ZERO || b.annihilated === true;

// A zero that says WHY. Structurally a zero in every respect isZero() tests, so it absorbs and
// floors exactly like ZERO; it differs only in carrying the refusal reason out to a caller that
// wants to render it. A refusal the runtime cannot explain is a refusal nobody can act on.
const zeroBecause = (reason) => Object.freeze(Brick({
  id: '0̲', annihilated: true, refusal: reason,
  value: V({ sigma: ['annihilated'] }), cost: UNCERTIFIED_COST(),
  q: { confidence: 0, cost: Infinity, latency: Infinity }, utility: 0
}));

// &none — identity for &.   id — identity (typed pass-through) for |>.   Both cost nothing.
// Both DECLARE '*' explicitly, and that is load-bearing rather than incidental: under MISSING ≠
// UNIVERSAL an identity that merely omitted its contract would be undeclared, would refuse
// everything, and CA4/CP2 would fail. The identity laws survive the fix because these two make the
// universal CLAIM — which an identity is entitled to make — not because absence is treated as one.
// CD4 states both halves: identity on declared bricks, 0̲ on undeclared ones.
// &none is the TWO-SIDED identity of & under the new semantics, and now actually types as one:
// ANY is the identity of meet (inputs), the empty set is the identity of join (outputs). Under the
// old union-both rule no single value could be identity for both, and nothing noticed because CA4
// only compares the value carrier.
// ---------------------------------------------------------------------------
// IDENTITY TERMS — distinguished elements, not privileged bricks.
//
// A compose term is one of: a Brick, the |> identity, the & identity, or 0̲. The identities are
// SINGLETONS, frozen at module load, and recognised by REFERENCE. That is the whole mechanism, and
// it is chosen because reference identity is the one property a caller cannot forge by writing
// data.
//
// The previous design brandeded them with an ordinary `identity: '|>'` field on Brick(). The
// comment beside it correctly argued that comparing the NAME `'id'` would be forgeable — and then
// replaced a forgeable name with a forgeable FIELD, which is the same thing wearing a schema. An
// uncertified brick held by an attacker declared the privilege and both operators short-circuited
// past every floor they have (CD12).
//
// SERIALISABILITY AND AUTHENTICITY ARE DIFFERENT REQUIREMENTS, and conflating them is what caused
// this. The term must survive JSON — receipts, hashes, replay artifacts and WRL worlds all cross
// that boundary — but "must survive serialisation" never implied "ordinary data may assert
// privileged algebraic status". So the terms serialise to a CANONICAL TAG carrying nothing else:
//
//     {"kind":"pipe_identity"}        not   {"kind":"brick","identity":"|>","holder":"attacker",…}
//
// and `decodeTerm()` is the ONLY route from data back to the privilege. It reads the tag and
// returns the singleton, discarding whatever else the encoding claimed; anything that is not a
// bare tag becomes an ordinary Brick with no privilege at all.
const identityTerm = (kind, id, contract) =>
  Object.freeze({ ...Brick({ id, value: V0(), cost: FREE_COST(), q: Q0(), contract }), kind });

const AND_IDENTITY = identityTerm('and_identity', '&none', { accepts_from: ANY, feeds_into: TYPES() });
export const none = () => AND_IDENTITY;
// id is DISTINGUISHED (`identity: '|>'`), and still declares α → α so a receipt can say what it is.
// The contract is now documentation rather than the mechanism: composePipe short-circuits on the
// brand, so the identity never reaches subsetOf and therefore cannot change what a pipeline is
// allowed to do. That is the CD8 fix. It was previously an ORDINARY brick relying on `var`
// matching everything, which is what made `x |> id |> d` compose where `x |> d` refused.
const PIPE_IDENTITY = identityTerm('pipe_identity', 'id', { accepts_from: VAR('α'), feeds_into: VAR('α') });
export const idBrick = () => PIPE_IDENTITY;

// REFERENCE equality. Not the name (`'id'` is a string any caller may choose), not a field
// (`identity:'|>'` is data any caller may write) — the object itself. There is exactly one of each
// in a process, they are created here and nowhere else, and `decodeTerm` is the only door from
// serialised data to one of them.
const isIdentityFor = (b, op) => b === (op === '|>' ? PIPE_IDENTITY : AND_IDENTITY);

// The ONLY route from data to a privileged term. Everything that is not a bare canonical tag
// becomes an ordinary Brick — including an object that carries the tag AND a payload, because a
// term that also claims a holder, a cost and a contract is not the identity, it is something
// pretending to be it. Fails closed by construction rather than by check.
export function decodeTerm(j) {
  if (j && typeof j === 'object' && !Array.isArray(j)) {
    const keys = Object.keys(j);
    if (keys.length === 1 && keys[0] === 'kind') {
      if (j.kind === 'pipe_identity') return PIPE_IDENTITY;
      if (j.kind === 'and_identity') return AND_IDENTITY;
    }
  }
  return Brick(j);
}
// The canonical encoding: a tag and nothing else, so the decoder above accepts it.
export const encodeTerm = (t) =>
  t === PIPE_IDENTITY ? { kind: 'pipe_identity' }
  : t === AND_IDENTITY ? { kind: 'and_identity' }
  : t;

const holders = (a, b) => {
  // provenance is a SET of holders — flatten any already-composite holder so the union stays
  // flat and the operator stays associative & commutative (a nested holder breaks both laws).
  const flat = [a.holder, b.holder].flatMap((h) => (h == null ? [] : Array.isArray(h) ? h : [h]));
  const hs = [...new Set(flat)];
  return hs.length === 0 ? null : hs.length === 1 ? hs[0] : hs;
};

// ensure an operand is a well-formed brick before composing. A proper brick (incl. ZERO and the
// identity bricks) passes through untouched — preserving object identity so isZero(ZERO) holds;
// any partial/garbage operand is routed through the total Brick() constructor (fail-closed).
// CANONICALISE AT THE BOUNDARY. This used to be
//
//     const ensure = (x) => (isBrickShaped(x) ? x : Brick(x));
//
// and "looks brick-shaped" is a SHAPE test, not a validity one. A raw object carrying
// `value.beta = 'high'` satisfied it and went through untouched, so `Brick(raw)` was 0̲ while
// `raw |> ID` was LIVE — the constructor was correct and the operator boundary went around it
// (CD13). Mutating a legitimate brick after construction did the same, because bricks are mutable
// and nothing re-checked on the way in.
//
// Every operand is now canonicalised. `Brick()` is idempotent on an already-canonical brick and it
// re-runs the field validation, so this closes the raw-object route and the mutate-after-construct
// route with one rule instead of two. The identity TERMS are returned by reference because they are
// frozen singletons that cannot have been mutated — they are the only objects exempt, and they are
// exempt because they are provably unchanged, not because they looked right.
const isBrickShaped = (x) =>
  x && typeof x === 'object' && x.contract && x.value && Array.isArray(x.value.sigma) && x.cost && x.q && typeof x.id === 'string';
const ensure = (x) => (x === PIPE_IDENTITY || x === AND_IDENTITY ? x : Brick(x));

// The floor every operator shares: a composed value that still carries an unresolved conflict, a
// cycle, or an uncertified cost collapses to 0̲ — utility cannot resurrect it.
function floored(value, cost, floorReqs) {
  if (cost.verdict.certified === false) return true;             // uncertified ⇒ 0̲ (conservative rule)
  const req = Object.assign({ sigma_empty: true, acyclic: true }, floorReqs || {});
  return !consume(value, req).ok;                                // forbidden / cyclic / unresolved ⇒ 0̲
}

// ---------------------------------------------------------------------------
// &  — combine (parallel). Lattice merge of capabilities; holder-tagged; cost & quantities accrue.
// ---------------------------------------------------------------------------
export function composeAnd(a, b) {
  a = ensure(a); b = ensure(b);                                 // canonicalise, THEN test — see composePipe
  if (isZero(a) || isZero(b)) return ZERO;                       // 0̲ absorbs
  // &none is the identity BY CONSTRUCTION — see composePipe for the argument.
  if (isIdentityFor(b, '&')) return a;
  if (isIdentityFor(a, '&')) return b;
  const value = combine(a.value, b.value);
  const cost = composeCost(a.cost, b.cost);
  if (floored(value, cost)) return zeroBecause(cost.verdict.certified === false ? 'uncertified' : 'floor');
  return Brick({
    id: `(${a.id} & ${b.id})`,
    holder: holders(a, b),
    contract: { accepts_from: meetIn(a.contract.accepts_from, b.contract.accepts_from),
                feeds_into: joinOut(a.contract.feeds_into, b.contract.feeds_into) },
    value,
    cost,
    q: composeQ(q(a), q(b)),
    utility: a.utility + b.utility,
    laws: [...new Set([...a.laws, ...b.laws, 'CC2.&'])],
    floor: [...new Set([...a.floor, ...b.floor])]
  });
}

// ---------------------------------------------------------------------------
// |> — pipeline (sequence). Governed, phase-graded, type-checked hand-off. The operator CC1 left
// lawless. A type mismatch, a backward phase, or an uncertified/forbidden step IS the zero.
// ---------------------------------------------------------------------------
export function composePipe(a, b) {
  // CANONICALISE, THEN TEST. The zero check used to run FIRST, against the operand as handed in —
  // so a mutated brick whose `annihilated` flag was still false from construction passed it, and
  // the canonicalisation that would have caught it happened on the next line with nothing left to
  // re-check. `Brick(victim)` was 0̲ and `partner |> victim` was LIVE. Found by this repo's own
  // mutation gate after CD13 fixed only the other half of the boundary.
  a = ensure(a); b = ensure(b);                                 // total operands ⇒ never throw
  if (isZero(a) || isZero(b)) return ZERO;                       // 0̲ absorbs
  // ID IS A DISTINGUISHED ELEMENT: `a |> ID = a`, returning the operand ITSELF rather than a copy
  // that has been through the contract check. This is the CD8 fix, and it is the whole of it —
  // an element that does not participate in feasibility cannot change feasibility, which is what
  // "identity of this algebra" has to mean and what `α`-as-universal-matcher never delivered.
  //
  // It also TOTALISES the identity. CD4b used to state a deliberately narrowed domain — id
  // composed with an UNDECLARED brick was 0̲ — but that narrowing existed only because id was an
  // ordinary brick whose contract had to be consulted. `a |> ID = a` is sound for undeclared `a`
  // too: the result IS `a`, it has gained nothing, and it will refuse at its next real hand-off
  // exactly as before. CD4b is restated rather than deleted.
  if (isIdentityFor(b, '|>')) return a;
  if (isIdentityFor(a, '|>')) return b;
  if (!subsetOf(a.contract.feeds_into, b.contract.accepts_from)) {
    // Two distinct refusals, deliberately not collapsed: a MISMATCH is two declared interfaces that
    // disagree — a fact about the parts. An UNDECLARED side is the absence of a fact, and the fix
    // that produced it is the one an operator most needs to see named.
    return zeroBecause(isDeclared(a.contract.feeds_into) && isDeclared(b.contract.accepts_from)
      ? 'contract-mismatch' : 'contract-undeclared');
  }
  const chained = chain(a.value, b.value);
  if (chained.error) return zeroBecause('phase-violation');     // π-violation (backward phase) ⇒ 0̲
  const cost = composeCost(a.cost, b.cost);
  if (floored(chained, cost)) return zeroBecause(cost.verdict.certified === false ? 'uncertified' : 'floor');
  return Brick({
    id: `(${a.id} |> ${b.id})`,
    holder: holders(a, b),
    contract: { accepts_from: a.contract.accepts_from, feeds_into: b.contract.feeds_into }, // external interface
    value: chained,
    cost,
    q: composeQ(q(a), q(b)),
    utility: a.utility + b.utility,
    laws: [...new Set([...a.laws, ...b.laws, 'CC2.|>'])],
    floor: [...new Set([...a.floor, ...b.floor])]
  });
}

// ---------------------------------------------------------------------------
// composeTree — fold an AST of { op:'&'|'|>', a, b } (leaves are bricks) into one brick.
// ---------------------------------------------------------------------------
export function composeTree(node) {
  if (!node || node.op == null) return node;                    // leaf brick (or null)
  const a = composeTree(node.a), b = composeTree(node.b);
  return node.op === '&' ? composeAnd(a, b)
       : node.op === '|>' ? composePipe(a, b)
       : (() => { throw new Error(`unknown compose op: ${node.op}`); })();
}

export default { Brick, ZERO, isZero, none, idBrick, composeAnd, composePipe, composeTree,
                 UNDECLARED, ANY, TYPES, VAR, norm, decodeTerm, encodeTerm };
