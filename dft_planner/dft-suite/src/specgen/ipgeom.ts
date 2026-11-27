// DFT IP 端口/盒几何单一真源：把 catalog 端口 + 朝向(rotation/mirror) 变换到显示帧。
// portGeom(连线) 与 DftIpNode(渲染) 共用，保证 pin 与线端点永远一致。
import { catalogEntry, dftIpSize } from "./catalog.ts";
import type { DftIpType } from "../genconn/core/dft-model.ts";
import { mapPoint, dispDims, type Rotation, type Side } from "../genconn/layout.ts";

export type Vec = { dx: number; dy: number };
export const ipSideDir = (side: Side): Vec =>
  side === "left" ? { dx: -1, dy: 0 } : side === "right" ? { dx: 1, dy: 0 } :
  side === "top" ? { dx: 0, dy: -1 } : { dx: 0, dy: 1 };

/** 显示帧盒尺寸（90/270 交换 w/h）。 */
export function dftIpDispSize(ip: { ipType: DftIpType; rotation?: Rotation }): { w: number; h: number } {
  const { w, h } = dftIpSize(ip.ipType);
  return dispDims(ip.rotation ?? 0, w, h);
}

const MUX_INSET = 20; // MUX 梯形上下收边 = M/S 锚点距上下边的距离

/** def 局部端口点：普通 IP 数据口在左右边中点；MUX 固定 M(0,20)/S(0,60)/out(60,40)。 */
function defPortPoint(ipType: DftIpType, portName: string): { x: number; y: number } | null {
  const ports = catalogEntry(ipType).ports;
  const p = ports.find((q) => q.name === portName);
  if (!p) return null;
  const { w, h } = dftIpSize(ipType);
  if (ipType === "Multiplexer") {
    if (p.role === "master") return { x: 0, y: MUX_INSET };
    if (p.role === "secondary") return { x: 0, y: h - MUX_INSET };
    if (p.dir === "out") return { x: w, y: h / 2 };
    return { x: w / 2, y: 0 }; // clock：不画，兜底
  }
  if (p.side === "left") return { x: 0, y: h / 2 };
  if (p.side === "right") return { x: w, y: h / 2 };
  if (p.side === "top") return { x: w / 2, y: 0 };
  return { x: w / 2, y: h };
}

/** 端口在显示帧盒内的局部坐标 + 显示边 + 外朝向。 */
export function portGeom(ipType: DftIpType, portName: string, rotation: Rotation, mirror: boolean):
  { x: number; y: number; side: Side; dir: Vec } | null {
  const p = defPortPoint(ipType, portName);
  if (!p) return null;
  const { w: w0, h: h0 } = dftIpSize(ipType);
  const d = mapPoint(p.x, p.y, rotation, mirror, w0, h0);   // 先镜像后旋转 → 显示局部点
  const { w } = dispDims(rotation, w0, h0); // 只需 w 判 right；bottom 为兜底边，无需 h
  const eps = 1e-6;
  const side: Side =
    Math.abs(d.x) <= eps ? "left" : Math.abs(d.x - w) <= eps ? "right" :
    Math.abs(d.y) <= eps ? "top" : "bottom";
  return { x: d.x, y: d.y, side, dir: ipSideDir(side) };
}

/** 盒角点（显示帧）：MUX 是长边在左的梯形，其余矩形。 */
export function ipBoxCorners(ipType: DftIpType, rotation: Rotation, mirror: boolean): { x: number; y: number }[] {
  const { w: w0, h: h0 } = dftIpSize(ipType);
  const pts: [number, number][] = ipType === "Multiplexer"
    ? [[0, 0], [w0, MUX_INSET], [w0, h0 - MUX_INSET], [0, h0]]
    : [[0, 0], [w0, 0], [w0, h0], [0, h0]];
  return pts.map(([x, y]) => mapPoint(x, y, rotation, mirror, w0, h0));
}
