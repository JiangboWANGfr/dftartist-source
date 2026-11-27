# 1838jtag Phase A（dft-suite TS/UI/模型）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 dft-suite（TS/React/Electron）里把 IEEE 1838 STAP 建成与 SSN/IJTAG/BISR/BSCAN 并列的第 5 种总线类 `JTAG1838`——genconn 能画 1838jtag 边界接口/展开信号名，specgen 能放置 STAP 节点、按层过滤、按域预览+落盘。**不含 C++ 生成**（Phase B）。

**Architecture:** BusType 是数据模型真源；加一项后多处 exhaustive `Record<BusType>` / `Record<DftIpType>` 会编译报错、逐一补齐。genconn 信号展开由 `expand.ts` 的 `DESC` 表数据驱动（新增一条 STAP 分支，端口名逐字节对齐用户 genconnection 图）。specgen 复用 `feat/specgen-di-multibus` 已有的按域过滤/分段/分文件基建，只把「SSN|BSCAN 两域」扩成「三域」。

**Tech Stack:** TypeScript、React、Konva、Node 内置 `node --test` + `node:assert/strict`、`tsc --noEmit`、Vite、Playwright(e2e)。

**基线：** 本计划基于分支 `feat/1838jtag`（已 rebase 到 `feat/specgen-di-multibus`）。设计真源：`docs/specs/2026-07-14-1838jtag-new-bus-type-design.md`。

**命名约定（三个 namespace，勿混）：**
- BusType / 图层 / 域 token = `"JTAG1838"`（大写，与 SSN/IJTAG/BISR/BSCAN 一致）。
- 生成 spec 顶层块名 = `Jtag1838`（Phase B 的 C++ 产物；Phase A 只在 outputLayout 里预留 `secs.Jtag1838` 键）。
- 落盘目录 = `Spec/1838jtag/`。

---

## 文件结构（本 Phase 触碰）

| 文件 | 责任 | 动作 |
|---|---|---|
| `src/genconn/core/model.ts` | BusType 联合真源 | 改（+JTAG1838） |
| `src/genconn/layers.ts` | 图层清单 BUS_LAYERS | 改 |
| `src/genconn/layout.ts` | BUS_COLOR（exhaustive Record） | 改 |
| `src/genconn/Inspector.tsx` | 创建接口的 bus 选择器 BUSES | 改 |
| `src/genconn/core/expand.ts` | 逐 busType 信号展开 DESC | 改（+STAP 分支 + Base.qual） |
| `src/genconn/core/dft-model.ts` | DftIpType 联合 | 改（+3 STAP IP） |
| `src/specgen/catalog.ts` | 可放置 IP 目录 + catalogBus/portBus | 改（+3 条目、bus 联合扩宽） |
| `src/specgen/ipvisual.ts` | IP 配色（exhaustive Record） | 改（+3 配色） |
| `src/specgen/schema/jtag1838.schema.json` | STAP 元件 spec schema | 新建 |
| `src/specgen/schema.ts` | componentSchema 查表 | 改（挂 jtag1838 registry） |
| `src/specgen/busFilter.ts` | 按域过滤 Domain | 改（+JTAG1838） |
| `src/store/outputLayout.ts` | 段→文件映射 | 改（+Jtag1838→Spec/1838jtag/） |
| `src/specgen/Workspace.tsx` | 调色板 + 三域预览 | 改 |
| `tests/unit/genconn-expand-jtag1838.test.ts` | 信号名回归 | 新建 |
| `tests/unit/specgen-catalog.test.ts` | catalog 回归 | 改（+用例） |
| `tests/unit/specgen-busfilter-jtag1838.test.ts` | 域过滤回归 | 新建 |
| `tests/unit/specgen-schema-jtag1838.test.ts` | schema 回归 | 新建 |
| `tests/unit/output-layout.test.ts` | 段→文件回归 | 改（+用例） |

---

## Task 1: genconn 基础类型 + STAP 信号展开

**Files:**
- Modify: `src/genconn/core/model.ts:10`
- Modify: `src/genconn/layers.ts:6`
- Modify: `src/genconn/layout.ts:342-347`
- Modify: `src/genconn/Inspector.tsx:27`
- Modify: `src/genconn/core/expand.ts`（Base、Desc、DESC、clientSignal、secondarySignal）
- Test: `tests/unit/genconn-expand-jtag1838.test.ts`（新建）

- [ ] **Step 1: 写失败测试**（端口名逐字节对齐用户 genconnection 图）

创建 `tests/unit/genconn-expand-jtag1838.test.ts`：

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { expandInterface } from "../../src/genconn/core/expand.ts";
import type { BusInterface } from "../../src/genconn/core/model.ts";

