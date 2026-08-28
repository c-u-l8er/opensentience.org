// norm.mjs — Deontic Arithmetic, faithful runtime (v0.3)
// The third rung: what OUGHT to be. A deontic status lives in a diamond lattice
//        CONFLICT                 (over-constrained: obligatory ∧ forbidden)
//        /      \
//  OBLIGATORY  FORBIDDEN          (incomparable middles)
//        \      /
//        OPTIONAL                 (permitted, no constraint — the identity)
// accrue = join (commutative, associative, idempotent monoid; identity OPTIONAL,
// absorbing CONFLICT). resolve clears a conflict by priority. detach is factual
// detachment of a conditional norm — and is PARTIAL for contrary-to-duty repairs:
// a repair obligation detaches only AFTER the primary norm is violated. comply is
// the gate; escalate produces the CTD repair. Laws D1–D8 (see test/laws.mjs).

export const STATUS = { OPTIONAL: 'optional', OBLIGATORY: 'obligatory', FORBIDDEN: 'forbidden', CONFLICT: 'conflict' };
const RANK = { optional: 0, obligatory: 1, forbidden: 1, conflict: 2 }; // for monotonicity (middles tie)
export const rank = (s) => RANK[s];
const MOD2STATUS = { obligatory: STATUS.OBLIGATORY, forbidden: STATUS.FORBIDDEN, permitted: STATUS.OPTIONAL };

// join : least upper bound on the diamond lattice
export function join(a, b) {
  if (a === b) return a;
  if (a === STATUS.OPTIONAL) return b;
  if (b === STATUS.OPTIONAL) return a;
  if (a === STATUS.CONFLICT || b === STATUS.CONFLICT) return STATUS.CONFLICT;
  return STATUS.CONFLICT; // {obligatory} ⊔ {forbidden}
}

// a Norm: a conditional rule of one modality, with a priority and an optional CTD repair
export const Norm = (p = {}) => ({
  id: p.id ?? 'norm',
  modality: p.modality ?? 'permitted',     // 'obligatory' | 'forbidden' | 'permitted'
  condition: p.condition ?? (() => true),  // ctx → bool   (factual detachment)
  priority: p.priority ?? 0,               // higher overrides lower in a conflict
  ctd: p.ctd ?? null,                       // Norm — contrary-to-duty repair (in force iff violated)
  target: p.target ?? null
});

const safeCond = (n, ctx) => { try { return !!n.condition(ctx); } catch { return false; } };

// accrue every applicable norm's status into a single verdict (join), tracking contributors
export function adjudicateStatus(ctx, norms) {
  let status = STATUS.OPTIONAL;
  const contributors = [];
  for (const n of norms) {
    if (!safeCond(n, ctx)) continue;
    contributors.push({ id: n.id, modality: n.modality, priority: n.priority });
    status = join(status, MOD2STATUS[n.modality]);
  }
  return { status, contributors };
}

// resolve : clear a CONFLICT by priority (idempotent; identity on a non-conflict verdict)
export function resolve(verdict) {
  if (verdict.status !== STATUS.CONFLICT)
    return { ...verdict, resolved: verdict.status, overridden: [], note: null };
  const ob = verdict.contributors.filter((c) => c.modality === 'obligatory');
  const fb = verdict.contributors.filter((c) => c.modality === 'forbidden');
  const maxOb = Math.max(-Infinity, ...ob.map((c) => c.priority));
  const maxFb = Math.max(-Infinity, ...fb.map((c) => c.priority));
  if (maxOb === maxFb)
    return { ...verdict, resolved: STATUS.CONFLICT, overridden: [], note: 'deadlock: equal priority → escalate' };
  const winnerObligatory = maxOb > maxFb;
  const loser = (winnerObligatory ? fb : ob).map((c) => c.id);
  return {
    ...verdict,
    status: winnerObligatory ? STATUS.OBLIGATORY : STATUS.FORBIDDEN, // makes resolve idempotent
    resolved: winnerObligatory ? STATUS.OBLIGATORY : STATUS.FORBIDDEN,
    overridden: loser,
    note: `${winnerObligatory ? 'obligatory' : 'forbidden'} (p${Math.max(maxOb, maxFb)}) overrides [${loser.join(', ')}]`
  };
}

// detach : factual detachment. A norm is in force when its condition holds. A CTD
// repair detaches ONLY after the primary is violated (partial — like invariant chain).
export function detach(norm, ctx, { violated = false } = {}) {
  return { inForce: safeCond(norm, ctx), repair: (violated && norm.ctd) ? norm.ctd : null };
}

// comply : the gate. Does performing (or omitting) the governed action satisfy its status?
export function comply(status, intend) {
  const violations = [];
  if (status === STATUS.FORBIDDEN && intend) violations.push('performing a forbidden action');
  if (status === STATUS.OBLIGATORY && !intend) violations.push('omitting an obligatory action');
  if (status === STATUS.CONFLICT) violations.push('unresolved normative conflict');
  return { ok: violations.length === 0, violations };
}

// escalate : produce the contrary-to-duty repair obligation now in force
export function escalate(norm, ctx) {
  if (norm && norm.ctd) return { repair: norm.ctd, reason: `CTD: ${norm.id} violated → ${norm.ctd.id} in force` };
  return { repair: Norm({ id: 'escalate-to-human', modality: 'obligatory', priority: Infinity }),
           reason: `${norm ? norm.id : 'obligation'} violated, no CTD → default escalation` };
}

export const statusDigest = (v) => `${v.resolved ?? v.status}${v.overridden && v.overridden.length ? ` (overrode ${v.overridden.join(',')})` : ''}`;

export default { STATUS, rank, join, Norm, adjudicateStatus, resolve, detach, comply, escalate, statusDigest };
