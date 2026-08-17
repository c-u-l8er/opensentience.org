// Components as plain template-literal functions — no framework, no JSX, zero deps.
// Drift-prone lists (protocols, loop phases, receipts, rungs, references) are
// rendered from JSON data; the count and id-range in the hero/headings are
// DERIVED, never typed — that is the anti-drift guarantee that makes "missing
// OS-011/OS-012" or a wrong count structurally impossible.

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// substrate → colour token (used by the loop ring + map)
const SUB = {
  memory: "var(--cyan)",
  reason: "var(--blue)",
  time: "var(--rose)",
  space: "var(--amber)",
  body: "var(--amber)",
  governance: "var(--accent)",
  system: "var(--accent)",
  evaluation: "var(--rose)",
  temporal: "var(--rose)",
};

const GH_SVG = `<svg viewBox="0 0 16 16"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>`;

// The ordered spine. Single source for the left rail + section numbering.
const SECTIONS = [
  { id: "gap", label: "The Gap" },
  { id: "loop", label: "The Loop" },
  { id: "protocols", label: "Protocols" },
  { id: "proof", label: "Proof" },
  { id: "status", label: "Status" },
  { id: "stack", label: "The Stack" },
  { id: "open-questions", label: "Open Questions" },
  { id: "get-involved", label: "Get Involved" },
  { id: "references", label: "References" },
];
const NUM = (id) => String(SECTIONS.findIndex((s) => s.id === id) + 1).padStart(2, "0");

// ─────────────────────────────────────────────────────────────────────────
export function Nav(site) {
  const links = site.nav.map((l) => `<li><a href="${esc(l.href)}">${l.label}</a></li>`).join("\n                    ");
  return `<nav>
            <div class="nav-inner">
                <a href="/" class="logo">
                    <span class="mark">OS</span>
                    OpenSentience
                </a>
                <ul class="nav-links">
                    ${links}
                </ul>
            </div>
        </nav>`;
}

// ─────────────────────────────────────────────────────────────────────────
export function SpineToc() {
  const items = SECTIONS.map(
    (s) =>
      `<li><a href="#${s.id}" data-spine="${s.id}"><span class="spine-num">${NUM(s.id)}</span><span class="spine-label">${esc(s.label)}</span></a></li>`,
  ).join("\n                ");
  return `<nav class="spine" aria-label="Section index">
            <ol>
                ${items}
            </ol>
        </nav>`;
}

// ─────────────────────────────────────────────────────────────────────────
// The placement band (SHELL.md §1). It sits at the very top of <body>, above
// everything, and answers "where am I in this thing?" before anything loads.
//
// It is rendered at BUILD time, never by a script: a chip painted by JavaScript
// is blank to anything that does not run scripts, and blank reads as "no
// status" rather than "unknown".
export const RUNGS = ["spec", "in_tree", "live_local", "live_deployed", "external"];

// The identifying animation's graph is drawn as MARKUP, not by script, so it
// is there with JavaScript off — only the drifting and the lighting are gone.
// The geometry is not written here: build.mjs extracts it from the driver
// (build/idanim.js, between GRAPH-START and GRAPH-END) and hands it in. There
// is exactly one description of where a node is and which way an arc points,
// so the drawing and the driver cannot disagree about it.
export function IdAnimSvg(graph) {
  const arcs = graph.arcs.map((a) => `<path class="ida" d="${a.d}"></path>`).join("\n                        ");
  const heads = graph.arcs.map((a) => `<path class="idh" d="${a.head}"></path>`).join("\n                        ");
  const nodes = graph.nodes.map((n) => `<circle class="idn" cx="${n.x}" cy="${n.y}" r="${graph.r}"></circle>`).join("\n                        ");
  return `<svg viewBox="0 0 300 430" preserveAspectRatio="xMidYMid meet" focusable="false">
                    <g id="idanim-arcs">
                        ${arcs}
                    </g>
                    <g id="idanim-heads">
                        ${heads}
                    </g>
                    <g id="idanim-nodes">
                        ${nodes}
                    </g>
                </svg>`;
}

export function rungChip(value) {
  // A defaulted rung is a fabricated status, so there is no default.
  const r = RUNGS.includes(value) ? value : "?";
  return `<span class="rung" data-rung="${r}" title="spec · in_tree · live_local · live_deployed · external">${r}</span>`;
}

export function Band(surface, rung) {
  // A tier-4 surface drops the layer claim — attribution, not membership.
  // OpenSentience is amp-nav place:2, so it keeps it.
  const where =
    surface.tier === 4
      ? `A <b>${esc(surface.parent)}</b> project`
      : `${esc(surface.surface)} is the <b>${esc(surface.layer)}</b> layer of ${esc(surface.parent)}`;
  return `<div class="band"${surface.tier === 4 ? ' data-tier="4"' : ""}>
            <span class="where">${where}</span>
            ${rungChip(rung)}
            <span class="covers">That chip covers ${surface.surface_rung_covers}.</span>
        </div>`;
}

