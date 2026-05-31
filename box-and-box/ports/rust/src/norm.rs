// norm.rs — Deontic Arithmetic (faithful port of norm.mjs).
// A deontic status lives in a diamond lattice. accrue = join (commutative, associative,
// idempotent monoid; identity OPTIONAL, absorbing CONFLICT). Laws D1–D9.

use std::collections::HashMap;
use std::rc::Rc;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Status {
    Optional,
    Obligatory,
    Forbidden,
    Conflict,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Modality {
    Obligatory,
    Forbidden,
    Permitted,
}

pub fn rank(s: Status) -> i64 {
    match s {
        Status::Optional => 0,
        Status::Obligatory => 1,
        Status::Forbidden => 1,
        Status::Conflict => 2,
    }
}

fn mod2status(m: Modality) -> Status {
    match m {
        Modality::Obligatory => Status::Obligatory,
        Modality::Forbidden => Status::Forbidden,
        Modality::Permitted => Status::Optional,
    }
}

// join : least upper bound on the diamond lattice
pub fn join(a: Status, b: Status) -> Status {
    if a == b {
        return a;
    }
    if a == Status::Optional {
        return b;
    }
    if b == Status::Optional {
        return a;
    }
    if a == Status::Conflict || b == Status::Conflict {
        return Status::Conflict;
    }
    Status::Conflict // {obligatory} ⊔ {forbidden}
}

// Context is an open string->bool map (mirrors the JS ctx objects used in tests)
pub type Ctx = HashMap<String, bool>;
pub type Condition = Rc<dyn Fn(&Ctx) -> bool>;

#[derive(Clone)]
pub struct Norm {
    pub id: String,
    pub modality: Modality,
    pub condition: Condition,
    pub priority: f64,
    pub ctd: Option<Box<Norm>>,
    pub target: Option<String>,
    // recency stamp used by reflexive arbitration (lex posterior)
    pub time: f64,
}

impl Norm {
    pub fn new(id: &str, modality: Modality) -> Norm {
        Norm {
            id: id.to_string(),
            modality,
            condition: Rc::new(|_: &Ctx| true),
            priority: 0.0,
            ctd: None,
            target: None,
            time: 0.0,
        }
    }
    pub fn priority(mut self, p: f64) -> Norm {
        self.priority = p;
        self
    }
    pub fn target(mut self, t: &str) -> Norm {
        self.target = Some(t.to_string());
        self
    }
    pub fn condition(mut self, c: Condition) -> Norm {
        self.condition = c;
        self
    }
    pub fn ctd(mut self, n: Norm) -> Norm {
        self.ctd = Some(Box::new(n));
        self
    }
}

fn safe_cond(n: &Norm, ctx: &Ctx) -> bool {
    (n.condition)(ctx)
}

#[derive(Clone, Debug)]
pub struct Contributor {
    pub id: String,
    pub modality: Modality,
    pub priority: f64,
}

#[derive(Clone, Debug)]
pub struct Verdict {
    pub status: Status,
    pub contributors: Vec<Contributor>,
    pub resolved: Option<Status>,
    pub overridden: Vec<String>,
    pub note: Option<String>,
}

// accrue every applicable norm's status into a single verdict (join), tracking contributors
pub fn adjudicate_status(ctx: &Ctx, norms: &[Norm]) -> Verdict {
    let mut status = Status::Optional;
    let mut contributors = Vec::new();
    for n in norms {
        if !safe_cond(n, ctx) {
            continue;
        }
        contributors.push(Contributor {
            id: n.id.clone(),
            modality: n.modality,
            priority: n.priority,
        });
        status = join(status, mod2status(n.modality));
    }
    Verdict {
        status,
        contributors,
        resolved: None,
        overridden: Vec::new(),
        note: None,
    }
}

// resolve : clear a CONFLICT by priority (idempotent; identity on a non-conflict verdict)
pub fn resolve(verdict: &Verdict) -> Verdict {
    if verdict.status != Status::Conflict {
        return Verdict {
            status: verdict.status,
            contributors: verdict.contributors.clone(),
            resolved: Some(verdict.status),
            overridden: Vec::new(),
            note: None,
        };
    }
    let ob: Vec<&Contributor> = verdict
        .contributors
        .iter()
        .filter(|c| c.modality == Modality::Obligatory)
        .collect();
    let fb: Vec<&Contributor> = verdict
        .contributors
        .iter()
        .filter(|c| c.modality == Modality::Forbidden)
        .collect();
    let max_ob = ob.iter().map(|c| c.priority).fold(f64::NEG_INFINITY, f64::max);
    let max_fb = fb.iter().map(|c| c.priority).fold(f64::NEG_INFINITY, f64::max);
    if max_ob == max_fb {
        return Verdict {
            status: verdict.status,
            contributors: verdict.contributors.clone(),
            resolved: Some(Status::Conflict),
            overridden: Vec::new(),
            note: Some("deadlock: equal priority → escalate".into()),
        };
    }
    let winner_obligatory = max_ob > max_fb;
    let loser: Vec<String> = (if winner_obligatory { &fb } else { &ob })
        .iter()
        .map(|c| c.id.clone())
        .collect();
    let win = if winner_obligatory {
        Status::Obligatory
    } else {
        Status::Forbidden
    };
    Verdict {
        status: win, // makes resolve idempotent
        contributors: verdict.contributors.clone(),
        resolved: Some(win),
        overridden: loser,
        note: Some("resolved".into()),
    }
}

pub struct Detached {
    pub in_force: bool,
    pub repair: Option<Norm>,
}

// detach : factual detachment. A CTD repair detaches ONLY after the primary is violated.
pub fn detach(norm: &Norm, ctx: &Ctx, violated: bool) -> Detached {
    Detached {
        in_force: safe_cond(norm, ctx),
        repair: if violated {
            norm.ctd.as_ref().map(|b| (**b).clone())
        } else {
            None
        },
    }
}

pub struct Compliance {
    pub ok: bool,
    pub violations: Vec<String>,
}

// comply : the gate
pub fn comply(status: Status, intend: bool) -> Compliance {
    let mut violations = Vec::new();
    if status == Status::Forbidden && intend {
        violations.push("performing a forbidden action".to_string());
    }
    if status == Status::Obligatory && !intend {
        violations.push("omitting an obligatory action".to_string());
    }
    if status == Status::Conflict {
        violations.push("unresolved normative conflict".to_string());
    }
    Compliance {
        ok: violations.is_empty(),
        violations,
    }
}

pub struct Escalation {
    pub repair: Norm,
    pub reason: String,
}

// escalate : produce the contrary-to-duty repair obligation now in force
pub fn escalate(norm: Option<&Norm>, _ctx: &Ctx) -> Escalation {
    if let Some(n) = norm {
        if let Some(ctd) = &n.ctd {
            return Escalation {
                repair: (**ctd).clone(),
                reason: format!("CTD: {} violated → {} in force", n.id, ctd.id),
            };
        }
    }
    Escalation {
        repair: Norm::new("escalate-to-human", Modality::Obligatory).priority(f64::INFINITY),
        reason: format!(
            "{} violated, no CTD → default escalation",
            norm.map(|n| n.id.as_str()).unwrap_or("obligation")
        ),
    }
}
