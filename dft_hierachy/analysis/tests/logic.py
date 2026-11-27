"""Author-owned scalar source/value checks through the real C++ Core."""
import json
import subprocess
import unittest
import cli as legacy
from jsonschema import Draft202012Validator

ROOT = legacy.ROOT
schema = json.loads((ROOT / "sequential/logic-report.schema.json").read_text())
Draft202012Validator.check_schema(schema)
validator = Draft202012Validator(schema, registry=legacy.registry)


def run(top, *args, code=0, logic=True):
    argv = [legacy.BIN, "--top", top, "--scope", top, "--recursive", str(legacy.FIXTURE),
            str(ROOT / "tests/logic.sv"), *(["--logic"] if logic else []), *args]
    result = subprocess.run(argv, text=True, capture_output=True, timeout=15)
    assert result.returncode == code, (argv, result.returncode, result.stdout, result.stderr)
    report = json.loads(result.stdout)
    (validator if logic else legacy.validator).validate(report)
    if "checks" not in report:
        return report
    assert sum(c.get("logic", {}).get("work", 0) for c in report["checks"]) <= report["limits"].get("maxLogicWork", 0)
    for c in report["checks"]:
        if "logic" in c:
            assert c["verdict"] == c["logic"]["result"]["verdict"]
    for r in report["registers"]:
        for index in [r["clockCheck"], *r["asyncChecks"]]:
            assert index is None or 0 <= index < len(report["checks"])
    for finding in report["findings"]:
        check = report["checks"][finding["check"]]
        assert check["verdict"] in ("generated", "undriven", "constant")
        if finding["rule"].endswith("GEN"):
            assert check["logic"]["result"]["sourceRef"]
    return report


def clock(report, suffix=".u"):
    record = next(r for r in report["registers"] if r["instancePath"].endswith(suffix))
    return report["checks"][record["clockCheck"]]


