# SpecGen DesignInstance 按总线连线 + spec 预览/输出按层分开 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让一个 DesignInstance 能同时被 SSN 与 BSCAN 各连一条线；spec 预览按活动层分开、输出按顶层段拆成 `Spec/ssn|edt|bscan` 三文件，一层断链不拖累另一层。

**Architecture:** DesignInstance 加 SSN/BSCAN 各一对 in/out 端口（带 `bus` 标注），拉线按活动层解析端口，避开 fan-in 冲突。生成时按域（SSN 含 EDT / BSCAN）过滤 doc 分别调 `specgen gen`（BSCAN 域把 DI 的 `bscan_scan_*` 归一化回 `bus_data_*`，因生成器只认后者），再按顶层段 `SSN`/`EDT`/`EmbeddedBoundaryScan` 切文件。

**Tech Stack:** TypeScript、React + react-konva、`node --test`、C++ `specgen` CLI（`../dft-core/build/specgen`，经 `window.dft` 桥接；**无需改动**）。

**参考设计：** `docs/specs/2026-07-13-specgen-di-multibus-and-per-layer-spec-design.md`（R1 spike 已验证：生成器支持 DI→`EBScanInstance`）

---

## 文件结构

| 文件 | 职责 | 改动 |
|---|---|---|
| `src/specgen/catalog.ts` | 端口目录 | `DftPort` 加 `bus?`；DI 改 4 口；加 `portBus` |
| `src/specgen/DftIpNode.tsx` | IP 节点 | 加 `activeLayer` prop；DI 的 out 口按层解析 |
| `src/specgen/Workspace.tsx` | 画布 + 预览面板 | `wireBus`/`onBodyEnter` 按层解析 DI 口；预览按域生成；保存/写工程出 3 文件 |
| `src/specgen/busFilter.ts` | 新 | `filterDocToDomain`、`splitSpecSections` |
| `src/store/outputLayout.ts` | 产物落盘映射 | 加 `specFilesBySection` |
| `tests/unit/specgen-catalog.test.ts` | 扩 | DI 端口 + `portBus` |
| `tests/unit/specgen-busfilter.test.ts` | 新 | `filterDocToDomain` + `splitSpecSections` |
| `tests/unit/output-layout.test.ts` | 扩 | `specFilesBySection` |
| `tests/integration/specgen-cli.test.ts` | 扩 | 域隔离 + DI→EBScanInstance |

---

# Part A — DesignInstance 按总线拆端口

## Task 1: catalog —— DftPort.bus + DI 四端口 + portBus

**Files:**
- Modify: `src/specgen/catalog.ts`
- Test: `tests/unit/specgen-catalog.test.ts`

- [ ] **Step 1: 写失败测试**

在 `tests/unit/specgen-catalog.test.ts` 末尾追加（文件已有 `import { test } from "node:test"; import assert ...`；补 `portBus`、`catalogEntry` 到从 `../../src/specgen/catalog.ts` 的 import）：

```ts
import { catalogEntry, portBus } from "../../src/specgen/catalog.ts";

test("DesignInstance 有 SSN/BSCAN 各一对 in/out，带 bus 标注", () => {
  const ports = catalogEntry("DesignInstance").ports;
  const byName = Object.fromEntries(ports.map((p) => [p.name, p]));
  assert.equal(byName["bus_data_in"].bus, "SSN");
  assert.equal(byName["bus_data_out"].bus, "SSN");
  assert.equal(byName["bscan_scan_in"].bus, "BSCAN");
  assert.equal(byName["bscan_scan_out"].bus, "BSCAN");
  assert.equal(byName["bus_data_in"].dir, "in");
  assert.equal(byName["bscan_scan_out"].dir, "out");
});

test("portBus 返回端口的 bus；无 bus 或未知端口返回 undefined", () => {
  assert.equal(portBus("DesignInstance", "bscan_scan_in"), "BSCAN");
  assert.equal(portBus("DesignInstance", "bus_data_out"), "SSN");
  assert.equal(portBus("Pipeline", "bus_data_in"), undefined); // 单层 IP 端口无 bus 标注
  assert.equal(portBus("DesignInstance", "nope"), undefined);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/unit/specgen-catalog.test.ts`
