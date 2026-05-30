// Zero-dependency static generator.
//   node build/build.mjs   → writes dist/index.html
// The build VALIDATES the data first and throws on drift, so the site can never
// ship a malformed/incomplete protocol entry. This is the no-drift kernel ethos
// applied to the website itself.

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Page } from "./templates.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, "..");
const read = (p) => JSON.parse(readFileSync(resolve(root, p), "utf8"));

// ---- load --------------------------------------------------------------
const site = read("data/site.json");
const protocols = read("data/protocols.json");
const loop = read("data/loop.json");
const receipts = read("data/receipts.json");
const rungs = read("data/rungs.json");
const references = read("data/references.json");

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

// ---- render ------------------------------------------------------------
const html = Page({ site, protocols, loop, receipts, rungs, references, stats });
const outDir = resolve(root, "dist");
mkdirSync(resolve(outDir, "styles"), { recursive: true });
writeFileSync(resolve(outDir, "index.html"), html);
copyFileSync(resolve(root, "styles/site.css"), resolve(outDir, "styles/site.css"));
copyFileSync(resolve(root, "build/proof.js"), resolve(outDir, "proof.js"));

// carry site-root runtime assets through if present (progressive enhancement)
for (const asset of ["amp-nav.js", "kappa_proof.js"]) {
  const src = resolve(root, "..", asset);
  if (existsSync(src)) copyFileSync(src, resolve(outDir, asset));
}

const refCount = references.reduce((a, g) => a + g.items.length, 0);
console.log(
  `✓ built dist/index.html — ${protocols.length} protocols, ${rungs.rungs.length}+1 rung cards, ${rungs.lawCount} laws, ${refCount} references`,
);
