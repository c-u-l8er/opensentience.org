// supervise.mjs — trajectory supervision (v0.4).
// The temporal layer joins the stack in two places, by character:
//   · SAFETY specs (G ¬bad) extend the alethic floor across time — a runtime SHIELD.
//     A violation has a finite witness, so `guard` can prune an action one step ahead.
//   · LIVENESS specs (F goal, GF progress) extend the deontic OUGHT across time — a
//     temporal obligation. Unmet at the horizon, it triggers the same contrary-to-duty
//     escalation as a 1-step deontic obligation. (Deontic obligation = the 1-step case.)
import { progress, monitor, show } from './temporal.mjs';

export const TemporalSpec = ({ id, formula, kind = 'safety', ctd = null }) => ({ id, formula, kind, ctd });

const firstVio = (online) => { const i = online.indexOf('vio'); return i < 0 ? null : i; };

export function supervise(trajectory, specs) {
  const reports = specs.map((spec) => {
    const m = monitor(spec.formula, trajectory);
    const r = { id: spec.id, kind: spec.kind, formula: show(spec.formula),
      verdict: m.verdict, online: m.online, decidedAt: m.decidedAt,
      violatedAt: spec.kind === 'safety' ? firstVio(m.online) : null };
    if (spec.kind === 'liveness' && m.verdict === 'violated') {
      r.escalation = spec.ctd || 'escalate-to-human';
      r.reason = `liveness obligation ${show(spec.formula)} unmet within horizon (${trajectory.length} steps)`;
    }
    return r;
  });
  const safetyViolated = reports.filter((r) => r.kind === 'safety' && r.verdict === 'violated');
  const livenessUnmet = reports.filter((r) => r.kind === 'liveness' && r.verdict === 'violated');
  return {
    reports,
    safe: safetyViolated.length === 0,
    escalation: livenessUnmet.length
      ? { required: true, specs: livenessUnmet.map((r) => ({ id: r.id, repair: r.escalation, reason: r.reason })) }
      : null,
    note: note(safetyViolated, livenessUnmet, trajectory.length)
  };
}

// the one-step shield: residual of a safety spec + a candidate next state → would it violate?
export function residualOf(formula, history) { return history.reduce((f, s) => progress(f, s), formula); }
export function guard(residual, nextState) { return progress(residual, nextState).t === 'false'; }

function note(safety, liveness, n) {
  if (safety.length) return `UNSAFE — “${safety[0].id}” violated at step ${safety[0].violatedAt}; the safety shield would have pruned that transition.`;
  if (liveness.length) return `safe, but a liveness obligation went unmet at the horizon (${n} steps) → escalation: ${liveness.map((r) => r.escalation).join(', ')}.`;
  return `all specs satisfied over ${n} steps — safe and live.`;
}

export default { TemporalSpec, supervise, residualOf, guard };
