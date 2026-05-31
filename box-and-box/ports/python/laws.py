#!/usr/bin/env python3
"""laws.py - run: ``python3 laws.py``

Property tests proving the Python port is the real algebra: the same 97 laws as
the JavaScript conformance reference (test/laws.mjs), 2000 trials/law across 15
suites (L1-14, H1-13, B1-3, D1-9, DB1-3, T1-8, TB1-3, R1-8, RB1-3, E1-8, EB1-3,
S1-8, SB1-3, C1-8, CB1-3). Exits 0 iff all 97 pass.
"""

import math
import random
import sys

from value import V, V0, PHASES, phase_idx, combine, chain, promote, reconcile, deliberate, consume
from score import SEMIRINGS, NEG_INF, Score, vote, rollout, reinforce, dominate, anneal, softmax
from bridge import gated_score, select
from norm import STATUS, rank, join, Norm, adjudicate_status, resolve, detach, comply, escalate
from govern import govern
import temporal as T
from supervise import TemporalSpec, supervise, residual_of, guard
from reflexive import Policy, enact, repeal, amend, admissible, arbitrate, revise, entrench, stabilize, policy_key
import epistemic as EP
import strategic as ST
import resource as RES


# ---------------- helpers (mirror laws.mjs) ----------------
def rnd(a, b):
    return a + random.random() * (b - a)


def approx(a, b, t=1e-7):
    if a == b:
        return True
    return math.isfinite(a) and math.isfinite(b) and abs(a - b) <= t * (1 + abs(a) + abs(b))


def set_eq(a, b):
    return len(a) == len(b) and sorted(map(str, a)) == sorted(map(str, b))


def arr_eq(a, b):
    return len(a) == len(b) and all(x == b[i] for i, x in enumerate(a))


def sample(arr):
    return [x for x in arr if random.random() < 0.5]


def randint(n):
    return int(random.random() * n)


def round3(x):
    return round(x * 1000) / 1000


def fixed(x, d):
    # mimic JS +x.toFixed(d): round half away to d places then back to float
    return float(f"{x:.{d}f}")


def rand_v():
    ph = [None] + list(PHASES)
    return V({
        "n": fixed(rnd(0, 10), 2),
        "kappa": random.random() < 0.5,
        "beta": fixed(random.random(), 3),
        "sigma": sample(["x", "y", "z", "w"]),
        "pi": ph[randint(len(ph))],
        "authority": ["c" + str(randint(3))] if random.random() < 0.5 else [],
        "denyDefault": random.random() < 0.5,
        "audit": ["e" + str(randint(3))] if random.random() < 0.5 else [],
    })


def val_eq(a, b):
    return (approx(a["n"], b["n"]) and a["kappa"] == b["kappa"] and approx(a["beta"], b["beta"])
            and set_eq(a["sigma"], b["sigma"]) and a["pi"] == b["pi"] and a["iota"] == b["iota"]
            and a["psi"] == b["psi"] and arr_eq(a["authority"], b["authority"])
            and a["denyDefault"] == b["denyDefault"] and arr_eq(a["audit"], b["audit"]))


def forward_triple():
    idxs = sorted([randint(len(PHASES)) for _ in range(3)])
    out = []
    for i in idxs:
        v = rand_v()
        v["pi"] = PHASES[i]
        out.append(v)
    return out


def trial(n, body):
    for i in range(n):
        r = body()
        if r is not True:
            return {"pass": False, "cex": r, "at": i + 1}
    return {"pass": True, "at": n, "cex": None}


# ---------------- INVARIANT LAWS ----------------
def _l1(n):
    def b():
        a, bb, c = rand_v(), rand_v(), rand_v()
        return True if val_eq(combine(combine(a, bb), c), combine(a, combine(bb, c))) else "assoc"
    return trial(n, b)


def _l2(n):
    def b():
        a = rand_v()
        return True if val_eq(combine(a, V0()), a) and val_eq(combine(V0(), a), a) else "identity"
    return trial(n, b)


def _l3(n):
    def b():
        a, bb = rand_v(), rand_v()
        x, y = combine(a, bb), combine(bb, a)
        return True if (approx(x["n"], y["n"]) and x["kappa"] == y["kappa"] and approx(x["beta"], y["beta"])
                        and set_eq(x["sigma"], y["sigma"]) and x["denyDefault"] == y["denyDefault"]) else "comm"
    return trial(n, b)


def _l4_body():
    a = rand_v()
    return True if approx(combine(a, a)["beta"], a["beta"]) else "beta-idem"


def _l5(n):
    def b():
        a = rand_v()
        return True if set_eq(combine(a, a)["sigma"], a["sigma"]) else "sigma-idem"
    return trial(n, b)


def _l6(n):
    def b():
        a = rand_v()
        return True if combine(a, a)["kappa"] == a["kappa"] else "kappa-idem"
    return trial(n, b)


def _l7(n):
    def b():
        a = rand_v()
        ev = {"beta": random.random()}
        return True if promote(a, ev)["beta"] >= a["beta"] - 1e-9 else "monotone"
    return trial(n, b)


def _l8(n):
    def b():
        a = rand_v()
        tags = sample(["x", "y", "z", "w"])
        r = reconcile(a, tags)
        sub = all(t in a["sigma"] for t in r["sigma"])
        return True if (sub and set_eq(reconcile(r, tags)["sigma"], r["sigma"])) else "reconcile"
    return trial(n, b)


def _l9(n):
    def b():
        a = rand_v()
        d = deliberate(a)
        return True if (d["kappa"] is False and deliberate(d)["kappa"] is False) else "deliberate"
    return trial(n, b)


def _l10(n):
    def b():
        a, bb = rand_v(), rand_v()
        if a["pi"] is None or bb["pi"] is None:
            return True
        r = chain(a, bb)
        if phase_idx(a["pi"]) > phase_idx(bb["pi"]):
            return True if r.get("error") else "should refuse"
        return "should allow" if r.get("error") else True
    return trial(n, b)


def _l11(n):
    def b():
        a, bb, c = forward_triple()
        l = chain(chain(a, bb), c)
        r = chain(a, chain(bb, c))
        if l.get("error") or r.get("error"):
            return True  # vacuous
        return True if val_eq(l, r) else "chain-assoc"
    return trial(n, b)


def _l12(n):
    def b():
        a, bb = rand_v(), rand_v()
        ev = {"beta": random.random()}
        return True if approx(promote(combine(a, bb), ev)["beta"],
                              combine(promote(a, ev), promote(bb, ev))["beta"]) else "beta-distrib"
    return trial(n, b)


def _l13(n):
    def b():
        a = rand_v()
        thr = 0.5
        ok = consume(a, {"beta_min": thr})["ok"]
        return True if ok == (a["beta"] >= thr) else "gate"
    return trial(n, b)


def _l14(n):
    def b():
        a = rand_v()
        return True if combine(a, a)["denyDefault"] == a["denyDefault"] else "and-idem"
    return trial(n, b)


INV = [
    ["L1", "combine associative", _l1],
    ["L2", "combine identity V0", _l2],
    ["L3", "commutative families (n,k,b,s,deny)", _l3],
    ["L4", "beta idempotent under min", lambda n: trial(n, _l4_body)],
    ["L5", "sigma idempotent under union", _l5],
    ["L6", "kappa idempotent under OR", _l6],
    ["L7", "promote beta-monotone", _l7],
    ["L8", "reconcile antitone + idempotent", _l8],
    ["L9", "deliberate kappa->false + idempotent", _l9],
    ["L10", "chain refuses a backward phase", _l10],
    ["L11", "chain associative where defined", _l11],
    ["L12", "promote distributes over combine on beta", _l12],
    ["L13", "consume gate (beta_min)", _l13],
    ["L14", "deny_default idempotent under AND", _l14],
]


