# 原理图显示重设计(方案 B:Tessent 风格)— 设计文档

> 日期:2026-07-06
> 状态:已实现并验收通过(2026-07-06,gps_baseband/tc4 剧本 + 全量测试,见 plan 执行记录)
> 配套:`Hierarchyshower/docs/2026-06-25-show-on-schematic.md`(原始设计,§2-§4 图模型/布局)
> 视觉对比 mockup:`docs/mockups/_src/schematic-redesign.html`

---

## 0. 目标与范围

修复 hierarchical schematic 的三个显示问题(pin 名字缺失、pin 顺序不稳定、行为级源头误导性大框),对齐 Tessent Visualizer 的显示模式。

**只动渲染层**:`src/hierarchy/core/schematic.ts`(ELK 输入 + 尺寸)和 `src/hierarchy/schematic/SchematicTab.tsx`(Konva 绘制)。**不动**:trace 语义、store 数据流、daemon 协议、ContextMenu。

明确不做(LATER):

- 布局稳定(追线时老盒子不动,ELK interactive)— 方案 C,下期。
- 门级视图(quick-synth)— 独立项目 `2026-06-25-yosys-gate-level.md`。
- bus per-bit 展开、net 名显示开关。

## 1. 问题与根因

| # | 现象 | 根因 |
|---|------|------|
| ① | pin 不显示名字 | 数据齐全(`get-ports` 的 `busLabel`,`nodeDims` 连宽度都预留了),`SchematicTab` 只画了菱形,从未画标签 |
| ② | 点了某个 pin,连线看起来"依次"接到最上面几个 pin | 连线终点逻辑上是对的;`toElkGraph` 用 `FIXED_SIDE`,ELK 每次重布局自由重排同侧 pin 顺序,把有连线的 pin 挪到顶部。pin 位置不稳定 + 无名字 = 看起来连错 |
| ③ | 棕色 `always`/`assign` 大框语义不明 | fanin 无同层实例驱动时,daemon 用 slang 分析返回行为级驱动源(父模块的 always/assign/输入端口),前端把它画成了和模块一样大的框,标题副标题重复,不显示 net 名 |

## 2. 设计决定

### 2.1 pin 名字:常显,盒内侧

- 每个 pin 在盒子边缘**内侧**渲染 `busLabel`(如 `carr_nco_fc[28:0]`):输入贴左边内侧左对齐,输出贴右边内侧右对齐;9.5px,`#cdd4dc`。
- 标签放**静态层**(`listening={false}`,`perfectDrawEnabled={false}`),零 hit-graph 成本 — `StaticBox` 已拿到 `box.ports` 坐标,直接画。
- 不截断:`nodeDims` 按标签宽度撑大盒子(现有公式,系数按 Konva 实测校准)。

### 2.2 pin 顺序:RTL 声明序,永不重排;标题带预留

- `toElkGraph`:`elk.portConstraints: "FIXED_POS"`,pin 坐标**完全自控** —— 标题带 `PIN_ROW0 = 46`px,行距 `PIN_PITCH = 22`px,第 i 个(声明序)pin 的中心 y = `46 + i·22`(输入/输出各自计行);输入贴 WEST(x=-3)、输出贴 EAST(x=w-3)。`nodeDims` 模块高度相应改为 `46 + rows·22 + 12`(与 mockup 几何一致)。ELK 只负责盒子摆放与正交布线,实测(elkjs 0.11)边端点精确落在 pin 行上。
- **为什么不是 FIXED_ORDER**(2026-07-06 评审轮实测):FIXED_ORDER 下 ELK 把端口分布到**整侧高度**,首行 pin 标签与标题两行(y+5/y+19)重叠;`elk.spacing.portsSurrounding` 实测无效;`portAlignment: END` 能空出标题带但底边距只剩 3px。FIXED_POS 是唯一完全可控的选项,还顺带消除了 FIXED_ORDER 顺时针 index(WEST 反转)的复杂度。
- pin 短线(stub):`toLaid` 把菱形坐标按方向在 ELK 锚点上再外移 `PIN_STUB = 10`px,stub 线从盒边画到菱形。连线终点与 stub 共线(正交路由的末段必为水平),视觉无缝。不用 `elk.port.borderOffset` —— 几何由纯函数控制,可直接单测。

### 2.3 行为级源头:紧凑符号,不再伪装成模块

`SchNode.kind` 区分(数据已在图模型,`makeSourceNode` 不变):

