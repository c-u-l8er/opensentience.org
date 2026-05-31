package main

// supervise.go — trajectory supervision (port of supervise.mjs). Laws TB1–TB3.

// TemporalSpec couples a formula with a kind (safety/liveness) and CTD repair.
type TemporalSpec struct {
	ID      string
	Formula *Formula
	Kind    string // "safety" | "liveness"
	Ctd     string
}

// NewTemporalSpec builds a TemporalSpec with kind default "safety".
func NewTemporalSpec(id string, formula *Formula, kind, ctd string) TemporalSpec {
	if kind == "" {
		kind = "safety"
	}
	return TemporalSpec{ID: id, Formula: formula, Kind: kind, Ctd: ctd}
}

func firstVio(online []string) int {
	for i, v := range online {
		if v == "vio" {
			return i
		}
	}
	return -1
}

// SuperviseReport is a per-spec report.
type SuperviseReport struct {
	ID         string
	Kind       string
	Verdict    string
	Online     []string
	DecidedAt  int
	ViolatedAt int // -1 if none / not safety
	Escalation string
	Reason     string
}

// SuperviseEscalation aggregates unmet liveness obligations.
type SuperviseEscalation struct {
	Required bool
	Specs    []EscSpec
}

// EscSpec is one escalated spec.
type EscSpec struct {
	ID     string
	Repair string
	Reason string
}

// SuperviseResult is the output of supervise.
type SuperviseResult struct {
	Reports    []SuperviseReport
	Safe       bool
	Escalation *SuperviseEscalation
}

func supervise(trajectory []State, specs []TemporalSpec) SuperviseResult {
	reports := []SuperviseReport{}
	for _, spec := range specs {
		m := monitor(spec.Formula, trajectory)
		r := SuperviseReport{
			ID: spec.ID, Kind: spec.Kind, Verdict: m.Verdict, Online: m.Online,
			DecidedAt: m.DecidedAt, ViolatedAt: -1,
		}
		if spec.Kind == "safety" {
			r.ViolatedAt = firstVio(m.Online)
		}
		if spec.Kind == "liveness" && m.Verdict == "violated" {
			if spec.Ctd != "" {
				r.Escalation = spec.Ctd
			} else {
				r.Escalation = "escalate-to-human"
			}
			r.Reason = "liveness obligation unmet within horizon"
		}
		reports = append(reports, r)
	}
	safetyViolated := 0
	var livenessUnmet []SuperviseReport
	for _, r := range reports {
		if r.Kind == "safety" && r.Verdict == "violated" {
			safetyViolated++
		}
		if r.Kind == "liveness" && r.Verdict == "violated" {
			livenessUnmet = append(livenessUnmet, r)
		}
	}
	res := SuperviseResult{Reports: reports, Safe: safetyViolated == 0}
	if len(livenessUnmet) > 0 {
		esc := &SuperviseEscalation{Required: true}
		for _, r := range livenessUnmet {
			esc.Specs = append(esc.Specs, EscSpec{ID: r.ID, Repair: r.Escalation, Reason: r.Reason})
		}
		res.Escalation = esc
	}
	return res
}

// residualOf : fold progress over a history.
func residualOf(formula *Formula, history []State) *Formula {
	f := formula
	for _, s := range history {
		f = progress(f, s)
	}
	return f
}

// guard : would the next state drive the residual to ⊥?
func guard(residual *Formula, nextState State) bool {
	return progress(residual, nextState).T == "false"
}
