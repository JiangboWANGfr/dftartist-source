"""CLI comparison cache tuning preserves the complete comparison and fails closed."""
import json
import os
from pathlib import Path
import subprocess
import unittest

CORE = os.environ["HIER_BIN"]
FIXTURE = Path(__file__).parents[1] / "fixtures/sharing/adversarial.sv"


class ComparisonCache(unittest.TestCase):
    def run_cli(self, *args, command="verify-sharing"):
        return subprocess.run([CORE, command, *args, str(FIXTURE)],
                              capture_output=True, text=True, timeout=30)

    def test_complete_comparison_is_identical_with_and_without_cache(self):
        baseline = self.run_cli()
        self.assertEqual(baseline.returncode, 0, baseline.stderr + baseline.stdout)
        self.assertIn("different 0, failed queries 0", baseline.stdout)
        for budget in ["0", "1", "67108864", "268435456"]:
            with self.subTest(budget=budget):
                result = self.run_cli("--comparison-cache-bytes", budget)
                self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
                self.assertEqual(result.stdout, baseline.stdout)

    def test_invalid_cache_does_not_reach_comparison(self):
        for value in ["", "-1", "+1", "1.5", "1x", " 1", "18446744073709551616"]:
            with self.subTest(value=value):
                result = self.run_cli("--comparison-cache-bytes", value)
                self.assertEqual(result.returncode, 2)
                self.assertEqual(json.loads(result.stdout)["error"]["code"], "bad_request")
                self.assertNotIn("instances compared", result.stdout)

    def test_missing_value_and_other_commands_reject_the_flag(self):
        result = subprocess.run([CORE, "verify-sharing", str(FIXTURE),
                                 "--comparison-cache-bytes"],
                                capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 2)
        self.assertEqual(json.loads(result.stdout)["error"]["code"], "bad_request")
        for command in ["info", "serve"]:
            result = self.run_cli("--comparison-cache-bytes", "1", command=command)
            self.assertEqual(result.returncode, 2)
            if command == "serve":
                self.assertEqual(result.stdout, "")
                self.assertIn("unknown option", result.stderr)
            else:
                self.assertEqual(json.loads(result.stdout)["error"]["code"], "bad_request")


if __name__ == "__main__":
    unittest.main()
