// 整张 DFX Ctrl tab 的合成原理图(M3/D10):把「多实例 + 多 ctrlIp」推广成一张 schematic
// 纯图 —— 每个实例一个节点,每条修改展开成 dfx源 → ctrl IP → mux → 目标(观测反向)。
// detailGraph.ts 的多修改推广:ctrl id 唯一化、dfx 源全图单例、pin.target(tcl 路径)桥接
// 回 instances 的 daemon nodeId。复用 hierarchy 的 SchematicGraph 模型(makeNode/edgeId),
// 交给同一套 ELK 布局 + Konva 渲染(DfxCtrlTab.tsx)。纯函数、无 React。
import { makeNode, edgeId, type SchEdge, type SchNode, type SchematicGraph } from "../../hierarchy/core/schematic.ts";
import type { Direction, PortInfo } from "../../hierarchy/core/model.ts";
import type { CtrlPin, DocCtrlIp } from "../core/model.ts";
import { moduleNameOf } from "./edit.ts";
import { tclTarget } from "./judge.ts";

/** DFX Ctrl tab 的一个目标/被控实例:daemon nodeId + 端口(从 getPorts 拉)。 */
export interface DfxInstanceMeta {
  nodeId: string;
  instanceName: string;
  designName: string;
  ports: PortInfo[];
}

// UI 从不填 dfxModeSource;与 dft-core ctrlgen-core parseSpec 的默认值一致地兜底,
// 否则合图对所有真实修改都不画 dfx 源节点/sel/dfx_mode 边(§5.3 的核心拓扑)。
const DFX_SRC_DEFAULT = "u_dfx_static_hyper_ctl_tdr/dfx_mode";

const port = (name: string, direction: Direction): PortInfo => ({ name, direction, width: 1, busLabel: name });

// tcl 目标路径 "PLL_1/enable"(去顶层)→ 实例段 "PLL_1" + 引脚 "enable"。
const targetInst = (t: string): string => t.slice(0, t.lastIndexOf("/"));
const targetPin = (t: string): string => t.slice(t.lastIndexOf("/") + 1);

// --- 与 detailGraph.ts 同形的按位归一化(逐字节相同;那里是私有,此处随建图逻辑复制) ---
/** stitch 归一化到长度 width 的数组(标量→按位铺开;缺失→空)。 */
function normStitch(pin: CtrlPin): (string | undefined)[] {
  const s = pin.stitch;
  if (Array.isArray(s)) return s;
  if (s != null) return Array.from({ length: pin.width }, () => s);
  return [];
}
/** muxName 归一化到长度 width 的数组(标量→按位广播;缺失→空)——与 normStitch 同形。 */
function normMux(pin: CtrlPin): (string | null | undefined)[] {
  const m = pin.muxName;
  if (Array.isArray(m)) return m;
  if (m != null) return Array.from({ length: pin.width }, () => m);
  return [];
}
/** 第 i 位的目标 tcl 路径(异构 targets 优先,否则同构 target)。 */
const bitTarget = (pin: CtrlPin, i: number): string | undefined => pin.targets?.[i] ?? pin.target;

