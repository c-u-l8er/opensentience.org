/* ── ELK geometry for the two graph stencils, computed at BUILD TIME ────────────────────────────────
   The board's geometry depends on the graph's structure and on nothing else: a Film epoch moves
   `state` and `note`, never a coordinate. So the layout is computed once here, baked into the scene,
   and the reader downloads no layout engine. (Super's cockpit runs the same elkjs@0.10.0 bundle, but
   has to run it live in the app — see vendor/PROVENANCE.md.)

   Both graph stencils draw the same 111-object world under a different grouping, and the grouping is
   the part that carries meaning: `network` groups by the book's five parts and draws each as a ring;
   `world` groups by chapter so the film can light one chapter at a time. Neither grouping survives a
   plain layered run over the whole graph — ELK would pick its own layers and the parts would stop
   being registers you can read across. So ELK is run once PER GROUP, the groups are stacked in the
   order the book gives them, and the edges that leave a group are routed here, between the groups.   */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const ELK = require(join(HERE, 'vendor/elk.bundled.js'));
const engine = new ELK();

/* one decimal is finer than a pixel; three shipped 20 KB of noise in the fetched scene */
const r3 = (v) => Math.round(v * 10) / 10;

/* One group's own layout. Only the edges with both ends inside the group are given to ELK; the rest
   are routed by `route()` below, which is the only part that can see more than one group at a time. */
const GROUP_OPTIONS = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
  'elk.randomSeed': '1',                       // the build is content-addressed; layout may not drift
};

async function layoutGroup(names, edges, box, spacing) {
  if (!names.length) return { w: 0, h: 0, pos: {}, sections: [] };
  const inside = new Set(names);
  const local = edges.filter(([, a, b]) => inside.has(a) && inside.has(b) && a !== b);
  const ports = new Map(names.map((n) => [n, []]));
  const links = local.map(([, a, b], i) => {
    const from = `p${i}s`, to = `p${i}t`;
    ports.get(a).push({ id: from, width: 1, height: 1, layoutOptions: { 'elk.port.side': 'EAST' } });
    ports.get(b).push({ id: to, width: 1, height: 1, layoutOptions: { 'elk.port.side': 'WEST' } });
    return { id: `e${i}`, sources: [from], targets: [to] };
  });
  const g = await engine.layout({
    id: 'group',
    layoutOptions: { ...GROUP_OPTIONS, ...spacing, 'elk.padding': '[top=0,left=0,bottom=0,right=0]' },
    children: names.map((n) => ({
      /* The object's footprint is not its box. Every station draws a fact line UNDER it — `cur_out=1`,
         `rotor=…`, `pose=…` — and on a film board almost all of them are filled. Reserving only the box
         let ELK route wires straight through that text and pack rows so tight the next box landed on
         it. What is reserved here is what is drawn: box + note. */
      id: n, width: box.w(n), height: box.h + (box.below || 0),
      ports: ports.get(n),
      layoutOptions: { 'elk.portConstraints': 'FIXED_SIDE' },
    })),
    edges: links,
  });
  const pos = {};
  /* the box sits at the TOP of the reserved footprint; the note band hangs below it */
  for (const c of g.children ?? []) pos[c.id] = { x: c.x + c.width / 2, y: c.y + box.h / 2 };
  const sections = [];
  for (const e of g.edges ?? []) {
    const [kind, a, b] = local[Number(e.id.slice(1))];
    for (const s of e.sections ?? []) sections.push({ kind, a, b, points: [s.startPoint, ...(s.bendPoints ?? []), s.endPoint] });
  }
  return { w: g.width ?? 0, h: g.height ?? 0, pos, sections };
}

/* ── channels ───────────────────────────────────────────────────────────────────────────────────────
   A wire that leaves its group has to cross open board, and the failure this whole module exists to
   fix is what happens when several of them pick the same lane: the hand-rolled router put every long
   edge at `sx + 14`, so on the film board one wire ran 3266 px straight down a column shared with
   its neighbours. A channel is reserved before it is drawn, and an occupied one is not offered twice. */
class Channels {
  constructor(step, clearance) { this.step = step; this.clearance = clearance; this.used = new Map(); }
  /* Score every free line and take the best. Three things make a line worse, in strict order of
     badness: it is `blocked` (it would pass through an object — disqualifying, because a wire
     emerging from the middle of an unrelated box reads as a connection to it); it shares a lane with
     a wire already reserved there; it crosses wires ELK has already routed inside a group. The third
     term is the one that matters on a board with many groups — without it a vertical leaving chapter
     3 for chapter 27 is free to slice through every row in between. */
  peek(lo, hi, from, to, prefer = lo, blocked = () => false, cost = () => 0) {
    const a = Math.min(from, to) - this.clearance, b = Math.max(from, to) + this.clearance;
    const candidates = [];
    for (let v = Math.ceil(lo / this.step) * this.step; v <= hi; v += this.step) candidates.push(v);
    if (!candidates.length) candidates.push(r3((lo + hi) / 2));
    const span = Math.max(1, hi - lo);
    let best = null, bestScore = Infinity;
    for (const v of candidates) {
      if (blocked(v, Math.min(from, to), Math.max(from, to))) continue;
      const spans = this.used.get(v) ?? [];
      const clash = spans.reduce((n, [s, e]) => n + (s < b && a < e ? 1 : 0), 0);
      const score = clash * 100 + cost(v, Math.min(from, to), Math.max(from, to)) * 10 + Math.abs(v - prefer) / span;
      if (score < bestScore) { bestScore = score; best = v; }
    }
    return best;
  }
  reserve(v, a, b) { const spans = this.used.get(v) ?? []; spans.push([a, b]); this.used.set(v, spans); }
}

