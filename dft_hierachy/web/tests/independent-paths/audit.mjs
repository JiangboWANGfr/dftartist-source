// B8 byte-only provenance: never interprets product implementation as an oracle.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const own = path.resolve(import.meta.dirname, "../../.."),
  product = path.resolve(process.env.HIER_B_PRODUCT_ROOT),
  main = path.resolve(process.env.HIER_B_MAIN_ROOT);
const fixed = "bd1ea29b585f91b9d8e06ed2b5bd0e74311af61e",
  base = "dc3f208a9e9e8816892eb8f2ece0719f3e6a8acc";
const gitRaw = (root, ...args) =>
  execFileSync("git", args, { cwd: root, maxBuffer: 16 * 1024 * 1024 });
const git = (root, ...args) =>
  gitRaw(root, ...args)
    .toString()
    .trimEnd();
const sha = (b) => createHash("sha256").update(b).digest("hex");
export const targets = [
  "web/tests/independent-tree/diagnostic-callable.probe.mjs",
  "web/tests/independent-tree/diagnostic-read-followups.test.mjs",
  "web/tests/independent-tree/diagnostic-task-boundaries.probe.mjs",
  "web/tests/independent-properties/core.mjs",
  "web/tests/independent-properties/cases.mjs",
  "web/tests/independent-properties/core-runtime.mjs",
];
function verify(root, rev, exclude = []) {
  const pins = git(root, "ls-tree", "-rz", rev)
    .split("\0")
    .filter(Boolean)
    .map((l) => {
      const at = l.indexOf("\t"),
        [mode, , oid] = l.slice(0, at).split(" ");
      return { mode, oid, file: l.slice(at + 1) };
    })
    .filter((r) => !exclude.includes(r.file))
    .map((r) => {
      const b =
        r.mode === "120000"
          ? Buffer.from(fs.readlinkSync(path.join(root, r.file)))
          : fs.readFileSync(path.join(root, r.file));
      assert.equal(
        createHash("sha1")
          .update(Buffer.from(`blob ${b.length}\0`))
          .update(b)
          .digest("hex"),
        r.oid,
        r.file,
      );
      return { path: r.file, bytes: b.length, sha256: sha(b) };
    });
  return {
    files: pins.length,
    fingerprint: sha(Buffer.from(JSON.stringify(pins))),
  };
}
for (const root of [product, main])
  assert.equal(git(root, "rev-parse", "HEAD"), fixed);
const final = process.argv.includes("--final");
const result = {
  kind: "B8-metadata-and-necessary-test-path-adaptation-NOT-product-semantics",
  fixed,
  base,
  final,
  mainTracked: verify(main, fixed, ["docs/REVIEW_LOG.md"]),
  productOriginalExceptTargets: verify(product, fixed, targets),
  ownOriginalExceptTargets: verify(own, base, targets),
  targetPins: [],
  imports: [],
};
for (const file of targets) {
  const original = gitRaw(own, "show", base + ":" + file).toString();
  assert.deepEqual(
    gitRaw(product, "show", fixed + ":" + file),
    Buffer.from(original),
  );
  let expected = original;
  if (file.includes("independent-tree/")) {
    expected = expected.replace(
      'import { spawnSync } from "node:child_process";',
      'import { spawnSync } from "node:child_process";\nimport { fileURLToPath } from "node:url";',
    );
    expected = expected.replace(
      /const runner = new URL\((".*"), import.meta.url\)\n  \.pathname;/,
      "const runner = fileURLToPath(new URL($1, import.meta.url));",
    );
  } else if (file.endsWith("/core.mjs")) {
    expected = expected.replace(
      'import { pathToFileURL } from "node:url";',
      'import { fileURLToPath, pathToFileURL } from "node:url";',
    );
    expected = expected.replace(
      'new URL("./b_instance_properties.sv", import.meta.url)\n  .pathname',
      'fileURLToPath(new URL("./b_instance_properties.sv", import.meta.url))',
    );
  } else if (file.endsWith("/cases.mjs")) {
    expected = expected.replace(
      'import { spawnSync } from "node:child_process";',
      'import { spawnSync } from "node:child_process";\nimport { fileURLToPath } from "node:url";',
    );
    expected = expected.replace(
      'new URL("./unhandled-worker.mjs", import.meta.url).pathname',
      'fileURLToPath(new URL("./unhandled-worker.mjs", import.meta.url))',
    );
  } else {
    expected = expected.replace(
      'import assert from "node:assert/strict";',
      'import assert from "node:assert/strict";\nimport { fileURLToPath } from "node:url";',
    );
    expected = expected.replace(
      "new URL(import.meta.url).pathname === process.argv[1]",
      "fileURLToPath(import.meta.url) === process.argv[1]",
    );
  }
  assert.notEqual(expected, original);
  const formatted = execFileSync(
    "/opt/homebrew/bin/prettier",
    ["--parser", "babel"],
    { input: expected },
  );
  const old = Buffer.from(original),
    b = fs.readFileSync(path.join(own, file)),
    p = fs.readFileSync(path.join(product, file));
  assert.ok(
    b.equals(old) || b.equals(formatted),
    file + ": own exact original/adaptation only",
  );
  assert.ok(
    p.equals(old) || p.equals(formatted),
    file + ": product exact original/adaptation only",
  );
  if (final) {
    assert.deepEqual(b, formatted, file);
    assert.deepEqual(p, formatted, file);
  }
  result.targetPins.push({
    path: file,
    original: { bytes: old.length, sha256: sha(old) },
    corrected: { bytes: formatted.length, sha256: sha(formatted) },
    ownUsesCorrected: b.equals(formatted),
    productUsesCorrected: p.equals(formatted),
  });
}
const changes = git(product, "diff", "--name-only")
  .split("\n")
  .filter(Boolean)
  .sort();
