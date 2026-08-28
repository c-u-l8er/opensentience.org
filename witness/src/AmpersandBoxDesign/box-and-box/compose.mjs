// compose.mjs — the CC2 compose runtime: the lego layer (COMPOSE_RUNTIME.md §2–4).
//
// A BRICK is a capability annotated with everything needed to compose it lawfully: a holder
// (provenance), a contract (the |> hand-off types), a box-and-box modal Value (the alethic floor
// input), a Weave-shaped cost certificate (the invariant), plus utility/laws/floor. Two operators
// snap bricks together and YIELD ANOTHER BRICK (closure — "a brick of bricks is a brick"):
//
//   &   combine (parallel)   — lifts value.combine: lattice merge of capabilities, holder-tagged.
//   |>  pipeline (sequence)  — lifts value.chain:   governed, phase-graded, type-checked hand-off.
//
// Both rest on the SAME floor: any infeasible / backward / forbidden / UNCERTIFIED branch collapses
// to 0̲ (ZERO) — the absorbing element — never a down-ranked-but-surviving option. This is the alethic
// `consume` gate lifted to bricks. The composite carries a composite cost certificate and the CC2
// semiring quantities (confidence = product, cost = sum, latency = max).
//
// Pure library, zero deps: the cost certificate is DUCK-TYPED (weave emits it; we only read
// verdict.certified / verdict.costClass / policy.resourceDecision), so box-and-box stays
// dependency-free and weave stays an optional producer.

import { V, V0, combine, chain, consume, phaseIdx, PHASES} from './value.mjs';

// ---------------------------------------------------------------------------
// cost-class lattice — worst (join) wins under composition. unknown ⇒ uncertified ⇒ 0̲.
// ---------------------------------------------------------------------------
const COST_ORDER = ['poly', 'elementary', 'exponential', 'tower', 'unknown'];
const costRank = (c) => { const i = COST_ORDER.indexOf(c); return i < 0 ? COST_ORDER.length : i; };
const worseCost = (a, b) => (costRank(a) >= costRank(b) ? a : b);
// `unknown` IS a member of the lattice — it is the top, the join of everything — but it is not a
// COST. A verdict that says {certified:true, costClass:'unknown'} reads as "I certify that I do not
// know what this costs", which certifies nothing and must not clear a floor whose whole subject is
// bounded cost (CERT5). Until 2026-08-22 it did: floored() tested `certified === false` and nothing
// tested the class, so the one combination that names its own ignorance was the one that passed.
const KNOWN_COST = (c) => COST_ORDER.includes(c) && c !== 'unknown';

// resource decision from a composite cost class — fail-closed (mirrors weave-certificate.mjs).
const DECISIONS = ['allow', 'budget_check', 'escalate', 'annihilate']; // ascending strictness
const decisionOf = (certified, costClass) =>
  certified !== true || !KNOWN_COST(costClass) ? 'annihilate'
  : costClass === 'poly' ? 'allow'
  : costClass === 'tower' ? 'escalate'
  : 'budget_check'; // elementary | exponential

// ---------------------------------------------------------------------------
// THE COST CERTIFICATE IS A CARRIER, AND IT IS THE FOURTH ONE (CERT1–CERT5, outside review
// 2026-08-22). The same lesson has now arrived on four carriers, and the cost certificate is the
// one that never got the treatment the other three did:
//
//     missing contract   ->  ANY      CD1–CD5
//     malformed Value    ->  V0()     CX7, VX1–VX5
//     malformed q        ->  Q0()     QX1–QX6
//     malformed cost     ->  KEPT     here — Brick() did `cost: o.cost ?? UNCERTIFIED_COST()`
//                                     and validated NOTHING
//
// `cost: 42`, `cost: 'cert'`, `cost: []` were all stored verbatim on a LIVE brick. They happen to
// fail closed at composition (`42?.verdict?.certified` is undefined), which is why nothing caught
// it — but failing closed by ACCIDENT of optional chaining is not the same as refusing, and the
// object that mattered went unchecked. What actually got through:
//
//     { verdict: { certified: true, costClass: 'poly' } }        ⇒ LIVE, allow
//
// No issuer, no subject, no analyzer, no policy. "Certificate" at this layer meant `an object
// asserting certified:true`. It still means "presented", not "authenticated" — see attest() below,
// which draws that line where this runtime can actually hold it — but a presented certificate must
// at least BIND what it certifies, and it must be internally coherent.
//
// COHERENCE IS ONE-DIRECTIONAL. A certificate may state a decision STRICTER than its verdict
// implies (a producer with its own policy layer may escalate a poly result); it may never state a
// more permissive one. `{certified:false, resourceDecision:'allow'}` is a contradiction, and the
// permissive half of a contradiction is exactly the half an attacker writes.
const strictness = (d) => { const i = DECISIONS.indexOf(d); return i < 0 ? -1 : i; };
const strictest = (...ds) => ds.reduce((m, d) => (strictness(d) > strictness(m) ? d : m), DECISIONS[0]);
const isStr = (x) => typeof x === 'string' && x.length > 0;

// EVERY SUBJECT BINDS A HASH — leaf or composite, no exceptions (CERT11). The first version allowed
// a composite to bind `parts: []` instead, and `{kind:'weave-composite', parts:[]}` was accepted by
// attest() and produced an admitted, authenticated brick — a certificate over the empty set, while
// the code four lines away said *a certificate that names no subject certifies no subject*. Two
// shapes for one obligation is how the empty one slipped through; there is now one shape.
// SUBJECTS ARE A DISCRIMINATED UNION, and `kind` is the discriminator (CERT22). Making `term`
// merely OPTIONAL left two representations of the same subject with different extension semantics:
//
//     {kind:'weave-composite', hash:H, term:['and',A,B]}     extends to ['and',A,B,C]
//     {kind:'weave-composite', hash:H}                       extends to ['and',['leaf',…,H],C]
//
// `sameSubject` called those EQUAL — same kind, same hash — and composing each with C produced
// different identities, so the second composition refused one and not the other. An equality
// relation under which `x = y` but `compose(x,z) ≠ compose(y,z)` is not the equality of the carrier;
// it is a coincidence of two selected fields.
//
//     Two subjects are equal only if replacing one with the other cannot change any future
//     canonical identity.
//
// The fix is to remove the second representation rather than to widen the comparison. A composite
// MUST carry its term; anything else MUST NOT. `kind` then determines shape, `hash` determines the
// term (it IS its canonical serialisation, checked), and kind+hash equality is substitutive by
// construction rather than by a longer check.
const validSubject = (s) => {
  if (!s || typeof s !== 'object' || !isStr(s.kind) || !isStr(s.hash)) return false;
  // The canonical serialisation is computed ONCE and answers both questions — see canonicalTerm.
  if (s.kind === COMPOSITE_KIND) { const canon = canonicalTerm(s.term); return canon !== null && s.hash === canon; }
  return s.term === undefined;                                   // a leaf carries no structure
};

// ---------------------------------------------------------------------------
// CANONICAL COMPOSITION IDENTITY (CERT10/CERT13). A composite subject used to be the DEDUPLICATED
// SET of leaf hashes, which is not an identity for anything:
//
//     subject(a |> b) = subject(a & b) = {parts:['A','B']}      two different programs, one subject
//     subject(A |> A) = subject(A |> A |> A) = {parts:['A']}    multiplicity gone
//
// The first repair made it a canonical TERM STRING — `pipe(A,B)`, `and(A,B,C)` — and the README
// claimed "a canonical term cannot collide". THAT CLAIM WAS FALSE, and outside review falsified it
// the same day: leaf hashes are arbitrary non-empty strings, so they share a namespace with the
// grammar that was supposed to distinguish them.
//
//     subject(A |> B)                       = "pipe(A,B)"
//     subject(leaf whose hash IS "pipe(A,B)") = "pipe(A,B)"     ← equal, both LIVE
//     subject((A & B) & C)                  = "and(A,B,C)"
//     subject(leaf "and(A,B)" & C)          = "and(A,B,C)"      ← equal; unAnd() PARSED a leaf
//
// That is a data-vs-syntax injection — untrusted input that looks like grammar being read as
// grammar — which is the same meta-error this file has been removing everywhere else, committed in
// the fix for the previous one. The lesson generalises past the bug: a canonical form built by
// concatenating untrusted strings is not canonical, it is a template.
//
// THE TERM IS NOW STRUCTURED and serialised injectively, so leaf bytes can never be node syntax:
//
//     leaf   ["leaf", kind, hash]
//     pipe   ["pipe", L, R]
//     and    ["and", T…]
//
// JSON.stringify over nested string arrays is injective — it escapes, so a leaf containing `"`, `,`,
// `(`, `)` or a whole serialised term is still one string in one slot. A leaf's canonical form always
// begins `["leaf"`, so it cannot equal a `["pipe"` or `["and"` form whatever it contains.
//
// LEAF IDENTITY INCLUDES `kind` (CERT13). It did not, so `{kind:'weave-ir', hash:'H'}` and
// {kind:'world-revision', hash:'H'} both entered a term as bare `H`. Once WORLD adds a second subject
// namespace, identical payload hashes across namespaces are ordinary rather than exotic.
//
// WHAT MAY BE NORMALISED is decided by which equations this suite actually PROVES:
//
//   |>  order preserved, multiplicity preserved, NOT flattened.
//       CP1 is associativity "where feasible" and CP5/CP6 are DECLARED-OPEN gaps showing the |>
//       floor is *not* association-invariant. Flattening would assert an equation the suite falsifies.
//   &   order preserved, multiplicity preserved, flattened.
//       CA1 (associativity over carrier+quantities+cost) passes, so an &-chain has one canonical
//       shape. Order is NOT canonicalised: CA2 is commutativity on the LATTICE ONLY, and CP7 — also
//       declared-open — is the counterexample where &-operand order changes a downstream floor.
//       Duplicates are NOT removed: CA3 is idempotence on the value carrier only, and cost and the
//       CC2 quantities accrue, so `a & a` is not `a` as a whole brick.
//
// It is a canonical STRING rather than a digest because this package has no dependencies and no
// crypto; a host that needs fixed width hashes these bytes, and hashes something already canonical.
//
// Flattening reads a STRUCTURED term from a module-private WeakMap, never by parsing a string. That
// is what closes the injection for good: `unAnd()` used to re-read its own output language out of
// whatever a caller had written, and a caller declaring `kind:'weave-composite'` with a term-shaped
// hash would walk straight back into the collision. A subject is a composite only if THIS MODULE
// minted it; anything else — including a genuine composite that has crossed a wire — is a leaf.
// Conservative and correct: distinctness is what CERT10 requires, and treating a wire-returned
// composite as an opaque leaf preserves distinctness while giving up only an associativity nicety.
// THE TERM IS DURABLE DATA, NOT OBJECT-IDENTITY METADATA (CERT17). The first structured version
// kept the term in a module-private WeakMap keyed on the subject object, and that made the meaning
// of a subject depend on whether THIS EXACT JS OBJECT had been minted by THIS module instance. It
// did not survive `Brick()`, which canonicalises an artifact by building a fresh `{kind, hash}` —
// so the certificate kept its term (the cost object is carried by reference) and the artifact lost
// it, and the two derivations stopped being the same derivation at the third composition:
//
//     A & B          artifact === subject          ✓
//     (A & B) & C    artifact !== subject          ✗   — and under an authenticated floor, 0̲
//
//     artifact  ["and", ["leaf","weave-composite","[\"and\",…A…B…]"], ["leaf","weave-ir","C"]]
//     subject   ["and", ["leaf","weave-ir","A"], ["leaf","weave-ir","B"], ["leaf","weave-ir","C"]]
//
// CERT16 was true for two leaves and false at depth three, and it went green because the law tested
// the base case and never the induction step.
//
//     A canonical identity is not canonical if reconstructing the same value erases information
//     needed to EXTEND that identity.
//
// So the term lives ON the subject and travels with it — through Brick(), JSON, a worker, a store:
//
//     leaf       {kind, hash}                     term is DERIVED: ['leaf', kind, hash]
//     composite  {kind, hash, term}               with hash === canonTerm(term), CHECKED
//
// A caller may therefore hand in a composite subject and have it understood, which is what transport
// stability requires — and cannot lie about it, because the hash must equal the canonical
// serialisation of the term it ships. No leaf string is ever parsed as syntax (CERT13): the
// structural discriminator says what is data and what is grammar, so injectivity and durability stop
// being a choice between two.
// ---------------------------------------------------------------------------
// A SUBJECT IS EXTERNAL DATA, SO DECIDING IT MUST BE TOTAL UNDER A DECLARED BUDGET (CERT29/CERT30,
// tenth outside review 2026-08-22). Every walk in this section used to recurse on a caller-supplied
// tree, and `canonTerm` was `JSON.stringify`, which recurses in C++. So the answer to "is this
// certificate well formed?" was decided by the interpreter's stack:
//
//     ["pipe",["pipe",["pipe", …          depth  5000   accepted
//                                         depth 20000   RangeError: Maximum call stack size exceeded
//
// Hostile certificate data is supposed to produce 0̲, and the line between 0̲ and a thrown
// RangeError was a number nobody chose, that differs between engines, and that moves when an
// unrelated caller happens to be deeper in the stack.
//
//     A limit the implementation discovers is not a limit the protocol declared.
//
// So every walk below is ITERATIVE and the ceiling is these three numbers. They are deliberately
// generous — `|>` does not flatten while CP5/CP6 are open, so a pipeline nests linearly, and 4096
// stages is far past anything the algebra is asked to fold. Being DECLARED is the point: a peer can
// agree to a budget, and cannot agree to whatever V8 was feeling.
// `maxBytes` is CANONICAL SERIALISED UTF-8 BYTES, and saying so is a correction. It used to count
// source string units — `s.length` — and those are not the same quantity by a factor of six:
//
//     750,000 U+0000 characters      750,000 source units      under the ceiling, admitted
//     canonicalised                  4,500,055 UTF-8 bytes     over the ceiling
//
// JSON escapes a control character to the SIX characters `\u0000`, so the budget was measuring the
// input while the thing actually retained as the identity was six times larger. A budget must name
// the quantity it bounds, and the quantity that matters is the one that gets stored, hashed and
// shipped.
//
// THIS COMMENT DISABLED THE FRONTIER'S OWN FALSIFIER (fourteenth review, 2026-08-23). The sentence
// above used to carry a RAW NUL BYTE where it now spells `\u0000` out. `grep` classifies any file
// containing one as binary and prints "binary file matches" in place of the matching lines — so
// `grep -n "world" compose.mjs`, which CURRENT_FRONTIER.json documents as the rank-1 kill for "the
// `world` join is SPECIFIED, NOT WIRED", printed nothing over a file that matches it seven times.
// The probe could not fail, and would have gone on reporting "not wired" after WORLD landed. A
// comment about measuring the wrong quantity had silently broken the tool used to measure.
// Exported so a law can DERIVE the ceiling it tests against. A suite that hand-types `1 << 22` is
// asserting agreement with this line rather than checking it, which is how the published and the
// enforced law counts drifted apart once already.
export const TERM_BUDGET = Object.freeze({ maxDepth: 4096, maxNodes: 100000, maxBytes: 1 << 22, maxFoldNodes: 100000 });

// ---------------------------------------------------------------------------
// UNFORGEABLE READS (WIRE1, fourteenth review 2026-08-23).
//
// CERT39 moved the hostile boundary to bytes because `getOwnPropertyNames` and
// `getOwnPropertyDescriptor` are Proxy traps. The obvious next API — `ingestFrame(bytes)` taking a
// `Uint8Array` — REINTRODUCES THAT DEFECT if it reads the frame the ordinary way, and this was
// measured before it was written:
//
//     new Proxy(realFrame, {get})              instanceof passes, the `get` trap FIRES
//     class S extends Uint8Array {             instanceof passes, the bound is read from the
//       get byteLength() { return 1 } }        CALLER'S getter, and the oversized frame parses
//
// `bytes.byteLength > MAX` is the same mistake as `getOwnPropertyDescriptor(o, k)`: a property read
// the caller can animate. A typed array is still AN OBJECT, so "the boundary takes bytes" is only
// true of an API that never asks the object anything.
//
// These getters are pulled off the intrinsic prototypes ONCE, at module load, and applied with
// `Reflect.apply`. They are brand checks on internal slots: a subclass cannot override them, and a
// Proxy has no slot to satisfy, so it THROWS rather than trapping. That is the property CERT39
// asked for and could not get from an object graph — here it is available because a typed array has
// an internal slot and a plain object does not.
//
// ---------------------------------------------------------------------------
// THE COPY ITSELF WAS EXECUTABLE (WIRE6, fifteenth review 2026-08-23).
//
// WIRE1/WIRE2 shipped with the reads fixed and the COPY still done by
// `ArrayBuffer.prototype.slice`. That is not an inert memmove. Its very first steps run
// `SpeciesConstructor(O, %ArrayBuffer%)`, which READS `O.constructor` and then
// `constructor[@@species]` — both ordinary properties of an ordinary caller-supplied buffer — and
// the specification explicitly notes those steps may have side effects BEFORE the source data is
// copied. So the pristine captured intrinsic faithfully called the caller's getter:
//
//     const b = new ArrayBuffer(n);
//     Object.defineProperty(b, 'constructor', { get() { ...rewrite the bytes...; return ArrayBuffer } });
//     rt.ingestFrameAndVerify(new Uint8Array(b));
//
//         constructor getter ran      1
//         artifact.hash               B          <-- the frame held A when the call began
//         authenticatedFor(result)    true
//
// **The boundary authenticated B from a frame that contained A.** WIRE2's sentence — "no caller
// code participates in the bound" — was green while this ran, because the law counted invocations
// of the getters it had replaced and never asked what the copy did. Capturing an intrinsic
// guarantees nothing if the intrinsic's own algorithm is specified to consult the operand.
//
// The copy is now `%TypedArray%.prototype.set` into a buffer this module allocated.
// `SetTypedArrayFromTypedArray` reads internal slots and memmoves; there is no species lookup and
// no property access on the source. The element type is brand-checked first through the intrinsic
// `@@toStringTag` getter, because `set` CONVERTS between element types — a `Uint16Array` frame
// would otherwise be copied as elements rather than as bytes.
const TYPED_ARRAY_PROTO = Object.getPrototypeOf(Uint8Array.prototype);
const taByteLength = Object.getOwnPropertyDescriptor(TYPED_ARRAY_PROTO, 'byteLength').get;
const taBuffer = Object.getOwnPropertyDescriptor(TYPED_ARRAY_PROTO, 'buffer').get;
const taTag = Object.getOwnPropertyDescriptor(TYPED_ARRAY_PROTO, Symbol.toStringTag).get;
const taSet = TYPED_ARRAY_PROTO.set;
// `buf instanceof SharedArrayBuffer` reads a GLOBAL at call time and dispatches through
// `Symbol.hasInstance` — two more things a caller can move. This getter is the brand check: it
// throws unless applied to a genuine, non-shared `ArrayBuffer`, so "is this shared" is answered by
// an internal slot instead of by a name lookup.
const abByteLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength').get;

