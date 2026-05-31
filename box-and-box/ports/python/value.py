"""value.py - Invariant Arithmetic, faithful Python port (v0.2)

A Value is a PRODUCT OF MONOIDS across families. ``combine`` merges; ``chain``
composes along PULSE phases (partial - refuses a backward step); ``promote`` /
``reconcile`` / ``deliberate`` are endomorphisms; ``consume`` is the boolean gate.
These satisfy laws L1-L14 (see laws.py). Semantics mirror value.mjs exactly.

A Value is represented as a plain ``dict`` with the keys below. ``chain`` may
return ``{"error": ...}`` when a backward phase step is refused.
"""

PHASES = ["retrieve", "route", "act", "learn", "consolidate"]


def phase_idx(p):
    return PHASES.index(p) if p in PHASES else -1


def _uniq(arr):
    # preserve first-seen order, dedupe (set semantics for sigma)
    out = []
    seen = set()
    for x in arr:
        if x not in seen:
            seen.add(x)
            out.append(x)
    return out


def _first_non_null(a, b):
    return a if a is not None else b


def _clone(v):
    r = dict(v)
    r["sigma"] = list(v["sigma"])
    r["authority"] = list(v["authority"])
    r["audit"] = list(v["audit"])
    return r


def V0():
    """Identity element of the whole product monoid."""
    return {
        "n": 0,             # R under +
        "kappa": False,     # Bool under OR - cyclicity
        "beta": 1,          # [0,1] under min - persistence / confidence
        "sigma": [],        # Set<Tag> under union - derived conflicts
        "pi": None,         # Phase|None, first-non-null (NOT commutative)
        "iota": None,       # IdemKey, first-non-null
        "psi": None,        # Cadence, first-non-null
        "authority": [],    # List<Cap> under concat (free monoid)
        "denyDefault": True,  # Bool under AND
        "audit": [],        # List<Event> under concat (free monoid)
    }


def V(p=None):
    """Build a Value with sensible defaults."""
    p = p or {}
    v = V0()
    v.update(p)
    v["sigma"] = list(p.get("sigma", []))
    v["authority"] = list(p.get("authority", []))
    v["audit"] = list(p.get("audit", []))
    return v


def combine(a, b):
    """combine : Value x Value -> Value.

    Componentwise monoid op. NOT globally commutative (temporal & governance
    are first-non-null / concat), but associative with identity V0 => a monoid.
    """
    return {
        "n": a["n"] + b["n"],
        "kappa": a["kappa"] or b["kappa"],
        "beta": min(a["beta"], b["beta"]),
        "sigma": _uniq(list(a["sigma"]) + list(b["sigma"])),
        "pi": _first_non_null(a["pi"], b["pi"]),
        "iota": _first_non_null(a["iota"], b["iota"]),
        "psi": _first_non_null(a["psi"], b["psi"]),
        "authority": list(a["authority"]) + list(b["authority"]),
        "denyDefault": a["denyDefault"] and b["denyDefault"],
        "audit": list(a["audit"]) + list(b["audit"]),  # pure concat (free monoid)
    }


def chain(a, b):
    """chain : Value x Value -> Value (PARTIAL).

    Defined only when phase(a) <= phase(b) in PULSE order; a backward step is
    REFUSED (returns {"error": ...}). Composition moves the value to the exit
    (later) phase.
    """
    if a["pi"] is not None and b["pi"] is not None and phase_idx(a["pi"]) > phase_idx(b["pi"]):
        return {"error": f"pi-violation: cannot chain '{b['pi']}' after '{a['pi']}'"}
    r = combine(a, b)
    r["pi"] = _first_non_null(b["pi"], a["pi"])  # exit phase
    return r


def promote(v, evidence=None):
    """promote : Value x Evidence -> Value.

    beta-monotone endomorphism: promote(v).beta >= v.beta, always.
    """
    evidence = evidence or {}
    r = _clone(v)
    ev_beta = evidence.get("beta")
    ev_beta = ev_beta if ev_beta is not None else 0
    r["beta"] = max(v["beta"], ev_beta)
    return r


def reconcile(v, tags=None):
    """reconcile : Value x Set<Tag> -> Value.

    sigma-antitone, idempotent endomorphism: removes resolved conflict tags.
    """
    tags = tags or []
    drop = set(tags)
    r = _clone(v)
    r["sigma"] = [t for t in v["sigma"] if t not in drop]
    return r


def deliberate(v):
    """deliberate : Value -> Value.

    kappa-antitone, idempotent endomorphism: forces kappa = False.
    """
    r = _clone(v)
    r["kappa"] = False
    return r


def consume(v, req=None):
    """consume : Value x Requirements -> {ok, failures, value}.

    The correctness gate (a predicate, not an operation on Value).
    """
    req = req or {}
    failures = []
    if req.get("beta_min") is not None and v["beta"] < req["beta_min"]:
        failures.append({"family": "beta", "why": f"beta={_round(v['beta'])} < beta_min={req['beta_min']}"})
    if req.get("sigma_empty") and len(v["sigma"]) > 0:
        failures.append({"family": "sigma", "why": f"unresolved conflicts {{{', '.join(map(str, v['sigma']))}}}"})
    if req.get("acyclic") and v["kappa"]:
        failures.append({"family": "kappa", "why": "cyclic - self-reference detected"})
    if req.get("phase") and v["pi"] != req["phase"]:
        failures.append({"family": "pi", "why": f"phase {v['pi']} != required {req['phase']}"})
    if req.get("forward_from") and v["pi"] is not None and phase_idx(v["pi"]) < phase_idx(req["forward_from"]):
        failures.append({"family": "pi", "why": f"phase {v['pi']} precedes {req['forward_from']}"})
    if req.get("deny_default") == "must_allow" and v["denyDefault"] is True and req.get("authorized") is not True:
        failures.append({"family": "governance", "why": "deny_default with empty authority_path"})
    return {"ok": len(failures) == 0, "failures": failures, "value": v}


def _round(x):
    return round(x * 1000) / 1000


def digest(v):
    if v.get("error"):
        return f"_|_ {v['error']}"
    return "  ".join([
        f"n={_round(v['n'])}",
        f"kappa={v['kappa']}",
        f"beta={_round(v['beta'])}",
        f"sigma={{{','.join(map(str, v['sigma']))}}}",
        f"pi={v['pi'] if v['pi'] is not None else '.'}",
        f"auth=[{'.'.join(map(str, v['authority']))}]",
        f"deny={v['denyDefault']}",
    ])
