"""Build fixed skeleton packages and consume tarballs outside the source workspace.

Uses an existing TypeScript compiler; writes only to a fresh temporary directory.
This establishes package mechanics, not M4 runtime or M5/M6 UI acceptance.
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[2])
parser.add_argument("--head", default="2b25f0fab69653a0426e2a74b09b178503add3ba")
parser.add_argument("--node", required=True, type=Path)
parser.add_argument("--npm-cli", type=Path)
args = parser.parse_args()
repo = args.repo.resolve()
node = args.node.resolve()
npm_cli = (args.npm_cli or Path(shutil.which("npm"))).resolve()
tsc = repo / "web/node_modules/typescript/bin/tsc"
work = Path(tempfile.mkdtemp(prefix="hier-d-m56-package-"))
for directory in ("source", "artifacts", "consumer", "npm-cache"):
    (work / directory).mkdir()
env = dict(os.environ)
env["PATH"] = str(node.parent) + os.pathsep + env.get("PATH", "")
records = []


def run(command, cwd=work):
    command = [str(part) for part in command]
    process = subprocess.run(command, cwd=cwd, env=env, text=True, capture_output=True)
    records.append({"command": command, "cwd": str(cwd), "exit_code": process.returncode,
                    "stdout": process.stdout, "stderr": process.stderr})
    (work / "commands.json").write_text(json.dumps(records, indent=2) + "\n")
    if process.returncode:
        print(json.dumps(records[-1], indent=2))
        raise SystemExit(process.returncode)
    return process.stdout


version = run([node, "--version"]).strip()
major, minor, _ = map(int, version.lstrip("v").split("."))
if not ((major == 20 and minor >= 12) or major == 22 or major >= 24):
    raise SystemExit(f"Unsupported Node for this repository: {version}; evidence: {work}")
run([node, npm_cli, "--version", "--loglevel=error"])
run([node, tsc, "--version"])
run(["git", "archive", "--format=tar", f"--output={work / 'skeleton.tar'}", args.head, "web"], repo)
with tarfile.open(work / "skeleton.tar") as archive:
    archive.extractall(work / "source", filter="data")
web = work / "source/web"
links = web / "node_modules/@hier"
links.mkdir(parents=True)
packages = ("protocol-types", "client", "viewmodel", "views")
for name in packages:
    (links / name).symlink_to(web / "packages" / name, target_is_directory=True)
run([node, tsc, "-b", web])
archives = []
for name in packages:
    output = run([node, npm_cli, "pack", "--ignore-scripts", "--json", "--pack-destination",
                  work / "artifacts", "--cache", work / "npm-cache", "--loglevel=error"], web / "packages" / name)
    archives.append(work / "artifacts" / json.loads(output)[0]["filename"])
consumer = work / "consumer"
(consumer / "package.json").write_text(json.dumps({"name": "d-m56-external-consumer", "version": "0.0.0",
                                                  "private": True, "type": "module"}, indent=2) + "\n")
run([node, npm_cli, "install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund",
     "--cache", work / "npm-cache", "--loglevel=error", *archives], consumer)
(consumer / "inspect.mjs").write_text('''import assert from "node:assert/strict";
import { lstatSync } from "node:fs";
const observed = {};
for (const name of ["protocol-types", "client", "viewmodel", "views"]) {
  const mod = await import("@hier/" + name);
  observed[name] = { keys: Object.keys(mod), values: Object.values(mod),
    resolved: import.meta.resolve("@hier/" + name),
    symlink: lstatSync("node_modules/@hier/" + name).isSymbolicLink() };
  assert.deepEqual(Object.values(mod), [2]);
  assert.equal(observed[name].symlink, false);
  assert.ok(observed[name].resolved.includes("/consumer/node_modules/"));
}
try { await import("@hier/client/node"); observed.nodeEntry = "available"; }
catch (error) { observed.nodeEntry = error.code; }
observed.clientInternalSource = import.meta.resolve("@hier/client/src/index.ts");
console.log(JSON.stringify(observed, null, 2));
''')
observed = json.loads(run([node, "inspect.mjs"], consumer))
result = {"kind": "fixed skeleton package mechanics; not runtime/UI acceptance", "head": args.head,
          "node": version, "workdir": str(work), "consumer": observed,
          "command_count": len(records), "all_exit_zero": True}
(work / "result.json").write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps(result, indent=2))
