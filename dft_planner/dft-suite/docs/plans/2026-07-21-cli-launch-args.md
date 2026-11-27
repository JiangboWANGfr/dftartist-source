# CLI 启动参数(--projectpath/--harden/--filelist) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 打包后的 dft-suite(及 dev 模式)支持 `--projectpath <dir> --harden <name> [--filelist <file>]` 启动：`<projectpath>/<harden>` 自动成为工程目录(.dftproj 树根)，filelist 传了自动建/开工程，没传则用户 load filelist 后自动在该目录建工程；已有工程 + CLI filelist 不一致时命令行优先覆盖。

**Architecture:** 主进程新增纯函数 `parseLaunchArgs`(electron/argv.cjs，可单测)扫描 argv；main.cjs 启动时解析 + mkdir + 扫已有 .dftproj，经新 IPC `dft:app:launchOptions` 一次性交给 renderer；renderer 侧把"建工程"逻辑从 `newProject` 抽成无对话框的 `createProjectAt`，新增 `initFromLaunch`(启动分派)与 `openFilelist`(load filelist 统一入口 + `pendingLaunchDir` 模式)。

**Tech Stack:** Electron main(CJS + .d.cts 声明)、TypeScript/React/zustand、`node --test` + `node:assert/strict` 单测、Playwright e2e(`tests/helpers/electron.ts` 的 `launchApp`)。

**基线:** 分支 `feat/cli-launch-args`。设计真源：`docs/specs/2026-07-21-cli-launch-args-design.md`。

---

## 文件结构(本计划触碰)

| 文件 | 责任 | 动作 |
|---|---|---|
| `electron/argv.cjs` | argv 纯解析(成对校验/`=`写法/resolve) | 新建 |
| `electron/argv.d.cts` | 上者的 TS 声明(仓库既有 .cjs+.d.cts 模式) | 新建 |
| `electron/main.cjs` | 启动解析、mkdir、扫 .dftproj、launchOptions IPC | 改 |
| `electron/preload.cjs` | 暴露 `dft.app.launchOptions()` | 改 |
| `src/core-bridge/dft.d.ts` | bridge 类型 | 改 |
| `src/store/project.ts` | `createProjectAt` 抽取 + `pendingLaunchDir` + `initFromLaunch` + `openFilelist` | 改 |
| `src/main.tsx` | 启动调 `initFromLaunch`；e2e 暴露 `__projStore` | 改 |
| `src/shell/WelcomePage.tsx` | quickOpen 走 `openFilelist`；launch-dir 提示行 | 改 |
| `src/shell/ProjectMenu.tsx` | quickOpen 走 `openFilelist` | 改 |
| `src/shell/shell.css` | `.wl-launch-dir` 样式 | 改 |
| `tests/unit/argv.test.ts` | 解析回归 | 新建 |
| `tests/helpers/electron.ts` | `launchApp` 加 `extraArgs` | 改 |
| `tests/fixtures/soc2.f` | 覆盖场景用第二个 filelist | 新建 |
| `tests/e2e/launch-args.spec.ts` | 三条启动链路 e2e | 新建 |
| `docs/PACKAGING.md` | 启动参数使用说明 | 改 |

---

## Task 1: argv 纯解析(electron/argv.cjs) — TDD

**Files:**
- Test: `tests/unit/argv.test.ts`(新建)
- Create: `electron/argv.cjs`
- Create: `electron/argv.d.cts`

- [ ] **Step 1: 写失败测试**

创建 `tests/unit/argv.test.ts`：

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLaunchArgs, USAGE } from "../../electron/argv.cjs";

test("无参数 → 全 null", () => {
  assert.deepEqual(parseLaunchArgs(["/app/dft-suite"], "/cwd"), { projectDir: null, filelist: null });
});

test("成对 --projectpath/--harden → 拼接 projectDir", () => {
  assert.deepEqual(
    parseLaunchArgs(["exe", "--projectpath", "/proj", "--harden", "h1"], "/cwd"),
    { projectDir: "/proj/h1", filelist: null });
});

test("--key=value 写法", () => {
  assert.deepEqual(
    parseLaunchArgs(["exe", "--projectpath=/proj", "--harden=h1", "--filelist=/a/b.f"], "/cwd"),
    { projectDir: "/proj/h1", filelist: "/a/b.f" });
});

