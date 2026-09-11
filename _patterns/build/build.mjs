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
 * Emits _patterns/dist/{patterns.derived.json, index.html, llms.txt, artifact.json}. dist/ is NOT a served
 * path — where the catalog is served is ruling R4 and this build does not decide it.
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

const DATA = readJson(join(HERE, '../data/patterns.json'));
const CELLS = readJson(join(SITE, '_invariants/data/cells.json')).cells;
const LEDGER = readJson(join(ROOT, 'CLAIM_LEDGER.json'));
const RULES = readJson(join(ROOT, 'scripts/messaging-rules.json')).rules;
const RECEIPT_DIR = join(HERE, '../receipts');
const receipts = existsSync(RECEIPT_DIR) ? readdirSync(RECEIPT_DIR).filter((f) => f.endsWith('.json')).map((f) => readJson(join(RECEIPT_DIR, f))) : [];

const LADDER = ['spec', 'in_tree', 'live_local', 'live_deployed', 'external'];
const EVIDENCE_KINDS = new Set(LEDGER.claims.map((c) => c.evidence_kind).filter(Boolean));   // the ledger's vocabulary, not ours
const CLAIMS = new Map(LEDGER.claims.map((c) => [c.claim_id, c]));
const CELLNUMS = new Set(CELLS.map((c) => c.num));
const SUPPORT_OK = new Set(['PROVED', 'KNOWN', 'MEASURED', 'CONDITIONAL']);
const RUNNABLE = new Set(['suite', 'side-effect', 'lint']);
const DERIVED_FIELDS = ['label', 'CHECKABLE', 'RUNNABLE', 'EXECUTED', 'WITNESSED', 'STAGED', 'runs_on_page'];

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
    if (!readFileSync(abs, 'utf8').includes(c.marker)) refuse('P8-COUNTEREXAMPLE', `${p.id}: marker "${c.marker}" not found in ${c.path}`);
    return;
  }
  refuse('P8-COUNTEREXAMPLE', `${p.id}: unknown counterexample shape ${c.shape}`);
}

