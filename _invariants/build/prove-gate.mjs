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
  /* The floor's reduction experiment is part of the universe too, and DERIVED
     from floor.json rather than listed here. R42 resolves those paths on disk,
     so a sandbox that does not mirror them refuses every run for R42's reason
     and reports 29 unrelated breaks as failures — a fixture defect wearing the
     costume of a gate defect, which is the same mistake round 2.1 made. */
  const floor = JSON.parse(readFileSync(P.floor(dir), 'utf8'));
  const rx = floor.observed_not_minted?.reduction_experiment || {};
  const universe = new Set([
    ...cells.flatMap((c) => c.witnesses || []),
    ...ledger.claims.flatMap((c) => c.witnesses || []),
    ...[rx.witness, rx.result].filter(Boolean),
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
  floor: (d) => join(d, 'opensentience.org/_invariants/data/floor.json'),
  ledger: (d) => join(d, 'CLAIM_LEDGER.json'),
};
const edit = (path, fn) => {
  const j = JSON.parse(readFileSync(path, 'utf8'));
  fn(j);
  writeFileSync(path, JSON.stringify(j, null, 2));
};
const cellNamed = (j, num) => j.cells.find((c) => c.num === num);
const obl = (j, id) => j.obligations.find((o) => o.id === id);

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

  /* ── the floor. Each break is the specific way this floor could rot back into
     the taxonomy it replaced, and each must fail for ITS OWN id — a floor whose
     nine guards all trip one shared refusal has nine names for one check. ── */
  ['R29-VERSION-IN-PROSE', 'a cell types the page version into data instead of the placeholder',
    (d) => edit(P.cells(d), (j) => { cellNamed(j, '30').extra = 'Rewritten at v0.9, by hand, where it will go stale.'; })],
  ['R30-FLOOR-INCOMPLETE', 'an obligation drops the trust profile that bounds it',
    (d) => edit(P.floor(d), (j) => { delete obl(j, 'S3').scope_profile; })],
  ['R30-FLOOR-INCOMPLETE', 'an obligation stops declaring whether anything is open',
    (d) => edit(P.floor(d), (j) => { delete obl(j, 'S5').open; })],
  ['R31-FLOOR-OVERCLAIM', 'a tested obligation is promoted to proved',
    (d) => edit(P.floor(d), (j) => { obl(j, 'S3').evidence_class = 'proved'; })],
  ['R32-FLOOR-PROPERTIES', 'S3 keeps one enforcement property and drops the other',
    (d) => edit(P.floor(d), (j) => { obl(j, 'S3').enforcement_properties = ['currentness / exclusivity']; })],
  ['R32-FLOOR-PROPERTIES', 'S3 states two properties without separating them from mechanism count',
    (d) => edit(P.floor(d), (j) => { obl(j, 'S3').properties_note = 'Two of them.'; })],
  ['R32-FLOOR-PROPERTIES', 'S4 loses equivariance and keeps only adequacy',
    (d) => edit(P.floor(d), (j) => { obl(j, 'S4').obligation = 'Every shared projection is adequate for the behaviour it promises to distinguish.'; })],
  ['R32-FLOOR-PROPERTIES', 'S5 stops preserving explicit UNKNOWN',
    (d) => edit(P.floor(d), (j) => { const o = obl(j, 'S5'); o.obligation = 'Past the irreversible boundary, replay needs proven idempotency.'; o.consequences = ['Intent and attempt and satisfaction are distinct.']; })],
  ['R34-RESOLVED-AS-PRIMITIVE', 'S6 is promoted back to a sixth obligation to preserve a count',
    (d) => edit(P.floor(d), (j) => { const r = j.resolved_candidates[0]; j.obligations.push({ id: r.id, name: r.name, obligation: r.why, evidence: 'x', evidence_class: 'tested', scope_profile: 'worlds', open: [] }); })],
  ['R34-RESOLVED-AS-PRIMITIVE', 'a resolved candidate quietly changes its disposition',
    (d) => edit(P.floor(d), (j) => { j.resolved_candidates[0].disposition = 'promoted'; })],
  ['R35-DANGLING-REDUCTION', 'S6 reduces to an obligation that is not there',
    (d) => edit(P.floor(d), (j) => { j.resolved_candidates[0].reduces_to = 'S9'; })],
  ['R36-AXIS-IN-BASIS', 'the liveness candidate is folded into the safety basis',
    (d) => edit(P.floor(d), (j) => { const a = j.separate_axes[0]; j.obligations.push({ id: a.id, name: a.name, obligation: a.statement, evidence: a.evidence, evidence_class: 'tested', scope_profile: 'loci', open: [] }); })],
  ['R36-AXIS-IN-BASIS', 'a separate axis stops saying why it is separate',
    (d) => edit(P.floor(d), (j) => { delete j.separate_axes[0].why_separate; })],
  ['R37-RELATION-VOCAB', 'a cell claims a relation the vocabulary does not define',
    (d) => edit(P.cells(d), (j) => { cellNamed(j, '15').floor_relation.relation = 'is_basically'; })],
  ['R37-RELATION-VOCAB', 'a relation is asserted with no reason behind it',
    (d) => edit(P.cells(d), (j) => { delete cellNamed(j, '15').floor_relation.why; })],
  ['R38-DANGLING-RELATION', 'a cell points at an obligation that does not exist',
    (d) => edit(P.cells(d), (j) => { cellNamed(j, '33').floor_relation.parent = ['S7']; })],
  ['R38-DANGLING-RELATION', 'a relation with no parent at all',
    (d) => edit(P.cells(d), (j) => { cellNamed(j, '33').floor_relation.parent = []; })],
  ['R33-STATE-GRANTS-AUTHORITY', 'the page tells the reader a position grants authority',
    (d) => edit(P.copy(d), (j) => { j.subtitle += ' It records what authority that position grants.'; })],
  ['R33-STATE-GRANTS-AUTHORITY', 'a cell tells the reader persistence grants authority',
    (d) => edit(P.cells(d), (j) => { cellNamed(j, '02').extra += ' In practice persistence grants authority to promote.'; })],
  ['R43-BOUNDARY-READING', 'S2 reverts to the reading that lets a revoked grant be spent',
    (d) => edit(P.floor(d), (j) => { obl(j, 'S2').obligation = 'No transition obtains authority not justified by an admitted policy, evidence or grant chain. Observation, reachability, restart, transport, model output, reconstruction and position mint nothing.'; })],
  ['R43-BOUNDARY-READING', 'S4 reverts to the reading that lets a stale artifact be published',
    (d) => edit(P.floor(d), (j) => { obl(j, 'S4').obligation = 'Every shared identity, receipt or projection is ADEQUATE for the future behaviour it promises to distinguish, AND quotiented over declared-irrelevant representation differences (EQUIVARIANCE).'; })],
  ['R43-BOUNDARY-READING', 'S2 keeps the boundary but drops the note saying what it rules out',
    (d) => edit(P.floor(d), (j) => { delete obl(j, 'S2').boundary_note; })],
  ['R43-BOUNDARY-READING', 'S4 keeps the boundary but drops the mechanisms that preserve adequacy',
    (d) => edit(P.floor(d), (j) => { obl(j, 'S4').boundary_note = 'It has to be right at the end.'; })],
  ['R41-DIMENSION-MINTED', 'the cross-cutting dimension is promoted to a sixth obligation',
    (d) => edit(P.floor(d), (j) => { const x = j.observed_not_minted; j.obligations.push({ id: x.id, name: x.name, obligation: x.statement, evidence: 'the six findings', evidence_class: 'tested', scope_profile: 'everywhere', open: [] }); })],
  ['R41-DIMENSION-MINTED', 'a cell is given the dimension as a parent',
    (d) => edit(P.cells(d), (j) => { cellNamed(j, '35').floor_relation.parent = ['X1']; })],
  ['R41-DIMENSION-MINTED', 'the dimension loses its explicit non-promotion disposition',
    (d) => edit(P.floor(d), (j) => { j.observed_not_minted.disposition = 'Recorded for the next round.'; })],
  ['R42-DIMENSION-UNREDUCED', 'the dimension is recorded as reduced with no experiment behind it',
    (d) => edit(P.floor(d), (j) => { delete j.observed_not_minted.reduction_experiment.finding; })],
  ['R42-DIMENSION-UNREDUCED', 'the reduction experiment is named but is not on disk',
    (d) => edit(P.floor(d), (j) => { j.observed_not_minted.reduction_experiment.witness = 'invariant-r10/experiments/x1_use_time_validity/does_not_exist.py'; })],
  ['R40-EXPECTED-EMPTY', 'a cell is attached to an EXPECTED-EMPTY obligation on a `why` that only observes',
    (d) => edit(P.cells(d), (j) => { cellNamed(j, '07').floor_relation = { relation: 'specializes', parent: ['S1'], why: 'The conflict predicate reports when incompatible claims overlap in one frame.' }; })],
  ['R40-EXPECTED-EMPTY', 'an EXPECTED-EMPTY ruling stops naming the cells it examined',
    (d) => edit(P.floor(d), (j) => { delete obl(j, 'S1').expected_empty.nearby_cells_examined; })],
  ['R40-EXPECTED-EMPTY', 'an EXPECTED-EMPTY ruling drops the rule for attaching to it later',
    (d) => edit(P.floor(d), (j) => { delete obl(j, 'S1').expected_empty.attachment_rule; })],
  ['R39-FLOOR-NOT-RENDERED', 'the floor is in the data and never reaches the page',
    (d) => { const t = join(d, 'opensentience.org/_invariants/build/templates.mjs'); const src = readFileSync(t, 'utf8');
      const marker = 'export function floorBand(';
      const i = src.indexOf(marker);
      writeFileSync(t, src.slice(0, i) + marker + '{ floor, obligations, axes, resolved, observed, related }) { return \'\'; }\n\nfunction floorBandUnused(' + src.slice(i + marker.length)); }],
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
  ['an obligation with an empty open list is legal', (d) => edit(P.floor(d), (j) => { obl(j, 'S3').open = []; })],
  ['an obligation with no cell relating to it is legal — S1 already has none', (d) => edit(P.cells(d), (j) => { for (const c of j.cells) delete c.floor_relation; })],
  ['a cell may specialize two obligations at once', (d) => edit(P.cells(d), (j) => { cellNamed(j, '33').floor_relation.parent = ['S5', 'S2']; })],
  ['a cell may be recorded ADJACENT to an obligation without deriving from it', (d) => edit(P.cells(d), (j) => { cellNamed(j, '15').floor_relation.relation = 'adjacent'; })],
  ['a cell may relate to a separate axis rather than to an obligation', (d) => edit(P.cells(d), (j) => { cellNamed(j, '15').floor_relation.parent = ['L1']; })],
  ['the factory rule may say PROVED because its domain is declared and finite', (d) => edit(P.floor(d), (j) => { j.separate_axes[2].status = 'PROVED / exhaustive-in-declared-domain'; })],
  ['cell prose may reference a derived fact through its placeholder', (d) => edit(P.cells(d), (j) => { cellNamed(j, '30').extra += ' One of {{CELL_COUNT}} cells.'; })],
  ['cell prose may name ANOTHER subject\'s version', (d) => edit(P.cells(d), (j) => { cellNamed(j, '30').extra += ' Tested against PULSE v0.1 and Graphonomous v0.4.'; })],
  ['a cell MAY attach to an EXPECTED-EMPTY obligation when its why states what it constrains',
    (d) => edit(P.cells(d), (j) => { cellNamed(j, '07').floor_relation = { relation: 'specializes', parent: ['S1'], why: 'Refuses the second of two conflicting claims at admission, so exactly one becomes current in the frame.' }; })],
  ['an obligation with no boundary_note is legal where the boundary is not load-bearing',
    (d) => edit(P.floor(d), (j) => { delete obl(j, 'S1').boundary_note; delete obl(j, 'S3').boundary_note; })],
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
