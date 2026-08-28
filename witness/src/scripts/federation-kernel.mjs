// federation-kernel.mjs — the executable carrier for Periodic Table cell #36.
//
// This is a LIBRARY. It computes; it asserts nothing. The assertions live in
// `scripts/check-federation-invariants.mjs`, which is the gate, and every claim it
// checks is registered in `CLAIM_LEDGER.json`.
//
// WHY THIS FILE EXISTS, AND WHY IT IS NOT THE OLD WITNESS
//
// `scripts/invariant-36-witness.mjs` established that the universal form of #36 is
// false, and then sampled 240k random federations over the eq/neq language and found
// zero counterexamples to "no split cycle ⟹ fidelity". It concluded the lemma was
// probably true and that κ (cell #01) carried the obstruction.
//
// Both conclusions were wrong, and the sweep could not have discovered it:
//
//   * eq/neq is Sym(D)-invariant, and for value-symmetric languages the lemma is a
//     four-line theorem (Lemma 3 + Theorem Q1* below). The 240k trials were measuring
//     a theorem, not probing a conjecture. For a general finite language the lemma is
//     FALSE — and false already on a TREE, where there is no cycle to split.
//   * κ is defined on DIRECTED graphs (largest SCC). Constraint edges are symmetric,
//     so any orientation is arbitrary; the diamond a→b, a→c, b→d, c→d is a DAG with
//     κ = 0 and an unbalanced split 4-cycle underneath it.
//
// The counterexamples are Fable 5's (2026-08-23 review round), reproduced here as
// permanent regressions. The corrections to Fable's own proposals — plain b₁ is the
// wrong repair for κ, and C9 must be sink MONOTONICITY rather than "no refill ever" —
// are GPT-5.6's, and are argued where they are implemented.
//
// MODEL. A federation is a tuple of sites. Each site holds constraints over shared
// variables. A constraint is {rel, vars, site}; `rel` names a relation in a language
// Γ over the finite domain D = {0…|D|−1}.
//
//   FIDELITY(federation) := (every site satisfiable) ⟹ (union satisfiable)
//
// Binary constraints give a multigraph carrier; n-ary constraints give a hypergraph,
// whose cycles are read off the bipartite incidence graph (Berge cycles).

// ── languages ───────────────────────────────────────────────────────────────
// A language maps a relation name to {arity, holds(values[]) -> bool}. Explicit
// tuple sets are built with `rel()`; predicates with `pred()`.

export const rel = (arity, tuples) => {
  const set = new Set(tuples.map((t) => t.join(',')));
  return { arity, tuples, holds: (vs) => set.has(vs.join(',')) };
};
export const pred = (arity, f) => ({ arity, holds: f, tuples: null });

/** The language the original witness used, at any |D|. Sym(D)-invariant. */
export const EQ_NEQ = {
  eq: pred(2, ([a, b]) => a === b),
  neq: pred(2, ([a, b]) => a !== b),
};

/** Enumerate a predicate relation's tuples over D, so symmetry can be checked. */
export function tuplesOf(r, D) {
  if (r.tuples) return r.tuples;
  const out = [], cur = new Array(r.arity);
  const rec = (i) => {
    if (i === r.arity) { if (r.holds(cur)) out.push([...cur]); return; }
    for (let v = 0; v < D; v++) { cur[i] = v; rec(i + 1); }
  };
  rec(0);
  return out;
}

// ── satisfiability ──────────────────────────────────────────────────────────
// Plain backtracking with early checking. Instances here are tiny (≤ 8 variables,
// |D| ≤ 3); a propagator would be faster and would not change a single verdict.

export const varsOf = (cs) => [...new Set(cs.flatMap((c) => c.vars))];

export function satisfiable(cs, D, lang) {
  const vars = varsOf(cs);
  if (!vars.length) return true;
  const ix = new Map(vars.map((v, i) => [v, i]));
  // constraints become checkable as soon as their last variable is assigned
  const readyAt = vars.map(() => []);
  for (const c of cs) {
    const last = Math.max(...c.vars.map((v) => ix.get(v)));
    readyAt[last].push(c);
  }
  const asg = new Array(vars.length);
  const rec = (i) => {
    if (i === vars.length) return true;
    for (let v = 0; v < D; v++) {
      asg[i] = v;
      let ok = true;
      for (const c of readyAt[i]) {
        if (!lang[c.rel].holds(c.vars.map((x) => asg[ix.get(x)]))) { ok = false; break; }
      }
      if (ok && rec(i + 1)) return true;
    }
    return false;
  };
  return rec(0);
}

export const sitesOf = (cs) => [...new Set(cs.map((c) => c.site))];
export const bySite = (cs) => sitesOf(cs).map((s) => cs.filter((c) => c.site === s));
export const allSitesSat = (cs, D, lang) => bySite(cs).every((s) => satisfiable(s, D, lang));
export const fidelity = (cs, D, lang) => !allSitesSat(cs, D, lang) || satisfiable(cs, D, lang);

// ── block decomposition of a multigraph ─────────────────────────────────────
// Hopcroft–Tarjan with an edge stack. Blocks are the classes of the equivalence
// "e = f, or e and f lie on a common cycle" (Diestel §3.1; Whitney 1932) — which is
// exactly the relation the split-cycle question asks about, so the decomposition is
// not an approximation of the property, it IS the property.
//
// MULTIGRAPH CORRECTNESS. Recursion skips the parent EDGE ID, never "any edge back
// to the parent vertex". Two parallel edges therefore form a 2-cycle and land in one
// block, which is what the model requires: two sites constraining the same pair of
// variables are a split cycle of length 2.

