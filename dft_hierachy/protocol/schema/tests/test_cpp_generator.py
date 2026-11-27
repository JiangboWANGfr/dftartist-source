"""A guard against silently compiling new Schema regex syntax with wrong semantics."""

from pathlib import Path
import runpy
import sys
import unittest

root = Path(__file__).resolve().parents[3]
# Load the real generator in its read-only byte-comparison mode.
sys.argv.append("--check")
compiler = runpy.run_path(str(root / "protocol/schema/scripts/generate_cpp.py"))
sys.argv.pop()


class PatternGrammar(unittest.TestCase):
    def test_unsupported_or_ambiguous_patterns_fail_generation(self):
        end = r"(?![\s\S])"
        for pattern in [
            "unanchored",
            "^[0-9]+$",
            "^a|b" + end,
            "^[^a]+" + end,
            "^a?b" + end,
            "^[z-a]" + end,
            "^[ab]*b" + end,
            "^a*b*a" + end,
            r"^\d+" + end,
            "^位" + end,
        ]:
            with self.subTest(pattern=pattern), self.assertRaises(ValueError):
                compiler["character_runs"](pattern)


if __name__ == "__main__":
    unittest.main(verbosity=2)
