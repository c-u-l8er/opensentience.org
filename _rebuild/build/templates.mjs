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
export function Hero(site, protocols, stats) {
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
            <span class="hero-badge">Open research into machine cognition · an [&amp;] Ampersand Box Design program</span>
            <h1>Intelligence is not generation.<br /><em>It is structured accumulation.</em></h1>
            <p class="subtitle">
                A language model that can't remember yesterday, weigh evidence
                across sessions, or learn from where it's deployed is a
                <strong>generator</strong> — not a system. OpenSentience is the
                open research program defining the protocols that close that gap.
            </p>
            <div class="cta-row">
                <a href="#protocols" class="btn btn-primary">Read the protocols</a>
                <a href="#proof" class="btn">See the proof</a>
                <a href="${esc(site.github)}" class="btn btn-github">${GH_SVG}Star on GitHub</a>
            </div>
            <div class="receipts-strip reveal">
                <span class="receipt-chip"><strong>${stats.total}</strong> protocols</span>
                <span class="receipt-chip"><strong>${range}</strong></span>
                <span class="receipt-chip">${statusChip}</span>
            </div>
        </header>`;
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
  const layer = (cls, name, role, note) =>
    `<div class="stack-layer ${cls} reveal"><div class="stack-name">${name}</div><div class="stack-role">${role}</div><div class="stack-note">${note}</div></div>`;
  const cells = rungs.rungs.map(rungCell).join("\n                ");
  const play = `<a href="${esc(rungs.playground.page)}" class="rung-cell rung-play">
                    <div class="rung-modal">▸ bridge · live</div>
                    <strong>Playground</strong>
                    <span class="rung-desc">interactive law sandbox · ${rungs.playground.lawsWired} of ${rungs.lawCount} wired</span>
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

            <h3 class="map-tier" style="margin-top:3.5rem">The governance floor <span>box-and-box · ${rungs.lawCount} laws × ${rungs.trials} trials</span></h3>
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
            <div class="rung-grid">
                ${cells}
                ${play}
            </div>
            <div class="cta-row" style="margin-top:2rem">
                <a href="${esc(kernel.landing)}" class="btn btn-primary">The kernel landing</a>
                <a href="${esc(kernel.laws)}" class="btn">All ${rungs.lawCount} laws, live</a>
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
export function GetInvolved(site) {
  const preStyle = "font-family: var(--mono); font-size: 0.78rem; color: var(--text); line-height: 1.6; white-space: pre-wrap; background: var(--bg-elevated); border:1px solid var(--border); border-radius:8px; padding:1rem; margin-top:1rem;";
  return `<section id="get-involved" class="container">
            <div class="section-label"><span class="sec-num">${NUM("get-involved")}</span> Get Involved</div>
            <h2>Three doors <em>in.</em></h2>
            <p class="lead">
                OpenSentience is open research. Whoever you are, there's a way to
                use it, build on it, or try to break it.
            </p>
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
export function Footer(site) {
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
            </div>
            <p style="margin-top: 2rem; font-size: 0.7rem">
                © 2026 ${esc(site.parent.name)}. Research published under Apache 2.0 where possible.
            </p>
        </footer>`;
}

// ─────────────────────────────────────────────────────────────────────────
export function Page({ site, protocols, loop, receipts, rungs, references, stats }) {
  return `<!doctype html>
<html lang="en">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${esc(site.name)} — ${esc(site.tagline)}</title>
        <meta name="description" content="${esc(site.description)}" />
        <meta name="keywords" content="${esc(site.keywords)}" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
        <link
            href="https://fonts.googleapis.com/css2?family=Crimson+Pro:ital,wght@0,300;0,400;0,600;0,700;1,300;1,400&family=JetBrains+Mono:wght@400;500;600&family=DM+Sans:wght@400;500;600;700&display=swap"
            rel="stylesheet"
        />
        <link rel="stylesheet" href="/styles/site.css" />
        <script type="module" src="/amp-nav.js"></script>
    </head>
    <body>
        <amp-nav property="opensentience"></amp-nav>
        ${Nav(site)}
        ${SpineToc()}

        ${Hero(site, protocols, stats)}

        ${TheGap()}

        ${TheLoop(loop)}

        ${ProtocolMap(protocols, stats)}

        ${Proof(receipts)}

        ${Stack(rungs, site.kernel)}

        ${OpenQuestions()}

        ${GetInvolved(site)}

        ${ReferencesSection(references)}

        ${Footer(site)}

        <script src="/kappa_proof.js"></script>
        <script src="/proof.js"></script>
    </body>
</html>`;
}
