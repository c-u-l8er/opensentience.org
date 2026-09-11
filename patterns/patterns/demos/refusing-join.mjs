/* demos/refusing-join.mjs — ILLUSTRATION, NOT EVIDENCE.
 * The evidence on the page is the staged compose-laws suite, run byte-identical through /witness/run.js.
 * This module only makes one refusal visible: it imports the SAME staged compose.mjs / value.mjs the suite
 * imports (same URL, same build stamp), builds an undeclared producer and a narrow consumer, and prints
 * what composePipe returns. If the algebra changes, this demo may stop illustrating; the suite is what decides.
 */
export async function run(sink, { stamp }) {
  const base = '/witness/src/AmpersandBoxDesign/box-and-box/';
  const C = await import(base + 'compose.mjs?v=' + stamp);
  const { V } = await import(base + 'value.mjs?v=' + stamp);
  const cert = { subject: { kind: 'weave-ir', hash: 'demo' }, analyzer: { name: 'demo', version: '0' },
                 verdict: { certified: true, costClass: 'poly', ealDepth: 1 }, policy: { resourceDecision: 'allow', reason: 'demo' } };
  const brick = (id, pi, contract) => C.Brick({ id, contract, value: V({ pi, beta: 0.5, kappa: false, sigma: [] }), cost: cert, q: { confidence: 0.9, cost: 1, latency: 1 }, utility: 1 });
  const line = (t, cls) => { const d = document.createElement('div'); d.className = 'wline ' + (cls || ''); d.textContent = t; sink.appendChild(d); };
  sink.innerHTML = '';
  const undeclared = brick('producer-undeclared', 'retrieve');                                              // declares nothing
  const narrow     = brick('consumer-T1', 'act', { accepts_from: C.TYPES('T1'), feeds_into: C.ANY });
  const declared   = brick('producer-T1', 'retrieve', { accepts_from: C.ANY, feeds_into: C.TYPES('T1') });
  const anyIn      = brick('consumer-any', 'act', { accepts_from: C.ANY, feeds_into: C.ANY });

  line('1) undeclared producer |> consumer that accepts only T1', 'group');
  const r1 = C.composePipe(undeclared, narrow);
  line(C.isZero(r1) ? `✗ REFUSED → 0̲  — refusal: ${r1.refusal}` : `✓ composed (unexpected: MISSING would have been treated as UNIVERSAL)`, C.isZero(r1) ? 'bad' : 'warn');

  line('2) producer declaring feeds_into=[T1] |> the same consumer', 'group');
  const r2 = C.composePipe(declared, narrow);
  line(C.isZero(r2) ? `✗ REFUSED → 0̲  — refusal: ${r2.refusal}` : `✓ composed → ${r2.id}  (declared narrow into narrow: admitted)`, C.isZero(r2) ? 'warn' : 'good');

  line('3) the same declared producer |> a consumer that accepts ANY', 'group');
  const r3 = C.composePipe(declared, anyIn);
  line(C.isZero(r3) ? `✗ REFUSED → 0̲  — refusal: ${r3.refusal}` : `✓ composed → ${r3.id}  (narrow into ANY: admitted — CD2 part a)`, C.isZero(r3) ? 'warn' : 'good');

  line('4) a producer declaring feeds_into=ANY |> the T1-only consumer', 'group');
  const anyOut = brick('producer-any', 'retrieve', { accepts_from: C.ANY, feeds_into: C.ANY });
  const r4 = C.composePipe(anyOut, narrow);
  line(C.isZero(r4) ? `✗ REFUSED → 0̲  — refusal: ${r4.refusal}  (ANY is directional — CD2 part b)` : `✓ composed (unexpected under the subset rule)`, C.isZero(r4) ? 'bad' : 'warn');
  line('');
  line('Same modules, same stamp, as the suite above. Refusal is a returned value with a reason, not an exception.', 'muted');
}
