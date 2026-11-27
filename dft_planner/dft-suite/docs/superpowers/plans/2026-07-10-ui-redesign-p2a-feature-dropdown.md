# UI 重设计 P2a（「+▾」功能下拉）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把「寄存器统计 / Pad/BScan / DFX Ctrl」的入口从层次树 dock-head 迁到中央 tab 栏右侧的「+ ▾」下拉,让功能入口可无限扩展、dock-head 更干净。

**Architecture:** 纯前端 UI。复用 P1 已验证的 `.tb-menu` 下拉视觉(class + 设计 token),在 `TabArea` 的 tab 栏加一个「+ ▾」按钮 + 下拉;下拉项调用 hierarchy store 已有的 `openRegCountTab / openPadTab / openDfxCtrlTab`(全是单例 tab,无需新逻辑)。同步移除 dock-head 里的两个功能按钮。

**Tech Stack:** React + zustand,手写 CSS(设计 token 来自 P1 的 theme.css);e2e = Playwright(层次浏览需先打开设计,故用 `__dftStore.openDesign` + hdl 二进制,缺则 skip)。

**规格来源:** `docs/specs/2026-07-10-ui-redesign-design.md` §4.2。这是 P2 的第一块(P2b 统一 Inspector、P2c GenPreview 另计划)。

**关键前置事实(已核对代码):**
- `TabArea`(`src/hierarchy/TabArea.tsx:18-42`)渲染 `<main className="work"><div className="tabbar">{tabs.map(...)}</div><div className="tabbody">...</div></main>`。「+ ▾」加在 `.tabbar` 里、tab 列表之后。
- **陷阱:** `.tabbar`(`src/hierarchy/styles.css:56-59`)带 `overflow-x:auto`(tab 多时横向滚动)——绝对定位的下拉会被它裁掉。故需把可滚动的 tab 列表拆进内层 `.tabstrip`,`.tabbar` 本身改为不裁剪。
- hierarchy store 单例开 tab 动作(`src/hierarchy/store.ts`):`openRegCountTab()`(async,`:239`)、`openPadTab()`(async,`:255`)、`openDfxCtrlTab()`(sync,`:232`;无 dfxInstances 时 tab 内显示「右键实例开始」提示,可独立打开)。
- dock-head 现有两个功能按钮:`src/hierarchy/Workspace.tsx:69-76`(P1 版,`data-btn="regcount"` / `data-btn="pad"`,外裹 `{!collapsed && <>...</>}`)。折叠按钮 `.dock-collapse` 保留。
- 下拉视觉样板:P1 的 `.tb-menu*`(`src/genconn/styles.css:302-313`,已用 `--menu-bg/--border/--r-md/--sh-2/--sp-*/--fs-sm/--row-hover` token)。hierarchy 侧新写同构的 `.tabmenu*`,作用域 `#ws-hierarchy`。
- **层次浏览需先打开设计**才渲染 TabArea(否则是「请先打开设计」占位),故 e2e 用 `__dftStore.getState().openDesign({filelist})`(见 `tests/e2e/hierarchy.spec.ts:9-25`),缺 hdl 二进制则 `test.skip`。
- 全 app 截图快照坑(P1 记录):改顶栏/dock 视觉后 `hierarchy-dark/light.png` 会失配,需 `npx playwright test tests/e2e/hierarchy.spec.ts --update-snapshots=all`(mode "changed" 不重生成)。

---

## 文件结构

**修改:**
- `src/hierarchy/TabArea.tsx` — tab 栏拆 `.tabstrip` + 加「+ ▾」下拉。
- `src/hierarchy/styles.css` — `.tabbar` 去裁剪 + 新增 `.tabstrip` / `.tabmenu*` 规则。
- `src/hierarchy/Workspace.tsx` — 移除 dock-head 两个功能按钮。
- `tests/e2e/hierarchy.spec.ts` — 追加「+▾ 打开功能页」e2e(复用文件顶部 BIN/FILELIST 常量)。
- `tests/e2e/__screenshots__/hierarchy-dark.png` / `hierarchy-light.png` — dock-head 变化后重生成。

