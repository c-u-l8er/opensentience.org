package main

// laws3.go — epistemic, strategic, resource law suites + the main runner.

import (
	"fmt"
	"math/rand"
	"os"
)

// ================= EPISTEMIC LAWS (E1–E8, EB1–EB3) =================
var eatomNames = []string{"p", "q", "r"}

func randWorld() *World {
	w := World{}
	for _, a := range eatomNames {
		w[a] = rand.Float64() < 0.5
	}
	return &w
}

func eAtomFor(name string) *EFormula {
	return eAtomF(name, func(w *World) bool { return (*w)[name] })
}

func eAtomRand() *EFormula {
	return eAtomFor(eatomNames[rand.Intn(len(eatomNames))])
}

func worldIndex(worlds []*World, w *World) int {
	for i, x := range worlds {
		if x == w {
			return i
		}
	}
	return -1
}

func partitionModel() EModel {
	nw := 3 + rand.Intn(4)
	worlds := make([]*World, nw)
	for i := range worlds {
		worlds[i] = randWorld()
	}
	k := 1 + rand.Intn(len(worlds))
	cell := make([]int, len(worlds))
	for i := range cell {
		cell[i] = rand.Intn(k)
	}
	access := map[string]func(*World) []*World{
		"a": func(w *World) []*World {
			i := worldIndex(worlds, w)
			out := []*World{}
			for j, ww := range worlds {
				if cell[j] == cell[i] {
					out = append(out, ww)
				}
			}
			return out
		},
	}
	return EModel{Worlds: worlds, Actual: worlds[rand.Intn(len(worlds))], Access: access}
}

func beliefModel() EModel {
	nw := 4 + rand.Intn(3)
	worlds := make([]*World, nw)
	for i := range worlds {
		worlds[i] = randWorld()
	}
	D := []*World{}
	for _, w := range worlds {
		if rand.Float64() < 0.5 {
			D = append(D, w)
		}
	}
	dox := D
	if len(dox) == 0 {
		dox = []*World{worlds[0]}
	}
	access := map[string]func(*World) []*World{"a": func(*World) []*World { return dox }}
	return EModel{Worlds: worlds, Actual: worlds[rand.Intn(len(worlds))], Access: access}
}

func cmModel(agents []string) EModel {
	nw := 3 + rand.Intn(4)
	worlds := make([]*World, nw)
	for i := range worlds {
		worlds[i] = randWorld()
	}
	access := map[string]func(*World) []*World{}
	for _, ag := range agents {
		k := 1 + rand.Intn(len(worlds))
		cell := make([]int, len(worlds))
		for i := range cell {
			cell[i] = rand.Intn(k)
		}
		c := cell
		access[ag] = func(w *World) []*World {
			i := worldIndex(worlds, w)
			out := []*World{}
			for j, ww := range worlds {
				if c[j] == c[i] {
					out = append(out, ww)
				}
			}
			return out
		}
	}
	return EModel{Worlds: worlds, Actual: worlds[rand.Intn(len(worlds))], Access: access}
}

func kuModel() EModel {
	w1 := World{"p": true, "q": false, "r": false}
	w2 := World{"p": false, "q": false, "r": false}
	worlds := []*World{&w1, &w2}
	access := map[string]func(*World) []*World{"a": func(*World) []*World { return worlds }}
	return EModel{Worlds: worlds, Actual: &w1, Access: access}
}

