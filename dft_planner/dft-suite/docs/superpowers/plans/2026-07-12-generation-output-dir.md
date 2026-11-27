# 生成结果写入工程输出目录(§5.4 Phase A)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 把 app 现有生成物,经各面板「写入工程」按钮,通过一个通用写盘 IPC 直接写进工程目录的结构化子目录(Arch/Spec/IP/design_info),不再逐个手动下载。

**Architecture:** 新增通用 `dft:project:writeFiles({baseDir,files})` IPC;三个纯函数模块(路径映射 `outputLayout`、寄存器 TCL 报告 `regReport`、pad 两段拆分 `splitPadOutput`)+ 单测;`project.ts` 加 `writeToProject` 助手;各面板加「写入工程」按钮。根 = `.dftproj` 所在目录(新建工程时 `.dftproj` 落进 outputDir 使三者同根)。

**Tech Stack:** React + zustand,Electron 主进程 fs;纯函数 `node --test`,写盘链路 Playwright e2e。

**规格来源:** `docs/specs/2026-07-12-generation-output-dir-design.md`。

**关键前置事实(已核对代码):**
- `electron/main.cjs:140-167` 工程 IPC;`pickNew`(`:141-149`)现在选 filelist + outputDir + .dftproj 保存位置(3 对话框)。`fs`(node:fs/promises)、`path`、`dialog` 已 require。
- `src/store/project.ts`:`useProject`;`newProject`(`:34-42`,`genconnDoc: null`);`saveGenconn`(`:66-82`,null 时默认 `<base>.genconn.json`,相对 `.dftproj` 目录解析)。
- `src/core-bridge/model.ts:114-119`:`RegCount { instanceId; own; subtree; memoryBits }`、`RegCountResult { counts; total }`。`src/hierarchy/core/regcount.ts:21` `regRows(result, {key,dir}, filter)`。
- 各面板导出点:genconn `GeneratePanel.tsx`(`files: FileEntry[]` 连接文件;`全部下载` `:188`;`exportDftV` `:134-152` 产 `${d.designName}_with_dft.v`);DFX `DfxCtrlTab.tsx`(`genFiles: GenFile[]`;`全部下载` `:339`);specgen `Workspace.tsx`(`specText`;`保存` `:549` 产 `${scope.designName}.dftspec`);pad `PadTab.tsx`(`genText`;`导出…` `:267`);RegCount `RegCountTab.tsx`(`rc = useStore(s=>s.regCounts): RegCountResult`,无任何导出)。
- genconn 连接文件名:`<top|def>.top_level_ports_and_connectionss`(主)+ 可选 `<top|def>.tcl`(feedthrough)。DFX 三件套:`<模块>.v/.icl/.tcl`。
- 设计 token / GenPreview(`src/common/genpreview/GenPreview.tsx`,`GenFile={name,text,before?}`)已就绪。
- e2e:`launchApp`;`__gcStore`/`__dftStore` 在 `?e2e=1` 暴露;`window.dft.project.*` 桥可在 `page.evaluate` 调。

---

## 文件结构

**新建:** `src/store/outputLayout.ts`、`src/hierarchy/core/regReport.ts`、`splitPadOutput`(加到 `src/hierarchy/core/pad.ts`)、单测 `tests/unit/output-layout.test.ts` / `reg-report.test.ts` / `pad-split.test.ts`、e2e `tests/e2e/write-project.spec.ts`。

**修改:** `electron/main.cjs`(writeFiles IPC + pickNew)、`electron/preload.cjs`、`src/core-bridge/dft.d.ts`、`src/store/project.ts`(writeToProject + saveGenconn 默认 + newProject genconnDoc)、`GeneratePanel.tsx` / `DfxCtrlTab.tsx` / `specgen/Workspace.tsx` / `PadTab.tsx` / `RegCountTab.tsx`。

---

## Task 1: 通用写盘 IPC + pickNew 落位

**Files:** Modify `electron/main.cjs`、`electron/preload.cjs`、`src/core-bridge/dft.d.ts`

