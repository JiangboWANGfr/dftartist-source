"""Drivers and loads within a body and across the hierarchy (docs/DESIGN.md 4.1, 4.3,
4.7, 4.9, 5.4; M2 gate item "经规范模块体查询"; A01-A03, A11; REVIEW_LOG C-30).
Expectations are written by hand from m2/conn.sv."""
import unittest

from hiercli import COMPLETE, CliError, Design, both, use

# occurrence -> (top port on clk, top port on d, top port on q, lowest bit of q's target)
OCCURRENCES = {"occ.u_a": ("clk_a", "da", "qa", 0), "occ.u_b": ("clk_b", "db", "qb", 0),
               "occ.u_arr[0]": ("clk_a", "d0", "qarr", 0),
               "occ.u_arr[1]": ("clk_a", "d1", "qarr", 2)}


def driver(design, path, name, bit=0):
    """The one process that drives the bit locally."""
    refs = design.process_refs("drivers", path, name, bit, "local")
    assert len(refs) == 1, refs
    return refs[0]


class Occurrences(unittest.TestCase):
    """One module instantiated four times, two of them elements of an instance array."""

    def test_every_occurrence_has_the_same_local_facts(self):
        for mode, design in both("m2/conn.sv", "occ"):
            for path in OCCURRENCES:
                with self.subTest(mode=mode, path=path):
                    for bit in range(2):
                        self.assertEqual(design.driver_deps(path, "n", bit),
                                         [("assign", {use("d", bit)})])
                        self.assertEqual(design.driver_deps(path, "q", bit),
                                         [("assign", {use("n", bit)})])
                    self.assertEqual(design.driver_deps(path, "ck", 0),
                                     [("assign", {use("clk", 0)})])

    def test_every_occurrence_has_its_own_identity(self):
        for mode, design in both("m2/conn.sv", "occ"):
            with self.subTest(mode=mode):
                refs = {path: driver(design, path, "n") for path in OCCURRENCES}
                self.assertEqual(len(set(refs.values())), 4)
                for path, ref in refs.items():
                    obj = design.run("obj", ref)
                    self.assertEqual((obj["kind"], obj["inst"]), ("process", design.inst(path)))

    def test_bindings_of_each_occurrence(self):
        for mode, design in both("m2/conn.sv", "occ"):
            pins = design.pin_map("occ")
            self.assertEqual(len(pins), 12)
            for path, (clk, data, out, lsb) in OCCURRENCES.items():
                with self.subTest(mode=mode, path=path):
                    child = path.split(".", 1)[1]
                    self.assertEqual(pins[(child, "clk")], [f"{clk}[0]"])
                    self.assertEqual(pins[(child, "d")], [f"{data}[0]", f"{data}[1]"])
                    self.assertEqual(pins[(child, "q")], [f"{out}[{lsb}]", f"{out}[{lsb + 1}]"])

    def test_drivers_through_the_hierarchy_stay_in_their_occurrence(self):
        for mode, design in both("m2/conn.sv", "occ"):
            for path, (clk, data, _, _) in OCCURRENCES.items():
                for name, bit, want in (("d", 0, data), ("d", 1, data), ("clk", 0, clk)):
                    with self.subTest(mode=mode, path=path, name=name, bit=bit):
                        eps, completeness = design.endpoints("drivers", path, name, bit, "hier")
                        self.assertEqual(completeness, COMPLETE)
                        self.assertEqual([design.where(e) for e in eps],
                                         [("top_port", f"occ.{want}", bit)])
                        self.assertEqual([len(e["via"]) for e in eps], [1])

    def test_loads_through_the_hierarchy_stay_in_their_occurrence(self):
        for mode, design in both("m2/conn.sv", "occ"):
            with self.subTest(mode=mode):
                def readers(top_port, name):
                    return sorted(driver(design, path, name) for path, ports in
                                  OCCURRENCES.items() if top_port in ports)
                for port in ("clk_a", "clk_b"):
                    self.assertEqual(design.process_refs("loads", "occ", port, 0, "hier"),
                                     readers(port, "ck"))
                for port in ("da", "db", "d0", "d1"):
                    self.assertEqual(design.process_refs("loads", "occ", port, 0, "hier"),
                                     readers(port, "n"))
                # qarr[3] <- u_arr[1].q[1] <- `assign q = n` in u_arr[1], and nowhere else.
                eps, _ = design.endpoints("drivers", "occ", "qarr", 3, "hier")
                self.assertEqual([design.where(e) for e in eps], [("process", "occ.u_arr[1]", 1)])
                self.assertEqual([e["ref"] for e in eps], [driver(design, "occ.u_arr[1]", "q", 1)])

    def test_local_reach_stops_at_ports_and_pins(self):
        design = Design("m2/conn.sv", "occ")
        # Inside u_b, d is driven through the instance's own port.
        eps, completeness = design.endpoints("drivers", "occ.u_b", "d", 1, "local")
        self.assertEqual(completeness, COMPLETE)
        self.assertEqual([design.where(e) for e in eps], [("own_port", "occ.u_b.d", 1)])
        # In occ, db is the top port (own_port when local) and is read by the pin u_b.d.
        eps, _ = design.endpoints("drivers", "occ", "db", 1, "local")
        self.assertEqual([design.where(e) for e in eps], [("own_port", "occ.db", 1)])
        eps, _ = design.endpoints("loads", "occ", "db", 1, "local")
        self.assertEqual([design.where(e) for e in eps], [("module_pin", "occ.u_b.d", 1)])
        # clk_a fans out to three pins.
        eps, _ = design.endpoints("loads", "occ", "clk_a", 0, "local")
        self.assertEqual(sorted(design.where(e) for e in eps),
                         [("module_pin", "occ.u_a.clk", 0), ("module_pin", "occ.u_arr[0].clk", 0),
                          ("module_pin", "occ.u_arr[1].clk", 0)])

    def test_port_side(self):
        design = Design("m2/conn.sv", "occ")
        # The pin u_b.d from outside is in occ, where db drives it ...
        eps, _ = design.endpoints("drivers", "occ.u_b", "d", 0, "local", side="outside")
        self.assertEqual([design.where(e) for e in eps], [("own_port", "occ.db", 0)])
        # ... and from inside it is the port of ocell, read by `assign n = ~d`.
        eps, _ = design.endpoints("loads", "occ.u_b", "d", 0, "local", side="inside")
        self.assertEqual([e["ref"] for e in eps], [driver(design, "occ.u_b", "n")])
        port = design.port("occ.u_b", "d")
        self.assertEqual(port["internal"]["kind"], "direct")
        self.assertEqual(design.names(design.inst("occ.u_b"))[port["internal"]["signal"]], "d")
        self.assertEqual(port["internal"]["bits"], {"lsb": 0, "width": 2})

    def test_bad_requests(self):
        design = Design("m2/conn.sv", "occ")
        inst = design.inst("occ.u_b")
        port = design.port("occ.u_b", "d")["ref"]
        signal = next(s["ref"] for s in design.signals(inst) if s["name"] == "n")
        for args in ((port, "--reach", "local"),                        # a port needs a side
                     (signal, "--reach", "local", "--side", "inside"),  # a signal takes none
                     (signal,),                                         # reach is required
                     (signal, "--lsb", "0", "--reach", "local"),        # lsb without width
                     (signal, "--width", "1", "--reach", "local")):
            with self.subTest(args=args):
                with self.assertRaises(CliError) as raised:
                    design.run("drivers", *args)
                self.assertEqual(raised.exception.code, "bad_request")

    def test_a_whole_object_is_the_default_slice(self):
        design = Design("m2/conn.sv", "occ")
        signal = next(s["ref"] for s in design.signals(design.inst("occ.u_b"))
                      if s["name"] == "n")
        reply = design.run("drivers", signal, "--reach", "local")
        self.assertEqual(reply["completeness"], COMPLETE)
        covered = sorted(b for e in reply["result"]
                         for b in range(e["queried"]["lsb"],
                                        e["queried"]["lsb"] + e["queried"]["width"]))
        self.assertEqual(covered, [0, 1])
        self.assertEqual({e["ref"] for e in reply["result"]}, {driver(design, "occ.u_b", "n")})