var EPI = []Law{
	{"E1", "factivity T (Kφ → φ)", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			m := partitionModel()
			f := eAtomRand()
			if !knows(m, "a", f) || eHolds(f, m.Actual) {
				return true, ""
			}
			return false, "not-factive"
		})
	}},
	{"E2", "distribution K (K(φ→ψ)∧Kφ → Kψ)", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			m := partitionModel()
			f, g := eAtomRand(), eAtomRand()
			if !(knows(m, "a", eImplies(f, g)) && knows(m, "a", f)) || knows(m, "a", g) {
				return true, ""
			}
			return false, "no-K"
		})
	}},
	{"E3", "positive introspection (Kφ → KKφ)", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			m := partitionModel()
			f := eAtomRand()
			if !knows(m, "a", f) {
				return true, ""
			}
			for _, u := range m.Access["a"](m.Actual) {
				if !knowsAt(m, "a", u, f) {
					return false, "no-4"
				}
			}
			return true, ""
		})
	}},
	{"E4", "negative introspection (¬Kφ → K¬Kφ)", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			m := partitionModel()
			f := eAtomRand()
			if knows(m, "a", f) {
				return true, ""
			}
			for _, u := range m.Access["a"](m.Actual) {
				if knowsAt(m, "a", u, f) {
					return false, "no-5"
				}
			}
			return true, ""
		})
	}},
	{"E5", "belief consistency D (¬(Bφ ∧ B¬φ))", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			m := beliefModel()
			f := eAtomRand()
			if !(believes(m, "a", f, 0.6) && believes(m, "a", eNot(f), 0.6)) {
				return true, ""
			}
			return false, "inconsistent"
		})
	}},
	{"E6", "knowledge ⇒ belief (Kφ → Bφ)", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			m := partitionModel()
			f := eAtomRand()
			if !knows(m, "a", f) || believes(m, "a", f, 1) {
				return true, ""
			}
			return false, "k-not-b"
		})
	}},
	{"E7", "learning monotonicity (announce preserves K)", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			m := partitionModel()
			f := eAtomRand()
			if !knows(m, "a", f) {
				return true, ""
			}
			psi := eAtomRand()
			if !eHolds(psi, m.Actual) {
				return true, ""
			}
			if knows(announce(m, psi), "a", f) {
				return true, ""
			}
			return false, "lost-knowledge"
		})
	}},
	{"E8", "common knowledge (Cφ → Eφ)", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			ags := []string{"a", "b"}
			m := cmModel(ags)
			f := eAtomRand()
			if !common(m, ags, f) || everyone(m, ags, f) {
				return true, ""
			}
			return false, "c-not-e"
		})
	}},
}

var EPB = []Law{
	{"EB1", "threshold gate monotone; K = belief@1", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			m := partitionModel()
			f := eAtomRand()
			lo := rnd(0, 0.5)
			hi := rnd(0.5, 1)
			if believesAt(m, "a", m.Actual, f, hi) && !believesAt(m, "a", m.Actual, f, lo) {
				return false, "not-monotone"
			}
			if !knows(m, "a", f) || believes(m, "a", f, 1) {
				return true, ""
			}
			return false, "gate"
		})
	}},
	{"EB2", "known-unknown ⇒ deliberate (κ)", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			m := kuModel()
			f := eAtomF("p", func(w *World) bool { return (*w)["p"] })
			if knowsItDoesntKnow(m, "a", f) {
				if route(m, "a", f) == "deliberate" {
					return true, ""
				}
				return false, "route"
			}
			return true, ""
		})
	}},
	{"EB3", "pooled knowledge dominates individual", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			ags := []string{"a", "b"}
			m := cmModel(ags)
			f := eAtomRand()
			if !knows(m, "a", f) || distributed(m, ags, f) {
				return true, ""
			}
			return false, "pool"
		})
	}},
}

// ================= STRATEGIC LAWS (S1–S8, SB1–SB3) =================
func sAtomP() *SFormula { return sAtom("p", func(s *GState) bool { return s.P }) }
func sAtomQ() *SFormula { return sAtom("q", func(s *GState) bool { return s.Q }) }

func randSF() *SFormula {
	sp, sq := sAtomP(), sAtomQ()
	switch rand.Intn(5) {
	case 0:
		return sp
	case 1:
		return sq
	case 2:
		return sNot(sp)
	case 3:
		return sAnd(sp, sq)
	default:
		return sOr(sp, sq)
	}
}

