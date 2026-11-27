# DFX Ctrl — M2 dft-suite UI 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 连接生成工作区获得完整 DFX Ctrl 体验:层次搜索选 instance → 双击块弹 DFX 配置大弹窗(引脚表格 + 自动判定 + 实时三件套预览)→ 确认落画布(缝合可视化)→ 左栏清单一键定位/详情页,全部持久化在 genconn 文档里。

**Architecture:** 全部改动在 **dft-suite 仓**(本仓)。新增 `src/genconn/dfx/` 模块(纯逻辑:判定/spec 构建/路径换算 + 组件:弹窗/清单/详情页/画布 overlay);文档 schema 升 v2(`ctrlIps` + 双计数器);Electron 侧照 genconn 模式接 `ctrlgen` CLI。依赖 **M0/M1 已完成**(`dft-core/build/` 有带 tie 补丁的 `hdl` 和新 `ctrlgen` 二进制;见姊妹计划 `2026-07-07-dfx-ctrl-m0-m1-core.md`)。

**Tech Stack:** React 18 + Konva 10 + Zustand 5(+zundo)、elkjs(复用 hierarchy 的纯布局模块)、node:test 单测、Playwright e2e(真二进制,无则 skip)。

**Spec:** `docs/specs/2026-07-07-dfx-ctrl-ip-design.md`(v5:§5 UI、§4.1 CtrlIpSpec、D2-D8)。

**关键既有事实(已核实):**
- genconn 文档:`serialize/deserialize/migrate` 在 `src/genconn/core/document.ts`(`CURRENT_SCHEMA_VERSION = 1`,migrate 对未知字段透传);store 是 zundo temporal,只有 `doc` 参与 undo(`store.ts:415`)。
- 块导入链:`nodeToPayload`(`hierarchy.ts:79-88`,只带 designName/fileName/instanceName)→ `addBlockAt`(`importBlocks.ts:55-72`)。**块目前不带层次路径**——DFX 需要,本计划给 payload/HardenInstance 加 `hierPath`。
- daemon 桥:`window.dft.design.query(method, params)` 任意方法直通(`main.cjs:64-67`),`get-ports`/`trace-drivers` 已有 typed 封装(`client.ts:29,45`),`get-netlist` 未封装。
- CLI 桥:`electron/cli.cjs` 的 `run(bin,args,{input})` + `parseFileMarkers`(已导出,单测在 `tests/unit/parse-file-markers.test.ts`);`resolveBin` 读 `$DFT_CORE_BIN_DIR`(`bin.cjs:2-7`)。
- genconn 中央区无 tab 系统;弹窗先例是 `promptDialog.tsx`(命令式);左栏挂点 `Workspace.tsx:134-137`,面板类名 `.panel.left.<name>`。
- 画布:两个 Layer(网格 + 主层),主层后、`</Stage>` 前可加只读 overlay Layer(`CanvasView.tsx:871`);选中高亮 = stroke 换 accent 色;`boxes` 数组含每块几何。
- hierarchy 原理图纯模块可直接复用:`src/hierarchy/core/schematic.ts`(SchNode/SchEdge/toElkGraph)+ `src/hierarchy/schematic/laid.ts`(toLaid/boundsOf/fitTransform)+ `elkLayout.ts`。
- e2e 惯例:真二进制无则 `test.skip`;`DFT_E2E=1` 时 `window.__gcStore/__hierStore/__dftStore` 可用(`src/main.tsx:15-20`)。
- 节点 id 是点分隔含顶层(`top.u_mid.PLL_1`);tcl 目标是**去顶层的斜杠路径**(`PLL_1/enable`、`u_x/u_y/pin`)。

**分支:** 继续在本仓 `design/dfx-ctrl-ip` 分支上做(spec/plan 已在此),或从它切 `feat/dfx-ctrl-ui`;以下 commit 均在 dft-suite 仓。

---

### Task 1: 文档 schema v2 —— CtrlIpSpec 类型 + ctrlIps/计数器 + migrate(TDD)

**Files:**
- Modify: `src/genconn/core/model.ts`
- Modify: `src/genconn/core/document.ts`
- Create: `tests/unit/dfx-schema.test.ts`

- [ ] **Step 1: 失败单测**

`tests/unit/dfx-schema.test.ts`:

```ts
import { test } from "node:test"; import assert from "node:assert/strict";
import { deserialize, serialize, CURRENT_SCHEMA_VERSION } from "../../src/genconn/core/document.ts";
import { emptyDocument } from "../../src/genconn/core/document.ts";

test("schema version is 2", () => {
  assert.equal(CURRENT_SCHEMA_VERSION, 2);
});

test("v1 document migrates: ctrlIps/counters defaulted, version bumped", () => {
  const v1 = JSON.parse(serialize(emptyDocument("chip")));
  v1.schemaVersion = 1;
  delete v1.ctrlIps; delete v1.moduleDsNext; delete v1.muxDsNext;
  const doc = deserialize(JSON.stringify(v1));
  assert.equal(doc.schemaVersion, 2);
  assert.deepEqual(doc.ctrlIps, []);
  assert.equal(doc.moduleDsNext, 1);
  assert.equal(doc.muxDsNext, 1);
});

test("v2 document round-trips ctrlIps untouched", () => {
  const d = emptyDocument("chip");
  d.ctrlIps.push({
    spec: {
      schemaVersion: 2, moduleBase: "pll_ctrl", dsIndex: 1,
      pins: [{ portName: "enable", mode: "control", width: 1, stitch: "mux",
               target: "PLL_1/enable", muxName: "u_dfx_PLL_1_enable_persistent_mux_inst_ds1" }],
    },
    ctrlInstId: "i123",
    targets: { "top.PLL_1": "i45" },
  });
  d.moduleDsNext = 2; d.muxDsNext = 2;
  const back = deserialize(serialize(d));
  assert.equal(back.ctrlIps.length, 1);
  assert.equal(back.ctrlIps[0].spec.moduleBase, "pll_ctrl");
  assert.equal(back.muxDsNext, 2);
});
```

Run: `npm run test:unit` → Expected: FAIL(CURRENT_SCHEMA_VERSION 是 1,emptyDocument 无 ctrlIps)。

- [ ] **Step 2: model.ts 加类型(文件末尾追加;`HardenInstance` 加 `hierPath`)**

```ts
// ---- DFX Ctrl IP (docs/specs/2026-07-07-dfx-ctrl-ip-design.md §4.1) ----

/** ctrlgen CLI 的输入 schema,与 dft-core ctrlgen-core parseSpec 一一对应。 */
export interface CtrlPin {
  portName: string;
  mode: "control" | "observe";
  width: number;
  /** 标量/同构总线(按位展开 target[i]);与 targets 二选一 */
  target?: string;
  /** 逐位异构目标,长度 = width */
  targets?: string[];
  /** control 必填:字符串=整线;数组=按位(D8) */
  stitch?: "mux" | "replace" | "connect" | ("mux" | "replace" | "connect")[];
  /** mux 位的实例名(D3);与 stitch 同形 */
  muxName?: string | (string | null)[];
}

export interface CtrlIpSpec {
  schemaVersion: 2;
  moduleBase: string;
  /** 省略 = 终名就是 moduleBase;UI 新建总是分配 */
  dsIndex?: number;
  dfxModeSource?: string;
  gateCell?: { name: string; out: string; a: string; b: string };
  pins: CtrlPin[];
}

/** 文档内的一条 DFX 修改:CLI spec + 画布关联。 */
export interface DocCtrlIp {
  spec: CtrlIpSpec;
  /** 画布上 ctrl IP 块的 instance id */
  ctrlInstId: Id;
  /** 目标层次路径(daemon nodeId,点分隔)→ 画布 instance id;不在画布上则缺键 */
  targets: Record<string, Id>;
}
```

