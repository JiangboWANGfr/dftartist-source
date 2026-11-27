// 把 genconn 的 DFT 配对回标注到原始「规整」Verilog 网表：
//  1. 声明 DFT 连线 wire（每条 DFT 信号一根网，按位宽分组）。
//  2. 给每个实例的端口列表末尾追加 DFT `.<信号名>(<网名>)`。
//  3. 接口提升(portedFrom)：给模块头加顶层 port（非 ANSI：头列名 + 体内 input/output 声明），
//     并把它馈通到对应子实例（= generateTcl 的 create_port/create_connection 直接落进 .v）。
// 内容以当前连接模型为准（与 generate 同一套 expand/连接逻辑）；不改 generate（golden 安全）。
// 仅支持规整网表（每实例一段 `module inst ( .port(net), … );`）+ 非 ANSI 模块头。实例名大小写不敏感匹配。
// 纯函数、零依赖，可单测。

import type { BusInterface, HardenDef, HardenInstance, HardenLibrary, Id } from "./model.ts";
import { basesOf, clientSignal, expandInterface, secondarySignal } from "./expand.ts";

/** 去掉信号名末尾的位宽后缀 `[W-1:0]`（仅 SSN 数据总线有）；位宽另由 .width 给 wire 声明。 */
const bareName = (s: string): string => s.replace(/\[\d+:\d+\]$/, "");

/** 实例名归一化（匹配键）：去首尾空白 + 不分大小写。打平网表的转义标识符 `\path/name ` 带尾随空格、有的不带，统一掉。 */
const instKey = (s: string): string => s.trim().toLowerCase();

interface InstPort { port: string; net: string; }
interface DftWiring {
  perInstance: Map<string, InstPort[]>; // 实例名(小写) → 要追加的 .port(net)
  nets: { name: string; width: number }[]; // 去重 DFT 网（保插入序）
}
interface PortDecl { name: string; dir: "input" | "output"; width: number; } // 顶层 port（裸名）

/** 收集一层(root)里 tiling↔tiling 的 DFT 连接 → 每实例追加端口 + 全局网（与 generate 同一套信号展开）。 */
function collectDftWiring(root: HardenDef, lib: HardenLibrary): DftWiring {
  const defs = new Map(lib.defs.map((d) => [d.id, d]));
  const insts = new Map(root.childInstances.map((i) => [i.id, i]));
  const defOf = (i: HardenInstance) => defs.get(i.hardenId);
  const isTiling = (i: HardenInstance) => defOf(i)?.designType === "tiling";
  const ifaceOf = (def: HardenDef | undefined, id: Id): BusInterface | undefined => def?.interfaces.find((x) => x.id === id);

  const perInstance = new Map<string, InstPort[]>();
  const netW = new Map<string, number>();
  const netOrder: string[] = [];
  const addPort = (instName: string, port: string, net: string): void => {
    const key = instKey(instName);
    const arr = perInstance.get(key);
    if (arr) arr.push({ port, net });
    else perInstance.set(key, [{ port, net }]);
  };
  const addNet = (name: string, width: number): void => {
    if (!netW.has(name)) { netW.set(name, width); netOrder.push(name); }
  };

  for (const conn of root.connections) {
    const A = insts.get(conn.secondaryInstanceId);
    const B = insts.get(conn.clientInstanceId);
    if (!A || !B || !isTiling(A) || !isTiling(B)) continue; // 含 hierarchical 端点 → Tessent 自连，不注入
    const S = ifaceOf(defOf(A), conn.secondaryInterfaceId);
    const C = ifaceOf(defOf(B), conn.clientInterfaceId);
    if (!S || !C || S.busType !== C.busType) continue; // 不兼容（合法 doc 不会出现）→ 防御性跳过
    for (const b of basesOf(S)) {
      const ss = secondarySignal(S, b); // secondary 信号（含 if/pd 前缀）= 网名
      const cs = clientSignal(C, b); // client 信号
      // 信号名带 [W-1:0] 后缀（SSN 数据总线）；做 Verilog 标识符时去掉，位宽改放 wire 声明。
      const net = bareName(ss.name);
      addNet(net, ss.width);
      addPort(B.instanceName, bareName(cs.name), net); // client 端口 ← 网
      addPort(A.instanceName, net, net); // secondary 端口（端口名=网名）← 同网
    }
  }
  return { perInstance, nets: netOrder.map((n) => ({ name: n, width: netW.get(n)! })) };
}

