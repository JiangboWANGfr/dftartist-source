from m3cli import Contract, modes


class Inputs(Contract):
    def test_all_handwritten_inputs_compile_in_both_modes(self):
        cases = [("flow.sv", (top,)) for top in (
            "flow", "bit_paths", "combination_loop", "feedback", "multiple", "hierarchy",
            "fanout", "box_boundary", "primitive_boundary", "external_boundary",
            "interface_boundary", "opaque_boundary", "wide_bus", "primitive_path",
            "expr_first", "expr_second", "expr_nested", "expr_shift", "no_path")]
        cases += [("lookup.sv", ("alpha", "beta")), ("source.sv", ("source_top",))]
        for fixture, tops in cases:
            for mode, d in modes(fixture, tops):
                with self.subTest(fixture=fixture, tops=tops, mode=mode):
                    self.assertEqual(d.call("diags")["errorCount"], 0)
                    self.assertEqual({i["name"] for i in d.call("roots")}, set(tops))

    def test_existing_fact_checker_controls_small_inputs(self):
        # Deliberately use raw subprocess output: verify-facts is documented text.
        import os
        import subprocess
        for fixture, tops in (("flow.sv", ("flow",)), ("lookup.sv", ("alpha", "beta")),
                              ("source.sv", ("source_top",))):
            for mode, d in modes(fixture, tops):
                with self.subTest(fixture=fixture, mode=mode):
                    p = subprocess.run([os.environ["HIER_BIN"], "verify-facts", *d.args],
                                       capture_output=True, text=True, timeout=40)
                    self.assertEqual(p.returncode, 0, p.stdout + p.stderr)
                    self.assertIn("mismatched=0", p.stdout)
