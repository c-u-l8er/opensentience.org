// strategic.mjs — Strategic / Coalitional Arithmetic, faithful runtime (v0.7)
// The seventh and last rung: ability. Over a CONCURRENT GAME STRUCTURE — states, agents,
// a set of moves per agent per state, and a transition that consumes one move from every
// agent — "coalition C can ensure φ" means C has a joint strategy such that, whatever the
// other agents do, φ results. One step is effectivity [C]◯φ; over time, ⟨⟨C⟩⟩□φ (maintain —
// a greatest fixpoint) and ⟨⟨C⟩⟩◊φ (reach — a least fixpoint), both built from the
// CONTROLLABLE PREDECESSOR. Laws S1–S8. Grounded in Pauly 2002 (coalition logic) and
// Alur, Henzinger & Kupferman 2002 (Alternating-time Temporal Logic).

// ---- propositional formulas over states ----
export const atom = (name, pred) => ({ t: 'atom', name, pred });
export const not = (a) => ({ t: 'not', a });
export const and = (a, b) => ({ t: 'and', a, b });
export const or = (a, b) => ({ t: 'or', a, b });
export function holds(f, s) {
  switch (f.t) {
    case 'atom': return !!f.pred(s);
    case 'not': return !holds(f.a, s);
    case 'and': return holds(f.a, s) && holds(f.b, s);
    case 'or': return holds(f.a, s) || holds(f.b, s);
    default: return false;
  }
}
export const TOP = or(atom('⊤', () => true), not(atom('⊤', () => true)));
export const BOT = and(atom('⊥', () => false), not(atom('⊥', () => false)));

// ---- game: states, agents, moves(agent,state)→moveId[], delta(state,{agent:moveId})→state ----
export const Game = ({ states, agents, moves, delta }) => ({ states, agents, moves, delta });
export const others = (model, C) => model.agents.filter((a) => !C.includes(a));

// cartesian product of the agents' move sets at a state → list of {agent: moveId}
function product(model, agents, state) {
  let acc = [{}];
  for (const a of agents) { const ms = model.moves(a, state); const nx = [];
    for (const p of acc) for (const m of ms) nx.push({ ...p, [a]: m }); acc = nx; }
  return acc;
}
// controllable predecessor at a state: ∃ moves for C, ∀ moves for the rest, successor ∈ set
function force1(model, C, state, inSet) {
  const cm = product(model, C, state), om = product(model, others(model, C), state);
  return cm.some((c) => om.every((o) => inSet(model.delta(state, { ...c, ...o }))));
}

// ---- the operators ----
export const effectivity = (model, C, state, f) => force1(model, C, state, (s) => holds(f, s)); // [C]◯f at a state
export const canEnsureNext = (model, C, f) => model.states.filter((q) => effectivity(model, C, q, f));

// ⟨⟨C⟩⟩□f — greatest fixpoint νW.(f ∧ Pre_C W): the states from which C can keep f forever
export function canMaintain(model, C, f) {
  const phi = (s) => holds(f, s); let W = model.states.filter(phi);
  for (;;) { const inW = (s) => W.includes(s); const W2 = W.filter((q) => force1(model, C, q, inW));
    if (W2.length === W.length) return W2; W = W2; }
}
// ⟨⟨C⟩⟩◊f — least fixpoint μW.(f ∨ Pre_C W): the states from which C can drive the system to f
export function canReach(model, C, f) {
  const phi = (s) => holds(f, s); let W = model.states.filter(phi);
  for (;;) { const inW = (s) => W.includes(s);
    const add = model.states.filter((q) => !inW(q) && force1(model, C, q, inW));
    if (!add.length) return W; W = W.concat(add); }
}
// ⟨⟨C⟩⟩(f U g) — least fixpoint μW.(g ∨ (f ∧ Pre_C W))
export function canUntil(model, C, f, g) {
  const phi = (s) => holds(f, s), psi = (s) => holds(g, s); let W = model.states.filter(psi);
  for (;;) { const inW = (s) => W.includes(s);
    const add = model.states.filter((q) => !inW(q) && phi(q) && force1(model, C, q, inW));
    if (!add.length) return W; W = W.concat(add); }
}

// convenience: ability from a particular state
export const canEnsure = (model, C, f, q) => canReach(model, C, f).includes(q); // ⟨⟨C⟩⟩◊f from q
export const canKeep = (model, C, f, q) => canMaintain(model, C, f).includes(q); // ⟨⟨C⟩⟩□f from q
// ought-implies-can: an obligation to ensure f is dischargeable only if C can ensure it
export const oblige = (model, C, f, q) => canEnsure(model, C, f, q) ? 'discharge' : 'escalate';
// coordination is executable only with ability AND common knowledge of the plan (the epistemic link)
export const executable = (model, C, f, q, commonKnowledge) => canEnsure(model, C, f, q) && !!commonKnowledge;

export default {
  atom, not, and, or, holds, TOP, BOT, Game, others, effectivity, canEnsureNext,
  canMaintain, canReach, canUntil, canEnsure, canKeep, oblige, executable
};
