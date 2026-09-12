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

const GH_SVG = `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>`;

// The ordered spine. Single source for the left rail + section numbering, and
// now for the approved information architecture itself (OPENSENTIENCE_SURFACE
// §3): the front door is the HERO plus these SIX numbered sections — seven
// units — with the references as an unnumbered appendix below them.
//
// Nothing was cut to reach six. Three sections FOLDED, because a front door
// that deletes the portfolio's central concept to hit a section count has
// bought its architecture with its content:
//   · "The Gap" folds into the hero, whose h1 states the same thesis;
//   · "The Loop" folds into The Stack as its spine — CLAUDE.md calls the
//     cognition loop the spine of the whole portfolio, so it belongs inside
//     the section that draws the stack, not deleted from the page;
//   · "Protocols" and "The Stack" were one subject printed twice, and merge;
//   · "References" becomes the appendix, out of the numbered count on purpose.
// Every folded block keeps its id, so every anchor that ever worked still does.
const SECTIONS = [
  { id: "status", label: "What We Don't Know" },
  { id: "questions", label: "Three Questions" },
  { id: "proof", label: "Research That Runs" },
  { id: "stack", label: "The Stack" },
  { id: "catalog", label: "The Catalog" },
  { id: "get-involved", label: "Get Involved" },
];
const NUM = (id) => String(SECTIONS.findIndex((s) => s.id === id) + 1).padStart(2, "0");
// The rail and the section's own eyebrow used to be typed separately — the
// rail said "Proof" while the page said "The Receipts", two names for one
// section that nothing kept in agreement. One source now.
const SecLabel = (id) => {
  const s = SECTIONS.find((x) => x.id === id);
  return `<div class="section-label"><span class="sec-num">${NUM(id)}</span> ${esc(s ? s.label : "UNLISTED SECTION " + id)}</div>`;
};

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
export function IdAnimSvg(graph, withIds = true) {
  const gid = (n) => (withIds ? ` id="idanim-${n}"` : "");
  const arcs = graph.arcs.map((a) => `<path class="ida" d="${a.d}"></path>`).join("\n                        ");
  const heads = graph.arcs.map((a) => `<path class="idh" d="${a.head}"></path>`).join("\n                        ");
  // The trace layer. Its dash pattern is written HERE, from the arc length the
  // geometry already computed, and every one of them ships at opacity="0" — so
  // with scripting off the layer is silent and the graph beneath it is whole,
  // and the driver never has to measure a path or set a dash array at run time.
  // It is a presentation attribute rather than a stylesheet rule on purpose:
  // CSS beats a presentation attribute, so an `opacity: 0` in site.css could
  // never be lifted by the driver and the traces would never appear.
  const traces = graph.arcs
    .map((a) => `<path class="idt" d="${a.d}" stroke-dasharray="${a.dash}" opacity="0"></path>`)
    .join("\n                        ");
  const nodes = graph.nodes.map((n) => `<circle class="idn" cx="${n.x}" cy="${n.y}" r="${graph.r}"></circle>`).join("\n                        ");
  return `<svg viewBox="0 0 300 430" preserveAspectRatio="xMidYMid meet" focusable="false" aria-hidden="true">
                    <g${gid("arcs")}>
                        ${arcs}
                    </g>
                    <g${gid("heads")}>
                        ${heads}
                    </g>
                    <g${gid("traces")}>
                        ${traces}
                    </g>
                    <g${gid("nodes")}>
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
export function Hero(site, surface, stats, rung, idgraph, bookVerbs, bookOffers, cover) {
  const H = surface.hero;
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
            <!-- The identity animation is absolutely positioned with top AND
                 bottom set, so its height is its containing block's height.
                 When "The Gap" folded into the hero (see SECTIONS) the hero
                 grew by a whole section and the graph stretched down over it.
                 This stage bounds it to the hero's own first screen again. -->
            <div class="hero-stage">
            <div class="hero-front">
                <!-- The DIRECTION is a data value (surface.hero.lead), not a
                     template fork: A leads with the mission, B with the
                     falsifiable question. Both make the book the primary entry
                     point and both keep the runnable proof one click away, so
                     the only thing that varies is what a first-time visitor is
                     asked to hold in their head first. -->
                <div class="hero-eyebrow">${esc(H.lead === "mission" ? H.mission_eyebrow : H.question_eyebrow)}</div>
                <h1>${H.lead === "mission" ? H.mission_headline : H.question_headline}</h1>
                <p class="subtitle">
                    ${H.lead === "mission" ? H.mission_subtitle : H.question_subtitle}
                </p>
                <div class="cta-row">
                    <a href="${esc(H.primary_cta.href)}" class="btn btn-primary" data-publication="${esc(H.primary_cta.publication)}"><span class="verb">${esc(bookVerbs[H.primary_cta.publication] || "")}</span>${bookOffers[H.primary_cta.publication] ? `<span class="offer">${esc(bookOffers[H.primary_cta.publication])}</span>` : ""}</a>
                    <a href="${esc(H.secondary_cta.href)}" class="btn">${esc(H.secondary_cta.label)}</a>
                    <a href="${esc(H.tertiary_cta.href)}" class="btn">${esc(H.tertiary_cta.label)}</a>
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
            ${Book(cover, idgraph)}
            </div>
            ${TheGap()}
        </header>`;
}

