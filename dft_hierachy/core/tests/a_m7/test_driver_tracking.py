"""Handwritten HDL expectations; no implementation introspection or timing threshold."""

from collections import Counter
import os
from pathlib import Path
import subprocess
import sys
import unittest

PROBE = sys.argv.pop(1)
FIXTURE = Path(__file__).with_name("driver_cases.sv")

# Count, unidirectional ports, initializers, overlap diagnostic codes. Codes are
# from the pinned Slang AnalysisDiags, not learned from an optimized run.
CASES = {
    "dense_ports": (4000, 4000, 0, []),
    "legal_assigns": (3, 0, 1, []),
    "mixed_ports": (4, 2, 0, [59, 59]),  # OutputPortCoercion
    "mixed_reverse": (4, 2, 0, [59, 59]),
    "initializer_port": (3, 2, 1, [59, 59]),
    "split_ports": (3, 1, 0, []),
    "single_wire": (2, 0, 1, [17]),  # MultipleUWireDrivers
    "single_udnt": (2, 0, 1, [16]),  # MultipleUDNTDrivers
    "static_variable": (2, 0, 0, [56]),  # MultipleContAssigns
    "mixed_variable": (2, 0, 0, [53]),  # MixedVarAssigns
    "resolved_udnt": (2, 0, 1, []),
    "indirect_refs": (2, 0, 0, [56]),
    "indirect_modports": (2, 0, 0, [56]),
}


class DriverTracking(unittest.TestCase):
    def test_retention_and_diagnostics(self):
        for jobs in (1, 4):
            for top, (count, ports, initializers, overlaps) in CASES.items():
                with self.subTest(top=top, jobs=jobs):
                    env = dict(os.environ, HIER_A_DRIVER_SYMBOL=(
                        "i.n" if top == "indirect_modports" else "n"))
                    result = subprocess.run(
                        [PROBE, "-j", str(jobs), "--top", top, str(FIXTURE)],
                        env=env, capture_output=True, text=True, timeout=30)
                    self.assertEqual(result.returncode, 0, result.stderr)
                    lines = result.stdout.splitlines()
                    self.assertIn(f"drivers {count}", lines)
                    drivers = [line.split() for line in lines if line.startswith("driver ")]
                    self.assertEqual(len(drivers), count)
                    self.assertEqual(sum(int(row[3]) for row in drivers), ports)
                    self.assertEqual(sum(int(row[4]) for row in drivers), initializers)
                    codes = [int(line.split()[1]) for line in lines
                             if line.startswith("diag ")]
                    # Other expected diagnostics are unused definitions / values.
                    self.assertEqual(Counter(c for c in codes if c not in (72, 75, 80)),
                                     Counter(overlaps))
                    self.assertIn(f"diagnostics {len(codes)}", lines)
                    if top == "dense_ports":
                        self.assertEqual({row[5] for row in drivers},
                                         {f"dense_ports.g[{i}].u" for i in range(4000)})
                    if top == "split_ports":
                        self.assertEqual(Counter((row[1], row[2]) for row in drivers),
                                         Counter({("0", "0"): 1, ("1", "1"): 2}))


if __name__ == "__main__":
    unittest.main()
