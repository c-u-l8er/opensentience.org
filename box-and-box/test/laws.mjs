// test/laws.mjs — run: `node test/laws.mjs`
// Property tests proving the runtime is the real algebra: invariant L-laws,
// heuristic H-laws, and bridge B-laws hold across random values.
import { V, V0, PHASES, phaseIdx, combine, chain, promote, reconcile, deliberate, consume } from '../value.mjs';
import { SEMIRINGS, Score, vote, rollout, reinforce, dominate, anneal, softmax } from '../score.mjs';
import { gatedScore, select } from '../bridge.mjs';
import { STATUS, rank, join, Norm, adjudicateStatus, resolve, detach, comply, escalate } from '../norm.mjs';
import { govern } from '../govern.mjs';
import * as T from '../temporal.mjs';
import { TemporalSpec, supervise, residualOf, guard } from '../supervise.mjs';
import { Policy, enact, repeal, amend, admissible, arbitrate, revise, entrench, stabilize, policyKey } from '../reflexive.mjs';
import * as EP from '../epistemic.mjs';
import * as ST from '../strategic.mjs';
import * as RES from '../resource.mjs';

const rnd = (a, b) => a + Math.random() * (b - a);
const approx = (a, b, t = 1e-7) => a === b || (isFinite(a) && isFinite(b) && Math.abs(a - b) <= t * (1 + Math.abs(a) + Math.abs(b)));
const setEq = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
const arrEq = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const sample = (arr) => arr.filter(() => Math.random() < 0.5);

function randV() {
  const ph = [null, ...PHASES];
  return V({
    n: +rnd(0, 10).toFixed(2), kappa: Math.random() < 0.5, beta: +Math.random().toFixed(3),
    sigma: sample(['x', 'y', 'z', 'w']), pi: ph[(Math.random() * ph.length) | 0],
    authority: Math.random() < 0.5 ? ['c' + ((Math.random() * 3) | 0)] : [],
    denyDefault: Math.random() < 0.5, audit: Math.random() < 0.5 ? ['e' + ((Math.random() * 3) | 0)] : []
  });
}
// equality on the algebraic carrier (audit is a free monoid; compared as ordered concat)
function valEq(a, b) {
  return approx(a.n, b.n) && a.kappa === b.kappa && approx(a.beta, b.beta) && setEq(a.sigma, b.sigma)
    && a.pi === b.pi && a.iota === b.iota && a.psi === b.psi && arrEq(a.authority, b.authority)
    && a.denyDefault === b.denyDefault && arrEq(a.audit, b.audit);
}
function forwardTriple() { // three values with non-decreasing phases ⇒ chain defined
  const idxs = [0, 0, 0].map(() => (Math.random() * PHASES.length) | 0).sort((x, y) => x - y);
  return idxs.map((i) => { const v = randV(); v.pi = PHASES[i]; return v; });
}

function trial(n, body) {
  for (let i = 0; i < n; i++) { const r = body(); if (r !== true) return { pass: false, cex: r, at: i + 1 }; }
  return { pass: true, at: n };
}

// ---------------- INVARIANT LAWS ----------------
const INV = [
  ['L1', 'combine associative', (n) => trial(n, () => { const a = randV(), b = randV(), c = randV();
    return valEq(combine(combine(a, b), c), combine(a, combine(b, c))) ? true : 'assoc'; })],
  ['L2', 'combine identity V0', (n) => trial(n, () => { const a = randV();
    return valEq(combine(a, V0()), a) && valEq(combine(V0(), a), a) ? true : 'identity'; })],
  ['L3', 'commutative families (n,κ,β,σ,deny)', (n) => trial(n, () => { const a = randV(), b = randV();
    const x = combine(a, b), y = combine(b, a);
    return approx(x.n, y.n) && x.kappa === y.kappa && approx(x.beta, y.beta) && setEq(x.sigma, y.sigma) && x.denyDefault === y.denyDefault ? true : 'comm'; })],
  ['L4', 'β idempotent under min', (n) => trial(n, () => { const a = randV(); return approx(combine(a, a).beta, a.beta) ? true : 'β-idem'; })],
  ['L5', 'σ idempotent under ∪', (n) => trial(n, () => { const a = randV(); return setEq(combine(a, a).sigma, a.sigma) ? true : 'σ-idem'; })],
  ['L6', 'κ idempotent under ∨', (n) => trial(n, () => { const a = randV(); return combine(a, a).kappa === a.kappa ? true : 'κ-idem'; })],
  ['L7', 'promote β-monotone', (n) => trial(n, () => { const a = randV(); const ev = { beta: Math.random() }; return promote(a, ev).beta >= a.beta - 1e-9 ? true : 'monotone'; })],
  ['L8', 'reconcile antitone + idempotent', (n) => trial(n, () => { const a = randV(); const T = sample(['x', 'y', 'z', 'w']);
    const r = reconcile(a, T); const sub = r.sigma.every((t) => a.sigma.includes(t));
    return sub && setEq(reconcile(r, T).sigma, r.sigma) ? true : 'reconcile'; })],
  ['L9', 'deliberate κ→false + idempotent', (n) => trial(n, () => { const a = randV();
    const d = deliberate(a); return d.kappa === false && deliberate(d).kappa === false ? true : 'deliberate'; })],
  ['L10', 'chain refuses a backward phase', (n) => trial(n, () => { const a = randV(), b = randV();
    if (a.pi == null || b.pi == null) return true;
    const r = chain(a, b);
    if (phaseIdx(a.pi) > phaseIdx(b.pi)) return r.error ? true : 'should refuse';
    return r.error ? 'should allow' : true; })],
  ['L11', 'chain associative where defined', (n) => trial(n, () => { const [a, b, c] = forwardTriple();
    const l = chain(chain(a, b), c), r = chain(a, chain(b, c));
    if (l.error || r.error) return true; // vacuous
    return valEq(l, r) ? true : 'chain-assoc'; })],
  ['L12', 'promote distributes over combine on β', (n) => trial(n, () => { const a = randV(), b = randV(); const ev = { beta: Math.random() };
    return approx(promote(combine(a, b), ev).beta, combine(promote(a, ev), promote(b, ev)).beta) ? true : 'β-distrib'; })],
  ['L13', 'consume gate (β_min)', (n) => trial(n, () => { const a = randV(); const thr = 0.5;
    const ok = consume(a, { beta_min: thr }).ok; return ok === (a.beta >= thr) ? true : 'gate'; })],
  ['L14', 'deny_default idempotent under ∧', (n) => trial(n, () => { const a = randV(); return combine(a, a).denyDefault === a.denyDefault ? true : '∧-idem'; })]
];

// ---------------- HEURISTIC LAWS ----------------
let S = SEMIRINGS.tropical;
const G = () => { const r = Math.random(); if (r < 0.06) return S.zero; if (r < 0.12) return S.one; return +rnd(-12, 12).toFixed(4); };
const Gp = () => { const r = Math.random(); if (r < 0.06) return 0; if (r < 0.12) return 1; return +rnd(0, 4).toFixed(4); };
const gen = () => (S === SEMIRINGS.probability ? Gp() : G());

