#!/usr/bin/env node
/* check-federation-invariants.mjs — the permanent gate for Periodic Table cell #36.
 *
 *   node scripts/check-federation-invariants.mjs --preflight   # pinned constructions only, ~2 s
 *   node scripts/check-federation-invariants.mjs               # + exhaustive corroboration, ~35 s
 *   node scripts/check-federation-invariants.mjs --full        # 3 sites, both domains
 *
 * WHY --preflight EXISTS. The round-4 audit environment could not finish the default run inside a
 * five-minute window, so a reviewer had to reproduce the high-leverage results by hand against the
 * kernel to establish that the artifact was intact. That is the right instinct and the wrong amount
 * of work. `--preflight` runs every PINNED CONSTRUCTION — the falsifiers, the exact decision, the
 * bound, the instance model, the locality theorems, the separator counterexample — and skips only
 * the exhaustive enumerations, which are corroboration and not the load-bearing evidence.
 *
 * IT SAYS WHAT IT SKIPPED. A preflight that silently omits sections reads as a full run, and the
 * whole subject of this file is evidence that reports more than it establishes. Every skipped block
 * prints a SKIPPED line naming what did not execute.
 *
 * Exits non-zero the moment any registered result stops reproducing. Every section
 * corresponds to a claim in `CLAIM_LEDGER.json`; the ledger's `witnesses` field names
 * this file and the section, and `scripts/check-claim-ledger.mjs` fails if a claim
 * points at a section that does not exist.
 *
 * WHAT THIS FILE IS FOR. The previous round's evidence for cell #36 was a 240k-trial
 * random sweep that found zero counterexamples to a lemma that is FALSE. The sweep was
 * not underpowered — it was measuring a theorem, because every domain it sampled used
 * the same value-symmetric language. A regression suite made of samples from one
 * language would make the same mistake again, so the falsifiers below are pinned
 * CONSTRUCTIONS, not draws.
 */
import * as K from './federation-kernel.mjs';

