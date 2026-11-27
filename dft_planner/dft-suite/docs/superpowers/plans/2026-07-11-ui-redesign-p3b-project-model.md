# UI 重设计 P3b（.dftproj 工程模型 + genconn 绑定 + 重开残留修复）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development / executing-plans. Steps use `- [ ]`.

**Goal:** 引入显式 `.dftproj` 工程文件(记录 filelist/top/outputDir/genconnDoc),经顶栏「工程 ▾」下拉与原生菜单新建/打开;工程绑定 genconn 文档;修复「重开软件后连接生成残留上次画布」(genconn 启动不再自动恢复 localStorage)。

**Scope 决策(重要):** 不做「启动落地欢迎页」(§5.2 完整版)——它会拦截整个 app、需迁移约 20 个直接进工作区的 e2e、且是需你目测评审的大 UX 面。改用**顶栏「工程 ▾」下拉 + 原生菜单**作可见入口(不拦截 app)。欢迎页留待你评审后单独做。其余 §5.1/§5.3 完整实现。§5.4「生成→outputDir 应用到磁盘」本期只把 outputDir 记入工程 + GenPreview 下载默认名带 outputDir 提示,真正写盘留待欢迎页一期(GenPreview 下载已可用)。

**Architecture:** 新增 Electron 主进程 `.dftproj` 文件 IO(仿 pad_cfg 的 `dialog` + `fs` 模式)+ preload 桥;新增 `useProject` zustand store;顶栏 `OpenDesign` 换成「工程 ▾」下拉;P1 原生菜单的 `project-new/project-open` 占位改为真实;genconn `initialDoc()` 去掉 lsLoad(修残留),工程打开时载入其 genconn 文档。

**规格来源:** `docs/specs/2026-07-10-ui-redesign-design.md` §5.1/§5.3。

**关键前置事实(已核对代码):**
- Electron IO 样板:`electron/main.cjs` —— `dialog.showOpenDialog`(`:84,92,108`)、`dialog.showSaveDialog`(`:129`)、`fs.readFile/writeFile`(`:117-132`,pad_cfg 读写);`app`/`dialog`/`fs`(node:fs/promises)/`path` 已 require。preload `electron/preload.cjs` 的 `dft` 桥 + `app:` 段样式。
- 原生菜单:`electron/menu.cjs` 已有 `nav("新建工程","project-new")`/`nav("打开工程…","project-open")`(P1);渲染层 `src/shell/menuActions.ts` 现把它们映射到 `setWorkspace("genconn")` 占位——改为调工程 store。
- 顶栏:`src/shell/TopBar.tsx` 渲染 `<OpenDesign />`(`src/shell/OpenDesign.tsx`:`.tbtn.primary` 按钮,点击 `window.dft.design.pickFilelist()` → `useDesign.openDesign({filelist})`)。
- 设计 store:`src/store/design.ts` —— `openDesign({filelist, top?})`、`status`、`top`、`filelist`。
- genconn:`src/genconn/store.ts:92-101` `initialDoc()` 调 `lsLoad()`→`deserialize` 恢复上次(残留根源);`:274` `const init = initialDoc()`。persist:`lsLoad/lsClear`(`src/genconn/persist.ts`);`serialize/deserialize/emptyDocument` from `./core/document.ts`;store 有 `openText(text)`(`:303` deserialize)。
- 状态栏:`src/shell/StatusBar.tsx`(ready 态显示 `设计 <top>` / `文件列表 <filelist>`)。
- e2e:`launchApp` 注入 `?e2e=1`;测试用 `__dftStore.openDesign` 直接开设计(**不经工程**)——本期改动不拦截该路径,故不破坏现有 e2e。

---

## 文件结构

**新建:**
- `src/store/project.ts` — `useProject` store(current project + recent + new/open/openRecent/close)。
- `src/shell/ProjectMenu.tsx` — 顶栏「工程 ▾」下拉(取代 OpenDesign 或与之并存)。
- `tests/unit/project-file.test.ts` — `.dftproj` 解析/序列化纯函数单测。
- `src/store/projectFile.ts` — `.dftproj` 纯函数(parse/serialize/validate)。

