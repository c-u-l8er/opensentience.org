// supervise.rs — trajectory supervision (faithful port of supervise.mjs). Laws TB1–TB3.

use crate::temporal::{monitor, progress, Formula, State};

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Safety,
    Liveness,
}

#[derive(Clone)]
pub struct TemporalSpec {
    pub id: String,
    pub formula: Formula,
    pub kind: Kind,
    pub ctd: Option<String>,
}

impl TemporalSpec {
    pub fn new(id: &str, formula: Formula, kind: Kind, ctd: Option<String>) -> TemporalSpec {
        TemporalSpec {
            id: id.to_string(),
            formula,
            kind,
            ctd,
        }
    }
}

fn first_vio(online: &[String]) -> Option<usize> {
    online.iter().position(|s| s == "vio")
}

pub struct Report {
    pub id: String,
    pub kind: Kind,
    pub verdict: String,
    pub online: Vec<String>,
    pub violated_at: Option<usize>,
    pub escalation: Option<String>,
    pub reason: Option<String>,
}

pub struct SpecEsc {
    pub id: String,
    pub repair: String,
}

pub struct SuperviseResult {
    pub reports: Vec<Report>,
    pub safe: bool,
    pub escalation: Option<Vec<SpecEsc>>,
}

pub fn supervise(trajectory: &[State], specs: &[TemporalSpec]) -> SuperviseResult {
    let reports: Vec<Report> = specs
        .iter()
        .map(|spec| {
            let m = monitor(&spec.formula, trajectory);
            let violated_at = if spec.kind == Kind::Safety {
                first_vio(&m.online)
            } else {
                None
            };
            let (escalation, reason) =
                if spec.kind == Kind::Liveness && m.verdict == "violated" {
                    (
                        Some(spec.ctd.clone().unwrap_or_else(|| "escalate-to-human".into())),
                        Some(format!(
                            "liveness obligation unmet within horizon ({} steps)",
                            trajectory.len()
                        )),
                    )
                } else {
                    (None, None)
                };
            Report {
                id: spec.id.clone(),
                kind: spec.kind,
                verdict: m.verdict,
                online: m.online,
                violated_at,
                escalation,
                reason,
            }
        })
        .collect();

    let safe = !reports
        .iter()
        .any(|r| r.kind == Kind::Safety && r.verdict == "violated");
    let liveness_unmet: Vec<&Report> = reports
        .iter()
        .filter(|r| r.kind == Kind::Liveness && r.verdict == "violated")
        .collect();

    let escalation = if !liveness_unmet.is_empty() {
        Some(
            liveness_unmet
                .iter()
                .map(|r| SpecEsc {
                    id: r.id.clone(),
                    repair: r.escalation.clone().unwrap_or_default(),
                })
                .collect(),
        )
    } else {
        None
    };

    SuperviseResult {
        reports,
        safe,
        escalation,
    }
}

// the one-step shield
pub fn residual_of(formula: &Formula, history: &[State]) -> Formula {
    history.iter().fold(formula.clone(), |f, s| progress(&f, s))
}

pub fn guard(residual: &Formula, next_state: &State) -> bool {
    matches!(progress(residual, next_state), Formula::False)
}