# ---------------- HEURISTIC LAWS ----------------
_S = SEMIRINGS["tropical"]


def _gen():
    if _S is SEMIRINGS["probability"]:
        r = random.random()
        if r < 0.06:
            return 0
        if r < 0.12:
            return 1
        return fixed(rnd(0, 4), 4)
    r = random.random()
    if r < 0.06:
        return _S["zero"]
    if r < 0.12:
        return _S["one"]
    return fixed(rnd(-12, 12), 4)


def rand_score():
    return Score({"u": _gen(), "w": rnd(0, 1), "eps": rnd(0, 1), "gamma": rnd(0.5, 1)})


def rand_opt_obj():
    return {"id": randint(10 ** 9), "obj": [fixed(rnd(0, 5), 2), fixed(rnd(0, 5), 2)]}


def _h1(n):
    def b():
        a, bb, c = _gen(), _gen(), _gen()
        if not approx(_S["oplus"](a, bb), _S["oplus"](bb, a)):
            return "comm"
        if not approx(_S["oplus"](_S["oplus"](a, bb), c), _S["oplus"](a, _S["oplus"](bb, c))):
            return "assoc"
        return True if approx(_S["oplus"](a, _S["zero"]), a) else "id"
    return trial(n, b)


def _h2(n):
    def b():
        a, bb, c = _gen(), _gen(), _gen()
        if not approx(_S["otimes"](_S["otimes"](a, bb), c), _S["otimes"](a, _S["otimes"](bb, c))):
            return "assoc"
        return True if (approx(_S["otimes"](a, _S["one"]), a) and approx(_S["otimes"](_S["one"], a), a)) else "id"
    return trial(n, b)


def _h3(n):
    def b():
        a, bb, c = _gen(), _gen(), _gen()
        return True if approx(_S["otimes"](a, _S["oplus"](bb, c)),
                              _S["oplus"](_S["otimes"](a, bb), _S["otimes"](a, c))) else "distL"
    return trial(n, b)


def _h4(n):
    def b():
        a, bb, c = _gen(), _gen(), _gen()
        return True if approx(_S["otimes"](_S["oplus"](a, bb), c),
                              _S["oplus"](_S["otimes"](a, c), _S["otimes"](bb, c))) else "distR"
    return trial(n, b)


def _h5(n):
    def b():
        a = _gen()
        return True if (_S["otimes"](_S["zero"], a) == _S["zero"] and _S["otimes"](a, _S["zero"]) == _S["zero"]) else "annih"
    return trial(n, b)


def _h6(n):
    def b():
        a = _gen()
        return True if approx(_S["oplus"](a, a), a) else "idem [expected off tropical]"
    return trial(n, b)


def _h7(n):
    def b():
        a, bb = _gen(), _gen()
        if a > bb:
            a, bb = bb, a
        c = _gen()
        return True if (_S["otimes"](a, c) <= _S["otimes"](bb, c) or approx(_S["otimes"](a, c), _S["otimes"](bb, c))) else "mono"
    return trial(n, b)


def _h8(n):
    def b():
        u, t, e = rnd(-10, 10), rnd(-10, 10), rnd(0.05, 0.95)
        got = abs(reinforce(u, t, e) - t)
        want = (1 - e) * abs(u - t)
        return True if (approx(got, want, 1e-6) and got <= abs(u - t) + 1e-9) else "contr"
    return trial(n, b)


def _h9(n):
    def b():
        g = rnd(0.1, 0.95)
        d = 3
        u = [rnd(-8, 8) for _ in range(d)]
        v = [rnd(-8, 8) for _ in range(d)]
        r = [rnd(-5, 5) for _ in range(d)]
        Bu = [r[i] + g * x for i, x in enumerate(u)]
        Bv = [r[i] + g * x for i, x in enumerate(v)]
        num = max(abs(x - Bv[i]) for i, x in enumerate(Bu))
        den = max(abs(x - v[i]) for i, x in enumerate(u))
        return True if approx(num, g * den, 1e-6) else "gamma-contr"
    return trial(n, b)


def _h10(n):
    def b():
        k = 4 + randint(4)
        opts = [rand_opt_obj() for _ in range(k)]
        p1 = dominate(opts)
        p2 = dominate(p1)
        if sorted(o["id"] for o in p1) != sorted(o["id"] for o in p2):
            return "not-idem"
        for a in p1:
            for bb in p1:
                if a["id"] != bb["id"] and all(bj >= a["obj"][i] for i, bj in enumerate(bb["obj"])) \
                   and any(bj > a["obj"][i] for i, bj in enumerate(bb["obj"])):
                    return "dominated survivor"
        return True
    return trial(n, b)


def _h11(n):
    def b():
        s = rand_score()
        a1 = anneal(s)
        a2 = anneal(a1)
        return True if (a1["eps"] == 0 and a2["eps"] == 0) else "eps"
    return trial(n, b)


def _h12(n):
    def b():
        k, t = 4, rnd(0.3, 2)
        u = [rnd(-6, 6) for _ in range(k)]
        c = rnd(-5, 5)
        a = softmax(u, t)
        bb = softmax([x + c for x in u], t)
        return True if all(approx(x, bb[i], 1e-6) for i, x in enumerate(a)) else "shift"
    return trial(n, b)


def _h13(n):
    def b():
        k = 5
        u = [fixed(rnd(-6, 6), 3) for _ in range(k)]
        sm = softmax(u, 0.01)
        return True if sm.index(max(sm)) == u.index(max(u)) else "argmax"
    return trial(n, b)


HEUR = [
    ["H1", "+ commutative monoid", _h1],
    ["H2", "* monoid", _h2],
    ["H3", "left distributivity", _h3],
    ["H4", "right distributivity", _h4],
    ["H5", "zero annihilates *", _h5],
    ["H6", "+ idempotence (dioid only)", _h6],
    ["H7", "* monotone in order", _h7],
    ["H8", "reinforce eta-contraction", _h8],
    ["H9", "rollout gamma-contraction", _h9],
    ["H10", "dominate idempotent + Pareto", _h10],
    ["H11", "anneal eps->0 idempotent", _h11],
    ["H12", "softmax shift-invariant", _h12],
    ["H13", "T->0 collapses to argmax", _h13],
]


# ---------------- BRIDGE LAWS ----------------
def rand_option():
    return {"id": "opt" + str(randint(10 ** 6)),
            "value": V({"beta": fixed(random.random(), 3), "kappa": random.random() < 0.4, "sigma": sample(["c"])}),
            "utility": fixed(rnd(0, 10), 3)}


REQ = {"beta_min": 0.5, "acyclic": True}


def _b1(n):
    def b():
        o = rand_option()
        g = gated_score(o, REQ, "tropical")
        if consume(o["value"], REQ)["ok"]:
            return True
        return True if g["score"] == NEG_INF else "not annihilated"
    return trial(n, b)


def _b2(n):
    def b():
        opts = [rand_option() for _ in range(2 + randint(4))]
        r = select(opts, REQ, "tropical")
        if r["decision"] is None:
            return True
        feas = [o for o in opts if consume(o["value"], REQ)["ok"]]
        chosen_opt = next((o for o in feas if o["id"] == r["decision"]), None)
        if chosen_opt is None:
            return "chose infeasible"
        chosen_u = chosen_opt["utility"]
        return True if all(o["utility"] <= chosen_u + 1e-9 for o in feas) else "feasible outranks chosen"
    return trial(n, b)