const derived = [];
for (const p of DATA.patterns) {
  if (!['definition', 'pattern'].includes(p.kind)) refuse('P1-KIND', `${p.id}: ${p.kind}`);
  if (!DATA.families.includes(p.family)) refuse('P1-FAMILY', `${p.id}: ${p.family}`);
  for (const n of p.cells || []) if (!CELLNUMS.has(n)) refuse('P4-CELL', `${p.id}: cell ${n} not in cells.json`);
  const claimStatuses = [];
  for (const id of p.claims || []) {
    const c = CLAIMS.get(id);
    if (!c) { refuse('P5-CLAIM', `${p.id}: ${id} not in CLAIM_LEDGER.json`); continue; }
    if (c.status === 'REFUTED') refuse('P6-REFUTED-SUPPORT', `${p.id} cites ${id}, which is REFUTED`);
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
  derived.push({ ...p, derived: { label, CHECKABLE, RUNNABLE: RUNNABLE_, EXECUTED, STAGED, execution: exec && exec.receipt ? { at: exec.receipt.execution_identity.started, host: exec.receipt.execution_identity.host, sha256: exec.receipt.source_identity.sha256, repo_head: exec.receipt.source_identity.repo_head } : (exec && exec.at ? { at: exec.at, note: exec.why } : null), claim_statuses: claimStatuses, cell_statuses: (p.cells || []).map((n) => ({ num: n, status: CELLS.find((c) => c.num === n).status })) } });
}
for (const a of DATA.anti_patterns) for (const f of ['label']) if (f in a) refuse('P0-TYPED-DERIVED', a.id);

if (refusals.length) { console.error(`\n✗ ${refusals.length} refusal(s):\n  ` + refusals.join('\n  ')); process.exit(1); }

// ── counts, derived ────────────────────────────────────────────────────────────
const count = (f) => derived.filter(f).length;
const summary = {
  patterns: DATA.patterns.length, definitions: count((p) => p.kind === 'definition'), anti_patterns: DATA.anti_patterns.length,
  WITNESSED: count((p) => p.derived.label === 'WITNESSED'), STATED: count((p) => p.derived.label === 'STATED'), PROPOSED: count((p) => p.derived.label === 'PROPOSED'),
  CHECKABLE: count((p) => p.derived.CHECKABLE), RUNNABLE: count((p) => p.derived.RUNNABLE), EXECUTED: count((p) => p.derived.EXECUTED), STAGED: count((p) => p.derived.STAGED),
  invariant_null: count((p) => p.kind === 'pattern' && !p.invariant),
  by_family: Object.fromEntries(DATA.families.map((f) => [f, count((p) => p.family === f)])),
  witnessed_ids: derived.filter((p) => p.derived.label === 'WITNESSED').map((p) => p.id),
};
const heads = Object.fromEntries(['.', 'opensentience.org', 'WRL', 'TRVM', 'AmpersandBoxDesign', 'graphonomous', 'computedriven', 'super'].map((d) => { try { return [d, execSync('git rev-parse HEAD', { cwd: join(ROOT, d), stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()]; } catch { return [d, null]; } }));

// ── emit ───────────────────────────────────────────────────────────────────────
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
const row = (p) => `<tr><td><code>${p.id}</code></td><td>${esc(p.name)}</td><td>${p.family}</td><td class="l ${p.derived.label || 'none'}">${p.derived.label ?? '—'}</td><td>${['CHECKABLE', 'RUNNABLE', 'EXECUTED', 'STAGED'].filter((k) => p.derived[k]).join(' ') || '—'}</td><td>${p.witness ? `<code>${esc(p.witness.path)}</code> <small>${p.witness.shape} · ${p.witness.rung}</small>` : '—'}</td><td>${esc(p.invariant ?? (p.kind === 'definition' ? '(definition)' : '(no invariant — gap/open)'))}</td></tr>`;
const html = `<!doctype html><meta charset="utf-8"><title>Unboxed Patterns — P1 derived index</title>
<style>body{font:14px/1.45 system-ui;margin:2rem;max-width:1400px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:.3rem .5rem;vertical-align:top}th{text-align:left;background:#f3f3f3}.WITNESSED{color:#0a7;font-weight:600}.STATED{color:#a60}.PROPOSED{color:#c00}.none{color:#888}small{color:#666}code{font-size:12px}.note{background:#fff8e1;padding:.6rem 1rem;border-left:4px solid #e0a800}</style>
<h1>Unboxed Patterns — P1 derived index</h1>
<p class="note"><strong>Not a published page.</strong> Emitted by <code>_patterns/build/build.mjs</code> to <code>_patterns/dist/</code>; where the catalog is served is ruling R4. Every count and label below is derived; none is typed. Built ${new Date().toISOString()}.</p>
<p><strong>${summary.patterns}</strong> records (${summary.definitions} definitions) · <strong>${summary.anti_patterns}</strong> anti-patterns · labels: <span class="WITNESSED">${summary.WITNESSED} WITNESSED</span> · <span class="STATED">${summary.STATED} STATED</span> · <span class="PROPOSED">${summary.PROPOSED} PROPOSED</span> · standings: ${summary.CHECKABLE} checkable · ${summary.RUNNABLE} runnable · ${summary.EXECUTED} executed · ${summary.STAGED} staged · ${summary.invariant_null} pattern(s) with no invariant (gap/open).</p>
${findings.length ? `<h2>Findings</h2><ul>${findings.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
<table><tr><th>id</th><th>name</th><th>family</th><th>label</th><th>standings</th><th>witness</th><th>invariant</th></tr>${derived.map(row).join('\n')}</table>
<h2>Anti-patterns</h2><table><tr><th>id</th><th>name</th><th>problem</th><th>paid for at</th></tr>${DATA.anti_patterns.map((a) => `<tr><td><code>${a.id}</code></td><td>${esc(a.name)}</td><td>${esc(a.problem)}</td><td>${esc(a.paid_for ?? '—')}</td></tr>`).join('\n')}</table>`;
const llms = [`# Unboxed Patterns — registry (P1, derived ${new Date().toISOString().slice(0, 10)})`, `# ${summary.patterns} records · ${summary.WITNESSED} WITNESSED · ${summary.STATED} STATED · ${summary.PROPOSED} PROPOSED · ${summary.anti_patterns} anti-patterns. Labels are derived by build.mjs, never typed. WITNESSED = a recorded run of a check on these exact bytes exists at rung ≥ in_tree.`, '', ...derived.map((p) => `- ${p.id} [${p.derived.label ?? p.kind}] (${p.family}) — ${p.invariant ?? '(no invariant)'}${p.witness ? ` — witness: ${p.witness.path} (${p.witness.shape}, ${p.witness.rung}${p.derived.EXECUTED ? ', executed' : ', NOT executed'})` : ''}`), '', '## anti-patterns', ...DATA.anti_patterns.map((a) => `- ${a.id} — ${a.problem}`)].join('\n') + '\n';
const derivedJson = JSON.stringify({ kind: 'UNBOXED_PATTERNS_DERIVED', built: new Date().toISOString(), inputs_heads: heads, summary, findings, patterns: derived, anti_patterns: DATA.anti_patterns }, null, 2) + '\n';

const DIST = join(HERE, '../dist');
const outputs = { 'patterns.derived.json': derivedJson, 'index.html': html, 'llms.txt': llms };
const inputs = { 'data/patterns.json': shaFile(join(HERE, '../data/patterns.json')), '_invariants/data/cells.json': shaFile(join(SITE, '_invariants/data/cells.json')), 'CLAIM_LEDGER.json': shaFile(join(ROOT, 'CLAIM_LEDGER.json')), receipts: Object.fromEntries(receipts.map((r) => [r.witness.path, r.source_identity.sha256])) };
// the artifact excludes the timestamps so --verify compares content, not clock
const stable = (s) => s.replace(/\d{4}-\d\d-\d\dT[\d:.]+Z/g, 'T');
const artifact = { kind: 'UNBOXED_PATTERNS_ARTIFACT', inputs, inputs_heads: heads, summary, outputs: Object.fromEntries(Object.entries(outputs).map(([k, v]) => [k, sha(stable(v))])) };

if (VERIFY) {
  const onDisk = existsSync(join(DIST, 'artifact.json')) ? readJson(join(DIST, 'artifact.json')) : null;
  if (!onDisk) { console.error('✗ --verify: no dist/artifact.json'); process.exit(1); }
  const diffs = [];
  if (JSON.stringify(onDisk.inputs) !== JSON.stringify(inputs)) diffs.push('inputs changed since the artifact was built');
  for (const [k, h] of Object.entries(artifact.outputs)) { const f = join(DIST, k); if (!existsSync(f)) diffs.push(`${k} missing`); else if (sha(stable(readFileSync(f, 'utf8'))) !== h) diffs.push(`${k} on disk is not what these inputs derive`); }
  if (JSON.stringify(onDisk.summary) !== JSON.stringify(summary)) diffs.push('summary on disk differs from derived');
  if (diffs.length) { console.error('✗ --verify:\n  ' + diffs.join('\n  ')); process.exit(1); }
  console.log(`✓ --verify: dist/ is what data + cells + ledger + ${receipts.length} receipt(s) derive.`); console.log(JSON.stringify(summary, null, 1)); process.exit(0);
}
mkdirSync(DIST, { recursive: true });
for (const [k, v] of Object.entries(outputs)) writeFileSync(join(DIST, k), v);
writeFileSync(join(DIST, 'artifact.json'), JSON.stringify(artifact, null, 2) + '\n');
console.log(`✓ built ${Object.keys(outputs).length} file(s) into ${rel(DIST)}\n`);
console.log(JSON.stringify(summary, null, 1));
if (findings.length) console.log('\nfindings:\n  ' + findings.join('\n  '));
