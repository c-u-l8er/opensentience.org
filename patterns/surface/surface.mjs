/* surface.mjs — the compute-surface animation engine for Unboxed Patterns.
 *
 * ONE LAYOUT PATH, TWO RENDERERS. A scene is data: a STENCIL (join | multiplex | migrate | progress | wire)
 * that lays out a surface — slots (carriers), stations (joins), wires, meters — and a list of STEPS, each
 * a caption, an optional takeaway, and a list of generic ACTIONS that mutate state. `computeState(scene, i)`
 * is pure; `svg(state)` is a pure string. The build renders thumbnails and first frames in node with the
 * same two functions the browser uses, so a card's picture is the page's frame 0 and cannot drift from it.
 * In the browser, `mount()` tweens loci between successive states and fills the takeaway list as the
 * reader steps — the "gold" is collected by stepping, not by scrolling.
 *
 * Nothing here is evidence. A scene illustrates a pattern's claim; the witness on the page is what
 * decides. Scenes say so in their own caption when a number is quoted.
 */
const W = 840, H = 380;
const clone = (x) => JSON.parse(JSON.stringify(x));

/* ── stencils: params → initial state + anchors ─────────────────────────────────────────────────── */
const STENCILS = {
  /* two producers, one consumer, one join station */
  join(p = {}) {
    const st = base();
    st.stations.push({ id: 'J', x: 420, y: 200, label: p.station || 'join', state: 'idle', note: '' });
    st.anchors = { left: { x: 150, y: 200 }, left2: { x: 150, y: 290 }, right: { x: 690, y: 200 }, J: { x: 420, y: 200 }, out: { x: 690, y: 290 }, off: { x: -80, y: 200 } };
    for (const l of p.loci || []) st.loci.push(locus(l, st.anchors[l.at || 'off']));
    return st;
  },
  /* n slots on the floor, k loci above them */
  multiplex(p = {}) {
    const st = base(); const n = p.slots || 8, gap = 80, x0 = (W - (n - 1) * gap) / 2;
    for (let i = 0; i < n; i++) st.slots.push({ id: 's' + i, x: x0 + i * gap, y: 300, label: p.slotLabel ? p.slotLabel + i : 'slot ' + i, state: 'idle' });
    const k = p.loci || 16, cols = Math.min(k, 16), gx = Math.min(48, (W - 80) / cols), qx0 = (W - (cols - 1) * gx) / 2;
    for (let i = 0; i < k; i++) st.loci.push(locus({ id: 'L' + i, label: p.short ? '' : 'L' + i, state: 'live' }, { x: qx0 + (i % cols) * gx, y: 90 + Math.floor(i / cols) * 44 }));
    st.anchors = Object.fromEntries(st.slots.map((s) => [s.id, { x: s.x, y: s.y - 34 }]));
    st.loci.forEach((l, i) => { st.anchors['q' + i] = { x: l.x, y: l.y }; });
    st.anchors.queue = { x: W / 2, y: 90 }; st.anchors.off = { x: -80, y: 90 };
    return st;
  },
  /* carriers in a row, one or two loci that move between them; a mailbox */
  migrate(p = {}) {
    const st = base(); const carriers = p.carriers || ['thread', 'core', 'machine'];
    const gap = 200, x0 = (W - (carriers.length - 1) * gap) / 2;
    carriers.forEach((c, i) => st.slots.push({ id: 'c' + i, x: x0 + i * gap, y: 300, label: c, state: 'idle', wide: true }));
    st.anchors = Object.fromEntries(st.slots.map((s) => [s.id, { x: s.x, y: s.y - 40 }]));
    st.anchors.air = { x: W / 2, y: 110 }; st.anchors.off = { x: -80, y: 110 }; st.anchors.mail = { x: W / 2 + 200, y: 110 };
    if (p.mailbox) st.stations.push({ id: 'M', x: W / 2 + 200, y: 110, label: 'mailbox', state: 'idle', note: '', box: true, count: 0 });
    for (const l of p.loci || []) st.loci.push(locus(l, st.anchors[l.at || 'air']));
    return st;
  },
  /* two carriers, each with a utilization meter and a progress meter */
  progress(p = {}) {
    const st = base(); const names = p.carriers || ['carrier A', 'carrier B'];
    names.forEach((c, i) => {
      const x = 220 + i * 400;
      st.slots.push({ id: 'c' + i, x, y: 300, label: c, state: 'idle', wide: true });
      st.meters.push({ id: 'u' + i, x: x - 110, y: 120, w: 220, label: 'utilization', value: 0, max: 100, kind: 'util' });
      st.meters.push({ id: 'p' + i, x: x - 110, y: 180, w: 220, label: 'admitted transitions', value: 0, max: 100, kind: 'prog' });
    });
    st.anchors = Object.fromEntries(st.slots.map((s) => [s.id, { x: s.x, y: s.y - 40 }]));
    st.anchors.off = { x: -80, y: 260 };
    for (const l of p.loci || []) st.loci.push(locus(l, st.anchors[l.at || 'off']));
    return st;
  },
  /* a producer, a wire, two verifiers */
  wire(p = {}) {
    const st = base();
    st.stations.push({ id: 'P', x: 120, y: 200, label: p.producer || 'producer', state: 'idle', note: '' });
    st.stations.push({ id: 'V1', x: 700, y: 120, label: p.v1 || 'verifier A', state: 'idle', note: '' });
    st.stations.push({ id: 'V2', x: 700, y: 280, label: p.v2 || 'verifier B', state: 'idle', note: '' });
    const hw = (l) => Math.max(44, l.length * 5 + 22);
    const tip1 = 700 - hw(p.v1 || 'verifier A') - 4, tip2 = 700 - hw(p.v2 || 'verifier B') - 4, xb = Math.min(tip1, tip2) - 22;
    st.wires.push({ id: 'w', x1: 120 + hw(p.producer || 'producer') + 4, y1: 200, x2: 560, y2: 200, label: p.wire || 'the wire' });
    st.wires.push({ id: 'w1', points: [[560, 200], [xb, 200], [xb, 120], [tip1, 120]], x1: 560, y1: 200, x2: tip1, y2: 120, label: '', thin: true });
    st.wires.push({ id: 'w2', points: [[560, 200], [xb, 200], [xb, 280], [tip2, 280]], x1: 560, y1: 200, x2: tip2, y2: 280, label: '', thin: true });
    st.anchors = { P: { x: 120, y: 200 }, mid: { x: 410, y: 200 }, V1: { x: 700, y: 120 }, V2: { x: 700, y: 280 }, off: { x: -80, y: 200 }, fork: { x: 560, y: 200 } };
    for (const l of p.loci || []) st.loci.push(locus(l, st.anchors[l.at || 'off']));
    return st;
  },
  /* a sealed WRL world: params.nodes = [[role,name,cfg]], params.edges = [[kind,src,dst]] — the graph the
     forge reduced. Objects are stations laid out in columns by longest incoming path; edges are wires. A film
     epoch is applied with generic `state` / `note` actions the build derives from the Film's lines. */
  world(p = {}) {
    const st = base(); const nodes = (p.nodes || []).filter((n) => n[0] !== 'Ledger'), edges = p.edges || [];
    const names = nodes.map((n) => n[1]); const depth = Object.fromEntries(names.map((n) => [n, 0]));
    for (let k = 0; k < names.length; k++) for (const [, a, b] of edges) if (depth[b] !== undefined && depth[a] !== undefined) depth[b] = Math.max(depth[b], depth[a] + 1);
    /* one row per chapter (the id prefix before the first underscore); rows in params.rowOrder if given, else
       first appearance. Within a row, objects that share a depth stack vertically so replicated members never overlap. */
    const rowOf = (n) => (n.includes('_') ? n.split('_')[0] : '·'); const rows = []; const rowIdx = {};
    for (const r of p.rowOrder || []) if (rowIdx[r] === undefined && names.some((n) => rowOf(n) === r)) { rowIdx[r] = rows.length; rows.push(r); }
    for (const n of names) { const r = rowOf(n); if (rowIdx[r] === undefined) { rowIdx[r] = rows.length; rows.push(r); } }
    const PITCH = 180, X0 = 110, Y0 = 64, STACK = 74, ROWGAP = 104;
    const maxCol = Math.max(0, ...names.map((n) => depth[n]));
    const stackIdx = {}, stackSize = {};
    for (const n of names) { const k = rowOf(n) + '/' + depth[n]; stackIdx[n] = stackSize[k] = (stackSize[k] || 0); stackSize[k]++; }
    const rowHeight = rows.map((r) => ROWGAP + (Math.max(1, ...names.filter((n) => rowOf(n) === r).map((n) => stackSize[rowOf(n) + '/' + depth[n]])) - 1) * STACK);
    const rowY = []; let y = Y0; for (let i = 0; i < rows.length; i++) { rowY.push(y); y += rowHeight[i]; }
    st.W = Math.max(640, X0 + (maxCol + 1) * PITCH + 40); st.H = y + 44;
    const role = Object.fromEntries(nodes.map((n) => [n[1], n[0]])); const pos = {};
    for (const n of names) pos[n] = { x: X0 + depth[n] * PITCH, y: rowY[rowIdx[rowOf(n)]] + stackIdx[n] * STACK };
    for (const n of names) st.stations.push({ id: n, x: pos[n].x, y: pos[n].y, label: n, state: 'idle', note: '', role: role[n], box: true, sub: role[n].toLowerCase(), facts: null });
    if ((p.nodes || []).some((n) => n[0] === 'Ledger')) st.stations.push({ id: 'ledger', x: st.W - 120, y: 30, label: 'ledger · receipts', state: 'idle', note: '', role: 'Ledger', box: true, count: 0 });
    const bw = (n) => Math.max(80, n.length * 7 + 16);
    for (const [kind, a, b] of edges) if (pos[a] && pos[b]) {
      const sx = pos[a].x + bw(a) / 2, sy = pos[a].y, tx = pos[b].x - bw(b) / 2, ty = pos[b].y;
      let points, link = false;
      if (Math.abs(sy - ty) < 1) points = [[sx, sy], [tx, ty]];
      else if (tx - sx > 40) { const far = Math.abs(ty - sy) > 120; const xm = far ? sx + 14 : sx + (tx - sx) / 2; points = [[sx, sy], [xm, sy], [xm, ty], [tx, ty]]; if (far) link = true; }
      else { const xm = sx + 18; const xn = tx - 18; points = [[sx, sy], [xm, sy], [xm, ty], [xn, ty], [tx, ty]]; }
      st.wires.push({ id: `${a}->${b}`, kind, points, x1: sx, y1: sy, x2: tx, y2: ty, label: kind === 'SignalWire' ? 'sig' : 'socket', note: '', thin: true, link });
    }
    st.anchors = Object.fromEntries(names.map((n) => [n, pos[n]])); st.anchors.off = { x: -80, y: 200 };
    return st;
  },
  /* the circuit board: the whole world as a network. params.nodes / edges as for `world`; params.groups maps an
     id prefix to a band id; params.bands = [{id,label}] top to bottom. Columns are signal depth across the whole
     board (left → right); each band holds its own objects, stacked where a depth has several. Relays that fan out
     are the routers, doors the switches, pulsers the clock domains. Bands render as rings behind the wiring. */
  network(p = {}) {
    const st = base(); const nodes = (p.nodes || []).filter((n) => n[0] !== 'Ledger'), edges = p.edges || [];
    const names = nodes.map((n) => n[1]); const depth = Object.fromEntries(names.map((n) => [n, 0]));
    for (let k = 0; k < names.length; k++) for (const [, a, b] of edges) if (depth[b] !== undefined && depth[a] !== undefined) depth[b] = Math.max(depth[b], depth[a] + 1);
    const pfx = (n) => (n.includes('_') ? n.split('_')[0] : '·'); const groups = p.groups || {};
    const bands = (p.bands || []).filter((b) => names.some((n) => groups[pfx(n)] === b.id));
    const bandOf = (n) => groups[pfx(n)] || (bands[0] && bands[0].id);
    const PITCH = 150, STACK = 62, X0 = 150, Y0 = 40, PAD = 34;
    const maxCol = Math.max(0, ...names.map((n) => depth[n]));
    const stackIdx = {}, stackSize = {};
    const order = names.slice().sort((a, b) => ((p.rowOrder || []).indexOf(pfx(a)) - (p.rowOrder || []).indexOf(pfx(b))) || a.localeCompare(b));
    for (const n of order) { const k = bandOf(n) + '/' + depth[n]; stackIdx[n] = stackSize[k] = (stackSize[k] || 0); stackSize[k]++; }
    const bandTop = {}, bandH = {}; let y = Y0;
    for (const b of bands) { const h = PAD * 2 + Math.max(1, ...names.filter((n) => bandOf(n) === b.id).map((n) => stackSize[bandOf(n) + '/' + depth[n]])) * STACK; bandTop[b.id] = y; bandH[b.id] = h; y += h + 14; }
    st.W = Math.max(720, X0 + (maxCol + 1) * PITCH + 40); st.H = y + 44;
    const role = Object.fromEntries(nodes.map((n) => [n[1], n[0]])); const pos = {};
    for (const n of names) pos[n] = { x: X0 + depth[n] * PITCH, y: bandTop[bandOf(n)] + PAD + 18 + stackIdx[n] * STACK };
    for (const b of bands) st.rings.push({ id: 'band-' + b.id, label: b.label, x: 16, y: bandTop[b.id], w: st.W - 32, h: bandH[b.id], state: 'idle', note: '' });
    const bandLabel = Object.fromEntries(bands.map((b) => [b.id, b.label]));
    for (const n of names) st.stations.push({ id: n, x: pos[n].x, y: pos[n].y, label: n, state: 'idle', note: '', role: role[n], box: true, sub: role[n].toLowerCase(), compact: true, band: bandLabel[bandOf(n)] || '', facts: null });
    if ((p.nodes || []).some((n) => n[0] === 'Ledger')) st.stations.push({ id: 'ledger', x: st.W - 120, y: 18, label: 'ledger · receipts', state: 'idle', note: '', role: 'Ledger', box: true, count: 0 });
    const bw = (n) => Math.max(72, n.length * 6.6 + 14);
    for (const [kind, a, b] of edges) if (pos[a] && pos[b]) {
      const sx = pos[a].x + bw(a) / 2, sy = pos[a].y, tx = pos[b].x - bw(b) / 2, ty = pos[b].y; let points, link = false;
      if (Math.abs(sy - ty) < 1) points = [[sx, sy], [tx, ty]];
      else if (tx - sx > 30) { const far = bandOf(a) !== bandOf(b); const xm = far ? sx + 12 + (stackIdx[a] % 3) * 6 : sx + (tx - sx) / 2; points = [[sx, sy], [xm, sy], [xm, ty], [tx, ty]]; link = far; }
      else { const xm = sx + 14, xn = tx - 14; points = [[sx, sy], [xm, sy], [xm, ty], [xn, ty], [tx, ty]]; link = bandOf(a) !== bandOf(b); }
      st.wires.push({ id: `${a}->${b}`, kind, points, x1: sx, y1: sy, x2: tx, y2: ty, label: '', note: '', thin: true, link });
    }
    st.anchors = Object.fromEntries(names.map((n) => [n, pos[n]])); st.anchors.off = { x: -80, y: 200 };
    return st;
  },
  /* concentric boundaries: params.rings = [{id,label}] outermost first; a locus can sit in any ring */
  nest(p = {}) {
    const st = base(); const rings = p.rings || [{ id: 'r0', label: 'outer' }, { id: 'r1', label: 'inner' }];
    const n = rings.length, cx = 420, cy = 186, W0 = 700, H0 = 272, stepW = (W0 - 160) / n, stepH = (H0 - 90) / n;
    rings.forEach((r, i) => st.rings.push({ id: r.id, label: r.label, x: cx - (W0 - i * stepW) / 2, y: cy - (H0 - i * stepH) / 2, w: W0 - i * stepW, h: H0 - i * stepH, state: 'idle', note: r.note || '' }));
    st.anchors = Object.fromEntries(st.rings.map((r, i) => [r.id, { x: r.x + 44, y: r.y + r.h / 2 + (i % 2 ? 18 : -18) }]));
    st.anchors.center = { x: cx, y: cy }; st.anchors.off = { x: -80, y: cy };
    for (const l of p.loci || []) st.loci.push(locus(l, st.anchors[l.at || 'center']));
    return st;
  },
};
function base() { return { slots: [], loci: [], stations: [], meters: [], wires: [], rings: [], anchors: {}, notes: [], caption: '' }; }
function locus(l, at) { return { id: l.id, label: l.label ?? l.id, state: l.state || 'live', x: at.x, y: at.y, tag: l.tag || '', r: l.r || 16, tagAbove: !!l.tagAbove }; }

