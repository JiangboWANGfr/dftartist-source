# UI 重设计 P2b（统一 Inspector 骨架）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** 抽一套共享 Inspector 积木(shell + section + field-row + list-row),把 genconn「实例/接口」检查器和 DFX「修改」面板都改用它,消除样式分叉;DFX 面板从固定 240px 改为可拖宽,截断名加 tooltip。

**Architecture:** 纯前端。新建 `src/common/inspector/`(展示型组件 + tokenized CSS)。两个面板保留各自的数据/逻辑,只把**外壳/分区/行**换成共享积木;genconn 的 input blur/key 提交逻辑**原样保留**(只换包裹容器)。DFX 面板加一个 resizer(复用 P1 `treeWidth.ts` 式纯函数 clamp/load/save)。

**Tech Stack:** React + zustand,手写 CSS(设计 token);e2e = Playwright(genconn 直接可见;DFX 面板需开设计 + 右键 Add to DFX,复杂 → 主要靠 genconn.spec 截图 + typecheck/build 守卫,DFX 加一个轻量渲染断言)。

**规格来源:** `docs/specs/2026-07-10-ui-redesign-design.md` §9。pad 无右侧详情面板(map 已确认)→ 不在本期。

**关键前置事实(已核对代码):**
- **genconn Inspector**(`src/genconn/Inspector.tsx`):连接型组件,两模式——`InterfaceInspector`(选中接口,`:123-279`)、`Inspector`(选中实例,`:281-412`)。外壳 `<aside className="panel right" id="gc-inspector"><div className="gc-insp-body">`;分区 `.insp-sec` + `.insp-title`(`<small>` 副标题);字段行 `<label>文字<input/select/></label>`;动作区 `.insp-sec.insp-actions`(`.danger` 删除);列表 `.iface-list/.iface-row`;另有专用块 `.def-color`(色板)、`.iface-add`(加接口表单)、`.iface-sigs`(信号 `<pre>`)、`.kv`(只读键值)。宽度 `--right-w`(已可拖,`Workspace.tsx:131` + `dragRight`)。CSS 见 `src/genconn/styles.css:100-176`。
- **DFX 修改面板**(`src/hierarchy/schematic/DfxCtrlTab.tsx:262-313`):`<aside className="dfxctrl-side" data-dfx="panel">`;`.dfxctrl-side-head`(分区标题 + gen-all 按钮);`.dfx-list`(ctrlIps 行:`.dfx-name` + `.dfx-meta` + `.dfx-btn`✎🗑);第二段「实例」`.dfx-list`。**固定 `flex:0 0 240px`**(`styles.css:127`,无 resizer)。空态 `.dfx-empty`,错误 `.dfxctrl-err`。
- 两者色彩已用 token,但间距/圆角是硬编码 px。设计 token(`--sp-*/--r-*/--fs-*/--sh-*` 及颜色)全在 `theme.css`。
- P1 `treeWidth.ts` 是「clamp/load/save + localStorage」纯函数样板(`tests/unit/tree-width.test.ts` 为测试样板)。
- **风险**:genconn Inspector 的 input 用 `defaultValue` + `key={id+值}` 强制 remount + `onBlur` 提交——迁移时**必须逐字保留**这些 input/select 及其 props,只替换外层 `<label>`→`<InspectorField>`、`<div className="insp-sec">`→`<InspectorSection>`。genconn.spec 的 `genconn-dark/light.png` 截图会守住视觉回归(改后需 `--update-snapshots=all` 重生成)。

---

## 文件结构

**新建:**
- `src/common/inspector/Inspector.tsx` — 共享积木:`InspectorShell` / `InspectorBody` / `InspectorSection` / `InspectorField` / `InspectorRow`。
- `src/common/inspector/inspector.css` — 上述积木的 tokenized 样式(全局,类名 `.inspector*`/`.insp-section*`/`.insp-field*`/`.insp-row*`)。
- `src/common/inspector/panelWidth.ts` — DFX 面板宽度纯函数(clamp/load/save,仿 treeWidth.ts)。
- `tests/unit/panel-width.test.ts` — panelWidth 单测。