// ─────────────────────────────────────────────────────────────────────────
export function Hero(site, surface, stats, rung, idgraph) {
  const range = `${stats.first} → ${stats.last}`;
  const bs = stats.byStatus;
  const statusChip = [
    [bs["shipped"], "shipped"],
    [bs["spec-complete"], "spec-complete"],
    [bs["in-development"], "in development"],
    [bs["draft"], "draft"],
  ]
    .filter(([n]) => n)
    .map(([n, label]) => `${n} ${label}`)
    .join(" · ");
  return `<header class="hero container">
            <div class="hero-front">
                <div class="hero-eyebrow">The question this site exists to answer</div>
                <h1>Does the shape of a knowledge graph tell you <em>when to think harder?</em></h1>
                <p class="subtitle">
                    Below, that question is answered exhaustively and in your own
                    browser: for every directed graph on two to five nodes and
                    every finite map on two to seven, κ&nbsp;&gt;&nbsp;0 holds
                    exactly when the graph contains an irreducible feedback loop.
                    <strong>The theorem is settled and the useful part is not.</strong>
                    Routing a system's reasoning on that signal is a claim
                    nothing here tests, and the ${stats.total} protocols on this
                    page are honest one by one about which of the two they are.
                </p>
                <div class="cta-row">
                    <a href="#proof" class="btn btn-primary">Run the proof yourself</a>
                    <a href="#status" class="btn">What this does not establish</a>
                    <a href="${esc(site.github)}" class="btn btn-github">${GH_SVG}Star on GitHub</a>
                </div>
                <div class="receipts-strip reveal">
                    <span class="receipt-chip"><strong>${stats.total}</strong> protocols</span>
                    <span class="receipt-chip"><strong>${range}</strong></span>
                    <span class="receipt-chip">${statusChip}</span>
                </div>
            </div>
            <!-- The identifying animation (SHELL.md §8): a directed graph whose
                 arcs drift, lighting whichever loop they happen to close. That
                 is this page's own subject — κ > 0 holds exactly when a graph
                 contains an irreducible feedback loop. It comes AFTER the h1 in
                 source order and sits behind it, because the question comes
                 first. It renders no data and asserts nothing: /idanim.js takes
                 no input from this document and writes nothing back into it
                 except an opacity, a dash offset and a class name, and its node
                 and arc counts are DELIBERATELY not the eight rungs, the twelve
                 protocols or any law total — the build refuses if one of them
                 turns up as text on this page. Delete the script tag at the
                 foot of this file and the graph is still drawn, still; every
                 figure, chip, status row and count is still here. It replaced a
                 29-rung ladder that read, on paper stock, as ruled notebook
                 paper with two stray horizontal rules. -->
            <div class="idanim" data-identity-animation aria-hidden="true">
                ${IdAnimSvg(idgraph)}
            </div>
        </header>`;
}

// ─────────────────────────────────────────────────────────────────────────
// The status block (SHELL.md §2). LIMIT is the load-bearing row: it is not a
// caveat and not a disclaimer, it is the strongest claim a reader would
// reasonably infer that the evidence does not support. If it could be deleted
// without changing what a reader believes, it is not doing its job.
export function StatusBlock(surface, rung) {
  return `<section id="status" class="container">
            <div class="section-label"><span class="sec-num">${NUM("status")}</span> Status</div>
            <h2>What this page is <em>entitled</em> to claim.</h2>
            <p class="lead">
                Every surface in this portfolio carries the same five rows, and
                the fourth is the one that costs something to write. The chip in
                the band above reads <strong>${rung}</strong>, and it reads that
                because it is derived from the twelve protocol statuses rather
                than chosen — a page with one shipped protocol and five drafts
                does not get to average itself into a rung.
            </p>
            <dl class="status">
                <div><dt>Status</dt><dd>${surface.status.statement}</dd></div>
                <div><dt>Last verified</dt><dd>${esc(surface.verified_at)}</dd></div>
                <div><dt>Source</dt><dd>${surface.status.source}</dd></div>
                <div class="limit"><dt>Limit</dt><dd>${surface.status.limit}</dd></div>
                <div><dt>Next rung</dt><dd><strong>${esc(surface.advance.next_rung)}</strong> — ${surface.advance.requires}</dd></div>
            </dl>
        </section>`;
}

// ─────────────────────────────────────────────────────────────────────────
// One CTA group per rung, never one blended group. A page may only ask a
// visitor to do what its rung has earned; build.mjs enforces the verb table.
export function CtaGroups(surface) {
  const ORDER = ["external", "live_deployed", "live_local", "in_tree", "spec"];
  return ORDER.filter((r) => surface.cta[r])
    .map((r) => {
      const witnessed = ["external", "live_deployed", "live_local"].includes(r);
      const cards = surface.cta[r]
        .map((a) => `<a href="${esc(a.href)}"><span class="verb">${esc(a.verb)}</span><span class="what">${a.what}</span></a>`)
        .join("\n                    ");
      return `<div class="ctagroup">
                <div class="tag${witnessed ? " ok" : ""}">${esc(r)} &mdash; ${esc(surface.cta._labels[r])}</div>
                <div class="cta">
                    ${cards}
                </div>
            </div>`;
    })
    .join("\n            ");
}

