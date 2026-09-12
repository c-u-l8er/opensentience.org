/* prove-gate — does the opensentience.org publication gate actually refuse?
 *
 * SHELL.md r11: a gate that only proves it REFUSES is half a gate. So there are
 * two kinds of stage here and BOTH must be green:
 *   SOUND   — input that is correct (or unusual but legitimate) must BUILD.
 *   REFUSE  — one deliberate break each, and the gate must fail WITH THE
 *             MESSAGE THAT BREAK TARGETS. Not "some error": the specific one.
 *             r12: a sibling's first run produced twenty refusals all refusing
 *             for one unrelated reason, which is a perfect table proving
 *             nothing. Matching the message is what makes the table mean
 *             something.
 *
 * r12 also says: run the harness UNMODIFIED first and require it to pass, and
 * keep the sandbox PRIVATE. Stage 0 below is that run; the sandbox is a fresh
 * mkdtemp per stage under this session's own scratch, never a shared path, and
 * the real tree is never written to — build.mjs resolves its root from its own
 * location, so a copy of _rebuild/ inside an empty parent publishes into that
 * parent and nowhere else.
 */
import { readFileSync, writeFileSync, cpSync, mkdtempSync, rmSync, mkdirSync, existsSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

// The source tree under test is this file's own _rebuild/, so the harness moves
// with the repository and never names a machine. The sandbox root is a private
// mkdtemp — r12: scratch directories are shared between lanes and one harness
// has already overwritten another's.
const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PRIVATE = mkdtempSync(join(tmpdir(), "os-prove-gate-"));

// PUB7 re-derives the book's counts from a registry that lives OUTSIDE
// _rebuild/, so the sandbox has to stage it too. Without this every stage below
// refused for one unrelated reason — "there is no such file" — which is the
// perfect-looking, meaningless table r12 exists to prevent. Staged read-only
// and per-sandbox, so a stage may break it deliberately without touching the
// tree or its siblings.
const SITE = resolve(SRC, "..");
const STAGED = [
  "_patterns/data/patterns.json",
  // Staged for the MAP4 solid-reachability probe: a REAL run receipt (exit 0)
  // and the two paths it genuinely exercises. Without these, "solid" would be
  // unreachable in the sandbox and the harness could only prove refusals —
  // which is r11's whole complaint.
  "_patterns/receipts/AmpersandBoxDesign__box-and-box__test__compose-laws.mjs.json",
  "../AmpersandBoxDesign/box-and-box/test/compose-laws.mjs",
  "../AmpersandBoxDesign/box-and-box/LAW_MANIFEST.json",
  // A11Y1 derives the skip link's stacking bound from the bar it has to clear,
  // and the bar's number lives in another repository's file. Staged so the
  // probes below can move it and watch this build refuse.
  "amp-nav.js",
  // SHARED1 reads the OTHER pages that load /styles/site.css, to catch a class
  // written for this page landing on one of them. Without these staged, that
  // gate found no subject and refused — and every soundness probe in the table
  // went red for one unrelated reason, including "the tree exactly as it is".
  // That is r12's meaningless-table failure, recurring in the same harness for
  // the same reason: a gate that reaches OUTSIDE _rebuild/ has to be given its
  // subject inside the sandbox.
  "patterns/index.html",
  "playground.html",
];

// MAP4 asks whether the path an edge names EXISTS, so the sandbox has to carry
// those paths too — and existence is all it has to carry. A file is copied; a
// directory is created empty rather than cloned, because cloning
// ../AmpersandBoxDesign/reference to test `existsSync` would copy a repository
// to answer a boolean. Faithful to what the gate actually checks.
const mapPaths = (() => {
  try {
    const m = JSON.parse(readFileSync(resolve(SRC, "data/stackmap.json"), "utf8"));
    return (m.edges || []).flatMap((e) => [e.producer?.path, e.consumer?.path].filter(Boolean));
  } catch { return []; }
})();

function sandbox() {
  const dir = mkdtempSync(join(PRIVATE, "s-"));
  cpSync(SRC, resolve(dir, "_rebuild"), { recursive: true });
  for (const rel of STAGED) {
    const from = resolve(SITE, rel);
    if (!existsSync(from)) continue;
    const to = resolve(dir, rel);
    mkdirSync(dirname(to), { recursive: true });
    cpSync(from, to);
  }
  for (const rel of mapPaths) {
    const from = resolve(SITE, rel);
    const to = resolve(dir, rel);
    if (existsSync(to)) continue;
    if (existsSync(from) && statSync(from).isDirectory()) { mkdirSync(to, { recursive: true }); continue; }
    mkdirSync(dirname(to), { recursive: true });
    if (existsSync(from)) cpSync(from, to);
  }
  return dir;
}
function run(dir, args = []) {
  try {
    const out = execFileSync("node", [resolve(dir, "_rebuild/build/build.mjs"), ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { ok: true, out };
  } catch (e) {
    return { ok: false, out: (e.stdout || "") + (e.stderr || "") };
  }
}
function patch(dir, rel, fn) {
  const p = resolve(dir, "_rebuild", rel);
  const before = readFileSync(p, "utf8");
  const after = fn(before);
  if (after === before) throw new Error("no-op patch on " + rel);
  writeFileSync(p, after);
}
// Like patch(), but for a file at the SITE root rather than inside _rebuild/.
function patchSite(dir, rel, fn) {
  const p = resolve(dir, rel);
  const before = readFileSync(p, "utf8");
  const after = fn(before);
  if (after === before) throw new Error("no-op patch on " + rel);
  writeFileSync(p, after);
}
// A complete, ENFORCED offer: the record, the scheduled workflow the record
// names, and a receipt from a run that stood on the far side of the boundary.
// Every piece has to be here because PUB2E refuses each one's absence
// separately — which is the point of splitting the claim from the capability.
const OFFER_ENDS = "2026-12-31";
function installEnforcedOffer(dir, tweak = {}) {
  const wf = ".github/workflows/offer-expiry.yml";
  const rc = "_patterns/receipts/offer-expiry-transition.json";
  mkdirSync(dirname(resolve(dir, wf)), { recursive: true });
  writeFileSync(
    resolve(dir, wf),
    "name: offer expiry\non:\n  schedule:\n    - cron: '17 4 * * *'\njobs:\n  rebuild:\n    runs-on: ubuntu-latest\n    steps:\n      - run: node _rebuild/build/build.mjs\n",
  );
  mkdirSync(dirname(resolve(dir, rc)), { recursive: true });
  writeFileSync(
    resolve(dir, rc),
    JSON.stringify({ execution_identity: { exit: 0 }, exercised_after: "2027-01-02", what: "built the page as a day past the offer end and read the CTA back" }, null, 2),
  );
  patchJson(dir, "data/publication.json", (j) => {
    // --as-of moves the clock for EVERY day-sensitive check, not just the
    // offer — and that is correct: a mode that aged one field and froze
    // another would describe a page that could never exist. PUB4 therefore
    // fires on a record whose verification has gone stale by the simulated
    // day, which is exactly what it is for. So the record is made valid on
    // the days this offer is built as, the way a real nightly rebuild would
    // be re-verifying as it went.
    j.publications[0].verified_at = "2026-11-25";
    j.publications[0].verified_max_age_days = 90;
    j.publications[0].free_offer = {
      starts: "2026-09-01",
      ends: OFFER_ENDS,
      price_during: { amount: 0, currency: "USD" },
      price_after: { amount: 29, currency: "USD" },
      // the far side is a DIFFERENT row, so the verb visibly moves
      state_after: "released",
      delivery_after: "download",
      expiry_check: { kind: "scheduled_rebuild", cadence: "daily", how: "a scheduled workflow rebuilds and redeploys the site nightly", workflow: wf, receipt: rc },
      ...tweak,
    };
  });
  return { wf, rc };
}
function patchRawJson(dir, rel, fn) {
  const p = resolve(dir, rel);
  const j = JSON.parse(readFileSync(p, "utf8"));
  fn(j);
  writeFileSync(p, JSON.stringify(j, null, 2));
}
function patchJson(dir, rel, fn) {
  const p = resolve(dir, "_rebuild", rel);
  const j = JSON.parse(readFileSync(p, "utf8"));
  fn(j);
  writeFileSync(p, JSON.stringify(j, null, 2));
}

const SOUND = [
  ["a date containing an animation constant is not a countable metric", (d) => patchJson(d, "data/surface.json", (j) => { j.status.source += " Re-measured 2026-12-31."; })],
  ["an ENFORCED offer is reachable — schedule and receipt, so the date may print", (d) => installEnforcedOffer(d)],
  // The narrowed claim, made executable. An offer with no mechanism behind it
  // is a fully validated PROSPECTIVE record: it builds, and it prints nothing.
  ["a PROSPECTIVE offer is recorded and checked, and prints no date", (d) => patchJson(d, "data/publication.json", (j) => { j.publications[0].free_offer = { starts: "2026-09-01", ends: "2026-12-31", price_during: { amount: 0, currency: "USD" }, price_after: { amount: 29, currency: "USD" }, state_after: "released", delivery_after: "download", expiry_check: { kind: "none", cadence: "n/a", how: "nothing in this repository rebuilds on a clock, so the offer is not published" } }; })],
  ["an offer that has ALREADY expired settles itself — the page transitions", (d) => { installEnforcedOffer(d); patchJson(d, "data/publication.json", (j) => { j.publications[0].free_offer.starts = "2024-01-01"; j.publications[0].free_offer.ends = "2024-02-01"; }); }],
  ["an edge earns SOLID from a real run receipt over both ends", (d) => patchJson(d, "data/stackmap.json", (j) => { const e = j.edges.find((x) => x.from === "amp"); e.producer = { what: "the compose-law suite", path: "../AmpersandBoxDesign/box-and-box/test/compose-laws.mjs" }; e.consumer = { what: "the derived law manifest", path: "../AmpersandBoxDesign/box-and-box/LAW_MANIFEST.json" }; e.integration = { kind: "receipt", path: "_patterns/receipts/AmpersandBoxDesign__box-and-box__test__compose-laws.mjs.json", exercises: ["../AmpersandBoxDesign/box-and-box/test/compose-laws.mjs", "../AmpersandBoxDesign/box-and-box/LAW_MANIFEST.json"] };  })],
  ["an absent end becoming present moves an edge from missing to dashed", (d) => patchJson(d, "data/stackmap.json", (j) => { const e = j.edges.find((x) => x.from === "embodiment"); e.consumer = { what: "the PULSE manifest schema carrying SurpriseSignal", path: "../PULSE/schemas/pulse-loop-manifest.v0.1.json" }; delete e.consumer_why; })],
  ["a thirteenth protocol, accounted for on the map", (d) => { patchJson(d, "data/protocols.json", (j) => { const a = j.protocols || j; a.push({ ...a[a.length - 1], id: "OS-013", name: "A wholly new protocol", status: "draft" }); }); patchJson(d, "data/stackmap.json", (j) => { j.nodes.find((n) => n.id === "scope").protocols.push("OS-013"); }); }],
  ["the book gains a real downloadable edition — the other row must be reachable", (d) => { patchJson(d, "data/publication.json", (j) => { const p = j.publications[0]; p.delivery = "both"; p.download = { url: "https://opensentience.org/patterns/unboxed-patterns.epub", bytes: 4194304, sha256: "0".repeat(64) }; p.license = "CC BY-SA 4.0"; p.formats = ["html", "epub"]; }); patchJson(d, "data/surface.json", (j) => { for (const a of j.cta.live_deployed) if (a.publication) a.verb = "Download the founding edition"; }); }],
  ["the page states the DERIVED chapter count — PUB6 must permit a true count", (d) => patchJson(d, "data/surface.json", (j) => { for (const a of j.cta.live_deployed) if (a.publication) a.what = "The catalog runs to 32 chapters, every label derived. " + a.what; })],
  ["protocol versions v0.1 on the page are not the book's edition", (d) => patchJson(d, "data/surface.json", (j) => { j.surface_rung_covers += ", and not PULSE v0.1 or SCOPE v0.1 either"; })],
  ["the edition prints once it has been ruled", (d) => { patchJson(d, "data/publication.json", (j) => { j.publications[0].edition_ruled = true; }); patchJson(d, "data/surface.json", (j) => { for (const a of j.cta.live_deployed) if (a.publication) a.what = "Edition 0.1. " + a.what; }); }],
  ["a mission reworded, still asserting identity and not maturity", (d) => patchJson(d, "data/surface.json", (j) => { j.mission = "OpenSentience is open research into how a machine should remember, reconsider, measure itself and stay governed."; })],
  // Gate 3a. The one that matters most is the first: A11Y4 is a DERIVATION, so
  // renaming a phase must move the diagram's accessible name with it and build.
  // If this probe ever needs a second edit to pass, the name has been typed
  // somewhere again.
  ["a phase renamed — the ring's accessible name must follow the data", (d) => patchJson(d, "data/loop.json", (j) => { j.phases[0].verb = "Recall"; })],
  ["a differently named skip target — A11Y1 checks the pair, not the word", (d) => patch(d, "build/templates.mjs", (s) => s.replace('<a class="skip-link" href="#main">', '<a class="skip-link" href="#content">').replace('<main id="main" tabindex="-1">', '<main id="content" tabindex="-1">'))],
  ["a legitimately deeper heading — A11Y2 bounds the JUMP, not the depth", (d) => patch(d, "build/templates.mjs", (s) => s.replace('<h3 class="ref-group">${g.group}</h3>', '<h3 class="ref-group">${g.group}</h3>\n            <h4>Selected</h4>'))],
  ["the skip link revealed by a transform instead of an offset", (d) => patch(d, "styles/site.css", (s) => s.replace(".skip-link:focus {\n                left: 0.75rem;", ".skip-link:focus {\n                transform: translateX(10000px);\n                left: 0.75rem;"))],
  ["the nav bar LOWERS its stacking — the bound is 'clears it', not a magic number", (d) => patchSite(d, "amp-nav.js", (s) => s.replace("--amp-nav-z: 9999;", "--amp-nav-z: 500;"))],
  // Gate 3b. The derivation proof: re-adjudicate a protocol and the chip beside
  // the question that lives in it must move by itself. The five cards this
  // replaced wrote their status in prose, so this probe would have passed while
  // the page went on describing the old status.
  ["a protocol re-adjudicated — the question's status chip follows", (d) => patchJson(d, "data/protocols.json", (j) => { const a = j.protocols || j; a.find((p) => p.id === "OS-002").status = "in-development"; })],
  ["a section renamed — the rail and the eyebrow move together", (d) => patch(d, "build/templates.mjs", (s) => s.replace('{ id: "catalog", label: "The Catalog" }', '{ id: "catalog", label: "The Evidence" }'))],
  ["a measured comparative WITH its baseline recorded is reachable", (d) => patchJson(d, "data/receipts.json", (j) => { j[0].note = "graph-backed retrieval beats the topology-off arm of the same engine by 0.3pp."; j[0].baseline = { what: "the same engine with topology routing disabled", value: "92.3% QA proxy" }; })],
  ["a protocol version bumped — the derived chip follows", (d) => patchJson(d, "data/protocols.json", (j) => { const a = j.protocols || j; a[0].version = "v0.4.4"; })],
  // The cover. COV3's first version refused THIS page, because the caption
  // saying there is no file contains the word "download".
  ["the cover may say there is NO file — a denial is not a promise", (d) => patch(d, "build/templates.mjs", (s) => s.replace("there is no file.", "there is no file and no download, now or planned."))],
  ["a chapter gains a witness — the cover redraws and the counts re-derive", (d) => { patchRawJson(d, "_patterns/data/patterns.json", (j) => { const rows = Array.isArray(j) ? j : j.patterns; const r = rows.find((x) => !(x.witness || {}).rung); r.witness = { rung: "in_tree" }; }); patchJson(d, "data/publication.json", (j) => { const c = j.publications[0].derived_counts; c.with_any_rung += 1; c.witnessed += 1; }); }],
  ["the book is retitled in the record — the jacket and the spine follow", (d) => patchJson(d, "data/publication.json", (j) => { const p = j.publications[0]; p.title = "Unboxed Patterns, Revised"; p.subtitle = "A Field Guide to Composable Software"; })],
  ["the tree exactly as it is", () => {}],
  ["a protocol renamed — data may change freely", (d) => patchJson(d, "data/protocols.json", (j) => { const a = j.protocols || j; a[0].name = a[0].name + " (revised)"; })],
  ["a 29th reference — the count is derived, not typed", (d) => patchJson(d, "data/references.json", (j) => { const a = j.references || j; a[a.length - 1].items.push("Nakamura, R. (2026). \"A wholly new citation added by the gate proof.\" arXiv:2601.00001."); })],
  ["the arc count named in a COMMENT, not on the page", (d) => patch(d, "build/idanim.js", (s) => s.replace("/* IDENTITY-CONSTANTS-START", "/* the graph draws 61 arcs; a comment is not page text.\n/* IDENTITY-CONSTANTS-START"))],
  ["a longer covers span", (d) => patchJson(d, "data/surface.json", (j) => { j.surface_rung_covers += ", and nothing else on this surface at all"; })],
  ["a short near-horizontal arc, well under the bound", (d) => patch(d, "build/idanim.js", (s) => s.replace("const HDEG = 8, HMAX = 50;", "const HDEG = 8, HMAX = 58;"))],
];

const BREAKS = [
  ["MAP6 — the heading claims proof over unverified edges", (d) => patchJson(d, "data/stackmap.json", (j) => { j.edges_heading = "What connects them, and what witnesses the connection"; }), "stands over every edge"],
  ["MAP6 — the page heading claims proof", (d) => patch(d, "build/templates.mjs", (s) => s.replace('<div class="stack-edges-head">${esc(edgesHeading)}</div>', '<div class="stack-edges-head">Verified connections</div>')), "heading on the page claims proof"],
  ["PUB2 — an offer with no dates", (d) => patchJson(d, "data/publication.json", (j) => { j.publications[0].free_offer = { note: "limited time" }; }), "PUB2"],
  ["PUB2 — an offer with no post-offer price", (d) => { installEnforcedOffer(d); patchJson(d, "data/publication.json", (j) => { delete j.publications[0].free_offer.price_after; }); }, "price_after"],
  ["PUB2 — an offer with no expiry mechanism", (d) => { installEnforcedOffer(d); patchJson(d, "data/publication.json", (j) => { delete j.publications[0].free_offer.expiry_check; }); }, "expiry_check"],

  ["PUB2 — free before and free after is not an offer", (d) => { installEnforcedOffer(d); patchJson(d, "data/publication.json", (j) => { j.publications[0].free_offer.price_after = { amount: 0, currency: "USD" }; }); }, "it is the price"],
  ["PUB2 — unsupported urgency in the prose", (d) => patchJson(d, "data/surface.json", (j) => { for (const a of j.cta.live_deployed) if (a.publication) a.what = "Limited time only. " + a.what; }), "scarcity theatre"],
  // ── PUB2E: an enforcement claim the tree cannot support ────────────────
  // Each of these is a record that reads exactly like a real launch and is
  // backed by nothing. The old expiry_check passed all six.
  ["PUB2E — a kind outside the vocabulary", (d) => { installEnforcedOffer(d); patchJson(d, "data/publication.json", (j) => { j.publications[0].free_offer.expiry_check.kind = "we_will_remember"; }); }, "prose with a field name"],
  ["PUB2E — a scheduled rebuild that names no workflow", (d) => { installEnforcedOffer(d); patchJson(d, "data/publication.json", (j) => { delete j.publications[0].free_offer.expiry_check.workflow; }); }, "names no workflow"],
  ["PUB2E — a workflow that is not in the tree", (d) => { installEnforcedOffer(d); patchJson(d, "data/publication.json", (j) => { j.publications[0].free_offer.expiry_check.workflow = ".github/workflows/nope.yml"; }); }, "will not run"],
  ["PUB2E — a workflow with no schedule, only a push trigger", (d) => { const { wf } = installEnforcedOffer(d); patchSite(d, wf, (s) => s.replace("on:\n  schedule:\n    - cron: '17 4 * * *'", "on:\n  push:\n    branches: [main]")); }, "whether or not anybody pushes"],
  ["PUB2E — a weekly cron behind a daily claim", (d) => { const { wf } = installEnforcedOffer(d); patchSite(d, wf, (s) => s.replace("'17 4 * * *'", "'17 4 * * 1'")); }, "would outlive its end date"],
  ["PUB2E — a schedule with no receipt", (d) => { installEnforcedOffer(d); patchJson(d, "data/publication.json", (j) => { delete j.publications[0].free_offer.expiry_check.receipt; }); }, "a configured job is not an exercised one"],
  ["PUB2E — a receipt whose run FAILED", (d) => { const { rc } = installEnforcedOffer(d); patchRawJson(d, rc, (r) => { r.execution_identity.exit = 1; }); }, "may not witness an expiry transition"],
  ["PUB2E — a receipt that stood on the OFFER side of the boundary", (d) => { const { rc } = installEnforcedOffer(d); patchRawJson(d, rc, (r) => { r.exercised_after = "2026-11-01"; }); }, "witnessed the offer, not its expiry"],
  ["PUB2E — a receipt that does not say which side it stood on", (d) => { const { rc } = installEnforcedOffer(d); patchRawJson(d, rc, (r) => { delete r.exercised_after; }); }, "which side of the boundary it stood on"],
  ["PUB2 — a dated offer string the record does not derive", (d) => patch(d, "build/templates.mjs", (s) => s.replace('<span class="verb">${esc(bookVerbs[H.primary_cta.publication] || "")}</span>', '<span class="verb">${esc(bookVerbs[H.primary_cta.publication] || "")}</span><span class="offer">Free until 2030-01-01</span>')), "no publication record derives it"],
  ["MAP4 — an integration naming a path that is not there", (d) => patchJson(d, "data/stackmap.json", (j) => { const e = j.edges.find((x) => x.from === "amp"); e.producer = { what: "the compose-law suite", path: "../AmpersandBoxDesign/box-and-box/test/compose-laws.mjs" }; e.consumer = { what: "the derived law manifest", path: "../AmpersandBoxDesign/box-and-box/LAW_MANIFEST.json" }; e.integration = { kind: "receipt", path: "_patterns/receipts/AmpersandBoxDesign__box-and-box__test__compose-laws.mjs.json", exercises: ["../AmpersandBoxDesign/box-and-box/test/compose-laws.mjs", "../AmpersandBoxDesign/box-and-box/LAW_MANIFEST.json"] }; e.integration.path = "_patterns/receipts/NO_SUCH_RECEIPT.json"; }), "is not one"],
  ["MAP4 — an integration that does not touch both ends", (d) => patchJson(d, "data/stackmap.json", (j) => { const e = j.edges.find((x) => x.from === "amp"); e.producer = { what: "the compose-law suite", path: "../AmpersandBoxDesign/box-and-box/test/compose-laws.mjs" }; e.consumer = { what: "the derived law manifest", path: "../AmpersandBoxDesign/box-and-box/LAW_MANIFEST.json" }; e.integration = { kind: "receipt", path: "_patterns/receipts/AmpersandBoxDesign__box-and-box__test__compose-laws.mjs.json", exercises: ["../AmpersandBoxDesign/box-and-box/test/compose-laws.mjs", "../AmpersandBoxDesign/box-and-box/LAW_MANIFEST.json"] }; e.integration.exercises = ["../AmpersandBoxDesign/box-and-box/test/compose-laws.mjs"]; }), "cannot witness the connection"],
    ["MAP4 — an integration citing a run that FAILED", (d) => { patchJson(d, "data/stackmap.json", (j) => { const e = j.edges.find((x) => x.from === "amp"); e.producer = { what: "the compose-law suite", path: "../AmpersandBoxDesign/box-and-box/test/compose-laws.mjs" }; e.consumer = { what: "the derived law manifest", path: "../AmpersandBoxDesign/box-and-box/LAW_MANIFEST.json" }; e.integration = { kind: "receipt", path: "_patterns/receipts/AmpersandBoxDesign__box-and-box__test__compose-laws.mjs.json", exercises: ["../AmpersandBoxDesign/box-and-box/test/compose-laws.mjs", "../AmpersandBoxDesign/box-and-box/LAW_MANIFEST.json"] }; }); patchRawJson(d, "_patterns/receipts/AmpersandBoxDesign__box-and-box__test__compose-laws.mjs.json", (r) => { r.execution_identity.exit = 1; }); }, "may not witness an integration"],
  ["MAP4 — the page draws a state the record does not earn", (d) => patch(d, "build/templates.mjs", (s) => s.replace('data-edge-state="${esc(e.state)}"', 'data-edge-state="solid"')), "and the record earns"],
  ["MAP6 — a non-solid state claims verification", (d) => patchJson(d, "data/stackmap.json", (j) => { j.edge_states.dashed.means = "both endpoints exist, which verifies the connection"; }), "MAP6"],
  ["MAP6 — the page calls mere existence witnessed", (d) => patch(d, "build/templates.mjs", (s) => s.replace('<span class="legend-means">${esc(states[k].means)}</span>', '<span class="legend-means">witnessed by both files existing</span>')), "MAP6 — the legend"],
  ["MAP1 — a node with no protocol and no reason for having none", (d) => patchJson(d, "data/stackmap.json", (j) => { delete j.nodes.find((n) => n.id === "amp").status_why; }), "MAP1"],
  ["MAP1 — the template draws a node with no status chip", (d) => patch(d, "build/templates.mjs", (s) => s.replace('<div class="stack-status">${chips}</div>', '<div class="stack-status"></div>')), "MAP1 — the stack map draws"],
  ["MAP2 — the map prints a status outside the vocabulary", (d) => patch(d, "build/templates.mjs", (s) => s.replace('data-status="${esc(c.status)}"', 'data-status="production-ready"')), "MAP2"],
  ["MAP3 — a node status written down instead of derived", (d) => patchJson(d, "data/stackmap.json", (j) => { j.nodes.find((n) => n.id === "scope").status = "shipped"; }), "MAP3"],
  ["MAP4 — an edge names a path that is not there", (d) => patchJson(d, "data/stackmap.json", (j) => { j.edges[0].consumer.path = "../PRISM/docs/NO_SUCH_FILE.md"; }), "MAP4"],
  ["MAP4 — an end is absent with no reason given", (d) => patchJson(d, "data/stackmap.json", (j) => { delete j.edges.find((e) => e.from === "scope").producer_why; }), "MAP4"],
  ["MAP4 — the page drops an edge the record declares", (d) => patch(d, "build/templates.mjs", (s) => s.replace("${stackEdges.map(edge).join", "${stackEdges.slice(1).map(edge).join")), "and the page does not draw it"],
  ["MAP5 — a protocol no node accounts for", (d) => patchJson(d, "data/stackmap.json", (j) => { const n = j.nodes.find((x) => x.id === "primitives"); n.protocols = n.protocols.filter((p) => p !== "OS-004"); }), "MAP5"],
  ["PUB1 — a download CTA with no file behind it", (d) => patchJson(d, "data/publication.json", (j) => { const p = j.publications[0]; p.delivery = "download"; p.license = "CC BY-SA 4.0"; }), "PUB1"],
  ["PUB3 — a book CTA verb the record does not derive", (d) => patchJson(d, "data/surface.json", (j) => { for (const a of j.cta.live_deployed) if (a.publication) a.verb = "Download the founding edition"; }), "PUB3"],
  ["PUB3 — the template prints a verb the record never held", (d) => patch(d, "build/templates.mjs", (s) => s.replace('<span class="verb">${esc((a.publication && bookVerbs[a.publication]) || a.verb)}</span>', '<span class="verb">${a.publication ? "Download the founding edition" : esc(a.verb)}</span>')), "PUB3 — the page says"],
  ["PUB4 — the verification goes stale", (d) => patchJson(d, "data/publication.json", (j) => { j.publications[0].verified_at = "2020-01-01"; }), "PUB4"],
  ["PUB5 — a file offered with no licence", (d) => patchJson(d, "data/publication.json", (j) => { const p = j.publications[0]; p.delivery = "download"; p.download = { url: "https://example.org/b.epub", bytes: 1, sha256: "0".repeat(64) }; p.license = null; }), "PUB5"],
  ["PUB6 — a chapter count typed against the registry", (d) => patchJson(d, "data/surface.json", (j) => { for (const a of j.cta.live_deployed) if (a.publication) a.what = a.what.replace("32 chapters", "31 chapters"); }), "PUB6"],
  ["PUB7 — a derived count re-typed by hand", (d) => patchJson(d, "data/publication.json", (j) => { j.publications[0].derived_counts.chapters = 30; }), "PUB7"],
  ["PUB7 — the registry the record names is gone", (d) => rmSync(resolve(d, "_patterns/data/patterns.json")), "PUB7"],
  ["PUB8 — an edition number printed while the edition is unruled", (d) => patchJson(d, "data/surface.json", (j) => { for (const a of j.cta.live_deployed) if (a.publication) a.what = "Edition 0.1 is out. " + a.what; }), "PUB8"],
  ["MIS1 — the mission asserts maturity", (d) => patchJson(d, "data/surface.json", (j) => { j.mission = "OpenSentience is the open research and executable protocol layer for agents that accumulate knowledge."; }), "MIS1"],
  ["the mission goes missing altogether", (d) => patchJson(d, "data/surface.json", (j) => { delete j.mission; }), "surface.mission is missing"],
  ["a countable constant that is also page text", (d) => patch(d, "build/idanim.js", (s) => s.replace("const ARCS = 61;", "const ARCS = 12;")), "also appears as text on the page"],
  ["the drawing loses one node", (d) => patch(d, "build/templates.mjs", (s) => s.replace("graph.nodes.map((n) =>", "graph.nodes.slice(1).map((n) =>")), "graph nodes and the driver expects"],
  ["the drawing loses one arc", (d) => patch(d, "build/templates.mjs", (s) => s.replace('const arcs = graph.arcs.map((a) => `<path class="ida"', 'const arcs = graph.arcs.slice(1).map((a) => `<path class="ida"')), "arcs and the driver expects"],
  ["the drawing loses one arrowhead", (d) => patch(d, "build/templates.mjs", (s) => s.replace('const heads = graph.arcs.map((a) => `<path class="idh"', 'const heads = graph.arcs.slice(1).map((a) => `<path class="idh"')), "arrowheads and the driver expects"],
  ["the trace overlay layer is dropped", (d) => patch(d, "build/templates.mjs", (s) => s.replace(/<g\$\{gid\("traces"\)\}>[\s\S]*?<\/g>/, "")), "trace overlays and the driver expects"],
  ["a trace overlay ships visible", (d) => patch(d, "build/templates.mjs", (s) => s.replace('stroke-dasharray="${a.dash}" opacity="0"', 'stroke-dasharray="${a.dash}" opacity="0.4"')), 'do not ship opacity="0"'],
  ["a trace overlay ships with no dash pattern", (d) => patch(d, "build/templates.mjs", (s) => s.replace('stroke-dasharray="${a.dash}" ', "")), "carry no stroke-dasharray"],
  ["the stylesheet pins .idt invisible", (d) => patch(d, "styles/site.css", (s) => s.replace(".idt {\n                fill: none;", ".idt {\n                opacity: 0;\n                fill: none;")), "sets opacity on .idt"],
  ["coordinates drift between drawing and driver", (d) => patch(d, "build/templates.mjs", (s) => s.replace('cx="${n.x}" cy="${n.y}"', 'cx="${(n.x + 1).toFixed(2)}" cy="${n.y}"')), "no longer matches the geometry the driver computes"],
  ["a long near-horizontal arc comes back", (d) => patch(d, "build/idanim.js", (s) => s.replace("const HDEG = 8, HMAX = 50;", "const HDEG = 8, HMAX = 400;")), "of horizontal for more than"],
  ["a <line> inside the animation", (d) => patch(d, "build/templates.mjs", (s) => s.replace('<g${gid("nodes")}>', '<line x1="10" y1="20" x2="290" y2="20"></line>\n                    <g${gid("nodes")}>')), "contains a <line>"],
  ["an <hr> anywhere on the page", (d) => patch(d, "build/templates.mjs", (s) => s.replace('<header class="hero container">', '<hr />\n        <header class="hero container">')), "contains an <hr>"],
  ["the book is moved out of the hero, below the fold", (d) => patch(d, "build/templates.mjs", (s) => s.replace("            ${Book(cover, idgraph)}\n", "").replace("${Hero(site, surface, stats, rung, idgraph, bookVerbs, bookOffers, cover)}", "${Hero(site, surface, stats, rung, idgraph, bookVerbs, bookOffers, cover)}\n\n        ${Book(cover, idgraph)}")), "a cover five sections down"],
  ["the BOOK's cover art loses its marker", (d) => patch(d, "build/templates.mjs", (s) => s.replace('<span class="osbook-art" data-identity-animation', '<span class="osbook-art"')), "the jacket would ship blank"],
  ["the driver looks up a class the artifact lacks", (d) => patch(d, "build/idanim.js", (s) => s.replace('querySelectorAll(".idn")', 'querySelectorAll(".idnode")')), "and the artifact has no such node"],
  ["the IDENTITY-CONSTANTS block is deleted", (d) => patch(d, "build/idanim.js", (s) => s.replace("/* IDENTITY-CONSTANTS-START", "/* CONSTANTS").replace("/* IDENTITY-CONSTANTS-END */", "/* end */")), "declares no IDENTITY-CONSTANTS block"],
  ["the GRAPH region markers are removed", (d) => patch(d, "build/idanim.js", (s) => s.replace("/* GRAPH-END */", "/* end of graph */")), "GRAPH-START"],
  ["an IntersectionObserver is reintroduced", (d) => patch(d, "build/idanim.js", (s) => s.replace("const FRAME = 1000 / 24;", "new IntersectionObserver(function () {});\n    const FRAME = 1000 / 24;")), "reintroduces an IntersectionObserver"],
  ["a retracted string is reinstated elsewhere", (d) => patchJson(d, "data/surface.json", (j) => { j.surface_rung_covers += " All 103 laws"; }), "the bound is 1–1"],
  ["the retraction naming a string disappears", (d) => patch(d, "build/templates.mjs", (s) => s.replace("labelled <em>All 103 laws</em> and pointed at a conformance page", "labelled that way and pointed at a conformance page")), "entitled to name it is missing"],
  ["a retracted string hides in a source comment", (d) => patch(d, "build/idanim.js", (s) => s.replace("/* GRAPH-START", "/* 117 laws — inlined from a comment, invisible to a reader\n/* GRAPH-START")), "which this build publishes"],
  ["the honeypot is deleted", (d) => patch(d, "build/templates.mjs", (s) => s.replace(/<input type="text" name="_gotcha"[^>]*\/>/, "")), "has no _gotcha honeypot"],
  ["the honeypot loses aria-hidden", (d) => patch(d, "build/templates.mjs", (s) => s.replace(' aria-hidden="true" />', " />")), "honeypot is missing"],
  ["the form endpoint drifts from the record", (d) => patch(d, "build/templates.mjs", (s) => s.replace('action="${esc(surface.contact.endpoint)}"', 'action="https://formspree.io/f/somewhere-else"')), "and the record declares"],
  ["the reply paragraph loses its live region", (d) => patch(d, "build/templates.mjs", (s) => s.replace(' aria-live="polite"', "")), "aria-live"],
  ["a mailto: reaches the artifact", (d) => patchJson(d, "data/site.json", (j) => { j.github = "mailto:someone@example.com"; }), "no mailto:"],
  ["the band's rung is written down, not derived", (d) => patchJson(d, "data/surface.json", (j) => { j.surface_rung = "live_deployed"; }), "surface_rung"],
  ["an unrendered template token survives", (d) => patch(d, "build/templates.mjs", (s) => s.replace("<h1>", "<h1>{{HEADLINE}} ")), "unrendered token"],
  // ── Gate 3a: each of the four repairs, undone ──────────────────────────
  ["A11Y1 — the <main> landmark is removed", (d) => patch(d, "build/templates.mjs", (s) => s.replace('<main id="main" tabindex="-1">', "<div>")), "<main> element(s)"],
  ["A11Y1 — <main> loses tabindex, so focus never follows the link", (d) => patch(d, "build/templates.mjs", (s) => s.replace('<main id="main" tabindex="-1">', '<main id="main">')), "the failure that looks like a pass"],
  ["A11Y1 — the skip link is deleted", (d) => patch(d, "build/templates.mjs", (s) => s.replace('<a class="skip-link" href="#main">Skip to main content</a>\n        ', "")), "no .skip-link"],
  ["A11Y1 — something focusable is put in front of the skip link", (d) => patch(d, "build/templates.mjs", (s) => s.replace('<a class="skip-link"', '<a href="/about">About</a>\n        <a class="skip-link"')), "not the first focusable element"],
  ["A11Y1 — the skip link points at nothing", (d) => patch(d, "build/templates.mjs", (s) => s.replace('<a class="skip-link" href="#main">', '<a class="skip-link" href="#contents">')), 'points at "#contents"'],
  ["A11Y1 — the skip link is display:none, gone from the keyboard too", (d) => patch(d, "styles/site.css", (s) => s.replace(/(\.skip-link \{\n)/, "$1                display: none;\n")), "only device that uses it"],
  ["A11Y1 — the :focus rule is deleted and it never comes back", (d) => patch(d, "styles/site.css", (s) => s.replace(".skip-link:focus {\n                left: 0.75rem;\n                top: 0.75rem;\n            }", ".skip-link:x-gone {\n                left: 0.75rem;\n            }")), "never comes back on screen"],
  ["A11Y1 — a :focus rule that changes colour and moves nothing", (d) => patch(d, "styles/site.css", (s) => s.replace(".skip-link:focus {\n                left: 0.75rem;\n                top: 0.75rem;\n            }", ".skip-link:focus {\n                color: var(--acc);\n            }")), "brings nothing back on screen"],
  ["A11Y2 — the heading skip comes back", (d) => patch(d, "build/templates.mjs", (s) => s.replace('<h3 class="ref-group">${g.group}</h3>', '<h4 class="ref-group">${g.group}</h4>')), "jumps h2 → h4"],
  // The probe the whole pairing exists for: the outline is repaired with an
  // empty heading, the sequence check goes quiet, and the build still refuses.
  ["A11Y2 — an EMPTY heading inserted to fake the outline", (d) => patch(d, "build/templates.mjs", (s) => s.replace('<h3 class="ref-group">${g.group}</h3>', '<h3></h3>\n            <h4 class="ref-group">${g.group}</h4>')), "empty <h3> reached the page"],
  ["A11Y2 — a second <h1>", (d) => patch(d, "build/templates.mjs", (s) => s.replace('<h2>Standing on the work of <em>others.</em></h2>', '<h1>Standing on the work of <em>others.</em></h1>')), "<h1>; a document has exactly one"],
  ["A11Y3 — a decorative icon stops being hidden", (d) => patch(d, "build/templates.mjs", (s) => s.replace('<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">', '<svg viewBox="0 0 16 16" focusable="false">')), "neither aria-hidden"],
  ["A11Y3 — the animation is hidden AND named at the same time", (d) => patch(d, "build/templates.mjs", (s) => s.replace('focusable="false" aria-hidden="true">', 'focusable="false" aria-hidden="true" aria-label="the identity graph">')), "both aria-hidden and named"],
  ["A11Y4 — the ring's name is typed into the template again", (d) => patch(d, "build/templates.mjs", (s) => s.replace("<title id=\"loop-ring-name\">${esc(ringName)}</title>", "<title id=\"loop-ring-name\">The five-phase cognition loop</title>")), "name it from the data"],
  ["A11Y4 — the name points at a title that is not there", (d) => patch(d, "build/templates.mjs", (s) => s.replace('aria-labelledby="loop-ring-name"', 'aria-labelledby="loop-ring-caption"')), "points at nothing is not a name"],
  ["A11Y4 — role=img is dropped and the loose numbers become content", (d) => patch(d, "build/templates.mjs", (s) => s.replace('class="loop-ring reveal" role="img"', 'class="loop-ring reveal"')), 'does not declare role="img"'],
  // ── Gate 3b: the seven-section architecture ────────────────────────────
  ["SEC1 — a seventh numbered section (the appendix takes a number)", (d) => patch(d, "build/templates.mjs", (s) => s.replace('<div class="section-label">Appendix</div>', '<div class="section-label"><span class="sec-num">07</span> Appendix</div>')), "the approved architecture has 6"],
  ["SEC1 — a second unnumbered label, adding a section without counting it", (d) => patch(d, "build/templates.mjs", (s) => s.replace('${SecLabel("catalog")}', '<div class="section-label">Aside</div>\n            ${SecLabel("catalog")}')), "without counting them"],
  ["SEC2 — a section prints a number out of sequence", (d) => patch(d, "build/templates.mjs", (s) => s.replace('${SecLabel("catalog")}', '<div class="section-label"><span class="sec-num">09</span> The Catalog</div>')), "the reader's position, not a label"],
  // The drift that was actually there: the rail said "Proof", the page said
  // "The Receipts", and nothing compared them.
  ["SEC3 — the rail and the section disagree about the section's name", (d) => patch(d, "build/templates.mjs", (s) => s.replace('${SecLabel("proof")}', '<div class="section-label"><span class="sec-num">03</span> The Receipts</div>')), "One name."],
  ["SEC4 — the #kappa alias is dropped and two site pages go dead again", (d) => patch(d, "build/templates.mjs", (s) => s.replace('<span id="kappa" aria-hidden="true"></span>', "")), 'id="kappa"'],
  ["SEC4 — a folded section loses the anchor it kept", (d) => patch(d, "build/templates.mjs", (s) => s.replace('<div id="loop" class="stack-block">', '<div class="stack-block">')), "difference between folding and cutting"],
  ["QST1 — a question homed in a protocol that does not exist", (d) => patchJson(d, "data/questions.json", (j) => { j.questions[0].lives_in = ["OS-404"]; }), "no such protocol"],
  ["QST1 — a fourth question under a heading that says three", (d) => patchJson(d, "data/questions.json", (j) => { j.questions.push({ ...j.questions[0], id: "extra" }); }), 'the section is "Three questions"'],
  ["QST2 — a status word typed into the prose beside the derived chip", (d) => patchJson(d, "data/questions.json", (j) => { j.questions[1].established = "OS-009 is in development and already measures the loop."; }), "the copy that goes stale"],
  ["QST3 — a question with no falsifier", (d) => patchJson(d, "data/questions.json", (j) => { delete j.questions[2].settles_it; }), "it is a slogan"],
  // ── the receipt band and the protocol chips ───────────────────────────
  ["REC1 — a comparative claim with nothing on the other side of it", (d) => patchJson(d, "data/receipts.json", (j) => { j[0].note = "graph-backed memory beats flat RAG"; delete j[0].baseline; }), "not a measurement"],
  ["REC1 — a baseline declared with no measured value", (d) => patchJson(d, "data/receipts.json", (j) => { j[0].note = "beats the topology-off arm"; j[0].baseline = { what: "topology off" }; }), "Name what was compared"],
  ["REC2 — a receipt types a status the protocol record derives", (d) => patchJson(d, "data/receipts.json", (j) => { j[0].note = "Graphonomous (OS-001), shipped \u00b7 the ablation is +0.3pp"; }), "the copy that goes stale"],
  ["PRO1 — a protocol re-types its status as a tag", (d) => patchJson(d, "data/protocols.json", (j) => { const a = j.protocols || j; a[0].tags.push({ t: "v0.4.3 \u00b7 shipped" }); }), "delete the tag"],
  ["PRO1 — a protocol re-types its own version as a tag", (d) => patchJson(d, "data/protocols.json", (j) => { const a = j.protocols || j; a[0].tags.push({ t: "engine v0.4.3" }); }), "restates its own version"],
  // ── the cover ─────────────────────────────────────────────────────────
  // The exact string that shipped clipped, restored.
  ["COV2 — the jacket is titled something the record does not say", (d) => patch(d, "build/templates.mjs", (s) => s.replace('<span class="osbook-title">${esc(cover.title)}</span>', '<span class="osbook-title">Unboxed Patterns, Second Edition</span>')), "not a writing choice"],
  ["COV2 — the jacket's subtitle is typed instead of derived", (d) => patch(d, "build/templates.mjs", (s) => s.replace('<span class="osbook-sub">${esc(cover.subtitle)}</span>', '<span class="osbook-sub">A Field Guide to Composable Software</span>')), "and the record says"],
  ["COV3 — the jacket promises a PDF the record has no file for", (d) => patch(d, "build/templates.mjs", (s) => s.replace('<span class="osbook-cta">Read it on the web &rarr;</span>', '<span class="osbook-cta">Download the PDF &rarr;</span>')), "Download verb drawn instead of written"],
  ["COV4 — the book is a picture rather than a link", (d) => patch(d, "build/templates.mjs", (s) => s.replace('<a class="osbook-link" href="${esc(cover.home)}">', '<a class="osbook-link">')), "picture of a book"],
  ["COV4 — the book opens somewhere the record does not name", (d) => patch(d, "build/templates.mjs", (s) => s.replace('<a class="osbook-link" href="${esc(cover.home)}">', '<a class="osbook-link" href="/docs/">')), "and the record's home is"],
  ["COV1 — the cover draws a different number of chapters than the record", (d) => patch(d, "build/build.mjs", (s) => s.replace("const coverMarks = (registryRows || []).map", "const coverMarks = (registryRows || []).slice(1).map")), "cannot show a different book"],
  // The occlusion family. Every one of these produces a page on which the skip
  // link is present, focusable, styled and invisible — the state a browser
  // screenshot caught and four passing gates did not.
  ["A11Y1 — the nav bar is raised above the skip link", (d) => patchSite(d, "amp-nav.js", (s) => s.replace("--amp-nav-z: 9999;", "--amp-nav-z: 20000;")), "cannot be seen"],
  ["A11Y1 — the skip link is stacked under the bar", (d) => patch(d, "styles/site.css", (s) => s.replace("z-index: 10000;", "z-index: 10;")), "cannot be seen"],
  ["A11Y1 — the skip link loses its z-index entirely", (d) => patch(d, "styles/site.css", (s) => s.replace("                z-index: 10000;\n", "")), "paints under the bar"],
  ["A11Y1 — the skip link goes back to position:absolute", (d) => patch(d, "styles/site.css", (s) => s.replace(/(\.skip-link \{[\s\S]*?)position: fixed;/, "$1position: absolute;")), "is not position:fixed"],
  ["A11Y1 — the bar stops publishing the number the bound is derived from", (d) => patchSite(d, "amp-nav.js", (s) => s.replace("--amp-nav-z: 9999;", "/* moved */")), "no longer declares --amp-nav-z"],
];

// ── BOUNDARY: the same record, built on both sides of one offer's end ─────
// r11 says a gate that only proves it refuses is half a gate, and the SOUND
// table above answers that for a single build. An offer is not a single build.
// Accepting the record proves "this record is well formed"; it does not prove
// "a real launch will transition correctly", and until this table existed
// nothing in the harness could tell those two apart.
//
// Each stage installs ONE offer, builds it twice under --as-of — a day inside
// the window and a day past the end — and asserts on the RENDERED CTA both
// times. --as-of writes nothing, so a build standing on a moved clock can never
// become the published page.
const DAY_INSIDE = "2026-11-30";
const DAY_AFTER = "2027-01-02";
const BOUNDARY = [
  [
    "an ENFORCED offer: the date prints inside the window and is gone after it",
    (d) => installEnforcedOffer(d),
    (inside, after) => {
      const bad = [];
      if (!inside.ok) bad.push("the inside-the-window build refused: " + firstError(inside.out));
      if (!after.ok) bad.push("the after-expiry build refused: " + firstError(after.out));
      if (inside.ok && !/<span class="offer">Free until 2026-12-31<\/span>/.test(inside.out)) bad.push("inside the window the rendered CTA does not carry the dated offer");
      if (inside.ok && !/<span class="verb">Read the book<\/span>/.test(inside.out)) bad.push("inside the window the rendered verb is not the contract verb");
      if (after.ok && /Free until/.test(after.out)) bad.push("AFTER EXPIRY the page still renders the dated offer");
      if (after.ok && !/<span class="verb">Download the founding edition<\/span>/.test(after.out)) bad.push("after expiry the rendered CTA did not move to the destination verb");
      return bad;
    },
  ],
  [
    "a PROSPECTIVE offer: nothing prints on either side, and neither build breaks",
    (d) => { installEnforcedOffer(d); patchJson(d, "data/publication.json", (j) => { j.publications[0].free_offer.expiry_check = { kind: "none", cadence: "n/a", how: "nothing rebuilds on a clock here" }; }); },
    (inside, after) => {
      const bad = [];
      if (!inside.ok) bad.push("the inside-the-window build refused: " + firstError(inside.out));
      if (!after.ok) bad.push("the after-expiry build refused: " + firstError(after.out));
      if (inside.ok && /Free until/.test(inside.out)) bad.push("an unenforced offer PRINTED its date inside the window — that is the publication PUB2E exists to withhold");
      if (after.ok && !/<span class="verb">Download the founding edition<\/span>/.test(after.out)) bad.push("after expiry the CTA did not move to the destination verb");
      return bad;
    },
  ],
  [
    "--as-of cannot publish: a build on a moved clock writes nothing",
    (d) => installEnforcedOffer(d),
    (inside, after, dir) => {
      const bad = [];
      // Both builds above ran with --as-of and nothing else has run in this
      // sandbox, so an index.html at the site root would mean the trapdoor
      // opened outwards.
      if (existsSync(resolve(dir, "index.html"))) bad.push("a --as-of build published index.html to the site root");
      if (existsSync(resolve(dir, "_rebuild/dist/index.html"))) bad.push("a --as-of build wrote dist/index.html");
      if (!/NOTHING WRITTEN/.test(inside.out)) bad.push("--as-of did not announce that it wrote nothing");
      return bad;
    },
  ],
];

function firstError(out) {
  const lines = out.split("\n").map((l) => l.trim()).filter(Boolean);
  const m = lines.find((l) => l.startsWith("·") || l.startsWith("-") || /✗/.test(l)) || lines[lines.length - 1] || "(no output)";
  return m.slice(0, 100);
}

let pass = 0, fail = 0;
const rows = [];

for (const [name, mutate] of SOUND) {
  const d = sandbox();
  let applied = true, why = "";
  try { mutate(d); } catch (e) { applied = false; why = e.message; }
  const r = run(d);
  const ok = applied && r.ok;
  rows.push([ok, "SOUND ", name, !applied ? "MUTATION DID NOT APPLY: " + why : r.ok ? "built" : "REFUSED legitimate input: " + firstError(r.out)]);
  ok ? pass++ : fail++;
  rmSync(d, { recursive: true, force: true });
}
for (const [name, mutate, expect] of BREAKS) {
  const d = sandbox();
  let applied = true, why = "";
  try { mutate(d); } catch (e) { applied = false; why = e.message; }
  const r = run(d);
  const refused = !r.ok;
  const right = applied && refused && r.out.includes(expect);
  rows.push([right, "REFUSE", name, !applied ? "MUTATION DID NOT APPLY: " + why : !refused ? "BUILT ANYWAY" : right ? "…" + expect + "…" : "WRONG REASON: " + firstError(r.out)]);
  right ? pass++ : fail++;
  rmSync(d, { recursive: true, force: true });
}

for (const [name, mutate, assertBoth] of BOUNDARY) {
  const d = sandbox();
  // The dist/ copied into the sandbox would make the "wrote nothing" check
  // meaningless, so it goes before either build runs.
  rmSync(resolve(d, "_rebuild/dist/index.html"), { force: true });
  let applied = true, why = "";
  try { mutate(d); } catch (e) { applied = false; why = e.message; }
  let bad = ["MUTATION DID NOT APPLY: " + why];
  if (applied) {
    const inside = run(d, [`--as-of=${DAY_INSIDE}`]);
    const after = run(d, [`--as-of=${DAY_AFTER}`]);
    bad = assertBoth(inside, after, d);
  }
  const ok = applied && bad.length === 0;
  rows.push([ok, "BOTH  ", name, ok ? `${DAY_INSIDE} and ${DAY_AFTER} both as specified` : bad.join("; ")]);
  ok ? pass++ : fail++;
  rmSync(d, { recursive: true, force: true });
}

console.log("── SOUND: the gate must PERMIT these ──");
for (const r of rows.filter((r) => r[1] === "SOUND ")) console.log(` ${r[0] ? "✓" : "✗"}  ${r[2].padEnd(50)} ${r[3]}`);
console.log("\n── REFUSE: each must fail with its OWN message ──");
for (const r of rows.filter((r) => r[1] === "REFUSE")) console.log(` ${r[0] ? "✓" : "✗"}  ${r[2].padEnd(50)} ${r[3]}`);
console.log("\n── BOTH SIDES: one offer, two build days, the rendered CTA each time ──");
for (const r of rows.filter((r) => r[1] === "BOTH  ")) console.log(` ${r[0] ? "✓" : "✗"}  ${r[2].padEnd(50)} ${r[3]}`);
console.log(`\n${pass} green, ${fail} red   (${SOUND.length} soundness probes · ${BREAKS.length} deliberate breaks · ${BOUNDARY.length} boundary crossings)`);
rmSync(PRIVATE, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
