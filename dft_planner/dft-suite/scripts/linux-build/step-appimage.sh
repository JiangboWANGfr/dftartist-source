#!/usr/bin/env bash
# 容器内：npm ci + stage Linux 二进制 + vite build + electron-builder → release/*.AppImage
set -euo pipefail
export PATH=/opt/node/bin:$PATH
export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
export ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
cd /work/dft-suite

npm ci --registry=https://registry.npmmirror.com >/work/logs/npmci.log 2>&1
DFT_CORE_BUILD=/work/dft-core/build-linux bash scripts/stage-bin.sh
file resources/bin/hdl
npm run build >/work/logs/vitebuild.log 2>&1
npx electron-builder --linux AppImage --x64 >/work/logs/ebuilder.log 2>&1
ls -lh release/*.AppImage
echo "APPIMAGE-OK"