---

## Task 1: TabArea「+ ▾」功能下拉

在 tab 栏右侧加「+ ▾」下拉,项:寄存器统计 / Pad/BScan / DFX Ctrl。为避免 `overflow-x:auto` 裁剪,把 tab 列表拆进内层 `.tabstrip`。

**Files:**
- Modify: `src/hierarchy/TabArea.tsx`
- Modify: `src/hierarchy/styles.css`
- Modify: `tests/e2e/hierarchy.spec.ts`

- [ ] **Step 1: 追加失败 e2e(先写测试)**

在 `tests/e2e/hierarchy.spec.ts` 末尾追加(文件顶部已 import `test, expect, launchApp, assertNoOverlap/Overflow, existsSync, path`,并已有 `BIN`/`FILELIST` 常量):

```ts
test("hierarchy: +▾ 下拉打开功能页（寄存器统计）", async () => {
  test.skip(!existsSync(path.join(BIN, "hdl")), "no hdl binary");
  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: BIN });
  await page.evaluate(
    (fl) => (window as any).__dftStore.getState().openDesign({ filelist: fl }),
    FILELIST,
  );
  await page.locator('#hier-tree [data-node]').first().waitFor({ timeout: 10000 });
  // 打开 +▾ 下拉，点「寄存器统计」→ regcount tab 出现在中央
  await page.locator('[data-tabmenu="btn"]').click();
  await page.locator('[data-tabmenu-item="regcount"]').click();
  await expect(page.locator('#hier-center [data-tab-kind="regcount"]')).toBeVisible({ timeout: 5000 });
  await app.close();
});
```

- [ ] **Step 2: 跑测试确认失败(或 skip)**

Run: `npm run build && npx playwright test tests/e2e/hierarchy.spec.ts -g "下拉打开功能页"`
Expected: FAIL(找不到 `[data-tabmenu="btn"]`)。若无 hdl 二进制 → SKIP(可接受,记录之;后续步骤的 typecheck/build 必须绿)。

- [ ] **Step 3: 改 TabArea.tsx — 拆 tabstrip + 加 +▾ 下拉**

把 `src/hierarchy/TabArea.tsx` 第 3 行 `import { useStore } from "./store.ts";` 之前加:

```tsx
import { useState } from "react";
```

在 `export function TabArea() {` 内、`const active = ...` 之后加:

```tsx
  const openRegCountTab = useStore((s) => s.openRegCountTab);
  const openPadTab = useStore((s) => s.openPadTab);
  const openDfxCtrlTab = useStore((s) => s.openDfxCtrlTab);
  const [menuOpen, setMenuOpen] = useState(false);
```

把返回 JSX 里的 `.tabbar` 块(当前是 `<div className="tabbar">{tabs.map(...)}</div>`)整体替换为:

```tsx
      <div className="tabbar">
        <div className="tabstrip">
          {tabs.map((t) => (
            <div
              key={t.id}
              className={"tab" + (t.id === activeTabId ? " active" : "")}
              onClick={() => setActiveTab(t.id)}
              title={t.kind === "hdl" ? `${t.file}:${t.line}` : t.kind === "ports" ? t.nodeId : t.kind === "schematic" ? t.seedNodeId : t.title}
            >
              <span className="ttitle">{t.title}</span>
              <span className="tclose" onClick={(e) => { e.stopPropagation(); closeTab(t.id); }}>×</span>
            </div>
          ))}
        </div>
        <div className="tabmenu-wrap">
          <button className="tabmenu-btn" data-tabmenu="btn" title="打开功能页" onClick={() => setMenuOpen((v) => !v)}>+ ▾</button>
          {menuOpen && (
            <div className="tabmenu" onMouseLeave={() => setMenuOpen(false)}>
              <div className="tabmenu-item" data-tabmenu-item="regcount" onClick={() => { setMenuOpen(false); void openRegCountTab(); }}>寄存器统计</div>
              <div className="tabmenu-item" data-tabmenu-item="pad" onClick={() => { setMenuOpen(false); void openPadTab(); }}>Pad/BScan</div>
              <div className="tabmenu-item" data-tabmenu-item="dfxctrl" onClick={() => { setMenuOpen(false); openDfxCtrlTab(); }}>DFX Ctrl</div>
            </div>
          )}
        </div>
      </div>
```