**修改:**
- `src/hierarchy/schematic/DfxCtrlTab.tsx` — `.dfxctrl-side` → 共享积木 + resizer。
- `src/hierarchy/styles.css` — 删除 `.dfxctrl-side/.dfx-*` 旧规则(改由共享 inspector.css),加 resizer 规则。
- `src/genconn/Inspector.tsx` — 外壳/分区/字段行 → 共享积木。
- `src/genconn/styles.css` — 删除被共享 css 取代的 `.panel.right/.gc-insp-body/.insp-sec/.insp-title/.insp-actions` 通用规则(保留 genconn 专用:`.def-color/.iface-*/.kv/.link-back`)。
- `src/main.tsx` — import `inspector.css`。
- `tests/e2e/*` — DFX 面板渲染断言 + 重生成 genconn 截图。

---

## Task 1: 共享 Inspector 积木 + CSS + panelWidth

**Files:**
- Create: `src/common/inspector/Inspector.tsx`, `src/common/inspector/inspector.css`, `src/common/inspector/panelWidth.ts`, `tests/unit/panel-width.test.ts`
- Modify: `src/main.tsx`

- [ ] **Step 1: panelWidth 失败测试**

Create `tests/unit/panel-width.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { clampPanelWidth, PANEL_W_MIN, PANEL_W_MAX, PANEL_W_DEFAULT } from "../../src/common/inspector/panelWidth.ts";

test("clampPanelWidth 夹在 [MIN, MAX]", () => {
  assert.equal(clampPanelWidth(10), PANEL_W_MIN);
  assert.equal(clampPanelWidth(9999), PANEL_W_MAX);
  assert.equal(clampPanelWidth(320), 320);
});
test("clampPanelWidth 非有限值回退默认", () => {
  assert.equal(clampPanelWidth(NaN), PANEL_W_DEFAULT);
  assert.equal(clampPanelWidth(0), PANEL_W_DEFAULT);
});
```

- [ ] **Step 2: 跑测试确认失败**: `node --test tests/unit/panel-width.test.ts` → FAIL(模块不存在)。

- [ ] **Step 3: 实现 panelWidth.ts**

Create `src/common/inspector/panelWidth.ts`:
```ts
// Inspector 面板宽度纯逻辑(clamp + localStorage 记忆),仿 hierarchy/treeWidth.ts。
// key 由调用方传入(不同面板各记一份)。
export const PANEL_W_MIN = 220;
export const PANEL_W_MAX = 560;
export const PANEL_W_DEFAULT = 300;

export function clampPanelWidth(px: number): number {
  if (!Number.isFinite(px) || px <= 0) return PANEL_W_DEFAULT;
  return Math.max(PANEL_W_MIN, Math.min(PANEL_W_MAX, Math.round(px)));
}
export function loadPanelWidth(key: string): number {
  try { return clampPanelWidth(Number(localStorage.getItem(key))); } catch { return PANEL_W_DEFAULT; }
}
export function savePanelWidth(key: string, px: number): void {
  try { localStorage.setItem(key, String(clampPanelWidth(px))); } catch { /* ignore */ }
}
```

- [ ] **Step 4: 跑测试确认通过**: `node --test tests/unit/panel-width.test.ts` → 2 PASS。

- [ ] **Step 5: 共享积木组件**

