"""Independent red regressions for C-35--C-42, derived from public contracts.

No implementation or A self-test is an oracle. Hand-written expectations use
DESIGN 4.4 (including clarified output conversion), 4.6, 5.3 and 5.4.
Each semantic case runs shared and per-instance. No expectedFailure or skip.
"""
import json
import os
import subprocess
import tempfile
import unittest

from hiercli import COMPLETE, Design, bits, both, use
from test_verify import counters

FIXTURE = "m2/review_edges.sv"
COMPOSITES = ("composite_xor", "composite_mux", "ansi_xor", "ansi_mux")
TOPS = (*COMPOSITES, "output_widths", "external_init", "external_assign",
        "external_input", "external_output", "positional_blackbox", "positional_gap",
        "named_blackbox", "interface_boundary", "constant_if", "parameter_cases",
        "nested_if", "constant_reset", "constant_set", "reset_set_priority")


def signal(design, path, name):
    return next(s["ref"] for s in design.signals(design.inst(path)) if s["name"] == name)


def binding(design, top, child, port):
    return next(b for b in design.run("bindings", design.inst(top))["bindings"]
                if b["inst"] == design.inst(top + "." + child) and b["port"] == port)


class PublicReviewEdges(unittest.TestCase):
    def assert_partial(self, reply, code, at):
        self.assertEqual(reply["completeness"]["status"], "partial", reply)
        self.assertTrue(any(r["code"] == code and r.get("at") == at
                            for r in reply["completeness"]["reasons"]), reply)

    def test_all_semantic_inputs_are_legal(self):
        # Proves the negative semantic tests are not based on compiler errors.
        for top in TOPS:
            for mode, design in both(FIXTURE, top):
                with self.subTest(top=top, mode=mode):
                    diags = design.run("diags")
                    self.assertEqual(diags["errorCount"], 0, diags)
                    self.assertEqual(len(design.run("roots")), 1)

    def test_c35_composite_expression_retains_every_bit_and_dependency(self):
        for top in COMPOSITES:
            for mode, design in both(FIXTURE, top):
                with self.subTest(top=top, mode=mode):
                    want = [("expr", frozenset({use("a", i), use("b", i)} |
                            ({use("sel", 0, "control")} if "mux" in top else set())))
                            for i in range(4)]
                    self.assertEqual(design.pin_map(top)[("u", "joined")], want)

    def test_c35_cross_hierarchy_drivers_stop_at_expression_not_unconnected(self):
        for top in COMPOSITES:
            for mode, design in both(FIXTURE, top):
                bound = binding(design, top, "u", "joined")
                for name, bit, pin_bit in (("lo", 0, 0), ("lo", 1, 1),
                                           ("hi", 0, 2), ("hi", 1, 3)):
                    with self.subTest(top=top, mode=mode, name=name, bit=bit):
                        eps, status = design.endpoints("drivers", top + ".u", name, bit, "hier")
                        self.assertEqual(status, COMPLETE)
                        self.assertEqual(len(eps), 1)
                        e = eps[0]
                        self.assertEqual(e["kind"], "process")
                        self.assertEqual(design.proc(e["ref"])["kind"], "port_expr")
                        self.assertEqual(e["at"], {"ref": bound["pin"],
                                                 "bits": {"lsb": pin_bit, "width": 1}})
                        segment = next(s for s in bound["segments"] if pin_bit in bits(s["pinBits"]))
                        self.assertEqual(segment["target"], {"kind": "expr", "process": e["ref"]})

    def test_c35_reverse_loads_retain_both_operands_and_selector(self):
        for top in COMPOSITES:
            for mode, design in both(FIXTURE, top):
                bound = binding(design, top, "u", "joined")
                for name in ("a", "b", "sel") if "mux" in top else ("a", "b"):
                    for bit in range(1 if name == "sel" else 4):
                        with self.subTest(top=top, mode=mode, name=name, bit=bit):
                            self.assertTrue(all(s["target"]["kind"] == "expr" for s in bound["segments"]))
                            expected = {s["target"]["process"] for s in bound["segments"]
                                        if name == "sel" or bit in bits(s["pinBits"])}
                            self.assertTrue(expected)
                            for reach in ("local", "hier"):
                                eps, status = design.endpoints("loads", top, name, bit, reach)
                                self.assertEqual(status, COMPLETE)
                                self.assertEqual({e["ref"] for e in eps if e["kind"] == "process"}, expected)

    def test_c36_output_conversion_has_complete_parent_writes_without_duplicate_drivers(self):
        for mode, design in both(FIXTURE, "output_widths"):
            for child, target, expected_bits in (("u_zero", "u4", (0, 1, None, None)),
                                                  ("u_sign", "s4", (0, 1, 1, 1)),
                                                  ("u_trunc", "t2", (0, 1))):
                with self.subTest(mode=mode, child=child):
                    bound = binding(design, "output_widths", child, "q")
                    self.assertTrue(bound["segments"])
                    self.assertTrue(all(s["target"]["kind"] == "expr" for s in bound["segments"]))
                    refs = {s["target"]["process"] for s in bound["segments"]}
                    self.assertEqual(len(refs), 1)
                    proc = next(iter(refs))
                    self.assertEqual(design.proc(proc)["kind"], "port_expr")
                    for bit, source_bit in enumerate(expected_bits):
                        for reach in ("local", "hier"):
                            eps, status = design.endpoints("drivers", "output_widths", target, bit, reach)
                            self.assertEqual(status, COMPLETE)
                            self.assertEqual([e["kind"] for e in eps], ["process"])
                            self.assertEqual([e["ref"] for e in eps], [proc])
                        writes = [w for w in design.proc(proc)["writes"]
                                  if w["target"]["ref"] == signal(design, "output_widths", target)
                                  and bit in bits(w["target"]["bits"])]
                        self.assertEqual(len(writes), 1, writes)
                        deps = set()
                        for dep in writes[0]["deps"]:
                            self.assertIn(dep["align"], ("bitwise", "all"))
                            if dep["align"] == "bitwise":
                                self.assertEqual(dep["bits"]["width"], writes[0]["target"]["bits"]["width"])
                                read = [dep["bits"]["lsb"] + bit - writes[0]["target"]["bits"]["lsb"]]
                            else:
                                read = bits(dep["bits"])
                            deps.update((dep["signal"], i, dep["role"], dep["precision"]) for i in read)
                        self.assertEqual(deps, set() if source_bit is None else
                                         {(bound["pin"], source_bit, "data", "exact")})

    def test_c36_equal_width_output_concat_preserves_bit_permutation(self):
        for mode, design in both(FIXTURE, "output_widths"):
            for parent_bit, child_bit in enumerate((2, 3, 0, 1)):
                with self.subTest(mode=mode, parent_bit=parent_bit):
                    eps, status = design.endpoints("drivers", "output_widths", "cat", parent_bit, "hier")
                    self.assertEqual(status, COMPLETE)
                    self.assertEqual(len(eps), 1)
                    self.assertEqual(design.where(eps[0]), ("process", "output_widths.u_concat", child_bit))

    def test_c36_truncated_child_bits_have_no_parent_load(self):
        for mode, design in both(FIXTURE, "output_widths"):
            pin = design.port("output_widths.u_trunc", "q")["ref"]
            for bit in (2, 3):
                with self.subTest(mode=mode, bit=bit):
                    reply = design.run("loads", pin, "--lsb", str(bit), "--width", "1",
                                       "--side", "outside", "--reach", "local")
                    self.assertEqual(reply["completeness"], COMPLETE)
                    self.assertEqual(reply["result"], [])

    def test_c37_all_external_source_forms_mark_reverse_signal_access(self):
        for top, command in (("external_init", "loads"), ("external_assign", "loads"),
                             ("external_input", "loads"), ("external_output", "drivers")):
            for mode, design in both(FIXTURE, top):
                ref = signal(design, top + ".u", "s")
                for reach in ("local", "hier"):
                    with self.subTest(top=top, mode=mode, reach=reach):
                        reply = design.run(command, ref, "--reach", reach)
                        self.assert_partial(reply, "hier_ref", ref)

    def test_c37_step_propagates_external_access_for_each_source_form(self):
        for top, direction in (("external_init", "forward"), ("external_assign", "forward"),
                               ("external_input", "forward"), ("external_output", "back")):
            for mode, design in both(FIXTURE, top):
                with self.subTest(top=top, mode=mode):
                    ref = signal(design, top + ".u", "s")
                    self.assert_partial(design.run("step", ref, "--dir", direction), "hier_ref", ref)

    def test_c38_positional_blackbox_preserves_positions_names_width_and_empty_slot(self):
        for top, expected in (("positional_blackbox", (1, 1)), ("positional_gap", (1, None, 1)),
                              ("named_blackbox", (1, None, 1))):
            for mode, design in both(FIXTURE, top):
                with self.subTest(top=top, mode=mode):
                    child = design.inst(top + ".u")
                    ports = design.run("ports", child)
                    self.assertEqual(len(ports), len(expected))
                    self.assertEqual([p["name"] for p in ports],
                                     ["A", "X", "Y"] if top == "named_blackbox" else [""] * len(expected))
                    self.assertEqual(len({p["ref"] for p in ports}), len(expected))
                    bound = design.run("bindings", design.inst(top))["bindings"]
                    self.assertEqual([b["pin"] for b in bound], [p["ref"] for p in ports])
                    self.assertEqual([b["width"] for b in bound], list(expected))
                    self.assertTrue(all(b["direction"] == "unknown" for b in bound))
                    names = design.names(design.inst(top))
                    for index, b in enumerate(bound):
                        if expected[index] is None:
                            self.assertEqual((b["segments"], b["unresolved"]), ([], "unknown_pin_width"))
                        else:
                            self.assertEqual(len(b["segments"]), 1)
                            self.assertEqual(b["segments"][0]["pinBits"], {"lsb": 0, "width": 1})
                            t = b["segments"][0]["target"]
                            self.assertEqual((t["kind"], names[t["signal"]], t["bits"]),
                                             ("signal", "a" if index == 0 else "y", {"lsb": 0, "width": 1}))

    def test_c39_interface_internal_signal_queries_stop_with_interface_reason(self):
        for mode, design in both(FIXTURE, "interface_boundary"):
            ref = signal(design, "interface_boundary.u", "s")
            for command in ("drivers", "loads"):
                for reach in ("local", "hier"):
                    with self.subTest(mode=mode, command=command, reach=reach):
                        self.assert_partial(design.run(command, ref, "--reach", reach), "interface_port", ref)

    def test_c38_known_width_connections_reach_blackbox_not_empty_complete(self):
        for top in ("positional_blackbox", "positional_gap", "named_blackbox"):
            for mode, design in both(FIXTURE, top):
                for command, name in (("loads", "a"), ("drivers", "y")):
                    with self.subTest(top=top, mode=mode, command=command):
                        eps, status = design.endpoints(command, top, name, 0, "hier")
                        # No-library direction is unknown. The public contract does
                        # not fix this path's endpoint kind/reason; reject only the
                        # definite lie "nothing connected, completely known".
                        self.assertTrue(eps or status["status"] == "partial", (eps, status))
                        if status["status"] == "partial":
                            self.assertTrue(status["reasons"], status)

    def test_c39_interface_port_is_partial_from_both_sides(self):
        for mode, design in both(FIXTURE, "interface_boundary"):
            ref = design.port("interface_boundary.v", "b")["ref"]
            for side in ("inside", "outside"):
                for command in ("drivers", "loads"):
                    for reach in ("local", "hier"):
                        with self.subTest(mode=mode, side=side, command=command, reach=reach):
                            self.assert_partial(design.run(command, ref, "--side", side, "--reach", reach),
                                                "interface_port", ref)

    def test_c39_interface_binding_does_not_masquerade_as_unknown_blackbox_width(self):
        for mode, design in both(FIXTURE, "interface_boundary"):
            with self.subTest(mode=mode):
                bound = binding(design, "interface_boundary", "v", "b")
                self.assertEqual(bound.get("unresolved"), "interface_port")
                self.assertNotEqual(bound.get("unresolved"), "unknown_pin_width")
                for s in bound["segments"]:
                    self.assertEqual(s["target"], {"kind": "unresolved", "reason": "interface_port"})

    def test_c40_open_failure_is_nonzero_and_bad_request_for_both_check_commands(self):
        design = Design(FIXTURE, "constant_reset")
        with tempfile.TemporaryDirectory(prefix="hier-b-absent-") as folder:
            missing = os.path.join(folder, "missing.sv")
            self.assertFalse(os.path.exists(missing))
            for command in ("verify-facts", "verify-sharing"):
                good = subprocess.run([os.environ["HIER_BIN"], command, *design.design],
                                      capture_output=True, text=True, timeout=20)
                self.assertEqual(good.returncode, 0, good.stdout + good.stderr)
                for args in ((missing,), ("-f", missing), ("--top",), ("--lsb", "NaN")):
                    with self.subTest(command=command, args=args):
                        p = subprocess.run([os.environ["HIER_BIN"], command, *args],
                                           capture_output=True, text=True, timeout=20)
                        self.assertNotEqual(p.returncode, 0, p.stdout)
                        body = json.loads(p.stdout)
                        self.assertEqual(body["error"]["code"], "bad_request")
                        self.assertTrue(body["error"]["message"])

    def test_c41_constant_conditions_pass_independent_fact_checks(self):
        for top in ("constant_if", "parameter_cases", "nested_if"):
            for mode, design in both(FIXTURE, top):
                with self.subTest(top=top, mode=mode):
                    p = subprocess.run([os.environ["HIER_BIN"], "verify-facts", *design.design],
                                       capture_output=True, text=True, timeout=20)
                    self.assertEqual(p.returncode, 0, p.stdout + p.stderr)
                    count = counters(p)
                    self.assertGreater(count["slangCompared"], 0)
                    self.assertEqual(count["mismatched"], 0)

    def test_c41_only_reachable_reads_affect_written_bits(self):
        cases = (("constant_if", "constant_if", "y", "a"),
                 ("parameter_cases", "parameter_cases.yes", "y", "a"),
                 ("parameter_cases", "parameter_cases.no", "y", "b"),
                 ("nested_if", "nested_if", "y", "a"), ("nested_if", "nested_if", "z", "c"))
        for top, path, target, source in cases:
            for mode, design in both(FIXTURE, top):
                with self.subTest(top=top, path=path, mode=mode, target=target):
                    self.assertEqual(design.driver_deps(path, target, 0),
                                     [("always_comb", frozenset({use(source, 0)}))])

    def test_c42_async_classification_ignores_normal_branch_constants(self):
        for top, ctrls, targets in (("constant_reset", {("rst_n", "negedge", "reset")}, 1),
                                    ("constant_set", {("set", "posedge", "set")}, 1),
                                    ("reset_set_priority", {("rst_n", "negedge", "reset"),
                                                            ("set", "posedge", "set")}, 2)):
            for mode, design in both(FIXTURE, top):
                with self.subTest(top=top, mode=mode):
                    self.assertEqual(design.registers(top),
                                     {f"q[{i}]": ("clk", "posedge", frozenset(ctrls)) for i in range(targets)})


if __name__ == "__main__":
    unittest.main()
