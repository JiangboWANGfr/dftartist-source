#!/usr/bin/env bash
# L4 get-sequential ground truth: each leaf flop's clock / async-reset classification is
# pinned to the known-correct answer for the handcrafted seq.sv design.
set -euo pipefail
HDL=${HDL:-/Users/jiangbowang/MOI/2025/dftartist/dft-core/build/hdl}
DIR=${1:-/Users/jiangbowang/MOI/2025/dftartist/dft-core/test/rtl/seq}
PY=${PY:-python3}

"$HDL" sequential "$DIR" >/dev/null 2>&1 || { echo "FAIL: sequential crashed"; exit 1; }

TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT
"$HDL" sequential "$DIR" 2>/dev/null > "$TMP"

"$PY" - "$TMP" <<'PYEOF'
import sys, json
d = json.load(open(sys.argv[1]))
seq = {e["ownerInstanceId"]: e for e in d["sequential"]}

def ev(lst): return [(x["net"], x["edge"]) for x in lst]

# exactly the 4 flop instances, comb excluded, top (no proc block) excluded
want_ids = {"top.u_async", "top.u_sync", "top.u_aset", "top.u_plain"}
got_ids = set(seq)
assert got_ids == want_ids, f"ids: got {sorted(got_ids)} want {sorted(want_ids)}"
assert d["count"] == 4, f"count {d['count']} != 4"

# async active-low reset
assert ev(seq["top.u_async"]["clocks"]) == [("clk", "posedge")], seq["top.u_async"]
assert ev(seq["top.u_async"]["asyncResets"]) == [("rst_n", "negedge")], seq["top.u_async"]
# synchronous reset -> clock only, no async reset
assert ev(seq["top.u_sync"]["clocks"]) == [("clk", "posedge")], seq["top.u_sync"]
assert ev(seq["top.u_sync"]["asyncResets"]) == [], seq["top.u_sync"]
# async active-high set in begin/end
assert ev(seq["top.u_aset"]["clocks"]) == [("clk", "posedge")], seq["top.u_aset"]
assert ev(seq["top.u_aset"]["asyncResets"]) == [("arst", "posedge")], seq["top.u_aset"]
# plain always edge, no reset
assert ev(seq["top.u_plain"]["clocks"]) == [("clk2", "posedge")], seq["top.u_plain"]
assert ev(seq["top.u_plain"]["asyncResets"]) == [], seq["top.u_plain"]

# every reported element carries a source location
for e in d["sequential"]:
    assert e["file"].endswith("seq.sv") and e["line"] > 0, e
print("OK")
PYEOF

echo "MATCH — get-sequential: 4 flops classified (async/sync reset + plain), comb excluded"
