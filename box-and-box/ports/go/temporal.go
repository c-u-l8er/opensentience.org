package main

// temporal.go — Temporal Arithmetic (port of temporal.mjs). Laws T1–T8.
// LTL formula progression with boolean-simplifying constructors.

// State is an arbitrary map; atoms are predicates on it.
type State = map[string]interface{}

// Formula is an LTL AST node.
type Formula struct {
	T    string // true,false,atom,not,and,or,next,always,eventually,until
	Name string
	Pred func(s State) bool
	A    *Formula
	B    *Formula
}

var fTrue = &Formula{T: "true"}
var fFalse = &Formula{T: "false"}

func tTrue() *Formula  { return fTrue }
func tFalse() *Formula { return fFalse }

func tAtom(name string, pred func(s State) bool) *Formula {
	return &Formula{T: "atom", Name: name, Pred: pred}
}

func isT(f *Formula) bool { return f.T == "true" }
func isF(f *Formula) bool { return f.T == "false" }

func eqF(a, b *Formula) bool {
	if a == b {
		return true
	}
	if a == nil || b == nil || a.T != b.T {
		return false
	}
	switch a.T {
	case "true", "false":
		return true
	case "atom":
		return a.Name == b.Name
	case "not", "next", "always", "eventually":
		return eqF(a.A, b.A)
	case "and", "or", "until":
		return eqF(a.A, b.A) && eqF(a.B, b.B)
	default:
		return false
	}
}

func tNot(f *Formula) *Formula {
	if isT(f) {
		return fFalse
	}
	if isF(f) {
		return fTrue
	}
	if f.T == "not" {
		return f.A // ¬¬φ = φ
	}
	return &Formula{T: "not", A: f}
}

func tAnd(a, b *Formula) *Formula {
	if isF(a) || isF(b) {
		return fFalse
	}
	if isT(a) {
		return b
	}
	if isT(b) {
		return a
	}
	if eqF(a, b) {
		return a
	}
	return &Formula{T: "and", A: a, B: b}
}

func tOr(a, b *Formula) *Formula {
	if isT(a) || isT(b) {
		return fTrue
	}
	if isF(a) {
		return b
	}
	if isF(b) {
		return a
	}
	if eqF(a, b) {
		return a
	}
	return &Formula{T: "or", A: a, B: b}
}

func tNext(a *Formula) *Formula       { return &Formula{T: "next", A: a} }
func tAlways(a *Formula) *Formula     { return &Formula{T: "always", A: a} }
func tEventually(a *Formula) *Formula { return &Formula{T: "eventually", A: a} }
func tUntil(a, b *Formula) *Formula   { return &Formula{T: "until", A: a, B: b} }

func tGF(a *Formula) *Formula { return tAlways(tEventually(a)) }
func tFG(a *Formula) *Formula { return tEventually(tAlways(a)) }
func tResponds(p, q *Formula) *Formula {
	return tAlways(tOr(tNot(p), tEventually(q)))
}

// progress : Spec × State → Spec (formula progression / LTL derivative).
func progress(f *Formula, s State) *Formula {
	switch f.T {
	case "true":
		return fTrue
	case "false":
		return fFalse
	case "atom":
		if f.Pred(s) {
			return fTrue
		}
		return fFalse
	case "not":
		return tNot(progress(f.A, s))
	case "and":
		return tAnd(progress(f.A, s), progress(f.B, s))
	case "or":
		return tOr(progress(f.A, s), progress(f.B, s))
	case "next":
		return f.A
	case "always":
		return tAnd(progress(f.A, s), tAlways(f.A))
	case "eventually":
		return tOr(progress(f.A, s), tEventually(f.A))
	case "until":
		return tOr(progress(f.B, s), tAnd(progress(f.A, s), tUntil(f.A, f.B)))
	default:
		return f
	}
}

// finalize : finite-trace closure (weak G, strong F/U/X).
func finalize(f *Formula) bool {
	switch f.T {
	case "true":
		return true
	case "false":
		return false
	case "atom":
		return false
	case "not":
		return !finalize(f.A)
	case "and":
		return finalize(f.A) && finalize(f.B)
	case "or":
		return finalize(f.A) || finalize(f.B)
	case "always":
		return true
	case "eventually":
		return false
	case "until":
		return false
	case "next":
		return false
	default:
		return false
	}
}

