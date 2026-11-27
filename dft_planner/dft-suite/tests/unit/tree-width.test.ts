import { test } from "node:test";
import assert from "node:assert/strict";
import { clampTreeWidth, TREE_W_MIN, TREE_W_MAX, TREE_W_DEFAULT } from "../../src/hierarchy/treeWidth.ts";

test("clampTreeWidth 夹在 [MIN, MAX]", () => {
  assert.equal(clampTreeWidth(10), TREE_W_MIN);
  assert.equal(clampTreeWidth(9999), TREE_W_MAX);
  assert.equal(clampTreeWidth(300), 300);
});

test("clampTreeWidth 非有限值回退默认", () => {
  assert.equal(clampTreeWidth(NaN), TREE_W_DEFAULT);
  assert.equal(clampTreeWidth(0), TREE_W_DEFAULT);
});
