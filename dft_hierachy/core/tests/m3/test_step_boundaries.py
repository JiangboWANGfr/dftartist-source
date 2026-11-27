from m3cli import Contract, modes

class StepBoundaries(Contract):
    def test_unknown_width_priority_inside_outside_both_directions(self):
        for mode, d in modes("flow.sv", ("box_boundary",)):
            empty = d.ref("EMPTY", ("box_boundary", "box"), port=True)
            for side in ("inside", "outside"):
                for direction in ("back", "forward"):
                    with self.subTest(mode=mode, side=side, direction=direction):
                        reply = d.call("step", empty, "--side", side, "--dir", direction)
                        result = self.partial(reply, "unknown_pin_width", empty)
                        self.assertTrue(result["hops"])
                        for h in result["hops"]:
                            self.assertEqual((h["kind"], h["reason"], h["next"], h["map"]),
                                             ("unresolved", "unknown_pin_width", [], []))
                            self.assertNotIn("at", h)

    def test_streaming_unknown_data_has_possible_driver_and_predecessor(self):
        for mode, d in modes("step_boundaries.sv", ("b_boundary_unknown",)):
            data = d.ref("data", ("b_boundary_unknown",))
            pin = d.ref("P", ("b_boundary_unknown", "box"), port=True)
            for lsb, width in ((0, 4), (1, 2)):
                for command in ("step", "drivers"):
                    with self.subTest(mode=mode, command=command, lsb=lsb):
                        options = ("--dir", "back") if command == "step" else ("--reach", "local")
                        r = d.call(command, data, *options, "--lsb", lsb, "--width", width)
                        result = self.partial(r, "blackbox", pin)
                        self.assertTrue(result["hops"] if command == "step" else result)

    def test_declared_streaming_directions_are_legal_controls(self):
        for top in ("b_boundary_out", "b_boundary_in"):
            for mode, d in modes("step_boundaries.sv", (top,)):
                with self.subTest(mode=mode, top=top):
                    self.assertEqual(d.call("diags")["errorCount"], 0)
                    data = d.ref("data", (top,))
                    for command in ("step", "drivers"):
                        options = ("--dir", "back") if command == "step" else ("--reach", "local")
                        r = d.call(command, data, *options)
                        values = r["result"]["hops"] if command == "step" else r["result"]
                        if top == "b_boundary_in":
                            self.assertEqual(values, [])
                            self.assertEqual(r["completeness"]["status"], "complete")
                        else:
                            self.assertFalse(not values and r["completeness"]["status"] == "complete")