// ─────────────────────────────────────────────────────────────────────────
// §1 — The Gap: generator vs. system
export function TheGap() {
  const row = (label, gen, sys, os) =>
    `<div class="gap-row reveal">
                    <div class="gap-axis">${label}</div>
                    <div class="gap-gen">${gen}</div>
                    <div class="gap-sys">${sys}<span class="gap-os">${os}</span></div>
                </div>`;
  return `<section id="gap" class="container">
            <div class="section-label"><span class="sec-num">${NUM("gap")}</span> The Gap</div>
            <h2>A generator answers. A <em>system</em> accumulates.</h2>
            <p class="lead">
                The agent ecosystem builds on a frozen model and prays. The
                limiting factor isn't raw model intelligence — it's memory
                architecture, deliberation structure, temporal grounding, and
                governance. Those are infrastructure problems, not parameter
                problems. Here is the gap, axis by axis.
            </p>

            <div class="gap-table reveal">
                <div class="gap-head">
                    <div class="gap-axis"></div>
                    <div class="gap-gen-head">A generator</div>
                    <div class="gap-sys-head">A cognitive system</div>
                </div>
                ${row("Memory", "forgets past the context window", "typed graph — nodes, confidence, provenance", "OS-001")}
                ${row("Evidence", "every answer equally certain", "weighs evidence across sessions; decays", "OS-001")}
                ${row("Reasoning", "one forward pass, always", "routes on topology; deliberates only when κ&gt;0", "OS-002 · OS-003")}
                ${row("Time", "stateless; no sense of when", "has a heartbeat — declares its own cadence", "OS-010 PULSE")}
                ${row("World", "text in, text out", "perceives &amp; acts through a body; learns from surprise", "OS-011")}
                ${row("Control", "deploy and pray", "permissions, audit, autonomy; every verdict certified", "OS-006 · box-and-box")}
            </div>
        </section>`;
}

// ─────────────────────────────────────────────────────────────────────────
// §2 — The Cognition Loop (the spine of the whole portfolio)
export function TheLoop(loop) {
  const C = 200,
    R = 130,
    LR = 132;
  const phases = loop.phases.map((p, i) => {
    const a = ((-90 + i * 72) * Math.PI) / 180;
    return { ...p, idx: i + 1, x: C + R * Math.cos(a), y: C + R * Math.sin(a), color: SUB[p.primitive] || "var(--accent)" };
  });
  const nodes = phases
    .map(
      (p) =>
        `<g class="loop-node"><circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="26" fill="${p.color}"></circle><text x="${p.x.toFixed(1)}" y="${(p.y + 6).toFixed(1)}" text-anchor="middle" class="loop-node-num">${p.idx}</text></g>`,
    )
    .join("\n                ");
  const legend = phases
    .map(
      (p) =>
        `<li class="reveal"><span class="loop-badge" style="background:${p.color}">${p.idx}</span>
                    <div><strong>${esc(p.verb)}</strong> <span class="loop-gloss">${p.gloss}</span>
                    <span class="loop-protos">${p.protocols.map((x) => `<a href="#protocols">${x}</a>`).join(" · ")}</span></div></li>`,
    )
    .join("\n                ");
  const rings = loop.rings
    .map(
      (r) =>
        `<div class="ring-card reveal"><div class="ring-label">${esc(r.label)}</div><p>${r.note}</p><div class="ring-protos">${r.protocols.join(" · ")}</div></div>`,
    )
    .join("\n                ");
  return `<section id="loop" class="container">
            <div class="section-label"><span class="sec-num">${NUM("loop")}</span> The Cognition Loop</div>
            <h2>Cognition is a loop, <em>not a prompt.</em></h2>
            <p class="lead">
                Every system in the [&amp;] portfolio runs the same five-phase
                loop — the canonical PULSE phase kinds, which are exactly the
                Graphonomous machine architecture. Each phase is a place where
                a protocol does its work. The loop is wrapped by governance,
                clocked by PULSE, gauged by PRISM, and bounded by SCOPE.
            </p>

            <div class="loop-grid">
                <svg viewBox="0 0 400 400" class="loop-ring reveal" role="img" aria-label="The five-phase cognition loop: retrieve, route, act, learn, consolidate">
                    <circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="var(--accent-dim)" stroke-width="2" stroke-dasharray="3 7" opacity="0.55"></circle>
                    <text x="${C}" y="${C - 4}" text-anchor="middle" class="loop-center-1">↻ the</text>
                    <text x="${C}" y="${C + 16}" text-anchor="middle" class="loop-center-2">cognition loop</text>
                    ${nodes}
                </svg>
                <ol class="loop-legend">
                    ${legend}
                </ol>
            </div>

            <p class="ring-intro reveal">Wrapped, clocked, gauged &amp; bounded —</p>
            <div class="ring-band">
                ${rings}
            </div>
        </section>`;
}

