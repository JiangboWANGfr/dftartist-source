# Pad/BScan Tab 实施计划（pad-core P2 UI）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dft-suite 新增 Pad/BScan 纯表格 Tab：`pad table --json` 拉表 → 可编辑表格（筛选/多选/区间/批量条）→ `pad_cfg.json` 自动持久化 → `pad gen` 生成两段 Tessent 配置，展示于可拖高/可折叠底部预览面板。

**Architecture:** 薄客户端。纯逻辑集中在 `src/hierarchy/core/pad.ts`（node:test 单测）；electron 侧 spawn-per-request（ctrlgen 模式）；Tab/store/样式全按仓库现有模式（openRegCountTab 单例、#ws-hierarchy 作用域 CSS）。

**Tech Stack:** React 18 + zustand v5 + Electron（preload/ipcMain）+ node:test + Playwright。

**Spec:** `docs/specs/2026-07-10-pad-bscan-tab-design.md`（§ 引用指它）。

---

## 背景知识（执行前必读）

**仓库/分支**：repo `/Users/jiangbowang/MOI/2025/dftartist/dft-suite`。工作树有用户未提交的 `docs/specs/2026-07-07-dfx-ctrl-ip-design.md` 修改——**不要碰/加/提交它**；`git add` 一律显式路径。开工前：

```bash
cd /Users/jiangbowang/MOI/2025/dftartist/dft-suite
git checkout -b feat/pad-tab
```

**验证命令**：

```bash
npx tsc --noEmit               # 类型检查（每个任务必须干净）
npm run test:unit              # node --test tests/unit + tests/integration
npm run build                  # vite build（UI 任务收尾时）
npm run test:e2e               # 构建 + playwright（Task 7）
```

**pad 二进制**：`../dft-core/build/pad`（已构建）。CLI 契约（P1 已冻结，有 golden）：
- `pad table -f <filelist> --lib <celllib> [--config <overlay.json>] --json` → 单行 JSON：`{"pads":[{path,gpio,cell,dir,padNet,coreInNet,coreOutNet,autoEnableNet,bscanEn,reuse,func,enable}...],"ssn":{"inWidth","outWidth"},"warnings":[...]}`（bscanEn 是 bool，其余 string）。warnings 走 stderr 的 `WARN ` 行（--json 时 warnings 同时在 JSON 里，忽略 stderr）。
- `pad gen -f <filelist> --lib <celllib> [--config <overlay.json>] --level chip|phy|sub [--aux external|internal]` → stdout = 输出A + 空行 + 输出B（任一为空则省略相应段与空行）。
- overlay 格式（snake_case！）：`{"pads":{"<path>":{"bscan_en":"yes|no","reuse":"in|out","func":"...","enable":"..."}}}`。UI 内部行是 camelCase（同 `pad table --json`），**序列化 overlay 时做 camel→snake 映射**（spec §5）。

**dft-suite 关键落点**（已核实的 file:line）：
- Tab 联合：`src/core-bridge/model.ts:68`；单例 tab 模式：`src/hierarchy/store.ts:187-199`（openRegCountTab）
- Tab 分发：`src/hierarchy/TabArea.tsx:33-37`；标题三元：`:25`
- dock 按钮：`src/hierarchy/Workspace.tsx:42-46`
- electron 桥：`electron/cli.cjs`（`run()` + `ctrlgenGen` 临时文件模板 :83-92）、`electron/main.cjs`（handles :89-93）、`electron/preload.cjs`、`src/core-bridge/dft.d.ts`
- filelist 全局态：`useDesign(s => s.filelist)`（`src/store/design.ts:12`）
- 表格 CSS 模板：`src/hierarchy/styles.css:110-121`（.rc-*，`#ws-hierarchy` 作用域）
- 测试模板：`tests/unit/hierarchy-tabs.test.ts`（store 直驱）、`tests/e2e/regcount.spec.ts`
- ⚠ **e2e 冲突**：`regcount.spec.ts:20` 用 `page.click(".dock-btn")`——新增第二个 dock 按钮后 Playwright strict mode 会因多匹配报错。Task 3 必须同步给两个按钮加 `data-btn` 属性并改该行选择器。

## 文件结构

| 文件 | 动作 | 职责 |
|---|---|---|
| `src/hierarchy/core/pad.ts` | 新增 | 纯逻辑：类型/筛选/区间选择/批量应用/行校验/overlay 序列化/cfg 合并 |
| `tests/unit/pad.test.ts` | 新增 | 上述纯逻辑单测 |
| `electron/cli.cjs` `electron/main.cjs` `electron/preload.cjs` | 修改 | padTable/padGen/pickLib/cfg 读写/导出文本 |
| `src/core-bridge/dft.d.ts` `src/core-bridge/pad.ts` | 修改/新增 | 桥类型 + renderer 薄封装 |
| `tests/integration/pad-cli.test.ts` | 新增 | 桥层对真实 pad 二进制的集成测试（无二进制则 skip） |
| `src/core-bridge/model.ts` | 修改 | + PadTabSpec 入 Tab 联合 |
| `src/hierarchy/store.ts` | 修改 | + pad 状态 + openPadTab/refreshPadTable/patchPadRows |
| `src/hierarchy/PadTab.tsx` | 新增 | tab 主组件（Task 3 只读版 → Task 4/6 增强） |
| `src/hierarchy/TabArea.tsx` `src/hierarchy/Workspace.tsx` `src/hierarchy/styles.css` | 修改 | 分发/按钮/样式 |
| `tests/e2e/pad.spec.ts` | 新增 | 端到端（Task 7） |
| `scripts/stage-bin.sh` | 修改 | + pad |

---

### Task 1: 纯逻辑 `core/pad.ts` + 单测

**Files:**
- Create: `src/hierarchy/core/pad.ts`、`tests/unit/pad.test.ts`

- [x] **Step 1: 写 `src/hierarchy/core/pad.ts`**