Expected: 新 2 条 FAIL（`portBus` 未导出 / DI 无 4 口）。

- [ ] **Step 3: 实现**

在 `src/specgen/catalog.ts`：

给 `DftPort` 接口加可选 `bus`（在 `role?` 后）：
```ts
export interface DftPort { name: string; dir: "in" | "out"; side: PortSide; role?: "master" | "secondary" | "clock" | "data" | "chain"; bus?: "SSN" | "BSCAN"; }
```

把 DesignInstance 那一行（现 `{ ipType: "DesignInstance", …, ports: [DATA_IN, DATA_OUT] }`）替换为四端口（带 bus）：
```ts
  { ipType: "DesignInstance", label: "DesignInstance", abbr: "DI", group: "datapath", ports: [
    { name: "bus_data_in",    dir: "in",  side: "left",  role: "data", bus: "SSN" },
    { name: "bus_data_out",   dir: "out", side: "right", role: "data", bus: "SSN" },
    { name: "bscan_scan_in",  dir: "in",  side: "left",  role: "data", bus: "BSCAN" },
    { name: "bscan_scan_out", dir: "out", side: "right", role: "data", bus: "BSCAN" },
  ] },
```

在文件末尾加 `portBus`：
```ts
/** 端口所属总线（DesignInstance 的 SSN/BSCAN 口用）；无标注或未知端口返回 undefined。 */
export function portBus(ipType: DftIpType, portName: string): "SSN" | "BSCAN" | undefined {
  return catalogEntry(ipType).ports.find((p) => p.name === portName)?.bus;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test tests/unit/specgen-catalog.test.ts`
Expected: 全 PASS。然后 `npm run typecheck` → clean。

- [ ] **Step 5: Commit**

```bash
git add src/specgen/catalog.ts tests/unit/specgen-catalog.test.ts
git commit -m "feat(specgen): DesignInstance 加 SSN/BSCAN 四端口(带 bus) + portBus"
```

---

## Task 2: 按活动层解析 DI 端口（wireBus / onBodyEnter / DftIpNode）

**Files:**
- Modify: `src/specgen/DftIpNode.tsx`、`src/specgen/Workspace.tsx`
- 验证：`npm run build` + 手动

- [ ] **Step 1: DftIpNode 接收 `activeLayer`，DI 的 out 口按层解析**

`src/specgen/DftIpNode.tsx`：
- 顶部补类型：`import type { Side } from "../genconn/layout.ts";` 已有；再补 `import type { BusType } from "../genconn/layers.ts";`
- props 解构加 `activeLayer`，类型加 `activeLayer: BusType | null;`（放在 `pos` 附近）。
- 把 `const outPort = ports.find((p) => p.dir === "out" && p.role !== "clock");` 改为：
```ts
  const outPort = ip.ipType === "DesignInstance"
    ? ports.find((p) => p.dir === "out" && p.bus === activeLayer)
    : ports.find((p) => p.dir === "out" && p.role !== "clock");
```
（`activeLayer===null`（只读全部）时 DI outPort=undefined → 无起线点，符合只读语义。）

- [ ] **Step 2: Workspace 传 `activeLayer` 给 DftIpNode + onBodyEnter 按层取 DI in 口**

`src/specgen/Workspace.tsx`：
- 在 `<DftIpNode … />`（IP 渲染处，现已传 `ip`/`pos`）加 `activeLayer={activeLayer}`。
- `onBodyEnter`（现 `const plainIn = catalogEntry(ip.ipType).ports.find((p) => p.dir === "in" && p.role !== "clock" && p.role !== "master" && p.role !== "secondary");`）改为 DI 按层取 in 口：
```ts
                      const plainIn = ip.ipType === "DesignInstance"
                        ? catalogEntry(ip.ipType).ports.find((p) => p.dir === "in" && p.bus === activeLayer)
                        : catalogEntry(ip.ipType).ports.find((p) => p.dir === "in" && p.role !== "clock" && p.role !== "master" && p.role !== "secondary");
```

