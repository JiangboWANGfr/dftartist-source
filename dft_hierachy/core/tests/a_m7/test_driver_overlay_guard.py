"""Fail closed for unrecognized dependency sources and target layouts."""

from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

CMAKE = sys.argv.pop(1)
CORE = Path(__file__).resolve().parents[2]
# Use this configuration's actual dependency, including externally supplied sources.
SLANG = Path(sys.argv.pop(1))


class OverlayGuard(unittest.TestCase):
    def test_invalid_sources_and_layout(self):
        for variant in ("header", "source", "missing-header", "missing-source", "layout"):
            with self.subTest(variant=variant), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                for name in ("include/slang/analysis/DriverTracker.h",
                             "source/analysis/DriverTracker.cpp"):
                    dest = root / "slang" / name
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copyfile(SLANG / name, dest)
                    kind = "header" if name.endswith(".h") else "source"
                    if variant == kind:
                        with dest.open("a") as out:
                            out.write("\n// unreviewed dependency change\n")
                    if variant == "missing-" + kind:
                        dest.unlink()
                (root / "CMakeLists.txt").write_text(
                    'cmake_minimum_required(VERSION 3.28)\nproject(guard NONE)\n'
                    'set(slang_SOURCE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/slang")\n'
                    'add_custom_target(slang_slang SOURCES unexpected.cpp)\n'
                    f'include("{CORE / "cmake/SlangDriverTracking.cmake"}")\n')
                result = subprocess.run([CMAKE, "-S", str(root), "-B", str(root / "build")],
                                        capture_output=True, text=True, timeout=10)
                self.assertNotEqual(result.returncode, 0)
                expected = ("unexpected DriverTracker.cpp target layout" if variant == "layout"
                            else "missing pinned source" if variant.startswith("missing-")
                            else "unverified DriverTracker sources")
                self.assertIn(expected, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
