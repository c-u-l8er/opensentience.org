/* ===========================================================================
   OpenSentience — the identifying animation. SHELL.md §8.

   What it depicts: a small directed graph. Arcs drift in and out, and when the
   arcs that happen to be present close a directed cycle, that cycle lights up
   and flows; when the cycle breaks it goes quiet again. That is the page's own
   h1 — "does the shape of a knowledge graph tell you when to think harder?" —
   and the answer beneath it is κ: κ > 0 holds exactly when the graph contains
   an irreducible feedback loop. So the thing that moves is the thing the site
   is about.

   WHY THIS REPLACED THE LADDER, because it will otherwise be re-discovered:
   the previous version drew two vertical rails and twenty-nine horizontal
   rungs in var(--line2). On a paper-coloured page that renders as RULED
   NOTEBOOK PAPER, and each rail reads as a stray horizontal rule. Travis
   reported it as "fix the very first HR at the top of the page just below the
   fold" — and this page has ZERO <hr> elements. The bottom rail was the "HR".
   A replacement must therefore not be built out of long horizontal lines; that
   constraint, not the motion, was the actual defect.

   RULE 2, and it is the reason this file is separate and closed:
   IT RENDERS NO DATA AND ASSERTS NOTHING.

   - It reads nothing from the document — no attribute, no dataset, no query
     string, no count derived from the page. It is handed nothing and it asks
     for nothing.
   - It writes nothing back except opacity, a dash offset and one class name,
     on elements the build already emitted. It creates no element and removes
     none, so with JavaScript off the graph is still drawn — just still.
   - Its two countable constants below are DELIBERATELY not any figure this
     page prints. This page carries a 28-entry reference list, so EVERY
     integer from 2 to 28 is already standalone text on it; a previous lane
     tried 11 and 7 and the build refused both. build.mjs parses the block
     below and fails the build if either number appears as a standalone number
     in the page's text.

   The `12 Active Pathfinders` defect is what that guards against: a sibling
   surface published `for (let i = 0; i < 12; i++)` — a decorative canvas's
   loop bound — as a live user metric, for months.

   Remove the <script> tag that loads this file and every figure, chip, status
   row, count and word on the page is still there, and so is the graph.
   =========================================================================== */

/* GRAPH-START — pure geometry and topology. No DOM, no page input, no
   Math.random: given the same source it produces the same graph on every
   machine, every load. build/build.mjs EXTRACTS THIS REGION, evaluates it, and
   renders the static SVG from it — so the drawing and the driver cannot
   disagree about where a node is or which way an arc points, because there is
   only one of them. The old pair (LADDER_BANDS in the template, BANDS here)
   needed a check to keep two copies honest; one copy needs none. */

/* IDENTITY-CONSTANTS-START — parsed by build.mjs. These are the COUNTABLE
   quantities: what a reader could count on screen and mistake for a
   measurement. Numbers here must not appear as text on the page. Layout
   constants (a padding, a radius) live below, outside the block, because
   nobody can read a padding off a picture. */
const NODES = 31;
const ARCS = 41;
/* IDENTITY-CONSTANTS-END */

