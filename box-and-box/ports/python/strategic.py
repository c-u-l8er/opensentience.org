"""strategic.py - Strategic / Coalitional Arithmetic, faithful Python port (v0.7)

Over a CONCURRENT GAME STRUCTURE - states, agents, a set of moves per agent per
state, and a transition that consumes one move from every agent - "coalition C
can ensure phi" means C has a joint strategy such that, whatever the others do,
phi results. One step is effectivity [C]O phi; over time, <<C>>[]phi (maintain -
greatest fixpoint) and <<C>><>phi (reach - least fixpoint), both built from the
CONTROLLABLE PREDECESSOR. Laws S1-S8, SB1-SB3. Mirrors strategic.mjs.

States are dicts compared by object identity (mirroring JS .includes / indexOf).
"""


def atom(name, pred):
    return {"t": "atom", "name": name, "pred": pred}


def not_(a):
    return {"t": "not", "a": a}


def and_(a, b):
    return {"t": "and", "a": a, "b": b}


def or_(a, b):
    return {"t": "or", "a": a, "b": b}


def holds(f, s):
    t = f["t"]
    if t == "atom":
        return bool(f["pred"](s))
    if t == "not":
        return not holds(f["a"], s)
    if t == "and":
        return holds(f["a"], s) and holds(f["b"], s)
    if t == "or":
        return holds(f["a"], s) or holds(f["b"], s)
    return False


TOP = or_(atom("\u22a4", lambda s: True), not_(atom("\u22a4", lambda s: True)))
BOT = and_(atom("\u22a5", lambda s: False), not_(atom("\u22a5", lambda s: False)))


def Game(states, agents, moves, delta):
    return {"states": states, "agents": agents, "moves": moves, "delta": delta}


def others(model, C):
    return [a for a in model["agents"] if a not in C]


def _product(model, agents, state):
    """Cartesian product of agents' move sets at a state -> list of {agent: moveId}."""
    acc = [{}]
    for a in agents:
        ms = model["moves"](a, state)
        nx = []
        for p in acc:
            for m in ms:
                d = dict(p)
                d[a] = m
                nx.append(d)
        acc = nx
    return acc


def _contains(seq, s):
    return any(s is x for x in seq)


def _force1(model, C, state, in_set):
    """Controllable predecessor: exists moves for C, forall moves for the rest, succ in set."""
    cm = _product(model, C, state)
    om = _product(model, others(model, C), state)
    for c in cm:
        ok = True
        for o in om:
            jm = dict(c)
            jm.update(o)
            if not in_set(model["delta"](state, jm)):
                ok = False
                break
        if ok:
            return True
    return False


def effectivity(model, C, state, f):
    return _force1(model, C, state, lambda s: holds(f, s))  # [C]O f at a state


def can_ensure_next(model, C, f):
    return [q for q in model["states"] if effectivity(model, C, q, f)]


def can_maintain(model, C, f):
    """<<C>>[]f - greatest fixpoint nuW.(f & Pre_C W)."""
    W = [s for s in model["states"] if holds(f, s)]
    while True:
        cur = W
        W2 = [q for q in cur if _force1(model, C, q, lambda s: _contains(cur, s))]
        if len(W2) == len(W):
            return W2
        W = W2


def can_reach(model, C, f):
    """<<C>><>f - least fixpoint muW.(f | Pre_C W)."""
    W = [s for s in model["states"] if holds(f, s)]
    while True:
        cur = W
        add = [q for q in model["states"]
               if not _contains(cur, q) and _force1(model, C, q, lambda s: _contains(cur, s))]
        if not add:
            return W
        W = W + add


def can_until(model, C, f, g):
    """<<C>>(f U g) - least fixpoint muW.(g | (f & Pre_C W))."""
    W = [s for s in model["states"] if holds(g, s)]
    while True:
        cur = W
        add = [q for q in model["states"]
               if not _contains(cur, q) and holds(f, q) and _force1(model, C, q, lambda s: _contains(cur, s))]
        if not add:
            return W
        W = W + add


def can_ensure(model, C, f, q):
    return _contains(can_reach(model, C, f), q)  # <<C>><>f from q


def can_keep(model, C, f, q):
    return _contains(can_maintain(model, C, f), q)  # <<C>>[]f from q


def oblige(model, C, f, q):
    """ought-implies-can: dischargeable only if C can ensure it."""
    return "discharge" if can_ensure(model, C, f, q) else "escalate"


def executable(model, C, f, q, common_knowledge):
    """coordination is executable only with ability AND common knowledge of the plan."""
    return can_ensure(model, C, f, q) and bool(common_knowledge)