class MultipleDrivers(unittest.TestCase):
    def test_all_real_drivers_are_kept(self):
        for mode, design in both("m2/conn.sv", "multi"):
            with self.subTest(mode=mode):
                for name, want in (
                        ("m", [{use("a", 0)}, {use("b", 0)}]),
                        ("t", [{use("a", 0), use("en1", 0, "control")},
                               {use("b", 0), use("en2", 0, "control")}])):
                    got = design.driver_deps("multi", name, 0)
                    self.assertEqual([kind for kind, _ in got], ["assign", "assign"])
                    self.assertEqual({dep for _, dep in got}, {frozenset(w) for w in want})
                    self.assertEqual(len(set(design.process_refs("drivers", "multi", name, 0,
                                                                 "local"))), 2)


class ThreeLevels(unittest.TestCase):
    def test_drivers_cross_two_boundaries(self):
        for mode, design in both("m2/conn.sv", "xhier"):
            with self.subTest(mode=mode):
                # mid[b] <- u2.o[b] <- u2.u3.o[b] <- `assign o = alias_w`
                for bit in range(2):
                    eps, completeness = design.endpoints("drivers", "xhier", "mid", bit, "hier")
                    self.assertEqual(completeness, COMPLETE)
                    self.assertEqual([design.where(e) for e in eps],
                                     [("process", "xhier.u2.u3", bit)])
                    self.assertEqual([(e["ref"], len(e["via"])) for e in eps],
                                     [(driver(design, "xhier.u2.u3", "o", bit), 2)])
                # The alias is driven locally; the walk stops at that driver.
                self.assertEqual(design.driver_deps("xhier.u2.u3", "alias_w", 0),
                                 [("assign", {use("i", 0)})])
                self.assertEqual(design.process_refs("drivers", "xhier.u2.u3", "alias_w", 0,
                                                     "hier"),
                                 [driver(design, "xhier.u2.u3", "alias_w")])
                # u3.i[b] <- u2.i[b] <- top port in[b + 1]
                for bit in range(2):
                    eps, _ = design.endpoints("drivers", "xhier.u2.u3", "i", bit, "hier")
                    self.assertEqual([design.where(e) for e in eps],
                                     [("top_port", "xhier.in", bit + 1)])
                    self.assertEqual([len(e["via"]) for e in eps], [2])

    def test_loads_fan_out(self):
        for mode, design in both("m2/conn.sv", "xhier"):
            with self.subTest(mode=mode):
                out = driver(design, "xhier", "out")
                s0, s1, s2 = (driver(design, f"xhier.s{n}", "r") for n in range(3))
                self.assertEqual(len({out, s0, s1, s2}), 4)
                self.assertEqual(design.process_refs("loads", "xhier", "mid", 0, "hier"),
                                 sorted([out, s0, s1]))
                self.assertEqual(design.process_refs("loads", "xhier", "mid", 1, "hier"),
                                 sorted([out, s2]))
                # in[1] -> u2.i[0] -> u3.i[0], read by `assign alias_w = i`
                self.assertEqual(design.process_refs("loads", "xhier", "in", 1, "hier"),
                                 [driver(design, "xhier.u2.u3", "alias_w")])
                # in[0] and in[3] are connected to nothing: empty AND complete.
                for bit in (0, 3):
                    self.assertEqual(design.process_refs("loads", "xhier", "in", bit, "hier"), [])

    def test_local_loads_of_a_fan_out(self):
        design = Design("m2/conn.sv", "xhier")
        eps, completeness = design.endpoints("loads", "xhier", "mid", 0, "local")
        self.assertEqual(completeness, COMPLETE)
        self.assertEqual(sorted(design.where(e) for e in eps),
                         [("module_pin", "xhier.s0.d", 0), ("module_pin", "xhier.s1.d", 0),
                          ("process", "xhier", 0)])
        # mid is driven by the pin u2.o; locally that is where the answer stops.
        eps, _ = design.endpoints("drivers", "xhier", "mid", 1, "local")
        self.assertEqual([design.where(e) for e in eps], [("module_pin", "xhier.u2.o", 1)])


