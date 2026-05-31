package main

// bridge.go — floor-then-gradient bridge (port of bridge.mjs). Laws B1–B3.
// consume() gates each option; a vetoed option gets score 0̲ (annihilates ⊗); select()
// ranks only feasible survivors. No utility can resurrect a vetoed option.

import "sort"

// Option couples a full invariant Value with a heuristic utility.
type Option struct {
	ID         string
	Value      Value
	Utility    float64
	HasUtility bool
	Ctx        map[string]interface{} // used by govern
}

func (o Option) util(s Semiring) float64 {
	if o.HasUtility {
		return o.Utility
	}
	return s.One
}

// GatedScore is the result of gatedScore.
type GatedScore struct {
	Score   float64
	Verdict Verdict
}

func gatedScore(o Option, req Requirements, semiringName string) GatedScore {
	s := semiring(semiringName)
	verdict := consume(o.Value, req)
	if verdict.Ok {
		return GatedScore{Score: o.util(s), Verdict: verdict}
	}
	return GatedScore{Score: s.Zero, Verdict: verdict}
}

type evalRow struct {
	id       string
	raw      float64
	score    float64
	ok       bool
	failures []Failure
}

// RankItem is a feasible ranked item.
type RankItem struct {
	ID    string
	Score float64
}

// SelectResult is the output of select.
type SelectResult struct {
	Decision string
	HasDec   bool
	Margin   *float64
	Semiring string
	Ranking  []RankItem
	Vetoed   []evalRow
}

func selectOptions(options []Option, req Requirements, semiringName string) SelectResult {
	s := semiring(semiringName)
	evaluated := make([]evalRow, 0, len(options))
	for _, o := range options {
		g := gatedScore(o, req, semiringName)
		evaluated = append(evaluated, evalRow{
			id: o.ID, raw: o.util(s), score: g.Score, ok: g.Verdict.Ok, failures: g.Verdict.Failures,
		})
	}
	feasible := []evalRow{}
	vetoed := []evalRow{}
	for _, e := range evaluated {
		if e.ok {
			feasible = append(feasible, e)
		} else {
			vetoed = append(vetoed, e)
		}
	}
	sort.SliceStable(feasible, func(i, j int) bool { return feasible[i].score > feasible[j].score })

	res := SelectResult{Semiring: semiringName, Vetoed: vetoed}
	if len(feasible) > 0 {
		res.Decision = feasible[0].id
		res.HasDec = true
	}
	if len(feasible) > 1 {
		m := round3(feasible[0].score - feasible[1].score)
		res.Margin = &m
	}
	for _, e := range feasible {
		res.Ranking = append(res.Ranking, RankItem{ID: e.id, Score: finDisplay(e.score)})
	}
	return res
}

func finDisplay(x float64) float64 {
	if x == Semirings["tropical"].Zero {
		return 0
	}
	return round3(x)
}
