"""temporal.py - Temporal Arithmetic, faithful Python port (v0.4)

Properties over TRAJECTORIES. A Spec is an LTL formula over atomic predicates on
states. The core operation is ``progress(phi, s)`` - formula progression, the LTL
"derivative": the residual obligation on the rest of the trajectory after
observing state s. Monitoring is a fold of progress over the states. Laws T1-T8.
Mirrors temporal.mjs.

Formulas are dicts with a "t" tag. ``pred`` (for atoms) is a callable state->bool.
"""

TRUE = {"t": "true"}
FALSE = {"t": "false"}


def atom(name, pred):
    return {"t": "atom", "name": name, "pred": pred}


def _is_t(f):
    return f["t"] == "true"


def _is_f(f):
    return f["t"] == "false"


def eq(a, b):
    if a is b:
        return True
    if not a or not b or a["t"] != b["t"]:
        return False
    t = a["t"]
    if t in ("true", "false"):
        return True
    if t == "atom":
        return a["name"] == b["name"]
    if t in ("not", "next", "always", "eventually"):
        return eq(a["a"], b["a"])
    if t in ("and", "or", "until"):
        return eq(a["a"], b["a"]) and eq(a["b"], b["b"])
    return False


def not_(f):
    if _is_t(f):
        return FALSE
    if _is_f(f):
        return TRUE
    if f["t"] == "not":
        return f["a"]  # not not phi = phi
    return {"t": "not", "a": f}


def and_(a, b):
    if _is_f(a) or _is_f(b):
        return FALSE
    if _is_t(a):
        return b
    if _is_t(b):
        return a
    if eq(a, b):
        return a
    return {"t": "and", "a": a, "b": b}


def or_(a, b):
    if _is_t(a) or _is_t(b):
        return TRUE
    if _is_f(a):
        return b
    if _is_f(b):
        return a
    if eq(a, b):
        return a
    return {"t": "or", "a": a, "b": b}


def next_(a):
    return {"t": "next", "a": a}


def always(a):
    return {"t": "always", "a": a}  # G


def eventually(a):
    return {"t": "eventually", "a": a}  # F


def until(a, b):
    return {"t": "until", "a": a, "b": b}  # U


# derived
def gf(a):
    return always(eventually(a))  # recurrence - infinitely often


def fg(a):
    return eventually(always(a))  # stabilization - eventually always


def responds(p, q):
    return always(or_(not_(p), eventually(q)))  # p => F q


def progress(f, s):
    """progress : Spec x State -> Spec (formula progression / the LTL derivative)."""
    t = f["t"]
    if t == "true":
        return TRUE
    if t == "false":
        return FALSE
    if t == "atom":
        return TRUE if f["pred"](s) else FALSE
    if t == "not":
        return not_(progress(f["a"], s))
    if t == "and":
        return and_(progress(f["a"], s), progress(f["b"], s))
    if t == "or":
        return or_(progress(f["a"], s), progress(f["b"], s))
    if t == "next":
        return f["a"]  # X phi => residual phi
    if t == "always":
        return and_(progress(f["a"], s), always(f["a"]))  # G phi == phi & X G phi
    if t == "eventually":
        return or_(progress(f["a"], s), eventually(f["a"]))  # F phi == phi | X F phi
    if t == "until":
        return or_(progress(f["b"], s), and_(progress(f["a"], s), until(f["a"], f["b"])))
    return f


def _finalize(f):
    """finite-trace closure: weak G (holds at end), strong F/U/X (fail at end)."""
    t = f["t"]
    if t == "true":
        return True
    if t == "false":
        return False
    if t == "atom":
        return False
    if t == "not":
        return not _finalize(f["a"])
    if t == "and":
        return _finalize(f["a"]) and _finalize(f["b"])
    if t == "or":
        return _finalize(f["a"]) or _finalize(f["b"])
    if t == "always":
        return True
    if t == "eventually":
        return False
    if t == "until":
        return False
    if t == "next":
        return False
    return False


