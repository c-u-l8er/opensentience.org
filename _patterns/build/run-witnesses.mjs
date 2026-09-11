#!/usr/bin/env node
/**
 * run-witnesses.mjs — EXECUTION IDENTITY for the patterns registry.
 *
 *   node opensentience.org/_patterns/build/run-witnesses.mjs            run every runnable witness
 *   node opensentience.org/_patterns/build/run-witnesses.mjs <id>...    run only these pattern ids
 *
 * A check EXISTING at a commit and a check having been RUN are two facts (UNBOXED_PATTERNS.md §1.2 —
 * the 890-vs-924 episode is their difference). This script produces the second fact as a receipt in
 * _patterns/receipts/<witness-key>.json: when, on what host, which bytes (sha256 of the witness file
 * and its repo HEAD), the exit code, and the tail of the output. build.mjs then counts a pattern as
 * WITNESSED only if a receipt exists for the SAME bytes it sees on disk and the exit code was 0.
 *
 * Only shapes `suite`, `side-effect` and `lint` are run here. `receipt`, `card` and `spec` shaped
 * witnesses are documents; their execution record is the document itself (or absent).
 *
 * Nothing under _invariants/ is touched. TMPDIR is pointed under ~/.cache because /tmp on this
 * machine is a full tmpfs and a run there loses its output.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { hostname } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');                 // ProjectAmp2
const DATA = JSON.parse(readFileSync(join(HERE, '../data/patterns.json'), 'utf8'));
const OUT = join(HERE, '../receipts');
mkdirSync(OUT, { recursive: true });

const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const head = (cwd) => { try { return execSync('git rev-parse HEAD', { cwd, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return null; } };
const only = new Set(process.argv.slice(2));
const RUNNABLE = new Set(['suite', 'side-effect', 'lint']);

// one receipt per distinct (path, cmd) — several patterns may share a witness
const seen = new Map();
for (const p of DATA.patterns) {
  const w = p.witness;
  if (!w || !RUNNABLE.has(w.shape)) continue;
  if (only.size && !only.has(p.id)) continue;
  const key = `${w.path}::${w.cmd}`;
  if (seen.has(key)) { seen.get(key).push(p.id); continue; }
  seen.set(key, [p.id]);
}

const env = { ...process.env, TMPDIR: join(process.env.HOME, '.cache/tmp'), SCRATCH: join(process.env.HOME, '.cache/tmp') };
mkdirSync(env.TMPDIR, { recursive: true });
let failures = 0;
for (const [key, ids] of seen) {
  const [path, cmd] = key.split('::');
  const w = DATA.patterns.find((p) => p.id === ids[0]).witness;
  const abs = join(ROOT, path);
  if (!existsSync(abs)) { console.error(`✗ ${ids.join(',')}: witness file missing: ${path}`); failures++; continue; }
  const cwd = join(ROOT, w.cwd || '.');
  const started = new Date().toISOString();
  process.stdout.write(`▸ ${cmd}  (${w.cwd})  for ${ids.join(', ')} … `);
  const r = spawnSync('bash', ['-lc', cmd], { cwd, env, encoding: 'utf8', timeout: 300_000, maxBuffer: 64 * 1024 * 1024 });
  const out = (r.stdout || '') + (r.stderr || '');
  const tail = out.trim().split('\n').slice(-6);
  const receipt = {
    kind: 'PATTERN_WITNESS_RECEIPT', version: 1,
    witness: { path, cmd, cwd: w.cwd || '.', shape: w.shape, repo: w.repo },
    source_identity: { sha256: sha(abs), repo_head: head(join(ROOT, w.repo || '.')) },
    execution_identity: { started, finished: new Date().toISOString(), host: hostname(), exit: r.status, signal: r.signal || null, timed_out: !!r.error && /ETIMEDOUT/.test(String(r.error)) },
    for_patterns: ids,
    output_tail: tail,
  };
  const file = join(OUT, path.replace(/[\/]/g, '__') + '.json');
  writeFileSync(file, JSON.stringify(receipt, null, 2) + '\n');
  console.log(r.status === 0 ? `exit 0 → ${file.split('/').pop()}` : `EXIT ${r.status} → receipt written, counts as NOT executed`);
  if (r.status !== 0) failures++;
}
console.log(`\n${seen.size} witness(es) run, ${failures} non-zero.`);
process.exit(failures ? 1 : 0);