test("相对路径按 cwd resolve", () => {
  assert.deepEqual(
    parseLaunchArgs(["exe", "--projectpath", "proj", "--harden", "h1", "--filelist", "x.f"], "/base"),
    { projectDir: "/base/proj/h1", filelist: "/base/x.f" });
});

test("单独 --filelist：只给 filelist", () => {
  assert.deepEqual(parseLaunchArgs(["exe", "--filelist", "/a.f"], "/cwd"), { projectDir: null, filelist: "/a.f" });
});

test("只传 --projectpath → error", () => {
  const r = parseLaunchArgs(["exe", "--projectpath", "/proj"], "/cwd");
  assert.ok("error" in r && r.error.includes("成对"));
});

test("只传 --harden → error", () => {
  const r = parseLaunchArgs(["exe", "--harden", "h1"], "/cwd");
  assert.ok("error" in r && r.error.includes("成对"));
});

test("flag 缺值 → error", () => {
  const r = parseLaunchArgs(["exe", "--projectpath"], "/cwd");
  assert.ok("error" in r);
});

test("值位置出现下一个 flag → error(不吞 flag)", () => {
  const r = parseLaunchArgs(["exe", "--projectpath", "--harden", "h1"], "/cwd");
  assert.ok("error" in r);
});

test("未知参数(chromium/user-data-dir)忽略", () => {
  assert.deepEqual(
    parseLaunchArgs(["exe", "--user-data-dir=/tmp/x", "--no-sandbox", "--projectpath", "/p", "--harden", "h"], "/cwd"),
    { projectDir: "/p/h", filelist: null });
});

