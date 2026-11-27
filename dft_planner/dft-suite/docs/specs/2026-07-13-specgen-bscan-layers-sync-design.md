# SpecGen 同步 newProject：BScan + 图层 + genconn/specgen 同步 bug — 设计

- 日期：2026-07-13
- 状态：**草案，待用户审阅**（尤其是 §6 的 BScan 生成范围决策）
- 真源：`newProject`（`master`，`867f90b` BScan 反馈轮为止）
- 目标仓：`dft-suite`（Electron/React）

## 1. 背景与目标

把 newProject 在 specgen-m0 合并**之后**落的三块工作同步进 dft-suite，其余（对称复制 S3、拉线 UX 便利等）先不管：

1. **BScan 的 genspec** —— specgen 支持 BScan datapath（EBScanPipeline 单链）。
2. **genspec 的图层功能** —— 总线图层下拉（全部 + SSN/IJTAG/BISR/BSCAN 四层 + 逐层显隐），genconn Toolbar 与 SpecGen 共用；并**修不完善处**：下拉打开后点画布/点外部不关闭。
3. **genconn 和 specgen 不同步 bug** —— 在 genconn 删子实例后，specgen 里对应的自动 DesignInstance 不立即删。

## 2. 现状核对（已逐一验证）

dft-suite 与 newProject 架构差异关键点：

- **genconn 与 specgen 共享同一个 store 和同一份 `doc: GenConnDocument`**。specgen（`src/specgen/Workspace.tsx`）直接 `import { useStore } from "../genconn/store.ts"`，编辑 `defs[].dftIps/dftWires/inSpecgen`。所以图层状态、doc 天然共享——**不需要**任何跨 store 同步管道。
- **生成真源是 C++**（`dftSpecgen.generate` CLI，dft-core）。dft-suite specgen 只留了 TS *fragment* 兜底（`gen.ts` 的 `genBlock/genIpFragment`），**没有** TS 全文档生成器（无 `dftspec.ts`/`datapath.ts`/`bscan.ts`）。→ 预览全文档只能由 C++ 出。

dft-suite **已有**（无需动）：

- `genconn/layout.ts:342` `BUS_COLOR` 含 `BSCAN: "#9e77ed"`。
- `genconn/layers.ts` `BUS_LAYERS = ["SSN","IJTAG","BISR","BSCAN"]` + `layerStateOf`（三态：hidden > dim > normal）。
- `genconn/store.ts` 共享状态 `activeLayer/hiddenLayers` + `setActiveLayer/toggleLayerHidden`。
- `genconn/Toolbar.tsx:83-92` 内联「图层 ▾」下拉（**未**抽成组件）。
- `genconn/CanvasView.tsx` 已按 `layerStateOf` 对 bar/wire 做 dim/hide。
- `DesignInstance` ipType、`specgen/edit.ts:112 syncDesignInstances`。

dft-suite **缺**（本次要补）：

| # | 缺口 | 对应 newProject 提交 |
|---|------|------|
| A1 | `deleteInstance` 删子实例后未对 `inSpecgen` scope 跑 `syncDesignInstances` | 反馈轮 ③ |
| A2 | 图层下拉未抽成共享 `LayerMenu` 组件（genconn/specgen 各写各的） | 反馈轮 ② |
| A3 | 图层下拉点外部/点画布不关闭 | **两仓都没有，本次新修** |
| A4 | specgen 画布无图层门控（不 dim/hide 节点与连线） | Slice 3 `5962ffb` |
| A5 | catalog 无 `EBScanPipeline` 条目 + 无 `catalogBus()`（IP→总线层） | Slice 1 `5e90ab4` |
| B1 | BScan 生成（`linearizeBScanChain`+`genBScanSpec`）+ schema + DI→EBScanInstance | Slice 2 `0b5df84`、反馈轮 ① |

## 3. 范围拆分：Phase A（现在做）/ Phase B（待决策）

按「是否需要 C++」切开：

- **Phase A — 纯 dft-suite（UI/model，无 C++）**：A1–A5。交付后 specgen 能放置/连线/图层门控 BScan 节点、两块 fix 到位；预览文本暂不含 `EmbeddedBoundaryScan`（因为全文档生成走 C++，Phase B 才补）。
- **Phase B — 跨仓（dft-core C++ 移植 + 桥接）**：B1。把 `bscan.ts` 移植进 dft-core、逐字节 golden、桥接到预览，`dftSpecgen.generate` 输出 `EmbeddedBoundaryScan{}`。独立的 M0→M1 小周期。

Phase A 与 Phase B 解耦：Phase A 只把 BScan 节点建进 `doc`（`dftIps/dftWires`），持久化不变；Phase B 落地后同一份 `doc` 直接能生成，无需回改 UI。

## 4. Phase A 详细设计

### A1 删除同步（bug 修复，TDD）

`genconn/store.ts:364 deleteInstance`：`editDelete` 后，对所有 `inSpecgen` 的 def 跑一遍 `dftSyncDesignInstances`，再返回。与 newProject 反馈轮 ③ 一致——不再等切回 SpecGen 时它的 `useEffect` 才清理。

```ts
deleteInstance: (instId) =>
  set((s) => {
    let doc = editDelete(s.doc, instId);
    for (const d of doc.library.defs) if (d.inSpecgen) doc = dftSyncDesignInstances(doc, d.id);
    return { doc, dirty: true,
      selectedIds: s.selectedIds.filter((i) => i !== instId),
      selection: s.selection.id === instId ? { kind: null, id: null } : s.selection };
  }),
```