- [ ] **Step 3: wireBus 用端口 bus 归属 DI 线**

`src/specgen/Workspace.tsx`，`wireBus`（约 `:182`）。补 `portBus` 到从 `./catalog.ts` 的 import（现已 import `catalogEntry, catalogBus`）。把 `wireBus` 改为：
```ts
  const wireBus = (w: DftWire): BusType | null => {
    for (const ep of [w.from, w.to]) if (ep.kind === "iface") { const f = scope?.interfaces.find((x) => x.id === ep.interfaceId); if (f) return f.busType; }
    for (const ep of [w.from, w.to]) if (ep.kind === "ip") {
      const i = scope?.dftIps?.find((x) => x.id === ep.ipId);
      if (!i) continue;
      if (i.ipType === "DesignInstance") { const b = portBus(i.ipType, ep.port); if (b) return b; }
      else return catalogBus(i.ipType);
    }
    return null;
  };
```
（原来 DI 端点被跳过、两端都是 DI 的线返回 null 恒可见；现改为用 DI 端口的 bus 定层。注意 `:514` 那句注释 `null=两端都是 DI → 跨层恒可见` 现只在「DI 端口无 bus」这种异常时才 null，可保留。）

- [ ] **Step 4: 构建 + typecheck**

Run: `npm run build`
Expected: `tsc --noEmit` + vite build 通过。`npm test` 全绿（无回归）。

- [ ] **Step 5: 手动验证（不能自动化）**

`npm run dev:electron`，打开 `/Users/jiangbowang/Desktop/chip4.arch` → SpecGen → tracking_channel：
1. SSN 层：从 DI 起线 / 连到 DI（走 SSN 口）。
2. 切 BSCAN 层：再从**同一个 DI** 起线 / 连到它（走 BSCAN 口）——不再被「该输入端口已被占用」挡住。
3. SSN 层只显 DI 的 SSN 线、BSCAN 层只显 DI 的 BSCAN 线。

- [ ] **Step 6: Commit**

```bash
git add src/specgen/DftIpNode.tsx src/specgen/Workspace.tsx
git commit -m "feat(specgen): DI 端口按活动层解析(SSN/BSCAN 各连一条不冲突) + DI 线按端口 bus 归层"
```

---

# Part B — spec 预览/输出按层分开

## Task 3: filterDocToDomain（按域过滤 + BSCAN 端口归一化）

**Files:**
- Create: `src/specgen/busFilter.ts`
- Test: `tests/unit/specgen-busfilter.test.ts`

- [ ] **Step 1: 写失败测试**

新建 `tests/unit/specgen-busfilter.test.ts`：
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import type { GenConnDocument, HardenDef } from "../../src/genconn/core/model.ts";
import type { DftIpInstance, DftWire } from "../../src/genconn/core/dft-model.ts";
import { filterDocToDomain } from "../../src/specgen/busFilter.ts";

function doc(dftIps: DftIpInstance[], dftWires: DftWire[], interfaces: HardenDef["interfaces"]): GenConnDocument {
  const root: HardenDef = { id: "p", designName: "p", designLevel: "sub_block", designType: "tiling",
    interfaces, childInstances: [], connections: [], inSpecgen: true, dftIps, dftWires };
  return { schemaVersion: 1, library: { defs: [root] }, ui: { openDefId: "p", rootDefId: "p" },
    ctrlIps: [], dfxInstances: [], moduleDsNext: 1, muxDsNext: 1 };
}
const topOf = (d: GenConnDocument) => d.library.defs.find((x) => x.id === "p")!;

