import { test } from "node:test";
import assert from "node:assert/strict";
import { useStore } from "../../src/genconn/store.ts";
import { addToSpecgen, syncDesignInstances } from "../../src/specgen/edit.ts";
import type { GenConnDocument, HardenDef } from "../../src/genconn/core/model.ts";

function docWithChild(): GenConnDocument {
  const pb: HardenDef = {
    id: "pbdef", designName: "core", designLevel: "physical_block", designType: "hierarchical",
    interfaces: [], childInstances: [], connections: [],
  };
  const root: HardenDef = {
    id: "p", designName: "p", designLevel: "chip", designType: "hierarchical",
    interfaces: [], childInstances: [{ id: "ci1", instanceName: "core_inst", hardenId: "pbdef" }], connections: [],
  };
  return {
    schemaVersion: 1, library: { defs: [root, pb] }, ui: { openDefId: "p", rootDefId: "p" },
    ctrlIps: [], dfxInstances: [], moduleDsNext: 1, muxDsNext: 1,
  };
}

// #3 回归：SpecGen 工作区未挂载时，在 genconn 删子实例，deleteInstance 应立即清掉对应自动 DesignInstance，
// 而不是等切回 SpecGen 才由其 useEffect sync。
test("deleteInstance：删子实例立即清掉对应 DesignInstance（不必切回 SpecGen）", () => {
  let doc = addToSpecgen(docWithChild(), "p");
  doc = syncDesignInstances(doc, "p");
  const top0 = doc.library.defs.find((d) => d.id === "p")!;
  assert.equal((top0.dftIps ?? []).length, 1, "前置：已同步出 1 个 DesignInstance");

  useStore.setState({ doc });
  useStore.getState().deleteInstance("ci1");

  const top = useStore.getState().doc.library.defs.find((d) => d.id === "p")!;
  assert.equal(top.childInstances.length, 0, "子实例已删");
  assert.equal((top.dftIps ?? []).length, 0, "对应 DesignInstance 应被立即清掉（回归 #3）");
});
