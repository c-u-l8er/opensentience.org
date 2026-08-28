#!/usr/bin/env node
/* check-escalation-claims.mjs — the permanent gate for Periodic Table cell #24.
 *
 *   node scripts/check-escalation-claims.mjs
 *
 * Three sections, and §2 is the one that exists because a correction was nearly lost.
 *
 * The cell used to say "outcome quality is non-decreasing in expectation". The round that
 * corrected it replaced that with an (η,δ)-domination certificate and described the swap as
 * making the original statement estimable. It is not a swap: expected-quality monotonicity and
 * near-pointwise domination are INDEPENDENT — each holds while the other fails — so a cell
 * carrying only one of them has silently changed what it promises. §2 exhibits both directions.
 */

let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`   ${ok ? '✓' : '✗ FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
  return ok;
};
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;

// ═══ §1 · monotone on EVERY family ⟺ pointwise domination ═══════════════════
// The structural half of the cell's refutation. Universal quantification over task families
// includes the singletons, so "non-decreasing in expectation on every family" collapses to
// pointwise domination — a PARTIAL order, which no global capability ranking can supply.
// Verified exhaustively rather than argued, because the argument is one line and one-line
// arguments are where sign errors live.
console.log('\n§1 · "monotone in expectation on every task family" ⟺ pointwise domination\n');
{
  const T = 3, V = 4;                       // 3 tasks, quality values 0…3
  const subsets = [];
  for (let m = 1; m < (1 << T); m++) subsets.push([...Array(T).keys()].filter((t) => m & (1 << t)));
  let checked = 0, mismatch = 0;
  const total = V ** T;
  for (let a = 0; a < total; a++) {
    const qL = [], x = [a % V, Math.floor(a / V) % V, Math.floor(a / (V * V)) % V];
    qL.push(...x);
    for (let b = 0; b < total; b++) {
      const qH = [b % V, Math.floor(b / V) % V, Math.floor(b / (V * V)) % V];
      const everyFamily = subsets.every((F) => mean(F.map((t) => qH[t])) >= mean(F.map((t) => qL[t])));
      const pointwise = qL.every((_, t) => qH[t] >= qL[t]);
      checked++;
      if (everyFamily !== pointwise) mismatch++;
    }
  }
  check(`the equivalence holds on all ${checked.toLocaleString()} (q_L, q_H) pairs`, mismatch === 0,
    `mismatches: ${mismatch}`);

  // and it is NOT equivalent to monotonicity on the whole set alone — the reason the cell's
  // original wording is weaker than it reads
  const qL = [0, 3, 0], qH = [3, 0, 0];
  check('monotone on the FULL set does not imply monotone on every family',
    mean(qH) >= mean(qL) && !subsets.every((F) => mean(F.map((t) => qH[t])) >= mean(F.map((t) => qL[t]))),
    'q_L=[0,3,0] q_H=[3,0,0]: equal means overall, strictly worse on task 2');
}

// ═══ §2 · expectation and tail domination are INDEPENDENT ═══════════════════
console.log('\n§2 · expected-quality monotonicity vs (η,δ)-tail domination — neither implies the other\n');
{
  const ETA = 0.01;
  const violationRate = (qL, qH) => qH.filter((v, t) => v < qL[t]).length / qH.length;

  // (a) expectation passes, tail certificate FAILS: H loses slightly on 10% and wins hugely on 90%
  const n = 100;
  const aL = Array.from({ length: n }, (_, t) => (t < 10 ? 50 : 10));
  const aH = Array.from({ length: n }, (_, t) => (t < 10 ? 49 : 90));
  check('(a) E[q_H − q_L] ≥ 0 while P[q_H < q_L] > η',
    mean(aH) - mean(aL) >= 0 && violationRate(aL, aH) > ETA,
    `ΔE = +${(mean(aH) - mean(aL)).toFixed(1)}, violation rate ${(100 * violationRate(aL, aH)).toFixed(0)}% > ${100 * ETA}%`);

  // (b) tail certificate passes, expectation FAILS: one catastrophic loss, 99 tiny wins
  const bL = Array.from({ length: n }, (_, t) => (t === 0 ? 100 : 0));
  const bH = Array.from({ length: n }, (_, t) => (t === 0 ? 0 : 1));
  check('(b) P[q_H < q_L] ≤ η while E[q_H − q_L] < 0',
    violationRate(bL, bH) <= ETA && mean(bH) - mean(bL) < 0,
    `violation rate ${(100 * violationRate(bL, bH)).toFixed(0)}% ≤ ${100 * ETA}%, ΔE = ${(mean(bH) - mean(bL)).toFixed(2)}`);

  check('⟹ cell #24 must carry BOTH certificates, not one relabelled as the other', true,
    'an escalation policy choosing between them is choosing a different promise');
}

// ═══ §3 · sample complexity of the (η,δ) certificate ════════════════════════
console.log('\n§3 · sample cost — zero violations in n tasks certify (η,δ) when (1−η)ⁿ ≤ δ\n');
{
  const nFor = (eta, delta) => Math.ceil(Math.log(delta) / Math.log(1 - eta));
  for (const [eta, delta, want] of [[0.01, 0.05, 299], [0.05, 0.05, 59], [0.01, 0.01, 459]]) {
    const n = nFor(eta, delta);
    check(`η=${eta}, δ=${delta} ⟹ n = ${n}`, n === want && Math.pow(1 - eta, n) <= delta,
      `(1−η)^n = ${Math.pow(1 - eta, n).toExponential(2)} ≤ ${delta}`);
    check(`  … and n−1 does NOT suffice (the bound is tight)`, Math.pow(1 - eta, n - 1) > delta,
      `(1−η)^(n−1) = ${Math.pow(1 - eta, n - 1).toExponential(2)}`);
  }
  check('the corrected cell is therefore NOT inert — ~300 tasks is a practical budget', nFor(0.01, 0.05) < 1000);

  // evaluator noise: the certificate is issued only if EVERY comparison is observed correctly
  const issued = (p, m, n) => {
    // probability a majority of m judges flips a single comparison, then none of n flips
    let flip = 0;
    for (let k = Math.floor(m / 2) + 1; k <= m; k++) {
      let c = 1;
      for (let x = 0; x < k; x++) c = (c * (m - x)) / (x + 1);
      flip += c * Math.pow(p, k) * Math.pow(1 - p, m - k);
    }
    return Math.pow(1 - flip, n);
  };
  const n300 = 299;
  check('a single judge at p=1% issues the certificate <10% of the time even when domination HOLDS',
    issued(0.01, 1, n300) < 0.10, `P[issued] = ${(100 * issued(0.01, 1, n300)).toFixed(1)}%`);
  check('9 judges at p=5% restore it to >95%', issued(0.05, 9, n300) > 0.95,
    `P[issued] = ${(100 * issued(0.05, 9, n300)).toFixed(1)}%`);
  check('⟹ the sample budget must declare (n, judges-per-task), or η must absorb the flip rate', true);
}

console.log(`\n${failures === 0 ? '✓' : '✗'} escalation claims: ${failures === 0 ? 'all checks hold' : failures + ' FAILED'}\n`);
process.exit(failures === 0 ? 0 : 1);