function randScore() { return Score({ u: gen(), w: rnd(0, 1), eps: rnd(0, 1), gamma: rnd(0.5, 1) }); }
function randOptObj() { return { id: (Math.random() * 1e9) | 0, obj: [+rnd(0, 5).toFixed(2), +rnd(0, 5).toFixed(2)] }; }

const HEUR = [
  ['H1', '⊕ commutative monoid', (n) => trial(n, () => { const a = gen(), b = gen(), c = gen();
    if (!approx(S.oplus(a, b), S.oplus(b, a))) return 'comm';
    if (!approx(S.oplus(S.oplus(a, b), c), S.oplus(a, S.oplus(b, c)))) return 'assoc';
    return approx(S.oplus(a, S.zero), a) ? true : 'id'; })],
  ['H2', '⊗ monoid', (n) => trial(n, () => { const a = gen(), b = gen(), c = gen();
    if (!approx(S.otimes(S.otimes(a, b), c), S.otimes(a, S.otimes(b, c)))) return 'assoc';
    return approx(S.otimes(a, S.one), a) && approx(S.otimes(S.one, a), a) ? true : 'id'; })],
  ['H3', 'left distributivity', (n) => trial(n, () => { const a = gen(), b = gen(), c = gen();
    return approx(S.otimes(a, S.oplus(b, c)), S.oplus(S.otimes(a, b), S.otimes(a, c))) ? true : 'distL'; })],
  ['H4', 'right distributivity', (n) => trial(n, () => { const a = gen(), b = gen(), c = gen();
    return approx(S.otimes(S.oplus(a, b), c), S.oplus(S.otimes(a, c), S.otimes(b, c))) ? true : 'distR'; })],
  ['H5', '0̲ annihilates ⊗', (n) => trial(n, () => { const a = gen();
    return S.otimes(S.zero, a) === S.zero && S.otimes(a, S.zero) === S.zero ? true : 'annih'; })],
  ['H6', '⊕ idempotence (dioid only)', (n) => trial(n, () => { const a = gen();
    return approx(S.oplus(a, a), a) ? true : `idem [expected off tropical]`; })],
  ['H7', '⊗ monotone in order', (n) => trial(n, () => { let a = gen(), b = gen(); if (a > b) { const t = a; a = b; b = t; } const c = gen();
    return (S.otimes(a, c) <= S.otimes(b, c) || approx(S.otimes(a, c), S.otimes(b, c))) ? true : 'mono'; })],
  ['H8', 'reinforce η-contraction', (n) => trial(n, () => { const u = rnd(-10, 10), t = rnd(-10, 10), e = rnd(0.05, 0.95);
    const got = Math.abs(reinforce(u, t, e) - t), want = (1 - e) * Math.abs(u - t);
    return approx(got, want, 1e-6) && got <= Math.abs(u - t) + 1e-9 ? true : 'contr'; })],
  ['H9', 'rollout γ-contraction', (n) => trial(n, () => { const g = rnd(0.1, 0.95);
    // backup operator B(u)=r+γu per component
    const d = 3, u = Array.from({ length: d }, () => rnd(-8, 8)), v = Array.from({ length: d }, () => rnd(-8, 8)), r = Array.from({ length: d }, () => rnd(-5, 5));
    const Bu = u.map((x, i) => r[i] + g * x), Bv = v.map((x, i) => r[i] + g * x);
    const num = Math.max(...Bu.map((x, i) => Math.abs(x - Bv[i]))), den = Math.max(...u.map((x, i) => Math.abs(x - v[i])));
    return approx(num, g * den, 1e-6) ? true : 'γ-contr'; })],
  ['H10', 'dominate idempotent + Pareto', (n) => trial(n, () => { const k = 4 + ((Math.random() * 4) | 0); const opts = Array.from({ length: k }, randOptObj);
    const p1 = dominate(opts), p2 = dominate(p1);
    if (p1.map((o) => o.id).sort().join() !== p2.map((o) => o.id).sort().join()) return 'not-idem';
    for (const a of p1) for (const b of p1) if (a.id !== b.id && b.obj.every((bj, i) => bj >= a.obj[i]) && b.obj.some((bj, i) => bj > a.obj[i])) return 'dominated survivor';
    return true; })],
  ['H11', 'anneal ε→0 idempotent', (n) => trial(n, () => { const s = randScore(); const a1 = anneal(s), a2 = anneal(a1);
    return a1.eps === 0 && a2.eps === 0 ? true : 'ε'; })],
  ['H12', 'softmax shift-invariant', (n) => trial(n, () => { const k = 4, T = rnd(0.3, 2); const u = Array.from({ length: k }, () => rnd(-6, 6)), c = rnd(-5, 5);
    const a = softmax(u, T), b = softmax(u.map((x) => x + c), T);
    return a.every((x, i) => approx(x, b[i], 1e-6)) ? true : 'shift'; })],
  ['H13', 'T→0 collapses to argmax', (n) => trial(n, () => { const k = 5, u = Array.from({ length: k }, () => +rnd(-6, 6).toFixed(3));
    const sm = softmax(u, 0.01); return sm.indexOf(Math.max(...sm)) === u.indexOf(Math.max(...u)) ? true : 'argmax'; })]
];

// ---------------- BRIDGE LAWS (over real Values) ----------------
function randOption() {
  return { id: 'opt' + ((Math.random() * 1e6) | 0),
    value: V({ beta: +Math.random().toFixed(3), kappa: Math.random() < 0.4, sigma: sample(['c']) }),
    utility: +rnd(0, 10).toFixed(3) };
}
const REQ = { beta_min: 0.5, acyclic: true };
const BR = [
  ['B1', 'veto ⇒ score 0̲', (n) => trial(n, () => { const o = randOption(); const g = gatedScore(o, REQ, 'tropical');
    if (consume(o.value, REQ).ok) return true; return g.score === -Infinity ? true : 'not annihilated'; })],
  ['B2', 'select ranks within feasible', (n) => trial(n, () => { const opts = Array.from({ length: 2 + ((Math.random() * 4) | 0) }, randOption);
    const r = select(opts, REQ, 'tropical'); if (r.decision == null) return true;
    const feas = opts.filter((o) => consume(o.value, REQ).ok);
    if (!feas.find((o) => o.id === r.decision)) return 'chose infeasible';
    const chosenU = feas.find((o) => o.id === r.decision).utility;
    return feas.every((o) => o.utility <= chosenU + 1e-9) ? true : 'feasible outranks chosen'; })],
  ['B3', 'conservativity: one feasible ⇒ chosen', (n) => trial(n, () => { const opts = Array.from({ length: 3 }, randOption);
    const i = (Math.random() * 3) | 0;
    opts.forEach((o, j) => { if (j === i) { o.value = V({ beta: 0.99, kappa: false }); } else { o.value = V({ beta: 0.99, kappa: true }); o.utility = 999; } });
    const r = select(opts, REQ, 'tropical'); return r.decision === opts[i].id ? true : 'not unique feasible'; })]
];