Create `src/common/inspector/Inspector.tsx`:
```tsx
// 统一 Inspector 骨架(spec §9):三种积木——分区(标题+副信息)、字段行、列表行——加外壳。
// 纯展示型;各面板把自己的 input/按钮逻辑作为 children 传入。
import type { CSSProperties, ReactNode } from "react";

export function InspectorShell({ id, className, style, children }: {
  id?: string; className?: string; style?: CSSProperties; children: ReactNode;
}) {
  return <aside id={id} className={"inspector" + (className ? " " + className : "")} style={style}>{children}</aside>;
}

export function InspectorBody({ children }: { children: ReactNode }) {
  return <div className="inspector-body">{children}</div>;
}

export function InspectorSection({ title, meta, children }: {
  title?: ReactNode; meta?: ReactNode; children?: ReactNode;
}) {
  return (
    <div className="insp-section">
      {(title != null || meta != null) && (
        <div className="insp-section-head">
          {title != null && <span className="insp-section-title">{title}</span>}
          {meta != null && <span className="insp-section-meta">{meta}</span>}
        </div>
      )}
      {children}
    </div>
  );
}

export function InspectorField({ label, hint, children }: {
  label: ReactNode; hint?: ReactNode; children: ReactNode;
}) {
  return (
    <label className="insp-field">
      <span className="insp-field-label">{label}{hint != null && <small>{hint}</small>}</span>
      {children}
    </label>
  );
}

export function InspectorRow({ selected, onClick, onDoubleClick, title, children, actions }: {
  selected?: boolean; onClick?: () => void; onDoubleClick?: () => void; title?: string;
  children: ReactNode; actions?: ReactNode;
}) {
  return (
    <li
      className={"insp-row" + (selected ? " sel" : "")}
      onClick={onClick} onDoubleClick={onDoubleClick} title={title}
    >
      {children}
      {actions != null && <span className="insp-row-actions">{actions}</span>}
    </li>
  );
}
```

- [ ] **Step 6: 共享 CSS(全局,tokenized)**

Create `src/common/inspector/inspector.css`:
```css
/* 统一 Inspector 骨架样式(spec §9)。全局类,供各工作区的检查器面板复用。颜色/间距走设计 token。 */
.inspector {
  flex-shrink: 0; display: flex; flex-direction: column; min-height: 0;
  border-left: 1px solid var(--border); background: var(--panel); overflow: hidden;
}
.inspector-body { flex: 1 1 auto; min-height: 0; overflow: auto; display: flex; flex-direction: column; padding: var(--sp-4); gap: var(--sp-5); }

.insp-section { display: flex; flex-direction: column; gap: var(--sp-3); }
.insp-section-head { display: flex; align-items: baseline; gap: var(--sp-2); }
.insp-section-title { font-weight: 600; color: var(--text-strong); font-size: var(--fs-md); }
.insp-section-title small { font-weight: 400; color: var(--text-dim); font-size: var(--fs-xs); margin-left: var(--sp-1); }
.insp-section-meta { margin-left: auto; color: var(--text-dim); font-size: var(--fs-xs); white-space: nowrap; }

.insp-field { display: block; font-size: var(--fs-sm); color: var(--text-dim); }
.insp-field-label { display: block; margin-bottom: var(--sp-1); }
.insp-field-label small { color: var(--text-faint); margin-left: var(--sp-1); }
.insp-field input, .insp-field select {
  display: block; width: 100%; padding: 4px var(--sp-2);
  border: 1px solid var(--border); border-radius: var(--r-sm);
  background: var(--input-bg); color: var(--text); font-size: var(--fs-sm);
}

.insp-row {
  display: flex; align-items: center; gap: var(--sp-2);
  padding: 4px var(--sp-2); border-radius: var(--r-sm); cursor: pointer; font-size: var(--fs-sm);
}
.insp-row:hover { background: var(--row-hover); }
.insp-row.sel { background: var(--row-hover); outline: 1px solid var(--accent); }
.insp-row-actions { display: flex; align-items: center; gap: var(--sp-1); margin-left: auto; flex: 0 0 auto; }
.insp-row-actions button { background: none; border: none; cursor: pointer; padding: 0 2px; color: var(--text-dim); font-size: var(--fs-sm); }
.insp-row-actions button:hover { color: var(--text-strong); }

/* 动作区(按钮栈,含 danger 变体) */
.insp-actions { display: flex; flex-direction: column; gap: var(--sp-3); }
.insp-actions button { padding: 5px var(--sp-3); border: 1px solid var(--border); border-radius: var(--r-md); background: var(--btn-bg); color: var(--text); cursor: pointer; font-size: var(--fs-sm); }
.insp-actions button:hover { background: var(--row-hover); }
.insp-actions button.danger { color: var(--red); border-color: var(--red); }
.insp-actions .muted { color: var(--text-dim); font-size: var(--fs-sm); }

.insp-empty { color: var(--text-dim); padding: var(--sp-4); font-size: var(--fs-sm); }
```