// ─────────────────────────────────────────────────────────────────────────
export function ProtocolCard(p) {
  const featured = p.featured ? " paper-card--featured" : "";
  const numColor = p.featured ? ' style="color: var(--accent)"' : "";
  const tags = p.tags
    .map((t) => {
      const inner = t.href ? `<a href="${esc(t.href)}" style="color: inherit">${t.t}</a>` : t.t;
      return `<span class="paper-tag${t.cls ? " " + t.cls : ""}">${inner}</span>`;
    })
    .join("\n                        ");
  return `<div class="paper-card reveal${featured}" data-primitive="${esc(p.dataPrimitive)}">
                    <div class="paper-number"${numColor}>${p.paperNumber}</div>
                    <h3>${p.paperTitle}</h3>
                    <p class="paper-desc">${p.paperDesc}</p>
                    <div class="paper-tags">
                        ${tags}
                    </div>
                </div>`;
}

// §3 — The Protocol Map (two tiers: primitives + cross-cutting algebras)
export function ProtocolMap(protocols, stats) {
  const range = `${stats.first} → ${stats.last}`;
  const cognitive = protocols.filter((p) => p.group === "cognitive");
  const crossCutting = protocols.filter((p) => p.group !== "cognitive");
  const bs = stats.byStatus;
  const legend = [
    ["shipped", "status-published", "Shipped"],
    ["spec-complete", "status-spec", "Spec complete"],
    ["in-development", "status-spec", "In development"],
    ["draft", "status-draft", "Draft"],
  ]
    .filter(([k]) => bs[k])
    .map(([k, cls, label]) => `<span class="paper-tag ${cls}">${label} · ${bs[k]}</span>`)
    .join("\n                ");
  const grounding = (color, title, desc) =>
    `<div class="ground-card reveal"><div class="ground-amp" style="color:${color}">&amp;</div><div><strong>${title}</strong><p>${desc}</p></div></div>`;
  return `<section id="protocols" class="container">
            <div class="section-label"><span class="sec-num">${NUM("protocols")}</span> The Protocol Map</div>
            <h2>${stats.total} protocols. The <em>shape</em> of a mind.</h2>
            <p class="lead">
                Not a list — a structure. <strong>Eight cognitive primitives</strong>
                (${cognitive[0].id} → ${cognitive[cognitive.length - 1].id}), each one capability of an
                intelligent system, grounded in cognitive science. Above them,
                <strong>four cross-cutting algebras</strong> that measure, time,
                embody, and bound the whole — the rings around the loop. Range
                ${range}, every entry honest about its status.
            </p>
            <div class="status-legend reveal">
                ${legend}
            </div>

            <h3 class="map-tier">Eight cognitive primitives <span>${cognitive[0].id} → ${cognitive[cognitive.length - 1].id} · the capabilities</span></h3>
            <div class="papers-grid map-grid">
                ${cognitive.map(ProtocolCard).join("\n\n                ")}
            </div>

            <h3 class="map-tier">Four cross-cutting algebras <span>${crossCutting[0].id} → ${crossCutting[crossCutting.length - 1].id} · the rings</span></h3>
            <div class="papers-grid map-grid">
                ${crossCutting.map(ProtocolCard).join("\n\n                ")}
            </div>

            <h3 class="map-tier">Grounded in cognitive science, <span>not analogy</span></h3>
            <div class="ground-grid reveal">
                ${grounding("var(--cyan)", "&amp;memory → hippocampus + neocortex", "Tulving's episodic/semantic split; multi-store memory; hippocampal–neocortical replay. Graphonomous consolidates fast→slow on idle.")}
                ${grounding("var(--blue)", "&amp;reason → prefrontal cortex", "Kahneman's dual-process theory. κ-routing implements the System-1/System-2 split mechanically, from graph topology alone.")}
                ${grounding("var(--rose)", "&amp;time → cerebellum + basal ganglia", "Temporal-difference learning; sequence timing. PULSE gives every loop a declared cadence and cross-loop signals.")}
                ${grounding("var(--amber)", "&amp;space → entorhinal grid cells", "O'Keefe &amp; Nadel's cognitive-map theory; place &amp; grid cells. SCOPE is an N-D region algebra for shared-space coordination.")}
            </div>
        </section>`;
}

// ─────────────────────────────────────────────────────────────────────────
// §4 — Proof: receipts + κ explainer + runnable verifier + live validation
function ReceiptsBand(receipts) {
  const cards = receipts
    .map(
      (r) =>
        `<a class="receipt-card reveal" href="${esc(r.href)}"><div class="receipt-metric">${esc(r.metric)}</div><div class="receipt-value">${esc(r.value)}${r.unit ? `<span class="receipt-unit">${esc(r.unit)}</span>` : ""}</div><p>${esc(r.note)}</p></a>`,
    )
    .join("\n                ");
  return `<div class="receipts-grid">
                ${cards}
            </div>`;
}

