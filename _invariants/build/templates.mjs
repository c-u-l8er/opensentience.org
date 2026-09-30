/**
 * Zero-dependency template-literal components for the Periodic Table of Agent
 * Invariants. Same shape as _rebuild/build/templates.mjs next door.
 *
 * NOTHING in here computes a count. Every number arrives already derived from
 * build.mjs, which derives it from cells.json + CLAIM_LEDGER.json + mosaic/.
 * A template that can compute is a template that can disagree with the gate.
 */

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const escapeHtml = esc;

/* ─────────────────────────── masthead ─────────────────────────── */

export function masthead({ version, subtitle }) {
  return `
        <header class="masthead">
            <div class="masthead-top">
                <span class="vol">Vol. I — No. 1 · v${esc(version)}</span>
                <span>OpenSentience Research</span>
                <span>MMXXVI</span>
            </div>
            <h1 class="title">
                The Periodic Table of <em>Agent Invariants</em>
            </h1>
            <p class="subtitle">${esc(subtitle)}</p>
            <div class="credits">
                <span>Compiled by Ampersand Box Design</span>
                <a href="https://opensentience.org">opensentience.org</a>
                <a href="https://graphonomous.com">graphonomous.com</a>
            </div>
        </header>`;
}

/* ─────────────────────── the reframing note ─────────────────────── */

export function reframeNote({ version, body }) {
  return `
        <div class="v05-note">
            <span class="v05-tag">v${esc(version)} ·&nbsp;What changed</span>
            <span class="v05-body">${body}</span>
        </div>`;
}

/* ───────────────────────── census strip ───────────────────────── */

export function census(rows) {
  return `
        <div class="census">
            ${rows
              .map(
                (r) => `<div class="census-item${r.emphasis ? ' emph' : ''}">
                <span class="census-n">${esc(r.value)}</span>
                <span class="census-l">${esc(r.label)}</span>
            </div>`
              )
              .join('\n            ')}
        </div>`;
}

/* ─────────────────────────── legends ─────────────────────────── */

export function registerLegend(registers) {
  return `
        <div class="reg-legend">
            <h3>The axis</h3>
            <p class="reg-legend-lede">Cells are grouped by what the tree can say about them, not by which spec folder owns them. The rule for each band is mechanical and re&#8209;derived on every build.</p>
            <div class="reg-legend-grid">
            ${registers
              .map(
                (r) => `<div class="reg-legend-item reg-${esc(r.id)}">
                <span class="reg-legend-roman">${esc(r.roman)}</span>
                <span class="reg-legend-name">${esc(r.name)}</span>
                <span class="reg-legend-n">${esc(r.count)} cells</span>
                <span class="reg-legend-claim">${esc(r.claim)}</span>
                <code class="reg-legend-rule">${esc(r.rule)}</code>
            </div>`
              )
              .join('\n            ')}
            </div>
        </div>`;
}

/* axes.json carries a `_comment` INSIDE `tiers` and inside `statuses`, saying
   why the entries beside it are worded as they are. `Object.entries()` hands
   those to a renderer like any other entry, and the evidence-anchor strip
   published one as a legend row reading `undefined — undefined`. The status
   strip did not, because its caller filtered the key and the tier strip's
   caller did not — two call sites deciding the same thing separately is how
   they came to disagree. Decided here instead, once, for both. */
const authored = (o) => Object.entries(o).filter(([k]) => !k.startsWith('_'));

/* Swatch and term on the first line, gloss on the second. The gloss used to
   trail the term inline after an em dash, which is why no two items were the
   same height or started at the same place. */
const legendItem = (swatch, term, gloss) => `<span class="legend-item">
                <span class="legend-swatch ${esc(swatch)}"></span>
                <b>${esc(term)}</b>
                <span class="legend-gloss">${esc(gloss)}</span>
            </span>`;

export function tierLegend(tiers) {
  return `
        <div class="legend-strip tier-strip">
            <h3>Evidence anchor</h3>
            ${authored(tiers)
              .map(([id, t]) => legendItem(`tier-${id}`, t.name, t.gloss))
              .join('\n            ')}
        </div>`;
}

