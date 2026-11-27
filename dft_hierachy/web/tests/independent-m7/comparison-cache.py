"""B oracle from DESIGN 5.3 and handwritten fixture topology, not A tests/output."""
import ctypes
import json
import os
from pathlib import Path
import re
import subprocess
import time
import unittest

BIN = os.environ["HIER_BIN"]
FIXTURE = str(Path(__file__).with_name("dynamic-writes.sv"))
SIZE_MAX = 2 ** (ctypes.sizeof(ctypes.c_size_t) * 8) - 1
ROWS = []


class ComparisonCache(unittest.TestCase):
    def call(self, identifier, args):
        argv = [BIN, *args]
        start = time.monotonic()
        try:
            result = subprocess.run(argv, input="", text=True, capture_output=True,
                                    timeout=30)  # Hang guard, not product SLA.
        except subprocess.TimeoutExpired:
            ROWS.append({"id": identifier, "argv": argv, "timeout": True})
            self.fail("CLI did not terminate within test watchdog")
        ROWS.append({"id": identifier, "argv": argv, "exit": result.returncode,
                     "seconds": time.monotonic() - start,
                     "stdout": result.stdout, "stderr": result.stderr})
        return result

    def success(self, identifier, args):
        result = self.call(identifier, args)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        # Handwritten fixture: one root, five module types, two of each leaf.
        found = re.search(r"instances compared (\d+), bodies shared (\d+), "
                          r"bodies per instance (\d+), different (\d+), "
                          r"failed queries (\d+)", result.stdout)
        self.assertIsNotNone(found, result.stdout)
        self.assertEqual(tuple(map(int, found.groups())), (11, 6, 11, 0, 0))

    def rejected(self, identifier, args):
        result = self.call(identifier, args)
        self.assertNotEqual(result.returncode, 0, result.stdout)
        if args[0] == "serve":
            # DESIGN 5.6.1: before a snapshot exists, startup errors use stderr,
            # never an uncorrelated JSON reply or fabricated hello on stdout.
            self.assertEqual(result.stdout, "")
            self.assertIn("--comparison-cache-bytes", result.stderr)
            return
        body = json.loads(result.stdout)
        self.assertEqual(body["error"]["code"], "bad_request", body)

    def test_default_and_valid_limits(self):
        design = ["--top", "B_m7_top", FIXTURE]
        self.success("CC-default", ["verify-sharing", *design])
        for value in ["0", "1", "0001", "67108864", "268435456", str(SIZE_MAX)]:
            with self.subTest(value=value):
                self.success("CC-valid-" + value,
                             ["verify-sharing", "--comparison-cache-bytes", value, *design])
        self.success("CC-after-design",
                     ["verify-sharing", *design, "--comparison-cache-bytes", "1"])

    def test_invalid_limits(self):
        for value in ["", "-1", "+1", "1.0", "1e3", "0x10", "1_024",
                      " 1", "1 ", "NaN", "１２３", str(SIZE_MAX + 1), str(2 ** 128)]:
            with self.subTest(value=value):
                self.rejected("CC-invalid-" + repr(value),
                              ["verify-sharing", "--comparison-cache-bytes", value,
                               "--top", "B_m7_top", FIXTURE])

    def test_missing_value(self):
        self.rejected("CC-missing-last",
                      ["verify-sharing", "--top", "B_m7_top", FIXTURE,
                       "--comparison-cache-bytes"])
        self.rejected("CC-missing-next-option",
                      ["verify-sharing", "--comparison-cache-bytes", "--top",
                       "B_m7_top", FIXTURE])

    def test_other_commands_reject(self):
        for command in ["info", "roots", "verify-facts", "serve"]:
            with self.subTest(command=command):
                self.rejected("CC-command-" + command,
                              [command, "--comparison-cache-bytes", "1",
                               "--top", "B_m7_top", FIXTURE])

    def test_invalid_designs_do_not_become_equal(self):
        # Existing baseline verify-sharing preconditions also apply when cache
        # configuration is explicit. Reuse unchanged Core regression inputs.
        root = Path(os.environ["HIER_B_PRODUCT_ROOT"]) / "core/tests/fixtures"
        cases = [
            ("unknown-top", ["--top", "B_missing_top", str(root / "nav/nav.sv")]),
            ("compile-error", [str(root / "verify/broken.sv")]),
            ("no-top", [str(root / "verify/package_only.sv")]),
        ]
        for identifier, design in cases:
            with self.subTest(input=identifier):
                result = self.call("CC-bad-design-" + identifier,
                                   ["verify-sharing", "--comparison-cache-bytes", "1", *design])
                self.assertNotEqual(result.returncode, 0)
                self.assertNotIn("different 0, failed queries 0", result.stdout)
                self.assertTrue((result.stdout + result.stderr).strip())

    @classmethod
    def tearDownClass(cls):
        report = {"binary": BIN, "sizeMax": SIZE_MAX, "cases": ROWS}
        with open(os.environ["HIER_B_COMPARISON_REPORT"], "x") as out:
            json.dump(report, out, ensure_ascii=False, indent=2)
            out.write("\n")


if __name__ == "__main__":
    unittest.main()