// ---------------------------------------------------------------------------
// WHAT WIRE PROTECTS AGAINST, AND WHAT IT DOES NOT (WIRE7, fifteenth review 2026-08-23).
//
// Outside review replaced `globalThis.TextDecoder`, `globalThis.Uint8Array` and `Reflect.apply`
// AFTER importing this module and measured frame ingress calling every one of them:
//
//     Reflect.apply    4        Uint8Array    1        TextDecoder    2
//
// Two different threats were being conflated, and only one of them is WIRE's to answer:
//
//     HOSTILE BYTES in a trusted realm       WIRE's job. The frame must not be able to execute
//                                            anything, and everything the boundary depends on is
//                                            captured here, before any caller runs.
//
//     HOSTILE CODE sharing the realm         NOT WIRE's job, and no amount of capturing fixes it.
//                                            Ordinary ECMAScript primordials are mutable and
//                                            reachable; anything that can import this module can
//                                            also replace what it did not capture, monkey-patch
//                                            `Object.defineProperty`, or read the WeakSet through
//                                            a debugger. That is what SES/Hardened JavaScript
//                                            `lockdown()` exists for, and importing SES to make
//                                            one function honest would be the wrong trade.
//
// **The contract, stated so it can be attacked rather than assumed:** WIRE protects a trusted
// runtime against hostile INPUT. It does not contain hostile CODE already executing in the same
// unhardened realm. If you need mutually hostile code in one process, give it a hardened realm, a
// worker, or a process — not a stricter parser.
//
// Capturing still earns its place inside that scope: it makes the boundary immune to ACCIDENTAL
// post-import patching (a polyfill, an instrumentation library, a test double), which is the
// failure that actually happens.
const $apply = Reflect.apply;
const $U8 = Uint8Array;
const $decoder = new TextDecoder('utf-8', { fatal: true });
const $decode = TextDecoder.prototype.decode;
const $parse = JSON.parse;

// ---------------------------------------------------------------------------
// ONE INTEROPERABLE VALUE LANGUAGE (WIRE2, fourteenth review 2026-08-23).
//
// `JSON.parse` is a JavaScript function, not a wire language. Two things it accepts cannot be
// carried across implementations, and both were measured reaching an authenticated brick:
//
//     {"artifact":{…"hash":"B"}, "artifact":{…"hash":"A"}}    → V8 keeps the LAST. RFC 8259 §4 says
//                                                               the behaviour is unpredictable:
//                                                               some implementations take the last,
//                                                               some the first, some refuse, some
//                                                               expose all. A peer therefore cannot
//                                                               agree with us about what was signed.
//     {"hash":"A\ud800"}                                      → a lone surrogate. Node carries it;
//                                                               it is not encodable as UTF-8, and
//                                                               `TextEncoder` silently replaces it
//                                                               with U+FFFD. The identity this
//                                                               runtime authenticated is one it
//                                                               CANNOT TRANSMIT — the corruption is
//                                                               not hypothetical, it happens on the
//                                                               way out of this process.
//
// I-JSON (RFC 7493) exists for exactly this: member names MUST be unique, and strings MUST NOT
// contain surrogates or noncharacters. RFC 8785 (JCS) builds on it so that hashing has repeatable
// bytes, which is what `RevisionRef` will need. Adopting the restriction now costs one scan and
// removes a class of disagreement that a signature cannot survive.
//
// NOTE ON DIVISION OF LABOUR, because it is not obvious and the ordering matters: WIRE1 does NOT
// subsume WIRE2. A strict UTF-8 decode rejects a RAW lone surrogate (bytes ED A0 80), and accepts
// `"A\ud800"` — which is perfectly well-formed UTF-8 on the wire and only becomes a lone surrogate
// after JSON string-escape processing. Well-formedness of the FRAME and well-formedness of the
// VALUE are two checks, and skipping the second because the first passed is how this would ship
// broken.
//
// Well-formed Unicode is a property of the VALUE, so it is enforced in `inertCopy`, which every
// retained snapshot passes through. Unique member names is a property of the TEXT — an object that
// already exists cannot have duplicates — so it is enforced by `ijsonFault` on the routes that have
// text to scan.
const NONCHAR = (cp) => (cp >= 0xfdd0 && cp <= 0xfdef) || (cp & 0xfffe) === 0xfffe;
// Returns a reason, or null. `isWellFormed` (ES2024) answers the surrogate half directly; the
// noncharacter half needs the scan, and doing both in one pass keeps the cost one traversal.
const badUnicode = (s) => {
  if (!s.isWellFormed()) return 'a lone surrogate — it is not encodable as UTF-8, so this value cannot survive being sent';
  for (let i = 0; i < s.length; i++) {
    const cp = s.codePointAt(i);
    if (cp > 0xffff) i++;
    if (NONCHAR(cp)) return `U+${cp.toString(16).toUpperCase()}, a Unicode noncharacter, which RFC 7493 forbids on the wire`;
  }
  return null;
};

// A DIAGNOSTIC MAY NOT DO UNBOUNDED WORK ON THE THING IT IS DECLINING. `malformedCert` built its
// message with `JSON.stringify(c.subject).slice(0, 200)` — serialise the whole subject, then keep
// 200 characters of it. Refusing a 100,100-leaf term therefore cost a full serialisation of the
// term, which is precisely the work the budget exists to refuse: the check was O(1) and the
// SENTENCE ABOUT THE CHECK was O(n). Measured at 15.4 s across one law's 2000 refusals.
//
// This is the same shape as the `String(n[0])` coercion in termFault — the error path being the
// unguarded one — and it is worth stating as a rule, because it will recur: the refusal path is
// reachable by definition by anything hostile, so it is the LAST place that may be expensive.
const briefly = (s) => {
  if (s === null || s === undefined) return String(s);
  if (typeof s !== 'object') return typeof s === 'string' ? JSON.stringify(s.slice(0, 60)) : String(s).slice(0, 60);
  const k = isStr(s.kind) ? s.kind.slice(0, 40) : '?';
  const h = isStr(s.hash) ? (s.hash.length > 60 ? s.hash.slice(0, 60) + `…(${s.hash.length} chars)` : s.hash) : '?';
  const t = Array.isArray(s.term) ? `, term ${s.term[0] === 'and' || s.term[0] === 'pipe' ? String(s.term[0]) : '?'}/${s.term.length - 1}` : '';
  return `{${k}:${h}${t}}`;
};

// UTF-8 length of `JSON.stringify(s)`, computed WITHOUT building it. Budgeting a 4 MiB ceiling by
// first allocating the oversized string is the shape of mistake the ceiling exists to prevent.
// CERT33 property-tests this against `TextEncoder().encode(JSON.stringify(s)).length`.
// EXPORTED, because a host that wants to know whether a subject will fit before it builds one
// should not have to reimplement the escaping rules and get them subtly different — that is how
// two representations of one obligation start. CERT33 property-tests it against the oracle
// `new TextEncoder().encode(JSON.stringify(s)).length`.
// `cap` applies the rule this function exists to enforce TO ITSELF. Counting all 750,000
// characters of a leaf in order to report that it is too long is the same O(n)-to-refuse mistake
// the diagnostics had: once the running total is past the ceiling, the exact total is not a fact
// anyone needs. Called with no cap it returns the true length, which is what a host precomputing a
// size wants; called with one it returns a value that is over the cap exactly when the string is.
export function canonBytes(s, cap = Infinity) {
  let n = 2;                                                     // the surrounding quotes
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x22 || c === 0x5c) n += 2;                        // " and \
    else if (c < 0x20) n += (c === 8 || c === 9 || c === 10 || c === 12 || c === 13) ? 2 : 6;  // \b \t \n \f \r, else \u00XX
    else if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const d = s.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) { n += 4; i++; }           // a well-formed pair is 4 UTF-8 bytes
      else n += 6;                                               // lone high surrogate ⇒ \uXXXX
    } else if (c >= 0xd800 && c <= 0xdfff) n += 6;               // lone surrogate ⇒ \uXXXX
    else n += 3;
    if (n > cap) return n;
  }
  return n;
}

// A term node is a PLAIN array. `Array.isArray` is TRUE of an Array subclass, and "looks right" is
// the shape this file has already been bitten by three times (isBrickShaped, the shallow freeze,
// truthy `certified`). See canonTerm below for what a subclass bought an attacker.
// `Array.isArray` sees through a Proxy without running a trap; `getPrototypeOf` runs one and can
// throw, so the question is asked defensively — a value that refuses to say what it is, is not one.
const plainArr = (x) => {
  if (!Array.isArray(x)) return false;
  try { return Object.getPrototypeOf(x) === Array.prototype; } catch { return false; }
};

// THE HASH IS COMPUTED FROM WHAT THE TERM CONTAINS, NEVER FROM WHAT IT VOLUNTEERS (CERT31).
// `canonTerm` was `JSON.stringify(t)`, and `JSON.stringify` asks a value how it would like to be
// serialised — it calls `toJSON()` when there is one:
//
//     class L extends Array { toJSON() { return ['leaf','weave-ir','X']; } }
//     L.from(['leaf','weave-ir','A'])          a leaf CONTAINING A that HASHES as a leaf naming X
//
// `sameSubject` is kind+hash, so two subjects with different contents shared one identity, and
// `verifyAndAttest` authenticated a certificate about A against an expectation of X. The brick
// carrying it was bound, authenticated and admitted. The doctrine this file states everywhere else
// — a supplied term is an identity ASSERTION, and the runtime checks the assertion against the
// bytes — was being enforced against bytes the asserter got to choose.
//
// The serialiser now walks the structure itself and delegates only the LEAF STRINGS to
// `JSON.stringify`, which is depth-1 and has no hook to invoke. Byte-identical to the old
// `JSON.stringify(term)` on any plain term (CERT32 is the property test, because a canonical form
// that changes its bytes changes every hash ever minted), and iterative, so the same rewrite that
// removes the hook also removes the stack.
function canonTerm(t) {
  let out = '';
  const stack = [t];
  while (stack.length) {
    const n = stack.pop();
    if (typeof n === 'string') { out += n; continue; }             // an already-serialised fragment
    out += '[';
    // LIFO, so push in reverse: the closing bracket goes on first and comes off last, and each
    // element is followed (in pop order) by the comma that separates it from the next.
    stack.push(']');
    for (let i = n.length - 1; i >= 0; i--) {
      stack.push(typeof n[i] === 'string' ? JSON.stringify(n[i]) : n[i]);
      if (i > 0) stack.push(',');
    }
  }
  return out;
}
// A RECURSIVELY CANONICAL OBJECT MUST ENFORCE ITS INVARIANTS RECURSIVELY (CERT23). The root subject
// required a non-empty kind and hash from the first day of CERT11 — "every subject binds a hash, leaf
// or composite, no exceptions" — and a leaf INSIDE a term was checked with a bare `typeof === string`,
// so `['leaf', '', '']` was a well-formed node. A term containing it attested, admitted, and cleared
// an `authenticated` floor while binding neither a namespace nor a digest at that position. An
// invariant enforced at the root of a tree and nowhere else is enforced on one node.
const COMPOSITE_KIND = 'weave-composite';
// Returns a REASON or null, so the refusal has a name (CERT30). The old predicate answered
// true/false and, past the stack, answered by throwing — and a thrown RangeError is the one answer
// a fail-closed boundary must never give, because it is indistinguishable from the runtime breaking.
// Two parallel stacks rather than a stack of [node, depth] pairs: this runs on every Brick() that
// carries a composite subject, and a tuple per node made the walk allocate proportionally to the
// input it is supposed to be cheaply bounding.
function termFault(t) {
  const nodeStack = [t], depthStack = [1];
  let nodes = 0, bytes = 0;
  while (nodeStack.length) {
    const n = nodeStack.pop(), depth = depthStack.pop();
    if (depth > TERM_BUDGET.maxDepth) return `term-over-budget: nesting deeper than ${TERM_BUDGET.maxDepth}`;
    if (++nodes > TERM_BUDGET.maxNodes) return `term-over-budget: more than ${TERM_BUDGET.maxNodes} nodes`;
    if (!plainArr(n) || n.length < 2)
      return 'term-malformed: every node is a plain array of length ≥ 2 (an Array SUBCLASS is refused — see canonTerm)';
    // ...and a leaf may not claim the composite kind, or the discriminator stops discriminating.
    if (n[0] === 'leaf') {
      if (!(n.length === 3 && isStr(n[1]) && isStr(n[2]) && n[1] !== COMPOSITE_KIND))
        return `term-malformed: a leaf is ['leaf', non-empty kind, non-empty hash] and may not claim '${COMPOSITE_KIND}'`;
      const room = TERM_BUDGET.maxBytes - bytes;
      bytes += canonBytes(n[0], room) + canonBytes(n[1], room) + canonBytes(n[2], room) + 4;   // 2 brackets, 2 commas
      if (bytes > TERM_BUDGET.maxBytes) return `term-over-budget: canonical form exceeds ${TERM_BUDGET.maxBytes} UTF-8 bytes`;
      continue;
    }
    if (n[0] === 'pipe') { if (n.length !== 3) return "term-malformed: 'pipe' is binary"; }
    else if (n[0] === 'and') { if (n.length < 3) return "term-malformed: 'and' takes at least two operands"; }
    // AN ERROR MESSAGE MUST NOT RUN CALLER CODE. This said `String(n[0])`, and `String()` invokes
    // `Symbol.toPrimitive` — so a term whose operator slot held an object with a throwing coercion
    // hook made the VALIDATOR throw, from inside the branch whose whole job is to refuse it. The
    // diagnostic is now built from the value's TYPE, which nothing can trap.
    else return `term-malformed: unknown operator (${typeof n[0]}${isStr(n[0]) ? ' ' + JSON.stringify(n[0]).slice(0, 32) : ''})`;
    bytes += canonBytes(n[0], TERM_BUDGET.maxBytes - bytes) + 2 + (n.length - 1);   // the tag, 2 brackets, n-1 commas
    if (bytes > TERM_BUDGET.maxBytes) return `term-over-budget: canonical form exceeds ${TERM_BUDGET.maxBytes} UTF-8 bytes`;
    // REFUSING MUST BE CHEAPER THAN ACCEPTING, or the budget does not prevent what it exists to
    // prevent. A node with k children contributes at least k more nodes, so an `and` wider than the
    // whole budget is refused HERE — without allocating a stack entry per child first. Counting to
    // a hundred thousand before declining to count to a hundred thousand is still doing the work.
    if (nodes + n.length - 1 > TERM_BUDGET.maxNodes)
      return `term-over-budget: more than ${TERM_BUDGET.maxNodes} nodes`;
    for (let i = 1; i < n.length; i++) { nodeStack.push(n[i]); depthStack.push(depth + 1); }
  }
  return null;
}
const wellFormedTerm = (t) => termFault(t) === null;