export function Proof(receipts) {
  const preStyle =
    "margin-top: 1rem; background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 8px; padding: 1.25rem; font-family: var(--mono); font-size: 0.8rem; line-height: 1.7; color: var(--text-secondary);";
  return `<section id="proof" class="container">
            <div class="section-label"><span class="sec-num">${NUM("proof")}</span> The Receipts</div>
            <h2>We don't ask you to trust the thesis. <em>We ship the receipts.</em></h2>
            <p class="lead">
                Every claim here is checkable. The headline κ proof runs
                exhaustively, in your browser, with no server and no trust
                required — and it's only one of the receipts.
            </p>

            ${ReceiptsBand(receipts)}

            <h3 class="map-tier" style="margin-top:4rem">The κ invariant <span>OS-002 · topology as a cognition signal</span></h3>
            <div class="kappa-visual reveal">
                <div class="kappa-box dag">
                    <h4>DAG region</h4>
                    <div class="kappa-val">κ = 0</div>
                    <div class="kappa-label">No circular dependencies. Context is one traversal. Route: <strong>fast</strong> — no deliberation needed.</div>
                </div>
                <div class="kappa-box scc">
                    <h4>SCC region</h4>
                    <div class="kappa-val">κ &gt; 0</div>
                    <div class="kappa-label">Irreducible feedback loops. κ measures entanglement depth. Route: <strong>deliberate</strong> — fault lines become prompt boundaries.</div>
                </div>
            </div>
            <p class="reveal" style="color: var(--text-secondary)">
                The graph's structure mechanically determines the prompt
                structure — no human prompt engineering. The topology
                <em>is</em> the reasoning template. The Deliberator writes
                conclusions back as new nodes, so κ falls as uncertainty
                crystallizes into settled knowledge.
            </p>

            <h3 class="map-tier" style="margin-top:3.5rem">Verify it yourself <span>1,926,351 finite systems · 0 counterexamples</span></h3>
            <p class="reveal" style="color: var(--text-secondary); margin-bottom: 0.5rem">
                <strong>Part 1 — Directed graphs (n=2..5):</strong> for all
                1,052,740 graphs, verify κ(G) &gt; 0 ⟺ β₁(G) &gt; 0 ⟺ G has a
                nontrivial strongly connected component.
            </p>
            <p class="reveal" style="color: var(--text-secondary); margin-bottom: 1.5rem">
                <strong>Part 2 — Finite dynamical systems (n=2..7):</strong> for
                all 873,611 maps f:[n]→[n], verify κ(TransitionGraph(f)) &gt; 0 ⟺
                f has a periodic orbit of period &gt; 1.
            </p>

            <div class="proof-controls reveal">
                <button id="proof-run-btn" class="btn-run" onclick="startProof()">Run exhaustive proof</button>
                <span id="proof-status" class="proof-status"></span>
            </div>
            <div id="proof-progress" class="proof-progress"><div id="proof-progress-bar" class="proof-progress-bar"></div></div>
            <div id="proof-log" class="proof-log"></div>
            <div id="proof-results" class="proof-results">
                <h4 style="font-family: var(--sans); font-size: 0.9rem; color: var(--text-dim); margin-bottom: 0.75rem;">Part 1: Directed graphs</h4>
                <table class="proof-table">
                    <thead><tr><th>n</th><th class="num">Graphs</th><th class="num">With SCCs</th><th class="num">Failures</th><th class="num">r(κ, β₁)</th><th class="num">Time</th><th>Status</th></tr></thead>
                    <tbody id="graph-results-body"></tbody>
                </table>
                <h4 style="font-family: var(--sans); font-size: 0.9rem; color: var(--text-dim); margin-top: 2rem; margin-bottom: 0.75rem;">Part 2: Finite dynamical systems</h4>
                <table class="proof-table">
                    <thead><tr><th>n</th><th class="num">Maps</th><th class="num">Periodic</th><th class="num">Failures</th><th class="num">Time</th><th>Status</th></tr></thead>
                    <tbody id="dyn-results-body"></tbody>
                </table>
            </div>
            <div id="proof-verdict" class="proof-verdict"></div>

            <h3 class="map-tier" style="margin-top:4rem">From theorem to <span>shipping product</span></h3>
            <p class="reveal" style="color: var(--text-secondary); margin-bottom: 1.5rem">
                The proof verifies the invariant across 1,926,351 mathematical
                objects. Here is what happens when κ meets a real knowledge graph
                on a live MCP server.
            </p>
            <div class="kappa-visual reveal">
                <div class="paper-card" data-primitive="reason">
                    <div class="paper-number">Step 1</div>
                    <h3>Store a business cycle</h3>
                    <pre style="${preStyle}">4 nodes stored:
  Market Share → Revenue → R&amp;D → Product Quality → Market Share

All edges: causal type
MCP tools used: store_node × 4, then edge creation</pre>
                </div>
                <div class="paper-card" data-primitive="reason">
                    <div class="paper-number">Step 2</div>
                    <h3>Analyze topology</h3>
                    <pre style="${preStyle}"><span style="color: var(--text-dim);">routing:</span>        <span style="color: var(--blue);">deliberate</span>
<span style="color: var(--text-dim);">max_kappa:</span>      <span style="color: var(--blue);">1</span>
<span style="color: var(--text-dim);">scc_count:</span>      <span style="color: var(--blue);">1</span>
<span style="color: var(--text-dim);">fault_line:</span>     <span style="color: var(--rose);">Product Quality → Market Share</span>
<span style="color: var(--text-dim);">deliberation:</span>   <span style="color: var(--blue);">max_iterations: 2, agents: 1, confidence: 0.75</span></pre>
                </div>
            </div>
            <div class="thesis-block reveal" style="border-left-color: var(--blue)">
                The system identified one strongly connected component over all
                four nodes, computed κ = 1, and named Product Quality → Market
                Share as the fault-line edge — the single edge whose removal
                breaks the loop. This is the first agent memory system to route
                inference depth on proved graph topology.
                <span class="attribution">— Phase 0 validation · 13/13 MCP integration checks passed</span>
            </div>
        </section>`;
}

