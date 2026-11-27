#!/usr/bin/env bash
# Differential test for genconn-core: C++ generateAll vs the TS oracle (byte-identical).
# The TS generator is the authoritative oracle; it is semantically equal to the committed
# golden file (newProject/.../top.top_level_ports_and_connectionss) per newProject's own tests.
set -euo pipefail
GENCONN=${GENCONN:-/Users/jiangbowang/MOI/2025/dftartist/dft-core/build/genconn}
ORACLE_DIR=${ORACLE_DIR:-/Users/jiangbowang/MOI/2025/dftartist/newProject}
NODE=${NODE:-node}
ORACLE="$ORACLE_DIR/tools/genconn-oracle.ts"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
"$NODE" "$ORACLE" emit-doc      >"$tmp/doc.json" 2>/dev/null
"$NODE" "$ORACLE" generate-all  >"$tmp/ts.txt"   2>/dev/null
"$GENCONN" generate-all "$tmp/doc.json" >"$tmp/cxx.txt"

if diff -q "$tmp/ts.txt" "$tmp/cxx.txt" >/dev/null; then
  echo "MATCH — genconn TS==C++ byte-identical ($(wc -c <"$tmp/cxx.txt") bytes)"
else
  echo "MISMATCH:"; diff "$tmp/ts.txt" "$tmp/cxx.txt" | head -40; exit 1
fi
