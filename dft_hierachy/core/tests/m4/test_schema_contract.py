"""B M4 independent structure oracle. Inputs are handwritten, not A examples.

Schema is the target, not the expected-answer generator. stdout is complete
case-level JSON evidence; nonzero exit preserves rejected/accepted mismatches.
Runtime, cross-field relationships and raw NDJSON are different gates.
"""

import copy
import datetime
import hashlib
import json
import os
import re
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker

ROOT = Path(__file__).resolve().parents[3]
SCHEMA_PATH = Path(
    os.environ.get("B_M4_SCHEMA", ROOT / "protocol/schema/hier.schema.json")
)
SCHEMA = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
CHECKER = FormatChecker()


@CHECKER.checks("date-time")
def utc_calendar(value):
    if not isinstance(value, str):
        return True
    if (
        re.fullmatch(
            r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z", value
        )
        is None
    ):
        return False
    try:
        datetime.datetime.strptime(value, "%Y-%m-%dT%H:%M:%S.%fZ")
    except ValueError:
        return False
    return True


ROWS = []
R = {"lsb": 0, "width": 3}
S = {"ref": "B-signal-alpha", "bits": R}
T = {"ref": "B-signal-beta", "bits": R}
MAP = [{"from": 0, "to": 0, "width": 3}]
POINT = {"slice": S}
CONT = {
    "from": R,
    "slice": T,
    "role": "data",
    "precision": "exact",
    "align": "bitwise",
    "map": MAP,
}
COMPLETE = {"status": "complete", "reasons": []}
PARTIAL = {
    "status": "partial",
    "reasons": [{"code": "unsupported", "detail": "B handwritten case"}],
}
TEXT = "日\r\n"
HASH = hashlib.sha256(TEXT.encode("utf-8")).hexdigest()
INST = {
    "ref": "B-instance",
    "name": "B根",
    "path": ["B根"],
    "pathText": "B根",
    "kind": "module",
    "def": "B-definition",
    "defName": "B_leaf",
    "childCount": 0,
    "hasParamOverrides": False,
}
SNAP = {
    "protocol": 2,
    "schemaVersion": 7,
    "frontend": {"name": "slang", "version": "12.0.0"},
    "bodySharing": "fast",
    "tops": [INST],
    "definitionCount": 1,
    "bodyCount": 1,
    "snapshotId": "B-snapshot",
    "inputHash": HASH,
    "inputHashComplete": True,
    "indexState": "ready",
    "openedAt": "2000-02-29T23:59:59.123Z",
    "topCandidates": ["B-instance"],
}
SPAN = {
    "file": "B-file",
    "path": "/B/独立.sv",
    "start": {"offset": 0, "line": 1, "column": 1},
    "end": {"offset": 3, "line": 1, "column": 4},
    "contentHash": HASH,
}
PORT = {
    "ref": "B-port",
    "name": "入口",
    "direction": "in",
    "kind": "port",
    "internal": {"kind": "direct", "signal": S["ref"], "bits": R},
    "type": "logic[2:0]",
    "width": 3,
    "signed": False,
    "dims": [],
    "members": [],
}
PARAM = {
    "name": "N",
    "value": "3",
    "type": "int",
    "isType": False,
    "isLocal": False,
    "isPort": True,
    "isOverridden": False,
}
SIG = {
    "ref": S["ref"],
    "name": "临时a",
    "kind": "net",
    "type": "logic[2:0]",
    "width": 3,
    "signed": False,
    "dims": [],
    "members": [],
    "opaque": False,
}
DEP = {
    "signal": T["ref"],
    "bits": R,
    "role": "data",
    "precision": "exact",
    "align": "bitwise",
}
PROC = {
    "ref": "B-process",
    "kind": "always_comb",
    "inst": "B-instance",
    "writes": [{"target": S, "deps": [DEP]}],
    "externalRefs": [{"text": "other.remote", "access": "read"}],
}
REG = {
    "ref": "B-register",
    "inst": "B-instance",
    "signal": S["ref"],
    "bits": R,
    "process": "B-process",
    "clock": {"signal": "B-clock", "bits": {"lsb": 0, "width": 1}, "edge": "posedge"},
    "async": [],
}
ENDPOINT = {
    "kind": "process",
    "queried": R,
    "ref": "B-process",
    "inst": "B-instance",
    "bits": R,
    "at": S,
    "via": [],
}
HOP = {
    "kind": "process",
    "fact": "B-fact",
    "from": S,
    "via": "B-process",
    "map": MAP,
    "next": [CONT],
}
GRAPH = {
    "nodes": [
        {"id": "B-node-a", "kind": "slice", "point": POINT},
        {"id": "B-node-b", "kind": "slice", "point": {"slice": T}},
    ],
    "edges": [
        {
            "id": "B-edge",
            "fact": "B-fact",
            "from": "B-node-a",
            "to": "B-node-b",
            "kind": "binding",
            "role": "data",
            "precision": "exact",
            "align": "bitwise",
            "fromBits": R,
            "toBits": R,
            "map": MAP,
        }
    ],
    "frontier": [],
    "hasConservative": False,
}
NETLIST = {
    "inst": "B-instance",
    "bindings": [
        {
            "inst": "B-child",
            "pin": "B-pin",
            "port": "a",
            "direction": "in",
            "width": 3,
            "segments": [
                {
                    "pinBits": R,
                    "target": {"kind": "signal", "signal": S["ref"], "bits": R},
                }
            ],
        }
    ],
}

