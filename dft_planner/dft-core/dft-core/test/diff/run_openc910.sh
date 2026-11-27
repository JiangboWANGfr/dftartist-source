#!/usr/bin/env bash
# Scale + false-top differential test on openc910 (17100 instances, 27 real tops
# after filtering dead SRAM false-tops). Not in default ctest (needs the openc910
# tree + a ~14s python-oracle run). Run manually.
set -euo pipefail
OC=${OC:-/Users/jiangbowang/MOI/2025/dftartist/veirlogPaser/openc910/design}
FL="$OC/filelists/C910_asic_rtl.fl"
HDL=${HDL:-/Users/jiangbowang/MOI/2025/dftartist/dft-core/build/hdl}
PY=${PY:-/Users/jiangbowang/miniforge3/bin/python3}
ORACLE=${ORACLE:-/Users/jiangbowang/MOI/2025/dftartist/Hierarchyshower/tools/dump_hierarchy.py}
HERE=$(cd "$(dirname "$0")" && pwd)

# var-expand ${CODE_BASE_PATH}, then strip the filelist's extra "gen_rtl/" segment.
ARGS=(--var "CODE_BASE_PATH=$OC" --subst "gen_rtl/=")

echo "== C++ hdl dump =="
time "$HDL" dump "$FL" "${ARGS[@]}" >/tmp/oc_cxx.json
echo "== python oracle =="
time "$PY" "$ORACLE" "$FL" "${ARGS[@]}" >/tmp/oc_oracle.json
echo "== compare =="
"$PY" "$HERE/compare.py" /tmp/oc_oracle.json /tmp/oc_cxx.json
