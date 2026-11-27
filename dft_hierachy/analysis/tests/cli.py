"""Author-owned hand-written RTL expectations; not independent B acceptance."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from jsonschema import Draft202012Validator
from referencing import Registry, Resource

BIN = str(Path(sys.argv.pop(1)).resolve())
CORE_SCHEMA = Path(sys.argv.pop(1)).resolve()
ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "tests/design.sv"
core = json.loads(CORE_SCHEMA.read_text())
schema = json.loads((ROOT / "sequential/report.schema.json").read_text())
Draft202012Validator.check_schema(schema)
registry = Registry().with_resource(core["$id"], Resource.from_contents(core))
validator = Draft202012Validator(schema, registry=registry)


def run(top, *args, code=0, files=None, scope=None):
    command = [BIN, "--top", top, "--scope", scope or top, *(files or [str(FIXTURE)]), *args]
    p = subprocess.run(command, capture_output=True, text=True, timeout=15)
    assert p.returncode == code, (command, p.returncode, p.stdout, p.stderr)
    value = json.loads(p.stdout)
    validator.validate(value)
    if "registers" in value:
        for record in value["registers"]:
            assert len(record["asyncChecks"]) == len(record["fact"]["async"])
            for index in [record["clockCheck"], *record["asyncChecks"]]:
                assert index is None or 0 <= index < len(value["checks"])
        for finding in value["findings"]:
            assert 0 <= finding["check"] < len(value["checks"])
            check = value["checks"][finding["check"]]
            assert check["verdict"] in ("undriven", "constant")
            assert check["trace"]["completeness"]["status"] == "complete"
        assert sum(len(c.get("trace", {}).get("result", {}).get("nodes", [])) for c in value["checks"]) <= value["limits"]["maxTraceNodes"]
        assert sum(len(c.get("trace", {}).get("result", {}).get("edges", [])) for c in value["checks"]) <= value["limits"]["maxTraceEdges"]
    return value


class Sequential(unittest.TestCase):
    def test_cross_hierarchy_primary_inputs_and_synchronous_reset(self):
        r = run("clean", "--recursive")
        self.assertEqual(r["quality"], {"completeness": "complete", "reasons": []})
        self.assertEqual(len(r["registers"]), 2)
        self.assertEqual(r["visitedInstances"], 2)
        self.assertEqual(r["findings"], [])
        self.assertEqual([c["verdict"] for c in r["checks"]], ["primary_input"] * 3)
        self.assertEqual(sum(len(x["fact"]["async"]) for x in r["registers"]), 1)
        self.assertTrue(all(x.get("source", {}).get("start", {}).get("line", 0) > 0 for x in r["registers"]))
        self.assertEqual({x["instancePath"] for x in r["registers"]}, {"clean", "clean.u"})

    def test_scope_does_not_implicitly_recurse(self):
        r = run("clean")
        self.assertEqual(len(r["registers"]), 1)
        self.assertEqual(r["visitedInstances"], 1)
        self.assertEqual(r["registers"][0]["fact"]["async"], [])

    def test_child_scope_still_traces_to_design_top(self):
        r = run("clean", scope="clean.u")
        self.assertEqual(len(r["registers"]), 1)
        self.assertEqual(r["findings"], [])
        self.assertEqual(r["quality"]["completeness"], "complete")

    def test_undriven_clock_and_async_reset(self):
        r = run("undriven", "--recursive")
        self.assertEqual({x["rule"] for x in r["findings"]}, {"CLK-UNCTRL", "RST-UNCTRL"})
        self.assertEqual([c["verdict"] for c in r["checks"]], ["undriven"] * 2)
        self.assertEqual(r["quality"]["completeness"], "complete")

    def test_constants_and_failure_policy(self):
        r = run("constant_control", "--recursive", "--fail-on-error", code=1)
        self.assertEqual(len(r["findings"]), 2)
        self.assertEqual([c["verdict"] for c in r["checks"]], ["constant"] * 2)
        self.assertEqual(r["quality"]["completeness"], "complete")

    def test_unconnected_input_is_distinct_from_an_internal_logic_boundary(self):
        r = run("unconnected_control", "--recursive")
        self.assertEqual([f["rule"] for f in r["findings"]], ["CLK-UNCTRL"])
        check = r["checks"][r["findings"][0]["check"]]
        self.assertTrue(any(n["kind"] == "unconnected" for n in check["trace"]["result"]["nodes"]))

    def test_bidirectional_top_is_not_a_proven_primary_input(self):
        r = run("bidirectional_control", "--require-complete", code=4)
        self.assertEqual(r["findings"], [])
        self.assertEqual(r["checks"][0]["verdict"], "unknown")

    def test_logic_is_not_an_uncontrollability_proof(self):
        r = run("generated_control", "--recursive", "--require-complete", code=4)
        self.assertEqual(r["findings"], [])
        self.assertIn("logic_boundary", [x["verdict"] for x in r["checks"]])
        self.assertEqual(r["quality"]["completeness"], "partial")

    def test_shared_body_occurrences_and_original_bus_bits(self):
        r = run("split_bits", "--recursive")
        self.assertEqual(len(r["registers"]), 2)
        self.assertEqual({x["instancePath"] for x in r["registers"]}, {"split_bits.a", "split_bits.b"})
        seen = []
        for x in r["registers"]:
            check = r["checks"][x["clockCheck"]]
            termini = [n for n in check["trace"]["result"]["nodes"] if n["kind"] == "top_port"]
            self.assertEqual(len(termini), 1)
            seen.append(termini[0]["point"]["slice"]["bits"])
        self.assertEqual(sorted(seen, key=lambda x: x["lsb"]), [{"lsb": 0, "width": 1}, {"lsb": 1, "width": 1}])

    def test_blackbox_and_empty_design_quality(self):
        r = run("with_blackbox", "--recursive", "--require-complete", code=4)
        self.assertEqual(r["findings"], [])
        self.assertIn("unmodeled_instance", r["quality"]["reasons"])
        r = run("empty", "--recursive", "--require-complete")
        self.assertEqual(r["registers"], [])
        self.assertEqual(r["quality"]["completeness"], "complete")

    def test_fact_and_instance_limits_do_not_claim_clean(self):
        for flag, expected in [("--max-facts", "budget_facts"), ("--max-instances", "budget_instances")]:
            r = run("clean", "--recursive", flag, "1", "--require-complete", code=4)
            self.assertIn(expected, r["quality"]["reasons"])
            self.assertEqual(len(r["registers"]), 1)
        exact = run("clean", "--max-facts", "1", "--require-complete")
        self.assertEqual(exact["quality"]["completeness"], "complete")

    def test_control_and_aggregate_graph_budgets(self):
        r = run("clean", "--recursive", "--max-checks", "1", "--require-complete", code=4)
        self.assertEqual(len(r["checks"]), 1)
        self.assertIn("budget_checks", r["quality"]["reasons"])
        self.assertTrue(any(x["clockCheck"] is None for x in r["registers"]))
        for flag, value in [("--max-trace-nodes", "1"), ("--max-trace-edges", "0"), ("--max-depth", "0")]:
            r = run("clean", "--recursive", flag, value, "--require-complete", code=4)
            self.assertEqual(r["findings"], [])
            self.assertTrue(any(c.get("trace", {}).get("completeness", {}).get("status") == "partial" for c in r["checks"]))

    def test_invalid_inputs_are_not_successful_reports(self):
        for args in [("--max-facts", "0"), ("--max-facts", "1x"), ("--max-checks", "10001"), ("--recursive", "--recursive"), ("--unknown", "x")]:
            r = run("clean", *args, code=2)
            self.assertIn("error", r)
        r = run("clean", scope="no_such_scope", code=3)
        self.assertEqual(r["error"]["code"], "not_found")

    def test_one_control_can_be_shared_by_clock_and_async_roles(self):
        r = run("reused_roles")
        self.assertEqual(len(r["registers"]), 2)
        self.assertEqual(len(r["checks"]), 2)
        self.assertEqual({f["rule"] for f in r["findings"]}, {"CLK-UNCTRL", "RST-UNCTRL"})
        self.assertEqual(len({f["check"] for f in r["findings"]}), 1)

    def test_partial_analysis_keeps_proven_findings_and_policy_priority(self):
        r = run("mixed_controls", "--recursive", "--fail-on-error", code=1)
        self.assertEqual(r["quality"]["completeness"], "partial")
        self.assertEqual([f["rule"] for f in r["findings"]], ["CLK-UNCTRL"])
        r = run("mixed_controls", "--recursive", "--fail-on-error", "--require-complete", code=4)
        self.assertEqual(len(r["findings"]), 1)

    def test_relative_filelist_and_compile_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            p = Path(directory)
            (p / "design.sv").write_bytes(FIXTURE.read_bytes())
            (p / "inputs.f").write_text("design.sv\n")
            r = run("clean", "--recursive", files=["-F", str(p / "inputs.f")])
            self.assertEqual(len(r["registers"]), 2)
            (p / "broken.sv").write_text("module broken(input a; endmodule\n")
            self.assertIn("error", run("broken", files=[str(p / "broken.sv")], code=3))

    def test_output_failure_is_not_success(self):
        descriptor = os.open(os.devnull, os.O_RDONLY)
        try:
            p = subprocess.run([BIN, "--top", "empty", "--scope", "empty", str(FIXTURE)],
                               stdout=descriptor, stderr=subprocess.PIPE, timeout=15)
            self.assertEqual(p.returncode, 5)
        finally:
            os.close(descriptor)


if __name__ == "__main__":
    unittest.main()
