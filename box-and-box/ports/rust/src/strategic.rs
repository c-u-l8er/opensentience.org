// strategic.rs — Strategic / Coalitional Arithmetic / ATL (faithful port of strategic.mjs).
// Laws S1–S8, SB1–SB3. "Coalition C can ensure φ" over a concurrent game structure.

use std::collections::BTreeMap;
use std::rc::Rc;

#[derive(Clone, Debug)]
pub struct GState {
    pub name: String,
    pub p: bool,
    pub q: bool,
}

impl PartialEq for GState {
    fn eq(&self, other: &Self) -> bool {
        self.name == other.name
    }
}
impl Eq for GState {}

#[derive(Clone)]
pub enum SFormula {
    Atom(String, Rc<dyn Fn(&GState) -> bool>),
    Not(Box<SFormula>),
    And(Box<SFormula>, Box<SFormula>),
    Or(Box<SFormula>, Box<SFormula>),
}

pub fn atom(name: &str, pred: Rc<dyn Fn(&GState) -> bool>) -> SFormula {
    SFormula::Atom(name.to_string(), pred)
}
pub fn not(a: SFormula) -> SFormula {
    SFormula::Not(Box::new(a))
}
pub fn and(a: SFormula, b: SFormula) -> SFormula {
    SFormula::And(Box::new(a), Box::new(b))
}
pub fn or(a: SFormula, b: SFormula) -> SFormula {
    SFormula::Or(Box::new(a), Box::new(b))
}

pub fn holds(f: &SFormula, s: &GState) -> bool {
    match f {
        SFormula::Atom(_, pred) => pred(s),
        SFormula::Not(a) => !holds(a, s),
        SFormula::And(a, b) => holds(a, s) && holds(b, s),
        SFormula::Or(a, b) => holds(a, s) || holds(b, s),
    }
}

pub fn top() -> SFormula {
    or(
        atom("⊤", Rc::new(|_| true)),
        not(atom("⊤", Rc::new(|_| true))),
    )
}
pub fn bot() -> SFormula {
    and(
        atom("⊥", Rc::new(|_| false)),
        not(atom("⊥", Rc::new(|_| false))),
    )
}

// joint move: agent -> moveId
pub type JointMove = BTreeMap<String, i64>;

pub struct Game {
    pub states: Vec<GState>,
    pub agents: Vec<String>,
    pub moves: Rc<dyn Fn(&str, &GState) -> Vec<i64>>,
    pub delta: Rc<dyn Fn(&GState, &JointMove) -> GState>,
}

pub fn others(model: &Game, c: &[&str]) -> Vec<String> {
    model
        .agents
        .iter()
        .filter(|a| !c.contains(&a.as_str()))
        .cloned()
        .collect()
}

// cartesian product of the agents' move sets at a state → list of joint moves
fn product(model: &Game, agents: &[String], state: &GState) -> Vec<JointMove> {
    let mut acc: Vec<JointMove> = vec![BTreeMap::new()];
    for a in agents {
        let ms = (model.moves)(a, state);
        let mut nx: Vec<JointMove> = Vec::new();
        for p in &acc {
            for m in &ms {
                let mut np = p.clone();
                np.insert(a.clone(), *m);
                nx.push(np);
            }
        }
        acc = nx;
    }
    acc
}

// controllable predecessor: ∃ moves for C, ∀ moves for the rest, successor ∈ set
fn force1<F: Fn(&GState) -> bool>(model: &Game, c: &[&str], state: &GState, in_set: F) -> bool {
    let c_names: Vec<String> = c.iter().map(|s| s.to_string()).collect();
    let cm = product(model, &c_names, state);
    let om = product(model, &others(model, c), state);
    cm.iter().any(|cmove| {
        om.iter().all(|omove| {
            let mut joint = cmove.clone();
            for (k, v) in omove {
                joint.insert(k.clone(), *v);
            }
            in_set(&(model.delta)(state, &joint))
        })
    })
}

// [C]◯f at a state
pub fn effectivity(model: &Game, c: &[&str], state: &GState, f: &SFormula) -> bool {
    force1(model, c, state, |s| holds(f, s))
}

fn contains(w: &[GState], s: &GState) -> bool {
    w.iter().any(|x| x == s)
}

// ⟨⟨C⟩⟩□f — greatest fixpoint
pub fn can_maintain(model: &Game, c: &[&str], f: &SFormula) -> Vec<GState> {
    let mut w: Vec<GState> = model.states.iter().filter(|s| holds(f, s)).cloned().collect();
    loop {
        let snapshot = w.clone();
        let w2: Vec<GState> = w
            .iter()
            .filter(|q| force1(model, c, q, |s| contains(&snapshot, s)))
            .cloned()
            .collect();
        if w2.len() == w.len() {
            return w2;
        }
        w = w2;
    }
}

// ⟨⟨C⟩⟩◊f — least fixpoint
pub fn can_reach(model: &Game, c: &[&str], f: &SFormula) -> Vec<GState> {
    let mut w: Vec<GState> = model.states.iter().filter(|s| holds(f, s)).cloned().collect();
    loop {
        let snapshot = w.clone();
        let add: Vec<GState> = model
            .states
            .iter()
            .filter(|q| !contains(&snapshot, q) && force1(model, c, q, |s| contains(&snapshot, s)))
            .cloned()
            .collect();
        if add.is_empty() {
            return w;
        }
        w.extend(add);
    }
}

// ⟨⟨C⟩⟩(f U g) — least fixpoint
pub fn can_until(model: &Game, c: &[&str], f: &SFormula, g: &SFormula) -> Vec<GState> {
    let mut w: Vec<GState> = model.states.iter().filter(|s| holds(g, s)).cloned().collect();
    loop {
        let snapshot = w.clone();
        let add: Vec<GState> = model
            .states
            .iter()
            .filter(|q| {
                !contains(&snapshot, q)
                    && holds(f, q)
                    && force1(model, c, q, |s| contains(&snapshot, s))
            })
            .cloned()
            .collect();
        if add.is_empty() {
            return w;
        }
        w.extend(add);
    }
}

pub fn can_ensure(model: &Game, c: &[&str], f: &SFormula, q: &GState) -> bool {
    contains(&can_reach(model, c, f), q)
}
pub fn can_keep(model: &Game, c: &[&str], f: &SFormula, q: &GState) -> bool {
    contains(&can_maintain(model, c, f), q)
}

// ought-implies-can
pub fn oblige(model: &Game, c: &[&str], f: &SFormula, q: &GState) -> &'static str {
    if can_ensure(model, c, f, q) {
        "discharge"
    } else {
        "escalate"
    }
}

// coordination is executable only with ability AND common knowledge
pub fn executable(model: &Game, c: &[&str], f: &SFormula, q: &GState, common_knowledge: bool) -> bool {
    can_ensure(model, c, f, q) && common_knowledge
}
