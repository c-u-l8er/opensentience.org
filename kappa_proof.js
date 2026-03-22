/**
 * κ Reference Implementation — Browser-Runnable Proof Verification
 *
 * Ported from kappa_reference.py. Runs the exhaustive proof:
 *   - 1,052,740 directed graphs (n=2..5): κ(G) > 0 ⟺ β₁(G) > 0 ⟺ has nontrivial SCC
 *   - 873,611 finite dynamical systems (n=2..7): κ(f) > 0 ⟺ f has periodic orbit (period > 1)
 *   - Total: 1,926,351 objects, zero counterexamples
 *
 * Uses chunked setTimeout to avoid blocking the UI thread.
 */

// ═══════════════════════════════════════════════════════════════
// PART 1: TARJAN'S SCC (adjacency matrix)
// ═══════════════════════════════════════════════════════════════

function tarjanSCC(adj, n) {
  let indexCounter = 0;
  const stack = [];
  const lowlink = new Int32Array(n);
  const index = new Int32Array(n);
  const onStack = new Uint8Array(n);
  const initialized = new Uint8Array(n);
  const result = [];

  function strongconnect(v) {
    index[v] = indexCounter;
    lowlink[v] = indexCounter;
    indexCounter++;
    initialized[v] = 1;
    stack.push(v);
    onStack[v] = 1;

    for (let w = 0; w < n; w++) {
      if (adj[v * n + w]) {
        if (!initialized[w]) {
          strongconnect(w);
          if (lowlink[w] < lowlink[v]) lowlink[v] = lowlink[w];
        } else if (onStack[w]) {
          if (index[w] < lowlink[v]) lowlink[v] = index[w];
        }
      }
    }

    if (lowlink[v] === index[v]) {
      const component = [];
      while (true) {
        const w = stack.pop();
        onStack[w] = 0;
        component.push(w);
        if (w === v) break;
      }
      result.push(component);
    }
  }

  for (let v = 0; v < n; v++) {
    if (!initialized[v]) strongconnect(v);
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════
// PART 2: κ COMPUTATION
// ═══════════════════════════════════════════════════════════════

function computeKappa(adj, n, sccNodes) {
  const size = sccNodes.length;
  if (size <= 1) return 0;

  let minKappa = Infinity;

  for (let mask = 1, limit = (1 << size) - 1; mask < limit; mask++) {
    // Build A and B from mask
    let ab = 0, ba = 0;
    for (let i = 0; i < size; i++) {
      const inA_i = (mask >> i) & 1;
      const nodeI = sccNodes[i];
      for (let j = 0; j < size; j++) {
        if (i === j) continue;
        const inA_j = (mask >> j) & 1;
        if (inA_i && !inA_j && adj[nodeI * n + sccNodes[j]]) ab++;
        if (!inA_i && inA_j && adj[nodeI * n + sccNodes[j]]) ba++;
      }
    }

    const cut = ab < ba ? ab : ba;
    if (cut < minKappa) {
      minKappa = cut;
      if (minKappa === 0) break;
    }
  }

  return minKappa === Infinity ? 0 : minKappa;
}

// ═══════════════════════════════════════════════════════════════
// PART 3: HELPER FUNCTIONS FOR VERIFICATION
// ═══════════════════════════════════════════════════════════════

function adjFromBits(n, bits) {
  // Returns flat array [n*n] — no self-loops
  const adj = new Uint8Array(n * n);
  let bit = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j) {
        if (bits & (1 << bit)) adj[i * n + j] = 1;
        bit++;
      }
    }
  }
  return adj;
}

function kappaGlobal(adj, n) {
  const sccs = tarjanSCC(adj, n);
  let bestSCC = null;
  let bestLen = 0;
  for (const scc of sccs) {
    if (scc.length > bestLen) {
      bestLen = scc.length;
      bestSCC = scc;
    }
  }
  if (!bestSCC || bestSCC.length <= 1) return 0;
  return computeKappa(adj, n, bestSCC);
}

function betti1(adj, n) {
  const sccs = tarjanSCC(adj, n);
  let maxB1 = 0;
  for (const scc of sccs) {
    if (scc.length <= 1) continue;
    let edges = 0;
    for (const i of scc) {
      for (const j of scc) {
        if (i !== j && adj[i * n + j]) edges++;
      }
    }
    const b1 = edges - scc.length + 1;
    if (b1 > maxB1) maxB1 = b1;
  }
  return maxB1;
}