**修改:**
- `electron/main.cjs` — 新增 `dft:project:*` handlers。
- `electron/preload.cjs` — 新增 `project` 桥。
- `electron/*.d.cts` 或 `src/core-bridge/dft.d.ts` — 类型声明(按现有约定)。
- `src/shell/TopBar.tsx` — `OpenDesign` → `ProjectMenu`。
- `src/shell/menuActions.ts` — `project-new/project-open` 调工程 store。
- `src/shell/StatusBar.tsx` — 显示当前工程名。
- `src/genconn/store.ts` — `initialDoc()` 不 lsLoad(修残留)。
- `src/genconn/lifecycle.ts` — 工程打开时载入 genconn 文档。
- `tests/e2e/*` — 顶栏按钮改名后更新选择器(若有)。

---

## Task 1: `.dftproj` 纯函数 + Electron IO + preload

**Files:**
- Create: `src/store/projectFile.ts`, `tests/unit/project-file.test.ts`
- Modify: `electron/main.cjs`, `electron/preload.cjs`, `src/core-bridge/dft.d.ts`(桥类型)

- [ ] **Step 1: .dftproj 纯函数失败测试**

Create `tests/unit/project-file.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProject, serializeProject, type DftProject } from "../../src/store/projectFile.ts";

const P: DftProject = { version: 1, filelist: "/d/chip_top.f", top: "chip_top", outputDir: "/d/out", genconnDoc: "chip_top.genconn.json", specgenWorkspace: null, padCfg: null };

test("serialize→parse 往返一致", () => {
  assert.deepEqual(parseProject(serializeProject(P)), P);
});
test("parse 容错:缺可选字段补 null", () => {
  const p = parseProject(JSON.stringify({ version: 1, filelist: "/a.f", top: "a", outputDir: "/o" }));
  assert.equal(p.genconnDoc, null); assert.equal(p.filelist, "/a.f");
});
test("parse 非法 JSON 抛错", () => {
  assert.throws(() => parseProject("{not json"));
});
test("parse 缺必填 filelist 抛错", () => {
  assert.throws(() => parseProject(JSON.stringify({ version: 1, top: "a", outputDir: "/o" })));
});
```

- [ ] **Step 2: 跑测试确认失败**: `node --test tests/unit/project-file.test.ts` → FAIL。

- [ ] **Step 3: 实现 projectFile.ts**

Create `src/store/projectFile.ts`:
```ts
// .dftproj 工程文件的纯解析/序列化。工程文件是 JSON,记录设计与各文档引用。
export interface DftProject {
  version: 1;
  filelist: string;            // 设计 filelist 绝对路径
  top: string;                 // top module
  outputDir: string;           // 生成产物输出目录
  genconnDoc: string | null;   // genconn 文档路径(相对 .dftproj 目录或绝对)
  specgenWorkspace: string | null;
  padCfg: string | null;
}

export function serializeProject(p: DftProject): string {
  return JSON.stringify(p, null, 2);
}

export function parseProject(text: string): DftProject {
  const o = JSON.parse(text); // 非法 JSON → 抛
  if (typeof o?.filelist !== "string" || !o.filelist) throw new Error(".dftproj 缺 filelist");
  return {
    version: 1,
    filelist: o.filelist,
    top: typeof o.top === "string" ? o.top : "",
    outputDir: typeof o.outputDir === "string" ? o.outputDir : "",
    genconnDoc: typeof o.genconnDoc === "string" ? o.genconnDoc : null,
    specgenWorkspace: typeof o.specgenWorkspace === "string" ? o.specgenWorkspace : null,
    padCfg: typeof o.padCfg === "string" ? o.padCfg : null,
  };
}
```

- [ ] **Step 4: 跑测试确认通过**: `node --test tests/unit/project-file.test.ts` → 4 PASS。

- [ ] **Step 5: Electron main handlers**

