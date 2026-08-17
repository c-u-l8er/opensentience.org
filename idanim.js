/* ===========================================================================
   OpenSentience — the identifying animation. SHELL.md §8.

   What it depicts: a directed graph. Arcs drift in and out, and when the arcs
   that happen to be present close a directed cycle, that cycle lights up and
   flows; when the cycle breaks it goes quiet again. Separately, traces travel
   the arcs that are present, spreading from whichever node has gone longest
   without one. That is this page's own h1 — "does the shape of a knowledge
   graph tell you when to think harder?" — and the answer beneath it is κ:
   κ > 0 holds exactly when the graph contains an irreducible feedback loop. So
   the thing that moves is the thing the site is about.

   WHY THIS REPLACED THE LADDER, because it will otherwise be re-discovered:
   the previous version drew two vertical rails and twenty-nine horizontal
   rungs in var(--line2). On a paper-coloured page that renders as RULED
   NOTEBOOK PAPER, and each rail reads as a stray horizontal rule. Travis
   reported it as "fix the very first HR at the top of the page just below the
   fold" — and this page has ZERO <hr> elements. The bottom rail was the "HR".
   A replacement must therefore not be built out of long horizontal lines; that
   constraint, not the motion, was the actual defect. This graph goes further
   than the gate asks: no arc in it runs within 8° of horizontal AT ALL, at any
   length, because the arc chooser refuses such a pair outright (HMAX below).

   RULE 2, and it is the reason this file is separate and closed:
   IT RENDERS NO DATA AND ASSERTS NOTHING.

   - It reads nothing from the document — no attribute, no dataset, no query
     string, no count derived from the page. It is handed nothing and it asks
     for nothing.
   - It writes nothing back except two opacities, a dash offset and two class
     names, on elements the build already emitted. It creates no element and
     removes none, so with JavaScript off the graph is still drawn — just
     still, and with the trace layer silent at opacity 0.
   - Its two countable constants below are DELIBERATELY not any figure this
     page prints. MEASURED 2026-08-17, not assumed: the integers already
     standing as page text are EVERY ONE FROM 0 TO 28, plus 46, 55 and 60 —
     the reference list is 28 entries long, which is where the run comes from.
     A previous lane tried 11 and 7 and the build refused both. build.mjs
     parses the block below and fails the build if either number appears as a
     standalone number in the page's text.
   - Which is also why the traces have NO count. A number of walkers would be
     countable on screen, and every plausible one is page text. So a trace is
     not a walker: it is a pulse that spreads along whichever arcs are present,
     and how many are alive at an instant is decided by the graph, not typed
     anywhere. Nothing here declares it and nothing could publish it.

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
const ARCS = 61;
/* IDENTITY-CONSTANTS-END */

