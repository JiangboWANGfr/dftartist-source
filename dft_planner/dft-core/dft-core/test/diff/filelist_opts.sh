#!/usr/bin/env bash
# Commercial filelist options: +define+ / +incdir+ / -f nested all change the hierarchy correctly.
set -euo pipefail
HDL=${HDL:-/Users/jiangbowang/MOI/2025/dftartist/dft-core/build/hdl}
DIR=${1:-/Users/jiangbowang/MOI/2025/dftartist/dft-core/test/rtl/filelist_opts}
PY=${PY:-python3}

chk() {  # <filelist> <nodeId> -> definitionId
  "$HDL" dump "$DIR/$1" 2>/dev/null |
    "$PY" -c "import sys,json;print(json.load(sys.stdin)['instances'].get('$2',{}).get('definitionId',''))"
}

a=$(chk files_def_a.f top.u)
case "$a" in sub_a\|*) ;; *) echo "FAIL +define+USE_A: got '$a' (want sub_a)"; exit 1;; esac

b=$(chk files_def_none.f top.u)
case "$b" in sub_b\|*) ;; *) echo "FAIL no-define: got '$b' (want sub_b)"; exit 1;; esac

i=$(chk files_inc.f top2.u)
case "$i" in sub_inc\|/*) ;; *) echo "FAIL +incdir: got '$i' (want sub_inc with resolved path)"; exit 1;; esac

n=$(chk files_nested.f top.u)
case "$n" in sub_a\|*) ;; *) echo "FAIL -f nested: got '$n' (want sub_a)"; exit 1;; esac

echo "MATCH — filelist options: +define +incdir -f nested all applied correctly"
