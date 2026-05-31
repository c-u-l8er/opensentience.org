package main

// norm.go — Deontic Arithmetic (port of norm.mjs). Laws D1–D9.
// Diamond status lattice: OPTIONAL ⊑ {OBLIGATORY, FORBIDDEN} ⊑ CONFLICT.

import (
	"math"
	"strings"
)

const (
	OPTIONAL   = "optional"
	OBLIGATORY = "obligatory"
	FORBIDDEN  = "forbidden"
	CONFLICT   = "conflict"
)

var rankMap = map[string]int{"optional": 0, "obligatory": 1, "forbidden": 1, "conflict": 2}

func rank(s string) int { return rankMap[s] }

var mod2status = map[string]string{
	"obligatory": OBLIGATORY,
	"forbidden":  FORBIDDEN,
	"permitted":  OPTIONAL,
}

// join : least upper bound on the diamond lattice.
func join(a, b string) string {
	if a == b {
		return a
	}
	if a == OPTIONAL {
		return b
	}
	if b == OPTIONAL {
		return a
	}
	return CONFLICT
}

// Norm: a conditional rule of one modality, with priority and an optional CTD repair.
type Norm struct {
	ID        string
	Modality  string // "obligatory" | "forbidden" | "permitted"
	Condition func(ctx map[string]interface{}) bool
	Priority  float64
	Ctd       *Norm
	Target    *string
	// stamped on revision:
	Time      float64
	Authority string
}

// NewNorm builds a Norm with defaults matching norm.mjs Norm().
func NewNorm(n Norm) Norm {
	if n.ID == "" {
		n.ID = "norm"
	}
	if n.Modality == "" {
		n.Modality = "permitted"
	}
	if n.Condition == nil {
		n.Condition = func(map[string]interface{}) bool { return true }
	}
	return n
}

func safeCond(n Norm, ctx map[string]interface{}) bool {
	if n.Condition == nil {
		return true
	}
	defer func() { recover() }()
	return n.Condition(ctx)
}

// Contributor records a contributing norm in an adjudication.
type Contributor struct {
	ID       string
	Modality string
	Priority float64
}

// StatusVerdict is the adjudication / resolution result.
type StatusVerdict struct {
	Status       string
	Contributors []Contributor
	Resolved     string
	HasResolved  bool
	Overridden   []string
	Note         string
}

// adjudicateStatus accrues every applicable norm's status (join), tracking contributors.
func adjudicateStatus(ctx map[string]interface{}, norms []Norm) StatusVerdict {
	status := OPTIONAL
	contributors := []Contributor{}
	for _, n := range norms {
		if !safeCond(n, ctx) {
			continue
		}
		contributors = append(contributors, Contributor{ID: n.ID, Modality: n.Modality, Priority: n.Priority})
		status = join(status, mod2status[n.Modality])
	}
	return StatusVerdict{Status: status, Contributors: contributors}
}

// resolve : clear a CONFLICT by priority (idempotent; identity on non-conflict).
func resolve(verdict StatusVerdict) StatusVerdict {
	if verdict.Status != CONFLICT {
		verdict.Resolved = verdict.Status
		verdict.HasResolved = true
		verdict.Overridden = []string{}
		return verdict
	}
	maxOb := math.Inf(-1)
	maxFb := math.Inf(-1)
	var ob, fb []Contributor
	for _, c := range verdict.Contributors {
		if c.Modality == "obligatory" {
			ob = append(ob, c)
			if c.Priority > maxOb {
				maxOb = c.Priority
			}
		} else if c.Modality == "forbidden" {
			fb = append(fb, c)
			if c.Priority > maxFb {
				maxFb = c.Priority
			}
		}
	}
	if maxOb == maxFb {
		verdict.Resolved = CONFLICT
		verdict.HasResolved = true
		verdict.Overridden = []string{}
		verdict.Note = "deadlock: equal priority → escalate"
		return verdict
	}
	winnerObligatory := maxOb > maxFb
	var losers []Contributor
	if winnerObligatory {
		losers = fb
	} else {
		losers = ob
	}
	loserIDs := []string{}
	for _, c := range losers {
		loserIDs = append(loserIDs, c.ID)
	}
	winStatus := FORBIDDEN
	winWord := "forbidden"
	if winnerObligatory {
		winStatus = OBLIGATORY
		winWord = "obligatory"
	}
	verdict.Status = winStatus
	verdict.Resolved = winStatus
	verdict.HasResolved = true
	verdict.Overridden = loserIDs
	verdict.Note = winWord + " overrides [" + strings.Join(loserIDs, ", ") + "]"
	return verdict
}

// DetachResult is the result of detach.
type DetachResult struct {
	InForce bool
	Repair  *Norm
}

// detach : factual detachment. CTD repair detaches ONLY after the primary is violated.
func detach(norm Norm, ctx map[string]interface{}, violated bool) DetachResult {
	var repair *Norm
	if violated && norm.Ctd != nil {
		repair = norm.Ctd
	}
	return DetachResult{InForce: safeCond(norm, ctx), Repair: repair}
}

// ComplyResult is the result of comply.
type ComplyResult struct {
	Ok         bool
	Violations []string
}

// comply : the gate.
func comply(status string, intend bool) ComplyResult {
	violations := []string{}
	if status == FORBIDDEN && intend {
		violations = append(violations, "performing a forbidden action")
	}
	if status == OBLIGATORY && !intend {
		violations = append(violations, "omitting an obligatory action")
	}
	if status == CONFLICT {
		violations = append(violations, "unresolved normative conflict")
	}
	return ComplyResult{Ok: len(violations) == 0, Violations: violations}
}

// EscalateResult is the result of escalate.
type EscalateResult struct {
	Repair *Norm
	Reason string
}

// escalate : produce the contrary-to-duty repair obligation now in force.
func escalate(norm *Norm, ctx map[string]interface{}) EscalateResult {
	if norm != nil && norm.Ctd != nil {
		return EscalateResult{Repair: norm.Ctd, Reason: "CTD: " + norm.ID + " violated → " + norm.Ctd.ID + " in force"}
	}
	def := NewNorm(Norm{ID: "escalate-to-human", Modality: "obligatory", Priority: math.Inf(1)})
	id := "obligation"
	if norm != nil {
		id = norm.ID
	}
	return EscalateResult{Repair: &def, Reason: id + " violated, no CTD → default escalation"}
}