function idGraph() {
    "use strict";
    // The drawing box. The SVG is masked to a soft circle by the stylesheet,
    // so the corners are never fully visible — which is why the four corner
    // cells are the ones dropped below.
    const X0 = 30, X1 = 270, Y0 = 30, Y1 = 400;
    const COLS = 5, ROWS = 7; // 35 cells, four corners dropped = NODES
    const NR = 3.2;           // node radius, also used to trim the arcs
    const cw = (X1 - X0) / COLS, ch = (Y1 - Y0) / ROWS;

    // A jittered grid, not rejection sampling: it always terminates and it
    // always yields exactly NODES. The jitter is ±42% of a cell, which is
    // enough that the rows do not read as rows — measured, not assumed: only
    // one pair of the 31 lands within a pixel of the same height, and the two
    // are 130 px apart horizontally. Nodes lining up in rows is how the last
    // version turned into ruled paper, so it is worth measuring rather than
    // hoping for.
    let s = 20260817 % 2147483647;
    const rnd = () => (s = (s * 48271) % 2147483647) / 2147483647;

    const nodes = [];
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            // Draw the jitter for EVERY cell, including the ones dropped, so
            // the random stream does not shift when a corner is skipped.
            const jx = (rnd() - 0.5) * 0.84, jy = (rnd() - 0.5) * 0.84;
            if ((r === 0 || r === ROWS - 1) && (c === 0 || c === COLS - 1)) continue;
            nodes.push({
                x: +(X0 + cw * (c + 0.5 + jx)).toFixed(2),
                y: +(Y0 + ch * (r + 0.5 + jy)).toFixed(2),
            });
        }
    }

    // Every node gets its nearest partner first, so nothing is left stranded;
    // the remaining slots go to the shortest edges that are still unused.
    const key = (i, j) => (i < j ? i + ":" + j : j + ":" + i);
    const pairs = [];
    const seen = Object.create(null);
    const take = (i, j) => {
        const k = key(i, j);
        if (seen[k]) return;
        seen[k] = 1;
        pairs.push({ i: Math.min(i, j), j: Math.max(i, j), d: Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y) });
    };
    for (let i = 0; i < nodes.length; i++) {
        let best = -1, bd = Infinity;
        for (let j = 0; j < nodes.length; j++) {
            if (i === j) continue;
            const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
            if (d < bd) { bd = d; best = j; }
        }
        take(i, best);
    }
    const rest = [];
    for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
            if (seen[key(i, j)]) continue;
            rest.push({ i, j, d: Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y) });
        }
    }
    rest.sort((a, b) => a.d - b.d || a.i - b.i || a.j - b.j);
    for (let k = 0; pairs.length < ARCS && k < rest.length; k++) {
        take(rest[k].i, rest[k].j);
    }
    pairs.length = Math.min(pairs.length, ARCS);

    // Orientation is fixed and deterministic. It is not random: a random
    // orientation is a sample, and a sample is a thing a reader could believe
    // was measured. This one is arithmetic on the two indices.
    const arcs = pairs.map((p, k) => {
        const fwd = (p.i * 3 + p.j * 7) % 8 < 4;
        const a = fwd ? p.i : p.j, b = fwd ? p.j : p.i;
        const A = nodes[a], B = nodes[b];
        const dx = B.x - A.x, dy = B.y - A.y;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len, uy = dy / len;
        // Trim both ends clear of the node discs, then bow the curve to one
        // side or the other so neighbouring arcs do not lie on top of one
        // another and nothing reads as a straight rule.
        const sx = A.x + ux * (NR + 2.4), sy = A.y + uy * (NR + 2.4);
        const ex = B.x - ux * (NR + 4.6), ey = B.y - uy * (NR + 4.6);
        const bow = (k % 2 ? 1 : -1) * len * 0.15;
        const mx = (sx + ex) / 2 - uy * bow, my = (sy + ey) / 2 + ux * bow;
        // The tangent at the far end of a quadratic is (end − control).
        const tx = ex - mx, ty = ey - my;
        const tl = Math.hypot(tx, ty) || 1;
        const hx = tx / tl, hy = ty / tl;
        const px = -hy, py = hx;
        const HL = 6.2, HW = 2.6;
        const f2 = (n) => n.toFixed(2);
        return {
            a, b,
            d: "M" + f2(sx) + " " + f2(sy) + "Q" + f2(mx) + " " + f2(my) + " " + f2(ex) + " " + f2(ey),
            head:
                "M" + f2(ex) + " " + f2(ey) +
                "L" + f2(ex - hx * HL + px * HW) + " " + f2(ey - hy * HL + py * HW) +
                "L" + f2(ex - hx * HL - px * HW) + " " + f2(ey - hy * HL - py * HW) + "Z",
        };
    });

    return { nodes, arcs, r: NR };
}
/* GRAPH-END */

