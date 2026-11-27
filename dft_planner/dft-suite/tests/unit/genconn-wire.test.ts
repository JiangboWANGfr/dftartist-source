import { test } from "node:test";
import assert from "node:assert/strict";
import type { BusWire, HardenDef } from "../../src/genconn/core/model.ts";
import { generateAll } from "../../src/genconn/core/generate.ts";
import { chipDoc } from "../../src/genconn/core/examples/chip.ts";
import { addWire, bindWire, bindWireEnd, notchDepth, orientSide, removeWire, wireFromTree } from "../../src/genconn/wire.ts";
import { barAnchor, computeLayout } from "../../src/genconn/layout.ts";
import { addInterface, setDataSource } from "../../src/genconn/core/edit.ts";

test("manual/wires 是纯视图：加上后 generateAll 逐字不变", () => {
  const base = structuredClone(chipDoc);
  const withView = structuredClone(chipDoc);
  const open = withView.library.defs.find((d) => d.id === withView.ui.openDefId)!;
  open.connections = open.connections.map((c) => ({ ...c, manual: true }));
  (open as HardenDef).wires = [{ id: "w1", busType: "SSN", busWidth: 4, sourceInstanceId: "x", sourceInterfaceId: "y", points: [], connectionIds: [] } as BusWire];
  const dump = (doc: typeof base) => generateAll(doc.library, doc.ui.rootDefId).map((r) => r.file + "\n" + r.text).join("\n==\n");
  assert.equal(dump(withView), dump(base));
});

function wireDoc() {
  const mk = (id: string): HardenDef => ({ id, designName: id, designLevel: "sub_block", designType: "tiling", interfaces: [], childInstances: [], connections: [] });
  const S = mk("S"), A = mk("A"), B = mk("B");
  const T: HardenDef = { id: "T", designName: "T", designLevel: "chip", designType: "hierarchical", interfaces: [],
    childInstances: [
      { id: "si", instanceName: "si", hardenId: "S", position: { x: 0, y: 0 } },
      { id: "ai", instanceName: "ai", hardenId: "A", position: { x: 200, y: 0 } },
      { id: "bi", instanceName: "bi", hardenId: "B", position: { x: 400, y: 0 } },
    ], connections: [] };
  let doc: any = { schemaVersion: 1, library: { defs: [T, S, A, B] }, ui: { openDefId: "T", rootDefId: "T" } };
  doc = addInterface(doc, "S", { busType: "SSN", role: "client", isDataSource: true });
  const dsIf = doc.library.defs.find((d: HardenDef) => d.id === "S")!.interfaces.at(-1)!.id;
  doc = setDataSource(doc, "S", dsIf, true);
  return { doc, dsIf };
}

