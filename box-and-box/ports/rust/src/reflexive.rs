// reflexive.rs — Reflexive Arithmetic / AGM policy revision (faithful port of reflexive.mjs).
// Laws R1–R8, RB1–RB3. The capstone guarantee is ENTRENCHMENT: a constitutional core is
// immutable to weakening.

use crate::norm::{Modality, Norm};
use crate::supervise::TemporalSpec;
use std::collections::HashSet;

pub struct Policy {
    pub norms: Vec<Norm>,
    pub specs: Vec<TemporalSpec>,
    pub entrenched: HashSet<String>,
}

impl Policy {
    pub fn new() -> Policy {
        Policy {
            norms: Vec::new(),
            specs: Vec::new(),
            entrenched: HashSet::new(),
        }
    }
    pub fn with_norms(norms: Vec<Norm>) -> Policy {
        Policy {
            norms,
            specs: Vec::new(),
            entrenched: HashSet::new(),
        }
    }
}

// amendments — the three legal moves over a body of norms
#[derive(Clone)]
pub enum Amendment {
    Enact { item: Item, authority: String, time: f64 },
    Repeal { id: String, authority: String, time: f64 },
    Amend { id: String, item: Item, authority: String, time: f64 },
}

#[derive(Clone)]
pub enum Item {
    Norm(Norm),
    Spec(TemporalSpec),
}

impl Item {
    #[allow(dead_code)]
    pub fn id(&self) -> &str {
        match self {
            Item::Norm(n) => &n.id,
            Item::Spec(s) => &s.id,
        }
    }
}

pub fn enact(item: Item) -> Amendment {
    Amendment::Enact { item, authority: "self".into(), time: 0.0 }
}
pub fn enact_at(item: Item, time: f64) -> Amendment {
    Amendment::Enact { item, authority: "self".into(), time }
}
pub fn repeal(id: &str) -> Amendment {
    Amendment::Repeal { id: id.to_string(), authority: "self".into(), time: 0.0 }
}
pub fn amend(id: &str, item: Item) -> Amendment {
    Amendment::Amend { id: id.to_string(), item, authority: "self".into(), time: 0.0 }
}

fn find_norm<'a>(policy: &'a Policy, id: &str) -> Option<&'a Norm> {
    policy.norms.iter().find(|n| n.id == id)
}

fn conflicts(a: &Norm, b: &Norm) -> bool {
    a.target.is_some()
        && a.target == b.target
        && ((a.modality == Modality::Obligatory && b.modality == Modality::Forbidden)
            || (a.modality == Modality::Forbidden && b.modality == Modality::Obligatory))
}

fn dedupe(arr: Vec<Norm>) -> Vec<Norm> {
    // last occurrence wins, preserving final order of last-seen keys (mirrors JS Map)
    let mut order: Vec<String> = Vec::new();
    let mut map: std::collections::HashMap<String, Norm> = std::collections::HashMap::new();
    for x in arr {
        if !map.contains_key(&x.id) {
            order.push(x.id.clone());
        }
        map.insert(x.id.clone(), x);
    }
    order.into_iter().map(|k| map.remove(&k).unwrap()).collect()
}

pub struct Admissible {
    pub ok: bool,
    pub reason: Option<String>,
}

// the reflexive guard: admissible only if it does not WEAKEN the entrenched core
pub fn admissible(policy: &Policy, am: &Amendment) -> Admissible {
    match am {
        Amendment::Repeal { id, .. } => {
            if policy.entrenched.contains(id) {
                Admissible { ok: false, reason: Some(format!("\u{201c}{}\u{201d} is entrenched — cannot be repealed", id)) }
            } else {
                Admissible { ok: true, reason: None }
            }
        }
        Amendment::Amend { id, item, .. } => {
            if !policy.entrenched.contains(id) {
                return Admissible { ok: true, reason: None };
            }
            let cur = find_norm(policy, id);
            let next = match item {
                Item::Norm(n) => Some(n),
                Item::Spec(_) => None,
            };
            match (cur, next) {
                (Some(cur), Some(next)) => {
                    let stronger = next.modality == cur.modality && next.priority >= cur.priority;
                    if stronger {
                        Admissible { ok: true, reason: None }
                    } else {
                        Admissible { ok: false, reason: Some(format!("amendment would weaken entrenched \u{201c}{}\u{201d}", id)) }
                    }
                }
                _ => Admissible { ok: false, reason: Some(format!("\u{201c}{}\u{201d} is entrenched — cannot be amended", id)) },
            }
        }
        Amendment::Enact { item, .. } => {
            if let Item::Norm(n) = item {
                for id in &policy.entrenched {
                    if let Some(e) = find_norm(policy, id) {
                        if conflicts(e, n) && n.priority >= e.priority {
                            return Admissible {
                                ok: false,
                                reason: Some(format!("enacted norm would override entrenched \u{201c}{}\u{201d}", id)),
                            };
                        }
                    }
                }
            }
            Admissible { ok: true, reason: None }
        }
    }
}

