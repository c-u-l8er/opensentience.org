#!/usr/bin/env node
/* check-irreversible-ledger.mjs — the permanent regression for Periodic Table cell #27b.
 *
 *   node scripts/check-irreversible-ledger.mjs
 *
 * Two halves, and the second is the one that matters:
 *
 *   §1  the WITNESS reproduces against the pre-fix semantics. Fable 5 (2026-08-23) spent an
 *       account's whole holdout-bits balance, transferred it back out of SINK, and watched the
 *       CB1 gate re-open with C1 (Σ conserved) and C2 (no overdraft) still true. This file
 *       carries a 12-line reimplementation of the OLD `transfer` so that witness stays runnable
 *       forever, instead of being deleted the moment it was fixed.
 *
 *   §2  the CURRENT kernel REFUSES it — and the refusal is narrow. C9 blocks recovery of spent
 *       value; it does NOT block allocation of unspent budget from the treasury. Fable's proposed
 *       law forbade both ("no transfer out of SINK and no refill after exhaustion"). GPT-5.6's
 *       narrowing is what is implemented, because a global privacy cap of 10 with 5 already spent
 *       leaves 5 legitimately allocatable — that is budgeting, not un-leaking.
 *
 * A law that passes over a broken implementation proves nothing, so §1 asserts the OLD code FAILS
 * the new laws. If someone reverts resource.mjs, §2 goes red; if someone weakens the new laws to
 * something the old code satisfies, §1 goes red.
 */
import * as RES from '../AmpersandBoxDesign/box-and-box/resource.mjs';