test("addWire：源→穿过 a,b → 生成 secondary→client 链，方向正确，DS 为链首 client", () => {
  const { doc, dsIf } = wireDoc();
  const r = addWire(doc, "si", dsIf, [{ x: 60, y: 60 }, { x: 520, y: 60 }]);
  assert.equal(r.error, undefined, r.error);
  const T = r.doc.library.defs.find((d: HardenDef) => d.id === "T")!;
  // order = [si(DS), ai, bi] → 2 条连接：si.sec→ai.client、ai.sec→bi.client（上游.sec → 下游.client）
  assert.equal(T.connections.length, 2);
  const instToDef = (instId: string) => { const inst = T.childInstances.find((i) => i.id === instId)!; return r.doc.library.defs.find((d: HardenDef) => d.id === inst.hardenId)!; };
  for (const c of T.connections) {
    const s = instToDef(c.secondaryInstanceId).interfaces.find((f) => f.id === c.secondaryInterfaceId)!;
    const cl = instToDef(c.clientInstanceId).interfaces.find((f) => f.id === c.clientInterfaceId)!;
    assert.equal(s.role, "secondary");
    assert.equal(cl.role, "client");
    assert.ok(c.manual);
  }
  // 对齐：每条连接的 secondary 与 client 在相对边、同 offset（自动对齐；wireDoc 三盒同 y/尺寸）
  const OPP: Record<string, string> = { left: "right", right: "left", top: "bottom", bottom: "top" };
  for (const c of T.connections) {
    const s = instToDef(c.secondaryInstanceId).interfaces.find((f) => f.id === c.secondaryInterfaceId)!;
    const cl = instToDef(c.clientInstanceId).interfaces.find((f) => f.id === c.clientInterfaceId)!;
    assert.equal(cl.edge!.side, OPP[s.edge!.side]);
    assert.ok(Math.abs((s.edge!.offset ?? 0) - (cl.edge!.offset ?? 0)) < 1e-9);
  }
  // DS harden(S) = DS 的 client + 1 个生成的 secondary（扇出）→ 2 个接口
  const defS = r.doc.library.defs.find((d: HardenDef) => d.id === "S")!;
  assert.equal(defS.interfaces.length, 2);
  assert.ok(defS.interfaces.some((f) => f.role === "secondary"));
  // DS 接口本体不作为连接端点（它是源、任意位置，扇出靠新生成的 secondary）
  assert.ok(!T.connections.some((c) => c.clientInterfaceId === dsIf || c.secondaryInterfaceId === dsIf));
  // 第一条连接的 secondary 在 DS harden(si) 上（上游→下游）
  assert.ok(T.connections.some((c) => c.secondaryInstanceId === "si"));
  // 链尾(bi/B) 只有 client、无 secondary
  const defB = r.doc.library.defs.find((d: HardenDef) => d.id === "B")!;
  assert.ok(defB.interfaces.some((f) => f.role === "client"));
  assert.ok(!defB.interfaces.some((f) => f.role === "secondary"));
});

test("addWire：按真实穿越生成——DS 扇出到多个下游，接口落在真实相邻边（回归 harden8/harden5 错边）", () => {
  const mk = (id: string): HardenDef => ({ id, designName: id, designLevel: "sub_block", designType: "tiling", interfaces: [], childInstances: [], connections: [], size: { w: 160, h: 120 } });
  const H6 = mk("H6"), H7 = mk("H7"), H5 = mk("H5");
  const T: HardenDef = { id: "T", designName: "T", designLevel: "chip", designType: "hierarchical", interfaces: [],
    childInstances: [
      { id: "h7", instanceName: "h7", hardenId: "H7", position: { x: 420, y: 140 } }, // 右上（DS）
      { id: "h6", instanceName: "h6", hardenId: "H6", position: { x: 260, y: 140 } }, // 左上
      { id: "h5", instanceName: "h5", hardenId: "H5", position: { x: 420, y: 280 } }, // 右下
    ], connections: [] };
  let doc: any = { schemaVersion: 1, library: { defs: [T, H6, H7, H5] }, ui: { openDefId: "T", rootDefId: "T" } };
  doc = addInterface(doc, "H7", { busType: "SSN", role: "client", isDataSource: true });
  const dsIf = doc.library.defs.find((d: HardenDef) => d.id === "H7")!.interfaces.at(-1)!.id;
  // 线：h7 → h6 → 回 h7 → h5（h7 扇出到 h6 和 h5；h5 从 h7 进出）
  const r = addWire(doc, "h7", dsIf, [{ x: 500, y: 200 }, { x: 340, y: 200 }, { x: 500, y: 200 }, { x: 500, y: 340 }]);
  assert.equal(r.error, undefined, r.error);
  const T2 = r.doc.library.defs.find((d: HardenDef) => d.id === "T")!;
  assert.equal(T2.connections.length, 2);
  assert.ok(T2.connections.every((c) => c.secondaryInstanceId === "h7")); // 两条都从 h7 扇出
  const h7def = r.doc.library.defs.find((d: HardenDef) => d.id === "H7")!;
  assert.equal(h7def.interfaces.filter((f) => f.role === "secondary").length, 2); // 扇出 → 2 个 secondary
  const h5cli = r.doc.library.defs.find((d: HardenDef) => d.id === "H5")!.interfaces.find((f) => f.role === "client")!;
  assert.equal(h5cli.edge!.side, "top"); // h5 的 client 朝 h7（top），不是朝 h8 的 left
});

