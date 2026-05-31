package main

// laws2.go — temporal, temporal-bridge, reflexive, reflexive-bridge law suites.

import (
	"math/rand"
)

// ================= TEMPORAL LAWS (T1–T8) =================
func tatomEven() *Formula { return tAtom("even", func(s State) bool { return s["v"].(int)%2 == 0 }) }
func tatomHi() *Formula   { return tAtom("hi", func(s State) bool { return s["v"].(int) >= 3 }) }
func tatomPos() *Formula  { return tAtom("pos", func(s State) bool { return s["v"].(int) > 0 }) }

func rAtomT() *Formula {
	switch rand.Intn(3) {
	case 0:
		return tatomEven()
	case 1:
		return tatomHi()
	default:
		return tatomPos()
	}
}

func rFormT(d int) *Formula {
	if d <= 0 {
		return rAtomT()
	}
	switch rand.Intn(8) {
	case 0:
		return rAtomT()
	case 1:
		return tNot(rFormT(d - 1))
	case 2:
		return tAnd(rFormT(d-1), rFormT(d-1))
	case 3:
		return tOr(rFormT(d-1), rFormT(d-1))
	case 4:
		return tNext(rFormT(d - 1))
	case 5:
		return tAlways(rFormT(d - 1))
	case 6:
		return tEventually(rFormT(d - 1))
	default:
		return tUntil(rFormT(d-1), rFormT(d-1))
	}
}

func rTraj() []State {
	k := 1 + rand.Intn(6)
	out := make([]State, k)
	for i := range out {
		out[i] = State{"v": rand.Intn(5)}
	}
	return out
}

func satT(f *Formula, tau []State) bool { return monitor(f, tau).Verdict == "satisfied" }

func includesStr(arr []string, x string) bool {
	for _, v := range arr {
		if v == x {
			return true
		}
	}
	return false
}

