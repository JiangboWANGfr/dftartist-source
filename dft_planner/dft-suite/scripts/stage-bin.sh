#!/usr/bin/env bash
# Copy freshly-built dft-core binaries into resources/bin/ before packaging.
# For a RUNNABLE Linux AppImage these MUST be Linux x64 binaries (build dft-core on Linux first).
set -euo pipefail
SRC="${DFT_CORE_BUILD:-../dft-core/build}"
mkdir -p resources/bin
for b in hdl genconn ctrlgen pad specgen; do
  cp "$SRC/$b" "resources/bin/$b"
  chmod +x "resources/bin/$b"
done
echo "staged: $(ls resources/bin)"
