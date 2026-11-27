// 弹窗行状态 -> CtrlIpSpec(spec §4.1)。mux 号由调用方一次 allocMuxDs 后传入。
import type { CtrlIpSpec, CtrlPin } from "../core/model.ts";
import { tclTarget, type Stitch } from "./judge.ts";

export interface DfxRow {
  pin: string;
  dir: "in" | "out" | "inout";
  width: number;
  nodeId: string;    // daemon 层次 id(点分隔)
  instName: string;  // 目标实例名(mux 命名/前缀用)
  role: "control" | "observe" | "ignore";
  stitch: readonly Stitch[]; // control:按位;observe/ignore:[]
}

const flat = (s: string) => s.replace(/\//g, "_");

export function buildCtrlIpSpec(args: {
  moduleBase: string;
  dsIndex: number;
  rows: DfxRow[];
  muxDs: number[]; // 长度 = 全部 mux 位数,按行序/位序消费
}): { spec: CtrlIpSpec; muxCount: number } {
  const active = args.rows.filter((r) => r.role !== "ignore");
  // A2:同名冲突 -> 实例名前缀(扁平化 '/')
  const seen = new Map<string, number>();
  for (const r of active) seen.set(r.pin, (seen.get(r.pin) ?? 0) + 1);
  const portName = (r: DfxRow) =>
    (seen.get(r.pin) ?? 0) > 1 ? `${flat(r.instName)}_${r.pin}` : r.pin;

  let k = 0;
  const pins: CtrlPin[] = active.map((r) => {
    const base: CtrlPin = { portName: portName(r), mode: r.role as "control" | "observe",
                            width: r.width, target: tclTarget(r.nodeId, r.pin) };
    if (r.role !== "control") return base;
    const muxNames = r.stitch.map((st) =>
      st === "mux" ? `u_dfx_${flat(r.instName)}_${r.pin}_persistent_mux_inst_ds${args.muxDs[k++]}` : null);
    if (r.width === 1) {
      base.stitch = r.stitch[0];
      if (muxNames[0]) base.muxName = muxNames[0];
    } else {
      base.stitch = [...r.stitch];
      base.muxName = muxNames;
    }
    return base;
  });
  return { spec: { schemaVersion: 2, moduleBase: args.moduleBase, dsIndex: args.dsIndex, pins },
           muxCount: k };
}
