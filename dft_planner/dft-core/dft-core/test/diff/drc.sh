#!/usr/bin/env bash
# DFT-DRC ④.2 ground truth: CLK-UNCTRL / RST-UNCTRL fire exactly on the undriven clock/reset
# nets, and clocks/resets that thread to a primary input (incl. through 2 levels) stay clean.
set -euo pipefail
DRC=${DRC:-/Users/jiangbowang/MOI/2025/dftartist/dft-core/build/drc}
DIR=${1:-/Users/jiangbowang/MOI/2025/dftartist/dft-core/test/rtl/drc}
PY=${PY:-python3}

TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT
# exit 1 expected (errors present) — don't let set -e abort
"$DRC" check "$DIR" > "$TMP" 2>/dev/null || true

"$PY" - "$TMP" <<'PYEOF'
import sys, json
d = json.load(open(sys.argv[1]))
vs = {(v["rule"], v["instanceId"]): v for v in d["violations"]}

assert d["checked"] == {"flops": 4, "clocks": 4, "resets": 4}, d["checked"]
assert len(d["violations"]) == 2, [ (v["rule"], v["instanceId"]) for v in d["violations"] ]

# CLK-UNCTRL on the dead-clock top
c = vs[("CLK-UNCTRL", "clk_unctrl_top.u_ff")]
assert c["severity"] == "error" and c["signal"] == "clk", c
assert c["path"] == ["clk_unctrl_top.u_ff:clk", "clk_unctrl_top:clk_dead"], c["path"]

# RST-UNCTRL on the dead-reset top
r = vs[("RST-UNCTRL", "rst_unctrl_top.u_ff")]
assert r["severity"] == "error" and r["signal"] == "rst_n", r
assert r["path"] == ["rst_unctrl_top.u_ff:rst_n", "rst_unctrl_top:rst_dead"], r["path"]

# clean_top and deep_top (PI-controllable, incl. 2-level) must NOT appear
for (_, inst) in vs:
    assert not inst.startswith("clean_top"), f"false positive: {inst}"
    assert not inst.startswith("deep_top"), f"false positive: {inst}"
print("OK")
PYEOF

echo "MATCH — DRC ④.2: CLK-UNCTRL + RST-UNCTRL on undriven nets; PI-threaded clocks clean"