```ts
// Pad/BScan table pure logic (spec: docs/specs/2026-07-10-pad-bscan-tab-design.md).
// Types mirror `pad table --json` (camelCase); overlay serialization maps to the
// frozen P1 snake_case format. No React, no window.

export interface PadRow {
  path: string;
  gpio: string;
  cell: string;
  dir: "in" | "out" | "inout";
  padNet: string;
  coreInNet: string;
  coreOutNet: string;
  autoEnableNet: string;
  bscanEn: boolean;
  reuse: "" | "in" | "out";
  func: string;
  enable: string;
}
export interface SsnSummary { inWidth: number; outWidth: number; }
export interface PadTableResult { pads: PadRow[]; ssn: SsnSummary; warnings: string[]; }

/** 手工列 patch（批量条/单元格编辑共用）。undefined = 不改。 */
export interface PadPatch {
  bscanEn?: boolean;
  reuse?: "" | "in" | "out";
  func?: string;
  enable?: string;
}

/** 名称模式 → 命中的行 path 集合。三种形式（spec §4.2）：
 *  - 数字区间 "GPIO_33..64"：前缀 + from..to，gpio 以前缀开头且余部为纯数字 n 且 from<=n<=to
 *    （按数值比较，GPIO_01 与 GPIO_1 都命中 1）
 *  - glob "EMMC_*"：'*' 通配任意段（其余字符字面匹配）
 *  - 其余：大小写不敏感子串匹配
 *  空模式 → 空集合。 */
export function selectByPattern(rows: PadRow[], pattern: string): Set<string> {
  const out = new Set<string>();
  const p = pattern.trim();
  if (!p) return out;
  const range = /^(.*?)(\d+)\.\.(\d+)$/.exec(p);
  if (range) {
    const [, prefix, a, b] = range;
    const from = Number(a), to = Number(b);
    for (const r of rows) {
      if (!r.gpio.startsWith(prefix)) continue;
      const rest = r.gpio.slice(prefix.length);
      if (!/^\d+$/.test(rest)) continue;
      const n = Number(rest);
      if (n >= from && n <= to) out.add(r.path);
    }
    return out;
  }
  if (p.includes("*")) {
    const re = new RegExp("^" + p.split("*").map(escapeRe).join(".*") + "$");
    for (const r of rows) if (re.test(r.gpio)) out.add(r.path);
    return out;
  }
  const lc = p.toLowerCase();
  for (const r of rows) if (r.gpio.toLowerCase().includes(lc)) out.add(r.path);
  return out;
}
function escapeRe(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

/** 批量应用：返回新 rows + 跳过数。reuse 只落在 dir==="inout" 的行（其余跳过计数）。 */
export function applyBulk(
  rows: PadRow[], selected: ReadonlySet<string>, patch: PadPatch,
): { rows: PadRow[]; skipped: number } {
  let skipped = 0;
  const next = rows.map((r) => {
    if (!selected.has(r.path)) return r;
    const p: PadPatch = { ...patch };
    if (p.reuse !== undefined && r.dir !== "inout") {
      delete p.reuse;
      skipped++;
      if (Object.keys(p).length === 0) return r;
    }
    return { ...r, ...p };
  });
  return { rows: next, skipped };
}

/** 行级校验（P1 overlay 规则前移，spec §4.4）。合法 → null。 */
export function rowIssue(r: PadRow): string | null {
  if (r.func === "ssn" && r.dir === "inout" && r.reuse === "")
    return "func=ssn 的双向 pad 必须指派 reuse";
  return null;
}

/** 表格筛选（spec §3 筛选行）。 */
export interface PadFilter {
  dir: "" | "in" | "out" | "inout";
  state: "" | "no-reuse" | "bscan-y" | "unresolved";
  name: string; // 子串，大小写不敏感，匹配 gpio 或 path
}
export function filterRows(rows: PadRow[], f: PadFilter): PadRow[] {
  const lc = f.name.trim().toLowerCase();
  return rows.filter((r) => {
    if (f.dir && r.dir !== f.dir) return false;
    if (f.state === "no-reuse" && (r.reuse !== "" || r.dir !== "inout")) return false;
    if (f.state === "bscan-y" && !r.bscanEn) return false;
    if (f.state === "unresolved" && r.gpio !== "") return false;
    if (lc && !r.gpio.toLowerCase().includes(lc) && !r.path.toLowerCase().includes(lc)) return false;
    return true;
  });
}

/** rows → P1 overlay JSON 对象（snake_case；只含非默认值的行/键，spec §5 命名映射）。
 *  默认：bscanEn=false、reuse=""、func=""、enable===autoEnableNet。 */
export function overlayFromRows(rows: PadRow[]): { pads: Record<string, Record<string, string>> } {
  const pads: Record<string, Record<string, string>> = {};
  for (const r of rows) {
    const e: Record<string, string> = {};
    if (r.bscanEn) e.bscan_en = "yes";
    if (r.reuse) e.reuse = r.reuse;
    if (r.func) e.func = r.func;
    if (r.enable !== r.autoEnableNet) e.enable = r.enable;
    if (Object.keys(e).length) pads[r.path] = e;
  }
  return { pads };
}

/** 读入 pad_cfg.json 合并到 rows（path 对齐）。返回新 rows + 未命中的 cfg path（供提示丢弃）。 */
export function mergeCfg(
  rows: PadRow[], cfg: { pads?: Record<string, Record<string, string>> } | null,
): { rows: PadRow[]; dropped: string[] } {
  if (!cfg || !cfg.pads) return { rows, dropped: [] };
  const byPath = new Map(rows.map((r) => [r.path, r]));
  const dropped: string[] = [];
  const patched = new Map<string, PadRow>();
  for (const [path, e] of Object.entries(cfg.pads)) {
    const r = byPath.get(path);
    if (!r) { dropped.push(path); continue; }
    const next = { ...r };
    if (e.bscan_en !== undefined) next.bscanEn = e.bscan_en === "yes" || e.bscan_en === "y";
    if (e.reuse === "in" || e.reuse === "out") next.reuse = e.reuse;
    if (e.func !== undefined) next.func = e.func;
    if (e.enable !== undefined) next.enable = e.enable;
    patched.set(path, next);
  }
  return { rows: rows.map((r) => patched.get(r.path) ?? r), dropped };
}
```

- [x] **Step 2: 写失败测试 `tests/unit/pad.test.ts`**

```ts
import { test } from "node:test"; import assert from "node:assert/strict";
import {
  applyBulk, filterRows, mergeCfg, overlayFromRows, rowIssue, selectByPattern,
  type PadRow,
} from "../../src/hierarchy/core/pad.ts";

function mk(over: Partial<PadRow>): PadRow {
  return {
    path: "t.u", gpio: "G0", cell: "iopad", dir: "inout",
    padNet: "P", coreInNet: "i", coreOutNet: "o", autoEnableNet: "oe",
    bscanEn: false, reuse: "", func: "", enable: "oe", ...over,
  };
}

test("selectByPattern: 数字区间按数值比较(含前导零)", () => {
  const rows = [
    mk({ path: "a", gpio: "GPIO_01" }), mk({ path: "b", gpio: "GPIO_33" }),
    mk({ path: "c", gpio: "GPIO_64" }), mk({ path: "d", gpio: "GPIO_65" }),
    mk({ path: "e", gpio: "EMMC_DAT3" }),
  ];
  const hit = selectByPattern(rows, "GPIO_33..64");
  assert.deepEqual([...hit].sort(), ["b", "c"]);
  assert.ok(selectByPattern(rows, "GPIO_1..40").has("a")); // GPIO_01 -> n=1
});

test("selectByPattern: glob 与子串", () => {
  const rows = [mk({ path: "a", gpio: "EMMC_DAT3" }), mk({ path: "b", gpio: "GPIO_1" })];
  assert.deepEqual([...selectByPattern(rows, "EMMC_*")], ["a"]);
  assert.deepEqual([...selectByPattern(rows, "gpio")], ["b"]); // 大小写不敏感子串
  assert.equal(selectByPattern(rows, "").size, 0);
});

test("applyBulk: reuse 跳过非 inout 并计数; 其它键照常应用", () => {
  const rows = [mk({ path: "a", dir: "inout" }), mk({ path: "b", dir: "in" })];
  const { rows: next, skipped } = applyBulk(rows, new Set(["a", "b"]), { reuse: "in", bscanEn: true });
  assert.equal(skipped, 1);
  assert.equal(next[0].reuse, "in");
  assert.equal(next[1].reuse, "");        // 跳过
  assert.ok(next[0].bscanEn && next[1].bscanEn); // bscan 两行都应用
  assert.equal(rows[0].reuse, "");        // 不可变: 原数组未动
});

test("rowIssue: ssn 双向无 reuse 报错; 指派后通过; 固定向 ssn 通过", () => {
  assert.ok(rowIssue(mk({ func: "ssn", dir: "inout", reuse: "" })));
  assert.equal(rowIssue(mk({ func: "ssn", dir: "inout", reuse: "in" })), null);
  assert.equal(rowIssue(mk({ func: "ssn", dir: "in" })), null);
});

test("filterRows: dir/状态/名称组合", () => {
  const rows = [
    mk({ path: "a", dir: "inout", reuse: "", gpio: "GPIO_1" }),
    mk({ path: "b", dir: "inout", reuse: "in", bscanEn: true, gpio: "GPIO_2" }),
    mk({ path: "c", dir: "in", gpio: "CLK" }),
    mk({ path: "d", dir: "inout", gpio: "" }), // gpio 未解析
  ];
  assert.deepEqual(filterRows(rows, { dir: "in", state: "", name: "" }).map((r) => r.path), ["c"]);
  assert.deepEqual(filterRows(rows, { dir: "", state: "no-reuse", name: "" }).map((r) => r.path), ["a", "d"]);
  assert.deepEqual(filterRows(rows, { dir: "", state: "bscan-y", name: "" }).map((r) => r.path), ["b"]);
  assert.deepEqual(filterRows(rows, { dir: "", state: "unresolved", name: "" }).map((r) => r.path), ["d"]);
  assert.deepEqual(filterRows(rows, { dir: "", state: "", name: "gpio_1" }).map((r) => r.path), ["a"]);
});

test("overlayFromRows: 只输出非默认值, snake_case, enable 仅在覆盖时输出", () => {
  const rows = [
    mk({ path: "a" }),                                              // 全默认 -> 不出现
    mk({ path: "b", bscanEn: true, reuse: "in", func: "ssn" }),
    mk({ path: "c", enable: "my_en" }),                             // enable 覆盖
  ];
  const o = overlayFromRows(rows);
  assert.deepEqual(Object.keys(o.pads).sort(), ["b", "c"]);
  assert.deepEqual(o.pads.b, { bscan_en: "yes", reuse: "in", func: "ssn" });
  assert.deepEqual(o.pads.c, { enable: "my_en" });
});

test("mergeCfg: path 对齐合并, 消失的 path 进 dropped", () => {
  const rows = [mk({ path: "a" }), mk({ path: "b", dir: "inout" })];
  const { rows: next, dropped } = mergeCfg(rows, {
    pads: { b: { reuse: "out", bscan_en: "yes" }, gone: { reuse: "in" } },
  });
  assert.deepEqual(dropped, ["gone"]);
  assert.equal(next[1].reuse, "out");
  assert.ok(next[1].bscanEn);
  assert.equal(next[0].reuse, "");
  const same = mergeCfg(rows, null);
  assert.equal(same.rows, rows);
});
```

