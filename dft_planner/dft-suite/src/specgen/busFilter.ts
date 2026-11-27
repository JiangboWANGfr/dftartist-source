// 按总线域过滤 doc（分层生成用）+ 顶层段切分。纯函数、零 IO。
import type { GenConnDocument, HardenDef, Id } from "../genconn/core/model.ts";
import type { DftEndpoint, DftWire } from "../genconn/core/dft-model.ts";
import type { BusType } from "../genconn/layers.ts";
import { catalogBus, portBus } from "./catalog.ts";

export type Domain = "SSN" | "BSCAN" | "JTAG1838";

/** 线的总线归属：接口按 busType；DI 端点按端口 bus；其余 IP 按 catalogBus。 */
export function wireBusOf(def: HardenDef, w: DftWire): BusType | null {
  for (const ep of [w.from, w.to]) if (ep.kind === "iface") { const f = def.interfaces.find((x) => x.id === ep.interfaceId); if (f) return f.busType; }
  for (const ep of [w.from, w.to]) if (ep.kind === "ip") {
    const i = (def.dftIps ?? []).find((x) => x.id === ep.ipId);
    if (!i) continue;
    if (i.ipType === "DesignInstance") { const b = portBus(i.ipType, ep.port); if (b) return b; }
    else return catalogBus(i.ipType);
  }
  return null;
}

/** BSCAN 域：把 DI 的 bscan_scan_in/out 归一化回生成器认识的 bus_data_in/out。 */
function normBscanEp(ep: DftEndpoint): DftEndpoint {
  if (ep.kind !== "ip") return ep;
  if (ep.port === "bscan_scan_in") return { ...ep, port: "bus_data_in" };
  if (ep.port === "bscan_scan_out") return { ...ep, port: "bus_data_out" };
  return ep;
}

/** 把 doc 过滤成只含某总线域的元素（DI 跨层恒留），BSCAN 域再做端口归一化；生成用。 */
export function filterDocToDomain(doc: GenConnDocument, defId: Id, domain: Domain): GenConnDocument {
  const defs = doc.library.defs.map((d) => {
    if (d.id !== defId) return d;
    const interfaces = d.interfaces.filter((i) => i.busType === domain);
    const dftIps = (d.dftIps ?? []).filter((ip) => ip.ipType === "DesignInstance" || catalogBus(ip.ipType) === domain);
    let dftWires = (d.dftWires ?? []).filter((w) => wireBusOf(d, w) === domain);
    if (domain === "BSCAN") dftWires = dftWires.map((w) => ({ ...w, from: normBscanEp(w.from), to: normBscanEp(w.to) }));
    return { ...d, interfaces, dftIps, dftWires };
  });
  return { ...doc, library: { ...doc.library, defs }, ui: { ...doc.ui, rootDefId: defId } };
}

/** 从 `read_config_data … -from_string { <顶层段…> }` 按花括号配对提取各顶层段 `NAME { … }`，返回 段名→段文本。 */
export function splitSpecSections(specText: string): Record<string, string> {
  const out: Record<string, string> = {};
  const from = specText.indexOf("-from_string");
  const open = specText.indexOf("{", from >= 0 ? from : 0);
  if (open < 0) return out;
  const n = specText.length;
  let i = open + 1;
  const isWs = (c: string) => c === " " || c === "\t" || c === "\n" || c === "\r";
  const isName = (c: string) => /[A-Za-z0-9_]/.test(c);
  while (i < n) {
    while (i < n && isWs(specText[i])) i++;
    if (i >= n || specText[i] === "}") break;          // 外层收尾
    const start = i;
    while (i < n && isName(specText[i])) i++;
    const name = specText.slice(start, i);
    while (i < n && specText[i] !== "{") i++;           // 到该段的 {
    if (i >= n) break;
    let depth = 0, j = i;
    for (; j < n; j++) { if (specText[j] === "{") depth++; else if (specText[j] === "}") { depth--; if (depth === 0) { j++; break; } } }
    if (name) out[name] = specText.slice(start, j).trimEnd();
    i = j;
  }
  return out;
}
