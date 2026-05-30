// reflexive.mjs — Reflexive Arithmetic, faithful runtime (v0.5)
// The fifth rung: norms that revise themselves. The object being revised is a Policy —
// the deontic norms + temporal specs of rungs 3–4. Revision follows AGM belief-revision
// discipline (success, consistency, minimal change) and the deontic norm-change principles
// (lex superior = priority, lex posterior = recency). The capstone guarantee is ENTRENCHMENT:
// a constitutional core is immutable to weakening — the system can make itself MORE
// constrained, never less, so self-modification can never relax the safety floor. Laws R1–R8.
import { STATUS } from './norm.mjs';

export const Policy = (p = {}) => ({
  norms: [...(p.norms || [])],
  specs: [...(p.specs || [])],
  entrenched: new Set(p.entrenched || []) // ids of the constitutional core
});

// amendments — the three legal moves over a body of norms (enact / repeal / amend)
export const enact = (item, { authority = 'self', time = 0 } = {}) => ({ op: 'enact', item, authority, time });
export const repeal = (id, { authority = 'self', time = 0 } = {}) => ({ op: 'repeal', id, authority, time });
export const amend = (id, item, { authority = 'self', time = 0 } = {}) => ({ op: 'amend', id, item, authority, time });

const find = (policy, id) => policy.norms.find((n) => n.id === id) || policy.specs.find((s) => s.id === id);
const isNorm = (x) => !!x && x.modality !== undefined;
const conflicts = (a, b) => isNorm(a) && isNorm(b) && a.target != null && a.target === b.target &&
  ((a.modality === 'obligatory' && b.modality === 'forbidden') || (a.modality === 'forbidden' && b.modality === 'obligatory'));
const dedupe = (arr) => { const seen = new Map(); for (const x of arr) seen.set(x.id, x); return [...seen.values()]; };

// the reflexive guard: admissible only if it does not WEAKEN the entrenched core
export function admissible(policy, am) {
  if (am.op === 'repeal')
    return policy.entrenched.has(am.id) ? { ok: false, reason: `“${am.id}” is entrenched — cannot be repealed` } : { ok: true };
  if (am.op === 'amend') {
    if (!policy.entrenched.has(am.id)) return { ok: true };
    const cur = find(policy, am.id), next = am.item;
    if (!cur || !isNorm(cur)) return { ok: false, reason: `“${am.id}” is entrenched — cannot be amended` };
    const stronger = next.modality === cur.modality && (next.priority ?? 0) >= (cur.priority ?? 0); // strengthening allowed
    return stronger ? { ok: true } : { ok: false, reason: `amendment would weaken entrenched “${am.id}”` };
  }
  if (am.op === 'enact') {
    if (isNorm(am.item)) for (const id of policy.entrenched) {
      const e = find(policy, id);
      if (e && conflicts(e, am.item) && (am.item.priority ?? 0) >= (e.priority ?? 0))
        return { ok: false, reason: `enacted norm would override entrenched “${id}”` };
    }
    return { ok: true };
  }
  return { ok: false, reason: 'unknown op' };
}

// arbitrate same-target conflicts: lex superior (priority) then lex posterior (recency)
export function arbitrate(norms) {
  const overridden = [];
  for (const a of norms) for (const b of norms) {
    if (a === b || !conflicts(a, b)) continue;
    const aWins = (a.priority ?? 0) > (b.priority ?? 0) ||
      ((a.priority ?? 0) === (b.priority ?? 0) && (a.time ?? 0) > (b.time ?? 0));
    if (aWins && !overridden.includes(b.id)) overridden.push(b.id);
  }
  return { norms: norms.filter((n) => !overridden.includes(n.id)), overridden };
}

// the core operation: revise the policy by an amendment, if admissible
export function revise(policy, am) {
  const adm = admissible(policy, am);
  if (!adm.ok) return { policy, accepted: false, reason: adm.reason, changed: null, overridden: [] };
  const next = Policy(policy);
  next.entrenched = new Set(policy.entrenched);
  const stamp = (x) => ({ ...x, time: am.time ?? 0, authority: am.authority });
  if (am.op === 'enact') { if (isNorm(am.item)) next.norms.push(stamp(am.item)); else next.specs.push(stamp(am.item)); }
  else if (am.op === 'repeal') { next.norms = next.norms.filter((n) => n.id !== am.id); next.specs = next.specs.filter((s) => s.id !== am.id); }
  else if (am.op === 'amend') { next.norms = next.norms.map((n) => n.id === am.id ? stamp(am.item) : n); next.specs = next.specs.map((s) => s.id === am.id ? stamp(am.item) : s); }
  next.norms = dedupe(next.norms); next.specs = dedupe(next.specs); // enacting an in-force id refreshes, never duplicates
  const arb = arbitrate(next.norms);
  next.norms = arb.norms;
  return { policy: next, accepted: true, reason: `${am.op} “${am.item ? am.item.id : am.id}” accepted`, changed: am.op, overridden: arb.overridden };
}

// entrenching is monotone — you may add to the constitution, never (at this level) remove from it
export function entrench(policy, id) { const next = Policy(policy); next.entrenched = new Set(policy.entrenched); next.entrenched.add(id); return next; }

export const policyKey = (p) => JSON.stringify({
  n: p.norms.map((x) => [x.id, x.modality, x.priority ?? 0]).sort(),
  s: p.specs.map((x) => x.id).sort(), e: [...p.entrenched].sort()
});

// reflective stability: apply proposals until the policy stops changing (a fixed point)
export function stabilize(policy, proposals, { maxRounds = 12 } = {}) {
  let cur = policy; const log = [];
  for (let round = 0; round < maxRounds; round++) {
    let changed = false;
    for (const am of proposals) {
      const r = revise(cur, am);
      log.push({ round, op: am.op, accepted: r.accepted, reason: r.reason });
      if (r.accepted && policyKey(r.policy) !== policyKey(cur)) { cur = r.policy; changed = true; }
    }
    if (!changed) return { policy: cur, rounds: round + 1, stable: true, log };
  }
  return { policy: cur, rounds: maxRounds, stable: false, log };
}

export const digest = (p) => `${p.norms.length} norms · ${p.specs.length} specs · ${p.entrenched.size} entrenched`;

export default { Policy, enact, repeal, amend, admissible, arbitrate, revise, entrench, stabilize, policyKey, digest };
