// examples/govern.mjs — the deontic layer doing three things two-layer ranking cannot.
// A regulated workflow: send a report. The data contains PII. The task needs the FULL
// report, so redaction is a lesser output, not a discharge of the consent duty.
import { V } from '../value.mjs';
import { Norm } from '../norm.mjs';
import { govern } from '../govern.mjs';

const ESCALATE_DPO = Norm({ id: 'escalate-to-DPO', modality: 'obligatory', priority: Infinity });
const norms = [
  // forbidden: transmit PII without consent
  Norm({ id: 'forbid-PII-transmit', modality: 'forbidden',  priority: 10, condition: (c) => c.transmitsPII && !c.hasConsent }),
  // obligatory (when PII present): the consent-obtaining path — with a CTD repair if it can't be met
  Norm({ id: 'oblige-get-consent',  modality: 'obligatory', priority: 8,  condition: (c) => c.containsPII && c.obtainsConsent, ctd: ESCALATE_DPO }),
  // explicit permission for the redacted path
  Norm({ id: 'permit-redacted',     modality: 'permitted',  priority: 1,  condition: (c) => c.redacted })
];

const feasible   = V({ pi: 'act', beta: 0.95, authority: ['cap:send'], denyDefault: false });
const infeasible = V({ pi: 'act', beta: 0.20, kappa: true, authority: [], denyDefault: true }); // consent service down

const A = () => ({ id: 'A · send_redacted',          value: feasible, utility: 6,  ctx: { redacted: true, containsPII: true, transmitsPII: false, hasConsent: false, obtainsConsent: false } });
const B = () => ({ id: 'B · send_with_PII',          value: feasible, utility: 12, ctx: { containsPII: true, transmitsPII: true, hasConsent: false, obtainsConsent: false } });
const C = (val) => ({ id: 'C · get_consent_then_send', value: val,    utility: 3,  ctx: { containsPII: true, transmitsPII: true, hasConsent: true,  obtainsConsent: true } });

const REQ = { beta_min: 0.9, acyclic: true };
const show = (title, cert) => {
  console.log('\n' + title + '\n  ' + '─'.repeat(70));
  if (cert.decision) console.log(`  ▸ decision: ${cert.decision}${cert.forcedByObligation ? '   [forced by obligation]' : ''}` + (cert.margin != null ? `   margin ${cert.margin}` : ''));
  else console.log(`  ▸ no action taken — ESCALATION required: ${cert.escalation.repair}`);
  if (cert.ranking.length) console.log('  ranking: ' + cert.ranking.map((r) => `${r.id.split(' ')[0]}(util ${r.score}, ${r.status})`).join('   '));
  cert.deonticallyVetoed.forEach((v) => console.log(`  ✗ forbidden: ${v.id}  by [${v.by.join(', ')}]  (overridable)`));
  cert.alethicallyVetoed.forEach((v) => console.log(`  ⟂ infeasible: ${v.id}  (floor: ${v.failures.map((f) => f.family).join(',')})`));
  console.log('  ' + cert.note);
};

console.log('\nDeontic governance · alethic ▸ deontic ▸ axiological');
// 1 — B scores highest but is FORBIDDEN; C is OBLIGATORY and feasible → forced over higher-scoring A
show('1 · PII present, consent service up', govern([A(), B(), C(feasible)], { req: REQ, norms }));
// 2 — the obligatory action C is alethically infeasible → duty cannot be met → CTD escalation (no silent fallback)
show('2 · PII present, consent service DOWN', govern([A(), B(), C(infeasible)], { req: REQ, norms }));
// 3 — no PII: every norm condition is false → pure gradient
show('3 · no PII (norms inert)', govern([
  { id: 'A · send_redacted', value: feasible, utility: 6, ctx: {} },
  { id: 'D · send_plain',    value: feasible, utility: 9, ctx: {} }
], { req: REQ, norms }));
console.log('');
