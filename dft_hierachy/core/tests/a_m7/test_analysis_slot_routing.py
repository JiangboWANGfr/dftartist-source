"""Mixed arrays/generate/primitive positions retain actual Slang analysis sources."""
import json
from pathlib import Path
import subprocess
import sys
import unittest

PROBE = sys.argv.pop(1)
FIXTURE = Path(__file__).parents[1] / "fixtures/a_m7/analysis-slot-routing.sv"


class AnalysisRouting(unittest.TestCase):
    def check_mode(self, mode, counts):
        result = subprocess.run([PROBE, str(FIXTURE), "route_top", mode, "none"],
                                capture_output=True, text=True, timeout=90)
        self.assertEqual(result.returncode, 0, result.stderr)
        bodies = json.loads(result.stdout)
        for name, expected_count in counts.items():
            leaves = [b for b in bodies if b["definition"] == name]
            self.assertEqual(len(leaves), expected_count)
            for body in leaves:
                self.assertEqual(body["check"], dict(slangCompared=1, selfChecked=0,
                                 skippedExternal=0, mismatched=0, issues=[]))
                self.assertEqual(body["completeness"], dict(status="complete", reasons=[]))
                signals = {s["name"]: s["ref"] for s in body["signals"]}
                self.assertEqual(len(body["processes"]), 1)
                proc = body["processes"][0]
                self.assertEqual(proc["completeness"], dict(status="complete", reasons=[]))
                value = proc["result"]
                self.assertEqual(value["expr"]["op"], "ref" if name == "route_n" else "not")
                self.assertEqual(len(value["writes"]), 1)
                write = value["writes"][0]
                self.assertEqual(write["target"], dict(ref=signals["y"], bits=dict(lsb=0, width=1)))
                self.assertEqual(write["deps"], [dict(signal=signals["a"], bits=dict(lsb=0, width=1),
                                 role="data", precision="exact", align="bitwise")])
                self.assertEqual(write["exprMap"], dict(status="mapped", segments=[
                                 dict(**{"from": 0}, to=0, width=1)]))

    def test_shared_bodies(self):
        self.check_mode("shared", {"route_n": 1, "route_i": 1})

    def test_noncanonical_arrays_and_generated_children(self):
        self.check_mode("per-instance", {"route_n": 12, "route_i": 4})


if __name__ == "__main__":
    unittest.main()