test("USAGE 非空", () => {
  assert.ok(USAGE.includes("--projectpath"));
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/unit/argv.test.ts`
Expected: FAIL(Cannot find module '../../electron/argv.cjs')

- [ ] **Step 3: 实现 electron/argv.cjs**

```js
// CLI 启动参数纯解析(spec docs/specs/2026-07-21-cli-launch-args-design.md §1-§2)。
// 扫描整个 argv 找已知 flag——位置无关，天然忽略 electron/chromium 自身参数
// 与打包(argv[0]=exe)/dev(electron main.cjs ...)前缀差异。
const path = require("node:path");

const USAGE = `usage: dft-suite [--projectpath <dir> --harden <name>] [--filelist <file>]
  --projectpath <dir>   工程根目录(必须与 --harden 成对出现)
  --harden <name>       harden 名；工程目录 = <projectpath>/<harden>
  --filelist <file>     设计 filelist(可选；不传则启动后手动 load)
`;

const KEYS = ["projectpath", "harden", "filelist"];

/** @param {string[]} argv @param {string} cwd
 *  @returns {{projectDir:string|null, filelist:string|null} | {error:string}} */
function parseLaunchArgs(argv, cwd) {
  const got = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (typeof a !== "string" || !a.startsWith("--")) continue;
    const eq = a.indexOf("=");
    const key = eq >= 0 ? a.slice(2, eq) : a.slice(2);
    if (!KEYS.includes(key)) continue;
    const val = eq >= 0 ? a.slice(eq + 1) : argv[++i];
    if (typeof val !== "string" || val === "" || val.startsWith("--")) return { error: `--${key} 缺少取值` };
    got[key] = val;
  }
  if ((got.projectpath == null) !== (got.harden == null)) {
    return { error: "--projectpath 与 --harden 必须成对出现" };
  }
  return {
    projectDir: got.projectpath != null ? path.join(path.resolve(cwd, got.projectpath), got.harden) : null,
    filelist: got.filelist != null ? path.resolve(cwd, got.filelist) : null,
  };
}

module.exports = { parseLaunchArgs, USAGE };
```

创建 `electron/argv.d.cts`：

```ts
export declare const USAGE: string;
export declare function parseLaunchArgs(
  argv: string[],
  cwd: string,
): { projectDir: string | null; filelist: string | null } | { error: string };
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test tests/unit/argv.test.ts`
Expected: 全 PASS(11 tests)

- [ ] **Step 5: 提交**

```bash
git add electron/argv.cjs electron/argv.d.cts tests/unit/argv.test.ts
git commit -m "feat(shell): CLI 启动参数纯解析 parseLaunchArgs(--projectpath/--harden/--filelist)"
```

---

## Task 2: main.cjs 启动集成 + launchOptions IPC + preload/类型

**Files:**
- Modify: `electron/main.cjs`(顶部 require、启动解析段、whenReady)
- Modify: `electron/preload.cjs:40-46`(app 段)
- Modify: `src/core-bridge/dft.d.ts:41-48`(app 段)

- [ ] **Step 1: main.cjs 顶部加 require**

在 `const { buildMenuTemplate } = require("./menu.cjs");` 之后：

```js
const { parseLaunchArgs, USAGE } = require("./argv.cjs");
```

- [ ] **Step 2: main.cjs 加启动解析段**

在 `let closeFallback = null;` 行之后插入：

```js
// —— CLI 启动参数(spec 2026-07-21)：<projectpath>/<harden> = 工程目录，--filelist 可选 ——
const parsedArgs = parseLaunchArgs(process.argv, process.cwd());
if ("error" in parsedArgs) {
  process.stderr.write(`${parsedArgs.error}\n${USAGE}`);
  process.exit(2);
}
const launchOptions = { projectDir: null, filelist: null, existingProj: null, warning: null };

// mkdir/扫描放 whenReady 前的异步 init：失败降级为 warning，不阻断启动。
async function initLaunchOptions() {
  const warns = [];
  if (parsedArgs.projectDir) {
    try {
      await fs.mkdir(parsedArgs.projectDir, { recursive: true });
      launchOptions.projectDir = parsedArgs.projectDir;
      const names = (await fs.readdir(parsedArgs.projectDir)).filter((n) => n.endsWith(".dftproj")).sort();
      if (names[0]) launchOptions.existingProj = path.join(parsedArgs.projectDir, names[0]);
    } catch (err) {
      warns.push(`无法创建工程目录 ${parsedArgs.projectDir}: ${err && err.message ? err.message : err}`);
    }
  }
  if (parsedArgs.filelist) {
    try { await fs.access(parsedArgs.filelist); launchOptions.filelist = parsedArgs.filelist; }
    catch { warns.push(`filelist 不存在: ${parsedArgs.filelist}`); }
  }
  if (warns.length) launchOptions.warning = warns.join("\n");
}

ipcMain.handle("dft:app:launchOptions", () => launchOptions);
```

- [ ] **Step 3: whenReady 先 init 再开窗**

把

```js
app.whenReady().then(() => {
  createWindow();
```

改为

```js
app.whenReady().then(async () => {
  await initLaunchOptions();
  createWindow();
```

- [ ] **Step 4: preload.cjs app 段加一行**

在 `confirmClose: () => ipcRenderer.invoke("dft:app:close-confirm"),` 之后：

```js
    launchOptions: () => ipcRenderer.invoke("dft:app:launchOptions"),
```

- [ ] **Step 5: dft.d.ts app 段加类型**

在 `confirmClose(): Promise<void>;` 之后：

```ts
    /** CLI 启动参数(--projectpath/--harden/--filelist)；无参数时各字段为 null。 */
    launchOptions(): Promise<{
      projectDir: string | null;
      filelist: string | null;
      existingProj: string | null;
      warning: string | null;
    }>;
```

- [ ] **Step 6: 验证**

Run: `npm run typecheck && npm run test:unit`
Expected: 通过。
错误路径冒烟(可选)：`npx electron electron/main.cjs --projectpath /tmp/x; echo $?` → stderr 打印"必须成对"+ usage，退出码 2(解析失败在开窗前 exit，不会真的起 GUI)。

- [ ] **Step 7: 提交**

```bash
git add electron/main.cjs electron/preload.cjs src/core-bridge/dft.d.ts
git commit -m "feat(shell): main 启动解析 CLI 参数 + dft:app:launchOptions IPC"
```

---

## Task 3: project store — createProjectAt/initFromLaunch/openFilelist + main.tsx 接线

**Files:**
- Modify: `src/store/project.ts`
- Modify: `src/main.tsx`

- [ ] **Step 1: project.ts 接口与实现**

`ProjState` 接口加(`closeProject(): void;` 之后)：

```ts
  /** 启动参数指定了工程目录但尚无 filelist——下次 load filelist 自动在此建工程。 */
  pendingLaunchDir: string | null;
  /** 启动参数(--projectpath/--harden/--filelist)分派；非 Electron/无参数 no-op。 */
  initFromLaunch(): Promise<void>;
  /** load 一个 filelist 的统一入口：pendingLaunchDir 模式自动建工程，否则仅打开设计。 */
  openFilelist(filelist: string): Promise<void>;
```

模块级(在 `activate` 函数之后)加无对话框建工程：

```ts
/** 在 dir 下按 filelist 创建 .dftproj 并激活工程(无对话框；spec 2026-07-21 §4)。 */
async function createProjectAt(dir: string, filelist: string): Promise<void> {
  const p = (window as any).dft?.project;
  if (!p?.write) return;
  const design = (filelist.split("/").pop() ?? "chip").replace(/\.[^.]+$/, "");
  const proj: DftProject = { version: 1, filelist, top: "", outputDir: dir, genconnDoc: `Arch/${design}.arch`, specgenWorkspace: null, padCfg: null };
  const projPath = `${dir.replace(/\/$/, "")}/${design}.planner.dftproj`;
  await p.write(projPath, serializeProject(proj));
  await activate(projPath, proj);
}
```

store 实现：初始 state 加 `pendingLaunchDir: null,`；`newProject` 整体替换为：

```ts
  newProject: async () => {
    const st = useProject.getState();
    if (st.pendingLaunchDir) {
      // 启动参数模式：只选 filelist，目录用 <projectpath>/<harden>，不弹目录对话框。
      const fl = await (window as any).dft?.design?.pickFilelist?.();
      if (!fl) return;
      await createProjectAt(st.pendingLaunchDir, fl);
      set({ pendingLaunchDir: null });
      return;
    }
    const p = (window as any).dft?.project;
    if (!p?.pickNew) return;
    const pick = await p.pickNew();
    if (!pick) return;
    await createProjectAt(pick.outputDir, pick.filelist);
  },
```

(原 `newProject` 内的 design/proj/write/activate 四行被 `createProjectAt` 吸收，行为不变——`pickNew` 返回的 `projPath` 与 `createProjectAt` 内部拼的相同。)

`closeProject` 之后加两个 action：

```ts
  initFromLaunch: async () => {
    const lo = await (window as any).dft?.app?.launchOptions?.();
    if (!lo) return;
    if (lo.warning) window.alert(lo.warning);
    try {
      if (lo.existingProj) {
        // 已有工程：打开；CLI filelist 不一致 → 命令行优先，覆盖写回(top 清空，旧值对新 filelist 不可信)。
        const p = (window as any).dft.project;
        let proj = parseProject(await p.read(lo.existingProj));
        if (lo.filelist && lo.filelist !== proj.filelist) {
          proj = { ...proj, filelist: lo.filelist, top: "" };
          await p.write(lo.existingProj, serializeProject(proj));
        }
        await activate(lo.existingProj, proj);
      } else if (lo.projectDir && lo.filelist) {
        await createProjectAt(lo.projectDir, lo.filelist);
      } else if (lo.projectDir) {
        set({ pendingLaunchDir: lo.projectDir });
      } else if (lo.filelist) {
        await useDesign.getState().openDesign({ filelist: lo.filelist });
      }
    } catch (e) {
      window.alert(`启动参数处理失败：${String((e as Error)?.message ?? e)}`);
    }
  },
  openFilelist: async (filelist) => {
    const st = useProject.getState();
    if (st.pendingLaunchDir) {
      await createProjectAt(st.pendingLaunchDir, filelist);
      set({ pendingLaunchDir: null });
    } else {
      await useDesign.getState().openDesign({ filelist });
    }
  },
```

- [ ] **Step 2: main.tsx 接线**

import 区加：

```ts
import { useProject } from "./store/project.ts";
```

e2e 暴露块改为(加 `__projStore`)：

```ts
if (new URLSearchParams(window.location.search).has("e2e")) {
  const w = window as unknown as { __dftStore: typeof useDesign; __hierStore: typeof useHierStore; __gcStore: typeof useGenconnStore; __projStore: typeof useProject };
  w.__dftStore = useDesign;
  w.__hierStore = useHierStore;
  w.__gcStore = useGenconnStore;
  w.__projStore = useProject;
}
```

文件末尾 `createRoot(...).render(<App />);` 之后加：

```ts
void useProject.getState().initFromLaunch();
```

- [ ] **Step 3: 验证**

Run: `npm run typecheck && npm run test:unit`
Expected: 通过(纯接线，行为由 Task 5 e2e 验证)。

- [ ] **Step 4: 提交**

```bash
git add src/store/project.ts src/main.tsx
git commit -m "feat(shell): 启动参数分派 initFromLaunch + 无对话框建工程 createProjectAt + openFilelist"
```

---

## Task 4: UI 接线(WelcomePage/ProjectMenu 提示与统一入口)

**Files:**
- Modify: `src/shell/WelcomePage.tsx`
- Modify: `src/shell/ProjectMenu.tsx`
- Modify: `src/shell/shell.css`

- [ ] **Step 1: WelcomePage quickOpen 走 openFilelist + 提示行**

`WelcomePage.tsx`：组件内取 `const pending = useProject((s) => s.pendingLaunchDir);`(放 `const recent = ...` 旁)；`quickOpenDesign` 改为：

```ts
  async function quickOpenDesign() {
    const fl = await (window as any).dft?.design?.pickFilelist?.();
    if (fl) await useProject.getState().openFilelist(fl);
  }
```

(此文件的 `useDesign` import 随之不再使用则删除。)

`.wl-actions` 闭合 `</div>` 之后加提示行：

```tsx
          {pending && (
            <div className="wl-launch-dir" data-wl="launch-dir">
              启动参数已指定工程目录：{pending}，load filelist 后自动建工程
            </div>
          )}
```

- [ ] **Step 2: ProjectMenu quickOpen 走 openFilelist**

`ProjectMenu.tsx` 的 `quickOpenDesign` 改为：

```ts
  async function quickOpenDesign() {
    setOpen(false);
    const fl = await (window as any).dft?.design?.pickFilelist?.();
    if (fl) await useProject.getState().openFilelist(fl);
  }
```

(`useDesign` import 不再使用则删除。)

- [ ] **Step 3: shell.css 加样式**

在 `.wl-action` 相关规则之后：

```css
.wl-launch-dir { margin-top: var(--sp-3); font-size: var(--fs-xs); color: var(--text-dim); font-family: var(--mono); word-break: break-all; }
```

- [ ] **Step 4: 验证**

Run: `npm run typecheck && npm run test:unit`
Expected: 通过。

- [ ] **Step 5: 提交**

```bash
git add src/shell/WelcomePage.tsx src/shell/ProjectMenu.tsx src/shell/shell.css
git commit -m "feat(shell): 欢迎页/工程菜单 load filelist 统一走 openFilelist + launch-dir 提示"
```

---

## Task 5: e2e — 三条启动链路

**Files:**
- Modify: `tests/helpers/electron.ts`
- Create: `tests/fixtures/soc2.f`
- Test: `tests/e2e/launch-args.spec.ts`(新建)

- [ ] **Step 1: launchApp 加 extraArgs**

`tests/helpers/electron.ts` 的 `launchApp` 改为：

```ts
export async function launchApp(env: Record<string,string> = {}, extraArgs: string[] = []) {
  const userDataDir = mkdtempSync(join(tmpdir(), "dft-suite-test-"));
  const app: ElectronApplication = await electron.launch({
    args: ["electron/main.cjs", `--user-data-dir=${userDataDir}`, ...extraArgs],
    env: { ...process.env, NODE_ENV: "test", DFT_E2E: "1", ...env } as Record<string,string>,
  });
  const page: Page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  return { app, page };
}
```

- [ ] **Step 2: 第二个 fixture**

创建 `tests/fixtures/soc2.f`(与 soc.f 同目录，内容同样引用 soc.v，design 名不同即可)：

```
soc.v
```

- [ ] **Step 3: 写 e2e(先跑确认红)**

创建 `tests/e2e/launch-args.spec.ts`：

```ts
// CLI 启动参数三链路(spec 2026-07-21 §7)：带 filelist 自动建工程 /
// 无 filelist 的 pendingLaunchDir 模式 / 二次启动 CLI filelist 覆盖工程记录。
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { launchApp } from "../helpers/electron.ts";

const FILELIST = path.resolve(process.cwd(), "tests/fixtures/soc.f");
const FILELIST2 = path.resolve(process.cwd(), "tests/fixtures/soc2.f");

async function waitForFile(p: string, timeout = 15000): Promise<void> {
  const t0 = Date.now();
  while (!fs.existsSync(p)) {
    if (Date.now() - t0 > timeout) throw new Error(`timeout waiting for ${p}`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

test("带 --filelist 启动：自动建工程并激活", async () => {
  const proj = mkdtempSync(path.join(tmpdir(), "dft-launch-"));
  const { app, page } = await launchApp({}, ["--projectpath", proj, "--harden", "h1", "--filelist", FILELIST]);
  const dftproj = path.join(proj, "h1", "soc.planner.dftproj");
  await waitForFile(dftproj);
  const saved = JSON.parse(fs.readFileSync(dftproj, "utf8"));
  expect(saved.filelist).toBe(FILELIST);
  expect(saved.outputDir).toBe(path.join(proj, "h1"));
  await expect(page.locator("[data-welcome]")).toHaveCount(0); // 设计已开 → 离开欢迎页
  await app.close();
});

test("无 --filelist 启动：欢迎页提示 + load 后自动建工程", async () => {
  const proj = mkdtempSync(path.join(tmpdir(), "dft-launch-"));
  const { app, page } = await launchApp({}, ["--projectpath", proj, "--harden", "h1"]);
  await expect(page.locator('[data-wl="launch-dir"]')).toBeVisible();
  await page.evaluate((fl) => (window as any).__projStore.getState().openFilelist(fl), FILELIST);
  await waitForFile(path.join(proj, "h1", "soc.planner.dftproj"));
  await expect(page.locator('[data-wl="launch-dir"]')).toHaveCount(0); // pending 已消费
  await app.close();
});

test("二次启动 + 不同 --filelist：命令行覆盖工程记录", async () => {
  const proj = mkdtempSync(path.join(tmpdir(), "dft-launch-"));
  const dftproj = path.join(proj, "h1", "soc.planner.dftproj");
  const first = await launchApp({}, ["--projectpath", proj, "--harden", "h1", "--filelist", FILELIST]);
  await waitForFile(dftproj);
  await first.app.close();
  const second = await launchApp({}, ["--projectpath", proj, "--harden", "h1", "--filelist", FILELIST2]);
  await expect
    .poll(() => JSON.parse(fs.readFileSync(dftproj, "utf8")).filelist, { timeout: 15000 })
    .toBe(FILELIST2);
  await second.app.close();
});
```

Run: `npm run build && npx playwright test tests/e2e/launch-args.spec.ts`
Expected: 若 Task 2-4 已完成应直接绿；若先写测试(推荐顺序也可倒到 Task 2 前)则红。以绿为完成标志。

- [ ] **Step 4: 全量回归**

Run: `npm run test && npm run test:e2e`
Expected: 全绿(既有 e2e 不受 launchApp 签名扩展影响——第二参数缺省 [])。

- [ ] **Step 5: 提交**

```bash
git add tests/helpers/electron.ts tests/fixtures/soc2.f tests/e2e/launch-args.spec.ts
git commit -m "test(e2e): CLI 启动参数三链路(自动建工程/pending 模式/CLI 覆盖)"
```

---

## Task 6: 文档 + 收尾

**Files:**
- Modify: `docs/PACKAGING.md`

- [ ] **Step 1: PACKAGING.md 追加使用说明**

文件末尾追加：

```markdown
## 启动参数

打包产物(及 dev 模式)支持：

    ./dft-suite-<ver>-x86_64.AppImage --projectpath /path/to/proj --harden top_a [--filelist /path/to/x.f]

- `--projectpath` + `--harden`(必须成对)：`<projectpath>/<harden>` 即工程目录(.dftproj 与 Arch/、Spec/ 等产物树根)，不存在会自动创建；目录下已有 `.dftproj` 则直接打开。
- `--filelist`(可选)：启动即打开设计并自动建工程；不传则进软件后 load filelist 时自动在上述目录建工程(不再弹目录选择)。已有工程且 CLI filelist 不一致时以命令行为准并写回。
- 同时支持 `--key=value` 写法；相对路径按启动时 cwd 解析。
- 只传 `--projectpath`/`--harden` 其一：stderr 打印 usage 并以码 2 退出。
```

- [ ] **Step 2: 最终验证 + 提交**

Run: `npm run test && npm run test:e2e`
Expected: 全绿。

```bash
git add docs/PACKAGING.md
git commit -m "docs: 打包说明补 CLI 启动参数用法"
```