/* ── generic actions ────────────────────────────────────────────────────────────────────────────── */
const find = (st, id) => st.loci.find((l) => l.id === id) || st.slots.find((s) => s.id === id) || st.stations.find((s) => s.id === id) || st.meters.find((m) => m.id === id) || st.rings.find((r) => r.id === id);
const ACTIONS = {
  wirestate(st, a) { const w = st.wires.find((w) => w.id === a.wire); if (w) w.state = a.state; },
  place(st, a) { const l = find(st, a.locus), at = st.anchors[a.at]; if (l && at) { l.x = at.x + (a.dx || 0); l.y = at.y + (a.dy || 0); } },
  move(st, a) { ACTIONS.place(st, { locus: a.locus, at: a.to, dx: a.dx, dy: a.dy }); },
  state(st, a) { const t = find(st, a.target); if (t) { t.state = a.state; if (a.changed !== undefined) t.changed = !!a.changed; } },
  tag(st, a) { const t = find(st, a.target); if (t) t.tag = a.text; },
  label(st, a) { const t = find(st, a.target); if (t) t.label = a.text; },
  note(st, a) { const t = find(st, a.target); if (t) t.note = a.text; },
  /* the object's whole line in this epoch's Film, as [key, value] pairs. The picture does not draw
     these — they are what the readout says when you hover the object. */
  /* pairs are sent only in the epoch the line changed, and persist until it changes again — a scene
     that restated every field of every object every epoch cost the conclusion page 0.5 MB */
  facts(st, a) { const t = find(st, a.target); if (t) { if (a.pairs) t.facts = a.pairs; t.changed = !!a.changed; } },
  meter(st, a) { const m = find(st, a.target); if (m) m.value = a.value; },
  count(st, a) { const t = find(st, a.target); if (t) t.count = a.value; },
  spawn(st, a) { st.loci.push(locus(a, st.anchors[a.at || 'off'])); },
  remove(st, a) { st.loci = st.loci.filter((l) => l.id !== a.locus); },
  join(st, a) {
    const J = find(st, a.station || 'J'); const A = find(st, a.a), B = find(st, a.b);
    if (a.result === 'refused') { J.state = 'refused'; J.note = a.reason || 'refused'; if (A) { A.state = 'refused'; } }
    else { J.state = 'admitted'; J.note = a.note || 'admitted'; if (A && B) { A.state = 'composed'; B.state = 'composed'; A.tag = ''; B.tag = ''; } }
  },
  wirenote(st, a) { const w = st.wires.find((w) => w.id === (a.wire || 'w')); if (w) w.note = a.text; },
};

