// temporal.rs — Temporal Arithmetic / LTL formula progression (faithful port of temporal.mjs).
// Laws T1–T8. The core operation is `progress(φ, s)` — formula progression, the LTL
// "derivative". Monitoring is a fold of progress over the states.

use std::rc::Rc;

// A State is the data atoms inspect. The reference tests use states with a numeric `v`
// (temporal suite) and supervise uses `beta` / `done`. We carry all three.
#[derive(Clone, Debug)]
pub struct State {
    pub v: i64,
    pub beta: f64,
    pub done: bool,
}

impl State {
    pub fn with_v(v: i64) -> State {
        State { v, beta: 0.0, done: false }
    }
    pub fn with_beta(beta: f64) -> State {
        State { v: 0, beta, done: false }
    }
    pub fn with_done(done: bool) -> State {
        State { v: 0, beta: 0.0, done }
    }
}

pub type Pred = Rc<dyn Fn(&State) -> bool>;

#[derive(Clone)]
pub enum Formula {
    True,
    False,
    Atom(String, Pred),
    Not(Box<Formula>),
    And(Box<Formula>, Box<Formula>),
    Or(Box<Formula>, Box<Formula>),
    Next(Box<Formula>),
    Always(Box<Formula>),
    Eventually(Box<Formula>),
    Until(Box<Formula>, Box<Formula>),
}

use Formula::*;

pub fn atom(name: &str, pred: Pred) -> Formula {
    Atom(name.to_string(), pred)
}

fn is_t(f: &Formula) -> bool {
    matches!(f, True)
}
fn is_f(f: &Formula) -> bool {
    matches!(f, False)
}

// structural equality (atoms compared by name, as in the JS eq())
pub fn eq(a: &Formula, b: &Formula) -> bool {
    match (a, b) {
        (True, True) => true,
        (False, False) => true,
        (Atom(n1, _), Atom(n2, _)) => n1 == n2,
        (Not(x), Not(y)) => eq(x, y),
        (Next(x), Next(y)) => eq(x, y),
        (Always(x), Always(y)) => eq(x, y),
        (Eventually(x), Eventually(y)) => eq(x, y),
        (And(x1, y1), And(x2, y2)) => eq(x1, x2) && eq(y1, y2),
        (Or(x1, y1), Or(x2, y2)) => eq(x1, x2) && eq(y1, y2),
        (Until(x1, y1), Until(x2, y2)) => eq(x1, x2) && eq(y1, y2),
        _ => false,
    }
}

// Boolean-simplifying constructors so residuals collapse to ⊤/⊥
pub fn not(f: Formula) -> Formula {
    if is_t(&f) {
        return False;
    }
    if is_f(&f) {
        return True;
    }
    if let Not(a) = f {
        return *a; // ¬¬φ = φ
    }
    Not(Box::new(f))
}

pub fn and(a: Formula, b: Formula) -> Formula {
    if is_f(&a) || is_f(&b) {
        return False;
    }
    if is_t(&a) {
        return b;
    }
    if is_t(&b) {
        return a;
    }
    if eq(&a, &b) {
        return a;
    }
    And(Box::new(a), Box::new(b))
}

pub fn or(a: Formula, b: Formula) -> Formula {
    if is_t(&a) || is_t(&b) {
        return True;
    }
    if is_f(&a) {
        return b;
    }
    if is_f(&b) {
        return a;
    }
    if eq(&a, &b) {
        return a;
    }
    Or(Box::new(a), Box::new(b))
}

pub fn next(a: Formula) -> Formula {
    Next(Box::new(a))
}
pub fn always(a: Formula) -> Formula {
    Always(Box::new(a))
}
pub fn eventually(a: Formula) -> Formula {
    Eventually(Box::new(a))
}
pub fn until(a: Formula, b: Formula) -> Formula {
    Until(Box::new(a), Box::new(b))
}
// derived
pub fn gf(a: Formula) -> Formula {
    always(eventually(a))
}
pub fn fg(a: Formula) -> Formula {
    eventually(always(a))
}

// ---- progress : Spec × State → Spec (the LTL derivative) ----
pub fn progress(f: &Formula, s: &State) -> Formula {
    match f {
        True => True,
        False => False,
        Atom(_, pred) => {
            if pred(s) {
                True
            } else {
                False
            }
        }
        Not(a) => not(progress(a, s)),
        And(a, b) => and(progress(a, s), progress(b, s)),
        Or(a, b) => or(progress(a, s), progress(b, s)),
        Next(a) => (**a).clone(), // X φ ⇒ residual φ
        Always(a) => and(progress(a, s), always((**a).clone())), // G φ ≡ φ ∧ X G φ
        Eventually(a) => or(progress(a, s), eventually((**a).clone())), // F φ ≡ φ ∨ X F φ
        Until(a, b) => or(
            progress(b, s),
            and(progress(a, s), until((**a).clone(), (**b).clone())),
        ), // φUψ ≡ ψ ∨ (φ ∧ X(φUψ))
    }
}

