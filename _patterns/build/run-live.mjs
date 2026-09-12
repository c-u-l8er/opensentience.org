#!/usr/bin/env node
/**
 * run-live.mjs — run each STAGED witness from the DEPLOYED site and record what happened.
 *
 *   node opensentience.org/_patterns/build/run-live.mjs [--origin https://opensentience.org] [id ...]
 *
 * `run-witnesses.mjs` records that a check passed on THIS MACHINE from the command line: that is the
 * `in_tree` rung. It says nothing about whether the same bytes run for a reader who opens the page,
 * which is what `live_deployed` claims. Nothing measured that until now — the rung was authored by
 * hand, and `build.mjs` found two records whose authored rung understated what the site already did.
 *
 * The receipt binds to the STAMP the page itself prints (the first 16 hex of the staged file's
 * sha256), so a receipt cannot outlive the bytes it describes: restage the witness and the stamp
 * moves, and build.mjs stops counting the live run (P26).
 *
 * Evidence is a FRESH PAGE LOAD. Two instances of a staged suite over one cached module throw
 * `createAttestationAuthority … minted once`, so this never probes a page before running it and
 * never runs two witnesses in one document.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(HERE, '../..');
const OUT = join(HERE, '../receipts/live');
const argv = process.argv.slice(2);
const oi = argv.indexOf('--origin');
const ORIGIN = oi >= 0 ? argv[oi + 1] : 'https://opensentience.org';
// guard oi >= 0: with no --origin, oi is -1 and `oi + 1` is 0, which silently drops the first id
const only = argv.filter((a, i) => !a.startsWith('--') && !(oi >= 0 && i === oi + 1));

const DATA = JSON.parse(readFileSync(join(HERE, '../data/patterns.json'), 'utf8'));
const ab = (...a) => execFileSync('agent-browser', a, { encoding: 'utf8', maxBuffer: 1 << 26 }).trim();
const evalJs = (js) => { const out = ab('eval', js); try { return JSON.parse(out.split('\n').pop()); } catch { return out; } };
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// The page prints its result as text; these are the shapes witness/run.js emits.
const DONE = /(\d+)\s+laws?\s+·\s+(\d+)\s+passing\s+·\s+(\d+)\s+failing|failed|error/i;

const targets = DATA.patterns.filter((p) => p.witness && p.witness.staged && (!only.length || only.includes(p.id)));
if (!targets.length) { console.error('no staged witnesses selected'); process.exit(1); }
mkdirSync(OUT, { recursive: true });

let wrote = 0, failed = 0;
for (const p of targets) {
  const url = `${ORIGIN}/patterns/${p.id}`;
  process.stdout.write(`· ${p.id} … `);
  const started = new Date().toISOString();
  try {
    ab('open', url);                                       // fresh document, every time
    // read the stamp the PAGE declares, not one we computed — that is the point of the binding
    const stamp = evalJs(`(()=>{const m=document.body.innerText.match(/stamp\\s+([0-9a-f]{16})/); return m?m[1]:null;})()`);
    if (!stamp) throw new Error('page declares no staged stamp');
    const clicked = evalJs(`(()=>{const b=document.getElementById('run'); if(!b) return null; b.click(); return Date.now();})()`);
    if (!clicked) throw new Error('page has no #run button');
    let status = '', waited = 0;
    while (waited < 180000) {
      sleep(4000); waited += 4000;
      status = String(evalJs(`(()=>{const s=document.getElementById('wstatus'); return (s&&s.textContent||'').trim();})()`) || '');
      if (DONE.test(status)) break;
    }
    if (!DONE.test(status)) throw new Error(`no result after ${waited / 1000}s (last status: ${JSON.stringify(status)})`);
    const tail = String(evalJs(`(()=>{const k=document.getElementById('wsink'); return (k&&k.textContent||'').trim().split('\\n').slice(-6).join('\\n');})()`) || '');
    const m = status.match(/(\d+)\s+laws?\s+·\s+(\d+)\s+passing\s+·\s+(\d+)\s+failing/);
    const receipt = {
      kind: 'PATTERN_LIVE_RUN_RECEIPT', version: 1,
      for_pattern: p.id,
      witness: { path: p.witness.path, staged_path: p.witness.staged_path, shape: p.witness.shape },
      source_identity: { stamp },                          // the bytes the PAGE served, by its own account
      execution_identity: {
        origin: ORIGIN, url, started, finished: new Date().toISOString(),
        agent: String(evalJs('navigator.userAgent') || '').slice(0, 120),
        status, passing: m ? +m[2] : null, failing: m ? +m[3] : null, total: m ? +m[1] : null,
      },
      output_tail: tail ? tail.split('\n') : [],
    };
    if (m && +m[3] !== 0) throw new Error(`${m[3]} failing — not recorded as a live run`);
    writeFileSync(join(OUT, `${p.id}.json`), JSON.stringify(receipt, null, 2) + '\n');
    console.log(`${status}  → stamp ${stamp}`);
    wrote++;
  } catch (e) {
    console.log(`REFUSED — ${e.message}`);
    failed++;
  }
}
console.log(`\n${wrote} live receipt(s) written to ${OUT.replace(SITE + '/', '')}${failed ? `, ${failed} refused` : ''}`);
process.exit(failed ? 1 : 0);
