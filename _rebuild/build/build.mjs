// Zero-dependency static generator.
//   node build/build.mjs   → writes dist/index.html
// The build VALIDATES the data first and throws on drift, so the site can never
// ship a malformed/incomplete protocol entry. This is the no-drift kernel ethos
// applied to the website itself.

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, renameSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Page } from "./templates.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, "..");
const site_root = resolve(root, "..");
const read = (p) => JSON.parse(readFileSync(resolve(root, p), "utf8"));
const sha = (buf) => createHash("sha256").update(buf).digest("hex");

// ---- `--verify`: prove what is on disk is what was gated ----------------
// SHELL.md r6, hole 2. This mode builds nothing. It reads dist/artifact.json —
// written at emit, from hashes taken of the bytes as they were written — and
// re-hashes every published file. It is what a deploy step runs to answer "is
// the thing about to be served the thing the gate approved?", and it is the
// only check in this file that still works when the build itself is broken.
if (process.argv.includes("--verify")) {
  const recPath = resolve(root, "dist/artifact.json");
  if (!existsSync(recPath)) {
    console.error("✗ verify failed — dist/artifact.json does not exist. Nothing has ever proved an artifact here; run the build.");
    process.exit(1);
  }
  const rec = JSON.parse(readFileSync(recPath, "utf8"));
  const bad = [];
  for (const f of rec.files) {
    const p = resolve(site_root, f.path);
    if (!existsSync(p)) { bad.push(`${f.path} — recorded at emit and MISSING from disk`); continue; }
    const got = sha(readFileSync(p));
    if (got !== f.sha256) bad.push(`${f.path} — recorded ${f.sha256.slice(0, 16)}…, on disk ${got.slice(0, 16)}…`);
  }
  if (bad.length) {
    console.error(
      `✗ verify failed — the artifact on disk is not the artifact this build gated (emitted ${rec.built_at}):\n  - ` +
        bad.join("\n  - ") +
        "\n  A build that throws leaves the previous page in place; nothing but this check can tell the two apart.",
    );
    process.exit(1);
  }
  console.log(`✓ verified ${rec.files.length} published file(s) against dist/artifact.json — artifact sha256 ${rec.artifact_sha256.slice(0, 16)}…, emitted ${rec.built_at}`);
  process.exit(0);
}

// A build that is about to run says, first, whether what is currently served is
// still the last thing that was proved. If it is not, something wrote the page
// outside this build — a hand edit, or a failed run that left the old file.
if (existsSync(resolve(root, "dist/artifact.json"))) {
  try {
    const rec = JSON.parse(readFileSync(resolve(root, "dist/artifact.json"), "utf8"));
    const cur = rec.files.find((f) => f.path === "index.html");
    if (cur && existsSync(resolve(site_root, "index.html"))) {
      const got = sha(readFileSync(resolve(site_root, "index.html")));
      if (got !== cur.sha256) console.log(`· note: the index.html on disk is NOT the one proved at ${rec.built_at} — it is being replaced.`);
    }
  } catch {
    console.log("· note: dist/artifact.json is unreadable; it is being rewritten.");
  }
}

// ---- load --------------------------------------------------------------
const site = read("data/site.json");
const surface = read("data/surface.json");
const protocols = read("data/protocols.json");
const loop = read("data/loop.json");
const receipts = read("data/receipts.json");
const rungs = read("data/rungs.json");
const references = read("data/references.json");
const retractions = read("data/retractions.json");
const publication = read("data/publication.json");
const questions = read("data/questions.json");

const css = readFileSync(resolve(root, "styles/site.css"), "utf8");
const idanim = readFileSync(resolve(root, "build/idanim.js"), "utf8");

// The identifying animation's geometry is extracted from the DRIVER and the
// page is drawn from it, so there is one description of the graph rather than
// two that have to be kept in step. The region is pure — no DOM, no page input,
// no Math.random — which is what makes it safe to evaluate here.
const graphRegion = (idanim.match(/GRAPH-START[\s\S]*?\*\/([\s\S]*?)\/\*\s*GRAPH-END/) || [])[1];
if (!graphRegion) {
  console.error("✗ build failed — build/idanim.js has no GRAPH-START … GRAPH-END region to draw from");
  process.exit(1);
}
const { NODES: IDN, ARCS: IDA, idGraph } = new Function(graphRegion + "\nreturn { NODES, ARCS, idGraph };")();
const idgraph = idGraph();

// ---- validate (fail the build on drift) --------------------------------
const errors = [];
const ID = /^OS-\d{3}$/;
const STATUSES = new Set(["shipped", "spec-complete", "in-development", "draft"]);

protocols.forEach((p, i) => {
  for (const f of ["id", "name", "primitive", "status", "tagline", "dataPrimitive", "paperNumber", "paperTitle", "paperDesc"]) {
    if (!p[f]) errors.push(`protocols[${i}] (${p.id || "?"}): missing "${f}"`);
  }
  if (!Array.isArray(p.tags) || p.tags.length === 0) errors.push(`protocols[${i}] (${p.id || "?"}): missing "tags"`);
  if (p.id && !ID.test(p.id)) errors.push(`protocols[${i}]: bad id "${p.id}" (want OS-NNN)`);
  if (p.status && !STATUSES.has(p.status)) errors.push(`protocols[${i}] (${p.id}): unknown status "${p.status}"`);
});

// ids must be unique and in OS-order so "OS-001 through OS-0NN" is honest
const ids = protocols.map((p) => p.id);
if (new Set(ids).size !== ids.length) errors.push("duplicate protocol id(s)");
const sorted = [...ids].sort();
if (JSON.stringify(ids) !== JSON.stringify(sorted)) errors.push(`protocols not in id order: ${ids.join(", ")}`);

if (rungs.rungs.length !== 7) errors.push(`expected 7 rung entries (rungs 1–2 share one card), got ${rungs.rungs.length}`);

// law counts: scoped, and the enforced total is DERIVED (kernel + compose), never
// typed. A hand-maintained count must carry the date it was measured — that is how
// 103 and 118 came to read as contradicting each other across two domains.
for (const f of ["kernelLaws", "composeLaws", "openGaps", "trials"]) {
  if (!Number.isInteger(rungs[f]) || rungs[f] < 0) errors.push(`rungs.${f} must be a non-negative integer, got ${rungs[f]}`);
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(rungs.measured || "")) {
  errors.push(`rungs.measured must be an ISO date (when the suites were last run), got ${rungs.measured}`);
}
if (rungs.playground?.lawsWired > rungs.kernelLaws) {
  errors.push(`rungs.playground.lawsWired (${rungs.playground.lawsWired}) exceeds kernelLaws (${rungs.kernelLaws})`);
}
if ("lawCount" in rungs) {
  errors.push("rungs.lawCount is retired — it was scope-ambiguous. Use kernelLaws + composeLaws.");
}

// retractions: a bound, not a promise. Every entry needs both ends of the
// bound, so "at most once, inside the retraction" and "and the retraction is
// still there" are one statement rather than two half-checks.
if (!Array.isArray(retractions.entries) || retractions.entries.length === 0) {
  errors.push("retractions.entries must be a non-empty array — a blocklist with nothing on it is a check that cannot fail");
} else {
  retractions.entries.forEach((r, i) => {
    for (const f of ["string", "retracted_at", "why"]) {
      if (!r[f]) errors.push(`retractions.entries[${i}] (${r.string || "?"}): missing "${f}"`);
    }
    for (const f of ["min", "max"]) {
      if (!Number.isInteger(r[f]) || r[f] < 0) errors.push(`retractions.entries[${i}] (${r.string || "?"}): ${f} must be a non-negative integer, got ${r[f]}`);
    }
    if (Number.isInteger(r.min) && Number.isInteger(r.max) && r.min > r.max) {
      errors.push(`retractions.entries[${i}] (${r.string}): min ${r.min} > max ${r.max}`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.retracted_at || "")) errors.push(`retractions.entries[${i}] (${r.string || "?"}): retracted_at must be an ISO date`);
  });
}

// loop: exactly the 5 canonical PULSE phase kinds, each fully formed and
// referencing real protocol ids (so the loop diagram can't drift from the map)
const PHASES = ["retrieve", "route", "act", "learn", "consolidate"];
if (!loop || !Array.isArray(loop.phases) || loop.phases.length !== 5) {
  errors.push(`loop.phases must list the 5 canonical PULSE phases, got ${loop?.phases?.length}`);
} else {
  loop.phases.forEach((ph, i) => {
    for (const f of ["key", "verb", "gloss", "primitive", "protocols"]) {
      if (!ph[f]) errors.push(`loop.phases[${i}] (${ph.key || "?"}): missing "${f}"`);
    }
    if (ph.key !== PHASES[i]) errors.push(`loop.phases[${i}]: expected "${PHASES[i]}", got "${ph.key}"`);
    if (Array.isArray(ph.protocols)) {
      ph.protocols.forEach((id) => {
        if (!ids.includes(id)) errors.push(`loop.phases[${i}] (${ph.key}): unknown protocol "${id}"`);
      });
    }
  });
}
if (!Array.isArray(loop.rings) || loop.rings.length === 0) errors.push("loop.rings must be a non-empty array");

// A11Y4 — the ring diagram's ACCESSIBLE NAME, derived here and never typed.
// The ring is a picture of the same phases the <ol> beside it lists, so a
// hand-typed label is a second copy of data that moves: rename a phase in
// loop.json and the list follows while the label does not. It said
// "retrieve, route, act, learn, consolidate" in lower case when the data had
// said "Retrieve, Route, …" for as long as the file has existed.
// It also has to carry the one thing the list cannot: an <ol> says "five
// things in order" and stops; the ring says the last one returns to the first,
// and that closure is the whole reason the picture is drawn.
const loopVerbs = (loop.phases || []).map((ph) => ph.verb).filter(Boolean);
const ringName =
  `The cognition loop drawn as a ring: ${loopVerbs.join(", then ")}, then back to ${loopVerbs[0]}. ` +
  `The same phases are listed beside this diagram.`;

// receipts: each must carry a metric/value/note (the proof band is real claims)
if (!Array.isArray(receipts) || receipts.length === 0) {
  errors.push("receipts must be a non-empty array");
} else {
  receipts.forEach((r, i) => {
    for (const f of ["metric", "value", "note"]) {
      if (!r[f]) errors.push(`receipts[${i}] (${r.metric || "?"}): missing "${f}"`);
    }
  });
}

// ── the surface record: the band, the status block and the CTAs come from it ──
// SHELL.md §1–§4. Nothing on the page may state a rung, a status or a bound
// that is not here, and the rung itself is DERIVED below rather than stored.
const RUNGS = ["spec", "in_tree", "live_local", "live_deployed", "external"];
const VERBS = {
  spec: ["Read", "Challenge", "Implement"],
  in_tree: ["Inspect the source", "Run the tests"],
  live_local: ["Use it", "Reproduce it locally"],
  live_deployed: ["Use the deployed artifact"],
  external: ["See independent evidence", "Contribute another result"],
};

if ("surface_rung" in surface) {
  errors.push(
    "surface.surface_rung is refused — the rung is DERIVED from the protocol statuses. Writing one in by hand is the drift the derivation exists to prevent.",
  );
}
if (!surface.surface_rung_covers || surface.surface_rung_covers.length < 40) {
  errors.push("surface.surface_rung_covers is missing or too short — the covers span is what keeps the chip honest, and the band is not publishable without it");
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(surface.verified_at || "")) errors.push(`surface.verified_at must be an ISO date, got ${surface.verified_at}`);
if (!surface.question || !surface.question.trim().endsWith("?")) {
  errors.push(`surface.question must be a question that could come back "no" (SITES.md §0.8), got: ${surface.question}`);
}
for (const f of ["statement", "source", "limit"]) if (!surface.status?.[f]) errors.push(`surface.status.${f} is missing`);
for (const f of ["next_rung", "requires"]) if (!surface.advance?.[f]) errors.push(`surface.advance.${f} is missing`);
if (surface.advance?.next_rung && !RUNGS.includes(surface.advance.next_rung)) errors.push(`surface.advance.next_rung "${surface.advance.next_rung}" is not a rung`);
// The band, checked in BOTH directions (SHELL.md r5). Refusing a layer claim a
// tier has not earned is only half of it; a place-2 band that quietly DROPS its
// layer word is the same defect inverted, and it passed until someone tried it.
// amp-nav records `layer` on place-2 entries only: place 3 is the specification
// tier and place 4 is outside the story.
if (![2, 3, 4].includes(surface.tier)) errors.push(`surface.tier must be 2, 3 or 4 (amp-nav place), got ${surface.tier}`);
if (surface.tier === 2 && !surface.layer) errors.push("a place-2 surface MUST print its layer word — dropping it is the tier-4 defect inverted (SHELL.md r5)");
if (surface.tier !== 2 && surface.layer) errors.push(`a place-${surface.tier} surface may not claim the layer "${surface.layer}" — amp-nav records a layer for place-2 entries only`);
if (!/^shell-r\d+$/.test(surface.shell_revision || "")) errors.push(`surface.shell_revision must name the shell revision this page was built against, got "${surface.shell_revision}"`);
// Contact (SHELL.md r9, ruled 2026-08-17). It is a hosted form now, and the
// endpoint is declared here ONCE so no template can invent its own.
if (surface.contact?.kind === "mailto" || /^mailto:/i.test(surface.contact?.url || "") || /^mailto:/i.test(surface.contact?.endpoint || "")) {
  errors.push("surface.contact is a mailto: — contact goes through a hosted form or an issue tracker, never a mailbox (Travis's call, 2026-08-11)");
}
if (surface.contact?.kind !== "formspree") {
  errors.push(`surface.contact.kind must be "formspree" (SHELL.md r9 — the [TRAVIS] blocker fourteen surfaces reported was ruled on 2026-08-17), got "${surface.contact?.kind}"`);
}
if (!/^https:\/\/formspree\.io\/f\/[a-z0-9]+$/i.test(surface.contact?.endpoint || "")) {
  errors.push(`surface.contact.endpoint must be an https formspree.io/f/<id> URL, got "${surface.contact?.endpoint}"`);
}
if (!surface.contact?.placeholder || !/wrong/i.test(surface.contact.placeholder)) {
  errors.push("surface.contact.placeholder is missing or no longer invites a correction — \"a number of ours you think is wrong\" is the one kind of message this portfolio most needs, and it is the placeholder's whole job");
}
if (!surface.contact?.url) errors.push("surface.contact.url is missing — the public second route (an issue tracker) is kept alongside the form, not replaced by it");
// The review ledger cannot lie: approved needs its evidence, reviewer and date.
for (const [k, g] of Object.entries(surface.gates || {})) {
  if (k.startsWith("_")) continue;
  if (!["approved", "pending"].includes(g.status)) errors.push(`surface gate ${k}: status must be approved or pending, got "${g.status}"`);
  if (g.status === "approved") {
    for (const f of ["evidence", "reviewer", "date"]) {
      if (!g[f]) errors.push(`surface gate ${k} is approved with no ${f} — an approved gate without its evidence is a claim, not a review`);
    }
  }
}
// §0.7 is mechanical, so it is implemented mechanically: a page that asks for
// something its rung has not earned does not get emitted.
for (const [r, actions] of Object.entries(surface.cta || {})) {
  if (r.startsWith("_")) continue;
  if (!VERBS[r]) errors.push(`surface.cta declares an unknown rung: ${r}`);
  if (!surface.cta._labels?.[r]) errors.push(`surface.cta group ${r} has no claim-tag label`);
  for (const a of actions) {
    // A CTA that cites a publication is governed by the publication table
    // (PUB3) instead of this one: the rung governs claims about the code, the
    // publication record governs claims about the book. Neither is typed.
    if (!a.publication && !VERBS[r]?.includes(a.verb)) {
      errors.push(`BUILD REFUSED — CTA "${a.verb}" is not available at rung ${r}. Allowed: ${(VERBS[r] || []).join(" · ")}`);
    }
    if (/^mailto:/i.test(a.href || "")) errors.push(`CTA "${a.verb}" points at a mailto:`);
  }
}

