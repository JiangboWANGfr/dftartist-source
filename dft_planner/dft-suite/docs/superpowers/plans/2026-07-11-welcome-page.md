# 启动欢迎页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 冷启动(无设计打开)时显示一个 IDE 式两栏欢迎页(左:品牌+新建/打开工程/快速打开设计;右:最近工程),打开任何设计即消失。

**Architecture:** 纯前端。新增 `src/shell/WelcomePage.tsx`(连接型,复用 P3b 的 `useProject` + `useDesign`);`App.tsx` 在 `status==="idle"` 时渲染它取代工作区;`TopBar.tsx` 在 idle 时隐藏工作区 tab。

**Tech Stack:** React + zustand,手写 CSS(设计 token);e2e = Playwright(欢迎页 idle 可见,不需 hdl 二进制;受影响的既有测试用 `__dftStore.setState({status:"ready"})` 离开 idle)。

**规格来源:** `docs/specs/2026-07-11-welcome-page-design.md`。

**关键前置事实(已核对代码):**
- `src/shell/App.tsx`:`export function App()` 读 `const ws = useDesign(s => s.workspace)`,body 为 `<div className="body" id="ws-body"><WorkspaceBody ws={ws} /></div>`;未读 `status`。
- `src/shell/TopBar.tsx`:`.tabs` 块渲染三个 `data-tab` 按钮;组件读 `const workspace = useDesign(s => s.workspace)`。
- `useProject`(`src/store/project.ts`):`recent: string[]`、`loadRecent()`、`newProject()`、`openProject()`、`openRecent(path)`。`useDesign.openDesign({filelist})`、`window.dft.design.pickFilelist()` 已有。
- `useDesign.status`:`"idle" | "opening" | "ready" | "error"`,冷启动为 `idle`。
- 设计 token(`--sp-*/--r-*/--fs-*/--sh-*` + 颜色 `--accent/--accent-soft/--btn-bg/--iconbtn-bg/--border/--text*/--row-hover/--mono/--panel`)全在 theme.css。shell.css 已含 guide-card / proj-menu 样式(同处追加 welcome 样式,风格一致)。
- e2e:`launchApp()` 冷启动为 idle;`__dftStore`(=useDesign,zustand,含 setState)在 `?e2e=1` 暴露。受影响测试:`shell.spec.ts` 的「tab switch」、`appearance.spec.ts` 的「SpecGen 空态」「文件▾ 下拉」「重开残留」——它们在 idle 直接点 `[data-tab]`,而 idle 时 tab 隐藏 + body 是欢迎页,需先 `__dftStore.setState({status:"ready"})`。

---

## 文件结构

**新建:** `src/shell/WelcomePage.tsx`(欢迎页组件)。

**修改:**
- `src/shell/shell.css`(追加 `.welcome`/`.wl-*` 样式)。
- `src/shell/App.tsx`(idle → 欢迎页分支)。
- `src/shell/TopBar.tsx`(idle 隐藏 tab)。
- `tests/e2e/shell.spec.ts`(tab-switch 修 + 新增欢迎页用例)。
- `tests/e2e/appearance.spec.ts`(三处 idle 点 tab 前加 setState ready)。
- `tests/e2e/__screenshots__/shell-*.png`(欢迎页令首屏变化,重生成)。

---

## Task 1: WelcomePage 组件 + CSS

**Files:**
- Create: `src/shell/WelcomePage.tsx`
- Modify: `src/shell/shell.css`

- [ ] **Step 1: 创建 WelcomePage.tsx**