- **`port`(父模块输入端口)** → 扁箭头五边形(Tessent 端口符号),高 20,宽随标签;fill `#1c3a33`、stroke `#2f8f6b`;文本 = `designName`(即端口名)。
- **`logic`(always/assign)** → 紧凑标签块 ~150×38(rx 4,fill `#2f2716`、stroke `#a8823a`):第一行 = `instanceName`(daemon `srcLabel` 全集:`always`/`always_comb`/`always_latch`/`always_ff`/`initial`/`final`/`task/func`/`other`,以及连续赋值的 `assign`),amber 加粗;第二行 = `basename(loc.file):loc.line`,8.5px 灰。
- 两者的输出锚点 `"o"` 保留(ELK 连线需要),但**不画可点击菱形**:其 id 是合成的(`port:`/`logic:`),daemon 无法 trace,现状点击只会 markEmpty,纯噪音。
- logic 标签第二行(`file:line`)超宽时在标签内截断显示省略号(`wrap="none" + ellipsis`),不撑大标签 —— §5 的"不截断"只针对模块盒的 pin 标签(靠盒子撑大)。
- 双击开 HDL 的行为保留(现有透明 hit-rect)。
- `nodeDims` 对 `port`/`logic` kind 走紧凑尺寸分支(不再按"模块盒"公式)。

### 2.4 连线:net 名 + bus 加粗

- 每条边在 **driver 侧第一段上方**渲染 `netName`,9px,`#7a8490`,静态层。
- **fanout 去重**:一个 driver pin 扇出 N 条边时,N 条 wire 共享起点 —— `toLaid` 只给第一条保留 `net`,其余置空,避免同一位置叠画 N 个标签。
- bus 边(`SchEdge.bus === true`)线宽 2.2px,标量 1.4px。注意:`toLaid` 原来把 `bus` 硬编码为 `false`,需用 edge id 从 `graph.edges` 查回真值。

### 2.5 不变项

菱形交互语义(绿=fanin、橙=fanout、灰=已展开、空心=死角)、种子盒橙色描边、盒子按 kind 的 fill、pan/zoom 手感、静态/交互双层的性能架构。

## 3. 改动清单

| 文件 | 改动 |
|------|------|
| `src/hierarchy/core/schematic.ts` | `toElkGraph`:FIXED_POS 精确 pin 行坐标(PIN_ROW0/PIN_PITCH);`nodeDims`:模块高度 `46+rows·22+12`;port/logic kind 紧凑尺寸分支 |
| `src/hierarchy/schematic/laid.ts`(新) | `toLaid` 从 SchematicTab 移出为纯模块:菱形锚点外移 `PIN_STUB`、bus/netName 真值透传(可单测) |
| `src/hierarchy/schematic/SchematicTab.tsx` | `StaticBox`:pin stub + 标签 + port/logic 符号形状;`InteractiveBox`:port/logic kind 不画菱形;wire:net 名标签 + bus 线宽 |
| `tests/unit/schematic-elk.test.ts`(新) | 见 §4 |
| 其他 | 不动 |

## 4. 测试

单元测试(`node --test`,elkjs 可直接在 node 跑):

1. **声明序**:构造多输入/多输出盒子 → `layout(toElkGraph(g))` → 断言输入侧 port 的 y 坐标严格按声明序单调递增,输出侧同理。
2. **稳定性**:seed 布局取得各 pin y 序 → `addTrace` 加入新盒子和边 → 重布局 → 断言 seed 盒 pin 的同侧顺序不变。
3. **精确行坐标**:布局后每个 pin 中心 y 精确等于 `PIN_ROW0 + i·PIN_PITCH`(标题带被保留的直接证明)。
4. **锚点外移 + 透传 + 去重**:`toLaid`(合成 ELK 输出夹具,纯函数)菱形坐标位于 ELK 锚点外侧 10px;bus/netName 正确透传;unknown-edge 回退 bus=false/net="";同起点 fanout 只有第一条带 net。
5. **紧凑尺寸**:`nodeDims` 对 kind=port/logic 返回紧凑尺寸,对 module 用 `46 + rows·22 + 12`。

e2e:`tests/e2e/schematic.spec.ts` 强化 —— 先通过 `window.__hierStore` 把 seed 的全部 pin 都 trace 一遍长出真实锥(断言 edges > 0),再测 pan ≥50fps。这样门禁真正覆盖新增的 O(pins) 标签 + O(wires) net 名的重绘负载;若掉帧,用 `Layer/Group.cache()` 位图化(记为 LATER,证据驱动)。

手动验收(gps_baseband):tc4 场景重走 mockup 剧本 — 右键 tc4 开原理图,依次追 `clk`、`pre_tic_enable`、`tic_enable`、`carr_nco_fc` 的 fanin;核对:pin 名可读、连线终点就是所点的 pin 且位置不动、time_base 以模块盒出现、行为级源头以紧凑符号出现且双击开 HDL、连线带 net 名。

## 5. 风险与备注

- ELK `FIXED_POS` 行为(端口钉在给定坐标、边端点落在 pin 行):已实测(elkjs 0.11 probe)+ 单测 1/2/3 锁死。
- Konva Text 数量上升(每 pin 一个标签,50 盒 × ~20 pin ≈ 1000 Text):全在 `listening=false` 静态层;强化后的 e2e 门禁(追线后测帧率)守住;实测掉帧再上 `Group.cache()`。
- 长标签盒子会变宽:接受(Tessent 同样行为),不做截断。
