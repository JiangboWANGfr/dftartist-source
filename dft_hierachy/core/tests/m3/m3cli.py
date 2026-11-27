"""Public CLI only. No implementation-derived reference, map or graph oracle.

Every call opens a snapshot: same-snapshot history/cursors belong to M3ApiTest.cpp.
No reply caching; this harness must not manufacture query-order equivalence.
"""
import json
import os
from pathlib import Path
import subprocess
import unittest

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures" / "m3"
COMPLETE = {"status": "complete", "reasons": []}


def bitrange(lsb=0, width=1):
    return {"lsb": lsb, "width": width}


class Design:
    def __init__(self, fixture="flow.sv", tops=("flow",), per_instance=False):
        self.args = [str(FIXTURES / fixture)]
        for top in tops:
            self.args += ["--top", top]
        if per_instance:
            self.args += ["--per-instance-bodies"]

    def raw(self, *args):
        reply = subprocess.run([os.environ["HIER_BIN"], *map(str, args), *self.args],
                               capture_output=True, text=True, timeout=40)
        try:
            decoded = json.loads(reply.stdout)
        except ValueError:
            raise AssertionError(f"NON_JSON_REPLY:{args}:{reply.returncode}:"
                                 f"{reply.stdout}{reply.stderr}") from None
        return reply.returncode, decoded

    def call(self, *args):
        code, value = self.raw(*args)
        if code:
            raise AssertionError(f"COMMAND_FAILURE:{args}:exit={code}:{value}")
        return value

    def instances(self):
        pending = list(self.call("roots"))
        result = []
        while pending:
            inst = pending.pop(0)
            result.append(inst)
            pending.extend(self.call("children", inst["ref"], "--limit", "100000")["items"])
        return result

    def inst(self, path):
        matches = [i for i in self.instances() if i["path"] == list(path)]
        assert len(matches) == 1, (path, matches)
        return matches[0]["ref"]

    def signals(self, path):
        return self.call("signals", self.inst(path), "--limit", "100000")["items"]

    def ref(self, name, path=None, port=False):
        path = path or ("flow",)
        values = (self.call("ports", self.inst(path)) if port else self.signals(path))
        matches = [v["ref"] for v in values if v["name"] == name]
        assert len(matches) == 1, (path, name, matches)
        return matches[0]

    def process_for(self, name, path=("flow",)):
        target = self.ref(name, path)
        found = []
        for s in self.call("procs", self.inst(path), "--limit", "100000")["items"]:
            p = self.call("proc", s["ref"])
            if any(w["target"]["ref"] == target for w in p["result"]["writes"]):
                found.append(p)
        assert len(found) == 1, (name, found)
        return found[0]

    def step(self, name, top="flow", direction="back", lsb=0, width=1):
        return self.call("step", self.ref(name, (top,)), "--dir", direction,
                         "--lsb", lsb, "--width", width)

    def cone(self, name, top="flow", direction="back", policy="combinational", **budget):
        args = ["cone", self.ref(name, (top,)), "--dir", direction, "--policy", policy]
        for key, value in budget.items():
            args += ["--" + key.replace("_", "-"), value]
        return self.call(*args)


def modes(fixture="flow.sv", tops=("flow",)):
    for per in (False, True):
        yield ("per-instance" if per else "shared"), Design(fixture, tops, per)


class Contract(unittest.TestCase):
    def complete(self, reply):
        self.assertEqual(reply["completeness"], COMPLETE)
        return reply["result"]

    def partial(self, reply, reason, at=None):
        self.assertEqual(reply["completeness"]["status"], "partial", reply)
        self.assertTrue(any(r["code"] == reason and (at is None or r.get("at") == at)
                            for r in reply["completeness"]["reasons"]), reply)
        return reply["result"]

    def error(self, design, code, *args):
        status, reply = design.raw(*args)
        self.assertNotEqual(status, 0)
        self.assertEqual(reply["error"]["code"], code, reply)
        self.assertTrue(reply["error"]["message"])

    def graph(self, reply):
        graph = reply["result"]
        nodes, edges = graph["nodes"], graph["edges"]
        self.assertEqual(len({n["id"] for n in nodes}), len(nodes))
        self.assertEqual(len({e["id"] for e in edges}), len(edges))
        by_id = {n["id"]: n for n in nodes}
        for edge in edges:
            self.assertIn(edge["from"], by_id)
            self.assertIn(edge["to"], by_id)
            self.assertTrue(edge["fact"])
            if edge["kind"] == "boundary":
                self.assertEqual((edge["role"], edge["precision"], edge["align"], edge["map"]),
                                 ("data", "exact", "none", []))
                self.assertNotIn("fromBits", edge)
                self.assertNotIn("toBits", edge)
            else:
                for endpoint, field in (("from", "fromBits"), ("to", "toBits")):
                    enclosing = by_id[edge[endpoint]]["point"]["slice"]["bits"]
                    actual = edge[field]
                    self.assertGreater(actual["width"], 0)
                    self.assertGreaterEqual(actual["lsb"], enclosing["lsb"])
                    self.assertLessEqual(actual["lsb"] + actual["width"],
                                         enclosing["lsb"] + enclosing["width"])
                if edge["precision"] == "conservative":
                    self.assertEqual(edge["align"], "all")
                if edge["align"] == "all":
                    self.assertEqual(edge["map"], [])
        self.assertEqual(graph["hasConservative"], any(e["precision"] == "conservative" for e in edges))
        return graph

    @staticmethod
    def graph_refs(graph):
        return {n["point"]["slice"]["ref"] for n in graph["nodes"] if "point" in n}
