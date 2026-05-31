package main

// laws.go — the 97-law property suite (port of test/laws.mjs). 2000 trials/law.
// JavaScript is the conformance reference; this port passes the same 97 laws.

import (
	"math"
	"math/rand"
	"sort"
)

// ---- shared random/equality helpers ----
func rnd(a, b float64) float64 { return a + rand.Float64()*(b-a) }

func approx(a, b float64) bool { return approxT(a, b, 1e-7) }
func approxT(a, b, t float64) bool {
	if a == b {
		return true
	}
	if math.IsInf(a, 0) || math.IsInf(b, 0) || math.IsNaN(a) || math.IsNaN(b) {
		return false
	}
	return math.Abs(a-b) <= t*(1+math.Abs(a)+math.Abs(b))
}

func setEq(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	x := append([]string{}, a...)
	y := append([]string{}, b...)
	sort.Strings(x)
	sort.Strings(y)
	for i := range x {
		if x[i] != y[i] {
			return false
		}
	}
	return true
}

func arrEqStr(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func ptrEq(a, b *string) bool {
	if a == nil && b == nil {
		return true
	}
	if a == nil || b == nil {
		return false
	}
	return *a == *b
}

func sampleTags(arr []string) []string {
	out := []string{}
	for _, x := range arr {
		if rand.Float64() < 0.5 {
			out = append(out, x)
		}
	}
	return out
}

func round2(x float64) float64 { return math.Round(x*100) / 100 }

// trial runs body n times; returns (pass, counterexample, atTrial).
type trialResult struct {
	pass bool
	cex  string
	at   int
}

func trial(n int, body func() (bool, string)) trialResult {
	for i := 0; i < n; i++ {
		ok, cex := body()
		if !ok {
			return trialResult{false, cex, i + 1}
		}
	}
	return trialResult{true, "", n}
}

// Law is a named property test.
type Law struct {
	ID   string
	Desc string
	Fn   func(n int) trialResult
}

// ---- the heuristic suite's mutable semiring (set per-suite) ----
var curS = Semirings["tropical"]

func setSemiring(name string) {
	if s, ok := Semirings[name]; ok {
		curS = s
	} else {
		curS = Semirings["tropical"]
	}
}

// ================= INVARIANT LAWS (L1–L14) =================
func randV() Value {
	ph := []*string{nil, strPtr("retrieve"), strPtr("route"), strPtr("act"), strPtr("learn"), strPtr("consolidate")}
	v := V0()
	v.N = round2(rnd(0, 10))
	v.Kappa = rand.Float64() < 0.5
	v.Beta = math.Round(rand.Float64()*1000) / 1000
	v.Sigma = sampleTags([]string{"x", "y", "z", "w"})
	v.Pi = ph[rand.Intn(len(ph))]
	if rand.Float64() < 0.5 {
		v.Authority = []string{"c" + itoa(rand.Intn(3))}
	}
	v.DenyDefault = rand.Float64() < 0.5
	if rand.Float64() < 0.5 {
		v.Audit = []string{"e" + itoa(rand.Intn(3))}
	}
	return v
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	digits := []byte{}
	for n > 0 {
		digits = append([]byte{byte('0' + n%10)}, digits...)
		n /= 10
	}
	return string(digits)
}

func valEq(a, b Value) bool {
	return approx(a.N, b.N) && a.Kappa == b.Kappa && approx(a.Beta, b.Beta) &&
		setEq(a.Sigma, b.Sigma) && ptrEq(a.Pi, b.Pi) && ptrEq(a.Iota, b.Iota) &&
		ptrEq(a.Psi, b.Psi) && arrEqStr(a.Authority, b.Authority) &&
		a.DenyDefault == b.DenyDefault && arrEqStr(a.Audit, b.Audit)
}

func forwardTriple() (Value, Value, Value) {
	idxs := []int{rand.Intn(len(Phases)), rand.Intn(len(Phases)), rand.Intn(len(Phases))}
	sort.Ints(idxs)
	out := [3]Value{}
	for k := 0; k < 3; k++ {
		v := randV()
		v.Pi = strPtr(Phases[idxs[k]])
		out[k] = v
	}
	return out[0], out[1], out[2]
}

var INV = []Law{
	{"L1", "combine associative", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			a, b, c := randV(), randV(), randV()
			if valEq(combine(combine(a, b), c), combine(a, combine(b, c))) {
				return true, ""
			}
			return false, "assoc"
		})
	}},
	{"L2", "combine identity V0", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			a := randV()
			if valEq(combine(a, V0()), a) && valEq(combine(V0(), a), a) {
				return true, ""
			}
			return false, "identity"
		})
	}},
	{"L3", "commutative families (n,κ,β,σ,deny)", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			a, b := randV(), randV()
			x, y := combine(a, b), combine(b, a)
			if approx(x.N, y.N) && x.Kappa == y.Kappa && approx(x.Beta, y.Beta) && setEq(x.Sigma, y.Sigma) && x.DenyDefault == y.DenyDefault {
				return true, ""
			}
			return false, "comm"
		})
	}},
	{"L4", "β idempotent under min", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			a := randV()
			if approx(combine(a, a).Beta, a.Beta) {
				return true, ""
			}
			return false, "β-idem"
		})
	}},
	{"L5", "σ idempotent under ∪", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			a := randV()
			if setEq(combine(a, a).Sigma, a.Sigma) {
				return true, ""
			}
			return false, "σ-idem"
		})
	}},
	{"L6", "κ idempotent under ∨", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			a := randV()
			if combine(a, a).Kappa == a.Kappa {
				return true, ""
			}
			return false, "κ-idem"
		})
	}},
	{"L7", "promote β-monotone", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			a := randV()
			ev := Evidence{Beta: rand.Float64(), HasBeta: true}
			if promote(a, ev).Beta >= a.Beta-1e-9 {
				return true, ""
			}
			return false, "monotone"
		})
	}},
	{"L8", "reconcile antitone + idempotent", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			a := randV()
			tags := sampleTags([]string{"x", "y", "z", "w"})
			r := reconcile(a, tags)
			sub := true
			for _, t := range r.Sigma {
				found := false
				for _, s := range a.Sigma {
					if s == t {
						found = true
						break
					}
				}
				if !found {
					sub = false
				}
			}
			if sub && setEq(reconcile(r, tags).Sigma, r.Sigma) {
				return true, ""
			}
			return false, "reconcile"
		})
	}},
	{"L9", "deliberate κ→false + idempotent", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			a := randV()
			d := deliberate(a)
			if !d.Kappa && !deliberate(d).Kappa {
				return true, ""
			}
			return false, "deliberate"
		})
	}},
	{"L10", "chain refuses a backward phase", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			a, b := randV(), randV()
			if a.Pi == nil || b.Pi == nil {
				return true, ""
			}
			r := chain(a, b)
			if phaseIdx(a.Pi) > phaseIdx(b.Pi) {
				if r.Err != "" {
					return true, ""
				}
				return false, "should refuse"
			}
			if r.Err != "" {
				return false, "should allow"
			}
			return true, ""
		})
	}},
	{"L11", "chain associative where defined", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			a, b, c := forwardTriple()
			l := chain(chain(a, b), c)
			r := chain(a, chain(b, c))
			if l.Err != "" || r.Err != "" {
				return true, ""
			}
			if valEq(l, r) {
				return true, ""
			}
			return false, "chain-assoc"
		})
	}},
	{"L12", "promote distributes over combine on β", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			a, b := randV(), randV()
			ev := Evidence{Beta: rand.Float64(), HasBeta: true}
			if approx(promote(combine(a, b), ev).Beta, combine(promote(a, ev), promote(b, ev)).Beta) {
				return true, ""
			}
			return false, "β-distrib"
		})
	}},
	{"L13", "consume gate (β_min)", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			a := randV()
			thr := 0.5
			ok := consume(a, Requirements{BetaMin: &thr}).Ok
			if ok == (a.Beta >= thr) {
				return true, ""
			}
			return false, "gate"
		})
	}},
	{"L14", "deny_default idempotent under ∧", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			a := randV()
			if combine(a, a).DenyDefault == a.DenyDefault {
				return true, ""
			}
			return false, "∧-idem"
		})
	}},
}

