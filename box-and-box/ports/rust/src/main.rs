// main.rs — the 97-law property-test harness (faithful port of test/laws.mjs).
// Run: cargo run --release    (2000 trials/law; exits 0 iff all 97 pass)

use box_and_box::rng::{chance, idx, random, ri, rnd, to_fixed};
use box_and_box::{bridge, epistemic as ep, govern, norm, reflexive, resource as res, score, strategic as st, supervise, temporal as t, value};
use std::rc::Rc;

use norm::{Modality, Norm, Status};
use score::{Score, Semiring};
use value::{Requirements, Value};

// ---------------- shared helpers ----------------
fn approx(a: f64, b: f64) -> bool {
    approx_t(a, b, 1e-7)
}
fn approx_t(a: f64, b: f64, t: f64) -> bool {
    a == b || (a.is_finite() && b.is_finite() && (a - b).abs() <= t * (1.0 + a.abs() + b.abs()))
}
fn set_eq(a: &[String], b: &[String]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut x: Vec<&String> = a.iter().collect();
    let mut y: Vec<&String> = b.iter().collect();
    x.sort();
    y.sort();
    x == y
}
fn arr_eq(a: &[String], b: &[String]) -> bool {
    a == b
}
// sample: keep each element with prob 0.5 (mirrors JS arr.filter(()=>Math.random()<0.5))
fn sample(arr: &[&str]) -> Vec<String> {
    arr.iter().filter(|_| chance(0.5)).map(|s| s.to_string()).collect()
}

// A law returns Ok(()) on pass or Err(reason) with the trial index injected by `trial`.
type LawFn = Box<dyn Fn(usize) -> Result<usize, (String, usize)>>;

// trial: run body n times; body returns Ok(()) or Err(reason).
fn trial<F: Fn() -> Result<(), String>>(n: usize, body: F) -> Result<usize, (String, usize)> {
    for i in 0..n {
        if let Err(reason) = body() {
            return Err((reason, i + 1));
        }
    }
    Ok(n)
}

// ---------------- INVARIANT generators ----------------
fn rand_v() -> Value {
    let phases: Vec<Option<String>> = {
        let mut v: Vec<Option<String>> = vec![None];
        for p in value::PHASES.iter() {
            v.push(Some(p.to_string()));
        }
        v
    };
    let mut val = Value::v0();
    val.n = to_fixed(rnd(0.0, 10.0), 2);
    val.kappa = chance(0.5);
    val.beta = to_fixed(random(), 3);
    val.sigma = sample(&["x", "y", "z", "w"]);
    val.pi = phases[idx(phases.len())].clone();
    val.authority = if chance(0.5) {
        vec![format!("c{}", idx(3))]
    } else {
        vec![]
    };
    val.deny_default = chance(0.5);
    val.audit = if chance(0.5) {
        vec![format!("e{}", idx(3))]
    } else {
        vec![]
    };
    val
}

fn val_eq(a: &Value, b: &Value) -> bool {
    approx(a.n, b.n)
        && a.kappa == b.kappa
        && approx(a.beta, b.beta)
        && set_eq(&a.sigma, &b.sigma)
        && a.pi == b.pi
        && a.iota == b.iota
        && a.psi == b.psi
        && arr_eq(&a.authority, &b.authority)
        && a.deny_default == b.deny_default
        && arr_eq(&a.audit, &b.audit)
}

fn forward_triple() -> (Value, Value, Value) {
    let mut idxs = [idx(5), idx(5), idx(5)];
    idxs.sort();
    let mk = |i: usize| {
        let mut v = rand_v();
        v.pi = Some(value::PHASES[i].to_string());
        v
    };
    (mk(idxs[0]), mk(idxs[1]), mk(idxs[2]))
}

fn chain_ok(a: &Value, b: &Value) -> Option<Value> {
    match value::chain(a, b) {
        value::ChainResult::Ok(v) => Some(v),
        value::ChainResult::Error(_) => None,
    }
}

fn inv_laws() -> Vec<(&'static str, &'static str, LawFn)> {
    vec![
        ("L1", "combine associative", Box::new(|n| trial(n, || {
            let (a, b, c) = (rand_v(), rand_v(), rand_v());
            if val_eq(&value::combine(&value::combine(&a, &b), &c), &value::combine(&a, &value::combine(&b, &c))) { Ok(()) } else { Err("assoc".into()) }
        }))),
        ("L2", "combine identity V0", Box::new(|n| trial(n, || {
            let a = rand_v();
            if val_eq(&value::combine(&a, &Value::v0()), &a) && val_eq(&value::combine(&Value::v0(), &a), &a) { Ok(()) } else { Err("identity".into()) }
        }))),
        ("L3", "commutative families (n,κ,β,σ,deny)", Box::new(|n| trial(n, || {
            let (a, b) = (rand_v(), rand_v());
            let x = value::combine(&a, &b); let y = value::combine(&b, &a);
            if approx(x.n, y.n) && x.kappa == y.kappa && approx(x.beta, y.beta) && set_eq(&x.sigma, &y.sigma) && x.deny_default == y.deny_default { Ok(()) } else { Err("comm".into()) }
        }))),
        ("L4", "β idempotent under min", Box::new(|n| trial(n, || {
            let a = rand_v(); if approx(value::combine(&a, &a).beta, a.beta) { Ok(()) } else { Err("β-idem".into()) }
        }))),
        ("L5", "σ idempotent under ∪", Box::new(|n| trial(n, || {
            let a = rand_v(); if set_eq(&value::combine(&a, &a).sigma, &a.sigma) { Ok(()) } else { Err("σ-idem".into()) }
        }))),
        ("L6", "κ idempotent under ∨", Box::new(|n| trial(n, || {
            let a = rand_v(); if value::combine(&a, &a).kappa == a.kappa { Ok(()) } else { Err("κ-idem".into()) }
        }))),
        ("L7", "promote β-monotone", Box::new(|n| trial(n, || {
            let a = rand_v(); let ev = random();
            if value::promote(&a, ev).beta >= a.beta - 1e-9 { Ok(()) } else { Err("monotone".into()) }
        }))),
        ("L8", "reconcile antitone + idempotent", Box::new(|n| trial(n, || {
            let a = rand_v(); let tags = sample(&["x", "y", "z", "w"]);
            let r = value::reconcile(&a, &tags);
            let sub = r.sigma.iter().all(|t| a.sigma.contains(t));
            if sub && set_eq(&value::reconcile(&r, &tags).sigma, &r.sigma) { Ok(()) } else { Err("reconcile".into()) }
        }))),
        ("L9", "deliberate κ→false + idempotent", Box::new(|n| trial(n, || {
            let a = rand_v(); let d = value::deliberate(&a);
            if !d.kappa && !value::deliberate(&d).kappa { Ok(()) } else { Err("deliberate".into()) }
        }))),
        ("L10", "chain refuses a backward phase", Box::new(|n| trial(n, || {
            let (a, b) = (rand_v(), rand_v());
            if a.pi.is_none() || b.pi.is_none() { return Ok(()); }
            let r = value::chain(&a, &b);
            let is_err = matches!(r, value::ChainResult::Error(_));
            if value::phase_idx(a.pi.as_ref().unwrap()) > value::phase_idx(b.pi.as_ref().unwrap()) {
                if is_err { Ok(()) } else { Err("should refuse".into()) }
            } else if is_err { Err("should allow".into()) } else { Ok(()) }
        }))),
        ("L11", "chain associative where defined", Box::new(|n| trial(n, || {
            let (a, b, c) = forward_triple();
            let l = chain_ok(&a, &b).and_then(|ab| chain_ok(&ab, &c));
            let r = chain_ok(&b, &c).and_then(|bc| chain_ok(&a, &bc));
            match (l, r) {
                (Some(l), Some(r)) => if val_eq(&l, &r) { Ok(()) } else { Err("chain-assoc".into()) },
                _ => Ok(()), // vacuous
            }
        }))),
        ("L12", "promote distributes over combine on β", Box::new(|n| trial(n, || {
            let (a, b) = (rand_v(), rand_v()); let ev = random();
            let lhs = value::promote(&value::combine(&a, &b), ev).beta;
            let rhs = value::combine(&value::promote(&a, ev), &value::promote(&b, ev)).beta;
            if approx(lhs, rhs) { Ok(()) } else { Err("β-distrib".into()) }
        }))),
        ("L13", "consume gate (β_min)", Box::new(|n| trial(n, || {
            let a = rand_v(); let thr = 0.5;
            let ok = value::consume(&a, &Requirements { beta_min: Some(thr), ..Default::default() }).ok;
            if ok == (a.beta >= thr) { Ok(()) } else { Err("gate".into()) }
        }))),
        ("L14", "deny_default idempotent under ∧", Box::new(|n| trial(n, || {
            let a = rand_v(); if value::combine(&a, &a).deny_default == a.deny_default { Ok(()) } else { Err("∧-idem".into()) }
        }))),
    ]
}

