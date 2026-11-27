"""Author tests for explicit roots and conservative gate reporting."""
import json
import subprocess
import unittest
import cli as legacy
from referencing import Resource
from jsonschema import Draft202012Validator

ROOT = legacy.ROOT
registry = legacy.registry
old = []
for name in ["logic-report.schema.json", "usage-report.schema.json"]:
    s = json.loads((ROOT / "sequential" / name).read_text())
    registry = registry.with_resource(s["$id"], Resource.from_contents(s))
    old.append(s)
schema = json.loads((ROOT / "sequential/gates-report.schema.json").read_text())
Draft202012Validator.check_schema(schema)
validator = Draft202012Validator(schema, registry=registry)


def run(top, *args, roots=None, code=0, flags=True, scope=None):
    argv = [legacy.BIN, "--top", top, "--scope", scope or top, "--recursive", str(legacy.FIXTURE),
            str(ROOT / "tests/gates.sv"), *(["--logic"] if flags else [])]
    for path, bit in (roots if roots is not None else [(top + ".clk", 0)]):
        argv += ["--clock-root", path, str(bit)]
    argv += args
    p = subprocess.run(argv, capture_output=True, text=True, timeout=15)
    assert p.returncode == code, (argv, p.returncode, p.stdout, p.stderr)
    r = json.loads(p.stdout); validator.validate(r)
    if "error" in r:
        return r
    assert r["formatVersion"] == 4
    assert len(r["clockRoots"]) == len(roots if roots is not None else [(top + ".clk", 0)])
    root_bits = {(x["point"]["slice"]["ref"], x["point"]["slice"]["bits"]["lsb"]) for x in r["clockRoots"]}
    assert sum(c.get("logic", {}).get("work", 0) for c in r["checks"]) <= r["limits"]["maxLogicWork"]
    for c in r["checks"]:
        if "logic" not in c: continue
        proof = c["logic"]
        for gate in proof["gates"]:
            clock = gate["clock"]
            assert (clock["sourceRef"], clock["origin"]["slice"]["bits"]["lsb"]) in root_bits
            process = next(x["result"] for x in proof["processes"] if x["result"]["ref"] == gate["process"])
            expr = process["expr"]
            for index in gate["exprPath"]: expr = expr["args"][index]
            assert expr["op"] == gate["op"] and len(expr["args"]) == 2
            assert 0 <= gate["bit"] < expr["width"]
        if c["verdict"] == "gated":
            assert proof["result"]["gate"] < len(proof["gates"])
            assert r["quality"]["completeness"] == "partial"
    for f in r["findings"]:
        if f["rule"] == "CLK-GATED":
            c = r["checks"][f["check"]]; proof = c["logic"]
            assert c["verdict"] == "gated" and f["severity"] == "warning"
            assert proof["gates"][proof["result"]["gate"]]["enable"]["verdict"] in ["generated", "undriven"]
            assert f["check"] in {x["clockCheck"] for x in r["registers"]}
    return r


def gate_check(r):
    return next(c for c in r["checks"] if c["path"].endswith(".u.c"))


