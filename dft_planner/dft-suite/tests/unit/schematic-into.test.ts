// "往里 trace"(trace-into):模型纯函数语义 + 嵌套 ELK 构造 + 真 elkjs 布局(spec §3/§4)。
import { test } from "node:test"; import assert from "node:assert/strict";
import {
  addTraceInto, collapseInside, containerMinDims, makeNode, makeSourceNode, markInEmpty, newSchematic, portId, toElkGraph,
  type SchEdge, type SchematicGraph,
} from "../../src/hierarchy/core/schematic.ts";
import type { PortInfo } from "../../src/hierarchy/core/model.ts";
import { layout } from "../../src/hierarchy/schematic/elkLayout.ts";
import { toLaid } from "../../src/hierarchy/schematic/laid.ts";

const P = (name: string, direction: "in" | "out"): PortInfo => ({ name, direction, width: 1, busLabel: name });

/** seed=soc(非 leaf) + 一次 traceInside(clk):u_cpu/u_mem 落在 soc 内。 */
function expandedGraph(): SchematicGraph {
  const seed = makeNode("soc", "soc", "soc|/rtl/soc.v", "module", [P("clk", "in"), P("rst_n", "in")], { isLeaf: false });
  const cpu = makeNode("soc.u_cpu", "u_cpu", "cpu|/rtl/soc.v", "module", [P("clk", "in"), P("pc", "out")], { isLeaf: true, parentId: "soc" });
  const mem = makeNode("soc.u_mem", "u_mem", "mem|/rtl/soc.v", "module", [P("clk", "in")], { isLeaf: true, parentId: "soc" });
  const edges: SchEdge[] = [
    { id: "e1", fromNode: "soc", fromPort: "clk", toNode: "soc.u_cpu", toPort: "clk", netName: "clk", bus: false },
    { id: "e2", fromNode: "soc", fromPort: "clk", toNode: "soc.u_mem", toPort: "clk", netName: "clk", bus: false },
  ];
  return addTraceInto(newSchematic(seed), "soc", "clk", [cpu, mem], edges);
}

test("addTraceInto:节点挂 parentId、inExpanded 标记、边去重", () => {
  const g = expandedGraph();
  assert.equal(g.nodes["soc.u_cpu"].parentId, "soc");
  assert.deepEqual(g.inExpanded["soc"], ["clk"]);
  const again = addTraceInto(g, "soc", "clk", [g.nodes["soc.u_cpu"]], [g.edges[0]]);
  assert.equal(again.edges.length, 2);
  // 已有节点不被同 id 新对象覆盖
  const stale = makeNode("soc.u_cpu", "STALE", "x|/x.v", "module", [], { parentId: "soc" });
  const g2 = addTraceInto(g, "soc", "clk", [stale], []);
  assert.equal(g2.nodes["soc.u_cpu"].instanceName, "u_cpu");
});

test("markInEmpty 与 addTraceInto 清除互逆", () => {
  const seed = makeNode("soc", "soc", "soc|/s.v", "module", [P("clk", "in")], { isLeaf: false });
  let g = markInEmpty(newSchematic(seed), "soc", "clk");
  assert.deepEqual(g.inEmpty["soc"], ["clk"]);
  g = addTraceInto(g, "soc", "clk", [], []);
  assert.deepEqual(g.inEmpty["soc"], []);
});

test("collapseInside:递归删后代、触边、in 标记;容器外侧 expanded 保留", () => {
  let g = expandedGraph();
  // 两级:u_cpu 里再放一个行为源(模拟对 u_cpu.pc 的 traceInside)
  const src = makeSourceNode({ id: "logic:/rtl/soc.v:3", kind: "logic", label: "always", detail: "always", file: "/rtl/soc.v", line: 3, bus: false }, "soc.u_cpu");
  g = addTraceInto(g, "soc.u_cpu", "pc", [src], [{ id: "e3", fromNode: src.id, fromPort: "o", toNode: "soc.u_cpu", toPort: "pc", netName: "pc", bus: false }]);
  g = { ...g, expanded: { soc: ["rst_n"] } };
  const c = collapseInside(g, "soc");
  assert.deepEqual(Object.keys(c.nodes), ["soc"]);
  assert.equal(c.edges.length, 0);
  assert.equal(c.inExpanded["soc"], undefined);
  assert.equal(c.inEmpty["soc"], undefined);
  assert.deepEqual(c.expanded["soc"], ["rst_n"]);
  // 无后代容器:no-op,按引用返回原图
  assert.equal(collapseInside(c, "soc"), c);
});