// ---------------- HEURISTIC generators ----------------
fn gen(s: Semiring) -> f64 {
    if s == Semiring::Probability {
        let r = random();
        if r < 0.06 { 0.0 } else if r < 0.12 { 1.0 } else { to_fixed(rnd(0.0, 4.0), 4) }
    } else {
        let r = random();
        if r < 0.06 { s.zero() } else if r < 0.12 { s.one() } else { to_fixed(rnd(-12.0, 12.0), 4) }
    }
}
fn rand_score(s: Semiring) -> Score {
    Score { u: gen(s), w: rnd(0.0, 1.0), eps: rnd(0.0, 1.0), gamma: rnd(0.5, 1.0), ..Default::default() }
}
fn rand_opt_obj() -> score::ObjOption {
    score::ObjOption { id: (random() * 1e9) as i64, obj: vec![to_fixed(rnd(0.0, 5.0), 2), to_fixed(rnd(0.0, 5.0), 2)] }
}

fn heur_laws(s: Semiring) -> Vec<(&'static str, &'static str, LawFn)> {
    vec![
        ("H1", "⊕ commutative monoid", Box::new(move |n| trial(n, || {
            let (a, b, c) = (gen(s), gen(s), gen(s));
            if !approx(s.oplus(a, b), s.oplus(b, a)) { return Err("comm".into()); }
            if !approx(s.oplus(s.oplus(a, b), c), s.oplus(a, s.oplus(b, c))) { return Err("assoc".into()); }
            if approx(s.oplus(a, s.zero()), a) { Ok(()) } else { Err("id".into()) }
        }))),
        ("H2", "⊗ monoid", Box::new(move |n| trial(n, || {
            let (a, b, c) = (gen(s), gen(s), gen(s));
            if !approx(s.otimes(s.otimes(a, b), c), s.otimes(a, s.otimes(b, c))) { return Err("assoc".into()); }
            if approx(s.otimes(a, s.one()), a) && approx(s.otimes(s.one(), a), a) { Ok(()) } else { Err("id".into()) }
        }))),
        ("H3", "left distributivity", Box::new(move |n| trial(n, || {
            let (a, b, c) = (gen(s), gen(s), gen(s));
            if approx(s.otimes(a, s.oplus(b, c)), s.oplus(s.otimes(a, b), s.otimes(a, c))) { Ok(()) } else { Err("distL".into()) }
        }))),
        ("H4", "right distributivity", Box::new(move |n| trial(n, || {
            let (a, b, c) = (gen(s), gen(s), gen(s));
            if approx(s.otimes(s.oplus(a, b), c), s.oplus(s.otimes(a, c), s.otimes(b, c))) { Ok(()) } else { Err("distR".into()) }
        }))),
        ("H5", "0̲ annihilates ⊗", Box::new(move |n| trial(n, || {
            let a = gen(s);
            if s.otimes(s.zero(), a) == s.zero() && s.otimes(a, s.zero()) == s.zero() { Ok(()) } else { Err("annih".into()) }
        }))),
        ("H6", "⊕ idempotence (dioid only)", Box::new(move |n| trial(n, || {
            let a = gen(s); if approx(s.oplus(a, a), a) { Ok(()) } else { Err("idem".into()) }
        }))),
        ("H7", "⊗ monotone in order", Box::new(move |n| trial(n, || {
            let (mut a, mut b) = (gen(s), gen(s)); if a > b { std::mem::swap(&mut a, &mut b); } let c = gen(s);
            if s.otimes(a, c) <= s.otimes(b, c) || approx(s.otimes(a, c), s.otimes(b, c)) { Ok(()) } else { Err("mono".into()) }
        }))),
        ("H8", "reinforce η-contraction", Box::new(|n| trial(n, || {
            let (u, tt, e) = (rnd(-10.0, 10.0), rnd(-10.0, 10.0), rnd(0.05, 0.95));
            let got = (score::reinforce(u, tt, e) - tt).abs(); let want = (1.0 - e) * (u - tt).abs();
            if approx_t(got, want, 1e-6) && got <= (u - tt).abs() + 1e-9 { Ok(()) } else { Err("contr".into()) }
        }))),
        ("H9", "rollout γ-contraction", Box::new(|n| trial(n, || {
            let g = rnd(0.1, 0.95); let d = 3;
            let u: Vec<f64> = (0..d).map(|_| rnd(-8.0, 8.0)).collect();
            let v: Vec<f64> = (0..d).map(|_| rnd(-8.0, 8.0)).collect();
            let r: Vec<f64> = (0..d).map(|_| rnd(-5.0, 5.0)).collect();
            let bu: Vec<f64> = u.iter().enumerate().map(|(i, x)| r[i] + g * x).collect();
            let bv: Vec<f64> = v.iter().enumerate().map(|(i, x)| r[i] + g * x).collect();
            let num = bu.iter().enumerate().map(|(i, x)| (x - bv[i]).abs()).fold(f64::NEG_INFINITY, f64::max);
            let den = u.iter().enumerate().map(|(i, x)| (x - v[i]).abs()).fold(f64::NEG_INFINITY, f64::max);
            if approx_t(num, g * den, 1e-6) { Ok(()) } else { Err("γ-contr".into()) }
        }))),
        ("H10", "dominate idempotent + Pareto", Box::new(|n| trial(n, || {
            let k = 4 + idx(4); let opts: Vec<score::ObjOption> = (0..k).map(|_| rand_opt_obj()).collect();
            let p1 = score::dominate(&opts); let p2 = score::dominate(&p1);
            let mut id1: Vec<i64> = p1.iter().map(|o| o.id).collect(); id1.sort();
            let mut id2: Vec<i64> = p2.iter().map(|o| o.id).collect(); id2.sort();
            if id1 != id2 { return Err("not-idem".into()); }
            for a in &p1 { for b in &p1 {
                if a.id != b.id && b.obj.iter().enumerate().all(|(i, &bj)| bj >= a.obj[i]) && b.obj.iter().enumerate().any(|(i, &bj)| bj > a.obj[i]) { return Err("dominated survivor".into()); }
            }}
            Ok(())
        }))),
        ("H11", "anneal ε→0 idempotent", Box::new(move |n| trial(n, || {
            let s0 = rand_score(s); let a1 = score::anneal(&s0); let a2 = score::anneal(&a1);
            if a1.eps == 0.0 && a2.eps == 0.0 { Ok(()) } else { Err("ε".into()) }
        }))),
        ("H12", "softmax shift-invariant", Box::new(|n| trial(n, || {
            let k = 4; let temp = rnd(0.3, 2.0);
            let u: Vec<f64> = (0..k).map(|_| rnd(-6.0, 6.0)).collect(); let c = rnd(-5.0, 5.0);
            let a = score::softmax(&u, temp); let shifted: Vec<f64> = u.iter().map(|x| x + c).collect();
            let b = score::softmax(&shifted, temp);
            if a.iter().enumerate().all(|(i, x)| approx_t(*x, b[i], 1e-6)) { Ok(()) } else { Err("shift".into()) }
        }))),
        ("H13", "T→0 collapses to argmax", Box::new(|n| trial(n, || {
            let k = 5; let u: Vec<f64> = (0..k).map(|_| to_fixed(rnd(-6.0, 6.0), 3)).collect();
            let sm = score::softmax(&u, 0.01);
            let argmax_sm = sm.iter().enumerate().max_by(|a, b| a.1.partial_cmp(b.1).unwrap()).unwrap().0;
            let argmax_u = u.iter().enumerate().max_by(|a, b| a.1.partial_cmp(b.1).unwrap()).unwrap().0;
            if argmax_sm == argmax_u { Ok(()) } else { Err("argmax".into()) }
        }))),
    ]
}

// ---------------- BRIDGE generators ----------------
fn rand_option() -> bridge::Opt {
    let mut v = Value::v0();
    v.beta = to_fixed(random(), 3);
    v.kappa = chance(0.4);
    v.sigma = sample(&["c"]);
    bridge::Opt { id: format!("opt{}", idx(1_000_000)), value: v, utility: Some(to_fixed(rnd(0.0, 10.0), 3)) }
}
fn req_b() -> Requirements {
    Requirements { beta_min: Some(0.5), acyclic: true, ..Default::default() }
}

fn br_laws() -> Vec<(&'static str, &'static str, LawFn)> {
    vec![
        ("B1", "veto ⇒ score 0̲", Box::new(|n| trial(n, || {
            let o = rand_option(); let g = bridge::gated_score(&o, &req_b(), Semiring::Tropical);
            if value::consume(&o.value, &req_b()).ok { return Ok(()); }
            if g.score == f64::NEG_INFINITY { Ok(()) } else { Err("not annihilated".into()) }
        }))),
        ("B2", "select ranks within feasible", Box::new(|n| trial(n, || {
            let k = 2 + idx(4); let opts: Vec<bridge::Opt> = (0..k).map(|_| rand_option()).collect();
            let r = bridge::select(&opts, &req_b(), Semiring::Tropical);
            let decision = match &r.decision { Some(d) => d.clone(), None => return Ok(()) };
            let feas: Vec<&bridge::Opt> = opts.iter().filter(|o| value::consume(&o.value, &req_b()).ok).collect();
            let chosen = match feas.iter().find(|o| o.id == decision) { Some(o) => *o, None => return Err("chose infeasible".into()) };
            let chosen_u = chosen.utility.unwrap();
            if feas.iter().all(|o| o.utility.unwrap() <= chosen_u + 1e-9) { Ok(()) } else { Err("feasible outranks chosen".into()) }
        }))),
        ("B3", "conservativity: one feasible ⇒ chosen", Box::new(|n| trial(n, || {
            let mut opts: Vec<bridge::Opt> = (0..3).map(|_| rand_option()).collect();
            let i = idx(3);
            for (j, o) in opts.iter_mut().enumerate() {
                if j == i { let mut v = Value::v0(); v.beta = 0.99; v.kappa = false; o.value = v; }
                else { let mut v = Value::v0(); v.beta = 0.99; v.kappa = true; o.value = v; o.utility = Some(999.0); }
            }
            let r = bridge::select(&opts, &req_b(), Semiring::Tropical);
            if r.decision.as_deref() == Some(opts[i].id.as_str()) { Ok(()) } else { Err("not unique feasible".into()) }
        }))),
    ]
}

