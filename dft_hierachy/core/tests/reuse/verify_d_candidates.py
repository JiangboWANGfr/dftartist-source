"""B-D research verification, not a production migration sign-off.

All raw bytes/expected values below are independently based on DESIGN5.6.2
and original B fixtures. D-probe output is observation, never expected oracle.
"""

import decimal
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[3]
SCHEMA = Path(os.environ["B_D_SCHEMA"])
READER = os.environ["B_D_READER"]
JSONCONS = os.environ["B_D_JSONCONS"]
SCALAR = os.environ["B_D_SCALAR"]
PYTHON = os.environ["B_SCHEMA_PYTHON"]
MAX_SAFE = 9007199254740991
TOKENS = [
    "0",
    "-0",
    "0.0",
    "-0.0",
    "0e99999",
    "1",
    "1.0",
    "1e0",
    "10e-1",
    "0.1e1",
    "9007199254740991",
    "9007199254740991.0",
    "9.007199254740991e15",
    "9007199254740990.0",
    "-1",
    "-0.1",
    "1.5",
    "1.0000000000000001",
    "0.99999999999999999",
    "1.99999999999999999",
    "9007199254740991.1",
    "9007199254740990.5",
    "1e-400",
    "-1e-400",
    "1e-99999",
    "9007199254740992",
    "1e309",
    "1e99999",
]
GOOD = [r'"\ud83d\ude00"', r'"\u0000"', '"汉é😀"', r'"e\u0301"']
BAD = [
    r'"\ud800"',
    r'"\udc00"',
    r'"\udc00\ud800"',
    r'"\ud800x"',
    r'"\ud800\u0041"',
    r'"\ud800\ud800"',
]
INST = {
    "ref": "i:0",
    "name": "root",
    "path": ["root"],
    "pathText": "root",
    "kind": "module",
    "def": "d:0",
    "defName": "root",
    "childCount": 0,
    "hasParamOverrides": False,
}


def integral(token, minimum=0, maximum=MAX_SAFE):
    value = decimal.Decimal(token)
    return minimum <= value <= maximum and value == value.to_integral_value()


def invoke(command, timeout=30):
    run = subprocess.run(command, capture_output=True, text=True, timeout=timeout)
    if run.returncode:
        raise RuntimeError(
            f"harness command exit {run.returncode}: {command}: {run.stderr}"
        )
    return json.loads(run.stdout)


def structure_case(name, definition, raw, expected):
    # raw is concatenated as text, never decoded before the candidate parser.
    return {"name": name, "definition": definition, "raw": raw, "expected": expected}


def wrapper(case):
    return (
        '{"cases":[{"name":'
        + json.dumps(case["name"])
        + ',"definition":'
        + json.dumps(case["definition"])
        + ',"input":'
        + case["raw"]
        + ',"expectedAccept":'
        + str(case["expected"]).lower()
        + "}]}"
    )


reader_cases = []


def reader_case(name, raw, accept, code=None, offset=None, token=None):
    reader_cases.append(
        {
            "name": name,
            "bytes": list(raw),
            "expectedAccept": accept,
            **({"code": code} if code is not None else {}),
            **({"offset": offset} if offset is not None else {}),
            **({"token": token} if token is not None else {}),
        }
    )


reader_case("empty_object", b"{}", True)
reader_case("legal_whitespace", b' \t\r{"x":[]}\r ', True)
for token in TOKENS:
    reader_case(
        "raw_number_" + token, ('{"x":' + token + "}").encode(), True, token=token
    )
for index, token in enumerate(GOOD):
    reader_case("scalar_" + str(index), ('{"future":' + token + "}").encode(), True)
for index, token in enumerate(BAD):
    for where in ("key", "value"):
        raw = (
            ("{" + token + ":1}") if where == "key" else ('{"future":[' + token + "]}")
        )
        reader_case(
            "nonscalar_" + where + "_" + str(index), raw.encode(), False, code=1
        )
for raw in [b'{"x":0,"x":1}', rb'{"x":0,"\u0078":1}', '{"位":0,"\\u4f4d":1}'.encode()]:
    offset = raw.rfind(b'"x"') if b'"x":1' in raw else raw.rfind(b'"\\u')
    reader_case(
        "duplicate_" + str(len(reader_cases)), raw, False, code=2, offset=offset
    )
for name, raw in [
    ("root_array", b"[]"),
    ("root_string", b'"B"'),
    ("root_integer", b"1"),
]:
    reader_case(name, raw, False, code=4)
for name, raw in [
    ("trailing", b"{}x"),
    ("leading_zero", b'{"x":01}'),
    ("trailing_comma", b'{"x":1,}'),
    ("comment", b'{"x":/*B*/1}'),
]:
    reader_case(name, raw, False, code=1)