- [x] **Step 3: 跑测试确认红**：`npm run test:unit` → pad.test.ts 全部 fail（模块不存在时是编译错——先建空文件再实现也行，直接实现后跑绿亦可，但必须先看到红：先只写 Step 2 的测试文件跑一次）。
- [x] **Step 4: 实现（Step 1 代码落盘）→ 跑绿**：`npm run test:unit` 全绿 + `npx tsc --noEmit` 干净。
- [x] **Step 5: Commit**

```bash
git add src/hierarchy/core/pad.ts tests/unit/pad.test.ts
git commit -m "feat(pad-tab): pure table logic (pattern select / bulk / validate / overlay io)"
```

---

### Task 2: electron 桥 + core-bridge + 集成测试

**Files:**
- Modify: `electron/cli.cjs`、`electron/main.cjs`、`electron/preload.cjs`、`src/core-bridge/dft.d.ts`、`scripts/stage-bin.sh`
- Create: `src/core-bridge/pad.ts`、`tests/integration/pad-cli.test.ts`

- [x] **Step 1: `electron/cli.cjs`** —— 在 `ctrlgenGen` 后追加，并把两个新函数加进末行 `module.exports`：

```js
/**
 * pad table -f <filelist> --lib <celllib> --json
 * Returns the parsed table object {pads, ssn, warnings}.
 */
async function padTable(filelist, lib) {
  const raw = await run("pad", ["table", "-f", filelist, "--lib", lib, "--json"]);
  return JSON.parse(raw);
}

/**
 * pad gen -f <filelist> --lib <celllib> [--config <tmp>] --level <L> [--aux <A>]
 * cfg: overlay object (may be null). Returns raw generated text (stdout).
 */
async function padGen(filelist, lib, cfg, level, aux) {
  const args = ["gen", "-f", filelist, "--lib", lib, "--level", level];
  if (aux) args.push("--aux", aux);
  let tmp = null;
  if (cfg && cfg.pads && Object.keys(cfg.pads).length) {
    tmp = path.join(os.tmpdir(), `pad-${process.pid}-${Date.now()}.json`);
    fs.writeFileSync(tmp, JSON.stringify(cfg));
    args.push("--config", tmp);
  }
  try {
    return await run("pad", args);
  } finally {
    if (tmp) { try { fs.unlinkSync(tmp); } catch { /* ignore */ } }
  }
}
```

`module.exports` 变为：

```js
module.exports = { run, hdlDump, parseFileMarkers, genconnGenerateAll, genconnInject, ctrlgenGen, padTable, padGen };
```

- [x] **Step 2: `electron/main.cjs`** —— 顶部 require 行加 `padTable, padGen`（第 6 行的解构）；`dft:ctrlgen:gen` handle 之后追加：

```js
ipcMain.handle("dft:pad:table", async (_e, { filelist, lib }) => padTable(filelist, lib));

ipcMain.handle("dft:pad:gen", async (_e, { filelist, lib, cfg, level, aux }) =>
  padGen(filelist, lib, cfg, level, aux));

ipcMain.handle("dft:pad:pickLib", async () => {
  const r = await dialog.showOpenDialog(win, {
    properties: ["openFile"],
    filters: [{ name: "cell library", extensions: ["tcelllib", "lib"] }, { name: "all", extensions: ["*"] }],
  });
  return r.canceled ? null : r.filePaths[0];
});

// pad_cfg.json 挂在 filelist 同目录 (spec §2.2); main 侧算路径避免 renderer 拼 path。
ipcMain.handle("dft:pad:readCfg", async (_e, { filelist }) => {
  const p = path.join(path.dirname(filelist), "pad_cfg.json");
  try { return await fs.readFile(p, "utf8"); } catch { return null; }
});

ipcMain.handle("dft:pad:writeCfg", async (_e, { filelist, json }) => {
  const p = path.join(path.dirname(filelist), "pad_cfg.json");
  await fs.writeFile(p, json, "utf8");
  return p;
});

ipcMain.handle("dft:pad:exportText", async (_e, { defaultName, text }) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: defaultName });
  if (r.canceled || !r.filePath) return null;
  await fs.writeFile(r.filePath, text, "utf8");
  return r.filePath;
});
```

（注意 main.cjs 的 `fs` 是 `node:fs/promises`——上面用 await 形式与之匹配。）

- [x] **Step 3: `electron/preload.cjs`** —— `ctrlgen` 块后加：

```js
  pad: {
    table: (filelist, lib) => ipcRenderer.invoke("dft:pad:table", { filelist, lib }),
    gen: (filelist, lib, cfg, level, aux) => ipcRenderer.invoke("dft:pad:gen", { filelist, lib, cfg, level, aux }),
    pickLib: () => ipcRenderer.invoke("dft:pad:pickLib"),
    readCfg: (filelist) => ipcRenderer.invoke("dft:pad:readCfg", { filelist }),
    writeCfg: (filelist, json) => ipcRenderer.invoke("dft:pad:writeCfg", { filelist, json }),
    exportText: (defaultName, text) => ipcRenderer.invoke("dft:pad:exportText", { defaultName, text }),
  },
```

- [x] **Step 4: `src/core-bridge/dft.d.ts`** —— `ctrlgen` 块后加（PadTableResult 从 core 导入会引入循环？不会——dft.d.ts 是环境声明，改用 unknown 保持零依赖，由 pad.ts 收窄）：

```ts
  pad: {
    table(filelist: string, lib: string): Promise<unknown>;
    gen(filelist: string, lib: string, cfg: unknown, level: string, aux: string): Promise<string>;
    pickLib(): Promise<string | null>;
    readCfg(filelist: string): Promise<string | null>;
    writeCfg(filelist: string, json: string): Promise<string>;
    exportText(defaultName: string, text: string): Promise<string | null>;
  };
```

- [x] **Step 5: `src/core-bridge/pad.ts`**（仿 ctrlgen.ts）

```ts
import "./dft.d.ts";
import type { PadTableResult } from "../hierarchy/core/pad.ts";

export const dftPad = {
  table: (filelist: string, lib: string) =>
    window.dft.pad.table(filelist, lib) as Promise<PadTableResult>,
  gen: (filelist: string, lib: string, cfg: unknown, level: string, aux: string) =>
    window.dft.pad.gen(filelist, lib, cfg, level, aux),
  pickLib: () => window.dft.pad.pickLib(),
  readCfg: (filelist: string) => window.dft.pad.readCfg(filelist),
  writeCfg: (filelist: string, json: string) => window.dft.pad.writeCfg(filelist, json),
  exportText: (defaultName: string, text: string) => window.dft.pad.exportText(defaultName, text),
};
```

- [x] **Step 6: `scripts/stage-bin.sh`** —— 第 7 行 `for b in hdl genconn ctrlgen; do` → `for b in hdl genconn ctrlgen pad; do`

- [x] **Step 7: 写集成测试 `tests/integration/pad-cli.test.ts`**（直测 cli.cjs 的两个函数，用 dft-core 的 mini fixture；无二进制自动跳过）

```ts
import { test } from "node:test"; import assert from "node:assert/strict";
import { existsSync } from "node:fs"; import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const BIN = path.resolve(process.cwd(), "../dft-core/build");
const CORE = path.resolve(process.cwd(), "../dft-core");
const FILELIST = path.join(CORE, "test/rtl/pad/mini_chip.f");
const LIB = path.join(CORE, "test/fixtures/pad/mini.tcelllib");
const havePad = existsSync(path.join(BIN, "pad")) && existsSync(FILELIST);

process.env.DFT_CORE_BIN_DIR = BIN; // bin.cjs resolves from this
const { padTable, padGen } = require("../../electron/cli.cjs");

test("padTable parses the mini fixture", { skip: !havePad }, async () => {
  const r = await padTable(FILELIST, LIB);
  assert.ok(Array.isArray(r.pads) && r.pads.length >= 5);
  const g0 = r.pads.find((p: { path: string }) => p.path === "mini_chip.u_gpio0");
  assert.ok(g0 && g0.gpio === "GPIO_0" && g0.dir === "inout");
  assert.ok(Array.isArray(r.warnings) && r.warnings.length >= 1);
});

test("padGen with inline cfg produces both sections", { skip: !havePad }, async () => {
  const cfg = { pads: { "mini_chip.u_gpio0": { reuse: "in", bscan_en: "yes" } } };
  const text = await padGen(FILELIST, LIB, cfg, "chip", "");
  assert.match(text, /read_config_data -in_wrapper \$dftspec\/BoundaryScan/);
  assert.match(text, /internal_auxiliary_input_ports : GPIO_0;/);
  assert.match(text, /set_boundary_scan_port_options -pad_io_ports/);
  assert.match(text, /dont_touch/);
});

test("padGen without cfg omits section A", { skip: !havePad }, async () => {
  const text = await padGen(FILELIST, LIB, null, "chip", "");
  assert.ok(!text.includes("read_config_data"));
  assert.match(text, /set_boundary_scan_port_options -pad_io_ports/);
});
```

