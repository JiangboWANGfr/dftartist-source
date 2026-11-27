"""`hier verify-facts` (DESIGN.md 5.4): Slang comparison, independent checks,
and reported skips for external hierarchical references stay distinct."""
import os
import re
import subprocess
import unittest

from hiercli import FIXTURES


def verify_facts(*design):
    args = [a if a.startswith("-") or "/" not in a else os.path.join(FIXTURES, a)
            for a in design]
    return subprocess.run([os.environ["HIER_BIN"], "verify-facts", *args],
                          capture_output=True, text=True, timeout=20)


def counters(reply):
    """The command promises named text counters; punctuation is presentation."""
    output = reply.stdout + reply.stderr
    values = {}
    for name in ("slangCompared", "selfChecked", "skippedExternal", "mismatched"):
        match = re.search(rf'\b{name}\b["\']?\s*[:=]?\s*(\d+)\b', output)
        assert match, f"missing {name}: {output!r}"
        values[name] = int(match.group(1))
    return values


class VerifyFacts(unittest.TestCase):
    def test_holds_on_the_fixtures(self):
        for fixture in ("m2/conn.sv", "precision/ops.sv"):
            for mode in ([], ["--per-instance-bodies"]):
                with self.subTest(fixture=fixture, mode=mode):
                    reply = verify_facts(*mode, fixture)
                    self.assertEqual(reply.returncode, 0, reply.stdout + reply.stderr)
                    found = counters(reply)
                    self.assertGreater(found["slangCompared"], 0)
                    self.assertEqual(found["mismatched"], 0)

    def test_hierarchical_references_are_reported_as_skipped(self):
        for mode in ([], ["--per-instance-bodies"]):
            with self.subTest(mode=mode):
                reply = verify_facts(*mode, "--top", "top", "bits/bits.sv")
                self.assertEqual(reply.returncode, 0, reply.stdout + reply.stderr)
                found = counters(reply)
                self.assertGreater(found["slangCompared"], 0)
                self.assertGreater(found["skippedExternal"], 0)
                self.assertEqual(found["mismatched"], 0)

    def test_source_kinds_without_slang_oracle_use_independent_checks(self):
        for top in ("only_init", "only_port_expr"):
            for mode in ([], ["--per-instance-bodies"]):
                with self.subTest(top=top, mode=mode):
                    reply = verify_facts(*mode, "--top", top,
                                         "m2/only_self_checked.sv")
                    self.assertEqual(reply.returncode, 0, reply.stdout + reply.stderr)
                    found = counters(reply)
                    self.assertEqual(found["slangCompared"], 0)
                    self.assertGreater(found["selfChecked"], 0)
                    self.assertEqual(found["skippedExternal"], 0)
                    self.assertEqual(found["mismatched"], 0)

    def test_fails_when_nothing_was_checked(self):
        # Meaningful only if the command exists and can succeed at all.
        self.assertEqual(verify_facts("m2/conn.sv").returncode, 0)
        for name, design in (("invalid top", ["--top", "no_such_top", "m2/conn.sv"]),
                             ("compile error", ["verify/broken.sv"]),
                             ("no process", ["m2/empty.sv"])):
            with self.subTest(case=name):
                self.assertNotEqual(verify_facts(*design).returncode, 0)


if __name__ == "__main__":
    unittest.main()