test("addWire：穿过 <1 个（除源外）实例 → 报错、doc 不变", () => {
  const { doc, dsIf } = wireDoc();
  const r = addWire(doc, "si", dsIf, [{ x: 60, y: 60 }, { x: 120, y: 60 }]);
  assert.ok(r.error);
  assert.equal(r.doc, doc);
});

test("orientSide：与 mapPoint 约定一致（先镜像后顺时针旋转）", () => {
  assert.equal(orientSide("left", 0, false), "left");
  assert.equal(orientSide("left", 0, true), "right");
  assert.equal(orientSide("top", 0, true), "top");
  assert.equal(orientSide("left", 90, false), "top");
  assert.equal(orientSide("top", 90, false), "right");
  assert.equal(orientSide("right", 90, false), "bottom");
  assert.equal(orientSide("left", 180, false), "right");
  assert.equal(orientSide("top", 180, false), "bottom");
  assert.equal(orientSide("left", 270, false), "bottom");
  assert.equal(orientSide("left", 90, true), "bottom"); // left --mir--> right --rot90--> bottom
});

test("addWire：多实例 def 接口复用 + 自动朝向（harden3 双实例，i2 镜像，无多余接口）", () => {
  const mk = (id: string): HardenDef => ({ id, designName: id, designLevel: "sub_block", designType: "tiling", interfaces: [], childInstances: [], connections: [], size: { w: 160, h: 120 } });
  const H4 = mk("H4"), H3 = mk("H3"), H2 = mk("H2");
  const T: HardenDef = { id: "T", designName: "T", designLevel: "chip", designType: "hierarchical", interfaces: [],
    childInstances: [
      { id: "d", instanceName: "d", hardenId: "H4", position: { x: 160, y: -20 } },
      { id: "a1", instanceName: "a1", hardenId: "H3", position: { x: 320, y: -20 } },
      { id: "a2", instanceName: "a2", hardenId: "H3", position: { x: 0, y: -20 } },
      { id: "b1", instanceName: "b1", hardenId: "H2", position: { x: 480, y: -20 } },
      { id: "b2", instanceName: "b2", hardenId: "H2", position: { x: 480, y: 140 } },
      { id: "b3", instanceName: "b3", hardenId: "H2", position: { x: -160, y: -20 } },
      { id: "b4", instanceName: "b4", hardenId: "H2", position: { x: -160, y: 140 } },
    ], connections: [] };
  let doc: any = { schemaVersion: 1, library: { defs: [T, H4, H3, H2] }, ui: { openDefId: "T", rootDefId: "T" } };
  doc = addInterface(doc, "H4", { busType: "SSN", role: "client", isDataSource: true });
  const dsIf = doc.library.defs.find((x: HardenDef) => x.id === "H4")!.interfaces.at(-1)!.id;
  const P = (x: number, y: number) => ({ x, y });
  const r = addWire(doc, "d", dsIf, [P(240,40), P(400,40), P(560,40), P(560,200), P(400,40), P(80,40), P(-80,40), P(-80,200)]);
  assert.equal(r.error, undefined, r.error);
  assert.deepEqual(r.unresolved ?? [], []);
  const h3 = r.doc.library.defs.find((x: HardenDef) => x.id === "H3")!;
  assert.equal(h3.interfaces.filter((f) => f.role === "client").length, 1);
  assert.equal(h3.interfaces.filter((f) => f.role === "secondary").length, 2);
  assert.ok(h3.interfaces.filter((f) => f.role === "secondary").every((f) => /^(left|right|top|bottom)\d+$/.test(f.interfaceName ?? ""))); // 只 secondary 有 <边><序号> 名
  assert.ok(h3.interfaces.filter((f) => f.role === "client").every((f) => f.interfaceName == null)); // client 不生成名字
  const T2 = r.doc.library.defs.find((x: HardenDef) => x.id === "T")!;
  const a1 = T2.childInstances.find((i) => i.id === "a1")!;
  const a2 = T2.childInstances.find((i) => i.id === "a2")!;
  assert.notDeepEqual([a1.rotation ?? 0, a1.mirror ?? false], [a2.rotation ?? 0, a2.mirror ?? false]);
});

