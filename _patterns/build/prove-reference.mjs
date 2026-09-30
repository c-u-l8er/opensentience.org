/* ── prove the reference refusals actually refuse ────────────────────────────────────────────────────
   Every R-REF-* gate is broken on purpose here, and each must fail WITH ITS OWN MESSAGE. A table of
   refusals that all fire for one unrelated reason proves nothing (SHELL.md r12), and a refusal nobody
   has watched fire is not a gate at all.

   This is not hypothetical carefulness. When these five were first written, FOUR OF THEM COULD NEVER
   FIRE: `refuse()` only pushes onto an array, both of the build's existing exit checks run long before
   the reference block, so every R-REF-* refusal was collected and then silently dropped. And the fifth,
   R-REF-1, could not fire either — the reference page prints every term by construction, so glossing it
   made the glossary count as its own reader. Both were found by running this, not by reading the code.

       node _patterns/build/prove-reference.mjs

   It edits reference.json and moves one file in a sibling repo, then puts both back — including on a
   crash, via the finally block. It does not sandbox: the build writes to patterns/, so the last thing
   it does is rebuild the tree clean.                                                                   */
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../../..');
const REF_JSON = join(HERE, '../data/reference.json');
const original = readFileSync(REF_JSON, 'utf8');
const edit = (fn) => { const d = JSON.parse(original); fn(d); writeFileSync(REF_JSON, JSON.stringify(d, null, 1) + '\n'); };
const restore = () => writeFileSync(REF_JSON, original);

function build() {
  try { execFileSync('node', [join(HERE, 'build.mjs')], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }); return ''; }
  catch (e) { return `${e.stdout || ''}${e.stderr || ''}`; }
}

/* a probe names the code it must provoke; matching the CODE and not the exit status is the whole point */
const PROBES = [
  { code: 'R-REF-1-UNUSED', what: 'a definition no page uses',
    break: () => edit((d) => { d.terms.NEVERUSEDXYZ = { is: 'a term the book never says', source: 'AGENCY.md' }; }), fix: restore },
  { code: 'R-REF-2-SOURCE', what: 'a definition citing a path that is gone',
    break: () => edit((d) => { d.terms.WRL.source = 'WRL/NO_SUCH_FILE.md'; }), fix: restore },
  { code: 'R-REF-3-DOUBLE-DEFINED', what: 'authoring a label the build already derives',
    break: () => edit((d) => { d.terms.WITNESSED = { is: 'a second statement of a derived rule', source: 'AGENCY.md' }; }), fix: restore },
  { code: 'R-REF-5-REPO', what: 'a cited repository nothing describes',
    break: () => edit((d) => { delete d.repos.WRL; }), fix: restore },
  { code: 'R-REF-6-EXPANSION', what: 'an unrecorded expansion standing as a fact',
    /* AGENCY.md exists, so this is not a broken citation — it is a citation that does not say what it
       is cited for, which is the harder failure to see and the one this gate is actually for */
    break: () => edit((d) => { d.terms.TRVM.source = 'AGENCY.md'; }), fix: restore },
  { code: 'R-REF-6-EXPANSION', what: 'a recorded expansion hedged as a recollection',
    break: () => edit((d) => { d.terms.TRVM.expands_standing = 'recalled, not recorded'; }), fix: restore },
  { code: 'R-REF-4-CITATION', what: 'a path in the prose that has rotted',
    /* the only one that cannot be provoked from reference.json: the citation lives in the text, so the
       thing that has to go missing is the file itself */
    break: () => renameSync(join(ROOT, 'WRL/learn.html'), join(ROOT, 'WRL/learn.html.probe')),
    fix: () => { if (existsSync(join(ROOT, 'WRL/learn.html.probe'))) renameSync(join(ROOT, 'WRL/learn.html.probe'), join(ROOT, 'WRL/learn.html')); } },
];

let failed = 0;
try {
  const clean = build();
  if (clean) { console.error('✗ the tree does not build before any probe runs:\n' + clean.split('\n').slice(-6).join('\n')); process.exit(1); }
  console.log(`proving ${PROBES.length} reference refusal(s) — each must fire, and with its own message\n`);
  for (const p of PROBES) {
    p.break();
    const out = build();
    p.fix();
    const fired = out.includes(p.code);
    const others = PROBES.filter((q) => q !== p && q.code !== p.code && out.includes(q.code)).map((q) => q.code);
    const ok = fired && !others.length;
    if (!ok) failed++;
    console.log(`  ${ok ? '✓' : '✗'} ${p.code.padEnd(24)} ${p.what}`);
    if (!fired) console.log(`      DID NOT FIRE — the build ${out ? 'failed for another reason' : 'went GREEN with the break in place'}${out ? ':\n      ' + out.split('\n').filter(Boolean).slice(-2).join('\n      ') : ''}`);
    else if (others.length) console.log(`      fired, but so did ${others.join(', ')} — this probe does not isolate its gate`);
  }
} finally {
  restore();
  for (const p of PROBES) { try { p.fix(); } catch { /* already put back */ } }
  const out = build();
  console.log(out ? '\n✗ the tree does NOT build clean after restoring — look at it before trusting anything above' : '\n✓ tree restored and building clean');
  if (out) failed++;
}
process.exit(failed ? 1 : 0);