def _b3(n):
    def b():
        opts = [rand_option() for _ in range(3)]
        i = randint(3)
        for j, o in enumerate(opts):
            if j == i:
                o["value"] = V({"beta": 0.99, "kappa": False})
            else:
                o["value"] = V({"beta": 0.99, "kappa": True})
                o["utility"] = 999
        r = select(opts, REQ, "tropical")
        return True if r["decision"] == opts[i]["id"] else "not unique feasible"
    return trial(n, b)


BR = [
    ["B1", "veto => score zero", _b1],
    ["B2", "select ranks within feasible", _b2],
    ["B3", "conservativity: one feasible => chosen", _b3],
]


# ---------------- DEONTIC LAWS ----------------
STATI = [STATUS.OPTIONAL, STATUS.OBLIGATORY, STATUS.FORBIDDEN, STATUS.CONFLICT]


def rand_status():
    return STATI[randint(len(STATI))]


def _d1(n):
    def b():
        a, bb, c = rand_status(), rand_status(), rand_status()
        if join(a, bb) != join(bb, a):
            return "comm"
        return True if join(join(a, bb), c) == join(a, join(bb, c)) else "assoc"
    return trial(n, b)


def _d2(n):
    def b():
        a = rand_status()
        return True if (join(a, STATUS.OPTIONAL) == a and join(a, a) == a) else "id/idem"
    return trial(n, b)


def _d3(n):
    return trial(n, lambda: True if join(STATUS.OBLIGATORY, STATUS.FORBIDDEN) == STATUS.CONFLICT else "no-conflict")


def _d4(n):
    def b():
        a, bb = rand_status(), rand_status()
        return True if (rank(join(a, bb)) >= rank(a) and rank(join(a, bb)) >= rank(bb)) else "mono"
    return trial(n, b)


def _d5(n):
    def b():
        a = rand_status()
        return True if join(STATUS.CONFLICT, a) == STATUS.CONFLICT else "absorb"
    return trial(n, b)


def _d6(n):
    def b():
        v = {"status": STATUS.CONFLICT,
             "contributors": [{"id": "o", "modality": "obligatory", "priority": 5},
                              {"id": "f", "modality": "forbidden", "priority": 2}]}
        r1 = resolve(v)
        if r1["resolved"] == STATUS.CONFLICT:
            return "did-not-clear"
        r2 = resolve(r1)
        return True if r2["resolved"] == r1["resolved"] else "not-idempotent"
    return trial(n, b)


def _d7(n):
    def b():
        c = random.random() < 0.5
        nm = Norm({"modality": "obligatory", "condition": (lambda ctx: c)})
        return True if detach(nm, {})["inForce"] == c else "detach"
    return trial(n, b)


def _d8(n):
    def b():
        nm = Norm({"id": "p", "modality": "obligatory", "ctd": Norm({"id": "r", "modality": "obligatory"})})
        return True if (detach(nm, {}, violated=False)["repair"] is None
                        and detach(nm, {}, violated=True)["repair"]["id"] == "r") else "ctd"
    return trial(n, b)


def _d9(n):
    def b():
        return True if (comply(STATUS.OBLIGATORY, True)["ok"]
                        and not comply(STATUS.FORBIDDEN, True)["ok"]
                        and not comply(STATUS.OBLIGATORY, False)["ok"]) else "comply"
    return trial(n, b)


DEON = [
    ["D1", "join commutative + associative", _d1],
    ["D2", "join identity OPTIONAL + idempotent", _d2],
    ["D3", "O join F = CONFLICT", _d3],
    ["D4", "join monotone (a <= a join b)", _d4],
    ["D5", "CONFLICT absorbs", _d5],
    ["D6", "resolve idempotent + clears conflict (distinct prio)", _d6],
    ["D7", "factual detachment (in force iff condition)", _d7],
    ["D8", "CTD partiality (repair iff violated)", _d8],
    ["D9", "comply: O => not F (ought is permitted)", _d9],
]


# ---------------- DEONTIC BRIDGE LAWS ----------------
def feas_v():
    return V({"beta": 0.99, "kappa": False})


def infeas_v():
    return V({"beta": 0.10, "kappa": True})


GREQ = {"beta_min": 0.9, "acyclic": True}


def _db1(n):
    def b():
        norms = [Norm({"id": "no-x", "modality": "forbidden", "condition": (lambda c: c.get("x") is True), "priority": 5})]
        opts = [{"id": "safe", "value": feas_v(), "utility": 1, "ctx": {}},
                {"id": "bad", "value": feas_v(), "utility": 99, "ctx": {"x": True}}]
        r = govern(opts, req=GREQ, norms=norms)
        return True if (r["decision"] == "safe" and any(v["id"] == "bad" for v in r["deonticallyVetoed"])) else "forbidden-not-excluded"
    return trial(n, b)


def _db2(n):
    def b():
        norms = [Norm({"id": "must-c", "modality": "obligatory", "condition": (lambda c: c.get("duty") is True), "priority": 5})]
        opts = [{"id": "A", "value": feas_v(), "utility": 99, "ctx": {}},
                {"id": "C", "value": feas_v(), "utility": 1, "ctx": {"duty": True}}]
        r = govern(opts, req=GREQ, norms=norms)
        return True if (r["decision"] == "C" and r["forcedByObligation"]) else "obligation-not-forced"
    return trial(n, b)


def _db3(n):
    def b():
        norms = [Norm({"id": "must-c", "modality": "obligatory", "condition": (lambda c: c.get("duty") is True),
                       "priority": 5, "ctd": Norm({"id": "escalate-DPO", "modality": "obligatory"})})]
        opts = [{"id": "A", "value": feas_v(), "utility": 99, "ctx": {}},
                {"id": "C", "value": infeas_v(), "utility": 1, "ctx": {"duty": True}}]
        r = govern(opts, req=GREQ, norms=norms)
        return True if (r["decision"] is None and r["escalation"] and r["escalation"]["repair"] == "escalate-DPO") else "no-escalation"
    return trial(n, b)


DBR = [
    ["DB1", "forbidden excluded from decision", _db1],
    ["DB2", "obligation forces over higher score", _db2],
    ["DB3", "alethic precedence => CTD escalation", _db3],
]


# ---------------- TEMPORAL LAWS ----------------
ATS = [T.atom("even", lambda s: s["v"] % 2 == 0),
       T.atom("hi", lambda s: s["v"] >= 3),
       T.atom("pos", lambda s: s["v"] > 0)]


def r_atom():
    return ATS[randint(len(ATS))]


def r_form(d):
    if d <= 0:
        return r_atom()
    k = randint(8)
    if k == 0:
        return r_atom()
    if k == 1:
        return T.not_(r_form(d - 1))
    if k == 2:
        return T.and_(r_form(d - 1), r_form(d - 1))
    if k == 3:
        return T.or_(r_form(d - 1), r_form(d - 1))
    if k == 4:
        return T.next_(r_form(d - 1))
    if k == 5:
        return T.always(r_form(d - 1))
    if k == 6:
        return T.eventually(r_form(d - 1))
    return T.until(r_form(d - 1), r_form(d - 1))


def r_traj():
    return [{"v": randint(5)} for _ in range(1 + randint(6))]


def _sat(f, tau):
    return T.monitor(f, tau)["verdict"] == "satisfied"


