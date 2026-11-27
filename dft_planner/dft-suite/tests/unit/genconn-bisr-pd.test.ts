import { test } from "node:test";
import assert from "node:assert/strict";
import type { GenConnDocument, HardenDef } from "../../src/genconn/core/model.ts";
import { applyBisrMatchOnly } from "../../src/genconn/wire.ts";

function bisrDoc(): GenConnDocument {
  const SRC: HardenDef = {
    id: "SRC", designName: "SRC", designLevel: "sub_block", designType: "tiling",
    interfaces: [
      { id: "srcDs", busType: "BISR", role: "client", isDataSource: true },
      { id: "srcSecA", busType: "BISR", role: "secondary", interfaceName: "a" },
      { id: "srcSecB", busType: "BISR", role: "secondary", interfaceName: "b" },
    ], childInstances: [], connections: [],
  };
  const DN1: HardenDef = {
    id: "DN1", designName: "DN1", designLevel: "sub_block", designType: "tiling",
    interfaces: [{ id: "dn1a", busType: "BISR", role: "client" }, { id: "dn1b", busType: "BISR", role: "client" }],
    childInstances: [], connections: [],
  };
  const DN2: HardenDef = {
    id: "DN2", designName: "DN2", designLevel: "sub_block", designType: "tiling",
    interfaces: [{ id: "dn2c", busType: "BISR", role: "client" }], childInstances: [], connections: [],
  };
  const T: HardenDef = {
    id: "T", designName: "T", designLevel: "chip", designType: "hierarchical", interfaces: [],
    childInstances: [
      { id: "src", instanceName: "src", hardenId: "SRC" },
      { id: "dn1", instanceName: "dn1", hardenId: "DN1" },
      { id: "dn2", instanceName: "dn2", hardenId: "DN2" },
    ],
    connections: [
      { id: "c1", secondaryInstanceId: "src", secondaryInterfaceId: "srcSecA", clientInstanceId: "dn1", clientInterfaceId: "dn1a", manual: true },
      { id: "c2", secondaryInstanceId: "src", secondaryInterfaceId: "srcSecB", clientInstanceId: "dn1", clientInterfaceId: "dn1b", manual: true },
      { id: "c3", secondaryInstanceId: "src", secondaryInterfaceId: "srcSecA", clientInstanceId: "dn2", clientInterfaceId: "dn2c", manual: true },
    ],
    wires: [
      { id: "w1", busType: "BISR", pd: "pdA", sourceInstanceId: "src", sourceInterfaceId: "srcDs", points: [], connectionIds: ["c1"] },
      { id: "w2", busType: "BISR", pd: "pdB", sourceInstanceId: "src", sourceInterfaceId: "srcDs", points: [], connectionIds: ["c2"] },
      { id: "w3", busType: "BISR", pd: "pdA", sourceInstanceId: "src", sourceInterfaceId: "srcDs", points: [], connectionIds: ["c3"] },
    ],
  };
  return { schemaVersion: 1, library: { defs: [T, SRC, DN1, DN2] }, ui: { openDefId: "T", rootDefId: "T" } } as unknown as GenConnDocument;
}

const ifOf = (doc: GenConnDocument, defId: string, ifId: string) =>
  doc.library.defs.find((d) => d.id === defId)!.interfaces.find((f) => f.id === ifId)!;

test("下游穿 1 个 pd → pdMatchOnly=true（只匹配、端口名干净）", () => {
  const out = applyBisrMatchOnly(bisrDoc());
  assert.equal(ifOf(out, "DN2", "dn2c").pdMatchOnly, true);
});

test("下游穿 ≥2 个 pd → pdMatchOnly=false（进名消歧）", () => {
  const out = applyBisrMatchOnly(bisrDoc());
  assert.equal(ifOf(out, "DN1", "dn1a").pdMatchOnly, false);
  assert.equal(ifOf(out, "DN1", "dn1b").pdMatchOnly, false);
});

test("源实例的 secondary 接口 → pdMatchOnly=false（总进名）", () => {
  const out = applyBisrMatchOnly(bisrDoc());
  assert.equal(ifOf(out, "SRC", "srcSecA").pdMatchOnly, false);
  assert.equal(ifOf(out, "SRC", "srcSecB").pdMatchOnly, false);
});