- [ ] **Step 1: writeFiles IPC**

在 `electron/main.cjs` 工程 IPC 区(`dft:project:write` 之后)加:
```js
ipcMain.handle("dft:project:writeFiles", async (_e, { baseDir, files }) => {
  const written = [];
  for (const f of files) {
    const abs = path.join(baseDir, f.relPath);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, f.text, "utf8");
    written.push(abs);
  }
  return written;
});
```

- [ ] **Step 2: pickNew 简化为两对话框 + .dftproj 落进 outputDir**

把 `dft:project:pickNew`(`:141-149`)替换为:
```js
ipcMain.handle("dft:project:pickNew", async () => {
  const fl = await dialog.showOpenDialog(win, { title: "选择设计 filelist", properties: ["openFile"], filters: [{ name: "filelist", extensions: ["f", "fl"] }] });
  if (fl.canceled || !fl.filePaths[0]) return null;
  const od = await dialog.showOpenDialog(win, { title: "选择工程 / 输出目录", properties: ["openDirectory", "createDirectory"] });
  if (od.canceled || !od.filePaths[0]) return null;
  const filelist = fl.filePaths[0];
  const outputDir = od.filePaths[0];
  const design = path.basename(filelist).replace(/\.[^.]+$/, "");
  const projPath = path.join(outputDir, `${design}.planner.dftproj`);
  return { filelist, outputDir, projPath };
});
```

- [ ] **Step 3: preload 桥**

在 `electron/preload.cjs` 的 `project` 段加一行:
```js
    writeFiles: (baseDir, files) => ipcRenderer.invoke("dft:project:writeFiles", { baseDir, files }),
```

- [ ] **Step 4: 桥类型**

在 `src/core-bridge/dft.d.ts` 的 `project` 段加:
```ts
      writeFiles(baseDir: string, files: { relPath: string; text: string }[]): Promise<string[]>;
```

- [ ] **Step 5: typecheck + build**: `npm run typecheck && npm run build` → 无错。

- [ ] **Step 6: 提交**
```bash
git add electron/main.cjs electron/preload.cjs src/core-bridge/dft.d.ts
git commit -m "feat(project): 通用 writeFiles 写盘 IPC + pickNew 落 .dftproj 进 outputDir"
```

---

## Task 2: outputLayout 路径映射纯函数

**Files:** Create `src/store/outputLayout.ts`, `tests/unit/output-layout.test.ts`

- [ ] **Step 1: 失败测试**

Create `tests/unit/output-layout.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { ipFiles, archConnectionFiles, specFile, padFiles, withDftPortFile, regCountFile, archDocFile } from "../../src/store/outputLayout.ts";

test("ipFiles 按扩展名分 IP/VERILOG|ICL|TCL", () => {
  const r = ipFiles([{ name: "pll_ctrl_ds1.v", text: "v" }, { name: "pll_ctrl_ds1.icl", text: "i" }, { name: "pll_ctrl_ds1.tcl", text: "t" }]);
  assert.deepEqual(r.map((f) => f.relPath), ["IP/VERILOG/pll_ctrl_ds1.v", "IP/ICL/pll_ctrl_ds1.icl", "IP/TCL/pll_ctrl_ds1.tcl"]);
});
test("archConnectionFiles:主连接文件 → Arch/<base>.connection.tcl,feedthrough → .feedthrough.tcl", () => {
  const r = archConnectionFiles([
    { name: "../../design/soc/top.top_level_ports_and_connectionss", text: "c" },
    { name: "../../design/soc/top.tcl", text: "f" },
  ]);
  assert.deepEqual(r.map((f) => f.relPath), ["Arch/top.connection.tcl", "Arch/top.feedthrough.tcl"]);
});
test("specFile / withDftPortFile / regCountFile / archDocFile", () => {
  assert.equal(specFile("chip_top", "x").relPath, "Spec/chip_top.dftspec");
  assert.equal(withDftPortFile("chip_top", "x").relPath, "design_info/chip_top.with_dft_port.v");
  assert.equal(regCountFile("x").relPath, "design_info/register_count.tcl");
  assert.equal(archDocFile("chip_top", "x").relPath, "Arch/chip_top.arch");
});
test("padFiles:空段不产出", () => {
  assert.deepEqual(padFiles("aux", "").map((f) => f.relPath), ["Spec/bscan/auxiliary.spec"]);
  assert.deepEqual(padFiles("aux", "opt").map((f) => f.relPath), ["Spec/bscan/auxiliary.spec", "Spec/bscan/bscan_options.tcl"]);
});
```

