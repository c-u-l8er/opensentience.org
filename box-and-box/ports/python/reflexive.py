"""reflexive.py - Reflexive Arithmetic, faithful Python port (v0.5)

Norms that revise themselves. The object being revised is a Policy. Revision
follows AGM belief-revision discipline (success, consistency, minimal change) and
deontic norm-change principles (lex superior = priority, lex posterior = recency).
The capstone guarantee is ENTRENCHMENT: a constitutional core is immutable to
weakening. Laws R1-R8, RB1-RB3. Mirrors reflexive.mjs.
"""

from norm import STATUS  # noqa: F401 (parity with JS import)


def Policy(p=None):
    p = p or {}
    return {
        "norms": list(p.get("norms", [])),
        "specs": list(p.get("specs", [])),
        "entrenched": set(p.get("entrenched", [])),  # ids of the constitutional core
    }


def enact(item, authority="self", time=0):
    return {"op": "enact", "item": item, "authority": authority, "time": time}


def repeal(id, authority="self", time=0):
    return {"op": "repeal", "id": id, "authority": authority, "time": time}


def amend(id, item, authority="self", time=0):
    return {"op": "amend", "id": id, "item": item, "authority": authority, "time": time}


def _find(policy, _id):
    for n in policy["norms"]:
        if n["id"] == _id:
            return n
    for s in policy["specs"]:
        if s["id"] == _id:
            return s
    return None


def _is_norm(x):
    return bool(x) and ("modality" in x) and x.get("modality") is not None


def _conflicts(a, b):
    return (_is_norm(a) and _is_norm(b)
            and a.get("target") is not None and a.get("target") == b.get("target")
            and ((a["modality"] == "obligatory" and b["modality"] == "forbidden")
                 or (a["modality"] == "forbidden" and b["modality"] == "obligatory")))


def _dedupe(arr):
    # JS: Map keyed by id, last write wins, iteration in first-insertion order of keys.
    seen = {}
    for x in arr:
        seen[x["id"]] = x
    return list(seen.values())


def admissible(policy, am):
    """The reflexive guard: admissible only if it does not WEAKEN the entrenched core."""
    if am["op"] == "repeal":
        if am["id"] in policy["entrenched"]:
            return {"ok": False, "reason": f"\u201c{am['id']}\u201d is entrenched - cannot be repealed"}
        return {"ok": True}
    if am["op"] == "amend":
        if am["id"] not in policy["entrenched"]:
            return {"ok": True}
        cur = _find(policy, am["id"])
        nxt = am["item"]
        if not cur or not _is_norm(cur):
            return {"ok": False, "reason": f"\u201c{am['id']}\u201d is entrenched - cannot be amended"}
        stronger = (nxt["modality"] == cur["modality"]
                    and nxt.get("priority", 0) >= cur.get("priority", 0))
        return {"ok": True} if stronger else {"ok": False, "reason": f"amendment would weaken entrenched \u201c{am['id']}\u201d"}
    if am["op"] == "enact":
        if _is_norm(am["item"]):
            for _id in policy["entrenched"]:
                e = _find(policy, _id)
                if e and _conflicts(e, am["item"]) and am["item"].get("priority", 0) >= e.get("priority", 0):
                    return {"ok": False, "reason": f"enacted norm would override entrenched \u201c{_id}\u201d"}
        return {"ok": True}
    return {"ok": False, "reason": "unknown op"}


def arbitrate(norms):
    """Arbitrate same-target conflicts: lex superior (priority) then lex posterior (recency)."""
    overridden = []
    for a in norms:
        for b in norms:
            if a is b or not _conflicts(a, b):
                continue
            a_wins = (a.get("priority", 0) > b.get("priority", 0)
                      or (a.get("priority", 0) == b.get("priority", 0) and a.get("time", 0) > b.get("time", 0)))
            if a_wins and b["id"] not in overridden:
                overridden.append(b["id"])
    return {"norms": [n for n in norms if n["id"] not in overridden], "overridden": overridden}


def revise(policy, am):
    """The core operation: revise the policy by an amendment, if admissible."""
    adm = admissible(policy, am)
    if not adm["ok"]:
        return {"policy": policy, "accepted": False, "reason": adm["reason"], "changed": None, "overridden": []}
    nxt = Policy(policy)
    nxt["entrenched"] = set(policy["entrenched"])

    def stamp(x):
        r = dict(x)
        r["time"] = am.get("time", 0)
        r["authority"] = am["authority"]
        return r

    if am["op"] == "enact":
        if _is_norm(am["item"]):
            nxt["norms"].append(stamp(am["item"]))
        else:
            nxt["specs"].append(stamp(am["item"]))
    elif am["op"] == "repeal":
        nxt["norms"] = [n for n in nxt["norms"] if n["id"] != am["id"]]
        nxt["specs"] = [s for s in nxt["specs"] if s["id"] != am["id"]]
    elif am["op"] == "amend":
        nxt["norms"] = [stamp(am["item"]) if n["id"] == am["id"] else n for n in nxt["norms"]]
        nxt["specs"] = [stamp(am["item"]) if s["id"] == am["id"] else s for s in nxt["specs"]]
    nxt["norms"] = _dedupe(nxt["norms"])
    nxt["specs"] = _dedupe(nxt["specs"])
    arb = arbitrate(nxt["norms"])
    nxt["norms"] = arb["norms"]
    changed_id = am["item"]["id"] if am.get("item") else am.get("id")
    return {"policy": nxt, "accepted": True, "reason": f"{am['op']} \u201c{changed_id}\u201d accepted",
            "changed": am["op"], "overridden": arb["overridden"]}


def entrench(policy, _id):
    """Entrenching is monotone - add to the constitution, never remove."""
    nxt = Policy(policy)
    nxt["entrenched"] = set(policy["entrenched"])
    nxt["entrenched"].add(_id)
    return nxt


def policy_key(p):
    import json
    return json.dumps({
        "n": sorted([[x["id"], x["modality"], x.get("priority", 0)] for x in p["norms"]]),
        "s": sorted([x["id"] for x in p["specs"]]),
        "e": sorted(list(p["entrenched"])),
    }, separators=(",", ":"))


def stabilize(policy, proposals, max_rounds=12):
    """Reflective stability: apply proposals until the policy stops changing."""
    cur = policy
    log = []
    for rnd in range(max_rounds):
        changed = False
        for am in proposals:
            r = revise(cur, am)
            log.append({"round": rnd, "op": am["op"], "accepted": r["accepted"], "reason": r["reason"]})
            if r["accepted"] and policy_key(r["policy"]) != policy_key(cur):
                cur = r["policy"]
                changed = True
        if not changed:
            return {"policy": cur, "rounds": rnd + 1, "stable": True, "log": log}
    return {"policy": cur, "rounds": max_rounds, "stable": False, "log": log}


def digest(p):
    return f"{len(p['norms'])} norms . {len(p['specs'])} specs . {len(p['entrenched'])} entrenched"
