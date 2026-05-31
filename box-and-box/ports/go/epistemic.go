package main

// epistemic.go — Epistemic Arithmetic / S5 & KD45 modal logic (port of epistemic.mjs).
// Laws E1–E8, EB1–EB3. Worlds use pointer identity (mirrors JS object identity).

// World is a valuation of atoms. Pointers give identity (like JS objects).
type World = map[string]bool

// EFormula is a propositional formula over worlds.
type EFormula struct {
	T    string // atom,not,and,or,implies
	Name string
	Pred func(w *World) bool
	A    *EFormula
	B    *EFormula
}

func eAtomF(name string, pred func(w *World) bool) *EFormula {
	return &EFormula{T: "atom", Name: name, Pred: pred}
}
func eNot(a *EFormula) *EFormula        { return &EFormula{T: "not", A: a} }
func eAnd(a, b *EFormula) *EFormula     { return &EFormula{T: "and", A: a, B: b} }
func eOr(a, b *EFormula) *EFormula      { return &EFormula{T: "or", A: a, B: b} }
func eImplies(a, b *EFormula) *EFormula { return &EFormula{T: "implies", A: a, B: b} }

func eHolds(f *EFormula, w *World) bool {
	switch f.T {
	case "atom":
		return f.Pred(w)
	case "not":
		return !eHolds(f.A, w)
	case "and":
		return eHolds(f.A, w) && eHolds(f.B, w)
	case "or":
		return eHolds(f.A, w) || eHolds(f.B, w)
	case "implies":
		return !eHolds(f.A, w) || eHolds(f.B, w)
	default:
		return false
	}
}

// EModel : worlds + actual world + per-agent accessibility.
type EModel struct {
	Worlds []*World
	Actual *World
	Access map[string]func(w *World) []*World
}

func knowsAt(m EModel, agent string, w *World, f *EFormula) bool {
	acc := m.Access[agent](w)
	if len(acc) == 0 {
		return false
	}
	for _, u := range acc {
		if !eHolds(f, u) {
			return false
		}
	}
	return true
}

func possibleAt(m EModel, agent string, w *World, f *EFormula) bool {
	for _, u := range m.Access[agent](w) {
		if eHolds(f, u) {
			return true
		}
	}
	return false
}

func believesAt(m EModel, agent string, w *World, f *EFormula, theta float64) bool {
	acc := m.Access[agent](w)
	if len(acc) == 0 {
		return false
	}
	cnt := 0
	for _, u := range acc {
		if eHolds(f, u) {
			cnt++
		}
	}
	return float64(cnt)/float64(len(acc)) >= theta
}

func knows(m EModel, agent string, f *EFormula) bool {
	return knowsAt(m, agent, m.Actual, f)
}
func believes(m EModel, agent string, f *EFormula, theta float64) bool {
	return believesAt(m, agent, m.Actual, f, theta)
}

func knowsItDoesntKnow(m EModel, agent string, f *EFormula) bool {
	acc := m.Access[agent](m.Actual)
	if len(acc) == 0 {
		return false
	}
	for _, u := range acc {
		if knowsAt(m, agent, u, f) {
			return false
		}
	}
	return true
}

func route(m EModel, agent string, f *EFormula) string {
	if knows(m, agent, f) {
		return "act"
	}
	if knowsItDoesntKnow(m, agent, f) {
		return "deliberate"
	}
	return "uncertain"
}

// announce : truthful public announcement — keep only worlds where ψ holds.
func announce(m EModel, psi *EFormula) EModel {
	worlds := []*World{}
	keep := map[*World]bool{}
	for _, w := range m.Worlds {
		if eHolds(psi, w) {
			worlds = append(worlds, w)
			keep[w] = true
		}
	}
	access := map[string]func(w *World) []*World{}
	for a := range m.Access {
		old := m.Access[a]
		access[a] = func(w *World) []*World {
			out := []*World{}
			for _, u := range old(w) {
				if keep[u] {
					out = append(out, u)
				}
			}
			return out
		}
	}
	return EModel{Worlds: worlds, Actual: m.Actual, Access: access}
}

func everyone(m EModel, agents []string, f *EFormula) bool {
	for _, a := range agents {
		if !knows(m, a, f) {
			return false
		}
	}
	return true
}

// common : f holds in every world reachable from actual via the union of agents' access.
func common(m EModel, agents []string, f *EFormula) bool {
	reach := map[*World]bool{m.Actual: true}
	stack := []*World{m.Actual}
	for len(stack) > 0 {
		w := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		for _, a := range agents {
			for _, u := range m.Access[a](w) {
				if !reach[u] {
					reach[u] = true
					stack = append(stack, u)
				}
			}
		}
	}
	for u := range reach {
		if !eHolds(f, u) {
			return false
		}
	}
	return true
}

// distributed : pool information by intersecting accessible sets.
func distributed(m EModel, agents []string, f *EFormula) bool {
	if len(agents) == 0 {
		return false
	}
	sets := make([]map[*World]bool, len(agents))
	for i, a := range agents {
		s := map[*World]bool{}
		for _, w := range m.Access[a](m.Actual) {
			s[w] = true
		}
		sets[i] = s
	}
	inter := []*World{}
	for w := range sets[0] {
		all := true
		for _, s := range sets {
			if !s[w] {
				all = false
				break
			}
		}
		if all {
			inter = append(inter, w)
		}
	}
	if len(inter) == 0 {
		return false
	}
	for _, u := range inter {
		if !eHolds(f, u) {
			return false
		}
	}
	return true
}
