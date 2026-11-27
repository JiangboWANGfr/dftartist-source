"""M2 contract cases added after C-32/C-33/C-34 and B-08 (DESIGN.md 4.4, 5.2, 5.4).

The fixture and expected bit positions are independent of Agent A's M2 code.
Each case runs with shared bodies and per-instance body extraction.
"""
import unittest

from hiercli import COMPLETE, both


class CompositePorts(unittest.TestCase):
    def test_explicit_ansi_port_has_complete_ordered_mapping(self):
        for mode, design in both("m2/ansi_ports.sv", "ansi_ports"):
            with self.subTest(mode=mode):
                path = "ansi_ports.u_split"
                names = design.names(design.inst(path))
                internal = design.port(path, "joined")["internal"]
                self.assertEqual((internal["kind"], internal["status"]),
                                 ("mapped", "complete"))
                self.assertEqual(
                    [(s["portBits"], s["target"]["kind"],
                      names[s["target"]["signal"]], s["target"]["bits"])
                     for s in internal["segments"]],
                    [({"lsb": 0, "width": 2}, "signal", "lo", {"lsb": 0, "width": 2}),
                     ({"lsb": 2, "width": 2}, "signal", "hi", {"lsb": 0, "width": 2})])

    def test_explicit_ansi_mapping_is_used_by_cross_hierarchy_queries(self):
        for mode, design in both("m2/ansi_ports.sv", "ansi_ports"):
            for signal, bit, top_bit in (("lo", 0, 0), ("lo", 1, 1),
                                         ("hi", 0, 2), ("hi", 1, 3)):
                with self.subTest(mode=mode, signal=signal, bit=bit):
                    eps, completeness = design.endpoints(
                        "drivers", "ansi_ports.u_split", signal, bit, "hier")
                    self.assertEqual(completeness, COMPLETE)
                    self.assertEqual([design.where(e) for e in eps],
                                     [("top_port", "ansi_ports.data", top_bit)])

    def test_non_ansi_port_maps_low_and_high_halves(self):
        for mode, design in both("m2/ports_edge.sv", "complex_ports"):
            with self.subTest(mode=mode):
                path = "complex_ports.u_split"
                inst = design.inst(path)
                names = design.names(inst)
                internal = design.port(path, "joined")["internal"]
                self.assertEqual((internal["kind"], internal["status"]),
                                 ("mapped", "complete"))
                segments = internal["segments"]
                self.assertEqual(len(segments), 2)
                self.assertEqual(
                    [(s["portBits"], s["target"]["kind"],
                      names[s["target"]["signal"]], s["target"]["bits"])
                     for s in segments],
                    [({"lsb": 0, "width": 2}, "signal", "lo", {"lsb": 0, "width": 2}),
                     ({"lsb": 2, "width": 2}, "signal", "hi", {"lsb": 0, "width": 2})])
                self.assertEqual(design.port(path, "result")["internal"]["kind"], "direct")

    def test_connection_crosses_each_mapped_segment(self):
        for mode, design in both("m2/ports_edge.sv", "complex_ports"):
            for signal, bit, top_bit in (("lo", 0, 0), ("lo", 1, 1),
                                         ("hi", 0, 2), ("hi", 1, 3)):
                with self.subTest(mode=mode, signal=signal, bit=bit):
                    eps, completeness = design.endpoints(
                        "drivers", "complex_ports.u_split", signal, bit, "hier")
                    self.assertEqual(completeness, COMPLETE)
                    self.assertEqual([design.where(e) for e in eps],
                                     [("top_port", "complex_ports.data", top_bit)])

    def test_interface_port_reports_whole_unresolved_mapping(self):
        for mode, design in both("nav/nav.sv", "misc"):
            with self.subTest(mode=mode):
                internal = design.port("misc.iu", "b")["internal"]
                self.assertEqual(internal["kind"], "unresolved")
                self.assertEqual(internal["reason"], "interface_port")

    def test_interface_inside_query_propagates_partial_and_location(self):
        # This port has no integral bit space: query the whole object, not bit 0.
        for mode, design in both("nav/nav.sv", "misc"):
            port = design.port("misc.iu", "b")["ref"]
            for command in ("drivers", "loads"):
                for reach in ("local", "hier"):
                    with self.subTest(mode=mode, command=command, reach=reach):
                        reply = design.run(command, port, "--side", "inside", "--reach", reach)
                        self.assertEqual(reply["completeness"]["status"], "partial")
                        reasons = [r for r in reply["completeness"]["reasons"]
                                   if r["code"] == "interface_port"]
                        self.assertTrue(reasons, reply)
                        self.assertTrue(any(r.get("at") == port for r in reasons), reasons)