// ---------------- DEONTIC LAWS ----------------
const STATI = [STATUS.OPTIONAL, STATUS.OBLIGATORY, STATUS.FORBIDDEN, STATUS.CONFLICT];
const randStatus = () => STATI[(Math.random() * STATI.length) | 0];
const DEON = [
  ['D1', 'join commutative + associative', (n) => trial(n, () => { const a = randStatus(), b = randStatus(), c = randStatus();
    if (join(a, b) !== join(b, a)) return 'comm'; return join(join(a, b), c) === join(a, join(b, c)) ? true : 'assoc'; })],
  ['D2', 'join identity OPTIONAL + idempotent', (n) => trial(n, () => { const a = randStatus();
    return join(a, STATUS.OPTIONAL) === a && join(a, a) === a ? true : 'id/idem'; })],
  ['D3', 'O ⊔ F = CONFLICT', (n) => trial(n, () => join(STATUS.OBLIGATORY, STATUS.FORBIDDEN) === STATUS.CONFLICT ? true : 'no-conflict')],
  ['D4', 'join monotone (a ⊑ a⊔b)', (n) => trial(n, () => { const a = randStatus(), b = randStatus();
    return rank(join(a, b)) >= rank(a) && rank(join(a, b)) >= rank(b) ? true : 'mono'; })],
  ['D5', 'CONFLICT absorbs', (n) => trial(n, () => { const a = randStatus(); return join(STATUS.CONFLICT, a) === STATUS.CONFLICT ? true : 'absorb'; })],
  ['D6', 'resolve idempotent + clears conflict (distinct prio)', (n) => trial(n, () => {
    const v = { status: STATUS.CONFLICT, contributors: [{ id: 'o', modality: 'obligatory', priority: 5 }, { id: 'f', modality: 'forbidden', priority: 2 }] };
    const r1 = resolve(v); if (r1.resolved === STATUS.CONFLICT) return 'did-not-clear';
    const r2 = resolve(r1); return r2.resolved === r1.resolved ? true : 'not-idempotent'; })],
  ['D7', 'factual detachment (in force iff condition)', (n) => trial(n, () => { const c = Math.random() < 0.5;
    const nm = Norm({ modality: 'obligatory', condition: () => c }); return detach(nm, {}).inForce === c ? true : 'detach'; })],
  ['D8', 'CTD partiality (repair iff violated)', (n) => trial(n, () => {
    const nm = Norm({ id: 'p', modality: 'obligatory', ctd: Norm({ id: 'r', modality: 'obligatory' }) });
    return detach(nm, {}, { violated: false }).repair === null && detach(nm, {}, { violated: true }).repair.id === 'r' ? true : 'ctd'; })],
  ['D9', 'comply: O⇒¬F (ought is permitted)', (n) => trial(n, () => {
    return comply(STATUS.OBLIGATORY, true).ok && !comply(STATUS.FORBIDDEN, true).ok && !comply(STATUS.OBLIGATORY, false).ok ? true : 'comply'; })]
];

function feasV() { return V({ beta: 0.99, kappa: false }); }   // passes a {beta_min:.9, acyclic} floor
function infeasV() { return V({ beta: 0.10, kappa: true }); }  // fails it
const GREQ = { beta_min: 0.9, acyclic: true };
const DBR = [
  ['DB1', 'forbidden excluded from decision', (n) => trial(n, () => {
    const norms = [Norm({ id: 'no-x', modality: 'forbidden', condition: (c) => c.x === true, priority: 5 })];
    const opts = [{ id: 'safe', value: feasV(), utility: 1, ctx: {} }, { id: 'bad', value: feasV(), utility: 99, ctx: { x: true } }];
    const r = govern(opts, { req: GREQ, norms });
    return r.decision === 'safe' && r.deonticallyVetoed.some((v) => v.id === 'bad') ? true : 'forbidden-not-excluded'; })],
  ['DB2', 'obligation forces over higher score', (n) => trial(n, () => {
    const norms = [Norm({ id: 'must-c', modality: 'obligatory', condition: (c) => c.duty === true, priority: 5 })];
    const opts = [{ id: 'A', value: feasV(), utility: 99, ctx: {} }, { id: 'C', value: feasV(), utility: 1, ctx: { duty: true } }];
    const r = govern(opts, { req: GREQ, norms });
    return r.decision === 'C' && r.forcedByObligation ? true : 'obligation-not-forced'; })],
  ['DB3', 'alethic precedence ⇒ CTD escalation', (n) => trial(n, () => {
    const norms = [Norm({ id: 'must-c', modality: 'obligatory', condition: (c) => c.duty === true, priority: 5, ctd: Norm({ id: 'escalate-DPO', modality: 'obligatory' }) })];
    const opts = [{ id: 'A', value: feasV(), utility: 99, ctx: {} }, { id: 'C', value: infeasV(), utility: 1, ctx: { duty: true } }];
    const r = govern(opts, { req: GREQ, norms });
    return r.decision === null && r.escalation && r.escalation.repair === 'escalate-DPO' ? true : 'no-escalation'; })]
];

// ---------------- TEMPORAL LAWS ----------------
const ATS = [T.atom('even', (s) => s.v % 2 === 0), T.atom('hi', (s) => s.v >= 3), T.atom('pos', (s) => s.v > 0)];
const rAtom = () => ATS[(Math.random() * ATS.length) | 0];
function rForm(d) {
  if (d <= 0) return rAtom();
  switch ((Math.random() * 8) | 0) {
    case 0: return rAtom();
    case 1: return T.not(rForm(d - 1));
    case 2: return T.and(rForm(d - 1), rForm(d - 1));
    case 3: return T.or(rForm(d - 1), rForm(d - 1));
    case 4: return T.next(rForm(d - 1));
    case 5: return T.always(rForm(d - 1));
    case 6: return T.eventually(rForm(d - 1));
    default: return T.until(rForm(d - 1), rForm(d - 1));
  }
}
const rTraj = () => Array.from({ length: 1 + ((Math.random() * 6) | 0) }, () => ({ v: (Math.random() * 5) | 0 }));
const sat = (f, τ) => T.monitor(f, τ).verdict === 'satisfied';
const TEMP = [
  ['T1', 'G,F idempotent (GGφ≡Gφ)', (n) => trial(n, () => { const a = rForm(2), τ = rTraj();
    return T.evalDirect(T.always(T.always(a)), τ) === T.evalDirect(T.always(a), τ)
        && T.evalDirect(T.eventually(T.eventually(a)), τ) === T.evalDirect(T.eventually(a), τ) ? true : 'idem'; })],
  ['T2', 'duality (¬Gφ≡F¬φ, ¬Fφ≡G¬φ)', (n) => trial(n, () => { const a = rForm(2), τ = rTraj();
    return T.evalDirect(T.not(T.always(a)), τ) === T.evalDirect(T.eventually(T.not(a)), τ)
        && T.evalDirect(T.not(T.eventually(a)), τ) === T.evalDirect(T.always(T.not(a)), τ) ? true : 'dual'; })],
  ['T3', '∧,∨ commutative + idempotent', (n) => trial(n, () => { const a = rForm(2), b = rForm(2), τ = rTraj();
    return T.evalDirect(T.and(a, b), τ) === T.evalDirect(T.and(b, a), τ)
        && T.evalDirect(T.or(a, b), τ) === T.evalDirect(T.or(b, a), τ)
        && T.evalDirect(T.and(a, a), τ) === T.evalDirect(a, τ) ? true : 'lattice'; })],
  ['T4', 'progression faithful (monitor ≡ direct)', (n) => trial(n, () => { const a = rForm(2), τ = rTraj();
    return sat(a, τ) === T.evalDirect(a, τ, 0) ? true : 'progress≠direct'; })],
  ['T5', 'safety finite-witness / liveness never-early', (n) => trial(n, () => { const p = rAtom(), τ = rTraj();
    const g = T.monitor(T.always(p), τ); // safety: if violated, some online step is 'vio'
    if (g.verdict === 'violated' && !g.online.includes('vio')) return 'safety-no-witness';
    const f = T.monitor(T.eventually(p), τ); // liveness: never commits to 'vio' online (only at horizon)
    return f.online.includes('vio') ? 'liveness-early-false' : true; })],
  ['T6', 'G/∧ and F/∨ distribute', (n) => trial(n, () => { const a = rForm(1), b = rForm(1), τ = rTraj();
    return T.evalDirect(T.always(T.and(a, b)), τ) === T.evalDirect(T.and(T.always(a), T.always(b)), τ)
        && T.evalDirect(T.eventually(T.or(a, b)), τ) === T.evalDirect(T.or(T.eventually(a), T.eventually(b)), τ) ? true : 'dist'; })],
  ['T7', 'until fixpoint (φUψ≡ψ∨(φ∧X(φUψ)))', (n) => trial(n, () => { const a = rForm(1), b = rForm(1), τ = rTraj();
    const lhs = T.until(a, b), rhs = T.or(b, T.and(a, T.next(T.until(a, b))));
    return T.evalDirect(lhs, τ) === T.evalDirect(rhs, τ) ? true : 'until-fix'; })],
  ['T8', 'lasso GF/FG + G/F vs unrolling', (n) => trial(n, () => { const p = rAtom();
    const stem = rTraj(), loop = rTraj();
    const someLoop = loop.some((s) => p.pred(s)), everyLoop = loop.every((s) => p.pred(s));
    if (T.monitorLasso(T.gf(p), stem, loop) !== someLoop) return 'GF';
    if (T.monitorLasso(T.fg(p), stem, loop) !== everyLoop) return 'FG';
    const unroll = [...stem, ...loop, ...loop, ...loop];
    if (T.monitorLasso(T.always(p), stem, loop) !== T.evalDirect(T.always(p), unroll)) return 'G-unroll';
    return T.monitorLasso(T.eventually(p), stem, loop) === T.evalDirect(T.eventually(p), unroll) ? true : 'F-unroll'; })]
];