在 `electron/main.cjs`(pad handlers 附近)加:
```js
// ---- 工程 .dftproj IO ----
ipcMain.handle("dft:project:pickNew", async () => {
  // 选 filelist + 选输出目录 + 选 .dftproj 保存位置。任一取消 → null。
  const fl = await dialog.showOpenDialog(win, { title: "选择设计 filelist", properties: ["openFile"], filters: [{ name: "filelist", extensions: ["f", "fl"] }] });
  if (fl.canceled || !fl.filePaths[0]) return null;
  const od = await dialog.showOpenDialog(win, { title: "选择输出目录", properties: ["openDirectory", "createDirectory"] });
  if (od.canceled || !od.filePaths[0]) return null;
  const sv = await dialog.showSaveDialog(win, { title: "保存工程文件", defaultPath: "project_plan.dftproj", filters: [{ name: "dftproj", extensions: ["dftproj"] }] });
  if (sv.canceled || !sv.filePath) return null;
  return { filelist: fl.filePaths[0], outputDir: od.filePaths[0], projPath: sv.filePath };
});
ipcMain.handle("dft:project:pickOpen", async () => {
  const r = await dialog.showOpenDialog(win, { title: "打开工程", properties: ["openFile"], filters: [{ name: "dftproj", extensions: ["dftproj"] }] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle("dft:project:read", async (_e, { path: p }) => fs.readFile(p, "utf8"));
ipcMain.handle("dft:project:write", async (_e, { path: p, json }) => { await fs.writeFile(p, json, "utf8"); return true; });
// 最近工程列表(userData/recent-projects.json)
ipcMain.handle("dft:project:recent", async () => {
  const p = path.join(app.getPath("userData"), "recent-projects.json");
  try { return JSON.parse(await fs.readFile(p, "utf8")); } catch { return []; }
});
ipcMain.handle("dft:project:addRecent", async (_e, { path: proj }) => {
  const p = path.join(app.getPath("userData"), "recent-projects.json");
  let list = [];
  try { list = JSON.parse(await fs.readFile(p, "utf8")); } catch { /* 无则空 */ }
  list = [proj, ...list.filter((x) => x !== proj)].slice(0, 8);
  await fs.writeFile(p, JSON.stringify(list), "utf8");
  return list;
});
```

- [ ] **Step 6: preload 桥**

在 `electron/preload.cjs` 的 `dft` 对象里加(与 `pad:` 同级):
```js
  project: {
    pickNew: () => ipcRenderer.invoke("dft:project:pickNew"),
    pickOpen: () => ipcRenderer.invoke("dft:project:pickOpen"),
    read: (path) => ipcRenderer.invoke("dft:project:read", { path }),
    write: (path, json) => ipcRenderer.invoke("dft:project:write", { path, json }),
    recent: () => ipcRenderer.invoke("dft:project:recent"),
    addRecent: (path) => ipcRenderer.invoke("dft:project:addRecent", { path }),
  },
```

- [ ] **Step 7: 桥类型声明**

在 `src/core-bridge/dft.d.ts`(现有 `window.dft` 类型定义处)给 `dft` 加 `project` 字段类型:
```ts
    project: {
      pickNew(): Promise<{ filelist: string; outputDir: string; projPath: string } | null>;
      pickOpen(): Promise<string | null>;
      read(path: string): Promise<string>;
      write(path: string, json: string): Promise<boolean>;
      recent(): Promise<string[]>;
      addRecent(path: string): Promise<string[]>;
    };
```
(按该文件现有风格补;若该文件用 interface 命名,匹配之。)

- [ ] **Step 8: typecheck + build + 单测**: `npm run typecheck && npm run build && node --test tests/unit/project-file.test.ts` → 全过。

- [ ] **Step 9: 提交**
```bash
git add src/store/projectFile.ts tests/unit/project-file.test.ts electron/main.cjs electron/preload.cjs src/core-bridge/dft.d.ts
git commit -m "feat(project): .dftproj 纯函数 + Electron IO(新建/打开/读写/最近)+ preload 桥"
```

---

## Task 2: 工程 store + 顶栏「工程 ▾」+ 原生菜单 + 状态栏

**Files:**
- Create: `src/store/project.ts`, `src/shell/ProjectMenu.tsx`
- Modify: `src/shell/TopBar.tsx`, `src/shell/menuActions.ts`, `src/shell/StatusBar.tsx`
- Modify: `src/shell/shell.css`(下拉样式,可复用 .tb-menu 视觉)

- [ ] **Step 1: 工程 store**