// ---------------------------------------------------------------------------
// VALIDITY IS NOT CANONICALITY (CERT25–CERT27, eighth review round). `wellFormedTerm` proves a
// grammar; it proves nothing about whether the tree is the RUNTIME'S OWN representative of its
// algebraic class. Two holes followed, and both were reachable from outside:
//
//   1. A subject could declare `kind:'weave-composite'` while carrying a LEAF term. The envelope
//      check ("a composite must have a term") was structural and never asked what the term denoted,
//      so the wrapper was accepted at ingress as a distinct subject — and then evaporated:
//
//          F = {kind:'weave-composite', term:['leaf','weave-ir','A']}
//          A = {kind:'weave-ir', hash:'A'}
//          F ≠ A                     at ingress
//          F & C  ===  A & C         at the identity layer
//
//      A discriminator that the two halves of the object can disagree about is not discriminating.
//
//   2. `['and',['and',A,B],C]` was accepted alongside `['and',A,B,C]`, with different hashes, while
//      the runtime itself only ever PRODUCES the flat form because CA1 (associativity over
//      carrier+quantities+cost) is a passing law. So the predicate proved "this string serialises
//      this tree" and not "this tree is the canonical representative of its class", and two peers
//      describing one assembly would mint two authoritative identities for it.
//
//     An identity is canonical only if every admissible representation of the same PROVED algebraic
//     object produces the same identity — and noncanonical representations are REFUSED, not
//     repaired.
//
// REFUSED, not repaired, because a supplied term is an identity ASSERTION. Silently flattening it
// would be a default overwriting a claim, which is the line this file draws on every other carrier:
// ABSENT takes a documented default, PRESENT + NONCANONICAL is 0̲.
//
// ONLY EQUATIONS THIS SUITE PROVES ARE NORMALISED. `&` flattens because CA1 passes. `&` order is NOT
// canonicalised (CA2 is lattice-only and CP7 is the open counterexample) and duplicates are NOT
// removed (CA3 is lattice-only; cost and q accrue). `|>` association is preserved exactly as supplied
// while CP5/CP6 remain declared-open: normalising there would assert an equation the suite falsifies.
//
// ITERATIVE, AND IT ALWAYS ALLOCATES. The recursive version returned a leaf BY REFERENCE, so the
// normal form of a term shared nodes with the caller's tree — which is how a caller-owned object
// with a `toJSON` survived normalisation and reached storage (CERT31). Every node returned here is
// a freshly built plain array, so a normalised term is inert: nothing on it can answer a later
// reader differently than it answered this one. Post-order, with an explicit frame stack.
function normalizeTerm(t) {
  const stack = [{ n: t, i: 1, kids: [] }];
  let result = null;
  while (stack.length) {
    const f = stack[stack.length - 1];
    if (f.n[0] === 'leaf') { result = ['leaf', f.n[1], f.n[2]]; stack.pop(); }
    else if (f.i < f.n.length) { stack.push({ n: f.n[f.i++], i: 1, kids: [] }); continue; }
    else if (f.n[0] === 'pipe') { result = ['pipe', f.kids[0], f.kids[1]]; stack.pop(); }
    else {
      // `&` flattens (CA1 is proved). `unshift` rather than a spread: a 100k-child `and` is inside
      // the declared node budget and would exceed the argument limit.
      const kids = [];
      for (const k of f.kids) { if (k[0] === 'and') { for (let j = 1; j < k.length; j++) kids.push(k[j]); } else kids.push(k); }
      kids.unshift('and');
      result = kids; stack.pop();
    }
    if (stack.length) stack[stack.length - 1].kids.push(result);
  }
  return result;
}
// A COMPOSITE term denotes a composition: its root is an operator, never a leaf (CERT25). A leaf has
// its own branch of the union and does not get a second spelling.
//
// Returns the canonical SERIALISATION, or null when the term is not canonical. It returns the bytes
// rather than a boolean because its one caller needs them: `validSubject` asks two questions of the
// same term — is this the normal form, and is the declared hash the hash of what was declared — and
// answering them separately serialised the whole tree three times per Brick().
//
// Canonicality is still decided by round-tripping through `normalizeTerm` itself rather than by a
// hand-stated rule about which shapes are normal. The rule would be short today ("no `and` directly
// inside an `and`") and would be a second place to change when the normaliser changes — and two
// representations of one obligation is the shape this file keeps finding at the bottom of its bugs.
const canonicalTerm = (t) => {
  if (!wellFormedTerm(t) || t[0] === 'leaf') return null;
  const canon = canonTerm(t);
  return canon === canonTerm(normalizeTerm(t)) ? canon : null;
};
// A leaf's term is derived and never stored; a composite carries it. `termOf` is total.
const termOf = (s) => (Array.isArray(s?.term) ? s.term : ['leaf', s?.kind ?? '', s?.hash ?? '']);
// EXACT subject equality — the complete subject, never one selected field (CERT13). `verifyAndAttest`
// and the floor both compared `hash` alone, so a certificate for {weave-ir, H} authenticated a brick
// claiming to be {world-revision, H}. `hash` determines `term` (it IS its canonical serialisation),
// so kind+hash remains the whole of the comparison.
// Substitutive BY CONSTRUCTION: `kind` fixes the shape and `hash` fixes the term, because a
// composite's hash is the canonical serialisation of its term and a leaf has no term to differ in.
const sameSubject = (x, y) => !!x && !!y && x.kind === y.kind && x.hash === y.hash;
// Carries {kind, hash} plus the term when there is one — used by Brick() so canonicalisation
// preserves rather than erases.
// The term is COPIED, never adopted: `normalizeTerm` allocates every node, so what a brick stores
// is inert plain data rather than a structure the caller still holds a reference to (CERT31).
const copySubject = (s) => (Array.isArray(s.term)
  ? { kind: s.kind, hash: s.hash, term: normalizeTerm(s.term) }
  : { kind: s.kind, hash: s.hash });
// Builds a composite identity from two identities. Used for BOTH the certificate subject and the
// artifact, computed independently from different inputs — see composeAnd/composePipe (CERT16).
//
// WHAT MAY BE NORMALISED is decided by which equations this suite actually PROVES:
//   |>  order and multiplicity preserved, NOT flattened — CP5/CP6 are declared-open, so flattening
//       would assert an equation the suite currently falsifies.
//   &   order and multiplicity preserved, flattened — CA1 (associativity over carrier+quantities+
//       cost) passes. Order is NOT canonicalised (CA2 is lattice-only; CP7 is the open
//       counterexample) and duplicates are NOT removed (CA3 is lattice-only; cost and q accrue).
const composeIdentity = (op, x, y) => {
  if (!x || !y) return null;                                     // an operand with no identity yields none
  const tx = termOf(x), ty = termOf(y);
  const term = op === '&'
    ? ['and', ...(tx[0] === 'and' ? tx.slice(1) : [tx]), ...(ty[0] === 'and' ? ty.slice(1) : [ty])]
    : ['pipe', tx, ty];
  return { kind: 'weave-composite', hash: canonTerm(term), term };
};

// Returns a reason string, or null when the certificate is well formed. Used at ingress
// (unreadableCost) and by attest().
function malformedCert(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return 'not-an-object';
  if (!validSubject(c.subject))
    return `subject: a LEAF is {kind, hash} with no term; a COMPOSITE is {kind:'${COMPOSITE_KIND}', hash, term} ` +
           'where the term ROOT is `and`/`pipe` (never `leaf`), every nested leaf is non-empty, the term is in ' +
           'NORMAL FORM (`and` is flat — CA1 is proved; `pipe` association is preserved — CP5/CP6 are open), and ' +
           'hash === canonicalJSON(term). A noncanonical term is refused, not repaired. Got ' +
           briefly(c.subject);
  if (!c.analyzer || typeof c.analyzer !== 'object' || !isStr(c.analyzer.name) ||
      typeof c.analyzer.version !== 'string') return 'analyzer: must name {name, version}';
  if (!c.verdict || typeof c.verdict !== 'object') return 'verdict: absent';
  // `certified` is a BOOLEAN, not a truthy value. `!!c.verdict.certified` made the STRING 'false',
  // the empty array and the empty object all read as certified — the oldest trap in the language,
  // on the field with the most authority in this file.
  if (typeof c.verdict.certified !== 'boolean') return 'verdict.certified: must be a boolean';
  if (!COST_ORDER.includes(c.verdict.costClass))
    return `verdict.costClass: must be one of {${COST_ORDER.join(', ')}}`;
  if (!DECISIONS.includes(c.policy?.resourceDecision))
    return `policy.resourceDecision: must be one of {${DECISIONS.join(', ')}}`;
  if (strictness(c.policy.resourceDecision) < strictness(decisionOf(c.verdict.certified, c.verdict.costClass)))
    return `policy.resourceDecision '${c.policy.resourceDecision}' is more permissive than its own verdict allows`;
  return null;
}

// ---------------------------------------------------------------------------
// PRESENTED vs AUTHENTICATED — and an honest statement of which one this layer can establish.
//
// `certified: true` is a field, and a field is written by whoever holds the pen. box-and-box has no
// crypto and no dependency on the producer (weave), so it cannot verify a signature and will not
// pretend to. What it CAN do is exactly what it already did for the identity terms, and for the
// same reason: reference identity is the one property a caller cannot forge by writing data.
//
//     attest(cert)      brands a certificate in a module-private WeakSet
//     isAttested(cert)  reference membership — unforgeable by data
//
// BE PRECISE ABOUT WHAT THIS BUYS, because overclaiming here would be the same mistake one layer up.
// Attestation is unforgeable by DATA, not by CODE: anything that can import this module can call
// attest(). It is not a defence against hostile code in-process. It IS a defence against the
// boundary that actually matters for WORLD, receipts and replay — a certificate arriving as JSON,
// over postMessage, out of a store or across a realm CANNOT be attested, because a WeakSet brand
// does not survive serialisation. That is the line between
//
//     certificate presented      (well formed, binds a subject, says certified:true)
//     certificate authenticated  (this process minted or verified it)
//
// The floor requires PRESENTED by default, which is what every existing consumer supplies and is
// stated plainly rather than left to the word "certificate" to imply. A brick that needs the
// stronger reading declares `floor: ['authenticated']` and gets it, compositionally — the
// requirement is unioned into every composite it enters, so it cannot be dropped downstream.
// ATTESTATION IS A CAPABILITY, NOT AN EXPORT (2026-08-22, fifth review). The previous round shipped
// a module-level `attest(cert)` and said honestly that it was unforgeable by DATA but not by CODE.
// Honest, and not good enough once the same brand carries WORLD revisions, authority delegations and
// receipts: any module with package access could declare a fact authenticated.
//
// The authority is now minted ONCE per realm and FIRST CALLER WINS. An application constructs it
// during bootstrap, hands it to whichever component actually verifies certificates, and no code
// loaded afterwards can mint another. State the limit rather than implying there isn't one: this is
// bootstrap-order security. Code that runs before your bootstrap takes the authority instead — which
// is a real property of every capability-bootstrap scheme and is the reason the call belongs as
// early in a process as the module graph allows.
//
// READING is not a privilege. `isAttested` stays a free export: asking whether a fact is
// authenticated must never require the power to make it so.
// THE ATTESTATION STORE IS A VALUE, NOT AMBIENT MODULE STATE. It began as one module-level WeakSet,
// and outside review named the consequence: once this brand carries WORLD revisions, authority
// delegations, receipt admission and replay validity, it IS the security root — and a security root
// should not live in a module singleton whose scope is "whoever imported this file first".
//
// A store is now an ordinary value that a runtime owns, so two tenants, worlds or verifiers in one
// process do not implicitly share authentication state. `createComposeRuntime({verify})` mints one;
// the module-level exports use a DEFAULT store, which preserves the existing surface exactly and is
// the one an application gets if it never asks for isolation.
// ---------------------------------------------------------------------------
// EXTERNAL EVIDENCE ENTERS AS INERT DATA OR IT DOES NOT ENTER (CERT28/CERT31). Returns a fresh deep
// copy of plain JSON data, or a NAMED reason why the input is not plain JSON data.
//
// Two things a caller-owned object can do that a frozen reference to it cannot stop:
//
//     an accessor      `get subject() { … }` answers the check and the verifier differently;
//                      Object.freeze does not turn a getter into a value
//     a serialisation
//     hook             `toJSON()` answers `canonTerm` differently than it answers a reader
//
// Copying settles both by reading every property EXACTLY ONCE, through its descriptor, into a fresh
// plain container. What comes out has no prototype but Object/Array, no accessors, no cycles, and
// no relationship to the object the caller still holds. It is also the only way to make "the bytes
// verified are the bytes branded" true rather than merely likely — see verifyAndAttest.
//
// Bounded by the same declared budget as the terms, and iterative for the same reason.
const TRAPPED = Symbol('prototype-question-trapped');
// TOTALITY IS THE CONTRACT, SO IT IS ENFORCED AND NOT MERELY INTENDED. Every specific hazard below
// is probed by name, and the whole walk is then wrapped: a value can trap `getOwnPropertyNames`,
// `getOwnPropertyDescriptor`, `length`, or something not yet invented, and the guarantee this
// function makes to its callers — hostile input yields a named refusal, never an exception — must
// not depend on having enumerated every trap in advance. Naming the ones we know buys a good
// message; the wrapper buys the contract.
function inertCopy(root, what) {
  try { return inertCopyInner(root, what); }
  catch (e) { return { fault: `${what}-not-inert: it threw while being read (${e?.constructor?.name ?? 'unknown'}) — a value that resists inspection is not plain JSON data` }; }
}
function inertCopyInner(root, what) {
  const no = (why) => ({ fault: `${what}-not-inert: ${why}` });
  // A PROXY CAN TRAP THE QUESTION. `Object.getPrototypeOf` runs a `getPrototypeOf` trap and
  // `v.constructor.name` runs a `get` trap, so the two calls this function used to identify hostile
  // values could each be made to THROW — out of the one function in the file whose contract is that
  // hostile input produces a named refusal rather than an exception. Both are now probes that
  // cannot fail: a value that will not answer what it is, is not plain JSON data.
  const proto = (o) => { try { return Object.getPrototypeOf(o); } catch { return TRAPPED; } };
  const plainObj = (o) => { const p = proto(o); return p === Object.prototype || p === null; };
  const named = (v) => { try { return v?.constructor?.name ?? 'an exotic object'; } catch { return 'a value that traps its own identity'; } };
  if (root === null || typeof root !== 'object') return no(`a ${what} is an object, got ${typeof root}`);
  if (!plainArr(root) && !plainObj(root)) return no(`a ${what} is plain JSON data, got ${named(root)}`);
  // AN INERT SNAPSHOT HAS NO SEMANTIC PROTOTYPE (CERT36). `{}` inherits `Object.prototype`, and
  // `Object.prototype` has an accessor named `__proto__`. `JSON.parse` treats that key as ORDINARY
  // DATA and produces it as an own property — but copying it out with `dst[k] = v` runs the
  // inherited setter and re-points the destination's prototype instead of storing a field:
  //
  //     JSON.parse('{"__proto__":{"subject":…,"verdict":{"certified":true},…}}')
  //     → snapshot has NO own `subject`; it INHERITS one
  //     → malformedCert reads it through the chain and validates
  //     → deepFreeze walks getOwnPropertyNames, so the prototype is never frozen
  //     → Object.getPrototypeOf(cert).subject.hash = 'B'   …after attestation
  //
  // Which is CERT8/CERT28 again — an authenticated certificate changing what it authenticates —
  // reached through inheritance rather than through mutability. The boundary built to stop hostile
  // data was itself written in the language's most famous hostile-data footgun.
  //
  //     Every semantic field is OWN DATA. There is no inherited meaning.
  //
  // Two changes, and the second matters more than the first: objects get a NULL prototype, so there
  // is no inherited accessor to trigger and no chain for a reader to fall through; and every field
  // is installed with `defineProperty`, which never consults a setter. Special-casing the name
  // `__proto__` would have fixed this witness and left the general defect — an inherited setter on
  // any key — in place.
  const shell = (v) => (plainArr(v) ? [] : Object.create(null));
  const put = (dst, k, v) => Object.defineProperty(dst, k, { value: v, writable: true, enumerable: true, configurable: true });
  const out = shell(root);
  const seen = new Set([root]);
  const srcStack = [root], dstStack = [out], depthStack = [1];   // parallel, so the walk allocates nothing per node
  let nodes = 0;
  while (srcStack.length) {
    const src = srcStack.pop(), dst = dstStack.pop(), depth = depthStack.pop();
    if (depth > TERM_BUDGET.maxDepth) return { fault: `${what}-over-budget: nesting deeper than ${TERM_BUDGET.maxDepth}` };
    // DESCRIPTOR-ONLY MEANS DESCRIPTOR-ONLY (CERT37). The per-key read was already descriptor-based,
    // and the INDEX DISCOVERY was not: `Array.from(src, (_, i) => String(i))` iterates the source,
    // so an accessor installed on an element ran once per snapshot. The outer catch kept the
    // never-throw contract, but "snapshot without executing caller behaviour" is the stronger and
    // more useful property, and a getter with a side effect that returns normally defeated it
    // silently. Indices now come from the LENGTH DESCRIPTOR and the elements are only ever read
    // through `getOwnPropertyDescriptor`.
    const isArr = plainArr(src);
    let names = null, width;
    if (isArr) {
      const ld = Object.getOwnPropertyDescriptor(src, 'length');
      if (!ld || !('value' in ld) || !Number.isSafeInteger(ld.value) || ld.value < 0)
        return no("an array's `length` is not a plain non-negative integer");
      width = ld.value;
    } else {
      names = Object.getOwnPropertyNames(src);
      width = names.length;
    }
    // Width is checked before the keys are materialised, for the reason termFault gives: the cost
    // of refusing must not scale with the size of the thing being refused.
    if (nodes + width > TERM_BUDGET.maxNodes) return { fault: `${what}-over-budget: more than ${TERM_BUDGET.maxNodes} nodes` };
    for (let ki = 0; ki < width; ki++) {
      const k = isArr ? String(ki) : names[ki];
      if (++nodes > TERM_BUDGET.maxNodes) return { fault: `${what}-over-budget: more than ${TERM_BUDGET.maxNodes} nodes` };
      const d = Object.getOwnPropertyDescriptor(src, k);
      if (!d) return no(`'${k}' is a hole`);
      if (!('value' in d)) return no(`'${k}' is an accessor — a property that computes itself can answer the check and the verifier differently`);
      const v = d.value;
      // AN OWN `undefined` IS NOT ABSENCE (CERT40). This used to `continue`, on the reasoning that
      // JSON has no `undefined` and `JSON.stringify` drops such a key. That reasoning is wrong in
      // both directions: in an ARRAY, `JSON.stringify` emits `null` and keeps the slot — so the two
      // carriers disagree — and more importantly, silently dropping it turns
      //
      //     floor: [undefined]     PRESENT + INVALID   ⇒ Brick() refuses (unrecognised token)
      //     floor: []              NO REQUIREMENT      ⇒ admitted
      //
      // A hostile boundary that ERASES an unrecognised requirement makes the object LESS
      // constrained than the input asked for. That is the laundering rule this file has learned on
      // five carriers already, arriving at the boundary built to enforce it: absence may take a
      // documented default; present-and-malformed may not be repaired into a stronger claim.
      // The contract says plain JSON DATA, so it requires values JSON can actually contain, rather
      // than reproducing `JSON.stringify`'s per-carrier coercions.
      if (v === undefined) return no(`'${k}' is undefined — JSON has no such value, and dropping it would ` +
                                     'turn present-and-invalid evidence into absent evidence');
      // WIRE2. The KEY is wire data too — a member name carrying a lone surrogate is the same defect
      // as a value carrying one, and it is the half that is easy to forget because keys usually look
      // like identifiers.
      if (!isArr) { const bad = badUnicode(k); if (bad) return no(`the member name ${JSON.stringify(k)} contains ${bad}`); }
      if (typeof v === 'string') {
        const bad = badUnicode(v);
        if (bad) return no(`'${k}' contains ${bad}`);
        put(dst, k, v); continue;
      }
      if (v === null || typeof v === 'boolean') { put(dst, k, v); continue; }
      if (typeof v === 'number') {
        if (!Number.isFinite(v)) return no(`'${k}' is ${String(v)}, which JSON cannot carry`);
        put(dst, k, v); continue;
      }
      if (typeof v !== 'object') return no(`'${k}' is a ${typeof v}`);
      if (seen.has(v)) return no(`'${k}' closes a cycle`);
      if (!plainArr(v) && !plainObj(v))
        return no(Array.isArray(v)
          // The two cases are different mistakes and deserve different sentences. The first is the
          // CERT31 attack; the second is usually a host putting a Date or a class instance on the wire.
          ? `'${k}' is ${named(v)}, an Array SUBCLASS — still Array.isArray, and its toJSON is a second opinion about its own contents`
          : `'${k}' is ${named(v)}, not plain JSON — serialise it to a string or a number before it crosses this boundary`);
      seen.add(v);
      const child = shell(v);
      put(dst, k, child);
      srcStack.push(v); dstStack.push(child); depthStack.push(depth + 1);
    }
  }
  return { value: out };
}

