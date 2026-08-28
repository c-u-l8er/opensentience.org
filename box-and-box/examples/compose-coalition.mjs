// examples/compose-coalition.mjs — the lego layer, worked end to end (COMPOSE_RUNTIME.md §2–4).
//
// The [&] stack composes ITSELF. Three capability BRICKS — retrieve, certify, govern — each
// carry a holder, a |> contract, a box-and-box modal Value, a (duck-typed) cost certificate, and
// the CC2 semiring quantities. We snap them together two ways:
//
//   coalition  =  (mem_local & mem_remote)            — & : parallel lattice merge of capabilities
//   pipeline   =  retrieve |> certify |> govern        — |> : governed, phase-graded hand-off
//
// Both yield ANOTHER brick (closure: a brick of bricks is a brick), carrying a composite cost
// certificate (worst class wins) and composite quantities (confidence ×, cost +, latency max).
// Then we show the floor: a backward phase, a type mismatch, and an uncertified child each
// collapse to 0̲ — utility cannot resurrect them. Finally we re-compose a composite, proving
// closure all the way up.
//
// Run:  node examples/compose-coalition.mjs   (npm run compose-coalition)

import { V } from '../value.mjs';
import { Brick, ZERO, isZero, none, composeAnd, composePipe, composeTree } from '../compose.mjs';

// A certified cost certificate of a given class — exactly the fields compose.mjs reads (it
// duck-types Weave's WeaveCostCertificate, so box-and-box stays dependency-free).
const cert = (costClass, depth) => ({
  subject: { kind: 'weave-ir', hash: costClass.slice(0, 4) + depth },
  analyzer: { name: 'weave', version: '0.1.0' },
  verdict: { certified: true, total: true, oracleFree: true, costClass, ealDepth: depth },
  policy: { resourceDecision: costClass === 'poly' ? 'allow' : costClass === 'tower' ? 'escalate' : 'budget_check', reason: `static ${costClass}` }
});
const UNCERTIFIED = { verdict: { certified: false, costClass: 'unknown' }, policy: { resourceDecision: 'annihilate', reason: 'untypable — abstained' } };

// ── the three stack bricks. Phases are PULSE phases; the |> order must not run backward. ──
const retrieve = Brick({
  id: 'retrieve', holder: 'graphonomous',
  contract: { accepts_from: 'query', feeds_into: 'evidence' },
  value: V({ pi: 'retrieve', beta: 0.95, sigma: [] }),
  cost: cert('poly', 1), q: { confidence: 0.9, cost: 2, latency: 30 }, utility: 4
});
const certify = Brick({
  id: 'certify', holder: 'weave',
  contract: { accepts_from: 'evidence', feeds_into: 'certificate' },
  value: V({ pi: 'route', beta: 0.99, sigma: [] }),
  cost: cert('poly', 1), q: { confidence: 0.98, cost: 1, latency: 5 }, utility: 3
});
const govern = Brick({
  id: 'govern', holder: 'box-and-box',
  contract: { accepts_from: 'certificate', feeds_into: 'verdict' },
  value: V({ pi: 'act', beta: 0.97, sigma: [] }),
  cost: cert('poly', 1), q: { confidence: 0.95, cost: 1, latency: 8 }, utility: 5
});

const bar = (c = '─') => console.log(c.repeat(74));
const showBrick = (label, b) => {
  if (isZero(b)) { console.log(`  ${label}  →  0̲  (annihilated — the floor refused it)`); return; }
  const dec = b.cost.policy.resourceDecision, cc = b.cost.verdict.costClass;
  const hold = Array.isArray(b.holder) ? b.holder.join('+') : b.holder;
  console.log(`  ${label}`);
  console.log(`     id        ${b.id}`);
  console.log(`     holder    ${hold}`);
  console.log(`     contract  ${JSON.stringify(b.contract.accepts_from)} ▸ ${JSON.stringify(b.contract.feeds_into)}`);
  console.log(`     cost      ${cc}  [${dec}]`);
  console.log(`     quantity  confidence ${b.q.confidence.toFixed(3)}  ·  cost ${b.q.cost}  ·  latency ${b.q.latency}`);
  console.log(`     utility   ${b.utility}    laws ${b.laws.join(', ')}`);
};