def _t1(n):
    def b():
        a, tau = r_form(2), r_traj()
        return True if (T.eval_direct(T.always(T.always(a)), tau) == T.eval_direct(T.always(a), tau)
                        and T.eval_direct(T.eventually(T.eventually(a)), tau) == T.eval_direct(T.eventually(a), tau)) else "idem"
    return trial(n, b)


def _t2(n):
    def b():
        a, tau = r_form(2), r_traj()
        return True if (T.eval_direct(T.not_(T.always(a)), tau) == T.eval_direct(T.eventually(T.not_(a)), tau)
                        and T.eval_direct(T.not_(T.eventually(a)), tau) == T.eval_direct(T.always(T.not_(a)), tau)) else "dual"
    return trial(n, b)


def _t3(n):
    def b():
        a, bb, tau = r_form(2), r_form(2), r_traj()
        return True if (T.eval_direct(T.and_(a, bb), tau) == T.eval_direct(T.and_(bb, a), tau)
                        and T.eval_direct(T.or_(a, bb), tau) == T.eval_direct(T.or_(bb, a), tau)
                        and T.eval_direct(T.and_(a, a), tau) == T.eval_direct(a, tau)) else "lattice"
    return trial(n, b)


def _t4(n):
    def b():
        a, tau = r_form(2), r_traj()
        return True if _sat(a, tau) == T.eval_direct(a, tau, 0) else "progress!=direct"
    return trial(n, b)


def _t5(n):
    def b():
        p, tau = r_atom(), r_traj()
        g = T.monitor(T.always(p), tau)
        if g["verdict"] == "violated" and "vio" not in g["online"]:
            return "safety-no-witness"
        f = T.monitor(T.eventually(p), tau)
        return "liveness-early-false" if "vio" in f["online"] else True
    return trial(n, b)


def _t6(n):
    def b():
        a, bb, tau = r_form(1), r_form(1), r_traj()
        return True if (T.eval_direct(T.always(T.and_(a, bb)), tau) == T.eval_direct(T.and_(T.always(a), T.always(bb)), tau)
                        and T.eval_direct(T.eventually(T.or_(a, bb)), tau) == T.eval_direct(T.or_(T.eventually(a), T.eventually(bb)), tau)) else "dist"
    return trial(n, b)


def _t7(n):
    def b():
        a, bb, tau = r_form(1), r_form(1), r_traj()
        lhs = T.until(a, bb)
        rhs = T.or_(bb, T.and_(a, T.next_(T.until(a, bb))))
        return True if T.eval_direct(lhs, tau) == T.eval_direct(rhs, tau) else "until-fix"
    return trial(n, b)


def _t8(n):
    def b():
        p = r_atom()
        stem, loop = r_traj(), r_traj()
        some_loop = any(p["pred"](s) for s in loop)
        every_loop = all(p["pred"](s) for s in loop)
        if T.monitor_lasso(T.gf(p), stem, loop) != some_loop:
            return "GF"
        if T.monitor_lasso(T.fg(p), stem, loop) != every_loop:
            return "FG"
        unroll = list(stem) + list(loop) + list(loop) + list(loop)
        if T.monitor_lasso(T.always(p), stem, loop) != T.eval_direct(T.always(p), unroll):
            return "G-unroll"
        return True if T.monitor_lasso(T.eventually(p), stem, loop) == T.eval_direct(T.eventually(p), unroll) else "F-unroll"
    return trial(n, b)


TEMP = [
    ["T1", "G,F idempotent (GGphi=Gphi)", _t1],
    ["T2", "duality (not Gphi = F not phi)", _t2],
    ["T3", "and,or commutative + idempotent", _t3],
    ["T4", "progression faithful (monitor = direct)", _t4],
    ["T5", "safety finite-witness / liveness never-early", _t5],
    ["T6", "G/and and F/or distribute", _t6],
    ["T7", "until fixpoint", _t7],
    ["T8", "lasso GF/FG + G/F vs unrolling", _t8],
]


# ---------------- TEMPORAL BRIDGE LAWS ----------------
def _tb1(n):
    def b():
        safe = T.always(T.atom("b>=.8", lambda s: s["beta"] >= 0.8))
        hist = [{"beta": 0.95}, {"beta": 0.9}]
        res = residual_of(safe, hist)
        return True if (guard(res, {"beta": 0.5}) is True and guard(res, {"beta": 0.95}) is False) else "shield"
    return trial(n, b)


def _tb2(n):
    def b():
        spec = TemporalSpec(id="reach-goal", formula=T.eventually(T.atom("done", lambda s: s["done"])),
                            kind="liveness", ctd="escalate-replan")
        miss = supervise([{"done": False}, {"done": False}], [spec])
        hit = supervise([{"done": False}, {"done": True}], [spec])
        return True if (miss["escalation"] and miss["escalation"]["specs"][0]["repair"] == "escalate-replan"
                        and hit["escalation"] is None) else "esc"
    return trial(n, b)


def _tb3(n):
    def b():
        spec = TemporalSpec(id="never-low", formula=T.always(T.atom("b>=.8", lambda s: s["beta"] >= 0.8)), kind="safety")
        r = supervise([{"beta": 0.9}, {"beta": 0.5}, {"beta": 0.9}], [spec])
        return True if (r["safe"] is False and r["reports"][0]["violatedAt"] == 1) else "unsafe"
    return trial(n, b)


TBR = [
    ["TB1", "safety shield prunes a violating step", _tb1],
    ["TB2", "unmet liveness => escalation at horizon", _tb2],
    ["TB3", "safety violation => unsafe verdict", _tb3],
]


# ---------------- REFLEXIVE LAWS ----------------
def nm(id, mod, pri=0, target=None):
    return Norm({"id": id, "modality": mod, "priority": pri, "target": target})


def rand_nm():
    return nm("n" + str(randint(10 ** 6)),
              ["permitted", "obligatory", "forbidden"][randint(3)],
              randint(5), ["t1", "t2"][randint(2)])


def _r1(n):
    def b():
        P = Policy({"norms": [nm("a", "permitted")]})
        x = rand_nm()
        r1 = revise(P, enact(x))
        if not r1["accepted"] or not any(q["id"] == x["id"] for q in r1["policy"]["norms"]):
            return "enact"
        r2 = revise(r1["policy"], repeal(x["id"]))
        return True if (r2["accepted"] and not any(q["id"] == x["id"] for q in r2["policy"]["norms"])) else "repeal"
    return trial(n, b)


def _r2(n):
    def b():
        ns = [rand_nm() for _ in range(4)]
        norms = arbitrate(ns)["norms"]
        for a in norms:
            for bb in norms:
                dom = (bb.get("priority", 0) > a.get("priority", 0)
                       or (bb.get("priority", 0) == a.get("priority", 0) and bb.get("time", 0) > a.get("time", 0)))
                conf = (a is not bb and a.get("target") is not None and a.get("target") == bb.get("target")
                        and ((a["modality"] == "obligatory" and bb["modality"] == "forbidden")
                             or (a["modality"] == "forbidden" and bb["modality"] == "obligatory")))
                if conf and dom:
                    return "dominated-survivor"
        return True
    return trial(n, b)


def _r3(n):
    def b():
        P = Policy({"norms": [nm("a", "permitted"), nm("b", "obligatory", 3)]})
        x = nm("x" + str(randint(10 ** 5)), "permitted")
        after = revise(revise(P, enact(x))["policy"], repeal(x["id"]))["policy"]
        return True if policy_key(after) == policy_key(P) else "not-minimal"
    return trial(n, b)


