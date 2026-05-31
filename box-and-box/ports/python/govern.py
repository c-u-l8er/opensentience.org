"""govern.py - the full three-modality decision (v0.3).

Precedence: ALETHIC (can't be violated) > DEONTIC (ought, violable but triggers
consequences) > AXIOLOGICAL (preference).
  1. consume() - the alethic floor. Infeasible -> annihilated, gone.
  2. norms     - the deontic layer over the survivors.
  3. select()  - the axiological gradient ranks whatever remains admissible.
Mirrors govern.mjs.
"""

from value import consume
from score import SEMIRINGS
from norm import adjudicate_status, resolve, escalate, STATUS


def _round(x):
    return round(x * 1000) / 1000


def _has(e, _id):
    return any(c["id"] == _id for c in e["contributors"])


def govern(options, req=None, norms=None, semiring="tropical"):
    req = req or {}
    norms = norms or []
    S = SEMIRINGS.get(semiring, SEMIRINGS["tropical"])

    ev = []
    for o in options:
        feas = consume(o["value"], req)
        v = resolve(adjudicate_status(o.get("ctx") or {}, norms))
        util = o.get("utility")
        util = util if util is not None else S["one"]
        ev.append({
            "id": o["id"], "utility": util, "ctx": o.get("ctx") or {}, "value": o["value"],
            "feasible": feas["ok"], "feasFail": feas["failures"],
            "status": v["resolved"], "overridden": v["overridden"], "contributors": v["contributors"],
        })

    alethically_vetoed = [{"id": e["id"], "failures": e["feasFail"]} for e in ev if not e["feasible"]]
    survivors = [e for e in ev if e["feasible"]]

    deontically_vetoed = [{
        "id": e["id"], "status": e["status"], "overridable": True,
        "by": [c["id"] for c in e["contributors"] if c["modality"] == "forbidden"],
        "overridden": e["overridden"],
    } for e in survivors if e["status"] == STATUS.FORBIDDEN]

    admissible = [e for e in survivors if e["status"] in (STATUS.OPTIONAL, STATUS.OBLIGATORY)]
    obligatory_feasible = [e for e in admissible if e["status"] == STATUS.OBLIGATORY]

    # contrary-to-duty escalation
    obliged_but_blocked = [e for e in ev if e["status"] == STATUS.OBLIGATORY and not e["feasible"]]
    escalation = None
    if obliged_but_blocked and len(obligatory_feasible) == 0:
        blocked = obliged_but_blocked[0]
        nrm = next((n for n in norms if n["modality"] == "obligatory" and _has(blocked, n["id"])), None)
        if nrm is None:
            nrm = next((n for n in norms if n["modality"] == "obligatory"), None)
        esc = escalate(nrm, blocked["ctx"])
        escalation = {
            "required": True,
            "repair": esc["repair"]["id"] if esc["repair"] else "escalate-to-human",
            "reason": esc["reason"], "blockedOption": blocked["id"], "blockedBy": blocked["feasFail"],
        }
    conflicted = [e for e in survivors if e["status"] == STATUS.CONFLICT]
    if not escalation and conflicted:
        escalation = {"required": True, "repair": "escalate-to-human",
                      "reason": f"unresolved conflict on {conflicted[0]['id']}",
                      "blockedOption": conflicted[0]["id"], "blockedBy": []}

    pool = sorted(list(obligatory_feasible if obligatory_feasible else admissible),
                  key=lambda e: e["utility"], reverse=True)
    chosen = None if escalation else (pool[0] if pool else None)
    margin = _round(pool[0]["utility"] - pool[1]["utility"]) if len(pool) > 1 else None
    ranking = [{"id": e["id"], "score": _round(e["utility"]), "status": e["status"]} for e in pool]

    if escalation:
        if escalation["blockedOption"] and escalation["blockedBy"]:
            note = (f"Obligation cannot be met - \u201c{escalation['blockedOption']}\u201d is infeasible ("
                    + "; ".join(f"{f['family']}: {f['why']}" for f in escalation["blockedBy"])
                    + f"). Contrary-to-duty: {escalation['reason']}.")
        else:
            note = f"Escalation required - {escalation['reason']}."
    elif chosen and obligatory_feasible:
        note = f"\u201c{chosen['id']}\u201d is obligatory (in force) and selected - it overrides higher-scoring permitted options."
    elif chosen and deontically_vetoed:
        note = f"{len(deontically_vetoed)} option(s) forbidden by norms and excluded (overridable). The gradient selected \u201c{chosen['id']}\u201d."
    elif chosen:
        note = f"No norms in force; the gradient selected \u201c{chosen['id']}\u201d."
    else:
        note = "No admissible option."

    return {
        "decision": chosen["id"] if chosen else None,
        "forcedByObligation": bool(chosen and obligatory_feasible),
        "escalation": escalation,
        "margin": margin, "semiring": semiring, "ranking": ranking,
        "deonticallyVetoed": deontically_vetoed, "alethicallyVetoed": alethically_vetoed,
        "layers": ["alethic", "deontic", "axiological"],
        "note": note,
    }