reader_case("BOM", b"\xef\xbb\xbf{}", False, code=1)
for name, raw in [
    ("NUL_after_object", b"{}\x00 "),
    ("NUL_between_objects", b'\t{}\x00{"other":7}'),
    ("NUL_after_member", b'{"x":0}\x00'),
    ("raw_NUL_in_string", b'{"future":"\x00"}'),
]:
    reader_case(name, raw, False, code=1, offset=raw.index(b"\x00"))
for name, raw in [
    ("utf8_after_earlier_bad_json", b'{"x":, "future":"\xff"}'),
    ("utf8_after_duplicate", b'{"x":0,"x":1,"future":"\xff"}'),
]:
    reader_case(name, raw, False, code=0, offset=raw.index(b"\xff"))
for count in (127, 128):
    raw = b'{"future":' + b"[" * count + b"0" + b"]" * count + b"}"
    reader_case(
        "depth_" + str(count + 1),
        raw,
        count == 127,
        code=3 if count == 128 else None,
        offset=len(b'{"future":') + 127 if count == 128 else None,
    )

raw_cases = [
    structure_case("UInt_" + token, "UInt", token, integral(token)) for token in TOKENS
]
for token in ["1.0", "1e0", "0", "-0", "1.0000000000000001"]:
    raw = '{"id":' + token + ',"method":"inst.roots","snapshot":"B","params":{}}'
    raw_cases.append(
        structure_case("request_id_" + token, "ClientFrame", raw, integral(token, 1))
    )
for token in [
    "4294967295",
    "4294967295.0",
    "4.294967295e9",
    "4294967296",
    "4294967295.1",
    "1.0000000000000001",
]:
    raw = json.dumps(INST).replace('"childCount": 0', '"childCount": ' + token)
    raw_cases.append(
        structure_case(
            "childCount_" + token, "InstInfo", raw, integral(token, 0, 4294967295)
        )
    )
for token in [
    "9007199254740991.0",
    "9007199254740991.1",
    "9007199254740990.5",
    "1e-400",
]:
    raw = '{"errorCount":' + token + ',"warningCount":0,"items":[],"truncated":false}'
    raw_cases.append(
        structure_case("diagnostic_UInt_" + token, "Diagnostics", raw, integral(token))
    )
for token in ["1.25", "-0.5"]:
    raw = (
        '{"id":1,"method":"inst.roots","snapshot":"B","params":{},"future":'
        + token
        + "}"
    )
    raw_cases.append(
        structure_case("unknown_fraction_" + token, "ClientFrame", raw, True)
    )
for good, tokens in [(True, GOOD), (False, BAD)]:
    for index, token in enumerate(tokens):
        for where in ["key", "value"]:
            extension = (
                ('"future":{' + token + ":1}")
                if where == "key"
                else ('"future":[' + token + "]")
            )
            raw = (
                '{"id":1,"method":"inst.roots","snapshot":"B","params":{},'
                + extension
                + "}"
            )
            raw_cases.append(
                structure_case(
                    "unicode_" + str(good) + "_" + where + "_" + str(index),
                    "ClientFrame",
                    raw,
                    good,
                )
            )
for value, expected in [
    ("2000-02-29T23:59:59.123Z", True),
    ("2024-02-29T00:00:00.000Z", True),
    ("2100-02-29T00:00:00.000Z", False),
    ("2025-02-29T00:00:00.000Z", False),
    ("2024-01-01T24:00:00.000Z", False),
    ("2024-01-01T00:00:00Z", False),
    ("2024-01-01T00:00:00.000+00:00", False),
    ("2024-01-01T00:00:00.000Z\n", False),
]:
    raw_cases.append(
        structure_case(
            "UTC_" + repr(value), "UtcTimestamp", json.dumps(value), expected
        )
    )

