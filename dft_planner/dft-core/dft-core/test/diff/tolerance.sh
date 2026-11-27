#!/usr/bin/env bash
# Error tolerance / recovery: a missing file or a syntax error must NOT crash the load —
# the engine produces a partial hierarchy and reports file:line diagnostics.
set -euo pipefail
HDL=${HDL:-/Users/jiangbowang/MOI/2025/dftartist/dft-core/build/hdl}
DIR=${1:-/Users/jiangbowang/MOI/2025/dftartist/dft-core/test/rtl/tolerance}
PY=${PY:-python3}

# missing file: dump succeeds, hierarchy present, diagnostics lists exactly 1 missing file, 0 errors
"$HDL" dump "$DIR/missing.f" >/dev/null 2>&1 || { echo "FAIL: dump crashed on missing file"; exit 1; }
m=$("$HDL" diagnostics "$DIR/missing.f" 2>/dev/null |
    "$PY" -c "import sys,json;d=json.load(sys.stdin);print(len(d['missingFiles']), d['errorCount'])")
[ "$m" = "1 0" ] || { echo "FAIL missing: got '$m' (want '1 0')"; exit 1; }

# syntax error: dump succeeds, diagnostics report >0 errors and name the bad file
"$HDL" dump "$DIR/syntax.f" >/dev/null 2>&1 || { echo "FAIL: dump crashed on syntax error"; exit 1; }
s=$("$HDL" diagnostics "$DIR/syntax.f" 2>/dev/null |
    "$PY" -c "import sys,json;d=json.load(sys.stdin);print(1 if d['errorCount']>0 and 'bad.v' in d['text'] else 0)")
[ "$s" = "1" ] || { echo "FAIL syntax: errorCount/text missing bad.v"; exit 1; }

# both still yield the parseable 'top' hierarchy (partial results)
for f in missing syntax; do
  r=$("$HDL" dump "$DIR/$f.f" 2>/dev/null |
      "$PY" -c "import sys,json;print('top' in json.load(sys.stdin)['rootInstanceIds'])")
  [ "$r" = "True" ] || { echo "FAIL $f: 'top' missing from partial hierarchy"; exit 1; }
done

echo "MATCH — tolerance: missing file + syntax error -> partial hierarchy + file:line diagnostics, no crash"
