#!/usr/bin/env bash
set -euo pipefail
GENCONN=${GENCONN:-/Users/jiangbowang/MOI/2025/dftartist/dft-core/build/genconn}
ORACLE_DIR=${ORACLE_DIR:-/Users/jiangbowang/MOI/2025/dftartist/newProject}
NODE=${NODE:-node}
DOC=${DOC:-/Users/jiangbowang/MOI/2025/dftartist/dft-core/test/fixtures/genconn_features.doc.json}
ORACLE="$ORACLE_DIR/tools/genconn-oracle.ts"
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
"$NODE" "$ORACLE" generate-all-doc "$DOC" >"$tmp/ts.txt" 2>/dev/null
"$GENCONN" generate-all "$DOC"            >"$tmp/cxx.txt"
if diff -q "$tmp/ts.txt" "$tmp/cxx.txt" >/dev/null; then
  echo "MATCH — genconn features TS==C++ ($(wc -c <"$tmp/cxx.txt") bytes)"
else
  echo "MISMATCH:"; diff "$tmp/ts.txt" "$tmp/cxx.txt" | head -60; exit 1
fi