test("toElkGraph:嵌套 children + 容器最小尺寸(非0)+ FIXED_SIDE + 仅嵌套时开 INCLUDE_CHILDREN", () => {
  const g = expandedGraph();
  const elk = toElkGraph(g);
  assert.equal(elk.layoutOptions["elk.hierarchyHandling"], "INCLUDE_CHILDREN");
  const soc = elk.children.find((c) => c.id === "soc")!;
  assert.equal(soc.children?.length, 2);
  // 容器有最小尺寸(ELK 之后再撑大),不再是 0——否则子盒会叠在父盒上、右侧引脚挤成一堆
  assert.equal(soc.width, containerMinDims(g.nodes["soc"]).width);
  assert.ok(soc.height > 0);
  assert.equal(soc.layoutOptions["elk.portConstraints"], "FIXED_SIDE");
  assert.ok(soc.layoutOptions["elk.nodeSize.minimum"], "容器声明 nodeSize.minimum 作为下限");
  assert.ok(soc.layoutOptions["elk.padding"].startsWith("[top=46"));
  // 平铺图回归:无 parentId 时不开 INCLUDE_CHILDREN、无 children
  const flat = toElkGraph(newSchematic(makeNode("t.u", "u", "m|/m.v", "module", [P("i", "in")])));
  assert.equal(flat.layoutOptions["elk.hierarchyHandling"], undefined);
  assert.equal(flat.children[0].children, undefined);
});

test("toElkGraph:新增内部节点拿到兄弟下方的 elk.position 提示(spec §4-7)", () => {
  const g = expandedGraph();
  const prev = { soc: { x: 18, y: 12 }, "soc.u_cpu": { x: 18, y: 46 } };  // u_mem 无 prev = 新节点
  const elk = toElkGraph(g, prev);
  const soc = elk.children.find((c) => c.id === "soc")!;
  assert.equal(soc.children!.find((c) => c.id === "soc.u_mem")!.layoutOptions["elk.position"], "(18,146)");
  assert.equal(soc.children!.find((c) => c.id === "soc.u_cpu")!.layoutOptions["elk.position"], "(18,46)");
});

test("真 elkjs:容器自动撑大、子盒绝对坐标、内层边随容器偏移、innerPorts 在内侧", async () => {
  const g = expandedGraph();
  const laid = toLaid(await layout(toElkGraph(g)), g.nodes, g.edges);
  const soc = laid.boxes.find((b) => b.node.id === "soc")!;
  const cpu = laid.boxes.find((b) => b.node.id === "soc.u_cpu")!;
  assert.ok(soc.isContainer && !cpu.isContainer);
  assert.ok(cpu.x > soc.x && cpu.y > soc.y, "子盒在容器内(绝对坐标)");
  assert.ok(cpu.x + cpu.w <= soc.x + soc.w + 1 && cpu.y + cpu.h <= soc.y + soc.h + 1);
  assert.equal(soc.x + cpu.rel.x, cpu.x, "rel + 容器原点 = 绝对");
  assert.ok(soc.w > cpu.w && soc.h > cpu.h, "容器撑大到能装下子盒");
  // 内层边 e1(soc.clk→u_cpu.clk)终点与 u_cpu.clk 锚点同行(容器偏移已应用)
  const wire = laid.wires.find((w) => w.id === "e1")!;
  const endY = wire.points[wire.points.length - 1];
  assert.ok(Math.abs(endY - cpu.ports[portId("soc.u_cpu", "clk")].y) < 1, `wire endY=${endY}`);
  // innerPorts 在边界内侧:WEST 引脚 inner.x > outer.x
  const outer = soc.ports[portId("soc", "clk")];
  const inner = soc.innerPorts[portId("soc", "clk")];
  assert.ok(inner.x > outer.x);
});

test("真 elkjs:内层稳定性——老子盒 pin 住 + 新子盒发提示,顺序保持(spec §4-7)", async () => {
  const g = expandedGraph();
  // 对照:无位置记忆时,ELK 自然把 u_cpu 排在 u_mem 上方——下面的主断言与之相反,证明提示生效
  const fresh = toLaid(await layout(toElkGraph(g)), g.nodes, g.edges);
  const freshCpu = fresh.boxes.find((b) => b.node.id === "soc.u_cpu")!;
  const freshMem = fresh.boxes.find((b) => b.node.id === "soc.u_mem")!;
  assert.ok(freshCpu.y < freshMem.y, "前提:自然布局 cpu 在上(若此断言失败,说明场景失去区分度,需换角色重设计)");
  // 第一轮:只有 u_mem(老盒);第二轮加 u_cpu(新盒)
  const g1: SchematicGraph = {
    ...g,
    nodes: Object.fromEntries(Object.entries(g.nodes).filter(([id]) => id !== "soc.u_cpu")),
    edges: g.edges.filter((e) => e.id !== "e1"),
  };
  const laid1 = toLaid(await layout(toElkGraph(g1)), g1.nodes, g1.edges);
  const prev: Record<string, { x: number; y: number }> = {};
  for (const b of laid1.boxes) prev[b.node.id] = b.node.parentId ? b.rel : { x: b.x, y: b.y };
  const laid2 = toLaid(await layout(toElkGraph(g, prev)), g.nodes, g.edges);
  const cpu = laid2.boxes.find((b) => b.node.id === "soc.u_cpu")!;
  const mem = laid2.boxes.find((b) => b.node.id === "soc.u_mem")!;
  assert.ok(mem.y < cpu.y, `老盒 u_mem(${mem.y}) 必须保持在新盒 u_cpu(${cpu.y}) 上方——与自然顺序相反,证明提示生效`);
});