- [ ] **Step 2: 跑测试确认失败**: `node --test tests/unit/output-layout.test.ts` → FAIL。

- [ ] **Step 3: 实现**

Create `src/store/outputLayout.ts`:
```ts
// 各生成器产物 → 工程结构化目录 relPath 的纯映射(不碰 IO)。spec §3。
export type OutFile = { relPath: string; text: string };

const leaf = (p: string): string => p.split("/").pop() ?? p;

/** DFX ctrl 三件套:按扩展名 → IP/VERILOG|ICL|TCL/<模块>.<ext>。 */
export function ipFiles(files: { name: string; text: string }[]): OutFile[] {
  return files.map((f) => {
    const b = leaf(f.name);
    const dir = b.endsWith(".v") ? "VERILOG" : b.endsWith(".icl") ? "ICL" : b.endsWith(".tcl") ? "TCL" : "OTHER";
    return { relPath: `IP/${dir}/${b}`, text: f.text };
  });
}

/** genconn 连接产物:*.top_level_ports_and_connectionss → Arch/<base>.connection.tcl;
 *  其余 *.tcl(feedthrough)→ Arch/<base>.feedthrough.tcl。 */
export function archConnectionFiles(files: { name: string; text: string }[]): OutFile[] {
  const SUF = ".top_level_ports_and_connectionss";
  return files.map((f) => {
    const b = leaf(f.name);
    if (b.endsWith(SUF)) return { relPath: `Arch/${b.slice(0, -SUF.length)}.connection.tcl`, text: f.text };
    if (b.endsWith(".tcl")) return { relPath: `Arch/${b.slice(0, -4)}.feedthrough.tcl`, text: f.text };
    return { relPath: `Arch/${b}`, text: f.text };
  });
}

export function specFile(design: string, text: string): OutFile {
  return { relPath: `Spec/${design}.dftspec`, text };
}

export function padFiles(aux: string, bscanOpts: string): OutFile[] {
  const out: OutFile[] = [];
  if (aux.trim()) out.push({ relPath: "Spec/bscan/auxiliary.spec", text: aux });
  if (bscanOpts.trim()) out.push({ relPath: "Spec/bscan/bscan_options.tcl", text: bscanOpts });
  return out;
}

export function withDftPortFile(design: string, text: string): OutFile {
  return { relPath: `design_info/${design}.with_dft_port.v`, text };
}

export function regCountFile(text: string): OutFile {
  return { relPath: "design_info/register_count.tcl", text };
}

export function archDocFile(design: string, text: string): OutFile {
  return { relPath: `Arch/${design}.arch`, text };
}
```

- [ ] **Step 4: 跑测试确认通过**: `node --test tests/unit/output-layout.test.ts` → 4 PASS。

- [ ] **Step 5: 提交**
```bash
git add src/store/outputLayout.ts tests/unit/output-layout.test.ts
git commit -m "feat(output): outputLayout 生成物 → 结构化目录 relPath 纯映射"
```

---

## Task 3: 寄存器 TCL 报告纯函数

**Files:** Create `src/hierarchy/core/regReport.ts`, `tests/unit/reg-report.test.ts`

- [ ] **Step 1: 失败测试**

