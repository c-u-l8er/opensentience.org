#!/usr/bin/env node
// compile.mjs — the govern bridge. Translates a CC1 [&] `ampersand.json`
// governance block into a box-and-box policy ({ req, norms }), so the
// composition layer's declared governance is judged by the eight-rung engine
// instead of an ad-hoc string matcher. Deterministic, no LLM, no network.
//
//   box-and-box compile agent.json                      # → policy {req, norms} + translation report
//   box-and-box compile agent.json --options opts.json  # → full govern-ready spec {semiring, req, norms, options}
//   box-and-box compile agent.json --options opts.json | box-and-box govern   # → certificate
//   cat agent.json | box-and-box compile                # reads stdin
//
// Exit codes:  0 compiled · 2 usage / parse error
//
// Translation (CC1 governance → box-and-box), faithful and explicit:
//   escalate_when.confidence_below: θ      → req.beta_min = θ            (alethic / epistemic β-gate)
//   escalate_when.cost_exceeds_usd: C      → FORBIDDEN norm, cond cost>C, CTD escalate-to-human (deontic)
//   escalate_when.<key>: θ  (numeric)      → FORBIDDEN norm, cond <key> > θ, CTD escalate-to-human
//   escalate_when.<key>: true (boolean)    → FORBIDDEN norm, cond truthy <key>, CTD escalate-to-human
//   hard: ["field op value"] (checkable)   → FORBIDDEN norm on the floor (violation ⇒ 0̲)
//   hard: ["natural language ..."]         → carried in _translation.requiresJudgment (NOT auto-evaluated)
//   soft: [...]                            → carried in _translation.requiresJudgment (needs option utilities)
//
// CC2 expansion: `escalate when C` ≡ a contrary-to-duty — acting autonomously
// under C is forbidden, and the CTD repair is escalate-to-human (a human may
// override, so the veto is recorded as overridable). `confidence_below` is the
// epistemic β-gate, so it rides the alethic feasibility floor (req.beta_min).
//
// A natural-language hard/soft rule cannot be mechanically evaluated; it is
// surfaced for human/LLM judgement, never silently dropped or fabricated.
import { readFileSync } from 'node:fs';

function fail(code, msg) { process.stderr.write('box-and-box compile: ' + msg + '\n'); process.exit(code); }

// ---- compact condition string → declarative condition (governance.ex dialect) ----
// Recognizes "field=value", "field:number", and the operators < > <= >= != on
// "field op value". Anything else is treated as natural language (returns null).
function parseCompact(raw) {
  const s = String(raw).trim();
  // operator forms, longest operators first
  for (const [op, key] of [['>=', 'gte'], ['<=', 'lte'], ['!=', 'ne'], ['>', 'gt'], ['<', 'lt'], ['=', 'eq'], [':', 'eq']]) {
    const i = s.indexOf(op);
    if (i <= 0) continue;
    const field = s.slice(0, i).trim();
    const rhs = s.slice(i + op.length).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_.]*$/.test(field)) return null; // not a field token ⇒ natural language
    return { field, [key]: coerce(rhs) };
  }
  return null;
}

function coerce(v) {
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v !== '' && !Number.isNaN(Number(v))) return Number(v);
  return v;
}

const ESCALATE = { id: 'escalate-to-human', modality: 'obligatory', priority: 1e9 };

function compileGovernance(gov) {
  const req = {};
  const norms = [];
  const requiresJudgment = [];

  // ---- escalate_when ----
  const ew = gov.escalate_when;
  if (ew && typeof ew === 'object') {
    for (const [key, val] of Object.entries(ew)) {
      if (key === 'confidence_below') {
        req.beta_min = val;                                   // alethic floor
        continue;
      }
      // escalate_when C ≡ "acting autonomously when C holds is FORBIDDEN; the
      // contrary-to-duty repair is escalate-to-human" (CC2: escalate-when → CTD).
      // The triggering option is excluded (recorded overridable) pending human sign-off.
      // boolean key → truthy gate (e.g. hard_boundary_approached: true)
      // numeric key → threshold gate; "<field>_exceeds[_usd]: C" means ctx[<field>] > C
      const m = key.match(/^(.*?)_exceeds(?:_\w+)?$/);
      const field = m ? m[1] : key;
      const cond = typeof val === 'boolean' ? { truthy: key } : { field, gt: val };
      norms.push({
        id: `escalate-${key}`, modality: 'forbidden', priority: 500,
        condition: cond, ctd: ESCALATE
      });
    }
  }

  // ---- hard ----
  for (const rule of (Array.isArray(gov.hard) ? gov.hard : [])) {
    const parsed = parseCompact(rule);
    if (parsed) norms.push({ id: `forbid:${slug(rule)}`, modality: 'forbidden', priority: 1000, condition: parsed });
    else requiresJudgment.push({ kind: 'hard', rule, reason: 'natural-language constraint — needs human/LLM judgement' });
  }

  // ---- soft ----
  for (const rule of (Array.isArray(gov.soft) ? gov.soft : [])) {
    requiresJudgment.push({ kind: 'soft', rule, reason: 'preference — apply as a score gradient over option utilities' });
  }

  return { req, norms, requiresJudgment };
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'rule';

// ---- read input ----
const args = process.argv.slice(2);
const optIdx = args.indexOf('--options');
const optValIdx = optIdx >= 0 ? optIdx + 1 : -1;
const optionsFile = optIdx >= 0 ? args[optValIdx] : null;
const fileArg = args.find((a, i) => !a.startsWith('-') && i !== optValIdx);

let raw;
try { raw = fileArg ? readFileSync(fileArg, 'utf8') : readFileSync(0, 'utf8'); }
catch (e) { fail(2, `cannot read input (${fileArg || 'stdin'}): ${e.message}`); }
if (!raw || !raw.trim()) fail(2, 'empty input — provide an ampersand.json as a file arg or on stdin');

let agent;
try { agent = JSON.parse(raw); } catch (e) { fail(2, `invalid JSON: ${e.message}`); }

const gov = agent.governance || {};
const { req, norms, requiresJudgment } = compileGovernance(gov);

// ---- emit ----
const policy = { semiring: 'tropical', req, norms, _translation: { agent: agent.agent ?? null, requiresJudgment } };

if (optionsFile) {
  let options;
  try { options = JSON.parse(readFileSync(optionsFile, 'utf8')); }
  catch (e) { fail(2, `cannot read options (${optionsFile}): ${e.message}`); }
  if (!Array.isArray(options)) fail(2, '--options file must be a JSON array of option objects');
  policy.options = options;                                  // now a complete govern-ready spec
}

process.stdout.write(JSON.stringify(policy, null, 2) + '\n');

if (requiresJudgment.length && !optionsFile) {
  process.stderr.write(`compiled ${norms.length} norm(s); ${requiresJudgment.length} rule(s) need human/LLM judgement (see _translation.requiresJudgment)\n`);
}
