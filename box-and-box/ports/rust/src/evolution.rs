// evolution.rs — the Evolution surface (faithful port of evolution.mjs). Laws EV1–EV6.
// NOT a ninth rung. A BRIDGE that joins three existing rungs to decide whether a POLICY may
// change for the better, recording the verdict on a tamper-evident provenance chain:
//   · reflexive (rung 5)  — MAY it change?  (entrenched floor is un-weakenable)
//   · axiological (rung 2) — DID it improve? (non-regression over a guard set — the L-E6 crux)
//   · resource (rung 8)   — is the change WORTH its price? (Type-II)

use crate::reflexive::{admissible, policy_key, revise, Amendment, Policy};
use crate::resource::{affords, spend, Ledger};
use std::collections::BTreeMap;

pub const GENESIS: &str = "00000000";

// ---- a minimal JSON value, so canon/digest reproduce JS content-addressing -----------------
#[derive(Clone)]
pub enum Json {
    Null,
    Bool(bool),
    Int(i64),
    Float(f64),
    Str(String),
    Arr(Vec<Json>),
    Obj(BTreeMap<String, Json>), // BTreeMap keeps keys sorted ⇒ canon is key-order independent
}

impl Json {
    pub fn get(&self, key: &str) -> Option<&Json> {
        if let Json::Obj(m) = self {
            m.get(key)
        } else {
            None
        }
    }
    pub fn as_str(&self) -> Option<&str> {
        if let Json::Str(s) = self {
            Some(s)
        } else {
            None
        }
    }
}