Create `tests/unit/reg-report.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatRegReport } from "../../src/hierarchy/core/regReport.ts";

test("formatRegReport 产出 TCL 可 source 数组 + 汇总", () => {
  const rc = { total: 45678, counts: [
    { instanceId: "chip_top", own: 0, subtree: 45678, memoryBits: 2048 },
    { instanceId: "chip_top.u_cpu", own: 1234, subtree: 12000, memoryBits: 0 },
  ] };
  const s = formatRegReport("chip_top", rc);
  assert.ok(s.includes("set reg_count(chip_top,total_flops) 45678"));
  assert.ok(s.includes("set reg_count(chip_top,total_memory) 2048"));
  assert.ok(s.includes("set reg_count(chip_top.u_cpu,own) 1234"));
  assert.ok(s.includes("set reg_count(chip_top.u_cpu,subtree) 12000"));
  assert.ok(s.includes("set reg_count(chip_top.u_cpu,memory) 0"));
});
```

- [ ] **Step 2: 跑测试确认失败**: `node --test tests/unit/reg-report.test.ts` → FAIL。

- [ ] **Step 3: 实现**

Create `src/hierarchy/core/regReport.ts`:
```ts
// 寄存器统计 → TCL 可 source 数组文本(spec §5)。下游 `source` 后得 $reg_count(inst,field)。
// 实例 id 是 Verilog 层次路径(word 字符 + .),TCL 索引安全,无需 quote。
import type { RegCountResult } from "../../core-bridge/model.ts";
import { regRows } from "./regcount.ts";

export function formatRegReport(design: string, rc: RegCountResult): string {
  const rows = regRows(rc, { key: "subtree", dir: "desc" }, "");
  const totalMemory = rc.counts.reduce((s, c) => s + c.memoryBits, 0);
  const lines: string[] = [
    `# register count — ${design}`,
    `# fields: own / subtree / memory (per instance, keyed by full hier path)`,
    `set reg_count(${design},total_flops) ${rc.total}`,
    `set reg_count(${design},total_memory) ${totalMemory}`,
  ];
  for (const c of rows) {
    lines.push(`set reg_count(${c.instanceId},own) ${c.own}`);
    lines.push(`set reg_count(${c.instanceId},subtree) ${c.subtree}`);
    lines.push(`set reg_count(${c.instanceId},memory) ${c.memoryBits}`);
  }
  return lines.join("\n") + "\n";
}
```

- [ ] **Step 4: 跑测试确认通过**: `node --test tests/unit/reg-report.test.ts` → PASS。

- [ ] **Step 5: 提交**
```bash
git add src/hierarchy/core/regReport.ts tests/unit/reg-report.test.ts
git commit -m "feat(regcount): 寄存器统计 → TCL 可 source 数组报告"
```

---

## Task 4: pad 两段拆分纯函数

**Files:** Modify `src/hierarchy/core/pad.ts`, Create `tests/unit/pad-split.test.ts`

- [ ] **Step 1: 失败测试**

Create `tests/unit/pad-split.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { splitPadOutput } from "../../src/hierarchy/core/pad.ts";

