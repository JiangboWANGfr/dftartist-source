import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const fs = require("node:fs"),
  z = require("node:zlib"),
  c = require("node:crypto"),
  cp = require("node:child_process");
const file = "docs/m5_b_tree_view_full.json",
  bytes = fs.readFileSync(file),
  e = JSON.parse(bytes),
  sha = (b) => c.createHash("sha256").update(b).digest("hex");
let raw = 0,
  gzip = 0;
const names = new Set();
for (const r of e.captures) {
  if (names.has(r.name)) throw Error("Duplicate " + r.name);
  names.add(r.name);
  const compressed = Buffer.from(r.stdout_gzip_base64, "base64"),
    b = z.gunzipSync(compressed);
  if (
    b.length !== r.stdout_bytes ||
    sha(b) !== r.stdout_sha256 ||
    r.capture_complete !== true ||
    r.expected_exit_code !== r.exit_code
  )
    throw Error("Bad output " + r.name);
  raw += b.length;
  gzip += compressed.length;
}
for (const s of e.source_hashes) {
  const b = cp.execFileSync("git", ["show", s.commit + ":" + s.path]);
  if (b.length !== s.bytes || sha(b) !== s.sha256)
    throw Error("Bad source " + s.path);
  if (s.kind !== "plan-freeze-snapshot" && !fs.readFileSync(s.path).equals(b))
    throw Error("Frozen source edited " + s.path);
}
if (raw !== e.capture_summary.raw_bytes) throw Error("Raw sum");
console.log(
  JSON.stringify({
    evidenceSha: sha(bytes),
    evidenceBytes: bytes.length,
    captures: e.captures.length,
    sourceHashes: e.source_hashes.length,
    rawBytes: raw,
    gzipBytes: gzip,
    knownExit1: e.captures.filter((r) => r.exit_code === 1).map((r) => r.name),
    allOutputsAndGitSourcesVerified: true,
  }),
);
