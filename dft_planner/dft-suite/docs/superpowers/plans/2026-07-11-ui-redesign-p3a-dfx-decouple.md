# UI 重设计 P3a（DFX 生成解耦 + DFX tab 自带预览）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development / executing-plans. Steps use `- [ ]`.

**Goal:** 让 genconn 的「生成结果」不再包含 DFX ctrl 文件(回归纯连线);DFX ctrl 的生成 + 预览在 DFX Ctrl tab 内用统一 GenPreview 独立完成。

**Architecture:** 纯前端。数据仍在共享 genconn store(`doc.ctrlIps`)——只挪 UI:从 genconn GeneratePanel 移除 ctrlIps 循环;DFX tab 的「下载全部」升级为「生成」→ 填充 GenPreview 底部面板(复制/下载)。

**规格来源:** `docs/specs/2026-07-10-ui-redesign-design.md` §8。P2c 的 `GenPreview`(`src/common/genpreview/GenPreview.tsx`,`GenFile={name,text,before?}`)已就绪。

**关键前置事实(已核对代码):**
- genconn 耦合点:`src/genconn/GeneratePanel.tsx:119-145` —— `generateAll` 后 `for (const c of doc.ctrlIps) { const r = await dftCtrlgen.gen(c.spec); collected.push(...r.files); }` 把 ctrl 三件套并入 `files`。移除这段即解耦。
- DFX tab:`src/hierarchy/schematic/DfxCtrlTab.tsx`。`downloadAll`(`:197-210`):遍历 `doc.ctrlIps` → `dftCtrlgen.gen(c.spec)` → 每文件 `downloadText`;`gen:{busy,err}` state(`:与其它 useState 同处`)。布局:`<div className="dfxctrl-root">`(flex 行)= `.schwrap`(Stage)+ `.dfx-side-resizer` + `InspectorShell.dfxctrl-side`。早退占位:`dfxInstances.length===0 && ctrlIps.length===0 → <div className="muted pad" data-tab-kind="dfxctrl">`。
- `dftCtrlgen.gen(spec)` 返回 `{ files: {name,text}[] }`;`downloadText` from `../../genconn/persist.ts`。
- 设计 token 齐备。

---

## Task 1: genconn 生成解耦(移除 ctrl 文件)

**Files:** Modify `src/genconn/GeneratePanel.tsx`

- [ ] **Step 1: 移除 ctrlIps 循环**

把 `src/genconn/GeneratePanel.tsx:119-145` 的 `dftGenconn.generateAll(docJson).then(async (result) => {…})` 改为只用连接文件(删掉 ctrlIps 循环 + 相关 try/catch),简化为:
```tsx
    dftGenconn.generateAll(docJson).then((result) => {
      if (cancelled) return;
      setFiles(result.files);
      setLoading(false);
    }).catch((e: any) => {
      if (cancelled) return;
      setGenError(String(e?.message ?? e));
      setFiles([]);
      setLoading(false);
    });
```
删除随之未使用的 import:若 `dftCtrlgen` 在本文件不再被引用(inject 相关不使用它),删掉其 import。用 typecheck 确认未使用项。**不要**动 inject 两个按钮(`exportDftV`/`injectViaCli`)。

- [ ] **Step 2: 更新头部文案(可选)**

`生成结果` 计数文案原为「N 个文件（每个含 tiling 子块的层一份）」——保持即可(仍准确,只是不含 ctrl 了)。

- [ ] **Step 3: typecheck + build**: `npm run typecheck && npm run build` → 无错(修未使用 import)。

- [ ] **Step 4: 重生成 genconn 截图 + 全量**
```
npm run build && npx playwright test tests/e2e/genconn.spec.ts --update-snapshots=all
npx playwright test
```
Expected: 全绿(genconn 截图更新)。`--update-snapshots=all`。

- [ ] **Step 5: 提交**
```bash
git add src/genconn/GeneratePanel.tsx tests/e2e/__screenshots__/genconn-dark.png tests/e2e/__screenshots__/genconn-light.png
git commit -m "feat(genconn): 生成结果解耦 DFX ctrl 文件(回归纯连线,spec §8)"
```

---

## Task 2: DFX tab 自带生成 + GenPreview 预览

把 DFX tab 的「下载全部」升级:生成全部 ctrl 文件 → 底部可折叠 GenPreview 面板(复制/下载),不再直接下载。

**Files:**
- Modify: `src/hierarchy/schematic/DfxCtrlTab.tsx`
- Modify: `src/hierarchy/styles.css`

- [ ] **Step 1: import + state**

在 `DfxCtrlTab.tsx` 顶部加:
```tsx
import { GenPreview, type GenFile } from "../../common/genpreview/GenPreview.tsx";
```
在组件内(与 `gen` state 同处)加:
```tsx
  const [genFiles, setGenFiles] = useState<GenFile[]>([]);
  const [genOpen, setGenOpen] = useState(false);
```

- [ ] **Step 2: downloadAll → generate(填充预览)**

把 `downloadAll`(`:197-210`)改名/改为 `generateAll`,生成后填 `genFiles` 并打开面板(不直接下载):
```tsx
  const generateAll = useCallback(async () => {
    const ips = useGenconnStore.getState().doc.ctrlIps;
    if (ips.length === 0) return;
    setGen({ busy: true, err: null });
    try {
      const collected: GenFile[] = [];
      for (const c of ips) {
        const { files } = await dftCtrlgen.gen(c.spec);
        for (const f of files) collected.push({ name: f.name, text: f.text });
      }
      setGenFiles(collected);
      setGenOpen(true);
      setGen({ busy: false, err: null });
    } catch (e) {
      setGen({ busy: false, err: String((e as Error)?.message ?? e) });
    }
  }, []);
```
把 `修改` 面板头的按钮 onClick 从 `downloadAll` 改为 `generateAll`,文案 `{gen.busy ? "生成中…" : "生成预览"}`(原「下载全部」)。

