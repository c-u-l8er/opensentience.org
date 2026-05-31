package main

// value.go — Invariant Arithmetic (port of value.mjs).
// A Value is a PRODUCT OF MONOIDS across families. combine merges; chain composes
// along PULSE phases (partial — refuses a backward step); promote/reconcile/deliberate
// are endomorphisms; consume is the boolean gate. Laws L1–L14.

import (
	"fmt"
	"math"
)

var Phases = []string{"retrieve", "route", "act", "learn", "consolidate"}

func phaseIdx(p *string) int {
	if p == nil {
		return -1
	}
	for i, x := range Phases {
		if x == *p {
			return i
		}
	}
	return -1
}

// Value is the carrier of the invariant product monoid.
type Value struct {
	N           float64  // ℝ under +
	Kappa       bool     // Bool under ∨ (OR) — cyclicity
	Beta        float64  // [0,1] under min — persistence / confidence
	Sigma       []string // Set<Tag> under ∪ — derived conflicts
	Pi          *string  // Phase|nil, first-non-null (NOT commutative)
	Iota        *string  // IdemKey, first-non-null
	Psi         *string  // Cadence, first-non-null
	Authority   []string // List<Cap> under concat (free monoid)
	DenyDefault bool     // Bool under ∧ (AND)
	Audit       []string // List<Event> under concat (free monoid)
	Err         string   // non-empty marks a ⟂ error value (from chain)
}

// V0 — identity element of the whole product monoid.
func V0() Value {
	return Value{
		N:           0,
		Kappa:       false,
		Beta:        1,
		Sigma:       []string{},
		Pi:          nil,
		Iota:        nil,
		Psi:         nil,
		Authority:   []string{},
		DenyDefault: true,
		Audit:       []string{},
	}
}

func strPtr(s string) *string { return &s }

func uniq(arr []string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, x := range arr {
		if !seen[x] {
			seen[x] = true
			out = append(out, x)
		}
	}
	return out
}

func firstNonNull(a, b *string) *string {
	if a != nil {
		return a
	}
	return b
}

func concatStr(a, b []string) []string {
	out := make([]string, 0, len(a)+len(b))
	out = append(out, a...)
	out = append(out, b...)
	return out
}

// combine : Value × Value → Value. Componentwise monoid op.
func combine(a, b Value) Value {
	return Value{
		N:           a.N + b.N,
		Kappa:       a.Kappa || b.Kappa,
		Beta:        math.Min(a.Beta, b.Beta),
		Sigma:       uniq(concatStr(a.Sigma, b.Sigma)),
		Pi:          firstNonNull(a.Pi, b.Pi),
		Iota:        firstNonNull(a.Iota, b.Iota),
		Psi:         firstNonNull(a.Psi, b.Psi),
		Authority:   concatStr(a.Authority, b.Authority),
		DenyDefault: a.DenyDefault && b.DenyDefault,
		Audit:       concatStr(a.Audit, b.Audit),
	}
}

// chain : Value × Value → Value (PARTIAL). Defined only when phase(a) ≤ phase(b).
func chain(a, b Value) Value {
	if a.Pi != nil && b.Pi != nil && phaseIdx(a.Pi) > phaseIdx(b.Pi) {
		return Value{Err: fmt.Sprintf("π-violation: cannot chain '%s' after '%s'", *b.Pi, *a.Pi)}
	}
	r := combine(a, b)
	r.Pi = firstNonNull(b.Pi, a.Pi) // exit phase
	return r
}

// Evidence for promote.
type Evidence struct {
	Beta    float64
	HasBeta bool
}

// promote : β-monotone endomorphism: promote(v).β ≥ v.β.
func promote(v Value, ev Evidence) Value {
	r := cloneValue(v)
	eb := 0.0
	if ev.HasBeta {
		eb = ev.Beta
	}
	r.Beta = math.Max(v.Beta, eb)
	return r
}

func cloneValue(v Value) Value {
	r := v
	r.Sigma = append([]string{}, v.Sigma...)
	r.Authority = append([]string{}, v.Authority...)
	r.Audit = append([]string{}, v.Audit...)
	return r
}

// reconcile : σ-antitone, idempotent endomorphism: removes resolved conflict tags.
func reconcile(v Value, tags []string) Value {
	drop := map[string]bool{}
	for _, t := range tags {
		drop[t] = true
	}
	r := cloneValue(v)
	out := []string{}
	for _, t := range v.Sigma {
		if !drop[t] {
			out = append(out, t)
		}
	}
	r.Sigma = out
	return r
}

// deliberate : κ-antitone, idempotent endomorphism: forces κ = false.
func deliberate(v Value) Value {
	r := cloneValue(v)
	r.Kappa = false
	return r
}

// Requirements for consume.
type Requirements struct {
	BetaMin     *float64
	SigmaEmpty  bool
	Acyclic     bool
	Phase       *string
	ForwardFrom *string
	DenyDefault string // "must_allow" or ""
	Authorized  bool
}

// Failure is one gate failure.
type Failure struct {
	Family string
	Why    string
}

// Verdict is the result of consume.
type Verdict struct {
	Ok       bool
	Failures []Failure
	Value    Value
}

// consume : the correctness gate (a predicate, not an operation on Value).
func consume(v Value, req Requirements) Verdict {
	failures := []Failure{}
	if req.BetaMin != nil && v.Beta < *req.BetaMin {
		failures = append(failures, Failure{"β", fmt.Sprintf("β=%v < β_min=%v", round3(v.Beta), *req.BetaMin)})
	}
	if req.SigmaEmpty && len(v.Sigma) > 0 {
		failures = append(failures, Failure{"σ", "unresolved conflicts"})
	}
	if req.Acyclic && v.Kappa {
		failures = append(failures, Failure{"κ", "cyclic — self-reference detected"})
	}
	if req.Phase != nil && (v.Pi == nil || *v.Pi != *req.Phase) {
		piStr := "nil"
		if v.Pi != nil {
			piStr = *v.Pi
		}
		failures = append(failures, Failure{"π", fmt.Sprintf("phase %s ≠ required %s", piStr, *req.Phase)})
	}
	if req.ForwardFrom != nil && v.Pi != nil && phaseIdx(v.Pi) < phaseIdx(req.ForwardFrom) {
		failures = append(failures, Failure{"π", fmt.Sprintf("phase %s precedes %s", *v.Pi, *req.ForwardFrom)})
	}
	if req.DenyDefault == "must_allow" && v.DenyDefault && !req.Authorized {
		failures = append(failures, Failure{"governance", "deny_default with empty authority_path"})
	}
	return Verdict{Ok: len(failures) == 0, Failures: failures, Value: v}
}

func round3(x float64) float64 { return math.Round(x*1000) / 1000 }
