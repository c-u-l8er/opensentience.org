/* ===========================================================================
   OpenSentience — the identifying animation. SHELL.md §8.

   What it depicts: a ladder being checked. A verification pass sweeps upward;
   each band it reaches lights, and one band in the pass refuses and stays dark.
   That is what this site is about, which is why it is the thing that moves.

   RULE 2, and it is the reason this file is separate and closed:
   IT RENDERS NO DATA AND ASSERTS NOTHING.

   - It reads nothing from the document — no attribute, no dataset, no query
     string, no count derived from the page.
   - It writes nothing back except its own <g> children.
   - Its two constants below are DELIBERATELY not any figure this page prints.
     The real ladder has eight rungs and the suites enforce 103 + 15 laws; none
     of those numbers is here, and none of the numbers here is any of those.
     wrand.cc draws 14 nodes for a 25-node graph for the same reason. 11 and 7
     were the first choice and the build refused them: this page carries a
     28-entry reference list, so every small integer is already on it.
     build.mjs parses the block below and fails the build if either number
     appears as a standalone number in the page's text.

   The `12 Active Pathfinders` defect is what this guards against: a sibling
   surface published `for (let i = 0; i < 12; i++)` — a decorative canvas's loop
   bound — as a live user metric, for months.

   Remove the <script> tag that loads this file and every figure, chip, status
   row, count and word on the page is still there.
   =========================================================================== */

/* IDENTITY-CONSTANTS-START — parsed by build.mjs. Numbers here must not appear
   as text on the page. They are chosen to be nobody's measurement. */
const BANDS = 29;
const MARKS = 41;
/* IDENTITY-CONSTANTS-END */

(function ladder() {
    "use strict";
    const root = document.querySelector("[data-identity-animation]");
    if (!root) return;
    const layer = root.querySelector("#ident-marks");
    if (!layer) return;

    const NS = "http://www.w3.org/2000/svg";
    const TOP = 30;
    const BOT = 400;
    const LEFT = 34;
    const RIGHT = 266;
    const GAP = (BOT - TOP) / (BANDS - 1);

    // Each mark is a closed record: how far up the ladder it has climbed, and
    // whether this pass refused it. Nothing outside this closure can read it.
    const marks = [];
    for (let i = 0; i < MARKS; i++) {
        const el = document.createElementNS(NS, "circle");
        el.setAttribute("r", "3.4");
        layer.appendChild(el);
        marks.push({ el, t: -(i / MARKS) * (BANDS - 1), refused: false });
    }

    // Refusal is decided once, on respawn, by the mark's own index and a
    // rotating offset — no randomness that could be mistaken for sampling, and
    // no input from anywhere in the document.
    let pass = 0;
    function respawn(m, i) {
        m.t = -0.7;
        m.refused = (i + pass) % 4 === 0;
        if (i === 0) pass++;
    }

    const REFUSE_AT = BANDS - 8;

    function paint() {
        for (const m of marks) {
            const t = m.t;
            if (t < -0.6) {
                m.el.setAttribute("opacity", "0");
                continue;
            }
            const held = m.refused && t > REFUSE_AT;
            const y = BOT - Math.max(0, held ? REFUSE_AT : t) * GAP;
            const x = LEFT + ((RIGHT - LEFT) * ((Math.max(0, t) * 0.37) % 1));
            m.el.setAttribute("cx", x.toFixed(1));
            m.el.setAttribute("cy", y.toFixed(1));
            m.el.setAttribute("fill", held ? "var(--warn)" : "var(--data)");
            m.el.setAttribute("opacity", held ? "0.75" : t < 0 ? (1 + t / 0.7).toFixed(2) : "0.9");
        }
    }

    paint(); // the first frame, always — this is also the reduced-motion render

    const rm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
    if (rm && rm.matches) return; // one frame and stop. Not optional.

    // Cheap: capped frame rate, stopped when the tab is hidden, stopped when
    // the ladder scrolls out of view. The visibility test is a rect check on a
    // timer, NOT an IntersectionObserver — IO does not fire in a
    // non-compositing renderer, and an animation that never starts reads as a
    // broken page. The scroll-reveal that used to be on this site was exactly
    // that mistake, and it was deleted rather than patched.
    const FRAME = 1000 / 22;
    let last = 0;
    let onScreen = true;

    setInterval(function () {
        const r = root.getBoundingClientRect();
        onScreen = r.bottom > 0 && r.top < (window.innerHeight || 0) + 80;
    }, 900);

    function step(now) {
        requestAnimationFrame(step);
        if (document.hidden || !onScreen) {
            last = now;
            return;
        }
        if (now - last < FRAME) return;
        const dt = Math.min(120, now - last) / 1000;
        last = now;
        for (let i = 0; i < marks.length; i++) {
            const m = marks[i];
            m.t += dt * (m.refused && m.t > REFUSE_AT ? 0.18 : 0.55);
            if (m.t > BANDS - 1 + 0.8) respawn(m, i);
        }
        paint();
    }
    requestAnimationFrame(step);

    document.addEventListener("visibilitychange", function () {
        last = performance.now();
    });
})();
