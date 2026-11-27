"""Handwritten bit / source checks through actual L1 / Slang analysis."""
import json
from pathlib import Path
import subprocess
import sys
import unittest

PROBE = sys.argv.pop(1)
FIXTURE = Path(__file__).parents[1] / "fixtures/a_m7/analysis-lookup.sv"


class ProcedureAnalysis(unittest.TestCase):
    def check_mode(self, mode, count):
        result = subprocess.run([PROBE, str(FIXTURE), "analysis_top", mode, "none"],
                                capture_output=True, text=True, timeout=90)
        self.assertEqual(result.returncode, 0, result.stderr)
        leaves = [x for x in json.loads(result.stdout) if x["definition"] == "analysis_leaf"]
        self.assertEqual(len(leaves), count)
        for leaf in leaves:
            self.assertEqual(leaf["check"], dict(slangCompared=64, selfChecked=0,
                             skippedExternal=0, mismatched=0, issues=[]))
            self.assertEqual(leaf["completeness"], dict(status="complete", reasons=[]))
            self.assertEqual(len(leaf["processes"]), 64)
            signals = {x["name"]: x["ref"] for x in leaf["signals"]}
            for index, proc in enumerate(leaf["processes"]):
                bit = index // 2
                name = "y" if index % 2 else "z"
                value = proc["result"]
                self.assertEqual(value["kind"], "always_comb" if index % 2 else "assign")
                self.assertEqual(proc["completeness"], dict(status="complete", reasons=[]))
                self.assertEqual(len(value["writes"]), 1)
                write = value["writes"][0]
                self.assertEqual(write["target"], dict(ref=signals[name], bits=dict(lsb=bit, width=1)))
                self.assertEqual(write["deps"], [dict(signal=signals["a"], bits=dict(lsb=bit, width=1),
                                 role="data", precision="exact", align="bitwise")])
                self.assertTrue(any(x["ref"] == value["ref"] for x in leaf["sources"]))

    def test_shared_generated_sources(self):
        self.check_mode("shared", 1)

    def test_noncanonical_parent_subtree(self):
        self.check_mode("per-instance", 2)


if __name__ == "__main__":
    unittest.main()
