// temporal.mjs — Temporal Arithmetic, faithful runtime (v0.4)
// The fourth rung: properties over TRAJECTORIES, not single states. A Spec is an LTL
// formula over atomic predicates on states. The core operation is `progress(φ, s)` —
// formula progression, the LTL "derivative": the residual obligation on the rest of the
// trajectory after observing state s. Monitoring is a fold of progress over the states.
//   safety   = "nothing bad ever happens"   — always(·); a violation has a finite witness.
//   liveness = "something good eventually"   — eventually(·); only failable at the horizon.
// Every linear property is (safety ∧ liveness) — Alpern & Schneider 1985. Laws T1–T8.

// ---- formula constructors (Boolean-simplifying, so residuals collapse to ⊤/⊥) ----
export const TRUE = { t: 'true' };
export const FALSE = { t: 'false' };
export const atom = (name, pred) => ({ t: 'atom', name, pred });
const isT = (f) => f.t === 'true';
const isF = (f) => f.t === 'false';

export function eq(a, b) {
  if (a === b) return true;
  if (!a || !b || a.t !== b.t) return false;
  switch (a.t) {
    case 'true': case 'false': return true;
    case 'atom': return a.name === b.name;
    case 'not': case 'next': case 'always': case 'eventually': return eq(a.a, b.a);
    case 'and': case 'or': case 'until': return eq(a.a, b.a) && eq(a.b, b.b);
    default: return false;
  }
}
export function not(f) {
  if (isT(f)) return FALSE; if (isF(f)) return TRUE;
  if (f.t === 'not') return f.a;            // ¬¬φ = φ
  return { t: 'not', a: f };
}
export function and(a, b) {
  if (isF(a) || isF(b)) return FALSE;
  if (isT(a)) return b; if (isT(b)) return a;
  if (eq(a, b)) return a;
  return { t: 'and', a, b };
}
export function or(a, b) {
  if (isT(a) || isT(b)) return TRUE;
  if (isF(a)) return b; if (isF(b)) return a;
  if (eq(a, b)) return a;
  return { t: 'or', a, b };
}
export const next = (a) => ({ t: 'next', a });
export const always = (a) => ({ t: 'always', a });          // G
export const eventually = (a) => ({ t: 'eventually', a });  // F
export const until = (a, b) => ({ t: 'until', a, b });       // U
// derived
export const gf = (a) => always(eventually(a));   // recurrence — infinitely often
export const fg = (a) => eventually(always(a));   // stabilization — eventually always
export const responds = (p, q) => always(or(not(p), eventually(q))); // p ⟹ ◇q

// ---- progress : Spec × State → Spec  (formula progression / the LTL derivative) ----
// τ ⊨ φ  iff  τ¹ ⊨ progress(φ, τ₀).   This identity is law T4.
export function progress(f, s) {
  switch (f.t) {
    case 'true': return TRUE;
    case 'false': return FALSE;
    case 'atom': return f.pred(s) ? TRUE : FALSE;
    case 'not': return not(progress(f.a, s));
    case 'and': return and(progress(f.a, s), progress(f.b, s));
    case 'or': return or(progress(f.a, s), progress(f.b, s));
    case 'next': return f.a;                                              // X φ ⇒ residual φ
    case 'always': return and(progress(f.a, s), always(f.a));            // G φ ≡ φ ∧ X G φ
    case 'eventually': return or(progress(f.a, s), eventually(f.a));     // F φ ≡ φ ∨ X F φ
    case 'until': return or(progress(f.b, s), and(progress(f.a, s), until(f.a, f.b))); // φUψ ≡ ψ ∨ (φ ∧ X(φUψ))
    default: return f;
  }
}

// ---- finite-trace closure: weak G (holds at end), strong F/U/X (fail at end) ----
function finalize(f) {
  switch (f.t) {
    case 'true': return true;
    case 'false': return false;
    case 'atom': return false;          // no state left
    case 'not': return !finalize(f.a);
    case 'and': return finalize(f.a) && finalize(f.b);
    case 'or': return finalize(f.a) || finalize(f.b);
    case 'always': return true;         // safety vacuously holds on the empty suffix
    case 'eventually': return false;    // liveness unmet by the horizon
    case 'until': return false;
    case 'next': return false;
    default: return false;
  }
}

