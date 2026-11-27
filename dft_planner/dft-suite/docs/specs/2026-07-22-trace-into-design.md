# 层次原理图"往里 trace"(Tessent 式下钻) — 设计文档

> 日期:2026-07-22
> 状态:已实现(2026-07-22)——两仓 feat/trace-into,验收见 e2e schematic-into + 截图(test-results/trace-into-*.png)
> 跨仓:dft-core(hdl-core 后端)+ dft-suite(前端),两仓各开 `feat/trace-into`
> 用户决策:原位嵌套+增量生长 / 盒内侧第二菱形触发 / 支持收起(2026-07-22 三项均按推荐确认)
> 明确不考虑老项目兼容,按最优实现改(用户 2026-07-22)。
> 所有 ELK 行为结论均经 elkjs 0.11.1 probe 实测(2026-07-22,数值见 §4;脚本三轮 P1-P5/F1-F7)。

---

## 0. 目标与范围

现状:原理图从 IP 引脚 trace 只能"往外"——在父作用域沿外部 net 找兄弟实例,IP 永远是黑盒。目标:像 Tessent Hierarchical Schematic 一样"往里 trace"——点 IP 边界引脚的**内侧菱形**,跨过模块边界进入内部,只画出与该引脚直接相连的内部实例(增量锥体),内部实例引脚可继续追(含再下钻,逐层嵌套),右键可整体收起还原黑盒。

**动**:dft-core `DesignDb`/`NdjsonServer`(新增 trace-into);dft-suite `core-bridge/client.ts`、`hierarchy/core/schematic.ts`、`hierarchy/store.ts`、`hierarchy/schematic/laid.ts`、`SchematicTab.tsx` + 测试。

**不动**:现有 trace-fanin/fanout/trace-drivers 语义、leaf 盒 FIXED_POS pin 行几何、稳定性 Lite 的 seed 锚定机制。

明确不做(LATER):Show parent(向上包一层,Tessent 另一功能)、下钻时全量展开内部一层、自动多层展开、跨边界直连边(连线始终经边界引脚桥接)、输入引脚往里的行为级负载兜底(现状往外 fanout 也无此兜底,保持对称)。

## 1. 现状与根因(dft-core)

`DesignDb::trace`(`hdl-core/service/DesignDb.cpp:314`)取父实例 body,用 `netOf` 解析引脚在**父作用域**的外部 net,只遍历父 body 的兄弟实例匹配——全程不访问 `self.body`,IP 因此不透明。这是行为限制不是数据丢失:elaborate 后的 slang `Compilation` 全程存活,`extractLocalNetlist`(`service/Netlist.cpp:45`)已能提取任意模块一层内部网表,其中 `port.internalSymbol`(`Netlist.cpp:79`)正是"边界端口→内部 net"的桥。

## 2. 后端设计(dft-core / hdl-core)

### 2.1 `DesignDb::traceInto(nodeId, port)`

语义:经 `port.internalSymbol` 把边界引脚映射到 `self.body` 的内部 net,在 body 一层内找直接挂在该 net 上的子实例引脚:

- **输出引脚**往里 = 找内部驱动(子实例的 out 引脚);边方向 `内部实例.out → IP.port`。
- **输入引脚**往里 = 找内部负载(子实例的 in 引脚);边方向 `IP.port → 内部实例.in`。
- **inout** = 两个方向合并一次返回。

节点 id 用完整 hierPath(如 `tc1/carrnco/rtlc_650`)——全局唯一,树/HDL cross-probe 免费兼容。`netName` 用内部 net 名。

### 2.2 行为级兜底(合并在同一响应,单次往返)

IP 输出直接由内部 `always_ff`/`assign` 驱动(无中间子实例)是最常见情况。输出引脚 traceInto 找不到子实例驱动时,后端就地对内部 net 跑 `AnalysisManager::getDrivers`(复用 `traceDrivers` 的解析,`DesignDb.cpp:408` 同款),把行为源并入响应,前端在嵌套框**内部**画现有 source 小盒。不再让前端二次调用兜底(与往外 trace 的两段式不同,这里协议是新的,按最优做)。