def monitor(f, trajectory):
    """monitor : Spec x Trajectory -> verdict (+ step-by-step)."""
    residual = f
    trace = []
    decided_at = None
    for i, s in enumerate(trajectory):
        residual = progress(residual, s)
        v = "sat" if _is_t(residual) else "vio" if _is_f(residual) else "pending"
        if decided_at is None and v != "pending":
            decided_at = i
        trace.append(v)
    final_sat = True if _is_t(residual) else False if _is_f(residual) else _finalize(residual)
    return {"verdict": "satisfied" if final_sat else "violated", "online": trace,
            "residual": residual, "decidedAt": decided_at}


def eval_direct(f, tau, i=0):
    """evalDirect : independent reference semantics (finite trace), for law T4."""
    if i >= len(tau):  # empty suffix
        t = f["t"]
        if t == "true":
            return True
        if t == "false":
            return False
        if t == "atom":
            return False
        if t == "not":
            return not eval_direct(f["a"], tau, i)
        if t == "and":
            return eval_direct(f["a"], tau, i) and eval_direct(f["b"], tau, i)
        if t == "or":
            return eval_direct(f["a"], tau, i) or eval_direct(f["b"], tau, i)
        if t == "always":
            return True
        if t == "eventually":
            return False
        if t == "until":
            return False
        if t == "next":
            return False
        return False
    t = f["t"]
    if t == "true":
        return True
    if t == "false":
        return False
    if t == "atom":
        return bool(f["pred"](tau[i]))
    if t == "not":
        return not eval_direct(f["a"], tau, i)
    if t == "and":
        return eval_direct(f["a"], tau, i) and eval_direct(f["b"], tau, i)
    if t == "or":
        return eval_direct(f["a"], tau, i) or eval_direct(f["b"], tau, i)
    if t == "next":
        return eval_direct(f["a"], tau, i + 1)
    if t == "always":
        return eval_direct(f["a"], tau, i) and eval_direct(always(f["a"]), tau, i + 1)
    if t == "eventually":
        return eval_direct(f["a"], tau, i) or eval_direct(eventually(f["a"]), tau, i + 1)
    if t == "until":
        return eval_direct(f["b"], tau, i) or (eval_direct(f["a"], tau, i) and eval_direct(until(f["a"], f["b"]), tau, i + 1))
    return False


def _some_state(states, p):
    return any(p["pred"](s) for s in states)


def _every_state(states, p):
    return all(p["pred"](s) for s in states)


def monitor_lasso(f, stem, loop):
    """omega-words as lassos: <stem><loop>^omega. Direct semantics for atomic patterns."""
    if f["t"] == "always" and f["a"]["t"] == "atom":
        return _every_state(stem, f["a"]) and _every_state(loop, f["a"])  # G p
    if f["t"] == "eventually" and f["a"]["t"] == "atom":
        return _some_state(stem, f["a"]) or _some_state(loop, f["a"])  # F p
    if f["t"] == "always" and f["a"]["t"] == "eventually" and f["a"]["a"]["t"] == "atom":
        return _some_state(loop, f["a"]["a"])  # GF p
    if f["t"] == "eventually" and f["a"]["t"] == "always" and f["a"]["a"]["t"] == "atom":
        return _every_state(loop, f["a"]["a"])  # FG p
    return eval_direct(f, list(stem) + list(loop) + list(loop) + list(loop))


def _has(f, tags):
    return bool(f) and isinstance(f, dict) and (
        f["t"] in tags or _has(f.get("a"), tags) or _has(f.get("b"), tags))


def character(f):
    """classification (coarse hint; behavioural laws T5 are the real claim)."""
    live = _has(f, ["eventually", "until"])
    if f["t"] == "always" and f.get("a") and f["a"]["t"] == "eventually":
        return "liveness"  # GF
    if not live:
        return "safety"
    return "mixed" if _has(f, ["always"]) else "liveness"


def show(f):
    t = f["t"]
    if t == "true":
        return "\u22a4"
    if t == "false":
        return "\u22a5"
    if t == "atom":
        return f["name"]
    if t == "not":
        return f"\u00ac{show(f['a'])}"
    if t == "and":
        return f"({show(f['a'])}\u2227{show(f['b'])})"
    if t == "or":
        return f"({show(f['a'])}\u2228{show(f['b'])})"
    if t == "next":
        return f"X{show(f['a'])}"
    if t == "always":
        return f"G{show(f['a'])}"
    if t == "eventually":
        return f"F{show(f['a'])}"
    if t == "until":
        return f"({show(f['a'])} U {show(f['b'])})"
    return "?"
