#!/usr/bin/env node
/**
 * build.mjs — the patterns registry becomes a check (UNBOXED_PATTERNS.md P1).
 *
 *   node opensentience.org/_patterns/build/build.mjs            derive, refuse, emit dist/
 *   node opensentience.org/_patterns/build/build.mjs --verify   recompute and compare against dist/artifact.json; emit nothing
 *
 * INPUTS (four registries + receipts — CLAIM_LEDGER.json covers one lane only, see plan §1.1):
 *   _patterns/data/patterns.json         authored core          _invariants/data/cells.json   (read-only here)
 *   CLAIM_LEDGER.json (ProjectAmp2 root)  claim statuses         _patterns/receipts/*.json     execution identity
 *
 * DERIVED, never typed (the build refuses a record that carries them):
 *   CHECKABLE  witness present ∧ evidence_kind ∈ the ledger's own vocabulary
 *   RUNNABLE   witness.shape ∈ {suite, side-effect, lint}
 *   EXECUTED   a receipt exists for the SAME bytes (sha256) with exit 0 — or the witness IS a receipt document
 *   WITNESSED  kind == pattern ∧ EXECUTED ∧ rung ≥ in_tree ∧ every cited claim ∈ {PROVED, KNOWN, MEASURED, CONDITIONAL}
 *   STAGED     witness.staged ∧ the staged copy is byte-identical to the source (the site's own rule, run.js:6)
 *   label      null for definitions/anti-patterns · WITNESSED · STATED · PROPOSED   (plan §1.2)
 *
 * REFUSALS (exit 1, nothing emitted): P0 typed derived field · P1 unknown kind/family · P2 duplicate id ·
 *   P3 witness/counterexample path missing · P4 cell not in cells.json · P5 claim not in ledger ·
 *   P6 cited claim REFUTED · P7 WITNESSED without counterexample · P8 counterexample marker/sentence/count
 *   does not hold · P9 related/failure_mode id does not resolve · P10 rung not on the ladder ·
 *   P11 evidence_kind not in the ledger vocabulary.
 *
 * Emits opensentience.org/patterns/{index.html, <id>.html, demos/, patterns.derived.json, llms.txt, artifact.json}.
 * SERVED at /patterns — ruled by Travis 2026-09-11 (R4); the title Unboxed Patterns was ruled the same day (R1).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { execSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(HERE, '../..');            // opensentience.org
const ROOT = resolve(SITE, '..');               // ProjectAmp2
const VERIFY = process.argv.includes('--verify');
const rel = (p) => p.replace(ROOT + '/', '');
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const shaFile = (p) => sha(readFileSync(p));
const stampFor = (p) => shaFile(join(ROOT, p)).slice(0, 16);

const DATA = readJson(join(HERE, '../data/patterns.json'));
const CELLS = readJson(join(SITE, '_invariants/data/cells.json')).cells;
const LEDGER = readJson(join(ROOT, 'CLAIM_LEDGER.json'));
const RULES = readJson(join(ROOT, 'scripts/messaging-rules.json')).rules;
const RECEIPT_DIR = join(HERE, '../receipts');
const receipts = existsSync(RECEIPT_DIR) ? readdirSync(RECEIPT_DIR).filter((f) => f.endsWith('.json')).map((f) => readJson(join(RECEIPT_DIR, f))) : [];
// Live-run receipts (run-live.mjs): a staged witness executed from the DEPLOYED site, bound to the
// stamp the page itself printed. This is the only evidence the build has for the live_deployed rung.
const LIVE_DIR = join(RECEIPT_DIR, 'live');
const liveReceipts = new Map((existsSync(LIVE_DIR) ? readdirSync(LIVE_DIR).filter((f) => f.endsWith('.json')).map((f) => readJson(join(LIVE_DIR, f))) : []).map((r) => [r.for_pattern, r]));

const LADDER = ['spec', 'in_tree', 'live_local', 'live_deployed', 'external'];
const EVIDENCE_KINDS = new Set(LEDGER.claims.map((c) => c.evidence_kind).filter(Boolean));   // the ledger's vocabulary, not ours
const CLAIMS = new Map(LEDGER.claims.map((c) => [c.claim_id, c]));
const CELLNUMS = new Set(CELLS.map((c) => c.num));
const SUPPORT_OK = new Set(['PROVED', 'KNOWN', 'MEASURED', 'CONDITIONAL']);
const RUNNABLE = new Set(['suite', 'side-effect', 'lint']);
const DERIVED_FIELDS = ['label', 'CHECKABLE', 'RUNNABLE', 'EXECUTED', 'WITNESSED', 'STAGED', 'runs_on_page', 'REPRODUCED', 'PUBLISHED', 'next_rung_name', 'why'];
// v0.16 — prior art carries a RELATION, not a bibliography line (GPT review 2026-09-13, adopted).
// 'not-searched' is the tree's own case: a work named in the tree whose source was never opened.
const RELATIONS = new Set(['antecedent', 'close-analogue', 'partial-overlap', 'realization', 'contrasting-solution', 'terminology-precedent', 'not-searched']);
// A cited cell or claim states HOW it bears on the pattern. 'stronger_than_needed' is the fourth value
// GPT's three did not cover: the basis asserts more than the pattern requires (the Law 6 shape — the
// frontier package finds it TOO STRONG, which is not the same as 'true but insufficient').
const MODALITIES = new Set(['necessary', 'sufficient', 'not_sufficient', 'stronger_than_needed']);

const refusals = [];
const findings = [];
const refuse = (code, msg) => refusals.push(`${code}: ${msg}`);

const ids = new Set();
for (const p of [...DATA.patterns, ...DATA.anti_patterns]) {
  if (ids.has(p.id)) refuse('P2-DUPLICATE-ID', p.id); ids.add(p.id);
  for (const f of DERIVED_FIELDS) if (f in p) refuse('P0-TYPED-DERIVED', `${p.id} types ${f}`);
}
const antiIds = new Set(DATA.anti_patterns.map((a) => a.id));

function receiptFor(w) {
  const abs = join(ROOT, w.path);
  const current = existsSync(abs) ? shaFile(abs) : null;
  const rs = receipts.filter((r) => r.witness.path === w.path && r.witness.cmd === w.cmd);
  if (!rs.length) return { executed: false, why: 'no receipt' };
  const r = rs.sort((a, b) => b.execution_identity.started.localeCompare(a.execution_identity.started))[0];
  if (r.source_identity.sha256 !== current) return { executed: false, why: `receipt is for other bytes (${r.source_identity.sha256.slice(0, 12)} ≠ ${String(current).slice(0, 12)})`, receipt: r };
  if (r.execution_identity.exit !== 0) return { executed: false, why: `receipt exit ${r.execution_identity.exit}`, receipt: r };
  return { executed: true, receipt: r };
}

// A suite's own law index, asked of the suite rather than parsed out of it: `BB_LAW_INDEX=1 node <f>`
// prints {enforced, gaps, suites} from the same arrays it executes and exits before running a trial,
// so the index cannot describe a different suite than the one that runs. Suites without the hook
// return null and the build says so rather than treating an unresolvable id as resolved.
const lawIndexCache = new Map();
function lawIndexFor(abs) {
  if (lawIndexCache.has(abs)) return lawIndexCache.get(abs);
  let idx = null;
  try {
    const out = execSync(`BB_LAW_INDEX=1 node ${JSON.stringify(abs)}`, { cwd: dirname(abs), encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'ignore'] });
    const j = JSON.parse(out);
    if (Array.isArray(j.enforced)) idx = { enforced: j.enforced, gaps: j.gaps || [] };
  } catch { idx = null; }
  lawIndexCache.set(abs, idx);
  return idx;
}
const cexStrength = new Map();

function checkCounterexample(p) {
  const c = p.counterexample;
  if (!c) return;
  if (c.expected !== 'REFUSED') refuse('P8-COUNTEREXAMPLE', `${p.id}: expected must be REFUSED`);
  if (c.shape === 'lint') {
    const hit = RULES.some((r) => r.reject.some((ph) => c.sentence.toLowerCase().includes(ph.toLowerCase())));
    if (!hit) refuse('P8-COUNTEREXAMPLE', `${p.id}: sentence "${c.sentence}" is not rejected by any messaging rule`);
    return;
  }
  const abs = join(ROOT, c.path);
  if (!existsSync(abs)) { refuse('P3-PATH', `${p.id}: counterexample path missing: ${c.path}`); return; }
  if (c.shape === 'fixture') {
    const j = readJson(abs);
    const n = Array.isArray(j) ? j.length : Array.isArray(j.vectors) ? j.vectors.length : Object.keys(j).length;
    if (n !== c.expected_count) refuse('P8-COUNTEREXAMPLE', `${p.id}: fixture has ${n} vectors, record says ${c.expected_count}`);
    return;
  }
  if (c.shape === 'refusal' || c.shape === 'receipt') {
    const src = readFileSync(abs, 'utf8');
    if (!src.includes(c.marker)) { refuse('P8-COUNTEREXAMPLE', `${p.id}: marker "${c.marker}" not found in ${c.path}`); return; }
    // A GREP MARKER PROVES MENTION, NOT MEANING. v0.4 used CD2's FAILURE string as CD1's marker —
    // a string that must NOT appear, cited as evidence that it does. A `law` id can be resolved
    // against the suite's OWN exported index (emitted from the arrays the suite executes), and the
    // marker can be pinned to that law's declaration line, which is where its statement lives.
    const occurrences = src.split(c.marker).length - 1;
    // THREE LEVELS, and they are independent checks rather than one. Scoping a marker to its law
    // needs only the file; resolving the id needs the suite to export an index, and only
    // compose-laws.mjs does. Requiring both to run together is what let a second record keep the
    // very defect P28 exists for: capability-bounded-composition's marker was 'should refuse',
    // which is the string L10 returns WHEN IT FAILS — a law's failure tag cited as evidence that
    // the law holds, exactly the v0.4 bug in a record that carried no law id and so was never checked.
    let strength = 'marker';
    if (c.law) {
      const lines = src.split('\n');
      const line = lines.findIndex((l) => new RegExp(`\\[\\s*['"]${c.law.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]\\s*,`).test(l));
      if (line < 0) refuse('P27-LAW', `${p.id}: law ${c.law} has no declaration in ${c.path}`);
      else if (!lines[line].includes(c.marker)) refuse('P28-MARKER-SCOPE', `${p.id}: the marker is in ${c.path} but NOT on ${c.law}'s own declaration line (${line + 1}) — it may belong to a different law, or be that law's FAILURE tag, which is the defect this check exists for`);
      else {
        strength = 'scoped';
        const idx = lawIndexFor(abs);
        if (!idx) findings.push(`${p.id}: the marker is scoped to ${c.law}'s declaration, but ${c.path} exports no law index (BB_LAW_INDEX) — the id itself could not be resolved against the suite that runs`);
        else if (idx.gaps.includes(c.law)) refuse('P27-LAW', `${p.id}: law ${c.law} is a DECLARED-OPEN gap in ${c.path} — it is FALSIFIED by design and cannot be a counterexample's authority`);
        else if (!idx.enforced.includes(c.law)) refuse('P27-LAW', `${p.id}: law ${c.law} is not in ${c.path}'s own index (${idx.enforced.length} enforced, ${idx.gaps.length} open)`);
        else strength = 'resolved';
      }
    }
    if (occurrences > 1) findings.push(`${p.id}: marker "${c.marker}" occurs ${occurrences}× in ${c.path} — it does not pick out one place, so it is weaker evidence than a resolved law id`);
    cexStrength.set(p.id, { strength, occurrences, law: c.law || null });
    return;
  }
  refuse('P8-COUNTEREXAMPLE', `${p.id}: unknown counterexample shape ${c.shape}`);
}

// PUBLICATION standing, derived and not typed. GPT proposed an editorial draft/review/stable word;
// this tree already refuses typed status, so the fact is read off the artifact of the LAST build that
// was committed: a page either was in it or was not. Nothing here asks an author how published a page is.
const PRIOR_ARTIFACT = (() => {
  const f = join(SITE, 'patterns/artifact.json');
  if (!existsSync(f)) return null;
  try { return readJson(f); } catch { return null; }
})();
const PUBLISHED_IDS = new Set(Object.keys((PRIOR_ARTIFACT && PRIOR_ARTIFACT.outputs) || {}).filter((k) => k.endsWith('.html')).map((k) => k.replace(/\.html$/, '')));

// P25 — a lint counterexample must PRINT the retired phrase to be one, so it carries a
// `lint-allow:<RULE>` marker that the prose gate reads LINE BY LINE. A JSON re-dump that pretty-prints
// the object splits the marker off the sentence's line and the gate then fails on our own registry.
// That happened on the v0.16 migration; this refuses it rather than letting the next re-dump repeat it.
{
  const raw = readFileSync(join(HERE, '../data/patterns.json'), 'utf8').split('\n');
  for (const p of DATA.patterns) {
    const c = p.counterexample;
    if (!c || !c.lint_allow) continue;
    const line = raw.find((l) => l.includes(JSON.stringify(c.sentence).slice(1, -1)));
    if (line && !line.includes(c.lint_allow.split(' ')[0])) refuse('P25-LINT-ALLOW-SPLIT', `${p.id}: the lint-allow marker is not on the same line as the sentence it allows — the prose gate reads lines, so re-dumping this file split the allow from its phrase`);
  }
}

// `related` reads as symmetric — "Relations with other patterns" — but it was authored on one side
// only, and 10 of the edges pointed one way: a reader on locus-is-not-its-carrier was never told that
// active-locus points at it. Requiring both sides to be typed is a second place for the same fact, so
// the closure is DERIVED and the authored field stays a single mention. P29 guards the one case the
// closure cannot fix: a related id that does not resolve.
const RELATED_CLOSURE = new Map(DATA.patterns.map((p) => [p.id, new Set(p.related || [])]));
for (const p of DATA.patterns) for (const r of p.related || []) if (RELATED_CLOSURE.has(r)) RELATED_CLOSURE.get(r).add(p.id);

const ups = new Map();
const derived = [];
for (const p of DATA.patterns) {
  if (!['definition', 'pattern'].includes(p.kind)) refuse('P1-KIND', `${p.id}: ${p.kind}`);
  if (!DATA.families.includes(p.family)) refuse('P1-FAMILY', `${p.id}: ${p.family}`);
  if (!/^UP-\d{3}$/.test(p.up || '')) refuse('P20-UP-ID', `${p.id}: up must be UP-nnn, got ${JSON.stringify(p.up)}`);
  if (ups.has(p.up)) refuse('P20-UP-ID', `${p.id}: duplicate ${p.up} (also ${ups.get(p.up)})`); else ups.set(p.up, p.id);
  if (p.kind === 'pattern' || p.kind === 'definition') {
    for (const f of ['limit', 'next_rung']) if (!p[f] || !String(p[f]).trim()) refuse('P22-HONESTY', `${p.id}: ${f} is required — a record must state what it does not establish`);
    const pa = p.prior_art;
    if (!pa || typeof pa !== 'object' || !Array.isArray(pa.works)) refuse('P21-PRIOR-ART', `${p.id}: prior_art must be {works:[…], novelty_not_claimed}`);
    else {
      if (!pa.novelty_not_claimed || !String(pa.novelty_not_claimed).trim()) refuse('P21-PRIOR-ART', `${p.id}: prior_art.novelty_not_claimed is required — it is the field that prevents pseudo-novelty`);
      for (const wk of pa.works) {
        if (!RELATIONS.has(wk.relation)) refuse('P21-PRIOR-ART', `${p.id}: relation ${JSON.stringify(wk.relation)} not in [${[...RELATIONS].join(', ')}]`);
        for (const f of ['work', 'overlap', 'difference']) if (!wk[f]) refuse('P21-PRIOR-ART', `${p.id}: prior art entry missing ${f}`);
      }
    }
  }
  for (const b of p.cells || []) {
    if (typeof b === 'string') { refuse('P23-BASIS-MODALITY', `${p.id}: cell ${b} carries no modality — a basis states HOW it bears, never by default`); continue; }
    if (!CELLNUMS.has(b.ref)) refuse('P4-CELL', `${p.id}: cell ${b.ref} not in cells.json`);
    if (!MODALITIES.has(b.modality)) refuse('P23-BASIS-MODALITY', `${p.id}: cell ${b.ref} modality ${JSON.stringify(b.modality)} not in [${[...MODALITIES].join(', ')}]`);
  }
  const claimStatuses = [];
  for (const b of p.claims || []) {
    if (typeof b === 'string') { refuse('P23-BASIS-MODALITY', `${p.id}: claim ${b} carries no modality`); continue; }
    if (!MODALITIES.has(b.modality)) refuse('P23-BASIS-MODALITY', `${p.id}: claim ${b.ref} modality ${JSON.stringify(b.modality)} not in [${[...MODALITIES].join(', ')}]`);
    const c = CLAIMS.get(b.ref);
    if (!c) { refuse('P5-CLAIM', `${p.id}: ${b.ref} not in CLAIM_LEDGER.json`); continue; }
    if (c.status === 'REFUTED') refuse('P6-REFUTED-SUPPORT', `${p.id} cites ${b.ref}, which is REFUTED`);
    claimStatuses.push(c.status);
  }
  for (const id of p.claims_related || []) if (!CLAIMS.has(id)) refuse('P5-CLAIM', `${p.id}: related claim ${id} not in ledger`);
  for (const id of p.related || []) if (!ids.has(id)) refuse('P9-RELATED', `${p.id} → ${id}`);
  if (p.failure_mode && !antiIds.has(p.failure_mode)) refuse('P9-FAILURE-MODE', `${p.id} → ${p.failure_mode}`);

  const w = p.witness;
  let CHECKABLE = false, RUNNABLE_ = false, EXECUTED = false, STAGED = false, exec = null, rungOk = false;
  if (w) {
    if (!existsSync(join(ROOT, w.path))) refuse('P3-PATH', `${p.id}: witness path missing: ${w.path}`);
    if (!LADDER.includes(w.rung)) refuse('P10-RUNG', `${p.id}: ${w.rung}`);
    if (w.evidence_kind && !EVIDENCE_KINDS.has(w.evidence_kind)) refuse('P11-EVIDENCE-KIND', `${p.id}: ${w.evidence_kind} not in ledger vocabulary [${[...EVIDENCE_KINDS].join(', ')}]`);
    CHECKABLE = !!w.evidence_kind;
    RUNNABLE_ = RUNNABLE.has(w.shape);
    rungOk = LADDER.indexOf(w.rung) >= LADDER.indexOf('in_tree');
    if (RUNNABLE_) { exec = receiptFor(w); EXECUTED = exec.executed; }
    else if (w.shape === 'receipt') { EXECUTED = true; exec = { executed: true, why: 'the witness is itself an execution record', at: w.receipt_at }; }
    else exec = { executed: false, why: `shape ${w.shape} carries no execution` };
    if (w.staged) {
      const s = join(ROOT, w.staged_path);
      if (!existsSync(s)) findings.push(`${p.id}: staged_path missing: ${w.staged_path}`);
      else if (shaFile(s) !== shaFile(join(ROOT, w.path))) findings.push(`${p.id}: STAGED COPY HAS DRIFTED from source — not counted as staged`);
      else STAGED = true;
    }
  }
  // The RUNG was the last hand-typed status word in this catalog, and typing it is how two records
  // came to understate what the site already did. It is now DERIVED from what the build can see, and
  // P26 refuses an authored rung that disagrees. Note the consequence, which is deliberate: `external`
  // is never derivable, so reaching it needs a new kind of receipt — never a word typed into the file.
  let LIVE_RUN = null;
  if (w && STAGED) {
    const lr = liveReceipts.get(p.id);
    if (lr && lr.source_identity.stamp === stampFor(w.staged_path)) LIVE_RUN = lr;
    else if (lr) findings.push(`${p.id}: a live-run receipt exists but its stamp ${lr.source_identity.stamp} is not the staged bytes ${stampFor(w.staged_path)} — the witness was restaged after the run; re-run run-live.mjs`);
  }
  const derivedRung = !w ? null
    : LIVE_RUN ? 'live_deployed'
      : w.shape === 'spec' ? 'spec'
        : existsSync(join(ROOT, w.path)) ? 'in_tree' : 'spec';
  if (w && w.rung !== derivedRung) {
    const dir = LADDER.indexOf(w.rung) > LADDER.indexOf(derivedRung) ? 'OVERSTATES' : 'UNDERSTATES';
    const why = w.rung === 'external' ? 'external cannot be derived here — outside reproduction needs a receipt kind that does not exist yet, not a word typed into this file'
      : derivedRung === 'live_deployed' ? 'a live-run receipt binds this witness to the deployed site'
        : LIVE_RUN === null && STAGED ? 'no live-run receipt matches the staged bytes — run run-live.mjs, or the claim is about a run nobody made'
          : `the witness path ${existsSync(join(ROOT, w.path)) ? 'resolves in the tree' : 'does not resolve'}`;
    refuse('P26-RUNG', `${p.id}: the authored rung "${w.rung}" ${dir} what the build derives ("${derivedRung}") — ${why}`);
  }
  const supportOk = claimStatuses.every((s) => SUPPORT_OK.has(s));
  let label = null;
  if (p.kind === 'pattern') {
    if (w && EXECUTED && rungOk && supportOk) label = 'WITNESSED';
    else if (w || (p.realizations || []).length || claimStatuses.length) label = 'STATED';
    else label = 'PROPOSED';
  }
  if (label === 'WITNESSED' && !p.counterexample) refuse('P7-NO-COUNTEREXAMPLE', `${p.id} is WITNESSED and ships no counterexample`);
  checkCounterexample(p);
  if (w && RUNNABLE_ && !EXECUTED) findings.push(`${p.id}: check exists but is not EXECUTED — ${exec.why}`);

  // The label's DERIVATION, printed on the page. GPT's ask, adopted: a page may not simply assert
  // WITNESSED because a field says so — it shows the conjuncts and which one failed.
  const why = p.kind !== 'pattern'
    ? [{ ok: null, text: `kind is ${p.kind} — carries no evidence rung (AGENCY.md §6)` }]
    : [
      { ok: !!w, text: 'a witness is named' },
      { ok: !!(w && w.evidence_kind), text: `its evidence kind is one the ledger already uses${w && w.evidence_kind ? ` (${w.evidence_kind})` : ''}` },
      { ok: !!(w && w.path && existsSync(join(ROOT, w.path))), text: 'the witness path resolves in this tree' },
      { ok: rungOk, text: `its rung is in_tree or above${w ? ` (${w.rung})` : ''}` },
      { ok: EXECUTED, text: `a run is recorded for these exact bytes${exec && !exec.executed ? ` — ${exec.why}` : ''}` },
      { ok: supportOk, text: claimStatuses.length ? `every cited claim is PROVED/KNOWN/MEASURED/CONDITIONAL (${claimStatuses.join(', ')})` : 'no claim is cited that could be REFUTED' },
      { ok: !!p.counterexample, text: 'a counterexample is shipped (required once WITNESSED)' },
      { ok: !!LIVE_RUN, text: LIVE_RUN ? `it has run from the deployed site — ${LIVE_RUN.execution_identity.status}` : (STAGED ? 'it has NOT been run from the deployed site (staged, so it could be)' : 'not staged on this site, so it cannot run from the page') },
    ];
  // REPRODUCED — the ladder's top rung, and nothing in this tree has reached it. The field exists so
  // that the absence is visible on every page rather than inferred from the absence of a field.
  const REPRODUCED = !!(w && w.rung === 'external');
  const li = w ? LADDER.indexOf(w.rung) : -1;
  const next_rung_name = li < 0 ? 'in_tree' : (li + 1 < LADDER.length ? LADDER[li + 1] : null);
  // P24 — the next rung is DERIVED from the ladder; the prose beside it says what would reach it.
  // If that prose names a rung at all it must name the same one, or the page states the ladder twice
  // and disagrees with itself. This gate caught three records on the pass that introduced it.
  if (p.next_rung) {
    const named = LADDER.filter((r) => new RegExp(`\\b${r}\\b`).test(p.next_rung));
    for (const r of named) if (r !== next_rung_name) refuse('P24-NEXT-RUNG', `${p.id}: next_rung prose names "${r}" but the ladder derives "${next_rung_name}" from rung "${w ? w.rung : '(none)'}"`);
  }
  // Not a refusal, a finding: a witness that is staged AND served already ran from a deployed page,
  // so an authored rung of in_tree understates where it actually stands. Rungs are authored per
  // witness and re-adjudicating them is its own pass — this records that the pass is owed.
  if (w && STAGED && PUBLISHED_IDS.has(p.id) && w.rung === 'in_tree') findings.push(`${p.id}: witness is STAGED and the page is served, yet its rung is authored in_tree — the ladder position is understated (rung re-adjudication owed)`);

  derived.push({ ...p, derived: { label, CHECKABLE, RUNNABLE: RUNNABLE_, EXECUTED, STAGED, REPRODUCED, PUBLISHED: PUBLISHED_IDS.has(p.id), next_rung_name, why, related_closure: [...RELATED_CLOSURE.get(p.id)].filter((x) => x !== p.id).sort(), live_run: LIVE_RUN ? { at: LIVE_RUN.execution_identity.finished, url: LIVE_RUN.execution_identity.url, status: LIVE_RUN.execution_identity.status, stamp: LIVE_RUN.source_identity.stamp } : null, counterexample_strength: cexStrength.get(p.id) || null, execution: exec && exec.receipt ? { at: exec.receipt.execution_identity.started, host: exec.receipt.execution_identity.host, sha256: exec.receipt.source_identity.sha256, repo_head: exec.receipt.source_identity.repo_head } : (exec && exec.at ? { at: exec.at, note: exec.why } : null), claim_statuses: claimStatuses, cell_statuses: (p.cells || []).map((b) => ({ num: b.ref, modality: b.modality, status: CELLS.find((c) => c.num === b.ref).status })) } });
}
for (const a of DATA.anti_patterns) for (const f of ['label']) if (f in a) refuse('P0-TYPED-DERIVED', a.id);

// CROSS-RECORD CONSISTENCY. Each record was written on its own and the registry never compared them,
// so two patterns could describe the same prior work as an antecedent and a contrasting solution, or
// the same cell as necessary here and stronger-than-needed there. Both would be a disagreement about
// a shared fact, which is the failure this whole catalog is built against — it just had no place to
// show up. Both find 0 today; each was proven to refuse by injection.
{
  const workKey = (w) => w.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 40);
  const works = new Map(), basis = new Map();
  for (const p of derived) {
    for (const w of (p.prior_art && p.prior_art.works) || []) {
      const k = workKey(w.work);
      if (!works.has(k)) works.set(k, []);
      works.get(k).push({ id: p.id, relation: w.relation, work: w.work });
    }
    for (const [kind, list] of [['cell', p.cells || []], ['claim', p.claims || []]]) {
      for (const b of list) {
        const k = `${kind} ${b.ref}`;
        if (!basis.has(k)) basis.set(k, []);
        basis.get(k).push({ id: p.id, modality: b.modality });
      }
    }
  }
  for (const [k, v] of works) {
    const rels = [...new Set(v.map((x) => x.relation))];
    if (rels.length > 1) refuse('P30-PRIOR-ART-CONFLICT', `"${v[0].work}" is cited as ${rels.join(' and ')} by ${v.map((x) => x.id).join(', ')} — one work, one relation to this catalog, or the difference has to be stated`);
  }
  for (const [k, v] of basis) {
    const mods = [...new Set(v.map((x) => x.modality))];
    if (mods.length > 1) refuse('P31-BASIS-CONFLICT', `${k} bears as ${mods.join(' and ')} across ${v.map((x) => x.id).join(', ')} — the same basis cannot bear two ways without saying why`);
  }
}

if (refusals.length) { console.error(`\n✗ ${refusals.length} refusal(s):\n  ` + refusals.join('\n  ')); process.exit(1); }

// THE CORPUS AS A TYPED GRAPH. GPT's proposal, 2026-09-13: don't store the prose, represent what
// each record is attached to, and let the book's order be one traversal of it rather than the thing
// itself. Everything here is derived from the registry — there is no second place to author an edge,
// and P30/P31 already refuse the two ways two records can disagree about a shared node.
const graph = (() => {
  const nodes = [], edges = [], seen = new Set();
  const node = (id, type, extra = {}) => { if (seen.has(id)) return id; seen.add(id); nodes.push({ id, type, ...extra }); return id; };
  const edge = (from, rel, to, extra = {}) => edges.push({ from, rel, to, ...extra });
  const workId = (w) => 'work:' + w.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  for (const p of derived) {
    node(p.id, p.kind, { up: p.up, name: p.name, family: p.family, standing: p.derived.label, url: `/patterns/${p.id}` });
  }
  for (const a of DATA.anti_patterns) node('anti:' + a.id, 'anti_pattern', { name: a.name });
  for (const p of derived) {
    for (const b of p.cells || []) { node('cell:' + b.ref, 'cell', { status: (CELLS.find((c) => c.num === b.ref) || {}).status }); edge(p.id, 'CITES_CELL', 'cell:' + b.ref, { modality: b.modality }); }
    for (const b of p.claims || []) { node('claim:' + b.ref, 'claim', { status: (CLAIMS.get(b.ref) || {}).status }); edge(p.id, 'CITES_CLAIM', 'claim:' + b.ref, { modality: b.modality }); }
    for (const w of (p.prior_art && p.prior_art.works) || []) { node(workId(w.work), 'prior_art', { work: w.work }); edge(p.id, 'PRIOR_ART', workId(w.work), { relation: w.relation }); }
    for (const r of p.derived.related_closure) edge(p.id, 'RELATED_TO', r, { authored_here: (p.related || []).includes(r) });
    for (const r of p.realizations || []) { node('impl:' + r, 'realization', { at: r }); edge(p.id, 'REALIZED_IN', 'impl:' + r); }
    if (p.failure_mode) edge(p.id, 'ANSWERS', 'anti:' + p.failure_mode);
    if (p.witness) { node('witness:' + p.witness.path, 'witness', { shape: p.witness.shape, rung: p.witness.rung }); edge(p.id, 'WITNESSED_BY', 'witness:' + p.witness.path, { executed: p.derived.EXECUTED, live_run: !!p.derived.live_run }); }
    if (p.counterexample) edge(p.id, 'REFUTED_BY', 'cex:' + p.id, { strength: (p.derived.counterexample_strength || {}).strength || 'none', law: (p.counterexample || {}).law || null });
  }
  const byRel = {};
  for (const e of edges) byRel[e.rel] = (byRel[e.rel] || 0) + 1;
  return { kind: 'UNBOXED_PATTERNS_GRAPH', derived_from: 'data/patterns.json + cells.json + CLAIM_LEDGER.json + receipts', counts: { nodes: nodes.length, edges: edges.length, by_relation: byRel }, nodes, edges };
})();


// ── counts, derived ────────────────────────────────────────────────────────────
const count = (f) => derived.filter(f).length;
const summary = {
  patterns: DATA.patterns.length, definitions: count((p) => p.kind === 'definition'), anti_patterns: DATA.anti_patterns.length,
  WITNESSED: count((p) => p.derived.label === 'WITNESSED'), STATED: count((p) => p.derived.label === 'STATED'), PROPOSED: count((p) => p.derived.label === 'PROPOSED'),
  CHECKABLE: count((p) => p.derived.CHECKABLE), RUNNABLE: count((p) => p.derived.RUNNABLE), EXECUTED: count((p) => p.derived.EXECUTED), STAGED: count((p) => p.derived.STAGED),
  PUBLISHED: count((p) => p.derived.PUBLISHED), REPRODUCED: count((p) => p.derived.REPRODUCED),
  counterexamples_resolved: count((p) => p.derived.counterexample_strength && p.derived.counterexample_strength.strength === 'resolved'), counterexamples_scoped: count((p) => p.derived.counterexample_strength && p.derived.counterexample_strength.strength === 'scoped'), counterexamples_marker_only: count((p) => p.derived.counterexample_strength && p.derived.counterexample_strength.strength === 'marker'),
  prior_art_works: derived.reduce((n, p) => n + ((p.prior_art && p.prior_art.works) || []).length, 0),
  prior_art_not_searched: derived.reduce((n, p) => n + ((p.prior_art && p.prior_art.works) || []).filter((w) => w.relation === 'not-searched').length, 0),
  invariant_null: count((p) => p.kind === 'pattern' && !p.invariant),
  by_family: Object.fromEntries(DATA.families.map((f) => [f, count((p) => p.family === f)])),
  witnessed_ids: derived.filter((p) => p.derived.label === 'WITNESSED').map((p) => p.id),
};
const heads = Object.fromEntries(['.', 'opensentience.org', 'WRL', 'TRVM', 'AmpersandBoxDesign', 'graphonomous', 'computedriven', 'super'].map((d) => { try { return [d, execSync('git rev-parse HEAD', { cwd: join(ROOT, d), stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()]; } catch { return [d, null]; } }));

// ── emit ───────────────────────────────────────────────────────────────────────
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const row = (p) => `<tr><td><a href="${p.id}.html"><code>${p.id}</code></a></td><td>${esc(p.name)}</td><td>${p.family}</td><td class="l ${p.derived.label || 'none'}">${p.derived.label ?? '—'}</td><td>${['CHECKABLE', 'RUNNABLE', 'EXECUTED', 'STAGED'].filter((k) => p.derived[k]).join(' ') || '—'}</td><td>${p.witness ? `<code>${esc(p.witness.path)}</code> <small>${p.witness.shape} · ${p.witness.rung}</small>` : '—'}</td><td>${esc(p.invariant ?? (p.kind === 'definition' ? '(definition)' : '(no invariant — gap/open)'))}</td></tr>`;
// ── pattern pages: refactoring.guru's rhythm over a derived record ─────────────────────────────
// A RUN BUTTON MAY NOT OUTRUN ITS EVIDENCE (the invariants build's R28, extended): a page offers a run
// button only when the witness is STAGED byte-identical under /witness/src/; a demo module for a pattern
// whose witness is not staged is refused (P12). A scene (animation) is an ILLUSTRATION and may exist for
// any record; the page labels it so. A syntax excerpt is quoted from the file at build time (P13 refuses a
// start marker that is not found) so the page cannot show code the tree does not contain.
const DEMOS = join(HERE, '../demos'), SCENES = join(HERE, '../scenes'), SURFACE = join(HERE, '../surface/surface.mjs');
const SF = await import(SURFACE);
const RUNJS_STAMP = shaFile(join(SITE, 'witness/run.js')).slice(0, 16);
const SF_STAMP = shaFile(SURFACE).slice(0, 16);
for (const p of derived) {
  if (existsSync(join(DEMOS, p.id + '.mjs')) && !p.derived.STAGED) refuse('P12-DEMO-WITHOUT-STAGED-WITNESS', `${p.id} has a demo module but its witness is not staged on this site`);
  if (p.scene && !existsSync(join(SCENES, p.scene + '.json'))) refuse('P13-SCENE-MISSING', `${p.id}: scenes/${p.scene}.json`);
  for (const x of p.syntax || []) {
    const abs = join(ROOT, x.path);
    if (!existsSync(abs)) { refuse('P13-SYNTAX-PATH', `${p.id}: ${x.path}`); continue; }
    if (!readFileSync(abs, 'utf8').includes(x.start)) refuse('P13-SYNTAX-START', `${p.id}: start marker not found in ${x.path}: ${JSON.stringify(x.start)}`);
  }
}
// ── WRL: seal every scene's world with WRL's own wrl.js, at build (P10 stage A) ───────────────
// The id a page prints was computed from these bytes by the same module the WRL playground runs. A world
// declared `world` must seal; a world declared `refused` must be refused (P14 either way). Reduction to a
// Film lives in TRVM, so nothing here runs a world — the page says so.
const WRLJS = join(ROOT, 'WRL/wrl.js');
const WRL = await import(WRLJS);
const WRL_DIR = join(HERE, '../wrl');
const WRLJS_SHA = shaFile(WRLJS);
const sealed = new Map();   // file → result
async function sealFile(f, expectOk) {
  const abs = join(WRL_DIR, f);
  if (!existsSync(abs)) { refuse('P14-WRL-MISSING', f); return null; }
  const src = readFileSync(abs, 'utf8');
  const r = await WRL.sealWorld(src);
  if (expectOk && !r.ok) refuse('P14-WRL-REFUSED', `${f}: ${r.code} — ${r.message}`);
  if (!expectOk && r.ok) refuse('P14-WRL-SEALED', `${f} was declared refused and sealed to ${r.semanticId}`);
  sealed.set(f, { src, r });
  return r;
}
for (const p of derived) {
  const w = p.wrl || {};
  if (w.world) await sealFile(w.world, true);
  if (w.variant) await sealFile(w.variant, true);
  if (w.refused) await sealFile(w.refused, false);
}
// ── Films: the forge's receipts, admitted only for the exact world bytes and a matching id (P15) ────
const FILMS_DIR = join(HERE, '../films');
const filmReceipts = existsSync(FILMS_DIR) ? readdirSync(FILMS_DIR).filter((f) => f.endsWith('.json')).map((f) => readJson(join(FILMS_DIR, f))) : [];
const films = new Map();   // world file → receipt (validated)
for (const p of derived) {
  const w = p.wrl; if (!w || !w.world || !w.film) continue;
  const key = shaFile(join(WRL_DIR, w.world));
  const rc = filmReceipts.find((r) => r.source_identity.world_sha256 === key);
  if (!rc) { findings.push(`${p.id}: world ${w.world} declares a film and no receipt exists for these bytes — run run-films.mjs`); continue; }
  const S = sealed.get(w.world);
  if (S && S.r.ok && rc.forge.semantic_artifact_id !== S.r.semanticId) { refuse('P15-FILM-ID-MISMATCH', `${p.id}: forge sealed ${rc.forge.semantic_artifact_id}, wrl.js sealed ${S.r.semanticId}`); continue; }
  films.set(w.world, rc);
}
// ── The chain (P10 stage D): every chapter a fragment, the cumulative world sealed step by step ─────
// A chapter's WRL is its fragment (self-contained: it seals and reduces alone) plus links that only the
// cumulative world carries. P17 refuses a cumulative step that is not a superset of the one before it; P18
// refuses a chapter whose determinism run disagreed with itself. Missing films are findings, not refusals.
const CH = await import(join(HERE, 'chain.mjs'));
const chainIds = CH.order().filter((id) => CH.fragment(id));
const chainGroups = Object.fromEntries(chainIds.map((id) => { const m = (CH.fragment(id) || '').match(/\[[a-z]+:([a-z0-9]+)_/); const rec = DATA.patterns.find((p) => p.id === id); return m && rec ? [m[1], rec.family] : null; }).filter(Boolean));
const chainBands = DATA.families.map((f) => ({ id: f, label: ({ locus: 'I · The Locus', composition: 'II · Composition', progress: 'III · Progress', world: 'IV · Persistence and World', agency: 'V · Agency' })[f] || f }));
const chainRowOrder = chainIds.map((id) => { const m = (CH.fragment(id) || '').match(/\[[a-z]+:([a-z0-9]+)_/); return m ? m[1] : null; }).filter(Boolean);
const chain = new Map();   // id → { delta, cum, prevCum, links, scenario, film, deltaSrc, index }
{ let prev = null;
  for (let i = 0; i < chainIds.length; i++) {
    const id = chainIds[i];
    const deltaSrc = CH.deltaSource(id); const delta = await WRL.sealWorld(deltaSrc);
    if (!delta.ok) refuse('P14-WRL-REFUSED', `chain/${id}.wrl: ${delta.code} — ${delta.message}`);
    const cum = await WRL.sealWorld(CH.cumulativeSource(chainIds.slice(0, i + 1)));
    if (!cum.ok) refuse('P14-WRL-REFUSED', `chain through ${id}: ${cum.code} — ${cum.message}`);
    if (prev && cum.ok) { const N = new Set(cum.graph.nodes.map((n) => n[1])), E = new Set(cum.graph.edges.map((e) => e.join('>'))); if (!prev.graph.nodes.every((n) => N.has(n[1])) || !prev.graph.edges.every((e) => E.has(e.join('>')))) refuse('P17-CHAIN-NOT-SUPERSET', `${id}: the cumulative world drops something the chapter before it had`); }
    const key = sha(Buffer.from(deltaSrc)); const rc = filmReceipts.find((r) => r.source_identity.world_sha256 === key);
    if (rc && delta.ok && rc.forge.semantic_artifact_id !== delta.semanticId) refuse('P15-FILM-ID-MISMATCH', `chain/${id}: forge ${rc.forge.semantic_artifact_id} ≠ wrl.js ${delta.semanticId}`);
    if (rc && rc.determinism && !rc.determinism.identical) refuse('P18-REPLAY-DIVERGED', `chain/${id}: the second reduction did not reproduce the first`);
    if (rc && rc.parity && !rc.parity.failed && !rc.parity.identical) refuse('P19-REDUCERS-DISAGREE', `chain/${id}: ${rc.execution_identity.reducer} and ${rc.parity.other_reducer} produced different films`);
    if (!rc && delta.ok && delta.graph.nodes.length) findings.push(`chain/${id}: no film receipt for these bytes — run run-films.mjs chain`);
    chain.set(id, { index: i, delta, cum, prevCum: prev, links: CH.links(id), scenario: CH.scenario(id), meta: CH.filmMeta(id), bench: CH.bench(id), film: rc || null, deltaSrc, fragment: CH.fragment(id) });
    if (cum.ok) prev = cum;
  } }
const conclusionSrc = existsSync(join(CH.CHAIN, '_conclusion.wrl')) ? readFileSync(join(CH.CHAIN, '_conclusion.wrl'), 'utf8') : null;
const conclusionSeal = conclusionSrc ? await WRL.sealWorld(conclusionSrc) : null;
const conclusionFilm = conclusionSrc ? filmReceipts.find((r) => r.source_identity.world_sha256 === sha(Buffer.from(conclusionSrc))) || null : null;
if (conclusionSeal && conclusionFilm && conclusionSeal.ok && conclusionFilm.forge.semantic_artifact_id !== conclusionSeal.semanticId) refuse('P15-FILM-ID-MISMATCH', `conclusion: forge ≠ wrl.js`);
if (conclusionFilm && conclusionFilm.parity && !conclusionFilm.parity.failed && !conclusionFilm.parity.identical) refuse('P19-REDUCERS-DISAGREE', 'conclusion: the two reducers produced different films');
const reducerLine = (rc) => `${rc.execution_identity.reducer === 'native_reduce' ? 'the native reducer (ic32)' : 'the reference reducer (pure Python)'}${rc.parity ? (rc.parity.failed ? '; the other reducer\'s run failed' : rc.parity.identical ? `; <b>${rc.parity.other_reducer === 'native_reduce' ? 'the native reducer' : 'the reference reducer'} reproduces every epoch\'s film hash</b> (${rc.parity.seconds}s)` : '; THE REDUCERS DISAGREE') : '; parity with the other reducer not run for this world'}`;
if (conclusionSrc && !conclusionFilm) findings.push('conclusion: no film receipt for the whole chain — run run-films.mjs conclusion');
if (refusals.length) { console.error(`\n✗ ${refusals.length} refusal(s):\n  ` + refusals.join('\n  ')); process.exit(1); }
const byId = new Map(derived.map((p) => [p.id, p]));
const antiById = new Map(DATA.anti_patterns.map((a) => [a.id, a]));
const ORDER = DATA.families.flatMap((f) => derived.filter((p) => p.family === f));
const FAMILY_TITLE = { locus: 'The Locus', composition: 'Composition', progress: 'Progress', world: 'Persistence and World', agency: 'Agency' };
const sceneOf = (p) => p.scene ? JSON.parse(readFileSync(join(SCENES, p.scene + '.json'), 'utf8')) : null;
const thumb = (p) => { const sc = sceneOf(p); return sc ? SF.svg(SF.computeState(sc, 0), { thumb: true }) : ''; };
const excerpt = (x) => { const lines = readFileSync(join(ROOT, x.path), 'utf8').split('\n'); const i = lines.findIndex((l) => l.includes(x.start)); return { from: i + 1, text: lines.slice(i, i + (x.count || 6)).join('\n') }; };
const para = (t) => t ? `<p>${esc(t)}</p>` : '';
const list = (xs) => xs && xs.length ? `<ul>${xs.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
const chip = (p) => `<span class="chip ${p.derived.label || 'none'}">${p.derived.label ?? p.kind}</span>`;
const sidebar = (cur) => `<aside class="side" role="navigation" aria-label="catalog"><a class="side-home" href="./">Unboxed Patterns</a><div class="side-fam">Front</div><ul><li><a href="./">Catalog</a></li><li class="${cur === 'conclusion' ? 'cur' : ''}"><a href="conclusion.html">Conclusion</a></li></ul>${DATA.families.map((f) => `<div class="side-fam">${FAMILY_TITLE[f]}</div><ul>${ORDER.filter((p) => p.family === f).map((p) => `<li class="${cur && p.id === cur.id ? 'cur' : ''}"><a href="${p.id}.html">${esc(p.name)}</a> ${chip(p)}</li>`).join('')}</ul>`).join('')}<div class="side-fam">Anti-patterns</div><ul>${DATA.anti_patterns.map((a) => `<li><a href="./#anti-${a.id}">${esc(a.name)}</a></li>`).join('')}</ul></aside>`;
// ─── the chapter banner ───────────────────────────────────────────────────
// The same identifying graph the front door draws, shaped as a band across the
// top of every page of the book. It is NOT a second drawing: the geometry is
// read out of `_rebuild/build/idanim.js`'s own GRAPH region — the one file that
// owns it — and emitted with the same four layers and the same class names, so
// `/idanim.js` mounts it like any other root. The driver refuses a root whose
// counts disagree with its own graph, which is why nothing here is trimmed to
// fit: the band is a SLICE of the full portrait drawing, cropped by
// `preserveAspectRatio="slice"`, not a reduced version of it.
const IDANIM_SRC = join(SITE, '_rebuild/build/idanim.js');   // SITE, not ROOT: ROOT is ProjectAmp2
const idGraphOf = (() => {
  if (!existsSync(IDANIM_SRC)) throw new Error(`banner: no idanim source at ${IDANIM_SRC} — the band's geometry has one owner and this is it`);
  const src = readFileSync(IDANIM_SRC, 'utf8');
  const region = (src.match(/GRAPH-START[\s\S]*?\*\/([\s\S]*?)\/\*\s*GRAPH-END/) || [])[1];
  if (!region) throw new Error('banner: idanim.js has no GRAPH-START/GRAPH-END region');
  return new Function(region + '\nreturn idGraph;')();
})();

function bannerArt() {
  const g = idGraphOf();
  // The driver refuses a root whose counts disagree with its own graph, and
  // it fails QUIET when it does — a still band is indistinguishable from a
  // band nobody wired up. So the disagreement is caught here instead.
  if (!g || !g.nodes || !g.arcs || !g.nodes.length || !g.arcs.length) {
    throw new Error('banner: idGraph() returned no geometry');
  }
  const arcs = g.arcs.map((a) => `<path class="ida" d="${a.d}"></path>`).join('');
  const heads = g.arcs.map((a) => `<path class="idh" d="${a.head}"></path>`).join('');
  const traces = g.arcs.map((a) => `<path class="idt" d="${a.d}" stroke-dasharray="${a.dash}" opacity="0"></path>`).join('');
  const nodes = g.nodes.map((n) => `<circle class="idn" cx="${n.x}" cy="${n.y}" r="${g.r}"></circle>`).join('');
  // TILED, with <use>. The band is about 9:1 and the drawing is 0.7:1, so one
  // copy can only ever occupy a fraction of the width — measured at 41%, with
  // 7 of its 31 nodes inside the band's height and the rest of the band blank.
  // Padding the viewBox to fix that just pads with NOTHING.
  //
  // <use> is the way out: the shadow instances mirror the referenced subtree,
  // including the attribute values the driver writes at run time, so all four
  // tiles animate together — while `querySelectorAll('.idn')` still returns
  // exactly 31, which is what the driver checks before it will run at all.
  // One real element set, four tiles, full width. The y offsets stop the
  // repeat from reading as a repeat.
  const OFF = [0, -58, 31, -22];
  const tiles = OFF.slice(1)
    .map((y, i) => `<use href="#pb-graph" x="${(i + 1) * 300}" y="${y}"></use>`)
    .join('');
  return `<div class="pb-art" data-identity-animation aria-hidden="true"><svg viewBox="0 0 1200 430" preserveAspectRatio="xMidYMid slice" focusable="false"><g id="pb-graph"><g>${arcs}</g><g>${heads}</g><g>${traces}</g><g>${nodes}</g></g>${tiles}</svg></div>`;
}

// `where` is the reader's position in the book, derived — never typed.
function banner(where) {
  const art = bannerArt();
  return `<div class="pb">${art}<div class="pb-type"><a class="pb-site" href="/">OpenSentience.org</a><span class="pb-book">Unboxed Patterns</span><span class="pb-where">${esc(where)}</span></div></div>`;
}

const BANNER_CSS = `
.pb{position:relative;height:clamp(104px,15vh,168px);overflow:hidden;border-bottom:1px solid var(--border,#e6e1d7);background:linear-gradient(180deg,var(--bg-card,#fffdf8),var(--ink,#faf8f3))}
/* The band is a SLICE of the portrait drawing, so the graph reads as a wide
   field of network rather than a squashed copy of the cover. Masked at both
   ends so it dissolves into the page instead of stopping at a hard edge. */