const newStore = () => {
  const set = new WeakSet();
  return Object.freeze({ has: (c) => set.has(c), add: (c) => set.add(c) });
};
const DEFAULT_STORE = newStore();
let AUTHORITY_CLAIMED = false;

// ATTESTATION BINDS AN IMMUTABLE CLAIM ABOUT AN EXACT SUBJECT (CERT8/CERT9). The brand used to
// attach to a mutable object reference, so:
//
//     const c = attest(certFor('hash-A'));   isAttested(c)  →  true
//     c.subject.hash = 'hash-B';             isAttested(c)  →  true
//
// The certificate changed what it claims to authenticate and the authentication survived — the
// attestation form of the shallow-frozen identity defect closed one round earlier. Freezing happens
// BEFORE branding, and the brand is on the frozen object, so there is no window in which an attested
// certificate is writable.
export function createAttestationAuthority({ name = 'anonymous', verify } = {}, store = DEFAULT_STORE) {
  // The once-per-module-instance rule guards the DEFAULT store only. A runtime minted by
  // createComposeRuntime() owns its own store and its own authority, so there is no race to win.
  if (store === DEFAULT_STORE && AUTHORITY_CLAIMED)
    throw new Error('createAttestationAuthority: this module instance\u2019s attestation authority has already been ' +
                    'claimed \u2014 it is minted once, at bootstrap, and handed to the component that verifies certificates.');
  // `verify` is MANDATORY. If the word "authenticated" is to entail an actual verification step,
  // an authority with no verifier is a rubber stamp wearing a capability's clothes.
  if (typeof verify !== 'function')
    throw new TypeError('createAttestationAuthority: a `verify` function is required \u2014 an authority that checks ' +
                        'nothing does not authenticate anything, it only relabels it.');
  if (store === DEFAULT_STORE) AUTHORITY_CLAIMED = true;
  return Object.freeze({
    name,
    // `expectedSubject` is REQUIRED and is the whole point. A verifier that does not say what it
    // expected has authenticated "some certificate", which is what let one attested certificate
    // authenticate two unrelated bricks.
    // THE STRUCTURE VERIFIED IS THE STRUCTURE BRANDED (CERT28). The order used to be
    //
    //     validate cert → check cert.subject === expected → verify(cert) → deepFreeze → brand
    //
    // and the certificate was still MUTABLE while the verifier ran. A verifier that writes to what
    // it is checking — hostile, or merely a host that "normalises" a field on the way past — moves
    // the claim after the claim has been approved:
    //
    //     verify(cert) { cert.subject.hash = 'B'; return true }
    //     verifyAndAttest(cert-for-A, expected = A)
    //         subject comparison passes while the certificate says A
    //         the verifier rewrites it to B
    //         attested: true, subject: B
    //     …and B is then authenticatedFor and admitted under floor:['authenticated'].
    //
    // "Verify this exact certificate for subject A" finished by authenticating B. That is the same
    // receipt-truth class as CERT8/CERT9 (the brand outliving the claim it was branded for) — the
    // object checked was not guaranteed to be the object sealed.
    //
    // Freezing earlier is not enough on its own, because `Object.freeze` leaves an accessor an
    // accessor: `get subject()` would still answer the check and the verifier differently. So the
    // certificate is SNAPSHOT into inert data first, and everything downstream — validation, the
    // subject comparison, the verifier, the brand, the return value — sees that one frozen snapshot.
    //
    //     snapshot → validate the snapshot → freeze it → compare → verify IT → brand IT
    //
    // The caller's object is neither branded nor frozen: the attested certificate is the RETURN
    // VALUE, which is what the documented usage already takes. Keeping the input reference and
    // attaching that instead yields presented-but-not-authenticated — fail-closed, and visible.
    verifyAndAttest(cert, expectedSubject) {
      const snap = inertCopy(cert, 'certificate');
      if (snap.fault) throw new TypeError(`verifyAndAttest: ${snap.fault}`);
      cert = snap.value;
      const why = malformedCert(cert);
      if (why) throw new TypeError(`verifyAndAttest: not a certificate — ${why}`);
      // THE EXPECTED SUBJECT IS A COMPLETE SUBJECT, not a hash. It took a bare hash string until
      // 2026-08-22 and compared only that, so a certificate for {weave-ir, H} authenticated a claim
      // to be {world-revision, H}. A selected field is not an identity; once WORLD adds a second
      // subject namespace, equal payload hashes across namespaces are ordinary (CERT13).
      if (isStr(expectedSubject))
        throw new TypeError('verifyAndAttest: expected subject must be {kind, hash}, not a bare hash — ' +
                            'a hash alone does not name a subject, and comparing one field is not binding');
      // The EXPECTATION is snapshot for the same reason the certificate is: it is the other half of
      // the comparison, and a claim that can restate itself is not a claim.
      const wantSnap = inertCopy(expectedSubject, 'expected subject');
      if (wantSnap.fault || !validSubject(wantSnap.value))
        throw new TypeError('verifyAndAttest: an expected subject {kind, hash} is required — attesting without one authenticates nothing in particular' +
                            (wantSnap.fault ? ` (${wantSnap.fault})` : ''));
      const want = deepFreeze(wantSnap.value);
      // Frozen BEFORE the comparison, so nothing between the comparison and the brand can move it.
      deepFreeze(cert);
      if (!sameSubject(cert.subject, want))
        throw new TypeError(`verifyAndAttest: subject mismatch — certificate binds ${briefly(cert.subject)}, caller expected ${briefly(want)}`);
      // the injected authenticity check (signature, receipt, trusted analyzer, whatever the host has)
      // A VERIFIER THAT THROWS REFUSES, BY NAME. It throws for two reasons and both mean "not
      // authenticated": the host could not complete the check, or — now that the snapshot is frozen
      // — it tried to write to what it was checking and the freeze stopped it. Left unwrapped, the
      // second surfaced as `Cannot assign to read only property 'hash'`, which reads like the
      // runtime breaking rather than like a certificate being refused.
      let ok;
      try { ok = verify(cert, want); }
      catch (e) {
        throw new TypeError(`verifyAndAttest: ${name} threw while verifying ${want.kind}:${want.hash} — refused. ` +
                            `A verifier may not mutate the certificate it is verifying (the snapshot is frozen). ${e?.message ?? e}`);
      }
      if (ok !== true)
        throw new TypeError(`verifyAndAttest: ${name} refused the certificate for ${want.kind}:${want.hash}`);
      store.add(cert);
      return cert;
    }
  });
}
// The module is the issuer of a composite it folded itself, and of the identity terms' free
// certificate. Private: there is no export that reaches this.
const brandOwn = (cert, store = DEFAULT_STORE) => { deepFreeze(cert); store.add(cert); return cert; };
export const isAttested = (c, store = DEFAULT_STORE) => !!c && typeof c === 'object' && store.has(c);

// AUTHENTICATION IS A RELATION, NOT A FLAG (CERT14). `isAttested(brick.cost)` answers "was this
// certificate object verified"; it does not answer "was it verified FOR THIS BRICK". The runtime
// asked the first question and branded composites on it, so two bricks each carrying an attested
// certificate BOUND TO SOMETHING ELSE composed into an authenticated composite — and the operands'
// own identities vanished from the result:
//
//     X claims X, carries a certificate authenticated for A
//     Y claims Y, carries a certificate authenticated for B
//     X |> Y  ⇒  LIVE, AUTHENTICATED, subject pipe(A,B)      ← X and Y are gone
//
// The `authenticated` FLOOR checked the binding, so this route needed neither brick to ask for it.
// That conflated two different things, and separating them is the fix:
//
//     the authentication PROPERTY   an objective relation between an artifact and its evidence
//     the authenticated FLOOR       a contextual requirement that the relation exist
//
// The floor decides whether authentication is REQUIRED. It must not decide what authentication
// MEANS. So the property is computed here, always, and the floor merely consults it.
// BINDING IS NOT PART OF AUTHENTICATION (CERT20/CERT21). The two questions are different:
//
//     binding          what does this evidence purport to be evidence ABOUT?
//     authentication   who established that the evidence is genuine?
//
// A certificate for `A` attached to an artifact `X` is not an *unauthenticated* certificate for X.
// It is the WRONG CERTIFICATE, and it was admitted — LIVE, at the baseline floor, with the runtime
// holding an object whose evidence explicitly names something else. That is not a downgrade, it is
// an internally inconsistent admitted object, and two of them composed into one.
//
//     Evidence presented for a subject must first actually NAME that subject.
//     Authentication decides whether to trust the evidence, not whether it is about the thing
//     carrying it.
//
// So binding moved DOWN to the baseline floor and authentication is layered on top of it.
export function presentedFor(x) {                                // store-independent: binding is structural
  const b = ensure(x);
  return !isZero(b) && !!b.artifact && sameSubject(b.artifact, b.cost.subject);
}
export function authenticatedFor(x, store = DEFAULT_STORE) {
  const b = ensure(x);
  return presentedFor(b) && isAttested(b.cost, store);
}

// a certified-poly identity certificate (used by the identity terms none/id; they cost nothing).
// Attested because THIS MODULE mints it — that is the one issuer whose authenticity it can vouch for.
const FREE_COST = () => brandOwn({
  subject: { kind: 'weave-ir', hash: '00000000' },
  analyzer: { name: 'identity', version: '0' },
  verdict: { certified: true, total: true, oracleFree: true, costClass: 'poly' },
  policy: { resourceDecision: 'allow', reason: 'identity term — costless' }
});
// fail-closed default for a brick that arrives without a certificate: uncertified ⇒ 0̲.
const UNCERTIFIED_COST = () => ({
  subject: { kind: 'weave-ir', hash: '00000000' },
  analyzer: { name: 'none', version: '0' },
  verdict: { certified: false, total: false, oracleFree: false, costClass: 'unknown' },
  policy: { resourceDecision: 'annihilate', reason: 'no certificate supplied — fail-closed' }
});

// ABSENT is not MALFORMED. A missing certificate takes the fail-closed default (uncertified ⇒ 0̲ at
// the floor), which is the LEAST favourable reading and therefore claims nothing. A malformed one
// is a false assertion and floors the brick outright — the PRESENT + INVALID rule the Value and q
// carriers already follow. `authenticated` is refused on input for the CD12 reason: it is a
// privileged status, and privileged status is never something data gets to declare about itself.
function unreadableCost(c) {
  if (c == null) return false;                                   // absent ⇒ documented default
  if (c && typeof c === 'object' && !Array.isArray(c) && c.verdict &&
      typeof c.verdict === 'object' && 'authenticated' in c.verdict) return true;
  return malformedCert(c) !== null;
}

function composeCost(ba, bb, op, store = DEFAULT_STORE) {
  const a = ba.cost, b = bb.cost;
  const certified = a?.verdict?.certified === true && b?.verdict?.certified === true;
  const ca = a?.verdict?.costClass ?? 'unknown';
  const cb = b?.verdict?.costClass ?? 'unknown';
  let costClass = worseCost(ca, cb);
  if (!certified) costClass = costClass === 'poly' ? 'unknown' : costClass; // uncertified can't be "poly"
  // COMPOSITION NEVER WEAKENS RESOURCE POLICY (CERT6). This used to be `decisionOf(certified,
  // costClass)` alone — derived from the cost class and nothing else — so every stricter policy an
  // operand carried was thrown away on the way into the composite:
  //
  //     certificate: certified, poly, policy = ANNIHILATE
  //     composite  : certified, poly, policy = ALLOW
  //
  // That is policy laundering, and it contradicts the one-directional coherence rule the validator
  // already enforces on a SINGLE certificate: a policy may be stricter than its verdict implies and
  // may never be more permissive. Enforcing that per-certificate while discarding it per-composition
  // left the rule true of every leaf and false of the algebra it was written to protect. The
  // composite decision is now the JOIN over both operands and the cost-derived minimum, on
  //
  //     allow < budget_check < escalate < annihilate
  //
  // so strictness only ever accumulates. `annihilate` does not merely propagate — it floors; see
  // floored() (CERT7).
  const resourceDecision = strictest(
    a?.policy?.resourceDecision, b?.policy?.resourceDecision, decisionOf(certified, costClass));
  //
  // AUTHENTICATION IS NOT A FIELD. The first draft wrote `authenticated` into the composite verdict,
  // and that was the CD12 mistake with a new name: a privileged status stored as data is one any
  // caller can write. It also broke immediately and usefully — the ingress rule refusing a
  // caller-declared `authenticated` fired on the runtime's own composite and annihilated every
  // composite in the algebra. Two rules disagreeing about one field is the sign that the field
  // should not exist. It lives in the WeakSet, is read through isAttested(), and DOES NOT SERIALISE.
  // CERT15 — a composite is authenticated only when EVERY operand was authenticated FOR ITS OWN
  // ARTIFACT. `isAttested(a) && isAttested(b)` asked whether two certificate objects had been
  // verified, never whether they had been verified for the bricks presenting them.
  const authenticated = certified && authenticatedFor(ba, store) && authenticatedFor(bb, store);
  const out = {
    subject: composeIdentity(op, a?.subject, b?.subject),                          // a canonical TERM, not a bag — CERT10
    analyzer: { name: 'compose', version: '0.2.0' },
    verdict: { certified, costClass },
    policy: { resourceDecision, reason: `composite of {${ca}, ${cb}} \u21d2 ${costClass}` }
  };
  // This module is the issuer of a composite it folded itself, so it may brand it — but only when
  // the evidence beneath it was already authenticated. That is the whole of CERT3.
  return authenticated ? brandOwn(out, store) : out;
}

// ---------------------------------------------------------------------------
// CC2 semiring quantities — confidence (product), cost (sum), latency (max). One identity
// {confidence:1, cost:0, latency:0} serves both operators (1 = ⊗-id, 0 = +-id and max-id over ℝ≥0).
// ---------------------------------------------------------------------------
const Q0 = () => ({ confidence: 1, cost: 0, latency: 0 });
const q = (b) => ({ ...Q0(), ...(b.q || {}) });

// Q0 IS AN IDENTITY, NOT A DEFAULT — the same lesson `*` and `V0()` each taught, arriving a third
// time on a third carrier (QX1–QX6, outside review 2026-08-22).
//
//     missing contract  ->  ANY      CD1–CD5
//     malformed Value   ->  V0()     CX7, VX1–VX5
//     malformed q       ->  Q0()     here
//
// `q:'nope'`, `q:42`, `q:[]` and a wholly ABSENT `q` all became `{confidence:1, cost:0, latency:0}`,
// so unreadable measurement evidence read as PERFECT CONFIDENCE, ZERO COST, ZERO LATENCY — the most
// favourable point in the lattice, handed out for saying nothing. Per field it was no better:
// `confidence:'high'` composed to NaN, `latency:'fast'` composed to NaN, and `cost:'free'` composed
// to the STRING `'free0'`, because `+` on a string concatenates.
//
// Q0 is the true identity of the CC2 semiring (1 for a product, 0 for a sum, 0 for a max) and it is
// the correct, MEASURED quantity for `id` and `&none`, which cost nothing. It is wrong for an
// ordinary brick that merely arrived without measurements, because there every component is a
// maximal CLAIM rather than a neutral value. The identities keep it by supplying it explicitly and
// passing the same validation as everyone else — they are not exempt, they simply qualify.
const Q_VALID = {
  confidence: (x) => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1,
  cost: (x) => typeof x === 'number' && Number.isFinite(x) && x >= 0,
  latency: (x) => typeof x === 'number' && Number.isFinite(x) && x >= 0,
};
// All three must be PRESENT and valid. A partial `q` is the same defect as an absent one for the
// components it omits, so it is not completed from defaults.
function unreadableQ(qq) {
  if (qq == null || typeof qq !== 'object' || Array.isArray(qq)) return true;
  return Object.entries(Q_VALID).some(([k, ok]) => !ok(qq[k]));
}
function composeQ(a, b) {
  return {
    confidence: a.confidence * b.confidence,
    cost: a.cost + b.cost,
    latency: Math.max(a.latency, b.latency)
  };
}

