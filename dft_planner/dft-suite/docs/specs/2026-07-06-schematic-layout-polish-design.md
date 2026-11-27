# 原理图布局与可读性打磨(第二轮)— 设计文档

> 日期:2026-07-06
> 状态:已实现并验收通过(2026-07-06,tb 全 fanout 场景 + 全量测试,见 plan 执行记录)
> 前置:`2026-07-06-schematic-display-redesign-design.md`(第一轮,已实现并验收)
> 分支:`design/schematic-layout-polish`(基于第一轮分支头 `8e1e264`,第一轮保持可独立合并)
> 所有 ELK 行为结论均经 elkjs 0.11 probe 实测(2026-07-06,数值见各节)。

---

## 0. 目标与范围

第一轮验收后用户在真实 fanout 场景(time_base 扇出到 12 个 tracking_channel)反馈三个问题:布线通道拥挤、大部分连线没有 net 名、每次追线整图跳动。本轮四项修复:

1. **间距调参** — 布线通道加宽;
2. **net 名标签移到负载端** — 修正第一轮"同起点去重"的设计失误,fanout 每条线都有名字;
3. **zoom-to-fit + 重排** — 首次自动适应视口,画布加两个按钮;
4. **稳定性 Lite** — 追线时老盒子尽量不动(幂等/fanin 前置场景 0 漂移),seed 锚定。

**只动**:`src/hierarchy/core/schematic.ts`、`src/hierarchy/schematic/laid.ts`、`src/hierarchy/schematic/SchematicTab.tsx` + 测试。store、daemon、trace 语义、第一轮的 pin 几何(FIXED_POS 行坐标)一律不动。

明确不做(LATER):Nlview 级增量布局(独立大工程)、fanout 汇流干线、标签完整避让算法、minimap。

## 1. 问题与根因

| # | 现象(用户截图) | 根因 |
|---|------|------|
| ① | 层间布线挤成一束,标签压线 | 层间距 70px / 线距默认 10px 是"小盒子时代"的参数;盒子现在 800px 高、一次 fanout 十几条线 |
| ② | 大部分线上没有 net 名 | 第一轮把标签画在**驱动端起点**并按"同起点去重"——fanout N 条线共享起点,只有第一条有名字 |
| ③ | 每次追线整图跳动 | 每次全新布局,ELK 自由重排;无任何位置记忆 |

## 2. 设计决定

### 2.1 间距(`toElkGraph` 图级选项)

```
"elk.spacing.nodeNode": "60"                          (40 →)
"elk.layered.spacing.nodeNodeBetweenLayers": "150"    (70 →)
"elk.spacing.edgeEdge": "16"                          (默认 10 →)
"elk.spacing.edgeNode": "20"
"elk.layered.spacing.edgeEdgeBetweenLayers": "16"
"elk.layered.spacing.edgeNodeBetweenLayers": "20"
```

probe(1 driver 扇出 2 大盒 + 3 logic 源):平行竖线最小间距 10 → 16px,总宽仅 +80px。

### 2.2 net 名标签:负载端,每线唯一

- **位置**:画在每条 wire 的**终点侧**——最后一段水平线上方、右对齐、结束于 pin 锚点左侧 8px。所有边都终止于目标盒的 WEST 输入 pin(driver→load 方向恒定),几何统一。渲染参数:`x = endX - 158, width = 150, align "right", y = endY - 14`,9px,`#7a8490`,`wrap="none" + ellipsis`(超长截断,不压布线通道)。
- **去重**:`toLaid` 的去重键从起点改为**终点**(`points[len-2],points[len-1]`),同终点只留第一条的 `net`。同终点=同一 pin 的多驱动(行为级 fanin 多源),net 名相同,不丢信息;fanout 的 N 条线终点各不相同,**每条都保留名字**。

### 2.3 zoom-to-fit + 重排

