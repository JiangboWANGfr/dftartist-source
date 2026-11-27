# SpecGen 图层几何独立 + 多选/删除辅助 — 设计

日期：2026-07-13
状态：设计（待评审）
关联：`src/specgen/Workspace.tsx`、`src/specgen/edit.ts`、`src/genconn/store.ts`、`src/genconn/core/dft-model.ts`、`src/genconn/layers.ts`

## 背景与问题

SpecGen 工作区把 DFT IP 摆在 Konva 画布上，画布按「总线图层」（`SSN / IJTAG / BISR / BSCAN`）区分。但图层当前**只做显示三态**（normal/dim/hidden，见 `layers.ts:layerStateOf`），几何是**全图层共享**的：每个 `DftIpInstance` 只有一个 `position`。结果在一个图层里调整位置，会把另一个图层的接口/连线搞乱。根因是三条耦合链：

1. **画布尺寸 `ws` 取所有图层 IP 的并集包围盒**（`Workspace.tsx:292-296`），而边界接口块位置是把 scope 轮廓按 `ws` 缩放贴上去的（`:298-300`）。→ 在 BSCAN 里把 IP 拖远 → `ws` 变大 → SSN 接口块移位 → 接上去的 SSN 连线全部重排。
2. **`DesignInstance` 节点跨层共享单坐标**（`:507` 恒 normal）。在 BSCAN 里挪它 = SSN 里也挪了 → SSN 连线端点动。
3. **连线避障障碍集全局**（`:306`，所有 IP 不分层）。→ 把 BSCAN 的 IP 挪进某条 SSN 线路径，SSN 线也会绕开重排。

三条同根：几何计算没有按「当前图层」隔离。

此外 SpecGen 缺少常用编辑辅助：只有单选 `selectedDftIp`，没有多选/框选、全选、批量删除，也没有 scope 级的清空/移出。GenConnection 侧已有整套多选（`store.ts` 的 `selectedIds`、`CanvasView.tsx:610-829` 的 marquee、`deleteSelected`），照搬即可。

## 目标

- **A. 图层几何独立**：在某一层里增删/移动/连线，不改动任何其他层的几何与走线。
- **B. 编辑辅助**：框选多选、Shift/Ctrl 点选、全选、批量删除；scope 级「清空本 scope」「移出 SpecGen」。

## 非目标

- 不改 C++ 生成侧（`layerPos` 纯视图字段，`generate` 不读）。
- 不做旧 `.arch` 兼容/迁移（已确认不需要）。
- 不改总线图层的定义或 `layerStateOf` 三态语义本身。

---

## Part A — 图层几何独立

### A1. 数据模型（`dft-model.ts`）

```ts
export interface DftIpInstance {
  // …现有字段不变
  position: { x: number; y: number };            // 单层 IP 坐标；DesignInstance 的基准/「全部」视图坐标/各层回退初值
  layerPos?: { [bus in BusType]?: { x: number; y: number } }; // 新增：跨层节点的每层坐标覆盖
}
```

- **只有跨层节点用 `layerPos`。** 跨层节点 = `ipType === "DesignInstance"`（渲染里唯一恒显所有层的类型）。其余单层 IP（Pipeline=SSN、EBScanPipeline=BSCAN…）只在自己层出现，坐标继续存 `position`，模型不变。
- **只有 `position` 按层拆分；`rotation`/`mirror` 仍是共享单值。** 因 `dftIpDispSize` 会按 `rotation` 交换盒宽高、盒尺寸喂给 `ws`/障碍/锚点，若允许旋转跨层 DesignInstance 会污染别层几何。故**禁止旋转 DesignInstance**（`rotateDftIp` 对其 no-op + UI 隐藏旋转项）；`mirror` 本就仅 Multiplexer 可用，DesignInstance 天然不受影响。（实现期最终评审发现的层间泄漏，已修。）
- 不写迁移/回退代码。`layerPos` 缺省时按 A2 回退到 `position`，这既是新建 DesignInstance 的自然初值，也让手写/旧文件不炸——但不作为兼容目标。
- `BusType` 从 `layers.ts` 引入到 `dft-model.ts`（当前 `dft-model.ts` 只依赖 `model.ts` 的 `Id`；新增一处 `import type { BusType }`）。

### A2. 坐标解析（新 helper）

在 `specgen` 内新增纯函数（建议放 `ipgeom.ts` 或 `edit.ts`）：