export function buildDfxSchematicGraph(args: { instances: DfxInstanceMeta[]; ctrlIps: DocCtrlIp[] }): SchematicGraph {
  const { instances, ctrlIps } = args;
  const nodes: Record<string, SchNode> = {};
  const edges: SchEdge[] = [];
  const pushEdge = (fn: string, fp: string, tn: string, tp: string, b: boolean) => {
    const id = edgeId(fn, fp, tn, tp);
    if (!edges.some((e) => e.id === id))
      edges.push({ id, fromNode: fn, fromPort: fp, toNode: tn, toPort: tp, netName: "", bus: b });
  };
  // 边落点端口必须存在(ELK 用 portId 连线);实例节点缺该 pin 时补一行(不覆盖已声明方向)。
  const ensurePort = (nodeId: string, name: string, dir: Direction) => {
    const n = nodes[nodeId];
    if (n && !n.ports.some((p) => p.name === name)) n.ports.push({ name, direction: dir, busLabel: name });
  };

  // 1. 每个实例一个节点(端口来自其 ports)。
  for (const inst of instances)
    nodes[inst.nodeId] = makeNode(inst.nodeId, inst.instanceName, inst.designName, "module", inst.ports);

  // pin.target(tcl 路径)→ 落点 nodeId:命中 instances 用其 daemon nodeId(tclTarget 逆);
  // 未命中(实例不在 tab 上)→ 为该 target 建轻量占位节点(id/名=实例段),保证边有落点、图完整。
  const resolveTarget = (t: string, dir: Direction): string => {
    const pin = targetPin(t);
    const hit = instances.find((i) => tclTarget(i.nodeId, pin) === t);
    const id = hit ? hit.nodeId : targetInst(t);
    if (!nodes[id]) nodes[id] = makeNode(id, id, id, "module", []);
    ensurePort(id, pin, dir);
    return id;
  };

  // dfx 源节点全图唯一:多条 ctrlIp 共用同一 id 时只建一个(makeNode 幂等)。
  const ensureDfxSrc = (id: string) => {
    if (!nodes[id]) nodes[id] = makeNode(id, "dfx_mode", id, "port", [port("o", "out")]);
  };

  for (const entry of ctrlIps) {
    const spec = entry.spec;
    const mod = moduleNameOf(spec);
    const ctrlId = `ctrl:${mod}`;             // 每条 ctrlIp 唯一(合图里可多块共存)
    const dfxSrc = spec.dfxModeSource ?? DFX_SRC_DEFAULT;
    const bus = (pin: CtrlPin) => pin.width > 1;

    // ctrl IP 节点端口:dfx_mode + 每 pin 的 IP 侧(控制:出 portName + 入 _tdr;观测:入 portName + 出 _tdr)
    const ctrlPorts: PortInfo[] = [port("dfx_mode", "in")];
    for (const p of spec.pins) {
      if (p.mode === "control") { ctrlPorts.push(port(p.portName, "out"), port(`${p.portName}_tdr`, "in")); }
      else { ctrlPorts.push(port(p.portName, "in"), port(`${p.portName}_tdr`, "out")); }
    }
    nodes[ctrlId] = makeNode(ctrlId, mod, mod, "module", ctrlPorts);

    ensureDfxSrc(dfxSrc);
    pushEdge(dfxSrc, "o", ctrlId, "dfx_mode", false); // dfx源 → ctrl.dfx_mode

    for (const p of spec.pins) {
      if (p.mode === "observe") {
        const t = p.target ?? p.targets?.[0];
        if (!t) continue;
        const tn = resolveTarget(t, "out");
        pushEdge(tn, targetPin(t), ctrlId, p.portName, bus(p)); // 观测:目标 → ctrl
        continue;
      }
      // 控制:逐位 mux / 直连
      const stitches = normStitch(p), muxNames = normMux(p);
      for (let i = 0; i < p.width; i++) {
        const t = bitTarget(p, i);
        if (!t) continue;
        const tn = resolveTarget(t, "in");
        const pin = targetPin(t);
        const mux = stitches[i] === "mux" ? muxNames[i] : null;
        if (mux) {
          // mux 位一个节点(3 端口:in0=原驱动 in1=ctrl 输出 sel=dfx_mode out→目标)。
          // "blackbox"(非真 blackbox):mux 符号需要 3 个固定端口行;logic/port kind 会被
          // toElkGraph 折叠成单个居中端口(schematic.ts),破坏 3 端口布局。
          if (!nodes[mux])
            nodes[mux] = makeNode(mux, mux, "mux", "blackbox",
              [port("in0", "in"), port("in1", "in"), port("sel", "in"), port("out", "out")]);
          pushEdge(ctrlId, p.portName, mux, "in1", bus(p));
          pushEdge(mux, "out", tn, pin, bus(p));
          pushEdge(dfxSrc, "o", mux, "sel", false);
        } else {
          pushEdge(ctrlId, p.portName, tn, pin, bus(p)); // replace / connect:直连
        }
      }
    }
  }

  // seed 只用于取景中心;取第一条 ctrl 块,否则第一个实例,否则空图。
  const seedId = ctrlIps.length ? `ctrl:${moduleNameOf(ctrlIps[0].spec)}` : (instances[0]?.nodeId ?? "");
  return { seedId, nodes, edges, expanded: {}, empty: {}, inExpanded: {}, inEmpty: {} };
}
