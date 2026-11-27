#!/usr/bin/env bash
# 容器内：用 Linux slang 构建 dft-core 五个二进制 + ctest → /work/out/bin
set -euo pipefail
cd /work/dft-core

cmake -S . -B build-linux -G Ninja \
  -DSLANG_INSTALL_DIR=/work/opt/slang-10.0.101 >/work/logs/dftcore-cmake.log 2>&1
ninja -C build-linux -j3 >/work/logs/dftcore-ninja.log 2>&1

# 先落产物再跑测试：ctest 里有 5 个差分测试依赖 oracle 环境(见 step-verify.sh)，
# 无 oracle 时会失败，不应挡住产物产出。
mkdir -p /work/out/bin
for b in hdl genconn ctrlgen pad specgen; do
  cp "build-linux/$b" /work/out/bin/
done
file /work/out/bin/*
echo "DFTCORE-BUILD-OK"

ctest --test-dir build-linux --output-on-failure -j2 >/work/logs/dftcore-ctest.log 2>&1 && echo "CTEST-OK" || { echo "CTEST-FAIL(差分测试缺 oracle 环境时属预期,用 step-verify.sh 补验)"; tail -20 /work/logs/dftcore-ctest.log; exit 1; }
