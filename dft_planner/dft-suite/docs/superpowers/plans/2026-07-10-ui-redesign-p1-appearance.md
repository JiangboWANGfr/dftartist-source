# UI 重设计 P1（外观地基）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 dft-suite 的外观打底做到位——设计系统 token、紧凑顶栏、可拖宽层次树、SpecGen 空态、genconn 工具条下拉化、原生菜单+快捷键——不改任何生成/解析/数据逻辑。

**Architecture:** 全部改动落在前端 CSS/React 与 Electron 主进程 chrome 层。颜色/尺寸走 `theme.css` 的 CSS 变量（深/浅双主题已存在，本期补 scale token）。可拖宽树复用 genconn 已验证的「CSS 变量宽度 + mousedown 拖拽 + localStorage 记忆」模式。原生菜单复用已有的 `webContents.send → preload → 渲染层监听` 通道（before-close 同款）。

**Tech Stack:** React + zustand + 手写 CSS（无组件库）；Electron 主进程（`electron/main.cjs` + `preload.cjs`）；测试 = `node --test`（单元，`npm run test:unit` 含 typecheck）+ Playwright（e2e，`npm run test:e2e`，含截图快照）。

**规格来源：** `docs/specs/2026-07-10-ui-redesign-design.md` 的 §2/§3/§4.1/§6 与 §11 的 P1 行。

**关键前置事实（已核对代码）：**
- `theme.css` 只有颜色 token；`:root`=深、`html.light`=浅；`.topbar{height:48px}`、`.tab`（下划线态）、`.tbtn`、`.iconbtn` 都在此文件。`src/main.tsx:7` 导入它。
- 层次树左栏固定：`src/hierarchy/styles.css:14` `.leftdock{flex:0 0 320px}`；无 resizer。genconn 的拖拽样板在 `src/genconn/Workspace.tsx:27-46`（`lsNum`/`dragLeft`/CSS 变量 `--left-w`）。
- SpecGen 空态：`src/specgen/Workspace.tsx:245-247`（一行灰字，硬编码 `#667085`）；调色板 `:280-293`（`.dft-palette/.dft-item/.dft-head`）。
- genconn 工具条：`src/genconn/Toolbar.tsx:66-71` 四个文件按钮（新建/打开/保存/另存为）。
- 主进程：`electron/main.cjs:18` `autoHideMenuBar:true`、当前无 `Menu`；before-close 用 `win.webContents.send("dft:app:before-close")`（`:39`）+ `ipcMain.handle`。`preload.cjs` 的 `dft.app.onBeforeClose` 是渲染层监听样板。
- e2e 启动：`tests/helpers/electron.ts` `launchApp()`（注入 `DFT_E2E=1` → URL `?e2e=1`）；`tests/e2e/shell.spec.ts` 有 `toHaveScreenshot("shell-dark.png"/"shell-light.png")` —— **凡改顶栏视觉都会让这两张快照失效，需 `--update-snapshots`。**

---

## 文件结构（本期新建 / 修改）

**新建：**
- `src/hierarchy/treeWidth.ts` — 层次树宽度的纯函数（clamp/load/save），可单元测试。
- `src/shell/GuideCard.tsx` — 通用空态引导卡（SpecGen 用，后续 P2/P3 可复用）。
- `electron/menu.cjs` — 原生菜单模板构造（纯函数 `buildMenuTemplate(send)`，可单元测试）。
- `src/shell/menuActions.ts` — 渲染层监听菜单动作并派发到 store（在 `main.tsx` 装一次）。
- 测试：`tests/unit/tree-width.test.ts`、`tests/unit/menu-template.test.ts`、`tests/e2e/appearance.spec.ts`。

**修改：**
- `src/theme/theme.css` — 新增 scale token（Task 1）；顶栏/tab 尺寸改引用 token（Task 2）。
- `src/hierarchy/Workspace.tsx` + `styles.css` — 可拖宽/可折叠左栏（Task 3）。
- `src/specgen/Workspace.tsx` + `styles.css` — 空态置灰调色板 + 引导卡（Task 4）。
- `src/genconn/Toolbar.tsx` — 文件命令收进「文件 ▾」下拉（Task 5）。
- `electron/main.cjs` + `preload.cjs` + `src/main.tsx` — 原生菜单挂载 + 渲染层派发（Task 6）。

---

## Task 1: 设计系统 scale token（theme.css）

新增间距/圆角/字号/阴影/顶栏高度 token 到深浅两套，供后续任务消费。颜色不动（当前深色 `#0d1117` 已符合 Q5-A 深邃工程方向；浅色已符合 Q5-B）。本任务只加 token + 一个防删除守卫测试。

**Files:**
- Modify: `src/theme/theme.css`（`:root` 块 `:2-22` 末尾、`html.light` 块 `:23-42` 末尾）
- Create: `tests/unit/tokens.test.ts`

- [ ] **Step 1: 写失败测试**（守卫 token 存在）

