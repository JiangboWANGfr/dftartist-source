"""A replay harness; expected values remain B's unchanged, frozen Python corpus."""

import json
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parents[3]
binary = Path(
    sys.argv[1]
    if len(sys.argv) > 1
    else root / "core/build/tests/m4/a_m4_schema_replay"
).resolve()
original = subprocess.run(
    [sys.executable, "-B", str(root / "core/tests/m4/test_schema_contract.py")],
    capture_output=True,
    text=True,
    check=False,
)
if original.returncode:
    sys.stderr.write(original.stdout + original.stderr)
    sys.exit(original.returncode)
corpus = json.loads(original.stdout)
cases = [row for row in corpus["cases"] if "expectedAccept" in row]
encoded = "".join(
    json.dumps(
        {
            "definition": row["definition"]
            if isinstance(row["definition"], str)
            else row["definition"]["$ref"].split("/")[-1],
            "input": row["input"],
        }
    )
    + "\n"
    for row in cases
)
run = subprocess.run(
    [str(binary)], input=encoded, capture_output=True, text=True, check=False
)
if run.returncode:
    sys.stderr.write(run.stdout + run.stderr)
    sys.exit(run.returncode)
answers = [json.loads(line) for line in run.stdout.splitlines()]
if len(answers) != len(cases):
    sys.exit("C++ replay did not return one result per frozen case")
results = [
    {
        "name": row["name"],
        "expected": row["expectedAccept"],
        "actual": value,
        "passed": row["expectedAccept"] == value,
    }
    for row, value in zip(cases, answers)
]
report = {
    "scope": "A execution of B frozen structural cases through production C++ decoder/validators; not new independent B acceptance",
    "binary": str(binary),
    "schemaSha256": corpus["schemaSha256"],
    "pythonExit": original.returncode,
    "cppExit": run.returncode,
    "checks": len(results),
    "passed": sum(row["passed"] for row in results),
    "failed": sum(not row["passed"] for row in results),
    "cases": results,
}
print(json.dumps(report, indent=2))
sys.exit(bool(report["failed"]))
