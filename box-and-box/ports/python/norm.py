"""norm.py - Deontic Arithmetic, faithful Python port (v0.3)

A deontic status lives in a diamond lattice:

         CONFLICT             (over-constrained: obligatory AND forbidden)
        /        \\
  OBLIGATORY   FORBIDDEN      (incomparable middles)
        \\        /
         OPTIONAL             (permitted, no constraint - the identity)

join = least upper bound (commutative, associative, idempotent monoid; identity
OPTIONAL, absorbing CONFLICT). resolve clears a conflict by priority. detach is
factual detachment and PARTIAL for CTD repairs. comply is the gate; escalate
produces the CTD repair. Laws D1-D9. Mirrors norm.mjs.
"""

import math


class STATUS:
    OPTIONAL = "optional"
    OBLIGATORY = "obligatory"
    FORBIDDEN = "forbidden"
    CONFLICT = "conflict"


_RANK = {"optional": 0, "obligatory": 1, "forbidden": 1, "conflict": 2}


def rank(s):
    return _RANK[s]


_MOD2STATUS = {
    "obligatory": STATUS.OBLIGATORY,
    "forbidden": STATUS.FORBIDDEN,
    "permitted": STATUS.OPTIONAL,
}


def join(a, b):
    """join : least upper bound on the diamond lattice."""
    if a == b:
        return a
    if a == STATUS.OPTIONAL:
        return b
    if b == STATUS.OPTIONAL:
        return a
    if a == STATUS.CONFLICT or b == STATUS.CONFLICT:
        return STATUS.CONFLICT
    return STATUS.CONFLICT  # {obligatory} join {forbidden}


def Norm(p=None):
    """A conditional rule of one modality, with a priority and optional CTD repair."""
    p = p or {}
    return {
        "id": p.get("id", "norm"),
        "modality": p.get("modality", "permitted"),  # obligatory | forbidden | permitted
        "condition": p.get("condition", (lambda ctx: True)),  # ctx -> bool
        "priority": p.get("priority", 0),
        "ctd": p.get("ctd", None),  # Norm - contrary-to-duty repair
        "target": p.get("target", None),
    }


def _safe_cond(n, ctx):
    try:
        return bool(n["condition"](ctx))
    except Exception:
        return False


def adjudicate_status(ctx, norms):
    """Accrue every applicable norm's status into a single verdict (join)."""
    status = STATUS.OPTIONAL
    contributors = []
    for n in norms:
        if not _safe_cond(n, ctx):
            continue
        contributors.append({"id": n["id"], "modality": n["modality"], "priority": n["priority"]})
        status = join(status, _MOD2STATUS[n["modality"]])
    return {"status": status, "contributors": contributors}


def resolve(verdict):
    """resolve : clear a CONFLICT by priority (idempotent; identity on non-conflict)."""
    if verdict["status"] != STATUS.CONFLICT:
        r = dict(verdict)
        r["resolved"] = verdict["status"]
        r["overridden"] = []
        r["note"] = None
        return r
    ob = [c for c in verdict["contributors"] if c["modality"] == "obligatory"]
    fb = [c for c in verdict["contributors"] if c["modality"] == "forbidden"]
    max_ob = max([-math.inf] + [c["priority"] for c in ob])
    max_fb = max([-math.inf] + [c["priority"] for c in fb])
    if max_ob == max_fb:
        r = dict(verdict)
        r["resolved"] = STATUS.CONFLICT
        r["overridden"] = []
        r["note"] = "deadlock: equal priority -> escalate"
        return r
    winner_obligatory = max_ob > max_fb
    loser = [c["id"] for c in (fb if winner_obligatory else ob)]
    r = dict(verdict)
    r["status"] = STATUS.OBLIGATORY if winner_obligatory else STATUS.FORBIDDEN  # makes resolve idempotent
    r["resolved"] = STATUS.OBLIGATORY if winner_obligatory else STATUS.FORBIDDEN
    r["overridden"] = loser
    r["note"] = (f"{'obligatory' if winner_obligatory else 'forbidden'} "
                 f"(p{max(max_ob, max_fb)}) overrides [{', '.join(loser)}]")
    return r


def detach(norm, ctx, violated=False):
    """detach : factual detachment. A CTD repair detaches ONLY after the primary
    is violated (partial - like invariant chain)."""
    return {"inForce": _safe_cond(norm, ctx), "repair": (norm["ctd"] if (violated and norm["ctd"]) else None)}


def comply(status, intend):
    """comply : the gate. Does performing (or omitting) the action satisfy its status?"""
    violations = []
    if status == STATUS.FORBIDDEN and intend:
        violations.append("performing a forbidden action")
    if status == STATUS.OBLIGATORY and not intend:
        violations.append("omitting an obligatory action")
    if status == STATUS.CONFLICT:
        violations.append("unresolved normative conflict")
    return {"ok": len(violations) == 0, "violations": violations}


def escalate(norm, ctx):
    """escalate : produce the contrary-to-duty repair obligation now in force."""
    if norm and norm.get("ctd"):
        return {"repair": norm["ctd"], "reason": f"CTD: {norm['id']} violated -> {norm['ctd']['id']} in force"}
    return {
        "repair": Norm({"id": "escalate-to-human", "modality": "obligatory", "priority": math.inf}),
        "reason": f"{norm['id'] if norm else 'obligation'} violated, no CTD -> default escalation",
    }


def status_digest(v):
    res = v.get("resolved", v["status"])
    ov = v.get("overridden")
    suffix = f" (overrode {','.join(ov)})" if ov else ""
    return f"{res}{suffix}"
