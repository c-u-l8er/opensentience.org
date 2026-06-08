"""evolution.py - the Evolution surface, faithful Python port (v0.1)

NOT a ninth rung. A BRIDGE that joins three existing rungs to decide whether a
POLICY may change for the better, and records the verdict on a tamper-evident
provenance chain:
  . reflexive (rung 5)  - MAY it change?  (entrenched floor is un-weakenable)
  . axiological (rung 2) - DID it improve? (non-regression over a guard set)
  . resource (rung 8)   - is the change WORTH its price? (Type-II)
It is to a policy what `govern` is to an action, one level up. Laws EV1-EV6.
Mirrors evolution.mjs.
"""

import json
import math

from reflexive import admissible, revise, policy_key
from resource import affords, worthwhile, spend, INFEASIBLE


# ---- content-addressed provenance (the observability substrate) -------------
def canon(x):
    """canonical JSON: object keys sorted, so the digest is key-order independent."""
    if x is None or not isinstance(x, (dict, list)):
        return json.dumps(x)
    if isinstance(x, list):
        return "[" + ",".join(canon(v) for v in x) + "]"
    return "{" + ",".join(json.dumps(k) + ":" + canon(x[k]) for k in sorted(x.keys())) + "}"


def hash(s):
    """FNV-1a 32-bit - pure, deterministic. (Tamper-evidence, not secrecy.)"""
    h = 0x811C9DC5
    for ch in s:
        h ^= ord(ch)
        h = (h * 0x01000193) & 0xFFFFFFFF
    return format(h, "08x")


def digest(obj):
    return hash(canon(obj))


GENESIS = "00000000"


def record(payload, prev=GENESIS):
    """A Record links a payload to its predecessor by content hash."""
    return {"id": hash(prev + canon(payload)), "prev": prev, "payload": payload}


def chain(payloads, prev=GENESIS):
    out = []
    p = prev
    for pl in payloads:
        r = record(pl, p)
        out.append(r)
        p = r["id"]
    return out


def verify(records, prev=GENESIS):
    p = prev
    for r in records:
        if r["prev"] != p:
            return {"ok": False, "reason": f"broken link at {r['id']}"}
        if record(r["payload"], r["prev"])["id"] != r["id"]:
            return {"ok": False, "reason": f"tampered payload at {r['id']}"}
        p = r["id"]
    return {"ok": True, "head": p, "length": len(records)}


# ---- the axiological guard --------------------------------------------------
def regresses(before=None, after=None, tol=1e-9):
    """non-regression (the L-E6 crux): no guard metric may drop below its prior value."""
    before = before or []
    after = after or []
    n = min(len(before), len(after))
    for i in range(n):
        if after[i] < before[i] - tol:
            return True
    return False


def delta(before=None, after=None):
    before = before or []
    after = after or []
    sb = sum(before)
    sa = sum(after)
    return math.floor((sa - sb) * 1e6 + 0.5) / 1e6  # mirror JS Math.round


# ---- the evolution verdict --------------------------------------------------
def evolve(policy, amendment, evidence=None):
    """evolve(policy, amendment, evidence) -> dict with decision/policy/ledger/certificate/record."""
    evidence = evidence or {}
    before = evidence.get("before", [])
    after = evidence.get("after", [])
    price = evidence.get("price", None)
    ledger = evidence.get("ledger", None)
    account = evidence.get("account", "self")
    resource = evidence.get("resource", "tokens")
    prev = evidence.get("prev", GENESIS)
    predicted = amendment.get("predict") if (amendment and amendment.get("predict") is not None) else None
    observed = delta(before, after)
    verified = None if predicted is None else observed >= predicted - 1e-9
    reg = regresses(before, after)

    ledger_after = ledger
    priced = False
    policy_after = policy
    adm = admissible(policy, amendment)

    if not adm["ok"]:
        decision = "reject"
        reason = f"reflexive: {adm['reason']}"  # floor wins
    elif reg:
        decision = "reject"
        reason = "axiological: a guard metric would regress"
    elif price is not None:  # Type-II pricing
        priced = True
        L = ledger or {"bal": {}, "kind": {}}
        if not affords(L, account, {resource: price}):
            decision = "escalate"
            reason = f"resource: cannot afford the change ({price} {resource})"
        elif not worthwhile(observed, price):
            decision = "reject"
            reason = f"resource: not worthwhile (\u0394 {observed} < {price})"
        else:
            charged = spend(L, account, resource, price)
            if charged is INFEASIBLE:
                decision = "escalate"
                reason = f"resource: cannot afford the change ({price} {resource})"
            else:
                decision = "accept"
                reason = f"priced: \u0394 {observed} \u2265 {price} {resource}"
                ledger_after = charged
    else:
        decision = "accept"
        reason = "admissible, non-regressing (unpriced)"

    if decision == "accept":
        r = revise(policy, amendment)
        if r["accepted"]:
            policy_after = r["policy"]
        else:
            decision = "reject"
            reason = f"reflexive: {r['reason']}"
            ledger_after = ledger  # reverse charge

    certificate = {
        "decision": decision,
        "reason": reason,
        "op": amendment["op"] if amendment else None,
        "target": (amendment["item"]["id"] if (amendment and amendment.get("item")) else (amendment.get("id") if amendment else None)),
        "predicted": predicted,
        "observed": observed,
        "verified": verified,
        "regressed": reg,
        "priced": priced,
        "price": price if price is not None else None,
        "policyBefore": policy_key(policy),
        "policyAfter": policy_key(policy_after),
        "rungs": ["reflexive", "axiological", "resource"],
    }
    return {
        "decision": decision,
        "reason": reason,
        "policy": policy_after,
        "ledger": ledger_after,
        "certificate": certificate,
        "record": record(certificate, prev),
    }
