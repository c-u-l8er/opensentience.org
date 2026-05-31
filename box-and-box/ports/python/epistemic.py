"""epistemic.py - Epistemic Arithmetic, faithful Python port (v0.6)

Knowledge and graded belief. A model is a universe of possible worlds plus, per
agent, an accessibility relation. Knowledge = truth in ALL accessible worlds.
  S5   (equivalence relation) -> KNOWLEDGE: factive (Kphi->phi), introspective.
  KD45 (serial+transitive+euclidean, NOT reflexive) -> BELIEF: consistent and
       introspective but NOT factive.
Learning is public announcement. Laws E1-E8, EB1-EB3. Mirrors epistemic.mjs.

A world is a dict; access[agent] is a callable world -> list-of-worlds. World
identity is by object identity (mirroring JS indexOf), so worlds must be the same
objects shared across the access closures - exactly as constructed in laws.py.
"""


def atom(name, pred):
    return {"t": "atom", "name": name, "pred": pred}


def not_(a):
    return {"t": "not", "a": a}


def and_(a, b):
    return {"t": "and", "a": a, "b": b}


def or_(a, b):
    return {"t": "or", "a": a, "b": b}


def implies(a, b):
    return {"t": "implies", "a": a, "b": b}


def holds(f, w):
    t = f["t"]
    if t == "atom":
        return bool(f["pred"](w))
    if t == "not":
        return not holds(f["a"], w)
    if t == "and":
        return holds(f["a"], w) and holds(f["b"], w)
    if t == "or":
        return holds(f["a"], w) or holds(f["b"], w)
    if t == "implies":
        return (not holds(f["a"], w)) or holds(f["b"], w)
    return False


def Model(worlds, actual, access):
    return {"worlds": worlds, "actual": actual, "access": access}


def knows_at(model, agent, w, f):
    acc = model["access"][agent](w)
    return len(acc) > 0 and all(holds(f, u) for u in acc)


def possible_at(model, agent, w, f):
    return any(holds(f, u) for u in model["access"][agent](w))  # not K not f


def believes_at(model, agent, w, f, theta=0.5):
    acc = model["access"][agent](w)
    if len(acc) == 0:
        return False
    return sum(1 for u in acc if holds(f, u)) / len(acc) >= theta


def knows(model, agent, f):
    return knows_at(model, agent, model["actual"], f)


def believes(model, agent, f, theta=0.5):
    return believes_at(model, agent, model["actual"], f, theta)


def knows_it_doesnt_know(model, agent, f):
    """The known-unknown (K not K phi): the kappa / 'deliberate' signal."""
    acc = model["access"][agent](model["actual"])
    return len(acc) > 0 and all(not knows_at(model, agent, u, f) for u in acc)


def route(model, agent, f):
    """Epistemic routing: act on what you know, deliberate on a detected gap."""
    if knows(model, agent, f):
        return "act"
    if knows_it_doesnt_know(model, agent, f):
        return "deliberate"
    return "uncertain"


def _identity_filter(seq, keep_objs):
    keep_ids = set(id(x) for x in keep_objs)
    return [u for u in seq if id(u) in keep_ids]


def announce(model, psi):
    """Learning = truthful public announcement: keep only worlds where psi holds."""
    worlds = [w for w in model["worlds"] if holds(psi, w)]
    old_access = model["access"]

    def make(a):
        return lambda w: _identity_filter(old_access[a](w), worlds)

    access = {a: make(a) for a in old_access.keys()}
    return Model(worlds, model["actual"], access)


def everyone(model, agents, f):
    return all(knows(model, a, f) for a in agents)


def common(model, agents, f):
    """Common knowledge: f holds in every world reachable from actual via union of access."""
    reach = [model["actual"]]
    reach_ids = {id(model["actual"])}
    stack = [model["actual"]]
    while stack:
        w = stack.pop()
        for a in agents:
            for u in model["access"][a](w):
                if id(u) not in reach_ids:
                    reach_ids.add(id(u))
                    reach.append(u)
                    stack.append(u)
    return all(holds(f, u) for u in reach)


def distributed(model, agents, f):
    """Distributed knowledge: pool information by intersecting accessible sets."""
    sets = [model["access"][a](model["actual"]) for a in agents]
    first = sets[0]
    inter = []
    for w in first:
        if all(any(id(w) == id(x) for x in s) for s in sets):
            inter.append(w)
    return len(inter) > 0 and all(holds(f, u) for u in inter)