/** @param edges [{u, v, ...}] with integer node ids. @returns array of blocks, each an array of edge indices. */
export function blocks(nNodes, edges) {
  const adj = Array.from({ length: nNodes }, () => []);
  edges.forEach((e, i) => { adj[e.u].push(i); adj[e.v].push(i); });
  const disc = new Array(nNodes).fill(-1), low = new Array(nNodes).fill(0);
  const out = [], stack = [];
  let timer = 0;

  for (let root = 0; root < nNodes; root++) {
    if (disc[root] !== -1) continue;
    // explicit frame stack — a 500-variable incidence graph would blow the call stack
    const frames = [{ u: root, parentEdge: -1, k: 0 }];
    disc[root] = low[root] = timer++;
    while (frames.length) {
      const f = frames[frames.length - 1];
      if (f.k < adj[f.u].length) {
        const ei = adj[f.u][f.k++];
        if (ei === f.parentEdge) continue;
        const e = edges[ei], w = e.u === f.u ? e.v : e.u;
        if (disc[w] === -1) {
          stack.push(ei);
          disc[w] = low[w] = timer++;
          frames.push({ u: w, parentEdge: ei, k: 0 });
        } else if (disc[w] < disc[f.u]) {
          stack.push(ei);
          low[f.u] = Math.min(low[f.u], disc[w]);
        }
      } else {
        frames.pop();
        if (!frames.length) break;
        const p = frames[frames.length - 1];
        low[p.u] = Math.min(low[p.u], low[f.u]);
        if (low[f.u] >= disc[p.u]) {                 // p.u is a cut vertex (or the root)
          const block = [];
          while (stack.length) {
            const top = stack[stack.length - 1];
            if (disc[edges[top].u] >= disc[f.u] || disc[edges[top].v] >= disc[f.u] || top === f.parentEdge) {
              block.push(stack.pop());
              if (top === f.parentEdge) break;
            } else break;
          }
          if (block.length) out.push(block);
        }
      }
    }
  }
  return out;
}

/** Node-id helper: map arbitrary labels to 0…n−1. */
export function indexer() {
  const m = new Map();
  return { id: (k) => (m.has(k) ? m.get(k) : (m.set(k, m.size), m.size - 1)), size: () => m.size, keys: () => [...m.keys()] };
}

// ── binary carrier: κ_split ─────────────────────────────────────────────────
//
// GPT-5.6's correction to Fable's patch B3. Fable proposed replacing κ with the
// ordinary undirected cycle rank b₁ = |E| − |V| + c. That is the wrong invariant and
// it is wrong in the direction that matters: a single site holding a triangle has
// b₁ = 1 and NO split cycle, so plain b₁ reports an obstruction where the federation
// theorem reports none. The carrier has to see the site colouring, not just topology.
//
//   κ_split(G, site) := Σ over blocks B of max(0, |sites(B)| − 1)
//
// THEOREM (zero set). κ_split = 0 ⟺ no cycle of G is split across two or more sites.
//   (⟸) A split cycle is 2-connected, hence inside one block; that block has ≥ 2 sites.
//   (⟹) A block with ≥ 2 sites has two edges from different sites, and any two edges
//        of a block lie on a common cycle — which is therefore split.
// Checked exhaustively against a brute-force all-simple-cycles enumerator in
// `check-federation-invariants.mjs` (T-KS1).
//
// The MAGNITUDE is a declared index, not a canonical one: max(0, |sites(B)| − 1)
// counts how many extra sites a block carries, and summing it is one of several
// defensible aggregations. Only the zero set is claimed. See CLAIM_LEDGER.json
// claim FED-K1 (zero set, proved) vs FED-K2 (magnitude, declared-not-canonical).

export function binaryGraph(cs) {
  const ix = indexer();
  const edges = cs.map((c) => ({ u: ix.id(c.vars[0]), v: ix.id(c.vars[1]), site: c.site }));
  return { nNodes: ix.size(), edges };
}

export function kappaSplit(cs) {
  const { nNodes, edges } = binaryGraph(cs);
  return blocks(nNodes, edges).reduce(
    (s, b) => s + Math.max(0, new Set(b.map((i) => edges[i].site)).size - 1), 0);
}
export const noSplitCycle = (cs) => kappaSplit(cs) === 0;

/** Ordinary undirected cycle rank b₁ = |E| − |V| + c. Kept so the WRONG repair stays refutable. */
export function b1(cs) {
  const { nNodes, edges } = binaryGraph(cs);
  const p = [...Array(nNodes).keys()];
  const find = (x) => (p[x] === x ? x : (p[x] = find(p[x])));
  let comps = nNodes;
  for (const e of edges) { const a = find(e.u), b = find(e.v); if (a !== b) { p[a] = b; comps--; } }
  return edges.length - nNodes + comps;
}