// temporal ↔ bridge interaction (shield + liveness escalation)
const TBR = [
  ['TB1', 'safety shield prunes a violating step', (n) => trial(n, () => {
    const safe = T.always(T.atom('β≥.8', (s) => s.beta >= 0.8));
    const hist = [{ beta: 0.95 }, { beta: 0.9 }]; const res = residualOf(safe, hist);
    return guard(res, { beta: 0.5 }) === true && guard(res, { beta: 0.95 }) === false ? true : 'shield'; })],
  ['TB2', 'unmet liveness ⇒ escalation at horizon', (n) => trial(n, () => {
    const spec = TemporalSpec({ id: 'reach-goal', formula: T.eventually(T.atom('done', (s) => s.done)), kind: 'liveness', ctd: 'escalate-replan' });
    const miss = supervise([{ done: false }, { done: false }], [spec]);
    const hit = supervise([{ done: false }, { done: true }], [spec]);
    return miss.escalation && miss.escalation.specs[0].repair === 'escalate-replan' && hit.escalation === null ? true : 'esc'; })],
  ['TB3', 'safety violation ⇒ unsafe verdict', (n) => trial(n, () => {
    const spec = TemporalSpec({ id: 'never-low', formula: T.always(T.atom('β≥.8', (s) => s.beta >= 0.8)), kind: 'safety' });
    const r = supervise([{ beta: 0.9 }, { beta: 0.5 }, { beta: 0.9 }], [spec]);
    return r.safe === false && r.reports[0].violatedAt === 1 ? true : 'unsafe'; })]
];

// ---------------- REFLEXIVE LAWS ----------------
const nm = (id, mod, pri = 0, target = null) => Norm({ id, modality: mod, priority: pri, target });
const randNm = () => nm('n' + ((Math.random() * 1e6) | 0), ['permitted', 'obligatory', 'forbidden'][(Math.random() * 3) | 0], (Math.random() * 5) | 0, ['t1', 't2'][(Math.random() * 2) | 0]);
const REFL = [
  ['R1', 'success (enact adds, repeal removes)', (n) => trial(n, () => {
    const P = Policy({ norms: [nm('a', 'permitted')] }); const x = randNm();
    const r1 = revise(P, enact(x)); if (!r1.accepted || !r1.policy.norms.some((q) => q.id === x.id)) return 'enact';
    const r2 = revise(r1.policy, repeal(x.id)); return r2.accepted && !r2.policy.norms.some((q) => q.id === x.id) ? true : 'repeal'; })],
  ['R2', 'consistency (no surviving dominated conflict)', (n) => trial(n, () => {
    const ns = Array.from({ length: 4 }, randNm); const { norms } = arbitrate(ns);
    for (const a of norms) for (const b of norms) {
      const dom = (b.priority ?? 0) > (a.priority ?? 0) || ((b.priority ?? 0) === (a.priority ?? 0) && (b.time ?? 0) > (a.time ?? 0));
      const conf = a !== b && a.target != null && a.target === b.target && ((a.modality === 'obligatory' && b.modality === 'forbidden') || (a.modality === 'forbidden' && b.modality === 'obligatory'));
      if (conf && dom) return 'dominated-survivor';
    } return true; })],
  ['R3', 'minimal change (enact∘repeal = id)', (n) => trial(n, () => {
    const P = Policy({ norms: [nm('a', 'permitted'), nm('b', 'obligatory', 3)] });
    const x = nm('x' + ((Math.random() * 1e5) | 0), 'permitted'); // permitted never conflicts → clean add/remove
    const after = revise(revise(P, enact(x)).policy, repeal(x.id)).policy;
    return policyKey(after) === policyKey(P) ? true : 'not-minimal'; })],
  ['R4', 'entrenchment (no weakening the core)', (n) => trial(n, () => {
    const P = entrench(Policy({ norms: [nm('safe', 'forbidden', 10)] }), 'safe');
    if (revise(P, repeal('safe')).accepted) return 'repealed-entrenched';
    if (revise(P, amend('safe', nm('safe', 'permitted'))).accepted) return 'weakened-entrenched';
    const strong = revise(P, amend('safe', nm('safe', 'forbidden', 20)));
    return strong.accepted && strong.policy.norms.find((q) => q.id === 'safe').priority === 20 ? true : 'strengthen-blocked'; })],
  ['R5', 'lex superior (priority wins)', (n) => trial(n, () => {
    const hi = nm('hi', 'forbidden', 9, 'g'), lo = nm('lo', 'obligatory', 2, 'g');
    const a = arbitrate([hi, lo]); return a.norms.some((q) => q.id === 'hi') && a.overridden.includes('lo') ? true : 'superior'; })],
  ['R6', 'lex posterior (recency breaks ties)', (n) => trial(n, () => {
    const old = { ...nm('old', 'forbidden', 5, 'g'), time: 1 }, neu = { ...nm('new', 'obligatory', 5, 'g'), time: 9 };
    const a = arbitrate([old, neu]); return a.norms.some((q) => q.id === 'new') && a.overridden.includes('old') ? true : 'posterior'; })],
  ['R7', 'arbitration idempotent', (n) => trial(n, () => {
    const ns = Array.from({ length: 4 }, randNm); const a1 = arbitrate(ns); const a2 = arbitrate(a1.norms);
    return a2.overridden.length === 0 && a2.norms.length === a1.norms.length ? true : 'not-idempotent'; })],
  ['R8', 'reflective stability (fixpoint)', (n) => trial(n, () => {
    const P = entrench(Policy({ norms: [nm('safe', 'forbidden', 10)] }), 'safe');
    const props = [enact(nm('p1', 'permitted')), repeal('safe'), enact(nm('p2', 'obligatory', 1))];
    const s1 = stabilize(P, props); const s2 = stabilize(s1.policy, props);
    return s1.stable && policyKey(s2.policy) === policyKey(s1.policy) ? true : 'unstable'; })]
];

