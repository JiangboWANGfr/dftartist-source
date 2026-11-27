# data source 统一视觉 + 通道化引脚（SSN pad / 共享 tap / bisrController 多 PD）— 设计

- 日期：2026-07-15
- 状态：**已实现**（2026-07-16 经网页 mockup 逐轮确认最终形态并落码）。卡片按「所在边」朝向：上/下成列、左/右整卡旋转 90°（文字随之转）；每通道 out 朝外/in 朝内（方向相反）、锚点在边界；单行标签=总线类别；tap 家族**自动合并**（去 `dsGroupId`/手动按钮）；~~**pin 也用卡片贴 harden 边界**、引脚朝盒外~~（**2026-07-22 修订 D9：pin 改回普通接口 Bar + 盒内侧三角**，见 D9）；默认 harden 400×340。pd 派生（`wire.ts`）已实现；C++ dft-core 对齐待核。
- 目标仓：`dft-suite`（Electron/React，genconn 画布视觉 + 模型 + Inspector）
- 参考实现：`newProject` 分支 `feat/specgen-m0`（已合入 `master` merge `c36421c`）——本设计是**移植 + 重设计**，不是从零做

## 1. 背景与目标

genconn 画布上的 **data source**（一条总线在设计里的源头，可拉线的连接起点）目前有三处问题要解决，参考功能 `newProject` 已实现但"不好看"，dft-suite 侧还缺一半：

**用户三点诉求**：
1. **SSN**：摆放下拉从 `pin(边上) / other(盒内：pad)` 改为语义直白的 **`pin(边上) / pad(内部)`**（只是把 `other` 这个中转词换成真实标签）。
2. **ijtag / jtag1838 / bscan 共享同一个 tap**：不是每加一类就新增一个 tap 节点，而是**同一个 tap 节点**，在场的每一类**追加自己的连接引脚**。
3. **bisr**：`pin(边上) / bisrController(内部)`；因为 bisr 每条线可属不同 power domain，**bisrController 要按 PD 数量出对应数量的连接线接口**（N 个 PD → N 根出线）。

**统一诉求**：把三者的视觉统一成 **specgen 的"一行三角形"风格，但画在盒子内部**。

## 2. 现状核对（已逐一验证）

### 2.1 dft-suite 当前实现（缺口）
- 模型 `genconn/core/model.ts:23-58`：有 `isDataSource`(:53)、`placement:"pin"|"other"`(:51)、`dsFlip`(:57)、`innerPos`、`edge`；**无 `pdList`、无 `dsGroupId`** → 共享 tap 与 bisr 多 PD **尚未移植**。
- 渲染 `genconn/CanvasView.tsx:368-416`：内部 data source = `32×20` 小方块 + `◆` + `OTHER_LABEL[busType]` 文字（`◆bisrController` **远超 32px 会溢出**）+ 左右两个固定圆点脚（out 绿 -22 / in 蓝 +22）。**只有固定两脚，装不下多引脚。**
- `OTHER_LABEL`（`CanvasView.tsx:25`）= `{ SSN:"pad", BSCAN:"tap", BISR:"bisrController", IJTAG:"tap", JTAG1838:"tap" }`（keyed by `string`，非 exhaustive）。
- Inspector 下拉（`Inspector.tsx:249`）内联复制了同一份 label 映射，文案是 `other（盒内：X）`。

### 2.2 specgen 的目标风格（要对齐的样板）
`specgen/Workspace.tsx:480-521`：每个接口 = **淡色圆角卡片**（`hexTint(BUS_COLOR,0.88)` 填充 + 总线色描边 `cornerRadius 6`）+ 总线标签(bold 11)/接口名(9) + 两个**方向三角脚** `▶out`(起线，`triPoints(g.pOut,g.dir,true)`) / `◀in`(收线，`triPoints(g.pIn,...)`)。`triPoints(root,d,inward)`（`Workspace.tsx:78-85`）画一个沿方向 d、半宽 5、长 `IFB.pinLen` 的填充三角。**这套 `triPoints` + `BUS_COLOR`/`hexTint` 直接复用**，两处画布从此同一套三角脚。