Create `tests/unit/tokens.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../../src/theme/theme.css", import.meta.url), "utf8");

const SCALE_TOKENS = [
  "--sp-1", "--sp-2", "--sp-3", "--sp-4", "--sp-5", "--sp-6",
  "--r-sm", "--r-md", "--r-lg",
  "--fs-xs", "--fs-sm", "--fs-md", "--fs-lg",
  "--sh-1", "--sh-2", "--sh-3",
  "--h-topbar",
];

test("theme.css 定义了全部 scale token", () => {
  for (const t of SCALE_TOKENS) {
    assert.ok(css.includes(t + ":"), `缺少 token ${t}`);
  }
});

test("阴影 token 深浅两套都定义（出现次数 ≥2）", () => {
  for (const t of ["--sh-1", "--sh-2", "--sh-3"]) {
    const n = css.split(t + ":").length - 1;
    assert.ok(n >= 2, `${t} 应在深浅两套各定义一次，实际 ${n}`);
  }
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `node --test tests/unit/tokens.test.ts`
Expected: FAIL（`缺少 token --sp-1`）

- [ ] **Step 3: 在 `:root` 块加 token**

在 `src/theme/theme.css` 的 `:root{...}` 内，`--menu-bg:#1a212c;`（`:12`）之后、`--c-k:` 之前插入：

```css
  /* scale tokens — spacing / radius / font-size / elevation / chrome heights */
  --sp-1:4px; --sp-2:6px; --sp-3:8px; --sp-4:12px; --sp-5:16px; --sp-6:24px;
  --r-sm:5px; --r-md:7px; --r-lg:10px;
  --fs-xs:11px; --fs-sm:12px; --fs-md:13px; --fs-lg:15px;
  --sh-1:0 1px 2px rgba(0,0,0,.4);
  --sh-2:0 4px 12px rgba(0,0,0,.45);
  --sh-3:0 8px 24px rgba(0,0,0,.5);
  --h-topbar:38px;
```

- [ ] **Step 4: 在 `html.light` 块加同名 token（阴影更浅）**

在 `html.light{...}` 内，`--menu-bg:#ffffff;`（`:33`）之后插入：

```css
  --sp-1:4px; --sp-2:6px; --sp-3:8px; --sp-4:12px; --sp-5:16px; --sp-6:24px;
  --r-sm:5px; --r-md:7px; --r-lg:10px;
  --fs-xs:11px; --fs-sm:12px; --fs-md:13px; --fs-lg:15px;
  --sh-1:0 1px 2px rgba(16,24,40,.06);
  --sh-2:0 4px 12px rgba(16,24,40,.10);
  --sh-3:0 8px 24px rgba(16,24,40,.14);
  --h-topbar:38px;
```

（间距/圆角/字号在深浅两主题相同，重复声明是有意为之，便于将来单独调浅色。）

- [ ] **Step 5: 跑测试，确认通过 + typecheck**

Run: `node --test tests/unit/tokens.test.ts && npm run typecheck`
Expected: PASS（2 测试通过），typecheck 无错。

- [ ] **Step 6: 提交**

```bash
git add src/theme/theme.css tests/unit/tokens.test.ts
git commit -m "feat(theme): 新增设计系统 scale token（间距/圆角/字号/阴影/顶栏高度）"
```

---

## Task 2: 紧凑顶栏 + 下划线式工作区 tab

顶栏 48→38px（用 `--h-topbar`），三个工作区 tab 收敛为干净的下划线样式（去掉 active 背景块），主按钮/图标按钮圆角与阴影走 token。仅改 CSS。

**Files:**
- Modify: `src/theme/theme.css`（`.topbar` `:52-54`、`.tab` `:61-65`、`.tbtn`/`.tbtn.primary` `:67-71`、`.iconbtn` `:72-73`）

- [ ] **Step 1: 顶栏高度改 token**

把 `src/theme/theme.css:52-54` 的 `.topbar` 规则：

```css
.topbar{height:48px;flex:0 0 48px;display:flex;align-items:center;
  background:linear-gradient(var(--tb1),var(--tb2));border-bottom:1px solid var(--border);
  padding:0 14px;user-select:none}
```

改为：

```css
.topbar{height:var(--h-topbar);flex:0 0 var(--h-topbar);display:flex;align-items:center;
  background:linear-gradient(var(--tb1),var(--tb2));border-bottom:1px solid var(--border);
  padding:0 var(--sp-4);user-select:none}
```

- [ ] **Step 2: tab 改纯下划线（去 active 背景块，缩字号）**

把 `:61-65` 的 `.tab` / `.tab.active`：

```css
.tab{display:flex;align-items:center;gap:7px;height:100%;padding:0 16px;font-size:13px;
  color:var(--text-dim);border-bottom:2px solid transparent}
.tab .ic{width:15px;height:15px;opacity:.85}
.tab.active{color:var(--text-strong);border-bottom-color:var(--accent);background:var(--tab-active-bg)}
```

改为：

```css
.tab{display:flex;align-items:center;gap:var(--sp-2);height:100%;padding:0 var(--sp-4);
  font-size:var(--fs-md);color:var(--text-dim);border-bottom:2px solid transparent;
  transition:color .12s}
.tab:hover{color:var(--text)}
.tab .ic{width:15px;height:15px;opacity:.85}
.tab.active{color:var(--text-strong);border-bottom-color:var(--accent)}
```

（去掉 `background:var(--tab-active-bg)` —— 纯下划线，符合 Q1-B。）

- [ ] **Step 3: 主按钮/图标按钮圆角+阴影走 token**

把 `:67-73`：