const di: DftIpInstance = { id: "di1", ipType: "DesignInstance", instanceName: "h1", position: { x: 0, y: 0 } };
const pp: DftIpInstance = { id: "pp1", ipType: "Pipeline", instanceName: "pp_1", position: { x: 0, y: 0 } };
const ebp: DftIpInstance = { id: "ebp1", ipType: "EBScanPipeline", instanceName: "ebp_1", position: { x: 0, y: 0 } };
const ssnW: DftWire = { id: "w_ssn", from: { kind: "ip", ipId: "pp1", port: "bus_data_out" }, to: { kind: "ip", ipId: "di1", port: "bus_data_in" } };
const bscanW: DftWire = { id: "w_bscan", from: { kind: "ip", ipId: "ebp1", port: "scan_out" }, to: { kind: "ip", ipId: "di1", port: "bscan_scan_in" } };
const ifs: HardenDef["interfaces"] = [{ id: "s", busType: "SSN", role: "client", busWidth: 4 }, { id: "b", busType: "BSCAN", role: "client", bscanVariant: "DC" }];

test("filterDocToDomain SSN：留 SSN 接口 + Pipeline + DI + SSN 线，去 BSCAN", () => {
  const d = topOf(filterDocToDomain(doc([pp, ebp, di], [ssnW, bscanW], ifs), "p", "SSN"));
  assert.deepEqual(d.interfaces.map((i) => i.busType), ["SSN"]);
  assert.deepEqual((d.dftIps ?? []).map((i) => i.id).sort(), ["di1", "pp1"]);
  assert.deepEqual((d.dftWires ?? []).map((w) => w.id), ["w_ssn"]);
});

test("filterDocToDomain BSCAN：留 BSCAN 接口 + EBScanPipeline + DI + BSCAN 线，且 DI 端口归一化为 bus_data_in", () => {
  const d = topOf(filterDocToDomain(doc([pp, ebp, di], [ssnW, bscanW], ifs), "p", "BSCAN"));
  assert.deepEqual(d.interfaces.map((i) => i.busType), ["BSCAN"]);
  assert.deepEqual((d.dftIps ?? []).map((i) => i.id).sort(), ["di1", "ebp1"]);
  const w = (d.dftWires ?? [])[0];
  assert.equal(w.id, "w_bscan");
  assert.equal((w.to as { port: string }).port, "bus_data_in", "DI 的 bscan_scan_in 归一化为 bus_data_in");
});