- [x] **Step 8: 先只落测试文件跑红**（cli.cjs 还没加函数 → require 解构得 undefined → 调用抛错）：`npm run test:unit` → pad-cli 三条 fail。然后落 Step 1-6 → 跑绿：`npm run test:unit` 全绿 + `npx tsc --noEmit` 干净。
- [x] **Step 9: Commit**

```bash
git add electron/cli.cjs electron/main.cjs electron/preload.cjs \
        src/core-bridge/dft.d.ts src/core-bridge/pad.ts \
        scripts/stage-bin.sh tests/integration/pad-cli.test.ts
git commit -m "feat(pad-tab): electron bridge (table/gen/pickLib/cfg io/export) + integration test"
```

---

### Task 3: Tab 接入 + store + 只读表格版 PadTab

**Files:**
- Modify: `src/core-bridge/model.ts`、`src/hierarchy/store.ts`、`src/hierarchy/TabArea.tsx`、`src/hierarchy/Workspace.tsx`、`src/hierarchy/styles.css`、`tests/e2e/regcount.spec.ts`
- Create: `src/hierarchy/PadTab.tsx`
- Modify: `tests/unit/hierarchy-tabs.test.ts`（追加 openPadTab 用例）

- [x] **Step 1: `src/core-bridge/model.ts`** —— RegCountTabSpec 之后加类型并入联合（:68）：

```ts
/** The single Pad/BScan config-table tab. Content derives from `pad table` + user overlay. */
export type PadTabSpec = {
  id: "pad";
  kind: "pad";
  title: string;
};
export type Tab = HdlTab | SchematicTabSpec | PortsTabSpec | DfxCtrlTabSpec | RegCountTabSpec | PadTabSpec;
```

- [x] **Step 2: `src/hierarchy/store.ts`** —— 按下列增量修改：

(a) 顶部 import 加：

```ts
import { mergeCfg, type PadFilter, type PadRow, type PadTableResult } from "./core/pad.ts";
import { dftPad } from "../core-bridge/pad.ts";
```

(b) `AppState` 接口内（regCountsError 行后）加状态与动作声明：

```ts
  padLib: string | null;          // celllib path (persisted to localStorage)
  padRows: PadRow[];              // editable working copy (manual columns live here)
  padSsn: { inWidth: number; outWidth: number } | null;
  padWarnings: string[];
  padDropped: string[];           // cfg paths that no longer match any pad (spec §4.7)
  padLoading: boolean;
  padError: string | null;
```

（动作声明，openRegCountTab 后）：

```ts
  /** Open (or activate) the singleton Pad/BScan tab; lazy-load the table on first open. */
  openPadTab: () => Promise<void>;
  setPadLib: (p: string) => Promise<void>;
  /** spawn `pad table --json` + merge pad_cfg.json into working rows. */
  refreshPadTable: () => Promise<void>;
  /** Patch manual columns on the given paths (single-cell edit passes one path). */
  patchPadRows: (paths: ReadonlySet<string> | string[], patch: Partial<Pick<PadRow, "bscanEn" | "reuse" | "func" | "enable">>) => void;
```

(c) 常量区（SCHEMATIC_TAB_ID 后）：

```ts
/** Stable singleton id for the Pad/BScan config tab. */
const PAD_TAB_ID = "pad";
const PAD_LIB_LS_KEY = "dft-suite.padLib";
```

(d) `blankState` 内（regCountsError 行后）：

```ts
    padLib: (typeof localStorage !== "undefined" && localStorage.getItem(PAD_LIB_LS_KEY)) || null,
    padRows: [] as PadRow[],
    padSsn: null as { inWidth: number; outWidth: number } | null,
    padWarnings: [] as string[],
    padDropped: [] as string[],
    padLoading: false,
    padError: null as string | null,
```

(e) 实现（openRegCountTab 之后）：

```ts
    // Singleton Pad/BScan tab (regcount pattern): activate if present, else add;
    // table is fetched lazily on first open when a lib is already known.
    openPadTab: async () => {
      set((s) => (s.tabs.some((t) => t.id === PAD_TAB_ID)
        ? { activeTabId: PAD_TAB_ID }
        : addTab({ tabs: s.tabs, activeTabId: s.activeTabId }, { id: PAD_TAB_ID, kind: "pad", title: "Pad/BScan" })));
      if (get().padRows.length || get().padLoading) return; // cached / in flight
      if (get().padLib) await get().refreshPadTable();
    },

    setPadLib: async (p) => {
      if (typeof localStorage !== "undefined") localStorage.setItem(PAD_LIB_LS_KEY, p);
      set({ padLib: p });
      await get().refreshPadTable();
    },

    refreshPadTable: async () => {
      const lib = get().padLib;
      const filelist = useDesign.getState().filelist;
      if (!lib || !filelist) return;
      set({ padLoading: true, padError: null });
      try {
        const r: PadTableResult = await dftPad.table(filelist, lib);
        const cfgText = await dftPad.readCfg(filelist);
        const cfg = cfgText ? (JSON.parse(cfgText) as { pads?: Record<string, Record<string, string>> }) : null;
        const { rows, dropped } = mergeCfg(r.pads, cfg);
        set({ padRows: rows, padSsn: r.ssn, padWarnings: r.warnings, padDropped: dropped, padLoading: false });
      } catch (e) {
        set({ padLoading: false, padError: e instanceof Error ? e.message : String(e) });
      }
    },

    patchPadRows: (paths, patch) => {
      const sel = paths instanceof Set ? paths : new Set(paths as string[]);
      set((s) => ({
        padRows: s.padRows.map((r) => (sel.has(r.path) ? { ...r, ...patch } : r)),
      }));
    },
```

（PadFilter import 本任务暂未用——Task 4 用；若 tsc 报 unused，import 里先只引 mergeCfg/PadRow/PadTableResult，Task 4 再补。）

- [x] **Step 3: `src/hierarchy/PadTab.tsx`**（本任务=只读版：lib 选择 / 加载态 / warnings / 只读表格；编辑交互 Task 4 加）

```tsx
// Pad/BScan config table (spec: docs/specs/2026-07-10-pad-bscan-tab-design.md).
// Task 3 scope: lib picker + read-only table + warnings. Editing lands in Task 4.

import { useStore } from "./store.ts";
import { dftPad } from "../core-bridge/pad.ts";
import { useDesign } from "../store/design.ts";

export function PadTab() {
  const filelist = useDesign((s) => s.filelist);
  const lib = useStore((s) => s.padLib);
  const rows = useStore((s) => s.padRows);
  const warnings = useStore((s) => s.padWarnings);
  const loading = useStore((s) => s.padLoading);
  const error = useStore((s) => s.padError);

  const pickLib = async () => {
    const p = await dftPad.pickLib();
    if (p) await useStore.getState().setPadLib(p);
  };

  if (!filelist) return <div className="padtab muted">请先打开设计</div>;

  return (
    <div className="padtab" data-tab-kind="pad">
      <div className="pad-toolbar">
        <span className="pad-lib" title={lib ?? undefined}>
          lib: {lib ? lib.split("/").pop() : "（未选择）"}
        </span>
        <button className="pad-btn" onClick={() => void pickLib()}>选择 lib…</button>
        <button className="pad-btn" disabled={!lib || loading}
                onClick={() => void useStore.getState().refreshPadTable()}>
          ↻ 重新分析
        </button>
        {warnings.length > 0 && (
          <span className="pad-warn" title={warnings.join("\n")}>⚠ {warnings.length} warnings</span>
        )}
        <span className="pad-count">{rows.length} pads</span>
      </div>
      {error && <div className="pad-error">分析失败：{error}</div>}
      {loading && <div className="padtab muted">分析中…</div>}
      {!loading && rows.length > 0 && (
        <div className="pad-table-wrap">
          <table className="pad-table">
            <thead>
              <tr>
                <th>gpio</th><th>pad</th><th>dir</th><th>bscan</th>
                <th>reuse</th><th>func</th><th>enable</th><th>path</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.path} className={r.gpio === "" ? "pad-unresolved" : ""}>
                  <td>{r.gpio || "—"}</td>
                  <td>{r.cell}</td>
                  <td>{r.dir}</td>
                  <td>{r.bscanEn ? "y" : "n"}</td>
                  <td>{r.reuse || "-"}</td>
                  <td>{r.func || "-"}</td>
                  <td>{r.enable || "-"}</td>
                  <td className="pad-path" title={r.path}>{r.path}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [x] **Step 4: `src/hierarchy/TabArea.tsx`** —— import 区加 `import { PadTab } from "./PadTab.tsx";`；分发区（:37 后）加：

```tsx
        {active?.kind === "pad" && <PadTab />}