// ================= HEURISTIC LAWS (H1–H13) =================
func genG() float64 {
	r := rand.Float64()
	if r < 0.06 {
		return curS.Zero
	}
	if r < 0.12 {
		return curS.One
	}
	return round4(rnd(-12, 12))
}
func genGp() float64 {
	r := rand.Float64()
	if r < 0.06 {
		return 0
	}
	if r < 0.12 {
		return 1
	}
	return round4(rnd(0, 4))
}
func gen() float64 {
	if curS.Label == Semirings["probability"].Label {
		return genGp()
	}
	return genG()
}
func round4(x float64) float64 { return math.Round(x*10000) / 10000 }

func randScore() Score {
	return NewScore(gen(), rnd(0, 1), rnd(0, 1), rnd(0.5, 1), 0, nil)
}
func randOptObj() Opt {
	return Opt{ID: rand.Intn(1000000000), Obj: []float64{round2(rnd(0, 5)), round2(rnd(0, 5))}}
}

var HEUR = []Law{
	{"H1", "⊕ commutative monoid", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			a, b, c := gen(), gen(), gen()
			if !approx(curS.Oplus(a, b), curS.Oplus(b, a)) {
				return false, "comm"
			}
			if !approx(curS.Oplus(curS.Oplus(a, b), c), curS.Oplus(a, curS.Oplus(b, c))) {
				return false, "assoc"
			}
			if approx(curS.Oplus(a, curS.Zero), a) {
				return true, ""
			}
			return false, "id"
		})
	}},
	{"H2", "⊗ monoid", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			a, b, c := gen(), gen(), gen()
			if !approx(curS.Otimes(curS.Otimes(a, b), c), curS.Otimes(a, curS.Otimes(b, c))) {
				return false, "assoc"
			}
			if approx(curS.Otimes(a, curS.One), a) && approx(curS.Otimes(curS.One, a), a) {
				return true, ""
			}
			return false, "id"
		})
	}},
	{"H3", "left distributivity", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			a, b, c := gen(), gen(), gen()
			if approx(curS.Otimes(a, curS.Oplus(b, c)), curS.Oplus(curS.Otimes(a, b), curS.Otimes(a, c))) {
				return true, ""
			}
			return false, "distL"
		})
	}},
	{"H4", "right distributivity", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			a, b, c := gen(), gen(), gen()
			if approx(curS.Otimes(curS.Oplus(a, b), c), curS.Oplus(curS.Otimes(a, c), curS.Otimes(b, c))) {
				return true, ""
			}
			return false, "distR"
		})
	}},
	{"H5", "0̲ annihilates ⊗", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			a := gen()
			if curS.Otimes(curS.Zero, a) == curS.Zero && curS.Otimes(a, curS.Zero) == curS.Zero {
				return true, ""
			}
			return false, "annih"
		})
	}},
	{"H6", "⊕ idempotence (dioid only)", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			a := gen()
			if approx(curS.Oplus(a, a), a) {
				return true, ""
			}
			return false, "idem [expected off tropical]"
		})
	}},
	{"H7", "⊗ monotone in order", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			a, b := gen(), gen()
			if a > b {
				a, b = b, a
			}
			c := gen()
			if curS.Otimes(a, c) <= curS.Otimes(b, c) || approx(curS.Otimes(a, c), curS.Otimes(b, c)) {
				return true, ""
			}
			return false, "mono"
		})
	}},
	{"H8", "reinforce η-contraction", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			u, t, e := rnd(-10, 10), rnd(-10, 10), rnd(0.05, 0.95)
			got := math.Abs(reinforce(u, t, e) - t)
			want := (1 - e) * math.Abs(u-t)
			if approxT(got, want, 1e-6) && got <= math.Abs(u-t)+1e-9 {
				return true, ""
			}
			return false, "contr"
		})
	}},
	{"H9", "rollout γ-contraction", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			g := rnd(0.1, 0.95)
			d := 3
			u := make([]float64, d)
			v := make([]float64, d)
			r := make([]float64, d)
			for i := 0; i < d; i++ {
				u[i] = rnd(-8, 8)
				v[i] = rnd(-8, 8)
				r[i] = rnd(-5, 5)
			}
			num, den := 0.0, 0.0
			for i := 0; i < d; i++ {
				Bu := r[i] + g*u[i]
				Bv := r[i] + g*v[i]
				if dd := math.Abs(Bu - Bv); dd > num {
					num = dd
				}
				if dd := math.Abs(u[i] - v[i]); dd > den {
					den = dd
				}
			}
			if approxT(num, g*den, 1e-6) {
				return true, ""
			}
			return false, "γ-contr"
		})
	}},
	{"H10", "dominate idempotent + Pareto", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			k := 4 + rand.Intn(4)
			opts := make([]Opt, k)
			for i := range opts {
				opts[i] = randOptObj()
			}
			p1 := dominate(opts)
			p2 := dominate(p1)
			ids := func(os []Opt) []string {
				out := []string{}
				for _, o := range os {
					out = append(out, itoa(o.ID))
				}
				sort.Strings(out)
				return out
			}
			if !arrEqStr(ids(p1), ids(p2)) {
				return false, "not-idem"
			}
			for _, a := range p1 {
				for _, b := range p1 {
					if a.ID == b.ID {
						continue
					}
					allGE, someGT := true, false
					for i := range b.Obj {
						if b.Obj[i] < a.Obj[i] {
							allGE = false
						}
						if b.Obj[i] > a.Obj[i] {
							someGT = true
						}
					}
					if allGE && someGT {
						return false, "dominated survivor"
					}
				}
			}
			return true, ""
		})
	}},
	{"H11", "anneal ε→0 idempotent", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			s := randScore()
			a1 := anneal(s)
			a2 := anneal(a1)
			if a1.Eps == 0 && a2.Eps == 0 {
				return true, ""
			}
			return false, "ε"
		})
	}},
	{"H12", "softmax shift-invariant", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			k := 4
			T := rnd(0.3, 2)
			u := make([]float64, k)
			for i := range u {
				u[i] = rnd(-6, 6)
			}
			c := rnd(-5, 5)
			us2 := make([]float64, k)
			for i := range u {
				us2[i] = u[i] + c
			}
			a := softmax(u, T)
			b := softmax(us2, T)
			for i := range a {
				if !approxT(a[i], b[i], 1e-6) {
					return false, "shift"
				}
			}
			return true, ""
		})
	}},
	{"H13", "T→0 collapses to argmax", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			k := 5
			u := make([]float64, k)
			for i := range u {
				u[i] = round3(rnd(-6, 6))
			}
			sm := softmax(u, 0.01)
			argmaxIdx := func(xs []float64) int {
				mi, mv := 0, xs[0]
				for i, x := range xs {
					if x > mv {
						mv = x
						mi = i
					}
				}
				return mi
			}
			if argmaxIdx(sm) == argmaxIdx(u) {
				return true, ""
			}
			return false, "argmax"
		})
	}},
}

