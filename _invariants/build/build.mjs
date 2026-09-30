#!/usr/bin/env node
/**
 * Build opensentience.org/invariants.html from data.
 *
 *   node opensentience.org/_invariants/build/build.mjs            emit
 *   node opensentience.org/_invariants/build/build.mjs --verify   check what is on disk, build nothing
 *   node opensentience.org/_invariants/build/build.mjs --emit-to  write to a directory (used by prove-gate)
 *
 * WHY THIS EXISTS. Until v0.8 the 46 cells lived as a `const families = [...]`
 * literal INSIDE the page, and two gates — check-mosaic.mjs §11 and
 * check-claim-ledger.mjs — recovered their subject by string-slicing that
 * literal out of the HTML and calling eval() on it. The gates parsed a web page
 * to find the thing they were checking. Everything countable on the page was
 * typed by hand beside it, and the page shipped v0.7 cells and a v0.7 inspector
 * under a v0.6 masthead for two rounds with nothing to notice.
 *
 * So: authored prose lives in data/cells.json, the axes in data/axes.json, the
 * counts are DERIVED here from cells.json + CLAIM_LEDGER.json + mosaic/, and a
 * bare integer typed in front of a derived noun is a refusal.
 *
 * Bytes are hashed before they are written, read back off disk, re-hashed, and
 * staged-then-renamed — the same contract _rebuild/build/build.mjs holds for
 * index.html next door. Nothing published is a file this run did not produce.
 */

import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, unlinkSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, relative } from 'node:path';
import * as T from './templates.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(HERE, '../..');
const ROOT = resolve(SITE, '..');

const argv = process.argv.slice(2);
const VERIFY = argv.includes('--verify');
const emitToIdx = argv.indexOf('--emit-to');
const EMIT_TO = emitToIdx >= 0 ? argv[emitToIdx + 1] : null;
const QUIET = argv.includes('--quiet');

/* Every file the build reads is recorded HERE, at the single choke point, so the
   input set is what the build actually consumed rather than a list someone
   maintained beside it. F-SITE-1 is what a maintained list costs: `build
   --verify` could detect the drift in a second and nothing invoked it, because
   nothing knew which changes should invoke it. The CI trigger is checked against
   this set by scripts/check-invariants-ci-coverage.mjs, so a new input that the
   workflow does not watch fails a gate instead of going quiet for eleven days. */
const INPUTS = new Map();
const read = (p) => {
  const body = readFileSync(resolve(ROOT, p), 'utf8');
  INPUTS.set(p, createHash('sha256').update(body).digest('hex'));
  return body;
};
const readJson = (p) => JSON.parse(read(p));
const sha = (s) => createHash('sha256').update(s).digest('hex');
/* One token over the whole staged tree, so a cache-buster on an entry module
   also busts its siblings. A query on the module you import does NOT bust the
   cache of the modules IT imports — the box-and-box playground once reported
   `106 laws · 3 failing` for exactly that reason, and a second port settled it. */
const digestOf = (rows) => sha(rows.map((r) => `${r.path}:${r.sha256}`).sort().join('\n')).slice(0, 16);

/* ─────────────────────────── refusals ─────────────────────────── */

const problems = [];
const refuse = (id, msg) => problems.push({ id, msg });
const log = (...a) => { if (!QUIET) console.log(...a); };

/* ─────────────────────────── inputs ─────────────────────────── */

const CELLS = readJson('opensentience.org/_invariants/data/cells.json');
const AXES = readJson('opensentience.org/_invariants/data/axes.json');
const COPY = readJson('opensentience.org/_invariants/data/copy.json');
const LEDGER = readJson('CLAIM_LEDGER.json');
const OCCUPANCY = readJson('mosaic/occupancy.json');
const DEFEATERS = readJson('mosaic/defeaters.json');
const FLOOR = readJson('opensentience.org/_invariants/data/floor.json');

const cells = CELLS.cells;
const VERSION = CELLS.version;

/* The kind vocabulary is READ, never copied. mosaic/occupancy.json owns it, and
   OCC-KIND-VOCAB is the rule that would have caught `Epistemic`/`Environmental`
   being quantified over before either had ever been assigned to a cell. */
const KIND_VOCAB = OCCUPANCY.kind_vocabulary.declared;

/* The settled statuses, read off the ledger's own `_statuses` block rather than
   listed here. A status that stops meaning "settled" must be edited in one place. */
const SETTLED = new Set(['PROVED', 'CONDITIONAL', 'REFUTED', 'KNOWN', 'MEASURED']);
for (const s of SETTLED) {
  if (!(s in LEDGER._statuses)) refuse('R0-STATUS-VOCAB', `"${s}" is treated as settled but is not in CLAIM_LEDGER.json _statuses`);
}

/* ─────────────────────── derive: ledger join ─────────────────────── */

const claimsByCell = new Map();
for (const c of LEDGER.claims) {
  const m = /^cell:(.+)$/.exec(String(c.implementation_binding || ''));
  if (!m) continue;
  if (!claimsByCell.has(m[1])) claimsByCell.set(m[1], []);
  claimsByCell.get(m[1]).push(c);
}

/* Doubt reaches a cell through a claim. There is no cell field on a defeater and
   inventing one would be a second description of a relation the tree already
   has, so the join walks the relations that exist:
 *
 *   defeater --related_claims--> claim --implementation_binding--> cell
 *   defeater --target_ref------> argument --conclusion/premise--> claim --> cell
 *
 * The second hop matters: most defeaters target ARGUMENTS, not claims, so a
 * claim-only join under-reports the doubt standing against a cell. An argument
 * that concludes a bound claim, when attacked, is doubt about that cell. */
const claimToCell = new Map();
for (const [num, cs] of claimsByCell) for (const c of cs) claimToCell.set(c.claim_id, num);

const ARGS = readJson('mosaic/arguments.json');
const argToClaims = new Map(
  ARGS.arguments.map((a) => [a.id, [a.conclusion_claim, ...(a.premise_claims || [])].filter(Boolean)])
);

const doubtByCell = new Map();
for (const d of DEFEATERS.defeaters) {
  const direct = [...(d.related_claims || []), d.target_ref].filter(Boolean);
  const viaArg = direct.flatMap((r) => argToClaims.get(r) || []);
  const hit = new Set();
  for (const r of [...direct, ...viaArg]) if (claimToCell.has(r)) hit.add(claimToCell.get(r));
  for (const num of hit) {
    if (!doubtByCell.has(num)) doubtByCell.set(num, []);
    doubtByCell.get(num).push({ ...d, reached: direct.some((r) => claimToCell.has(r)) ? 'claim' : 'argument' });
  }
}

const activeDoubt = (d) => !d.disposition || d.disposition === 'sustained';

/* ─────────────────────── derive: register ─────────────────────── */

const byId = Object.fromEntries(AXES.registers.map((r) => [r.id, r]));

for (const c of cells) {
  const bound = claimsByCell.get(c.num) || [];
  const settled = bound.filter((b) => SETTLED.has(b.status));
  const doubt = doubtByCell.get(c.num) || [];
  const decided = Boolean(c.tier) || settled.length > 0;

  /* THE EVIDENCE AFFORDANCE, DERIVED. It used to be the hand-authored `proof`
     field alone, so of 13 decided cells only 6 offered the reader anything —
     and the 6 that offered nothing were the MOST evidenced on the table. Cell
     36 carries 8 runnable witnesses across the federation gate and had no way
     to say so; cell 45 has 2; 27b has 4. A static page written once outranked a
     witness that runs today, purely because a field existed for one and not the
     other. Priority: page, then witnesses, then an explicit declared absence. */
  const witnesses = [...new Set([
    ...(c.witnesses || []),
    ...bound.flatMap((b) => b.witnesses || []),
  ])];

  /* A CELL WITNESSED BY THE PAGE IT APPEARS ON. Cell 27a's TAX-RELATIONAL-2 and
     TAX-27A-OBSERVER name `opensentience.org/invariants.html` as their witness —
     the artifact this build emits, describing the cell that cites it. That was
     defensible when the page HELD the data; the data is cells.json now, so the
     witness points at a rendering of its own subject. Not refused here: the
     ledger belongs to the round in flight, and a build that refuses another
     lane's record blocks work it does not own. Marked on the page and printed
     every run, so it cannot be read as ordinary evidence or quietly forgotten. */
  const SELF = 'opensentience.org/invariants.html';
  const selfWitness = witnesses.filter((w) => w.split(' §')[0] === SELF);

  c.derived = {
    register: c.economic ? 'proposed' : decided ? 'decided' : c.status === 'shipped' ? 'built' : 'named',
    witnesses, selfWitness,
    bound: bound.length,
    settled: settled.length,
    refuted: bound.filter((b) => b.status === 'REFUTED').length,
    openClaims: bound.filter((b) => b.status === 'OPEN').length,
    records: bound.map((b) => ({ id: b.claim_id, status: b.status, obligation: b.obligation || null, statement: b.statement })),
    doubt: doubt.filter(activeDoubt).map((d) => ({ id: d.id, kind: d.kind, doubt: d.doubt })),
  };
}