(仅动 `.tabbar` 块;`.tabbody` 块不变。)

- [ ] **Step 4: 改 styles.css — tabbar 去裁剪 + tabstrip + tabmenu**

把 `src/hierarchy/styles.css:56-59` 的 `.tabbar`:

```css
#ws-hierarchy .tabbar {
  display: flex; align-items: stretch; height: 36px; flex: 0 0 36px;
  background: var(--panel-3); border-bottom: 1px solid var(--border); overflow-x: auto;
}
```

改为(去掉 `overflow-x:auto`,滚动移交内层 `.tabstrip`):

```css
#ws-hierarchy .tabbar {
  display: flex; align-items: stretch; height: 36px; flex: 0 0 36px;
  background: var(--panel-3); border-bottom: 1px solid var(--border);
}
#ws-hierarchy .tabstrip {
  display: flex; align-items: stretch; flex: 1 1 auto; min-width: 0; overflow-x: auto;
}
#ws-hierarchy .tabmenu-wrap { position: relative; flex: 0 0 auto; display: flex; align-items: center; padding: 0 var(--sp-2); }
#ws-hierarchy .tabmenu-btn {
  padding: 2px var(--sp-3); border-radius: var(--r-sm); cursor: pointer;
  color: var(--text-dim); background: transparent; border: 1px solid transparent; font-size: var(--fs-sm);
}
#ws-hierarchy .tabmenu-btn:hover { color: var(--text-strong); border-color: var(--border); background: var(--btn-bg); }
#ws-hierarchy .tabmenu {
  position: absolute; top: 100%; right: 0; z-index: 30; min-width: 150px;
  background: var(--menu-bg); border: 1px solid var(--border);
  border-radius: var(--r-md); box-shadow: var(--sh-2); padding: var(--sp-1);
}
#ws-hierarchy .tabmenu-item {
  padding: var(--sp-2) var(--sp-3); border-radius: var(--r-sm); cursor: pointer;
  font-size: var(--fs-sm); color: var(--text); white-space: nowrap;
}
#ws-hierarchy .tabmenu-item:hover { background: var(--row-hover); }
```

- [ ] **Step 5: typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: 均无错。

- [ ] **Step 6: 跑 e2e 确认通过**

Run: `npx playwright test tests/e2e/hierarchy.spec.ts -g "下拉打开功能页"`
Expected: PASS(有 hdl 二进制时);否则 SKIP(记录)。

- [ ] **Step 7: 提交**

```bash
git add src/hierarchy/TabArea.tsx src/hierarchy/styles.css tests/e2e/hierarchy.spec.ts
git commit -m "feat(hierarchy): tab 栏加「+ ▾」功能下拉(寄存器统计/Pad/BScan/DFX Ctrl)"
```

---

## Task 2: 移除 dock-head 冗余功能按钮 + 刷新快照

功能入口已在 +▾,dock-head 的两个按钮冗余,移除(保留折叠按钮)。dock-head 视觉变化 → 重生成 hierarchy 截图快照。

**Files:**
- Modify: `src/hierarchy/Workspace.tsx`
- Modify: `tests/e2e/__screenshots__/hierarchy-dark.png` / `hierarchy-light.png`

- [ ] **Step 1: 移除 dock-head 两个功能按钮**

把 `src/hierarchy/Workspace.tsx:69-76`:

```tsx
          {!collapsed && <>
            <button className="dock-btn" data-btn="regcount" onClick={() => void useStore.getState().openRegCountTab()}>
              寄存器统计
            </button>
            <button className="dock-btn" data-btn="pad" onClick={() => void useStore.getState().openPadTab()}>
              Pad/BScan
            </button>
          </>}
```

改为(dock-head 只留折叠按钮 + 一个标题占位,让布局不塌):

```tsx
          {!collapsed && <span className="dock-title">层次</span>}
```