// ================= BRIDGE LAWS (B1–B3) =================
func randOption() Option {
	v := V0()
	v.Beta = math.Round(rand.Float64()*1000) / 1000
	v.Kappa = rand.Float64() < 0.4
	v.Sigma = sampleTags([]string{"c"})
	return Option{ID: "opt" + itoa(rand.Intn(1000000)), Value: v, Utility: round3(rnd(0, 10)), HasUtility: true}
}

var bridgeReq = func() Requirements {
	bm := 0.5
	return Requirements{BetaMin: &bm, Acyclic: true}
}()

var BR = []Law{
	{"B1", "veto ⇒ score 0̲", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			o := randOption()
			g := gatedScore(o, bridgeReq, "tropical")
			if consume(o.Value, bridgeReq).Ok {
				return true, ""
			}
			if math.IsInf(g.Score, -1) {
				return true, ""
			}
			return false, "not annihilated"
		})
	}},
	{"B2", "select ranks within feasible", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			k := 2 + rand.Intn(4)
			opts := make([]Option, k)
			for i := range opts {
				opts[i] = randOption()
			}
			r := selectOptions(opts, bridgeReq, "tropical")
			if !r.HasDec {
				return true, ""
			}
			var feas []Option
			for _, o := range opts {
				if consume(o.Value, bridgeReq).Ok {
					feas = append(feas, o)
				}
			}
			var chosenU float64
			found := false
			for _, o := range feas {
				if o.ID == r.Decision {
					chosenU = o.Utility
					found = true
				}
			}
			if !found {
				return false, "chose infeasible"
			}
			for _, o := range feas {
				if o.Utility > chosenU+1e-9 {
					return false, "feasible outranks chosen"
				}
			}
			return true, ""
		})
	}},
	{"B3", "conservativity: one feasible ⇒ chosen", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			opts := make([]Option, 3)
			for i := range opts {
				opts[i] = randOption()
			}
			idx := rand.Intn(3)
			for j := range opts {
				v := V0()
				if j == idx {
					v.Beta = 0.99
					v.Kappa = false
					opts[j].Value = v
				} else {
					v.Beta = 0.99
					v.Kappa = true
					opts[j].Value = v
					opts[j].Utility = 999
					opts[j].HasUtility = true
				}
			}
			r := selectOptions(opts, bridgeReq, "tropical")
			if r.HasDec && r.Decision == opts[idx].ID {
				return true, ""
			}
			return false, "not unique feasible"
		})
	}},
}

