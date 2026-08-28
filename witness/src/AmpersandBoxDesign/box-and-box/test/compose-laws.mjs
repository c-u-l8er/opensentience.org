// test/compose-laws.mjs — run: `node test/compose-laws.mjs`
// CC2 §2 conformance for the compose runtime (COMPOSE_RUNTIME.md §2–4): the two brick
// operators are the real algebra. & is a commutative idempotent monoid on the capability
// lattice (identity &none); |> is a non-commutative monoid on a forward phase order
// (identity id) whose infeasible hand-offs ARE the absorbing zero 0̲. Both share one floor
// and accrue the CC2 semiring quantities (confidence ×, cost +, latency max).
//
// Same property-test harness as the 103 stated laws in test/laws.mjs: trial(n,body) returns
// true or a counter-example tag; runSet folds a suite; N=2000 trials/law; exit(fail?1:0).
// Suites: CA (&), CP (|>), CX (floor/semiring/cost-lattice/closure/fail-closed), CD (contracts).
// Totals and id ranges are DERIVED at print time — never typed here.
import { V, V0, PHASES, phaseIdx, combine, consume } from '../value.mjs';
import { Brick, ZERO, isZero, none, idBrick, composeAnd, composePipe, composeTree,
         UNDECLARED, ANY, TYPES, VAR, norm, decodeTerm, encodeTerm,
         admitted, presentedFor, authenticatedFor, createAttestationAuthority,
         createComposeRuntime, isAttested, trusted, ingestFrame, ingestJSON, canonBytes,
         TERM_BUDGET } from '../compose.mjs';

// THE ATTESTATION AUTHORITY IS MINTED ONCE PER REALM, and this suite is one realm — so it is claimed
// here, at the top, exactly as an application would claim it at bootstrap. `attest(cert)` used to be
// a free export; CERT12 is the law that it no longer is.
const AUTH = createAttestationAuthority({ name: 'compose-law-suite', verify: () => true });
// Attestation now binds to an EXACT subject, so the helper never has to guess one.
const attest = (cert) => AUTH.verifyAndAttest(cert, { kind: cert.subject.kind, hash: cert.subject.hash });
// ...and a brick that must satisfy an `authenticated` floor has to declare WHAT IT IS, or the
// certificate has nothing to bind to (CERT9).
const boundTo = (cert) => ({ kind: cert.subject.kind, hash: cert.subject.hash });