### 2.3 newProject 为什么"不好看"（避免照抄的坑）
1. 两套视觉打架：pin=边缘条、pad/tap=盒内白卡片，"F 卡片"重设计只做了一半。
2. 卡片**固定尺寸不随内容长**（56×28 硬编码），PD 一多就溢出。
3. 共享 tap **写死只支持 2 个成员**（`shared[0]/[1]`、行 y 写死 -5/+11），扩不到第三类。
4. 字号 7–9、三角 8px，太小难点中；盒内自由拖动无吸附、会重叠。

## 3. 数据模型（移植 + 泛化）

在 `genconn/core/model.ts` 上新增（复用 newProject 命名）：
- `BusInterface.pdList?: string[]` —— bisr 的 power domain 列表；**每个 PD 一个通道（▶out 带 pd + ◀in）**。`pin` 模式仍用单个 `powerDomain`。
- `BusWire.pd?: string` —— 这条 BISR 线携带哪个 pd；从某个 pd 桩拉出时写入（喂给 §6 的派生）。
- **`dsGroupId` 已弃用**（曾计划的共享分组字段）：tap 合并改为**按 tap 家族自动分组**（`dataSource.ts` `isInternalTap`/`groupMembers`），无需分组字段、无手动按钮。

> dft-suite **已有** `powerDomain`/`pdMatchOnly`/`ifacePd`/`pdPrefix`（端口名机制）——本次只补 `pdList`/`pd` + `wire.ts` 派生 + `dataSource.ts` 通道/合并。

**通道模型（`dataSource.ts` `dataSourceChannels`）**：把一个 data source 归一成"通道列表 `channels`"，每通道 = 一个「标签 + ▶out/◀in 对」。pd/总线只挂在 **out**；`◀in` 身份不参与生成（见 §6）：
| data source | channels 来源 | 卡片标题 | 单通道行标签 |
|---|---|---|---|
| SSN **pad** | 单通道 | `pad` | 总线类别 `SSN`（`busTypeLabel`） |
| **tap**（自动合并） | 同 def 内所有内部 ijtag/jtag1838/bscan（`isInternalTap`） | `tap` | 各成员 `IJTAG/BSCAN/PTAP` |
| **bisrController** | `pdList` 每个 PD | `bisrController` | pd 名 `pd0/pd1…` |

## 4. 渲染设计（卡片按「所在边」朝向 —— mockup 最终确认）

data source（内部 + pin）统一画成 **specgen 三角芯片卡片**：淡色圆角卡（`hexTint(BUS_COLOR,0.88)` + 总线色描边/标题），复用 `triPoints`/`BUS_COLOR`/`hexTint`。**通道横排成列**（`CanvasView.tsx` 内部 data source 块，含 pin）。朝向由接口的**「所在边」`edge.side`** 决定（与 Inspector 下拉一致，缺省 client→左）：

