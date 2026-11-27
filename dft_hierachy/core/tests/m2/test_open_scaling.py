"""B's C-44 regression: open+info costs follow shared bodies, not occurrences.

Uses the pre-M2 synthetic generator, not A's new resource gate. Three fresh
processes per scale in seeded shuffled order; Unix wait4 RSS is normalized to bytes.
3x adjacent/5x overall median-RSS tolerances catch order-of-magnitude materialization.
These are regression sentinels, not M7 memory/time budgets. Time is recorded only.
"""
import hashlib
import json
import os
from pathlib import Path
import random
import statistics
import subprocess
import sys
import tempfile
import time
import unittest

GENERATOR = Path(__file__).resolve().parent / "../fixtures/synthetic/gen.py"


def measure(binary, args):
    if not hasattr(os, "wait4") or sys.platform not in ("darwin", "linux"):
        raise RuntimeError("RSS gate requires macOS/Linux wait4; missing support is not a pass")
    with tempfile.TemporaryFile() as out, tempfile.TemporaryFile() as err:
        proc = subprocess.Popen([binary, "info", *args], stdout=out, stderr=err)
        start = time.monotonic()
        while True:
            pid, status, usage = os.wait4(proc.pid, os.WNOHANG)
            if pid:
                proc.returncode = os.waitstatus_to_exitcode(status)
                break
            if time.monotonic() - start > 60:
                proc.kill()
                _, status, usage = os.wait4(proc.pid, 0)
                proc.returncode = os.waitstatus_to_exitcode(status)
                raise TimeoutError("open/info process exceeded the 60s harness safety limit")
            time.sleep(0.01)
        elapsed = time.monotonic() - start
        out.seek(0)
        err.seek(0)
        stdout, stderr = out.read().decode(), err.read().decode()
        if proc.returncode:
            raise AssertionError(f"info failed ({proc.returncode}): {stdout}{stderr}")
        rss = usage.ru_maxrss * (1024 if sys.platform == "linux" else 1)
        if rss <= 0:
            raise AssertionError("missing positive per-child peak RSS")
        return {"rssBytes": rss, "seconds": elapsed, "info": json.loads(stdout)}


class OpenScaling(unittest.TestCase):
    def test_c44_shared_open_does_not_materialize_every_occurrence(self):
        binary = os.environ["HIER_BIN"]
        results = {depth: [] for depth in (3, 4, 5)}
        with tempfile.TemporaryDirectory(prefix="hier-b-scaling-") as folder:
            paths = {}
            hashes = {}
            for depth in results:
                generated = subprocess.run([sys.executable, str(GENERATOR), "--fanout", "10",
                                            "--depth", str(depth), "--unique", "0"],
                                           capture_output=True, check=True, timeout=20)
                path = Path(folder) / f"shared-{depth}.sv"
                path.write_bytes(generated.stdout)
                paths[depth] = path
                hashes[depth] = hashlib.sha256(generated.stdout).hexdigest()
                control = subprocess.run([binary, "diags", "--top", "top", str(path)],
                                         capture_output=True, text=True, timeout=60)
                self.assertEqual(control.returncode, 0, control.stdout + control.stderr)
                self.assertEqual(json.loads(control.stdout)["errorCount"], 0)
            order = [depth for _ in range(3) for depth in results]
            random.Random(4437).shuffle(order)
            for depth in order:
                measured = measure(binary, ["--top", "top", str(paths[depth])])
                self.assertEqual(measured["info"]["bodySharing"], "fast")
                self.assertEqual(measured["info"]["bodyCount"], depth + 2)
                self.assertEqual([t["name"] for t in measured["info"]["tops"]], ["top"])
                results[depth].append({k: measured[k] for k in ("rssBytes", "seconds")})
            medians = {depth: statistics.median(s["rssBytes"] for s in samples)
                       for depth, samples in results.items()}
            audit = {"binary": os.path.realpath(binary), "scales": [
                {"depth": depth, "instances": sum(10 ** i for i in range(depth + 1)) + 1,
                 "bodies": depth + 2, "inputSha256": hashes[depth], "samples": results[depth],
                 "medianRssBytes": medians[depth]} for depth in results]}
            print("B_OPEN_SCALING:" + json.dumps(audit), flush=True)
            # Assertions run after all measurements, so a red gate still records all scales.
            for small, large in ((3, 4), (4, 5)):
                with self.subTest(small=small, large=large):
                    self.assertLessEqual(medians[large], 3 * medians[small], audit)
            self.assertLessEqual(medians[5], 5 * medians[3], audit)


if __name__ == "__main__":
    unittest.main()
