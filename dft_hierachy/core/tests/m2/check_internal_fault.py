"""Independent fallback assertions, invoked only on an intentionally mutated binary.

HIER_BIN=... HIER_B_FAULT=drop_read|drop_write|erase_init python3 check_internal_fault.py
Mutations occur after generating facts and BEFORE independent validation. This
checker never edits source or changes its oracle according to observed output.
"""
import os
import unittest

from hiercli import COMPLETE, Design
from test_verify import counters, verify_facts


class RuntimeFault(unittest.TestCase):
    def test_failure_is_reported_and_safe_facts_are_returned(self):
        fault = os.environ["HIER_B_FAULT"]
        self.assertIn(fault, ("drop_read", "drop_write", "erase_init"))
        if fault == "erase_init":
            design = Design("m2/only_self_checked.sv", "only_init")
            reply = verify_facts("--top", "only_init", "m2/only_self_checked.sv")
        else:
            design = Design("m2/fallback_events.sv", "fallback_events")
            reply = verify_facts("--top", "fallback_events", "m2/fallback_events.sv")
        self.assertNotEqual(reply.returncode, 0, reply.stdout + reply.stderr)
        counted = counters(reply)
        self.assertGreater(counted["mismatched"], 0)
        if fault == "erase_init":
            self.assertEqual(counted["slangCompared"], 0)
            self.assertGreater(counted["selfChecked"], 0)
            inst = design.inst("only_init")
            proc = design.run("procs", inst)["items"]
            self.assertEqual(len(proc), 1)
            checked = design.run("proc", proc[0]["ref"])
            self.assertEqual(checked["result"]["writes"], [])
            self.assert_unsupported(checked["completeness"])
            signal = next(s["ref"] for s in design.signals(inst) if s["name"] == "initialized")
            for command in ("drivers", "loads"):
                self.assert_unsupported(design.run(command, signal, "--reach", "local")
                                        ["completeness"])
        else:
            self.assertGreater(counted["slangCompared"], 0)
            inst = design.inst("fallback_events")
            names = design.names(inst)
            procs = design.run("procs", inst)["items"]
            self.assertEqual(len(procs), 1)
            checked = design.run("proc", procs[0]["ref"])
            self.assertEqual(checked["completeness"], COMPLETE)
            writes = checked["result"]["writes"]
            self.assertEqual({names[w["target"]["ref"]] for w in writes}, {"y", "z"})
            self.assertEqual(len(writes), 2)
            for write in writes:
                self.assertEqual(write["target"]["bits"], {"lsb": 0, "width": 1})
                dependencies = {(names[d["signal"]], d["bits"]["lsb"], d["bits"]["width"],
                                 d["role"], d["precision"], d["align"]) for d in write["deps"]}
                self.assertEqual(dependencies, {
                    ("a", 0, 1, "data", "conservative", "all"),
                    ("b", 0, 1, "data", "conservative", "all"),
                    ("rst_n", 0, 1, "data", "conservative", "all"),
                    ("clk", 0, 1, "clock", "exact", "all"),
                    ("rst_n", 0, 1, "async", "exact", "all"),
                })

    def assert_unsupported(self, completeness):
        self.assertEqual(completeness["status"], "partial")
        self.assertIn("unsupported", [r["code"] for r in completeness["reasons"]])


if __name__ == "__main__":
    unittest.main(verbosity=2)
