#!/usr/bin/env python3
"""film.py — reduce a WRL world to Film v0.7 epochs with TRVM's forge (P10 stage B).

    PYTHONDONTWRITEBYTECODE=1 python3 film.py <world.wrl> <epochs>   → JSON on stdout

This is the production fold from TRVM/forge (spinner_bench._run_traj's call sequence: desugar → lower →
plan view → admit_step_sealed → compile_step_v6 → ref_reduce → film_sealed), with NO scenario and NO
initial faults: the world runs under the policy its own artifact seals, with empty claim batches merged
with the world's own route claims (wrl_fold.fold_batches). The reducer is the reference reducer
(pure Python) so the build depends on nothing native. Output: the SemanticArtifactID the forge computed
(build.mjs compares it to the one wrl.js computed — two implementations, one id), and per epoch the
Film v0.7 text and its hash. Nothing here is a test of the forge; it is the forge, called."""
import sys, os, json, hashlib, time
ARGV_PATH = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else None
FORGE = os.environ.get("FORGE_DIR") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../../TRVM/forge")
sys.path.insert(0, os.path.abspath(FORGE))
os.chdir(os.path.abspath(FORGE))
import wrl_ir as W, wrl_sugar as SG, wrl_plan as P, compiler as C, admit as AD, forge_runtime as O, wrl_fold as FD, wrl_scenario as SC
from forge_state import init_state_v6, state_to_film_args_v6

def load_scenario(path):
    """Optional sidecar <world>.scenario.json: {"epochs": N, "numeric_faults": [orb ids],
    "batches": [[{"writer": w, "seq": s, "op": "SetRotor"|"ResetFault", "target": id, "rotor": [4 ints]}], ...]}.
    Claims are RUN INPUTS (D3): they bind to the world's id and never enter it. Built with admit.mk_claim, the
    same envelope the forge's scenario module builds."""
    sp = path[:-4] + ".scenario.json" if path.endswith(".wrl") else path + ".scenario.json"
    if not os.path.exists(sp): return None
    return json.load(open(sp, encoding="utf-8"))

def load_meta(path):
    """Book-side metadata that is NOT a run input: expect_idle, determinism. Kept out of the ScenarioV1 so the
    forge's validator sees only what it defines."""
    mp = path[:-4] + ".film.json" if path.endswith(".wrl") else path + ".film.json"
    return json.load(open(mp, encoding="utf-8")) if os.path.exists(mp) else {}

def main(path, epochs):
    src = open(path, encoding="utf-8").read()
    scen = load_scenario(path); meta = load_meta(path)
    v1 = bool(scen) and scen.get("scenario_version") == "scenario.v1"
    if v1: epochs = len(scen["epochs"])
    elif scen and scen.get("epochs"): epochs = int(scen["epochs"])
    t0 = time.time()
    prog = W.lower_program(SG.desugar_core(src), W.parse_wrl_core)
    view = P.plan_view(P.artifact_to_compile_plan_v1(prog.sealed_artifact))
    seams = FD.runtime_seams(view, view)
    world = init_state_v6(view)
    scenario_digest = None
    if v1:
        # the forge's own run-input document: validated by the forge, bound to THIS world's id (a mismatch refuses),
        # digested by the forge — the ScenarioDigest is the identity of the run inputs, as the SemanticArtifactID is the world's
        SC.validate_scenario_v1(scen)
        if scen.get("world_semantic_id") not in (None, prog.semantic_artifact_id):
            raise SystemExit("WRL_SCENARIO_WORLD_MISMATCH: scenario bound to %s, world is %s" % (scen.get("world_semantic_id"), prog.semantic_artifact_id))
        scenario_digest = SC.scenario_digest(scen)
        initial_faults, script = SC.scenario_to_script(scen)
        for o in initial_faults:
            if ("fault_" + o) in world: world["fault_" + o] = 1
    else:
        for o in (scen or {}).get("numeric_faults", []):
            if ("fault_" + o) in world: world["fault_" + o] = 1
    claim = AD.init_claimstate(view)
    step, _ = C.compile_step_v6(view)
    if v1:
        batches = FD.fold_batches(prog.artifact, [b for _lbl, b in script], epoch0=1)
    else:
        raw = [[] for _ in range(epochs)]
        for i, b in enumerate((scen or {}).get("batches", [])[:epochs]):
            for c in b:
                payload = ("SetRotor", c["target"], tuple(int(v) for v in c["rotor"])) if c["op"] == "SetRotor" else ("ResetFault", c["target"])
                raw[i].append(AD.mk_claim(c["writer"], c["seq"], payload))
        batches = FD.fold_batches(prog.artifact, raw, epoch0=1)
    reducer_name = os.environ.get("FILM_REDUCER", "ref_reduce")
    reduce_ = O.native_reduce if reducer_name == "native_reduce" else O.ref_reduce
    out = {"semantic_artifact_id": prog.semantic_artifact_id, "policy_id": seams.admit_policy_id,
           "reducer": reducer_name, "scenario": scen, "scenario_digest": scenario_digest, "epochs": []}
    for e, batch in enumerate(batches):
        ep = 1 + e
        claim, cfg_map, resets = FD.admit_step_sealed(claim, batch, ep, view, seams)
        ec = C.enc_config_bundle(view, cfg_map, resets)
        world = C.dec_state_v6(view, reduce_("((%s %s) %s)" % (step, ec, C.enc_state_v6(view, world))))
        film = FD.film_sealed(seams, *state_to_film_args_v6(view, world, ep), state=claim)
        text = film.decode()
        out["epochs"].append({"t": ep, "film_hash": "sha256:" + hashlib.sha256(film).hexdigest(),
                              "film": text.rstrip("\n").split("\n")})
    out["seconds"] = round(time.time() - t0, 3)
    if meta.get("determinism") or (scen or {}).get("determinism"):
        # EXACT REPLAY: reduce the same sealed world a second time, from a fresh state, and record whether
        # every epoch's film hash is identical. The build refuses the chapter otherwise.
        world2 = init_state_v6(view); claim2 = AD.init_claimstate(view); hashes2 = []
        for o in (scen["initial_runtime"]["numeric_faults"] if v1 else (scen or {}).get("numeric_faults", [])):
            if ("fault_" + o) in world2: world2["fault_" + o] = 1
        for e, batch in enumerate(batches):
            ep = 1 + e
            claim2, cfg_map, resets = FD.admit_step_sealed(claim2, batch, ep, view, seams)
            ec = C.enc_config_bundle(view, cfg_map, resets)
            world2 = C.dec_state_v6(view, reduce_("((%s %s) %s)" % (step, ec, C.enc_state_v6(view, world2))))
            hashes2.append("sha256:" + hashlib.sha256(FD.film_sealed(seams, *state_to_film_args_v6(view, world2, ep), state=claim2)).hexdigest())
        out["determinism"] = {"second_run_hashes": hashes2, "identical": hashes2 == [e["film_hash"] for e in out["epochs"]]}
    json.dump(out, sys.stdout)

if __name__ == "__main__":
    main(ARGV_PATH, int(sys.argv[2]) if len(sys.argv) > 2 else 4)