func randGame(agents []string) Game {
	if agents == nil {
		agents = []string{"1", "2"}
	}
	nstates := 3 + rand.Intn(3)
	states := make([]*GState, nstates)
	for i := range states {
		states[i] = &GState{Name: "s" + itoa(i), P: rand.Float64() < 0.5, Q: rand.Float64() < 0.5}
	}
	nmoves := map[string]int{}
	for _, a := range agents {
		for _, s := range states {
			n := 1
			if rand.Float64() < 0.5 {
				n = 2
			}
			nmoves[a+"@"+s.Name] = n
		}
	}
	moves := func(a string, s *GState) []int {
		k := nmoves[a+"@"+s.Name]
		out := make([]int, k)
		for i := range out {
			out[i] = i
		}
		return out
	}
	tbl := map[string]*GState{}
	for _, s := range states {
		acc := []map[string]int{{}}
		for _, a := range agents {
			nx := []map[string]int{}
			for _, p := range acc {
				for m := 0; m < nmoves[a+"@"+s.Name]; m++ {
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
		for _, jm := range acc {
			key := s.Name + "|"
			for i, a := range agents {
				if i > 0 {
					key += ","
				}
				key += itoa(jm[a])
			}
			tbl[key] = states[rand.Intn(len(states))]
		}
	}
	delta := func(s *GState, jm map[string]int) *GState {
		key := s.Name + "|"
		for i, a := range agents {
			if i > 0 {
				key += ","
			}
			key += itoa(jm[a])
		}
		return tbl[key]
	}
	return Game{States: states, Agents: agents, Moves: moves, Delta: delta}
}

func someStateOf(m Game) *GState { return m.States[rand.Intn(len(m.States))] }

func reachBFS(m Game, f *SFormula) []*GState {
	W := filterStates(m.States, func(s *GState) bool { return sHolds(f, s) })
	for {
		inW := func(s *GState) bool { return includesState(W, s) }
		add := filterStates(m.States, func(q *GState) bool {
			if inW(q) {
				return false
			}
			for _, mv := range m.Moves("a", q) {
				if inW(m.Delta(q, map[string]int{"a": mv})) {
					return true
				}
			}
			return false
		})
		if len(add) == 0 {
			return W
		}
		W = append(W, add...)
	}
}

var STR = []Law{
	{"S1", "unit: [C]⊤ and ¬[C]⊥", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			m := randGame(nil)
			q := someStateOf(m)
			C := []string{"1"}
			if rand.Float64() < 0.5 {
				C = []string{"1", "2"}
			}
			if effectivity(m, C, q, sTop) && !effectivity(m, C, q, sBot) {
				return true, ""
			}
			return false, "unit"
		})
	}},
	{"S2", "coalition monotonicity (C ⊆ C′ ⇒ [C]φ → [C′]φ)", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			m := randGame(nil)
			q := someStateOf(m)
			f := randSF()
			if !effectivity(m, []string{"1"}, q, f) || effectivity(m, []string{"1", "2"}, q, f) {
				return true, ""
			}
			return false, "coalition-mono"
		})
	}},
	{"S3", "outcome monotonicity (φ⊨ψ ⇒ [C]φ → [C]ψ)", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			m := randGame(nil)
			q := someStateOf(m)
			f := randSF()
			g := sOr(f, sAtomQ())
			C := []string{"1"}
			if !effectivity(m, C, q, f) || effectivity(m, C, q, g) {
				return true, ""
			}
			return false, "outcome-mono"
		})
	}},
	{"S4", "superadditivity (disjoint C₁,C₂ cooperate)", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			m := randGame(nil)
			q := someStateOf(m)
			f1, f2 := randSF(), randSF()
			if !(effectivity(m, []string{"1"}, q, f1) && effectivity(m, []string{"2"}, q, f2)) || effectivity(m, []string{"1", "2"}, q, sAnd(f1, f2)) {
				return true, ""
			}
			return false, "superadd"
		})
	}},
	{"S5", "regularity (¬([C]φ ∧ [N∖C]¬φ))", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			m := randGame(nil)
			q := someStateOf(m)
			f := randSF()
			if !(effectivity(m, []string{"1"}, q, f) && effectivity(m, []string{"2"}, q, sNot(f))) {
				return true, ""
			}
			return false, "not-regular"
		})
	}},
	{"S6", "maintenance is a greatest fixpoint (□)", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			m := randGame(nil)
			f := randSF()
			C := []string{"1"}
			W := canMaintain(m, C, f)
			inW := func(s *GState) bool { return includesState(W, s) }
			reapply := filterStates(m.States, func(q *GState) bool { return sHolds(f, q) && force1(m, C, q, inW) })
			allHold := true
			for _, q := range W {
				if !sHolds(f, q) {
					allHold = false
				}
			}
			if allHold && len(reapply) == len(W) {
				return true, ""
			}
			return false, "gfp"
		})
	}},
	{"S7", "reachability is a least fixpoint (◊)", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			m := randGame(nil)
			f := randSF()
			C := []string{"1"}
			W := canReach(m, C, f)
			inW := func(s *GState) bool { return includesState(W, s) }
			reapply := filterStates(m.States, func(q *GState) bool { return sHolds(f, q) || force1(m, C, q, inW) })
			base := filterStates(m.States, func(s *GState) bool { return sHolds(f, s) })
			allInW := true
			for _, q := range base {
				if !includesState(W, q) {
					allInW = false
				}
			}
			if allInW && len(reapply) == len(W) {
				return true, ""
			}
			return false, "lfp"
		})
	}},
	{"S8", "grand-coalition determinacy ([Σ]φ ↔ ∃ successor φ)", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			m := randGame(nil)
			q := someStateOf(m)
			f := randSF()
			G := m.Agents
			someSucc := false
			for _, jm := range product(m, G, q) {
				if sHolds(f, m.Delta(q, jm)) {
					someSucc = true
				}
			}
			if effectivity(m, G, q, f) == someSucc {
				return true, ""
			}
			return false, "determinacy"
		})
	}},
}