function idGraph() {
    "use strict";
    // The drawing box, and inside it the FIELD: the ellipse inscribed in that
    // box. The stylesheet masks the layer to a soft disc, so the corners of the
    // box are never visible; sampling the ellipse spends every node somewhere a
    // reader can see one. The previous version jittered a 5×7 grid and dropped
    // its four corner cells, which left the bottom 60 px of the box empty — a
    // 61 px hole in the middle of the bottom edge, measured, and a graph that
    // did not reach the edges it appeared to claim.
    const X0 = 20, X1 = 280, Y0 = 26, Y1 = 404;
    const CX = (X0 + X1) / 2, CY = (Y0 + Y1) / 2, RX = (X1 - X0) / 2, RY = (Y1 - Y0) / 2;
    const NR = 3.2;            // node radius, also used to trim the arcs
    const CAND = 14;           // darts per node — best-candidate blue noise
    const RELAX = 26, STEP = 0.34;
    const HDEG = 8, HMAX = 50; // an arc within HDEG° of horizontal may not exceed HMAX px

    const inField = (x, y) => ((x - CX) / RX) ** 2 + ((y - CY) / RY) ** 2;

    // The seed is a date and any date is as arbitrary as any other, so it was
    // CHOSEN rather than typed: fourteen were tried and this one spreads the
    // graph flattest across the four quarters of the field — 8/8/8/7 nodes and
    // 16/14/16/15 arcs, against 10/6/8/7 and 18/11/18/14 for the one before it,
    // whose thin top-right quarter showed up as 11 % of all the lighting.
    let s = 20260816 % 2147483647;
    const rnd = () => (s = (s * 48271) % 2147483647) / 2147483647;

    // Mitchell's best-candidate: each node is the furthest of CAND darts from
    // everything already placed. This is why the placement is blue noise rather
    // than a jittered lattice — a lattice with enough jitter to stop reading as
    // rows also has enough jitter to clump, and it did: nearest-neighbour
    // spacing ran 20.2–77.2 px, a coefficient of variation of 0.34. Rejection
    // sampling is bounded and falls back to a radial clamp, so this always
    // terminates and always yields exactly NODES.
    const nodes = [];
    for (let i = 0; i < NODES; i++) {
        let bx = CX, by = CY, bd = -1;
        for (let c = 0; c < CAND; c++) {
            let x = 0, y = 0;
            for (let tries = 0; tries < 40; tries++) {
                x = X0 + rnd() * (X1 - X0);
                y = Y0 + rnd() * (Y1 - Y0);
                const q = inField(x, y);
                if (q <= 1) break;
                if (tries === 39) { const r = Math.sqrt(q); x = CX + (x - CX) / r; y = CY + (y - CY) / r; }
            }
            let d = Infinity;
            for (let j = 0; j < nodes.length; j++) d = Math.min(d, Math.hypot(nodes[j].x - x, nodes[j].y - y));
            if (d === Infinity) d = 0; // the first node has nothing to be far from
            if (d > bd) { bd = d; bx = x; by = y; }
        }
        nodes.push({ x: bx, y: by });
    }

    // Then relax toward even coverage: anything closer than the hexagonal
    // spacing for this many nodes in this much area pushes apart, and anything
    // pushed outside the field is pulled back onto its boundary.
    const TARGET = Math.sqrt((2 * Math.PI * RX * RY) / (NODES * Math.sqrt(3)));
    for (let pass = 0; pass < RELAX; pass++) {
        for (let i = 0; i < NODES; i++) {
            let fx = 0, fy = 0;
            for (let j = 0; j < NODES; j++) {
                if (i === j) continue;
                const dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y;
                const d = Math.hypot(dx, dy) || 0.001;
                if (d < TARGET) { const f = (TARGET - d) / TARGET; fx += (dx / d) * f; fy += (dy / d) * f; }
            }
            let x = nodes[i].x + fx * TARGET * STEP, y = nodes[i].y + fy * TARGET * STEP;
            const q = inField(x, y);
            if (q > 1) { const r = Math.sqrt(q); x = CX + (x - CX) / r; y = CY + (y - CY) / r; }
            nodes[i].x = x; nodes[i].y = y;
        }
    }
    for (const n of nodes) { n.x = +n.x.toFixed(2); n.y = +n.y.toFixed(2); }

    // A pair that would run flat and long is never offered. The gate downstream
    // refuses one at 60 px; refusing it at 50 here means the drawing cannot
    // produce the shape at all rather than being caught having produced it.
    const flat = (i, j) => {
        const dx = nodes[j].x - nodes[i].x, dy = nodes[j].y - nodes[i].y;
        const a = Math.abs((Math.atan2(dy, dx) * 180) / Math.PI);
        return Math.min(a, 180 - a) < HDEG && Math.hypot(dx, dy) > HMAX;
    };

    const key = (i, j) => (i < j ? i + ":" + j : j + ":" + i);
    const pairs = [];
    const seen = Object.create(null);
    const deg = new Int32Array(NODES);
    const take = (i, j) => {
        const k = key(i, j);
        if (seen[k]) return;
        seen[k] = 1;
        deg[i]++; deg[j]++;
        pairs.push({ i: Math.min(i, j), j: Math.max(i, j) });
    };
    // Two rounds, so EVERY node ends with at least two arcs. A node on a single
    // thread can never lie on a cycle and can never pass a trace through, and
    // the old graph had such nodes: twelve of its thirty-one could never light,
    // which is the "it only works in one corner" complaint stated as a number.
    for (let round = 0; round < 2; round++) {
        for (let i = 0; i < NODES; i++) {
            if (deg[i] > round) continue;
            let best = -1, bd = Infinity;
            for (let j = 0; j < NODES; j++) {
                if (i === j || seen[key(i, j)] || flat(i, j)) continue;
                const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
                if (d < bd) { bd = d; best = j; }
            }
            if (best >= 0) take(i, best);
        }
    }
    // Then the shortest remaining pairs, so the mesh is local: medium arcs over
    // an evenly-filled field read as a graph, long chords over an empty one
    // read as noise.
    const rest = [];
    for (let i = 0; i < NODES; i++) {
        for (let j = i + 1; j < NODES; j++) {
            if (seen[key(i, j)] || flat(i, j)) continue;
            rest.push({ i, j, d: Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y) });
        }
    }
    rest.sort((a, b) => a.d - b.d || a.i - b.i || a.j - b.j);
    for (let k = 0; pairs.length < ARCS && k < rest.length; k++) take(rest[k].i, rest[k].j);
    pairs.length = Math.min(pairs.length, ARCS);

    // Nothing may be stranded. If the mesh came out in pieces, the shortest
    // legal pair spanning two of them is added and the shortest is dropped —
    // a component no trace can reach is the old bug in miniature. Union-find,
    // and on this geometry it has nothing to do, which is worth knowing.
    {
        const p = new Int32Array(NODES).map((_, i) => i);
        const find = (a) => { while (p[a] !== a) { p[a] = p[p[a]]; a = p[a]; } return a; };
        for (const pr of pairs) { const a = find(pr.i), b = find(pr.j); if (a !== b) p[a] = b; }
        for (;;) {
            let bi = -1, bj = -1, bd = Infinity;
            for (let i = 0; i < NODES; i++) {
                for (let j = i + 1; j < NODES; j++) {
                    if (find(i) === find(j) || seen[key(i, j)] || flat(i, j)) continue;
                    const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
                    if (d < bd) { bd = d; bi = i; bj = j; }
                }
            }
            if (bi < 0) break;
            pairs.pop();
            take(bi, bj);
            p[find(bi)] = find(bj);
        }
    }

    // Orientation is a CIRCULATION, and it is chosen rather than sampled: each
    // arc is pointed the way that runs counterclockwise about the centre of the
    // field, with the arithmetic tie-break for one that runs dead radial. That
    // is a decision about the SUBJECT — a graph on a page about feedback loops
    // should have feedback in it to find — and it is the whole of the decision.
    // Whether a loop is closed AT THIS INSTANT is not decided here and cannot
    // be: that is the reachability closure in the driver, over only the arcs
    // present in that frame, and it comes out dark in most of them. Under a
    // hash orientation instead, the graph had four nodes on any cycle at all
    // and the picture was correspondingly dead; under this one it has all
    // thirty-one, and still lights in well under half of frames.
    const dir = pairs.map((pr) => {
        const A = nodes[pr.i], B = nodes[pr.j];
        const rx = (A.x + B.x) / 2 - CX, ry = (A.y + B.y) / 2 - CY;
        const cross = rx * (B.y - A.y) - ry * (B.x - A.x);
        const ccw = cross === 0 ? (pr.i * 3 + pr.j * 7) % 2 === 0 : cross > 0;
        return ccw ? [pr.i, pr.j] : [pr.j, pr.i];
    });

    const TSEG = 13; // the lit length of a trace, in px along the arc
    const arcs = dir.map(function (e, k) {
        const a = e[0], b = e[1];
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
        // Arc length by chords, so a trace can be placed at a fraction of the
        // way along and the dash pattern can be written into the MARKUP. The
        // driver therefore never has to read a path length back out of the DOM,
        // and never has to set a dash array at run time.
        let L = 0, qx = sx, qy = sy;
        for (let t = 1; t <= 16; t++) {
            const u = t / 16, v = 1 - u;
            const nx = v * v * sx + 2 * v * u * mx + u * u * ex;
            const ny = v * v * sy + 2 * v * u * my + u * u * ey;
            L += Math.hypot(nx - qx, ny - qy); qx = nx; qy = ny;
        }
        L = +L.toFixed(2);
        return {
            a, b, len: L, seg: TSEG,
            dash: TSEG + " " + +(L + TSEG).toFixed(2),
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
    const traceEls = root.querySelectorAll(".idt");
    const nodeEls = root.querySelectorAll(".idn");

    const g = idGraph();
    const A = g.arcs.length, N = g.nodes.length;
    // The build proves these agree before the page is emitted; this is the
    // belt to that braces, and it fails quiet rather than throwing halfway
    // through and leaving half the graph animated.
    if (arcEls.length !== A || headEls.length !== A || traceEls.length !== A || nodeEls.length !== N) return;
    if (N > 31) return; // reachability is carried in one 31-bit word, below

    // Each arc breathes on its own period, and the period comes from WHERE the
    // arc is, not from its index: an index-keyed period can put a whole region
    // on one clock, and then that region sits still while another churns. The
    // phases are spread by the golden angle so they do not all cross the
    // threshold together. Periods run about six to thirteen seconds, which is
    // three to four times the old rate — the old graph changed 3.2 arcs per
    // second and this one changes about fifteen, over half again as many arcs.
    const FMIN = 0.5, FMAX = 1.05;
    const freq = new Float64Array(A), phase = new Float64Array(A);
    for (let k = 0; k < A; k++) {
        const P = g.nodes[g.arcs[k].a], Q = g.nodes[g.arcs[k].b];
        const h = ((Math.round((P.x + Q.x) * 3.7) + Math.round((P.y + Q.y) * 8.3)) % 17 + 17) % 17;
        freq[k] = FMIN + (h / 16) * (FMAX - FMIN);
        phase[k] = k * 2.399963 + h * 0.37;
    }
    // Wave above this and the arc is in the graph. This is the one dial that
    // decides how often a loop can close, and it is set by MEASUREMENT, not by
    // taste: at −0.25 a cycle exists in 41 % of frames, which is where the
    // previous version sat (43 %), so the graph is dark for well over half its
    // life. Turning it up would light more of the field, and a field that is
    // uniformly hot reads as static exactly the way a clumped one does. What
    // was raised instead is how OFTEN the present set changes — 1.4 arcs a
    // second became 15.6.
    const PRESENT = -0.25;

    const reach = new Int32Array(N);
    const arcLit = new Uint8Array(A), nodeLit = new Uint8Array(N), arcOn = new Uint8Array(A);
    const cur = new Float64Array(A), lastOp = new Float64Array(A).fill(-1), lastTr = new Float64Array(A).fill(-1);

    // A trace is a pulse travelling one arc. When it arrives it marks the node
    // and spreads to every arc leaving that node which is present at the time,
    // weaker each hop until it dies out. Nothing schedules a route; the pulse
    // goes wherever the graph currently lets it, and if an arc drops while a
    // pulse is on it the pulse drops with it — which is the point.
    const TSPEED = 70, TDECAY = 0.84, TMIN = 0.13, TSEED = 0.5, TVIS = 0.55;
    const outArcs = [];
    for (let i = 0; i < N; i++) outArcs.push([]);
    for (let k = 0; k < A; k++) outArcs[g.arcs[k].a].push(k);
    const pPos = new Float64Array(A), pAmp = new Float64Array(A);
    const lastSeen = new Float64Array(N).fill(-1e4), visUntil = new Float64Array(N).fill(-1);
    const inbound = new Uint8Array(N);
    let seedT = 0, clock = 0, dash = 0;

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

    function fire(i, amp) {
        lastSeen[i] = clock;
        visUntil[i] = clock + TVIS;
        if (amp < TMIN) return;
        const o = outArcs[i];
        for (let n = 0; n < o.length; n++) if (arcOn[o[n]]) { pPos[o[n]] = 0; pAmp[o[n]] = amp; }
    }

    function traces(dt) {
        for (let i = 0; i < N; i++) inbound[i] = 0;
        for (let k = 0; k < A; k++) {
            if (pAmp[k] <= 0) continue;
            if (!arcOn[k]) { pAmp[k] = 0; continue; }
            pPos[k] += (dt * TSPEED) / g.arcs[k].len;
            if (pPos[k] >= 1) { const amp = pAmp[k]; pAmp[k] = 0; fire(g.arcs[k].b, amp * TDECAY); }
            else inbound[g.arcs[k].b] = 1;
        }
        seedT -= dt;
        if (seedT > 0) return;
        seedT += TSEED;
        // Seed at the node that has gone longest without a trace, skipping one
        // a pulse is already on its way to — otherwise two traces converge on
        // the same place and a corner of the field stays stale. This bias is
        // the whole of the coverage story: without it a walk gets trapped in
        // whichever part of the graph is currently dense.
        let w = -1, wt = Infinity;
        for (let i = 0; i < N; i++) if (!inbound[i] && lastSeen[i] < wt) { wt = lastSeen[i]; w = i; }
        if (w < 0) { w = 0; for (let i = 1; i < N; i++) if (lastSeen[i] < lastSeen[w]) w = i; }
        fire(w, 1);
    }

    // Opacity is eased here rather than in CSS. A lit arc is pulled up to
    // near-solid whatever its own wave is doing, so a loop closing reads as an
    // ignition and not as a coincidence of timing; dt = 0 means "snap", which
    // is what the first frame and the reduced-motion render want.
    function paint(t, dt) {
        const ease = dt ? Math.min(1, dt * 5) : 1;
        for (let k = 0; k < A; k++) {
            const w = Math.sin(t * freq[k] + phase[k]);
            const wave = 0.12 + 0.38 * Math.max(0, Math.min(1, (w - PRESENT + 0.45) / 0.9));
            cur[k] += ((arcLit[k] ? 0.92 : wave) - cur[k]) * ease;
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
            // The trace layer: one overlay path per arc, drawn by the build
            // with its dash pattern already in the markup and opacity 0, so all
            // that moves here is where the lit segment sits along the path.
            const tr = pAmp[k] > 0 ? +(Math.min(1, pAmp[k]) * 0.9).toFixed(2) : 0;
            if (tr !== lastTr[k]) { lastTr[k] = tr; traceEls[k].setAttribute("opacity", tr); }
            if (tr) traceEls[k].setAttribute("stroke-dashoffset", (g.arcs[k].seg - pPos[k] * g.arcs[k].len).toFixed(1));
        }
        for (let i = 0; i < N; i++) {
            const lit = !!nodeLit[i];
            if (nodeEls[i].classList.contains("lit") !== lit) nodeEls[i].classList.toggle("lit", lit);
            const vis = t < visUntil[i];
            if (nodeEls[i].classList.contains("vis") !== vis) nodeEls[i].classList.toggle("vis", vis);
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
    let last = 0, onScreen = true;

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
        traces(dt);
        paint(clock, dt);
    }
    requestAnimationFrame(step);

    document.addEventListener("visibilitychange", function () {
        last = performance.now();
    });
})();
