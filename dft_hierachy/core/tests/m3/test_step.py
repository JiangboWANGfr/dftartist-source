from m3cli import Contract, bitrange, modes


class Steps(Contract):
    def relations(self, reply):
        result = self.complete(reply)
        relations = []
        for hop in result["hops"]:
            self.assertTrue(hop["fact"])
            self.assertLessEqual(len(hop["next"]), 1)
            maps = []
            for continuation in hop["next"]:
                self.assertIn("from", continuation)
                self.assertIn(continuation["align"], ("bitwise", "all"))
                if continuation["align"] == "all":
                    self.assertEqual(continuation["map"], [])
                else:
                    maps += continuation["map"]
                relations.append((hop, continuation))
            if hop["next"]:
                self.assertEqual(hop["map"], maps)
        self.assertEqual(result["hasConservative"],
                         any(c["precision"] == "conservative" for _, c in relations))
        return relations

    def test_backward_bitwise_maps_use_absolute_queried_coordinates(self):
        for mode, d in modes():
            with self.subTest(mode=mode):
                got = self.relations(d.step("gate", lsb=2, width=2))
                self.assertEqual({c["slice"]["ref"] for _, c in got}, {d.ref("a"), d.ref("b")})
                self.assertEqual(len(got), 2)
                for h, c in got:
                    self.assertEqual(h["kind"], "process")
                    self.assertEqual(c["from"], bitrange(2, 2))
                    self.assertEqual(c["slice"]["bits"], bitrange(2, 2))
                    self.assertEqual((c["role"], c["precision"], c["align"]), ("data", "exact", "bitwise"))
                    self.assertEqual(c["map"], [{"from": 2, "to": 2, "width": 2}])

    def test_mux_control_is_exact_all_not_matching_same_bit(self):
        for mode, d in modes():
            with self.subTest(mode=mode):
                got = self.relations(d.step("choice", lsb=3))
                control = [c for _, c in got if c["role"] == "control"]
                self.assertEqual(len(control), 1)
                self.assertEqual(control[0]["slice"], {"ref": d.ref("sel"), "bits": bitrange()})
                self.assertEqual((control[0]["from"], control[0]["align"], control[0]["precision"]),
                                 (bitrange(3), "all", "exact"))
                self.assertEqual(control[0]["map"], [])

    def test_concat_selects_correct_operand_at_each_end(self):
        for mode, d in modes():
            for output, name, source in ((0, "b", 0), (1, "b", 1), (2, "a", 0), (3, "a", 1)):
                with self.subTest(mode=mode, bit=output):
                    got = self.relations(d.step("joined", lsb=output))
                    self.assertEqual(len(got), 1)
                    c = got[0][1]
                    self.assertEqual(c["slice"], {"ref": d.ref(name), "bits": bitrange(source)})
                    self.assertEqual(c["map"], [{"from": output, "to": source, "width": 1}])

    def test_fact_identity_is_independent_of_clip_and_direction(self):
        for mode, d in modes("flow.sv", ("bit_paths",)):
            with self.subTest(mode=mode):
                back = self.relations(d.step("b", "bit_paths", lsb=0))[0][0]
                clip = self.relations(d.step("b", "bit_paths", lsb=1))[0][0]
                forward = self.relations(d.step("a", "bit_paths", "forward", lsb=0))[0]
                self.assertEqual(back["fact"], clip["fact"])
                self.assertEqual(back["fact"], forward[0]["fact"])
                self.assertEqual(forward[1]["map"], [{"from": 0, "to": 0, "width": 1}])

    def test_register_kind_and_all_event_roles_in_both_directions(self):
        for mode, d in modes("flow.sv", ("feedback",)):
            with self.subTest(mode=mode):
                got = self.relations(d.step("q", "feedback"))
                self.assertEqual({c["role"] for _, c in got}, {"data", "control", "clock", "async"})
                self.assertTrue(all(h["kind"] == "register" for h, _ in got))
                read = self.relations(d.step("clk", "feedback", "forward"))
                regs = [(h, c) for h, c in read if h["kind"] == "register"]
                self.assertEqual(len(regs), 1)
                self.assertEqual(regs[0][1]["role"], "clock")
                self.assertEqual(regs[0][0]["via"], got[0][0]["via"])

    def test_unknown_direction_candidate_has_explicit_reason(self):
        for mode, d in modes("flow.sv", ("box_boundary",)):
            for command in ("drivers", "loads"):
                with self.subTest(mode=mode, command=command):
                    result = self.partial(d.call(command, d.ref("a", ("box_boundary",)),
                                                 "--reach", "local"), "blackbox")
                    pins = [e for e in result if e["kind"] == "blackbox_pin"]
                    self.assertEqual(len(pins), 1)
                    self.assertEqual(pins[0]["reason"], "blackbox")
            for direction in ("back", "forward"):
                with self.subTest(mode=mode, direction=direction):
                    result = self.partial(d.step("a", "box_boundary", direction), "blackbox")
                    unknown = [h for h in result["hops"] if h.get("reason") == "blackbox"]
                    self.assertEqual(len(unknown), 1)
                    self.assertEqual((unknown[0]["kind"], unknown[0]["next"]), ("unresolved", []))
                    self.assertFalse(any(h["kind"] == "blackbox_pin" for h in result["hops"]))

    def test_unknown_width_is_not_a_fabricated_one_bit_or_unconnected(self):
        for mode, d in modes("flow.sv", ("box_boundary",)):
            with self.subTest(mode=mode):
                box = d.inst(("box_boundary", "box"))
                empty = next(p["ref"] for p in d.call("ports", box) if p["name"] == "EMPTY")
                reply = d.call("step", empty, "--side", "outside", "--dir", "back")
                result = self.partial(reply, "unknown_pin_width", empty)
                self.assertTrue(result["hops"])
                for h in result["hops"]:
                    self.assertEqual((h["kind"], h["reason"], h["map"], h["next"]),
                                     ("unresolved", "unknown_pin_width", [], []))
                    self.assertNotIn("at", h)

    def test_wide_identity_uses_one_interval_map(self):
        for mode, d in modes("flow.sv", ("wide_bus",)):
            with self.subTest(mode=mode):
                got = self.relations(d.step("y", "wide_bus", width=1048576))
                self.assertEqual(len(got), 1)
                self.assertEqual(got[0][1]["map"], [{"from": 0, "to": 0, "width": 1048576}])