- [ ] **Step 3: 布局包一层 column + 底部预览面板**

把成功路径的返回 `<div className="dfxctrl-root" data-tab-kind="dfxctrl">…</div>` 外面再包一层列容器,并在其后加底部预览面板:
```tsx
  return (
    <div className="dfxctrl-outer" data-tab-kind="dfxctrl">
      <div className="dfxctrl-root">
        {/* …原 schwrap + resizer + InspectorShell 不变(去掉 root 上的 data-tab-kind,移到 outer)… */}
      </div>
      {genOpen && (
        <div className="dfx-genpanel">
          <header className="dfx-genpanel-head">
            <strong>DFX ctrl 生成预览</strong>
            <span className="dfx-genpanel-sp" />
            <button onClick={() => genFiles.forEach((f) => downloadText(f.name, f.text))}>全部下载</button>
            <button onClick={() => setGenOpen(false)}>收起</button>
          </header>
          <GenPreview
            files={genFiles}
            onCopy={(f) => void navigator.clipboard?.writeText(f.text)}
            onDownload={(f) => downloadText(f.name, f.text)}
          />
        </div>
      )}
    </div>
  );
```
注意:`data-tab-kind="dfxctrl"` 从 `.dfxctrl-root` 移到 `.dfxctrl-outer`(早退占位那处不变)。`downloadText` 已在文件 import。

- [ ] **Step 4: CSS**

在 `src/hierarchy/styles.css` 加:
```css
#ws-hierarchy .dfxctrl-outer { flex: 1 1 auto; min-height: 0; min-width: 0; display: flex; flex-direction: column; }
#ws-hierarchy .dfxctrl-outer .dfxctrl-root { flex: 1 1 auto; min-height: 0; }
#ws-hierarchy .dfx-genpanel { flex: 0 0 40%; min-height: 0; display: flex; flex-direction: column; border-top: 1px solid var(--border); background: var(--panel); }
#ws-hierarchy .dfx-genpanel-head { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-2) var(--sp-3); border-bottom: 1px solid var(--border); font-size: var(--fs-sm); color: var(--text-strong); }
#ws-hierarchy .dfx-genpanel-head strong { font-size: var(--fs-sm); }
#ws-hierarchy .dfx-genpanel-sp { flex: 1; }
#ws-hierarchy .dfx-genpanel-head button { padding: 3px var(--sp-3); border-radius: var(--r-sm); border: 1px solid var(--border); background: var(--btn-bg); color: var(--text); cursor: pointer; font-size: var(--fs-xs); }
#ws-hierarchy .dfx-genpanel-head button:hover { border-color: var(--accent); }
```
(确认 `.dfxctrl-root` 原有 `flex:1` 规则不与 `.dfxctrl-outer .dfxctrl-root` 冲突;若原 `.dfxctrl-root{flex:1 1 auto;...}` 已在,则新增的 outer 规则不必重复,保留其 `display:flex`(行)即可。)

- [ ] **Step 5: typecheck + build**: `npm run typecheck && npm run build` → 无错。

- [ ] **Step 6: e2e 冒烟(DFX tab 打开 + 生成预览按钮在)**

在 `tests/e2e/dfx.spec.ts` 若已有打开 DFX tab 的用例则复用;否则在 `tests/e2e/hierarchy.spec.ts` 已有「DFX Ctrl 面板用共享 Inspector 外壳渲染」用例基础上,断言「生成预览」按钮存在(需先有 ctrlIp——较重)。**最小方案**:仅追加断言 tab 打开不崩溃(已有);生成路径靠 dfx.spec.ts 现有覆盖(它构造 ctrlIp)。运行 `npx playwright test tests/e2e/dfx.spec.ts tests/e2e/hierarchy.spec.ts` 确认全绿(若 dfx.spec 依赖旧「下载全部」文案,更新其选择器为「生成预览」)。

- [ ] **Step 7: 全量 + 提交**
```
npx playwright test
git add src/hierarchy/schematic/DfxCtrlTab.tsx src/hierarchy/styles.css tests/e2e
git commit -m "feat(dfx): DFX tab 自带生成 + GenPreview 预览(spec §8)"
```

---

## 收尾验收
- [ ] `npm run test:unit` → 全绿。
- [ ] `npx playwright test` → 全绿(截图已重生成)。
- [ ] `npm run build` → 成功。

## Self-Review 结论(写者自查)
- **规格覆盖**:§8「genconn 生成结果不再含 ctrl 文件」→ Task 1;「ctrl 生成 + Diff 预览在 DFX tab 内独立完成」→ Task 2(用 P2c 的 GenPreview)。数据仍在共享 store(§8「数据归属但共享」)——未动 store。
- **占位符**:Task 2 布局改动给了完整 JSX/CSS;downloadAll→generateAll 完整。
- **风险**:①genconn 删 ctrlIps 循环后 `dftCtrlgen` import 可能未用→typecheck 会提示删。②DFX tab 包 column 层可能影响 Konva 画布量测(ResizeObserver 量 `.schwrap`)——`.dfxctrl-root` 仍是 flex:1 撑满上半,画布量测不变。③dfx.spec.ts 若断言旧「下载全部」文案需更新。均在步骤中提示。
- **测试**:纯 UI/布局 → e2e + 截图 + typecheck。