// ---------------- DEONTIC generators ----------------
const STATI: [Status; 4] = [Status::Optional, Status::Obligatory, Status::Forbidden, Status::Conflict];
fn rand_status() -> Status {
    STATI[idx(4)]
}

fn deon_laws() -> Vec<(&'static str, &'static str, LawFn)> {
    vec![
        ("D1", "join commutative + associative", Box::new(|n| trial(n, || {
            let (a, b, c) = (rand_status(), rand_status(), rand_status());
            if norm::join(a, b) != norm::join(b, a) { return Err("comm".into()); }
            if norm::join(norm::join(a, b), c) == norm::join(a, norm::join(b, c)) { Ok(()) } else { Err("assoc".into()) }
        }))),
        ("D2", "join identity OPTIONAL + idempotent", Box::new(|n| trial(n, || {
            let a = rand_status();
            if norm::join(a, Status::Optional) == a && norm::join(a, a) == a { Ok(()) } else { Err("id/idem".into()) }
        }))),
        ("D3", "O ⊔ F = CONFLICT", Box::new(|n| trial(n, || {
            if norm::join(Status::Obligatory, Status::Forbidden) == Status::Conflict { Ok(()) } else { Err("no-conflict".into()) }
        }))),
        ("D4", "join monotone (a ⊑ a⊔b)", Box::new(|n| trial(n, || {
            let (a, b) = (rand_status(), rand_status());
            if norm::rank(norm::join(a, b)) >= norm::rank(a) && norm::rank(norm::join(a, b)) >= norm::rank(b) { Ok(()) } else { Err("mono".into()) }
        }))),
        ("D5", "CONFLICT absorbs", Box::new(|n| trial(n, || {
            let a = rand_status(); if norm::join(Status::Conflict, a) == Status::Conflict { Ok(()) } else { Err("absorb".into()) }
        }))),
        ("D6", "resolve idempotent + clears conflict (distinct prio)", Box::new(|n| trial(n, || {
            let v = norm::Verdict {
                status: Status::Conflict,
                contributors: vec![
                    norm::Contributor { id: "o".into(), modality: Modality::Obligatory, priority: 5.0 },
                    norm::Contributor { id: "f".into(), modality: Modality::Forbidden, priority: 2.0 },
                ],
                resolved: None, overridden: vec![], note: None,
            };
            let r1 = norm::resolve(&v); if r1.resolved == Some(Status::Conflict) { return Err("did-not-clear".into()); }
            let r2 = norm::resolve(&r1); if r2.resolved == r1.resolved { Ok(()) } else { Err("not-idempotent".into()) }
        }))),
        ("D7", "factual detachment (in force iff condition)", Box::new(|n| trial(n, || {
            let c = chance(0.5);
            let nm = Norm::new("n", Modality::Obligatory).condition(Rc::new(move |_| c));
            if norm::detach(&nm, &norm::Ctx::new(), false).in_force == c { Ok(()) } else { Err("detach".into()) }
        }))),
        ("D8", "CTD partiality (repair iff violated)", Box::new(|n| trial(n, || {
            let nm = Norm::new("p", Modality::Obligatory).ctd(Norm::new("r", Modality::Obligatory));
            let no = norm::detach(&nm, &norm::Ctx::new(), false).repair.is_none();
            let yes = norm::detach(&nm, &norm::Ctx::new(), true).repair.map(|r| r.id) == Some("r".to_string());
            if no && yes { Ok(()) } else { Err("ctd".into()) }
        }))),
        ("D9", "comply: O⇒¬F (ought is permitted)", Box::new(|n| trial(n, || {
            if norm::comply(Status::Obligatory, true).ok && !norm::comply(Status::Forbidden, true).ok && !norm::comply(Status::Obligatory, false).ok { Ok(()) } else { Err("comply".into()) }
        }))),
    ]
}

// ---------------- DEONTIC BRIDGE ----------------
fn feas_v() -> Value { let mut v = Value::v0(); v.beta = 0.99; v.kappa = false; v }
fn infeas_v() -> Value { let mut v = Value::v0(); v.beta = 0.10; v.kappa = true; v }
fn greq() -> Requirements { Requirements { beta_min: Some(0.9), acyclic: true, ..Default::default() } }
fn ctx_of(pairs: &[(&str, bool)]) -> norm::Ctx { pairs.iter().map(|(k, v)| (k.to_string(), *v)).collect() }

fn dbr_laws() -> Vec<(&'static str, &'static str, LawFn)> {
    vec![
        ("DB1", "forbidden excluded from decision", Box::new(|n| trial(n, || {
            let norms = vec![Norm::new("no-x", Modality::Forbidden).priority(5.0).condition(Rc::new(|c: &norm::Ctx| *c.get("x").unwrap_or(&false)))];
            let opts = vec![
                govern::GOpt { id: "safe".into(), value: feas_v(), utility: Some(1.0), ctx: ctx_of(&[]) },
                govern::GOpt { id: "bad".into(), value: feas_v(), utility: Some(99.0), ctx: ctx_of(&[("x", true)]) },
            ];
            let r = govern::govern(&opts, &greq(), &norms, Semiring::Tropical);
            if r.decision.as_deref() == Some("safe") && r.deontically_vetoed.iter().any(|v| v.id == "bad") { Ok(()) } else { Err("forbidden-not-excluded".into()) }
        }))),
        ("DB2", "obligation forces over higher score", Box::new(|n| trial(n, || {
            let norms = vec![Norm::new("must-c", Modality::Obligatory).priority(5.0).condition(Rc::new(|c: &norm::Ctx| *c.get("duty").unwrap_or(&false)))];
            let opts = vec![
                govern::GOpt { id: "A".into(), value: feas_v(), utility: Some(99.0), ctx: ctx_of(&[]) },
                govern::GOpt { id: "C".into(), value: feas_v(), utility: Some(1.0), ctx: ctx_of(&[("duty", true)]) },
            ];
            let r = govern::govern(&opts, &greq(), &norms, Semiring::Tropical);
            if r.decision.as_deref() == Some("C") && r.forced_by_obligation { Ok(()) } else { Err("obligation-not-forced".into()) }
        }))),
        ("DB3", "alethic precedence ⇒ CTD escalation", Box::new(|n| trial(n, || {
            let norms = vec![Norm::new("must-c", Modality::Obligatory).priority(5.0).condition(Rc::new(|c: &norm::Ctx| *c.get("duty").unwrap_or(&false))).ctd(Norm::new("escalate-DPO", Modality::Obligatory))];
            let opts = vec![
                govern::GOpt { id: "A".into(), value: feas_v(), utility: Some(99.0), ctx: ctx_of(&[]) },
                govern::GOpt { id: "C".into(), value: infeas_v(), utility: Some(1.0), ctx: ctx_of(&[("duty", true)]) },
            ];
            let r = govern::govern(&opts, &greq(), &norms, Semiring::Tropical);
            if r.decision.is_none() && r.escalation.as_ref().map(|e| e.repair.as_str()) == Some("escalate-DPO") { Ok(()) } else { Err("no-escalation".into()) }
        }))),
    ]
}

// ---------------- TEMPORAL generators ----------------
fn t_atoms() -> Vec<t::Formula> {
    vec![
        t::atom("even", Rc::new(|s: &t::State| s.v % 2 == 0)),
        t::atom("hi", Rc::new(|s: &t::State| s.v >= 3)),
        t::atom("pos", Rc::new(|s: &t::State| s.v > 0)),
    ]
}
fn r_atom() -> t::Formula { t_atoms()[idx(3)].clone() }
fn r_form(d: i32) -> t::Formula {
    if d <= 0 { return r_atom(); }
    match idx(8) {
        0 => r_atom(),
        1 => t::not(r_form(d - 1)),
        2 => t::and(r_form(d - 1), r_form(d - 1)),
        3 => t::or(r_form(d - 1), r_form(d - 1)),
        4 => t::next(r_form(d - 1)),
        5 => t::always(r_form(d - 1)),
        6 => t::eventually(r_form(d - 1)),
        _ => t::until(r_form(d - 1), r_form(d - 1)),
    }
}
fn r_traj() -> Vec<t::State> {
    let len = 1 + idx(6);
    (0..len).map(|_| t::State::with_v(idx(5) as i64)).collect()
}
fn sat(f: &t::Formula, tau: &[t::State]) -> bool {
    t::monitor(f, tau).verdict == "satisfied"
}