bar('═');
console.log('  THE [&] STACK COMPOSES ITSELF  ·  three bricks, two operators, one floor');
bar('═');

// 1 — & : a parallel coalition of two memory providers (lattice merge, holder-tagged).
console.log('\n① &  combine — a parallel coalition of two retrieval providers:\n');
const memLocal = Brick({ id: 'mem_local', holder: 'sqlite', contract: { accepts_from: 'query', feeds_into: 'evidence' }, value: V({ pi: 'retrieve', beta: 0.9, sigma: [] }), cost: cert('poly', 1), q: { confidence: 0.85, cost: 1, latency: 3 }, utility: 2 });
const memRemote = Brick({ id: 'mem_remote', holder: 'pgvector', contract: { accepts_from: 'query', feeds_into: 'evidence' }, value: V({ pi: 'retrieve', beta: 0.8, sigma: [] }), cost: cert('poly', 1), q: { confidence: 0.92, cost: 4, latency: 40 }, utility: 3 });
const coalition = composeAnd(memLocal, memRemote);
showBrick('(mem_local & mem_remote)', coalition);
console.log('     → β=min (weakest link), confidence=×, cost=+, latency=max, holders unioned.');

// 2 — |> : the governed pipeline. retrieve ▸ certify ▸ govern, type- and phase-checked.
console.log('\n② |> pipeline — the certified, phase-graded hand-off:\n');
const pipeline = composeTree({ op: '|>', a: { op: '|>', a: retrieve, b: certify }, b: govern });
showBrick('(retrieve |> certify |> govern)', pipeline);
console.log('     → external contract is query ▸ verdict; every internal hand-off type-matched & forward-phased.');

// 3 — the FLOOR: three ways a composition collapses to 0̲, regardless of utility.
console.log('\n③ the shared floor — three refusals (0̲ absorbs; utility cannot resurrect):\n');

// (a) backward phase: govern (act) before retrieve (retrieve) is a π-violation.
showBrick('(a) govern |> retrieve   [backward phase]', composePipe(govern, retrieve));
// (b) type mismatch: retrieve feeds 'evidence', but govern accepts 'certificate'.
showBrick('(b) retrieve |> govern   [type mismatch]', composePipe(retrieve, govern));
// (c) uncertified child: a high-utility but untypable plan poisons the whole composite.
const tempting = Brick({ id: 'self_app', holder: 'rogue', contract: { accepts_from: 'evidence', feeds_into: 'certificate' }, value: V({ pi: 'route', beta: 0.99, sigma: [] }), cost: UNCERTIFIED, q: { confidence: 1, cost: 1, latency: 1 }, utility: 999 });
showBrick('(c) retrieve |> self_app  [uncertified, util 999]', composePipe(retrieve, tempting));

// 4 — closure: feed the coalition into the pipeline and re-compose. A composite is a brick.
console.log('\n④ closure — a composite re-composes (a brick of bricks is a brick):\n');
const tail = composeTree({ op: '|>', a: certify, b: govern });          // a sub-pipeline brick
const full = composeTree({ op: '|>', a: coalition, b: tail });          // coalition ▸ (certify ▸ govern)
showBrick('((mem_local & mem_remote) |> (certify |> govern))', full);
console.log(`     identity check: (coalition & &none) ≡ coalition  →  ${composeAnd(coalition, none()).id === '(' + coalition.id + ' & &none)' ? 'holds' : 'FAIL'}`);
console.log(`     0̲ absorbs:      (full |> 0̲) is 0̲              →  ${isZero(composePipe(full, ZERO)) ? 'holds' : 'FAIL'}`);

console.log('');
bar('═');
const ok = !isZero(pipeline) && !isZero(full)
  && isZero(composePipe(govern, retrieve)) && isZero(composePipe(retrieve, govern)) && isZero(composePipe(retrieve, tempting));
console.log(ok
  ? '  ✓ the stack composed itself: feasible ▸ certified ▸ governed survives; everything else is 0̲.'
  : '  ✗ composition invariant violated.');
bar('═');
process.exit(ok ? 0 : 1);