/* Every register a cell can land in must be declared. Without this the build
   died on `byId.built.count` with a TypeError — an uncaught crash where a
   stated refusal belongs, and a reader of that output learns nothing about
   what is wrong. Found by prove-gate.mjs, which is the point of prove-gate.mjs. */
const REGISTER_IDS = ['decided', 'built', 'named', 'proposed'];
for (const id of REGISTER_IDS) {
  if (!byId[id]) refuse('R19-REGISTER-UNDECLARED', `cells derive into register "${id}", which axes.json does not declare`);
}
for (const r of AXES.registers) {
  if (!REGISTER_IDS.includes(r.id)) refuse('R19-REGISTER-UNDECLARED', `axes.json declares register "${r.id}", which nothing derives into`);
}
if (problems.length) {
  console.error(`\n✗ invariants build REFUSED — ${problems.length} problem(s)\n`);
  for (const p of problems) console.error(`  [${p.id}] ${p.msg}`);
  console.error('');
  process.exit(1);
}

/* ───────────────── witnesses: classify, close, stage ─────────────────
 *
 * A witness page may only offer a Run button for a witness that actually runs
 * in a browser. That is DERIVED, never assumed:
 *
 *   runnable   pure ESM — its whole relative-import closure touches no node:
 *              builtin and no fs call. Imports and executes as-is.
 *   node-only  reaches the filesystem (check-mosaic.mjs reads the tree).
 *   data       a .json. Evidence to read, not to run.
 *   page       an .html. Not a module at all.
 *
 * The staged copy is the SAME BYTES the CLI runs, hashed, and --verify refuses
 * drift. This is deliberately not what `opensentience.org/box-and-box/` is: that
 * is a hand-made copy nothing syncs, and it has already shipped a playground
 * reporting a stale law count while every other surface disagreed. A second
 * unsynced copy would be that defect twice.
 *
 * And it is not what `kappa_proof.js` is either — that is a PORT, "the same
 * routine ported to run in your browser", which is a second implementation with
 * nothing checking the two agree. These pages import the witness itself.
 */