def _r4(n):
    def b():
        P = entrench(Policy({"norms": [nm("safe", "forbidden", 10)]}), "safe")
        if revise(P, repeal("safe"))["accepted"]:
            return "repealed-entrenched"
        if revise(P, amend("safe", nm("safe", "permitted")))["accepted"]:
            return "weakened-entrenched"
        strong = revise(P, amend("safe", nm("safe", "forbidden", 20)))
        ok = strong["accepted"] and next(q for q in strong["policy"]["norms"] if q["id"] == "safe")["priority"] == 20
        return True if ok else "strengthen-blocked"
    return trial(n, b)


def _r5(n):
    def b():
        hi = nm("hi", "forbidden", 9, "g")
        lo = nm("lo", "obligatory", 2, "g")
        a = arbitrate([hi, lo])
        return True if (any(q["id"] == "hi" for q in a["norms"]) and "lo" in a["overridden"]) else "superior"
    return trial(n, b)


def _r6(n):
    def b():
        old = dict(nm("old", "forbidden", 5, "g")); old["time"] = 1
        neu = dict(nm("new", "obligatory", 5, "g")); neu["time"] = 9
        a = arbitrate([old, neu])
        return True if (any(q["id"] == "new" for q in a["norms"]) and "old" in a["overridden"]) else "posterior"
    return trial(n, b)


def _r7(n):
    def b():
        ns = [rand_nm() for _ in range(4)]
        a1 = arbitrate(ns)
        a2 = arbitrate(a1["norms"])
        return True if (len(a2["overridden"]) == 0 and len(a2["norms"]) == len(a1["norms"])) else "not-idempotent"
    return trial(n, b)


def _r8(n):
    def b():
        P = entrench(Policy({"norms": [nm("safe", "forbidden", 10)]}), "safe")
        props = [enact(nm("p1", "permitted")), repeal("safe"), enact(nm("p2", "obligatory", 1))]
        s1 = stabilize(P, props)
        s2 = stabilize(s1["policy"], props)
        return True if (s1["stable"] and policy_key(s2["policy"]) == policy_key(s1["policy"])) else "unstable"
    return trial(n, b)


REFL = [
    ["R1", "success (enact adds, repeal removes)", _r1],
    ["R2", "consistency (no surviving dominated conflict)", _r2],
    ["R3", "minimal change (enact then repeal = id)", _r3],
    ["R4", "entrenchment (no weakening the core)", _r4],
    ["R5", "lex superior (priority wins)", _r5],
    ["R6", "lex posterior (recency breaks ties)", _r6],
    ["R7", "arbitration idempotent", _r7],
    ["R8", "reflective stability (fixpoint)", _r8],
]


# ---------------- REFLEXIVE BRIDGE LAWS ----------------
def _rb1(n):
    def b():
        P = entrench(Policy({"norms": [nm("forbid-X", "forbidden", 10, "X")]}), "forbid-X")
        return True if revise(P, enact(nm("force-X", "obligatory", 10, "X")))["accepted"] is False else "self-permitted"
    return trial(n, b)


def _rb2(n):
    def b():
        A = {"id": "A", "value": V({"beta": 0.99, "kappa": False}), "utility": 99, "ctx": {"x": True}}
        B = {"id": "B", "value": V({"beta": 0.99, "kappa": False}), "utility": 1, "ctx": {}}
        before = govern([A, B], req={"beta_min": 0.9, "acyclic": True}, norms=[])
        if before["decision"] != "A":
            return "pre"
        P = revise(Policy({}), enact(Norm({"id": "forbid-A", "modality": "forbidden", "priority": 5,
                                           "condition": (lambda c: c.get("x") is True)})))
        after = govern([A, B], req={"beta_min": 0.9, "acyclic": True}, norms=P["policy"]["norms"])
        return True if (after["decision"] == "B" and any(v["id"] == "A" for v in after["deonticallyVetoed"])) else "no-propagate"
    return trial(n, b)


def _rb3(n):
    def b():
        spec = TemporalSpec(id="floor", formula=T.always(T.atom("b", lambda s: s["beta"] >= 0.8)), kind="safety")
        P = Policy({"specs": [spec]})
        P = entrench(P, "floor")
        if revise(P, repeal("floor"))["accepted"]:
            return "repealed"
        r = supervise([{"beta": 0.9}, {"beta": 0.5}], P["specs"])
        return True if (r["safe"] is False and r["reports"][0]["violatedAt"] == 1) else "not-enforced"
    return trial(n, b)


REFB = [
    ["RB1", "cannot self-permit the forbidden", _rb1],
    ["RB2", "revision propagates to govern", _rb2],
    ["RB3", "entrenched safety survives in supervise", _rb3],
]


# ---------------- EPISTEMIC LAWS ----------------
EATOMS = ["p", "q", "r"]


def rand_world():
    w = {}
    for a in EATOMS:
        w[a] = random.random() < 0.5
    return w


def _eatom_pred(name):
    return lambda w: w[name]


PA = [EP.atom(name, _eatom_pred(name)) for name in EATOMS]


def e_atom():
    return PA[randint(len(PA))]


def _index_of(worlds, w):
    for i, x in enumerate(worlds):
        if x is w:
            return i
    return -1


def partition_model():
    """S5 - each agent's access is the equivalence cell of a random partition."""
    worlds = [rand_world() for _ in range(3 + randint(4))]
    k = 1 + randint(len(worlds))
    cell = [randint(k) for _ in worlds]

    def access_a(w):
        i = _index_of(worlds, w)
        return [worlds[j] for j in range(len(worlds)) if cell[j] == cell[i]]

    return EP.Model(worlds, worlds[randint(len(worlds))], {"a": access_a})


def belief_model():
    """KD45 - access is a fixed nonempty doxastic set (serial, not reflexive)."""
    worlds = [rand_world() for _ in range(4 + randint(3))]
    D = [w for w in worlds if random.random() < 0.5]
    dox = D if D else [worlds[0]]
    return EP.Model(worlds, worlds[randint(len(worlds))], {"a": (lambda w: dox)})


def cm_model(agents):
    """multi-agent S5 - each agent its own partition."""
    worlds = [rand_world() for _ in range(3 + randint(4))]
    access = {}
    for ag in agents:
        k = 1 + randint(len(worlds))
        cell = [randint(k) for _ in worlds]

        def make(cell):
            def acc(w):
                i = _index_of(worlds, w)
                return [worlds[j] for j in range(len(worlds)) if cell[j] == cell[i]]
            return acc
        access[ag] = make(cell)
    return EP.Model(worlds, worlds[randint(len(worlds))], access)


def ku_model():
    w1 = {"p": True, "q": False, "r": False}
    w2 = {"p": False, "q": False, "r": False}
    worlds = [w1, w2]
    return EP.Model(worlds, w1, {"a": (lambda w: worlds)})


def _e1(n):
    def b():
        m, f = partition_model(), e_atom()
        return True if (not EP.knows(m, "a", f) or EP.holds(f, m["actual"])) else "not-factive"
    return trial(n, b)


def _e2(n):
    def b():
        m, f, g = partition_model(), e_atom(), e_atom()
        return True if (not (EP.knows(m, "a", EP.implies(f, g)) and EP.knows(m, "a", f)) or EP.knows(m, "a", g)) else "no-K"
    return trial(n, b)


def _e3(n):
    def b():
        m, f = partition_model(), e_atom()
        if not EP.knows(m, "a", f):
            return True
        return True if all(EP.knows_at(m, "a", u, f) for u in m["access"]["a"](m["actual"])) else "no-4"
    return trial(n, b)


