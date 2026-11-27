"""Handwritten per-target address oracle using a public API adapter, without hooks."""
import json
import os
import subprocess
import sys
import unittest
from pathlib import Path

P = Path(os.environ["HIER_B_PRODUCT_ROOT"])
sys.path.insert(0, str(P / "core/tests/m2"))
from hiercli import use

FX = str(Path(__file__).with_suffix(".sv"))


class DynamicWriteTargets(unittest.TestCase):
    def test_addresses_are_local_to_their_write_target(self):
        cases = [
            ("B_range", "matrix", range(32), {"row": 2, "col": 3}),
            ("B_element", "matrix", range(32), {"row": 2, "col": 3}),
            ("B_constant_slice", "matrix",
             [n * 8 + b for n in range(4) for b in [2, 3]], {"row": 2}),
            ("B_concat", "a", range(4), {"ia": 2}),
            ("B_concat", "b", range(4), {"ib": 2}),
            ("B_member", "cells",
             [n * 4 + b for n in range(4) for b in [0, 1]], {"row": 2}),
        ]
        for per_instance in [False, True]:
            for cache in [0, 67108864]:
                occurrences = [(*case, occurrence) for case in cases
                               for occurrence in ["0", "1"]]
                for module, name, positions, addresses, occurrence in occurrences:
                    raw = subprocess.run(
                        [os.environ["HIER_B_WRITE_DUMP"], FX, module,
                         str(int(per_instance)), str(cache), occurrence],
                        capture_output=True, text=True, timeout=20,
                    )  # Hang watchdog, not a product performance SLA.
                    self.assertEqual(raw.returncode, 0, raw.stderr)
                    dump = json.loads(raw.stdout)
                    names = {v["ref"]: v["name"]
                             for v in dump["signals"] + dump["ports"]}

                    def deps_for(target_name, bit):
                        deps, hits = set(), 0
                        for proc in dump["processes"]:
                            for write in proc["writes"]:
                                target = write["target"]
                                start = target["bits"]["lsb"]
                                if (names[target["ref"]] != target_name or
                                        bit not in range(start, start + target["bits"]["width"])):
                                    continue
                                hits += 1
                                for dep in write["deps"]:
                                    lower = dep["bits"]["lsb"]
                                    if dep["align"] == "all":
                                        read_bits = range(lower, lower + dep["bits"]["width"])
                                    else:
                                        self.assertEqual(dep["align"], "bitwise")
                                        read_bits = [lower + bit - start]
                                    deps.update(use(names[dep["signal"]], b,
                                                    dep["role"], dep["precision"])
                                                for b in read_bits)
                        self.assertEqual(hits, 1, (target_name, bit, dump))
                        return frozenset(deps)

                    want = frozenset(use(sig, b, "control", "conservative")
                                     for sig, width in addresses.items()
                                     for b in range(width))
                    for bit in positions:
                        with self.subTest(module=module, occurrence=occurrence,
                                          target=name, bit=bit,
                                          per_instance=per_instance, cache=cache):
                            actual = frozenset(x for x in deps_for(name, bit)
                                               if ":control:" in x)
                            self.assertEqual(actual, want)
                    with self.subTest(module=module, occurrence=occurrence,
                                      target="plain", per_instance=per_instance,
                                      cache=cache):
                        self.assertEqual(deps_for("plain", 0),
                                         frozenset([use("other", 0)]))


if __name__ == "__main__":
    unittest.main()