/** Brute-force: every simple cycle, checked for site-splitness. Ground truth for κ_split. */
export function hasSplitCycleBruteForce(cs) {
  const { nNodes, edges } = binaryGraph(cs);
  const adj = Array.from({ length: nNodes }, () => []);
  edges.forEach((e, i) => { adj[e.u].push([e.v, i]); adj[e.u === e.v ? e.u : e.v].push([e.u, i]); });
  // parallel edges: any two between the same pair from different sites form a split 2-cycle
  const seen = new Map();
  for (let i = 0; i < edges.length; i++) {
    const k = [edges[i].u, edges[i].v].sort((a, b) => a - b).join(',');
    if (!seen.has(k)) seen.set(k, []);
    seen.get(k).push(edges[i].site);
  }
  for (const sites of seen.values()) if (new Set(sites).size > 1) return true;
  // simple cycles of length ≥ 3, enumerated from each start with a smallest-vertex rule
  let found = false;
  const path = [], usedEdge = new Set();
  const dfs = (start, u) => {
    if (found) return;
    for (const [w, ei] of adj[u]) {
      if (found) return;
      if (usedEdge.has(ei) || w < start) continue;
      if (w === start && path.length >= 2) {
        if (new Set([...path, ei].map((i) => edges[i].site)).size > 1) { found = true; return; }
        continue;
      }
      if (path.some((i) => edges[i].u === w || edges[i].v === w) || w === start) continue;
      usedEdge.add(ei); path.push(ei);
      dfs(start, w);
      path.pop(); usedEdge.delete(ei);
    }
  };
  for (let s = 0; s < nNodes && !found; s++) dfs(s, s);
  return found;
}

/**
 * Every simple cycle of the carrier, as a list of constraint INDICES. Used by the
 * cycle-locality theorem, which needs to re-present a single cycle as a federation
 * in its own right. Parallel edges count as 2-cycles.
 */
export function simpleCycles(cs) {
  const { nNodes, edges } = binaryGraph(cs);
  const adj = Array.from({ length: nNodes }, () => []);
  edges.forEach((e, i) => { adj[e.u].push([e.v, i]); adj[e.v].push([e.u, i]); });
  const out = [], seen = new Set();
  const emit = (ids) => {
    const k = [...ids].sort((a, b) => a - b).join(',');
    if (!seen.has(k)) { seen.add(k); out.push([...ids]); }
  };
  // parallel pairs
  const byPair = new Map();
  edges.forEach((e, i) => {
    const k = [e.u, e.v].sort((a, b) => a - b).join(',');
    if (!byPair.has(k)) byPair.set(k, []);
    byPair.get(k).push(i);
  });
  for (const ids of byPair.values())
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) emit([ids[i], ids[j]]);
  // simple cycles of length ≥ 3, each found from its smallest vertex
  const path = [], usedE = new Set(), onPath = new Set();
  const dfs = (start, u) => {
    for (const [w, ei] of adj[u]) {
      if (usedE.has(ei) || w < start) continue;
      // the CLOSING edge belongs to the cycle. Omitting it here made the dedup key differ
      // between the two traversal directions, so every cycle was reported twice.
      if (w === start && path.length >= 2) { emit([...path, ei]); continue; }
      if (onPath.has(w) || w === start) continue;
      usedE.add(ei); path.push(ei); onPath.add(w);
      dfs(start, w);
      onPath.delete(w); path.pop(); usedE.delete(ei);
    }
  };
  for (let s = 0; s < nNodes; s++) { onPath.add(s); dfs(s, s); onPath.delete(s); }
  return out;
}

// ── n-ary carrier: Berge cycles via the incidence graph ─────────────────────
//
// A Berge cycle of a hypergraph is exactly a cycle of its bipartite incidence graph
// I(H) (Fagin 1983 — and two hyperedges sharing ≥ 2 vertices are already Berge-cyclic,
// which is precisely why database theory weakened the notion to α/β/γ). For
// LOCAL-SATISFIABILITY certificates that weakening is unaffordable: sharing two
// variables lets one site pin a relation between them that another site contradicts.
//
// κ_splitBerge = Σ over blocks of I(H) of max(0, |sites of that block's constraint-nodes| − 1).
// Zero ⟺ no split Berge cycle, by the same argument as κ_split (any two VERTICES of a
// 2-connected graph lie on a common cycle).

export function incidenceGraph(cs) {
  const ix = indexer();
  const edges = [];
  const conNode = cs.map((_, i) => ix.id(`c${i}`));
  for (const [i, c] of cs.entries()) for (const v of c.vars) edges.push({ u: conNode[i], v: ix.id(`v:${v}`), con: i });
  return { nNodes: ix.size(), edges, conNode };
}

export function kappaSplitBerge(cs) {
  const { nNodes, edges } = incidenceGraph(cs);
  return blocks(nNodes, edges).reduce((s, b) => {
    const sites = new Set(b.map((i) => cs[edges[i].con].site));
    return s + Math.max(0, sites.size - 1);
  }, 0);
}
export const noSplitBergeCycle = (cs) => kappaSplitBerge(cs) === 0;

/**
 * Super-blocks: blocks of I(H) merged across shared CONSTRAINT-nodes. This is the
 * object Theorem Q3's induction actually runs on — after merging, adjacent
 * super-blocks share exactly one VARIABLE, which is what 1-point amalgamation needs.
 * Returned as constraint-index groups.
 */
export function superBlocks(cs) {
  const { nNodes, edges } = incidenceGraph(cs);
  const bs = blocks(nNodes, edges);
  const p = [...Array(bs.length).keys()];
  const find = (x) => (p[x] === x ? x : (p[x] = find(p[x])));
  const owner = new Map();                                   // constraint index → block index
  bs.forEach((b, bi) => {
    for (const ei of b) {
      const c = edges[ei].con;
      if (owner.has(c)) { const a = find(owner.get(c)), d = find(bi); if (a !== d) p[a] = d; }
      else owner.set(c, bi);
    }
  });
  const groups = new Map();
  bs.forEach((b, bi) => {
    const k = find(bi);
    if (!groups.has(k)) groups.set(k, new Set());
    for (const ei of b) groups.get(k).add(edges[ei].con);
  });
  return [...groups.values()].map((s) => [...s]);
}

// ── α- and β-acyclicity (so the WRONG notions stay refutable) ───────────────

