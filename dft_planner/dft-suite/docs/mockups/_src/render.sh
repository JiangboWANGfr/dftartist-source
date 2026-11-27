#!/usr/bin/env bash
# Regenerate dft-suite UI mockups (PNG + PDF) from the HTML sources.
# Uses headless Chrome. Run: bash _src/render.sh   (from docs/mockups/)
set -u
SRC="$(cd "$(dirname "$0")" && pwd)"
OUT="$(cd "$SRC/.." && pwd)"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
SCREENS="00-overview 01-hierarchy 02-genconn"

# 1. light variants = dark HTML + class="light" on <html>
for f in $SCREENS; do
  sed 's/<html lang="zh">/<html lang="zh" class="light">/' "$SRC/$f.html" > "$SRC/$f-light.html"
done

# 2. screenshots @2x (Chrome writes the file then hangs on exit → harvest + kill)
shoot(){ "$CHROME" --headless=old --disable-gpu --hide-scrollbars --no-sandbox --no-first-run \
  --no-default-browser-check --allow-file-access-from-files --force-device-scale-factor=2 \
  --window-size=1440,900 --user-data-dir="$(mktemp -d)" --screenshot="$2" "$1" >/dev/null 2>&1 & }
for f in $SCREENS; do shoot "$SRC/$f.html" "$OUT/$f.png"; shoot "$SRC/$f-light.html" "$OUT/$f-light.png"; done
for i in $(seq 1 45); do ok=1; for f in $SCREENS; do [ -s "$OUT/$f.png" ] && [ -s "$OUT/$f-light.png" ] || ok=0; done; [ $ok = 1 ] && { sleep 2; break; }; sleep 1; done
pkill -f "Google Chrome.*--headless" 2>/dev/null; sleep 1

# 3. combined PDFs (one per theme)
pdf(){ "$CHROME" --headless=old --disable-gpu --no-sandbox --no-first-run --no-default-browser-check \
  --allow-file-access-from-files --user-data-dir="$(mktemp -d)" --print-to-pdf="$2" "$1" >/dev/null 2>&1 & }
pdf "$SRC/deck-dark.html"  "$OUT/dft-suite-mockups-dark.pdf"
pdf "$SRC/deck-light.html" "$OUT/dft-suite-mockups-light.pdf"
for i in $(seq 1 30); do [ -s "$OUT/dft-suite-mockups-dark.pdf" ] && [ -s "$OUT/dft-suite-mockups-light.pdf" ] && { sleep 2; break; }; sleep 1; done
pkill -f "Google Chrome.*--headless" 2>/dev/null
echo "done → $OUT"
