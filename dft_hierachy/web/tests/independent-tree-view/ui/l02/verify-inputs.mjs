// No product imports. This is input inventory/provenance, not UI semantics.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { cases } from "./cases.mjs";
import { rawKinds } from "./public-command-fault.mjs";
assert.equal(cases.length, 48);
assert.equal(new Set(cases.map((c) => c.id)).size, 48);
for (const command of ["select", "loadRoots"])
  for (const kind of rawKinds)
    for (const mode of ["absent", "capture", "throw"])
      assert.equal(
        cases.filter(
          (c) =>
            c.input.command === command &&
            c.input.kind === kind &&
            c.input.mode === mode &&
            !c.input.transition,
        ).length,
        1,
      );
for (const command of ["select", "loadRoots"])
  for (const transition of ["unmount", "replace", "remount"])
    assert.equal(
      cases.filter(
        (c) => c.input.command === command && c.input.transition === transition,
      ).length,
      1,
    );
for (const c of cases) {
  assert.ok(
    c.input &&
      c.expected &&
      c.basis &&
      c.covers.length &&
      typeof c.run === "function",
  );
  assert.ok(
    !c.covers.some((id) =>
      ["L06", "L07", "L08", "L09", "L10", "L11"].includes(id),
    ),
  );
}
const root = path.resolve(import.meta.dirname, "../../../../..");
const baseline = "8efd1cfa742eecaeb35cf5c28e33ce593873f6fd";
const sha = (b) => createHash("sha256").update(b).digest("hex");
const tracked = execFileSync(
  "git",
  ["ls-tree", "-r", "--name-only", "-z", baseline],
  { cwd: root, encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);
for (const file of tracked) {
  const before = execFileSync("git", ["show", baseline + ":" + file], {
    cwd: root,
    maxBuffer: 20 * 1024 * 1024,
  });
  assert.equal(
    sha(fs.readFileSync(path.join(root, file))),
    sha(before),
    "old B file changed: " + file,
  );
}
const oldList = execFileSync(process.execPath, [
  path.join(root, "web/tests/independent-tree-view/ui/run.mjs"),
  "--list",
]);
assert.equal(oldList.length, 42609);
assert.equal(
  sha(oldList),
  "6f2333cf262f6a74e1675780d708bc32bba598850491eb3ade7c1791a7fb832d",
);
console.log(
  JSON.stringify({
    direct: 42,
    late: 6,
    allMetadata: true,
    originalBFilesUnchanged: tracked.length,
    original140Bytes: oldList.length,
    original140SHA256: sha(oldList),
    excludes: [
      "L06 strong observation",
      "L07 original observer AggregateError",
      "L08 cancelled/disposed lifecycle",
      "L09-L11 original Promise consumption",
    ],
    productionCasesExecuted: 0,
  }),
);
