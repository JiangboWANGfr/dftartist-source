from m3cli import Contract, bitrange, modes


class Expressions(Contract):
    def expression(self, d, name):
        result = self.complete(d.process_for(name))
        expr = result["expr"]
        self.assertIn("width", expr)
        self.assertIn("signed", expr)
        return expr

    def reference(self, expr, ref, width=4, lsb=0):
        self.assertEqual(expr["op"], "ref")
        self.assertEqual(expr["slice"], {"ref": ref, "bits": bitrange(lsb, width)})
        self.assertEqual(expr["width"], width)
        self.assertNotIn("args", expr)
        self.assertNotIn("uses", expr)
        self.assertNotIn("value", expr)

    def test_binary_keeps_left_right_operands_and_type(self):
        for mode, d in modes():
            with self.subTest(mode=mode):
                expr = self.expression(d, "gate")
                self.assertEqual((expr["op"], expr["width"], expr["signed"]), ("and", 4, False))
                self.assertEqual(len(expr["args"]), 2)
                for operand, name in zip(expr["args"], ("a", "b")):
                    self.reference(operand, d.ref(name))

    def test_mux_has_three_ordered_args_not_an_alternative_shape(self):
        for mode, d in modes():
            with self.subTest(mode=mode):
                expr = self.expression(d, "choice")
                self.assertEqual(expr["op"], "mux")
                self.assertEqual(len(expr["args"]), 3)
                for operand, name, width in zip(expr["args"], ("sel", "a", "b"), (1, 4, 4)):
                    self.reference(operand, d.ref(name), width)
                for legacy in ("cond", "then", "else"):
                    self.assertNotIn(legacy, expr)

    def test_concat_is_high_to_low_unlike_binding_segments(self):
        for mode, d in modes():
            with self.subTest(mode=mode):
                expr = self.expression(d, "joined")
                self.assertEqual((expr["op"], expr["width"]), ("concat", 4))
                self.assertEqual(len(expr["args"]), 2)
                for operand, name in zip(expr["args"], ("a", "b")):
                    self.reference(operand, d.ref(name), 2)

    def test_unary_and_reduction_have_one_operand(self):
        for mode, d in modes():
            for name, op, width in (("inverted", "not", 4), ("reduced", "reduce_and", 1)):
                with self.subTest(mode=mode, name=name):
                    expr = self.expression(d, name)
                    self.assertEqual((expr["op"], expr["width"]), (op, width))
                    self.assertEqual(len(expr["args"]), 1)
                    self.reference(expr["args"][0], d.ref("a"))

    def test_four_state_constant_preserves_width_and_digits(self):
        for mode, d in modes():
            with self.subTest(mode=mode):
                expr = self.expression(d, "constant_value")
                self.assertEqual((expr["op"], expr["width"], expr["value"]), ("const", 4, "4'b10xz"))
                for field in ("slice", "args", "uses"):
                    self.assertNotIn(field, expr)

    def test_other_keeps_conversion_and_only_projected_dependencies(self):
        for mode, d in modes():
            for name, inputs in (("extended", {("a", 0, 2)}), ("truncated", {("b", 0, 4)}),
                                 ("shifted", {("a", 0, 3)}),
                                 ("total", {("a", 0, 4), ("b", 0, 4)})):
                with self.subTest(mode=mode, name=name):
                    expr = self.expression(d, name)
                    self.assertEqual((expr["op"], expr["width"]), ("other", 4))
                    self.assertTrue(expr["text"])
                    self.assertNotIn("args", expr)
                    names = {d.ref(n): n for n in ("a", "b")}
                    actual = {(names[u["signal"]], u["bits"]["lsb"], u["bits"]["width"])
                              for u in expr["uses"]}
                    self.assertEqual(actual, inputs)
                    for use in expr["uses"]:
                        self.assertEqual((use["align"], use["precision"], use["role"]),
                                         ("all", "conservative", "data"))

    def test_init_and_input_port_expression_have_trees(self):
        for mode, d in modes():
            with self.subTest(mode=mode):
                self.assertEqual(self.expression(d, "initialized")["op"], "xor")
                expressions = [d.call("proc", p["ref"])["result"]["expr"]
                               for p in d.call("procs", d.inst(("flow",)), "--limit", 1000)["items"]
                               if p["kind"] == "port_expr"]
                self.assertEqual(len(expressions), 1)
                self.assertEqual((expressions[0]["op"], expressions[0]["width"]), ("xor", 2))

    def test_procedural_source_has_no_value_expression_tree(self):
        for mode, d in modes():
            with self.subTest(mode=mode):
                result = self.complete(d.process_for("procedural"))
                self.assertEqual(result["kind"], "always_comb")
                self.assertNotIn("expr", result)
                self.assertTrue(all("exprMap" not in w for w in result["writes"]))

    def projected_bits(self, writes):
        projected = {}
        for w in writes:
            mapping = w["exprMap"]
            self.assertEqual(mapping["status"], "mapped")
            segments = mapping["segments"]
            self.assertEqual(segments, sorted(segments, key=lambda m: (m["to"], m["from"])))
            target = w["target"]
            covered = set()
            for m in segments:
                self.assertGreater(m["width"], 0)
                for offset in range(m["width"]):
                    key = (target["ref"], m["to"] + offset)
                    self.assertNotIn(key, projected)
                    projected[key] = m["from"] + offset
                    covered.add(m["to"] + offset)
            bits = target["bits"]
            self.assertEqual(covered, set(range(bits["lsb"], bits["lsb"] + bits["width"])))
        return projected

    def test_reordered_constant_lvalues_have_opposite_values(self):
        for top, expected in (("expr_first", {"a": (1, 0), "b": (0, 1)}),
                              ("expr_second", {"a": (0, 1), "b": (1, 0)})):
            for mode, d in modes("flow.sv", (top,)):
                with self.subTest(top=top, mode=mode):
                    process = self.complete(d.process_for("a", (top,)))
                    expr = process["expr"]
                    self.assertEqual((expr["op"], expr["width"], expr["value"]), ("const", 2, "2'b01"))
                    self.assertTrue(all(w["deps"] == [] for w in process["writes"]))
                    mapping = self.projected_bits(process["writes"])
                    for name, (position, value) in expected.items():
                        self.assertEqual(mapping[(d.ref(name, (top,)), 0)], position)
                        self.assertEqual((1 >> mapping[(d.ref(name, (top,)), 0)]) & 1, value)

    def test_nested_lvalue_keeps_same_bus_segments_and_flat_coordinates(self):
        for mode, d in modes("flow.sv", ("expr_nested",)):
            with self.subTest(mode=mode):
                process = self.complete(d.process_for("q", ("expr_nested",)))
                self.assertEqual(process["expr"]["width"], 5)
                q, s = (d.ref(n, ("expr_nested",)) for n in ("q", "s"))
                projected = self.projected_bits(process["writes"])
                expected = {(q, 0): 0, (q, 1): 1, (q, 2): 3, (q, 3): 4, (s, 0): 2}
                self.assertEqual(projected, expected)
                self.assertEqual({k: (0b10101 >> v) & 1 for k, v in projected.items()},
                                 {(q, 0): 1, (q, 1): 0, (q, 2): 0, (q, 3): 1, (s, 0): 1})

    def test_nonzero_lsb_shift_maps_result_not_operand_after_write_split(self):
        for mode, d in modes("flow.sv", ("expr_shift",)):
            with self.subTest(mode=mode):
                process = self.complete(d.process_for("y", ("expr_shift",)))
                self.assertEqual(process["expr"]["width"], 4)
                y, a = (d.ref(n, ("expr_shift",)) for n in ("y", "a"))
                self.assertEqual(self.projected_bits(process["writes"]), {(y, i + 3): i for i in range(4)})
                by_lsb = {w["target"]["bits"]["lsb"]: w for w in process["writes"]}
                self.assertEqual(set(by_lsb), {3, 4})
                self.assertEqual(by_lsb[3]["deps"], [])
                self.assertEqual(by_lsb[3]["exprMap"]["segments"], [{"from": 0, "to": 3, "width": 1}])
                self.assertEqual(by_lsb[4]["exprMap"]["segments"], [{"from": 1, "to": 4, "width": 3}])
                self.assertEqual(by_lsb[4]["deps"], [{"signal": a, "bits": bitrange(0, 3),
                                                      "role": "data", "precision": "exact", "align": "bitwise"}])