```ts
const isCrossLayer = (ip: DftIpInstance) => ip.ipType === "DesignInstance";

/** IP 在给定活动层下的有效坐标。 */
export function ipPosIn(ip: DftIpInstance, layer: BusType | null): { x: number; y: number } {
  if (layer && isCrossLayer(ip)) return ip.layerPos?.[layer] ?? ip.position;
  return ip.position; // 单层 IP，或「全部」只读视图
}
```

`Workspace.tsx` 里所有读 `ip.position` 做几何的地方（`ipBox`、`obstacles`、`endpointAnchorEnd`、传给 `DftIpNode` 的坐标、拖动预览 `dragPos` 基准）改成 `ipPosIn(ip, activeLayer)`。

### A3. 移动写入规则（`edit.ts` + store）

`moveDftIp` / `applyAutoLayout` / `setDftIpPositions` 增加 `layer: BusType | null` 参数（store action 从 `activeLayer` 取值传入）：

- 目标是 DesignInstance 且 `layer` 是具体层 → 写 `layerPos[layer]`，`position` 不动。
- 否则（单层 IP，或 `layer===null`）→ 照旧写 `position`。

`clearWpForIp`（移动后清该 IP 的手动折点）逻辑不变——只是被移动的坐标来源换了。

### A4. 几何按活动层隔离（解决 #1 #3）

在 `Workspace.tsx` 定义当前层可见节点集：

```ts
const inLayer = (ip) => activeLayer === null ? true
  : isCrossLayer(ip) || catalogBus(ip.ipType) === activeLayer; // 隐藏层不入集（activeLayer 只会是可见层）
const geomIps = (scope?.dftIps ?? []).filter(inLayer);
```

- `ipBox`（→ `ws`、轮廓缩放、接口锚点）只从 `geomIps` 用 `ipPosIn` 算。
- `obstacles` 只用 `geomIps`。→ SSN 线不再绕 BSCAN 盒。
- 接口块 `bars` 只渲染活动层的（已由 `layerStateOf` 保证），锚点用活动层的 `ws`。

结果：具体层里的几何完全由该层节点决定；跨层 DesignInstance 用该层 `layerPos`；别层零影响。

### A5. 视图行为

- **`activeLayer===null`（全部）= 只读参考**：一律用 `position` 显示全部节点；禁用拖动、拉线、框选、Del（画布只看不改）。DesignInstance 显示在 `position`（基准）。
- **默认落进第一个有内容的层**：`addToSpecgen`（「加入 SpecGen ▸」首次进入）与 `openSpecgenScope`（切 scope）都要设 `activeLayer`——按 `["SSN","BSCAN"]`（仅这两层有面板可编辑，避免落到空面板的 IJTAG/BISR）取第一个「有该 busType 接口或有该 bus 的 IP」的层；都没有则留 `null`。避免默认停在只读的「全部」而以为不能编辑。
- **其他层节点仍作淡显参考**：具体层激活时，非活动层节点保持现有 `dim`（opacity 0.25、不可交互），但**不参与几何**（A4 已排除）。独立排列后各层坐标可能在屏幕上重叠——用现有「隐藏图层」开关消隐即可。（评审点，见下）
- 自动排列（`autoArrangeDft`）改为**只排当前层的 `geomIps`**，DesignInstance 写 `layerPos[activeLayer]`；`arrangeSnapshot` 记录/恢复同样按层。

---

## Part B — 多选 / 删除辅助（照搬 GenConnection）

### B1. 选择模型（`store.ts`）

- `selectedDftIp: Id | null` → **`selectedDftIps: Id[]`**（单选=长度 1）。所有读处改用数组（`Workspace.tsx` 高亮、Del、旋转/镜像取"唯一选中"时用 `length===1`）。
- 新 actions（对齐 genconn 语义）：
  - `selectDftIps(ids: Id[])`
  - `toggleDftIp(id, additive: boolean)`（Shift/Ctrl 点选：加/减单个）
  - `selectAllDftIps(defId)`：选当前层**用户 IP**（`geomIps` 里 `!isCrossLayer`）——**排除 DesignInstance**（自动管理，删了会被 `syncDesignInstances` 立即重建）。
  - `clearDftSelection()`
  - `deleteDftIps(defId, ids)`：批量走 `deleteDftIp`（含级联删连线）。
- `setActiveLayer` 切层时清 `selectedDftIps`（现已清 genconn 的 `selectedIds`，补一处）。

### B2. 画布交互（`Workspace.tsx`，参考 `CanvasView.tsx:610-829`）

