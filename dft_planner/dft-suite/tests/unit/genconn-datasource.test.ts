// Unit test: data-source marking + placement edit fns (setDataSource /
// setInterfacePlacement / setInterfaceInnerPos). Pure core transforms, no
// React / Zustand. Ported from newProject test/edit.test.ts DS cases.

import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyDocument } from "../../src/genconn/core/document.ts";
import { chipDoc } from "../../src/genconn/core/examples/chip.ts";
import { generateAll } from "../../src/genconn/core/generate.ts";
import {
  addBlankHarden,
  addInterface,
  setDataSource,
  setInterfacePlacement,
  setInterfaceInnerPos,
} from "../../src/genconn/core/edit.ts";

/** 一个 harden1（tiling）def + 空文档：DS 编辑的公共起点。 */
function harden1() {
  const doc = addBlankHarden(emptyDocument("chip"));
  const h1 = doc.library.defs.find((d) => d.designName === "harden1")!;
  return { doc, h1 };
}

const ifaceOf = (doc: any, defId: string, ifId: string) =>
  doc.library.defs.find((d: any) => d.id === defId)!.interfaces.find((i: any) => i.id === ifId)!;

const lastIfId = (doc: any, defId: string) =>
  doc.library.defs.find((d: any) => d.id === defId)!.interfaces.at(-1)!.id;

test("setInterfacePlacement：data source client 可设 other（默认 innerPos）；secondary 设 other 报错", () => {
  let { doc, h1 } = harden1();
  doc = addInterface(doc, h1.id, { busType: "SSN", role: "client", isDataSource: true });
  const cliId = lastIfId(doc, h1.id);
  doc = setInterfacePlacement(doc, h1.id, cliId, "other");
  const cli = ifaceOf(doc, h1.id, cliId);
  assert.equal(cli.placement, "other");
  assert.ok(cli.innerPos && typeof cli.innerPos.x === "number");
  assert.deepEqual(cli.innerPos, { x: 40, y: 40 }); // 无 innerPos 时给默认位

  doc = addInterface(doc, h1.id, { busType: "IJTAG", role: "secondary", interfaceName: "s" });
  const secId = lastIfId(doc, h1.id);
  assert.throws(() => setInterfacePlacement(doc, h1.id, secId, "other"), /data source/);
});

test("setInterfacePlacement：切到 other 后再回 pin，保留原 innerPos", () => {
  let { doc, h1 } = harden1();
  doc = addInterface(doc, h1.id, { busType: "SSN", role: "client", isDataSource: true });
  const cliId = lastIfId(doc, h1.id);
  doc = setInterfaceInnerPos(doc, h1.id, cliId, { x: 12, y: 34 });
  doc = setInterfacePlacement(doc, h1.id, cliId, "other");
  assert.deepEqual(ifaceOf(doc, h1.id, cliId).innerPos, { x: 12, y: 34 }); // 已有 innerPos 不被默认位覆盖
  doc = setInterfacePlacement(doc, h1.id, cliId, "pin");
  const cli = ifaceOf(doc, h1.id, cliId);
  assert.equal(cli.placement, "pin");
  assert.deepEqual(cli.innerPos, { x: 12, y: 34 }); // 回 pin 保留位置
});

test("setInterfaceInnerPos：写入 innerPos", () => {
  let { doc, h1 } = harden1();
  doc = addInterface(doc, h1.id, { busType: "SSN", role: "client" });
  const cliId = lastIfId(doc, h1.id);
  doc = setInterfaceInnerPos(doc, h1.id, cliId, { x: 55, y: 66 });
  assert.deepEqual(ifaceOf(doc, h1.id, cliId).innerPos, { x: 55, y: 66 });
});

test("other 收窄：仅 isDataSource 的 client 可 other；普通 client 设 other 报错", () => {
  let { doc, h1 } = harden1();
  doc = addInterface(doc, h1.id, { busType: "SSN", role: "client" });
  const cliId = lastIfId(doc, h1.id);
  assert.throws(() => setInterfacePlacement(doc, h1.id, cliId, "other"), /data source/);
  doc = setDataSource(doc, h1.id, cliId, true);
  doc = setInterfacePlacement(doc, h1.id, cliId, "other");
  assert.equal(ifaceOf(doc, h1.id, cliId).placement, "other");
});

test("setDataSource(false)：取消 data source 时把 other 复位为边上（清 placement）", () => {
  let { doc, h1 } = harden1();
  doc = addInterface(doc, h1.id, { busType: "SSN", role: "client", isDataSource: true });
  const cliId = lastIfId(doc, h1.id);
  doc = setInterfacePlacement(doc, h1.id, cliId, "other");
  doc = setDataSource(doc, h1.id, cliId, false);
  const cli = ifaceOf(doc, h1.id, cliId);
  assert.equal(cli.isDataSource ?? false, false);
  assert.notEqual(cli.placement, "other");
});

test("setDataSource(false)：pin 摆放的 data source 取消后 placement 不受影响", () => {
  let { doc, h1 } = harden1();
  doc = addInterface(doc, h1.id, { busType: "SSN", role: "client", isDataSource: true });
  const cliId = lastIfId(doc, h1.id);
  doc = setDataSource(doc, h1.id, cliId, false);
  const cli = ifaceOf(doc, h1.id, cliId);
  assert.equal(cli.isDataSource, false);
  assert.equal(cli.placement, undefined); // 未设过 placement，取消后仍为空
});

test("placement/innerPos/isDataSource 是纯视图：generateAll 输出与未设置时逐字相同", () => {
  const base = structuredClone(chipDoc);
  const def = base.library.defs.find((d) => d.interfaces.some((i) => i.role === "client"))!;
  const ifId = def.interfaces.find((i) => i.role === "client")!.id;
  let withView = setDataSource(base, def.id, ifId, true);
  withView = setInterfacePlacement(withView, def.id, ifId, "other");
  withView = setInterfaceInnerPos(withView, def.id, ifId, { x: 12, y: 34 });
  const dump = (doc: typeof base) => generateAll(doc.library, doc.ui.rootDefId).map((r) => r.file + "\n" + r.text).join("\n==\n");
  assert.equal(dump(withView), dump(base));
});