```

（标题三元 :25 无需改——`t.title` 是默认落点。）

- [x] **Step 5: `src/hierarchy/Workspace.tsx`** —— dock-head 里 regcount 按钮之后加按钮，并给两个按钮加 data-btn（为 e2e 精确选择）：

```tsx
          <button className="dock-btn" data-btn="regcount" onClick={() => void useStore.getState().openRegCountTab()}>
            寄存器统计
          </button>
          <button className="dock-btn" data-btn="pad" onClick={() => void useStore.getState().openPadTab()}>
            Pad/BScan
          </button>
```

同步修 `tests/e2e/regcount.spec.ts:20`：`await page.click(".dock-btn");` → `await page.click('[data-btn="regcount"]');`（否则两个 .dock-btn 触发 Playwright strict-mode 冲突）。

- [x] **Step 6: `src/hierarchy/styles.css`** —— 末尾（cmsep 之后）加：

```css
/* Pad/BScan config tab (center) */
#ws-hierarchy .padtab { display: flex; flex-direction: column; height: 100%; min-height: 0; }
#ws-hierarchy .padtab.muted { padding: 12px; color: var(--text-dim); }
#ws-hierarchy .pad-toolbar { display: flex; align-items: center; gap: 10px; padding: 6px 10px; border-bottom: 1px solid var(--border); }
#ws-hierarchy .pad-lib { color: var(--text-dim); max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#ws-hierarchy .pad-btn { padding: 2px 8px; cursor: pointer; }
#ws-hierarchy .pad-warn { color: var(--accent); cursor: default; }
#ws-hierarchy .pad-count { margin-left: auto; color: var(--text-faint); font-variant-numeric: tabular-nums; }
#ws-hierarchy .pad-error { padding: 8px 10px; color: #e5534b; }
#ws-hierarchy .pad-table-wrap { flex: 1 1 auto; min-height: 0; overflow: auto; }
#ws-hierarchy .pad-table { width: 100%; border-collapse: collapse; font-size: 13px; }
#ws-hierarchy .pad-table th { position: sticky; top: 0; background: var(--panel-3); text-align: left; padding: 4px 10px; user-select: none; border-bottom: 1px solid var(--border); }
#ws-hierarchy .pad-table td { padding: 3px 10px; white-space: nowrap; }
#ws-hierarchy .pad-table tbody tr:hover { background: var(--row-hover); }
#ws-hierarchy .pad-table tr.pad-unresolved { color: var(--text-faint); }
#ws-hierarchy .pad-path { color: var(--text-dim); font-size: 11px; max-width: 220px; overflow: hidden; text-overflow: ellipsis; }
```

- [x] **Step 7: store 单测** —— `tests/unit/hierarchy-tabs.test.ts` 末尾追加：

```ts
test("openPadTab opens & dedupes the singleton pad tab (no lib -> no fetch)", async () => {
  useStore.getState().reset();
  useStore.setState({ padLib: null }); // ensure no fetch path
  await useStore.getState().openPadTab();
  await useStore.getState().openPadTab();
  const s = useStore.getState();
  const pads = s.tabs.filter((t) => t.kind === "pad");
  assert.equal(pads.length, 1, "single pad tab");
  assert.equal(s.activeTabId, "pad");
});
```

- [x] **Step 8: 跑红→绿**：先落测试（Step 7）跑红（openPadTab 不存在为编译错，可接受为红态证据）；再落 Step 1-6，`npx tsc --noEmit` 干净 + `npm run test:unit` 全绿。
- [x] **Step 9: 手动冒烟**（可选但推荐）：`ELECTRON_DEV=1` dev 起应用 → 打开 dft-core 的 `test/rtl/pad/mini_chip.f` → 点 Pad/BScan → 选 `mini.tcelllib` → 表格出现 7 行 + ⚠ 3 warnings。（由 Task 4/6/7 的 Playwright 冒烟与 Task 7 Step 3 真实设计冒烟覆盖）
- [x] **Step 10: Commit**

```bash
git add src/core-bridge/model.ts src/hierarchy/store.ts src/hierarchy/PadTab.tsx \
        src/hierarchy/TabArea.tsx src/hierarchy/Workspace.tsx src/hierarchy/styles.css \
        tests/unit/hierarchy-tabs.test.ts tests/e2e/regcount.spec.ts
git commit -m "feat(pad-tab): singleton Pad/BScan tab + read-only table (lib picker, warnings)"
```

---

### Task 4: 编辑交互（单元格 + 选择 + 批量条 + 区间 + 筛选 + 校验）

**Files:**
- Modify: `src/hierarchy/PadTab.tsx`（整体替换为完整版）、`src/hierarchy/styles.css`（追加）

- [x] **Step 1: 替换 `src/hierarchy/PadTab.tsx` 为完整版**

```tsx
// Pad/BScan config table (spec: docs/specs/2026-07-10-pad-bscan-tab-design.md).
// Editable manual columns + filter/pattern selection + bulk bar + inline validation.

import { useMemo, useRef, useState } from "react";
import { useStore } from "./store.ts";
import { dftPad } from "../core-bridge/pad.ts";
import { useDesign } from "../store/design.ts";
import {
  filterRows, rowIssue, selectByPattern, type PadFilter, type PadRow,
} from "./core/pad.ts";

const REUSE_CYCLE: Record<string, "" | "in" | "out"> = { "": "in", in: "out", out: "" };

