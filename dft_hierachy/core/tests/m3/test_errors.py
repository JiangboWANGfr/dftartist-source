from m3cli import Contract, modes


class Errors(Contract):
    def test_path_syntax_errors_are_not_empty_success(self):
        for mode, d in modes("lookup.sv", ("alpha", "beta")):
            self.complete(d.call("resolve-path", "alpha"))  # missing command must fail the control
            for text in ("", "alpha..u", "alpha/", "alpha.u[1:2]", "alpha.u[*]", "alpha.\\unfinished",
                         "alpha.u[bad]", "//alpha/u", "get_cells alpha.u"):
                with self.subTest(mode=mode, text=text):
                    self.error(d, "bad_request", "resolve-path", text)

    def test_search_rejects_bad_scope_kind_and_page_size_after_success_control(self):
        for mode, d in modes():
            self.complete(d.call("search", "gate", "--kind", "signal"))
            for args, code in ((("--kind", "not_a_kind"), "bad_request"),
                               (("--scope", d.ref("a")), "bad_request"),
                               (("--scope", "i:999999"), "not_found"),
                               (("--limit", 0), "bad_request"), (("--limit", -1), "bad_request")):
                with self.subTest(mode=mode, args=args):
                    self.error(d, code, "search", "", *args)

    def test_trace_validation_rejects_wrong_kinds_sides_slices_and_budgets(self):
        for mode, d in modes():
            self.complete(d.cone("gate"))
            base = ["cone", d.ref("a"), "--dir", "back", "--policy", "full"]
            for args in (("--max-nodes", 0), ("--max-edges", -1), ("--max-depth", -1),
                         ("--max-millis", 0), ("--max-nodes", "18446744073709551616"),
                         ("--lsb", 1), ("--lsb", 0, "--width", 0),
                         ("--lsb", 3, "--width", 2), ("--side", "inside")):
                with self.subTest(mode=mode, args=args):
                    self.error(d, "bad_request", *base, *args)
            port = d.ref("a", port=True)
            self.error(d, "bad_request", "cone", port, "--dir", "back", "--policy", "full")
            self.error(d, "bad_request", "cone", d.inst(("flow",)), "--dir", "back", "--policy", "full")
            self.error(d, "not_found", "cone", "s:999999:0", "--dir", "back", "--policy", "full")

    def test_paths_requires_paired_slices_and_valid_target(self):
        for mode, d in modes("flow.sv", ("bit_paths",)):
            a, b = d.ref("a", ("bit_paths",)), d.ref("b", ("bit_paths",))
            self.complete(d.call("paths", a, b))
            for args in (("--from-lsb", 0), ("--to-width", 1), ("--to-side", "outside"),
                         ("--to-lsb", 1, "--to-width", 2)):
                with self.subTest(mode=mode, args=args):
                    self.error(d, "bad_request", "paths", a, b, *args)

    def test_source_inapplicable_kinds_are_not_found_not_internal(self):
        for mode, d in modes("source.sv", ("source_top",)):
            top = d.inst(("source_top",))
            span = d.call("source", top, "--kind", "definition")
            self.error(d, "not_found", "source", top, "--kind", "instantiation")
            signal = d.ref("q", ("source_top",))
            self.error(d, "not_found", "source", signal, "--kind", "statement")
            self.assertTrue(span["file"])
            self.complete(d.call("resolve-source", span["file"], "--line", 2))
            for args in (("--line", 0), ("--line", 999999), ("--line", 2, "--col", 0),
                         ("--line", 2, "--col", 999999), ("--line", 2, "--limit", 0)):
                self.error(d, "bad_request", "resolve-source", span["file"], *args)
            self.error(d, "not_found", "resolve-source", "file:not_in_table", "--line", 1)