/* ── pure state ─────────────────────────────────────────────────────────────────────────────────── */
export function computeState(scene, upto) {
  const st = STENCILS[scene.stencil](scene.params || {});
  const n = Math.min(upto, scene.steps.length);
  for (let i = 0; i < n; i++) { for (const a of scene.steps[i].actions || []) (ACTIONS[a.op] || (() => {}))(st, a); st.caption = scene.steps[i].caption || ''; }
  if (n === 0) st.caption = scene.intro || '';
  st.step = n;
  st.epochLabel = n === 0 ? (scene.epoch0 || (scene.steps.length ? 'before step 1' : '')) : (scene.steps[n - 1].epochLabel || `step ${n} of ${scene.steps.length}`);
  st.noState = scene.noState || '';
  return st;
}

/* ── pure svg ───────────────────────────────────────────────────────────────────────────────────── */
/* Every object states its own identity and its own facts in the markup. The readout reads them back
   out of the DOM rather than off a copy of the state, so what a hover reports is what is on screen
   — including on a page that ships no scene data at all. */
const stationData = (s) => `data-id="${esc(s.id)}" data-role="${esc(s.role || '')}"${s.band ? ` data-band="${esc(s.band)}"` : ''}${s.state && s.state !== 'idle' ? ` data-state="${esc(s.state)}"` : ''}${s.note ? ` data-note="${esc(s.note)}"` : ''}${(s.facts || []).length ? ` data-facts="${esc(JSON.stringify(s.facts))}"` : ''}${s.changed ? ' data-changed="1"' : ''}`;
const wireEnds = (w) => { const m = String(w.id || '').split('->'); return m.length === 2 ? `data-from="${esc(m[0])}" data-to="${esc(m[1])}"${w.kind ? ` data-kind="${esc(w.kind)}"` : ''}` : ''; };
/* the <title> is the fallback for a reader with no JavaScript; the readout below is the real thing */
const titleOf = (s) => `${s.label}${s.role ? ' · ' + s.role : ''}` + ((s.facts || []).length ? ' — ' + s.facts.map(([k, v]) => `${k}=${v}`).join(' · ') : (s.note ? ' — ' + s.note : ''));
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
export function svg(st, { thumb = false, caption = true } = {}) {
  const W = st.W || 840, H = st.H || 380;
  const o = [];
  o.push(`<svg class="surface" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(st.caption)}"${thumb ? '' : ` data-epoch="${esc(st.epochLabel || '')}" data-step="${st.step ?? 0}"${st.noState ? ` data-nostate="${esc(st.noState)}"` : ''}`}>`);
  o.push(`<rect class="sf-floor" x="0" y="${H - 44}" width="${W}" height="44"/>`);
  o.push(`<text class="sf-floorlabel" x="12" y="${H - 14}">compute surface</text>`);
  for (const r of st.rings) o.push(`<g class="sf-ring ${r.state}"><rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="14"/><text x="${r.x + 12}" y="${r.y + 18}">${esc(r.label)}</text>${r.note ? `<text class="sf-note ${r.state}" x="${r.x + r.w - 12}" y="${r.y + r.h - 10}" text-anchor="end">${esc(r.note)}</text>` : ''}</g>`);
  if (st.wires.some((w) => w.points)) o.push(`<defs><marker id="sfar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="currentColor"/></marker></defs>`);
  for (const w of st.wires) {
    const cls = `sf-wire ${w.state || ''} ${w.thin ? 'thin' : ''} ${w.link ? 'link' : ''}`;
    if (w.points) {
      /* label sits on the longest segment; the arrowhead marks the target box's edge */
      const segs = w.points.slice(1).map((q, i) => [w.points[i], q]);
      const seg = segs.sort((u, v) => Math.hypot(v[1][0] - v[0][0], v[1][1] - v[0][1]) - Math.hypot(u[1][0] - u[0][0], u[1][1] - u[0][1]))[0];
      const lx = (seg[0][0] + seg[1][0]) / 2, ly = (seg[0][1] + seg[1][1]) / 2;
      o.push(`<polyline class="${cls}" ${wireEnds(w)} points="${w.points.map((q) => q.join(',')).join(' ')}" marker-end="url(#sfar)"/>`);
      if (w.label) o.push(`<text class="sf-label ${w.thin ? 'small' : ''}" x="${lx}" y="${ly - 6}" text-anchor="middle">${esc(w.label)}</text>`);
    } else {
      o.push(`<line class="${cls}" ${wireEnds(w)} x1="${w.x1}" y1="${w.y1}" x2="${w.x2}" y2="${w.y2}"/>`);
      if (w.label) o.push(`<text class="sf-label ${w.thin ? 'small' : ''}" x="${(w.x1 + w.x2) / 2}" y="${(w.y1 + w.y2) / 2 - 8}" text-anchor="middle">${esc(w.label)}</text>`);
    }
    if (w.note) o.push(`<text class="sf-note" x="${(w.x1 + w.x2) / 2}" y="${w.y1 + 26}" text-anchor="middle">${esc(w.note)}</text>`);
  }
  for (const s of st.slots) { const w = s.wide ? 150 : 60; o.push(`<g class="sf-slot ${s.state}"><rect x="${s.x - w / 2}" y="${s.y - 16}" width="${w}" height="32" rx="6"/><text x="${s.x}" y="${s.y + 5}" text-anchor="middle">${esc(s.label)}</text></g>`); }
  for (const m of st.meters) { const pct = Math.max(0, Math.min(1, m.value / m.max)); o.push(`<g class="sf-meter ${m.kind}"><text class="sf-label" x="${m.x}" y="${m.y - 6}">${esc(m.label)} · ${Math.round(pct * 100)}%</text><rect class="sf-track" x="${m.x}" y="${m.y}" width="${m.w}" height="10" rx="5"/><rect class="sf-fill" x="${m.x}" y="${m.y}" width="${(m.w * pct).toFixed(1)}" height="10" rx="5"/></g>`); }
  const sd = thumb ? () => '' : stationData;
  for (const s of st.stations) { const bw = s.compact ? Math.max(72, (s.label || '').length * 6.6 + 14) : Math.max(80, (s.label || '').length * 7 + 16); o.push(s.box ? `<g class="sf-station ${s.state} ${s.role || ''} ${s.compact ? 'compact' : ''}" ${sd(s)}><title>${esc(titleOf(s))}</title><rect x="${s.x - bw / 2}" y="${s.y - (s.compact ? 17 : 22)}" width="${bw}" height="${s.compact ? 34 : 44}" rx="6"/><text x="${s.x}" y="${s.y - (s.compact ? 1 : 2)}" text-anchor="middle">${esc(s.label)}</text><text class="sf-count" x="${s.x}" y="${s.y + (s.compact ? 11 : 15)}" text-anchor="middle">${s.sub ? esc(s.sub) : s.role === 'Ledger' ? (s.count ? s.count + ' receipt(s)' : 'no receipts') : (s.count ? s.count + ' pending' : 'empty')}</text></g>` : `<g class="sf-station ${s.state}" ${sd(s)}><title>${esc(titleOf(s))}</title><path d="M${s.x} ${s.y - 34} L${s.x + Math.max(44, s.label.length * 5 + 22)} ${s.y} L${s.x} ${s.y + 34} L${s.x - Math.max(44, s.label.length * 5 + 22)} ${s.y} Z"/><text x="${s.x}" y="${s.y + 5}" text-anchor="middle">${esc(s.label)}</text></g>`); if (s.note && !s.compact) o.push(`<text class="sf-note ${s.state} ${s.box ? 'small' : ''}" x="${s.x}" y="${s.y + (s.box ? 38 : 56)}" text-anchor="middle">${esc(s.note)}</text>`); }
  for (const l of st.loci) o.push(`<g class="sf-locus ${l.state}" data-id="${esc(l.id)}"${thumb ? '' : ` data-role="locus"${l.state ? ` data-state="${esc(l.state)}"` : ''}${l.tag ? ` data-note="${esc(l.tag)}"` : ''}`} transform="translate(${l.x.toFixed(1)} ${l.y.toFixed(1)})"><circle r="${l.r}"/>${l.label ? `<text class="sf-id" y="5" text-anchor="middle">${esc(l.label)}</text>` : ''}${l.tag ? (l.tagAbove ? `<text class="sf-tag" y="-${l.r + 8}" text-anchor="middle">${esc(l.tag)}</text>` : `<text class="sf-tag" x="${l.x < W / 2 ? -(l.r + 8) : l.r + 8}" y="4" text-anchor="${l.x < W / 2 ? 'end' : 'start'}">${esc(l.tag)}</text>`) : ''}</g>`);
  if (!thumb && caption && st.caption) o.push(`<text class="sf-caption" x="${W / 2}" y="30" text-anchor="middle">${esc(st.caption)}</text>`);
  o.push('</svg>');
  return o.join('');
}

