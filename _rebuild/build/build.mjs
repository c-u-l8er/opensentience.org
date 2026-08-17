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
if (surface.contact?.kind === "mailto" || /^mailto:/i.test(surface.contact?.url || "")) {
  errors.push("surface.contact is a mailto: — contact goes through an issue tracker or a hosted form, never a mailbox (Travis's call, 2026-08-11)");
}
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
    if (!VERBS[r]?.includes(a.verb)) {
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

const html = Page({ site, surface, protocols, loop, receipts, rungs, references, stats, rung, assetv, idgraph });

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
  for (const m of g[1].matchAll(/class="verb">([^<]+)</g)) {
    if (!VERBS[r].includes(m[1].trim())) {
      artifactErrors.push(`CTA "${m[1].trim()}" is not available at rung ${r} — allowed: ${VERBS[r].join(" · ")}`);
    }
  }
}

// The identifying animation exists, asserts nothing, and can actually find the
// nodes it drives (SHELL.md §8.5). The middle check is the `12 Active
// Pathfinders` defect mechanised: a decorative canvas's loop bound was
// published as a live user metric on a sibling domain for months.
if (!/data-identity-animation/.test(html)) artifactErrors.push("the landing page has no [data-identity-animation] element");
const constBlock = idanim.match(/IDENTITY-CONSTANTS-START([\s\S]*?)IDENTITY-CONSTANTS-END/);
if (!constBlock) artifactErrors.push("build/idanim.js declares no IDENTITY-CONSTANTS block");
else {
  const nums = [...constBlock[1].matchAll(/=\s*(\d+)/g)].map((m) => m[1]);
  if (!nums.length) artifactErrors.push("the IDENTITY-CONSTANTS block is empty");
  for (const n of nums) {
    if (new RegExp(`(^|[^\\w.,$])${n}([^\\w.,%]|$)`).test(text)) {
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
  const count = (re) => (html.match(re) || []).length;
  const nodesInSvg = count(/<circle class="idn"/g);
  const arcsInSvg = count(/<path class="ida"/g);
  const headsInSvg = count(/<path class="idh"/g);
  if (nodesInSvg !== IDN) artifactErrors.push(`the artifact draws ${nodesInSvg} graph nodes and the driver expects ${IDN}`);
  if (arcsInSvg !== IDA) artifactErrors.push(`the artifact draws ${arcsInSvg} arcs and the driver expects ${IDA}`);
  if (headsInSvg !== IDA) artifactErrors.push(`the artifact draws ${headsInSvg} arrowheads and the driver expects ${IDA}`);
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
  // reported as stray <hr>s on a page that has no <hr> at all. The bound is 72
  // px of a 300-wide box; the longest near-horizontal arc this graph draws is
  // 51.5, so there is 40 % of headroom and a redesign has to work at it to
  // reintroduce the fault.
  const HMAX = 72;
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
  const idsvg = (html.match(/<div class="idanim"[\s\S]*?<\/svg>/) || [""])[0];
  if (/<line\b/i.test(idsvg)) artifactErrors.push("the identifying animation contains a <line> — the ladder it replaced was 31 of them, and that is what read as ruled paper");
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
  const seen = occurrences(text, r.string);
  if (seen < r.min || seen > r.max) {
    artifactErrors.push(
      `retracted string "${r.string}" appears ${seen}× in the page text; the bound is ${r.min}–${r.max}. ` +
        (seen > r.max
          ? `Retracted ${r.retracted_at} (${r.commit}): ${r.why}`
          : `The retraction that is entitled to name it is missing — a retraction that quietly disappears is the reinstatement, slower.`),
    );
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
const publishedIndexHash = stage(resolve(site_root, "index.html"), Buffer.from(html), "index.html");
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
  `✓ built + published index.html — ${html.length} bytes · sha256 ${emitHash.slice(0, 16)}… (written, read back, verified) · ` +
    `band rung ${rung} (derived from ${distinctStatuses.length} distinct protocol statuses) · ` +
    `${protocols.length} protocols, ${rungs.rungs.length}+1 rung cards, ${rungs.kernelLaws} kernel + ${rungs.composeLaws} compose = ${rungs.kernelLaws + rungs.composeLaws} enforced laws ` +
    `(${rungs.openGaps} open, measured ${rungs.measured}), ${refCount} references, ${Object.keys(surface.cta).filter((k) => !k.startsWith("_")).length} CTA groups · ` +
    `identity graph ${IDN} nodes / ${IDA} arcs · ${retractions.entries.length} retracted strings counted, not detected`,
);
