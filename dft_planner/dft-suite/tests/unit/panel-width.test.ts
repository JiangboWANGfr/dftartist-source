import { test } from "node:test";
import assert from "node:assert/strict";
import { clampPanelWidth, PANEL_W_MIN, PANEL_W_MAX, PANEL_W_DEFAULT } from "../../src/common/inspector/panelWidth.ts";

test("clampPanelWidth 夹在 [MIN, MAX]", () => {
  assert.equal(clampPanelWidth(10), PANEL_W_MIN);
  assert.equal(clampPanelWidth(9999), PANEL_W_MAX);
  assert.equal(clampPanelWidth(320), 320);
});
test("clampPanelWidth 非有限值回退默认", () => {
  assert.equal(clampPanelWidth(NaN), PANEL_W_DEFAULT);
  assert.equal(clampPanelWidth(0), PANEL_W_DEFAULT);
});
