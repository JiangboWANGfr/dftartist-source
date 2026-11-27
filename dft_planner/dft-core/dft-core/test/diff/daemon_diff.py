#!/usr/bin/env python3
"""Differential test of the NDJSON daemon: drive the python oracle to build an
adaptive request sequence, replay identical requests to the C++ daemon, compare
the ready event + every response."""
import json
import os
import subprocess
import sys

PY = os.environ.get("PY", "/Users/jiangbowang/miniforge3/bin/python3")
ORACLE = os.environ.get(
    "ORACLE", "/Users/jiangbowang/MOI/2025/dftartist/Hierarchyshower/tools/hierarchy_daemon.py")
HDL = os.environ.get("HDL", "/Users/jiangbowang/MOI/2025/dftartist/dft-core/build/hdl")


class Daemon:
    def __init__(self, cmd):
        self.p = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                  text=True, bufsize=1)
        self.ready = json.loads(self.p.stdout.readline())

    def req(self, obj):
        self.p.stdin.write(json.dumps(obj) + "\n")
        self.p.stdin.flush()
        return json.loads(self.p.stdout.readline())

    def close(self):
        self.p.stdin.close()
        self.p.wait()


def build_and_run_oracle(cmd, extra):
    """Drive oracle, returning (ready, [(request, response)...])."""
    d = Daemon(cmd + extra)
    seq = []

    def send(obj):
        r = d.req(obj)
        seq.append((obj, r))
        return r

    root = d.ready["candidateTops"][0]["id"]
    send({"id": 1, "method": "ping"})
    exp = send({"id": 2, "method": "expand-children", "params": {"nodeId": root}})
    # expand up to 5 non-leaf children, get-ports + loc on each
    rid = 100
    nonleaf = [c for c in exp["result"]["children"] if not c["isLeaf"]][:5]
    leaf = [c for c in exp["result"]["children"] if c["isLeaf"]][:3]
    # netlist of the root level (L3)
    send({"id": 3, "method": "get-netlist", "params": {"ownerInstanceId": root}})
    for c in nonleaf:
        ec = send({"id": rid, "method": "expand-children", "params": {"nodeId": c["id"]}}); rid += 1
        send({"id": rid, "method": "get-netlist", "params": {"ownerInstanceId": c["id"]}}); rid += 1
        send({"id": rid, "method": "get-ports", "params": {"nodeId": c["id"]}}); rid += 1
        send({"id": rid, "method": "get-source-location",
              "params": {"kind": "instantiation", "nodeId": c["id"]}}); rid += 1
        send({"id": rid, "method": "get-ports", "params": {"defId": c["definitionId"]}}); rid += 1
        send({"id": rid, "method": "get-source-location",
              "params": {"kind": "definition", "defId": c["definitionId"]}}); rid += 1
        send({"id": rid, "method": "get-parameters", "params": {"nodeId": c["id"]}}); rid += 1
        send({"id": rid, "method": "get-parameters", "params": {"defId": c["definitionId"]}}); rid += 1
        # trace on a grandchild's pins (exercise fanin/fanout/drivers)
        gkids = ec["result"]["children"]
        if gkids:
            gc = gkids[0]
            gp = send({"id": rid, "method": "get-ports", "params": {"nodeId": gc["id"]}}); rid += 1
            ports = gp["result"]["ports"]
            if ports:
                pn = ports[0]["name"]
                send({"id": rid, "method": "trace-fanin", "params": {"nodeId": gc["id"], "port": pn}}); rid += 1
                send({"id": rid, "method": "trace-fanout", "params": {"nodeId": gc["id"], "port": pn}}); rid += 1
                send({"id": rid, "method": "trace-drivers", "params": {"nodeId": gc["id"], "port": pn}}); rid += 1
    for c in leaf:
        send({"id": rid, "method": "get-ports", "params": {"nodeId": c["id"]}}); rid += 1
    d.close()
    return d.ready, seq


def diff(a, b, path=""):
    out = []
    if type(a) != type(b):
        return [f"{path}: type {type(a).__name__} != {type(b).__name__}"]
    if isinstance(a, dict):
        for k in sorted(set(a) | set(b), key=str):
            if k not in a: out.append(f"{path}.{k}: missing in oracle")
            elif k not in b: out.append(f"{path}.{k}: missing in cxx")
            else: out += diff(a[k], b[k], f"{path}.{k}")
    elif isinstance(a, list):
        if len(a) != len(b): out.append(f"{path}: len {len(a)} != {len(b)}")
        for i in range(min(len(a), len(b))): out += diff(a[i], b[i], f"{path}[{i}]")
    else:
        if a != b: out.append(f"{path}: {a!r} != {b!r}")
    return out


def main():
    inp = sys.argv[1]
    extra = sys.argv[2:]  # e.g. --var CODE_BASE_PATH=... --subst gen_rtl/=
    ready_o, seq = build_and_run_oracle([PY, ORACLE, inp], extra)

    # replay identical requests to C++ daemon
    c = Daemon([HDL, "serve", inp] + extra)
    ready_c = c.ready
    resp_c = [c.req(req) for (req, _) in seq]
    c.close()

    diffs = diff(ready_o, ready_c, "ready")
    for (i, ((req, ro), rc)) in enumerate(zip(seq, resp_c)):
        diffs += diff(ro, rc, f"resp[{req['method']}:{req.get('id')}]")

    if diffs:
        print(f"MISMATCH ({len(diffs)} diffs) over {len(seq)} requests:")
        for line in diffs[:60]:
            print(" ", line)
        sys.exit(1)
    print(f"MATCH — ready + {len(seq)} responses identical")


if __name__ == "__main__":
    main()
