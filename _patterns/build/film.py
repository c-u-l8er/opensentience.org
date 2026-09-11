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
import wrl_ir as W, wrl_sugar as SG, wrl_plan as P, compiler as C, admit as AD, forge_runtime as O, wrl_fold as FD
from forge_state import init_state_v6, state_to_film_args_v6

def main(path, epochs):
    src = open(path, encoding="utf-8").read()
    t0 = time.time()
    prog = W.lower_program(SG.desugar_core(src), W.parse_wrl_core)
    view = P.plan_view(P.artifact_to_compile_plan_v1(prog.sealed_artifact))
    seams = FD.runtime_seams(view, view)
    world = init_state_v6(view)
    claim = AD.init_claimstate(view)
    step, _ = C.compile_step_v6(view)
    batches = FD.fold_batches(prog.artifact, [[] for _ in range(epochs)], epoch0=1)
    out = {"semantic_artifact_id": prog.semantic_artifact_id, "policy_id": seams.admit_policy_id,
           "reducer": "ref_reduce", "epochs": []}
    for e, batch in enumerate(batches):
        ep = 1 + e
        claim, cfg_map, resets = FD.admit_step_sealed(claim, batch, ep, view, seams)
        ec = C.enc_config_bundle(view, cfg_map, resets)
        world = C.dec_state_v6(view, O.ref_reduce("((%s %s) %s)" % (step, ec, C.enc_state_v6(view, world))))
        film = FD.film_sealed(seams, *state_to_film_args_v6(view, world, ep), state=claim)
        text = film.decode()
        out["epochs"].append({"t": ep, "film_hash": "sha256:" + hashlib.sha256(film).hexdigest(),
                              "film": text.rstrip("\n").split("\n")})
    out["seconds"] = round(time.time() - t0, 3)
    json.dump(out, sys.stdout)

if __name__ == "__main__":
    main(ARGV_PATH, int(sys.argv[2]) if len(sys.argv) > 2 else 4)
