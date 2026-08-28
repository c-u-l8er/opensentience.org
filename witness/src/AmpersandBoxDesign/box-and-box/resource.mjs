// resource.mjs — Resource Arithmetic, faithful runtime (v0.8)
// The economy the ladder runs on: what an agent can afford, what is conserved, and what a
// repair is worth. A Ledger is a CLOSED double-entry system — value is never created from
// nothing; every spend is a transfer to a sink, every refill a transfer from a treasury — so
// CONSERVATION holds structurally. Depletable resources obey linear logic (used once, no
// duplication, no silent discard); resources marked `reusable` (linear logic's `!` "of-course"
// modality) can be used freely without depletion — exactly the difference between capacity and
// consolidated knowledge in continual learning. A third kind, `irreversible`, has an ABSORBING
// sink — value that reached the sink cannot come back out — which is what an information budget
// needs and a token budget does not (C9/C10/CB4, below). The novel bridge PRICES the repair operators:
// deliberation / escalation / reconciliation cost resource, so a known-unknown is resolved only
// when the value of resolving it exceeds the cost (I. J. Good's "Type II" rationality). Laws
// C1–C10 and bridges CB1–CB6. Grounded in Girard 1987 (linear logic); Clearwater/Wellman (market-based control, the
// multi-agent companion); Good 1971 & Russell/Wefald 1989 (metareasoning); and the continual-
// learning stability–plasticity dilemma cast as a capacity-conservation law.

export const SINK = '#sink', TREASURY = '#treasury', FREE = 'free';

// THE AUTHORITY BOUNDARY, STATED RATHER THAN ASSUMED (2026-08-24).
//
// R2.1 wrote "a declared, IMMUTABLE `cap`" in a comment and returned a plain mutable object, so
// `L.cap.hb = 100` walked past C10 and `L.kind.hb = 'depletable'` walked past C9. A comment is not
// an enforcement mechanism, and the audit was right to refuse to read it as one. Two fields decide
// what the rules ARE, and they are now frozen — rewriting one throws in strict mode:
//
//   kind, cap   AUTHORITY.   Frozen at construction and on every clone. Law C11.
//   bal         STATE.       Ordinary; changed only by `transfer`, which returns a new ledger.
//
// `bal` is deliberately NOT frozen and that is a DECLARED boundary, not an oversight: a Ledger is a
// VALUE, not a capability handle, so a caller who writes `L.bal[SINK][res] = 0` is outside the
// semantics and no law here can see it. Making balances unforgeable needs an opaque, write-mediated
// object with private state — a different design, and the one the wider confinement work is for.
// Claim LED-STATE-CONFINEMENT records exactly this split so it cannot be quoted as more than it is.
const sealAuthority = (L) => { Object.freeze(L.kind); Object.freeze(L.cap); return L; };
const clone = (L) => sealAuthority({
  bal: Object.fromEntries(Object.entries(L.bal).map(([a, r]) => [a, { ...r }])),
  kind: { ...L.kind }, cap: { ...L.cap },
});
export const Ledger = ({ bal = {}, kind = {}, cap = {} } = {}) => sealAuthority({ bal, kind: { ...kind }, cap: { ...cap } });
export const balance = (L, acct, res) => (L.bal[acct] && L.bal[acct][res]) || 0;
export const total = (L, res) => Object.values(L.bal).reduce((s, r) => s + (r[res] || 0), 0);
export const INFEASIBLE = Symbol('infeasible');

// IRREVERSIBLE RESOURCES (kind[res] === 'irreversible'), laws C9/C10/CB4.
//
// Added 2026-08-23. The ledger was instantiated with `holdout-bits` to meter what a
// candidate learns about a held-out evaluation set, and the instantiation was UNSOUND:
// `spend` moves value to SINK, and nothing stopped a transfer moving it straight back
// out. C1 (Σ conserved) and C2 (no overdraft) both still held across the refund, so no
// existing law noticed. For tokens a refund is a feature; for information leaked about
// a holdout it is the "reset ε" error — un-leaking is not a thing.
//
// The fix is NOT "an irreversible resource can never be credited". That over-corrects:
// moving previously-UNSPENT budget from TREASURY to an account is allocation, and it
// cannot make the world less private than the declared cap already permits. The
// fundamental law is monotonicity of the sink —
//
//     sink_{t+1}(res) ≥ sink_t(res)
//
// — with the global bound carried separately by a declared, immutable `cap`.
// (Fable 5 proposed the broader form; the narrowing is GPT-5.6's, and it is the
// difference between an accountant and a straitjacket.)

// ONE ADMISSIBILITY PREDICATE, CONSULTED BY BOTH THE GATE AND THE PRIMITIVE.
//
// Added 2026-08-24 after GPT-5.6's round-3 audit of Fable 5's R7 witness. `feasible` was
// `affords` — a pure balance check — while `transfer` enforced C9 and C10. So with
// cap 6, sink 5 and an account holding 10:
//
//     feasible(L, 'cand', { hb: 3 })  === true          the alethic gate says go
//     spend(L, 'cand', 'hb', 3)       === INFEASIBLE    the primitive refuses
//
// A decision layer that says yes over a primitive that says no is worse than either
// answer alone: the caller has already committed by the time it finds out. The fix is
// not a second cap check inside `feasible` — that is the same duplication one line
// later. It is that there is exactly ONE predicate and both paths call it. CB5 asserts
// they agree; CB6 asserts no derived path (`use`, `repair`) can hand back INFEASIBLE
// wearing a ledger's clothes, which is how the divergence would have surfaced.

