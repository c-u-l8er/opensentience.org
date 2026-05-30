// govern.mjs — the full three-modality decision (v0.3).
// Precedence is principled: ALETHIC (can't be violated, ever) ▸ DEONTIC (ought, violable
// but triggers consequences) ▸ AXIOLOGICAL (preference). So:
//   1. consume() — the alethic floor. Infeasible → annihilated (0̲), gone.
//   2. norms     — the deontic layer over the survivors:
//        · FORBIDDEN (not overridden) → excluded, but RECORDED as overridable (a norm, not a wall).
//        · OBLIGATORY & feasible      → FORCED — chosen over any higher-scoring permitted option.
//        · OBLIGATORY but infeasible  → the obligation cannot be met ⇒ contrary-to-duty ESCALATION,
//                                        never a silent fallback to a permitted action.
//   3. select() — the axiological gradient ranks whatever remains admissible.
import { consume } from './value.mjs';
import { SEMIRINGS } from './score.mjs';
import { adjudicateStatus, resolve, escalate, STATUS } from './norm.mjs';

const round = (x) => Math.round(x * 1000) / 1000;
const has = (e, id) => e.contributors.some((c) => c.id === id);

// options: [{ id, value:<Value>, utility:<number>, ctx:<object for the norms> }]
export function govern(options, { req = {}, norms = [], semiring = 'tropical' } = {}) {
  const S = SEMIRINGS[semiring] || SEMIRINGS.tropical;

  // layers 1+2 evaluated per option
  const ev = options.map((o) => {
    const feas = consume(o.value, req);
    const v = resolve(adjudicateStatus(o.ctx || {}, norms));
    return { id: o.id, utility: o.utility ?? S.one, ctx: o.ctx || {}, value: o.value,
      feasible: feas.ok, feasFail: feas.failures, status: v.resolved, overridden: v.overridden, contributors: v.contributors };
  });

  const alethicallyVetoed = ev.filter((e) => !e.feasible).map((e) => ({ id: e.id, failures: e.feasFail }));
  const survivors = ev.filter((e) => e.feasible);

  const deonticallyVetoed = survivors.filter((e) => e.status === STATUS.FORBIDDEN).map((e) => ({
    id: e.id, status: e.status, overridable: true,
    by: e.contributors.filter((c) => c.modality === 'forbidden').map((c) => c.id), overridden: e.overridden
  }));
  const admissible = survivors.filter((e) => e.status === STATUS.OPTIONAL || e.status === STATUS.OBLIGATORY);
  const obligatoryFeasible = admissible.filter((e) => e.status === STATUS.OBLIGATORY);

  // contrary-to-duty: an option is obligatory but the alethic floor blocked it, and no
  // feasible obligatory option can satisfy the duty ⇒ escalate via its CTD.
  const obligedButBlocked = ev.filter((e) => e.status === STATUS.OBLIGATORY && !e.feasible);
  let escalation = null;
  if (obligedButBlocked.length && obligatoryFeasible.length === 0) {
    const blocked = obligedButBlocked[0];
    const nrm = norms.find((n) => n.modality === 'obligatory' && has(blocked, n.id)) || norms.find((n) => n.modality === 'obligatory');
    const esc = escalate(nrm, blocked.ctx);
    escalation = { required: true, repair: esc.repair ? esc.repair.id : 'escalate-to-human',
      reason: esc.reason, blockedOption: blocked.id, blockedBy: blocked.feasFail };
  }
  // a surviving unresolved conflict also escalates
  const conflicted = survivors.filter((e) => e.status === STATUS.CONFLICT);
  if (!escalation && conflicted.length)
    escalation = { required: true, repair: 'escalate-to-human', reason: `unresolved conflict on ${conflicted[0].id}`, blockedOption: conflicted[0].id, blockedBy: [] };

  // selection — obligation forces the pool; otherwise rank all admissible
  const pool = (obligatoryFeasible.length ? obligatoryFeasible : admissible).slice().sort((a, b) => b.utility - a.utility);
  let chosen = escalation ? null : (pool[0] || null);
  const margin = pool.length > 1 ? round(pool[0].utility - pool[1].utility) : null;
  const ranking = pool.map((e) => ({ id: e.id, score: round(e.utility), status: e.status }));

  let note;
  if (escalation) note = escalation.blockedOption && escalation.blockedBy.length
    ? `Obligation cannot be met — “${escalation.blockedOption}” is infeasible (${escalation.blockedBy.map((f) => f.family + ': ' + f.why).join('; ')}). Contrary-to-duty: ${escalation.reason}.`
    : `Escalation required — ${escalation.reason}.`;
  else if (chosen && obligatoryFeasible.length) note = `“${chosen.id}” is obligatory (in force) and selected — it overrides higher-scoring permitted options.`;
  else if (chosen && deonticallyVetoed.length) note = `${deonticallyVetoed.length} option(s) forbidden by norms and excluded (overridable). The gradient selected “${chosen.id}”.`;
  else if (chosen) note = `No norms in force; the gradient selected “${chosen.id}”.`;
  else note = 'No admissible option.';

  return {
    decision: chosen ? chosen.id : null,
    forcedByObligation: !!(chosen && obligatoryFeasible.length),
    escalation,
    margin, semiring, ranking,
    deonticallyVetoed, alethicallyVetoed,
    layers: ['alethic', 'deontic', 'axiological'],
    note
  };
}

export default { govern };
