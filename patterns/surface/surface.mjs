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
    st.wires.push({ id: 'w', x1: 190, y1: 200, x2: 630, y2: 200, label: p.wire || 'the wire' });
    st.anchors = { P: { x: 120, y: 200 }, mid: { x: 410, y: 200 }, V1: { x: 700, y: 120 }, V2: { x: 700, y: 280 }, off: { x: -80, y: 200 }, fork: { x: 560, y: 200 } };
    for (const l of p.loci || []) st.loci.push(locus(l, st.anchors[l.at || 'off']));
    return st;
  },
};
function base() { return { slots: [], loci: [], stations: [], meters: [], wires: [], anchors: {}, notes: [], caption: '' }; }
function locus(l, at) { return { id: l.id, label: l.label ?? l.id, state: l.state || 'live', x: at.x, y: at.y, tag: l.tag || '', r: l.r || 16, tagAbove: !!l.tagAbove }; }

/* ── generic actions ────────────────────────────────────────────────────────────────────────────── */
const find = (st, id) => st.loci.find((l) => l.id === id) || st.slots.find((s) => s.id === id) || st.stations.find((s) => s.id === id) || st.meters.find((m) => m.id === id);
const ACTIONS = {
  place(st, a) { const l = find(st, a.locus), at = st.anchors[a.at]; if (l && at) { l.x = at.x + (a.dx || 0); l.y = at.y + (a.dy || 0); } },
  move(st, a) { ACTIONS.place(st, { locus: a.locus, at: a.to, dx: a.dx, dy: a.dy }); },
  state(st, a) { const t = find(st, a.target); if (t) t.state = a.state; },
  tag(st, a) { const t = find(st, a.target); if (t) t.tag = a.text; },
  label(st, a) { const t = find(st, a.target); if (t) t.label = a.text; },
  note(st, a) { const t = find(st, a.target); if (t) t.note = a.text; },
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
  return st;
}

/* ── pure svg ───────────────────────────────────────────────────────────────────────────────────── */
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
export function svg(st, { thumb = false, caption = true } = {}) {
  const o = [];
  o.push(`<svg class="surface" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(st.caption)}">`);
  o.push(`<rect class="sf-floor" x="0" y="336" width="${W}" height="44"/>`);
  o.push(`<text class="sf-floorlabel" x="12" y="366">compute surface</text>`);
  for (const w of st.wires) o.push(`<line class="sf-wire" x1="${w.x1}" y1="${w.y1}" x2="${w.x2}" y2="${w.y2}"/><text class="sf-label" x="${(w.x1 + w.x2) / 2}" y="${w.y1 - 14}" text-anchor="middle">${esc(w.label)}</text>${w.note ? `<text class="sf-note" x="${(w.x1 + w.x2) / 2}" y="${w.y1 + 26}" text-anchor="middle">${esc(w.note)}</text>` : ''}`);
  for (const s of st.slots) { const w = s.wide ? 150 : 60; o.push(`<g class="sf-slot ${s.state}"><rect x="${s.x - w / 2}" y="${s.y - 16}" width="${w}" height="32" rx="6"/><text x="${s.x}" y="${s.y + 5}" text-anchor="middle">${esc(s.label)}</text></g>`); }
  for (const m of st.meters) { const pct = Math.max(0, Math.min(1, m.value / m.max)); o.push(`<g class="sf-meter ${m.kind}"><text class="sf-label" x="${m.x}" y="${m.y - 6}">${esc(m.label)} · ${Math.round(pct * 100)}%</text><rect class="sf-track" x="${m.x}" y="${m.y}" width="${m.w}" height="10" rx="5"/><rect class="sf-fill" x="${m.x}" y="${m.y}" width="${(m.w * pct).toFixed(1)}" height="10" rx="5"/></g>`); }
  for (const s of st.stations) { o.push(s.box ? `<g class="sf-station ${s.state}"><rect x="${s.x - 40}" y="${s.y - 22}" width="80" height="44" rx="6"/><text x="${s.x}" y="${s.y - 2}" text-anchor="middle">${esc(s.label)}</text><text class="sf-count" x="${s.x}" y="${s.y + 15}" text-anchor="middle">${s.count ? s.count + ' pending' : 'empty'}</text></g>` : `<g class="sf-station ${s.state}"><path d="M${s.x} ${s.y - 34} L${s.x + Math.max(44, s.label.length * 5 + 22)} ${s.y} L${s.x} ${s.y + 34} L${s.x - Math.max(44, s.label.length * 5 + 22)} ${s.y} Z"/><text x="${s.x}" y="${s.y + 5}" text-anchor="middle">${esc(s.label)}</text></g>`); if (s.note) o.push(`<text class="sf-note ${s.state}" x="${s.x}" y="${s.y + (s.box ? 40 : 56)}" text-anchor="middle">${esc(s.note)}</text>`); }
  for (const l of st.loci) o.push(`<g class="sf-locus ${l.state}" data-id="${esc(l.id)}" transform="translate(${l.x.toFixed(1)} ${l.y.toFixed(1)})"><circle r="${l.r}"/>${l.label ? `<text class="sf-id" y="5" text-anchor="middle">${esc(l.label)}</text>` : ''}${l.tag ? (l.tagAbove ? `<text class="sf-tag" y="-${l.r + 8}" text-anchor="middle">${esc(l.tag)}</text>` : `<text class="sf-tag" x="${l.x < W / 2 ? -(l.r + 8) : l.r + 8}" y="4" text-anchor="${l.x < W / 2 ? 'end' : 'start'}">${esc(l.tag)}</text>`) : ''}</g>`);
  if (!thumb && caption && st.caption) o.push(`<text class="sf-caption" x="${W / 2}" y="30" text-anchor="middle">${esc(st.caption)}</text>`);
  o.push('</svg>');
  return o.join('');
}

