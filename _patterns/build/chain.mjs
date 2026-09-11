/* chain.mjs — compose the book's WRL chain: fragments in catalog order, links only in the cumulative world.
 * Exported for build.mjs and run-films.mjs; run directly to seal-test every delta and every cumulative step.
 *   node opensentience.org/_patterns/build/chain.mjs     → prints the ladder, writes wrl/chain/_conclusion.wrl */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, '../../..');
export const CHAIN = join(HERE, '../wrl/chain');
export const PROFILE = 'profile forge.world.core.v1\n';
export function order() {
  const D = JSON.parse(readFileSync(join(HERE, '../data/patterns.json'), 'utf8'));
  return D.families.flatMap((f) => D.patterns.filter((p) => p.family === f)).map((p) => p.id);
}
export function fragment(id) { const f = join(CHAIN, id + '.wrl'); return existsSync(f) ? readFileSync(f, 'utf8') : null; }
export function bench(id) { const f = join(CHAIN, id + '.bench.wrl'); return existsSync(f) ? readFileSync(f, 'utf8') : ''; }
export function links(id) { const f = join(CHAIN, id + '.links.wrl'); return existsSync(f) ? readFileSync(f, 'utf8') : ''; }
export function filmMeta(id) { const f = join(CHAIN, id + '.film.json'); return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {}; }
export function epochsOf(id) { const sc = scenario(id); return sc && Array.isArray(sc.epochs) ? sc.epochs.length : ((filmMeta(id).epochs) || 4); }
export function scenario(id) { const f = join(CHAIN, id + '.scenario.json'); return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null; }
export const deltaSource = (id) => PROFILE + '\n' + fragment(id) + (bench(id) ? '\n' + bench(id) : '');
export function cumulativeSource(ids) { return PROFILE + ids.map((id) => '\n' + fragment(id) + (links(id) ? '\n' + links(id) : '')).join(''); }
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const W = await import(join(ROOT, 'WRL/wrl.js'));
  const ids = order(); let prev = null, bad = 0; const ladder = [];
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]; if (!fragment(id)) { console.log(`✗ ${id}: no fragment`); bad++; continue; }
    const d = await W.sealWorld(deltaSource(id));
    const scf = join(CHAIN, id + '.scenario.json'); if (d.ok && existsSync(scf)) { const sc = JSON.parse(readFileSync(scf, 'utf8')); if (sc.scenario_version === 'scenario.v1' && sc.world_semantic_id !== d.semanticId) { sc.world_semantic_id = d.semanticId; writeFileSync(scf, JSON.stringify(sc, null, 1) + '\n'); } }
    const c = await W.sealWorld(cumulativeSource(ids.slice(0, i + 1)));
    let sup = true;
    if (prev && c.ok) { const N = new Set(c.graph.nodes.map((n) => n[1])), E = new Set(c.graph.edges.map((e) => e.join('>'))); sup = prev.graph.nodes.every((n) => N.has(n[1])) && prev.graph.edges.every((e) => E.has(e.join('>'))); }
    console.log(`${d.ok && c.ok && sup ? '✓' : '✗'} ${String(i + 1).padStart(2)} ${id.padEnd(42)} delta ${d.ok ? d.semanticId.slice(0, 16) : d.code + ': ' + d.message.slice(0, 80)} · chain ${c.ok ? c.semanticId.slice(0, 16) + ` (${c.graph.nodes.length}n ${c.graph.edges.length}e)` : c.code + ': ' + c.message.slice(0, 80)}${sup ? '' : ' · NOT A SUPERSET'}`);
    if (!(d.ok && c.ok && sup)) bad++;
    if (c.ok) { prev = c; ladder.push({ id, chain: c.semanticId }); }
  }
  writeFileSync(join(CHAIN, '_conclusion.wrl'), cumulativeSource(ids));
  console.log(`\n${ids.length} chapters, ${bad} problem(s); wrote _conclusion.wrl`);
  process.exit(bad ? 1 : 0);
}