/** GYO reduction. α-acyclic ⟺ GYO reduces the hypergraph to nothing. */
export function alphaAcyclic(cs) {
  let edges = cs.map((c) => new Set(c.vars));
  let changed = true;
  while (changed) {
    changed = false;
    // 1 · ear removal — delete vertices that occur in exactly one hyperedge
    const count = new Map();
    for (const e of edges) for (const v of e) count.set(v, (count.get(v) || 0) + 1);
    for (const e of edges) for (const v of [...e]) if (count.get(v) === 1) { e.delete(v); changed = true; }
    // 2 · drop empty edges, and edges contained in another (ties broken by index so
    //     two equal edges lose exactly one of themselves, not both)
    const keep = [];
    for (let i = 0; i < edges.length; i++) {
      if (edges[i].size === 0) { changed = true; continue; }
      let swallowed = false;
      for (let j = 0; j < edges.length && !swallowed; j++) {
        if (i === j || edges[j].size === 0) continue;
        if (![...edges[i]].every((v) => edges[j].has(v))) continue;
        if (edges[i].size < edges[j].size || (edges[i].size === edges[j].size && j < i)) swallowed = true;
      }
      if (swallowed) { changed = true; continue; }
      keep.push(edges[i]);
    }
    edges = keep;
  }
  return edges.length === 0;
}

/** β-acyclic ⟺ EVERY sub-hypergraph is α-acyclic. Exponential; only used on tiny examples. */
export function betaAcyclic(cs) {
  const n = cs.length;
  for (let mask = 1; mask < (1 << n); mask++) {
    const sub = cs.filter((_, i) => mask & (1 << i));
    if (!alphaAcyclic(sub)) return false;
  }
  return true;
}

// ── 1-point amalgamation ────────────────────────────────────────────────────
//
// DEFINITION. Γ has 1PA iff for every pair of satisfiable Γ-instances sharing exactly
// one variable, their union is satisfiable. Equivalently, the family
//   P(Γ) = { π_x(sol I) : I a satisfiable Γ-instance, x ∈ vars(I) }
// of non-empty subsets of D is PAIRWISE INTERSECTING.
//
// WHAT IS AND IS NOT DECIDED HERE. Two conclusive procedures, and an honest gap
// between them:
//
//   symmetryCertificate  — if a transitive subgroup of Sym(D) preserves every relation
//                          of Γ, then Γ has 1PA (Lemma 3). This is a PROOF of 1PA.
//   find1PAViolation     — searches bounded instances for two satisfiable instances
//                          meeting in one variable with disjoint projections at it.
//                          A hit is a PROOF of ¬1PA (it exhibits the witness).
//
// A miss from `find1PAViolation` at bound k is NOT a proof of 1PA, and this is not a theoretical
// caution: successor-on-a-6-path FAILS 1PA and misses at the default bounds, because the witness
// needs three auxiliary variables. Do not report "1PA holds" on the strength of one.
//
// AS OF ROUND 3 THE DECISION EXISTS — `decide1PA` at the bottom of this file. Γ has 1PA iff the
// core of (D; Γ) is automorphism-transitive; that is conclusive in both directions and yields the
// refuting federation when it fails. The two functions above keep their jobs: `symmetryCertificate`
// is a cheap sufficient proof, `find1PAViolation` a cheap falsifier. Neither decides, and the
// exponential procedure is not always affordable, so all three stay.

/** Lemma 3: a transitive group preserving every relation of Γ certifies 1PA. */
export function symmetryCertificate(lang, D) {
  const perms = [];
  const gen = (cur, left) => {
    if (!left.length) { perms.push([...cur]); return; }
    for (let i = 0; i < left.length; i++) gen([...cur, left[i]], left.filter((_, j) => j !== i));
  };
  gen([], [...Array(D).keys()]);
  const preserving = perms.filter((h) =>
    Object.values(lang).every((r) => {
      const ts = tuplesOf(r, D), set = new Set(ts.map((t) => t.join(',')));
      return ts.every((t) => set.has(t.map((a) => h[a]).join(',')));
    }));
  // transitive? some preserving permutation must move 0 to each value
  const reach = new Set(preserving.map((h) => h[0]));
  const transitive = reach.size === D;
  return { transitive, preserving: preserving.length, certifies1PA: transitive };
}

/**
 * The unary projection family U_Γ = { π_x(sol I) : I a satisfiable Γ-instance }, enumerated
 * over instances with at most `maxCon` constraints and `maxAux` auxiliary variables.
 * Returns a Map from a sorted "0,1,2" key to a sample instance realizing that projection.
 *
 * BOUNDED. This is a subfamily of the true U_Γ, which is the set of non-empty pp-definable
 * unary relations. Enough to exhibit a violation; never enough to certify its absence.
 */
export function unaryProjectionFamily(lang, D, { maxCon = 3, maxAux = 2 } = {}) {
  const names = Object.keys(lang);
  const slots = ['x', ...[...Array(maxAux).keys()].map((i) => `a${i}`)];
  const instances = [];
  const build = (acc, depth) => {
    if (acc.length) instances.push([...acc]);
    if (depth === maxCon) return;
    for (const n of names) {
      const ar = lang[n].arity;
      const pick = (cur) => {
        if (cur.length === ar) { build([...acc, { rel: n, vars: [...cur], site: 0 }], depth + 1); return; }
        for (const s of slots) pick([...cur, s]);
      };
      pick([]);
    }
  };
  build([], 0);

  const fam = new Map();
  for (const inst of instances) {
    if (!inst.some((c) => c.vars.includes('x'))) continue;
    if (!satisfiable(inst, D, lang)) continue;
    const proj = [];
    for (let v = 0; v < D; v++) {
      const withPin = { ...lang, __pin: pred(1, ([a]) => a === v) };
      if (satisfiable([...inst, { rel: '__pin', vars: ['x'], site: 0 }], D, withPin)) proj.push(v);
    }
    const key = proj.join(',');
    if (proj.length && !fam.has(key)) fam.set(key, inst);
  }
  return fam;
}

