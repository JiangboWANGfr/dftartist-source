"""C-37 direction consistency and C-43 target projection; DESIGN 4.1/4.6/5.4.

Expected roles and classifications are hand-written from the fixture. Source
facts and reverse queries are both checked; neither can excuse errors in the other.
"""
import unittest

from hiercli import COMPLETE, both

FIXTURE = "m2/review_followup.sv"
DIRECTIONS = ("direction_inout", "direction_ref", "direction_tran", "direction_tranif")
CLASSIFICATIONS = {
    "concat_class": {"hi[0]": "set", "lo[0]": "reset"},
    "split_class": {"hi[0]": "set", "lo[0]": "reset"},
    "slice_class": {"q[0]": "set", "q[1]": "set", "q[2]": "reset", "q[3]": "reset"},
    "split_slice_class": {"q[0]": "set", "q[1]": "set", "q[2]": "reset", "q[3]": "reset"},
    "nested_class": {"hi[0]": "set", "mid[0]": "reset", "lo[0]": "set"},
    "unknown_class": {"hi[0]": "unknown", "lo[0]": "reset"},
    # A whole-variable nonzero constant is set for the whole variable (4.6).
    "whole_class": {f"q[{i}]": "set" for i in range(4)},
}


def signal(design, path, name):
    return next(s["ref"] for s in design.signals(design.inst(path)) if s["name"] == name)


class Followup(unittest.TestCase):
    def assert_partial(self, reply, at=None):
        self.assertEqual(reply["completeness"]["status"], "partial", reply)
        self.assertTrue(any(r["code"] == "hier_ref" and (at is None or r.get("at") == at)
                            for r in reply["completeness"]["reasons"]), reply)

    def test_all_inputs_are_legal(self):
        for top in (*DIRECTIONS, *CLASSIFICATIONS, "library_named", "library_position",
                    "direction_occurrences"):
            for mode, design in both(FIXTURE, top):
                with self.subTest(top=top, mode=mode):
                    self.assertEqual(design.run("diags")["errorCount"], 0)
                    self.assertEqual(len(design.run("roots")), 1)

    def test_c37_bidirectional_source_has_both_external_access_roles(self):
        for top in DIRECTIONS:
            for mode, design in both(FIXTURE, top):
                with self.subTest(top=top, mode=mode):
                    roles = set()
                    for summary in design.run("procs", design.inst(top), "--limit", "1000")["items"]:
                        reply = design.run("proc", summary["ref"])
                        external = [r for r in reply["result"]["externalRefs"] if r["text"] == "u.s"]
                        if external:
                            self.assert_partial(reply, summary["ref"])
                            roles.update(r["access"] for r in external)
                    self.assertEqual(roles, {"read", "write"})

    def test_c37_reverse_queries_mark_both_read_and_write(self):
        for top in DIRECTIONS:
            for mode, design in both(FIXTURE, top):
                ref = signal(design, top + ".u", "s")
                for command in ("drivers", "loads"):
                    for reach in ("local", "hier"):
                        with self.subTest(top=top, mode=mode, command=command, reach=reach):
                            self.assert_partial(design.run(command, ref, "--reach", reach), ref)

    def test_c37_step_preserves_both_external_directions(self):
        for top in DIRECTIONS:
            for mode, design in both(FIXTURE, top):
                ref = signal(design, top + ".u", "s")
                for direction in ("back", "forward"):
                    with self.subTest(top=top, mode=mode, direction=direction):
                        self.assert_partial(design.run("step", ref, "--dir", direction))

    def test_c37_repeated_parents_keep_array_occurrences_isolated(self):
        for mode, design in both(FIXTURE, "direction_occurrences"):
            for parent in ("left", "right"):
                for element in (0, 1):
                    for reach in ("local", "hier"):
                        with self.subTest(mode=mode, parent=parent, element=element, reach=reach):
                            ref = signal(design, f"direction_occurrences.{parent}.u[{element}]", "s")
                            reply = design.run("loads", ref, "--reach", reach)
                            if element == 1:
                                self.assert_partial(reply, ref)
                            else:
                                self.assertEqual(reply["completeness"], COMPLETE)
                                self.assertEqual(reply["result"], [])

    def test_c43_classification_projects_each_lvalue_operand(self):
        for top in ("concat_class", "slice_class", "nested_class"):
            for mode, design in both(FIXTURE, top):
                with self.subTest(top=top, mode=mode):
                    self.assertEqual(design.registers(top),
                                     {name: ("clk", "posedge", frozenset({("rst_n", "negedge", kind)}))
                                      for name, kind in CLASSIFICATIONS[top].items()})

    def test_c43_equivalent_split_assignments_have_identical_classification(self):
        for composite, split in (("concat_class", "split_class"), ("slice_class", "split_slice_class")):
            for mode, design in both(FIXTURE, composite):
                with self.subTest(composite=composite, mode=mode):
                    counterpart = dict(both(FIXTURE, split))[mode]
                    want = {name: ("clk", "posedge", frozenset({("rst_n", "negedge", kind)}))
                            for name, kind in CLASSIFICATIONS[split].items()}
                    self.assertEqual(counterpart.registers(split), want)
                    self.assertEqual(design.registers(composite), want)

    def test_c43_unknown_operand_does_not_poison_known_zero_neighbor(self):
        for mode, design in both(FIXTURE, "unknown_class"):
            with self.subTest(mode=mode):
                self.assertEqual(design.registers("unknown_class"),
                                 {name: ("clk", "posedge", frozenset({("rst_n", "negedge", kind)}))
                                  for name, kind in CLASSIFICATIONS["unknown_class"].items()})

    def test_c43_whole_nonzero_variable_retains_existing_set_rule(self):
        for mode, design in both(FIXTURE, "whole_class"):
            with self.subTest(mode=mode):
                self.assertEqual(design.registers("whole_class"),
                                 {name: ("clk", "posedge", frozenset({("rst_n", "negedge", kind)}))
                                  for name, kind in CLASSIFICATIONS["whole_class"].items()})


if __name__ == "__main__":
    unittest.main()
