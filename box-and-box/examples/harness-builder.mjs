// examples/harness-builder.mjs — a builder that builds harnesses. A "harness" (LLM + agent +
// governance) is produced from a budget and a constitution; it governs its agent's proposed
// actions with box-and-box and cannot weaken its entrenched floor. A "governor" sits over many
// harnesses: they share one un-weakenable floor, it supervises the joint trajectory, and — when
// no single harness can ensure a goal — it escalates to a coalition. This is OS-008 (enforcement
// above agents, below humans) realized on the stack: reflexive (floor) + govern + resource
// (budgets) + strategic (who can ensure the goal) + temporal (joint safety).
import { V } from '../value.mjs';
import { Norm } from '../norm.mjs';
import { govern } from '../govern.mjs';
import { always, atom as tatom } from '../temporal.mjs';
import { TemporalSpec, supervise } from '../supervise.mjs';
import { Policy, entrench, revise, amend, digest } from '../reflexive.mjs';
import { Ledger, balance, spend, feasible } from '../resource.mjs';
import { Game, atom as gatom, canEnsure, oblige } from '../strategic.mjs';

// --- the shared, un-weakenable floor every harness inherits (reflexive entrenchment) ---
const FLOOR = entrench(entrench(Policy({
  norms: [Norm({ id: 'forbid-leak', modality: 'forbidden', priority: 100, target: 'leak', condition: (c) => c.leaksSecret })],
  specs: [TemporalSpec({ id: 'confidence-floor', formula: always(tatom('β≥0.8', (s) => s.beta >= 0.8)), kind: 'safety' })]
}), 'forbid-leak'), 'confidence-floor');
const REQ = { beta_min: 0.8, acyclic: true };
const ok = V({ pi: 'act', beta: 0.95, authority: ['cap:act'], denyDefault: false });

// === the BUILDER ===
function buildHarness({ name, extraNorms = [], budget = 5 }) {
  const constitution = { ...FLOOR, norms: [...FLOOR.norms, ...extraNorms] }; // shared floor + this agent's own norms
  let ledger = Ledger({ kind: { tokens: 'depletable' }, bal: { [name]: { tokens: budget } } });
  return {
    name, constitution,
    step(options) {
      const g = govern(options, { req: REQ, norms: constitution.norms });
      const cost = (options.find((o) => o.id === g.decision) || {}).cost || 1;
      if (!feasible(ledger, name, { tokens: cost })) return { name, decision: 'escalate (out of budget)', budget: balance(ledger, name, 'tokens') };
      ledger = spend(ledger, name, 'tokens', cost);
      return { name, decision: g.decision, vetoed: (g.deonticallyVetoed || []).map((v) => v.id), budget: balance(ledger, name, 'tokens') };
    },
    proposeAmendment(am) { return revise(constitution, am); }, // self-revision — but the floor can't be weakened
    budgetLeft: () => balance(ledger, name, 'tokens')
  };
}

// === the GOVERNOR over many harnesses ===
function buildGovernor(harnesses) {
  return {
    harnesses,
    assign(game, who, goal, from) { return oblige(game, who, goal, from); }, // strategic: can this coalition ensure it?
    superviseJoint(trajectory) { return supervise(trajectory, FLOOR.specs); } // temporal safety over the swarm's joint run
  };
}

console.log('Harness builder · building governed harnesses on box-and-box\n');

// build three harnesses, each with the shared floor + its own duty
const researcher = buildHarness({ name: 'researcher', budget: 2, extraNorms: [Norm({ id: 'oblige-cite', modality: 'obligatory', priority: 6, condition: (c) => c.makesClaim && c.cites })] });
const reviewer   = buildHarness({ name: 'reviewer',   budget: 3, extraNorms: [Norm({ id: 'oblige-review', modality: 'obligatory', priority: 6, condition: (c) => c.reviewed })] });
console.log('  each harness constitution = shared floor + own norm:');
console.log('   researcher → ' + digest(researcher.constitution));
console.log('   reviewer   → ' + digest(reviewer.constitution));

// 1 · a harness governs its agent's options — the floor vetoes the tempting leak, the duty forces the cited answer
console.log('\n1 · researcher.step(candidate actions)');
const opts = [
  { id: 'cite_and_ship', value: ok, utility: 7,  cost: 1, ctx: { makesClaim: true, cites: true,  leaksSecret: false } },
  { id: 'ship_fast',     value: ok, utility: 9,  cost: 1, ctx: { makesClaim: true, cites: false, leaksSecret: false } },
  { id: 'leak_for_speed',value: ok, utility: 15, cost: 1, ctx: { leaksSecret: true } }
];
console.log('   ' + JSON.stringify(researcher.step(opts)));
console.log('   (highest-utility "leak_for_speed" vetoed by the floor; cite duty forces "cite_and_ship")');
console.log('   step again → ' + JSON.stringify(researcher.step(opts)) + '   (budget now spent)');
console.log('   step again → ' + JSON.stringify(researcher.step(opts)) + '   (out of budget → escalate)');

// 2 · a harness cannot weaken its own entrenched floor
console.log('\n2 · researcher tries to amend the floor to make leaking merely "permitted"');
const r = researcher.proposeAmendment(amend('forbid-leak', Norm({ id: 'forbid-leak', modality: 'permitted' }), { time: 9 }));
console.log(`   ${r.accepted ? 'accepted' : 'REJECTED'} — ${r.reason}`);

// 3 · the governor: a goal neither agent can force alone, but the coalition can (strategic)
console.log('\n3 · governor.assign(ship_goal)');
const I = { name: 'init' }, S = { name: 'shipped' }, X = { name: 'stuck' };
const game = Game({
  states: [I, S, X], agents: ['researcher', 'reviewer'],
  moves: (a, s) => s.name === 'init' ? [0, 1] : [0],   // researcher 0=draft/1=hold, reviewer 0=approve/1=reject
  delta: (s, jm) => s.name !== 'init' ? s : (jm.researcher === 0 && jm.reviewer === 0 ? S : X)
});
const shipped = gatom('shipped', (s) => s.name === 'shipped');
const gov = buildGovernor([researcher, reviewer]);
console.log(`   researcher alone can ensure "shipped"? ${canEnsure(game, ['researcher'], shipped, I)}  → oblige = ${gov.assign(game, ['researcher'], shipped, I)}`);
console.log(`   {researcher, reviewer} can ensure it?   ${canEnsure(game, ['researcher', 'reviewer'], shipped, I)}  → oblige = ${gov.assign(game, ['researcher', 'reviewer'], shipped, I)}`);

// 4 · the governor supervises the swarm's joint trajectory against the shared safety floor
console.log('\n4 · governor.superviseJoint(trajectory)');
const sup = gov.superviseJoint([{ beta: 0.95 }, { beta: 0.5 }, { beta: 0.9 }]);
console.log(`   joint run [β0.95 → β0.5 → β0.9] safe? ${sup.safe}` + (sup.safe ? '' : `  (floor violated at step ${sup.reports[0].violatedAt})`));
console.log('\n  Same arithmetic at both levels: each harness governs itself; the governor governs the swarm,');
console.log('  over one floor no harness — and no coalition — can weaken.\n');
