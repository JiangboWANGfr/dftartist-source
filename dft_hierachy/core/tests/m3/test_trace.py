from m3cli import Contract, bitrange, modes


def paths(d, source, target, top="bit_paths", source_bit=0, target_bit=0, **budget):
    args = ["paths", d.ref(source, (top,)), d.ref(target, (top,)),
            "--from-lsb", source_bit, "--from-width", 1,
            "--to-lsb", target_bit, "--to-width", 1]
    for key, value in budget.items():
        args += ["--" + key.replace("_", "-"), value]
    return d.call(*args)


def reachable_bits(graph, source, bit):
    """Independent finite relation composition for <=4-bit KATs only.

    This does not compute expected results from the product. It checks whether the
    returned graph actually witnesses the hand-written source/target relation.
    Production wide-bus work must remain intervals, not this tiny test checker.
    """
    by_id = {n["id"]: n for n in graph["nodes"]}
    pending = []
    for n in graph["nodes"]:
        p = n.get("point", {}).get("slice", {})
        bounds = p.get("bits", {"lsb": 0, "width": 0})
        if p.get("ref") == source and bounds["lsb"] <= bit < bounds["lsb"] + bounds["width"]:
            pending.append((n["id"], bit))
    seen = set()
    while pending:
        current = pending.pop()
        if current in seen:
            continue
        seen.add(current)
        node, position = current
        for edge in graph["edges"]:
            if edge["from"] != node or edge["kind"] == "boundary":
                continue
            f, t = edge["fromBits"], edge["toBits"]
            if not f["lsb"] <= position < f["lsb"] + f["width"]:
                continue
            if edge["align"] == "all":
                next_bits = range(t["lsb"], t["lsb"] + t["width"])
            else:
                next_bits = [m["to"] + position - m["from"] for m in edge["map"]
                             if m["from"] <= position < m["from"] + m["width"]]
            pending.extend((edge["to"], next_bit) for next_bit in next_bits)
    return {(by_id[node]["point"]["slice"]["ref"], bit) for node, bit in seen
            if "point" in by_id[node]}