const SINK = RES.SINK, TREASURY = RES.TREASURY;
let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`   ${ok ? '✓' : '✗ FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
  return ok;
};

// ── the pre-fix primitive, kept verbatim in spirit so the witness cannot rot ────────────────
// resource.mjs v0.8, before 2026-08-23: the ONLY guards were the affine floor and non-negativity.
const oldTransfer = (L, res, from, to, amt) => {
  const bal = (a) => (L.bal[a] && L.bal[a][res]) || 0;
  if (amt < 0 || bal(from) < amt) return RES.INFEASIBLE;
  const M = { bal: Object.fromEntries(Object.entries(L.bal).map(([a, r]) => [a, { ...r }])), kind: { ...L.kind }, cap: { ...L.cap } };
  M.bal[from] = M.bal[from] || {}; M.bal[to] = M.bal[to] || {};
  M.bal[from][res] = (M.bal[from][res] || 0) - amt;
  M.bal[to][res] = (M.bal[to][res] || 0) + amt;
  return M;
};
const mkLedger = () => RES.Ledger({
  bal: { cand: { hb: 5 }, [TREASURY]: { hb: 5 }, [SINK]: {} },
  kind: { hb: 'irreversible' },
});

console.log('\n§1 · the witness, against the PRE-FIX semantics (it must still reproduce)\n');
{
  const L = mkLedger();
  const spent = oldTransfer(L, 'hb', 'cand', SINK, 5);
  check('after spending 5, the CB1 gate is closed', !RES.feasible(spent, 'cand', { hb: 1 }),
    `cand=${RES.balance(spent, 'cand', 'hb')} sink=${RES.balance(spent, SINK, 'hb')}`);
  const refunded = oldTransfer(spent, 'hb', SINK, 'cand', 5);
  check('OLD semantics ACCEPT transfer(SINK → cand, 5)', refunded !== RES.INFEASIBLE);
  check('the gate RE-OPENS — the defect', RES.feasible(refunded, 'cand', { hb: 1 }),
    `cand=${RES.balance(refunded, 'cand', 'hb')} sink=${RES.balance(refunded, SINK, 'hb')}`);
  check('and no pre-existing law noticed: Σ conserved (C1) and all balances ≥ 0 (C2)',
    RES.total(refunded, 'hb') === RES.total(L, 'hb')
    && Object.values(refunded.bal).every((r) => Object.values(r).every((v) => v >= 0)),
    `Σ = ${RES.total(refunded, 'hb')} throughout`);
  check('the sink DECREASED, which is what C9 now forbids',
    RES.balance(refunded, SINK, 'hb') < RES.balance(spent, SINK, 'hb'));
}

console.log('\n§2 · the CURRENT kernel refuses it, and refuses only it\n');
{
  const L = mkLedger();
  const spent = RES.spend(L, 'cand', 'hb', 5);
  check('spend still works (irreversibility is not a freeze)', spent !== RES.INFEASIBLE
    && RES.balance(spent, SINK, 'hb') === 5);
  check('C9 — transfer(SINK → cand) is INFEASIBLE',
    RES.transfer(spent, 'hb', SINK, 'cand', 5) === RES.INFEASIBLE);
  check('CB4 — the gate stays closed after exhaustion', !RES.feasible(spent, 'cand', { hb: 1 }));

  // the narrowing: unspent treasury budget is still allocatable
  const alloc = RES.refill(spent, 'cand', 'hb', 5);
  check('allocation of UNSPENT budget (TREASURY → cand) is still permitted',
    alloc !== RES.INFEASIBLE && RES.balance(alloc, 'cand', 'hb') === 5,
    'Fable proposed forbidding this too; spending 5 of a cap of 10 does not forbid the other 5');
  check('and it did not resurrect anything: the sink is unchanged',
    RES.balance(alloc, SINK, 'hb') === 5);

  // C10 — the declared cap bounds cumulative consumption, which the sink balance measures
  const capped = RES.Ledger({
    bal: { cand: { hb: 50 }, [TREASURY]: { hb: 50 }, [SINK]: {} },
    kind: { hb: 'irreversible' }, cap: { hb: 6 },
  });
  const s1 = RES.spend(capped, 'cand', 'hb', 4);
  check('C10 — spending 4 against a cap of 6 is permitted', s1 !== RES.INFEASIBLE);
  check('C10 — a further 4 would total 8 > 6 and is INFEASIBLE',
    RES.spend(s1, 'cand', 'hb', 4) === RES.INFEASIBLE,
    'the account can afford it; the CAP is what refuses');
  check('C10 — a further 2 lands exactly on the cap and is permitted',
    RES.spend(s1, 'cand', 'hb', 2) !== RES.INFEASIBLE);

  // and none of this touches ordinary reversible resources
  const tok = RES.Ledger({ bal: { a: { tokens: 5 }, [SINK]: {} } });
  const ts = RES.spend(tok, 'a', 'tokens', 5);
  check('reversible resources are untouched: a token refund from SINK still works',
    RES.transfer(ts, 'tokens', SINK, 'a', 5) !== RES.INFEASIBLE,
    'a refund is a feature for tokens and a bug for holdout-bits — the kind field is the difference');
}

// ── §3 · the gate/primitive divergence (round 3) ────────────────────────────────────────────
//
// C10 was added in R2.1 and it was added to ONE of the two paths. `transfer` refused a spend that
// would cross the cap; `feasible` was `affords`, which never looked at the cap at all. So the
// alethic gate — the thing a caller asks BEFORE committing — said GO on a spend the primitive was
// already committed to refusing. Fable 5 found it in round 3; GPT-5.6's fix is one shared
// `admissibleSpend` predicate rather than a second copy of the cap test.
//
// The general lesson is the reason this section exists at all: A NEW INVARIANT IS NOT FINISHED
// WHEN THE PRIMITIVE THAT STATES IT ENFORCES IT. Every OTHER path that decides the same question
// has to be found and pointed at the same predicate, or the invariant holds in one place and the
// system behaves as though it does not hold anywhere.

console.log('\n§3 · the R2.1 cap reached the primitive and not the gate — and the paths that inherited it\n');
{
  // exactly Fable's R7 §3 configuration: cap 6, sink 5, account rich enough to afford 3.
  const L = RES.Ledger({
    bal: { cand: { hb: 10 }, [TREASURY]: { hb: 20 }, [SINK]: { hb: 5 } },
    kind: { hb: 'irreversible' }, cap: { hb: 6 },
  });
  const preFixFeasible = (M, acct, cost) =>                    // `feasible = affords`, as shipped in R2.1
    Object.entries(cost).every(([res, amt]) => RES.balance(M, acct, res) >= amt);

  check('PRE-FIX gate: feasible({hb:3}) === true  (it only ever looked at the balance)',
    preFixFeasible(L, 'cand', { hb: 3 }) === true, 'balance 10 ≥ 3');
  check('primitive: spend(3) === INFEASIBLE  (sink 5 + 3 > cap 6)',
    RES.spend(L, 'cand', 'hb', 3) === RES.INFEASIBLE);
  check('⟹ the two disagreed, and C1/C2/C9/C10 all still held — no law compared them',
    preFixFeasible(L, 'cand', { hb: 3 }) !== (RES.spend(L, 'cand', 'hb', 3) !== RES.INFEASIBLE));

  check('CB5 — the CURRENT gate refuses it, agreeing with the primitive',
    RES.feasible(L, 'cand', { hb: 3 }) === false);
  check('CB5 — and still permits what the primitive permits: 1 lands on the cap exactly',
    RES.feasible(L, 'cand', { hb: 1 }) === true && RES.spend(L, 'cand', 'hb', 1) !== RES.INFEASIBLE);
  check('CB5 — the equivalence holds across a whole cost map, not just one resource',
    RES.feasible(L, 'cand', { hb: 1, tokens: 0 }) === (RES.charge(L, 'cand', { hb: 1, tokens: 0 }) !== RES.INFEASIBLE)
    && RES.feasible(L, 'cand', { hb: 3, tokens: 0 }) === (RES.charge(L, 'cand', { hb: 3, tokens: 0 }) !== RES.INFEASIBLE));

  // CB6 — the two derived paths that preflighted with their own check and then called spend.
  const r = RES.repair(L, 'cand', { resource: 'hb', value: 100, cost: 3 });
  check('CB6 — repair() decides `cannot-afford`, not `invoke` over an INFEASIBLE ledger',
    r.decision === 'cannot-afford' && r.L !== RES.INFEASIBLE,
    'the account CAN afford 3; the cap is what refuses, and the decision has to say so');
  const atCap = RES.spend(L, 'cand', 'hb', 1);                  // sink now 6 = cap
  const u = RES.use(atCap, 'cand', 'hb');
  check('CB6 — use() at the cap returns {ok:false}, not {ok:true, L: INFEASIBLE}',
    u.ok === false && u.L !== RES.INFEASIBLE,
    `sink=${RES.balance(atCap, SINK, 'hb')} cap=6, balance still ${RES.balance(atCap, 'cand', 'hb')}`);
  check('CB6 — and a reusable resource is still free at any sink level',
    RES.use(RES.Ledger({ bal: { a: { skill: 1 } }, kind: { skill: 'reusable' } }), 'a', 'skill').ok === true);
}

// ── §4 · the authority boundary, enforced on one side and DECLARED on the other ─────────────
//
// R2.1 wrote "a declared, immutable cap" in a comment. The object was a plain `{}`. GPT-5.6's
// round-3 audit: "a comment saying immutable while returning a mutable object should not be
// treated as enforcement", and the observation generalises — `kind` and `bal` were equally open.
// The split shipped here is deliberate and it is asymmetric, so it is worth stating both halves:
// `kind` and `cap` are the AUTHORITY (what the rules are) and are frozen; `bal` is STATE and is
// not. A Ledger is a value, not a capability handle. LED-STATE-CONFINEMENT says exactly that, so
// nobody can later cite C9/C10 as tamper-proof against a caller that writes the balances.

console.log('\n§4 · authority (kind, cap) is frozen; balances are declared out of scope, not secured\n');
{
  const L = RES.Ledger({ bal: { cand: { hb: 20 }, [SINK]: { hb: 5 } }, kind: { hb: 'irreversible' }, cap: { hb: 6 } });

  // the pre-fix bypass Fable's witness performed, now against the shipped object
  let threw = false;
  try { L.cap.hb = 100; } catch { threw = true; }
  check('C11 — `L.cap.hb = 100` does not take (it throws under strict mode)', threw && L.cap.hb === 6);
  let threw2 = false;
  try { L.kind.hb = 'depletable'; } catch { threw2 = true; }
  check('C11 — `L.kind.hb = "depletable"` does not take either — C9 cannot be un-declared',
    threw2 && L.kind.hb === 'irreversible');
  check('C11 — and the cap still bites: sink 5 + 3 > 6', RES.spend(L, 'cand', 'hb', 3) === RES.INFEASIBLE);

  const after = RES.spend(L, 'cand', 'hb', 1);
  check('C11 — the seal survives the clone that every transfer makes',
    Object.isFrozen(after.cap) && Object.isFrozen(after.kind));
  check('declaring a NEW resource still works — `consolidate` builds a new authority object',
    RES.balance(RES.consolidate(L, 'T'), 'mind', 'know:T') === 1
    && RES.consolidate(L, 'T').kind['know:T'] === 'reusable');

  // …and the half that is NOT enforced, said out loud rather than left to be discovered
  const open = RES.Ledger({ bal: { cand: { hb: 1 }, [SINK]: { hb: 6 } }, kind: { hb: 'irreversible' }, cap: { hb: 6 } });
  check('DECLARED, not enforced: `L.bal[SINK].hb = 0` DOES take, and re-opens the gate',
    (() => { open.bal[SINK].hb = 0; return RES.feasible(open, 'cand', { hb: 1 }) === true; })(),
    'a Ledger is a value, not a capability handle — LED-STATE-CONFINEMENT records this as the boundary, and unforgeable balances are a different object');
}

// ── §5 · C9's quantifier is wrong, and §4's defence does not cover it (round 5) ──────────────
//
// LED-C9 said "the sink balance is non-decreasing under EVERY OPERATION". Its only evidence was a
// 2,000-trial property test. Round 5 typed that evidence — a property test is a bounded search over
// a generator's range, which is `exhaustion`, and exhaustion cannot discharge a universal — and
// went looking for what the generator does not reach.
//
// It reaches `transfer` and everything routed through it. It does not reach `consolidate` and
// `forget`, which write `M.bal[mind][...]` DIRECTLY, and whose `mind` account is a plain parameter.
// `forget(L, task, SINK)` therefore zeroes the sink balance of a resource that is, and REMAINS,
// declared irreversible.
//
// §4 above already records that a caller writing `L.bal[SINK].hb = 0` defeats C9, and declares that
// out of scope: a Ledger is a value, not a capability handle. THAT DEFENCE DOES NOT APPLY HERE. No
// invariant was reached around; the caller used an exported operation with permitted arguments. The
// distinction matters enough to be the whole finding, so it is asserted rather than described.
//
// The kernel is NOT changed this round — that is a shipped-kernel semantics change and it needs its
// own law, its own round, and a decision about whether `mind` should be refused or the write routed
// through `transfer`. What changes is the claim: LED-C9 is REFUTED as stated and LED-C9-MEDIATED
// carries the proposition that is actually true and actually proved.

console.log('\n§5 · C9 said "every operation", and two exported operations are not transfer-mediated\n');
{
  const res = 'know:audit';   // a `know:` resource is what `consolidate`/`forget` name
  const L = RES.Ledger({
    bal: { alice: { [res]: 0 }, [SINK]: { [res]: 5 } },
    kind: { [res]: 'irreversible' }, cap: { [res]: 10 },
  });

  check('the guarded path still refuses, exactly as C9 says it must',
    RES.transfer(L, res, SINK, 'alice', 1) === RES.INFEASIBLE);

  const M = RES.forget(L, 'audit', SINK);
  check('REFUTES LED-C9 — `forget(L, task, SINK)` takes the sink balance 5 → 0',
    RES.balance(M, SINK, res) === 0 && RES.balance(L, SINK, res) === 5);
  check('…and the resource is STILL declared irreversible afterwards, so the antecedent held throughout',
    M.kind[res] === 'irreversible');

  const N = RES.consolidate(L, 'audit', SINK);
  check('`consolidate(L, task, SINK)` also lands in the sink — 5 → 1 — while re-declaring the kind',
    RES.balance(N, SINK, res) === 1 && N.kind[res] === 'reusable',
    'a weaker instance of the same bypass: the balance moves AND the authority is rewritten by a spread');

  check('LED-C9-MEDIATED holds — no admissibleTransfer-mediated operation lowers the sink balance',
    [
      RES.transfer(L, res, SINK, 'alice', 1),
      RES.spend(L, SINK, res, 1),
      RES.refill(L, SINK, res, 1),
    ].every((r) => r === RES.INFEASIBLE || RES.balance(r, SINK, res) >= 5));
}

console.log(`\n${failures === 0 ? '✓' : '✗'} irreversible ledger: ${failures === 0 ? 'all checks hold' : failures + ' FAILED'}\n`);
process.exit(failures === 0 ? 0 : 1);
