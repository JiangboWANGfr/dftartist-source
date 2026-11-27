"""CLI integration gates from DESIGN 4.3, 5.2-5.4, not implementation behavior.

Negative tests first require a successful command, so a missing feature cannot
accidentally satisfy them. Repetition bypasses Design.run's test-side cache.
The 20s subprocess limit is a harness safety limit, not a product timing SLA.
"""
import json
import os
import subprocess
import unittest

from hiercli import COMPLETE, Design, both


def invoke(design, *args):
    reply = subprocess.run([os.environ["HIER_BIN"], *args, *design.design],
                           capture_output=True, text=True, timeout=20)
    return reply, json.loads(reply.stdout)


class Boundaries(unittest.TestCase):
    def test_empty_body_has_complete_empty_collections(self):
        """boundary_empty.sv: no signals, pins, sources, registers is not partial."""
        design = Design("m2/boundary_empty.sv", "boundary_empty")
        inst = design.inst("boundary_empty")
        self.assertEqual(design.run("ports", inst), [])
        self.assertEqual(design.run("bindings", inst), {"inst": inst, "bindings": []})
        for command in ("signals", "procs"):
            reply = design.run(command, inst)
            self.assertEqual(reply["items"], [])
            self.assertFalse(reply.get("next"))
        reply = design.run("registers", inst)
        self.assertEqual(reply["completeness"], COMPLETE)
        self.assertEqual(reply["result"]["items"], [])

    def test_bit_arguments_are_atomic_for_drivers_and_loads(self):
        """A half-specified Slice is bad_request; valid slice must succeed first."""
        design = Design("m2/conn.sv", "occ")
        ref = next(s["ref"] for s in design.signals(design.inst("occ.u_b"))
                   if s["name"] == "n")
        for command in ("drivers", "loads"):
            valid, _ = invoke(design, command, ref, "--lsb", "0", "--width", "1",
                              "--reach", "local")
            self.assertEqual(valid.returncode, 0, valid.stderr)
            for half in (("--lsb", "0"), ("--width", "1")):
                with self.subTest(command=command, half=half):
                    reply, body = invoke(design, command, ref, *half, "--reach", "local")
                    self.assertNotEqual(reply.returncode, 0)
                    self.assertEqual(body["error"]["code"], "bad_request")
                    self.assertIsInstance(body["error"]["message"], str)
                    self.assertTrue(body["error"]["message"])
                    self.assertNotIn("result", body)

    def test_signals_and_processes_page_without_gaps_when_limit_changes(self):
        """Same cursor/query, changing limit cannot alter declaration order."""
        design = Design("m2/conn.sv", "occ")
        inst = design.inst("occ.u_b")
        for command in ("signals", "procs"):
            with self.subTest(command=command):
                full = design.run(command, inst, "--limit", "1000")["items"]
                self.assertGreater(len(full), 1)
                page = design.run(command, inst, "--limit", "1")
                self.assertEqual(page["items"], full[:1])
                self.assertTrue(page.get("next"))
                rest = design.run(command, inst, "--limit", "1000", "--cursor", page["next"])
                self.assertEqual(page["items"] + rest["items"], full)
                self.assertFalse(rest.get("next"))
                refs = [item["ref"] for item in full]
                self.assertEqual(len(refs), len(set(refs)))

    def test_cursor_is_bound_to_method_and_instance(self):
        """A signals cursor cannot be reused for another instance or method."""
        design = Design("m2/conn.sv", "occ")
        a, b = design.inst("occ.u_a"), design.inst("occ.u_b")
        first = design.run("signals", a, "--limit", "1")
        cursor = first["next"]
        design.run("procs", a)  # positive control for the other method
        for command, inst in (("signals", b), ("procs", a)):
            with self.subTest(command=command, inst=inst):
                reply, body = invoke(design, command, inst, "--cursor", cursor)
                self.assertNotEqual(reply.returncode, 0)
                self.assertEqual(body["error"]["code"], "bad_request")

    def test_repeated_queries_do_not_duplicate_real_drivers(self):
        """multi.m has exactly two real drivers on every fresh invocation."""
        for mode, design in both("m2/conn.sv", "multi"):
            with self.subTest(mode=mode):
                ref = next(s["ref"] for s in design.signals(design.inst("multi"))
                           if s["name"] == "m")
                results = []
                for _ in range(3):
                    reply, body = invoke(design, "drivers", ref, "--reach", "local")
                    self.assertEqual(reply.returncode, 0)
                    self.assertEqual(body["completeness"], COMPLETE)
                    sources = [e["ref"] for e in body["result"] if e["kind"] == "process"]
                    self.assertEqual(len(sources), 2)
                    self.assertEqual(len(set(sources)), 2)
                    results.append(body)
                self.assertEqual(results[0], results[1])
                self.assertEqual(results[1], results[2])


if __name__ == "__main__":
    unittest.main()