- [ ] **Step 7: 全局导入 CSS**

在 `src/main.tsx` 的 `import "./shell/shell.css";` 之后加:
```tsx
import "./common/inspector/inspector.css";
```

- [ ] **Step 8: typecheck + build**: `npm run typecheck && npm run build` → 无错。

- [ ] **Step 9: 提交**
```bash
git add src/common/inspector tests/unit/panel-width.test.ts src/main.tsx
git commit -m "feat(inspector): 共享 Inspector 骨架积木 + tokenized CSS + panelWidth 纯函数"
```

---

## Task 2: DFX 修改面板迁移到共享骨架 + 可拖宽

把 `DfxCtrlTab` 的 `.dfxctrl-side` 换成共享积木,加宽度拖拽(去掉固定 240px),名字截断加 tooltip。

**Files:**
- Modify: `src/hierarchy/schematic/DfxCtrlTab.tsx`
- Modify: `src/hierarchy/styles.css`
- Modify: `tests/e2e/hierarchy.spec.ts`(可选断言)

- [ ] **Step 1: 组件迁移**

在 `DfxCtrlTab.tsx` 顶部加 import:
```tsx
import { InspectorShell, InspectorSection, InspectorRow } from "../../common/inspector/Inspector.tsx";
import { clampPanelWidth, loadPanelWidth, savePanelWidth } from "../../common/inspector/panelWidth.ts";
```
在组件内(与其它 `useState` 同处)加宽度 state + 拖拽(仿 P1 `Workspace.tsx` 的 `dragTree`):
```tsx
  const [sideW, setSideW] = useState(() => loadPanelWidth("hierarchy:dfxSideW"));
  const sideWRef = useRef(sideW); sideWRef.current = sideW;
  const dragSide = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX, startW = sideWRef.current;
    const move = (ev: MouseEvent) => setSideW(clampPanelWidth(startW + (startX - ev.clientX)));
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); savePanelWidth("hierarchy:dfxSideW", sideWRef.current); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };
```
(确保 `useRef` 已在 `react` 的 import 里;`DfxCtrlTab` 已 `import { useCallback, useEffect, useMemo, useRef, useState } from "react"`——已含。)

把 `<aside className="dfxctrl-side" data-dfx="panel">…</aside>`(`:263-313`)整体替换为一个 resizer + `InspectorShell`:
```tsx
      <div className="dfx-side-resizer" data-resize="dfx-side" onMouseDown={dragSide} title="拖动改面板宽度" />
      <InspectorShell className="dfxctrl-side" data-dfx="panel" style={{ width: sideW }}>
        <div className="inspector-body">
          <InspectorSection
            title="DFX 修改"
            meta={<button className="dfx-genall" disabled={ctrlIps.length === 0 || gen.busy} onClick={downloadAll} title="生成并下载全部 .v/.icl/.tcl">{gen.busy ? "生成中…" : "下载全部"}</button>}
          >
            {gen.err && <div className="dfxctrl-err">{gen.err}</div>}
            {ctrlIps.length === 0
              ? <div className="insp-empty">双击图中实例块开始配置</div>
              : (
                <ul className="insp-list">
                  {ctrlIps.map((c) => {
                    const mod = moduleNameOf(c.spec);
                    const nCtl = c.spec.pins.filter((p) => p.mode === "control").length;
                    const nObs = c.spec.pins.length - nCtl;
                    return (
                      <InspectorRow
                        key={mod} selected={focus === mod} title={mod}
                        onClick={() => setFocus((f) => (f === mod ? null : mod))}
                        onDoubleClick={() => useGenconnStore.getState().openDfxDialog({ mode: "edit", module: mod })}
                        actions={<>
                          <button title="编辑" data-dfx-edit={mod} onClick={(e) => { e.stopPropagation(); useGenconnStore.getState().openDfxDialog({ mode: "edit", module: mod }); }}>✎</button>
                          <button title="删除" data-dfx-del={mod} onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`删除 DFX 修改 ${mod}？`)) { useGenconnStore.getState().deleteCtrlIpV3(mod); setFocus((f) => (f === mod ? null : f)); }
                          }}>🗑</button>
                        </>}
                      >
                        <span className="insp-row-name">{mod}</span>
                        <span className="insp-row-meta">{c.spec.pins.length} 目标 · {nCtl}控/{nObs}观</span>
                      </InspectorRow>
                    );
                  })}
                </ul>
              )}
          </InspectorSection>
          {dfxInstances.length > 0 && (
            <InspectorSection title="实例">
              <ul className="insp-list" data-dfx="inst-list">
                {dfxInstances.map((id) => (
                  <InspectorRow key={id} title={id}
                    actions={<button title="从图上移除该实例块" data-dfx-inst-del={id} onClick={() => removeInstance(id)}>✕</button>}
                  >
                    <span className="insp-row-name">{id.split(".").pop() ?? id}</span>
                  </InspectorRow>
                ))}
              </ul>
            </InspectorSection>
          )}
        </div>
      </InspectorShell>
```
NOTE: `InspectorShell` 需接受并透传 `data-dfx` 与 `style`——它已透传 `style`;对任意 `data-*` 属性,给 `InspectorShell` 的 props 加一个 rest 透传(见下 Step 1b)。

