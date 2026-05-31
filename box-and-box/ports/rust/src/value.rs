// value.rs — Invariant Arithmetic (faithful port of value.mjs).
// A Value is a PRODUCT OF MONOIDS across families. combine merges; chain composes
// along PULSE phases (partial — refuses a backward step); promote/reconcile/deliberate
// are endomorphisms; consume is the boolean gate. Laws L1–L14.

pub const PHASES: [&str; 5] = ["retrieve", "route", "act", "learn", "consolidate"];

pub fn phase_idx(p: &str) -> i64 {
    PHASES.iter().position(|&x| x == p).map(|i| i as i64).unwrap_or(-1)
}

#[derive(Clone, Debug, PartialEq)]
pub struct Value {
    pub n: f64,                 // ℝ under +
    pub kappa: bool,            // Bool under ∨ — cyclicity
    pub beta: f64,              // [0,1] under min — persistence / confidence
    pub sigma: Vec<String>,     // Set<Tag> under ∪ — derived conflicts
    pub pi: Option<String>,     // Phase|null, first-non-null
    pub iota: Option<String>,   // IdemKey, first-non-null
    pub psi: Option<String>,    // Cadence, first-non-null
    pub authority: Vec<String>, // List<Cap> under concat (free monoid)
    pub deny_default: bool,     // Bool under ∧
    pub audit: Vec<String>,     // List<Event> under concat (free monoid)
}

// uniq preserving first-seen order (mirrors JS [...new Set(arr)])
fn uniq(items: &[String]) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for it in items {
        if !out.contains(it) {
            out.push(it.clone());
        }
    }
    out
}

fn first_non_null(a: &Option<String>, b: &Option<String>) -> Option<String> {
    match a {
        Some(_) => a.clone(),
        None => b.clone(),
    }
}

impl Value {
    // identity element of the whole product monoid (V0)
    pub fn v0() -> Value {
        Value {
            n: 0.0,
            kappa: false,
            beta: 1.0,
            sigma: Vec::new(),
            pi: None,
            iota: None,
            psi: None,
            authority: Vec::new(),
            deny_default: true,
            audit: Vec::new(),
        }
    }
}

// ---- combine : Value × Value → Value ----
// componentwise monoid op. Associative with identity V0 ⇒ a monoid.
pub fn combine(a: &Value, b: &Value) -> Value {
    let mut sig = a.sigma.clone();
    sig.extend(b.sigma.iter().cloned());
    let mut auth = a.authority.clone();
    auth.extend(b.authority.iter().cloned());
    let mut aud = a.audit.clone();
    aud.extend(b.audit.iter().cloned());
    Value {
        n: a.n + b.n,
        kappa: a.kappa || b.kappa,
        beta: a.beta.min(b.beta),
        sigma: uniq(&sig),
        pi: first_non_null(&a.pi, &b.pi),
        iota: first_non_null(&a.iota, &b.iota),
        psi: first_non_null(&a.psi, &b.psi),
        authority: auth,
        deny_default: a.deny_default && b.deny_default,
        audit: aud,
    }
}

// chain result is either a Value or a π-violation error
pub enum ChainResult {
    Ok(Value),
    Error(String),
}

// ---- chain : Value × Value → Value (PARTIAL) ----
// Defined only when phase(a) ≤ phase(b); a backward step is REFUSED.
pub fn chain(a: &Value, b: &Value) -> ChainResult {
    if let (Some(pa), Some(pb)) = (&a.pi, &b.pi) {
        if phase_idx(pa) > phase_idx(pb) {
            return ChainResult::Error(format!(
                "π-violation: cannot chain '{}' after '{}'",
                pb, pa
            ));
        }
    }
    let mut r = combine(a, b);
    r.pi = first_non_null(&b.pi, &a.pi); // exit phase
    ChainResult::Ok(r)
}

// ---- promote : Value × Evidence → Value ----
// β-monotone endomorphism: promote(v).β ≥ v.β, always.
pub fn promote(v: &Value, evidence_beta: f64) -> Value {
    let mut r = v.clone();
    r.beta = v.beta.max(evidence_beta);
    r
}

// ---- reconcile : Value × Set<Tag> → Value ----
// σ-antitone, idempotent endomorphism: removes resolved conflict tags.
pub fn reconcile(v: &Value, tags: &[String]) -> Value {
    let mut r = v.clone();
    r.sigma = v.sigma.iter().filter(|t| !tags.contains(t)).cloned().collect();
    r
}

// ---- deliberate : Value → Value ----
// κ-antitone, idempotent endomorphism: forces κ = false.
pub fn deliberate(v: &Value) -> Value {
    let mut r = v.clone();
    r.kappa = false;
    r
}

#[derive(Clone, Debug)]
pub struct Failure {
    pub family: String,
    pub why: String,
}

#[derive(Clone, Debug, Default)]
pub struct Requirements {
    pub beta_min: Option<f64>,
    pub sigma_empty: bool,
    pub acyclic: bool,
    pub phase: Option<String>,
    pub forward_from: Option<String>,
    pub deny_default_must_allow: bool,
    pub authorized: bool,
}

pub struct ConsumeResult {
    pub ok: bool,
    pub failures: Vec<Failure>,
}

// ---- consume : Value × Requirements → {ok, failures} ----
pub fn consume(v: &Value, req: &Requirements) -> ConsumeResult {
    let mut failures: Vec<Failure> = Vec::new();
    if let Some(bm) = req.beta_min {
        if v.beta < bm {
            failures.push(Failure {
                family: "β".into(),
                why: format!("β={} < β_min={}", round(v.beta), bm),
            });
        }
    }
    if req.sigma_empty && !v.sigma.is_empty() {
        failures.push(Failure {
            family: "σ".into(),
            why: format!("unresolved conflicts {{{}}}", v.sigma.join(", ")),
        });
    }
    if req.acyclic && v.kappa {
        failures.push(Failure {
            family: "κ".into(),
            why: "cyclic — self-reference detected".into(),
        });
    }
    if let Some(ph) = &req.phase {
        if v.pi.as_deref() != Some(ph.as_str()) {
            failures.push(Failure {
                family: "π".into(),
                why: format!("phase {:?} ≠ required {}", v.pi, ph),
            });
        }
    }
    if let Some(ff) = &req.forward_from {
        if let Some(p) = &v.pi {
            if phase_idx(p) < phase_idx(ff) {
                failures.push(Failure {
                    family: "π".into(),
                    why: format!("phase {} precedes {}", p, ff),
                });
            }
        }
    }
    if req.deny_default_must_allow && v.deny_default && !req.authorized {
        failures.push(Failure {
            family: "governance".into(),
            why: "deny_default with empty authority_path".into(),
        });
    }
    ConsumeResult {
        ok: failures.is_empty(),
        failures,
    }
}

pub fn round(x: f64) -> f64 {
    (x * 1000.0).round() / 1000.0
}
