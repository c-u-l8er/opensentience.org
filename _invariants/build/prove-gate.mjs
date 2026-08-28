#!/usr/bin/env node
/**
 * prove-gate.mjs — prove the invariants build actually refuses what it claims.
 *
 *   node opensentience.org/_invariants/build/prove-gate.mjs
 *
 * Two halves, and both are needed (SHELL.md r11 + r12):
 *
 *   BREAKS   — each mutates ONE thing and must fail with the refusal id that
 *              break targets. A table of refusals that all refuse for one
 *              unrelated reason proves nothing.
 *   PROBES   — correct, or unusual-but-legitimate, inputs the gate must still
 *              PERMIT. A gate that refuses everything scores perfectly on a
 *              refusal-only harness.
 *
 * Everything runs inside a private mkdtemp holding a copy of the inputs. The
 * working tree is never written to.
 *
 * NOT PROVEN HERE, and said out loud rather than left to look covered — see
 * UNFIREABLE at the bottom. Some guards cannot be triggered from data because
 * they guard the build's own code, and one of them exists because that code was
 * wrong once.
 */
import { mkdtempSync, mkdirSync, cpSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const sha = (x) => createHash('sha256').update(x).digest('hex');

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(HERE, '../..');
const ROOT = resolve(SITE, '..');

const BASE = mkdtempSync(join(tmpdir(), 'inv-gate-'));
process.on('exit', () => { try { rmSync(BASE, { recursive: true, force: true }); } catch {} });

/* ── a sandbox that mirrors enough of the tree for build.mjs's path math ── */
function sandbox() {
  const dir = mkdtempSync(join(BASE, 'run-'));
  mkdirSync(join(dir, 'mosaic'), { recursive: true });
  cpSync(join(ROOT, 'CLAIM_LEDGER.json'), join(dir, 'CLAIM_LEDGER.json'));
  for (const f of ['occupancy.json', 'defeaters.json', 'arguments.json']) {
    cpSync(join(ROOT, 'mosaic', f), join(dir, 'mosaic', f));
  }
  cpSync(join(SITE, '_invariants'), join(dir, 'opensentience.org', '_invariants'), { recursive: true });
  cpSync(join(SITE, 'proofs'), join(dir, 'opensentience.org', 'proofs'), { recursive: true });
  rmSync(join(dir, 'opensentience.org', '_invariants', 'dist'), { recursive: true, force: true });

  /* Mirror every witness path in the build's witness universe, DERIVED rather
     than hand-listed — a hand-maintained copy set is round 2.1's dead-witness
     bug with an extra step. That universe is cells.json's `witnesses` PLUS the
     ledger claims the build joins in; mirroring only the first left probes
     failing on paths the real tree has, which is a fixture defect reported as a
     gate defect. Real files, not stubs: a stub satisfies R24 and proves nothing. */
  const cells = JSON.parse(readFileSync(P.cells(dir), 'utf8')).cells;
  const ledger = JSON.parse(readFileSync(P.ledger(dir), 'utf8'));
  const universe = new Set([
    ...cells.flatMap((c) => c.witnesses || []),
    ...ledger.claims.flatMap((c) => c.witnesses || []),
  ]);
  /* …and the TRANSITIVE CLOSURE of each, not just the named entry. Copying only
     the entries left `test/laws.mjs` in the sandbox without the eleven siblings
     it imports, so every probe failed on a closure the real tree has — which is
     round 2.1's dead-witness defect (`existsSync` true, evidence unable to
     start) reproduced inside the harness written to catch it. */
  const copyClosure = (rel) => {
    const seen = new Set();
    const walk = (r) => {
      if (seen.has(r)) return;
      seen.add(r);
      const src = join(ROOT, r);
      let body;
      try { body = readFileSync(src, 'utf8'); } catch { return; }
      mkdirSync(dirname(join(dir, r)), { recursive: true });
      cpSync(src, join(dir, r));
      for (const m of body.matchAll(/^\s*(?:import|export)[^'"]*?from\s+['"](\.[^'"]+)['"]/gm)) {
        /* join, not resolve: these are REPO-RELATIVE paths. resolve() anchors to
           the process CWD and produced `home/travis/…` once the leading slash
           was stripped, so every sibling silently failed to copy. */
        walk(join(dirname(r), m[1]));
      }
    };
    walk(rel);
  };
  for (const w of universe) copyClosure(w.split(' §')[0]);
  return dir;
}

const P = {
  cells: (d) => join(d, 'opensentience.org/_invariants/data/cells.json'),
  axes: (d) => join(d, 'opensentience.org/_invariants/data/axes.json'),
  copy: (d) => join(d, 'opensentience.org/_invariants/data/copy.json'),
  css: (d) => join(d, 'opensentience.org/_invariants/styles/table.css'),
  ledger: (d) => join(d, 'CLAIM_LEDGER.json'),
};
const edit = (path, fn) => {
  const j = JSON.parse(readFileSync(path, 'utf8'));
  fn(j);
  writeFileSync(path, JSON.stringify(j, null, 2));
};
const cellNamed = (j, num) => j.cells.find((c) => c.num === num);

function run(dir) {
  try {
    execFileSync('node', [join(dir, 'opensentience.org/_invariants/build/build.mjs'), '--quiet', '--emit-to', join(dir, 'out')],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, out: '' };
  } catch (e) {
    return { ok: false, out: String(e.stdout || '') + String(e.stderr || '') };
  }
}

/* ─────────────────────────── the breaks ─────────────────────────── */

const BREAKS = [
  ['R1-DUPLICATE-NUM', 'two cells claim number 36', (d) => edit(P.cells(d), (j) => { cellNamed(j, '45').num = '36'; })],
  ['R2-INCOMPLETE', 'a cell loses its title', (d) => edit(P.cells(d), (j) => { delete cellNamed(j, '10').title; })],
  ['R3-CONDITIONAL-NO-HYP', 'a conditional cell drops its undischarged antecedent', (d) => edit(P.cells(d), (j) => { delete cellNamed(j, '36').hypothesis; })],
  ['R4-HYP-NOT-CONDITIONAL', 'a proved cell grows a hypothesis', (d) => edit(P.cells(d), (j) => { cellNamed(j, '01').hypothesis = 'assume the reader is not paying attention'; })],
  ['R5-UNKNOWN-STATUS', 'a status outside axes.json', (d) => edit(P.cells(d), (j) => { cellNamed(j, '02').status = 'basically-done'; })],
  ['R6-KIND-VOCAB', 'a kind token outside mosaic/occupancy.json', (d) => edit(P.cells(d), (j) => { cellNamed(j, '01').kind = ['Epistemic']; })],
  ['R7-KIND-NO-SOURCE', 'a kind with no kind_source', (d) => edit(P.cells(d), (j) => { delete cellNamed(j, '01').kind_source; })],
  ['R8-AUTHORED-NO-WHY', 'an authored kind that will not say what it is read off', (d) => edit(P.cells(d), (j) => { delete cellNamed(j, '01').kind_why; })],
  ['R9-SOURCE-NO-KIND', 'a kind_source with no kind', (d) => edit(P.cells(d), (j) => { cellNamed(j, '02').kind_source = 'authored'; })],
  ['R10-TYPED-COUNT', 'a count typed in prose instead of a placeholder', (d) => edit(P.copy(d), (j) => { j.subtitle += ' There are 46 cells here.'; })],
  ['R11-UNKNOWN-PLACEHOLDER', 'a placeholder naming no derived fact', (d) => edit(P.copy(d), (j) => { j.subtitle += ' {{TOTALLY_REAL_FACT}}'; })],
  ['R12-DEAD-PROOF-LINK', 'a proof link that resolves to nothing', (d) => edit(P.cells(d), (j) => { cellNamed(j, '01').proof = '/proofs/does-not-exist.html'; })],
  ['R13-PROOF-NO-TIER', 'a proof link with no declared strength', (d) => edit(P.cells(d), (j) => { delete cellNamed(j, '01').tier; })],
  ['R14-UNKNOWN-TIER', 'a tier outside axes.json', (d) => edit(P.cells(d), (j) => { cellNamed(j, '01').tier = 'vibes'; })],
  ['R15-PROPOSED-HAS-EVIDENCE', 'an annexed proposal that turns out to carry evidence', (d) => edit(P.cells(d), (j) => { cellNamed(j, '37').tier = 'property'; })],
  ['R18-DANGLING-BINDING', 'the ledger binds a cell the table does not have', (d) => edit(P.ledger(d), (j) => { j.claims.find((c) => c.implementation_binding === 'cell:36').implementation_binding = 'cell:99'; })],
  ['R19-REGISTER-UNDECLARED', 'axes.json loses a register cells still land in', (d) => edit(P.axes(d), (j) => { j.registers = j.registers.filter((r) => r.id !== 'built'); })],
  ['R20-VERSION-LITERAL', 'a page-version marker typed into the stylesheet', (d) => { const p = P.css(d); writeFileSync(p, '/* v0.9 */\n' + readFileSync(p, 'utf8')); }],
  ['R21-MAILTO', 'a mailto: reaches the artifact', (d) => edit(P.copy(d), (j) => { j.citations.push('write to <a href="mailto:x@y.z">us</a>'); })],
  ['R22-PROOF-LAUNDERING', 'a property test is offered to the reader as a proof', (d) => edit(P.axes(d), (j) => { j.tiers.property.link_text = 'Read the proof'; })],
  ['R24-DEAD-WITNESS', 'a cell advertises a witness that is not on disk', (d) => edit(P.cells(d), (j) => { cellNamed(j, '44').witnesses = ['scripts/imaginary-witness.mjs']; })],
  ['R25-SILENT-ABSENCE', 'a decided cell offers the reader nothing and does not say why',
    (d) => { edit(P.cells(d), (j) => { const c = cellNamed(j, '44'); delete c.witnesses; }); edit(P.ledger(d), (j) => { j.claims = j.claims.filter((c) => c.implementation_binding !== 'cell:44'); }); }],
  ['R26-ABSENCE-CONTRADICTED', 'a cell claims it has no evidence while carrying some', (d) => edit(P.cells(d), (j) => { cellNamed(j, '01').evidence_absent = 'nothing decides this'; })],
  ['R27-BROKEN-CLOSURE', "a runnable witness's import closure loses a file",
    (d) => rmSync(join(d, 'scripts/federation-kernel.mjs'), { force: true })],
];

/* ─────────────────────────── the probes ─────────────────────────── */

const PROBES = [
  ['a decided cell with no kind is legal', (d) => edit(P.cells(d), (j) => { const c = cellNamed(j, '01'); delete c.kind; delete c.kind_source; delete c.kind_why; })],
  ['a cell carrying three kinds is legal', (d) => edit(P.cells(d), (j) => { const c = cellNamed(j, '45'); c.kind = ['Structural', 'Order', 'Authority']; })],
  ['a tier with no proof link is legal', (d) => edit(P.cells(d), (j) => { delete cellNamed(j, '01').proof; })],
  ['prose may contain a number that is not a derived count', (d) => edit(P.copy(d), (j) => { j.subtitle += ' The Wörgl scrip ran from 1932.'; })],
  ['prose may state a derived count through its placeholder', (d) => edit(P.copy(d), (j) => { j.subtitle += ' {{CELL_COUNT}} cells.'; })],
  /* Promoting a cell into `decided` means supplying the evidence too — a tier
     alone trips R25, and that is the rule working, not a false refusal. The
     first version of this probe set only the tier and was itself ill-formed. */
  ['a cell may move register when its evidence arrives with it',
    (d) => edit(P.cells(d), (j) => { const c = cellNamed(j, '02'); c.tier = 'impl'; c.witnesses = ['scripts/check-irreversible-ledger.mjs']; })],
  ['a decided cell with a declared evidence_absent and nothing else is legal',
    (d) => { edit(P.cells(d), (j) => { const c = cellNamed(j, '44'); delete c.witnesses; c.evidence_absent = 'The compose suite lives in another lane and is not staged here.'; }); edit(P.ledger(d), (j) => { j.claims = j.claims.filter((c) => c.implementation_binding !== 'cell:44'); }); }],
  ['a cell may carry both a proof page and witnesses', (d) => edit(P.cells(d), (j) => { cellNamed(j, '10').witnesses = ['scripts/check-federation-invariants.mjs']; })],
  ['a self-referential witness is MARKED, not refused — the ledger is another round\'s', () => {}],
  ['a node-only witness is CLASSIFIED, not refused — it just gets no Run button', () => {}],
  ['unmodified input builds', () => {}],
];

/* ── the witness tree the build stages ── */
const STAGE_CHECKS = [
  ['every runnable witness stages its whole import closure', (art, dir) => {
    const missing = art.witness_modules.filter((m) => !existsSync(join(dir, 'out/witness/src', m.path)));
    return missing.length ? `not staged: ${missing.map((m) => m.path).join(', ')}` : null;
  }],
  ['every staged module is byte-identical to its source', (art, dir) => {
    const bad = art.witness_modules.filter((m) =>
      sha(readFileSync(join(dir, 'out/witness/src', m.path), 'utf8')) !== sha(readFileSync(join(dir, m.path), 'utf8')));
    return bad.length ? `differs from source: ${bad.map((m) => m.path).join(', ')}` : null;
  }],
  ['every witness page a cell links to was actually written', (art, dir) => {
    const missing = art.witness_pages.filter((p) => !existsSync(join(dir, 'out/witness', p.file)));
    return missing.length ? `missing: ${missing.map((p) => p.file).join(', ')}` : null;
  }],
  ['no page offers a Run button for a node-only or data witness', (art, dir) => {
    const bad = [];
    for (const p of art.witness_pages) {
      const html = readFileSync(join(dir, 'out/witness', p.file), 'utf8');
      const specs = JSON.parse(/const SPECS = (\[.*?\]);/s.exec(html)[1]);
      for (const s of specs) {
        const rel = s.entry.replace('/witness/src/', '');
        if (!art.witness_modules.some((m) => m.path === rel)) bad.push(`${p.file} → ${rel}`);
      }
    }
    return bad.length ? `unstaged entry: ${bad.join(', ')}` : null;
  }],
];

/* ─────────────────────────── run ─────────────────────────── */

let failed = 0;
console.log('\n  BREAKS — each must fail with the refusal it targets\n');
for (const [id, what, mutate] of BREAKS) {
  const d = sandbox();
  mutate(d);
  const r = run(d);
  const hit = !r.ok && r.out.includes(`[${id}]`);
  const why = r.ok ? 'BUILT ANYWAY' : `refused, but not by ${id}`;
  console.log(`   ${hit ? '✓' : '✗'}  ${id.padEnd(28)} ${what}`);
  if (!hit) { failed++; console.log(`        ${why}\n${r.out.split('\n').filter((l) => l.trim()).slice(0, 4).map((l) => '        ' + l).join('\n')}`); }
}

console.log('\n  PROBES — each must still be PERMITTED\n');
for (const [what, mutate] of PROBES) {
  const d = sandbox();
  mutate(d);
  const r = run(d);
  console.log(`   ${r.ok ? '✓' : '✗'}  ${what}`);
  if (!r.ok) { failed++; console.log(r.out.split('\n').filter((l) => l.trim()).slice(0, 4).map((l) => '        ' + l).join('\n')); }
}

console.log('\n  STAGED WITNESS TREE — properties of what the build emits\n');
{
  const d = sandbox();
  const r = run(d);
  if (!r.ok) { failed++; console.log('   ✗  the reference build did not complete\n' + r.out.slice(0, 400)); }
  else {
    const art = JSON.parse(readFileSync(join(d, 'artifact.json'), 'utf8'));
    for (const [what, check] of STAGE_CHECKS) {
      let why = null;
      try { why = check(art, d); } catch (e) { why = 'threw: ' + e.message; }
      console.log(`   ${why ? '✗' : '✓'}  ${what}`);
      if (why) { failed++; console.log(`        ${why}`); }
    }
    console.log(`   ·  ${art.witness_modules.length} module(s) staged · ${art.witness_pages.length} page(s) emitted`);
  }
}

console.log(`
  UNFIREABLE FROM DATA — named, not counted as proven

   ·  R23-NOT-A-PARTITION guards the build's own grouping code, not its input.
      It exists because that code WAS wrong: grouping by \`kind.includes(k)\`
      drew every multi-kind cell once per kind and rendered 52 cells over a
      table of 46, inflating every count a reader can see while the derived
      facts stayed correct. No edit to cells.json can reproduce it — only an
      edit to kindGroups() can — so it is a regression guard and is not claimed
      as a proven refusal.
   ·  R0-STATUS-VOCAB fires only if CLAIM_LEDGER.json stops declaring a status
      this build treats as settled. That is a ledger-schema change, not a table
      input, and the ledger's own gate owns it.
   ·  R20-VERSION-DRIFT compares two chrome sites that are both written from one
      variable, so it cannot disagree with itself from data. R20-VERSION-LITERAL
      above is the half that can fire, and it is the half that caught the real
      defect.
`);

if (failed) { console.error(`✗ ${failed} check(s) did not behave as claimed\n`); process.exit(1); }
console.log(`✓ ${BREAKS.length} refusals each fired for their own reason · ${PROBES.length} legitimate inputs permitted\n`);
