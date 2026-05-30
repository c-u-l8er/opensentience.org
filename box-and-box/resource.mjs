// resource.mjs — Resource Arithmetic, faithful runtime (v0.8)
// The economy the ladder runs on: what an agent can afford, what is conserved, and what a
// repair is worth. A Ledger is a CLOSED double-entry system — value is never created from
// nothing; every spend is a transfer to a sink, every refill a transfer from a treasury — so
// CONSERVATION holds structurally. Depletable resources obey linear logic (used once, no
// duplication, no silent discard); resources marked `reusable` (linear logic's `!` "of-course"
// modality) can be used freely without depletion — exactly the difference between capacity and
// consolidated knowledge in continual learning. The novel bridge PRICES the repair operators:
// deliberation / escalation / reconciliation cost resource, so a known-unknown is resolved only
// when the value of resolving it exceeds the cost (I. J. Good's "Type II" rationality). Laws
// C1–C8. Grounded in Girard 1987 (linear logic); Clearwater/Wellman (market-based control, the
// multi-agent companion); Good 1971 & Russell/Wefald 1989 (metareasoning); and the continual-
// learning stability–plasticity dilemma cast as a capacity-conservation law.

export const SINK = '#sink', TREASURY = '#treasury', FREE = 'free';
const clone = (L) => ({ bal: Object.fromEntries(Object.entries(L.bal).map(([a, r]) => [a, { ...r }])), kind: { ...L.kind } });
export const Ledger = ({ bal = {}, kind = {} } = {}) => ({ bal, kind });
export const balance = (L, acct, res) => (L.bal[acct] && L.bal[acct][res]) || 0;
export const total = (L, res) => Object.values(L.bal).reduce((s, r) => s + (r[res] || 0), 0);
export const INFEASIBLE = Symbol('infeasible');

// the one primitive: move `amt` of `res` between two accounts. Conserves the grand total.
export function transfer(L, res, from, to, amt) {
  if (amt < 0 || balance(L, from, res) < amt) return INFEASIBLE; // no overdraft (the affine floor)
  const M = clone(L); M.bal[from] = M.bal[from] || {}; M.bal[to] = M.bal[to] || {};
  M.bal[from][res] = (M.bal[from][res] || 0) - amt;
  M.bal[to][res] = (M.bal[to][res] || 0) + amt;
  return M;
}
export const spend = (L, acct, res, amt) => transfer(L, res, acct, SINK, amt);       // consume → sink
export const refill = (L, acct, res, amt) => transfer(L, res, TREASURY, acct, amt);   // accrue ← treasury
export const affords = (L, acct, cost) => Object.entries(cost).every(([res, amt]) => balance(L, acct, res) >= amt);
export const feasible = (L, acct, cost) => affords(L, acct, cost);                    // the alethic gate; else the action carries 0̲

// reusable (`!`) vs depletable: `use` depletes a depletable resource, but never a reusable one
export function use(L, acct, res) {
  if (balance(L, acct, res) < 1) return { ok: false, L };
  if (L.kind[res] === 'reusable') return { ok: true, L };          // copy freely — no depletion
  return { ok: true, L: spend(L, acct, res, 1) };                  // linear — consumed exactly once
}

// continual learning: capacity is a CONSERVED resource; knowledge is reusable (`!`).
export const allocate = (L, task, amt) => transfer(L, 'capacity', FREE, 'task:' + task, amt); // free → committed
export function consolidate(L, task, mind = 'mind') {                                          // mint reusable knowledge
  const M = clone(L); M.kind['know:' + task] = 'reusable';
  M.bal[mind] = M.bal[mind] || {}; M.bal[mind]['know:' + task] = 1; return M;
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
  if (!affords(L, acct, { [resource]: cost })) return { decision: 'cannot-afford', L };
  if (!worthwhile(value, cost)) return { decision: 'skip', L };                                 // act on the current best
  return { decision: 'invoke', L: spend(L, acct, resource, cost) };                             // pay to deliberate / escalate
}

export default { SINK, TREASURY, FREE, Ledger, balance, total, INFEASIBLE, transfer, spend, refill, affords, feasible, use, allocate, consolidate, forget, worthwhile, repair };
