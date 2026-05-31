// epistemic.rs — Epistemic Arithmetic / S5 + KD45 modal logic (faithful port of epistemic.mjs).
// Laws E1–E8, EB1–EB3. Knowledge = truth in ALL accessible worlds.

use std::collections::BTreeMap;
use std::rc::Rc;

// A World carries a unique identity (`id`) plus its atom valuation. In the JS reference
// each world is a distinct object, so accessibility partitions are keyed by object
// identity (indexOf), NOT by valuation — two worlds with the same p/q/r are still
// distinct. We mirror that with an explicit id so equality/contains use identity.
#[derive(Clone, Debug)]
pub struct World {
    pub id: u64,
    pub vals: BTreeMap<String, bool>,
}

impl PartialEq for World {
    fn eq(&self, other: &Self) -> bool {
        self.id == other.id
    }
}
impl Eq for World {}
impl std::hash::Hash for World {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        self.id.hash(state);
    }
}

impl World {
    pub fn new(id: u64) -> World {
        World { id, vals: BTreeMap::new() }
    }
    pub fn set(&mut self, k: &str, v: bool) {
        self.vals.insert(k.to_string(), v);
    }
    pub fn get(&self, k: &str) -> bool {
        *self.vals.get(k).unwrap_or(&false)
    }
}

#[derive(Clone)]
pub enum EFormula {
    Atom(String),
    Not(Box<EFormula>),
    And(Box<EFormula>, Box<EFormula>),
    Or(Box<EFormula>, Box<EFormula>),
    Implies(Box<EFormula>, Box<EFormula>),
}

pub fn atom(name: &str) -> EFormula {
    EFormula::Atom(name.to_string())
}
pub fn not(a: EFormula) -> EFormula {
    EFormula::Not(Box::new(a))
}
pub fn and(a: EFormula, b: EFormula) -> EFormula {
    EFormula::And(Box::new(a), Box::new(b))
}
pub fn or(a: EFormula, b: EFormula) -> EFormula {
    EFormula::Or(Box::new(a), Box::new(b))
}
pub fn implies(a: EFormula, b: EFormula) -> EFormula {
    EFormula::Implies(Box::new(a), Box::new(b))
}

pub fn holds(f: &EFormula, w: &World) -> bool {
    match f {
        EFormula::Atom(name) => w.get(name),
        EFormula::Not(a) => !holds(a, w),
        EFormula::And(a, b) => holds(a, w) && holds(b, w),
        EFormula::Or(a, b) => holds(a, w) || holds(b, w),
        EFormula::Implies(a, b) => !holds(a, w) || holds(b, w),
    }
}

// access[agent] : World → World[]
pub type Access = Rc<dyn Fn(&World) -> Vec<World>>;

pub struct Model {
    pub worlds: Vec<World>,
    pub actual: World,
    pub access: BTreeMap<String, Access>,
}

fn acc(model: &Model, agent: &str, w: &World) -> Vec<World> {
    (model.access[agent])(w)
}

// knowledge at a world: truth in every accessible world (empty access ⇒ not known)
pub fn knows_at(model: &Model, agent: &str, w: &World, f: &EFormula) -> bool {
    let a = acc(model, agent, w);
    !a.is_empty() && a.iter().all(|u| holds(f, u))
}

// graded belief
pub fn believes_at(model: &Model, agent: &str, w: &World, f: &EFormula, theta: f64) -> bool {
    let a = acc(model, agent, w);
    if a.is_empty() {
        return false;
    }
    let cnt = a.iter().filter(|u| holds(f, u)).count() as f64;
    cnt / (a.len() as f64) >= theta
}

pub fn knows(model: &Model, agent: &str, f: &EFormula) -> bool {
    knows_at(model, agent, &model.actual, f)
}
pub fn believes(model: &Model, agent: &str, f: &EFormula, theta: f64) -> bool {
    believes_at(model, agent, &model.actual, f, theta)
}

// the known-unknown (K¬Kφ)
pub fn knows_it_doesnt_know(model: &Model, agent: &str, f: &EFormula) -> bool {
    let a = acc(model, agent, &model.actual);
    !a.is_empty() && a.iter().all(|u| !knows_at(model, agent, u, f))
}

// epistemic routing
pub fn route(model: &Model, agent: &str, f: &EFormula) -> &'static str {
    if knows(model, agent, f) {
        "act"
    } else if knows_it_doesnt_know(model, agent, f) {
        "deliberate"
    } else {
        "uncertain"
    }
}

// learning = truthful public announcement: keep only worlds where ψ holds
pub fn announce(model: &Model, psi: &EFormula) -> Model {
    let worlds: Vec<World> = model.worlds.iter().filter(|w| holds(psi, w)).cloned().collect();
    let keep: std::collections::HashSet<World> = worlds.iter().cloned().collect();
    let mut access: BTreeMap<String, Access> = BTreeMap::new();
    for (a, f) in &model.access {
        let f = f.clone();
        let keep = keep.clone();
        access.insert(
            a.clone(),
            Rc::new(move |w: &World| f(w).into_iter().filter(|u| keep.contains(u)).collect()),
        );
    }
    Model {
        worlds,
        actual: model.actual.clone(),
        access,
    }
}

// multi-agent
pub fn everyone(model: &Model, agents: &[&str], f: &EFormula) -> bool {
    agents.iter().all(|a| knows(model, a, f))
}

// common knowledge: reachable closure via the union of agents' access
pub fn common(model: &Model, agents: &[&str], f: &EFormula) -> bool {
    let mut reach: Vec<World> = vec![model.actual.clone()];
    let mut stack: Vec<World> = vec![model.actual.clone()];
    while let Some(w) = stack.pop() {
        for a in agents {
            for u in acc(model, a, &w) {
                if !reach.contains(&u) {
                    reach.push(u.clone());
                    stack.push(u);
                }
            }
        }
    }
    reach.iter().all(|u| holds(f, u))
}

// distributed knowledge: intersect accessible sets
pub fn distributed(model: &Model, agents: &[&str], f: &EFormula) -> bool {
    let sets: Vec<Vec<World>> = agents.iter().map(|a| acc(model, a, &model.actual)).collect();
    if sets.is_empty() {
        return false;
    }
    let inter: Vec<&World> = sets[0]
        .iter()
        .filter(|w| sets.iter().all(|s| s.contains(w)))
        .collect();
    !inter.is_empty() && inter.iter().all(|u| holds(f, u))
}
