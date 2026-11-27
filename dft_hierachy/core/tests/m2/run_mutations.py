"""Run control and four independent oracle mutations; nonzero for any survivor.

Usage: HIER_BIN=/absolute/path/to/hier python3 run_mutations.py
No product sources are edited. A failed control or an uninjected mutant is a
failure of this gate, not a killed mutant. Verbose output is kept for diagnosis.
"""
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

CASES = {
    "array_occurrence": "test_conn.Occurrences.test_bindings_of_each_occurrence",
    "precision": "test_deps.RuleTable.test_every_row",
    "multi_driver": "test_conn.MultipleDrivers.test_all_real_drivers_are_kept",
    "hier_ref": "test_conn.HierarchicalReferences.test_a_signal_written_through_a_hierarchical_reference",
}


def run(test, environment):
    return subprocess.run([sys.executable, "-m", "unittest", "-v", test],
                          cwd=Path(__file__).parent, env=environment,
                          capture_output=True, text=True, timeout=120)


def main():
    environment = os.environ.copy()
    real = os.path.abspath(environment["HIER_BIN"])
    failed = 0
    with tempfile.TemporaryDirectory(prefix="hier-b-output-mutants-") as task_dir:
        proxy = Path(task_dir) / "mutant_hier"
        shutil.copyfile(Path(__file__).with_name("mutant_hier.py"), proxy)
        proxy.chmod(0o700)
        for mutation, test in CASES.items():
            control = run(test, {**environment, "HIER_BIN": real})
            if control.returncode:
                print(f"CONTROL_FAILED:{mutation}\n{control.stdout}{control.stderr}")
                failed += 1
                continue
            audit = Path(task_dir) / f"{mutation}.log"
            mutant = run(test, {**environment, "HIER_BIN": str(proxy),
                                "HIER_REAL_BIN": real, "HIER_MUTATION": mutation,
                                "HIER_MUTATION_LOG": str(audit)})
            # The CLI adapter discards stderr on successful JSON replies, so keep
            # a separate test-owned audit of actual mutations, not failed spawns.
            output = mutant.stdout + mutant.stderr
            injected = audit.exists() and f"B_MUTATION_APPLIED:{mutation}:" in audit.read_text()
            killed = (injected and mutant.returncode != 0 and "FAIL" in output
                      and "ERROR:" not in output)
            print(f"{'KILLED' if killed else 'SURVIVED_OR_ERROR'}:{mutation}:injected={injected}\n{output}")
            failed += not killed
    return int(bool(failed))


if __name__ == "__main__":
    sys.exit(main())