fn temp_laws() -> Vec<(&'static str, &'static str, LawFn)> {
    vec![
        ("T1", "G,F idempotent (GGφ≡Gφ)", Box::new(|n| trial(n, || {
            let a = r_form(2); let tau = r_traj();
            if t::eval_direct(&t::always(t::always(a.clone())), &tau, 0) == t::eval_direct(&t::always(a.clone()), &tau, 0)
                && t::eval_direct(&t::eventually(t::eventually(a.clone())), &tau, 0) == t::eval_direct(&t::eventually(a.clone()), &tau, 0) { Ok(()) } else { Err("idem".into()) }
        }))),
        ("T2", "duality (¬Gφ≡F¬φ, ¬Fφ≡G¬φ)", Box::new(|n| trial(n, || {
            let a = r_form(2); let tau = r_traj();
            if t::eval_direct(&t::not(t::always(a.clone())), &tau, 0) == t::eval_direct(&t::eventually(t::not(a.clone())), &tau, 0)
                && t::eval_direct(&t::not(t::eventually(a.clone())), &tau, 0) == t::eval_direct(&t::always(t::not(a.clone())), &tau, 0) { Ok(()) } else { Err("dual".into()) }
        }))),
        ("T3", "∧,∨ commutative + idempotent", Box::new(|n| trial(n, || {
            let a = r_form(2); let b = r_form(2); let tau = r_traj();
            if t::eval_direct(&t::and(a.clone(), b.clone()), &tau, 0) == t::eval_direct(&t::and(b.clone(), a.clone()), &tau, 0)
                && t::eval_direct(&t::or(a.clone(), b.clone()), &tau, 0) == t::eval_direct(&t::or(b.clone(), a.clone()), &tau, 0)
                && t::eval_direct(&t::and(a.clone(), a.clone()), &tau, 0) == t::eval_direct(&a, &tau, 0) { Ok(()) } else { Err("lattice".into()) }
        }))),
        ("T4", "progression faithful (monitor ≡ direct)", Box::new(|n| trial(n, || {
            let a = r_form(2); let tau = r_traj();
            if sat(&a, &tau) == t::eval_direct(&a, &tau, 0) { Ok(()) } else { Err("progress≠direct".into()) }
        }))),
        ("T5", "safety finite-witness / liveness never-early", Box::new(|n| trial(n, || {
            let p = r_atom(); let tau = r_traj();
            let g = t::monitor(&t::always(p.clone()), &tau);
            if g.verdict == "violated" && !g.online.iter().any(|x| x == "vio") { return Err("safety-no-witness".into()); }
            let f = t::monitor(&t::eventually(p.clone()), &tau);
            if f.online.iter().any(|x| x == "vio") { Err("liveness-early-false".into()) } else { Ok(()) }
        }))),
        ("T6", "G/∧ and F/∨ distribute", Box::new(|n| trial(n, || {
            let a = r_form(1); let b = r_form(1); let tau = r_traj();
            if t::eval_direct(&t::always(t::and(a.clone(), b.clone())), &tau, 0) == t::eval_direct(&t::and(t::always(a.clone()), t::always(b.clone())), &tau, 0)
                && t::eval_direct(&t::eventually(t::or(a.clone(), b.clone())), &tau, 0) == t::eval_direct(&t::or(t::eventually(a.clone()), t::eventually(b.clone())), &tau, 0) { Ok(()) } else { Err("dist".into()) }
        }))),
        ("T7", "until fixpoint (φUψ≡ψ∨(φ∧X(φUψ)))", Box::new(|n| trial(n, || {
            let a = r_form(1); let b = r_form(1); let tau = r_traj();
            let lhs = t::until(a.clone(), b.clone());
            let rhs = t::or(b.clone(), t::and(a.clone(), t::next(t::until(a.clone(), b.clone()))));
            if t::eval_direct(&lhs, &tau, 0) == t::eval_direct(&rhs, &tau, 0) { Ok(()) } else { Err("until-fix".into()) }
        }))),
        ("T8", "lasso GF/FG + G/F vs unrolling", Box::new(|n| trial(n, || {
            let p = r_atom(); let stem = r_traj(); let loop_ = r_traj();
            let pred = if let t::Formula::Atom(_, pr) = &p { pr.clone() } else { unreachable!() };
            let some_loop = loop_.iter().any(|s| pred(s));
            let every_loop = loop_.iter().all(|s| pred(s));
            if t::monitor_lasso(&t::gf(p.clone()), &stem, &loop_) != some_loop { return Err("GF".into()); }
            if t::monitor_lasso(&t::fg(p.clone()), &stem, &loop_) != every_loop { return Err("FG".into()); }
            let mut unroll = stem.clone();
            for _ in 0..3 { unroll.extend(loop_.iter().cloned()); }
            if t::monitor_lasso(&t::always(p.clone()), &stem, &loop_) != t::eval_direct(&t::always(p.clone()), &unroll, 0) { return Err("G-unroll".into()); }
            if t::monitor_lasso(&t::eventually(p.clone()), &stem, &loop_) == t::eval_direct(&t::eventually(p.clone()), &unroll, 0) { Ok(()) } else { Err("F-unroll".into()) }
        }))),
    ]
}

// ---------------- TEMPORAL BRIDGE ----------------
fn tbr_laws() -> Vec<(&'static str, &'static str, LawFn)> {
    vec![
        ("TB1", "safety shield prunes a violating step", Box::new(|n| trial(n, || {
            let safe = t::always(t::atom("β≥.8", Rc::new(|s: &t::State| s.beta >= 0.8)));
            let hist = vec![t::State::with_beta(0.95), t::State::with_beta(0.9)];
            let r = supervise::residual_of(&safe, &hist);
            if supervise::guard(&r, &t::State::with_beta(0.5)) && !supervise::guard(&r, &t::State::with_beta(0.95)) { Ok(()) } else { Err("shield".into()) }
        }))),
        ("TB2", "unmet liveness ⇒ escalation at horizon", Box::new(|n| trial(n, || {
            let spec = supervise::TemporalSpec::new("reach-goal", t::eventually(t::atom("done", Rc::new(|s: &t::State| s.done))), supervise::Kind::Liveness, Some("escalate-replan".into()));
            let miss = supervise::supervise(&[t::State::with_done(false), t::State::with_done(false)], std::slice::from_ref(&spec));
            let hit = supervise::supervise(&[t::State::with_done(false), t::State::with_done(true)], std::slice::from_ref(&spec));
            let ok = miss.escalation.as_ref().map(|s| s[0].repair == "escalate-replan").unwrap_or(false) && hit.escalation.is_none();
            if ok { Ok(()) } else { Err("esc".into()) }
        }))),
        ("TB3", "safety violation ⇒ unsafe verdict", Box::new(|n| trial(n, || {
            let spec = supervise::TemporalSpec::new("never-low", t::always(t::atom("β≥.8", Rc::new(|s: &t::State| s.beta >= 0.8))), supervise::Kind::Safety, None);
            let r = supervise::supervise(&[t::State::with_beta(0.9), t::State::with_beta(0.5), t::State::with_beta(0.9)], std::slice::from_ref(&spec));
            if !r.safe && r.reports[0].violated_at == Some(1) { Ok(()) } else { Err("unsafe".into()) }
        }))),
    ]
}

// ---------------- REFLEXIVE generators ----------------
fn nm(id: &str, m: Modality, pri: f64, target: Option<&str>) -> Norm {
    let mut x = Norm::new(id, m).priority(pri);
    if let Some(t) = target { x = x.target(t); }
    x
}
fn rand_nm() -> Norm {
    let m = [Modality::Permitted, Modality::Obligatory, Modality::Forbidden][idx(3)];
    let target = ["t1", "t2"][idx(2)];
    nm(&format!("n{}", idx(1_000_000)), m, idx(5) as f64, Some(target))
}