class UnknownBlackboxWidth(unittest.TestCase):
    def test_unknown_width_query_is_partial_not_empty_complete(self):
        for mode, design in both("m2/ports_edge.sv", "unknown_blackbox"):
            with self.subTest(mode=mode):
                pin = design.port("unknown_blackbox.u_missing", "Y")["ref"]
                for command in ("drivers", "loads"):
                    reply = design.run(command, pin, "--reach", "local", "--side", "outside")
                    self.assertEqual(reply["completeness"]["status"], "partial")
                    self.assertIn("unknown_pin_width",
                                  [r["code"] for r in reply["completeness"]["reasons"]])

    def test_unconnected_pin_has_no_fabricated_bit_space(self):
        for mode, design in both("m2/ports_edge.sv", "unknown_blackbox"):
            with self.subTest(mode=mode):
                parent = design.inst("unknown_blackbox")
                child = design.inst("unknown_blackbox.u_missing")
                self.assertEqual(design.info("unknown_blackbox.u_missing")["kind"], "blackbox")
                ports = design.run("ports", child)
                self.assertEqual([p["name"] for p in ports], ["A", "Y"])
                self.assertEqual(next(p for p in ports if p["name"] == "Y")
                                 ["internal"]["kind"], "unresolved")
                bindings = design.run("bindings", parent)["bindings"]
                self.assertEqual(len(bindings), 2)
                a = next(b for b in bindings if b["port"] == "A")
                y = next(b for b in bindings if b["port"] == "Y")
                self.assertEqual((a["direction"], a["width"]), ("unknown", 1))
                self.assertEqual((y["direction"], y["width"], y["segments"], y["unresolved"]),
                                 ("unknown", None, [], "unknown_pin_width"))
                self.assertEqual(y["inst"], child)
                self.assertEqual(y["pin"], next(p for p in ports if p["name"] == "Y")["ref"])
                self.assertNotIn("unresolved", a)


class ProcessAt(unittest.TestCase):
    def test_one_process_identifies_each_written_and_read_signal(self):
        for mode, design in both("m2/ports_edge.sv", "process_at"):
            with self.subTest(mode=mode):
                inst = design.inst("process_at")
                signals = {s["name"]: s["ref"] for s in design.signals(inst)}
                process_refs = set()
                for command, names in (("drivers", ("y", "z")),
                                       ("loads", ("a", "b"))):
                    for name in names:
                        eps, completeness = design.endpoints(
                            command, "process_at", name, 0, "local")
                        self.assertEqual(completeness, COMPLETE)
                        processes = [e for e in eps if e["kind"] == "process"]
                        self.assertTrue(processes, (command, name, eps))
                        for e in processes:
                            self.assertEqual(e["at"],
                                             {"ref": signals[name], "bits": {"lsb": 0, "width": 1}})
                            self.assertEqual(e["bits"], e["at"]["bits"])
                            self.assertEqual(e["queried"], {"lsb": 0, "width": 1})
                            process_refs.add(e["ref"])
                self.assertEqual(len(process_refs), 1)


if __name__ == "__main__":
    unittest.main()