/* ── the board ──────────────────────────────────────────────────────────────────────────────────────
   `groups` is an ordered list of { id, label, names }. Each is laid out by ELK, then stacked. Rings
   are emitted only when the caller asks for them (the `network` stencil draws them; `world` does not
   — its groups are chapters, and the book never drew a box around a chapter).                        */
export async function boardLayout({ groups, edges, box, ring = false, gap, pad, minWidth, spacing = {}, escape = 40 }) {
  const laid = [];
  for (const g of groups) laid.push({ ...g, ...(await layoutGroup(g.names, edges, box, spacing)) });

  const inner = Math.max(minWidth, ...laid.map((g) => g.w));
  const left = pad.left;
  let y = pad.top;
  const pos = {}, rings = [], bandTop = {};
  for (const g of laid) {
    const top = y, height = g.h + (ring ? pad.ring * 2 : 0);
    const contentTop = top + (ring ? pad.ring : 0);
    for (const [n, p] of Object.entries(g.pos)) pos[n] = { x: r3(left + p.x), y: r3(contentTop + p.y) };
    if (ring) rings.push({ id: 'band-' + g.id, label: g.label, x: 16, y: r3(top), w: 0, h: r3(height), state: 'idle', note: '' });
    bandTop[g.id] = { top, bottom: top + height, contentTop };
    y = top + height + gap;
  }
  const W = Math.max(minWidth, left + inner + pad.right);
  const H = y - gap + pad.bottom;
  for (const r of rings) r.w = W - 32;

  /* intra-group wires come back from ELK already routed; shift them into board coordinates */
  const wires = [];
  const seen = new Set();
  for (const g of laid) {
    const contentTop = bandTop[g.id].contentTop;
    for (const s of g.sections) {
      const pts = s.points.map((p) => [r3(left + p.x), r3(contentTop + p.y)]);
      wires.push({ kind: s.kind, a: s.a, b: s.b, points: pts, link: false });
      seen.add(s.a + '->' + s.b);
    }
  }

  /* everything that leaves a group */
  const groupOf = {};
  for (const g of groups) for (const n of g.names) groupOf[n] = g.id;
  /* the objects a wire must not be drawn through, with a little air around them */
  const AIR = 5;
  const rects = Object.entries(pos).map(([id, p]) => ({ id, x1: p.x - box.w(id) / 2 - AIR, x2: p.x + box.w(id) / 2 + AIR, y1: p.y - box.h / 2 - AIR, y2: p.y + box.h / 2 + (box.below || 0) + AIR }));
  const clearRect = (a, b, x1, y1, x2, y2) => rects.some((r) => r.id !== a && r.id !== b && x1 < r.x2 && r.x1 < x2 && y1 < r.y2 && r.y1 < y2);
  /* every segment already on the board — ELK's inside each group, and each inter-group wire as it is
     decided — so a channel can be chosen to cross as few of them as possible. Wires that share an
     endpoint with the one being routed do not count: meeting at an object is not a crossing. */
  const drawn = [];
  for (const w of wires) for (let i = 0; i < w.points.length - 1; i++) drawn.push({ a: w.a, b: w.b, x1: w.points[i][0], y1: w.points[i][1], x2: w.points[i + 1][0], y2: w.points[i + 1][1] });
  const ccw = (ax, ay, bx, by, cx, cy) => (cy - ay) * (bx - ax) > (by - ay) * (cx - ax);
  const crossCount = (a, b, x1, y1, x2, y2) => drawn.reduce((n, s) => {
    if (s.a === a || s.b === a || s.a === b || s.b === b) return n;
    const hit = ccw(x1, y1, s.x1, s.y1, s.x2, s.y2) !== ccw(x2, y2, s.x1, s.y1, s.x2, s.y2)
             && ccw(x1, y1, x2, y2, s.x1, s.y1) !== ccw(x1, y1, x2, y2, s.x2, s.y2);
    return n + (hit ? 1 : 0);
  }, 0);
  const vert = new Channels(6, 7);
  const lanes = new Channels(7, 6);
  const crossing = edges.filter(([, a, b]) => pos[a] && pos[b] && groupOf[a] !== groupOf[b] && !seen.has(a + '->' + b));
  /* shortest first: a near jump should get the lane closest to its own row, before a long one that
     has to reach across the board claims it */
  crossing.sort((p, q) => Math.abs(pos[p[2]].y - pos[p[1]].y) - Math.abs(pos[q[2]].y - pos[q[1]].y));
  const contentRight = left + inner;
  const pathCost = (a, b, pts) => {
    let c = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
      if (clearRect(a, b, Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2))) return Infinity;
      c += crossCount(a, b, x1, y1, x2, y2);
    }
    return c;
  };
  for (const [kind, a, b] of crossing) {
    const sx = r3(pos[a].x + box.w(a) / 2), sy = pos[a].y;
    const tx = r3(pos[b].x - box.w(b) / 2), ty = pos[b].y;
    const blockV = (x, y0, y1) => clearRect(a, b, x, y0, x, y1);
    const blockH = (y, x0, x1) => clearRect(a, b, x0, y, x1, y);
    const costV = (x, y0, y1) => crossCount(a, b, x, y0, x, y1);
    const costH = (y, x0, x1) => crossCount(a, b, x0, y, x1, y);

    /* Four shapes, scored against what is already drawn; the cheapest wins. The board never picks a
       shape on the geometry alone, because the same turn is good on an empty row and bad on a full
       one — which is exactly the judgement the old router had no way to make. */
    const shapes = [];
    if (Math.abs(sy - ty) < 0.5 && tx > sx) shapes.push({ pts: [[sx, sy], [tx, ty]], hold: [] });
    if (tx - sx >= 40) {
      const x = vert.peek(sx + 14, tx - 14, sy, ty, sx + (tx - sx) / 2, blockV, costV);
      if (x !== null) shapes.push({ pts: [[sx, sy], [x, sy], [x, ty], [tx, ty]], hold: [[vert, x, sy, ty]] });
    }
    /* A trunk down the LEFT margin — the one column of the board that holds no objects. A run across
       many groups belongs there; without it, a wire from an early chapter to a late one slices through
       every row in between (the 3266 px column the old board drew at x=164).

       It leaves the source's LEFT edge, not its right. Leaving right and doubling back over its own box
       is what a feedback wire must never look like: the arrow says "signal flows on" and then the line
       turns around. Out the left, down the margin, in the target's left edge — the reader follows one
       direction the whole way, and the board keeps its left-to-right grammar. */
    {
      const lx = r3(pos[a].x - box.w(a) / 2);
      const x = vert.peek(16, Math.max(18, left - 26), sy, ty, Math.max(18, left - 34), blockV, costV);
      if (x !== null && x < lx) shapes.push({ pts: [[lx, sy], [x, sy], [x, ty], [tx, ty]], hold: [[vert, x, sy, ty]] });
    }
    {
      const down = ty > sy;
      const g1 = bandTop[groupOf[down ? a : b]], g2 = bandTop[groupOf[down ? b : a]];
      const lane = lanes.peek(g1.bottom + 3, g2.top - 3, Math.min(sx, tx), Math.max(sx, tx), (g1.bottom + g2.top) / 2, blockH, costH);
      if (lane !== null) {
        const xOut = vert.peek(sx + 10, sx + escape, sy, lane, sx + 16, blockV, costV) ?? r3(sx + 16);
        const xIn = vert.peek(tx - escape, tx - 10, lane, ty, tx - 16, blockV, costV) ?? r3(tx - 16);
        shapes.push({ pts: [[sx, sy], [xOut, sy], [xOut, lane], [xIn, lane], [xIn, ty], [tx, ty]], hold: [[lanes, lane, sx, tx], [vert, xOut, sy, lane], [vert, xIn, lane, ty]] });
      }
    }
    let best = shapes[0], bestCost = Infinity;
    for (const sh of shapes) { const c = pathCost(a, b, sh.pts); if (c < bestCost) { bestCost = c; best = sh; } }
    if (!best) best = { pts: [[sx, sy], [r3(sx + 16), sy], [r3(sx + 16), ty], [tx, ty]], hold: [] };
    for (const [ch, v, p0, p1] of best.hold) ch.reserve(v, Math.min(p0, p1) - ch.clearance, Math.max(p0, p1) + ch.clearance);
    wires.push({ kind, a, b, points: best.pts, link: true });
    for (let i = 0; i < best.pts.length - 1; i++) drawn.push({ a, b, x1: best.pts[i][0], y1: best.pts[i][1], x2: best.pts[i + 1][0], y2: best.pts[i + 1][1] });
  }
  /* which group each object ended up in, by the group's own label: the board's readout reports it
     as the object's band, and it is derived here so no caller has to recompute the grouping. */
  const bandOf = {};
  if (ring) for (const g of groups) for (const n of g.names) if (pos[n]) bandOf[n] = g.label;
  return { W: Math.ceil(W), H: Math.ceil(H), pos, rings, wires, ...(ring ? { bandOf } : {}) };
}
