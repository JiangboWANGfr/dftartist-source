import hashlib
from m3cli import Contract, FIXTURES, modes


def position(data, offset):
    return {"offset": offset, "line": data[:offset].count(b"\n") + 1,
            "column": offset - data.rfind(b"\n", 0, offset)}


class Sources(Contract):
    def test_reverse_source_keeps_overlapping_definition_and_all_occurrences(self):
        data = (FIXTURES / "source_include.svh").read_bytes()
        at = position(data, data.index(b"assign q = from_macro;"))
        for mode, d in modes("source.sv", ("source_top",)):
            with self.subTest(mode=mode):
                process, span = self.statement(d)
                reply = d.call("resolve-source", span["file"], "--line", at["line"],
                               "--col", at["column"], "--limit", 1000)
                result = self.complete(reply)
                self.assertNotIn("next", result)
                hits = result["items"]
                refs = {h["ref"] for h in hits}
                for child in ("left", "right"):
                    self.assertIn(d.inst(("source_top", child)), refs)
                    self.assertIn(self.statement(d, ("source_top", child))[0], refs)
                self.assertIn(process, refs)
                self.assertTrue(any(h["kind"] == "definition" and "inst" not in h for h in hits))
                self.assertEqual(len(hits), 5)  # one DefRef + two instances + two assign processes
                self.assertEqual(len({(h["ref"], h["kind"], h["span"]["start"]["offset"],
                                       h["span"]["end"]["offset"]) for h in hits}), 5)

    def test_reverse_source_limit_one_is_complete_page_not_budget_partial(self):
        for mode, d in modes("source.sv", ("source_top",)):
            with self.subTest(mode=mode):
                _, span = self.statement(d)
                page = self.complete(d.call("resolve-source", span["file"], "--line", span["start"]["line"],
                                            "--col", span["start"]["column"], "--limit", 1))
                self.assertEqual(len(page["items"]), 1)
                self.assertTrue(page["next"])

    def test_reverse_source_line_query_contains_precise_column_hits(self):
        for mode, d in modes("source.sv", ("source_top",)):
            with self.subTest(mode=mode):
                process, span = self.statement(d)
                line = span["start"]["line"]
                precise = self.complete(d.call("resolve-source", span["file"], "--line", line,
                                               "--col", span["start"]["column"], "--limit", 1000))["items"]
                whole = self.complete(d.call("resolve-source", span["file"], "--line", line,
                                             "--limit", 1000))["items"]
                self.assertTrue({(h["ref"], h["kind"]) for h in precise} <=
                                {(h["ref"], h["kind"]) for h in whole})
                # The end position no longer contains this statement, even though
                # module definition spans still overlap it.
                ended = self.complete(d.call("resolve-source", span["file"], "--line", span["end"]["line"],
                                             "--col", span["end"]["column"], "--limit", 1000))["items"]
                self.assertFalse(any(h["ref"] == process and h["kind"] == "statement"
                                     for h in ended))

    def statement(self, d, path=("source_top", "left"), signal="q"):
        process = d.process_for(signal, path)["result"]["ref"]
        return process, d.call("source", process, "--kind", "statement")

    def test_utf8_byte_columns_tab_and_half_open_statement_range(self):
        data = (FIXTURES / "source_include.svh").read_bytes()
        token = b"assign q = from_macro;"
        start = data.index(token)
        for mode, d in modes("source.sv", ("source_top",)):
            with self.subTest(mode=mode):
                _, span = self.statement(d)
                self.assertEqual(span["start"], position(data, start))
                self.assertEqual(span["end"], position(data, start + len(token)))
                self.assertEqual(span["contentHash"], hashlib.sha256(data).hexdigest())
                self.assertEqual(span["path"], str((FIXTURES / "source_include.svh").resolve()))

    def test_macro_statement_uses_physical_invocation_not_virtual_buffer(self):
        data = (FIXTURES / "source_include.svh").read_bytes()
        token = b"`M3_WIRE(from_macro, d)"
        start = data.index(token)
        for mode, d in modes("source.sv", ("source_top",)):
            with self.subTest(mode=mode):
                _, span = self.statement(d, signal="from_macro")
                self.assertEqual(span["start"], position(data, start))
                self.assertEqual(span["end"], position(data, start + len(token)))
                self.assertEqual(span["contentHash"], hashlib.sha256(data).hexdigest())
                self.assertEqual(span["path"], str((FIXTURES / "source_include.svh").resolve()))

    def test_instance_declarators_on_same_line_have_distinct_ranges(self):
        data = (FIXTURES / "source.sv").read_bytes()
        for mode, d in modes("source.sv", ("source_top",)):
            with self.subTest(mode=mode):
                spans = [d.call("source", d.inst(("source_top", child)), "--kind", "instantiation")
                         for child in ("left", "right")]
                self.assertEqual(spans[0]["file"], spans[1]["file"])
                self.assertLessEqual(spans[0]["end"]["offset"], spans[1]["start"]["offset"])
                for child, span in zip((b"left", b"right"), spans):
                    self.assertEqual(span["contentHash"], hashlib.sha256(data).hexdigest())
                    token = data[span["start"]["offset"]:span["end"]["offset"]]
                    self.assertTrue(token.startswith(child), token)
                    self.assertTrue(token.endswith(b")"), token)

    def test_source_read_is_table_scoped_and_hashes_exact_input_bytes(self):
        data = (FIXTURES / "source_include.svh").read_bytes()
        for mode, d in modes("source.sv", ("source_top",)):
            with self.subTest(mode=mode):
                _, span = self.statement(d)
                reply = d.call("read-source", span["file"])
                self.assertEqual(reply, {"text": data.decode("utf-8"), "contentHash": hashlib.sha256(data).hexdigest(),
                                         "matchesSnapshot": True})
                self.error(d, "not_found", "read-source", str(FIXTURES / "source_include.svh"))
                self.assertEqual(d.call("check-inputs"), {"changed": [], "complete": True})