- **框选 marquee**：空白处拖 → 画选框 Rect（世界坐标），命中框内的当前层可选 IP（用 `ipPosIn` + `dftIpDispSize` 判包围盒相交）。仅具体层生效（只读全部视图禁用）。
- **Shift/Ctrl 点选**切换单个；普通点选 = 单选。
- **Ctrl/Cmd+A** = `selectAllDftIps`（输入框聚焦时不触发，沿用现有 keydown 守卫）。
- **Del/⌫** = 批量删选中（现有单删逻辑扩成数组）。
- 工具条按钮 `删除选中 IP` → `删除选中 (N)`，N = `selectedDftIps.length`；N≥1 显示。

### B3. Scope 级动作（两个独立动作 + 确认）

`edit.ts` 新增两个纯函数，store 包 action，工具条 scope 区放两个按钮，各带 `confirm`：

- **清空本 scope** — `clearDftScope(doc, defId)`：置空该 def 的 `dftIps`、`dftWires`。（DesignInstance 会随 `syncDesignInstances` 自动重建，符合"重来一遍"预期。）
- **移出 SpecGen** — `removeFromSpecgen(doc, defId)`：`inSpecgen = false`，**内容（dftIps/dftWires）保留**，随时能再「加入 SpecGen」恢复。若移出的是当前打开 scope，store action 自动把 `specgenScope` 切到另一个 `inSpecgen` 的 def（没有则置空 → 回到空态引导页）。

---

## 影响文件

| 文件 | 改动 |
|---|---|
| `src/genconn/core/dft-model.ts` | `DftIpInstance` 加 `layerPos?`；引入 `BusType` |
| `src/specgen/ipgeom.ts`（或 `edit.ts`） | 新增 `isCrossLayer` / `ipPosIn` |
| `src/specgen/edit.ts` | `moveDftIp`/`applyAutoLayout`/`setDftIpPositions` 加 `layer` 参数；新增 `clearDftScope`、`removeFromSpecgen` |
| `src/genconn/store.ts` | 多选 state+actions；`moveDftIp` 等传 `activeLayer`；`clearDftScope`/`removeFromSpecgen`/默认进层；切层清 `selectedDftIps` |
| `src/specgen/Workspace.tsx` | 几何按 `geomIps`+`ipPosIn`；marquee；只读全部视图；默认进层；工具条按钮；多选高亮/删除 |

生成侧（C++ `dftSpecgen`）不动。补一条 schema-parity 守卫/断言：`layerPos` 存在时序列化/`generate` 不受影响、bscan.schema parity 不漂移。

## 测试与验收标准

**Part A（图层独立）**
1. 单测：`ipPosIn(DesignInstance, "SSN")` 有覆盖返回覆盖、无覆盖回退 `position`；单层 IP 恒返回 `position`。
2. 单测：`moveDftIp(DesignInstance, pos, "BSCAN")` 只改 `layerPos.BSCAN`，不动 `position` 与 `layerPos.SSN`。
3. e2e/集成：在 BSCAN 层移动一个 IP / DesignInstance 后，SSN 层所有接口锚点、连线折线坐标**逐字节不变**（对比移动前后的 wire 路径快照）。这是本设计的核心回归守卫。
4. e2e：把 BSCAN IP 拖进原 SSN 线路径区域，SSN 线走线不变（障碍集已按层隔离）。

**Part B（编辑辅助）**
5. 框选覆盖 3 个 IP → `selectedDftIps.length===3`；Del → 三者及相关连线消失。
6. Ctrl/Cmd+A 选当前层用户 IP，**不含** DesignInstance。
7. `清空本 scope` → `dftIps`/`dftWires` 空；DesignInstance 随 sync 重建。
8. `移出 SpecGen` → 该 def 从 scope 下拉消失、`inSpecgen===false`、内容保留；当前打开的被移出时自动切走。

回归：现有单删、旋转/镜像（要求唯一选中）、拉线、自动排列、`.spec` 预览、schema parity 测试全绿。

## 风险与开放细节（评审点）

- **A5 淡显 vs 隐藏**：具体层激活时，其他层节点默认保留 `dim` 淡显参考（不参与几何）。独立排列后各层坐标可能屏幕重叠；默认可用「隐藏图层」消隐。若更想要「激活某层即只显示该层（其余隐藏）」的纯净画布，是一行渲染改动——**倾向保留 dim，等实际用起来再定**。
- **A5 「全部」视图 DesignInstance 坐标**：用 `position`（基准），可能与各层 `layerPos` 不一致而略显陈旧；因「全部」是只读参考，接受。若要「全部」跟随某主层，另议。
- **B3 确认弹窗**：用浏览器 `confirm`（与现有风格一致）还是自定义弹窗——默认 `confirm`，可评审。