`HardenInstance` interface(model.ts:47-66)追加一个可选字段:

```ts
  /** 来源设计层次节点 id(daemon nodeId,点分隔);DFX 配置需要 */
  hierPath?: string;
```

`GenConnDocument`(model.ts:124-134)追加三个顶层字段:

```ts
export interface GenConnDocument {
  schemaVersion: number;
  library: HardenLibrary;
  /** DFX Ctrl 修改清单(spec §5.3;v2 起) */
  ctrlIps: DocCtrlIp[];
  /** D3 双计数器:模块号 / mux 号,只增不回收 */
  moduleDsNext: number;
  muxDsNext: number;
  ui: { openDefId: Id; rootDefId: Id; viewport?: Viewport };
}
```

- [ ] **Step 3: document.ts —— 版本升 2 + migrate 补默认 + emptyDocument 初始化**

```ts
export const CURRENT_SCHEMA_VERSION = 2;

export function migrate(raw: unknown): GenConnDocument {
  if (raw === null || typeof raw !== "object") {
    throw new Error("document is not an object");
  }
  const v = (raw as { schemaVersion?: unknown }).schemaVersion;
  if (typeof v !== "number") {
    throw new Error("missing or invalid schemaVersion");
  }
  if (v > CURRENT_SCHEMA_VERSION) {
    throw new Error(`document schemaVersion ${v} is newer than supported ${CURRENT_SCHEMA_VERSION}`);
  }
  const doc = raw as GenConnDocument;
  if (v < 2) {
    // v1 -> v2: DFX ctrl fields (docs/specs §5.3)
    doc.ctrlIps = [];
    doc.moduleDsNext = 1;
    doc.muxDsNext = 1;
    doc.schemaVersion = 2;
  }
  doc.ctrlIps ??= [];
  doc.moduleDsNext ??= 1;
  doc.muxDsNext ??= 1;
  return doc;
}
```

`emptyDocument`(同文件)返回对象补 `ctrlIps: [], moduleDsNext: 1, muxDsNext: 1, schemaVersion: CURRENT_SCHEMA_VERSION`。

- [ ] **Step 4: 单测通过 + typecheck**

```bash
npm run test:unit && npm run typecheck
```

Expected: 全绿(若 validateDocument 对新字段报错,它只校验 defs/引用,不应触碰 ctrlIps;如有编译错按类型补齐调用点)。

- [ ] **Step 5: Commit**

```bash
git add src/genconn/core/model.ts src/genconn/core/document.ts tests/unit/dfx-schema.test.ts
git commit -m "feat(dfx): doc schema v2 — CtrlIpSpec/DocCtrlIp types, ctrlIps + ds counters, v1 migrate"
```

### Task 2: dfx/judge.ts —— 判定与路径换算(纯函数,TDD)

**Files:**
- Create: `src/genconn/dfx/judge.ts`
- Create: `tests/unit/dfx-judge.test.ts`

- [ ] **Step 1: 失败单测**

```ts
import { test } from "node:test"; import assert from "node:assert/strict";
import { parseTie, judgeBit, judgePin, tclTarget, parentOf } from "../../src/genconn/dfx/judge.ts";

test("parseTie: binary literal to per-bit values, bit0 = LSB", () => {
  assert.deepEqual(parseTie("1'b0", 1), [0]);
  assert.deepEqual(parseTie("1'b1", 1), [1]);
  // 4'b101 = 0101 -> bit0=1, bit1=0, bit2=1, bit3=0
  assert.deepEqual(parseTie("4'b101", 4), [1, 0, 1, 0]);
  assert.equal(parseTie("", 1), null);
  assert.equal(parseTie("garbage", 2), null);
});

test("judgeBit: tie0->replace, tie1->mux, net->mux, dangling->connect", () => {
  assert.equal(judgeBit({ net: "", tie: 0 }), "replace");
  assert.equal(judgeBit({ net: "", tie: 1 }), "mux");
  assert.equal(judgeBit({ net: "w", tie: null }), "mux");
  assert.equal(judgeBit({ net: "", tie: null }), "connect");
});

test("judgePin: scalar and mixed bus", () => {
  assert.deepEqual(judgePin({ net: "", tie: "1'b0" }, 1), ["replace"]);
  // 4'b0101: bits [1,0,1,0] -> [mux, replace, mux, replace]
  assert.deepEqual(judgePin({ net: "", tie: "4'b101" }, 4), ["mux", "replace", "mux", "replace"]);
  assert.deepEqual(judgePin({ net: "clk_net", tie: "" }, 2), ["mux", "mux"]);
  assert.deepEqual(judgePin({ net: "", tie: "" }, 3), ["connect", "connect", "connect"]);
});

test("tclTarget: strip top segment, dots to slashes, append pin", () => {
  assert.equal(tclTarget("top.PLL_1", "enable"), "PLL_1/enable");
  assert.equal(tclTarget("chip.u_a.u_b", "din"), "u_a/u_b/din");
});

test("parentOf", () => {
  assert.equal(parentOf("top.u_mid.u_kid"), "top.u_mid");
  assert.equal(parentOf("top"), null);
});
```

Run: `npm run test:unit` → FAIL(模块不存在)。

- [ ] **Step 2: 实现 `src/genconn/dfx/judge.ts`**

```ts
// DFX 缝合自动判定(spec §1.2/D2/D8)。纯函数,零依赖。
// tie 字面量来自 hdl-core M0 补丁(SVInt binary,无前导零):"1'b0" / "4'b101"。

export type Stitch = "mux" | "replace" | "connect";

/** "4'b101" -> 每位 0/1,下标 = 位号(bit0 = LSB)。非法/空 -> null。 */
export function parseTie(tie: string, width: number): (0 | 1)[] | null {
  const m = /^(\d+)'b([01]+)$/.exec(tie);
  if (!m) return null;
  const bits = m[2].padStart(width, "0");
  if (bits.length !== width) return null;
  const out: (0 | 1)[] = [];
  for (let i = 0; i < width; i++) out.push(bits[width - 1 - i] === "1" ? 1 : 0);
  return out;
}

/** 单个位的判定:tie0 -> replace;tie1 或真实网 -> mux;悬空 -> connect(D7)。 */
export function judgeBit(c: { net: string; tie: 0 | 1 | null }): Stitch {
  if (c.net !== "") return "mux";
  if (c.tie === 0) return "replace";
  if (c.tie === 1) return "mux";
  return "connect";
}

/** 整引脚判定,按位返回(总线混合驱动自然分解,D8)。 */
export function judgePin(conn: { net: string; tie: string }, width: number): Stitch[] {
  const bits = parseTie(conn.tie, width);
  const out: Stitch[] = [];
  for (let i = 0; i < width; i++)
    out.push(judgeBit({ net: conn.net, tie: bits ? bits[i] : null }));
  return out;
}

/** daemon nodeId(top.a.b,点分隔含顶层)-> tcl 层次目标(a/b/pin,去顶层斜杠)。 */
export function tclTarget(nodeId: string, pin: string): string {
  const segs = nodeId.split(".");
  return [...segs.slice(1), pin].join("/");
}

/** nodeId 的父层 id;顶层返回 null。 */
export function parentOf(nodeId: string): string | null {
  const i = nodeId.lastIndexOf(".");
  return i < 0 ? null : nodeId.slice(0, i);
}
```

- [ ] **Step 3: 通过 + Commit**

```bash
npm run test:unit
git add src/genconn/dfx/judge.ts tests/unit/dfx-judge.test.ts
git commit -m "feat(dfx): judge — per-bit stitch auto-judgment, tie parsing, nodeId->tcl path"
```

