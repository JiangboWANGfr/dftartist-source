"""B oracle: DESIGN 5.5.5/5.5.7, frozen before new-product execution."""
from m3cli import Contract, modes


class LookupEdges(Contract):
    def test_multidimensional_and_escaped_array_identity_and_round_trip(self):
        for mode, d in modes("lookup_edges.sv", ("edge_a", "edge_b")):
            root = d.inst(("edge_a",))
            children = d.call("children", root, "--limit", 1000)["items"]
            for i in (0, 1):
                for j in (-2, -1):
                    for name, text in ((f"grid[{i}][{j}]", f"edge_a.grid[{i}][{j}]"),
                                       (f"odd.name[{i}][{j}]", f"edge_a/\\odd.name [{i}][{j}]")):
                        with self.subTest(mode=mode, text=text):
                            matches = [c["ref"] for c in children if c["name"] == name]
                            self.assertEqual(len(matches), 2 if (name == "grid[1][-1]") else 1)
                            self.assertEqual(self.complete(d.call("resolve-path", text)), matches[:1])
            twin = [c["ref"] for c in children if c["name"] == "grid[1][-1]"]
            self.assertEqual(self.complete(d.call("resolve-path", "edge_a.\\grid[1][-1] ")), twin[1:])
            for child in children:
                with self.subTest(mode=mode, path=child["pathText"]):
                    self.assertIn(child["ref"], self.complete(d.call("resolve-path", child["pathText"])))

    def test_nonexistent_indices_are_empty_not_malformed_and_no_suffix_fallback(self):
        for mode, d in modes("lookup_edges.sv", ("edge_a", "edge_b")):
            self.assertEqual(len(self.complete(d.call("resolve-path", "b_x"))), 2)
            for text in ("edge_a.grid[2][-1]", "edge_a.grid[1]", "edge_a.grid[1][-1][0]",
                         "edge_a.odd.name[1][-1]", "/b_x", "edge_a.b_x.q.child"):
                with self.subTest(mode=mode, text=text):
                    self.assertEqual(self.complete(d.call("resolve-path", text)), [])
            for text in ("edge_a.grid[]", "edge_a.grid[1][--2]", "edge_a.grid[1][-1:0]",
                         "edge_a.grid[1][1.0]", "edge_a.\\odd.name[1][-1]"):
                with self.subTest(mode=mode, text=text):
                    self.error(d, "bad_request", "resolve-path", text)

    def test_blackbox_primitive_top_unused_definition_occurrences(self):
        for mode, d in modes("lookup_edges.sv", ("edge_a", "edge_b")):
            defs = {x["name"]: x["ref"] for x in d.call("defs", "--limit", 1000)["items"]}
            self.assertEqual(set(defs), {"edge_a", "edge_b", "edge_leaf", "edge_unused", "absent_edge", "buf"})
            instances = d.instances()
            self.assertEqual(len(instances), 20)
            for name, count in (("edge_leaf", 12), ("absent_edge", 3), ("buf", 3),
                                ("edge_a", 1), ("edge_b", 1), ("edge_unused", 0)):
                with self.subTest(mode=mode, definition=name):
                    found = self.complete(d.call("def-instances", defs[name], "--limit", 1000))["items"]
                    self.assertEqual(len(found), count)
                    self.assertEqual({x["ref"] for x in found},
                                     {x["ref"] for x in instances if x["def"] == defs[name]})

    def test_limit_rejects_tail_fraction_overflow_for_old_and_new_cli(self):
        for mode, d in modes("lookup.sv", ("alpha", "beta")):
            root = d.inst(("alpha",))
            for prefix in (("children", root), ("search", "", "--kind", "instance")):
                page = d.call(*prefix, "--limit", 1)
                self.assertEqual(len(page.get("result", page)["items"]), 1)
                for value in ("0", "-1", "abc", "1x", "1.2", "99999999999999999999999999"):
                    with self.subTest(mode=mode, prefix=prefix, limit=value):
                        self.error(d, "bad_request", *prefix, "--limit", value)
