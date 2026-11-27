# Pad/BScan Tab 设计（pad-core P2 — dft-suite UI）

- 日期：2026-07-10
- 状态：设计定稿，待实施
- 引擎侧：dft-core `pad-core` P1 已合 main（spec: dft-core `docs/superpowers/specs/2026-07-10-pad-core-design.md`）
- 本篇范围：dft-suite 的 UI（薄客户端）。**不含** ssn datapath / enable 生成（引擎侧后续阶段）。

## 1. 目标

在 dft-suite 里新增一个 **Pad/BScan 纯表格 Tab**：加载 cell lib + 当前设计 → 自动列出所有 pad（gpio/方向/使能）→ 用户批量编辑 4 个手工列（bscan_en / reuse / func / enable）→ 一键生成两段 Tessent 边界扫描配置，在可拖高的底部预览面板中查看/复制/导出。

核心 UX 指标：**64 个 GPIO 完成 reuse+bscan 配置 ≤ 6 次操作**（筛选/区间选中 → 批量条应用）。

## 2. 输入 / 持久化 / 产物（已确认的三默认）

1. **输入**：filelist 复用 `useDesign.filelist`（当前已打开的设计）；cell lib 在 tab 内选择一次，路径记忆于 localStorage（下次自动带出）。
2. **持久化**：手工列（overlay）自动保存为设计目录旁的 **`pad_cfg.json`**——与 P1 CLI 的 `--config` 格式完全相同（`{"pads":{"<path>":{...}}}`），UI 与 CLI 共用一份真相；编辑 300ms 防抖写盘；重开 tab 自动加载。
3. **产物**：预览 + 一键复制 + 导出 `.tcl` 文件。

## 3. 页面布局

```
┌─ 工具栏 ────────────────────────────────────────────────┐
│ lib: [adk.tcelllib ▾选择]  design: 当前设计(chip_top.f)  │
│ [↻ 重新分析]        ⚠ 2 warnings（点开看列表）           │
├─ 筛选行 ────────────────────────────────────────────────┤
│ dir:[全部▾] 状态:[全部▾/未设置reuse/bscan=y] 名称:[____] │
│ 区间: [GPIO_33..64  ] [选中]      已选 32 行 / 共 84 行  │
├─ 批量条（选中≥2行时浮现）───────────────────────────────┤
│ reuse:[in][out][清] bscan:[y][n] func:[ssn▾] enable:[__] │
├─ 表格（占剩余高度，滚动）───────────────────────────────┤
│ ☑│gpio     │pad   │dir  │bscan│reuse│func│enable │path  │
│ ☑│GPIO2_0  │iopad │inout│ y   │ in  │ -  │oe[7]  │U_9.U_1│
│ ☐│CLK_IN   │ipad  │in   │ n   │ -   │ -  │-      │…     │
╞══ ↕ 拖动分隔条 ═════════════════════════════════════════╡
│ 预览面板（可拖高至 80%，可折叠成一条）                    │
│ level:[chip▾] aux:[external▾] ssn:in[2]out[0] [生成]     │
│ [复制A][复制B][导出.tcl]              [▼折叠]            │
│ ── A: read_config_data ────────────────────────────────  │
│ read_config_data -in_wrapper $dftspec/… （等宽滚动）      │
│ ── B: set_boundary_scan_port_options ──────────────────  │
│ set_boundary_scan_port_options -pad_io_ports { \ …       │
└─────────────────────────────────────────────────────────┘
```

**预览面板形态（用户选定：IDE 终端式）**
- 垂直拖拽分隔条调高度（范围 ~10%–80%），高度记忆于 localStorage。
- 可折叠：折叠后只剩一条工具栏（level/aux/ssn 位宽/生成/展开箭头）。
- 首次生成后自动展开到上次高度。
- 分隔条组件仓库无现成 → 新写极简 vertical-split（onMouseDown/Move，几十行，放 `src/hierarchy/PadTab.tsx` 内部或独立小文件）。

## 4. 交互规则

1. **单元格编辑**：
   - `bscan_en`：点击切换 y/n。
   - `reuse`：三态循环 `-` → `in` → `out` → `-`；仅 `dir=inout` 行可点，固定向行灰显。
   - `func`：下拉（空 / ssn / 自定义输入）。
   - `enable`：单击进入文本编辑，commit-on-blur（仓库 Inspector 约定）；默认显示 autoEnableNet，被覆盖过的值加高亮标记，可一键还原默认。
2. **选择**：行首 checkbox；shift=范围选；表头 checkbox=全选**当前筛选可见行**；区间输入支持 `GPIO_33..64`（数字区间，前缀+两端号）与 `EMMC_*`（glob）。
3. **批量条**：作用于选中行；`reuse` 批量应用自动跳过非 inout 行并 toast 提示"跳过 N 行（固定方向）"。
4. **校验即时化**：P1 overlay 校验规则前移到编辑时（如 func=ssn 且 inout 无 reuse → 行标红 + 悬停提示）；存在红行时禁用[生成]。
5. **warnings**：分析警告（大小写疑似 / gpio 未解析）挂工具栏角标；gpio 未解析行置灰（不进生成，悬停显示原因）。
6. **自动保存**：编辑 300ms 防抖写 `pad_cfg.json`，工具栏显示保存状态（已保存/保存中）。
7. **重新分析**：filelist 或 lib 变更后点[↻]重跑 `pad table`；已有 overlay 按 path 对齐合并，消失的 path 提示并丢弃。

## 5. 架构落位（全部复用现有模式）

