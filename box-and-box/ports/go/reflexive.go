package main

// reflexive.go — Reflexive Arithmetic / AGM policy revision (port of reflexive.mjs).
// Laws R1–R8, RB1–RB3. Capstone guarantee: entrenched core is immutable to weakening.

import (
	"sort"
	"strconv"
	"strings"
)

// Policy is the object being revised: deontic norms + temporal specs + entrenched ids.
type Policy struct {
	Norms      []Norm
	Specs      []TemporalSpec
	Entrenched map[string]bool
}

// NewPolicy builds a Policy (deep-copies slices/sets, matching reflexive.mjs Policy()).
func NewPolicy(norms []Norm, specs []TemporalSpec, entrenched []string) Policy {
	p := Policy{
		Norms:      append([]Norm{}, norms...),
		Specs:      append([]TemporalSpec{}, specs...),
		Entrenched: map[string]bool{},
	}
	for _, e := range entrenched {
		p.Entrenched[e] = true
	}
	return p
}

func clonePolicy(p Policy) Policy {
	np := Policy{
		Norms:      append([]Norm{}, p.Norms...),
		Specs:      append([]TemporalSpec{}, p.Specs...),
		Entrenched: map[string]bool{},
	}
	for k := range p.Entrenched {
		np.Entrenched[k] = true
	}
	return np
}

// Amendment is one legal move (enact / repeal / amend).
type Amendment struct {
	Op        string // "enact" | "repeal" | "amend"
	NormItem  *Norm
	SpecItem  *TemporalSpec
	ID        string
	Authority string
	Time      float64
}

func enact(item interface{}, authority string, time float64) Amendment {
	a := Amendment{Op: "enact", Authority: authority, Time: time}
	switch v := item.(type) {
	case Norm:
		a.NormItem = &v
	case *Norm:
		a.NormItem = v
	case TemporalSpec:
		a.SpecItem = &v
	case *TemporalSpec:
		a.SpecItem = v
	}
	return a
}

func repeal(id string, authority string, time float64) Amendment {
	return Amendment{Op: "repeal", ID: id, Authority: authority, Time: time}
}

func amend(id string, item interface{}, authority string, time float64) Amendment {
	a := Amendment{Op: "amend", ID: id, Authority: authority, Time: time}
	switch v := item.(type) {
	case Norm:
		a.NormItem = &v
	case *Norm:
		a.NormItem = v
	case TemporalSpec:
		a.SpecItem = &v
	case *TemporalSpec:
		a.SpecItem = v
	}
	return a
}

// findNorm locates a norm by id (norms take precedence over specs, like JS find()).
func findNorm(p Policy, id string) *Norm {
	for i := range p.Norms {
		if p.Norms[i].ID == id {
			return &p.Norms[i]
		}
	}
	return nil
}

func itemExists(p Policy, id string) bool {
	if findNorm(p, id) != nil {
		return true
	}
	for i := range p.Specs {
		if p.Specs[i].ID == id {
			return true
		}
	}
	return false
}

func normConflicts(a, b Norm) bool {
	return a.Target != nil && b.Target != nil && *a.Target == *b.Target &&
		((a.Modality == "obligatory" && b.Modality == "forbidden") ||
			(a.Modality == "forbidden" && b.Modality == "obligatory"))
}

func dedupeNorms(arr []Norm) []Norm {
	// last write wins per id, preserving insertion order of last occurrence.
	idx := map[string]int{}
	order := []string{}
	for _, x := range arr {
		if _, ok := idx[x.ID]; !ok {
			order = append(order, x.ID)
		}
		idx[x.ID] = -1 // placeholder
	}
	last := map[string]Norm{}
	for _, x := range arr {
		last[x.ID] = x
	}
	out := []Norm{}
	for _, id := range order {
		out = append(out, last[id])
	}
	return out
}

func dedupeSpecs(arr []TemporalSpec) []TemporalSpec {
	order := []string{}
	seen := map[string]bool{}
	for _, x := range arr {
		if !seen[x.ID] {
			seen[x.ID] = true
			order = append(order, x.ID)
		}
	}
	last := map[string]TemporalSpec{}
	for _, x := range arr {
		last[x.ID] = x
	}
	out := []TemporalSpec{}
	for _, id := range order {
		out = append(out, last[id])
	}
	return out
}

// Admissibility is the result of admissible.
type Admissibility struct {
	Ok     bool
	Reason string
}

// admissible : the reflexive guard — admissible only if it does not WEAKEN the core.
func admissible(p Policy, am Amendment) Admissibility {
	switch am.Op {
	case "repeal":
		if p.Entrenched[am.ID] {
			return Admissibility{false, "“" + am.ID + "” is entrenched — cannot be repealed"}
		}
		return Admissibility{Ok: true}
	case "amend":
		if !p.Entrenched[am.ID] {
			return Admissibility{Ok: true}
		}
		cur := findNorm(p, am.ID)
		next := am.NormItem
		if cur == nil || next == nil {
			return Admissibility{false, "“" + am.ID + "” is entrenched — cannot be amended"}
		}
		stronger := next.Modality == cur.Modality && next.Priority >= cur.Priority
		if stronger {
			return Admissibility{Ok: true}
		}
		return Admissibility{false, "amendment would weaken entrenched “" + am.ID + "”"}
	case "enact":
		if am.NormItem != nil {
			for id := range p.Entrenched {
				e := findNorm(p, id)
				if e != nil && normConflicts(*e, *am.NormItem) && am.NormItem.Priority >= e.Priority {
					return Admissibility{false, "enacted norm would override entrenched “" + id + "”"}
				}
			}
		}
		return Admissibility{Ok: true}
	}
	return Admissibility{false, "unknown op"}
}

