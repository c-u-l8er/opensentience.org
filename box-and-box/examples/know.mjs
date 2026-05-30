// examples/know.mjs — knowledge as possible-worlds, the κ "known-unknown", learning as
// world-elimination, and the multi-agent gap between common and distributed knowledge.
import { atom, Model, knows, knowsItDoesntKnow, route, announce, everyone, common, distributed, holds } from '../epistemic.mjs';

const p = atom('p', (w) => w.p), q = atom('q', (w) => w.q);

console.log('\nEpistemic Arithmetic · knowing, not-knowing, and learning');

// 1. a known-unknown → deliberate, not act
const w1 = { p: true, q: true }, w2 = { p: false, q: true };
const before = Model({ worlds: [w1, w2], actual: w1, access: { a: () => [w1, w2] } });
console.log('\n1 · a detected gap routes to deliberation');
console.log(`  worlds considered possible: {p,q} and {¬p,q}`);
console.log(`  knows(p)?              ${knows(before, 'a', p)}   — p differs across the two worlds`);
console.log(`  knows(q)?              ${knows(before, 'a', q)}   — q holds in both`);
console.log(`  knows-it-doesn't-know(p)? ${knowsItDoesntKnow(before, 'a', p)}   — a *detected* unknown (the κ signal)`);
console.log(`  route on p → ${route(before, 'a', p)}     route on q → ${route(before, 'a', q)}`);

// 2. learning = eliminate the worlds the evidence rules out → knowledge grows
const after = announce(before, p); // learn that p is true
console.log('\n2 · learning eliminates the worlds the evidence rules out');
console.log(`  announce(p): worlds {¬p,q} drops out → only {p,q} remains`);
console.log(`  knows(p) after learning? ${knows(after, 'a', p)}   route on p → ${route(after, 'a', p)}`);
console.log(`  monotone: q was known before and is still known? ${knows(after, 'a', q)}`);

// 3. multi-agent: distributed knowledge exceeds anything either agent knows alone
const x1 = { p: true, q: true }, x2 = { p: true, q: false }, x3 = { p: false, q: true };
const m = Model({
  worlds: [x1, x2, x3], actual: x1,
  access: { a: (w) => (w.p ? [x1, x2] : [x3]), b: (w) => (w.q ? [x1, x3] : [x2]) } // a tracks p, b tracks q
});
const ags = ['a', 'b'];
console.log('\n3 · pooled knowledge beats individual knowledge');
console.log(`  agent a knows p? ${knows(m, 'a', p)}   agent a knows q? ${knows(m, 'a', q)}`);
console.log(`  agent b knows q? ${knows(m, 'b', q)}   agent b knows p? ${knows(m, 'b', p)}`);
console.log(`  everyone knows (p∧q)? ${everyone(m, ags, { t: 'and', a: p, b: q })}   — neither alone has both`);
console.log(`  distributed (p∧q)?    ${distributed(m, ags, { t: 'and', a: p, b: q })}   — together they pin it down`);
console.log('\n  β is graded belief; κ>0 is a known-unknown; learning shrinks the world-set.');
console.log('  Knowledge gates what an agent may act on; coordination needs common knowledge.\n');