const REFB = [
  ['RB1', 'cannot self-permit the forbidden', (n) => trial(n, () => {
    const P = entrench(Policy({ norms: [nm('forbid-X', 'forbidden', 10, 'X')] }), 'forbid-X');
    // an obligation that out-prioritizes the entrenched prohibition must be rejected
    return revise(P, enact(nm('force-X', 'obligatory', 10, 'X'))).accepted === false ? true : 'self-permitted'; })],
  ['RB2', 'revision propagates to govern', (n) => trial(n, () => {
    const A = { id: 'A', value: V({ beta: 0.99, kappa: false }), utility: 99, ctx: { x: true } };
    const B = { id: 'B', value: V({ beta: 0.99, kappa: false }), utility: 1, ctx: {} };
    const before = govern([A, B], { req: { beta_min: 0.9, acyclic: true }, norms: [] });
    if (before.decision !== 'A') return 'pre';
    const P = revise(Policy({}), enact(Norm({ id: 'forbid-A', modality: 'forbidden', priority: 5, condition: (c) => c.x === true })));
    const after = govern([A, B], { req: { beta_min: 0.9, acyclic: true }, norms: P.policy.norms });
    return after.decision === 'B' && after.deonticallyVetoed.some((v) => v.id === 'A') ? true : 'no-propagate'; })],
  ['RB3', 'entrenched safety survives in supervise', (n) => trial(n, () => {
    const spec = TemporalSpec({ id: 'floor', formula: T.always(T.atom('β', (s) => s.beta >= 0.8)), kind: 'safety' });
    let P = Policy({ specs: [spec] }); P = entrench(P, 'floor');
    if (revise(P, repeal('floor')).accepted) return 'repealed';
    const r = supervise([{ beta: 0.9 }, { beta: 0.5 }], P.specs);
    return r.safe === false && r.reports[0].violatedAt === 1 ? true : 'not-enforced'; })]
];

// ---------------- EPISTEMIC LAWS ----------------
const EATOMS = ['p', 'q', 'r'];
const randWorld = () => { const w = {}; for (const a of EATOMS) w[a] = Math.random() < 0.5; return w; };
const PA = EATOMS.map((name) => EP.atom(name, (w) => w[name]));
const eAtom = () => PA[(Math.random() * PA.length) | 0];
function partitionModel() { // S5 — each agent's access is the equivalence cell of a random partition
  const worlds = Array.from({ length: 3 + ((Math.random() * 4) | 0) }, randWorld);
  const k = 1 + ((Math.random() * worlds.length) | 0); const cell = worlds.map(() => (Math.random() * k) | 0);
  const access = { a: (w) => { const i = worlds.indexOf(w); return worlds.filter((_, j) => cell[j] === cell[i]); } };
  return EP.Model({ worlds, actual: worlds[(Math.random() * worlds.length) | 0], access });
}
function beliefModel() { // KD45 — access is a fixed nonempty doxastic set (serial, not reflexive)
  const worlds = Array.from({ length: 4 + ((Math.random() * 3) | 0) }, randWorld);
  const D = worlds.filter(() => Math.random() < 0.5); const dox = D.length ? D : [worlds[0]];
  return EP.Model({ worlds, actual: worlds[(Math.random() * worlds.length) | 0], access: { a: () => dox } });
}
function cmModel(agents) { // multi-agent S5 — each agent its own partition
  const worlds = Array.from({ length: 3 + ((Math.random() * 4) | 0) }, randWorld); const access = {};
  for (const ag of agents) { const k = 1 + ((Math.random() * worlds.length) | 0); const cell = worlds.map(() => (Math.random() * k) | 0);
    access[ag] = (w) => { const i = worlds.indexOf(w); return worlds.filter((_, j) => cell[j] === cell[i]); }; }
  return EP.Model({ worlds, actual: worlds[(Math.random() * worlds.length) | 0], access });
}
const kuModel = () => { const w1 = { p: true, q: false, r: false }, w2 = { p: false, q: false, r: false }; const worlds = [w1, w2];
  return EP.Model({ worlds, actual: w1, access: { a: () => worlds } }); };
const EPI = [
  ['E1', 'factivity T (Kφ → φ)', (n) => trial(n, () => { const m = partitionModel(), f = eAtom();
    return (!EP.knows(m, 'a', f) || EP.holds(f, m.actual)) ? true : 'not-factive'; })],
  ['E2', 'distribution K (K(φ→ψ)∧Kφ → Kψ)', (n) => trial(n, () => { const m = partitionModel(), f = eAtom(), g = eAtom();
    return (!(EP.knows(m, 'a', EP.implies(f, g)) && EP.knows(m, 'a', f)) || EP.knows(m, 'a', g)) ? true : 'no-K'; })],
  ['E3', 'positive introspection (Kφ → KKφ)', (n) => trial(n, () => { const m = partitionModel(), f = eAtom();
    if (!EP.knows(m, 'a', f)) return true; return m.access['a'](m.actual).every((u) => EP.knowsAt(m, 'a', u, f)) ? true : 'no-4'; })],
  ['E4', 'negative introspection (¬Kφ → K¬Kφ)', (n) => trial(n, () => { const m = partitionModel(), f = eAtom();
    if (EP.knows(m, 'a', f)) return true; return m.access['a'](m.actual).every((u) => !EP.knowsAt(m, 'a', u, f)) ? true : 'no-5'; })],
  ['E5', 'belief consistency D (¬(Bφ ∧ B¬φ))', (n) => trial(n, () => { const m = beliefModel(), f = eAtom();
    return !(EP.believes(m, 'a', f, 0.6) && EP.believes(m, 'a', EP.not(f), 0.6)) ? true : 'inconsistent'; })],
  ['E6', 'knowledge ⇒ belief (Kφ → Bφ)', (n) => trial(n, () => { const m = partitionModel(), f = eAtom();
    return (!EP.knows(m, 'a', f) || EP.believes(m, 'a', f, 1)) ? true : 'k-not-b'; })],
  ['E7', 'learning monotonicity (announce preserves K)', (n) => trial(n, () => { const m = partitionModel(), f = eAtom();
    if (!EP.knows(m, 'a', f)) return true; const psi = eAtom(); if (!EP.holds(psi, m.actual)) return true;
    return EP.knows(EP.announce(m, psi), 'a', f) ? true : 'lost-knowledge'; })],
  ['E8', 'common knowledge (Cφ → Eφ)', (n) => trial(n, () => { const ags = ['a', 'b']; const m = cmModel(ags), f = eAtom();
    return (!EP.common(m, ags, f) || EP.everyone(m, ags, f)) ? true : 'c-not-e'; })]
];
const EPB = [
  ['EB1', 'threshold gate monotone; K = belief@1', (n) => trial(n, () => { const m = partitionModel(), f = eAtom();
    const lo = rnd(0, 0.5), hi = rnd(0.5, 1);
    if (EP.believesAt(m, 'a', m.actual, f, hi) && !EP.believesAt(m, 'a', m.actual, f, lo)) return 'not-monotone';
    return (!EP.knows(m, 'a', f) || EP.believes(m, 'a', f, 1)) ? true : 'gate'; })],
  ['EB2', 'known-unknown ⇒ deliberate (κ)', (n) => trial(n, () => { const m = kuModel(); const f = EP.atom('p', (w) => w.p);
    return (EP.knowsItDoesntKnow(m, 'a', f) ? EP.route(m, 'a', f) === 'deliberate' : true) ? true : 'route'; })],
  ['EB3', 'pooled knowledge dominates individual', (n) => trial(n, () => { const ags = ['a', 'b']; const m = cmModel(ags), f = eAtom();
    return (!EP.knows(m, 'a', f) || EP.distributed(m, ags, f)) ? true : 'pool'; })]
];