// ================= DEONTIC LAWS (D1–D9) =================
var stati = []string{OPTIONAL, OBLIGATORY, FORBIDDEN, CONFLICT}

func randStatus() string { return stati[rand.Intn(len(stati))] }

var DEON = []Law{
	{"D1", "join commutative + associative", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			a, b, c := randStatus(), randStatus(), randStatus()
			if join(a, b) != join(b, a) {
				return false, "comm"
			}
			if join(join(a, b), c) == join(a, join(b, c)) {
				return true, ""
			}
			return false, "assoc"
		})
	}},
	{"D2", "join identity OPTIONAL + idempotent", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			a := randStatus()
			if join(a, OPTIONAL) == a && join(a, a) == a {
				return true, ""
			}
			return false, "id/idem"
		})
	}},
	{"D3", "O ⊔ F = CONFLICT", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			if join(OBLIGATORY, FORBIDDEN) == CONFLICT {
				return true, ""
			}
			return false, "no-conflict"
		})
	}},
	{"D4", "join monotone (a ⊑ a⊔b)", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			a, b := randStatus(), randStatus()
			if rank(join(a, b)) >= rank(a) && rank(join(a, b)) >= rank(b) {
				return true, ""
			}
			return false, "mono"
		})
	}},
	{"D5", "CONFLICT absorbs", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			a := randStatus()
			if join(CONFLICT, a) == CONFLICT {
				return true, ""
			}
			return false, "absorb"
		})
	}},
	{"D6", "resolve idempotent + clears conflict (distinct prio)", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			v := StatusVerdict{Status: CONFLICT, Contributors: []Contributor{
				{ID: "o", Modality: "obligatory", Priority: 5},
				{ID: "f", Modality: "forbidden", Priority: 2},
			}}
			r1 := resolve(v)
			if r1.Resolved == CONFLICT {
				return false, "did-not-clear"
			}
			r2 := resolve(r1)
			if r2.Resolved == r1.Resolved {
				return true, ""
			}
			return false, "not-idempotent"
		})
	}},
	{"D7", "factual detachment (in force iff condition)", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			c := rand.Float64() < 0.5
			nm := NewNorm(Norm{Modality: "obligatory", Condition: func(map[string]interface{}) bool { return c }})
			if detach(nm, map[string]interface{}{}, false).InForce == c {
				return true, ""
			}
			return false, "detach"
		})
	}},
	{"D8", "CTD partiality (repair iff violated)", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			ctd := NewNorm(Norm{ID: "r", Modality: "obligatory"})
			nm := NewNorm(Norm{ID: "p", Modality: "obligatory", Ctd: &ctd})
			d1 := detach(nm, map[string]interface{}{}, false)
			d2 := detach(nm, map[string]interface{}{}, true)
			if d1.Repair == nil && d2.Repair != nil && d2.Repair.ID == "r" {
				return true, ""
			}
			return false, "ctd"
		})
	}},
	{"D9", "comply: O⇒¬F (ought is permitted)", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			if comply(OBLIGATORY, true).Ok && !comply(FORBIDDEN, true).Ok && !comply(OBLIGATORY, false).Ok {
				return true, ""
			}
			return false, "comply"
		})
	}},
}

