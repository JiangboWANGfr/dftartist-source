"""B verifies raw65 registration against the original input-only B construction.

Never executes D prototypes or imports A export/replay implementations; no actual
fields from implementation evidence become an oracle. Original bytes/expectations
are compiled from a narrowly selected AST of B's fixed source.
"""

import ast
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[3]
source = ROOT / "core/tests/reuse/verify_d_candidates.py"
original_hash = "b2879785a77b90ce4a39b53d705c0b4bcd1d6f6a05f22b7b1b62f99a7613d1d3"
assert hashlib.sha256(source.read_bytes()).hexdigest() == original_hash
tree = ast.parse(source.read_text())
names = {"MAX_SAFE", "TOKENS", "GOOD", "BAD", "reader_cases"}
selected = []
constructing = False
for node in tree.body:
    if isinstance(node, ast.Assign):
        targets = {target.id for target in node.targets if isinstance(target, ast.Name)}
        if "raw_cases" in targets:
            break
        if targets <= names:
            selected.append(node)
            if "reader_cases" in targets:
                constructing = True
            continue
    if isinstance(node, ast.FunctionDef) and node.name == "reader_case":
        selected.append(node)
    elif constructing:
        assert isinstance(node, (ast.For, ast.Expr)), ast.dump(node)
        selected.append(node)
namespace = {}
exec(
    compile(ast.Module(body=selected, type_ignores=[]), str(source), "exec"), namespace
)
cases = namespace["reader_cases"]
assert len(cases) == 65
assert sum(case["expectedAccept"] for case in cases) == 35
assert len({case["name"] for case in cases}) == 65
fields = {"name", "bytes", "expectedAccept", "code", "offset", "token"}
for case in cases:
    assert set(case) <= fields
    assert all(type(byte) is int and 0 <= byte <= 255 for byte in case["bytes"])
fixture = Path(sys.argv[1])
projected = json.loads(fixture.read_text())


def same_value_and_type(left, right):
    if type(left) is not type(right):
        return False
    if isinstance(left, dict):
        return left.keys() == right.keys() and all(
            same_value_and_type(left[key], right[key]) for key in left
        )
    if isinstance(left, list):
        return len(left) == len(right) and all(
            same_value_and_type(a, b) for a, b in zip(left, right)
        )
    return left == right


assert same_value_and_type(projected["cases"], cases), (
    "Original B65 inputs/expectations/types/order differ"
)
assert projected["provenance"]["commit"] == "1abdbcf3217c5d0579b5eaac26077aee8d684b35"
assert projected["provenance"]["sourceSha256"] == original_hash
print(
    json.dumps(
        {
            "cases": len(cases),
            "accept": 35,
            "reject": 30,
            "sourceSha256": original_hash,
            "fixtureSha256": hashlib.sha256(fixture.read_bytes()).hexdigest(),
            "allExplicitFieldsAndOrderEqual": True,
        }
    )
)
