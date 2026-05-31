"""supervise.py - trajectory supervision (v0.4).

SAFETY specs (G not bad) extend the alethic floor across time - a runtime SHIELD.
LIVENESS specs (F goal, GF progress) extend the deontic OUGHT across time - a
temporal obligation that, unmet at the horizon, triggers contrary-to-duty
escalation. Mirrors supervise.mjs. Laws TB1-TB3.
"""

from temporal import progress, monitor, show


def TemporalSpec(id, formula, kind="safety", ctd=None):
    return {"id": id, "formula": formula, "kind": kind, "ctd": ctd}


def _first_vio(online):
    try:
        return online.index("vio")
    except ValueError:
        return None


def supervise(trajectory, specs):
    reports = []
    for spec in specs:
        m = monitor(spec["formula"], trajectory)
        r = {
            "id": spec["id"], "kind": spec["kind"], "formula": show(spec["formula"]),
            "verdict": m["verdict"], "online": m["online"], "decidedAt": m["decidedAt"],
            "violatedAt": _first_vio(m["online"]) if spec["kind"] == "safety" else None,
        }
        if spec["kind"] == "liveness" and m["verdict"] == "violated":
            r["escalation"] = spec.get("ctd") or "escalate-to-human"
            r["reason"] = (f"liveness obligation {show(spec['formula'])} unmet within horizon "
                           f"({len(trajectory)} steps)")
        reports.append(r)

    safety_violated = [r for r in reports if r["kind"] == "safety" and r["verdict"] == "violated"]
    liveness_unmet = [r for r in reports if r["kind"] == "liveness" and r["verdict"] == "violated"]
    return {
        "reports": reports,
        "safe": len(safety_violated) == 0,
        "escalation": ({"required": True,
                        "specs": [{"id": r["id"], "repair": r["escalation"], "reason": r["reason"]} for r in liveness_unmet]}
                       if liveness_unmet else None),
        "note": _note(safety_violated, liveness_unmet, len(trajectory)),
    }


def residual_of(formula, history):
    """the one-step shield: residual of a safety spec after a history of states."""
    f = formula
    for s in history:
        f = progress(f, s)
    return f


def guard(residual, next_state):
    return progress(residual, next_state)["t"] == "false"


def _note(safety, liveness, n):
    if safety:
        return (f"UNSAFE - \u201c{safety[0]['id']}\u201d violated at step {safety[0]['violatedAt']}; "
                f"the safety shield would have pruned that transition.")
    if liveness:
        return (f"safe, but a liveness obligation went unmet at the horizon ({n} steps) -> escalation: "
                + ", ".join(r["escalation"] for r in liveness) + ".")
    return f"all specs satisfied over {n} steps - safe and live."