var TEMP = []Law{
	{"T1", "G,F idempotent (GGφ≡Gφ)", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			a := rFormT(2)
			tau := rTraj()
			if evalDirect(tAlways(tAlways(a)), tau, 0) == evalDirect(tAlways(a), tau, 0) &&
				evalDirect(tEventually(tEventually(a)), tau, 0) == evalDirect(tEventually(a), tau, 0) {
				return true, ""
			}
			return false, "idem"
		})
	}},
	{"T2", "duality (¬Gφ≡F¬φ, ¬Fφ≡G¬φ)", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			a := rFormT(2)
			tau := rTraj()
			if evalDirect(tNot(tAlways(a)), tau, 0) == evalDirect(tEventually(tNot(a)), tau, 0) &&
				evalDirect(tNot(tEventually(a)), tau, 0) == evalDirect(tAlways(tNot(a)), tau, 0) {
				return true, ""
			}
			return false, "dual"
		})
	}},
	{"T3", "∧,∨ commutative + idempotent", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			a, b := rFormT(2), rFormT(2)
			tau := rTraj()
			if evalDirect(tAnd(a, b), tau, 0) == evalDirect(tAnd(b, a), tau, 0) &&
				evalDirect(tOr(a, b), tau, 0) == evalDirect(tOr(b, a), tau, 0) &&
				evalDirect(tAnd(a, a), tau, 0) == evalDirect(a, tau, 0) {
				return true, ""
			}
			return false, "lattice"
		})
	}},
	{"T4", "progression faithful (monitor ≡ direct)", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			a := rFormT(2)
			tau := rTraj()
			if satT(a, tau) == evalDirect(a, tau, 0) {
				return true, ""
			}
			return false, "progress≠direct"
		})
	}},
	{"T5", "safety finite-witness / liveness never-early", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			p := rAtomT()
			tau := rTraj()
			g := monitor(tAlways(p), tau)
			if g.Verdict == "violated" && !includesStr(g.Online, "vio") {
				return false, "safety-no-witness"
			}
			f := monitor(tEventually(p), tau)
			if includesStr(f.Online, "vio") {
				return false, "liveness-early-false"
			}
			return true, ""
		})
	}},
	{"T6", "G/∧ and F/∨ distribute", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			a, b := rFormT(1), rFormT(1)
			tau := rTraj()
			if evalDirect(tAlways(tAnd(a, b)), tau, 0) == evalDirect(tAnd(tAlways(a), tAlways(b)), tau, 0) &&
				evalDirect(tEventually(tOr(a, b)), tau, 0) == evalDirect(tOr(tEventually(a), tEventually(b)), tau, 0) {
				return true, ""
			}
			return false, "dist"
		})
	}},
	{"T7", "until fixpoint (φUψ≡ψ∨(φ∧X(φUψ)))", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			a, b := rFormT(1), rFormT(1)
			tau := rTraj()
			lhs := tUntil(a, b)
			rhs := tOr(b, tAnd(a, tNext(tUntil(a, b))))
			if evalDirect(lhs, tau, 0) == evalDirect(rhs, tau, 0) {
				return true, ""
			}
			return false, "until-fix"
		})
	}},
	{"T8", "lasso GF/FG + G/F vs unrolling", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			p := rAtomT()
			stem, loop := rTraj(), rTraj()
			someLoop, everyLoop := false, true
			for _, s := range loop {
				if p.Pred(s) {
					someLoop = true
				} else {
					everyLoop = false
				}
			}
			if monitorLasso(tGF(p), stem, loop) != someLoop {
				return false, "GF"
			}
			if monitorLasso(tFG(p), stem, loop) != everyLoop {
				return false, "FG"
			}
			unroll := append(append(append([]State{}, stem...), loop...), append(loop, loop...)...)
			if monitorLasso(tAlways(p), stem, loop) != evalDirect(tAlways(p), unroll, 0) {
				return false, "G-unroll"
			}
			if monitorLasso(tEventually(p), stem, loop) == evalDirect(tEventually(p), unroll, 0) {
				return true, ""
			}
			return false, "F-unroll"
		})
	}},
}

// ================= TEMPORAL BRIDGE (TB1–TB3) =================
var TBR = []Law{
	{"TB1", "safety shield prunes a violating step", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			safe := tAlways(tAtom("β≥.8", func(s State) bool { return s["beta"].(float64) >= 0.8 }))
			hist := []State{{"beta": 0.95}, {"beta": 0.9}}
			res := residualOf(safe, hist)
			if guard(res, State{"beta": 0.5}) == true && guard(res, State{"beta": 0.95}) == false {
				return true, ""
			}
			return false, "shield"
		})
	}},
	{"TB2", "unmet liveness ⇒ escalation at horizon", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			spec := NewTemporalSpec("reach-goal", tEventually(tAtom("done", func(s State) bool { return s["done"].(bool) })), "liveness", "escalate-replan")
			miss := supervise([]State{{"done": false}, {"done": false}}, []TemporalSpec{spec})
			hit := supervise([]State{{"done": false}, {"done": true}}, []TemporalSpec{spec})
			if miss.Escalation != nil && len(miss.Escalation.Specs) > 0 && miss.Escalation.Specs[0].Repair == "escalate-replan" && hit.Escalation == nil {
				return true, ""
			}
			return false, "esc"
		})
	}},
	{"TB3", "safety violation ⇒ unsafe verdict", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			spec := NewTemporalSpec("never-low", tAlways(tAtom("β≥.8", func(s State) bool { return s["beta"].(float64) >= 0.8 })), "safety", "")
			r := supervise([]State{{"beta": 0.9}, {"beta": 0.5}, {"beta": 0.9}}, []TemporalSpec{spec})
			if r.Safe == false && r.Reports[0].ViolatedAt == 1 {
				return true, ""
			}
			return false, "unsafe"
		})
	}},
}

