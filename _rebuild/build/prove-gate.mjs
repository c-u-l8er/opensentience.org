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
import { readFileSync, writeFileSync, cpSync, mkdtempSync, rmSync, mkdirSync } from "node:fs";
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

function sandbox() {
  const dir = mkdtempSync(join(PRIVATE, "s-"));
  cpSync(SRC, resolve(dir, "_rebuild"), { recursive: true });
  return dir;
}
function run(dir) {
  try {
    const out = execFileSync("node", [resolve(dir, "_rebuild/build/build.mjs")], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
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
function patchJson(dir, rel, fn) {
  const p = resolve(dir, "_rebuild", rel);
  const j = JSON.parse(readFileSync(p, "utf8"));
  fn(j);
  writeFileSync(p, JSON.stringify(j, null, 2));
}

const SOUND = [
  ["the tree exactly as it is", () => {}],
  ["a protocol renamed — data may change freely", (d) => patchJson(d, "data/protocols.json", (j) => { const a = j.protocols || j; a[0].name = a[0].name + " (revised)"; })],
  ["a 29th reference — the count is derived, not typed", (d) => patchJson(d, "data/references.json", (j) => { const a = j.references || j; a[a.length - 1].items.push("Nakamura, R. (2026). \"A wholly new citation added by the gate proof.\" arXiv:2601.00001."); })],
  ["the arc count named in a COMMENT, not on the page", (d) => patch(d, "build/idanim.js", (s) => s.replace("/* IDENTITY-CONSTANTS-START", "/* the graph draws 61 arcs; a comment is not page text.\n/* IDENTITY-CONSTANTS-START"))],
  ["a longer covers span", (d) => patchJson(d, "data/surface.json", (j) => { j.surface_rung_covers += ", and nothing else on this surface at all"; })],
  ["a short near-horizontal arc, well under the bound", (d) => patch(d, "build/idanim.js", (s) => s.replace("const HDEG = 8, HMAX = 50;", "const HDEG = 8, HMAX = 58;"))],
];

const BREAKS = [
  ["a countable constant that is also page text", (d) => patch(d, "build/idanim.js", (s) => s.replace("const ARCS = 61;", "const ARCS = 12;")), "also appears as text on the page"],
  ["the drawing loses one node", (d) => patch(d, "build/templates.mjs", (s) => s.replace("graph.nodes.map((n) =>", "graph.nodes.slice(1).map((n) =>")), "graph nodes and the driver expects"],
  ["the drawing loses one arc", (d) => patch(d, "build/templates.mjs", (s) => s.replace('const arcs = graph.arcs.map((a) => `<path class="ida"', 'const arcs = graph.arcs.slice(1).map((a) => `<path class="ida"')), "arcs and the driver expects"],
  ["the drawing loses one arrowhead", (d) => patch(d, "build/templates.mjs", (s) => s.replace('const heads = graph.arcs.map((a) => `<path class="idh"', 'const heads = graph.arcs.slice(1).map((a) => `<path class="idh"')), "arrowheads and the driver expects"],
  ["the trace overlay layer is dropped", (d) => patch(d, "build/templates.mjs", (s) => s.replace(/<g id="idanim-traces">[\s\S]*?<\/g>/, "")), "trace overlays and the driver expects"],
  ["a trace overlay ships visible", (d) => patch(d, "build/templates.mjs", (s) => s.replace('stroke-dasharray="${a.dash}" opacity="0"', 'stroke-dasharray="${a.dash}" opacity="0.4"')), 'do not ship opacity="0"'],
  ["a trace overlay ships with no dash pattern", (d) => patch(d, "build/templates.mjs", (s) => s.replace('stroke-dasharray="${a.dash}" ', "")), "carry no stroke-dasharray"],
  ["the stylesheet pins .idt invisible", (d) => patch(d, "styles/site.css", (s) => s.replace(".idt {\n                fill: none;", ".idt {\n                opacity: 0;\n                fill: none;")), "sets opacity on .idt"],
  ["coordinates drift between drawing and driver", (d) => patch(d, "build/templates.mjs", (s) => s.replace('cx="${n.x}" cy="${n.y}"', 'cx="${(n.x + 1).toFixed(2)}" cy="${n.y}"')), "no longer matches the geometry the driver computes"],
  ["a long near-horizontal arc comes back", (d) => patch(d, "build/idanim.js", (s) => s.replace("const HDEG = 8, HMAX = 50;", "const HDEG = 8, HMAX = 400;")), "of horizontal for more than"],
  ["a <line> inside the animation", (d) => patch(d, "build/templates.mjs", (s) => s.replace('<g id="idanim-nodes">', '<line x1="10" y1="20" x2="290" y2="20"></line>\n                    <g id="idanim-nodes">')), "contains a <line>"],
  ["an <hr> anywhere on the page", (d) => patch(d, "build/templates.mjs", (s) => s.replace('<header class="hero container">', '<hr />\n        <header class="hero container">')), "contains an <hr>"],
  ["the animation root loses its marker", (d) => patch(d, "build/templates.mjs", (s) => s.replace('<div class="idanim" data-identity-animation', '<div class="idanim"')), "no [data-identity-animation] element"],
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

console.log("── SOUND: the gate must PERMIT these ──");
for (const r of rows.filter((r) => r[1] === "SOUND ")) console.log(` ${r[0] ? "✓" : "✗"}  ${r[2].padEnd(50)} ${r[3]}`);
console.log("\n── REFUSE: each must fail with its OWN message ──");
for (const r of rows.filter((r) => r[1] === "REFUSE")) console.log(` ${r[0] ? "✓" : "✗"}  ${r[2].padEnd(50)} ${r[3]}`);
console.log(`\n${pass} green, ${fail} red   (${SOUND.length} soundness probes · ${BREAKS.length} deliberate breaks)`);
rmSync(PRIVATE, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