class Traces(Contract):
    def test_primitive_cone_strategy_and_semantic_frontier_are_distinct(self):
        for mode, d in modes("flow.sv", ("primitive_path",)):
            for policy in ("structural", "combinational", "full"):
                with self.subTest(mode=mode, policy=policy):
                    reply = d.cone("a", "primitive_path", direction="forward", policy=policy)
                    graph = self.graph(reply)
                    pins = [n for n in graph["nodes"] if n["kind"] == "primitive_pin"]
                    self.assertEqual(len(pins), 1)
                    if policy == "structural":
                        self.complete(reply)
                        self.assertEqual(graph["frontier"], [])
                    else:
                        self.partial(reply, "unsupported", pins[0]["ref"])
                        self.assertEqual(pins[0]["reason"], "unsupported")
                        self.assertEqual(len(graph["frontier"]), 1)
                        frontier = graph["frontier"][0]
                        self.assertEqual(frontier["point"], pins[0]["point"])
                        self.assertEqual(frontier["reason"], "unsupported")
                        self.assertNotIn("stepCursor", frontier)

    def test_paths_distinguishes_primitive_true_disconnection_and_unknown_blackbox(self):
        for top, reason in (("primitive_path", "unsupported"), ("no_path", None),
                            ("box_boundary", "blackbox")):
            for mode, d in modes("flow.sv", (top,)):
                with self.subTest(mode=mode, top=top):
                    reply = paths(d, "a", "y", top)
                    graph = self.graph(reply)
                    self.assertEqual((graph["nodes"], graph["edges"]), ([], []))
                    if reason is None:
                        self.complete(reply)
                        self.assertEqual(graph["frontier"], [])
                    else:
                        self.partial(reply, reason)
                        self.assertTrue(graph["frontier"])
                        self.assertTrue(any(f["reason"] == reason for f in graph["frontier"]))
                        for f in graph["frontier"]:
                            if f["reason"] == reason:
                                self.assertEqual(f["point"]["slice"]["bits"], bitrange())
                                self.assertEqual(f["point"]["side"], "outside")
                                self.partial(reply, reason, f["point"]["slice"]["ref"])
                                self.assertNotIn("stepCursor", f)

    def test_primitive_pin_target_hit_does_not_require_internal_semantics(self):
        for mode, d in modes("flow.sv", ("primitive_path",)):
            with self.subTest(mode=mode):
                gate = d.inst(("primitive_path", "gate"))
                ports = d.call("ports", gate)
                inputs = [p for p in ports if p["direction"] == "in"]
                self.assertEqual(len(inputs), 1)
                reply = d.call("paths", d.ref("a", ("primitive_path",)), inputs[0]["ref"],
                               "--to-side", "outside")
                self.complete(reply)
                graph = self.graph(reply)
                self.assertTrue(graph["nodes"])
                self.assertEqual(graph["frontier"], [])

    def test_combinational_cycle_keeps_two_real_edges_and_terminates(self):
        for mode, d in modes("flow.sv", ("combination_loop",)):
            with self.subTest(mode=mode):
                reply = d.cone("a", "combination_loop")
                self.complete(reply)
                graph = self.graph(reply)
                self.assertEqual((len(graph["nodes"]), len(graph["edges"])), (2, 2))
                self.assertEqual(graph["frontier"], [])
                self.assertEqual(self.graph_refs(graph),
                                 {d.ref("a", ("combination_loop",)), d.ref("b", ("combination_loop",))})

    def test_structural_stops_at_process_not_an_input_dependency(self):
        for mode, d in modes():
            with self.subTest(mode=mode):
                reply = d.cone("gate", policy="structural")
                self.complete(reply)
                graph = self.graph(reply)
                self.assertTrue(any(n["kind"] == "process" for n in graph["nodes"]))
                self.assertFalse({d.ref("a"), d.ref("b")} & self.graph_refs(graph))
                self.assertTrue(graph["edges"])
                self.assertTrue(all(e["kind"] == "boundary" for e in graph["edges"]))
                self.assertEqual(graph["frontier"], [])

    def test_combinational_preserves_mux_data_and_control(self):
        for mode, d in modes():
            with self.subTest(mode=mode):
                reply = d.cone("choice")
                self.complete(reply)
                graph = self.graph(reply)
                self.assertTrue({d.ref("a"), d.ref("b"), d.ref("sel")} <= self.graph_refs(graph))
                self.assertEqual({e["role"] for e in graph["edges"] if e["kind"] == "dependency"},
                                 {"data", "control"})
                self.assertFalse(graph["hasConservative"])

    def test_arithmetic_is_complete_but_conservative(self):
        for mode, d in modes():
            with self.subTest(mode=mode):
                reply = d.cone("total")
                self.complete(reply)
                graph = self.graph(reply)
                self.assertTrue(graph["hasConservative"])
                deps = [e for e in graph["edges"] if e["kind"] == "dependency"]
                self.assertEqual(len(deps), 2)
                self.assertTrue(all(e["precision"] == "conservative" and e["align"] == "all" for e in deps))

    def test_register_boundary_and_full_feedback_keep_events(self):
        for mode, d in modes("flow.sv", ("feedback",)):
            for policy in ("structural", "combinational", "full"):
                with self.subTest(mode=mode, policy=policy):
                    reply = d.cone("q", "feedback", policy=policy)
                    self.complete(reply)
                    graph = self.graph(reply)
                    self.assertEqual(graph["frontier"], [])
                    if policy == "full":
                        self.assertTrue({d.ref("d", ("feedback",)), d.ref("clk", ("feedback",)),
                                         d.ref("rst_n", ("feedback",))} <= self.graph_refs(graph))
                        self.assertTrue({"clock", "async", "control", "data"} <=
                                        {e["role"] for e in graph["edges"]})
                        self.assertLess(len(graph["edges"]), 30)  # finite KAT, not a runtime SLA
                    else:
                        self.assertTrue(any(n["kind"] == "register" for n in graph["nodes"]))
                        self.assertNotIn(d.ref("clk", ("feedback",)), self.graph_refs(graph))

    def test_depth_zero_returns_unexplored_origin_frontier(self):
        for mode, d in modes("flow.sv", ("bit_paths",)):
            with self.subTest(mode=mode):
                reply = d.cone("a", "bit_paths", direction="forward", max_depth=0)
                graph = self.graph(reply)
                self.partial(reply, "budget_depth")
                self.assertEqual((len(graph["nodes"]), graph["edges"]), (1, []))
                self.assertEqual(len(graph["frontier"]), 1)
                f = graph["frontier"][0]
                self.assertEqual((f["depth"], f["reason"], f["point"]["slice"]["ref"]),
                                 (0, "budget_depth", d.ref("a", ("bit_paths",))))

    def test_exact_node_and_edge_limits_do_not_fake_a_truncation(self):
        for mode, d in modes("flow.sv", ("combination_loop",)):
            with self.subTest(mode=mode):
                reply = d.cone("a", "combination_loop", max_nodes=2, max_edges=2)
                graph = self.graph(reply)
                self.complete(reply)
                self.assertEqual((len(graph["nodes"]), len(graph["edges"]), graph["frontier"]), (2, 2, []))

    def test_one_short_node_and_zero_edge_budgets_report_unconsumed_work(self):
        for mode, d in modes("flow.sv", ("combination_loop",)):
            for budget, reason in (({"max_nodes": 1}, "budget_nodes"), ({"max_edges": 0}, "budget_edges")):
                with self.subTest(mode=mode, budget=budget):
                    reply = d.cone("a", "combination_loop", **budget)
                    graph = self.graph(reply)
                    self.partial(reply, reason)
                    self.assertEqual(len(graph["nodes"]), 1)
                    self.assertEqual(graph["edges"], [])
                    self.assertTrue(graph["frontier"])
                    self.assertEqual(graph["frontier"][0]["point"]["slice"]["ref"],
                                     d.ref("a", ("combination_loop",)))

    def test_paths_composes_bit_relations_not_bus_name_reachability(self):
        for mode, d in modes("flow.sv", ("bit_paths",)):
            for bit, found in ((0, False), (1, True)):
                with self.subTest(mode=mode, target_bit=bit):
                    reply = paths(d, "a", "c", target_bit=bit)
                    self.complete(reply)
                    graph = self.graph(reply)
                    if found:
                        self.assertIn((d.ref("c", ("bit_paths",)), bit),
                                      reachable_bits(graph, d.ref("a", ("bit_paths",)), 0))
                    else:
                        self.assertEqual((graph["nodes"], graph["edges"], graph["frontier"]), ([], [], []))

    def test_paths_zero_edge_hit_precedes_depth_zero(self):
        for mode, d in modes("flow.sv", ("bit_paths",)):
            with self.subTest(mode=mode):
                reply = paths(d, "a", "a", max_depth=0)
                self.complete(reply)
                graph = self.graph(reply)
                self.assertEqual((len(graph["nodes"]), graph["edges"], graph["frontier"]), (1, [], []))
                self.assertEqual(graph["nodes"][0]["point"]["slice"]["bits"], bitrange())

    def test_paths_empty_partial_is_not_a_no_route_proof(self):
        for mode, d in modes("flow.sv", ("bit_paths",)):
            with self.subTest(mode=mode):
                reply = paths(d, "a", "c", target_bit=1, max_nodes=1)
                self.partial(reply, "budget_nodes")
                graph = self.graph(reply)
                self.assertEqual((graph["nodes"], graph["edges"]), ([], []))
                self.assertTrue(graph["frontier"])

    def test_paths_all_relation_is_conservative_and_prunes_unrelated_inputs(self):
        for mode, d in modes():
            with self.subTest(mode=mode):
                reply = paths(d, "a", "total", "flow", target_bit=3)
                self.complete(reply)
                graph = self.graph(reply)
                self.assertTrue(graph["hasConservative"])
                self.assertNotIn(d.ref("b"), self.graph_refs(graph))
                self.assertIn((d.ref("total"), 3), reachable_bits(graph, d.ref("a"), 0))

    def test_paths_restores_requested_inside_and_outside_port_anchors(self):
        for mode, d in modes("flow.sv", ("hierarchy",)):
            for side in ("inside", "outside"):
                with self.subTest(mode=mode, side=side):
                    a = d.ref("a", ("hierarchy",))
                    port = d.ref("d", ("hierarchy", "first"), port=True)
                    reply = d.call("paths", a, port, "--to-side", side,
                                   "--from-lsb", 0, "--from-width", 1,
                                   "--to-lsb", 0, "--to-width", 1)
                    self.complete(reply)
                    graph = self.graph(reply)
                    self.assertTrue(any(n.get("point", {}).get("slice", {}).get("ref") == port and
                                        n["point"].get("side") == side for n in graph["nodes"]))
                    self.assertTrue(any(e["kind"] == "binding" for e in graph["edges"]))

    def test_multi_driver_facts_are_not_merged_by_equal_endpoint_labels(self):
        for mode, d in modes("flow.sv", ("multiple",)):
            with self.subTest(mode=mode):
                reply = d.cone("y", "multiple")
                self.complete(reply)
                graph = self.graph(reply)
                deps = [e for e in graph["edges"] if e["kind"] == "dependency"]
                self.assertEqual(len(deps), 2)
                self.assertEqual(len({e["fact"] for e in deps}), 2)
                self.assertEqual(len({e["via"] for e in deps}), 2)

    def test_external_actual_target_and_interface_reasons_survive_strategy_stop(self):
        for mode, d in modes("flow.sv", ("external_boundary",)):
            with self.subTest(mode=mode):
                target = d.ref("s", ("external_boundary", "second"))
                reply = d.call("cone", target, "--dir", "forward", "--policy", "structural")
                self.partial(reply, "hier_ref", target)
                graph = self.graph(reply)
                self.assertTrue(any(f["reason"] == "hier_ref" for f in graph["frontier"]))
                untouched = d.ref("s", ("external_boundary", "first"))
                self.complete(d.call("cone", untouched, "--dir", "forward", "--policy", "structural"))
        for mode, d in modes("flow.sv", ("interface_boundary",)):
            with self.subTest(mode=mode, boundary="interface"):
                signal = d.ref("s", ("interface_boundary", "bus"))
                reply = d.call("cone", signal, "--dir", "back", "--policy", "structural")
                self.partial(reply, "interface_port", signal)
                self.graph(reply)