test("按 set_boundary_scan_port_options 切两段", () => {
  const text = "read_config_data -in_wrapper $dftspec {\n  AuxiliaryInputOutputPorts { GPIO1 }\n}\n\nset_boundary_scan_port_options -pad_io_ports { GPIO1 }";
  const r = splitPadOutput(text);
  assert.ok(r.auxiliary.startsWith("read_config_data"));
  assert.ok(!r.auxiliary.includes("set_boundary_scan_port_options"));
  assert.ok(r.bscanOptions.startsWith("set_boundary_scan_port_options"));
});
test("无标记 → 全归 auxiliary,bscanOptions 空", () => {
  const r = splitPadOutput("read_config_data { x }");
  assert.equal(r.bscanOptions, "");
  assert.ok(r.auxiliary.includes("read_config_data"));
});
```

- [ ] **Step 2: 跑测试确认失败**: `node --test tests/unit/pad-split.test.ts` → FAIL。

- [ ] **Step 3: 实现(追加到 pad.ts)**

在 `src/hierarchy/core/pad.ts` 末尾追加:
```ts
/** 把 pad 生成的整块文本按第一处 set_boundary_scan_port_options 行切两段(spec §6)。 */
export function splitPadOutput(text: string): { auxiliary: string; bscanOptions: string } {
  const lines = text.split("\n");
  const i = lines.findIndex((l) => l.trimStart().startsWith("set_boundary_scan_port_options"));
  if (i < 0) return { auxiliary: text.trim(), bscanOptions: "" };
  return {
    auxiliary: lines.slice(0, i).join("\n").trim(),
    bscanOptions: lines.slice(i).join("\n").trim(),
  };
}
```

- [ ] **Step 4: 跑测试确认通过**: `node --test tests/unit/pad-split.test.ts` → 2 PASS。

- [ ] **Step 5: 提交**
```bash
git add src/hierarchy/core/pad.ts tests/unit/pad-split.test.ts
git commit -m "feat(pad): splitPadOutput 把生成文本按边界切成 auxiliary/bscanOptions 两段"
```

---

## Task 5: project.ts —— writeToProject 助手 + genconn 文档统一 Arch/.arch

**Files:** Modify `src/store/project.ts`

- [ ] **Step 1: writeToProject 助手 + 类型 import**

在 `src/store/project.ts` 顶部 import 区加:
```ts
import type { OutFile } from "./outputLayout.ts";
```
在文件末尾(`useProject` 定义之后)加:
```ts
/** 把结构化产物写进当前工程目录(= .dftproj 所在目录 = 树根)。无工程/空则提示。 */
export async function writeToProject(files: OutFile[]): Promise<void> {
  const st = useProject.getState();
  const p = (window as any).dft?.project;
  if (!st.path || !p?.writeFiles) { window.alert("请先新建或打开工程"); return; }
  if (files.length === 0) { window.alert("暂无可写内容"); return; }
  const baseDir = st.path.replace(/[^/]+$/, "");
  try {
    const written: string[] = await p.writeFiles(baseDir, files);
    window.alert(`已写入 ${written.length} 个文件到 ${baseDir}`);
  } catch (e) {
    window.alert(`写入失败：${String((e as Error)?.message ?? e)}`);
  }
}
```

- [ ] **Step 2: newProject 的 genconnDoc 初值 = Arch/<design>.arch**

把 `newProject`(`:34-42`)里构造 `proj` 那行改为(先算 design):
```ts
    const design = (pick.filelist.split("/").pop() ?? "chip").replace(/\.[^.]+$/, "");
    const proj: DftProject = { version: 1, filelist: pick.filelist, top: "", outputDir: pick.outputDir, genconnDoc: `Arch/${design}.arch`, specgenWorkspace: null, padCfg: null };
```

- [ ] **Step 3: saveGenconn 的 null 默认改 Arch/<design>.arch**

把 `saveGenconn`(`:72-74`)里 `if (!rel) {...}` 的默认改为:
```ts
    if (!rel) {
      const base = (st.project.filelist.split("/").pop() ?? "chip").replace(/\.[^.]+$/, "");
      rel = `Arch/${base}.arch`;
      const updated = { ...st.project, genconnDoc: rel };
      await p.write(st.path, serializeProject(updated));
      set({ project: updated });
    }
