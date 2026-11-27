"""Pin bindings (docs/DESIGN.md 4.4; M2 gate item "端口连接表达式的读"; A04-A06).
Every list gives the target of pin bit 0, 1, 2, ... Positions are bit-space positions
(docs/DESIGN.md 4.3): position 0 is the least significant bit whatever the declared
range. Expectations are written by hand from m2/conn.sv."""
import unittest

from hiercli import both, use


def sig(name, *idx):
    return [f"{name}[{i}]" for i in idx]


def expr(*uses):
    return ("expr", frozenset(uses))


PINS = {
    ("u_direct", "d"): sig("a", 0, 1, 2, 3),
    ("u_direct", "en"): sig("s", 0),
    ("u_direct", "q"): sig("q0", 0, 1, 2, 3),
    ("u_direct", "z"): sig("z0", 0),
    ("u_slice", "d"): sig("bus", 4, 5, 6, 7),
    ("u_slice", "en"): sig("bus", 0),
    ("u_slice", "q"): sig("o", 0, 1, 2, 3),
    ("u_slice", "z"): sig("o", 4),
    ("u_concat", "d"): sig("b", 2, 3) + sig("a", 0, 1),        # {a[1:0], b[3:2]}
    ("u_concat", "en"): ["const:1"],
    ("u_concat", "q"): sig("q2", 0, 1, 2) + sig("o", 5),       # {o[5], q2[2:0]}
    ("u_concat", "z"): ["nc"],
    ("u_const", "d"): ["const:z", "const:x", "const:0", "const:1"],   # 4'b10xz
    ("u_const", "en"): ["const:0"],
    ("u_expr", "d"): [expr(use("a", i), use("b", i)) for i in range(4)],   # a & b
    ("u_expr", "en"): [expr(use("s", 0))],                              # ~s
    ("u_open", "d"): ["nc"] * 4,
    ("u_open", "q"): ["nc"] * 4,
    ("u_open", "z"): sig("o", 6),
    ("u_idx", "d"): sig("bus", 2, 3, 4, 5),                    # bus[2 +: 4]
    ("u_idx", "z"): sig("o", 7),
    ("u_rev", "d"): sig("a", 3, 2, 1, 0),                      # {a[0], a[1], a[2], a[3]}
    ("u_rng", "d"): sig("up", 0, 1, 2, 3),                     # up[11:8] of logic [15:8]
    ("u_asc", "d"): sig("rev", 4, 5, 6, 7),                    # rev[0:3] of logic [0:7]
    # Width conversion and replication are trivial: segments, not processes (4.4 rule 4).
    ("u_narrow", "d"): sig("a", 0, 1) + ["const:0", "const:0"],   # a[1:0] on 4 bits
    ("u_rep", "d"): sig("a", 0, 1, 0, 1),                      # {2{a[1:0]}}
    ("u_sext", "d"): sig("a", 0, 1, 1, 1),                     # $signed(a[1:0])
}


class Bindings(unittest.TestCase):
    def test_every_form(self):
        for mode, design in both("m2/conn.sv", "pins"):
            got = design.pin_map("pins")
            for pin, want in PINS.items():
                with self.subTest(mode=mode, pin=pin):
                    self.assertEqual(got[pin], want)

    def test_every_pin_is_reported(self):
        # 13 instances of a module with 4 ports; an unconnected pin is still a binding.
        _, design = both("m2/conn.sv", "pins")[0]
        self.assertEqual(len(design.pin_map("pins")), 52)

    def test_segments_are_as_coarse_as_the_source(self):
        # .d({a[1:0], b[3:2]}) is two segments, low bits first: b[3:2] then a[1:0].
        _, design = both("m2/conn.sv", "pins")[0]
        inst = design.inst("pins")
        names = design.names(inst)
        child = design.inst("pins.u_concat")
        binding = next(b for b in design.run("bindings", inst)["bindings"]
                       if b["inst"] == child and b["port"] == "d")
        self.assertEqual((binding["direction"], binding["width"]), ("in", 4))
        self.assertEqual(binding["pin"], design.port("pins.u_concat", "d")["ref"])
        self.assertEqual([(s["pinBits"], names[s["target"]["signal"]], s["target"]["bits"])
                          for s in binding["segments"]],
                         [({"lsb": 0, "width": 2}, "b", {"lsb": 2, "width": 2}),
                          ({"lsb": 2, "width": 2}, "a", {"lsb": 0, "width": 2})])

    def test_bindings_are_in_slot_then_port_order(self):
        _, design = both("m2/conn.sv", "pins")[0]
        self.assertEqual(list(design.pin_map("pins"))[:5],
                         [("u_direct", "d"), ("u_direct", "en"), ("u_direct", "q"),
                          ("u_direct", "z"), ("u_slice", "d")])


if __name__ == "__main__":
    unittest.main()