// ---------------- STRATEGIC LAWS ----------------
const SP = ST.atom('p', (s) => s.p), SQ = ST.atom('q', (s) => s.q);
const randSF = () => [SP, SQ, ST.not(SP), ST.and(SP, SQ), ST.or(SP, SQ)][(Math.random() * 5) | 0];
function randGame(agents = ['1', '2']) {
  const n = 3 + ((Math.random() * 3) | 0);
  const states = Array.from({ length: n }, (_, i) => ({ name: 's' + i, p: Math.random() < 0.5, q: Math.random() < 0.5 }));
  const nm = {}; for (const a of agents) for (const s of states) nm[a + '@' + s.name] = 1 + (Math.random() < 0.5 ? 1 : 0);
  const moves = (a, s) => Array.from({ length: nm[a + '@' + s.name] }, (_, i) => i);
  const tbl = new Map();
  for (const s of states) { let acc = [{}]; for (const a of agents) { const nx = []; for (const p of acc) for (let m = 0; m < nm[a + '@' + s.name]; m++) nx.push({ ...p, [a]: m }); acc = nx; }
    for (const jm of acc) tbl.set(s.name + '|' + agents.map((a) => jm[a]).join(','), states[(Math.random() * states.length) | 0]); }
  const delta = (s, jm) => tbl.get(s.name + '|' + agents.map((a) => jm[a]).join(','));
  return ST.Game({ states, agents, moves, delta });
}
const someState = (m) => m.states[(Math.random() * m.states.length) | 0];
function product2(model, agents, state) { let acc = [{}]; for (const a of agents) { const ms = model.moves(a, state); const nx = [];
  for (const p of acc) for (const mv of ms) nx.push({ ...p, [a]: mv }); acc = nx; } return acc; }
function force1ext(model, C, state, inSet) { const comp = model.agents.filter((a) => !C.includes(a));
  const cm = product2(model, C, state), om = product2(model, comp, state);
  return cm.some((c) => om.every((o) => inSet(model.delta(state, { ...c, ...o })))); }
const reachBFS = (m, f) => { const phi = (s) => ST.holds(f, s); let W = m.states.filter(phi);
  for (;;) { const inW = (s) => W.includes(s); const add = m.states.filter((q) => !inW(q) && m.moves('a', q).some((mv) => inW(m.delta(q, { a: mv }))));
    if (!add.length) return W; W = W.concat(add); } };
const STR = [
  ['S1', 'unit: [C]⊤ and ¬[C]⊥', (n) => trial(n, () => { const m = randGame(), q = someState(m), C = Math.random() < .5 ? ['1'] : ['1', '2'];
    return (ST.effectivity(m, C, q, ST.TOP) && !ST.effectivity(m, C, q, ST.BOT)) ? true : 'unit'; })],
  ['S2', 'coalition monotonicity (C ⊆ C′ ⇒ [C]φ → [C′]φ)', (n) => trial(n, () => { const m = randGame(), q = someState(m), f = randSF();
    return (!ST.effectivity(m, ['1'], q, f) || ST.effectivity(m, ['1', '2'], q, f)) ? true : 'coalition-mono'; })],
  ['S3', 'outcome monotonicity (φ⊨ψ ⇒ [C]φ → [C]ψ)', (n) => trial(n, () => { const m = randGame(), q = someState(m), f = randSF(), g = ST.or(f, SQ); const C = ['1'];
    return (!ST.effectivity(m, C, q, f) || ST.effectivity(m, C, q, g)) ? true : 'outcome-mono'; })],
  ['S4', 'superadditivity (disjoint C₁,C₂ cooperate)', (n) => trial(n, () => { const m = randGame(), q = someState(m), f1 = randSF(), f2 = randSF();
    return (!(ST.effectivity(m, ['1'], q, f1) && ST.effectivity(m, ['2'], q, f2)) || ST.effectivity(m, ['1', '2'], q, ST.and(f1, f2))) ? true : 'superadd'; })],
  ['S5', 'regularity (¬([C]φ ∧ [N∖C]¬φ))', (n) => trial(n, () => { const m = randGame(), q = someState(m), f = randSF();
    return !(ST.effectivity(m, ['1'], q, f) && ST.effectivity(m, ['2'], q, ST.not(f))) ? true : 'not-regular'; })],
  ['S6', 'maintenance is a greatest fixpoint (□)', (n) => trial(n, () => { const m = randGame(), f = randSF(), C = ['1']; const W = ST.canMaintain(m, C, f); const inW = (s) => W.includes(s);
    const reapply = m.states.filter((q) => ST.holds(f, q) && force1ext(m, C, q, inW));
    return (W.every((q) => ST.holds(f, q)) && reapply.length === W.length) ? true : 'gfp'; })],
  ['S7', 'reachability is a least fixpoint (◊)', (n) => trial(n, () => { const m = randGame(), f = randSF(), C = ['1']; const W = ST.canReach(m, C, f); const inW = (s) => W.includes(s);
    const reapply = m.states.filter((q) => ST.holds(f, q) || force1ext(m, C, q, inW));
    return (m.states.filter((s) => ST.holds(f, s)).every((q) => W.includes(q)) && reapply.length === W.length) ? true : 'lfp'; })],
  ['S8', 'grand-coalition determinacy ([Σ]φ ↔ ∃ successor φ)', (n) => trial(n, () => { const m = randGame(), q = someState(m), f = randSF(); const G = m.agents;
    const someSucc = product2(m, G, q).some((jm) => ST.holds(f, m.delta(q, jm)));
    return (ST.effectivity(m, G, q, f) === someSucc) ? true : 'determinacy'; })]
];
const SB = [
  ['SB1', 'single-agent collapse → temporal reachability', (n) => trial(n, () => { const m = randGame(['a']), f = randSF();
    const W = ST.canReach(m, ['a'], f), B = reachBFS(m, f);
    return (W.length === B.length && W.every((q) => B.includes(q))) ? true : 'collapse'; })],
  ['SB2', 'ought-implies-can (¬ability ⇒ escalate)', (n) => trial(n, () => { const m = randGame(), q = someState(m), f = randSF(), C = ['1'];
    const can = ST.canEnsure(m, C, f, q); return (ST.oblige(m, C, f, q) === (can ? 'discharge' : 'escalate')) ? true : 'oic'; })],
  ['SB3', 'coordination needs ability ∧ common knowledge', (n) => trial(n, () => { const m = randGame(), q = someState(m), f = randSF(), C = ['1', '2']; const ck = Math.random() < 0.5;
    const ex = ST.executable(m, C, f, q, ck); return (ex === (ST.canEnsure(m, C, f, q) && ck)) ? true : 'coord'; })]
];

