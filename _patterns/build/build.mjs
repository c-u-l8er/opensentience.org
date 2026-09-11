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
const row = (p) => `<tr><td><a href="${p.id}.html"><code>${p.id}</code></a></td><td>${esc(p.name)}</td><td>${p.family}</td><td class="l ${p.derived.label || 'none'}">${p.derived.label ?? '—'}</td><td>${['CHECKABLE', 'RUNNABLE', 'EXECUTED', 'STAGED'].filter((k) => p.derived[k]).join(' ') || '—'}</td><td>${p.witness ? `<code>${esc(p.witness.path)}</code> <small>${p.witness.shape} · ${p.witness.rung}</small>` : '—'}</td><td>${esc(p.invariant ?? (p.kind === 'definition' ? '(definition)' : '(no invariant — gap/open)'))}</td></tr>`;
const html = `<!doctype html><meta charset="utf-8"><title>Unboxed Patterns — catalog</title>
<style>body{font:14px/1.45 system-ui;margin:0 auto;padding:72px 1.5rem 3rem;max-width:1400px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:.3rem .5rem;vertical-align:top}th{text-align:left;background:#f3f3f3}.WITNESSED{color:#0a7;font-weight:600}.STATED{color:#a60}.PROPOSED{color:#c00}.none{color:#888}small{color:#666}code{font-size:12px}.note{background:#fff8e1;padding:.6rem 1rem;border-left:4px solid #e0a800}</style>
<script type="module" src="/amp-nav.js"></script><amp-nav property="opensentience"></amp-nav>
<h1>Unboxed Patterns</h1>
<p><em>Elements of Composable Locus-Oriented Software</em> — a pattern catalog generated from a registry. Every count and label below is derived by <code>_patterns/build/build.mjs</code> from the registry, the invariants table, the claim ledger and execution receipts; none is typed. A pattern is <strong>WITNESSED</strong> only when a recorded run of a check exists for the exact bytes on disk at rung <code>in_tree</code> or above; <strong>STATED</strong> when the tree says it and no run proves it; <strong>PROPOSED</strong> when the book names it and the tree does not. Plan and rulings: <code>ProjectAmp2/UNBOXED_PATTERNS.md</code>. Built ${new Date().toISOString()}.</p>
<p><strong>${summary.patterns}</strong> records (${summary.definitions} definitions) · <strong>${summary.anti_patterns}</strong> anti-patterns · labels: <span class="WITNESSED">${summary.WITNESSED} WITNESSED</span> · <span class="STATED">${summary.STATED} STATED</span> · <span class="PROPOSED">${summary.PROPOSED} PROPOSED</span> · standings: ${summary.CHECKABLE} checkable · ${summary.RUNNABLE} runnable · ${summary.EXECUTED} executed · ${summary.STAGED} staged · ${summary.invariant_null} pattern(s) with no invariant (gap/open).</p>
${findings.length ? `<h2>Findings</h2><ul>${findings.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
<table><tr><th>id</th><th>name</th><th>family</th><th>label</th><th>standings</th><th>witness</th><th>invariant</th></tr>${derived.map(row).join('\n')}</table>
<h2>Anti-patterns</h2><table><tr><th>id</th><th>name</th><th>problem</th><th>paid for at</th></tr>${DATA.anti_patterns.map((a) => `<tr><td><code>${a.id}</code></td><td>${esc(a.name)}</td><td>${esc(a.problem)}</td><td>${esc(a.paid_for ?? '—')}</td></tr>`).join('\n')}</table>`;
const llms = [`# Unboxed Patterns — registry (P1, derived ${new Date().toISOString().slice(0, 10)})`, `# ${summary.patterns} records · ${summary.WITNESSED} WITNESSED · ${summary.STATED} STATED · ${summary.PROPOSED} PROPOSED · ${summary.anti_patterns} anti-patterns. Labels are derived by build.mjs, never typed. WITNESSED = a recorded run of a check on these exact bytes exists at rung ≥ in_tree.`, '', ...derived.map((p) => `- ${p.id} [${p.derived.label ?? p.kind}] (${p.family}) — ${p.invariant ?? '(no invariant)'}${p.witness ? ` — witness: ${p.witness.path} (${p.witness.shape}, ${p.witness.rung}${p.derived.EXECUTED ? ', executed' : ', NOT executed'})` : ''}`), '', '## anti-patterns', ...DATA.anti_patterns.map((a) => `- ${a.id} — ${a.problem}`)].join('\n') + '\n';
const derivedJson = JSON.stringify({ kind: 'UNBOXED_PATTERNS_DERIVED', built: new Date().toISOString(), inputs_heads: heads, summary, findings, patterns: derived, anti_patterns: DATA.anti_patterns }, null, 2) + '\n';


// ── pattern pages (P2) ─────────────────────────────────────────────────────────
// A RUN BUTTON MAY NOT OUTRUN ITS EVIDENCE (the invariants build's R28, extended): a page offers a run
// button only when the witness is STAGED byte-identical under /witness/src/; a demo module for a pattern
// whose witness is not staged is refused (P12) — an illustration with no evidence beside it on the page.
const DEMOS = join(HERE, '../demos');
const stampFor = (p) => shaFile(join(ROOT, p)).slice(0, 16);
const RUNJS_STAMP = shaFile(join(SITE, 'witness/run.js')).slice(0, 16);
for (const p of derived) {
  const demo = join(DEMOS, p.id + '.mjs');
  if (existsSync(demo) && !p.derived.STAGED) refuse('P12-DEMO-WITHOUT-STAGED-WITNESS', `${p.id} has a demo module but its witness is not staged on this site`);
}
if (refusals.length) { console.error(`\n✗ ${refusals.length} refusal(s):\n  ` + refusals.join('\n  ')); process.exit(1); }
const byId = new Map(derived.map((p) => [p.id, p]));
const antiById = new Map(DATA.anti_patterns.map((a) => [a.id, a]));
const para = (t) => t ? `<p>${esc(t)}</p>` : '';
const section = (title, body) => body ? `<section><h2>${title}</h2>${body}</section>` : '';
const list = (xs) => xs && xs.length ? `<ul>${xs.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
const link = (id) => byId.has(id) ? `<a href="${id}.html">${esc(byId.get(id).name)}</a> <small class="l ${byId.get(id).derived.label || 'none'}">${byId.get(id).derived.label ?? byId.get(id).kind}</small>` : esc(id);
function pageFor(p) {
  const d = p.derived, w = p.witness, c = p.counterexample;
  const stamp = w && d.STAGED ? stampFor(w.staged_path) : null;
  const demo = existsSync(join(DEMOS, p.id + '.mjs'));
  const standings = ['CHECKABLE', 'RUNNABLE', 'EXECUTED', 'STAGED'].map((k) => `<span class="st ${d[k] ? 'on' : 'off'}">${k}</span>`).join(' ');
  const exec = d.execution ? `<p class="exec">Execution identity: ${esc(d.execution.at)}${d.execution.host ? ` on <code>${esc(d.execution.host)}</code>` : ''}${d.execution.sha256 ? ` · bytes <code>${d.execution.sha256.slice(0, 16)}…</code> · repo HEAD <code>${(d.execution.repo_head || '?').slice(0, 12)}</code>` : d.execution.note ? ` — ${esc(d.execution.note)}` : ''}</p>` : `<p class="exec warn">No execution record: this check has not been run for the bytes on disk. WITNESSED requires one.</p>`;
  const witness = w ? `<p>Source identity: <code>${esc(w.path)}</code> · shape <code>${w.shape}</code>${w.evidence_kind ? ` · evidence kind <code>${w.evidence_kind}</code>` : ''} · rung <code>${w.rung}</code> <small>(${esc(w.rung_source)})</small></p>${exec}
    ${d.STAGED ? `<p>Staged byte-identical at <code>${esc(w.staged_path)}</code> (stamp <code>${stamp}</code>). <button id="run">Run the witness here</button> <span id="wstatus" class="wstatus"></span></p><div id="wsink" class="sink"></div>`
               : `<p class="warn">Not staged on this site: the page cannot run this witness. ${d.RUNNABLE ? 'It runs from the command line: <code>' + esc(w.cmd) + '</code> in <code>' + esc(w.cwd) + '</code>.' : 'Its shape (' + w.shape + ') is a document, not a run.'}</p>`}`
    : `<p class="warn">No witness. ${p.kind === 'definition' ? 'A definition carries no evidence rung (AGENCY.md §6).' : 'This pattern is ' + (d.label || 'unlabelled') + ' — the tree has no check for its invariant.'}</p>`;
  const cex = c ? `<p>${c.shape === 'lint' ? `A sentence the ontology gate rejects: <q>${esc(c.sentence)}</q> — expected <code>REFUSED</code>.` : c.shape === 'fixture' ? `Fixture <code>${esc(c.path)}</code>: ${c.expected_count} vectors, each expected <code>REFUSED</code>.` : `<code>${esc(c.path)}</code> — ${c.law ? `law <code>${esc(c.law)}</code>, ` : ''}marker <q>${esc(c.marker)}</q>, expected <code>${c.expected}</code>.`}</p>${c.note ? `<p class="note">${esc(c.note)}</p>` : ''}${demo && d.STAGED ? `<p><button id="demo">Show the refusal</button> <small>illustration — imports the same staged modules; the suite above is the evidence</small></p><div id="dsink" class="sink"></div>` : ''}`
    : `<p class="warn">No counterexample shipped${d.label === 'WITNESSED' ? ' — the build would have refused this' : ' (required only when WITNESSED)'}.</p>`;
  const script = (d.STAGED || demo) ? `<script type="module">
    import { runWitness } from '/witness/run.js?v=${RUNJS_STAMP}';
    const spec = ${JSON.stringify({ entry: '/witness/src/' + (w ? w.path : ''), mode: w ? (w.shape === 'suite' ? 'suite' : 'side-effect') : 'suite', stamp, argv: [], trials: 200 })};
    const b = document.getElementById('run');
    if (b) b.addEventListener('click', () => runWitness({ spec, sink: document.getElementById('wsink'), status: document.getElementById('wstatus'), button: b }));
    const db = document.getElementById('demo');
    if (db) db.addEventListener('click', async () => { db.disabled = true; try { const m = await import('./demos/${p.id}.mjs?v=${stamp}'); await m.run(document.getElementById('dsink'), { stamp: '${stamp}' }); } catch (e) { document.getElementById('dsink').textContent = 'demo failed: ' + e.message; } db.disabled = false; });
  </script>` : '';
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(p.name)} · Unboxed Patterns</title>
<style>body{font:16px/1.55 Georgia,serif;margin:0;color:#1b1b1b;background:#fff}main{max-width:820px;margin:0 auto;padding:72px 1.2rem 4rem}.banner{background:#f5f5f5;border-left:4px solid #1b1b1b;padding:.6rem 1rem;font:14px system-ui}.banner a{color:#1b1b1b;font-weight:600;text-decoration:none}h1{font-size:2rem;margin:.6rem 0 .2rem}h2{font:600 15px system-ui;letter-spacing:.06em;text-transform:uppercase;color:#555;margin:2rem 0 .4rem}.meta{font:14px system-ui;color:#444}.l{font:600 12px system-ui;padding:.1rem .4rem;border-radius:3px}.WITNESSED{background:#e6f7ef;color:#0a7}.STATED{background:#fff3e0;color:#a60}.PROPOSED{background:#fde8e8;color:#c00}.none{background:#eee;color:#666}.st{font:12px system-ui;padding:.05rem .35rem;border:1px solid #ccc;border-radius:3px}.st.on{border-color:#0a7;color:#0a7}.st.off{color:#aaa;text-decoration:line-through}.invariant{font:18px/1.5 Georgia,serif;border-left:3px solid #1b1b1b;padding:.4rem 1rem;margin:1rem 0;background:#fafafa}.reg{margin:.4rem 0}.reg b{font:600 12px system-ui;color:#777;text-transform:uppercase;letter-spacing:.06em;display:block}.sink{font:13px/1.45 ui-monospace,monospace;background:#111;color:#ddd;padding:.8rem;border-radius:4px;min-height:1.5rem;max-height:28rem;overflow:auto;margin:.5rem 0;white-space:pre-wrap}.wline.good{color:#7fd}.wline.bad{color:#f88}.wline.warn{color:#fd7}.wline.group{color:#9cf;margin-top:.5rem}.wline.muted{color:#888}.wstatus.running{color:#a60}.wstatus.pass{color:#0a7}.wstatus.fail{color:#c00}code{font:13px ui-monospace,monospace;background:#f3f3f3;padding:0 .2rem}.warn{color:#a60}.exec{font:14px system-ui}.note{font:14px system-ui;color:#555;background:#f7f7f7;padding:.4rem .8rem}button{font:600 14px system-ui;padding:.35rem .8rem;border:1px solid #1b1b1b;background:#fff;cursor:pointer}button:disabled{opacity:.5}q{font-style:italic}.two{display:grid;grid-template-columns:1fr 1fr;gap:1rem}@media(max-width:640px){.two{grid-template-columns:1fr}}footer{font:13px system-ui;color:#666;margin-top:3rem;border-top:1px solid #ddd;padding-top:1rem}</style>
<script type="module" src="/amp-nav.js"></script><amp-nav property="opensentience"></amp-nav>
<main>
<div class="banner"><a href="./">Unboxed Patterns</a> — <em>Elements of Composable Locus-Oriented Software</em> · every label and count on this page is derived by <code>build.mjs</code>; nothing here is typed.</div>
<h1>${esc(p.name)}</h1>
<p class="meta">family <code>${p.family}</code> · <span class="l ${d.label || 'none'}">${d.label ?? p.kind}</span> · ${standings}</p>
${p.invariant ? `<div class="invariant">${esc(p.invariant)}</div>` : ''}
${p.headline ? `<div class="reg"><b>headline</b>${esc(p.headline)}</div>` : ''}${p.explanatory ? `<div class="reg"><b>explanatory</b>${esc(p.explanatory)}</div>` : ''}${p.technical ? `<div class="reg"><b>technical</b>${esc(p.technical)}</div>` : ''}
${section('Problem', para(p.problem))}${section('Forces', para(p.forces))}${section('Construction', para(p.construction))}
${p.transformations ? section('Transformations', `<div class="two"><div><b>Allowed</b>${list(p.transformations.allowed)}</div><div><b>Forbidden</b>${list(p.transformations.forbidden)}</div></div>`) : ''}
${p.failure_mode ? section('Failure mode it answers', `<p><b>${esc(antiById.get(p.failure_mode).name)}</b> — ${esc(antiById.get(p.failure_mode).problem)}${antiById.get(p.failure_mode).paid_for ? ` <small>Paid for at: ${esc(antiById.get(p.failure_mode).paid_for)}</small>` : ''}</p>`) : ''}
${section('Consequences', para(p.consequences))}
${section('Witness', witness)}
${section('Counterexample', cex)}
${(p.cells || []).length || (p.claims || []).length ? section('Cells and claims cited', `${d.cell_statuses.map((x) => `<p>cell <code>${x.num}</code> — status <code>${x.status}</code> (from cells.json)</p>`).join('')}${(p.claims || []).map((id, i) => `<p>claim <code>${esc(id)}</code> — <code>${d.claim_statuses[i]}</code> (from CLAIM_LEDGER.json)</p>`).join('')}`) : ''}
${section('Prior art', para(p.prior_art))}
${section('Realizations in the tree', list(p.realizations))}
${section('Related', (p.related || []).length ? `<p>${p.related.map(link).join(' · ')}</p>` : '')}
<footer>Derived ${new Date().toISOString()} by <code>opensentience.org/_patterns/build/build.mjs</code> from <code>data/patterns.json</code>, <code>_invariants/data/cells.json</code>, <code>CLAIM_LEDGER.json</code> and <code>_patterns/receipts/</code>. ${p.kind === 'pattern' && !(p.problem) ? 'Thin record: prose not yet authored; the invariant, witness and prior art are the record.' : ''}</footer>
</main>${script}`;
}
const pageOutputs = {};
for (const p of derived) pageOutputs[`${p.id}.html`] = pageFor(p);
for (const f of existsSync(DEMOS) ? readdirSync(DEMOS) : []) pageOutputs[`demos/${f}`] = readFileSync(join(DEMOS, f), 'utf8');

const DIST = join(SITE, 'patterns');   // SERVED at opensentience.org/patterns/ — ruling R4, 2026-09-11
const outputs = { 'patterns.derived.json': derivedJson, 'index.html': html, 'llms.txt': llms, ...pageOutputs };
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
  console.log(`✓ --verify: patterns/ is what data + cells + ledger + ${receipts.length} receipt(s) derive.`); console.log(JSON.stringify(summary, null, 1)); process.exit(0);
}
mkdirSync(DIST, { recursive: true });
mkdirSync(join(DIST, 'demos'), { recursive: true });
for (const [k, v] of Object.entries(outputs)) writeFileSync(join(DIST, k), v);
writeFileSync(join(DIST, 'artifact.json'), JSON.stringify(artifact, null, 2) + '\n');
console.log(`✓ built ${Object.keys(outputs).length} file(s) into ${rel(DIST)}\n`);
console.log(JSON.stringify(summary, null, 1));
if (findings.length) console.log('\nfindings:\n  ' + findings.join('\n  '));