export function PadTab() {
  const filelist = useDesign((s) => s.filelist);
  const lib = useStore((s) => s.padLib);
  const rows = useStore((s) => s.padRows);
  const warnings = useStore((s) => s.padWarnings);
  const dropped = useStore((s) => s.padDropped);
  const loading = useStore((s) => s.padLoading);
  const error = useStore((s) => s.padError);
  const patchPadRows = useStore((s) => s.patchPadRows);

  const [filter, setFilter] = useState<PadFilter>({ dir: "", state: "", name: "" });
  const [pattern, setPattern] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [bulkEnable, setBulkEnable] = useState("");
  const [toast, setToast] = useState("");
  const lastClickIdx = useRef(-1);

  const visible = useMemo(() => filterRows(rows, filter), [rows, filter]);
  const visiblePaths = useMemo(() => new Set(visible.map((r) => r.path)), [visible]);
  const selVisible = useMemo(
    () => new Set([...selected].filter((p) => visiblePaths.has(p))),
    [selected, visiblePaths],
  );
  const issues = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) {
      const i = rowIssue(r);
      if (i) m.set(r.path, i);
    }
    return m;
  }, [rows]);

  const say = (msg: string) => { setToast(msg); window.setTimeout(() => setToast(""), 2500); };

  const toggleRow = (idx: number, shift: boolean) => {
    const next = new Set(selected);
    if (shift && lastClickIdx.current >= 0) {
      const [a, b] = [Math.min(lastClickIdx.current, idx), Math.max(lastClickIdx.current, idx)];
      for (let i = a; i <= b; i++) next.add(visible[i].path);
    } else {
      const p = visible[idx].path;
      if (next.has(p)) next.delete(p); else next.add(p);
      lastClickIdx.current = idx;
    }
    setSelected(next);
  };
  const toggleAllVisible = () => {
    const all = visible.every((r) => selected.has(r.path));
    const next = new Set(selected);
    for (const r of visible) { if (all) next.delete(r.path); else next.add(r.path); }
    setSelected(next);
  };
  const selectPattern = () => {
    const hit = selectByPattern(rows, pattern);
    if (!hit.size) { say(`无匹配: ${pattern}`); return; }
    setSelected(new Set([...selected, ...hit]));
    say(`命中 ${hit.size} 行`);
  };

  // 批量应用: reuse 跳过非 inout 行 (core/pad.ts applyBulk 语义, 通过 store patch 实现)
  const bulkReuse = (v: "" | "in" | "out") => {
    const ok = new Set<string>(), skip: string[] = [];
    for (const r of rows) {
      if (!selVisible.has(r.path)) continue;
      if (r.dir === "inout") ok.add(r.path); else skip.push(r.path);
    }
    if (ok.size) patchPadRows(ok, { reuse: v });
    if (skip.length) say(`跳过 ${skip.length} 行（固定方向）`);
  };
  const bulkBscan = (v: boolean) => patchPadRows(selVisible, { bscanEn: v });
  const bulkFunc = (v: string) => patchPadRows(selVisible, { func: v });
  const applyBulkEnable = () => {
    if (bulkEnable.trim()) patchPadRows(selVisible, { enable: bulkEnable.trim() });
  };

  const pickLib = async () => {
    const p = await dftPad.pickLib();
    if (p) await useStore.getState().setPadLib(p);
  };

  if (!filelist) return <div className="padtab muted">请先打开设计</div>;

  return (
    <div className="padtab" data-tab-kind="pad">
      <div className="pad-toolbar">
        <span className="pad-lib" title={lib ?? undefined}>
          lib: {lib ? lib.split("/").pop() : "（未选择）"}
        </span>
        <button className="pad-btn" onClick={() => void pickLib()}>选择 lib…</button>
        <button className="pad-btn" disabled={!lib || loading}
                onClick={() => void useStore.getState().refreshPadTable()}>
          ↻ 重新分析
        </button>
        {warnings.length > 0 && (
          <span className="pad-warn" title={warnings.join("\n")}>⚠ {warnings.length} warnings</span>
        )}
        {dropped.length > 0 && (
          <span className="pad-warn" title={dropped.join("\n")}>cfg 丢弃 {dropped.length} 项</span>
        )}
        {toast && <span className="pad-toast">{toast}</span>}
        <span className="pad-count">{selVisible.size ? `已选 ${selVisible.size} / ` : ""}{visible.length} / {rows.length} pads</span>
      </div>

      <div className="pad-filters">
        <select value={filter.dir} onChange={(e) => setFilter({ ...filter, dir: e.target.value as PadFilter["dir"] })}>
          <option value="">dir: 全部</option><option value="in">in</option>
          <option value="out">out</option><option value="inout">inout</option>
        </select>
        <select value={filter.state} onChange={(e) => setFilter({ ...filter, state: e.target.value as PadFilter["state"] })}>
          <option value="">状态: 全部</option>
          <option value="no-reuse">未设置 reuse</option>
          <option value="bscan-y">bscan = y</option>
          <option value="unresolved">gpio 未解析</option>
        </select>
        <input className="pad-name-filter" placeholder="名称过滤…" value={filter.name}
               onChange={(e) => setFilter({ ...filter, name: e.target.value })} />
        <input className="pad-pattern" placeholder="区间/模式: GPIO_33..64 或 EMMC_*" value={pattern}
               onChange={(e) => setPattern(e.target.value)}
               onKeyDown={(e) => { if (e.key === "Enter") selectPattern(); }} />
        <button className="pad-btn" onClick={selectPattern}>选中</button>
        {selected.size > 0 && <button className="pad-btn" onClick={() => setSelected(new Set())}>清除选择</button>}
      </div>

      {selVisible.size >= 2 && (
        <div className="pad-bulk">
          <span>批量（{selVisible.size} 行）:</span>
          <span>reuse</span>
          <button className="pad-btn" onClick={() => bulkReuse("in")}>in</button>
          <button className="pad-btn" onClick={() => bulkReuse("out")}>out</button>
          <button className="pad-btn" onClick={() => bulkReuse("")}>清</button>
          <span>bscan</span>
          <button className="pad-btn" onClick={() => bulkBscan(true)}>y</button>
          <button className="pad-btn" onClick={() => bulkBscan(false)}>n</button>
          <span>func</span>
          <button className="pad-btn" onClick={() => bulkFunc("ssn")}>ssn</button>
          <button className="pad-btn" onClick={() => bulkFunc("")}>清</button>
          <input className="pad-bulk-enable" placeholder="enable 信号名" value={bulkEnable}
                 onChange={(e) => setBulkEnable(e.target.value)}
                 onKeyDown={(e) => { if (e.key === "Enter") applyBulkEnable(); }} />
          <button className="pad-btn" onClick={applyBulkEnable}>应用</button>
        </div>
      )}

      {error && <div className="pad-error">分析失败：{error}</div>}
      {loading && <div className="padtab muted">分析中…</div>}
      {!loading && rows.length > 0 && (
        <div className="pad-table-wrap">
          <table className="pad-table">
            <thead>
              <tr>
                <th className="pad-check">
                  <input type="checkbox"
                         checked={visible.length > 0 && visible.every((r) => selected.has(r.path))}
                         onChange={toggleAllVisible} />
                </th>
                <th>gpio</th><th>pad</th><th>dir</th><th>bscan</th>
                <th>reuse</th><th>func</th><th>enable</th><th>path</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r, idx) => (
                <PadRowView key={r.path} r={r} idx={idx}
                            checked={selected.has(r.path)}
                            issue={issues.get(r.path) ?? null}
                            onToggle={toggleRow}
                            onPatch={(patch) => patchPadRows([r.path], patch)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PadRowView({ r, idx, checked, issue, onToggle, onPatch }: {
  r: PadRow; idx: number; checked: boolean; issue: string | null;
  onToggle: (idx: number, shift: boolean) => void;
  onPatch: (patch: Partial<Pick<PadRow, "bscanEn" | "reuse" | "func" | "enable">>) => void;
}) {
  const [editEnable, setEditEnable] = useState(false);
  const cls = [
    r.gpio === "" ? "pad-unresolved" : "",
    issue ? "pad-issue" : "",
    checked ? "pad-selected" : "",
  ].filter(Boolean).join(" ");
  return (
    <tr className={cls} title={issue ?? undefined}>
      <td className="pad-check">
        <input type="checkbox" checked={checked}
               onClick={(e) => onToggle(idx, (e.nativeEvent as MouseEvent).shiftKey)}
               onChange={() => { /* handled in onClick for shiftKey access */ }} />
      </td>
      <td>{r.gpio || "—"}</td>
      <td>{r.cell}</td>
      <td>{r.dir}</td>
      <td className="pad-edit" onClick={() => onPatch({ bscanEn: !r.bscanEn })}>
        {r.bscanEn ? "y" : "n"}
      </td>
      <td className={r.dir === "inout" ? "pad-edit" : "pad-fixed"}
          onClick={() => { if (r.dir === "inout") onPatch({ reuse: REUSE_CYCLE[r.reuse] }); }}>
        {r.reuse || "-"}
      </td>
      <td className="pad-edit-cell">
        <select value={r.func === "" || r.func === "ssn" ? r.func : "__custom"}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "__custom") {
                    const t = window.prompt("自定义 func:", r.func);
                    if (t !== null) onPatch({ func: t.trim() });
                  } else onPatch({ func: v });
                }}>
          <option value="">-</option>
          <option value="ssn">ssn</option>
          <option value="__custom">{r.func && r.func !== "ssn" ? r.func : "自定义…"}</option>
        </select>
      </td>
      <td className={"pad-edit" + (r.enable !== r.autoEnableNet ? " pad-overridden" : "")}>
        {editEnable ? (
          <input autoFocus defaultValue={r.enable}
                 onBlur={(e) => { setEditEnable(false); if (e.target.value !== r.enable) onPatch({ enable: e.target.value.trim() }); }}
                 onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
        ) : (
          <span onClick={() => setEditEnable(true)}
                title={r.enable !== r.autoEnableNet ? `已覆盖（默认 ${r.autoEnableNet || "无"}）,双击还原` : undefined}
                onDoubleClick={() => onPatch({ enable: r.autoEnableNet })}>
            {r.enable || "-"}
          </span>
        )}
      </td>
      <td className="pad-path" title={r.path}>{r.path}</td>
    </tr>
  );
}
```

- [x] **Step 2: `styles.css` 追加**（pad 块末尾）：

```css
#ws-hierarchy .pad-filters { display: flex; align-items: center; gap: 8px; padding: 4px 10px; border-bottom: 1px solid var(--border-soft); }
#ws-hierarchy .pad-name-filter { width: 140px; padding: 2px 6px; }
#ws-hierarchy .pad-pattern { width: 220px; padding: 2px 6px; font-family: var(--mono); }
#ws-hierarchy .pad-bulk { display: flex; align-items: center; gap: 6px; padding: 4px 10px; background: var(--panel-3); border-bottom: 1px solid var(--border); }
#ws-hierarchy .pad-bulk-enable { width: 160px; padding: 2px 6px; font-family: var(--mono); }
#ws-hierarchy .pad-toast { color: var(--accent); }
#ws-hierarchy .pad-check { width: 26px; text-align: center; }
#ws-hierarchy .pad-edit { cursor: pointer; }
#ws-hierarchy .pad-edit:hover { outline: 1px solid var(--border); }
#ws-hierarchy .pad-fixed { color: var(--text-faint); }
#ws-hierarchy .pad-overridden { color: var(--accent); }
#ws-hierarchy tr.pad-selected { background: var(--sel-bg); }
#ws-hierarchy tr.pad-issue td { background: rgba(229, 83, 75, 0.12); }
#ws-hierarchy .pad-edit-cell select { background: var(--input-bg); color: var(--text); border: 1px solid var(--border-soft); }
```

- [x] **Step 3: 验证**：`npx tsc --noEmit` 干净；`npm run test:unit` 全绿；dev 冒烟：mini fixture 上（a）点 bscan 切换（b）shift 范围选 + 批量条出现（c）`GPIO_33..64` 无命中提示 / `P0` 子串命中（mini fixture gpio 是 GPIO_0/1/2——用 `GPIO_0..1` 验证区间）（d）inout 行 func=ssn 且无 reuse → 行变红。
- [x] **Step 4: Commit**

```bash
git add src/hierarchy/PadTab.tsx src/hierarchy/styles.css
git commit -m "feat(pad-tab): editable cells, selection, bulk bar, pattern select, validation"
```

---

### Task 5: pad_cfg.json 自动持久化

**Files:**
- Modify: `src/hierarchy/store.ts`（patchPadRows 触发防抖保存 + 保存状态）、`src/hierarchy/PadTab.tsx`（保存状态显示）

- [x] **Step 1: store 增量**。AppState 加 `padSaveState: "idle" | "saving" | "saved";`（blankState：`padSaveState: "idle" as const`——注意 blankState 里写 `"idle" as "idle" | "saving" | "saved"`）。import 加 `overlayFromRows`（来自 core/pad.ts）。store 工厂函数体内（`ensureDef` 旁）加 module 级防抖：

```ts
  let padSaveTimer: ReturnType<typeof setTimeout> | null = null;
  const schedulePadSave = (): void => {
    if (padSaveTimer) clearTimeout(padSaveTimer);
    set({ padSaveState: "saving" });
    padSaveTimer = setTimeout(() => {
      padSaveTimer = null;
      const filelist = useDesign.getState().filelist;
      if (!filelist) return;
      const overlay = overlayFromRows(get().padRows);
      dftPad.writeCfg(filelist, JSON.stringify(overlay, null, 2) + "\n")
        .then(() => set({ padSaveState: "saved" }))
        .catch((e) => set({ padError: e instanceof Error ? e.message : String(e), padSaveState: "idle" }));
    }, 300);
  };
```

`patchPadRows` 实现末尾加一行 `schedulePadSave();`。

- [x] **Step 2: PadTab 工具栏显示保存状态**（pad-count 前加）：

```tsx
        <span className="pad-save">{useStore((s) => s.padSaveState) === "saving" ? "保存中…" : useStore((s) => s.padSaveState) === "saved" ? "已保存" : ""}</span>
```

（实现时把两个 useStore 调用提升到组件顶部：`const saveState = useStore((s) => s.padSaveState);` 再引用——hooks 不能出现在 JSX 三元里，此处按提升后的写法落地：）

```tsx
  const saveState = useStore((s) => s.padSaveState);
  // ... 工具栏内:
        <span className="pad-save">{saveState === "saving" ? "保存中…" : saveState === "saved" ? "已保存" : ""}</span>
```

styles.css 加：`#ws-hierarchy .pad-save { color: var(--text-faint); font-size: 11px; }`

- [x] **Step 3: 单测**（`tests/unit/hierarchy-tabs.test.ts` 追加；防抖有 timer——用假 window.dft 捕获写入）：

```ts
test("patchPadRows debounce-saves overlay via writeCfg (300ms)", async () => {
  useStore.getState().reset();
  const { useDesign } = await import("../../src/store/design.ts");
  useDesign.setState({ filelist: "/tmp/x.f" });
  let written: string | null = null;
  (globalThis as any).window = (globalThis as any).window ?? {};
  (window as any).dft = { pad: { writeCfg: async (_f: string, json: string) => { written = json; return "/tmp/pad_cfg.json"; } } };
  useStore.setState({
    padRows: [{
      path: "t.a", gpio: "G0", cell: "iopad", dir: "inout", padNet: "", coreInNet: "",
      coreOutNet: "", autoEnableNet: "oe", bscanEn: false, reuse: "", func: "", enable: "oe",
    }],
  });
  useStore.getState().patchPadRows(["t.a"], { reuse: "in" });
  await new Promise((r) => setTimeout(r, 400));
  assert.ok(written, "writeCfg called after debounce");
  assert.match(written!, /"reuse": "in"/);
  assert.equal(useStore.getState().padSaveState, "saved");
});
```

（若 node 环境无 `window`，测试里已自建。若 store 里 `dftPad.writeCfg` 经 import 静态绑定绕过了 window mock——`dftPad` 内部就是 `window.dft.pad.writeCfg(...)` 的转发，mock window 即生效。）

- [x] **Step 4: 红→绿**：先落测试跑红 → 实现 → `npm run test:unit` 全绿 + `npx tsc --noEmit` 干净。
- [x] **Step 5: Commit**

```bash
git add src/hierarchy/store.ts src/hierarchy/PadTab.tsx src/hierarchy/styles.css tests/unit/hierarchy-tabs.test.ts
git commit -m "feat(pad-tab): debounced pad_cfg.json autosave with save-state indicator"
```

---

### Task 6: 预览面板（拖拽分隔条 + 生成 + 复制/导出 + 折叠）

**Files:**
- Modify: `src/hierarchy/PadTab.tsx`（追加面板区）、`src/hierarchy/styles.css`

- [x] **Step 1: PadTab.tsx 增量**。组件顶部加状态：

```tsx
  const [level, setLevel] = useState<"chip" | "phy" | "sub">(
    (localStorage.getItem("dft-suite.padLevel") as "chip" | "phy" | "sub") || "chip");
  const [aux, setAux] = useState<"external" | "internal">(
    (localStorage.getItem("dft-suite.padAux") as "external" | "internal") || "external");
  const [genText, setGenText] = useState("");
  const [genError, setGenError] = useState("");
  const [panelH, setPanelH] = useState(() => Number(localStorage.getItem("dft-suite.padPanelH")) || 220);
  const [collapsed, setCollapsed] = useState(true);
  const dragRef = useRef<{ y: number; h: number } | null>(null);
  const ssn = useStore((s) => s.padSsn);
```

生成函数（组件内）：

```tsx
  const hasIssues = issues.size > 0;
  const doGenerate = async () => {
    const filelist = useDesign.getState().filelist;
    const l = useStore.getState().padLib;
    if (!filelist || !l) return;
    setGenError("");
    try {
      const overlay = overlayFromRows(useStore.getState().padRows);
      const text = await dftPad.gen(filelist, l, overlay, level, level === "chip" ? "" : aux);
      setGenText(text);
      setCollapsed(false);
    } catch (e) {
      setGenError(e instanceof Error ? e.message : String(e));
      setCollapsed(false);
    }
  };
  const setLevelPersist = (v: "chip" | "phy" | "sub") => { setLevel(v); localStorage.setItem("dft-suite.padLevel", v); };
  const setAuxPersist = (v: "external" | "internal") => { setAux(v); localStorage.setItem("dft-suite.padAux", v); };
  const onDragStart = (e: React.MouseEvent) => {
    dragRef.current = { y: e.clientY, h: panelH };
    const move = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const h = Math.min(window.innerHeight * 0.8, Math.max(80, dragRef.current.h + (dragRef.current.y - ev.clientY)));
      setPanelH(h);
    };
    const up = () => {
      dragRef.current = null;
      localStorage.setItem("dft-suite.padPanelH", String(panelH));
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };
```

（import 增加 `overlayFromRows`；`issues` 已在 Task 4 存在。）

JSX：表格 wrap 之后（组件根 div 收尾前）加面板：

```tsx
      {!collapsed && <div className="pad-splitter" onMouseDown={onDragStart} />}
      <div className="pad-panel" style={collapsed ? undefined : { height: panelH }}>
        <div className="pad-panel-bar">
          <select value={level} onChange={(e) => setLevelPersist(e.target.value as "chip" | "phy" | "sub")}>
            <option value="chip">chip</option><option value="phy">phy</option><option value="sub">sub</option>
          </select>
          {level !== "chip" && (
            <select value={aux} onChange={(e) => setAuxPersist(e.target.value as "external" | "internal")}>
              <option value="external">external</option><option value="internal">internal</option>
            </select>
          )}
          {ssn && (ssn.inWidth > 0 || ssn.outWidth > 0) && (
            <span className="pad-ssn">
              ssn: {ssn.inWidth > 0 ? `in[${ssn.inWidth - 1}:0] ` : ""}{ssn.outWidth > 0 ? `out[${ssn.outWidth - 1}:0]` : ""}
            </span>
          )}
          <button className="pad-btn" disabled={hasIssues || loading || !rows.length}
                  title={hasIssues ? "存在校验错误的行，先修复" : undefined}
                  onClick={() => void doGenerate()}>
            生成
          </button>
          {genText && <>
            <button className="pad-btn" onClick={() => void navigator.clipboard.writeText(genText)}>复制</button>
            <button className="pad-btn" onClick={() => void dftPad.exportText("pad_bscan.tcl", genText)}>导出…</button>
          </>}
          <button className="pad-btn pad-collapse" onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? "▲ 展开" : "▼ 折叠"}
          </button>
        </div>
        {!collapsed && (
          genError
            ? <div className="pad-error">生成失败：{genError}</div>
            : <pre className="pad-gen">{genText || "（点「生成」）"}</pre>
        )}
      </div>
```

注意：`ssn` 汇总来自分析时的快照——编辑 func 后位宽会变。P1 的 ssnSummary 在 C++ 侧；UI 侧等价计算很简单，为保持实时性，把 `pad-ssn` 改为前端实时计算（core/pad.ts 已有行数据）——在 core/pad.ts 追加：

```ts
/** 实时 ssn 位宽（有效方向 = inout 取 reuse, 否则 dir; 与 C++ ssnSummary 同语义）。 */
export function ssnWidths(rows: PadRow[]): SsnSummary {
  let inWidth = 0, outWidth = 0;
  for (const r of rows) {
    if (r.func !== "ssn") continue;
    const eff = r.dir === "inout" ? r.reuse : r.dir;
    if (eff === "in") inWidth++; else if (eff === "out") outWidth++;
  }
  return { inWidth, outWidth };
}
```

组件里 `const ssn = useMemo(() => ssnWidths(rows), [rows]);`（替换上面的 store 版本；`padSsn` 保留在 store 但 UI 用实时值）。同时在 `tests/unit/pad.test.ts` 追加：

```ts
test("ssnWidths: 有效方向计数", () => {
  const rows = [
    mk({ func: "ssn", dir: "inout", reuse: "in" }),
    mk({ path: "x", func: "ssn", dir: "in" }),
    mk({ path: "y", func: "ssn", dir: "inout", reuse: "out" }),
    mk({ path: "z", func: "" }),
  ];
  const s = ssnWidths(rows);
  assert.equal(s.inWidth, 2);
  assert.equal(s.outWidth, 1);
});
```

- [x] **Step 2: styles.css 追加**：

```css
#ws-hierarchy .pad-splitter { height: 5px; cursor: row-resize; background: var(--border-soft); flex: 0 0 auto; }
#ws-hierarchy .pad-splitter:hover { background: var(--accent); }
#ws-hierarchy .pad-panel { flex: 0 0 auto; display: flex; flex-direction: column; min-height: 0; border-top: 1px solid var(--border); }
#ws-hierarchy .pad-panel-bar { display: flex; align-items: center; gap: 8px; padding: 4px 10px; background: var(--panel-3); }
#ws-hierarchy .pad-ssn { color: var(--text-dim); font-family: var(--mono); font-size: 12px; }
#ws-hierarchy .pad-collapse { margin-left: auto; }
#ws-hierarchy .pad-gen { flex: 1 1 auto; min-height: 0; overflow: auto; margin: 0; padding: 8px 10px; font-family: var(--mono); font-size: 12px; white-space: pre; }
```

- [x] **Step 3: 红→绿**：先落 ssnWidths 测试跑红 → 实现全部 → `npm run test:unit` 全绿 + `npx tsc --noEmit` 干净 + `npm run build` 成功。dev 冒烟：mini fixture 设 reuse → 生成 → 面板展开显示两段 → 拖分隔条 → 折叠/展开 → 复制。
- [x] **Step 4: Commit**

```bash
git add src/hierarchy/PadTab.tsx src/hierarchy/core/pad.ts src/hierarchy/styles.css tests/unit/pad.test.ts
git commit -m "feat(pad-tab): resizable/collapsible preview panel with generate/copy/export"
```

---

### Task 7: e2e + 收尾

**Files:**
- Create: `tests/e2e/pad.spec.ts`
- Modify: `docs/specs/2026-07-10-pad-bscan-tab-design.md`（如实现有偏差则同步 spec；无偏差不动）

- [x] **Step 1: 写 `tests/e2e/pad.spec.ts`**

```ts
import { test, expect } from "@playwright/test";
import { launchApp } from "../helpers/electron.ts";
import { existsSync } from "node:fs"; import path from "node:path";

const BIN = path.resolve(process.cwd(), "../dft-core/build");
const CORE = path.resolve(process.cwd(), "../dft-core");
const FILELIST = path.join(CORE, "test/rtl/pad/mini_chip.f");
const LIB = path.join(CORE, "test/fixtures/pad/mini.tcelllib");

test("pad tab: table loads, cell edit, generate preview", async () => {
  test.skip(!existsSync(path.join(BIN, "pad")) || !existsSync(FILELIST), "no pad binary/fixture");
  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: BIN });

  await page.evaluate(
    (fl) => (window as any).__dftStore.getState().openDesign({ filelist: fl }),
    FILELIST,
  );
  await page.locator('#hier-tree [data-node]').first().waitFor({ timeout: 10000 });

  // Seed lib path directly (file dialog can't be driven headlessly), then open the tab.
  await page.evaluate((lib) => {
    localStorage.setItem("dft-suite.padLib", lib);
    (window as any).__hierStore.setState({ padLib: lib });
  }, LIB);
  await page.click('[data-btn="pad"]');

  await expect(page.locator(".pad-table")).toBeVisible({ timeout: 10000 });
  const rows = page.locator(".pad-table tbody tr");
  await expect(rows.first()).toBeVisible();
  expect(await rows.count()).toBeGreaterThanOrEqual(5);

  // Click the reuse cell of the u_gpio0 row (inout) -> cycles to "in"
  const g0 = page.locator('.pad-table tbody tr', { hasText: "mini_chip.u_gpio0" });
  await g0.locator("td").nth(5).click(); // reuse column
  await expect(g0.locator("td").nth(5)).toHaveText("in");

  // Generate -> panel shows section A with GPIO_0 as internal aux input (level chip default)
  await page.click(".pad-panel-bar button:has-text('生成')");
  await expect(page.locator(".pad-gen")).toContainText("read_config_data", { timeout: 10000 });
  await expect(page.locator(".pad-gen")).toContainText("internal_auxiliary_input_ports : GPIO_0;");
  await expect(page.locator(".pad-gen")).toContainText("set_boundary_scan_port_options");

  await app.close();
});
```

（列序核对：checkbox=0, gpio=1, pad=2, dir=3, bscan=4, **reuse=5**, func=6, enable=7, path=8。若实现列序不同按实调整 nth。）

- [x] **Step 2: 跑全量**：`npm run test:unit` 全绿；`npm run test:e2e` —— pad.spec 与 regcount.spec 都过（regcount 用了新的 `[data-btn="regcount"]`）。若 e2e 环境起不了 Electron（无显示），记录并至少保证 build + unit 全绿。
- [x] **Step 3: 真实设计冒烟（人工）**：dev 模式打开 `chip_top.f` + `adk.tcelllib` → 32 行 iopad + 52 warnings 角标 → `GPIO2_0..7` 区间选中 8 行 → 批量 reuse=in + bscan=y → 生成 → 预览两段 → pad_cfg.json 出现在 chip_top 目录。观察记录进报告。
- [x] **Step 4: Commit + 汇报**

```bash
git add tests/e2e/pad.spec.ts
git commit -m "test(pad-tab): e2e — table load, cell edit, generate preview"
```

汇报：全量测试输出 + 冒烟观察，交用户决定合并方式（superpowers:finishing-a-development-branch）。

---

## 自查记录

- **Spec 覆盖**：§2 三默认（T3 lib 记忆/T5 cfg 持久化/T6 复制导出）；§3 布局（T3 工具栏+表格、T4 筛选/批量、T6 面板+分隔条+折叠）；§4 交互 7 条（T4: 1-4；T3: 5 warnings；T5: 6 自动保存；T3+T4: 7 重新分析+dropped 提示）；§5 架构（T2 桥 + T3 Tab + 命名映射在 overlayFromRows）；§6 测试（T1 单测/T3+T5 store 测/T2 集成/T7 e2e）；§7 非目标未越界。
- **e2e 冲突处理**：regcount.spec 的 `.dock-btn` 选择器精确化（T3 Step 5）。
- **类型一致性**：PadRow/PadFilter/PadTableResult 定义于 T1，T2-T6 引用同名同形；store 动作签名前后一致（patchPadRows 的 paths 支持 Set|array）。
- **已知取舍**：func 自定义值用 window.prompt（P2 够用，避免造弹窗组件）；shift 范围选基于可见行索引（筛选变化时 anchor 重置 + 越界 clamp）；enable 还原为显式 ↺ 按钮（dblclick 在 click-开编辑器下不可达）。
- **实现偏差记录**：Task 6 拖拽分隔条的 up handler 用 panelHRef 持久化最新高度（plan 原代码存在 stale-closure 缺陷，已按授权修正）。
