#!/usr/bin/env bash
set -euo pipefail
SPECGEN=${SPECGEN:-/Users/jiangbowang/MOI/2025/dftartist/dft-core/build/specgen}
ORACLE_DIR=${ORACLE_DIR:-/Users/jiangbowang/MOI/2025/dftartist/newProject}
NODE=${NODE:-node}
FRAG=${FRAG:-/Users/jiangbowang/MOI/2025/dftartist/dft-core/test/fixtures/specgen_fragment.json}
ORACLE="$ORACLE_DIR/tools/specgen-oracle.ts"
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
"$NODE" "$ORACLE" fragment "$FRAG" >"$tmp/ts.txt" 2>/dev/null
"$SPECGEN" fragment "$FRAG"         >"$tmp/cxx.txt"
if diff -q "$tmp/ts.txt" "$tmp/cxx.txt" >/dev/null; then
  echo "MATCH — specgen fragment TS==C++ ($(wc -c <"$tmp/cxx.txt") bytes)"
else
  echo "MISMATCH:"; diff "$tmp/ts.txt" "$tmp/cxx.txt" | head -60; exit 1
fi