- 纯函数(`laid.ts`):
  - `boundsOf(laid)` → 内容包围盒(盒子矩形 ∪ wire 折点,pin 锚点已含在盒外 10px,统一再向四周扩 20px 容纳标签)。
  - `fitTransform(bounds, viewport, padding = 40, maxScale = 1)` → `{ scale, x, y }`:scale = min(maxScale, 适配比),下限 **0.05**;内容居中。滚轮缩放下限同步放宽到 0.05。(原定 0.2 在真机验收被证伪:12 个 tracking_channel 的锥高 ~5300px,需要 ~0.13 才能入画,0.2 下限导致"适应"后上下裁切、seed 被裁出视口。)
- **自动 fit 时机**:仅两处——tab 首次布局完成时、点击"重排"后。普通追线**不**动视口(与稳定性配合,视角不被抢走)。
- **按钮**:`.schwrap` 右上角绝对定位的两个小按钮(HTML overlay,不进 Konva):`适应`(`data-btn="fit"`,按当前内容 fit)、`重排`(`data-btn="relayout"`,清空位置记忆 → 全新布局 → fit,布局退化时的逃生门)。样式沿用应用现有按钮风格,半透明弱化。

### 2.4 稳定性 Lite(方案 C 的务实版)

**机制**(probe 定型,r2f/g/h):全新 layered 布局 + `"elk.layered.crossingMinimization.semiInteractive": "true"` + 已有盒子把**上一次屏幕坐标**(锚定后的)作为节点级 **`"elk.position": "(x,y)"` layoutOption** + 布局结果整体平移使 **seed 保持屏幕原位**。

- **关键实测(2026-07-06 评审轮发现)**:semiInteractive **只读 `elk.position` 选项,不读 elkjs 的 `children[].x/y` 字段**——x/y 字段版是无效机制(判别性夹具证伪:交换 prev 后顺序不跟随)。用 `elk.position` 后交换 prev 顺序精确跟随。
- `toElkGraph(g, prev?: Record<string, {x, y}>)`:传了 `prev` 时加 semiInteractive 图级选项,且 `prev` 里有的节点在其 layoutOptions 带 `"elk.position": "(x,y)"`;不传则与现状完全一致(首次布局/重排)。
- `anchorTo(laid, prev, anchorId)`(`laid.ts` 纯函数):`Δ = prev[anchorId] − laid 中 anchor 的新坐标`,把所有盒子(含 port 锚点)与 wire 折点平移 Δ。anchor = `seedNodeId`(tab 已持有);prev 或 anchor 缺失时原样返回。
- `SchematicTab`:位置记忆保存**锚定后**的各盒坐标(下一轮 tie-break 与屏幕序一致),存放在**模块级 `Map<tabId, positions>`**(不是组件 ref)——`TabArea` 无 key 复用组件实例,schematic→schematic 直切不 remount,组件级 ref 会把 A 的坐标泄漏进 B(2026-07-06 Task 3 spec 审查发现);切到非 schematic tab 时组件卸载,ref 也活不过去。按 tabId 键控后:直切/切走再回/关闭重开都还原本 tab 的位置(与 store 里 `schematics` 图按 tabId 持久化的语义一致),互不串台。`relayoutTick` state 驱动重排(`Map.delete(tabId)` → effect 重跑 → fit)。注意:stage 的 pan/zoom 视口仍是共享的(不做按 tab 还原,超范围)。
- **弃用的路线(probe 证伪,勿走回头路)**:ELK interactive 全家桶(cycleBreaking/layering/nodePlacement INTERACTIVE)在中间插入/右侧追加时把老盒子挤走 372~896px,新节点坐标提示(含吸附已有层 x)也救不回;`considerModelOrder` 连幂等场景都会翻序。

**实测效果与诚实边界**(residual = seed 锚定后老盒子最大位移):

| 场景 | residual(elk.position 机制,probe r2h) |
|---|---|
| 图不变重布局(重追已展开 pin / markEmpty) | **0px** |
| fanin 追出新驱动(新层前置,最常见) | **0px** |
| fanout 向右追加 | **0px,同层顺序保持**(x/y 字段无效机制下曾是翻序+896px) |
| 中间插入新盒子 | 列间相对位移(层制布局插层本性),同层顺序保持;重排按钮兜底 |

### 2.5 不变项