const FULL = process.argv.includes('--full');
const PREFLIGHT = process.argv.includes('--preflight');
const c = (rel, vars, site) => ({ rel, vars, site });
let failures = 0, skipped = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`   ${ok ? '✓' : '✗ FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
  return ok;
};
/** Run an exhaustive block, or name it as skipped. Never silently omit. */
const exhaustive = (what, fn) => {
  if (PREFLIGHT) { skipped++; console.log(`   ⊘ SKIPPED (--preflight)  ${what}`); return; }
  fn();
};
const t0 = Date.now();
if (PREFLIGHT) console.log('\n── --preflight: pinned constructions only. Exhaustive corroboration is skipped and named. ──');

// ═══ §1 · the universal form of #36 is false ════════════════════════════════
// Unchanged from the first round and unaffected by everything after it.
console.log('\n§1 · #36 universal form — three sites, pairwise consistent, |D|=2\n');
{
  const F = [c('neq', ['x', 'y'], 0), c('neq', ['y', 'z'], 1), c('neq', ['z', 'x'], 2)];
  check('every site locally satisfiable', K.allSitesSat(F, 2, K.EQ_NEQ));
  check('federated union unsatisfiable', !K.satisfiable(F, 2, K.EQ_NEQ));
  check('FIDELITY fails ⟹ universal claim is FALSE', !K.fidelity(F, 2, K.EQ_NEQ));
}

// ═══ §2 · G1 — the Q1 falsifiers, as permanent constructions ════════════════
// Fable 5, 2026-08-23. "No split cycle ⟹ fidelity" is false for general finite
// languages. CE-A kills it on a TREE, where there is no cycle to split at all.
console.log('\n§2 · Q1 falsifiers — "no split cycle ⟹ fidelity" is FALSE for general Γ\n');
{
  const PIN0 = K.rel(2, [[0, 0], [0, 1]]);                       // "v = 0"
  const PIN1 = K.rel(2, [[1, 0], [1, 1]]);                       // "v = 1"
  const OR = K.rel(2, [[0, 1], [1, 0], [1, 1]]);
  const NAND = K.rel(2, [[0, 0], [0, 1], [1, 0]]);
  const S0 = K.rel(2, [[0, 0], [1, 2], [2, 1]]);                 // x+y ≡ 0 (mod 3)
  const S1 = K.rel(2, [[0, 1], [1, 0], [2, 2]]);                 // x+y ≡ 1 (mod 3)

  const falsifier = (name, lang, D, F, note) => {
    const noSplit = K.noSplitCycle(F), sat = K.allSitesSat(F, D, lang);
    const union = K.satisfiable(F, D, lang);
    const ok = noSplit && sat && !union;
    check(name, ok, `${note} · κ_split=${K.kappaSplit(F)} b₁=${K.b1(F)} sites-sat=${sat} union-sat=${union}`);
  };

  falsifier('CE-A  tree carrier, no cycle whatsoever', { p0: PIN0, p1: PIN1 }, 2,
    [c('p0', ['v', 'a'], 0), c('p1', ['v', 'b'], 1)],
    'the carrier is the path a–v–b');

  falsifier('CE-B  |D|=2, every relation has full projections', { or: OR, nand: NAND }, 2,
    [c('nand', ['x', 'y'], 0), c('nand', ['x', 'z'], 0), c('or', ['y', 'z'], 0),
     c('or', ['x', 'u'], 1), c('or', ['x', 'w'], 1), c('nand', ['u', 'w'], 1)],
    'two monochromatic triangles sharing one cut vertex');

  falsifier('CE-C  |D|=3, full projections (Z₃ sums)', { s0: S0, s1: S1 }, 3,
    [c('s0', ['x', 'y'], 0), c('s0', ['y', 'z'], 0), c('s0', ['z', 'x'], 0),
     c('s1', ['x', 'u'], 1), c('s1', ['u', 'w'], 1), c('s1', ['w', 'x'], 1)],
    'same shape at |D|=3');

  // CE-D — the obstruction is invisible to κ as cell #01 defines it (directed, SCC-based)
  const D4 = [c('neq', ['a', 'b'], 0), c('neq', ['b', 'd'], 0), c('eq', ['a', 'c'], 1), c('neq', ['c', 'd'], 1)];
  check('CE-D  fidelity fails on a carrier whose every orientation is a DAG',
    !K.fidelity(D4, 2, K.EQ_NEQ) && K.kappaSplit(D4) > 0,
    `κ_split=${K.kappaSplit(D4)}; oriented a→b,a→c,b→d,c→d has all SCCs trivial ⟹ directed κ=0`);
}

// ═══ §3 · G3 — κ_split, and why plain b₁ is the wrong repair ════════════════
console.log('\n§3 · κ_split — the site-aware carrier (NOT ordinary cycle rank b₁)\n');
{
  // The separating witness. Fable's proposed patch B3 was "replace κ with b₁".
  //
  // NON-VACUOUS BY CONSTRUCTION. This used an all-≠ triangle at |D|=2, which is locally
  // UNSATISFIABLE — so "fidelity holds" was true only because the antecedent was false, and a
  // reader could not tell the witness apart from the vacuous case. That is precisely the defect
  // that made round 1's necessity result meaningless, reappearing as presentation. An all-`eq`
  // triangle is satisfiable both locally and globally, so the control bites.
  const oneSite = [c('eq', ['a', 'b'], 0), c('eq', ['b', 'g'], 0), c('eq', ['g', 'a'], 0)];
  check('one-site eq-triangle: b₁ = 1 but κ_split = 0',
    K.b1(oneSite) === 1 && K.kappaSplit(oneSite) === 0,
    'plain b₁ reports an obstruction the federation theorem says is not there');
  check('  … and it is satisfiable BOTH locally and globally — the control is not vacuous',
    K.allSitesSat(oneSite, 2, K.EQ_NEQ) && K.satisfiable(oneSite, 2, K.EQ_NEQ)
    && K.fidelity(oneSite, 2, K.EQ_NEQ));
  const oneSite3 = [c('neq', ['a', 'b'], 0), c('neq', ['b', 'g'], 0), c('neq', ['g', 'a'], 0)];
  check('one-site ≠-triangle at |D|=3: b₁ = 1, κ_split = 0, and genuinely satisfiable',
    K.b1(oneSite3) === 1 && K.kappaSplit(oneSite3) === 0
    && K.allSitesSat(oneSite3, 3, K.EQ_NEQ) && K.satisfiable(oneSite3, 3, K.EQ_NEQ),
    'the same separation at a domain size where all-≠ is colourable');

  const twoSite = [c('eq', ['a', 'b'], 0), c('eq', ['b', 'g'], 0), c('eq', ['g', 'a'], 1)];
  check('same topology, split across two sites: b₁ = 1 AND κ_split = 1',
    K.b1(twoSite) === 1 && K.kappaSplit(twoSite) === 1,
    'b₁ cannot tell these two federations apart; κ_split can');
  check('  … and κ_split > 0 does NOT mean fidelity fails — it means the theorem does not apply',
    K.fidelity(twoSite, 2, K.EQ_NEQ),
    'sufficiency is one-directional; a split eq-cycle is perfectly satisfiable');

  // T-KS1 — the zero-set theorem, against brute-force cycle enumeration
  const space = enumerateFederations(FULL ? 3 : 2);
  let mismatch = 0;
  for (const F of space) if ((K.kappaSplit(F) === 0) !== !K.hasSplitCycleBruteForce(F)) mismatch++;
  check(`T-KS1  κ_split = 0 ⟺ no split cycle, over ${space.length.toLocaleString()} federations`,
    mismatch === 0, `mismatches: ${mismatch}`);

  let b1Wrong = 0;
  for (const F of space) if ((K.b1(F) === 0) !== (K.kappaSplit(F) === 0)) b1Wrong++;
  check(`T-KS2  b₁ = 0 disagrees with κ_split = 0 on ${b1Wrong.toLocaleString()} of them`,
    b1Wrong > 0, 'a non-zero count is the point: b₁ is a strictly different invariant');
}

// ═══ §4 · G2 — Theorem Q1* and the Q1** characterization ════════════════════
console.log('\n§4 · Theorem Q1* (sufficiency under 1PA) and Q1** (characterization)\n');
{
  // Lemma 3: value symmetry certifies 1PA. eq/neq is Sym(D)-invariant at every |D|.
  for (const D of [2, 3, 4]) {
    const cert = K.symmetryCertificate(K.EQ_NEQ, D);
    check(`Lemma 3  eq/neq at |D|=${D}: a transitive group preserves Γ ⟹ 1PA`,
      cert.certifies1PA, `${cert.preserving} preserving permutations, transitive=${cert.transitive}`);
  }

  // Q1* — sufficiency, exhaustive over the enumerated space at both domains
  exhaustive('Q1* sufficiency over the full eq/neq enumeration at |D| = 2 and 3', () => {
    for (const D of [2, 3]) {
      const space = enumerateFederations(FULL ? 3 : 2);
      let violations = 0, bit = 0;
      for (const F of space) {
        if (!K.noSplitCycle(F)) continue;
        bit++;
        if (!K.fidelity(F, D, K.EQ_NEQ)) violations++;
      }
      check(`Q1*  |D|=${D}: no split cycle ⟹ fidelity, on ${bit.toLocaleString()} no-split federations`,
        violations === 0, `violations: ${violations}`);
    }
  });

  // Q1** (⟹ direction) — EXECUTABLE. If Γ fails 1PA, the two witness instances
  // become two sites sharing one cut vertex: no split cycle, both satisfiable,
  // union unsatisfiable. This is the construction, run on a language that fails 1PA.
  const ORNAND = { or: K.rel(2, [[0, 1], [1, 0], [1, 1]]), nand: K.rel(2, [[0, 0], [0, 1], [1, 0]]) };
  const v = K.find1PAViolation(ORNAND, 2, { maxCon: 3, maxAux: 2 });
  if (check('Q1**  a 1PA violation is FOUND for {OR, NAND} at |D|=2', v !== null,
    v ? `projections {${v.projA}} and {${v.projB}} are disjoint at the shared variable` : 'none found')) {
    const F = v.federation;
    check('Q1**  the constructed federation has no split cycle', K.noSplitCycle(F),
      `κ_split=${K.kappaSplit(F)}`);
    check('Q1**  both sites satisfiable', K.allSitesSat(F, 2, ORNAND));
    check('Q1**  union UNSATISFIABLE ⟹ sufficiency fails whenever 1PA fails',
      !K.satisfiable(F, 2, ORNAND));
  }

  // and the control: eq/neq admits no such violation at the same bound
  check('Q1**  control — no 1PA violation found for eq/neq at |D|=2 (bounded search)',
    K.find1PAViolation(K.EQ_NEQ, 2, { maxCon: 3, maxAux: 2 }) === null,
    'a MISS is bounded evidence only; the PROOF for eq/neq is Lemma 3 above');

  // ── the common-intersection (Helly) form, and the pin correction ──────────
  // ROUND 2 SAID: "if any relation can pin a variable to a value, 1PA fails outright."
  // That is FALSE, and it is the sentence the practical FGAP question was built on.
  const PIN0 = { pin0: K.pred(1, ([a]) => a === 0), free: K.pred(2, () => true) };
  const ci0 = K.commonIntersection(PIN0, 2);
  check('a language whose ONLY pin is x=0 over |D|=2 still HAS 1PA',
    ci0.pairwiseIntersecting && ci0.commonElements.length > 0,
    `projections {${ci0.family.map((f) => '{' + f + '}').join(', ')}} — common element(s) {${ci0.commonElements}}`);
  check('  … and no 1PA violation is found for it', K.find1PAViolation(PIN0, 2) === null,
    'pinning is not the failure condition; TWO DISJOINT projections are');

  const PIN01 = { pin0: K.pred(1, ([a]) => a === 0), pin1: K.pred(1, ([a]) => a === 1) };
  const ci01 = K.commonIntersection(PIN01, 2);
  check('a language that pins BOTH 0 and 1 fails 1PA',
    !ci01.pairwiseIntersecting && ci01.commonElements.length === 0,
    `projections {${ci01.family.map((f) => '{' + f + '}').join(', ')}} — no common element`);

  // LEMMA (common intersection): 1PA ⟺ ⋂ U_Γ ≠ ∅. Corroborated over several languages.
  const LANGS = [
    ['eq/neq |D|=2', K.EQ_NEQ, 2], ['eq/neq |D|=3', K.EQ_NEQ, 3],
    ['pin-0 only |D|=2', PIN0, 2], ['pin-0 and pin-1 |D|=2', PIN01, 2],
    ['OR/NAND |D|=2', { or: K.rel(2, [[0, 1], [1, 0], [1, 1]]), nand: K.rel(2, [[0, 0], [0, 1], [1, 0]]) }, 2],
    ['≤-order |D|=3', { le: K.pred(2, ([a, b]) => a <= b) }, 3],
  ];
  let helly = 0, closure = 0;
  for (const [label, lang, D] of LANGS) {
    const ci = K.commonIntersection(lang, D);
    if (ci.pairwiseIntersecting !== (ci.commonElements.length > 0)) helly++;
    if (ci.pairwiseIntersecting && !ci.closedUnderIntersection) closure++;
    console.log(`      ${label.padEnd(22)} pairwise=${String(ci.pairwiseIntersecting).padEnd(5)} ⋂=${ci.commonElements.length ? '{' + ci.commonElements + '}' : '∅'}  U_Γ={${ci.family.map((f) => '{' + f + '}').join(',')}}`);
  }
  check('LEMMA  pairwise-intersecting ⟺ a COMMON element exists, on every language above',
    helly === 0, `mismatches: ${helly}`);
  check('LEMMA  and under 1PA the family is closed under non-empty intersection',
    closure === 0, 'the step that makes the finite-domain argument go through');
}

// ═══ §4b · the EXACT decision — the core, and what the bounded search was hiding ═════════════
//
// Round 3. Everything in §4 above is either a sufficient certificate (value symmetry) or a
// falsifier (bounded search) or a bounded corroboration (the projection family). None of them
// DECIDES. This does:
//
//     Γ has 1PA  ⟺  Aut(core(D; Γ)) acts transitively on the core.
//
// Two consequences make the previous section's honesty about bounds load-bearing rather than
// decorative, and both are checked here rather than asserted:
//
//   (a) the bounded search MISSES. Successor on a 6-path fails 1PA and `find1PAViolation` reports
//       null at its default bounds, because the witness needs three auxiliary variables. Any
//       reading of a MISS as evidence would have called that language safe.
//   (b) the symmetry certificate is NOT NECESSARY. ≠ pulled back along a retraction has an
//       intransitive automorphism group and a transitive CORE, so 1PA holds and Lemma 3 cannot
//       see it. Value symmetry is strictly stronger than the real condition.
//
// The name is the third thing that changed. "1-point amalgamation" collides with the Fraïssé
// notion and is retired as a public name; the common-intersection "Helly" form turns out to be a
// triviality about pp-closure rather than a property of Γ, so it is a corollary and not the
// prior-art key. Say "the constraint template has a transitive core". Novelty is NOT claimed —
// the ingredients are standard finite-CSP algebra and no exact prior-art search has been done.
console.log('\n§4b · the exact decision: transitive core (and the two things it corrects)\n');
{
  const R2 = (D, f) => K.pred(2, f);
  const NEQF = { R: K.rel(2, [[0, 1], [1, 0], [2, 1], [1, 2]]) };          // ≠ ∘ (2 ↦ 0)
  const SUCC6 = { S: K.rel(2, [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]]) }; // successor on a 6-path
  const TABLE = [
    ['eq/neq |D|=2', K.EQ_NEQ, 2], ['eq/neq |D|=3', K.EQ_NEQ, 3],
    ['pin-0 only |D|=2', { pin0: K.pred(1, ([a]) => a === 0), free: K.pred(2, () => true) }, 2],
    ['pin-0 and pin-1 |D|=2', { pin0: K.pred(1, ([a]) => a === 0), pin1: K.pred(1, ([a]) => a === 1) }, 2],
    ['OR/NAND |D|=2', { or: K.rel(2, [[0, 1], [1, 0], [1, 1]]), nand: K.rel(2, [[0, 0], [0, 1], [1, 0]]) }, 2],
    ['≤ |D|=3', { le: R2(3, ([a, b]) => a <= b) }, 3],
    ['< |D|=3', { lt: R2(3, ([a, b]) => a < b) }, 3],
    ['≠∘f |D|=3', NEQF, 3],
    ['successor 6-path |D|=6', SUCC6, 6],
  ];

  let symUnsound = 0, hitUnsound = 0, badRetraction = 0, badRefutation = 0, hullBroken = 0;
  for (const [label, lang, D] of TABLE) {
    const d = K.decide1PA(lang, D);
    const sym = K.symmetryCertificate(lang, D);
    const hit = K.find1PAViolation(lang, D);

    // the retraction must BE one. Repeated squaring — the obvious construction — is not
    // guaranteed to reach an idempotent (a 3-cycle never does), so this is checked, not assumed.
    const r = d.retraction;
    if (!(r.every((_, i) => r[r[i]] === r[i]) && d.core.every((b) => r[b] === b) && K.preservesAll(r, lang, D))) badRetraction++;

    if (sym.certifies1PA && !d.holds) symUnsound++;              // a PROOF of 1PA must never be wrong
    if (hit && d.holds) hitUnsound++;                            // a HIT is a PROOF of ¬1PA

    if (d.holds) {
      // ⋂U_Γ = End(A)·b: every realized bounded projection must contain the hull
      const fam = [...K.unaryProjectionFamily(lang, D).keys()].map((k) => k.split(',').map(Number));
      if (!fam.every((S) => d.hull.every((v) => S.includes(v)))) hullBroken++;
    } else {
      // and when it fails, the canonical-query federation is an EXECUTABLE refutation
      const ref = K.refute1PA(lang, D);
      const s0 = ref.federation.filter((x) => x.site === 0), s1 = ref.federation.filter((x) => x.site === 1);
      const shared = [...new Set(s0.flatMap((x) => x.vars))].filter((v) => s1.some((x) => x.vars.includes(v)));
      if (!(K.satisfiable(s0, D, lang) && K.satisfiable(s1, D, lang) && shared.length === 1
        && K.kappaSplitBerge(ref.federation) === 0 && !K.satisfiable(ref.federation, D, lang))) badRefutation++;
    }
    console.log(`      ${label.padEnd(24)} core={${d.core}}  orbits=${JSON.stringify(d.coreOrbits).padEnd(16)} 1PA=${String(d.holds).padEnd(5)} sym=${String(sym.certifies1PA).padEnd(5)} boundedHit=${String(!!hit).padEnd(5)} ⋂U_Γ=${d.hull.length ? '{' + d.hull + '}' : '∅'}`);
  }
  check('the returned retraction IS a retraction — idempotent, identity on the core, an endomorphism',
    badRetraction === 0, 'repeated squaring does not give this; p⁻¹∘f does');
  check('value symmetry never certifies a language the exact procedure refutes (Lemma 3 is sound)',
    symUnsound === 0);
  check('a bounded-search HIT is never a false alarm (a hit exhibits its witness)', hitUnsound === 0);
  check('where 1PA holds, every bounded projection contains ⋂U_Γ = End(A)·b (the hull formula)',
    hullBroken === 0);
  check('where 1PA fails, the canonical-query federation RUNS as a refutation',
    badRefutation === 0, 'both sites satisfiable, one shared variable, κ_splitBerge=0, union unsatisfiable');

  // (a) the bounded search misses — the regression that demotes a MISS for good
  const missed = K.find1PAViolation(SUCC6, 6);
  const exact = K.decide1PA(SUCC6, 6);
  check('REGRESSION  successor-on-a-6-path: the bounded search reports NO violation…',
    missed === null, 'default bounds maxCon 3, maxAux 2');
  check('REGRESSION  …and 1PA genuinely FAILS there — so a MISS is not evidence',
    exact.holds === false, `core={${exact.core}} has ${exact.coreOrbits.length} orbits`);
  check('REGRESSION  the witness exists at maxAux 3, which is why the bound was the whole story',
    K.find1PAViolation(SUCC6, 6, { maxCon: 3, maxAux: 3 }) !== null);

  // (b) symmetry is sufficient, not necessary
  const dn = K.decide1PA(NEQF, 3);
  check('REGRESSION  ≠∘f: value symmetry FAILS to certify…', !K.symmetryCertificate(NEQF, 3).certifies1PA);
  check('REGRESSION  …while 1PA HOLDS — the core {0,1} is transitive even though Aut(D;Γ) is not',
    dn.holds && dn.core.length === 2, `core={${dn.core}} orbits=${JSON.stringify(dn.coreOrbits)}`);

  // ── the witness-size bound ────────────────────────────────────────────────
  //
  // Round 3 closed asking, as an open frontier question, whether any finite bound exists on the
  // size of a minimal refutation — because the 56-constraint witness that defeated its exhaustive
  // space had no explanation. GPT-5.6's round-4 audit answered it from the construction round 3
  // had ALREADY SHIPPED and nobody had measured: each canonical conjunctive query emits one atom
  // per tuple of each relation, so
  //
  //     constraints = 2 · Σ_{R ∈ Γ} |R^A|          variables ≤ 2|D| − 1
  //
  // and for {≠∘f, NAE₃} over |D| = 3 that is 2(4 + 24) = 56 exactly. The open question was a
  // question about our own code.
  //
  // TWO THINGS IT IS NOT. It bounds the CANONICAL construction, so as a bound on the MINIMUM it is
  // an upper one and can be loose — pin-0/pin-1 needs 2 constraints where the canonical query uses
  // 4. And it bounds a witness to the ANTECEDENT FAILING, not a counterexample to the theorem:
  // under a discharged antecedent there is nothing to find, and enumeration is corroboration
  // rather than a substitute for the proof.
  {
    let mismatches = 0;
    const rows = [];
    for (const [label, lang, D] of TABLE) {
      const d = K.decide1PA(lang, D);
      if (d.holds) continue;
      const sigma = Object.values(lang).reduce((s, r) => s + K.tuplesOf(r, D).length, 0);
      const ref = K.refute1PA(lang, D);
      const cons = ref.federation.length;
      const vars = new Set(ref.federation.flatMap((x) => x.vars)).size;
      if (cons !== 2 * sigma || vars > 2 * D - 1) mismatches++;
      rows.push(`${label.padEnd(24)} Σ|R^A|=${String(sigma).padStart(3)}  2Σ=${String(2 * sigma).padStart(3)} = constraints ${String(cons).padStart(3)}  vars ${vars} ≤ ${2 * D - 1}`);
    }
    rows.forEach((r) => console.log('      ' + r));
    check('BOUND  the canonical refutation has EXACTLY 2·Σ|R^A| constraints over ≤ 2|D|−1 variables',
      mismatches === 0, `checked on every language above whose core is intransitive; ${mismatches} mismatches`);
    const naeBad = { R: K.rel(2, [[0, 1], [1, 0], [2, 1], [1, 2]]), nae: K.pred(3, ([a, b, d2]) => !(a === b && b === d2)) };
    const sig = Object.values(naeBad).reduce((s, r) => s + K.tuplesOf(r, 3).length, 0);
    check('BOUND  …and it explains the 56 that defeated round 3\'s exhaustive space: |≠∘f| = 4, |NAE₃| = 27−3 = 24, 2(4+24) = 56',
      sig === 28 && K.refute1PA(naeBad, 3).federation.length === 56,
      'the open question "does a bound exist" was a question about our own construction');

    // ── AN UPPER BOUND ON THE MINIMUM BOUNDS NOTHING FROM BELOW ─────────────
    //
    // R3.1 took the bound above and wrote: "the minimum witness size grows with Σ|R^A|, so for any
    // fixed search bound there is a language whose violation exceeds it." THAT IS FALSE, and it is
    // the same shape of error this file exists to catch — a quantifier/polarity slip, one claim
    // citing another for a direction it does not establish. 2·Σ|R^A| is what the CANONICAL
    // construction costs; the MINIMUM can be far below it and can stay there while Σ|R^A| explodes.
    //
    // The family that shows it (GPT-5.6, round-5 audit): pins p₀ and p₁ over |D| = 2, whose
    // two-constraint refutation p₀(x) | p₁(x) is immediate — plus an IRRELEVANT full k-ary relation,
    // which every map preserves, so it changes neither End(A) nor the core, and contributes 2^k to
    // Σ|R^A| while the two-constraint witness sits there untouched.
    //
    // The no-fixed-bound proposition is probably true. It is not proved here, and proving it needs
    // exactly what FED-1PA-NO-FIXED-BOUND asks for: a family whose MINIMUM diverges.
    {
      const rows = [];
      let bad2 = 0;
      const p0 = K.pred(1, ([a]) => a === 0), p1 = K.pred(1, ([a]) => a === 1);
      for (const k of [1, 4, 8]) {
        const lang = { p0, p1, full: K.pred(k, () => true) };
        const sigma = Object.values(lang).reduce((s, r) => s + K.tuplesOf(r, 2).length, 0);
        const canon = K.refute1PA(lang, 2).federation.length;
        const W = [c('p0', ['x'], 0), c('p1', ['x'], 1)];             // the minimum, independent of k
        const holds = K.decide1PA(lang, 2).holds;
        const witnessOk = K.allSitesSat(W, 2, lang) && !K.satisfiable(W, 2, lang) && K.kappaSplitBerge(W) === 0;
        if (holds || !witnessOk || canon !== 2 * sigma) bad2++;
        rows.push(`k=${String(k).padEnd(2)} Σ|R^A| = ${String(sigma).padStart(3)}   canonical ${String(canon).padStart(3)}   MINIMUM 2   core intransitive ${!holds}`);
      }
      rows.forEach((r) => console.log('      ' + r));
      check('BOUND  REGRESSION  Σ|R^A| grows as 2^k while a TWO-constraint refutation survives',
        bad2 === 0, 'so "the minimum grows with Σ|R^A|" — asserted in R3.1 — is FALSE');
      check('BOUND  ⟹ FED-WITNESS-BOUND may not be cited for a LOWER bound; FED-1PA-NO-FIXED-BOUND stays OPEN',
        true, 'the ledger now carries bound polarity and the checker refuses the citation direction that caused this');
    }
  }
}

// ═══ §5 · G4 — n-ary carrier: Berge, not α/β/γ ══════════════════════════════
console.log('\n§5 · n-ary constraints — the carrier is Berge-acyclicity\n');
{
  // The separator: H = {a,b,c},{a,b}. α-, β- and γ-acyclic; Berge-CYCLIC; fidelity fails.
  const EQ3 = { eq3: K.pred(3, ([a, b]) => a === b), neq: K.pred(2, ([a, b]) => a !== b) };
  const F = [c('eq3', ['a', 'b', 'q'], 0), c('neq', ['a', 'b'], 1)];
  check('α-acyclic (GYO reduces it)', K.alphaAcyclic(F));
  check('β-acyclic (every sub-hypergraph α-acyclic)', K.betaAcyclic(F));
  check('Berge-CYCLIC (two hyperedges share ≥ 2 variables)', !K.noSplitBergeCycle(F),
    `κ_splitBerge=${K.kappaSplitBerge(F)}`);
  check('both sites satisfiable, union NOT ⟹ α/β/γ are the wrong notions',
    K.allSitesSat(F, 3, EQ3) && !K.satisfiable(F, 3, EQ3));

  // super-blocks: the object Theorem Q3's induction runs on
  const sb = K.superBlocks(F);
  check('super-block merge puts both constraints in one group',
    sb.length === 1 && sb[0].length === 2, `groups: ${JSON.stringify(sb)}`);

  // ── Q3 corroboration: EXHAUSTIVE, not sampled ─────────────────────────────
  //
  // This block used to draw 20,000 random n-ary federations over one Sym(3)-invariant language.
  // That is the round-1 mistake with a different arity: volume along the axes you thought of.
  // Round 3 replaced it with complete enumeration of small spaces over FOUR languages chosen to
  // vary the axis that actually matters — one Sym(3)-invariant, one with a genuine unary relation
  // and a singleton core, one with a transitive core but NO value symmetry, and a control with no
  // transitive core at all, which must and does break the theorem.
  //
  // Three independent implementations disagree with each other or nothing is learned, so each
  // federation is checked three ways: the kernel's κ_splitBerge against a brute-force cycle
  // enumeration of I(H); the kernel's super-blocks against a subset-enumeration of hypergraph
  // vertex-articulation blocks; and the theorem itself against a full satisfiability solve.
  {
    const P = (ar, f) => K.pred(ar, f);
    const V4 = ['a', 'b', 'd', 'e'];
    const SYMMETRIC = { eq: 1, neq: 1, nae: 1, eq3: 1, leq: 0, u0: 1, R: 1, or: 1, nand: 1, ab3: 0 };

    // brute force #1 — some simple cycle of the incidence graph carries two sites
    const hasSplitBergeBrute = (cs) => {
      const E = [];
      cs.forEach((x, i) => { for (const v of new Set(x.vars)) E.push({ u: `c${i}`, v: `v:${v}`, con: i }); });
      const adj = new Map();
      E.forEach((e, id) => { for (const [a, b] of [[e.u, e.v], [e.v, e.u]]) { if (!adj.has(a)) adj.set(a, []); adj.get(a).push([b, id]); } });
      let found = false;
      for (const start of adj.keys()) {
        if (found) break;
        const dfs = (u, used, onPath, cons) => {
          if (found) return;
          for (const [v, id] of adj.get(u)) {
            if (used.has(id)) continue;
            if (v === start) { if (used.size >= 3 && new Set([...cons].map((i) => cs[i].site)).size > 1) { found = true; return; } continue; }
            if (onPath.has(v)) continue;
            used.add(id); onPath.add(v);
            const cn = E[id].con, added = !cons.has(cn); if (added) cons.add(cn);
            dfs(v, used, onPath, cons);
            used.delete(id); onPath.delete(v); if (added) cons.delete(cn);
          }
        };
        dfs(start, new Set(), new Set([start]), new Set(start.startsWith('c') ? [Number(start.slice(1))] : []));
      }
      return found;
    };
    // brute force #2 — maximal connected constraint sets with no articulation VARIABLE
    const hyperBlocks = (cs) => {
      const n = cs.length; if (!n) return [];
      const connected = (S, drop) => {
        const arr = [...S]; if (!arr.length) return true;
        const seen = new Set([arr[0]]), q = [arr[0]];
        while (q.length) { const i = q.shift(); for (const j of arr) if (!seen.has(j) && cs[i].vars.some((v) => v !== drop && cs[j].vars.includes(v))) { seen.add(j); q.push(j); } }
        return seen.size === arr.length;
      };
      const noCut = (S) => connected(S, null) && [...new Set([...S].flatMap((i) => cs[i].vars))].every((v) => connected(S, v));
      const good = [];
      for (let m = 1; m < (1 << n); m++) { const S = new Set([...Array(n).keys()].filter((i) => m & (1 << i))); if (noCut(S)) good.push(S); }
      return good.filter((S) => !good.some((T) => T.size > S.size && [...S].every((i) => T.has(i)))).map((S) => [...S].sort((a, b) => a - b));
    };
    const groupKey = (G) => G.map((g) => [...g].sort((a, b) => a - b).join(',')).sort().join('|');

    const poolOf = (lang) => {
      const out = [];
      for (const [name, r] of Object.entries(lang)) {
        const scopes = [];
        const rec = (cur) => { if (cur.length === r.arity) { scopes.push([...cur]); return; } for (const v of V4) if (!cur.includes(v)) rec([...cur, v]); };
        rec([]);
        const keep = SYMMETRIC[name] ? scopes.filter((s) => s.every((v, i) => i === 0 || v > s[i - 1]))
          : (r.arity === 3 ? scopes.filter((s) => s[0] < s[1]) : scopes);
        for (const s of keep) out.push({ rel: name, vars: s });
      }
      return out;
    };
    function* federations(pl, nSites, maxPer) {
      const opts = [[]];
      for (let i = 0; i < pl.length; i++) opts.push([i]);
      if (maxPer >= 2) for (let i = 0; i < pl.length; i++) for (let j = i; j < pl.length; j++) opts.push([i, j]);
      const idx = new Array(nSites).fill(0);
      for (;;) {
        const cs = []; idx.forEach((oi, s) => opts[oi].forEach((pi) => cs.push({ ...pl[pi], site: s })));
        yield cs;
        let k = nSites - 1; while (k >= 0) { idx[k]++; if (idx[k] < opts.length) break; idx[k] = 0; k--; }
        if (k < 0) return;
      }
    }
    const space = (label, lang, D, nSites, maxPer, expectViolations = false) => {
      let n = 0, noSplit = 0, t1 = 0, t2 = 0, t3 = 0, t4 = 0, ex = null;
      for (const cs of federations(poolOf(lang), nSites, maxPer)) {
        n++;
        if ((K.kappaSplitBerge(cs) === 0) !== !hasSplitBergeBrute(cs)) t1++;
        if (K.kappaSplitBerge(cs) !== 0) continue;
        noSplit++;
        if (!K.fidelity(cs, D, lang)) { t2++; if (!ex) ex = cs; }
        if (!cs.length) continue;
        const sb = K.superBlocks(cs);
        if (groupKey(sb) !== groupKey(hyperBlocks(cs))) t3++;
        for (const g of sb) if (new Set(g.map((i) => cs[i].site)).size > 1) t4++;
        for (let i = 0; i < sb.length; i++) for (let j = i + 1; j < sb.length; j++) {
          const vi = new Set(sb[i].flatMap((k2) => cs[k2].vars));
          const vj = new Set(sb[j].flatMap((k2) => cs[k2].vars));   // DISTINCT shared variables —
          if ([...vi].filter((v) => vj.has(v)).length > 1) t4++;    // two constraints naming the
        }                                                           // same one is not two separators
      }
      check(`${label} — ${n.toLocaleString()} federations, ${noSplit.toLocaleString()} no-split`,
        t1 === 0 && t3 === 0 && t4 === 0 && (expectViolations ? t2 > 0 : t2 === 0),
        `κ_splitBerge vs brute ${t1} · super-blocks vs hypergraph blocks ${t3} · monochromatic/single-separator ${t4} · theorem violations ${t2}${ex ? ` (e.g. ${ex.map((x) => `S${x.site}:${x.rel}(${x.vars})`).join(' ')})` : ''}`);
    };

    const G1 = { eq: P(2, ([a, b]) => a === b), neq: P(2, ([a, b]) => a !== b), nae: P(3, ([a, b, d]) => !(a === b && b === d)), eq3: P(3, ([a, b, d]) => a === b && b === d), ab3: P(3, ([a, b]) => a === b) };
    const G2 = { u0: P(1, ([a]) => a === 0), leq: P(2, ([a, b]) => a <= b), eq: P(2, ([a, b]) => a === b) };
    // Γ₃ — a transitive core WITHOUT value symmetry, and a genuine ternary relation. The ternary
    // is pp-defined from the binary one (R3(a,b,c) := R(a,b) ∧ R(b,c)), which is what keeps End(A)
    // and hence the core unchanged. See the S4 note below for why it is not {≠∘f, NAE₃}.
    const RF = K.rel(2, [[0, 1], [1, 0], [2, 1], [1, 2]]);
    const R3 = []; for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) for (let d = 0; d < 3; d++) if (RF.holds([a, b]) && RF.holds([b, d])) R3.push([a, b, d]);
    const G3 = { R: RF, R3: K.rel(3, R3) };
    // EVERY SPACE BELOW IS RUN UNDER A HYPOTHESIS THAT IS CHECKED, NOT LABELLED. See S4.
    for (const [lbl, lang, D] of [['Γ₁ Sym(3)-invariant', G1, 3], ['Γ₂ {U₀,≤,=} core {0}', G2, 2], ['Γ₃ {≠∘f, R∘R} transitive core, NO value symmetry', G3, 3]]) {
      check(`  Γ hypothesis  ${lbl}: transitive core`, K.decide1PA(lang, D).holds,
        `core={${K.decide1PA(lang, D).core}} · value symmetry ${K.symmetryCertificate(lang, D).certifies1PA}`);
    }
    exhaustive('Q3 S1–S4b — four complete small spaces over three hypothesis-checked languages', () => {
      space('Q3  S1  Γ₁ |D|=3, 2 sites × ≤2 constraints (multisets — duplicates and contained scopes occur)', G1, 3, 2, 2);
      space('Q3  S2  Γ₁ |D|=3, 3 sites × 1 constraint', G1, 3, 3, 1);
      space('Q3  S3  Γ₂ |D|=2, 2 sites × ≤2 constraints (a genuine UNARY relation is in the pool)', G2, 2, 2, 2);
      space('Q3  S4a Γ₃ |D|=3, 2 sites × ≤2 constraints', G3, 3, 2, 2);
      space('Q3  S4b Γ₃ |D|=3, 3 sites × 1 constraint', G3, 3, 3, 1);
    });

    // ── S4′ · AN EXHAUSTIVE SPACE IS ONLY AS STRONG AS THE MODELS IT CAN EXPRESS ─────────────
    //
    // Round 3's research pass ran S4 over Γ = {≠∘f, NAE₃}, labelled "transitive core, NOT
    // value-symmetric", and reported 0 violations across 287,496 federations. The label is FALSE.
    // Adding NAE₃ destroys the retraction 2 ↦ 0 (it maps the NAE tuple (2,2,0) to (0,0,0)), so
    // End(A) collapses to Aut(A), the core becomes all of D, and Aut has two orbits — {0,2} and
    // {1}, because 1 is the only degree-2 vertex of R. 1PA FAILS. The theorem's antecedent was
    // never satisfied, so that space corroborated nothing about the theorem.
    //
    // And the counterexample is real: the canonical-query refutation below is a two-site
    // federation with no split Berge cycle whose union has no model. The sweep missed it for the
    // most ordinary reason — 56 constraints do not fit in a pool of ≤2 constraints per site over
    // four variables.
    //
    // This is round 1's lesson recurring one level down. Round 1 sampled 240k federations over
    // one language and never varied the language. Round 3 exhausted four languages and never
    // checked that one of them met the hypothesis. EXHAUSTION OVER A SPACE TOO SMALL TO HOLD THE
    // WITNESS IS EXACTLY AS BLIND AS A SAMPLE, and it reads as stronger. Hence the hypothesis
    // checks above: no space in this file is entered under an antecedent that has not been decided.
    {
      const NAEBAD = { R: RF, nae: P(3, ([a, b, d]) => !(a === b && b === d)) };
      const dec = K.decide1PA(NAEBAD, 3);
      check('S4′  REGRESSION  {≠∘f, NAE₃} does NOT have a transitive core, though round 3 labelled it so',
        !dec.holds, `core={${dec.core}} orbits=${JSON.stringify(dec.coreOrbits)} — |End| collapses from 6 to ${dec.endCount}`);
      const ref = K.refute1PA(NAEBAD, 3);
      check('S4′  REGRESSION  and the theorem genuinely fails there: no split Berge cycle, both sites satisfiable, union UNSAT',
        K.kappaSplitBerge(ref.federation) === 0
        && K.allSitesSat(ref.federation, 3, NAEBAD)
        && !K.satisfiable(ref.federation, 3, NAEBAD),
        `${ref.federation.length} constraints — far outside a ≤2-per-site pool, which is why 287,496 exhaustive federations found nothing`);
    }

    // T5 control — the hypothesis is load-bearing, and this must find violations
    const GBAD = { or: P(2, ([a, b]) => a === 1 || b === 1), nand: P(2, ([a, b]) => !(a === 1 && b === 1)) };
    check('  Γ hypothesis  CONTROL {OR, NAND}: NO transitive core', !K.decide1PA(GBAD, 2).holds,
      `core={${K.decide1PA(GBAD, 2).core}} orbits=${JSON.stringify(K.decide1PA(GBAD, 2).coreOrbits)}`);
    {
      const pairsOf = (vs) => { const o = []; for (let i = 0; i < vs.length; i++) for (let j = i + 1; j < vs.length; j++) o.push([vs[i], vs[j]]); return o; };
      const poolOn = (vs) => pairsOf(vs).flatMap((p) => [{ rel: 'or', vars: p }, { rel: 'nand', vars: p }]);
      const opts = (pl) => { const o = [[]]; for (let i = 0; i < pl.length; i++) { o.push([i]); for (let j = i; j < pl.length; j++) { o.push([i, j]); for (let k2 = j; k2 < pl.length; k2++) o.push([i, j, k2]); } } return o; };
      const p0 = poolOn(['a', 'b', 'd']), p1 = poolOn(['a', 'e', 'f']);
      let n = 0, viol = 0, ex = null;
      for (const A of opts(p0)) for (const B of opts(p1)) {
        const cs = [...A.map((i) => ({ ...p0[i], site: 0 })), ...B.map((i) => ({ ...p1[i], site: 1 }))]; n++;
        if (K.kappaSplitBerge(cs) !== 0) continue;
        if (!K.fidelity(cs, 2, GBAD)) { viol++; if (!ex) ex = cs; }
      }
      check(`Q3  T5 CONTROL — without a transitive core the theorem FAILS on the same carrier shape`,
        viol > 0, `${viol} violations in ${n.toLocaleString()} no-split federations (e.g. ${ex.map((x) => `S${x.site}:${x.rel}(${x.vars})`).join(' ')}) — a zero here would mean the hypothesis is doing nothing`);
    }

    // ── the model assumption, as a permanent regression ─────────────────────
    // CONSTRAINTS ARE HYPEREDGE INSTANCES. Two constraints on the same scope from two sites are
    // two constraint-NODES, and the pair of them is a split Berge 2-cycle. A model that merged
    // identical scopes into one hyperedge would see no cycle at all, call the federation
    // split-free, and the theorem would then be FALSE — the union below has no model. This is the
    // cheapest way to break the whole result, so it is pinned rather than left in a comment.
    const DUP = [c('eq3', ['a', 'b', 'q'], 0), c('nae', ['a', 'b', 'q'], 1)];
    const DUPLANG = { eq3: K.pred(3, ([a, b, d]) => a === b && b === d), nae: K.pred(3, ([a, b, d]) => !(a === b && b === d)) };
    check('INSTANCE MODEL  EQ₃(a,b,q) | NAE₃(a,b,q): same scope, two sites ⟹ κ_splitBerge = 1',
      K.kappaSplitBerge(DUP) === 1, 'two constraint-nodes on one scope form a split Berge 2-cycle');
    check('INSTANCE MODEL  …and fidelity FAILS, so the theorem is correctly silent',
      K.allSitesSat(DUP, 3, DUPLANG) && !K.satisfiable(DUP, 3, DUPLANG));
    check('INSTANCE MODEL  a merged-scope model would report ONE hyperedge, hence no cycle, hence a FALSE POSITIVE',
      K.kappaSplitBerge([DUP[0]]) === 0,
      'merging identical scopes destroys the obstruction — constraints must be instances, not scopes');
    check('INSTANCE MODEL  a repeated variable INSIDE one scope is harmless: NAE(a,a,b) | ≠(b,d) stays split-free',
      K.kappaSplitBerge([c('nae', ['a', 'a', 'b'], 0), c('neq', ['b', 'd'], 1)]) === 0,
      'one constraint cannot split a cycle with itself');
  }
}

// ═══ §6 · Q2 — necessity is exact at |D|=2 and non-local at |D|≥3 ═══════════
console.log('\n§6 · necessity — Harary balance at |D|=2, graph colouring at |D|≥3\n');
{
  const unbalancedSplitCycleExists = (cs) => {
    // a cycle is unsatisfiable at |D|=2 iff it carries an odd number of `neq` edges
    const { nNodes, edges } = K.binaryGraph(cs);
    const rel = cs.map((x) => x.rel);
    const bs = K.blocks(nNodes, edges);
    for (const b of bs) {
      if (new Set(b.map((i) => edges[i].site)).size < 2) continue;
      // within a split block, search for an unbalanced cycle: 2-colour the block by parity
      const sub = b.map((i) => ({ ...edges[i], rel: rel[i] }));
      const col = new Map();
      let unbalanced = false;
      const nodes = [...new Set(sub.flatMap((e) => [e.u, e.v]))];
      for (const start of nodes) {
        if (col.has(start)) continue;
        col.set(start, 0);
        const q = [start];
        while (q.length) {
          const u = q.shift();
          for (const e of sub) {
            if (e.u !== u && e.v !== u) continue;
            const w = e.u === u ? e.v : e.u, p = col.get(u) ^ (e.rel === 'neq' ? 1 : 0);
            if (!col.has(w)) { col.set(w, p); q.push(w); }
            else if (col.get(w) !== p) unbalanced = true;
          }
        }
      }
      if (unbalanced) return true;
    }
    return false;
  };

  exhaustive('Q2 Harary-balance necessity at |D| = 2 over the full enumeration', () => {
    const space = enumerateFederations(FULL ? 3 : 2);
    let mism = 0, vacuous = 0;
    for (const F of space) {
      const allSat = K.allSitesSat(F, 2, K.EQ_NEQ);
      const unbal = unbalancedSplitCycleExists(F);
      if (allSat) { if (!K.fidelity(F, 2, K.EQ_NEQ) !== unbal) mism++; }
      else if (unbal) vacuous++;
    }
    check(`Q2  |D|=2, under "all sites satisfiable": ¬fidelity ⟺ some split cycle unbalanced`,
      mism === 0, `mismatches: ${mism} over ${space.length.toLocaleString()} federations`);
    check(`Q2  the literal conjecture (without the antecedent) fails on ${vacuous.toLocaleString()} federations`,
      vacuous > 0, 'an unbalanced split cycle beside a locally-unsatisfiable site is vacuously fine');
  });

  // |D|≥3: no cycle-local test can exist. K₄ all-≠ split into three matchings.
  const K4 = [
    c('neq', ['a', 'b'], 0), c('neq', ['c', 'd'], 0),
    c('neq', ['a', 'c'], 1), c('neq', ['b', 'd'], 1),
    c('neq', ['a', 'd'], 2), c('neq', ['b', 'c'], 2),
  ];
  const everyCycleSat = (() => {
    // every 3- and 4-cycle of K₄ under all-≠ is satisfiable at |D|=3
    const tri = [['a', 'b', 'c'], ['a', 'b', 'd'], ['a', 'c', 'd'], ['b', 'c', 'd']];
    return tri.every((t) => K.satisfiable(
      [c('neq', [t[0], t[1]], 0), c('neq', [t[1], t[2]], 0), c('neq', [t[0], t[2]], 0)], 3, K.EQ_NEQ));
  })();
  check('Q2  |D|=3: K₄ all-≠, every triangle individually satisfiable', everyCycleSat);
  check('Q2  |D|=3: all three sites satisfiable, union UNSATISFIABLE (χ(K₄)=4 > 3)',
    K.allSitesSat(K4, 3, K.EQ_NEQ) && !K.satisfiable(K4, 3, K.EQ_NEQ),
    'no predicate "some split cycle has property P" can characterize necessity here');
}

// ═══ §7 · the cycle-locality theorem, with its quantifier class stated ══════
//
// Round 2 asserted "for |D| ≥ 3 no cycle-local predicate can characterize fidelity failure"
// and left "cycle-local" undefined — an informal impossibility claim, which is not something a
// reviewer can attack. Here is the exact statement, and it is provable.
//
//   DEFINITION. A CYCLE-LOCAL CRITERION is a predicate P on the pair (labels(C), sites(C)) of a
//   cycle C — that is, P may inspect the cycle's own relations and site tags in order, and
//   NOTHING ELSE about the federation containing it. The induced test is
//        FAIL_P(F) := ∃ a cycle C of F with P(labels(C), sites(C)).
//   P is SOUND AND COMPLETE if for every federation F, FAIL_P(F) ⟺ ¬fidelity(F).
//
//   THEOREM. At |D| = 3 over {=, ≠} no sound and complete cycle-local criterion exists.
//   PROOF. Suppose P is one. Let F be K₄ with all-≠ edges split into three perfect matchings.
//   ¬fidelity(F) — every site is a matching and so satisfiable, and χ(K₄) = 4 > 3 — so by
//   completeness some cycle C of F has P(labels(C), sites(C)). Now let F' be the federation whose
//   constraints are exactly the edges of C, carrying the same relations and the same site tags.
//   C is a cycle of F', so FAIL_P(F') holds. But F' is a single ≠-cycle, which is 3-colourable,
//   and each site of F' is a sub-multiset of a matching; so every site is satisfiable and the
//   union is satisfiable, i.e. fidelity(F') HOLDS. Soundness fails. ∎
//
//   The argument is exactly what fails at |D| = 2, and §6 shows the criterion DOES exist there:
//   an unbalanced cycle re-presented alone is still unsatisfiable, so the witness survives being
//   extracted from its federation. At |D| = 3 it does not. The theorem is therefore not "cycles
//   are the wrong idea" but the sharper "no obstruction can be certified by exhibiting one cycle",
//   and both halves are checked below.
//   ROUND 3 GENERALIZED IT TWICE, and the second one is the strong statement:
//
//   R4a. For EVERY k ≥ 3 the same argument runs on K_{k+1} — χ(K_{k+1}) = k+1 > k, and every
//        simple cycle of a complete graph is 3-colourable, hence k-colourable. Checked at
//        k = 3, 4, 5 below (197 cycles at k = 5).
//   R4b. For every k ≥ 3 and every FIXED SIZE BOUND s, no sound-and-complete test of the form
//        "∃ a sub-federation F′ with ≤ s constraints such that T(F′)" exists either. Take a graph
//        of girth > s and chromatic number > k — Erdős 1959 gives one for every (s, k) — and
//        every ≤s-edge sub-federation is a forest, hence 2-colourable, while the whole graph is
//        not k-colourable. The Grötzsch graph instantiates it executably at s = 3, k = 3.
//
//   That is a much larger class than cycles: for k ≥ 3 a fidelity failure can be irreducibly
//   GLOBAL, carried by no bounded piece of the federation at all. It is NOT a first-order or
//   Hanf-locality statement and nothing here claims one — that needs matching neighbourhood-type
//   counts and is a separate theorem.
console.log('\n§7 · locality — no sound-and-complete bounded-size criterion at any |D| ≥ 3\n');
{
  // R4a — every k ≥ 3, via K_{k+1} with one site per edge
  for (const k of [3, 4, 5]) {
    const F = K.completeDisequality(k + 1);
    const sat = K.allSitesSat(F, k, K.EQ_NEQ), uni = K.satisfiable(F, k, K.EQ_NEQ);
    const cycles = K.simpleCycles(F);
    const survives = cycles.filter((cyc) => !K.fidelity(cyc.map((i) => F[i]), k, K.EQ_NEQ)).length;
    check(`R4a  k=${k}: K_${k + 1} all-≠, one site per edge — every site satisfiable, union NOT (χ=${k + 1} > ${k})`,
      sat && !uni);
    check(`R4a  k=${k}: all ${cycles.length} simple cycles keep FIDELITY when extracted with their own labels and sites`,
      survives === 0,
      'completeness forces P on some cycle; soundness then fails on that cycle alone ⟹ no cycle-local criterion');
  }

  // R4b — every fixed size bound s. Executable instance at s = 3, k = 3.
  {
    const G = K.grotzschDisequality();
    const tri = K.simpleCycles(G).filter((cyc) => cyc.length === 3).length;
    check('R4b  Grötzsch graph all-≠, one site per edge: 20 edges, girth 4 (no triangles), NOT 3-colourable',
      G.length === 20 && tri === 0 && !K.kColourable(G, 3) && K.kColourable(G, 4),
      'χ = 4 > 3 while every short cycle is long enough to be irrelevant');
    let subs = 0, withFidelity = 0;
    for (let i = 0; i < G.length; i++) for (let j = i + 1; j < G.length; j++) for (let m = j + 1; m < G.length; m++) {
      const F2 = [G[i], G[j], G[m]]; subs++;
      if (K.fidelity(F2, 3, K.EQ_NEQ)) withFidelity++;
    }
    check(`R4b  every one of the ${subs.toLocaleString()} three-constraint sub-federations has FIDELITY, while the whole does not`,
      withFidelity === subs,
      'girth 4 makes every ≤3-edge subgraph a forest ⟹ no sound-and-complete size-3 local test at k=3');
    console.log('      for s > 3 the same argument needs girth > s and χ > k, which Erdős 1959 supplies for every (s, k);');
    console.log('      that step is KNOWN literature, not re-derived here, and the claim ledger says so.');
  }

  // and the contrast at |D|=2, where the criterion DOES exist and the extraction step is what fails
  const unbal = [c('neq', ['a', 'b'], 0), c('neq', ['b', 'f'], 0), c('neq', ['f', 'a'], 1)];
  check('|D|=2 contrast: an unbalanced split triangle fails fidelity',
    !K.fidelity(unbal, 2, K.EQ_NEQ));
  const cyc2 = K.simpleCycles(unbal);
  check('|D|=2 contrast: and it STILL fails when extracted as its own federation',
    cyc2.length === 1 && !K.fidelity(cyc2[0].map((i) => unbal[i]), 2, K.EQ_NEQ),
    'the witness survives extraction — which is exactly why "split and unbalanced" IS a valid cycle-local criterion at |D|=2');
}

// ═══ §8 · the matroid form of the κ_split zero set ══════════════════════════
//
// Round 3's cleanest unification. The two carriers — a constraint multigraph for binary
// constraints, a bipartite incidence graph for n-ary ones — collapse into one, because
// the components of a matroid are the classes of "lie on a common circuit" (Oxley §4.1),
// a separator is a union of components (§4.2), and for the cycle matroid of a graph the
// components are exactly the block edge sets. So
//
//     κ_split = 0  ⟺  the site colouring is constant on every matroid component
//                  ⟺  every site's incidence-edge set is a SEPARATOR of M(I(H))
//                  ⟺  M(I(H)) = ⊕_sites M(I(H))|E_site
//
// and the binary case is the subdivision of the n-ary one. Say "each site is a separator of
// the cycle matroid" — that is a standard name for a standard object, and it retires the
// two-carrier machinery.
//
// ONLY THE ZERO SET IS CLAIMED, and the reason is sharper than "we are being careful". Five
// natural magnitudes are computed below and they disagree with each other. That shows the
// theorem does not DETERMINE a magnitude. It does NOT show no canonical magnitude exists —
// "canonical" is not formalised anywhere here, so that is not a proposition that can be
// refuted by exhibiting five inequivalent functions. FED-K2 stays DECLARED, and the round-3
// research pass's "canonical magnitude refuted" is recorded as an overclaim.
console.log('\n§8 · κ_split as a matroid statement — each site is a separator of the cycle matroid\n');
{
  const e = (a, b, site, rel = 'neq') => c(rel, [a, b], site);
  // the equivalences, over the full round-1 enumeration space and an n-ary space
  exhaustive('the three matroid equivalences on both carriers, over 117,648 + 4,096 federations', () => {
    let n = 0, misConst = 0, misSep = 0, misSum = 0;
    for (const F of enumerateFederations(3)) {
      n++;
      const zero = K.kappaSplit(F) === 0;
      const dec = K.matroidSiteDecomposition(F, { carrier: 'binary' });
      if (dec.constantOnComponents !== zero) misConst++;
      if (dec.everySiteIsSeparator !== zero) misSep++;
      if (dec.directSum !== zero) misSum++;
    }
    check(`κₛ = 0 ⟺ colouring constant on matroid components, over ${n.toLocaleString()} federations`, misConst === 0);
    check('κₛ = 0 ⟺ every site is a SEPARATOR of the cycle matroid', misSep === 0);
    check('κₛ = 0 ⟺ the matroid is the DIRECT SUM of its site restrictions', misSum === 0);

    // and the same statement on the incidence carrier, which is the one that generalizes
    const V = ['a', 'b', 'd', 'e'], pool = [];
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) { pool.push({ rel: 'eq', vars: [V[i], V[j]] }); pool.push({ rel: 'neq', vars: [V[i], V[j]] }); }
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) for (let m = j + 1; m < 4; m++) pool.push({ rel: 'nae', vars: [V[i], V[j], V[m]] });
    let n2 = 0, mis2 = 0, misSep2 = 0;
    for (const a of pool) for (const b of pool) for (const d of pool) {
      const F = [{ ...a, site: 0 }, { ...b, site: 1 }, { ...d, site: 2 }]; n2++;
      const zero = K.kappaSplitBerge(F) === 0, dec = K.matroidSiteDecomposition(F);
      if (dec.constantOnComponents !== zero) mis2++;
      if (dec.everySiteIsSeparator !== zero) misSep2++;
    }
    check(`the same statement on M(I(H)) for n-ary constraints, over ${n2.toLocaleString()} federations`,
      mis2 === 0 && misSep2 === 0, 'one carrier now covers both arities — the binary graph is its subdivision');
  });

  // ── the five DECLARED magnitudes, and all ten pairs ──────────────────────
  //
  // The research pass printed "magnitudes shown pairwise distinct" while its code compared six
  // hand-listed pairs out of ten. On its five examples m1 and m4 are never different, so the
  // sentence outran the check. Both halves are fixed here: all ten pairs are compared, and a K₄
  // witness that separates m1 from m4 is added. The conclusion the data supports is that these
  // are five different functions, not that no canonical magnitude exists.
  const FEDS = [
    ['triangle, 3 sites', [e('a', 'b', 0), e('b', 'd', 1), e('d', 'a', 2)]],
    ['two triangles at a; site 1 in both', [e('a', 'b', 0), e('b', 'd', 0), e('d', 'a', 1), e('a', 'e', 1), e('e', 'f', 2), e('f', 'a', 2)]],
    ['4-cycle (site 0) + chord (site 1)', [e('a', 'b', 0), e('b', 'd', 0), e('d', 'e', 0), e('e', 'a', 0), e('a', 'd', 1)]],
    ['two triangles, one foreign edge each', [e('a', 'b', 0), e('b', 'd', 1), e('d', 'a', 0), e('a', 'e', 0), e('e', 'f', 1), e('f', 'a', 0)]],
    ['5-cycle, sites 0,0,0,1,1', [e('a', 'b', 0), e('b', 'd', 0), e('d', 'e', 0), e('e', 'f', 1), e('f', 'a', 1)]],
    // K₄ with site 1 on a perfect matching: ONE impure component (m1 = 1), but no single deletion
    // purifies it — K₄ minus any edge is still 2-connected and still mixed — so m4 = 2.
    ['K₄, site 1 on the matching {ab, de}', [e('a', 'b', 1), e('a', 'd', 0), e('a', 'e', 0), e('b', 'd', 0), e('b', 'e', 0), e('d', 'e', 1)]],
  ];
  const rows = FEDS.map(([label, F]) => {
    const m = K.matroidSiteDecomposition(F, { carrier: 'binary' }).magnitudes;
    const vals = { m1: m.m1_impureComponents, m2: m.m2_extraSites, m3: m.m3_minRecolour, m4: K.minPurifyingDeletions(F, { carrier: 'binary' }), m5: m.m5_minSiteMerges };
    console.log(`      ${label.padEnd(38)} m1=${vals.m1} m2(κₛ)=${vals.m2} m3=${vals.m3} m4=${vals.m4} m5=${vals.m5}`);
    return vals;
  });
  const NAMES = ['m1', 'm2', 'm3', 'm4', 'm5'], unseparated = [];
  for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++)
    if (!rows.some((r) => r[NAMES[i]] !== r[NAMES[j]])) unseparated.push(`${NAMES[i]}=${NAMES[j]}`);
  check('all TEN unordered pairs of the five magnitudes are separated by a witness above',
    unseparated.length === 0, unseparated.length ? `not separated: ${unseparated.join(', ')}` : '10/10 — including m1 vs m4, which the round-3 witness never separated');
  check('m1 ≠ m4 specifically, on the K₄ witness the research pass was missing',
    rows[5].m1 === 1 && rows[5].m4 === 2,
    'one impure component; deleting any single edge leaves K₄−e 2-connected and still mixed');

  // and the magnitudes are not even carrier-invariant, which the zero set is
  const F1 = FEDS[0][1];
  const mb = K.matroidSiteDecomposition(F1, { carrier: 'binary' }).magnitudes;
  const mi = K.matroidSiteDecomposition(F1).magnitudes;
  // WORDING, and the class is named on purpose. What is proved is agreement between the binary
  // constraint multigraph and its incidence-graph SUBDIVISION — one normalization, not an
  // unspecified family of carrier transformations. "Carrier-invariant" as a general phrase would
  // need that family defined first, and it is not, so it is not published as one.
  check('the zero set AGREES ACROSS THE SUBDIVISION while the magnitudes do not (m3 differs)',
    (K.kappaSplit(F1) === 0) === (K.kappaSplitBerge(F1) === 0) && mb.m3_minRecolour !== mi.m3_minRecolour,
    `m3 = ${mb.m3_minRecolour} on the constraint multigraph, ${mi.m3_minRecolour} on its incidence-graph subdivision — that ONE normalization, not a general invariance class`);
  console.log('      ⟹ FED-K2 stays DECLARED. Five inequivalent functions show the theorem fixes no magnitude;');
  console.log('        they do not show that none is canonical, because "canonical" has not been defined here.');
}

// ═══ §9 · the other route to #36 — exact separator projections, no language hypothesis ══════
//
// Cell 36 has TWO stories and collapsing them into one status sentence loses the operationally
// important half.
//
//   36a AUTOMATIC   no split Berge cycle + transitive core + every site satisfiable ⟹ fidelity.
//                   A theorem about the LANGUAGE. CONDITIONAL: real value sorts fail it — two
//                   literals on a sort is enough to give two disjoint unary projections.
//   36b CERTIFIED   no split Berge cycle + each block exports its exact separator projection ⟹
//                   satisfiability is DECIDED, with no hypothesis on Γ at all. KNOWN: this is
//                   Yannakakis' 1981 semijoin full reducer / Dechter–Pearl 1989 tree clustering
//                   specialised to singleton separators.
//
// Three things this is NOT, each of which the round-3 research pass claimed and the audit removed:
//   not "the smallest" summary — exactness is proved, an information-theoretic lower bound is not;
//   not "efficient" — the carrier becomes a tree, but each block still has a local CSP to project,
//     which for unrestricted Γ is NP-hard, and a tree of hard problems is not an easy problem;
//   not trustless — membership witnesses prove M ⊆ true projection and nothing proves the converse,
//     so an incomplete or hostile site can omit feasible values and manufacture a false UNSAT.
//     That gap is claim FED-SEP-CERT, and it is OPEN.
console.log('\n§9 · separator protocol — exact fidelity decision WITHOUT a language hypothesis\n');
{
  const P = (ar, f) => K.pred(ar, f);
  const LANGS = [
    ['OR/NAND |D|=2', { or: P(2, ([a, b]) => a === 1 || b === 1), nand: P(2, ([a, b]) => !(a === 1 && b === 1)) }, 2],
    ['pins 0 and 1, + ≠ |D|=2', { r0: P(2, ([a]) => a === 0), r1: P(2, ([a]) => a === 1), neq: K.EQ_NEQ.neq }, 2],
    ['< and = |D|=3', { lt: P(2, ([a, b]) => a < b), eq: K.EQ_NEQ.eq }, 3],
    ['eq/neq |D|=3 (the 1PA control)', K.EQ_NEQ, 3],
  ];
  exhaustive('36b protocol == brute force over the full no-split space for four languages', () => {
    for (const [label, lang, D] of LANGS) {
      const V = ['a', 'b', 'd', 'e'], PAIRS = [];
      for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) PAIRS.push([V[i], V[j]]);
      const names = Object.keys(lang), LAB = PAIRS.flatMap((p) => names.map((r) => ({ rel: r, vars: p })));
      const SITES = [[]];
      for (let i = 0; i < LAB.length; i++) SITES.push([LAB[i]]);
      for (let i = 0; i < LAB.length; i++) for (let j = i + 1; j < LAB.length; j++) SITES.push([LAB[i], LAB[j]]);
      let noSplit = 0, mis = 0, hard = 0;
      for (const s1 of SITES) for (const s2 of SITES) for (const s3 of SITES) {
        const cs = [...s1.map((x) => ({ ...x, site: 0 })), ...s2.map((x) => ({ ...x, site: 1 })), ...s3.map((x) => ({ ...x, site: 2 }))];
        if (K.kappaSplitBerge(cs) !== 0) continue;
        noSplit++;
        const brute = K.satisfiable(cs, D, lang);
        if (K.separatorProtocol(cs, D, lang).sat !== brute) mis++;
        if (!brute && K.allSitesSat(cs, D, lang)) hard++;           // exactly the cases 36a cannot reach
      }
      const has1PA = K.decide1PA(lang, D).holds;
      check(`36b  ${label.padEnd(32)} protocol == brute force on ${noSplit.toLocaleString()} no-split federations`,
        mis === 0, `transitive core: ${has1PA} · ${hard.toLocaleString()} of them are locally satisfiable and globally UNSAT${has1PA ? '' : ' — outside any language-wide theorem'}`);
    }
  });

  // pairwise separator agreement is NECESSARY and NOT SUFFICIENT — a block with two separators
  const L2 = { or: P(2, ([a, b]) => a === 1 || b === 1), nand: P(2, ([a, b]) => !(a === 1 && b === 1)), neq: K.EQ_NEQ.neq };
  const TWO_SEP = [
    c('nand', ['v1', 'y'], 0), c('nand', ['v1', 'z'], 0), c('or', ['y', 'z'], 0),
    c('nand', ['v2', 'p'], 1), c('nand', ['v2', 'q'], 1), c('or', ['p', 'q'], 1),
    c('neq', ['v1', 'v2'], 2),
  ];
  const proj = (g, v) => [0, 1].filter((val) => K.satisfiable([...g, c('__p', [v], -1)], 2, { ...L2, __p: P(1, ([a]) => a === val) }));
  const S0 = TWO_SEP.filter((x) => x.site === 0), S1 = TWO_SEP.filter((x) => x.site === 1), S2 = TWO_SEP.filter((x) => x.site === 2);
  const pw1 = proj(S0, 'v1').filter((v) => proj(S2, 'v1').includes(v));
  const pw2 = proj(S1, 'v2').filter((v) => proj(S2, 'v2').includes(v));
  check('every PAIRWISE separator intersection is non-empty…', pw1.length > 0 && pw2.length > 0,
    `at v1: {${proj(S0, 'v1')}} ∩ {${proj(S2, 'v1')}} = {${pw1}} · at v2: {${proj(S1, 'v2')}} ∩ {${proj(S2, 'v2')}} = {${pw2}}`);
  const pr = K.separatorProtocol(TWO_SEP, 2, L2);
  check('…and the federation is still UNSATISFIABLE — pairwise agreement is not sufficient',
    !K.satisfiable(TWO_SEP, 2, L2) && K.allSitesSat(TWO_SEP, 2, L2) && K.kappaSplit(TWO_SEP) === 0);
  check('the two-pass protocol catches it: the bridge block needs the JOINT restriction at both ends',
    pr.sat === false, `messages ${pr.messages.map((m) => `${m.at}:{${m.set}}`).join(' ')}`);

  // FED-SEP-CERT — the one-sidedness of membership witnesses, made concrete rather than noted
  {
    const lang = { or: P(2, ([a, b]) => a === 1 || b === 1), nand: P(2, ([a, b]) => !(a === 1 && b === 1)) };
    const honest = K.separatorProtocol([c('or', ['x', 'y'], 0), c('nand', ['x', 'y'], 1)], 2, lang);
    // a site that under-reports its projection produces a smaller message; every value it DOES
    // report is still backed by a satisfying assignment, so membership witnesses all verify.
    const truthful = [0, 1].filter((v) => K.satisfiable([c('or', ['x', 'y'], 0), c('__p', ['x'], -1)], 2, { ...lang, __p: P(1, ([a]) => a === v) }));
    const understated = truthful.slice(0, 1);
    const witnessed = understated.every((v) => K.satisfiable([c('or', ['x', 'y'], 0), c('__p', ['x'], -1)], 2, { ...lang, __p: P(1, ([a]) => a === v) }));
    check('FED-SEP-CERT (OPEN)  an UNDER-reported message still passes every membership witness',
      witnessed && understated.length < truthful.length,
      `true projection {${truthful}}, reported {${understated}} — one assignment per reported value proves M ⊆ truth and nothing proves truth ⊆ M`);
    check('FED-SEP-CERT (OPEN)  so a hostile or merely incomplete site can manufacture a false UNSAT',
      honest.sat === true,
      'the honest run is SAT; no artefact in this protocol would contradict a site that reported ∅. An exclusion certificate is the open design question.');
  }
}

// ── the enumeration space ───────────────────────────────────────────────────
// Four variables, all six pairs. Each pair is absent, or carries one relation from
// {eq, neq} tagged with one of `nSites` sites. Deterministic and complete.
function enumerateFederations(nSites) {
  const V = ['a', 'b', 'd', 'e'];
  const PAIRS = [];
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) PAIRS.push([V[i], V[j]]);
  const opts = [null];
  for (const r of ['eq', 'neq']) for (let s = 0; s < nSites; s++) opts.push([r, s]);
  const out = [];
  const total = opts.length ** PAIRS.length;
  for (let code = 0; code < total; code++) {
    let x = code; const cs = [];
    for (const p of PAIRS) { const o = opts[x % opts.length]; x = Math.floor(x / opts.length); if (o) cs.push(c(o[0], p, o[1])); }
    if (cs.length) out.push(cs);
  }
  return out;
}

// ── verdict ─────────────────────────────────────────────────────────────────
const secs = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`\n${failures === 0 ? '✓' : '✗'} federation invariants: ${failures === 0 ? 'all checks hold' : failures + ' FAILED'}  (${secs}s${FULL ? ', --full' : ''}${PREFLIGHT ? ', --preflight' : ''})`);
if (PREFLIGHT) console.log(`  ⊘ ${skipped} exhaustive block(s) SKIPPED and named above. This established that the pinned\n    constructions reproduce; it did NOT run the corroboration. Drop --preflight for that.`);
console.log('');
process.exit(failures === 0 ? 0 : 1);