// ---------------------------------------------------------------------------
// MISSING ≠ UNIVERSAL (CD1–CD5, 2026-08-22). Until that day an ABSENT contract field was defaulted
// to '*' by Brick() and typeMatch() waved through null on either side, so an assembly that declared
// no interface received the MOST PERMISSIVE one in the algebra and every hand-off passed a check
// with nothing left to check. Fail-open, in a runtime whose entire claim is that it refuses.
//
// THE CONTRACT CARRIER. Four kinds, tagged, and every one of them representable.
//
//     {kind:'undeclared'}            nothing was said. Refuses.
//     {kind:'any'}                   a CLAIM: "anything". Directional — see below.
//     {kind:'types', values:[...]}   a specific set. [] is the empty set, and means nothing.
//     {kind:'var', name:'α'}         a polymorphic passthrough: whatever came in, unchanged.
//
// Was raw `undefined` for UNDECLARED and the bare string '*' for everything universal. Two problems,
// both raised on outside review and both real:
//
//   1. `undefined` is not representable. It does not survive JSON, so a contract could not appear
//      in a receipt, a hash, a provenance record, a replay artifact or a WRL world — precisely the
//      places this algebra is meant to end up. A carrier whose most important value vanishes at the
//      serialisation boundary is not a carrier. A magic string was rejected too: any in-band
//      sentinel can collide with a real type name.
//   2. ONE WILDCARD CANNOT MEAN TWO THINGS. '*' was doing duty as both "any possible output" and
//      "whatever came in" — and under the old intersection test those were indistinguishable, so
//      nothing forced the question. The subset test below separates them immediately:
//          ANY as an OUTPUT  = "I may emit anything"      ⇒ NOT safe into a narrow consumer
//          ANY as an INPUT   = "I accept anything"        ⇒ always safe
//          VAR α             = a FREE VARIABLE, unbound ⇒ refuses, like any unchecked claim
//      This last line said "⇒ safe either side; this is the identity" until 2026-08-22, and that
//      was CD8: `α` was implemented as an endpoint MATCHER rather than a BINDING, so the identity
//      laundered forbidden hand-offs. The identity is no longer typed into existence at all — it
//      is a distinguished TERM (see IDENTITY TERMS below), so `α` here is only ever an ordinary
//      brick's unbound variable, and unknown refuses.
export const UNDECLARED = Object.freeze({ kind: 'undeclared' });
export const ANY = Object.freeze({ kind: 'any' });
export const TYPES = (...vs) => Object.freeze({ kind: 'types', values: [...new Set(vs.flat())] });
export const VAR = (name = 'α') => Object.freeze({ kind: 'var', name });

// Legacy forms still arrive from JSON, from older callers and from tests that poke raw arrays onto
// a brick after construction. Normalisation is total and idempotent, and runs at every comparison
// rather than only at construction, so a raw value assigned later cannot bypass it.
// NEVER FILTER. Changed 2026-08-22 on outside review (CD10/CD11), and the deleted `.filter()` is
// the whole point: it took input the normaliser could not read, dropped the parts it did not
// understand, and returned what was left as a well-formed DECLARATION. For an output endpoint the
// residue was usually `TYPES()` — the empty set — and under the subset rule
//
//     ∅ ⊆ X   holds for every X
//
// so the least readable input in the algebra produced the MOST permissive output endpoint in it.
// `{kind:'types', values:[1,2,3]}`, a bare `42`, `[null]` and `{}` all composed into a narrow
// consumer that a correct reading would have refused.
//
// This is `missing → *` again with a different carrier. The tagged form fixed the REPRESENTATION
// of the old bug and left its META-ERROR untouched: unknown or malformed evidence being
// canonicalised into a stronger claim than the input justified. Filtering is that error in one
// line — it silently converts "I could not parse this" into "this parsed, and it said nothing".
//
// So: a malformed end is UNDECLARED, and UNDECLARED refuses on either side. Only an EXPLICITLY
// supplied empty set still means "emits nothing", because that is a claim someone made.
export function norm(t) {
  if (t == null) return UNDECLARED;
  if (t === '*') return ANY;
  if (typeof t === 'string') return TYPES(t);
  if (Array.isArray(t)) {
    // all-or-nothing: one unreadable element makes the whole list unreadable
    if (!t.every((v) => typeof v === 'string')) return UNDECLARED;
    return t.includes('*') ? ANY : TYPES(t);
  }
  if (typeof t === 'object' && typeof t.kind === 'string') {
    switch (t.kind) {
      case 'undeclared': return UNDECLARED;
      case 'any': return ANY;
      // an unnamed variable is not "α by default" — defaulting a name INVENTS the binding the
      // whole CD8 finding is about
      case 'var': return typeof t.name === 'string' ? VAR(t.name) : UNDECLARED;
      case 'types': return Array.isArray(t.values) && t.values.every((v) => typeof v === 'string')
        ? TYPES(t.values) : UNDECLARED;
      default: return UNDECLARED;                         // an unknown tag is not a claim
    }
  }
  return UNDECLARED;                                      // numbers, booleans, kindless objects
}
const isDeclared = (t) => norm(t).kind !== 'undeclared';

// ---------------------------------------------------------------------------
// COMPATIBILITY — Option U, ruled 2026-08-22 on outside review.
//
//     a |> b   is feasible iff   OUT(a) ⊆ IN(b)
//
// A SUBSET, not a non-empty intersection. The old test asked whether the producer and consumer had
// *something* in common, which is a question about existence when the safety property is universal:
// every type the producer may emit has to be one the consumer accepts. That gap is CD6 — a
// coalition handing off on behalf of a member that could not have handed off itself.
//
// Rejected alternatives, recorded because the ruling only means something next to them:
//   MEET — make the coalition's contract the INTERSECTION of its parts. Sound, but it hides real
//          outputs: if a emits U and b emits T, saying (a&b) emits U∩T forgets behaviour rather
//          than constraining it.
//   ROUTED — keep the permissive test and have the certificate record WHICH member the hand-off
//          went to. Probably the better eventual system, and deliberately NOT the default yet:
//          without a route witness it is the same unsoundness wearing an optimistic interpretation.
//          It lands later as an explicit |route> carrying {member, emitted, consumer}.
// A FREE VARIABLE IS NOT POLYMORPHISM. This line used to read
//
//     if (O.kind === 'var' || I.kind === 'var') return true;            // α passes through
//
// and it was unsound (CD8, found on outside review 2026-08-22). `α → α` means "whatever concrete
// type enters THIS instance is the type that leaves it" — a binding. What the code implemented was
// "either endpoint mentioning α is compatible with everything", which is a different and much
// stronger claim, and it let the identity LAUNDER a forbidden hand-off:
//
//     x emits U · d accepts T          x |> d          = 0̲     (correct)
//     insert the identity              x |> id |> d    = LIVE   (11 of 64 endpoint pairs)
//
// So `id` was not an identity of the contracted algebra at all: it changed feasibility. The
// value-preservation law (CD4) was green throughout, because it only ever asked about the value.
//
// The fix is NOT a stricter endpoint matcher. Making `var` directional the way ANY is would break
// the identity law instead of the soundness, because a var OUTPUT is genuinely unknown until it is
// bound, and an identity has to be usable on the right. The real object is unify/substitute:
//
//     U → α    establishes    α := U    so    U → id → T    reduces to    U → U → T    and refuses
//
// That is a type system, and it is deliberately NOT being built today. Instead the identity is a
// DISTINGUISHED ALGEBRAIC ELEMENT (see composePipe / composeAnd): `a |> ID = a` by construction,
// so it cannot change feasibility because it does not participate in the check. An UNBOUND `var`
// on any ordinary brick is then what it always was — a claim with no binding to check it against —
// and unknown refuses, exactly like UNDECLARED.
function subsetOf(out, inn) {
  const O = norm(out), I = norm(inn);
  if (O.kind === 'undeclared' || I.kind === 'undeclared') return false;  // unknown refuses, either side
  if (O.kind === 'var' || I.kind === 'var') return false;                // unbound ⇒ unknown ⇒ refuse
  if (I.kind === 'any') return true;                                     // consumer accepts anything
  if (O.kind === 'any') return false;                                    // producer MAY emit anything
  return O.values.every((t) => I.values.includes(t));                    // set containment
}

// ---------------------------------------------------------------------------
// & — OUTPUTS JOIN, INPUTS MEET. The coalition emits whatever ANY part may emit (so nothing is
// forgotten), and safely accepts only what EVERY part accepts (so nothing is over-promised).
// The old code unioned both, which over-promised the input side in exactly the way CD6 describes.
//
// Undeclaredness is ABSORBING under both: a coalition one of whose parts declared no interface has
// no declared interface either. Without it the union launders the absence, and the hand-off the
// declared partner could make is silently made on the undeclared one's behalf (CD3).
// `var` is ABSORBING in both, for the same reason UNDECLARED is: an unbound variable is not a
// checkable claim, and a coalition one of whose members made an uncheckable claim has not made a
// checkable one either.
//
// This also repairs commutativity (CD9). `meetIn` used to return "the other operand" when it met a
// variable, so two differently-named free variables gave
//
//     (a & b).accepts_from = VAR β        (b & a).accepts_from = VAR α
//
// and & — the operator this project calls the parallel/coalitional one, and proves commutative —
// projected an operand-order-dependent interface. No verdict differed at the time, because `var`
// matched everything anyway, which is exactly why nothing caught it: it was a latent bug held
// harmless by a second bug. Absorbing to UNDECLARED is symmetric, so the projection is now
// order-independent by construction rather than by luck.
function joinOut(a, b) {
  const A = norm(a), B = norm(b);
  if (A.kind === 'undeclared' || B.kind === 'undeclared') return UNDECLARED;
  if (A.kind === 'var' || B.kind === 'var') return UNDECLARED;
  if (A.kind === 'any' || B.kind === 'any') return ANY;
  return TYPES(A.values, B.values);
}
function meetIn(a, b) {
  const A = norm(a), B = norm(b);
  if (A.kind === 'undeclared' || B.kind === 'undeclared') return UNDECLARED;
  if (A.kind === 'var' || B.kind === 'var') return UNDECLARED;
  if (A.kind === 'any') return B;                        // ANY is the identity of meet
  if (B.kind === 'any') return A;
  return TYPES(A.values.filter((t) => B.values.includes(t)));
}

// ---------------------------------------------------------------------------
// total constructors — a Brick may be handed a PARTIAL or GARBAGE value/array by an
// external caller; the operators must never throw (fail-closed, directive 1). We normalize
// every untrusted field through a total constructor: a non-object / error value floors to
// the identity V0(), and array fields are coerced so combine/chain can never hit a
// non-iterable. (See compose-law CX6.)
// ---------------------------------------------------------------------------
const asArr = (x) => (Array.isArray(x) ? x : x == null ? [] : [x]);
// A DEFAULT IS JUSTIFIED BY ABSENCE — and by nothing else. It may not overwrite, reinterpret, or
// sit quietly beside an explicit malformed assertion. This is the refinement of the non-laundering
// principle that CD10/CD11/CX7 established for the contract carrier, applied per-FIELD to the
// semantic one, and it is a genuinely different line from the one drawn before:
//
//     ABSENT           →  documented default        {} and {beta:0.9} are legitimate partials
//     PRESENT + VALID  →  preserved
//     PRESENT + INVALID→  0̲                          {beta:'high'}, {pi:'wat'}, {kappa:'false'}
//
// The old rule asked only "is this an object at all", so `{beta:'high'}` spread over V0()'s
// defaults, stayed LIVE, and handed `beta = NaN` downstream — where the floor could not test it
// because no beta_min had been required. `{pi:'not-a-phase'}` could leave a composite carrying a
// phase `phaseIdx` has no index for. Spreading over defaults is what made both survivable: the
// default was there to fill a hole and instead excused a wrong answer.
const isFiniteNum = (x) => typeof x === 'number' && Number.isFinite(x);
const FIELD_VALID = {
  n: isFiniteNum,
  beta: (x) => isFiniteNum(x) && x >= 0 && x <= 1,
  kappa: (x) => typeof x === 'boolean',
  denyDefault: (x) => typeof x === 'boolean',
  pi: (x) => x === null || PHASES.includes(x),
  iota: (x) => x === null || typeof x === 'string',
  psi: (x) => x === null || typeof x === 'string',
  sigma: Array.isArray,
  authority: Array.isArray,
  audit: Array.isArray,
};
// `undefined` counts as ABSENT (it is what a missing key reads as), `null` does NOT except where a
// field's domain includes it — `{n:null}` is an assertion that n is null, and n is a real number.
function invalidValueField(v) {
  for (const [k, ok] of Object.entries(FIELD_VALID)) {
    if (!(k in v) || v[k] === undefined) continue;                 // absent ⇒ default applies
    if (!ok(v[k])) return k;
  }
  return null;
}

function normValue(v) {
  // null / non-object / a chain-error sentinel ⇒ the identity Value (empty, feasible). The BRICK
  // built on such a value is annihilated (CX7); this only keeps the carrier total so that nothing
  // downstream has to null-check a field.
  if (v == null || typeof v !== 'object' || v.error) return V0();
  // Arrays are still coerced, because a free-monoid field is genuinely a container and `{sigma:42}`
  // is a shape error rather than a false claim — but the shape is now CHECKED above, so a
  // non-array sigma annihilates instead of being silently wrapped.
  return V({ ...v, sigma: asArr(v.sigma), authority: asArr(v.authority), audit: asArr(v.audit) });
}

// ---------------------------------------------------------------------------
// Brick + the distinguished elements.
// ---------------------------------------------------------------------------
export function Brick(p = {}) {
  const o = p && typeof p === 'object' ? p : {};
  // ONCE. This is the hot path — every operand of every composition goes through it — and the fault
  // walk validates the subject term, so computing it twice (once for `refusal`, once for
  // `annihilated`) would double the cost of the most expensive check in the constructor.
  const fault = brickFault(o);
  return {
    id: typeof o.id === 'string' ? o.id : 'brick',
    holder: o.holder ?? null,
    // Contract ends are stored NORMALISED, so a brick always carries the tagged form regardless of
    // what a caller handed in. An absent (or null) field becomes {kind:'undeclared'} — it is NOT
    // defaulted to ANY; see the MISSING ≠ UNIVERSAL note above.
    contract: { accepts_from: norm(o.contract?.accepts_from), feeds_into: norm(o.contract?.feeds_into) },
    refusal: typeof o.refusal === 'string' ? o.refusal : fault,
    // NOTE THE ABSENCE. Brick() deliberately does NOT read an `identity` field off its input, and
    // there is no way to construct a privileged term through it — see the IDENTITY TERMS block
    // below. A previous version of this constructor did copy one, and CD12 is the falsifier for
    // what that allowed.
    value: normValue(o.value),
    // WHAT THIS BRICK IS, so that a certificate can bind to it (CERT9). Optional, and absence is
    // fail-closed rather than convenient: a brick that declares no artifact makes no claim about
    // its own identity, so no certificate can be bound to it and it can never satisfy an
    // `authenticated` floor. Until this field existed, "the certificate binds a subject" was a
    // statement made entirely INSIDE the certificate — one attested certificate authenticated two
    // unrelated bricks with different authority, because nothing connected the subject to the
    // thing it was supposedly the subject of.
    // PRESERVES the term (CERT17). This used to build `{kind, hash}`, which erased the structure a
    // composite needs to be composed AGAIN — the certificate survived by reference and the artifact
    // did not, so the two identities diverged at depth three.
    artifact: validSubject(o.artifact) ? copySubject(o.artifact) : null,
    cost: o.cost ?? UNCERTIFIED_COST(),                          // ABSENT ⇒ fail-closed default; MALFORMED ⇒ 0̲ below
    q: { ...Q0(), ...(o.q && typeof o.q === 'object' ? o.q : {}) },
    utility: typeof o.utility === 'number' ? o.utility : 0,
    laws: asArr(o.laws),
    floor: asArr(o.floor),
    // A value the runtime could not interpret makes the brick 0̲ (CX7). It used to floor to V0()
    // — the BENIGN identity value: feasible, acyclic, no conflict — so
    //
    //     "I cannot interpret this value"  became  "the harmless value"  and stayed LIVE.
    //
    // CX6 did not catch it and could not: CX6 asks for "0̲ or a valid Brick, never an exception",
    // and V0() is a valid Brick, so a fuzzer aimed at crashes was satisfied by the laundering.
    // Directive 1 says FAIL-CLOSED; the code had read it as DO-NOT-THROW. Not throwing is
    // necessary and is not sufficient — the floor for an uninterpretable value is 0̲.
    // FOUR carriers, one rule: unreadable evidence floors rather than defaulting to the most
    // favourable reading. `utility` is included because `typeof NaN === 'number'` and a NaN utility
    // silently poisons every ranking it enters. `cost` joined the list on 2026-08-22 — it had been
    // the one carrier stored without a single check on it (see malformedCert above).
    // A REFUSAL THE RUNTIME CANNOT EXPLAIN IS A REFUSAL NOBODY CAN ACT ON — the file's own rule
    // (see zeroBecause), and until now `Brick()` was the one place that broke it: it decided 0̲ from
    // a boolean disjunction and stored no reason, so every 0̲ arriving through construction was
    // mute. `brickFault` is that same disjunction returning WHICH carrier failed, so the reason is
    // derived from the decision rather than restated beside it — one rule, not two.
    annihilated: !!o.annihilated || fault !== null
  };
}

// Returns the first failing carrier, or null. The ORDER is the order the carriers were added, and
// only the first is reported: a brick with two malformed carriers is not more refused than one.
function brickFault(o) {
  if (unreadableValue(o.value)) return 'value: not a Value, or a present-and-invalid field (CX7/VX1–VX5)';
  if (unreadableQ(o.q)) return 'q: not a complete {confidence, cost, latency} — Q0 is an identity, not a default (QX1–QX6)';
  if (unreadableCost(o.cost)) return `cost: ${malformedCert(o.cost) ?? 'declares its own authentication'}`;
  // PRESENT + INVALID ⇒ 0̲, the same rule the other carriers follow. An absent artifact is a
  // documented absence; a malformed one is a false claim about identity.
  if (o.artifact != null && !validSubject(o.artifact))
    return 'artifact: ' + (Array.isArray(o.artifact?.term)
      ? (termFault(o.artifact.term) ?? 'the term is not in normal form, or the hash is not its canonical serialisation')
      : 'a LEAF subject is {kind, hash} with a non-empty kind and hash and no term');
  // `undefined` is ABSENT and defaults to 0 — the additive identity of utility, and the LEAST
  // favourable value, so defaulting it claims nothing. `null` is an assertion that utility is
  // null, and utility is a number; same line the Value carrier draws for `{n:null}`.
  if (!(o.utility === undefined ? true : typeof o.utility === 'number' && Number.isFinite(o.utility)))
    return 'utility: present and not a finite number';
  return null;
}