const NODE_COUPLED = /from\s+['"]node:|require\(['"]node:|\breadFileSync\b|\bexistsSync\b|\bwriteFileSync\b|\breaddirSync\b/;

function importClosure(abs) {
  const seen = new Set(), missing = [];
  const walk = (f) => {
    if (seen.has(f)) return;
    seen.add(f);
    let src;
    try { src = readFileSync(f, 'utf8'); } catch { return; }
    for (const m of src.matchAll(/^\s*(?:import|export)[^'"]*?from\s+['"](\.[^'"]+)['"]/gm)) {
      const t = resolve(dirname(f), m[1]);
      if (!existsSync(t)) missing.push(relative(ROOT, t)); else walk(t);
    }
  };
  walk(abs);
  return { files: [...seen], missing };
}

function classify(w) {
  const path = w.split(' §')[0];
  const abs = join(ROOT, path);
  if (!existsSync(abs)) return { path, kind: 'missing', files: [], why: 'not on disk' };
  if (path.endsWith('.json')) return { path, kind: 'data', files: [], why: 'a record to read, not a module to run' };
  if (path.endsWith('.html')) return { path, kind: 'page', files: [], why: 'a page, not a module' };
  const { files, missing } = importClosure(abs);
  if (missing.length) return { path, kind: 'broken', files, why: `import closure does not resolve: ${missing.join(', ')}` };
  const coupled = files.filter((f) => NODE_COUPLED.test(readFileSync(f, 'utf8'))).map((f) => relative(ROOT, f));
  if (coupled.length) return { path, kind: 'node-only', files, why: `reads the filesystem: ${coupled.join(', ')}` };
  /* The law suites guard `typeof window === 'undefined'` so they import cleanly
     in a browser and deliberately do NOT self-run; drive their exported runner
     instead. playground.html has done exactly this since the kernel shipped. */
  const src = readFileSync(abs, 'utf8');
  const mode = /typeof window === ['"]undefined['"]/.test(src) && /^export (const SUITES|function runSet)/m.test(src)
    ? 'suite' : 'side-effect';
  return { path, kind: 'runnable', mode, files: files.map((f) => relative(ROOT, f)), why: 'pure ESM' };
}

const witnessInfo = new Map();
for (const c of cells) {
  for (const w of c.derived.witnesses) {
    const p = w.split(' §')[0];
    if (!witnessInfo.has(p)) witnessInfo.set(p, classify(w));
  }
}

/* The witness-page URL is decided HERE, before the table is rendered, because
   the inspector links to it. The file is written later. One derivation, two
   consumers — the alternative is a filename computed twice and eventually
   spelled two ways, which is the defect this whole rebuild is about. */
const witnessSlug = (c) => `${c.num}-${c.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}.html`;
for (const c of cells) {
  const hasRunnable = c.derived.witnesses.some((w) => (witnessInfo.get(w.split(' §')[0]) || {}).kind === 'runnable');
  c.derived.witnessPage =
    c.derived.register === 'decided' && !c.proof && hasRunnable ? `/witness/${witnessSlug(c)}` : null;
}

const inReg = (id) => cells.filter((c) => c.derived.register === id);
for (const r of AXES.registers) r.count = inReg(r.id).length;

/* ───────────────────── derive: the semantic floor ─────────────────────
   S1–S5 are NOT cells. A cell is a slot in the census; an obligation is what a
   cell may specialize. Holding them in a separate file is what keeps the two
   counts from contaminating each other — the floor cannot inflate the table,
   and `reduction over accumulation` stays mechanically true rather than merely
   intended. Every count here is derived for the same reason every other count
   on this page is: the v0.6 page hand-typed its own and shipped them stale. */
const FLOOR_IDS = FLOOR.obligations.map((o) => o.id);
const AXIS_IDS = FLOOR.separate_axes.map((a) => a.id);
const RESOLVED_IDS = FLOOR.resolved_candidates.map((r) => r.id);
const RELATION_VOCAB = Object.keys(FLOOR.relation_vocabulary);
const relatedCells = cells.filter((c) => c.floor_relation);
const relatedByFloor = {};
for (const c of relatedCells) {
  for (const parent of c.floor_relation.parent || []) {
    (relatedByFloor[parent] ||= []).push({ num: c.num, label: c.label, relation: c.floor_relation.relation });
  }
}

/* ─────────────────────── derive: the facts ─────────────────────── */

const kinded = cells.filter((c) => (c.kind || []).length);
const FACTS = {
  CELL_COUNT: { value: cells.length, noun: 'cells' },
  DECIDED_COUNT: { value: byId.decided.count, noun: null },
  BUILT_COUNT: { value: byId.built.count, noun: null },
  NAMED_COUNT: { value: byId.named.count, noun: null },
  PROPOSED_COUNT: { value: byId.proposed.count, noun: null },
  PROTOCOL_GROUP_COUNT: { value: new Set(cells.map((c) => c.protocol_group.label)).size, noun: 'protocol groups' },
  BOUND_CLAIM_COUNT: { value: cells.reduce((n, c) => n + c.derived.bound, 0), noun: 'bound claims' },
  BOUND_CELL_COUNT: { value: cells.filter((c) => c.derived.bound).length, noun: null },
  REFUTED_CLAIM_COUNT: { value: cells.reduce((n, c) => n + c.derived.refuted, 0), noun: 'refuted claims' },
  LEDGER_CLAIM_COUNT: { value: LEDGER.claims.length, noun: 'claims' },
  KIND_COUNT: { value: kinded.length, noun: null },
  KIND_AUTHORED_COUNT: { value: kinded.filter((c) => c.kind_source === 'authored').length, noun: 'authored kinds' },
  KIND_DECLARED_COUNT: { value: kinded.filter((c) => c.kind_source === 'declared').length, noun: null },
  KIND_VOCAB_COUNT: { value: KIND_VOCAB.length, noun: 'kind tokens' },
  UNKINDED_DECIDED_COUNT: { value: inReg('decided').filter((c) => !(c.kind || []).length).length, noun: null },
  TIER_COUNT: { value: cells.filter((c) => c.tier).length, noun: null },
  ACTIVE_DOUBT_COUNT: { value: new Set(cells.flatMap((c) => c.derived.doubt.map((d) => d.id))).size, noun: 'active doubts' },
  DEFEATER_COUNT: { value: DEFEATERS.defeaters.length, noun: 'defeaters' },
  ROUND: { value: LEDGER._round.id, noun: null },
  VERSION: { value: VERSION, noun: null },
  FLOOR_COUNT: { value: FLOOR_IDS.length, noun: 'semantic obligations' },
  FLOOR_RELATED_COUNT: { value: relatedCells.length, noun: 'related cells' },
  SEPARATE_AXIS_COUNT: { value: AXIS_IDS.length, noun: 'separate axes' },
};

/* Every OS-NNN this table's cells actually name, derived from the protocol
   strings. The footer used to hand-type "OS-001 through OS-017". */
const osNums = [...new Set(
  cells.flatMap((c) => [...String(c.protocol).matchAll(/OS-(\d{3})/g)].map((m) => m[1]))
)].sort();
const PROTOCOL_RANGE = osNums.length ? `OS-${osNums[0]} through OS-${osNums[osNums.length - 1]}` : '—';

/* ─────────────────────── substitution ─────────────────────── */

const NOUNS = Object.values(FACTS).map((f) => f.noun).filter(Boolean);

function render(text, where) {
  // A bare integer standing in front of a noun this build derives is the R4.1
  // defect: a count typed in prose drifts inside one revision. Refuse it and
  // name the placeholder to use.
  for (const [key, f] of Object.entries(FACTS)) {
    if (!f.noun) continue;
    const re = new RegExp(`\\b(\\d+)\\s+${f.noun.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    const hit = re.exec(text);
    if (hit) refuse('R10-TYPED-COUNT', `${where}: "${hit[0]}" is a bare integer before a derived noun — write {{${key}}} ${f.noun}`);
  }
  return text.replace(/\{\{(\w+)\}\}/g, (m, k) => {
    if (!(k in FACTS)) { refuse('R11-UNKNOWN-PLACEHOLDER', `${where}: {{${k}}} is not a derived fact`); return m; }
    return String(FACTS[k].value);
  });
}

/* ─────────────────────────── the gate ─────────────────────────── */

/* Cell prose may reference a derived fact. It could not before, so a cell that
   wanted to say "rewritten at v0.9" had to type the page version into DATA —
   the drift R20 refuses in the CSS and the templates, arriving by the one door
   left open. `renderProse` substitutes the same placeholders `render` does; it
   does NOT run R10's bare-integer check, which is calibrated for chrome copy
   whose subject IS the derived noun, and would fire on prose that legitimately
   counts other things (240,000 federations, three sites, 21 mutations). What it
   adds instead is R29: the CURRENT page version, typed literally into data.
   Other subjects' versions (PULSE v0.1, Graphonomous v0.4) are untouched. */
const PROSE_FIELDS = ['tagline', 'desc', 'extra', 'hypothesis', 'witness_note', 'evidence_absent'];
function renderProse(text, where) {
  const lit = new RegExp('\\bv' + VERSION.replace('.', '\\.') + '\\b');
  if (lit.test(text)) {
    refuse('R29-VERSION-IN-PROSE', `${where}: page-version marker "v${VERSION}" is typed literally in data — use {{VERSION}}`);
  }
  return text.replace(/\{\{(\w+)\}\}/g, (m, k) => {
    if (!(k in FACTS)) { refuse('R11-UNKNOWN-PLACEHOLDER', `${where}: {{${k}}} is not a derived fact`); return m; }
    return String(FACTS[k].value);
  });
}
for (const c of cells) {
  for (const f of PROSE_FIELDS) {
    if (typeof c[f] === 'string') c[f] = renderProse(c[f], `cell ${c.num}.${f}`);
  }
  if (c.floor_relation?.why) {
    c.floor_relation.why = renderProse(c.floor_relation.why, `cell ${c.num}.floor_relation.why`);
  }
}

const seen = new Set();
for (const c of cells) {
  const at = `cell ${c.num}`;

  if (seen.has(c.num)) refuse('R1-DUPLICATE-NUM', `${at}: duplicate cell number`);
  seen.add(c.num);

  if (!c.symbol || !c.label || !c.title || !c.desc) refuse('R2-INCOMPLETE', `${at}: missing symbol/label/title/desc`);

  // A conditional cell that does not name its antecedent is indistinguishable
  // from a proved one, which is the whole failure the status exists to stop.
  if (c.status === 'conditional' && !c.hypothesis) refuse('R3-CONDITIONAL-NO-HYP', `${at}: status "conditional" with no \`hypothesis\``);
  if (c.hypothesis && c.status !== 'conditional') refuse('R4-HYP-NOT-CONDITIONAL', `${at}: carries a \`hypothesis\` but status is "${c.status}"`);

  if (!(c.status in AXES.statuses)) refuse('R5-UNKNOWN-STATUS', `${at}: status "${c.status}" is not in axes.json`);

  for (const k of c.kind || []) {
    if (!KIND_VOCAB.includes(k)) refuse('R6-KIND-VOCAB', `${at}: kind "${k}" is outside mosaic/occupancy.json kind_vocabulary.declared`);
  }
  if ((c.kind || []).length && !c.kind_source) refuse('R7-KIND-NO-SOURCE', `${at}: carries a kind with no \`kind_source\``);
  if (c.kind_source === 'authored' && !c.kind_why) refuse('R8-AUTHORED-NO-WHY', `${at}: kind_source "authored" with no \`kind_why\` — an authored assignment must say what it is read off`);
  if (c.kind_source && !(c.kind || []).length) refuse('R9-SOURCE-NO-KIND', `${at}: declares a \`kind_source\` with no kind`);

  // R3's lesson, on the public surface: a witness present and dead. existsSync
  // was true for `test/laws.mjs` and the evidence could not start.
  if (c.proof && !existsSync(join(SITE, c.proof.replace(/^\//, '')))) {
    refuse('R12-DEAD-PROOF-LINK', `${at}: proof link ${c.proof} does not resolve on disk`);
  }
  // The same rule for a witness the CELL names. Witnesses the LEDGER names are
  // check-claim-ledger.mjs's job, including their import closure — this build
  // does not restate that check, it just refuses to advertise a path it cannot find.
  for (const w of c.witnesses || []) {
    if (!existsSync(join(ROOT, w.split(' §')[0]))) refuse('R24-DEAD-WITNESS', `${at}: witness ${w} does not resolve on disk`);
  }
  /* A decided cell that offers the reader NOTHING must say so. Silence here is
     indistinguishable from a page that simply forgot to render the affordance,
     which is what the reader was actually looking at. */
  if (c.derived.register === 'decided' && !c.proof && !c.derived.witnesses.length && !c.evidence_absent) {
    refuse('R25-SILENT-ABSENCE', `${at}: decided, but has no proof page, no witness, and no \`evidence_absent\` saying why`);
  }
  if (c.evidence_absent && (c.proof || c.derived.witnesses.length)) {
    refuse('R26-ABSENCE-CONTRADICTED', `${at}: declares \`evidence_absent\` while carrying ${c.proof ? 'a proof page' : 'a witness'}`);
  }
  if (c.proof && !c.tier) refuse('R13-PROOF-NO-TIER', `${at}: links a proof but declares no tier — the link text would claim a strength nothing states`);
  if (c.tier && !(c.tier in AXES.tiers)) refuse('R14-UNKNOWN-TIER', `${at}: tier "${c.tier}" is not in axes.json`);

  /* The annex's whole claim is that these cells have no record. If one acquires
     a tier or a settled claim, the claim is false and annexing it is the same
     laundering in the other direction. This CAN fire; three earlier rules here
     could not — they restated the register derivation back to itself, and a
     refusal that cannot fire is decoration. */
  if (c.economic && (c.tier || c.derived.settled)) {
    refuse('R15-PROPOSED-HAS-EVIDENCE', `${at}: annexed as a proposal but carries ${c.tier ? `tier "${c.tier}"` : `${c.derived.settled} settled claim(s)`} — the annex says these have neither`);
  }
}

/* A RUN BUTTON MAY NOT OUTRUN ITS EVIDENCE. Every witness a page offers must
   have been classified runnable AND staged; a page that offers to run something
   the build could not stage would 404 at click time, which reads to a reader as
   "the evidence is broken" rather than "the page is". */
for (const [path, info] of witnessInfo) {
  if (info.kind === 'broken') refuse('R27-BROKEN-CLOSURE', `witness ${path}: ${info.why}`);
  if (info.kind === 'runnable' && !info.files.length) refuse('R27-BROKEN-CLOSURE', `witness ${path}: classified runnable with an empty closure`);
}
for (const c of cells) {
  if (!c.derived.witnessPage) continue;
  const runnable = c.derived.witnesses
    .map((w) => witnessInfo.get(w.split(' §')[0]))
    .filter((i) => i && i.kind === 'runnable');
  if (!runnable.length) refuse('R28-PAGE-WITHOUT-RUNNABLE', `cell ${c.num}: has a witness page but nothing on it can run`);
}

// Every ledger cell binding must resolve. This is the check that used to
// eval() a web page to find its subject.
for (const num of claimsByCell.keys()) {
  if (!seen.has(num)) refuse('R18-DANGLING-BINDING', `CLAIM_LEDGER.json binds cell:${num}, which is not in cells.json`);
}

// The registers must partition the table. A cell in none of them, or in two,
// would vanish from the page with nothing to notice.
const regSum = AXES.registers.reduce((n, r) => n + r.count, 0);
if (regSum !== cells.length) refuse('R19-REGISTER-PARTITION', `registers hold ${regSum} cells over a table of ${cells.length}`);

/* ─────────────────── validate: the semantic floor ───────────────────
   These are the assertions that stop the floor drifting back to the taxonomy it
   replaced. They are POSITIVE — each names a thing that must be TRUE — because
   a blacklist of forbidden phrases only catches the wordings someone already
   thought of, and the reduction is a claim about structure, not about spelling.
   The one negative (R33, on the rendered artifact) is the exception that earns
   it: `grants` is the specific verb S2 exists to refuse, and the page is where
   a reader would meet it. */

const FLOOR_REQUIRED = ['id', 'name', 'obligation', 'evidence', 'evidence_class', 'scope_profile'];
for (const o of FLOOR.obligations) {
  const at = `floor ${o.id}`;
  for (const f of FLOOR_REQUIRED) {
    if (!o[f]) refuse('R30-FLOOR-INCOMPLETE', `${at}: missing \`${f}\``);
  }
  /* An obligation with no stated scope reads as universal, and none of these is.
     S3 and S5 are TESTED-CONDITIONAL under a written profile, and a floor row
     that drops the profile promotes itself by omission. */
  if (!Array.isArray(o.open)) refuse('R30-FLOOR-INCOMPLETE', `${at}: \`open\` must be a list, empty if nothing is open`);
  if (/\bproved\b/i.test(o.evidence_class || '') && !/domain|model/i.test(o.evidence_class || '')) {
    refuse('R31-FLOOR-OVERCLAIM', `${at}: evidence_class "${o.evidence_class}" claims a proof the package does not carry`);
  }
}

/* S3's two enforcement properties are a statement about OBLIGATIONS, not about
   mechanism count. The frontier is explicit that one compound trusted mechanism
   may supply both and that a floor census must not be forced upward by a
   semantic decomposition — so the row must carry the note that says so. */
const s3row = FLOOR.obligations.find((o) => o.id === 'S3');
if (s3row) {
  const props = (s3row.enforcement_properties || []).join(' ').toLowerCase();
  if (!/current/.test(props) || !/canonical/.test(props)) {
    refuse('R32-FLOOR-PROPERTIES', 'floor S3: must name currentness/exclusivity AND canonical-history continuity');
  }
  if (!/mechanism/i.test(s3row.properties_note || '')) {
    refuse('R32-FLOOR-PROPERTIES', 'floor S3: names two properties without the note separating them from mechanism count');
  }
}

/* S4 without both words is the naive reading the rewrite exists to kill. */
const s4row = FLOOR.obligations.find((o) => o.id === 'S4');
if (s4row && !(/adequa/i.test(s4row.obligation) && /equivarian/i.test(s4row.obligation))) {
  refuse('R32-FLOOR-PROPERTIES', 'floor S4: the obligation must name ADEQUACY and EQUIVARIANCE');
}

/* S5 must keep uncertainty explicit and the five concepts distinct. */
const s5row = FLOOR.obligations.find((o) => o.id === 'S5');
if (s5row) {
  const body = `${s5row.obligation} ${(s5row.consequences || []).join(' ')}`;
  if (!/unknown/i.test(body)) refuse('R32-FLOOR-PROPERTIES', 'floor S5: does not preserve explicit UNKNOWN');
  for (const w of ['intent', 'attempt', 'satisf']) {
    if (!new RegExp(w, 'i').test(body)) refuse('R32-FLOOR-PROPERTIES', `floor S5: does not distinguish "${w}…"`);
  }
}

/* S6 is a corollary of S1. It is recorded under resolved_candidates and must
   appear on NO obligation row — the count is not a thing to be preserved. */
for (const id of RESOLVED_IDS) {
  if (FLOOR_IDS.includes(id)) refuse('R34-RESOLVED-AS-PRIMITIVE', `floor: "${id}" is a resolved candidate AND an obligation`);
}
for (const r of FLOOR.resolved_candidates) {
  if (r.disposition !== 'not_promoted') refuse('R34-RESOLVED-AS-PRIMITIVE', `floor ${r.id}: resolved with disposition "${r.disposition}"`);
  if (!FLOOR_IDS.includes(r.reduces_to)) refuse('R35-DANGLING-REDUCTION', `floor ${r.id}: reduces_to "${r.reduces_to}", which is not an obligation`);
}

/* Liveness is a separate axis. An L-row that drifted into the S-series would be
   the exact confusion EXP-4's census was run to prevent. */
for (const a of FLOOR.separate_axes) {
  if (FLOOR_IDS.includes(a.id)) refuse('R36-AXIS-IN-BASIS', `floor: "${a.id}" is a separate axis AND an obligation`);
  if (!a.why_separate) refuse('R36-AXIS-IN-BASIS', `floor ${a.id}: on a separate axis with no \`why_separate\``);
}

/* A relation that points nowhere is decoration; a vocabulary the data does not
   use is worse, because it advertises a structure that is not there. */
for (const c of relatedCells) {
  const fr = c.floor_relation;
  const at = `cell ${c.num}.floor_relation`;
  if (!RELATION_VOCAB.includes(fr.relation)) refuse('R37-RELATION-VOCAB', `${at}: relation "${fr.relation}" is not in floor.json relation_vocabulary`);
  if (!fr.why) refuse('R37-RELATION-VOCAB', `${at}: no \`why\` — an unexplained relation cannot be checked`);
  if (!(fr.parent || []).length) refuse('R38-DANGLING-RELATION', `${at}: a relation with no parent`);
  for (const parent of fr.parent || []) {
    if (!FLOOR_IDS.includes(parent) && !AXIS_IDS.includes(parent)) {
      refuse('R38-DANGLING-RELATION', `${at}: parent "${parent}" is neither an obligation nor a separate axis`);
    }
  }
}

/* THE BOUNDARY READING IS PART OF THE OBLIGATION, not a note beside it.
   The X1 model found 537 of 537 stale traces leaving S2 (read as history) or S4
   (read at observation) satisfied while a semantically invalid action was
   admitted — so the reduction of X1 into these two rows depended on a reading
   the floor did not state. It states it now, and this refuses its removal. An
   implementer who reads S2 the weak way has an S2-conformant system that admits
   revoked authority, which is the whole reason the wording is load-bearing. */
const BOUNDARY_ROWS = {
  S2: { needle: /\bconsumed\b/i, note: /revoked|superseded|exhausted/i, why: 'the boundary where authority is CONSUMED' },
  S4: { needle: /published or consumed/i, note: /versioning|fencing|atomic|revalidat/i, why: 'the boundary where an artifact is PUBLISHED or CONSUMED' },
};
for (const [id, rule] of Object.entries(BOUNDARY_ROWS)) {
  const o = FLOOR.obligations.find((x) => x.id === id);
  if (!o) { refuse('R43-BOUNDARY-READING', `floor: ${id} is missing`); continue; }
  if (!/boundary/i.test(o.obligation) || !rule.needle.test(o.obligation)) {
    refuse('R43-BOUNDARY-READING', `floor ${id}: the obligation does not name ${rule.why} — the weak reading is satisfiable while an invalid action is admitted`);
  }
  if (!o.boundary_note || !rule.note.test(o.boundary_note)) {
    refuse('R43-BOUNDARY-READING', `floor ${id}: no \`boundary_note\` saying what the boundary reading rules out`);
  }
}

/* X1 is reduced, not minted. It absorbed six findings and an exhaustive model
   showed every one of them landing on an existing row — so the one thing it must
   never become is a sixth obligation or a 47th cell, which is exactly what a
   pattern that explains six findings invites. The refusal is cheap and the
   temptation is not hypothetical: this table grew by accumulation for nine
   rounds. It must also keep its reduction experiment attached; a dimension
   recorded without the measurement that reduced it is an opinion. */
const X1 = FLOOR.observed_not_minted;
if (X1) {
  if (FLOOR_IDS.includes(X1.id)) refuse('R41-DIMENSION-MINTED', `floor: "${X1.id}" is recorded as a cross-cutting dimension AND as an obligation`);
  if (AXIS_IDS.includes(X1.id)) refuse('R41-DIMENSION-MINTED', `floor: "${X1.id}" is a cross-cutting dimension AND a separate axis`);
  if (cells.some((c) => (c.floor_relation?.parent || []).includes(X1.id))) {
    refuse('R41-DIMENSION-MINTED', `a cell relates to "${X1.id}", which is a dimension the rows are read through, not an obligation a cell can specialize`);
  }
  if (!/NOT MINTED/i.test(X1.disposition || '')) refuse('R41-DIMENSION-MINTED', `floor ${X1.id}: recorded without an explicit non-promotion disposition`);
  const rx = X1.reduction_experiment;
  if (!rx?.witness || !rx?.result || !rx?.finding) {
    refuse('R42-DIMENSION-UNREDUCED', `floor ${X1.id}: recorded as reduced with no witness, result and finding — that is an opinion, not a reduction`);
  } else if (!existsSync(resolve(ROOT, rx.witness)) || !existsSync(resolve(ROOT, rx.result))) {
    refuse('R42-DIMENSION-UNREDUCED', `floor ${X1.id}: the reduction experiment or its recorded result is not on disk`);
  }
}

/* An obligation adjudicated EXPECTED-EMPTY is not waiting for a cell. S1 is the
   case: nothing on this table specializes admission singularity, and the ruling
   is that this is what a floor is FOR — a primitive may be more fundamental than
   any measurement the census carries, and faking a child to make the graph look
   symmetrical would assert something false. So attaching one later must clear a
   bar: the relation has to say what the cell CONSTRAINS about admission or
   currentness. Cell 07 detects conflicting claims and does not refuse either of
   them; that is the exact shape this refusal exists to keep out. */
for (const o of FLOOR.obligations) {
  const ee = o.expected_empty;
  if (!ee) continue;
  const at = `floor ${o.id}.expected_empty`;
  for (const f of ['classification', 'why', 'attachment_rule']) {
    if (!ee[f]) refuse('R40-EXPECTED-EMPTY', `${at}: missing \`${f}\``);
  }
  if (!Array.isArray(ee.nearby_cells_examined) || !ee.nearby_cells_examined.length) {
    refuse('R40-EXPECTED-EMPTY', `${at}: classified EXPECTED-EMPTY without naming the cells examined and rejected`);
  }
  for (const c of relatedByFloor[o.id] || []) {
    const why = cells.find((x) => x.num === c.num).floor_relation.why;
    if (!/\b(admis|current|exclusiv|refus|singular)/i.test(why)) {
      refuse('R40-EXPECTED-EMPTY',
        `cell ${c.num} attaches to ${o.id}, which is adjudicated EXPECTED-EMPTY, and its \`why\` does not say what it constrains about admission or currentness — observing a conflict is not admitting one of it`);
    }
  }
}

/* S2 is why this page may not say a state GRANTS authority. Applied to the
   rendered artifact further down, so it covers page copy AND cell prose. */
/* Two word orders, because the wording this refuses appears in both: "state
   grants authority", and "what authority that position grants". The gap may not
   cross a clause boundary — the CORRECT statement of the doctrine is "state
   constrains what can be authorized; explicit policy and grants establish
   authority", and a looser gap matches that sentence too, which would make the
   gate refuse the very sentence it exists to protect. It did, on the first run. */
const SUBJ = '(?:state|position|persistence|reachability|observation|lineage|provenance)';
const GAP = '[^.;,:—<]{0,30}';
/* The floor's refusals get their own checkpoint, and this is not cosmetic: the
   rendering below reads `o.open.length` and `a.assumptions`, so an obligation
   that dropped a required field would reach the template and die with a
   TypeError while a stated refusal sat unread in `problems`. The gate caught
   exactly that. A refusal that loses a race to a crash is not a refusal, and
   the reader of the crash learns nothing about which rule was broken. */
if (problems.length) {
  console.error(`\n✗ invariants build REFUSED — ${problems.length} problem(s)\n`);
  for (const p of problems) console.error(`  [${p.id}] ${p.msg}`);
  console.error('');
  process.exit(1);
}

const GRANTS_AUTHORITY = new RegExp(
  `\\b${SUBJ}\\b${GAP}\\bgrants?\\b${GAP}\\bauthority\\b|\\bauthority\\b${GAP}\\b${SUBJ}\\b\\s+grants?\\b`,
  'i',
);


/* ─────────────────────────── copy ─────────────────────────── */

const subtitle = render(COPY.subtitle, 'copy.subtitle');
const noteBody = render(COPY.reframe_note, 'copy.reframe_note');
const floorNote = render(COPY.floor_note, 'copy.floor_note');
const registerNotes = Object.fromEntries(
  AXES.registers.map((r) => [r.id, render(r.note, `axes.registers.${r.id}.note`)])
);

/* ─────────────────────────── groups ─────────────────────────── */

/* A cell has ONE home. Grouping by `includes(k)` drew a three-kind cell in three
   groups and rendered 52 cells over a table of 46 — every visible count
   inflated by the layout. The PRIMARY kind (first in the tuple) places the cell;
   the full tuple is on the cell's data attribute, in the group meta and in the
   inspector, so the multi-kind fact is kept without duplicating the object.
   R23 below refuses a partition that does not cover the table exactly once. */
function kindGroups(cs) {
  const groups = [];
  const placed = [];
  for (const k of KIND_VOCAB) {
    const g = cs.filter((c) => (c.kind || [])[0] === k);
    if (!g.length) continue;
    placed.push(...g);
    const also = g.filter((c) => c.kind.length > 1).length;
    const meta = `${g.length} cell${g.length === 1 ? '' : 's'}`
      + (also ? ` · ${also} also carr${also === 1 ? 'ies' : 'y'} a further kind` : '');
    groups.push(T.group({ eyebrow: 'Kind', name: k, meta, cells: g }));
  }
  const un = cs.filter((c) => !(c.kind || []).length);
  placed.push(...un);
  if (un.length) {
    groups.push(T.group({
      eyebrow: 'Kind', name: '— unassigned —',
      meta: COPY.unassigned_meta,
      cells: un, unassigned: true,
    }));
  }
  return { groups, placed };
}

function protocolGroups(cs) {
  const order = [...new Set(cs.map((c) => c.protocol_group.label))];
  const groups = order.map((label) => {
    const g = cs.filter((c) => c.protocol_group.label === label);
    return T.group({ eyebrow: `Group ${label}`, name: g[0].protocol_group.name, meta: g[0].protocol_group.meta, cells: g });
  });
  return { groups, placed: [...cs] };
}

const allPlaced = [];
const bands = AXES.registers.map((reg) => {
  const cs = inReg(reg.id);
  const { groups, placed } =
    reg.grouped_by === 'kind' ? kindGroups(cs)
    : reg.grouped_by === 'protocol_group' ? protocolGroups(cs)
    : { groups: [T.group({ eyebrow: 'Annex', name: COPY.proposed_group_name, meta: `${cs.length} cell${cs.length === 1 ? '' : 's'}`, cells: cs })], placed: [...cs] };
  allPlaced.push(...placed);
  return T.registerBand({ reg, note: registerNotes[reg.id], groups });
});

/* The layout must be a PARTITION: every cell drawn once, no cell dropped. A
   grouping predicate that overlaps silently inflates every count a reader can
   see while the derived facts stay correct — two descriptions of one state,
   this time between the census strip and the grid beneath it. */
const drawn = allPlaced.map((c) => c.num);
const dupes = drawn.filter((n, i) => drawn.indexOf(n) !== i);
if (dupes.length) refuse('R23-NOT-A-PARTITION', `cell(s) drawn more than once: ${[...new Set(dupes)].join(', ')}`);
const dropped = cells.filter((c) => !drawn.includes(c.num)).map((c) => c.num);
if (dropped.length) refuse('R23-NOT-A-PARTITION', `cell(s) drawn in no group: ${dropped.join(', ')}`);

/* ─────────────────────────── emit ─────────────────────────── */

/* The page's own version is typed in ONE place — cells.json `version`. A source
   file that types a page-version marker literally is refused: that is exactly
   how v0.7 cells and a v0.7 inspector shipped under a v0.6 masthead for two
   rounds. Other subjects' versions (PULSE v0.1, Graphonomous v0.4) live in cell
   prose, which is data, not chrome, and is not covered by this. */
const cssSrc = read('opensentience.org/_invariants/styles/table.css');
const tplSrc = read('opensentience.org/_invariants/build/templates.mjs');
for (const [name, src] of [['styles/table.css', cssSrc], ['build/templates.mjs', tplSrc]]) {
  const lit = [...src.matchAll(/\bv(\d+\.\d+)\b/g)].map((m) => m[1]);
  for (const v of lit) refuse('R20-VERSION-LITERAL', `${name}: page-version marker "v${v}" is typed literally — use {{VERSION}}`);
}
const css = cssSrc.replace(/\{\{VERSION\}\}/g, VERSION);

const inspectorData = Object.fromEntries(cells.map((c) => [c.num, {
  num: c.num, symbol: c.symbol, glyph: !!c.glyph, label: c.label, title: c.title,
  tagline: c.tagline, desc: c.desc, extra: c.extra, formal: c.formal || null,
  protocol: c.protocol, authority: c.authority, source: c.source,
  proof: c.proof || null, tier: c.tier || null, status: c.status,
  witnesses: c.derived.witnesses, witness_note: c.witness_note || null,
  self_witness: c.derived.selfWitness, evidence_absent: c.evidence_absent || null,
  witness_page: c.derived.witnessPage,
  kind: c.kind || null, kind_source: c.kind_source || null, kind_why: c.kind_why || null,
  relational_arity: c.relational_arity || null, hypothesis: c.hypothesis || null,
  register: c.derived.register,
  floor_relation: c.floor_relation || null,
  records: c.derived.records, doubt: c.derived.doubt,
}]));

const runtime = {
  registers: Object.fromEntries(AXES.registers.map((r) => [r.id, { name: r.name, roman: r.roman }])),
  tiers: AXES.tiers,
  cells: inspectorData,
  floor: Object.fromEntries([...FLOOR.obligations, ...FLOOR.separate_axes].map((o) => [o.id, o.name])),
  relations: FLOOR.relation_vocabulary,
};

const html = `<!doctype html>
<html lang="en">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>The Periodic Table of Agent Invariants — OpenSentience</title>
        <meta name="description" content="${T.escapeHtml(COPY.meta_description)}" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
        <link
            href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400&family=JetBrains+Mono:wght@400;500;700&family=Inter:wght@400;500;600&display=swap"
            rel="stylesheet"
        />
        <style>
${css}
        </style>
    </head>
    <body style="padding-top: 56px">
        <script type="module" src="/amp-nav.js"></script>
        <amp-nav property="opensentience"></amp-nav>
${T.masthead({ version: VERSION, subtitle })}
${T.reframeNote({ version: VERSION, body: noteBody })}
${T.reframeNote({ version: VERSION, body: floorNote })}
${T.census(COPY.census.map((r) => ({ value: FACTS[r.fact].value, label: r.label, emphasis: !!r.emphasis })))}
${T.registerLegend(AXES.registers)}
${T.tierLegend(AXES.tiers)}
${T.statusLegend(AXES.statuses)}
${T.filterBar({
  registers: AXES.registers,
  kinds: KIND_VOCAB.filter((k) => cells.some((c) => (c.kind || []).includes(k))),
  statuses: Object.keys(AXES.statuses).filter((k) => k !== '_comment'),
})}
        <main class="table-stage" id="table">
${T.floorBand({
  floor: FLOOR,
  obligations: FLOOR.obligations,
  axes: FLOOR.separate_axes,
  resolved: FLOOR.resolved_candidates,
  observed: FLOOR.observed_not_minted,
  related: relatedByFloor,
})}
${bands.join('\n')}
        </main>
${T.inspector()}
${T.footer({ protocolRange: PROTOCOL_RANGE, citations: COPY.citations })}
        <script>
            const TABLE = ${JSON.stringify(runtime)};

            /* ── inspector ── */
            const inspector = document.getElementById("inspector");
            const glyphWrap = document.getElementById("i-glyph-wrap");
            const set = (id, v) => { document.getElementById(id).textContent = v; };
            const row = (id, on) => { document.getElementById(id).style.display = on ? "" : "none"; };

            function openInspector(num) {
                const c = TABLE.cells[num];
                if (!c) return;
                set("i-num", c.num);
                const sym = document.getElementById("i-symbol");
                sym.textContent = c.symbol;
                sym.className = "big-symbol" + (c.glyph ? " glyph" : "");
                set("i-label", c.label);
                set("i-register", TABLE.registers[c.register].roman + " · " + TABLE.registers[c.register].name);
                set("i-title", c.title);
                set("i-tagline", c.tagline);
                set("i-description", c.desc);
                set("i-extra", c.extra || "");

                const formal = document.getElementById("i-formal");
                if (c.formal) { set("i-formal-text", c.formal); formal.style.display = "block"; }
                else formal.style.display = "none";

                /* Ledger records — DERIVED from CLAIM_LEDGER.json at build time.
                   The table used to restate its claims as prose inside \`extra\`,
                   which is the second description that drifts. */
                const lb = document.getElementById("i-ledger");
                const ll = document.getElementById("i-ledger-list");
                ll.innerHTML = "";
                if (c.records.length) {
                    for (const r of c.records) {
                        const d = document.createElement("div");
                        d.className = "rec";
                        d.innerHTML =
                            '<span class="rec-status ' + r.status + '">' + r.status + "</span>" +
                            '<span class="rec-id"></span>' +
                            '<span class="rec-obl"></span>';
                        d.querySelector(".rec-id").textContent = r.id;
                        d.querySelector(".rec-obl").textContent = r.obligation || "";
                        d.title = r.statement;
                        ll.appendChild(d);
                    }
                    lb.style.display = "block";
                } else lb.style.display = "none";

                const db = document.getElementById("i-doubt");
                const dl = document.getElementById("i-doubt-list");
                dl.innerHTML = "";
                if (c.doubt.length) {
                    for (const d of c.doubt) {
                        const e = document.createElement("div");
                        e.className = "doubt-item";
                        e.innerHTML = "<b></b> <span></span>";
                        e.querySelector("b").textContent = d.id + " (" + d.kind + ")";
                        e.querySelector("span").textContent = d.doubt;
                        dl.appendChild(e);
                    }
                    db.style.display = "block";
                } else db.style.display = "none";

                const badge = document.getElementById("i-status");
                badge.textContent = c.status;
                badge.className = "status-badge " + c.status;

                if (c.tier) {
                    const t = TABLE.tiers[c.tier];
                    set("i-tier", t.name + " — " + t.gloss);
                }
                row("i-tier-row", !!c.tier);

                if (c.kind) {
                    set("i-kind", c.kind.join(" × ") + (c.kind_source === "authored" ? " (authored: " + c.kind_why + ")" : ""));
                }
                row("i-kind-row", !!c.kind);

                /* The relation is stated with its REASON, always. An arrow from a
                   cell to S2 with nothing behind it is a claim the reader cannot
                   check, and the whole point of the floor is that the reduction is
                   checkable rather than asserted. */
                if (c.floor_relation) {
                    const fr = c.floor_relation;
                    const names = fr.parent.map((p) => p + " " + (TABLE.floor[p] || "")).join(" + ");
                    set("i-floor-rel", fr.relation.replace(/_/g, " ").toUpperCase() + " → " + names);
                    set("i-floor-why", fr.why);
                }
                row("i-floor-row", !!c.floor_relation);

                if (c.relational_arity) {
                    set("i-arity", c.relational_arity + " — a refutation is " + (c.relational_arity > 1 ? "a PAIR of runs, not one" : "a single run"));
                }
                row("i-arity-row", !!c.relational_arity);

                if (c.hypothesis) set("i-hypothesis", c.hypothesis);
                row("i-hypothesis-row", !!c.hypothesis);

                set("i-protocol", c.protocol);
                set("i-authority", c.authority);
                set("i-source", c.source);

                /* THE EVIDENCE FOOT. Every decided cell shows one of three
                   things and never nothing: a page to read, a witness to run,
                   or a stated reason there is neither. Binding this to the
                   authored \`proof\` field alone left the six best-evidenced
                   cells on the table with no affordance at all. */
                const link = document.getElementById("i-proof");
                const wblock = document.getElementById("i-witness");
                const wlist = document.getElementById("i-witness-list");
                const none = document.getElementById("i-evidence-none");

                if (c.proof) {
                    link.href = c.proof;
                    /* Tier-aware, and it never calls a randomized search a proof. */
                    link.textContent = TABLE.tiers[c.tier].link_text + " →";
                    link.style.display = "inline-flex";
                } else if (c.witness_page) {
                    /* The same affordance for a cell whose evidence is a witness
                       rather than a page: its own page, where the REAL module
                       runs in the browser. */
                    link.href = c.witness_page;
                    link.textContent = "Run the witness →";
                    link.style.display = "inline-flex";
                } else link.style.display = "none";

                wlist.innerHTML = "";
                if (c.witnesses.length) {
                    document.getElementById("i-witness-label").textContent =
                        c.witnesses.length === 1 ? "Run the witness" : "Run the witnesses (" + c.witnesses.length + ")";
                    /* Group the sections of one file onto one command, so eight
                       witnesses across one gate read as one thing to run. */
                    const byFile = new Map();
                    for (const w of c.witnesses) {
                        const i = w.indexOf(" §");
                        const file = i < 0 ? w : w.slice(0, i);
                        const sec = i < 0 ? null : w.slice(i + 2);
                        if (!byFile.has(file)) byFile.set(file, []);
                        if (sec) byFile.get(file).push(sec);
                    }
                    const selfFiles = new Set(c.self_witness.map((w) => w.split(" §")[0]));
                    for (const [file, secs] of byFile) {
                        const d = document.createElement("div");
                        d.className = "wit" + (selfFiles.has(file) ? " wit-self" : "");
                        const runnable = file.endsWith(".mjs");
                        d.innerHTML = '<code class="wit-cmd"></code><span class="wit-sec"></span><span class="wit-flag"></span>';
                        d.querySelector(".wit-cmd").textContent = (runnable ? "node " : "") + file;
                        d.querySelector(".wit-sec").textContent = secs.length ? "§" + secs.join(" §") : "";
                        /* Not evidence — the page describing the cell that cites it. */
                        d.querySelector(".wit-flag").textContent = selfFiles.has(file)
                            ? "self-referential — this page, generated from the data it is offered as evidence for"
                            : "";
                        wlist.appendChild(d);
                    }
                    document.getElementById("i-witness-note").textContent = c.witness_note || "";
                    wblock.style.display = "block";
                } else wblock.style.display = "none";

                if (!c.proof && !c.witnesses.length) {
                    none.textContent = c.evidence_absent
                        || "Nothing in this tree decides this cell yet — that is what the register above says.";
                    none.style.display = "block";
                } else none.style.display = "none";

                inspector.classList.add("open");
                inspector.setAttribute("aria-hidden", "false");
            }

            function closeInspector() {
                inspector.classList.remove("open");
                inspector.setAttribute("aria-hidden", "true");
            }

            document.querySelectorAll(".cell").forEach((el, i) => {
                el.style.animationDelay = i * 14 + "ms";
                el.addEventListener("click", () => openInspector(el.dataset.num));
            });
            /* The floor's own cell references open the same inspector. A relation
               the reader can only read is worth less than one they can follow. */
            document.querySelectorAll(".floor-cell-ref").forEach((el) => {
                el.addEventListener("click", () => openInspector(el.dataset.num));
            });

            document.getElementById("inspector-close").addEventListener("click", closeInspector);
            document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeInspector(); });

            /* ── faceted filter ── */
            document.querySelectorAll(".chip").forEach((chip) => {
                chip.addEventListener("click", () => {
                    document.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
                    chip.classList.add("active");
                    const facet = chip.dataset.facet;
                    const want = chip.dataset.filter;
                    document.querySelectorAll(".cell").forEach((cell) => {
                        let show;
                        if (facet === "all") show = true;
                        else if (facet === "kind") show = (cell.dataset.kind || "").split("|").includes(want);
                        else show = cell.dataset[facet] === want;
                        cell.classList.toggle("dimmed", !show);
                    });
                    document.querySelectorAll(".family, .register").forEach((g) => {
                        const cs = g.querySelectorAll(".cell");
                        const any = [...cs].some((c) => !c.classList.contains("dimmed"));
                        g.classList.toggle("dimmed-group", cs.length > 0 && !any);
                    });
                });
            });
        </script>
    </body>
</html>
`;

/* Both chrome sites that state the page's version must state the same one. */
const volV = /class="vol">Vol\. I — No\. 1 · v([\d.]+)</.exec(html);
const tagV = /class="v05-tag">v([\d.]+) ·/.exec(html);
if (!volV || !tagV) refuse('R20-VERSION-MISSING', 'a chrome site that should state the page version does not');
else if (volV[1] !== VERSION || tagV[1] !== VERSION) {
  refuse('R20-VERSION-DRIFT', `masthead says v${volV[1]}, note tag says v${tagV[1]}, data says v${VERSION}`);
}

if (/mailto:/i.test(html)) refuse('R21-MAILTO', 'the artifact contains a mailto: link');

/* S2 on the surface. Established state constrains what can be authorized;
   explicit policy and grants establish authority. A page that says a position
   or a persisted byte GRANTS authority teaches the reader the one thing S2
   exists to refuse, and it would be doing it in the subtitle — the sentence
   most readers see and the only one some of them read. */
const grantsHit = html.match(GRANTS_AUTHORITY);
if (grantsHit) refuse('R33-STATE-GRANTS-AUTHORITY', `the artifact says "${grantsHit[0].trim()}" — S2 refuses it: state constrains admissibility, policy and grants establish authority`);

/* The floor must actually reach the page. A band that silently failed to render
   would leave every relation on every cell pointing at nothing a reader can
   reach, and the build would still be green. */
for (const id of [...FLOOR_IDS, ...AXIS_IDS, ...RESOLVED_IDS]) {
  if (!html.includes(`id="floor-${id}"`)) refuse('R39-FLOOR-NOT-RENDERED', `floor row "${id}" is in the data and not on the page`);
}

/* Tier link text is generated from axes.json. If a tier's link_text calls a
   property test a proof, refuse — that is the R5.1 laundering, on the surface. */
for (const [id, t] of Object.entries(AXES.tiers)) {
  if (id === '_comment') continue;
  if (id !== 'machine' && /\bproof\b/i.test(t.link_text)) {
    refuse('R22-PROOF-LAUNDERING', `tier "${id}" link_text says "proof" — only \`machine\` may`);
  }
}

/* ─────────────────────────── report ─────────────────────────── */

if (problems.length) {
  console.error(`\n✗ invariants build REFUSED — ${problems.length} problem(s)\n`);
  for (const p of problems) console.error(`  [${p.id}] ${p.msg}`);
  console.error('');
  process.exit(1);
}

const digest = sha(html);
const DEST = resolve(SITE, 'invariants.html');
const DIST = resolve(HERE, '../dist');

if (VERIFY) {
  const onDisk = existsSync(DEST) ? readFileSync(DEST, 'utf8') : '';
  const same = sha(onDisk) === digest;
  const artifactPath = join(DIST, 'artifact.json');
  const artifact = existsSync(artifactPath) ? JSON.parse(readFileSync(artifactPath, 'utf8')) : null;
  log(`invariants.html  built ${digest.slice(0, 16)}  on-disk ${sha(onDisk).slice(0, 16)}`);
  if (artifact) log(`artifact.json    ${artifact.sha256.slice(0, 16)}  round ${artifact.round}  v${artifact.version}`);
  if (!same) { console.error('✗ what is on disk is not what this data builds. Run the build.'); process.exit(1); }
  if (artifact && artifact.sha256 !== digest) { console.error('✗ artifact.json records a different digest than this build produces.'); process.exit(1); }

  /* THE STAGED WITNESS TREE, BOTH DIRECTIONS. Each module must equal its SOURCE
     (or the page runs code the repo has moved past) and must equal what is
     SERVED (or the page runs code this build never produced). `opensentience.org/
     box-and-box/` is a hand-made copy with neither check, and it has already
     served a playground reporting a stale law count while every other surface
     disagreed. Two copies with no comparison is how that happens. */
  let drift = 0;
  for (const m of (artifact && artifact.witness_modules) || []) {
    const srcPath = resolve(ROOT, m.path);
    const servedPath = resolve(SITE, 'witness/src', m.path);
    const srcSha = existsSync(srcPath) ? sha(readFileSync(srcPath, 'utf8')) : null;
    const servedSha = existsSync(servedPath) ? sha(readFileSync(servedPath, 'utf8')) : null;
    if (srcSha !== m.sha256) { console.error(`✗ SOURCE moved: ${m.path}`); drift++; }
    else if (servedSha !== m.sha256) { console.error(`✗ SERVED copy differs: witness/src/${m.path}`); drift++; }
  }
  for (const p of (artifact && artifact.witness_pages) || []) {
    const f = resolve(SITE, 'witness', p.file);
    if (!existsSync(f) || sha(readFileSync(f, 'utf8')) !== p.sha256) { console.error(`✗ witness page differs: ${p.file}`); drift++; }
  }
  if (drift) { console.error(`✗ ${drift} witness drift(s). Run the build.`); process.exit(1); }

  const n = ((artifact && artifact.witness_modules) || []).length;
  const pg = ((artifact && artifact.witness_pages) || []).length;
  console.log(`✓ invariants.html on disk is exactly what this data builds`);
  console.log(`✓ ${n} staged witness module(s) match source AND served copy · ${pg} witness page(s) current`);
  process.exit(0);
}

const outDir = EMIT_TO ? resolve(EMIT_TO) : SITE;
mkdirSync(outDir, { recursive: true });

/* ── stage the witness modules and emit a page per witness-only cell ── */
const WDIR = join(outDir, 'witness');
rmSync(WDIR, { recursive: true, force: true });          // the build owns this directory outright
mkdirSync(join(WDIR, 'src'), { recursive: true });

const staged = [];
for (const info of witnessInfo.values()) {
  if (info.kind !== 'runnable') continue;
  for (const rel of info.files) {
    if (staged.some((s) => s.path === rel)) continue;
    const src = read(rel);   // through the choke point: a staged witness IS an input
    const dest = join(WDIR, 'src', rel);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, src);
    staged.push({ path: rel, sha256: sha(src), bytes: Buffer.byteLength(src) });
  }
}
writeFileSync(join(WDIR, 'run.js'), read('opensentience.org/_invariants/build/witness-runner.js'));

const witnessCss = read('opensentience.org/_invariants/styles/witness.css').replace(/\{\{VERSION\}\}/g, VERSION);
const STAMP = digestOf(staged);

const witnessPages = [];
for (const c of cells) {
  if (!c.derived.witnessPage) continue;
  const byPath = new Map();
  for (const w of c.derived.witnesses) {
    const info = witnessInfo.get(w.split(' §')[0]);
    if (info) byPath.set(info.path, { ...info, files: (info.files || []).length });
  }
  const ws = [...byPath.values()];
  /* WHERE THE PAGE RUNS A WEAKER THING THAN THE CLI, IT SAYS SO. The module is
     byte-identical; the corroboration is not, and a reduced run presented as the
     full one is the same laundering as calling a property test a proof. Both
     reductions below are stated on the page beside the button. */
  for (const w of ws) {
    if (w.path.endsWith('check-federation-invariants.mjs')) {
      w.argv = ['--preflight'];
      w.weaker = 'Runs with --preflight: every pinned construction, none of the exhaustive '
        + 'corroboration. The gate names each block it skipped in its own output. Drop the flag on '
        + 'the command line for the full run — it is ~20 s here and minutes in some environments.';
    }
    if (/test\/(compose-)?laws\.mjs$/.test(w.path)) {
      w.trials = 200;
      w.weaker = 'Runs at 200 trials per law; the command line runs 2,000. A property test is a '
        + 'randomized search either way — fewer trials search less. A law that passes here and '
        + 'fails at 2,000 is a law this page could not reach, which is the whole limitation of '
        + 'the method (LED-C9 died to exactly that).';
    }
  }
  const html = T.witnessPage({
    cell: c, css: witnessCss, stamp: STAMP, witnesses: ws,
    records: c.derived.records, doubt: c.derived.doubt,
    tier: c.tier ? AXES.tiers[c.tier] : null,
  });
  const file = witnessSlug(c);
  writeFileSync(join(WDIR, file), html);
  witnessPages.push({ num: c.num, file, url: c.derived.witnessPage, sha256: sha(html) });
}

const out = join(outDir, 'invariants.html');
const stage = out + '.stage';

// Hash before writing, read back off disk, re-hash, then rename into place.
writeFileSync(stage, html);
const readBack = readFileSync(stage, 'utf8');
if (sha(readBack) !== digest) { unlinkSync(stage); console.error('✗ staged bytes do not read back equal — refusing to publish'); process.exit(1); }
renameSync(stage, out);

{
  /* The artifact record is written in BOTH modes. prove-gate.mjs asserts
     properties of the staged witness tree, and it can only do that against a
     record the sandboxed run actually produced — reconstructing one in the
     harness would be a second description of what the build did. */
  const artifactDir = EMIT_TO ? resolve(EMIT_TO, '..') : DIST;
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(join(artifactDir, 'artifact.json'), JSON.stringify({
    _comment: 'Written by _invariants/build/build.mjs. --verify re-checks invariants.html against this.',
    built_from: 'opensentience.org/_invariants/data/{cells,axes,copy,floor}.json + CLAIM_LEDGER.json + mosaic/{occupancy,defeaters}.json',
    inputs: [...INPUTS.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([path, sha256]) => ({ path, sha256 })),
    version: VERSION,
    round: FACTS.ROUND.value,
    sha256: digest,
    bytes: Buffer.byteLength(html),
    cells: cells.length,
    floor: { obligations: FLOOR_IDS.length, separate_axes: AXIS_IDS.length, resolved: RESOLVED_IDS.length, related_cells: relatedCells.length },
    registers: Object.fromEntries(AXES.registers.map((r) => [r.id, r.count])),
    facts: Object.fromEntries(Object.entries(FACTS).map(([k, v]) => [k, v.value])),
    /* The staged witness tree, hashed per file. --verify re-reads each against
       its SOURCE, so a staged copy that drifts is refused. This is the check
       `opensentience.org/box-and-box/` has never had. */
    witness_stamp: STAMP,
    witness_modules: staged,
    witness_pages: witnessPages,
  }, null, 2) + '\n');
}

log(`\n  the table — v${VERSION}, round ${FACTS.ROUND.value}\n`);
for (const r of AXES.registers) {
  log(`   ${r.roman}  ${r.name.padEnd(20)} ${String(r.count).padStart(3)} cells   ${r.grouped_by === 'none' ? '' : 'by ' + r.grouped_by}`);
}
log('');
log(`   ${FACTS.BOUND_CLAIM_COUNT.value} ledger claims bind ${FACTS.BOUND_CELL_COUNT.value} cells · ${FACTS.REFUTED_CLAIM_COUNT.value} of them REFUTED`);
log(`   ${FACTS.KIND_COUNT.value} of ${cells.length} cells carry a kind — ${FACTS.KIND_DECLARED_COUNT.value} declared, ${FACTS.KIND_AUTHORED_COUNT.value} AUTHORED at the regroup`);
log(`   ${FACTS.UNKINDED_DECIDED_COUNT.value} decided cell(s) unassigned · ${FACTS.ACTIVE_DOUBT_COUNT.value} active doubts reach a cell`);
{
  const dec = inReg('decided');
  const page = dec.filter((c) => c.proof).length;
  const wit = dec.filter((c) => !c.proof && c.derived.witnesses.length).length;
  const declared = dec.filter((c) => c.evidence_absent).length;
  log(`   evidence foot: ${page} page · ${wit} witness-only · ${declared} declared-absent  = ${page + wit + declared} of ${dec.length} decided`);
  const otherWit = cells.filter((c) => c.derived.register !== 'decided' && c.derived.witnesses.length).length;
  if (otherWit) log(`   ${otherWit} cell(s) outside the decided register also carry a witness`);

  const selfCells = cells.filter((c) => c.derived.selfWitness.length);
  if (selfCells.length) {
    log('');
    log(`   ! SELF-REFERENTIAL WITNESS on cell(s) ${selfCells.map((c) => c.num).join(', ')} — the ledger names`);
    log(`     opensentience.org/invariants.html, which is THIS ARTIFACT, generated from the data the`);
    log(`     claim is about. Defensible while the page held the data; it does not any more.`);
    log(`     The record to change is in CLAIM_LEDGER.json, not here — point it at`);
    log(`     opensentience.org/_invariants/data/cells.json. Marked on the page until then.`);
  }
}
log('');
/* The floor prints its own census for the same reason the table does: a number
   nobody re-derives is a number that drifts. `open` counts are the honest half —
   an obligation with open findings is not a closed one, and the log says so
   before the page does. */
log('');
log(`  the semantic floor — ${FLOOR_IDS.length} obligations, ${relatedCells.length} cells related`);
log('');
for (const o of FLOOR.obligations) {
  const rel = (relatedByFloor[o.id] || []).length;
  log(`   ${o.id}  ${o.name.padEnd(30)} ${o.evidence_class.padEnd(22)} ${String(rel).padStart(2)} cell(s)`
    + (o.open.length ? `  · ${o.open.length} OPEN` : ''));
}
for (const r of FLOOR.resolved_candidates) log(`   ${r.id}  ${(r.name + ' →  ' + r.reduces_to).padEnd(30)} not promoted`);
for (const a of FLOOR.separate_axes) log(`   ${a.id.length > 4 ? a.id.slice(0, 4) : a.id.padEnd(4)}${a.id.length > 4 ? '…' : ''}  ${a.name.padEnd(29)} ${a.axis} · ${a.status}`);

log(`✓ invariants.html — ${Buffer.byteLength(html)} bytes, sha256 ${digest.slice(0, 16)}`);
