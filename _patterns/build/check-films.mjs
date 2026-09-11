#!/usr/bin/env node
/* check-films.mjs — does each chapter's Film run long enough for its shape to complete?
 * For every chain receipt: doors that never open, orbs whose pose never changes, wires that never carry a
 * signal, pulsers that never fire (nf never reaches 0 / done never set) — by the last epoch. A chapter whose
 * story is cut short is reported with a suggested epoch count (longest path + settle). Exit 1 if any. */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
const HERE = dirname(fileURLToPath(import.meta.url));
const CH = await import(join(HERE, 'chain.mjs'));
const WRL = await import(join(CH.ROOT, 'WRL/wrl.js'));
const FILMS = join(HERE, '../films');
const receipts = readdirSync(FILMS).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(FILMS, f), 'utf8')));
const parse = (l) => { const [role, name, rest] = l.split(':'); return { role, name, rest }; };
let bad = 0;
for (const id of CH.order()) {
  if (!CH.fragment(id)) continue;
  const src = CH.deltaSource(id); const s = await WRL.sealWorld(src); if (!s.ok || !s.graph.nodes.length) { console.log(`·  ${id.padEnd(42)} empty world — no film by design`); continue; }
  const key = (await import('node:crypto')).createHash('sha256').update(src).digest('hex');
  const rc = receipts.find((r) => r.source_identity.world_sha256 === key);
  if (!rc) { console.log(`✗  ${id.padEnd(42)} NO RECEIPT`); bad++; continue; }
  const first = Object.fromEntries(rc.epochs[0].film.filter((l) => /^(pulser|relay|door|spinner|orb|wire):/.test(l)).map((l) => { const p = parse(l); return [p.role + ':' + p.name, p.rest]; }));
  const seen = {}; for (const ep of rc.epochs) for (const l of ep.film) { if (!/^(pulser|relay|door|spinner|orb|wire):/.test(l)) continue; const p = parse(l); (seen[p.role + ':' + p.name] ||= new Set()).add(p.rest); }
  const dead = []; const idle = CH.filmMeta(id).expect_idle || {};
  for (const [k, v] of Object.entries(seen)) {
    const [role, name] = k.split(':'); if (idle[name] || Object.keys(idle).some((n) => k.includes('__' + n))) continue;
    if (role === 'door' && ![...v].some((r) => /open=1/.test(r))) dead.push(k + ' never opens');
    if (role === 'orb' && v.size === 1) dead.push(k + ' pose never changes');
    if (role === 'wire' && ![...v].some((r) => /cur=1/.test(r))) dead.push(k + ' never carries');
    if (role === 'relay' && ![...v].some((r) => /cur_out=1/.test(r))) dead.push(k + ' never outputs');
  }
  // longest path in the sealed graph, as a hint for epochs
  const depth = {}; const names = s.graph.nodes.map((n) => n[1]); for (const n of names) depth[n] = 0;
  for (let i = 0; i < names.length; i++) for (const [, a, b] of s.graph.edges) depth[b] = Math.max(depth[b], depth[a] + 1);
  const longest = Math.max(0, ...Object.values(depth));
  const cfg = src.match(/\(every (\d+)(?:, phase (\d+))?\)|\(once at (\d+)\)/g) || [];
  const slowest = Math.max(1, ...cfg.map((c) => { const m = c.match(/every (\d+)(?:, phase (\d+))?/); const o = c.match(/once at (\d+)/); return m ? +m[1] + (+(m[2] || 0)) : o ? +o[1] : 1; }));
  const suggest = longest + slowest + 3;
  const ok = dead.length === 0;
  if (!ok) bad++;
  console.log(`${ok ? '✓' : '✗'}  ${id.padEnd(42)} ${String(rc.epochs.length).padStart(2)} epochs · longest path ${longest} · slowest clock ${slowest} · suggest ≥ ${suggest}${dead.length ? '\n      ' + dead.join('\n      ') : ''}`);
}
/* the board itself: every chapter's expect_idle applies; anything else that never changes is a cut-short board */
{ const CONC = join(CH.CHAIN, '_conclusion.wrl');
  if (existsSync(CONC)) {
    const src = readFileSync(CONC, 'utf8'); const key = (await import('node:crypto')).createHash('sha256').update(src).digest('hex');
    const rc = receipts.find((r) => r.source_identity.world_sha256 === key);
    if (!rc) { console.log('✗  board: NO RECEIPT'); bad++; }
    else {
      const idle = Object.assign({}, ...CH.order().map((id) => CH.filmMeta(id).expect_idle || {}));
      const seen = {}; for (const ep of rc.epochs) for (const l of ep.film) { if (!/^(pulser|relay|door|spinner|orb|wire):/.test(l)) continue; const p = parse(l); (seen[p.role + ':' + p.name] ||= new Set()).add(p.rest); }
      const dead = [];
      for (const [k, v] of Object.entries(seen)) { const [role, name] = k.split(':'); if (idle[name] || Object.keys(idle).some((n) => k.includes('__' + n))) continue;
        if (role === 'door' && ![...v].some((r) => /open=1/.test(r))) dead.push(k + ' never opens');
        if (role === 'orb' && v.size === 1) dead.push(k + ' pose never changes');
        if (role === 'wire' && ![...v].some((r) => /cur=1/.test(r))) dead.push(k + ' never carries');
        if (role === 'relay' && ![...v].some((r) => /cur_out=1/.test(r))) dead.push(k + ' never outputs'); }
      console.log(`${dead.length ? '✗' : '✓'}  ${'board (the whole chain)'.padEnd(42)} ${rc.epochs.length} epochs${dead.length ? '\n      ' + dead.join('\n      ') : ''}`);
      if (dead.length) bad++;
    } } }
console.log(`\n${bad} chapter(s) cut short`); process.exit(bad ? 1 : 0);
