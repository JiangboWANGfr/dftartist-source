#!/usr/bin/env bash
# M0 tie-patch ground truth: constant tie vs unconnected vs real net on the
# handcrafted tie.v design, plus lazy ancestor registration for deep queries.
set -euo pipefail
HDL=${HDL:-/Users/jiangbowang/MOI/2025/dftartist/dft-core/build/hdl}
DIR=${1:-/Users/jiangbowang/MOI/2025/dftartist/dft-core/test/rtl/tie}
PY=${PY:-python3}

"$PY" - "$HDL" "$DIR/tie.f" <<'PYEOF'
import json, subprocess, sys
hdl, fl = sys.argv[1], sys.argv[2]
p = subprocess.Popen([hdl, "serve", fl], stdin=subprocess.PIPE,
                     stdout=subprocess.PIPE, text=True, bufsize=1)
ready = json.loads(p.stdout.readline())

def req(obj):
    p.stdin.write(json.dumps(obj) + "\n"); p.stdin.flush()
    return json.loads(p.stdout.readline())

# 1) deep get-netlist WITHOUT expand-children first -> lazy ancestor registration
nl = req({"id": 1, "method": "get-netlist",
          "params": {"ownerInstanceId": "top.u_mid"}})["result"]
conn = {c["port"]: c for c in nl["connections"] if c["instanceId"] == "top.u_mid.u_kid"}
assert conn, f"lazy get-netlist returned no u_kid connections: {nl}"
assert conn["a"]["net"] == "" and conn["a"]["tie"] == "1'b0", conn["a"]
assert conn["b"]["net"] == "" and conn["b"]["tie"] == "1'b1", conn["b"]
assert conn["c"]["net"] == "" and conn["c"]["tie"] == "4'b101", conn["c"]
assert conn["d"]["net"] == "" and conn["d"]["tie"] == "", conn["d"]      # dangling
assert conn["e"]["net"] == "w" and conn["e"]["tie"] == "", conn["e"]     # real net
assert conn["f"]["net"] == "" and conn["f"]["tie"] == "4'b1111", conn["f"]  # computed: -4'sd1
assert conn["g"]["net"] == "" and conn["g"]["tie"] == "4'b110", conn["g"]   # computed: 4'd5+4'd1

# 2) trace-drivers (also without prior expand): tie -> kind "constant"
td = req({"id": 2, "method": "trace-drivers",
          "params": {"nodeId": "top.u_mid.u_kid", "port": "a"}})["result"]
assert [s["kind"] for s in td["sources"]] == ["constant"], td
assert td["sources"][0]["label"] == "1'b0", td
td = req({"id": 3, "method": "trace-drivers",
          "params": {"nodeId": "top.u_mid.u_kid", "port": "d"}})["result"]
assert td["sources"] == [], td                                            # dangling stays empty
td = req({"id": 4, "method": "trace-drivers",
          "params": {"nodeId": "top.u_mid.u_kid", "port": "e"}})["result"]
assert any(s["kind"] == "logic" for s in td["sources"]), td               # assign w = clk

p.stdin.close(); p.wait()
print("tie OK")
PYEOF
