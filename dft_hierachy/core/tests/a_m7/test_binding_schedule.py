"""Binding / process / source identity is stable across declaration shapes."""

import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

PROBE = sys.argv.pop(1)
FIXTURE = Path(__file__).with_name("binding_cases.sv")


class BindingSchedule(unittest.TestCase):
    def dump(self, top, mode="shared", library="none", file=FIXTURE):
        result = subprocess.run([PROBE, str(file), top, mode, library],
                                capture_output=True, text=True, timeout=90)
        self.assertEqual(result.returncode, 0, result.stderr)
        bodies = json.loads(result.stdout)
        self.assertEqual(bodies[0]["definition"], top)
        for body in bodies:
            self.assertEqual(body["check"]["mismatched"], 0)
            self.assertEqual(body["check"]["issues"], [])
            self.assertGreater(body["estimatedBytes"], 0)
        return bodies[0]

    def test_nested_generate_arrays_primitive_and_source_order(self):
        text = FIXTURE.read_bytes()
        # Explicit declaration / generate order, not an implementation-derived table.
        kinds = ["init", "port_expr", "assign", "port_expr", "init", "always_ff",
                 "port_expr", "port_expr", "port_expr",
                 "init", "assign", "init", "assign", "init", "assign"]
        for mode in ("shared", "per-instance"):
            with self.subTest(mode=mode):
                body = self.dump("schedule_top", mode)
                self.assertEqual([p["result"]["kind"] for p in body["processes"]], kinds)
                self.assertEqual([p["result"]["ref"] for p in body["processes"]],
                                 [f"x::{i}" for i in range(len(kinds))])
                self.assertEqual([b["inst"] for b in body["bindings"]],
                                 [f"i:{i}" for i in range(13) for _ in range(2)])
                self.assertEqual([b["port"] for b in body["bindings"]],
                                 ["a", "y"] * 12 + ["0", "1"])
                statements = {s["ref"]: s for s in body["sources"] if s["kind"] == 2}
                expected = {0: b"n = a", 1: b".a(a ^ 8'h0f)", 2: b"assign y = n;",
                            3: b".a(g + 8'd1)", 4: b"g = a",
                            5: b"always_ff @(posedge clk) q <= a;"}
                for i in (6, 7, 8):
                    expected[i] = b".a(local_net ^ 8'hff)"
                for i in (9, 11, 13):
                    expected[i] = b"local_net = a"
                    expected[i + 1] = b"assign local_net = a;"
                for i, syntax in expected.items():
                    record = statements[f"x::{i}"]
                    start = text.index(syntax)
                    self.assertEqual((record["file"], record["start"], record["end"]),
                                     (0, start, start + len(syntax)))

    def test_blackbox_and_frozen_library_bindings(self):
        for mode in ("shared", "per-instance"):
            for library in ("none", "library"):
                with self.subTest(mode=mode, library=library):
                    body = self.dump("schedule_blackboxes", mode, library)
                    self.assertEqual([b["inst"] for b in body["bindings"]],
                                     ["i:0", "i:0", "i:1", "i:1", "i:2", "i:2"])
                    self.assertEqual([b["port"] for b in body["bindings"]], ["A", "Y"] * 3)
                    self.assertEqual([p["result"]["kind"] for p in body["processes"]],
                                     ["init", "port_expr", "assign", "port_expr", "port_expr"])
                    if library == "library":
                        self.assertEqual([b["direction"] for b in body["bindings"]],
                                         ["in", "out"] * 3)

    def test_body_without_child_slots(self):
        for mode in ("shared", "per-instance"):
            body = self.dump("schedule_no_slots", mode)
            self.assertEqual(body["bindings"], [])
            self.assertEqual([p["result"]["kind"] for p in body["processes"]],
                             ["init", "assign"])

    def test_generated_slots_are_all_retained(self):
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / "generated.sv"
            file.write_text('''module leaf(input wire a, output wire y); assign y=a; endmodule
module generated; wire a=0; wire y;
for(genvar i=0;i<4096;i++) begin:g leaf u(a,y); end
endmodule
''')
            body = self.dump("generated", file=file)
            self.assertEqual(len(body["bindings"]), 8192)
            self.assertEqual([b["pin"] for b in body["bindings"]],
                             [f"p:{i}:{pin}" for i in range(4096) for pin in range(2)])


if __name__ == "__main__":
    unittest.main()
