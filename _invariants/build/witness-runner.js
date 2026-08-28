/**
 * witness-runner.js — run a real witness module in the browser.
 *
 * Staged verbatim to /witness/run.js by build.mjs.
 *
 * THIS RUNS THE WITNESS, NOT A PORT OF IT. The modules under /witness/src/ are
 * byte-identical copies of the files `node scripts/…` executes, staged with
 * their whole relative-import closure so the imports resolve unchanged, and
 * hashed into the build artifact so `--verify` refuses a staged copy that has
 * drifted from source. The distinction matters: `kappa_proof.js` on this site is
 * a re-implementation described as "the same routine ported to run in your
 * browser", and nothing checks that the two agree.
 *
 * Two shapes, because the witnesses genuinely have two:
 *
 *   side-effect  scripts/check-*.mjs run their checks at module scope and call
 *                process.exit at the end. Shim `process`, capture console, then
 *                import(). The exit code is the verdict.
 *   suite        test/laws.mjs and test/compose-laws.mjs guard
 *                `typeof window === 'undefined'`, so they import cleanly and
 *                deliberately do not self-run. Drive their exported runSet over
 *                their exported SUITES — the same call playground.html makes.
 */

/* A faithful-enough `process`. Every witness here calls exit only as its last
   statement, so recording the code rather than terminating changes nothing
   about what ran. argv/env exist because a bare `process.argv` at module scope
   is a ReferenceError that takes the whole page down — the comment in
   test/laws.mjs records that exact failure. */
function installProcess(argv) {
  let code = null;
  const prev = globalThis.process;
  globalThis.process = {
    argv: ['node', 'witness', ...argv],
    env: {},
    platform: 'browser',
    exit(c) { code = c | 0; },
    stdout: { write: (s) => emit(String(s).replace(/\n$/, '')) },
  };
  return { restore() { globalThis.process = prev; }, exitCode: () => code };
}

let SINK = null;
function emit(line, cls) {
  if (!SINK) return;
  const d = document.createElement('div');
  d.className = 'wline' + (cls ? ' ' + cls : '');
  d.textContent = line;
  SINK.appendChild(d);
}

function captureConsole() {
  const saved = {};
  for (const k of ['log', 'info', 'warn', 'error']) {
    saved[k] = console[k];
    console[k] = (...a) => {
      const line = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ');
      /* The gates print with ✓/✗/! and ANSI colour. Keep the glyphs, drop the
         escapes — a terminal escape rendered as text is noise a reader has to
         parse around. */
      for (const l of line.replace(/\[[0-9;]*m/g, '').split('\n')) {
        emit(l, /✗|FAIL|REFUSED/.test(l) ? 'bad' : /✓|PASS/.test(l) ? 'good' : /^\s*!|FALSIFIED/.test(l) ? 'warn' : '');
      }
      saved[k](...a);
    };
  }
  return () => { for (const k of Object.keys(saved)) console[k] = saved[k]; };
}

export async function runWitness({ spec, sink, status, button }) {
  SINK = sink;
  sink.innerHTML = '';
  button.disabled = true;
  status.textContent = 'running…';
  status.className = 'wstatus running';

  const proc = installProcess(spec.argv || []);
  const restoreConsole = captureConsole();
  const t0 = performance.now();
  let verdict, ok = null;

  try {
    /* Cache-bust the ENTRY only — and say why that is not enough on its own.
       A query on the module you import does NOT bust the cache of the modules
       it imports; the box-and-box playground once reported 106 laws · 3 failing
       because a fresh entry pulled a cached sibling. The staged tree is hashed
       per build, so the honest fix is a build-stamped token on every module URL,
       which is what `spec.stamp` is. */
    const url = spec.entry + '?v=' + spec.stamp;
    const mod = await import(url);

    if (spec.mode === 'suite') {
      /* runSet returns { pass, fail, results:[{id, desc, pass, cex, at}] } — the
         same structured shape playground.html renders, so nothing here restates
         a law or its verdict. */
      const N = spec.trials || 200;
      let pass = 0, fail = 0, declaredOpen = 0;
      const group = (label, laws, openByDesign) => {
        if (!laws || !laws.length) return;
        emit('', '');
        emit(label, 'group');
        const r = mod.runSet(laws, N);
        for (const x of r.results) {
          /* The GAP laws print FALSIFIED in RED BY DESIGN — three declared-open
             carriers — and the build fails if one starts PASSING. Colouring
             them as failures would misreport the suite's own contract. */
          if (openByDesign) declaredOpen++;
          emit(
            `${x.pass ? '✓' : '✗'}  ${x.id}  ${x.desc}${x.pass ? '' : '  — ' + (x.cex ?? '')}  @${x.at}`,
            openByDesign ? 'warn' : x.pass ? 'good' : 'bad'
          );
        }
        if (!openByDesign) { pass += r.pass; fail += r.fail; }
      };
      for (const s of mod.SUITES || []) {
        if (s.semiring && mod.setSemiring) mod.setSemiring(s.semiring);
        group(s.label || s.key, s.laws, false);
      }
      group('Anchor', mod.ANCHOR, false);
      group('Declared-open gaps — FALSIFIED by design; the build fails if one PASSES', mod.GAP, true);
      ok = fail === 0;
      verdict = `${pass + fail} laws · ${pass} passing · ${fail} failing`
        + (declaredOpen ? ` · ${declaredOpen} declared-open` : '');
    } else {
      const code = proc.exitCode();
      ok = code === 0 || code === null;
      verdict = code === null ? 'ran to completion (no exit code)' : `exit ${code}`;
    }
  } catch (e) {
    ok = false;
    verdict = 'threw: ' + (e && e.message ? e.message : String(e));
    emit(String(e && e.stack ? e.stack : e), 'bad');
  } finally {
    restoreConsole();
    proc.restore();
    button.disabled = false;
  }

  const ms = (performance.now() - t0).toFixed(1);
  status.textContent = `${verdict} · ${ms} ms`;
  status.className = 'wstatus ' + (ok ? 'good' : 'bad');
  SINK = null;
  return { ok, verdict, ms };
}