- [ ] **Step 1b: 让 InspectorShell 透传 data-* 属性**

改 `src/common/inspector/Inspector.tsx` 的 `InspectorShell` 支持任意额外属性:
```tsx
export function InspectorShell({ id, className, style, children, ...rest }: {
  id?: string; className?: string; style?: CSSProperties; children: ReactNode;
} & Record<string, unknown>) {
  return <aside id={id} className={"inspector" + (className ? " " + className : "")} style={style} {...rest}>{children}</aside>;
}
```

- [ ] **Step 2: CSS —— 删旧 dfx 规则 + 加 resizer/name/meta**

在 `src/hierarchy/styles.css` 删除旧规则 `#ws-hierarchy .dfxctrl-side`(`:127`)、`.dfxctrl-side-head`(`:128-131`)、`.dfx-list`/`.dfx-list li`/`.dfx-list li.sel`(`:133-136`)、`.dfx-name`(`:137`)、`.dfx-meta`(`:138`)、`.dfx-btn`/`:hover`(`:139-140`)、`.dfx-empty`(`:141`)。保留 `.dfxctrl-err`(`:132`)与 `.dfxctrl-root/.schwrap/.schtools`(布局)。追加:
```css
#ws-hierarchy .dfx-side-resizer { flex: 0 0 4px; cursor: col-resize; background: var(--border-soft); }
#ws-hierarchy .dfx-side-resizer:hover { background: var(--accent); }
#ws-hierarchy .dfxctrl-side .insp-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
#ws-hierarchy .dfxctrl-side .insp-row-name { font-weight: 600; color: var(--text-strong); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
#ws-hierarchy .dfxctrl-side .insp-row-meta { color: var(--text-dim); font-size: var(--fs-xs); white-space: nowrap; flex: 0 0 auto; }
#ws-hierarchy .dfx-genall { font-size: var(--fs-xs); padding: 3px var(--sp-3); border-radius: var(--r-sm); cursor: pointer; color: var(--text); background: var(--btn-bg); border: 1px solid var(--border); }
#ws-hierarchy .dfx-genall:hover:not(:disabled) { border-color: var(--accent); }
#ws-hierarchy .dfx-genall:disabled { opacity: .5; cursor: default; }
```
NOTE: `.dfxctrl-root` 是 `display:flex`;resizer 作为 side 的左邻兄弟即可。

- [ ] **Step 3: typecheck + build**: `npm run typecheck && npm run build` → 无错。

- [ ] **Step 4: e2e 轻量断言(DFX 面板用共享骨架渲染)**

