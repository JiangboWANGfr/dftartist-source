#!/usr/bin/env python3
"""Invariant sweep over the REAL design.

Instead of waiting for a screenshot to expose one bad box at a time, this drives the daemon over
every instance/port/logic block it can reach and checks properties that must ALWAYS hold. Every
bug we have hit by hand so far violates one of them, so a single run gives the full list.

Usage: sweep.py <filelist> [sdc] [maxInstances]
"""
import json, subprocess, sys, collections, re

HDL = "/mnt/c/Users/wongw/Desktop/DFT_STUDIO/dft_studio_qt/planner/dft-core/dft-core/build-linux/hdl"
VC  = sys.argv[1]
SDC = sys.argv[2] if len(sys.argv) > 2 else ""
CAP = int(sys.argv[3]) if len(sys.argv) > 3 else 400

viol = collections.defaultdict(list)
def bad(rule, msg):
    viol[rule].append(msg)

def session(reqs):
    """Run all requests in ONE daemon session (so caches/lazy registration behave as in the app).

    Responses are matched BY ID, never by position: the daemon emits extra id-less lines (e.g.
    a ready line on startup), which shifted a positional zip and misattributed every response —
    the sweep then reported phantom violations (6 "I7 no fan-in" blocks that a direct probe
    showed were perfectly fine). Requests must carry ids unique within the session."""
    ids = [r["id"] for r in reqs]
    assert len(ids) == len(set(ids)), "duplicate request ids would corrupt the id-matched zip"
    inp = "".join(json.dumps(r) + "\n" for r in reqs)
    pr = subprocess.run([HDL, "serve", VC], input=inp, capture_output=True, text=True, timeout=3600)
    byid = {}
    for line in pr.stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            o = json.loads(line)
        except json.JSONDecodeError:
            continue
        if o.get("id") is not None:
            byid[o["id"]] = o
    return [byid.get(i, {}) for i in ids]

# ---- pass 1: enumerate instances, then their ports ------------------------------------------
r = session([{"id": 1, "method": "find-objects",
              "params": {"pattern": "*", "kinds": "instance", "limit": CAP}}])
objs = (r[-1].get("result") or {}).get("objects", []) if r else []
insts = [o["id"] for o in objs]
print(f"instances discovered: {len(insts)}")

reqs, meta = [], []
# Register every instance first: the trace ops resolve nodeIds through the lazily-populated
# registry, so without this they silently return nothing (which is how the first sweep run
# reported "0 logic blocks" on a design that clearly has thousands).
for i, inst in enumerate(insts):
    reqs.append({"id": 500 + i, "method": "expand-children", "params": {"nodeId": inst}})
    meta.append(("expand", inst))
for i, inst in enumerate(insts):
    reqs.append({"id": 1000 + i, "method": "get-ports", "params": {"nodeId": inst}})
    meta.append(("ports", inst))
res = session(reqs)
res = res[len(insts):]           # drop the expand responses
meta = meta[len(insts):]
ports = {}
for o, (_, inst) in zip(res, meta):
    ports[inst] = [(p["name"], p["direction"]) for p in (o.get("result") or {}).get("ports", [])]

# ---- pass 2: trace-drivers on every input pin, then trace-logic on every logic source --------
# Registration lives in the daemon session, so passes 2 and 3 must REUSE it: re-registering
# every instance up front in each session is the price of the stdio protocol being one-shot.
def reg_prefix():
    return [{"id": 500 + i, "method": "expand-children", "params": {"nodeId": inst}}
            for i, inst in enumerate(insts)]

reqs, meta = reg_prefix(), []
n = 0
for inst, pl in ports.items():
    for (pn, d) in pl:
        # INPUT pins: the fan-in lives in the parent scope   -> trace-drivers
        # OUTPUT pins: the driver lives INSIDE the module    -> trace-into (what the UI does when
        #              you drill in, and the only route that surfaces internal logic blocks)
        m = "trace-into" if d == "out" else "trace-drivers"
        reqs.append({"id": 2000 + n, "method": m, "params": {"nodeId": inst, "port": pn}})
        meta.append((inst, pn))
        n += 1
res = session(reqs)[len(insts):]

