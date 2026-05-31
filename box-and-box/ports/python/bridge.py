"""bridge.py - the floor-then-gradient bridge (laws B1-B3).

consume() gates each option on its invariant Value; a vetoed option gets score
zero (which annihilates *), and select() ranks only the feasible survivors. No
heuristic utility, however large, can resurrect a vetoed option. Mirrors bridge.mjs.
"""

from value import consume
from score import SEMIRINGS, NEG_INF


def _round(x):
    return round(x * 1000) / 1000


def _fin(x):
    return 0 if x == NEG_INF else _round(x)


def gated_score(option, req, semiring="tropical"):
    """An OPTION couples a full invariant Value with a heuristic utility:
    {id, value: <Value>, utility: <number>}. ``req`` is applied to the value.
    """
    S = SEMIRINGS.get(semiring, SEMIRINGS["tropical"])
    verdict = consume(option["value"], req)
    util = option.get("utility")
    util = util if util is not None else S["one"]
    return {"score": util if verdict["ok"] else S["zero"], "verdict": verdict}  # B1


def select(options, req=None, semiring="tropical"):
    req = req or {}
    S = SEMIRINGS.get(semiring, SEMIRINGS["tropical"])

    evaluated = []
    for o in options:
        g = gated_score(o, req, semiring)
        raw = o.get("utility")
        raw = raw if raw is not None else S["one"]
        evaluated.append({
            "id": o["id"], "raw": raw, "score": g["score"],
            "ok": g["verdict"]["ok"], "failures": g["verdict"]["failures"],
        })

    feasible = sorted([e for e in evaluated if e["ok"]], key=lambda e: e["score"], reverse=True)  # B2
    vetoed = [e for e in evaluated if not e["ok"]]
    chosen = feasible[0] if feasible else None
    margin = (feasible[0]["score"] - feasible[1]["score"]) if len(feasible) > 1 else None

    # honesty signal: would a vetoed option have won on raw utility if floor were off?
    top_raw = sorted(list(evaluated), key=lambda e: e["raw"], reverse=True)[0] if evaluated else None
    floor_bit = None
    if chosen and top_raw and top_raw["id"] != chosen["id"] and not top_raw["ok"]:
        floor_bit = {"id": top_raw["id"], "raw": _round(top_raw["raw"])}

    if not chosen:
        note = "No feasible option - the floor refused the entire set."
    elif floor_bit:
        fb = next(v for v in vetoed if v["id"] == floor_bit["id"])
        note = (f"\u201c{floor_bit['id']}\u201d had the highest raw utility ({floor_bit['raw']}) "
                f"but was vetoed: "
                + "; ".join(f"{f['family']}: {f['why']}" for f in fb["failures"])
                + f". zero annihilated it; the gradient selected \u201c{chosen['id']}\u201d.")
    elif vetoed:
        note = f"{len(vetoed)} option(s) vetoed and excluded from ranking."
    else:
        note = "All options feasible; selection by the gradient alone."

    return {
        "decision": chosen["id"] if chosen else None,
        "margin": None if margin is None else _round(margin),
        "semiring": semiring,
        "ranking": [{"id": e["id"], "score": _fin(e["score"])} for e in feasible],
        "vetoed": [{"id": e["id"], "gatedScore": 0, "rawWouldBe": _round(e["raw"]), "failures": e["failures"]} for e in vetoed],
        "floorBit": floor_bit,
        "floorEnforced": len(vetoed),
        "note": note,
    }