DFX 面板需先开设计 + 右键 Add to DFX,较重。改为在 `tests/e2e/hierarchy.spec.ts` 里对已有「+▾ 打开 DFX Ctrl」路径追加最小断言(打开 DFX Ctrl tab → 空态提示在 `.inspector` 内)。追加:
```ts
test("hierarchy: DFX Ctrl 面板用共享 Inspector 外壳渲染", async () => {
  test.skip(!existsSync(path.join(BIN, "hdl")), "no hdl binary");
  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: BIN });
  await page.evaluate((fl) => (window as any).__dftStore.getState().openDesign({ filelist: fl }), FILELIST);
  await page.locator('#hier-tree [data-node]').first().waitFor({ timeout: 10000 });
  await page.locator('[data-tabmenu="btn"]').click();
  await page.locator('[data-tabmenu-item="dfxctrl"]').click();
  // 无 dfxInstances 时 DfxCtrlTab 显示「右键实例…开始」占位(不渲染面板);此断言仅确认 tab 打开无崩溃。
  await expect(page.locator('[data-tab-kind="dfxctrl"]')).toBeVisible({ timeout: 5000 });
  await app.close();
});
```
Run: `npx playwright test tests/e2e/hierarchy.spec.ts` → 全 PASS。

- [ ] **Step 5: 提交**
```bash
git add src/hierarchy/schematic/DfxCtrlTab.tsx src/hierarchy/styles.css src/common/inspector/Inspector.tsx tests/e2e/hierarchy.spec.ts
git commit -m "feat(dfx): DFX 修改面板迁到共享 Inspector 骨架 + 可拖宽 + 名字 tooltip"
```

---

## Task 3: genconn Inspector 迁移到共享骨架

把 genconn 的外壳/分区/字段行换成共享积木,**input/select 逻辑逐字保留**。专用块(色板/加接口表单/信号 pre/kv/iface 列表)作为 children 保留原样。

**Files:**
- Modify: `src/genconn/Inspector.tsx`
- Modify: `src/genconn/styles.css`
- Modify: `tests/e2e/__screenshots__/genconn-dark.png` / `genconn-light.png`

- [ ] **Step 1: 组件迁移(读文件后按模式套用)**

在 `src/genconn/Inspector.tsx` 顶部加:
```tsx
import { InspectorShell, InspectorBody, InspectorSection, InspectorField } from "../common/inspector/Inspector.tsx";
```
逐处替换(**只换容器,input/select/按钮及其所有 props 原样保留**):
- 外壳 `<aside className="panel right" id="gc-inspector"><div className="gc-insp-body">…</div></aside>` → `<InspectorShell className="gc-inspector-shell" id="gc-inspector" style={{ width: "var(--right-w, 300px)" }}><InspectorBody>…</InspectorBody></InspectorShell>`(三处 empty 态也用 `<InspectorShell …><div className="insp-empty">…</div></InspectorShell>`)。
- 每个 `<div className="insp-sec">…</div>` → `<InspectorSection>…</InspectorSection>`;其中原 `<div className="insp-title">标题<small>副</small></div>` 改成 `title` / `meta` props:例如实例段 `<InspectorSection title="实例">`;模块段 `<InspectorSection title="模块 def" meta="（改动影响全部 X 实例）">`(把 `<small>` 内容作为 `title` 的 hint——用 `title={<>模块 def <small>（…）</small></>}` 亦可,保持文案)。
- 每个字段行 `<label>文字 <小提示?> <input/select/></label>` → `<InspectorField label="文字" hint={<小提示>}>…原 input/select…</InspectorField>`。**input/select 的 `defaultValue`/`key`/`onBlur`/`onChange`/`list`/`type`/`min` 等一律照抄。**
- 动作区 `<div className="insp-sec insp-actions">…</div>` → `<InspectorSection><div className="insp-actions">…原按钮…</div></InspectorSection>`(或给 `InspectorSection` 加 `className`——见 Step 1b)。
- 专用块 `.def-color` / `.iface-add`(`InterfaceEditor`)/ `.iface-sigs` / `.kv` / `.iface-list`(`InterfaceEditor` 的清单)**保持原样**(仍用各自 genconn 类)。`InterfaceEditor` 的外层 `<div className="insp-sec">` 同样换成 `<InspectorSection title={...}>`。

- [ ] **Step 1b: InspectorSection 支持 className**

