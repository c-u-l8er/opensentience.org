// evolution.mjs — the Evolution surface, faithful runtime (v0.1)
// NOT a ninth rung. A BRIDGE that joins three existing rungs to decide whether a POLICY may
// change for the better, and records the verdict on a tamper-evident provenance chain:
//   · reflexive (rung 5) — MAY it change?  (entrenched floor is un-weakenable; admissible/revise)
//   · axiological (rung 2) — DID it improve? (non-regression over a guard set — the L-E6 crux)
//   · resource (rung 8)   — is the change WORTH its price? (Type-II: pay to evolve only if Δ ≥ cost)
// It is to a policy what `govern` is to an action, one level up:
//   govern : "may this action proceed, and is it best?"      → a decision certificate
//   evolve : "may this policy change, did it measurably improve, is it worth paying for?"
//                                                            → an EVOLUTION certificate
// This is the observability substrate the kernel lacked. It mirrors AHE's "decision observability":
// every edit is paired with a self-declared PREDICTION, verified against the OBSERVED outcome, and
// the change is committed to a content-addressed hash-chain so any later actor can replay why a
// policy is what it is. Laws EV1–EV6.
import { admissible, revise, policyKey } from './reflexive.mjs';
import { affords, worthwhile, spend, INFEASIBLE } from './resource.mjs';
import { roundDelta } from './numerics.mjs';

// ---- content-addressed provenance (the observability substrate) -------------
// canonical JSON: object keys sorted, so the digest is independent of key order.
export function canon(x) {
  if (x === null || typeof x !== 'object') return JSON.stringify(x ?? null);
  if (Array.isArray(x)) return '[' + x.map(canon).join(',') + ']';
  return '{' + Object.keys(x).sort().map((k) => JSON.stringify(k) + ':' + canon(x[k])).join(',') + '}';
}
// FNV-1a 32-bit — pure, dependency-free, deterministic. (Tamper-evidence, not cryptographic secrecy.)
export function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}
export const digest = (obj) => hash(canon(obj));

export const GENESIS = '00000000';
// a Record links a payload to its predecessor by content hash — change the payload OR the link
// and the id no longer matches, so any edit is detectable.
export function record(payload, prev = GENESIS) { return { id: hash(prev + canon(payload)), prev, payload }; }
// chain a sequence of payloads into a provenance log (each links to the one before it)
export function chain(payloads, prev = GENESIS) {
  const out = []; let p = prev;
  for (const pl of payloads) { const r = record(pl, p); out.push(r); p = r.id; }
  return out;
}
// verify the chain links and the payload hashes — replay integrity / tamper detection
export function verify(records, prev = GENESIS) {
  let p = prev;
  for (const r of records) {
    if (r.prev !== p) return { ok: false, reason: `broken link at ${r.id}` };
    if (record(r.payload, r.prev).id !== r.id) return { ok: false, reason: `tampered payload at ${r.id}` };
    p = r.id;
  }
  return { ok: true, head: p, length: records.length };
}

// ---- the axiological guard --------------------------------------------------
// non-regression (the L-E6 crux): no guard metric may drop below its prior value. A self-improving
// loop that cannot prove it did not regress is just a self-deception loop.
export function regresses(before = [], after = [], tol = 1e-9) {
  const n = Math.min(before.length, after.length);
  for (let i = 0; i < n; i++) if (after[i] < before[i] - tol) return true;
  return false;
}
export const delta = (before = [], after = []) => {
  const sb = before.reduce((s, x) => s + x, 0), sa = after.reduce((s, x) => s + x, 0);
  return roundDelta(sa - sb);
};

// ---- the evolution verdict --------------------------------------------------
// evolve(policy, amendment, evidence) → { decision, reason, policy, ledger, certificate, record }
//   amendment : a reflexive move { op:'enact'|'repeal'|'amend', ... } (see reflexive.mjs), and
//               MAY carry `predict` — the self-declared expected Δ, verified against the outcome.
//   evidence  : { before:[guard scores], after:[guard scores], price?, ledger?, account?, resource?, prev? }
//   decision  : 'accept' | 'reject' | 'escalate'  (escalate = ought-to-improve but cannot afford to)
export function evolve(policy, amendment, evidence = {}) {
  const { before = [], after = [], price = null, ledger = null,
          account = 'self', resource = 'tokens', prev = GENESIS } = evidence;
  const predicted = amendment && amendment.predict != null ? amendment.predict : null; // self-declared
  const observed = delta(before, after);
  const verified = predicted == null ? null : observed >= predicted - 1e-9;             // vs outcome
  const reg = regresses(before, after);

  let decision, reason, ledgerAfter = ledger, priced = false, policyAfter = policy;
  const adm = admissible(policy, amendment);

  if (!adm.ok) { decision = 'reject'; reason = `reflexive: ${adm.reason}`; }            // floor wins
  else if (reg) { decision = 'reject'; reason = 'axiological: a guard metric would regress'; }
  else if (price != null) {                                                             // Type-II pricing
    priced = true;
    const L = ledger || { bal: {}, kind: {} };
    if (!affords(L, account, { [resource]: price })) { decision = 'escalate'; reason = `resource: cannot afford the change (${price} ${resource})`; }
    else if (!worthwhile(observed, price)) { decision = 'reject'; reason = `resource: not worthwhile (Δ ${observed} < ${price})`; }
    else {
      const charged = spend(L, account, resource, price);
      if (charged === INFEASIBLE) { decision = 'escalate'; reason = `resource: cannot afford the change (${price} ${resource})`; }
      else { decision = 'accept'; reason = `priced: Δ ${observed} ≥ ${price} ${resource}`; ledgerAfter = charged; }
    }
  } else { decision = 'accept'; reason = 'admissible, non-regressing (unpriced)'; }

  if (decision === 'accept') {
    const r = revise(policy, amendment);
    if (r.accepted) policyAfter = r.policy;
    else { decision = 'reject'; reason = `reflexive: ${r.reason}`; ledgerAfter = ledger; } // reverse charge
  }

  const certificate = {
    decision, reason,
    op: amendment ? amendment.op : null,
    target: amendment ? (amendment.item ? amendment.item.id : amendment.id) : null,
    predicted, observed, verified, regressed: reg,
    priced, price: price ?? null,
    policyBefore: policyKey(policy),
    policyAfter: policyKey(policyAfter),
    rungs: ['reflexive', 'axiological', 'resource']
  };
  return { decision, reason, policy: policyAfter, ledger: ledgerAfter, certificate, record: record(certificate, prev) };
}

export default { canon, hash, digest, GENESIS, record, chain, verify, regresses, delta, evolve };
