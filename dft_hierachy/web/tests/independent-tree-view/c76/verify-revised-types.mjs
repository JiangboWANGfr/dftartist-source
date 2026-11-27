// B type/build adaptation: copy original frozen consumer and verifier unchanged.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
const base = path.resolve(import.meta.dirname, "..");
const revised = path.join(import.meta.dirname, "proposal.d.ts");
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "hier-b-c76-types-"));
const digest = (data) => createHash("sha256").update(data).digest("hex");
const inputs = [
  ["view-types.ts", path.join(base, "view-types.ts")],
  ["verify-tree-view-types.mjs", path.join(base, "verify-tree-view-types.mjs")],
  ["proposal.d.ts", revised],
];
const manifest = inputs.map(([name, file]) => {
  const bytes = fs.readFileSync(file);
  fs.copyFileSync(file, path.join(workspace, name));
  return { name, source: file, bytes: bytes.length, sha256: digest(bytes) };
});
fs.writeFileSync(
  path.join(workspace, "package.json"),
  JSON.stringify({ type: "module", private: true }),
);
const child = spawnSync(
  process.execPath,
  [path.join(workspace, "verify-tree-view-types.mjs"), "proposal"],
  {
    env: {
      ...process.env,
      HIER_B_PRODUCT_ROOT:
        process.env.HIER_B_PRODUCT_ROOT ?? path.resolve(base, "../../.."),
    },
    encoding: "utf8",
    timeout: 30000,
    maxBuffer: 8 * 1024 * 1024,
  },
);
for (const item of manifest) {
  assert.equal(digest(fs.readFileSync(item.source)), item.sha256);
  assert.equal(
    digest(fs.readFileSync(path.join(workspace, item.name))),
    item.sha256,
  );
}
assert.equal(child.error, undefined, "compiler watchdog, not SLA");
assert.equal(child.signal, null);
let diagnostics;
try {
  diagnostics = JSON.parse(child.stdout);
} catch {
  diagnostics = { stdout: child.stdout };
}
console.log(
  JSON.stringify(
    {
      adaptation:
        "only proposal.d.ts is the revised public declaration; old consumer/verifier bytes unchanged",
      workspace,
      retainedForEvidence: true,
      manifest,
      childStatus: child.status,
      diagnostics,
      stderr: child.stderr,
    },
    null,
    2,
  ),
);
process.exitCode = child.status ?? 1;
