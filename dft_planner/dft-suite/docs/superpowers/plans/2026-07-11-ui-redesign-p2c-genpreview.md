# UI 重设计 P2c（统一 Diff 生成预览 GenPreview）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development / executing-plans. Steps use `- [ ]`.

**Goal:** 抽一个统一的生成预览组件 `GenPreview`——文件列表(新/改 标签 + ±统计)+ 内容视图(新文件全绿语法感、有 before 的文件走红删/绿增 unified diff)+ 复制/下载动作,先接入 genconn 生成结果面板。

**Architecture:** 纯前端,零新依赖。前端轻量 LCS 行 diff(`不改 dft-core`,故不依赖引擎结构化 diff)。GenPreview 为展示型 + IO 无关(复制/下载走调用方回调)。当前 genconn 生成的都是**新文件**(无 before)→ 显示「新」;红/绿修改 diff 的能力已就位,待 P3 的注入/DFX 路径提供 before 时自然生效。

**Tech Stack:** React,手写 CSS(设计 token);纯函数 diff 用 `node --test` 单测。

**规格来源:** `docs/specs/2026-07-10-ui-redesign-design.md` §7。

**设计决策(本计划拍板,记录在此):**
1. **diff 来源** = 前端轻量 LCS 行 diff(不改 dft-core CLI)。新文件(无 before)= 全部按新增渲染。
2. **结果类型归一** = `GenFile = { name; text; before? }`;pad 的单字符串产物由调用方包成 1 元素数组(pad 接入留待 P3/后续,本期只接 genconn)。
3. **IO 归一** = GenPreview 不直接落盘;复制/下载经 `onCopy(f)`/`onDownload(f)` 回调,调用方传各自实现(genconn→`downloadText`)。
4. **语法高亮** = 本期只做 diff 着色(绿增/红删/上下文)——这是用户真正要的「看清改了什么」;重量级语法高亮不做(避免加依赖)。
5. **接入范围** = 本期接 genconn `GeneratePanel`;DFX 生成预览随 P3 的 DFX 解耦一起接,pad 单串预览形态不同,暂不动。

**关键前置事实(已核对代码):**
- `src/genconn/GeneratePanel.tsx:238-249`:`<div className="genpanel-body" id="gc-genoutput"><ul className="genfiles">…</ul><pre className="genprev">{cur?.text}</pre></div>`;文件类型 `FileEntry = {name,text}`(`:74`);`sel`/`setSel` 选中态;`basename` 工具;`downloadText` from `./persist.ts`;header 有 `下载当前`(`:206`,依赖 `cur`)、`全部下载`(`:208`)、inject 两个按钮、`收起`。
- `.genpanel-body/.genfiles/.genprev` CSS 在 `src/genconn/styles.css:219-225`(`#ws-genconn` 作用域)。
- 设计 token(`--sp-*/--r-*/--fs-*/--sh-*` + 颜色 `--green/--red/--text*/--border/--panel/--row-hover/--code-bg/--mono`)全在 theme.css。绿=`--green`,红=`--red`。

---

## 文件结构

**新建:**
- `src/common/genpreview/linediff.ts` — 纯 LCS 行 diff。
- `src/common/genpreview/GenPreview.tsx` — 组件。
- `src/common/genpreview/genpreview.css` — 样式(全局,tokenized)。
- `tests/unit/linediff.test.ts` — diff 单测。

**修改:**
- `src/genconn/GeneratePanel.tsx` — body 用 GenPreview。
- `src/genconn/styles.css` — 删 `.genfiles/.genprev`(改由 GenPreview),`.genpanel-body` 简化。
- `src/main.tsx` — import genpreview.css。
- `tests/e2e/__screenshots__/genconn-*.png` — 重生成。

---

## Task 1: linediff 纯函数 + GenPreview 组件 + CSS

**Files:**
- Create: `src/common/genpreview/linediff.ts`, `tests/unit/linediff.test.ts`, `src/common/genpreview/GenPreview.tsx`, `src/common/genpreview/genpreview.css`
- Modify: `src/main.tsx`

- [ ] **Step 1: linediff 失败测试**