```
(其余 `saveGenconn` 逻辑不变:`rel` 相对 `dir`(= .dftproj 目录 = 树根)解析,故 `Arch/<base>.arch` 落在树根 Arch/ 下。)

- [ ] **Step 4: typecheck + build + 全量单元**: `npm run typecheck && npm run build && npm run test:unit` → 无错、全绿。

- [ ] **Step 5: 提交**
```bash
git add src/store/project.ts
git commit -m "feat(project): writeToProject 助手 + genconn 文档统一 Arch/<design>.arch"
```

---

## Task 6: genconn GeneratePanel「写入工程」+「注入写入工程」

**Files:** Modify `src/genconn/GeneratePanel.tsx`

- [ ] **Step 1: import**

在 `src/genconn/GeneratePanel.tsx` 顶部加:
```ts
import { useProject, writeToProject } from "../store/project.ts";
import { archConnectionFiles, archDocFile, withDftPortFile } from "../store/outputLayout.ts";
```

- [ ] **Step 2: 连接「写入工程」处理 + 注入「写入工程」处理**

在组件内(与 `exportDftV` 同处)加:
```tsx
  const projOpen = useProject((s) => !!s.path);

  const writeConn = () => {
    const rootDef = doc.library.defs.find((d) => d.id === doc.ui.rootDefId);
    const design = rootDef?.designName ?? "chip";
    void writeToProject([...archConnectionFiles(files), archDocFile(design, toText())]);
  };

  const writeInject = () => {
    const defs = doc.library.defs.filter((d) => defNeedsDft(d, doc.library));
    if (defs.length === 0) { window.alert("没有可注入的 DFT 连接或提升接口"); return; }
    const out: { relPath: string; text: string }[] = [];
    const missing: string[] = [];
    for (const d of defs) {
      const fn = d.fileName;
      let text: string | undefined = fn ? (rtlFiles[fn] ?? rtlFiles[basename(fn)]) : undefined;
      if (text == null) text = rtlFiles[`${d.designName}.v`];
      if (text == null) { missing.push(d.designName); continue; }
      out.push(withDftPortFile(d.designName, injectDft(text, doc.library, d.id)));
    }
    if (missing.length) { window.alert(`这些层的原始 .v 不在内存，请先在左侧「设计层次」上传对应 RTL：${missing.join("、")}`); return; }
    void writeToProject(out);
  };
```
NOTE:`toText` 是 genconn store 的 `serialize` 文本——本文件已能取 `doc`;若无 `toText`,用 `serialize(doc)`(`serialize` 已 import,`GeneratePanel` 顶部有)。改用 `archDocFile(design, serialize(doc))` 更稳,采用它。

- [ ] **Step 2b: 用 serialize(doc) 而非 toText**

把 Step 2 的 `archDocFile(design, toText())` 改为 `archDocFile(design, serialize(doc))`(`serialize` 见文件顶部 import;若无则加 `import { serialize } from "./core/document.ts";`——先确认,`injectViaCli` 已用 `serialize(doc)`,说明已 import)。

- [ ] **Step 3: 加两个按钮**

在 header 的「全部下载」按钮之后(`:188` 附近)加:
```tsx
        {projOpen && <button onClick={writeConn} title="把连接文件 + 架构快照写进工程 Arch/">写入工程</button>}
```
在「导出带 DFT 的 .v」按钮(`:197`)之后加:
```tsx
        {projOpen && <button onClick={writeInject} title="注入并写进工程 design_info/">注入写入工程</button>}
```

- [ ] **Step 4: typecheck + build**: `npm run typecheck && npm run build` → 无错。

- [ ] **Step 5: 提交**
```bash
git add src/genconn/GeneratePanel.tsx
git commit -m "feat(genconn): 生成面板「写入工程」(连接→Arch/ + 架构快照)+「注入写入工程」(→design_info/)"
```

---

## Task 7: DFX + specgen「写入工程」

**Files:** Modify `src/hierarchy/schematic/DfxCtrlTab.tsx`、`src/specgen/Workspace.tsx`

- [ ] **Step 1: DFX —— import + 按钮**

在 `DfxCtrlTab.tsx` 顶部加:
```tsx
import { useProject, writeToProject } from "../../store/project.ts";
import { ipFiles } from "../../store/outputLayout.ts";
```
组件内加 `const projOpen = useProject((s) => !!s.path);`。在 `.dfx-genpanel-head` 的「全部下载」按钮(`:339`)之后加:
```tsx
            {projOpen && <button onClick={() => void writeToProject(ipFiles(genFiles))}>写入工程</button>}