test("addWire：镜像父的多子倒序画线也按几何配对，全部 world 对齐（回归接口不对齐/交叉）", () => {
  const mk = (id: string, w: number, h: number): HardenDef => ({ id, designName: id, designLevel: "sub_block", designType: "tiling", interfaces: [], childInstances: [], connections: [], size: { w, h } });
  const S = mk("S", 160, 320), M = mk("M", 160, 320), L = mk("L", 160, 160);
  const T: HardenDef = { id: "T", designName: "T", designLevel: "chip", designType: "hierarchical", interfaces: [],
    childInstances: [
      { id: "s", instanceName: "s", hardenId: "S", position: { x: 320, y: 100 } },
      { id: "m1", instanceName: "m1", hardenId: "M", position: { x: 160, y: 100 } },
      { id: "m2", instanceName: "m2", hardenId: "M", position: { x: 480, y: 100 } }, // 右侧 → 会被镜像
      { id: "l1", instanceName: "l1", hardenId: "L", position: { x: 0, y: 100 } },
      { id: "l2", instanceName: "l2", hardenId: "L", position: { x: 0, y: 260 } },
      { id: "l3", instanceName: "l3", hardenId: "L", position: { x: 640, y: 100 } }, // 上
      { id: "l4", instanceName: "l4", hardenId: "L", position: { x: 640, y: 260 } }, // 下
    ], connections: [] };
  let doc: any = { schemaVersion: 1, library: { defs: [T, S, M, L] }, ui: { openDefId: "T", rootDefId: "T" } };
  doc = addInterface(doc, "S", { busType: "SSN", role: "client", isDataSource: true });
  const dsIf = doc.library.defs.find((x: HardenDef) => x.id === "S")!.interfaces.at(-1)!.id;
  doc = setDataSource(doc, "S", dsIf, true);
  const P = (x: number, y: number) => ({ x, y });
  // m2 分支故意先画下面的 l4 再画上面的 l3（画序与几何相反）→ 老逻辑会交叉
  const r = addWire(doc, "s", dsIf, [
    P(400, 150), P(240, 150), P(80, 150), P(240, 150), P(240, 350), P(80, 350),
    P(240, 350), P(400, 350), P(560, 350), P(720, 350), P(560, 350), P(560, 150), P(720, 150),
  ]);
  assert.equal(r.error, undefined, r.error);
  assert.deepEqual(r.unresolved ?? [], []);
  const T2 = r.doc.library.defs.find((x: HardenDef) => x.id === "T")!;
  assert.equal(T2.connections.length, 6);
  const boxes = computeLayout(T2, r.doc.library);
  const boxById = new Map(boxes.map((b) => [b.instanceId, b]));
  const anchor = (instId: string, ifId: string) => { const b = boxById.get(instId)!; const bar = b.bars.find((x) => x.interfaceId === ifId)!; const a = barAnchor(b, bar); return { x: b.x + a.x, y: b.y + a.y }; };
  for (const c of T2.connections) {
    const sp = anchor(c.secondaryInstanceId, c.secondaryInterfaceId);
    const cp = anchor(c.clientInstanceId, c.clientInterfaceId);
    assert.ok(Math.abs(sp.x - cp.x) < 1 && Math.abs(sp.y - cp.y) < 1, `${c.secondaryInstanceId}->${c.clientInstanceId}: ${JSON.stringify(sp)} vs ${JSON.stringify(cp)}`);
  }
});

