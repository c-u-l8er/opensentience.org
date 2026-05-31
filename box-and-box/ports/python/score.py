"""score.py - Heuristic Arithmetic, faithful Python port (v0.2)

A Score lives in a SEMIRING (K, +, *, 0, 1): + aggregates alternatives, *
chains evidence. vote/rollout/reinforce/dominate/anneal/softmax satisfy H1-H13.
The semiring zero annihilates * - the algebraic root of the veto used by the
bridge (see bridge.py). Semantics mirror score.mjs exactly.
"""

import math

NEG_INF = float("-inf")


def logsumexp(a, b):
    if a == NEG_INF:
        return b
    if b == NEG_INF:
        return a
    m = max(a, b)
    return m + math.log(math.exp(a - m) + math.exp(b - m))


def _trop_otimes(a, b):
    return NEG_INF if (a == NEG_INF or b == NEG_INF) else a + b


def _log_otimes(a, b):
    return NEG_INF if (a == NEG_INF or b == NEG_INF) else a + b


SEMIRINGS = {
    "tropical": {
        "label": "(max, +)",
        "oplus": lambda a, b: max(a, b),
        "otimes": _trop_otimes,
        "zero": NEG_INF,
        "one": 0,
        "idempotent": True,
    },
    "probability": {
        "label": "(+, x)",
        "oplus": lambda a, b: a + b,
        "otimes": lambda a, b: a * b,
        "zero": 0,
        "one": 1,
        "idempotent": False,
    },
    "log": {
        "label": "(logsumexp, +)",
        "oplus": logsumexp,
        "otimes": _log_otimes,
        "zero": NEG_INF,
        "one": 0,
        "idempotent": False,
    },
}


def Score(p=None):
    """A Score carries a utility plus the soft analogues of the invariant families."""
    p = p or {}
    return {
        "u": p.get("u", 0),          # semiring carrier
        "w": p.get("w", 1),          # [0,1] trust in this heuristic (x, cf. beta's min)
        "eps": p.get("eps", 0),      # [0,1] exploration (anneal -> 0)
        "gamma": p.get("gamma", 1),  # (0,1] discount (soft order, cf. pi's hard order)
        "visits": p.get("visits", 0),  # N under +
        "sources": list(p.get("sources", [])),
    }


def vote(a, b, semiring="tropical"):
    """vote : aggregate alternatives (+ side)."""
    S = SEMIRINGS.get(semiring, SEMIRINGS["tropical"])
    return Score({
        "u": S["oplus"](a["u"], b["u"]),
        "w": a["w"] * b["w"],                # independent trust dilutes (x)
        "eps": max(a["eps"], b["eps"]),
        "gamma": min(a["gamma"], b["gamma"]),
        "visits": a["visits"] + b["visits"],
        "sources": list(a["sources"]) + list(b["sources"]),
    })


def rollout(scores, gamma=0.9, semiring="tropical"):
    """rollout : chain evidence along a path, gamma-discounted (* side).

    score(path) = *_t (gamma^t * u_t). zero anywhere annihilates the whole path.
    """
    S = SEMIRINGS.get(semiring, SEMIRINGS["tropical"])
    acc = S["one"]
    for t, s in enumerate(scores):
        discounted = S["zero"] if s["u"] == S["zero"] else (gamma ** t) * s["u"]
        acc = S["otimes"](acc, discounted)
    return acc


def reinforce(u, target, eta=0.3):
    """reinforce : eta-contraction toward a target."""
    return (1 - eta) * u + eta * target


def dominate(opts):
    """dominate : Pareto-prune (idempotent, antitone).

    opts: [{id, obj:[...]}] higher-is-better; returns the non-dominated front.
    """
    def dominated(a):
        for b in opts:
            if b["id"] != a["id"] \
               and all(bj >= a["obj"][i] for i, bj in enumerate(b["obj"])) \
               and any(bj > a["obj"][i] for i, bj in enumerate(b["obj"])):
                return True
        return False
    return [a for a in opts if not dominated(a)]


def anneal(s):
    """anneal : eps -> 0 (idempotent)."""
    r = Score(s)
    r["eps"] = 0
    return r


def softmax(us, T=1):
    """softmax (shift-invariant; T->0 => argmax)."""
    m = max(us)
    ex = [math.exp((u - m) / T) for u in us]
    z = sum(ex)
    return [e / z for e in ex]