Create `src/shell/WelcomePage.tsx`:
```tsx
// 启动欢迎页(spec 2026-07-11):冷启动无设计时显示。左品牌+动作,右最近工程。
// 连接型 + IO 无关的动作全走 useProject/useDesign 已有 action。
import { useEffect } from "react";
import { useProject } from "../store/project.ts";
import { useDesign } from "../store/design.ts";

function baseName(p: string): string { return p.split("/").pop() ?? p; }

export function WelcomePage() {
  const recent = useProject((s) => s.recent);
  useEffect(() => { void useProject.getState().loadRecent(); }, []);

  async function quickOpenDesign() {
    const fl = await (window as any).dft?.design?.pickFilelist?.();
    if (fl) await useDesign.getState().openDesign({ filelist: fl });
  }

  return (
    <div className="welcome" data-welcome>
      <div className="wl-inner">
        <div className="wl-left">
          <div className="wl-brand">
            <span className="wl-logo" />
            <div>
              <div className="wl-title">dft-suite</div>
              <div className="wl-sub">DFT 连接 · SpecGen · Pad/BScan</div>
            </div>
          </div>
          <div className="wl-actions">
            <button className="wl-action primary" data-wl="new" onClick={() => void useProject.getState().newProject()}>
              <span className="wl-ico">＋</span>
              <span className="wl-atext"><b>新建工程</b><small>选 filelist + 输出目录</small></span>
            </button>
            <button className="wl-action" data-wl="open" onClick={() => void useProject.getState().openProject()}>
              <span className="wl-ico">📂</span>
              <span className="wl-atext"><b>打开工程</b><small>.dftproj</small></span>
            </button>
            <button className="wl-action" data-wl="quick" onClick={quickOpenDesign}>
              <span className="wl-ico">⚡</span>
              <span className="wl-atext"><b>快速打开设计</b><small>只浏览层次，不建工程</small></span>
            </button>
          </div>
        </div>
        <div className="wl-right">
          <div className="wl-recent-head">最近工程</div>
          {recent.length === 0 ? (
            <div className="wl-empty">还没有工程，点「新建工程」开始</div>
          ) : (
            <ul className="wl-recent">
              {recent.map((r) => (
                <li key={r} className="wl-rec" data-wl-recent={r} title={r} onClick={() => void useProject.getState().openRecent(r)}>
                  <span className="wl-rn">{baseName(r).replace(/\.dftproj$/, "")}</span>
                  <span className="wl-rp">{r}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 追加 CSS 到 shell.css**

在 `src/shell/shell.css` 末尾追加:
```css
/* 启动欢迎页 */
.welcome { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; padding: var(--sp-6); overflow: auto; }
.wl-inner { display: flex; gap: var(--sp-6); width: 100%; max-width: 720px; }
.wl-left { flex: 0 0 300px; display: flex; flex-direction: column; gap: var(--sp-4); padding-right: var(--sp-6); border-right: 1px solid var(--border); }
.wl-brand { display: flex; align-items: center; gap: var(--sp-3); }
.wl-logo { width: 34px; height: 34px; border-radius: 9px; background: conic-gradient(from 200deg,#4f8cff,#2dd4bf,#a371f7,#4f8cff); box-shadow: 0 0 0 1px #0006 inset; flex: none; }
.wl-title { font-size: 20px; font-weight: 700; color: var(--text-strong); }
.wl-sub { font-size: var(--fs-sm); color: var(--text-dim); }
.wl-actions { display: flex; flex-direction: column; gap: var(--sp-3); }
.wl-action { display: flex; align-items: center; gap: var(--sp-3); padding: var(--sp-3) var(--sp-4); border: 1px solid var(--border); border-radius: var(--r-md); background: var(--btn-bg); color: var(--text); cursor: pointer; text-align: left; box-shadow: var(--sh-1); }
.wl-action:hover { border-color: var(--accent); }
.wl-action.primary { border-color: var(--accent); background: var(--accent-soft); }
.wl-ico { width: 32px; height: 32px; border-radius: 8px; display: grid; place-items: center; font-size: 15px; background: var(--iconbtn-bg); flex: none; }
.wl-action.primary .wl-ico { background: var(--accent); color: #fff; }
.wl-atext { display: flex; flex-direction: column; }
.wl-atext b { font-size: var(--fs-md); color: var(--text-strong); font-weight: 600; }
.wl-atext small { font-size: var(--fs-xs); color: var(--text-dim); }
.wl-right { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--sp-2); }
.wl-recent-head { font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: .08em; color: var(--text-faint); }
.wl-empty { color: var(--text-dim); font-size: var(--fs-sm); padding: var(--sp-3) 0; }
.wl-recent { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.wl-rec { display: flex; align-items: center; gap: var(--sp-3); padding: var(--sp-2); border-radius: var(--r-sm); cursor: pointer; min-width: 0; }
.wl-rec:hover { background: var(--row-hover); }
.wl-rn { font-family: var(--mono); font-size: var(--fs-sm); color: var(--text); flex: 0 0 auto; }
.wl-rp { font-family: var(--mono); font-size: var(--fs-xs); color: var(--text-faint); margin-left: auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
@media (max-width: 640px) {
  .wl-inner { flex-direction: column; }
  .wl-left { flex: none; border-right: none; border-bottom: 1px solid var(--border); padding-right: 0; padding-bottom: var(--sp-4); }
}
```

- [ ] **Step 3: typecheck + build**: `npm run typecheck && npm run build` → 无错(WelcomePage 暂无消费者,仅确认能编译)。

- [ ] **Step 4: 提交**
```bash
git add src/shell/WelcomePage.tsx src/shell/shell.css
git commit -m "feat(welcome): 启动欢迎页组件 + 两栏样式(左动作/右最近)"
```

---

## Task 2: App 路由(idle→欢迎页)+ 顶栏 idle 隐藏 tab

**Files:**
- Modify: `src/shell/App.tsx`, `src/shell/TopBar.tsx`

- [ ] **Step 1: App.tsx —— idle 显示欢迎页**

在 `src/shell/App.tsx` 顶部 import 区加:
```tsx
import { WelcomePage } from "./WelcomePage.tsx";
```
在 `export function App() {` 内、`const ws = useDesign(s => s.workspace);` 之后加:
```tsx
  const status = useDesign(s => s.status);
```
把 body 块:
```tsx
      <div className="body" id="ws-body">
        <WorkspaceBody ws={ws} />
      </div>
```
改为:
```tsx
      <div className="body" id="ws-body">
        {status === "idle" ? <WelcomePage /> : <WorkspaceBody ws={ws} />}
      </div>
```
(其它不变;`WorkspaceBody`/`TopBar`/`StatusBar`/`DfxDialog` 保留。)

- [ ] **Step 2: TopBar.tsx —— idle 隐藏工作区 tab**

在 `src/shell/TopBar.tsx` 的 `const workspace = useDesign(s => s.workspace);` 之后加:
```tsx
  const status = useDesign(s => s.status);
```
把 `.tabs` 块:
```tsx
      <div className="tabs">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`tab${workspace === tab.id ? " active" : ""}`}
            data-tab={tab.id}
            onClick={() => useDesign.getState().setWorkspace(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
```
改为(idle 时不渲染 tab):
```tsx
      {status !== "idle" && (
        <div className="tabs">
          {TABS.map(tab => (
            <button
              key={tab.id}
              className={`tab${workspace === tab.id ? " active" : ""}`}
              data-tab={tab.id}
              onClick={() => useDesign.getState().setWorkspace(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}
```

- [ ] **Step 3: typecheck + build**: `npm run typecheck && npm run build` → 无错。

- [ ] **Step 4: 提交**
```bash
git add src/shell/App.tsx src/shell/TopBar.tsx
git commit -m "feat(welcome): App 冷启动渲染欢迎页 + 顶栏 idle 隐藏工作区 tab"
```

---

## Task 3: 更新受影响 e2e + 新增欢迎页 e2e + 重生成截图

**Files:**
- Modify: `tests/e2e/shell.spec.ts`, `tests/e2e/appearance.spec.ts`
- Modify: `tests/e2e/__screenshots__/shell-dark.png` / `shell-light.png`

- [ ] **Step 1: appearance.spec.ts —— 三处 idle 点 tab 前加 setState ready**

在 `tests/e2e/appearance.spec.ts`:
① 「SpecGen 空态」测试,把 `await page.click('[data-tab="specgen"]');`(line 6)前插一行:
```tsx
  await page.evaluate(() => (window as any).__dftStore.setState({ status: "ready" }));
```
② 「文件 ▾ 下拉」测试,把 `await page.click('[data-tab="genconn"]');`(line 17)前插同一行。
③ 「重开残留」测试,把 `await page.click('[data-tab="genconn"]');`(line 37)前插同一行。
(「toggle-theme」测试不点 tab、不受影响,不动。)

- [ ] **Step 2: shell.spec.ts —— tab-switch 测试离开 idle**

在 `tests/e2e/shell.spec.ts` 的 `test("tab switch changes workspace", ...)` 里,把:
```tsx
  const { app, page } = await launchApp();
  await page.click('[data-tab="genconn"]');
```
改为:
```tsx
  const { app, page } = await launchApp();
  await page.evaluate(() => (window as any).__dftStore.setState({ status: "ready" }));
  await page.click('[data-tab="genconn"]');
```

- [ ] **Step 3: shell.spec.ts —— 新增欢迎页 e2e**

在 `tests/e2e/shell.spec.ts` 末尾追加:
```tsx
test("welcome: 冷启动显示欢迎页 + 三动作 + 打开后消失", async () => {
  const { app, page } = await launchApp();
  // 冷启动 idle → 欢迎页可见,三个动作在,顶栏工作区 tab 隐藏
  await expect(page.locator("[data-welcome]")).toBeVisible();
  await expect(page.locator('[data-wl="new"]')).toBeVisible();
  await expect(page.locator('[data-wl="open"]')).toBeVisible();
  await expect(page.locator('[data-wl="quick"]')).toBeVisible();
  await expect(page.locator('[data-tab="genconn"]')).toHaveCount(0);
  // 离开 idle → 欢迎页消失,工作区回来,tab 出现
  await page.evaluate(() => (window as any).__dftStore.setState({ status: "ready" }));
  await expect(page.locator("[data-welcome]")).toHaveCount(0);
  await expect(page.locator('[data-tab="genconn"]')).toBeVisible();
  await app.close();
});
```

- [ ] **Step 4: 跑受影响 + 新增用例**

Run: `npm run build && npx playwright test tests/e2e/appearance.spec.ts tests/e2e/shell.spec.ts`
Expected: 全 PASS,`shell.spec` 的 `shell-*.png` 会因欢迎页首屏而失配 —— 见下步重生成。

- [ ] **Step 5: 重生成 shell 截图**

Run: `npm run build && npx playwright test tests/e2e/shell.spec.ts --update-snapshots=all`
Expected: PASS,`shell-dark.png`/`shell-light.png` 更新为欢迎页首屏。必须 `--update-snapshots=all`(mode "changed" 不重生成,repo 已知坑)。

- [ ] **Step 6: 全量 e2e 确认无回归**

Run: `npx playwright test`
Expected: 全 PASS。若别处有在 idle 操作工作区的用例失败,按同法(setState ready)修。

- [ ] **Step 7: 提交**
```bash
git add tests/e2e/appearance.spec.ts tests/e2e/shell.spec.ts tests/e2e/__screenshots__/shell-dark.png tests/e2e/__screenshots__/shell-light.png
git commit -m "test(welcome): 欢迎页 e2e + 受影响用例离开 idle(setState ready)+ 刷新 shell 截图"
```

---

## 收尾验收
- [ ] `npm run test:unit` → 全绿(本期无新单测,确认无回归 + typecheck)。
- [ ] `npx playwright test` → 全绿。
- [ ] `npm run build` → 成功。

## Self-Review 结论(写者自查)
- **规格覆盖**:§1 显示时机(status idle)→ Task 2;§2 架构(WelcomePage + App 分支 + 顶栏隐藏 tab)→ Task 1/2;§3 两栏布局 + 空态 + 窄窗 → Task 1;§4 接口(loadRecent/newProject/openProject/openRecent/quickOpen)→ Task 1;§6 测试(新增欢迎页 e2e + 更新受影响)→ Task 3。
- **占位符**:无;组件/CSS/路由/测试均完整代码。
- **类型/命名一致**:`WelcomePage` 组件;`data-welcome`/`data-wl="new|open|quick"`/`data-wl-recent` 测试钩子与 e2e 一致;`__dftStore.setState({status:"ready"})` 在四处测试用法一致。
- **测试策略**:欢迎页纯展示 → e2e(idle 可见,不需 hdl 二进制);受影响用例用 setState 离开 idle(比开真设计更轻、无二进制依赖);截图 `--update-snapshots=all`。
- **风险**:①hierarchy 工作区自身的 idle 占位("请先打开设计")在 App 级 gating 后不可达 → 死代码但无害,不删(surgical)。②若还有其它 e2e 在 idle 点 tab,Step 6 全量兜底。
