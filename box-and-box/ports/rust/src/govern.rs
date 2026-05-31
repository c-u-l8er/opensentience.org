// govern.rs — three-modality decision (faithful port of govern.mjs). Laws DB1–DB3.
// Precedence: ALETHIC ▸ DEONTIC ▸ AXIOLOGICAL.

use crate::norm::{adjudicate_status, escalate, resolve, Ctx, Modality, Norm, Status};
use crate::score::Semiring;
use crate::value::{consume, round, Failure, Requirements, Value};

pub struct GOpt {
    pub id: String,
    pub value: Value,
    pub utility: Option<f64>,
    pub ctx: Ctx,
}

#[derive(Clone)]
pub struct DeonticVeto {
    pub id: String,
}

#[derive(Clone)]
pub struct AlethicVeto {
    pub id: String,
    pub failures: Vec<Failure>,
}

pub struct EscalationInfo {
    pub required: bool,
    pub repair: String,
    pub reason: String,
    pub blocked_option: String,
    pub blocked_by: Vec<Failure>,
}

pub struct RankEntry {
    pub id: String,
    pub score: f64,
    pub status: Status,
}

pub struct GovernResult {
    pub decision: Option<String>,
    pub forced_by_obligation: bool,
    pub escalation: Option<EscalationInfo>,
    pub margin: Option<f64>,
    pub ranking: Vec<RankEntry>,
    pub deontically_vetoed: Vec<DeonticVeto>,
    pub alethically_vetoed: Vec<AlethicVeto>,
}

struct Ev {
    id: String,
    utility: f64,
    ctx: Ctx,
    feasible: bool,
    feas_fail: Vec<Failure>,
    status: Status,
    #[allow(dead_code)]
    overridden: Vec<String>,
    contributors: Vec<crate::norm::Contributor>,
}

fn has(contributors: &[crate::norm::Contributor], id: &str) -> bool {
    contributors.iter().any(|c| c.id == id)
}

pub fn govern(options: &[GOpt], req: &Requirements, norms: &[Norm], s: Semiring) -> GovernResult {
    let ev: Vec<Ev> = options
        .iter()
        .map(|o| {
            let feas = consume(&o.value, req);
            let v = resolve(&adjudicate_status(&o.ctx, norms));
            Ev {
                id: o.id.clone(),
                utility: o.utility.unwrap_or_else(|| s.one()),
                ctx: o.ctx.clone(),
                feasible: feas.ok,
                feas_fail: feas.failures,
                status: v.resolved.unwrap_or(v.status),
                overridden: v.overridden,
                contributors: v.contributors,
            }
        })
        .collect();

    let alethically_vetoed: Vec<AlethicVeto> = ev
        .iter()
        .filter(|e| !e.feasible)
        .map(|e| AlethicVeto {
            id: e.id.clone(),
            failures: e.feas_fail.clone(),
        })
        .collect();

    let survivors: Vec<&Ev> = ev.iter().filter(|e| e.feasible).collect();

    let deontically_vetoed: Vec<DeonticVeto> = survivors
        .iter()
        .filter(|e| e.status == Status::Forbidden)
        .map(|e| DeonticVeto { id: e.id.clone() })
        .collect();

    let admissible: Vec<&&Ev> = survivors
        .iter()
        .filter(|e| e.status == Status::Optional || e.status == Status::Obligatory)
        .collect();
    let obligatory_feasible: Vec<&&Ev> = admissible
        .iter()
        .filter(|e| e.status == Status::Obligatory)
        .cloned()
        .collect();

    // contrary-to-duty
    let obliged_but_blocked: Vec<&Ev> = ev
        .iter()
        .filter(|e| e.status == Status::Obligatory && !e.feasible)
        .collect();

    let mut escalation: Option<EscalationInfo> = None;
    if !obliged_but_blocked.is_empty() && obligatory_feasible.is_empty() {
        let blocked = obliged_but_blocked[0];
        let nrm = norms
            .iter()
            .find(|n| n.modality == Modality::Obligatory && has(&blocked.contributors, &n.id))
            .or_else(|| norms.iter().find(|n| n.modality == Modality::Obligatory));
        let esc = escalate(nrm, &blocked.ctx);
        escalation = Some(EscalationInfo {
            required: true,
            repair: esc.repair.id.clone(),
            reason: esc.reason,
            blocked_option: blocked.id.clone(),
            blocked_by: blocked.feas_fail.clone(),
        });
    }
    // a surviving unresolved conflict also escalates
    let conflicted: Vec<&&Ev> = survivors
        .iter()
        .filter(|e| e.status == Status::Conflict)
        .collect();
    if escalation.is_none() && !conflicted.is_empty() {
        escalation = Some(EscalationInfo {
            required: true,
            repair: "escalate-to-human".into(),
            reason: format!("unresolved conflict on {}", conflicted[0].id),
            blocked_option: conflicted[0].id.clone(),
            blocked_by: Vec::new(),
        });
    }

    // selection — obligation forces the pool; otherwise rank all admissible
    let mut pool: Vec<&&Ev> = if !obligatory_feasible.is_empty() {
        obligatory_feasible.clone()
    } else {
        admissible.clone()
    };
    pool.sort_by(|a, b| b.utility.partial_cmp(&a.utility).unwrap());

    let chosen = if escalation.is_some() {
        None
    } else {
        pool.first().map(|e| e.id.clone())
    };
    let margin = if pool.len() > 1 {
        Some(round(pool[0].utility - pool[1].utility))
    } else {
        None
    };
    let ranking: Vec<RankEntry> = pool
        .iter()
        .map(|e| RankEntry {
            id: e.id.clone(),
            score: round(e.utility),
            status: e.status,
        })
        .collect();

    let forced_by_obligation = chosen.is_some() && !obligatory_feasible.is_empty();

    GovernResult {
        decision: chosen,
        forced_by_obligation,
        escalation,
        margin,
        ranking,
        deontically_vetoed,
        alethically_vetoed,
    }
}
