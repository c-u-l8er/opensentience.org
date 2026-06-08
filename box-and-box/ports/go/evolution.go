package main

// evolution.go — the Evolution surface (port of evolution.mjs). Laws EV1–EV6.
// NOT a ninth rung. A BRIDGE that joins three existing rungs to decide whether a
// POLICY may change for the better, recording the verdict on a tamper-evident chain:
//   · reflexive (rung 5)  — MAY it change?  (entrenched floor is un-weakenable)
//   · axiological (rung 2) — DID it improve? (non-regression over a guard set)
//   · resource (rung 8)   — is the change WORTH its price? (Type-II)

import (
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
)

const GENESIS = "00000000"

// canon : canonical JSON — object keys sorted, so the digest is key-order independent.
func canon(x interface{}) string {
	switch v := x.(type) {
	case nil:
		return "null"
	case bool:
		if v {
			return "true"
		}
		return "false"
	case string:
		b, _ := json.Marshal(v)
		return string(b)
	case int:
		return strconv.Itoa(v)
	case float64:
		return strconv.FormatFloat(v, 'g', -1, 64)
	case []interface{}:
		parts := make([]string, len(v))
		for i, e := range v {
			parts[i] = canon(e)
		}
		return "[" + strings.Join(parts, ",") + "]"
	case map[string]interface{}:
		keys := make([]string, 0, len(v))
		for k := range v {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		parts := make([]string, len(keys))
		for i, k := range keys {
			kb, _ := json.Marshal(k)
			parts[i] = string(kb) + ":" + canon(v[k])
		}
		return "{" + strings.Join(parts, ",") + "}"
	default:
		b, _ := json.Marshal(x)
		return string(b)
	}
}

// hash : FNV-1a 32-bit — pure, deterministic. (Tamper-evidence, not secrecy.)
func hash(s string) string {
	var h uint32 = 0x811c9dc5
	for i := 0; i < len(s); i++ {
		h ^= uint32(s[i])
		h *= 0x01000193
	}
	return fmt.Sprintf("%08x", h)
}

func digest(obj interface{}) string { return hash(canon(obj)) }

// Record links a payload to its predecessor by content hash.
type Record struct {
	ID      string
	Prev    string
	Payload interface{}
}

func record(payload interface{}, prev string) Record {
	return Record{ID: hash(prev + canon(payload)), Prev: prev, Payload: payload}
}

// evoChain chains payloads into a provenance log (named evoChain to avoid value.go's chain).
func evoChain(payloads []interface{}, prev string) []Record {
	out := []Record{}
	p := prev
	for _, pl := range payloads {
		r := record(pl, p)
		out = append(out, r)
		p = r.ID
	}
	return out
}

// VerifyResult is the result of verify.
type VerifyResult struct {
	Ok     bool
	Reason string
	Head   string
	Length int
}

func verify(records []Record, prev string) VerifyResult {
	p := prev
	for _, r := range records {
		if r.Prev != p {
			return VerifyResult{Ok: false, Reason: "broken link at " + r.ID}
		}
		if record(r.Payload, r.Prev).ID != r.ID {
			return VerifyResult{Ok: false, Reason: "tampered payload at " + r.ID}
		}
		p = r.ID
	}
	return VerifyResult{Ok: true, Head: p, Length: len(records)}
}

// regresses : non-regression (the L-E6 crux) — no guard metric may drop below its prior value.
func regresses(before, after []float64) bool {
	tol := 1e-9
	n := len(before)
	if len(after) < n {
		n = len(after)
	}
	for i := 0; i < n; i++ {
		if after[i] < before[i]-tol {
			return true
		}
	}
	return false
}

func delta(before, after []float64) float64 {
	sb, sa := 0.0, 0.0
	for _, x := range before {
		sb += x
	}
	for _, x := range after {
		sa += x
	}
	return math.Floor((sa-sb)*1e6+0.5) / 1e6 // mirror JS Math.round
}

// Evidence is the third argument to evolve (kw-args in JS).
type EvoEvidence struct {
	Before   []float64
	After    []float64
	Price    *float64
	Ledger   *Ledger
	Account  string
	Resource string
	Prev     string
}

// EvolveResult is the verdict returned by evolve.
type EvolveResult struct {
	Decision    string
	Reason      string
	Policy      Policy
	Ledger      *Ledger
	Certificate map[string]interface{}
	Record      Record
}

// evolve : may this policy change, did it measurably improve, is it worth paying for?
func evolve(policy Policy, amendment Amendment, ev EvoEvidence) EvolveResult {
	if ev.Account == "" {
		ev.Account = "self"
	}
	if ev.Resource == "" {
		ev.Resource = "tokens"
	}
	if ev.Prev == "" {
		ev.Prev = GENESIS
	}
	var predicted interface{} = nil
	if amendment.Predict != nil {
		predicted = *amendment.Predict
	}
	observed := delta(ev.Before, ev.After)
	var verified interface{} = nil
	if amendment.Predict != nil {
		verified = observed >= *amendment.Predict-1e-9
	}
	reg := regresses(ev.Before, ev.After)

	ledgerAfter := ev.Ledger
	priced := false
	policyAfter := policy
	decision, reason := "", ""
	adm := admissible(policy, amendment)

	if !adm.Ok {
		decision, reason = "reject", "reflexive: "+adm.Reason // floor wins
	} else if reg {
		decision, reason = "reject", "axiological: a guard metric would regress"
	} else if ev.Price != nil { // Type-II pricing
		priced = true
		var L Ledger
		if ev.Ledger != nil {
			L = *ev.Ledger
		} else {
			L = NewLedger(nil, nil)
		}
		price := *ev.Price
		if !affords(L, ev.Account, map[string]float64{ev.Resource: price}) {
			decision = "escalate"
			reason = fmt.Sprintf("resource: cannot afford the change (%g %s)", price, ev.Resource)
		} else if !worthwhile(observed, price) {
			decision = "reject"
			reason = fmt.Sprintf("resource: not worthwhile (Δ %g < %g)", observed, price)
		} else {
			charged, ok := spend(L, ev.Account, ev.Resource, price)
			if !ok {
				decision = "escalate"
				reason = fmt.Sprintf("resource: cannot afford the change (%g %s)", price, ev.Resource)
			} else {
				decision = "accept"
				reason = fmt.Sprintf("priced: Δ %g ≥ %g %s", observed, price, ev.Resource)
				ledgerAfter = &charged
			}
		}
	} else {
		decision, reason = "accept", "admissible, non-regressing (unpriced)"
	}

	if decision == "accept" {
		r := revise(policy, amendment)
		if r.Accepted {
			policyAfter = r.Policy
		} else {
			decision = "reject"
			reason = "reflexive: " + r.Reason
			ledgerAfter = ev.Ledger // reverse charge
		}
	}

	var target interface{} = nil
	if amendment.NormItem != nil {
		target = amendment.NormItem.ID
	} else if amendment.SpecItem != nil {
		target = amendment.SpecItem.ID
	} else if amendment.ID != "" {
		target = amendment.ID
	}
	var priceVal interface{} = nil
	if ev.Price != nil {
		priceVal = *ev.Price
	}

	certificate := map[string]interface{}{
		"decision":     decision,
		"reason":       reason,
		"op":           amendment.Op,
		"target":       target,
		"predicted":    predicted,
		"observed":     observed,
		"verified":     verified,
		"regressed":    reg,
		"priced":       priced,
		"price":        priceVal,
		"policyBefore": policyKey(policy),
		"policyAfter":  policyKey(policyAfter),
		"rungs":        []interface{}{"reflexive", "axiological", "resource"},
	}
	return EvolveResult{
		Decision:    decision,
		Reason:      reason,
		Policy:      policyAfter,
		Ledger:      ledgerAfter,
		Certificate: certificate,
		Record:      record(certificate, ev.Prev),
	}
}
