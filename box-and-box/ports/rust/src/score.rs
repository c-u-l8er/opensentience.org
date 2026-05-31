// score.rs — Heuristic Arithmetic (faithful port of score.mjs).
// A Score lives in a SEMIRING (K, ⊕, ⊗, 0̲, 1̲). 0̲ annihilates ⊗ — the algebraic
// root of the veto used by the bridge. Laws H1–H13.

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Semiring {
    Tropical,    // (max, +)
    Probability, // (+, ×)
    Log,         // (logsumexp, +)
}

pub fn logsumexp(a: f64, b: f64) -> f64 {
    if a == f64::NEG_INFINITY {
        return b;
    }
    if b == f64::NEG_INFINITY {
        return a;
    }
    let m = a.max(b);
    m + ((a - m).exp() + (b - m).exp()).ln()
}

impl Semiring {
    pub fn from_name(name: &str) -> Semiring {
        match name {
            "probability" => Semiring::Probability,
            "log" => Semiring::Log,
            _ => Semiring::Tropical,
        }
    }

    pub fn zero(&self) -> f64 {
        match self {
            Semiring::Tropical => f64::NEG_INFINITY,
            Semiring::Probability => 0.0,
            Semiring::Log => f64::NEG_INFINITY,
        }
    }

    pub fn one(&self) -> f64 {
        match self {
            Semiring::Tropical => 0.0,
            Semiring::Probability => 1.0,
            Semiring::Log => 0.0,
        }
    }

    pub fn idempotent(&self) -> bool {
        matches!(self, Semiring::Tropical)
    }

    pub fn oplus(&self, a: f64, b: f64) -> f64 {
        match self {
            Semiring::Tropical => a.max(b),
            Semiring::Probability => a + b,
            Semiring::Log => logsumexp(a, b),
        }
    }

    pub fn otimes(&self, a: f64, b: f64) -> f64 {
        match self {
            Semiring::Tropical => {
                if a == f64::NEG_INFINITY || b == f64::NEG_INFINITY {
                    f64::NEG_INFINITY
                } else {
                    a + b
                }
            }
            Semiring::Probability => a * b,
            Semiring::Log => {
                if a == f64::NEG_INFINITY || b == f64::NEG_INFINITY {
                    f64::NEG_INFINITY
                } else {
                    a + b
                }
            }
        }
    }
}

// a Score carries a utility plus the soft analogues of the invariant families
#[derive(Clone, Debug)]
pub struct Score {
    pub u: f64,
    pub w: f64,
    pub eps: f64,
    pub gamma: f64,
    pub visits: f64,
    pub sources: Vec<String>,
}

impl Default for Score {
    fn default() -> Self {
        Score {
            u: 0.0,
            w: 1.0,
            eps: 0.0,
            gamma: 1.0,
            visits: 0.0,
            sources: Vec::new(),
        }
    }
}

// ---- vote : aggregate alternatives (⊕ side) ----
pub fn vote(a: &Score, b: &Score, s: Semiring) -> Score {
    let mut sources = a.sources.clone();
    sources.extend(b.sources.iter().cloned());
    Score {
        u: s.oplus(a.u, b.u),
        w: a.w * b.w,
        eps: a.eps.max(b.eps),
        gamma: a.gamma.min(b.gamma),
        visits: a.visits + b.visits,
        sources,
    }
}

// ---- rollout : chain evidence along a path, γ-discounted (⊗ side) ----
pub fn rollout(scores: &[Score], gamma: f64, s: Semiring) -> f64 {
    let mut acc = s.one();
    for (t, sc) in scores.iter().enumerate() {
        let discounted = if sc.u == s.zero() {
            s.zero()
        } else {
            gamma.powi(t as i32) * sc.u
        };
        acc = s.otimes(acc, discounted);
    }
    acc
}

// ---- reinforce : η-contraction toward a target ----
pub fn reinforce(u: f64, target: f64, eta: f64) -> f64 {
    (1.0 - eta) * u + eta * target
}

#[derive(Clone, Debug)]
pub struct ObjOption {
    pub id: i64,
    pub obj: Vec<f64>,
}

// ---- dominate : Pareto-prune (idempotent, antitone) ----
pub fn dominate(opts: &[ObjOption]) -> Vec<ObjOption> {
    opts.iter()
        .filter(|a| {
            !opts.iter().any(|b| {
                b.id != a.id
                    && b.obj.iter().enumerate().all(|(i, &bj)| bj >= a.obj[i])
                    && b.obj.iter().enumerate().any(|(i, &bj)| bj > a.obj[i])
            })
        })
        .cloned()
        .collect()
}

// ---- anneal : ε → 0 (idempotent) ----
pub fn anneal(s: &Score) -> Score {
    let mut r = s.clone();
    r.eps = 0.0;
    r
}

// ---- softmax (shift-invariant; T→0 ⇒ argmax) ----
pub fn softmax(us: &[f64], t: f64) -> Vec<f64> {
    let m = us.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
    let ex: Vec<f64> = us.iter().map(|u| ((u - m) / t).exp()).collect();
    let z: f64 = ex.iter().sum();
    ex.iter().map(|e| e / z).collect()
}