/* ── browser: the readout ───────────────────────────────────────────────────────────────────────
   Hover an object and this says what it is and what the Film says its state is in the epoch on
   screen. It replaces the SVG <title> tooltip, which could not do the job it was given: a native
   tooltip needs a second of dwell, cannot be reached on a touch screen or by keyboard, never
   appears in a screenshot, and is destroyed by every re-render — which during play, on a 2.2 s
   epoch, is always. It also only ever said the object's name, which is printed inside the box.

   It reads the DOM, not a copy of the state, so a hover reports what is actually drawn; that also
   makes it work on the static boards, which ship a picture and no scene data. */
export function inspector(host, stage) {
  const card = document.createElement('div'); card.className = 'sf-insp'; card.hidden = true;
  host.appendChild(card);
  if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
  let pinned = null, cursor = -1;
  /* this module exports a const named CSS, which shadows window.CSS at module scope */
  const q = (v) => (typeof window !== 'undefined' && window.CSS && window.CSS.escape ? window.CSS.escape(v) : v);

  const svgEl = () => stage.querySelector('svg');
  const stations = () => [...stage.querySelectorAll('.sf-station[data-id], .sf-locus[data-id]')];
  const peers = (id, attr, other) => [...stage.querySelectorAll(`.sf-wire[${attr}="${q(id)}"]`)]
    .map((w) => [w.getAttribute(other), w.classList.contains('on'), w.getAttribute('data-kind') || '']);
  const KIND = { SignalWire: 'signal', SocketControl: 'socket' };

  function render(g) {
    const id = g.dataset.id, sv = svgEl();
    const epoch = (sv && sv.dataset.epoch) || '', noState = (sv && sv.dataset.nostate) || '';
    let facts = []; try { facts = JSON.parse(g.dataset.facts || '[]'); } catch { facts = []; }
    const changed = g.dataset.changed === '1';
    const ins = peers(id, 'data-to', 'data-from'), outs = peers(id, 'data-from', 'data-to');
    /* grouped by edge kind, because a signal reaching an object and a socket control reaching it are
       not the same event, and the board draws both with the same kind of line */
    const link = (p) => { const by = {}; for (const [n, on, k] of p) (by[k] ||= []).push(`<code class="${on ? 'on' : 'off'}">${esc(n)}</code>`);
      return Object.entries(by).map(([k, v]) => `${k ? `<em>${esc(KIND[k] || k)}</em> ` : ''}${v.join(' ')}`).join(' · '); };
    card.innerHTML =
      `<div class="sf-insp-h"><b>${esc(g.dataset.id)}</b>${g.dataset.role ? `<span class="sf-insp-role">${esc(g.dataset.role)}</span>` : ''}${g.dataset.band ? `<span class="sf-insp-band">${esc(g.dataset.band)}</span>` : ''}</div>`
      + (facts.length
        ? `<div class="sf-insp-ep${changed ? ' changed' : ''}">${esc(epoch || 'this epoch')}${changed ? ' · changed in this epoch' : ' · unchanged'}</div>`
           + `<dl>${facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`
        /* an illustration carries no Film line, but it does carry the step's own state and note */
        : (g.dataset.state || g.dataset.note)
        ? `${epoch ? `<div class="sf-insp-ep">${esc(epoch)}</div>` : ''}<dl>${g.dataset.state ? `<dt>state</dt><dd>${esc(g.dataset.state)}</dd>` : ''}${g.dataset.note ? `<dt>note</dt><dd>${esc(g.dataset.note)}</dd>` : ''}</dl>`
        : `<p class="sf-insp-none">${esc(noState || (!epoch ? 'No Film drives this picture: it has a shape and no state.' : (sv && sv.dataset.step === '0') ? `${epoch} — nothing has run yet.${host.querySelector('.sf-controls') ? ' Press Step or Play.' : ''}` : `${epoch} — this object reports nothing in this one.`))}</p>`)
      + (sv && sv.querySelector('.sf-wire[data-from]')
        ? `<div class="sf-insp-w">${ins.length ? `in ← ${link(ins)}` : '<i>nothing reaches it</i>'}<br>${outs.length ? `out → ${link(outs)}` : '<i>it reaches nothing</i>'}</div>`
        : '');
    return true;
  }
  function placeAt(cx, cy) {
    const hb = host.getBoundingClientRect(), cw = card.offsetWidth, ch = card.offsetHeight;
    let x = cx - hb.left + 16, y = cy - hb.top + 16;
    if (x + cw > hb.width - 4) x = cx - hb.left - cw - 16;
    if (y + ch > hb.height - 4) y = cy - hb.top - ch - 16;
    card.style.left = `${Math.max(4, Math.min(x, hb.width - cw - 4))}px`;
    card.style.top = `${Math.max(4, Math.min(y, hb.height - ch - 4))}px`;
  }
  const mark = (g) => { for (const o of stations()) o.classList.toggle('cursor', o === g); };
  function show(g, cx, cy) { if (!render(g)) return; card.hidden = false; placeAt(cx, cy); mark(g); }
  function hide() { card.hidden = true; card.classList.remove('pinned'); pinned = null; mark(null); }

  stage.addEventListener('pointermove', (ev) => {
    if (pinned) return;
    const g = ev.target.closest && ev.target.closest('.sf-station[data-id], .sf-locus[data-id]');
    if (g) show(g, ev.clientX, ev.clientY); else { card.hidden = true; mark(null); }
  });
  stage.addEventListener('pointerleave', () => { if (!pinned) { card.hidden = true; mark(null); } });
  /* a tap pins it open, because a touch screen has no hover; a second tap, or Esc, lets go */
  let down = null;
  stage.addEventListener('pointerdown', (ev) => { down = { x: ev.clientX, y: ev.clientY }; });
  stage.addEventListener('pointerup', (ev) => {
    if (!down || Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 5) { down = null; return; }
    down = null;
    const g = document.elementFromPoint(ev.clientX, ev.clientY);
    const st = g && g.closest && g.closest('.sf-station[data-id], .sf-locus[data-id]');
    if (!st) return hide();
    if (pinned === st.dataset.id) return hide();
    pinned = st.dataset.id; show(st, ev.clientX, ev.clientY); card.classList.add('pinned');
  });
  /* and a keyboard walks the objects in reading order, so the readout is not mouse-only */
  stage.tabIndex = 0;
  stage.addEventListener('keydown', (ev) => {
    const all = stations(); if (!all.length) return;
    const k = ev.key;
    if (k === 'Escape') { hide(); return; }
    let d = 0;
    if (k === 'ArrowRight' || k === 'ArrowDown') d = 1; else if (k === 'ArrowLeft' || k === 'ArrowUp') d = -1;
    else if (k === 'Home') cursor = -1, d = 1; else if (k === 'End') cursor = all.length, d = -1; else return;
    ev.preventDefault();
    cursor = (cursor + d + all.length) % all.length;
    const g = all[cursor], r = g.getBoundingClientRect();
    pinned = g.dataset.id; card.classList.add('pinned'); show(g, r.right, r.bottom);
  });
  stage.addEventListener('blur', () => { if (card.classList.contains('pinned')) hide(); });

  /* the picture is replaced wholesale on every step; re-read the object under the cursor */
  return { refresh() {
    const id = pinned || (stage.querySelector('.sf-station.cursor, .sf-locus.cursor') || {}).dataset?.id;
    if (!id) return;
    const g = stage.querySelector(`.sf-station[data-id="${q(id)}"], .sf-locus[data-id="${q(id)}"]`);
    if (g) { render(g); mark(g); card.hidden = false; } else hide();
  } };
}