test("wireFromTree dropUnresolved：定不出朝向的实例连同后代丢进 unmatched，其余照常", () => {
  const mk = (id: string): HardenDef => ({ id, designName: id, designLevel: "sub_block", designType: "tiling", interfaces: [], childInstances: [], connections: [], size: { w: 120, h: 120 } });
  const S = mk("S"), D = mk("D"), L = mk("L");
  const T: HardenDef = { id: "T", designName: "T", designLevel: "chip", designType: "hierarchical", interfaces: [],
    childInstances: [
      { id: "s", instanceName: "s", hardenId: "S", position: { x: 300, y: 0 } },
      { id: "d1", instanceName: "d1", hardenId: "D", position: { x: 300, y: 180 } },   // 参考：la 在右、lb 在下（两不同边）
      { id: "la", instanceName: "la", hardenId: "L", position: { x: 480, y: 180 } },
      { id: "lb", instanceName: "lb", hardenId: "L", position: { x: 300, y: 360 } },
      { id: "d2", instanceName: "d2", hardenId: "D", position: { x: 60, y: 180 } },     // lc、ld 都在下（同边 2 个）→ 定不出朝向
      { id: "lc", instanceName: "lc", hardenId: "L", position: { x: 60, y: 360 } },
      { id: "ld", instanceName: "ld", hardenId: "L", position: { x: 60, y: 540 } },
    ], connections: [] };
  let doc: any = { schemaVersion: 1, library: { defs: [T, S, D, L] }, ui: { openDefId: "T", rootDefId: "T" } };
  doc = addInterface(doc, "S", { busType: "SSN", role: "client", isDataSource: true });
  const dsIf = doc.library.defs.find((x: HardenDef) => x.id === "S")!.interfaces.at(-1)!.id;
  doc = setDataSource(doc, "S", dsIf, true);
  const edges: [string, string][] = [["s", "d1"], ["s", "d2"], ["d1", "la"], ["d1", "lb"], ["d2", "lc"], ["d2", "ld"]];

  // 默认模式：d2 定不出朝向 → 整体报 unresolved、doc 不变
  const r0 = wireFromTree(doc, "s", dsIf, edges, []);
  assert.ok(r0.unresolved?.includes("d2"), JSON.stringify(r0.unresolved));
  assert.equal(r0.addedConnIds.length, 0);

  // dropUnresolved：丢掉 d2 + 后代 lc/ld，s->d1/d1->la/d1->lb 三条照常
  const r = wireFromTree(doc, "s", dsIf, edges, [], { dropUnresolved: true });
  assert.equal(r.error, undefined, r.error);
  const um = new Set((r.unmatched ?? []).map((u) => u.instId));
  assert.ok(um.has("d2") && um.has("lc") && um.has("ld"), [...um].join(","));
  assert.equal(r.addedConnIds.length, 3);
  const T2 = r.doc.library.defs.find((x: HardenDef) => x.id === "T")!;
  assert.ok(!T2.connections.some((c) => ["d2", "lc", "ld"].includes(c.clientInstanceId)));
});

test("notchDepth：U 形凹口深度 + 进入边/进入高度", () => {
  const box = { x: 100, y: 100, w: 200, h: 200 }; // [100,300]×[100,300]
  // 从右边进入(x=400>300)，往左扎到 x=250 → 深度=50；进入 y=150→0.25、出去 y=250→0.75；已出去=complete
  assert.deepEqual(notchDepth(box, [{ x: 400, y: 150 }, { x: 250, y: 150 }, { x: 250, y: 250 }, { x: 400, y: 250 }]), { depth: 50, entryIndex: 1, side: "right", entryPos: 0.25, exitPos: 0.75, complete: true });
  // 从上边进入(y=50<100)，往下扎到 y=220 → 深度=120；进入 x=200→0.5、末点 x=260→0.8；还在盒内=未 complete
  assert.deepEqual(notchDepth(box, [{ x: 200, y: 50 }, { x: 200, y: 220 }, { x: 260, y: 220 }]), { depth: 120, entryIndex: 1, side: "top", entryPos: 0.5, exitPos: 0.8, complete: false });
  // 没进入盒 → null
  assert.equal(notchDepth(box, [{ x: 400, y: 150 }, { x: 350, y: 150 }]), null);
});

// ---- orthFinish:收线到引脚的强制对齐 ----
test("orthFinish 上一段是竖段:直接挪末点对齐,零多余拐角", async () => {
  const { orthFinish } = await import("../../src/genconn/wire.ts");
  // 出脚→右→下,最后从 (500,665) 水平回到 (155,655) 的 ◀:末点 y 直接改成 655
  const pts = [{ x: 96, y: 545 }, { x: 500, y: 545 }, { x: 500, y: 665 }];
  assert.deepEqual(orthFinish(pts, { x: 155, y: 655 }, "h"),
    [{ x: 96, y: 545 }, { x: 500, y: 545 }, { x: 500, y: 655 }, { x: 155, y: 655 }]);
});