const client: BusInterface = { id: "c", busType: "JTAG1838", role: "client" };
const sec: BusInterface = { id: "s", busType: "JTAG1838", role: "secondary", interfaceName: "host_stap" };

test("JTAG1838 client：stap_ + [ijtag_] + leaf", () => {
  const names = expandInterface(client).map((s) => `${s.direction} ${s.name}`);
  assert.deepEqual(names, [
    "input stap_tck", "input stap_tms", "input stap_trst",
    "input stap_ijtag_reset", "input stap_ijtag_ce", "input stap_ijtag_se", "input stap_ijtag_ue",
    "input stap_tdi", "output stap_tdo",
  ]);
});

test("JTAG1838 secondary：<if>_[ijtag_]to_/from_ leaf", () => {
  const names = expandInterface(sec).map((s) => `${s.direction} ${s.name}`);
  assert.deepEqual(names, [
    "output host_stap_to_tck", "output host_stap_to_tms", "output host_stap_to_trst",
    "output host_stap_ijtag_to_reset", "output host_stap_ijtag_to_ce", "output host_stap_ijtag_to_se", "output host_stap_ijtag_to_ue",
    "output host_stap_to_tdi", "input host_stap_from_tdo",
  ]);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/unit/genconn-expand-jtag1838.test.ts`
Expected: FAIL —— `DESC["JTAG1838"]` 为 undefined，`basesOf` 抛 `TypeError: Cannot read properties of undefined (reading 'bases')`。

- [ ] **Step 3a: BusType 加 JTAG1838**

`src/genconn/core/model.ts:10`：

```ts
export type BusType = "SSN" | "IJTAG" | "BISR" | "BSCAN" | "JTAG1838";
```

- [ ] **Step 3b: BUS_LAYERS 加 JTAG1838**

`src/genconn/layers.ts:6`：

```ts
export const BUS_LAYERS: BusType[] = ["SSN", "IJTAG", "BISR", "BSCAN", "JTAG1838"];
```

- [ ] **Step 3c: BUS_COLOR 加一色（exhaustive Record，不加则 typecheck 报错）**

`src/genconn/layout.ts:342-347`：

```ts
export const BUS_COLOR: Record<BusInterface["busType"], string> = {
  SSN: "#2e90fa",
  IJTAG: "#12b76a",
  BISR: "#f79009",
  BSCAN: "#9e77ed",
  JTAG1838: "#06aed4",
};
```

- [ ] **Step 3d: Inspector 的 bus 选择器加 JTAG1838（否则 genconn 里无法新建 1838jtag 接口）**

`src/genconn/Inspector.tsx:27`：

```ts
const BUSES: BusType[] = ["SSN", "IJTAG", "BISR", "BSCAN", "JTAG1838"];
```

- [ ] **Step 3e: expand.ts —— Base 加 qual、Desc 的 to/from 前缀接收 base、注入 qual、加 JTAG1838 DESC**

`src/genconn/core/expand.ts`，改 `Base` 接口（加 `qual`）：

```ts
export interface Base {
  name: string;
  group: "down" | "up";
  /** true = 位宽取 busWidth（仅 SSN 数据总线）；否则 1 bit。 */
  wide?: boolean;
  /** 叶名前的限定段（仅 JTAG1838 reset/ce/se/ue = "ijtag_"）；位于 stap_/接口名 与 to_/from_/叶名 之间。 */
  qual?: string;
}
```

改 `Desc` 接口（`toPrefix`/`fromPrefix` 增可选 `b`）：

```ts
interface Desc {
  clientPrefix: (i: BusInterface) => string;
  toPrefix: (i: BusInterface, b?: Base) => string;
  fromPrefix: (i: BusInterface, b?: Base) => string;
  /** 接口名后缀：仅 SSN 且 ifNamePlacement==="postfix" 时把 interfaceName 放到 base 之后。 */
  ifSuffix?: (i: BusInterface) => string;
  bases: (i: BusInterface) => Base[];
}
```

在 `DESC` 对象里（`BSCAN` 条目之后）加 `JTAG1838`：

```ts
  JTAG1838: {
    clientPrefix: () => "stap_",
    toPrefix: (i, b) => `${i.interfaceName ?? ""}_${b?.qual ?? ""}to_`,
    fromPrefix: (i, b) => `${i.interfaceName ?? ""}_${b?.qual ?? ""}from_`,
    bases: () => [
      down("tck"), down("tms"), down("trst"),
      { name: "reset", group: "down", qual: "ijtag_" },
      { name: "ce", group: "down", qual: "ijtag_" },
      { name: "se", group: "down", qual: "ijtag_" },
      { name: "ue", group: "down", qual: "ijtag_" },
      down("tdi"),
      up("tdo"),
    ],
  },
```

改 `clientSignal`（叶名前注入 qual）：

```ts
export function clientSignal(i: BusInterface, b: Base): InterfaceSignal {
  const w = widthOf(i, b);
  return {
    name: DESC[i.busType].clientPrefix(i) + (b.qual ?? "") + b.name + suffix(w),
    direction: b.group === "down" ? "input" : "output",
    width: w,
  };
}
```

改 `secondarySignal`（把 `b` 传给前缀函数）：

```ts
export function secondarySignal(i: BusInterface, b: Base): InterfaceSignal {
  const w = widthOf(i, b);
  const d = DESC[i.busType];
  const prefix = b.group === "down" ? d.toPrefix(i, b) : d.fromPrefix(i, b);
  const ifSuf = d.ifSuffix ? d.ifSuffix(i) : "";
  return {
    name: prefix + b.name + ifSuf + suffix(w),
    direction: b.group === "down" ? "output" : "input",
    width: w,
  };
}
```

> 说明：现有 4 条 DESC 的 `toPrefix: (i) => ...` 因参数更少，仍可赋给 `(i, b?) => string`——无需改动。它们的 base 无 `qual`，`(b.qual ?? "")` 恒为空，输出不变。

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test tests/unit/genconn-expand-jtag1838.test.ts`
Expected: PASS（两个用例）。

- [ ] **Step 5: 回归 + 类型**

Run: `node --test 'tests/unit/*.test.ts' && npm run typecheck`
Expected: 全绿（尤其 `genconn-layers.test.ts` 等既有用例不受影响；typecheck 无 exhaustive 报错）。

- [ ] **Step 6: Commit**

```bash
git add src/genconn/core/model.ts src/genconn/layers.ts src/genconn/layout.ts src/genconn/Inspector.tsx src/genconn/core/expand.ts tests/unit/genconn-expand-jtag1838.test.ts
git commit -m "feat(genconn): 新增总线类 JTAG1838(IEEE 1838 STAP) + 信号展开"
```

---

## Task 2: specgen 可放置 STAP IP（DftIpType + catalog + 配色）

**Files:**
- Modify: `src/genconn/core/dft-model.ts:5-8`
- Modify: `src/specgen/catalog.ts`（bus 联合、DFT_CATALOG、catalogBus、portBus）
- Modify: `src/specgen/ipvisual.ts:8-20`
- Test: `tests/unit/specgen-catalog.test.ts`（加用例）

- [ ] **Step 1: 加失败测试**

在 `tests/unit/specgen-catalog.test.ts` 末尾追加：

```ts
test("JTAG1838：catalogBus + STAP 三条目 abbr/bus/端口", () => {
  assert.equal(catalogBus("STap"), "JTAG1838");
  assert.equal(catalogBus("STapPipeline"), "JTAG1838");
  assert.equal(catalogBus("SecondaryHostScanInterface"), "JTAG1838");
  const stap = catalogEntry("STap");
  assert.equal(stap.abbr, "STAP");
  assert.equal(stap.bus, "JTAG1838");
  assert.deepEqual(stap.ports.map((p) => p.name), ["scan_in", "scan_out", "tck"]);
  assert.deepEqual(dftIpSize("STap"), { w: 100, h: 40 });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/unit/specgen-catalog.test.ts`
Expected: FAIL —— `catalogEntry("STap")` 抛 `unknown DFT IP type: STap`。

- [ ] **Step 3a: DftIpType 加 3 个 STAP 类型**

`src/genconn/core/dft-model.ts:5-8`：

```ts
export type DftIpType =
  | "Pipeline" | "ScanHost" | "OutputPipeline" | "Receiver1xPipeline"
  | "Multiplexer" | "Fifo" | "BusFrequencyDivider" | "BusFrequencyMultiplier" | "DesignInstance"
  | "Edt" | "EBScanPipeline"
  | "STap" | "STapPipeline" | "SecondaryHostScanInterface";
```

- [ ] **Step 3b: catalog 扩 bus 联合 + 加 3 条目 + catalogBus/portBus 返回类型扩宽**

`src/specgen/catalog.ts`：把两处 `bus?: "SSN" | "BSCAN"` 改为 `bus?: "SSN" | "BSCAN" | "JTAG1838"`（`DftPort` 与 `DftCatalogEntry` 各一处，行 7、8）。

在 `DFT_CATALOG` 数组末尾（`EBScanPipeline` 之后）加：

```ts
  {
    ipType: "STap", label: "STap", abbr: "STAP", group: "datapath", bus: "JTAG1838",
    ports: [
      { name: "scan_in", dir: "in", side: "left", role: "data" },
      { name: "scan_out", dir: "out", side: "right", role: "data" },
      { name: "tck", dir: "in", side: "top", role: "clock" },
    ],
  },
  {
    ipType: "STapPipeline", label: "STapPipeline", abbr: "SPP", group: "datapath", bus: "JTAG1838",
    ports: [
      { name: "scan_in", dir: "in", side: "left", role: "data" },
      { name: "scan_out", dir: "out", side: "right", role: "data" },
      { name: "tck", dir: "in", side: "top", role: "clock" },
    ],
  },
  {
    ipType: "SecondaryHostScanInterface", label: "SecondaryHostScanInterface", abbr: "SHSI", group: "datapath", bus: "JTAG1838",
    ports: [
      { name: "from_tdo", dir: "in", side: "left", role: "data" },
      { name: "to_tdi", dir: "out", side: "right", role: "data" },
      { name: "to_tck", dir: "in", side: "top", role: "clock" },
    ],
  },
```

改 `catalogBus` 返回类型（行 62）：

```ts
export function catalogBus(ipType: DftIpType): "SSN" | "BSCAN" | "JTAG1838" {
  return catalogEntry(ipType).bus ?? "SSN";
}
```

改 `portBus` 返回类型（行 81）：

```ts
export function portBus(ipType: DftIpType, portName: string): "SSN" | "BSCAN" | "JTAG1838" | undefined {
  return catalogEntry(ipType).ports.find((p) => p.name === portName)?.bus;
}
```

- [ ] **Step 3c: ipvisual 加 3 配色（exhaustive Record<DftIpType>，不加则 typecheck 报错）**

`src/specgen/ipvisual.ts`，在 `IP_COLORS` 里 `EBScanPipeline` 之后加：

```ts
  STap:                       { fill: "#cffafe", stroke: "#06b6d4", text: "#155e75" },
  STapPipeline:               { fill: "#cffafe", stroke: "#0891b2", text: "#155e75" },
  SecondaryHostScanInterface: { fill: "#ecfeff", stroke: "#0e7490", text: "#155e75" },
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test tests/unit/specgen-catalog.test.ts`
Expected: PASS。

- [ ] **Step 5: 类型 + 回归**

Run: `npm run typecheck && node --test 'tests/unit/*.test.ts'`
Expected: 全绿。

- [ ] **Step 6: Commit**

```bash
git add src/genconn/core/dft-model.ts src/specgen/catalog.ts src/specgen/ipvisual.ts tests/unit/specgen-catalog.test.ts
git commit -m "feat(specgen): STAP 可放置 IP(STap/STapPipeline/SecondaryHostScanInterface) 进 catalog"
```

---

## Task 3: specgen STAP 元件 spec schema

**Files:**
- Create: `src/specgen/schema/jtag1838.schema.json`
- Modify: `src/specgen/schema.ts:1-17`
- Test: `tests/unit/specgen-schema-jtag1838.test.ts`（新建）

> schema 逐字段照搬 `/Users/jiangbowang/MOI/2025/dftartist/specgen/specgen2/add_ijtag_ips.py`（用户亲建的权威定义）。

- [ ] **Step 1: 写失败测试**

创建 `tests/unit/specgen-schema-jtag1838.test.ts`：

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { componentSchema } from "../../src/specgen/schema.ts";

test("STap schema：props + Interface(Client/Host) + SecondaryHostScanInterface", () => {
  const s = componentSchema("STap");
  assert.deepEqual((s.props ?? []).map((p) => p.name), ["parent_instance", "leaf_instance_name", "so_retiming", "3dcr_bypass_value"]);
  const blocks = (s.blocks ?? []).map((b) => b.name);
  assert.deepEqual(blocks, ["Interface", "SecondaryHostScanInterface"]);
  const iface = (s.blocks ?? []).find((b) => b.name === "Interface")!;
  assert.deepEqual((iface.blocks ?? []).map((b) => b.name), ["Client", "Host"]);
});

test("STapPipeline schema：props + Interface", () => {
  const s = componentSchema("STapPipeline");
  assert.deepEqual((s.props ?? []).map((p) => p.name), ["parent_instance", "leaf_instance_name", "capture_value", "so_retiming"]);
  const iface = (s.blocks ?? []).find((b) => b.name === "Interface")!;
  assert.deepEqual((iface.props ?? []).map((p) => p.name), ["scan_in", "scan_out", "tck", "shift_en", "capture_en"]);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/unit/specgen-schema-jtag1838.test.ts`
Expected: FAIL —— `componentSchema("STap")` 抛 `no datapath schema for STap`。

- [ ] **Step 3a: 建 schema JSON**

创建 `src/specgen/schema/jtag1838.schema.json`：

```json
{
  "components": {
    "STap": {
      "name": "STap",
      "id": { "kind": "id" },
      "props": [
        { "name": "parent_instance",    "type": "text", "placeholder": "instance_name",      "spec": "instance_name",      "default": "" },
        { "name": "leaf_instance_name", "type": "text", "placeholder": "leaf_instance_name", "spec": "leaf_instance_name", "default": "" },
        { "name": "so_retiming",        "type": "enum", "values": ["on", "off"],              "spec": "on | off",           "default": "" },
        { "name": "3dcr_bypass_value",  "type": "enum", "values": ["0", "1"],                 "spec": "0 | 1",              "default": "" }
      ],
      "blocks": [
        {
          "name": "Interface", "id": null, "props": [],
          "blocks": [
            {
              "name": "Client", "id": null,
              "props": [
                { "name": "scan_in",    "type": "text", "placeholder": "port_name", "spec": "port_name", "default": "" },
                { "name": "scan_out",   "type": "text", "placeholder": "port_name", "spec": "port_name", "default": "" },
                { "name": "tms",        "type": "text", "placeholder": "port_name", "spec": "port_name", "default": "" },
                { "name": "tck",        "type": "text", "placeholder": "port_name", "spec": "port_name", "default": "" },
                { "name": "trst",       "type": "text", "placeholder": "port_name", "spec": "port_name", "default": "" },
                { "name": "reset",      "type": "text", "placeholder": "port_name", "spec": "port_name", "default": "" },
                { "name": "capture_en", "type": "text", "placeholder": "port_name", "spec": "port_name", "default": "" },
                { "name": "shift_en",   "type": "text", "placeholder": "port_name", "spec": "port_name", "default": "" },
                { "name": "update_en",  "type": "text", "placeholder": "port_name", "spec": "port_name", "default": "" }
              ],
              "blocks": []
            },
            {
              "name": "Host", "id": null,
              "props": [
                { "name": "scan_out", "type": "text", "placeholder": "port_name", "spec": "port_name", "default": "" },
                { "name": "scan_in",  "type": "text", "placeholder": "port_name", "spec": "port_name", "default": "" },
                { "name": "tms",      "type": "text", "placeholder": "port_name", "spec": "port_name", "default": "" }
              ],
              "blocks": []
            }
          ]
        },
        {
          "name": "SecondaryHostScanInterface", "id": { "kind": "id" },
          "props": [
            { "name": "to_tck",   "type": "text", "placeholder": "port_pin_name", "spec": "port_pin_name", "default": "" },
            { "name": "to_trst",  "type": "text", "placeholder": "port_pin_name", "spec": "port_pin_name", "default": "" },
            { "name": "to_tms",   "type": "text", "placeholder": "port_pin_name", "spec": "port_pin_name", "default": "" },
            { "name": "from_tdo", "type": "text", "placeholder": "port_pin_name", "spec": "port_pin_name", "default": "" },
            { "name": "to_tdi",   "type": "text", "placeholder": "port_pin_name", "spec": "port_pin_name", "default": "" }
          ],
          "blocks": []
        }
      ]
    },
    "STapPipeline": {
      "name": "STapPipeline",
      "id": { "kind": "id" },
      "props": [
        { "name": "parent_instance",    "type": "text", "placeholder": "instance_name",      "spec": "instance_name",      "default": "" },
        { "name": "leaf_instance_name", "type": "text", "placeholder": "leaf_instance_name", "spec": "leaf_instance_name", "default": "" },
        { "name": "capture_value",      "type": "enum", "values": ["0", "1", "self"],         "spec": "0 | 1 | self",       "default": "" },
        { "name": "so_retiming",        "type": "enum", "values": ["on", "off"],              "spec": "on | off",           "default": "" }
      ],
      "blocks": [
        {
          "name": "Interface", "id": null,
          "props": [
            { "name": "scan_in",    "type": "text", "placeholder": "port_name", "spec": "port_name", "default": "" },
            { "name": "scan_out",   "type": "text", "placeholder": "port_name", "spec": "port_name", "default": "" },
            { "name": "tck",        "type": "text", "placeholder": "port_name", "spec": "port_name", "default": "" },
            { "name": "shift_en",   "type": "text", "placeholder": "port_name", "spec": "port_name", "default": "" },
            { "name": "capture_en", "type": "text", "placeholder": "port_name", "spec": "port_name", "default": "" }
          ],
          "blocks": []
        }
      ]
    },
    "SecondaryHostScanInterface": {
      "name": "SecondaryHostScanInterface",
      "id": { "kind": "id" },
      "props": [
        { "name": "to_tck",   "type": "text", "placeholder": "port_pin_name", "spec": "port_pin_name", "default": "" },
        { "name": "to_trst",  "type": "text", "placeholder": "port_pin_name", "spec": "port_pin_name", "default": "" },
        { "name": "to_tms",   "type": "text", "placeholder": "port_pin_name", "spec": "port_pin_name", "default": "" },
        { "name": "from_tdo", "type": "text", "placeholder": "port_pin_name", "spec": "port_pin_name", "default": "" },
        { "name": "to_tdi",   "type": "text", "placeholder": "port_pin_name", "spec": "port_pin_name", "default": "" }
      ],
      "blocks": []
    }
  }
}
```

> 顶层可放置的 `SecondaryHostScanInterface`（catalog 里那个）复用同名精简 schema（5 个 to_/from_ 端口）；STap 内部嵌套的同名块是它的 `blocks` 成员，各自独立、互不影响。

- [ ] **Step 3b: schema.ts 挂 jtag1838 registry**

`src/specgen/schema.ts`，在 import 区加（第 3 行 bscan import 之后）：

```ts
import jtag1838Registry from "./schema/jtag1838.schema.json" with { type: "json" };
```

在 `const BSCAN = ...` 之后加：

```ts
const JTAG1838 = (jtag1838Registry as unknown as { components: Record<string, BlockSchema> }).components;
```

改 `componentSchema` 查表（多兜一层）：

```ts
export function componentSchema(ipType: DftIpType): BlockSchema {
  const s = REG.components[ipType] ?? BSCAN[ipType] ?? JTAG1838[ipType];
  if (!s) throw new Error(`no datapath schema for ${ipType}`);
  return s;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test tests/unit/specgen-schema-jtag1838.test.ts`
Expected: PASS（两个用例）。

- [ ] **Step 5: 类型 + 回归**

Run: `npm run typecheck && node --test 'tests/unit/*.test.ts'`
Expected: 全绿。

- [ ] **Step 6: Commit**

```bash
git add src/specgen/schema/jtag1838.schema.json src/specgen/schema.ts tests/unit/specgen-schema-jtag1838.test.ts
git commit -m "feat(specgen): STAP 元件 spec schema(jtag1838) + componentSchema 挂载"
```

---

## Task 4: specgen 按域过滤加 JTAG1838

**Files:**
- Modify: `src/specgen/busFilter.ts:7`
- Test: `tests/unit/specgen-busfilter-jtag1838.test.ts`（新建）

> `filterDocToDomain` 主体对任意域已通用（按 `busType`/`catalogBus` 过滤），只差把 `Domain` 联合扩宽；BSCAN 专属的端口归一化对 JTAG1838 无关、不触发。

- [ ] **Step 1: 写失败测试**

创建 `tests/unit/specgen-busfilter-jtag1838.test.ts`：

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { filterDocToDomain } from "../../src/specgen/busFilter.ts";
import type { GenConnDocument } from "../../src/genconn/core/model.ts";

function doc(): GenConnDocument {
  const def = {
    id: "d1", designName: "top", designLevel: "chip" as const, designType: "tiling" as const,
    interfaces: [
      { id: "i1", busType: "SSN" as const, role: "client" as const },
      { id: "i2", busType: "JTAG1838" as const, role: "secondary" as const, interfaceName: "host_stap" },
    ],
    childInstances: [], connections: [],
    dftIps: [
      { id: "p1", ipType: "ScanHost" as const, instanceName: "sh1", position: { x: 0, y: 0 } },
      { id: "p2", ipType: "STap" as const, instanceName: "stap1", position: { x: 0, y: 0 } },
    ],
    dftWires: [],
  };
  return {
    schemaVersion: 1, library: { defs: [def] },
    ui: { openDefId: "d1", rootDefId: "d1" },
    ctrlIps: [], dfxInstances: [], moduleDsNext: 1, muxDsNext: 1,
  };
}

test("filterDocToDomain('JTAG1838')：只留 JTAG1838 接口 + STAP IP", () => {
  const out = filterDocToDomain(doc(), "d1", "JTAG1838");
  const def = out.library.defs.find((d) => d.id === "d1")!;
  assert.deepEqual(def.interfaces.map((i) => i.id), ["i2"]);
  assert.deepEqual((def.dftIps ?? []).map((p) => p.id), ["p2"]);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/unit/specgen-busfilter-jtag1838.test.ts`
Expected: FAIL —— TS 类型层面 `"JTAG1838"` 不属 `Domain`；`node --test` 剥类型仍会跑，但 `npm run typecheck` 会报 `Argument of type '"JTAG1838"' is not assignable to parameter of type 'Domain'`。先按运行失败/类型失败任一确认。

- [ ] **Step 3: Domain 扩宽**

`src/specgen/busFilter.ts:7`：

```ts
export type Domain = "SSN" | "BSCAN" | "JTAG1838";
```

- [ ] **Step 4: 跑测试 + 类型确认通过**

Run: `node --test tests/unit/specgen-busfilter-jtag1838.test.ts && npm run typecheck`
Expected: PASS + typecheck 绿。

- [ ] **Step 5: Commit**

```bash
git add src/specgen/busFilter.ts tests/unit/specgen-busfilter-jtag1838.test.ts
git commit -m "feat(specgen): 按域过滤 Domain 加 JTAG1838"
```

---

## Task 5: 段→文件映射加 Jtag1838

**Files:**
- Modify: `src/store/outputLayout.ts:36-44`
- Test: `tests/unit/output-layout.test.ts`（加用例）

- [ ] **Step 1: 加失败测试**

在 `tests/unit/output-layout.test.ts` 末尾追加（先补 import：把首行 import 里加上 `specFilesBySection`）：

```ts
test("specFilesBySection：SSN/EDT/BScan/1838jtag 各段 → 对应目录", () => {
  const r = specFilesBySection("top", { SSN: "SSN {}", EDT: "EDT {}", EmbeddedBoundaryScan: "EmbeddedBoundaryScan {}", Jtag1838: "Jtag1838 {}" });
  assert.deepEqual(r.map((f) => f.relPath), [
    "Spec/ssn/top.dftspec", "Spec/edt/top.dftspec", "Spec/bscan/top.dftspec", "Spec/1838jtag/top.dftspec",
  ]);
});
```

（首行 import 改为：`import { ipFiles, archConnectionFiles, connLeafName, specFile, specFilesBySection, padFiles, withDftPortFile, regCountFile, archDocFile } from "../../src/store/outputLayout.ts";`）

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/unit/output-layout.test.ts`
Expected: FAIL —— 结果数组缺 `Spec/1838jtag/top.dftspec`（`Jtag1838` 段未映射）。

- [ ] **Step 3: outputLayout 加 Jtag1838 映射**

`src/store/outputLayout.ts` 的 `specFilesBySection`，在 `EmbeddedBoundaryScan` 那行之后加一行：

```ts
export function specFilesBySection(design: string, secs: Record<string, string>): OutFile[] {
  const wrap = (s: string) => `read_config_data -in_wrapper $dftspec -rep -from_string {\n${s}\n}\n`;
  const put = (sec: string | undefined, rel: string): OutFile[] => (sec && sec.trim()) ? [{ relPath: rel, text: wrap(sec) }] : [];
  return [
    ...put(secs.SSN, `Spec/ssn/${design}.dftspec`),
    ...put(secs.EDT, `Spec/edt/${design}.dftspec`),
    ...put(secs.EmbeddedBoundaryScan, `Spec/bscan/${design}.dftspec`),
    ...put(secs.Jtag1838, `Spec/1838jtag/${design}.dftspec`),
  ];
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test tests/unit/output-layout.test.ts`
Expected: PASS。

- [ ] **Step 5: 类型 + 回归**

Run: `npm run typecheck && node --test 'tests/unit/*.test.ts'`
Expected: 全绿。

- [ ] **Step 6: Commit**

```bash
git add src/store/outputLayout.ts tests/unit/output-layout.test.ts
git commit -m "feat(specgen): 段→文件映射加 Jtag1838 → Spec/1838jtag/"
```

---

## Task 6: Workspace 三域预览 + STAP 调色板

**Files:**
- Modify: `src/specgen/Workspace.tsx`（specByDomain 状态、gen 域、specDisplay、specSections、调色板）
- Verify: `npm run typecheck` + 手动/e2e

> React/Konva 组件不做单测；用 typecheck 卡类型、手动核验交互。

- [ ] **Step 1: specByDomain 加第三键**

`src/specgen/Workspace.tsx:246`（状态声明）：

```ts
  const [specByDomain, setSpecByDomain] = useState<{ SSN: string; BSCAN: string; JTAG1838: string }>({ SSN: "", BSCAN: "", JTAG1838: "" });
```

行 248、249 两处重置对象同步加 `JTAG1838: ""` / `JTAG1838: m`：

```ts
    if (!scope) { setSpecByDomain({ SSN: "", BSCAN: "", JTAG1838: "" }); return; }
    if (!hasBridge()) { const m = "// 预览需在应用内运行（未检测到 dft 原生桥接）。"; setSpecByDomain({ SSN: m, BSCAN: m, JTAG1838: m }); return; }
```

- [ ] **Step 2: gen 域类型 + 并发生成第三份**

行 252 `gen` 参数类型：

```ts
      const gen = async (domain: "SSN" | "BSCAN" | "JTAG1838") => {
```

行 255 占位文案（可选优化，保持功能即可）保持不变；行 259-260 改为三域：

```ts
      const [SSN, BSCAN, JTAG1838] = await Promise.all([gen("SSN"), gen("BSCAN"), gen("JTAG1838")]);
      if (!cancelled) setSpecByDomain({ SSN, BSCAN, JTAG1838 });
```

- [ ] **Step 3: specDisplay + specSections 加 JTAG1838**

行 265-268：

```ts
  const specDisplay = activeLayer === "BSCAN" ? specByDomain.BSCAN
    : activeLayer === "SSN" ? specByDomain.SSN
    : activeLayer === "JTAG1838" ? specByDomain.JTAG1838
    : `// —— SSN ——\n${specByDomain.SSN}\n\n// —— BScan ——\n${specByDomain.BSCAN}\n\n// —— 1838jtag ——\n${specByDomain.JTAG1838}`;
  const specSections = (): Record<string, string> => ({ ...splitSpecSections(specByDomain.SSN), ...splitSpecSections(specByDomain.BSCAN), ...splitSpecSections(specByDomain.JTAG1838) });
```

- [ ] **Step 4: 调色板加 1838jtag 分组 + 修 SSN 组过滤（排除 JTAG1838）**

行 359（SSN datapath 过滤）改为只收 SSN：

```tsx
          {DFT_CATALOG.filter((e) => e.group === "datapath" && (e.bus ?? "SSN") === "SSN").map((e) => (
```

在 BScan 分组块（`{(activeLayer === null || activeLayer === "BSCAN") && (...)}`）之后、`</div>`（`dft-palette` 收尾）之前，加 1838jtag 分组：

```tsx
        {(activeLayer === null || activeLayer === "JTAG1838") && (<>
          <div className="dft-head" style={{ color: BUS_COLOR.JTAG1838 }}>1838jtag</div>
          {DFT_CATALOG.filter((e) => e.bus === "JTAG1838").map((e) => (
            <div key={e.ipType} className="dft-item" title={`加一个 ${e.label}`} onClick={() => scope && activeLayer && addDftIp(scope.id, e.ipType)}>
              ⬡ {e.label}
            </div>
          ))}
        </>)}
```

- [ ] **Step 5: 类型 + 全量单测**

Run: `npm run typecheck && node --test 'tests/unit/*.test.ts'`
Expected: 全绿。

- [ ] **Step 6: 手动核验（Electron）**

Run: `npm run dev:electron`
在 SpecGen tab：
1. 图层下拉出现「1838jtag」层。
2. 切到 1838jtag 层，左侧调色板出现「1838jtag」分组，含 STap / STapPipeline / SecondaryHostScanInterface。
3. 放置一个 STap，切到 SSN 层它变灰(dim)、切回 1838jtag 层恢复；SSN datapath 分组里**不**出现 STAP 项。
4. 预览面板「生成 dftspec」在 1838jtag 层显示该域内容（Phase A 无 C++ → 显示「本 scope 无 … 内容」或桥接占位，不报错、不串到别的域）。
5. 双击 STap 打开配参对话框，字段与 schema 一致（parent_instance / so_retiming / Interface…），不抛错。

- [ ] **Step 7: Commit**

```bash
git add src/specgen/Workspace.tsx
git commit -m "feat(specgen): Workspace 三域预览 + 1838jtag 调色板分组"
```

---

## Self-Review

**1. Spec coverage（对照设计 §6.1/§6.2/§7.1）：**
- §6.1 数据模型+图层 → Task 1（BusType/BUS_LAYERS/BUS_COLOR/Inspector）。✓
- §6.2 信号展开（9 base + qual 规则）→ Task 1（expand.ts + 逐字节测试）。✓
- §7.1 域/过滤/目录/catalog → Task 2（catalog）、Task 4（busFilter）、Task 5（outputLayout）、Task 6（Workspace 三域）。✓
- STAP schema（§7.2 属于 Phase B 的 C++，但 schema JSON 属数据、Phase A 先落）→ Task 3。✓
- **Phase A 不覆盖**：C++ 生成（`genconn-core/expand.cpp`、`specgen-core/jtag1838.cpp`、`dftspec.cpp`）→ Plan B。预览在 Phase A 只出占位，符合 BScan 先例。

**2. Placeholder scan：** 无 TBD/TODO；每个改动步骤都给了完整代码。✓

**3. Type consistency：**
- `catalogBus` 返回 `"SSN"|"BSCAN"|"JTAG1838"`，`Domain` 同为三值 → `catalogBus(...) === domain` 比较合法。✓
- `DftIpType` 三新成员在 dft-model.ts(Task 2)定义，被 ipvisual(Task 2)/catalog(Task 2)/schema(Task 3) 一致引用。✓
- BusType `"JTAG1838"` 在 model.ts(Task 1) 定义，被 DESC/BUS_COLOR/BUS_LAYERS/Inspector/busFilter 一致引用。✓
- spec 段名 `Jtag1838`（outputLayout 键，Task 5）vs 域 token `JTAG1838`（Task 1/4/6）—— 有意不同，见顶部「命名约定」；outputLayout 的 `secs.Jtag1838` 对接 Phase B 的 C++ 顶层块名。✓

**依赖提示：** 本分支基于 `feat/specgen-di-multibus`（尚未并入 master）。Plan A 落完后，Plan B（dft-core C++）另写，其 golden 依赖 Task 1–5 定下的模型/命名。