class PinEndpoints(unittest.TestCase):
    """m2/conn.sv `pins`: what a child's input pin is driven by, seen from outside."""

    def kinds(self, child, port, bit):
        design = Design("m2/conn.sv", "pins")
        eps, completeness = design.endpoints("drivers", f"pins.{child}", port, bit, "local",
                                             side="outside")
        self.assertEqual(completeness, COMPLETE)
        self.assertEqual(len(eps), 1, eps)
        return design, eps[0]

    def test_constant(self):
        for mode, design in both("m2/conn.sv", "pins"):
            with self.subTest(mode=mode):
                eps, completeness = design.endpoints(
                    "drivers", "pins.u_const", "d", 1, "local", side="outside")
                self.assertEqual(completeness, COMPLETE)
                self.assertEqual(len(eps), 1)
                e = eps[0]
                self.assertEqual(e["kind"], "const")
                self.assertEqual(e["value"], "1'bx")
                self.assertNotIn("bits", e)

    def test_constant_two_bit_slice(self):
        for mode, design in both("m2/conn.sv", "pins"):
            with self.subTest(mode=mode):
                pin = design.port("pins.u_const", "d")["ref"]
                reply = design.run("drivers", pin, "--lsb", "1", "--width", "2",
                                   "--reach", "local", "--side", "outside")
                self.assertEqual(reply["completeness"], COMPLETE)
                self.assertEqual(len(reply["result"]), 1)
                e = reply["result"][0]
                self.assertEqual(e["kind"], "const")
                self.assertEqual(e["queried"], {"lsb": 1, "width": 2})
                self.assertEqual(e["value"], "2'b0x")
                self.assertNotIn("bits", e)

    def test_unconnected(self):
        _, e = self.kinds("u_open", "d", 2)
        self.assertEqual(e["kind"], "unconnected")

    def test_expression(self):
        design, e = self.kinds("u_expr", "d", 2)    # a & b
        self.assertEqual(design.where(e), ("process", "pins", 2))
        self.assertEqual(design.proc(e["ref"])["kind"], "port_expr")


