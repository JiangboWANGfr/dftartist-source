// B inventory/input checks, never counted as demo product passing.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { cases, regressions, deferred } from "./cases.mjs";
import { fixtures, escapedPath } from "./fixtures.mjs";
test("B73 finite inventory has unique IDs, input/expected/basis/run; deferred needs explicit blocker", () => {
  assert.equal(cases.length, 25);
  assert.equal(regressions.length, 1);
  assert.equal(deferred.length, 4);
  assert.equal(new Set([...cases, ...regressions, ...deferred].map((c) => c.id)).size, 30);
  for (const c of [...cases, ...regressions]) {
    assert(c.input && c.expected && c.basis);
    assert.equal(typeof c.run, "function");
  }
  for (const c of deferred) assert(c.input && c.expected && c.basis && c.reason);
});
test("B73 invalid top fixtures contain actual NUL/CR/LF and escaped path retains terminator/tab", () => {
  const options = cases.find((c) => c.id === "DC02-invalid-options").input.options;
  for (const code of [0, 13, 10])
    assert(
      options.some((o) => typeof o?.top === "string" && o.top.includes(String.fromCharCode(code))),
    );
  assert(escapedPath.includes("\\odd.name "));
  assert(escapedPath.endsWith("\t"));
});
test("B73 relative filelist is canonical, local and distinct from source cwd", () => {
  const f = fixtures();
  assert.equal(f.dir, fs.realpathSync(f.dir));
  const relative = fs.readFileSync(f.filelist, "utf8").trim();
  assert.equal(relative, "../rtl/design.sv");
  assert.equal(path.resolve(path.dirname(f.filelist), relative), f.source);
  assert.notEqual(path.dirname(f.filelist), path.dirname(f.source));
});