// Absent, non-object, array, or error-sentinel. A PARTIAL object (`{beta:0.9}`) is deliberately NOT
// unreadable — its fields are readable and the rest take documented defaults, which is the total
// constructor CX6 tests. The line is between "incomplete" and "not a Value at all".
function unreadableValue(v) {
  if (v == null || typeof v !== 'object' || Array.isArray(v) || v.error) return true;
  // ...and now the per-FIELD half: a value that IS an object but carries an explicitly invalid
  // field is malformed evidence, not an incomplete one. See FIELD_VALID above (VX1–VX5).
  return invalidValueField(v) !== null;
}

// 0̲ — the absorbing zero of BOTH operators (an annihilated branch).
export const ZERO = Object.freeze(Brick({
  id: '0̲', annihilated: true,
  value: V({ sigma: ['annihilated'] }),
  cost: UNCERTIFIED_COST(),
  q: { confidence: 0, cost: Infinity, latency: Infinity },
  utility: 0
}));
export const isZero = (b) => !b || b === ZERO || b.annihilated === true;

// A zero that says WHY. Structurally a zero in every respect isZero() tests, so it absorbs and
// floors exactly like ZERO; it differs only in carrying the refusal reason out to a caller that
// wants to render it. A refusal the runtime cannot explain is a refusal nobody can act on.
const zeroBecause = (reason) => Object.freeze(Brick({
  id: '0̲', annihilated: true, refusal: reason,
  value: V({ sigma: ['annihilated'] }), cost: UNCERTIFIED_COST(),
  q: { confidence: 0, cost: Infinity, latency: Infinity }, utility: 0
}));

// &none — identity for &.   id — identity (typed pass-through) for |>.   Both cost nothing.
// Both DECLARE '*' explicitly, and that is load-bearing rather than incidental: under MISSING ≠
// UNIVERSAL an identity that merely omitted its contract would be undeclared, would refuse
// everything, and CA4/CP2 would fail. The identity laws survive the fix because these two make the
// universal CLAIM — which an identity is entitled to make — not because absence is treated as one.
// CD4 states both halves: identity on declared bricks, 0̲ on undeclared ones.
// &none is the TWO-SIDED identity of & under the new semantics, and now actually types as one:
// ANY is the identity of meet (inputs), the empty set is the identity of join (outputs). Under the
// old union-both rule no single value could be identity for both, and nothing noticed because CA4
// only compares the value carrier.
// ---------------------------------------------------------------------------
// IDENTITY TERMS — distinguished elements, not privileged bricks.
//
// A compose term is one of: a Brick, the |> identity, the & identity, or 0̲. The identities are
// SINGLETONS, frozen at module load, and recognised by REFERENCE. That is the whole mechanism, and
// it is chosen because reference identity is the one property a caller cannot forge by writing
// data.
//
// The previous design brandeded them with an ordinary `identity: '|>'` field on Brick(). The
// comment beside it correctly argued that comparing the NAME `'id'` would be forgeable — and then
// replaced a forgeable name with a forgeable FIELD, which is the same thing wearing a schema. An
// uncertified brick held by an attacker declared the privilege and both operators short-circuited
// past every floor they have (CD12).
//
// SERIALISABILITY AND AUTHENTICITY ARE DIFFERENT REQUIREMENTS, and conflating them is what caused
// this. The term must survive JSON — receipts, hashes, replay artifacts and WRL worlds all cross
// that boundary — but "must survive serialisation" never implied "ordinary data may assert
// privileged algebraic status". So the terms serialise to a CANONICAL TAG carrying nothing else:
//
//     {"kind":"pipe_identity"}        not   {"kind":"brick","identity":"|>","holder":"attacker",…}
//
// and `decodeTerm()` is the ONLY route from data back to the privilege. It reads the tag and
// returns the singleton, discarding whatever else the encoding claimed; anything that is not a
// bare tag becomes an ordinary Brick with no privilege at all.
// TRANSITIVE IMMUTABILITY (CD14, outside review 2026-08-22). `Object.freeze` is SHALLOW, and the
// exemption in ensure() below justified itself with "they are provably unchanged" — a proof nobody
// had actually done. Measured:
//
//     Object.isFrozen(idBrick())                    true
//     Object.isFrozen(idBrick().value)              false
//     Object.isFrozen(idBrick().value.authority)    false
//     Object.isFrozen(idBrick().cost)               false
//
// So the top-level freeze blocked REPLACING `id.cost` and permitted writing THROUGH it, and the
// write was process-global and permanent: `idBrick().cost.verdict.certified = false` poisoned the
// singleton for every later composition in the process. Combined with the operator-mismatch route
// below, a caller could push onto `none().value.authority` and collect a certified free
// authority-bearing operand out of the algebra's own unit.
// CYCLE DETECTION USES A `seen` SET, NOT `isFrozen`. The first draft short-circuited on
// `!Object.isFrozen(o)` — which is a shallow-freeze hiding inside a deep one, the very bug this
// function exists to remove, one level down. `TYPES()` returns an object that IS frozen and whose
// `values` array is NOT, so the walk stopped at the contract end and left the array writable. CD14
// caught it on its first run. A visited-marker must record what the walk has SEEN, never a property
// that some other code may have set for its own reasons.
// ITERATIVE, and it reads DESCRIPTORS rather than properties. Recursion made the freeze walk
// stack-bounded on exactly the data the budget above exists to bound; reading `o[k]` INVOKED any
// getter on the way past, so the function whose job is to make an object incapable of changing its
// answers was itself asking it questions.
const deepFreeze = (o) => {
  const stack = [o];
  const seen = new Set();
  while (stack.length) {
    const x = stack.pop();
    if (!x || typeof x !== 'object' || seen.has(x)) continue;
    seen.add(x);
    Object.freeze(x);
    for (const k of Object.getOwnPropertyNames(x)) {
      const d = Object.getOwnPropertyDescriptor(x, k);
      if (d && 'value' in d) stack.push(d.value);
    }
  }
  return o;
};

const identityTerm = (kind, id, contract) => {
  const cost = FREE_COST();
  // The units declare their own artifact, so `authenticatedFor` holds of them the same way it holds
  // of anything else. A distinguished term that could not satisfy the property it is exempt from
  // checking would be one more special case to reason about.
  return deepFreeze({ ...Brick({ id, value: V0(), cost, q: Q0(), contract,
    artifact: { kind: cost.subject.kind, hash: cost.subject.hash } }), kind });
};

const AND_IDENTITY = identityTerm('and_identity', '&none', { accepts_from: ANY, feeds_into: TYPES() });
export const none = () => AND_IDENTITY;
// id is DISTINGUISHED (`identity: '|>'`), and still declares α → α so a receipt can say what it is.
// The contract is now documentation rather than the mechanism: composePipe short-circuits on the
// brand, so the identity never reaches subsetOf and therefore cannot change what a pipeline is
// allowed to do. That is the CD8 fix. It was previously an ORDINARY brick relying on `var`
// matching everything, which is what made `x |> id |> d` compose where `x |> d` refused.
const PIPE_IDENTITY = identityTerm('pipe_identity', 'id', { accepts_from: VAR('α'), feeds_into: VAR('α') });
export const idBrick = () => PIPE_IDENTITY;

// REFERENCE equality. Not the name (`'id'` is a string any caller may choose), not a field
// (`identity:'|>'` is data any caller may write) — the object itself. There is exactly one of each
// in a process, they are created here and nowhere else, and `decodeTerm` is the only door from
// serialised data to one of them.
const identityOp = (b) => (b === PIPE_IDENTITY ? '|>' : b === AND_IDENTITY ? '&' : null);
const isIdentityFor = (b, op) => identityOp(b) === op;

// AN IDENTITY TERM HAS SEMANTICS ONLY UNDER ITS OWN OPERATOR (CD15/CD16, outside review
// 2026-08-22). Until that day the units were half distinguished-term and half privileged brick:
// recognised under their own operator, and silently demoted to an ORDINARY BRICK under the other —
// where they carried their Value, their holder, and above all their FREE_COST straight into a
// composite. That hybrid is what turned a shallow freeze into an authority forgery.
//
//     &none under &   → recognised as the unit → harmless
//     &none under |>  → NOT the |> unit        → an ordinary certified free brick
//
// The ruling is not "deep-freeze and carry on". Freezing removes today's payload and leaves the
// route open; the route is the defect. THE UNIT OF ONE OPERATOR IS NOT AN ELEMENT OF THE OTHER'S
// ALGEBRA, and this is the standard situation rather than a local invention: a DUOIDAL category
// carries two monoidal structures with DISTINCT units, and the only lawful relationship between
// them is an explicitly declared structure map I → J. Absent that map there is no meaning to
// assume — which is this file's own MISSING ≠ UNIVERSAL rule, arriving at the term level.
//
// The type carrier agrees and could never have enforced it. `&none.feeds_into` is TYPES() — the
// EMPTY SET — and the empty set is a subset of everything, so `&none |> f` passes the subset test
// vacuously for every f. Type-theoretically correct, algebraically wrong: a term that denotes the
// empty combination produces nothing, so there is no hand-off to check. This is the CD8 lesson
// restated — the identity must not be typed into existence, and it must not be typed out of it
// either. It is a term-level rule or it is nothing.
const isForeignIdentity = (b, op) => { const o = identityOp(b); return o !== null && o !== op; };

// A COUNTERFEIT is an object carrying an identity's canonical tag that is NOT the singleton. There
// is exactly one way to make one: take a real identity across a realm/worker/JSON boundary WITHOUT
// encodeTerm, so the tag survives the copy and the reference does not. It must not compose as an
// ordinary brick — it arrives holding an attested-looking FREE_COST and a contract that is pure
// documentation — and it must not be silently accepted either. It is a transport bug at the call
// site, and the refusal says so (CD17).
const isCounterfeitIdentity = (x) =>
  !!x && typeof x === 'object' && identityOp(x) === null &&
  (x.kind === 'pipe_identity' || x.kind === 'and_identity');

// The ONLY route from data to a privileged term. Everything that is not a bare canonical tag
// becomes an ordinary Brick — including an object that carries the tag AND a payload, because a
// term that also claims a holder, a cost and a contract is not the identity, it is something
// pretending to be it. Fails closed by construction rather than by check.
export function decodeTerm(j) {
  if (j && typeof j === 'object' && !Array.isArray(j)) {
    const keys = Object.keys(j);
    if (keys.length === 1 && keys[0] === 'kind') {
      if (j.kind === 'pipe_identity') return PIPE_IDENTITY;
      if (j.kind === 'and_identity') return AND_IDENTITY;
    }
  }
  return Brick(j);
}
// The canonical encoding: a tag and nothing else, so the decoder above accepts it.
export const encodeTerm = (t) =>
  t === PIPE_IDENTITY ? { kind: 'pipe_identity' }
  : t === AND_IDENTITY ? { kind: 'and_identity' }
  : t;

const holders = (a, b) => {
  // provenance is a SET of holders — flatten any already-composite holder so the union stays
  // flat and the operator stays associative & commutative (a nested holder breaks both laws).
  const flat = [a.holder, b.holder].flatMap((h) => (h == null ? [] : Array.isArray(h) ? h : [h]));
  const hs = [...new Set(flat)];
  return hs.length === 0 ? null : hs.length === 1 ? hs[0] : hs;
};

// ensure an operand is a well-formed brick before composing. A proper brick (incl. ZERO and the
// identity bricks) passes through untouched — preserving object identity so isZero(ZERO) holds;
// any partial/garbage operand is routed through the total Brick() constructor (fail-closed).
// CANONICALISE AT THE BOUNDARY. This used to be
//
//     const ensure = (x) => (isBrickShaped(x) ? x : Brick(x));
//
// and "looks brick-shaped" is a SHAPE test, not a validity one. A raw object carrying
// `value.beta = 'high'` satisfied it and went through untouched, so `Brick(raw)` was 0̲ while
// `raw |> ID` was LIVE — the constructor was correct and the operator boundary went around it
// (CD13). Mutating a legitimate brick after construction did the same, because bricks are mutable
// and nothing re-checked on the way in.
//
// Every operand is now canonicalised. `Brick()` is idempotent on an already-canonical brick and it
// re-runs the field validation, so this closes the raw-object route and the mutate-after-construct
// route with one rule instead of two. The identity TERMS are returned by reference because they are
// frozen singletons that cannot have been mutated — they are the only objects exempt, and they are
// exempt because they are provably unchanged, not because they looked right.
const isBrickShaped = (x) =>
  x && typeof x === 'object' && x.contract && x.value && Array.isArray(x.value.sigma) && x.cost && x.q && typeof x.id === 'string';
const ensure = (x) =>
  identityOp(x) !== null ? x                                     // the singletons — now DEEP-frozen, so the exemption is finally earned
  : isCounterfeitIdentity(x) ? zeroBecause('identity-not-transported — cross a boundary with encodeTerm/decodeTerm, not a raw copy')
  : Brick(x);

// ---------------------------------------------------------------------------
// THE DECLARED FLOOR, ACTUALLY APPLIED. `floor` has been on every brick since the first draft:
// stored by Brick(), unioned into every composite, threaded through the whole algebra — and never
// once READ. `floored()` took a `floorReqs` argument that neither operator ever passed. A brick
// could declare `floor: ['authenticated']` and the runtime would carry the requirement faithfully
// into every descendant while enforcing none of it. A requirement that is propagated but not
// applied is worse than one that is absent: it reads, in a receipt, exactly like a satisfied one.
//
// Tokens are a CLOSED set and an unrecognised one REFUSES. That direction is the whole point: a
// brick demanding `floor: ['signed-by-treasury']` from a runtime that has never heard of it must
// not have the demand quietly dropped. Fail-closed means the unknown requirement is unmet, not
// unnoticed (AD5).
const FLOOR_TOKENS = {
  sigma_empty:   (r) => { r.sigma_empty = true; },               // the two defaults, declarable explicitly
  acyclic:       (r) => { r.acyclic = true; },
  bound:         (r) => { r.bound = true; },                     // the brick must declare WHAT IT IS, not merely not contradict its evidence
  authenticated: (r) => { r.authenticated = true; },             // ...and the certificate must be branded, not merely presented
};
function floorReqsFrom(tokens) {
  const reqs = { sigma_empty: true, acyclic: true };
  const unknown = [];
  for (const t of asArr(tokens)) { const f = FLOOR_TOKENS[t]; if (f) f(reqs); else unknown.push(String(t)); }
  return { reqs, unknown };
}

// The floor every operator shares: a composed value that still carries an unresolved conflict, a
// cycle, or an uncertified cost collapses to 0̲ — utility cannot resurrect it.
//
// Returns a REASON or null, rather than a boolean. The callers already wanted to name the refusal
// and were reverse-engineering it from `cost.verdict.certified === false`, which could only ever
// produce two of the reasons this function actually decides between.
function floored(value, cost, floorTokens, artifact, store = DEFAULT_STORE) {
  if (cost?.verdict?.certified !== true) return 'uncertified';   // uncertified ⇒ 0̲ (conservative rule)
  if (!KNOWN_COST(cost.verdict.costClass)) return 'cost-class-unknown';   // CERT5 — certifying ignorance certifies nothing
  // CERT7 — A CERTIFICATE THAT SAYS "DO NOT ADMIT THIS" IS NOT ADMITTED. The floor read the verdict
  // and never the policy, so `{certified:true, costClass:'poly', resourceDecision:'annihilate'}`
  // was admitted and composed LIVE: the certificate's own instruction was the one field nobody
  // consulted. `escalate` and `budget_check` do NOT floor — they are live-with-an-obligation, and
  // composeCost carries them up at full strength (CERT6) rather than downgrading them here.
  if (cost.policy?.resourceDecision === 'annihilate') return 'policy-annihilate';
  // MISBOUND EVIDENCE REFUSES AT THE BASELINE (CERT21). A PRESENT artifact that disagrees with the
  // certificate's subject is a contradiction, not an absence, and this file has drawn that line on
  // four carriers already: ABSENT takes a documented default, PRESENT + INVALID is 0̲. An absent
  // artifact is a brick that has not said what it is — incomplete, and unable to satisfy `bound` or
  // `authenticated` — while a present-and-different one asserts two incompatible identities at once.
  if (artifact && !sameSubject(artifact, cost.subject))
    return `certificate-misbound: this brick claims to be ${briefly(artifact)} and carries evidence about ${briefly(cost.subject)}`;
  const { reqs, unknown } = floorReqsFrom(floorTokens);
  if (unknown.length) return `floor-requirement-unrecognized:${unknown[0]}`;
  // `bound` is the baseline rule turned into a positive REQUIREMENT: the brick must actually declare
  // what it is, rather than merely not contradicting its evidence.
  if ((reqs.bound || reqs.authenticated) && !artifact)
    return 'certificate-unbound: this brick declares no artifact for a certificate to bind';
  if (reqs.authenticated) {
    if (!isAttested(cost, store)) return 'certificate-presented-not-authenticated';
    // ...and it must be authenticated FOR THIS ARTIFACT. Attestation without binding establishes
    // "this certificate object was verified", never "verified for this thing" (CERT9). The
    // comparison is on the COMPLETE subject: `hash` alone let {world-revision, H} clear a floor with
    // a certificate for {weave-ir, H} (CERT13). The mismatch case is already refused above, at the
    // baseline — authentication now only adds the attestation requirement on top of binding.
  }
  return consume(value, reqs).ok ? null : 'floor';               // forbidden / cyclic / unresolved ⇒ 0̲
}