assert.deepEqual(changes, final ? [...targets].sort() : []);
result.productChangedPaths = changes;
const imports = [
  [
    "4f974fb9bf4b948ce779c4570802a726c30daef9",
    "773589669db902c92ac867027168ebefcffa4e07",
  ],
  [
    "d63a16361d620410ba46af18c4d23c9bfc9bd005",
    "bd4fb838ef90d02d93deb25ebd965a3bbc3718fa",
  ],
  [
    "e65a0329b190ab3228d40f6ef1aa7adca6df0689",
    "13322443788df7af065edc035d24d22e99dbf096",
  ],
  [
    "82b753148173b39cd4097832f5924575b5f880a8",
    "922f1b1b3643a400d185dab6f6270dd7bc8f008b",
  ],
  [
    "dc3f208a9e9e8816892eb8f2ece0719f3e6a8acc",
    "c983e189fa76c83789308e70be0b9607de67bb41",
  ],
];
const imported = new Set();
for (const [b, a] of imports) {
  const x = gitRaw(own, "diff", "--binary", "--full-index", b + "^", b),
    y = gitRaw(product, "diff", "--binary", "--full-index", a + "^", a);
  assert.deepEqual(y, x);
  result.imports.push({ b, a, bytes: x.length, sha256: sha(x) });
  git(own, "diff-tree", "--no-commit-id", "--name-only", "-r", b)
    .split("\n")
    .filter(Boolean)
    .forEach((f) => imported.add(f));
}
assert.equal(imported.size, 13);
result.importPins = [...imported].sort().map((file) => {
  const b = fs.readFileSync(path.join(product, file));
  assert.deepEqual(b, gitRaw(own, "show", base + ":" + file));
  return { path: file, bytes: b.length, sha256: sha(b) };
});
result.nativeTrees = {};
for (const dir of ["core", "protocol"]) {
  const h = git(product, "rev-parse", fixed + ":" + dir);
  assert.equal(
    h,
    git(
      product,
      "rev-parse",
      "e4ba060767a3a53d19198b0214ca1f7d1690cc49:" + dir,
    ),
  );
  result.nativeTrees[dir] = h;
}
assert.deepEqual(
  git(
    product,
    "diff-tree",
    "--no-commit-id",
    "--name-only",
    "-r",
    "e4ba060767a3a53d19198b0214ca1f7d1690cc49",
    fixed,
    "--",
    "web/packages",
  )
    .split("\n")
    .filter(Boolean),
  ["web/packages/client/README.md"],
);
const log = fs.readFileSync(path.join(main, "docs/REVIEW_LOG.md")),
  n = Number(process.env.HIER_B_LOG_PREFIX_BYTES);
assert.equal(sha(log.subarray(0, n)), process.env.HIER_B_LOG_PREFIX_SHA256);
result.log = {
  bytes: log.length,
  sha256: sha(log),
  prefixBytes: n,
  prefixSha256: process.env.HIER_B_LOG_PREFIX_SHA256,
  preserved: true,
};
result.untracked = git(main, "ls-files", "--others", "--exclude-standard", "-z")
  .split("\0")
  .filter(Boolean)
  .map((file) => {
    const b = fs.readFileSync(path.join(main, file));
    return { path: file, bytes: b.length, sha256: sha(b) };
  });
assert.equal(
  sha(fs.readFileSync(path.join(product, "docs/DESIGN.md"))),
  "75e20f5b0637515f103c1cfdf508db227c155570c58baded3ec0de17011788a5",
);
console.log(JSON.stringify(result, null, 2));