// JSON string escaping (mirrors JSON.stringify for the characters that occur in practice).
fn json_quote(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

// canon : canonical JSON — object keys sorted, so the digest is key-order independent.
pub fn canon(x: &Json) -> String {
    match x {
        Json::Null => "null".to_string(),
        Json::Bool(b) => if *b { "true" } else { "false" }.to_string(),
        Json::Int(i) => i.to_string(),
        Json::Float(f) => {
            if f.is_finite() && f.fract() == 0.0 {
                format!("{}", *f as i64)
            } else {
                format!("{}", f)
            }
        }
        Json::Str(s) => json_quote(s),
        Json::Arr(a) => {
            let parts: Vec<String> = a.iter().map(canon).collect();
            format!("[{}]", parts.join(","))
        }
        Json::Obj(m) => {
            let parts: Vec<String> = m
                .iter()
                .map(|(k, v)| format!("{}:{}", json_quote(k), canon(v)))
                .collect();
            format!("{{{}}}", parts.join(","))
        }
    }
}

// hash : FNV-1a 32-bit — pure, deterministic. (Tamper-evidence, not secrecy.)
pub fn hash(s: &str) -> String {
    let mut h: u32 = 0x811c9dc5;
    for b in s.bytes() {
        h ^= b as u32;
        h = h.wrapping_mul(0x01000193);
    }
    format!("{:08x}", h)
}

pub fn digest(obj: &Json) -> String {
    hash(&canon(obj))
}

// Record links a payload to its predecessor by content hash.
#[derive(Clone)]
pub struct Record {
    pub id: String,
    pub prev: String,
    pub payload: Json,
}

pub fn record(payload: &Json, prev: &str) -> Record {
    Record {
        id: hash(&format!("{}{}", prev, canon(payload))),
        prev: prev.to_string(),
        payload: payload.clone(),
    }
}

pub fn chain(payloads: &[Json], prev: &str) -> Vec<Record> {
    let mut out = Vec::new();
    let mut p = prev.to_string();
    for pl in payloads {
        let r = record(pl, &p);
        p = r.id.clone();
        out.push(r);
    }
    out
}

pub struct VerifyResult {
    pub ok: bool,
    pub reason: String,
}

pub fn verify(records: &[Record], prev: &str) -> VerifyResult {
    let mut p = prev.to_string();
    for r in records {
        if r.prev != p {
            return VerifyResult { ok: false, reason: format!("broken link at {}", r.id) };
        }
        if record(&r.payload, &r.prev).id != r.id {
            return VerifyResult { ok: false, reason: format!("tampered payload at {}", r.id) };
        }
        p = r.id.clone();
    }
    VerifyResult { ok: true, reason: String::new() }
}

// regresses : non-regression (the L-E6 crux) — no guard metric may drop below its prior value.
pub fn regresses(before: &[f64], after: &[f64]) -> bool {
    let tol = 1e-9;
    let n = before.len().min(after.len());
    for i in 0..n {
        if after[i] < before[i] - tol {
            return true;
        }
    }
    false
}

pub fn delta(before: &[f64], after: &[f64]) -> f64 {
    let sb: f64 = before.iter().sum();
    let sa: f64 = after.iter().sum();
    ((sa - sb) * 1e6 + 0.5).floor() / 1e6 // mirror JS Math.round
}

// Evidence is the third argument to evolve (kw-args in JS). Ledger amounts are i64 (resource.rs).
pub struct Evidence {
    pub before: Vec<f64>,
    pub after: Vec<f64>,
    pub price: Option<i64>,
    pub ledger: Option<Ledger>,
    pub account: String,
    pub resource: String,
    pub prev: String,
}

impl Evidence {
    pub fn new(before: Vec<f64>, after: Vec<f64>) -> Evidence {
        Evidence {
            before,
            after,
            price: None,
            ledger: None,
            account: "self".to_string(),
            resource: "tokens".to_string(),
            prev: GENESIS.to_string(),
        }
    }
}

// EvolveResult is the verdict returned by evolve. (No EV law reads the revised Policy directly —
// the certificate carries policyBefore/policyAfter keys — so it is not re-materialised here.)
pub struct EvolveResult {
    pub decision: String,
    pub reason: String,
    pub ledger: Option<Ledger>,
    pub certificate: Json,
    pub record: Record,
}

// evolve : may this policy change, did it measurably improve, is it worth paying for?
pub fn evolve(policy: &Policy, amendment: &Amendment, ev: Evidence) -> EvolveResult {
    let observed = delta(&ev.before, &ev.after);
    let reg = regresses(&ev.before, &ev.after);
    let adm = admissible(policy, amendment);
    let policy_before_key = policy_key(policy);

    let mut decision: String;
    let mut reason: String;
    let mut ledger_after = ev.ledger.clone();
    let mut priced = false;

    if !adm.ok {
        decision = "reject".to_string();
        reason = format!("reflexive: {}", adm.reason.clone().unwrap_or_default()); // floor wins
    } else if reg {
        decision = "reject".to_string();
        reason = "axiological: a guard metric would regress".to_string();
    } else if let Some(price) = ev.price {
        priced = true; // Type-II pricing
        let l = ev.ledger.clone().unwrap_or_else(Ledger::new);
        if !affords(&l, &ev.account, &[(ev.resource.as_str(), price)]) {
            decision = "escalate".to_string();
            reason = format!("resource: cannot afford the change ({} {})", price, ev.resource);
        } else if !(observed >= price as f64) {
            decision = "reject".to_string();
            reason = format!("resource: not worthwhile (Δ {} < {})", observed, price);
        } else {
            match spend(&l, &ev.account, &ev.resource, price) {
                None => {
                    decision = "escalate".to_string();
                    reason = format!("resource: cannot afford the change ({} {})", price, ev.resource);
                }
                Some(charged) => {
                    decision = "accept".to_string();
                    reason = format!("priced: Δ {} ≥ {} {}", observed, price, ev.resource);
                    ledger_after = Some(charged);
                }
            }
        }
    } else {
        decision = "accept".to_string();
        reason = "admissible, non-regressing (unpriced)".to_string();
    }

    let mut policy_after_key = policy_before_key.clone();
    if decision == "accept" {
        let r = revise(policy, amendment);
        if r.accepted {
            policy_after_key = policy_key(&r.policy);
        } else {
            // dead in practice (accept ⇒ admissible ⇒ revise accepts), but mirror JS reverse-charge
            decision = "reject".to_string();
            reason = "reflexive: revision rejected".to_string();
            ledger_after = ev.ledger.clone();
        }
    }

    let (op, target) = match amendment {
        Amendment::Enact { item, .. } => ("enact", Json::Str(item.id().to_string())),
        Amendment::Repeal { id, .. } => ("repeal", Json::Str(id.clone())),
        Amendment::Amend { item, .. } => ("amend", Json::Str(item.id().to_string())),
    };

    let mut cert: BTreeMap<String, Json> = BTreeMap::new();
    cert.insert("decision".to_string(), Json::Str(decision.clone()));
    cert.insert("reason".to_string(), Json::Str(reason.clone()));
    cert.insert("op".to_string(), Json::Str(op.to_string()));
    cert.insert("target".to_string(), target);
    cert.insert("predicted".to_string(), Json::Null);
    cert.insert("observed".to_string(), Json::Float(observed));
    cert.insert("verified".to_string(), Json::Null);
    cert.insert("regressed".to_string(), Json::Bool(reg));
    cert.insert("priced".to_string(), Json::Bool(priced));
    cert.insert(
        "price".to_string(),
        match ev.price {
            Some(p) => Json::Int(p),
            None => Json::Null,
        },
    );
    cert.insert("policyBefore".to_string(), Json::Str(policy_before_key));
    cert.insert("policyAfter".to_string(), Json::Str(policy_after_key));
    cert.insert(
        "rungs".to_string(),
        Json::Arr(vec![
            Json::Str("reflexive".to_string()),
            Json::Str("axiological".to_string()),
            Json::Str("resource".to_string()),
        ]),
    );
    let certificate = Json::Obj(cert);
    let rec = record(&certificate, &ev.prev);
    EvolveResult {
        decision,
        reason,
        ledger: ledger_after,
        certificate,
        record: rec,
    }
}
