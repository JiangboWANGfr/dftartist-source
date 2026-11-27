// DFT 连线校验（纯函数，零 core 依赖）。端点 = IP 端口 或 scope 边界接口引脚。
import type { HardenDef } from "../genconn/core/model.ts";
import type { DftEndpoint } from "../genconn/core/dft-model.ts";
import { catalogEntry } from "./catalog.ts";

export function endpointDir(scope: HardenDef, ep: DftEndpoint): { dir: "in" | "out"; role?: string } | null {
  if (ep.kind === "ip") {
    const ip = (scope.dftIps ?? []).find((i) => i.id === ep.ipId);
    if (!ip) return null;
    const port = catalogEntry(ip.ipType).ports.find((p) => p.name === ep.port);
    if (!port) return null;
    return { dir: port.dir, role: port.role };
  }
  return { dir: ep.pin };
}

export function sameEndpoint(a: DftEndpoint, b: DftEndpoint): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "ip" && b.kind === "ip") return a.ipId === b.ipId && a.port === b.port;
  if (a.kind === "iface" && b.kind === "iface") return a.instanceId === b.instanceId && a.interfaceId === b.interfaceId && a.pin === b.pin;
  return false;
}

export function validateDftWire(scope: HardenDef, from: DftEndpoint, to: DftEndpoint): string | null {
  const fd = endpointDir(scope, from), td = endpointDir(scope, to);
  if (!fd || !td) return "Invalid endpoint";
  if (fd.role === "clock" || td.role === "clock") return "Clock ports do not participate in data-flow wiring";
  if (fd.dir !== "out") return "Start point must be an output port";
  if (td.dir !== "in") return "End point must be an input port";
  // chain 线（ScanHost→EDT 链组挂接）：两端 role 必须配对，且都是 IP 端口
  const fChain = fd.role === "chain", tChain = td.role === "chain";
  if (fChain !== tChain) return "An EDT chain group port can only connect to a ScanHost chain group port";
  if (sameEndpoint(from, to)) return "Cannot connect to itself";
  if (from.kind === "ip" && to.kind === "ip" && from.ipId === to.ipId) return "Cannot connect the same IP to itself";
  if (from.kind === "iface" && to.kind === "iface" && from.interfaceId === to.interfaceId) return "Cannot connect the same interface to itself (out cannot connect back to its own in)";
  const wires = scope.dftWires ?? [];
  if (wires.some((w) => sameEndpoint(w.from, from) && sameEndpoint(w.to, to))) return "This wire already exists";
  if (wires.some((w) => sameEndpoint(w.to, to))) return "This input port is already occupied (each in accepts only one wire)";
  return null;
}

/** 目标是 EDT 链组入口而起点是 ScanHost 的普通出口时，把 from 重写为 chain_group_out（UX：拖到 EDT 上自动变 chain 线）。 */
export function chainAwareFrom(scope: HardenDef, from: DftEndpoint, to: DftEndpoint): DftEndpoint {
  if (to.kind !== "ip" || from.kind !== "ip") return from;
  const toIp = (scope.dftIps ?? []).find((i) => i.id === to.ipId);
  const fromIp = (scope.dftIps ?? []).find((i) => i.id === from.ipId);
  if (!toIp || !fromIp) return from;
  const toPort = catalogEntry(toIp.ipType).ports.find((p) => p.name === to.port);
  if (toPort?.role !== "chain") return from;
  const chainOut = catalogEntry(fromIp.ipType).ports.find((p) => p.dir === "out" && p.role === "chain");
  return chainOut ? { kind: "ip", ipId: from.ipId, port: chainOut.name } : from;
}
