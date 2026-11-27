"""A's CTest adapter; expectations are B's unchanged reader65 projection.

No candidate libraries are needed. Hex preserves the entire finite byte span;
the driver reports the existing production decoder's result and number token.
"""

import hashlib
import json
from pathlib import Path
import subprocess
import sys

fixture = Path(sys.argv[2]).read_bytes()
corpus = json.loads(fixture)
cases = corpus["cases"]
if not cases or len({case["name"] for case in cases}) != len(cases):
    raise ValueError("empty corpus or duplicate case names")
payload = "".join(bytes(case["bytes"]).hex() + "\n" for case in cases)
run = subprocess.run(
    [sys.argv[1]], input=payload, capture_output=True, text=True, timeout=30
)
if run.returncode:
    raise RuntimeError(f"decode replay exit {run.returncode}: {run.stderr}")
actual = [json.loads(line) for line in run.stdout.splitlines()]
if len(actual) != len(cases):
    raise ValueError(f"expected {len(cases)} replies, got {len(actual)}")
rows = []
for case, result in zip(cases, actual):
    expected = {"accepted": case["expectedAccept"]}
    for key, field in (("code", "code"), ("offset", "offset"), ("token", "x_token")):
        if key in case:
            expected[field] = case[key]
    rows.append(
        {
            "name": case["name"],
            "expected": expected,
            "actual": result,
            "passed": all(
                key in result
                and type(result[key]) is type(value)
                and result[key] == value
                for key, value in expected.items()
            ),
        }
    )
passed = sum(row["passed"] for row in rows)
print(
    json.dumps(
        {
            "fixtureSha256": hashlib.sha256(fixture).hexdigest(),
            "provenance": corpus["provenance"],
            "checks": len(rows),
            "passed": passed,
            "failed": len(rows) - passed,
            "driverExitCode": run.returncode,
            "cases": rows,
            "scope": "A replay of B frozen raw decoder expectations; no candidate migration or independent B acceptance.",
        }
    )
)
sys.exit(0 if passed == len(rows) else 1)