// r5: the gate that WITNESSES the rung, and its pair. A real rung must name an
// APPROVED gate — "no pending gates" is too blunt, because independent_result is
// pending forever by construction and would block the surface for ever. A `?`
// must name NONE: a question mark exists precisely because there is no witness,
// so filling one in would be the fabrication the chip is there to prevent.
// (Checked after `rung` is derived, further down; the record shape is checked here.)
if (!("rung_witness" in surface)) errors.push("surface has no rung_witness field — name the gate that witnesses the rung, or null if the rung is `?` (SHELL.md r5)");
if (surface.rung_witness && !surface.gates?.[surface.rung_witness]) errors.push(`rung_witness "${surface.rung_witness}" is not a gate in this record`);
if (surface.rung_witness && surface.gates?.[surface.rung_witness]?.status !== "approved") {
  errors.push(`rung_witness "${surface.rung_witness}" is not approved — a rung with an unapproved witness is a rung with no witness`);
}

// ---- receipts and protocol chips (REC1–REC2, PRO1) ----------------------
// The front page's first receipt used to read: "Graphonomous (OS-001), shipped ·
// graph-backed memory beats flat RAG". Three defects in one sentence, and all
// three are now unwritable:
//   · it typed a status word the protocol record derives (REC2);
//   · it made a comparative claim against a baseline NOTHING in any tree, public
//     or private, has measured (REC1) — the only comparison that was actually
//     run is the topology ablation, and it is +0.3pp;
//   · it pointed at graphonomous.com, which has since RETRACTED that engine's
//     figures by name and says they "were never re-measured here".
// The sibling site retracted a neighbouring claim ("96.6 — attributed to a
// third-party system with no citation, in a comparison table this site cannot
// witness") for exactly this reason. This page kept its own.
{
  const STATUS_WORDS = /\b(shipped|spec[- ]complete|in[- ]development|draft)\b/i;
  const COMPARATIVE = /\b(beats?|outperforms?|better than|faster than|more accurate than|ahead of|superior to)\b/i;
  receipts.forEach((r, i) => {
    const at = `receipts[${i}] (${r.metric || "?"})`;
    const w = (r.note || "").match(STATUS_WORDS);
    if (w) {
      errors.push(`REC2 — ${at} writes the status "${w[0]}" into its note. A protocol's status is derived from protocols.json and shown on its own chip; a second copy in a sentence is the copy that goes stale.`);
    }
    const c = (r.note || "").match(COMPARATIVE);
    if (c && !r.baseline) {
      errors.push(`REC1 — ${at} claims to "${c[0]}" something and names no baseline. A comparative with nothing on the other side of it is not a measurement. Record baseline {what, value} or state the figure on its own.`);
    }
    if (r.baseline && (!r.baseline.what || !r.baseline.value)) {
      errors.push(`REC1 — ${at} declares a baseline with no ${!r.baseline.what ? "what" : "value"}. Name what was compared and what it measured.`);
    }
  });
}

// PRO1 — a protocol's tags may not restate its status or its version. All
// twelve typed both, and OS-010's had already drifted: the record said v0.1.1
// and the tag it printed said v0.1. The chip is derived in the template now.
for (const p of protocols) {
  for (const t of p.tags || []) {
    const txt = t.t || "";
    const w = txt.match(/\b(shipped|spec[- ]complete|in[- ]development|draft)\b/i);
    if (w) errors.push(`PRO1 — ${p.id} carries the tag "${txt}", which types the status "${w[0]}". The status chip is derived from the record; delete the tag.`);
    if (p.version && txt.includes(p.version)) {
      errors.push(`PRO1 — ${p.id} carries the tag "${txt}", which restates its own version ${p.version}. The chip is derived; a second copy drifts.`);
    }
  }
}

// ---- the three research questions (QST1–QST3) ---------------------------
// OPENSENTIENCE_SURFACE §3.1. These replaced five cards that asserted their own
// maturity in prose — so a protocol could be re-adjudicated and the question
// beside it would go on describing the old one. The status is now read out of
// protocols.json, and these three gates keep it that way.
{
  const qs = questions.questions || [];
  if (qs.length !== 3) errors.push(`QST1 — the section is "Three questions" and questions.json holds ${qs.length}. Change the heading or change the file; do not let them disagree.`);
  const known = new Set(protocols.map((p) => p.id));
  for (const [i, q] of qs.entries()) {
    const at = `questions[${i}] (${q.id || "?"})`;
    for (const f of ["id", "ask", "lives_in", "established", "unsettled", "settles_it"]) {
      if (!q[f] || (Array.isArray(q[f]) && !q[f].length)) errors.push(`QST3 — ${at} is missing "${f}". A question with no ${f === "settles_it" ? "falsifier is not an open question, it is a slogan" : `"${f}" cannot be printed honestly`}.`);
    }
    for (const id of q.lives_in || []) {
      if (!known.has(id)) errors.push(`QST1 — ${at} lives in "${id}" and protocols.json has no such protocol. A question cannot be homed in something that is not there.`);
    }
    // QST2 — the status words belong to the chip, which is derived. Prose that
    // names one is prose that will be wrong the day the protocol moves.
    const prose = [q.established, q.unsettled, q.settles_it].join(" ");
    const typed = prose.match(/\b(spec-complete|in-development|in development|shipped|draft)\b/i);
    if (typed) {
      errors.push(`QST2 — ${at} writes the status "${typed[0]}" into its prose. The chip beside it is derived from protocols.json; a second copy in a sentence is the copy that goes stale.`);
    }
  }
  if (!questions.closing) errors.push("QST3 — questions.json has no closing line");
}

// ---- the publication record (PUB1–PUB8) --------------------------------
// Ruled 2026-09-11. A book CTA is DERIVED from a verified record, never typed.
//
// The brief that asked for one proposed a single draft|preview|released scale.
// That cannot express a book which is fully released and has no file to
// download, and collapsing the two is exactly what produces "Download the
// founding edition" for something you can only read. So the record carries two
// axes — state and delivery — and the verb is a function of both.
//
// A publication CTA is governed by THIS table instead of the rung's VERBS
// table, and that split is deliberate: the rung governs claims about the code,
// the record governs claims about the book. Neither is typed.
const PUB_STATES = ["forthcoming", "public_draft", "released"];
const PUB_DELIVERY = ["web", "download", "both"];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
// One day-stamp for the whole run, so two checks in the same build cannot
// straddle midnight and disagree about how old a record is.
//
// `--as-of=YYYY-MM-DD` moves that day for ANALYSIS ONLY. It exists because an
// offer has two sides and a build can only ever stand on one of them: without
// it, "the page transitions correctly after the offer expires" is a sentence
// nobody can check until the day it is too late to fix. It is deliberately a
// TRAPDOOR THAT DOES NOT OPEN OUTWARDS — a build run under a moved day refuses
// to write anything at all (see the emit section), so it cannot be used to keep
// an expired offer alive by lying to the clock.
const AS_OF = (process.argv.find((a) => a.startsWith("--as-of=")) || "").slice(8);
if (AS_OF && !/^\d{4}-\d{2}-\d{2}$/.test(AS_OF)) {
  console.error(`\u2717 --as-of must be an ISO date, got "${AS_OF}"`);
  process.exit(2);
}
const BUILD_DAY = AS_OF || new Date().toISOString().slice(0, 10);

const pubs = publication.publications || [];
if (!pubs.length) errors.push("publication.json declares no publications — remove the file or record one");

const pubById = new Map();
const bookVerb = new Map();
const ctaAfterById = new Map();
// The ONLY urgency string this page may print, and only when the record earns
// it. Anything else urgent is refused outright further down — a date the record
// holds is supportable; "limited time" never is.
const offerSuffix = new Map();
// Whether the offer's END is something this build can find a mechanism for, as
// opposed to something the record describes. Only an enforced offer may print.
const offerEnforced = new Map();
// The registry rows PUB7 re-derives its counts from, kept so the cover is
// drawn from the SAME read — a cover derived from a second read of the same
// file is a cover that can disagree with the counts printed beside it.
let registryRows = null;
// What the page PRINTS, which after expiry is not what the record contracts.
const renderVerb = new Map();

for (const [i, p] of pubs.entries()) {
  const at = `publication[${i}] (${p.id || "?"})`;
  for (const f of ["id", "title", "state", "delivery", "home", "verified_at"]) {
    if (!p[f]) errors.push(`${at}: missing "${f}"`);
  }
  if (p.id) {
    if (pubById.has(p.id)) errors.push(`${at}: duplicate publication id`);
    pubById.set(p.id, p);
  }
  if (p.state && !PUB_STATES.includes(p.state)) errors.push(`${at}: unknown state "${p.state}" (want ${PUB_STATES.join(" | ")})`);
  if (p.delivery && !PUB_DELIVERY.includes(p.delivery)) errors.push(`${at}: unknown delivery "${p.delivery}" (want ${PUB_DELIVERY.join(" | ")})`);
  const downloadable = p.delivery === "download" || p.delivery === "both";

  // PUB1 — a download that does not exist. The whole reason the record has two
  // axes: this is the exact sentence the brief asked for and the tree could not
  // support, and it is now unwritable rather than merely discouraged.
  if (downloadable && (!p.download || !p.download.url || !p.download.sha256)) {
    errors.push(`PUB1 — ${at} declares delivery "${p.delivery}" with no download {url, sha256}. There is no file to offer.`);
  }

  // PUB2 — CONDITIONAL DERIVATION, not prohibition. Corrected 2026-09-12: the
  // first version forbade dated offers outright, which would have made a
  // genuine book launch unsayable. That is the wrong fix for the right problem.
  // What must be inexpressible is UNSUPPORTED urgency — so a real offer becomes
  // reachable the moment the record can carry it, and the only urgency the page
  // may print is a date the record actually holds.
  if (p.free_offer) {
    const o = p.free_offer;
    for (const f of ["starts", "ends", "price_during", "price_after", "expiry_check"]) {
      if (o[f] === undefined || o[f] === null) errors.push(`PUB2 — ${at} free_offer is missing "${f}". An offer without it cannot be checked, and an offer nobody can check is scarcity theatre.`);
    }
    for (const f of ["starts", "ends"]) {
      if (o[f] !== undefined && !ISO_DATE.test(o[f] || "")) errors.push(`PUB2 — ${at} free_offer.${f} must be an exact ISO date, got "${o[f]}"`);
    }
    if (ISO_DATE.test(o.starts || "") && ISO_DATE.test(o.ends || "") && Date.parse(o.ends) <= Date.parse(o.starts)) {
      errors.push(`PUB2 — ${at} free_offer ends ${o.ends} on or before it starts ${o.starts}`);
    }
    // CORRECTED 2026-09-12. This used to REFUSE an offer whose window had
    // closed, and that refusal was the whole of PUB2's expiry story. It is the
    // wrong instrument twice over. A build that refuses does not take the
    // offer off the deployed page — it takes the SITE off the next deploy,
    // while the stale offer stays live in front of every visitor; and it can
    // only do even that on the day somebody happens to build. So the record no
    // longer has to be settled by hand: an expired offer TRANSITIONS, the page
    // derives the post-expiry call to action, and the dated string stops
    // printing. What remains true, and is why the block below exists, is that
    // a static page transitions only when something rebuilds it.
    if (o.price_during && o.price_during.amount !== 0) {
      errors.push(`PUB2 — ${at} free_offer.price_during is ${o.price_during.amount}, not 0. A free offer is free during its window.`);
    }
    if (o.price_after && !(o.price_after.amount > 0)) {
      errors.push(`PUB2 — ${at} free_offer.price_after is ${o.price_after.amount} — free before and free after is not an offer, it is the price`);
    }
    for (const f of ["kind", "cadence", "how"]) {
      if (o.expiry_check && !o.expiry_check[f]) errors.push(`PUB2 — ${at} free_offer.expiry_check is missing "${f}" — name the mechanism that will notice the expiry`);
    }

    // ── PUB2E — the difference between describing a mechanism and having one.
    // The original expiry_check was {kind, cadence, how} and all three were
    // PROSE. "the nightly Pages build re-runs this gate" is a sentence; it is
    // not a nightly Pages build. A record could pass every check above and the
    // offer would still sit on a deployed static page forever, because nothing
    // in this repository rebuilds anything on a clock.
    //
    // So the claim is split from the capability. An offer may always be
    // RECORDED and is fully checked as a prospective plan. It may only be
    // PRINTED — the dated "Free until …" string, the thing a reader acts on —
    // when the mechanism that will end it is one this build can find and read.
    // kind "none" is the honest default and is not a failure; what IS refused
    // is a record that names an enforcement it does not have.
    const EXPIRY_KINDS = ["none", "scheduled_rebuild"];
    const ec = o.expiry_check || {};
    if (ec.kind && !EXPIRY_KINDS.includes(ec.kind)) {
      errors.push(`PUB2E — ${at} expiry_check.kind "${ec.kind}" is outside the vocabulary (${EXPIRY_KINDS.join(" | ")}). A kind nothing can check is prose with a field name.`);
    }
    let enforced = false;
    if (ec.kind === "scheduled_rebuild") {
      // Three things, each of which has to be TRUE rather than described.
      const CADENCE_DAYS = { daily: 1, weekly: 7 };
      const wantDays = CADENCE_DAYS[ec.cadence];
      if (!wantDays) {
        errors.push(`PUB2E — ${at} expiry_check.cadence "${ec.cadence}" is not one this build can compare against a schedule (${Object.keys(CADENCE_DAYS).join(" | ")})`);
      }
      if (!ec.workflow) {
        errors.push(`PUB2E — ${at} claims a scheduled rebuild and names no workflow. Name the file that runs, so this build can read it.`);
      } else {
        const wf = resolve(site_root, ec.workflow);
        if (!existsSync(wf)) {
          errors.push(`PUB2E — ${at} names the workflow ${ec.workflow} and there is no such file. A schedule that is not in the tree will not run.`);
        } else {
          const src = readFileSync(wf, "utf8");
          // A workflow with no `schedule:` trigger runs when a human pushes,
          // which is exactly the thing that cannot be relied on to happen on
          // the day an offer ends.
          const crons = [...src.matchAll(/-\s*cron:\s*["']([^"']+)["']/g)].map((m) => m[1]);
          if (!/^\s*schedule\s*:/m.test(src) || !crons.length) {
            errors.push(`PUB2E — ${at} names ${ec.workflow}, which declares no schedule: cron trigger. It runs when somebody pushes, and an offer ends whether or not anybody pushes.`);
          } else if (wantDays) {
            // Coarse but honest: a cron whose day-of-month and month fields are
            // wildcards fires at least daily; one that pins a weekday fires at
            // least weekly. Anything narrower is not compared — it is refused,
            // because a bound this build cannot compute is a bound it must not
            // assert.
            const everyDay = crons.some((c) => { const f = c.trim().split(/\s+/); return f.length === 5 && f[2] === "*" && f[3] === "*" && f[4] === "*"; });
            const everyWeek = crons.some((c) => { const f = c.trim().split(/\s+/); return f.length === 5 && f[2] === "*" && f[3] === "*" && f[4] !== "*"; });
            const haveDays = everyDay ? 1 : everyWeek ? 7 : null;
            if (haveDays === null) {
              errors.push(`PUB2E — ${at} names a cron (${crons.join(", ")}) this build cannot bound. Use a schedule whose period it can compute, or do not claim a cadence from it.`);
            } else if (haveDays > wantDays) {
              errors.push(`PUB2E — ${at} declares cadence "${ec.cadence}" and ${ec.workflow} is scheduled every ${haveDays} day(s). The offer would outlive its end date by up to ${haveDays - wantDays} day(s) on a live page.`);
            }
          }
          // And the receipt. A schedule that has never been shown to produce
          // the post-expiry page proves the job is configured, not that the
          // transition works. This is the one that makes "a real launch will
          // transition correctly" a measured sentence instead of a hoped one.
          if (!ec.receipt) {
            errors.push(`PUB2E — ${at} has a schedule and no receipt. Run the transition and record it: a configured job is not an exercised one.`);
          } else {
            const rp = resolve(site_root, ec.receipt);
            if (!existsSync(rp)) {
              errors.push(`PUB2E — ${at} cites a receipt at ${ec.receipt} and there is no such file`);
            } else {
              let rec = null;
              try { rec = JSON.parse(readFileSync(rp, "utf8")); } catch (e) { errors.push(`PUB2E — ${at} receipt ${ec.receipt} is unreadable: ${e.message}`); }
              if (rec) {
                const exit = rec.execution_identity ? rec.execution_identity.exit : rec.exit;
                if (exit !== 0) errors.push(`PUB2E — ${at} cites a receipt whose run exited ${exit}. A failing run may not witness an expiry transition.`);
                else if (!rec.exercised_after || !ISO_DATE.test(rec.exercised_after)) {
                  errors.push(`PUB2E — ${at} receipt does not record exercised_after (the day it built the page AS), so nothing says which side of the boundary it stood on.`);
                } else if (Date.parse(rec.exercised_after) <= Date.parse(o.ends)) {
                  errors.push(`PUB2E — ${at} receipt exercised ${rec.exercised_after}, which is on or before the offer's end ${o.ends}. It witnessed the offer, not its expiry.`);
                } else {
                  enforced = true;
                }
              }
            }
          }
        }
      }
    }
    offerEnforced.set(p.id, enforced);
    // A deterministic CTA on BOTH sides of the expiry, or the offer is not
    // expressible: the page must know what it will say the day after.
    const afterState = o.state_after || p.state;
    const afterDelivery = o.delivery_after || p.delivery;
    const rowAfter = (publication.cta_derivation?.rows || []).find(
      (r) => r.state === afterState && (r.delivery === afterDelivery || r.delivery === "*")
    );
    if (!rowAfter) {
      errors.push(`PUB2 — ${at} free_offer leaves no derivable CTA after expiry: (${afterState}, ${afterDelivery}) has no row. Declare state_after / delivery_after.`);
    } else {
      ctaAfterById.set(p.id, rowAfter.verb);
    }
  }

  // PUB4 — a "last verified" date nothing checks for staleness is decoration.
  if (ISO_DATE.test(p.verified_at || "")) {
    const maxAge = Number.isInteger(p.verified_max_age_days) ? p.verified_max_age_days : 30;
    const ageDays = Math.floor((Date.parse(BUILD_DAY) - Date.parse(p.verified_at)) / 86400000);
    if (ageDays > maxAge) {
      errors.push(`PUB4 — ${at} was last verified ${ageDays} days ago and its record allows ${maxAge}. Re-check the route table and move verified_at.`);
    }
    if (!p.verified_what) errors.push(`PUB4 — ${at} states a verified_at with no verified_what — say what was checked`);
  } else if (p.verified_at) {
    errors.push(`${at}: verified_at must be an ISO date, got "${p.verified_at}"`);
  }

  // PUB5 — a file may not be offered without terms.
  if (downloadable && !p.license) {
    errors.push(`PUB5 — ${at} offers a download while license is null. A file may not be offered without terms.`);
  }

  // PUB7 — the counts are re-derived from the registry the record names, and a
  // disagreement refuses. These moved under this very build once, when a
  // parallel session committed a rung re-adjudication mid-pass.
  if (p.registry?.path && p.derived_counts) {
    const regPath = resolve(site_root, p.registry.path);
    if (!existsSync(regPath)) {
      errors.push(`PUB7 — ${at} names a registry at ${p.registry.path} and there is no such file. The counts cannot be re-derived, so they cannot be published.`);
    } else {
      let rows;
      try {
        const reg = JSON.parse(readFileSync(regPath, "utf8"));
        rows = Array.isArray(reg) ? reg : reg.patterns;
      } catch (e) {
        errors.push(`PUB7 — ${at} registry ${p.registry.path} is unreadable: ${e.message}`);
      }
      if (Array.isArray(rows)) {
        registryRows = rows;
        // `spec` on this ladder means written down and nothing runs, so a spec
        // is NOT a witness. One field used to count it and was called
        // `with_witness_rung`, which is misleading terminology in a system
        // whose whole claim is that its terms are exact. It is now two fields
        // that each say what they count, and the retired name is refused below
        // the way `rungs.lawCount` is — by name, forever.
        const WITNESS_RUNGS = new Set(["in_tree", "live_local", "live_deployed", "external"]);
        const rungOf = (r) => (r.witness || {}).rung;
        const fresh = {
          chapters: rows.length,
          with_any_rung: rows.filter((r) => rungOf(r)).length,
          witnessed: rows.filter((r) => WITNESS_RUNGS.has(rungOf(r))).length,
          externally_reproduced: rows.filter((r) => rungOf(r) === "external").length,
        };
        if ("with_witness_rung" in p.derived_counts) {
          errors.push(`PUB7 — ${at} uses the retired field with_witness_rung. It counted the spec rung as a witness. Use witnessed (spec excluded) or with_any_rung.`);
        }
        for (const [k, v] of Object.entries(fresh)) {
          if (k in p.derived_counts && p.derived_counts[k] !== v) {
            errors.push(`PUB7 — ${at} derived_counts.${k} says ${p.derived_counts[k]} and the registry says ${v}. Re-derive, never re-type.`);
          }
        }
      }
    }
  }

  // The verb this publication has earned. A record whose (state, delivery) pair
  // has no row derives nothing, and PUB3 then refuses every CTA that cites it —
  // which is the right failure: an unmapped pair is an unanswered question.
  const row = (publication.cta_derivation?.rows || []).find(
    (r) => r.state === p.state && (r.delivery === p.delivery || r.delivery === "*")
  );
  if (!row) {
    errors.push(`PUB3 — ${at} is (${p.state}, ${p.delivery}) and cta_derivation has no row for that pair`);
  } else if (p.id) {
    bookVerb.set(p.id, row.verb);
    // Two verbs, on purpose. `bookVerb` is the CONTRACT — what (state,
    // delivery) derives, and what surface.json's hand-written copy is checked
    // against. `renderVerb` is what the page prints TODAY. They are the same
    // verb until an offer expires; after that the page moves and the record
    // does not, which is the point: settling an expired offer must not require
    // a human to edit a CTA on the right morning.
    renderVerb.set(p.id, row.verb);
    const o = p.free_offer;
    if (o && ISO_DATE.test(o.starts || "") && ISO_DATE.test(o.ends || "")) {
      const started = Date.parse(o.starts) <= Date.parse(BUILD_DAY);
      const ended = Date.parse(BUILD_DAY) > Date.parse(o.ends);
      if (ended) {
        // The destination state. The post-expiry row was computed above and,
        // until this line existed, was computed and thrown away — the build
        // knew what the page would say the day after and never said it.
        const after = ctaAfterById.get(p.id);
        if (after) renderVerb.set(p.id, after);
      } else if (started && offerEnforced.get(p.id)) {
        // The dated string prints only on the enforced side of PUB2E. An
        // unenforced offer is a validated plan, and a validated plan is not an
        // offer a reader may be asked to act on.
        offerSuffix.set(p.id, `Free until ${o.ends}`);
      }
    }
  }
}