def _e4(n):
    def b():
        m, f = partition_model(), e_atom()
        if EP.knows(m, "a", f):
            return True
        return True if all(not EP.knows_at(m, "a", u, f) for u in m["access"]["a"](m["actual"])) else "no-5"
    return trial(n, b)


def _e5(n):
    def b():
        m, f = belief_model(), e_atom()
        return True if not (EP.believes(m, "a", f, 0.6) and EP.believes(m, "a", EP.not_(f), 0.6)) else "inconsistent"
    return trial(n, b)


def _e6(n):
    def b():
        m, f = partition_model(), e_atom()
        return True if (not EP.knows(m, "a", f) or EP.believes(m, "a", f, 1)) else "k-not-b"
    return trial(n, b)


def _e7(n):
    def b():
        m, f = partition_model(), e_atom()
        if not EP.knows(m, "a", f):
            return True
        psi = e_atom()
        if not EP.holds(psi, m["actual"]):
            return True
        return True if EP.knows(EP.announce(m, psi), "a", f) else "lost-knowledge"
    return trial(n, b)


def _e8(n):
    def b():
        ags = ["a", "b"]
        m, f = cm_model(ags), e_atom()
        return True if (not EP.common(m, ags, f) or EP.everyone(m, ags, f)) else "c-not-e"
    return trial(n, b)


EPI = [
    ["E1", "factivity T (Kphi -> phi)", _e1],
    ["E2", "distribution K", _e2],
    ["E3", "positive introspection (Kphi -> KKphi)", _e3],
    ["E4", "negative introspection (not Kphi -> K not Kphi)", _e4],
    ["E5", "belief consistency D", _e5],
    ["E6", "knowledge => belief (Kphi -> Bphi)", _e6],
    ["E7", "learning monotonicity (announce preserves K)", _e7],
    ["E8", "common knowledge (Cphi -> Ephi)", _e8],
]


# ---------------- EPISTEMIC BRIDGE LAWS ----------------
def _eb1(n):
    def b():
        m, f = partition_model(), e_atom()
        lo, hi = rnd(0, 0.5), rnd(0.5, 1)
        if EP.believes_at(m, "a", m["actual"], f, hi) and not EP.believes_at(m, "a", m["actual"], f, lo):
            return "not-monotone"
        return True if (not EP.knows(m, "a", f) or EP.believes(m, "a", f, 1)) else "gate"
    return trial(n, b)


def _eb2(n):
    def b():
        m = ku_model()
        f = EP.atom("p", lambda w: w["p"])
        if EP.knows_it_doesnt_know(m, "a", f):
            return True if EP.route(m, "a", f) == "deliberate" else "route"
        return True
    return trial(n, b)


def _eb3(n):
    def b():
        ags = ["a", "b"]
        m, f = cm_model(ags), e_atom()
        return True if (not EP.knows(m, "a", f) or EP.distributed(m, ags, f)) else "pool"
    return trial(n, b)


EPB = [
    ["EB1", "threshold gate monotone; K = belief@1", _eb1],
    ["EB2", "known-unknown => deliberate (kappa)", _eb2],
    ["EB3", "pooled knowledge dominates individual", _eb3],
]


# ---------------- STRATEGIC LAWS ----------------
SP = ST.atom("p", lambda s: s["p"])
SQ = ST.atom("q", lambda s: s["q"])


def rand_sf():
    return [SP, SQ, ST.not_(SP), ST.and_(SP, SQ), ST.or_(SP, SQ)][randint(5)]


def rand_game(agents=None):
    agents = agents if agents is not None else ["1", "2"]
    n = 3 + randint(3)
    states = [{"name": "s" + str(i), "p": random.random() < 0.5, "q": random.random() < 0.5} for i in range(n)]
    nm_count = {}
    for a in agents:
        for s in states:
            nm_count[a + "@" + s["name"]] = 1 + (1 if random.random() < 0.5 else 0)

    def moves(a, s):
        return list(range(nm_count[a + "@" + s["name"]]))

    tbl = {}
    for s in states:
        acc = [{}]
        for a in agents:
            nx = []
            for p in acc:
                for m in range(nm_count[a + "@" + s["name"]]):
                    d = dict(p)
                    d[a] = m
                    nx.append(d)
            acc = nx
        for jm in acc:
            tbl[s["name"] + "|" + ",".join(str(jm[a]) for a in agents)] = states[randint(len(states))]

    def delta(s, jm):
        return tbl[s["name"] + "|" + ",".join(str(jm[a]) for a in agents)]

    return ST.Game(states, agents, moves, delta)


def some_state(m):
    return m["states"][randint(len(m["states"]))]


def _product2(model, agents, state):
    acc = [{}]
    for a in agents:
        ms = model["moves"](a, state)
        nx = []
        for p in acc:
            for mv in ms:
                d = dict(p)
                d[a] = mv
                nx.append(d)
        acc = nx
    return acc


def _force1ext(model, C, state, in_set):
    comp = [a for a in model["agents"] if a not in C]
    cm = _product2(model, C, state)
    om = _product2(model, comp, state)
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


def _contains(seq, s):
    return any(s is x for x in seq)


def reach_bfs(m, f):
    W = [s for s in m["states"] if ST.holds(f, s)]
    while True:
        cur = W
        add = [q for q in m["states"]
               if not _contains(cur, q) and any(_contains(cur, m["delta"](q, {"a": mv})) for mv in m["moves"]("a", q))]
        if not add:
            return W
        W = W + add


def _s1(n):
    def b():
        m = rand_game()
        q = some_state(m)
        C = ["1"] if random.random() < 0.5 else ["1", "2"]
        return True if (ST.effectivity(m, C, q, ST.TOP) and not ST.effectivity(m, C, q, ST.BOT)) else "unit"
    return trial(n, b)


def _s2(n):
    def b():
        m = rand_game()
        q = some_state(m)
        f = rand_sf()
        return True if (not ST.effectivity(m, ["1"], q, f) or ST.effectivity(m, ["1", "2"], q, f)) else "coalition-mono"
    return trial(n, b)


def _s3(n):
    def b():
        m = rand_game()
        q = some_state(m)
        f = rand_sf()
        g = ST.or_(f, SQ)
        C = ["1"]
        return True if (not ST.effectivity(m, C, q, f) or ST.effectivity(m, C, q, g)) else "outcome-mono"
    return trial(n, b)


def _s4(n):
    def b():
        m = rand_game()
        q = some_state(m)
        f1, f2 = rand_sf(), rand_sf()
        return True if (not (ST.effectivity(m, ["1"], q, f1) and ST.effectivity(m, ["2"], q, f2))
                        or ST.effectivity(m, ["1", "2"], q, ST.and_(f1, f2))) else "superadd"
    return trial(n, b)


def _s5(n):
    def b():
        m = rand_game()
        q = some_state(m)
        f = rand_sf()
        return True if not (ST.effectivity(m, ["1"], q, f) and ST.effectivity(m, ["2"], q, ST.not_(f))) else "not-regular"
    return trial(n, b)


def _s6(n):
    def b():
        m = rand_game()
        f = rand_sf()
        C = ["1"]
        W = ST.can_maintain(m, C, f)
        reapply = [q for q in m["states"] if ST.holds(f, q) and _force1ext(m, C, q, lambda s: _contains(W, s))]
        return True if (all(ST.holds(f, q) for q in W) and len(reapply) == len(W)) else "gfp"
    return trial(n, b)


