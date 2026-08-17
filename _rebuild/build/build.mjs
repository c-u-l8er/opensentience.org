// Zero-dependency static generator.
//   node build/build.mjs   → writes dist/index.html
// The build VALIDATES the data first and throws on drift, so the site can never
// ship a malformed/incomplete protocol entry. This is the no-drift kernel ethos
// applied to the website itself.

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Page, LADDER_BANDS } from "./templates.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, "..");
const read = (p) => JSON.parse(readFileSync(resolve(root, p), "utf8"));

// ---- load --------------------------------------------------------------
const site = read("data/site.json");
const surface = read("data/surface.json");
const protocols = read("data/protocols.json");
const loop = read("data/loop.json");
const receipts = read("data/receipts.json");
const rungs = read("data/rungs.json");
const references = read("data/references.json");

const css = readFileSync(resolve(root, "styles/site.css"), "utf8");
const ladder = readFileSync(resolve(root, "build/ladder.js"), "utf8");

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
  .update(ladder)
  .digest("hex")
  .slice(0, 8);

const html = Page({ site, surface, protocols, loop, receipts, rungs, references, stats, rung, assetv });

// ---- gate the ARTIFACT, not the source ---------------------------------
// A gate that reads the source checks what the build meant; these read what a
// visitor will get. Every one is here because something in this portfolio
// shipped wrong in exactly this way at least once.
const artifactErrors = [];
const markup = html.replace(/<style[\s\S]*?<\/style>/gi, " ");
const text = html
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
const constBlock = ladder.match(/IDENTITY-CONSTANTS-START([\s\S]*?)IDENTITY-CONSTANTS-END/);
if (!constBlock) artifactErrors.push("build/ladder.js declares no IDENTITY-CONSTANTS block");
else {
  const nums = [...constBlock[1].matchAll(/=\s*(\d+)/g)].map((m) => m[1]);
  if (!nums.length) artifactErrors.push("the IDENTITY-CONSTANTS block is empty");
  for (const n of nums) {
    if (new RegExp(`(^|[^\\w.,$])${n}([^\\w.,%]|$)`).test(text)) {
      artifactErrors.push(`animation constant ${n} also appears as text on the page — a decoration constant a reader can see is how a canvas loop bound became a published metric`);
    }
  }
}
// The drawing and the driver must agree about how many bands there are, or the
// marks land between the rules and it is nobody's job to notice.
{
  const bandsInJs = Number((ladder.match(/const BANDS = (\d+)/) || [])[1]);
  const rulesInSvg = ((html.match(/<g id="ident-marks">/) ? html.split('<g id="ident-marks">')[0] : "").match(/<line x1="34" y1="[\d.]+" x2="266"/g) || []).length;
  if (bandsInJs !== LADDER_BANDS) artifactErrors.push(`ladder.js says BANDS=${bandsInJs} and templates.mjs says LADDER_BANDS=${LADDER_BANDS}`);
  if (rulesInSvg !== LADDER_BANDS) artifactErrors.push(`the artifact draws ${rulesInSvg} ladder rules and the driver expects ${LADDER_BANDS}`);
}
for (const m of ladder.matchAll(/querySelector(?:All)?\("([^"]+)"\)/g)) {
  const sel = m[1];
  const hit = sel.startsWith("#") ? html.includes(`id="${sel.slice(1)}"`) : html.includes(sel.replace(/^\[|\]$/g, ""));
  if (!hit) artifactErrors.push(`the animation looks up ${sel} and the artifact has no such node — the script would fail silently, which is indistinguishable from a page that is merely quiet`);
}
// And nothing may reintroduce the observer that was deleted. Tested against the
// CODE with comments stripped — the first version of this check failed on the
// comment that records why the observer was removed, which would have taught
// the next person to delete the explanation rather than keep the rule.
const proofCode = readFileSync(resolve(root, "build/proof.js"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/.*$/gm, "$1");
if (/IntersectionObserver/.test(proofCode)) {
  artifactErrors.push("build/proof.js reintroduces an IntersectionObserver — it does not fire in a non-compositing renderer and it made the page's CONTENT depend on JavaScript");
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

const outDir = resolve(root, "dist");
mkdirSync(resolve(outDir, "styles"), { recursive: true });
writeFileSync(resolve(outDir, "index.html"), html);
copyFileSync(resolve(root, "styles/site.css"), resolve(outDir, "styles/site.css"));
copyFileSync(resolve(root, "build/proof.js"), resolve(outDir, "proof.js"));
copyFileSync(resolve(root, "build/ladder.js"), resolve(outDir, "ladder.js"));

// Carry site-root runtime assets through if present (progressive enhancement).
//
// NOTE FOR ANY LANE THAT RUNS THIS BUILD: `amp-nav.js` is NOT this repository's
// file. Its source is ampersand-nav/src/amp-nav.js, fanned out by sync-nav.sh,
// and only the nav lane may change it. Refreshing dist/amp-nav.js is a SIDE
// EFFECT of building this site — `git checkout -- _rebuild/dist/amp-nav.js`
// before committing, and never stage a nav change from here.
for (const asset of ["amp-nav.js", "kappa_proof.js"]) {
  const src = resolve(root, "..", asset);
  if (existsSync(src)) copyFileSync(src, resolve(outDir, asset));
}

const refCount = references.reduce((a, g) => a + g.items.length, 0);
console.log(
  `✓ built dist/index.html — ${html.length} bytes · band rung ${rung} (derived from ${distinctStatuses.length} distinct protocol statuses) · ` +
    `${protocols.length} protocols, ${rungs.rungs.length}+1 rung cards, ${rungs.kernelLaws} kernel + ${rungs.composeLaws} compose = ${rungs.kernelLaws + rungs.composeLaws} enforced laws ` +
    `(${rungs.openGaps} open, measured ${rungs.measured}), ${refCount} references, ${Object.keys(surface.cta).filter((k) => !k.startsWith("_")).length} CTA groups`,
);
