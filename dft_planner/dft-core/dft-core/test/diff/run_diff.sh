#!/usr/bin/env bash
set -euo pipefail
HDL=${HDL:-/Users/jiangbowang/MOI/2025/dftartist/dft-core/build/hdl}
PY=${PY:-/Users/jiangbowang/miniforge3/bin/python3}
ORACLE=${ORACLE:-/Users/jiangbowang/MOI/2025/dftartist/Hierarchyshower/tools/dump_hierarchy.py}
HERE=$(cd "$(dirname "$0")" && pwd)
INPUT=${1:?usage: run_diff.sh <filelist|dir>}

"$PY" "$ORACLE" "$INPUT" >/tmp/oracle.json 2>/dev/null
"$HDL" dump "$INPUT" >/tmp/cxx.json 2>/dev/null
"$PY" "$HERE/compare.py" /tmp/oracle.json /tmp/cxx.json