class Logic(unittest.TestCase):
    def test_default_v1_stays_structural(self):
        old = run("logic_buffer", logic=False)
        self.assertEqual(old["formatVersion"], 1)
        self.assertEqual(clock(old)["verdict"], "logic_boundary")
        self.assertNotIn("logic", clock(old))
        self.assertNotIn("maxLogicWork", old["limits"])

    def test_buffer_and_inverter_reach_actual_primary(self):
        for top, inversions in [("logic_buffer", 0), ("logic_invert", 1)]:
            r = run(top, "--require-complete")
            self.assertEqual(r["formatVersion"], 2)
            self.assertEqual(r["quality"]["completeness"], "complete")
            c = clock(r)
            self.assertEqual(c["verdict"], "primary_input")
            self.assertEqual(c["logic"]["result"]["inversions"], inversions)
            self.assertTrue(c["logic"]["steps"])
            self.assertTrue(c["logic"]["processes"])
            self.assertEqual(r["findings"], [])

    def test_nonzero_lhs_and_concat_map_original_source_bits(self):
        r = run("logic_concat", "--require-complete")
        a = next(x for x in r["registers"] if x["instancePath"].endswith(".direct"))
        sources = [r["checks"][a["clockCheck"]], r["checks"][a["asyncChecks"][0]]]
        self.assertEqual([x["logic"]["result"]["origin"]["slice"]["bits"] for x in sources],
                         [{"lsb": 3, "width": 1}, {"lsb": 1, "width": 1}])
        self.assertEqual({f["rule"] for f in r["findings"]}, {"CLK-UNCTRL", "RST-UNCTRL"})

    def test_reordered_left_targets_use_value_map_not_write_order(self):
        r = run("logic_reorder", "--require-complete")
        record = r["registers"][0]
        points = [r["checks"][i]["logic"]["result"]["origin"] for i in
                  [record["clockCheck"], record["asyncChecks"][0]]]
        self.assertEqual([p["slice"]["bits"]["lsb"] for p in points], [3, 1])

    def test_boolean_constants_and_polarity(self):
        r = run("logic_boolean", "--require-complete")
        self.assertEqual([clock(r, ".u" + str(i))["verdict"] for i in range(4)],
                         ["primary_input"] * 3 + ["constant"])
        self.assertEqual(clock(r, ".u2")["logic"]["result"]["inversions"], 1)
        self.assertEqual(clock(r, ".u3")["logic"]["result"]["value"], "0")
        self.assertEqual([f["rule"] for f in r["findings"]], ["CLK-UNCTRL"])

    def test_constant_and_identical_muxes(self):
        r = run("logic_mux", "--require-complete")
        self.assertEqual([clock(r, name)["verdict"] for name in [".a", ".b"]], ["primary_input"] * 2)

    def test_rtl_generated_clock_and_async_have_separate_rules(self):
        r = run("logic_derived", "--fail-on-error", code=1)
        self.assertEqual(r["quality"]["completeness"], "complete")
        self.assertEqual({f["rule"] for f in r["findings"]}, {"CLK-GEN", "RST-GEN"})
        self.assertTrue(all(r["checks"][f["check"]]["logic"]["result"]["verdict"] == "generated" for f in r["findings"]))

    def test_unknown_mux_does_not_claim_no_test_bypass(self):
        r = run("logic_bypass", "--require-complete", code=4)
        self.assertEqual(clock(r)["verdict"], "logic_boundary")
        self.assertEqual(r["findings"], [])

    def test_register_identity_does_not_require_an_exact_data_dependency(self):
        r = run("logic_counter", "--require-complete")
        self.assertEqual([f["rule"] for f in r["findings"]], ["CLK-GEN"])
        self.assertEqual(clock(r)["verdict"], "generated")

    def test_procedure_conversion_and_port_expression_stop(self):
        for top, reason in [("logic_procedure", "unsupported_process_kind"),
                            ("logic_conversion", "unsupported_expression"),
                            ("logic_port_expression", "unsupported_process_kind")]:
            r = run(top, "--require-complete", code=4)
            self.assertEqual(clock(r)["verdict"], "unknown")
            self.assertIn(reason, clock(r)["logic"]["reasons"])
            self.assertEqual(r["findings"], [])

    def test_cycle_and_multiple_drivers_are_unknown(self):
        for top, reason in [("logic_cycle", "source_cycle"), ("logic_multiple", "multiple_drivers")]:
            r = run(top, "--require-complete", code=4)
            self.assertEqual(clock(r)["verdict"], "unknown")
            self.assertIn(reason, clock(r)["logic"]["reasons"])
            self.assertEqual(r["findings"], [])

    def test_four_state_fold_does_not_treat_z_as_one_or_zero(self):
        r = run("logic_fourstate", "--require-complete")
        self.assertEqual([clock(r, ".u" + str(i))["logic"]["result"]["value"] for i in range(4)],
                         ["x", "x", "0", "z"])

    def test_global_work_and_depth_limits_keep_partial(self):
        r = run("logic_buffer", "--max-logic-work", "1", "--require-complete", code=4)
        self.assertEqual(clock(r)["verdict"], "unknown")
        self.assertIn("budget_logic_work", clock(r)["logic"]["reasons"])
        self.assertEqual(r["findings"], [])
        many = run("logic_boolean", "--max-logic-work", "1", "--require-complete", code=4)
        self.assertGreater(len([c for c in many["checks"] if "logic" in c]), 1)
        self.assertLessEqual(sum(c.get("logic", {}).get("work", 0) for c in many["checks"]), 1)
        r = run("logic_buffer", "--max-depth", "2", "--require-complete", code=4)
        self.assertEqual(r["findings"], [])

    def test_partial_structural_trace_is_not_upgraded_by_logic(self):
        r = run("logic_buffer", "--max-trace-edges", "0", "--require-complete", code=4)
        self.assertEqual(r["findings"], [])
        self.assertTrue(all("logic" not in c for c in r["checks"]))

    def test_invalid_new_budget_and_explicit_legacy_schema_rejection(self):
        self.assertIn("error", run("logic_buffer", "--max-logic-work", "0", code=2))
        r = run("logic_buffer")
        self.assertTrue(list(legacy.validator.iter_errors(r)))
        self.assertIn("error", run("logic_buffer", "--max-logic-work", "100", logic=False, code=2))


if __name__ == "__main__":
    unittest.main()
