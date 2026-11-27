import { test } from "node:test"; import assert from "node:assert/strict";
import { useDesign } from "../../src/store/design.ts";
test("default workspace is hierarchy and theme dark", () => {
  const s = useDesign.getState();
  assert.equal(s.workspace, "hierarchy"); assert.equal(s.theme, "dark"); assert.equal(s.status, "idle");
});
test("setWorkspace / setTheme mutate state", () => {
  useDesign.getState().setWorkspace("genconn");
  assert.equal(useDesign.getState().workspace, "genconn");
  useDesign.getState().setTheme("light");
  assert.equal(useDesign.getState().theme, "light");
});
