package main

// govern.go — three-modality decision (port of govern.mjs). Laws DB1–DB3.
// Precedence: ALETHIC ▸ DEONTIC ▸ AXIOLOGICAL.

import "sort"

// GovernOpts configures govern.
type GovernOpts struct {
	Req      Requirements
	Norms    []Norm
	Semiring string
}

// DeonticVeto records a deontically forbidden option.
type DeonticVeto struct {
	ID          string
	Status      string
	Overridable bool
	By          []string
	Overridden  []string
}

// AlethicVeto records an alethically infeasible option.
type AlethicVeto struct {
	ID       string
	Failures []Failure
}

// Escalation records a contrary-to-duty escalation.
type Escalation struct {
	Required      bool
	Repair        string
	Reason        string
	BlockedOption string
	BlockedBy     []Failure
}

// GovernRanking is a ranked admissible item.
type GovernRanking struct {
	ID     string
	Score  float64
	Status string
}

// GovernResult is the output of govern.
type GovernResult struct {
	Decision           string
	HasDecision        bool
	ForcedByObligation bool
	Escalation         *Escalation
	Margin             *float64
	Semiring           string
	Ranking            []GovernRanking
	DeonticallyVetoed  []DeonticVeto
	AlethicallyVetoed  []AlethicVeto
}

type govEval struct {
	id           string
	utility      float64
	ctx          map[string]interface{}
	value        Value
	feasible     bool
	feasFail     []Failure
	status       string
	overridden   []string
	contributors []Contributor
}

func hasContributor(e govEval, id string) bool {
	for _, c := range e.contributors {
		if c.ID == id {
			return true
		}
	}
	return false
}

func govern(options []Option, opts GovernOpts) GovernResult {
	semiringName := opts.Semiring
	if semiringName == "" {
		semiringName = "tropical"
	}
	s := semiring(semiringName)

	ev := make([]govEval, 0, len(options))
	for _, o := range options {
		feas := consume(o.Value, opts.Req)
		ctx := o.Ctx
		if ctx == nil {
			ctx = map[string]interface{}{}
		}
		v := resolve(adjudicateStatus(ctx, opts.Norms))
		ev = append(ev, govEval{
			id: o.ID, utility: o.util(s), ctx: ctx, value: o.Value,
			feasible: feas.Ok, feasFail: feas.Failures,
			status: v.Resolved, overridden: v.Overridden, contributors: v.Contributors,
		})
	}

	var alethicallyVetoed []AlethicVeto
	var survivors []govEval
	for _, e := range ev {
		if !e.feasible {
			alethicallyVetoed = append(alethicallyVetoed, AlethicVeto{ID: e.id, Failures: e.feasFail})
		} else {
			survivors = append(survivors, e)
		}
	}

	var deonticallyVetoed []DeonticVeto
	var admissible []govEval
	var obligatoryFeasible []govEval
	for _, e := range survivors {
		if e.status == FORBIDDEN {
			by := []string{}
			for _, c := range e.contributors {
				if c.Modality == "forbidden" {
					by = append(by, c.ID)
				}
			}
			deonticallyVetoed = append(deonticallyVetoed, DeonticVeto{ID: e.id, Status: e.status, Overridable: true, By: by, Overridden: e.overridden})
		}
		if e.status == OPTIONAL || e.status == OBLIGATORY {
			admissible = append(admissible, e)
			if e.status == OBLIGATORY {
				obligatoryFeasible = append(obligatoryFeasible, e)
			}
		}
	}

	var obligedButBlocked []govEval
	for _, e := range ev {
		if e.status == OBLIGATORY && !e.feasible {
			obligedButBlocked = append(obligedButBlocked, e)
		}
	}

	var escalation *Escalation
	if len(obligedButBlocked) > 0 && len(obligatoryFeasible) == 0 {
		blocked := obligedButBlocked[0]
		var nrm *Norm
		for i := range opts.Norms {
			if opts.Norms[i].Modality == "obligatory" && hasContributor(blocked, opts.Norms[i].ID) {
				nrm = &opts.Norms[i]
				break
			}
		}
		if nrm == nil {
			for i := range opts.Norms {
				if opts.Norms[i].Modality == "obligatory" {
					nrm = &opts.Norms[i]
					break
				}
			}
		}
		esc := escalate(nrm, blocked.ctx)
		repairID := "escalate-to-human"
		if esc.Repair != nil {
			repairID = esc.Repair.ID
		}
		escalation = &Escalation{Required: true, Repair: repairID, Reason: esc.Reason, BlockedOption: blocked.id, BlockedBy: blocked.feasFail}
	}

	if escalation == nil {
		for _, e := range survivors {
			if e.status == CONFLICT {
				escalation = &Escalation{Required: true, Repair: "escalate-to-human", Reason: "unresolved conflict on " + e.id, BlockedOption: e.id, BlockedBy: []Failure{}}
				break
			}
		}
	}

	pool := admissible
	if len(obligatoryFeasible) > 0 {
		pool = obligatoryFeasible
	}
	poolCopy := append([]govEval{}, pool...)
	sort.SliceStable(poolCopy, func(i, j int) bool { return poolCopy[i].utility > poolCopy[j].utility })

	res := GovernResult{Semiring: semiringName, DeonticallyVetoed: deonticallyVetoed, AlethicallyVetoed: alethicallyVetoed, Escalation: escalation}
	if escalation == nil && len(poolCopy) > 0 {
		res.Decision = poolCopy[0].id
		res.HasDecision = true
	}
	res.ForcedByObligation = res.HasDecision && len(obligatoryFeasible) > 0
	if len(poolCopy) > 1 {
		m := round3(poolCopy[0].utility - poolCopy[1].utility)
		res.Margin = &m
	}
	for _, e := range poolCopy {
		res.Ranking = append(res.Ranking, GovernRanking{ID: e.id, Score: round3(e.utility), Status: e.status})
	}
	return res
}