- **上/下**：列布局、文字横排。下=引脚在下边/标题在上；上=引脚在上边/**标题挪到底**（避让顶部引脚）。
- **左/右**：**同一张列卡整体旋转 ±90°**（Konva 内层 `<Group rotation>`；`left→90 / right→-90`），文字随之转 90°、标签贴着自己那对引脚，成对清楚。
- 每通道两脚**同侧并排、锚点都在那条边**（`pinWorld` 按旋转换算世界坐标，连线好接）：`▶out` 尖朝外（离开）、`◀in` 尖朝内（接收）——**方向相反**；`dsFlip` 交换左右两脚。
- 尺寸：列宽 `COLW=44`、卡高 `H=48`；单行标签=**总线类别**（`busTypeLabel`）。图层门控**按各通道 busType**（共享 tap 成员可分属不同层）。

```
下(bottom) 朝向：                 左(left) 朝向（整卡旋转 90°、文字转 90°）：
┌────────────────────────┐        ┌────┐
│ tap                    │        │▼▲  │ IJTAG
│  IJTAG  BSCAN  PTAP    │        │▼▲  │ BSCAN   ← 文字竖排、每对脚贴左边界
│   ▼▲    ▼▲    ▼▲       │        │▼▲  │ PTAP
└────────────────────────┘        └────┘
  out▼朝外 / in▲朝内（相反），锚点都在边界
```

**内部 vs pin（两种 placement）**（2026-07-22 修订，原「pin 也用卡片贴边、引脚朝盒外」作废——贴边朝外的引脚在盒内没法接线，且 pin 语义上就是普通边界接口）：
- **内部**（`placement="other"`）：卡片浮在盒内 `innerPos`，自由拖动。
- **pin（边上）**（`placement="pin"`/缺省）：**与普通接口同一 `Bar` 形态**（边界细条 + 接口名标签 + ◆ DS 标记，沿边拖动），只是**条 1/4、3/4 处各带一个可连线三角、贴条的盒内侧面**（不顶条角，DS 条标签沿盒内方向让出三角长度）：`▶out`（绿，起线）尖朝盒内、`◀in`（蓝，收线）尖朝条，语义同内部卡；`dsFlip` 双击交换两端；连线锚点=三角的盒内极点；热区 `hitStrokeWidth 4`（点条身=选中接口，不误触起线）。**收线对齐**：`orthFinish(points, at, axis)` 保证末段沿引脚进入方向（左右边水平/上下边垂直）精确落在 ◀ 锚点（上一段同向直段→挪末点零多余拐角，否则补远端角点）；画线态悬停 ◀ 时预览磁吸到同一对齐路径。DS client 不再显示「未连接」告警（其配对经生成接口完成，自身永不入 connections）。BISR 多 `pdList` 暂只按单通道（pin 模式 pd 回退接口自身 `powerDomain`，`wire.ts` 既有行为）。

**tap 自动合并**：同 def 内所有**内部** ijtag/jtag1838/bscan **自动并成一张 tap 卡**（`groupMembers` 按 `isInternalTap` 分组，无 `dsGroupId`、无手动按钮）；`isPrimaryDataSource` 只让组内第一个渲染。**默认 harden 400×340**（`addBlankHarden` 显式 `size`）。

## 5. Inspector 改动

1. **摆放下拉改名**：`pin(边上) / other(盒内：X)` → `pin(边上) / <label>(内部)`，`<label>` = `pad|tap|bisrController`（按 busType）。去掉 `other` 中转词。
2. **bisr PD 列表编辑**：**chip/标签输入**（输入 pd 名 + 回车 → chip，× 删除，自动去重/去空）+ **从全 doc 已用过的 `powerDomain`/`ifacePd` 值自动补全**（无 pd 注册表时靠已用值约束一致性、避免 typo 破坏匹配）→ `pdList`。比 newProject `51d4a63` 的逗号串更稳。
3. **共享 tap = 自动合并**（无按钮）：同 def 内的内部 ijtag/jtag1838/bscan 自动并成一张 tap 卡（`dataSource.ts`），Inspector 不再有「共享 tap」按钮（原 `createSharedTap` 已删）。
4. 下拉 label 与 `CanvasView` 共用 `DS_LABEL`（`dataSource.ts` 单一来源）。

## 6. 连线语义 + PD 生成规则（newProject §4，已核对）

**加 pd**：Inspector 编辑 `pdList` → 每个 pd 一行（▶out/◀in）→ 从该 pd 的 ▶out 起线逐条拉。`BusWire.pd = 起线 out 桩的 pd`。收线点 `◀in` 的身份被 `commitWire(_inInstId,_inIfId,at)` **忽略**（只用位置）——**连接完全由 out（带 pd）+ 路径决定**，故 pd 只挂 out、in 是纯收线终点（也是 D6 选"每 pd 各自 in"零代价的原因）。一个 BISR 接口本身含 si(down)+so(up)，去/回同一接口。

**pd → interface 生成规则**（移植 `e5d7a2f`/`fc07192` 到 `wire.ts`，每次线增删/复制后全量重算）：
1. **灌 pd**：data source 线生成的接口 `powerDomain = wire.pd`（bisrController 用桩的 pd；pin 用接口自身 `powerDomain`）。
2. **派生 `pdMatchOnly`（决定 pd 进不进端口名）**：
   - **源实例**（data source 这侧）接口 → `pdMatchOnly = false`（pd **总是**进名，如 `pdA_bisr_si`）。
   - **下游实例**接口 → `pdMatchOnly = (本实例经过的不同 pd 个数 == 1)`：1 个 → `true`（只匹配、干净名 `bisr_si`）；≥2 个 → `false`（进名消歧）。
3. **配对靠 pd 的值**（`effectivePd`），不是端口名 → 源带名/下游单条不带名的不对称不影响功能。
4. `core/expand.ts` 的 `pdPrefix`（`powerDomain && !pdMatchOnly ? ${pd}_ : ""`）与 `generate.ts` 匹配**已存在于 dft-suite，不改**；只让 `wire.ts` 填上 `powerDomain`/`pdMatchOnly`。

**⚠️ 两个 pd 概念别混**：
- (a) `ifacePd` / `powerDomain`+`pdMatchOnly=true`（Inspector「本实例 pd·覆盖·仅匹配·不进端口名」）—— 同一 def 跨实例复用、靠 pd 值配对、名字保持通用。**dft-suite 已有，本次不动。**
- (b) 数据源派生 pd（本节 (1)(2)）—— 本次新功能。

**tap（自动合并）**：一张卡多成员通道，每成员各自 busType 的独立连线（各自 out+in），图层门控按各自 busType（`layerStateOf`）；合并只是 UI 渲染分组（`groupMembers`），不进生成，各成员生成互不干扰。

## 7. 范围与切分

- **本轮（范围内，dft-suite）**：§3 模型字段（`pdList`/`BusWire.pd`）+ `dataSource.ts` 通道/自动合并 + §4 渲染重设计（卡片朝向、pin 贴边）+ §5 Inspector + **§6 `wire.ts` pd 派生**。dft-suite 已有 `pdPrefix`/`powerDomain`/`pdMatchOnly`，故补上 `wire.ts` 派生后 **pd→端口名 TS 侧端到端生效**。交付后：pad/tap/bisrController 卡片统一、tap 自动合并、bisr 按 PD 出多线且生成名带对的 pd、pin 贴边界。
- **待核 / 可能下一轮**：**dft-core C++** genconn 生成的 pd 对齐——`wire.ts` 派生是改**模型**（给接口填 `powerDomain`/`pdMatchOnly`），TS 与 C++ 两侧 expand 都消费同一模型；若 C++ `genconn-core/expand.cpp` 已有等价 `pdPrefix`，则自动对齐、无需额外一轮；**开工前核对一次**。
- 明确不做：SSN `pin(边上)` 边缘条改卡片；tile 拓扑自动编排等无关项。

## 8. 测试

- 单测（`dataSource.ts`，`tests/unit/genconn-datasource-channels.test.ts`）：tap 家族自动合并成 channels（`groupMembers`/`isPrimaryDataSource`）；`pdList` → N 通道；单行标签=`busTypeLabel`（pad→SSN）；`DS_LABEL` 覆盖全 busType。
- 单测（pd 派生，§6）：**源实例进名 / 下游穿 1 个 pd 只匹配 / 下游穿 ≥2 个 pd 进名** 三态（对齐 newProject `8b12489`）；`ifacePd`（仅匹配·不进名）不受影响。
- 渲染快照/e2e：三种 data source 卡片随通道数变高、不溢出、可拖吸附；共享 tap 三成员各自图层门控；bisr 每 pd 起线带正确 `BusWire.pd` 且生成接口 `powerDomain` 正确。
- typecheck 干净；`npm test` 全绿（含既有 pd 端口名 golden/生成语义）；`npm run test:e2e` 真机核验放置/连线/生成名。

## 9. 决策记录

| # | 决策 | 结论 |
|---|---|---|
| D1 | 视觉语言 | **复用 specgen 三角芯片**（`triPoints`+`BUS_COLOR`+`hexTint`），genconn data source 与 specgen 统一 |
| D2 | 布局/朝向 | **卡片按「所在边」朝向**：上/下=列布局(文字横排)、左/右=整卡旋转 ±90°(文字随之转)；通道横排成列。（早期"纵向通道行/横排三角"经 mockup 迭代否掉）|
| D3 | tap 合并 | **按 tap 家族自动合并**（内部 ijtag/jtag1838/bscan），去 `dsGroupId`/手动按钮 |
| D4 | 下拉命名 | `other` → `pad/tap/bisrController`（内部）；label 用 `DS_LABEL` 单一来源 |
| D5 | 范围 | dft-suite genconn 视觉+模型+`wire.ts` pd 派生（端到端）；C++ dft-core 对齐待核 |
| D6 | out/in 引脚 | **同侧并排、锚点都在边界；`▶out` 尖朝外 / `◀in` 尖朝内（方向相反）**；`dsFlip` 交换。pd 只挂 out（in 身份不参与生成）|
| D7 | 两个 pd 概念 | **不混**：`ifacePd`/`pdMatchOnly=true`（本实例覆盖·仅匹配·不进名，已有） vs 数据源派生 pd（`pdList→wire.pd→powerDomain`，本次新增）|
| D8 | pdList 编辑 | **chip 输入 + 从已用 pd 名自动补全**（无 pd 注册表，用已用值约束一致性）|
| D9 | pin 模式 | ~~pin 也用同一张卡、贴 harden 边界、引脚朝盒外~~ **2026-07-22 修订：pin 用普通接口 `Bar` 形态 + 条 1/4·3/4 处盒内侧三角**（`▶out` 尖朝盒内 / `◀in` 尖朝条；锚点=三角盒内极点；`dsFlip` 交换两端；热区 4px；收线 `orthFinish` 精确对齐 + 悬停预览磁吸；DS client 不出「未连接」告警）。卡片只属于 `placement="other"` |
| D10 | 默认 harden 尺寸 | **400×340**（`addBlankHarden` 显式 `size`），给卡片留位 |
| D11 | 生成接口落位 | **2026-07-22 新增：跟线落位**——生成 secondary/client 的 `edge.offset` 不再取两盒重叠中心，改取**线与穿越边交点的中点**（一次穿越=穿越点、回环两次=两线中点，`sideCrossMid`），secondary 与下游 client 用同一穿越坐标保持对齐/自动配对。守卫：树里有**多实例 def** 参与 → 整树退回重叠中心（def 级接口一份 offset，跟单条线会破坏镜像/槽位 world 对齐）；多边形盒同样退回 |
| D12 | 删线级联 | **2026-07-22 新增**：`BusWire.createdIfs` 记录本线自动生成的接口；`removeWire` 删线删连接后，createdIfs 里**已无任何连接引用**的接口一并删（被其他线复用则保留）。老文档无该字段 → 不动 |
| D13 | 线跟随 DS | **2026-07-22 新增：端点渲染时绑定引脚**——`BusWire.inInstanceId/inInterfaceId` 记收线端（老文档缺省→只绑起点）；渲染每条 wire 时由当前几何现算 ▶/◀ 锚点（pin 条经 bars 含旋转，内部卡 `dsCardPinLocals` 含通道列/图层过滤），`bindWire` 把首/末共线段整体平移吸到锚点、中间拐点不动。存储 points 不改（纯视图）。**拖动中实时跟随**：实例/条/卡拖动实时状态走 store 瞬态（`dragInstLive/dragBarLive/dragCardLive`），只有 `CommittedWires` 组件订阅——拖动中仅该组件重算绑定，**实例树不重渲染**（主树拖动中重渲染会破坏 Konva 原生拖动位置，实测位移被放大数倍，故必须隔离） |
| D14 | 接口多选删除 | **2026-07-22 新增**：ctrl/⌘ 多选集合 `portSel` 挪入 store（瞬态、不进 undo）；Delete/Backspace 优先批量删 portSel（按 def+ifId 去重），条右键菜单加「Delete N Selected Interfaces」 |
| D15 | 引线打叉自动换脚 | **2026-07-22 新增**：绑定时每条 wire 试「正常/换脚」两种接法（`selfCrossings` 自交计数），换脚后自交更少 → 用换脚接法，且该接口的 ▶/◀ 渲染同步互换（`autoFlipIfs`，纯视图、不写 `dsFlip`）。换脚判定用已提交锚点（拖动中稳定），Bar 与内部卡通道都生效；两端都可绑才参与判定 |