// MonitorResult is the output of monitor.
type MonitorResult struct {
	Verdict   string // "satisfied" | "violated"
	Online    []string
	Residual  *Formula
	DecidedAt int // -1 if undecided online
}

// monitor : Spec × Trajectory → verdict (+ step-by-step).
func monitor(f *Formula, trajectory []State) MonitorResult {
	residual := f
	trace := []string{}
	decidedAt := -1
	for i, s := range trajectory {
		residual = progress(residual, s)
		v := "pending"
		if isT(residual) {
			v = "sat"
		} else if isF(residual) {
			v = "vio"
		}
		if decidedAt == -1 && v != "pending" {
			decidedAt = i
		}
		trace = append(trace, v)
	}
	var finalSat bool
	if isT(residual) {
		finalSat = true
	} else if isF(residual) {
		finalSat = false
	} else {
		finalSat = finalize(residual)
	}
	verdict := "violated"
	if finalSat {
		verdict = "satisfied"
	}
	return MonitorResult{Verdict: verdict, Online: trace, Residual: residual, DecidedAt: decidedAt}
}

// evalDirect : independent reference semantics (finite trace), for law T4.
func evalDirect(f *Formula, tau []State, i int) bool {
	if i >= len(tau) { // empty suffix
		switch f.T {
		case "true":
			return true
		case "false":
			return false
		case "atom":
			return false
		case "not":
			return !evalDirect(f.A, tau, i)
		case "and":
			return evalDirect(f.A, tau, i) && evalDirect(f.B, tau, i)
		case "or":
			return evalDirect(f.A, tau, i) || evalDirect(f.B, tau, i)
		case "always":
			return true
		case "eventually":
			return false
		case "until":
			return false
		case "next":
			return false
		default:
			return false
		}
	}
	switch f.T {
	case "true":
		return true
	case "false":
		return false
	case "atom":
		return f.Pred(tau[i])
	case "not":
		return !evalDirect(f.A, tau, i)
	case "and":
		return evalDirect(f.A, tau, i) && evalDirect(f.B, tau, i)
	case "or":
		return evalDirect(f.A, tau, i) || evalDirect(f.B, tau, i)
	case "next":
		return evalDirect(f.A, tau, i+1)
	case "always":
		return evalDirect(f.A, tau, i) && evalDirect(tAlways(f.A), tau, i+1)
	case "eventually":
		return evalDirect(f.A, tau, i) || evalDirect(tEventually(f.A), tau, i+1)
	case "until":
		return evalDirect(f.B, tau, i) || (evalDirect(f.A, tau, i) && evalDirect(tUntil(f.A, f.B), tau, i+1))
	default:
		return false
	}
}

func someState(states []State, p *Formula) bool {
	for _, s := range states {
		if p.Pred(s) {
			return true
		}
	}
	return false
}

func everyState(states []State, p *Formula) bool {
	for _, s := range states {
		if !p.Pred(s) {
			return false
		}
	}
	return true
}

// monitorLasso : ω-words as lassos ⟨stem⟩⟨loop⟩^ω.
func monitorLasso(f *Formula, stem, loop []State) bool {
	if f.T == "always" && f.A.T == "atom" {
		return everyState(stem, f.A) && everyState(loop, f.A)
	}
	if f.T == "eventually" && f.A.T == "atom" {
		return someState(stem, f.A) || someState(loop, f.A)
	}
	if f.T == "always" && f.A.T == "eventually" && f.A.A.T == "atom" {
		return someState(loop, f.A.A)
	}
	if f.T == "eventually" && f.A.T == "always" && f.A.A.T == "atom" {
		return everyState(loop, f.A.A)
	}
	unroll := []State{}
	unroll = append(unroll, stem...)
	unroll = append(unroll, loop...)
	unroll = append(unroll, loop...)
	unroll = append(unroll, loop...)
	return evalDirect(f, unroll, 0)
}

// character : coarse classification hint.
func hasTag(f *Formula, tags []string) bool {
	if f == nil {
		return false
	}
	for _, t := range tags {
		if f.T == t {
			return true
		}
	}
	return hasTag(f.A, tags) || hasTag(f.B, tags)
}

func character(f *Formula) string {
	live := hasTag(f, []string{"eventually", "until"})
	if f.T == "always" && f.A != nil && f.A.T == "eventually" {
		return "liveness"
	}
	if !live {
		return "safety"
	}
	if hasTag(f, []string{"always"}) {
		return "mixed"
	}
	return "liveness"
}
