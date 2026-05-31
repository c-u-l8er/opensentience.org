// resource.rs — Resource Arithmetic / linear-logic ledger (faithful port of resource.mjs).
// Laws C1–C8, CB1–CB3. A Ledger is a CLOSED double-entry system — value is conserved.
// Depletable resources obey linear logic; `reusable` resources (`!`) are used freely.

use std::collections::BTreeMap;

pub const SINK: &str = "#sink";
pub const TREASURY: &str = "#treasury";
pub const FREE: &str = "free";

#[derive(Clone, Debug)]
pub struct Ledger {
    // acct -> (res -> amount)
    pub bal: BTreeMap<String, BTreeMap<String, i64>>,
    pub kind: BTreeMap<String, String>,
}

impl Ledger {
    pub fn new() -> Ledger {
        Ledger {
            bal: BTreeMap::new(),
            kind: BTreeMap::new(),
        }
    }
}

pub fn balance(l: &Ledger, acct: &str, res: &str) -> i64 {
    l.bal.get(acct).and_then(|r| r.get(res)).copied().unwrap_or(0)
}

pub fn total(l: &Ledger, res: &str) -> i64 {
    l.bal.values().map(|r| r.get(res).copied().unwrap_or(0)).sum()
}

// the one primitive: move `amt` of `res` between two accounts. Conserves the grand total.
// Returns None for INFEASIBLE (no overdraft, no negative amount).
pub fn transfer(l: &Ledger, res: &str, from: &str, to: &str, amt: i64) -> Option<Ledger> {
    if amt < 0 || balance(l, from, res) < amt {
        return None;
    }
    let mut m = l.clone();
    let fb = m.bal.entry(from.to_string()).or_default();
    let cur_from = fb.get(res).copied().unwrap_or(0);
    fb.insert(res.to_string(), cur_from - amt);
    let tb = m.bal.entry(to.to_string()).or_default();
    let cur_to = tb.get(res).copied().unwrap_or(0);
    tb.insert(res.to_string(), cur_to + amt);
    Some(m)
}

pub fn spend(l: &Ledger, acct: &str, res: &str, amt: i64) -> Option<Ledger> {
    transfer(l, res, acct, SINK, amt)
}
pub fn refill(l: &Ledger, acct: &str, res: &str, amt: i64) -> Option<Ledger> {
    transfer(l, res, TREASURY, acct, amt)
}

pub fn affords(l: &Ledger, acct: &str, cost: &[(&str, i64)]) -> bool {
    cost.iter().all(|(res, amt)| balance(l, acct, res) >= *amt)
}
pub fn feasible(l: &Ledger, acct: &str, cost: &[(&str, i64)]) -> bool {
    affords(l, acct, cost)
}

pub struct UseResult {
    pub ok: bool,
    pub l: Ledger,
}

// reusable (`!`) vs depletable: `use` depletes a depletable resource, but never a reusable one
pub fn use_res(l: &Ledger, acct: &str, res: &str) -> UseResult {
    if balance(l, acct, res) < 1 {
        return UseResult { ok: false, l: l.clone() };
    }
    if l.kind.get(res).map(|s| s.as_str()) == Some("reusable") {
        return UseResult { ok: true, l: l.clone() };
    }
    UseResult {
        ok: true,
        l: spend(l, acct, res, 1).unwrap_or_else(|| l.clone()),
    }
}

// continual learning: capacity is conserved; knowledge is reusable.
pub fn allocate(l: &Ledger, task: &str, amt: i64) -> Option<Ledger> {
    transfer(l, "capacity", FREE, &format!("task:{}", task), amt)
}

pub fn consolidate(l: &Ledger, task: &str, mind: &str) -> Ledger {
    let mut m = l.clone();
    m.kind.insert(format!("know:{}", task), "reusable".to_string());
    let mb = m.bal.entry(mind.to_string()).or_default();
    mb.insert(format!("know:{}", task), 1);
    m
}

pub fn forget(l: &Ledger, task: &str, mind: &str) -> Ledger {
    let amt = balance(l, &format!("task:{}", task), "capacity");
    let mut m = transfer(l, "capacity", &format!("task:{}", task), FREE, amt)
        .unwrap_or_else(|| l.clone());
    if m.bal.contains_key(mind) {
        m.bal.get_mut(mind).unwrap().insert(format!("know:{}", task), 0);
    }
    m
}

// PRICING THE REPAIRS (Type II rationality)
pub fn worthwhile(value: i64, cost: i64) -> bool {
    value >= cost
}

pub struct RepairResult {
    pub decision: &'static str, // "cannot-afford" | "skip" | "invoke"
    pub l: Ledger,
}

pub fn repair(l: &Ledger, acct: &str, resource: &str, value: i64, cost: i64) -> RepairResult {
    if !affords(l, acct, &[(resource, cost)]) {
        return RepairResult { decision: "cannot-afford", l: l.clone() };
    }
    if !worthwhile(value, cost) {
        return RepairResult { decision: "skip", l: l.clone() };
    }
    RepairResult {
        decision: "invoke",
        l: spend(l, acct, resource, cost).unwrap_or_else(|| l.clone()),
    }
}
