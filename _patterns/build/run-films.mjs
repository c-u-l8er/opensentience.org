#!/usr/bin/env node
/**
 * run-films.mjs — EXECUTION IDENTITY for the scenes' WRL worlds (P10 stage B).
 *
 *   node opensentience.org/_patterns/build/run-films.mjs            reduce every declared world
 *   node opensentience.org/_patterns/build/run-films.mjs <id>...    only these pattern ids
 *
 * Calls TRVM's forge through film.py (the production fold, reference reducer) for each record whose
 * `wrl.film` is declared, deduplicated by the SOURCE BYTES of the world (five records share the starter
 * world; it is reduced once). Writes _patterns/films/<sha16>.json carrying source identity (world sha256,
 * TRVM HEAD, film.py sha256) and the forge's output. build.mjs then replays a film only when the receipt is
 * for the exact world bytes on disk AND the forge's SemanticArtifactID equals the one wrl.js sealed —
 * two implementations, one id, or no film.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { hostname } from 'node:os';
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const DATA = JSON.parse(readFileSync(join(HERE, '../data/patterns.json'), 'utf8'));
const OUT = join(HERE, '../films'); mkdirSync(OUT, { recursive: true });
const sha = (b) => createHash('sha256').update(b).digest('hex');
const head = (cwd) => { try { return execSync('git rev-parse HEAD', { cwd, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return null; } };
const PARITY = process.argv.includes('--parity');
const only = new Set(process.argv.slice(2).filter((a) => a !== '--parity'));
const REDUCER = process.env.FILM_REDUCER || 'ref_reduce';
const OTHER = REDUCER === 'native_reduce' ? 'ref_reduce' : 'native_reduce';
const FILM_PY = join(HERE, 'film.py');
const jobs = new Map();
for (const p of DATA.patterns) {
  const w = p.wrl; if (!w || !w.world || !w.film) continue;
  if (only.size && !only.has(p.id)) continue;
  const src = readFileSync(join(HERE, '../wrl', w.world));
  const key = sha(src);
  if (!jobs.has(key)) jobs.set(key, { files: [], ids: [], epochs: w.film.epochs || 4, file: w.world });
  jobs.get(key).files.push(w.world); jobs.get(key).ids.push(p.id);
}
/* the chain: every chapter's delta world (with its scenario sidecar), plus the conclusion world */
const CH = await import(join(HERE, 'chain.mjs'));
for (const id of CH.order()) {
  if (!CH.fragment(id)) continue;
  if (only.size && !only.has(id) && !only.has('chain')) continue;
  const file = `chain/${id}.wrl`; const src = Buffer.from(CH.deltaSource(id)); const key = sha(src);
  const epochs = CH.epochsOf(id);
  if (!jobs.has(key)) jobs.set(key, { files: [], ids: [], epochs, file, chain: true });
  jobs.get(key).files.push(file); jobs.get(key).ids.push(id + ' (chain delta)');
}
if (!only.size || only.has('conclusion')) { const file = 'chain/_conclusion.wrl'; const src = readFileSync(join(HERE, '../wrl', file)); const key = sha(src); /* the board's epochs come from the board: longest signal path (columns) + the slowest clock's first firing + settle */
  const W = await import(join(ROOT, 'WRL/wrl.js')); const sealedBoard = await W.sealWorld(src.toString());
  const names = sealedBoard.ok ? sealedBoard.graph.nodes.map((n) => n[1]) : []; const depth = Object.fromEntries(names.map((n) => [n, 0]));
  for (let k = 0; k < names.length; k++) for (const [, a, b] of (sealedBoard.ok ? sealedBoard.graph.edges : [])) depth[b] = Math.max(depth[b], depth[a] + 1);
  const longest = Math.max(0, ...Object.values(depth));
  const clocks = (src.toString().match(/\(every (\d+)(?:, phase (\d+))?\)|\(once at (\d+)\)/g) || []).map((c) => { const m = c.match(/every (\d+)(?:, phase (\d+))?/); const o = c.match(/once at (\d+)/); return m ? +m[1] + (+(m[2] || 0)) : o ? +o[1] : 1; });
  const epochs = longest + Math.max(1, ...clocks) + 4;
  console.log(`board: longest signal path ${longest}, slowest clock ${Math.max(1, ...clocks)} → ${epochs} epochs`); jobs.set(key, { files: [file], ids: ['conclusion (the whole chain)'], epochs, file, chain: true }); }
