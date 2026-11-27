"""B C56/C57 oracle: DESIGN 4.3/5.5.2/5.5.4, never A/C probe output."""
from m3cli import Contract, bitrange, modes


TOPS = ("b_trace_constant", "b_trace_expr", "b_trace_wire")


def reachable_side_bits(graph, source, source_side, bit):
    """Finite four-bit witness checker; ref equality never erases port side."""
    nodes = {n["id"]: n for n in graph["nodes"]}
    pending = []
    for node in graph["nodes"]:
        point = node.get("point", {})
        bounds = point.get("slice", {}).get("bits", bitrange(0, 0))
        if (point.get("slice", {}).get("ref") == source and point.get("side") == source_side
                and bounds["lsb"] <= bit < bounds["lsb"] + bounds["width"]):
            pending.append((node["id"], bit))
    seen = set()
    while pending:
        node, position = pending.pop()
        if (node, position) in seen:
            continue
        seen.add((node, position))
        for edge in graph["edges"]:
            if edge["from"] != node or edge["kind"] == "boundary":
                continue
            bounds = edge["fromBits"]
            if not bounds["lsb"] <= position < bounds["lsb"] + bounds["width"]:
                continue
            if edge["align"] == "all":
                target = edge["toBits"]
                next_bits = range(target["lsb"], target["lsb"] + target["width"])
            else:
                next_bits = [m["to"] + position - m["from"] for m in edge["map"]
                             if m["from"] <= position < m["from"] + m["width"]]
            pending.extend((edge["to"], b) for b in next_bits)
    return {(nodes[node]["point"]["slice"]["ref"], nodes[node]["point"].get("side"), b)
            for node, b in seen if "point" in nodes[node]}


def path(d, source, target, source_side=None, target_side=None, lsb=0, width=4, **budget):
    args = ["paths", source, target, "--from-lsb", lsb, "--from-width", width,
            "--to-lsb", lsb, "--to-width", width]
    if source_side:
        args += ["--from-side", source_side]
    if target_side:
        args += ["--to-side", target_side]
    for key, value in budget.items():
        args += ["--" + key.replace("_", "-"), value]
    return d.call(*args)


