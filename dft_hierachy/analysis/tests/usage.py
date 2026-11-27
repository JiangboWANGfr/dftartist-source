"""Author RTL expectations for exact sequential usage, not independent B acceptance."""
import json
import subprocess
import unittest
import cli as legacy
from referencing import Resource
from jsonschema import Draft202012Validator

ROOT = legacy.ROOT
v2 = json.loads((ROOT / "sequential/logic-report.schema.json").read_text())
v3 = json.loads((ROOT / "sequential/usage-report.schema.json").read_text())
Draft202012Validator.check_schema(v3)
registry = legacy.registry.with_resource(v2["$id"], Resource.from_contents(v2))
validator = Draft202012Validator(v3, registry=registry)
old_validator = Draft202012Validator(v2, registry=registry)


def run(top, *args, code=0, scope=None, flags=True):
    argv = [legacy.BIN, "--top", top, "--scope", scope or top, "--recursive", str(legacy.FIXTURE),
            str(ROOT / "tests/usage.sv"), *(["--logic", "--clock-usage"] if flags else []), *args]
    p = subprocess.run(argv, text=True, capture_output=True, timeout=15)
    assert p.returncode == code, (argv, p.returncode, p.stdout, p.stderr)
    r = json.loads(p.stdout)
    validator.validate(r)
    if "error" in r:
        return r
    assert r["formatVersion"] == 3 and r["algorithm"] == "rtl-control-usage-v1"
    clocks = {record["clockCheck"] for record in r["registers"]} - {None}
    assert {u["check"] for u in r["clockUsage"]} == clocks
    assert len(clocks) == len(r["clockUsage"])
    assert sum(u["work"] for u in r["clockUsage"]) <= r["limits"]["maxUsageWork"]
    for u in r["clockUsage"]:
        for w in u["witnesses"]:
            step = u["steps"][w["step"]]
            assert step["direction"] == "forward"
            hop = step["response"]["result"]["hops"][w["hop"]]
            n = hop["next"][w["continuation"]]
            assert hop["kind"] == "register" and hop["fact"]
            assert n["precision"] == "exact" and n["role"] == w["role"]
        findings = [f for f in r["findings"] if f["rule"] == "CLK-AS-DATA" and f["check"] == u["check"]]
        assert len(findings) == bool(u["witnesses"])
        assert all(f["severity"] == "warning" for f in findings)
    return r


def warnings(r):
    return [f for f in r["findings"] if f["rule"] == "CLK-AS-DATA"]


class Usage(unittest.TestCase):
    def test_clock_only_has_no_data_warning(self):
        r = run("usage_clean", "--require-complete")
        self.assertEqual(warnings(r), [])
        self.assertTrue(all(u["complete"] for u in r["clockUsage"]))

    def test_same_clock_as_sequential_data_and_warning_policy(self):
        r = run("usage_direct", "--require-complete", "--fail-on-error")
        self.assertEqual(len(warnings(r)), 1)
        self.assertEqual({w["role"] for u in r["clockUsage"] for w in u["witnesses"]}, {"data"})

    def test_clock_as_async_control_is_a_separate_role(self):
        r = run("usage_async", "--require-complete")
        self.assertEqual(len(warnings(r)), 1)
        self.assertIn("async", {w["role"] for u in r["clockUsage"] for w in u["witnesses"]})

    def test_clock_as_condition(self):
        r = run("usage_condition", "--require-complete")
        self.assertEqual(len(warnings(r)), 1)
        self.assertIn("control", {w["role"] for u in r["clockUsage"] for w in u["witnesses"]})

    def test_different_bus_bits_do_not_alias(self):
        self.assertEqual(warnings(run("usage_bits", "--require-complete")), [])

    def test_shared_body_instances_and_bus_bits(self):
        r = run("usage_cross", "--require-complete")
        self.assertEqual(len(warnings(r)), 1)
        self.assertEqual(r["checks"][warnings(r)[0]["check"]]["path"], "usage_cross.a.c")

    def test_nonzero_declared_range_and_reordered_binding(self):
        r = run("usage_remap", "--require-complete")
        self.assertEqual(len(warnings(r)), 1)
        self.assertEqual(r["checks"][warnings(r)[0]["check"]]["path"], "usage_remap.u.a.c")

    def test_scope_clock_can_have_a_use_outside_its_register_scope(self):
        r = run("usage_cross", "--require-complete", scope="usage_cross.a")
        self.assertEqual(len(r["registers"]), 1)
        self.assertEqual(len(warnings(r)), 1)
        self.assertTrue(any(s["point"]["slice"]["ref"] != r["checks"][0]["point"]["slice"]["ref"]
                            for s in r["clockUsage"][0]["steps"]))

    def test_original_control_points_are_not_merged_across_instances(self):
        r = run("usage_shared", "--require-complete")
        self.assertEqual(len(r["clockUsage"]), 2)
        self.assertEqual(len(warnings(r)), 2)
        for u in r["clockUsage"]:
            self.assertEqual(len(u["witnesses"]), 2)

    def test_buffer_assignment_is_not_a_sequential_data_witness(self):
        r = run("usage_combinational", "--require-complete", code=4)
        self.assertEqual(warnings(r), [])
        self.assertIn("combinational_usage_boundary", [s for u in r["clockUsage"] for s in u["reasons"]])

    def test_conservative_dependency_is_not_a_warning(self):
        r = run("usage_conservative", "--require-complete", code=4)
        self.assertEqual(warnings(r), [])
        self.assertIn("conservative_usage", [s for u in r["clockUsage"] for s in u["reasons"]])

    def test_partial_opaque_domain_keeps_independent_warning(self):
        r = run("usage_opaque", "--require-complete", code=4)
        self.assertEqual(len(warnings(r)), 1)
        self.assertFalse(r["clockUsage"][0]["complete"])

    def test_error_and_warning_policies_remain_separate(self):
        r = run("usage_mixed", "--fail-on-error", code=1)
        self.assertEqual({f["severity"] for f in r["findings"]}, {"error", "warning"})

    def test_work_and_depth_limits_keep_partial_and_existing_witness(self):
        r = run("usage_direct", "--max-usage-work", "1", "--require-complete", code=4)
        self.assertEqual(warnings(r), [])
        self.assertIn("budget_usage_work", r["clockUsage"][0]["reasons"])
        r = run("usage_depth", "--max-depth", "1", "--require-complete", code=4)
        self.assertTrue(warnings(r))
        self.assertIn("budget_usage_depth", [s for u in r["clockUsage"] for s in u["reasons"]])

    def test_paged_fanout_retains_all_occurrences(self):
        r = run("usage_many", "--max-usage-work", "1000000", "--require-complete")
        self.assertEqual(len(r["clockUsage"]), 36)
        self.assertTrue(all(len(u["witnesses"]) == 36 for u in r["clockUsage"]))
        self.assertTrue(any(s["response"]["result"].get("next") for u in r["clockUsage"] for s in u["steps"]))

    def test_invalid_flags_budgets_and_old_schema_rejection(self):
        for args in [("--clock-usage",), ("--logic", "--max-usage-work", "1")]:
            self.assertIn("error", run("usage_direct", *args, flags=False, code=2))
        for value in ["0", "1000001"]:
            self.assertIn("error", run("usage_direct", "--max-usage-work", value, code=2))
        r = run("usage_direct")
        self.assertTrue(list(old_validator.iter_errors(r)))
        self.assertTrue(list(legacy.validator.iter_errors(r)))


if __name__ == "__main__":
    unittest.main()