// ---- monitor : Spec × Trajectory → verdict (+ step-by-step) ----
// online verdict: 'sat' once no extension can violate, 'vio' once none can satisfy, else 'pending'.
// final verdict over a *finished* finite trace applies the closure above.
export function monitor(f, trajectory) {
  let residual = f;
  const trace = [];
  let decidedAt = null;
  trajectory.forEach((s, i) => {
    residual = progress(residual, s);
    const v = isT(residual) ? 'sat' : isF(residual) ? 'vio' : 'pending';
    if (decidedAt === null && v !== 'pending') decidedAt = i;
    trace.push(v);
  });
  const finalSat = isT(residual) ? true : isF(residual) ? false : finalize(residual);
  return { verdict: finalSat ? 'satisfied' : 'violated', online: trace, residual, decidedAt };
}

// ---- evalDirect : independent reference semantics (finite trace), for law T4 ----
export function evalDirect(f, τ, i = 0) {
  if (i >= τ.length) { // empty suffix
    switch (f.t) {
      case 'true': return true; case 'false': return false; case 'atom': return false;
      case 'not': return !evalDirect(f.a, τ, i);
      case 'and': return evalDirect(f.a, τ, i) && evalDirect(f.b, τ, i);
      case 'or': return evalDirect(f.a, τ, i) || evalDirect(f.b, τ, i);
      case 'always': return true; case 'eventually': return false;
      case 'until': return false; case 'next': return false; default: return false;
    }
  }
  switch (f.t) {
    case 'true': return true;
    case 'false': return false;
    case 'atom': return !!f.pred(τ[i]);
    case 'not': return !evalDirect(f.a, τ, i);
    case 'and': return evalDirect(f.a, τ, i) && evalDirect(f.b, τ, i);
    case 'or': return evalDirect(f.a, τ, i) || evalDirect(f.b, τ, i);
    case 'next': return evalDirect(f.a, τ, i + 1);
    case 'always': return evalDirect(f.a, τ, i) && evalDirect(always(f.a), τ, i + 1);
    case 'eventually': return evalDirect(f.a, τ, i) || evalDirect(eventually(f.a), τ, i + 1);
    case 'until': return evalDirect(f.b, τ, i) || (evalDirect(f.a, τ, i) && evalDirect(until(f.a, f.b), τ, i + 1));
    default: return false;
  }
}

// ---- ω-words as lassos: ⟨stem⟩⟨loop⟩^ω. Direct semantics for the atomic patterns. ----
const someState = (states, p) => states.some((s) => p.pred(s));
const everyState = (states, p) => states.every((s) => p.pred(s));
export function monitorLasso(f, stem, loop) {
  // covers the headline single-atom temporal forms used in monitoring
  if (f.t === 'always' && f.a.t === 'atom') return everyState(stem, f.a) && everyState(loop, f.a);            // G p
  if (f.t === 'eventually' && f.a.t === 'atom') return someState(stem, f.a) || someState(loop, f.a);          // F p
  if (f.t === 'always' && f.a.t === 'eventually' && f.a.a.t === 'atom') return someState(loop, f.a.a);        // GF p — ∞ often
  if (f.t === 'eventually' && f.a.t === 'always' && f.a.a.t === 'atom') return everyState(loop, f.a.a);       // FG p — eventually always
  // general fallback: unroll a few loop copies and use finite semantics (sound for safety)
  return evalDirect(f, [...stem, ...loop, ...loop, ...loop]);
}

// ---- classification (coarse hint; the behavioural laws T5 are the real claim) ----
const has = (f, tags) => !!f && typeof f === 'object' && (tags.includes(f.t) || has(f.a, tags) || has(f.b, tags));
export function character(f) {
  const live = has(f, ['eventually', 'until']);
  if (f.t === 'always' && f.a && f.a.t === 'eventually') return 'liveness'; // GF
  if (!live) return 'safety';
  return has(f, ['always']) ? 'mixed' : 'liveness';
}

export function show(f) {
  switch (f.t) {
    case 'true': return '⊤'; case 'false': return '⊥'; case 'atom': return f.name;
    case 'not': return `¬${show(f.a)}`; case 'and': return `(${show(f.a)}∧${show(f.b)})`;
    case 'or': return `(${show(f.a)}∨${show(f.b)})`; case 'next': return `X${show(f.a)}`;
    case 'always': return `G${show(f.a)}`; case 'eventually': return `F${show(f.a)}`;
    case 'until': return `(${show(f.a)} U ${show(f.b)})`; default: return '?';
  }
}

export default {
  TRUE, FALSE, atom, not, and, or, next, always, eventually, until, gf, fg, responds,
  eq, progress, monitor, evalDirect, monitorLasso, character, show
};