def _s7(n):
    def b():
        m = rand_game()
        f = rand_sf()
        C = ["1"]
        W = ST.can_reach(m, C, f)
        reapply = [q for q in m["states"] if ST.holds(f, q) or _force1ext(m, C, q, lambda s: _contains(W, s))]
        return True if (all(_contains(W, q) for q in m["states"] if ST.holds(f, q)) and len(reapply) == len(W)) else "lfp"
    return trial(n, b)


def _s8(n):
    def b():
        m = rand_game()
        q = some_state(m)
        f = rand_sf()
        G = m["agents"]
        some_succ = any(ST.holds(f, m["delta"](q, jm)) for jm in _product2(m, G, q))
        return True if (ST.effectivity(m, G, q, f) == some_succ) else "determinacy"
    return trial(n, b)


STR = [
    ["S1", "unit: [C]top and not [C]bot", _s1],
    ["S2", "coalition monotonicity", _s2],
    ["S3", "outcome monotonicity", _s3],
    ["S4", "superadditivity (disjoint cooperate)", _s4],
    ["S5", "regularity", _s5],
    ["S6", "maintenance is a greatest fixpoint", _s6],
    ["S7", "reachability is a least fixpoint", _s7],
    ["S8", "grand-coalition determinacy", _s8],
]


# ---------------- STRATEGIC BRIDGE LAWS ----------------
def _sb1(n):
    def b():
        m = rand_game(["a"])
        f = rand_sf()
        W = ST.can_reach(m, ["a"], f)
        B = reach_bfs(m, f)
        return True if (len(W) == len(B) and all(_contains(B, q) for q in W)) else "collapse"
    return trial(n, b)


def _sb2(n):
    def b():
        m = rand_game()
        q = some_state(m)
        f = rand_sf()
        C = ["1"]
        can = ST.can_ensure(m, C, f, q)
        return True if (ST.oblige(m, C, f, q) == ("discharge" if can else "escalate")) else "oic"
    return trial(n, b)


def _sb3(n):
    def b():
        m = rand_game()
        q = some_state(m)
        f = rand_sf()
        C = ["1", "2"]
        ck = random.random() < 0.5
        ex = ST.executable(m, C, f, q, ck)
        return True if (ex == (ST.can_ensure(m, C, f, q) and ck)) else "coord"
    return trial(n, b)


SB = [
    ["SB1", "single-agent collapse -> temporal reachability", _sb1],
    ["SB2", "ought-implies-can (no ability => escalate)", _sb2],
    ["SB3", "coordination needs ability and common knowledge", _sb3],
]


# ---------------- RESOURCE LAWS ----------------
def ri(n):
    return int(random.random() * n)


def rand_ledger():
    L = RES.Ledger(kind={"tokens": "depletable", "money": "depletable", "capacity": "capacity", "skill": "reusable"})
    for a in ["a", "b", "c", "d"]:
        L["bal"][a] = {"tokens": ri(10), "money": ri(10), "skill": 1 if random.random() < 0.5 else 0}
    L["bal"][RES.TREASURY] = {"tokens": 50, "money": 50}
    L["bal"][RES.SINK] = {}
    L["bal"][RES.FREE] = {"capacity": 10 + ri(10)}
    return L


def avail(L, res):
    return sum(RES.balance(L, a, res) for a in ["a", "b", "c", "d"])


def _c1(n):
    def b():
        L = rand_ledger()
        res = "tokens" if random.random() < 0.5 else "money"
        accts = ["a", "b", "c", "d", RES.TREASURY, RES.SINK]
        frm, to = accts[ri(len(accts))], accts[ri(len(accts))]
        before = RES.total(L, res)
        M = RES.transfer(L, res, frm, to, ri(6))
        got = before if M is RES.INFEASIBLE else RES.total(M, res)
        return True if got == before else "not-conserved"
    return trial(n, b)


def _c2(n):
    def b():
        L = rand_ledger()
        frm = ["a", "b", "c", "d"][ri(4)]
        over = RES.transfer(L, "tokens", frm, "a", RES.balance(L, frm, "tokens") + 1 + ri(3))
        if over is not RES.INFEASIBLE:
            return "overdraft-allowed"
        ok = RES.transfer(L, "tokens", frm, "b", min(RES.balance(L, frm, "tokens"), ri(4)))
        if ok is RES.INFEASIBLE:
            return True
        return True if all(all(v >= 0 for v in r.values()) for r in ok["bal"].values()) else "negative"
    return trial(n, b)


def _c3(n):
    def b():
        L = rand_ledger()
        res = "tokens"
        a1 = min(RES.balance(L, "a", res), ri(4))
        a2 = min(RES.balance(L, "c", res), ri(4))
        m12 = RES.transfer(RES.transfer(L, res, "a", "b", a1), res, "c", "d", a2)
        m21 = RES.transfer(RES.transfer(L, res, "c", "d", a2), res, "a", "b", a1)
        eq = all(RES.balance(m12, x, res) == RES.balance(m21, x, res) for x in ["a", "b", "c", "d"])
        return True if eq else "noncommutative"
    return trial(n, b)


def _c4(n):
    def b():
        L = rand_ledger()
        a = ["a", "b", "c", "d"][ri(4)]
        start = RES.balance(L, a, "tokens")
        if start < 2:
            return True
        m = RES.spend(RES.spend(L, a, "tokens", 1), a, "tokens", 1)
        return True if RES.balance(m, a, "tokens") == start - 2 else "not-linear"
    return trial(n, b)


def _c5(n):
    def b():
        L = rand_ledger()
        a = ["a", "b", "c", "d"][ri(4)]
        if RES.balance(L, a, "skill") < 1:
            return True
        u1 = RES.use(L, a, "skill")
        u2 = RES.use(u1["L"], a, "skill")
        return True if (u1["ok"] and u2["ok"] and RES.balance(u2["L"], a, "skill") == RES.balance(L, a, "skill")) else "depleted"
    return trial(n, b)


def _c6(n):
    def b():
        L = rand_ledger()
        prev = avail(L, "tokens")
        for _ in range(4):
            a = ["a", "b", "c", "d"][ri(4)]
            m = RES.spend(L, a, "tokens", min(RES.balance(L, a, "tokens"), ri(3)))
            if m is RES.INFEASIBLE:
                continue
            now = avail(m, "tokens")
            if now > prev:
                return "increased"
            prev = now
            L = m
        return True
    return trial(n, b)


def _c7(n):
    def b():
        L = rand_ledger()
        start = RES.total(L, "capacity")
        for _ in range(3):
            t = "T" + str(ri(3))
            if random.random() < 0.6:
                L = RES.allocate(L, t, min(RES.balance(L, RES.FREE, "capacity"), ri(4))) or L
            else:
                L = RES.forget(L, t)
            if L is RES.INFEASIBLE:
                return "broke"
        return True if RES.total(L, "capacity") == start else "capacity-leaked"
    return trial(n, b)


def _c8(n):
    def b():
        L = rand_ledger()
        amt = min(RES.balance(L, RES.FREE, "capacity"), 1 + ri(4))
        L = RES.allocate(L, "T", amt)
        L = RES.consolidate(L, "T")
        before = RES.balance(L, "mind", "know:T")
        M = RES.forget(L, "T")
        return True if (before == 1 and RES.balance(M, "mind", "know:T") == 0
                        and RES.balance(M, RES.FREE, "capacity") >= amt) else "kept-both"
    return trial(n, b)


RESO = [
    ["C1", "conservation under transfer", _c1],
    ["C2", "no overdraft; balances stay >= 0", _c2],
    ["C3", "independent transactions commute (CRDT)", _c3],
    ["C4", "linearity - spending depletes", _c4],
    ["C5", "reusability - using ! does not deplete", _c5],
    ["C6", "flow monotonicity - depletion only decreases", _c6],
    ["C7", "capacity conservation", _c7],
    ["C8", "no free reclaim - forgetting releases knowledge", _c8],
]