// ---------------------------------------------------------------------------
// THE CARRIER, AND WHAT IS ALLOWED INTO IT (AD1–AD3, outside review 2026-08-22).
//
//     RawBrick  --Brick()-->  CanonicalBrick  --the floor-->  AdmittedBrick | 0̲  --> the algebra
//
// `LIVE` was doing duty for two different things, and separating them is what makes the identity
// question answerable instead of a matter of taste:
//
//     structurally valid   Brick() could read every field
//     ADMITTED             the shared floor lets it through
//
// An uncertified brick is structurally perfect and unadmitted. Real composition already knew that —
// `u |> f` is 0̲ — and the identity did not: `u |> ID` returned `u`, LIVE, because the identity
// short-circuits before the floor. So the ONE route through the algebra that applied no floor was
// the element whose entire job is to change nothing.
//
// State it as closure and it stops being a philosophical question. The anchor law of this runtime
// is "a brick of bricks is a brick"; `u |> ID` took a non-carrier element and returned a non-carrier
// element out of a composition. The algebra was not closed. Identity laws quantify over the
// CARRIER — `a ⊗ e = a` says nothing about objects that are not elements — so restricting them
// costs no law and buys closure.
//
// The line is drawn AT THE FLOOR and nowhere else, which keeps CD4b's genuine improvement intact:
// UNDECLARED is not a floor condition, so `undeclared |> ID = undeclared` still holds, and that
// brick still refuses at its next real hand-off exactly as before. Uncertified IS a floor
// condition, so it floors here as it floors everywhere else.
export function admitted(x, store = DEFAULT_STORE) {
  const b = ensure(x);
  return !isZero(b) && floored(b.value, b.cost, b.floor, b.artifact, store) === null;
}
// 0̲ ABSORBS, AND SAYS WHY IT ARRIVED. `if (isZero(a) || isZero(b)) return ZERO` discarded the
// refusal an operand was already carrying — including the ones ensure() mints, so the transport
// diagnostic below (CD17) reached the caller as a bare, unexplained zero. The file already argues
// that "a refusal the runtime cannot explain is a refusal nobody can act on" (zeroBecause); the
// absorbing rule was the one place that threw the explanation away. Structurally identical to ZERO
// in everything isZero() tests, so absorption is unchanged.
const absorb = (a, b) => {
  if (!isZero(a) && !isZero(b)) return null;
  const why = (isZero(a) && a?.refusal) || (isZero(b) && b?.refusal) || null;
  return why ? zeroBecause(why) : ZERO;
};

// `a |> ID` and `a & &none` route through here: the operand is returned ITSELF when it is a carrier
// element (CD4/CD13's canonical form), and refused with the floor's own reason when it is not.
const throughIdentity = (x, store = DEFAULT_STORE) => {
  const why = floored(x.value, x.cost, x.floor, x.artifact, store);
  return why ? zeroBecause(why) : x;
};

// ---------------------------------------------------------------------------
// &  — combine (parallel). Lattice merge of capabilities; holder-tagged; cost & quantities accrue.
// ---------------------------------------------------------------------------
export function composeAnd(a, b, store = DEFAULT_STORE) {
  a = ensure(a); b = ensure(b);                                 // canonicalise, THEN test — see composePipe
  const absorbed = absorb(a, b); if (absorbed) return absorbed;  // 0̲ absorbs — carrying its reason out
  // The |> unit is not an element of &'s algebra — CD15. Checked BEFORE the identity short-circuit,
  // because the whole defect was the foreign unit falling through to the ordinary-brick path.
  if (isForeignIdentity(a, '&') || isForeignIdentity(b, '&')) return zeroBecause('identity-operator-mismatch');
  // &none is the identity BY CONSTRUCTION — see composePipe for the argument.
  if (isIdentityFor(b, '&')) return throughIdentity(a, store);
  if (isIdentityFor(a, '&')) return throughIdentity(b, store);
  const value = combine(a.value, b.value);
  const cost = composeCost(a, b, '&', store);
  // CERT16 — THE ARTIFACT IS DERIVED FROM THE OPERANDS' ARTIFACTS, INDEPENDENTLY OF THE CERTIFICATE.
  // It used to be `{...cost.subject}`: the evidence manufactured the identity of the thing it was
  // supposedly evidence for, which makes any misbinding self-ratifying. Both identities are now
  // computed by the same rule over different inputs, so they coincide exactly when each operand's
  // certificate was bound to its own artifact — and diverge, visibly, when one was not.
  const artifact = composeIdentity('&', a.artifact, b.artifact);
  const why = floored(value, cost, [...a.floor, ...b.floor], artifact, store);  // the DECLARED floor, unioned and applied
  if (why) return zeroBecause(why);
  return Brick({
    id: `(${a.id} & ${b.id})`,
    artifact,
    holder: holders(a, b),
    contract: { accepts_from: meetIn(a.contract.accepts_from, b.contract.accepts_from),
                feeds_into: joinOut(a.contract.feeds_into, b.contract.feeds_into) },
    value,
    cost,
    q: composeQ(q(a), q(b)),
    utility: a.utility + b.utility,
    laws: [...new Set([...a.laws, ...b.laws, 'CC2.&'])],
    floor: [...new Set([...a.floor, ...b.floor])]
  });
}

// ---------------------------------------------------------------------------
// |> — pipeline (sequence). Governed, phase-graded, type-checked hand-off. The operator CC1 left
// lawless. A type mismatch, a backward phase, or an uncertified/forbidden step IS the zero.
// ---------------------------------------------------------------------------
export function composePipe(a, b, store = DEFAULT_STORE) {
  // CANONICALISE, THEN TEST. The zero check used to run FIRST, against the operand as handed in —
  // so a mutated brick whose `annihilated` flag was still false from construction passed it, and
  // the canonicalisation that would have caught it happened on the next line with nothing left to
  // re-check. `Brick(victim)` was 0̲ and `partner |> victim` was LIVE. Found by this repo's own
  // mutation gate after CD13 fixed only the other half of the boundary.
  a = ensure(a); b = ensure(b);                                 // total operands ⇒ never throw
  const absorbed = absorb(a, b); if (absorbed) return absorbed;  // 0̲ absorbs — carrying its reason out
  // The & unit is not an element of |>'s algebra — CD15. See the note beside isForeignIdentity:
  // `&none` denotes the EMPTY COMBINATION, which produces nothing, so there is no hand-off to check
  // and the vacuous subset test below would have waved it through.
  if (isForeignIdentity(a, '|>') || isForeignIdentity(b, '|>')) return zeroBecause('identity-operator-mismatch');
  // ID IS A DISTINGUISHED ELEMENT: `a |> ID = a`, returning the operand ITSELF rather than a copy
  // that has been through the contract check. This is the CD8 fix, and it is the whole of it —
  // an element that does not participate in feasibility cannot change feasibility, which is what
  // "identity of this algebra" has to mean and what `α`-as-universal-matcher never delivered.
  //
  // It also TOTALISES the identity. CD4b used to state a deliberately narrowed domain — id
  // composed with an UNDECLARED brick was 0̲ — but that narrowing existed only because id was an
  // ordinary brick whose contract had to be consulted. `a |> ID = a` is sound for undeclared `a`
  // too: the result IS `a`, it has gained nothing, and it will refuse at its next real hand-off
  // exactly as before. CD4b is restated rather than deleted.
  //
  // RESTRICTED TO THE CARRIER 2026-08-22 (AD2/AD3). `return a` applied no floor, so the identity was
  // the one operation in the algebra that admitted what every other operation refuses — see the
  // carrier note above throughIdentity().
  if (isIdentityFor(b, '|>')) return throughIdentity(a, store);
  if (isIdentityFor(a, '|>')) return throughIdentity(b, store);
  if (!subsetOf(a.contract.feeds_into, b.contract.accepts_from)) {
    // Two distinct refusals, deliberately not collapsed: a MISMATCH is two declared interfaces that
    // disagree — a fact about the parts. An UNDECLARED side is the absence of a fact, and the fix
    // that produced it is the one an operator most needs to see named.
    return zeroBecause(isDeclared(a.contract.feeds_into) && isDeclared(b.contract.accepts_from)
      ? 'contract-mismatch' : 'contract-undeclared');
  }
  const chained = chain(a.value, b.value);
  if (chained.error) return zeroBecause('phase-violation');     // π-violation (backward phase) ⇒ 0̲
  const cost = composeCost(a, b, '|>', store);
  const artifact = composeIdentity('|>', a.artifact, b.artifact); // see composeAnd — CERT16
  const why = floored(chained, cost, [...a.floor, ...b.floor], artifact, store);  // the DECLARED floor, unioned and applied
  if (why) return zeroBecause(why);
  return Brick({
    id: `(${a.id} |> ${b.id})`,
    artifact,
    holder: holders(a, b),
    contract: { accepts_from: a.contract.accepts_from, feeds_into: b.contract.feeds_into }, // external interface
    value: chained,
    cost,
    q: composeQ(q(a), q(b)),
    utility: a.utility + b.utility,
    laws: [...new Set([...a.laws, ...b.laws, 'CC2.|>'])],
    floor: [...new Set([...a.floor, ...b.floor])]
  });
}

// ---------------------------------------------------------------------------
// composeTree — fold an AST of { op:'&'|'|>', a, b } (leaves are bricks) into one brick.
// ---------------------------------------------------------------------------
// A ONE-LEAF TREE IS STILL A COMPOSITION (TREE1/TREE2). The leaf case was `return node` — the
// caller's object, unexamined, straight back out of a function that promises a composed brick:
//
//     composeAnd(raw, x)   →  ensure → Brick → floor
//     composePipe(raw, x)  →  ensure → Brick → floor
//     composeTree(raw)     →  raw
//
// so `composeTree({id:'raw', cost:{nonsense:true}})` returned that object with no Value, no
// contract and no certificate, and `composeTree(42)` returned 42. This is the identity-route defect
// the file has closed three times already (CD13's raw operand, CD4b's pass-through, `ensure`
// itself): ONE PUBLIC ROUTE SKIPS THE CARRIER BOUNDARY BECAUSE "NOTHING HAPPENED". Nothing
// happening is not a reason to admit something that was never admissible.
//
// The correct identity operation on a single leaf is the one the algebra already defines —
// `a |> ID` — so the leaf takes exactly that path: `ensure` canonicalises it and the shared floor
// decides. A live brick comes back canonical; anything else comes back 0̲ WITH ITS REASON, which is
// why `ensure`'s own refusal is preserved rather than re-floored into a generic 'uncertified'.
// A DEPTH CEILING IS NOT A WORK CEILING (TREE3/TREE4, eleventh review). The previous round bounded
// this fold's DEPTH and the handoff said it "took the same ceiling" as the term budget. It did not:
// depth is the only thing depth bounds, and an AST is a graph, so a SHARED child is re-folded once
// per path that reaches it. Twenty-three objects is an exponential:
//
//     let t = leaf; for (i<22) t = {op:'&', a:t, b:t}     23 objects
//     composeTree(t)                                      4,194,304 folds · 112 s
//
// Nothing refused it. The term budget eventually refuses the RESULT — the `&` normal form is flat,
// so the term grows as 2^k too — but only after the work has been done, which is the wrong end of
// the transaction. The declared budget now counts LOGICAL NODES VISITED, which is the quantity that
// actually costs something.
//
// SHARING IS NOT DEDUPLICATED, deliberately. `&` is idempotent on the capability lattice and is NOT
// idempotent on cost or quantities — they accrue (CA1/CA3) — so `x & x` is not `x`, and memoising a
// shared node would silently change the arithmetic. A DAG here is a TREE that happens to share
// storage; the budget prices it as the tree it denotes.
//
// THE OPERATOR IS CHECKED BEFORE THE DESCENT. It used to be checked after both children had been
// folded, so an unknown operator at the ROOT bought arbitrary valid subwork — 14 s in the witness —
// before the runtime discovered that the thing it was working for was never admissible.
export function composeTree(node, store = DEFAULT_STORE) {
  // Iterative post-order. The recursion was bounded but still a recursion, which was recorded as
  // open at the end of the previous round; the work budget is the part that mattered and this is
  // the natural place to close both.
  let work = 1;                                                  // the root is the first logical node
  const overBudget = () => zeroBecause(
    `compose-tree-over-budget: more than ${TERM_BUDGET.maxFoldNodes} nodes folded ` +
    '(a shared child is folded once per path that reaches it — & does not deduplicate, because cost and quantities accrue)');
  const stack = [{ n: node, i: 0, kids: [] }];
  let result = null;
  while (stack.length) {
    const f = stack[stack.length - 1];
    if (stack.length > TERM_BUDGET.maxDepth)
      return zeroBecause(`compose-tree-over-budget: nesting deeper than ${TERM_BUDGET.maxDepth}`);
    const op = f.n == null ? null : f.n.op;
    if (op == null) {                                            // leaf brick (or null, or garbage)
      const leaf = ensure(f.n);
      result = isZero(leaf) ? leaf : throughIdentity(leaf, store);
      stack.pop();
    } else if (op !== '&' && op !== '|>') {
      throw new Error(`unknown compose op: ${typeof op === 'string' ? op : typeof op}`);
    } else if (f.i < 2) {
      if (++work > TERM_BUDGET.maxFoldNodes) return overBudget();
      f.i++;
      stack.push({ n: f.i === 1 ? f.n.a : f.n.b, i: 0, kids: [] });
      continue;
    } else {
      result = op === '&' ? composeAnd(f.kids[0], f.kids[1], store) : composePipe(f.kids[0], f.kids[1], store);
      stack.pop();
    }
    if (stack.length) stack[stack.length - 1].kids.push(result);
  }
  return result;
}

// ---------------------------------------------------------------------------
// A RUNTIME OWNS ITS ATTESTATION STORE. The module-level operators use a default store, which is
// what an application gets if it never asks for isolation and is exactly the previous behaviour.
// A host that needs the security root NOT to be ambient constructs its own:
//
//     const rt = createComposeRuntime({ verify: checkSignature });
//     const cert = rt.verifyAndAttest(raw, { kind: 'weave-ir', hash });
//     rt.composePipe(a, b);        // attestation is read from THIS runtime's store
//
// Two runtimes in one process share no authentication state: a certificate attested by one is
// merely presented to the other. That is the property that matters once the same brand carries WORLD
// revisions and authority delegations, and it is why "module-instance-order security" was only ever
// a stated limitation rather than a design.
//
// The identity terms are module singletons whose free certificate is branded into the default store
// at load, so each runtime adopts them explicitly — a unit that could not satisfy the property it is
// exempt from checking would be one more special case to reason about (see identityTerm).
// ---------------------------------------------------------------------------
// THE HOSTILE-DATA BOUNDARY IS ONE NAMED DOOR, NOT EVERY DOOR (eleventh review, 2026-08-23).
//
// CERT28 made certificate verification snapshot-first, and outside review then asked the obvious
// next question: is "inert first" a property of THIS ROUTE, or of PUBLIC INGRESS? It was the route.
// Ordinary construction still ran caller-owned behaviour and could be made to throw:
//
//     Brick({get cost(){ throw }})                     the getter runs
//     term element with a throwing Symbol.toPrimitive  the VALIDATOR throws
//     composeTree({get op(){ throw }})                 the getter runs
//
// There are two coherent answers and they are not both available. Either every public function
// snapshots — which makes `Brick()` allocate a deep copy on every call, in an algebra whose whole
// point is folding millions of them — or the boundary is DECLARED, and one function owns it.
//
//     Brick / composeAnd / composePipe / composeTree      TRUSTED CONSTRUCTION.
//         In-process values you already own. They read the fields you hand them, and an exotic
//         value that runs code when read will run it. This is the same contract every ordinary
//         JavaScript constructor has, stated rather than assumed.
//
//     adopt(raw)                                         THE OBJECT ROUTE (see CERT39 — the
//                                                        HOSTILE boundary is ingestJSON).
//         Anything off a wire, out of a store, across a realm, or from a peer. Snapshots to inert
//         plain data first, then constructs. Returns a Brick or 0̲ WITH A REASON — it does not
//         throw, whatever it is handed.
//
// The declaration is the deliverable, because the previous state was worse than either answer: an
// undocumented mixture, where one route had been hardened and the others were assumed to have been.
// WORLD accepts `ingest` output only — an admission decided about a brick that could still be
// rewritten by whoever handed it over is not a decision about anything.
//
// This is also the supported way to get IMMUTABLE PRESENTED EVIDENCE. A certificate attached
// through `Brick()` is held by reference and the caller may still rewrite it — construct a brick
// with `resourceDecision:'annihilate'`, watch it refuse, flip the field to `'allow'`, and the SAME
// brick admits. That is not a defect in `Brick()`; it is what "presented" means — the caller's
// word, and the caller may change their word. An ATTESTED certificate cannot be rewritten (it is a
// frozen snapshot the runtime holds, CERT28), and now neither can an INGESTED one.
// It does NOT apply the floor. `ingest` is construction, not composition — `Brick()` does not floor
// either, and `admitted()` is the question "may this be used". Conflating the two would mean a
// well-formed but uncertified brick could not even be REPRESENTED, and representing refusable things
// is most of what this algebra is for.
// ---------------------------------------------------------------------------
// REFLECTION IS EXECUTABLE, SO THE TRUE BOUNDARY IS BYTES (CERT39, thirteenth review 2026-08-23).
//
// §15.2 named one function as the hostile-data door and CERT37 strengthened it from "never throws"
// to "never executes caller code". Outside review then attacked exactly where the frontier file
// said to — the copier's reliance on `Object.getOwnPropertyNames` and `getOwnPropertyDescriptor`
// being structural truth — and they are not. They are Proxy TRAPS:
//
//     new Proxy(validBrick, { ownKeys, getOwnPropertyDescriptor, getPrototypeOf })
//     rt.ingestAndVerify(p)
//         → LIVE, authenticated, frozen …and eight trap invocations of attacker JavaScript
//
// There is no portable way to inspect an arbitrary JavaScript object while guaranteeing its traps
// do not run: any API that has ALREADY RECEIVED an object graph has crossed the line too late.
// So the answer is not another reflection trick. It is to stop claiming a property the language
// cannot provide, and to move the real boundary to where the claim IS provable:
//
//     ingestFrame(bytes)        THE HOSTILE-DATA BOUNDARY (WIRE1). A bounded byte sequence, read
//                               through brand-checked intrinsics and COPIED before it is looked at.
//                               The runtime owns the parser, so nothing the caller wrote
//                               participates in structural inspection.
//
//     ingestJSON(text)          THE TEXT ROUTE. A convenience over `ingestFrame` for callers who
//                               already hold a decoded string. It is NOT the narrower door: by the
//                               time you have a JavaScript string, the framing decision — how many
//                               bytes were allowed to arrive — has already been made by somebody
//                               else. It bounds the string's real UTF-8 length so that the ceiling
//                               at least names the right quantity, and WORLD does not consume it.
//
//     adopt(obj)                THE OBJECT ROUTE. Renamed from `ingest` deliberately: "ingest"
//                               now means bytes, and the weaker route should not borrow the word.
//                               It still never throws and still refuses accessors, and a Proxy's
//                               traps MAY EXECUTE. For values you already own, that is fine —
//                               it is the same trust you extend to `Brick()`. For anything off a
//                               wire it is not, and WORLD accepts only the frame route.
//
// The honest summary of four rounds on this: CERT34 said "one named door", CERT37 said "and nothing
// executes", CERT39 said "…which is only true if the door takes bytes", and WIRE1 says "…and a
// `Uint8Array` is not bytes until you have copied it, because it is still an object".
//
// WHAT `maxBytes` MEANT AT THIS BOUNDARY, BEFORE WIRE1 (measured, fourteenth review):
//
//     JSON chars (text.length)   2,000,376        `text.length` counts UTF-16 code units
//     UTF-8 bytes on the wire    6,000,376        U+0800 is one unit and THREE bytes
//     declared ceiling           4,194,304
//     result                     LIVE, authenticated, frozen
//
// CERT33 established that `maxBytes` means actual canonical UTF-8 bytes, after the same source-unit
// confusion one layer in. The identical measurement error then reappeared one boundary OUT, in the
// function written to be the boundary. Naming a quantity is not enough; the check has to read it.
// FOUR DOORS, ONE OF EACH STEP. The verifying and non-verifying routes differ only in what they do
// with the parsed value, so they share `frameText` and `wireValue` rather than each carrying a copy
// of the budget check and the language check. This is not tidiness: the first draft of WIRE1 DID
// duplicate them, and the falsification pass caught it — reverting the byte check in one copy left
// WIRE1 and WIRE3 green, because the laws exercise the runtime's copy and the revert hit the
// module's. A second parser to keep in step with the first is a defect with a delay on it.
export function ingestFrame(frame) {
  const t = frameText(frame);
  if (t.refusal) return zeroBecause(t.refusal);
  const v = wireValue(t.text);
  return v.refusal ? zeroBecause(v.refusal) : adopt(v.value);    // now provably over inert plain data
}