// ================= REFLEXIVE LAWS (R1–R8) =================
func nm(id, mod string, pri float64, target *string) Norm {
	return NewNorm(Norm{ID: id, Modality: mod, Priority: pri, Target: target})
}

func randNm() Norm {
	mods := []string{"permitted", "obligatory", "forbidden"}
	targets := []string{"t1", "t2"}
	t := targets[rand.Intn(2)]
	return nm("n"+itoa(rand.Intn(1000000)), mods[rand.Intn(3)], float64(rand.Intn(5)), &t)
}

func policyHasNorm(p Policy, id string) bool {
	for _, q := range p.Norms {
		if q.ID == id {
			return true
		}
	}
	return false
}

var REFL = []Law{
	{"R1", "success (enact adds, repeal removes)", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			P := NewPolicy([]Norm{nm("a", "permitted", 0, nil)}, nil, nil)
			x := randNm()
			r1 := revise(P, enact(x, "self", 0))
			if !r1.Accepted || !policyHasNorm(r1.Policy, x.ID) {
				return false, "enact"
			}
			r2 := revise(r1.Policy, repeal(x.ID, "self", 0))
			if r2.Accepted && !policyHasNorm(r2.Policy, x.ID) {
				return true, ""
			}
			return false, "repeal"
		})
	}},
	{"R2", "consistency (no surviving dominated conflict)", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			ns := make([]Norm, 4)
			for i := range ns {
				ns[i] = randNm()
			}
			res := arbitrate(ns)
			norms := res.Norms
			for _, a := range norms {
				for _, b := range norms {
					dom := b.Priority > a.Priority || (b.Priority == a.Priority && b.Time > a.Time)
					conf := a.ID != b.ID && a.Target != nil && b.Target != nil && *a.Target == *b.Target &&
						((a.Modality == "obligatory" && b.Modality == "forbidden") || (a.Modality == "forbidden" && b.Modality == "obligatory"))
					if conf && dom {
						return false, "dominated-survivor"
					}
				}
			}
			return true, ""
		})
	}},
	{"R3", "minimal change (enact∘repeal = id)", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			P := NewPolicy([]Norm{nm("a", "permitted", 0, nil), nm("b", "obligatory", 3, nil)}, nil, nil)
			x := nm("x"+itoa(rand.Intn(100000)), "permitted", 0, nil)
			r1 := revise(P, enact(x, "self", 0))
			after := revise(r1.Policy, repeal(x.ID, "self", 0)).Policy
			if policyKey(after) == policyKey(P) {
				return true, ""
			}
			return false, "not-minimal"
		})
	}},
	{"R4", "entrenchment (no weakening the core)", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			P := entrench(NewPolicy([]Norm{nm("safe", "forbidden", 10, nil)}, nil, nil), "safe")
			if revise(P, repeal("safe", "self", 0)).Accepted {
				return false, "repealed-entrenched"
			}
			if revise(P, amend("safe", nm("safe", "permitted", 0, nil), "self", 0)).Accepted {
				return false, "weakened-entrenched"
			}
			strong := revise(P, amend("safe", nm("safe", "forbidden", 20, nil), "self", 0))
			if strong.Accepted {
				for _, q := range strong.Policy.Norms {
					if q.ID == "safe" && q.Priority == 20 {
						return true, ""
					}
				}
			}
			return false, "strengthen-blocked"
		})
	}},
	{"R5", "lex superior (priority wins)", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			g := "g"
			hi := nm("hi", "forbidden", 9, &g)
			lo := nm("lo", "obligatory", 2, &g)
			a := arbitrate([]Norm{hi, lo})
			hasHi := false
			for _, q := range a.Norms {
				if q.ID == "hi" {
					hasHi = true
				}
			}
			if hasHi && includesStr(a.Overridden, "lo") {
				return true, ""
			}
			return false, "superior"
		})
	}},
	{"R6", "lex posterior (recency breaks ties)", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			g := "g"
			old := nm("old", "forbidden", 5, &g)
			old.Time = 1
			neu := nm("new", "obligatory", 5, &g)
			neu.Time = 9
			a := arbitrate([]Norm{old, neu})
			hasNew := false
			for _, q := range a.Norms {
				if q.ID == "new" {
					hasNew = true
				}
			}
			if hasNew && includesStr(a.Overridden, "old") {
				return true, ""
			}
			return false, "posterior"
		})
	}},
	{"R7", "arbitration idempotent", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			ns := make([]Norm, 4)
			for i := range ns {
				ns[i] = randNm()
			}
			a1 := arbitrate(ns)
			a2 := arbitrate(a1.Norms)
			if len(a2.Overridden) == 0 && len(a2.Norms) == len(a1.Norms) {
				return true, ""
			}
			return false, "not-idempotent"
		})
	}},
	{"R8", "reflective stability (fixpoint)", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			P := entrench(NewPolicy([]Norm{nm("safe", "forbidden", 10, nil)}, nil, nil), "safe")
			props := []Amendment{
				enact(nm("p1", "permitted", 0, nil), "self", 0),
				repeal("safe", "self", 0),
				enact(nm("p2", "obligatory", 1, nil), "self", 0),
			}
			s1 := stabilize(P, props, 0)
			s2 := stabilize(s1.Policy, props, 0)
			if s1.Stable && policyKey(s2.Policy) == policyKey(s1.Policy) {
				return true, ""
			}
			return false, "unstable"
		})
	}},
}

