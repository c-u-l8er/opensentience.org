// examples/economy.mjs — three things the resource rung adds: an affordability gate, the
// Type-II decision of whether a repair is even worth its cost, and continual learning modelled
// as the allocation of a conserved capacity (with the stability/plasticity tradeoff as a law).
import { Ledger, balance, total, feasible, repair, allocate, consolidate, forget, use, FREE } from '../resource.mjs';

console.log('\nResource Arithmetic · afford, price the repair, allocate capacity');

// 1 · the affordability gate (the alethic 0̲, now over a budget)
const wallet = Ledger({ kind: { tokens: 'depletable' }, bal: { agent: { tokens: 5 } } });
console.log('\n1 · an action is feasible only if you can afford it');
console.log(`  budget = 5 tokens`);
console.log(`  a 3-token call  → feasible? ${feasible(wallet, 'agent', { tokens: 3 })}`);
console.log(`  an 8-token call → feasible? ${feasible(wallet, 'agent', { tokens: 8 })}   (carries 0̲ — annihilates the pipeline)`);

// 2 · Type-II rationality: deliberation costs, so resolve an unknown only when it's worth it
console.log('\n2 · a repair (deliberation) is invoked only if its value beats its cost');
const cases = [
  { label: 'high-value unknown', value: 6, cost: 2 },
  { label: 'low-value unknown ', value: 1, cost: 4 },
  { label: 'unaffordable      ', value: 9, cost: 8 }
];
const purse = Ledger({ kind: { tokens: 'depletable' }, bal: { agent: { tokens: 5 } } });
for (const c of cases) { const r = repair(purse, 'agent', { resource: 'tokens', value: c.value, cost: c.cost });
  console.log(`  ${c.label} (value ${c.value}, cost ${c.cost}) → ${r.decision}`); }
console.log(`  the epistemic rung detects the gap; the resource rung decides if closing it is rational.`);

// 3 · continual learning: capacity is conserved; knowledge is reusable; forgetting is a tradeoff
console.log('\n3 · continual learning as conserved capacity');
let L = Ledger({ kind: { capacity: 'capacity' }, bal: { [FREE]: { capacity: 10 } } });
console.log(`  total capacity = ${total(L, 'capacity')}, free = ${balance(L, FREE, 'capacity')}`);
L = allocate(L, 'vision', 4); L = consolidate(L, 'vision');     // learn task, consolidate to reusable knowledge
L = allocate(L, 'audio', 3); L = consolidate(L, 'audio');
console.log(`  after learning vision(4) + audio(3): free = ${balance(L, FREE, 'capacity')}, total = ${total(L, 'capacity')} (conserved)`);
console.log(`  reuse vision knowledge twice — still there? ${use(use(L, 'mind', 'know:vision').L, 'mind', 'know:vision').ok} (reuse is free)`);
const before = balance(L, 'mind', 'know:vision');
L = forget(L, 'vision');                                          // reclaim capacity — but the knowledge goes with it
console.log(`  forget vision to reclaim capacity: free = ${balance(L, FREE, 'capacity')}, knowledge kept? ${balance(L, 'mind', 'know:vision') === before}`);
console.log(`  you cannot keep the knowledge and reclaim its capacity — that IS the stability/plasticity dilemma.\n`);