// ================= DEONTIC BRIDGE (DB1–DB3) =================
func feasV() Value {
	v := V0()
	v.Beta = 0.99
	v.Kappa = false
	return v
}
func infeasV() Value {
	v := V0()
	v.Beta = 0.10
	v.Kappa = true
	return v
}

var greq = func() Requirements {
	bm := 0.9
	return Requirements{BetaMin: &bm, Acyclic: true}
}()

var DBR = []Law{
	{"DB1", "forbidden excluded from decision", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			norms := []Norm{NewNorm(Norm{ID: "no-x", Modality: "forbidden", Priority: 5,
				Condition: func(c map[string]interface{}) bool { return c["x"] == true }})}
			opts := []Option{
				{ID: "safe", Value: feasV(), Utility: 1, HasUtility: true, Ctx: map[string]interface{}{}},
				{ID: "bad", Value: feasV(), Utility: 99, HasUtility: true, Ctx: map[string]interface{}{"x": true}},
			}
			r := govern(opts, GovernOpts{Req: greq, Norms: norms})
			if r.Decision == "safe" {
				for _, v := range r.DeonticallyVetoed {
					if v.ID == "bad" {
						return true, ""
					}
				}
			}
			return false, "forbidden-not-excluded"
		})
	}},
	{"DB2", "obligation forces over higher score", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			norms := []Norm{NewNorm(Norm{ID: "must-c", Modality: "obligatory", Priority: 5,
				Condition: func(c map[string]interface{}) bool { return c["duty"] == true }})}
			opts := []Option{
				{ID: "A", Value: feasV(), Utility: 99, HasUtility: true, Ctx: map[string]interface{}{}},
				{ID: "C", Value: feasV(), Utility: 1, HasUtility: true, Ctx: map[string]interface{}{"duty": true}},
			}
			r := govern(opts, GovernOpts{Req: greq, Norms: norms})
			if r.Decision == "C" && r.ForcedByObligation {
				return true, ""
			}
			return false, "obligation-not-forced"
		})
	}},
	{"DB3", "alethic precedence ⇒ CTD escalation", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			ctd := NewNorm(Norm{ID: "escalate-DPO", Modality: "obligatory"})
			norms := []Norm{NewNorm(Norm{ID: "must-c", Modality: "obligatory", Priority: 5, Ctd: &ctd,
				Condition: func(c map[string]interface{}) bool { return c["duty"] == true }})}
			opts := []Option{
				{ID: "A", Value: feasV(), Utility: 99, HasUtility: true, Ctx: map[string]interface{}{}},
				{ID: "C", Value: infeasV(), Utility: 1, HasUtility: true, Ctx: map[string]interface{}{"duty": true}},
			}
			r := govern(opts, GovernOpts{Req: greq, Norms: norms})
			if !r.HasDecision && r.Escalation != nil && r.Escalation.Repair == "escalate-DPO" {
				return true, ""
			}
			return false, "no-escalation"
		})
	}},
}