Create `tests/unit/linediff.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { diffLines, fileStat } from "../../src/common/genpreview/linediff.ts";

test("新文件(before=undefined)全部按新增", () => {
  const d = diffLines(undefined, "a\nb\nc");
  assert.deepEqual(d.map((l) => l.type), ["add", "add", "add"]);
  assert.deepEqual(d.map((l) => l.text), ["a", "b", "c"]);
});

test("相同内容全是上下文", () => {
  const d = diffLines("a\nb", "a\nb");
  assert.deepEqual(d.map((l) => l.type), ["ctx", "ctx"]);
});

test("一增一删", () => {
  const d = diffLines("a\nb\nc", "a\nB\nc");
  const types = d.map((l) => l.type);
  assert.ok(types.includes("del") && types.includes("add"));
  const del = d.find((l) => l.type === "del");
  const add = d.find((l) => l.type === "add");
  assert.equal(del?.text, "b");
  assert.equal(add?.text, "B");
});

test("fileStat 计数 新增/删除 + isNew", () => {
  assert.deepEqual(fileStat(undefined, "a\nb"), { added: 2, removed: 0, isNew: true });
  const s = fileStat("a\nb\nc", "a\nB\nc");
  assert.equal(s.added, 1); assert.equal(s.removed, 1); assert.equal(s.isNew, false);
});
```

- [ ] **Step 2: 跑测试确认失败**: `node --test tests/unit/linediff.test.ts` → FAIL(模块不存在)。

- [ ] **Step 3: 实现 linediff.ts**

Create `src/common/genpreview/linediff.ts`:
```ts
// 轻量 LCS 行 diff(纯函数,无依赖)。用于生成预览的改动着色。
export type DiffLine = { type: "add" | "del" | "ctx"; text: string };

/** 经典 LCS 动态规划,返回 unified 行序列。before 为空 → 全部 add(新文件)。 */
export function diffLines(before: string | undefined, after: string): DiffLine[] {
  const b = before == null ? [] : before.split("\n");
  const a = after.split("\n");
  if (b.length === 0) return a.map((text) => ({ type: "add" as const, text }));
  const n = b.length, m = a.length;
  // LCS 长度表
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = b[i] === a[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  // 回溯
  const out: DiffLine[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (b[i] === a[j]) { out.push({ type: "ctx", text: a[j] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ type: "del", text: b[i] }); i++; }
    else { out.push({ type: "add", text: a[j] }); j++; }
  }
  while (i < n) { out.push({ type: "del", text: b[i] }); i++; }
  while (j < m) { out.push({ type: "add", text: a[j] }); j++; }
  return out;
}

export function fileStat(before: string | undefined, after: string): { added: number; removed: number; isNew: boolean } {
  const d = diffLines(before, after);
  return {
    added: d.filter((l) => l.type === "add").length,
    removed: d.filter((l) => l.type === "del").length,
    isNew: before == null,
  };
}
```

- [ ] **Step 4: 跑测试确认通过**: `node --test tests/unit/linediff.test.ts` → 4 PASS。

- [ ] **Step 5: GenPreview 组件**