# Handwritten method and public-client map, not copied from x-hier-methods.
METHODS = [
    ("design.info", "info", {}, SNAP),
    (
        "design.diagnostics",
        "diagnostics",
        {"maxItems": 1},
        {
            "errorCount": 1,
            "warningCount": 0,
            "items": [{"severity": "error", "message": "B诊断"}],
            "truncated": False,
        },
    ),
    (
        "design.checkInputs",
        "checkInputs",
        {},
        {"changed": ["B-file"], "complete": False},
    ),
    ("inst.roots", "roots", {}, [INST]),
    (
        "inst.children",
        "children",
        {"inst": "B-instance", "limit": 1},
        {"items": [INST]},
    ),
    ("inst.ancestors", "ancestors", {"inst": "B-instance"}, [INST]),
    ("inst.get", "instance", {"inst": "B-instance"}, INST),
    ("inst.ports", "ports", {"inst": "B-instance"}, [PORT]),
    ("inst.params", "params", {"inst": "B-instance"}, [PARAM]),
    (
        "inst.signals",
        "signals",
        {"inst": "B-instance", "filter": {"text": "临"}},
        {"items": [SIG]},
    ),
    (
        "def.list",
        "definitions",
        {},
        {
            "items": [
                {
                    "ref": "B-definition",
                    "name": "B_leaf",
                    "kind": "module",
                    "file": "/B/a.sv",
                    "line": 1,
                }
            ]
        },
    ),
    ("def.instances", "instancesOf", {"def": "B-definition"}, {"items": [INST]}),
    (
        "search",
        "search",
        {"text": "临", "kinds": ["signal"]},
        {
            "items": [
                {
                    "ref": S["ref"],
                    "kind": "signal",
                    "name": "临时a",
                    "inst": "B-instance",
                    "path": ["B根", "临时a"],
                    "def": "B-definition",
                    "pathText": "B根.临时a",
                }
            ]
        },
    ),
    ("path.resolve", "resolvePath", {"text": "B根.临时a"}, [S["ref"]]),
    ("conn.bindings", "bindings", {"inst": "B-instance"}, NETLIST),
    (
        "conn.drivers",
        "drivers",
        {"slice": {"ref": S["ref"]}, "reach": "local"},
        [ENDPOINT],
    ),
    (
        "conn.loads",
        "loads",
        {"slice": {"ref": T["ref"], "bits": R}, "reach": "hier"},
        [ENDPOINT],
    ),
    (
        "conn.step",
        "step",
        {"from": S, "direction": "back"},
        {"hops": [HOP], "hasConservative": False},
    ),
    (
        "trace.cone",
        "cone",
        {"start": POINT, "direction": "forward", "policy": "full"},
        GRAPH,
    ),
    ("trace.paths", "paths", {"from": POINT, "to": {"slice": T}}, GRAPH),
    ("seq.registers", "registers", {"inst": "B-instance"}, {"items": [REG]}),
    (
        "proc.list",
        "procs",
        {"inst": "B-instance"},
        {"items": [{"ref": "B-process", "kind": "always_comb"}]},
    ),
    ("proc.get", "proc", {"ref": "B-process"}, PROC),
    (
        "obj.get",
        "object",
        {"ref": S["ref"]},
        {
            "ref": S["ref"],
            "kind": "signal",
            "name": "临时a",
            "inst": "B-instance",
            "pathText": "B根.临时a",
        },
    ),
    ("obj.source", "source", {"ref": S["ref"], "kind": "definition"}, SPAN),
    (
        "source.resolve",
        "resolveSource",
        {"file": "B-file", "line": 1, "col": 2},
        {
            "items": [
                {
                    "ref": S["ref"],
                    "kind": "definition",
                    "span": SPAN,
                    "inst": "B-instance",
                }
            ]
        },
    ),
    (
        "source.read",
        "readSource",
        {"file": "B-file"},
        {"text": TEXT, "contentHash": HASH, "matchesSnapshot": True},
    ),
]
QR = {
    "def.instances",
    "search",
    "path.resolve",
    "conn.drivers",
    "conn.loads",
    "conn.step",
    "trace.cone",
    "trace.paths",
    "seq.registers",
    "proc.get",
    "source.resolve",
}
CACHE = {"inst.ports", "inst.params", "conn.bindings"}