- 用现有已 import 的 `dftSyncDesignInstances`（不含 `migrateLegacyIpNames`，与 newProject 删除路径一致）。
- **测试**：删子实例 → 对应 DesignInstance 立即从 `dftIps` 消失（先临时回退验证测试能抓 bug，再修）。

### A2 + A3 共享 LayerMenu（含点外部关闭 fix）

新建 `src/genconn/LayerMenu.tsx`（放 genconn 下，因图层概念真源在 genconn/layers.ts）。移植 newProject `LayerMenu.tsx`，从 `../genconn/store.ts` 取状态：`activeLayer/hiddenLayers/setActiveLayer/toggleLayerHidden`，`BUS_LAYERS` 来自 `./layers.ts`，`BUS_COLOR` 来自 `./layout.ts`。UI 与 genconn 现内联版一致（全部 + 4 层 + 逐层 👁/🚫）。

- **A3 关闭 fix（超出 newProject 的改进）**：下拉打开时挂 `document` 的 `mousedown` 监听，点击落在 LayerMenu 容器外 → `setOpen(false)`；`Escape` 也关。用一个容器 `ref` + `useEffect`（open 变 true 时 add、cleanup 时 remove）。点画布（Konva Stage 在容器外）即命中「点外部」而关闭。
- **接入点 1**：`genconn/Toolbar.tsx` —— 删掉内联下拉块（当前 83-92 那段 `{layerOpen && ...}`），换成 `<LayerMenu />`。
- **接入点 2**：`specgen/Workspace.tsx` 的 `dft-scopebar`（~330 行那排按钮）加 `<LayerMenu />`。

### A4 specgen 画布图层门控

specgen `Workspace.tsx` 渲染 DFT IP 节点与连线时，按每个 IP 的**总线层**（`catalogBus(ip.ipType)`）用 `layerStateOf(bus, activeLayer, hiddenLayers)`：

- `hidden` → 不画。
- `dim` → 变灰 + 不可交互（与 genconn CanvasView 的 `dim` 语义一致）。
- 连线的层 = 取其两端 IP 的层（DI 无明确层→取另一端；见下）。
- **DI 跨层恒可见**（反馈轮 ①）：`ipType === "DesignInstance"` 的节点不随图层 dim/hide（DI 可能同时在 SSN 与 BSCAN 链上）。
- 从 `../genconn/store.ts` 取 `activeLayer/hiddenLayers`（已存在）。

> 注：specgen 节点全 SSN 时，图层门控仍自洽（选 BSCAN/IJTAG/BISR 层则数据通路节点全 dim）。有了 A5 的 BScan 节点后才「有两层可分」。

### A5 catalog：EBScanPipeline + catalogBus

`specgen/catalog.ts`：加 `bus?: "SSN" | "BSCAN"` 字段到 `DftCatalogEntry`；加 `EBScanPipeline` 条目（`abbr:"EBP"`, `group:"datapath"`, `bus:"BSCAN"`, 端口 scan_in/scan_out/bscan_clock）；加 `catalogBus(ipType): "SSN"|"BSCAN"`（缺省 SSN）。`DftIpType` 联合（`genconn/core/dft-model.ts`）加 `"EBScanPipeline"`。palette 里 BScan 归到一个「BScan」分组或 `bus` 标签下（沿用 newProject 的 palette 分组呈现）。

## 5. Phase B 概要（BScan 生成，跨仓，待批准后单独 plan）

按迁移模板 M0→M1：

- **M0 dft-core（C++）**：移植 `bscan.ts` 的 `linearizeBScanChain`（单链遍历，DI→`EBScanInstance`、secondary in→out 直通）+ `genBScanSpec`（`EmbeddedBoundaryScan{ HostBScanInterface(...){...} }`）；`bscan.schema.json`（EBScanPipeline/SecondaryEBScanInterface/EBScanInstance 组件）。挂进 `specgen gen` 全文档输出。逐字节 golden vs newProject（图 14 端到端 fixture）。
- **M1 桥接**：确认 `dftSpecgen.generate` 路径把 BScan 段带出到 dft-suite 预览；schema 副本 + parity。
- 无独立 M2（UI 在 Phase A 已就位）。

## 6. 待决策：BScan 生成（Phase B）现在做还是后补？

**推荐：先只做 Phase A（UI-first），Phase B 作为后续单独周期。**

理由：Phase A 是纯 dft-suite、低风险、直接把可见+可交互的价值（放置/连线/图层）交付，两个 fix 一并到位；Phase B 是跨三仓的 C++ 移植（逐字节 golden，较重），值得单开一个 plan。若你要「预览就得出 `EmbeddedBoundaryScan` 文本」，则 Phase A+B 一起做。

（备选：把 newProject 的 `genBScanSpec` TS 也搬进 dft-suite specgen 出预览——最快出文本，但破坏「C++ 为生成真源」的架构、埋 parity 隐患，不推荐。）

## 7. 测试

- **单测**：A1 删除同步回归（临时回退验伪）；A5 catalog `catalogBus`/EBScanPipeline；A4 `layerStateOf` 在 specgen 场景（DI 恒 normal）。
- **typecheck** 干净；`npm test` 全绿。
- **e2e / 真机**：`npm run test:e2e`（自带前置构建）。真机用 Playwright 驱动 Electron + 截图核验：genconn 删子实例后切 SpecGen 已无残留 DI；specgen 图层下拉点画布关闭、选层 dim/hide 生效；放置一个 EBScanPipeline 并按 BSCAN 层过滤。

## 8. 明确不做（其他先不管）

对称复制 S3、拉线 UX 便利（对齐辅助线/逐角撤销/hide-wires）、newProject `feat/bus-layers` 游离提交、以及 Phase B 未获批准前的任何 C++ 改动。