在 `src/hierarchy/styles.css` 的 `.dock-btn` 规则之后加(若已有 `.dock-title` 则跳过):

```css
#ws-hierarchy .dock-title { font-size: var(--fs-sm); color: var(--text-faint); padding: 2px var(--sp-2); }
```

- [ ] **Step 2: typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: 无错。注意:`useStore` 可能因移除按钮变成未使用——若 typecheck 报 `useStore` 未使用,检查文件其余处是否仍用到(Workspace.tsx 里 `useStore.getState().loadFromReady/reset` 等仍在用,故 import 应保留;若确无引用才删 import)。

- [ ] **Step 3: 追加 e2e 断言按钮已移除**

在 `tests/e2e/hierarchy.spec.ts` 末尾追加:

```ts
test("hierarchy: dock-head 不再有功能按钮(已迁到 +▾)", async () => {
  test.skip(!existsSync(path.join(BIN, "hdl")), "no hdl binary");
  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: BIN });
  await page.evaluate(
    (fl) => (window as any).__dftStore.getState().openDesign({ filelist: fl }),
    FILELIST,
  );
  await page.locator('#hier-tree [data-node]').first().waitFor({ timeout: 10000 });
  await expect(page.locator('.dock-head [data-btn="regcount"]')).toHaveCount(0);
  await expect(page.locator('.dock-head [data-btn="pad"]')).toHaveCount(0);
  await app.close();
});
```

- [ ] **Step 4: 重生成 hierarchy 截图快照**

Run: `npm run build && npx playwright test tests/e2e/hierarchy.spec.ts --update-snapshots=all`
Expected: 全通过,`hierarchy-dark.png`/`hierarchy-light.png` 更新。
**注意:** 必须用 `--update-snapshots=all`(不是裸 `--update-snapshots`,mode "changed" 在本环境不会重生成——P1 已踩过)。无 hdl 二进制则该快照测试 skip、快照不变,记录之。

- [ ] **Step 5: 确认无 --update 时通过**

Run: `npx playwright test tests/e2e/hierarchy.spec.ts`
Expected: 全 PASS(有二进制时)。

- [ ] **Step 6: 提交**

```bash
git add src/hierarchy/Workspace.tsx src/hierarchy/styles.css tests/e2e/hierarchy.spec.ts tests/e2e/__screenshots__/hierarchy-dark.png tests/e2e/__screenshots__/hierarchy-light.png
git commit -m "feat(hierarchy): 移除 dock-head 冗余功能按钮(入口已迁 +▾)+ 刷新快照"
```

---

## 收尾验收

- [ ] **全量单元 + typecheck**: `npm run test:unit` → 全绿。
- [ ] **全量 e2e**: `npx playwright test` → 全绿(无 hdl 二进制时相关 hierarchy 用例 skip,其余全绿)。
- [ ] **构建**: `npm run build` → 成功。

---

## Self-Review 结论(写者自查)

- **规格覆盖**:spec §4.2 的两点——① 移除 dock-head 的寄存器统计/Pad 按钮(Task 2)② tab 栏右侧「+ ▾」下拉列出寄存器统计/Pad/BScan/DFX Ctrl(Task 1)——均覆盖。§4.2 提到的「未来功能」是扩展点,当前 3 项已够,不预建空项(YAGNI)。
- **占位符扫描**:无 TBD;每步有确切行号 + 完整代码。
- **类型/命名一致**:下拉项 `data-tabmenu-item="regcount|pad|dfxctrl"` 与 store 动作 `openRegCountTab/openPadTab/openDfxCtrlTab` 对应;CSS 类 `.tabmenu*` 全 `#ws-hierarchy` 作用域,不与 genconn `.tb-menu*` 冲突。
- **测试策略**:纯 UI → Playwright e2e(需开设计,gated on hdl 二进制,缺则 skip),typecheck+build 为硬门。截图快照按 P1 教训用 `--update-snapshots=all`。
- **风险**:`overflow-x:auto` 裁剪已通过 `.tabstrip` 拆分解决;这是本计划唯一的非平凡点。
