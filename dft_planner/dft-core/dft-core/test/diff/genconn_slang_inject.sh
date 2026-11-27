#!/usr/bin/env bash
# Slang-anchored vinject (inject-core): (1) drop-in on a regular netlist — slang == regex byte;
# (2) handles the cases the regex injector can't (ANSI header, positional connections, instance
# arrays, attributes, escaped identifiers) — output is valid Verilog (parse-check) with DFT injected.
set -euo pipefail
GENCONN=${GENCONN:-/Users/jiangbowang/MOI/2025/dftartist/dft-core/build/genconn}
ORACLE_DIR=${ORACLE_DIR:-/Users/jiangbowang/MOI/2025/dftartist/newProject}
EDGE=${1:-/Users/jiangbowang/MOI/2025/dftartist/dft-core/test/rtl/inject_edge}
FIX="$ORACLE_DIR/test/fixtures"
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT

# 1. regular netlist: slang injector is a byte-identical drop-in for the regex injector
"$GENCONN" inject       "$FIX/chip.genconn.json" "$FIX/chip.v" >"$tmp/regex.txt"
"$GENCONN" inject-slang "$FIX/chip.genconn.json" "$FIX/chip.v" >"$tmp/slang.txt"
diff -q "$tmp/regex.txt" "$tmp/slang.txt" >/dev/null || { echo "FAIL: slang != regex on chip.v"; exit 1; }

# 2. edge cases the regex injector cannot handle
for f in ansi_pos array attrs; do
  "$GENCONN" inject-slang "$EDGE/doc.json" "$EDGE/$f.v" >"$tmp/$f.out" || { echo "FAIL: inject $f"; exit 1; }
  pc=$("$GENCONN" parse-check "$tmp/$f.out")
  [ "$pc" = "0" ] || { echo "FAIL: $f output has $pc parse errors"; exit 1; }
  grep -q "ijtag_tck" "$tmp/$f.out" || { echo "FAIL: $f missing DFT injection"; exit 1; }
done

# document the gap: the regex injector FAILS on ansi_pos (ANSI + positional + escaped)
if "$GENCONN" inject "$EDGE/doc.json" "$EDGE/ansi_pos.v" >/dev/null 2>&1; then
  echo "NOTE: regex injector unexpectedly handled ansi_pos"
fi

echo "MATCH — slang inject: chip.v drop-in + ANSI/positional/array/attrs/escaped all valid"
