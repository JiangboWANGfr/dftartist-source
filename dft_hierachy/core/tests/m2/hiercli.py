"""Black-box access to the `hier` command line for the M2 acceptance tests.

The tests state their expectations in names and bit positions ("a[0]:data:exact"),
never in object references. This file turns the command line's JSON into that form;
it follows docs/DESIGN.md 4.4 (bindings, writes and dependencies), 5.2 (Endpoint),
5.3 (commands and the two output shapes) and 5.4 (the M2 structures).
"""
import json
import os
import re
import subprocess

FIXTURES = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "fixtures")

COMPLETE = {"status": "complete", "reasons": []}


class CliError(AssertionError):
    def __init__(self, message, code=None):
        super().__init__(message)
        self.code = code


def bits(r):
    return range(r["lsb"], r["lsb"] + r["width"])


def use(name, bit, role="data", precision="exact"):
    return f"{name}[{bit}]:{role}:{precision}"


class Design:
    def __init__(self, fixture, top=None, per_instance=False):
        self.design = [os.path.join(FIXTURES, fixture)]
        if top:
            self.design += ["--top", top]
        if per_instance:
            self.design += ["--per-instance-bodies"]
        self.cache = {}

    def run(self, *cmd):
        if cmd not in self.cache:
            # A missing binary must fail the test, not skip it (A24).
            p = subprocess.run([os.environ["HIER_BIN"], *cmd, *self.design],
                               capture_output=True, text=True, timeout=20)
            if p.returncode != 0:
                try:
                    code = json.loads(p.stdout)["error"]["code"]
                except (ValueError, KeyError, TypeError):
                    code = None
                first = (p.stdout + p.stderr).strip().splitlines()[:1]
                raise CliError(f"hier {' '.join(cmd)}: exit {p.returncode}: {first}", code)
            self.cache[cmd] = json.loads(p.stdout)
        return self.cache[cmd]

    # ---- navigation (M1 commands) ----

    def info(self, path):
        level = self.run("roots")
        while True:
            for i in level:
                if i["pathText"] == path:
                    return i
            down = [i for i in level if path.startswith(i["pathText"] + ".")]
            if not down:
                raise CliError(f"no instance {path}")
            level = self.run("children", down[0]["ref"], "--limit", "100000")["items"]

    def inst(self, path):
        return self.info(path)["ref"]

    # ---- names ----

    def signals(self, inst):
        return self.run("signals", inst, "--limit", "100000")["items"]

    def names(self, inst):
        """ref -> name for the signals and ports of one instance. A port and its
        internal signal are two objects with the same name, so expectations need not
        tell them apart."""
        return {o["ref"]: o["name"] for o in self.signals(inst) + self.run("ports", inst)}

    def refs(self, inst, name):
        return {r for r, n in self.names(inst).items() if n == name}

    def port(self, path, name):
        return next(p for p in self.run("ports", self.inst(path)) if p["name"] == name)

    # ---- processes ----

    def proc(self, ref):
        return self.run("proc", ref)["result"]

    def proc_kinds(self, path):
        """Kinds of every process of the instance, in declaration order."""
        return [p["kind"] for p in
                self.run("procs", self.inst(path), "--limit", "100000")["items"]]

    def write_deps(self, inst, proc_ref, targets, bit):
        """What bit `bit` of the object(s) `targets` depends on in one process."""
        names = self.names(inst)
        deps, written = set(), False
        for w in self.proc(proc_ref)["writes"]:
            target = w["target"]
            if target["ref"] not in targets or bit not in bits(target["bits"]):
                continue
            assert not written, f"{proc_ref} writes bit {bit} of {targets} twice"
            written = True
            for dep in w["deps"]:
                if dep["align"] == "bitwise":
                    assert dep["bits"]["width"] == target["bits"]["width"], w
                    read = [dep["bits"]["lsb"] + bit - target["bits"]["lsb"]]
                else:
                    assert dep["align"] == "all", dep
                    read = bits(dep["bits"])
                for b in read:
                    item = use(names[dep["signal"]], b, dep["role"], dep["precision"])
                    deps.add(item)
        assert written, f"{proc_ref} does not write bit {bit} of {targets}"
        return frozenset(deps)

    # ---- drivers and loads ----

    def endpoints(self, cmd, path, name, bit, reach, side=None):
        """Endpoints of one bit. Without `side` the object is the signal called `name`;
        with it, the port called `name` seen from that side."""
        inst = self.inst(path)
        objs = self.run("ports", inst) if side else self.signals(inst)
        ref = next(o["ref"] for o in objs if o["name"] == name)
        r = self.run(cmd, ref, "--lsb", str(bit), "--width", "1", "--reach", reach,
                     *(["--side", side] if side else []))
        return r["result"], r["completeness"]

    def where(self, endpoint):
        """(kind, hierarchical path, lowest bit on the endpoint's side). The path is
        that of the port or pin, or of the instance that owns the process."""
        obj = endpoint["inst"] if endpoint["kind"] == "process" else endpoint["ref"]
        assert endpoint["bits"]["width"] == 1 and endpoint["queried"]["width"] == 1, endpoint
        return (endpoint["kind"], self.run("obj", obj)["pathText"], endpoint["bits"]["lsb"])

    def process_refs(self, cmd, path, name, bit, reach):
        """References of the processes that drive (or read) one bit; requires that the
        answer is complete and consists of processes only."""
        eps, completeness = self.endpoints(cmd, path, name, bit, reach)
        assert completeness == COMPLETE, completeness
        assert all(e["kind"] == "process" for e in eps), eps
        return sorted(e["ref"] for e in eps)

    def driver_deps(self, path, name, bit):
        """One (process kind, dependency set) per local driver of the bit."""
        inst = self.inst(path)
        out = []
        for ref in self.process_refs("drivers", path, name, bit, "local"):
            info = self.proc(ref)
            assert info["inst"] == inst and self.run("obj", ref)["inst"] == inst, info
            out.append((info["kind"], self.write_deps(inst, ref, self.refs(inst, name), bit)))
        return sorted(out, key=lambda kd: (kd[0], sorted(kd[1])))

    # ---- bindings ----

    def pin_map(self, path):
        """{(child name, port name): [target of pin bit 0, 1, ...]} for one instance.
        A target is "sig[3]", "const:x", "nc", "unresolved:<reason>", or
        ("expr", dependency set of that pin bit)."""
        inst = self.inst(path)
        names = self.names(inst)
        children = {c["ref"]: c["name"] for c in
                    self.run("children", inst, "--limit", "100000")["items"]}
        netlist = self.run("bindings", inst)
        assert netlist["inst"] == inst, netlist["inst"]
        out = {}
        for b in netlist["bindings"]:
            pin = []
            for seg in b["segments"]:
                # Ascending, no gaps, no overlaps.
                assert seg["pinBits"]["lsb"] == len(pin), b
                t = seg["target"]
                if t["kind"] == "signal":
                    vals = [f'{names[t["signal"]]}[{i}]' for i in bits(t["bits"])]
                elif t["kind"] == "const":
                    m = re.fullmatch(r"(\d+)'b([01xz]+)", t["value"])
                    assert m and int(m[1]) == len(m[2]), t
                    vals = [f"const:{c}" for c in reversed(m[2])]
                elif t["kind"] == "expr":
                    assert self.proc(t["process"])["kind"] == "port_expr", t
                    vals = [("expr", self.write_deps(inst, t["process"], {b["pin"]}, i))
                            for i in bits(seg["pinBits"])]
                elif t["kind"] == "unconnected":
                    vals = ["nc"] * seg["pinBits"]["width"]
                else:
                    assert t["kind"] == "unresolved", t
                    vals = ["unresolved:" + t["reason"]] * seg["pinBits"]["width"]
                assert len(vals) == seg["pinBits"]["width"], seg
                pin += vals
            assert len(pin) == b["width"], b
            key = (children[b["inst"]], b["port"])
            assert key not in out, key
            out[key] = pin
        return out

    # ---- registers ----

    def registers(self, path):
        """{"q[0]": (clock, edge, {(async signal, edge, type), ...}), ...} per written bit."""
        inst = self.inst(path)
        names = self.names(inst)
        reply = self.run("registers", inst, "--limit", "100000")
        assert reply["completeness"] == COMPLETE, reply["completeness"]
        out = {}
        for r in reply["result"]["items"]:
            clock = (names[r["clock"]["signal"]], r["clock"]["edge"])
            ctrl = frozenset((names[a["signal"]], a["edge"], a["type"]) for a in r["async"])
            for i in bits(r["bits"]):
                key = f'{names[r["signal"]]}[{i}]'
                assert key not in out, f"{key} reported twice"
                out[key] = (*clock, ctrl)
        return out


def both(fixture, top):
    """The same design with and without body sharing (docs/DESIGN.md 4.1); every
    expectation must hold for both."""
    return [("shared", Design(fixture, top)),
            ("per-instance", Design(fixture, top, per_instance=True))]