/**
 * LEMMA (common intersection). Γ has 1PA ⟺ ⋂ U_Γ ≠ ∅ — some single domain value belongs to
 * EVERY non-empty unary pp-definable projection.
 *
 *   (⟸) trivial: a common element makes every pair intersect.
 *   (⟹) under 1PA, U_Γ is closed under intersection: given U, V realized by I₁, I₂, rename
 *        their auxiliary variables apart and identify only x; the union is satisfiable (1PA)
 *        and its projection at x is exactly U ∩ V. D is finite, so U_Γ is finite, so ⋂ U_Γ is
 *        a finite intersection of members and is therefore itself a member — hence non-empty.
 *
 * NOT A PRIOR-ART KEY, on round-3 review. The closure step needs no hypothesis on Γ at all — it is
 * a fact about pp-definable relations — so the "Helly property" here is a triviality of pp-closure
 * rather than a property of the language, and searching for it finds nothing. The form is still a
 * true and useful corollary of the transitive-core theorem; it is just not the thing to look up.
 *
 * Returns { pairwiseIntersecting, commonElements, closedUnderIntersection, family, bounded: true }.
 * All computed over the BOUNDED family, so this corroborates the lemma rather than deciding 1PA —
 * `decide1PA` is the decision. The `bounded` flag is there so a caller cannot read the result as one.
 */
export function commonIntersection(lang, D, bounds = {}) {
  const fam = unaryProjectionFamily(lang, D, bounds);
  const sets = [...fam.keys()].map((k) => new Set(k.split(',').map(Number)));
  let pairwise = true;
  for (let i = 0; i < sets.length; i++)
    for (let j = i + 1; j < sets.length; j++)
      if (![...sets[i]].some((v) => sets[j].has(v))) pairwise = false;
  const common = [...Array(D).keys()].filter((v) => sets.every((S) => S.has(v)));
  // closure under intersection, over the bounded family: every non-empty pairwise intersection
  // should itself appear as a realized projection
  let closed = true;
  for (let i = 0; i < sets.length; i++)
    for (let j = 0; j < sets.length; j++) {
      const inter = [...sets[i]].filter((v) => sets[j].has(v));
      if (inter.length && !fam.has(inter.sort((a, b) => a - b).join(','))) closed = false;
    }
  return { pairwiseIntersecting: pairwise, commonElements: common, closedUnderIntersection: closed, family: [...fam.keys()], bounded: true };
}

/**
 * Search for two satisfiable instances sharing exactly one variable whose union is
 * unsatisfiable. Returns the witness federation (as a 2-site constraint list) or null.
 * A hit is conclusive; a miss is bounded evidence only.
 *
 * NOTE — the failure condition is TWO DISJOINT projections, not "the language can pin a value".
 * A language whose only pin is x = 0 over D = {0,1} realizes {0} and {0,1}, which intersect, so
 * it HAS 1PA. Round 2 asserted that any value-pinning relation destroys 1PA; that was false and
 * it mattered, because it is the sentence the practical FGAP question was built on.
 */
export function find1PAViolation(lang, D, { maxCon = 3, maxAux = 2 } = {}) {
  const names = Object.keys(lang);
  const projections = new Map();                             // "set" → sample instance
  const auxNames = [...Array(maxAux).keys()].map((i) => `a${i}`);
  const slots = ['x', ...auxNames];

  const instances = [];
  const build = (acc, depth) => {
    if (acc.length) instances.push([...acc]);
    if (depth === maxCon) return;
    for (const n of names) {
      const ar = lang[n].arity;
      const pick = (cur) => {
        if (cur.length === ar) { build([...acc, { rel: n, vars: [...cur], site: 0 }], depth + 1); return; }
        for (const s of slots) pick([...cur, s]);
      };
      pick([]);
    }
  };
  build([], 0);

  for (const inst of instances) {
    if (!inst.some((c) => c.vars.includes('x'))) continue;
    if (!satisfiable(inst, D, lang)) continue;
    // projection of the solution set at x
    const proj = new Set();
    for (let v = 0; v < D; v++) {
      const pinned = [...inst, { rel: '__pin', vars: ['x'], site: 0 }];
      const withPin = { ...lang, __pin: pred(1, ([a]) => a === v) };
      if (satisfiable(pinned, D, withPin)) proj.add(v);
    }
    const key = [...proj].sort().join(',');
    if (!projections.has(key)) projections.set(key, inst);
  }

  const keys = [...projections.keys()];
  for (let i = 0; i < keys.length; i++) {
    for (let j = i; j < keys.length; j++) {
      const A = new Set(keys[i].split(',').map(Number)), B = new Set(keys[j].split(',').map(Number));
      if ([...A].some((v) => B.has(v))) continue;
      // disjoint projections at x → the two instances amalgamate to an unsatisfiable union
      const I1 = projections.get(keys[i]).map((c) => ({ ...c, site: 0, vars: c.vars.map((v) => (v === 'x' ? 'x' : `L${v}`)) }));
      const I2 = projections.get(keys[j]).map((c) => ({ ...c, site: 1, vars: c.vars.map((v) => (v === 'x' ? 'x' : `R${v}`)) }));
      return { federation: [...I1, ...I2], projA: [...A], projB: [...B] };
    }
  }
  return null;
}