class TraceBoundaries(Contract):
    def test_outside_input_sources_reach_inside_signal_and_output_with_clipping(self):
        for top in TOPS:
            for mode, d in modes("trace_boundaries.sv", (top,)):
                self.assertEqual(d.call("diags")["errorCount"], 0)
                source = d.ref("d", (top, "leaf"), port=True)
                target_pin = d.ref("q", (top, "leaf"), port=True)
                target_signal = d.ref("d", (top, "leaf"))
                for lsb, width in ((0, 4), (1, 2)):
                    for target, side in ((source, "inside"), (target_signal, None), (target_pin, "outside")):
                        with self.subTest(top=top, mode=mode, lsb=lsb, target=target, side=side):
                            reply = path(d, source, target, "outside", side, lsb, width)
                            graph = self.graph(reply)
                            self.complete(reply)
                            self.assertTrue(graph["edges"], graph)
                            self.assertEqual(graph["frontier"], [])
                            self.assertTrue(any(n.get("point", {}).get("side") == "outside" and
                                                n["point"]["slice"]["ref"] == source for n in graph["nodes"]))
                            self.assertTrue(any(n.get("point", {}).get("side") == side and
                                                n["point"]["slice"]["ref"] == target for n in graph["nodes"]))
                            for bit in range(lsb, lsb + width):
                                self.assertIn((target, side, bit), reachable_side_bits(graph, source, "outside", bit))

    def test_inside_positive_and_same_side_zero_edge_controls(self):
        for top in TOPS:
            for mode, d in modes("trace_boundaries.sv", (top,)):
                source = d.ref("d", (top, "leaf"), port=True)
                target = d.ref("q", (top, "leaf"), port=True)
                for lsb, width in ((0, 4), (1, 2)):
                    with self.subTest(top=top, mode=mode, lsb=lsb):
                        inside = d.call("paths", source, target, "--from-side", "inside",
                                        "--to-side", "outside", "--from-lsb", lsb,
                                        "--from-width", width, "--to-lsb", lsb, "--to-width", width)
                        route = self.graph(inside)
                        self.complete(inside)
                        self.assertTrue(route["edges"])
                        same = path(d, source, source, "outside", "outside", lsb, width, max_depth=0)
                        graph = self.graph(same)
                        self.complete(same)
                        self.assertEqual((len(graph["nodes"]), graph["edges"], graph["frontier"]), (1, [], []))
                        self.assertEqual(graph["nodes"][0]["point"],
                                         {"slice": {"ref": source, "bits": bitrange(lsb, width)}, "side": "outside"})

    def test_source_anchor_work_obeys_node_and_edge_budgets(self):
        for top in TOPS:
            for mode, d in modes("trace_boundaries.sv", (top,)):
                source = d.ref("d", (top, "leaf"), port=True)
                target = d.ref("q", (top, "leaf"), port=True)
                for key, value, reason in (("max_nodes", 1, "budget_nodes"), ("max_edges", 0, "budget_edges")):
                    with self.subTest(top=top, mode=mode, key=key):
                        reply = path(d, source, target, "outside", "outside", 1, 2, **{key: value})
                        graph = self.graph(reply)
                        self.partial(reply, reason)
                        self.assertEqual(graph["edges"], [])
                        self.assertTrue(any(f["point"] == {"slice": {"ref": source, "bits": bitrange(1, 2)},
                                                           "side": "outside"} and f["reason"] == reason
                                            for f in graph["frontier"]), graph)

    def test_direct_primitive_and_unknown_pin_semantic_frontier_has_depth_zero(self):
        for top, reason in (("b_trace_primitive", "unsupported"), ("b_trace_unknown", "blackbox")):
            for mode, d in modes("trace_boundaries.sv", (top,)):
                child = d.call("children", d.call("roots")[0]["ref"])["items"][0]["ref"]
                ports = d.call("ports", child)
                pin = next(p["ref"] for p in ports if p["direction"] == "in") if top == "b_trace_primitive" else next(p["ref"] for p in ports if p["name"] == "A")
                for policy in ("combinational", "full"):
                    with self.subTest(top=top, mode=mode, policy=policy):
                        reply = d.call("cone", pin, "--side", "outside", "--dir", "forward", "--policy", policy)
                        graph = self.graph(reply)
                        self.partial(reply, reason, pin)
                        semantic = [f for f in graph["frontier"] if f["reason"] == reason and f["point"]["slice"]["ref"] == pin]
                        self.assertTrue(semantic)
                        for frontier in semantic:
                            self.assertEqual(frontier["depth"], 0)
                            self.assertEqual(frontier["point"], {"slice": {"ref": pin, "bits": bitrange()}, "side": "outside"})
                            self.assertNotIn("stepCursor", frontier)

    def test_real_binding_depth_one_structural_and_depth_zero_controls(self):
        for mode, d in modes("trace_boundaries.sv", ("b_trace_primitive",)):
            child = d.call("children", d.call("roots")[0]["ref"])["items"][0]["ref"]
            pin = next(p["ref"] for p in d.call("ports", child) if p["direction"] == "in")
            source = d.ref("a", ("b_trace_primitive",))
            with self.subTest(mode=mode):
                reached = d.call("cone", source, "--dir", "forward", "--policy", "full")
                graph = self.graph(reached)
                self.partial(reached, "unsupported", pin)
                matches = [f for f in graph["frontier"] if f["point"]["slice"]["ref"] == pin]
                self.assertTrue(matches)
                self.assertTrue(all(f["depth"] == 1 for f in matches))
                stopped = d.call("cone", pin, "--side", "outside", "--dir", "forward", "--policy", "structural")
                self.assertEqual(self.graph(stopped)["frontier"], [])
                self.complete(stopped)
                zero = d.call("cone", pin, "--side", "outside", "--dir", "forward", "--policy", "full", "--max-depth", 0)
                self.partial(zero, "budget_depth")
                self.assertTrue(self.graph(zero)["frontier"])
                self.assertTrue(all(f["depth"] == 0 for f in zero["result"]["frontier"]))