fn refl_laws() -> Vec<(&'static str, &'static str, LawFn)> {
    vec![
        ("R1", "success (enact adds, repeal removes)", Box::new(|n| trial(n, || {
            let p = reflexive::Policy::with_norms(vec![nm("a", Modality::Permitted, 0.0, None)]);
            let x = rand_nm(); let xid = x.id.clone();
            let r1 = reflexive::revise(&p, &reflexive::enact(reflexive::Item::Norm(x)));
            if !r1.accepted || !r1.policy.norms.iter().any(|q| q.id == xid) { return Err("enact".into()); }
            let r2 = reflexive::revise(&r1.policy, &reflexive::repeal(&xid));
            if r2.accepted && !r2.policy.norms.iter().any(|q| q.id == xid) { Ok(()) } else { Err("repeal".into()) }
        }))),
        ("R2", "consistency (no surviving dominated conflict)", Box::new(|n| trial(n, || {
            let ns: Vec<Norm> = (0..4).map(|_| rand_nm()).collect();
            let arb = reflexive::arbitrate(&ns);
            for a in &arb.norms { for b in &arb.norms {
                let dom = b.priority > a.priority || (b.priority == a.priority && b.time > a.time);
                let conf = a.id != b.id && a.target.is_some() && a.target == b.target && ((a.modality == Modality::Obligatory && b.modality == Modality::Forbidden) || (a.modality == Modality::Forbidden && b.modality == Modality::Obligatory));
                if conf && dom { return Err("dominated-survivor".into()); }
            }}
            Ok(())
        }))),
        ("R3", "minimal change (enact∘repeal = id)", Box::new(|n| trial(n, || {
            let p = reflexive::Policy::with_norms(vec![nm("a", Modality::Permitted, 0.0, None), nm("b", Modality::Obligatory, 3.0, None)]);
            let xid = format!("x{}", idx(100_000));
            let x = nm(&xid, Modality::Permitted, 0.0, None);
            let after = reflexive::revise(&reflexive::revise(&p, &reflexive::enact(reflexive::Item::Norm(x))).policy, &reflexive::repeal(&xid)).policy;
            if reflexive::policy_key(&after) == reflexive::policy_key(&p) { Ok(()) } else { Err("not-minimal".into()) }
        }))),
        ("R4", "entrenchment (no weakening the core)", Box::new(|n| trial(n, || {
            let p = reflexive::entrench(&reflexive::Policy::with_norms(vec![nm("safe", Modality::Forbidden, 10.0, None)]), "safe");
            if reflexive::revise(&p, &reflexive::repeal("safe")).accepted { return Err("repealed-entrenched".into()); }
            if reflexive::revise(&p, &reflexive::amend("safe", reflexive::Item::Norm(nm("safe", Modality::Permitted, 0.0, None)))).accepted { return Err("weakened-entrenched".into()); }
            let strong = reflexive::revise(&p, &reflexive::amend("safe", reflexive::Item::Norm(nm("safe", Modality::Forbidden, 20.0, None))));
            if strong.accepted && strong.policy.norms.iter().find(|q| q.id == "safe").map(|q| q.priority) == Some(20.0) { Ok(()) } else { Err("strengthen-blocked".into()) }
        }))),
        ("R5", "lex superior (priority wins)", Box::new(|n| trial(n, || {
            let hi = nm("hi", Modality::Forbidden, 9.0, Some("g")); let lo = nm("lo", Modality::Obligatory, 2.0, Some("g"));
            let a = reflexive::arbitrate(&[hi, lo]);
            if a.norms.iter().any(|q| q.id == "hi") && a.overridden.contains(&"lo".to_string()) { Ok(()) } else { Err("superior".into()) }
        }))),
        ("R6", "lex posterior (recency breaks ties)", Box::new(|n| trial(n, || {
            let mut old = nm("old", Modality::Forbidden, 5.0, Some("g")); old.time = 1.0;
            let mut neu = nm("new", Modality::Obligatory, 5.0, Some("g")); neu.time = 9.0;
            let a = reflexive::arbitrate(&[old, neu]);
            if a.norms.iter().any(|q| q.id == "new") && a.overridden.contains(&"old".to_string()) { Ok(()) } else { Err("posterior".into()) }
        }))),
        ("R7", "arbitration idempotent", Box::new(|n| trial(n, || {
            let ns: Vec<Norm> = (0..4).map(|_| rand_nm()).collect();
            let a1 = reflexive::arbitrate(&ns); let a2 = reflexive::arbitrate(&a1.norms);
            if a2.overridden.is_empty() && a2.norms.len() == a1.norms.len() { Ok(()) } else { Err("not-idempotent".into()) }
        }))),
        ("R8", "reflective stability (fixpoint)", Box::new(|n| trial(n, || {
            let p = reflexive::entrench(&reflexive::Policy::with_norms(vec![nm("safe", Modality::Forbidden, 10.0, None)]), "safe");
            let props = vec![
                reflexive::enact(reflexive::Item::Norm(nm("p1", Modality::Permitted, 0.0, None))),
                reflexive::repeal("safe"),
                reflexive::enact(reflexive::Item::Norm(nm("p2", Modality::Obligatory, 1.0, None))),
            ];
            let s1 = reflexive::stabilize(&p, &props, 12);
            let s2 = reflexive::stabilize(&s1.policy, &props, 12);
            if s1.stable && reflexive::policy_key(&s2.policy) == reflexive::policy_key(&s1.policy) { Ok(()) } else { Err("unstable".into()) }
        }))),
    ]
}

fn refb_laws() -> Vec<(&'static str, &'static str, LawFn)> {
    vec![
        ("RB1", "cannot self-permit the forbidden", Box::new(|n| trial(n, || {
            let p = reflexive::entrench(&reflexive::Policy::with_norms(vec![nm("forbid-X", Modality::Forbidden, 10.0, Some("X"))]), "forbid-X");
            if !reflexive::revise(&p, &reflexive::enact(reflexive::Item::Norm(nm("force-X", Modality::Obligatory, 10.0, Some("X"))))).accepted { Ok(()) } else { Err("self-permitted".into()) }
        }))),
        ("RB2", "revision propagates to govern", Box::new(|n| trial(n, || {
            let mk = |id: &str, util: f64, x: bool| govern::GOpt { id: id.into(), value: { let mut v = Value::v0(); v.beta = 0.99; v.kappa = false; v }, utility: Some(util), ctx: ctx_of(&[("x", x)]) };
            let a = mk("A", 99.0, true); let b = govern::GOpt { id: "B".into(), value: { let mut v = Value::v0(); v.beta = 0.99; v.kappa = false; v }, utility: Some(1.0), ctx: ctx_of(&[]) };
            let before = govern::govern(std::slice::from_ref(&a), &greq(), &[], Semiring::Tropical);
            let _ = before;
            let opts = vec![a, b];
            let before2 = govern::govern(&opts, &greq(), &[], Semiring::Tropical);
            if before2.decision.as_deref() != Some("A") { return Err("pre".into()); }
            let forbid = Norm::new("forbid-A", Modality::Forbidden).priority(5.0).condition(Rc::new(|c: &norm::Ctx| *c.get("x").unwrap_or(&false)));
            let pol = reflexive::revise(&reflexive::Policy::new(), &reflexive::enact(reflexive::Item::Norm(forbid)));
            let after = govern::govern(&opts, &greq(), &pol.policy.norms, Semiring::Tropical);
            if after.decision.as_deref() == Some("B") && after.deontically_vetoed.iter().any(|v| v.id == "A") { Ok(()) } else { Err("no-propagate".into()) }
        }))),
        ("RB3", "entrenched safety survives in supervise", Box::new(|n| trial(n, || {
            let spec = supervise::TemporalSpec::new("floor", t::always(t::atom("β", Rc::new(|s: &t::State| s.beta >= 0.8))), supervise::Kind::Safety, None);
            let mut p = reflexive::Policy::new();
            p.specs.push(spec);
            p = reflexive::entrench(&p, "floor");
            if reflexive::revise(&p, &reflexive::repeal("floor")).accepted { return Err("repealed".into()); }
            let r = supervise::supervise(&[t::State::with_beta(0.9), t::State::with_beta(0.5)], &p.specs);
            if !r.safe && r.reports[0].violated_at == Some(1) { Ok(()) } else { Err("not-enforced".into()) }
        }))),
    ]
}

// ---------------- EPISTEMIC generators ----------------
const EATOMS: [&str; 3] = ["p", "q", "r"];

// monotonically increasing world identity — mirrors JS distinct object references
fn next_world_id() -> u64 {
    use std::cell::Cell;
    thread_local!(static C: Cell<u64> = Cell::new(0));
    C.with(|c| { let v = c.get(); c.set(v + 1); v })
}
fn rand_world() -> ep::World {
    let mut w = ep::World::new(next_world_id());
    for a in EATOMS.iter() { w.set(a, chance(0.5)); }
    w
}
fn e_atom() -> ep::EFormula { ep::atom(EATOMS[idx(3)]) }

fn partition_model() -> ep::Model {
    let nw = 3 + idx(4);
    let worlds: Vec<ep::World> = (0..nw).map(|_| rand_world()).collect();
    let k = 1 + idx(worlds.len());
    let cell: Vec<usize> = worlds.iter().map(|_| idx(k)).collect();
    let actual = worlds[idx(worlds.len())].clone();
    let ws = worlds.clone();
    let access: std::collections::BTreeMap<String, ep::Access> = {
        let mut m = std::collections::BTreeMap::new();
        let ws2 = ws.clone(); let cell2 = cell.clone();
        m.insert("a".to_string(), Rc::new(move |w: &ep::World| {
            let i = ws2.iter().position(|x| x == w);
            match i { Some(i) => ws2.iter().enumerate().filter(|(j, _)| cell2[*j] == cell2[i]).map(|(_, x)| x.clone()).collect(), None => vec![] }
        }) as ep::Access);
        m
    };
    ep::Model { worlds, actual, access }
}

fn belief_model() -> ep::Model {
    let nw = 4 + idx(3);
    let worlds: Vec<ep::World> = (0..nw).map(|_| rand_world()).collect();
    let d: Vec<ep::World> = worlds.iter().filter(|_| chance(0.5)).cloned().collect();
    let dox = if d.is_empty() { vec![worlds[0].clone()] } else { d };
    let actual = worlds[idx(worlds.len())].clone();
    let mut access = std::collections::BTreeMap::new();
    access.insert("a".to_string(), Rc::new(move |_: &ep::World| dox.clone()) as ep::Access);
    ep::Model { worlds, actual, access }
}

fn cm_model(agents: &[&str]) -> ep::Model {
    let nw = 3 + idx(4);
    let worlds: Vec<ep::World> = (0..nw).map(|_| rand_world()).collect();
    let actual = worlds[idx(worlds.len())].clone();
    let mut access = std::collections::BTreeMap::new();
    for ag in agents {
        let k = 1 + idx(worlds.len());
        let cell: Vec<usize> = worlds.iter().map(|_| idx(k)).collect();
        let ws = worlds.clone();
        access.insert(ag.to_string(), Rc::new(move |w: &ep::World| {
            let i = ws.iter().position(|x| x == w);
            match i { Some(i) => ws.iter().enumerate().filter(|(j, _)| cell[*j] == cell[i]).map(|(_, x)| x.clone()).collect(), None => vec![] }
        }) as ep::Access);
    }
    ep::Model { worlds, actual, access }
}

