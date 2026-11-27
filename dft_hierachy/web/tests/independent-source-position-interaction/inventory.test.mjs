import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { cases, text } from "./cases.mjs";
test("B SPI inventory: IDs, explicit inputs/expectations/normative basis", () => {
  assert.equal(new Set(cases.map((c) => c.id)).size, cases.length);
  assert.equal(cases.length, 119);
  assert.equal(text.length, 18);
  for (const c of cases) {
    assert.ok(c.id.startsWith("B-SPI-"));
    assert.ok(c.group && c.input && c.expected && c.basis);
    assert.ok(Object.isFrozen(c));
  }
});
test("B SPI inventory separates real input, controlled DOM and actual-model/controlled-Transport", () => {
  assert.equal(cases.filter((c) => c.group.startsWith("trusted-")).length, 5);
  assert.equal(cases.filter((c) => c.group === "model").length, 4);
  for (const id of [
    "key-CRLF-interior",
    "key-surrogate-interior",
    "feedback-sync-unmount",
    "feedback-uncommitted-config",
    "feedback-latest-action",
    "feedback-function-thenable",
  ])
    assert.ok(
      cases.some((c) => c.id === "B-SPI-" + id),
      id,
    );
});
test("B SPI host imports public production exports, no contract/A implementation substitute", () => {
  const s = fs.readFileSync(new URL("./fixture.jsx", import.meta.url), "utf8");
  assert.match(s, /from ["']@hier\/views["']/);
  assert.match(s, /from ["']@hier\/viewmodel["']/);
  assert.ok(!s.includes("/contracts/") && !s.includes("/src/"));
  const n = fs.readFileSync(
    new URL("./native-controls.mjs", import.meta.url),
    "utf8",
  );
  assert.ok(
    !n.includes('from "@hier/views"') && !n.includes('from "@hier/viewmodel"'),
  );
});