test("orthFinish 上一段是横段:补远端角点再进入", async () => {
  const { orthFinish } = await import("../../src/genconn/wire.ts");
  const pts = [{ x: 96, y: 545 }, { x: 500, y: 545 }];
  assert.deepEqual(orthFinish(pts, { x: 155, y: 655 }, "h"),
    [{ x: 96, y: 545 }, { x: 500, y: 545 }, { x: 500, y: 655 }, { x: 155, y: 655 }]);
});

test("orthFinish 已对齐:只补终点,不加角", async () => {
  const { orthFinish } = await import("../../src/genconn/wire.ts");
  const pts = [{ x: 96, y: 655 }, { x: 500, y: 655 }];
  assert.deepEqual(orthFinish(pts, { x: 155, y: 655 }, "h"),
    [{ x: 96, y: 655 }, { x: 500, y: 655 }, { x: 155, y: 655 }]);
});

test("orthFinish 单点起手直接收线:补角点成 L 形", async () => {
  const { orthFinish } = await import("../../src/genconn/wire.ts");
  assert.deepEqual(orthFinish([{ x: 96, y: 142 }], { x: 155, y: 655 }, "h"),
    [{ x: 96, y: 142 }, { x: 96, y: 655 }, { x: 155, y: 655 }]);
});

test("orthFinish v 轴(上下边引脚):垂直进入", async () => {
  const { orthFinish } = await import("../../src/genconn/wire.ts");
  const pts = [{ x: 100, y: 40 }, { x: 100, y: 300 }];
  assert.deepEqual(orthFinish(pts, { x: 240, y: 16 }, "v"),
    [{ x: 100, y: 40 }, { x: 100, y: 300 }, { x: 240, y: 300 }, { x: 240, y: 16 }]);
});

test("orthFinish 挪末点后与前点重合:去重", async () => {
  const { orthFinish } = await import("../../src/genconn/wire.ts");
  const pts = [{ x: 500, y: 655 }, { x: 500, y: 700 }]; // 竖段,挪末点回 655 与首点重合
  assert.deepEqual(orthFinish(pts, { x: 155, y: 655 }, "h"),
    [{ x: 500, y: 655 }, { x: 155, y: 655 }]);
});

// ---- 生成接口跟线落位(sideCrossMid):offset 取线与边穿越点的中点,不再固定在重叠中心 ----
test("addWire 回环两次穿越:接口对落在两条线的中点(offset 跟线,≠重叠中心 0.5)", () => {
  const { doc, dsIf } = wireDoc();
  // 从 S 内出发,y=40 进 A、y=80 回 S:A 左边被穿两次 → 中点 y=60 → offset 60/140=3/7
  const r = addWire(doc, "si", dsIf, [{ x: 60, y: 40 }, { x: 260, y: 40 }, { x: 260, y: 80 }, { x: 60, y: 80 }]);
  assert.equal(r.error, undefined, r.error);
  const T = r.doc.library.defs.find((d: HardenDef) => d.id === "T")!;
  assert.equal(T.connections.length, 1);
  const c = T.connections[0];
  const sec = r.doc.library.defs.find((d: HardenDef) => d.id === "S")!.interfaces.find((f) => f.id === c.secondaryInterfaceId)!;
  const cli = r.doc.library.defs.find((d: HardenDef) => d.id === "A")!.interfaces.find((f) => f.id === c.clientInterfaceId)!;
  assert.ok(Math.abs((sec.edge!.offset ?? 0) - 60 / 140) < 1e-9, `sec offset=${sec.edge!.offset}`);
  assert.ok(Math.abs((cli.edge!.offset ?? 0) - 60 / 140) < 1e-9, `cli offset=${cli.edge!.offset}`);
});