export function statusLegend(statuses) {
  return `
        <div class="legend-strip">
            <h3>Shading</h3>
            ${authored(statuses)
              .map(([id, gloss]) => legendItem(`swatch-${id}`, id, gloss))
              .join('\n            ')}
        </div>`;
}

/* ─────────────────────────── filters ─────────────────────────── */

export function filterBar({ registers, kinds, statuses }) {
  const chip = (f, v, label, cls = '') =>
    `<button class="chip${cls}" data-facet="${esc(f)}" data-filter="${esc(v)}">${esc(label)}</button>`;
  return `
        <div class="filter-bar">
            <h3>Filter</h3>
            <button class="chip active" data-facet="all" data-filter="all">All</button>
            <span class="filter-sep">register</span>
            ${registers.map((r) => chip('register', r.id, r.name, ` reg-chip reg-chip-${r.id}`)).join('\n            ')}
            <span class="filter-sep">kind</span>
            ${kinds.map((k) => chip('kind', k, k)).join('\n            ')}
            <span class="filter-sep">shading</span>
            ${statuses.map((s) => chip('status', s, s)).join('\n            ')}
        </div>`;
}

/* ──────────────────────────── cells ──────────────────────────── */

function cellBadges(c) {
  const b = [];
  if (c.derived.refuted) b.push(`<span class="badge badge-ref" title="bound claims at REFUTED">${c.derived.refuted}✗</span>`);
  if (c.derived.settled) b.push(`<span class="badge badge-set" title="bound claims at a settled status">${c.derived.settled}✓</span>`);
  if (c.derived.openClaims) b.push(`<span class="badge badge-open" title="bound claims still OPEN">${c.derived.openClaims}?</span>`);
  return b.length ? `<span class="cell-badges">${b.join('')}</span>` : '';
}

export function cell(c) {
  const symbolClass = c.glyph ? 'cell-symbol glyph' : 'cell-symbol';
  const attrs = [
    `class="cell ${esc(c.status)}${c.economic ? ' economic' : ''}"`,
    `data-num="${esc(c.num)}"`,
    `data-status="${esc(c.status)}"`,
    `data-register="${esc(c.derived.register)}"`,
    `data-kind="${esc((c.kind || []).join('|'))}"`,
    c.tier ? `data-tier="${esc(c.tier)}"` : '',
  ]
    .filter(Boolean)
    .join(' ');
  return `<button ${attrs}>
        <span class="cell-num">${esc(c.num)}</span>
        <span class="${symbolClass}">${esc(c.symbol)}</span>
        <span class="cell-label">${esc(c.label)}</span>
        <span class="cell-foot"><span class="cell-status">${esc(c.status)}</span>${cellBadges(c)}</span>
      </button>`;
}

export function group({ eyebrow, name, meta, cells: cs, unassigned }) {
  return `
            <section class="family${unassigned ? ' family-unassigned' : ''}">
                <div class="family-header">
                    <span class="family-label">${esc(eyebrow)}</span>
                    <span class="family-name">${esc(name)}</span>
                    <span class="family-meta">${esc(meta)}</span>
                </div>
                <div class="row">
                    ${cs.map(cell).join('\n                    ')}
                </div>
            </section>`;
}

export function registerBand({ reg, note, groups }) {
  return `
        <section class="register register-${esc(reg.id)}" id="register-${esc(reg.id)}">
            <div class="register-head">
                <span class="register-roman">${esc(reg.roman)}</span>
                <div class="register-titles">
                    <h2 class="register-name">${esc(reg.name)}</h2>
                    <p class="register-claim">${esc(reg.claim)}</p>
                </div>
                <span class="register-n">${esc(reg.count)}<small>cells</small></span>
            </div>
            <p class="register-note">${esc(note)}</p>
            ${groups.join('\n            ')}
        </section>`;
}

/* ──────────────────────── the semantic floor ────────────────────────
   Rendered as a band ABOVE the registers, because S1–S5 cut across every one of
   them and forcing them into Governance or Embodiment — the two groups they sit
   nearest — would assert a containment that is false. The band is deliberately
   not a grid of cells: these are not cells, and drawing them as cells is how a
   reader would come to count them among the census. */