fn ku_model() -> ep::Model {
    let mut w1 = ep::World::new(next_world_id()); w1.set("p", true); w1.set("q", false); w1.set("r", false);
    let mut w2 = ep::World::new(next_world_id()); w2.set("p", false); w2.set("q", false); w2.set("r", false);
    let worlds = vec![w1.clone(), w2.clone()];
    let ws = worlds.clone();
    let mut access = std::collections::BTreeMap::new();
    access.insert("a".to_string(), Rc::new(move |_: &ep::World| ws.clone()) as ep::Access);
    ep::Model { worlds, actual: w1, access }
}

fn epi_laws() -> Vec<(&'static str, &'static str, LawFn)> {
    vec![
        ("E1", "factivity T (Kφ → φ)", Box::new(|n| trial(n, || {
            let m = partition_model(); let f = e_atom();
            if !ep::knows(&m, "a", &f) || ep::holds(&f, &m.actual) { Ok(()) } else { Err("not-factive".into()) }
        }))),
        ("E2", "distribution K (K(φ→ψ)∧Kφ → Kψ)", Box::new(|n| trial(n, || {
            let m = partition_model(); let f = e_atom(); let g = e_atom();
            let imp = ep::implies(f.clone(), g.clone());
            if !(ep::knows(&m, "a", &imp) && ep::knows(&m, "a", &f)) || ep::knows(&m, "a", &g) { Ok(()) } else { Err("no-K".into()) }
        }))),
        ("E3", "positive introspection (Kφ → KKφ)", Box::new(|n| trial(n, || {
            let m = partition_model(); let f = e_atom();
            if !ep::knows(&m, "a", &f) { return Ok(()); }
            if (m.access["a"])(&m.actual).iter().all(|u| ep::knows_at(&m, "a", u, &f)) { Ok(()) } else { Err("no-4".into()) }
        }))),
        ("E4", "negative introspection (¬Kφ → K¬Kφ)", Box::new(|n| trial(n, || {
            let m = partition_model(); let f = e_atom();
            if ep::knows(&m, "a", &f) { return Ok(()); }
            if (m.access["a"])(&m.actual).iter().all(|u| !ep::knows_at(&m, "a", u, &f)) { Ok(()) } else { Err("no-5".into()) }
        }))),
        ("E5", "belief consistency D (¬(Bφ ∧ B¬φ))", Box::new(|n| trial(n, || {
            let m = belief_model(); let f = e_atom();
            if !(ep::believes(&m, "a", &f, 0.6) && ep::believes(&m, "a", &ep::not(f.clone()), 0.6)) { Ok(()) } else { Err("inconsistent".into()) }
        }))),
        ("E6", "knowledge ⇒ belief (Kφ → Bφ)", Box::new(|n| trial(n, || {
            let m = partition_model(); let f = e_atom();
            if !ep::knows(&m, "a", &f) || ep::believes(&m, "a", &f, 1.0) { Ok(()) } else { Err("k-not-b".into()) }
        }))),
        ("E7", "learning monotonicity (announce preserves K)", Box::new(|n| trial(n, || {
            let m = partition_model(); let f = e_atom();
            if !ep::knows(&m, "a", &f) { return Ok(()); }
            let psi = e_atom(); if !ep::holds(&psi, &m.actual) { return Ok(()); }
            if ep::knows(&ep::announce(&m, &psi), "a", &f) { Ok(()) } else { Err("lost-knowledge".into()) }
        }))),
        ("E8", "common knowledge (Cφ → Eφ)", Box::new(|n| trial(n, || {
            let ags = ["a", "b"]; let m = cm_model(&ags); let f = e_atom();
            if !ep::common(&m, &ags, &f) || ep::everyone(&m, &ags, &f) { Ok(()) } else { Err("c-not-e".into()) }
        }))),
    ]
}

fn epb_laws() -> Vec<(&'static str, &'static str, LawFn)> {
    vec![
        ("EB1", "threshold gate monotone; K = belief@1", Box::new(|n| trial(n, || {
            let m = partition_model(); let f = e_atom();
            let lo = rnd(0.0, 0.5); let hi = rnd(0.5, 1.0);
            if ep::believes_at(&m, "a", &m.actual, &f, hi) && !ep::believes_at(&m, "a", &m.actual, &f, lo) { return Err("not-monotone".into()); }
            if !ep::knows(&m, "a", &f) || ep::believes(&m, "a", &f, 1.0) { Ok(()) } else { Err("gate".into()) }
        }))),
        ("EB2", "known-unknown ⇒ deliberate (κ)", Box::new(|n| trial(n, || {
            let m = ku_model(); let f = ep::atom("p");
            if ep::knows_it_doesnt_know(&m, "a", &f) { if ep::route(&m, "a", &f) == "deliberate" { Ok(()) } else { Err("route".into()) } } else { Ok(()) }
        }))),
        ("EB3", "pooled knowledge dominates individual", Box::new(|n| trial(n, || {
            let ags = ["a", "b"]; let m = cm_model(&ags); let f = e_atom();
            if !ep::knows(&m, "a", &f) || ep::distributed(&m, &ags, &f) { Ok(()) } else { Err("pool".into()) }
        }))),
    ]
}

// ---------------- STRATEGIC generators ----------------
fn sp() -> st::SFormula { st::atom("p", Rc::new(|s: &st::GState| s.p)) }
fn sq() -> st::SFormula { st::atom("q", Rc::new(|s: &st::GState| s.q)) }
fn rand_sf() -> st::SFormula {
    match idx(5) {
        0 => sp(),
        1 => sq(),
        2 => st::not(sp()),
        3 => st::and(sp(), sq()),
        _ => st::or(sp(), sq()),
    }
}
fn rand_game(agents: &[&str]) -> st::Game {
    let nstates = 3 + idx(3);
    let states: Vec<st::GState> = (0..nstates).map(|i| st::GState { name: format!("s{}", i), p: chance(0.5), q: chance(0.5) }).collect();
    // move counts per (agent, state)
    let mut nm_map: std::collections::BTreeMap<String, i64> = std::collections::BTreeMap::new();
    for a in agents { for s in &states { nm_map.insert(format!("{}@{}", a, s.name), 1 + if chance(0.5) { 1 } else { 0 }); } }
    let nm_for_moves = nm_map.clone();
    let moves: Rc<dyn Fn(&str, &st::GState) -> Vec<i64>> = Rc::new(move |a: &str, s: &st::GState| {
        let cnt = *nm_for_moves.get(&format!("{}@{}", a, s.name)).unwrap_or(&1);
        (0..cnt).collect()
    });
    // transition table
    let agents_owned: Vec<String> = agents.iter().map(|s| s.to_string()).collect();
    let mut tbl: std::collections::BTreeMap<String, st::GState> = std::collections::BTreeMap::new();
    for s in &states {
        let mut acc: Vec<std::collections::BTreeMap<String, i64>> = vec![std::collections::BTreeMap::new()];
        for a in &agents_owned {
            let cnt = *nm_map.get(&format!("{}@{}", a, s.name)).unwrap_or(&1);
            let mut nx = Vec::new();
            for p in &acc { for m in 0..cnt { let mut np = p.clone(); np.insert(a.clone(), m); nx.push(np); } }
            acc = nx;
        }
        for jm in acc {
            let key = format!("{}|{}", s.name, agents_owned.iter().map(|a| jm[a].to_string()).collect::<Vec<_>>().join(","));
            tbl.insert(key, states[idx(states.len())].clone());
        }
    }
    let agents_for_delta = agents_owned.clone();
    let delta: Rc<dyn Fn(&st::GState, &st::JointMove) -> st::GState> = Rc::new(move |s: &st::GState, jm: &st::JointMove| {
        let key = format!("{}|{}", s.name, agents_for_delta.iter().map(|a| jm[a].to_string()).collect::<Vec<_>>().join(","));
        tbl.get(&key).cloned().unwrap()
    });
    st::Game { states, agents: agents_owned, moves, delta }
}
fn some_state(m: &st::Game) -> st::GState { m.states[idx(m.states.len())].clone() }

// external controllable predecessor (mirrors the test's force1ext)
fn force1ext<F: Fn(&st::GState) -> bool>(model: &st::Game, c: &[&str], state: &st::GState, in_set: F) -> bool {
    let comp: Vec<String> = model.agents.iter().filter(|a| !c.contains(&a.as_str())).cloned().collect();
    let c_owned: Vec<String> = c.iter().map(|s| s.to_string()).collect();
    let product = |agents: &[String]| -> Vec<st::JointMove> {
        let mut acc: Vec<st::JointMove> = vec![std::collections::BTreeMap::new()];
        for a in agents {
            let ms = (model.moves)(a, state);
            let mut nx = Vec::new();
            for p in &acc { for mv in &ms { let mut np = p.clone(); np.insert(a.clone(), *mv); nx.push(np); } }
            acc = nx;
        }
        acc
    };
    let cm = product(&c_owned); let om = product(&comp);
    cm.iter().any(|cmove| om.iter().all(|omove| {
        let mut joint = cmove.clone();
        for (k, v) in omove { joint.insert(k.clone(), *v); }
        in_set(&(model.delta)(state, &joint))
    }))
}

