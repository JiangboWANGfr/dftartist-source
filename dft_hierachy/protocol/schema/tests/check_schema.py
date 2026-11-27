"""A's draft-contract checks. No product binary/output or B oracle is used."""

import copy
from datetime import datetime
import json
from pathlib import Path
import unittest

from jsonschema import Draft202012Validator, FormatChecker

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = json.loads((ROOT / "hier.schema.json").read_text())
FORMATS = FormatChecker()


@FORMATS.checks("date-time", raises=(TypeError, ValueError))
def utc_timestamp(value):
    if not isinstance(value, str):
        return True  # JSON Schema type checks handle non-strings.
    datetime.strptime(value, "%Y-%m-%dT%H:%M:%S.%fZ")
    return True


VALIDATOR = Draft202012Validator(SCHEMA, format_checker=FORMATS)
BITS = {"lsb": 0, "width": 1}
SLICE = {"ref": "signal-a", "bits": BITS}
POINT = {"slice": SLICE}
COMPLETE = {"status": "complete", "reasons": []}
INSTANCE = {
    "ref": "instance-a",
    "name": "top",
    "path": ["top"],
    "pathText": "top",
    "kind": "module",
    "def": "definition-a",
    "defName": "top",
    "childCount": 0,
    "hasParamOverrides": False,
}
SNAPSHOT = {
    "protocol": 2,
    "schemaVersion": 7,
    "frontend": {"name": "slang", "version": "12.0.0"},
    "bodySharing": "fast",
    "tops": [INSTANCE],
    "definitionCount": 1,
    "bodyCount": 1,
    "snapshotId": "snapshot-a",
    "inputHash": "0" * 64,
    "inputHashComplete": True,
    "indexState": "ready",
    "openedAt": "2026-10-12T00:00:00.000Z",
    "topCandidates": ["instance-a"],
}
HELLO = {
    "event": "hello",
    "protocol": 2,
    "snapshot": SNAPSHOT,
    "capabilities": ["cancel", "progress"],
}
MAP = [{"from": 0, "to": 0, "width": 1}]
PROCESS = {
    "ref": "process-a",
    "kind": "assign",
    "inst": "instance-a",
    "writes": [
        {"target": SLICE, "deps": [], "exprMap": {"status": "mapped", "segments": MAP}}
    ],
    "expr": {"op": "const", "width": 1, "signed": False, "value": "1'b0"},
    "externalRefs": [],
}
SPAN = {
    "file": "file-a",
    "path": "/fixture.sv",
    "start": {"offset": 0, "line": 1, "column": 1},
    "end": {"offset": 1, "line": 1, "column": 2},
    "contentHash": "a" * 64,
}
GRAPH = {"nodes": [], "edges": [], "frontier": [], "hasConservative": False}