pub struct Arbitration {
    pub norms: Vec<Norm>,
    pub overridden: Vec<String>,
}

// arbitrate same-target conflicts: lex superior (priority) then lex posterior (recency)
pub fn arbitrate(norms: &[Norm]) -> Arbitration {
    let mut overridden: Vec<String> = Vec::new();
    for a in norms {
        for b in norms {
            if std::ptr::eq(a, b) || !conflicts(a, b) {
                continue;
            }
            let a_wins = a.priority > b.priority
                || (a.priority == b.priority && a.time > b.time);
            if a_wins && !overridden.contains(&b.id) {
                overridden.push(b.id.clone());
            }
        }
    }
    Arbitration {
        norms: norms
            .iter()
            .filter(|n| !overridden.contains(&n.id))
            .cloned()
            .collect(),
        overridden,
    }
}

pub struct Revision {
    pub policy: Policy,
    pub accepted: bool,
    pub overridden: Vec<String>,
}

fn clone_policy(p: &Policy) -> Policy {
    Policy {
        norms: p.norms.clone(),
        specs: p.specs.iter().map(clone_spec).collect(),
        entrenched: p.entrenched.clone(),
    }
}

fn clone_spec(s: &TemporalSpec) -> TemporalSpec {
    TemporalSpec {
        id: s.id.clone(),
        formula: s.formula.clone(),
        kind: s.kind,
        ctd: s.ctd.clone(),
    }
}

// revise the policy by an amendment, if admissible
pub fn revise(policy: &Policy, am: &Amendment) -> Revision {
    let adm = admissible(policy, am);
    if !adm.ok {
        return Revision {
            policy: clone_policy(policy),
            accepted: false,
            overridden: Vec::new(),
        };
    }
    let mut next = clone_policy(policy);
    match am {
        Amendment::Enact { item, authority, time } => match item {
            Item::Norm(n) => {
                let mut nn = n.clone();
                nn.time = *time;
                let _ = authority;
                next.norms.push(nn);
            }
            Item::Spec(s) => next.specs.push(clone_spec(s)),
        },
        Amendment::Repeal { id, .. } => {
            next.norms.retain(|n| &n.id != id);
            next.specs.retain(|s| &s.id != id);
        }
        Amendment::Amend { id, item, time, .. } => match item {
            Item::Norm(n) => {
                next.norms = next
                    .norms
                    .into_iter()
                    .map(|x| {
                        if &x.id == id {
                            let mut nn = n.clone();
                            nn.time = *time;
                            nn
                        } else {
                            x
                        }
                    })
                    .collect();
            }
            Item::Spec(s) => {
                next.specs = next
                    .specs
                    .into_iter()
                    .map(|x| if &x.id == id { clone_spec(s) } else { x })
                    .collect();
            }
        },
    }
    next.norms = dedupe(next.norms);
    let arb = arbitrate(&next.norms);
    next.norms = arb.norms;
    Revision {
        policy: next,
        accepted: true,
        overridden: arb.overridden,
    }
}

// entrenching is monotone
pub fn entrench(policy: &Policy, id: &str) -> Policy {
    let mut next = clone_policy(policy);
    next.entrenched.insert(id.to_string());
    next
}

pub fn policy_key(p: &Policy) -> String {
    let mut n: Vec<String> = p
        .norms
        .iter()
        .map(|x| format!("{}|{:?}|{}", x.id, x.modality, x.priority))
        .collect();
    n.sort();
    let mut s: Vec<String> = p.specs.iter().map(|x| x.id.clone()).collect();
    s.sort();
    let mut e: Vec<String> = p.entrenched.iter().cloned().collect();
    e.sort();
    format!("n={:?};s={:?};e={:?}", n, s, e)
}

pub struct Stabilization {
    pub policy: Policy,
    pub rounds: usize,
    pub stable: bool,
}

// reflective stability: apply proposals until the policy stops changing (a fixed point)
pub fn stabilize(policy: &Policy, proposals: &[Amendment], max_rounds: usize) -> Stabilization {
    let mut cur = clone_policy(policy);
    for round in 0..max_rounds {
        let mut changed = false;
        for am in proposals {
            let r = revise(&cur, am);
            if r.accepted && policy_key(&r.policy) != policy_key(&cur) {
                cur = r.policy;
                changed = true;
            }
        }
        if !changed {
            return Stabilization {
                policy: cur,
                rounds: round + 1,
                stable: true,
            };
        }
    }
    Stabilization {
        policy: cur,
        rounds: max_rounds,
        stable: false,
    }
}