function hasNontrivialSCC(adj, n) {
  const sccs = tarjanSCC(adj, n);
  for (const scc of sccs) {
    if (scc.length > 1) return true;
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════
// PART 4: CHUNKED VERIFICATION (non-blocking)
// ═══════════════════════════════════════════════════════════════

/**
 * Verify all directed graphs for a given n.
 * Calls onProgress({ n, checked, total, fails }) periodically.
 * Returns a Promise resolving to { n, numGraphs, scGraphs, failures, elapsed, pearsonR }.
 */
function verifyGraphsForN(n, onProgress) {
  return new Promise((resolve) => {
    const slots = n * (n - 1);
    const numGraphs = 1 << slots;
    let checked = 0;
    let fails = 0;
    let scCount = 0;
    const kappas = [];
    const betas = [];
    const t0 = performance.now();
    const CHUNK = 4096;

    function processChunk() {
      const end = Math.min(checked + CHUNK, numGraphs);
      for (let bits = checked; bits < end; bits++) {
        const adj = adjFromBits(n, bits);
        const k = kappaGlobal(adj, n);
        const b = betti1(adj, n);
        const scc = hasNontrivialSCC(adj, n);

        const kPos = k > 0;
        const bPos = b > 0;
        if (kPos !== bPos || kPos !== scc) fails++;

        if (scc) {
          scCount++;
          kappas.push(k);
          betas.push(b);
        }
      }
      checked = end;

      if (onProgress) {
        onProgress({ n, checked, total: numGraphs, fails });
      }

      if (checked < numGraphs) {
        setTimeout(processChunk, 0);
      } else {
        const elapsed = performance.now() - t0;
        let pearsonR = null;
        if (kappas.length > 1) {
          const mk = kappas.reduce((a, b) => a + b, 0) / kappas.length;
          const mb = betas.reduce((a, b) => a + b, 0) / betas.length;
          let cov = 0, vk = 0, vb = 0;
          for (let i = 0; i < kappas.length; i++) {
            const dk = kappas[i] - mk;
            const db = betas[i] - mb;
            cov += dk * db;
            vk += dk * dk;
            vb += db * db;
          }
          vk = Math.sqrt(vk);
          vb = Math.sqrt(vb);
          pearsonR = (vk > 0 && vb > 0) ? cov / (vk * vb) : 0;
        }
        resolve({
          n, numGraphs, scGraphs: scCount, failures: fails,
          elapsed: Math.round(elapsed), pearsonR,
        });
      }
    }

    setTimeout(processChunk, 0);
  });
}

/**
 * Verify all finite dynamical systems f:[n]->[n] for a given n.
 * Returns a Promise resolving to { n, numMaps, periodicMaps, failures, elapsed }.
 */
function verifyDynSystemsForN(n, onProgress) {
  return new Promise((resolve) => {
    const numMaps = Math.pow(n, n);
    let checked = 0;
    let fails = 0;
    let periodicCount = 0;
    const t0 = performance.now();
    const CHUNK = 4096;

    // Pre-compute all f-tuples as flat array indices
    // f_tuple[i] = the i-th digit in base-n representation of `checked`
    function getTuple(index, n) {
      const tuple = new Uint8Array(n);
      let val = index;
      for (let i = 0; i < n; i++) {
        tuple[i] = val % n;
        val = Math.floor(val / n);
      }
      return tuple;
    }

    function processChunk() {
      const end = Math.min(checked + CHUNK, numMaps);
      for (let idx = checked; idx < end; idx++) {
        const fMap = getTuple(idx, n);

        // Check for periodic orbit (period > 1)
        let hasPO = false;
        for (let x = 0; x < n; x++) {
          const visited = new Uint8Array(n);
          let curr = x;
          while (!visited[curr]) {
            visited[curr] = 1;
            curr = fMap[curr];
          }
          // curr is the cycle start — measure cycle length
          let cycleLen = 1;
          let c = fMap[curr];
          while (c !== curr) {
            cycleLen++;
            c = fMap[c];
          }
          if (cycleLen > 1) {
            hasPO = true;
            break;
          }
        }

        // Build transition graph, compute κ
        const adj = new Uint8Array(n * n);
        for (let i = 0; i < n; i++) {
          if (fMap[i] !== i) adj[i * n + fMap[i]] = 1;
        }
        const k = kappaGlobal(adj, n);

        if ((k > 0) !== hasPO) fails++;
        if (hasPO) periodicCount++;
      }
      checked = end;

      if (onProgress) {
        onProgress({ n, checked, total: numMaps, fails });
      }

      if (checked < numMaps) {
        setTimeout(processChunk, 0);
      } else {
        const elapsed = performance.now() - t0;
        resolve({
          n, numMaps, periodicMaps: periodicCount, failures: fails,
          elapsed: Math.round(elapsed),
        });
      }
    }

    setTimeout(processChunk, 0);
  });
}

// ═══════════════════════════════════════════════════════════════
// PART 5: FULL PROOF RUNNER
// ═══════════════════════════════════════════════════════════════

/**
 * Run the full exhaustive proof.
 * onUpdate({ phase, step, n, checked, total, fails, result }) is called for progress.
 * Returns a Promise resolving to { graphResults, dynResults, totalObjects, totalFailures, elapsed }.
 */
async function runFullProof(onUpdate) {
  const t0 = performance.now();
  const graphResults = [];
  const dynResults = [];

  // Part 1: Directed graphs n=2..5
  for (let n = 2; n <= 5; n++) {
    onUpdate({ phase: 'graphs', step: 'start', n });
    const result = await verifyGraphsForN(n, (p) => {
      onUpdate({ phase: 'graphs', step: 'progress', ...p });
    });
    graphResults.push(result);
    onUpdate({ phase: 'graphs', step: 'done', n, result });
  }

  // Part 2: Dynamical systems n=2..7
  for (let n = 2; n <= 7; n++) {
    onUpdate({ phase: 'dynamics', step: 'start', n });
    const result = await verifyDynSystemsForN(n, (p) => {
      onUpdate({ phase: 'dynamics', step: 'progress', ...p });
    });
    dynResults.push(result);
    onUpdate({ phase: 'dynamics', step: 'done', n, result });
  }

  const totalObjects =
    graphResults.reduce((s, r) => s + r.numGraphs, 0) +
    dynResults.reduce((s, r) => s + r.numMaps, 0);
  const totalFailures =
    graphResults.reduce((s, r) => s + r.failures, 0) +
    dynResults.reduce((s, r) => s + r.failures, 0);
  const elapsed = Math.round(performance.now() - t0);

  return { graphResults, dynResults, totalObjects, totalFailures, elapsed };
}

// ═══════════════════════════════════════════════════════════════
// PART 6: INTERACTIVE DEMO — analyze_topology for user graphs
// ═══════════════════════════════════════════════════════════════

function analyzeTopologyDemo(edges) {
  // edges: array of [src, dst] pairs (string IDs)
  // Returns canonical topology result

  // Collect nodes
  const nodeSet = new Set();
  for (const [s, d] of edges) {
    nodeSet.add(s);
    nodeSet.add(d);
  }
  const nodeList = [...nodeSet].sort();
  const n = nodeList.length;
  const idx = {};
  nodeList.forEach((nd, i) => idx[nd] = i);

  // Build adjacency (flat, no self-loops)
  const adj = new Uint8Array(n * n);
  for (const [s, d] of edges) {
    if (s !== d) adj[idx[s] * n + idx[d]] = 1;
  }

  const sccs = tarjanSCC(adj, n);
  const sccResults = [];
  const sccNodeSet = new Set();
  let maxKappa = 0;

  let sccIdx = 0;
  for (const scc of sccs) {
    if (scc.length <= 1) continue;
    for (const v of scc) sccNodeSet.add(v);
    const k = computeKappa(adj, n, scc);
    if (k > maxKappa) maxKappa = k;

    sccResults.push({
      id: `scc-${sccIdx++}`,
      nodes: scc.map(i => nodeList[i]),
      kappa: k,
      routing: k > 0 ? 'deliberate' : 'fast',
      deliberation_budget: k > 0 ? {
        max_iterations: Math.min(k + 1, 4),
        agent_count: Math.min(k, 3),
        timeout_multiplier: Math.min(1.0 + 0.5 * k, 3.5),
        confidence_threshold: Math.min(0.7 + 0.05 * k, 0.95),
      } : null,
    });
  }

  const dagNodes = nodeList.filter((_, i) => !sccNodeSet.has(i));

  return {
    sccs: sccResults,
    dag_nodes: dagNodes,
    routing: maxKappa > 0 ? 'deliberate' : 'fast',
    max_kappa: maxKappa,
    scc_count: sccResults.length,
  };
}
