"""Independent generated-fact mutations before validation, in a disposable worktree.

Requires an isolated detached checkout of the exact delivered head. Product edits
and restorations use apply_patch; A's working tree and A's probe scripts are never
used. Each control must pass before injection and again after restoration. Only
the generated Connections.cpp object is removed to prevent stale Make outputs.
"""
import argparse
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import sys

PINNED_SOURCES = {
    "6518f80508d4911d22f0a2bc3e46cbe46dabb985":
        "db1577239af9b6b5bfa9ae9b1d4f67374edd4e1d1ade7ce514ab2167f1139eca",
    "a6b3c8dd906a16c94ab7af5e5dc278e9e95406f1":
        "f3ad66101215ef2dfec35b4f2a8eea558705ee77127dd3eaf4ea2fba29e68ce4",
    "d98a124c95694c9d50f27bd1ad6ff86a3e754471":
        "395ee97f61a80955c617b39c33c3b9e76c0965311bc760febdd33d5df4fc6183",
}
SOURCE = "core/frontend/src/Connections.cpp"
ANCHOR = "        // Independent validation begins here; mutation probes alter only published facts."
MUTATIONS = {
    "drop_read": """        // B_FAULT_drop_read: independent check must detect the missing data access.
        if (proc.kind == "always_ff" && proc.writes.size() >= 2) {
            for (auto &write : proc.writes) {
                auto found = std::find_if(write.deps.begin(), write.deps.end(),
                                          [](const auto &dep) { return dep.role == "data"; });
                if (found != write.deps.end()) {
                    write.deps.erase(found);
                    break;
                }
            }
        }
""",
    "drop_write": """        // B_FAULT_drop_write: a missing target must be restored, not just missing reads.
        if (proc.kind == "always_ff" && proc.writes.size() >= 2)
            proc.writes.pop_back();
""",
    "erase_init": """        // B_FAULT_erase_init: no Slang oracle, so isolate the failed source.
        if (proc.kind == "init")
            proc.writes.clear();
""",
}


def command(args, cwd, environment=None):
    reply = subprocess.run(args, cwd=cwd, env=environment, capture_output=True,
                           text=True, timeout=180)
    if reply.returncode:
        raise RuntimeError(f"command failed {args}:\n{reply.stdout}{reply.stderr}")
    return reply


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def patch(executable, root, before, after):
    text = ("*** Begin Patch\n*** Update File: " + SOURCE + "\n@@\n" +
            "".join("-" + line + "\n" for line in before.splitlines()) +
            "".join("+" + line + "\n" for line in after.splitlines()) +
            "*** End Patch\n")
    reply = subprocess.run([executable, text], cwd=root, capture_output=True,
                           text=True, timeout=20)
    if reply.returncode:
        raise RuntimeError(f"apply_patch failed:\n{reply.stdout}{reply.stderr}")


def rebuild(root, build):
    obj = build / "CMakeFiles/hier_frontend.dir/frontend/src/Connections.cpp.o"
    if obj.exists():
        obj.unlink()  # Exact generated target, recreated below; never source data.
    command(["cmake", "--build", str(build), "--target", "hier", "-j", "6"], root)


def control(root, binary, fixture, top):
    reply = command([str(binary), "verify-facts", "--top", top, str(fixture)], root)
    if "mismatched=0" not in reply.stdout:
        raise RuntimeError(f"control missing explicit zero mismatch:\n{reply.stdout}{reply.stderr}")
    return reply.stdout.strip()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-root", required=True, type=Path)
    parser.add_argument("--build-dir", required=True, type=Path)
    args = parser.parse_args()
    root, build = args.source_root.resolve(), args.build_dir.resolve()
    own = Path(__file__).resolve().parent
    if "b-verify" not in root.name or not (root / ".git").is_file() or not build.is_relative_to(root):
        raise RuntimeError("only a separately named b-verify worktree/build is allowed")
    branch = subprocess.run(["git", "symbolic-ref", "-q", "HEAD"], cwd=root, capture_output=True)
    if branch.returncode == 0:
        raise RuntimeError("refusing to mutate an active branch")
    delivered = command(["git", "rev-parse", "HEAD"], root).stdout.strip()
    source_hash = PINNED_SOURCES.get(delivered)
    if source_hash is None:
        raise RuntimeError("delivered head changed; assess adapter separately, not the oracle")
    source = root / SOURCE
    if digest(source) != source_hash or source.read_text().count(ANCHOR) != 1:
        raise RuntimeError("source differs from pinned clean injection site")
    apply = shutil.which("apply_patch")
    if not apply:
        raise RuntimeError("apply_patch is required for mutation and restoration")
    binary = build / "hier"
    for fault, insertion in MUTATIONS.items():
        fixture = own / "../fixtures/m2" / (
            "only_self_checked.sv" if fault == "erase_init" else "fallback_events.sv")
        top = "only_init" if fault == "erase_init" else "fallback_events"
        print(f"CONTROL:{fault}:{control(root, binary, fixture, top)}", flush=True)
        applied = False
        try:
            patch(apply, root, ANCHOR, insertion + ANCHOR)
            applied = True
            rebuild(root, build)
            environment = {**os.environ, "HIER_BIN": str(binary), "HIER_B_FAULT": fault}
            checked = command([sys.executable, str(own / "check_internal_fault.py")], own, environment)
            print(f"VALIDATION_AND_FALLBACK_PASS:{fault}\n{checked.stdout}{checked.stderr}", flush=True)
        finally:
            if applied:
                patch(apply, root, insertion + ANCHOR, ANCHOR)
                if digest(source) != source_hash:
                    raise RuntimeError("source restore hash mismatch; no further operations")
                rebuild(root, build)
                print(f"RESTORED:{fault}:{control(root, binary, fixture, top)}", flush=True)
    print("B_INTERNAL_MUTATIONS:3/3; source hash restored", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
