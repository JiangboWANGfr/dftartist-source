#!/usr/bin/env bash
# Byte-exact golden: pad gen on the mini fixture vs frozen expectation.
# usage: pad_golden.sh <fixtures/pad dir> <rtl/pad dir>
set -euo pipefail
PAD=${PAD:?}
FIX=$1
RTL=$2

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

"$PAD" gen -f "$RTL/mini_chip.f" --lib "$FIX/mini.tcelllib" \
       --config "$FIX/mini_overlay.json" --level phy --aux external > "$tmp/got.txt" 2>/dev/null

diff "$FIX/mini_gen.golden" "$tmp/got.txt" && echo "MATCH — pad gen byte-identical"