var SB = []Law{
	{"SB1", "single-agent collapse → temporal reachability", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			m := randGame([]string{"a"})
			f := randSF()
			W := canReach(m, []string{"a"}, f)
			B := reachBFS(m, f)
			if len(W) == len(B) {
				all := true
				for _, q := range W {
					if !includesState(B, q) {
						all = false
					}
				}
				if all {
					return true, ""
				}
			}
			return false, "collapse"
		})
	}},
	{"SB2", "ought-implies-can (¬ability ⇒ escalate)", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			m := randGame(nil)
			q := someStateOf(m)
			f := randSF()
			C := []string{"1"}
			can := canEnsure(m, C, f, q)
			exp := "escalate"
			if can {
				exp = "discharge"
			}
			if oblige(m, C, f, q) == exp {
				return true, ""
			}
			return false, "oic"
		})
	}},
	{"SB3", "coordination needs ability ∧ common knowledge", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			m := randGame(nil)
			q := someStateOf(m)
			f := randSF()
			C := []string{"1", "2"}
			ck := rand.Float64() < 0.5
			ex := executable(m, C, f, q, ck)
			if ex == (canEnsure(m, C, f, q) && ck) {
				return true, ""
			}
			return false, "coord"
		})
	}},
}

// ================= RESOURCE LAWS (C1–C8, CB1–CB3) =================
func ri(n int) int { return rand.Intn(n) }

func randLedger() Ledger {
	L := NewLedger(nil, map[string]string{"tokens": "depletable", "money": "depletable", "capacity": "capacity", "skill": "reusable"})
	for _, a := range []string{"a", "b", "c", "d"} {
		skill := 0.0
		if rand.Float64() < 0.5 {
			skill = 1
		}
		L.Bal[a] = map[string]float64{"tokens": float64(ri(10)), "money": float64(ri(10)), "skill": skill}
	}
	L.Bal[TREASURY] = map[string]float64{"tokens": 50, "money": 50}
	L.Bal[SINK] = map[string]float64{}
	L.Bal[FREE] = map[string]float64{"capacity": float64(10 + ri(10))}
	return L
}

func avail(L Ledger, res string) float64 {
	s := 0.0
	for _, a := range []string{"a", "b", "c", "d"} {
		s += balance(L, a, res)
	}
	return s
}

