"""resource.py - Resource Arithmetic, faithful Python port (v0.8)

A Ledger is a CLOSED double-entry system - value is never created from nothing;
every spend is a transfer to a sink, every refill a transfer from a treasury - so
CONSERVATION holds structurally. Depletable resources obey linear logic (used
once); resources marked `reusable` (linear logic's `!` modality) can be used
freely without depletion. The novel bridge PRICES the repair operators. Laws
C1-C8, CB1-CB3. Mirrors resource.mjs.
"""

SINK = "#sink"
TREASURY = "#treasury"
FREE = "free"


class _Infeasible:
    __slots__ = ()

    def __repr__(self):
        return "INFEASIBLE"


INFEASIBLE = _Infeasible()


def _clone(L):
    return {
        "bal": {a: dict(r) for a, r in L["bal"].items()},
        "kind": dict(L["kind"]),
    }


def Ledger(bal=None, kind=None):
    return {"bal": bal if bal is not None else {}, "kind": kind if kind is not None else {}}


def balance(L, acct, res):
    return (L["bal"].get(acct) or {}).get(res, 0)


def total(L, res):
    return sum(r.get(res, 0) for r in L["bal"].values())


def transfer(L, res, frm, to, amt):
    """The one primitive: move amt of res between two accounts. Conserves the total."""
    if amt < 0 or balance(L, frm, res) < amt:
        return INFEASIBLE  # no overdraft (the affine floor)
    M = _clone(L)
    M["bal"].setdefault(frm, {})
    M["bal"].setdefault(to, {})
    M["bal"][frm][res] = M["bal"][frm].get(res, 0) - amt
    M["bal"][to][res] = M["bal"][to].get(res, 0) + amt
    return M


def spend(L, acct, res, amt):
    return transfer(L, res, acct, SINK, amt)  # consume -> sink


def refill(L, acct, res, amt):
    return transfer(L, res, TREASURY, acct, amt)  # accrue <- treasury


def affords(L, acct, cost):
    return all(balance(L, acct, res) >= amt for res, amt in cost.items())


def feasible(L, acct, cost):
    return affords(L, acct, cost)  # the alethic gate; else the action carries zero


def use(L, acct, res):
    """reusable (`!`) vs depletable: use depletes a depletable, never a reusable one."""
    if balance(L, acct, res) < 1:
        return {"ok": False, "L": L}
    if L["kind"].get(res) == "reusable":
        return {"ok": True, "L": L}  # copy freely - no depletion
    return {"ok": True, "L": spend(L, acct, res, 1)}  # linear - consumed exactly once


def allocate(L, task, amt):
    """continual learning: capacity is a CONSERVED resource (free -> committed)."""
    return transfer(L, "capacity", FREE, "task:" + task, amt)


def consolidate(L, task, mind="mind"):
    """mint reusable knowledge."""
    M = _clone(L)
    M["kind"]["know:" + task] = "reusable"
    M["bal"].setdefault(mind, {})
    M["bal"][mind]["know:" + task] = 1
    return M


def forget(L, task, mind="mind"):
    """reclaim capacity - only by releasing the knowledge."""
    amt = balance(L, "task:" + task, "capacity")
    M = transfer(L, "capacity", "task:" + task, FREE, amt)
    if M is INFEASIBLE:
        M = _clone(L)
    if M["bal"].get(mind) is not None:
        M["bal"][mind]["know:" + task] = 0  # no-free-reclaim tradeoff
    return M


def worthwhile(value, cost):
    return value >= cost


def repair(L, acct, resource="tokens", value=0, cost=0):
    """PRICING THE REPAIRS (Type II rationality): invoke only if affordable AND worth it."""
    if not affords(L, acct, {resource: cost}):
        return {"decision": "cannot-afford", "L": L}
    if not worthwhile(value, cost):
        return {"decision": "skip", "L": L}  # act on the current best
    return {"decision": "invoke", "L": spend(L, acct, resource, cost)}  # pay to deliberate / escalate
