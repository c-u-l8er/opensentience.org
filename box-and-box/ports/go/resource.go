package main

// resource.go — Resource Arithmetic / linear-logic ledger (port of resource.mjs).
// Laws C1–C8, CB1–CB3. Closed double-entry system ⇒ conservation holds structurally.

const (
	SINK     = "#sink"
	TREASURY = "#treasury"
	FREE     = "free"
)

// Ledger : per-account balances + per-resource kind metadata.
type Ledger struct {
	Bal  map[string]map[string]float64
	Kind map[string]string
}

// NewLedger builds a Ledger.
func NewLedger(bal map[string]map[string]float64, kind map[string]string) Ledger {
	if bal == nil {
		bal = map[string]map[string]float64{}
	}
	if kind == nil {
		kind = map[string]string{}
	}
	return Ledger{Bal: bal, Kind: kind}
}

func cloneLedger(L Ledger) Ledger {
	bal := map[string]map[string]float64{}
	for a, r := range L.Bal {
		nr := map[string]float64{}
		for k, v := range r {
			nr[k] = v
		}
		bal[a] = nr
	}
	kind := map[string]string{}
	for k, v := range L.Kind {
		kind[k] = v
	}
	return Ledger{Bal: bal, Kind: kind}
}

func balance(L Ledger, acct, res string) float64 {
	if r, ok := L.Bal[acct]; ok {
		return r[res]
	}
	return 0
}

func total(L Ledger, res string) float64 {
	s := 0.0
	for _, r := range L.Bal {
		s += r[res]
	}
	return s
}

// transfer : move amt of res between two accounts. Conserves the grand total.
// Returns (ledger, ok). ok==false mirrors the JS INFEASIBLE sentinel.
func transfer(L Ledger, res, from, to string, amt float64) (Ledger, bool) {
	if amt < 0 || balance(L, from, res) < amt {
		return Ledger{}, false // INFEASIBLE — no overdraft
	}
	M := cloneLedger(L)
	if M.Bal[from] == nil {
		M.Bal[from] = map[string]float64{}
	}
	if M.Bal[to] == nil {
		M.Bal[to] = map[string]float64{}
	}
	M.Bal[from][res] = M.Bal[from][res] - amt
	M.Bal[to][res] = M.Bal[to][res] + amt
	return M, true
}

func spend(L Ledger, acct, res string, amt float64) (Ledger, bool) {
	return transfer(L, res, acct, SINK, amt)
}
func refill(L Ledger, acct, res string, amt float64) (Ledger, bool) {
	return transfer(L, res, TREASURY, acct, amt)
}

func affords(L Ledger, acct string, cost map[string]float64) bool {
	for res, amt := range cost {
		if balance(L, acct, res) < amt {
			return false
		}
	}
	return true
}

func feasible(L Ledger, acct string, cost map[string]float64) bool {
	return affords(L, acct, cost)
}

// UseResult is the result of use.
type UseResult struct {
	Ok bool
	L  Ledger
}

// use : depletes a depletable resource, but never a reusable one.
func use(L Ledger, acct, res string) UseResult {
	if balance(L, acct, res) < 1 {
		return UseResult{Ok: false, L: L}
	}
	if L.Kind[res] == "reusable" {
		return UseResult{Ok: true, L: L}
	}
	M, _ := spend(L, acct, res, 1)
	return UseResult{Ok: true, L: M}
}

// allocate : free → committed capacity. Returns (ledger, ok).
func allocate(L Ledger, task string, amt float64) (Ledger, bool) {
	return transfer(L, "capacity", FREE, "task:"+task, amt)
}

// consolidate : mint reusable knowledge.
func consolidate(L Ledger, task, mind string) Ledger {
	if mind == "" {
		mind = "mind"
	}
	M := cloneLedger(L)
	M.Kind["know:"+task] = "reusable"
	if M.Bal[mind] == nil {
		M.Bal[mind] = map[string]float64{}
	}
	M.Bal[mind]["know:"+task] = 1
	return M
}

// forget : reclaim capacity — only by releasing the knowledge.
func forget(L Ledger, task, mind string) Ledger {
	if mind == "" {
		mind = "mind"
	}
	amt := balance(L, "task:"+task, "capacity")
	M, ok := transfer(L, "capacity", "task:"+task, FREE, amt)
	if !ok {
		M = cloneLedger(L)
	}
	if M.Bal[mind] != nil {
		M.Bal[mind]["know:"+task] = 0
	}
	return M
}

func worthwhile(value, cost float64) bool { return value >= cost }

// RepairResult is the result of repair.
type RepairResult struct {
	Decision string // "cannot-afford" | "skip" | "invoke"
	L        Ledger
}

// repair : Type-II rationality — invoke a repair only if affordable AND worth it.
func repair(L Ledger, acct, resource string, value, cost float64) RepairResult {
	if resource == "" {
		resource = "tokens"
	}
	if !affords(L, acct, map[string]float64{resource: cost}) {
		return RepairResult{Decision: "cannot-afford", L: L}
	}
	if !worthwhile(value, cost) {
		return RepairResult{Decision: "skip", L: L}
	}
	M, _ := spend(L, acct, resource, cost)
	return RepairResult{Decision: "invoke", L: M}
}
