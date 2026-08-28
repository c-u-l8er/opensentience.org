// examples/weave-resource-rung.mjs — Weave's static cost certificate, wired into the kernel floor.
//
// THE STACK THESIS, END TO END.  Weave (the [&] stack's resource rung) computes a *static cost
// certificate* for a program BEFORE it runs: a complexity rung (linear / polynomial / exponential /
// tower) derived from the term's type, no execution. box-and-box is the governance kernel whose
// bridge runs floor-then-gradient. This adapter is the seam between them: it turns each certificate
// into a kernel Value, lets the resource rung's affine ledger decide affordability, and lets the
// bridge ANNIHILATE (0̲) any program whose cost CLASS the budget refuses — regardless of how useful
// it looks. This is exactly the weave README's claim made executable:
//
//     "Wired into govern(), a computation that can't be certified to halt within budget becomes
//      0̄ — annihilated, not down-ranked — the same floor pattern the kernel uses for forbidden actions."
//
// Cost is a TYPE, not a measurement: the verdict is taken from the certificate's rung, never by
// running the program. The high-utility exponential program is refused *statically*.
//
// Usage:
//   node examples/weave-resource-rung.mjs                 # embedded demo (4 certified programs)
//   node examples/weave-resource-rung.mjs '<json>'        # govern a certificate bundle from stdin-arg
//
// Bundle shape (what the Weave Elixir surface emits after Weave.classify):
//   { "budget": { "maxRank": 1, "label": "polynomial" },
//     "options": [ { "id": "...", "rank": 1, "rung": "polynomial", "utility": 7, "price": 3 }, ... ] }

import { V } from '../value.mjs';
import { select } from '../bridge.mjs';
import { Ledger, feasible, spend, balance, INFEASIBLE } from '../resource.mjs';

const RUNG_NAME = ['constant', 'linear', 'polynomial', 'exponential', 'tower', 'tower', 'tower'];
const rungName = (r) => RUNG_NAME[r] ?? `tower(${r})`;

// ---- the certificate → kernel translation ----------------------------------
// A program is AFFORDABLE iff its certified rung ≤ the budget's maxRank. An over-budget program
// is not "expensive" — it is a different cost CLASS the budget cannot price, so it carries an
// unresolved σ conflict tag `cost:<rung>`. The bridge's floor (req.sigma_empty) then annihilates
// it: 0̲, never a finite-but-large score. Affordable programs additionally pay their price out of
// a closed token ledger, so conservation is visible.
export function governByCost(bundle) {
  const { budget, options } = bundle;
  const max = budget.maxRank;

  // a token ledger: the agent's budget account, fully funded for the affordable programs only.
  const fund = options.filter((o) => o.rank <= max).reduce((s, o) => s + (o.price ?? 0), 0);
  let ledger = Ledger({ bal: { agent: { tokens: fund } } });

  const kernelOptions = options.map((o) => {
    const overBudget = o.rank > max;
    const rung = o.rung ?? rungName(o.rank);
    // the affine gate from resource.mjs: an over-budget class is priced beyond any balance ⇒ 0̲.
    const price = overBudget ? Infinity : (o.price ?? 0);
    const canAfford = feasible(ledger, 'agent', { tokens: price });
    const sigma = overBudget || !canAfford ? [`cost:${rung}@rung${o.rank}`] : [];
    return {
      id: o.id,
      utility: o.utility,
      price: overBudget ? Infinity : price,
      rank: o.rank,
      rung,
      value: V({ pi: 'act', beta: 1, kappa: false, sigma })
    };
  });

  // the floor: any unresolved cost conflict (an unaffordable class) annihilates the option.
  const req = { sigma_empty: true };
  const cert = select(kernelOptions, req, 'tropical');

  // spend the chosen program's price — conservation: tokens move agent → sink, never vanish.
  const chosen = kernelOptions.find((o) => o.id === cert.decision);
  let spent = 0;
  if (chosen && Number.isFinite(chosen.price)) {
    const after = spend(ledger, 'agent', 'tokens', chosen.price);
    if (after !== INFEASIBLE) { ledger = after; spent = chosen.price; }
  }

  return {
    cert,
    budget,
    options: kernelOptions,
    ledger: { funded: fund, spent, remaining: balance(ledger, 'agent', 'tokens') }
  };
}

// ---- pretty printer ---------------------------------------------------------
function report(out) {
  const { cert, budget, options, ledger } = out;
  console.log('\nWeave cost certificate ▸ box-and-box resource rung ▸ floor-then-gradient');
  console.log('─'.repeat(74));
  console.log(`  budget: admit cost rung ≤ ${budget.maxRank} (${budget.label}); refuse everything higher.`);
  console.log('  certified programs (rung is STATIC — taken from the type, not measured):');
  options.forEach((o) =>
    console.log(`    ${o.id.padEnd(26)} util=${String(o.utility).padStart(3)}  ` +
      `rung=${o.rung.padEnd(11)}(rank ${o.rank})  price=${o.price === Infinity ? '∞' : o.price}`));

  console.log('\n  consume requirement: { σ empty }  — an unaffordable cost class is an unresolved σ conflict');
  console.log('  ' + '─'.repeat(72));
  console.log(`  ▸ verdict: ${cert.decision}` + (cert.margin != null ? `   (margin ${cert.margin} over runner-up)` : ''));
  console.log('  ranking (affordable, by utility):');
  cert.ranking.forEach((r) => console.log(`      ${String(r.score).padStart(6)}  ${r.id}`));
  if (cert.vetoed.length) {
    console.log('  annihilated by the floor (0̲):');
    cert.vetoed.forEach((v) =>
      console.log(`      ✗ ${v.id.padEnd(24)} (raw util ${v.rawWouldBe} → 0̲)  ${v.failures.map((f) => f.family + ':' + f.why).join('; ')}`));
  }
  console.log('\n  ledger (closed/conserved): funded ' + ledger.funded +
    ` tokens → spent ${ledger.spent} on the verdict → ${ledger.remaining} remain.`);
  console.log('\n  ' + cert.note);
  if (cert.floorBit)
    console.log('  ↑ the cost certificate, not the utility heuristic, decided this. Cost is a type.\n');
  else console.log('');
}

// ---- embedded demo: four programs the Weave surface can author --------------
// ranks are the ones `Weave.classify` actually reports for these exact terms (see
// weave/surface/weave_govern.exs, which produces these live and then EXECUTES the verdict —
// the cheap winner returns 210; the refused `blast` detonates with over-space when run):
//   sum_small = fold + [1..5]    → rank 1 (polynomial)
//   sum_big   = fold + [1..20]   → rank 1 (polynomial)   ← best affordable, runs to 210
//   pow       = c3 c2            → rank 2 (exponential)  ← refused
//   blast     = c2^5 tower       → rank 2 (exponential)  ← highest utility, refused; DETONATES
const DEMO = {
  budget: { maxRank: 1, label: 'polynomial' },
  options: [
    { id: 'sum_small (fold + [1..5])',  rank: 1, rung: 'polynomial', utility: 5, price: 2 },
    { id: 'sum_big   (fold + [1..20])', rank: 1, rung: 'polynomial', utility: 7, price: 3 },
    { id: 'pow       (c3 c2)',          rank: 2, rung: 'exponential', utility: 9, price: 4 },
    { id: 'blast     (c2^5 tower)',     rank: 2, rung: 'exponential', utility: 12, price: 6 }
  ]
};

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const arg = process.argv[2];
  const bundle = arg ? JSON.parse(arg) : DEMO;
  report(governByCost(bundle));
}

export default { governByCost };
