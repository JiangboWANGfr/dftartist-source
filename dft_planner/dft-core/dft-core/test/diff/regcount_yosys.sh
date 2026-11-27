#!/usr/bin/env bash
# Cross-check the slang-based `hdl regcount` register total against yosys's
# inferred flip-flop (dff/adff) count, on a real design.
#
# Baseline (gps_baseband, 12-channel GPS correlator; historical reg_count.py
# reference via yosys): 7762 FF.
#
# Measured 2026-07-09 on gps_baseband (this script's methodology):
#   slang `hdl regcount` total : 7762  (memoryBits: 0)
#   yosys $dff/$adff cells     : 553   (538 $dff + 15 $adff)
#   yosys $dff/$adff bits      : 7762  (7674 dff bits + 88 adff bits)
#   delta vs 7762 baseline     : 0.00% (exact match, well within +/-2%)
#
# usage: regcount_yosys.sh <hdl-bin> <regcount-input> <verilog-file> [<verilog-file>...]
#   <hdl-bin>         path to the `hdl` binary (e.g. build/hdl)
#   <regcount-input>  a DIRECTORY or a .fl filelist for `hdl regcount`
#                     (never a bare .sv/.v file — parseFilelist mis-parses it)
#   <verilog-file>... one or more Verilog sources for yosys to elaborate
#                     (yosys does not follow filelists, so list every file
#                     the design needs)
#
# requires: yosys, python3
set -euo pipefail

if [[ $# -lt 3 ]]; then
  echo "usage: $0 <hdl-bin> <regcount-input> <verilog-file> [<verilog-file>...]" >&2
  exit 1
fi

HDL_BIN=$1
REGCOUNT_INPUT=$2
shift 2

command -v yosys >/dev/null 2>&1 || { echo "error: yosys not found in PATH" >&2; exit 1; }
[[ -x "$HDL_BIN" ]] || { echo "error: hdl binary not found/executable: $HDL_BIN" >&2; exit 1; }

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

"$HDL_BIN" regcount "$REGCOUNT_INPUT" > "$tmp/slang.json"

yosys -p "read_verilog -sv $*; hierarchy -auto-top; proc; opt_clean; flatten; opt_clean; stat -width" \
  > "$tmp/yosys.txt" 2>&1

python3 - "$tmp/slang.json" "$tmp/yosys.txt" <<'PYEOF'
import json, re, sys

slang_path, yosys_path = sys.argv[1], sys.argv[2]

with open(slang_path) as f:
    slang = json.load(f)
slang_total = slang["total"]
slang_membits = sum(c.get("memoryBits", 0) for c in slang["counts"])

# yosys `stat -width` annotates cell types with word width, e.g. "$dff_8"
# for an 8-bit-wide $dff. Sum count*width over all flop-like cell types.
flop_types = ("dff", "adff", "sdff", "dffe", "adffe", "sdffe", "dffsr", "dlatch")
cell_re = re.compile(r"^\s*(\d+)\s+\$(" + "|".join(flop_types) + r")_(\d+)\s*$")

yosys_cells = 0
yosys_bits = 0
with open(yosys_path) as f:
    for line in f:
        m = cell_re.match(line)
        if m:
            count, width = int(m.group(1)), int(m.group(3))
            yosys_cells += count
            yosys_bits += count * width

print(f"slang  hdl regcount total : {slang_total}  (memoryBits sum: {slang_membits})")
print(f"yosys  dff/adff cells     : {yosys_cells}")
print(f"yosys  dff/adff bits      : {yosys_bits}")

if yosys_bits:
    delta = (slang_total - yosys_bits) / yosys_bits * 100
    verdict = "within" if abs(delta) <= 2 else "OUTSIDE"
    print(f"delta (slang total vs yosys bits): {delta:+.2f}%  ({verdict} +/-2%)")
else:
    print("delta: n/a (no flop cells found in yosys output -- check for errors above)")
PYEOF