logic_ids = {}
for o, (inst, pn) in zip(res, meta):
    r = o.get("result") or {}
    srcs = r.get("sources", [])
    seen_net = {}
    for s in srcs:
        sid, kind, lbl, net = s.get("id", ""), s.get("kind", ""), s.get("label", ""), s.get("net", "")
        if not sid:
            bad("I2 source has no id", f"{inst}.{pn}")
        if kind not in ("port", "logic", "constant"):
            bad("I2 unknown source kind", f"{inst}.{pn} kind={kind!r}")
        if kind == "port" and not sid.startswith("port:"):
            bad("I3 port source id malformed", f"{inst}.{pn} id={sid}")
        if kind == "logic":
            if not re.match(r"^logic:.+:\d+$", sid):
                bad("I4 logic source id malformed", f"{inst}.{pn} id={sid}")
            else:
                logic_ids[sid] = (inst, pn)
        # THE duplicate-pin bug: two sources claiming to drive the same signal
        if net:
            if net in seen_net and seen_net[net] != sid:
                bad("I1 two sources for one signal",
                    f"{inst}.{pn}: net={net} from {seen_net[net]} AND {sid}")
            seen_net[net] = sid
    if srcs and not r.get("netName"):
        bad("I5 sources but no netName", f"{inst}.{pn}")

print(f"logic blocks reached: {len(logic_ids)}")

# ---- pass 3: trace-logic on each block; the fan-in must not repeat a signal ------------------
# trace-logic now resolves ids on a COLD session too (findBlockAt + the id.s scope segment) —
# running WITHOUT the discovery replay is deliberate: it tests exactly what a restored
# schematic or a script does.
discover = []  # cold-session on purpose (see above)
reqs = reg_prefix() + discover
skip = len(reqs)
meta = []
for i, lid in enumerate(logic_ids):
    reqs.append({"id": 1000000 + i, "method": "trace-logic", "params": {"id": lid}})
    meta.append(lid)
res = session(reqs)[skip:]
for o, lid in zip(res, meta):
    r = o.get("result") or {}
    srcs = r.get("sources", [])
    if not srcs:
        bad("I7 logic block with no fan-in", f"{lid} (in {logic_ids[lid]})")
        continue
    byNet = collections.Counter(s.get("net", "") for s in srcs)
    for net, c in byNet.items():
        if net and c > 1:
            bad("I1 duplicate fan-in pin", f"{lid}: signal {net!r} appears {c}x")
    for s in srcs:
        if not s.get("net"):
            bad("I8 source does not name its signal", f"{lid}: id={s.get('id')}")

# ---- pass 3b: decompose-logic on each block — inputs must be unique, non-empty signals ------
reqs = reg_prefix() + discover
skip = len(reqs)
meta = []
for i, lid in enumerate(logic_ids):
    reqs.append({"id": 2000000 + i, "method": "decompose-logic", "params": {"id": lid}})
    meta.append(lid)
res = session(reqs)[skip:]
for o, lid in zip(res, meta):
    r = o.get("result") or {}
    ins = r.get("inputs", [])
    if len(ins) != len(set(ins)):
        dup = sorted({x for x in ins if ins.count(x) > 1})
        bad("I14 decompose repeats an input signal", f"{lid}: {dup}")
    for x in ins:
        if not x:
            bad("I15 decompose empty input name", f"{lid}")

# ---- pass 4: clock/reset structure invariants ------------------------------------------------
if SDC:
    res = session([{"id": 1, "method": "clock-reset-tree", "params": {"sdcFile": SDC}}])
    cr = (res[-1].get("result") or {}) if res else {}
    items = cr.get("items", [])
    print(f"clock/reset groups: {len(items)}")
    KNOWN = {"pi", "logic", "instance", "undriven", "sequential", "blackbox"}
    keys = collections.Counter()
    for i in items:
        k = (i["kind"], i["owner"], i["net"])
        keys[k] += 1
        if i["terminus"] not in KNOWN:
            bad("I9 unknown terminus", f"{k}: {i['terminus']}")
        if i["terminus"] != "undriven" and not i["detail"]:
            bad("I10 terminus with no detail", f"{k}: {i['terminus']}")
        for h in i["path"]:
            if ":" not in h:
                bad("I11 malformed path hop", f"{k}: {h!r}")
        if len(i["path"]) != len(set(i["path"])):
            bad("I12 repeated hop in one path", f"{k}")
    for k, c in keys.items():
        if c > 1:
            bad("I13 duplicate group", f"{k} x{c}")
    t = collections.Counter(i["terminus"] for i in items)
    print("terminus histogram:", dict(t))

# ---- report ----------------------------------------------------------------------------------
print("\n================ INVARIANT VIOLATIONS ================")
if not viol:
    print("none")
for rule in sorted(viol):
    v = viol[rule]
    print(f"\n{rule}: {len(v)}")
    for m in v[:8]:
        print("   ", m)
    if len(v) > 8:
        print(f"    ... and {len(v)-8} more")
