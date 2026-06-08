#!/usr/bin/env node
// lift.mjs — the CC1 → CC2 lifter. Lifts a single-agent [&] `ampersand.json` (CC1) into a
// CC2 *singleton coalition*: agents = [self], empty adversary, hard constraints entrenched as
// the floor, and the named pipeline lifted to the cross-agent `compose`. CC1 is exactly the
// special case of CC2 where the coalition is a singleton and the adversary is empty (CC2 RFC §6),
// so the lift PRESERVES meaning and only ADDS the coalition framing. Structural and deterministic;
// no LLM, no network. Governance→verdict translation is the separate job of `box-and-box compile`.
//
//   box-and-box lift agent.json          # → a schema-valid coalition.json on stdout
//   cat agent.json | box-and-box lift    # reads stdin
//   box-and-box lift agent.json | box-and-box compile -   # (no: compile reads the CC1 doc, not the coalition)
//
// Exit codes: 0 lifted · 2 usage / parse error
//
// What lifts STRUCTURALLY (CC1 field → CC2 coalition field):
//   agent                     → coalition name + the sole member (agents: [self])
//   version                   → version
//   capabilities[*].need      → ensure (author-declared needs joined; else a flagged placeholder)
//   governance.hard           → floor (a hard constraint is un-weakenable by definition ⇒ entrenched)
//   pipelines.<first>.steps   → compose (op1 |> op2 |> ...), the lifted |>
//   provenance                → provenance
// What does NOT lift here (it is `compile`'s job): escalate_when / soft / autonomy → a verdict policy.
import { readFileSync } from 'node:fs';

const SCHEMA = 'https://protocol.ampersandboxdesign.com/schema/v0.1.0/coalition.schema.json';
function fail(code, msg) { process.stderr.write('box-and-box lift: ' + msg + '\n'); process.exit(code); }

// render a CC1 pipeline definition into the lifted `compose` string: op1 |> op2 |> op3
function renderPipeline(def) {
  if (!def || !Array.isArray(def.steps)) return null;
  const ops = def.steps.map((s) => s.operation).filter(Boolean);
  return ops.length ? ops.join(' |> ') : null;
}

const args = process.argv.slice(2);
const fileArg = args.find((a) => !a.startsWith('-'));
let raw;
try { raw = fileArg ? readFileSync(fileArg, 'utf8') : readFileSync(0, 'utf8'); }
catch (e) { fail(2, `cannot read input (${fileArg || 'stdin'}): ${e.message}`); }
if (!raw || !raw.trim()) fail(2, 'empty input — provide an ampersand.json as a file arg or on stdin');

let agent;
try { agent = JSON.parse(raw); } catch (e) { fail(2, `invalid JSON: ${e.message}`); }
if (!agent.agent) fail(2, 'not a CC1 ampersand.json: missing "agent"');

const notes = [];
const gov = agent.governance || {};

// ensure: prefer author-declared capability needs (faithful), else a flagged placeholder
const needs = Object.values(agent.capabilities || {}).map((b) => b && b.need).filter(Boolean);
let ensure;
if (needs.length) ensure = needs.join(' AND ');
else { ensure = `${agent.agent} goal`; notes.push('ensure: synthesized placeholder — CC1 declares no goal; refine the coalition `ensure` for a real strategic guarantee (⟨⟨agents⟩⟩◊)'); }

// floor: CC1 hard constraints are un-weakenable by definition ⇒ entrench them as the coalition floor
const floor = Array.isArray(gov.hard) ? gov.hard.slice() : [];

// compose: lift the first named pipeline; note any others
const pipes = agent.pipelines && typeof agent.pipelines === 'object' ? Object.entries(agent.pipelines) : [];
let compose = null;
if (pipes.length) {
  const [name, def] = pipes[0];
  compose = renderPipeline(def);
  if (!compose) notes.push(`compose: pipeline "${name}" had no renderable steps — omitted`);
  if (pipes.length > 1) notes.push(`compose: lifted only the first pipeline "${name}"; ${pipes.length - 1} other(s) not represented in the singleton compose`);
}

const coalition = {
  $schema: SCHEMA,
  coalition: agent.agent,
  version: agent.version || '0.1.0',
  agents: [agent.agent],
  ensure,
  adversary: []
};
if (floor.length) coalition.floor = floor;
if (compose) coalition.compose = compose;
if (agent.provenance != null) coalition.provenance = !!agent.provenance;

process.stdout.write(JSON.stringify(coalition, null, 2) + '\n');

// surface what the structural lift cannot carry — governance semantics are compile's domain
const carried = [];
if (gov.escalate_when) carried.push('escalate_when');
if (gov.soft) carried.push('soft');
if (gov.autonomy) carried.push('autonomy');
if (carried.length) notes.push(`governance (${carried.join(', ')}) is not coalition STRUCTURE — run \`box-and-box compile ${fileArg || 'agent.json'}\` to translate it into a verdict policy`);
for (const n of notes) process.stderr.write('  · ' + n + '\n');