### Task 3: 层次搜索 —— 纯匹配器 + HierarchyPanel 搜索框(spec §5.1)

**Files:**
- Modify: `src/genconn/hierarchy.ts`(加 searchHierarchy;`nodeToPayload` 加 hierPath)
- Modify: `src/genconn/importBlocks.ts:12-16`(BlockPayload 加 hierPath)+ `:55-72`(写到 instance)
- Modify: `src/genconn/HierarchyPanel.tsx`
- Modify: `src/genconn/styles.css`
- Create: `tests/unit/dfx-search.test.ts`

- [ ] **Step 1: 失败单测(匹配器)**

```ts
import { test } from "node:test"; import assert from "node:assert/strict";
import { searchHierarchy } from "../../src/genconn/hierarchy.ts";
import type { DesignHierarchy } from "../../src/genconn/hierarchy.ts";

// 最小 hierarchy:top -> PLL_1(pll), PLL_2(pll), u_core(core)
const h: DesignHierarchy = {
  rootInstanceIds: ["top"],
  instances: {
    top: { instanceName: "top", definitionId: "d_top", childInstanceIds: ["top.PLL_1", "top.PLL_2", "top.u_core"] },
    "top.PLL_1": { instanceName: "PLL_1", definitionId: "d_pll", childInstanceIds: [] },
    "top.PLL_2": { instanceName: "PLL_2", definitionId: "d_pll", childInstanceIds: [] },
    "top.u_core": { instanceName: "u_core", definitionId: "d_core", childInstanceIds: [] },
  },
  definitions: {
    d_top: { designName: "top" }, d_pll: { designName: "pll" }, d_core: { designName: "core" },
  },
} as unknown as DesignHierarchy;

test("substring matches instance name and module name, case-insensitive", () => {
  const r = searchHierarchy(h, "pll_1");
  assert.deepEqual(r.map((x) => x.instId), ["top.PLL_1"]);
  const byDef = searchHierarchy(h, "core");
  assert.deepEqual(byDef.map((x) => x.instId), ["top.u_core"]);
});

test("wildcard * and result cap", () => {
  const r = searchHierarchy(h, "PLL_*");
  assert.deepEqual(r.map((x) => x.instId), ["top.PLL_1", "top.PLL_2"]);
  assert.equal(searchHierarchy(h, "PLL_*", 1).length, 1);
});

test("empty query returns empty", () => {
  assert.deepEqual(searchHierarchy(h, "  "), []);
});
```

(`DesignHierarchy` 的实际字段名以 `hierarchy.ts:10-29` 为准 —— instances/definitions/childInstanceIds 命名如有差异,先读该文件用真实字段名写测试。)

- [ ] **Step 2: 实现 searchHierarchy(hierarchy.ts 末尾)**

```ts
export interface HierHit {
  instId: string;
  /** 完整层次路径,点分隔(即 instId) */
  path: string;
  instanceName: string;
  designName: string;
}

/** 子串(大小写不敏感)+ `*` 通配;同时匹配实例名与模块名;上限截断(spec §5.1:200)。 */
export function searchHierarchy(h: DesignHierarchy, query: string, limit = 200): HierHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const re = q.includes("*")
    ? new RegExp(q.split("*").map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*"))
    : null;
  const match = (s: string) => {
    const t = s.toLowerCase();
    return re ? re.test(t) : t.includes(q);
  };
  const out: HierHit[] = [];
  for (const [id, inst] of Object.entries(h.instances)) {
    const def = h.definitions[inst.definitionId];
    const designName = def?.designName ?? "";
    if (match(inst.instanceName) || match(designName)) {
      out.push({ instId: id, path: id, instanceName: inst.instanceName, designName });
      if (out.length >= limit) break;
    }
  }
  return out;
}
```

`nodeToPayload`(hierarchy.ts:79-88)返回对象加 `hierPath: instId`;`BlockPayload`(importBlocks.ts:12-16)加 `hierPath?: string`;`addBlockAt` 里创建/复用实例后把 `hierPath` 写到该 `HardenInstance`(跟 instanceName 同一处赋值)。

- [ ] **Step 3: 单测通过后,HierarchyPanel 加搜索框**

`HierarchyPanel.tsx` 顶部(树之前)插入受控 input + 命中列表;防抖 200ms(setTimeout 模式照 Workspace.tsx:60):

```tsx
const [q, setQ] = useState("");
const [hits, setHits] = useState<HierHit[]>([]);
useEffect(() => {
  const t = setTimeout(() => setHits(hierarchy && q.trim() ? searchHierarchy(hierarchy, q) : []), 200);
  return () => clearTimeout(t);
}, [q, hierarchy]);
```

```tsx
<input className="hier-search" data-dfx="hier-search" placeholder="搜索实例/模块名,支持 *"
       value={q} onChange={(e) => setQ(e.target.value)} />
{q.trim() !== "" && (
  <ul className="hier-hits" data-dfx="hier-hits">
    {hits.map((hit) => (
      <li key={hit.instId} draggable data-gc-node={hit.instId}
          title={hit.path}
          onDragStart={(e) => e.dataTransfer.setData(HIER_DND_MIME, hit.instId)}
          onClick={() => expandTo(hit.instId)}
          onDoubleClick={() => importHit(hit.instId)}>
        <span className="hier-inst">{hit.instanceName}</span>
        <span className="hier-def">{hit.designName}</span>
        <span className="hier-path">{hit.path}</span>
      </li>
    ))}
    {hits.length >= 200 && <li className="hier-more">已截断 200 条,请继续输入…</li>}
  </ul>
)}
```

`expandTo`:把路径所有前缀灌进 `expanded` Set(`setExpanded(new Set([...prev, ...prefixes]))`);`importHit`:调既有 `store.importBlocks([nodeToPayload(hierarchy, id)])`(store.ts:206-211)。拖拽复用现 MIME(HierarchyPanel.tsx:12)。styles.css 在 `#ws-genconn` 段加:

```css
#ws-genconn .hier-search { width: 100%; margin-bottom: 6px; }
#ws-genconn .hier-hits { list-style: none; margin: 0 0 8px; padding: 0; max-height: 40%; overflow: auto; border-bottom: 1px solid var(--border); }
#ws-genconn .hier-hits li { padding: 2px 4px; cursor: pointer; display: flex; gap: 6px; align-items: baseline; }
#ws-genconn .hier-hits li:hover { background: var(--row-hover); }
#ws-genconn .hier-hits .hier-path { color: var(--text-dim); font-size: 11px; margin-left: auto; }
```

- [ ] **Step 4: 手验 + Commit**

```bash
npm run test:unit && npm run typecheck && npm run dev:electron  # 打开设计,搜索、点击定位、双击入画布
git add src/genconn/hierarchy.ts src/genconn/importBlocks.ts src/genconn/HierarchyPanel.tsx \
        src/genconn/styles.css tests/unit/dfx-search.test.ts
git commit -m "feat(dfx): hierarchy search box — substring/wildcard over instance+module names, hierPath on imported blocks"
```

### Task 4: ctrlgen CLI 桥(Electron 六件套)+ 桩二进制集成测试

**Files:**
- Modify: `electron/cli.cjs`、`electron/main.cjs`、`electron/preload.cjs`
- Modify: `src/core-bridge/dft.d.ts`
- Create: `src/core-bridge/ctrlgen.ts`
- Modify: `scripts/stage-bin.sh:7`
- Create: `tests/integration/ctrlgen-cli.test.ts`

- [ ] **Step 1: 失败集成测试(桩 ctrlgen 脚本 + DFT_CORE_BIN_DIR)**