class Gates(unittest.TestCase):
    def test_and_or_with_generated_enable(self):
        for top, op in [("gates_generated", "and"), ("gates_or", "or")]:
            r = run(top, "--require-complete", "--fail-on-error", code=4)
            self.assertEqual([f["rule"] for f in r["findings"]], ["CLK-GATED"])
            self.assertEqual(gate_check(r)["logic"]["gates"][0]["op"], op)

    def test_warning_without_complete_policy_is_exit_zero(self):
        self.assertEqual(run("gates_generated", "--fail-on-error")["findings"][0]["severity"], "warning")

    def test_input_and_output_inversions_have_provenance(self):
        r = run("gates_invert")
        p = gate_check(r)["logic"]; g = p["gates"][p["result"]["gate"]]
        self.assertEqual([p["result"]["inversions"], g["clock"]["inversions"], g["enable"]["inversions"]], [1, 1, 1])
        self.assertEqual(g["exprPath"], [0])

    def test_primary_enable_is_not_reported_uncontrollable(self):
        r = run("gates_primary", "--require-complete", code=4)
        self.assertEqual(gate_check(r)["verdict"], "gated")
        self.assertEqual(r["findings"], [])

    def test_undriven_enable_warns(self):
        r = run("gates_undriven")
        self.assertEqual([f["rule"] for f in r["findings"]], ["CLK-GATED"])

    def test_constant_open_and_closed_gates_keep_old_rules(self):
        r = run("gates_constants", "--require-complete", "--fail-on-error", code=1)
        self.assertEqual([f["rule"] for f in r["findings"]], ["CLK-UNCTRL"] * 2)
        self.assertFalse(any(c.get("logic", {}).get("gates") for c in r["checks"]))

    def test_uncertain_bypass_and_nested_gates_do_not_publish_candidate_findings(self):
        for top in ["gates_bypass", "gates_nested"]:
            r = run(top, "--require-complete", code=4)
            self.assertEqual(gate_check(r)["verdict"], "logic_boundary")
            self.assertEqual(r["findings"], [])

    def test_bus_flat_bit_and_cross_hierarchy_binding(self):
        for top, bit in [("gates_bus", 3), ("gates_hier", 1)]:
            r = run(top, roots=[(top + ".clocks", bit)])
            self.assertEqual([f["rule"] for f in r["findings"]], ["CLK-GATED"])
            self.assertEqual(r["clockRoots"][0]["point"]["slice"]["bits"], {"lsb": bit, "width": 1})
        r = run("gates_bus", roots=[("gates_bus.clocks", 1)])
        self.assertEqual(gate_check(r)["verdict"], "logic_boundary")
        self.assertEqual(r["findings"], [])

    def test_two_declared_root_operands_are_ambiguous(self):
        r = run("gates_roots", roots=[("gates_roots.clk", 0), ("gates_roots.other", 0)])
        self.assertEqual(gate_check(r)["verdict"], "logic_boundary")
        self.assertEqual(r["findings"], [])

    def test_vector_gate_proof_keeps_inner_expression_bit(self):
        r = run("gates_vector", roots=[("gates_vector.clocks", 2)])
        p = gate_check(r)["logic"]; g = p["gates"][p["result"]["gate"]]
        self.assertEqual(g["bit"], 2)
        self.assertEqual(g["clock"]["origin"]["slice"]["bits"]["lsb"], 2)
        self.assertEqual([f["rule"] for f in r["findings"]], ["CLK-GATED"])

    def test_async_role_does_not_become_a_clock_gating_finding(self):
        r = run("gates_async")
        self.assertTrue(any(c["verdict"] == "gated" for c in r["checks"]))
        self.assertEqual(r["findings"], [])

    def test_unsupported_process_remains_unknown(self):
        r = run("gates_procedure", "--require-complete", code=4)
        self.assertEqual(gate_check(r)["verdict"], "unknown")
        self.assertEqual(r["findings"], [])

    def test_clock_usage_composes_with_rooted_report(self):
        r = run("gates_generated", "--clock-usage")
        self.assertIn("clockUsage", r)
        self.assertEqual([f["rule"] for f in r["findings"]], ["CLK-GATED"])

    def test_root_argument_errors_and_duplicate_semantic_bit(self):
        for roots, code in [([("no_such_root", 0)], 3), ([("gates_generated.q", 0)], 2),
                            ([("gates_generated.u.c", 0)], 2), ([("gates_generated", 0)], 2),
                            ([("gates_generated.clk", 1)], 2),
                            ([("gates_generated.clk", 0), ("clk", 0)], 2)]:
            self.assertIn("error", run("gates_generated", roots=roots, code=code))
        self.assertIn("error", run("gates_generated", flags=False, code=2))
        self.assertIn("error", run("gates_generated", roots=[("clk", 0)] * 65, code=2))

    def test_missing_scope_and_wrong_object_follow_explicit_policy(self):
        r = run("gates_generated", scope="absent", code=3)
        self.assertEqual(r["error"]["code"], "not_found")
        for scope in ["gates_generated.clk", "gates_generated..bad"]:
            self.assertEqual(run("gates_generated", scope=scope, code=2)["error"]["code"], "invalid_arguments")

    def test_work_budget_does_not_publish_unproven_gate(self):
        r = run("gates_generated", "--max-logic-work", "1", "--require-complete", code=4)
        self.assertEqual(r["findings"], [])

    def test_old_schemas_reject_new_rooted_report(self):
        r = run("gates_generated")
        for s in old:
            self.assertFalse(Draft202012Validator(s, registry=registry).is_valid(r))
        self.assertFalse(legacy.validator.is_valid(r))


if __name__ == "__main__":
    unittest.main()