```css
.tbtn{display:flex;align-items:center;gap:7px;height:30px;padding:0 12px;font-size:12.5px;
  color:var(--text);background:var(--btn-bg);border:1px solid var(--border);border-radius:7px}
.tbtn.primary{background:linear-gradient(#2c6cff,#2358e6);border-color:#2c63d6;color:#fff;
  box-shadow:0 1px 0 #0003,0 0 0 1px #ffffff10 inset}
.tbtn .chev{opacity:.7;font-size:10px}
.iconbtn{width:30px;height:30px;display:grid;place-items:center;color:var(--text-dim);
  border:1px solid var(--border);border-radius:7px;background:var(--iconbtn-bg);margin-left:8px}
```

改为：

```css
.tbtn{display:flex;align-items:center;gap:var(--sp-2);height:28px;padding:0 var(--sp-4);
  font-size:var(--fs-sm);color:var(--text);background:var(--btn-bg);
  border:1px solid var(--border);border-radius:var(--r-md);box-shadow:var(--sh-1)}
.tbtn.primary{background:linear-gradient(#2c6cff,#2358e6);border-color:#2c63d6;color:#fff;
  box-shadow:var(--sh-1),0 0 0 1px #ffffff10 inset}
.tbtn .chev{opacity:.7;font-size:10px}
.iconbtn{width:28px;height:28px;display:grid;place-items:center;color:var(--text-dim);
  border:1px solid var(--border);border-radius:var(--r-md);background:var(--iconbtn-bg);
  margin-left:var(--sp-3)}
```

- [ ] **Step 4: 构建，确认无错**

Run: `npm run build`
Expected: 构建成功（vite 无报错）。

- [ ] **Step 5: 更新 e2e 截图快照**

顶栏视觉变了，`shell.spec.ts` 的 `shell-dark.png`/`shell-light.png` 会失配。重生成快照：

Run: `npm run build && npx playwright test tests/e2e/shell.spec.ts --update-snapshots`
Expected: 测试通过，`tests/e2e/__screenshots__/` 下两张 shell 快照被更新。
（若无 electron 运行环境跳过：`SKIP` 也可接受，见 Task 4 Step 5 备注。）

- [ ] **Step 6: 提交**

```bash
git add src/theme/theme.css tests/e2e/__screenshots__
git commit -m "feat(topbar): 顶栏压到 38px + 工作区 tab 改纯下划线（走设计 token）"
```

---

## Task 3: 层次树左栏可拖宽 + 可折叠

`.leftdock` 从固定 320px 改成 CSS 变量宽度 + 右缘拖拽 + 折叠按钮，宽度记忆到 localStorage（键 `hierarchy:leftW`）。抽纯函数便于单测。复用 genconn 的拖拽样板。

**Files:**
- Create: `src/hierarchy/treeWidth.ts`
- Create: `tests/unit/tree-width.test.ts`
- Modify: `src/hierarchy/Workspace.tsx`（`:39-56` 的返回 JSX）
- Modify: `src/hierarchy/styles.css`（`.leftdock` `:14-17` + 新增 resizer/collapse 规则）

- [ ] **Step 1: 写失败测试（纯函数 clamp/load/save）**

Create `tests/unit/tree-width.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { clampTreeWidth, TREE_W_MIN, TREE_W_MAX, TREE_W_DEFAULT } from "../../src/hierarchy/treeWidth.ts";

test("clampTreeWidth 夹在 [MIN, MAX]", () => {
  assert.equal(clampTreeWidth(10), TREE_W_MIN);
  assert.equal(clampTreeWidth(9999), TREE_W_MAX);
  assert.equal(clampTreeWidth(300), 300);
});

test("clampTreeWidth 非有限值回退默认", () => {
  assert.equal(clampTreeWidth(NaN), TREE_W_DEFAULT);
  assert.equal(clampTreeWidth(0), TREE_W_DEFAULT);
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `node --test tests/unit/tree-width.test.ts`
Expected: FAIL（找不到模块 `treeWidth.ts`）

- [ ] **Step 3: 实现纯函数模块**

Create `src/hierarchy/treeWidth.ts`:

```ts
// 层次树左栏宽度的纯逻辑（clamp + localStorage 记忆）。复用 genconn 的拖拽记忆思路，
// 但抽成纯函数以便单测。折叠态不走这里（组件本地 boolean state）。
export const TREE_W_MIN = 200;
export const TREE_W_MAX = 640;
export const TREE_W_DEFAULT = 320;
const LS_KEY = "hierarchy:leftW";

export function clampTreeWidth(px: number): number {
  if (!Number.isFinite(px) || px <= 0) return TREE_W_DEFAULT;
  return Math.max(TREE_W_MIN, Math.min(TREE_W_MAX, Math.round(px)));
}

export function loadTreeWidth(): number {
  try { return clampTreeWidth(Number(localStorage.getItem(LS_KEY))); }
  catch { return TREE_W_DEFAULT; }
}

