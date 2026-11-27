import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const coverage = JSON.parse(
  await fs.readFile(new URL("./coverage.json", import.meta.url), "utf8"),
);
const manifest = JSON.parse(
  execFileSync(
    process.execPath,
    [fileURLToPath(new URL("./run.mjs", import.meta.url)), "--list"],
    { encoding: "utf8" },
  ),
);
const rows = coverage.groups.flatMap((g) => g.rows),
  ids = rows.map((r) => r.id);
assert.equal(rows.length, 95);
assert.equal(new Set(ids).size, 95);
assert.equal(manifest.count, manifest.cases.length);
assert.equal(manifest.c76, 24);
assert.equal(coverage.executableCases, manifest.count);
assert.equal(coverage.general, manifest.general);
assert.equal(coverage.core, manifest.core);
assert.equal(coverage.productionSemanticsExecuted, 0);
for (const c of manifest.cases) {
  assert.ok(c.input && c.expected && c.basis);
  assert.ok(c.covers.length > 0);
  for (const id of c.covers) {
    const condition = rows.find((r) => r.id === id);
    assert.ok(condition, "unknown condition " + id);
    assert.ok(
      condition.automatedCases.includes(c.id),
      "case mapping missing " + c.id + " -> " + id,
    );
  }
}
for (const r of rows) {
  assert.ok(r.input && r.expected);
  for (const id of r.automatedCases) {
    const c = manifest.cases.find((c) => c.id === id);
    assert.ok(c, "missing case " + id);
    assert.ok(c.covers.includes(r.id));
  }
  assert.ok(
    r.automatedCases.length ||
      (r.automated ?? []).length ||
      (r.manual ?? []).length ||
      (r.deferred ?? []).length,
  );
}
const manual = await fs.readFile(
  new URL("./assistive-technology.md", import.meta.url),
  "utf8",
);
for (let i = 1; i <= 8; i++) assert.ok(manual.includes("AT-0" + i));
const raw = rows.find((r) => r.id === "L02");
assert.ok(raw.limitations.some((s) => s.includes("未验证")));
for (const id of ["L09", "L10", "L11"])
  assert.ok(
    rows
      .find((r) => r.id === id)
      .limitations.some((s) => s.includes("C-77") && s.includes("未验证")),
  );
for (const c of manifest.cases.filter((c) => c.id.startsWith("C76-13")))
  assert.ok(
    c.limitations.some((s) => s.includes("C-77") && s.includes("unverified")),
  );
assert.ok(rows.find((r) => r.id === "R03").deferred.length);
console.log(
  JSON.stringify(
    {
      conditions: 95,
      executableCases: manifest.count,
      c76: manifest.c76,
      general: manifest.general,
      realCoreUI: manifest.core,
      browserAssociatedConditions: rows.filter((r) => r.automatedCases.length)
        .length,
      otherGates: rows.filter((r) => !r.automatedCases.length).map((r) => r.id),
      manualSteps: 8,
      rawCommandFaultAdapter: "pending C; not executed",
      allInputsAndExpectationsPresent: true,
    },
    null,
    2,
  ),
);