Create `src/common/genpreview/GenPreview.tsx`:
```tsx
// 统一生成/修改预览(spec §7):文件列表(新/改 + ±统计)+ 内容视图(diff 着色)+ 复制/下载。
// 展示型 + IO 无关:复制/下载经回调,调用方传实现。当前 genconn 生成为新文件 → 全绿「新」。
import { useState } from "react";
import { diffLines, fileStat } from "./linediff.ts";

export type GenFile = { name: string; text: string; before?: string };

function baseName(p: string): string { return p.split("/").pop() ?? p; }

export function GenPreview({ files, onCopy, onDownload }: {
  files: GenFile[];
  onCopy?: (f: GenFile) => void;
  onDownload?: (f: GenFile) => void;
}) {
  const [sel, setSel] = useState(0);
  if (files.length === 0) return <div className="genpreview-empty">没有产生文件。</div>;
  const cur = files[Math.min(sel, files.length - 1)];
  const lines = diffLines(cur.before, cur.text);

  return (
    <div className="genpreview">
      <ul className="gp-files">
        {files.map((f, i) => {
          const st = fileStat(f.before, f.text);
          return (
            <li key={f.name} className={"gp-file" + (i === Math.min(sel, files.length - 1) ? " on" : "")}
                onClick={() => setSel(i)} title={f.name}>
              <span className="gp-file-name">{baseName(f.name)}</span>
              <span className={"gp-tag " + (st.isNew ? "gp-tag-new" : "gp-tag-mod")}>{st.isNew ? "新" : "改"}</span>
              <span className="gp-stat">
                {st.added > 0 && <span className="gp-add">+{st.added}</span>}
                {st.removed > 0 && <span className="gp-del">−{st.removed}</span>}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="gp-main">
        <div className="gp-actionbar">
          <span className="gp-cur-name" title={cur.name}>{baseName(cur.name)}</span>
          <span className="gp-spacer" />
          {onCopy && <button className="gp-btn" onClick={() => onCopy(cur)}>复制</button>}
          {onDownload && <button className="gp-btn" onClick={() => onDownload(cur)}>下载</button>}
        </div>
        <pre className="gp-code">
          {lines.map((l, i) => (
            <div key={i} className={"gp-line gp-" + l.type}>
              <span className="gp-gutter">{l.type === "add" ? "+" : l.type === "del" ? "−" : " "}</span>
              <span className="gp-text">{l.text || " "}</span>
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: genpreview.css**

Create `src/common/genpreview/genpreview.css`:
```css
/* 统一生成预览(spec §7)。全局类,tokenized。 */
.genpreview { display: flex; flex: 1 1 auto; min-height: 0; }
.genpreview-empty { padding: var(--sp-4); color: var(--text-dim); font-size: var(--fs-sm); }
.gp-files { list-style: none; margin: 0; padding: var(--sp-1); flex: 0 0 200px; overflow: auto; border-right: 1px solid var(--border); background: var(--panel); }
.gp-file { display: flex; align-items: center; gap: var(--sp-2); padding: 4px var(--sp-2); border-radius: var(--r-sm); cursor: pointer; font-family: var(--mono); font-size: var(--fs-xs); }
.gp-file:hover { background: var(--row-hover); }
.gp-file.on { background: var(--sel-bg); }
.gp-file-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text); }
.gp-tag { flex: 0 0 auto; font-size: 9px; padding: 0 5px; border-radius: 3px; font-family: system-ui, sans-serif; }
.gp-tag-new { color: var(--green); background: color-mix(in srgb, var(--green) 18%, transparent); }
.gp-tag-mod { color: var(--amber); background: color-mix(in srgb, var(--amber) 18%, transparent); }
.gp-stat { flex: 0 0 auto; display: flex; gap: 4px; font-size: 9px; }
.gp-add { color: var(--green); } .gp-del { color: var(--red); }
.gp-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; background: var(--code-bg); }
.gp-actionbar { display: flex; align-items: center; gap: var(--sp-2); padding: 4px var(--sp-3); border-bottom: 1px solid var(--border); }
.gp-cur-name { font-family: var(--mono); font-size: var(--fs-xs); color: var(--text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gp-spacer { flex: 1; }
.gp-btn { padding: 2px var(--sp-3); border-radius: var(--r-sm); border: 1px solid var(--border); background: var(--btn-bg); color: var(--text); cursor: pointer; font-size: var(--fs-xs); }
.gp-btn:hover { border-color: var(--accent); }
.gp-code { flex: 1 1 auto; min-height: 0; overflow: auto; margin: 0; padding: var(--sp-2) 0; font-family: var(--mono); font-size: var(--fs-xs); line-height: 1.55; }
.gp-line { display: flex; padding: 0 var(--sp-3); white-space: pre; }
.gp-gutter { flex: 0 0 16px; color: var(--text-faint); user-select: none; }
.gp-text { flex: 1 1 auto; }
.gp-add { }
.gp-line.gp-add { background: color-mix(in srgb, var(--green) 14%, transparent); }
.gp-line.gp-add .gp-gutter { color: var(--green); }
.gp-line.gp-del { background: color-mix(in srgb, var(--red) 14%, transparent); }
.gp-line.gp-del .gp-gutter { color: var(--red); }
.gp-line.gp-ctx { color: var(--text); }
```
NOTE: `.gp-add` 出现两次(文件统计的绿字 + 行 class)——用 `.gp-line.gp-add` 精确命中行,`.gp-stat .gp-add` 命中统计;上面已分别限定。若担心冲突,把统计的类改名为 `.gp-stat-add`/`.gp-stat-del` 并同步组件(可选)。

- [ ] **Step 7: 全局导入**: 在 `src/main.tsx` 的 inspector.css import 之后加 `import "./common/genpreview/genpreview.css";`。

- [ ] **Step 8: typecheck + build**: `npm run typecheck && npm run build` → 无错。

- [ ] **Step 9: 提交**
```bash
git add src/common/genpreview tests/unit/linediff.test.ts src/main.tsx
git commit -m "feat(genpreview): 统一生成预览组件 + LCS 行 diff(新/改标签·绿增红删)"
```

---

## Task 2: 接入 genconn GeneratePanel

**Files:**
- Modify: `src/genconn/GeneratePanel.tsx`
- Modify: `src/genconn/styles.css`
- Modify: `tests/e2e/__screenshots__/genconn-*.png`

- [ ] **Step 1: 用 GenPreview 替换 body**

在 `src/genconn/GeneratePanel.tsx` 顶部加:
```tsx
import { GenPreview } from "../common/genpreview/GenPreview.tsx";
```
把 body 块(`:238-249` 的 `!error && !loading && files.length > 0` 分支)替换为:
```tsx
      {!error && !loading && files.length > 0 && (
        <div className="genpanel-body" id="gc-genoutput">
          <GenPreview
            files={files.map((f) => ({ name: f.name, text: f.text }))}
            onCopy={(f) => void navigator.clipboard?.writeText(f.text)}
            onDownload={(f) => downloadText(basename(f.name), f.text)}
          />
        </div>
      )}
```
删除 header 里的「下载当前」按钮(`:206`,现由 GenPreview 的每文件「下载」承担):删掉
```tsx
        {cur && <button onClick={() => downloadText(basename(cur.name), cur.text)}>下载当前</button>}
```
`全部下载`(`:207-209`)、inject 两按钮、`收起` 保留。若删「下载当前」后 `cur` 变量仅剩此处引用导致 TS 未使用告警,则一并删除 `const cur = ...`(`:192`)——先确认 `cur` 是否在别处仍用(header 的 error/loading 文案不使用 cur;仅「下载当前」用)。删 `sel`/`setSel` 若不再被引用(现 body 的文件列表选中态移入 GenPreview,`sel`/`setSel` 可能变为死变量——检查并删除其 useState 及引用)。

- [ ] **Step 2: CSS 清理**

在 `src/genconn/styles.css` 删除 `.genfiles`(及 `li`/`li.on`)与 `.genprev` 规则(现由 genpreview.css 取代)。`.genpanel-body` 保留但简化为容器:确认它是 `display:flex; flex:1` 之类能让 GenPreview 撑开的规则;若原本给 genfiles/genprev 定制的内部规则,清掉。`.genpanel-body.empty` 保留。

- [ ] **Step 3: typecheck + build**: `npm run typecheck && npm run build` → 无错(修掉删按钮引发的未使用变量)。

- [ ] **Step 4: 重生成 genconn 截图 + 全量 e2e**
```
npm run build && npx playwright test tests/e2e/genconn.spec.ts --update-snapshots=all
npx playwright test
```
Expected: genconn 8/8 PASS(截图更新),全量全绿。必须 `--update-snapshots=all`。

- [ ] **Step 5: 提交**
```bash
git add src/genconn/GeneratePanel.tsx src/genconn/styles.css tests/e2e/__screenshots__/genconn-dark.png tests/e2e/__screenshots__/genconn-light.png
git commit -m "feat(genconn): 生成结果面板改用统一 GenPreview(新/改标签 + diff 视图)"
```

---

## 收尾验收
- [ ] `npm run test:unit` → 全绿(含 linediff)。
- [ ] `npx playwright test` → 全绿。
- [ ] `npm run build` → 成功。

## Self-Review 结论(写者自查)
- **规格覆盖**:§7 文件列表(新/改 + ±)+ diff 视图(绿增红删)+ 复制/下载 → Task 1;接入 genconn → Task 2。语法高亮本期不做(已在设计决策记录,只做 diff 着色——用户核心诉求)。DFX/pad 接入随 P3/后续(已记录)。
- **占位符**:无;diff 算法完整、组件完整、CSS 完整。
- **类型/命名**:`diffLines/fileStat/GenFile/GenPreview` 一致;`.gp-*` 类不与既有冲突(genconn `.genfiles/.genprev` 被删)。统计绿字与行 class 的 `.gp-add` 已用后代选择器区分(Step 6 note 提供改名兜底)。
- **风险**:删 GeneratePanel 的 `下载当前`/`cur`/`sel` 可能牵连未使用变量——Step 1 已提示逐一确认删除。genconn.spec 截图守视觉。
- **测试**:diff 纯函数 TDD;组件走 e2e 截图 + typecheck。