export function saveTreeWidth(px: number): void {
  try { localStorage.setItem(LS_KEY, String(clampTreeWidth(px))); } catch { /* ignore */ }
}
```

- [ ] **Step 4: 跑测试，确认通过**

Run: `node --test tests/unit/tree-width.test.ts`
Expected: PASS（2 测试）

- [ ] **Step 5: 接线到 Workspace.tsx（拖拽 + 折叠）**

把 `src/hierarchy/Workspace.tsx` 的 import 区（`:5-11`）加：

```tsx
import { useEffect, useRef, useState } from "react";
```

（把原 `import { useEffect } from "react";` 替换为上行。）在其它 import 之后加：

```tsx
import { clampTreeWidth, loadTreeWidth, saveTreeWidth } from "./treeWidth.ts";
```

在 `export function HierarchyWorkspace() {` 内、`const status = ...` 之后加宽度/折叠 state 与拖拽处理：

```tsx
  const [treeW, setTreeW] = useState(loadTreeWidth);
  const [collapsed, setCollapsed] = useState(false);
  const treeWRef = useRef(treeW);
  treeWRef.current = treeW;

  const dragTree = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX, startW = treeWRef.current;
    const move = (ev: MouseEvent) => setTreeW(clampTreeWidth(startW + (ev.clientX - startX)));
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      saveTreeWidth(treeWRef.current);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };
```

把返回 JSX（`:39-56`）改为——左栏宽度用内联 style，折叠时收成窄条，dock-head 加折叠按钮，树后加 resizer：

```tsx
  return (
    <div className="body" style={{ flex: 1, minHeight: 0, display: "flex" }}>
      <div
        id="hier-tree"
        className={"leftdock" + (collapsed ? " collapsed" : "")}
        style={{ width: collapsed ? 28 : treeW }}
      >
        <div className="dock-head">
          <button className="dock-collapse" title={collapsed ? "展开层次树" : "折叠层次树"}
                  onClick={() => setCollapsed((v) => !v)}>
            {collapsed ? "»" : "«"}
          </button>
          {!collapsed && <>
            <button className="dock-btn" data-btn="regcount" onClick={() => void useStore.getState().openRegCountTab()}>
              寄存器统计
            </button>
            <button className="dock-btn" data-btn="pad" onClick={() => void useStore.getState().openPadTab()}>
              Pad/BScan
            </button>
          </>}
        </div>
        {!collapsed && <HierarchyTree />}
      </div>
      {!collapsed && <div className="tree-resizer" data-resize="tree" onMouseDown={dragTree} title="拖动改层次树宽度" />}
      <div id="hier-center" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <TabArea />
      </div>
      <ContextMenu />
    </div>
  );
```

- [ ] **Step 6: 改 styles.css（去固定宽 + resizer/collapse 样式）**

把 `src/hierarchy/styles.css:14-19`：

```css
#ws-hierarchy .leftdock {
  flex: 0 0 320px; display: flex; flex-direction: column; min-height: 0;
  border-right: 1px solid var(--border); background: var(--panel);
}
#ws-hierarchy .dock-head { padding: 4px 6px; border-bottom: 1px solid var(--border); }
#ws-hierarchy .dock-btn { font-size: 12px; padding: 2px 8px; cursor: pointer; }
```

改为：

```css
#ws-hierarchy .leftdock {
  flex: 0 0 auto; display: flex; flex-direction: column; min-height: 0; min-width: 0;
  border-right: 1px solid var(--border); background: var(--panel); overflow: hidden;
}
#ws-hierarchy .leftdock.collapsed { align-items: center; }
#ws-hierarchy .dock-head {
  display: flex; align-items: center; gap: var(--sp-2);
  padding: var(--sp-1) var(--sp-2); border-bottom: 1px solid var(--border);
}
#ws-hierarchy .dock-btn { font-size: var(--fs-sm); padding: 2px var(--sp-3); cursor: pointer; }
#ws-hierarchy .dock-collapse {
  font-size: var(--fs-sm); padding: 2px var(--sp-2); cursor: pointer;
  color: var(--text-dim); background: transparent; border: none;
}
#ws-hierarchy .dock-collapse:hover { color: var(--text-strong); }
#ws-hierarchy .tree-resizer {
  flex: 0 0 4px; cursor: col-resize; background: var(--border-soft);
}
#ws-hierarchy .tree-resizer:hover { background: var(--accent); }
```

- [ ] **Step 7: 构建 + typecheck**

Run: `npm run typecheck && npm run build`
Expected: 均无错。

- [ ] **Step 8: 提交**

```bash
git add src/hierarchy/treeWidth.ts tests/unit/tree-width.test.ts src/hierarchy/Workspace.tsx src/hierarchy/styles.css
git commit -m "feat(hierarchy): 层次树左栏可拖宽 + 可折叠（宽度记忆 localStorage）"
```

---

## Task 4: SpecGen 空态 —— 置灰调色板 + 三步引导卡

无 harden 时不再只显示一行灰字：照常渲染三栏骨架，左侧 IP 库置灰禁点，画布中央放三步引导卡（Q4-B 文案），按钮跳回 GenConnection。抽一个通用 `GuideCard` 组件。

**Files:**
- Create: `src/shell/GuideCard.tsx`
- Modify: `src/specgen/Workspace.tsx`（空态 `:245-247`；调色板 `:280-293`）
- Modify: `src/specgen/styles.css`（新增 disabled/引导卡样式）
- Create: `tests/e2e/appearance.spec.ts`（本任务先建，Task 5/6 追加用例）

- [ ] **Step 1: 建通用引导卡组件**

Create `src/shell/GuideCard.tsx`:

```tsx
// 通用空态引导卡：图标 + 标题 + 可选三步流程 + 主按钮。SpecGen 空态先用，后续 P2/P3 复用。
type Step = { n: number; text: string };