fn reach_bfs(m: &st::Game, f: &st::SFormula) -> Vec<st::GState> {
    let mut w: Vec<st::GState> = m.states.iter().filter(|s| st::holds(f, s)).cloned().collect();
    loop {
        let snapshot = w.clone();
        let add: Vec<st::GState> = m.states.iter().filter(|q| {
            !snapshot.iter().any(|x| x == *q) && (m.moves)("a", q).iter().any(|mv| {
                let mut jm = std::collections::BTreeMap::new(); jm.insert("a".to_string(), *mv);
                snapshot.iter().any(|x| x == &(m.delta)(q, &jm))
            })
        }).cloned().collect();
        if add.is_empty() { return w; }
        w.extend(add);
    }
}

fn product2(model: &st::Game, agents: &[&str], state: &st::GState) -> Vec<st::JointMove> {
    let mut acc: Vec<st::JointMove> = vec![std::collections::BTreeMap::new()];
    for a in agents {
        let ms = (model.moves)(a, state);
        let mut nx = Vec::new();
        for p in &acc { for mv in &ms { let mut np = p.clone(); np.insert(a.to_string(), *mv); nx.push(np); } }
        acc = nx;
    }
    acc
}

fn str_laws() -> Vec<(&'static str, &'static str, LawFn)> {
    vec![
        ("S1", "unit: [C]⊤ and ¬[C]⊥", Box::new(|n| trial(n, || {
            let m = rand_game(&["1", "2"]); let q = some_state(&m);
            let c: Vec<&str> = if chance(0.5) { vec!["1"] } else { vec!["1", "2"] };
            if st::effectivity(&m, &c, &q, &st::top()) && !st::effectivity(&m, &c, &q, &st::bot()) { Ok(()) } else { Err("unit".into()) }
        }))),
        ("S2", "coalition monotonicity (C ⊆ C′ ⇒ [C]φ → [C′]φ)", Box::new(|n| trial(n, || {
            let m = rand_game(&["1", "2"]); let q = some_state(&m); let f = rand_sf();
            if !st::effectivity(&m, &["1"], &q, &f) || st::effectivity(&m, &["1", "2"], &q, &f) { Ok(()) } else { Err("coalition-mono".into()) }
        }))),
        ("S3", "outcome monotonicity (φ⊨ψ ⇒ [C]φ → [C]ψ)", Box::new(|n| trial(n, || {
            let m = rand_game(&["1", "2"]); let q = some_state(&m); let f = rand_sf(); let g = st::or(f.clone(), sq());
            if !st::effectivity(&m, &["1"], &q, &f) || st::effectivity(&m, &["1"], &q, &g) { Ok(()) } else { Err("outcome-mono".into()) }
        }))),
        ("S4", "superadditivity (disjoint C₁,C₂ cooperate)", Box::new(|n| trial(n, || {
            let m = rand_game(&["1", "2"]); let q = some_state(&m); let f1 = rand_sf(); let f2 = rand_sf();
            if !(st::effectivity(&m, &["1"], &q, &f1) && st::effectivity(&m, &["2"], &q, &f2)) || st::effectivity(&m, &["1", "2"], &q, &st::and(f1.clone(), f2.clone())) { Ok(()) } else { Err("superadd".into()) }
        }))),
        ("S5", "regularity (¬([C]φ ∧ [N∖C]¬φ))", Box::new(|n| trial(n, || {
            let m = rand_game(&["1", "2"]); let q = some_state(&m); let f = rand_sf();
            if !(st::effectivity(&m, &["1"], &q, &f) && st::effectivity(&m, &["2"], &q, &st::not(f.clone()))) { Ok(()) } else { Err("not-regular".into()) }
        }))),
        ("S6", "maintenance is a greatest fixpoint (□)", Box::new(|n| trial(n, || {
            let m = rand_game(&["1", "2"]); let f = rand_sf(); let c = ["1"];
            let w = st::can_maintain(&m, &c, &f);
            let in_w = |s: &st::GState| w.iter().any(|x| x == s);
            let reapply: Vec<&st::GState> = m.states.iter().filter(|q| st::holds(&f, q) && force1ext(&m, &c, q, &in_w)).collect();
            if w.iter().all(|q| st::holds(&f, q)) && reapply.len() == w.len() { Ok(()) } else { Err("gfp".into()) }
        }))),
        ("S7", "reachability is a least fixpoint (◊)", Box::new(|n| trial(n, || {
            let m = rand_game(&["1", "2"]); let f = rand_sf(); let c = ["1"];
            let w = st::can_reach(&m, &c, &f);
            let in_w = |s: &st::GState| w.iter().any(|x| x == s);
            let reapply: Vec<&st::GState> = m.states.iter().filter(|q| st::holds(&f, q) || force1ext(&m, &c, q, &in_w)).collect();
            if m.states.iter().filter(|s| st::holds(&f, s)).all(|q| w.iter().any(|x| x == q)) && reapply.len() == w.len() { Ok(()) } else { Err("lfp".into()) }
        }))),
        ("S8", "grand-coalition determinacy ([Σ]φ ↔ ∃ successor φ)", Box::new(|n| trial(n, || {
            let m = rand_game(&["1", "2"]); let q = some_state(&m); let f = rand_sf();
            let g: Vec<&str> = m.agents.iter().map(|s| s.as_str()).collect();
            let some_succ = product2(&m, &g, &q).iter().any(|jm| st::holds(&f, &(m.delta)(&q, jm)));
            if st::effectivity(&m, &g, &q, &f) == some_succ { Ok(()) } else { Err("determinacy".into()) }
        }))),
    ]
}

fn sb_laws() -> Vec<(&'static str, &'static str, LawFn)> {
    vec![
        ("SB1", "single-agent collapse → temporal reachability", Box::new(|n| trial(n, || {
            let m = rand_game(&["a"]); let f = rand_sf();
            let w = st::can_reach(&m, &["a"], &f); let b = reach_bfs(&m, &f);
            if w.len() == b.len() && w.iter().all(|q| b.iter().any(|x| x == q)) { Ok(()) } else { Err("collapse".into()) }
        }))),
        ("SB2", "ought-implies-can (¬ability ⇒ escalate)", Box::new(|n| trial(n, || {
            let m = rand_game(&["1", "2"]); let q = some_state(&m); let f = rand_sf(); let c = ["1"];
            let can = st::can_ensure(&m, &c, &f, &q);
            if st::oblige(&m, &c, &f, &q) == (if can { "discharge" } else { "escalate" }) { Ok(()) } else { Err("oic".into()) }
        }))),
        ("SB3", "coordination needs ability ∧ common knowledge", Box::new(|n| trial(n, || {
            let m = rand_game(&["1", "2"]); let q = some_state(&m); let f = rand_sf(); let c = ["1", "2"]; let ck = chance(0.5);
            let ex = st::executable(&m, &c, &f, &q, ck);
            if ex == (st::can_ensure(&m, &c, &f, &q) && ck) { Ok(()) } else { Err("coord".into()) }
        }))),
    ]
}

// ---------------- RESOURCE generators ----------------
fn rand_ledger() -> res::Ledger {
    let mut l = res::Ledger::new();
    l.kind.insert("tokens".into(), "depletable".into());
    l.kind.insert("money".into(), "depletable".into());
    l.kind.insert("capacity".into(), "capacity".into());
    l.kind.insert("skill".into(), "reusable".into());
    for a in ["a", "b", "c", "d"] {
        let mut r = std::collections::BTreeMap::new();
        r.insert("tokens".to_string(), ri(10) as i64);
        r.insert("money".to_string(), ri(10) as i64);
        r.insert("skill".to_string(), if chance(0.5) { 1 } else { 0 });
        l.bal.insert(a.to_string(), r);
    }
    let mut treasury = std::collections::BTreeMap::new();
    treasury.insert("tokens".to_string(), 50); treasury.insert("money".to_string(), 50);
    l.bal.insert(res::TREASURY.to_string(), treasury);
    l.bal.insert(res::SINK.to_string(), std::collections::BTreeMap::new());
    let mut free = std::collections::BTreeMap::new(); free.insert("capacity".to_string(), 10 + ri(10) as i64);
    l.bal.insert(res::FREE.to_string(), free);
    l
}
fn avail(l: &res::Ledger, r: &str) -> i64 {
    ["a", "b", "c", "d"].iter().map(|a| res::balance(l, a, r)).sum()
}