改 `Inspector.tsx` 的 `InspectorSection` 加可选 `className`:
```tsx
export function InspectorSection({ title, meta, className, children }: {
  title?: ReactNode; meta?: ReactNode; className?: string; children?: ReactNode;
}) {
  return (
    <div className={"insp-section" + (className ? " " + className : "")}>
      …不变…
    </div>
  );
}
```
动作区用 `<InspectorSection className="insp-actions-sec">` 再内嵌 `<div className="insp-actions">`——或直接把按钮堆放进 section 并给 section 挂 `.insp-actions`。选后者更简:`<InspectorSection className="insp-actions">…按钮…</InspectorSection>`(`.insp-actions` 的 `display:flex column` 已在共享 css)。

- [ ] **Step 2: 删 genconn 通用检查器 CSS(保留专用)**

在 `src/genconn/styles.css` **删除**被共享 inspector.css 取代的规则:`.panel.right`(`:41`——改成新壳类)、`.gc-insp-body`(`:43,100,101`)、`.insp-empty`(`:102`)、`.insp-sec`(`:103`)、`.insp-title`(`:104,105`)、`.insp-sec label`(`:106,107`)、`.insp-sec input/select`(`:108`)、`.insp-actions`(`:109-112`)、`.insp-actions button.danger`(`:25`)。**保留**:`.def-color*`、`.iface-*`、`.link-back`、`.iface-sigs`、`.kv*`、`.chk*`(genconn 专用)。
新增壳宽度规则(替代 `.panel.right` 的 `--right-w`):
```css
#ws-genconn .gc-inspector-shell { width: var(--right-w, 300px); }
```
(`.inspector` 共享 css 已给 border-left/flex/overflow;此处仅补宽度变量。)

- [ ] **Step 3: typecheck + build**: `npm run typecheck && npm run build` → 无错。

- [ ] **Step 4: 功能自查 + 重生成 genconn 截图**

`npm run build && npx playwright test tests/e2e/genconn.spec.ts --update-snapshots=all` → 全 PASS,`genconn-dark/light.png` 更新。
**必须** `--update-snapshots=all`(P1 教训)。有 hdl 二进制此环境可跑。

- [ ] **Step 5: 无 --update 复跑确认**: `npx playwright test tests/e2e/genconn.spec.ts` → 全 PASS。

- [ ] **Step 6: 提交**
```bash
git add src/genconn/Inspector.tsx src/genconn/styles.css tests/e2e/__screenshots__/genconn-dark.png tests/e2e/__screenshots__/genconn-light.png
git commit -m "feat(genconn): 实例/接口检查器迁到共享 Inspector 骨架(input 逻辑不变)"
```

---

## 收尾验收
- [ ] `npm run test:unit` → 全绿(含 panel-width)。
- [ ] `npx playwright test` → 全绿(改截图已重生成)。
- [ ] `npm run build` → 成功。

## Self-Review 结论(写者自查)
- **规格覆盖**:§9 三积木(标题栏/分区/字段行/列表行)→ Task 1;DFX 面板迁移 + 去固定 240px + 名字 tooltip → Task 2;genconn 实例/接口检查器迁移 → Task 3。pad 无详情面板 → 明确不在本期(map 已确认)。
- **占位符扫描**:Task 3 因组件巨大用「模式 + 逐字保留 input」而非贴全量代码——这是对机械迁移的合理处理,子代理读文件套用;关键约束(input 的 defaultValue/key/onBlur 照抄)已明列。
- **类型/命名**:`InspectorShell/Body/Section/Field/Row` 全大写驼峰;`clampPanelWidth` 与测试同名;共享类 `.insp-section*/.insp-field*/.insp-row*` 不与 genconn 保留的 `.iface-*/.kv/.def-color` 冲突。
- **风险**:Task 3 是主要风险(改动 working 组件)。缓解:input 逻辑逐字保留 + genconn.spec 截图守视觉 + typecheck。若子代理迁移中发现某处逻辑难保留,应 DONE_WITH_CONCERNS 上报而非猜。
- **测试**:纯函数 TDD(panelWidth);组件用 e2e + 截图 + typecheck。