export function ingestJSON(text) {
  if (typeof text !== 'string')
    return zeroBecause(`brick-not-json: the text route takes JSON TEXT, got ${typeof text} — ` +
                       'hand it a frame via ingestFrame(), or use adopt() and accept that it is the weaker, in-process route');
  const v = wireValue(text);
  return v.refusal ? zeroBecause(v.refusal) : adopt(v.value);
}

// Bounded bytes → a string the runtime owns. Returns `{text}` or `{refusal}`.
function frameText(frame) {
  const owned = ownedBytes(frame);
  if (typeof owned === 'string') return { refusal: owned };
  // The decoder and its method are captured at module load (WIRE7). `fatal: true` is the whole
  // point — a lenient decode turns malformed UTF-8 into U+FFFD and admits it.
  try { return { text: $apply($decode, $decoder, [owned]) }; }
  catch { return { refusal: 'brick-not-utf8: the frame is not well-formed UTF-8' }; }
}

// A string the runtime is holding → a plain JSON value, bounded by its REAL byte length and checked
// against the wire language first. `utf8Len` counts without allocating the encoded copy, because a
// 4 MiB budget check must not build a 12 MiB buffer to decide it is over budget. Returns `{value}`
// or `{refusal}`; `{value: undefined}` is impossible because `undefined` is not JSON.
function wireValue(text) {
  const bytes = utf8Len(text);
  if (bytes > TERM_BUDGET.maxBytes)
    return { refusal: `brick-over-budget: ${bytes} UTF-8 bytes of JSON exceeds ${TERM_BUDGET.maxBytes} ` +
                      `(${text.length} source units — these are not the same quantity)` };
  const ijson = ijsonFault(text);
  if (ijson) return { refusal: `brick-not-ijson: ${ijson}` };
  try { return { value: $parse(text) }; }
  catch (e) { return { refusal: `brick-not-json: ${String(e?.message ?? e).slice(0, 160)}` }; }
}

// Returns a `Uint8Array` THE RUNTIME OWNS, or a string reason ALREADY CARRYING ITS CATEGORY. The
// categories are distinct on purpose: "this is not a frame" and "this frame is too big" are
// different facts about different inputs, and a caller that retries on one should not retry on the
// other. Every read of the caller's frame goes through a brand-checked intrinsic; the bytes are
// copied before anything inspects them, so a view onto memory another thread can write is refused
// rather than raced.
function ownedBytes(frame) {
  let len, tag, buf;
  try {
    len = $apply(taByteLength, frame, []);
    tag = $apply(taTag, frame, []);
    buf = $apply(taBuffer, frame, []);
  } catch {
    // A Proxy lands here: it has no [[TypedArrayName]] slot, so the getter throws instead of
    // trapping, and NOTHING the caller wrote has run.
    return 'brick-not-a-frame: the hostile boundary takes a Uint8Array over its own memory, and this ' +
           'is not one (no typed-array internal slot — a Proxy or a plain object cannot stand in for a frame)';
  }
  // The ELEMENT TYPE is part of the brand check, not a courtesy. `%TypedArray%.prototype.set`
  // converts between element types, so a `Uint16Array` frame would be copied as elements and the
  // bytes would not be the bytes. Read through the intrinsic `@@toStringTag`, which reports the
  // internal slot and which a subclass cannot redefine on itself.
  if (tag !== 'Uint8Array')
    return `brick-not-a-frame: a frame is a Uint8Array; this is a ${tag ?? 'non-typed-array'}, whose ` +
           'elements are not bytes';
  // A view onto a SharedArrayBuffer is not a frame. The bytes that were length-checked are not
  // necessarily the bytes that get decoded — measured: checked 16, decoded different content.
  // Answered by the brand check rather than by `instanceof`, which reads a global and dispatches
  // through `Symbol.hasInstance`.
  try { $apply(abByteLength, buf, []); }
  catch {
    return 'brick-not-a-frame: the frame does not view an ordinary ArrayBuffer — shared memory can be ' +
           'rewritten between the bound and the decode, and a bound that can change after it is checked ' +
           'is not a bound';
  }
  // Detachment reads as length 0 rather than as an error, so an empty frame and a detached one are
  // the same observation. Say so, rather than reporting the JSON as malformed.
  if (len === 0) return 'brick-not-a-frame: the frame is empty (or its buffer was detached), so there are no bytes to parse';
  // Measured through the INTRINSIC, so a subclass that reports a small `byteLength` over a large
  // buffer is refused on the size it actually is.
  if (len > TERM_BUDGET.maxBytes) return `brick-over-budget: ${len} bytes of frame exceeds ${TERM_BUDGET.maxBytes}`;
  // THE COPY, AND IT ASKS THE SOURCE NOTHING (WIRE6). Allocate ours, then `set` — which reads the
  // source's internal slots and memmoves. No `SpeciesConstructor`, so no `constructor` read, so no
  // getter of the caller's between the bound and the bytes.
  try {
    const owned = new $U8(len);
    $apply(taSet, owned, [frame]);
    return owned;
  } catch {
    return 'brick-not-a-frame: the frame could not be copied — its buffer is detached or resizable-shrunk';
  }
}

// UTF-8 length WITHOUT allocating the encoding. A 4 MiB budget check must not first build a 12 MiB
// buffer to decide it is over budget — the rule this file has stated twice already, that the cost of
// refusing must not scale with the size of the thing being refused.
function utf8Len(s) {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length &&
             s.charCodeAt(i + 1) >= 0xdc00 && s.charCodeAt(i + 1) <= 0xdfff) { n += 4; i++; }
    else n += 3;                       // includes lone surrogates, which encode as U+FFFD (3 bytes)
  }
  return n;
}

// The I-JSON scan (RFC 7493): unique member names. This has to be done over the TEXT, because by the
// time `JSON.parse` has returned, the duplicate is gone and the survivor is whichever one V8 felt
// like keeping. It is a scanner rather than a parser: `JSON.parse` still does the real validation
// immediately afterwards, so this only has to be right about where strings begin and end, and about
// which of them are member names. Returns a reason or null.
function ijsonFault(text) {
  const stack = [];                                  // one Set per object depth; null for arrays
  let expectName = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') { stack.push(new Set()); expectName = true; continue; }
    if (ch === '[') { stack.push(null); expectName = false; continue; }
    if (ch === '}' || ch === ']') { stack.pop(); expectName = false; continue; }
    if (ch === ',') { expectName = stack.length > 0 && stack[stack.length - 1] !== null; continue; }
    if (ch === ':') { expectName = false; continue; }
    if (ch !== '"') continue;
    // A string. Walk it honouring escapes, and decode just enough to compare names by VALUE —
    // `{"a":1,"a":2}` is a duplicate, and a byte comparison would miss it.
    let j = i + 1, raw = '';
    for (; j < text.length; j++) {
      const c = text[j];
      if (c === '\\') {
        const e = text[j + 1];
        if (e === 'u') { raw += String.fromCharCode(parseInt(text.slice(j + 2, j + 6), 16) || 0); j += 5; }
        else { raw += ({ n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', '"': '"', '\\': '\\', '/': '/' })[e] ?? e; j += 1; }
        continue;
      }
      if (c === '"') break;
      raw += c;
    }
    if (expectName && stack.length && stack[stack.length - 1] !== null) {
      const names = stack[stack.length - 1];
      if (names.has(raw))
        return `the object member ${JSON.stringify(raw).slice(0, 60)} appears more than once. RFC 8259 leaves ` +
               'this to the implementation — V8 keeps the last, other parsers keep the first or refuse — so a ' +
               'peer cannot agree with us about which value was authenticated';
      names.add(raw);
      expectName = false;
    }
    i = j;
  }
  return null;
}

// ---------------------------------------------------------------------------
// THE OBJECT ROUTE LIVES UNDER `trusted` (fifteenth review, 2026-08-23).
//
// The fourteenth review asked for this and I declined, on the grounds that none of the other
// ingress names encode their strength either. That argument was answered, and correctly:
//
//     ingestFrame / ingestJSON       accept a SERIALISATION. Bytes, or text.
//     adopt                          accepts an EXECUTABLE JAVASCRIPT OBJECT GRAPH.
//
// Those are not two points on one continuum of strictness. They are different TRUST CLASSES, and a
// caller choosing between them is not choosing how careful to be — they are choosing whether the
// value they hand over is allowed to run code during its own inspection. A namespace can say that;
// an adjective in a function name cannot. So the object route is reached only through `trusted`,
// module-level and on every runtime, and there is no bare `adopt` to reach for by accident.
function adopt(raw) {
  const snap = inertCopy(raw, 'brick');
  if (snap.fault) return zeroBecause(snap.fault);
  // Frozen whole: `Brick()` carries `cost` by reference, and here that reference is to OUR copy, so
  // freezing it closes the mutate-after-verdict route for the ingested case without touching what
  // `Brick()` promises its own callers.
  return deepFreeze(Brick(snap.value));
}

export function createComposeRuntime({ name = 'runtime', verify } = {}) {
  const store = newStore();
  const authority = createAttestationAuthority({ name, verify }, store);
  store.add(PIPE_IDENTITY.cost);
  store.add(AND_IDENTITY.cost);
  // ---------------------------------------------------------------------------------------
  // THE DOOR WORLD CONSUMES MUST NOT DEPEND ON HOW IT WAS FETCHED (WIRE0, fourteenth review).
  //
  // `ingestJSONAndVerify` was a method that called `this.adoptAndVerify`. Modules are strict, so a
  // detached reference has `this === undefined`, and the failure is not a refusal:
  //
  //     rt.ingestJSONAndVerify(text)            LIVE
  //     const {ingestJSONAndVerify} = rt        THREW TypeError: Cannot read properties of undefined
  //     [text].map(rt.ingestJSONAndVerify)      THREW TypeError
  //
  // Three things make that worse than an ordinary binding bug. It threw on the SUCCESS path — bad
  // input still refused politely, so the failure appeared only once the caller got everything
  // right. It broke the contract this file states most loudly, that the boundary "does not throw,
  // whatever it is handed" (CERT34) — and the contract was true of the FUNCTION while being false
  // of the NAME. And of the four ingress routes it was the only one affected, because it was the
  // only one written as a method: `ingestFrame`, `ingestJSON` and `adopt` are free functions and
  // destructure cleanly. So the single door WORLD is specified to consume was the single door that
  // broke under the idiom every consumer reaches for on a frozen namespace object.
  //
  // Defined as consts closed over `authority` and `store`. There is no `this` left to lose.
  const adoptAndVerify = (raw) => {
    const snap = inertCopy(raw, 'brick');
    if (snap.fault) return zeroBecause(snap.fault);
    const shaped = Brick(snap.value);
    if (isZero(shaped)) return shaped;
    if (!validSubject(shaped.artifact))
      return zeroBecause('ingest-and-verify: this brick declares no artifact, so there is nothing for a ' +
                         'certificate to be bound to and nothing to authenticate it FOR (CERT9/CERT21)');
    let cert;
    try { cert = authority.verifyAndAttest(snap.value.cost, shaped.artifact); }
    catch (e) { return zeroBecause(`ingest-and-verify: ${e?.message ?? e}`); }
    return deepFreeze(Brick({ ...snap.value, cost: cert }));
  };
  // Bytes in, admissible-for-WORLD out. This is the composition WORLD actually consumes: the
  // no-caller-code guarantee holds because the frame is copied before it is read, and the brand
  // lands after the last copy. The text and object routes are the same sequence over weaker input.
  // The same two steps the non-verifying doors use — `frameText` and `wireValue` — with
  // `adoptAndVerify` as the finisher instead of `adopt`. Nothing about the budget or the wire
  // language is restated here.
  const verifyingText = (text) => {
    const v = wireValue(text);
    return v.refusal ? zeroBecause(v.refusal) : adoptAndVerify(v.value);
  };
  const ingestFrameAndVerify = (frame) => {
    const t = frameText(frame);
    return t.refusal ? zeroBecause(t.refusal) : verifyingText(t.text);
  };
  const ingestJSONAndVerify = (text) => (typeof text !== 'string'
    ? zeroBecause(`brick-not-json: the text route takes JSON TEXT, got ${typeof text}`)
    : verifyingText(text));
  return Object.freeze({
    name,
    verifyAndAttest: authority.verifyAndAttest,
    isAttested: (c) => isAttested(c, store),
    admitted: (x) => admitted(x, store),
    presentedFor,                                                // structural — no store to consult
    authenticatedFor: (x) => authenticatedFor(x, store),
    composeAnd: (a, b) => composeAnd(a, b, store),
    composePipe: (a, b) => composePipe(a, b, store),
    composeTree: (n) => composeTree(n, store),
    ingestFrame,                                                 // THE hostile-data boundary: bounded bytes in (WIRE1)
    ingestJSON,                                                  // the text route — narrower than trusted.adopt, wider than ingestFrame
    // ---------------------------------------------------------------------------------------
    // THE STATE WORLD REQUIRES MUST BE REACHABLE BY ONE CALL (CERT38, twelfth review 2026-08-23).
    //
    // §15.4 ruled that WORLD accepts ingested-and-authenticated bricks only, and outside review
    // then did the obvious thing: tried to construct one. It cannot be done from outside, and the
    // reason is structural rather than an oversight —
    //
    //     ingest(raw)                        frozen, NOT authenticated
    //     verifyAndAttest(b.cost, …)         brands a NEW snapshot; `b` still isn't authenticated
    //     Brick({...b, cost: attested})      authenticated, NOT frozen — trusted-construction route
    //     ingest({...b, cost: attested})     frozen again, and the copy DESTROYS the brand
    //
    // The brand is object identity in a WeakSet (deliberately — that is what makes it unforgeable
    // by data), so any boundary that copies necessarily drops it. Two copying boundaries in series
    // can therefore never compose into "copied AND branded" from outside: whichever runs second
    // undoes the other. A rule whose required state has no construction path is not a rule.
    //
    // The sequence has to happen INSIDE, where the brand can be applied after the last copy:
    //
    //     hostile raw → inert snapshot → structurally valid brick
    //                 → verify the snapshot's certificate against the brick's own artifact
    //                 → rebuild around THAT branded certificate → deep-freeze
    //
    // AND IT IS NOT A FIELD. There is no `ingested: true`; a boolean would be exactly the
    // caller-asserted authority this whole file exists to remove (CERT1). The property is earned by
    // which function produced the object, and it is READ as `authenticatedFor(b) && isFrozen(b)`.
    // Refuses by name like `ingest` does; the verifier's own refusal is carried through rather than
    // flattened, because "the host refused this certificate" and "this is not a brick" are
    // different facts.
    // Defined above as consts, so each is the same function however the caller got hold of it.
    ingestFrameAndVerify,                                        // what WORLD consumes
    ingestJSONAndVerify,
    // The object route, behind the word that names its trust class rather than its strictness.
    trusted: Object.freeze({ adopt, adoptAndVerify }),
  });
}

// The module-level object route, same namespace as the runtime's. There is deliberately no bare
// `adopt` export: a name you cannot reach by accident is most of what the rename buys.
export const trusted = Object.freeze({ adopt });

export default { Brick, ZERO, isZero, none, idBrick, composeAnd, composePipe, composeTree, trusted, ingestFrame, ingestJSON, canonBytes,
                 UNDECLARED, ANY, TYPES, VAR, norm, decodeTerm, encodeTerm,
                 admitted, presentedFor, authenticatedFor, createAttestationAuthority,
                 createComposeRuntime, isAttested };