```ts
import { test } from "node:test"; import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os"; import path from "node:path";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ctrlgenGen } = require("../../electron/cli.cjs");

test("ctrlgenGen spawns bin, passes spec file, parses ===FILE:=== markers", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ctrlgen-stub-"));
  writeFileSync(path.join(dir, "ctrlgen"),
    `#!/bin/sh\n[ "$1" = "gen" ] || exit 2\n` +
    `printf '===FILE:m_ds1.v===\\nmodule m_ds1;\\nendmodule\\n===FILE:m_ds1.tcl===\\ncreate_instance  u_m_ds1 -of_module m_ds1\\n'\n`);
  chmodSync(path.join(dir, "ctrlgen"), 0o755);
  process.env.DFT_CORE_BIN_DIR = dir;
  const { files } = await ctrlgenGen({ schemaVersion: 2, moduleBase: "m", dsIndex: 1, pins: [] });
  assert.equal(files.length, 2);
  assert.equal(files[0].name, "m_ds1.v");
  assert.ok(files[1].text.includes("create_instance"));
});
```

Run: `node --test tests/integration/ctrlgen-cli.test.ts` → FAIL(ctrlgenGen 未导出)。

- [ ] **Step 2: cli.cjs 加 `ctrlgenGen`(照 genconnGenerateAll:临时文件 + run + parseFileMarkers)**

```js
// ctrlgen gen <spec.json> -> { files: [{name,text}] }  (DFX ctrl IP 三件套)
async function ctrlgenGen(spec) {
  const tmp = path.join(os.tmpdir(), `ctrlgen-${process.pid}-${Date.now()}.json`);
  await fsp.writeFile(tmp, JSON.stringify(spec));
  try {
    const raw = await run("ctrlgen", ["gen", tmp]);
    return { files: parseFileMarkers(raw) };
  } finally {
    await fsp.unlink(tmp).catch(() => {});
  }
}
```

(`path/os/fsp` 若文件里已有 require 就复用;`module.exports` 追加 `ctrlgenGen`。)

- [ ] **Step 3: main.cjs / preload.cjs / dft.d.ts / core-bridge**

main.cjs(genconn handle 旁):

```js
ipcMain.handle("dft:ctrlgen:gen", (_e, spec) => cli.ctrlgenGen(spec));
```

preload.cjs(`window.dft` 对象里加命名空间):

```js
  ctrlgen: {
    gen: (spec) => ipcRenderer.invoke("dft:ctrlgen:gen", spec),
  },
```

dft.d.ts(DftBridge 接口):

```ts
  ctrlgen: {
    gen(spec: unknown): Promise<{ files: { name: string; text: string }[] }>;
  };
```

`src/core-bridge/ctrlgen.ts`(仿 genconn.ts):

```ts
import type { CtrlIpSpec } from "../genconn/core/model.ts";

export const dftCtrlgen = {
  gen: (spec: CtrlIpSpec) => window.dft.ctrlgen.gen(spec),
};
```

stage-bin.sh:7 的循环 `for b in hdl genconn` → `for b in hdl genconn ctrlgen`。

- [ ] **Step 4: 测试通过 + Commit**

```bash
node --test tests/integration/ctrlgen-cli.test.ts && npm run typecheck
git add electron/cli.cjs electron/main.cjs electron/preload.cjs src/core-bridge/dft.d.ts \
        src/core-bridge/ctrlgen.ts scripts/stage-bin.sh tests/integration/ctrlgen-cli.test.ts
git commit -m "feat(dfx): ctrlgen CLI bridge — cli.cjs/ipc/preload/typed wrapper/stage-bin (stub-binary test)"
```

### Task 5: get-netlist typed 封装(带 tie)

**Files:**
- Modify: `src/core-bridge/model.ts`、`src/core-bridge/client.ts`

- [ ] **Step 1: model.ts 加类型**

```ts
export interface NetConnection {
  instanceId: string;
  port: string;
  direction: "in" | "out" | "inout";
  net: string;
  /** 常量 tie 字面量("1'b0"/"4'b101");非常量或悬空为 ""(M0 tie 补丁) */
  tie: string;
}
export interface NetlistResult {
  ownerInstanceId: string;
  nets: { name: string; width: number; busLabel?: string; netKind?: string }[];
  connections: NetConnection[];
  truncated?: boolean;
}
```

- [ ] **Step 2: client.ts 的 dftDesign 加方法(照 get-ports 的封装样式,`query` 直通不动 Electron 层)**

```ts
  getNetlist: (p: { ownerInstanceId: string }) =>
    q<NetlistResult>("get-netlist", p),
```

(`q` 为该文件既有的 query helper 名,以 client.ts:19-50 实际命名为准。)

- [ ] **Step 3: typecheck + Commit**

```bash
npm run typecheck
git add src/core-bridge/model.ts src/core-bridge/client.ts
git commit -m "feat(dfx): typed get-netlist wrapper with tie field"
```

### Task 6: store dfx slice —— 计数器分配 / 增删 / 焦点 / 弹窗状态(TDD)

**Files:**
- Create: `src/genconn/dfx/edit.ts`(纯 doc 变换)
- Modify: `src/genconn/store.ts`
- Create: `tests/unit/dfx-edit.test.ts`

- [ ] **Step 1: 失败单测**

```ts
import { test } from "node:test"; import assert from "node:assert/strict";
import { emptyDocument } from "../../src/genconn/core/document.ts";
import { allocModuleDs, allocMuxDs, upsertCtrlIp, removeCtrlIp, ctrlIpByModule }
  from "../../src/genconn/dfx/edit.ts";

test("counters are independent and monotonic (D3/A6)", () => {
  let d = emptyDocument("chip");
  let r = allocModuleDs(d); d = r.doc;
  assert.equal(r.ds, 1);
  r = allocModuleDs(d); d = r.doc;
  assert.equal(r.ds, 2);
  const m = allocMuxDs(d, 3); d = m.doc;          // 一次要 3 个 mux 号
  assert.deepEqual(m.ds, [1, 2, 3]);
  const m2 = allocMuxDs(d, 1); d = m2.doc;
  assert.deepEqual(m2.ds, [4]);                    // 跨模块连续
  assert.equal(allocModuleDs(d).ds, 3);            // 模块计数器不受 mux 影响
});

test("upsert/remove ctrlIp keyed by final module name; counters never rewind", () => {
  let d = emptyDocument("chip");
  const entry = {
    spec: { schemaVersion: 2 as const, moduleBase: "pll_ctrl", dsIndex: 1, pins: [] },
    ctrlInstId: "i1", targets: {},
  };
  d = upsertCtrlIp(d, entry);
  assert.equal(d.ctrlIps.length, 1);
  d = upsertCtrlIp(d, { ...entry, ctrlInstId: "i2" });   // 同名 -> 替换
  assert.equal(d.ctrlIps.length, 1);
  assert.equal(d.ctrlIps[0].ctrlInstId, "i2");
  assert.ok(ctrlIpByModule(d, "pll_ctrl_ds1"));
  d = removeCtrlIp(d, "pll_ctrl_ds1");
  assert.equal(d.ctrlIps.length, 0);
});
```

- [ ] **Step 2: 实现 `src/genconn/dfx/edit.ts`(不可变风格,与 core/edit.ts 一致)**

```ts
// DFX ctrl 的文档级编辑(纯函数,一次调用 = 一步 undo)。spec §5.3。
import type { DocCtrlIp, GenConnDocument } from "../core/model.ts";

export function moduleNameOf(e: DocCtrlIp["spec"]): string {
  return e.dsIndex != null ? `${e.moduleBase}_ds${e.dsIndex}` : e.moduleBase;
}