# ---------------- RESOURCE BRIDGE LAWS ----------------
def _cb1(n):
    def b():
        L = rand_ledger()
        a = ["a", "b", "c", "d"][ri(4)]
        c = ri(12)
        return True if (RES.feasible(L, a, {"tokens": c}) == (RES.balance(L, a, "tokens") >= c)) else "gate"
    return trial(n, b)


def _cb2(n):
    def b():
        L = rand_ledger()
        a = ["a", "b", "c", "d"][ri(4)]
        c1, c2, c3 = ri(3), ri(3), ri(3)
        if RES.balance(L, a, "tokens") < c1 + c2 + c3:
            return True
        seq = RES.spend(RES.spend(RES.spend(L, a, "tokens", c1), a, "tokens", c2), a, "tokens", c3)
        lump = RES.spend(L, a, "tokens", c1 + c2 + c3)
        return True if RES.balance(seq, a, "tokens") == RES.balance(lump, a, "tokens") else "not-additive"
    return trial(n, b)


def _cb3(n):
    def b():
        L = rand_ledger()
        a = ["a", "b", "c", "d"][ri(4)]
        value, cost = ri(8), ri(8)
        r = RES.repair(L, a, resource="tokens", value=value, cost=cost)
        if not RES.affords(L, a, {"tokens": cost}):
            exp = "cannot-afford"
        else:
            exp = "invoke" if value >= cost else "skip"
        if r["decision"] != exp:
            return "wrong-decision"
        if r["decision"] == "invoke" and RES.balance(r["L"], a, "tokens") != RES.balance(L, a, "tokens") - cost:
            return "no-charge"
        return True
    return trial(n, b)


RESB = [
    ["CB1", "exhaustion => infeasible (the alethic zero gate)", _cb1],
    ["CB2", "cost composes additively along a pipeline (semiring)", _cb2],
    ["CB3", "Type-II repair pricing (value >= cost and affordable)", _cb3],
]


# ---------------- harness ----------------
def set_semiring(name):
    global _S
    _S = SEMIRINGS.get(name, SEMIRINGS["tropical"])


def run_set(laws, N):
    p = 0
    fail = 0
    results = []
    for (id, desc, fn) in laws:
        r = fn(N)
        results.append({"id": id, "desc": desc, "pass": r["pass"], "cex": r["cex"], "at": r["at"]})
        if r["pass"]:
            p += 1
        else:
            fail += 1
    return {"pass": p, "fail": fail, "results": results}


SUITES = [
    {"key": "INV", "label": "Invariant (L1-L14)", "laws": INV, "semiring": None},
    {"key": "HEUR", "label": "Heuristic (H1-H13) . tropical dioid", "laws": HEUR, "semiring": "tropical"},
    {"key": "BR", "label": "Bridge (B1-B3)", "laws": BR, "semiring": None},
    {"key": "DEON", "label": "Deontic (D1-D9)", "laws": DEON, "semiring": None},
    {"key": "DBR", "label": "Deontic bridge (DB1-DB3)", "laws": DBR, "semiring": None},
    {"key": "TEMP", "label": "Temporal (T1-T8)", "laws": TEMP, "semiring": None},
    {"key": "TBR", "label": "Temporal bridge (TB1-TB3)", "laws": TBR, "semiring": None},
    {"key": "REFL", "label": "Reflexive (R1-R8)", "laws": REFL, "semiring": None},
    {"key": "REFB", "label": "Reflexive bridge (RB1-RB3)", "laws": REFB, "semiring": None},
    {"key": "EPI", "label": "Epistemic (E1-E8)", "laws": EPI, "semiring": None},
    {"key": "EPB", "label": "Epistemic bridge (EB1-EB3)", "laws": EPB, "semiring": None},
    {"key": "STR", "label": "Strategic (S1-S8)", "laws": STR, "semiring": None},
    {"key": "SB", "label": "Strategic bridge (SB1-SB3)", "laws": SB, "semiring": None},
    {"key": "RESO", "label": "Resource (C1-C8)", "laws": RESO, "semiring": None},
    {"key": "RESB", "label": "Resource bridge (CB1-CB3)", "laws": RESB, "semiring": None},
]


def main():
    N = 2000
    print(f"\nbox-and-box law harness (python port) . {N} trials/law\n{'-' * 48}")
    total = 0
    for suite in SUITES:
        if suite["semiring"]:
            set_semiring(suite["semiring"])
        r = run_set(suite["laws"], N)
        fail_str = (", " + str(r["fail"]) + " fail") if r["fail"] else ""
        print(f"{suite['label']}: {r['pass']}/{len(suite['laws'])} pass{fail_str}")
        for x in r["results"]:
            if not x["pass"]:
                print(f"  x {x['id']} {x['desc']} - {x['cex']} @trial {x['at']}")
        total += r["fail"]
    print("-" * 48)
    print("cross-personality checks:")
    for name in ["tropical", "probability", "log"]:
        set_semiring(name)
        r = next(l for l in HEUR if l[0] == "H6")[2](N)
        status = "holds" if r["pass"] else "fails (expected - non-idempotent semiring)"
        print(f"  H6 idempotence under {name.ljust(11)} -> {status}")
    set_semiring("tropical")
    # factivity holds for knowledge (S5) but fails for belief (KD45)
    k_holds = b_fails = kT = bT = 0
    for _ in range(N):
        m, f = partition_model(), e_atom()
        if EP.knows(m, "a", f):
            kT += 1
            if EP.holds(f, m["actual"]):
                k_holds += 1
    for _ in range(N):
        m, f = belief_model(), e_atom()
        if EP.knows_at(m, "a", m["actual"], f):
            bT += 1
            if not EP.holds(f, m["actual"]):
                b_fails += 1
    kpct = round((k_holds / kT) * 100) if kT else 100
    bpct = round((b_fails / bT) * 100) if bT else 0
    print(f"  factivity T under knowledge (S5)   -> holds ({kpct}% of K-cases)")
    print(f"  factivity T under belief    (KD45) -> fails ({bpct}% of B-cases believe a falsehood - expected)")
    mono = gt = 0
    for _ in range(N):
        m, f = rand_game(), rand_sf()
        solo = ST.can_reach(m, ["1"], f)
        grand = ST.can_reach(m, ["1", "2"], f)
        if all(_contains(grand, q) for q in solo):
            mono += 1
        if len(grand) > len(solo):
            gt += 1
    print(f"  coalition power: grand superset solo reachability in {round((mono / N) * 100)}% of games (strictly larger in {round((gt / N) * 100)}%)")
    L = RES.Ledger(kind={"tokens": "depletable", "skill": "reusable"}, bal={"a": {"tokens": 3, "skill": 1}})
    dep = reu = L
    for _ in range(3):
        dep = RES.use(dep, "a", "tokens")["L"]
        reu = RES.use(reu, "a", "skill")["L"]
    print(f"  use x3 - depletable 'tokens' 3 -> {RES.balance(dep, 'a', 'tokens')} (consumed); "
          f"reusable 'skill' 1 -> {RES.balance(reu, 'a', 'skill')} (intact, the of-course modality)")
    print("-" * 48)
    print("all stated laws hold.\n" if total == 0 else f"{total} law(s) failed.\n")
    sys.exit(0 if total == 0 else 1)


if __name__ == "__main__":
    main()