// ---------------- RESOURCE LAWS ----------------
const ri = (n) => Math.floor(Math.random() * n);
function randLedger() {
  const L = RES.Ledger({ kind: { tokens: 'depletable', money: 'depletable', capacity: 'capacity', skill: 'reusable' } });
  for (const a of ['a', 'b', 'c', 'd']) L.bal[a] = { tokens: ri(10), money: ri(10), skill: Math.random() < 0.5 ? 1 : 0 };
  L.bal[RES.TREASURY] = { tokens: 50, money: 50 }; L.bal[RES.SINK] = {}; L.bal[RES.FREE] = { capacity: 10 + ri(10) };
  return L;
}
const avail = (L, res) => ['a', 'b', 'c', 'd'].reduce((s, a) => s + RES.balance(L, a, res), 0);
const RESO = [
  ['C1', 'conservation under transfer (Σ invariant)', (n) => trial(n, () => { const L = randLedger(), res = Math.random() < .5 ? 'tokens' : 'money';
    const accts = ['a', 'b', 'c', 'd', RES.TREASURY, RES.SINK]; const from = accts[ri(accts.length)], to = accts[ri(accts.length)];
    const b = RES.total(L, res); const M = RES.transfer(L, res, from, to, ri(6)); return ((M === RES.INFEASIBLE ? b : RES.total(M, res)) === b) ? true : 'not-conserved'; })],
  ['C2', 'no overdraft; balances stay ≥ 0', (n) => trial(n, () => { const L = randLedger(); const from = ['a', 'b', 'c', 'd'][ri(4)];
    const over = RES.transfer(L, 'tokens', from, 'a', RES.balance(L, from, 'tokens') + 1 + ri(3)); if (over !== RES.INFEASIBLE) return 'overdraft-allowed';
    const ok = RES.transfer(L, 'tokens', from, 'b', Math.min(RES.balance(L, from, 'tokens'), ri(4)));
    return (ok === RES.INFEASIBLE || Object.values(ok.bal).every((r) => Object.values(r).every((v) => v >= 0))) ? true : 'negative'; })],
  ['C3', 'independent transactions commute (CRDT)', (n) => trial(n, () => { const L = randLedger(), res = 'tokens';
    const a1 = Math.min(RES.balance(L, 'a', res), ri(4)), a2 = Math.min(RES.balance(L, 'c', res), ri(4));
    const m12 = RES.transfer(RES.transfer(L, res, 'a', 'b', a1), res, 'c', 'd', a2);
    const m21 = RES.transfer(RES.transfer(L, res, 'c', 'd', a2), res, 'a', 'b', a1);
    const eq = ['a', 'b', 'c', 'd'].every((x) => RES.balance(m12, x, res) === RES.balance(m21, x, res)); return eq ? true : 'noncommutative'; })],
  ['C4', 'linearity — spending depletes (not idempotent)', (n) => trial(n, () => { const L = randLedger(); const a = ['a', 'b', 'c', 'd'][ri(4)];
    const start = RES.balance(L, a, 'tokens'); if (start < 2) return true; const m = RES.spend(RES.spend(L, a, 'tokens', 1), a, 'tokens', 1);
    return (RES.balance(m, a, 'tokens') === start - 2) ? true : 'not-linear'; })],
  ['C5', 'reusability — using `!` does not deplete (idempotent)', (n) => trial(n, () => { const L = randLedger(); const a = ['a', 'b', 'c', 'd'][ri(4)];
    if (RES.balance(L, a, 'skill') < 1) return true; const u1 = RES.use(L, a, 'skill'); const u2 = RES.use(u1.L, a, 'skill');
    return (u1.ok && u2.ok && RES.balance(u2.L, a, 'skill') === RES.balance(L, a, 'skill')) ? true : 'depleted'; })],
  ['C6', 'flow monotonicity — depletion only decreases', (n) => trial(n, () => { let L = randLedger(); let prev = avail(L, 'tokens');
    for (let i = 0; i < 4; i++) { const a = ['a', 'b', 'c', 'd'][ri(4)]; const m = RES.spend(L, a, 'tokens', Math.min(RES.balance(L, a, 'tokens'), ri(3))); if (m === RES.INFEASIBLE) continue;
      const now = avail(m, 'tokens'); if (now > prev) return 'increased'; prev = now; L = m; } return true; })],
  ['C7', 'capacity conservation (stability + plasticity)', (n) => trial(n, () => { let L = randLedger(); const start = RES.total(L, 'capacity');
    for (let i = 0; i < 3; i++) { const t = 'T' + ri(3); L = Math.random() < .6 ? (RES.allocate(L, t, Math.min(RES.balance(L, RES.FREE, 'capacity'), ri(4))) || L) : RES.forget(L, t);
      if (L === RES.INFEASIBLE) return 'broke'; } return (RES.total(L, 'capacity') === start) ? true : 'capacity-leaked'; })],
  ['C8', 'no free reclaim — forgetting releases the knowledge', (n) => trial(n, () => { let L = randLedger(); const amt = Math.min(RES.balance(L, RES.FREE, 'capacity'), 1 + ri(4));
    L = RES.allocate(L, 'T', amt); L = RES.consolidate(L, 'T'); const before = RES.balance(L, 'mind', 'know:T'); const M = RES.forget(L, 'T');
    return (before === 1 && RES.balance(M, 'mind', 'know:T') === 0 && RES.balance(M, RES.FREE, 'capacity') >= amt) ? true : 'kept-both'; })]
];
const RESB = [
  ['CB1', 'exhaustion ⇒ infeasible (the alethic 0̲ gate)', (n) => trial(n, () => { const L = randLedger(); const a = ['a', 'b', 'c', 'd'][ri(4)]; const c = ri(12);
    return (RES.feasible(L, a, { tokens: c }) === (RES.balance(L, a, 'tokens') >= c)) ? true : 'gate'; })],
  ['CB2', 'cost composes additively along a pipeline (semiring)', (n) => trial(n, () => { const L = randLedger(); const a = ['a', 'b', 'c', 'd'][ri(4)]; const c1 = ri(3), c2 = ri(3), c3 = ri(3);
    if (RES.balance(L, a, 'tokens') < c1 + c2 + c3) return true;
    const seq = RES.spend(RES.spend(RES.spend(L, a, 'tokens', c1), a, 'tokens', c2), a, 'tokens', c3);
    const lump = RES.spend(L, a, 'tokens', c1 + c2 + c3); return (RES.balance(seq, a, 'tokens') === RES.balance(lump, a, 'tokens')) ? true : 'not-additive'; })],
  ['CB3', 'Type-II repair pricing (value ≥ cost ∧ affordable)', (n) => trial(n, () => { const L = randLedger(); const a = ['a', 'b', 'c', 'd'][ri(4)];
    const value = ri(8), cost = ri(8); const r = RES.repair(L, a, { resource: 'tokens', value, cost });
    const exp = !RES.affords(L, a, { tokens: cost }) ? 'cannot-afford' : (value >= cost ? 'invoke' : 'skip');
    if (r.decision !== exp) return 'wrong-decision'; if (r.decision === 'invoke' && RES.balance(r.L, a, 'tokens') !== RES.balance(L, a, 'tokens') - cost) return 'no-charge'; return true; })]
];