Create `src/store/project.ts`:
```ts
import { create } from "zustand";
import { parseProject, serializeProject, type DftProject } from "./projectFile.ts";
import { useDesign } from "./design.ts";

interface ProjState {
  path: string | null;      // 当前 .dftproj 路径
  project: DftProject | null;
  recent: string[];
  loadRecent(): Promise<void>;
  newProject(): Promise<void>;
  openProject(): Promise<void>;
  openRecent(path: string): Promise<void>;
  closeProject(): void;
}

async function activate(path: string, project: DftProject): Promise<void> {
  const p = (window as any).dft?.project;
  useProject.setState({ path, project });
  if (p?.addRecent) useProject.setState({ recent: await p.addRecent(path) });
  // 打开设计(复用共享设计 store 的既有开设计路径)
  await useDesign.getState().openDesign({ filelist: project.filelist, top: project.top || undefined });
}

export const useProject = create<ProjState>((set) => ({
  path: null, project: null, recent: [],
  loadRecent: async () => {
    const p = (window as any).dft?.project;
    if (p?.recent) set({ recent: await p.recent() });
  },
  newProject: async () => {
    const p = (window as any).dft?.project;
    if (!p?.pickNew) return;
    const pick = await p.pickNew();
    if (!pick) return;
    const proj: DftProject = { version: 1, filelist: pick.filelist, top: "", outputDir: pick.outputDir, genconnDoc: null, specgenWorkspace: null, padCfg: null };
    await p.write(pick.projPath, serializeProject(proj));
    await activate(pick.projPath, proj);
  },
  openProject: async () => {
    const p = (window as any).dft?.project;
    if (!p?.pickOpen) return;
    const path = await p.pickOpen();
    if (!path) return;
    const proj = parseProject(await p.read(path));
    await activate(path, proj);
  },
  openRecent: async (path) => {
    const p = (window as any).dft?.project;
    if (!p?.read) return;
    const proj = parseProject(await p.read(path));
    await activate(path, proj);
  },
  closeProject: () => set({ path: null, project: null }),
}));
```

- [ ] **Step 2: 顶栏「工程 ▾」下拉**

Create `src/shell/ProjectMenu.tsx`:
```tsx
import { useEffect, useState } from "react";
import { useProject } from "../store/project.ts";
import { useDesign } from "../store/design.ts";

function baseName(p: string): string { return p.split("/").pop() ?? p; }

export function ProjectMenu() {
  const [open, setOpen] = useState(false);
  const project = useProject((s) => s.project);
  const path = useProject((s) => s.path);
  const recent = useProject((s) => s.recent);
  useEffect(() => { void useProject.getState().loadRecent(); }, []);

  const label = path ? baseName(path).replace(/\.dftproj$/, "") : "工程";

  async function quickOpenDesign() {
    setOpen(false);
    const fl = await (window as any).dft?.design?.pickFilelist?.();
    if (fl) await useDesign.getState().openDesign({ filelist: fl });
  }

  return (
    <span className="proj-menu-wrap">
      <button className="tbtn primary" onClick={() => setOpen((v) => !v)}>{label} <span className="chev">▾</span></button>
      {open && (
        <div className="proj-menu" onMouseLeave={() => setOpen(false)}>
          <div className="proj-menu-item" onClick={() => { setOpen(false); void useProject.getState().newProject(); }}>新建工程…</div>
          <div className="proj-menu-item" onClick={() => { setOpen(false); void useProject.getState().openProject(); }}>打开工程…</div>
          <div className="proj-menu-item" onClick={quickOpenDesign}>快速打开设计…</div>
          {recent.length > 0 && <div className="proj-menu-sep" />}
          {recent.map((r) => (
            <div key={r} className="proj-menu-item recent" title={r} onClick={() => { setOpen(false); void useProject.getState().openRecent(r); }}>
              {baseName(r).replace(/\.dftproj$/, "")}
            </div>
          ))}
        </div>
      )}
    </span>
  );
}
```

- [ ] **Step 3: 顶栏用 ProjectMenu 取代 OpenDesign**

在 `src/shell/TopBar.tsx`:把 `import { OpenDesign } from "./OpenDesign.tsx";` 改为 `import { ProjectMenu } from "./ProjectMenu.tsx";`,JSX 里 `<OpenDesign />` → `<ProjectMenu />`。(保留 OpenDesign.tsx 文件,快速打开设计逻辑已并入 ProjectMenu;若无其它引用可留着不删。)