// ================= REFLEXIVE BRIDGE (RB1–RB3) =================
var REFB = []Law{
	{"RB1", "cannot self-permit the forbidden", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			X := "X"
			P := entrench(NewPolicy([]Norm{nm("forbid-X", "forbidden", 10, &X)}, nil, nil), "forbid-X")
			if revise(P, enact(nm("force-X", "obligatory", 10, &X), "self", 0)).Accepted == false {
				return true, ""
			}
			return false, "self-permitted"
		})
	}},
	{"RB2", "revision propagates to govern", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			bm := 0.9
			req := Requirements{BetaMin: &bm, Acyclic: true}
			A := Option{ID: "A", Value: feasV(), Utility: 99, HasUtility: true, Ctx: map[string]interface{}{"x": true}}
			B := Option{ID: "B", Value: feasV(), Utility: 1, HasUtility: true, Ctx: map[string]interface{}{}}
			before := govern([]Option{A, B}, GovernOpts{Req: req, Norms: nil})
			if before.Decision != "A" {
				return false, "pre"
			}
			forbidA := NewNorm(Norm{ID: "forbid-A", Modality: "forbidden", Priority: 5,
				Condition: func(c map[string]interface{}) bool { return c["x"] == true }})
			P := revise(NewPolicy(nil, nil, nil), enact(forbidA, "self", 0))
			after := govern([]Option{A, B}, GovernOpts{Req: req, Norms: P.Policy.Norms})
			if after.Decision == "B" {
				for _, v := range after.DeonticallyVetoed {
					if v.ID == "A" {
						return true, ""
					}
				}
			}
			return false, "no-propagate"
		})
	}},
	{"RB3", "entrenched safety survives in supervise", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			spec := NewTemporalSpec("floor", tAlways(tAtom("β", func(s State) bool { return s["beta"].(float64) >= 0.8 })), "safety", "")
			P := NewPolicy(nil, []TemporalSpec{spec}, nil)
			P = entrench(P, "floor")
			if revise(P, repeal("floor", "self", 0)).Accepted {
				return false, "repealed"
			}
			r := supervise([]State{{"beta": 0.9}, {"beta": 0.5}}, P.Specs)
			if r.Safe == false && r.Reports[0].ViolatedAt == 1 {
				return true, ""
			}
			return false, "not-enforced"
		})
	}},
}