export function allocModuleDs(doc: GenConnDocument): { doc: GenConnDocument; ds: number } {
  return { doc: { ...doc, moduleDsNext: doc.moduleDsNext + 1 }, ds: doc.moduleDsNext };
}

export function allocMuxDs(doc: GenConnDocument, n: number): { doc: GenConnDocument; ds: number[] } {
  const ds = Array.from({ length: n }, (_, i) => doc.muxDsNext + i);
  return { doc: { ...doc, muxDsNext: doc.muxDsNext + n }, ds };
}

export function ctrlIpByModule(doc: GenConnDocument, mod: string): DocCtrlIp | undefined {
  return doc.ctrlIps.find((c) => moduleNameOf(c.spec) === mod);
}

export function upsertCtrlIp(doc: GenConnDocument, entry: DocCtrlIp): GenConnDocument {
  const mod = moduleNameOf(entry.spec);
  const rest = doc.ctrlIps.filter((c) => moduleNameOf(c.spec) !== mod);
  return { ...doc, ctrlIps: [...rest, entry] };
}

export function removeCtrlIp(doc: GenConnDocument, mod: string): GenConnDocument {
  return { ...doc, ctrlIps: doc.ctrlIps.filter((c) => moduleNameOf(c.spec) !== mod) };
}
```

- [ ] **Step 3: store.ts 接线(瞬态 UI 状态 + doc action)**

瞬态字段(selection 旁):

```ts
  /** DFX:清单面板焦点(终模块名)与 fit 请求序号;配置弹窗目标 */
  dfxFocus: string | null;
  dfxFitSeq: number;
  dfxDialog: { mode: "edit"; module: string } | { mode: "new"; seedInstId: Id } | null;
```

actions:

```ts
  setDfxFocus: (mod) => set((s) => ({ dfxFocus: mod, dfxFitSeq: s.dfxFitSeq + 1 })),
  openDfxDialog: (d) => set({ dfxDialog: d }),
  closeDfxDialog: () => set({ dfxDialog: null }),
  applyCtrlIp: (entry) => set({ doc: upsertCtrlIp(get().doc, entry), dirty: true }),
  deleteCtrlIp: (mod) => set({ doc: removeCtrlIp(get().doc, mod), dirty: true, dfxFocus: null }),
```

(zundo 只跟踪 doc —— dfxFocus/dfxDialog 不进 undo,正确。)

- [ ] **Step 4: 测试 + Commit**

```bash
npm run test:unit && npm run typecheck
git add src/genconn/dfx/edit.ts src/genconn/store.ts tests/unit/dfx-edit.test.ts
git commit -m "feat(dfx): store slice — independent ds counters, upsert/remove ctrlIp, focus/dialog state"
```

### Task 7: spec 构建纯函数 + DFX 配置大弹窗(D4,spec §5.2)

**Files:**
- Create: `src/genconn/dfx/build.ts`
- Create: `src/genconn/dfx/DfxDialog.tsx`
- Modify: `src/genconn/Workspace.tsx`(挂弹窗)
- Modify: `src/genconn/CanvasView.tsx`(块双击入口)
- Modify: `src/genconn/styles.css`
- Create: `tests/unit/dfx-build.test.ts`

- [ ] **Step 1: 失败单测(spec 构建:行状态 → CtrlIpSpec,mux 取号)**

```ts
import { test } from "node:test"; import assert from "node:assert/strict";
import { buildCtrlIpSpec } from "../../src/genconn/dfx/build.ts";

const rows = [
  { pin: "enable", dir: "in", width: 1, nodeId: "top.PLL_1", instName: "PLL_1",
    role: "control" as const, stitch: ["mux"] as const },
  { pin: "LOCKED", dir: "out", width: 1, nodeId: "top.PLL_1", instName: "PLL_1",
    role: "observe" as const, stitch: [] },
  { pin: "cfg", dir: "in", width: 2, nodeId: "top.U_X", instName: "U_X",
    role: "control" as const, stitch: ["replace", "mux"] as const },
];

test("buildCtrlIpSpec: targets, per-bit stitch, mux naming ds numbers in row order", () => {
  const { spec, muxCount } = buildCtrlIpSpec({
    moduleBase: "pll_ctrl", dsIndex: 1, rows: rows as never, muxDs: [7, 8],
  });
  assert.equal(muxCount, 2);
  assert.equal(spec.moduleBase, "pll_ctrl");
  const [en, lk, cfg] = spec.pins;
  assert.equal(en.stitch, "mux");
  assert.equal(en.muxName, "u_dfx_PLL_1_enable_persistent_mux_inst_ds7");
  assert.equal(en.target, "PLL_1/enable");
  assert.equal(lk.mode, "observe");
  assert.equal(lk.target, "PLL_1/LOCKED");
  assert.deepEqual(cfg.stitch, ["replace", "mux"]);
  assert.deepEqual(cfg.muxName, [null, "u_dfx_U_X_cfg_persistent_mux_inst_ds8"]);
});

test("duplicate port names across instances get instance prefix (A2)", () => {
  const dup = [
    { ...rows[0] },
    { pin: "enable", dir: "in", width: 1, nodeId: "top.PLL_2", instName: "PLL_2",
      role: "control" as const, stitch: ["mux"] as const },
  ];
  const { spec } = buildCtrlIpSpec({ moduleBase: "m", dsIndex: 2, rows: dup as never, muxDs: [1, 2] });
  assert.deepEqual(spec.pins.map((p) => p.portName), ["PLL_1_enable", "PLL_2_enable"]);
});
```

- [ ] **Step 2: 实现 `src/genconn/dfx/build.ts`**

```ts
// 弹窗行状态 -> CtrlIpSpec(spec §4.1)。mux 号由调用方一次 allocMuxDs 后传入。
import type { CtrlIpSpec, CtrlPin } from "../core/model.ts";
import { tclTarget, type Stitch } from "./judge.ts";

