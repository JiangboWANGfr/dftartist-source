"""Known RHS bit positions through actual L1 facts, independent of dependency inference."""
import json
from pathlib import Path
import subprocess
import sys
import unittest

PROBE = sys.argv.pop(1)
FIXTURE = Path(__file__).parents[1] / "fixtures/a_m7/expression-targets.sv"


class ExpressionTargets(unittest.TestCase):
    def check_mode(self, mode, count):
        result = subprocess.run([PROBE, str(FIXTURE), "target_top", mode, "none"],
                                capture_output=True, text=True, timeout=90)
        self.assertEqual(result.returncode, 0, result.stderr)
        leaves = [b for b in json.loads(result.stdout) if b["definition"] == "target_leaf"]
        self.assertEqual(len(leaves), count)
        order = [(17 * i) % 64 for i in range(64)]
        for body in leaves:
            self.assertEqual(body["check"], dict(slangCompared=2, selfChecked=0,
                             skippedExternal=0, mismatched=0, issues=[]))
            self.assertEqual(body["completeness"], dict(status="complete", reasons=[]))
            names = {s["ref"]: s["name"] for s in body["signals"]}
            self.assertEqual(len(body["processes"]), 2)
            for proc in body["processes"]:
                self.assertEqual(proc["completeness"], dict(status="complete", reasons=[]))
                writes = proc["result"]["writes"]
                self.assertEqual(len(writes), 64)
                for write in writes:
                    name = names[write["target"]["ref"]]
                    if name == "y":
                        bit = write["target"]["bits"]["lsb"]
                        self.assertEqual(write["target"]["bits"]["width"], 1)
                        expected = dict(**{"from": 63 - order.index(bit)}, to=bit, width=1)
                    else:
                        self.assertTrue(name.startswith("r"))
                        index = int(name[1:])
                        self.assertEqual(write["target"]["bits"], dict(lsb=0, width=2))
                        expected = dict(**{"from": 2 * (63 - index)}, to=0, width=2)
                    self.assertEqual(write["exprMap"], dict(status="mapped", segments=[expected]))
                    self.assertEqual(len(write["deps"]), 1)
                    dep = write["deps"][0]
                    self.assertEqual(dep["bits"], dict(lsb=expected["from"], width=expected["width"]))
                    self.assertEqual((dep["role"], dep["precision"], dep["align"]),
                                     ("data", "exact", "bitwise"))

    def test_shared_leaf(self):
        self.check_mode("shared", 1)

    def test_each_occurrence(self):
        self.check_mode("per-instance", 2)


if __name__ == "__main__":
    unittest.main()
