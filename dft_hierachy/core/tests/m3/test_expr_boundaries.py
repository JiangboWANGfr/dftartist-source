from m3cli import Contract, bitrange, modes


class ExpressionBoundaries(Contract):
    def process(self, design, name, top="expr_summary"):
        process = self.complete(design.process_for(name, (top,)))
        expr = process["expr"]
        self.assertIsInstance(expr["signed"], bool)
        width = expr["width"]
        target = design.ref(name, (top,))
        covered = {}
        for write in process["writes"]:
            self.assertEqual(write["target"]["ref"], target)
            mapping = write["exprMap"]
            self.assertEqual(mapping["status"], "mapped")
            self.assertEqual(mapping["segments"], sorted(mapping["segments"], key=lambda m: (m["to"], m["from"])))
            written = set()
            for segment in mapping["segments"]:
                self.assertGreater(segment["width"], 0)
                self.assertGreaterEqual(segment["from"], 0)
                self.assertLessEqual(segment["from"] + segment["width"], width)
                for offset in range(segment["width"]):
                    bit = segment["to"] + offset
                    self.assertNotIn(bit, covered)
                    covered[bit] = segment["from"] + offset
                    written.add(bit)
            bounds = write["target"]["bits"]
            self.assertEqual(written, set(range(bounds["lsb"], bounds["lsb"] + bounds["width"])))
        self.assertEqual(covered, {i: i for i in range(width)})
        return process

    def relations(self, process):
        result = set()
        for write in process["writes"]:
            target = write["target"]["bits"]
            for dep in write["deps"]:
                source = dep["bits"]
                self.assertIn(dep["align"], ("all", "bitwise"))
                if dep["precision"] == "conservative":
                    self.assertEqual(dep["align"], "all")
                if dep["align"] == "bitwise":
                    self.assertEqual(source["width"], target["width"])
                for offset in range(target["width"]):
                    inputs = (range(source["lsb"], source["lsb"] + source["width"])
                              if dep["align"] == "all" else (source["lsb"] + offset,))
                    for bit in inputs:
                        result.add((target["lsb"] + offset, dep["signal"], bit, dep["role"], dep["precision"]))
        return result

    def uses(self, process):
        expr = process["expr"]
        self.assertEqual(expr["op"], "other")
        self.assertTrue(expr["text"])
        self.assertNotIn("args", expr)
        actual = set()
        for use in expr["uses"]:
            self.assertEqual(use["align"], "all")
            for bit in range(use["bits"]["lsb"], use["bits"]["lsb"] + use["bits"]["width"]):
                atom = (use["signal"], bit, use["role"], use["precision"])
                self.assertNotIn(atom, actual)
                actual.add(atom)
        return actual

    @staticmethod
    def atoms(ref, width, precision="conservative", role="data"):
        return {(ref, bit, role, precision) for bit in range(width)}

    def test_reduction_and_comparison_zero_extension_preserve_exact_low_bit_deps(self):
        for mode, design in modes("expr_boundaries.sv", ("expr_summary",)):
            for name, inputs in (("reduce_ext", ("a",)), ("compare_ext", ("a", "b"))):
                with self.subTest(mode=mode, output=name):
                    process = self.process(design, name)
                    self.assertEqual(process["expr"]["width"], 4)
                    refs = [design.ref(n, ("expr_summary",)) for n in inputs]
                    self.assertEqual(self.relations(process),
                                     {(0, ref, bit, "data", "exact") for ref in refs for bit in range(4)})
                    self.assertEqual(self.uses(process), set().union(*(self.atoms(r, 4) for r in refs)))

    def test_mixed_concat_summary_does_not_claim_partial_all_is_exact(self):
        for mode, design in modes("expr_boundaries.sv", ("expr_summary",)):
            with self.subTest(mode=mode):
                process = self.process(design, "mixed")
                self.assertEqual(process["expr"]["width"], 6)
                a, b = (design.ref(n, ("expr_summary",)) for n in ("a", "b"))
                expected = {(i + 1, a, i, "data", "exact") for i in range(4)}
                expected |= {(0, b, i, "data", "exact") for i in range(4)}
                self.assertEqual(self.relations(process), expected)
                self.assertEqual(self.uses(process), self.atoms(a, 4) | self.atoms(b, 4))

    def test_sign_extended_reduction_retains_genuine_full_exact_all(self):
        for mode, design in modes("expr_boundaries.sv", ("expr_summary",)):
            with self.subTest(mode=mode):
                process = self.process(design, "sign_full")
                self.assertEqual(process["expr"]["width"], 4)
                a = design.ref("a", ("expr_summary",))
                self.assertEqual(self.relations(process),
                                 {(i, a, j, "data", "exact") for i in range(4) for j in range(4)})
                self.assertEqual(self.uses(process), self.atoms(a, 4, "exact"))

    def test_mixed_precision_neither_downgrades_writes_nor_overstates_summary(self):
        for mode, design in modes("expr_boundaries.sv", ("expr_summary",)):
            with self.subTest(mode=mode):
                process = self.process(design, "mixed_precision")
                self.assertEqual(process["expr"]["width"], 6)
                a, b = (design.ref(n, ("expr_summary",)) for n in ("a", "b"))
                expected = {(i, ref, j, "data", "conservative")
                            for i in range(3) for ref in (a, b) for j in range(3)}
                expected |= {(3, a, j, "data", "exact") for j in range(4)}
                self.assertEqual(self.relations(process), expected)
                self.assertEqual(self.uses(process), self.atoms(a, 4) | self.atoms(b, 3))

    def test_control_role_partial_and_full_coverage_are_distinct(self):
        for mode, design in modes("expr_boundaries.sv", ("expr_summary",)):
            sel = design.ref("sel", ("expr_summary",))
            for name, complete in (("partial_control", False), ("full_control", True)):
                with self.subTest(mode=mode, output=name):
                    process = self.process(design, name)
                    self.assertEqual(process["expr"]["width"], 4)
                    targets = range(4) if complete else (0,)
                    expected = {(i, sel, 0, "control", "exact") for i in targets}
                    uses = self.atoms(sel, 1, "exact" if complete else "conservative", "control")
                    if complete:
                        for n in ("a", "b"):
                            ref = design.ref(n, ("expr_summary",))
                            expected |= {(i, ref, j, "data", "exact") for i in targets for j in range(4)}
                            uses |= self.atoms(ref, 4, "exact")
                    self.assertEqual(self.relations(process), expected)
                    self.assertEqual(self.uses(process), uses)

    def test_arithmetic_shift_signedness_and_large_counts_have_handwritten_deps(self):
        expected = {"signed_one": ("s", (1, 2, 3, 3)),
                    "unsigned_one": ("u", (1, 2, 3, None)),
                    "signed_large": ("s", (3, 3, 3, 3)),
                    "unsigned_large": ("u", (None,) * 4),
                    "logical_right": ("s", (1, 2, 3, None)),
                    "arithmetic_left": ("s", (None, 0, 1, 2))}
        for mode, design in modes("expr_boundaries.sv", ("shift_contract",)):
            for name, (source, bits) in expected.items():
                with self.subTest(mode=mode, output=name):
                    process = self.process(design, name, "shift_contract")
                    self.assertEqual(process["expr"]["width"], 4)
                    ref = design.ref(source, ("shift_contract",))
                    self.assertEqual(self.relations(process),
                                     {(i, ref, bit, "data", "exact") for i, bit in enumerate(bits) if bit is not None})

    def test_shift_uses_context_width_and_cast_not_signal_declaration_alone(self):
        for mode, design in modes("expr_boundaries.sv", ("shift_contract",)):
            for name, bits in (("context_signed", (1, 2, 3, 3, 3, 3)),
                               ("context_unsigned", (1, 2, 3, None, None, None))):
                with self.subTest(mode=mode, output=name):
                    process = self.process(design, name, "shift_contract")
                    self.assertEqual(process["expr"]["width"], 6)
                    ref = design.ref("s", ("shift_contract",))
                    self.assertEqual(self.relations(process),
                                     {(i, ref, bit, "data", "exact") for i, bit in enumerate(bits) if bit is not None})

    def test_fixture_legality_and_checker_controls(self):
        import os
        import subprocess
        for top in ("expr_summary", "shift_contract", "loop_blackbox"):
            for mode, design in modes("expr_boundaries.sv", (top,)):
                with self.subTest(mode=mode, top=top):
                    self.assertEqual(design.call("diags")["errorCount"], 0)
                    self.assertEqual([i["name"] for i in design.call("roots")], [top])
                    checked = subprocess.run([os.environ["HIER_BIN"], "verify-facts", *design.args],
                                             capture_output=True, text=True, timeout=40)
                    self.assertEqual(checked.returncode, 0, checked.stdout + checked.stderr)
                    self.assertIn("mismatched=0", checked.stdout)