```

- [ ] **Step 2: specgen —— import + 按钮**

在 `src/specgen/Workspace.tsx` 顶部加:
```tsx
import { useProject, writeToProject } from "../store/project.ts";
import { specFile } from "../store/outputLayout.ts";
```
组件内加 `const projOpen = useProject((s) => !!s.path);`。在 `.dft-specpanel-btns` 的「保存」按钮(`:549`)之后加:
```tsx
                    {projOpen && <button onClick={() => void writeToProject([specFile(scope?.designName ?? "dft", specText)])}>写入工程</button>}
```

- [ ] **Step 3: typecheck + build**: `npm run typecheck && npm run build` → 无错。

- [ ] **Step 4: 提交**
```bash
git add src/hierarchy/schematic/DfxCtrlTab.tsx src/specgen/Workspace.tsx
git commit -m "feat(dfx,specgen): 生成预览「写入工程」(IP 三件套 → IP/;dftspec → Spec/)"
```

---

## Task 8: pad 预览双栏 + 「写入工程」

**Files:** Modify `src/hierarchy/PadTab.tsx`

- [ ] **Step 1: import + 拆分 + GenPreview**

在 `PadTab.tsx` 顶部加:
```tsx
import { GenPreview } from "../common/genpreview/GenPreview.tsx";
import { splitPadOutput } from "./core/pad.ts";
import { useProject, writeToProject } from "../store/project.ts";
import { padFiles } from "../store/outputLayout.ts";
```
(注意:`splitPadOutput` 加在 `./core/pad.ts`,该文件其它 import 可能已在——合并进现有 `from "./core/pad.ts"` 一行。)

- [ ] **Step 2: 派生两段 + 预览双栏**

在组件内(有 `genText` 处)加:
```tsx
  const padSplit = splitPadOutput(genText);
  const projOpen = useProject((s) => !!s.path);
```
把底部预览 `<pre className="pad-gen">{genText || "（点「生成」）"}</pre>`(`:276`)替换为:
```tsx
            : genText
              ? <GenPreview
                  files={[
                    ...(padSplit.auxiliary ? [{ name: "auxiliary.spec", text: padSplit.auxiliary }] : []),
                    ...(padSplit.bscanOptions ? [{ name: "bscan_options.tcl", text: padSplit.bscanOptions }] : []),
                  ]}
                  onCopy={(f) => void navigator.clipboard?.writeText(f.text)}
                />
              : <pre className="pad-gen">（点「生成」）</pre>
```

- [ ] **Step 3: 「写入工程」按钮**

在「导出…」按钮(`:267`)之后加:
```tsx
            {projOpen && <button className="pad-btn" onClick={() => void writeToProject(padFiles(padSplit.auxiliary, padSplit.bscanOptions))}>写入工程</button>}
```

- [ ] **Step 4: typecheck + build**: `npm run typecheck && npm run build` → 无错。

- [ ] **Step 5: 提交**
```bash
git add src/hierarchy/PadTab.tsx
git commit -m "feat(pad): 预览拆双栏(auxiliary.spec/bscan_options.tcl)+「写入工程」→ Spec/bscan/"
```

---

## Task 9: RegCount「导出到工程」

**Files:** Modify `src/hierarchy/RegCountTab.tsx`

- [ ] **Step 1: import**

在 `RegCountTab.tsx` 顶部加:
```tsx
import { useDesign } from "../store/design.ts";
import { useProject, writeToProject } from "../store/project.ts";
import { regCountFile } from "../store/outputLayout.ts";
import { formatRegReport } from "./core/regReport.ts";
```

- [ ] **Step 2: 按钮 —— 在 rc-head 里加「导出到工程」**

组件内加 `const projOpen = useProject((s) => !!s.path);`。在 `.rc-head` 的 `<span className="rc-total">` 之后(`:47`)加:
```tsx
        {projOpen && rc && (
          <button className="rc-export" title="导出寄存器统计到工程 design_info/register_count.tcl"
                  onClick={() => void writeToProject([regCountFile(formatRegReport(useDesign.getState().top ?? "design", rc))])}>
            导出到工程
          </button>
        )}