class HierarchicalReferences(unittest.TestCase):
    """bits/bits.sv: `assign c1.poke = sel;` and `assign peek = c0.poke;` in top.
    An empty answer may only mean "nothing" when it is complete (docs/DESIGN.md 4.9);
    these are partial with reason hier_ref (5.4)."""

    def assert_hier_ref(self, completeness):
        self.assertEqual(completeness["status"], "partial")
        self.assertIn("hier_ref", [r["code"] for r in completeness["reasons"]])

    def test_a_signal_written_through_a_hierarchical_reference(self):
        for mode, design in both("bits/bits.sv", "top"):
            with self.subTest(mode=mode):
                _, completeness = design.endpoints("drivers", "top.c1", "poke", 0, "hier")
                self.assert_hier_ref(completeness)

    def test_a_signal_read_through_a_hierarchical_reference(self):
        for mode, design in both("bits/bits.sv", "top"):
            with self.subTest(mode=mode):
                _, completeness = design.endpoints("loads", "top.c0", "poke", 0, "hier")
                self.assert_hier_ref(completeness)

    def test_the_referring_processes_say_so(self):
        for mode, design in both("bits/bits.sv", "top"):
            with self.subTest(mode=mode):
                reader = design.run("proc", driver(design, "top", "peek"))
                self.assert_hier_ref(reader["completeness"])
                self.assertEqual(reader["result"]["externalRefs"],
                                 [{"text": "c0.poke", "access": "read"}])
                writers = [p["ref"] for p in
                           design.run("procs", design.inst("top"), "--limit", "100000")["items"]
                           if design.proc(p["ref"])["externalRefs"]
                           == [{"text": "c1.poke", "access": "write"}]]
                self.assertEqual(len(writers), 1)
                self.assert_hier_ref(design.run("proc", writers[0])["completeness"])

    def test_a_process_without_one_is_complete(self):
        design = Design("bits/bits.sv", "top")
        self.assertEqual(design.run("proc", driver(design, "top", "mux_assign"))["completeness"],
                         COMPLETE)


class Registers(unittest.TestCase):
    def test_registers_per_written_bit(self):
        q = ("clk", "posedge", frozenset({("rst_n", "negedge", "reset")}))
        for mode, design in both("m2/conn.sv", "seq"):
            with self.subTest(mode=mode):
                self.assertEqual(design.registers("seq"), {
                    "q[0]": q, "q[1]": q, "q[2]": q, "q[3]": q,
                    "s[0]": ("clk2", "negedge", frozenset({("set", "posedge", "set")})),
                    "p[0]": ("clk", "posedge", frozenset()),
                    "p2[0]": ("clk", "posedge", frozenset()),
                })  # c is combinational and must not appear

    def test_a_register_names_its_process_and_instance(self):
        design = Design("m2/conn.sv", "seq")
        inst = design.inst("seq")
        names = design.names(inst)
        for r in design.run("registers", inst, "--limit", "100000")["result"]["items"]:
            name = names[r["signal"]]
            with self.subTest(register=name):
                self.assertEqual(r["inst"], inst)
                self.assertEqual(r["process"], driver(design, "seq", name, r["bits"]["lsb"]))
                self.assertEqual(design.run("obj", r["ref"])["kind"], "register")


if __name__ == "__main__":
    unittest.main()