# Handwritten method cases from DESIGN 5.2/5.6, not enumerated from the schema.
METHOD_CASES = {
    "design.info": ({}, SNAPSHOT),
    "design.diagnostics": (
        {"maxItems": 0},
        {"errorCount": 0, "warningCount": 0, "items": [], "truncated": False},
    ),
    "design.checkInputs": ({}, {"changed": [], "complete": True}),
    "inst.roots": ({}, [INSTANCE]),
    "inst.children": ({"inst": "instance-a", "limit": 1}, {"items": []}),
    "inst.ancestors": ({"inst": "instance-a"}, []),
    "inst.get": ({"inst": "instance-a"}, INSTANCE),
    "inst.ports": ({"inst": "instance-a"}, []),
    "inst.params": ({"inst": "instance-a"}, []),
    "inst.signals": ({"inst": "instance-a", "filter": {"text": "Data"}}, {"items": []}),
    "def.list": ({}, {"items": []}),
    "def.instances": ({"def": "definition-a"}, {"items": []}),
    "search": ({"text": "", "kinds": []}, {"items": []}),
    "path.resolve": ({"text": "top"}, ["instance-a"]),
    "conn.bindings": ({"inst": "instance-a"}, {"inst": "instance-a", "bindings": []}),
    "conn.drivers": ({"slice": {"ref": "signal-a"}, "reach": "local"}, []),
    "conn.loads": ({"slice": SLICE, "reach": "hier"}, []),
    "conn.step": (
        {"from": SLICE, "direction": "back", "maxHops": 1},
        {"hops": [], "hasConservative": False},
    ),
    "trace.cone": ({"start": POINT, "direction": "back", "policy": "full"}, GRAPH),
    "trace.paths": (
        {"from": POINT, "to": POINT, "budget": {"maxEdges": 0, "maxDepth": 0}},
        GRAPH,
    ),
    "seq.registers": ({"inst": "instance-a", "recursive": True}, {"items": []}),
    "proc.list": ({"inst": "instance-a"}, {"items": []}),
    "proc.get": ({"ref": "process-a"}, PROCESS),
    "obj.get": (
        {"ref": "signal-a"},
        {
            "ref": "signal-a",
            "kind": "signal",
            "name": "s",
            "inst": "instance-a",
            "pathText": "top.s",
        },
    ),
    "obj.source": ({"ref": "definition-a", "kind": "definition"}, SPAN),
    "source.resolve": ({"file": "file-a", "line": 1}, {"items": []}),
    "source.read": (
        {"file": "file-a"},
        {"text": "", "contentHash": "b" * 64, "matchesSnapshot": False},
    ),
}
PARTIAL_METHODS = {
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


class Contract(unittest.TestCase):
    checks = 0

    def validate_as(self, name, value, expected=True):
        errors = list(
            VALIDATOR.evolve(schema={"$ref": "#/$defs/" + name}).iter_errors(value)
        )
        Contract.checks += 1
        self.assertEqual(
            not errors, expected, f"{name}: " + "; ".join(e.message for e in errors[:2])
        )

    def test_meta_schema_and_all_local_references(self):
        Draft202012Validator.check_schema(SCHEMA)
        refs = []

        def visit(value):
            if isinstance(value, dict):
                if "$ref" in value:
                    refs.append(value["$ref"])
                if "default" in value:
                    self.assertEqual(
                        list(
                            VALIDATOR.evolve(schema=value).iter_errors(value["default"])
                        ),
                        [],
                        value,
                    )
                for item in value.values():
                    visit(item)
            elif isinstance(value, list):
                for item in value:
                    visit(item)

        visit(SCHEMA)
        self.assertGreater(len(refs), 100)
        for target in refs:
            self.assertTrue(target.startswith("#/$defs/"), target)
            self.assertIn(target[8:], SCHEMA["$defs"], target)
        self.assertEqual(set(SCHEMA["x-hier-methods"]), set(METHOD_CASES))
        self.assertEqual(len(METHOD_CASES), 27)
        for method, metadata in SCHEMA["x-hier-methods"].items():
            self.assertEqual(metadata["allowsPartial"], method in PARTIAL_METHODS)
            self.assertEqual(
                metadata["cacheComplete"],
                method in {"inst.ports", "inst.params", "conn.bindings"},
            )
        self.assertEqual(
            len({m["clientMethod"] for m in SCHEMA["x-hier-methods"].values()}), 27
        )

    def test_all_method_requests_results_and_error_envelopes(self):
        for index, (method, (params, result)) in enumerate(METHOD_CASES.items(), 1):
            with self.subTest(method=method):
                request = {
                    "id": index,
                    "method": method,
                    "snapshot": "snapshot-a",
                    "params": params,
                }
                self.validate_as("ClientFrame", request)
                reply = {
                    "id": index,
                    "ok": True,
                    "result": result,
                    "completeness": COMPLETE,
                }
                self.validate_as("ServerFrame", reply)
                response = SCHEMA["x-hier-methods"][method]["response"]["$ref"][8:]
                self.validate_as(response, reply)
                self.validate_as(
                    "ServerFrame",
                    {
                        "id": index,
                        "ok": False,
                        "error": {
                            "code": "not_found",
                            "message": "Fixture object absent",
                            "data": {},
                        },
                    },
                )
                partial = {
                    **reply,
                    "completeness": {
                        "status": "partial",
                        "reasons": [{"code": "indexing"}],
                    },
                }
                self.validate_as(response, partial, method in PARTIAL_METHODS)
        self.validate_as(
            "SourceReadResponse",
            {"id": 1, "ok": True, "result": INSTANCE, "completeness": COMPLETE},
            False,
        )

    def test_hello_versions_snapshot_and_extension_fields(self):
        self.validate_as("Hello", HELLO)
        for version in (1, 6, 8, "7", None):
            value = copy.deepcopy(HELLO)
            value["snapshot"]["schemaVersion"] = version
            self.validate_as("Hello", value, False)
        value = copy.deepcopy(HELLO)
        value["protocol"] = 3
        self.validate_as("Hello", value, False)
        for field in (
            "snapshotId",
            "inputHash",
            "inputHashComplete",
            "openedAt",
            "indexState",
            "topCandidates",
        ):
            value = copy.deepcopy(HELLO)
            del value["snapshot"][field]
            self.validate_as("Hello", value, False)
        value = copy.deepcopy(HELLO)
        value["snapshot"]["openedAt"] = "2026-02-30T00:00:00.000Z"
        self.validate_as("Hello", value, False)
        value = copy.deepcopy(HELLO)
        value["snapshot"]["newOptionalField"] = {"future": 1}
        self.validate_as("Hello", value)
        value["snapshot"]["indexState"] = "almost_ready"
        self.validate_as("Hello", value, False)
        self.validate_as("ServerFrame", {"event": "future_event", "extension": True})
        self.validate_as(
            "ServerFrame",
            {"event": "future_event", "id": None, "error": "extension data"},
        )
        for timestamp in (
            "2026-01-01T00:00:00Z",
            "2026-01-01T00:00:00.000+00:00",
            "2026-13-01T00:00:00.000Z",
            "2026-01-01T24:00:00.000Z",
        ):
            self.validate_as("UtcTimestamp", timestamp, False)
        self.validate_as("UtcTimestamp", "2028-02-29T23:59:59.123Z")

    def test_request_shape_numbers_defaults_and_known_fields(self):
        request = {
            "id": 1,
            "method": "inst.children",
            "snapshot": "snapshot-a",
            "params": {"inst": "instance-a"},
        }
        self.validate_as("Request", request)
        for invalid in (0, -1, 0.5, 9007199254740992, True, "1", None):
            value = copy.deepcopy(request)
            value["id"] = invalid
            self.validate_as("Request", value, False)
        value = copy.deepcopy(request)
        value["id"] = 1.0
        self.validate_as("Request", value)
        for invalid in (0, -1, 2147483648, 1.5, True, None, "200"):
            value = copy.deepcopy(request)
            value["params"]["limit"] = invalid
            self.validate_as("Request", value, False)
        value = copy.deepcopy(request)
        value["params"].update(cursor="", limit=200, futureOption="retained-by-sender")
        self.validate_as("Request", value)
        for field in ("id", "method", "snapshot", "params"):
            value = copy.deepcopy(request)
            del value[field]
            self.validate_as("Request", value, False)
        value = copy.deepcopy(request)
        value["params"] = None
        self.validate_as("Request", value, False)
        value = copy.deepcopy(request)
        value["method"] = "future.method"
        self.validate_as(
            "Request", value
        )  # dispatch returns unknown_method, not a framing error
        value = copy.deepcopy(request)
        value["method"] = "inst.signals"
        value["params"]["filter"] = {"text": 1}
        self.validate_as("Request", value, False)
        self.validate_as("Budget", {"maxNodes": 0}, False)
        self.validate_as("Budget", {"maxMillis": 0}, False)
        self.validate_as("Budget", {"maxNodes": 1, "maxEdges": 0, "maxDepth": 0})

    def test_cancel_and_mutually_exclusive_response_fields(self):
        self.validate_as("Cancel", {"method": "cancel", "params": {"target": 1}})
        self.validate_as("Cancel", {"method": "cancel", "params": {"target": 0}}, False)
        self.validate_as(
            "Cancel", {"id": 2, "method": "cancel", "params": {"target": 1}}, False
        )
        self.validate_as(
            "Request",
            {
                "id": 1,
                "method": "design.info",
                "snapshot": "snapshot-a",
                "params": {},
                "event": "hello",
            },
            False,
        )
        failed = {
            "id": 1,
            "ok": False,
            "error": {"code": "cancelled", "message": "Stopped", "data": {}},
        }
        self.validate_as("Failure", failed)
        self.validate_as("Failure", {**failed, "result": []}, False)
        self.validate_as("Failure", {**failed, "completeness": COMPLETE}, False)
        value = copy.deepcopy(failed)
        value["error"]["code"] = "invented"
        self.validate_as("Failure", value, False)
        value = copy.deepcopy(failed)
        del value["error"]["data"]
        self.validate_as("Failure", value, False)
        self.validate_as(
            "Success",
            {
                "id": 1,
                "ok": True,
                "result": [],
                "completeness": COMPLETE,
                "error": failed["error"],
            },
            False,
        )
        self.validate_as(
            "ProtocolError",
            {
                "event": "protocol_error",
                "error": {"code": "bad_request", "message": "Duplicate id", "data": {}},
            },
        )

    def test_completeness_pagination_and_source_bytes(self):
        self.validate_as("Completeness", COMPLETE)
        self.validate_as(
            "Completeness",
            {"status": "complete", "reasons": [{"code": "unsupported"}]},
            False,
        )
        self.validate_as("Completeness", {"status": "partial", "reasons": []}, False)
        self.validate_as(
            "Completeness", {"status": "partial", "reasons": [{"code": "indexing"}]}
        )
        self.validate_as("SourceHitPage", {"items": [], "next": "cursor-a"})
        for invalid in ("", None, 1):
            self.validate_as("SourceHitPage", {"items": [], "next": invalid}, False)
        self.validate_as("SourceSpan", SPAN)
        for field in ("line", "column"):
            value = copy.deepcopy(SPAN)
            value["start"][field] = 0
            self.validate_as("SourceSpan", value, False)
        value = copy.deepcopy(SPAN)
        value["contentHash"] = "A" * 64
        self.validate_as("SourceSpan", value, False)
        self.validate_as(
            "SourceRead",
            {"text": "信号\r\n", "contentHash": "b" * 64, "matchesSnapshot": False},
        )

    def test_expression_mapping_and_route_shapes_stay_distinct(self):
        self.validate_as("ProcessInfo", PROCESS)
        value = copy.deepcopy(PROCESS)
        del value["writes"][0]["exprMap"]
        self.validate_as("ProcessInfo", value, False)
        value = copy.deepcopy(PROCESS)
        value["kind"] = "always_comb"
        self.validate_as("ProcessInfo", value, False)
        expression = {"op": "ref", "slice": SLICE, "width": 1, "signed": False}
        self.validate_as("Expr", expression)
        self.validate_as("Expr", {**expression, "signal": "signal-a"}, False)
        self.validate_as(
            "Expr",
            {
                "op": "mux",
                "width": 1,
                "signed": False,
                "args": [expression, expression, expression],
            },
        )
        self.validate_as(
            "Expr",
            {
                "op": "mux",
                "width": 1,
                "signed": False,
                "args": [expression, expression],
            },
            False,
        )
        self.validate_as(
            "Expr",
            {
                "op": "other",
                "width": None,
                "signed": False,
                "text": "a + b",
                "uses": [],
            },
        )
        route = {
            "kind": "boundary",
            "from": SLICE,
            "via": "port-a",
            "map": MAP,
            "next": [{"slice": SLICE, "role": "data", "precision": "exact"}],
        }
        self.validate_as("BoundaryRoute", route)
        self.validate_as("Hop", route, False)
        self.validate_as("BoundaryRoute", {**route, "fact": "fact-a"}, False)
        hop = {
            "kind": "process",
            "fact": "fact-a",
            "from": SLICE,
            "via": "process-a",
            "map": MAP,
            "next": [
                {
                    "from": BITS,
                    "slice": SLICE,
                    "role": "data",
                    "precision": "exact",
                    "align": "bitwise",
                    "map": MAP,
                }
            ],
        }
        self.validate_as("Hop", hop)
        self.validate_as(
            "Endpoint",
            {
                "kind": "process",
                "queried": BITS,
                "ref": "process-a",
                "inst": "instance-a",
                "bits": BITS,
                "at": SLICE,
                "via": [route],
            },
        )

    def test_port_variants_and_trace_boundary(self):
        normal = {
            "ref": "port-a",
            "name": "p",
            "direction": "in",
            "kind": "port",
            "internal": {"kind": "direct", "signal": "signal-a", "bits": BITS},
            "type": "logic",
            "width": 1,
            "signed": False,
            "dims": [],
            "members": [],
        }
        self.validate_as("PortInfo", normal)
        value = copy.deepcopy(normal)
        value["kind"] = "interface"
        self.validate_as("PortInfo", value, False)
        interface = {k: normal[k] for k in ("ref", "name", "direction")}
        interface.update(
            kind="interface",
            internal={"kind": "unresolved", "reason": "interface_port"},
            interfaceDef="bus",
            modport="reader",
        )
        self.validate_as("PortInfo", interface)
        self.validate_as(
            "PinBinding",
            {
                "inst": "instance-a",
                "pin": "port-a",
                "port": "",
                "direction": "unknown",
                "width": None,
                "segments": [],
                "unresolved": "unknown_pin_width",
            },
        )
        boundary = {
            "id": "edge-a",
            "fact": "fact-a",
            "from": "node-a",
            "to": "node-b",
            "kind": "boundary",
            "role": "data",
            "precision": "exact",
            "align": "none",
            "map": [],
        }
        self.validate_as("TraceEdge", boundary)
        self.validate_as("TraceEdge", {**boundary, "fromBits": BITS}, False)
        self.validate_as(
            "TracePoint",
            {"slice": {"ref": "opaque-signal", "bits": {"lsb": 0, "width": 0}}},
        )
        self.validate_as(
            "TracePoint",
            {"slice": {"ref": "opaque-signal", "bits": {"lsb": 1, "width": 0}}},
            False,
        )
        self.validate_as(
            "TracePoint", {"slice": {"ref": "signal-a", "bits": {"lsb": 3, "width": 2}}}
        )

    def test_hop_successors_and_terminal_locations(self):
        continuation = {
            "from": BITS,
            "slice": SLICE,
            "role": "data",
            "precision": "exact",
            "align": "bitwise",
            "map": MAP,
        }
        base = {"fact": "fact-a", "from": SLICE, "map": [], "next": []}

        def response(hop, expected=True):
            with self.subTest(
                kind=hop["kind"], next=len(hop["next"]), at=hop.get("at")
            ):
                self.validate_as(
                    "ConnStepResponse",
                    {
                        "id": 1,
                        "ok": True,
                        "completeness": COMPLETE,
                        "result": {"hops": [hop], "hasConservative": False},
                    },
                    expected,
                )

        for kind in ("process", "register"):
            for count in range(4):
                with self.subTest(kind=kind, successors=count):
                    response(
                        {
                            **base,
                            "kind": kind,
                            "via": "process-or-register",
                            "next": [continuation] * count,
                        },
                        count <= 1,
                    )
        for kind in (
            "blackbox_pin",
            "primitive_pin",
            "top_port",
            "const",
            "unconnected",
            "unresolved",
        ):
            hop = {**base, "kind": kind}
            if kind in ("blackbox_pin", "primitive_pin", "top_port"):
                hop["at"] = {
                    "slice": SLICE,
                    "side": "inside" if kind == "top_port" else "outside",
                }
            if kind == "const":
                hop["value"] = "1'b0"
            if kind == "unresolved":
                hop["reason"] = "unknown_pin_width"
            with self.subTest(kind=kind):
                response(hop)
                response({**hop, "next": [continuation]}, False)
                if "at" in hop:
                    missing = copy.deepcopy(hop)
                    del missing["at"]
                    response(missing, False)
                    wrong_side = copy.deepcopy(hop)
                    wrong_side["at"]["side"] = (
                        "outside" if kind == "top_port" else "inside"
                    )
                    response(wrong_side, False)
                    empty_location = copy.deepcopy(hop)
                    # The handwritten base reuses SLICE; mutate only the terminal location.
                    empty_location["at"]["slice"] = copy.deepcopy(SLICE)
                    empty_location["at"]["slice"]["bits"]["width"] = 0
                    response(empty_location, False)
        response(
            {
                **base,
                "kind": "unresolved",
                "reason": "unknown_pin_width",
                "from": {"ref": "opaque-signal", "bits": {"lsb": 0, "width": 0}},
            }
        )
        # Binding relations can still have multiple successors; do not apply process limits to them.
        for kind in ("binding_up", "binding_down"):
            response({**base, "kind": kind, "next": [continuation, continuation]})

    def test_pattern_cases_shared_with_node(self):
        cases = json.loads((ROOT / "tests/pattern_cases.json").read_text())
        patterned = {
            name
            for name, definition in SCHEMA["$defs"].items()
            if "pattern" in definition
        }
        self.assertEqual(set(cases), patterned)
        for name, examples in cases.items():
            for expectation, values in examples.items():
                for value in values:
                    with self.subTest(definition=name, value=repr(value)):
                        self.validate_as(name, value, expectation == "valid")


if __name__ == "__main__":
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(Contract)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    print(
        f"Schema verdicts: {Contract.checks}; methods: {len(METHOD_CASES)}; product queries: 0; B tests changed: 0"
    )
    raise SystemExit(0 if result.wasSuccessful() else 1)