// ─────────────────────────────────────────────────────────────────────────
// The status block (SHELL.md §2). LIMIT is the load-bearing row: it is not a
// caveat and not a disclaimer, it is the strongest claim a reader would
// reasonably infer that the evidence does not support. If it could be deleted
// without changing what a reader believes, it is not doing its job.
export function StatusBlock(surface, rung) {
  return `<section id="status" class="container">
            ${SecLabel("status")}
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
export function CtaGroups(surface, bookVerbs = {}) {
  const ORDER = ["external", "live_deployed", "live_local", "in_tree", "spec"];
  return ORDER.filter((r) => surface.cta[r])
    .map((r) => {
      const witnessed = ["external", "live_deployed", "live_local"].includes(r);
      const cards = surface.cta[r]
        // A CTA that cites a publication prints the DERIVED verb, not the one
        // typed beside it in surface.json. PUB3 already says the verb is
        // derived and not a writing choice; until this line said so too, the
        // hero moved when an offer expired and this group did not — the same
        // page asking for two different things about one book.
        .map((a) => `<a href="${esc(a.href)}"${a.publication ? ` data-publication="${esc(a.publication)}"` : ""}><span class="verb">${esc((a.publication && bookVerbs[a.publication]) || a.verb)}</span><span class="what">${a.what}</span></a>`)
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
  // Folded into the hero (see SECTIONS). It keeps its id and its heading and
  // loses only the section number — the hero's h1 already states this thesis,
  // and stating it twice with two numbers on it was the duplication, not the
  // prose.
  return `<div id="gap" class="hero-coda">
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
        </div>`;
}

// ─────────────────────────────────────────────────────────────────────────
// §2 — The Cognition Loop (the spine of the whole portfolio)
export function TheLoop(loop, ringName) {
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
  // Folded into The Stack as its spine. The loop is what every protocol in
  // the stack runs; printing it as its own numbered section said "here is a
  // diagram" where inside the stack it says "here is how the stack moves".
  return `<div id="loop" class="stack-block">
            <h3 class="stack-block-head">Cognition is a loop, <em>not a prompt.</em></h3>
            <p class="lead">
                Every system in the [&amp;] portfolio runs the same five-phase
                loop — the canonical PULSE phase kinds, which are exactly the
                Graphonomous machine architecture. Each phase is a place where
                a protocol does its work. The loop is wrapped by governance,
                clocked by PULSE, gauged by PRISM, and bounded by SCOPE.
            </p>

            <div class="loop-grid">
                <svg viewBox="0 0 400 400" class="loop-ring reveal" role="img" aria-labelledby="loop-ring-name">
                    <title id="loop-ring-name">${esc(ringName)}</title>
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
        </div>`;
}

// ─────────────────────────────────────────────────────────────────────────
// The status/version chip is DERIVED. All twelve protocols used to type it as
// the first entry of their own `tags` array — a second copy of two fields
// sitting inches away in the same record — and OS-010 had already drifted: its
// record said v0.1.1 while the tag it printed said v0.1.
const STATUS_WORD = { shipped: "shipped", "spec-complete": "spec complete", "in-development": "in development", draft: "draft" };
const STATUS_CLS = { shipped: "status-published", "spec-complete": "status-spec", "in-development": "status-spec", draft: "status-draft" };

export function ProtocolCard(p) {
  const featured = p.featured ? " paper-card--featured" : "";
  const numColor = p.featured ? ' style="color: var(--accent)"' : "";
  const statusTag = `<span class="paper-tag ${STATUS_CLS[p.status] || ""}">${p.version ? esc(p.version) + " &middot; " : ""}${esc(STATUS_WORD[p.status] || p.status)}</span>`;
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
                        ${statusTag}
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
  return `<div id="protocols" class="stack-block">
            <h3 class="stack-block-head">${stats.total} protocols. The <em>shape</em> of a mind.</h3>
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
        </div>`;
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
  // Two site pages (proofs/kappa.html, docs/spec/OS-E001-…) have been linking
  // to /#kappa, an id this page has never had — a dead anchor that scrolled
  // nowhere. The alias costs one span and makes both links land.
  return `<section id="proof" class="container">
            <span id="kappa" aria-hidden="true"></span>
            ${SecLabel("proof")}
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

export function Stack(rungs, kernel, stackNodes, stackEdges, states, edgesHeading, inner = "") {
  // Derived, never typed — from rungs.kernelLaws + rungs.composeLaws.
  // Deliberately no example sum in this comment: the one that used to be here
  // said "103 kernel + 15 compose/CC2" and was still saying it after the
  // compose suite reached 22, one line above the code that derives it.
  const enforcedTotal = rungs.kernelLaws + rungs.composeLaws;
  // Every node carries its OWN status, derived. A node covering several
  // protocols carries a per-status BREAKDOWN and never one averaged chip —
  // twelve protocols at four statuses have no single true status word.
  const STATUS_LABEL = { shipped: "shipped", "spec-complete": "spec-complete", "in-development": "in development", draft: "draft" };
  const layer = (n) => {
    const chips = n.chips.length
      ? n.chips
          .map((c) => `<span class="map-chip" data-status="${esc(c.status)}">${n.single ? "" : `${c.count}&nbsp;`}${esc(STATUS_LABEL[c.status] || c.status)}</span>`)
          .join("")
      : `<span class="map-chip map-chip-none" data-status="none" title="${esc(n.status_why || "")}">no rung on this ladder</span>`;
    return `<div class="stack-layer l-${esc(n.id)} reveal" data-node="${esc(n.id)}">
                    <div class="stack-name">${n.label}</div>
                    <div class="stack-role">${esc(n.role)}</div>
                    <div class="stack-note">${esc(n.note)}</div>
                    <div class="stack-status">${chips}</div>
                </div>`;
  };
  // An edge states its claim and the state it has EARNED. Three states, and
  // only the strongest one is allowed the language of proof: `solid` means an
  // integration actually ran over both ends. `dashed` means both ends merely
  // exist — which is not a witness, and the legend says so.
  const edge = (e) => {
    const ends = [
      e.producer.ok ? `produced by ${esc(e.producer.what)}` : `no producer — ${esc(e.producer.why)}`,
      e.consumer.ok ? `consumed by ${esc(e.consumer.what)}` : `no consumer — ${esc(e.consumer.why)}`,
    ];
    const ran = e.integration
      ? `<span class="edge-ran">ran: <code>${esc(e.integration.cmd || e.integration.path)}</code>${e.integration.ran ? ` · ${esc(e.integration.ran)}` : ""}</span>`
      : "";
    return `<div class="stack-edge edge-${esc(e.state)}" data-edge-state="${esc(e.state)}" data-from="${esc(e.from)}" data-to="${esc(e.to)}">
                    <span class="edge-what">${esc(e.what)}</span>
                    <span class="edge-state">${esc(states[e.state].label)}</span>
                    <span class="edge-ends">${ends.join(" · ")}</span>
                    ${ran}
                </div>`;
  };
  const legend = ["solid", "dashed", "missing"]
    .map((k) => `<div class="legend-row legend-${k}"><span class="legend-key">${esc(states[k].label)}</span><span class="legend-means">${esc(states[k].means)}</span></div>`)
    .join("\n                    ");
  const cells = rungs.rungs.map(rungCell).join("\n                ");
  const play = `<a href="${esc(rungs.playground.page)}" class="rung-cell rung-play">
                    <div class="rung-modal">▸ bridge · live</div>
                    <strong>Playground</strong>
                    <span class="rung-desc">interactive law sandbox · ${rungs.playground.lawsWired} of ${rungs.kernelLaws} ${esc(rungs.playground.wiredScope)} laws wired</span>
                </a>`;
  return `<section id="stack" class="container">
            ${SecLabel("stack")}
            <h2>The stack, <em>status-aware.</em></h2>
            <p class="lead">
                <strong>[&amp;] composes agents. PULSE gives them a heartbeat.
                PRISM measures their effect.</strong> They're independent — adopt
                one without the others — and they stack, mirroring how HTTP, HTML
                and CSS converged in the browser. Underneath them all sits an
                un-weakenable governance floor.
            </p>

            ${inner}

            <div class="stack-diagram reveal">
                ${stackNodes.map(layer).join("\n                ")}
            </div>
            <div class="stack-edges reveal">
                <div class="stack-edges-head">${esc(edgesHeading)}</div>
                ${stackEdges.map(edge).join("\n                ")}
                <div class="stack-legend">
                    ${legend}
                </div>
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

// §3's five cards were folded into data/questions.json (see its _fold_comment)
// and the OpenQuestions template deleted with them, so nothing can reinstate a
// question whose status is typed rather than derived.

// ─────────────────────────────────────────────────────────────────────────
// §3 — Three questions, and what would settle each.
// Every status chip here is DERIVED from protocols.json. The five cards this
// replaced asserted their own maturity in prose, so a protocol could be
// re-adjudicated and the question beside it would go on describing the old one.
export function Questions(questions, protocols) {
  const byId = new Map(protocols.map((p) => [p.id, p]));
  const card = (q, n) => {
    const homes = q.lives_in
      .map((id) => {
        const p = byId.get(id);
        return `<span class="q-home"><a href="#protocols">${esc(id)}</a> <span class="q-status" data-status="${esc(p.status)}">${esc(p.status)}</span></span>`;
      })
      .join("\n                        ");
    return `<div class="q-card reveal">
                    <div class="q-num">Q${n}</div>
                    <div class="q-body">
                        <h3>${esc(q.ask)}</h3>
                        <div class="q-homes">${homes}</div>
                        <p class="q-established"><strong>Established.</strong> ${q.established}</p>
                        <p class="q-unsettled"><strong>Not established.</strong> ${q.unsettled}</p>
                        <p class="q-settles"><strong>What would settle it.</strong> ${q.settles_it}</p>
                    </div>
                </div>`;
  };
  return `<section id="questions" class="container">
            ${SecLabel("questions")}
            <h2>Three questions, and what would <em>settle</em> each.</h2>
            <p class="lead">
                A research programme is defined by what would change its mind.
                Each of these names where it lives in the tree, what is already
                established, what is not — and the specific result that would
                move it. The status beside each protocol is read from the
                protocol record, not written here.
            </p>
            <div class="q-grid">
                ${questions.questions.map((q, i) => card(q, i + 1)).join("\n                ")}
            </div>
            <p class="q-closing reveal">${questions.closing}</p>
        </section>`;
}

// ─────────────────────────────────────────────────────────────────────────
// The cover. Drawn from the registry, not illustrated.
//
// What it deliberately is NOT: a spine, a page edge, a drop shadow under a
// corner, a 3-D tilt. Every one of those draws a physical object, and this book
// has no file — `delivery` is `web`. A jacket that implies something to hold is
// the same overclaim as a Download verb, and the build refuses that verb.
//
// What it is: one mark per chapter, coloured by the rung that chapter's
// evidence has earned. A reader learns the honest thing first — how much of
// this book is witnessed — from the cover, before they open it.
// The book, above the fold. Travis 2026-09-12: "the animation at the top of the
// screen on the front cover of a 3d rendered box as a book" — the hero's
// identifying graph IS the cover art, and the object it sits on is the first
// thing a visitor sees, not something five sections down.
//
// This replaces the hero's ambient graph rather than joining it: two copies of
// the same animation a hand-span apart is one copy too many, and the mark is
// not lost — it is on the cover.
export function Book(cover, idgraph) {
  if (!cover) return "";
  return `<a class="osbook-link" href="${esc(cover.home)}">
                <span class="osbook-stage">
                    <span class="osbook" data-osbook>
                        <span class="osbook-face osbook-front">
                            <span class="osbook-kicker">OpenSentience.org</span>
                            <span class="osbook-art" data-identity-animation aria-hidden="true">
                                ${IdAnimSvg(idgraph, false)}
                            </span>
                            <span class="osbook-type">
                                <span class="osbook-title">${esc(cover.title)}</span>
                                <span class="osbook-rule"></span>
                                <span class="osbook-sub">${esc(cover.subtitle)}</span>
                            </span>
                        </span>
                        <span class="osbook-face osbook-spine" aria-hidden="true"><span>${esc(cover.title)}</span></span>
                        <span class="osbook-face osbook-edge" aria-hidden="true"></span>
                        <span class="osbook-face osbook-top" aria-hidden="true"></span>
                    </span>
                </span>
                <span class="osbook-cta">Read it on the web &rarr;</span>
            </a>`;
}

export function CoverMarks(cover) {
  if (!cover) return "";
  // The book object, as a book. Travis's call 2026-09-12, and it overrules the
  // first version of COV3 — which refused a spine, a page edge and a tilt on
  // the grounds that they draw an object you could hold. That reasoning
  // over-reached: a 3-D render is how every book on every store page is shown,
  // web-only ones included, and it is a presentation convention rather than a
  // claim about a file. What COV3 was RIGHT about is narrower and survives
  // intact: the jacket may not promise a file the record has no download for.
  //
  // The cover art is the site's identifying graph — the same geometry the hero
  // draws, animated by the same driver, which now mounts every root instead of
  // the first one it finds.
  const marks = cover.marks
    .map((m, i) => {
      const x = 12 + (i % 8) * 15, y = 12 + Math.floor(i / 8) * 15;
      const fill = { external: "var(--cyan)", live_deployed: "var(--cyan)", live_local: "var(--accent)", in_tree: "var(--accent)", spec: "var(--amber)" };
      return m
        ? `<circle cx="${x}" cy="${y}" r="4.2" fill="${fill[m] || "var(--accent)"}" opacity="${m === "spec" ? "0.75" : "1"}"></circle>`
        : `<circle cx="${x}" cy="${y}" r="3.8" fill="none" stroke="var(--border)" stroke-width="1.2"></circle>`;
    })
    .join("\n                        ");
  const legend = cover.split
    .map((x) => `<li><span class="cover-key" data-rung="${esc(String(x.rung))}"></span><strong>${x.n}</strong> ${esc(x.label)}</li>`)
    .join("\n                        ");
  return `<div class="marks-column">
                <figure class="cover-figure">
                    <svg class="cover-marks" viewBox="0 0 120 ${12 + Math.ceil(cover.marks.length / 8) * 15}" role="img" aria-labelledby="cover-name">
                        <title id="cover-name">${esc(cover.name)}</title>
                        ${marks}
                    </svg>
                    <figcaption>
                        <ul class="cover-legend">
                        ${legend}
                        </ul>
                        <p class="cover-note">One mark per chapter, coloured by the rung its
                        evidence has earned &mdash; a filled mark is witnessed, an empty ring
                        is not. Nothing here was drawn by hand. The book is read on the web;
                        there is no file.</p>
                    </figcaption>
                </figure>
            </div>`;
}

// ─────────────────────────────────────────────────────────────────────────
// §6 — The catalog as evidence. Ruled: /patterns is source material FOR the
// book, not automatically the book. Every number here is re-derived from the
// registry by PUB7 before it can be printed.
export function Catalog(catalog, cover) {
  const chip = (n, label) => `<span class="cat-chip"><strong>${n}</strong> ${esc(label)}</span>`;
  const c = catalog.counts;
  return `<section id="catalog" class="container">
            ${SecLabel("catalog")}
            <div class="cat-layout">
            <div class="cat-copy">
            <h2>The catalog as <em>evidence.</em></h2>
            <p class="lead">
                ${esc(catalog.title)} is a generated registry: every entry carries
                the rung its evidence has earned, and the build refuses an entry
                whose witness does not check out. It is the source material the
                book is written <em>from</em> — a catalogue and an editorial
                narrative serve different readers, and today they are the same
                object. When an edition is written it gets its own record, and
                the invitation above changes by itself, because nobody types it.
            </p>
            <div class="cat-strip reveal">
                ${chip(c.chapters, "entries")}
                ${chip(c.witnessed, "carry a witness rung")}
                ${chip(c.externally_reproduced, "reproduced by someone else")}
            </div>
            <p class="cat-note reveal">
                That third number is the one that matters and it is the one that
                is hard to move. Everything else on this page is us checking our
                own work.
            </p>
            <a href="${esc(catalog.home)}" class="btn">Open the catalog</a>
            </div>
            ${CoverMarks(cover)}
            </div>
        </section>`;
}

// ─────────────────────────────────────────────────────────────────────────
// §7 — Get Involved (three doors)
export function GetInvolved(site, surface, bookVerbs = {}) {
  const preStyle = "font-family: var(--mono); font-size: 0.78rem; color: var(--text); line-height: 1.6; white-space: pre-wrap; background: var(--bg-elevated); border:1px solid var(--border); border-radius:8px; padding:1rem; margin-top:1rem;";
  return `<section id="get-involved" class="container">
            ${SecLabel("get-involved")}
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
            ${CtaGroups(surface, bookVerbs)}

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

            ${SayForm(surface)}
        </section>`;
}

// ─────────────────────────────────────────────────────────────────────────
// Contact (SHELL.md r9, ruled by Travis 2026-08-17). Copied in SHAPE from
// computedriven.com, not just in URL, and every part of it is load-bearing:
//
//   · A real <form action method="POST">. With scripting off it posts to
//     Formspree and works. That is the same contract the rest of this page
//     already holds — the identifying animation is drawn in markup for exactly
//     this reason — and it is why this is not a fetch bolted to a button.
//   · The script only UPGRADES it to an inline reply, so a visitor is not
//     handed to somebody else's thank-you screen. It prints "sent" only on an
//     actual 2xx from the endpoint; see proof.js. A form that says thank-you on
//     submit and drops the message is precisely the failure this site is about.
//   · The `_gotcha` honeypot is Formspree's, and it is hidden off-screen rather
//     than with display:none, because some bots skip anything a stylesheet has
//     explicitly hidden. build.mjs refuses the artifact if it goes missing — a
//     honeypot dropped in a refactor fails silently and invisibly.
//   · The endpoint is NOT typed here. It comes from the surface record and the
//     artifact gate re-reads it off the emitted form.
export function SayForm(surface) {
  return `<h3 class="map-tier" style="margin-top:4rem">Or tell us <span>we have a number wrong</span></h3>
            <p class="lead" style="margin-bottom:1.4rem">
                This page prints an exhaustive proof, two law counts and twelve
                protocol statuses, and every one of them has a single author —
                us. The most useful message this site can receive is the one
                that says a figure on it does not hold. The form posts to
                <code>formspree.io</code> when <em>you</em> press the button,
                carrying what you typed and nothing else; it is the only thing
                on this page that talks to anyone but this domain. If you would
                rather the correction be public,
                <a href="${esc(surface.contact.url)}">open an issue instead</a>.
            </p>
            <form class="say" action="${esc(surface.contact.endpoint)}" method="POST" novalidate>
                <div class="say-row">
                    <label class="say-f">
                        <span>Your email</span>
                        <input type="email" name="email" autocomplete="email" placeholder="so a reply can reach you" required />
                    </label>
                    <label class="say-f">
                        <span>Message</span>
                        <textarea name="message" rows="3" placeholder="${esc(surface.contact.placeholder)}" required></textarea>
                    </label>
                </div>
                <!-- Formspree's honeypot: a bot fills it, a person never sees it. -->
                <input type="text" name="_gotcha" tabindex="-1" autocomplete="off" aria-hidden="true" />
                <div class="say-act">
                    <button type="submit" class="btn btn-primary">Send</button>
                    <p class="say-msg" role="status" aria-live="polite"></p>
                </div>
            </form>`;
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
      return `<h3 class="ref-group">${g.group}</h3>
            <ul class="ref-list reveal">
                ${items}
            </ul>`;
    })
    .join("\n\n            ");
  // The appendix. It keeps its id, its heading and all 28 citations, and loses
  // only its number: the seven-section architecture is the reader's path
  // through the argument, and a bibliography is not a step on that path.
  return `<section id="references" class="container appendix">
            <div class="section-label">Appendix</div>
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
                listing the whole enforced set and saying so. They were wrong
                about their own destination. 103 is the kernel scope; the
                enforced total is the kernel suite plus the compose/CC2 suite,
                derived above and typed nowhere. Both counts were always true
                of different things — the page just never said which was which.
                The total stood at 118 the day this note was written and the
                compose suite has grown since, which is the reason no total is
                written down here either. The label above is quoted so it can be
                refused everywhere else: the build counts it, and a second
                occurrence anywhere on this page fails the build.
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
export function Page({ site, surface, protocols, loop, receipts, rungs, references, stats, rung, assetv, idgraph, stackNodes, stackEdges, bookVerbs, bookOffers, edgeStates, edgesHeading, ringName, questions, catalog, cover }) {
  return `<!doctype html>
<html lang="en">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${esc(surface.question)} — ${esc(site.name)}</title>
        <meta name="description" content="${esc(site.description)}" />
        <meta name="falsifiable-question" content="${esc(surface.question)}" />
        <meta name="mission" content="${esc(surface.mission)}" />
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
        <a class="skip-link" href="#main">Skip to main content</a>
        ${Band(surface, rung)}
        <amp-nav property="opensentience"></amp-nav>
        ${Nav(site)}
        ${SpineToc()}

        <main id="main" tabindex="-1">
        <!-- The seven units of OPENSENTIENCE_SURFACE §3, in its order. The
             reader meets the thesis, then immediately what it does NOT
             establish, then the questions that would settle it, then the one
             piece of it that runs in front of them — and only then the stack.
             Putting the limit second is the inversion that does the most work
             on this page, and it used to be sixth. -->
        ${Hero(site, surface, stats, rung, idgraph, bookVerbs, bookOffers, cover)}

        ${StatusBlock(surface, rung)}

        ${Questions(questions, protocols)}

        ${Proof(receipts)}

        ${Stack(rungs, site.kernel, stackNodes, stackEdges, edgeStates, edgesHeading, TheLoop(loop, ringName) + "\n\n            " + ProtocolMap(protocols, stats))}

        ${Catalog(catalog, cover)}

        ${GetInvolved(site, surface, bookVerbs)}

        ${ReferencesSection(references)}
        </main>

        ${Footer(site, surface)}

        <script src="/kappa_proof.js"></script>
        <script src="/proof.js?v=${assetv}"></script>
        <script src="/idanim.js?v=${assetv}" defer></script>
    </body>
</html>`;
}