// ── THE EXACT DECISION: Γ has 1PA ⟺ the core of (D; Γ) is automorphism-transitive ───────────
//
// Round 3 (Fable 5, audited by GPT-5.6). The bounded search above is a falsifier; this is the
// decision. For finite A = (D; Γ) with core B:
//
//     Γ has 1PA   ⟺   Aut(B) acts transitively on B          and then  ⋂U_Γ = End(A)·b, b ∈ B.
//
// The ingredients are standard finite-CSP algebra — every finite structure has a core
// (Hell–Nešetřil 1992); endomorphisms preserve pp-definable relations; orbits of a finite core are
// pp-definable by the canonical conjunctive query (Bodirsky 2007). NOVELTY OF THE EQUIVALENCE IS
// NOT CLAIMED: it is derived here from those facts, and an exact prior-art search has not been
// done. Say "the constraint template has a transitive core", not a minted noun.
//
// This retires two things. "1-point amalgamation" was a working name that collides with the
// Fraïssé notion, and the common-intersection ("Helly") form turns out to be a triviality about
// closure of pp-definable relations under intersection rather than a property of Γ — so it is a
// corollary, not a search key. It also demotes the bounded search for good: `find1PAViolation`
// MISSES on successor-over-a-6-path at its default bounds, where 1PA genuinely fails.

const allMaps = (D) => {
  const out = [], cur = [];
  const rec = () => { if (cur.length === D) { out.push([...cur]); return; } for (let v = 0; v < D; v++) { cur.push(v); rec(); cur.pop(); } };
  rec(); return out;
};

/** h : D → D preserves every relation of Γ — a unary polymorphism, i.e. an endomorphism of A. */
export function preservesAll(h, lang, D) {
  return Object.values(lang).every((r) => {
    const ts = tuplesOf(r, D), set = new Set(ts.map((t) => t.join(',')));
    return ts.every((t) => set.has(t.map((a) => h[a]).join(',')));
  });
}

/** End(A). O(|D|^|D|) maps, each checked against every tuple — the guard is not decoration. */
export function endomorphisms(lang, D, { maxMaps = 400000 } = {}) {
  if (D ** D > maxMaps) throw new RangeError(`endomorphisms: |D|^|D| = ${D ** D} exceeds maxMaps ${maxMaps}. This procedure is exponential; raise the bound deliberately or use find1PAViolation as a falsifier.`);
  return allMaps(D).filter((h) => preservesAll(h, lang, D));
}

/**
 * A core of A, together with a retraction onto it that IS one.
 *
 * NOT BY REPEATED SQUARING. The obvious "iterate f until it stops changing" does not terminate at
 * an idempotent: a permutation of order 3 cycles forever under f^(2^k) and never reaches the
 * identity. Fable's witness did exactly that and still decided correctly — because the IMAGE of a
 * minimum-image endomorphism is a core regardless — but the map it returned under the name
 * `retraction` was not a retraction. GPT-5.6 caught it; this is the construction that works.
 *
 *   f minimum-image ⟹ |f(f(D))| = |f(D)| by minimality ⟹ f(B) = B, so p := f|B is a bijection
 *   of B. B is finite, so p has finite order k and p⁻¹ = p^(k−1) preserves every relation too:
 *   p ∈ Aut(B). Then r := p⁻¹ ∘ f is an endomorphism of A, r|B = id, and r∘r = r.
 */
export function coreRetraction(lang, D, End = endomorphisms(lang, D)) {
  const f = End.reduce((best, h) => (new Set(h).size < new Set(best).size ? h : best), End[0]);
  const core = [...new Set(f)].sort((a, b) => a - b);
  const pInv = new Array(D).fill(-1);
  for (const b of core) pInv[f[b]] = b;                       // f(B) = B makes this total on B
  return { retraction: f.map((v) => pInv[v]), core, minImage: f };
}

/**
 * Aut(B) for the substructure induced on the core, enumerated over PERMUTATIONS OF B — |B|!, not
 * |D|^|D|. On a finite structure a relation-preserving bijection is an automorphism: it maps the
 * finite set R ∩ B^k injectively into itself, hence onto it, so the inverse preserves as well.
 * Returned as Maps b ↦ σ(b).
 */
export function coreAutomorphisms(lang, D, core) {
  const perms = [];
  const gen = (cur, left) => { if (!left.length) { perms.push([...cur]); return; } for (let i = 0; i < left.length; i++) gen([...cur, left[i]], left.filter((_, j) => j !== i)); };
  gen([], core);
  const inCore = new Set(core);
  return perms.map((p) => new Map(core.map((b, i) => [b, p[i]]))).filter((σ) =>
    Object.values(lang).every((r) => {
      const ts = tuplesOf(r, D), set = new Set(ts.map((t) => t.join(',')));
      return ts.filter((t) => t.every((a) => inCore.has(a)))
        .every((t) => set.has(t.map((a) => σ.get(a)).join(',')));
    }));
}

/**
 * The decision. Conclusive in BOTH directions, unlike `find1PAViolation`.
 * `hull` is ⋂U_Γ = End(A)·b when the property holds, and [] when it does not (⋂U_Γ is then empty).
 */
