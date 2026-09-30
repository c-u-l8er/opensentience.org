/* ── the reference apparatus: definitions, the files the book cites, and the FAQ ──────────────────────
   A reader meeting `TRVM` or `scripts/check-messaging-language.mjs` for the first time should be able to
   find out what it is without leaving the sentence. Three rules shape what is here:

   1. Nothing is defined twice. The evidence labels are PARSED out of build.mjs's own header comment, so
      the reference page cannot drift from the rule the build actually applies; the rung ladder is read
      from build.mjs's LADDER. Authoring either in reference.json is refused.
   2. Every citation resolves or the build refuses. A path in the prose is checked against the tree the
      same way a witness path is (P3). A citation that has rotted is worse than no citation.
   3. A file in a repository that is not published is named and hashed, never linked and never quoted.
      The book does not offer a reader a door that will not open for them.                              */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const sha = (b) => createHash('sha256').update(b).digest('hex');
export const slug = (p) => p.replace(/[^\w.-]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* ── what the build already defines, read from the build ─────────────────────────────────────────── */
export function derivedLabels(buildSrc) {
  const block = buildSrc.match(/DERIVED, never typed[^\n]*\n([\s\S]*?)\n \*\n/);
  if (!block) throw Error('reference: build.mjs no longer states its DERIVED rules where this can read them');
  const out = {};
  for (const line of block[1].split('\n')) {
    const m = line.match(/^ \*\s{3}(\w+)\s{2,}(.+?)\s*$/);
    if (m) out[m[1]] = m[2];
  }
  if (!out.WITNESSED) throw Error('reference: the DERIVED block parsed to nothing recognisable');
  return out;
}
export function ladder(buildSrc) {
  const m = buildSrc.match(/const LADDER = \[([^\]]+)\]/);
  if (!m) throw Error('reference: build.mjs no longer declares LADDER where this can read it');
  return m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, ''));
}

/* ── resolving a path the prose cites ────────────────────────────────────────────────────────────── */
/* Where to LOOK for a path the prose names relative to somewhere. This is a search order, not a claim
   about ownership. */
const BASES = ['', 'opensentience.org', 'opensentience.org/_patterns', 'graphonomous/v2',
  'WRL', 'TRVM', 'AmpersandBoxDesign', 'graphonomous', 'computedriven', 'FPLA', 'super', 'PARKVPS', 'studbook', 'invariant-r10'];

/* WHICH repository a resolved file belongs to is derived, not listed. A hand-kept list of repo names
   was wrong on its first outing: `FPLA/` is a plain directory inside ProjectAmp2, not a repository, and
   listing it would have told a reader it lived somewhere it does not — under a name with no publication
   status of its own. A directory is a repository when it has a .git; that answer maintains itself. */