```
(`rc = useStore(s=>s.regCounts)` 已在;`rc` 非空时才可导出。`.rc-export` 无需专门样式,继承 `.rc-head` 按钮外观——若无则加最简样式到 `src/hierarchy/styles.css`:`#ws-hierarchy .rc-export { margin-left: auto; }`。)

- [ ] **Step 3: typecheck + build**: `npm run typecheck && npm run build` → 无错。

- [ ] **Step 4: 提交**
```bash
git add src/hierarchy/RegCountTab.tsx src/hierarchy/styles.css
git commit -m "feat(regcount): 「导出到工程」→ design_info/register_count.tcl(TCL 可 source)"
```

---

## Task 10: e2e —— writeFiles 落盘验证 + 收尾

**Files:** Create `tests/e2e/write-project.spec.ts`

- [ ] **Step 1: e2e —— writeFiles 真落盘到临时目录**

Create `tests/e2e/write-project.spec.ts`:
```ts
import { test, expect } from "@playwright/test";
import { launchApp } from "../helpers/electron.ts";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("project.writeFiles 把结构化文件真写进 baseDir", async () => {
  const { app, page } = await launchApp();
  const base = mkdtempSync(join(tmpdir(), "dft-write-"));
  const written: string[] = await page.evaluate(
    (b) => (window as any).dft.project.writeFiles(b, [
      { relPath: "IP/VERILOG/m.v", text: "module m; endmodule" },
      { relPath: "design_info/register_count.tcl", text: "set reg_count(top,total_flops) 1" },
    ]),
    base,
  );
  expect(written.length).toBe(2);
  expect(existsSync(join(base, "IP/VERILOG/m.v"))).toBe(true);
  expect(readFileSync(join(base, "design_info/register_count.tcl"), "utf8")).toContain("total_flops");
  await app.close();
});
```

- [ ] **Step 2: 跑 e2e**: `npm run build && npx playwright test tests/e2e/write-project.spec.ts` → PASS。

- [ ] **Step 3: 全量验收**
```
npm run test:unit
npx playwright test
```
Expected: 全绿。若因新按钮致某 genconn/hierarchy 截图变化(面板多了按钮)→ `npx playwright test <该 spec> --update-snapshots=all` 重生成。

- [ ] **Step 4: 提交**
```bash
git add tests/e2e/write-project.spec.ts tests/e2e/__screenshots__
git commit -m "test(project): writeFiles 落盘 e2e + 刷新受影响截图"
```

---

## 收尾验收
- [ ] `npm run test:unit` → 全绿(含 output-layout/reg-report/pad-split)。
- [ ] `npx playwright test` → 全绿。
- [ ] `npm run build` → 成功。

## Self-Review 结论(写者自查)
- **规格覆盖**:§2 writeFiles IPC → Task 1;§3 outputLayout → Task 2;§5 regReport → Task 3;§6 pad 拆分 → Task 4/8;§7 writeToProject + 各面板按钮 → Task 5-9;§4 genconn 文档统一 → Task 5;§8 pickNew 落位 + 命名 → Task 1/5。
- **占位符**:无;每步完整代码 + 确切行号锚点。
- **类型/命名一致**:`OutFile`、`ipFiles/archConnectionFiles/specFile/padFiles/withDftPortFile/regCountFile/archDocFile`、`writeToProject`、`formatRegReport`、`splitPadOutput` 跨任务一致;e2e 用 `window.dft.project.writeFiles` 与 Task 1 桥一致。
- **风险**:①各面板加按钮可能让 genconn/hierarchy 截图变化 → Task 10 Step 3 兜底重生成。②`GeneratePanel` 的 `serialize`/`toText`/`rtlFiles`/`basename`/`defNeedsDft`/`injectDft` 均已在文件内(exportDftV 已用),复用不新增 import(Step 2b 已提示确认)。③`writeToProject` 成功用 alert 反馈(无 toast 系统),后续可换轻量提示。
- **测试**:纯函数 TDD;写盘链路 e2e 真落盘临时目录;UI 按钮存在性靠 build + 手测(截图守面板布局)。
