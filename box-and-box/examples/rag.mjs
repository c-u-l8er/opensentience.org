// examples/rag.mjs — the worked example from the Invariant Arithmetic page, executed.
// Two sources are combined, an answer is chained forward, then reused as its own context.
// No single family catches the resulting self-citation contradiction — combined, they do.
import { V, combine, chain, promote, reconcile, deliberate, consume, digest } from '../value.mjs';

const log = (label, v) => console.log(`  ${label.padEnd(34)} ${digest(v)}`);
console.log('\nRAG pipeline · invariant composition\n' + '─'.repeat(72));

// 1. two retrievals — the second is a weaker source and drags in a conflict tag
const s1 = V({ pi: 'retrieve', beta: 0.90, sigma: [], authority: ['src:transit-authority'], audit: ['retrieve#1'] });
const s2 = V({ pi: 'retrieve', beta: 0.70, sigma: ['conflict:opening-date'], authority: ['src:rumor-blog'], audit: ['retrieve#2'] });
log('source 1 (strong)', s1);
log('source 2 (weak, conflicting)', s2);

// 2. combine — β drops to the weakest (min), σ unions the conflict in
const ctx = combine(s1, s2);
log('combine → context', ctx);

// 3. generate the answer: chain forward retrieve → act  (allowed: retrieve ≤ act)
const answer = chain(ctx, V({ pi: 'act', audit: ['generate-answer'] }));
log('chain(ctx, act) → answer', answer);

// 4. reuse the answer as context for a follow-up that cites itself → κ flips true
const followup = combine(answer, V({ kappa: true, audit: ['reuse-answer-as-context'] }));
log('reuse as context → follow-up', followup);

// 5. consume the follow-up under real requirements — the substrate refuses, by family
const req = { beta_min: 0.85, sigma_empty: true, acyclic: true };
const verdict = consume(followup, req);
console.log('\n  consume(follow-up, {β≥0.85, σ empty, acyclic}):');
if (verdict.ok) console.log('    ✓ accepted');
else verdict.failures.forEach((f) => console.log(`    ✗ refused — ${f.family}: ${f.why}`));
console.log('\n  → No single invariant catches it: β alone allows a weak answer, σ alone');
console.log('    ignores the loop, κ alone ignores the stale date. Composed, the substrate');
console.log('    refuses at the right step and says which family and why.');

// 6. repair with the endomorphisms, then re-consume
console.log('\n' + '─'.repeat(72) + '\n  repair: deliberate (break cycle) · reconcile (resolve conflict) · promote (corroborate)');
let fixed = deliberate(followup);                          // κ → false
fixed = reconcile(fixed, ['conflict:opening-date']);       // σ \ {conflict}
fixed = promote(fixed, { beta: 0.88 });                    // β raised by a corroborating source
log('repaired value', fixed);
const v2 = consume(fixed, req);
console.log(v2.ok ? '    ✓ accepted after repair — the value is now feasible.' : '    ✗ still failing: ' + v2.failures.map((f) => f.why).join('; '));
console.log('');