// ArbitrateResult is the result of arbitrate.
type ArbitrateResult struct {
	Norms      []Norm
	Overridden []string
}

// arbitrate : same-target conflicts — lex superior (priority) then lex posterior (recency).
func arbitrate(norms []Norm) ArbitrateResult {
	overridden := []string{}
	inOverridden := func(id string) bool {
		for _, x := range overridden {
			if x == id {
				return true
			}
		}
		return false
	}
	for i := range norms {
		for j := range norms {
			a, b := norms[i], norms[j]
			if i == j || !normConflicts(a, b) {
				continue
			}
			aWins := a.Priority > b.Priority || (a.Priority == b.Priority && a.Time > b.Time)
			if aWins && !inOverridden(b.ID) {
				overridden = append(overridden, b.ID)
			}
		}
	}
	out := []Norm{}
	for _, n := range norms {
		if !inOverridden(n.ID) {
			out = append(out, n)
		}
	}
	return ArbitrateResult{Norms: out, Overridden: overridden}
}

// ReviseResult is the result of revise.
type ReviseResult struct {
	Policy     Policy
	Accepted   bool
	Reason     string
	Changed    string
	Overridden []string
}

// revise : the core operation — revise the policy by an amendment, if admissible.
func revise(p Policy, am Amendment) ReviseResult {
	adm := admissible(p, am)
	if !adm.Ok {
		return ReviseResult{Policy: p, Accepted: false, Reason: adm.Reason, Overridden: []string{}}
	}
	next := clonePolicy(p)
	stampNorm := func(n Norm) Norm {
		n.Time = am.Time
		n.Authority = am.Authority
		return n
	}
	stampSpec := func(s TemporalSpec) TemporalSpec { return s }
	switch am.Op {
	case "enact":
		if am.NormItem != nil {
			next.Norms = append(next.Norms, stampNorm(*am.NormItem))
		} else if am.SpecItem != nil {
			next.Specs = append(next.Specs, stampSpec(*am.SpecItem))
		}
	case "repeal":
		nn := []Norm{}
		for _, n := range next.Norms {
			if n.ID != am.ID {
				nn = append(nn, n)
			}
		}
		next.Norms = nn
		ss := []TemporalSpec{}
		for _, s := range next.Specs {
			if s.ID != am.ID {
				ss = append(ss, s)
			}
		}
		next.Specs = ss
	case "amend":
		for i := range next.Norms {
			if next.Norms[i].ID == am.ID && am.NormItem != nil {
				next.Norms[i] = stampNorm(*am.NormItem)
			}
		}
		for i := range next.Specs {
			if next.Specs[i].ID == am.ID && am.SpecItem != nil {
				next.Specs[i] = stampSpec(*am.SpecItem)
			}
		}
	}
	next.Norms = dedupeNorms(next.Norms)
	next.Specs = dedupeSpecs(next.Specs)
	arb := arbitrate(next.Norms)
	next.Norms = arb.Norms
	itemID := am.ID
	if am.NormItem != nil {
		itemID = am.NormItem.ID
	} else if am.SpecItem != nil {
		itemID = am.SpecItem.ID
	}
	return ReviseResult{Policy: next, Accepted: true, Reason: am.Op + " “" + itemID + "” accepted", Changed: am.Op, Overridden: arb.Overridden}
}

// entrench : monotone — add to the constitution, never remove.
func entrench(p Policy, id string) Policy {
	next := clonePolicy(p)
	next.Entrenched[id] = true
	return next
}

// policyKey : a canonical string key for fixpoint comparison.
func policyKey(p Policy) string {
	ns := []string{}
	for _, x := range p.Norms {
		ns = append(ns, x.ID+"|"+x.Modality+"|"+strconv.FormatFloat(x.Priority, 'g', -1, 64))
	}
	sort.Strings(ns)
	ss := []string{}
	for _, x := range p.Specs {
		ss = append(ss, x.ID)
	}
	sort.Strings(ss)
	es := []string{}
	for k := range p.Entrenched {
		es = append(es, k)
	}
	sort.Strings(es)
	return "n:[" + strings.Join(ns, ",") + "] s:[" + strings.Join(ss, ",") + "] e:[" + strings.Join(es, ",") + "]"
}

// StabilizeResult is the result of stabilize.
type StabilizeResult struct {
	Policy Policy
	Rounds int
	Stable bool
}

// stabilize : apply proposals until the policy stops changing (a fixed point).
func stabilize(p Policy, proposals []Amendment, maxRounds int) StabilizeResult {
	if maxRounds == 0 {
		maxRounds = 12
	}
	cur := p
	for round := 0; round < maxRounds; round++ {
		changed := false
		for _, am := range proposals {
			r := revise(cur, am)
			if r.Accepted && policyKey(r.Policy) != policyKey(cur) {
				cur = r.Policy
				changed = true
			}
		}
		if !changed {
			return StabilizeResult{Policy: cur, Rounds: round + 1, Stable: true}
		}
	}
	return StabilizeResult{Policy: cur, Rounds: maxRounds, Stable: false}
}
