import { test } from "node:test"; import assert from "node:assert/strict";
import { parseFileMarkers } from "../../electron/cli.cjs";

test("two-file marker string splits into two entries", () => {
  const raw = "===FILE:a/one.txt===\nline A1\nline A2\n===FILE:b/two.txt===\nline B1\n";
  const files = parseFileMarkers(raw);
  assert.equal(files.length, 2, "must have 2 entries");
  assert.equal(files[0].name, "a/one.txt");
  assert.equal(files[1].name, "b/two.txt");
  assert.ok(files[0].text.includes("line A1"), "first file must contain line A1");
  assert.ok(files[0].text.includes("line A2"), "first file must contain line A2");
  assert.ok(!files[0].text.includes("line B1"), "first file must NOT contain line B1");
  assert.ok(!files[0].text.includes("===FILE:b/two.txt==="), "first file must NOT contain second marker");
  assert.ok(files[1].text.includes("line B1"), "second file must contain line B1");
});

test("single-file marker string yields one entry with correct name and text", () => {
  const raw = "===FILE:out/chip.v===\nmodule chip();\nendmodule\n";
  const files = parseFileMarkers(raw);
  assert.equal(files.length, 1, "must have 1 entry");
  assert.equal(files[0].name, "out/chip.v");
  assert.ok(files[0].text.includes("module chip();"), "text must contain module body");
});
