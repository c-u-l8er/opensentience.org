#!/usr/bin/env node
// govern.mjs — the real verdict CLI. Reads a decision spec (JSON, from a file arg
// or stdin), runs the full alethic ▸ deontic ▸ axiological bridge, and prints the
// certificate as JSON. Deterministic, no LLM, no network — safe in CI and pipes.
//
//   box-and-box govern decision.json
//   cat decision.json | box-and-box govern
//   box-and-box govern decision.json --quiet   # certificate JSON only, no stderr summary
//
// Exit codes (so a pipeline can gate on the verdict):
//   0  a decision was made
//   1  no admissible option (every option vetoed, nothing to choose)
//   2  usage / parse error
//   3  escalation required (obligation unmet or unresolved conflict)
//
// Input schema:
//   {
//     "semiring": "tropical",                       // optional; tropical | probability | log
//     "req":   { "beta_min": 0.9, "acyclic": true },// optional alethic requirements (see value.consume)
//     "norms": [                                     // optional deontic rules
//       { "id": "forbid-pii", "modality": "forbidden", "priority": 10,
//         "condition": { "all": [ {"field":"transmitsPII","eq":true},
//                                 {"field":"hasConsent","eq":false} ] },
//         "ctd": { "id": "escalate-to-dpo", "modality": "obligatory", "priority": 1e9 } }
//     ],
//     "options": [                                   // required: the candidate actions
//       { "id": "A", "utility": 6,
//         "value": { "beta": 0.95, "authority": ["cap:send"], "denyDefault": false },
//         "ctx":   { "redacted": true } }
//     ]
//   }
//
// `value` fields map straight onto value.V (n, kappa, beta, sigma, pi, authority,
// denyDefault, …). `condition` is a small declarative predicate language — no code
// is ever eval'd from the input:
//   true | omitted            → always in force
//   { "field": f, "eq": v }   → ctx[f] === v
//   { "field": f, "ne": v }   → ctx[f] !== v
//   { "field": f, "in": [..] }→ ctx[f] ∈ list
//   { "truthy": f }           → !!ctx[f]
//   { "all": [ .. ] }         → conjunction
//   { "any": [ .. ] }         → disjunction
//   { "not": cond }           → negation
import { readFileSync } from 'node:fs';
import { V } from '../value.mjs';
import { Norm } from '../norm.mjs';
import { govern } from '../govern.mjs';

function fail(code, msg) { process.stderr.write('box-and-box govern: ' + msg + '\n'); process.exit(code); }

// ---- declarative condition → predicate (no eval, pure data) -----------------
function compileCondition(c) {
  if (c === undefined || c === null || c === true) return () => true;
  if (c === false) return () => false;
  if (typeof c !== 'object') fail(2, `bad condition: ${JSON.stringify(c)}`);
  if (Array.isArray(c.all)) { const ps = c.all.map(compileCondition); return (ctx) => ps.every((p) => p(ctx)); }
  if (Array.isArray(c.any)) { const ps = c.any.map(compileCondition); return (ctx) => ps.some((p) => p(ctx)); }
  if ('not' in c) { const p = compileCondition(c.not); return (ctx) => !p(ctx); }
  if ('truthy' in c) { const f = c.truthy; return (ctx) => !!ctx[f]; }
  if ('field' in c) {
    const f = c.field;
    if ('eq' in c) return (ctx) => ctx[f] === c.eq;
    if ('ne' in c) return (ctx) => ctx[f] !== c.ne;
    if (Array.isArray(c.in)) return (ctx) => c.in.includes(ctx[f]);
    return (ctx) => !!ctx[f];
  }
  fail(2, `unrecognized condition: ${JSON.stringify(c)}`);
}

function buildNorm(n) {
  if (!n || typeof n !== 'object') fail(2, 'each norm must be an object');
  return Norm({
    id: n.id, modality: n.modality, priority: n.priority,
    condition: compileCondition(n.condition),
    ctd: n.ctd ? buildNorm(n.ctd) : null,
    target: n.target ?? null
  });
}

// ---- read input -------------------------------------------------------------
const args = process.argv.slice(2);
const quiet = args.includes('--quiet');
const fileArg = args.find((a) => !a.startsWith('-'));
let raw;
try { raw = fileArg ? readFileSync(fileArg, 'utf8') : readFileSync(0, 'utf8'); }
catch (e) { fail(2, `cannot read input (${fileArg || 'stdin'}): ${e.message}`); }
if (!raw || !raw.trim()) fail(2, 'empty input — provide a decision spec as a file arg or on stdin');

let spec;
try { spec = JSON.parse(raw); } catch (e) { fail(2, `invalid JSON: ${e.message}`); }
if (!Array.isArray(spec.options) || spec.options.length === 0)
  fail(2, 'spec.options must be a non-empty array');

// ---- assemble + run ---------------------------------------------------------
const options = spec.options.map((o, i) => {
  if (!o || typeof o !== 'object') fail(2, `options[${i}] must be an object`);
  return { id: o.id ?? `option-${i}`, utility: o.utility, ctx: o.ctx || {}, value: V(o.value || {}) };
});
const norms = Array.isArray(spec.norms) ? spec.norms.map(buildNorm) : [];

let cert;
try { cert = govern(options, { req: spec.req || {}, norms, semiring: spec.semiring || 'tropical' }); }
catch (e) { fail(2, `kernel error: ${e.message}`); }

// ---- emit -------------------------------------------------------------------
process.stdout.write(JSON.stringify(cert, null, 2) + '\n');

if (!quiet) {
  const s = cert.escalation
    ? `escalation required → ${cert.escalation.repair} (${cert.escalation.reason})`
    : cert.decision
      ? `decision: ${cert.decision}${cert.forcedByObligation ? ' [forced by obligation]' : ''}${cert.margin != null ? `, margin ${cert.margin}` : ''}`
      : 'no admissible option';
  process.stderr.write('verdict — ' + s + '\n');
}

process.exit(cert.escalation ? 3 : cert.decision ? 0 : 1);
