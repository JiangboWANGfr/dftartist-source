# C++ 上层分析消费者

本目录提供独立于界面的 DFT 分析与规划。以下是当前已有的入口；后文按功能逐次扩展的顺序说明参数，单个入口的限制不代表整个目录尚未实现相邻能力。

| 原生入口 | 已有能力 | 主要 C++ 接口 |
|---|---|---|
| `dft-seqcheck` | RTL 寄存器统计、时钟/复位结构检查、控制源与场景分析、范围归因及源码证据 | [Check.h](sequential/Check.h)、[RegisterStatistics.h](sequential/RegisterStatistics.h)、[SourceInvestigation.h](sequential/SourceInvestigation.h) |
| `dft-objects` | 实例、端口、信号清单，为约束对象查询提供设计事实 | [ObjectCatalog.h](objects/ObjectCatalog.h) |
| `dft-memory` | 宏接口及模型映射、控制器分组规划、资源/功耗/依赖调度、计时、覆盖、时钟检查与配置比较 | [MemoryInvestigation.h](memory/MemoryInvestigation.h)、[MemoryTestPlan.h](memory/MemoryTestPlan.h)、[MemoryTestAssessment.h](memory/MemoryTestAssessment.h) |
| `dft-wrapper` | 边界调查、单元与链规划、覆盖、时钟/复位兼容检查、活动调度及诊断 | [Boundary.h](wrapper/Boundary.h)、[ChainPlan.h](wrapper/ChainPlan.h)、[ChainExplanation.h](wrapper/ChainExplanation.h) |

这些库通过公开 `hier::Design` 接口读取 Core 事实，领域规则在本目录实现。桌面应用可通过 [Node Host/Session](host/README.md) 调用四个原生工具；可安装的 CLI 见 [packaging](packaging/README.md)。现有 Studio 接入位于仓库的 `integrations/`，不属于分析算法本身。

`dft-objects` 尚不是 SDC/Tcl 执行器；寄存器统计不是综合后的 Scan 链。Wrapper 和 Memory 输出为分析与条件规划，当前不生成 Scan 插入网表、MBIST 控制器 RTL 或 ATPG。各项独立验收及未关闭问题以 [REVIEW_LOG](../docs/REVIEW_LOG.md) 为准，不能仅凭入口存在或构建通过认定全部分析能力完成。

