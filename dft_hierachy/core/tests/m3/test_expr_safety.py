from m3cli import Contract, bitrange, modes


class ExpressionSafety(Contract):
    def mapped_bits(self, process, target):
        result = {}
        for write in process["writes"]:
            if write["target"]["ref"] != target:
                continue
            mapping = write["exprMap"]
            self.assertEqual(mapping["status"], "mapped")
            self.assertEqual(mapping["segments"], sorted(mapping["segments"], key=lambda m: (m["to"], m["from"])))
            covered = set()
            for segment in mapping["segments"]:
                self.assertGreater(segment["width"], 0)
                self.assertGreaterEqual(segment["from"], 0)
                self.assertLessEqual(segment["from"] + segment["width"], process["expr"]["width"])
                for offset in range(segment["width"]):
                    bit = segment["to"] + offset
                    self.assertNotIn(bit, result)
                    result[bit] = segment["from"] + offset
                    covered.add(bit)
            bounds = write["target"]["bits"]
            self.assertEqual(covered, set(range(bounds["lsb"], bounds["lsb"] + bounds["width"])))
        self.assertTrue(result)
        return result

    def stream_mapping(self, reply, targets):
        process = reply["result"]
        self.assertTrue(process["writes"])
        actual_targets = {w["target"]["ref"] for w in process["writes"]}
        self.assertEqual(actual_targets, set(targets))
        unresolved = False
        for target, expected in targets.items():
            writes = [w for w in process["writes"] if w["target"]["ref"] == target]
            written = set()
            for write in writes:
                bounds = write["target"]["bits"]
                self.assertGreater(bounds["width"], 0)
                for bit in range(bounds["lsb"], bounds["lsb"] + bounds["width"]):
                    self.assertNotIn(bit, written)
                    written.add(bit)
            self.assertEqual(written, set(expected))
            statuses = {w["exprMap"]["status"] for w in writes}
            self.assertTrue(statuses <= {"mapped", "unresolved"})
            for write in writes:
                if write["exprMap"]["status"] == "unresolved":
                    unresolved = True
                    self.assertEqual(write["exprMap"], {"status": "unresolved", "reason": "unsupported"})
                else:
                    # Check even known pieces in a partially unresolved target.
                    projected = self.mapped_bits({**process, "writes": [write]}, target)
                    for bit, source in projected.items():
                        self.assertIn(bit, expected)
                        self.assertEqual(source, expected[bit])
            if statuses == {"mapped"}:
                self.assertEqual(self.mapped_bits(process, target), expected)
        if unresolved:
            self.partial(reply, "unsupported", process["ref"])
        else:
            self.complete(reply)

    def test_inputs_are_legal_in_both_modes(self):
        for top in ("stream_left", "stream_chunks", "stream_right", "signed_result", "map_context"):
            for mode, d in modes("expr_safety.sv", (top,)):
                with self.subTest(top=top, mode=mode):
                    self.assertEqual(d.call("diags")["errorCount"], 0)
                    self.assertEqual([i["name"] for i in d.call("roots")], [top])

    def test_streaming_left_is_exact_bit_reverse_or_explicit_unresolved(self):
        for mode, d in modes("expr_safety.sv", ("stream_left",)):
            with self.subTest(mode=mode):
                reply = d.process_for("y", ("stream_left",))
                process = reply["result"]
                expr = process["expr"]
                self.assertEqual((expr["op"], expr["width"], expr["signed"]), ("ref", 8, False))
                self.assertEqual(expr["slice"], {"ref": d.ref("a", ("stream_left",)), "bits": bitrange(0, 8)})
                y = d.ref("y", ("stream_left",))
                self.stream_mapping(reply, {y: {i: 7-i for i in range(8)}})

    def test_streaming_chunk_lvalue_never_guesses_sorted_write_order(self):
        for mode, d in modes("expr_safety.sv", ("stream_chunks",)):
            with self.subTest(mode=mode):
                reply = d.process_for("hi", ("stream_chunks",))
                process = reply["result"]
                self.assertEqual((process["expr"]["op"], process["expr"]["width"], process["expr"]["value"]),
                                 ("const", 4, "4'b1100"))
                self.assertTrue(all(w["deps"] == [] for w in process["writes"]))
                hi, lo = (d.ref(n, ("stream_chunks",)) for n in ("hi", "lo"))
                self.stream_mapping(reply, {hi: {0: 0, 1: 1}, lo: {0: 2, 1: 3}})

    def test_other_streaming_rhs_does_not_make_static_target_mapping_unresolved(self):
        for mode, d in modes("expr_safety.sv", ("stream_right",)):
            with self.subTest(mode=mode):
                process = self.complete(d.process_for("y", ("stream_right",)))
                expr = process["expr"]
                self.assertEqual((expr["op"], expr["width"], expr["signed"]), ("other", 8, False))
                self.assertTrue(expr["text"])
                a, y = (d.ref(n, ("stream_right",)) for n in ("a", "y"))
                self.assertEqual(expr["uses"], [{"signal": a, "bits": bitrange(0, 8), "role": "data",
                                                 "precision": "conservative", "align": "all"}])
                self.assertEqual(self.mapped_bits(process, y), {i: i for i in range(8)})

    def test_sign_extension_root_type_and_value_map_are_separate_from_deps(self):
        for mode, d in modes("expr_safety.sv", ("signed_result",)):
            with self.subTest(mode=mode):
                process = self.complete(d.process_for("y", ("signed_result",)))
                self.assertEqual((process["expr"]["op"], process["expr"]["width"], process["expr"]["signed"]),
                                 ("other", 6, True))
                self.assertEqual(self.mapped_bits(process, d.ref("y", ("signed_result",))), {i: i for i in range(6)})

    def test_initialized_slice_maps_root_zero_not_source_bit_three(self):
        for mode, d in modes("expr_safety.sv", ("map_context",)):
            with self.subTest(mode=mode):
                process = self.complete(d.process_for("initialized", ("map_context",)))
                expr = process["expr"]
                self.assertEqual((process["kind"], expr["op"], expr["width"]), ("init", "ref", 1))
                self.assertEqual(expr["slice"], {"ref": d.ref("a", ("map_context",)), "bits": bitrange(3, 1)})
                self.assertEqual(self.mapped_bits(process, d.ref("initialized", ("map_context",))), {0: 0})

    def test_nontrivial_input_and_output_extension_port_expressions_use_result_coordinates(self):
        for mode, d in modes("expr_safety.sv", ("map_context",)):
            with self.subTest(mode=mode):
                root = d.inst(("map_context",))
                processes = [self.complete(d.call("proc", p["ref"]))
                             for p in d.call("procs", root, "--limit", 1000)["items"] if p["kind"] == "port_expr"]
                self.assertEqual(len(processes), 2)
                for target, width, op in ((d.ref("d", ("map_context", "u"), port=True), 4, "not"),
                                          (d.ref("y", ("map_context",)), 6, "other")):
                    matches = [p for p in processes if any(w["target"]["ref"] == target for w in p["writes"])]
                    self.assertEqual(len(matches), 1)
                    process = matches[0]
                    self.assertEqual((process["expr"]["op"], process["expr"]["width"]), (op, width))
                    self.assertEqual(self.mapped_bits(process, target), {i: i for i in range(width)})
                    if op == "not":
                        self.assertEqual(len(process["expr"]["args"]), 1)
                        concat = process["expr"]["args"][0]
                        self.assertEqual((concat["op"], concat["width"]), ("concat", 4))
                        self.assertEqual([arg["slice"]["bits"] for arg in concat["args"]],
                                         [bitrange(0, 2), bitrange(2, 2)])

    def test_streaming_rhs_keeps_conservative_dependency_and_independent_checker(self):
        import os
        import subprocess
        for mode, d in modes("expr_safety.sv", ("stream_right",)):
            with self.subTest(mode=mode, channel="facts"):
                process = self.complete(d.process_for("y", ("stream_right",)))
                a = d.ref("a", ("stream_right",))
                self.assertEqual(len(process["writes"]), 1)
                self.assertEqual(process["writes"][0]["deps"], [{"signal": a, "bits": bitrange(0, 8),
                                                                "role": "data", "precision": "conservative", "align": "all"}])
            with self.subTest(mode=mode, channel="independent_checker"):
                reply = subprocess.run([os.environ["HIER_BIN"], "verify-facts", *d.args],
                                       capture_output=True, text=True, timeout=40)
                self.assertEqual(reply.returncode, 0, reply.stdout + reply.stderr)
                self.assertIn("mismatched=0", reply.stdout)
