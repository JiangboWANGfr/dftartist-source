import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProject, serializeProject, type DftProject } from "../../src/store/projectFile.ts";

const P: DftProject = { version: 1, filelist: "/d/chip_top.f", top: "chip_top", outputDir: "/d/out", genconnDoc: "chip_top.genconn.json", specgenWorkspace: null, padCfg: null, scanPlan: "Spec/scan/chip_top.scanplan.json" };

test("serialize→parse 往返一致", () => {
  assert.deepEqual(parseProject(serializeProject(P)), P);
});
test("parse 容错:缺可选字段补 null", () => {
  const p = parseProject(JSON.stringify({ version: 1, filelist: "/a.f", top: "a", outputDir: "/o" }));
  assert.equal(p.genconnDoc, null); assert.equal(p.filelist, "/a.f");
});
test("parse 非法 JSON 抛错", () => {
  assert.throws(() => parseProject("{not json"));
});
test("parse 缺必填 filelist 抛错", () => {
  assert.throws(() => parseProject(JSON.stringify({ version: 1, top: "a", outputDir: "/o" })));
});
