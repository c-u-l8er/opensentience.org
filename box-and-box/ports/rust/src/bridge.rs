// bridge.rs — floor-then-gradient bridge (faithful port of bridge.mjs). Laws B1–B3.
// consume() gates each option on its invariant Value; a vetoed option gets score 0̲
// (which annihilates ⊗), and select() ranks only the feasible survivors.

use crate::score::Semiring;
use crate::value::{consume, Failure, Requirements, Value};

#[derive(Clone)]
pub struct Opt {
    pub id: String,
    pub value: Value,
    pub utility: Option<f64>,
}

pub struct Gated {
    pub score: f64,
    pub ok: bool,
    pub failures: Vec<Failure>,
}

pub fn gated_score(option: &Opt, req: &Requirements, s: Semiring) -> Gated {
    let verdict = consume(&option.value, req);
    let score = if verdict.ok {
        option.utility.unwrap_or_else(|| s.one())
    } else {
        s.zero()
    };
    Gated {
        score,
        ok: verdict.ok,
        failures: verdict.failures,
    }
}

pub struct Ranked {
    pub id: String,
    pub score: f64,
}

pub struct VetoedEntry {
    pub id: String,
    pub raw_would_be: f64,
    pub failures: Vec<Failure>,
}

pub struct Selection {
    pub decision: Option<String>,
    pub margin: Option<f64>,
    pub ranking: Vec<Ranked>,
    pub vetoed: Vec<VetoedEntry>,
    pub floor_enforced: usize,
}

struct Eval {
    id: String,
    raw: f64,
    score: f64,
    ok: bool,
    failures: Vec<Failure>,
}

pub fn select(options: &[Opt], req: &Requirements, s: Semiring) -> Selection {
    let mut evaluated: Vec<Eval> = options
        .iter()
        .map(|o| {
            let g = gated_score(o, req, s);
            Eval {
                id: o.id.clone(),
                raw: o.utility.unwrap_or_else(|| s.one()),
                score: g.score,
                ok: g.ok,
                failures: g.failures,
            }
        })
        .collect();

    let mut feasible: Vec<&Eval> = evaluated.iter().filter(|e| e.ok).collect();
    // sort by score descending (b.score - a.score)
    feasible.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap());
    let vetoed: Vec<&Eval> = evaluated.iter().filter(|e| !e.ok).collect();

    let decision = feasible.first().map(|e| e.id.clone());
    let margin = if feasible.len() > 1 {
        Some(crate::value::round(feasible[0].score - feasible[1].score))
    } else {
        None
    };

    let ranking: Vec<Ranked> = feasible
        .iter()
        .map(|e| Ranked {
            id: e.id.clone(),
            score: fin(e.score),
        })
        .collect();
    let vetoed_out: Vec<VetoedEntry> = vetoed
        .iter()
        .map(|e| VetoedEntry {
            id: e.id.clone(),
            raw_would_be: crate::value::round(e.raw),
            failures: e.failures.clone(),
        })
        .collect();
    let floor_enforced = vetoed.len();

    // touch evaluated to silence unused-mut in some builds
    evaluated.shrink_to_fit();

    Selection {
        decision,
        margin,
        ranking,
        vetoed: vetoed_out,
        floor_enforced,
    }
}

fn fin(x: f64) -> f64 {
    if x == f64::NEG_INFINITY {
        0.0
    } else {
        crate::value::round(x)
    }
}
