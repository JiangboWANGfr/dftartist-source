"""Author static input-value cases through real Core; no independent B claim."""
import json
import subprocess
import unittest
import cli as legacy
from referencing import Resource
from jsonschema import Draft202012Validator

ROOT = legacy.ROOT
registry = legacy.registry
old = [legacy.validator]
for name in ["logic-report.schema.json", "usage-report.schema.json", "gates-report.schema.json"]:
    s = json.loads((ROOT / "sequential" / name).read_text())
    registry = registry.with_resource(s["$id"], Resource.from_contents(s))
    old.append(s)
schema = json.loads((ROOT / "sequential/values-report.schema.json").read_text())
Draft202012Validator.check_schema(schema)
validator = Draft202012Validator(schema, registry=registry)


def run(top, values, *args, code=0, flags=True):
    argv = [legacy.BIN, "--top", top, "--scope", top, "--recursive", str(legacy.FIXTURE),
            *(str(ROOT / "tests" / name) for name in ["logic.sv", "usage.sv", "gates.sv", "values.sv"]),
            *(["--logic"] if flags else [])]
    for path, bit, value in values:
        argv += ["--input-value", path, str(bit), str(value)]
    argv += args
    p = subprocess.run(argv, capture_output=True, text=True, timeout=15)
    assert p.returncode == code, (argv, p.returncode, p.stdout, p.stderr)
    r = json.loads(p.stdout); validator.validate(r)
    if "error" in r:
        return r
    assert r["formatVersion"] == 5 and r["interpretation"] == "under_input_values"
    assert len(r["inputValues"]) == len(values)
    assert [x["value"] for x in r["inputValues"]] == [str(x[2]) for x in values]
    assert sum(c.get("logic", {}).get("work", 0) for c in r["checks"]) <= r["limits"]["maxLogicWork"]
    for c in r["checks"]:
        if "logic" not in c: continue
        proof = c["logic"]
        assert len(set(proof["appliedInputs"])) == len(proof["appliedInputs"])
        for i in proof["appliedInputs"]:
            point = r["inputValues"][i]["point"]
            assert any(hop["kind"] == "top_port" and hop["via"] == point["slice"]["ref"] and
                       hop.get("at", {}).get("slice", {}).get("bits") == point["slice"]["bits"]
                       for step in proof["steps"] for hop in step["response"]["result"]["hops"])
        assert c["verdict"] == proof["result"]["verdict"]
    return r


def clock(r, suffix=".u"):
    record = next(x for x in r["registers"] if x["instancePath"].endswith(suffix))
    return r["checks"][record["clockCheck"]]