fn reso_laws() -> Vec<(&'static str, &'static str, LawFn)> {
    vec![
        ("C1", "conservation under transfer (Σ invariant)", Box::new(|n| trial(n, || {
            let l = rand_ledger(); let r = if chance(0.5) { "tokens" } else { "money" };
            let accts = ["a", "b", "c", "d", res::TREASURY, res::SINK];
            let from = accts[ri(accts.len())]; let to = accts[ri(accts.len())];
            let b = res::total(&l, r);
            let m = res::transfer(&l, r, from, to, ri(6) as i64);
            let after = match m { Some(mm) => res::total(&mm, r), None => b };
            if after == b { Ok(()) } else { Err("not-conserved".into()) }
        }))),
        ("C2", "no overdraft; balances stay ≥ 0", Box::new(|n| trial(n, || {
            let l = rand_ledger(); let from = ["a", "b", "c", "d"][ri(4)];
            let over = res::transfer(&l, "tokens", from, "a", res::balance(&l, from, "tokens") + 1 + ri(3) as i64);
            if over.is_some() { return Err("overdraft-allowed".into()); }
            let amt = res::balance(&l, from, "tokens").min(ri(4) as i64);
            let ok = res::transfer(&l, "tokens", from, "b", amt);
            match ok { None => Ok(()), Some(m) => if m.bal.values().all(|r| r.values().all(|v| *v >= 0)) { Ok(()) } else { Err("negative".into()) } }
        }))),
        ("C3", "independent transactions commute (CRDT)", Box::new(|n| trial(n, || {
            let l = rand_ledger(); let r = "tokens";
            let a1 = res::balance(&l, "a", r).min(ri(4) as i64); let a2 = res::balance(&l, "c", r).min(ri(4) as i64);
            let m12 = res::transfer(&res::transfer(&l, r, "a", "b", a1).unwrap(), r, "c", "d", a2).unwrap();
            let m21 = res::transfer(&res::transfer(&l, r, "c", "d", a2).unwrap(), r, "a", "b", a1).unwrap();
            if ["a", "b", "c", "d"].iter().all(|x| res::balance(&m12, x, r) == res::balance(&m21, x, r)) { Ok(()) } else { Err("noncommutative".into()) }
        }))),
        ("C4", "linearity — spending depletes (not idempotent)", Box::new(|n| trial(n, || {
            let l = rand_ledger(); let a = ["a", "b", "c", "d"][ri(4)];
            let start = res::balance(&l, a, "tokens"); if start < 2 { return Ok(()); }
            let m = res::spend(&res::spend(&l, a, "tokens", 1).unwrap(), a, "tokens", 1).unwrap();
            if res::balance(&m, a, "tokens") == start - 2 { Ok(()) } else { Err("not-linear".into()) }
        }))),
        ("C5", "reusability — using `!` does not deplete (idempotent)", Box::new(|n| trial(n, || {
            let l = rand_ledger(); let a = ["a", "b", "c", "d"][ri(4)];
            if res::balance(&l, a, "skill") < 1 { return Ok(()); }
            let u1 = res::use_res(&l, a, "skill"); let u2 = res::use_res(&u1.l, a, "skill");
            if u1.ok && u2.ok && res::balance(&u2.l, a, "skill") == res::balance(&l, a, "skill") { Ok(()) } else { Err("depleted".into()) }
        }))),
        ("C6", "flow monotonicity — depletion only decreases", Box::new(|n| trial(n, || {
            let mut l = rand_ledger(); let mut prev = avail(&l, "tokens");
            for _ in 0..4 {
                let a = ["a", "b", "c", "d"][ri(4)];
                let amt = res::balance(&l, a, "tokens").min(ri(3) as i64);
                let m = res::spend(&l, a, "tokens", amt);
                if let Some(mm) = m { let now = avail(&mm, "tokens"); if now > prev { return Err("increased".into()); } prev = now; l = mm; }
            }
            Ok(())
        }))),
        ("C7", "capacity conservation (stability + plasticity)", Box::new(|n| trial(n, || {
            let mut l = rand_ledger(); let start = res::total(&l, "capacity");
            for _ in 0..3 {
                let t = format!("T{}", ri(3));
                l = if chance(0.6) {
                    let amt = res::balance(&l, res::FREE, "capacity").min(ri(4) as i64);
                    res::allocate(&l, &t, amt).unwrap_or(l)
                } else { res::forget(&l, &t, "mind") };
            }
            if res::total(&l, "capacity") == start { Ok(()) } else { Err("capacity-leaked".into()) }
        }))),
        ("C8", "no free reclaim — forgetting releases the knowledge", Box::new(|n| trial(n, || {
            let mut l = rand_ledger(); let amt = res::balance(&l, res::FREE, "capacity").min(1 + ri(4) as i64);
            l = res::allocate(&l, "T", amt).unwrap(); l = res::consolidate(&l, "T", "mind");
            let before = res::balance(&l, "mind", "know:T"); let m = res::forget(&l, "T", "mind");
            if before == 1 && res::balance(&m, "mind", "know:T") == 0 && res::balance(&m, res::FREE, "capacity") >= amt { Ok(()) } else { Err("kept-both".into()) }
        }))),
    ]
}

fn resb_laws() -> Vec<(&'static str, &'static str, LawFn)> {
    vec![
        ("CB1", "exhaustion ⇒ infeasible (the alethic 0̲ gate)", Box::new(|n| trial(n, || {
            let l = rand_ledger(); let a = ["a", "b", "c", "d"][ri(4)]; let c = ri(12) as i64;
            if res::feasible(&l, a, &[("tokens", c)]) == (res::balance(&l, a, "tokens") >= c) { Ok(()) } else { Err("gate".into()) }
        }))),
        ("CB2", "cost composes additively along a pipeline (semiring)", Box::new(|n| trial(n, || {
            let l = rand_ledger(); let a = ["a", "b", "c", "d"][ri(4)];
            let (c1, c2, c3) = (ri(3) as i64, ri(3) as i64, ri(3) as i64);
            if res::balance(&l, a, "tokens") < c1 + c2 + c3 { return Ok(()); }
            let seq = res::spend(&res::spend(&res::spend(&l, a, "tokens", c1).unwrap(), a, "tokens", c2).unwrap(), a, "tokens", c3).unwrap();
            let lump = res::spend(&l, a, "tokens", c1 + c2 + c3).unwrap();
            if res::balance(&seq, a, "tokens") == res::balance(&lump, a, "tokens") { Ok(()) } else { Err("not-additive".into()) }
        }))),
        ("CB3", "Type-II repair pricing (value ≥ cost ∧ affordable)", Box::new(|n| trial(n, || {
            let l = rand_ledger(); let a = ["a", "b", "c", "d"][ri(4)];
            let value = ri(8) as i64; let cost = ri(8) as i64;
            let r = res::repair(&l, a, "tokens", value, cost);
            let exp = if !res::affords(&l, a, &[("tokens", cost)]) { "cannot-afford" } else if value >= cost { "invoke" } else { "skip" };
            if r.decision != exp { return Err("wrong-decision".into()); }
            if r.decision == "invoke" && res::balance(&r.l, a, "tokens") != res::balance(&l, a, "tokens") - cost { return Err("no-charge".into()); }
            Ok(())
        }))),
    ]
}

// ---------------- harness ----------------
struct Suite {
    label: &'static str,
    semiring: Option<Semiring>,
    laws: Vec<(&'static str, &'static str, LawFn)>,
}

fn main() {
    let n = 2000;
    let suites: Vec<Suite> = vec![
        Suite { label: "Invariant (L1–L14)", semiring: None, laws: inv_laws() },
        Suite { label: "Heuristic (H1–H13) · tropical dioid", semiring: Some(Semiring::Tropical), laws: heur_laws(Semiring::Tropical) },
        Suite { label: "Bridge (B1–B3)", semiring: None, laws: br_laws() },
        Suite { label: "Deontic (D1–D9)", semiring: None, laws: deon_laws() },
        Suite { label: "Deontic bridge (DB1–DB3)", semiring: None, laws: dbr_laws() },
        Suite { label: "Temporal (T1–T8)", semiring: None, laws: temp_laws() },
        Suite { label: "Temporal bridge (TB1–TB3)", semiring: None, laws: tbr_laws() },
        Suite { label: "Reflexive (R1–R8)", semiring: None, laws: refl_laws() },
        Suite { label: "Reflexive bridge (RB1–RB3)", semiring: None, laws: refb_laws() },
        Suite { label: "Epistemic (E1–E8)", semiring: None, laws: epi_laws() },
        Suite { label: "Epistemic bridge (EB1–EB3)", semiring: None, laws: epb_laws() },
        Suite { label: "Strategic (S1–S8)", semiring: None, laws: str_laws() },
        Suite { label: "Strategic bridge (SB1–SB3)", semiring: None, laws: sb_laws() },
        Suite { label: "Resource (C1–C8)", semiring: None, laws: reso_laws() },
        Suite { label: "Resource bridge (CB1–CB3)", semiring: None, laws: resb_laws() },
    ];

    let line = "─".repeat(48);
    println!("\nbox-and-box law harness (Rust port) · {} trials/law\n{}", n, line);

    let mut total_fail = 0usize;
    let mut grand_pass = 0usize;
    let mut grand_total = 0usize;
    for suite in &suites {
        let _ = suite.semiring; // tropical is the conformance default used in HEUR
        let mut pass = 0usize;
        let mut fails: Vec<(String, String, String, usize)> = Vec::new();
        for (id, desc, f) in &suite.laws {
            match f(n) {
                Ok(_) => pass += 1,
                Err((reason, at)) => fails.push((id.to_string(), desc.to_string(), reason, at)),
            }
        }
        let count = suite.laws.len();
        grand_pass += pass;
        grand_total += count;
        let fail = count - pass;
        total_fail += fail;
        if fail == 0 {
            println!("{}: {}/{} pass", suite.label, pass, count);
        } else {
            println!("{}: {}/{} pass, {} fail", suite.label, pass, count, fail);
            for (id, desc, reason, at) in &fails {
                println!("  ✗ {} {} — {} @trial {}", id, desc, reason, at);
            }
        }
    }
    println!("{}", line);
    println!("grand total: {}/{} laws pass", grand_pass, grand_total);
    println!("{}", line);
    println!("{}", if total_fail == 0 { "✓ all stated laws hold.\n" } else { "✗ some law(s) failed.\n" });
    std::process::exit(if total_fail == 0 { 0 } else { 1 });
}