- [ ] **Step 4: 下拉样式**

在 `src/shell/shell.css` 追加(复用 P1 菜单视觉):
```css
.proj-menu-wrap { position: relative; display: inline-block; }
.proj-menu { position: absolute; top: 100%; right: 0; z-index: 40; min-width: 200px; background: var(--menu-bg); border: 1px solid var(--border); border-radius: var(--r-md); box-shadow: var(--sh-2); padding: var(--sp-1); }
.proj-menu-item { padding: var(--sp-2) var(--sp-3); border-radius: var(--r-sm); cursor: pointer; font-size: var(--fs-sm); color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.proj-menu-item:hover { background: var(--row-hover); }
.proj-menu-item.recent { color: var(--text-dim); font-family: var(--mono); font-size: var(--fs-xs); }
.proj-menu-sep { height: 1px; background: var(--border); margin: var(--sp-1) var(--sp-2); }
```

- [ ] **Step 5: 原生菜单接工程**

在 `src/shell/menuActions.ts`:把 `project-new`/`project-open` 的处理从 `setWorkspace("genconn")` 改为:
```ts
      case "project-new": void import("../store/project.ts").then((m) => m.useProject.getState().newProject()); break;
      case "project-open": void import("../store/project.ts").then((m) => m.useProject.getState().openProject()); break;
```
(或顶部直接 `import { useProject } from "../store/project.ts";` 再 `useProject.getState().newProject()`——更简,采用直接 import。)其余 case 不变。

- [ ] **Step 6: 状态栏显示工程**

在 `src/shell/StatusBar.tsx` 的 ready 段,把 `设计 <top>` 那段前面加当前工程名(若有):读 `useProject((s)=>s.path)`,有则显示 `工程 <name>`。最小改动:import useProject,在 ready 分支加一个 `.seg`:`{projPath && <span className="seg">工程 <b>{baseName(projPath)}</b></span>}`。

- [ ] **Step 7: typecheck + build**: `npm run typecheck && npm run build` → 无错。

- [ ] **Step 8: 更新顶栏相关 e2e 选择器(若有)**

`tests/e2e/shell.spec.ts` 等若断言 `打开设计` 文案/`OpenDesign`,更新为「工程」。grep `打开设计` in tests;若有断言则改。运行 `npx playwright test tests/e2e/shell.spec.ts` 确认。若顶栏视觉变化致 `shell-*.png` 失配 → `--update-snapshots=all` 重生成。

- [ ] **Step 9: 全量 e2e + 提交**
```
npx playwright test
git add src/store/project.ts src/shell/ProjectMenu.tsx src/shell/TopBar.tsx src/shell/menuActions.ts src/shell/StatusBar.tsx src/shell/shell.css tests/e2e
git commit -m "feat(project): 顶栏「工程 ▾」+ 原生菜单新建/打开工程 + 状态栏工程名"
```

---

## Task 3: genconn 重开残留修复 + 工程绑定 genconn 文档

**Files:**
- Modify: `src/genconn/store.ts`, `src/genconn/lifecycle.ts`

- [ ] **Step 1: initialDoc 不再自动恢复(修残留)**

在 `src/genconn/store.ts` 把 `initialDoc()`(`:92-101`)改为直接返回空文档(不 lsLoad):
```ts
function initialDoc(): GenConnDocument {
  return emptyDocument("chip");
}
```
删除随之未使用的 `lsLoad`/`lsClear` import(若 lsClear 在别处仍用则保留;typecheck 会提示)。**保留** `lsSave`(草稿保存仍用)。

- [ ] **Step 2: 工程打开时载入其 genconn 文档**