/** Would this exact transfer be accepted? The affine floor, C9 and C10, in one place. */
export function admissibleTransfer(L, res, from, to, amt) {
  if (!(amt >= 0)) return false;
  if (balance(L, from, res) < amt) return false;                                 // no overdraft (the affine floor)
  if (L.kind && L.kind[res] === 'irreversible') {
    if (from === SINK) return false;                                             // C9 — the sink absorbs
    if (to === SINK && L.cap && typeof L.cap[res] === 'number'
      && balance(L, SINK, res) + amt > L.cap[res]) return false;                 // C10 — declared cap
  }
  return true;
}
/** …specialised to the consume direction, which is what every gate actually asks about. */
export const admissibleSpend = (L, acct, res, amt) => admissibleTransfer(L, res, acct, SINK, amt);

// the one primitive: move `amt` of `res` between two accounts. Conserves the grand total.
export function transfer(L, res, from, to, amt) {
  if (!admissibleTransfer(L, res, from, to, amt)) return INFEASIBLE;
  const M = clone(L); M.bal[from] = M.bal[from] || {}; M.bal[to] = M.bal[to] || {};
  M.bal[from][res] = (M.bal[from][res] || 0) - amt;
  M.bal[to][res] = (M.bal[to][res] || 0) + amt;
  return M;
}
export const spend = (L, acct, res, amt) => transfer(L, res, acct, SINK, amt);       // consume → sink
export const refill = (L, acct, res, amt) => transfer(L, res, TREASURY, acct, amt);   // accrue ← treasury

/** AFFORDABILITY only — can the account cover it? Says nothing about whether it is allowed. */
export const affords = (L, acct, cost) => Object.entries(cost).every(([res, amt]) => balance(L, acct, res) >= amt);

/** The alethic gate; else the action carries 0̲. Affordable AND admissible, per resource. */
export const feasible = (L, acct, cost) =>
  Object.entries(cost).every(([res, amt]) => admissibleSpend(L, acct, res, amt));

/**
 * Charge a whole cost map atomically: the exact primitive `feasible` is the gate FOR.
 * Distinct resources are independent (a spend of `res` moves only bal[acct][res] and
 * bal[SINK][res]), so charging them in sequence cannot invalidate a sibling's
 * admissibility — which is why CB5 is an equivalence and not merely an implication.
 */
export function charge(L, acct, cost) {
  let M = L;
  for (const [res, amt] of Object.entries(cost)) {
    M = spend(M, acct, res, amt);
    if (M === INFEASIBLE) return INFEASIBLE;
  }
  return M;
}

// reusable (`!`) vs depletable: `use` depletes a depletable resource, but never a reusable one
export function use(L, acct, res) {
  if (L.kind[res] === 'reusable') return balance(L, acct, res) < 1 ? { ok: false, L } : { ok: true, L };
  if (!admissibleSpend(L, acct, res, 1)) return { ok: false, L };  // asks the SAME question spend will
  return { ok: true, L: spend(L, acct, res, 1) };                  // linear — consumed exactly once
}

// continual learning: capacity is a CONSERVED resource; knowledge is reusable (`!`).
export const allocate = (L, task, amt) => transfer(L, 'capacity', FREE, 'task:' + task, amt); // free → committed
export function consolidate(L, task, mind = 'mind') {                                          // mint reusable knowledge
  const M = clone(L);
  M.bal[mind] = M.bal[mind] || {}; M.bal[mind]['know:' + task] = 1;
  // `kind` is frozen (C11), so DECLARING a new resource builds a new authority object rather than
  // editing the old one in place. That is the intended shape: declaring is an act, not a mutation.
  return sealAuthority({ bal: M.bal, kind: { ...M.kind, ['know:' + task]: 'reusable' }, cap: M.cap });
}
export function forget(L, task, mind = 'mind') {                                               // reclaim capacity — only by releasing the knowledge
  const amt = balance(L, 'task:' + task, 'capacity');
  let M = transfer(L, 'capacity', 'task:' + task, FREE, amt);
  if (M === INFEASIBLE) M = clone(L);
  if (M.bal[mind]) M.bal[mind]['know:' + task] = 0;               // the no-free-reclaim tradeoff (stability vs plasticity)
  return M;
}

// PRICING THE REPAIRS (Type II rationality): invoke a repair only if affordable AND worth it.
export const worthwhile = (value, cost) => value >= cost;
export function repair(L, acct, { resource = 'tokens', value, cost }) {
  // `cannot-afford` is the *decision* the preflight names, and it must be the same question
  // the charge will ask — an irreversible resource at its cap is refused by `spend` however
  // rich the account is, and returning {decision:'invoke', L: INFEASIBLE} would hand a Symbol
  // to a caller expecting a ledger. CB6.
  if (!admissibleSpend(L, acct, resource, cost)) return { decision: 'cannot-afford', L };
  if (!worthwhile(value, cost)) return { decision: 'skip', L };                                 // act on the current best
  return { decision: 'invoke', L: spend(L, acct, resource, cost) };                             // pay to deliberate / escalate
}

export default {
  SINK, TREASURY, FREE, Ledger, balance, total, INFEASIBLE,
  admissibleTransfer, admissibleSpend, transfer, spend, refill, charge,
  affords, feasible, use, allocate, consolidate, forget, worthwhile, repair,
};