// ─────────────────────────────────────────────────────────────────────────
// §5 — The Stack (and box-and-box as the governance floor)
function rungCell(r) {
  return `<a href="${esc(r.page)}" class="rung-cell">
                    <div class="rung-modal">Rung${r.n.includes("–") ? "s" : ""} ${r.n} · ${r.modal}</div>
                    <strong>${esc(r.name)}</strong>
                    <span class="rung-desc">${esc(r.desc)}</span>
                </a>`;
}

export function Stack(rungs, kernel) {
  // Derived, never typed. 103 kernel + 15 compose/CC2 = the enforced total.
  const enforcedTotal = rungs.kernelLaws + rungs.composeLaws;
  const layer = (cls, name, role, note) =>
    `<div class="stack-layer ${cls} reveal"><div class="stack-name">${name}</div><div class="stack-role">${role}</div><div class="stack-note">${note}</div></div>`;
  const cells = rungs.rungs.map(rungCell).join("\n                ");
  const play = `<a href="${esc(rungs.playground.page)}" class="rung-cell rung-play">
                    <div class="rung-modal">▸ bridge · live</div>
                    <strong>Playground</strong>
                    <span class="rung-desc">interactive law sandbox · ${rungs.playground.lawsWired} of ${rungs.kernelLaws} ${esc(rungs.playground.wiredScope)} laws wired</span>
                </a>`;
  return `<section id="stack" class="container">
            <div class="section-label"><span class="sec-num">${NUM("stack")}</span> The Stack</div>
            <h2>Three protocols, <em>one stack.</em></h2>
            <p class="lead">
                <strong>[&amp;] composes agents. PULSE gives them a heartbeat.
                PRISM measures their effect.</strong> They're independent — adopt
                one without the others — and they stack, mirroring how HTTP, HTML
                and CSS converged in the browser. Underneath them all sits an
                un-weakenable governance floor.
            </p>

            <div class="stack-diagram reveal">
                ${layer("l-prism", "PRISM · OS-009", "diagnostic", "measures how well a loop performs over time")}
                ${layer("l-pulse", "PULSE · OS-010", "temporal", "declares how loops cycle, nest, and signal")}
                ${layer("l-prim", "OS-001 … OS-008", "capability", "the eight cognitive primitives")}
                ${layer("l-amp", "[&amp;]", "structural", "composes capabilities into agents")}
                ${layer("l-floor", "box-and-box", "governance floor", "decides what is allowed, and what is best")}
            </div>

            <h3 class="map-tier" style="margin-top:3.5rem">The governance floor <span>box-and-box · ${rungs.kernelLaws} kernel laws × ${rungs.trials} trials</span></h3>
            <p class="reveal" style="color: var(--text-secondary); margin-bottom: 1.5rem">
                Protocols say what a system <em>can</em> do. box-and-box answers
                the question underneath them all: <em>given everything it could
                do, what is it allowed to do, and which option is best?</em> An
                <strong>eight-rung modality ladder</strong>, each rung a small
                algebra with stated laws, composed by one bridge that runs
                <code>${esc(rungs.bridge).replace(/ /g, "&nbsp;")}</code> over a
                safety floor that cannot be weakened. Every verdict ships a
                certificate.
            </p>
            <p class="reveal" style="color: var(--text-secondary); margin-bottom: 1.5rem">
                <strong>Two counts, two scopes — and they are not a
                discrepancy.</strong> <code>node test/laws.mjs</code> enforces
                the <strong>${rungs.kernelLaws} kernel laws</strong> — the eight
                rungs and their bridges — which is the suite this page and the
                playground refer to. <code>node test/compose-laws.mjs</code>
                enforces a further <strong>${rungs.composeLaws} compose/CC2
                laws</strong> (the <code>&amp;</code> and <code>|&gt;</code>
                brick operators; 14 in the suite plus the AC-COMM anchor), for
                <strong>${enforcedTotal} enforced in total</strong> — the number
                <a href="${esc(kernel.landing)}">ampersandboxdesign.com</a>
                quotes. It also declares <strong>${rungs.openGaps} open
                gaps</strong> (CP5/CP6/CP7, the <code>Value.pi</code> carrier)
                which print <em>FALSIFIED</em> in red by design; the build fails
                if one starts passing. Counts measured by running both suites on
                <strong>${esc(rungs.measured)}</strong>, at
                ${rungs.trials.toLocaleString("en-US")} trials per law. Nothing
                here is fetched at runtime — re-run the suites to check us.
            </p>
            <div class="rung-grid">
                ${cells}
                ${play}
            </div>
            <div class="cta-row" style="margin-top:2rem">
                <a href="${esc(kernel.landing)}" class="btn btn-primary">The kernel landing</a>
                <a href="${esc(kernel.laws)}" class="btn">All ${enforcedTotal} laws, live</a>
                <a href="${esc(rungs.playground.page)}" class="btn">Open the playground</a>
            </div>
        </section>`;
}