export function decide1PA(lang, D, opts = {}) {
  const End = endomorphisms(lang, D, opts);
  const { retraction, core, minImage } = coreRetraction(lang, D, End);
  const aut = coreAutomorphisms(lang, D, core);
  const orbits = [], seen = new Set();
  for (const b of core) {
    if (seen.has(b)) continue;
    const o = [...new Set(aut.map((σ) => σ.get(b)))].sort((x, y) => x - y);
    o.forEach((x) => seen.add(x));
    orbits.push(o);
  }
  const holds = orbits.length === 1;
  return {
    holds, core, coreOrbits: orbits,
    hull: holds ? [...new Set(End.map((h) => h[core[0]]))].sort((a, b) => a - b) : [],
    endCount: End.length, autCount: aut.length, retraction, minImage,
  };
}

/**
 * The canonical conjunctive query of A with its free variable at element b: one variable per
 * domain element, every tuple of every relation as an atom. Its solution set at the free variable
 * is exactly End(A)·b, which is what makes two of them at inequivalent orbit representatives
 * pp-define disjoint unary relations.
 */
export function canonicalQuery(lang, D, b, site, prefix) {
  const cs = [];
  for (const [name, r] of Object.entries(lang))
    for (const t of tuplesOf(r, D)) cs.push({ rel: name, vars: t.map((a) => (a === b ? 'x' : `${prefix}${a}`)), site });
  return cs;
}

/**
 * When the core is not transitive, BUILD the refutation: two canonical queries at representatives
 * of two distinct orbits, auxiliaries renamed apart, glued at the free variable. Both sites are
 * satisfiable, they meet at a single cut variable (so κ_splitBerge = 0), and the union has no model.
 * Returns null when 1PA holds.
 */
export function refute1PA(lang, D, opts = {}) {
  const d = decide1PA(lang, D, opts);
  if (d.holds) return null;
  const [o1, o2] = d.coreOrbits;
  return { federation: [...canonicalQuery(lang, D, o1[0], 0, 'L'), ...canonicalQuery(lang, D, o2[0], 1, 'R')], b: o1[0], b2: o2[0], decision: d };
}

// ── THE OTHER ROUTE: exact separator projections, with NO language hypothesis ────────────────
//
// Under no split Berge cycle the super-blocks hang off single cut variables in a tree, so a
// leaf-to-root pass carrying, per (super-block, separator variable), the SUBSET of D that the
// subtree admits there decides satisfiability outright. This is Yannakakis' 1981 semijoin full
// reducer / Dechter–Pearl 1989 tree clustering specialised to singleton separators — KNOWN, not
// new — and it matters because it needs nothing from Γ. Where a value sort cannot have a
// transitive core (two literals is enough to break it), this is the route that still works.
//
// TWO THINGS IT IS NOT.
//   Not "the smallest" summary — exactness is proved, an information-theoretic lower bound is not,
//   and for a large or infinite sort the ≤|D|-bits figure does not transfer at all.
//   Not "efficient" — the federation carrier becomes a tree, but each super-block still has a local
//   CSP to project, which for unrestricted Γ is NP-hard. Removing the GLOBAL cyclic interaction is
//   not the same as making the problem cheap.
// And membership witnesses do NOT make it trustless: one satisfying assignment per admitted value
// proves M ⊆ true projection, and nothing proves true projection ⊆ M. An incomplete or hostile site
// can omit feasible values and manufacture a false UNSAT. See claim FED-SEP-CERT (OPEN).
export function separatorProtocol(cs, D, lang) {
  if (!cs.length) return { sat: true, messages: [] };
  const sb = superBlocks(cs);
  const varsIn = (g) => new Set(g.flatMap((i) => cs[i].vars));
  const blocksAt = new Map();
  sb.forEach((g, i) => { for (const v of varsIn(g)) { if (!blocksAt.has(v)) blocksAt.set(v, []); blocksAt.get(v).push(i); } });
  const seen = new Array(sb.length).fill(false), messages = [];
  const solve = (i, sepVar) => {
    seen[i] = true;
    const extra = [], L = { ...lang };
    for (const w of varsIn(sb[i])) {
      if (w === sepVar) continue;
      for (const j of blocksAt.get(w)) if (!seen[j]) {
        const mj = solve(j, w);
        messages.push({ from: j, to: i, at: w, set: [...mj].sort((a, b) => a - b) });
        const name = `__in_${j}_${w}`;
        L[name] = pred(1, ([a]) => mj.has(a));
        extra.push({ rel: name, vars: [w], site: -1 });
      }
    }
    const inst = [...sb[i].map((k) => cs[k]), ...extra];
    if (sepVar === undefined) return satisfiable(inst, D, L);
    const out = new Set();
    for (let v = 0; v < D; v++)
      if (satisfiable([...inst, { rel: '__pinσ', vars: [sepVar], site: -1 }], D, { ...L, __pinσ: pred(1, ([a]) => a === v) })) out.add(v);
    return out;
  };
  let sat = true;
  for (let i = 0; i < sb.length; i++) if (!seen[i]) sat = sat && solve(i, undefined);
  return { sat, messages };
}