var RESO = []Law{
	{"C1", "conservation under transfer (Σ invariant)", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			L := randLedger()
			res := "tokens"
			if rand.Float64() < 0.5 {
				res = "money"
			}
			accts := []string{"a", "b", "c", "d", TREASURY, SINK}
			from := accts[ri(len(accts))]
			to := accts[ri(len(accts))]
			b := total(L, res)
			M, ok := transfer(L, res, from, to, float64(ri(6)))
			got := b
			if ok {
				got = total(M, res)
			}
			if got == b {
				return true, ""
			}
			return false, "not-conserved"
		})
	}},
	{"C2", "no overdraft; balances stay ≥ 0", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			L := randLedger()
			from := []string{"a", "b", "c", "d"}[ri(4)]
			_, okOver := transfer(L, "tokens", from, "a", balance(L, from, "tokens")+1+float64(ri(3)))
			if okOver {
				return false, "overdraft-allowed"
			}
			M, ok := transfer(L, "tokens", from, "b", minF(balance(L, from, "tokens"), float64(ri(4))))
			if !ok {
				return true, ""
			}
			for _, r := range M.Bal {
				for _, v := range r {
					if v < 0 {
						return false, "negative"
					}
				}
			}
			return true, ""
		})
	}},
	{"C3", "independent transactions commute (CRDT)", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			L := randLedger()
			res := "tokens"
			a1 := minF(balance(L, "a", res), float64(ri(4)))
			a2 := minF(balance(L, "c", res), float64(ri(4)))
			t1, _ := transfer(L, res, "a", "b", a1)
			m12, _ := transfer(t1, res, "c", "d", a2)
			t2, _ := transfer(L, res, "c", "d", a2)
			m21, _ := transfer(t2, res, "a", "b", a1)
			for _, x := range []string{"a", "b", "c", "d"} {
				if balance(m12, x, res) != balance(m21, x, res) {
					return false, "noncommutative"
				}
			}
			return true, ""
		})
	}},
	{"C4", "linearity — spending depletes (not idempotent)", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			L := randLedger()
			a := []string{"a", "b", "c", "d"}[ri(4)]
			start := balance(L, a, "tokens")
			if start < 2 {
				return true, ""
			}
			s1, _ := spend(L, a, "tokens", 1)
			m, _ := spend(s1, a, "tokens", 1)
			if balance(m, a, "tokens") == start-2 {
				return true, ""
			}
			return false, "not-linear"
		})
	}},
	{"C5", "reusability — using `!` does not deplete (idempotent)", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			L := randLedger()
			a := []string{"a", "b", "c", "d"}[ri(4)]
			if balance(L, a, "skill") < 1 {
				return true, ""
			}
			u1 := use(L, a, "skill")
			u2 := use(u1.L, a, "skill")
			if u1.Ok && u2.Ok && balance(u2.L, a, "skill") == balance(L, a, "skill") {
				return true, ""
			}
			return false, "depleted"
		})
	}},
	{"C6", "flow monotonicity — depletion only decreases", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			L := randLedger()
			prev := avail(L, "tokens")
			for i := 0; i < 4; i++ {
				a := []string{"a", "b", "c", "d"}[ri(4)]
				m, ok := spend(L, a, "tokens", minF(balance(L, a, "tokens"), float64(ri(3))))
				if !ok {
					continue
				}
				now := avail(m, "tokens")
				if now > prev {
					return false, "increased"
				}
				prev = now
				L = m
			}
			return true, ""
		})
	}},
	{"C7", "capacity conservation (stability + plasticity)", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			L := randLedger()
			start := total(L, "capacity")
			for i := 0; i < 3; i++ {
				t := "T" + itoa(ri(3))
				if rand.Float64() < 0.6 {
					M, ok := allocate(L, t, minF(balance(L, FREE, "capacity"), float64(ri(4))))
					if ok {
						L = M
					}
				} else {
					L = forget(L, t, "")
				}
			}
			if total(L, "capacity") == start {
				return true, ""
			}
			return false, "capacity-leaked"
		})
	}},
	{"C8", "no free reclaim — forgetting releases the knowledge", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			L := randLedger()
			amt := minF(balance(L, FREE, "capacity"), float64(1+ri(4)))
			L, _ = allocate(L, "T", amt)
			L = consolidate(L, "T", "")
			before := balance(L, "mind", "know:T")
			M := forget(L, "T", "")
			if before == 1 && balance(M, "mind", "know:T") == 0 && balance(M, FREE, "capacity") >= amt {
				return true, ""
			}
			return false, "kept-both"
		})
	}},
}

