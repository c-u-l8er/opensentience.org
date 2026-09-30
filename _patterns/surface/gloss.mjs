/* ── the in-prose readout: a definition without leaving the sentence ─────────────────────────────────
   Every glossed word and every cited path is already a real link into /patterns/reference. This turns
   that link into a card you can read in place — and if this file never loads, the link still goes where
   it says it goes. Nothing here is required to read the book.

   Hover previews after a beat, so brushing past a word does not flash a card at you. Click pins, which
   is also what a tap does, which is also what Enter on a focused link does — the same three gestures the
   board's own readout uses, for the same reason: a tooltip that only answers a mouse answers nobody on a
   phone and nobody on a keyboard.                                                                      */
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function card(g, cards) {
  const [kind, key] = g.split(':');
  const d = (cards[kind] || {})[key];
  if (!d) return null;
  const o = [];
  o.push(`<p class="gl-h">${esc(d.h)}${d.sub ? ` <span class="gl-sub">${esc(d.sub)}</span>` : ''}</p>`);
  if (d.is) o.push(`<p class="gl-is">${esc(d.is)}</p>`);
  if (d.then) o.push(`<p class="gl-then">${esc(d.then)}</p>`);
  if (d.note) o.push(`<p class="gl-note">${esc(d.note)}</p>`);
  if (d.staged) o.push(`<p class="gl-staged">Staged on this site, byte-identical: <a href="${esc(d.staged)}">read it here</a></p>`);
  if (kind === 'f') {
    const bits = [];
    if (d.repo) bits.push(esc(d.repo));
    if (d.sha) bits.push(`sha <code>${esc(d.sha)}</code>`);
    if (d.lines && d.lines.length) bits.push(`cited at line ${d.lines.join(', ')}`);
    if (bits.length) o.push(`<p class="gl-meta">${bits.join(' · ')}</p>`);
    if (d.url) o.push(`<p class="gl-go"><a href="${esc(d.url)}" rel="noopener">Open in ${esc(d.repo)}</a></p>`);
  }
  if (d.src) o.push(`<p class="gl-src">Defined at ${esc(d.src)}${d.srcUrl ? ` \u00b7 <a href="${esc(d.srcUrl)}" rel="noopener">published page</a>` : ''}</p>`);
  return o.join('');
}

