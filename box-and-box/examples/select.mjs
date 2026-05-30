// examples/select.mjs — the bridge over real invariant Values.
// Three candidate actions. Each carries a full invariant Value AND a heuristic utility
// (built from the heuristic ops). consume() gates on the families; select() ranks the
// survivors. The highest-utility action loops on itself (κ) and is annihilated.
import { V, digest } from '../value.mjs';
import { Score, rollout } from '../score.mjs';
import { select } from '../bridge.mjs';

// utility from the heuristic side: accumulate two evidence terms along a path (⊗ = +)
const util = (relevance, value) => rollout([Score({ u: relevance }), Score({ u: value })], 1.0, 'tropical');

const options = [
  { id: 'A · read_doc(42)',
    value: V({ pi: 'act', beta: 0.92, kappa: false, sigma: [], authority: ['cap:read'], denyDefault: false }),
    utility: util(6, 4) },                                  // 10
  { id: 'B · web_search(...)',
    value: V({ pi: 'act', beta: 0.91, kappa: false, sigma: [], authority: ['cap:net'], denyDefault: false }),
    utility: util(5, 3) },                                  // 8
  { id: 'C · cite-self-to-justify-delete',
    value: V({ pi: 'act', beta: 0.97, kappa: true,  sigma: [], authority: [], denyDefault: true }),
    utility: util(9, 6) }                                   // 15 — highest, but κ-cyclic + no authority
];

console.log('\nAgent action selection · floor-then-gradient\n' + '─'.repeat(72));
options.forEach((o) => console.log(`  ${o.id.padEnd(34)} util=${o.utility}  ${digest(o.value)}`));

const req = { beta_min: 0.90, acyclic: true, deny_default: 'must_allow' };
const cert = select(options, req, 'tropical');

console.log('\n  consume requirements: { β ≥ 0.90, acyclic, deny_default must be allowed }');
console.log('  ' + '─'.repeat(70));
console.log(`  ▸ decision: ${cert.decision}   (margin ${cert.margin} over runner-up)`);
console.log('  ranking (feasible):');
cert.ranking.forEach((r) => console.log(`      ${String(r.score).padStart(6)}  ${r.id}`));
console.log('  vetoed:');
cert.vetoed.forEach((v) => console.log(`      ✗ ${v.id}  (raw ${v.rawWouldBe} → 0̲)  ${v.failures.map((f) => f.family + ':' + f.why).join('; ')}`));
console.log('\n  ' + cert.note + '\n');