.pb-art{position:absolute;inset:0;opacity:.58;-webkit-mask-image:linear-gradient(90deg,transparent,#000 12%,#000 86%,transparent 100%);mask-image:linear-gradient(90deg,transparent,#000 12%,#000 86%,transparent 100%)}
.pb-art svg{width:100%;height:100%;display:block}
.pb-type{position:relative;z-index:1;height:100%;display:flex;flex-direction:column;justify-content:center;gap:.3rem;max-width:1180px;margin:0 auto;padding:0 clamp(1rem,4vw,2.6rem)}
.pb-site{font:500 .62rem/1 var(--mono,ui-monospace,monospace);letter-spacing:.2em;text-transform:uppercase;color:var(--accent-dim,#6d3bd4);text-decoration:none;width:max-content}
.pb-site:hover,.pb-site:focus-visible{text-decoration:underline}
.pb-book{font:600 clamp(1.15rem,2.4vw,1.75rem)/1.1 var(--display,Georgia,serif);color:var(--fg,#1c1a17);letter-spacing:-.01em}
.pb-where{font:500 .7rem/1 var(--mono,ui-monospace,monospace);letter-spacing:.14em;text-transform:uppercase;color:var(--accent-dim,#6d3bd4)}
@media (prefers-reduced-motion:reduce){.pb-art{opacity:.34}}
`;

const SHELL_CSS = `body{margin:0;background:var(--ink,#faf8f3);color:var(--fg,#1c1a17);font:17px/1.6 var(--display,Georgia,serif)}
.book{display:grid;grid-template-columns:250px minmax(0,1fr);gap:2.2rem;max-width:1460px;margin:0 auto;padding:76px var(--gutter,1.5rem) 4rem}
.side{position:sticky!important;top:76px;height:auto;width:auto;background:transparent;box-shadow:none;align-self:start;max-height:calc(100vh - 90px);overflow:auto;font:13px/1.5 var(--ui,system-ui);padding-right:.5rem;border-right:1px solid var(--line,#e7e0d2)}
.side-home{display:block;font:700 15px var(--ui,system-ui);color:var(--acc,#6d3bd4);text-decoration:none;margin:.2rem 0 .8rem}.side-fam{font:600 11px var(--ui,system-ui);letter-spacing:.08em;text-transform:uppercase;color:var(--fg3,#666);margin:.9rem 0 .2rem}
.side ul{list-style:none;margin:0;padding:0}.side li{padding:.15rem 0;display:flex;gap:.4rem;align-items:baseline}.side li a{color:var(--fg,#1c1a17);text-decoration:none}.side li.cur a{color:var(--acc,#6d3bd4);font-weight:600}
.chip{font:600 10px var(--ui,system-ui);padding:.05rem .35rem;border-radius:3px;white-space:nowrap}.chip.WITNESSED{background:var(--data-soft,#e6f7ef);color:var(--data,#0a7)}.chip.STATED{background:rgba(150,96,11,.10);color:var(--warn,#96600b)}.chip.PROPOSED{background:rgba(192,42,95,.08);color:var(--rose,#c02a5f)}.chip.none{background:var(--ink2,#eee);color:var(--fg3,#666)}
main{max-width:1080px}main h1{font:700 2.4rem/1.15 var(--display,Georgia,serif);margin:.2rem 0 .3rem}.meta{font:13px var(--ui,system-ui);color:var(--fg3,#666)}.st{font:11px var(--ui,system-ui);padding:.02rem .3rem;border:1px solid var(--line2,#ccc);border-radius:3px;margin-left:.2rem}.st.on{border-color:var(--data,#0a7);color:var(--data,#0a7)}.st.off{color:var(--fg3,#aaa);text-decoration:line-through}
main h2{font:600 13px var(--ui,system-ui);letter-spacing:.08em;text-transform:uppercase;color:var(--acc,#6d3bd4);margin:2.4rem 0 .5rem;padding-top:.6rem;border-top:1px solid var(--line,#e7e0d2)}
.invariant{font:1.15rem/1.5 var(--display,Georgia,serif);border-left:3px solid var(--acc,#6d3bd4);background:var(--acc-soft,rgba(109,59,212,.06));padding:.6rem 1rem;margin:1rem 0;border-radius:0 var(--r,8px) var(--r,8px) 0}
.lede{font-size:1.15rem}.tech{font:14px/1.55 var(--ui,system-ui);color:var(--fg2,#333)}.tech summary{cursor:pointer;font-weight:600;color:var(--acc,#6d3bd4)}
.sf{margin:.5rem 0 1rem}.illus{font:12px var(--ui,system-ui);color:var(--fg3,#666);margin:-.2rem 0 .6rem}
pre.syn{font:12.5px/1.5 var(--mono,monospace);background:#1b1a17;color:#eee7d8;padding:.8rem 1rem;border-radius:var(--r,8px);overflow:auto;margin:.3rem 0 1rem;white-space:pre}.syn-label{font:13px var(--ui,system-ui);color:var(--fg2,#333)}.syn-label code{font:12px var(--mono,monospace);color:var(--fg3,#666)}
.sf-static{cursor:grab;touch-action:none}.sf-static.grabbing{cursor:grabbing}.wrlg{width:100%;height:auto;display:block;color:var(--fg3,#666);background:var(--ink3,#fffdf8);border:1px solid var(--line,#e7e0d2);border-radius:var(--r,8px)}.wrlg .n rect{fill:var(--ink2,#f2ede2);stroke:var(--fg2,#333);stroke-width:1.2}.wrlg .n.Door rect{stroke:var(--rose,#c02a5f)}.wrlg .n.Pulser rect{stroke:var(--acc,#6d3bd4)}.wrlg .n.Orb rect{stroke:var(--data,#0a6e62)}.wrlg .n text{font:12px var(--mono,monospace);fill:var(--fg,#1c1a17)}.wrlg .n text.r{font-size:10px;fill:var(--fg3,#666)}.wrlg .e{stroke:currentColor;stroke-width:1.4}.wrlg .ek{font:10px var(--mono,monospace);fill:var(--fg3,#666)}.semid{font:13px var(--mono,monospace);word-break:break-all}table.claims{border-collapse:collapse;font:13px var(--ui,system-ui);margin:.3rem 0 .8rem}table.claims td,table.claims th{border:1px solid var(--line,#e7e0d2);padding:.2rem .5rem;text-align:left}main h3{font:600 15px var(--ui,system-ui);margin:1.6rem 0 .4rem}.semid.bad{color:var(--rose,#c02a5f)}
.two{display:grid;grid-template-columns:1fr 1fr;gap:1.2rem}.two b{font:600 13px var(--ui,system-ui);text-transform:uppercase;letter-spacing:.06em}.two ul{padding-left:1.2rem;margin:.3rem 0}
code.up{font:600 11px var(--mono,monospace);background:var(--ink2,#f2ede2);padding:.05rem .3rem;border-radius:3px;color:var(--fg2,#333)}
dl.honest{display:grid;grid-template-columns:max-content 1fr;gap:.25rem 1rem;font:13.5px/1.55 var(--ui,system-ui);border:1px solid var(--line,#e7e0d2);border-left:3px solid var(--fg3,#999);background:var(--ink3,#fffdf8);padding:.7rem .9rem;border-radius:0 var(--r,8px) var(--r,8px) 0;margin:1rem 0 .4rem}
dl.honest dt{font:600 11px var(--ui,system-ui);letter-spacing:.06em;text-transform:uppercase;color:var(--fg3,#666);padding-top:.15rem}dl.honest dd{margin:0}dl.honest .warn-i{color:var(--warn,#96600b)}
details.why{font:13px/1.55 var(--ui,system-ui);margin:0 0 1.4rem}details.why summary{cursor:pointer;color:var(--acc,#6d3bd4);font-weight:600}
ul.why-l{list-style:none;padding:.4rem 0 0;margin:0;font:13px var(--mono,monospace)}ul.why-l li{padding:.1rem 0}ul.why-l li.y{color:var(--data,#0a7)}ul.why-l li.x{color:var(--rose,#c02a5f)}ul.why-l li.n{color:var(--fg3,#666)}
table.pa,table.basis{border-collapse:collapse;font:13px/1.5 var(--ui,system-ui);margin:.4rem 0 .6rem;width:100%}table.pa td,table.pa th,table.basis td,table.basis th{border:1px solid var(--line,#e7e0d2);padding:.3rem .5rem;text-align:left;vertical-align:top}table.pa th,table.basis th{font:600 11px var(--ui,system-ui);letter-spacing:.05em;text-transform:uppercase;color:var(--fg3,#666)}
.rel,.mod{font:600 10.5px var(--ui,system-ui);padding:.05rem .35rem;border-radius:3px;white-space:nowrap;background:var(--ink2,#f2ede2);color:var(--fg2,#333)}
.rel.not-searched{background:rgba(192,42,95,.10);color:var(--rose,#c02a5f)}.rel.terminology-precedent,.rel.antecedent{background:rgba(150,96,11,.10);color:var(--warn,#96600b)}
.mod.necessary{background:var(--acc-soft,rgba(109,59,212,.08));color:var(--acc,#6d3bd4)}.mod.not_sufficient,.mod.stronger_than_needed{background:rgba(150,96,11,.10);color:var(--warn,#96600b)}
p.nonovelty{font:13.5px/1.6 var(--ui,system-ui);border-left:3px solid var(--warn,#96600b);background:rgba(150,96,11,.05);padding:.5rem .8rem;border-radius:0 var(--r,8px) var(--r,8px) 0}
p.note{font:12.5px/1.55 var(--ui,system-ui);color:var(--fg3,#666)}
p.selfcrit{font:13.5px/1.6 var(--ui,system-ui);border-left:3px solid var(--warn,#96600b);background:rgba(150,96,11,.06);padding:.6rem .9rem;border-radius:0 var(--r,8px) var(--r,8px) 0;margin:.8rem 0 1.2rem}
p.liverun{font:13.5px/1.6 var(--ui,system-ui);border-left:3px solid var(--data,#0a7);background:var(--data-soft,#e6f7ef);padding:.5rem .8rem;border-radius:0 var(--r,8px) var(--r,8px) 0}
p.cex-strong,p.cex-weak{font:13.5px/1.6 var(--ui,system-ui);padding:.5rem .8rem;border-radius:0 var(--r,8px) var(--r,8px) 0;border-left:3px solid}
p.cex-strong{border-color:var(--data,#0a7);background:var(--data-soft,#e6f7ef)}
p.cex-mid{font:13.5px/1.6 var(--ui,system-ui);padding:.5rem .8rem;border-radius:0 var(--r,8px) var(--r,8px) 0;border-left:3px solid var(--acc,#6d3bd4);background:var(--acc-soft,rgba(109,59,212,.06))}
p.cex-weak{border-color:var(--warn,#96600b);background:rgba(150,96,11,.06)}
.take{list-style:none;padding:0;margin:0}.take li{padding:.5rem .8rem;margin:.4rem 0;border-left:3px solid var(--line2,#ccc);background:var(--ink3,#fffdf8);font:15px/1.5 var(--display,Georgia,serif)}.take li b{font:600 10px var(--ui,system-ui);letter-spacing:.08em;text-transform:uppercase;display:block;color:var(--fg3,#666)}.take li.animation{border-color:var(--acc,#6d3bd4)}.take li.syntax{border-color:var(--fg,#1c1a17)}.take li.literature{border-color:var(--warn,#96600b)}.take li.witness{border-color:var(--data,#0a7)}
.sink{font:13px/1.45 var(--mono,monospace);background:#1b1a17;color:#ddd;padding:.8rem;border-radius:var(--r,8px);min-height:1.5rem;max-height:28rem;overflow:auto;margin:.5rem 0;white-space:pre-wrap}.wline.good{color:#7fd}.wline.bad{color:#f88}.wline.warn{color:#fd7}.wline.group{color:#9cf;margin-top:.5rem}.wline.muted{color:#888}.wstatus.running{color:var(--warn)}.wstatus.pass{color:var(--data)}.wstatus.fail{color:var(--rose,#c02a5f)}
code{font:.85em var(--mono,monospace);background:var(--ink2,#f2ede2);padding:0 .25rem;border-radius:3px}.warn{color:var(--warn,#96600b)}.exec{font:14px var(--ui,system-ui)}.note{font:14px var(--ui,system-ui);color:var(--fg2,#444);background:var(--ink2,#f2ede2);padding:.5rem .8rem;border-radius:var(--r,8px)}
button.act{font:600 14px var(--ui,system-ui);padding:.4rem .9rem;border:1px solid var(--fg,#1c1a17);background:var(--ink3,#fff);border-radius:6px;cursor:pointer}button.act:disabled{opacity:.5}q{font-style:italic}
.pn{display:flex;justify-content:space-between;gap:1rem;margin-top:3rem;padding-top:1rem;border-top:1px solid var(--line,#e7e0d2);font:14px var(--ui,system-ui)}.pn a{color:var(--acc,#6d3bd4);text-decoration:none}.pn small{display:block;color:var(--fg3,#666)}
footer.fin{font:12.5px var(--ui,system-ui);color:var(--fg3,#666);margin-top:2rem}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:1rem;margin:.6rem 0 1.6rem}.card{display:block;border:1px solid var(--line,#e7e0d2);border-radius:var(--r,8px);background:var(--ink3,#fffdf8);padding:.8rem .9rem;text-decoration:none;color:inherit}.card:hover{border-color:var(--acc-line,#c9b8f0)}.card .thumb{margin:-.3rem -.3rem .5rem;border-radius:6px;overflow:hidden}.card .thumb svg{display:block;width:100%;height:auto;border:0}.card h3{font:600 17px var(--display,Georgia,serif);margin:0 0 .2rem}.card p{font:13.5px/1.45 var(--ui,system-ui);color:var(--fg2,#333);margin:.2rem 0}
@media(max-width:900px){.book{grid-template-columns:1fr}.side{position:static;max-height:none;border-right:0;border-bottom:1px solid var(--line,#e7e0d2);padding-bottom:.8rem}.two{grid-template-columns:1fr}}
` + SF.CSS;
function parseFilmLine(l) { const [role, name, rest] = l.split(':'); const kv = Object.fromEntries((rest || '').split(',').map((x) => x.split('=')).filter((x) => x.length === 2)); for (const k of ['rotor', 'pose']) { const m = (rest || '').match(new RegExp(k + '=([0-9a-f]+(?:,[0-9a-f]+){3})')); if (m) kv[k] = m[1]; } return { role, name, kv, raw: l }; }
function filmSceneFrom(rc, g, intro) {
  const hasLedger = rc.epochs.some((ep) => ep.film.some((l) => l.startsWith('receipt:')));
  const nodes = g.nodes.map(([r, n]) => [r, n, {}]).concat(hasLedger ? [['Ledger', 'ledger', {}]] : []);
  const steps = []; let prev = {};
  rc.epochs.forEach((ep, i) => {
    const actions = []; const cur = {};
    for (const l of ep.film) {
      if (!/^(pulser|relay|door|spinner|orb|wire):/.test(l)) continue;
      const f = parseFilmLine(l); cur[f.name] = f;
      if (f.role === 'wire') { const [, a, b] = f.name.split('__'); actions.push({ op: 'wirestate', wire: `${a}->${b}`, state: f.kv.cur === '1' ? 'on' : '' }); continue; }
      const note = f.role === 'spinner' ? `rotor=${f.kv.rotor}` : f.role === 'orb' ? `pose=${f.kv.pose}${f.kv.fault === '1' ? ' · FAULT' : ''}` : f.role === 'pulser' ? `armed=${f.kv.armed} done=${f.kv.done} nf=${f.kv.nf}` : f.role === 'door' ? `open=${f.kv.open}` : `cur_out=${f.kv.cur_out}`;
      const changed = prev[f.name] && prev[f.name].raw !== f.raw;
      actions.push({ op: 'note', target: f.name, text: note }, { op: 'state', target: f.name, state: changed ? 'admitted' : (f.role === 'orb' && f.kv.fault === '1' ? 'refused' : 'idle') });
    }
    if (hasLedger) {
      const rs = ep.film.filter((l) => l.startsWith('receipt:')).map((l) => { const m = l.match(/w=(\d+),s=(\d+).*epoch=(\d+),outcome=([^\s]+)/); return m ? { w: m[1], s: m[2], ep: +m[3], out: m[4] } : null; }).filter(Boolean);
      const fresh = rs.filter((r) => r.ep === ep.t);
      const cap = ep.film.find((l) => l.startsWith('admit:')) || '';
      actions.push({ op: 'count', target: 'ledger', value: rs.length }, { op: 'note', target: 'ledger', text: fresh.length ? fresh.map((r) => `w${r.w}s${r.s} ${r.out}`).join(' · ') : (/capacity_fault=1/.test(cap) ? 'CAPACITY FAULT' : '') }, { op: 'state', target: 'ledger', state: fresh.some((r) => /Rejected/.test(r.out)) ? 'refused' : fresh.length ? 'admitted' : 'idle' });
    }
    prev = cur;
    steps.push({ caption: `epoch ${ep.t} · Film v0.7 ${ep.film_hash.slice(7, 23)}… — every line below is the forge's; the picture only colours what changed`, actions, takeaway: i === rc.epochs.length - 1 ? `${rc.epochs.length} epochs reduced by TRVM's forge; ${new Set(rc.epochs.map((e) => e.film_hash)).size} distinct film hashes; this replay is of a sealed world, not of scene data.` : undefined });
  });
  return { stencil: 'world', interval: 2200, intro: intro || `The sealed world, before epoch 1. Reduced by TRVM's forge (${rc.execution_identity.reducer}) in ${rc.execution_identity.seconds}s on ${rc.execution_identity.host}.`, params: { nodes, edges: g.edges, rowOrder: chainRowOrder }, steps };
}
function boardScene(rc, g, intro) { const sc = filmSceneFrom(rc, g, intro); return { ...sc, stencil: 'network', params: { ...sc.params, groups: chainGroups, bands: chainBands, rowOrder: chainRowOrder } }; }
const boardStatic = (g) => SF.svg(SF.computeState({ stencil: 'network', params: { nodes: g.nodes.map(([r, n]) => [r, n, {}]), edges: g.edges, groups: chainGroups, bands: chainBands, rowOrder: chainRowOrder }, steps: [] }, 0), { caption: false });
function filmScene(p) { const w = p.wrl; if (!w || !w.world) return null; const rc = films.get(w.world); if (!rc) return null; return filmSceneFrom(rc, sealed.get(w.world).r.graph); }
function filmSection(p) {
  const w = p.wrl; if (!w || !w.world) return '';
  const rc = films.get(w.world);
  if (!rc) return `<p class="warn">${w.film ? 'A film is declared for this world and no receipt exists for the bytes on disk; run <code>run-films.mjs</code>.' : 'No film declared for this world.'}</p>`;
  const sc = filmScene(p);
  return `<p>This is not scene data. TRVM's forge reduced the sealed world above — the production fold, reference reducer, no scenario, empty claim batches merged with the world's own routes — and each step is one epoch's Film v0.7. The forge's id <code>${esc(rc.forge.semantic_artifact_id.slice(0, 24))}…</code> equals the id <code>wrl.js</code> sealed (the build refuses otherwise): two implementations, one identity.</p>
  <p class="exec">Execution identity: ${esc(rc.execution_identity.started)} on <code>${esc(rc.execution_identity.host)}</code> · ${rc.execution_identity.seconds}s · reducer <code>${esc(rc.execution_identity.reducer)}</code> · policy <code>${esc(rc.forge.policy_id)}</code> · TRVM HEAD <code>${(rc.source_identity.trvm_head || '?').slice(0, 12)}</code> · world bytes <code>${rc.source_identity.world_sha256.slice(0, 16)}…</code></p>
  <div class="sf" id="film"><div class="sf-stage">${SF.svg(SF.computeState(sc, 0))}</div></div>
  <details class="tech"><summary>The Film, epoch by epoch (${rc.epochs.length})</summary>${rc.epochs.map((e) => `<p class="syn-label">epoch ${e.t} · <code>${esc(e.film_hash)}</code></p><pre class="syn">${esc(e.film.join('\n'))}</pre>`).join('')}</details>`;
}
function claimsTable(sc, meta, rc) {
  if (!sc) return '';
  const v1 = sc.scenario_version === 'scenario.v1';
  const faults = v1 ? (sc.initial_runtime || {}).numeric_faults || [] : sc.numeric_faults || [];
  const rows = v1
    ? sc.epochs.flatMap((e) => e.claims.map((c) => `<tr><td>${e.epoch}</td><td>w${c.writer_id} s${c.sequence}</td><td><code>${esc(c.operation)}</code></td><td><code>${esc(c.target)}</code></td><td>${c.payload && c.payload.rotor ? `<code>${c.payload.rotor.join('.')}</code>` : '—'}</td><td>${esc(e.label || '')}</td></tr>`))
    : (sc.batches || []).flatMap((b, i) => b.map((c) => `<tr><td>${i + 1}</td><td>w${c.writer} s${c.seq}</td><td><code>${esc(c.op)}</code></td><td><code>${esc(c.target)}</code></td><td>${c.rotor ? `<code>${c.rotor.join('.')}</code>` : '—'}</td><td></td></tr>`));
  const digest = rc && rc.scenario_digest ? ` · ScenarioDigest <code>${esc(String(rc.scenario_digest).slice(0, 24))}…</code> (the run inputs' own identity, computed by the forge)` : '';
  return `<p class="syn-label">Run inputs — ${v1 ? 'a <code>ScenarioV1</code>, the forge\'s own document' : 'claims'}, bound to this world\'s id and never part of it (D3)${faults.length ? ` · initial numeric fault on <code>${faults.map(esc).join(', ')}</code>` : ''}${meta && meta.determinism ? ' · reduced twice, hashes compared' : ''}${digest}</p>${rows.length ? `<table class="claims"><tr><th>epoch</th><th>writer · seq</th><th>op</th><th>target</th><th>rotor</th><th>label</th></tr>${rows.join('')}</table>` : `<p class="exec">No claims: the world runs on its clocks alone for ${v1 ? sc.epochs.length : (sc.epochs || 4)} epochs.</p>`}`;
}
function chapterWrlSection(p) {
  const c = chain.get(p.id); if (!c) return '';
  const w = p.wrl || {};
  const receipts = c.film ? c.film.epochs.at(-1).film.filter((l) => l.startsWith('receipt:')) : [];
  let out = `<p class="syn-label">Chapter ${c.index + 1} of ${chainIds.length} — the fragment <code>_patterns/wrl/chain/${esc(p.id)}.wrl</code>, sealed alone by <code>wrl.js</code></p><pre class="syn">${esc(c.fragment.trim())}</pre>${c.bench ? `<p class="syn-label">Its test bench <code>_patterns/wrl/chain/${esc(p.id)}.bench.wrl</code> — drives the entry for this chapter's own film; never part of the chain</p><pre class="syn">${esc(c.bench.trim())}</pre>` : ''}<p class="semid">module + bench seal to → <code>${esc(c.delta.semanticId)}</code></p>
  ${claimsTable(c.scenario, c.meta, c.film)}${c.meta && c.meta.expect_idle ? `<p class="exec">Idle by design in this world alone: ${Object.entries(c.meta.expect_idle).map(([n, why]) => `<code>${esc(n)}</code> — ${esc(why)}`).join('; ')}.</p>` : ''}`;
  if (c.film) {
    const sc = filmSceneFrom(c.film, c.delta.graph, `This chapter's world alone, before epoch 1. Reduced by TRVM's forge in ${c.film.execution_identity.seconds}s; the forge's id equals the seal above.`);
    out += `<p class="exec">Reduced by ${reducerLine(c.film)}.</p>`;
    out += `<div class="sf" id="film"><div class="sf-stage">${SF.svg(SF.computeState(sc, 0))}</div></div>
    ${c.film.determinism ? `<p class="exec">Reduced twice from a fresh state: ${c.film.determinism.identical ? '<b>every epoch\'s film hash identical</b> — exact replay, witnessed on one host' : 'DIVERGED'}.</p>` : ''}
    ${receipts.length ? `<p class="syn-label">Receipts in the last epoch's Film</p><pre class="syn">${esc(receipts.join('\n'))}</pre>` : ''}
    <details class="tech"><summary>The Film, epoch by epoch (${c.film.epochs.length})</summary>${c.film.epochs.map((e) => `<p class="syn-label">epoch ${e.t} · <code>${esc(e.film_hash)}</code></p><pre class="syn">${esc(e.film.join('\n'))}</pre>`).join('')}</details>`;
    pageFilmScenes.set(p.id, sc);
  } else out += c.delta.graph.nodes.length ? `<p class="warn">No film receipt for this fragment's bytes yet — <code>run-films.mjs chain</code>.</p>` : `<p class="exec">The empty world has no Film: there is nothing for the forge to reduce, and it says so. The seal above is the seal of nothing declared.</p>`;
  if (w.refused) { const R = sealed.get(w.refused); out += `<p class="syn-label">A refused world beside it <code>_patterns/wrl/${esc(w.refused)}</code></p><pre class="syn">${esc(R.src.trim())}</pre><p class="semid bad">✗ <code>${esc(R.r.code)}</code> — ${esc(R.r.message)}</p>`; }
  if (w.variant) { const V = sealed.get(w.variant); out += `<p class="syn-label">A variant beside it <code>_patterns/wrl/${esc(w.variant)}</code></p><pre class="syn">${esc(V.src.trim())}</pre><p class="semid">→ <code>${esc(V.r.semanticId)}</code></p>`; }
  const g = c.cum.graph, pg = c.prevCum ? c.prevCum.graph : null;
  out += `<h3>${c.index === 0 ? 'The chain begins here' : `Composes with the ${c.index} chapter${c.index === 1 ? '' : 's'} before it`}</h3>
  <p>The chain through this chapter — every earlier fragment, this one, and the links — seals to <code>${esc(c.cum.semanticId)}</code>: ${g.nodes.length} objects, ${g.edges.length} edges${pg ? ` (was ${pg.nodes.length} / ${pg.edges.length}; every earlier object and edge is still present — checked, or the build refuses)` : ''}.${c.prevCum && c.prevCum.semanticId === c.cum.semanticId ? ' <b>The id did not move</b>: this fragment adds nothing but a comment, and a comment is not meaning.' : ''}</p>
  ${c.links ? `<p class="syn-label">Links only the chain carries</p><pre class="syn">${esc(c.links.trim())}</pre>` : ''}
  <div class="sf-static">${boardStatic(g)}</div><p class="illus">The board so far: one band per Part, signal flowing left to right; relays that fan out are routers, doors are switches, pulsers are clock domains. Hover an object for its state · wheel zooms · drag pans · double-click fits.</p>`;
  return out;
}
const pageFilmScenes = new Map();
function graphSvg(g) {
  // columns by longest incoming path; boxes; arrows. Small on purpose: the text listing is the authority.
  const names = g.nodes.map((n) => n[1]); const depth = Object.fromEntries(names.map((n) => [n, 0]));
  for (let k = 0; k < names.length; k++) for (const [, sN, dN] of g.edges) depth[dN] = Math.max(depth[dN], depth[sN] + 1);
  const cols = {}; for (const n of names) (cols[depth[n]] ||= []).push(n);
  const nc = Object.keys(cols).length, W = 720, H = 60 + 56 * Math.max(...Object.values(cols).map((c) => c.length)), pos = {};
  Object.entries(cols).forEach(([d, ns]) => ns.forEach((n, i) => { pos[n] = { x: 80 + (+d) * ((W - 160) / Math.max(1, nc - 1)) , y: 40 + i * 56 }; }));
  if (nc === 1) for (const n of names) pos[n].x = W / 2;
  const role = Object.fromEntries(g.nodes.map((n) => [n[1], n[0]]));
  const o = [`<svg class="wrlg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="currentColor"/></marker></defs>`];
  for (const [kind, a, b] of g.edges) { const A = pos[a], B = pos[b]; o.push(`<line class="e ${kind}" x1="${A.x + 54}" y1="${A.y}" x2="${B.x - 56}" y2="${B.y}" marker-end="url(#ar)"/><text class="ek" x="${(A.x + B.x) / 2}" y="${(A.y + B.y) / 2 - 8}" text-anchor="middle">${esc(kind)}</text>`); }
  for (const n of names) { const P = pos[n]; o.push(`<g class="n ${role[n]}"><rect x="${P.x - 54}" y="${P.y - 20}" width="108" height="40" rx="7"/><text x="${P.x}" y="${P.y - 3}" text-anchor="middle">${esc(n)}</text><text class="r" x="${P.x}" y="${P.y + 13}" text-anchor="middle">${esc(role[n])}</text></g>`); }
  return o.join('') + '</svg>';
}
function wrlSection(p) {
  const w = p.wrl; if (!w) return '';
  if (!w.world) return `<p class="warn">${esc(w.note || 'No WRL world for this scene.')}</p>`;
  const S = sealed.get(w.world); const g = S.r.graph;
  let out = `<p>${esc(w.note || '')}</p><p class="exec">Sealed at build by <code>WRL/wrl.js</code> (bytes <code>${WRLJS_SHA.slice(0, 16)}…</code>, WRL repo HEAD <code>${(heads.WRL || '?').slice(0, 12)}</code>). Nothing here ran the world: reduction to a Film lives in TRVM.</p>
  <p class="syn-label">Source <code>_patterns/wrl/${esc(w.world)}</code></p><pre class="syn">${esc(S.src.trim())}</pre><p class="syn-label">Graph, rendered from the sealed artifact's nodes and edges</p>${graphSvg(g)}<p class="semid">seals to → <code>${esc(S.r.semanticId)}</code></p>`;
  if (w.variant) { const V = sealed.get(w.variant); out += `<p class="syn-label">Variant <code>_patterns/wrl/${esc(w.variant)}</code> — one change</p><pre class="syn">${esc(V.src.trim())}</pre><p class="semid">→ <code>${esc(V.r.semanticId)}</code> <small>(≠ the id above)</small></p>`; }
  if (w.refused) { const R = sealed.get(w.refused); out += `<p class="syn-label">Refused world <code>_patterns/wrl/${esc(w.refused)}</code></p><pre class="syn">${esc(R.src.trim())}</pre><p class="semid bad">✗ <code>${esc(R.r.code)}</code> — ${esc(R.r.message)}${R.r.line ? ` <small>(line ${R.r.line})</small>` : ''}</p>`; }
  return out;
}
const MOD_WORD = { necessary: 'necessary', sufficient: 'sufficient', not_sufficient: 'not sufficient alone', stronger_than_needed: 'stronger than needed' };
const REL_WORD = {
  antecedent: 'antecedent', 'close-analogue': 'close analogue', 'partial-overlap': 'partial overlap',
  realization: 'realization', 'contrasting-solution': 'contrasting solution',
  'terminology-precedent': 'terminology precedent', 'not-searched': 'NOT SEARCHED',
};
// Prior art with a RELATION on every entry, so the catalog cannot manufacture novelty by omission.
function priorArtSection(p) {
  const pa = p.prior_art;
  if (!pa) return '';
  if (typeof pa === 'string') return `<h2>Prior art</h2>${para(pa)}`;
  return `<h2>Prior art — and what is not claimed</h2>
<table class="pa"><tr><th>work</th><th>relation</th><th>what it shares</th><th>where it differs</th></tr>${pa.works.map((w) => `<tr><td>${esc(w.work)}</td><td><span class="rel ${w.relation}">${REL_WORD[w.relation]}</span></td><td>${esc(w.overlap)}</td><td>${esc(w.difference)}</td></tr>`).join('')}</table>
<p class="nonovelty"><b>Novelty not claimed.</b> ${esc(pa.novelty_not_claimed)}</p>`;
}
// The five-line box the OpenSentience homepage already runs for its research claims, applied per chapter.
function honestyBox(p) {
  const d = p.derived, w = p.witness;
  const src = w ? `<code>${esc(w.path)}</code>${d.execution && d.execution.repo_head ? ` @ <code>${esc((d.execution.repo_head || '').slice(0, 12))}</code>` : ''}${d.execution && d.execution.sha256 ? ` · bytes <code>${esc(d.execution.sha256.slice(0, 16))}…</code>` : ''}` : '<span class="warn-i">none — this record cites no check</span>';
  const checked = d.execution && d.execution.at ? esc(String(d.execution.at).slice(0, 19).replace('T', ' ')) + ' UTC' : '<span class="warn-i">never run</span>';
  // the rung NAME is the chip; strip it from the prose so the page does not print it twice
  const nrProse = String(p.next_rung || '').replace(new RegExp(`^(?:${LADDER.join('|')}):\\s*`), '');
  const nr = d.next_rung_name ? `<code>${d.next_rung_name}</code> — ${esc(nrProse)}` : `already at the top of the ladder — ${esc(nrProse)}`;
  return `<dl class="honest">
<dt>Standing</dt><dd>${chip(p)} ${['CHECKABLE', 'RUNNABLE', 'EXECUTED', 'STAGED', 'PUBLISHED', 'REPRODUCED'].map((k) => `<span class="st ${d[k] ? 'on' : 'off'}">${k}</span>`).join('')}</dd>
<dt>Last checked</dt><dd>${checked}</dd>
<dt>Source</dt><dd>${src}</dd>
<dt>Limit</dt><dd>${esc(p.limit || '')}</dd>
<dt>Next rung</dt><dd>${nr}</dd>
</dl>
<details class="why"><summary>Why this page says ${d.label ?? p.kind}${d.label ? '' : ''} — the derivation, not the word</summary><ul class="why-l">${d.why.map((x) => `<li class="${x.ok === null ? 'n' : x.ok ? 'y' : 'x'}">${x.ok === null ? '·' : x.ok ? '✓' : '✗'} ${esc(x.text)}</li>`).join('')}</ul><p class="note">WITNESSED requires every line above to hold. The label is computed from them by <code>build.mjs</code> and cannot be typed into the registry — the build refuses a record that carries it.</p></details>`;
}

function pageFor(p, idx) {
  const d = p.derived, w = p.witness, c = p.counterexample, sc = sceneOf(p);
  const stamp = w && d.STAGED ? stampFor(w.staged_path) : null;
  const demo = existsSync(join(DEMOS, p.id + '.mjs'));
  const prev = ORDER[idx - 1], next = ORDER[idx + 1];
  const standings = ['CHECKABLE', 'RUNNABLE', 'EXECUTED', 'STAGED'].map((k) => `<span class="st ${d[k] ? 'on' : 'off'}">${k}</span>`).join('');
  const exec = d.execution ? `<p class="exec">Execution identity: ${esc(d.execution.at)}${d.execution.host ? ` on <code>${esc(d.execution.host)}</code>` : ''}${d.execution.sha256 ? ` · bytes <code>${d.execution.sha256.slice(0, 16)}…</code> · repo HEAD <code>${(d.execution.repo_head || '?').slice(0, 12)}</code>` : d.execution.note ? ` — ${esc(d.execution.note)}` : ''}</p>` : `<p class="exec warn">No execution record: this check has not been run for the bytes on disk. WITNESSED requires one.</p>`;
  const witness = w ? `<p class="exec">Source identity: <code>${esc(w.path)}</code> · shape <code>${w.shape}</code>${w.evidence_kind ? ` · evidence kind <code>${w.evidence_kind}</code>` : ''} · rung <code>${w.rung}</code> <small>(${esc(w.rung_source)})</small></p>${exec}
    ${d.live_run ? `<p class="liverun"><b>It has already run from this site.</b> On ${esc(String(d.live_run.at).slice(0, 10))} the staged bytes at stamp <code>${esc(d.live_run.stamp)}</code> were executed by a browser at <code>${esc(d.live_run.url)}</code> and reported <b>${esc(d.live_run.status)}</b>. That recorded run — not a word in the registry — is what puts this witness at rung <code>${w.rung}</code>; restage the file and the stamp moves, the receipt stops matching, and the rung falls back (P26).</p>` : ''}
    ${d.STAGED ? `<p>Staged byte-identical at <code>${esc(w.staged_path)}</code> (stamp <code>${stamp}</code>). <button class="act" id="run">Run the witness here</button> <span id="wstatus" class="wstatus"></span></p><div id="wsink" class="sink"></div>`
               : `<p class="warn">Not staged on this site: the page cannot run this witness. ${d.RUNNABLE ? 'It runs from the command line: <code>' + esc(w.cmd) + '</code> in <code>' + esc(w.cwd) + '</code>.' : 'Its shape (' + w.shape + ') is a document, not a run.'}</p>`}`
    : `<p class="warn">No witness. ${p.kind === 'definition' ? 'A definition carries no evidence rung (AGENCY.md §6).' : 'This pattern is ' + (d.label || 'unlabelled') + ' — the tree has no check for its invariant.'}</p>`;
  const cs = d.counterexample_strength;
  const csNote = !cs ? '' : cs.strength === 'scoped'
    ? `<p class="cex-mid"><b>Scoped to its law, not resolved.</b> The marker sits on <code>${esc(cs.law)}</code>'s own declaration line, so it is that law's statement and not a string borrowed from a neighbour or lifted from its failure path (P28). What could not be done is resolve the id against the suite's own index: <code>${esc(c.path.split('/').pop())}</code> exports none, so the build cannot ask the suite whether <code>${esc(cs.law)}</code> is enforced or declared-open. Between a bare string match and a resolved law.</p>`
    : cs.strength === 'resolved'
    ? `<p class="cex-strong"><b>Resolved, not grepped.</b> Law <code>${esc(cs.law)}</code> was looked up in the suite's own exported index — the one it prints from the arrays it executes — and is <b>enforced</b>, not one of the declared-open gaps. The marker above sits on that law's own declaration line, so it is that law's statement and not a string borrowed from another. Both are checked on every build (P27, P28).</p>`
    : `<p class="cex-weak"><b>A marker, not a resolved law.</b> The build checked that this string is present in the file${cs.occurrences > 1 ? `, and it occurs there <b>${cs.occurrences} times</b>, so it does not pick out one place` : ''}. A string being present proves the file mentions it, not that the file refuses anything — this record cites no law id that could be resolved against a suite index. It is the weaker of the two forms this catalog uses.</p>`;
  const cex = c ? `<p>${c.shape === 'lint' ? `A sentence the ontology gate rejects: <q>${esc(c.sentence)}</q> — expected <code>REFUSED</code>.` : c.shape === 'fixture' ? `Fixture <code>${esc(c.path)}</code>: ${c.expected_count} vectors, each expected <code>REFUSED</code>.` : `<code>${esc(c.path)}</code> — ${c.law ? `law <code>${esc(c.law)}</code>, ` : ''}marker <q>${esc(c.marker)}</q>, expected <code>${c.expected}</code>.`}</p>${csNote}${c.note ? `<p class="note">${esc(c.note)}</p>` : ''}${demo && d.STAGED ? `<p><button class="act" id="demo">Show the refusal</button> <small class="illus">illustration — imports the same staged modules; the suite above is the evidence</small></p><div id="dsink" class="sink"></div>` : ''}`
    : `<p class="warn">No counterexample shipped${d.label === 'WITNESSED' ? ' — the build would have refused this' : ' (required only when WITNESSED)'}.</p>`;
  const structure = sc ? `<div class="sf" id="sf"><div class="sf-stage">${SF.svg(SF.computeState(sc, 0))}</div></div><p class="illus">An illustration on a compute surface: loci above, carriers below. Press Play or Step; the takeaways collect as you go. Nothing here is evidence — the witness section is.</p>` : '';
  const syntax = (p.syntax || []).map((x) => { const e = excerpt(x); return `<p class="syn-label">${esc(x.label)} <code>${esc(x.path)}:${e.from}</code></p><pre class="syn">${esc(e.text)}</pre>`; }).join('');
  const takeaways = (p.takeaways || []).length ? `<ol class="take">${p.takeaways.map((t) => `<li class="${t.from}"><b>from the ${t.from}</b>${esc(t.text)}</li>`).join('')}</ol>` : '';
  const fm = p.failure_mode ? antiById.get(p.failure_mode) : null;
  const wrlHtml = chain.has(p.id) ? `<h2>The chapter in WRL — and the chain so far</h2>${chapterWrlSection(p)}` : (p.wrl ? `<h2>The scene as a WRL world</h2>${wrlSection(p)}` : '');
  const script = `<script type="module">
    import { mount, panZoom } from '/patterns/surface/surface.mjs?v=${SF_STAMP}';
    for (const el of document.querySelectorAll('.sf-static')) panZoom(el, () => el.querySelector('svg'));
    ${sc ? `mount(document.getElementById('sf'), ${JSON.stringify(sc)});` : ''}
    ${pageFilmScenes.has(p.id) ? `mount(document.getElementById('film'), ${JSON.stringify(pageFilmScenes.get(p.id))});` : ''}
    ${(d.STAGED || demo) ? `import { runWitness } from '/witness/run.js?v=${RUNJS_STAMP}';
    const spec = ${JSON.stringify({ entry: '/witness/src/' + (w ? w.path : ''), mode: w ? (w.shape === 'suite' ? 'suite' : 'side-effect') : 'suite', stamp, argv: [], trials: 200 })};
    const b = document.getElementById('run');
    if (b) b.addEventListener('click', () => runWitness({ spec, sink: document.getElementById('wsink'), status: document.getElementById('wstatus'), button: b }));
    const db = document.getElementById('demo');
    if (db) db.addEventListener('click', async () => { db.disabled = true; try { const m = await import('./demos/${p.id}.mjs?v=${stamp}'); await m.run(document.getElementById('dsink'), { stamp: '${stamp}' }); } catch (e) { document.getElementById('dsink').textContent = 'demo failed: ' + e.message; } db.disabled = false; });` : ''}
  </script>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(p.name)} · Unboxed Patterns</title><meta name="description" content="${esc(p.headline || p.invariant || p.name)}"><link rel="canonical" href="https://opensentience.org/patterns/${p.id}"><link rel="stylesheet" href="/styles/site.css"><style>${SHELL_CSS}${BANNER_CSS}</style></head><body>
<script type="module" src="/amp-nav.js"></script><script src="/idanim.js" defer></script><amp-nav property="opensentience"></amp-nav>
${banner(`Chapter ${idx + 1} of ${ORDER.length} \u00b7 ${FAMILY_TITLE[p.family]}`)}
<div class="book">${sidebar(p)}<main>
<p class="meta"><code class="up">${p.up}</code> · ${FAMILY_TITLE[p.family]} · ${chip(p)} ${standings}</p>
<h1>${esc(p.name)}</h1>
${p.headline ? `<p class="lede">${esc(p.headline)}</p>` : ''}
${p.invariant ? `<div class="invariant">${esc(p.invariant)}</div>` : ''}
${honestyBox(p)}
${p.explanatory ? `<h2>Intent</h2><p>${esc(p.explanatory)}</p>` : ''}${p.technical ? `<details class="tech"><summary>Technical register</summary><p>${esc(p.technical)}</p></details>` : ''}
${p.problem ? `<h2>Problem</h2>${para(p.problem)}` : ''}
${p.construction ? `<h2>Solution</h2>${para(p.construction)}` : ''}
${p.analogy ? `<h2>Real-world analogy</h2>${para(p.analogy)}` : ''}
${structure ? `<h2>Structure — on the surface</h2>${structure}` : ''}
${wrlHtml}
${syntax ? `<h2>Syntax — quoted from the tree at build time</h2>${syntax}` : ''}
${p.forces ? `<h2>Forces</h2>${para(p.forces)}` : ''}
${p.applicability ? `<h2>Applicability</h2>${para(p.applicability)}` : ''}
${p.transformations ? `<h2>Transformations</h2><div class="two"><div><b>Preserving</b>${list(p.transformations.allowed)}</div><div><b>Refusing</b>${list(p.transformations.refused)}</div></div><p class="note">A <em>refusing</em> transformation is not one that is discouraged: it is one that, applied, makes the invariant above false. The word is the tree's, and it is the same word the join uses.</p>` : ''}
${p.consequences ? `<h2>Consequences</h2>${para(p.consequences)}` : ''}
${fm ? `<h2>Failure mode it answers</h2><p><b>${esc(fm.name)}</b> — ${esc(fm.problem)}${fm.paid_for ? ` <small>Paid for at: ${esc(fm.paid_for)}</small>` : ''}</p>` : ''}
<h2>Witness</h2>${witness}
<h2>Counterexample</h2>${cex}
${takeaways ? `<h2>What to take away</h2>${takeaways}` : ''}
${(p.cells || []).length || (p.claims || []).length ? `<h2>Invariant basis — and how each piece bears</h2><table class="basis"><tr><th>basis</th><th>bears</th><th>status</th></tr>${d.cell_statuses.map((x) => `<tr><td>cell <code>${x.num}</code></td><td><span class="mod ${x.modality}">${MOD_WORD[x.modality]}</span></td><td><code>${x.status}</code> <small>cells.json</small></td></tr>`).join('')}${(p.claims || []).map((b, i) => `<tr><td>claim <code>${esc(b.ref)}</code></td><td><span class="mod ${b.modality}">${MOD_WORD[b.modality]}</span></td><td><code>${d.claim_statuses[i]}</code> <small>CLAIM_LEDGER.json</small></td></tr>`).join('')}</table><p class="note">Satisfying a basis is local. Nothing here implies global adequacy unless a theorem or a composition rule says so.</p>` : ''}
${priorArtSection(p)}
${(p.realizations || []).length ? `<h2>Realizations in the tree</h2>${list(p.realizations)}` : ''}
${d.related_closure.length ? `<h2>Relations with other patterns</h2><p>${d.related_closure.map((id) => byId.has(id) ? `<a href="${id}.html">${esc(byId.get(id).name)}</a> ${chip(byId.get(id))}${(p.related || []).includes(id) ? '' : '<sup title="named on that page rather than this one; the reverse edge is derived">↩</sup>'}` : esc(id)).join(' · ')}</p>${d.related_closure.some((id) => !(p.related || []).includes(id)) ? '<p class="note">A <sup>↩</sup> marks a relation named on the other page. Relations are symmetric here and the reverse is derived, so neither side can go missing by being written once.</p>' : ''}` : ''}
<div class="pn"><span>${prev ? `<a href="${prev.id}.html">← ${esc(prev.name)}</a><small>${FAMILY_TITLE[prev.family]}</small>` : ''}</span><span style="text-align:right">${next ? `<a href="${next.id}.html">${esc(next.name)} →</a><small>${FAMILY_TITLE[next.family]}</small>` : ''}</span></div>
<footer class="fin">Derived ${new Date().toISOString()} by <code>opensentience.org/_patterns/build/build.mjs</code> from <code>data/patterns.json</code>, <code>_invariants/data/cells.json</code>, <code>CLAIM_LEDGER.json</code> and <code>_patterns/receipts/</code>. ${p.kind === 'pattern' && !p.problem ? 'Thin record: prose not yet authored; the invariant, witness and prior art are the record.' : ''}</footer>
</main></div>${script}</body></html>`;
}
const pageOutputs = {};
ORDER.forEach((p, i) => { pageOutputs[`${p.id}.html`] = pageFor(p, i); });
for (const f of existsSync(DEMOS) ? readdirSync(DEMOS) : []) pageOutputs[`demos/${f}`] = readFileSync(join(DEMOS, f), 'utf8');
for (const f of existsSync(SCENES) ? readdirSync(SCENES) : []) pageOutputs[`scenes/${f}`] = readFileSync(join(SCENES, f), 'utf8');
pageOutputs['surface/surface.mjs'] = readFileSync(SURFACE, 'utf8');
for (const f of existsSync(WRL_DIR) ? readdirSync(WRL_DIR) : []) if (f.endsWith('.wrl')) pageOutputs[`wrl/${f}`] = readFileSync(join(WRL_DIR, f), 'utf8');
for (const f of existsSync(CH.CHAIN) ? readdirSync(CH.CHAIN) : []) if (!f.startsWith('.')) pageOutputs[`wrl/chain/${f}`] = readFileSync(join(CH.CHAIN, f), 'utf8');
for (const f of existsSync(FILMS_DIR) ? readdirSync(FILMS_DIR) : []) pageOutputs[`films/${f}`] = readFileSync(join(FILMS_DIR, f), 'utf8');
const CONC = readJson(join(HERE, '../data/conclusion.json'));
const last = ORDER[ORDER.length - 1];
pageOutputs['conclusion.html'] = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(CONC.title)} · Unboxed Patterns</title><link rel="stylesheet" href="/styles/site.css"><style>${SHELL_CSS}${BANNER_CSS}</style></head><body>
<script type="module" src="/amp-nav.js"></script><script src="/idanim.js" defer></script><amp-nav property="opensentience"></amp-nav>
${banner(`Conclusion \u00b7 after ${ORDER.length} chapters`)}
<div class="book">${sidebar('conclusion')}<main><p class="meta">Front matter, at the back</p><h1>${esc(CONC.title)}</h1><p class="lede">${esc(CONC.lede)}</p>
${CONC.sections.map((sec) => `<h2>${esc(sec.h)}</h2>${sec.p.map((t) => `<p>${esc(t)}</p>`).join('')}`).join('')}
<h2>The chain — thirty-two fragments, one world</h2>
<p>Each chapter contributed a fragment; the cumulative world was sealed after every one and checked to contain everything before it. Two chapters contributed the empty world and moved no id. The whole chain seals to <code>${conclusionSeal && conclusionSeal.ok ? esc(conclusionSeal.semanticId) : '?'}</code>: ${conclusionSeal && conclusionSeal.ok ? conclusionSeal.graph.nodes.length : '?'} objects, ${conclusionSeal && conclusionSeal.ok ? conclusionSeal.graph.edges.length : '?'} edges.</p>
<table class="claims"><tr><th>#</th><th>chapter</th><th>fragment seals to</th><th>chain seals to</th><th>objects / edges</th></tr>${chainIds.map((id) => { const c = chain.get(id); return `<tr><td>${c.index + 1}</td><td><a href="${id}.html">${esc(byId.get(id).name)}</a></td><td><code>${c.delta.semanticId.slice(0, 20)}…</code></td><td><code>${c.cum.semanticId.slice(0, 20)}…</code></td><td>${c.cum.graph.nodes.length} / ${c.cum.graph.edges.length}</td></tr>`; }).join('')}</table>
<h2>The circuit board</h2>
<p>The whole world as a network: one band per Part, signal flowing left to right from the root clock and the other clock domains, through relays that fan out (the routers) into spinners (state), orbs (observation) and doors (the switches that latch when a signal reaches them). ${conclusionSeal && conclusionSeal.ok ? `${conclusionSeal.graph.edges.length} wires, ${conclusionSeal.graph.edges.filter((e) => e[0] === 'SignalWire').length} of them signal, ${conclusionSeal.graph.nodes.filter((n) => n[0] === 'Relay').length} relays, ${conclusionSeal.graph.nodes.filter((n) => n[0] === 'Door').length} doors, ${conclusionSeal.graph.nodes.filter((n) => n[0] === 'Pulser').length} clocks.` : ''} Hover an object for its state in the current epoch.</p>
${conclusionFilm ? `<p>Reduced whole by TRVM's forge in ${conclusionFilm.execution_identity.seconds}s on ${esc(conclusionFilm.execution_identity.host)} — ${conclusionFilm.epochs.length} epochs, ${new Set(conclusionFilm.epochs.map((e) => e.film_hash)).size} distinct film hashes; the forge's id equals the seal above. Reduced by ${reducerLine(conclusionFilm)}.</p><div class="sf" id="board"><div class="sf-stage">${SF.svg(SF.computeState(boardScene(conclusionFilm, conclusionSeal.graph, 'The board before epoch 1.'), 0), { caption: false })}</div></div>` : `<div class="sf-static">${conclusionSeal && conclusionSeal.ok ? boardStatic(conclusionSeal.graph) : ''}</div><p class="warn">The whole-board film has not been reduced yet (<code>run-films.mjs conclusion</code>); the board above is the sealed topology.</p>`}
${conclusionFilm ? `<h2>The same film, chapter by chapter</h2><div class="sf" id="film"><div class="sf-stage">${SF.svg(SF.computeState(filmSceneFrom(conclusionFilm, conclusionSeal.graph, 'Every chapter\'s world at once, before epoch 1.'), 0), { caption: false })}</div></div>` : ''}
<details class="tech"><summary>The whole world, as WRL (${conclusionSrc ? conclusionSrc.split('\n').length : 0} lines)</summary><pre class="syn">${esc((conclusionSrc || '').trim())}</pre></details>
<h2>The numbers this page is allowed to quote</h2><p>${summary.patterns} records · ${summary.WITNESSED} WITNESSED · ${summary.STATED} STATED · ${summary.PROPOSED} PROPOSED · ${summary.anti_patterns} anti-patterns · ${[...sealed.values()].filter((x) => x.r.ok).length} WRL worlds sealed at build and ${[...sealed.values()].filter((x) => !x.r.ok).length} refused by design · ${films.size} worlds with a Film reduced by TRVM's forge (${[...films.values()].reduce((n, r) => n + r.epochs.length, 0)} epochs) — every one derived by <code>build.mjs</code>, none typed.</p>
<p>${summary.prior_art_works} prior-art relations are recorded, each with what it shares and where it differs, and ${summary.prior_art_not_searched} of them are marked <span class="rel not-searched">NOT SEARCHED</span> — named in this tree by someone who never opened the source. Every record also states what it does <em>not</em> establish. <b>${summary.REPRODUCED} of ${summary.patterns} have been reproduced outside this tree</b>, which is the rung above everything on this page and the one nothing here has reached.</p>
<p>Of the ${summary.counterexamples_resolved + summary.counterexamples_scoped + summary.counterexamples_marker_only} counterexamples that point at a file, <b>${summary.counterexamples_resolved} resolves a law id against the suite's own index</b>, ${summary.counterexamples_scoped} is scoped to its law's declaration without an index to resolve against, and ${summary.counterexamples_marker_only} check only that a string is present. A string being present proves a file mentions something, not that it refuses anything — and this catalog has now twice cited a law's <em>failure</em> message as evidence that the failure does not happen, the second time in a record that carried no law id and so never reached the check written for the first. Each page says which of the three it has.</p>
<div class="pn"><span><a href="${last.id}.html">← ${esc(last.name)}</a><small>${FAMILY_TITLE[last.family]}</small></span><span style="text-align:right"><a href="./">Catalog →</a></span></div>
<footer class="fin">Derived ${new Date().toISOString()} by <code>_patterns/build/build.mjs</code>.</footer></main></div><script type="module">import { mount, panZoom } from '/patterns/surface/surface.mjs?v=${SF_STAMP}'; for (const el of document.querySelectorAll('.sf-static')) panZoom(el, () => el.querySelector('svg'));${conclusionFilm ? ` mount(document.getElementById('board'), ${JSON.stringify(boardScene(conclusionFilm, conclusionSeal.graph, 'The board before epoch 1.'))}); mount(document.getElementById('film'), ${JSON.stringify(filmSceneFrom(conclusionFilm, conclusionSeal.graph, 'Every chapter\'s world at once, before epoch 1.'))});` : ''}</script></body></html>`;
const card = (p) => `<a class="card" href="${p.id}.html">${p.scene ? `<div class="thumb">${thumb(p)}</div>` : ''}<h3>${esc(p.name)} ${chip(p)}</h3><p>${esc(p.headline || p.invariant || (p.kind === 'definition' ? 'A definition.' : p.prior_art || ''))}</p></a>`;
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unboxed Patterns</title><meta name="description" content="Elements of Composable Locus-Oriented Software — a pattern catalog generated from a registry, with runnable witnesses."><link rel="stylesheet" href="/styles/site.css"><style>${SHELL_CSS}${BANNER_CSS}</style></head><body>
<script type="module" src="/amp-nav.js"></script><script src="/idanim.js" defer></script><amp-nav property="opensentience"></amp-nav>
${banner(`The catalog \u00b7 ${ORDER.length} chapters`)}
<div class="book">${sidebar(null)}<main>
<p class="meta">A catalog, and a book in progress</p>
<h1>Unboxed Patterns</h1>
<p class="lede"><em>Elements of Composable Locus-Oriented Software.</em> What recurring structures appear when computation is organized around persistent identity, locality, composition, authority, progress and observable semantic state — rather than around the class, the thread or the service?</p>
<p>Every pattern here is a named problem, the forces that make it costly, one invariant, and — where the tree has one — a check you can run on this page. Labels are derived, never typed: <span class="chip WITNESSED">WITNESSED</span> means a recorded run of a check exists for the exact bytes on disk at rung <code>in_tree</code> or above; <span class="chip STATED">STATED</span> means the tree says it and no run proves it; <span class="chip PROPOSED">PROPOSED</span> means the book names it and the tree does not. ${summary.WITNESSED} witnessed · ${summary.STATED} stated · ${summary.PROPOSED} proposed · ${summary.anti_patterns} anti-patterns. Plan and open rulings: <code>ProjectAmp2/UNBOXED_PATTERNS.md</code>.</p>
<p class="selfcrit">The two numbers this catalog is least comfortable with, up here rather than at the back. <b>${summary.REPRODUCED} of ${summary.patterns} patterns have been reproduced outside this tree</b> — every check on this site is ours, run against our own code. And of the ${summary.counterexamples_resolved + summary.counterexamples_scoped + summary.counterexamples_marker_only} counterexamples that point at a file, <b>${summary.counterexamples_resolved} resolves a law id against the suite's own index</b>, ${summary.counterexamples_scoped} is scoped to its law's declaration, and ${summary.counterexamples_marker_only} check only that a string is present — which proves a file mentions something, not that it refuses anything. Both numbers are derived on every build, and the <a href="conclusion.html">conclusion</a> carries the rest.</p>
${DATA.families.map((f) => `<h2>${FAMILY_TITLE[f]}</h2><div class="cards">${ORDER.filter((p) => p.family === f).map(card).join('')}</div>`).join('')}
<h2 id="anti">Patterns that should disappear</h2><ol class="take">${DATA.anti_patterns.map((a) => `<li id="anti-${a.id}"><b>${esc(a.name)}</b>${esc(a.problem)}${a.paid_for ? ` <small>· paid for at ${esc(a.paid_for)}</small>` : ''}</li>`).join('')}</ol>
${findings.length ? `<h2>Findings from this build</h2><ul>${findings.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
<footer class="fin">Derived ${new Date().toISOString()} by <code>_patterns/build/build.mjs</code>. Machine-readable: <a href="llms.txt">llms.txt</a> · <a href="patterns.derived.json">patterns.derived.json</a> · <a href="graph.json">graph.json</a> (${graph.counts.nodes} nodes, ${graph.counts.edges} typed edges) · <a href="artifact.json">artifact.json</a>.</footer>
</main></div></body></html>`;
const llms = [`# Unboxed Patterns — registry (P1, derived ${new Date().toISOString().slice(0, 10)})`, `# ${summary.patterns} records · ${summary.WITNESSED} WITNESSED · ${summary.STATED} STATED · ${summary.PROPOSED} PROPOSED · ${summary.anti_patterns} anti-patterns. Labels are derived by build.mjs, never typed. WITNESSED = a recorded run of a check on these exact bytes exists at rung ≥ in_tree.`, '', ...derived.map((p) => `- ${p.id} [${p.derived.label ?? p.kind}] (${p.family}) — ${p.invariant ?? '(no invariant)'}${p.witness ? ` — witness: ${p.witness.path} (${p.witness.shape}, ${p.witness.rung}${p.derived.EXECUTED ? ', executed' : ', NOT executed'})` : ''}`), '', '## anti-patterns', ...DATA.anti_patterns.map((a) => `- ${a.id} — ${a.problem}`)].join('\n') + '\n';
const derivedJson = JSON.stringify({ kind: 'UNBOXED_PATTERNS_DERIVED', built: new Date().toISOString(), inputs_heads: heads, summary, findings, patterns: derived, anti_patterns: DATA.anti_patterns }, null, 2) + '\n';


const DIST = join(SITE, 'patterns');   // SERVED at opensentience.org/patterns/ — ruling R4, 2026-09-11
// A section sitemap. Pages redirects <id>.html to the clean URL with a 308, so the CANONICAL url —
// the one listed here and the one every page now declares — has no extension. Without this file the
// 33 chapters are reachable only by following two links from the homepage, which is why an external
// crawler asked for /patterns on 2026-09-13 and was handed the OpenSentience root instead.
const SITE_URL = 'https://opensentience.org';
const canonicalOf = (k) => SITE_URL + '/patterns/' + (k === 'index.html' ? '' : k.replace(/\.html$/, ''));
const sitemapKeys = ['index.html', ...ORDER.map((p) => `${p.id}.html`), 'conclusion.html'];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapKeys.map((k) => `  <url><loc>${canonicalOf(k)}</loc><lastmod>${new Date().toISOString()}</lastmod><priority>${k === 'index.html' ? '1.0' : '0.7'}</priority></url>`).join('\n')}
</urlset>
`;
const outputs = { 'patterns.derived.json': derivedJson, 'graph.json': JSON.stringify(graph, null, 1) + '\n', 'index.html': html, 'llms.txt': llms, 'sitemap.xml': sitemap, ...pageOutputs };
const inputs = { 'data/patterns.json': shaFile(join(HERE, '../data/patterns.json')), '_invariants/data/cells.json': shaFile(join(SITE, '_invariants/data/cells.json')), 'CLAIM_LEDGER.json': shaFile(join(ROOT, 'CLAIM_LEDGER.json')), receipts: Object.fromEntries(receipts.map((r) => [r.witness.path, r.source_identity.sha256])), live_receipts: Object.fromEntries([...liveReceipts.entries()].map(([id, r]) => [id, `${r.source_identity.stamp}:${r.execution_identity.passing}/${r.execution_identity.total}`])), chain: Object.fromEntries([...chain.entries()].map(([id, c]) => [id, c.cum.semanticId])), chain_films: Object.fromEntries([...chain.entries()].filter(([, c]) => c.film).map(([id, c]) => [id, c.film.source_identity.world_sha256.slice(0, 16) + ':' + c.film.epochs.length])), conclusion_film: conclusionFilm ? conclusionFilm.source_identity.world_sha256.slice(0, 16) + ':' + conclusionFilm.epochs.length : null, conclusion: conclusionSeal && conclusionSeal.ok ? conclusionSeal.semanticId : null, films: Object.fromEntries([...films.entries()].map(([f, r]) => [f, r.source_identity.world_sha256.slice(0, 16) + ':' + r.epochs.length])), 'WRL/wrl.js': WRLJS_SHA, wrl_worlds: Object.fromEntries([...sealed.entries()].map(([f, x]) => [f, x.r.ok ? x.r.semanticId : x.r.code])) };
// the artifact excludes the timestamps so --verify compares content, not clock
// the artifact excludes timestamps AND run durations so --verify compares content, not clock. A live
// witness reporting the same result in 7.5 s and 13.7 s has not changed what it derives; the duration
// is displayed because it is informative (10 s vs 0.2 s says these are different suites) and hashed
// out for the same reason the build's own footer timestamp is.
const stable = (s) => s.replace(/\d{4}-\d\d-\d\dT[\d:.]+Z/g, 'T').replace(/[\d.]+\s*ms\b/g, 'D ms');
const artifact = { kind: 'UNBOXED_PATTERNS_ARTIFACT', inputs, inputs_heads: heads, summary, outputs: Object.fromEntries(Object.entries(outputs).map(([k, v]) => [k, sha(stable(v))])) };

if (VERIFY) {
  const onDisk = existsSync(join(DIST, 'artifact.json')) ? readJson(join(DIST, 'artifact.json')) : null;
  if (!onDisk) { console.error('✗ --verify: no dist/artifact.json'); process.exit(1); }
  const diffs = [];
  if (JSON.stringify(onDisk.inputs) !== JSON.stringify(inputs)) diffs.push('inputs changed since the artifact was built');
  for (const [k, h] of Object.entries(artifact.outputs)) { const f = join(DIST, k); if (!existsSync(f)) diffs.push(`${k} missing`); else if (sha(stable(readFileSync(f, 'utf8'))) !== h) diffs.push(`${k} on disk is not what these inputs derive`); }
  if (JSON.stringify(onDisk.summary) !== JSON.stringify(summary)) diffs.push('summary on disk differs from derived');
  if (diffs.length) { console.error('✗ --verify:\n  ' + diffs.join('\n  ')); process.exit(1); }
  console.log(`✓ --verify: patterns/ is what data + cells + ledger + ${receipts.length} receipt(s) derive.`); console.log(JSON.stringify(summary, null, 1)); process.exit(0);
}
mkdirSync(DIST, { recursive: true });
for (const sub of ['demos', 'scenes', 'surface', 'wrl', 'wrl/chain', 'films']) mkdirSync(join(DIST, sub), { recursive: true });
for (const [k, v] of Object.entries(outputs)) writeFileSync(join(DIST, k), v);
writeFileSync(join(DIST, 'artifact.json'), JSON.stringify(artifact, null, 2) + '\n');
console.log(`✓ built ${Object.keys(outputs).length} file(s) into ${rel(DIST)}\n`);
console.log(JSON.stringify(summary, null, 1));
if (findings.length) console.log('\nfindings:\n  ' + findings.join('\n  '));