/** 收集一层(root)里"提升(portedFrom)"边界接口 → 顶层 port 声明 + 子实例馈通端口（与 generateTcl 同一套 expandInterface）。 */
function collectPortedPorts(root: HardenDef): { portDecls: PortDecl[]; perInstance: Map<string, InstPort[]> } {
  const portDecls: PortDecl[] = [];
  const seen = new Set<string>(); // 顶层 port 声明去重（按裸名）
  const seenFeed = new Set<string>(); // 馈通去重（按 实例\0端口），防同名提升接口产重复 .port(net)
  const perInstance = new Map<string, InstPort[]>();
  const addPort = (instName: string, port: string, net: string): void => {
    const key = instKey(instName);
    if (seenFeed.has(`${key}\0${port}`)) return;
    seenFeed.add(`${key}\0${port}`);
    const arr = perInstance.get(key);
    if (arr) arr.push({ port, net });
    else perInstance.set(key, [{ port, net }]);
  };
  for (const bi of root.interfaces) {
    if (!bi.portedFrom) continue;
    const inst = root.childInstances.find((i) => i.id === bi.portedFrom!.instanceId);
    if (!inst) continue; // 悬空提升（指向的实例已删）→ 跳过
    for (const sig of expandInterface(bi)) {
      const bare = bareName(sig.name); // [W-1:0] 只进声明前缀，不进标识符
      if (!seen.has(bare)) { seen.add(bare); portDecls.push({ name: bare, dir: sig.direction, width: sig.width }); }
      addPort(inst.instanceName, bare, bare); // 馈通：.bare(bare)，端口名=网名=顶层 port 名
    }
  }
  return { portDecls, perInstance };
}

/**
 * 这层 def 是否需要 .v 注入。严格等于 injectDft 的实际改动条件（有连接网 或 有提升 port），
 * 故悬空提升 / 不兼容连接等"算不出东西"的情形返回 false，避免 UI 导出一份逐字未变的 .v。
 */
export function defNeedsDft(root: HardenDef, lib: HardenLibrary): boolean {
  return collectDftWiring(root, lib).nets.length > 0 || collectPortedPorts(root).portDecls.length > 0;
}

