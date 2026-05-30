// examples/supervise.mjs — the temporal layer over an agent's trajectory.
// States carry the invariant Value's fields, so temporal atoms are predicates over the
// real substrate: G(β≥0.8) = "confidence never drops"; F(done) = "the task completes".
import { atom, always, eventually, show } from '../temporal.mjs';
import { TemporalSpec, supervise, residualOf, guard } from '../supervise.mjs';

const betaOK = atom('β≥0.8', (s) => s.beta >= 0.8);
const done = atom('done', (s) => s.done === true);

const specs = [
  TemporalSpec({ id: 'confidence-floor', formula: always(betaOK), kind: 'safety' }),
  TemporalSpec({ id: 'reach-goal', formula: eventually(done), kind: 'liveness', ctd: 'escalate-replan' })
];

const report = (title, τ) => {
  const r = supervise(τ, specs);
  console.log('\n' + title + '\n  ' + '─'.repeat(70));
  console.log('  trajectory: ' + τ.map((s) => `[β${s.beta}${s.done ? ',done' : ''}]`).join(' → '));
  r.reports.forEach((x) => {
    const mark = x.verdict === 'satisfied' ? '✓' : '✗';
    let line = `  ${mark} ${x.kind.padEnd(8)} ${x.id.padEnd(18)} ${show({ t: 'atom', name: x.formula })}  → ${x.verdict}`;
    if (x.violatedAt != null) line += `  (witness @ step ${x.violatedAt})`;
    if (x.escalation) line += `  → escalate: ${x.escalation}`;
    console.log(line);
    console.log('     online: ' + x.online.join(' · '));
  });
  console.log('  ' + r.note);
};

console.log('\nTemporal supervision · safety shield + liveness obligation');
report('1 · a good run (safe, reaches the goal)',
  [{ beta: 0.95, done: false }, { beta: 0.90, done: false }, { beta: 0.88, done: true }]);
report('2 · a bad run (confidence dips, goal never reached)',
  [{ beta: 0.90, done: false }, { beta: 0.50, done: false }, { beta: 0.85, done: false }]);

// the shield, one step ahead
console.log('\n3 · the safety shield (one-step lookahead)\n  ' + '─'.repeat(70));
const history = [{ beta: 0.95, done: false }, { beta: 0.90, done: false }];
const residual = residualOf(always(betaOK), history);
console.log(`  after ${history.length} safe steps, residual = ${show(residual)}`);
console.log(`  guard( next = [β0.50] ) → ${guard(residual, { beta: 0.50 })}   ${guard(residual, { beta: 0.50 }) ? '⇒ PRUNE this action' : ''}`);
console.log(`  guard( next = [β0.95] ) → ${guard(residual, { beta: 0.95 })}   ${guard(residual, { beta: 0.95 }) ? '' : '⇒ allow'}`);
console.log('\n  Safety is enforced before the step is taken; liveness can only be judged at the horizon.\n');
