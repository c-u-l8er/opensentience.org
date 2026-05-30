// examples/app-research-assistant.mjs — a small APP built on box-and-box. A research assistant
// that, per query, decides whether to search (paying tokens) before answering, refuses to reveal
// PII, must cite when it makes a claim, and ranks the rest by usefulness — all as ONE governed
// decision over a base policy. Composes epistemic (known-unknown), resource (budget + the Type-II
// "is searching worth it?" call), and deontic governance (alethic ▸ deontic ▸ axiological).
import { V } from '../value.mjs';
import { Norm } from '../norm.mjs';
import { govern } from '../govern.mjs';
import { Ledger, balance, feasible, repair } from '../resource.mjs';
import { atom, Model, knowsItDoesntKnow } from '../epistemic.mjs';

const norms = [
  Norm({ id: 'forbid-PII',  modality: 'forbidden',  priority: 10, condition: (c) => c.revealsPII }),
  Norm({ id: 'oblige-cite', modality: 'obligatory', priority: 6,  condition: (c) => c.makesClaim && c.cites })
];
const REQ = { beta_min: 0.8, acyclic: true };
const SEARCH_COST = 2;
const ANS = atom('ans', (w) => w.ans);

// the agent's knowledge as a possible-worlds model: if it knows, only the true world is possible
const knowledge = (knowsAnswer) => { const t = { ans: true }, f = { ans: false }; const worlds = knowsAnswer ? [t] : [t, f];
  return Model({ worlds, actual: t, access: { me: () => worlds } }); };

function assist({ query, knowsAnswer, importance }, ledger) {
  console.log(`\n• "${query}"  (importance ${importance}, ${balance(ledger, 'me', 'tokens')} tokens)`);
  const m = knowledge(knowsAnswer); let L = ledger, searched = false;

  // 1 · epistemic detects the gap; resource decides (Type II) whether closing it is worth the tokens
  if (knowsItDoesntKnow(m, 'me', ANS)) {
    const r = repair(L, 'me', { resource: 'tokens', value: importance, cost: SEARCH_COST });
    if (r.decision === 'invoke') { L = r.L; searched = true; console.log(`  known-unknown → search (value ${importance} ≥ cost ${SEARCH_COST}); ${balance(L, 'me', 'tokens')} tokens left`); }
    else if (r.decision === 'skip') console.log(`  known-unknown → skip search (value ${importance} < cost ${SEARCH_COST}); answer from best guess`);
    else { console.log(`  known-unknown → can't afford to search → escalate to a human`); return L; }
  } else console.log(`  the answer is already known — no search needed`);

  // 2 · the base policy's candidate actions (confidence reflects whether we now know the answer)
  const conf = (knowsAnswer || searched) ? 0.95 : 0.85; // best-guess answers still clear the floor for low stakes
  const reply = V({ pi: 'act', beta: conf, authority: ['cap:reply'], denyDefault: false });
  const options = [
    { id: 'answer_cited', value: reply, utility: 8,  ctx: { makesClaim: true, cites: true,  revealsPII: false } },
    { id: 'answer_raw',   value: reply, utility: 9,  ctx: { makesClaim: true, cites: false, revealsPII: false } }, // higher utility, but uncited
    { id: 'answer_w_PII', value: reply, utility: 12, ctx: { makesClaim: true, cites: true,  revealsPII: true } }    // most "useful", forbidden
  ];

  // 3 · govern: the cite duty forces the cited answer over the higher-utility raw one; PII is vetoed
  const g = govern(options, { req: REQ, norms });
  const vetoed = (g.deonticallyVetoed || []).map((v) => v.id).concat((g.alethicallyVetoed || []).map((v) => v.id));
  console.log(`  → ${g.decision || 'no action (escalate)'}` + (vetoed.length ? `   ✗ ${vetoed.join(', ')}` : ''));
  return L;
}

console.log('Research assistant · governed by box-and-box');
let wallet = Ledger({ kind: { tokens: 'depletable' }, bal: { me: { tokens: 3 } } });
wallet = assist({ query: 'What is our refund policy?',           knowsAnswer: true,  importance: 5 }, wallet); // known → answer
wallet = assist({ query: 'Trivia: capital of some tiny region?', knowsAnswer: false, importance: 1 }, wallet); // affordable but not worth it → skip
wallet = assist({ query: 'What did Q3 revenue come in at?',      knowsAnswer: false, importance: 6 }, wallet); // worth searching → invoke
wallet = assist({ query: 'Summarize the new contract clause.',   knowsAnswer: false, importance: 9 }, wallet); // worth it, but out of budget → escalate
console.log('\nOne budget, one knowledge model, one set of norms — every reply is a governed, audited decision.\n');