var RESB = []Law{
	{"CB1", "exhaustion ⇒ infeasible (the alethic 0̲ gate)", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			L := randLedger()
			a := []string{"a", "b", "c", "d"}[ri(4)]
			c := float64(ri(12))
			if feasible(L, a, map[string]float64{"tokens": c}) == (balance(L, a, "tokens") >= c) {
				return true, ""
			}
			return false, "gate"
		})
	}},
	{"CB2", "cost composes additively along a pipeline (semiring)", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			L := randLedger()
			a := []string{"a", "b", "c", "d"}[ri(4)]
			c1, c2, c3 := float64(ri(3)), float64(ri(3)), float64(ri(3))
			if balance(L, a, "tokens") < c1+c2+c3 {
				return true, ""
			}
			s1, _ := spend(L, a, "tokens", c1)
			s2, _ := spend(s1, a, "tokens", c2)
			seq, _ := spend(s2, a, "tokens", c3)
			lump, _ := spend(L, a, "tokens", c1+c2+c3)
			if balance(seq, a, "tokens") == balance(lump, a, "tokens") {
				return true, ""
			}
			return false, "not-additive"
		})
	}},
	{"CB3", "Type-II repair pricing (value ≥ cost ∧ affordable)", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			L := randLedger()
			a := []string{"a", "b", "c", "d"}[ri(4)]
			value := float64(ri(8))
			cost := float64(ri(8))
			r := repair(L, a, "tokens", value, cost)
			exp := "invoke"
			if !affords(L, a, map[string]float64{"tokens": cost}) {
				exp = "cannot-afford"
			} else if value < cost {
				exp = "skip"
			}
			if r.Decision != exp {
				return false, "wrong-decision"
			}
			if r.Decision == "invoke" && balance(r.L, a, "tokens") != balance(L, a, "tokens")-cost {
				return false, "no-charge"
			}
			return true, ""
		})
	}},
}

func minF(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}

// ================= RUNNER =================
type Suite struct {
	Key      string
	Label    string
	Laws     []Law
	Semiring string
}

var SUITES = []Suite{
	{"INV", "Invariant (L1–L14)", INV, ""},
	{"HEUR", "Heuristic (H1–H13) · tropical dioid", HEUR, "tropical"},
	{"BR", "Bridge (B1–B3)", BR, ""},
	{"DEON", "Deontic (D1–D9)", DEON, ""},
	{"DBR", "Deontic bridge (DB1–DB3)", DBR, ""},
	{"TEMP", "Temporal (T1–T8)", TEMP, ""},
	{"TBR", "Temporal bridge (TB1–TB3)", TBR, ""},
	{"REFL", "Reflexive (R1–R8)", REFL, ""},
	{"REFB", "Reflexive bridge (RB1–RB3)", REFB, ""},
	{"EPI", "Epistemic (E1–E8)", EPI, ""},
	{"EPB", "Epistemic bridge (EB1–EB3)", EPB, ""},
	{"STR", "Strategic (S1–S8)", STR, ""},
	{"SB", "Strategic bridge (SB1–SB3)", SB, ""},
	{"RESO", "Resource (C1–C8)", RESO, ""},
	{"RESB", "Resource bridge (CB1–CB3)", RESB, ""},
}

func runSet(laws []Law, N int) (pass, fail int, results []trialResult, ids, descs []string) {
	for _, law := range laws {
		r := law.Fn(N)
		results = append(results, r)
		ids = append(ids, law.ID)
		descs = append(descs, law.Desc)
		if r.pass {
			pass++
		} else {
			fail++
		}
	}
	return
}