export function GuideCard(props: {
  icon: string;
  title: string;
  steps?: Step[];
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="guide-card" data-guide="card">
      <div className="guide-icon">{props.icon}</div>
      <div className="guide-title">{props.title}</div>
      {props.steps && (
        <div className="guide-steps">
          {props.steps.map((s) => (
            <div key={s.n} className="guide-step">
              <span className="guide-step-n">{s.n}</span>
              <span>{s.text}</span>
            </div>
          ))}
        </div>
      )}
      {props.actionLabel && (
        <button className="guide-action" onClick={props.onAction}>{props.actionLabel}</button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 空态改为三栏骨架 + 置灰调色板 + 引导卡**

在 `src/specgen/Workspace.tsx` 顶部 import 区加：

```tsx
import { GuideCard } from "../shell/GuideCard.tsx";
import { useDesign } from "../store/design.ts";
```

把 `:245-247` 的空态：

```tsx
  if (scopes.length === 0) {
    return <div className="specgen"><div className="dft-main"><div style={{ padding: 24, color: "#667085" }}>还没有 harden 加入 SpecGen。回 GenConnection，选中一个 harden，点「加入 SpecGen ▸」。</div></div></div>;
  }
```

改为：

```tsx
  if (scopes.length === 0) {
    return (
      <div className="specgen">
        <div className="dft-palette dft-palette--disabled" aria-disabled="true">
          <div className="dft-head">SSN DataPath</div>
          {DFT_CATALOG.filter((e) => e.group === "datapath").map((e) => (
            <div key={e.ipType} className="dft-item" title="先加入 harden">⬡ {e.label}</div>
          ))}
          <div className="dft-head">其他 DFT IP</div>
          {DFT_CATALOG.filter((e) => e.group === "other").map((e) => (
            <div key={e.ipType} className="dft-item" title="先加入 harden">⬡ {e.label}</div>
          ))}
        </div>
        <div className="dft-main dft-main--empty">
          <GuideCard
            icon="◇"
            title="SpecGen — 生成 DftSpecification"
            steps={[
              { n: 1, text: "打开设计" },
              { n: 2, text: "在 GenConnection 里选中 harden，点「加入 SpecGen ▸」" },
              { n: 3, text: "回到这里摆放 DFT IP、生成 spec" },
            ]}
            actionLabel="去 GenConnection 选择 →"
            onAction={() => useDesign.getState().setWorkspace("genconn")}
          />
        </div>
      </div>
    );
  }
```

- [ ] **Step 3: 加样式（置灰调色板 + 引导卡 + 居中）**

在 `src/specgen/styles.css` 末尾追加：

```css
/* 空态：调色板置灰禁点 */
#ws-specgen .specgen .dft-palette--disabled .dft-item {
  opacity: .4; cursor: not-allowed; pointer-events: none;
}
#ws-specgen .specgen .dft-main--empty { align-items: center; justify-content: center; }

/* 通用引导卡（GuideCard） */
.guide-card {
  display: flex; flex-direction: column; align-items: center; gap: var(--sp-3);
  max-width: 380px; padding: var(--sp-6); text-align: center;
  background: var(--panel-2); border: 1px solid var(--border);
  border-radius: var(--r-lg); box-shadow: var(--sh-2);
}
.guide-icon { font-size: 30px; color: var(--accent); }
.guide-title { font-size: var(--fs-lg); font-weight: 600; color: var(--text-strong); }
.guide-steps { display: flex; gap: var(--sp-4); margin: var(--sp-2) 0; }
.guide-step { display: flex; flex-direction: column; align-items: center; gap: var(--sp-2);
  width: 96px; font-size: var(--fs-xs); color: var(--text-dim); line-height: 1.5; }
.guide-step-n {
  width: 22px; height: 22px; border-radius: 50%;
  display: grid; place-items: center; font-size: var(--fs-sm);
  color: var(--text-strong); background: var(--chip-bg); border: 1px solid var(--border);
}
.guide-action {
  padding: var(--sp-2) var(--sp-4); border-radius: var(--r-md);
  background: var(--accent); color: #fff; border: none; cursor: pointer;
  font-size: var(--fs-sm); box-shadow: var(--sh-1);
}
.guide-action:hover { filter: brightness(1.08); }
```

- [ ] **Step 4: 写 e2e — 空态渲染引导卡 + 置灰库**

Create `tests/e2e/appearance.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { launchApp } from "../helpers/electron.ts";

test("SpecGen 空态：显示三步引导卡 + 置灰 IP 库（不可点）", async () => {
  const { app, page } = await launchApp();
  await page.click('[data-tab="specgen"]');
  // 引导卡在场
  await expect(page.locator('[data-guide="card"]')).toBeVisible();
  await expect(page.getByText("SpecGen — 生成 DftSpecification")).toBeVisible();
  // 调色板置灰、禁点
  const palette = page.locator("#ws-specgen .dft-palette--disabled");
  await expect(palette).toBeVisible();
  await expect(palette.locator(".dft-item").first()).toHaveCSS("pointer-events", "none");
  await app.close();
});
```

- [ ] **Step 5: 跑 e2e**

Run: `npm run build && npx playwright test tests/e2e/appearance.spec.ts`
Expected: PASS。
备注：本机若无 Electron/显示环境导致 Playwright 无法启动，记录为 `SKIP` 并在 PR 描述里注明「e2e 待 CI 跑」——但 `npm run typecheck && npm run build` 必须绿。

- [ ] **Step 6: typecheck + 提交**

Run: `npm run typecheck`
Expected: 无错。

```bash
git add src/shell/GuideCard.tsx src/specgen/Workspace.tsx src/specgen/styles.css tests/e2e/appearance.spec.ts
git commit -m "feat(specgen): 空态改三栏骨架 + 置灰 IP 库 + 三步引导卡"
```

---

## Task 5: GenConnection 工具条 —— 文件命令收进「文件 ▾」下拉

把 `新建/打开/保存/另存为` 四个裸按钮收进一个「文件 ▾」下拉，工具条更干净。逻辑（onNew/onOpen/doSave）完全不动，只改渲染与包一层下拉。

**Files:**
- Modify: `src/genconn/Toolbar.tsx`（import `:3-8`、组件顶部加 state、返回 JSX `:63-71`）
- Modify: `src/genconn/styles.css`（加 `.tb-menu` 下拉样式）— 若无该文件则加到 `src/genconn/styles.css`（确认存在：`src/genconn/styles.css`）

- [ ] **Step 1: Toolbar 加下拉开合 state**

在 `src/genconn/Toolbar.tsx` 的 `const [layerOpen, setLayerOpen] = useState(false);`（`:25`）之后加：

```tsx
  const [fileOpen, setFileOpen] = useState(false);
```

- [ ] **Step 2: 把四个文件按钮替换为「文件 ▾」下拉**

把 `:64-67`（`<strong>GenConnection</strong>` 之后的四个按钮）：

```tsx
      <strong>GenConnection</strong>
      <button onClick={() => void onNew()}>新建</button>
      <button onClick={() => void onOpen()}>打开</button>
      <button onClick={() => void doSave(false)}>保存</button>
      <button onClick={() => void doSave(true)}>另存为</button>
      <span className="tb-sep" />
```

改为：

```tsx
      <strong>GenConnection</strong>
      <span className="tb-menu-wrap">
        <button className={fileOpen ? "active" : ""} onClick={() => setFileOpen((v) => !v)} title="文件操作">文件 ▾</button>
        {fileOpen && (
          <div className="tb-menu" onMouseLeave={() => setFileOpen(false)}>
            <div className="tb-menu-item" onClick={() => { setFileOpen(false); void onNew(); }}>新建<span className="tb-menu-k">⌘N</span></div>
            <div className="tb-menu-item" onClick={() => { setFileOpen(false); void onOpen(); }}>打开…<span className="tb-menu-k">⌘O</span></div>
            <div className="tb-menu-item" onClick={() => { setFileOpen(false); void doSave(false); }}>保存<span className="tb-menu-k">⌘S</span></div>
            <div className="tb-menu-item" onClick={() => { setFileOpen(false); void doSave(true); }}>另存为…<span className="tb-menu-k">⇧⌘S</span></div>
          </div>
        )}
      </span>
      <span className="tb-sep" />
```

- [ ] **Step 3: 加下拉样式（走 token，深浅自适应）**

在 `src/genconn/styles.css` 末尾追加：

```css
#ws-genconn .toolbar .tb-menu-wrap { position: relative; display: inline-block; }
#ws-genconn .toolbar .tb-menu {
  position: absolute; top: 100%; left: 0; z-index: 30; min-width: 168px;
  background: var(--menu-bg); border: 1px solid var(--border);
  border-radius: var(--r-md); box-shadow: var(--sh-2); padding: var(--sp-1);
}
#ws-genconn .toolbar .tb-menu-item {
  display: flex; align-items: center; padding: var(--sp-2) var(--sp-3);
  border-radius: var(--r-sm); cursor: pointer; font-size: var(--fs-sm); color: var(--text);
}
#ws-genconn .toolbar .tb-menu-item:hover { background: var(--row-hover); }
#ws-genconn .toolbar .tb-menu-k { margin-left: auto; color: var(--text-faint); font-size: var(--fs-xs); }
```

（`#ws-genconn` 前缀必需——genconn 样式全部作用域隔离；`.toolbar button` 既有规则会自动给「文件 ▾」触发钮上色，无需额外样式。）

- [ ] **Step 4: 构建 + typecheck**

Run: `npm run typecheck && npm run build`
Expected: 均无错。

- [ ] **Step 5: 追加 e2e —— 文件下拉可开、保存项在**

在 `tests/e2e/appearance.spec.ts` 末尾追加：

```ts
test("GenConnection 工具条：文件 ▾ 下拉展开出文件命令", async () => {
  const { app, page } = await launchApp();
  await page.click('[data-tab="genconn"]');
  await page.getByRole("button", { name: "文件 ▾" }).click();
  await expect(page.getByText("另存为…")).toBeVisible();
  await expect(page.getByText("保存", { exact: true })).toBeVisible();
  await app.close();
});
```

Run: `npm run build && npx playwright test tests/e2e/appearance.spec.ts`
Expected: PASS（或按 Task 4 Step 5 备注记 SKIP）。

- [ ] **Step 6: 提交**

```bash
git add src/genconn/Toolbar.tsx src/genconn/styles.css tests/e2e/appearance.spec.ts
git commit -m "feat(genconn): 工具条文件命令收进「文件 ▾」下拉（走设计 token）"
```

---

## Task 6: 原生应用菜单 + 键盘快捷键

Electron 主进程构造原生菜单（文件/编辑/视图/帮助）带 accelerator，点击/快捷键通过 IPC 发到渲染层派发到已有 store action。抽 `buildMenuTemplate(send)` 纯函数便于单测。不新增业务逻辑，只多一个触发入口。

**Files:**
- Create: `electron/menu.cjs`
- Create: `tests/unit/menu-template.test.ts`
- Modify: `electron/main.cjs`（`createWindow` 内挂菜单）
- Modify: `electron/preload.cjs`（`app` 段加 `onMenuAction`）
- Create: `src/shell/menuActions.ts`
- Modify: `src/main.tsx`（装一次监听）

- [ ] **Step 1: 写失败测试（菜单模板形状）**

Create `tests/unit/menu-template.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMenuTemplate } from "../../electron/menu.cjs";

test("buildMenuTemplate 收集 accelerator → action 的映射", () => {
  const sent = [];
  const tmpl = buildMenuTemplate((action) => sent.push(action));
  // 展平所有含 click 的项
  const items = tmpl.flatMap((m) => m.submenu ?? []);
  const byAccel = Object.fromEntries(
    items.filter((i) => i.accelerator && i.click).map((i) => [i.accelerator, i]),
  );
  assert.ok(byAccel["CmdOrCtrl+S"], "缺少 保存 快捷键");
  assert.ok(byAccel["CmdOrCtrl+O"], "缺少 打开 快捷键");
  // 点击触发 send(action)
  byAccel["CmdOrCtrl+S"].click();
  assert.deepEqual(sent, ["save"]);
});

test("视图菜单含三个工作区切换（accel ⌘1/2/3）", () => {
  const tmpl = buildMenuTemplate(() => {});
  const accels = tmpl.flatMap((m) => m.submenu ?? [])
    .map((i) => i.accelerator).filter(Boolean);
  assert.ok(accels.includes("CmdOrCtrl+1"));
  assert.ok(accels.includes("CmdOrCtrl+2"));
  assert.ok(accels.includes("CmdOrCtrl+3"));
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `node --test tests/unit/menu-template.test.ts`
Expected: FAIL（找不到 `electron/menu.cjs`）

- [ ] **Step 3: 实现菜单模板（纯函数，不引 electron）**

Create `electron/menu.cjs`:

```js
// 原生菜单模板：纯数据 + click→send(action)。抽出以便单测（不 require electron）。
// action 字符串与渲染层 src/shell/menuActions.ts 的 dispatch 表一一对应。
function buildMenuTemplate(send) {
  const item = (label, accelerator, action) => ({
    label, accelerator, click: () => send(action),
  });
  const isMac = process.platform === "darwin";
  return [
    ...(isMac ? [{ label: "dft-suite", submenu: [{ role: "about" }, { type: "separator" }, { role: "quit" }] }] : []),
    {
      label: "文件",
      submenu: [
        item("新建工程", "CmdOrCtrl+Shift+N", "project-new"),
        item("打开工程…", "CmdOrCtrl+Shift+O", "project-open"),
        { type: "separator" },
        item("新建", "CmdOrCtrl+N", "new"),
        item("打开…", "CmdOrCtrl+O", "open"),
        item("保存", "CmdOrCtrl+S", "save"),
        item("另存为…", "CmdOrCtrl+Shift+S", "save-as"),
      ],
    },
    {
      label: "编辑",
      submenu: [
        item("撤销", "CmdOrCtrl+Z", "undo"),
        item("重做", "CmdOrCtrl+Shift+Z", "redo"),
      ],
    },
    {
      label: "视图",
      submenu: [
        item("层次浏览", "CmdOrCtrl+1", "ws-hierarchy"),
        item("连接生成", "CmdOrCtrl+2", "ws-genconn"),
        item("SpecGen", "CmdOrCtrl+3", "ws-specgen"),
        { type: "separator" },
        item("切换主题", "CmdOrCtrl+Shift+L", "toggle-theme"),
      ],
    },
    { label: "帮助", submenu: [{ role: "toggleDevTools" }] },
  ];
}

module.exports = { buildMenuTemplate };
```

- [ ] **Step 4: 跑测试，确认通过**

Run: `node --test tests/unit/menu-template.test.ts`
Expected: PASS（2 测试）

- [ ] **Step 5: 主进程挂菜单**

在 `electron/main.cjs` 顶部 require 区（`:1-6`）加：

```js
const { Menu } = require("electron");
const { buildMenuTemplate } = require("./menu.cjs");
```

（`Menu` 也可并入首行的解构 `const { app, BrowserWindow, ipcMain, shell, dialog, Menu } = require("electron");` —— 二选一，别重复声明。）

在 `createWindow()` 内、`win.webContents.setWindowOpenHandler(...)` 那行之后加：

```js
  const menu = Menu.buildFromTemplate(
    buildMenuTemplate((action) => {
      if (win && !win.isDestroyed()) win.webContents.send("dft:menu:action", action);
    }),
  );
  Menu.setApplicationMenu(menu);
```

（`autoHideMenuBar:true` 保留：mac 顶部菜单栏正常显示；Win/Linux 下 Alt 唤出。）

- [ ] **Step 6: preload 暴露菜单动作监听**

在 `electron/preload.cjs` 的 `app:` 段（`onBeforeClose` 同级）加一行：

```js
    onMenuAction: (handler) => ipcRenderer.on("dft:menu:action", (_e, action) => handler(action)),
```

- [ ] **Step 7: 渲染层派发表**

Create `src/shell/menuActions.ts`:

```ts
// 把原生菜单动作派发到已有 store。仅是「多一个触发入口」，不新增业务逻辑。
// genconn 的文件命令（new/open/save）沿用 genconn 快捷键既有实现——这里只覆盖
// 一定跨工作区可用的动作（切工作区 / 主题）。文件类动作转发到 genconn store 已有 action。
import { useDesign } from "../store/design.ts";
import { useStore as useGenconnStore } from "../genconn/store.ts";

export function installMenuActions(): void {
  const app = (window as any).dft?.app;
  if (!app?.onMenuAction) return; // 非 Electron / 旧 preload
  app.onMenuAction((action: string) => {
    switch (action) {
      case "ws-hierarchy": useDesign.getState().setWorkspace("hierarchy"); break;
      case "ws-genconn": useDesign.getState().setWorkspace("genconn"); break;
      case "ws-specgen": useDesign.getState().setWorkspace("specgen"); break;
      case "toggle-theme": {
        const cur = useDesign.getState().theme;
        useDesign.getState().setTheme(cur === "dark" ? "light" : "dark");
        break;
      }
      case "undo": useGenconnStore.temporal.getState().undo(); break;
      case "redo": useGenconnStore.temporal.getState().redo(); break;
      // new/open/save/save-as/project-*：P1 暂只切到 genconn 工作区，具体命令 P3 工程模型接入。
      case "new": case "open": case "save": case "save-as":
      case "project-new": case "project-open":
        useDesign.getState().setWorkspace("genconn");
        break;
    }
  });
}
```

- [ ] **Step 8: main.tsx 装一次**

在 `src/main.tsx` 的 `import { installGenconnLifecycle } ...` 之后加：

```tsx
import { installMenuActions } from "./shell/menuActions.ts";
```

在 `installGenconnLifecycle();` 之后加：

```tsx
installMenuActions();
```

- [ ] **Step 9: typecheck + 构建 + 单元全跑**

Run: `npm run typecheck && npm run build && node --test tests/unit/menu-template.test.ts`
Expected: 均通过。

- [ ] **Step 10: e2e —— 菜单动作切换主题（走 IPC 通道）**

在 `tests/e2e/appearance.spec.ts` 末尾追加（直接经渲染层监听验证派发链路，不依赖真实菜单点击）：

```ts
test("菜单动作 toggle-theme 经 IPC 切换主题 class", async () => {
  const { app, page } = await launchApp();
  const before = await page.evaluate(() => document.documentElement.classList.contains("light"));
  // 模拟主进程发来的菜单动作（渲染层 installMenuActions 已监听 dft:menu:action）
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].webContents.send("dft:menu:action", "toggle-theme");
  });
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains("light")))
    .toBe(!before);
  await app.close();
});
```

Run: `npm run build && npx playwright test tests/e2e/appearance.spec.ts`
Expected: PASS（或按 Task 4 Step 5 备注记 SKIP）。

- [ ] **Step 11: 提交**

```bash
git add electron/menu.cjs electron/main.cjs electron/preload.cjs src/shell/menuActions.ts src/main.tsx tests/unit/menu-template.test.ts tests/e2e/appearance.spec.ts
git commit -m "feat(shell): 原生应用菜单 + 键盘快捷键（切工作区/主题/撤销重做，走 IPC 派发）"
```

---

## 收尾验收

- [ ] **全量单元 + typecheck**

Run: `npm run test:unit`
Expected: typecheck 通过 + 所有 `node --test` 通过（含新增 tokens/tree-width/menu-template）。

- [ ] **构建**

Run: `npm run build`
Expected: 成功。

- [ ] **e2e（有环境时）**

Run: `npm run test:e2e`
Expected: 通过；`shell.spec.ts` 快照已在 Task 2 更新。无 Electron 环境则记录 SKIP，留 CI 跑。

---

## Self-Review 结论（写者自查）

- **规格覆盖**：§2 设计系统→Task 1；§3.1 顶栏+tab→Task 2；§3.2 原生菜单/快捷键→Task 6；§3.3 状态栏→**本期未单列**（状态栏仅配色随 token 自动继承，无结构改动，若需重写文案留到 §10 收尾期，已在 spec P1「顶栏/菜单/状态栏」范围内但无独立结构任务——如需显式重排状态栏，可加一个小任务，当前判断不必要）；§4.1 可拖宽树→Task 3；§6 SpecGen 空态→Task 4；工具条下拉化（Q2 UI 部分）→Task 5。**§4.2「+▾」功能下拉属 P2，不在本期**（regcount/pad 按钮保留在 dock-head，Task 3 已保留）。
- **占位符扫描**：无 TBD；每个改动步骤都给了完整代码与确切行号。
- **类型/命名一致**：`clampTreeWidth/loadTreeWidth/saveTreeWidth`（Task 3）跨步一致；`buildMenuTemplate`（Task 6）单测与实现同名；菜单 action 字符串在 `menu.cjs` 与 `menuActions.ts` 两侧一一对应（ws-hierarchy/ws-genconn/ws-specgen/toggle-theme/undo/redo/new/open/save/save-as/project-new/project-open）。
- **测试策略**：有真实逻辑的（token 守卫、宽度 clamp、菜单模板）走 TDD 单元；纯视觉/交互走 build + Playwright e2e，并注明快照更新与无环境时的 SKIP 兜底。