/** 从位置 `open`（一个 '(' 的下标）起按括号配深，返回与之配对的 ')' 的下标；不配对返回 -1。 */
function matchParen(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** 把 // 行注释和 /* *​/ 块注释内容替换成空格（保留长度与换行），供配括号/扫描/关键字判断用——下标不变，可直接 splice 回原文。 */
function maskComments(text: string): string {
  const out = text.split("");
  const n = text.length;
  let i = 0;
  while (i < n) {
    if (text[i] === "/" && text[i + 1] === "/") {
      while (i < n && text[i] !== "\n") { out[i] = " "; i++; }
    } else if (text[i] === "/" && text[i + 1] === "*") {
      out[i] = " "; out[i + 1] = " "; i += 2;
      while (i < n && !(text[i] === "*" && text[i + 1] === "/")) { if (text[i] !== "\n") out[i] = " "; i++; }
      if (i < n) { out[i] = " "; out[i + 1] = " "; i += 2; }
    } else { i++; }
  }
  return out.join("");
}

interface ModuleBounds { headerOpen: number; headerClose: number; bodyStart: number; bodyEnd: number; }

/** 在去注释文本里定位名为 designName 的 module：头部 ( / )、体起点(头部 ; 之后)、体终点(endmodule 或文末)。找不到 → 抛错。 */
function findModuleBounds(masked: string, designName: string): ModuleBounds {
  const re = /\bmodule\s+(\w+)\s*\(/gi;
  let m: RegExpExecArray | null;
  let headerOpen = -1;
  while ((m = re.exec(masked)) !== null) {
    if (m[1].toLowerCase() === designName.toLowerCase()) { headerOpen = masked.indexOf("(", m.index); break; }
  }
  if (headerOpen < 0) throw new Error(`module '${designName}' not found in the netlist`);
  const headerClose = matchParen(masked, headerOpen);
  if (headerClose < 0) throw new Error(`module '${designName}' port list is not closed (netlist format irregular?)`);
  const semi = masked.indexOf(";", headerClose);
  if (semi < 0) throw new Error(`module '${designName}' header is missing ';'`);
  const end = masked.indexOf("endmodule", semi);
  return { headerOpen, headerClose, bodyStart: semi + 1, bodyEnd: end < 0 ? masked.length : end };
}

const fmtWidth = (w: number): string => (w > 1 ? `[${w - 1}:0] ` : "");

/** DFT 网的 wire 声明块（1bit 一组 + 每个 >1 位宽各一组），缩进 2 空格。 */
function wireBlock(nets: { name: string; width: number }[]): string {
  const byWidth = new Map<number, string[]>();
  for (const n of nets) {
    const arr = byWidth.get(n.width);
    if (arr) arr.push(n.name);
    else byWidth.set(n.width, [n.name]);
  }
  const lines: string[] = [];
  for (const [w, names] of [...byWidth.entries()].sort((a, b) => a[0] - b[0])) {
    lines.push(`  wire ${fmtWidth(w)}${names.join(", ")};`);
  }
  return lines.join("\n");
}

/**
 * 给非 ANSI 模块头加顶层 port：①头部端口名列表追加裸名；②体内（紧跟 `module …);`）加方向声明。
 * masked = 去注释文本（关键字/逗号判断用），b = 该模块边界。ANSI 风格头 / 与原端口重名 → 抛错。
 */
function headerPortEdits(masked: string, designName: string, b: ModuleBounds, portDecls: PortDecl[]): { at: number; insert: string }[] {
  const headerText = masked.slice(b.headerOpen + 1, b.headerClose);
  if (/\b(input|output|inout)\b/.test(headerText))
    throw new Error(`module '${designName}' uses ANSI port style; adding promoted ports is not yet supported`);
  const existing = new Set(headerText.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
  const dup = portDecls.filter((p) => existing.has(p.name.toLowerCase()));
  if (dup.length) throw new Error(`Promoted port name collides with existing module port(s): ${dup.map((p) => p.name).join(", ")}`);
  const emptyHeader = headerText.trim() === ""; // module M (); → 不加前导逗号
  const names = portDecls.map((p) => p.name).join(",\n             ");
  const decls = portDecls.map((p) => `${p.dir} ${fmtWidth(p.width)}${p.name};`).join("\n  ");
  return [
    { at: b.headerClose, insert: `${emptyHeader ? "" : ","}\n             ${names}` }, // 头部 ) 前追加裸名
    { at: b.bodyStart, insert: `\n  ${decls}` }, // 头部 ; 后追加方向声明
  ];
}

/**
 * 把 DFT 连接 + 接口提升注入规整 Verilog 网表 vText：
 *  - 连接：声明 DFT wire + 给各实例末尾追加 .端口(网)。
 *  - 提升：模块头加顶层 port（非 ANSI）+ 馈通到对应子实例。
 * parentDefId = 这层 def（其 .v 即 vText）。无连接也无提升 → 原样返回。
 * 实例名按大小写不敏感匹配；genconn 中有、网表里找不到的实例 → 抛错并列出。
 */
export function injectDft(vText: string, lib: HardenLibrary, parentDefId: Id): string {
  const root = lib.defs.find((d) => d.id === parentDefId);
  if (!root) throw new Error(`Unknown def '${parentDefId}'`);
  const { perInstance, nets } = collectDftWiring(root, lib);
  const ported = collectPortedPorts(root);
  // 提升的馈通端口并进 perInstance（同实例 → 端口列表拼接）。
  for (const [k, arr] of ported.perInstance) {
    const ex = perInstance.get(k);
    if (ex) ex.push(...arr);
    else perInstance.set(k, arr);
  }
  if (nets.length === 0 && ported.portDecls.length === 0) return vText; // 无连接无提升 → 原样返回

  // 归一化(去空白+不分大小写)匹配下，仅大小写/空白不同的待注入子实例会混淆 → 抛错而非静默把端口串到错的实例。
  const keyOwner = new Map<string, string>();
  for (const i of root.childInstances) {
    const k = instKey(i.instanceName);
    if (!perInstance.has(k)) continue; // 不在注入集 → 无所谓
    const prev = keyOwner.get(k);
    if (prev !== undefined && prev !== i.instanceName.trim()) {
      throw new Error(`Instance names conflict after normalization (differ only in case/whitespace): '${prev}' and '${i.instanceName.trim()}'`);
    }
    keyOwner.set(k, i.instanceName.trim());
  }

  // 去注释副本做所有"扫描/配括号/关键字判断"（下标与原文一致，edits 直接 splice 回原文）。
  const masked = maskComments(vText);
  // 只在目标 module(root.designName) 体内注入：多 module 文件里同名实例不被误碰，且模块头不当实例。
  const b = findModuleBounds(masked, root.designName);

  const edits: { at: number; insert: string }[] = [];
  // 提升：改模块头（加顶层 port + 方向声明）。ANSI / 重名 → 抛错。
  if (ported.portDecls.length > 0) edits.push(...headerPortEdits(masked, root.designName, b, ported.portDecls));

  // 扫描目标 module 体内实例化 `<module> [#(参数)] <inst> (`，定位其闭合 ')'。
  // 实例/模块名既可是普通标识符，也可是 Verilog 转义标识符（`\` 起、到空白止；打平网表常见 `\path/name `）。
  const re = /(\\\S+|[A-Za-z_]\w*)\s+(?:#\s*\((?:[^()]|\([^()]*\))*\)\s*)?(\\\S+|[A-Za-z_]\w*)\s*\(/g;
  re.lastIndex = b.bodyStart;
  const matched = new Set<string>();
  let firstInstStart = -1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(masked)) !== null) {
    if (m.index >= b.bodyEnd) break; // 出了目标模块体
    const instName = m[2];
    const key = instKey(instName);
    const ports = perInstance.get(key);
    if (!ports) continue; // 不是我们要注入的实例
    if (matched.has(key)) throw new Error(`Multiple instances in the netlist have the same name after normalization: '${instName.trim()}'`); // netlist-side name collision
    matched.add(key);
    if (firstInstStart < 0 || m.index < firstInstStart) firstInstStart = m.index;
    const open = masked.indexOf("(", m.index + m[0].length - 1); // 该实例端口表的 '('（参数块已被 m[0] 吃掉）
    const close = matchParen(masked, open);
    if (close < 0) throw new Error(`instance '${instName}' port list is not closed (netlist format irregular?)`);
    const empty = masked.slice(open + 1, close).trim() === ""; // 空端口表 () → 不加前导逗号
    const dft = ports.map((p) => `.${p.port}(${p.net})`).join(", ");
    edits.push({ at: close, insert: `${empty ? "" : ","}\n          ${dft}` }); // 在闭合 ')' 前追加
    re.lastIndex = close; // 跳过本实例内部，避免把 `.port(` 误当实例
  }

  // genconn 里有、但目标 module 体内没找到的实例
  const unmatched = [...perInstance.keys()].filter((k) => !matched.has(k));
  if (unmatched.length) throw new Error(`These instances were not found in the netlist (names don't match genconn instances): ${unmatched.join(", ")}`);

  // wire 块插在目标 module 内首个实例之前（仅当有连接网）
  if (nets.length > 0 && firstInstStart >= 0) edits.push({ at: firstInstStart, insert: `${wireBlock(nets)}\n` });

  // 从后往前 splice（下标不失效）
  edits.sort((a, b) => b.at - a.at);
  let out = vText;
  for (const e of edits) out = out.slice(0, e.at) + e.insert + out.slice(e.at);
  return out;
}
