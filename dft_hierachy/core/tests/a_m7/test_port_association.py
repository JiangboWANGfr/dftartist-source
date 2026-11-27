"""Wide pins preserve declared/source order, identities, and physical ranges."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

PROBE = sys.argv.pop(1)
FIXTURE = Path(__file__).with_name("port_association.sv")


class PortAssociation(unittest.TestCase):
    def fixture(self, top):
        result = subprocess.run([PROBE, str(FIXTURE), top, "shared", "none"],
                                capture_output=True, text=True, timeout=90)
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)[0]

    def test_unknown_duplicate_uses_last_expression_and_first_source(self):
        text = FIXTURE.read_text()
        for top in ("association_duplicate", "association_duplicate_empty"):
            with self.subTest(top=top):
                body = self.fixture(top)
                self.assertEqual(len(body["bindings"]), 1)
                binding = body["bindings"][0]
                self.assertEqual(binding["port"], "X")
                source = next(s for s in body["sources"] if s["ref"] == "p:0:0")
                start = text.index(".X(a)", text.index("module " + top + "("))
                self.assertEqual((source["start"], source["end"]), (start, start + len(".X(a)")))
                if top == "association_duplicate":
                    self.assertEqual(binding["segments"][0]["target"]["signal"], "s::1")
                else:
                    self.assertIsNone(binding["width"])
                    self.assertEqual(binding["segments"], [])
                    self.assertEqual(binding["unresolved"], "unknown_pin_width")

    def test_implicit_wildcard_defaults_and_empty_source_slots(self):
        text = FIXTURE.read_text()
        expected = {"implicit": [".a", ".b", ".y"], "wildcard": [None, None, None],
                    "default": [".a(a)", None, ".y(y)"], "empty": ["a", None, "y"]}
        for suffix, spelling in expected.items():
            top = "association_" + suffix
            with self.subTest(top=top):
                body = self.fixture(top)
                self.assertEqual([b["port"] for b in body["bindings"]], ["a", "b", "y"])
                sources = {s["ref"]: s for s in body["sources"] if s["kind"] == 1}
                start = text.index("u(", text.index("module " + top + "(")) + 2
                for pin, syntax in enumerate(spelling):
                    ref = f"p:0:{pin}"
                    if syntax is None:
                        self.assertNotIn(ref, sources)
                    else:
                        at = text.index(syntax, start)
                        self.assertEqual((sources[ref]["start"], sources[ref]["end"]),
                                         (at, at + len(syntax)))

    def test_wide_named_ordered_and_unknown(self):
        count = 2048
        for shape in ("native", "ordered", "blackbox"):
            declarations = ",".join(f"input wire p{i}" for i in range(count))
            connections = ([f"a[{i}]" for i in range(count)] if shape == "ordered"
                           else [f".p{i}(a[{i}])" for i in reversed(range(count))])
            text = (f"module leaf({declarations}); endmodule\n" if shape != "blackbox" else "")
            text += f"module wide(input wire [{count - 1}:0] a); leaf u({','.join(connections)}); endmodule\n"
            with tempfile.TemporaryDirectory() as directory:
                file = Path(directory) / "wide.sv"
                file.write_text(text)
                for mode in ("shared", "per-instance"):
                    with self.subTest(shape=shape, mode=mode):
                        result = subprocess.run([PROBE, str(file), "wide", mode, "none"],
                                                capture_output=True, text=True, timeout=90)
                        self.assertEqual(result.returncode, 0, result.stderr)
                        bodies = json.loads(result.stdout)
                        body = bodies[0]
                        self.assertEqual(body["check"]["mismatched"], 0)
                        self.assertEqual(body["processes"], [])
                        self.assertEqual(len(body["bindings"]), count)
                        sources = {s["ref"]: s for s in body["sources"] if s["kind"] == 1}
                        for pin, binding in enumerate(body["bindings"]):
                            index = count - 1 - pin if shape == "blackbox" else pin
                            self.assertEqual(binding["pin"], f"p:0:{pin}")
                            self.assertEqual(binding["port"], f"p{index}")
                            self.assertEqual(binding["direction"], "unknown" if shape == "blackbox" else "in")
                            self.assertEqual(binding["segments"], [{"pinBits": {"lsb": 0, "width": 1},
                                "target": {"kind": "signal", "signal": "s::0", "bits": {"lsb": index, "width": 1}}}])
                            syntax = f"a[{index}]" if shape == "ordered" else f".p{index}(a[{index}])"
                            start = text.index(syntax, text.index("leaf u("))
                            source = sources[f"p:0:{pin}"]
                            self.assertEqual((source["file"], source["start"], source["end"]),
                                             (0, start, start + len(syntax)))


if __name__ == "__main__":
    unittest.main()
