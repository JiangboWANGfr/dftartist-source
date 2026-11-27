#!/bin/bash
# WSL node is v20 (no --experimental-strip-types), so bundle each .ts test with the repo's
# rolldown first, then run it under node --test.
cd "$(dirname "$0")/.."
rc=0
for f in tests/unit/*.test.ts; do
  n=$(basename "$f" .test.ts)
  # Emit the bundle NEXT TO the source: several tests resolve fixtures with
  # `new URL("../../src/...", import.meta.url)`, which breaks if the bundle moves to /tmp.
  out="tests/unit/.run-$n.mjs"
  # --platform node: emit `import` for externals. Without it rolldown emits require(), which
  # does not exist in an .mjs and made every test that pulls in node:path/url fail to load.
  if ! node_modules/.bin/rolldown "$f" --platform node \
        --external node:test --external node:assert/strict --external node:fs \
        --external node:path --external node:url --external node:os \
        --file "$out" --format esm >/dev/null 2>&1; then
    echo "BUNDLE FAIL  $n"; rc=1; continue
  fi
  res=$(node --test "$out" 2>&1)
  p=$(printf '%s\n' "$res" | sed -n 's/^# pass \(.*\)/\1/p')
  fa=$(printf '%s\n' "$res" | sed -n 's/^# fail \(.*\)/\1/p')
  printf '%-22s pass=%-4s fail=%s\n' "$n" "${p:-?}" "${fa:-?}"
  if [ "${fa:-1}" != "0" ]; then
    rc=1
    printf '%s\n' "$res" | grep -E "not ok|AssertionError|expected|actual" | head -12
  fi
  rm -f "$out"
done
exit $rc
