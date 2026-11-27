"""Exercise the real nested consumer across allocator/cache transitions.

This configures only; it neither builds Core nor executes another full CTest run.
The work directory is owned by this test and never changes its caller's cache.
"""

import argparse
import json
from pathlib import Path
import subprocess
import tempfile
import time


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("cmake", "ctest", "source", "work-root", "generator", "compiler",
                 "build-type", "sanitize", "allocator"):
        parser.add_argument("--" + name, required=True)
    parser.add_argument("dependencies", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    dependencies = args.dependencies[1:]  # Arguments after the explicit --.
    assert args.dependencies[0] == "--"
    sources = dict(arg[2:].split("=", 1) for arg in dependencies if arg.startswith("-D"))
    report = {"kind": "A nested consumer configuration regression, no Core execution",
              "commands": [], "stages": [], "passed": False}

    def run(argv, expected=0):
        start = time.monotonic()
        result = subprocess.run(argv, capture_output=True, text=True, timeout=120)
        report["commands"].append({"argv": argv, "exitCode": result.returncode,
                                   "seconds": round(time.monotonic() - start, 3),
                                   "stdout": result.stdout, "stderr": result.stderr})
        assert result.returncode == expected, report["commands"][-1]
        return result.stdout

    def read_cache(file):
        text = file.read_text()
        values = {}
        for line in text.splitlines():
            if not line or line.startswith(("#", "//")):
                continue
            key, value = line.split("=", 1)
            values[key.split(":", 1)[0]] = value
        return text, values

    def write_cache_value(file, key, value):
        # Keep each existing entry adjacent to its CMake help comment. Removing
        # just the entry would leave a dangling comment and corrupt the cache.
        lines = file.read_text().splitlines()
        for index, line in enumerate(lines):
            if line.startswith(key + ":"):
                lines[index] = line.split("=", 1)[0] + "=" + (value or "")
                break
        else:
            lines.append(key + ":STRING=" + (value or ""))
        file.write_text("\n".join(lines) + "\n")

    try:
        with tempfile.TemporaryDirectory(prefix="config with space 中文-", dir=args.work_root) as tmp:
            parent = Path(tmp) / "parent"
            child = parent / "tests/source-ref-kind/nested-consumer"
            ctest = [args.ctest, "--test-dir", str(parent), "-R",
                     "^a_source_ref_kind_nested_configure$"]

            def stage(name, build_type, allocator, expected_allocator, sanitize):
                command = [args.cmake, "-S", args.source, "-B", str(parent),
                           "-G", args.generator, "-DCMAKE_CXX_COMPILER=" + args.compiler,
                           "-DCMAKE_BUILD_TYPE=" + build_type, "-DHIER_SANITIZE=" + sanitize,
                           "-DHIER_BUILD_EXPERIMENTS=OFF", "-DHIER_TEST_OBSERVER=OFF",
                           *dependencies]
                if allocator is not None:
                    command.append("-DSLANG_USE_MIMALLOC=" + allocator)
                run(command)
                tests = json.loads(run([*ctest, "--show-only=json-v1"]))["tests"]
                assert len(tests) == 1, tests
                nested = tests[0]["command"]
                assert "-DSLANG_USE_MIMALLOC=" + expected_allocator in nested, nested
                expected_sources = dict(sources)
                if expected_allocator == "OFF":
                    expected_sources.pop("FETCHCONTENT_SOURCE_DIR_MIMALLOC", None)
                actual_sources = dict(arg[2:].split("=", 1) for arg in nested
                                      if arg.startswith("-DFETCHCONTENT_SOURCE_DIR_"))
                assert actual_sources == expected_sources, (actual_sources, expected_sources)
                output = run([*ctest, "-V"])
                assert "100% tests passed, 0 tests failed out of 1" in output, output
                parent_text, parent_values = read_cache(parent / "CMakeCache.txt")
                child_text, child_values = read_cache(child / "CMakeCache.txt")
                assert parent_values["SLANG_USE_MIMALLOC"] == expected_allocator
                assert child_values["SLANG_USE_MIMALLOC"] == expected_allocator
                for key, value in expected_sources.items():
                    assert child_values[key] == value, (key, child_values.get(key), value)
                if expected_allocator == "OFF":
                    assert not child_values.get("FETCHCONTENT_SOURCE_DIR_MIMALLOC")
                report["stages"].append({"name": name, "allocator": expected_allocator,
                                         "parentCache": parent_text, "childCache": child_text,
                                         "nestedCommand": nested})

            stage("current configuration", args.build_type, args.allocator,
                  args.allocator, args.sanitize)
            # Reproduce the previous faulty override inside our owned child cache.
            write_cache_value(child / "CMakeCache.txt", "FETCHCONTENT_SOURCE_DIR_MIMALLOC",
                              sources["FETCHCONTENT_SOURCE_DIR_BOOST_REGEX"])
            stage("remove stale child override", args.build_type, "OFF", "OFF", args.sanitize)
            stage("reuse optimized cache with allocator off", "RelWithDebInfo", None, "OFF", "OFF")
            if args.allocator == "ON":
                stage("reenable allocator in reused cache", "RelWithDebInfo", "ON", "ON", "OFF")
                stage("disable allocator after reenable", "RelWithDebInfo", "OFF", "OFF", "OFF")

            # A real CMake failure in the child must fail the original nested CTest.
            fault = Path(tmp) / "intentional-failure.cmake"
            fault.write_text('message(FATAL_ERROR "A nested configure failure propagation")\n')
            write_cache_value(child / "CMakeCache.txt", "CMAKE_PROJECT_INCLUDE", str(fault))
            output = run([*ctest, "-V"], expected=8)
            assert "A nested configure failure propagation" in output, output
            report["failurePropagation"] = True
            write_cache_value(child / "CMakeCache.txt", "CMAKE_PROJECT_INCLUDE", None)
            output = run([*ctest, "-V"])
            assert "100% tests passed, 0 tests failed out of 1" in output, output
            report["recovered"] = True
            report["passed"] = True
    except Exception as error:
        report["error"] = str(error)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