test("filterDocToDomain 设 rootDefId", () => {
  const out = filterDocToDomain(doc([], [], ifs), "p", "SSN");
  assert.equal(out.ui.rootDefId, "p");
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/unit/specgen-busfilter.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 `src/specgen/busFilter.ts`**

```ts
// 按总线域过滤 doc（分层生成用）+ 顶层段切分。纯函数、零 IO。
import type { GenConnDocument, HardenDef, Id } from "../genconn/core/model.ts";
import type { DftEndpoint, DftWire } from "../genconn/core/dft-model.ts";
import { catalogBus, catalogEntry } from "./catalog.ts";

export type Domain = "SSN" | "BSCAN";

/** 线的总线归属：接口按 busType；DI 端点按端口 bus；其余 IP 按 catalogBus。 */
function wireBusOf(def: HardenDef, w: DftWire): string | null {
  for (const ep of [w.from, w.to]) if (ep.kind === "iface") { const f = def.interfaces.find((x) => x.id === ep.interfaceId); if (f) return f.busType; }
  for (const ep of [w.from, w.to]) if (ep.kind === "ip") {
    const i = (def.dftIps ?? []).find((x) => x.id === ep.ipId);
    if (!i) continue;
    if (i.ipType === "DesignInstance") { const b = catalogEntry(i.ipType).ports.find((p) => p.name === ep.port)?.bus; if (b) return b; }
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
```

- [ ] **Step 4: 运行确认通过 + typecheck**

Run: `node --test tests/unit/specgen-busfilter.test.ts && npm run typecheck`
Expected: 3 PASS；typecheck clean。

- [ ] **Step 5: Commit**

```bash
git add src/specgen/busFilter.ts tests/unit/specgen-busfilter.test.ts
git commit -m "feat(specgen): filterDocToDomain 按域过滤 doc + BSCAN 域 DI 端口归一化"
```

---

## Task 4: splitSpecSections（顶层段切分）

**Files:**
- Modify: `src/specgen/busFilter.ts`
- Test: `tests/unit/specgen-busfilter.test.ts`

- [ ] **Step 1: 写失败测试**（追加到 `tests/unit/specgen-busfilter.test.ts`，import 补 `splitSpecSections`）

```ts
import { splitSpecSections } from "../../src/specgen/busFilter.ts";

const SSN_EDT = `read_config_data -in_wrapper $dftspec -rep -from_string {
  SSN {
    DataPath (1) {
      ScanHost (ssh_1) {
        ChainGroup (edt_1) {
        }
      }
    }
  }
  EDT {
    Controller (edt_1) {
    }
  }
}`;

test("splitSpecSections 从 SSN+EDT 输出切出两段，花括号配对不吞不漏", () => {
  const secs = splitSpecSections(SSN_EDT);
  assert.deepEqual(Object.keys(secs).sort(), ["EDT", "SSN"]);
  assert.ok(secs.SSN.startsWith("SSN {"));
  assert.ok(secs.SSN.includes("ChainGroup (edt_1)")); // 内层嵌套花括号被正确包含
  assert.ok(secs.SSN.trimEnd().endsWith("}"));
  assert.ok(secs.EDT.startsWith("EDT {"));
  assert.ok(secs.EDT.includes("Controller (edt_1)"));
});

test("splitSpecSections 从 EmbeddedBoundaryScan 输出切一段", () => {
  const bscan = `read_config_data -in_wrapper $dftspec -rep -from_string {
  EmbeddedBoundaryScan {
    HostBScanInterface (client) {
      EBScanInstance (h1) {
      }
    }
  }
}`;
  const secs = splitSpecSections(bscan);
  assert.deepEqual(Object.keys(secs), ["EmbeddedBoundaryScan"]);
  assert.ok(secs.EmbeddedBoundaryScan.includes("EBScanInstance (h1)"));
});

test("splitSpecSections 对空/无 from_string 文本返回空对象", () => {
  assert.deepEqual(splitSpecSections(""), {});
  assert.deepEqual(splitSpecSections("// 还不能生成：xxx"), {});
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/unit/specgen-busfilter.test.ts`
Expected: 新 3 条 FAIL（`splitSpecSections` 未导出）。

- [ ] **Step 3: 实现**（追加到 `src/specgen/busFilter.ts`）

```ts
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
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test tests/unit/specgen-busfilter.test.ts`
Expected: 全 PASS。`npm run typecheck` clean。

- [ ] **Step 5: Commit**

```bash
git add src/specgen/busFilter.ts tests/unit/specgen-busfilter.test.ts
git commit -m "feat(specgen): splitSpecSections 按顶层段切分生成的 spec"
```

---

## Task 5: specFilesBySection（三文件落盘映射）

**Files:**
- Modify: `src/store/outputLayout.ts`
- Test: `tests/unit/output-layout.test.ts`

- [ ] **Step 1: 写失败测试**（追加到 `tests/unit/output-layout.test.ts`，import 补 `specFilesBySection`）

```ts
import { specFilesBySection } from "../../src/store/outputLayout.ts";

test("specFilesBySection 落 ssn/edt/bscan 三文件，各带 wrapper；空段跳过", () => {
  const files = specFilesBySection("chan", { SSN: "SSN { }", EDT: "EDT { }", EmbeddedBoundaryScan: "EmbeddedBoundaryScan { }" });
  assert.deepEqual(files.map((f) => f.relPath), ["Spec/ssn/chan.dftspec", "Spec/edt/chan.dftspec", "Spec/bscan/chan.dftspec"]);
  assert.ok(files[0].text.startsWith("read_config_data -in_wrapper $dftspec -rep -from_string {"));
  assert.ok(files[0].text.includes("SSN { }"));
  assert.equal(specFilesBySection("chan", { SSN: "  " }).length, 0, "空/空白段跳过");
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/unit/output-layout.test.ts`
Expected: FAIL（未导出）。

- [ ] **Step 3: 实现**（追加到 `src/store/outputLayout.ts`）

```ts
/** 生成的各顶层段 → 分文件：SSN→Spec/ssn、EDT→Spec/edt、EmbeddedBoundaryScan→Spec/bscan；各自包 read_config_data wrapper。 */
export function specFilesBySection(design: string, secs: Record<string, string>): OutFile[] {
  const wrap = (s: string) => `read_config_data -in_wrapper $dftspec -rep -from_string {\n${s}\n}\n`;
  const put = (sec: string | undefined, rel: string): OutFile[] => (sec && sec.trim()) ? [{ relPath: rel, text: wrap(sec) }] : [];
  return [
    ...put(secs.SSN, `Spec/ssn/${design}.dftspec`),
    ...put(secs.EDT, `Spec/edt/${design}.dftspec`),
    ...put(secs.EmbeddedBoundaryScan, `Spec/bscan/${design}.dftspec`),
  ];
}
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test tests/unit/output-layout.test.ts`
Expected: PASS。`npm run typecheck` clean。

- [ ] **Step 5: Commit**

```bash
git add src/store/outputLayout.ts tests/unit/output-layout.test.ts
git commit -m "feat(specgen): specFilesBySection —— SSN/EDT/BScan 段落三文件"
```

---

## Task 6: Workspace 预览按域生成 + 保存/写工程出三文件

**Files:**
- Modify: `src/specgen/Workspace.tsx`
- 验证：`npm run build` + 手动

- [ ] **Step 1: import**

`src/specgen/Workspace.tsx` 顶部补：
```ts
import { filterDocToDomain, splitSpecSections } from "./busFilter.ts";
import { specFilesBySection } from "../store/outputLayout.ts";
```
（现有 `import { specFile } from "../store/outputLayout.ts";` 合并为 `import { specFile, specFilesBySection } from "../store/outputLayout.ts";`。）

- [ ] **Step 2: 按域生成的 state + effect**

把现有单份预览 state/effect（`const [specText, setSpecText] = useState("");` 及其 `useEffect`）替换为按域两份：
```ts
  const [specByDomain, setSpecByDomain] = useState<{ SSN: string; BSCAN: string }>({ SSN: "", BSCAN: "" });
  useEffect(() => {
    if (!scope) { setSpecByDomain({ SSN: "", BSCAN: "" }); return; }
    if (!hasBridge()) { const m = "// 预览需在应用内运行（未检测到 dft 原生桥接）。"; setSpecByDomain({ SSN: m, BSCAN: m }); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      const gen = async (domain: "SSN" | "BSCAN") => {
        try { return await dftSpecgen.generate(serialize(filterDocToDomain(doc, scope.id, domain) as GenConnDocument)); }
        catch (e) { return "// 还不能生成：" + (e as Error).message; }
      };
      const [SSN, BSCAN] = await Promise.all([gen("SSN"), gen("BSCAN")]);
      if (!cancelled) setSpecByDomain({ SSN, BSCAN });
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [doc, scope]);

  // 面板显示：按活动层选域；全部 → 两域并排。
  const specDisplay = activeLayer === "BSCAN" ? specByDomain.BSCAN
    : activeLayer === "SSN" ? specByDomain.SSN
    : `// —— SSN ——\n${specByDomain.SSN}\n\n// —— BScan ——\n${specByDomain.BSCAN}`;
  // 保存/写工程用的三段：两域各切顶层段合并。
  const specSections = (): Record<string, string> => ({ ...splitSpecSections(specByDomain.SSN), ...splitSpecSections(specByDomain.BSCAN) });
```

- [ ] **Step 3: 预览面板显示与按钮改用 specDisplay / 三文件**

面板里（现 `<pre className="dft-preview">{specText}</pre>` 与三个按钮）：
- `<pre>` 改 `{specDisplay}`。
- 面板标题现 `<span>DftSpecification</span>` 改为带域名：
```ts
                  <span>DftSpecification{activeLayer ? `（${activeLayer === "BSCAN" ? "BScan" : "SSN"}）` : "（全部）"}</span>
```
- 「复制」`navigator.clipboard?.writeText(specText)` → `writeText(specDisplay)`。
- 「保存」现 `downloadText(\`${scope?.designName ?? "dft"}.dftspec\`, specText)` → 下载三份：
```ts
                    <button onClick={() => { const d = scope?.designName ?? "dft"; for (const f of specFilesBySection(d, specSections())) downloadText(f.relPath.split("/").pop()!, f.text); }}>保存</button>
```
- 「写入工程」现 `writeToProject([specFile(scope?.designName ?? "dft", specText)])` → 写三份：
```ts
                    {projOpen && <button onClick={() => void writeToProject(specFilesBySection(scope?.designName ?? "dft", specSections()))}>写入工程</button>}
```
（若 `specFile` 与 `specText` 从此无引用 → 删 `specFile` 的 import 与旧 `specText` 残留，`npm run typecheck` 会报未使用/未定义帮你定位。）

- [ ] **Step 4: 构建 + typecheck**

Run: `npm run build`
Expected: typecheck + build 通过（无 `specText` 悬空引用）。`npm test` 全绿。

- [ ] **Step 5: 手动验证**

`npm run dev:electron`，chip4.arch → SpecGen → tracking_channel：
1. SSN 层：预览显示 SSN（含 EDT 段）spec；BSCAN 断链时 SSN 仍正常显示（治痛点）。
2. BSCAN 层：预览显示 BScan spec（或该层的断链错误），不影响 SSN。
3. 「写入工程」→ 工程里出现 `Spec/ssn/…`、`Spec/edt/…`（若有 EDT）、`Spec/bscan/…` 三文件。

- [ ] **Step 6: Commit**

```bash
git add src/specgen/Workspace.tsx
git commit -m "feat(specgen): 预览按活动层分域生成 + 保存/写工程出 ssn/edt/bscan 三文件"
```

---

## Task 7: 集成回归（CLI）—— 域隔离 + DI→EBScanInstance

**Files:**
- Modify: `tests/integration/specgen-cli.test.ts`

- [ ] **Step 1: 写测试**（追加；文件已 `import { specgenGen }`；补 `filterDocToDomain` from `../../src/specgen/busFilter.ts`、`serialize` from `../../src/genconn/core/document.ts`）

```ts
import { filterDocToDomain } from "../../src/specgen/busFilter.ts";
import { serialize } from "../../src/genconn/core/document.ts";
import type { GenConnDocument, HardenDef } from "../../src/genconn/core/model.ts";

function scopeDoc(over: Partial<HardenDef>): GenConnDocument {
  const root: HardenDef = { id: "p", designName: "p", designLevel: "sub_block", designType: "tiling",
    interfaces: [], childInstances: [], connections: [], inSpecgen: true, dftIps: [], dftWires: [], ...over };
  return { schemaVersion: 1, library: { defs: [root] }, ui: { openDefId: "p", rootDefId: "p" },
    ctrlIps: [], dfxInstances: [], moduleDsNext: 1, muxDsNext: 1 };
}

test("域隔离：BSCAN 断链不影响 SSN 域生成", { skip: !have }, async () => {
  const d = scopeDoc({
    interfaces: [{ id: "s", busType: "SSN", role: "client", busWidth: 8 }, { id: "b", busType: "BSCAN", role: "client", bscanVariant: "DC" }],
    dftIps: [{ id: "ssh", ipType: "ScanHost", instanceName: "ssh_1", position: { x: 0, y: 0 } }],
    // 完整 SSN datapath；BSCAN 只有个孤立接口 → BSCAN 域会断链
    dftWires: [
      { id: "w1", from: { kind: "iface", instanceId: "p", interfaceId: "s", pin: "out" }, to: { kind: "ip", ipId: "ssh", port: "bus_data_in" } },
      { id: "w2", from: { kind: "ip", ipId: "ssh", port: "bus_data_out" }, to: { kind: "iface", instanceId: "p", interfaceId: "s", pin: "in" } },
    ],
  });
  const ssn = await specgenGen(serialize(filterDocToDomain(d, "p", "SSN")));
  assert.ok(ssn.includes("ScanHost (ssh_1)"), "SSN 域独立生成成功，不被 BSCAN 断链拖累");
  await assert.rejects(() => specgenGen(serialize(filterDocToDomain(d, "p", "BSCAN"))), "BSCAN 域断链单独报错");
});

test("DI 在 BScan 链 → 归一化后生成 EBScanInstance", { skip: !have }, async () => {
  const d = scopeDoc({
    interfaces: [{ id: "b", busType: "BSCAN", role: "client", bscanVariant: "DC" }],
    dftIps: [{ id: "di1", ipType: "DesignInstance", instanceName: "h1", moduleName: "harden1", position: { x: 0, y: 0 } }],
    dftWires: [
      { id: "w1", from: { kind: "iface", instanceId: "p", interfaceId: "b", pin: "out" }, to: { kind: "ip", ipId: "di1", port: "bscan_scan_in" } },
      { id: "w2", from: { kind: "ip", ipId: "di1", port: "bscan_scan_out" }, to: { kind: "iface", instanceId: "p", interfaceId: "b", pin: "in" } },
    ],
  });
  const bscan = await specgenGen(serialize(filterDocToDomain(d, "p", "BSCAN")));
  assert.ok(bscan.includes("EmbeddedBoundaryScan"), "有 BScan 顶层段");
  assert.ok(bscan.includes("EBScanInstance (h1)"), "DI 归一化后生成 EBScanInstance");
});
```
（`have`/`specgenGen` 均为该文件既有；`{ skip: !have }` 沿用现有跳过约定——没建 `../dft-core/build/specgen` 时干净跳过。）

- [ ] **Step 2: 运行**

Run: `npm run build && node --test tests/integration/specgen-cli.test.ts`
Expected: 有二进制则新 2 条 PASS；无则 skip。

- [ ] **Step 3: 全量回归 + Commit**

Run: `npm test`
Expected: typecheck + 全部单测/集成 全绿。
```bash
git add tests/integration/specgen-cli.test.ts
git commit -m "test(specgen): 集成回归——域隔离 + DI→EBScanInstance"
```

---

## 自查（对照 spec）

- **Part A**：DI 四端口带 bus（T1）、portBus（T1）、DI 端口按层解析 in/out（T2）、wireBus 按端口 bus 归层（T2）。✅
- **Part B**：filterDocToDomain + BSCAN 归一化（T3）、splitSpecSections（T4）、specFilesBySection（T5）、预览按域 + 三文件（T6）、域隔离 & DI→EBScanInstance 回归（T7）。✅
- **类型一致**：`portBus(ipType, name)`、`filterDocToDomain(doc, defId, domain)`、`splitSpecSections(text): Record<string,string>`、`specFilesBySection(design, secs)`、段名键 `SSN`/`EDT`/`EmbeddedBoundaryScan`、DftIpNode 新 prop `activeLayer` —— 跨 task 命名统一。✅
- **R1**：已 spike 验证，无需 dft-core；BSCAN 归一化在 T3、回归在 T7。✅
- **已知局限**（EDT 与 SSN 同域、`-rep` 多文件语义）：spec 已记，非本计划目标。