pin 行几何(PIN_ROW0/PIN_PITCH/FIXED_POS)、源头符号、菱形交互语义、静态/交互双层性能架构、bus 线宽、标签字体颜色。

## 3. 改动清单

| 文件 | 改动 |
|------|------|
| `src/hierarchy/core/schematic.ts` | 图级间距选项(§2.1);`toElkGraph` 加可选 `prev` 参数(semiInteractive + 节点级 `elk.position` 提示) |
| `src/hierarchy/schematic/laid.ts` | 去重键起点→终点;新增 `boundsOf`、`fitTransform`、`anchorTo` 纯函数 |
| `src/hierarchy/schematic/SchematicTab.tsx` | wire 标签移到终点侧;模块级 `prevPosByTab` Map + `relayoutTick` + seed 锚定;首布局/重排后自动 fit;右上角 适应/重排 按钮 overlay;滚轮缩放下限 0.05 |
| `src/hierarchy/styles.css` | `.schtools` 按钮样式 + `.schwrap` position:relative(`#ws-hierarchy` 作用域内) |
| `tests/unit/schematic-elk.test.ts` | 更新去重测试;新增 §4 各测试 |
| 其他 | 不动 |

## 4. 测试

单元(`node --test`,真 elkjs 直跑):

1. **间距选项**:`toElkGraph` 输出的图级 layoutOptions 含 §2.1 全部键值(golden 断言)。
2. **prev 注入**:带 `prev` 时对应 children 的 layoutOptions 带 `"elk.position": "(x,y)"` 且图级含 semiInteractive;不带时两者都无。另有判别性测试:同源 pin 扇出 3 负载 + 交换 prev 首尾坐标 → 布局顺序跟随 prev(机制两半——图级开关与节点提示——缺一即红)。
3. **终点去重**:同终点两条 wire → 第二条 `net === ""`;不同终点(fanout)→ 都保留。
4. **anchorTo**:平移作用于盒子、port 锚点、wire 折点;prev/anchor 缺失时原样返回。
5. **fitTransform**:大内容缩到正好放下(留 padding)、小内容不放大(scale ≤ 1)且居中、scale 下限 0.05。
6. **幂等稳定**(真 elkjs):同图带 prev 重布局 → 各盒漂移 0。
7. **前置稳定**(真 elkjs):加新源驱动最左盒 + prev + seed 锚定 → 老盒 residual 0(probe r2d case B 固化)。

e2e:现有追锥 perf 门禁不回归;新增轻量断言——fit/重排按钮存在、点击后无异常(smoke)。

手动验收(gps_baseband):重演用户 fanout 场景(tb 扇出多 tc)——通道不再挤、每条线负载端有 net 名、追线时 seed 不动、重排/适应按钮工作;截图对比留档。

## 5. 风险与备注

- ~~fanout 追加的顺序翻转~~(已消除):`elk.position` 机制下 fanout 追加 residual 0、顺序保持(§2.4 表)。仍不要试图用 `forceNodeModelOrder`——模型序(追线序)≠ 屏幕序,会更糟。
- **测试必须有判别性**:稳定性测试要用"同源 pin 扇出多负载 + 交换 prev 顺序"的夹具证明机制真的在起作用(交换后顺序跟随 prev);单纯"每层单节点链 + 幂等 0 漂移"的测试在机制被删掉时照样绿(ELK 确定性),是假保障。
- **中间插层的列位移**:层制布局插入新层必然右移后续列;seed 锚定吸收整体平移,残余是列间相对位移,可接受。
- **fit 与稳定性的配合**:自动 fit 只在首布局/重排,平时绝不动视口(视角连续性优先);内容长出视口时用户点"适应"。
- **`prevPosByTab` 存锚定后坐标**:若存 ELK 原始坐标,下一轮 tie-break 的序与屏幕序脱节,可能出现反直觉重排。实现时注意。
- 标签右对齐的 150px 定宽框在极窄通道下可能压到相邻竖线:通道已加宽到 150px(§2.1),`edgeNode 20` 保证最后一段水平线净空;残余交叠接受(无背景纯文字)。