// ─────────────────────────────────────────────────────────────────────────
// §6 — Open Questions
export function OpenQuestions() {
  const q = (n, head, body) =>
    `<div class="oq-card reveal"><div class="oq-num">Q${n}</div><div><strong>${head}</strong><p>${body}</p></div></div>`;
  return `<section id="open-questions" class="container">
            <div class="section-label"><span class="sec-num">${NUM("open-questions")}</span> Open Questions</div>
            <h2>What we don't know <em>yet.</em></h2>
            <p class="lead">
                A research program publishes its unknowns. These are genuine open
                questions driving the work — the honest edge of the protocols.
            </p>
            <div class="oq-grid">
                ${q("1", "Does κ-routing's ROI really invert on cheap hardware?", "OS-005's hypothesis is that topological routing matters <em>more</em> on an 8B local model — because it tells you when to skip expensive inference entirely. Plausible, but unproven at scale.")}
                ${q("2", "Can a self-evolving benchmark dodge Goodhart's law?", "PRISM rewrites its own scenarios as systems improve. If the benchmark optimizes against the system it measures, when does the score stop meaning anything?")}
                ${q("3", "Does surprise-driven learning beat scheduled consolidation?", "OS-011 emits a SurpriseSignal (forward-model prediction error) into the memory loop. Should learning fire on surprise, on a schedule, or both — and which actually crystallizes better knowledge?")}
                ${q("4", "Can agents coordinate over space with no central arbiter?", "SCOPE lets agents broadcast typed SpatialClaims and detect conflict pairwise. Does that converge to safe coordination, or does it need a referee after all?")}
                ${q("5", "What does \u201cunderstanding\u201d mean for a graph?", "If a system holds the right relationships at high confidence and can navigate them to answer, does it understand the domain? This is the question OpenSentience exists to explore.")}
            </div>
        </section>`;
}

// ─────────────────────────────────────────────────────────────────────────
// §7 — Get Involved (three doors)
export function GetInvolved(site, surface) {
  const preStyle = "font-family: var(--mono); font-size: 0.78rem; color: var(--text); line-height: 1.6; white-space: pre-wrap; background: var(--bg-elevated); border:1px solid var(--border); border-radius:8px; padding:1rem; margin-top:1rem;";
  return `<section id="get-involved" class="container">
            <div class="section-label"><span class="sec-num">${NUM("get-involved")}</span> Get Involved</div>
            <h2>Three rungs, three different <em>invitations.</em></h2>
            <p class="lead">
                A page may only ask you to do what its evidence has earned. The
                κ proof is deployed and runs on your machine, so it asks you to
                run it. The governance floor is written and property-tested, so
                it asks you to run the suites and read the source. The rest is a
                specification, so it can ask you to read it, argue with it or
                implement it — and never to run something that does not exist.
                The verbs below are not chosen; they are the ones each rung
                allows, and the build refuses any other.
            </p>
            ${CtaGroups(surface)}

            <h3 class="map-tier" style="margin-top:4rem">Or come in as <span>a researcher, a builder, a skeptic</span></h3>
            <div class="doors-grid">
                <div class="door-card reveal">
                    <div class="door-icon" style="color:var(--cyan)">✶</div>
                    <h3>Researcher</h3>
                    <p>Read the specs and the cognitive-science grounding behind every protocol. Twelve numbered specs, full reference lists, no marketing.</p>
                    <div class="cta-row">
                        <a href="${esc(site.docs)}" class="btn">Read the docs</a>
                        <a href="#references" class="btn">References</a>
                    </div>
                </div>
                <div class="door-card reveal">
                    <div class="door-icon" style="color:var(--accent)">⚙</div>
                    <h3>Builder</h3>
                    <p>Wire the loop into your own agent. Graphonomous is the shipped memory engine (npm + MCP); the governance shim is a hex package that wraps any OTP tree.</p>
                    <pre style="${preStyle}">Start a Graphonomous session for this repo.
1. retrieve(action:"context", query:"session context")
2. route(action:"attention_survey")
Then work, storing durable knowledge as we go.</pre>
                </div>
                <div class="door-card reveal">
                    <div class="door-icon" style="color:var(--rose)">⌖</div>
                    <h3>Skeptic</h3>
                    <p>Don't trust us — run it. The κ proof is right above. Or point PRISM at your own repo (BYOR) and benchmark any memory system, including ours, end to end.</p>
                    <pre style="${preStyle}">config(action:"register_system", name:"graphonomous")
compose(action:"byor_register", repo_url:".")
compose(action:"scenarios") → interact(action:"run")
observe(action:"judge_transcript") → reflect("analyze_gaps")</pre>
                </div>
            </div>
        </section>`;
}