`dft-memory` 现在支持显式存储器模型映射（[契约](../docs/DESIGN.md#78-显式存储器模型与rtl接口映射)）：

```sh
cmake --build core/build-analysis --target dft-memory dft_memory_map_unit -j 4
ctest --test-dir core/build-analysis -R '^a_memory_map_' --output-on-failure
core/build-analysis/analysis/dft-memory --top map_top --scope map_top.plain \
  analysis/tests/memory-map.sv --model plain_ram 3 4 \
  --role plain_ram address addr none --role plain_ram data_in din none \
  --role plain_ram data_out dout none --role plain_ram clock ck negedge --require-complete
```

`--model DEF WORDS BITS` 声明精确定义、深度和数据位宽，可重复；当前支持独立数据输入/输出的单读写接口。
每个模型须明确 address/data_in/data_out/clock 四个角色，可加 chip_enable/write_enable/output_enable/write_mask。
`--role DEF ROLE PIN SENSE` 指定引脚，数据/地址的 SENSE 为 none，clock 为 posedge/negedge，
enable/mask 为 high/low。`--mask-lane DEF BITS` 指定每个掩码位管理的数据位数，默认 1。
模型、角色参数可任意顺序；禁止与旧 `--definition` 混用，避免两套选择范围。

映射逐实例检查地址宽度、数据宽度、方向和掩码粒度，输出 matched/mismatch/unmapped、具体问题和原引脚索引。
额外引脚、缺失引脚及 unknown 方向不会被模型声明覆盖。`matchedCapacityBits` 只合计已发布 matched 实例的声明容量，
不推断内部 RAM 功能；模型中的极性/时钟沿仍是调用者声明，未验证 RTL 功能是否符合。
原接口报告、父绑定、partial 和显式 `--clock-pin` 追踪完整保留；模型 clock 角色不会自动发起结构追踪。
新增 `--map-max-macros/work/millis` 控制映射阶段，预算不足只发布完整行；原阶段预算独立保留。
`--require-complete` 遇不匹配或任一阶段 partial 返回 4。

库 [MemoryMap.h](memory/MemoryMap.h) 接受未改写的宏接口结果，可在 Design 释放后运行；
新 [memory-map Schema](memory/memory-map.schema.json) 封装原 interfaces 与 mapping。
无 `--model` 时旧格式/命令保持。本映射入口不解析 TCD、不补写 Core 库方向；控制器规划由后文的 `--plan-tests` 入口提供。

新增独立宏接口调查入口 `dft-memory`（[契约](../docs/DESIGN.md#77-mbist所需的宏接口调查)），
为后续 MBIST/memory-map 提供指定宏的引脚、父层绑定和时钟结构来源。
使用 `HIER_BUILD_ANALYSIS=ON` 配置后：

```sh
cmake --build core/build-analysis --target dft-memory dft_macro_interfaces_unit -j 4
ctest --test-dir core/build-analysis -R '^a_macro_interfaces_' --output-on-failure
core/build-analysis/analysis/dft-memory --top macro_top --scope macro_top --recursive \
  --definition ram_model --clock-pin CLK analysis/tests/macro-interfaces.sv --require-complete
```

`--definition` 精确匹配 Core 的定义名称，可重复；`--clock-pin` 明确指定要追踪的引脚名称，可重复。
选择依据由调用者提供，不从名称猜 RAM、容量、端口角色或技术库。默认仅查询 scope，
`--recursive` 才遍历后代；共享定义的不同实例分别保留，子树查询仍可取得 scope 外的父层连接。
报告包含原对象目录、原 PortInfo/ObjectInfo/PinBinding，以及指定时钟引脚的原结构 cone。
库入口见 [MacroInterfaces.h](memory/MacroInterfaces.h)，返回拥有值；机器边界见
[严格 Schema](memory/macro-interfaces.schema.json)。

目录与宏详情各有软预算，`--help` 列出全部参数。预算不足只保留完整宏行，标明 partial；
缺失引脚、未知绑定、逻辑过程或黑盒时钟边界也保留为 partial，不据此推断完整时钟树或 MBIST 可测性。
`--require-complete` 遇 partial 返回 4，默认成功为 0；坏参数/目标或设计无效/执行失败分别为 2/3/5。
单次 Core 提取、编译和整向量不受硬时间/内存保证。宏接口调查本身不执行控制器规划；模型映射及 `--plan-tests` 在其结果上继续分析。

新增独立 RTL 对象清单入口 `dft-objects`（[契约](../docs/DESIGN.md#76-sdc所需的rtl对象清单)）。
它为后续 SDC 对象查询提供实例、端口和信号的公开事实；当前不执行 SDC/Tcl，也不推断物理单元。
使用同一个 `HIER_BUILD_ANALYSIS=ON` 构建配置：

```sh
cmake --build core/build-analysis --target dft-objects dft_object_catalog_unit -j 4
ctest --test-dir core/build-analysis -R '^a_object_catalog_' --output-on-failure
core/build-analysis/analysis/dft-objects --top catalog_top --scope catalog_top \
  --recursive analysis/tests/object-catalog.sv --kind port --text left --require-complete
```

`--kind instance|port|signal` 可重复指定，默认全选；`--text` 是区分大小写的名称或规范路径字面子串，
不是通配表达式。默认只查 scope，`--recursive` 才包含子实例。输出保留 Core 的规范路径、实例归属、
原引用、方向、类型和位宽；端口与内部信号不做电气合并。实例按广度优先遍历，每实例先自身，再端口、信号。
`--page-size` 只改变查询分页，完整结果的对象集合及顺序不变。

静态库 `dft_objects` 的 [ObjectCatalog.h](objects/ObjectCatalog.h) 提供 `enumerateObjects`，
返回拥有值；`signalStatus` 保留普通实例的 Core 质量，黑盒/primitive 的内部信号则明确标为未知。
预算截断保留已发布对象前缀和原实例归属，不能把没有返回的对象当成不存在。
`--max-instances/--max-objects/--max-queries/--max-work/--max-millis` 控制遍历预算；
这不限制编译、单次 Core 提取或 ports 整向量的硬时间/内存。初始三次查询建立真实 scope 和快照。
默认成功 exit0；`--require-complete` 遇 partial 为 exit4；参数/目标或设计无效/执行失败分别为 2/3/5。
库支持协作取消，CLI 保留进程信号行为。输出采用独立 [严格 Schema](objects/object-catalog.schema.json)，
原 `dft-seqcheck` 的 30 种格式保持不变；本入口不增加 Core NDJSON 或界面方法。

`dft-seqcheck` 经公开 `hier::Design` 查询 RTL 时序事实与结构连接。规则和报告属于
DFT 分析层；内核、原 `hier` CLI 和四个 TypeScript 包没有新增领域规则。
该入口可独立使用，也可由上面的 Node Host/Session 调用；宿主界面和 Tcl 命令接线在 `integrations/` 中维护，不向 Core NDJSON 加入领域方法。

```sh
cmake -S core -B core/build-analysis -DHIER_BUILD_ANALYSIS=ON \
  -DHIER_SCHEMA_PYTHON=/path/to/python-with-jsonschema
cmake --build core/build-analysis --target dft-seqcheck dft_sequential_unit dft_logic_unit dft_usage_unit dft_gates_unit dft_values_unit -j 8
ctest --test-dir core/build-analysis -R '^a_sequential_' --output-on-failure

core/build-analysis/analysis/dft-seqcheck --top clean --scope clean --recursive \
  analysis/tests/design.sv --require-complete --fail-on-error
```

生产构建默认 `HIER_BUILD_ANALYSIS=OFF`。输入支持原始文件、`-f`/`-F` 文件列表、
`-I` 及 `-D`，路径含义交给原 Core；scope 必填且须唯一解析为实例，不猜叶名称。
`--recursive` 才枚举子实例，控制来源始终可沿结构绑定追至设计的真实顶层。

报告的 `registers` 是 Core 的时序写入**事实**，不是综合 DFF/Scan 位数。
每条事实保留原实例引用、位段、clock/async、过程引用和源码位置；同一定义的不同实例
分别列出。`clockCheck` 和 `asyncChecks` 引用当前报告的 `checks` 数组，未检查为 null。
相同 ref/位段的控制只追踪一次，可被多条事实及 clock/async 两种角色引用；
findings 按检查项与规则去重，仍可反查所有使用该检查项的事实。

本版 `CLK-UNCTRL` / `RST-UNCTRL` 仅在完整、精确结构追踪无顶层主输入，且来源明确为
未驱动/常量时报告 error。到顶层 input 为 `primary_input`，只表示结构来源；
内部过程/时序逻辑停止为 `logic_boundary`，黑盒、混合/保守来源或截断为 `unknown`。
这些待分析项使报告 partial；不穿透组合表达式猜控制能力，不识别门控、测试旁路、库触发器、
锁存器或同步复位，不替代签核 DFT-DRC/ATPG。空的已完整建模范围可 complete/零事实；
递归遇未建模实例不能据零事实称全设计 clean。
报告的 completeness 仅描述本次请求和已建模事实；快照的 `inputHashComplete` 原样保留，
不因本次检查 complete 就宣称全部输入已哈希、可精确重现或结果具有持久 freshness。

默认最多 10000 事实、10000 实例、1000 控制点；累计最多 10000 图节点/40000 图边，
单次追踪最多 1000 节点/4000 边、深度 64、100ms，分析阶段默认 30000ms。
`--help` 列出显式预算覆盖；达到预算保留已证实违规、原 TraceResult/completeness/frontier，
并将缺失项标 partial。分析时间从已打开设计开始，非首次编译或操作系统硬截止保证。
库接受协作取消 token；命令保留原生进程信号终止行为，不打印伪造成功。

默认执行成功即 exit0，允许发现违规；`--fail-on-error` 有 error 时 exit1（warning 不触发），
`--require-complete` 遇 partial 为 exit4（优先于违规策略）。参数错误 exit2，
编译无效/目标不存在（含完整解析未找到的 scope）exit3，执行失败 exit5；
scope 语法错误、歧义或解析到非实例为 exit2，scope 解析不完整为 exit5。
缺失 scope 的 error.code 为 not_found；此前返回 invalid_arguments/exit2 是已修复的政策差异。
失败输出 error，不输出半个成功报告。
`report.schema.json` 是新命令 v1 的机器边界，引用原 Core Schema7 定义，不修改其内容。
其运行时/引用完整性回归是 A 自测，新单元的独立 B/C 验收尚未完成。

## 显式逻辑来源模式

增加 `--logic` 才启用 v2 报告（算法 `rtl-control-sources-v1`），默认命令仍输出原 v1。
v2 使用独立 [Schema](sequential/logic-report.schema.json)，旧 v1 validator 会明确拒绝，
不会把新增规则当成旧格式解释。`--version` 继续描述默认 v1；原 Core Schema/协议不变。
分析静态库的 Request/Control/Report 布局增加，C++ 消费者需同批重编，不承诺二进制 ABI
兼容；Request 新字段追加，旧 aggregate 源码调用的原字段位置保持。

在原完整、精确的结构追踪停于内部逻辑时，用公开 `step` 与 `proc` 解释单控制位：
支持 assign/init 的引用、二进制四态常量、取反、拼接、按位与/或/异或，以及常量条件或
相同分支的 mux。严格依照 `Write.exprMap` 将目标位映射到 RHS 位，不按 writes 顺序或
依赖表猜位号。`other`、宽度转换、port_expr、无值树的过程块、循环、多驱动和未知映射
停止推导。一般门控或未知选择器仍为 logic_boundary/partial，不推断测试旁路。

直接追到 RTL register 产生 CLK-GEN/RST-GEN；它只证明当前受支持结构中的时序来源，
不等于已验证测试模式不可控。`checks[].logic` 保留原 step/proc 响应、来源点/ref、
四态常量结果和取反次数。来源分类描述单个主输入/寄存器的结构及有效 0/1 翻转关系，
不承诺输入为 X/Z 时表达式与原信号逐点相等；常量结果本身按四态语义计算。

process/register 跳仅定位驱动身份，不沿 conservative 依赖推值；完整 Expr 和精确
exprMap 可以提供独立值证据，原保守依赖仍原样保留。Core 语义 partial、保守绑定、
不支持表达式或预算停止都不会变成完整负向结论。
`--max-logic-work` 默认 10000、范围 1..1000000，仅与 `--logic` 合用；点、查询/跳、
表达式及目标映射/端口检查按全报告累计计费，`maxDepth` 也限制解释嵌套深度。
单次 Core 提取/proc 返回仍不受硬堆/硬时限保证。可用：

```sh
core/build-analysis/analysis/dft-seqcheck --top logic_derived --scope logic_derived \
  --recursive analysis/tests/design.sv analysis/tests/logic.sv --logic --fail-on-error
```

该示例输出真实 CLK-GEN/RST-GEN，按显式政策 exit1；不是执行崩溃。

## 时钟的非时钟用途

再加 `--clock-usage` 才启用 v3（`rtl-control-usage-v1`）。它要求 `--logic`，
沿每个已枚举 clockCheck 的**精确结构绑定**双向查找电气别名，记录别名作为 RTL
寄存器 data/control/async 输入的精确依赖，产生 `CLK-AS-DATA` / severity `warning`。
同一原始检查点只执行一次；多个实例仍各有原检查点，不按定义或名称合并。
总线按原平坦位映射，其他位不会仅因属于同一信号而被视为时钟用途。

这是直接顺序逻辑用途检查。组合过程可能是时钟 buffer，也可能是数据逻辑；
单凭读取时钟不能告警，因此不穿越组合过程，遇到下游 process 停为 partial。
保守依赖、黑盒/primitive、未知绑定也保持 partial，不用潜在关系充当正证据。
源头和用途分账：即使控制来源不完整，独立精确的本地用途仍可以报告警告。
`complete` 仅指所请求结构别名域已枚举，不能推出整个组合逻辑或全芯片 DFT clean。
用途可以落在寄存器 scope 之外；scope 限制检查哪些时钟，别名枚举覆盖打开的设计。

`clockUsage[].check` 引用原 checks；每项有 complete/reasons/work、带方向的原 step
响应及 witnesses。每个 witness 的 step/hop/continuation 是当前证明数组的下标，
role 与原 continuation 一致；不解析 opaque fact/ref，不改写原关系的精度。
全报告 `--max-usage-work` 默认10000、范围1..1000000，计费点/请求/跳/continuation，
共享原 maxDepth/分析deadline/协作取消。预算不足保留已证实警告，标明 partial；
单次 Core 查询/编译仍无硬截止或硬堆保证。

```sh
core/build-analysis/analysis/dft-seqcheck --top usage_cross --scope usage_cross \
  --recursive analysis/tests/design.sv analysis/tests/usage.sv \
  --logic --clock-usage --require-complete --fail-on-error
```

该例报告一个 warning，执行 exit0。error/partial 退出政策保持原语义。
v3 的 [机器 Schema](sequential/usage-report.schema.json) 离线复用 v2/Core 定义；
旧 v1/v2 validator 明确拒绝 v3。不加新 flag 时原 v1/v2 输出字段/规则保持。
分析静态库 Request/Report/Finding 布局变化须同批重编，旧 Request aggregate 字段顺序保持；
原 Core ABI/协议/依赖/工程文件不变。本批新分析待统一独立 B/C，不代表完整六条 DRC。

## 显式时钟根与门控证据

`--logic --clock-root PATH BIT`（可重复，最多64个）声明真实顶层input端口的时钟位。
BIT是Core平坦位偏移，例如`input [7:4] clocks`的BIT3指HDL的clocks[7]。
根按公开path.resolve/ports校验，允许同一路径同时解析到端口与其内部signal，但只接受
唯一顶层input端口；内部信号/子端口、越界/重复语义位为exit2，不存在的根为not_found/exit3。
声明不强制任何逻辑值、不改变Core事实、不从信号名猜时钟或使能。

只有指定根才输出独立v4/rtl-rooted-gates-v1，[Schema](sequential/gates-report.schema.json)
离线复用原三版/Core，旧validator明确拒绝。可同时带--clock-usage；不带root时原三版
成功报告保持，缺失scope的政策修复对所有模式生效。

现有assign/init值解释/精确exprMap/常量折叠之后，对单个AND/OR门，若恰有一个操作数
源于声明根，另一操作数为PI/RTL register/undriven，记录gated结果。
`logic.gates`保存过程ref、目标位、原expr中的args路径及结果bit、clock/enable来源和反相；
最终`logic.result.gate`引用实际结果的证据。可能旁路mux/嵌套门控中的候选证据不能单独产生finding。
两个声明根参与同一门、未知来源、unsupported过程或一般mux仍停止，不推断测试旁路。

gated保持partial/需要测试协议，PI enable不产生不可控警告；RTL时序来源或未驱动enable
才对clock角色产生CLK-GATED warning。async角色不误用此规则。常量开/关继续走原source/
constant规则；warning不触发fail-on-error，require-complete仍exit4。
这是受支持RTL门控结构的早期lint，不识别库ICG、不证明波形或签核不可控；反相沿用有效0/1来源约定。
根解析受64项上限、取消与分析deadline约束；根匹配计入原maxLogicWork，不新增全局缓存。

```sh
core/build-analysis/analysis/dft-seqcheck --top gates_generated --scope gates_generated \
  --recursive analysis/tests/design.sv analysis/tests/gates.sv \
  --logic --clock-root gates_generated.clk 0
```

该例给CLK-GATED warning、partial、默认exit0。新Request/Report/LogicValue布局须消费者
同批重编，旧aggregate源码字段位置保持，Core ABI/协议/预算/依赖/工程格式未改。
新门控单元待独立B/C复核；对旧退出政策finding的作者修复/执行不能代B关闭。

## 显式输入值下的条件分析

`--logic --input-value PATH BIT 0|1`指定最多64个顶层input平坦位的静态值，可重复组合。
只在公开查询完整、精确地到达该顶层输入位时读取该值；不强制内部/子端口/inout，不修改
Core或原step/trace/proc响应。重复语义位（包括相同值）、越界/非法值为exit2，缺失输入
为not_found/exit3。输入位解析与clock-root共用模块，原ClockRootInput/ClockRoot源码名字保留。

带此参数才输出v5/rtl-input-values-v1，显式`interpretation=under_input_values`；
`inputValues`保留所有canonical输入点/值，`logic.appliedInputs`列出本次解释实际读取的
上下文下标（访问记录，不保证最小依赖集合）。没有读取的输入仍在上下文表中，不伪造生效。
v5保留空clockRoots/gates表示没有声明根，可与clock-root/clock-usage合用。
无input-value时原四模式成功报告保持，四旧Schema不变；[v5 Schema](sequential/values-report.schema.json)
离线复用既有定义，旧validator明确拒绝条件报告。

静态值可使AND/OR门开/关或选择mux旁路。精确原primary_input也会在该上下文中重新解释，
指定为固定值的clock root不再被当作可切换PI；Core partial/保守/混合仍不升级。
静态固定时钟/异步输入可能产生原CLK-UNCTRL/RST-UNCTRL，结论只对该组值成立；
固定复位可能是有意的测试条件，此报告不判断是否符合完整测试协议。
clock-usage仍报告原电气绑定/角色用途，不随静态值剪除物理关系。

```sh
core/build-analysis/analysis/dft-seqcheck --top logic_bypass --scope logic_bypass \
  --recursive analysis/tests/design.sv analysis/tests/logic.sv \
  --logic --input-value logic_bypass.sel 0 1 --require-complete
```

示例静态选择顶层clk旁路，条件内来源为PI；把sel设0则来源为RTL register并报告CLK-GEN。
这不是原RTL无条件结论，也不证明模式切换/时序协议、X/Z波形、综合器件或签核。
每类解析最多64项，原deadline/取消保持；匹配输入值计入全报告maxLogicWork，缓存仅限
本次解释上下文，预算不足保留partial；单次Core调用/首次编译非硬时间/堆上限。
静态DTO/helper符号变化仍须消费者同批重编，旧aggregate字段位置保持，Core API/ABI/协议/
Schema7/依赖/生产预算/工程格式不变。没有保存约束到工程或接入Studio/Tcl/IPC/GUI。

## 同一设计上的命名场景与来源比较

重复 `--scenario NAME` 启用独立封装 `rtl-scenario-sources-v1` / formatVersion1：
同一次 Design::open、同一不可变快照运行2..8个场景。NAME非空、唯一、最多128个UTF-8字节，
可含空格/中文。要求 `--logic`，其后的 `--input-value` 属于当前场景，每场景最多64项；
禁止在第一个scenario之前指定input-value，没有隐含全局值或覆盖顺序。其它flag始终公共，
放在场景分隔符前后含义相同；不影响原单请求入口。首个场景为比较基准。

```sh
core/build-analysis/analysis/dft-seqcheck --top logic_bypass --scope logic_bypass \
  --recursive analysis/tests/design.sv analysis/tests/logic.sv --logic \
  --scenario FUNCTIONAL --input-value logic_bypass.sel 0 0 \
  --scenario SCAN --input-value logic_bypass.sel 0 1 --require-complete
```

该例生成一个完整封装：内部时序源变为PI旁路，有1个changed，根clock和reset两项unchanged。
两份原完整报告都保留，FUNCTIONAL原CLK-GEN不会因为SCAN无告警被丢弃；默认exit0，
若加fail-on-error则任一场景error导致exit1。partial的require-complete/exit4仍优先。
某个已执行场景参数/输入解析失败或取消，整批返回原Error，不输出之前的半成功封装。
缺失scope仍exit3，原参数2/执行5政策保持。

[新封装Schema](sequential/scenarios-report.schema.json)离线引用原v2–v5的Report定义，
不允许把嵌套Error作为成功场景；五旧Schema都拒绝封装。`common`保存原公共scope请求、
根请求、模式和逐场景请求预算；每个内嵌报告记录其实际生效预算与canonical点。
场景条目保留inputValuesRequested，未开始的场景为not_run/budget_time，不能称其输入已校验。
`comparisons`按完整控制点ref/lsb/width/side的并集匹配，baselineCheck/scenarioCheck引用
各自原报告checks，缺失为null；不假设数组下标相同、不按定义/名字合并、不解析opaque标识。

来源描述包括kind、完整来源point/sourceRef和反相奇偶；常量保留0/1/x/z。
只有已证明单比特PI、RTL register、常量或未驱动来源才给changed/unchanged；两端的kind/
来源身份/有效0/1极性相同才unchanged。它不是完整逻辑结构、X/Z波形、可达性或测试协议等价证明。
没有logic的完整结构报告只在唯一且有充分身份的终点投影；无位段point的unconnected、
多终点、unknown、logic_boundary、gated及缺失项都为unresolved，使整批partial，
即使原场景报告本身complete。原告警全部保留，不从无告警推定问题已修复。
其它控制点的不完整不抹去已有正向来源变化；summary统计输出行，不冒完整设计覆盖。

原预算逐场景生效，最多8份原始报告，堆使用不等于单报告预算。
另有整批 `--max-scenario-millis` 默认60000/范围1..60000的软时限（Design打开后起算），
和 `--max-comparisons` 默认10000/范围1..100000的全局输出行上限；两flag只在场景模式可用。
有效分析时间取原maxMillis与剩余整批时间的较小值，已跑场景有partial则整批partial；
来不及开始的场景显式not_run。比较/映射过程也检查时间和取消，时间/行截断保留所有已跑报告
及比较前缀，标明budget_time/budget_comparisons。单次Core调用/编译不是硬时间或堆上限。

新增拥有值的ScenarioRequest/ScenarioReport与compareScenarios公开C++入口，Design仅调用时借用；
旧Request/Report布局和analyze签名未变，分析消费者仍应按当前静态库同批构建。
公共scope/请求校验、结构化常量语法和报告writer共用原实现，Core API/ABI、协议2/Schema7、
依赖/默认生产预算/工程格式不变；无Studio/Tcl/IPC/GUI/持久化接线。本单元待批次独立复核。

## 控制来源清单与事件引用

`--source-inventory`在原单报告或场景批次分析后，按已证明的**来源身份与极性**分组，
列出来源组的原checks和registers事件引用。支持原结构模式、logic/根/输入值/usage和多场景；
不改变Core查询、不扩大scope或重新分析。多个检查点可共享来源，一个检查点也可同时用于
clock与async或多个事实；所有这些事件均保留。`role`/`asyncIndex`指回原事实的clock/async，
edge/type/位宽仍以原事实为准。常量按值分组；组数、成员数都不是独立物理源/DFF/Scan位数。

```sh
core/build-analysis/analysis/dft-seqcheck --top logic_derived --scope logic_derived \
  --recursive analysis/tests/design.sv analysis/tests/logic.sv --logic --source-inventory
```

该例将同一RTL时序来源的clock与async成员归在一个来源组，保留原CLK-GEN/RST-GEN。
与`--scenario`组合时，各已跑场景有独立清单，not_run不生成清单，不跨条件合并来源或计数。
新封装为formatVersion1/rtl-control-inventory-v1，`analysis`完整保留原单报告或原场景封装，
`inventories[].scenario`为原场景下标（单报告为null）。[机器Schema](sequential/inventory-report.schema.json)
离线加载Core、v1–v5及scenario Schema；六旧Schema拒绝该封装。无flag时旧输出不变。
`groups[].checks`为原检查项下标，members的record/check/asyncIndex引用同一原报告；
`unresolved`保留已处理但没有充分来源身份或因组预算未分组的检查项。

来源投影与场景比较共用ControlSource/SourceIdentity；旧ScenarioSource结构体标签保留，ControlSource为同一类型的公共别名。
unknown/gated/无位段身份终点不能按名字/文本/无告警合组。清单partial包括原报告partial、
来源未决、检查缺失和任意预算截断，require-complete仍优先exit4；fail-on-error仍只看原findings。
清单完整也只涵盖原报告已枚举的RTL控制事件，不证明物理扇出、时钟树、波形或测试协议。

逐清单限制（场景最多8份，非整批总堆/时间限制）：
`--max-inventory-groups`默认10000/1..10000，`--max-inventory-members`默认100000/1..1000000，
`--max-inventory-work`默认1000000/1..10000000，`--max-inventory-millis`默认1000/1..60000。
这些参数须配合source-inventory，非法预算exit2；时间是原分析之后的单独软时限。
work计每检查、结构投影边/节点及原clock/async事件访问。组满时仍可并入已知组，新增组的
检查项保留budget_groups；work/time停止留检查前缀，成员满保留成员前缀及budget_members。
processedChecks/visitedEvents/work区分已处理检查、访问过的事件（可含未保留的一项）与工作量；
原输入inputChecks/inputFacts/inputEvents始终保留，未处理后缀不能当零扇出。
summary计各上下文清单条目，不跨上下文去重。不承诺硬截止或总堆上限。

公开`inventorySources(const Report&, InventoryLimits, Cancel)`仅借用原报告到调用结束，
不需要活Design；返回来源和值/索引均拥有。索引须配合同一原报告解释，不能套到另一快照。
先检查最多10000检查/100000事实/1000000事件的输入形状、重复控制点与引用越界；
此有界结构校验独立于work计数，错误为BadRequest，取消为Error不返回半成功清单。
它校验报告引用结构，不验证任意外部伪造报告的事实真实性。
新类型/API要求静态分析消费者同批构建，旧Request/Report及analyze/compareScenarios签名保持；
Core API/ABI、协议/Schema7/依赖/默认生产预算/工程格式不变，无Studio/IPC/持久化接线。

场景名称边界现已校验Unicode scalar UTF-8：非法起始/孤立continuation、截断、overlong、
surrogate和超U+10FFFF均在共享请求校验中拒绝，错误文案不回显非法字节。
合法中文/emoji和128字节边界保持；C-S2-02-01已由原C在cycle205按406021c修复正式关闭。

## 派生控制的生成链解释

`--logic --control-generation`从原报告的每个检查点开始，沿已证明的generated来源定位
RTL寄存器事实，再解释其clock/async控制，生成原始证据支持的依赖图。
只用公开origin对象的所属实例与registers分页结果按完整ref匹配，不解析opaque ID。
生成器可位于原scope之外，仍属于同一Design快照/原输入上下文；原报告范围与findings保持。
这是生成关系解释，不推寄存器Q值、数据逻辑/可达性/波形，不冒完整物理时钟复位树或DFT签核。

```sh
core/build-analysis/analysis/dft-seqcheck --top logic_derived --scope logic_derived \
  --recursive analysis/tests/design.sv analysis/tests/logic.sv --logic --control-generation
```

新增`controlGeneration(Design&, const Report&, GenerationLimits, Cancel)`，要求逻辑模式、
未改写且来自匹配Design的原报告；核快照/请求及共享报告引用形状，不证明任意伪造事实真实性。
返回所有新增控制证明/原查询页/事实/索引的拥有值，不跨场景或Design缓存；调用期间借用Design/Report，
结果的originalCheck与appliedInputs等上下文索引须配合同一原报告解释。

独立formatVersion1/rtl-control-generation-v1封装的analysis保留原单报告或场景封装；
可合用source-inventory，此时analysis保留原清单封装。graphs[].scenario为原场景下标，单报告为null，
not_run不构造图。七旧Schema拒绝新封装，无新flag时七旧成功输出不变。
[机器Schema](sequential/generation-report.schema.json)离线加载Core/v1–v5/scenario/inventory定义。

seeds指向原checks和图nodes；每节点保留完整点身份/路径/最短发现深度。原节点以originalCheck引用
旧证据，新节点以control拥有完整原trace/logic。来源投影和单点控制解析共用原实现，不复制判定规则。
generated节点以generator指向按原寄存器事实ref去重的generators；同一信号不同写入位/事实不按名称合并。
generator保留原RegisterInfo、实例/信号路径、registerPages的page/item及clockNode/asyncNodes引用，
异步事件顺序/edge/type保持原事实。expanded只表示其事件边已枚举，不等于子来源已证明安全。
查询页保留原cursor/响应/完整性，分页缓存仅本次图使用，避免同一owner重复全扫。

循环输出闭合generators路径（首尾相同）和逐边controls索引，可回到原clock/async事件核验；
这是DFS回边见证，非枚举所有简单环。任何已证明生成循环仍使图partial。
unknown/gated/无身份、原partial、未展开或预算不足同样partial；原findings全部保留，
require-complete仍exit4优先，fail-on-error仍依据原findings，图不会伪造新违规或“已修复”。
输入静态值只解释生成器控制事件，不把固定D/clock/reset推成生成器Q常量。

限制逐图适用（最多8图），在原分析/可选清单之后单独起算，非整批总堆/时间限制：
max-generation-controls默认1000/上限10000、generators1000/10000、facts10000/100000、
work1000000/10000000、depth16/0..1000、cycles64/1000、millis1000/60000、
trace-nodes10000/1000000、trace-edges40000/0..4000000、logic-work10000/1000000。
CLI选项均加`--`前缀，除depth/trace-edges外至少1，须配合control-generation，非法参数exit2。
生成深度从任一原seed起算，独立于原request.maxDepth所约束的单点逻辑追踪深度。
新控制点共享图的累计trace/logic预算；原seed证据只引用、不重复计这些新增查询数。
work计seed/投影边节点、事件调度/查询分派/返回事实访问、生成器展开及循环审计；
它不是Core调用总次数或字节数，单点解析另受累计trace/logic预算约束；registerFacts计实际返回事实。
截断保留seed/图/查询/循环见证前缀，inputChecks表明未处理后缀；未展开不代表不存在。
单次Core调用/有界输入校验非硬截止，取消传入Core，错误/取消不发布半成功封装。

为实际复用提取ControlResolver/ReportValidation与control/inventory writer，旧Request/Report/已有
API签名与ScenarioSource struct标签保持；静态分析消费者按当前源构建，不承诺新的ABI稳定。
Core API/ABI、协议2/Schema7、默认生产预算/依赖/工程格式不变，无Studio/Tcl/IPC/GUI/持久化接线。

## 生成控制结构的场景差异

`--logic --control-generation --compare-generation --scenario A ... --scenario B ...`在同一Design
场景生成图后比较每个原控制点的可达生成结构。比如原sink时钟直接来自同一second寄存器，
A中second由first产生、B中second直接受顶层clk驱动：直接来源比较仍unchanged，生成结构为changed。

```sh
core/build-analysis/analysis/dft-seqcheck --top generation_mode --scope generation_mode.u \
  analysis/tests/design.sv analysis/tests/generation.sv --logic --control-generation --compare-generation \
  --scenario DERIVED --input-value generation_mode.sel 0 0 \
  --scenario BYPASS --input-value generation_mode.sel 0 1
```

公开`compareGenerationScenarios(const ScenarioReport&, span<const GenerationContext>, limits, Cancel)`
不查询Design；GenerationContext只借用图，场景索引按所有已跑报告顺序且同快照/范围。
所有原报告/图须未改写。结果拥有point/状态/索引容器，索引仍需同一原图解释。
校验引用形状/身份/种子/事件/页，不认证任意伪造事实，不要求任意外部JSON反序列化输入。

独立formatVersion1/rtl-generation-comparison-v1，analysis保留完整原generation封装（可含清单），
contexts[].cones按原checks顺序，check/node/nodes引用原证据。nodes按完整控制point排序；
quality局部complete要求每个可达source明确、生成器全部clock/async展开、无循环/截断。
comparisons相对场景0，baselineCone/scenarioCone引用各context的cone下标；缺失/局部partial为
unresolved。完整cone按完整point与来源身份、生成事实ref/inst/signal/process/位及clock/async原事件
比较；显示路径、图下标/深度、分页/发现顺序不参与，生成反相不跨时序边乘算。
changed/unchanged仅表示此解释结构不同/相同，不是逻辑/波形/可达性/协议等价或安全结论。
原图/原批次partial使总质量partial，但仍允许不相关的完整局部cone作出有证据的比较。
not_run、未处理检查或生成器不当作unchanged；原finding/直接比较不改，exit4仍优先，error1仅原finding。

预算`--max-generation-comparison-cones`默认10000/1..80000、members100000/1..1000000、
rows10000/1..100000、work1000000/1..10000000、millis1000/1..60000，后四项均沿相同完整前缀。
均须配合compare-generation；该flag要求control-generation和2..8场景，非法参数exit2。
限制整次比较共享，不逐场景重置；原图生成后单独软时限。work计cone、节点/边调度与比较访问，
有界预校验独立于work，排序/校验/单操作非硬截止，不承诺全批堆界限。
输入最多8图、每图10000控制点/生成器、100000返回事实/页、1000000生成器事件。
inputCones保持已跑报告的原检查总数，processedCones/memberEntries/work和已保留行显式输出；
预算停止后保留cone/成员/比较前缀，截断cone为partial。members为各cone重复计条目，非物理源数。

[机器Schema](sequential/generation-comparison-report.schema.json)离线引用原generation定义，旧八严格
Schema拒绝新封装，无新flag旧格式保持。静态消费者同批构建，原Request/Report/ScenarioReport/
ControlGeneration布局和旧签名保持，Core/protocol/web/ABI/Schema7/协议2/工程格式/依赖及Studio不变。

## 独立寄存器位统计

```sh
core/build-analysis/analysis/dft-seqcheck --top stats_top --scope stats_top --recursive \
  analysis/tests/statistics.sv --register-statistics --require-complete
```

新`registerStatistics(Design&, StatisticsRequest, Cancel)`直接枚举RTL寄存器事实，不跑控制追源。
--register-statistics与logic/scenario/inventory/generation及原分析预算显式互斥，打开参数/显式scope/
recursive沿原入口；统计预算默认/上限见下表，均至少1且只适用此模式。

| 选项 | 默认 | 上限 |
|---|---:|---:|
| --max-statistics-facts | 100000 | 1000000 |
| --max-statistics-instances | 100000 | 100000 |
| --max-statistics-signals | 100000 | 100000 |
| --max-statistics-segments | 200000 | 2000000 |
| --max-statistics-work | 1000000 | 10000000 |
| --max-statistics-millis | 30000 | 60000 |

独立formatVersion1/rtl-register-statistics-v1，[Schema](sequential/register-statistics-report.schema.json)
引用原Core定义；原九格式不改。pages保留逐实例非递归registers原cursor/响应；facts的page/item/signal
索引与signals[].facts互相引用，instances保留原InstInfo，definitions按原def ref列实例与计数。
不同实例/信号不按名字或共享定义合并，参数化实例实际分别求和；空实例也保留。

各totals中facts/signals/factBits分别为已处理事实数/信号数/事实宽度相加；coveredBits为已完成信号
覆盖位并集之和，overlapBits为这些信号覆盖重数>1的位数，maxMultiplicity是最大原事实覆盖重数。
信号coverage.segments列扁平lsb/width/factCount，位洞不计，相邻同重数区间合并；不按声明宽度填满，
不将重叠本身定性为多驱动错误，不将RTL写入位当物理FF/Scan/宏存储数量。

returnedFacts含原页可能未处理后缀，totals.facts是已处理前缀；summarizedFacts/summarizedSignals
是已原子完成coverage的域。每信号只有整个已收集区间统计完成才发布coverage；预算中止时保留信号/
原事实但省略coverage，coveredBits只合计已完成域，partial下是明确下界而非未处理项为零。
instance.enumerated只指所有本地页已遍历，不证明提取complete；Core原质量/原因保留。
未建模blackbox/primitive/interface、任何Core partial/遍历/汇总截断使总partial，不能推全芯片存储统计。

所有整数用uint64范围并检查端点/加法溢出，Unsupported/CLI exit5且不发布半成功。
work计实例/查询分派/事实/信号元数据/子节点与区间访问；单Core/排序/有界记账非硬截止，
软时限不含打开编译，不保证总堆/硬取消。库预取消/错误返回Error，可再次使用Design；报告拥有原页、
事实/元数据和索引，Design释放后仍可读。参数exit2、scope不存在exit3、执行5，require-complete的
partial为4；没有新增finding，fail-on-error没有违规可触发，正常0。旧分析默认政策保持。

Core/protocol/web/API/ABI/协议2/Schema7/生产默认预算/工程格式/依赖及Studio/IPC保持；
新统计静态消费者同批重建，不承诺新ABI稳定，未接GUI/Tcl/持久化。

B48原18组CLI/33断言原样保存于tests/independent-generation（冻结1fb162d、字段拼写适配33fb393），
标准CTest的b48_generation_contract/cli直接执行；adapter仅给原runner分配新保留输出目录，
不改变断言/错误/skip/预期。先前三分析的独立接受范围见REVIEW_LOG B48/C205，新统计尚待复核。

## 寄存器原始事件分组

```sh
core/build-analysis/analysis/dft-seqcheck --top events_cross --scope events_cross \
  analysis/tests/event-groups.sv --register-statistics --register-event-groups --require-complete
```

`groupRegisterEvents(const RegisterStatistics&, EventGroupLimits, Cancel)`仅后处理同源未改写报告，
不查询Design，可在其释放后执行；返回事件值和索引容器拥有，索引须配合同一原统计解释。
新formatVersion1/rtl-register-event-groups-v1的analysis保留完整原统计，groups以clock和有序async
完整原事件分组：clock含signal/lsb/width/edge，不带异步type；async另保留type。
原始不同ref/位/边沿/异步元组不按显示名或共享定义合并，也不推主输入等价或物理时钟域。
缺身份的事实独立未决组，identityComplete=false，不参与已证明的跨组归属，不因空字段相同合组。

signals列(group,原signal索引)及原facts成员、可选coverage；groups.signals引用这些对，
各组totals沿原StatisticsTotals含义统计，signals是组内条目，不代表跨组唯一信号数。
summary.groupCoveredBits是组内去重后求和，可重复计不同组的同位，不能冒原统计全局并集。
attributions仅列已完整分配、事件身份明确且有多个组的原信号；其segments保存同时覆盖该位的
不同group索引，crossGroupBits按位去重。同组多事实重叠不算跨组；三组同写4位是4个跨组位，
不是groupCoveredBits减原coveredBits所得8。不同组覆盖不同位时也保留归属记录和空交叠段。
checkedSignals还计已经检查的单组原信号；截断/未知项不冒无交叠。原页/进程/事件仍在analysis可查，
不将重叠自动定性为多驱动错误或DFT违规。输入partial或任意截断保持总partial，保留其它完成证明。

预算逐比较共享，在原统计后单独软起算：--max-event-groups默认100000/1..100000、
--max-event-group-members100000/1..1000000、--max-event-group-segments200000/1..2000000、
--max-event-group-overlap-members100000/1..1000000、--max-event-group-work1000000/1..10000000、
--max-event-group-millis30000/1..60000。均要求register-event-groups，此flag要求register-statistics。
组/成员满停止收集前缀，仍可汇总已收集域；work/time可截断后续。segments共享组内和交叠段，
overlapMembers限交叠段group索引数量。coverage及单信号归属均原子发布，未完成不发布半段。
inputFacts/inputSignals、processedFacts、checkedSignals及work/segmentCount/overlapMembers显式保留。
有界预校验独立于work：最多1000000事实/100000信号、实例、定义/1100000页/4000000原事件，
核索引和factBits一致性、不认证伪造事实。取消/错误无半成功，整数检查溢出；排序/校验/单次操作
非硬截止，不保证总堆。require-complete沿partial4优先，统计无finding/正常0，原2/3/5政策不改。

[严格Schema](sequential/register-event-groups-report.schema.json)引用原统计/Core定义，十旧成功
格式拒绝新封装；无flag旧模式保持。共用原区间/整数、事件身份、统计writer，旧DTO布局/API保持，
静态消费者同批构建；Core/protocol/web/API/ABI/Schema7/协议2/默认预算/工程格式/依赖及Studio不改。

## 寄存器控制来源与位覆盖

在原统计和原事件分组之上显式运行：

```sh
dft-seqcheck --top TOP --scope TOP -F FILELIST --recursive \
  --register-statistics --register-event-groups --register-control-profile --logic
```

`profileRegisterControls(Design&, const RegisterStatistics&, RegisterControlOptions, Cancel)`
复用现有单点控制解析，可加原`--clock-root PATH BIT`/`--input-value PATH BIT 0|1`；
静态上下文只影响本报告解释，不改Core事实。要求原统计属于该Design快照，错误/取消不返回半成功。
新`rtl-register-control-profile-v1`封装完整原事件报告（再含统计），保留每原组事件的check下标、
完整原trace/logic证明和已证实source。原十一模式无flag输出保持，旧Schema拒绝新封装。

cohorts按clock的已证明来源+极性+原edge分组；async独立解释保留，不作clock cohort身份。
同clock根的多个别名/不同reset组可归同cohort，对同一原state signal重新求事实位并集，
不是把各组位数相加；cohort之间也不合成全局去重FF/扫描数。保留constant/generated/undriven种类，
不能把已知来源当可控或安全；unknown/gated不猜来源，保持partial，零新finding不等于DFT clean。

可用原单点`--max-checks`(1000/10000)、`--max-trace-nodes`(10000/1000000)、
`--max-trace-edges`(40000/0..4000000)、`--max-depth`(64/0..1000)、
`--max-logic-work`(10000/1000000、须logic)、`--max-millis`(30000/60000)。
新增`--max-register-control-work`(1000000/10000000)、`--max-register-control-members`(100000/1000000)、
`--max-register-control-segments`(200000/2000000)，除上述明确0范围均至少1。
原统计/分组预算仍独立；profile时限在分组之后软起算，单查询/校验/排序不保证硬time/heap。
processedGroups/visitedEvents/attributedFacts及summarized域分账；成员是组/组内信号/事实访问前缀，
coverage只对已收集域整信号原子发布，缺项非零；输入partial/未知/截断均保持总partial。
正常0（fail-on-error无新增finding触发）、require-complete partial4优先及原2/3/5保持。
完整契约见DESIGN7.5.11；Core/协议/工程格式/依赖不改，无Studio/Tcl/IPC/UI接线，独立B/C待复核。

## 已解析完整事件组合

```sh
dft-seqcheck --top TOP --scope TOP -F FILELIST --recursive \
  --register-statistics --register-event-groups --register-control-profile --register-resolved-events --logic
```

`groupResolvedRegisterEvents(statistics, profile, limits, Cancel)`仅后处理同源未改写报告，不查询Design；
要求快照/scope/原事件/point/索引/source proof投影匹配，结构校验不认证任意伪造事实。
返回拥有来源值与索引容器；原组/事实下标须配原profile/统计解释，Design释放后可执行。

clock-only cohort不包含async；本层只有clock及全部有序async的来源齐全才按完整来源/极性/原edge/type合组。
同根alias完整组合相同可合，reset/set、边沿/极性/原async顺序差异保留；unknown type按原文保留，不当reset猜。
unknown/gated/缺事件映射不借clock cohort填补，rows显式未决；这是来源元组，不是物理时钟域/波形等价或DFT签核。
每新组/原state signal重新求位并集，跨不同组合共享位按精确group集合求区间；同组重复不造跨组位，三组共4位仍4位。
只有原signal全部事实已归属才发布跨组检查；缺项非零交叠。groupCoveredBits可重复跨组位，非全局FF/扫描数。

新`rtl-register-resolved-events-v1`独立Schema封装原完整profile（及事件/统计），旧十二模式无flag输出保持。
预算`--max-resolved-event-`：rows10000/100000、groups10000/100000、members100000/1000000、
segments200000/2000000、overlap-members100000/1000000、work1000000/10000000、millis30000/60000，均至少1。
rows是原组访问前缀，resolvedRows只指身份已知，membersComplete指该组事实收集；assigned/summarized分账。
每组/原signal coverage及跨组归属原子发布，前缀下界与未知/原partial保留；原profile成员预算partial不妨碍本层
重算已有完整来源，但总partial不升级。软time/work独立起算，校验/排序/单操作非硬time/heap保证。
正常0（无新finding触发fail-on-error）、require-complete partial4优先及原2/3/5保持。
Core/协议/工程格式/依赖未变，无Studio/Tcl/IPC/UI接线。完整权威契约见DESIGN7.5.12，独立B/C待复核。

## 同快照寄存器控制事件场景比较

```sh
dft-seqcheck --top TOP --scope TOP -F FILELIST --recursive \
  --register-statistics --register-event-groups --register-control-profile --register-resolved-events \
  --compare-register-scenarios --logic --require-complete \
  --scenario FUNCTIONAL --input-value TOP.mode 0 0 \
  --scenario OTHER      --input-value TOP.mode 0 1 \
  --scenario BACK       --input-value TOP.mode 0 0
```

场景名只标识调用上下文，示例不声明输入是实际测试协议。首场景前不能有input-value；共同clock-root
可复用，每场景输入不泄漏到下一场景。2..8名称沿原非空/唯一/严格UTF8/128字节限制。
原统计/事件组各只枚举一次；新增`compareRegisterScenarios(Design&, statistics, request, Cancel)`
调用同快照原profile/完整事件解析，以首场景为baseline。返回值拥有证明/来源/索引，原fact下标
仍配原statistics解释；核快照和引用形状、不认证伪造输入。

比较按原rawGroup及完整clock+有序async的来源/极性/edge/type，不能按各场景的group编号。
changed/unchanged要求双方完整来源证明，未知/缺映射为unresolved。changedSignals对已证明变化的
原组按原state signal重新求位并集/重叠，changedTotals仅归该比较已收集域；跨比较不能求和当全批
唯一状态位。结果不是状态数据功能/波形/物理FF/扫描协议/DFT安全判定。全局partial仍保留局部正证据。

新严格[rtl-register-scenarios-v1](sequential/register-scenarios-report.schema.json)根analysis共享原事件/统计。
场景profile与resolved省略重复analysis，其余字段沿原Schema；用共享analysis还原profile，再用完整
profile还原resolved即可验证原格式。每context记录inputValuesRequested、实际预算、complete/partial/
not_run/profile_only阶段状态；边界未开始不假造空成功。取消/已启动错误仍Error、无半成功批次。

原统计/分组预算仍独立，batch在共享分组后软起算。`--max-scenario-millis`默认/上限60000/60000，
profile/resolved时间裁剪剩余量，各自原trace/logic等预算按context适用。全批`--max-comparisons`
10000/100000；新`--max-register-scenario-work`1000000/10000000、members100000/1000000、
segments200000/2000000，均至少1，须显式新flag。成员/行前缀和整信号coverage原子发布，缺项非零。
最多8份profile拥有原组副本，校验/排序/单查询非硬time/heap承诺。正常0、require-complete partial4、
原2/3/5保持，无新finding。十三旧格式/Schema/API/DTO保持，静态消费者同批重建；Core/协议/工程格式/
依赖不改，无Studio/Tcl/IPC/UI接线。完整权威契约为DESIGN7.5.13，新单元独立B/C待复核。

## 寄存器控制的多级生成网络

```sh
dft-seqcheck --top TOP --scope TOP.u -F FILELIST --recursive \
  --register-statistics --register-event-groups --register-control-profile --logic \
  --register-control-generation --require-complete
```

`registerControlGeneration(Design&, statistics, profile, limits, Cancel)`借同快照原profile的check和静态
上下文，复用原ControlGeneration图算法展开多级派生clock/async生成关系，保留原生成事实/查找页/节点/
依赖边/循环；可查询scope外生成事实。不同写入位不合并，别名指向同生成事实可共享。没有推导Q值、
波形/物理时钟域/真实扫描协议或DFT安全。原完整profile仍在analysis，原check/fact索引须它解释。
返回图/来源/证据页/映射自有值，Design/原输入只在调用期借用；引用形状校验不认证任意事实。

新严格[rtl-register-control-generation-v1](sequential/register-generation-report.schema.json)的graph复用
原严格Graph且scenario=null。events为原rawGroup顺序、clock后有序async的访问前缀，role/asyncIndex
保留，check指profile、node指生成seed。未访问的check/seed为null+原因，节点已关联不代表来源已知。
mappingComplete、graph.quality和全局quality分账；输入partial/未知/循环/预算使全局partial，正证据保留。

原--max-generation-*默认/上限见生成链章节。新--max-register-generation-events默认100000/上限1000000、
work1000000/10000000、millis30000/60000，均至少1，仅显式新flag可用。图在profile验证完成后独立软起算，
映射在图后独立软起算；映射work一原事件行一次，整行原子发布。有界验证/原事件计数/seed索引/排序/
单Core调用不在映射work内，非硬heap/time。错误/取消无半成功，可随后复用Design。
新模式要求statistics/event-groups/profile/logic，与resolved/scenarios/旧generation/inventory互斥；
原十四格式/Schema/DTO/API保持、静态消费者重建。正常0/require-complete partial4及原2/3/5保持，无新finding。
Core/协议/工程格式/默认预算/依赖不改，无Studio/Tcl/IPC/UI/保存接线。权威契约DESIGN7.5.14；独立B/C待复核。

## 完整寄存器生成网络的场景差异与影响位

```sh
dft-seqcheck --top TOP --scope TOP.u -F FILELIST --recursive \
  --register-statistics --register-event-groups --register-control-profile --register-resolved-events --logic \
  --compare-register-scenarios --compare-register-generation --require-complete \
  --scenario BASE --input-value TOP.mode 0 0 \
  --scenario OTHER --input-value TOP.mode 0 1 \
  --scenario BACK --input-value TOP.mode 0 0
```

`compareRegisterGenerationScenarios(Design&, statistics, RegisterScenarioRequest, limits, Cancel)`运行原直接来源场景，
逐profile运行原多级生成网络，再共用完整cone比较。即使直接来源仍为同一生成寄存器，其上游clock/async
来源/极性/结构变化也可检出。analysis保留原直接比较，可同时看到direct unchanged与deep changed。
原rawGroup只有clock及全部有序async均已映射且完整cone比较已决才判changed/unchanged，否则unresolved；
循环/未展开的相同结构不作unchanged。原组行events引用该structure.comparisons.controls行，原顺序可追溯。
changed原state signal事实共享区间算法求并集/重叠，跨变化组同位不重复，changedTotals属每比较已收集域；
不将多比较相加当全批唯一位/物理FF/Scan数。它不推Q值、波形等价、扫描协议或DFT安全。

新严格[rtl-register-generation-scenarios-v1](sequential/register-generation-scenarios-report.schema.json)共享输入：
analysis为原完整场景，每context generation省略重复analysis，可用其profile与共享原事件/统计还原原generation报告；
structure省略analysis，其余字段沿原严格Schema。返回拥有场景/图/证明/索引/位段，原fact下标配原statistics。
原统计/Design调用期借用，同快照/形状校验非伪造事实认证，无跨场景缓存。错误/取消无半成功，之后可复用Design。

原场景预算独立；post --max-register-impact-millis默认/上限60000/60000，原场景完成后软起算，逐图/映射/结构
按剩余时间裁剪。原--max-generation-*、--max-register-generation-*、--max-generation-comparison-*各归其阶段。
新全批--max-register-impact-rows10000/100000、events100000/1000000、work1000000/10000000、
members100000/1000000、segments200000/2000000，均至少1，仅新flag。影响整组行及全部event引用原子发布，
不发布半组；成员/整信号coverage保留前缀/下界。验证/索引/排序/单Core非硬heap/time。profile未跑/post截止
明确generation not_run；任一输入/图/结构/影响partial保持全局partial，局部证明保留，零变化不等于全域无影响。

要求原compare-register-scenarios依赖，与单报告register-control-generation/旧generation/inventory互斥。
原十五格式/Schema/API/DTO保持，新增静态消费者重建；正常0/require-complete partial4及原2/3/5保持，无新finding。
Core/协议/工程格式/默认预算/依赖不改，无Studio/Tcl/IPC/UI/持久化。权威契约DESIGN7.5.15，本批独立B/C待复核。


## 控制网络的寄存器位扇出

```sh
dft-seqcheck --top TOP --scope TOP.u -F FILELIST --recursive \
  --register-statistics --register-event-groups --register-control-profile --logic \
  --register-control-generation --register-control-fanout --require-complete
```

新纯API `registerGenerationFanout(statistics, profile, generation, limits, Cancel)`按原控制生成网络反查每个
已发现节点所依赖的原scope寄存器RTL位，无新Design查询，可在Design释放后运行。origins引用原generation.events，
保留clock/async/原组；每个唯一check的seed只BFS一次，steps记录首次最短路径的parent/generator/asyncIndex，
节点reaches引用seed/step。同一原fact在同节点只收集一次，跨组同位用原区间算法求并集/重叠。
两写入[9:4]/[7:1]为13事实位、9并集位、4重叠位，不能将多节点覆盖求和当全设计唯一位/物理FF或扫描数。

严格[rtl-register-control-fanout-v1](sequential/register-fanout-report.schema.json)的analysis保留完整原generation。
返回自有路径/归属/coverage容器；解释原索引须原报告，同源形状验证不认证伪造事实。未知/循环/输入或预算partial
保持全局partial，正证据保留；traversalComplete仅归已提供图遍历，membersComplete仅归已捕获origins/已发布reaches。
未访问节点不造零结果，缺coverage不当0，零节点不证明无影响。不是物理扇出、波形、扫描协议或DFT安全分析。

--max-register-fanout-*默认/上限：origins100000/1000000、seeds1000/10000、nodes10000/10000、links100000/1000000、
members100000/1000000、segments200000/2000000、work1000000/10000000、millis30000/60000，均至少1，仅新flag。
links为seed/node路径条目，members计逐节点原fact引用；coverage整信号原子发布。校验后独立软时限，预校验/索引/
排序不计work，非硬heap/time。要求原单报告register-control-generation依赖，与原场景/resolved/inventory互斥。
旧十六格式/Schema/API保持，静态消费者重编。正常0、require-complete partial4、原2/3/5保持，无新finding。
Core/协议/工程格式/依赖不改，无Studio/Tcl/IPC/UI/持久化。权威契约DESIGN7.5.16，新单元独立B/C待复核。


## 终端控制来源覆盖与交叠

```sh
dft-seqcheck --top TOP --scope TOP.u -F FILELIST --recursive \
  --register-statistics --register-event-groups --register-control-profile --logic \
  --register-control-generation --register-control-fanout --register-control-sources --require-complete
```

`summarizeRegisterControlSources(statistics, profile, generation, limits, Cancel)`运行原纯fanout后，按已证明的完整
来源身份合并primary_input/constant/undriven终端节点，无Design查询，可在Design释放后调用。generated中间节点/
未知行不猜终端；极性不同分组，原clock/async/edge/type和路径保留在analysis。每组nodes指fanout.nodes，原fact配原统计。
多个别名/路径同fact只计一次，原区间算法求每源组位并集；来源组间同位交叠用原归属算法逐signal计算。
同源两写入[9:4]/[7:1]为13事实位、9并集位、4重叠位；不同极性为两组，交叠4位。
一个10位fact由clock和reset两源影响时两组各10位、交叠10位，不能相加当20个FF；交叠不判CDC/冲突/扫描违规。

严格[rtl-register-control-sources-v1](sequential/register-control-sources-report.schema.json)封装完整fanout为analysis。
输出拥有来源/路径/索引/位段；形状验证不认证任意伪造输入。输入partial/循环/未知及任一截断保持partial，正证据保留。
membersComplete仅归已发布nodes/已捕获原组，输入节点成员不完整继续false；attributionsComplete仅归已发布组的本地
归属阶段及组成员，不代表全设计。缺coverage非0，未访问signal/无终端组不证明无影响；不是物理时钟域/FF/DFT安全分析。

--max-register-source-*默认/上限rows10000/10000、sources1000/10000、members100000/1000000、segments200000/2000000、
overlap-members100000/1000000、work1000000/10000000、millis30000/60000，均至少1，仅新flag。
原fanout预算独立，post在其后软起算，原子发布节点行/整信号coverage/交叠段；非硬总heap/time/编译中取消。
limits只记post，fanout预算在analysis。旧17格式/Schema/API保持，新静态消费者重编，正常0/require-complete partial4及
原2/3/5保持，无新finding。Core/协议/工程格式/依赖不改，无Studio/Tcl/IPC/UI/持久化。DESIGN7.5.17为权威，本批独立B/C待复核。


## 不同静态场景下的终端来源覆盖

```sh
dft-seqcheck --top TOP --scope TOP.u -F FILELIST --recursive \
  --register-statistics --register-event-groups --register-control-profile --register-resolved-events --logic \
  --compare-register-scenarios --compare-register-generation --compare-register-sources --require-complete \
  --scenario BASE --input-value TOP.sel 0 0 \
  --scenario OTHER --input-value TOP.sel 0 1 \
  --scenario BACK --input-value TOP.sel 0 0
```

`compareRegisterSourceScenarios`运行原完整生成场景，再复用每context的原profile/graph和终端source聚合。
新矩阵按完整来源身份跨context匹配，groups为各context组索引或null；status为baseline对后续的changed/unchanged/unresolved。
只有双方source完整时，null才作已证空覆盖；任何partial/not_run不把已知子集相同当unchanged。
比较原state signal的位并集，忽略写入重数并合并相邻段；原deep结构变化仍可同时显示，覆盖变化和结构变化分别判断。
0/1/0不泄漏静态输入，2..8原场景名称/UTF8规则保持。该示例不声明真实扫描模式/协议，不推波形/物理FF/DFT安全。

严格[rtl-register-source-scenarios-v1](sequential/register-source-scenarios-report.schema.json)以原完整生成场景为analysis，
逐context sources和fanout仅省略重复analysis。用原deep共享profile/事件/统计还原generation，再填fanout.analysis及
sources.analysis，即可验证原严格格式。not_run同时省略sources/fanout；输出拥有原证据/索引，解释原fact需原统计。

原十八格式/Schema/API保持，source/fanout公开独立时限不变，新私有outer路径只为本批剪裁。新post在deep之后软起算：
--max-register-source-scenario-*默认/上限rows10000/100000、cells100000/1000000、intervals200000/2000000、
work1000000/10000000、millis60000/60000，均至少1，须显式新flag；可复用--max-register-source-*、--max-register-fanout-*。
cells计完整行全部context slots，intervals计已提交行的规范化区间，不逐位枚举。整source行原子发布，indexComplete仅归
已提供上下文的索引，非全设计；任一上游或矩阵截断全局partial，正证据保留，零变化不当全域无变化。
最多8份source/fanout拥有值，校验/排序/部分分配非硬heap/time/编译硬取消。正常0/require-complete partial4/原2、3、5保持，
无新finding。新静态消费者重编，Core/协议/工程格式/依赖不改，无Studio/Tcl/IPC/UI/持久化；DESIGN7.5.18为权威，本批独立B/C待复核。


## 查看来源覆盖具体增减了哪些位

在原`--compare-register-sources`命令后加`--source-coverage-deltas`。公开API `compareRegisterSourceDeltas`运行原完整矩阵后，
按matrixRow、scenario输出新增/移除/保留的原state signal位段；analysis完整保留原身份、组、clock/async和生成路径证据。
例如原来源覆盖[1:9]，新覆盖[4:9]，则移除[1:3]、保留[4:9]、新增为空。三类区间互斥，触边不算交叠，忽略原事实重数。
实现按有序区间端点线性扫描，不逐位展开；每signal计baselineBits/scenarioBits/addedBits/removedBits/retainedBits，
满足baseline=removed+retained、scenario=added+retained，逐来源/比较totals不当全批唯一位或物理FF/扫描数。

严格[rtl-register-source-deltas-v1](sequential/register-source-deltas-report.schema.json)沿原矩阵status，unresolved不提供delta，
未知不能填0；已证明两侧都无覆盖时可有精确空delta。inputRows/inputComparisons只归已发布原矩阵，不指全设计。
总partial继续保留，原已决正证据可查看；零增减/无明细不证明全域无变化。它不是Q值/波形/物理域/DFT安全判定。
输出拥有原analysis和新位段/索引，原fact需对应原统计，Error/取消无半成功且可复用Design。

--max-source-delta-*默认/上限rows10000/100000、signals100000/1000000、ranges200000/2000000、intervals200000/2000000、
work1000000/10000000、millis60000/60000，均至少1，仅新flag。post在原矩阵后独立软起算，所有原阶段预算独立。
每行信号/范围/计数原子发布，ranges计三类条目，intervals计完整行两context规范化输入，work含未提交行实际访问；
校验/排序/部分分配非硬总heap/time或编译中取消。旧十九格式/Schema/API保持，新静态消费者重编，正常0/require-complete
partial4及原2/3/5保持，无新finding。Core/协议/工程格式/依赖不改，无Studio/Tcl/IPC/UI/持久化；DESIGN7.5.19为权威，新单元B/C待复核。

### 按状态位反查来源变化

在原`--source-coverage-deltas`命令附加`--source-bit-attribution`，输出严格
`rtl-register-source-attribution-v1`。`analysis`完整保存原位差报告；每comparison按signal和位段
列addedRows/removedRows/retainedRows，引用`analysis.rows`，沿matrixRow追溯来源身份/极性及原证据。
同位来源迁移保留新增/移除双方，changedBits只计一次；多来源共用位也不重复计coveredBits。
coveredBits=changedBits+retainedOnlyBits，仅归已发布已决来源证据。sourcesComplete=false、空行或retainedOnly
不能证明全设计无变化；unknown从不造0。不是物理FF/scan/DFT签核。

新`--max-source-attribution-{rows,intervals,segments,members,work,millis}`默认10000/200000/200000/1000000/1000000/60000，
上限100000/2000000/2000000/10000000/10000000/60000，均至少1；仅新flag可用。
post独立软时限，原预算仍在analysis.limits；收集comparison输入失败不发布半索引，输出按完整signal原子发布。
API为RegisterSourceAttribution.h中的compareRegisterSourceAttribution，输出拥有值，原fact仍需原统计。
原二十模式不变，正常0、require-complete partial4、错误和取消沿原政策。新单元待独立B/C复核。

### 来源集合转换分组

在原`--source-bit-attribution`命令附加`--source-transition-cohorts`，输出严格`rtl-register-source-transitions-v1`。
每comparison按“baselineSources→scenarioSources”完整来源集合分组，来源编号索引`analysis.analysis.analysis.rows`原matrix；
成员(row,segment)指`analysis.comparisons[scenario-1].rows[row].segments[segment]`，保留原位段和所有proof。
同位多来源只计一次位宽；{a,b}→{b,c}作为一个集合转换，不猜一对一迁移。inputComplete、sourcesComplete分别沿原输出及来源证明；
二者未成立时空集合/无组/retainedOnly不能证明全设计无变化或无来源。不是物理FF/scan/DFT结论。

新`--max-source-transition-{cohorts,members,sources,input-segments,work,millis}`默认1000/100000/100000/200000/1000000/60000，
上限10000/1000000/1000000/2000000/10000000/60000，均至少1，仅新flag。原预算在analysis.limits，新post独立软截止。
收集comparison失败不发半索引，按完整cohort字典序前缀发布，成员/来源/计数原子；发布cap不是临时索引的硬heap上限。
API为RegisterSourceTransitions.h中compareRegisterSourceTransitions，返回拥有值。旧二十一模式/退出政策保持，新单元待独立B/C。

### 按层次实例和模块定义汇总来源影响

在原`--source-transition-cohorts`命令附加`--source-impact-summary`，输出严格`rtl-register-source-impact-v1`。
每comparison的instances按原统计instance索引给covered/changed/retainedOnly及(cohort,member)原引用；
definitions按原definition索引归并这些已发布实例。原路径/名字和proof沿完整analysis追溯，不重新查询/推导来源。
两个同定义4位实例仍计8位；实例与定义是同一证据的两个视图，不能相加。定义仅归已发布实例前缀，partial/空/0不证明全设计无变化。
新API为RegisterSourceImpact.h中的compareRegisterSourceImpact，返回拥有值，原fact解释仍需原统计。

--max-source-impact-{instances,definitions,members,input-members,work,millis}默认10000/10000/200000/200000/1000000/60000，
上限100000/100000/2000000/2000000/10000000/60000，均至少1，仅新flag；原预算在analysis.limits，新post独立软截止。
收集失败不发半索引，实例行及对应定义归并/计数原子提交，保留实例前缀；发布cap非临时索引硬heap限制。
原二十二格式与退出政策保持，静态消费者重编。B52/C209已有限接受bea973cc的三种来源变化投影，本新增待独立B/C。

### 来源影响的层次子树汇总

在原`--source-impact-summary`命令附加`--source-hierarchy-summary`，输出严格`rtl-register-source-hierarchy-v1`。
API为RegisterSourceHierarchy.h中的compareRegisterSourceHierarchy，完整analysis保留原实例/定义影响及来源证据。
直接调用Core instance/ancestors取得scope内真实实例祖先，generate作用域不假装成实例，转义点名不拆分。
节点info/parent/depth保留实际实例树；members和local引用原impact comparison.instances行号。
counts归并该子树已发布实例行，totals仅取scope节点；父子子树包含相同位，不能相加。未发布节点、0或partial不证明无变化。

--max-source-hierarchy-{queries,ancestors,nodes,members,work,millis}默认10000/200000/10000/200000/1000000/60000，
上限100000/2000000/100000/2000000/10000000/60000，均至少1，仅新flag。queries仅计新post实际启动的导航调用，
ancestorEntries计完整接纳的scope到局部实例链（含两端、不同链可重复祖先）；同次调用跨contexts复用拓扑。
原impact预算独立、新post软起算；先完整收集comparison，再按Core path分量字典序发布完整节点前缀。
根节点若已发布，其计数/成员完整属于原impact发布域，即使后续子节点被截断；inputComplete沿原输入，不等于本post完成。
返回拥有metadata/节点/引用，原fact解释仍需原统计。旧二十三格式/退出政策保持，静态消费者重编，新单元待独立B/C。


### 哪个来源在哪个子树新增、移除或保留状态位

在原`--source-hierarchy-summary`命令附加`--source-hierarchy-matrix`，严格输出`rtl-register-source-hierarchy-matrix-v1`。
API在RegisterSourceHierarchyMatrix.h；每comparison的rows按原(source,node)索引排序，引用完整analysis的真实节点与来源身份/极性/proof。
成员(row,segment,role)保留原attribution位段，role为added/removed/retained；五计数复用SourceDeltaCounts。
例如{a,b}→{b,c}中a移除、b保留、c新增，b不会因同位其他来源变化被误报移除或新增；不猜一对一来源迁移。
来源之间可能共用位，父子节点也包含相同位，行不能相加为全局唯一位；没有全局totals。partial/无行/0不证明无变化或DFT安全。

--max-source-hierarchy-matrix-{rows,members,input-nodes,input-members,work,millis}默认10000/200000/10000/200000/1000000/60000，
上限100000/2000000/100000/2000000/10000000/60000，均至少1，仅新flag；原hierarchy预算独立。
先完整收集comparison，再发布完整pair行前缀，保留原inputComplete/sourcesComplete且不冒新post完成。
新post软时限不承诺硬heap/编译取消；原二十四格式及退出政策保持。静态analysis消费者重编，新单元待批次独立B/C。


### 首实例枚举前的统计资源截断

统计先解析scope，再枚举实例。若预算在首实例访问前到期，instances为空是合法partial；
impact、hierarchy、source-hierarchy-matrix会保留正常partial及嵌套原证据。hierarchy省略尚未取得的scope metadata，
不另查Core，queries/ancestorEntries/nodeRows/members/work均0；matrix没有节点则没有source-node行。原canonical scope仍在statistics中。
--require-complete返回4，未启用时沿原成功0；不把合法资源前缀改为invalid_arguments/2，也不把空前缀解释成无状态/无变化。
本post自身取消/过期仍生效，非空metadata和快照校验不变；伪造complete空统计仍拒绝。完整已访问但无本地状态的scope仍提供权威metadata。
C-S2-08-01的修复/自验与C提出方关闭分开记录，原25格式/Schema/API布局不变。


### 来源子树的具体信号位范围

在原`--source-hierarchy-matrix`命令附加`--source-hierarchy-ranges`，严格输出`rtl-register-source-hierarchy-ranges-v1`。
API在RegisterSourceHierarchyRanges.h：expandRegisterSourceHierarchyRanges。每row.matrixRow指原source-node行，
其signals按原统计signal给added/removed/retained规范BitRange、五计数，以及该原matrix行的members索引。
同role相邻原段合并，全部原证明引用仍保留；孔洞/不同role/不同signal不合并。不重跑来源分析或增加Core查询。
每个完整source-node行连同全部signals/ranges/references原子发布。不同来源和父子节点会包含同一位，禁止把各行相加为全局唯一位。
partial/空不证明无变化/无来源/物理FF/scan/DFT安全，合法首实例未访问partial继续沿C-S2-08-01修复链接受，原H scope省略/查询0。

--max-source-hierarchy-range-{rows,signals,ranges,members,work,millis}默认10000/100000/200000/200000/1000000/60000，
上限100000/1000000/2000000/2000000/10000000/60000，均至少1，仅新flag。规范区间合并不额外占range，但原证明引用照计members。
原matrix预算在analysis.limits，新post独立软时限，无硬heap/编译取消承诺。旧25格式及退出政策保持，新单元待独立B/C。


### 来源位范围的定向选择

在原`--source-hierarchy-ranges`命令附加`--select-source-ranges`，默认筛选scenario1，可组合：

```text
--select-scenario 1 --select-source-index 0 --select-node hierarchy_root.left
--select-signal-index 0 --select-role removed --select-lsb 1 --select-width 2
```

全部条件取交集，省略则不限；node为精确Core canonical pathText，非路径前缀。source/signal是原报告索引，不是新生成的全局ID。
窗口只裁剪已决范围，value的五计数只计所选角色与窗口；members保留真正相交的原matrix证明索引，一合并范围可对应多个证明。
API在RegisterSourceRangeSelection.h：selectRegisterSourceHierarchyRanges仅同步借用原range报告，不需Design/统计仍存活；返回值拥有新数据，索引仍需同一原报告解释。
CLI的rtl-register-source-range-selection-v1保留完整原报告在analysis，rangeRow/rangeSignal索引所选原comparison的行/信号位置。
新输出按完整匹配signal发布前缀；原partial/空/无命中不升级为全设计无变化，跨来源与祖先的位不能作全局相加。
--max-source-selection-{rows,ranges,members,work,millis}默认10000/200000/200000/1000000/60000，上限100000/2000000/2000000/10000000/60000，至少1。
只完整行计rows/ranges/members，work含非命中/失败访问，软时间独立起算，不承诺硬heap/截止。--require-complete沿partial4，无此flag成功0。
旧26格式与原错误/取消政策保持，无Core/protocol/工程格式/依赖/IPC/Studio变化，新增静态消费者重编；独立批次验收待B/C。

query窗口/索引允许uint64十进制，需用精确整数JSON解析；Core BitRange事实和旧26格式仍沿原Schema，不改为浮点或截断。


### 逐场景写入事实证据

在原选择命令附加`--explain-source-ranges`，得到`rtl-register-source-range-evidence-v1`。例如：

```text
--select-role retained --select-lsb 2 --select-width 4 --explain-source-ranges
```

API为SourceRangeEvidence.h中的explainRegisterSourceSelection，借用原统计/ranges/selection，不需要Design，返回拥有元数据/原事件/截取证据。
每selection行展开来源、节点、状态信号和所属实例，并逐原证明列context/group中的实际写入事实；added只列比较场景、removed只列基线、retained列两侧。
facts字典按原统计fact首次使用去重，条目另保留proof与事实的相交bits；RegisterInfo原bits/clock/async/process ref不改，不提供新HDL位置或DFT规则。
节点可为祖先；同事实可能跨proof/context重复，factEntries非唯一事实数，不能累加条目宽度作全局唯一位。原判定完整保留analysis。
--max-source-evidence-{rows,proofs,facts,work,millis}默认10000/100000/200000/1000000/60000，上限100000/1000000/2000000/10000000/60000，至少1。
整行及新增字典原子发布，失败不留悬空字典；work含失败访问，时限与heap仍是软边界。原partial/空不升级，--require-complete沿partial4。
旧27格式/政策保持，无Core/IPC/GUI/依赖或工程格式改变。新单元待独立B/C；固定c8edfde6的范围/查询已获B54/C211有限接受，C08由C211关闭。


### 写入事实的源码位置

在上一来源证据命令附加`--locate-source-evidence`，得到`rtl-source-evidence-locations-v1`。每个原事实行关联信号声明与过程语句的位置字典，含原文件/路径、物理字节偏移、行列和快照内容hash；共享过程只查一次，不把共享定义的不同实例合并。
`SourceEvidenceLocations.h`的`locateSourceEvidence(design,evidence,limits,cancel)`只借用两个匹配输入，返回值在输入释放后拥有位置。Core NotFound明确为not_found/partial，其它错误保留。
`--max-source-location-facts 10000 --max-source-location-locations 20000 --max-source-location-queries 20001 --max-source-location-work 1000000 --max-source-location-millis 60000`控制完整事实前缀；queries含一次快照身份检查，缓存命中仍计work，单次Core调用非硬截止。
位置是原快照事实，不表示当前磁盘仍匹配，也不提供综合FF/scan/DFT结论；完整原位段/场景/事件保留于analysis。旧28格式不变；本新增待批次独立复核。


### 核对源码后返回原文片段

在来源位置命令附加`--source-evidence-excerpts`，得到`rtl-source-evidence-excerpts-v1`。`readSourceEvidenceExcerpts`只按原FileRef调用Core.readSource，核对matchesSnapshot/hash后才按原偏移生成完整行窗口。文件已变化、删除/不可读、无UTF8或原无位置均显式partial，不发假片段。
`--source-excerpt-context-lines 2`可取0..20；CRLF计一行，单CR/单LF也各计一行，混合换行不改写。片段覆盖与原半开范围相交的完整物理行及上下文，保留UTF8及原换行字节，不拆CRLF。片段按实际文件窗口共享，原位置与实例仍分别保留。文件读取按FileRef仅本调用去重，返回拥有文本/元数据。
默认`--max-source-excerpt-locations 10000 --max-source-excerpt-files 1000 --max-source-excerpt-queries 1001 --max-source-excerpt-bytes 1048576 --max-source-excerpt-snippet-bytes 65536 --max-source-excerpt-cached-bytes 8388608 --max-source-excerpt-work 1000000 --max-source-excerpt-millis 60000`。
bytes是唯一片段输出，cachedBytes是匹配整文件临时缓存，readBytes是Core实际成功返回UTF8字节，可能超过这两者；Core仍单次整文件读取，上限非硬IO/heap/单调用时限。完整原位置/事实/场景仍在analysis，不新增UI/工程格式或DFT结论；旧29格式保持，本批待独立复核。

### 一次调查寄存器来源

`--inspect-register-sources`直接运行统计、具名场景比较、范围筛选、写入事实、源码定位和片段读取；包含`--logic`及完整链的依赖开关。仍需明确指定设计、scope和至少两个场景，场景名与输入条件由调用者决定。例如先调查两个相同配置下的既有来源：

```sh
dft-seqcheck --top excerpt_top --scope excerpt_top --recursive \
  analysis/tests/source-evidence-excerpts.sv --inspect-register-sources \
  --scenario BASE --scenario REPEAT --select-node excerpt_top.left \
  --source-excerpt-context-lines 0 --require-complete
```

每个`--input-value PATH BIT 0|1`属于前一个`--scenario`。原`--select-*`及各阶段`--max-*`选项仍可用。新快捷方式与原完整片段命令共用执行入口，输出相同`rtl-source-evidence-excerpts-v1`，partial配合`--require-complete`仍退出4；没有默认场景或另一种报告格式。

宿主C++可直接链接`dft_sequential`并使用：

```cpp
#include "SourceInvestigation.h"
dft::sequential::SourceInvestigationRequest request;
request.statistics.scope = "excerpt_top";
request.statistics.recursive = true;
request.scenarios.common.resolveLogic = true;
request.scenarios.scenarios = {{"BASE", {}}, {"REPEAT", {}}};
request.query.node = "excerpt_top.left";
request.excerpts.contextLines = 0;
auto result = dft::sequential::investigateRegisterSources(design, request, cancel);
```

成功结果拥有六个互相对应的原报告；例如`excerpts.rows[i].location`指向同一结果的`locations.locations`。用`result->excerpts.complete`判断最终完整性，并查看各阶段reasons解释截断。部分预算结果继续下游，错误/取消只返回Error；请求各段先全部校验。各阶段预算和软时限独立，不代表整条调查的总时间或硬内存上限；源码仍只通过Core FileRef读取，跨文件观察不是磁盘事务。原较短命令和单阶段C++ API保留。

### 显式补充黑盒引脚库

在 `dft-memory` 宏调查或模型映射命令上增加来源标签和引脚声明：

```sh
dft-memory --top library_top --scope library_top.named \
  analysis/tests/memory-library.sv --definition missing_ram \
  --library-source handwritten-fixture-v1 \
  --library-pin missing_ram CLK in 1 \
  --library-pin missing_ram A in 3 \
  --library-pin missing_ram D in 8 \
  --library-pin missing_ram Q out 8
```

来源标签由调用者提供，程序不会把它当作文件读取或认证；本接口不是 TCD/Liberty 解析器。同一 cell 的引脚顺序用于位置连接，必须按库顺序提供。只接受 `in/out/inout/ref/unknown` 和 1..65536 位宽。可组合原 `--model/--role`，库声明与模型角色仍分别输入；匹配证明结构声明兼容，不证明内部存储功能。已有 RTL 定义的模块仍使用实际端口。

宿主链接 `dft_memory`，用 `PinLibrary::create(LibraryDeclaration, cancel)` 得到不可变 provider，再设置 `OpenOptions.library`、打开设计。构造复制输入，`cell()` 返回拥有副本；`declaration()` 仅在 provider 存活期借用。C++ 可提供 opaque attrs，cell attrs 的 `dft.library.source` 保留给来源标签。输入数量与字符串上限见 DESIGN7.9。

指定库时输出 `rtl-library-memory-v1`：`library` 记录完整有效声明，`analysis` 保留原宏/映射报告。未指定库的格式不变。使用中的库事实和来源标签随 Core 快照冻结并参与 inputHash，之后改库必须重新打开；未使用声明不保证进入该 hash，inputHashComplete 仍为 false。`--require-complete` 继续按最终报告完整性决定 exit4，即使所有接口 matched，也可能因调查截断/时钟追踪边界而 partial。

### 宿主一次调查并映射存储器接口

宿主可链接 `dft_memory`，直接调用完整链：

```cpp
#include "MemoryInvestigation.h"
using namespace dft::memory;
MemoryInvestigationRequest request;
request.scope = "top";
request.recursive = true;
request.mapping.models = models; // 调用者的显式模型；候选定义由此唯一生成
request.clockPins = {"CLK"};     // 仅明确要求追踪时设置
// request.traversal / request.interfaces / request.mapping.limits 分别控制各阶段
auto report = investigateMemories(design, request, cancel);
```

成功结果同时拥有 `interfaces` 和 `mapping`；最终完整性读 `mapping.complete`，原索引和快照在同一结果中解释。请求所有阶段在查询前验证，partial 保留并继续映射；错误或取消没有半份结果。预算仍分阶段，无全链硬截止。Design 由调用者事先打开，库仍仅通过 `OpenOptions.library` 输入。

原 `dft-memory --model ...` 已使用同一入口，命令和 JSON 格式不变。未提供库时，位置连接黑盒的匿名端口以原 ref/owner 保留；不会猜测对应模型名称。它们产生局部 `pin_missing`/`unmapped_pin` 和 partial，其它实例仍有结果。

错误分类沿 Core：无法处理缺失的 source/-f/-F 等输入而在 open 返回 BadRequest 时，CLI 为 `invalid_arguments`/exit2；成功打开后编译诊断报错或无顶层为 `design_invalid`/exit3，scope 不存在为 `not_found`/exit3。`--require-complete` 的成功 partial 仍为 exit4。B 已在 cycle215 维护 C12 为 exit2 并关闭 B-S2-57-01；原失败记录保留。

### 生成内存测试控制器与步骤计划

在已有模型/角色命令上显式加 `--plan-tests`。每个模型必须声明每字操作数和每宏测试功耗（整数微瓦）；每个待调度实例声明精确路径、测试时钟域标签和分区（可空）：

```sh
dft-memory --top plan_top --scope plan_top.a0 analysis/tests/memory-test-plan.sv \
  --model plan_ram 8 8 \
  --role plan_ram clock CLK posedge --role plan_ram address A none \
  --role plan_ram data_in D none --role plan_ram data_out Q none \
  --plan-tests --test-profile plan_ram 10 120000 \
  --test-instance plan_top.a0 test_clk '' \
  --test-max-controller-memories 64 --test-max-parallel 4 --test-max-power 500000 \
  --require-complete
```

输出独立 `rtl-memory-test-plan-v1`，包含原 `investigation` 映射/接口、`plan` 和可选 `library` 来源。宿主链接 `dft_memory`、包含 `MemoryTestPlan.h`，使用 `planMemoryTests(design, {investigationRequest, planning}, cancel)`；返回的完整报告拥有所有索引目标。

不同模型、域或分区隔离；达到控制器数量容量、步骤并行数或功耗限制会拆分。控制器的步骤顺序执行，步骤内宏并行；每控制器报告周期和峰值声明功耗，不对不同域给出未经频率定义的全局时长。缺域、接口不匹配、单宏超过功耗均保留阻碍原因。`unusedAssignments` 指未对应本次已发布行的输入，可能来自不在范围或截断，不能当作实例不存在。规划软预算用 `--test-max-controllers/work/millis`。

域相同是调用者的显式声明，程序不把结构追踪当作时钟物理等价；操作数/功耗也是输入成本。计划不生成实际测试算法或RTL，不证明RAM功能和MBIST可测性。原调查partial会传到计划，`--require-complete`据此退出4。精确边界见DESIGN7.11。


### 从文件复用内存模型、引脚库和测试成本

把静态声明保存在 UTF-8 JSON 中，用 `--memory-library FILE` 一次加载。仓库中的[示例输入](tests/memory-library-input.json)含两个模型和测试成本，可直接运行：

```sh
core/build/analysis/dft-memory --top plan_top --scope plan_top.a0 \
  analysis/tests/memory-test-plan.sv \
  --memory-library analysis/tests/memory-library-input.json \
  --plan-tests --test-instance plan_top.a0 test_clk '' --require-complete
```

去掉 `--plan-tests --test-instance plan_top.a0 test_clk ''` 即只做接口映射。文件里的成本不会自动启用规划；实例域、分区、策略和运行预算仍由命令提供。文件顶层含 `formatVersion: 1`、`kind: "memory-library"`、`models`，可选 `library` 和 `testProfiles`；引脚库按显式顺序声明，模型角色不会合成库引脚。格式见[输入 Schema](memory/input/memory-library.schema.json)，字段及关系限制见 DESIGN7.12。

`--memory-library` 与原 `--model/--role/--mask-lane`、`--definition`、`--library-source/--library-pin`、`--test-profile` 互斥；没有隐式合并或覆盖。普通文件最多 1 MiB，符号链接到普通文件允许；重复键、未知字段、非法 Unicode、不精确或越界整数、无效模型/引脚/成本均在打开 RTL 前拒绝，并给出错误原因。它是显式分析输入，读取时不会自动加载其他文件。

宿主链接 `dft_memory_input`、包含 `MemoryLibraryInput.h`，调用 `loadMemoryLibrary(path,cancel)` 或 `parseMemoryLibrary(json,cancel)`。成功值拥有模型和成本，以及可选不可变 `library`；将 provider 交 `OpenOptions.library`，打开 Design 后调用原调查或规划 API。输出仍使用原格式并记录实际有效声明，文件名不会代替库来源标签或进入快照哈希。


### 按层级分配内存测试域和分区

用 `--test-rules FILE` 替代重复的 `--test-instance`，其余模型、成本与策略输入保持。例如在仓库根目录运行：

```sh
core/build/analysis/dft-memory --top rule_top --scope rule_top --recursive \
  analysis/tests/memory-test-rules.sv --model rule_ram 8 8 \
  --role rule_ram clock CLK posedge --role rule_ram address A none \
  --role rule_ram data_in D none --role rule_ram data_out Q none \
  --plan-tests --test-profile rule_ram 2 100000 \
  --test-rules analysis/tests/memory-test-rules.json --require-complete
```

[规则示例](tests/memory-test-rules.json)为整个 `rule_top` 指定默认域，再覆盖 `left` 子树、`left.ram` 精确实例、名称含点的 `left.dot` 子树和 `bank[1]`。路径使用 Core `InstInfo.path` 的原始段数组：`["rule_top", "left.dot"]` 中的点属于名称，不是层级分隔符。`recursive: true` 包含自身及后代；更深规则优先，同路径精确规则优先，与输入顺序无关。域和分区是显式声明，不自动推断时钟域。

输入顶层为 `{formatVersion: 1, kind: "memory-test-rules", rules: [...]}`，每条包含 `path`、`recursive`、`clockDomain`、`partition`，分区可为空。范围及类型见[输入 Schema](memory/input/memory-test-rules.schema.json)和 DESIGN7.13；同路径同递归属性的重复规则会报错。文件最多 1 MiB，必须显式启用 `--plan-tests`，不能混用 `--test-instance`；可以搭配 `--memory-library`。

输出 `rtl-memory-test-rules-v1` 在 `report` 中保留原调查和计划，`choices` 记录每个映射行命中的规则及展开分配索引。未命中仍由原计划报告缺域；接口不匹配、上游 partial 和规划预算照常保留。`unusedRules` 仅表示未成为本次已观察行的获胜规则，不表示路径不存在，也不会单独令空计划 partial。规则命中不等于成功调度，完整性读取 `report.plan.complete`。

宿主包含 `MemoryTestRules.h`、链接 `dft_memory`，调用 `planMemoryTestsByRules(design, {testRequest, rules}, cancel)`；原 `testRequest.planning.assignments` 必须为空。它只调查一次，再调用同一规划器。文件输入包含 `MemoryTestRulesInput.h`、链接 `dft_memory_input`，调用 `parseMemoryTestRules` 或 `loadMemoryTestRules`。返回值拥有规则、实际事实和展开后的原规划请求。


### 安排跨控制器的测试批次

原计划限制单个控制器的步骤功耗；`--schedule-tests` 再限制同批运行的控制器数量和总声明功耗：

```sh
core/build/analysis/dft-memory --top schedule_top --scope schedule_top --recursive \
  analysis/tests/memory-test-schedule.sv \
  --memory-library analysis/tests/memory-test-schedule-library.json \
  --plan-tests --test-max-parallel 2 \
  --test-rules analysis/tests/memory-test-schedule-rules.json \
  --schedule-tests --schedule-max-parallel 2 --schedule-max-power 300000 \
  --require-complete
```

示例中的8个宏先形成4个控制器、5个局部步骤，再安排为3个批次；前两个批次各300000微瓦，末批200000微瓦。每个控制器只放入其下一个步骤，按编号考虑，暂时装不下的步骤留到后续批次；每批结束后再启动下一批。单步本身超过总功耗上限会阻碍所属控制器，其他控制器继续。调度不会重新拆分原步骤，也不保证最短时间或最优装箱。

输出 `rtl-memory-test-schedule-v1` 的 `source` 保留原计划或规则报告，`schedule.waves` 中每个entry引用原 `plan.controllers[controller].steps[step]`。`schedule.controllers` 的 `nextStep` 只计已发布批次；`pending` 表示预算尚未覆盖，`blocked` 保留具体原因，`complete` 仅表示该控制器的原计划步骤全部纳入。最终完整性读取 `schedule.complete`，上游partial仍传播。

新阶段预算为 `--schedule-max-waves/work/millis`。候选批次构造中预算耗尽，会丢弃该批所有进度和阻碍变化，保留之前批次与已耗工作量。它兼容原 `--test-instance`；不指定 `--schedule-tests` 时旧命令和输出不变。不能单独传schedule参数，也不能省略 `--plan-tests`。

C++包含 `MemoryTestSchedule.h`、链接 `dft_memory`，使用 `scheduleMemoryTests(design, {testRequest, optionalRules, scheduling}, cancel)`。返回值拥有源事实和调度，不接受拼造plan DTO作输入。批次屏障是计划的执行前提，并未实现硬件控制协议；各域频率未知，因此没有跨域总周期或时长。功耗/域依然是调用者声明，不是物理签核。精确边界见DESIGN7.14。

### 用显式测试时钟估算批次时长

在上述调度命令后增加以下参数，即可得到按原批次顺序计算的时间表：

```sh
  --time-tests --test-clock a 1000 --test-clock b 2000 \
  --test-clock c 3000 --test-clock d 4000 --time-wave-overhead 7
```

单位都是整数皮秒。示例每个步骤16周期，三批分别为48007、64007、32007皮秒，累计144021皮秒；同批取最慢成员耗时，再加每批运行前开销。周期是使用者声明的测试周期，不从RTL推算，也不证明硬件能在该频率运行。

`--time-max-duration 112014`会保留前两批，第三批因累计时间超限停止；`--require-complete`返回4。缺时钟或整数乘加溢出同样停止于首个不能计算的批次，不能把缺声明当零耗时或跳过批次。`--time-max-work/millis`控制计算资源预算；它们与测试时长上限不同。工作预算耗尽会丢弃整个候选批次，已耗work仍记录。

新格式`rtl-memory-test-timing-v1`的`source`保留完整调度及原调查；`timeline.waves`是原批次的完整前缀，entries与原批次同序，clock引用`timeline.request.clocks`。`stop`定位首个未发布批次及原因，能定位成员时带entry。`unusedClocks`仅指未用于已发布批次的声明。最终完整性读`timeline.complete`，原调查/规划/调度partial仍传播。时间表以各批次结束后再启动下一批的屏障为前提，不实现执行器或MBIST RTL。

宿主包含`MemoryTestTiming.h`，链接`dft_memory`，调用`timeMemoryTests(design,{scheduleRequest,timing},cancel)`。结果拥有原报告与时间表，Design仅在调用期间借用。原命令不加`--time-tests`时格式保持；任何时长参数都必须显式启用该模式，并同时启用`--schedule-tests --plan-tests`。精确字段与界限见DESIGN7.15及[memory-test-timing.schema.json](memory/memory-test-timing.schema.json)。

### 复用一份完整测试配置

把分配规则、规划/调度约束和测试周期放入[配置示例](tests/memory-test-config.json)，即可复用同一组声明：

```sh
core/build/analysis/dft-memory --top schedule_top --scope schedule_top --recursive \
  analysis/tests/memory-test-schedule.sv \
  --memory-library analysis/tests/memory-test-schedule-library.json \
  --plan-tests --schedule-tests --time-tests \
  --test-config analysis/tests/memory-test-config.json --require-complete
```

示例输出仍是原计时格式：8个宏、3个批次、144021皮秒。去掉 `--time-tests` 得到原调度报告；再去掉 `--schedule-tests` 得到原规则规划报告。文件不会自动启动后续阶段。可以用 `assignments` 数组替代 `rules`，两者必须且只能提供一个；空 assignments 合法。各阶段 policy/limits 可部分填写，省略字段使用原默认值。提供 timing 时必须显式给 clocks；未提供 timing 等价于空时钟和默认限制。

`--test-config` 必须搭配 `--plan-tests`，不能混用 `--test-instance`、`--test-rules`、任何 `--test-max-*`、`--schedule-max-*`、`--test-clock` 或 `--time-*` 数值参数。模型/测试成本仍来自 `--memory-library` 或原静态声明；调查/映射预算和 clock-pin 仍可独立设置。全部配置（包括本次未执行的阶段）在打开 RTL 前验证，输出保留各已执行阶段的有效声明。它是运行输入，不保存界面会话、不包含库文件路径，也不改 Core 输入身份。

宿主包含 `MemoryTestConfigInput.h`，链接 `dft_memory_input`，调用 `parseMemoryTestConfig(json, investigation, profiles, cancel)` 或 `loadMemoryTestConfig(path, investigation, profiles, cancel)`，得到拥有全部输入的原 `MemoryTestTimingRequest`。使用其 `schedule`、`schedule.test` 或 timing 请求调用既有执行入口；有 rules 时走规则规划入口。加载器不会打开 Design。严格形状见[配置 Schema](memory/input/memory-test-config.schema.json)，离线校验同时注册[规则 Schema](memory/input/memory-test-rules.schema.json)；重复名称、成本覆盖和 UTF-8 字节限制继续由领域验证器检查。

### 比较测试配置方案

使用同一次宏调查比较多份配置，第一份作为参考：

```sh
core/build/analysis/dft-memory --top schedule_top --scope schedule_top --recursive \
  analysis/tests/memory-test-schedule.sv \
  --memory-library analysis/tests/memory-test-schedule-library.json \
  --plan-tests --schedule-tests --time-tests \
  --compare-test-config reference analysis/tests/memory-test-config.json \
  --compare-test-config wider analysis/tests/memory-test-config-wide.json --require-complete
```

示例把单控制器并行宏数从2增到4、全局并行控制器上限从2增到4、全局声明功耗上限从300000增到800000：控制器仍4个，局部步骤从5减为4，批次从3减为1，声明时长从144021减为64007皮秒，差值为−80014。是否采用该取舍由使用者决定，这不是实际功耗或频率签核。

接受2..8个唯一名称（UTF-8最多128字节），各文件格式沿 `--test-config`。必须显式启用三个阶段，不可混用单配置文件、assignment/rules或对应数值选项；模型成本、调查/映射限制仍公共输入。所有文件和配置先验证，再做一次宏调查，每项执行同一规划/调度/计时算法。

新输出 `rtl-memory-test-comparison-v1` 的 `configurations` 按序保存具名原完整计时报告，`rows` 按相同顺序汇总控制器、局部步骤、调度/计时批次、已计时实例/容量/时长。`reference=0`；仅参考与候选都完整时 `comparable=true` 并提供候选减参考的 `delta`。partial时保留原reasons/stop，省略差值，不把不同覆盖前缀作性能比较。总 `complete` 要求每项完整；`--require-complete` 时不完整返回4。完整性与Core `inputHashComplete`仍不同。

C++包含 `MemoryTestComparison.h`、链接 `dft_memory`，使用 `compareMemoryTestConfigurations(design,{investigation,configurations},cancel)`。每个配置组合已有planning/rules/scheduling/timing类型；结果拥有各原报告，调查事实按配置复制保存，无跨调用缓存。独立阶段预算保持，2..8配置不构成硬heap/全链deadline保证。不接受外部拼造事实、不自动排名或执行测试。原单配置API/CLI格式保持，契约与严格Schema见DESIGN7.17及[memory-test-comparison.schema.json](memory/memory-test-comparison.schema.json)。

### 逐内存测试覆盖与阻碍定位

在现有计时命令上加 `--test-coverage`，可查看每个已观察宏已到达的阶段、阻碍或等待原因及原报告索引：

```sh
build/analysis/dft-memory --top schedule_top --scope schedule_top --recursive \
  analysis/tests/memory-test-schedule.sv \
  --memory-library analysis/tests/memory-test-schedule-library.json \
  --test-config analysis/tests/memory-test-config.json \
  --plan-tests --schedule-tests --time-tests --test-coverage --require-complete
```

`coverage.rows`按`source`中的宏顺序返回，`macro → memory → plannedMemory → controller/step → wave/entry`索引连回原始事实。`timed`行给出成员开始、持续、结束及批次屏障时间：本例a0为7～16007ps，屏障为48007ps，表示它结束后仍等待同批其它成员。接口不匹配、缺域、单步过功耗等已知阻碍为`blocked`；预算尚未到达、同批未提交为`pending`，不把等待误报成该内存失败。只有已发布完整批次提供时段。

完整原计时报告保留在`source`；`coverage.complete`继承其完整性，行数只涵盖已观察宏，不包含调查未发布的候选。指标是用户模型、功耗、周期与屏障声明下的覆盖，非实测/物理MBIST签核。不与`--compare-test-config`混用；C++宿主可调用`inspectMemoryTestCoverage`获得拥有结果。

### 内存时钟来源

`dft-memory --clock-sources` 从模型的 clock 角色定位实际时钟脚，复用逻辑来源分析，输出顶层输入位、有效采样边沿分组和逐跳/过程证据。例如：

```sh
dft-memory --top clock_top --scope clock_top --recursive \
  analysis/tests/memory-clock-sources.sv \
  --memory-library analysis/tests/memory-clock-library.json --clock-sources
```

`clocks.rows` 索引原映射，resolved 行的 group 指向共同根位/有效边沿；反相和模型负边沿共同决定该边沿。constant/undriven 标为 unusable，动态门控、选择、内部生成、环和多驱动保留 unresolved 证据。`--clock-max-work/depth/millis` 限制新增阶段；`--require-complete` 对 partial 返回4。旧调查原样保存在 source，旧 `--clock-pin` 仍只控制调查内的结构 cone。不能与 `--plan-tests` 混用：这里提供 RTL 来源，不自动推断测试域、周期或电气可行性，也不生成 MBIST 执行器。契约见 DESIGN7.19，严格形状见 memory/memory-clock-sources.schema.json。

显式测试域的RTL来源检查（DESIGN7.20）：在原计划命令上增加`--inspect-test-domains`，例如：

```sh
dft-memory --top TOP --scope TOP --recursive design.sv \
  --memory-library memory-library.json --plan-tests --test-config test-config.json \
  --inspect-test-domains --clock-max-work 1000000 --require-complete
```

输出完整原计划/规则报告、原时钟证明，以及每个声明域的成员、来源组和原控制器索引。`uniform`表示已观察成员来源一致，`mixed`表示已知多个位/有效边沿来源，`unresolved`表示不足以判定；`sourcesComplete`独立标识本域已观察成员是否全部解析。mixed可与未决成员共存，也可在观察全部完成时exit0，不自动推翻用户测试域、改变分配或推导物理时钟等价。原计划预算未到达的已观察内存仍参与域关联，缺分配不会自动补全；全局partial沿原计划/时钟完整性和缺域记录，`--require-complete`退出4。

该模式支持原静态分配、规则、配置文件及内存库，必须`--plan-tests`，不能与独立`--clock-sources`、调度、计时、覆盖或比较模式混用。时钟预算独立于规划；报告是分析事实，没有生成测试时钟、MBIST RTL或执行协议。

测试域的RTL来源允许集校验（DESIGN7.21）：在原计划命令上使用`--check-test-clocks expected-clocks.json`，替代`--inspect-test-domains`。文件示例：

```json
{"formatVersion":1,"kind":"memory-clock-expectations","domains":[{"clockDomain":"core-test","sources":[{"path":"chip.clk","bit":0,"edge":"posedge"}]}]}
```

`path`精确匹配已证明的RTL根端口完整路径，`bit`是Core归一位偏移，`edge`是归一后的有效采样边沿。允许同域多个来源，也允许不同域共享来源；声明不会自动改写测试域。输出保留完整域分析和逐内存match/mismatch/unresolved/unconstrained/unassigned，已知不匹配使verdict=fail，即使别处仍未决；只有完整检查且全部匹配才pass，否则unknown。未观察到的允许集保留为unused并使校验不完整。

`--require-complete`只检查完整性（partial退出4），完整fail仍正常输出并退出0；调用方应读取verdict决定是否满足自己的约束。支持原分配/规则/配置和clock-max-*，不与其它分析模式混用。允许集约束的是当前RTL来源，不是将来MBIST测试时钟、频率/相位、切换电路或电气签核；严格输入文件复用1MiB及普通文件边界。

声明测试方案联合检查（DESIGN7.22）：一个命令同时得到原规划/批次/计时覆盖和RTL来源允许集结果：

```sh
dft-memory --top TOP --scope TOP --recursive design.sv \
  --memory-library memory-library.json --plan-tests --schedule-tests --time-tests \
  --test-config test-config.json --assess-tests expected-clocks.json --require-complete
```

`expected-clocks.json`沿上文允许集格式。每个已观察宏给出`satisfied`（已计时且来源匹配）、`blocked`（原方案有确定阻碍或来源不匹配）、`pending`（尚未检查完），保留两条链的全部问题及原事实索引。任何已知阻碍使verdict=fail，即使仍有partial；全部检查完整且成员满足才pass，否则unknown。完整fail仍exit0，`--require-complete`仅partial退出4。此结果验证用户声明的方案和当前RTL来源，不证明物理安全或生成MBIST执行器；不会自动剔除成员、调整分配或改变原调度。

多方案联合比较（DESIGN7.23）：

```sh
dft-memory --top TOP --scope TOP --recursive design.sv \
  --memory-library memory-library.json --plan-tests --schedule-tests --time-tests \
  --compare-test-config baseline baseline.json --compare-test-config candidate candidate.json \
  --compare-clock-expectations baseline baseline-clocks.json \
  --compare-clock-expectations candidate candidate-clocks.json --require-complete
```

每份配置都须提供同名允许集；允许集参数顺序不限，空约束用显式空文件表示。所有方案共用一次调查和一份RTL时钟证明，保留原配置比较中的成本/时段与各自联合判断。输出逐宏参考状态→当前状态；只有双方联合检查完整才提供满足/阻碍/未决数量差值。完整fail仍可比较，partial仍可查看已观察状态对，但无完整汇总差值。不会自动排名或改写配置；原`--compare-test-config`独立模式保持。

### 共享测试资源容量

多个测试控制器需要共用总线、访问端口或其它逻辑资源时，可在测试配置的 `scheduling.resources` 声明容量：

```json
"scheduling": {
  "resources": [
    {"name": "test-bus", "maxParallelControllers": 1, "clockDomains": ["scan-a", "scan-b"]},
    {"name": "access-ports", "maxParallelControllers": 2, "clockDomains": ["scan-a", "scan-c"]}
  ]
}
```

每个控制器每批占1单位，多个资源同时生效；同域的不同控制器分别占用。资源满时留待下一批，继续尝试其它控制器；批次完成后释放。原全局并行数、功耗、批次/工作预算和时长限制继续适用。

也可独立保存为 `{ "formatVersion": 1, "kind": "memory-schedule-resources", "resources": [...] }`，在原显式或规则分配命令中增加 `--schedule-resources resources.json`。此选项要求 `--plan-tests --schedule-tests`，可接 `--time-tests`、`--test-coverage` 或 `--assess-tests`。使用 `--test-config` 或 `--compare-test-config` 时，把资源写入各自配置文件，不能再从CLI覆盖。

C++ 使用 `MemoryTestScheduling::resources`，输入文件可通过 `parseMemoryScheduleResources` / `loadMemoryScheduleResources` 读取。原计时和比较直接消费受约束的新批次。资源是用户声明，不从功能RTL时钟推断，也不生成执行电路或保证最优调度。未声明资源时原输出不变；带资源的新输出需新版Schema读取器。详见DESIGN7.24。

### 测试域先后关系

当一个测试域必须等另一个域全部控制器完成后才能运行，在测试配置中加入：

```json
"scheduling": {
  "dependencies": [
    {"before": "repair-check", "after": "array-test"},
    {"before": "array-test", "after": "retention-test"}
  ]
}
```

也可使用独立文件 `{ "formatVersion": 1, "kind": "memory-schedule-dependencies", "dependencies": [...] }`，通过 `--schedule-dependencies dependencies.json` 加入原 `--plan-tests --schedule-tests` 命令。`--test-config` / `--compare-test-config` 从各自配置读取，不能再用CLI覆盖。C++使用 `MemoryTestScheduling::dependencies`，文件入口为 `parseMemoryScheduleDependencies` / `loadMemoryScheduleDependencies`。

域名精确匹配显式分配，多个前置必须全部满足。依赖域的全部已发布控制器完成后，在下一批才能解锁；并行数、功耗、共享资源限制继续适用。环路、自环和重复边在读设计前拒绝。没有已发布前置控制器时报告 `dependency_unavailable`，前置控制器受阻时报告 `dependency_blocked`，并保留对应声明索引；独立域仍继续。覆盖和联合评估显示相同的阻碍原因，计时及方案比较使用实际受约束批次。

这约束的是本次已发布条件计划；原调查/规划不完整时依然partial，不证明未观察域不存在，也不生成测试控制RTL。未声明依赖时旧输出和work保持；带新字段/原因的格式需新版严格reader，C++静态消费者需重编。契约见DESIGN7.25。

### 资源再次使用前的恢复时间

资源声明可加 `"recoveryPicoseconds": 5000`（省略或0表示无恢复等待）：

```json
{"name":"test-bus","maxParallelControllers":2,"clockDomains":["scan-a","scan-b"],"recoveryPicoseconds":5000}
```

放在原资源文件或 `test-config.scheduling.resources` 内，通过原 `--schedule-resources` / `--test-config` / `--compare-test-config` 输入；加 `--time-tests` 执行恢复计时。每个使用批次结束后，整个资源须恢复指定间隔；首次使用不等待，最后使用之后的恢复不计任务时长。中间独立批次经过的时间会抵扣恢复间隔；多个资源取所需等待的最大值。原调度器的批次顺序和成员保持。

发生等待的波次带 `resourceWait`，列出等待时长和对应资源声明索引；timeline与comparison metrics给出 `resourceWaitPicoseconds`，可比较等待差值。总时长包含等待，最大时长预算同样约束它；覆盖和联合评估使用推迟后的实际成员时段。失败批次不会发布半段等待或更新资源使用状态。恢复时间是用户的条件声明，不是从RTL测得的硬件恢复时间。

默认无恢复时间的旧请求/work/输出保持；新恢复字段需新版严格reader，C++静态consumer需重编。见DESIGN7.26。

### 每个共享测试资源的功耗上限

原资源声明可加 `"maxPowerMicrowatts": 300000`；省略或0表示该资源不额外限功耗。全局 `--schedule-max-power` 和资源容量仍同时适用，例如：

```json
{"name":"test-supply-a","maxParallelControllers":4,"clockDomains":["a","b"],"maxPowerMicrowatts":300000,"recoveryPicoseconds":1000}
```

同批使用该资源的每个控制器按完整step功耗累计。同域多个控制器分别计入，重叠资源各计完整功耗；这些都是显式条件声明，不是实测电源归属或电气峰值。单步本身超过资源上限会报告 `resource_power_exceeded`，progress的 `resource` 指向原声明；本批剩余功耗不足只推迟到后续批次。原step不拆开，前置域受阻沿依赖链传播。覆盖/联合评估保留阻碍原因，计时/恢复与方案比较使用实际新批次。

继续通过原 `--schedule-resources`、`--test-config` 或 `--compare-test-config` 输入。默认0保持旧行为/work/输出；新字段和原因需新版严格reader，C++消费者重编。契约见DESIGN7.27。

### 前置测试域完成后的等待

原依赖声明支持`{"before":"a","after":"b","minimumGapPicoseconds":1000}`。在a域全部控制器完成所在波的屏障后，b域所在批次至少等待该声明间隔；已过去的中间批次时间会抵扣，多条前置等待取最大值。通过原依赖文件或test-config输入，无新CLI模式。只调度先后顺序不会执行计时，需同时启用`--time-tests`。

资源恢复和依赖间隔可重叠，实际开始满足两者。报告先计resourceWait，再把额外未覆盖的间隔写入dependencyWait及原依赖索引，二者之和是总波前等待，不重复累计。覆盖、联合评估和方案比较使用实际新时段，comparison提供dependencyWaitPicoseconds差值；partial仍省差值。默认0保持旧行为/work/输出；新字段需新版严格reader，C++消费者重编。它是条件声明，不是电气稳定时间的测量或签核，见DESIGN7.28。

### 查看共享测试资源的占用

在原规划/调度/计时命令上添加`--test-resource-usage`。支持`--test-config`、规则或手工声明；与coverage、assessment、clock/domain检查及比较模式互斥。`--usage-max-work/uses/millis`控制独立报告预算，`--require-complete`在上游或本阶段不完整时返回4。

每个原资源都有一行：`occupiedPicoseconds`为使用批次的屏障占用时长和（含批次开销，排除波前等待），`peakControllers`及`peakPowerMicrowatts`为批次峰值。`uses[].wave/entries`直接引用完整source中的批次成员，继续定位控制器、步骤和内存。未使用行保留0；partial中的0仅是已处理前缀。资源之间可能重叠，不能将占用相加冒总时间，也不代表测得动态功耗。DESIGN7.29定义计费、原子前缀和兼容边界。

### 比较多套配置的资源占用

在原三阶段命令中使用`--compare-test-config baseline baseline.json --compare-test-config candidate candidate.json --compare-resource-usage`。2..8套配置共用一次设计调查；`--usage-max-work/uses/millis`对每套配置独立生效。新报告包含原比较source、逐配置usage，以及按资源名称对齐的rows/cells；cell.resource指向该配置自己的资源声明与占用行。

只有双方域集合相同且占用分析完整时，`status=compared`并给出占用时长、峰值控制器及峰值声明功耗的有符号差值（本项减第一套参考）。资源缺失、参考缺失、域集合变化、partial分别明确标识且无delta；声明未使用且完整才是可比的零。资源和域的声明顺序可不同，容量/功耗/恢复等配置条件可以变化。`--require-complete`检查分析完整性，不把资源身份不匹配当执行失败。与单配置占用/时钟检查/联合评估互斥；不排序推荐方案或推物理资源等价。见DESIGN7.30。

### 按测试域声明资源单元需求

同一个资源可同时限制控制器数量和单元总量，例如 `{"name":"bus","maxParallelControllers":4,"clockDomains":["a","b"],"maxUnits":4,"domainUnits":[{"clockDomain":"a","units":3}]}`。a域的每个控制器每步骤占3个单元，b域默认1个；不按步骤内内存数量再乘。单个控制器超过容量会明确阻碍为`resource_units_exceeded`，累计容量不足则留到后续批次；所有匹配资源都必须满足。

沿原资源文件或test-config输入，无新CLI模式。占用报告在启用单元声明的资源上增加`peakUnits`；资源比较在任一方启用时增加有符号单元峰值差值，旧方以`peakControllers`作为默认单元峰值。partial/身份不匹配仍无delta。默认maxUnits=0且domainUnits为空保持旧输出，详细约束与兼容边界见DESIGN7.31。

共享测试资源可在原 `resources` 文件或 test-config 的 `scheduling.resources` 中声明
`unavailableIntervals: [{"startPicoseconds":10000,"endPicoseconds":20000}]`。
时段相对原点0、左闭右开，须有序且不重叠。原计时模式将完整测试波移到所有使用资源均可用的最早位置；
`availabilityWait` 给出原资源/区间索引，汇总及配置比较包含额外等待，资源占用不包含等待。
日历等待可超过10^12ps，严格输出Schema允许至2^53−1；波结束和累计时长仍须满足安全整数及配置预算，超限时不发布半波。旧版Schema需更新才能读取合法的大等待结果。
不声明时保持旧计时和工作计费。此为声明条件规划，非物理资源安全保证；详见 DESIGN 7.32。

共享资源的可选 `partitions` 可限定控制器的测试分区，例如
`"clockDomains":["test"],"partitions":["island-a","island-b"]`。
省略或空数组匹配所有分区；`[""]` 只匹配空分区。资源容量、功耗、单元、恢复、不可用时段和占用统一按域与分区匹配。
同名资源的分区集合不同会在资源比较中标记 `partition_mismatch` 并省略差值；分区列表顺序不影响身份。详见 DESIGN7.33。

依赖声明可分别限定前置与后置分区，例如
`{"before":"a","beforePartitions":["p0"],"after":"b","afterPartitions":["p1"],"minimumGapPicoseconds":1000}`。
只有 a/p0 的控制器必须先完成，b/p1 才能运行；a 的其它分区受阻不会沿此边阻碍 b/p1，其后续批次也不会重新开始这条边的等待计时。
省略或 `[]` 匹配所有分区，`[""]` 仅匹配空分区；找不到匹配前置时明确报告 `dependency_unavailable`。
同一域对可声明不同选择集合的多条依赖，但仍禁止同域自边和域级循环。
沿原 `--schedule-dependencies` 或 test-config 的 `scheduling.dependencies` 使用，计时及所有派生报告保留原选择和索引。
默认行为保持；新增字段需要新版严格 reader，C++ 消费者需重编。详见 DESIGN7.34。

按测试分区覆盖周期（DESIGN7.35）：在配置的 `timing.clocks` 中给分区声明周期，未命中者使用同域默认值：

```json
[
  {"clockDomain":"scan","periodPicoseconds":1000},
  {"clockDomain":"scan","partitions":["slow_bank",""],"periodPicoseconds":2000}
]
```

这里 `slow_bank` 和空分区使用2000ps，其余使用1000ps；声明顺序不影响优先级。同域分区选择不得重叠，每域至多一个默认值。没有匹配周期时，保留已完成波并报告 `clock_missing`。原控制器、资源和依赖分组保持，覆盖/占用/评估/配置比较自动使用新时长。

手工参数可重复使用 `--test-partition-clock scan slow_bank 2000`，配合原 `--test-clock scan 1000`；与所有计时参数一样，不能混用 `--test-config` 或比较配置。空参数 `''` 只匹配空分区；省略或空选择数组表示域默认。新字段/参数需新版读取器，不代表物理时钟切换电路已实现。

### Wrapper 边界结构调查

`dft-wrapper` 调查所选实例的端口位：input 向内部看用途、output 向内部看驱动，
inout 分别给出两个方向。穿过组合依赖和层级绑定，在首个寄存器或实例边界停止。
每行保留原始位映射、寄存器 data/clock/control/async 角色和终点引用。
可以从中定位需要进一步检查的 wrapper 端口；结果不是扫描单元插入方案。

```sh
./core/build-analysis/analysis/dft-wrapper --top TOP --scope TOP.u_core \
  --port data_in --port data_out --require-complete -F design.f
```

C++ 消费者链接 `dft_wrapper` 并调用 `investigateBoundary`；JSON 消费者另链接
`dft_wrapper_json`。严格新增输出契约见 `wrapper/boundary-report.schema.json`（引用原
Core Schema7，Core 事实自身仍采用原可扩展字段规则）。完整结果 exit0；要求完整而
截断/未知时 exit4。`--max-ports`、`--max-bits`、`--max-work`、`--max-depth`、
`--max-millis`、`--page-size` 控制调查；预算中断仅保留完整位行，stop 指出停止处。
未知、保守依赖、组合环均标为 partial，不用端口名字猜时钟/复位，不做常量剪枝。
嵌套 scope 不扩散至父模块，位号为 Core 展平偏移，非 HDL 声明下标。


### Wrapper 单元建议与资源统计

在调查命令上加 `--plan-cells`，可得到每个端口方向位的共享候选、专用建议、显式排除或阻碍原因：

```sh
./core/build-analysis/analysis/dft-wrapper --top TOP --scope TOP.u_core \
  --plan-cells --max-input-candidates 4 --max-output-candidates 1 \
  --cell-rule clk input exclude \
  --cell-bit-rule data_in 0 2 input dedicated -F design.f
```

规则按精确端口名及展平位范围匹配；同一方向的重叠规则拒绝。未匹配任何已提交行的规则列入
`unusedRules`，结果保持 partial。`share` 是受证据和候选数上限约束的请求；控制用途、
非逐位数据映射、未知证据不会自动成为共享候选。显式 exclude/dedicated 也不会把原调查 partial 升级。

`sharedCandidateBits` 是各共享建议行的候选位数之和；`uniqueSharedBits` 按实际状态信号和位区间
跨事实、路径及端口求并。`sharedSignals` 和原始 terminal 索引提供计数依据。`addedCells`
仅为 dedicated 方向行数，inout 两方向分开计；这些是结构建议，不是已插入或认证的扫描单元。

C++ 使用 `CellPlan.h` / `planWrapperCells`；结果拥有完整原 `source` 和新 `plan`。
`--max-plan-rows`、`--max-plan-work`、`--max-plan-millis` 独立约束规划；只有完整行才提交建议、
计数及规则使用记录。严格新格式为 `wrapper/cell-plan-report.schema.json`，引用原边界及 Core Schema。
默认命令仍输出原调查格式；新标识/选项需新版 reader。`--require-complete` 对整体 plan 判定 exit4。


### Wrapper 逻辑链组织

`--plan-chains` 在原调查和单元建议上继续分配逻辑链位置：

```sh
./core/build-analysis/analysis/dft-wrapper --top TOP --scope TOP.u_core \
  --plan-chains --chain main 512 --chain-default main \
  --chain aux 64 --chain-port aux_out output aux \
  --cell-rule clk input exclude -F design.f
```

每条链必须显式声明容量；`--chain-port` 或 `--chain-bits PORT LSB WIDTH DIRECTION CHAIN`
覆盖默认归属，没有规则或默认的可用行报告 unassigned。同一寄存器位在同链只占一个位置；
若要求放入另一链，整行 chain_conflict。容量不足也不会占用半行资源，后续行仍可复用已有位置。
报告的 segments/uses 给出链偏移、段内偏移及原始候选行链接，可追溯每一分配和复用。

`--max-chain-rows/segments/work/millis` 分别限制行、全局新段、工作和软时间。
`source`保留原单元报告；源 partial、未消费归属规则、阻碍或截断都会使 layout partial。
这些是结构候选的逻辑组织，不能据此认定物理扫描兼容，也不生成插入RTL。
新API为 `ChainPlan.h` / `planWrapperChains`，严格格式为 `chain-plan-report.schema.json`；
新模式与显式 `--plan-cells` 互斥，但支持其策略/规则/预算选项，原两模式保持。

### Wrapper 配置文件

用 `--config` 重复运行同一份调查与规划声明，命令行保留设计输入和顶层选择：

```sh
./core/build-analysis/analysis/dft-wrapper --top chain_top \
  --config analysis/tests/wrapper-config.json analysis/tests/wrapper-chains.sv \
  --require-complete
```

示例选择 `q` 和 `alias_q`，将其共享候选放到容量4的 `scan` 链；重复的寄存器位复用原位置。
配置根字段为 `formatVersion:1`、`kind:"wrapper-config"`、`mode` 和 `boundary`：
`boundary` 模式只调查，`cells` 可带 `planning`，`chains` 可带 `planning` 且必须有 `chaining`。
各块直接使用原请求的字段和默认值，完整示例见 `tests/wrapper-config.json`，输入形状见
`wrapper/wrapper-config.schema.json`。未知字段、重叠规则、未知链引用及不精确整数均拒绝。

`--config` 与所有手工分析参数互斥，包括 `--scope`、`--port`、模式标志、策略、规则和预算。
RTL、`--top`、`-f/-F/-I/-D`、`--require-complete` 仍由命令行提供。声明文件不包含RTL路径，
不改变文件列表相对路径语义；它不保存应用会话。最多读取1MiB UTF8普通文件，不展开环境变量或include。
C++ 链接 `dft_wrapper_input`，调用 `parseWrapperConfig` / `loadWrapperConfig`，然后将返回variant
中的原请求交给相应分析入口；返回请求拥有输入字符串，原报告和退出政策保持。

### 比较 Wrapper 方案

用相同调查范围的多份链配置比较资源代价，最多8份：

```sh
./core/build-analysis/analysis/dft-wrapper --top TOP -F design.f \
  --compare-chains shared shared.json --compare-chains dedicated dedicated.json \
  --reference shared --require-complete
```

所有文件必须为 `wrapper-config` 的 `chains` 模式，`boundary` 解析后的值完全相同。
只调查一次，随后按各自策略、规则和预算生成完整的单元/链结果。`summaries` 给出相对参考的
专用位、共享位、复用位和总长度差值；`chains` 按名称对齐各方案，明确标识新增、移除及未使用的链。
参考或目标方案不完整时省略该对的差值；其它完整方案仍可比较。数值比较不代表物理扫描兼容。

`--max-comparison-chains/work/millis` 仅限制比较矩阵阶段，前面的调查和各方案规划仍用配置预算。
截断不发布半个矩阵行；已完成方案的summary和已提交行差值仍有效，整体 `complete` 为false。
此模式与 `--config`、`--scope`、手工策略/规则等分析参数互斥；设计输入与 `--require-complete` 沿用。
C++ 使用 `ChainComparison.h` / `compareWrapperChains`；报告拥有一次共同source和每方案原plan/layout，
各行索引保留原含义，严格新格式见 `chain-comparison-report.schema.json`。

### 定位 Wrapper 链覆盖与阻碍

在手工 `--plan-chains` 或链配置上添加 `--chain-coverage`：

```sh
./core/build-analysis/analysis/dft-wrapper --top TOP -F design.f \
  --config wrapper.json --chain-coverage --require-complete
```

报告保留原链规划，`coverage.rows` 为每个已调查端口位/方向给出 placed、excluded、blocked 或 pending。
未到达规划/链阶段的位标为 pending；已明确排除或阻碍的位保留原原因。沿 sourceRow/cellRow/chainRow
可以回到调查证据、候选与链规则，placed.positions 给出链内绝对区间及共享状态位区间。
`coverage.ports` 按端口/方向汇总已提交行，排除不算放置，别名位置不当作新增链资源。

`--max-coverage-rows/positions/work/millis` 控制独立覆盖阶段；预算截断时行、位置及汇总一起提交或丢弃。
原调查/规划仍沿配置预算，不会补造未调查位或把部分结果升级为完整覆盖，不代表物理测试覆盖率。
C++ 入口为 `ChainCoverage.h` / `inspectWrapperCoverage`；结果格式见 `chain-coverage-report.schema.json`。

Wrapper 链共享状态功能时钟检查（DESIGN7.42）：

```sh
dft-wrapper --top TOP --config wrapper-chains.json --chain-clocks --require-complete RTL.sv
```

手工`--plan-chains`也可附加`--chain-clocks`，与coverage/comparison互斥。它读取已分配共享位对应的
真实寄存器时钟，沿RTL求解顶层输入和反相边沿，报告single_clock/mixed_clock/unresolved；
专用单元为dedicated_only，不臆造时钟。mixed_clock可以是完整分析结果，`--require-complete`仅判断
证据完整性。原链规划嵌于source，pages/checks保留事实与溯源，行引用原segment，别名不重复计状态位。
`--max-clock-rows/registers/work/depth/millis`和`--clock-page-size`独立限制检查；这些参数无时钟、异步控制保持或兼容性模式时报错。
结果Schema为`wrapper/chain-clocks-report.schema.json`。这是共享状态的功能时钟检查，不是scan插入、
测试时钟可控性/CDC/物理时序认证；原source partial继续保留，未完成寄存器分页不能证明单一时钟。

Wrapper 链异步控制保持约束（DESIGN7.43）：

```sh
dft-wrapper --top TOP --config wrapper-chains.json --chain-resets --require-complete RTL.sv
```

也支持手工`--plan-chains`。原功能时钟报告完整保留在source，通过原寄存器async事件推导共享状态
的复位/置位输入应保持的非激活电平。rows引用原segment/sourceRow/match/event，checks保留源证明；
inputs按顶层输入位区分，holds列出low/high要求。同链要求同一输入位既低又高时报告conflict，
恒定激活报告asserted，生成逻辑或未知事件保持unresolved，无异步控制为clear。
`complete`只表示证据完整；conflict/asserted也可能完整，不能把`--require-complete`当作无冲突门禁。
各链独立汇总，专用单元不臆造RTL控制；原时钟未访问到的段为pending，原source partial继续保留。

`--max-reset-rows/events/work/depth/millis`限制独立异步阶段；事件上限统计访问过的事实引用，
中途截断整行不进入约束及状态位汇总。可同时使用`--max-clock-*`和`--clock-page-size`限制上游，
但无需添加`--chain-clocks`；与显式clocks/coverage/comparison模式互斥，配置v1不变。
C++入口`ChainResets.h` / `inspectWrapperChainResets`，严格格式见`chain-resets-report.schema.json`。
本功能依赖现存异步事实，未知事件类型不升级为已知；不覆盖同步复位、scan插入、测试协议或物理时序。

### 关联 Wrapper 链时钟与复位保持要求

```sh
dft-wrapper --top TOP --config wrapper-chains.json --chain-compatibility RTL.sv
# 显式声明需要共同检查的集合（默认每条链独立）
dft-wrapper --top TOP --config wrapper-chains.json --chain-compatibility \
  --compatibility-group active scan_a --compatibility-group active scan_b RTL.sv
```

`single_functional_clock`策略检查同一集合只有一个功能时钟源/有效边沿，异步控制保持条件一致，
且功能时钟输入没有同时被要求固定电平。结果为compatible/conflict/unresolved/empty；
同链或跨链相反电平、常量激活、多功能时钟、时钟输入被保持均保留具体原因和原证据索引。
专用单元尚无RTL控制定义，标为unresolved。完整conflict仍是问题，`--require-complete`仅检查证据完整性。
结果完整保留原ResetReport，局部集合complete与整体source partial分别表达。

可重复`--compatibility-group NAME CHAIN`声明集合；各集合独立，同链可用于不同集合，集合内部不能重复。
`--max-compatibility-groups/work/millis`控制新阶段，可用原clock/reset限额控制上游；与显式clocks/resets/
coverage/comparison模式互斥。配置v1不变，也可配原手工plan-chains。C++使用`ChainCompatibility.h`，
严格格式见`chain-compatibility-report.schema.json`。compatible仅表示该策略下已观察功能控制无矛盾，
不是scan时钟配置、同步复位、测试协议或物理时序安全认证。

### Wrapper 自动功能活动批次

`dft-wrapper --top TOP FILE --config chains.json --plan-activity --max-activity-chains 8 --max-activity-bits 256 --require-complete`

按原链声明顺序first-fit，复用功能时钟/异步保持判据，自动把已知相容的链归入批次。
`activity.rows`逐链解释assigned/conflict/unresolved/empty/oversized/pending；batches给原链索引、共享位库存、原clockGroup和保持电平。
`--max-activity-batches/work/millis`限制新阶段；原compatibility/clock/reset限额仍可用于上游。
批次容量不足不拆链；未知和专用控制不纳入。达到批次数上限仍可加入已有批次，只有需要新批次时才停止。
这是功能活动分组建议，不是最少批次证明或扫描测试时间表。完整conflict/oversized仍有问题；exit4只说明证据partial。
原chains配置v1及原命令保持；`--compatibility-group`不用于自动模式。见DESIGN7.45。

### Wrapper 功能活动脉冲时序

`dft-wrapper --top TOP FILE --config chains.json --schedule-activity --pulse-setup 2 --pulse-high 3 --pulse-low 5 --pulse-count 4 --require-complete`

复用自动活动批次，输出每批start/end、首末有效边沿、最后返回空闲的时刻、时钟电平和async保持要求。
时间单位为声明的tick，每批先建立输入，再重复active/idle脉冲；反相后的有效posedge/negedge决定空闲电平。
大脉冲数用压缩重复参数表示，不展开逐周期数据；安全整数溢出在打开Design前拒绝。
`--max-schedule-rows/ticks/work/millis`控制该阶段，原activity/compatibility/clock/reset限额用于上游。
总tick容量不足整批停止并保留原source与已提交前缀；证据不足不会生成可用批次。
它仅描述目标批次已观察到的功能控制条件，其他输入、状态值和批次切换影响未约束；不能据此认证扫描协议、状态隔离或物理时序。

### Wrapper 检查：运行、阅读、定位与复验

`dft-wrapper --top TOP -f files.f --config chains.json --explain-chains --format text --require-complete`

同一检查可用默认JSON取得结构诊断，或用text阅读链状态、具体clock/async原因和端口/状态的RTL声明位置。
返回位置来自编译快照，JSON包含contentHash；它不是写入语句位置或自动修复提案。
`--max-explain-chains/segments/locations/work/millis`控制诊断阶段；原compatibility/clock/reset限额用于上游。
先阅读conflict/unresolved与定位，再修改自己的约束副本（如显式排除不参与的端口），重跑同一命令核对变化。exit4仍表示证据partial，完整已知冲突也需要处理。
名称/路径转义后呈现，定位不可用显式保留。旧JSON命令与chains配置v1保持；text不是机器协议。

当前分析层CLI交付与Studio宿主分开验收：Wrapper对应产品路线S3 Scan后端，memory对应S4后端；历史S2-*计划名不表示Studio S2已完成。
本轮以已有检查可读、可定位、可修改约束复验为出口；宿主接线/计划保存失效/生成产物及后续算法不计为当前CLI完成项。

### 安装已有 Wrapper CLI

```sh
cmake -S core -B core/build-analysis -DHIER_BUILD_ANALYSIS=ON -DHIER_BUILD_EXPERIMENTS=OFF -DCMAKE_BUILD_TYPE=Release
cmake --build core/build-analysis --target dft-wrapper -j 4
cmake --install core/build-analysis --component WrapperCLI --prefix /absolute/path/wrapper-cli
```

安装树含原生工具、完整 Wrapper 报告 Schema 依赖、诊断/约束复验示例和只读字节校验工具，整体可搬移。
见[包使用说明](wrapper/packaging/README.md)。运行原生 CLI 不需要 Python；Python 只用于校验和从 CMake 组件生成归档。
本出口只交付既有 CLI；不新增 DFT 判据或 Studio 页面。安装包只面向构建目标平台和系统运行库，sanitizer 发行归档被拒绝。

### 完整原生分析套件

`cmake --build core/build-analysis --target dft-seqcheck dft-objects dft-memory dft-wrapper -j 4` 后，
用 `cmake --install core/build-analysis --component AnalysisCLI --prefix /absolute/path/analysis-cli` 安装四工具和完整离线 Schema 集合。
见[套件说明与可运行示例](packaging/README.md)。数据目录为 share/dft-analysis，清单使用独立 analysis-cli-manifest-v1。
旧 WrapperCLI 组件/布局保持，bundle 默认仍为 WrapperCLI；完整套件归档必须显式指定 `--component AnalysisCLI`。

### 原生报告导出

四工具支持 `TOOL --output NEW_FILE -- ORIGINAL_ARGS`，前缀和 `--` 必须位于原参数之前。
保存原JSON或Wrapper text，不再把报告复制到stdout；后端0/1/4均保存并返回原码，2/3/5/130等错误仍输出控制台且不发布文件。
父目录须存在，目标不能是任何已有文件/目录/链接；同父临时文件关闭后以hard link无覆盖发布，不支持链接时明确失败，不截断旧结果。
这只是原报告的可选文件出口，不改变分析/Schema/配置或引入工程持久化；强制终止可能留临时目录，不承诺断电或恶意并发filesystem安全。

### Node 宿主运行已有分析

[analysis/host](host/README.md)提供独立ESM包`@dft-studio/native-analysis`：给定原AnalysisCLI的绝对bin目录，
逐次启动四个已有工具，保留原报告/退出码，提供实时stderr、取消/超时/输出上限和dispose回收。
它不复制领域规则或Core NDJSON协议；Studio任务/设计会话接线仍由实际宿主负责。见DESIGN7.53及包内可运行调用示例。

同包`NativeAnalysisSession`可统一四工具的设计输入，换代时先失效旧结果、取消并回收旧进程，消费时用`isCurrent/assertCurrent`拒绝旧generation。
支持原文件、-f/-F、include和宏；保留最终argv及原报告来源，不把意图代际当作编译快照。运行包内session-workflow示例可实际调用四工具和约束复验。
该内存生命周期层不新增任务存储；Studio现有RunService/工程重连仍另行接线。见DESIGN7.54。

可选`@dft-studio/native-analysis/reports`入口用原安装Schema离线验证JSON报告，提供带当前性检查的只读结果和SourceSpan定位。
读取片段时核原contentHash，保持UTF8字节位置并给JavaScript编辑器UTF16选择；源码变化/取消/换代明确拒绝。
包内report-source-workflow实际演示临时约束的冲突→阅读原声明→修改副本→新代复验。原CLI/Schema不改，见DESIGN7.55。