// ── the matroid form of the κ_split zero set ────────────────────────────────────────────────
//
// The cycle matroid of the incidence graph unifies the binary and n-ary carriers: its connected
// components are the block edge sets ("lie on a common circuit", Oxley §4.1), a separator is a
// union of components (§4.2), and a partition into separators IS a direct-sum decomposition. So
//
//   κ_split = 0  ⟺  the site colouring is constant on every matroid component
//                ⟺  every site's incidence-edge set is a separator of M(I(H))
//                ⟺  M(I(H)) = ⊕_s M(I(H))|E_s
//
// For binary constraints I(H) is the subdivision of the constraint multigraph, which is why one
// carrier now suffices and the two-carrier machinery can retire.
//
// ONLY THE ZERO SET IS CANONICAL. Five natural magnitudes are computed below and they disagree;
// that shows the theorem does not determine a magnitude, and it does NOT prove no canonical
// magnitude exists — "canonical" is not formalised here. They stay DECLARED indices (FED-K2).
export function matroidSiteDecomposition(cs, { carrier = 'incidence' } = {}) {
  const g = carrier === 'binary' ? binaryGraph(cs) : incidenceGraph(cs);
  const siteOf = carrier === 'binary' ? (ei) => cs[ei].site : (ei) => cs[g.edges[ei].con].site;
  const components = blocks(g.nNodes, g.edges);                 // = matroid components (loopless)
  const impure = components.filter((B) => new Set(B.map(siteOf)).size > 1);
  const compOf = new Map(); components.forEach((B, bi) => B.forEach((e) => compOf.set(e, bi)));
  const sites = [...new Set(g.edges.map((_, i) => siteOf(i)))];
  const everySiteIsSeparator = sites.every((s) => {
    const mine = g.edges.map((_, i) => i).filter((i) => siteOf(i) === s);
    return [...new Set(mine.map((e) => compOf.get(e)))].every((bi) => components[bi].every((e) => siteOf(e) === s));
  });
  return {
    components, impure, everySiteIsSeparator,
    constantOnComponents: impure.length === 0,
    directSum: impure.length === 0,
    // DECLARED indices — five different distances from the zero set, not five estimates of one thing
    magnitudes: {
      m1_impureComponents: impure.length,
      m2_extraSites: components.reduce((s, B) => s + Math.max(0, new Set(B.map(siteOf)).size - 1), 0),
      m3_minRecolour: components.reduce((s, B) => {
        const cnt = new Map(); B.forEach((e) => cnt.set(siteOf(e), (cnt.get(siteOf(e)) || 0) + 1));
        return s + B.length - Math.max(...cnt.values());
      }, 0),
      m5_minSiteMerges: (() => {
        const par = new Map(sites.map((s) => [s, s]));
        const find = (x) => (par.get(x) === x ? x : (par.set(x, find(par.get(x))), par.get(x)));
        for (const B of components) { const ss = [...new Set(B.map(siteOf))]; for (let i = 1; i < ss.length; i++) { const a = find(ss[0]), b = find(ss[i]); if (a !== b) par.set(a, b); } }
        return sites.length - new Set(sites.map(find)).size;
      })(),
    },
  };
}

/** m4 — minimum carrier-edge deletions after which every component is monochromatic. Brute force. */
export function minPurifyingDeletions(cs, { carrier = 'incidence', maxElems = 14 } = {}) {
  const g = carrier === 'binary' ? binaryGraph(cs) : incidenceGraph(cs);
  const siteOf = carrier === 'binary' ? (ei) => cs[ei].site : (ei) => cs[g.edges[ei].con].site;
  const n = g.edges.length;
  if (n > maxElems) return null;                                // exponential; refuse rather than hang
  let best = Infinity;
  for (let mask = 0; mask < (1 << n); mask++) {
    const del = new Set(); for (let i = 0; i < n; i++) if (mask & (1 << i)) del.add(i);
    if (del.size >= best) continue;
    const keep = g.edges.map((e, i) => [e, i]).filter(([, i]) => !del.has(i));
    const comps = blocks(g.nNodes, keep.map(([e]) => e));
    if (comps.every((B) => new Set(B.map((j) => siteOf(keep[j][1]))).size <= 1)) best = del.size;
  }
  return best;
}

// ── carriers for the locality theorems ──────────────────────────────────────────────────────

/** K_{n} of all-≠, one site per edge: every site satisfiable, χ(K_n) = n. */
export const completeDisequality = (n, relName = 'neq') => {
  const cs = []; let s = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) cs.push({ rel: relName, vars: [`v${i}`, `v${j}`], site: s++ });
  return cs;
};

/** The Grötzsch graph: 11 vertices, 20 edges, triangle-free (girth 4), χ = 4. */
export const GROTZSCH_EDGES = [
  [0, 1], [0, 2], [0, 3], [0, 4], [0, 5],
  [1, 7], [1, 10], [2, 6], [2, 8], [3, 7], [3, 9], [4, 8], [4, 10], [5, 6], [5, 9],
  [6, 7], [7, 8], [8, 9], [9, 10], [10, 6],
];
export const grotzschDisequality = (relName = 'neq') =>
  GROTZSCH_EDGES.map(([a, b], i) => ({ rel: relName, vars: [`v${a}`, `v${b}`], site: i }));

/** Chromatic test by brute force: is the all-≠ federation k-colourable? */
export const kColourable = (cs, k, lang = EQ_NEQ) => satisfiable(cs, k, lang);

export default {
  rel, pred, EQ_NEQ, tuplesOf, varsOf, satisfiable, sitesOf, bySite, allSitesSat, fidelity,
  blocks, indexer, binaryGraph, kappaSplit, noSplitCycle, b1, hasSplitCycleBruteForce, simpleCycles,
  incidenceGraph, kappaSplitBerge, noSplitBergeCycle, superBlocks, alphaAcyclic, betaAcyclic,
  symmetryCertificate, find1PAViolation, unaryProjectionFamily, commonIntersection,
  preservesAll, endomorphisms, coreRetraction, coreAutomorphisms, decide1PA, canonicalQuery, refute1PA,
  separatorProtocol, matroidSiteDecomposition, minPurifyingDeletions,
  completeDisequality, GROTZSCH_EDGES, grotzschDisequality, kColourable,
};