// finite-trace closure: weak G (holds at end), strong F/U/X (fail at end)
fn finalize(f: &Formula) -> bool {
    match f {
        True => true,
        False => false,
        Atom(_, _) => false,
        Not(a) => !finalize(a),
        And(a, b) => finalize(a) && finalize(b),
        Or(a, b) => finalize(a) || finalize(b),
        Always(_) => true,
        Eventually(_) => false,
        Until(_, _) => false,
        Next(_) => false,
    }
}

pub struct MonitorResult {
    pub verdict: String, // "satisfied" | "violated"
    pub online: Vec<String>,
    pub decided_at: Option<usize>,
}

// monitor : Spec × Trajectory → verdict (+ step-by-step)
pub fn monitor(f: &Formula, trajectory: &[State]) -> MonitorResult {
    let mut residual = f.clone();
    let mut trace: Vec<String> = Vec::new();
    let mut decided_at: Option<usize> = None;
    for (i, s) in trajectory.iter().enumerate() {
        residual = progress(&residual, s);
        let v = if is_t(&residual) {
            "sat"
        } else if is_f(&residual) {
            "vio"
        } else {
            "pending"
        };
        if decided_at.is_none() && v != "pending" {
            decided_at = Some(i);
        }
        trace.push(v.to_string());
    }
    let final_sat = if is_t(&residual) {
        true
    } else if is_f(&residual) {
        false
    } else {
        finalize(&residual)
    };
    MonitorResult {
        verdict: if final_sat { "satisfied" } else { "violated" }.to_string(),
        online: trace,
        decided_at,
    }
}

// evalDirect : independent reference semantics (finite trace), for law T4
pub fn eval_direct(f: &Formula, tau: &[State], i: usize) -> bool {
    if i >= tau.len() {
        // empty suffix
        return match f {
            True => true,
            False => false,
            Atom(_, _) => false,
            Not(a) => !eval_direct(a, tau, i),
            And(a, b) => eval_direct(a, tau, i) && eval_direct(b, tau, i),
            Or(a, b) => eval_direct(a, tau, i) || eval_direct(b, tau, i),
            Always(_) => true,
            Eventually(_) => false,
            Until(_, _) => false,
            Next(_) => false,
        };
    }
    match f {
        True => true,
        False => false,
        Atom(_, pred) => pred(&tau[i]),
        Not(a) => !eval_direct(a, tau, i),
        And(a, b) => eval_direct(a, tau, i) && eval_direct(b, tau, i),
        Or(a, b) => eval_direct(a, tau, i) || eval_direct(b, tau, i),
        Next(a) => eval_direct(a, tau, i + 1),
        Always(a) => eval_direct(a, tau, i) && eval_direct(&always((**a).clone()), tau, i + 1),
        Eventually(a) => {
            eval_direct(a, tau, i) || eval_direct(&eventually((**a).clone()), tau, i + 1)
        }
        Until(a, b) => {
            eval_direct(b, tau, i)
                || (eval_direct(a, tau, i)
                    && eval_direct(&until((**a).clone(), (**b).clone()), tau, i + 1))
        }
    }
}

// ω-words as lassos: ⟨stem⟩⟨loop⟩^ω.
fn some_state(states: &[State], pred: &Pred) -> bool {
    states.iter().any(|s| pred(s))
}
fn every_state(states: &[State], pred: &Pred) -> bool {
    states.iter().all(|s| pred(s))
}

pub fn monitor_lasso(f: &Formula, stem: &[State], loop_: &[State]) -> bool {
    match f {
        Always(a) => {
            if let Atom(_, p) = &**a {
                return every_state(stem, p) && every_state(loop_, p); // G p
            }
            if let Eventually(b) = &**a {
                if let Atom(_, p) = &**b {
                    return some_state(loop_, p); // GF p
                }
            }
        }
        Eventually(a) => {
            if let Atom(_, p) = &**a {
                return some_state(stem, p) || some_state(loop_, p); // F p
            }
            if let Always(b) = &**a {
                if let Atom(_, p) = &**b {
                    return every_state(loop_, p); // FG p
                }
            }
        }
        _ => {}
    }
    // general fallback: unroll a few loop copies and use finite semantics
    let mut unroll: Vec<State> = Vec::new();
    unroll.extend(stem.iter().cloned());
    for _ in 0..3 {
        unroll.extend(loop_.iter().cloned());
    }
    eval_direct(f, &unroll, 0)
}
