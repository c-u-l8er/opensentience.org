// epistemic.mjs — Epistemic Arithmetic, faithful runtime (v0.6)
// The sixth rung: knowledge and graded belief. A model is a universe of possible worlds
// plus, per agent, an accessibility relation. Knowledge = truth in ALL accessible worlds.
//   · S5  (equivalence relation: reflexive+transitive+symmetric) → KNOWLEDGE: factive (Kφ→φ)
//          and introspective (Kφ→KKφ, ¬Kφ→K¬Kφ).
//   · KD45 (serial+transitive+euclidean, NOT reflexive)          → BELIEF: consistent and
//          introspective, but NOT factive — you can believe falsehoods.
// Learning is public announcement: eliminate the worlds inconsistent with the evidence, so
// knowledge grows monotonically — the continual-learning connection. Multi-agent: common
// knowledge is the fixpoint of "everyone knows". Laws E1–E8. Grounded in Hintikka 1962;
// Fagin/Halpern/Moses/Vardi 1995; Plaza 1989 (public announcement); Aumann 1976 (common knowledge).

// ---- propositional formulas over worlds (atoms are predicates on a world) ----
export const atom = (name, pred) => ({ t: 'atom', name, pred });
export const not = (a) => ({ t: 'not', a });
export const and = (a, b) => ({ t: 'and', a, b });
export const or = (a, b) => ({ t: 'or', a, b });
export const implies = (a, b) => ({ t: 'implies', a, b });
export function holds(f, w) {
  switch (f.t) {
    case 'atom': return !!f.pred(w);
    case 'not': return !holds(f.a, w);
    case 'and': return holds(f.a, w) && holds(f.b, w);
    case 'or': return holds(f.a, w) || holds(f.b, w);
    case 'implies': return !holds(f.a, w) || holds(f.b, w);
    default: return false;
  }
}

// ---- model: worlds + actual world + per-agent accessibility (access[agent] : World → World[]) ----
export const Model = ({ worlds, actual, access }) => ({ worlds, actual, access });

// knowledge at a world: truth in every accessible world (empty access ⇒ not known)
export function knowsAt(model, agent, w, f) {
  const acc = model.access[agent](w);
  return acc.length > 0 && acc.every((u) => holds(f, u));
}
export const possibleAt = (model, agent, w, f) => model.access[agent](w).some((u) => holds(f, u)); // ¬K¬f
// graded belief: fraction of accessible worlds where f holds ≥ θ  (the β / confidence connection)
export function believesAt(model, agent, w, f, theta = 0.5) {
  const acc = model.access[agent](w);
  if (acc.length === 0) return false;
  return acc.filter((u) => holds(f, u)).length / acc.length >= theta;
}

export const knows = (model, agent, f) => knowsAt(model, agent, model.actual, f);
export const believes = (model, agent, f, theta) => believesAt(model, agent, model.actual, f, theta);
// the known-unknown (K¬Kφ): the agent knows it does not know f — the κ / "deliberate" signal
export function knowsItDoesntKnow(model, agent, f) {
  const acc = model.access[agent](model.actual);
  return acc.length > 0 && acc.every((u) => !knowsAt(model, agent, u, f));
}
// epistemic routing: act on what you know, deliberate on a detected gap
export const route = (model, agent, f) => knows(model, agent, f) ? 'act' : knowsItDoesntKnow(model, agent, f) ? 'deliberate' : 'uncertain';

// ---- learning = truthful public announcement: keep only worlds where ψ holds ----
export function announce(model, psi) {
  const worlds = model.worlds.filter((w) => holds(psi, w));
  const keep = new Set(worlds);
  const access = {};
  for (const a of Object.keys(model.access)) access[a] = (w) => model.access[a](w).filter((u) => keep.has(u));
  return Model({ worlds, actual: model.actual, access });
}

// ---- multi-agent ----
export const everyone = (model, agents, f) => agents.every((a) => knows(model, a, f));
// common knowledge: f holds in every world reachable from `actual` via the union of agents' access
export function common(model, agents, f) {
  const reach = new Set([model.actual]); const stack = [model.actual];
  while (stack.length) {
    const w = stack.pop();
    for (const a of agents) for (const u of model.access[a](w)) if (!reach.has(u)) { reach.add(u); stack.push(u); }
  }
  return [...reach].every((u) => holds(f, u));
}
// distributed knowledge: pool information by intersecting accessible sets — the group knows more than any member
export function distributed(model, agents, f) {
  const sets = agents.map((a) => new Set(model.access[a](model.actual)));
  const inter = [...sets[0]].filter((w) => sets.every((s) => s.has(w)));
  return inter.length > 0 && inter.every((u) => holds(f, u));
}

export default {
  atom, not, and, or, implies, holds, Model, knowsAt, possibleAt, believesAt,
  knows, believes, knowsItDoesntKnow, route, announce, everyone, common, distributed
};