| 需求 | 模式 |
|---|---|
| Tab 接入 | `Tab` 联合类型（`src/core-bridge/model.ts:68`）+ 单例 `openPadTab`（仿 `openRegCountTab`，store.ts:187-199）+ Workspace dock 按钮 |
| 调 C++ | **spawn-per-request（ctrlgen 模式）**：`pad table --json` 拉表；`pad gen` 生成，overlay 写临时 json 传 `--config`（`electron/cli.cjs` 的 `ctrlgenGen` 是现成模板） |
| 表格 | 纯 HTML `<table>`（无虚拟化，与仓库一致；数百行规模够用）；可编辑单元格仿 `DfxDialog`（genconn/dfx/DfxDialog.tsx:316-383）；sticky 表头/排序仿 `RegCountTab` |
| 主题 | `--panel-3/--border/--row-hover/--sel-bg/--mono` 等 theme.css 变量，明暗自动适配 |

> 不用 `pad serve` 长驻：P1 的 serve 每请求也重新编译，长驻无收益。将来大设计卡顿时再给 serve 加缓存并切 daemon（P3），UI 只需换 core-bridge 一层。

### 文件清单

```
新增：
  src/hierarchy/PadTab.tsx            tab 主组件（表格+筛选+批量条+预览面板+分隔条）
  src/hierarchy/core/pad.ts           纯逻辑：行模型/筛选/区间与glob选择/批量应用/行校验/overlay序列化
  src/core-bridge/pad.ts              window.dft.pad.table / gen 薄封装（仿 ctrlgen.ts）
  tests/unit/pad.test.ts              纯逻辑单测（node:test）
  tests/e2e/pad.spec.ts               e2e（仿 regcount.spec.ts；根元素 data-tab-kind="pad"）
修改（renderer）：
  src/core-bridge/model.ts            + PadTabSpec（id 固定 "pad"，单例），入 Tab 联合
  src/core-bridge/dft.d.ts            + pad 桥类型
  src/hierarchy/store.ts              + openPadTab + pad 表数据/overlay buffer（keyed record，survive 切 tab）
  src/hierarchy/TabArea.tsx           + kind 分发 + 标题
  src/hierarchy/Workspace.tsx         + dock 按钮
  src/hierarchy/styles.css            + .pad-* 样式块
修改（electron）：
  electron/cli.cjs                    + padTable(filelist,lib) / padGen(filelist,lib,cfgJson,level,aux)
  electron/main.cjs                   + ipcMain.handle("dft:pad:table"/"dft:pad:gen") + pad_cfg.json 读写 IPC
  electron/preload.cjs                + window.dft.pad
  scripts/stage-bin.sh                + stage `pad`（顺带补漏 `ctrlgen`——现在 resources/bin 只有 hdl/genconn）
```

### 数据流

```
打开 tab → filelist = useDesign.filelist；lib 路径 ← localStorage（或用户选择）
        → spawn `pad table --json` → { pads, ssn, warnings } 入 store
        → 读设计旁 pad_cfg.json（若有）按 path 合并到手工列
编辑    → store overlay buffer → 防抖 300ms → IPC 写 pad_cfg.json
生成    → overlay 序列化临时 json → spawn `pad gen -f … --lib … --config tmp --level L [--aux A]`
        → stdout 拆 A/B 两段 → 预览面板；复制/导出
```

### NDJSON/JSON 命名约定

P1 遗留不对称：`pad table --json` 输出 camelCase（`bscanEn`），overlay 收 snake_case（`bscan_en`）。UI 的 `core/pad.ts` 在序列化 overlay 时做映射（camel→snake），**不改 C++ 侧**（P1 格式已冻结、有 golden）。

## 6. 测试策略

1. **纯逻辑单测**（`tests/unit/pad.test.ts`）：区间解析（`GPIO_33..64` 展开、`EMMC_*` glob、非法输入）、批量应用（跳过非 inout）、行校验（ssn 需 reuse）、overlay 序列化（camel→snake、只含非默认值）。
2. **store 单测**：`openPadTab` 打开/去重/激活（仿 hierarchy-tabs.test.ts，setState 预置数据免 daemon）。
3. **e2e**（`pad` 二进制存在才跑，`test.skip` 守护）：打开设计 → dock 按钮 → 表格可见 → 点击切 bscan_en → 生成 → 预览含 `read_config_data`。

## 7. 非目标

- 不做表格虚拟化（数百行规模纯 table 足够）。
- 不做 pad serve daemon 化 / 结果缓存（P3 视性能）。
- 不做 ssn datapath / enable 生成（引擎侧后续阶段；UI 只展示 ssn 位宽）。
- 不做 pad 物理管脚图。

## 8. 风险 / 待验证

- `pad table` 对大设计的耗时（每次 spawn 重新编译）：chip_top 实测 <1s，可接受；更大设计若卡，先加 loading 态，再考虑 P3 缓存。
- `pad_cfg.json` 写盘位置 = filelist 所在目录；需确认该目录始终可写（工程目录，通常可写）。
- 区间语法只支持"前缀+数字区间"（`GPIO_33..64`）与简单 glob（`*`），不做完整正则。

## 9. 实施后记（2026-07-10 实现同步）

- 预览面板为单一文本区 + 单个「复制」按钮（A/B 两段连续展示）；spec 早期草图中的 [复制A][复制B] 分段复制未实施（§2.3 的"一键复制"语义已满足）。
- 表格未实现列排序（§4 交互规则未含排序；RegCountTab 的排序模式未复用）。
- 批量 reuse 的跳过语义在 UI 内联实现（core/pad.ts 的 applyBulk 保留为带单测的规范实现，供后续重构收敛）。
- 拖拽分隔条 up handler 用 ref 持久化最新高度（计划原代码 stale-closure 已修正）。