### 2.3 协议:daemon 新方法 `trace-into`

请求 `{nodeId, port}`;响应扩展自 trace-fanin 的形状:

```
{ edges: [{fromNode,fromPort,toNode,toPort,netName,bus}],   // 同 TraceResult
  nodes: [Meta...],                                          // 内部子实例(含 kind/isLeaf)
  sources: [{kind,id,label,detail,file,line,bus}],           // 行为源,同 trace-drivers.sources,常为空
  netName, bus, truncated }
```

`NdjsonServer.cpp` 照 `trace-fanin`(`:201`)+`trace-drivers`(`:230`)模板序列化。edges/nodes/sources 全空 = 死角(前端标内侧菱形 dead-end)。

### 2.4 边界情形

- 目标是 blackbox/primitive/leaf(`Meta.isLeaf` 或 kind ≠ "module"):前端不画内侧菱形,方法不会被调用;后端仍防御性返回全空。
- 端口在内部悬空(internalSymbol 缺失/net 无连接):返回全空 → dead-end。
- 多驱动/多负载:全部返回(数组),与往外 trace 一致。

## 3. 前端模型(dft-suite)

### 3.1 `schematic.ts` 数据模型

- `SchNode` 加 `parentId?: string`——挂在某展开容器内;根层节点无此字段。"容器"由派生判断:有 child 指向它即容器,无独立标志。行为源盒(port/logic)也可带 `parentId`(画在框内)。
- `SchematicGraph` 加 `inExpanded: Record<nodeId, port[]>` / `inEmpty: Record<nodeId, port[]>`——内侧菱形的已追/死角标记,与现有 `expanded`/`empty`(外侧)平行,互不干扰。
- `edges` 保持**平铺一维数组**不分层(probe P1b:ELK 自动把内层边归入正确容器)。
- 新增纯函数:`addTraceInto(g, nodeId, port, newNodes, edges, sources)`(新节点统一打 `parentId=nodeId`,标 `inExpanded`)、`collapseInside(g, nodeId)`(递归删除全部后代节点、触及后代的边、后代及自身的 in 标记)。
- `nodeDims`:容器不再适用(尺寸交给 ELK,见 §4);收起后恢复用 `nodeDims`。

### 3.2 `store.ts` 编排

`traceInside(seedNodeId, nodeId, port)`:调 `trace-into` → 空则 `markInEmpty`;否则对每个新子实例 `getPorts` 建全引脚盒(blackbox 引脚合成逻辑照抄 `traceSchematic`),行为源走 `makeSourceNode`,一并 `addTraceInto`。`collapseInside(nodeId)` 直接落模型。`client.ts` 加 `traceInto` 包装。

## 4. ELK 嵌套布局(全部 probe 实测,elkjs 0.11.1)

图级开 `"elk.hierarchyHandling": "INCLUDE_CHILDREN"`,容器节点按 `parentId` 嵌套成 ELK children。实测结论:

1. **可行性**:复合节点 + 跨边界边(内部实例→边界引脚→外部兄弟)+ 两级嵌套均正常布局(P1/P5)。
2. **容器尺寸**:输入 width/height 被忽略,传 0 即可,ELK 按内容+padding 自动撑大(P2c)。
3. **标题带**:容器设 `"elk.padding": "[top=46,left=46,bottom=12,right=46]"` 生效,顶部留出两行标题(F3);leaf 盒不受影响。(left/right 46:边界引脚名与子盒外伸菱形的避让区,2026-07-22 截图核验后调宽)
4. **容器边界引脚坐标是 ELK 的,不是我们的**:FIXED_POS/FIXED_SIDE 的 x/y 均被无视,ELK 自行重摆(x 贴实际宽度,y 对齐内部相连 pin 行以走直线,F4 实测两引脚各自对齐不同行);`elk.port.side` WEST/EAST 仍生效。⇒ **渲染展开容器的边界引脚必须读 ELK 输出坐标**;leaf 盒的 FIXED_POS 行坐标(y)在嵌套下完好保留(F4:43/65/87 原样),渲染照旧用自家几何。
5. **输出坐标系**:子节点 x/y 相对父容器;边的 sections 相对其 `container` 字段所指节点(平铺声明的内层边输出仍留在 root.edges,但 `container` 指向容器,P1b)。⇒ `laid.ts` 展平时按容器绝对原点逐级偏移。
6. **外层稳定性照旧成立**:semiInteractive + 老节点 `elk.position`(prev 屏幕坐标)在含复合节点时 residual 0(P3a);容器撑大会把右侧邻居推开(几何必然),seed 锚定整体平移兜底,不另做。
7. **内层稳定性——勿走回头路**:只 pin 老内部节点**不够**,新节点会抢占顶部把老节点挤走 88px;逐层加 semiInteractive 也救不回(F1=F2)。**修法**:新增内部节点也发 `elk.position` 提示,y 取该容器内已有兄弟 prev y 最大值 + 100——老节点 y 残差归 0(F5);提示 y 只是排序键,100 与 200 结果相同(F6);不发提示必翻序(F7 对照)。x 整列平移(容器撑大/端口对齐所致)接受不治。
8. **prev 坐标簿记改为相对坐标**:每个节点记"相对其父"的上次坐标(根层=屏幕坐标,现状);semiInteractive 在 root 和每个容器的 layoutOptions 都设(F5 双设验证通过,成本为零)。

## 5. 交互与渲染

### 5.1 内侧菱形(触发手势)

非 leaf 的 module 盒(含已展开容器)每个引脚在**盒内侧**再画一个菱形,与外侧菱形同行对称,样式对齐 genconn 的盒内侧三角(弱化色)。点击=往里追一步。三态与外侧一致:可追 / 已追置灰(`inExpanded`) / 死角标记(`inEmpty`)。blackbox/primitive/行为源盒不画。

### 5.2 展开容器的画法

- 容器画成**框**:边框同普通盒,填充透明或极淡(内容可见),标题(instanceName/designName)画在 `top=46` padding 带内,字体样式沿用普通盒。
- 边界引脚(菱形锚点、pin 名标签)按 §4-4 用 ELK 输出坐标画;外侧菱形(往外追)与内侧菱形(继续桥接别的引脚进来)都保留。
- 子节点递归画在框内(展平列表 + z 序:容器在下、内容在上);内部边照普通 wire 画,net 名标签规则不变(负载端)。
- 多层嵌套 = 同一机制递归,无特殊处理。

### 5.3 收起

右键已展开容器 → 菜单加"收起内部"(复用现有 `openContextMenu` 基建):`collapseInside` 递归移除内容,盒子恢复 `nodeDims` 普通画法;其外侧 `expanded`/`empty` 标记与外部连线不受影响。内侧标记清除,可重新展开(重新 trace,不缓存)。

## 6. 测试与验收

- **dft-core 单测**(照 trace 现有测试模式):输出引脚→内部实例驱动 / 输入引脚→内部负载 / inout 双向 / 行为级兜底(always_ff、assign) / blackbox·悬空→全空 / 两级下钻 id 正确性;protocol 层 `trace-into` 序列化(按仓库惯例无独立单测,由 e2e 真 daemon 链路覆盖)。
- **dft-suite 单测**(vitest):`addTraceInto`/`collapseInside`/`toElkGraph` 嵌套构造(children/padding/双层 semiInteractive/新节点提示)/`laid` 容器偏移展平。
- **e2e**(`npm run test:e2e`,自带前置构建):gps_baseband(`veirlogPaser/rtl_test/gps_baseband.fl`)——下钻 tracking_channel 内部一步、再下钻一层、收起、外层老盒零漂移(容器撑大平移除外)、截图存档人工核验。
- 真机验收:Playwright 驱动 Electron + 截图,对照 Tessent 截图确认视觉一致性。

## 7. 分支与合并

两仓各 `feat/trace-into`;先后端(协议可独立测)后前端。完成后分支保留,合并时机用户自己掌握,不主动 push/merge。
