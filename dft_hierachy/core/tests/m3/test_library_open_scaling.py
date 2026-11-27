"""Extend B's frozen C-44 relative RSS oracle to non-null providers (C-52).

No implementation hooks or race timing: public open-only child; fresh processes,
median peak RSS, existing 3x adjacent/5x overall tolerances. Not a new absolute SLA.
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
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "m2"))
from test_open_scaling import measure

GENERATOR = Path(__file__).resolve().parent.parent / "fixtures/synthetic/gen.py"


class LibraryOpenScaling(unittest.TestCase):
    def check_mode(self, mode):
        binary = os.environ["B_LIBRARY_OPEN_PROBE"]
        samples = {depth: [] for depth in (3, 4, 5)}
        hashes = {}
        with tempfile.TemporaryDirectory(prefix="hier-b-provider-scaling-") as directory:
            paths = {}
            for depth in samples:
                source = subprocess.run([sys.executable, str(GENERATOR), "--fanout", "10",
                                         "--depth", str(depth), "--unique", "0"],
                                        check=True, capture_output=True, timeout=20).stdout
                if mode == "sparse":
                    # Exactly one genuine library hit in the top, not in every leaf.
                    marker = b"  node0 #(.W(8), .BASE(0)) u (.clk, .rst_n, .d, .q);"
                    self.assertEqual(source.count(marker), 1)
                    source = source.replace(marker, marker + b"\n  b_sparse_cell only_one(.A(d));")
                path = Path(directory) / f"depth-{depth}.sv"
                path.write_bytes(source)
                paths[depth] = str(path)
                hashes[depth] = hashlib.sha256(source).hexdigest()
            order = [depth for _ in range(3) for depth in samples]
            random.Random(524437).shuffle(order)
            for depth in order:
                measured = measure(binary, [paths[depth], mode])
                info = measured.pop("info")
                self.assertEqual(info["errorCount"], 0)
                self.assertEqual(info["bodySharing"], "fast")
                self.assertEqual(info["bodyCount"], depth + 2)
                self.assertEqual(info["tops"], [{"name": "top"}])
                samples[depth].append(measured)
        medians = {d: statistics.median(x["rssBytes"] for x in row) for d, row in samples.items()}
        audit = {"mode": mode, "binary": os.path.realpath(binary), "scales": [
            {"depth": d, "expectedOccurrenceCount": sum(10**i for i in range(d+1)) + 1
             + (mode == "sparse"), "expectedBodyCount": d+2, "inputSha256": hashes[d],
             "samples": samples[d], "medianRssBytes": medians[d]} for d in samples]}
        print("B_PROVIDER_OPEN_SCALING:" + json.dumps(audit), flush=True)
        for small, large in ((3, 4), (4, 5)):
            with self.subTest(small=small, large=large):
                self.assertLessEqual(medians[large], 3 * medians[small], audit)
        self.assertLessEqual(medians[5], 5 * medians[3], audit)

    def test_no_provider_control(self):
        self.check_mode("none")

    def test_empty_library_keeps_shared_open_scaling(self):
        self.check_mode("empty")

    def test_custom_miss_provider_keeps_shared_open_scaling(self):
        self.check_mode("miss")

    def test_one_real_library_hit_keeps_shared_open_scaling(self):
        self.check_mode("sparse")


if __name__ == "__main__":
    unittest.main()
