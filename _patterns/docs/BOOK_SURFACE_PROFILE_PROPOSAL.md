# `book.surface.v1` — a static WRL profile for the book's scenes, proposed (read-only inventory)

**Status: PROPOSAL. Nothing here is added to `WRL/relation-v2.js`, no identity is minted, no runtime is claimed.**
Written 2026-09-12 for the WRL lane, in the form of `graphonomous/v2/handoff/research/R17_WRL_SOURCE_INVENTORY.md`,
to be adjudicated beside the pending `graphonomous.semantic.v3` obligation. Measured at WRL `32160fec77a1` and
opensentience.org `0a7717c76f44`. Every count below is derived by the script in the appendix from
`opensentience.org/_patterns/scenes/*.json`; none is typed.

**The question.** Travis asked (2026-09-12) whether the book's *Structure — on the surface* animations — 32
scenes over six stencils — can be "coded in WRL". This document answers it the way the tree answers vocabulary
questions: by measuring what the scenes state, checking what an existing profile can carry, and stating the
minimal obligation for a new one, so the WRL lane can judge the row against what it would have to hold.

## 0. What a scene is, in its own words, and why that bounds the inventory

A scene is data: a **stencil** that lays out a compute surface (carriers, slots, stations, wires, meters, rings)
and a list of **steps**, each with a caption, an optional takeaway, and generic actions that mutate object
attributes or move loci between named positions (`_patterns/surface/surface.mjs`; plan §6). The engine
executes it. It is labelled an illustration on every page; the witness beside it is the evidence.

Two facts bound what WRL can do with it. **(1)** A static V2 profile "implies no runtime and derives exactly
`{ rulepack_id }`" and is "refused by the text surface" (WRL README, the profile table). So a scene under a
static profile gets **identity** — a `sem-` id for its topology — and nothing executes it but the engine.
**(2)** The only lowered profile is `forge.world.core.v1` (five roles, two edge kinds). Ten of the 32 scenes
already have an honest world in it and a Film the forge reduced (plan §7 P10); the other 22 do not,
for reasons each page states. Making the forge *execute* a locus-on-carrier scene would need a lowered profile
with runtime semantics in TRVM — a new runtime, not a row — and is out of scope here.

## 1. The registries, with their enumeration points

Enumerated by the appendix script over `scenes/*.json` (the only authority for what a scene contains):

| Registry | Count | Values |
|---|---|---|
| scenes | 32 | one per record with a `scene` field |
| stencils | 6 | join (11), wire (8), migrate (6), nest (3), multiplex (2), progress (2) |
| object kinds (roles) | 8 | LOCUS (79 instances), STATION (35 instances), CARRIER (20 instances), SLOT (12 instances), RING (12 instances), WIRE (8 instances), METER (8 instances), MAILBOX (1 instances) |
| action ops | 12 | state (146), move (115), note (60), join (22), spawn (18), tag (15), meter (14), wirenote (7), place (6), count (3), remove (3), label (1) |
| object states | 11 | held (37), idle (35), admitted (22), refused (18), live (13), indeterminate (8), gone (4), dormant (4), tampered (2), busy (2), record (1) |
| steps / takeaways | 156 / 94 | a step is a frame; a takeaway is prose bound to a frame |
| named positions (anchors) | 36 distinct | layout, see §2 |

Per stencil, the ops it uses: **migrate** state 34, move 10, tag 6, count 3, label 1, spawn 1; **join** move 30, state 27, join 22, note 17, spawn 12, tag 4; **multiplex** move 44, state 16, tag 4; **wire** state 39, note 38, move 26, wirenote 7, spawn 5, remove 3, tag 1; **progress** meter 14, place 6, state 5, move 1; **nest** state 25, note 5, move 4.

## 2. Not authority (excluded from identity)

- **Anchors and coordinates.** The 36 anchor names are layout — where a stencil draws a slot — exactly as
  layout is not meaning in WRL. They would not enter a world.
- **Captions, takeaways, intervals, colours.** Prose bound to frames and presentation. A scenario document may carry
  them; the world's id must not.
- **The engine.** `surface.mjs` is the executor and is versioned by its bytes in `artifact.json`; it is not part of
  any scene's identity.

## 3. What `forge.world.core.v1` can and cannot represent of this family

**Can:** any scene whose semantics are signals over wires into gates, rotors and poses — the ten records that carry
a `wrl.world` today (join → Door with one input port; observable → Spinner rotor; projection → Spinner→Orb;
identity/meaning/replay/sizes → the starter world). Their Films are on the pages, reduced by the forge.

**Cannot:** a locus that moves between carriers (there is no carrier role — the runtime is the carrier); a
mailbox in source (Mailbox has no surface spelling, Core 0.1.2 §14b); meters (progress is a property of a Film,
not a topology); rings (boundaries are not routes); a join whose refusal names a *field* (a Door refuses at a
port). That is 22 of 32 scenes, each page carrying its one-line reason.

## 4. The minimal `book.surface.v1` obligation, measured

Exactly what the registries in §1 state as *topology*, and nothing more. Attributes that steps mutate (`state`,
`note`, `tag`, `count`, `value`) are **role attributes**, as v0's roles carry `["node"]`; they are not relations.
Movement (`move`, `place`, `spawn`) is a change of one relation, `PLACED_AT`. The row, in the shape of
`GRAPHONOMOUS_V0_ROW`:

```json
{
 "book.surface.v1": {
  "derivation": "static",
  "rulepack_id": "book.surface.rules.v1",
  "policies": [
   "book.surface.rules.v1"
  ],
  "domain": "surface",
  "signature": {
   "orientation": "directed",
   "texture": "solid",
   "arity": 2,
   "endpoint_roles": [
    "source",
    "target"
   ]
  },
  "roles": {
   "LOCUS": [
    "node",
    "state",
    "tag"
   ],
   "CARRIER": [
    "node",
    "state",
    "label"
   ],
   "SLOT": [
    "node",
    "state"
   ],
   "STATION": [
    "node",
    "state",
    "note"
   ],
   "WIRE": [
    "node",
    "state",
    "note"
   ],
   "METER": [
    "node",
    "value",
    "max"
   ],
   "RING": [
    "node",
    "state",
    "note"
   ],
   "MAILBOX": [
    "node",
    "state",
    "count"
   ]
  },
  "endpoints": {
   "PLACED_AT": [
    [
     "LOCUS",
     "CARRIER"
    ],
    [
     "LOCUS",
     "SLOT"
    ],
    [
     "LOCUS",
     "STATION"
    ],
    [
     "LOCUS",
     "RING"
    ],
    [
     "LOCUS",
     "WIRE"
    ]
   ],
   "JOINS": [
    [
     "LOCUS",
     "STATION"
    ]
   ],
   "COMPOSES_WITH": [
    [
     "LOCUS",
     "LOCUS"
    ]
   ],
   "VERIFIED_BY": [
    [
     "WIRE",
     "STATION"
    ]
   ],
   "MEASURES": [
    [
     "METER",
     "CARRIER"
    ]
   ],
   "CONTAINS": [
    [
     "RING",
     "RING"
    ],
    [
     "RING",
     "LOCUS"
    ]
   ]
  }
 }
}
```

Sizes it would have to hold at `0a7717c76f44`: **8 roles, 6 kinds,
11 endpoint pairs**; 32 worlds
(175 objects across them); a scenario document per world carrying its 156-step film-shaped
sequence of relation and attribute changes (94 of them with prose). **None of these numbers is a promise;
they are the sizes of the scene registry as measured.**

What the row derives: `{ rulepack_id }` and nothing else — no runtime, no Film. What it refuses: the text surface;
a scene world would be V2 relation IR (JSON), converted from the scene file by a book-side adapter, sealed by
`relation-v2.js`, and its id printed beside the animation. Adding a row "changes no existing identity: selection
is a `hasOwnProperty` on the key" (`relation-v2.js`).

## 5. What the book does if the row is accepted, and if it is refused

**Accepted:** an adapter `scene → V2 world + scenario`; the build seals every scene's world through
`relation-v2.js` (P16: a scene whose world does not seal is refused), prints the `sem-` id and a scenario digest
beside the animation, and the edition's `artifact.json` carries the 32 ids. The engine remains the executor
and the page keeps saying so. Cost: one adapter, one build step; identity is cheap at any size.

**Refused:** the scenes stay JSON, hashed into `artifact.json` as they are today — deferred with their
coordinates preserved and no edge, the D-073 pattern — and the deferral is reported on the conclusion page.

**Either way, the strong path for Part III is not WRL.** The Progress scenes are about loci on carriers, and the
executor of that is ComputeDriven's floors, whose runs exist as receipts with instruction counts
(`computedriven/receipts/R7-EXECUTED.md`). A stage-B analogue for Carrier Multiplexing is a replay of a
ComputeDriven transcript, and it is listed in the plan as such.

## 6. Not done here

No row added; no `sem-` id minted under a profile that does not exist; no claim that WRL executes a scene; no
change to any existing identity. The `graphonomous.semantic.v3` obligation is older and pending; this proposal
does not jump it.

## Questions for adjudication

1. Is a **static** row the right instrument for a vocabulary that has a runtime elsewhere (the book's engine), or
   does WRL-P0 intend static rows only for vocabularies with none?
2. Are attributes-on-roles (`state`, `note`, `tag`, `count`, `value`) admissible in a static row, or must every
   mutable thing be a relation?
3. Should a scenario (the step sequence) have WRL identity at all, or is it a run input in the D3 sense — not part
   of the world's identity — digested by the consumer?
4. Naming: `book.surface.v1` vs `opensentience.surface.v1`; and whether `MAILBOX` here may share a name with the
   unwritable core role.

## Appendix — the census script (run it; the table above is its output)

```python
import json,glob,collections
stencils=collections.Counter(); ops=collections.Counter(); states=collections.Counter(); objkinds=collections.Counter(); anchors=collections.Counter(); steps=takeaways=0
for f in sorted(glob.glob('opensentience.org/_patterns/scenes/*.json')):
    s=json.load(open(f)); stencils[s['stencil']]+=1; p=s.get('params',{})
    loci=p.get('loci',[]); objkinds['LOCUS']+= loci if isinstance(loci,int) else len(loci)
    for k,key in (('RING','rings'),('CARRIER','carriers')):
        if key in p: objkinds[k]+=len(p[key])
    if 'slots' in p: objkinds['SLOT']+=p['slots']
    if s['stencil']=='join': objkinds['STATION']+=1
    if s['stencil']=='wire': objkinds['STATION']+=3; objkinds['WIRE']+=1
    if s['stencil']=='progress': objkinds['METER']+=4
    if s['stencil']=='migrate' and p.get('mailbox'): objkinds['MAILBOX']+=1
    for st in s['steps']:
        steps+=1; takeaways+=bool(st.get('takeaway'))
        for a in st.get('actions',[]):
            ops[a['op']]+=1
            if a['op']=='state': states[a['state']]+=1
            if a['op']=='spawn': objkinds['LOCUS']+=1
            if a['op'] in ('move','place'): anchors[str(a.get('to',a.get('at')))]+=1
print(dict(stencils), dict(ops), dict(states), dict(objkinds), len(anchors), steps, takeaways)
```