export interface DfxRow {
  pin: string;
  dir: "in" | "out" | "inout";
  width: number;
  nodeId: string;    // daemon 层次 id
  instName: string;  // 目标实例名(mux 命名/前缀用;层次路径 '/'->'_' 已由调用方摊平)
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
  // A2:同名冲突 -> 实例名前缀
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
```

(注:同构总线才走 `target`;本 UI 的目标总是「实例引脚整体」,天然同构,`targets[]` 留给 CLI 手写 spec 的场景,如 EMA。)

- [ ] **Step 3: 单测过后写 DfxDialog.tsx(近全屏 overlay;数据加载 + 表格 + 预览)**

`src/genconn/dfx/DfxDialog.tsx` 骨架(完整实现按此结构展开,约 260 行):

```tsx
// DFX 配置大弹窗(D4/spec §5.2)。数据:get-ports + get-netlist(tie);判定:judge.ts;
// 预览:400ms 防抖调 ctrlgen CLI;确认:分配 ds 号 -> buildCtrlIpSpec -> store.applyCtrlIp。
import { useEffect, useMemo, useState } from "react";
import { dftDesign } from "../../core-bridge/client.ts";
import { dftCtrlgen } from "../../core-bridge/ctrlgen.ts";
import { useStore } from "../store.ts";
import { judgePin, parentOf, type Stitch } from "./judge.ts";
import { buildCtrlIpSpec, type DfxRow } from "./build.ts";
import { allocModuleDs, allocMuxDs, moduleNameOf, upsertCtrlIp } from "./edit.ts";

type Row = DfxRow & { driverLabel: string; auto: readonly Stitch[]; override: "auto" | "mux" | "direct" };

async function loadRows(nodeId: string, instName: string): Promise<Row[]> {
  const [ports, parentNl] = await Promise.all([
    dftDesign.getPorts({ nodeId }),
    parentOf(nodeId) ? dftDesign.getNetlist({ ownerInstanceId: parentOf(nodeId)! }) : Promise.resolve(null),
  ]);
  const conn = new Map(
    (parentNl?.connections ?? []).filter((c) => c.instanceId === nodeId).map((c) => [c.port, c]));
  return ports.ports.map((p) => {
    const c = conn.get(p.name) ?? { net: "", tie: "" };
    const auto = judgePin({ net: c.net, tie: c.tie }, p.width || 1);
    const driverLabel = c.tie ? `tie ${c.tie}` : c.net ? `逻辑(${c.net})` : "悬空";
    return { pin: p.name, dir: p.direction as Row["dir"], width: p.width || 1, nodeId, instName,
             role: "ignore", stitch: [], driverLabel, auto, override: "auto" } as Row;
  });
}
```

组件要点(逐条实现):

- **state**:`targets: {nodeId, instName}[]`(种子来自 `dfxDialog`;编辑模式从 DocCtrlIp 反查)、`rows: Row[]`、`moduleBase`(默认 = 首目标 designName + `_ctrl`)、`filter`、`dirFilter: null|"in"|"out"`、`preview: {name,text}[]`、`tab: 0|1|2`、`err`。
- **表格行**:pin / dir(chips 配色类名 `dir-in`/`dir-out` 复用 PortsTab 惯例)/ width / `driverLabel` / 角色三态 radio(control 仅 in 可选、observe 仅 out 可选、inout 禁用 title 提示 A3)/ 缝合 select(`auto(默认,显示判定结果汇总)` | `mux` | `直连`)。行属性 `data-dfx-row={nodeId + "/" + pin}`。
- **stitch 计算**:`effective(r) = r.override === "auto" ? r.auto : r.override === "mux" ? all("mux") : r.auto.map(s => s === "mux" ? "replace" : s === "replace" ? "replace" : "connect")` ——「直连」二落一:有原连接(auto 为 replace/mux 的位)→ replace,悬空位 → connect(spec §5.2)。
- **重复控制拦截**:确认前查其它 ctrlIps 的 pins 是否已含同一 `target`(§4.4)→ `window.alert("已被 <模块名> 占用")`。
- **预览**:`useEffect` 400ms 防抖:构造临时 spec(dsIndex 用 `doc.moduleDsNext` 预览值、muxDs 用 `doc.muxDsNext` 起的连续预览号,**不写回**)→ `dftCtrlgen.gen` → `preview` 三 tab `<pre className="genprev">`。失败写 `err`。
- **确认**(一次 set = 一步 undo,在 store 加 action `confirmCtrlIp` 封装):`allocModuleDs`(编辑模式复用原 dsIndex 不再取号)→ 统计 mux 位数 → `allocMuxDs` → `buildCtrlIpSpec` → 确保画布有 ctrl 块:`addBlockAt(doc, { designName: moduleNameOf(spec), instanceName: "u_" + moduleNameOf(spec) }, at)`(at 取视野中心 `viewCenter`)→ `upsertCtrlIp` → 关弹窗。`targets` map 记录 `{[nodeId]: 画布instId}`(由 `hierPath === nodeId` 反查 `doc` 实例;查不到就缺键)。
- **布局**:overlay `position:fixed; inset:0; background:rgba(0,0,0,.45)`,内容盒 `width:92vw; height:88vh; display:flex`(左表格 flex:1、右预览 360px)。Esc 关闭。根元素 `data-dfx="dialog"`。

Workspace.tsx 挂载(GeneratePanel 旁):

```tsx
{dfxDialog && <DfxDialog req={dfxDialog} onClose={() => useStore.getState().closeDfxDialog()} />}
```

CanvasView.tsx 的 InstanceNode `onDblClick`:现状是「下钻」;改为 —— 若该实例 `hierPath` 存在或其 def 是 ctrl 块(`ctrlIpByModule(doc, def.designName)`)则 `openDfxDialog({mode:"new", seedInstId}/{mode:"edit", module})`,否则保留原下钻行为。右键菜单(ContextMenu.tsx)加「配置 DFX 控制/观测…」同入口。

- [ ] **Step 4: 手工验证(真 daemon)+ Commit**

```bash
npm run test:unit && npm run typecheck && npm run dev:electron
# 打开 dft_ctrl/chip_top/chip_top.f -> 搜索 PLL_1 双击入画布 -> 双击块:
# 表格出全部引脚;enable 行显示 "tie 1'b1"、自动 mux;勾控制 + LOCKED 勾观测;
# 右侧 400ms 后出现三件套预览;确认后画布出现 u_pll_ctrl_ds1 块
git add src/genconn/dfx/build.ts src/genconn/dfx/DfxDialog.tsx src/genconn/Workspace.tsx \
        src/genconn/CanvasView.tsx src/genconn/ContextMenu.tsx src/genconn/styles.css \
        src/genconn/store.ts tests/unit/dfx-build.test.ts
git commit -m "feat(dfx): config dialog — pin table with auto-judgment, live triple preview, confirm writes ctrlIp + canvas block"
```

### Task 8: 画布缝合可视化 —— overlay Layer + 整组高亮/调暗 + fit(D6,spec §5.4)

**Files:**
- Create: `src/genconn/dfx/DfxOverlay.tsx`
- Modify: `src/genconn/CanvasView.tsx`

- [ ] **Step 1: DfxOverlay 组件(纯展示,输入 = doc.ctrlIps + boxes 几何 + focus)**

```tsx
// 画布只读 overlay:控制/观测虚线、mux 梯形、✂ 断开标记(spec §5.4)。
// 坐标系与主层一致(挂在同一 Stage 变换下);线宽用 1/scale 保持屏幕恒定。
import { Group, Line, Text } from "react-konva";
import type { DocCtrlIp } from "../core/model.ts";
import { moduleNameOf } from "./edit.ts";

export interface BoxGeom { instanceId: string; x: number; y: number; w: number; h: number }

export function DfxOverlay({ ctrlIps, boxes, focus, scale, colors }: {
  ctrlIps: DocCtrlIp[]; boxes: BoxGeom[]; focus: string | null; scale: number;
  colors: { accent: string; dim: string };
}) {
  const geom = new Map(boxes.map((b) => [b.instanceId, b]));
  const sw = 1.5 / scale;
  return (
    <>
      {ctrlIps.map((c) => {
        const mod = moduleNameOf(c.spec);
        if (focus && focus !== mod) return null;   // 无焦点画全部;有焦点只画该组
        const cg = geom.get(c.ctrlInstId);
        if (!cg) return null;
        return c.spec.pins.map((p, pi) => {
          const tgtInst = Object.entries(c.targets).find(([nodeId]) =>
            (p.target ?? "").startsWith(nodeId.split(".").slice(1).join("/")))?.[1];
          const tg = tgtInst ? geom.get(tgtInst) : undefined;
          if (!tg) return null;
          const y0 = cg.y + cg.h * ((pi + 1) / (c.spec.pins.length + 1));
          const from = { x: cg.x + cg.w, y: y0 };
          const to = { x: tg.x, y: tg.y + tg.h / 2 };
          const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
          const isCtl = p.mode === "control";
          const hasMux = isCtl && (Array.isArray(p.stitch) ? p.stitch.includes("mux") : p.stitch === "mux");
          const hasCut = isCtl && (Array.isArray(p.stitch) ? p.stitch.includes("replace") : p.stitch === "replace");
          const pts = isCtl ? [from.x, from.y, to.x, to.y] : [to.x, to.y, from.x, from.y];
          return (
            <Group key={mod + p.portName}>
              <Line points={pts} stroke={colors.accent} strokeWidth={sw} dash={[6 / scale, 4 / scale]} />
              {!isCtl && ( /* 观测箭头(指向 ctrl 块) */
                <Line points={[from.x, from.y, from.x + 8 / scale, from.y - 4 / scale,
                               from.x + 8 / scale, from.y + 4 / scale]}
                      closed fill={colors.accent} />
              )}
              {hasMux && ( /* mux 小梯形,悬停 title 由清单/详情页提供全名 */
                <Line points={[mid.x - 7 / scale, mid.y - 8 / scale, mid.x + 7 / scale, mid.y - 4 / scale,
                               mid.x + 7 / scale, mid.y + 4 / scale, mid.x - 7 / scale, mid.y + 8 / scale]}
                      closed stroke={colors.accent} strokeWidth={sw} fill="rgba(0,0,0,0)" />
              )}
              {hasCut && <Text text="✂" x={to.x - 16 / scale} y={to.y - 14 / scale}
                               fontSize={12 / scale} fill={colors.accent} />}
            </Group>
          );
        });
      })}
    </>
  );
}
```

- [ ] **Step 2: CanvasView 接线(主层后加只读 Layer;dim;fit)**

`CanvasView.tsx:871`(主 `</Layer>` 后、`</Stage>` 前):

```tsx
<Layer listening={false}>
  <DfxOverlay ctrlIps={doc.ctrlIps} boxes={overlayBoxes} focus={dfxFocus} scale={scale}
              colors={{ accent: colors.accent, dim: colors.boxStroke }} />
</Layer>
```

`overlayBoxes` 从既有 `boxes` 映射 `{instanceId, x, y, w, h}`。**调暗**:计算焦点组集合

```ts
const dfxGroup = useMemo(() => {
  if (!dfxFocus) return null;
  const c = ctrlIpByModule(doc, dfxFocus);
  if (!c) return null;
  return new Set([c.ctrlInstId, ...Object.values(c.targets)]);
}, [doc, dfxFocus]);
```

传给 InstanceNode 新 prop `dimmed={dfxGroup ? !dfxGroup.has(b.instanceId) : false}`,InstanceNode 的根 `<Group opacity={dimmed ? 0.25 : 1} ...>`。点画布空白清焦点:onStageMouseDown 的空白分支加 `setDfxFocus(null)`。**fit**:`useEffect` 监听 `dfxFitSeq`,对 `dfxGroup` 的 boxes 求包围盒,`scale = clamp(min((viewW-80)/bw, (viewH-80)/bh), 0.05, 1)`、`pos` 居中后 `setScale/setPos`。

- [ ] **Step 3: 手验(单击清单前可先用 store 手动 setDfxFocus)+ Commit**

```bash
npm run typecheck && npm run dev:electron   # 确认 overlay 虚线/梯形/✂ 随 zoom 稳定,dim+fit 生效
git add src/genconn/dfx/DfxOverlay.tsx src/genconn/CanvasView.tsx
git commit -m "feat(dfx): canvas overlay — stitch edges, mux glyph, cut marker; group dim + fit on focus"
```

### Task 9: DFX Ctrl 清单面板(D5,spec §5.3)

**Files:**
- Create: `src/genconn/dfx/DfxPanel.tsx`
- Modify: `src/genconn/Workspace.tsx:134-137`、`src/genconn/styles.css`

- [ ] **Step 1: 组件**

```tsx
// 左栏「DFX Ctrl」清单:单击=共同页面整组高亮+fit;双击=编辑;行尾按钮 编辑/单独页面。
import { useStore } from "../store.ts";
import { moduleNameOf } from "./edit.ts";

export function DfxPanel({ onDetail }: { onDetail: (mod: string) => void }) {
  const ctrlIps = useStore((s) => s.doc.ctrlIps);
  const focus = useStore((s) => s.dfxFocus);
  const setFocus = useStore((s) => s.setDfxFocus);
  const openDialog = useStore((s) => s.openDfxDialog);
  return (
    <div className="panel left dfx" data-dfx="panel">
      <div className="panel-title">DFX Ctrl</div>
      {ctrlIps.length === 0 && <div className="dfx-empty">双击画布上的目标块开始配置</div>}
      <ul>
        {ctrlIps.map((c) => {
          const mod = moduleNameOf(c.spec);
          const nCtl = c.spec.pins.filter((p) => p.mode === "control").length;
          const nObs = c.spec.pins.length - nCtl;
          return (
            <li key={mod} className={focus === mod ? "sel" : ""} data-dfx-item={mod}
                onClick={() => setFocus(mod)}
                onDoubleClick={() => openDialog({ mode: "edit", module: mod })}>
              <span className="dfx-name">{mod}</span>
              <span className="dfx-meta">{Object.keys(c.targets).length} 目标 · {nCtl}控/{nObs}观</span>
              <button title="编辑" onClick={(e) => { e.stopPropagation(); openDialog({ mode: "edit", module: mod }); }}>✎</button>
              <button title="单独页面" data-dfx-detail={mod}
                      onClick={(e) => { e.stopPropagation(); onDetail(mod); }}>⧉</button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Workspace 挂载 + 样式**

`Workspace.tsx` 左栏(`<HierarchyPanel />` 之后)加 `<DfxPanel onDetail={setDetailMod} />`(`detailMod` state 供 Task 10);styles.css:

```css
#ws-genconn .gc-leftcol > .panel.left.dfx { flex: 0 0 auto; max-height: 30%; border-top: 1px solid var(--border); }
#ws-genconn .panel.dfx ul { list-style: none; margin: 0; padding: 0; }
#ws-genconn .panel.dfx li { display: flex; gap: 6px; align-items: center; padding: 2px 4px; cursor: pointer; }
#ws-genconn .panel.dfx li.sel, #ws-genconn .panel.dfx li:hover { background: var(--row-hover); }
#ws-genconn .panel.dfx .dfx-meta { color: var(--text-dim); font-size: 11px; margin-left: auto; }
```

- [ ] **Step 3: 手验 + Commit**

```bash
npm run typecheck && npm run dev:electron
git add src/genconn/dfx/DfxPanel.tsx src/genconn/Workspace.tsx src/genconn/styles.css
git commit -m "feat(dfx): left-column DFX Ctrl list panel — click focus+fit, dblclick edit, detail button"
```

### Task 10: 单独 schematic 详情页(D6,复用 hierarchy 纯布局模块)

**Files:**
- Create: `src/genconn/dfx/DfxDetail.tsx`
- Modify: `src/genconn/Workspace.tsx`
- Create: `tests/unit/dfx-detail-graph.test.ts`

- [ ] **Step 1: 失败单测(图构建纯函数)**

```ts
import { test } from "node:test"; import assert from "node:assert/strict";
import { buildDetailGraph } from "../../src/genconn/dfx/DfxDetail.tsx";

const entry = {
  spec: {
    schemaVersion: 2 as const, moduleBase: "pll_ctrl", dsIndex: 1,
    dfxModeSource: "u_dfx_static_hyper_ctl_tdr/dfx_mode",
    pins: [
      { portName: "enable", mode: "control" as const, width: 1, target: "PLL_1/enable",
        stitch: "mux" as const, muxName: "u_dfx_PLL_1_enable_persistent_mux_inst_ds1" },
      { portName: "LOCKED", mode: "observe" as const, width: 1, target: "PLL_1/LOCKED" },
    ],
  },
  ctrlInstId: "i1", targets: { "top.PLL_1": "i2" },
};

test("detail graph: ctrl node + target node + mux node + dfx source, edges directed", () => {
  const g = buildDetailGraph(entry);
  const kinds = Object.values(g.nodes).map((n) => n.designName);
  assert.ok(Object.keys(g.nodes).includes("ctrl"));           // ctrl IP 节点
  assert.ok(kinds.includes("mux"));                            // mux 节点
  assert.equal(g.edges.filter((e) => e.toNode === "ctrl").length, 2);  // dfx_mode + LOCKED 入
  const muxEdges = g.edges.filter((e) => e.fromNode === "ctrl");
  assert.equal(muxEdges.length, 1);                            // enable 出 -> mux
});
```

- [ ] **Step 2: 实现 —— buildDetailGraph + 渲染**

`DfxDetail.tsx`:图构建复用 `src/hierarchy/core/schematic.ts` 的类型/工具,布局用 `src/hierarchy/schematic/laid.ts` + `elkLayout.ts`(全部纯模块,已确认可跨工作区 import):

```tsx
import { newSchematic, makeNode, toElkGraph, portId } from "../../hierarchy/core/schematic.ts";
import { layout } from "../../hierarchy/schematic/elkLayout.ts";
import { toLaid, boundsOf, fitTransform } from "../../hierarchy/schematic/laid.ts";
```

`buildDetailGraph(entry: DocCtrlIp): SchematicGraph`:

- `ctrl` 节点:id `"ctrl"`,instanceName = 终模块名,ports = `dfx_mode` + 每 pin 的 IP 侧端口(控制出/观测入 + `_tdr` 反侧);
- 每个目标实例一个节点(id = nodeId,ports = 涉及的 pin);
- 每个 mux 位一个节点(kind "logic",instanceName = muxName,3 入 1 出);
- `dfx_mode 源` 一个 port 节点;
- 边:控制 `ctrl/<pin>` → mux/目标 pin(replace/connect 直达);观测 目标 pin → `ctrl/<pin>`;`dfx源` → ctrl 与各 mux 的 sel。

渲染:近全屏 overlay(同 DfxDialog 布局),`useEffect` 里 `toElkGraph → layout → toLaid`,Konva `<Stage>` 两个 `listening={false}` Layer 画 wires(`<Line points>`)与 boxes(`<Rect>+<Text>` 端口名小字),`fitTransform(boundsOf(laid), viewport)` 一次性取景。页头:模块名 + 「编辑」按钮(`openDfxDialog({mode:"edit"...})` 并关详情)+ Esc/✕ 关闭。根元素 `data-dfx="detail"`。

Workspace.tsx:`{detailMod && <DfxDetail module={detailMod} onClose={() => setDetailMod(null)} />}`。

- [ ] **Step 3: 测试 + 手验 + Commit**

```bash
npm run test:unit && npm run typecheck && npm run dev:electron
git add src/genconn/dfx/DfxDetail.tsx src/genconn/Workspace.tsx tests/unit/dfx-detail-graph.test.ts
git commit -m "feat(dfx): read-only detail schematic per modification — ELK layout reuse, dfx_mode/mux/target topology"
```

### Task 11: GeneratePanel 并入三件套(spec §5.4)

**Files:**
- Modify: `src/genconn/GeneratePanel.tsx:106-131`

- [ ] **Step 1: 在自动生成 effect 中追加 ctrlgen 产物**

在 `dftGenconn.generateAll(...)` 得到 `files` 之后、`setFiles` 之前:

```ts
      try {
        for (const c of doc.ctrlIps) {
          const r = await dftCtrlgen.gen(c.spec);
          files.push(...r.files);
        }
      } catch (e) {
        setErr(`DFX ctrl 生成失败: ${(e as Error).message}`);
      }
```

(具体变量名对齐该 effect 现有实现;`doc.ctrlIps` 变化已被 effect 的 doc 依赖覆盖。)

- [ ] **Step 2: 手验 + Commit**

```bash
npm run dev:electron  # GeneratePanel 打开:文件列表含 pll_ctrl_ds1.v/.icl/.tcl,预览/下载正常
git add src/genconn/GeneratePanel.tsx
git commit -m "feat(dfx): GeneratePanel lists ctrl IP trio alongside connection files"
```

### Task 12: e2e 冒烟 + 全量回归

**Files:**
- Create: `tests/e2e/dfx.spec.ts`

- [ ] **Step 1: e2e(真二进制,无则 skip;惯例照 tests/e2e/schematic.spec.ts)**

```ts
import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import path from "node:path";
import { launchApp } from "../helpers/electron.ts";

const BIN = path.resolve(process.cwd(), "../dft-core/build");
test.skip(!existsSync(path.join(BIN, "hdl")) || !existsSync(path.join(BIN, "ctrlgen")),
  "no hdl/ctrlgen binary");

test("dfx: search -> import -> configure -> confirm -> panel + generate", async () => {
  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: BIN });
  const filelist = path.resolve(process.cwd(), "tests/fixtures/soc.f");
  await page.evaluate((fl) => (window as never as { __dftStore: { getState(): { openDesign(o: { filelist: string }): void } } })
    .__dftStore.getState().openDesign({ filelist }), filelist);
  await page.click('text=连接生成');                       // 切工作区(TopBar tab)
  await page.fill('[data-dfx="hier-search"]', "u_");
  await page.waitForSelector('[data-dfx="hier-hits"] li');
  await page.dblclick('[data-dfx="hier-hits"] li');        // 双击命中 -> 入画布
  // 打开配置弹窗(直接走 store,双击画布坐标不稳)
  await page.evaluate(() => {
    const s = (window as never as { __gcStore: { getState(): { doc: { library: { defs: { childInstances: { id: string; hierPath?: string }[] }[] } }; openDfxDialog(d: unknown): void } } }).__gcStore.getState();
    const inst = s.doc.library.defs.flatMap((d) => d.childInstances).find((i) => i.hierPath);
    s.openDfxDialog({ mode: "new", seedInstId: inst!.id });
  });
  await page.waitForSelector('[data-dfx="dialog"]');
  await page.waitForSelector("[data-dfx-row]");
  // 第一个 in 引脚设为控制 -> 预览出现 create_instance -> 确认
  await page.click('[data-dfx-row] input[value="control"]');
  await expect(page.locator('[data-dfx="dialog"] pre')).toContainText("create_instance", { timeout: 5000 });
  await page.click('button:has-text("确认")');
  await expect(page.locator("[data-dfx-item]")).toHaveCount(1);
  await app.close();
});
```

- [ ] **Step 2: 全量回归**

```bash
npm test && npm run test:e2e
```

Expected: 单测/typecheck 全绿;e2e 在有二进制的机器上通过(无则 skip)。

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/dfx.spec.ts
git commit -m "test(dfx): e2e smoke — search/import/configure/confirm/panel with real binaries"
```

---

## Self-review 已核对

- spec 覆盖:§5.1→Task 3;§5.2→Task 7(+2/4/5/6 支撑);§5.3→Task 9(+1/6);§5.4→Task 8/11;D6 单独页面→Task 10;§4.4 UI 侧拦截(方向禁用/重复控制)→Task 7;计数器语义(§9 确认)→Task 6。
- 类型一致:`CtrlIpSpec/CtrlPin/DocCtrlIp` 定义于 Task 1,后续任务均 import 同名;`moduleNameOf`(TS)与 dft-core `moduleName`(C++)语义一致;`Stitch` 单一来源 judge.ts。
- 已知偏差与对策:(a) 画布 ctrl 块暂不画端口刻度(端口细节在弹窗/详情页;spec §5.4「端口齐全」以详情页满足,如需块上端口后续加 overlay 刻度);(b) 旧文档导入的块无 `hierPath` → 弹窗提示重新从层次面板拖入;(c) e2e 依赖 store 直驱打开弹窗,画布双击路径由手验覆盖。
- 占位扫描:无 TBD;DfxDialog/DfxDetail 以「骨架 + 逐条要点」给出,所有行为/映射/命名规则均已写死,无"适当处理"类表述。