// PUB3, record side — a CTA that cites a publication must carry the derived
// verb. The artifact side is re-checked further down against the emitted page,
// because a template can print a verb the record never held.
for (const [r, actions] of Object.entries(surface.cta || {})) {
  if (r.startsWith("_") || !Array.isArray(actions)) continue;
  for (const a of actions) {
    if (!a.publication) continue;
    if (!pubById.has(a.publication)) {
      errors.push(`PUB3 — a CTA cites publication "${a.publication}", which publication.json does not record`);
      continue;
    }
    const want = bookVerb.get(a.publication);
    if (want && a.verb !== want) {
      errors.push(`PUB3 — CTA "${a.verb}" cites ${a.publication}, whose record derives "${want}". The verb is derived from (state, delivery); it is not a writing choice.`);
    }
  }
}

// PUB3 also governs the HERO's primary call to action. The hero is where a
// book claim does the most work, so it is the last place a verb should be
// writable by hand.
{
  const h = surface.hero || {};
  if (!h.lead || !["mission", "question"].includes(h.lead)) {
    errors.push(`surface.hero.lead must be "mission" or "question", got "${h.lead}"`);
  }
  for (const k of ["mission_eyebrow", "mission_headline", "mission_subtitle", "question_eyebrow", "question_headline", "question_subtitle", "primary_cta", "secondary_cta", "tertiary_cta"]) {
    if (!h[k]) errors.push(`surface.hero.${k} is missing — both directions must stay buildable, or one of them is not a direction`);
  }
  if (h.primary_cta && "verb" in h.primary_cta) {
    errors.push("PUB3 — surface.hero.primary_cta writes a verb down. The hero's book verb is derived from publication.json like every other one.");
  }
  if (h.primary_cta?.publication && !pubById.has(h.primary_cta.publication)) {
    errors.push(`PUB3 — surface.hero.primary_cta cites publication "${h.primary_cta.publication}", which publication.json does not record`);
  }
}

// MIS1 — R-S1 made mechanical. Ruled 2026-09-11: the front door MAY summarise
// its mission and MAY NOT summarise twelve maturity levels into one status. An
// identity statement asserts what this is; a maturity word asserts how far
// along it is, and no single word is true of twelve protocols at four statuses.
// "the open research and executable protocol layer" is the sentence this
// refuses; "open research into machine cognition" is the sentence it permits.
const MATURITY = /\b(shipped|complete|completed|production|production-ready|proven|mature|executable|battle-tested)\b/i;
if (!surface.mission) {
  errors.push("surface.mission is missing — the front door is entitled to state its mission (R-S1) and this is where it says it");
} else {
  const hit = surface.mission.match(MATURITY);
  if (hit) {
    errors.push(`MIS1 — surface.mission says "${hit[0]}". A mission may assert identity and may not assert maturity: ${protocols.length} protocols at four distinct statuses have no single true maturity word.`);
  }
  if (surface.mission.length < 40) errors.push("surface.mission is too short to be a mission");
}


// ---- the status-aware stack map (MAP1–MAP5) ----------------------------
// Ruled 2026-09-11 (ruling 3): keep the diagram, and give every component its
// own DERIVED status. The fault was false aggregation, not diagrams.
//
// Per-node status alone does not close it. In a stack diagram the overclaim
// lives in the CONNECTOR, not the label: a node marked `draft` still reads
// load-bearing if a solid arrow runs through it. So an edge must NAME a
// producer and a consumer, each a path that exists, and an edge that cannot is
// drawn dashed. What a path proves is that a named artifact EXISTS — not that
// it is wired at runtime, which is the stronger §1.1 gate. The page says so.
const stackmap = read("data/stackmap.json");
const protoById = new Map(protocols.map((p) => [p.id, p]));
const nodeById = new Map();
const accounted = new Set();

for (const [i, n] of (stackmap.nodes || []).entries()) {
  const at = `stackmap.nodes[${i}] (${n.id || "?"})`;
  for (const f of ["id", "label", "role", "note"]) if (!n[f]) errors.push(`${at}: missing "${f}"`);
  if (n.id && nodeById.has(n.id)) errors.push(`${at}: duplicate node id`);

  // MAP3 — the same rule as surface_rung: derived, or absent with a reason.
  if ("status" in n) {
    errors.push(`MAP3 — ${at} writes a status down. A node's status is derived from protocols.json or it is absent with a stated reason.`);
  }

  const ps = Array.isArray(n.protocols) ? n.protocols : [];
  for (const id of ps) {
    if (!protoById.has(id)) errors.push(`${at}: cites unknown protocol "${id}"`);
    else accounted.add(id);
  }

  // MAP1 — no silent statusless node.
  if (!ps.length && !n.status_why) {
    errors.push(`MAP1 — ${at} carries no protocol and no status_why. A node with no status must say why it has none.`);
  }
  if (n.id) nodeById.set(n.id, n);
}

// MAP5 — added during implementation, because the hand-written diagram this
// replaces covered ten of the twelve protocols and omitted OS-011 and OS-012
// with nothing to notice. A map that can silently drop a protocol is a map
// whose coverage is an accident.
const unaccounted = protocols.map((p) => p.id).filter((id) => !accounted.has(id));
if (unaccounted.length) {
  errors.push(`MAP5 — no stack-map node accounts for ${unaccounted.join(", ")}. Every protocol appears on the map or the map is not of this stack.`);
}

// MAP4 — THREE states, corrected 2026-09-12. The first version drew an edge
// solid when both endpoint paths existed and the legend called that witnessed.
// Two files existing does not witness a connection between them: that is the
// same overclaim MAP4 exists to catch, committed by MAP4. Only an executable
// integration witness — a test or a generated run receipt that names and
// exercises BOTH endpoints, and passed — earns `solid`.
//
//   solid    an integration has actually run over both ends
//   dashed   both ends exist; nothing has exercised the connection
//   missing  one or both ends do not exist
const STATES = stackmap.edge_states || {};
for (const st of ["solid", "dashed", "missing"]) {
  if (!STATES[st]?.label || !STATES[st]?.means) errors.push(`stackmap.edge_states.${st} needs a label and a means`);
}
// MAP6 — the language rule, mechanised. A state that is not `solid` may not
// borrow the vocabulary of proof — and neither may the heading ABOVE the list,
// which is where it first went wrong: "what witnesses the connection" stood
// over four edges nothing had exercised.
const PROOF_WORDS = /\b(witness(?:ed|es|ing)?|verif(?:ied|ies)|proved|proven|confirms?)\b/i;
if (!stackmap.edges_heading) errors.push("stackmap.edges_heading is missing — the edge list needs a heading, and MAP6 checks it");
else {
  const h = stackmap.edges_heading.match(PROOF_WORDS);
  if (h) errors.push(`MAP6 — stackmap.edges_heading says "${h[0]}". The heading stands over every edge, including the ones nothing has exercised.`);
}
for (const [st, v] of Object.entries(STATES)) {
  if (st.startsWith("_") || st === "solid" || !v?.means) continue;
  const claim = String(v.means).match(PROOF_WORDS);
  if (claim) {
    errors.push(`MAP6 — edge_states.${st}.means says "${claim[0]}". Only \`solid\` may use the language of proof; everything else describes what exists.`);
  }
}

const stackEdges = [];
for (const [i, e] of (stackmap.edges || []).entries()) {
  const at = `stackmap.edges[${i}] (${e.from || "?"}\u2192${e.to || "?"})`;
  if (!nodeById.has(e.from)) errors.push(`${at}: unknown from-node "${e.from}"`);
  if (!nodeById.has(e.to)) errors.push(`${at}: unknown to-node "${e.to}"`);
  if (!e.what) errors.push(`${at}: missing "what" — an edge states the claim it makes`);

  const endOf = (side) => {
    const v = e[side];
    if (!v) {
      if (!e[`${side}_why`]) errors.push(`MAP4 — ${at} has no ${side} and no ${side}_why. An absent end is a claim about the tree and must be stated.`);
      return { ok: false, why: e[`${side}_why`] || "" };
    }
    if (!v.path || !v.what) {
      errors.push(`${at}: ${side} must name both a "what" and a "path"`);
      return { ok: false, why: "" };
    }
    if (!existsSync(resolve(site_root, v.path))) {
      errors.push(`MAP4 — ${at} names a ${side} at ${v.path} and there is no such path.`);
      return { ok: false, why: "", what: v.what, path: v.path };
    }
    return { ok: true, what: v.what, path: v.path };
  };

  const producer = endOf("producer");
  const consumer = endOf("consumer");

  // The integration witness. A declared one that does not hold up is REFUSED
  // rather than quietly downgraded — a mis-declared integration is a false
  // claim in the record, not a weaker one.
  let integration = null;
  if (e.integration) {
    const g = e.integration;
    const gat = `${at} integration`;
    if (!["receipt", "test"].includes(g.kind)) errors.push(`MAP4 — ${gat} kind must be "receipt" or "test", got "${g.kind}"`);
    if (!g.path) errors.push(`MAP4 — ${gat} must name a path`);
    else if (!existsSync(resolve(site_root, g.path))) errors.push(`MAP4 — ${gat} names ${g.path} and there is no such path. An integration nothing can find is not one.`);
    const ex = Array.isArray(g.exercises) ? g.exercises : [];
    for (const end of [producer, consumer]) {
      if (end.path && !ex.includes(end.path)) {
        errors.push(`MAP4 — ${gat} does not list the ${end === producer ? "producer" : "consumer"} ${end.path} among what it exercises. An integration that does not touch both ends cannot witness the connection between them.`);
      }
    }
    if (g.kind === "receipt" && g.path && existsSync(resolve(site_root, g.path))) {
      try {
        const r = JSON.parse(readFileSync(resolve(site_root, g.path), "utf8"));
        const exit = r?.execution_identity?.exit;
        if (exit !== 0) errors.push(`MAP4 — ${gat} cites a receipt whose run exited ${exit}. A failing run may not witness an integration.`);
        else integration = { kind: g.kind, path: g.path, ran: r?.execution_identity?.finished || null, cmd: r?.witness?.cmd || null };
      } catch (err) {
        errors.push(`MAP4 — ${gat} receipt ${g.path} is unreadable: ${err.message}`);
      }
    } else if (g.kind === "test" && g.path && existsSync(resolve(site_root, g.path))) {
      if (!g.cmd) errors.push(`MAP4 — ${gat} of kind "test" must name the cmd that runs it`);
      else integration = { kind: g.kind, path: g.path, cmd: g.cmd, ran: null };
    }
  }

  const bothEnds = producer.ok && consumer.ok;
  const state = !bothEnds ? "missing" : integration ? "solid" : "dashed";
  stackEdges.push({ ...e, producer, consumer, integration, state });
}

