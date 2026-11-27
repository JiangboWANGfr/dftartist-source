#!/usr/bin/env python3
"""Independent wire-output mutants, not product fixes or runtime-check proofs.

Each fault is specified from the public contract before looking at generation
logic. The genuine binary must pass the selected frozen test first. These mutants
prove oracle sensitivity; internal mismatch/fallback probes are a separate gate.
"""
import json
import os
import subprocess
import sys


def change(command, body, mutation):
    changed = False
    if mutation == "array_occurrence" and command == "bindings":
        # Public LocalNetlist identifies ports and their owning occurrence.
        # The occurrence fault reuses the first array element's data binding.
        # No assumptions about numeric IDs are needed: ask the public object API.
        candidates = []
        for binding in body["bindings"]:
            if binding["port"] == "d":
                queried = subprocess.run([os.environ["HIER_REAL_BIN"], "obj", binding["inst"],
                                          *sys.argv[3:]], capture_output=True, text=True, timeout=20)
                if queried.returncode == 0:
                    path = json.loads(queried.stdout)["pathText"]
                    if path in ("occ.u_arr[0]", "occ.u_arr[1]"):
                        candidates.append((path, binding))
        if len(candidates) == 2:
            first, second = sorted(candidates)
            second[1]["segments"] = first[1]["segments"]
            changed = True
    elif mutation == "precision" and command == "proc":
        # Changing precision is a contract fault even if the signal set is equal.
        for write in body["result"]["writes"]:
            for dep in write["deps"]:
                if dep["precision"] == "exact":
                    dep["precision"] = "conservative"
                    changed = True
    elif mutation == "multi_driver" and command == "drivers":
        process = [i for i, e in enumerate(body["result"]) if e["kind"] == "process"]
        if len(process) > 1:
            del body["result"][process[-1]]
            changed = True
    elif mutation == "hier_ref" and command in ("drivers", "loads", "proc"):
        completeness = body["completeness"]
        if any(r["code"] == "hier_ref" for r in completeness["reasons"]):
            body["completeness"] = {"status": "complete", "reasons": []}
            changed = True
    if changed:
        print(f"B_MUTATION_APPLIED:{mutation}:{command}", file=sys.stderr)
        with open(os.environ["HIER_MUTATION_LOG"], "a", encoding="utf8") as audit:
            audit.write(f"B_MUTATION_APPLIED:{mutation}:{command}\n")
    return body


def main():
    reply = subprocess.run([os.environ["HIER_REAL_BIN"], *sys.argv[1:]],
                           capture_output=True, text=True, timeout=20)
    sys.stderr.write(reply.stderr)
    if reply.returncode:
        sys.stdout.write(reply.stdout)
        return reply.returncode
    body = json.loads(reply.stdout)
    changed = change(sys.argv[1], body, os.environ["HIER_MUTATION"])
    print(json.dumps(changed, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    sys.exit(main())
