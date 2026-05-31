package main

// strategic.go — Strategic / Coalitional Arithmetic / ATL (port of strategic.mjs).
// Laws S1–S8, SB1–SB3. States use pointer identity (mirrors JS object identity).

// GState is a game state (named valuation). Pointers give identity.
type GState struct {
	Name string
	P    bool
	Q    bool
}

// SFormula is a propositional formula over states.
type SFormula struct {
	T    string // atom,not,and,or
	Name string
	Pred func(s *GState) bool
	A    *SFormula
	B    *SFormula
}

func sAtom(name string, pred func(s *GState) bool) *SFormula {
	return &SFormula{T: "atom", Name: name, Pred: pred}
}
func sNot(a *SFormula) *SFormula    { return &SFormula{T: "not", A: a} }
func sAnd(a, b *SFormula) *SFormula { return &SFormula{T: "and", A: a, B: b} }
func sOr(a, b *SFormula) *SFormula  { return &SFormula{T: "or", A: a, B: b} }

func sHolds(f *SFormula, s *GState) bool {
	switch f.T {
	case "atom":
		return f.Pred(s)
	case "not":
		return !sHolds(f.A, s)
	case "and":
		return sHolds(f.A, s) && sHolds(f.B, s)
	case "or":
		return sHolds(f.A, s) || sHolds(f.B, s)
	default:
		return false
	}
}

var sTop = sOr(sAtom("⊤", func(*GState) bool { return true }), sNot(sAtom("⊤", func(*GState) bool { return true })))
var sBot = sAnd(sAtom("⊥", func(*GState) bool { return false }), sNot(sAtom("⊥", func(*GState) bool { return false })))

// Game : states, agents, moves(agent,state)→moveIds, delta(state, jointMove)→state.
type Game struct {
	States []*GState
	Agents []string
	Moves  func(agent string, s *GState) []int
	Delta  func(s *GState, jm map[string]int) *GState
}

func othersOf(g Game, C []string) []string {
	inC := map[string]bool{}
	for _, a := range C {
		inC[a] = true
	}
	out := []string{}
	for _, a := range g.Agents {
		if !inC[a] {
			out = append(out, a)
		}
	}
	return out
}

// product : cartesian product of agents' move sets at a state.
func product(g Game, agents []string, state *GState) []map[string]int {
	acc := []map[string]int{{}}
	for _, a := range agents {
		ms := g.Moves(a, state)
		nx := []map[string]int{}
		for _, p := range acc {
			for _, m := range ms {
				np := map[string]int{}
				for k, v := range p {
					np[k] = v
				}
				np[a] = m
				nx = append(nx, np)
			}
		}
		acc = nx
	}
	return acc
}

// force1 : controllable predecessor — ∃ moves for C, ∀ moves for the rest, successor ∈ set.
func force1(g Game, C []string, state *GState, inSet func(s *GState) bool) bool {
	cm := product(g, C, state)
	om := product(g, othersOf(g, C), state)
	for _, c := range cm {
		all := true
		for _, o := range om {
			jm := map[string]int{}
			for k, v := range c {
				jm[k] = v
			}
			for k, v := range o {
				jm[k] = v
			}
			if !inSet(g.Delta(state, jm)) {
				all = false
				break
			}
		}
		if all {
			return true
		}
	}
	return false
}

func effectivity(g Game, C []string, state *GState, f *SFormula) bool {
	return force1(g, C, state, func(s *GState) bool { return sHolds(f, s) })
}

func includesState(W []*GState, s *GState) bool {
	for _, x := range W {
		if x == s {
			return true
		}
	}
	return false
}

func filterStates(states []*GState, pred func(s *GState) bool) []*GState {
	out := []*GState{}
	for _, s := range states {
		if pred(s) {
			out = append(out, s)
		}
	}
	return out
}

// canMaintain : ⟨⟨C⟩⟩□f — greatest fixpoint.
func canMaintain(g Game, C []string, f *SFormula) []*GState {
	W := filterStates(g.States, func(s *GState) bool { return sHolds(f, s) })
	for {
		inW := func(s *GState) bool { return includesState(W, s) }
		W2 := filterStates(W, func(q *GState) bool { return force1(g, C, q, inW) })
		if len(W2) == len(W) {
			return W2
		}
		W = W2
	}
}

// canReach : ⟨⟨C⟩⟩◊f — least fixpoint.
func canReach(g Game, C []string, f *SFormula) []*GState {
	W := filterStates(g.States, func(s *GState) bool { return sHolds(f, s) })
	for {
		inW := func(s *GState) bool { return includesState(W, s) }
		add := filterStates(g.States, func(q *GState) bool { return !inW(q) && force1(g, C, q, inW) })
		if len(add) == 0 {
			return W
		}
		W = append(W, add...)
	}
}

// canUntil : ⟨⟨C⟩⟩(f U g) — least fixpoint.
func canUntil(g Game, C []string, f, gg *SFormula) []*GState {
	phi := func(s *GState) bool { return sHolds(f, s) }
	W := filterStates(g.States, func(s *GState) bool { return sHolds(gg, s) })
	for {
		inW := func(s *GState) bool { return includesState(W, s) }
		add := filterStates(g.States, func(q *GState) bool { return !inW(q) && phi(q) && force1(g, C, q, inW) })
		if len(add) == 0 {
			return W
		}
		W = append(W, add...)
	}
}

func canEnsure(g Game, C []string, f *SFormula, q *GState) bool {
	return includesState(canReach(g, C, f), q)
}
func canKeep(g Game, C []string, f *SFormula, q *GState) bool {
	return includesState(canMaintain(g, C, f), q)
}

func oblige(g Game, C []string, f *SFormula, q *GState) string {
	if canEnsure(g, C, f, q) {
		return "discharge"
	}
	return "escalate"
}

func executable(g Game, C []string, f *SFormula, q *GState, commonKnowledge bool) bool {
	return canEnsure(g, C, f, q) && commonKnowledge
}