with tempfile.TemporaryDirectory(prefix="hier-b-d-cases-") as temp:
    path = Path(temp)
    raw_path = path / "reader.json"
    raw_path.write_text(json.dumps(reader_cases), encoding="utf8")
    reader_actual = invoke([READER, str(raw_path)])
    assert len(reader_actual) == len(reader_cases)
    reader_rows = []
    for case, actual in zip(reader_cases, reader_actual):
        assert case["name"] == actual["name"]
        current = actual["current"]
        passed = current["accepted"] == case["expectedAccept"]
        if "code" in case:
            passed = passed and current.get("code") == case["code"]
        if "offset" in case:
            passed = passed and current.get("offset") == case["offset"]
        if "token" in case:
            passed = passed and current.get("x_token") == case["token"]
        reader_rows.append(
            {
                **case,
                "actual": actual,
                "baselinePassed": passed,
                "rapidAcceptanceMatchesContract": actual["rapid_sax"]["accepted"]
                == case["expectedAccept"],
            }
        )
    env = {**os.environ, "B_M4_SCHEMA": str(SCHEMA)}
    run = subprocess.run(
        [PYTHON, "-B", str(ROOT / "core/tests/m4/test_schema_contract.py")],
        capture_output=True,
        text=True,
        env=env,
        check=True,
    )
    corpus = json.loads(run.stdout)
    corpus_path = path / "original.json"
    corpus_path.write_text(run.stdout, encoding="utf8")
    regular = invoke([JSONCONS, str(SCHEMA), str(corpus_path)], timeout=60)
    original_rows = regular["structural_corpus"]
    assert len(original_rows) == 569
    raw_rows = []
    for case in raw_cases:
        corpus_path.write_text(wrapper(case), encoding="utf8")
        value = invoke([JSONCONS, str(SCHEMA), str(corpus_path)])
        rows = value.get("structural_corpus", [])
        accepted = rows[0]["actual"] if rows else False
        raw_rows.append(
            {
                **case,
                "accepted": accepted,
                "contractPassed": accepted == case["expected"],
                "stage": "structure" if rows else "input_decode",
                "error": value.get("hier_schema_error"),
                "note": "D default-DOM path; its standalone lossless/integer bridge is separate",
            }
        )
    bridge = [
        {
            "token": row["token"],
            "expected": integral(row["token"]),
            "actual": row.get("lossless", {}).get("adapted_valid_integer"),
        }
        for row in regular["numbers"]
    ]
    for row in bridge:
        row["passed"] = row["expected"] == row["actual"]
    observations = []
    for mode in ["default", "lossless"]:
        for good, tokens in [(True, GOOD), (False, BAD)]:
            for index, token in enumerate(tokens):
                observations.append(
                    {
                        "name": "scalar_" + str(good) + "_" + str(index),
                        "mode": mode,
                        "raw": token,
                        "expectedParse": good,
                    }
                )
        observations.append(
            {
                "name": "number_not_text",
                "mode": mode,
                "raw": "1.25",
                "expectedParse": True,
                "expectedStringSchema": False,
            }
        )
        for index, raw in enumerate(
            [b'"\xff"', b'"\xc0\x80"', b'"\xed\xa0\x80"', b'"\xf4\x90\x80\x80"']
        ):
            observations.append(
                {
                    "name": "invalid_UTF8_" + str(index),
                    "mode": mode,
                    "bytes": list(raw),
                    "expectedParse": False,
                }
            )
    payload = "".join(json.dumps(row) + "\n" for row in observations)
    observed = subprocess.run(
        [SCALAR], input=payload, capture_output=True, text=True, check=True
    )
    scalar_rows = []
    values = [json.loads(line) for line in observed.stdout.splitlines()]
    assert len(values) == len(observations)
    for expected, actual in zip(observations, values):
        passed = actual["parsed"] == expected["expectedParse"]
        if "expectedStringSchema" in expected:
            passed = (
                passed
                and actual.get("string_schema_valid")
                == expected["expectedStringSchema"]
            )
        scalar_rows.append({**expected, "actual": actual, "contractPassed": passed})
    result = {
        "basis": "DESIGN5.6.2, fixed Schema and original B bytes/corpus; no D expected outputs",
        "schemaSha256": hashlib.sha256(SCHEMA.read_bytes()).hexdigest(),
        "original569": {
            "checks": 569,
            "passed": sum(row["passed"] for row in original_rows),
            "cases": original_rows,
        },
        "reader": {
            "checks": len(reader_rows),
            "baselinePassed": sum(row["baselinePassed"] for row in reader_rows),
            "rapidAcceptanceAgreement": sum(
                row["rapidAcceptanceMatchesContract"] for row in reader_rows
            ),
            "cases": reader_rows,
        },
        "rawCandidate": {
            "checks": len(raw_rows),
            "passed": sum(row["contractPassed"] for row in raw_rows),
            "failed": sum(not row["contractPassed"] for row in raw_rows),
            "cases": raw_rows,
        },
        "isolatedNumericBridge": {
            "checks": len(bridge),
            "passed": sum(row["passed"] for row in bridge),
            "cases": bridge,
        },
        "scalarParserObservation": {
            "checks": len(scalar_rows),
            "passed": sum(row["contractPassed"] for row in scalar_rows),
            "cases": scalar_rows,
        },
        "scope": "Research probe checks, not registered/default/Core/SDK migration or full parser error-offset compliance",
    }
    print(json.dumps(result, ensure_ascii=False))
    sys.exit(
        0
        if all(row["baselinePassed"] for row in reader_rows)
        and all(row["passed"] for row in original_rows)
        and all(row["contractPassed"] for row in raw_rows)
        and all(row["passed"] for row in bridge)
        and all(row["contractPassed"] for row in scalar_rows)
        else 1
    )
