#!/usr/bin/env bash
# Reruns the M0 measurements on the real designs (docs/M0_RESULTS.md).
# The fixture-based checks run under ctest; this script covers what needs designs that
# live outside this project, and the old backend used as the V5 baseline.
#
# Exits non-zero if any experiment fails, if either design has compile errors, or if
# the sharing comparison finds a mismatch.
#
# usage: run_m0.sh <processor_core.vc> <openc910 design dir> [old dft-core source dir]
set -euo pipefail

if [ $# -lt 2 ]; then
  sed -n '2,9p' "$0" >&2
  exit 2
fi

# Inputs may be relative to where the script is called from; everything below needs
# absolute paths (the openc910 link in particular would otherwise dangle).
abspath() { (cd "$(dirname "$1")" && printf '%s/%s\n' "$(pwd -P)" "$(basename "$1")"); }
[ -f "$1" ] || { echo "run_m0.sh: no such file: $1" >&2; exit 2; }
[ -d "$2" ] || { echo "run_m0.sh: no such directory: $2" >&2; exit 2; }
PC_VC=$(abspath "$1")
OC_DESIGN=$(abspath "$2")
OLD_SRC=""
if [ $# -ge 3 ]; then
  [ -d "$3" ] || { echo "run_m0.sh: no such directory: $3" >&2; exit 2; }
  OLD_SRC=$(abspath "$3")
fi

HERE=$(cd "$(dirname "$0")" && pwd -P)
CORE=$(dirname "$HERE")
BUILD=$CORE/build
EXP=$BUILD/experiments/hier_exp
[ -x "$EXP" ] || { echo "run_m0.sh: build first: $EXP not found" >&2; exit 2; }
OPTS=(--single-unit --ignore-unknown-modules --timescale 1ns/1ns --error-limit 0)
OUT=$(mktemp)
trap 'rm -f "$OUT"' EXIT

# Runs one experiment, keeps its full output in $OUT and fails the script if it fails.
# Filtering is done on the saved file afterwards, never in a pipe that could hide the
# experiment's own exit status.
run() {
  if ! "$EXP" "$@" > "$OUT" 2>&1; then
    cat "$OUT" >&2
    echo "run_m0.sh: FAILED: hier_exp $1" >&2
    exit 1
  fi
}
# Fails unless the saved output contains the given text.
expect() {
  if ! grep -q -- "$1" "$OUT"; then
    cat "$OUT" >&2
    echo "run_m0.sh: FAILED: expected '$1'" >&2
    exit 1
  fi
}

# openc910's filelist says ${CODE_BASE_PATH}/gen_rtl/...; the sources are in design/.
mkdir -p "$BUILD/openc910_base"
ln -sfn "$OC_DESIGN" "$BUILD/openc910_base/gen_rtl"
export CODE_BASE_PATH=$BUILD/openc910_base
[ -f "$OC_DESIGN/filelists/C910_asic_rtl.fl" ] || { echo "run_m0.sh: not an openc910 design dir: $OC_DESIGN" >&2; exit 2; }

measure() {  # name, slang args...
  local name=$1; shift
  echo "=== $name"
  run diags "$@";         expect "diagnostics: 0 errors"; grep "^diagnostics" "$OUT"
  run sharing "$@";       expect "\[canonical\].*MISMATCHES 0"; expect "\[cachekey\].*MISMATCHES 0"
  grep -E "^instances|^\[" "$OUT"
  run scale-folded "$@";  grep -E "getAllDiagnostics|folded" "$OUT"
  HIER_EXP_QUIET=1 run drivers "$@"; grep "^analysis" "$OUT"
  run clockstat "$@";     sed -n '/^distinct bodies/,$p' "$OUT"
}
measure processor_core -f "$PC_VC" --top processor_core "${OPTS[@]}"
measure openc910 -f "$OC_DESIGN/filelists/C910_asic_rtl.fl" --top openC910 "${OPTS[@]}"

echo "=== synthetic"
mkdir -p "$BUILD/synthetic"
for u in 0 10000 100000; do
  python3 "$CORE/tests/fixtures/synthetic/gen.py" --fanout 10 --depth 5 --unique $u > "$BUILD/synthetic/s100k_u$u.sv"
  echo "--- 111112 instances, $u unique leaves"
  run scale-folded "$BUILD/synthetic/s100k_u$u.sv" --top top --error-limit 0
  expect "instances=111112"
  grep -E "getAllDiagnostics|folded" "$OUT"
done

if [ -n "$OLD_SRC" ]; then
  echo "=== V5: precision rule table vs old backend"
  cmake -S "$OLD_SRC" -B "$BUILD/old-dft-core" -DCMAKE_BUILD_TYPE=RelWithDebInfo \
    "-DCMAKE_CXX_FLAGS=-include $HERE/oracle/tcl85_shim.h" > /dev/null
  cmake --build "$BUILD/old-dft-core" -j8 --target hdl > /dev/null
  python3 "$CORE/tests/fixtures/precision/compare.py" "$BUILD/old-dft-core/hdl"
fi
echo "=== all M0 measurements completed"
