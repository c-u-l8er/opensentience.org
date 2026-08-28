#!/usr/bin/env node
// box-and-box — the kernel CLI.
//
//   box-and-box govern [file.json] [--quiet]   real verdict: JSON in → certificate out
//   box-and-box compile <agent.json>           govern bridge: [&] governance block → box-and-box policy
//   box-and-box lift <agent.json>              CC1 → CC2: a single-agent ampersand.json → a singleton coalition
//   box-and-box laws                           run the 103-law core conformance harness
//   box-and-box compose-laws                   run the 14-law compose-runtime harness (& |> floor)
//   box-and-box demo <name>                    run a bundled example
//   box-and-box --help
//
// `govern` is the deterministic verdict surface (alethic ▸ deontic ▸ axiological);
// see bin/govern.mjs for the input schema and CI exit codes. The demos are teaching
// artifacts, not the conformance surface — that is `laws`.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const DEMOS = ['rag', 'select', 'govern', 'supervise', 'evolve', 'know', 'strategy', 'economy', 'assistant', 'harness'];
const run = (rel, extra = []) => spawnSync(process.execPath, [join(root, rel), ...extra], { stdio: 'inherit' }).status ?? 0;

function usage(code) {
  process.stderr.write(`box-and-box — the governance kernel CLI

  box-and-box govern [file.json] [--quiet]   verdict: feasible ▸ permitted ▸ best → certificate JSON
                                             (reads stdin if no file; exit 0 decision, 3 escalation, 1 none)
  box-and-box compile <agent.json> [--options opts.json]
                                             govern bridge: translate a CC1 [&] governance block into a
                                             box-and-box policy; with --options, a govern-ready spec to pipe
  box-and-box lift <agent.json>              CC1 → CC2: lift a single-agent ampersand.json into a
                                             singleton coalition (agents:[self], hard ⇒ floor, pipeline ⇒ compose)
  box-and-box laws                           run the 103-law core conformance harness (2000 trials/law)
  box-and-box compose-laws                   run the 14-law compose-runtime harness (CA1–CA4, CP1–CP4, CX1–CX6)
  box-and-box demo <name>                    run a bundled example: ${DEMOS.join(' | ')}
  box-and-box --help

Source & conformance: https://opensentience.org/box-and-box/   ·   laws: ampersandboxdesign.com/laws.html
`);
  process.exit(code);
}

const [cmd, ...rest] = process.argv.slice(2);

if (!cmd || cmd === '--help' || cmd === '-h') usage(cmd ? 0 : 2);
else if (cmd === 'govern') process.exit(run('bin/govern.mjs', rest));     // real verdict
else if (cmd === 'compile') process.exit(run('bin/compile.mjs', rest));   // [&] govern bridge
else if (cmd === 'lift') process.exit(run('bin/lift.mjs', rest));         // CC1 → CC2 coalition
else if (cmd === 'laws') process.exit(run('test/laws.mjs'));
else if (cmd === 'compose-laws') process.exit(run('test/compose-laws.mjs'));
else if (cmd === 'demo') {
  const name = rest[0];
  if (!DEMOS.includes(name)) { process.stderr.write(`unknown demo '${name ?? ''}'. choose: ${DEMOS.join(' | ')}\n`); process.exit(2); }
  process.exit(run(`examples/${name}.mjs`));
}
// back-compat: bare demo names still run their example
else if (DEMOS.includes(cmd)) process.exit(run(`examples/${cmd}.mjs`));
else { process.stderr.write(`unknown command '${cmd}'.\n`); usage(2); }
