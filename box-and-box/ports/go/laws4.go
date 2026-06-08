package main

// laws4.go — EVOLUTION law suite (EV1–EV6), the measured/priced/certified self-revision bridge.

import "math/rand"

var EVO_L = []Law{
	{"EV1", "digest is canonical (key-order independent)", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			a := map[string]interface{}{
				"x": ri(5),
				"y": []interface{}{ri(3), ri(3)},
				"z": map[string]interface{}{"p": ri(2), "q": ri(2)},
			}
			z := a["z"].(map[string]interface{})
			b := map[string]interface{}{ // same content, shuffled keys
				"z": map[string]interface{}{"q": z["q"], "p": z["p"]},
				"y": append([]interface{}{}, a["y"].([]interface{})...),
				"x": a["x"],
			}
			if digest(a) == digest(b) {
				return true, ""
			}
			return false, "order-sensitive"
		})
	}},
	{"EV2", "provenance chain verifies; tampering breaks it", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			cnt := 1 + ri(4)
			payloads := make([]interface{}, cnt)
			for i := range payloads {
				payloads[i] = map[string]interface{}{"k": ri(1000000)}
			}
			ch := evoChain(payloads, GENESIS)
			if !verify(ch, GENESIS).Ok {
				return false, "genuine-chain-rejected"
			}
			i := ri(len(ch))
			tampered := make([]Record, len(ch))
			copy(tampered, ch)
			orig := tampered[i].Payload.(map[string]interface{})
			tampered[i] = Record{ID: tampered[i].ID, Prev: tampered[i].Prev,
				Payload: map[string]interface{}{"k": orig["k"].(int) + 1}}
			if verify(tampered, GENESIS).Ok {
				return false, "tamper-undetected"
			}
			return true, ""
		})
	}},
	{"EV3", "evolve refuses to weaken the entrenched floor", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			t := "t"
			P := entrench(NewPolicy([]Norm{nm("floor", "forbidden", 10, &t)}, nil, nil), "floor")
			weaken := amend("floor", nm("floor", "permitted", 0, nil), "self", 1) // even WITH improvement evidence
			r := evolve(P, weaken, EvoEvidence{Before: []float64{1}, After: []float64{2}})
			if r.Decision == "reject" && r.Certificate["policyAfter"] == r.Certificate["policyBefore"] {
				return true, ""
			}
			return false, "weakened-floor"
		})
	}},
	{"EV4", "a regressing change is never accepted (L-E6)", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			t1, t2 := "t1", "t2"
			P := NewPolicy([]Norm{nm("a", "obligatory", 1, &t1)}, nil, nil)
			am := enact(nm("b", "obligatory", 1, &t2), "self", 1)
			before := []float64{round2(rnd(0, 5)), round2(rnd(0, 5))}
			after := append([]float64{}, before...)
			after[ri(2)] -= 0.1 + rnd(0, 3) // force a regression on one guard
			if evolve(P, am, EvoEvidence{Before: before, After: after}).Decision != "accept" {
				return true, ""
			}
			return false, "accepted-regression"
		})
	}},
	{"EV5", "priced accept ⇒ affordable ∧ worthwhile ∧ charged (Type-II)", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			P := NewPolicy(nil, nil, nil)
			tt := "tt"
			am := enact(nm("x", "obligatory", 1, &tt), "self", 1)
			bal := float64(ri(12))
			L := NewLedger(map[string]map[string]float64{"self": {"tokens": bal}, SINK: {}},
				map[string]string{"tokens": "depletable"})
			gain := round2(rnd(0, 6))
			price := float64(ri(8))
			r := evolve(P, am, EvoEvidence{Before: []float64{0}, After: []float64{gain},
				Price: &price, Ledger: &L, Account: "self", Resource: "tokens"})
			affordable := bal >= price
			worth := gain >= price
			if r.Decision == "accept" {
				if !(affordable && worth) {
					return false, "accepted-when-not-justified"
				}
				if r.Ledger == nil || balance(*r.Ledger, "self", "tokens") != bal-price {
					return false, "wrong-charge"
				}
			} else if affordable && worth {
				return false, "rejected-when-justified"
			}
			return true, ""
		})
	}},
	{"EV6", "certificate is sound (accept ⇒ revised; reject ⇒ unchanged)", func(n int) trialResult {
		return trial(n, func() (bool, string) {
			c := "c"
			P := NewPolicy([]Norm{nm("core", "forbidden", 5, &c)}, nil, nil)
			if rand.Float64() < 0.5 {
				P = entrench(P, "core")
			}
			tg := "tg" + itoa(ri(3))
			mods := []string{"obligatory", "forbidden", "permitted"}
			moves := []Amendment{
				enact(nm("n"+itoa(ri(9)), mods[ri(3)], float64(ri(8)), &tg), "self", 1),
				amend("core", nm("core", "permitted", 0, nil), "self", 1),
				repeal("core", "self", 1),
			}
			am := moves[ri(len(moves))]
			r := evolve(P, am, EvoEvidence{Before: []float64{1, 1}, After: []float64{1 + rnd(0, 2), 1 + rnd(0, 2)}}) // non-regressing
			cert := r.Certificate
			if cert["decision"] == "accept" {
				expect := revise(P, am)
				if !expect.Accepted {
					return false, "accepted-but-revise-rejects"
				}
				if cert["policyAfter"] != policyKey(expect.Policy) {
					return false, "policy-mismatch"
				}
			} else if cert["policyAfter"] != cert["policyBefore"] {
				return false, "rejected-but-policy-changed"
			}
			if r.Record.ID == record(cert, r.Record.Prev).ID {
				return true, ""
			}
			return false, "nondeterministic-record"
		})
	}},
}
