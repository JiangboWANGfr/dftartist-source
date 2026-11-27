#!/usr/bin/env bash
set -euo pipefail
SRC="${DFT_CORE_DIR:-../dft-core}/specgen-core/datapath.schema.json"
DST="src/specgen/schema/datapath.schema.json"
mkdir -p src/specgen/schema
cp "$SRC" "$DST"
echo "synced schema -> $DST ($(wc -c <"$DST") bytes)"

BSCAN_SRC="${DFT_CORE_DIR:-../dft-core}/specgen-core/bscan.schema.json"
BSCAN_DST="src/specgen/schema/bscan.schema.json"
cp "$BSCAN_SRC" "$BSCAN_DST"
echo "synced schema -> $BSCAN_DST ($(wc -c <"$BSCAN_DST") bytes)"