def check(name, definition, value, expected, basis):
    target = {"$schema": SCHEMA["$schema"], "$defs": SCHEMA["$defs"]}
    if isinstance(definition, str):
        target["$ref"] = "#/$defs/" + definition
    else:
        target.update(definition)
    validator = Draft202012Validator(target, format_checker=CHECKER)
    errors = list(validator.iter_errors(value))
    ROWS.append(
        {
            "name": name,
            "definition": definition,
            "input": value,
            "expectedAccept": expected,
            "actualAccept": not errors,
            "passed": (not errors) == expected,
            "basis": basis,
            "errors": [
                {"path": list(x.absolute_path), "message": x.message}
                for x in errors[:3]
            ],
        }
    )


def equal(name, actual, expected, basis):
    ROWS.append(
        {
            "name": name,
            "input": actual,
            "expected": expected,
            "passed": actual == expected,
            "basis": basis,
        }
    )


def replace(obj, **fields):
    result = copy.deepcopy(obj)
    result.update(fields)
    return result


def success(result, completeness=COMPLETE):
    return {"id": 7, "ok": True, "result": result, "completeness": completeness}


def request(method, params):
    return {"id": 7, "method": method, "snapshot": SNAP["snapshotId"], "params": params}


def main():
    Draft202012Validator.check_schema(SCHEMA)
    registry = SCHEMA["x-hier-methods"]
    equal(
        "method-set",
        sorted(registry),
        sorted(x[0] for x in METHODS),
        "DESIGN5.2/5.6.3 all27",
    )
    for method, client, params, result in METHODS:
        record = registry[method]
        equal(
            method + ".client-name",
            record["clientMethod"],
            client,
            "DESIGN5.6.3 TS table",
        )
        equal(
            method + ".partial-rule",
            record["allowsPartial"],
            method in QR,
            "DESIGN5.1/5.6.3",
        )
        equal(
            method + ".cache-rule",
            record["cacheComplete"],
            method in CACHE,
            "DESIGN5.6.6",
        )
        check(
            method + ".request",
            "ClientFrame",
            request(method, params),
            True,
            "handwritten params",
        )
        check(method + ".params", record["params"], params, True, "handwritten params")
        check(
            method + ".populated-result",
            record["result"],
            result,
            True,
            "public model/Schema declarations",
        )
        check(
            method + ".complete",
            record["response"],
            success(result),
            True,
            "method-bound response",
        )
        check(
            method + ".partial",
            record["response"],
            success(result, PARTIAL),
            method in QR,
            "16complete/11QueryResult",
        )
        for error_code in [
            "bad_request",
            "unknown_method",
            "stale_snapshot",
            "stale_cursor",
            "not_found",
            "cancelled",
            "unsupported",
            "internal",
        ]:
            check(
                method + ".error." + error_code,
                "Failure",
                {
                    "id": 7,
                    "ok": False,
                    "error": {"code": error_code, "message": "B手写错误", "data": {}},
                },
                True,
                "DESIGN wire error enumeration, not domain proof",
            )
        for field in ["result", "completeness"]:
            frame = success(result)
            del frame[field]
            check(
                method + ".missing." + field,
                record["response"],
                frame,
                False,
                "success required fields",
            )
        check(
            method + ".result-null",
            record["response"],
            success(None),
            False,
            "nonnullable result",
        )
        check(
            method + ".extension",
            record["response"],
            replace(success(result), future={"note": "B extension"}),
            True,
            "unknown fields accepted",
        )
    hello = {
        "event": "hello",
        "protocol": 2,
        "snapshot": SNAP,
        "capabilities": ["cancel", "progress"],
    }
    check("hello.full", "Hello", hello, True, "schema7 full snapshot")
    for version in [1, 6, 8]:
        check(
            "hello.schema." + str(version),
            "Hello",
            replace(hello, snapshot=replace(SNAP, schemaVersion=version)),
            False,
            "explicit version rejection",
        )
    for version in [1, 3]:
        check(
            "hello.protocol." + str(version),
            "Hello",
            replace(hello, protocol=version),
            False,
            "protocol2 only",
        )
    for field in [
        "snapshotId",
        "inputHash",
        "inputHashComplete",
        "indexState",
        "openedAt",
        "topCandidates",
    ]:
        for missing in [True, False]:
            snap = copy.deepcopy(SNAP)
            if missing:
                del snap[field]
            else:
                snap[field] = None
            check(
                "snapshot." + field + (".missing" if missing else ".null"),
                "SnapshotInfo",
                snap,
                False,
                "new metadata mandatory/nonnullable",
            )
    for stamp, valid in [
        ("2000-02-29T00:00:00.000Z", True),
        ("1900-02-29T00:00:00.000Z", False),
        ("2024-04-31T00:00:00.000Z", False),
        ("2024-01-01T24:00:00.000Z", False),
        ("2024-01-01T00:00:00Z", False),
    ]:
        check(
            "UTC." + stamp,
            "UtcTimestamp",
            stamp,
            valid,
            "valid UTC millisecond calendar, own checker",
        )
    for identity, valid in [
        (1, True),
        (1.0, True),
        (9007199254740991, True),
        (0, False),
        (-1, False),
        (9007199254740992, False),
        (1.5, False),
        (True, False),
        ("1", False),
        (None, False),
    ]:
        check(
            "id." + repr(identity),
            "RequestId",
            identity,
            valid,
            "JS-safe integer without coercion",
        )
    req = request("inst.roots", {})
    for field in ["id", "method", "snapshot", "params"]:
        bad = copy.deepcopy(req)
        del bad[field]
        check(
            "request.missing." + field, "ClientFrame", bad, False, "envelope required"
        )
    for field in ["event", "ok", "result", "error", "completeness"]:
        check(
            "request.reserved." + field,
            "ClientFrame",
            replace(req, **{field: None}),
            False,
            "reserved known frame fields",
        )
    check(
        "request.unknown-method",
        "ClientFrame",
        request("B.unregistered", {}),
        True,
        "unknown_method is runtime error, not unknown field",
    )
    check(
        "server.unknown-event",
        "ServerFrame",
        {"event": "B.extension", "id": None, "error": "ignored"},
        True,
        "unknown event payload ignored after hello",
    )
    for bad in [None, [], 1, ""]:
        check(
            "params." + repr(bad),
            "ClientFrame",
            replace(req, params=bad),
            False,
            "params object required",
        )
    cancel = {"method": "cancel", "params": {"target": 9}}
    check("cancel.valid", "ClientFrame", cancel, True, "cancel no id")
    for field in ["id", "snapshot", "event", "ok", "result", "error", "completeness"]:
        check(
            "cancel.reserved." + field,
            "ClientFrame",
            replace(cancel, **{field: 1}),
            False,
            "uncorrelatable runtime fault",
        )
    for key, default in [("PageLimit", 200), ("MaxHops", 1000), ("RequestCursor", "")]:
        equal(
            key + ".default",
            SCHEMA["$defs"][key].get("default"),
            default,
            "independent DESIGN defaults",
        )
    for value, good in [
        (1, True),
        (2147483647, True),
        (0, False),
        (-1, False),
        (2147483648, False),
        (1.5, False),
        (True, False),
        (None, False),
    ]:
        check(
            "limit." + repr(value),
            "PageLimit",
            value,
            good,
            "page int32-positive range",
        )
    check(
        "budget.zero-edge-depth",
        "Budget",
        {"maxNodes": 1, "maxEdges": 0, "maxDepth": 0},
        True,
        "zero permitted edges/depth",
    )
    check("budget.zero-node", "Budget", {"maxNodes": 0}, False, "node positive")
    check(
        "budget.zero-time",
        "Budget",
        {"maxMillis": 0},
        False,
        "time positive when provided",
    )
    check(
        "point.unknown-width",
        "TracePoint",
        {"slice": {"ref": "B-opaque", "bits": {"lsb": 0, "width": 0}}},
        True,
        "whole-query sentinel",
    )
    check(
        "point.bad-sentinel-offset",
        "TracePoint",
        {"slice": {"ref": "B-opaque", "bits": {"lsb": 1, "width": 0}}},
        False,
        "sentinel requires lsb0",
    )
    check(
        "slice.zero-request",
        "SliceRequest",
        {"ref": "B-ref", "bits": {"lsb": 0, "width": 0}},
        False,
        "ordinary range positive",
    )
    check(
        "response.wrong-method-model",
        registry["inst.children"]["response"],
        success(GRAPH),
        False,
        "validate pending method, not generic Success",
    )
    for value, good in [
        (HASH, True),
        (HASH + "\n", False),
        (HASH + "\r", False),
        (HASH + "\r\n", False),
        (HASH.upper(), False),
        (HASH[:-1], False),
    ]:
        check(
            "hash." + repr(value[-8:]),
            "Hash",
            value,
            good,
            "SHA256 exact lowercase full string",
        )
    for value, good in [
        ("3'b0zx", True),
        ("3'b0zx\n", False),
        ("3'b0zx\r\n", False),
        ("3'b0ZX", False),
        ("0'b0", False),
    ]:
        check(
            "four-state." + repr(value),
            "FourStateValue",
            value,
            good,
            "only width'b01xz, no trim",
        )
    # Full method-bound Hop matrix; negative cases are not copied from C probes.
    for kind in ["process", "register"]:
        hop = replace(HOP, kind=kind)
        if kind == "register":
            hop["via"] = "B-register"
        for count in [0, 1, 3]:
            shaped = replace(hop, next=[copy.deepcopy(CONT) for _ in range(count)])
            check(
                kind + ".next." + str(count),
                registry["conn.step"]["response"],
                success({"hops": [shaped], "hasConservative": False}),
                count <= 1,
                "one original relation per Hop",
            )
    for kind in [
        "blackbox_pin",
        "primitive_pin",
        "top_port",
        "const",
        "unconnected",
        "unresolved",
    ]:
        hop = {"kind": kind, "fact": "B-terminal", "from": S, "map": [], "next": []}
        if kind in ["blackbox_pin", "primitive_pin", "top_port"]:
            hop["at"] = {
                "slice": {"ref": "B-pin", "bits": R},
                "side": "inside" if kind == "top_port" else "outside",
            }
        if kind == "const":
            hop["value"] = "3'b0zx"
        if kind == "unresolved":
            hop["reason"] = "complex_port"
        check(kind + ".terminal", "Hop", hop, True, "known legal terminal")
        check(
            kind + ".has-next",
            "Hop",
            replace(hop, next=[CONT]),
            False,
            "terminal cannot be continuation",
        )
        if kind == "primitive_pin":
            no_at = copy.deepcopy(hop)
            del no_at["at"]
            check(
                kind + ".missing-at",
                "Hop",
                no_at,
                False,
                "primitive actual outside pin mandatory",
            )
    check(
        "blackbox.unknown-width-no-invented-at",
        "Hop",
        {
            "kind": "unresolved",
            "fact": "B-unknown",
            "from": S,
            "map": [],
            "next": [],
            "reason": "unknown_pin_width",
        },
        True,
        "M3 frozen StepBoundary: unknown_pin_width is unresolved, never a fabricated known pin",
    )
    route = {
        "kind": "boundary",
        "from": S,
        "via": "B-port",
        "map": MAP,
        "next": [{"slice": T, "role": "data", "precision": "exact"}],
    }
    check("M2.boundary-route", "BoundaryRoute", route, True, "M2 retained route")
    check(
        "M2.route-not-M3-fact",
        "BoundaryRoute",
        replace(route, fact="B-fact"),
        False,
        "M2 route is not M3 Hop",
    )
    check("endpoint.process-at", "Endpoint", ENDPOINT, True, "M2 process at retained")
    bad = copy.deepcopy(ENDPOINT)
    del bad["at"]
    check(
        "endpoint.process-missing-at", "Endpoint", bad, False, "M2 process at required"
    )
    check(
        "endpoint.constant-no-bits",
        "Endpoint",
        {"kind": "const", "queried": R, "value": "3'b0zx", "via": []},
        True,
        "constant only returned slice",
    )
    check(
        "port.interface",
        "PortInfo",
        {
            "ref": "B-iface",
            "name": "bus",
            "direction": "in",
            "kind": "interface",
            "internal": {"kind": "unresolved", "reason": "interface_port"},
            "interfaceDef": "B_bus",
            "modport": "",
        },
        True,
        "interface marked, not scalar width",
    )
    type_param = replace(PARAM, isType=True, value="logic")
    del type_param["type"]
    check(
        "parameter.type-parameter",
        "ParamInfo",
        type_param,
        True,
        "type param omits value typeText",
    )
    check(
        "signal.opaque",
        "SignalInfo",
        replace(SIG, opaque=True, width=0),
        True,
        "opaque whole-object width0",
    )
    equal("method-count", len(METHODS), 27, "all methods frozen")
    out = {
        "schemaPath": str(SCHEMA_PATH),
        "schemaSha256": hashlib.sha256(SCHEMA_PATH.read_bytes()).hexdigest(),
        "methods": 27,
        "checks": len(ROWS),
        "passed": sum(x["passed"] for x in ROWS),
        "failed": sum(not x["passed"] for x in ROWS),
        "skipped": 0,
        "cases": ROWS,
        "scope": "Static structure only. No actual client/service/TS generator execution.",
    }
    print(json.dumps(out, ensure_ascii=False))
    raise SystemExit(1 if out["failed"] else 0)


if __name__ == "__main__":
    main()
