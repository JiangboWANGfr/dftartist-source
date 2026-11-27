from m3cli import Contract, modes


class Lookup(Contract):
    def test_multi_top_omission_returns_all_candidates_in_reference_order(self):
        for mode, d in modes("lookup.sv", ("alpha", "beta")):
            with self.subTest(mode=mode):
                want = [d.inst((top, "u_extra")) for top in ("alpha", "beta")]
                self.assertEqual(self.complete(d.call("resolve-path", "u_extra")), want)
                self.assertEqual(self.complete(d.call("resolve-path", "/beta/u_extra")), want[1:])

    def test_escaped_names_and_instance_array_are_distinct(self):
        for mode, d in modes("lookup.sv", ("alpha", "beta")):
            for text, parts in ((r"alpha.\a.b ", ("alpha", "a.b")),
                                ("alpha/\\slash/name ", ("alpha", "slash/name")),
                                ("alpha.\\u[3] ", ("alpha", "u[3]")),
                                ("alpha.u[3]", ("alpha", "u[3]"))):
                with self.subTest(mode=mode, text=text):
                    # Escaped u[3] and real array u[3] have identical display path
                    # segments in M1; select by declaration/child order, not labels.
                    children = d.call("children", d.inst(("alpha",)), "--limit", 1000)["items"]
                    if parts[-1] == "u[3]":
                        matches = [i["ref"] for i in children if i["path"] == list(parts)]
                        self.assertEqual(len(matches), 2)
                        expected = matches[1:] if "\\" in text else matches[:1]
                    else:
                        expected = [d.inst(parts)]
                    self.assertEqual(self.complete(d.call("resolve-path", text)), expected)

    def test_generate_signed_subscript_mixed_separator_and_scope_not_an_object(self):
        for mode, d in modes("lookup.sv", ("alpha", "beta")):
            with self.subTest(mode=mode):
                ref = d.inst(("alpha", "g[-1]", "child"))
                self.assertEqual(self.complete(d.call("resolve-path", " alpha / g[-1] . child ")), [ref])
                self.assertEqual(self.complete(d.call("resolve-path", "alpha.g[-1]")), [])
                self.assertEqual(self.complete(d.call("resolve-path", "alpha.a.b")), [])
                self.assertEqual(self.complete(d.call("resolve-path", "nothing.u_extra")), [])

    def test_same_name_port_and_signal_return_both_not_a_preferred_object(self):
        for mode, d in modes("lookup.sv", ("alpha", "beta")):
            with self.subTest(mode=mode):
                inst = ("beta", "u_extra")
                self.assertEqual(self.complete(d.call("resolve-path", "beta.u_extra.q")),
                                 [d.ref("q", inst, port=True), d.ref("q", inst)])

    def test_search_six_kinds_and_occurrences_have_handwritten_counts(self):
        for mode, d in modes("lookup.sv", ("alpha", "beta")):
            with self.subTest(mode=mode):
                hits = self.complete(d.call("search", "", "--limit", 100000))["items"]
                self.assertEqual(len({h["ref"] for h in hits}), len(hits))
                counts = {kind: sum(h["kind"] == kind for h in hits)
                          for kind in ("definition", "instance", "port", "signal", "process", "register")}
                # 11 path_leaf occurrences, 2 tops; leaf:3 ports/4 signals/2 processes/1 register.
                self.assertEqual(counts, {"definition": 4, "instance": 13, "port": 37,
                                          "signal": 49, "process": 22, "register": 11})
                for h in hits:
                    if h["kind"] == "definition":
                        self.assertEqual(h["path"], [h["name"]])
                        self.assertEqual(h["def"], h["ref"])
                        self.assertNotIn("inst", h)
                    else:
                        self.assertIn("inst", h)
                        self.assertIn("def", h)

    def test_scope_does_not_capture_prefix_siblings_and_duplicate_filters_do_not_duplicate_hits(self):
        for mode, d in modes("lookup.sv", ("alpha", "beta")):
            with self.subTest(mode=mode):
                scope = d.inst(("alpha", "u_extra"))
                hits = self.complete(d.call("search", "", "--scope", scope, "--kind", "instance",
                                            "--kind", "instance"))["items"]
                self.assertEqual([h["ref"] for h in hits], [scope])
                defs = self.complete(d.call("search", "", "--scope", scope, "--kind", "definition"))["items"]
                self.assertEqual([h["name"] for h in defs], ["path_leaf"])

    def test_search_is_literal_case_sensitive_and_does_not_trim_text(self):
        for mode, d in modes("lookup.sv", ("alpha", "beta")):
            for text, count in (("u_extra", 2), ("U_EXTRA", 0), ("u_*", 0), (" u_extra", 0),
                                ("path_leaf", 11)):
                with self.subTest(mode=mode, text=text):
                    hits = self.complete(d.call("search", text, "--kind", "instance", "--limit", 100000))["items"]
                    self.assertEqual(len(hits), count)

    def test_numeric_instance_order_places_two_before_ten(self):
        for mode, d in modes("flow.sv", ("fanout",)):
            with self.subTest(mode=mode):
                hits = self.complete(d.call("search", "", "--kind", "instance", "--limit", 1000))["items"]
                self.assertEqual([h["path"] for h in hits],
                                 [["fanout"]] + [["fanout", f"g[{k}]", "u"] for k in range(12)])

    def test_definition_instances_preserve_all_shared_occurrences_and_unused_definition(self):
        for mode, d in modes("lookup.sv", ("alpha", "beta")):
            with self.subTest(mode=mode):
                defs = {v["name"]: v["ref"] for v in d.call("defs", "--limit", 1000)["items"]}
                leaf = self.complete(d.call("def-instances", defs["path_leaf"], "--limit", 1000))["items"]
                expected = [i["ref"] for i in d.instances() if i["defName"] == "path_leaf"]
                self.assertEqual({i["ref"] for i in leaf}, set(expected))
                self.assertEqual(len(leaf), 11)
                self.assertEqual(self.complete(d.call("def-instances", defs["path_unused"]))["items"], [])