const REPO_CACHE = new Map();
const isRepo = (ROOT, seg) => {
  const key = `${ROOT}\u0000${seg}`;
  if (!REPO_CACHE.has(key)) REPO_CACHE.set(key, existsSync(join(ROOT, seg, '.git')));
  return REPO_CACHE.get(key);
};
export function resolvePath(raw, ROOT) {
  let t = String(raw).trim().replace(/^node\s+/, '').replace(/\s+.*$/, '');
  const lm = t.match(/^(.*?):(\d+)$/);
  const line = lm ? Number(lm[2]) : null;
  if (lm) t = lm[1];
  if (!t.includes('/')) return null;                 // a bare filename is prose, not a citation
  if (/^https?:/i.test(t) || /^sem-/i.test(t)) return null;
  t = t.replace(/^ProjectAmp2\//, '');               // …after the '/' test, or this strips the only one
  for (const base of BASES) {
    const abs = join(ROOT, base, t);
    if (!existsSync(abs)) continue;
    const rel = abs.slice(ROOT.length + 1);
    const seg = rel.split('/')[0];
    const repo = isRepo(ROOT, seg) ? seg : '.';
    return { rel, line, repo, abs, dir: statSync(abs).isDirectory() };
  }
  return { rel: null, line, repo: null, abs: null, raw: t };
}

/* ── the index of every file the book cites ──────────────────────────────────────────────────────── */
export function fileIndex(pages, { ROOT, repos, witnesses, staged, run, seeds = [] }) {
  const idx = new Map(), unresolved = [];
  /* The reference page's own citations are seeded in, so the file a definition rests on is resolved,
     hashed and linked like any the prose names. Without this the one path a reader most wants to
     follow — the authority for the definition they are reading — was the one plain string on the page. */
  const scanned = [...pages.map(([page, html]) => [page, [...html.matchAll(/<code>([^<]{2,160})<\/code>/g)].map((m) => m[1].trim())]),
                   ['reference.html', seeds]];
  for (const [page, raws] of scanned) {
    const seeded = page === 'reference.html';
    for (const raw of raws) {
      /* a seed IS a citation by construction, so a root-level file like AGENCY.md counts; in the prose
         a bare filename is just a word, which is the distinction resolveCitation exists to draw */
      if (!seeded && !raw.includes('/')) continue;
      const r = seeded ? resolveCitation(raw, ROOT) : resolvePath(raw, ROOT);
      if (!r) continue;
      if (!r.rel) { unresolved.push({ page, raw, seeded }); continue; }
      let e = idx.get(r.rel);
      if (!e) {
        const meta = repos[r.repo] || {};
        const published = !!meta.published;
        const inRepo = r.repo === '.' ? r.rel : r.rel.replace(new RegExp('^' + esc(r.repo) + '/'), '');
        /* a link is offered only when git says the bytes are actually at the other end of it */
        const remote = published && meta.url && !r.dir && run
          ? remoteState(run, join(ROOT, r.repo === '.' ? '.' : r.repo), inRepo, r.abs) : null;
        const linkable = !!(remote && remote.ok && remote.same);
        e = {
          path: r.rel, slug: slug(r.rel), repo: r.repo, published, dir: !!r.dir,
          remote, linkable,
          url: linkable ? `${meta.url}/blob/${remote.commit}/${inRepo}` : null,
          bytes: r.dir ? null : statSync(r.abs).size,
          sha256: r.dir ? null : sha(readFileSync(r.abs)),
          staged: staged.get(r.rel) || null,
          why: witnesses.get(r.rel) || null,
          spellings: new Set(), pages: new Set(), lines: new Set(),
        };
        idx.set(r.rel, e);
      }
      e.spellings.add(raw); e.pages.add(page);
      if (r.line) e.lines.add(r.line);
    }
  }
  return { idx, unresolved };
}

/* ── annotating the prose ────────────────────────────────────────────────────────────────────────────
   Only the FIRST mention on a page is wrapped. `locus` appears on nearly every line of some chapters and
   `Film` 179 times across the book; marking every one would turn the text into a field of links and stop
   a reader reading, which is the opposite of what this is for. The first one carries the definition; the
   rest are just the word.

   Everything is a real <a href> into the reference page, so it works with no JavaScript at all. The
   popover is an enhancement layered over a link that already goes somewhere.                           */
const PROTECT = /<(script|style|svg|pre|title|textarea)\b[^>]*>[\s\S]*?<\/\1>|<!--[\s\S]*?-->/gi;
const HOLD = (i) => `@@REFHOLD${i}@@`;

export function annotate(html, { terms, bySpelling, base = '' }) {
  const held = [];
  let s = html.replace(PROTECT, (m) => { held.push(m); return HOLD(held.length - 1); });
  const used = { terms: new Set(), files: new Set() };

  /* file citations always sit inside <code>, which makes them exact to target and safe to rewrite */
  s = s.replace(/<code>([^<]{2,160})<\/code>/g, (whole, raw) => {
    const e = bySpelling.get(raw.trim());
    if (!e) return whole;
    used.files.add(e.path);
    return `<a class="gl glf" href="${base}reference#f-${e.slug}" data-g="f:${e.slug}"><code>${raw}</code></a>`;
  });

  /* terms, in text only: never inside a tag, an attribute, or an existing link */
  const names = Object.keys(terms).sort((a, b) => b.length - a.length);
  if (names.length) {
    const rx = new RegExp(`(?<![\\w-])(${names.map(esc).join('|')})(?![\\w-])`, 'g');
    let depth = 0;
    s = s.split(/(<[^>]*>)/).map((part) => {
      if (part.startsWith('<')) {
        if (/^<a\b/i.test(part)) depth++;
        else if (/^<\/a\s*>/i.test(part)) depth = Math.max(0, depth - 1);
        return part;
      }
      if (depth > 0) return part;
      return part.replace(rx, (m) => {
        if (used.terms.has(m)) return m;
        used.terms.add(m);
        return `<a class="gl glt" href="${base}reference#t-${m}" data-g="t:${m}">${m}</a>`;
      });
    }).join('');
  }
  s = s.replace(/@@REFHOLD(\d+)@@/g, (_, i) => held[Number(i)]);
  return { html: s, used };
}

/* ── what a popover says ─────────────────────────────────────────────────────────────────────────────
   Small enough to inline into each page: only the entries that page actually mentions travel with it, so
   a chapter carries a few kilobytes and needs no fetch to answer a hover.                               */
export function cardsFor(used, { terms, index, repos }) {
  const out = { t: {}, f: {} };
  for (const name of used.terms) {
    const t = terms[name];
    out.t[name] = { h: name, sub: t.expands ? t.expands + (t.expands_standing ? ` \u2014 ${t.expands_standing}` : '') : '', is: t.is, then: t.then || '', note: t.note || '', src: t.source || t.external || '', srcUrl: t.source_url || '' };
  }
  for (const path of used.files) {
    const e = index.get(path);
    const meta = repos[e.repo] || {};
    out.f[e.slug] = {
      h: e.path, sub: e.dir ? 'directory' : `${e.bytes.toLocaleString()} bytes`,
      is: e.why || '', sha: e.sha256 ? e.sha256.slice(0, 12) : '',
      repo: meta.name || e.repo, url: e.url,
      note: e.published
        ? (e.linkable || e.dir ? '' : `In ${meta.name || e.repo}, which is published — but ${e.remote && e.remote.why ? e.remote.why : 'this file is not reachable there'}. Named and hashed here, not linked.`)
        : `In ${meta.name || e.repo}, which is not published — named and hashed here, not linked.`,
      staged: e.staged || '', lines: [...e.lines].sort((a, b) => a - b),
    };
  }
  return out;
}

/* ── the reference page ──────────────────────────────────────────────────────────────────────────── */
const h = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const bytes = (n) => (n == null ? '' : n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`);

export function referenceBody({ terms, outcomes, faq, labels, rungs, index, repos, chapterName }) {
  const bySlug = new Map([...index.values()].map((e) => [e.path, e]));
  const citeSrc = (src) => { const e = [...index.values()].find((x) => src && (x.path === src || src.startsWith(x.path + ':') || x.path.endsWith('/' + src.replace(/:\d+$/, '')))); return e ? `<a href="#f-${h(e.slug)}"><code>${h(src)}</code></a>` : `<code>${h(src)}</code>`; };
  const o = [];

  o.push(`<h2 id="definitions">Definitions</h2>
<p>Words this book uses in a particular way, and the acronyms it does not spell out every time. Each one
says where its definition actually lives; none of them is defined here for the first time.</p>`);
  for (const [name, t] of Object.entries(terms)) {
    o.push(`<div class="ref-e" id="t-${h(name)}"><p class="ref-t">${h(name)}${t.expands ? ` <span class="ref-x">${h(t.expands)}${t.expands_standing ? ` \u2014 ${h(t.expands_standing)}` : ''}</span>` : ''}</p>
<p class="ref-is">${h(t.is)}</p>${t.then ? `<p class="ref-then">${h(t.then)}</p>` : ''}
${t.note ? `<p class="ref-warn">${h(t.note)}</p>` : ''}
<p class="ref-src">${t.source ? `Defined at ${citeSrc(t.source)}` : h(t.external)}${t.source_url ? ` \u00b7 published at <a href="${h(t.source_url)}" rel="noopener">${h(t.source_url.replace(/^https?:\/\//, ''))}</a>` : ''}</p></div>`);
  }

  o.push(`<h2 id="ladder">The evidence labels</h2>
<p>Every chapter carries a label, and <b>no author types one</b>: the build derives each from the record
and refuses a record that tries to write its own. These are the rules it applies, read out of the build's
own source when this page was made — so what you read here is what ran.</p>
<table class="ref-l"><tr><th>label</th><th>the build derives it as</th></tr>
${Object.entries(labels).map(([k, v]) => `<tr id="t-${h(k)}"><td><code>${h(k)}</code></td><td>${h(v)}</td></tr>`).join('')}</table>
<p class="ref-src">Parsed from <code>opensentience.org/_patterns/build/build.mjs</code> at build time.</p>
<h3 id="rungs">The rung ladder</h3>
<p>How close a witness is to having actually run somewhere a reader could check. A record may not claim a
rung above the one the build can derive for it.</p>
<p class="ref-rungs">${rungs.map((r, i) => `<code>${h(r)}</code>`).join(' <span class="ref-lt">&lt;</span> ')}</p>`);

  o.push(`<h2 id="outcomes">The three-valued outcome</h2>
<p>${h(outcomes._is)}</p><dl class="ref-d">
${['APPLIED', 'REFUSED', 'INDETERMINATE'].map((k) => `<dt id="t-${k}"><code>${k}</code></dt><dd>${h(outcomes[k])}</dd>`).join('')}
</dl><p class="ref-src">Vocabulary from <code>${h(outcomes._source)}</code>.</p>`);

  const byRepo = new Map();
  for (const e of [...index.values()].sort((a, b) => a.path.localeCompare(b.path))) {
    if (!byRepo.has(e.repo)) byRepo.set(e.repo, []);
    byRepo.get(e.repo).push(e);
  }
  const order = [...byRepo.keys()].sort((a, b) => (byRepo.get(b).length - byRepo.get(a).length));
  o.push(`<h2 id="files">Files the book cites</h2>
<p>Every path named anywhere in these pages, resolved against the tree when the site was built. <b>The
build refuses if one of them does not resolve</b>, so a citation here has at least been checked to exist.
A file in a repository that is not published is named and hashed but not linked: the book will not offer
you a door that does not open.</p>`);
  for (const repo of order) {
    const meta = repos[repo] || {};
    const list = byRepo.get(repo);
    o.push(`<h3 id="r-${h(slug(repo))}">${h(meta.name || repo)} <span class="ref-n">${list.length} file${list.length === 1 ? '' : 's'}</span></h3>
${meta.published ? `<p class="ref-src">Published at <a href="${h(meta.url)}" rel="noopener">${h(meta.url)}</a>.</p>` : `<p class="ref-warn">${h(meta.note || 'Not published.')}</p>`}
<table class="ref-f"><tr><th>path</th><th>size</th><th>sha256</th><th>cited on</th></tr>
${list.map((e) => `<tr id="f-${h(e.slug)}"><td>${e.url ? `<a href="${h(e.url)}" rel="noopener"><code>${h(e.path)}</code></a>` : `<code>${h(e.path)}</code>`}${e.published && !e.url && !e.dir ? ` <span class="ref-unpushed" title="${h((e.remote && e.remote.why) || '')}">not pushed</span>` : ''}${e.staged ? ` <a class="ref-staged" href="${h(e.staged)}">staged</a>` : ''}</td><td>${e.dir ? 'dir' : h(bytes(e.bytes))}</td><td>${e.sha256 ? `<code class="ref-sha">${h(e.sha256.slice(0, 12))}</code>` : '—'}</td><td class="ref-cited">${[...e.pages].sort().slice(0, 4).map((p) => `<a href="${h(p)}">${h(chapterName(p))}</a>`).join(', ')}${e.pages.size > 4 ? ` <span class="ref-n">+${e.pages.size - 4} more</span>` : ''}</td></tr>`).join('')}
</table>`);
  }

  o.push(`<h2 id="faq">Questions</h2><dl class="ref-q">
${faq.map((f, i) => `<dt id="q-${i + 1}">${h(f.q)}</dt><dd>${h(f.a)}</dd>`).join('')}</dl>`);
  return o.join('\n');
}

export const REF_CSS = `
.ref-e{margin:0 0 1.1rem;padding-left:.8rem;border-left:2px solid var(--rule,#e4ded2)}
.ref-t{margin:0;font-weight:650}
.ref-x{font-weight:400;color:var(--fg2,#555)}
.ref-is{margin:.15rem 0}
.ref-then{margin:.15rem 0;color:var(--fg2,#555)}
.ref-warn{margin:.2rem 0;font:13px/1.5 var(--ui,system-ui);color:var(--warn,#9a5b00)}
.ref-src{margin:.2rem 0 0;font:12px/1.5 var(--ui,system-ui);color:var(--fg3,#777)}
.ref-l,.ref-f{border-collapse:collapse;width:100%;font:13px/1.5 var(--ui,system-ui);margin:.6rem 0}
.ref-l th,.ref-l td,.ref-f th,.ref-f td{text-align:left;vertical-align:top;padding:.3rem .5rem;border-bottom:1px solid var(--rule,#e4ded2)}
.ref-l th,.ref-f th{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--fg3,#777)}
.ref-f td:nth-child(2),.ref-f td:nth-child(3){white-space:nowrap;color:var(--fg2,#555)}
.ref-sha{font-size:11px;color:var(--fg3,#777)}
.ref-cited{font-size:12px}
.ref-n{font:11px var(--ui,system-ui);color:var(--fg3,#777);font-weight:400}
.ref-rungs{font:14px var(--ui,system-ui)}
.ref-lt{color:var(--fg3,#777)}
.ref-unpushed{font:10.5px var(--ui,system-ui);color:var(--warn,#9a5b00);border:1px solid var(--warn,#9a5b00);border-radius:3px;padding:0 .25rem}
.ref-staged{font:10.5px var(--ui,system-ui);color:var(--data,#0a6e62);border:1px solid var(--data,#0a6e62);border-radius:3px;padding:0 .25rem;text-decoration:none}
.ref-d dt,.ref-q dt{font-weight:650;margin-top:.7rem}
.ref-d dd,.ref-q dd{margin:.15rem 0 0;color:var(--fg2,#555)}
.ref-q dt{font-family:var(--display,Georgia,serif)}
:target{scroll-margin-top:1rem}
.ref-e:target,.ref-f tr:target td,.ref-l tr:target td{background:var(--acc-soft,rgba(109,59,212,.09))}
@media (max-width:640px){.ref-f td:nth-child(3),.ref-f th:nth-child(3){display:none}}
`;

/* A citation may name a file at the root of the tree — AGENCY.md, DOCTRINE.md — which `resolvePath`
   deliberately refuses, because in the middle of a sentence a bare filename is prose and not a path.
   A `source` field is not in the middle of a sentence: it is a citation, and the distinction is the
   whole reason both functions exist. */
export function resolveCitation(raw, ROOT) {
  const r = resolvePath(raw, ROOT);
  if (r && r.rel) return r;
  const t = String(raw).trim().replace(/:\d+$/, '');
  if (!t.includes('/') && existsSync(join(ROOT, t))) return { rel: t, line: null, repo: '.', abs: join(ROOT, t), dir: statSync(join(ROOT, t)).isDirectory() };
  return r;
}

/* ── is this file actually reachable at the other end of the link? ───────────────────────────────────
   A link to a file that has not been pushed is a dead link, which is the one thing this site refuses on
   every other surface (`R12`, "a witness present and dead"). Whether a path exists on disk says nothing
   about that: `graphonomous/v2/test/projection_v1.test.mjs` is right here and 404s on GitHub.

   So linkability is DERIVED from git, and derived offline — the remote-tracking ref this machine already
   has, never a network call, because a build that reaches the network is a build whose output depends on
   the weather. The link points at the exact commit rather than HEAD, and the blob is compared against
   the local bytes, so a link either lands on the bytes this page hashed or is not offered at all.

   The limit, stated because it is real: this reads `origin/*` as last fetched. A file pushed from
   somewhere else since then reads as unpushed, which errs toward saying less than is true. */
const TREES = new Map();
/* One `rev-parse` and one `ls-tree` per repository, then nothing: a blob's name is
   sha1("blob <len>\0<bytes>"), so the comparison is arithmetic here rather than a subprocess per file.
   The first version shelled out four times per file and put 11 seconds on the build. */
function remoteTree(run, repoDir) {
  if (TREES.has(repoDir)) return TREES.get(repoDir);
  const git = (args) => { try { return run(`git -C ${JSON.stringify(repoDir)} ${args}`).trim(); } catch { return null; } };
  let t = { commit: null, blobs: null, why: 'no remote-tracking branch on this machine' };
  const ref = ['origin/HEAD', 'origin/main', 'origin/master'].find((r) => git(`rev-parse --verify --quiet ${r}`));
  if (ref) {
    const commit = git(`rev-parse ${ref}`);
    const listing = commit && run(`git -C ${JSON.stringify(repoDir)} ls-tree -r --format='%(objectname) %(path)' ${commit}`);
    if (listing != null) {
      const blobs = new Map();
      for (const line of listing.split('\n')) {
        const i = line.indexOf(' ');
        if (i > 0) blobs.set(line.slice(i + 1).replace(/^'|'$/g, ''), line.slice(0, i).replace(/^'/, ''));
      }
      t = { commit, blobs, why: '' };
    }
  }
  TREES.set(repoDir, t);
  return t;
}
const gitBlob = (buf) => createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${buf.length}\0`), buf])).digest('hex');

export function remoteState(run, repoDir, pathInRepo, localAbs) {
  const t = remoteTree(run, repoDir);
  if (!t.blobs) return { ok: false, why: t.why };
  const blob = t.blobs.get(pathInRepo);
  if (!blob) return { ok: false, commit: t.commit, why: 'not pushed — the path is on disk and not on the remote branch' };
  const same = gitBlob(readFileSync(localAbs)) === blob;
  return { ok: true, commit: t.commit, same, why: same ? '' : 'the pushed copy differs from the bytes hashed here' };
}