// The derived node list the template draws from. A node citing ONE protocol
// carries that protocol's status; a node citing several carries a per-status
// BREAKDOWN, never one averaged chip — R-S1's line, applied to the diagram.
const stackNodes = (stackmap.nodes || []).map((n) => {
  const ps = (n.protocols || []).map((id) => protoById.get(id)).filter(Boolean);
  const counts = ps.reduce((m, p) => ((m[p.status] = (m[p.status] || 0) + 1), m), {});
  return {
    ...n,
    chips: Object.entries(counts).map(([status, count]) => ({ status, count })),
    single: ps.length === 1,
  };
});


// Contrast (SHELL.md §0): no declared text token may fall below 4.5:1 against
// the surface it sits on. --fg3 shipped at .34 elsewhere in this portfolio,
// which measures 2.78:1, on the two elements whose whole job is to keep a page
// honest — the rung's scope and the status labels. This site's own failures
// were --text-dim at 3.32:1, --cyan at 3.55:1 and --amber at 3.20:1, all used
// as text. It is a dozen lines of colour maths and it makes the whole class of
// defect unshippable rather than reported.
{
  const chan = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  const lum = ([r, g, b]) => 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
  const hex = (h) => { const v = h.replace("#", ""); const n = v.length === 3 ? v.split("").map((c) => c + c).join("") : v; return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16)); };
  const parse = (s) => { s = s.trim(); if (s.startsWith("#")) return [...hex(s), 1]; const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(",").map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const over = (f, b) => [0, 1, 2].map((i) => f[3] * f[i] + (1 - f[3]) * b[i]);
  const ratio = (a, b) => { const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x); return (l1 + 0.05) / (l2 + 0.05); };
  // Anchored on the MARKER COMMENTS, not on the bare words. The stylesheet's
  // own header explains the mechanism and therefore contains the phrase
  // "TOKENS-START and TOKENS-END"; a lazy match on the bare words found that
  // 27-character sentence, read zero tokens out of it, and reported every
  // colour as undeclared. A check that matches its own documentation is a
  // check that silently measures nothing.
  const block = (css.match(/\/\*\s*TOKENS-START[\s\S]*?TOKENS-END\s*\*\//) || [""])[0];
  if (!block) errors.push("styles/site.css has no /* TOKENS-START */ … /* TOKENS-END */ block — the shell's one required marker");
  const tok = (n) => { const m = block.match(new RegExp(`--${n}:\\s*([^;\\n]+)`)); return m ? parse(m[1]) : null; };
  const surfaces = ["ink", "ink2", "ink3"].map((n) => [n, tok(n)]);
  for (const [n, s] of surfaces) if (!s) errors.push(`TOKENS block declares no surface --${n} — contrast cannot be measured against a surface that does not exist`);
  // Text tokens declared by the shell, plus the three site colours that are
  // used as text and were each measured below the floor.
  const textTokens = ["fg", "fg2", "fg3", "data", "warn"];
  for (const t of textTokens) {
    const f = tok(t);
    if (!f) { errors.push(`TOKENS block declares no --${t}`); continue; }
    for (const [sn, s] of surfaces) {
      if (!s) continue;
      const r = ratio(over(f, s), s);
      if (r < 4.5) errors.push(`--${t} measures ${r.toFixed(2)}:1 on --${sn} — below the 4.5:1 WCAG AA floor for text`);
    }
  }
}

// The catalog and its cover are derived HERE, before the error check below,
// and that position is load-bearing. They were first written down beside the
// render, which is AFTER this exit — so COV1's refusal was unreachable: a gate
// that pushes onto `errors` after `errors` has been reported is a gate that
// cannot fire. The probe for it failed with the wrong message, which is how it
// was found, and is why the harness matches messages rather than exit codes.
// The catalog section prints only numbers PUB7 has already re-derived from the
// registry and refused on disagreement — it introduces no new count of its own.
const catalogPub = pubs.find((p) => p.registry && p.derived_counts) || null;
if (!catalogPub) errors.push("the catalog section needs a publication with a registry and derived_counts, and none is recorded");
// ---- the cover (COV1–COV3) ----------------------------------------------
// The book object on this page is not a picture of a book. There is no file,
// no spine and nothing to hold: `delivery` is `web`, and a jacket with a page
// edge on it is the same overclaim as a Download verb — it draws an artifact
// the record does not have. So the cover is DRAWN FROM THE REGISTRY: one mark
// per chapter, coloured by the rung that chapter's evidence has earned.
//
// It is the most honest jacket this book can have, because the first thing it
// tells a reader is how much of the book is evidenced — and today that is half.
const RUNG_ORDER = ["external", "live_deployed", "live_local", "in_tree", "spec", null];
const RUNG_LABEL = { external: "reproduced elsewhere", live_deployed: "deployed", live_local: "run locally", in_tree: "in the tree", spec: "written down", null: "no witness yet" };
const coverMarks = (registryRows || []).map((r) => ((r.witness || {}).rung) || null);
const coverSplit = RUNG_ORDER
  .map((k) => ({ rung: k, label: RUNG_LABEL[k], n: coverMarks.filter((m) => m === k).length }))
  .filter((x) => x.n > 0);
const cover = catalogPub
  ? {
      title: catalogPub.title,
      subtitle: catalogPub.subtitle || "",
      // Same-origin, so the book opens the local copy in a preview and the
      // published one in production. The record's `home` is the canonical
      // absolute URL; the site's own CTAs are all paths, and a jacket that
      // jumps to the live domain from a preview cannot be tested where it is
      // built.
      home: String(catalogPub.home).replace(/^https?:\/\/opensentience\.org/i, "") || "/",
      state: catalogPub.state,
      delivery: catalogPub.delivery,
      marks: coverMarks,
      split: coverSplit,
      // Derived, never typed — and it says the thing the picture shows.
      name: `The cover of ${catalogPub.title}: one mark for each of its ${coverMarks.length} chapters, ` +
        coverSplit.map((x) => `${x.n} ${x.label}`).join(", ") + ". Read on the web; there is no file to download.",
    }
  : null;
if (!cover) errors.push("COV1 — there is no publication with a registry, so no cover can be drawn");
else if (cover.marks.length !== (catalogPub.derived_counts || {}).chapters) {
  errors.push(`COV1 — the cover would draw ${cover.marks.length} marks and the record derives ${(catalogPub.derived_counts || {}).chapters} chapters. The cover is the registry; it cannot show a different book.`);
}

const catalog = catalogPub
  ? { title: catalogPub.title, home: catalogPub.home, counts: catalogPub.derived_counts }
  : { title: "", home: "#", counts: { chapters: 0, witnessed: 0, externally_reproduced: 0 } };

if (errors.length) {
  console.error("✗ build failed — data drift detected:\n  - " + errors.join("\n  - "));
  process.exit(1);
}

// ---- derive (never typed — anti-drift) --------------------------------
const byStatus = protocols.reduce((m, p) => {
  m[p.status] = (m[p.status] || 0) + 1;
  return m;
}, {});
const stats = {
  total: protocols.length,
  first: protocols[0].id,
  last: protocols[protocols.length - 1].id,
  byStatus,
};

// The surface rung, DERIVED. amp-nav records this domain as `rung: null` with a
// stated reason — "mixed across OS-001…OS-011. There is no single rung for
// eleven protocols" — and that decision is reproduced here from the data rather
// than copied. A unanimous set of protocol statuses would produce a rung; a
// mixed set produces `?`, which SHELL.md §1 makes a first-class state and not a
// missing one. `?` is a fine answer; a defaulted rung is a fabricated status.
const STATUS_TO_RUNG = { shipped: "live_deployed", "spec-complete": "spec", "in-development": "in_tree", draft: "spec" };
const distinctStatuses = Object.keys(byStatus);
const rung = distinctStatuses.length === 1 ? STATUS_TO_RUNG[distinctStatuses[0]] || "?" : "?";

// r5, the other half of the witness rule: the derived rung and the named witness
// must agree in both directions.
if (rung === "?" && surface.rung_witness) {
  console.error(`✗ build failed — the rung derives to "?" and the record names a witness gate "${surface.rung_witness}". A question mark exists because there is no witness.`);
  process.exit(1);
}
if (rung !== "?" && !surface.rung_witness) {
  console.error(`✗ build failed — the rung derives to "${rung}" and no gate witnesses it (SHELL.md r5).`);
  process.exit(1);
}

// ---- render ------------------------------------------------------------
// Asset fingerprint. A stylesheet is cached far more aggressively than the
// document that links it, so a deploy that changes only the CSS ships a page
// that renders with the OLD styles — which is exactly what happened while these
// fixes were being verified locally, and looked identical to the fixes not
// working. Derived from the bytes, so it moves if and only if they do.
const assetv = createHash("sha256")
  .update(css)
  .update(readFileSync(resolve(root, "build/proof.js")))
  .update(idanim)
  .digest("hex")
  .slice(0, 8);

const bookVerbs = Object.fromEntries(renderVerb);
const bookOffers = Object.fromEntries(offerSuffix);
const html = Page({ site, surface, protocols, loop, receipts, rungs, references, stats, rung, assetv, idgraph, stackNodes, stackEdges, bookVerbs, bookOffers, edgeStates: STATES, edgesHeading: stackmap.edges_heading, ringName, questions, catalog, cover });

// ---- gate the ARTIFACT, not the source ---------------------------------
// A gate that reads the source checks what the build meant; these read what a
// visitor will get. Every one is here because something in this portfolio
// shipped wrong in exactly this way at least once.
const artifactErrors = [];
const markup = html.replace(/<style[\s\S]*?<\/style>/gi, " ");
// Comments are stripped FIRST and deliberately. `<[^>]+>` does not remove a
// comment that contains a `>` of its own — and the build comment beside the
// hero says "κ > 0" — so half of it survived into what this file calls the
// page's TEXT. Two checks read that text: the animation-constant check refused
// a number that only ever appeared in a source comment, and the retraction
// check would have counted a string hidden in a comment as one a reader can
// see, which is the exact case it exists to catch.
const text = html
  .replace(/<!--[\s\S]*?-->/g, " ")
  .replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&[a-z]+;|&#\d+;/gi, " ")
  .replace(/\s+/g, " ")
  .trim();
// And the same content again, but kept as TEXT NODES rather than flattened
// into one blob (SHELL.md r12). Collapsing every tag to a space welds the end
// of one text node onto the start of the next, so a phrase can be counted that
// no reader ever sees as a phrase — `<td>All</td><td>103 laws</td>` reads as
// "All 103 laws" to a blob and as two cells to a person. The retraction counts
// below run over this instead, and a blocklisted phrase therefore cannot span
// an element boundary. Measured when it was introduced: on this artifact both
// extractions return the same four counts, so the bounds that were firing are
// still firing — the fix closes a hole, it does not paper over a dead check.
const textNodes = html
  .replace(/<!--[\s\S]*?-->/g, "")
  .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, "")
  .split(/<[^>]+>/)
  .map((s) => s.replace(/&[a-z]+;|&#\d+;/gi, " ").replace(/\s+/g, " ").trim())
  .filter(Boolean)
  .join("\n");


// PUB2, artifact side. Two halves of one rule: urgency the record cannot date
// is unprintable, and the single dated string it CAN earn must be the derived
// one. "Limited time" is not refused because urgency is dishonest — it is
// refused because a record that holds an end date can say the date instead.
{
  const URGENCY = /\b(limited time|limited-time|act now|hurry|while it lasts|last chance|don'?t miss(?: out)?|ends soon|going fast|only \d+ (?:left|remaining))\b/i;
  const u = text.match(URGENCY);
  if (u) {
    artifactErrors.push(`PUB2 — the page says "${u[0]}". Urgency the record cannot date is scarcity theatre: print the date the offer actually holds, or say nothing.`);
  }
  const earned = new Set(offerSuffix.values());
  for (const m of text.matchAll(/Free until [0-9]{4}-[0-9]{2}-[0-9]{2}/g)) {
    if (!earned.has(m[0])) artifactErrors.push(`PUB2 — the page prints "${m[0]}" and no publication record derives it`);
  }
}

// PUB6 — a chapter count typed in prose where a derived one exists. The page
// may state how many chapters the book has; it may not state a DIFFERENT
// number from the one the registry answers with.
for (const p of pubs) {
  const want = p.derived_counts?.chapters;
  if (!Number.isInteger(want)) continue;
  for (const m of text.matchAll(/(\d+)\s+(chapters|patterns)\b/gi)) {
    if (Number(m[1]) !== want) {
      artifactErrors.push(`PUB6 — the page says "${m[0]}" and the registry derives ${want} chapters. Render the derived count, never a typed one.`);
    }
  }
}

// PUB8 — an edition number may not reach the page while the edition is
// unruled. "0.1" was defined as the WITNESSED set and was never re-ruled after
// the catalog shipped complete, so printing it would publish a label whose
// meaning has moved.
for (const p of pubs) {
  if (p.edition_ruled || !p.edition) continue;
  // Scoped to the BOOK's vocabulary on purpose. The first draft of this gate
  // matched /(edition|version|v)\s*0\.1/ and refused the page for PULSE v0.1,
  // Embodiment v0.1 and SCOPE v0.1 — three protocol versions with nothing to do
  // with the book. A gate that cries wolf gets switched off, so it matches only
  // the word an edition is actually written with.
  const n = p.edition.replace(/\./g, "\\.");
  const pat = new RegExp(`\\bedition\\s*${n}\\b|\\b${n}\\s*edition\\b`, "i");
  if (pat.test(text)) {
    artifactErrors.push(`PUB8 — the page prints edition ${p.edition} for ${p.id} while edition_ruled is false. Rule the edition or do not print it.`);
  }
}

// ---- SHARED1: site.css is not this page's private stylesheet ------------
// `/styles/site.css` is loaded by other pages in this repository, and a class
// added here lands on every one of them. `.book` did exactly that: the catalog
// at /patterns/ has its own top-level <div class="book">, and this page's new
// 3-D rule squeezed it to 205px and rotated it in three dimensions. The page
// built green, every gate passed, and the damage was on a DIFFERENT page —
// which nothing here was looking at.
//
// The intersection is small enough to name: seven classes are shared on
// purpose (playground.html deliberately wears the shell's band, rung and
// button), and anything else that collides is an accident.
{
  // Deliberate sharing, each with a reason. playground.html wears the shell's
  // band, rung and buttons; and the four animation classes are shared because
  // /patterns/ draws the SAME identifying graph as its chapter banner and wants
  // the same colours, widths and easing — one stylesheet rule for one drawing,
  // which is the opposite of the .book accident this gate exists to catch.
  const SHARED_ON_PURPOSE = new Set(["band", "btn", "covers", "ok", "rung", "tag", "where", "ida", "idh", "idt", "idn"]);
  const declared = new Set([...css.replace(/\/\*[\s\S]*?\*\//g, " ").matchAll(/\.([A-Za-z][\w-]*)/g)].map((m) => m[1]));
  const others = [];
  for (const rel of ["patterns/index.html", "playground.html", "invariants.html", "scope.html", "404.html"]) {
    const p = resolve(site_root, rel);
    if (!existsSync(p)) continue;
    const h = readFileSync(p, "utf8");
    if (!h.includes("/styles/site.css")) continue;
    const used = new Set();
    for (const m of h.matchAll(/class="([^"]+)"/g)) for (const c of m[1].split(/\s+/)) if (c) used.add(c);
    others.push([rel, used]);
  }
  if (!others.length) artifactErrors.push("SHARED1 — no other page was found loading /styles/site.css, so this check has nothing to protect and cannot fail");
  for (const [rel, used] of others) {
    for (const c of used) {
      if (!declared.has(c) || SHARED_ON_PURPOSE.has(c)) continue;
      artifactErrors.push(`SHARED1 — site.css styles ".${c}" and ${rel} uses that class too. This stylesheet is shared: a rule written for this page lands on that one. Namespace the class, or add it to the shared list if the styling is meant for both.`);
    }
  }
}

// ---- the book, on the ARTIFACT (COV2–COV4) ------------------------------
// COV2 USED TO measure every <text> on the jacket against the width it had,
// because SVG text does not wrap: an overlong string is clipped at the edge
// with valid markup, a green gate list and no report, and that is exactly what
// the footer did — "32 chapters · one mark each · released on the web" shipped
// as "…released on th". That rule is retired here because its SUBJECT MOVED:
// the jacket is HTML now, and HTML wraps. Retiring it is recorded rather than
// quiet, because a gate that silently loses its subject is a gate nobody
// notices is gone.
//
// What replaces it is the defect one level up: the title, the subtitle and the
// link were all TYPED into the jacket while the publication record held them.
{
  const book = markup.match(/<a class="osbook-link"[^>]*>([\s\S]*?)<\/a>/);
  if (!book) artifactErrors.push("COV2 — the artifact draws no book, so nothing here is protected");
  else {
    const pub = pubs.find((p) => p.registry && p.derived_counts);
    const inner = book[1];
    const txt = (cls) => {
      const m = inner.match(new RegExp(`<span class="${cls}"[^>]*>([^<]*)<`));
      return m ? m[1].replace(/&amp;/g, "&").trim() : null;
    };
    const title = txt("osbook-title");
    const sub = txt("osbook-sub");
    if (pub && title !== pub.title) {
      artifactErrors.push(`COV2 — the jacket is titled "${title}" and the record says "${pub.title}". The book's own name is not a writing choice.`);
    }
    if (pub && pub.subtitle && sub !== pub.subtitle) {
      artifactErrors.push(`COV2 — the jacket's subtitle is "${sub}" and the record says "${pub.subtitle}"`);
    }
    // COV4 — the book OPENS. A cover that only opens under JavaScript is a
    // picture of a book; this one is a link, so it works with scripting off,
    // on a keyboard, and in a new tab from the context menu.
    const href = (book[0].match(/href="([^"]+)"/) || [])[1];
    if (!href) artifactErrors.push("COV4 — the book is not a link. A cover that only opens under script is a picture of a book.");
    else {
      const want = String(pub ? pub.home : "").replace(/^https?:\/\/opensentience\.org/i, "") || null;
      if (want && href !== want) {
        artifactErrors.push(`COV4 — the book opens "${href}" and the record's home is "${pub.home}" (same-origin path "${want}")`);
      }
    }
    // COV3 — the jacket may not promise a file the record has no download for.
    // NARROWED, on Travis's call 2026-09-12. Its first version also refused a
    // spine, a page edge and a tilt, reasoning that they draw an object you
    // could hold. That over-reached: a 3-D render is how every book on every
    // store page is shown, web-only ones included — a presentation convention,
    // not a claim about a file. The claim is what this gate is for, and the
    // claim is made in words.
    const downloadable = pubs.some((p) => p.delivery === "download" || p.delivery === "both");
    if (!downloadable) {
      const IMPLIES_FILE = /\b(download|downloadable|pdf|epub|mobi|paperback|hardcover|hardback|print edition|ships|order (?:your|a) copy)\b/gi;
      // NEGATIONS are skipped. The first version refused this very page,
      // whose caption explains that there IS no file to download — and a gate
      // that refuses the sentence denying a promise teaches the next person to
      // delete the denial, which is the PUB8 cry-wolf failure with the stakes
      // reversed.
      const NEGATED = /\b(no|not|never|without|neither|nothing)\b[^.]{0,28}$/i;
      const claims = [
        inner.replace(/<[^>]+>/g, " "),
        ...[...markup.matchAll(/<title[^>]*id="cover-name"[^>]*>([\s\S]*?)<\/title>/g)].map((t) => t[1]),
      ].join(" \u00b7 ").replace(/\s+/g, " ");
      for (const m of claims.matchAll(IMPLIES_FILE)) {
        if (NEGATED.test(claims.slice(0, m.index))) continue;
        artifactErrors.push(`COV3 — the book says "${m[0]}" and no publication has a download. A jacket that promises a file is the Download verb drawn instead of written, and PUB1/PUB3 refuse it written.`);
      }
    }
  }
}

// ── Gate 3b: the seven-section architecture, gated on the ARTIFACT ───────
// OPENSENTIENCE_SURFACE §3 approved seven units: the hero and six numbered
// sections, with the references as an unnumbered appendix. Written as rules
// because an information architecture reached by one editing pass is an
// architecture that drifts back: this page had TEN top-level sections against
// an approved seven, and nothing anywhere said so.
//
// The heading count is deliberately NOT gated. The brief called this a
// "45-heading research-paper structure"; measured per section, 26 of those 45
// were in two sections and 15 of them were the twelve protocol cards' own h3
// titles — correct markup for a card grid. A gate on the total would have been
// satisfied by demoting card titles out of headings, which is an accessibility
// regression dressed as a structural win. What was actually wrong was the
// number of SECTIONS, so that is what is bounded.
{
  const APPROVED = 6; // numbered sections; the hero is the seventh unit
  const mainStart = markup.indexOf("<main");
  const mainEnd = markup.indexOf("</main>");
  const inMain = mainStart >= 0 && mainEnd > mainStart ? markup.slice(mainStart, mainEnd) : "";
  const numbered = [...inMain.matchAll(/<div class="section-label"><span class="sec-num">(\d+)<\/span>\s*([^<]*)<\/div>/g)];
  const unnumbered = [...inMain.matchAll(/<div class="section-label">(?!<span class="sec-num">)([^<]*)<\/div>/g)];
  if (numbered.length !== APPROVED) {
    artifactErrors.push(`SEC1 — the page carries ${numbered.length} numbered sections and the approved architecture has ${APPROVED} (plus the hero, plus an unnumbered appendix). Fold a section or change the architecture; do not let the page and §3 disagree.`);
  }
  if (unnumbered.length > 1) {
    artifactErrors.push(`SEC1 — ${unnumbered.length} unnumbered section labels. One appendix is the exception the architecture allows; two is a way of adding sections without counting them.`);
  }
  // SEC2 — the numbers are a sequence, and they are the spine's sequence. A
  // section that prints 04 while the rail calls it 03 is two documents.
  const seen = numbered.map((m) => Number(m[1]));
  for (const [i, n] of seen.entries()) {
    if (n !== i + 1) artifactErrors.push(`SEC2 — the ${i + 1}th numbered section prints ${String(n).padStart(2, "0")}. The numbers are the reader's position, not a label.`);
  }
  // SEC3 — the rail and the eyebrow are ONE name. They were typed separately
  // and disagreed: the rail said "Proof" where the page said "The Receipts".
  const rail = [...markup.matchAll(/data-spine="([^"]+)"[^>]*><span class="spine-num">(\d+)<\/span><span class="spine-label">([^<]*)</g)];
  if (rail.length !== APPROVED) {
    artifactErrors.push(`SEC3 — the spine rail lists ${rail.length} sections and the page numbers ${numbered.length}. The rail is the page's own table of contents; a rail that does not match it is a map of a different page.`);
  }
  for (const [i, r] of rail.entries()) {
    const want = numbered[i];
    if (!want) continue;
    if (r[3].trim() !== want[2].trim()) {
      artifactErrors.push(`SEC3 — the rail calls section ${r[2]} "${r[3].trim()}" and the section calls itself "${want[2].trim()}". One name.`);
    }
  }
  // SEC4 — every id the architecture folded away still answers. Nothing was
  // cut to reach six, so every anchor that ever worked has to keep working —
  // including /#kappa, which two other pages on this site have been linking to
  // and which this page has never had.
  for (const id of ["gap", "loop", "protocols", "stack", "proof", "status", "references", "kappa"]) {
    if (!new RegExp(`\\bid="${id}"`).test(markup)) {
      artifactErrors.push(`SEC4 — nothing on the page has id="${id}", and something links to it. Folding a section keeps its anchor; that is the difference between folding and cutting.`);
    }
  }
}

// ── Gate 3a: the four accessibility rules, gated on the ARTIFACT ─────────
// Each of these was a MEASURED defect on the built page (GATE3_BASELINE.md),
// not a checklist item copied from a standard. They are written as rules
// rather than repairs so the defect cannot come back: a repair is a commit, a
// rule is a refusal.
//
// One honest bound, stated once and not repeated below: these read the STATIC
// artifact. <amp-nav> hydrates client-side, so "first focusable element" means
// first in the markup this build emits. That is sound here only because
// amp-nav.js never touches document.body — it renders inside its own element,
// which is already after the skip link. If that ever changes, this gate goes
// quiet rather than red, and it is the one weakness it has.

// A11Y1 — a skip link that a keyboard can reach, pointing at a real <main>.
{
  const mains = [...markup.matchAll(/<main\b([^>]*)>/g)];
  if (mains.length !== 1) {
    artifactErrors.push(`A11Y1 — the page has ${mains.length} <main> element(s). A skip link needs exactly one target, and a screen reader's "jump to main" needs exactly one destination.`);
  } else {
    const attrs = mains[0][1];
    const id = (attrs.match(/\bid="([^"]+)"/) || [])[1];
    if (!id) artifactErrors.push("A11Y1 — <main> carries no id, so nothing can link to it");
    // Browsers refuse to move keyboard focus to a non-interactive element on a
    // hash jump. Without this the link scrolls, the focus ring stays up in the
    // navigation, and the next Tab lands back where the user just escaped —
    // which looks exactly like a working skip link to anyone using a mouse.
    if (!/\btabindex="-1"/.test(attrs)) {
      artifactErrors.push('A11Y1 — <main> is not tabindex="-1". The page will scroll and the focus will not follow, which is the failure that looks like a pass.');
    }
    const body = markup.slice(markup.indexOf("<body>"));
    const skip = body.match(/<a\b([^>]*\bclass="[^"]*\bskip-link\b[^"]*"[^>]*)>/);
    if (!skip) artifactErrors.push("A11Y1 — no .skip-link in the body");
    else {
      const href = (skip[1].match(/\bhref="([^"]+)"/) || [])[1];
      if (href !== `#${id}`) artifactErrors.push(`A11Y1 — the skip link points at "${href}" and <main> is "#${id}"`);
      const firstFocusable = body.match(/<(?:a|button|select|textarea|summary)\b[^>]*>|<input\b(?![^>]*type="hidden")[^>]*>/i);
      if (!firstFocusable || firstFocusable.index !== skip.index) {
        artifactErrors.push(`A11Y1 — the skip link is not the first focusable element in <body> (that is "${(firstFocusable || ["(none)"])[0].slice(0, 70)}"). Anything focusable before it is a block the skip link cannot bypass.`);
      }
      const nameText = body.slice(skip.index).match(/>([\s\S]*?)<\/a>/);
      if (!nameText || !nameText[1].replace(/<[^>]+>/g, " ").trim()) artifactErrors.push("A11Y1 — the skip link has no text");
    }
    // The stylesheet half. Markup alone cannot tell you whether the link ever
    // becomes visible, and an invisible skip link is 2.4.1 failed with the
    // markup of a pass.
    const sheet = css.replace(/\/\*[\s\S]*?\*\//g, " ");
    const base = sheet.match(/(?:^|[};])\s*\.skip-link\s*\{([^}]*)\}/);
    const focused = sheet.match(/(?:^|[};])\s*\.skip-link:focus(?:-visible)?\s*\{([^}]*)\}/);
    if (!base) artifactErrors.push("A11Y1 — .skip-link has no rule in the stylesheet at all");
    else if (/(^|;)\s*display\s*:\s*none|(^|;)\s*visibility\s*:\s*hidden/.test(base[1])) {
      artifactErrors.push("A11Y1 — the skip link is display:none or visibility:hidden. Both remove it from the keyboard, which is the only device that uses it.");
    }
    if (!focused) {
      artifactErrors.push("A11Y1 — .skip-link has no :focus rule, so it never comes back on screen. Off-screen and staying there is not a skip link, it is a hidden link.");
    } else if (base) {
      // and the :focus rule must actually undo the displacement
      const off = (prop) => {
        const m = base[1].match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*(-?[\\d.]+)`));
        return m ? parseFloat(m[1]) : null;
      };
      const on = (prop) => {
        const m = focused[1].match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*(-?[\\d.]+)`));
        return m ? parseFloat(m[1]) : null;
      };
      const moved = ["left", "top", "right", "bottom"].some((prop) => {
        const o = off(prop), n = on(prop);
        return o !== null && o < 0 && n !== null && n >= 0;
      }) || /transform\s*:/.test(focused[1]) || /clip(-path)?\s*:/.test(focused[1]);
      if (!moved) {
        artifactErrors.push("A11Y1 — .skip-link:focus exists but brings nothing back on screen: no off-screen offset is returned to a non-negative value and no transform or clip is released.");
      }
    }
    // And the stacking half, which every check above passes without.
    // The skip link shares the top-left corner with <amp-nav> — position:fixed,
    // 57px tall, painted over everything under it. A skip link beneath that bar
    // is on screen by getBoundingClientRect, focusable, correctly coloured, and
    // INVISIBLE. The markup gate passed it, the CSS gate passed it, and a
    // browser screenshot is what caught it. So the bound is derived from the
    // file that owns the number: amp-nav publishes its own stacking level as
    // --amp-nav-z, and if the nav lane raises it this build goes red instead of
    // the skip link quietly disappearing underneath.
    if (base) {
      const navSrc = resolve(site_root, "amp-nav.js");
      if (!existsSync(navSrc)) {
        artifactErrors.push("A11Y1 — amp-nav.js is not in the tree, so the skip link's stacking cannot be bounded against the fixed bar it shares a corner with");
      } else {
        const navZ = Number((readFileSync(navSrc, "utf8").match(/--amp-nav-z\s*:\s*(\d+)/) || [])[1]);
        const skipZ = Number((base[1].match(/(?:^|;)\s*z-index\s*:\s*(\d+)/) || [])[1]);
        if (!Number.isFinite(navZ)) {
          artifactErrors.push("A11Y1 — amp-nav.js no longer declares --amp-nav-z, so the number this bound is derived from is gone. Do not guess it: find where the bar's stacking moved to.");
        } else if (!Number.isFinite(skipZ)) {
          artifactErrors.push(`A11Y1 — .skip-link declares no z-index and <amp-nav> is fixed at ${navZ}. Unstacked, the link paints under the bar.`);
        } else if (skipZ <= navZ) {
          artifactErrors.push(`A11Y1 — .skip-link is z-index ${skipZ} and amp-nav declares --amp-nav-z: ${navZ}. The bar is position:fixed over the same corner, so the link focuses, reads as on-screen, and cannot be seen.`);
        }
        if (!/(?:^|;)\s*position\s*:\s*fixed/.test(base[1])) {
          artifactErrors.push("A11Y1 — .skip-link is not position:fixed. The bar it has to clear is, so an absolutely positioned link scrolls away from the corner it was placed to clear.");
        }
      }
    }
  }
}

// A11Y2 — the heading outline, and the filler that would fake one.
// The two halves belong together on purpose. A gate that only checked the
// sequence can be satisfied by dropping an empty <h3> in front of the skip,
// which produces a clean outline and an extra announced heading that says
// nothing — the repair being worse than the defect. Refusing empty headings is
// what makes the sequence rule mean "get the structure right".
{
  const heads = [...markup.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/g)].map((m) => ({
    lvl: Number(m[1]),
    text: m[2].replace(/<[^>]+>/g, " ").replace(/&[a-z]+;|&#\d+;/gi, " ").replace(/\s+/g, " ").trim(),
  }));
  if (!heads.length) artifactErrors.push("A11Y2 — the page has no headings, so this check has nothing to protect");
  const h1s = heads.filter((h) => h.lvl === 1);
  if (h1s.length !== 1) artifactErrors.push(`A11Y2 — the page has ${h1s.length} <h1>; a document has exactly one`);
  for (const h of heads) {
    if (!h.text) artifactErrors.push(`A11Y2 — an empty <h${h.lvl}> reached the page. A heading with no text is a rung on a ladder with no step: it is announced, it is navigated to, and it says nothing.`);
  }
  let prev = 0;
  for (const h of heads) {
    if (prev && h.lvl > prev + 1) {
      artifactErrors.push(`A11Y2 — the heading outline jumps h${prev} → h${h.lvl} at "${h.text.slice(0, 50)}". Give the section the level it actually has; do not insert an empty heading to close the gap.`);
    }
    prev = h.lvl;
  }
}

// A11Y3 — every <svg> is in exactly one of two states: hidden from assistive
// technology, or carrying a name. There is no third state, and the third state
// is what shipped: an unnamed, unhidden graphic is announced as "image" with
// nothing after it, which is worse than either.
for (const m of markup.matchAll(/<svg\b([^>]*)>/g)) {
  const a = m[1];
  const hidden = /\baria-hidden="true"/.test(a);
  const named = /\baria-label="[^"]+"/.test(a) || /\baria-labelledby="[^"]+"/.test(a);
  const where = (a.match(/\bclass="([^"]+)"/) || a.match(/\bviewBox="([^"]+)"/) || [, "?"])[1];
  if (hidden && named) artifactErrors.push(`A11Y3 — the <svg> (${where}) is both aria-hidden and named. One of the two is a lie about whether it carries information.`);
  if (!hidden && !named) artifactErrors.push(`A11Y3 — the <svg> (${where}) is neither aria-hidden="true" nor named. Decide which it is: decoration gets hidden, information gets a name.`);
}

// A11Y4 — and the name on the informational one is DERIVED, not typed.
{
  const ring = markup.match(/<svg\b([^>]*\bclass="[^"]*\bloop-ring\b[^"]*"[^>]*)>([\s\S]*?)<\/svg>/);
  if (!ring) artifactErrors.push("A11Y4 — the artifact draws no .loop-ring, so the name this gate protects cannot be checked");
  else {
    const [, attrs, inner] = ring;
    if (!/\brole="img"/.test(attrs)) artifactErrors.push('A11Y4 — the .loop-ring carries information and does not declare role="img", so assistive technology walks into it and reads the loose numbers inside as content');
    const lb = (attrs.match(/\baria-labelledby="([^"]+)"/) || [])[1];
    const al = (attrs.match(/\baria-label="([^"]+)"/) || [])[1];
    let got = null;
    if (lb) {
      const t = inner.match(new RegExp(`<title\\s+id="${lb.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\s*>([\\s\\S]*?)</title>`));
      if (!t) artifactErrors.push(`A11Y4 — the .loop-ring is labelled by "${lb}" and no <title id="${lb}"> is inside it. A name that points at nothing is not a name, and it resolves to nothing silently.`);
      else got = t[1];
    } else if (al) got = al;
    else artifactErrors.push("A11Y4 — the .loop-ring declares role=img and has no accessible name");
    if (got !== null) {
      const unesc = (x) => x.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
      if (unesc(got).trim() !== ringName) {
        artifactErrors.push(`A11Y4 — the .loop-ring is named "${unesc(got).slice(0, 70)}…" and loop.json derives "${ringName.slice(0, 70)}…". The ring is a picture of the list beside it: name it from the data, or a renamed phase moves the list and leaves the name behind.`);
      }
    }
  }
}

// No page advertises a mailbox, and no bare address either.
const mailtos = html.match(/mailto:[^"'<> ]*/gi);
if (mailtos) artifactErrors.push(`the artifact advertises ${mailtos.join(", ")} — no mailto:, Travis's call 2026-08-11`);
const bareEmail = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
if (bareEmail) artifactErrors.push(`a bare email address reached the page: ${bareEmail[0]}`);

// Nothing unrendered survived.
const leftover = html.match(/\{\{[A-Z_]+\}\}/g);
if (leftover) artifactErrors.push(`unrendered token(s) in the artifact: ${[...new Set(leftover)].join(", ")}`);

// Every rung on the artifact is a real rung, and the chip's text is its
// attribute. Scanned over the MARKUP only — the stylesheet contains the
// selector .rung[data-rung="?"], and a scan over the whole file would match it.
const chips = [...markup.matchAll(/<span class="rung" data-rung="([^"]*)"[^>]*>([^<]*)</g)];
if (!chips.length) artifactErrors.push("no rung chip in the artifact — the band is the one thing every surface must carry");
for (const [, attr, label] of chips) {
  if (![...RUNGS, "?"].includes(attr)) artifactErrors.push(`bad data-rung "${attr}" in the artifact`);
  if (label.trim() !== attr) artifactErrors.push(`rung chip attribute "${attr}" but text "${label.trim()}"`);
}
if (!markup.includes(`data-rung="${rung}"`)) artifactErrors.push(`the derived rung is "${rung}" and the band does not show it`);

// The band bounds what the chip covers.
const bandMatch = markup.match(/<div class="band"[^>]*>([\s\S]*?)<\/div>/);
if (!bandMatch) artifactErrors.push("no placement band in the artifact");
else {
  const covers = bandMatch[1].match(/class="covers">([\s\S]*?)<\/span>/);
  if (!covers || covers[1].replace(/<[^>]+>/g, "").trim().length < 40) {
    artifactErrors.push("the band's covers span is missing or too short to bound anything");
  }
  if (surface.tier !== 4 && !bandMatch[1].includes(`<b>${surface.layer}</b>`)) {
    artifactErrors.push(`the band does not state the layer "${surface.layer}"`);
  }
}

// The verb table, enforced on the emitted CTA groups.
for (const g of markup.matchAll(/<div class="ctagroup">([\s\S]*?)<\/div>\s*<\/div>/g)) {
  const r = (g[1].match(/class="tag(?: ok)?">([a-z_]+)/) || [])[1];
  if (!VERBS[r]) { artifactErrors.push(`a CTA group on the page declares an unknown rung "${r}"`); continue; }
  // A card that cites a publication is answerable to the publication table
  // (PUB3 below), not the rung's — matched on the anchor so the marker and the
  // verb are read from the same element and cannot drift apart.
  for (const m of g[1].matchAll(/<a\b([^>]*)>\s*<span class="verb">([^<]+)</g)) {
    if (/\bdata-publication=/.test(m[1])) continue;
    if (!VERBS[r].includes(m[2].trim())) {
      artifactErrors.push(`CTA "${m[2].trim()}" is not available at rung ${r} — allowed: ${VERBS[r].join(" · ")}`);
    }
  }
}

// PUB3, artifact side. The record was checked above; this re-reads the EMITTED
// page, because a template can print a verb the record never held — which is
// the same reason the rung chip is re-read out of the markup rather than
// trusted from the data.
for (const m of markup.matchAll(/<a\b[^>]*\bdata-publication="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
  const id = m[1];
  // Both shapes the page uses: a CTA card with a .verb span, and a hero button
  // whose whole label is the verb. Either way the verb is read off the EMITTED
  // element, never trusted from the record.
  const inner = m[2];
  const verb = (inner.match(/<span class="verb">([^<]*)</) || [, inner.replace(/<[^>]+>/g, "")])[1];
  if (!bookVerb.has(id)) {
    artifactErrors.push(`PUB3 — the page carries a CTA for publication "${id}", which derives no verb`);
    continue;
  }
  // Against renderVerb, not bookVerb: after an offer expires the page is
  // SUPPOSED to move off the contract verb, and comparing to the contract
  // would refuse the very transition PUB2 exists to produce.
  if (verb.trim() !== renderVerb.get(id)) {
    artifactErrors.push(`PUB3 — the page says "${verb.trim()}" for ${id} and the record derives "${renderVerb.get(id)}"`);
  }
}


// MAP2 — every status token the map prints is one protocols.json actually uses.
// Read off the EMITTED chips, not the data, because a template can invent a
// label the record never held.
for (const m of markup.matchAll(/class="map-chip[^"]*" data-status="([^"]+)"/g)) {
  if (m[1] !== "none" && !STATUSES.has(m[1])) {
    artifactErrors.push(`MAP2 — the stack map prints status "${m[1]}", which is not in protocols.json's vocabulary`);
  }
}

// MAP1 — no node reaches the page without a chip of some kind.
for (const m of markup.matchAll(/<div class="stack-layer [^"]*" data-node="([^"]+)">([\s\S]*?)<\/div>\s*<\/div>/g)) {
  if (!/class="map-chip/.test(m[2])) {
    artifactErrors.push(`MAP1 — the stack map draws node "${m[1]}" with no status chip`);
  }
}

// MAP4 — the page draws each edge in the state the record earns, and no other.
// Three states now, so "not solid" is no longer the whole check.
{
  const earned = new Map(stackEdges.map((e) => [`${e.from}>${e.to}`, e.state]));
  for (const m of markup.matchAll(/data-edge-state="([a-z]+)" data-from="([^"]+)" data-to="([^"]+)"/g)) {
    const [, drawn, from, to] = m;
    const want = earned.get(`${from}>${to}`);
    if (want === undefined) { artifactErrors.push(`MAP4 — the page draws an edge ${from}→${to} the record does not declare`); continue; }
    if (drawn !== want) {
      artifactErrors.push(`MAP4 — the page draws ${from}→${to} as "${drawn}" and the record earns "${want}"`);
    }
  }
  const drawnKeys = new Set([...markup.matchAll(/data-from="([^"]+)" data-to="([^"]+)"/g)].map((m) => `${m[1]}>${m[2]}`));
  for (const k of earned.keys()) if (!drawnKeys.has(k)) artifactErrors.push(`MAP4 — the record declares edge ${k.replace(">", "→")} and the page does not draw it`);
  // MAP6, artifact side: the heading, then every non-solid legend row.
  const headM = markup.match(/<div class="stack-edges-head">([^<]*)</);
  if (headM && PROOF_WORDS.test(headM[1])) {
    artifactErrors.push(`MAP6 — the edge list heading on the page claims proof: "${headM[1].trim()}"`);
  }
  // no state but `solid` may print the language of proof.
  for (const m of markup.matchAll(/<div class="legend-row legend-([a-z]+)"><span class="legend-key">([^<]*)<\/span><span class="legend-means">([^<]*)</g)) {
    if (m[1] === "solid") continue;
    if (/\b(witness(?:ed|es|ing)?|verif(?:ied|ies)|proved|proven|confirms?)\b/i.test(m[2] + " " + m[3])) {
      artifactErrors.push(`MAP6 — the legend describes "${m[1]}" with the language of proof: "${m[3]}"`);
    }
  }
}

// The identifying animation exists, asserts nothing, and can actually find the
// nodes it drives (SHELL.md §8.5). The middle check is the `12 Active
// Pathfinders` defect mechanised: a decorative canvas's loop bound was
// published as a live user metric on a sibling domain for months.
// Not "at least one". The page draws this graph twice by design — behind the
// hero as the site's identifying mark, and as the book's cover art — and a
// presence test passes while either one is missing, because the other is still
// there. A probe that deleted the hero's marker BUILT ANYWAY. So each one is
// required where it belongs, which is a structural claim rather than a count.
{
  const hero = html.match(/<header class="hero[\s\S]*?<\/header>/);
  if (!hero) artifactErrors.push("the landing page has no hero to carry the identifying animation");
  else if (!/data-identity-animation/.test(hero[0])) artifactErrors.push("the hero has no [data-identity-animation] element — the site's identifying mark is gone from the one place SHELL.md §8 requires it");
  // The hero's identifying mark and the book's cover art are now ONE element:
  // the book stands above the fold and the graph is printed on its jacket. So
  // the rule is that the mark lives on the cover, inside the hero — losing it
  // empties the jacket and removes the mark in the same stroke.
  const front = html.match(/<span class="osbook-face osbook-front"[\s\S]*?<\/svg>/);
  if (!front) artifactErrors.push("the book has no front cover to carry its art");
  else if (!/data-identity-animation/.test(front[0])) artifactErrors.push("the book's cover has no [data-identity-animation] element — the jacket would ship blank and nothing else would say so");
  else if (hero && !hero[0].includes(front[0].slice(0, 60))) {
    artifactErrors.push("the book is not in the hero — it was moved above the fold on purpose, and a cover five sections down is the thing that change undid");
  }
}
const constBlock = idanim.match(/IDENTITY-CONSTANTS-START([\s\S]*?)IDENTITY-CONSTANTS-END/);
if (!constBlock) artifactErrors.push("build/idanim.js declares no IDENTITY-CONSTANTS block");
else {
  const nums = [...constBlock[1].matchAll(/=\s*(\d+)/g)].map((m) => m[1]);
  if (!nums.length) artifactErrors.push("the IDENTITY-CONSTANTS block is empty");
  // ISO dates are masked out first. The surrounding character classes already
  // exclude a number sitting inside a decimal, a thousands separator, a
  // currency amount or a percentage — the same judgement, that a digit buried
  // in a longer token is not a count a reader can see. A hyphen was never in
  // that list, so `2026-12-31` read as the animation's 31 nodes and refused the
  // page for an unrelated reason. Found by PUB2's dated-offer probe, whose
  // whole job is to end on a real date.
  const scanned = text.replace(/\d{4}-\d{2}-\d{2}/g, " \u2014 ");
  for (const n of nums) {
    if (new RegExp(`(^|[^\\w.,$])${n}([^\\w.,%]|$)`).test(scanned)) {
      artifactErrors.push(`animation constant ${n} also appears as text on the page — a decoration constant a reader can see is how a canvas loop bound became a published metric`);
    }
  }
}
// The drawing and the driver come from one description of the graph, and this
// checks that the description survived into the artifact intact: the counts the
// driver declares, the counts it actually produces, and the counts a visitor
// receives must be the same three numbers, and the coordinates must match too.
// If they drift the driver quietly refuses to run and the page shows a still
// graph, which is indistinguishable from a page that is merely quiet.
{
  if (IDN !== idgraph.nodes.length) artifactErrors.push(`idanim.js declares NODES=${IDN} and its own idGraph() returns ${idgraph.nodes.length}`);
  if (IDA !== idgraph.arcs.length) artifactErrors.push(`idanim.js declares ARCS=${IDA} and its own idGraph() returns ${idgraph.arcs.length}`);
  // PER ROOT, not per page. The graph is drawn twice now — behind the hero and
  // as the book's cover art — and the driver mounts each root separately, so a
  // page-wide count would read 62 against a driver that expects 31 from each.
  // Counting the whole page would ALSO hide the case this is really for: one
  // root complete and the other missing an arc sums to the right total.
  // Matched on the ATTRIBUTE the driver actually uses, not on a tag or a class.
  // The first version required `<div class="...idanim...">`, and the book's
  // cover art is a <span> that does not carry that class — so the second root
  // was silently not counted at all, which is the failure mode this whole block
  // exists to prevent. `roots.length` is asserted against the driver's own
  // query below for the same reason.
  const roots = [...html.matchAll(/data-identity-animation[^>]*>([\s\S]*?)<\/svg>/g)];
  const declared = (html.match(/data-identity-animation/g) || []).length;
  if (!roots.length) artifactErrors.push("no [data-identity-animation] root could be extracted to count");
  else if (roots.length !== declared) {
    artifactErrors.push(`the page declares ${declared} [data-identity-animation] root(s) and only ${roots.length} could be extracted to count. An uncounted root is an unchecked one.`);
  }
  roots.forEach((r, i) => {
    const where = roots.length > 1 ? ` (root ${i + 1} of ${roots.length})` : "";
    const count = (re) => (r[1].match(re) || []).length;
    const nodesInSvg = count(/<circle class="idn"/g);
    const arcsInSvg = count(/<path class="ida"/g);
    const headsInSvg = count(/<path class="idh"/g);
    const tracesInSvg = count(/<path class="idt"/g);
    if (nodesInSvg !== IDN) artifactErrors.push(`the artifact draws ${nodesInSvg} graph nodes and the driver expects ${IDN}${where}`);
    if (arcsInSvg !== IDA) artifactErrors.push(`the artifact draws ${arcsInSvg} arcs and the driver expects ${IDA}${where}`);
    if (headsInSvg !== IDA) artifactErrors.push(`the artifact draws ${headsInSvg} arrowheads and the driver expects ${IDA}${where}`);
    if (tracesInSvg !== IDA) artifactErrors.push(`the artifact draws ${tracesInSvg} trace overlays and the driver expects ${IDA}${where} — the driver refuses to run if these disagree, and a still graph is indistinguishable from a quiet one`);
  });
  // The trace layer must ship silent AND drivable. Silent, because with
  // scripting off a row of dashes lying over the graph is decoration nobody
  // asked for; drivable, because the moment its opacity moves into the
  // stylesheet the driver's presentation attribute stops winning and the
  // traces never appear — with no error anywhere, on a page whose whole
  // argument is that a silent failure is the expensive kind.
  {
    const idt = html.match(/<path class="idt"[^>]*>/g) || [];
    const quiet = idt.filter((t) => /\sopacity="0"/.test(t)).length;
    const dashed = idt.filter((t) => /\sstroke-dasharray="[\d.]+ [\d.]+"/.test(t)).length;
    if (idt.length && quiet !== idt.length) artifactErrors.push(`${idt.length - quiet} trace overlay(s) do not ship opacity="0" — with scripting off they would draw over the graph`);
    if (idt.length && dashed !== idt.length) artifactErrors.push(`${idt.length - dashed} trace overlay(s) carry no stroke-dasharray — the driver writes only the offset, so an overlay without a pattern is a whole arc lighting up at once`);
    if (/\.idt\s*\{[^}]*opacity\s*:/.test(css)) artifactErrors.push("site.css sets opacity on .idt — a stylesheet declaration beats the presentation attribute the driver writes, so every trace would be invisible and nothing would report it");
  }
  // Coordinates, not just counts: a template that rounds differently, or an
  // artifact edited by hand, puts the arcs somewhere the driver did not.
  for (const n of idgraph.nodes) {
    if (!html.includes(`cx="${n.x}" cy="${n.y}"`)) {
      artifactErrors.push(`the artifact has no graph node at ${n.x},${n.y} — the drawing no longer matches the geometry the driver computes`);
      break;
    }
  }
  for (const a of idgraph.arcs) {
    if (!html.includes(`d="${a.d}"`)) {
      artifactErrors.push(`the artifact is missing arc ${a.a}→${a.b} — the drawing no longer matches the geometry the driver computes`);
      break;
    }
  }
  // Nothing in the animation may be a long horizontal stroke. That is not a
  // style preference — it is the defect this animation exists because of: a
  // ladder of 29 of them read as ruled notebook paper, and its two rails were
  // reported as stray <hr>s on a page that has no <hr> at all.
  //
  // The bound was 72 px of a 300-wide box, chosen when the longest
  // near-horizontal arc was 51.5. The arc chooser now refuses such a pair
  // outright above 50 px, and the graph it produces contains NO arc within 8°
  // of horizontal at any length — so the bound comes down to 60, which still
  // clears the source's own limit and refuses a real regression rather than
  // waiting for one 40 % worse than the shape it is guarding against.
  const HMAX = 60;
  const wide = idgraph.arcs.filter((a) => {
    const A = idgraph.nodes[a.a], B = idgraph.nodes[a.b];
    const deg = Math.abs((Math.atan2(B.y - A.y, B.x - A.x) * 180) / Math.PI);
    return Math.min(deg, 180 - deg) < 8 && Math.hypot(B.x - A.x, B.y - A.y) > HMAX;
  });
  if (wide.length) {
    const worst = Math.max(...wide.map((a) => Math.hypot(idgraph.nodes[a.b].x - idgraph.nodes[a.a].x, idgraph.nodes[a.b].y - idgraph.nodes[a.a].y)));
    artifactErrors.push(`${wide.length} arc(s) run within 8° of horizontal for more than ${HMAX} px (worst ${worst.toFixed(0)}) — that is the ruled-paper defect coming back`);
  }
  // And the ladder was literally made of <line>; this graph is paths and
  // circles. A <line> inside the animation is the old shape returning.
  // Extracted by the ATTRIBUTE, not by `<div class="idanim">`. When the hero's
  // ambient graph became the book's cover art there was no longer any element
  // with that class, so this match returned "" and the check silently had
  // nothing to test — a gate that loses its subject reads exactly like a gate
  // that passes. A probe that planted a <line> BUILT ANYWAY, which is how it
  // was caught.
  const idsvgs = [...html.matchAll(/data-identity-animation[\s\S]*?<\/svg>/g)].map((m) => m[0]);
  if (!idsvgs.length) artifactErrors.push("no identifying animation could be extracted to check for <line>");
  if (idsvgs.some((x) => /<line\b/i.test(x))) artifactErrors.push("the identifying animation contains a <line> — the ladder it replaced was 31 of them, and that is what read as ruled paper");
  if (/<hr[\s/>]/i.test(markup)) artifactErrors.push("the artifact contains an <hr> — this page has never had one, and the last thing that looked like one was the animation");
}
for (const m of idanim.matchAll(/querySelector(?:All)?\("([^"]+)"\)/g)) {
  const sel = m[1];
  // The selector forms the driver actually uses. The ancestor of this check
  // did `html.includes(sel)` for anything that was not an id, so ".idn" was
  // looked for literally, with the dot, and could never be found: a check that
  // cannot pass is as useless as one that cannot fail.
  const hit = sel.startsWith("#")
    ? html.includes(`id="${sel.slice(1)}"`)
    : sel.startsWith(".")
      ? new RegExp(`class="(?:[^"]*\\s)?${sel.slice(1)}(?:\\s[^"]*)?"`).test(html)
      : sel.startsWith("[")
        ? html.includes(sel.replace(/^\[|\]$/g, ""))
        : html.includes(sel);
  if (!hit) artifactErrors.push(`the animation looks up ${sel} and the artifact has no such node — the script would fail silently, which is indistinguishable from a page that is merely quiet`);
}

// ── the retraction blocklist, COUNTED (SHELL.md r6, hole 1) ──────────────
// Its ancestor asked "is the retraction still present?" and stopped there, so
// a page could keep its retraction AND reinstate the retracted sentence
// somewhere else and pass. That is not a hypothetical: it made a real
// deliberate-break report read PASS. So: count the occurrences and bound them
// at BOTH ends. Too many is a reinstatement; too few is a retraction that got
// deleted, which is the same defect inverted.
for (const r of retractions.entries) {
  const occurrences = (s, needle) => {
    let n = 0, i = 0;
    for (;;) {
      const at = s.indexOf(needle, i);
      if (at < 0) return n;
      n++;
      i = at + 1; // overlapping occurrences count, so a doubled phrase cannot hide
    }
  };
  const seen = occurrences(textNodes, r.string);
  if (seen < r.min || seen > r.max) {
    artifactErrors.push(
      `retracted string "${r.string}" appears ${seen}× in the page text; the bound is ${r.min}–${r.max}. ` +
        (seen > r.max
          ? `Retracted ${r.retracted_at} (${r.commit}): ${r.why}`
          : `The retraction that is entitled to name it is missing — a retraction that quietly disappears is the reinstatement, slower.`),
    );
  }
  // The blocklist applies to EVERYTHING THIS BUILD PUBLISHES, not only to the
  // page. Found by this surface's own break harness: "117 laws" was planted in
  // a comment in build/idanim.js and the build passed, because idanim.js is a
  // separate published file rather than an inlined script — so the only text
  // the blocklist read was index.html. The retraction record says an occurrence
  // "a reader cannot see" is refused; a comment in a file a visitor downloads
  // is exactly that, and three of the four published files were exempt from it.
  // Every file staged below is checked here. (amp-nav.js is deliberately not:
  // it is another repository's file, refreshed as a side effect, and this
  // repository's retractions do not govern it.)
  for (const [label, body] of [
    ["styles/site.css", css],
    ["proof.js", readFileSync(resolve(root, "build/proof.js"), "utf8")],
    ["idanim.js", idanim],
  ]) {
    const n = occurrences(body, r.string);
    if (n > 0) {
      artifactErrors.push(
        `retracted string "${r.string}" appears ${n}× in ${label}, which this build publishes — retracted ${r.retracted_at} (${r.commit}). A visitor can fetch that file; nobody reading the page can see it.`,
      );
    }
  }
  // And an occurrence a reader cannot see is refused outright — GPSCoord's
  // blocklist fired on a fabricated coordinate living in a source comment that
  // the build inlined into the shipped page.
  const hidden = occurrences(html, r.string) - seen;
  if (hidden > 0) {
    artifactErrors.push(`retracted string "${r.string}" appears ${hidden}× in the artifact where a reader cannot see it (a comment, an attribute or a script) — retracted ${r.retracted_at}`);
  }
}
// And nothing may reintroduce the observer that was deleted. Tested against the
// CODE with comments stripped — the first version of this check failed on the
// comment that records why the observer was removed, which would have taught
// the next person to delete the explanation rather than keep the rule.
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
for (const f of ["build/proof.js", "build/idanim.js"]) {
  if (/IntersectionObserver/.test(stripComments(readFileSync(resolve(root, f), "utf8")))) {
    artifactErrors.push(`${f} reintroduces an IntersectionObserver — it does not fire in a non-compositing renderer and it made the page's CONTENT depend on JavaScript`);
  }
}

// ── the contact form, on the ARTIFACT (SHELL.md r9) ─────────────────────
// The record above says what the endpoint is; this reads what a visitor gets.
// Every one of these is a thing that fails SILENTLY: a form whose action drifted
// posts into a void, a missing honeypot lets spam through with no symptom, and a
// reply paragraph without a live region is invisible to a screen reader while
// looking perfect in a screenshot.
{
  const form = (markup.match(/<form class="say"[\s\S]*?<\/form>/) || [])[0];
  if (!form) {
    artifactErrors.push("no contact form in the artifact — SHELL.md r9 makes a hosted form the correction channel on every surface");
  } else {
    const action = (form.match(/action="([^"]*)"/) || [, ""])[1];
    if (action !== surface.contact.endpoint) {
      artifactErrors.push(`the form posts to "${action}" and the record declares "${surface.contact.endpoint}" — an endpoint that drifts posts a reader's correction into a void and says nothing`);
    }
    if (!/method="POST"/i.test(form)) artifactErrors.push("the contact form has no method=\"POST\" — it would GET the endpoint and put the message in the URL");
    if (!/\snovalidate\b/.test(form)) {
      artifactErrors.push("the contact form has no novalidate — the script calls checkValidity() itself so the reply paragraph can speak; without it the browser paints its own bubbles and the reply never runs");
    }
    const gotcha = (form.match(/<input[^>]*name="_gotcha"[^>]*>/) || [])[0];
    if (!gotcha) {
      artifactErrors.push("the contact form has no _gotcha honeypot — a honeypot dropped in a refactor fails silently and invisibly, which is the whole class this gate exists for");
    } else {
      for (const attr of ['tabindex="-1"', 'autocomplete="off"', 'aria-hidden="true"']) {
        if (!gotcha.includes(attr)) artifactErrors.push(`the _gotcha honeypot is missing ${attr} — without it the field is reachable by tab or by a screen reader, and a person fills it in`);
      }
    }
    const reply = (form.match(/<p class="say-msg"[^>]*>/) || [])[0];
    if (!reply) artifactErrors.push("the contact form has no .say-msg reply paragraph");
    else {
      if (!reply.includes('role="status"')) artifactErrors.push('the reply paragraph has no role="status"');
      if (!reply.includes('aria-live="polite"')) artifactErrors.push('the reply paragraph has no aria-live="polite" — the reply would be invisible to a screen reader and look perfect in a screenshot');
    }
    if (!/<button[^>]*type="submit"/.test(form)) artifactErrors.push("the contact form has no submit button, so it cannot be submitted without a script");
    // The handler may only claim success on a real 2xx. `res.ok` is the check;
    // an optimistic "sent" printed on submit is the failure this site argues
    // against, and it is the default of most hand-rolled AJAX forms.
    const say = stripComments(readFileSync(resolve(root, "build/proof.js"), "utf8"));
    if (/querySelector\(["']\.say["']\)/.test(say)) {
      if (!/\br\.ok\b|\bres\.ok\b/.test(say)) {
        artifactErrors.push("the contact form's script never reads res.ok — success must be printed on an actual 2xx from the endpoint, never optimistically on submit");
      }
      if (!/preventDefault/.test(say)) artifactErrors.push("the contact form's script does not preventDefault, so it would both fetch AND navigate");
    } else {
      artifactErrors.push("build/proof.js does not upgrade the contact form — the form still works, but a visitor is handed to somebody else's thank-you screen");
    }
  }
}

// ── every button keeps its own colour (SHELL.md r7) ─────────────────────
// Travis found this on nine surfaces: `.top nav a{color:var(--fg2)}` is
// specificity 0,2,1 and `.btn{color:…}` is 0,1,0, so a call to action placed in
// the header paints the NAV'S link colour on the button's own saturated fill
// and becomes unreadable, while the identical button elsewhere is fine.
//
// The reason it survived every deliberate-break suite in this portfolio is that
// the contrast check above reads DECLARED TOKENS. A declared token is fine; the
// button never receives it. So this check resolves the cascade the way a
// browser does — specificity, then source order, then !important — over the
// elements that are actually in the emitted artifact, and refuses if any
// button's colour is decided by a rule that is not a button rule.
{
  const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
  // Elements of the artifact, each with the ancestor chain it sits in. A tag
  // stack over generated, well-formed markup — not a general HTML parser, and
  // it does not need to be.
  const els = [];
  {
    const stack = [];
    const re = /<(\/?)([a-zA-Z][-a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
    const body = html.replace(/<!--[\s\S]*?-->/g, " ").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
    let m;
    while ((m = re.exec(body))) {
      const [, close, rawTag, attrs, selfClose] = m;
      const tag = rawTag.toLowerCase();
      if (close) {
        for (let i = stack.length - 1; i >= 0; i--) if (stack[i].tag === tag) { stack.length = i; break; }
        continue;
      }
      const cls = (attrs.match(/\sclass="([^"]*)"/) || [, ""])[1].split(/\s+/).filter(Boolean);
      const id = (attrs.match(/\sid="([^"]*)"/) || [, ""])[1];
      const node = { tag, cls: new Set(cls), id, chain: null };
      node.chain = [...stack, node];
      els.push(node);
      if (!VOID.has(tag) && !selfClose) stack.push(node);
    }
  }

  // A selector parser and matcher for the subset this stylesheet uses:
  // descendant and child combinators, and compounds of type / .class / #id /
  // [attr] / :pseudo-class / :not(...). Rules with a pseudo-ELEMENT are skipped
  // — ::before does not colour the element itself.
  const INTERACTIVE = new Set(["hover", "active", "focus", "focus-visible", "focus-within", "visited", "target", "disabled", "checked"]);
  function parseCompound(s) {
    const c = { tag: null, cls: [], ids: [], attrs: 0, pseudos: [], nots: [] };
    const re = /([.#]?[-\w]+|\[[^\]]*\]|::?[-\w]+(?:\(([^()]*)\))?|\*)/g;
    let m;
    while ((m = re.exec(s))) {
      const t = m[0];
      if (t.startsWith("::")) return null;
      if (t.startsWith(":")) {
        const name = t.slice(1).replace(/\(.*$/, "");
        if (name === "not") { const inner = parseCompound(m[2] || ""); if (inner) c.nots.push(inner); c.pseudos.push(name); }
        else c.pseudos.push(name);
      } else if (t.startsWith(".")) c.cls.push(t.slice(1));
      else if (t.startsWith("#")) c.ids.push(t.slice(1));
      else if (t.startsWith("[")) c.attrs++;
      else if (t === "*") c.tag = null;
      else c.tag = t.toLowerCase();
    }
    return c;
  }
  function parseSelector(sel) {
    const parts = sel.trim().split(/\s*(>)\s*|\s+/).filter((x) => x !== undefined && x !== "");
    const out = [];
    for (const p of parts) {
      if (p === ">") { out.push({ combinator: ">" }); continue; }
      const c = parseCompound(p);
      if (!c) return null;
      out.push({ compound: c });
    }
    return out;
  }
  const matchCompound = (c, el, state) => {
    if (c.tag && c.tag !== el.tag) return false;
    for (const k of c.cls) if (!el.cls.has(k)) return false;
    for (const i of c.ids) if (i !== el.id) return false;
    for (const p of c.pseudos) {
      if (p === "not") continue;
      if (INTERACTIVE.has(p) && p !== state) return false;
      if (!INTERACTIVE.has(p) && p !== "root") return false;
    }
    for (const n of c.nots) if (matchCompound(n, el, state)) return false;
    return true;
  };
  function matches(parsed, el, state) {
    // Right to left over the element's ancestor chain.
    const chain = el.chain;
    let ci = chain.length - 1;
    const seq = [...parsed].reverse();
    let i = 0, child = false;
    while (i < seq.length) {
      const step = seq[i];
      if (step.combinator === ">") { child = true; i++; continue; }
      if (ci < 0) return false;
      if (i === 0) {
        if (!matchCompound(step.compound, chain[ci], state)) return false;
        ci--; i++; child = false;
        continue;
      }
      if (child) {
        if (!matchCompound(step.compound, chain[ci], state)) return false;
        ci--; i++; child = false;
        continue;
      }
      let found = false;
      while (ci >= 0) {
        if (matchCompound(step.compound, chain[ci], "none")) { ci--; found = true; break; }
        ci--;
      }
      if (!found) return false;
      i++;
    }
    return true;
  }
  const spec = (parsed) => {
    let a = 0, b = 0, c = 0;
    const add = (cp) => {
      a += cp.ids.length;
      b += cp.cls.length + cp.attrs + cp.pseudos.filter((p) => p !== "not").length;
      if (cp.tag) c += 1;
      for (const n of cp.nots) add(n);
    };
    for (const s of parsed) if (s.compound) add(s.compound);
    return a * 10000 + b * 100 + c;
  };

  // Flatten the stylesheet, @media blocks included: a rule that only applies at
  // some widths still has to leave the button its colour at those widths.
  const rules = [];
  {
    const src = css.replace(/\/\*[\s\S]*?\*\//g, " ");
    const collect = (body, media, base) => {
      const re = /([^{}]+)\{([^{}]*)\}/g;
      let m;
      while ((m = re.exec(body))) rules.push({ sel: m[1].trim(), decl: m[2], media, order: base + m.index });
    };
    // pull @media blocks out first, then everything that is left
    let rest = "";
    let i = 0;
    while (i < src.length) {
      const at = src.indexOf("@media", i);
      if (at < 0) { rest += src.slice(i); break; }
      rest += src.slice(i, at);
      let depth = 0, j = src.indexOf("{", at);
      const cond = src.slice(at, j).trim();
      let k = j;
      for (; k < src.length; k++) { if (src[k] === "{") depth++; else if (src[k] === "}") { depth--; if (!depth) break; } }
      collect(src.slice(j + 1, k), cond, at);
      i = k + 1;
    }
    collect(rest.replace(/@[-\w]+[^{]*\{[\s\S]*?\}\s*\}/g, " "), null, 0);
  }
  const colorRules = rules
    .filter((r) => /(^|;|\s)color\s*:/.test(r.decl))
    .flatMap((r) =>
      r.sel.split(",").map((s) => {
        const parsed = parseSelector(s);
        if (!parsed) return null;
        const dm = r.decl.match(/(?:^|;)\s*color\s*:\s*([^;]+)/);
        const value = dm ? dm[1].trim() : null;
        return { sel: s.trim(), parsed, value: value?.replace(/!important/, "").trim(), important: /!important/.test(value || ""), spec: spec(parsed), order: r.order, media: r.media };
      }),
    )
    .filter(Boolean);

  const buttons = els.filter((e) => e.cls.has("btn"));
  if (!buttons.length) artifactErrors.push("no .btn on the page — this check has nothing to protect, which means it cannot fail");
  for (const state of ["none", "hover"]) {
    for (const b of buttons) {
      const hits = colorRules.filter((r) => matches(r.parsed, b, state));
      if (!hits.length) { artifactErrors.push(`a .btn (${[...b.cls].join(".")}) has no colour rule at all`); continue; }
      hits.sort((x, y) => x.important - y.important || x.spec - y.spec || x.order - y.order);
      const win = hits[hits.length - 1];
      if (!/\.btn/.test(win.sel)) {
        artifactErrors.push(
          `a button's colour is decided by "${win.sel}"${win.media ? ` (${win.media})` : ""} and not by a .btn rule — ` +
            `the button is <${b.tag} class="${[...b.cls].join(" ")}"> inside ${b.chain.slice(0, -1).map((a) => a.tag).join(">")} and would paint ${win.value} in the ${state === "none" ? "resting" : state} state. ` +
            `Raise the scope of the offending selector (\`:not(.btn)\`), never the specificity of .btn.`,
        );
      }
    }
  }
}

// r5: every §N a reader can SEE must resolve to a real heading in the spec it
// cites. Fenced code blocks are stripped BEFORE headings are extracted — a
// "# 3 lines to join a cluster" inside a fence is not a heading, and that bug
// has already bitten once.
{
  const visible = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  const cited = [...new Set([...visible.matchAll(/§\s*([0-9]+(?:\.[0-9]+)*)/g)].map((m) => m[1]))];
  if (cited.length) {
    const specPath = resolve(root, "..", "docs/spec/README.md");
    if (!existsSync(specPath)) artifactErrors.push(`the page cites §${cited.join(", §")} and docs/spec/README.md does not exist`);
    else {
      const spec = readFileSync(specPath, "utf8").replace(/^```[\s\S]*?^```/gm, "");
      const heads = [...spec.matchAll(/^#{1,6}\s+.*$/gm)].map((m) => m[0]);
      for (const n of cited) {
        const hit = heads.some((h) => new RegExp(`(^|[^0-9.])${n.replace(/\./g, "\\.")}([^0-9.]|$)`).test(h));
        if (!hit) artifactErrors.push(`the page cites §${n} and docs/spec/README.md has no heading numbered ${n} (fences stripped first)`);
      }
    }
  }
}
// The shell revision must be printed, so a later reader can tell which pages
// carry a fix and which predate it.
if (!html.includes(surface.shell_revision)) artifactErrors.push(`the artifact does not print its shell revision "${surface.shell_revision}"`);

if (artifactErrors.length) {
  console.error("✗ build failed — the artifact is not publishable:\n  - " + artifactErrors.join("\n  - "));
  process.exit(1);
}

// ---- emit, and PROVE the artifact is this build's ------------------------
// SHELL.md r6, hole 2. Everything above gates a string held in memory. Nothing
// used to connect that string to the file a visitor is served: if the build
// threw, the previous index.html stayed on disk untouched and the next gate run
// happily approved a STALE ARTIFACT. That is not a hypothetical either — it
// made a real deliberate-break report read PASS.
//
// So the emitted bytes are hashed BEFORE they are written, read back from disk
// AFTER, and compared. The same hash is carried to the published copy at the
// site root, which is what actually serves, and recorded in dist/artifact.json
// so a later reader — or a deploy step — can ask "is what is on disk the thing
// that was gated?" and get an answer rather than an assurance.
// The trapdoor closes here. Everything above ran against a moved clock, and
// everything below writes files a visitor is served. A page built as some other
// day must never become the published page — otherwise `--as-of` is a way to
// keep an expired offer on the site by lying about the date. So this mode
// reports what the derivation produced and exits before the first write.
if (AS_OF) {
  const offers = [...offerSuffix.entries()].map(([id, v]) => `${id}: "${v}"`);
  console.log(
    `\u2713 --as-of ${AS_OF}: derivation only, NOTHING WRITTEN.\n` +
      `  CTA verbs rendered : ${[...renderVerb.entries()].map(([id, v]) => `${id} → "${v}"`).join(" · ") || "(none)"}\n` +
      `  contract verbs     : ${[...bookVerb.entries()].map(([id, v]) => `${id} → "${v}"`).join(" · ") || "(none)"}\n` +
      `  dated offer printed: ${offers.length ? offers.join(" · ") : "(none)"}\n` +
      `  offer enforcement  : ${[...offerEnforced.entries()].map(([id, v]) => `${id} → ${v ? "enforced" : "prospective"}`).join(" · ") || "(no offer)"}\n` +
      `  artifact sha256    : ${sha(html).slice(0, 16)}\u2026 (${Buffer.byteLength(html)} bytes, not published)\n` +
      // The RENDERED element, not the map it came from. A boundary probe that
      // reads the derivation is checking the build's arithmetic; one that reads
      // this is checking the thing a visitor is served.
      `  rendered CTA       : ${(html.match(/<a[^>]*data-publication="[^"]*"[^>]*>[\s\S]*?<\/a>/) || ["(no publication CTA on the page)"])[0].replace(/\s+/g, " ")}`,
  );
  process.exit(0);
}

const outDir = resolve(root, "dist");
const emitHash = sha(html);

// Every file is STAGED first — written beside its destination, read back off
// the disk it landed on, and re-hashed. A short write, a full disk, a
// concurrent writer and a copy that silently did not happen all look identical
// from the writing side, and all fail here. Only once every file has been
// proved are they renamed into place, so a throw halfway through publishing
// leaves the previous page whole rather than half of two pages.
const proven = [];
const staged = [];
function stage(dest, bytes, label) {
  const tmp = dest + ".building";
  writeFileSync(tmp, bytes);
  const got = sha(readFileSync(tmp));
  const want = sha(bytes);
  if (got !== want) {
    console.error(
      `✗ build failed — ${label} was written and read back different.\n    wrote   sha256 ${want}\n    on disk sha256 ${got}\n` +
        "  The gate approved bytes that are not the bytes on disk. Nothing is published.",
    );
    process.exit(1);
  }
  staged.push({ tmp, dest, label, sha256: got, bytes: bytes.length });
  return got;
}
const stageCopy = (src, dest, label) => stage(dest, readFileSync(src), label);
function commit() {
  for (const s of staged) renameSync(s.tmp, s.dest);
  // And once more, from the destination this time: a rename that landed
  // somewhere other than where it was aimed is still a mismatch.
  for (const s of staged) {
    const got = sha(readFileSync(s.dest));
    if (got !== s.sha256) {
      console.error(`✗ build failed — ${s.label} does not hash to what was staged for it (${got.slice(0, 16)}… vs ${s.sha256.slice(0, 16)}…)`);
      process.exit(1);
    }
    proven.push({ path: s.dest.replace(site_root + "/", ""), sha256: s.sha256, bytes: s.bytes });
  }
  staged.length = 0;
}

mkdirSync(resolve(outDir, "styles"), { recursive: true });
stage(resolve(outDir, "index.html"), Buffer.from(html), "dist/index.html");
stageCopy(resolve(root, "styles/site.css"), resolve(outDir, "styles/site.css"), "dist/styles/site.css");
stageCopy(resolve(root, "build/proof.js"), resolve(outDir, "proof.js"), "dist/proof.js");
stageCopy(resolve(root, "build/idanim.js"), resolve(outDir, "idanim.js"), "dist/idanim.js");
commit();

// Carry site-root runtime assets through if present (progressive enhancement).
//
// NOTE FOR ANY LANE THAT RUNS THIS BUILD: `amp-nav.js` is NOT this repository's
// file. Its source is ampersand-nav/src/amp-nav.js, fanned out by sync-nav.sh,
// and only the nav lane may change it. Refreshing dist/amp-nav.js is a SIDE
// EFFECT of building this site — `git checkout -- _rebuild/dist/amp-nav.js`
// before committing, and never stage a nav change from here. It is deliberately
// NOT published back to the site root below, and it is deliberately not in the
// proven set: this build did not produce it and may not vouch for it.
for (const asset of ["amp-nav.js", "kappa_proof.js"]) {
  const src = resolve(root, "..", asset);
  if (existsSync(src)) copyFileSync(src, resolve(outDir, asset));
}

// PUBLISH. The site root is what the server serves and what Cloudflare deploys,
// so it is the artifact that has to be provable — and it used to be reached by
// a hand-typed `cp` documented in a README, outside every check in this file. A
// copy step a human performs is a copy step a human forgets, and the failure
// mode is a gate that passes over yesterday's page.
mkdirSync(resolve(site_root, "styles"), { recursive: true });
const indexBuf = Buffer.from(html);
const publishedBytes = indexBuf.length;
const publishedIndexHash = stage(resolve(site_root, "index.html"), indexBuf, "index.html");
stageCopy(resolve(root, "styles/site.css"), resolve(site_root, "styles/site.css"), "styles/site.css");
stageCopy(resolve(root, "build/proof.js"), resolve(site_root, "proof.js"), "proof.js");
stageCopy(resolve(root, "build/idanim.js"), resolve(site_root, "idanim.js"), "idanim.js");
commit();

if (publishedIndexHash !== emitHash) {
  console.error("✗ build failed — the published index.html does not hash to the gated bytes");
  process.exit(1);
}

writeFileSync(
  resolve(outDir, "artifact.json"),
  JSON.stringify(
    {
      _comment:
        "Written by build/build.mjs at emit. Every file listed was hashed before it was written and re-hashed after being read back off disk; the build refuses if they differ. `node build/build.mjs --verify` re-checks these against what is on disk right now, which is how a deploy step proves it is shipping the artifact that was gated rather than whatever survived the last failed build.",
      built_at: new Date().toISOString(),
      shell_revision: surface.shell_revision,
      artifact_sha256: emitHash,
      files: proven,
    },
    null,
    2,
  ) + "\n",
);

const refCount = references.reduce((a, g) => a + g.items.length, 0);
console.log(
  // ${html.length} is the JS string's UTF-16 code-unit count, not its size on
  // disk, and this line used to print it as "bytes". The page carries κ, §, —,
  // ⟺ and twenty other multi-byte characters, so it under-reported by 342 —
  // and SITES.md §0.1 makes "local bytes vs curl bytes" the check that a
  // deployed page is the local one. A lane comparing `curl … | wc -c` against
  // this line would have read a live, correct deploy as stale. It now prints
  // what was actually written, taken from the staging record.
  `✓ built + published index.html — ${publishedBytes} bytes · sha256 ${emitHash.slice(0, 16)}… (written, read back, verified) · ` +
    `band rung ${rung} (derived from ${distinctStatuses.length} distinct protocol statuses) · ` +
    `${protocols.length} protocols, ${rungs.rungs.length}+1 rung cards, ${rungs.kernelLaws} kernel + ${rungs.composeLaws} compose = ${rungs.kernelLaws + rungs.composeLaws} enforced laws ` +
    `(${rungs.openGaps} open, measured ${rungs.measured}), ${refCount} references, ${Object.keys(surface.cta).filter((k) => !k.startsWith("_")).length} CTA groups · ` +
    `identity graph ${IDN} nodes / ${IDA} arcs · ${retractions.entries.length} retracted strings counted, not detected`,
);
