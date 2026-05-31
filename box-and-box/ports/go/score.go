package main

// score.go — Heuristic Arithmetic (port of score.mjs).
// A Score lives in a SEMIRING (K, ⊕, ⊗, 0̲, 1̲): ⊕ aggregates alternatives, ⊗ chains
// evidence. 0̲ annihilates ⊗ — the algebraic root of the bridge veto. Laws H1–H13.

import "math"

// Semiring is a commutative-additive / associative-multiplicative dioid.
type Semiring struct {
	Label      string
	Oplus      func(a, b float64) float64
	Otimes     func(a, b float64) float64
	Zero       float64
	One        float64
	Idempotent bool
}

func logsumexp(a, b float64) float64 {
	if math.IsInf(a, -1) {
		return b
	}
	if math.IsInf(b, -1) {
		return a
	}
	m := math.Max(a, b)
	return m + math.Log(math.Exp(a-m)+math.Exp(b-m))
}

func tropicalOtimes(a, b float64) float64 {
	if math.IsInf(a, -1) || math.IsInf(b, -1) {
		return math.Inf(-1)
	}
	return a + b
}

// Semirings registry (tropical / probability / log).
var Semirings = map[string]Semiring{
	"tropical": {
		Label:      "(max, +)",
		Oplus:      func(a, b float64) float64 { return math.Max(a, b) },
		Otimes:     tropicalOtimes,
		Zero:       math.Inf(-1),
		One:        0,
		Idempotent: true,
	},
	"probability": {
		Label:      "(+, ×)",
		Oplus:      func(a, b float64) float64 { return a + b },
		Otimes:     func(a, b float64) float64 { return a * b },
		Zero:       0,
		One:        1,
		Idempotent: false,
	},
	"log": {
		Label:      "(logsumexp, +)",
		Oplus:      logsumexp,
		Otimes:     tropicalOtimes,
		Zero:       math.Inf(-1),
		One:        0,
		Idempotent: false,
	},
}

func semiring(name string) Semiring {
	if s, ok := Semirings[name]; ok {
		return s
	}
	return Semirings["tropical"]
}

// Score carries a utility plus the soft analogues of the invariant families.
type Score struct {
	U       float64 // semiring carrier
	W       float64 // [0,1] trust (×)
	Eps     float64 // [0,1] exploration
	Gamma   float64 // (0,1] discount
	Visits  int     // ℕ under +
	Sources []string
}

// NewScore builds a Score with sensible defaults (matching score.mjs Score()).
func NewScore(u, w, eps, gamma float64, visits int, sources []string) Score {
	if sources == nil {
		sources = []string{}
	}
	return Score{U: u, W: w, Eps: eps, Gamma: gamma, Visits: visits, Sources: append([]string{}, sources...)}
}

// vote : aggregate alternatives (⊕ side).
func vote(a, b Score, semiringName string) Score {
	s := semiring(semiringName)
	return Score{
		U:       s.Oplus(a.U, b.U),
		W:       a.W * b.W,
		Eps:     math.Max(a.Eps, b.Eps),
		Gamma:   math.Min(a.Gamma, b.Gamma),
		Visits:  a.Visits + b.Visits,
		Sources: concatStr(a.Sources, b.Sources),
	}
}

// rollout : chain evidence along a path, γ-discounted (⊗ side).
func rollout(scores []Score, gamma float64, semiringName string) float64 {
	s := semiring(semiringName)
	acc := s.One
	for t, sc := range scores {
		var discounted float64
		if sc.U == s.Zero {
			discounted = s.Zero
		} else {
			discounted = math.Pow(gamma, float64(t)) * sc.U
		}
		acc = s.Otimes(acc, discounted)
	}
	return acc
}

// reinforce : η-contraction toward a target.
func reinforce(u, target, eta float64) float64 { return (1-eta)*u + eta*target }

// Opt is a Pareto candidate (higher-is-better objectives).
type Opt struct {
	ID  int
	Obj []float64
}

// dominate : Pareto-prune (idempotent, antitone).
func dominate(opts []Opt) []Opt {
	out := []Opt{}
	for _, a := range opts {
		dominated := false
		for _, b := range opts {
			if b.ID == a.ID {
				continue
			}
			allGE := true
			someGT := false
			for i := range b.Obj {
				if b.Obj[i] < a.Obj[i] {
					allGE = false
				}
				if b.Obj[i] > a.Obj[i] {
					someGT = true
				}
			}
			if allGE && someGT {
				dominated = true
				break
			}
		}
		if !dominated {
			out = append(out, a)
		}
	}
	return out
}

// anneal : ε → 0 (idempotent).
func anneal(s Score) Score {
	r := s
	r.Eps = 0
	r.Sources = append([]string{}, s.Sources...)
	return r
}

// softmax (shift-invariant; T→0 ⇒ argmax).
func softmax(us []float64, T float64) []float64 {
	m := us[0]
	for _, u := range us {
		if u > m {
			m = u
		}
	}
	ex := make([]float64, len(us))
	z := 0.0
	for i, u := range us {
		ex[i] = math.Exp((u - m) / T)
		z += ex[i]
	}
	out := make([]float64, len(us))
	for i := range ex {
		out[i] = ex[i] / z
	}
	return out
}
