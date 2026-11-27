#!/usr/bin/env bash
# 容器内无头冒烟：内核二进制真跑 + AppImage 解包验 arch + xvfb 起 GUI 走 CLI 参数链路验 .dftproj 落盘
set -euo pipefail
echo "--- 1) hdl dump fixture:"
/work/out/bin/hdl dump /work/dft-suite/tests/fixtures/soc.f | head -c 300; echo

echo "--- 2) AppImage 解包验内容:"
AI=$(ls /work/dft-suite/release/*.AppImage | head -1)
rm -rf /tmp/appx && mkdir /tmp/appx && cd /tmp/appx
"$AI" --appimage-extract >/dev/null
file squashfs-root/resources/bin/hdl squashfs-root/dft-suite

echo "--- 3) xvfb 启动 + CLI 参数链路:"
rm -rf /tmp/smoke
xvfb-run -a ./squashfs-root/AppRun --no-sandbox \
  --projectpath /tmp/smoke --harden h1 \
  --filelist /work/dft-suite/tests/fixtures/soc.f >/work/logs/smoke.log 2>&1 &
PID=$!
OK=0
for i in $(seq 1 30); do
  [ -f /tmp/smoke/h1/soc.planner.dftproj ] && { OK=1; break; }
  sleep 2
done
kill $PID 2>/dev/null || true
sleep 1
if [ "$OK" = 1 ]; then
  echo "SMOKE-OK"; cat /tmp/smoke/h1/soc.planner.dftproj
else
  echo "SMOKE-FAIL"; tail -40 /work/logs/smoke.log; exit 1
fi