func main() {
	N := 2000
	bar := repeatStr("─", 48)
	fmt.Printf("\nbox-and-box law harness (Go port) · %d trials/law\n%s\n", N, bar)
	totalFail := 0
	grandPass := 0
	grandTotal := 0
	for _, suite := range SUITES {
		if suite.Semiring != "" {
			setSemiring(suite.Semiring)
		}
		pass, fail, results, ids, descs := runSet(suite.Laws, N)
		failStr := ""
		if fail > 0 {
			failStr = fmt.Sprintf(", %d fail", fail)
		}
		fmt.Printf("%s: %d/%d pass%s\n", suite.Label, pass, len(suite.Laws), failStr)
		for i, r := range results {
			if !r.pass {
				fmt.Printf("  ✗ %s %s — %s @trial %d\n", ids[i], descs[i], r.cex, r.at)
			}
		}
		totalFail += fail
		grandPass += pass
		grandTotal += len(suite.Laws)
	}
	fmt.Println(bar)

	// cross-personality checks (informational; mirrors the JS harness)
	fmt.Println("cross-personality checks:")
	for _, name := range []string{"tropical", "probability", "log"} {
		curS = Semirings[name]
		var h6 Law
		for _, l := range HEUR {
			if l.ID == "H6" {
				h6 = l
			}
		}
		r := h6.Fn(N)
		if r.pass {
			fmt.Printf("  H6 idempotence under %-11s → holds\n", name)
		} else {
			fmt.Printf("  H6 idempotence under %-11s → fails (expected — non-idempotent semiring)\n", name)
		}
	}
	curS = Semirings["tropical"]
	{
		kHolds, kT, bFails, bT := 0, 0, 0, 0
		for i := 0; i < N; i++ {
			m := partitionModel()
			f := eAtomRand()
			if knows(m, "a", f) {
				kT++
				if eHolds(f, m.Actual) {
					kHolds++
				}
			}
		}
		for i := 0; i < N; i++ {
			m := beliefModel()
			f := eAtomRand()
			if knowsAt(m, "a", m.Actual, f) {
				bT++
				if !eHolds(f, m.Actual) {
					bFails++
				}
			}
		}
		kpct := 100.0
		if kT > 0 {
			kpct = float64(kHolds) / float64(kT) * 100
		}
		bpct := 0.0
		if bT > 0 {
			bpct = float64(bFails) / float64(bT) * 100
		}
		fmt.Printf("  factivity T under knowledge (S5)   → holds (%.0f%% of K-cases)\n", kpct)
		fmt.Printf("  factivity T under belief    (KD45) → fails (%.0f%% of B-cases believe a falsehood — expected)\n", bpct)
	}
	{
		mono, gt := 0, 0
		for i := 0; i < N; i++ {
			m := randGame(nil)
			f := randSF()
			solo := canReach(m, []string{"1"}, f)
			grand := canReach(m, []string{"1", "2"}, f)
			allIn := true
			for _, q := range solo {
				if !includesState(grand, q) {
					allIn = false
				}
			}
			if allIn {
				mono++
			}
			if len(grand) > len(solo) {
				gt++
			}
		}
		fmt.Printf("  coalition power: grand ⊇ solo reachability in %.0f%% of games (strictly larger in %.0f%%)\n", float64(mono)/float64(N)*100, float64(gt)/float64(N)*100)
	}
	{
		L := NewLedger(map[string]map[string]float64{"a": {"tokens": 3, "skill": 1}}, map[string]string{"tokens": "depletable", "skill": "reusable"})
		dep, reu := L, L
		for i := 0; i < 3; i++ {
			dep = use(dep, "a", "tokens").L
			reu = use(reu, "a", "skill").L
		}
		fmt.Printf("  use x3 — depletable 'tokens' 3 -> %g (consumed); reusable 'skill' 1 -> %g (intact, the of-course modality)\n", balance(dep, "a", "tokens"), balance(reu, "a", "skill"))
	}
	fmt.Println(bar)
	fmt.Printf("grand total: %d/%d laws pass\n", grandPass, grandTotal)
	if totalFail == 0 {
		fmt.Println("✓ all stated laws hold.")
	} else {
		fmt.Printf("✗ %d law(s) failed.\n", totalFail)
	}
	if totalFail == 0 {
		os.Exit(0)
	}
	os.Exit(1)
}

func repeatStr(s string, n int) string {
	out := ""
	for i := 0; i < n; i++ {
		out += s
	}
	return out
}