/* ── browser: pan / zoom for any svg with a viewBox ────────────────────────────────────────────── */
export function panZoom(host, getSvg) {
  let view = null; const base = () => { const s = getSvg(); const [x, y, w, h] = s.getAttribute('viewBox').split(/\s+/).map(Number); return { x, y, w, h }; };
  const apply = () => { const s = getSvg(); if (!s) return; if (!view) view = base(); s.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`); };
  const pt = (ev) => { const s = getSvg(); const r = s.getBoundingClientRect(); return { px: view.x + (ev.clientX - r.left) / r.width * view.w, py: view.y + (ev.clientY - r.top) / r.height * view.h }; };
  host.addEventListener('wheel', (ev) => { if (!view) view = base(); ev.preventDefault(); const { px, py } = pt(ev); const f = ev.deltaY > 0 ? 1.15 : 1 / 1.15; view = { x: px - (px - view.x) * f, y: py - (py - view.y) * f, w: view.w * f, h: view.h * f }; apply(); }, { passive: false });
  let drag = null;
  host.addEventListener('pointerdown', (ev) => { if (!view) view = base(); drag = { x: ev.clientX, y: ev.clientY, v: { ...view } }; host.setPointerCapture(ev.pointerId); host.classList.add('grabbing'); });
  host.addEventListener('pointermove', (ev) => { if (!drag) return; const s = getSvg(); const r = s.getBoundingClientRect(); view = { ...view, x: drag.v.x - (ev.clientX - drag.x) / r.width * view.w, y: drag.v.y - (ev.clientY - drag.y) / r.height * view.h }; apply(); });
  const up = () => { drag = null; host.classList.remove('grabbing'); }; host.addEventListener('pointerup', up); host.addEventListener('pointercancel', up);
  host.addEventListener('dblclick', () => { view = null; apply(); });
  return { reapply: apply, reset: () => { view = null; apply(); }, zoom: (f) => { if (!view) view = base(); const cx = view.x + view.w / 2, cy = view.y + view.h / 2; view = { x: cx - view.w * f / 2, y: cy - view.h * f / 2, w: view.w * f, h: view.h * f }; apply(); } };
}

/* ── browser: mount with controls, tweening, takeaways ─────────────────────────────────────────── */
export function mount(root, scene) {
  const total = scene.steps.length; let i = 0, timer = null;
  root.innerHTML = `<div class="sf-stage"></div>
    <div class="sf-controls"><button class="sf-play">▶ Play</button><button class="sf-step">Step ▸</button><button class="sf-reset">↺ Reset</button><span class="sf-zoom"><button class="sf-zin" title="zoom in">＋</button><button class="sf-zout" title="zoom out">－</button><button class="sf-fit" title="fit (or double-click the picture)">⤢</button></span><span class="sf-hint">hover an object for its state · wheel zooms · drag pans · double-click fits</span><span class="sf-pos"></span></div>
    <p class="sf-cap"></p>
    <ol class="sf-take">${scene.steps.map((s, k) => s.takeaway ? `<li data-step="${k + 1}"><span class="sf-tk">${esc(s.takeaway)}</span></li>` : '').join('')}</ol>`;
  const stage = root.querySelector('.sf-stage'), cap = root.querySelector('.sf-cap'), pos = root.querySelector('.sf-pos');
  let prev = computeState(scene, 0);
  stage.innerHTML = svg(prev, { caption: false });
  const pz = panZoom(stage, () => stage.querySelector('svg'));
  const insp = inspector(root, stage);
  root.querySelector('.sf-zin').addEventListener('click', () => pz.zoom(1 / 1.3)); root.querySelector('.sf-zout').addEventListener('click', () => pz.zoom(1.3)); root.querySelector('.sf-fit').addEventListener('click', () => pz.reset());
  const paint = () => { cap.textContent = prev.caption; pos.textContent = `${i} / ${total}`; root.querySelectorAll('.sf-take li').forEach((li) => li.classList.toggle('got', +li.dataset.step <= i)); };
  paint();
  function show(k) {
    const next = computeState(scene, k);
    const old = new Map(prev.loci.map((l) => [l.id, l]));
    const html = svg(next, { caption: false }); const tmp = document.createElement('div'); tmp.innerHTML = html;
    const fresh = tmp.firstElementChild;
    /* tween: start every locus that existed before at its OLD position, then transition to the new one */
    for (const g of fresh.querySelectorAll('.sf-locus')) { const o = old.get(g.dataset.id); if (o) { g.setAttribute('transform', `translate(${o.x} ${o.y})`); } }
    stage.replaceChildren(fresh); pz.reapply(); insp.refresh();
    requestAnimationFrame(() => { for (const g of fresh.querySelectorAll('.sf-locus')) { const l = next.loci.find((x) => x.id === g.dataset.id); if (l) g.setAttribute('transform', `translate(${l.x} ${l.y})`); } });
    prev = next; i = k; paint();
  }
  const step = () => { if (i < total) show(i + 1); else stop(); };
  const stop = () => { if (timer) clearInterval(timer); timer = null; root.querySelector('.sf-play').textContent = '▶ Play'; };
  root.querySelector('.sf-step').addEventListener('click', () => { stop(); step(); });
  root.querySelector('.sf-reset').addEventListener('click', () => { stop(); show(0); });
  root.querySelector('.sf-play').addEventListener('click', () => { if (timer) return stop(); if (i >= total) show(0); root.querySelector('.sf-play').textContent = '❚❚ Pause'; step(); timer = setInterval(() => { if (i >= total) stop(); else step(); }, scene.interval || 1800); });
  return { show, step };
}

export const CSS = `
.surface{width:100%;height:auto;display:block;background:var(--ink2,#f2ede2);border:1px solid var(--line,#e7e0d2);border-radius:var(--r,8px);font-family:var(--ui,system-ui)}
.sf-floor{fill:var(--line2,#d8cfba)}.sf-floorlabel{font:11px var(--mono,monospace);fill:var(--fg3,#555);letter-spacing:.08em;text-transform:uppercase}
.sf-slot rect{fill:var(--ink3,#fffdf8);stroke:var(--line2,#d8cfba);stroke-width:1.5}.sf-slot text{font:12px var(--mono,monospace);fill:var(--fg2,#333)}
.sf-slot.busy rect{stroke:var(--warn,#96600b);fill:rgba(150,96,11,.10)}.sf-slot.held rect{stroke:var(--acc,#6d3bd4);fill:var(--acc-soft,rgba(109,59,212,.08))}.sf-slot.gone rect{stroke-dasharray:4 3;opacity:.45}
.sf-locus circle{fill:var(--acc,#6d3bd4);stroke:var(--ink3,#fff);stroke-width:2}.sf-locus{transition:transform .7s cubic-bezier(.4,0,.2,1)}
.sf-locus text.sf-id{font:11px var(--mono,monospace);fill:#fff}.sf-locus text.sf-tag{font:11px var(--mono,monospace);fill:var(--fg2,#333)}
.sf-locus.dormant circle{fill:var(--ink3,#fff);stroke:var(--acc,#6d3bd4);stroke-dasharray:3 2}.sf-locus.dormant text.sf-id{fill:var(--acc,#6d3bd4)}
.sf-locus.refused circle{fill:var(--rose,#c02a5f)}.sf-locus.composed circle{fill:var(--data,#0a6e62)}.sf-locus.undeclared circle{fill:var(--fg3,#777)}
.sf-locus.record circle{fill:var(--ink3,#fff);stroke:var(--fg,#1c1a17);stroke-width:1.5}.sf-locus.record text.sf-id{fill:var(--fg,#1c1a17)}
.sf-locus.tampered circle{fill:var(--ink3,#fff);stroke:var(--rose,#c02a5f);stroke-width:2;stroke-dasharray:3 2}.sf-locus.tampered text.sf-id{fill:var(--rose,#c02a5f)}
.sf-station path,.sf-station rect{fill:var(--ink3,#fff);stroke:var(--fg2,#333);stroke-width:1.5}.sf-station text{font:12px var(--mono,monospace);fill:var(--fg,#1c1a17)}
.sf-station.admitted path,.sf-station.admitted rect{stroke:var(--data,#0a6e62);fill:var(--data-soft,rgba(10,110,98,.09))}.sf-station.refused path,.sf-station.refused rect{stroke:var(--rose,#c02a5f);fill:rgba(192,42,95,.08)}
.sf-station.indeterminate path,.sf-station.indeterminate rect{stroke:var(--warn,#96600b);fill:rgba(150,96,11,.10);stroke-dasharray:5 3}.sf-note.indeterminate{fill:var(--warn,#96600b)}
.sf-ring rect{fill:none;stroke:var(--line2,#d8cfba);stroke-width:1.5}.sf-ring text{font:11px var(--mono,monospace);fill:var(--fg3,#666);letter-spacing:.06em;text-transform:uppercase}.sf-ring.held rect{stroke:var(--acc,#6d3bd4);fill:var(--acc-soft,rgba(109,59,212,.05))}.sf-ring.held text{fill:var(--acc,#6d3bd4)}.sf-ring.refused rect{stroke:var(--rose,#c02a5f)}.sf-ring.refused text{fill:var(--rose,#c02a5f)}.sf-ring.admitted rect{stroke:var(--data,#0a6e62)}.sf-ring.admitted text{fill:var(--data,#0a6e62)}
.sf-station .sf-count{font:10px var(--mono,monospace);fill:var(--fg3,#555)}.sf-station.compact text{font-size:10.5px}.sf-station.compact .sf-count{font-size:8.5px}.sf-station.compact.admitted rect{fill:var(--data-soft,rgba(10,110,98,.18))}.sf-station.compact.refused rect{fill:rgba(192,42,95,.16)}.sf-station.Pulser rect,.sf-station.Relay rect,.sf-station.Door rect,.sf-station.Spinner rect,.sf-station.Orb rect{stroke-width:1.2}.sf-station.Pulser rect{stroke:var(--acc,#6d3bd4)}.sf-station.Door rect{stroke:var(--rose,#c02a5f)}.sf-station.Orb rect{stroke:var(--data,#0a6e62)}
.sf-note{font:12px var(--mono,monospace);fill:var(--fg2,#333)}.sf-note.refused{fill:var(--rose,#c02a5f)}.sf-note.admitted{fill:var(--data,#0a6e62)}
.sf-wire{stroke:var(--fg3,#555);stroke-width:2;stroke-dasharray:6 4;fill:none;color:var(--fg3,#555)}.sf-wire.on{color:var(--acc,#6d3bd4)}.sf-wire.thin{stroke-width:1.4;stroke-dasharray:4 3}.sf-wire.link{stroke-width:1;opacity:.55}.sf-wire.link.on{stroke-width:1.6;opacity:.8}.sf-label.small{font-size:10px}.sf-note.small{font-size:10.5px}.sf-stage{cursor:grab;touch-action:none}.sf-stage.grabbing{cursor:grabbing}.sf-zoom{display:inline-flex;gap:.2rem;margin-left:.4rem}.sf-zoom button{padding:.2rem .5rem}.sf-hint{font:11px var(--ui,system-ui);color:var(--fg3,#777);margin-left:.4rem}.sf-wire.on{stroke:var(--acc,#6d3bd4);stroke-width:3;stroke-dasharray:none}.sf-label{font:12px var(--ui,system-ui);fill:var(--fg2,#333)}
.sf-meter .sf-track{fill:var(--ink3,#fff);stroke:var(--line2,#d8cfba)}.sf-meter.util .sf-fill{fill:var(--warn,#96600b);transition:width .7s}.sf-meter.prog .sf-fill{fill:var(--data,#0a6e62);transition:width .7s}
.sf-caption{font:15px var(--display,Georgia,serif);fill:var(--fg,#1c1a17)}
.sf-controls{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;margin:.6rem 0 .3rem;font:13px var(--ui,system-ui)}.sf-controls button{font:600 13px var(--ui,system-ui);padding:.3rem .7rem;border:1px solid var(--fg,#1c1a17);background:var(--ink3,#fff);border-radius:6px;cursor:pointer}.sf-pos{color:var(--fg3,#555);margin-left:auto;font-family:var(--mono,monospace)}
.sf-cap{font:15px/1.5 var(--display,Georgia,serif);min-height:1.5em;margin:.2rem 0 .6rem}
.sf,.sf-static{position:relative}
.sf-insp{position:absolute;z-index:5;pointer-events:none;max-width:min(26rem,92%);background:var(--ink3,#fffdf8);border:1px solid var(--fg,#1c1a17);border-radius:var(--r,8px);box-shadow:0 6px 22px rgba(0,0,0,.16);padding:.5rem .65rem;font:12.5px/1.45 var(--ui,system-ui)}
.sf-insp.pinned{pointer-events:auto;border-width:2px}
.sf-insp-h{display:flex;gap:.4rem;align-items:baseline;flex-wrap:wrap}.sf-insp-h b{font:600 13.5px var(--mono,monospace)}
.sf-insp-role{font:10.5px var(--mono,monospace);text-transform:uppercase;letter-spacing:.06em;color:var(--acc,#6d3bd4)}
.sf-insp-band{font:10.5px var(--ui,system-ui);color:var(--fg3,#666)}
.sf-insp-ep{margin:.25rem 0 .35rem;font:11.5px var(--ui,system-ui);color:var(--fg3,#666)}.sf-insp-ep.changed{color:var(--data,#0a6e62);font-weight:600}
.sf-insp dl{display:grid;grid-template-columns:auto 1fr;gap:.05rem .5rem;margin:0}
.sf-insp dt{font:10.5px var(--mono,monospace);color:var(--fg3,#666)}.sf-insp dd{margin:0;font:11.5px var(--mono,monospace);color:var(--fg,#1c1a17);word-break:break-all}
.sf-insp-none{margin:.25rem 0;color:var(--fg2,#444)}
.sf-insp-w{margin-top:.4rem;padding-top:.35rem;border-top:1px solid var(--line,#e7e0d2);font:11px var(--ui,system-ui);color:var(--fg3,#666)}
.sf-insp-w em{font-style:normal;font-size:9.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--fg3,#888)}.sf-insp-w code{font-size:10.5px;background:var(--ink2,#f2ede2);padding:0 .2rem;border-radius:3px}.sf-insp-w code.on{background:var(--acc-soft,rgba(109,59,212,.14));color:var(--acc,#6d3bd4)}
.sf-station[data-id]{cursor:crosshair}.sf-station.cursor rect,.sf-station.cursor path{stroke:var(--acc,#6d3bd4);stroke-width:2.5}.sf-locus[data-id]{cursor:crosshair}.sf-locus.cursor circle{stroke:var(--acc,#6d3bd4);stroke-width:3}
.sf-stage:focus-visible,.sf-static:focus-visible{outline:2px solid var(--acc,#6d3bd4);outline-offset:2px}
.sf-take{margin:0;padding-left:1.4rem;font:14px/1.5 var(--ui,system-ui)}.sf-take li{color:var(--fg3,#777);transition:color .4s}.sf-take li.got{color:var(--fg,#1c1a17)}.sf-take li.got::marker{color:var(--data,#0a6e62);content:"✓ "}
`;