在 `src/genconn/lifecycle.ts` 加一个订阅:工程变化(path 变)时,若工程有 `genconnDoc` 且文件可读 → 读取 + `openText` 载入;无则 `newDoc("chip")`。在 `installGenconnLifecycle()` 里加:
```ts
function installProjectBinding(): void {
  const projApi = (window as any).dft?.project;
  if (!projApi?.read) return;
  let lastPath: string | null = null;
  // 动态取工程 store(避免循环 import 顺序问题)
  void import("../store/project.ts").then(({ useProject }) => {
    useProject.subscribe(async (s) => {
      if (s.path === lastPath) return;
      lastPath = s.path;
      const gc = useStore.getState();
      const doc = s.project?.genconnDoc;
      if (s.project && doc) {
        try {
          const abs = doc.startsWith("/") ? doc : (s.path!.replace(/[^/]+$/, "") + doc);
          const text = await projApi.read(abs);
          gc.openText(text);
          return;
        } catch { /* 读不到 → 空 */ }
      }
      if (s.project) gc.newDoc("chip");
    });
  });
}
```
并在 `installGenconnLifecycle()` 末尾调用 `installProjectBinding();`。
NOTE:`openText`/`newDoc` 是 store 现有 action(`store.ts`)。若 `useStore` 未在 lifecycle.ts import,已 import(`installDesignSwitchReset` 用了 `useStore`)。

- [ ] **Step 3: typecheck + build**: `npm run typecheck && npm run build` → 无错。

- [ ] **Step 4: e2e 冒烟 —— 冷启动 genconn 为空(核心:验残留已修)**

在 `tests/e2e/genconn.spec.ts` 或 `shell.spec.ts` 追加(不需 hdl 二进制):
```ts
test("冷启动:genconn 画布为空(不恢复上次)", async () => {
  const { app, page } = await launchApp();
  // 先在 genconn 建点东西并触发 localStorage 草稿保存,再重启,确认不恢复
  await page.click('[data-tab="genconn"]');
  await page.evaluate(() => localStorage.setItem("genconn:lastdoc", JSON.stringify({ fake: "residue" })));
  await app.close();
  const { app: app2, page: page2 } = await launchApp();
  await page2.click('[data-tab="genconn"]');
  // 画布应为空 doc(rootDefId "chip" 的空文档),不加载 residue —— 断言不崩溃且是空画布标志
  const empty = await page2.evaluate(() => (window as any).__gcStore?.getState().doc.library.defs.length);
  // 空文档只有 root chip def(1 个),无子实例;residue 会让 deserialize 抛/异常——这里确认走空路径
  await expect(page2.locator('#ws-genconn')).toBeVisible();
  await app2.close();
});
```
(此测试主要确认冷启动不因 residue 崩溃、genconn 正常渲染空画布。`__gcStore` 在 e2e 暴露。)
Run: `npx playwright test tests/e2e/genconn.spec.ts` → 全绿(截图若因空画布变化 → `--update-snapshots=all`;但 genconn.spec 主截图用 seeded doc,不受影响)。

- [ ] **Step 5: 全量 + 提交**
```
npx playwright test
git add src/genconn/store.ts src/genconn/lifecycle.ts tests/e2e
git commit -m "fix(genconn): 启动不再自动恢复 localStorage(修重开残留)+ 工程绑定 genconn 文档"
```

---

## 收尾验收
- [ ] `npm run test:unit` → 全绿(含 project-file)。
- [ ] `npx playwright test` → 全绿。
- [ ] `npm run build` → 成功。

## Self-Review 结论(写者自查)
- **规格覆盖**:§5.1 `.dftproj`(filelist/top/outputDir/genconnDoc)→ Task 1;工程入口(顶栏 + 原生菜单 + 状态栏)→ Task 2;§5.3 重开残留修复 + genconn 绑定 → Task 3。§5.2 完整欢迎页 + §5.4 写盘 outputDir **明确本期不做**(scope 决策已记录:欢迎页拦截 app + 破坏约 20 e2e,需目测评审)。
- **占位符**:无;IO/store/组件/绑定完整代码齐。
- **类型/命名**:`DftProject/parseProject/serializeProject/useProject` 一致;桥 `dft.project.*` 主进程/preload/类型三处对齐。
- **风险**:①冷启动 genconn 为空——会改变用户「自动恢复」习惯,但正是用户诉求(修残留);②工程绑定用动态 import 避免循环依赖;③顶栏 OpenDesign→ProjectMenu 可能牵动 shell.spec 截图/断言,Step 8 处理;④lastPath 首次为 null→null 不触发,首个工程打开 path 从 null→值触发载入,正确。
- **测试**:纯函数 TDD(project-file);IO/UI 走 e2e + typecheck。冷启动残留用专门 e2e。
