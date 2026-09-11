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
const stampFor = (p) => shaFile(join(ROOT, p)).slice(0, 16);
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
const SHELL_CSS = `body{margin:0;background:var(--ink,#faf8f3);color:var(--fg,#1c1a17);font:17px/1.6 var(--display,Georgia,serif)}
.book{display:grid;grid-template-columns:270px minmax(0,1fr);gap:2.5rem;max-width:1180px;margin:0 auto;padding:76px var(--gutter,1.5rem) 4rem}
.side{position:sticky!important;top:76px;height:auto;width:auto;background:transparent;box-shadow:none;align-self:start;max-height:calc(100vh - 90px);overflow:auto;font:13px/1.5 var(--ui,system-ui);padding-right:.5rem;border-right:1px solid var(--line,#e7e0d2)}
.side-home{display:block;font:700 15px var(--ui,system-ui);color:var(--acc,#6d3bd4);text-decoration:none;margin:.2rem 0 .8rem}.side-fam{font:600 11px var(--ui,system-ui);letter-spacing:.08em;text-transform:uppercase;color:var(--fg3,#666);margin:.9rem 0 .2rem}
.side ul{list-style:none;margin:0;padding:0}.side li{padding:.15rem 0;display:flex;gap:.4rem;align-items:baseline}.side li a{color:var(--fg,#1c1a17);text-decoration:none}.side li.cur a{color:var(--acc,#6d3bd4);font-weight:600}
.chip{font:600 10px var(--ui,system-ui);padding:.05rem .35rem;border-radius:3px;white-space:nowrap}.chip.WITNESSED{background:var(--data-soft,#e6f7ef);color:var(--data,#0a7)}.chip.STATED{background:rgba(150,96,11,.10);color:var(--warn,#96600b)}.chip.PROPOSED{background:rgba(192,42,95,.08);color:var(--rose,#c02a5f)}.chip.none{background:var(--ink2,#eee);color:var(--fg3,#666)}
main h1{font:700 2.4rem/1.15 var(--display,Georgia,serif);margin:.2rem 0 .3rem}.meta{font:13px var(--ui,system-ui);color:var(--fg3,#666)}.st{font:11px var(--ui,system-ui);padding:.02rem .3rem;border:1px solid var(--line2,#ccc);border-radius:3px;margin-left:.2rem}.st.on{border-color:var(--data,#0a7);color:var(--data,#0a7)}.st.off{color:var(--fg3,#aaa);text-decoration:line-through}
main h2{font:600 13px var(--ui,system-ui);letter-spacing:.08em;text-transform:uppercase;color:var(--acc,#6d3bd4);margin:2.4rem 0 .5rem;padding-top:.6rem;border-top:1px solid var(--line,#e7e0d2)}
.invariant{font:1.15rem/1.5 var(--display,Georgia,serif);border-left:3px solid var(--acc,#6d3bd4);background:var(--acc-soft,rgba(109,59,212,.06));padding:.6rem 1rem;margin:1rem 0;border-radius:0 var(--r,8px) var(--r,8px) 0}
.lede{font-size:1.15rem}.tech{font:14px/1.55 var(--ui,system-ui);color:var(--fg2,#333)}.tech summary{cursor:pointer;font-weight:600;color:var(--acc,#6d3bd4)}
.sf{margin:.5rem 0 1rem}.illus{font:12px var(--ui,system-ui);color:var(--fg3,#666);margin:-.2rem 0 .6rem}
pre.syn{font:12.5px/1.5 var(--mono,monospace);background:#1b1a17;color:#eee7d8;padding:.8rem 1rem;border-radius:var(--r,8px);overflow:auto;margin:.3rem 0 1rem;white-space:pre}.syn-label{font:13px var(--ui,system-ui);color:var(--fg2,#333)}.syn-label code{font:12px var(--mono,monospace);color:var(--fg3,#666)}
.wrlg{width:100%;height:auto;display:block;color:var(--fg3,#666);background:var(--ink3,#fffdf8);border:1px solid var(--line,#e7e0d2);border-radius:var(--r,8px)}.wrlg .n rect{fill:var(--ink2,#f2ede2);stroke:var(--fg2,#333);stroke-width:1.2}.wrlg .n.Door rect{stroke:var(--rose,#c02a5f)}.wrlg .n.Pulser rect{stroke:var(--acc,#6d3bd4)}.wrlg .n.Orb rect{stroke:var(--data,#0a6e62)}.wrlg .n text{font:12px var(--mono,monospace);fill:var(--fg,#1c1a17)}.wrlg .n text.r{font-size:10px;fill:var(--fg3,#666)}.wrlg .e{stroke:currentColor;stroke-width:1.4}.wrlg .ek{font:10px var(--mono,monospace);fill:var(--fg3,#666)}.semid{font:13px var(--mono,monospace);word-break:break-all}.semid.bad{color:var(--rose,#c02a5f)}
.two{display:grid;grid-template-columns:1fr 1fr;gap:1.2rem}.two b{font:600 13px var(--ui,system-ui);text-transform:uppercase;letter-spacing:.06em}.two ul{padding-left:1.2rem;margin:.3rem 0}
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
function filmScene(p) {
  const w = p.wrl; const rc = films.get(w.world); if (!rc) return null; const g = sealed.get(w.world).r.graph;
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
    prev = cur;
    steps.push({ caption: `epoch ${ep.t} · Film v0.7 ${ep.film_hash.slice(7, 23)}… — every line below is the forge's; the picture only colours what changed`, actions, takeaway: i === rc.epochs.length - 1 ? `${rc.epochs.length} epochs reduced by TRVM's forge; ${new Set(rc.epochs.map((e) => e.film_hash)).size} distinct film hashes; this replay is of a sealed world, not of scene data.` : undefined });
  });
  return { stencil: 'world', interval: 2200, intro: `The sealed world, before epoch 1. Reduced by TRVM's forge (${rc.execution_identity.reducer}) in ${rc.execution_identity.seconds}s on ${rc.execution_identity.host}.`, params: { nodes: g.nodes.map(([r, n]) => [r, n, {}]), edges: g.edges }, steps };
}
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
function pageFor(p, idx) {
  const d = p.derived, w = p.witness, c = p.counterexample, sc = sceneOf(p);
  const stamp = w && d.STAGED ? stampFor(w.staged_path) : null;
  const demo = existsSync(join(DEMOS, p.id + '.mjs'));
  const prev = ORDER[idx - 1], next = ORDER[idx + 1];
  const standings = ['CHECKABLE', 'RUNNABLE', 'EXECUTED', 'STAGED'].map((k) => `<span class="st ${d[k] ? 'on' : 'off'}">${k}</span>`).join('');
  const exec = d.execution ? `<p class="exec">Execution identity: ${esc(d.execution.at)}${d.execution.host ? ` on <code>${esc(d.execution.host)}</code>` : ''}${d.execution.sha256 ? ` · bytes <code>${d.execution.sha256.slice(0, 16)}…</code> · repo HEAD <code>${(d.execution.repo_head || '?').slice(0, 12)}</code>` : d.execution.note ? ` — ${esc(d.execution.note)}` : ''}</p>` : `<p class="exec warn">No execution record: this check has not been run for the bytes on disk. WITNESSED requires one.</p>`;
  const witness = w ? `<p class="exec">Source identity: <code>${esc(w.path)}</code> · shape <code>${w.shape}</code>${w.evidence_kind ? ` · evidence kind <code>${w.evidence_kind}</code>` : ''} · rung <code>${w.rung}</code> <small>(${esc(w.rung_source)})</small></p>${exec}
    ${d.STAGED ? `<p>Staged byte-identical at <code>${esc(w.staged_path)}</code> (stamp <code>${stamp}</code>). <button class="act" id="run">Run the witness here</button> <span id="wstatus" class="wstatus"></span></p><div id="wsink" class="sink"></div>`
               : `<p class="warn">Not staged on this site: the page cannot run this witness. ${d.RUNNABLE ? 'It runs from the command line: <code>' + esc(w.cmd) + '</code> in <code>' + esc(w.cwd) + '</code>.' : 'Its shape (' + w.shape + ') is a document, not a run.'}</p>`}`
    : `<p class="warn">No witness. ${p.kind === 'definition' ? 'A definition carries no evidence rung (AGENCY.md §6).' : 'This pattern is ' + (d.label || 'unlabelled') + ' — the tree has no check for its invariant.'}</p>`;
  const cex = c ? `<p>${c.shape === 'lint' ? `A sentence the ontology gate rejects: <q>${esc(c.sentence)}</q> — expected <code>REFUSED</code>.` : c.shape === 'fixture' ? `Fixture <code>${esc(c.path)}</code>: ${c.expected_count} vectors, each expected <code>REFUSED</code>.` : `<code>${esc(c.path)}</code> — ${c.law ? `law <code>${esc(c.law)}</code>, ` : ''}marker <q>${esc(c.marker)}</q>, expected <code>${c.expected}</code>.`}</p>${c.note ? `<p class="note">${esc(c.note)}</p>` : ''}${demo && d.STAGED ? `<p><button class="act" id="demo">Show the refusal</button> <small class="illus">illustration — imports the same staged modules; the suite above is the evidence</small></p><div id="dsink" class="sink"></div>` : ''}`
    : `<p class="warn">No counterexample shipped${d.label === 'WITNESSED' ? ' — the build would have refused this' : ' (required only when WITNESSED)'}.</p>`;
  const structure = sc ? `<div class="sf" id="sf"><div class="sf-stage">${SF.svg(SF.computeState(sc, 0))}</div></div><p class="illus">An illustration on a compute surface: loci above, carriers below. Press Play or Step; the takeaways collect as you go. Nothing here is evidence — the witness section is.</p>` : '';
  const syntax = (p.syntax || []).map((x) => { const e = excerpt(x); return `<p class="syn-label">${esc(x.label)} <code>${esc(x.path)}:${e.from}</code></p><pre class="syn">${esc(e.text)}</pre>`; }).join('');
  const takeaways = (p.takeaways || []).length ? `<ol class="take">${p.takeaways.map((t) => `<li class="${t.from}"><b>from the ${t.from}</b>${esc(t.text)}</li>`).join('')}</ol>` : '';
  const fm = p.failure_mode ? antiById.get(p.failure_mode) : null;
  const script = `<script type="module">
    ${sc || (p.wrl && p.wrl.world && films.get(p.wrl.world)) ? `import { mount } from '/patterns/surface/surface.mjs?v=${SF_STAMP}';` : ''}
    ${sc ? `mount(document.getElementById('sf'), ${JSON.stringify(sc)});` : ''}
    ${p.wrl && p.wrl.world && films.get(p.wrl.world) ? `mount(document.getElementById('film'), ${JSON.stringify(filmScene(p))});` : ''}
    ${(d.STAGED || demo) ? `import { runWitness } from '/witness/run.js?v=${RUNJS_STAMP}';
    const spec = ${JSON.stringify({ entry: '/witness/src/' + (w ? w.path : ''), mode: w ? (w.shape === 'suite' ? 'suite' : 'side-effect') : 'suite', stamp, argv: [], trials: 200 })};
    const b = document.getElementById('run');
    if (b) b.addEventListener('click', () => runWitness({ spec, sink: document.getElementById('wsink'), status: document.getElementById('wstatus'), button: b }));
    const db = document.getElementById('demo');
    if (db) db.addEventListener('click', async () => { db.disabled = true; try { const m = await import('./demos/${p.id}.mjs?v=${stamp}'); await m.run(document.getElementById('dsink'), { stamp: '${stamp}' }); } catch (e) { document.getElementById('dsink').textContent = 'demo failed: ' + e.message; } db.disabled = false; });` : ''}
  </script>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(p.name)} · Unboxed Patterns</title><meta name="description" content="${esc(p.headline || p.invariant || p.name)}"><link rel="stylesheet" href="/styles/site.css"><style>${SHELL_CSS}</style></head><body>
<script type="module" src="/amp-nav.js"></script><amp-nav property="opensentience"></amp-nav>
<div class="book">${sidebar(p)}<main>
<p class="meta">${FAMILY_TITLE[p.family]} · ${chip(p)} ${standings}</p>
<h1>${esc(p.name)}</h1>
${p.headline ? `<p class="lede">${esc(p.headline)}</p>` : ''}
${p.invariant ? `<div class="invariant">${esc(p.invariant)}</div>` : ''}
${p.explanatory ? `<h2>Intent</h2><p>${esc(p.explanatory)}</p>` : ''}${p.technical ? `<details class="tech"><summary>Technical register</summary><p>${esc(p.technical)}</p></details>` : ''}
${p.problem ? `<h2>Problem</h2>${para(p.problem)}` : ''}
${p.construction ? `<h2>Solution</h2>${para(p.construction)}` : ''}
${p.analogy ? `<h2>Real-world analogy</h2>${para(p.analogy)}` : ''}
${structure ? `<h2>Structure — on the surface</h2>${structure}` : ''}
${p.wrl ? `<h2>The scene as a WRL world</h2>${wrlSection(p)}` : ''}
${p.wrl && p.wrl.world ? `<h2>The Film — reduced by TRVM's forge</h2>${filmSection(p)}` : ''}
${syntax ? `<h2>Syntax — quoted from the tree at build time</h2>${syntax}` : ''}
${p.forces ? `<h2>Forces</h2>${para(p.forces)}` : ''}
${p.applicability ? `<h2>Applicability</h2>${para(p.applicability)}` : ''}
${p.transformations ? `<h2>Transformations</h2><div class="two"><div><b>Allowed</b>${list(p.transformations.allowed)}</div><div><b>Forbidden</b>${list(p.transformations.forbidden)}</div></div>` : ''}
${p.consequences ? `<h2>Consequences</h2>${para(p.consequences)}` : ''}
${fm ? `<h2>Failure mode it answers</h2><p><b>${esc(fm.name)}</b> — ${esc(fm.problem)}${fm.paid_for ? ` <small>Paid for at: ${esc(fm.paid_for)}</small>` : ''}</p>` : ''}
<h2>Witness</h2>${witness}
<h2>Counterexample</h2>${cex}
${takeaways ? `<h2>What to take away</h2>${takeaways}` : ''}
${(p.cells || []).length || (p.claims || []).length ? `<h2>Cells and claims cited</h2>${d.cell_statuses.map((x) => `<p>cell <code>${x.num}</code> — status <code>${x.status}</code> (from cells.json)</p>`).join('')}${(p.claims || []).map((id, i) => `<p>claim <code>${esc(id)}</code> — <code>${d.claim_statuses[i]}</code> (from CLAIM_LEDGER.json)</p>`).join('')}` : ''}
${p.prior_art ? `<h2>Prior art</h2>${para(p.prior_art)}` : ''}
${(p.realizations || []).length ? `<h2>Realizations in the tree</h2>${list(p.realizations)}` : ''}
${(p.related || []).length ? `<h2>Relations with other patterns</h2><p>${p.related.map((id) => byId.has(id) ? `<a href="${id}.html">${esc(byId.get(id).name)}</a> ${chip(byId.get(id))}` : esc(id)).join(' · ')}</p>` : ''}
<div class="pn"><span>${prev ? `<a href="${prev.id}.html">← ${esc(prev.name)}</a><small>${FAMILY_TITLE[prev.family]}</small>` : ''}</span><span style="text-align:right">${next ? `<a href="${next.id}.html">${esc(next.name)} →</a><small>${FAMILY_TITLE[next.family]}</small>` : ''}</span></div>
<footer class="fin">Derived ${new Date().toISOString()} by <code>opensentience.org/_patterns/build/build.mjs</code> from <code>data/patterns.json</code>, <code>_invariants/data/cells.json</code>, <code>CLAIM_LEDGER.json</code> and <code>_patterns/receipts/</code>. ${p.kind === 'pattern' && !p.problem ? 'Thin record: prose not yet authored; the invariant, witness and prior art are the record.' : ''}</footer>
</main></div>${script}</body></html>`;
}
const pageOutputs = {};
ORDER.forEach((p, i) => { pageOutputs[`${p.id}.html`] = pageFor(p, i); });
for (const f of existsSync(DEMOS) ? readdirSync(DEMOS) : []) pageOutputs[`demos/${f}`] = readFileSync(join(DEMOS, f), 'utf8');
for (const f of existsSync(SCENES) ? readdirSync(SCENES) : []) pageOutputs[`scenes/${f}`] = readFileSync(join(SCENES, f), 'utf8');
pageOutputs['surface/surface.mjs'] = readFileSync(SURFACE, 'utf8');
for (const f of existsSync(WRL_DIR) ? readdirSync(WRL_DIR) : []) pageOutputs[`wrl/${f}`] = readFileSync(join(WRL_DIR, f), 'utf8');
for (const f of existsSync(FILMS_DIR) ? readdirSync(FILMS_DIR) : []) pageOutputs[`films/${f}`] = readFileSync(join(FILMS_DIR, f), 'utf8');
const CONC = readJson(join(HERE, '../data/conclusion.json'));
const last = ORDER[ORDER.length - 1];
pageOutputs['conclusion.html'] = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(CONC.title)} · Unboxed Patterns</title><link rel="stylesheet" href="/styles/site.css"><style>${SHELL_CSS}</style></head><body>
<script type="module" src="/amp-nav.js"></script><amp-nav property="opensentience"></amp-nav>
<div class="book">${sidebar('conclusion')}<main><p class="meta">Front matter, at the back</p><h1>${esc(CONC.title)}</h1><p class="lede">${esc(CONC.lede)}</p>
${CONC.sections.map((sec) => `<h2>${esc(sec.h)}</h2>${sec.p.map((t) => `<p>${esc(t)}</p>`).join('')}`).join('')}
<h2>The numbers this page is allowed to quote</h2><p>${summary.patterns} records · ${summary.WITNESSED} WITNESSED · ${summary.STATED} STATED · ${summary.PROPOSED} PROPOSED · ${summary.anti_patterns} anti-patterns · ${[...sealed.values()].filter((x) => x.r.ok).length} WRL worlds sealed at build and ${[...sealed.values()].filter((x) => !x.r.ok).length} refused by design · ${films.size} worlds with a Film reduced by TRVM's forge (${[...films.values()].reduce((n, r) => n + r.epochs.length, 0)} epochs) — every one derived by <code>build.mjs</code>, none typed.</p>
<div class="pn"><span><a href="${last.id}.html">← ${esc(last.name)}</a><small>${FAMILY_TITLE[last.family]}</small></span><span style="text-align:right"><a href="./">Catalog →</a></span></div>
<footer class="fin">Derived ${new Date().toISOString()} by <code>_patterns/build/build.mjs</code>.</footer></main></div></body></html>`;
const card = (p) => `<a class="card" href="${p.id}.html">${p.scene ? `<div class="thumb">${thumb(p)}</div>` : ''}<h3>${esc(p.name)} ${chip(p)}</h3><p>${esc(p.headline || p.invariant || (p.kind === 'definition' ? 'A definition.' : p.prior_art || ''))}</p></a>`;
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unboxed Patterns</title><meta name="description" content="Elements of Composable Locus-Oriented Software — a pattern catalog generated from a registry, with runnable witnesses."><link rel="stylesheet" href="/styles/site.css"><style>${SHELL_CSS}</style></head><body>
<script type="module" src="/amp-nav.js"></script><amp-nav property="opensentience"></amp-nav>
<div class="book">${sidebar(null)}<main>
<p class="meta">A catalog, and a book in progress</p>
<h1>Unboxed Patterns</h1>
<p class="lede"><em>Elements of Composable Locus-Oriented Software.</em> What recurring structures appear when computation is organized around persistent identity, locality, composition, authority, progress and observable semantic state — rather than around the class, the thread or the service?</p>
<p>Every pattern here is a named problem, the forces that make it costly, one invariant, and — where the tree has one — a check you can run on this page. Labels are derived, never typed: <span class="chip WITNESSED">WITNESSED</span> means a recorded run of a check exists for the exact bytes on disk at rung <code>in_tree</code> or above; <span class="chip STATED">STATED</span> means the tree says it and no run proves it; <span class="chip PROPOSED">PROPOSED</span> means the book names it and the tree does not. ${summary.WITNESSED} witnessed · ${summary.STATED} stated · ${summary.PROPOSED} proposed · ${summary.anti_patterns} anti-patterns. Plan and open rulings: <code>ProjectAmp2/UNBOXED_PATTERNS.md</code>.</p>
${DATA.families.map((f) => `<h2>${FAMILY_TITLE[f]}</h2><div class="cards">${ORDER.filter((p) => p.family === f).map(card).join('')}</div>`).join('')}
<h2 id="anti">Patterns that should disappear</h2><ol class="take">${DATA.anti_patterns.map((a) => `<li id="anti-${a.id}"><b>${esc(a.name)}</b>${esc(a.problem)}${a.paid_for ? ` <small>· paid for at ${esc(a.paid_for)}</small>` : ''}</li>`).join('')}</ol>
${findings.length ? `<h2>Findings from this build</h2><ul>${findings.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
<footer class="fin">Derived ${new Date().toISOString()} by <code>_patterns/build/build.mjs</code>. Machine-readable: <a href="llms.txt">llms.txt</a> · <a href="patterns.derived.json">patterns.derived.json</a> · <a href="artifact.json">artifact.json</a>.</footer>
</main></div></body></html>`;
const llms = [`# Unboxed Patterns — registry (P1, derived ${new Date().toISOString().slice(0, 10)})`, `# ${summary.patterns} records · ${summary.WITNESSED} WITNESSED · ${summary.STATED} STATED · ${summary.PROPOSED} PROPOSED · ${summary.anti_patterns} anti-patterns. Labels are derived by build.mjs, never typed. WITNESSED = a recorded run of a check on these exact bytes exists at rung ≥ in_tree.`, '', ...derived.map((p) => `- ${p.id} [${p.derived.label ?? p.kind}] (${p.family}) — ${p.invariant ?? '(no invariant)'}${p.witness ? ` — witness: ${p.witness.path} (${p.witness.shape}, ${p.witness.rung}${p.derived.EXECUTED ? ', executed' : ', NOT executed'})` : ''}`), '', '## anti-patterns', ...DATA.anti_patterns.map((a) => `- ${a.id} — ${a.problem}`)].join('\n') + '\n';
const derivedJson = JSON.stringify({ kind: 'UNBOXED_PATTERNS_DERIVED', built: new Date().toISOString(), inputs_heads: heads, summary, findings, patterns: derived, anti_patterns: DATA.anti_patterns }, null, 2) + '\n';


const DIST = join(SITE, 'patterns');   // SERVED at opensentience.org/patterns/ — ruling R4, 2026-09-11
const outputs = { 'patterns.derived.json': derivedJson, 'index.html': html, 'llms.txt': llms, ...pageOutputs };
const inputs = { 'data/patterns.json': shaFile(join(HERE, '../data/patterns.json')), '_invariants/data/cells.json': shaFile(join(SITE, '_invariants/data/cells.json')), 'CLAIM_LEDGER.json': shaFile(join(ROOT, 'CLAIM_LEDGER.json')), receipts: Object.fromEntries(receipts.map((r) => [r.witness.path, r.source_identity.sha256])), films: Object.fromEntries([...films.entries()].map(([f, r]) => [f, r.source_identity.world_sha256.slice(0, 16) + ':' + r.epochs.length])), 'WRL/wrl.js': WRLJS_SHA, wrl_worlds: Object.fromEntries([...sealed.entries()].map(([f, x]) => [f, x.r.ok ? x.r.semanticId : x.r.code])) };
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
for (const sub of ['demos', 'scenes', 'surface', 'wrl', 'films']) mkdirSync(join(DIST, sub), { recursive: true });
for (const [k, v] of Object.entries(outputs)) writeFileSync(join(DIST, k), v);
writeFileSync(join(DIST, 'artifact.json'), JSON.stringify(artifact, null, 2) + '\n');
console.log(`✓ built ${Object.keys(outputs).length} file(s) into ${rel(DIST)}\n`);
console.log(JSON.stringify(summary, null, 1));
if (findings.length) console.log('\nfindings:\n  ' + findings.join('\n  '));