class Values(unittest.TestCase):
    def test_and_enable_one_opens_under_explicit_context(self):
        r = run("gates_primary", [("gates_primary.en", 0, 1)], "--clock-root", "gates_primary.clk", "0", "--require-complete")
        self.assertEqual(r["quality"]["completeness"], "complete")
        self.assertEqual(clock(r)["verdict"], "primary_input")
        self.assertEqual(clock(r)["logic"]["appliedInputs"], [0])
        self.assertEqual(r["findings"], [])

    def test_and_enable_zero_closes_and_preserves_error_policy(self):
        r = run("gates_primary", [("gates_primary.en", 0, 0)], "--require-complete", "--fail-on-error", code=1)
        self.assertEqual(clock(r)["logic"]["result"]["value"], "0")
        self.assertEqual([f["rule"] for f in r["findings"]], ["CLK-UNCTRL"])

    def test_or_enable_zero_and_one(self):
        opened = run("values_or", [("values_or.en", 0, 0)], "--require-complete")
        self.assertEqual(clock(opened)["verdict"], "primary_input")
        closed = run("values_or", [("values_or.en", 0, 1)], "--require-complete", "--fail-on-error", code=1)
        self.assertEqual(clock(closed)["logic"]["result"]["value"], "1")

    def test_test_bypass_selects_primary_or_register_source(self):
        opened = run("logic_bypass", [("logic_bypass.sel", 0, 1)], "--require-complete")
        self.assertEqual(clock(opened)["verdict"], "primary_input")
        self.assertEqual(opened["findings"], [])
        derived = run("logic_bypass", [("logic_bypass.sel", 0, 0)], "--require-complete", "--fail-on-error", code=1)
        self.assertEqual(clock(derived)["verdict"], "generated")
        self.assertEqual([f["rule"] for f in derived["findings"]], ["CLK-GEN"])

    def test_multi_bit_context_and_lazy_branch_reads(self):
        values = [("values_nested_mux.mode", 0, 1), ("values_nested_mux.mode", 1, 1)]
        opened = run("values_nested_mux", values, "--require-complete")
        self.assertEqual(clock(opened)["verdict"], "primary_input")
        self.assertEqual(set(clock(opened)["logic"]["appliedInputs"]), {0, 1})
        values[1] = ("values_nested_mux.mode", 1, 0)
        lazy = run("values_nested_mux", values, "--require-complete")
        self.assertEqual(clock(lazy)["logic"]["appliedInputs"], [1])

    def test_nonzero_declared_bus_range_and_hierarchical_bit(self):
        opened = run("values_hier", [("values_hier.modes", 1, 1)], "--require-complete")
        self.assertEqual(clock(opened, ".child.u")["verdict"], "primary_input")
        wrong_bit = run("values_hier", [("values_hier.modes", 2, 1)], "--require-complete", code=4)
        self.assertEqual(clock(wrong_bit, ".child.u")["verdict"], "logic_boundary")
        self.assertEqual(clock(wrong_bit, ".child.u")["logic"]["appliedInputs"], [])

    def test_fixed_direct_clock_is_conditional_constant_not_core_constant(self):
        r = run("values_clock", [("values_clock.clk", 0, 0)], "--require-complete", "--fail-on-error", code=1)
        c = r["checks"][0]
        self.assertEqual(c["verdict"], "constant")
        self.assertEqual(c["logic"]["appliedInputs"], [0])
        self.assertTrue(any(n["kind"] == "top_port" for n in c["trace"]["result"]["nodes"]))
        self.assertFalse(any(n["kind"] == "const" for n in c["trace"]["result"]["nodes"]))

    def test_async_static_value_is_a_separate_control_finding(self):
        r = run("gates_primary", [("gates_primary.en", 0, 1), ("gates_primary.rst", 0, 1)], "--require-complete")
        self.assertEqual([f["rule"] for f in r["findings"]], ["RST-UNCTRL"])

    def test_clock_root_can_also_be_held_fixed(self):
        r = run("values_clock", [("values_clock.clk", 0, 1)], "--clock-root", "values_clock.clk", "0")
        self.assertEqual(r["clockRoots"][0]["point"], r["inputValues"][0]["point"])
        self.assertEqual(r["checks"][0]["verdict"], "constant")

    def test_structural_usage_is_not_pruned_by_a_static_value(self):
        r = run("usage_direct", [("usage_direct.clk", 0, 0)], "--clock-usage", "--require-complete")
        self.assertEqual({f["rule"] for f in r["findings"]}, {"CLK-UNCTRL", "CLK-AS-DATA"})
        self.assertEqual(len(r["clockUsage"][0]["witnesses"]), 1)

    def test_unsupported_process_port_expression_and_multi_driver_stay_unknown(self):
        for top in ["logic_procedure", "logic_port_expression", "logic_multiple"]:
            r = run(top, [(top + ".clk", 0, 1)], "--require-complete", code=4)
            self.assertEqual(clock(r)["verdict"], "unknown")
            self.assertEqual(r["findings"], [])

    def test_structural_partial_is_never_upgraded_by_an_input_value(self):
        r = run("logic_buffer", [("logic_buffer.clk", 0, 0)], "--max-trace-edges", "0", "--require-complete", code=4)
        self.assertEqual(r["findings"], [])
        self.assertTrue(all("logic" not in c for c in r["checks"]))

    def test_budget_does_not_publish_a_conditional_constant(self):
        r = run("values_clock", [("values_clock.clk", 0, 0)], "--max-logic-work", "1", "--require-complete", code=4)
        self.assertEqual(r["findings"], [])
        self.assertEqual(r["checks"][0]["verdict"], "unknown")

    def test_unused_context_is_reported_but_not_claimed_as_read(self):
        r = run("gates_primary", [("gates_primary.d", 0, 1)])
        self.assertTrue(all(not c.get("logic", {}).get("appliedInputs") for c in r["checks"]))

    def test_duplicate_aliases_and_conflicting_values_are_rejected(self):
        for value in [0, 1]:
            r = run("values_clock", [("values_clock.clk", 0, 0), ("clk", 0, value)], code=2)
            self.assertEqual(r["error"]["code"], "invalid_arguments")

    def test_only_in_range_top_input_bits_may_be_set(self):
        for top, path, bit, code in [("values_clock", "absent", 0, 3),
                                     ("values_clock", "values_clock.q", 0, 2),
                                     ("gates_primary", "gates_primary.u.c", 0, 2),
                                     ("values_clock", "values_clock.clk", 1, 2),
                                     ("values_inout", "values_inout.clk", 0, 2)]:
            self.assertIn("error", run(top, [(path, bit, 0)], code=code))

    def test_invalid_value_missing_argument_and_explicit_mode(self):
        for level in ["x", "z", "2", "-1", ""]:
            self.assertIn("error", run("values_clock", [("values_clock.clk", 0, level)], code=2))
        self.assertIn("error", run("values_clock", [], "--input-value", "values_clock.clk", "0", code=2))
        self.assertIn("error", run("values_clock", [("values_clock.clk", 0, 0)], flags=False, code=2))
        self.assertIn("error", run("values_clock", [("clk", 0, 0)] * 65, code=2))

    def test_all_four_old_schemas_reject_conditional_report(self):
        r = run("values_clock", [("values_clock.clk", 0, 0)])
        self.assertFalse(old[0].is_valid(r))
        for s in old[1:]:
            self.assertFalse(Draft202012Validator(s, registry=registry).is_valid(r))


if __name__ == "__main__":
    unittest.main()
