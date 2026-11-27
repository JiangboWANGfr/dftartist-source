import { test } from "node:test";
import assert from "node:assert/strict";
import type { HardenDef } from "../../src/genconn/core/model.ts";
import { addInterface, setDataSource } from "../../src/genconn/core/edit.ts";
import { addWire } from "../../src/genconn/wire.ts";

// 与 genconn-wire.test.ts 的 wireDoc() 同构，但源接口是 BISR data source。
function bisrWireDoc() {
  const mk = (id: string): HardenDef => ({ id, designName: id, designLevel: "sub_block", designType: "tiling", interfaces: [], childInstances: [], connections: [] });
  const S = mk("S"), A = mk("A"), B = mk("B");
  const T: HardenDef = { id: "T", designName: "T", designLevel: "chip", designType: "hierarchical", interfaces: [],
    childInstances: [
      { id: "si", instanceName: "si", hardenId: "S", position: { x: 0, y: 0 } },
      { id: "ai", instanceName: "ai", hardenId: "A", position: { x: 200, y: 0 } },
      { id: "bi", instanceName: "bi", hardenId: "B", position: { x: 400, y: 0 } },
    ], connections: [] };
  let doc: any = { schemaVersion: 1, library: { defs: [T, S, A, B] }, ui: { openDefId: "T", rootDefId: "T" } };
  doc = addInterface(doc, "S", { busType: "BISR", role: "client", isDataSource: true });
  const dsIf = doc.library.defs.find((d: HardenDef) => d.id === "S")!.interfaces.at(-1)!.id;
  doc = setDataSource(doc, "S", dsIf, true);
  return { doc, dsIf };
}

test("addWire(BISR)：生成的 secondary/client 接口都灌 powerDomain=wire.pd（回归 §4a：pd 不进端口名/BISR client 撞键）", () => {
  const { doc, dsIf } = bisrWireDoc();
  const r = addWire(doc, "si", dsIf, [{ x: 60, y: 60 }, { x: 520, y: 60 }], "pdX");
  assert.equal(r.error, undefined, r.error);

  const T = r.doc.library.defs.find((d: HardenDef) => d.id === "T")!;
  assert.ok(T.connections.length >= 1, "应至少生成 1 条连接（回归：未抛异常）");

  const instToDef = (instId: string) => { const inst = T.childInstances.find((i) => i.id === instId)!; return r.doc.library.defs.find((d: HardenDef) => d.id === inst.hardenId)!; };
  for (const c of T.connections) {
    const s = instToDef(c.secondaryInstanceId).interfaces.find((f) => f.id === c.secondaryInterfaceId)!;
    const cl = instToDef(c.clientInstanceId).interfaces.find((f) => f.id === c.clientInterfaceId)!;
    if (c.secondaryInterfaceId !== dsIf) assert.equal(s.powerDomain, "pdX", `secondary ${c.secondaryInstanceId}/${c.secondaryInterfaceId} powerDomain`);
    if (c.clientInterfaceId !== dsIf) assert.equal(cl.powerDomain, "pdX", `client ${c.clientInstanceId}/${c.clientInterfaceId} powerDomain`);
  }
});