/* ── browser: mount with controls, tweening, takeaways ─────────────────────────────────────────── */
export function mount(root, scene) {
  const total = scene.steps.length; let i = 0, timer = null;
  root.innerHTML = `<div class="sf-stage"></div>
    <div class="sf-controls"><button class="sf-play">▶ Play</button><button class="sf-step">Step ▸</button><button class="sf-reset">↺ Reset</button><span class="sf-pos"></span></div>
    <p class="sf-cap"></p>
    <ol class="sf-take">${scene.steps.map((s, k) => s.takeaway ? `<li data-step="${k + 1}"><span class="sf-tk">${esc(s.takeaway)}</span></li>` : '').join('')}</ol>`;
  const stage = root.querySelector('.sf-stage'), cap = root.querySelector('.sf-cap'), pos = root.querySelector('.sf-pos');
  let prev = computeState(scene, 0);
  stage.innerHTML = svg(prev, { caption: false });
  const paint = () => { cap.textContent = prev.caption; pos.textContent = `${i} / ${total}`; root.querySelectorAll('.sf-take li').forEach((li) => li.classList.toggle('got', +li.dataset.step <= i)); };
  paint();
  function show(k) {
    const next = computeState(scene, k);
    const old = new Map(prev.loci.map((l) => [l.id, l]));
    const html = svg(next, { caption: false }); const tmp = document.createElement('div'); tmp.innerHTML = html;
    const fresh = tmp.firstElementChild;
    /* tween: start every locus that existed before at its OLD position, then transition to the new one */
    for (const g of fresh.querySelectorAll('.sf-locus')) { const o = old.get(g.dataset.id); if (o) { g.setAttribute('transform', `translate(${o.x} ${o.y})`); } }
    stage.replaceChildren(fresh);
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
.sf-station .sf-count{font:10px var(--mono,monospace);fill:var(--fg3,#555)}
.sf-note{font:12px var(--mono,monospace);fill:var(--fg2,#333)}.sf-note.refused{fill:var(--rose,#c02a5f)}.sf-note.admitted{fill:var(--data,#0a6e62)}
.sf-wire{stroke:var(--fg3,#555);stroke-width:2;stroke-dasharray:6 4}.sf-label{font:12px var(--ui,system-ui);fill:var(--fg2,#333)}
.sf-meter .sf-track{fill:var(--ink3,#fff);stroke:var(--line2,#d8cfba)}.sf-meter.util .sf-fill{fill:var(--warn,#96600b);transition:width .7s}.sf-meter.prog .sf-fill{fill:var(--data,#0a6e62);transition:width .7s}
.sf-caption{font:15px var(--display,Georgia,serif);fill:var(--fg,#1c1a17)}
.sf-controls{display:flex;gap:.5rem;align-items:center;margin:.6rem 0 .3rem;font:13px var(--ui,system-ui)}.sf-controls button{font:600 13px var(--ui,system-ui);padding:.3rem .7rem;border:1px solid var(--fg,#1c1a17);background:var(--ink3,#fff);border-radius:6px;cursor:pointer}.sf-pos{color:var(--fg3,#555);margin-left:auto;font-family:var(--mono,monospace)}
.sf-cap{font:15px/1.5 var(--display,Georgia,serif);min-height:1.5em;margin:.2rem 0 .6rem}
.sf-take{margin:0;padding-left:1.4rem;font:14px/1.5 var(--ui,system-ui)}.sf-take li{color:var(--fg3,#777);transition:color .4s}.sf-take li.got{color:var(--fg,#1c1a17)}.sf-take li.got::marker{color:var(--data,#0a6e62);content:"✓ "}
`;