// ---------------------------------------------------------------------------
// SEEDED RANDOMNESS. `Math.random()` was unseeded, so a falsifier printed by this suite could not be
// replayed — and `verify.sh` ran the suite FOUR times per report (once for pass/fail, once to scrape
// the total, once for the gap count, once inside law-manifest.mjs), which meant a single verification
// report was assembled from four DIFFERENT random experiments. For a project whose subject is
// evidence, that is the wrong shape twice over: it is slow, and the numbers in one report do not all
// come from the same run.
//
//     node test/compose-laws.mjs              # random seed, printed
//     SEED=123456 node test/compose-laws.mjs  # replay that exact run
//
// mulberry32 — small, fast, and deterministic. Math.random is REPLACED rather than shadowed so the
// helpers already written against it (pick, rnd, randBrick, …) need no change and cannot accidentally
// keep using the unseeded source.
// guarded for the same reason as test/laws.mjs line ~31: these modules are imported in a browser.
const SEED = (typeof process !== 'undefined' && process.env && process.env.SEED)
  ? (Number(process.env.SEED) >>> 0) : ((Math.random() * 0x100000000) >>> 0);
{
  let a = (SEED + 0x6D2B79F5) >>> 0;
  Math.random = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = (a, b) => a + Math.random() * (b - a);
const approx = (a, b, t = 1e-7) => a === b || (isFinite(a) && isFinite(b) && Math.abs(a - b) <= t * (1 + Math.abs(a) + Math.abs(b)));
const setEq = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
const arrEq = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const sample = (arr) => arr.filter(() => Math.random() < 0.5);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

// equality on the value carrier (same as laws.mjs valEq — the algebraic lattice)
function valEq(a, b) {
  return approx(a.n, b.n) && a.kappa === b.kappa && approx(a.beta, b.beta) && setEq(a.sigma, b.sigma)
    && a.pi === b.pi && a.iota === b.iota && a.psi === b.psi && arrEq(a.authority, b.authority)
    && a.denyDefault === b.denyDefault && arrEq(a.audit, b.audit);
}
// the commutative sub-carrier of combine (n,κ,β,σ,deny) — the families that ARE commutative
// (π/ι/ψ/authority/audit are first-non-null / concat, so & is not globally commutative).
function valCommEq(a, b) {
  return approx(a.n, b.n) && a.kappa === b.kappa && approx(a.beta, b.beta) && setEq(a.sigma, b.sigma) && a.denyDefault === b.denyDefault;
}
const qEq = (a, b) => approx(a.confidence, b.confidence) && approx(a.cost, b.cost) && approx(a.latency, b.latency);
const hset = (h) => (h == null ? [] : Array.isArray(h) ? [...h] : [h]);
const holdersEq = (a, b) => setEq(hset(a.holder), hset(b.holder));
const asSet = (t) => (t == null ? [] : Array.isArray(t) ? t : [t]);
// Contract ends are tagged objects now, so compare them structurally. asSet() on a {kind:...}
// object yields [object] and every comparison silently succeeded — a helper that cannot fail
// is not a check.
const endEq = (x, y) => { const A = norm(x), B = norm(y);
  if (A.kind !== B.kind) return false;
  if (A.kind === 'types') return setEq(A.values, B.values);
  if (A.kind === 'var') return A.name === B.name;
  return true; };
const contractEq = (a, b) => endEq(a.contract.accepts_from, b.contract.accepts_from) && endEq(a.contract.feeds_into, b.contract.feeds_into);
const costClass = (b) => b.cost?.verdict?.costClass;

// a certified cost certificate of a given class (duck-typed; what compose.mjs reads).
const certOf = (cc = 'poly') => ({
  subject: { kind: 'weave-ir', hash: 'h' + ((Math.random() * 1e6) | 0) },
  analyzer: { name: 'test', version: '0' },
  verdict: { certified: true, costClass: cc, ealDepth: cc === 'poly' ? 1 : cc === 'exponential' ? 2 : 3 },
  policy: { resourceDecision: cc === 'poly' ? 'allow' : cc === 'tower' ? 'escalate' : 'budget_check', reason: 'test' }
});
const uncertCert = () => ({
  subject: { kind: 'weave-ir', hash: 'u' + ((Math.random() * 1e6) | 0) },
  analyzer: { name: 'test', version: '0' },
  verdict: { certified: false, costClass: 'unknown' },
  policy: { resourceDecision: 'annihilate', reason: 'uncertified' }
});

const TAGS = ['raw', 'mid', 'out', 'aux'];
// a FEASIBLE certified brick: sigma empty + κ false ⇒ passes the shared floor. The value carrier
// uses no n/authority/audit so combine(v,v)==v (the lattice on which & is idempotent — cost &
// quantities still accrue, which is correct and tested separately).
function randBrick(opts = {}) {
  const pi = opts.pi !== undefined ? opts.pi : (Math.random() < 0.5 ? null : pick(PHASES));
  const tags = () => (Math.random() < 0.4 ? '*' : sample(TAGS));
  return Brick({
    id: 'b' + ((Math.random() * 1e6) | 0),
    holder: Math.random() < 0.5 ? 'h' + ((Math.random() * 3) | 0) : null,
    contract: { accepts_from: opts.wild ? '*' : tags(), feeds_into: opts.wild ? '*' : tags() },
    value: V({ beta: +Math.random().toFixed(3), kappa: false, sigma: [], pi }),
    cost: certOf(opts.cc || pick(['poly', 'poly', 'elementary', 'exponential'])),
    q: { confidence: +rnd(0.2, 1).toFixed(3), cost: +rnd(0, 5).toFixed(2), latency: +rnd(0, 5).toFixed(2) },
    utility: +rnd(0, 10).toFixed(2)
  });
}
// a wild-contract brick with a fixed phase — for |> laws where we isolate the phase order.
const pipeBrick = (pi) => randBrick({ wild: true, pi });

function trial(n, body) {
  for (let i = 0; i < n; i++) { const r = body(); if (r !== true) return { pass: false, cex: r, at: i + 1 }; }
  return { pass: true, at: n };
}

// ---------------- & — COMBINE (parallel): commutative idempotent monoid on the lattice ---------
const COMB = [
  ['CA1', '& associative (carrier+quantities+cost)', (n) => trial(n, () => {
    const a = randBrick(), b = randBrick(), c = randBrick();
    const l = composeAnd(composeAnd(a, b), c), r = composeAnd(a, composeAnd(b, c));
    if (isZero(l) || isZero(r)) return 'unexpectedly-floored';
    return valEq(l.value, r.value) && holdersEq(l, r) && contractEq(l, r) && qEq(l.q, r.q) && costClass(l) === costClass(r) ? true : 'assoc'; })],
  ['CA2', '& commutative on the capability lattice', (n) => trial(n, () => {
    const a = randBrick(), b = randBrick();
    const x = composeAnd(a, b), y = composeAnd(b, a);
    if (isZero(x) || isZero(y)) return 'floored';
    return valCommEq(x.value, y.value) && holdersEq(x, y) && contractEq(x, y) && qEq(x.q, y.q) && costClass(x) === costClass(y) ? true : 'comm'; })],
  ['CA3', '& idempotent on the lattice (value carrier)', (n) => trial(n, () => {
    const a = randBrick();
    const aa = composeAnd(a, a);
    if (isZero(aa)) return 'floored';
    return valEq(aa.value, a.value) ? true : 'idem'; })],
  ['CA4', '&none identity (both sides)', (n) => trial(n, () => {
    const a = randBrick();
    const l = composeAnd(a, none()), r = composeAnd(none(), a);
    if (isZero(l) || isZero(r)) return 'floored';
    return valEq(l.value, a.value) && valEq(r.value, a.value) ? true : 'identity'; })]
];

// ---------------- |> — PIPELINE (sequence): non-commutative monoid on the forward phase order ---
const PIPE = [
  ['CP1', '|> associative where feasible', (n) => trial(n, () => {
    // forward (non-decreasing) phases ⇒ every chain is defined
    const [i, j, k] = [0, 0, 0].map(() => (Math.random() * PHASES.length) | 0).sort((x, y) => x - y);
    const a = pipeBrick(PHASES[i]), b = pipeBrick(PHASES[j]), c = pipeBrick(PHASES[k]);
    const l = composePipe(composePipe(a, b), c), r = composePipe(a, composePipe(b, c));
    if (isZero(l) || isZero(r)) return 'unexpectedly-zero';
    return valEq(l.value, r.value) && contractEq(l, r) && qEq(l.q, r.q) ? true : 'chain-assoc'; })],
  ['CP2', 'id identity (both sides)', (n) => trial(n, () => {
    const a = pipeBrick(pick(PHASES));
    const l = composePipe(a, idBrick()), r = composePipe(idBrick(), a);
    if (isZero(l) || isZero(r)) return 'zero';
    return valEq(l.value, a.value) && valEq(r.value, a.value) ? true : 'identity'; })],
  ['CP3', '|> non-commutative (backward phase ⇒ 0̲, forward survives)', (n) => trial(n, () => {
    let i = (Math.random() * PHASES.length) | 0, j = (Math.random() * PHASES.length) | 0;
    if (i === j) j = (j + 1) % PHASES.length;
    const lo = Math.min(i, j), hi = Math.max(i, j);
    const a = pipeBrick(PHASES[lo]), b = pipeBrick(PHASES[hi]);
    const fwd = composePipe(a, b), bwd = composePipe(b, a);
    return (!isZero(fwd) && isZero(bwd)) ? true : 'commuted'; })],
  ['CP4', 'infeasible hand-off (type mismatch) ⇒ 0̲', (n) => trial(n, () => {
    // disjoint, non-wildcard contracts so feeds_into ∩ accepts_from = ∅
    const a = randBrick({ pi: 'retrieve' }); a.contract.feeds_into = ['X' + ((Math.random() * 3) | 0)];
    const b = randBrick({ pi: 'act' }); b.contract.accepts_from = ['Y' + ((Math.random() * 3) | 0)];
    return isZero(composePipe(a, b)) ? true : 'fed-through'; })]
];

// ---------------- shared floor, absorbing 0̲, the CC2 semiring, the cost lattice, closure --------
const CROSS = [
  ['CX1', '0̲ absorbs both operators (both sides)', (n) => trial(n, () => {
    const a = randBrick({ wild: true });
    return isZero(composeAnd(a, ZERO)) && isZero(composeAnd(ZERO, a))
      && isZero(composePipe(a, ZERO)) && isZero(composePipe(ZERO, a)) ? true : 'leaked'; })],
  ['CX2', 'quantity semiring (confidence ×, cost +, latency max)', (n) => trial(n, () => {
    const a = pipeBrick('retrieve'), b = pipeBrick('act');
    const want = { confidence: a.q.confidence * b.q.confidence, cost: a.q.cost + b.q.cost, latency: Math.max(a.q.latency, b.q.latency) };
    const and = composeAnd(a, b), pipe = composePipe(a, b);
    if (isZero(and) || isZero(pipe)) return 'zero';
    return qEq(and.q, want) && qEq(pipe.q, want) ? true : 'semiring'; })],
  ['CX3', 'conservative cost: an uncertified child ⇒ composite 0̲', (n) => trial(n, () => {
    const a = randBrick({ wild: true });
    const bad = Brick({ id: 'u', contract: { accepts_from: '*', feeds_into: '*' }, value: V({ beta: 0.9, kappa: false, sigma: [] }), cost: uncertCert() });
    return isZero(composeAnd(a, bad)) && isZero(composePipe(a, bad)) && isZero(composePipe(bad, a)) ? true : 'uncertified-survived'; })],
  ['CX4', 'cost-class lattice: certified composite = worst class', (n) => trial(n, () => {
    const ORDER = ['poly', 'elementary', 'exponential', 'tower'];
    const ca = pick(ORDER), cb = pick(ORDER);
    const worst = ORDER[Math.max(ORDER.indexOf(ca), ORDER.indexOf(cb))];
    const a = randBrick({ wild: true, cc: ca }), b = randBrick({ wild: true, cc: cb });
    const and = composeAnd(a, b);
    if (isZero(and)) return 'floored';
    return and.cost.verdict.certified === true && costClass(and) === worst ? true : `expected ${worst}, got ${costClass(and)}`; })],
  ['CX5', 'closure: a composite is a re-composable brick', (n) => trial(n, () => {
    const a = pipeBrick('act'), b = pipeBrick('act'), c = pipeBrick('act');
    const ab = composeAnd(a, b);
    if (isZero(ab)) return 'floored';
    const isBrick = (x) => x && x.value && x.cost && x.contract && x.q && typeof x.id === 'string';
    if (!isBrick(ab)) return 'not-a-brick';
    // fold an AST whose leaf is itself a composite ⇒ the closure property end to end
    const tree = composeTree({ op: '|>', a: { op: '&', a, b }, b: c });
    return (isBrick(tree) && !isZero(tree)) ? true : 're-compose-failed'; })],
  ['CX6', 'fail-closed: a malformed/partial child ⇒ 0̲ or a valid Brick, never an exception', (n) => trial(n, () => {
    // a fuzzer of partial + garbage operands — the threat directive 1 forbids: a throw where
    // 0̲ (or a normalized Brick) is the correct answer. Covers both the Brick() entry point
    // (partial params, B3's repro shape) and raw non-brick operands passed straight to the ops.
    const garbageVal = () => pick([
      { beta: 0.9 },                       // partial Value (B3): missing sigma/authority/audit
      { sigma: 42 },                       // non-iterable array field
      { beta: 'high', kappa: 1, sigma: null },
      'not-an-object', 42, null, undefined, [], { error: 'π-violation' },
      { authority: 'x', audit: 7, n: NaN }
    ]);
    const garbageBrickParams = () => pick([
      { id: 7, value: garbageVal(), cost: { rung: 1 }, q: 'nope', laws: 5, floor: 0 },
      { value: garbageVal() },
      { value: garbageVal(), cost: garbageVal() },
      garbageVal(),                        // the whole param object is garbage
      undefined
    ]);
    // operands: half via the public constructor (with garbage params), half raw garbage objects
    const mk = () => (Math.random() < 0.5 ? Brick(garbageBrickParams()) : garbageVal());
    const isBrick = (x) => x && typeof x === 'object' && x.value && x.cost && x.contract && x.q && typeof x.id === 'string';
    const ok = (x) => isZero(x) || isBrick(x);
    try {
      const a = mk(), b = mk(), c = mk();
      if (!ok(composeAnd(a, b))) return 'and-not-brick-or-zero';
      if (!ok(composePipe(a, b))) return 'pipe-not-brick-or-zero';
      if (!ok(composeTree({ op: '|>', a: { op: '&', a, b }, b: c }))) return 'tree-not-brick-or-zero';
      // and the original B3 repro shape specifically resolves (here: uncertified cost ⇒ 0̲)
      const r = composeAnd(Brick({ id: 'a', value: { beta: 0.9 }, cost: { rung: 1 }, q: {} }),
                           Brick({ id: 'b', value: { beta: 0.8 }, cost: { rung: 1 }, q: {} }));
      return ok(r) ? true : 'b3-repro-not-resolved';
    } catch (e) {
      return `threw:${e.constructor.name}:${e.message}`;
    }
  })],

  // CX7, added 2026-08-22 on outside review, and the reason CX6 was not enough. CX6 asks that a
  // malformed operand produce "0̲ or a valid Brick, never an exception" — and `V0()` is a valid
  // Brick, so a fuzzer aimed at crashes was fully satisfied by the laundering. Directive 1 said
  // FAIL-CLOSED and the code read it as DO-NOT-THROW; those are not the same instruction.
  //
  //     "I cannot interpret this value"   ->   V0()   ->   feasible, acyclic, no conflict, LIVE
  //
  // which is the semantic twin of `missing -> *`: an absence of evidence canonicalised into a
  // benign, permissive claim. Never throwing is necessary; it is not sufficient. The correct
  // floor for an uninterpretable value is 0̲, not the identity.
  ['CX7', 'a malformed semantic value cannot normalize to LIVE — unknown floors to 0̲, not to V0', (n) => trial(n, () => {
    const malformed = pick(['garbage', 42, true, [], { error: 'π-violation' }, { error: true }]);
    const declared = { accepts_from: ANY, feeds_into: ANY };
    const a = Brick({ id: 'm', value: malformed, cost: certOf('poly'),
                      q: { confidence: 0.9, cost: 1, latency: 1 }, contract: declared });
    const b = declBrick({ contract: declared });
    if (!isZero(a)) return `a brick built on ${JSON.stringify(malformed)} is itself LIVE`;
    if (!isZero(composePipe(a, b))) return `${JSON.stringify(malformed)} |> declared = LIVE`;
    if (!isZero(composeAnd(a, b))) return `${JSON.stringify(malformed)} & declared = LIVE`;
    return true; })]
];

// ---------------- CD — CONTRACT DECLARATION: missing ≠ universal ---------------------------------
// Written as FALSIFIERS on 2026-08-22, against unfixed code, and all five failed. The bug: Brick()
// defaulted an absent contract field to '*', and typeMatch() additionally waved through null/undefined
// on either side. An assembly that declared no interface at all therefore received the MOST PERMISSIVE
// interface in the algebra, and every hand-off passed a check that had nothing to check.
//
// The distinction these laws pin: an explicit '*' is a CLAIM ("I accept anything") and must keep
// composing. An absent field is UNKNOWN, and unknown must refuse. CD2/CD4a exist so the fix cannot be
// "refuse everything" — the identity laws are preserved DELIBERATELY (none()/idBrick() DECLARE '*'),
// not accidentally, and CD4b states the narrowed domain as its own law rather than leaving it implicit.
const declBrick = (o) => Brick({
  id: o.id || 'd' + ((Math.random() * 1e6) | 0),
  contract: o.contract,                                   // pass `undefined` to declare nothing
  value: V({ beta: +Math.random().toFixed(3), kappa: false, sigma: [], pi: o.pi ?? null }),
  cost: certOf('poly'),
  q: { confidence: +rnd(0.2, 1).toFixed(3), cost: +rnd(0, 5).toFixed(2), latency: +rnd(0, 5).toFixed(2) },
  utility: +rnd(0, 10).toFixed(2)
});
const isDeclared = (t) => norm(t).kind !== 'undeclared';
const DECL = [
  ['CD1', 'an UNDECLARED feeds_into is NOT a wildcard: undeclared |> narrow ⇒ 0̲', (n) => trial(n, () => {
    const tag = 'T' + ((Math.random() * 4) | 0);
    const a = declBrick({ pi: 'retrieve' });                                    // no contract at all
    const b = declBrick({ pi: 'act', contract: { accepts_from: [tag], feeds_into: '*' } });
    return isZero(composePipe(a, b)) ? true
      : `undeclared feeds_into composed into accepts_from=[${tag}] (stored: ${JSON.stringify(a.contract.feeds_into)})`; })],
  // RESTATED 2026-08-22 when Option U landed. It used to read "an explicit '*' IS a wildcard and
  // still composes", tested with ANY on the PRODUCER side into a narrow consumer — and under a
  // subset rule that case must now REFUSE, because a producer that may emit anything is not safe
  // into a consumer that accepts only T. The law was encoding the old intersection test.
  //
  // What it protects is unchanged and is the whole point of CD1–CD5: MISSING ≠ UNIVERSAL has to
  // have content in both directions, or the fix degenerates into "refuse everything". Part (c) is
  // the sharp end — a declared narrow type passes into an ANY consumer, and an UNDECLARED one does
  // not, at the same call site. That difference is the entire claim.
  ['CD2', 'ANY is DIRECTIONAL, and still distinguishable from absence in both directions', (n) => trial(n, () => {
    const tag = 'T' + ((Math.random() * 4) | 0);
    const anyIn  = declBrick({ pi: 'act', contract: { accepts_from: ANY, feeds_into: ANY } });
    const narrow = declBrick({ pi: 'act', contract: { accepts_from: TYPES(tag), feeds_into: TYPES(tag) } });
    const anyOut = declBrick({ pi: 'retrieve', contract: { accepts_from: ANY, feeds_into: ANY } });
    const undecl = declBrick({ pi: 'retrieve' });
    // (a) a declared narrow producer into an ANY consumer: safe, composes.
    if (isZero(composePipe(narrow, anyIn))) return 'narrow-into-ANY-refused';
    // (b) an ANY producer into a narrow consumer: NOT safe under the subset rule.
    if (!isZero(composePipe(anyOut, narrow))) return 'ANY-out-into-narrow-composed (subset rule not applied)';
    // (c) the distinction that MISSING ≠ UNIVERSAL rests on: same consumer, same position —
    //     declared passes, undeclared does not.
    return isZero(composePipe(undecl, anyIn)) ? true : 'undeclared-passed-where-only-declared-should'; })],
  ['CD3', '& does not launder undeclaredness into a declared interface', (n) => trial(n, () => {
    const tag = 'T' + ((Math.random() * 4) | 0);
    const a = declBrick({ pi: 'act' });                                         // undeclared
    const b = declBrick({ pi: 'act', contract: { accepts_from: '*', feeds_into: [tag] } });
    const ab = composeAnd(a, b);
    if (isZero(ab)) return true;                                                // refusing outright is also sound
    if (isDeclared(ab.contract.feeds_into)) return `(a&b).feeds_into = ${JSON.stringify(ab.contract.feeds_into)} — a's absence was laundered by b`;
    const c = declBrick({ pi: 'consolidate', contract: { accepts_from: [tag], feeds_into: '*' } });
    return isZero(composePipe(ab, c)) ? true : 'coalition handed off on behalf of an undeclared member'; })],
  // RESTATED 2026-08-22, when CD8 made the identity a distinguished element. The previous CD4 had
  // a part (b) asserting a NARROWED DOMAIN — `id |> undeclared` had to be 0̲ — and that narrowing
  // was never a property anybody wanted. It was the shadow of id being an ordinary brick whose
  // contract got checked like any other: an undeclared partner failed the check, so the identity
  // annihilated, and the suite wrote the artifact down as though it were the intent.
  //
  // `a |> ID = a` is now true for EVERY a, undeclared included, and that is sound in the only way
  // that matters: the result IS `a`. It has gained no interface it did not have, and it refuses at
  // its next real hand-off exactly as it did before. A law that pinned the workaround is replaced
  // by one that pins the property — totality, and returning the operand rather than a copy.
  ['CD4', 'id is a TOTAL two-sided identity of |> and returns the operand itself, declared or not', (n) => trial(n, () => {
    const pi = pick(PHASES);
    const subject = pick([
      declBrick({ pi, contract: { accepts_from: '*', feeds_into: '*' } }),   // declared
      declBrick({ pi, contract: { accepts_from: [ 'T' ], feeds_into: [ 'U' ] } }),
      declBrick({ pi }),                                                     // UNDECLARED — was outside the old domain
    ]);
    const l = composePipe(subject, idBrick()), r = composePipe(idBrick(), subject);
    if (isZero(l) || isZero(r)) return 'identity annihilated a live operand';
    if (!(valEq(l.value, subject.value) && valEq(r.value, subject.value))) return 'identity-not-value-preserving';
    // and it must not hand back a brick whose CONTRACT has drifted — that would be a laundering
    // route of its own, and is precisely what CD8 caught the old identity doing
    const same = (x) => JSON.stringify(norm(x.contract.accepts_from)) === JSON.stringify(norm(subject.contract.accepts_from))
                     && JSON.stringify(norm(x.contract.feeds_into)) === JSON.stringify(norm(subject.contract.feeds_into));
    return same(l) && same(r) ? true : 'identity returned a brick with a different contract'; })],
  // RESTATED 2026-08-22 alongside CD4, and the correction is worth stating plainly because the old
  // law asserted the bug. Its middle line required
  //
  //     isZero(varProd |> consumer) === false        // "VAR failed to pass through"
  //
  // — that is, it required a free variable on an ORDINARY brick to compose with a narrow consumer.
  // That is not polymorphism; it is universal compatibility wearing a Greek letter, and CD8 showed
  // it laundering forbidden hand-offs in 11 of 64 endpoint pairs. A law can encode a defect as a
  // requirement and go green forever; this one did.
  //
  // What survives is the real distinction CD6 exposed — ANY is DIRECTIONAL — plus the correction:
  // the identity is a distinguished element, not a var-typed brick, and an unbound var refuses.
  ['CD7', 'ANY is directional; an UNBOUND var is unknown and refuses; the identity is distinguished, not var-typed', (n) => trial(n, () => {
    const tag = 'T' + ((Math.random() * 4) | 0);
    const consumer = declBrick({ pi: 'act', contract: { accepts_from: TYPES(tag), feeds_into: ANY } });
    const anyProd  = declBrick({ pi: 'retrieve', contract: { accepts_from: ANY, feeds_into: ANY } });
    const varProd  = declBrick({ pi: 'retrieve', contract: { accepts_from: VAR('α'), feeds_into: VAR('α') } });
    const anyCons  = declBrick({ pi: 'act', contract: { accepts_from: ANY, feeds_into: ANY } });
    // ANY as an OUTPUT is a claim to emit anything ⇒ not safe into a narrow consumer
    if (!isZero(composePipe(anyProd, consumer))) return 'ANY output behaved as a passthrough';
    // ANY as an INPUT accepts anything ⇒ always safe
    if (isZero(composePipe(declBrick({ pi: 'retrieve', contract: { accepts_from: ANY, feeds_into: TYPES(tag) } }), anyCons)))
      return 'ANY input refused a concrete producer';
    // an unbound var on an ordinary brick is UNKNOWN, and unknown refuses — either side
    if (!isZero(composePipe(varProd, consumer))) return 'an unbound VAR passed through as universal';
    if (!isZero(composePipe(anyProd, varProd))) return 'an unbound VAR accepted as universal';
    // ...and the identity is not reached by that rule at all, because it is a distinguished TERM:
    // one object per operator per process, recognised by reference, reachable from data only
    // through decodeTerm and only from a bare canonical tag.
    if (idBrick() !== idBrick() || none() !== none()) return 'the identities are not singletons';
    if (idBrick() === none()) return 'the two identities are the same object';
    if (decodeTerm(encodeTerm(idBrick())) !== idBrick()) return 'the |> identity does not survive its own encoding';
    if (decodeTerm(encodeTerm(none())) !== none()) return 'the & identity does not survive its own encoding';
    // a tag carrying a payload is something PRETENDING to be the identity, and must decode to a brick
    if (decodeTerm({ kind: 'pipe_identity', holder: 'attacker' }) === idBrick())
      return 'a tag with a payload decoded to the privileged term';
    return true; })],
  // PROMOTED out of GAP 2026-08-22, the same day it was opened. It was xfail because closing it
  // needed a RULING on what a coalition's contract means, not a fix; the ruling came back Option U
  // (outputs join, inputs meet, hand-off is a SUBSET test) and the law started passing on its own.
  // The suite fails the build when a gap law starts passing, which is what forced this move rather
  // than leaving a closed defect sitting in an exception list looking open.
  //
  //     A.feeds_into=[U]  C.accepts_from=[T]   A |> C      is 0̲     (correct, and always was)
  //     B.feeds_into=[T]                       (A & B) |> C is 0̲     (was LIVE — A's output reached C)
  //
  // Symmetrical on the input side: X |> (A&B) now meets the two accepts_from sets instead of
  // unioning them, so the coalition cannot accept on behalf of a member that would refuse.
  ['CD6', '& does not launder a DECLARED-but-incompatible member: isZero(a|>c) ⇒ isZero((a&b)|>c)', (n) => trial(n, () => {
    const t = 'T' + ((Math.random() * 3) | 0), u = 'U' + ((Math.random() * 3) | 0);
    const mk = (contract) => Brick({ id: 'x' + ((Math.random() * 1e6) | 0), contract,
      value: V({ beta: 0.9, kappa: false, sigma: [], pi: null }), cost: certOf('poly'),
      q: { confidence: 0.9, cost: 1, latency: 1 }, utility: 1 });
    const a = mk({ accepts_from: ANY, feeds_into: TYPES(u) });        // cannot feed c
    const b = mk({ accepts_from: ANY, feeds_into: TYPES(t) });        // can
    const c = mk({ accepts_from: TYPES(t), feeds_into: ANY });
    if (!isZero(composePipe(a, c))) return true;                      // premise absent — law says nothing
    if (!isZero(composePipe(composeAnd(a, b), c)))
      return `a|>c is 0̲ but (a&b)|>c is LIVE — coalition feeds_into ${JSON.stringify(composeAnd(a, b).contract.feeds_into)}`;
    // the input side, same shape
    const x = mk({ accepts_from: ANY, feeds_into: TYPES(u) });
    const na = mk({ accepts_from: TYPES(t), feeds_into: ANY });
    const nb = mk({ accepts_from: TYPES(u), feeds_into: ANY });
    if (isZero(composePipe(x, na)) && !isZero(composePipe(x, composeAnd(na, nb))))
      return 'x|>a is 0̲ but x|>(a&b) is LIVE — coalition accepted on behalf of a member that refuses';
    return true; })],
  ['CD5', 'an explicit null/undefined field is an ABSENCE, not a declaration', (n) => trial(n, () => {
    const tag = 'T' + ((Math.random() * 4) | 0);
    const nul = pick([null, undefined]);
    const a = declBrick({ pi: 'retrieve', contract: { accepts_from: '*', feeds_into: nul } });
    const b = declBrick({ pi: 'act', contract: { accepts_from: [tag], feeds_into: '*' } });
    return isZero(composePipe(a, b)) ? true : `feeds_into=${String(nul)} was read as universal`; })],

  // ---------------------------------------------------------------------------------------------
  // CD8–CD11, added 2026-08-22 on outside review, and WRITTEN BEFORE THE FIX so the suite would
  // state the defect in its own vocabulary first. They found what the review said they would:
  // 11 of 64 endpoint pairs, 4 of 5 malformed contract forms, 4 of 4 malformed values.
  //
  // The common shape, and the reason these are one family rather than four bugs:
  //
  //     UNKNOWN or MALFORMED evidence was being canonicalised into a STRONGER claim than the
  //     input justified.
  //
  // That is the same meta-error as the original `missing → *`, which CD1–CD3 closed. The carrier
  // changed; the mistake moved. `∅ ⊆ X` holds for every X, so a contract end that could not be
  // parsed and fell through to an empty type set became MAXIMALLY permissive rather than refused.
  // ---------------------------------------------------------------------------------------------
  ['CD8', 'inserting the identity cannot change feasibility: zero(a|>b) = zero((a|>id)|>b) = zero(a|>(id|>b))', (n) => trial(n, () => {
    // The identity law (CD4) proves id preserves the VALUE. It never asked whether id preserves
    // FEASIBILITY, and it does not: `x` emitting U into `d` accepting T is correctly refused, and
    // `x |> id |> d` composes. A brick that changes what a pipeline is allowed to do is not an
    // identity of that pipeline's algebra, however green the value-preservation law is.
    const ends = [UNDECLARED, ANY, TYPES('U'), TYPES('T'), TYPES('U', 'T'), TYPES(), VAR('α'), VAR('β')];
    const out = pick(ends), inn = pick(ends);
    const a = declBrick({ contract: { accepts_from: ANY, feeds_into: out } });
    const b = declBrick({ contract: { accepts_from: inn, feeds_into: ANY } });
    const i = idBrick();
    const d = isZero(composePipe(a, b));
    const l = isZero(composePipe(composePipe(a, i), b));
    const r = isZero(composePipe(a, composePipe(i, b)));
    if (d === l && d === r) return true;
    return `OUT=${JSON.stringify(norm(out))} IN=${JSON.stringify(norm(inn))} — direct=${d ? '0̲' : 'LIVE'} (a|>id)|>b=${l ? '0̲' : 'LIVE'} a|>(id|>b)=${r ? '0̲' : 'LIVE'}`; })],

  ['CD9', '& projects the same contract either way round: contract(a&b) = contract(b&a)', (n) => trial(n, () => {
    // & is claimed as the parallel/coalitional operator, so its projected interface may not depend
    // on which operand was written first. Two DIFFERENTLY NAMED free variables broke it: meetIn
    // returned "the other one", so a&b accepted β and b&a accepted α. No verdict changed today —
    // both are `var` and var matched everything — which is exactly why it went unnoticed, and
    // exactly why it becomes a verdict bug the moment var stops being universal.
    const ends = [UNDECLARED, ANY, TYPES('U'), TYPES('T'), TYPES('U', 'T'), TYPES(), VAR('α'), VAR('β')];
    const ao = pick(ends), ai = pick(ends), bo = pick(ends), bi = pick(ends);
    const a = declBrick({ contract: { accepts_from: ai, feeds_into: ao } });
    const b = declBrick({ contract: { accepts_from: bi, feeds_into: bo } });
    const ab = composeAnd(a, b), ba = composeAnd(b, a);
    if (isZero(ab) && isZero(ba)) return true;
    // CANONICAL, because `types` carries a SET in an array and the two orders are the same
    // endpoint. The first draft of this law compared JSON directly and duly reported
    // `["T","U"]` vs `["U","T"]` as a commutativity failure — a law failing for a reason that
    // is not a defect, which is worse than no law at all: it buries the real witness (VAR α vs
    // VAR β) under noise a reader learns to skim past.
    const canon = (t) => { const x = norm(t);
      return x.kind === 'types' ? `types:${[...x.values].sort().join(',')}` : `${x.kind}:${x.name ?? ''}`; };
    const key = (x) => `${canon(x.contract.accepts_from)} <- -> ${canon(x.contract.feeds_into)}`;
    return key(ab) === key(ba) ? true
      : `a&b ${key(ab)}   vs   b&a ${key(ba)}`; })],

  ['CD10', 'a malformed contract end normalizes to UNDECLARED, never to a declared one', (n) => trial(n, () => {
    // Structural half. `{kind:"types", values:[1,2,3]}` filtered its non-strings away and became
    // the EMPTY type set — a well-formed, declared, maximally-permissive output endpoint built out
    // of something the normaliser could not read. Only an explicitly supplied empty set may mean
    // "emits nothing"; a filtered-down one means "could not be parsed".
    const malformed = pick([
      { kind: 'types', values: [1, 2, 3] }, { kind: 'types', values: 'nope' },
      { kind: 'types', values: {} }, 42, true, {}, { kind: 'bogus' },
      [1, 2], [null], { kind: 'types' },
    ]);
    const got = norm(malformed);
    return got.kind === 'undeclared' ? true
      : `norm(${JSON.stringify(malformed)}) = ${JSON.stringify(got)} — a declared endpoint out of unreadable input`; })],

  ['CD11', 'normalization cannot widen admissibility: a malformed producer end feeds nothing', (n) => trial(n, () => {
    // Behavioural half, stated separately because CD10 could be satisfied by a normaliser that
    // returned some OTHER declared-but-narrow endpoint. What must hold is the admissibility bound:
    // whatever a malformed end becomes, it may not compose with a consumer that a correct reading
    // would have refused. UNDECLARED refuses everything, so "refuses everything" is the test.
    const malformed = pick([
      { kind: 'types', values: [1, 2, 3] }, { kind: 'types', values: 'nope' },
      { kind: 'types', values: {} }, 42, true, {}, [1, 2], [null], { kind: 'types' },
    ]);
    const consumer = declBrick({ contract: { accepts_from: pick([TYPES('T'), TYPES('U'), TYPES()]), feeds_into: ANY } });
    const producer = declBrick({ contract: { accepts_from: ANY, feeds_into: malformed } });
    return isZero(composePipe(producer, consumer)) ? true
      : `malformed ${JSON.stringify(malformed)} composed into ${JSON.stringify(norm(consumer.contract.accepts_from))}`; })],

  // CD12, added 2026-08-22 on the SECOND outside review of the same afternoon, and it is a defect
  // introduced BY the CD8 fix rather than one that survived it. Making the identity a distinguished
  // element was right; implementing the distinction as an ordinary `identity: '|>'` field on Brick()
  // was not, because the field is data and data is written by whoever holds the pen:
  //
  //     Brick({ id:'evil', holder:'attacker', identity:'|>' })   ⇒   a |> evil = a
  //
  // An UNCERTIFIED brick, with a contract that matches nothing, claimed the privilege and both
  // operators short-circuited past every floor they have. It survived a JSON round-trip, which is
  // the boundary this carrier exists to cross.
  //
  // The lesson is sharper than the bug. The old code compared the NAME `'id'` and a comment
  // correctly called that forgeable — then replaced a forgeable name with a forgeable FIELD, which
  // is the same thing wearing a schema. Serialisability and authenticity are different
  // requirements: a term must survive JSON, and ordinary data must not be able to assert
  // privileged algebraic status. Only the decoder may mint an identity.
  ['CD12', 'identity privilege is UNFORGEABLE: no ordinary brick acquires it by declaring a field', (n) => trial(n, () => {
    const t = 'T' + ((Math.random() * 3) | 0), u = 'U' + ((Math.random() * 3) | 0);
    const a = declBrick({ contract: { accepts_from: ANY, feeds_into: TYPES(u) } });
    const b = declBrick({ contract: { accepts_from: TYPES(t), feeds_into: ANY } });
    if (!isZero(composePipe(a, b))) return true;                    // premise absent this draw
    const forge = (op) => Brick({ id: 'forged', holder: 'attacker', value: V0(), cost: certOf('poly'),
      q: { confidence: 0.9, cost: 1, latency: 1 }, identity: op,
      contract: { accepts_from: TYPES('X'), feeds_into: TYPES('X') } });

    // The signature of a successful forgery is the operand coming back UNTOUCHED.
    const fp = forge('|>');
    if (composePipe(fp, b) === b) return 'a forged |> identity was skipped and returned b unchanged';
    if (composePipe(a, fp) === a) return 'a forged |> identity was skipped and returned a unchanged';
    if (!isZero(composePipe(fp, b)) && !isZero(composePipe(a, b)))
      return 'a forged |> identity rescued a hand-off that is 0̲ without it';

    const fa = forge('&');
    if (composeAnd(fa, b) === b) return 'a forged & identity was skipped and returned b unchanged';
    if (composeAnd(a, fa) === a) return 'a forged & identity was skipped and returned a unchanged';

    // and across the serialisation boundary the carrier is designed for
    const viaJson = Brick(JSON.parse(JSON.stringify(fp)));
    if (composePipe(viaJson, b) === b) return 'a forged identity survived a JSON round-trip';
    if (Brick({ identity: '|>' }).identity === '|>') return 'Brick() still copies an identity field off untrusted input';
    return true; })],

  // CD13 — the LEGITIMATE identity bypassing operand validation. Third round on this one boundary,
  // and the previous fix created it: CD12 stopped ordinary data from BEING the identity, and left
  // open what the real identity does to an operand that was never canonicalised.
  //
  //     ensure(x) = isBrickShaped(x) ? x : Brick(x)
  //
  // "Looks brick-shaped" is a shape test, not a validity test, so a raw object with
  // `value.beta = 'high'` passed straight through — and the identity short-circuit then returned it
  // untouched. `Brick(raw)` is 0̲ and `raw |> ID` was LIVE: the constructor was right and the
  // OPERATOR BOUNDARY went around it. Mutating a legitimate brick after construction did the same,
  // because bricks are mutable and nothing re-checked at ingress.
  //
  // The root cause is an identity law that was stated too strongly. `a |> ID === a` — return the
  // very same object — is a JavaScript reference property, not the algebra's. The law is
  // `canon(a |> ID) ≡ canon(a)`, and insisting on the reference form is exactly what created a
  // privileged path around the normaliser. CD4 is restated to the canonical form alongside this.
  ['CD13', 'the identity does not bypass canonicalization: Brick(x) = 0̲ ⇒ every identity composition with x is 0̲', (n) => trial(n, () => {
    const mutate = Math.random() < 0.5;
    let x;
    if (mutate) { x = Brick(VALID()); x.value.beta = pick(['high', NaN, null]); }   // valid, then mutated
    else { x = VALID(); x.value = { ...x.value, beta: pick(['high', NaN, null]) }; } // raw, never constructed
    if (!isZero(Brick(x))) return 'the constructor itself did not floor the malformed operand';
    const how = mutate ? 'post-construction mutation' : 'raw brick-shaped object';
    if (!isZero(composePipe(x, idBrick()))) return `${how}: x |> ID is LIVE`;
    if (!isZero(composePipe(idBrick(), x))) return `${how}: ID |> x is LIVE`;
    if (!isZero(composeAnd(x, none()))) return `${how}: x & &none is LIVE`;
    if (!isZero(composeAnd(none(), x))) return `${how}: &none & x is LIVE`;
    return true; })],

  // CD14–CD17, outside review 2026-08-22 — the FOURTH round on the identity boundary, and this one
  // attacked the exemption the third round created. ensure() returns the singletons by reference,
  // and justified it: "they are provably unchanged". Nobody had done the proof. `Object.freeze` is
  // SHALLOW, so the top-level freeze blocked REPLACING `id.cost` and permitted writing THROUGH it —
  // permanently, process-wide, on a module singleton.
  ['CD14', 'identity terms are TRANSITIVELY immutable: every object reachable from a unit is frozen', (n) => trial(n, () => {
    const reach = (o, seen = new Set()) => {
      if (!o || typeof o !== 'object' || seen.has(o)) return seen;
      seen.add(o);
      for (const k of Object.getOwnPropertyNames(o)) reach(o[k], seen);
      return seen;
    };
    for (const [name, term] of [['id', idBrick()], ['&none', none()]]) {
      for (const o of reach(term)) if (!Object.isFrozen(o)) return `${name}: a reachable object is writable`;
    }
    // and the write must not merely be blocked at the top level — the deep fields are the payload
    const probe = pick([
      () => idBrick().cost.verdict.certified = false,
      () => idBrick().value.authority.push('root'),
      () => none().value.authority.push('root'),
      () => none().value.sigma.push('poison'),
      () => idBrick().q.confidence = 0,
    ]);
    try { probe(); } catch { /* strict-mode throw is the correct outcome */ }
    if (idBrick().cost.verdict.certified !== true) return 'id lost its certification to a caller write';
    if (idBrick().value.authority.length || none().value.authority.length) return 'a unit accepted injected authority';
    if (none().value.sigma.length) return 'a unit accepted an injected conflict';
    if (idBrick().q.confidence !== 1) return 'a unit lost its quantity identity to a caller write';
    return true; })],

  // CD15 — the ROUTE, which deep-freezing alone would have left open. The units were half
  // distinguished-term and half privileged brick: recognised under their own operator, silently
  // demoted to an ordinary brick under the other, where they carried their Value, their holder and
  // their FREE_COST into a composite. Prior art rather than local invention: a duoidal category has
  // two monoidal structures with DISTINCT units, related only by an explicitly declared structure
  // map. Absent that map there is no meaning to assume — this file's own MISSING ≠ UNIVERSAL rule,
  // at the term level.
  ['CD15', 'a unit has algebraic meaning ONLY under its own operator: cross-operator use is 0̲', (n) => trial(n, () => {
    const x = declBrick({ contract: { accepts_from: ANY, feeds_into: ANY } });
    const cross = [
      ['composeAnd(id, x)',    composeAnd(idBrick(), x)],
      ['composeAnd(x, id)',    composeAnd(x, idBrick())],
      ['composePipe(&none,x)', composePipe(none(), x)],
      ['composePipe(x,&none)', composePipe(x, none())],
    ];
    for (const [label, r] of cross) if (!isZero(r)) return `${label} composed as an ordinary brick`;
    // ...and the OWN-operator unit must still work, or this law has simply broken the algebra
    if (isZero(composeAnd(x, none())) || isZero(composePipe(x, idBrick())))
      return 'the own-operator identity stopped being an identity';
    return true; })],

  // CD16 — the behavioural half, stated separately because CD15 could be satisfied by a runtime
  // that returns 0̲ while still leaking the unit's privilege into the zero it returns. The units are
  // the ONLY terms in the algebra holding a costless certified certificate they never earned by
  // analysis; that privilege may not reach a composite by the wrong door.
  ['CD16', 'no unit contributes value, authority or COST under the other operator', (n) => trial(n, () => {
    const x = declBrick({ contract: { accepts_from: ANY, feeds_into: ANY } });
    for (const [label, r] of [
      ['&(x,id)',   composeAnd(x, idBrick())],   ['&(id,x)',   composeAnd(idBrick(), x)],
      ['|>(x,none)', composePipe(x, none())],    ['|>(none,x)', composePipe(none(), x)],
    ]) {
      if (r.cost?.verdict?.certified === true) return `${label} carried a certified certificate out of a foreign unit`;
      if ((r.value?.authority || []).length) return `${label} carried authority out of a foreign unit`;
      if (r.q?.cost === 0 && r.q?.confidence === 1) return `${label} inherited the unit's free quantities`;
    }
    return true; })],

  // CD17 — the transport boundary, and the one open question the previous round left named.
  // `decodeTerm(encodeTerm(t)) === t` holds, but nothing stopped a caller writing
  // `postMessage(idBrick())` instead of `postMessage(encodeTerm(idBrick()))`. The copy that lands on
  // the far side carries the canonical TAG and not the reference — a counterfeit. It must not
  // compose as an ordinary brick (it arrives holding a free certificate), and it must not fail
  // silently either: the defect is at the call site and the refusal has to say so.
  ['CD17', 'a counterfeit unit (right tag, wrong object) refuses and names the transport fault', (n) => trial(n, () => {
    const x = declBrick({ contract: { accepts_from: ANY, feeds_into: ANY } });
    const copies = [
      structuredClone(idBrick()), structuredClone(none()),
      JSON.parse(JSON.stringify(idBrick())), JSON.parse(JSON.stringify(none())),
      { ...idBrick() }, { ...none(), value: { ...none().value, authority: ['root'] } },
    ];
    for (const c of copies) {
      for (const [label, r] of [['|> right', composePipe(x, c)], ['|> left', composePipe(c, x)],
                                ['& right',  composeAnd(x, c)],  ['& left',  composeAnd(c, x)]]) {
        if (!isZero(r)) return `a counterfeit ${c.kind} composed (${label})`;
        if (!/identity-not-transported/.test(r.refusal || ''))
          return `a counterfeit ${c.kind} refused without naming the transport fault (${label}: ${r.refusal})`;
      }
    }
    // the correct crossing still works, and is the ONLY thing that does
    if (decodeTerm(encodeTerm(idBrick())) !== idBrick() || decodeTerm(encodeTerm(none())) !== none())
      return 'the encode/decode crossing stopped returning the singleton';
    return true; })]
];

// ---------------- AD — ADMISSION: the carrier, and what is allowed into it -----------------------
// Outside review 2026-08-22. `LIVE` was doing duty for two different things:
//
//     structurally valid   Brick() could read every field
//     ADMITTED             the shared floor lets it through
//
// An uncertified brick is structurally perfect and unadmitted. Real composition knew it — `u |> f`
// is 0̲ — and the identity did not: `u |> ID` returned `u`, LIVE, because the identity short-circuits
// before the floor. The one route through the algebra applying NO floor was the element whose entire
// job is to change nothing.
//
// Stated as CLOSURE it stops being a matter of taste. The anchor law is "a brick of bricks is a
// brick"; `u |> ID` took a non-carrier element and returned a non-carrier element out of a
// composition, so the algebra was not closed. Identity laws quantify over the CARRIER — `a ⊗ e = a`
// says nothing about objects that are not elements — so restricting them costs no law and buys
// closure back.
const unadmitted = (o = {}) => Brick({
  id: 'u' + ((Math.random() * 1e6) | 0),
  contract: { accepts_from: ANY, feeds_into: ANY },
  value: V({ beta: 0.9, kappa: false, sigma: [], pi: null }),
  q: { confidence: 0.9, cost: 1, latency: 1 }, utility: 1,
  ...o,
  cost: o.cost !== undefined ? o.cost : uncertCert(),            // the default reason to be unadmitted
});
const ADMIT = [
  ['AD1', 'the carrier is CLOSED: composing admitted terms yields 0̲ or an admitted term', (n) => trial(n, () => {
    const a = declBrick({ contract: { accepts_from: ANY, feeds_into: ANY } });
    const b = declBrick({ contract: { accepts_from: ANY, feeds_into: ANY } });
    if (!admitted(a) || !admitted(b)) return 'the suite built an unadmitted brick as its premise';
    for (const [label, r] of [['&', composeAnd(a, b)], ['|>', composePipe(a, b)],
                              ['&none', composeAnd(a, none())], ['id', composePipe(a, idBrick())]])
      if (!isZero(r) && !admitted(r)) return `${label} produced a LIVE term that is not in the carrier`;
    return true; })],

  ['AD2', 'the identity PRESERVES an admitted element (value, contract and certificate intact)', (n) => trial(n, () => {
    const a = declBrick({ pi: pick([null, ...PHASES]), contract: pick([undefined, { accepts_from: ANY, feeds_into: ANY }, { accepts_from: TYPES('T'), feeds_into: TYPES('U') }]) });
    if (!admitted(a)) return 'premise: brick not admitted';
    for (const [label, r] of [['a|>ID', composePipe(a, idBrick())], ['ID|>a', composePipe(idBrick(), a)],
                              ['a&none', composeAnd(a, none())],    ['none&a', composeAnd(none(), a)]]) {
      if (isZero(r)) return `${label} annihilated an ADMITTED operand`;
      if (!valEq(r.value, a.value)) return `${label} did not preserve the value`;
      if (!contractEq(r, a)) return `${label} did not preserve the contract`;
      if (r.cost !== a.cost) return `${label} did not preserve the certificate`;
    }
    return true; })],

  ['AD3', 'the identity does NOT admit an unadmitted element — it agrees with real composition', (n) => trial(n, () => {
    // every reason a structurally-valid brick can fail the floor
    const x = pick([
      unadmitted(),                                                        // uncertified
      unadmitted({ cost: certOf('poly'), value: V({ kappa: true, sigma: [] }) }),   // cyclic
      unadmitted({ cost: certOf('poly'), value: V({ kappa: false, sigma: ['unresolved'] }) }), // conflicted
      unadmitted({ cost: { ...certOf('poly'), verdict: { certified: true, costClass: 'unknown' },
                           policy: { resourceDecision: 'annihilate', reason: 't' } } }),       // certified ignorance
    ]);
    if (isZero(x)) return 'premise: the operand is already 0̲, so this trial proves nothing';
    if (admitted(x)) return 'premise: the operand is admitted, so this trial proves nothing';
    const partner = declBrick({ contract: { accepts_from: ANY, feeds_into: ANY } });
    // real composition refuses it...
    if (!isZero(composePipe(x, partner)) || !isZero(composeAnd(x, partner)))
      return 'real composition admitted an unadmitted operand';
    // ...and so must every identity route, or the identity is a laundering path around the floor
    for (const [label, r] of [['x|>ID', composePipe(x, idBrick())], ['ID|>x', composePipe(idBrick(), x)],
                              ['x&none', composeAnd(x, none())],    ['none&x', composeAnd(none(), x)]])
      if (!isZero(r)) return `${label} is LIVE — the identity admitted what the floor refuses`;
    return true; })],

  // AD4/AD5 — `floor` has been on every brick since the first draft: stored, unioned into every
  // composite, threaded through the whole algebra, and never once READ. floored() took a floorReqs
  // argument that neither operator passed. A requirement propagated but not applied is worse than
  // an absent one: in a receipt it reads exactly like a satisfied one.
  ['AD4', 'a DECLARED floor requirement is enforced, not merely carried', (n) => trial(n, () => {
    const mk = (cost, floor, artifact) => Brick({ id: 'f', contract: { accepts_from: ANY, feeds_into: ANY },
      value: V({ beta: 0.9, kappa: false, sigma: [], pi: null }), cost, artifact,
      q: { confidence: 0.9, cost: 1, latency: 1 }, utility: 1, floor });
    const pc = attest(certOf('poly')), sc = attest(certOf('poly')), lc = certOf('poly');
    const producer = mk(pc, [], boundTo(pc));
    const strict = mk(sc, ['authenticated'], boundTo(sc));
    const lax = mk(lc, [], boundTo(lc));                         // presented, never attested
    if (isZero(composePipe(producer, strict))) return 'an authenticated pair was refused by an authenticated floor';
    if (!isZero(composePipe(lax, strict))) return 'a merely-PRESENTED certificate cleared floor:[authenticated]';
    if (!isZero(composeAnd(lax, strict))) return '& ignored the declared floor';
    // and the requirement must PROPAGATE — a composite that inherited it still enforces it
    const comp = composePipe(producer, strict);
    if (!comp.floor.includes('authenticated')) return 'the composite dropped the inherited requirement';
    if (!isZero(composeAnd(comp, lax))) return 'an inherited requirement stopped being enforced downstream';
    return true; })],

  ['AD5', 'an UNRECOGNISED floor token refuses — an unknown requirement is unmet, not unnoticed', (n) => trial(n, () => {
    const tok = pick(['signed-by-treasury', 'quorum:3', '', 'ACYCLIC', 42, null, 'sigma-empty']);
    const b = Brick({ id: 'f', contract: { accepts_from: ANY, feeds_into: ANY },
      value: V({ beta: 0.9, kappa: false, sigma: [], pi: null }), cost: certOf('poly'),
      q: { confidence: 0.9, cost: 1, latency: 1 }, utility: 1, floor: [tok] });
    const ok = declBrick({ contract: { accepts_from: ANY, feeds_into: ANY } });
    if (!isZero(composePipe(ok, b))) return `unknown floor token ${JSON.stringify(tok)} was silently dropped by |>`;
    if (!isZero(composeAnd(ok, b))) return `unknown floor token ${JSON.stringify(tok)} was silently dropped by &`;
    return true; })]
];

// ---------------- CERT — THE COST CERTIFICATE, THE FOURTH CARRIER -------------------------------
// Outside review 2026-08-22. Three carriers had been given the PRESENT+INVALID ⇒ 0̲ rule; the cost
// certificate — the object with the most authority in the file — had been given none of it. Brick()
// did `cost: o.cost ?? UNCERTIFIED_COST()` and validated nothing, so "certificate" at this layer
// meant `an object asserting certified:true`:
//
//     { verdict: { certified: true, costClass: 'poly' } }   ⇒   LIVE, allow, free
//
// No issuer, no subject, no analyzer, no policy. CERT1–CERT5 hold the line this runtime can actually
// hold — a certificate must BIND what it certifies and be internally coherent — and CERT3/CERT4 draw
// the honest boundary between a certificate PRESENTED and one this process AUTHENTICATED.
// A brick BOUND to its own certificate — the ordinary case, and the one every authentication law
// needs now that `authenticatedFor` is a relation between an artifact and its evidence (CERT14)
// rather than a flag on the certificate object.
const boundBrick = (cost, o = {}) => certBrick(cost, { artifact: boundTo(cost), ...o });
// A fresh ATTESTED, correctly bound leaf — the ordinary well-formed operand, and the premise every
// depth law needs. `presentedLeaf` is the same thing without attestation.
const boundLeaf = () => { const c = attest(certOf('poly')); return certBrick(c, { artifact: boundTo(c) }); };
const presentedLeaf = () => { const c = certOf('poly'); return certBrick(c, { artifact: boundTo(c) }); };
// The suite serialises with `JSON.stringify` DELIBERATELY and must keep doing so: the runtime's own
// canonTerm was rewritten to be hook-free and iterative (CERT31/CERT32), and a test that used the
// rewritten function to check the rewritten function would agree with itself about anything.
const canonOf = (t) => JSON.stringify(t);
// Swap a certificate's subject without disturbing the rest of it — the certificate carriers and the
// subject carrier are separate concerns and these laws vary only the second.
const withSubject = (cert, subject) => ({ ...cert, subject });
// A left-nested `|>` chain of the given depth, built ITERATIVELY: a recursive generator would hit
// the interpreter's stack before the runtime under test hit its declared budget, and the witness
// would then be measuring the test harness.
const deepPipe = (d) => { let t = ['leaf', 'weave-ir', 'A']; for (let i = 0; i < d; i++) t = ['pipe', t, ['leaf', 'weave-ir', 'B' + i]]; return t; };
// ...and the other exhaustion: one flat `and` with more children than the node budget allows.
const wideAnd = (k) => { const t = ['and']; for (let i = 0; i < k; i++) t.push(['leaf', 'weave-ir', 'W' + i]); return t; };
// The two over-budget subjects are built ONCE. They are constants — the budget boundary is a fixed
// number, not a distribution — and rebuilding a hundred-thousand-node term on each of 2000 trials
// costs a minute of wall clock to re-measure the same fact. The runtime refuses them, so nothing
// mutates them and sharing is safe.
const OVER_DEEP = { kind: 'weave-composite', hash: 'over-budget-depth', term: deepPipe(4200) };
const OVER_WIDE = { kind: 'weave-composite', hash: 'over-budget-nodes', term: wideAnd(100100) };
// ...and the in-budget ladder, likewise built once. Totality over depth has a ONE-INTEGER input
// space, so the useful thing is COVERAGE of the interesting depths — including the ones that would
// have overflowed the old recursive walk — not 2000 fresh random draws from the same interval.
// 4090 is deliberately just under the 4096 ceiling: the last depth that must still work.
//
// ONCE PER PASS FOR THE EXPENSIVE ONES, AND SAYING SO. Validating a 4090-node term is ~4000× the
// work of validating a leaf. Drawing it on even 10% of 2000 trials made this suite cost more wall
// clock than everything else in it together — and outside review reported the packaged verifier
// exceeding a 120-second window on their machine, which is a real cost to every future round and
// not a cosmetic one. A ceiling is DETERMINISTIC: running it 200 times measures it 199 times more
// than it needs measuring. `onceper` runs each expensive case exactly once per pass; the rest of
// the trials draw from depths that cost almost nothing.
const isStr = (x) => typeof x === 'string' && x.length > 0;   // compose.mjs keeps its own private copy
const onceper = () => { let spent = false; return () => (spent ? false : (spent = true)); };
// One character from each class the JSON escaper treats differently, so CERT33 exercises every
// branch of the byte arithmetic rather than the ASCII branch it would otherwise almost always draw.
const BYTE_CLASSES = ['a', '"', '\\', '\u0000', '\u001f', '\b', '\t', '\n', '\f', '\r',
                      'é', '€', '😀', '\ud800', '\udfff', ' '];
// A leaf whose SOURCE length is comfortably inside the budget and whose CANONICAL form is not — the
// witness that the two are different quantities. Built once; the string is ~750k characters, which
// is 750,002 source units and 4,500,055 canonical UTF-8 bytes.
const HUGE_LEAF_SUBJECT = (() => {
  const term = ['pipe', ['leaf', 'weave-ir', '\u0000'.repeat(750000)], ['leaf', 'weave-ir', 'C']];
  return { kind: 'weave-composite', hash: 'over-budget-bytes', term };
})();
// Values that are hostile in ways only an in-process JS object can be. CERT31 declared these part
// of the attack surface rather than trusted, so the declared boundary has to survive all of them.
const wellFormedRaw = () => ({ contract: { accepts_from: '*', feeds_into: '*' },
  value: { beta: 0.9, kappa: false, sigma: [], pi: null }, q: { confidence: 1, cost: 0, latency: 0 },
  artifact: { kind: 'weave-ir', hash: 'A' },
  cost: { subject: { kind: 'weave-ir', hash: 'A' }, analyzer: { name: 'w', version: '1' },
          verdict: { certified: true, costClass: 'poly' }, policy: { resourceDecision: 'allow' } } });
const HOSTILE = [
  ['throwing cost getter', () => { const o = wellFormedRaw(); Object.defineProperty(o, 'cost', { get() { throw new Error('ran'); }, enumerable: true }); return o; }],
  ['throwing value getter', () => { const o = wellFormedRaw(); Object.defineProperty(o.value, 'beta', { get() { throw new Error('ran'); }, enumerable: true }); return o; }],
  ['proxy: getPrototypeOf traps', () => new Proxy(wellFormedRaw(), { getPrototypeOf() { throw new Error('t'); } })],
  ['proxy: ownKeys traps', () => new Proxy(wellFormedRaw(), { ownKeys() { throw new Error('t'); } })],
  ['proxy: getOwnPropertyDescriptor traps', () => new Proxy(wellFormedRaw(), { getOwnPropertyDescriptor() { throw new Error('t'); } })],
  ['proxy: get traps', () => new Proxy(wellFormedRaw(), { get() { throw new Error('t'); } })],
  ['a cycle', () => { const o = wellFormedRaw(); o.self = o; return o; }],
  ['a function-valued field', () => { const o = wellFormedRaw(); o.evil = () => 1; return o; }],
  ['a Date inside the certificate', () => { const o = wellFormedRaw(); o.cost.at = new Date(0); return o; }],
  ['NaN utility', () => { const o = wellFormedRaw(); o.utility = NaN; return o; }],
  ['throwing Symbol.toPrimitive in a term', () => { const o = wellFormedRaw();
    o.artifact = { kind: 'weave-composite', hash: 'x', term: [{ [Symbol.toPrimitive]() { throw new Error('c'); } }, 1, 2] }; return o; }],
  ['an Array subclass as a term node', () => { class S extends Array { toJSON() { return ['leaf', 'weave-ir', 'X']; } }
    const o = wellFormedRaw(); o.artifact = { kind: 'weave-composite', hash: 'x',
      term: S.from(['pipe', ['leaf', 'weave-ir', 'A'], ['leaf', 'weave-ir', 'B']]) }; return o; }],
  ['a bare primitive', () => 42],
  ['null', () => null],
  ['a well-formed brick', () => wellFormedRaw()],
];
const hostileBrick = () => { const [label, build] = pick(HOSTILE); return { v: build(), label }; };

let ceilingOnce = onceper(), deepOnce = onceper(), dagOnce = onceper(), bytesOnce = onceper();   // re-armed at the head of each law, so a re-run re-measures
const AT_CEILING = (() => { const term = deepPipe(4090);         // the last depth that must still work
  return { d: 4090, subject: { kind: 'weave-composite', hash: canonOf(term), term } }; })();
const IN_BUDGET = [1, 2, 17, 60, 400].map((d) => {
  const term = deepPipe(d);
  return { d, subject: { kind: 'weave-composite', hash: canonOf(term), term } };
});
// A random CANONICAL term over strings chosen to exercise JSON escaping — quotes, backslashes,
// control characters, a lone surrogate, astral pairs, and strings that look like the grammar.
const NASTY = ['a', '"', '\\', '\n', '\t', '\b', '\f', '\r', '\u0000', '\u001f', ' ', 'é', '😀', '\ud800', 'and', 'pipe', 'leaf', '["a"]', ' ', ','];
const nastyStr = () => pick(NASTY) + ((Math.random() * 1e3) | 0);
const genCanonTerm = (d, root = false) => {
  // A COMPOSITE's term root is an operator, never a leaf (CERT25) — so the root level never draws one.
  if (!root && (d <= 0 || Math.random() < 0.35)) return ['leaf', 'k' + nastyStr(), 'h' + nastyStr()];
  if (Math.random() < 0.5) return ['pipe', genCanonTerm(d - 1), genCanonTerm(d - 1)];
  // `and` is canonical only when FLAT, so an `and` child is wrapped rather than nested (CERT26).
  const kids = Array.from({ length: 2 + ((Math.random() * 3) | 0) }, () => {
    const c = genCanonTerm(d - 1);
    return c[0] === 'and' ? ['pipe', c, ['leaf', 'weave-ir', 'w']] : c;
  });
  return ['and', ...kids];
};
// Fold `depth` fresh leaves into a tree of the given association. CERT16 went green because it
// tested ONE shape at depth two; these build left-, right- and balanced-associated trees so the
// induction step is exercised rather than assumed.
const treeOf = (fn, depth, shape, mk) => {
  const ls = Array.from({ length: depth }, mk);
  if (shape === 'left') return ls.reduce((a, b) => fn(a, b));
  if (shape === 'right') return ls.reduceRight((a, b) => fn(b, a));
  const build = (xs) => (xs.length === 1 ? xs[0] : fn(build(xs.slice(0, xs.length >> 1)), build(xs.slice(xs.length >> 1))));
  return build(ls);
};
const certBrick = (cost, o = {}) => Brick({ id: 'c' + ((Math.random() * 1e6) | 0),
  contract: { accepts_from: ANY, feeds_into: ANY },
  value: V({ beta: 0.9, kappa: false, sigma: [], pi: null }), cost,
  q: { confidence: 0.9, cost: 1, latency: 1 }, utility: 1, ...o });
const CERTS = [
  ['CERT1', 'certified:true is not self-authenticating: a bare assertion is not a certificate', (n) => trial(n, () => {
    const bare = pick([
      { verdict: { certified: true, costClass: 'poly' } },                    // the review's witness
      { verdict: { certified: true, costClass: 'poly' }, policy: { resourceDecision: 'allow' } },
      { subject: { kind: 'weave-ir', hash: 'h' }, verdict: { certified: true, costClass: 'poly' } },
      42, 'certified', [], { verdict: 'certified' }, { verdict: {} },
    ]);
    const x = certBrick(bare);
    if (!isZero(x)) return `${JSON.stringify(bare)} was accepted as a certificate`;
    const ok = declBrick({ contract: { accepts_from: ANY, feeds_into: ANY } });
    if (!isZero(composePipe(x, ok)) || !isZero(composeAnd(x, ok))) return 'a bare assertion composed';
    return true; })],

  ['CERT2', 'an admitted certificate BINDS subject+analyzer and may not out-permit its own verdict', (n) => trial(n, () => {
    const good = certOf('poly');
    if (isZero(certBrick(good))) return 'a well-formed certificate was refused';
    // each required binding, removed one at a time
    for (const drop of ['subject', 'analyzer', 'verdict', 'policy']) {
      const c = { ...good }; delete c[drop];
      if (!isZero(certBrick(c))) return `a certificate missing ${drop} was admitted`;
    }
    for (const [path, bad] of [['subject.kind', {}], ['subject.hash', { kind: 'weave-ir' }],
                               ['analyzer.name', { version: '0' }]]) {
      const c = { ...good, [path.split('.')[0]]: bad };
      if (!isZero(certBrick(c))) return `a certificate with a broken ${path} was admitted`;
    }
    // certified must be a BOOLEAN — `!!` made the string 'false' certify
    for (const v of ['false', 'true', 1, {}, [], null, undefined]) {
      if (!isZero(certBrick({ ...good, verdict: { certified: v, costClass: 'poly' } })))
        return `certified:${JSON.stringify(v)} read as a boolean verdict`;
    }
    // COHERENCE IS ONE-DIRECTIONAL: stricter than the verdict is allowed, more permissive is not.
    const strict = { ...good, policy: { resourceDecision: 'escalate', reason: 't' } };
    if (isZero(certBrick(strict))) return 'a certificate stricter than its verdict was refused';
    const permissive = { ...good, verdict: { certified: false, costClass: 'unknown' },
                         policy: { resourceDecision: 'allow', reason: 't' } };
    if (!isZero(certBrick(permissive))) return 'a certificate more permissive than its own verdict was admitted';
    return true; })],

  ['CERT3', 'composition never UPGRADES evidence: presented ∘ authenticated is presented', (n) => trial(n, () => {
    // BOUND, because CERT14 made authentication a relation: an attested certificate on a brick that
    // does not claim to be its subject is not authentication, and CERT15 is the law for that.
    const A = () => boundBrick(attest(certOf('poly')));
    const P = () => boundBrick(certOf('poly'));
    const cases = [[A(), A(), true], [A(), P(), false], [P(), A(), false], [P(), P(), false]];
    for (const [a, b, wantAuth] of cases) {
      for (const [label, r] of [['|>', composePipe(a, b)], ['&', composeAnd(a, b)]]) {
        if (isZero(r)) return `${label}: a well-formed pair floored`;
        if (isAttested(r.cost) !== wantAuth)
          return `${label}: composite authenticated=${isAttested(r.cost)}, expected ${wantAuth}`;
      }
    }
    return true; })],

  ['CERT4', 'authentication is unforgeable by DATA and does not survive serialisation', (n) => trial(n, () => {
    const real = attest(certOf('poly'));
    if (!isAttested(real)) return 'attest did not brand';
    // a caller may not declare the status...
    for (const shape of [{ certified: true, costClass: 'poly', authenticated: true },
                         { certified: true, costClass: 'poly', authenticated: false }]) {
      if (!isZero(certBrick({ ...certOf('poly'), verdict: shape })))
        return 'a certificate declaring `authenticated` was admitted';
    }
    // ...nor obtain it by copying an attested one...
    for (const copy of [structuredClone(real), JSON.parse(JSON.stringify(real)), { ...real }])
      if (isAttested(copy)) return 'a copy of an attested certificate carried the brand';
    // ...and the runtime never writes it down, because a written field is a forgeable one
    const comp = composePipe(boundBrick(attest(certOf('poly'))), boundBrick(attest(certOf('poly'))));
    if ('authenticated' in comp.cost.verdict) return 'the runtime serialised authentication into a data field';
    if (comp.artifact?.hash !== comp.cost.subject.hash) return 'a composite does not bind its own subject as its artifact';
    if (!isAttested(comp.cost)) return 'the runtime did not brand a composite it minted itself';
    return true; })],

  ['CERT5', 'a certified verdict of UNKNOWN cost certifies nothing: it does not clear the floor', (n) => trial(n, () => {
    const ignorant = { ...certOf('poly'), verdict: { certified: true, costClass: 'unknown' },
                       policy: { resourceDecision: 'annihilate', reason: 't' } };
    const x = certBrick(ignorant);
    if (isZero(x)) return 'premise: a well-formed certificate was refused at construction';
    if (admitted(x)) return 'certified:true + costClass:unknown was ADMITTED';
    const ok = declBrick({ contract: { accepts_from: ANY, feeds_into: ANY } });
    for (const [label, r] of [['|>', composePipe(x, ok)], ['&', composeAnd(x, ok)],
                              ['id', composePipe(x, idBrick())], ['&none', composeAnd(x, none())]])
      if (!isZero(r)) return `${label}: certified ignorance cleared the floor`;
    // ...while every REAL class still composes, tower included (escalate is not annihilate)
    for (const cc of ['poly', 'elementary', 'exponential', 'tower'])
      if (isZero(composePipe(certBrick(certOf(cc)), ok))) return `a well-formed ${cc} certificate was refused`;
    return true; })],

  // CERT6–CERT12, fifth outside review 2026-08-22. The identity layer stopped being the frontier and
  // the certificate layer became it. Each of these is SINGLE-AXIS on purpose — the review's own
  // warning is that in a large fuzzer one failure masks another.
  ['CERT6', 'composition never WEAKENS resource policy: decision(a∘b) ≥ max(decision a, decision b, derived)', (n) => trial(n, () => {
    // `composeCost` derived the composite decision from costClass ALONE, so every stricter policy an
    // operand carried was discarded: {certified, poly, ANNIHILATE} composed to {certified, poly,
    // ALLOW}. The validator already forbids a certificate being more permissive than its own
    // verdict; enforcing that per-leaf and dropping it per-composition made the rule true of every
    // certificate and false of the algebra.
    const DEC = ['allow', 'budget_check', 'escalate'];            // annihilate is CERT7's job
    const rank = (d) => DEC.indexOf(d);
    const cc = pick(['poly', 'elementary', 'exponential', 'tower']);
    // A certificate may only be STRICTER than its verdict implies (CERT2), so draw at or above the
    // derived minimum. Drawing below it is not a falsifier for THIS law — it is CERT2 doing its job,
    // and a premise that trips another law tests nothing about this one.
    const floorOf = cc === 'poly' ? 0 : cc === 'tower' ? 2 : 1;
    const drawAt = () => DEC[floorOf + ((Math.random() * (DEC.length - floorOf)) | 0)];
    const da = drawAt(), db = drawAt();
    const mk = (d, c) => certBrick({ ...certOf(c), policy: { resourceDecision: d, reason: 't' } });
    const a = mk(da, cc), b = mk(db, cc);
    if (isZero(a) || isZero(b)) return 'premise: a well-formed certificate was refused';
    for (const [label, r] of [['|>', composePipe(a, b)], ['&', composeAnd(a, b)]]) {
      if (isZero(r)) return `${label}: a live pair floored`;
      const got = r.cost.policy.resourceDecision;
      const floorD = Math.max(rank(da), rank(db));
      if (rank(got) < floorD) return `${label}: {${da}, ${db}} ⇒ ${got} — weaker than an operand`;
      // ...and never weaker than the cost class alone would have demanded, either
      const derived = r.cost.verdict.costClass === 'poly' ? 'allow'
                    : r.cost.verdict.costClass === 'tower' ? 'escalate' : 'budget_check';
      if (rank(got) < rank(derived)) return `${label}: ${got} weaker than the cost-derived ${derived}`;
    }
    return true; })],

  ['CERT7', 'an ANNIHILATE decision cannot enter the admitted carrier', (n) => trial(n, () => {
    // The floor read the verdict and never the policy, so a certificate whose own instruction was
    // "do not admit this" was admitted and composed LIVE. escalate/budget_check are live-with-an-
    // obligation and must NOT floor — that distinction is the other half of this law.
    const cc = pick(['poly', 'elementary', 'exponential', 'tower']);
    const kill = certBrick({ ...certOf(cc), policy: { resourceDecision: 'annihilate', reason: 't' } });
    // Structurally valid and UNADMITTED — the same shape as `uncertified`, and deliberately so:
    // policy is a FLOOR condition, not a canonicalisation one, so `Brick()` still reads it fine and
    // the floor is what refuses. Asserting isZero() here would collapse the carrier ladder that
    // AD1–AD3 exist to keep separate.
    if (isZero(kill)) return 'premise: the constructor floored it, so this trial proves nothing about the floor';
    if (admitted(kill)) return 'a certificate saying annihilate was ADMITTED';
    const ok = declBrick({ contract: { accepts_from: ANY, feeds_into: ANY } });
    for (const [label, r] of [['|>', composePipe(kill, ok)], ['&', composeAnd(kill, ok)],
                              ['id', composePipe(kill, idBrick())], ['&none', composeAnd(kill, none())]])
      if (!isZero(r)) return `${label}: annihilate was resurrected`;
    // the live-with-obligation decisions must survive
    // Pinned to `poly`, whose derived minimum is `allow`, so both of these are legitimately STRICTER
    // than the verdict implies. Drawing a class whose own minimum is already `escalate` would make
    // `budget_check` more permissive than its verdict, and CERT2 would refuse it — correctly, and
    // for a reason that has nothing to do with this law.
    for (const d of ['budget_check', 'escalate']) {
      const held = certBrick({ ...certOf('poly'), policy: { resourceDecision: d, reason: 't' } });
      if (isZero(held) || !admitted(held)) return `${d} floored — it is an obligation, not a refusal`;
    }
    return true; })],

  ['CERT8', 'an attested certificate is TRANSITIVELY immutable at attestation', (n) => trial(n, () => {
    // The brand attached to a mutable object reference: attest a certificate for hash-A, then set
    // subject.hash = 'hash-B', and isAttested still said true. The certificate changed what it
    // claimed to authenticate and the authentication survived — the attestation form of the
    // shallow-frozen identity defect (CD14).
    const c = attest(certOf('poly'));
    const reach = (o, seen = new Set()) => {
      if (!o || typeof o !== 'object' || seen.has(o)) return seen;
      seen.add(o); for (const k of Object.getOwnPropertyNames(o)) reach(o[k], seen); return seen;
    };
    for (const o of reach(c)) if (!Object.isFrozen(o)) return 'a reachable field of an attested certificate is writable';
    const was = c.subject.hash;
    try { c.subject.hash = 'hash-B'; } catch { /* strict-mode refusal is the intended outcome */ }
    if (c.subject.hash !== was) return 'an attested certificate changed its subject';
    try { c.verdict.certified = false; } catch { /* ditto */ }
    if (c.verdict.certified !== true) return 'an attested certificate changed its verdict';
    return isAttested(c) ? true : 'the brand did not survive its own freeze'; })],

  ['CERT9', 'attestation binds a verifier to an EXACT subject, and the brick must be that subject', (n) => trial(n, () => {
    // Without this, one attested certificate authenticated any number of unrelated bricks: the
    // runtime established "this certificate object was verified", never "verified FOR THIS THING".
    const c = certOf('poly');
    let mism = false; try { AUTH.verifyAndAttest(c, 'some-other-subject'); } catch { mism = true; }
    if (!mism) return 'verifyAndAttest accepted a subject it was not asked to attest';
    let nosub = false; try { AUTH.verifyAndAttest(certOf('poly')); } catch { nosub = true; }
    if (!nosub) return 'verifyAndAttest attested without an expected subject';

    const good = attest(certOf('poly'));
    const bound   = certBrick(good, { floor: ['authenticated'], artifact: boundTo(good) });
    const wrong   = certBrick(good, { floor: ['authenticated'], artifact: { kind: 'weave-ir', hash: 'someone-else' } });
    const unbound = certBrick(good, { floor: ['authenticated'] });
    if (!admitted(bound))   return 'a brick that IS the certificate subject was refused';
    if (admitted(wrong))    return 'an attested certificate authenticated a DIFFERENT artifact';
    if (admitted(unbound))  return 'a brick declaring no artifact satisfied an authenticated floor';
    // and a malformed artifact is a false identity claim, not an absent one
    if (!isZero(certBrick(good, { artifact: { kind: 'weave-ir' } }))) return 'a malformed artifact was accepted';
    return true; })],

  ['CERT10', 'a composite subject is a CANONICAL COMPOSITION IDENTITY, not a deduplicated leaf set', (n) => trial(n, () => {
    // subject(a|>b) and subject(a&b) were both {parts:['A','B']}, and A|>A and A|>A|>A were both
    // {parts:['A']}. A cost certificate whose subject cannot tell those apart is not binding the
    // composition — and those programs need not have the same cost.
    const L = () => certBrick(certOf('poly'));
    const sub = (r) => (isZero(r) ? null : r.cost.subject.hash);
    const x = L(), y = L(), z = L();
    const XY = sub(composePipe(x, y)), XaY = sub(composeAnd(x, y));
    if (!XY || !XaY) return 'premise: a live pair floored';
    if (XY === XaY) return `|> and & produced the same subject (${XY})`;
    // multiplicity survives
    if (sub(composePipe(x, x)) === x.cost.subject.hash) return 'a self-composition collapsed to its leaf';
    if (sub(composePipe(composePipe(x, x), x)) === sub(composePipe(x, x))) return 'multiplicity was erased';
    // & flattens (CA1 associativity PASSES) ...
    if (sub(composeAnd(composeAnd(x, y), z)) !== sub(composeAnd(x, composeAnd(y, z))))
      return '& did not flatten, though CA1 associativity is an enforced law';
    // ... but does NOT commute (CA2 is lattice-only, CP7 is declared-open) or dedupe (CA3 likewise)
    if (sub(composeAnd(x, y)) === sub(composeAnd(y, x)))
      return '& canonicalised operand order — CP7 is the open counterexample to that equation';
    if (sub(composeAnd(x, x)) === sub(composeAnd(x, y)))
      return '& deduplicated operands — cost and the CC2 quantities accrue, so a&a is not a';
    // ... and |> does NOT flatten (CP5/CP6 are declared-open)
    if (sub(composePipe(composePipe(x, y), z)) === sub(composePipe(x, composePipe(y, z))))
      return '|> flattened, asserting an association equation CP5/CP6 currently falsify';
    return true; })],

  ['CERT11', 'a subject may never be empty: every certificate binds a hash', (n) => trial(n, () => {
    const bad = pick([
      { kind: 'weave-composite', parts: [] }, { kind: 'weave-composite', parts: ['a'] },
      { kind: 'weave-composite' }, { kind: 'weave-ir', hash: '' }, { hash: 'h' }, { kind: '', hash: 'h' },
      {}, null, 42, [], { kind: 'weave-ir', hash: 42 },
    ]);
    const x = certBrick({ ...certOf('poly'), subject: bad });
    if (!isZero(x)) return `subject ${JSON.stringify(bad)} was admitted`;
    let threw = false;
    try { AUTH.verifyAndAttest({ ...certOf('poly'), subject: bad }, 'h'); } catch { threw = true; }
    return threw ? true : `verifyAndAttest accepted subject ${JSON.stringify(bad)}`; })],

  ['CERT12', 'attestation is a CAPABILITY: the authority is minted once and is not a free export', (n) => trial(n, () => {
    // The previous round exported `attest(cert)` and said honestly it was unforgeable by data but
    // not by code. Once the same brand carries WORLD revisions and authority delegations, "any
    // module with package access may declare a fact authenticated" is not a boundary at all.
    let second = false;
    try { createAttestationAuthority({ name: 'attacker' }); } catch { second = true; }
    if (!second) return 'a second attestation authority was minted — the capability is not exclusive';
    // reading is NOT a privilege: asking whether a fact is authenticated must never require the
    // power to make it so
    const c = attest(certOf('poly'));
    if (!isAttested(c)) return 'isAttested cannot read a genuine brand';
    if (isAttested(certOf('poly'))) return 'isAttested reported an unattested certificate as attested';
    return true; })]
  ,
  // CERT13–CERT16, sixth outside review 2026-08-22. Two of these falsify the PREVIOUS round's fix,
  // which is the pattern worth noticing: CERT10 replaced a deduplicated leaf set with a canonical
  // term STRING, and the string shared a namespace with the leaves it was meant to distinguish.
  ['CERT13', 'the canonical subject encoding is INJECTIVE, and subject equality is the COMPLETE subject', (n) => trial(n, () => {
    // The README claimed "a canonical term cannot collide". It could:
    //     subject(A |> B)                          = "pipe(A,B)"
    //     subject(leaf whose hash IS "pipe(A,B)")  = "pipe(A,B)"
    //     subject((A&B)&C) = subject(leaf "and(A,B)" & C) = "and(A,B,C)"     <- unAnd() PARSED a leaf
    // Untrusted input that looks like grammar was read as grammar. Adversarial leaves below.
    const EVIL = ['pipe(A,B)', 'and(A,B)', 'A,B', '(', ')', ',', 'and(and(A,B),C)', '"', '\\', 'leaf', ' ',
      '["pipe",["leaf","weave-ir","A"],["leaf","weave-ir","B"]]',
      '["and",["leaf","weave-ir","A"],["leaf","weave-ir","B"]]'];
    const leaf = (h, kind = 'weave-ir') => boundBrick({ ...certOf('poly'), subject: { kind, hash: h } });
    const A = leaf('A'), B2 = leaf('B'), C2 = leaf('C');
    const sub = (r) => (isZero(r) ? null : r.cost.subject.hash);
    const realPipe = composePipe(A, B2), realAnd = composeAnd(composeAnd(A, B2), C2);
    for (const e of EVIL) {
      // A leaf's encoding always begins ["leaf", so it can never BE a pipe/and node. What must hold
      // is the composable property: an evil leaf never reaches a real composite's identity. The
      // forged `weave-composite` kind is included because the first repair would have re-parsed it.
      const imp = leaf(e);
      if (isZero(imp)) return `premise: leaf ${JSON.stringify(e)} was refused at construction`;
      if (sub(composePipe(imp, C2)) === sub(composePipe(realPipe, C2)))
        return `leaf ${JSON.stringify(e)} composed to a real |> identity`;
      if (sub(composeAnd(imp, C2)) === sub(composeAnd(realAnd, C2)))
        return `leaf ${JSON.stringify(e)} composed to a real & identity`;
      // A leaf may not CLAIM the composite kind at all — CERT22 made `kind` the discriminator of a
      // real union, so the forged-composite route is closed at validation rather than at
      // composition. This assertion used to compose such a leaf and check the identity differed;
      // it is now the stronger statement that the subject does not exist.
      if (!isZero(leaf(e, 'weave-composite')))
        return `a LEAF claiming kind 'weave-composite' with hash ${JSON.stringify(e)} was constructed`;
    }
    // ...and the structural equations still hold exactly where the suite proves them
    if (sub(composeAnd(composeAnd(A, B2), C2)) !== sub(composeAnd(A, composeAnd(B2, C2))))
      return '& stopped flattening, though CA1 associativity passes';
    if (sub(composeAnd(A, B2)) === sub(composeAnd(B2, A))) return '& canonicalised order (CP7 is open)';
    if (sub(composePipe(composePipe(A, B2), C2)) === sub(composePipe(A, composePipe(B2, C2))))
      return '|> flattened (CP5/CP6 are open)';

    // SUBJECT EQUALITY IS THE COMPLETE SUBJECT. `hash` alone let {world-revision, H} clear a floor
    // with a certificate for {weave-ir, H}, and leaf terms entered a composition as bare `H`.
    const c = attest(certOf('poly'));
    const H = c.subject.hash;
    if (!admitted(certBrick(c, { floor: ['authenticated'], artifact: { kind: 'weave-ir', hash: H } })))
      return 'a correctly-kinded artifact was refused';
    if (admitted(certBrick(c, { floor: ['authenticated'], artifact: { kind: 'world-revision', hash: H } })))
      return 'a certificate for {weave-ir, H} authenticated a claim to be {world-revision, H}';
    let bare = false; try { AUTH.verifyAndAttest(certOf('poly'), 'some-hash'); } catch { bare = true; }
    if (!bare) return 'verifyAndAttest accepted a bare hash as an expected subject';
    const c2 = certOf('poly');
    let kindMix = false;
    try { AUTH.verifyAndAttest(c2, { kind: 'world-revision', hash: c2.subject.hash }); } catch { kindMix = true; }
    if (!kindMix) return 'verifyAndAttest ignored a subject KIND mismatch';
    // two leaves differing ONLY in kind must not share a composed identity
    const k1 = leaf('SAME', 'weave-ir'), k2 = leaf('SAME', 'world-revision');
    if (sub(composePipe(k1, C2)) === sub(composePipe(k2, C2))) return 'leaf identity discarded `kind`';
    return true; })],

  ['CERT14', 'attestation alone does not authenticate a brick — attestation PLUS exact subject binding does', (n) => trial(n, () => {
    // `isAttested(brick.cost)` answers "was this certificate object verified"; it does not answer
    // "was it verified FOR THIS BRICK". Two different questions, and the runtime asked the first.
    const c = attest(certOf('poly'));
    const boundB = certBrick(c, { artifact: boundTo(c) });
    const misbound = certBrick(c, { artifact: { kind: c.subject.kind, hash: 'something-else' } });
    const wrongKind = certBrick(c, { artifact: { kind: 'world-revision', hash: c.subject.hash } });
    const unbound = certBrick(c);
    if (!authenticatedFor(boundB)) return 'a correctly bound attested brick is not authenticated';
    if (authenticatedFor(misbound)) return 'a brick carrying a certificate for something else is authenticated';
    if (authenticatedFor(wrongKind)) return 'kind was ignored by the authentication relation';
    if (authenticatedFor(unbound)) return 'a brick declaring no artifact is authenticated';
    // the flag remains true throughout — it was never the property
    if (!isAttested(misbound.cost)) return 'premise: the certificate is not attested, so this proves nothing';
    // presented (unattested) is never authenticated, however well bound
    const p = certOf('poly');
    if (authenticatedFor(certBrick(p, { artifact: boundTo(p) }))) return 'a merely presented certificate authenticated a brick';
    return true; })],

  ['CERT15', 'an authenticated composite requires every operand authenticated FOR ITS OWN artifact', (n) => trial(n, () => {
    // RESTATED 2026-08-22 (7th review). The original witness — two bricks each carrying an attested
    // certificate bound to something ELSE — no longer reaches composition at all: CERT21 moved
    // binding down to the BASELINE floor, so a misbound operand is 0̲ before any branding happens.
    // That is a strictly stronger outcome and it is tested by CERT21. What remains for this law is
    // the case binding cannot catch: an operand that declares NO artifact. It contradicts nothing,
    // so it is admitted — and an attested certificate riding on it must still not authenticate a
    // composite, because nothing has said the evidence is about that brick.
    const ca = attest(certOf('poly')), cb = attest(certOf('poly'));
    const anon = (c) => certBrick(c);                              // attested cert, no artifact claim
    const bound = (c) => certBrick(c, { artifact: boundTo(c) });
    for (const [label, fn] of [['|>', composePipe], ['&', composeAnd]]) {
      const good = fn(bound(ca), bound(cb));
      if (isZero(good)) return `${label}: a correctly bound pair floored`;
      if (!isAttested(good.cost)) return `${label}: a correctly bound pair was NOT authenticated`;
      if (!admitted(Brick({ ...good, floor: ['authenticated'] })))
        return `${label}: a correctly bound composite failed its own authenticated floor`;

      const orphan = fn(anon(ca), bound(cb));
      if (isZero(orphan)) return `${label}: premise — an unbound operand floored, so this proves nothing`;
      if (isAttested(orphan.cost)) return `${label}: an operand with no artifact produced an AUTHENTICATED composite`;
      if (admitted(Brick({ ...orphan, floor: ['authenticated'] })))
        return `${label}: an unbound composite cleared an authenticated floor`;
      if (fn(anon(ca), anon(cb)).artifact !== null)
        return `${label}: a composite invented an artifact from two operands that declared none`;
    }
    return true; })],

  ['CERT16', 'a composite artifact is derived from OPERAND ARTIFACTS, never from the certificate', (n) => trial(n, () => {
    // It was `{...cost.subject}`: the evidence manufactured the identity of the thing it was
    // evidence for, which makes any misbinding self-ratifying. Both identities are now computed by
    // the same rule over different inputs, so they COINCIDE exactly when each operand was bound.
    const ca = attest(certOf('poly')), cb = attest(certOf('poly'));
    const bx = certBrick(ca, { artifact: boundTo(ca) }), by = certBrick(cb, { artifact: boundTo(cb) });
    for (const [label, fn] of [['|>', composePipe], ['&', composeAnd]]) {
      const good = fn(bx, by);
      if (!good.artifact) return `${label}: a bound pair produced no composite artifact`;
      if (good.artifact.hash !== good.cost.subject.hash || good.artifact.kind !== good.cost.subject.kind)
        return `${label}: bound operands produced an artifact that is not its subject`;
      // a MISBOUND operand must make them diverge rather than agree by construction
      const mis = certBrick(ca, { artifact: { kind: ca.subject.kind, hash: 'elsewhere' } });
      const bad = fn(mis, by);
      if (!isZero(bad) && bad.artifact && bad.artifact.hash === bad.cost.subject.hash)
        return `${label}: a misbound operand still produced artifact === subject — the certificate defined the artifact`;
      // an operand with NO artifact yields a composite with none, rather than borrowing one
      const orphan = fn(certBrick(ca), by);
      if (!isZero(orphan) && orphan.artifact !== null)
        return `${label}: a composite invented an artifact for an operand that declared none`;
    }
    return true; })]
  ,
  // CERT17–CERT21, seventh outside review 2026-08-22. CERT16 was green and its INDUCTION STEP was
  // false: `A & B` bound correctly and `(A & B) & C` did not. The law tested the base case only.
  // Every law below is therefore stated over DEPTH and SHAPE rather than over one example.
  ['CERT17', 'a canonical subject survives Brick(), JSON and structured clone with its structure intact', (n) => trial(n, () => {
    // The term lived in a module-private WeakMap keyed on the subject OBJECT, so the meaning of a
    // subject depended on whether this exact JS object had been minted by this module instance.
    // `Brick()` canonicalises an artifact by building a fresh {kind, hash} — which erased it. The
    // certificate kept its term (carried by reference) and the artifact lost it, and the two
    // derivations stopped being the same derivation at the third composition. The principle:
    //
    //     A canonical identity is not canonical if reconstructing the same value erases
    //     information needed to EXTEND that identity.
    const A = boundLeaf(), B2 = boundLeaf(), C2 = boundLeaf();
    const AB = composeAnd(A, B2);
    if (isZero(AB)) return 'premise: a bound pair floored';
    const ref = composeAnd(AB, C2);
    const through = [
      ['re-Brick', Brick({ ...AB })],
      ['JSON', Brick(JSON.parse(JSON.stringify({ ...AB, cost: AB.cost })))],
      ['structuredClone', Brick(structuredClone({ ...AB, cost: AB.cost }))],
    ];
    for (const [how, copy] of through) {
      if (isZero(copy)) return `${how}: the copy did not survive construction`;
      const r = composeAnd(copy, C2);
      if (isZero(r)) return `${how}: composing the copy floored`;
      if (r.artifact?.hash !== ref.artifact?.hash) return `${how}: the artifact identity changed`;
      if (r.cost.subject.hash !== ref.cost.subject.hash) return `${how}: the certificate subject changed`;
    }
    // ...and a term may not disagree with the hash it ships beside, or it is not a canonical form
    const lie = { kind: 'weave-composite', hash: canonOf(['and', ['leaf', 'weave-ir', 'A']]),
                  term: ['and', ['leaf', 'weave-ir', 'B'], ['leaf', 'weave-ir', 'C']] };
    if (!isZero(certBrick(certOf('poly'), { artifact: lie })))
      return 'a term that disagrees with its own hash was accepted';
    for (const bad of [['bogus'], ['leaf'], ['pipe', ['leaf', 'weave-ir', 'A']], ['and', ['leaf', 'weave-ir', 'A']], 'nope', 42])
      if (!isZero(certBrick(certOf('poly'), { artifact: { kind: 'weave-composite', hash: 'h', term: bad } })))
        return `a malformed term ${JSON.stringify(bad)} was accepted`;
    return true; })],

  ['CERT18', 'exact binding is INDUCTIVE: artifact = subject at arbitrary depth, in every association', (n) => trial(n, () => {
    const depth = 2 + ((Math.random() * 6) | 0);                   // 2..7
    const shape = pick(['left', 'right', 'balanced']);
    for (const [label, fn] of [['&', composeAnd], ['|>', composePipe]]) {
      const r = treeOf(fn, depth, shape, boundLeaf);
      if (isZero(r)) return `${label} ${shape} depth ${depth}: floored`;
      if (!r.artifact) return `${label} ${shape} depth ${depth}: no composite artifact`;
      if (r.artifact.kind !== r.cost.subject.kind || r.artifact.hash !== r.cost.subject.hash)
        return `${label} ${shape} depth ${depth}: artifact ≠ subject — binding did not induct`;
    }
    return true; })],

  ['CERT19', 'the AUTHENTICATED carrier is closed at arbitrary depth', (n) => trial(n, () => {
    const depth = 2 + ((Math.random() * 6) | 0);
    const shape = pick(['left', 'right', 'balanced']);
    for (const [label, fn] of [['&', composeAnd], ['|>', composePipe]]) {
      const r = treeOf(fn, depth, shape, boundLeaf);
      if (isZero(r)) return `${label} ${shape} depth ${depth}: floored`;
      if (!authenticatedFor(r)) return `${label} ${shape} depth ${depth}: authentication did not induct`;
      if (!isAttested(r.cost)) return `${label} ${shape} depth ${depth}: the composite lost its brand`;
      if (!admitted(Brick({ ...r, floor: ['authenticated'] })))
        return `${label} ${shape} depth ${depth}: the composite failed its own authenticated floor`;
      // one unauthenticated leaf anywhere in the tree must break the brand for the whole tree
      const mixed = fn(r, presentedLeaf());
      if (isAttested(mixed.cost)) return `${label}: a merely presented leaf did not break the composite brand`;
    }
    return true; })],

  ['CERT20', 'presented evidence is BOUND evidence: binding is not part of authentication', (n) => trial(n, () => {
    // Binding and authentication answer different questions — what is this evidence ABOUT, and who
    // established that it is genuine. A certificate for A attached to artifact X is not an
    // unauthenticated certificate for X; it is the wrong certificate.
    const c = certOf('poly');                                      // presented, never attested
    const bound = certBrick(c, { artifact: boundTo(c) });
    if (!presentedFor(bound)) return 'a bound, well-formed, presented certificate is not presentedFor';
    if (authenticatedFor(bound)) return 'an unattested certificate authenticated a brick';
    const att = attest(certOf('poly'));
    const both = certBrick(att, { artifact: boundTo(att) });
    if (!presentedFor(both) || !authenticatedFor(both)) return 'attested + bound is not both';
    // absence is not contradiction: an unbound brick is admitted, and is neither presented-for nor
    // authenticated-for. The `bound` token turns the baseline rule into a positive requirement.
    const anon = certBrick(att);
    if (!admitted(anon)) return 'an absent artifact was treated as a contradiction';
    if (presentedFor(anon) || authenticatedFor(anon)) return 'a brick with no artifact claimed a binding';
    if (!isZero(composeAnd(certBrick(att, { floor: ['bound'] }), bound)))
      return 'floor:[bound] did not require the brick to declare what it is';
    return true; })],

  ['CERT21', 'MISBOUND evidence refuses at the BASELINE floor, attested or not', (n) => trial(n, () => {
    // It was admitted — LIVE, at the default floor — so the runtime held an object whose evidence
    // explicitly named something else, and two of them composed into one. Not a downgrade: an
    // internally inconsistent admitted object.
    const c = pick([certOf('poly'), attest(certOf('poly'))]);
    const wrongHash = certBrick(c, { artifact: { kind: c.subject.kind, hash: 'somewhere-else' } });
    const wrongKind = certBrick(c, { artifact: { kind: 'world-revision', hash: c.subject.hash } });
    const partner = boundLeaf();
    for (const [what, x] of [['hash', wrongHash], ['kind', wrongKind]]) {
      // Structurally valid and UNADMITTED — misbinding is a FLOOR condition, not a canonicalisation
      // one, exactly like `uncertified` and `policy-annihilate`. Brick() can read every field; what
      // it cannot do is decide admission. Asserting isZero() here would collapse the carrier ladder
      // AD1–AD3 exists to keep separate.
      if (isZero(x)) return `premise: the constructor floored it, so this proves nothing about the floor`;
      if (admitted(x)) return `a certificate misbound by ${what} was ADMITTED`;
      if (presentedFor(x)) return `a certificate misbound by ${what} counted as presented-for its brick`;
      for (const [label, fn] of [['|>', composePipe], ['&', composeAnd]]) {
        const r = fn(x, partner);
        if (!isZero(r)) return `${label}: a misbound operand composed`;
        if (!/certificate-misbound/.test(r.refusal || ''))
          return `${label}: the refusal did not name the misbinding (${r.refusal})`;
      }
    }
    return true; })]
  ,
  // CERT22–CERT23, eighth outside review 2026-08-22. Both are the previous round's fixes one level
  // deeper: CERT17 made the term DURABLE, and left a second representation of the same subject with
  // the term omitted; CERT11 required a non-empty binding at the ROOT, and left nested leaves
  // checked with a bare `typeof === 'string'`.
  ['CERT22', 'subject equality is SUBSTITUTIVE: sameSubject(x,y) ⇒ every future identity agrees', (n) => trial(n, () => {
    // `term` was optional on every subject and `sameSubject` compared kind+hash, so:
    //     {kind:'weave-composite', hash:H, term:['and',A,B]}   extends to ['and',A,B,C]
    //     {kind:'weave-composite', hash:H}                     extends to ['and',['leaf',…,H],C]
    // were EQUAL, and composing each with C produced different identities — one LIVE, one 0̲.
    // An equality relation under which x = y but compose(x,z) ≠ compose(y,z) is not the equality of
    // the carrier; it is a coincidence of two selected fields.
    //
    //     Two subjects are equal only if replacing one with the other cannot change any future
    //     canonical identity.
    const base = pick([composeAnd, composePipe])(boundLeaf(), boundLeaf());
    if (isZero(base)) return 'premise: a bound pair floored';
    const Z = boundLeaf();
    const refA = composeAnd(base, Z), refP = composePipe(base, Z);
    // every route by which two VALID subjects can be kind+hash equal
    for (const [how, art] of [
      ['spread', { ...base.artifact }],
      ['re-Brick', Brick({ ...base }).artifact],
      ['JSON', JSON.parse(JSON.stringify(base.artifact))],
      ['structuredClone', structuredClone(base.artifact)],
    ]) {
      const b = Brick({ ...base, artifact: art });
      if (isZero(b)) return `${how}: an equal subject did not survive construction`;
      if (presentedFor(b) !== presentedFor(base) || authenticatedFor(b) !== authenticatedFor(base))
        return `${how}: equal subjects disagree about binding`;
      const a2 = composeAnd(b, Z), p2 = composePipe(b, Z);
      if (isZero(a2) !== isZero(refA) || isZero(p2) !== isZero(refP))
        return `${how}: substituting an equal subject changed whether the composition floors`;
      if (a2.artifact?.hash !== refA.artifact?.hash || a2.cost.subject.hash !== refA.cost.subject.hash)
        return `${how}: substituting an equal subject changed the & identity`;
      if (p2.artifact?.hash !== refP.artifact?.hash || p2.cost.subject.hash !== refP.cost.subject.hash)
        return `${how}: substituting an equal subject changed the |> identity`;
    }
    // ...and the second representation must not exist: the union is DISCRIMINATED by `kind`.
    if (!isZero(Brick({ ...base, artifact: { kind: base.artifact.kind, hash: base.artifact.hash } })))
      return 'a composite subject with no term was accepted — two representations of one subject';
    const lf = boundLeaf();
    if (!isZero(Brick({ ...lf, artifact: { kind: lf.artifact.kind, hash: lf.artifact.hash, term: ['leaf', lf.artifact.kind, lf.artifact.hash] } })))
      return 'a LEAF carrying a term was accepted — the discriminator does not discriminate';
    return true; })],

  ['CERT23', 'a recursively canonical object enforces its invariants RECURSIVELY', (n) => trial(n, () => {
    // "Every subject binds a hash — leaf or composite, no exceptions" (CERT11) was enforced at the
    // ROOT and nowhere else: a leaf inside a term was checked with `typeof === 'string'`, so
    // ['leaf','',''] was a well-formed node. A term containing it attested, was admitted, and
    // cleared an `authenticated` floor while binding neither a namespace nor a digest at that
    // position. An invariant enforced at the root of a tree is enforced on one node.
    const withTerm = (term) => certBrick(certOf('poly'), { artifact: { kind: 'weave-composite', hash: canonOf(term), term } });
    const BAD = [
      ['and', ['leaf', '', ''], ['leaf', 'weave-ir', 'A']],
      ['and', ['leaf', '', 'A'], ['leaf', 'weave-ir', 'B']],
      ['and', ['leaf', 'weave-ir', ''], ['leaf', 'weave-ir', 'B']],
      ['pipe', ['and', ['leaf', '', ''], ['leaf', 'weave-ir', 'A']], ['leaf', 'weave-ir', 'B']],
      ['pipe', ['leaf', 'weave-ir', 'A'], ['pipe', ['leaf', 'weave-ir', 'B'], ['leaf', '', 'C']]],
      ['and', ['leaf', 'weave-composite', 'H'], ['leaf', 'weave-ir', 'A']],   // a leaf may not claim the composite kind
      ['and', ['leaf', 'weave-ir', 42], ['leaf', 'weave-ir', 'A']],
      ['and', ['leaf', 'weave-ir', null], ['leaf', 'weave-ir', 'A']],
      ['and', ['bogus', 'weave-ir', 'A'], ['leaf', 'weave-ir', 'B']],
      ['and', ['leaf', 'weave-ir', 'A']],                                     // & of one
      ['pipe', ['leaf', 'weave-ir', 'A']],                                    // |> of one
    ];
    const bad = pick(BAD);
    const x = withTerm(bad);
    if (!isZero(x)) return `a term with a malformed node was accepted: ${JSON.stringify(bad).slice(0, 90)}`;
    let attested = false;
    try {
      const c = { ...certOf('poly'), subject: { kind: 'weave-composite', hash: canonOf(bad), term: bad } };
      AUTH.verifyAndAttest(c, { kind: 'weave-composite', hash: canonOf(bad) });
      attested = true;
    } catch { /* the intended outcome */ }
    if (attested) return `verifyAndAttest attested a term with a malformed node: ${JSON.stringify(bad).slice(0, 90)}`;
    // ...and a well-formed nested term at depth is still accepted, or this law has banned the carrier
    const good = ['pipe', ['and', ['leaf', 'weave-ir', 'A'], ['leaf', 'weave-ir', 'B']], ['leaf', 'weave-ir', 'C']];
    if (isZero(withTerm(good))) return 'a well-formed nested term was refused';
    return true; })]
  ,
  ['CERT24', 'a runtime owns its attestation store: two runtimes share no authentication state', (n) => trial(n, () => {
    // The store began as one module-level WeakSet — "module-instance-order security", stated as a
    // limitation for three rounds. Once the same brand carries WORLD revisions, authority
    // delegations and receipt admission it IS the security root, and a security root whose scope is
    // "whoever imported this file first" is not a scope. A runtime now owns its store.
    const A = createComposeRuntime({ name: 'ta', verify: () => true });
    const B = createComposeRuntime({ name: 'tb', verify: () => true });
    // THE ATTESTED CERTIFICATE IS THE RETURN VALUE (CERT28). This used to discard it and attach the
    // INPUT object, which only worked because verifyAndAttest branded in place — and branding in
    // place is what let a verifier rewrite the subject between the check and the seal. The law's
    // subject is store isolation, so it takes the documented route like every other caller.
    const mk = (rt) => { const raw = certOf('poly');
      const c = rt.verifyAndAttest(raw, { kind: raw.subject.kind, hash: raw.subject.hash });
      if (rt.isAttested(raw)) return { fail: 'the caller\'s own reference was branded' };
      return certBrick(c, { artifact: boundTo(c) }); };
    const x = mk(A), y = mk(A);
    if (x.fail || y.fail) return x.fail || y.fail;
    if (!A.isAttested(x.cost) || !A.authenticatedFor(x)) return 'the minting runtime does not see its own attestation';
    if (B.isAttested(x.cost) || B.authenticatedFor(x)) return 'a second runtime saw the first runtime\'s attestation';
    if (isAttested(x.cost)) return 'the module default store saw a runtime-scoped attestation';
    const inA = A.composePipe(x, y), inB = B.composePipe(x, y);
    if (isZero(inA) || !A.isAttested(inA.cost)) return 'the minting runtime did not authenticate its own composite';
    if (isZero(inB) || B.isAttested(inB.cost)) return 'a foreign runtime authenticated a composite it never attested';
    if (!isZero(B.composePipe(Brick({ ...x, floor: ['authenticated'] }), y)))
      return 'a foreign runtime cleared an authenticated floor';
    if (isZero(A.composePipe(Brick({ ...x, floor: ['authenticated'] }), y)))
      return 'the minting runtime failed its own authenticated floor';
    // the units belong to every runtime, or they would be a special case in all but one
    for (const [label, rt] of [['A', A], ['B', B]]) {
      if (!rt.authenticatedFor(idBrick()) || !rt.authenticatedFor(none())) return `${label}: a unit is not authenticated in this runtime`;
      if (isZero(rt.composePipe(x, idBrick())) || isZero(rt.composeAnd(x, none()))) return `${label}: an identity stopped being an identity`;
      if (!isZero(rt.composeAnd(x, idBrick()))) return `${label}: a foreign unit composed`;
    }
    let noVerify = false;
    try { createComposeRuntime({ name: 'c' }); } catch { noVerify = true; }
    return noVerify ? true : 'a runtime was minted with no verifier'; })]
  ,
  // CERT25–CERT27, ninth outside review 2026-08-22, and they falsify the previous round's closing
  // sentence — "nothing in the certificate carrier is open" — which is the right outcome for a
  // sentence like that. CERT22 made the union structurally discriminated and left it SEMANTICALLY
  // undiscriminated; CERT17 made terms durable and left validity standing in for canonicality.
  ['CERT25', 'the subject discriminator agrees with the TERM discriminator', (n) => trial(n, () => {
    // A subject could say `kind:'weave-composite'` while carrying a LEAF term. The envelope check
    // ("a composite must have a term") never asked what the term DENOTED, so the wrapper was a
    // distinct subject at ingress and then evaporated at the identity layer:
    //
    //     F = {kind:'weave-composite', term:['leaf','weave-ir','A']}
    //     A = {kind:'weave-ir', hash:'A'}
    //     F ≠ A          at ingress
    //     F & C === A & C   at the canonical-identity layer
    //
    // A discriminator the two halves of an object can disagree about is not discriminating.
    const h = 'h' + ((Math.random() * 1e6) | 0);
    const leafTerm = ['leaf', 'weave-ir', h];
    const forged = { kind: 'weave-composite', hash: canonOf(leafTerm), term: leafTerm };
    if (!isZero(certBrick(certOf('poly'), { artifact: forged })))
      return 'a weave-composite carrying a LEAF term was constructed';
    let attested = false;
    try { const c = { ...certOf('poly'), subject: forged }; AUTH.verifyAndAttest(c, { ...forged }); attested = true; } catch { /* intended */ }
    if (attested) return 'a weave-composite carrying a LEAF term was attested';
    // ...and the real composite roots are still accepted, or this law has banned the carrier
    for (const t of [['and', ['leaf', 'weave-ir', 'A'], ['leaf', 'weave-ir', 'B']],
                     ['pipe', ['leaf', 'weave-ir', 'A'], ['leaf', 'weave-ir', 'B']]])
      if (isZero(certBrick(certOf('poly'), { artifact: { kind: 'weave-composite', hash: canonOf(t), term: t } })))
        return `a legitimate ${t[0]} root was refused`;
    return true; })],

  ['CERT26', 'every admitted composite subject is in the runtime\'s algebraic NORMAL FORM', (n) => trial(n, () => {
    // `wellFormedTerm` proves a grammar. It does not prove the tree is the runtime's representative
    // of its class, and the runtime itself only ever PRODUCES flat `and` because CA1 passes. So
    // `['and',['and',A,B],C]` was admitted beside `['and',A,B,C]` with a different hash.
    //
    //     Validity is not canonicality.
    //
    // Only PROVED equations are normalised: `&` flattens (CA1), `&` order is untouched (CA2 is
    // lattice-only, CP7 open), duplicates are kept (CA3 lattice-only, cost/q accrue), and `|>`
    // association is preserved exactly (CP5/CP6 open).
    const lf = (x) => ['leaf', 'weave-ir', x];
    const mk = (t) => certBrick(certOf('poly'), { artifact: { kind: 'weave-composite', hash: canonOf(t), term: t } });
    const NONCANONICAL = [
      ['and', ['and', lf('A'), lf('B')], lf('C')],
      ['and', lf('A'), ['and', lf('B'), lf('C')]],
      ['and', ['and', lf('A'), lf('B')], ['and', lf('C'), lf('D')]],
      ['pipe', ['and', ['and', lf('A'), lf('B')], lf('C')], lf('D')],
      ['and', lf('A'), ['and', lf('B'), ['and', lf('C'), lf('D')]]],
    ];
    const bad = pick(NONCANONICAL);
    if (!isZero(mk(bad))) return `a noncanonical term was admitted: ${canonOf(bad).slice(0, 90)}`;
    let attested = false;
    try { const c = { ...certOf('poly'), subject: { kind: 'weave-composite', hash: canonOf(bad), term: bad } };
          AUTH.verifyAndAttest(c, { kind: 'weave-composite', hash: canonOf(bad), term: bad }); attested = true; } catch { /* intended */ }
    if (attested) return `a noncanonical term was attested: ${canonOf(bad).slice(0, 90)}`;
    // REFUSED, not repaired — a supplied term is an identity ASSERTION, and a default may not
    // overwrite a claim. The flat form of the same tree must be the thing that is accepted.
    const flat = ['and', lf('A'), lf('B'), lf('C')];
    if (isZero(mk(flat))) return 'the flat & form was refused';
    // |> association is NOT normalised while CP5/CP6 are open
    for (const t of [['pipe', ['pipe', lf('A'), lf('B')], lf('C')], ['pipe', lf('A'), ['pipe', lf('B'), lf('C')]]])
      if (isZero(mk(t))) return `a |> association was refused: normalising there asserts an equation CP5/CP6 falsify`;
    return true; })],

  ['CERT27', 'algebraically equivalent & assemblies have exactly ONE admissible representation', (n) => trial(n, () => {
    // The consequence that matters for WORLD: two peers describing the same associative assembly
    // must mint the SAME authoritative identity, or a revision id is a function of how somebody
    // happened to parenthesise it.
    const depth = 3 + ((Math.random() * 4) | 0);                 // 3..6
    const ls = Array.from({ length: depth }, boundLeaf);
    const left = ls.reduce((a, b) => composeAnd(a, b));
    const right = ls.reduceRight((a, b) => composeAnd(b, a));
    const build = (xs) => (xs.length === 1 ? xs[0] : composeAnd(build(xs.slice(0, xs.length >> 1)), build(xs.slice(xs.length >> 1))));
    const bal = build(ls);
    if (isZero(left) || isZero(right) || isZero(bal)) return 'premise: a bound & tree floored';
    if (left.cost.subject.hash !== right.cost.subject.hash || left.cost.subject.hash !== bal.cost.subject.hash)
      return `three associations of one & assembly minted different identities at depth ${depth}`;
    if (left.artifact.hash !== left.cost.subject.hash) return 'the artifact drifted from the subject';
    // the normal form is FLAT and has exactly one child per leaf — no nesting, no dedup, no reorder
    const t = left.cost.subject.term;
    if (t[0] !== 'and' || t.length !== depth + 1) return `normal form is not flat at depth ${depth}: ${canonOf(t).slice(0, 90)}`;
    if (t.slice(1).some((c) => c[0] === 'and')) return 'a nested `and` survived into a runtime-minted identity';
    // ...and every runtime-minted subject must be re-admissible as an INPUT, or the carrier is not
    // closed over its own output
    if (isZero(certBrick(left.cost, { artifact: { ...left.artifact } })))
      return 'a runtime-minted composite subject was refused as an input';
    // |> keeps its association, so the two spellings stay DIFFERENT identities
    const pl = ls.reduce((a, b) => composePipe(a, b));
    const pr = ls.reduceRight((a, b) => composePipe(b, a));
    if (!isZero(pl) && !isZero(pr) && depth > 2 && pl.cost.subject.hash === pr.cost.subject.hash)
      return '|> associations collapsed — CP5/CP6 are open and that equation is not proved';
    return true; })]
  ,
  // -------------------------------------------------------------------------------------------
  // CERT28–CERT32, tenth outside review 2026-08-22. Four defects at the ingress boundary, and the
  // first two are the same sentence at two scales: THE THING CHECKED MUST BE THE THING KEPT.
  ['CERT28', 'verification cannot change the claim being authenticated: the structure verified is the structure branded', (n) => trial(n, () => {
    // The witness. `verifyAndAttest` validated the certificate, compared its subject to the
    // caller's expectation, called the injected verifier, and THEN froze and branded — so the
    // certificate was mutable for the whole of the check it was supposedly passing.
    //
    //     verify(cert) { cert.subject.hash = 'B'; return true }
    //     verifyAndAttest(cert-for-A, expected = A)   ⇒  attested, subject B
    //
    // "Verify this exact certificate for A" finished by authenticating B, and B admitted under
    // floor:['authenticated']. Same class as CERT8/CERT9: the brand outlived the claim.
    const raw = certOf('poly');
    const want = boundTo(raw);
    const other = { kind: 'weave-ir', hash: 'B' + ((Math.random() * 1e6) | 0) };
    const rt = createComposeRuntime({ name: 'mutating', verify: (c) => {
      try { c.subject.hash = other.hash; } catch { /* frozen — the point */ }
      return true; } });
    let cert = null, threw = false;
    try { cert = rt.verifyAndAttest(raw, want); } catch { threw = true; }
    if (!threw && cert.subject.hash !== want.hash) return 'the verifier moved the subject and it was branded anyway';
    if (!threw && !Object.isFrozen(cert.subject)) return 'the branded certificate is not deeply frozen';
    if (rt.isAttested(raw)) return 'the caller\'s still-mutable object was branded';
    // Whatever route it took, nothing may end up authenticated FOR the subject the verifier tried
    // to install — that is the consequence the defect actually bought.
    const b = certBrick(cert ?? raw, { artifact: other, floor: ['authenticated', 'bound'] });
    if (rt.authenticatedFor(b) || rt.admitted(b)) return 'a certificate for one subject authenticated another';
    // ...and an honest verification still attests, or the law is satisfied by breaking the feature.
    const ok = createComposeRuntime({ name: 'honest', verify: () => true });
    const src = certOf('poly');
    const good = ok.verifyAndAttest(src, boundTo(src));
    if (!ok.isAttested(good)) return 'an honest verification stopped attesting';
    if (ok.isAttested(src)) return 'an honest verification branded the caller\'s object rather than the snapshot';
    if (!ok.admitted(certBrick(good, { artifact: boundTo(good), floor: ['authenticated', 'bound'] })))
      return 'an honestly attested certificate no longer clears an authenticated floor';
    return true; })]
  ,
  ['CERT29', 'subject validation is TOTAL under the declared budget: no admissible term throws', (n) => (ceilingOnce = onceper(), trial(n, () => {
    // A valid, deeply nested `pipe` term is ordinary external data — `|>` association is preserved
    // while CP5/CP6 are open, so depth is exactly what a caller controls. Every walk over it used
    // to recurse (`wellFormedTerm`, `normalizeTerm`, `deepFreeze`, and `JSON.stringify` in C++), so
    // past some engine-specific depth a hostile certificate produced a RangeError instead of 0̲.
    // Fail-closed means REFUSED, and a thrown RangeError is not a refusal — it is the runtime
    // reporting that it broke.
    const { d, subject } = ceilingOnce() ? AT_CEILING : pick(IN_BUDGET);
    let b;
    try { b = certBrick(withSubject(certOf('poly'), subject), { artifact: subject }); }
    catch (e) { return `depth ${d} threw ${e.constructor.name} at Brick ingress`; }
    if (isZero(b)) return `depth ${d} is inside the declared budget and was refused anyway`;
    if (!admitted(b)) return `depth ${d} is inside the declared budget and did not admit`;
    // ...and the runtime's own attestation path is total over the same input. A COMPOSITE
    // expectation carries its term (CERT13/CERT23), so this cannot go through `attest`, whose
    // {kind, hash} shorthand is only a subject for a leaf.
    try { AUTH.verifyAndAttest(withSubject(certOf('poly'), subject), subject); }
    catch (e) { return `depth ${d} threw ${e.constructor.name} at verifyAndAttest: ${e.message.slice(0, 70)}`; }
    return true; }))]
  ,
  ['CERT30', 'an over-budget subject refuses BY NAME, never by exception', (n) => (deepOnce = onceper(), trial(n, () => {
    // The other half of CERT29, and the reason a budget is stated rather than discovered: past the
    // ceiling the answer must still be an answer. Depth and node count are checked separately
    // because they are different exhaustions — a deep chain and a wide fan-out.
    // The WIDE case is refused in O(1) — a fan-out wider than the whole budget is visible from the
    // node itself, so it is cheap enough to run on every trial. The DEEP case cannot be: depth is
    // only discoverable by descending, so refusing it costs a bounded 4096 steps, and it runs
    // exactly ONCE per pass. Both ceilings are deterministic; neither is a distribution.
    const over = deepOnce() ? 'deep' : 'wide';
    const subject = over === 'deep' ? OVER_DEEP : OVER_WIDE;
    let b;
    try { b = certBrick(withSubject(certOf('poly'), subject), { artifact: subject }); }
    catch (e) { return `an over-budget ${over} subject threw ${e.constructor.name} instead of refusing`; }
    if (!isZero(b)) return `an over-budget ${over} subject was admitted`;
    let named = false;
    try { AUTH.verifyAndAttest(withSubject(certOf('poly'), subject), subject); }
    catch (e) { named = /over-budget/.test(e.message); }
    return named ? true : `verifyAndAttest did not name the budget when refusing an over-budget ${over} subject`; }))]
  ,
  ['CERT31', 'a canonical hash is computed from what the term CONTAINS, never from what it volunteers', (n) => trial(n, () => {
    // `canonTerm` was `JSON.stringify`, which calls `toJSON()`. `Array.isArray` is true of an Array
    // SUBCLASS, so a leaf could contain A and serialise as X — two different terms, one canonical
    // hash, and `sameSubject` is kind+hash. A certificate about A then attested against an
    // expectation of X and the brick carrying it admitted.
    const real = 'A' + ((Math.random() * 1e6) | 0), fake = 'X' + ((Math.random() * 1e6) | 0);
    class Sneaky extends Array { toJSON() { return ['leaf', 'weave-ir', fake]; } }
    const sneak = ['pipe', Sneaky.from(['leaf', 'weave-ir', real]), ['leaf', 'weave-ir', 'C']];
    const honest = ['pipe', ['leaf', 'weave-ir', fake], ['leaf', 'weave-ir', 'C']];
    if (canonOf(sneak) !== canonOf(honest)) return 'premise: the two terms no longer collide under JSON.stringify';
    const spoofed = { kind: 'weave-composite', hash: canonOf(honest), term: sneak };
    const expected = { kind: 'weave-composite', hash: canonOf(honest), term: honest };
    // 1. it must not enter as an artifact
    if (!isZero(certBrick(withSubject(certOf('poly'), spoofed), { artifact: spoofed })))
      return 'a term that hashes as something other than its contents was admitted';
    // 2. it must not attest against the term it impersonates
    let refused = false;
    try { AUTH.verifyAndAttest(withSubject(certOf('poly'), spoofed), spoofed); } catch { refused = true; }
    if (!refused) return 'a spoofed term was attested';
    let crossRefused = false;
    try { AUTH.verifyAndAttest(withSubject(certOf('poly'), spoofed), expected); } catch { crossRefused = true; }
    if (!crossRefused) return 'a certificate about one term authenticated an expectation of another';
    // 3. what a brick STORES is a copy, so a later reader cannot be told a different story
    const plain = ['pipe', ['leaf', 'weave-ir', real], ['leaf', 'weave-ir', 'C']];
    const good = { kind: 'weave-composite', hash: canonOf(plain), term: plain };
    const kept = certBrick(withSubject(certOf('poly'), good), { artifact: good });
    if (isZero(kept)) return 'premise: the plain term was refused';
    if (kept.artifact.term === plain) return 'the brick adopted the caller\'s array instead of copying it';
    return true; })]
  ,
  ['CERT32', 'the canonical serialiser is byte-identical to the JSON.stringify that minted every existing hash', (n) => trial(n, () => {
    // canonTerm stopped being `JSON.stringify` so that it could not be redirected by a `toJSON`
    // hook and so that it could not recurse. A canonical form that changes its BYTES changes every
    // hash ever minted, so the rewrite is only admissible if it is byte-for-byte the old one on
    // plain data. Tested through the public surface: a subject whose hash is `JSON.stringify(term)`
    // must still validate, and `validSubject` is precisely `hash === canonTerm(term)`.
    const term = genCanonTerm(3, true);
    const subject = { kind: 'weave-composite', hash: canonOf(term), term };
    const b = certBrick(withSubject(certOf('poly'), subject), { artifact: subject });
    if (isZero(b)) return `a JSON.stringify hash no longer validates: ${canonOf(term).slice(0, 120)}`;
    if (b.artifact.hash !== canonOf(term)) return 'the stored hash drifted from JSON.stringify';
    return true; })]
  ,
  // -------------------------------------------------------------------------------------------
  // CERT33-CERT35, eleventh outside review 2026-08-23. Three more ways the ingress boundary was
  // narrower than the sentence describing it.
  ['CERT33', 'the byte budget is CANONICAL SERIALISED UTF-8 BYTES, not source string units', (n) => trial(n, () => {
    // The ceiling said 4 MiB and counted `s.length`. Those differ by SIX for a control character:
    // 750,000 U+0000 is 750,000 source units and 4,500,055 canonical bytes, so a subject a third
    // over the ceiling was admitted. A budget must name the quantity it bounds, and the quantity
    // that matters is the one that gets stored, hashed and shipped.
    const str = Array.from({ length: 1 + ((Math.random() * 24) | 0) }, () => pick(BYTE_CLASSES)).join('');
    const oracle = new TextEncoder().encode(JSON.stringify(str)).length;
    const got = canonBytes(str);
    if (got !== oracle) return `canonBytes ${got} vs oracle ${oracle} for ${JSON.stringify(str).slice(0, 40)}`;
    return true; })]
  ,
  ['CERT34', 'the hostile-data boundary is TOTAL: ingest yields a named 0-bar or a Brick, never an exception', (n) => trial(n, () => {
    // CERT28 made the CERTIFICATE route snapshot-first, and outside review then asked whether that
    // was a property of the route or of public ingress. It was the route. The answer taken is that
    // the boundary is DECLARED and one function owns it: Brick/composeAnd/composePipe/composeTree
    // are trusted construction over values you already own, and `ingest` is the door for anything
    // off a wire, out of a store, or across a realm. A door that throws is not a door.
    const { v, label } = hostileBrick();
    let out;
    try { out = trusted.adopt(v); } catch (e) { return `adopt threw ${e.constructor.name} on: ${label}`; }
    if (!isBrickish(out)) return `adopt returned a non-Brick for: ${label}`;
    if (isZero(out) && !isStr(out.refusal)) return `adopt refused without saying why: ${label}`;
    if (label === 'a well-formed brick') {
      if (isZero(out)) return 'adopt refused a well-formed brick';
      // ...and the evidence it decided about cannot be rewritten afterwards, which is the whole
      // reason WORLD is to accept this route and not the by-reference one.
      if (!Object.isFrozen(out) || !Object.isFrozen(out.cost) || !Object.isFrozen(out.cost.policy))
        return 'an adopted brick is not deeply frozen';
      let mutated = false;
      try { out.cost.policy.resourceDecision = 'annihilate'; mutated = out.cost.policy.resourceDecision === 'annihilate'; } catch { /* frozen */ }
      if (mutated) return 'an adopted brick\'s verdict was rewritten after it was reached';
    }
    return true; })]
  ,
  ['CERT35', 'refusing is not more expensive than accepting: a diagnostic does no unbounded work on what it declines', (n) => (bytesOnce = onceper(), trial(n, () => {
    // Found by MEASURING this suite rather than by reading it. `malformedCert` built its message
    // with `JSON.stringify(c.subject).slice(0, 200)` — serialise the whole subject, keep 200 chars.
    // Refusing a 100,100-leaf term therefore cost a full serialisation of the term: the CHECK was
    // O(1) and the SENTENCE ABOUT THE CHECK was O(n). That is the same exhaustion the budget exists
    // to refuse, reached through the one path everything hostile is guaranteed to take. Measured at
    // 15.4 s across one law's refusals; the suite went 28.6 s to 13.3 s when it was fixed.
    // The byte ceiling is deterministic like the other two, and it is the expensive one to reach:
    // at six canonical bytes per U+0000 the counter must read ~700,000 characters before it can
    // say no. Once per pass; the other two are cheap enough to draw every trial.
    const subject = bytesOnce() ? HUGE_LEAF_SUBJECT : pick([OVER_WIDE, OVER_DEEP]);
    const b = certBrick(withSubject(certOf('poly'), subject), { artifact: subject });
    if (!isZero(b)) return 'premise: an over-budget subject was admitted';
    if (!isStr(b.refusal)) return 'an over-budget brick refused without saying why';
    if (b.refusal.length > 600) return `a refusal message grew with its input: ${b.refusal.length} chars`;
    let msg = '';
    try { AUTH.verifyAndAttest(withSubject(certOf('poly'), subject), subject); } catch (e) { msg = e.message; }
    if (!msg) return 'premise: verifyAndAttest admitted an over-budget subject';
    if (msg.length > 600) return `a thrown refusal grew with its input: ${msg.length} chars`;
    return true; }))]
  ,
  // -------------------------------------------------------------------------------------------
  // CERT36-CERT38, twelfth outside review 2026-08-23. The boundary built to hold hostile data had
  // to be held to the same doctrine as everything behind it.
  ['CERT36', 'an inert snapshot has NO semantic prototype: every field is own data, none is inherited', (n) => trial(n, () => {
    // `{}` inherits `Object.prototype`, and `Object.prototype` has an accessor named `__proto__`.
    // `JSON.parse` treats that key as ORDINARY DATA and produces it as an own property; copying it
    // out with `dst[k] = v` runs the inherited setter and re-points the destination's PROTOTYPE.
    // So a certificate could arrive with no own `subject` at all, inherit a valid one, validate,
    // attest — and then be rewritten through a prototype that `deepFreeze` never walked, because
    // `getOwnPropertyNames` does not see inherited properties:
    //
    //     Object.getPrototypeOf(cert).subject.hash = 'B'    …after attestation
    //     authenticatedFor(B) = true, admitted(B) = true
    //
    // CERT8/CERT28 a third time, through inheritance rather than through mutability.
    const real = 'A' + ((Math.random() * 1e6) | 0), fake = 'B' + ((Math.random() * 1e6) | 0);
    // The JSON TEXT is built by hand on purpose: in an object literal `__proto__:` sets the
    // prototype rather than creating a key, so `JSON.stringify({__proto__: x})` emits `{}` and the
    // witness would quietly test nothing. Only the parser produces `__proto__` as own data.
    const payload = JSON.stringify({ subject: { kind: 'weave-ir', hash: real }, analyzer: { name: 'w', version: '1' },
                                     verdict: { certified: true, costClass: 'poly' }, policy: { resourceDecision: 'allow' } });
    const poisoned = JSON.parse('{\"__proto__\": ' + payload + '}');
    // premise: the payload really did arrive as an own `__proto__` key, or this proves nothing
    if (!Object.hasOwn(poisoned, '__proto__')) return 'premise: JSON.parse did not produce an own __proto__ key';
    const rt = createComposeRuntime({ name: 'p' + ((Math.random() * 1e9) | 0), verify: () => true });
    let cert = null;
    try { cert = rt.verifyAndAttest(poisoned, { kind: 'weave-ir', hash: real }); } catch { /* refused */ }
    if (cert) return 'a certificate with no own subject was attested through its prototype';
    // ...and a LEGITIMATE certificate that merely carries a field NAMED __proto__ keeps it as data
    const subject = { kind: 'weave-ir', hash: real };
    const carrier = JSON.parse(JSON.stringify({ ...certOf('poly'), subject }));
    Object.defineProperty(carrier, '__proto__', { value: { note: fake }, writable: true, enumerable: true, configurable: true });
    let kept = null;
    try { kept = rt.verifyAndAttest(carrier, subject); } catch (e) { return `a field named __proto__ made a valid certificate refuse: ${e.message.slice(0, 60)}`; }
    if (Object.getPrototypeOf(kept) !== null) return 'the snapshot has a prototype';
    if (!Object.hasOwn(kept, '__proto__')) return '__proto__ was not preserved as ordinary own data';
    if (!Object.hasOwn(kept, 'subject')) return 'subject is not an own property of the snapshot';
    if (!Object.isFrozen(kept['__proto__'])) return 'a field of the snapshot escaped the deep freeze';
    return true; })]
  ,
  ['CERT37', 'descriptor-only ingress really is descriptor-only: no caller code runs during a snapshot', (n) => trial(n, () => {
    // The per-key read was descriptor-based; INDEX DISCOVERY was not. `Array.from(src, ...)`
    // iterates the source, so an accessor on an element ran once per snapshot. The outer catch kept
    // the never-throw contract — which is why this was invisible — but a getter that performs a
    // side effect and returns normally defeated the stronger property the boundary is FOR.
    let ran = 0;
    const arr = [];
    Object.defineProperty(arr, '0', { get() { ran++; return 'x'; }, enumerable: true, configurable: true });
    Object.defineProperty(arr, 'length', { value: 1, writable: true });
    const where = pick(['sigma', 'authority', 'audit']);
    const raw = { contract: { accepts_from: '*', feeds_into: '*' },
      value: { beta: 0.9, kappa: false, sigma: [], pi: null, [where]: arr },
      q: { confidence: 1, cost: 0, latency: 0 }, artifact: { kind: 'weave-ir', hash: 'A' },
      cost: certOf('poly') };
    const rt = createComposeRuntime({ name: 'd' + ((Math.random() * 1e9) | 0), verify: () => true });
    let out;
    try { out = rt.trusted.adopt(raw); } catch (e) { return `adopt threw ${e.constructor.name}`; }
    if (ran !== 0) return `an element accessor ran ${ran} time(s) while the snapshot discovered indices`;
    if (!isZero(out)) return 'an array carrying an accessor was adopted as inert data';
    if (!isStr(out.refusal)) return 'it refused without saying why';
    return true; })]
  ,
  ['CERT38', 'the state WORLD requires is reachable by ONE call: ingested AND authenticated AND immutable', (n) => trial(n, () => {
    // §15.4 ruled that WORLD accepts ingested-and-authenticated bricks only. That state could not
    // be constructed from outside: the brand is object identity in a WeakSet, so any copying
    // boundary drops it, and `ingest` and `verifyAndAttest` are both copying boundaries — whichever
    // runs second undoes the other. A rule whose required state has no construction path is not a
    // rule. The sequence now happens inside the runtime, where the brand is applied after the last
    // copy.
    const subject = { kind: 'weave-ir', hash: 'h' + ((Math.random() * 1e9) | 0) };
    const raw = { contract: { accepts_from: '*', feeds_into: '*' },
      value: { beta: 0.9, kappa: false, sigma: [], pi: null }, q: { confidence: 1, cost: 0, latency: 0 },
      artifact: { ...subject }, floor: ['authenticated', 'bound'],
      cost: { ...certOf('poly'), subject: { ...subject } } };
    const rt = createComposeRuntime({ name: 'w' + ((Math.random() * 1e9) | 0), verify: () => true });
    const b = rt.ingestJSONAndVerify(JSON.stringify(raw));
    if (isZero(b)) return `a well-formed brick was refused: ${b.refusal}`;
    if (!rt.authenticatedFor(b)) return 'the result is not authenticated';
    if (!rt.admitted(b)) return 'the result does not clear its own authenticated+bound floor';
    if (!Object.isFrozen(b) || !Object.isFrozen(b.cost) || !Object.isFrozen(b.cost.policy))
      return 'the result is not deeply frozen';
    let mutated = false;
    try { b.cost.policy.resourceDecision = 'annihilate'; mutated = b.cost.policy.resourceDecision === 'annihilate'; } catch { /* frozen */ }
    if (mutated) return 'the verdict was rewritten after it was reached';
    // THE PROPERTY IS NOT A FIELD. A boolean would be the caller-asserted authority CERT1 removed.
    if ('ingested' in b || 'authenticated' in b) return 'the property was published as a forgeable field';
    // ...runtime-owned, so a second runtime sees it as merely presented (CERT24)
    const other = createComposeRuntime({ name: 'o' + ((Math.random() * 1e9) | 0), verify: () => true });
    if (other.authenticatedFor(b)) return 'a foreign runtime saw this runtime\'s attestation';
    // ...and it refuses BY NAME rather than throwing, on every route a caller can reach
    for (const [label, bad] of [
      ['no artifact', { ...raw, artifact: undefined }],
      ['no certificate', { ...raw, cost: undefined }],
      ['a bare primitive', 42],
      ['a hostile getter', (() => { const o = { ...raw }; Object.defineProperty(o, 'cost', { get() { throw new Error('ran'); }, enumerable: true }); return o; })()],
    ]) {
      let r;
      try { r = rt.trusted.adoptAndVerify(bad); } catch (e) { return `adoptAndVerify threw ${e.constructor.name} on ${label}`; }
      if (!isZero(r)) return `${label} produced a live brick`;
      if (!isStr(r.refusal)) return `${label} refused without saying why`;
    }
    // ...and a verifier that declines produces a refusal naming the verifier, not a generic one
    const strict = createComposeRuntime({ name: 'strict', verify: () => false });
    const no = strict.ingestJSONAndVerify(JSON.stringify(raw));
    if (!isZero(no) || !/strict refused/.test(String(no.refusal))) return 'a declining verifier did not surface its own refusal';
    return true; })]
  ,
  // -------------------------------------------------------------------------------------------
  // CERT39/CERT40, thirteenth outside review 2026-08-23. The last two, and then WORLD.
  ['CERT39', 'the hostile boundary takes BYTES, because reflection over an object is executable', (n) => trial(n, () => {
    // The frontier file said to attack the copier's reliance on `getOwnPropertyNames` and
    // `getOwnPropertyDescriptor` as structural truth. They are Proxy TRAPS. A valid brick wrapped in
    // a counting Proxy produced a live, authenticated, frozen result — the strongest state this
    // runtime can hand to WORLD — while executing eight trap invocations of caller JavaScript
    // during the supposedly inert snapshot.
    //
    // There is no portable way to inspect an arbitrary JS object while guaranteeing its traps do
    // not run: an API that has already RECEIVED an object graph has crossed the line too late. So
    // this is a boundary ruling rather than another reflection trick — the guarantee moves to where
    // it is provable, which is a parser the runtime owns over bytes the caller cannot animate.
    const target = wellFormedRaw();
    let traps = 0;
    const spy = new Proxy(target, {
      getPrototypeOf(t) { traps++; return Reflect.getPrototypeOf(t); },
      ownKeys(t) { traps++; return Reflect.ownKeys(t); },
      getOwnPropertyDescriptor(t, k) { traps++; return Reflect.getOwnPropertyDescriptor(t, k); },
    });
    const rt = createComposeRuntime({ name: 'j' + ((Math.random() * 1e9) | 0), verify: () => true });
    // 1. THE BYTES ROUTE EXECUTES NOTHING, and still produces the admissible state.
    const viaJSON = rt.ingestJSONAndVerify(JSON.stringify(target));
    if (traps !== 0) return `the JSON route executed ${traps} trap(s) — it is not a bytes boundary`;
    if (isZero(viaJSON)) return `a well-formed brick was refused through the JSON route: ${viaJSON.refusal}`;
    if (!rt.authenticatedFor(viaJSON) || !Object.isFrozen(viaJSON)) return 'the JSON route did not produce the admissible state';
    // 2. HANDING IT AN OBJECT IS REFUSED BY NAME — the door does not quietly accept the weaker input.
    for (const notText of [spy, target, 42, null, undefined, ['[]']]) {
      const r = rt.ingestJSONAndVerify(notText);
      if (!isZero(r) || !/not-json/.test(String(r.refusal))) return 'the JSON route accepted something that was not text';
    }
    if (traps !== 0) return `refusing a Proxy executed ${traps} trap(s)`;
    // 3. ...and malformed text refuses by name rather than throwing.
    const junk = ingestJSON(pick(['{oops', '', '[', 'null', '"a string"', '{"a":']));
    if (!isBrickish(junk) || !isZero(junk) || !isStr(junk.refusal)) return 'malformed JSON did not refuse by name';
    // 4. THE OBJECT ROUTE IS THE WEAKER ONE, and the law states that rather than pretending
    //    otherwise: traps MAY run, and it still never throws and still yields a Brick.
    let viaObj;
    try { viaObj = rt.trusted.adoptAndVerify(spy); } catch (e) { return `adoptAndVerify threw ${e.constructor.name}`; }
    if (!isBrickish(viaObj)) return 'adoptAndVerify returned a non-Brick';
    if (traps === 0) return 'premise: the object route did not exercise the Proxy at all, so this proves nothing';
    return true; })]
  ,
  ['CERT40', 'an own `undefined` is not absence: the boundary never erases present evidence', (n) => trial(n, () => {
    // The copier skipped `undefined` on the reasoning that JSON has none and `JSON.stringify` drops
    // such a key. Wrong in both directions: in an ARRAY, `JSON.stringify` emits `null` and keeps the
    // slot, so the two carriers disagreed — and far worse, dropping it turned
    //
    //     floor: [undefined]     PRESENT + INVALID  ⇒ Brick() refuses (unrecognised token)
    //     floor: []              NO REQUIREMENT     ⇒ admitted
    //
    // The hostile boundary made the object LESS CONSTRAINED than the input asked for. `floor` is
    // the worst carrier for it to happen on, because erasing a requirement is indistinguishable in
    // a receipt from satisfying one. Sixth carrier, same rule.
    const where = pick(['floor', 'sigma', 'authority', 'audit', 'field', 'nested']);
    const raw = wellFormedRaw();
    if (where === 'floor') raw.floor = ['authenticated', undefined];
    else if (where === 'field') raw.utility = undefined;
    else if (where === 'nested') raw.cost.policy.reason = undefined;
    else raw.value[where] = [undefined];
    const rt = createComposeRuntime({ name: 'u' + ((Math.random() * 1e9) | 0), verify: () => true });
    for (const [label, out] of [['trusted.adopt', trusted.adopt(raw)], ['trusted.adoptAndVerify', rt.trusted.adoptAndVerify(raw)]]) {
      if (!isZero(out)) return `${label} admitted a brick carrying an own undefined in \`${where}\``;
      if (!isStr(out.refusal) || !/undefined/.test(out.refusal))
        return `${label} refused without naming the undefined: ${out.refusal}`;
    }
    // ...and the floor case specifically: the requirement must NOT have been erased into absence
    if (where === 'floor') {
      const erased = trusted.adopt(raw);
      if (Array.isArray(erased.floor) && erased.floor.length === 1 && erased.floor[0] === 'authenticated')
        return 'the invalid floor token was erased and the valid one kept — a weaker object than was asked for';
    }
    return true; })]
];





// ---------------- KNOWN GAPS (xfail) — laws that SHOULD hold but a real soundness bug FALSIFIES ---
// The |> phase-floor is NOT association-invariant. chain() (value.mjs) refuses a backward step on
// the IMMEDIATE pair but sets the composite's exit phase to the LATER stage, and a Value carries a
// single π — so a|>(b|>c) collapses (b|>c) to its EXIT phase and the outer guard never sees b's
// earlier ENTRY phase. Counterexample π=[act,retrieve,consolidate]: (a|>b)|>c = 0̲ (floor fires) but
// a|>(b|>c) = LIVE (floor BYPASSED) — reachable through the public composeTree with a right-leaning
// AST, not just manual nesting. CP1 cannot see it because it only ever draws SORTED phases.
// These are XFAIL: they do NOT fail the build while open (the enforced laws stay green); the build
// FAILS only if one starts PASSING — the signal the fix landed and the law should be promoted into a
// real suite. Found by the residency falsifier — see the-residency/EVIDENCE/algebra-finding.md.
//
// ROOT CAUSE (the deepening): "|> is non-associative" is a SYMPTOM. The disease is Value.pi — a
// SINGLE-slot phase carrier set ORDER-DEPENDENTLY by combine()'s firstNonNull and READ by |>'s floor.
// CP5/CP6 are symptom 1 (|> re-association). CP7 is symptom 2: combine() picks pi order-dependently,
// so &-operand order leaks into a downstream |> floor — even though & is advertised commutative and
// &'s OWN floor IS commutative (see ANCHOR/AC-COMM below, which PASSES). CP7 breaks fix Option 2
// (left-fold-only |>): there is no |> re-grouping to outlaw here. Only carrying an [entry,exit]
// interval (Option 1) closes both symptoms.
const rndPhase = () => PHASES[(Math.random() * PHASES.length) | 0];
const descends = (ps) => ps.some((p, i) => i > 0 && phaseIdx(ps[i - 1]) > phaseIdx(p));
export const GAP = [
  ['CP5', 'the |> floor is ASSOCIATION-INVARIANT: isZero((a|>b)|>c) === isZero(a|>(b|>c))', (n) => trial(n, () => {
    const a = pipeBrick(rndPhase()), b = pipeBrick(rndPhase()), c = pipeBrick(rndPhase());
    const l = composePipe(composePipe(a, b), c), r = composePipe(a, composePipe(b, c));
    return isZero(l) === isZero(r) ? true
      : `π=[${a.value.pi}, ${b.value.pi}, ${c.value.pi}] → (a|>b)|>c ${isZero(l) ? '0̲' : 'live'}, a|>(b|>c) ${isZero(r) ? '0̲' : 'live'}`; })],
  ['CP6', 'NO backward execution step survives |>, in either association', (n) => trial(n, () => {
    const ps = [rndPhase(), rndPhase(), rndPhase()];
    const [a, b, c] = ps.map((p) => pipeBrick(p));
    if (!descends(ps)) return true; // law only constrains backward sequences
    const l = composePipe(composePipe(a, b), c), r = composePipe(a, composePipe(b, c));
    return (isZero(l) && isZero(r)) ? true
      : `π=[${ps.join(', ')}] has a backward step yet survives: (a|>b)|>c ${isZero(l) ? '0̲' : 'LIVE'}, a|>(b|>c) ${isZero(r) ? '0̲' : 'LIVE'}`; })],
  ['CP7', '&-operand order does not change a downstream |> floor: isZero((a&b)|>c) === isZero((b&a)|>c)', (n) => trial(n, () => {
    const a = pipeBrick(rndPhase()), b = pipeBrick(rndPhase()), c = pipeBrick(rndPhase());
    const l = composePipe(composeAnd(a, b), c), r = composePipe(composeAnd(b, a), c);
    return isZero(l) === isZero(r) ? true
      : `π=[${a.value.pi}, ${b.value.pi}, ${c.value.pi}] → (a&b)|>c ${isZero(l) ? '0̲' : 'LIVE'}, (b&a)|>c ${isZero(r) ? '0̲' : 'LIVE'} (& is "commutative")`; })]
];

// PASSING anchor — pins what IS sound about &: its OWN floor is commutative (operand order does not
// change whether a coalition annihilates), because the floor reads only commutative inputs and NOT
// pi/authority/audit. Unlike GAP, a FAILURE here counts against the build — a green anchor next to
// the red gaps. If this ever falsifies, & developed a |>-class bug of its own.
export const ANCHOR = [
  ['AC-COMM', "&'s OWN floor is commutative: isZero(a&b) === isZero(b&a)", (n) => trial(n, () => {
    const a = pipeBrick(rndPhase()), b = pipeBrick(rndPhase());
    return isZero(composeAnd(a, b)) === isZero(composeAnd(b, a)) ? true
      : `π=[${a.value.pi}, ${b.value.pi}] a&b ${isZero(composeAnd(a, b)) ? '0̲' : 'live'}, b&a ${isZero(composeAnd(b, a)) ? '0̲' : 'live'}`; })]
];

// ---------------- harness (Node CLI; mirrors test/laws.mjs) -----------------------------------
export function runSet(laws, N) {
  let pass = 0, fail = 0; const results = [];
  for (const [id, desc, fn] of laws) {
    const r = fn(N);
    results.push({ id, desc, pass: r.pass, cex: r.cex, at: r.at });
    if (r.pass) pass++; else fail++;
  }
  return { pass, fail, results };
}

// ---------------- SINGLE-AXIS helpers -----------------------------------------------------------
// ONE TRUST BOUNDARY AT A TIME. Named on outside review 2026-08-22, and it explains why CX6 sat
// green over three of the bugs this suite has since had to add laws for. CX6 is a fuzzer: it builds
// operands with SEVERAL fields garbage at once and asserts the result is "0̲ or a valid Brick". When
// such an operand floors, the fuzzer cannot say WHICH garbage field floored it — and in practice an
// uncertified cost floored nearly all of them long before the malformed `q` was ever consulted. One
// defect masked another, and the suite reported success.
//
// So: fuzz to EXPLORE, but once a field is trust-relevant, give it a law whose operand is valid in
// every respect except that one field. Then a pass means that field is checked, and nothing else
// can be doing the work.
const VALID = () => ({
  id: 'ok', holder: null,
  contract: { accepts_from: ANY, feeds_into: ANY },
  value: V({ beta: 0.9, kappa: false, sigma: [], pi: null }),
  cost: certOf('poly'),
  q: { confidence: 0.9, cost: 1, latency: 1 },
  utility: 1, laws: [], floor: []
});
// exactly one field replaced; everything else is a brick the suite agrees is live
const onlyBad = (path, v) => { const o = VALID(); const k = path.split('.');
  if (k.length === 1) o[k[0]] = v; else o[k[0]] = { ...o[k[0]], [k[1]]: v };
  return o; };

// ---------------- VX — VALUE FIELD VALIDITY: defaults may complete absence, not repair evidence --
// Added 2026-08-22 on outside review, answering a question the previous bundle asked out loud:
// "a partial {beta:0.9} still receives defaults; is partial-with-defaults itself a laundering
// route?" The answer measured out as: absence is fine, PRESENT-BUT-INVALID is not.
//
// normValue() drew its line at "is this an object at all", so a brick could carry
// `{beta:'high'}` — a field that is present, explicitly asserted, and not a number — stay LIVE,
// and hand `beta = NaN` downstream, where the floor never fired because no beta_min was required.
// `{pi:'not-a-phase'}` did the same and could leave a composite carrying a phase the algebra has
// no index for.
//
// The refinement of the non-laundering principle, and the one worth carrying into WORLD:
//
//     A DEFAULT IS JUSTIFIED BY ABSENCE. It may not overwrite, reinterpret, or tolerate an
//     explicit malformed assertion.
//
// Spreading `...v` over V0() defaults did exactly that tolerating: the default was there to fill a
// hole and instead sat quietly beside a wrong answer.
const VALUE = [
  ['VX1', 'a present-but-invalid scalar floors the brick to 0̲; an ABSENT one still defaults', (n) => trial(n, () => {
    // absence is legitimate and must survive — this half is the control, and without it the law
    // would be satisfied by a normaliser that simply refused everything
    for (const ok of [{}, { beta: 0.9 }, { n: 3 }, { kappa: true }, { pi: pick(PHASES) }, { pi: null }]) {
      if (isZero(Brick({ id: 'ok', value: ok, cost: certOf('poly'), q: { confidence: 0.9, cost: 1, latency: 1 } })))
        return `a VALID partial value ${JSON.stringify(ok)} was floored`;
    }
    const bad = pick([{ beta: 'high' }, { beta: null }, { n: 'x' }, { n: NaN }, { kappa: 'false' },
                      { denyDefault: 1 }, { beta: {} }, { n: Infinity }]);
    return isZero(Brick({ id: 'bad', value: bad, cost: certOf('poly'), q: { confidence: 0.9, cost: 1, latency: 1 } }))
      ? true : `${JSON.stringify(bad)} stayed LIVE`; })],

  ['VX2', 'pi is a declared PHASE or null — never an uninterpretable string', (n) => trial(n, () => {
    const bad = pick(['not-a-phase', 'wat', 42, '', 'RETRIEVE']);
    const b = Brick({ id: 'p', value: { pi: bad }, cost: certOf('poly'), q: { confidence: 0.9, cost: 1, latency: 1 } });
    if (!isZero(b)) return `pi=${JSON.stringify(bad)} stayed LIVE carrying an unindexable phase`;
    const good = pick([...PHASES, null]);
    return isZero(Brick({ id: 'p', value: { pi: good }, cost: certOf('poly'), q: { confidence: 0.9, cost: 1, latency: 1 } }))
      ? `pi=${JSON.stringify(good)} is legitimate and was floored` : true; })],

  ['VX3', 'beta is finite and in [0,1]', (n) => trial(n, () => {
    const bad = pick([-0.1, 1.1, NaN, Infinity, -Infinity, '0.5']);
    const b = Brick({ id: 'b', value: { beta: bad }, cost: certOf('poly'), q: { confidence: 0.9, cost: 1, latency: 1 } });
    return isZero(b) ? true : `beta=${String(bad)} stayed LIVE`; })],

  ['VX4', 'kappa and denyDefault are real booleans, not truthy stand-ins', (n) => trial(n, () => {
    const f = pick(['kappa', 'denyDefault']);
    const bad = pick(['false', 'true', 0, 1, null, 'no']);
    const b = Brick({ id: 'k', value: { [f]: bad }, cost: certOf('poly'), q: { confidence: 0.9, cost: 1, latency: 1 } });
    return isZero(b) ? true : `${f}=${JSON.stringify(bad)} stayed LIVE`; })],

  ['VX5', 'normalization never manufactures NaN or Infinity in a LIVE brick', (n) => trial(n, () => {
    // the OUTCOME form of VX1/VX3: whatever survives must be arithmetically usable, because the
    // original defect was not the bad input, it was NaN reaching a floor that could not test it
    const raw = pick([{ beta: 'high' }, { n: 'x' }, { n: NaN }, { beta: NaN }, { beta: 0.5 }, {}, { n: 2 }]);
    const b = Brick({ id: 'v', value: raw, cost: certOf('poly'), q: { confidence: 0.9, cost: 1, latency: 1 } });
    if (isZero(b)) return true;                                    // floored — nothing to check
    const bad = [b.value.n, b.value.beta].find((x) => !Number.isFinite(x));
    if (bad !== undefined) return `a LIVE brick carries a non-finite scalar from ${JSON.stringify(raw)}`;
    const composed = composeAnd(b, b);
    if (isZero(composed)) return true;
    return [composed.value.n, composed.value.beta].every(Number.isFinite) ? true
      : `composing produced a non-finite scalar from ${JSON.stringify(raw)}`; })]
];

// ---------------- QX — THE CC2 QUANTITY CARRIER: Q0 is an identity, not a default ---------------
// Added 2026-08-22 on outside review, and it is the same meta-error for the THIRD time:
//
//     missing contract  ->  ANY      (CD1-CD5)
//     malformed Value   ->  V0()     (CX7, VX1-VX5)
//     malformed q       ->  Q0()     (here)
//
// `q` carries the CC2 semiring quantities — confidence multiplies, cost adds, latency maxes. It was
// never validated. `q:'nope'`, `q:42`, `q:[]` and a wholly absent `q` all became
// `{confidence:1, cost:0, latency:0}`, so unreadable measurement evidence read as PERFECT
// CONFIDENCE, ZERO COST, ZERO LATENCY — the most favourable value in the lattice. Per-field was no
// better: `confidence:'high'` composed to NaN, `latency:'fast'` composed to NaN, and `cost:'free'`
// composed to the STRING `'free0'`, because `+` on a string is concatenation.
//
// THE DISTINCTION THIS SUITE EXISTS TO PIN, which is the general law all four bugs have been
// teaching in different costumes:
//
//     A NEUTRAL ELEMENT OF THE ALGEBRA IS NOT THE DEFAULT INTERPRETATION OF MISSING EVIDENCE.
//
// Q0 is genuinely the identity of the CC2 semiring — 1 for a product, 0 for a sum, 0 for a max — and
// it is genuinely correct for `id` and `&none`, which measurably cost nothing. It is not correct for
// an ordinary brick that simply arrived without measurements, because there every component of it
// is a MAXIMAL claim rather than a neutral one. `*` taught this, `V0` taught it, `Q0` is the third.
const QUANT = [
  ['QX1', 'a malformed or absent q cannot become Q0 on an ordinary brick', (n) => trial(n, () => {
    const bad = pick(['nope', 42, [], null, undefined, true, { confidence: 'x' }]);
    const b = Brick(onlyBad('q', bad));
    if (!isZero(b)) return `q=${JSON.stringify(bad) ?? 'undefined'} stayed LIVE as ${JSON.stringify(b.q)}`;
    // control: a well-formed q is untouched, or the law is satisfied by refusing everything
    return isZero(Brick(VALID())) ? 'a fully valid brick was floored' : true; })],

  ['QX2', 'confidence is finite and in [0,1]', (n) => trial(n, () => {
    const bad = pick(['high', 2, -0.1, NaN, Infinity, null, '0.9']);
    return isZero(Brick(onlyBad('q.confidence', bad))) ? true : `confidence=${String(bad)} stayed LIVE`; })],

  ['QX3', 'cost is finite and >= 0', (n) => trial(n, () => {
    const bad = pick(['free', -100, NaN, Infinity, null, '0']);
    return isZero(Brick(onlyBad('q.cost', bad))) ? true : `cost=${String(bad)} stayed LIVE`; })],

  ['QX4', 'latency is finite and >= 0', (n) => trial(n, () => {
    const bad = pick(['fast', -5, NaN, Infinity, null, '1']);
    return isZero(Brick(onlyBad('q.latency', bad))) ? true : `latency=${String(bad)} stayed LIVE`; })],

  ['QX5', 'only an identity TERM may carry Q0 without measurement evidence', (n) => trial(n, () => {
    // the identities measurably cost nothing, so Q0 is a measurement for them, not a default
    const idq = idBrick().q, nq = none().q;
    if (!(idq.confidence === 1 && idq.cost === 0 && idq.latency === 0)) return 'the |> identity does not carry Q0';
    if (!(nq.confidence === 1 && nq.cost === 0 && nq.latency === 0)) return 'the & identity does not carry Q0';
    // ...and an ordinary brick may not reach Q0 by omission
    const o = VALID(); delete o.q;
    return isZero(Brick(o)) ? true : `an ordinary brick with no q was given ${JSON.stringify(Brick(o).q)}`; })],

  ['QX6', 'utility is a finite number', (n) => trial(n, () => {
    const bad = pick([NaN, Infinity, -Infinity, 'lots', null]);
    return isZero(Brick(onlyBad('utility', bad))) ? true : `utility=${String(bad)} stayed LIVE`; })]
];

// ---------------- composeTree — the fold, and the leaf case that skipped the boundary -----------
// TREE1/TREE2, tenth outside review 2026-08-22. `composeTree` is the third public composition
// route, and its leaf case was `if (!node || node.op == null) return node` — the caller's object,
// unexamined, out of a function that promises a composed brick. The other two routes canonicalise
// every operand through `ensure` and apply the shared floor; this one skipped both whenever the
// tree had nothing to fold. That is the identity-route defect the file has now closed four times:
// A PUBLIC ROUTE MAY NOT HAVE A WEAKER INGRESS BOUNDARY BECAUSE "NOTHING HAPPENED".
const junkLeaf = () => pick([
  { id: 'raw', annihilated: false, cost: { nonsense: true } },    // the review's witness
  { id: 'raw', value: { beta: 'high' }, cost: certOf('poly') },   // CD13's shape
  { id: 'raw', value: V({ beta: 0.9, kappa: false, sigma: [] }) },// no certificate ⇒ fail-closed
  42, 'brick', null, undefined, [], {}, { op: undefined }, { value: null }, { op: null, a: 1 },
]);
const isBrickish = (x) => !!x && typeof x === 'object' && !Array.isArray(x) &&
  typeof x.id === 'string' && !!x.value && !!x.contract && !!x.cost && !!x.q;
const TREE = [
  ['TREE1', 'a one-leaf composition tree returns a canonical Brick or 0̲, never the caller\'s input', (n) => trial(n, () => {
    const junk = junkLeaf();
    const out = composeTree(junk);
    if (out === junk) return `composeTree returned the caller's object unchanged: ${String(JSON.stringify(junk)).slice(0, 60)}`;
    if (!isBrickish(out)) return `composeTree returned a non-Brick: ${String(out).slice(0, 40)}`;
    if (!isZero(out)) return 'malformed input produced a live brick';
    // ...and a LEGITIMATE leaf still folds to itself rather than being refused by the new boundary
    const live = boundLeaf();
    const folded = composeTree(live);
    if (isZero(folded)) return 'a live, bound, attested leaf was refused by the leaf route';
    if (!admitted(folded)) return 'a one-leaf fold of an admissible brick did not admit';
    if (folded.artifact?.hash !== live.artifact.hash) return 'the leaf route changed the identity it folded';
    // the units are carrier elements and must survive their own operator's fold by reference
    if (composeTree(none()) !== none() || composeTree(idBrick()) !== idBrick())
      return 'a unit did not survive a one-leaf fold';
    return true; })],
  ['TREE2', 'composeTree has no weaker ingress boundary than composeAnd/composePipe', (n) => trial(n, () => {
    // Scoped to ORDINARY operands: the units have their own rule about which operator they mean
    // something under (CD15/CD16), and that is not what this law is about.
    const junk = pick([junkLeaf(), presentedLeaf(), boundLeaf()]);
    const viaTree = composeTree(junk);
    const viaAnd = composeAnd(junk, none());
    const viaPipe = composePipe(junk, idBrick());
    if (isZero(viaTree) !== isZero(viaAnd))
      return `composeTree and (x & none) disagree: tree ${isZero(viaTree) ? '0̲' : 'live'}, & ${isZero(viaAnd) ? '0̲' : 'live'}`;
    if (isZero(viaTree) !== isZero(viaPipe))
      return `composeTree and (x |> ID) disagree: tree ${isZero(viaTree) ? '0̲' : 'live'}, |> ${isZero(viaPipe) ? '0̲' : 'live'}`;
    // and the same must hold one level up, where the fold really does fold
    const pair = { op: pick(['&', '|>']), a: junk, b: boundLeaf() };
    const folded = composeTree(pair);
    const direct = pair.op === '&' ? composeAnd(pair.a, pair.b) : composePipe(pair.a, pair.b);
    if (isZero(folded) !== isZero(direct)) return `composeTree(${pair.op}) disagrees with the operator it claims to fold`;
    return true; })],
  // -------------------------------------------------------------------------------------------
  // TREE3/TREE4, eleventh outside review 2026-08-23. The previous round bounded this fold's DEPTH
  // and the handoff said it "took the same ceiling" as the term budget. Depth is the only thing
  // depth bounds.
  ['TREE3', 'the fold\'s WORK is bounded: a shared child is priced per path and an exponential DAG refuses by name', (n) => (dagOnce = onceper(), trial(n, () => {
    // An AST is a graph. A child reachable by two paths is folded twice, so n+1 objects express
    // 2^n folds — 23 objects took 112 seconds, refused by nothing. The term budget eventually
    // refused the RESULT (the `&` normal form grows as 2^k too) but only after the work was done,
    // which is the wrong end of the transaction.
    if (dagOnce()) {
      let node = boundLeaf();
      for (let i = 0; i < 22; i++) node = { op: '&', a: node, b: node };   // 23 objects, 2^22 folds
      const out = composeTree(node);
      if (!isZero(out)) return 'an exponentially shared AST folded to a live brick';
      if (!/over-budget/.test(String(out.refusal))) return `the exponential AST refused without naming the budget: ${out.refusal}`;
      return true;
    }
    // SHARING IS NOT DEDUPLICATED, and that is the reason a work budget is the right answer rather
    // than memoisation: `&` is idempotent on the capability lattice and is NOT idempotent on cost
    // or quantities, so `x & x` is not `x` and collapsing a shared node would change the
    // arithmetic silently. A DAG is a TREE that happens to share storage.
    const x = boundLeaf();
    const shared = composeTree({ op: '&', a: x, b: x });
    const spelled = composeAnd(x, x);
    if (isZero(shared) !== isZero(spelled)) return 'a shared child folded differently from the same child written twice';
    if (!isZero(shared) && shared.q.cost !== spelled.q.cost)
      return `sharing changed the price: ${shared.q.cost} vs ${spelled.q.cost}`;
    return true; }))],
  ['TREE4', 'the operator is validated BEFORE the descent: an invalid root buys no subwork', (n) => trial(n, () => {
    // The operator used to be checked AFTER both children had been folded, so an unknown operator
    // at the ROOT bought arbitrary valid subwork — 14 s in the witness — before the runtime
    // discovered that the thing it was working for was never admissible.
    let touched = 0;
    const kid = boundLeaf();
    const node = { op: pick(['NOT-AN-OP', '&&', '|', '', 0, {}, null]),
                   get a() { touched++; return kid; }, get b() { touched++; return kid; } };
    // `op: null` is the LEAF case by definition (a node with no operator is a brick), so it is the
    // one draw that legitimately reads nothing and folds the node itself.
    let threw = false;
    try { composeTree(node); } catch { threw = true; }
    if (node.op == null) return touched === 0 ? true : 'the leaf case read children it has none of';
    if (!threw) return `an unknown operator ${JSON.stringify(String(node.op)).slice(0, 20)} did not refuse`;
    if (touched > 0) return `the fold descended into ${touched} child(ren) before validating the operator`;
    return true; })]
];

// -------------------------------------------------------------------------------------------
// WIRE0–WIRE5, fourteenth outside review 2026-08-23. The opening of WORLD rather than another
// CERT round: before `RevisionRef` hashes its first authoritative revision, the thing being hashed
// has to be a value a second implementation could agree about.
const enc = new TextEncoder();
const frameOf = (obj) => enc.encode(typeof obj === 'string' ? obj : JSON.stringify(obj));

// The over-budget witnesses are built ONCE, like HUGE_LEAF_SUBJECT above and for the same reason:
// each is about 4 MiB and rebuilding one per trial would spend the suite's whole budget on
// allocation. One per UTF-8 width class, so the law exercises the arithmetic rather than the ASCII
// branch it would otherwise almost always draw. `chars` is UTF-16 source units — the quantity the
// old check measured — and for every class but ASCII it is comfortably UNDER the ceiling while the
// byte count is over it. That gap IS the finding.
const OVER_BUDGET = [['a', 1], ['é', 2], ['ࠀ', 3], ['😀', 4]].map(([ch, width]) => {
  const raw = wellFormedRaw();
  raw.filler = ch.repeat(Math.ceil((TERM_BUDGET.maxBytes + 1) / width));
  const text = JSON.stringify(raw);
  return Object.freeze({ ch, width, text, frame: enc.encode(text), bytes: enc.encode(text).length, chars: text.length });
});
let overOnce = onceper();

const WIRE = [
  ['WIRE0', 'the WORLD door is the same function however the caller got hold of it', (n) => trial(n, () => {
    // `ingestJSONAndVerify` was a method calling `this.adoptAndVerify`. Modules are strict, so a
    // detached reference had `this === undefined` and THREW — on the success path only, since bad
    // input refused before reaching the `this`. The contract "never throws, whatever it is handed"
    // was true of the function and false of the name, on the one route WORLD is specified to
    // consume, under the idiom every consumer reaches for on a frozen namespace object.
    const rt = createComposeRuntime({ name: 'w0' + ((Math.random() * 1e9) | 0), verify: () => true });
    const good = JSON.stringify(wellFormedRaw());
    const arg = pick([good, '{oops', '', 42, null, undefined, ['[]'], frameOf(wellFormedRaw())]);
    // Every ingress name, fetched every way a caller fetches one — including through `trusted`,
    // where a nested namespace is exactly the shape that tempts a `this`-dependent method back in.
    const DOORS = { ingestFrame: rt.ingestFrame, ingestJSON: rt.ingestJSON,
                    ingestFrameAndVerify: rt.ingestFrameAndVerify, ingestJSONAndVerify: rt.ingestJSONAndVerify,
                    'trusted.adopt': rt.trusted.adopt, 'trusted.adoptAndVerify': rt.trusted.adoptAndVerify };
    const call = (name) => (name.startsWith('trusted.') ? rt.trusted[name.slice(8)] : rt[name]);
    for (const [name, bound] of Object.entries(DOORS)) {         // `bound` is detached — no receiver
      let direct, detached, viaMap;
      try { direct = call(name)(arg); } catch (e) { return `rt.${name}() threw ${e.constructor.name}`; }
      try { detached = bound(arg); } catch (e) { return `const {${name}} = rt threw ${e.constructor.name} — the door depends on how it was fetched`; }
      try { viaMap = [arg].map(bound)[0]; } catch (e) { return `[x].map(rt.${name}) threw ${e.constructor.name}`; }
      // Same verdict all three ways. `isZero` is the observable that matters to a consumer.
      if (isZero(direct) !== isZero(detached) || isZero(direct) !== isZero(viaMap))
        return `${name} disagreed with itself depending on how it was called`;
    }
    return true; })]
  ,
  ['WIRE1', 'the byte budget bounds BYTES, not source units', (n) => (overOnce = onceper(), trial(n, () => {
    // `text.length` counts UTF-16 code units. Measured before the fix: 6,000,376 UTF-8 bytes went
    // through a 4,194,304 ceiling LIVE, authenticated and frozen, because U+0800 is one source unit
    // and three bytes. This is CERT33's error — source units are not bytes — reappearing one
    // boundary further out, in the function written to BE the boundary.
    const rt = createComposeRuntime({ name: 'w1' + ((Math.random() * 1e9) | 0), verify: () => true });
    const w = pick(OVER_BUDGET);
    // The gap that IS the finding: for every non-ASCII class the old check would have passed this.
    if (w.bytes <= TERM_BUDGET.maxBytes) return `premise: the ${w.width}-byte fixture is only ${w.bytes} bytes`;
    if (w.width > 1 && w.chars > TERM_BUDGET.maxBytes)
      return `premise: ${w.chars} source units is not under the ceiling, so this witnesses nothing about units vs bytes`;
    // Both doors refuse it, and refuse it FOR being over budget rather than incidentally. The
    // expensive pair runs once per law-run; every other trial checks the cheap direction below.
    if (overOnce()) {
      for (const [label, r] of [['frame', rt.ingestFrameAndVerify(w.frame)], ['text', rt.ingestJSONAndVerify(w.text)]]) {
        if (!isZero(r)) return `${label}: ${w.bytes} bytes admitted through a ${TERM_BUDGET.maxBytes} ceiling`;
        if (!/over-budget/.test(String(r.refusal))) return `${label}: refused for the wrong reason — ${String(r.refusal).slice(0, 80)}`;
      }
    }
    // The cheap direction, every trial: a document UNDER the ceiling in bytes must pass whatever its
    // source-unit count, so the fix bounds the right quantity in both directions rather than just
    // refusing more. A budget that is merely stricter is not a budget that names the right thing.
    const raw = wellFormedRaw();
    raw.filler = pick(['a', 'é', 'ࠀ', '😀']).repeat(1 + ((Math.random() * 4096) | 0));
    const text = JSON.stringify(raw);
    if (enc.encode(text).length > TERM_BUDGET.maxBytes) return 'premise: the small fixture is over budget';
    const ok = rt.ingestFrameAndVerify(enc.encode(text));
    if (isZero(ok)) return `an under-budget ${enc.encode(text).length}-byte document was refused: ${String(ok.refusal).slice(0, 80)}`;
    return true; }))]
  ,
  ['WIRE2', 'a frame is not bytes until it is copied: no caller code participates in the bound', (n) => trial(n, () => {
    // The obvious `ingestFrame(bytes)` reintroduces CERT39. Measured before it was written: a Proxy
    // over a Uint8Array passes `instanceof` and FIRES ITS TRAPS, and a subclass whose `byteLength`
    // getter lies both runs caller code and gets an oversized frame parsed. `bytes.byteLength > MAX`
    // is exactly `getOwnPropertyDescriptor(o, k)` one layer down — a property read the caller
    // animates. The bound is read through brand-checked intrinsics instead, which a subclass cannot
    // override and a Proxy has no internal slot to satisfy.
    const rt = createComposeRuntime({ name: 'w2' + ((Math.random() * 1e9) | 0), verify: () => true });
    const real = frameOf(wellFormedRaw());
    let ran = 0;
    // A subclass IS a real typed array over real memory, so the property is not "refuse it" — it is
    // that its lie buys nothing. Two cases, and they must come out differently: over a legitimate
    // buffer it is admitted like any frame, and over an OVER-BUDGET buffer the claim `byteLength: 1`
    // does not get it past the ceiling, because the ceiling was never read from the caller.
    class Sneaky extends Uint8Array { get byteLength() { ran++; return 1; } get byteOffset() { ran++; return 0; } }
    const kind = pick(['proxy', 'plain-object', 'array', 'string', 'detached', 'shared',
                       'subclass-honest', 'subclass-lying-over-budget']);
    let hostile, mustAdmit = false;
    if (kind === 'proxy') hostile = new Proxy(real, { get(t, k) { ran++; return Reflect.get(t, k); } });
    else if (kind === 'plain-object') hostile = { byteLength: 4, buffer: new ArrayBuffer(4), byteOffset: 0 };
    else if (kind === 'array') hostile = [...real];
    else if (kind === 'string') hostile = new TextDecoder().decode(real);
    else if (kind === 'detached') { const b = new ArrayBuffer(8); const v = new Uint8Array(b); structuredClone(b, { transfer: [b] }); hostile = v; }
    else if (kind === 'shared') { if (typeof SharedArrayBuffer === 'undefined') return true; hostile = new Uint8Array(new SharedArrayBuffer(16)); }
    else if (kind === 'subclass-honest') { hostile = new Sneaky(real); mustAdmit = true; }
    else hostile = new Sneaky(pick(OVER_BUDGET).frame);
    let r;
    try { r = rt.ingestFrameAndVerify(hostile); } catch (e) { return `the frame door threw ${e.constructor.name} on ${kind}`; }
    if (!isBrickish(r)) return `the frame door returned a non-Brick for ${kind}`;
    // THE PROPERTY, and it holds for every draw: no caller code participated in reading the frame.
    if (ran > 0) return `${kind}: the boundary ran ${ran} invocation(s) of caller code while reading the frame`;
    if (mustAdmit) {
      if (isZero(r)) return `a subclass over legitimate bytes was refused: ${String(r.refusal).slice(0, 80)}`;
      if (!rt.authenticatedFor(r) || !Object.isFrozen(r)) return 'the subclass frame did not produce the admissible state';
      return true;
    }
    if (!isZero(r)) return `${kind} was ADMITTED through the frame door`;
    if (kind === 'subclass-lying-over-budget' && !/over-budget/.test(String(r.refusal)))
      return `a subclass claiming byteLength 1 over an oversized buffer refused for the wrong reason — ${String(r.refusal).slice(0, 80)}`;
    // A REAL frame still works, or the door is merely broken rather than safe.
    const ok = rt.ingestFrameAndVerify(real);
    if (isZero(ok)) return `a well-formed frame was refused: ${String(ok.refusal).slice(0, 80)}`;
    if (!rt.authenticatedFor(ok) || !Object.isFrozen(ok)) return 'the frame route did not produce the admissible state';
    return true; })]
  ,
  ['WIRE3', 'duplicate member names REFUSE: a peer must be able to agree what was authenticated', (n) => trial(n, () => {
    // RFC 8259 §4 leaves duplicate names to the implementation — V8 keeps the last, others keep the
    // first or refuse. Measured: an authenticated brick whose `artifact` was declared twice, hash
    // "B" then hash "A", came out LIVE carrying "A". Nothing about that is a fact two runtimes
    // share, and a signature over it means nothing. RFC 7493 forbids it.
    const rt = createComposeRuntime({ name: 'w3' + ((Math.random() * 1e9) | 0), verify: () => true });
    const raw = wellFormedRaw();
    const good = JSON.stringify(raw);
    // Duplicate a member at a drawn depth, textually — the only place the duplicate can exist.
    const dup = pick([
      good.replace('"artifact":', '"artifact":{"kind":"weave-ir","hash":"B"},"artifact":'),
      good.replace('"hash":"A"', '"hash":"B","hash":"A"'),
      good.replace('"contract":', '"contract":{"accepts_from":"x","feeds_into":"y"},"contract":'),
    ]);
    if (dup === good) return 'premise: the fixture did not actually gain a duplicate';
    for (const [label, r] of [['frame', rt.ingestFrameAndVerify(enc.encode(dup))],
                              ['text', rt.ingestJSONAndVerify(dup)]]) {
      if (!isZero(r)) return `${label}: a duplicate member name was admitted, retaining ${JSON.stringify(r.artifact)}`;
      if (!/not-ijson/.test(String(r.refusal))) return `${label}: refused for the wrong reason — ${String(r.refusal).slice(0, 80)}`;
    }
    // AND THE SCANNER MUST NOT OVER-REFUSE. A boundary that is merely stricter is not a boundary
    // that names the right thing, and a scanner is the easiest thing in this file to get wrong in
    // that direction: every one of these draws contains a character the scan gives meaning to,
    // inside a string where it has none. The third is the sharp one — a string VALUE whose text
    // reads exactly like a duplicated member.
    const awkward = wellFormedRaw();
    awkward.cost.policy.reason = pick(['ratio 3:1', '{"not":"json"}', '"hash":"A","hash":"B"',
                                       '["a","b"],', 'she said "no"', 'C:\\path\\', '🚀 世界 café']);
    if (pick([true, false])) awkward.cost.policy['a"b:{c'] = 1;      // the same characters, in a KEY
    const legal = JSON.stringify(awkward);
    for (const [label, r] of [['frame', rt.ingestFrameAndVerify(enc.encode(legal))],
                              ['text', rt.ingestJSONAndVerify(legal)]]) {
      if (isZero(r)) return `${label}: refused a legal document — ${String(r.refusal).slice(0, 100)}`;
    }
    // The same document WITHOUT the duplicate must still pass, or this law is just breaking ingress.
    if (isZero(rt.ingestFrameAndVerify(enc.encode(good)))) return 'the un-duplicated fixture stopped working';
    return true; })]
  ,
  ['WIRE4', 'a retained string is encodable: no lone surrogate reaches an identity', (n) => trial(n, () => {
    // Node carries a lone surrogate happily; UTF-8 cannot. `TextEncoder` replaces it with U+FFFD,
    // so a hash this runtime authenticated is one it CANNOT TRANSMIT — the corruption happens on
    // the way out of the process, not at some hypothetical foreign peer. Measured LIVE and
    // authenticated before the fix.
    //
    // WIRE1 DOES NOT SUBSUME THIS, and the ordering is the point: a strict UTF-8 decode rejects the
    // RAW form (bytes ED A0 80) and accepts `"A\ud800"`, which is well-formed UTF-8 on the wire and
    // only becomes a lone surrogate after JSON string-escape processing. Frame well-formedness and
    // value well-formedness are two checks.
    const rt = createComposeRuntime({ name: 'w4' + ((Math.random() * 1e9) | 0), verify: () => true });
    const bad = pick(['\ud800', '\udfff', 'A\ud800', '\ud800\ud800', '￿', '￾', '﷐']);
    const where = pick(['artifact-hash', 'subject-hash', 'member-name', 'nested', 'analyzer']);
    const raw = wellFormedRaw();
    if (where === 'artifact-hash') raw.artifact.hash += bad;
    else if (where === 'subject-hash') raw.cost.subject.hash += bad;
    else if (where === 'member-name') raw.cost['n' + bad] = 1;
    else if (where === 'nested') raw.cost.policy.reason = bad;
    else raw.analyzer = { name: bad, version: '1' };
    // Both the ESCAPED form (valid UTF-8 on the wire) and the object route must refuse it.
    const text = JSON.stringify(raw);
    for (const [label, r] of [['frame', rt.ingestFrameAndVerify(enc.encode(text))],
                              ['text', rt.ingestJSONAndVerify(text)],
                              ['object', rt.trusted.adoptAndVerify(raw)]]) {
      if (!isBrickish(r)) return `${label} returned a non-Brick`;
      if (!isZero(r)) return `${label}: ${JSON.stringify(bad)} in ${where} was ADMITTED — and it is not encodable as UTF-8`;
    }
    // And the RAW form cannot even be framed: strict decoding refuses the bytes.
    const rawFrame = new Uint8Array([0x7b, 0x22, 0x61, 0x22, 0x3a, 0x22, 0xed, 0xa0, 0x80, 0x22, 0x7d]);
    const rf = rt.ingestFrameAndVerify(rawFrame);
    if (!isZero(rf) || !/not-utf8/.test(String(rf.refusal)))
      return `a raw lone-surrogate frame was not refused as malformed UTF-8: ${String(rf.refusal).slice(0, 60)}`;
    return true; })]
  ,
  ['WIRE5', 'the frame route yields the admissible state, and nothing weaker does', (n) => trial(n, () => {
    // The composition WORLD consumes. CERT38 established that ingested-and-authenticated has to be
    // reachable by ONE call because two copying boundaries in series destroy the brand; WIRE1 moves
    // that call to the frame. This law is the anchor: the door WORLD is pointed at actually
    // produces what WORLD is specified to require, and the weaker doors are visibly weaker.
    const rt = createComposeRuntime({ name: 'w5' + ((Math.random() * 1e9) | 0), verify: () => true });
    const raw = wellFormedRaw();
    const frame = frameOf(raw);
    const viaFrame = rt.ingestFrameAndVerify(frame);
    if (isZero(viaFrame)) return `the frame route refused a well-formed brick: ${String(viaFrame.refusal).slice(0, 80)}`;
    if (!rt.authenticatedFor(viaFrame) || !Object.isFrozen(viaFrame))
      return 'the frame route did not produce authenticated-and-frozen';
    // Non-verifying ingress is frozen but NOT authenticated — the distinction WORLD reads.
    const inert = ingestFrame(frame);
    if (isZero(inert)) return 'the non-verifying frame route refused a well-formed brick';
    if (rt.authenticatedFor(inert)) return 'ingestFrame produced an AUTHENTICATED brick without a verifier';
    if (!Object.isFrozen(inert)) return 'ingestFrame did not freeze';
    // A host that refuses the certificate must refuse the brick, by the host's own reason.
    const strict = createComposeRuntime({ name: 's' + ((Math.random() * 1e9) | 0), verify: () => false });
    const refused = strict.ingestFrameAndVerify(frame);
    if (!isZero(refused)) return 'a refusing verifier still produced a live brick';
    return true; })]
  ,
  ['WIRE6', 'owning a frame invokes NO caller behaviour — and the frame at return is the frame at call', (n) => trial(n, () => {
    // WIRE1/WIRE2 fixed the READS and left the COPY as `ArrayBuffer.prototype.slice`, which is not
    // an inert memmove: its first steps run `SpeciesConstructor(O, %ArrayBuffer%)`, reading
    // `O.constructor` and then `constructor[@@species]` off an ordinary caller-supplied buffer. The
    // captured pristine intrinsic called the caller's getter faithfully, because the intrinsic's own
    // ALGORITHM is specified to consult the operand. Capturing a function does not make it inert.
    //
    // THE WITNESS IS A MUTATION, NOT A COUNT. `ran === 0` would have been satisfied by any number of
    // wrong implementations; what makes this a security property is that a getter firing mid-copy
    // can rewrite the bytes between the bound and the parse:
    //
    //     constructor getter rewrites "hash":"A" -> "hash":"B", then returns ArrayBuffer
    //     → artifact.hash B, authenticatedFor true, from a frame that held A at call time
    //
    // So the law asserts BOTH: nothing of the caller's ran, AND the value that came out is the value
    // that went in.
    const rt = createComposeRuntime({ name: 'w6' + ((Math.random() * 1e9) | 0), verify: () => true });
    const raw = wellFormedRaw();
    const text = JSON.stringify(raw);
    const bytes = enc.encode(text);
    const buf = new ArrayBuffer(bytes.length);
    const view = new Uint8Array(buf);
    view.set(bytes);

    let ran = 0;
    // Every caller-reachable hook `slice` and its neighbours are specified to consult.
    const hostile = pick(['constructor-mutates', 'constructor-detaches', 'species', 'proto-getter', 'wrong-element-type']);
    // A NON-BYTE typed array must refuse BY NAME rather than be silently mis-copied. `set` converts
    // between element types, so a Uint16Array over these exact bytes would be copied as ELEMENTS —
    // each 16-bit value truncated to its low byte — and the runtime would parse something the caller
    // never sent. The frame door's contract is bytes; a carrier whose elements are not bytes is not
    // a frame, and saying so is cheaper than deciding what half of it meant.
    if (hostile === 'wrong-element-type') {
      const pad = new Uint8Array(bytes.length + (bytes.length % 2));
      pad.set(bytes);
      const wide = new Uint16Array(pad.buffer);
      const rw = rt.ingestFrameAndVerify(wide);
      if (!isZero(rw)) return `a Uint16Array was accepted as a frame, carrying ${JSON.stringify(rw.artifact?.hash)}`;
      if (!/not-a-frame/.test(String(rw.refusal))) return `a Uint16Array refused for the wrong reason — ${String(rw.refusal).slice(0, 80)}`;
      return true;
    }
    const rewriteAtoB = () => {
      const from = enc.encode('"hash":"A"'), to = enc.encode('"hash":"B"');
      outer: for (let i = 0; i + from.length <= view.length; i++) {
        for (let j = 0; j < from.length; j++) if (view[i + j] !== from[j]) continue outer;
        view.set(to, i);
      }
    };
    if (hostile === 'constructor-mutates')
      Object.defineProperty(buf, 'constructor', { get() { ran++; rewriteAtoB(); return ArrayBuffer; }, configurable: true });
    else if (hostile === 'constructor-detaches')
      Object.defineProperty(buf, 'constructor', { get() { ran++; try { structuredClone(buf, { transfer: [buf] }); } catch {} return ArrayBuffer; }, configurable: true });
    else if (hostile === 'species') {
      const fake = function () {}; fake[Symbol.species] = function (n2) { ran++; rewriteAtoB(); return new ArrayBuffer(n2); };
      Object.defineProperty(buf, 'constructor', { value: fake, configurable: true });
    } else {
      Object.defineProperty(buf, Symbol.toPrimitive, { get() { ran++; return undefined; }, configurable: true });
    }

    let r;
    try { r = rt.ingestFrameAndVerify(view); } catch (e) { return `the frame door threw ${e.constructor.name} on ${hostile}`; }
    if (ran > 0) return `${hostile}: the boundary ran ${ran} invocation(s) of caller code while OWNING the frame`;
    if (!isBrickish(r)) return `${hostile}: returned a non-Brick`;
    // The detaching draw legitimately has nothing to copy if it fired; since it must NOT fire, the
    // frame is intact and the brick is live. Any draw that comes out live must carry what was sent.
    if (isZero(r)) return `${hostile}: an untouched well-formed frame was refused — ${String(r.refusal).slice(0, 80)}`;
    if (r.artifact.hash !== 'A' || r.cost.subject.hash !== 'A')
      return `${hostile}: authenticated ${JSON.stringify(r.artifact.hash)} from a frame that held "A" at call time`;
    if (!rt.authenticatedFor(r)) return `${hostile}: did not authenticate a well-formed frame`;
    return true; })]
  ,
  ['WIRE7', 'the boundary does not fetch its dependencies from the ambient realm at call time', (n) => trial(n, () => {
    // Outside review replaced `globalThis.TextDecoder`, `globalThis.Uint8Array` and `Reflect.apply`
    // after importing the module, and measured frame ingress calling all three. That is not the
    // hostile-CODE threat — nothing stops same-realm code from breaking this runtime, and pretending
    // otherwise would need SES. It is the ACCIDENT threat: a polyfill, an instrumentation library or
    // a test double silently changes what the boundary does.
    //
    // The scope is declared rather than implied (see WHAT WIRE PROTECTS AGAINST in compose.mjs):
    // hostile INPUT to a trusted realm, not containment of hostile CODE inside one.
    const rt = createComposeRuntime({ name: 'w7' + ((Math.random() * 1e9) | 0), verify: () => true });
    const frame = frameOf(wellFormedRaw());
    const saved = { TextDecoder: globalThis.TextDecoder, Uint8Array: globalThis.Uint8Array,
                    SharedArrayBuffer: globalThis.SharedArrayBuffer, JSON: globalThis.JSON,
                    apply: Reflect.apply, ArrayBuffer: globalThis.ArrayBuffer };
    let touched = 0;
    const note = (k) => { touched++; return k; };
    try {
      // Replace every global the boundary could plausibly reach for. If it captured them at load,
      // none of these is consulted and the verdict is unchanged.
      globalThis.TextDecoder = class { constructor() { note('TextDecoder'); } decode() { note('TextDecoder'); return '{}'; } };
      globalThis.Uint8Array = new Proxy(saved.Uint8Array, { construct(t, a, nt) { note('Uint8Array'); return Reflect.construct(t, a, nt); } });
      globalThis.ArrayBuffer = new Proxy(saved.ArrayBuffer, { construct(t, a, nt) { note('ArrayBuffer'); return Reflect.construct(t, a, nt); } });
      globalThis.SharedArrayBuffer = class { static [Symbol.hasInstance]() { note('SharedArrayBuffer'); return true; } };
      globalThis.JSON = { parse() { note('JSON'); return {}; }, stringify: saved.JSON.stringify };
      Reflect.apply = function (...a) { note('Reflect.apply'); return saved.apply(...a); };
      const r = rt.ingestFrameAndVerify(frame);
      if (touched > 0) return `frame ingress consulted ${touched} ambient global(s) at call time`;
      if (isZero(r)) return `a well-formed frame was refused while the realm was patched: ${String(r.refusal).slice(0, 70)}`;
      if (!rt.authenticatedFor(r) || r.artifact.hash !== 'A') return 'the verdict changed when the realm was patched';
    } finally {
      // A law that leaves the realm broken poisons every law after it.
      globalThis.TextDecoder = saved.TextDecoder; globalThis.Uint8Array = saved.Uint8Array;
      globalThis.ArrayBuffer = saved.ArrayBuffer; globalThis.SharedArrayBuffer = saved.SharedArrayBuffer;
      globalThis.JSON = saved.JSON; Reflect.apply = saved.apply;
    }
    return true; })]
];

export const SUITES = [
  { key: 'COMB',  label: '& combine  · commutative idempotent monoid', laws: COMB },
  { key: 'PIPE',  label: '|> pipeline · phase-graded monoid',          laws: PIPE },
  { key: 'CROSS', label: 'floor · 0̲ · semiring · cost lattice · fail-closed', laws: CROSS },
  { key: 'DECL',  label: 'contract declaration · missing ≠ universal',                  laws: DECL },
  { key: 'VALUE', label: 'value field validity · defaults complete absence, never repair evidence', laws: VALUE },
  { key: 'QUANT', label: 'CC2 quantity carrier · Q0 is an identity, not a default',                 laws: QUANT },
  { key: 'ADMIT', label: 'admission · raw → canonical → admitted|0̲ · the identity quantifies over the carrier', laws: ADMIT },
  { key: 'CERTS', label: 'cost certificate · the fourth carrier · presented ≠ authenticated',        laws: CERTS },
  { key: 'TREE',  label: 'composeTree · the fold has no weaker ingress than the operators it folds', laws: TREE },
  { key: 'WIRE',  label: 'the wire · bounded bytes · one interoperable value language',              laws: WIRE }
];

// ---------------------------------------------------------------------------------------------
// THE LAW INDEX: MACHINE-READABLE EVIDENCE, NOT A PRETTY BANNER (FRONTIER4, fifteenth review).
//
// `check-frontier.mjs` used to derive which laws exist by regexing the printed banner for
// `(FIRST–LAST)`. A range is not a set. Outside review simulated a suite containing WORLD1 and
// WORLD3 but NOT WORLD2, with the banner it would honestly print:
//
//     WORLD1–WORLD3: 2/2 pass        →     ✓ frontier derived and agreed
//                                          WORLD enforced through WORLD3 with 4 item(s) open
//
// **WORLD2 vanished.** It matters more for WORLD than for anything before it, because WORLD starts
// from zero and moves one item at a time, so every intermediate state is a partial range.
//
//   BB_LAW_INDEX=1 node test/compose-laws.mjs
//
// prints the exact ids and runs no trials. The banner goes back to being RENDERING; this is the
// evidence. Emitted from the same arrays the suite executes, so it cannot describe a different
// suite than the one that runs.
if (typeof process !== 'undefined' && process.env.BB_LAW_INDEX) {
  console.log(JSON.stringify({
    enforced: SUITES.flatMap((s) => s.laws.map((l) => l[0])).concat(ANCHOR.map((l) => l[0])),
    gaps: GAP.map((l) => l[0]),
    suites: Object.fromEntries(SUITES.map((s) => [s.key, s.laws.map((l) => l[0])])),
  }, null, 2));
  process.exit(0);
}

if (typeof process !== 'undefined' && typeof window === 'undefined') {
  // TRIALS ARE OVERRIDABLE, AND THE BANNER PRINTS WHAT ACTUALLY RAN. Outside review reported this
  // suite exceeding a 120-second window on their machine, and "run fewer trials" is a reasonable
  // thing for a reviewer to want — as long as nobody can then publish a number earned at 200 trials
  // as though it were earned at 2000. scripts/law-manifest.mjs REFUSES a reduced run for exactly
  // that reason, so this is a fast path for iteration and not a fast path to a weaker claim.
  const N = Number(process.env.BB_TRIALS) > 0 ? Number(process.env.BB_TRIALS) : 2000;
  console.log(`\ncompose-runtime law harness · ${N} trials/law\n${'─'.repeat(52)}`);
  console.log(`seed ${SEED}  ·  replay this exact run with  SEED=${SEED} node test/compose-laws.mjs`);
  let total = 0;
  for (const suite of SUITES) {
    const r = runSet(suite.laws, N);
    // The id range is DERIVED. It used to be typed into each label and went stale the moment
    // CD6 was promoted and CD7 added — a hand-typed range in the file whose whole subject is
    // hand-typed counts going stale.
    // Sorted, because array order is authoring order: CD6 was promoted in beside CD4 and CD7 added
    // after it, so first-and-last read "CD1–CD5" over a suite that goes to CD7. A range is a claim
    // about the set, not about the order somebody happened to write them in.
    const ids = suite.laws.map(([id]) => id)
      .sort((x, y) => x.localeCompare(y, 'en', { numeric: true }));
    const range = ids.length > 1 ? ` (${ids[0]}–${ids[ids.length - 1]})` : ` (${ids[0]})`;
    console.log(`${suite.label}${range}: ${r.pass}/${suite.laws.length} pass${r.fail ? ', ' + r.fail + ' fail' : ''}`);
    r.results.filter((x) => !x.pass).forEach((x) => console.log(`  ✗ ${x.id} ${x.desc} — ${x.cex} @trial ${x.at}`));
    total += r.fail;
  }
  // passing anchors: green laws that pin what IS sound; a failure here counts against the build.
  const anchor = runSet(ANCHOR, N);
  console.log(`anchors (passing · what is provably sound): ${anchor.pass}/${ANCHOR.length} pass${anchor.fail ? ', ' + anchor.fail + ' fail' : ''}`);
  anchor.results.filter((x) => !x.pass).forEach((x) => console.log(`  ✗ ${x.id} ${x.desc} — ${x.cex} @trial ${x.at}`));
  total += anchor.fail;
  // known gaps (xfail): report them, never fail the build WHILE OPEN, but ALARM on an xpass —
  // a gap law that starts passing means the carrier fix landed and it must be promoted to a real suite.
  let xpass = 0;
  console.log(`known gaps (xfail · expected FALSIFIED until the Value.pi carrier fix lands):`);
  for (const [id, desc, fn] of GAP) {
    const r = fn(N);
    if (r.pass) { xpass++; console.log(`  ⚠ ${id} ${desc} — NOW PASSES: the fix landed? promote it into a suite and drop from GAP.`); }
    else console.log(`  ✗ ${id} ${desc} — FALSIFIED @trial ${r.at} (known gap)${r.cex ? '  ' + r.cex : ''}`);
  }
  console.log('─'.repeat(52));
  // Count is DERIVED, never a literal. This banner previously read a hard-coded "116", which was
  // the OLD whole-kernel total mislabelled as a compose-only count — overstating this suite ~8×.
  const suiteN = SUITES.reduce((n, s) => n + s.laws.length, 0);
  const enforced = suiteN + ANCHOR.length;
  console.log(total === 0
    ? `✓ all ${enforced} enforced CC2 compose laws hold — ${suiteN} suite + ${ANCHOR.length} anchor (a brick of bricks is a brick).`
    : `✗ ${total} of ${enforced} enforced law(s) failed.`);
  console.log(xpass
    ? `⚠ ${xpass} known-gap law(s) now PASS — promote them out of GAP (build fails to force it).\n`
    : `· ${GAP.length} known gap(s) still open (xfail) — see the-residency/EVIDENCE/algebra-finding.md.\n`);
  process.exit((total === 0 && xpass === 0) ? 0 : 1);
}