// ─────────────────────────────────────────────────────────────────────────
export function ReferencesSection(references) {
  let n = 0;
  const groups = references
    .map((g) => {
      const items = g.items
        .map((it) => {
          n += 1;
          return `<li><span class="ref-id">[${n}]</span> ${it}</li>`;
        })
        .join("\n                ");
      return `<h4 class="ref-group">${g.group}</h4>
            <ul class="ref-list reveal">
                ${items}
            </ul>`;
    })
    .join("\n\n            ");
  return `<section id="references" class="container">
            <div class="section-label"><span class="sec-num">${NUM("references")}</span> References</div>
            <h2>Standing on the work of <em>others.</em></h2>
            ${groups}
        </section>`;
}

// ─────────────────────────────────────────────────────────────────────────
export function Footer(site, surface) {
  const links = site.footerLinks.map((l) => `<a href="${esc(l.href)}">${l.label}</a>`).join("\n                ");
  return `<footer class="container">
            <div class="footer-mark">OpenSentience</div>
            <p>
                The research arm of
                <a href="${esc(site.parent.url)}">${esc(site.parent.name)}</a>.<br />
                Published protocols. Open questions. No hype.
            </p>
            <div class="footer-links">
                ${links}
                <a href="${esc(surface.contact.url)}">Challenge a claim</a>
            </div>
            <p style="margin-top: 2rem; font-size: 0.7rem">
                <strong>Corrected 2026-08-16.</strong> Two links on this page were
                labelled <em>All 103 laws</em> and pointed at a conformance page
                that lists 118 and says so. They were wrong about their own
                destination. 103 is the kernel scope; 118 is 103 kernel plus 15
                compose/CC2, with 3 declared open. Both counts were always true
                of different things — the page just never said which was which.
                The label above is quoted here so it can be refused everywhere
                else: the build counts it, and a second occurrence anywhere on
                this page fails the build.
            </p>
            <p style="margin-top: 1.25rem; font-size: 0.7rem">
                Decoration only: the drifting graph in the header draws nothing
                that is measured and nothing that is claimed — its node and arc
                counts are deliberately not the eight rungs, not the twelve
                protocols and not any law total, and the build refuses if one of
                them appears as text here. Every count on this page is generated
                from a record in <code>_rebuild/data/</code>; the enforced law
                total is derived as kernel&nbsp;+&nbsp;compose and is typed
                nowhere. Corrections go to the issue tracker — there is no email
                address on this site, because none has been set up, not because
                we would not like one.
            </p>
            <p style="margin-top: 1.25rem; font-size: 0.7rem">
                © 2026 ${esc(site.parent.name)}. Research published under Apache 2.0 where possible.
                <span class="stamp">opensentience ${esc(surface.version)} · ${esc(surface.shell_revision)} · record ${esc(surface.verified_at)}</span>
            </p>
        </footer>`;
}

// ─────────────────────────────────────────────────────────────────────────
export function Page({ site, surface, protocols, loop, receipts, rungs, references, stats, rung, assetv, idgraph }) {
  return `<!doctype html>
<html lang="en">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${esc(surface.question)} — ${esc(site.name)}</title>
        <meta name="description" content="${esc(site.description)}" />
        <meta name="falsifiable-question" content="${esc(surface.question)}" />
        <meta name="keywords" content="${esc(site.keywords)}" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
        <link
            href="https://fonts.googleapis.com/css2?family=Crimson+Pro:ital,wght@0,300;0,400;0,600;0,700;1,300;1,400&family=JetBrains+Mono:wght@400;500;600&family=DM+Sans:wght@400;500;600;700&display=swap"
            rel="stylesheet"
        />
        <link rel="stylesheet" href="/styles/site.css?v=${assetv}" />
        <script type="module" src="/amp-nav.js"></script>
    </head>
    <body>
        ${Band(surface, rung)}
        <amp-nav property="opensentience"></amp-nav>
        ${Nav(site)}
        ${SpineToc()}

        ${Hero(site, surface, stats, rung, idgraph)}

        ${TheGap()}

        ${TheLoop(loop)}

        ${ProtocolMap(protocols, stats)}

        ${Proof(receipts)}

        ${StatusBlock(surface, rung)}

        ${Stack(rungs, site.kernel)}

        ${OpenQuestions()}

        ${GetInvolved(site, surface)}

        ${ReferencesSection(references)}

        ${Footer(site, surface)}

        <script src="/kappa_proof.js"></script>
        <script src="/proof.js?v=${assetv}"></script>
        <script src="/idanim.js?v=${assetv}" defer></script>
    </body>
</html>`;
}