(function idanim() {
    "use strict";
    const root = document.querySelector("[data-identity-animation]");
    if (!root) return;
    const arcEls = root.querySelectorAll(".ida");
    const headEls = root.querySelectorAll(".idh");
    const nodeEls = root.querySelectorAll(".idn");

    const g = idGraph();
    const A = g.arcs.length, N = g.nodes.length;
    // The build proves these agree before the page is emitted; this is the
    // belt to that braces, and it fails quiet rather than throwing halfway
    // through and leaving half the graph animated.
    if (arcEls.length !== A || headEls.length !== A || nodeEls.length !== N) return;
    if (N > 31) return; // reachability is carried in one 31-bit word, below

    // Each arc breathes on its own slow period. The periods are coprime-ish so
    // the pattern does not visibly repeat, and the phases are spread by the
    // golden angle so they do not all cross the threshold together.
    const freq = new Float64Array(A), phase = new Float64Array(A);
    for (let k = 0; k < A; k++) {
        freq[k] = 0.15 + ((k * 7) % 11) * 0.019;
        phase[k] = k * 2.399963;
    }
    const PRESENT = 0.1; // wave above this and the arc is in the graph

    const reach = new Int32Array(N);
    const arcLit = new Uint8Array(A), nodeLit = new Uint8Array(N), arcOn = new Uint8Array(A);
    const cur = new Float64Array(A), lastOp = new Float64Array(A).fill(-1);
    let dash = 0;

    function frame(t) {
        for (let k = 0; k < A; k++) arcOn[k] = Math.sin(t * freq[k] + phase[k]) > PRESENT ? 1 : 0;

        // Reachability closure over the arcs that are present. Thirty-one
        // nodes fit in one word, so this is a handful of ORs run to a
        // fixpoint — and "node i reaches itself" is precisely κ > 0 at i.
        for (let i = 0; i < N; i++) reach[i] = 0;
        for (let pass = 0; pass < N; pass++) {
            let changed = 0;
            for (let k = 0; k < A; k++) {
                if (!arcOn[k]) continue;
                const a = g.arcs[k].a, b = g.arcs[k].b;
                const add = reach[b] | (1 << b);
                if ((reach[a] & add) !== add) { reach[a] |= add; changed = 1; }
            }
            if (!changed) break;
        }
        for (let i = 0; i < N; i++) nodeLit[i] = (reach[i] >>> i) & 1;
        for (let k = 0; k < A; k++) {
            const arc = g.arcs[k];
            arcLit[k] = arcOn[k] && (reach[arc.b] >>> arc.a) & 1 ? 1 : 0;
        }
    }

    // Opacity is eased here rather than in CSS. A lit arc is pulled up to
    // near-solid whatever its own wave is doing, so a loop closing reads as an
    // ignition and not as a coincidence of timing; dt = 0 means "snap", which
    // is what the first frame and the reduced-motion render want.
    function paint(t, dt) {
        const ease = dt ? Math.min(1, dt * 6) : 1;
        for (let k = 0; k < A; k++) {
            const w = Math.sin(t * freq[k] + phase[k]);
            const wave = 0.14 + 0.42 * Math.max(0, Math.min(1, (w - PRESENT + 0.45) / 0.9));
            cur[k] += ((arcLit[k] ? 0.95 : wave) - cur[k]) * ease;
            const op = +cur[k].toFixed(2);
            if (op !== lastOp[k]) {
                lastOp[k] = op;
                arcEls[k].setAttribute("opacity", op);
                headEls[k].setAttribute("opacity", op);
            }
            const lit = !!arcLit[k];
            if (arcEls[k].classList.contains("lit") !== lit) {
                arcEls[k].classList.toggle("lit", lit);
                headEls[k].classList.toggle("lit", lit);
            }
            if (lit) arcEls[k].setAttribute("stroke-dashoffset", dash.toFixed(1));
        }
        for (let i = 0; i < N; i++) {
            const lit = !!nodeLit[i];
            if (nodeEls[i].classList.contains("lit") !== lit) nodeEls[i].classList.toggle("lit", lit);
        }
    }

    frame(0);
    paint(0, 0); // the first frame, always — this is also the reduced-motion render

    const rm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
    if (rm && rm.matches) return; // one frame and stop. Not optional.

    // Cheap: capped frame rate, stopped when the tab is hidden, stopped when
    // the graph scrolls out of view. The visibility test is a rect check on a
    // timer, NOT an IntersectionObserver — IO does not fire in a
    // non-compositing renderer, and an animation that never starts reads as a
    // broken page. The scroll-reveal that used to be on this site was exactly
    // that mistake, and it was deleted rather than patched.
    const FRAME = 1000 / 24;
    let last = 0, clock = 0, onScreen = true;

    setInterval(function () {
        const r = root.getBoundingClientRect();
        onScreen = r.bottom > 0 && r.top < (window.innerHeight || 0) + 80;
    }, 900);

    function step(now) {
        requestAnimationFrame(step);
        if (document.hidden || !onScreen) { last = now; return; }
        if (now - last < FRAME) return;
        const dt = Math.min(120, now - last) / 1000;
        last = now;
        clock += dt;
        dash -= dt * 22;
        frame(clock);
        paint(clock, dt);
    }
    requestAnimationFrame(step);

    document.addEventListener("visibilitychange", function () {
        last = performance.now();
    });
})();