export function floorBand({ floor, obligations, axes, resolved, observed, related }) {
  const row = (o) => `
                <article class="floor-row" id="floor-${esc(o.id)}">
                    <div class="floor-id">${esc(o.id)}</div>
                    <div class="floor-body">
                        <h3 class="floor-name">${esc(o.name)}</h3>
                        <p class="floor-obligation">${esc(o.obligation)}</p>
                        ${o.enforcement_properties ? `<div class="floor-props"><span class="floor-lbl">Enforcement properties</span><ul>${o.enforcement_properties.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>${o.properties_note ? `<p class="floor-note">${esc(o.properties_note)}</p>` : ''}</div>` : ''}
                        ${o.boundary_note ? `<div class="floor-boundary"><span class="floor-lbl">The boundary</span>${esc(o.boundary_note)}</div>` : ''}
                        ${(o.consequences || []).length ? `<ul class="floor-conseq">${o.consequences.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
                        <dl class="floor-meta">
                            <dt>Evidence</dt><dd><span class="ev-class ev-${esc(o.evidence_class)}">${esc(o.evidence_class)}</span> ${esc(o.evidence)}</dd>
                            <dt>Scope / trust profile</dt><dd>${esc(o.scope_profile)}</dd>
                            ${o.open.length ? `<dt class="open">Open</dt><dd class="open"><ul>${o.open.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></dd>` : ''}
                            ${(o.closed || []).length ? `<dt class="closed">Closed this round</dt><dd class="closed"><ul>${o.closed.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></dd>` : ''}
                        </dl>
                        <p class="floor-cells">${(related[o.id] || []).length
                          ? `<span class="floor-lbl">Cells that ${esc(o.id)} covers</span> ` + related[o.id].map((r) => `<button class="floor-cell-ref" data-num="${esc(r.num)}"><span class="rel">${esc(r.relation)}</span> ${esc(r.num)} ${esc(r.label)}</button>`).join(' ')
                          : (o.expected_empty
                            ? `<span class="floor-lbl">${esc(o.expected_empty.classification)}</span><span class="ee-why">${esc(o.expected_empty.why)}</span><span class="ee-examined"><span class="floor-lbl">Cells examined and rejected</span>${o.expected_empty.nearby_cells_examined.map((x) => `<span class="ee-cell">${esc(x)}</span>`).join('')}</span>`
                            : '<span class="floor-lbl">No cell on this table specializes it yet.</span>')}</p>
                    </div>
                </article>`;

  const axis = (a) => `
                <article class="floor-axis" id="floor-${esc(a.id)}">
                    <div class="floor-id axis">${esc(a.id)}</div>
                    <div class="floor-body">
                        <h3 class="floor-name">${esc(a.name)} <span class="axis-tag">${esc(a.axis.replace(/_/g, ' '))} · ${esc(a.status)}</span></h3>
                        <p class="floor-obligation">${esc(a.statement)}</p>
                        <dl class="floor-meta">
                            <dt>Why it is not an S-row</dt><dd>${esc(a.why_separate)}</dd>
                            ${a.assumptions ? `<dt>Assumptions</dt><dd><ul>${a.assumptions.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></dd>` : ''}
                            <dt>Evidence</dt><dd><span class="ev-class ev-${esc(a.evidence_class)}">${esc(a.evidence_class)}</span> ${esc(a.evidence)}</dd>
                            ${a.caution ? `<dt class="open">Caution</dt><dd class="open">${esc(a.caution)}</dd>` : ''}
                            ${(related[a.id] || []).length ? `<dt>Cells recorded beside it</dt><dd>${related[a.id].map((r) => `<button class="floor-cell-ref" data-num="${esc(r.num)}"><span class="rel">${esc(r.relation)}</span> ${esc(r.num)} ${esc(r.label)}</button>`).join(' ')}</dd>` : ''}
                        </dl>
                    </div>
                </article>`;

  const res = (r) => `
                <article class="floor-resolved" id="floor-${esc(r.id)}">
                    <div class="floor-id resolved">${esc(r.id)}</div>
                    <div class="floor-body">
                        <h3 class="floor-name">${esc(r.name)} <span class="reduce-tag">reduces to ${esc(r.reduces_to)}</span></h3>
                        <p class="floor-obligation">Recorded as <code>${esc(r.scoped_as)}</code>. Not a primitive.</p>
                        <dl class="floor-meta">
                            <dt>Why</dt><dd>${esc(r.why)}</dd>
                            <dt>Witness</dt><dd><code>${esc(r.witness)}</code></dd>
                            <dt class="open">Note</dt><dd class="open">${esc(r.note)}</dd>
                        </dl>
                    </div>
                </article>`;

  return `
        <section class="floor" id="floor">
            <div class="floor-head">
                <span class="floor-roman">S</span>
                <div class="register-titles">
                    <h2 class="register-name">Agency / Semantic Floor</h2>
                    <p class="register-claim">${esc(floor.basis_claim)}</p>
                </div>
                <span class="register-n">${esc(obligations.length)}<small>obligations</small></span>
            </div>
            <p class="register-note">${esc(floor.source.note)} Source: <code>${esc(floor.source.frontier)}</code>, ${esc(floor.source.adjudication)}.</p>
            <div class="floor-rows">${obligations.map(row).join('')}</div>
            <div class="floor-sub">
                <h4 class="floor-subhead">Resolved candidates — reduced, not counted</h4>
                ${resolved.map(res).join('')}
                <h4 class="floor-subhead">Separate axes — not in the safety basis</h4>
                ${axes.map(axis).join('')}
                <h4 class="floor-subhead">Reduced, not minted</h4>
                <article class="floor-observed" id="floor-${esc(observed.id)}">
                    <div class="floor-id resolved">${esc(observed.id)}</div>
                    <div class="floor-body">
                        <h3 class="floor-name">${esc(observed.name)} <span class="reduce-tag">${esc(observed.status)}</span></h3>
                        <p class="floor-obligation">${esc(observed.statement)}</p>
                        ${(observed.not_this || []).length ? `<div class="floor-props"><span class="floor-lbl">What it is not</span><ul>${observed.not_this.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
                        <dl class="floor-meta">
                            <dt>Observed in</dt><dd>${esc(observed.observed_in)}</dd>
                            ${observed.reduction_experiment ? `
                            <dt>Reduction</dt><dd><span class="ev-class ev-${esc(observed.reduction_experiment.class.toLowerCase())}">${esc(observed.reduction_experiment.class)}</span> ${esc(observed.reduction_experiment.scope)}<br /><code>${esc(observed.reduction_experiment.witness)}</code></dd>
                            <dt>Finding</dt><dd>${esc(observed.reduction_experiment.finding)}</dd>
                            <dt>Reading</dt><dd>${esc(observed.reduction_experiment.interpretation)}</dd>` : ''}
                            <dt>Prior art</dt><dd>${esc(observed.prior_art)}</dd>
                            <dt class="open">Disposition</dt><dd class="open">${esc(observed.disposition)}</dd>
                        </dl>
                    </div>
                </article>
            </div>
        </section>`;
}

/* ────────────────────────── inspector ────────────────────────── */

export function inspector() {
  return `
        <aside class="inspector" id="inspector" aria-hidden="true">
            <button class="inspector-close" id="inspector-close" aria-label="Close">×</button>
            <div class="inspector-inner">
                <div class="inspector-glyph" id="i-glyph-wrap">
                    <div class="big-num" id="i-num">—</div>
                    <div class="big-symbol" id="i-symbol">—</div>
                    <div class="big-label" id="i-label">—</div>
                    <div class="i-register" id="i-register">—</div>
                </div>
                <div class="inspector-body">
                    <h2 id="i-title">Select an invariant</h2>
                    <p class="tagline" id="i-tagline">
                        Click any cell for its definition, its stated authority consequence, and every ledger record bound to it.
                    </p>
                    <p id="i-description"></p>
                    <p id="i-extra"></p>
                    <div class="formal" id="i-formal" style="display: none">
                        <span class="label">Conservation / composition law</span>
                        <span id="i-formal-text"></span>
                    </div>
                    <div class="ledger-block" id="i-ledger" style="display: none">
                        <span class="label">Ledger records bound to this cell</span>
                        <div id="i-ledger-list"></div>
                    </div>
                    <div class="doubt-block" id="i-doubt" style="display: none">
                        <span class="label">Registered doubt</span>
                        <div id="i-doubt-list"></div>
                    </div>
                </div>
                <dl class="inspector-meta">
                    <div>
                        <dt>Shading</dt>
                        <dd><span class="status-badge" id="i-status">—</span></dd>
                    </div>
                    <div id="i-tier-row" style="display: none">
                        <dt>Evidence anchor</dt>
                        <dd id="i-tier">—</dd>
                    </div>
                    <div id="i-hypothesis-row" style="display: none">
                        <dt>Hypothesis (undischarged)</dt>
                        <dd id="i-hypothesis">—</dd>
                    </div>
                    <div id="i-kind-row" style="display: none">
                        <dt>Semantic kind</dt>
                        <dd id="i-kind">—</dd>
                    </div>
                    <div id="i-floor-row" style="display: none">
                        <dt>Semantic floor</dt>
                        <dd>
                            <div class="i-floor">
                                <div class="i-floor-head">Relation to the floor</div>
                                <div class="i-floor-rel" id="i-floor-rel">—</div>
                                <div class="i-floor-why" id="i-floor-why">—</div>
                            </div>
                        </dd>
                    </div>
                    <div id="i-arity-row" style="display: none">
                        <dt>Run arity</dt>
                        <dd id="i-arity">—</dd>
                    </div>
                    <div>
                        <dt>Protocol</dt>
                        <dd id="i-protocol">—</dd>
                    </div>
                    <div>
                        <dt>Authority claim</dt>
                        <dd id="i-authority">—</dd>
                    </div>
                    <div>
                        <dt>Mathematical source</dt>
                        <dd id="i-source">—</dd>
                    </div>
                </dl>
                <div class="evidence-foot" id="i-evidence">
                    <a class="proof-link" id="i-proof" href="#" style="display: none">Read the proof →</a>
                    <div class="witness-block" id="i-witness" style="display: none">
                        <span class="label" id="i-witness-label">Run the witness</span>
                        <div id="i-witness-list"></div>
                        <p class="witness-note" id="i-witness-note"></p>
                    </div>
                    <p class="evidence-none" id="i-evidence-none" style="display: none"></p>
                </div>
            </div>
        </aside>`;
}

/* ──────────────────────── witness page ──────────────────────── */

export function witnessPage({ cell, css, stamp, witnesses, records, doubt, tier }) {
  const runnable = witnesses.filter((w) => w.kind === 'runnable');
  const other = witnesses.filter((w) => w.kind !== 'runnable');

  const runner = (w, i) => `
            <div class="wrun" id="wrun-${i}">
                <div class="wrun-head">
                    <code class="wrun-cmd">node ${esc(w.path)}${w.argv && w.argv.length ? ' ' + esc(w.argv.join(' ')) : ''}</code>
                    <span class="wrun-mode">${esc(w.mode === 'suite' ? 'exported suite' : 'runs on import')}</span>
                </div>
                ${w.weaker ? `<p class="wrun-weaker"><b>Weaker here than on the command line.</b> ${esc(w.weaker)}</p>` : ''}
                <div class="wrun-bar">
                    <button class="wrun-go" data-i="${i}">▶ Run it here</button>
                    <span class="wstatus" id="wstatus-${i}">not run</span>
                </div>
                <div class="wout" id="wout-${i}"></div>
            </div>`;

  return `<!doctype html>
<html lang="en">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${esc(cell.title)} — witness — OpenSentience</title>
        <meta name="description" content="${esc(cell.tagline)}" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
        <link
            href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400&family=JetBrains+Mono:wght@400;500;700&family=Inter:wght@400;500;600&display=swap"
            rel="stylesheet"
        />
        <style>
${css}
        </style>
    </head>
    <body style="padding-top: 56px">
        <script type="module" src="/amp-nav.js"></script>
        <amp-nav property="opensentience"></amp-nav>
        <div class="wrap">
            <header class="proof-head">
                <div class="glyph-box">
                    <div class="gb-num">${esc(cell.num)}</div>
                    <div class="gb-sym${cell.glyph ? ' glyph' : ''}">${esc(cell.symbol)}</div>
                    <div class="gb-lab">${esc(cell.label)}</div>
                </div>
                <div class="head-text">
                    <div class="eyebrow"><a href="/invariants.html">← the table</a> · witness</div>
                    <h1>${esc(cell.title)}</h1>
                    <p class="lede">${esc(cell.tagline)}</p>
                    ${tier ? `<p class="tierline"><b>${esc(tier.name)}</b> — ${esc(tier.gloss)}</p>` : ''}
                </div>
            </header>

            <h2><span class="n">01</span>What the cell claims</h2>
            <p>${esc(cell.desc)}</p>
            ${cell.hypothesis ? `<div class="hyp"><span class="label">Hypothesis — NOT discharged</span>${esc(cell.hypothesis)}</div>` : ''}

            ${runnable.length ? `
            <h2><span class="n">02</span>Run the witness</h2>
            <p>
                The module below is <strong>byte-identical</strong> to the file
                <code>node ${esc(runnable[0].path)}</code> executes. It is staged with its whole
                relative-import closure${runnable[0].files > 1 ? ` (${runnable[0].files} files)` : ''} and hashed into
                this build, so a staged copy that drifts from source is refused. It is not a port
                and not a re-implementation — the imports resolve to the same code.
            </p>
            ${runnable.map(runner).join('\n')}` : ''}

            ${other.length ? `
            <h2><span class="n">0${runnable.length ? 3 : 2}</span>What cannot run here</h2>
            <p>Named by the ledger for this cell, and not offered as a button — with the reason:</p>
            <div class="wother">
                ${other.map((w) => `<div class="wo"><code>${esc(w.path)}</code><span class="wo-kind">${esc(w.kind)}</span><span class="wo-why">${esc(w.why)}</span></div>`).join('\n                ')}
            </div>` : ''}

            ${records.length ? `
            <h2><span class="n">0${(runnable.length ? 1 : 0) + (other.length ? 1 : 0) + 2}</span>The ledger records bound to this cell</h2>
            <div class="wrecs">
                ${records.map((r) => `<div class="rec"><span class="rec-status ${esc(r.status)}">${esc(r.status)}</span><span class="rec-id">${esc(r.id)}</span><span class="rec-obl">${esc(r.obligation || '')}</span><p class="rec-stmt">${esc(r.statement)}</p></div>`).join('\n                ')}
            </div>` : ''}

            ${doubt.length ? `
            <h2><span class="n">0${(runnable.length ? 1 : 0) + (other.length ? 1 : 0) + 3}</span>Registered doubt</h2>
            <div class="wrecs">
                ${doubt.map((d) => `<div class="doubt-item"><b>${esc(d.id)} (${esc(d.kind)})</b> ${esc(d.doubt)}</div>`).join('\n                ')}
            </div>` : ''}

            <footer class="wfoot">
                <span>© 2026 Ampersand Box Design</span>
                <span><a href="/invariants.html">The Periodic Table of Agent Invariants</a></span>
            </footer>
        </div>
        <script type="module">
            import { runWitness } from '/witness/run.js?v=${esc(stamp)}';
            const SPECS = ${JSON.stringify(runnable.map((w) => ({
              entry: '/witness/src/' + w.path, mode: w.mode, stamp, argv: w.argv || [], trials: w.trials || 200,
            })))};
            document.querySelectorAll('.wrun-go').forEach((b) => {
                b.addEventListener('click', () => {
                    const i = Number(b.dataset.i);
                    runWitness({
                        spec: SPECS[i],
                        sink: document.getElementById('wout-' + i),
                        status: document.getElementById('wstatus-' + i),
                        button: b,
                    });
                });
            });
        </script>
    </body>
</html>
`;
}

/* ─────────────────────────── footer ─────────────────────────── */

export function footer({ protocolRange, citations }) {
  return `
        <footer>
            <div class="footer-row">
                <span>© 2026 Ampersand Box Design · Apache 2.0 where possible</span>
                <span>Compiled from OpenSentience protocols ${esc(protocolRange)}</span>
                <span><a href="https://opensentience.org">opensentience.org</a></span>
            </div>
            <div class="footer-citations">
                ${citations.map((c) => `<p>${c}</p>`).join('\n                ')}
            </div>
        </footer>`;
}