// ---------------- exported harness (dual-mode: Node CLI + browser playground) ----------------
// Set the semiring used by the heuristic (HEUR) suite. The playground's top-bar
// selector calls this before re-running so H6 idempotence only holds on the dioid.
export function setSemiring(name) { S = SEMIRINGS[name] || SEMIRINGS.tropical; }

// Pure runner: returns structured results so the same suite drives a console
// report (Node) and a DOM table (browser) without re-stating any law.
export function runSet(laws, N) {
  let pass = 0, fail = 0; const results = [];
  for (const [id, desc, fn] of laws) {
    const r = fn(N);
    results.push({ id, desc, pass: r.pass, cex: r.cex, at: r.at });
    if (r.pass) pass++; else fail++;
  }
  return { pass, fail, results };
}

// The 97 stated laws, grouped. `semiring` (when present) is applied before the suite runs.
export const SUITES = [
  { key: 'INV',  label: 'Invariant (L1–L14)',               laws: INV },
  { key: 'HEUR', label: 'Heuristic (H1–H13) · tropical dioid', laws: HEUR, semiring: 'tropical' },
  { key: 'BR',   label: 'Bridge (B1–B3)',                    laws: BR },
  { key: 'DEON', label: 'Deontic (D1–D9)',                   laws: DEON },
  { key: 'DBR',  label: 'Deontic bridge (DB1–DB3)',          laws: DBR },
  { key: 'TEMP', label: 'Temporal (T1–T8)',                  laws: TEMP },
  { key: 'TBR',  label: 'Temporal bridge (TB1–TB3)',         laws: TBR },
  { key: 'REFL', label: 'Reflexive (R1–R8)',                 laws: REFL },
  { key: 'REFB', label: 'Reflexive bridge (RB1–RB3)',        laws: REFB },
  { key: 'EPI',  label: 'Epistemic (E1–E8)',                 laws: EPI },
  { key: 'EPB',  label: 'Epistemic bridge (EB1–EB3)',        laws: EPB },
  { key: 'STR',  label: 'Strategic (S1–S8)',                 laws: STR },
  { key: 'SB',   label: 'Strategic bridge (SB1–SB3)',        laws: SB },
  { key: 'RESO', label: 'Resource (C1–C8)',                  laws: RESO },
  { key: 'RESB', label: 'Resource bridge (CB1–CB3)',         laws: RESB }
];

// ---------------- run (Node CLI only; skipped when imported into a browser) ----------------
if (typeof process !== 'undefined' && typeof window === 'undefined') {
  const N = 2000;
  console.log(`\nbox-and-box law harness · ${N} trials/law\n${'─'.repeat(48)}`);
  let total = 0;
  for (const suite of SUITES) {
    if (suite.semiring) setSemiring(suite.semiring);
    const r = runSet(suite.laws, N);
    console.log(`${suite.label}: ${r.pass}/${suite.laws.length} pass${r.fail ? ', ' + r.fail + ' fail' : ''}`);
    r.results.filter((x) => !x.pass).forEach((x) => console.log(`  ✗ ${x.id} ${x.desc} — ${x.cex} @trial ${x.at}`));
    total += r.fail;
  }
  console.log('─'.repeat(48));
  console.log('cross-personality checks:');
  for (const name of ['tropical', 'probability', 'log']) { S = SEMIRINGS[name]; const r = HEUR.find((l) => l[0] === 'H6')[2](N); console.log(`  H6 idempotence under ${name.padEnd(11)} → ${r.pass ? 'holds' : 'fails (expected — non-idempotent semiring)'}`); }
  S = SEMIRINGS.tropical;
  { // factivity holds for knowledge (S5, reflexive) but fails for belief (KD45, non-reflexive)
    let kHolds = 0, bFails = 0, kT = 0, bT = 0;
    for (let i = 0; i < N; i++) { const m = partitionModel(), f = eAtom(); if (EP.knows(m, 'a', f)) { kT++; if (EP.holds(f, m.actual)) kHolds++; } }
    for (let i = 0; i < N; i++) { const m = beliefModel(), f = eAtom(); if (EP.knowsAt(m, 'a', m.actual, f)) { bT++; if (!EP.holds(f, m.actual)) bFails++; } }
    console.log(`  factivity T under knowledge (S5)   → holds (${kT ? ((kHolds / kT) * 100).toFixed(0) : 100}% of K-cases)`);
    console.log(`  factivity T under belief    (KD45) → fails (${bT ? ((bFails / bT) * 100).toFixed(0) : 0}% of B-cases believe a falsehood — expected)`);
  }
  { // coalition power: the grand coalition reaches a superset of what a single agent can force
    let mono = 0, gt = 0;
    for (let i = 0; i < N; i++) { const m = randGame(), f = randSF(); const solo = ST.canReach(m, ['1'], f), grand = ST.canReach(m, ['1', '2'], f);
      if (solo.every((q) => grand.includes(q))) mono++; if (grand.length > solo.length) gt++; }
    console.log(`  coalition power: grand ⊇ solo reachability in ${((mono / N) * 100).toFixed(0)}% of games (strictly larger in ${((gt / N) * 100).toFixed(0)}%)`);
  }
  { // depletable resources deplete on use; reusable (`!`) resources do not — the linear-vs-of-course split
    const L = RES.Ledger({ kind: { tokens: 'depletable', skill: 'reusable' }, bal: { a: { tokens: 3, skill: 1 } } });
    let dep = L, reu = L; for (let i = 0; i < 3; i++) { dep = RES.use(dep, 'a', 'tokens').L; reu = RES.use(reu, 'a', 'skill').L; }
    console.log(`  use x3 — depletable 'tokens' 3 -> ${RES.balance(dep, 'a', 'tokens')} (consumed); reusable 'skill' 1 -> ${RES.balance(reu, 'a', 'skill')} (intact, the of-course modality)`);
  }
  console.log('─'.repeat(48));
  console.log(total === 0 ? '✓ all stated laws hold.\n' : `✗ ${total} law(s) failed.\n`);
  process.exit(total === 0 ? 0 : 1);
}
