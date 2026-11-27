#!/usr/bin/env bash
# 容器内：补齐 pyslang oracle 环境，重跑 ctest 里 5 个环境性失败的差分测试
set -euo pipefail
export PIP_INDEX_URL=https://mirrors.cloud.tencent.com/pypi/simple
apt-get update -qq >/dev/null
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq python3-pip >/dev/null
pip3 install --break-system-packages -q pyslang==11.0.0
python3 -c "import pyslang; print('pyslang', pyslang.__version__)"

cd /work/dft-core
export PY=/usr/bin/python3
export HDL=/work/dft-core/build-linux/hdl

for t in tiny iface tie; do
  ORACLE=/work/oracle/tools/hierarchy_daemon.py python3 test/diff/daemon_diff.py test/rtl/$t \
    && echo "daemon_diff_$t OK" || { echo "daemon_diff_$t FAIL"; exit 1; }
done

ORACLE=/work/oracle/tools/dump_hierarchy.py bash test/diff/run_diff.sh test/rtl/tiny \
  && echo "diff_tiny OK" || { echo "diff_tiny FAIL"; exit 1; }

GENCONN=/work/dft-core/build-linux/genconn ORACLE_DIR=/work/oracle/newProject \
  bash test/diff/genconn_slang_inject.sh /work/dft-core/test/rtl/inject_edge \
  && echo "genconn_slang_inject OK" || { echo "genconn_slang_inject FAIL"; exit 1; }

echo "VERIFY-OK"
