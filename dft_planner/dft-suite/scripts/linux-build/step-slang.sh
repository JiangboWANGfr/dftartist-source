#!/usr/bin/env bash
# 容器内：从源码构建 slang v10.0.101（对齐 dft-core vendored 版本）→ /work/opt/slang-10.0.101
set -euo pipefail

# 服务器连不上 github：slang 源码经 Mac 打成 bundle 传入 /work/slang.bundle
if [ ! -d /work/slang-src/.git ]; then
  git clone -q /work/slang.bundle /work/slang-src
fi
cd /work/slang-src

git rev-parse -q --verify "v10.0^{commit}" >/dev/null || { echo "FATAL: tag v10.0 不存在"; git tag -l | head; exit 1; }

# 10.0.101 = v10.0 之后第 101 个 commit（slang 的 patch 号 = tag 后 commit 计数）
TARGET=""
for c in $(git rev-list --reverse v10.0..origin/master); do
  if [ "$(git rev-list --count v10.0..$c)" -eq 101 ]; then TARGET=$c; break; fi
done
[ -n "$TARGET" ] || { echo "FATAL: 找不到 v10.0+101 的 commit"; exit 1; }
git checkout -q "$TARGET"
echo "slang commit: $(git log --oneline -1)"
echo "describe: $(git describe --tags)"

cmake -S . -B build -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DSLANG_INCLUDE_TESTS=OFF -DSLANG_INCLUDE_TOOLS=OFF \
  -DCMAKE_INSTALL_PREFIX=/work/opt/slang-10.0.101 >/work/logs/slang-cmake.log 2>&1
ninja -C build -j2 >/work/logs/slang-ninja.log 2>&1
ninja -C build install >/work/logs/slang-install.log 2>&1

# ninja install 不装 external 单头(BS_thread_pool.hpp 等)，但 slang 的 analysis 头 include 它们——
# 手工补进安装目录(dft-core 的 vendored 目录当初也是这么做的)。
cp external/*.hpp /work/opt/slang-10.0.101/include/
echo "SLANG-BUILD-OK"
ls /work/opt/slang-10.0.101/lib