const env = { ...process.env, PYTHONDONTWRITEBYTECODE: '1', TMPDIR: join(process.env.HOME, '.cache/tmp') };
let fail = 0;
for (const [key, j] of jobs) {
  process.stdout.write(`▸ ${j.file} (${j.epochs} epochs) for ${j.ids.join(', ')} … `);
  const started = new Date().toISOString();
  let target = join(HERE, '../wrl', j.file);
  if (j.chain && !j.file.endsWith('_conclusion.wrl')) { const id = j.file.replace(/^chain\//, '').replace(/\.wrl$/, ''); const stage = join(HERE, '../wrl/chain/.delta'); mkdirSync(stage, { recursive: true }); target = join(stage, id + '.wrl'); writeFileSync(target, CH.deltaSource(id)); const sc = CH.scenario(id); if (sc) writeFileSync(join(stage, id + '.scenario.json'), JSON.stringify(sc)); const fm = CH.filmMeta(id); writeFileSync(join(stage, id + '.film.json'), JSON.stringify(fm)); }
  const r = spawnSync('python3', [FILM_PY, target, String(j.epochs)], { env: { ...env, FILM_REDUCER: REDUCER }, encoding: 'utf8', timeout: 10_800_000, maxBuffer: 64 << 20 });
  if (r.status !== 0) { console.log(`EXIT ${r.status}\n${(r.stderr || '').trim().split('\n').slice(-3).join('\n')}`); fail++; continue; }
  const out = JSON.parse(r.stdout);
  let parity = null;
  if (PARITY) {
    /* the OTHER reducer, from a fresh state, on the same bytes: the forge's batteries assert ic_ref == ic32; here the book
       re-derives that for this world and the build refuses a disagreement (P19). */
    const r2 = spawnSync('python3', [FILM_PY, target, String(j.epochs)], { env: { ...env, FILM_REDUCER: OTHER }, encoding: 'utf8', timeout: 10_800_000, maxBuffer: 64 << 20 });
    if (r2.status === 0) { const o2 = JSON.parse(r2.stdout); parity = { other_reducer: OTHER, seconds: o2.seconds, identical: o2.epochs.map((e) => e.film_hash).join() === out.epochs.map((e) => e.film_hash).join(), semantic_artifact_id: o2.semantic_artifact_id }; }
    else parity = { other_reducer: OTHER, failed: true, tail: (r2.stderr || '').trim().split('\n').slice(-2) };
  }
  const receipt = { kind: 'PATTERN_FILM_RECEIPT', version: 1, world_files: j.files, for_patterns: j.ids,
    source_identity: { world_sha256: key, trvm_head: head(join(ROOT, 'TRVM')), film_py_sha256: sha(readFileSync(FILM_PY)) },
    execution_identity: { started, finished: new Date().toISOString(), host: hostname(), seconds: out.seconds, reducer: out.reducer },
    forge: { semantic_artifact_id: out.semantic_artifact_id, policy_id: out.policy_id }, scenario: out.scenario || null, determinism: out.determinism || null, parity, epochs: out.epochs };
  writeFileSync(join(OUT, key.slice(0, 16) + '.json'), JSON.stringify(receipt, null, 1) + '\n');
  console.log(`${out.seconds}s (${REDUCER}) → ${out.semantic_artifact_id.slice(0, 20)}… · ${out.epochs.length} epochs${parity ? (parity.failed ? ' · parity run FAILED' : ` · ${parity.other_reducer} ${parity.identical ? 'agrees' : 'DISAGREES'} (${parity.seconds}s)`) : ''}`);
}
console.log(`\n${jobs.size} world(s) reduced, ${fail} failed.`); process.exit(fail ? 1 : 0);
