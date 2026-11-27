#!/usr/bin/env bash
# Differential test for genconn-core vinject: C++ injectDft vs TS injectDft (byte-identical),
# on newProject's real chip.v netlist + chip.genconn.json.
set -euo pipefail
GENCONN=${GENCONN:-/Users/jiangbowang/MOI/2025/dftartist/dft-core/build/genconn}
ORACLE_DIR=${ORACLE_DIR:-/Users/jiangbowang/MOI/2025/dftartist/newProject}
NODE=${NODE:-node}
FIX="$ORACLE_DIR/test/fixtures"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
"$NODE" "$ORACLE_DIR/tools/genconn-oracle.ts" inject "$FIX/chip.genconn.json" "$FIX/chip.v" \
  >"$tmp/ts.txt" 2>/dev/null
"$GENCONN" inject "$FIX/chip.genconn.json" "$FIX/chip.v" >"$tmp/cxx.txt"

if diff -q "$tmp/ts.txt" "$tmp/cxx.txt" >/dev/null; then
  echo "MATCH — vinject TS==C++ byte-identical ($(wc -c <"$tmp/cxx.txt") bytes)"
else
  echo "MISMATCH:"; diff "$tmp/ts.txt" "$tmp/cxx.txt" | head -40; exit 1
fi
