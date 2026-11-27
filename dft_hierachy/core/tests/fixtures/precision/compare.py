#!/usr/bin/env python3
"""Verification item V5 (docs/DESIGN.md 9.1): compare the precision rule table against
the OLD backend's wrapper analysis, one module per rule (ops.sv).

For every output bit:
  T = the bits it truly depends on (written by hand below)
  N = what the rule table in DESIGN.md 4.4 gives (written by hand below)
  O = what the old backend's wrapper-cone reaches (measured)
Required: T <= N (the table misses nothing) and N <= O (the table is no coarser than the
old implementation). Also reported: T <= O failing means the OLD implementation misses a
real dependency.

usage: compare.py <path to old hdl binary>
"""
import json, os, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
A, B, S, C = (lambda *i: {f"a[{k}]" for k in i}), (lambda *i: {f"b[{k}]" for k in i}), \
             (lambda *i: {f"s[{k}]" for k in i}), {"c[0]"}
ALL_A, ALL_B, ALL_S = A(0, 1, 2, 3), B(0, 1, 2, 3), S(0, 1)
E = set()

def upto(f, i):
    return f(*range(i + 1))

# module -> (rule row, [T for y0..y3], [N for y0..y3]); N is None where N == T (exact).
CASES = {
    "op_select_concat": ("select / concat", [B(2), B(3), A(0), A(1)], None),
    "op_replicate": ("replication", [A(0), A(1), A(0), A(1)], None),
    "op_bitwise_and": ("bitwise", [A(i) | B(i) for i in range(4)], None),
    "op_bitwise_not": ("bitwise", [A(i) for i in range(4)], None),
    "op_conditional": ("conditional ?:", [A(i) | B(i) | C for i in range(4)], None),
    "op_zero_extend": ("zero extension", [A(0), A(1), E, E], None),
    "op_sign_extend": ("sign extension", [A(0), A(1), A(1), A(1)], None),
    "op_shift_const": ("constant shift", [E, A(0), A(1), A(2)], None),
    "op_reduce_and": ("reduction", [ALL_A, E, E, E], None),
    "op_compare": ("comparison", [ALL_A | ALL_B, E, E, E], None),
    "op_equal": ("equality", [ALL_A | ALL_B, E, E, E], None),
    "op_add": ("add (conservative)", [upto(A, i) | upto(B, i) for i in range(4)],
               [ALL_A | ALL_B] * 4),
    "op_multiply": ("multiply (conservative)", [upto(A, i) | upto(B, i) for i in range(4)],
                    [ALL_A | ALL_B] * 4),
    "op_shift_var": ("variable shift (conservative)", [upto(A, i) | ALL_S for i in range(4)],
                     [ALL_A | ALL_S] * 4),
    "op_dynamic_index": ("dynamic bit select (conservative)", [ALL_A | ALL_S, E, E, E], None),
    "op_dynamic_part": ("dynamic part select (conservative)",
                        [ALL_B | ALL_S, B(1, 2, 3) | ALL_S, E, E],
                        [ALL_B | ALL_S, ALL_B | ALL_S, E, E]),
    "op_function": ("function call (conservative)", [A(2), A(3), A(0), A(1)], [ALL_A] * 4),
    "op_proc_if": ("procedural if", [A(i) | B(i) | C for i in range(4)], None),
    "op_proc_case": ("procedural case", [A(i) | B(i) | ALL_S for i in range(4)], None),
}

def old_cone(hdl, filelist, module, bit):
    """Input bits the old wrapper analysis reaches from y[bit], or None on failure."""
    req = json.dumps({"id": 1, "method": "wrapper-cone",
                      "params": {"core": module, "port": "y", "bit": bit}}) + "\n"
    out = subprocess.run([hdl, "serve", filelist, "--top", module], input=req,
                         capture_output=True, text=True).stdout
    for line in out.splitlines():
        try:
            msg = json.loads(line)
        except ValueError:
            continue
        if msg.get("id") != 1:
            continue
        if "result" not in msg:
            return None
        found = set()
        for n in msg["result"]["nodes"]:
            parts = n["id"].split("|")
            if n["kind"] in ("net", "port") and len(parts) == 3 and parts[1] in "absc":
                found.add(f"{parts[1]}[{parts[2]}]")
        return found
    return None

def fmt(s):
    return "{" + ",".join(sorted(s)) + "}"

def main():
    hdl = sys.argv[1]
    with tempfile.NamedTemporaryFile("w", suffix=".f", delete=False) as f:
        f.write(os.path.join(HERE, "ops.sv") + "\n")
    bad = 0
    print(f"{'module':20} {'rule':34} table-vs-truth  table-vs-old    old-vs-truth")
    for module, (rule, T, N) in CASES.items():
        N = N or T
        verdicts = {"TN": "ok", "NO": "ok", "TO": "ok"}
        notes = []
        for bit in range(4):
            O = old_cone(hdl, f.name, module, bit)
            if O is None:
                verdicts["NO"] = verdicts["TO"] = "no baseline"
                continue
            if not T[bit] <= N[bit]:
                verdicts["TN"] = "TABLE MISSES"
                notes.append(f"y[{bit}] table misses {fmt(T[bit] - N[bit])}")
            if not N[bit] <= O:
                verdicts["NO"] = "TABLE COARSER"
                notes.append(f"y[{bit}] table {fmt(N[bit])} old {fmt(O)}")
            elif N[bit] < O and verdicts["NO"] == "ok":
                verdicts["NO"] = "table finer"
            if not T[bit] <= O:
                verdicts["TO"] = "OLD MISSES"
                notes.append(f"y[{bit}] old misses {fmt(T[bit] - O)}")
        if verdicts["TN"] != "ok" or verdicts["NO"] == "TABLE COARSER":
            bad += 1
        print(f"{module:20} {rule:34} {verdicts['TN']:15} {verdicts['NO']:15} {verdicts['TO']}")
        for n in notes:
            print(f"    {n}")
    os.unlink(f.name)
    return 1 if bad else 0

sys.exit(main())
