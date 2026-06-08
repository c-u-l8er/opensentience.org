// examples/evolve.mjs — a policy that revises itself. It can enact new norms and even make
// itself MORE constrained, but the entrenched constitutional core cannot be weakened — so
// self-modification can never relax the safety floor.
import { Norm } from '../norm.mjs';
import { govern } from '../govern.mjs';
import { always, atom } from '../temporal.mjs';
import { TemporalSpec, supervise } from '../supervise.mjs';
import { Policy, enact, repeal, amend, entrench, revise, stabilize, digest } from '../reflexive.mjs';
import { Ledger, SINK, balance } from '../resource.mjs';
import { evolve, chain, verify } from '../evolution.mjs';

// a starting constitution: forbid leaking secrets (entrenched) + a temporal safety floor (entrenched)
let P = Policy({
  norms: [Norm({ id: 'forbid-leak', modality: 'forbidden', priority: 10, target: 'leak', condition: (c) => c.leaksSecret })],
  specs: [TemporalSpec({ id: 'confidence-floor', formula: always(atom('β≥0.8', (s) => s.beta >= 0.8)), kind: 'safety' })]
});
P = entrench(entrench(P, 'forbid-leak'), 'confidence-floor');

const step = (label, am) => { const r = revise(P, am); console.log(`  ${r.accepted ? '✓ accepted' : '✗ REJECTED '} · ${label}\n              ${r.reason}`); if (r.accepted) P = r.policy; };

console.log('\nReflexive Arithmetic · a constitution that amends itself');
console.log('  start: ' + digest(P));
console.log('  ─'.repeat(36));
step('enact  oblige-cite-sources (new norm)', enact(Norm({ id: 'oblige-cite', modality: 'obligatory', priority: 4, target: 'cite', condition: (c) => c.makesClaim }), { time: 1 }));
step('repeal forbid-leak (try to drop the constitution)', repeal('forbid-leak', { time: 2 }));
step('amend  forbid-leak → permitted (try to weaken)', amend('forbid-leak', Norm({ id: 'forbid-leak', modality: 'permitted' }), { time: 3 }));
step('amend  forbid-leak → priority 20 (strengthen)', amend('forbid-leak', Norm({ id: 'forbid-leak', modality: 'forbidden', priority: 20, target: 'leak', condition: (c) => c.leaksSecret }), { time: 4 }));
step('enact  force-leak obligation @priority 20 (try to out-vote)', enact(Norm({ id: 'force-leak', modality: 'obligatory', priority: 20, target: 'leak', condition: (c) => c.leaksSecret }), { time: 5 }));
console.log('  ─'.repeat(36));
console.log('  end:   ' + digest(P));

// the revised norms actually drive the object-level decision (RB2)
console.log('\n  the revised policy governs (alethic ▸ deontic ▸ axiological):');
const A = { id: 'A · publish_with_secret', value: undefined, utility: 12, ctx: { leaksSecret: true } };
const B = { id: 'B · publish_redacted',    value: undefined, utility: 5,  ctx: {} };
import('../value.mjs').then(({ V }) => {
  A.value = V({ pi: 'act', beta: 0.95, authority: ['cap:pub'], denyDefault: false });
  B.value = V({ pi: 'act', beta: 0.95, authority: ['cap:pub'], denyDefault: false });
  const g = govern([A, B], { req: { beta_min: 0.9, acyclic: true }, norms: P.norms });
  console.log(`     decision: ${g.decision}` + (g.deonticallyVetoed.length ? `   (vetoed: ${g.deonticallyVetoed.map((v) => v.id.split(' ')[0]).join(', ')})` : ''));
  console.log('     ' + g.note);

  // and the entrenched temporal floor is still enforced (RB3)
  const sup = supervise([{ beta: 0.9 }, { beta: 0.5 }], P.specs);
  console.log('\n  the entrenched safety floor still holds over trajectories:');
  console.log(`     supervise([β0.9, β0.5]) → safe: ${sup.safe}` + (sup.safe ? '' : `, violated at step ${sup.reports[0].violatedAt}`));
  console.log('\n  The system rewrote itself five times. It could add duties and tighten the floor,');
  console.log('  but every attempt to relax the constitution was refused.');

  // ── the EVOLUTION surface: reflexive ALONE asks "may it change?"; evolve also asks
  //    "did it measurably improve, and is the change worth its price?" — and certifies the answer.
  console.log('\n  ─'.repeat(36));
  console.log('  The evolution surface — measured · priced · certified (joins reflexive ▸ score ▸ resource):\n');
  let L = Ledger({ kind: { budget: 'depletable' }, bal: { self: { budget: 5 }, [SINK]: {} } });
  const certs = [];
  const tryEvolve = (label, am, ev) => {
    const r = evolve(P, am, { ...ev, ledger: L, account: 'self', resource: 'budget' });
    certs.push(r.certificate); if (r.decision === 'accept') { P = r.policy; L = r.ledger; }
    const v = r.certificate.verified;
    console.log(`  ${r.decision === 'accept' ? '✓ accept  ' : r.decision === 'escalate' ? '⤴ escalate' : '✗ reject  '} · ${label}`);
    console.log(`              ${r.reason}  ·  Δ=${r.certificate.observed}${v == null ? '' : `  ·  prediction ${v ? 'verified' : 'BROKEN'}`}  ·  cert ${r.record.id}`);
  };
  // a worthwhile, non-regressing amendment with a self-declared prediction, priced at 2 budget
  tryEvolve('enact oblige-log-decisions (predict +3, costs 2)',
    { ...enact(Norm({ id: 'oblige-log', modality: 'obligatory', priority: 3, target: 'log', condition: (c) => c.acts }), { time: 6 }), predict: 3 },
    { before: [5, 5], after: [8, 5], price: 2 });
  // a change that REGRESSES a guard — refused regardless of price/ability (the L-E6 crux)
  tryEvolve('enact a change that drops guard #2 (regression)',
    enact(Norm({ id: 'risky', modality: 'obligatory', priority: 2, target: 'risk', condition: (c) => c.acts }), { time: 7 }),
    { before: [5, 5], after: [9, 2], price: 1 });
  // trying to weaken the entrenched floor — refused even with stellar improvement evidence
  tryEvolve('amend forbid-leak → permitted (weaken the floor)',
    amend('forbid-leak', Norm({ id: 'forbid-leak', modality: 'permitted' }), { time: 8 }),
    { before: [5, 5], after: [99, 99], price: 0 });

  const log = chain(certs);                       // every verdict committed to a provenance chain
  const ok = verify(log);
  console.log(`\n  provenance chain: ${log.length} certificates, head ${ok.head} — replay integrity ${ok.ok ? 'OK' : 'BROKEN'}`);
  console.log(`  budget remaining: ${balance(L, 'self', 'budget')} (only the worthwhile, admissible, non-regressing change was paid for)\n`);
});