test("addWire 单次穿越:接口落在穿越点(y=60 → offset 3/7),secondary/client 仍对齐", () => {
  const { doc, dsIf } = wireDoc();
  const r = addWire(doc, "si", dsIf, [{ x: 60, y: 60 }, { x: 520, y: 60 }]);
  assert.equal(r.error, undefined, r.error);
  const T = r.doc.library.defs.find((d: HardenDef) => d.id === "T")!;
  for (const c of T.connections) {
    const defOf = (instId: string) => r.doc.library.defs.find((d: HardenDef) => d.id === T.childInstances.find((i) => i.id === instId)!.hardenId)!;
    const sec = defOf(c.secondaryInstanceId).interfaces.find((f) => f.id === c.secondaryInterfaceId)!;
    const cli = defOf(c.clientInstanceId).interfaces.find((f) => f.id === c.clientInterfaceId)!;
    assert.ok(Math.abs((sec.edge!.offset ?? 0) - 60 / 140) < 1e-9, `sec offset=${sec.edge!.offset}`);
    assert.ok(Math.abs((cli.edge!.offset ?? 0) - 60 / 140) < 1e-9, `cli offset=${cli.edge!.offset}`);
  }
});

// ---- removeWire 级联:删线后本线生成的接口(已无连接引用)一并删 ----
test("removeWire 级联删除本线生成的 secondary/client 接口,DS 本体保留", () => {
  const { doc, dsIf } = wireDoc();
  const r = addWire(doc, "si", dsIf, [{ x: 60, y: 60 }, { x: 520, y: 60 }]);
  assert.equal(r.error, undefined, r.error);
  const T = r.doc.library.defs.find((d: HardenDef) => d.id === "T")!;
  const wid = (T.wires ?? [])[0].id;
  assert.ok(((T.wires ?? [])[0].createdIfs ?? []).length >= 3); // S.sec + A.cli + A.sec + B.cli
  const out = removeWire(r.doc, wid);
  const ifCount = (id: string) => out.library.defs.find((d: HardenDef) => d.id === id)!.interfaces.length;
  assert.equal(ifCount("S"), 1); // 只剩 DS 本体
  assert.equal(ifCount("A"), 0);
  assert.equal(ifCount("B"), 0);
  const T2 = out.library.defs.find((d: HardenDef) => d.id === "T")!;
  assert.equal(T2.connections.length, 0);
  assert.equal((T2.wires ?? []).length, 0);
});

// ---- bindWireEnd / bindWire:线端点绑定(尾段整体平移、中间拐点不动) ----
test("bindWireEnd 尾段竖直:共线 run 整体平移 x,端点吸到新锚点", () => {
  assert.deepEqual(bindWireEnd([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }], { x: 120, y: 60 }),
    [{ x: 0, y: 0 }, { x: 120, y: 0 }, { x: 120, y: 60 }]);
});

test("bindWireEnd 尾段水平含共线多点:整段平移 y,头部竖段保持正交", () => {
  assert.deepEqual(bindWireEnd([{ x: 0, y: 0 }, { x: 0, y: 100 }, { x: 50, y: 100 }, { x: 120, y: 100 }], { x: 150, y: 90 }),
    [{ x: 0, y: 0 }, { x: 0, y: 90 }, { x: 50, y: 90 }, { x: 150, y: 90 }]);
});

test("bindWire 双端绑定:起点/收线端各自平移,中间拐点位置语义不变", () => {
  assert.deepEqual(bindWire([{ x: 10, y: 10 }, { x: 200, y: 10 }, { x: 200, y: 150 }], { x: 5, y: 20 }, { x: 210, y: 160 }),
    [{ x: 5, y: 20 }, { x: 210, y: 20 }, { x: 210, y: 160 }]);
});

test("bindWireEnd 锚点未动:原样返回", () => {
  const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
  assert.deepEqual(bindWireEnd(pts, { x: 100, y: 0 }), pts);
});

test("selfCrossings:横穿计数,相邻段/平行不计", async () => {
  const { selfCrossings } = await import("../../src/genconn/wire.ts");
  assert.equal(selfCrossings([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]), 0);
  // 首段横线被尾段竖线横穿 → 1
  assert.equal(selfCrossings([{ x: 0, y: 50 }, { x: 100, y: 50 }, { x: 100, y: 100 }, { x: 50, y: 100 }, { x: 50, y: 0 }]), 1);
});