export function gloss(root, cards, { base = '' } = {}) {
  const links = [...root.querySelectorAll('a.gl[data-g]')];
  if (!links.length) return;
  const box = document.createElement('div');
  box.className = 'gl-card'; box.hidden = true; box.id = 'gl-card';
  box.setAttribute('role', 'tooltip');
  document.body.appendChild(box);
  let pinned = null, over = null, timer = 0;

  /* How far down the viewport is actually free. This site carries a FIXED nav 87 px tall, and a card
     placed at the top of the page lands underneath it: on screen by every geometric measure, invisible
     to a reader. That is this site's own A11Y1 failure — the one its skip link shipped with — and
     `getBoundingClientRect` cannot see it. Measured from whatever is fixed at the top, not hard-coded,
     so it stays right if the bar's height changes. */
  const topInset = () => {
    let inset = 0;
    for (const el of document.body.children) {
      if (el === box || getComputedStyle(el).position !== 'fixed') continue;
      const r = el.getBoundingClientRect();
      if (r.top <= 1 && r.height && r.width > innerWidth * 0.5) inset = Math.max(inset, r.bottom);
    }
    return inset;
  };
  const place = (a) => {
    const r = a.getBoundingClientRect();
    box.hidden = false; box.style.left = '0px'; box.style.top = '0px';
    const w = box.offsetWidth, h = box.offsetHeight, pad = 8, top = topInset() + pad;
    let x = r.left + r.width / 2 - w / 2;
    x = Math.max(pad, Math.min(x, document.documentElement.clientWidth - w - pad));
    /* above when there is room above it AND below whatever is pinned to the top; otherwise below */
    let y = r.top - h - 10;
    if (y < top) y = r.bottom + 10;
    /* and if going below runs off the bottom, go back up — but never above the inset */
    if (y + h > innerHeight - pad) y = Math.max(top, Math.min(y, innerHeight - h - pad));
    box.style.left = `${Math.round(x + window.scrollX)}px`;
    box.style.top = `${Math.round(y + window.scrollY)}px`;
  };
  const show = (a) => {
    const html = card(a.dataset.g, cards);
    if (!html) return;
    box.innerHTML = html + (pinned === a ? '<button class="gl-x" aria-label="Close">×</button>' : '');
    place(a);
    a.setAttribute('aria-describedby', 'gl-card');
    const x = box.querySelector('.gl-x');
    if (x) x.onclick = () => hide(true);
  };
  const hide = (force) => {
    if (pinned && !force) return;
    box.hidden = true; box.innerHTML = '';
    for (const a of links) a.removeAttribute('aria-describedby');
    pinned = null; over = null;
  };

  for (const a of links) {
    a.addEventListener('mouseenter', () => { over = a; clearTimeout(timer); timer = setTimeout(() => { if (over === a && !pinned) show(a); }, 160); });
    a.addEventListener('mouseleave', () => { over = null; clearTimeout(timer); timer = setTimeout(() => { if (!over && !pinned) hide(); }, 180); });
    a.addEventListener('focus', () => { if (!pinned) show(a); });
    a.addEventListener('blur', () => { if (!pinned) hide(); });
    a.addEventListener('click', (e) => {
      /* a modified click is the reader asking for the reference page itself; let it through */
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      e.preventDefault();
      if (pinned === a) { hide(true); return; }
      pinned = null; pinned = a; show(a);
    });
  }
  box.addEventListener('mouseenter', () => { over = box; });
  box.addEventListener('mouseleave', () => { over = null; if (!pinned) hide(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(true); });
  document.addEventListener('click', (e) => { if (pinned && !box.contains(e.target) && !e.target.closest('a.gl')) hide(true); });
  window.addEventListener('resize', () => hide(true));
}

export const GLOSS_CSS = `
a.gl{color:inherit;text-decoration:none;border-bottom:1px dashed var(--acc,#6d3bd4);cursor:help}
a.gl:hover,a.gl:focus{border-bottom-style:solid;background:var(--acc-soft,rgba(109,59,212,.09))}
a.gl:focus-visible{outline:2px solid var(--acc,#6d3bd4);outline-offset:2px}
a.glf{border-bottom-color:var(--data,#0a6e62)}
a.glf:hover,a.glf:focus{background:var(--data-soft,rgba(10,110,98,.09))}
a.gl code{background:none;padding:0}
.gl-card{position:absolute;z-index:40;max-width:min(30rem,92vw);background:var(--ink3,#fffdf8);border:1px solid var(--fg,#1c1a17);border-radius:var(--r,8px);box-shadow:0 8px 28px rgba(0,0,0,.18);padding:.6rem .75rem;font:13px/1.5 var(--ui,system-ui)}
.gl-card p{margin:0 0 .35rem}
.gl-card p:last-child{margin-bottom:0}
.gl-h{font-weight:650;font-size:13.5px}
.gl-sub{font-weight:400;color:var(--fg2,#555)}
.gl-is{color:var(--fg,#1c1a17)}
.gl-then{color:var(--fg2,#555)}
.gl-note,.gl-meta,.gl-src{font-size:11.5px;color:var(--fg3,#777)}
.gl-note{color:var(--warn,#9a5b00)}
.gl-staged{font-size:11.5px}
.gl-meta code{font-size:11px}
.gl-go a,.gl-staged a{color:var(--acc,#6d3bd4)}
.gl-x{position:absolute;top:.25rem;right:.35rem;border:0;background:none;font-size:15px;line-height:1;cursor:pointer;color:var(--fg3,#777);padding:.1rem .25rem}
.gl-x:hover{color:var(--fg,#1c1a17)}
@media (prefers-reduced-motion:no-preference){.gl-card{animation:gl-in .12s ease-out}@keyframes gl-in{from{opacity:0;transform:translateY(3px)}}}
`;
