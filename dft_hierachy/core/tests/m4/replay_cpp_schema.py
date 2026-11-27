"""B original corpus through actual C++ declarations, not A replay source.

569 exact structure inputs plus 81 method mappings and 3 defaults. No claimed
method-set/count enumeration: findMethod has no such observable API.
"""

import json
import os
import subprocess
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[3]
product = Path(sys.argv[2]).resolve()
env = {**os.environ, "B_M4_SCHEMA": str(product / "protocol/schema/hier.schema.json")}
original = subprocess.run(
    [sys.executable, "-B", str(root / "core/tests/m4/test_schema_contract.py")],
    capture_output=True,
    text=True,
    env=env,
    check=True,
)
corpus = json.loads(original.stdout)
requests, checks = [], []
UNSET = object()


def request(action, name, value=UNSET):
    index = len(requests)
    requests.append(
        {
            "action": action,
            "name": name,
            **({"value": value} if value is not UNSET else {}),
        }
    )
    return index


for row in corpus["cases"]:
    if "expectedAccept" in row:
        definition = row["definition"]
        if not isinstance(definition, str):
            assert list(definition) == ["$ref"] and definition["$ref"].startswith(
                "#/$defs/"
            )
            definition = definition["$ref"][8:]
        checks.append(
            (
                row["name"],
                request("validate", definition, row["input"]),
                "accept",
                row["expectedAccept"],
            )
        )
    elif row["name"] in ["method-set", "method-count"]:
        continue  # Not observable; never manufacture a green from an expected list.
    elif row["name"] == "PageLimit.default":
        checks.append(
            (
                row["name"],
                request("normalize", "inst.children", {"inst": "B"}),
                "limit",
                row["expected"],
            )
        )
    elif row["name"] == "RequestCursor.default":
        checks.append(
            (
                row["name"],
                request("normalize", "inst.children", {"inst": "B"}),
                "cursor",
                row["expected"],
            )
        )
    elif row["name"] == "MaxHops.default":
        checks.append(
            (
                row["name"],
                request(
                    "normalize",
                    "conn.step",
                    {"from": {"ref": "B"}, "direction": "back"},
                ),
                "maxHops",
                row["expected"],
            )
        )
    else:
        method, suffix = row["name"].rsplit(".", 1)
        field = {
            "client-name": "clientMethod",
            "partial-rule": "allowsPartial",
            "cache-rule": "cacheComplete",
        }[suffix]
        checks.append(
            (row["name"], request("metadata", method), field, row["expected"])
        )
checks.append(
    (
        "unknown B method not registered",
        request("metadata", "B.never-a-method"),
        "found",
        False,
    )
)
payload = "".join(
    json.dumps(row, ensure_ascii=False, allow_nan=False) + "\n" for row in requests
)
run = subprocess.run([sys.argv[1]], input=payload, capture_output=True, text=True)
if run.returncode:
    raise RuntimeError(f"B C++ driver exit {run.returncode}: {run.stderr}")
actual = [json.loads(line) for line in run.stdout.splitlines()]
assert len(actual) == len(requests)
rows = [
    {
        "name": name,
        "expected": expected,
        "actual": actual[index].get(field),
        "passed": actual[index].get(field) == expected,
    }
    for name, index, field, expected in checks
]
out = {
    "schemaSha256": corpus["schemaSha256"],
    "structured": 569,
    "metadata": 84,
    "extraUnknownMethod": 1,
    "checks": len(rows),
    "passed": sum(row["passed"] for row in rows),
    "failed": sum(not row["passed"] for row in rows),
    "driverExitCode": run.returncode,
    "notObservable": ["method-set", "method-count"],
    "cases": rows,
    "scope": "Same B inputs through actual C++ decoder/schema validators; no resource-control injection.",
}
print(json.dumps(out, ensure_ascii=False))
sys.exit(0 if all(row["passed"] for row in rows) else 1)
