#!/usr/bin/env bash
# Byte-exact golden: ctrlgen gen <spec> vs frozen fixtures.
# usage: ctrlgen_golden.sh <spec.json> <golden_prefix>  (expects <prefix>.v/.icl/.tcl)
set -euo pipefail
CTRLGEN=${CTRLGEN:-/Users/jiangbowang/MOI/2025/dftartist/dft-core/build/ctrlgen}
SPEC=$1
PREFIX=$2

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
"$CTRLGEN" gen "$SPEC" > "$tmp/out.txt"

python3 - "$tmp/out.txt" "$tmp" <<'PYEOF'
import re, sys
raw = open(sys.argv[1]).read()
parts = re.split(r"===FILE:(.+?)===\n", raw)
for name, text in zip(parts[1::2], parts[2::2]):
    open(f"{sys.argv[2]}/{name.split('/')[-1]}", "w").write(text)
PYEOF

fail=0
for ext in v icl tcl; do
  want="$PREFIX.$ext"
  got="$tmp/$(basename "$PREFIX").$ext"
  if ! diff -q "$want" "$got" >/dev/null; then
    echo "MISMATCH $ext:"; diff "$want" "$got" | head -20 || true; fail=1
  fi
done
[ "$fail" = 0 ] && echo "MATCH — $(basename "$PREFIX") byte-identical" || exit 1
