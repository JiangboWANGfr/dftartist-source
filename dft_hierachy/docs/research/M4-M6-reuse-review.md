# M4 基础设施复用回顾与 M5 M6 组件选型

2026-10-13，Agent D。面向 A 的实现取舍、B 的独立验证和 C 的契约审查。

**D-REUSE-04 修订：** 已接受 C-67～69 并复现 B 的 Unicode 线索。原版 jsoncons 桥接不能直接采用；本报告收紧相关结论，保留 D-REUSE-03 的原实验事实和机器证据。新增 655 个同路径字节输入、有限 span 和真实浏览器 Worker 实验见 [续研报告](M4-M6-reuse-followup.md)。原报告 SHA 为 `857665eced7a15373a675279aa836993060d8f944e48f6e1e15ded3f1efb2a20`；旧探针和旧证据不改写。

**C++ Schema 复用继续作为候选验证，当前先保留生产验证器；保留协议会话和客户端中属于本项目契约的状态管理。M5/M6 直接采用虚拟化和布局库，树的远端分页模型、选择模型、图片段所有权继续由本项目负责。** 现有测试通过是兼容基线，不能用来证明自研方案的维护成本最低。

原研究中，**jsoncons 实际通过 B 原冻结的 569 个结构用例**，另测的 8 个整数 Schema 边界也符合预期。但这两组用了不同解析路径，不能合成为完整替换通过。C-67 证明原桥接会混淆 number/string；续研即使保留严格 decoder，仍在 655 项中出现 7 个类型误接受。jsoncons 仍值得研究，已不建议按原桥接直接进入生产切换。

这些是选型建议，尚未改动 DESIGN 或生产依赖。架构权威仍是 [DESIGN](../DESIGN.md)，阶段事实以 [REVIEW_LOG](../REVIEW_LOG.md) 最新交接为准。本文承接 [前次客户端研究](M5-M6-client-research.md) 和 [Studio 产品参考报告](DFT-Studio-reference-report.md)，重点补实现复用的证据。

## 1 结论与优先级

| 部分 | 当前落点 | 建议 | 决定依据 |
|---|---|---|---|
| C++ JSON 解码 | `DecodeFrame.cpp`，282 行自写扫描 | **当前保留；重写选型理由，保留 SAX 替代通道** | SAX 能构造唯一 owned tree；但实测原始数字接受集合有差异，精确错误偏移与 UTF-8 优先级也仍需适配 |
| C++ Schema 结构校验 | 404 行 Python 生成器、162 行 primitives，产出 7,870 行 C++ | **保留生产实现；jsoncons 为有条件候选**；方法登记、默认值应用继续生成 | 原桥接有已复现的类型缺陷；严格 decoder 加临时上游类型修补在 655 项中对齐，只证明原因和修补方向，未形成可直接采用的依赖 |
| C++ 会话调度 | `SessionState`、`SessionWorker` | **保留** | 单 worker 持有 Design、取消发布顺序、256 请求和输出预留属于本项目协议，不是通用 RPC 库自动提供的行为 |
| C++ stdio I/O | `Serve.cpp` 的非阻塞 poll/read/write | **与会话状态分开评价；Asio 是后续替代候选** | Asio 能替代 I/O 机械代码；仍须保留 EOF、背压和输出归属规则。本轮没有 Asio 运行等价证据，不将其设为 M5 前必改项 |
| TS 生命周期和请求合并 | `client.ts` | **保留协议适配层** | TanStack Query 能复用查询/观察者机制，却不能直接满足 hello、快照、错误归属、每调用者独立取消和 wire id 规则 |
| TS LRU 缓存 | `reply-cache.ts`，43 行 | **当前保留** | `lru-cache` 可胜任；当前功能很窄，43 行实现与适配库的 4 场景、48 步结果一致。理由是复杂度与依赖成本，不是库不支持字节预算 |
| TS 类型与验证 | Ajv、json-schema-to-typescript、esbuild | **继续直接采用** | 这部分已经复用成熟实现；少量方法登记、规范化和 UTC 日期约束属于项目适配 |
| M5 树 | 目前 L6/L7 仍是骨架 | **直接采用 TanStack Virtual；自有 TreeModel；react-arborist 借鉴交互并保留备选** | Arborist 可外接懒加载，但会重建已加载嵌套树；远端分页、错误、取消、快照仍需模型拥有 |
| M6 布局 | 尚未接入新工程 | **直接采用 elkjs，放进真正 Worker** | 实际布局保留端口和不同事实的平行边；布局输入需要隔离，任务结算和过期发布需要薄适配 |
| M6 画布 | DESIGN 暂选 React/SVG | **仅作为浏览型组件路线保留；Sprotty 是正式备选** | “用了 DI”不足以否决 Sprotty；但引入它仍有第二份展示模型、渲染框架和事件桥接成本。当前没有浏览器对照证明任何一方全面更优 |
| d3-hwschematic、HAL | 尚未作为依赖 | **借鉴指定机制，不整体嵌入** | d3 的网络投影/高亮、HAL 的图上下文/选择联动有价值；它们不直接拥有本项目的 RTL occurrence、位段和来源生命周期 |

“当前保留”不等于永久冻结。A 可继续实施有边界的候选，但先解决已发现的适配缺陷，再由原契约和 B/C 验证决定是否切换；不把研究用临时修补当成正式依赖方案。

## 2 固定对象与证据边界

研究固定主树 `m3` 的 `4a53ebb4610cc5bbb9fb2787e05a99027e1a8d2d`；其生产运行时与 A 的 `a7d1501caad21170d23f2e6295f93c1f505998ea` 候选相同，后续提交为文档证据。DESIGN SHA-256 为 `bbd8ff1b66e20dd8014de5b4fedc2a7a09686ec7c62a0fe41e8dae5b39d43e67`；Schema 为 `30a9ca285b813202b5a9867485a6d301cbd450b31098c582542c3a11c89a1420`。

源码经 `git archive` 放到 D 自有临时目录；小型 C++ 探针只编译 decoder/primitives 和候选库，未构建 Slang 或全 Core。Node 使用 24.21.0，候选包安装在临时目录并禁用安装脚本。没有修改旧工程、ref、A 产品、B oracle 或协调表。

上述 D-REUSE-03 的版本、源码哈希、命令、输入和结果见 [原机器证据](m4-m6-reuse-evidence.json)。569 通过是 **D 用 B 的原输入执行候选库的兼容实验**，不是 B 对新实现的独立验收。该轮没有进行 GUI 实操、浏览器 Worker、可访问性、全量协议迁移、Linux/sanitizer 或性能验收。D-REUSE-04 另固定主树 `930ea58d65ef39824b2798b9d4db00f96040fc4c`，生产运行时相同；实际增加了 Chrome 原生 Worker 实验，仍未做 React/ARIA、画布操作对比、性能或生产迁移验收，见续研证据。

C-63～C-66 已由 C 正式关闭。D-REUSE-04 收尾已读取 A 对固定 `930ea58` 的新工具链、测试接线和验证归档（归档提交 `5034b4f`）；这些是 A 的执行，仍待相应 B/C 独立复核和 ID 耗尽前置。它们与本文的库选型结论独立，不能用研究实验宣布 M4 整体完成。

## 3 为什么 ref 里的代码没有直接成为依赖

`ref/` 主要收集 EDA 数据模型、前端和图形产品，不是一份协议基础设施候选清单。“下载过参考源码”“采用了设计思想”“链接了实现”需要分别记账。

| 参考 | 实际关系及当前落点 | 不整体接入的合理原因 | 仍应复用或补齐的部分 |
|---|---|---|---|
| Slang | 真正生产依赖，锁定 v12.0；见 [Slang.cmake](../../core/cmake/Slang.cmake) | `ref/slang` 的检出 SHA 与生产依赖不是同一版本，不可混记 | 继续调用语言前端和 AnalysisManager/ValuePath；禁止在 L4 越层引用 Slang 私有工具 |
| naja / OpenSTA / CIRCT | 模型参考，未作为本项目数据存储或协议库链接；见 DESIGN §4.1 | 引入完整网表/时序/IR 框架会增加另一套设计事实表示及转换；并不会直接交付本项目 wire Schema 和 TS SDK | 引用到具体定义、实例身份和跨层连接实现；不要把泛泛“参考”当作算法验证 |
| slang-netlist / yosys-slang / Yosys | 连接提取、位映射和对照参考 | 综合/降级后的图与保留原始 RTL 语义的查询模型不是同一交付物 | 本轮不补写尚未做过的逐算法对照；既有 M0–M3 证据与未覆盖项继续分开 |
| HAL | Qt/C++ 网表分析与 GUI；本轮重新核查 GraphContext、SelectionRelay | Qt 门级界面不能直接变成 React RTL 组件 | 选择/图成员/viewport 生命周期；更应看到它已采用的通用库 |
| elkjs / react-arborist / Sprotty / d3-hwschematic | M5/M6 候选，当前新工程还未接入 | 应以分页模型、展示身份、事件和资源所有权的适配成本选择 | 按下文具体采用，不能继续只列项目名 |
| netlistsvg / X6 / DigitalJS / libavoid | 导出、图编辑、仿真、避障路由的不同候选 | 与当前只读浏览型 M5/M6 重合有限 | 需求进入对应能力时复用，而不是把导出、编辑器或路由器重新写一遍 |

**HAL 使用现成 JSON 库是明确反例。** 它的构建有 vendored nlohmann 选项，持久化代码使用 RapidJSON `Document`，JSON writer 也包装 RapidJSON。因此“ref 没有可用 JSON 实现”不是事实；正确问题是这些库的哪一种 API 能满足本项目边界。[HAL 构建][HAL-CMAKE]、[持久化读取][HAL-JSON]、[JSON writer][HAL-WRITER]

旧 `dft_planner` 的 NDJSON/客户端也只能作为参考：直接复制会带回旧方法、旧身份和旧宿主状态。两个仓库继续共用本工程发布的协议 SDK、模型和组件；Studio 只增加产品工作区、业务分析、任务和文档管理，不复制另一套客户端。

## 4 M4 逐项比较

### 4.1 C++ JSON 解码

当前调用链为 `FrameReader → decodeFrame → envelope/id/snapshot 校验 → 方法 params 校验 → SessionState → SessionWorker → Design`。`decodeFrame` 先检查整个字节串的 UTF-8，再用有界递归扫描构造 `JsonValue`；数字保存完整 token。它的私有契约还要求重复键定位到第二个键的开引号、深度 129 定位到开括号，以及坏 UTF-8 优先于 JSON 语法错误。[实现](../../core/protocol/src/DecodeFrame.cpp)、[受审私有接口](../../core/protocol/src/SessionContract.h)

M4 计划给出的“唯一树、不引入第二份 DOM”是合理目标，**不能推出必须自写 JSON 语法解析**。RapidJSON 的 SAX `RawNumber` 和对象/数组事件可直接生成现有 `JsonValue`；本轮探针实际这样做了，保留了现有精确整数函数。[RapidJSON SAX][RAPID-SAX]、[探针](reuse-probes/json-reader.cpp)

| 候选 | 实测与源码结论 | 距离当前契约还有什么 |
|---|---|---|
| nlohmann DOM | 原始重复键被覆盖；`9007199254740991.1` 舍入成 `9007199254740991.0`，`0.99999999999999999` 舍入成 1；默认接受 BOM | 不能直接作为精确边界。需要在信息丢失前处理重复键、数字和 BOM |
| nlohmann SAX | 浮点回调能取得原 token，所以不是完全没有办法；整数回调给数值，`-0` 变成整数 0；超出浮点范围的 `1e99999` 在到达回调前失败 | 完整词法保留、重复键/深度/偏移等需适配。仅数字值相同不能满足当前“完整 token”的私有声明 |
| RapidJSON SAX | 带编码校验、RawNumber、迭代标志；薄 handler 直接构造一棵 `JsonValue`，补重复键、根对象和深度策略 | `kParseNumbersAsStringsFlag` 仍不能避免全部数字范围检查；实际拒绝 `0e99999` 和 `1e99999`。前者数学上是合法整数零。还没实现错误偏移和全帧 UTF-8 优先级等价 |
| 当前 decoder | 27 个研究输入中保留 token，并按现有私有契约区分语法错误与后续安全整数判断 | 自行承担 JSON 语法、UTF-8、代理对和边界维护，必须保持独立字节用例及后续 fuzz；不能宣称通过有限集合就穷尽正确性 |

27 个输入覆盖：普通对象、正确代理对、合法转义 NUL（当时未覆盖原始 NUL 字节）、孤立代理和未知字段坏键、重复/转义重复键、非对象、注释、尾随内容/逗号、前导零、10 种数字表示、128/129 层、非法 UTF-8、BOM。RapidJSON 研究适配器的接受/拒绝与当前 decoder 在其中 **25 个一致、2 个数字输入不同**；这是差异定位，不是“两项库 bug”或完整 wire 合规结果。`1e99999` 的词法接受不代表它可作为合法 wire 整数字段。

**C-68 修订：** 原探针确会接受 `{}<原始NUL>` 等三个非法前缀，nlohmann DOM/SAX 同样如此。D-REUSE-04 重编原探针复现；在相同 RapidJSON handler 上检查有限 span 的 `Tell()==size` 后，这三个反例被拒绝，合法 `\u0000` 仍接受。扩展 32 项从 27 项接受一致变为 30 项一致，剩余两项大指数差异仍在。不能截断或剥掉原始 NUL；原始 NUL 检查和帧尾检查也不能抢在全帧 UTF-8 校验之前改变错误优先级。精确错误偏移仍未适配。

**决定：当前保留 decoder 有依据，但必须替换原来的论证。** 理由应是精确私有边界与尚未解决的适配差异，不是“第三方必然造第二棵树”。不要为迁就库而拒绝所有小数/指数表示，也不要把 `1.0` 从合法整数变成非法输入。若后续用 nlohmann/RapidJSON，只替换词法层；FrameReader 的字节预算、JsonValue 所有权和上层语义继续保持。禁止复制/私改整份上游 parser 来假称“直接复用”。[nlohmann SAX][NLOHMANN-SAX]、[溢出处理][NLOHMANN-PARSER]、[RapidJSON 数字路径][RAPID-READER]

`JsonValue` 的具体容器类型是私有声明，不是永久固定的公共 ABI。若成熟库路线整体更省，A 可以提出另一种 owned 表示，B/C 按原语义处理私有测试适配。冻结测试保护输入和行为期望，不应反过来把实现锁死在某一种 variant 或扫描器上。

### 4.2 C++ Schema 生成与校验

这里需要拆成三件事：**JSON Schema 结构验证、`x-hier-methods` 方法登记、参数默认值与规范化。** 通用 validator 只替代第一件；后两件是项目的 wire 约定，不能因为引入库就删除。

当前 [generate_cpp.py](../../protocol/schema/scripts/generate_cpp.py) 生成定义校验、方法表和默认值应用；[SchemaPrimitives.cpp](../../core/protocol/src/SchemaPrimitives.cpp) 处理精确整数、数值相等、Unicode 长度、日期和受限 pattern。7,870 行 [生成 C++](../../core/protocol/src/WireSchema.generated.cpp) 不是 7,870 行手写，但 404 行生成器和 162 行 primitives 确实是持续维护责任。当前 pattern 只支持经检查的 ASCII 子集，不能把它描述为通用 2020-12 编译器。

| 候选 | 固定源码核查 | 判断 |
|---|---|---|
| nlohmann-json-schema-validator | README 明确主要支持 draft-7；认识 `$defs` 或局部新特性不等于完整 2020-12 | 不作为当前 Schema 的直接替代，不能擅自降级 dialect。[说明][NLOHMANN-SCHEMA] |
| RapidJSON Schema | 固定版本文档写明 draft-4；JSON parser 的适配性与 Schema dialect 是两回事 | 不选它承担当前 2020-12 结构语义，RawNumber 支持不能证明 Schema 支持。[说明][RAPID-SCHEMA] |
| jsoncons | 固定源码标识 1.10.0；官方支持 2020-12，Boost Software License 1.0；公开文档支持 json/ojson/pmr，现有 variant 不能直接接入 | **有条件候选，原适配不可切换**。C-67 与 Unicode 反例要求进一步解决类型、词法和拥有表示；不能把转换 trait 当作可替换 type validator 的公开钩子。[文档][JSONCONS-SCHEMA]、[许可][JSONCONS-LICENSE] |
| Blaze | 官方支持 2020-12；固定版本 LICENSE 为 AGPL-3.0-or-later 或商业许可 | 技术上不能用 dialect 否决；本轮未运行，且不应把它当无额外许可取舍的默认依赖。[说明][BLAZE]、[许可][BLAZE-LICENSE] |

jsoncons 的实际实验分开进行：

1. 编译当前完整 `hier.schema.json`，并分别按 `$defs` 入口验证 **B 原冻结的 569 个结构输入，569/569 一致**；格式检查显式启用。另用 `dependentRequired` 正反例确认不是只运行 draft-7 子集。
2. 原始数字直接解析的结果如下。`lossless_number(true)` 用带数值语义标签的字符串保存小数/指数形式；它能保留原文，却不会自动通过整数 Schema。

| 原始数字 | 应否通过非负安全整数约束 | 默认解析后验证 | 无损解析后验证 | 无损解析加现有精确整数函数 |
|---|---:|---:|---:|---:|
| `1` | 是 | 是 | 是 | 是 |
| `1.0` | 是 | 是 | 否 | 是 |
| `10e-1` | 是 | 是 | 否 | 是 |
| `9007199254740991` | 是 | 是 | 是 | 是 |
| `9007199254740991.1` | 否 | **是** | 否 | 否 |
| `0.99999999999999999` | 否 | **是** | 否 | 否 |
| `1e-99999` | 否 | **是** | 否 | 否 |
| `0e99999` | 是 | 是 | 否 | 是 |

最后一列复用生产 `schema::integer(JsonNumber{token})`：确为安全整数才构造整数值，其他值保留无损表示。**这里只证明八个整数约束样例，撤回它已经证明通用桥接可行的推论。** C-67 中非整数的 `bigdec` 值同时满足 `is_number()` 与 `is_string()`，实际 `InstGetParams.inst` 会误接受原始数字。569 个普通输入也不能替代原始数字、Unicode、重复键或协议顺序测试。[原探针](reuse-probes/jsoncons-schema.cpp)、[完整路径与公开扩展点续研](M4-M6-reuse-followup.md)

**修订建议：当前保留生产生成器；继续验证 jsoncons 结构后端，暂缓直接切换。** 保留 `findMethod`、方法 metadata 和默认值生成。续研的临时类型修补不是生产 fork 提案；还未证明维护成本低于当前实现。候选必须解决：

- 一个清楚的 owned wire 表示。若临时转换第二棵树，只允许在边界内有界短暂存在，记录内存成本；不要让两棵可变树长期并存。若改私有 JsonValue，先更新私有声明并由 B/C 处理适配，不能擅改 oracle。
- 保留精确整数与 UTC 毫秒日期规则；不要依赖默认浮点解析或放宽日期格式。未来 Schema 引入非整数数字时重新核查适配，不能把本实验泛化成通用数值方案。
- 保持 number/string 身份和所有未知扩展的 Unicode 规则，不另写字段约束表。错误代理对可能已经被 jsoncons 转成合法但错误的码点，事后验证 decoded 字符串不足以补救；解析器与结构 validator 必须分开选。
- Schema 来自同一权威文件，随构建交付；离线解析本地 `$ref`，初始化一次并复用，不给每条请求重新编译 195 个定义。测试读取磁盘 Schema 不代表产品必须运行时找文件。
- 证明参数默认值、未知字段处理、错误优先级、输入资源界限和 CLI/SDK 接受集合不变；补初始化、峰值内存与两平台构建数据后再决定正式切换。
- jsoncons 的 pattern 路径涉及 `std::regex`。M4 曾因 GCC 13/libstdc++ 的 sanitizer 构建告警替换过该路径，候选必须在原编译选项下复验，并检查长字符串成本；本机 Clang 探针通过不能消除这个平台风险。[pattern 工厂][JSONCONS-PATTERN]、[M4 修正记录](../plans/M4.md)

若该候选不能减少维护范围或初始化/内存成本不合适，允许保留当前生成器，但要把“当前 Schema 的受限编译器”边界写清，完整约束新增关键词及其参数形态。只检查关键词名字与当前三个 pattern，不能当作通用 dialect 兼容证明。

TS 侧已经使用 **Ajv 8.17.1、ajv-formats 3.0.1、json-schema-to-typescript 15.0.4、esbuild 0.25.11**。生成器离线产出 standalone 验证器，浏览器不携带 Ajv 编译器；应保持这条复用路线。[TS 生成入口](../../web/scripts/generate-protocol.mjs)、[Schema 说明](../../protocol/schema/README.md)

### 4.3 协议会话与 I/O

[SessionState.cpp](../../core/protocol/src/SessionState.cpp) 管理排队、运行、输出预留和终态发布；[SessionWorker.cpp](../../core/protocol/src/SessionWorker.cpp) 让唯一线程打开、查询、销毁 Design；[Serve.cpp](../../core/protocol/src/Serve.cpp) 管理 stdio、帧、id 和错误优先级。应该分别评价这些职责。

`vscode-jsonrpc` 已有 request/response 表、取消 token、Reader/Writer 抽象和 dispose 清算，值得参考。它默认用 Content-Length，但允许自定义 Reader/Writer，**所以“我们用 NDJSON”不是充分否决理由**。真正的差异还包括它生成 JSON-RPC 2.0 envelope、`$/cancelRequest`、数值错误码等，而这里有 hello、snapshot、字符串错误码、completeness、严格递增 id、取消发布竞争及固定队列预算。只替换分帧仍需对这些行为做适配。[连接实现][VSC-CONNECTION]、[Reader][VSC-READER]、[消息结构][VSC-MESSAGES]

之前固定的 ECOS Studio `jsonRpcClient` 和 operation tracker 也不是现成的 M4 协议库：前者对接 Content-Length JSON-RPC，后者拥有工作区产品任务。可借鉴 pending 清算、任务终态、拥有者销毁；不要把 Studio 任务账本放进通用 HierClient。[已核查源码与操作实验](DFT-Studio-reference-report.md)

Asio 的 `posix::stream_descriptor` 能对 stdin/stdout/管道执行异步读写，适合替代手动 poll 的机械部分。但取消 I/O 不等于取消 Core 查询，异步写也不自动满足输出预留、EOF 关闭优先级和唯一 worker 所有权。本轮只核查官方 API，未构造等价 session。[Asio 文档][ASIO]

**决定：保留 SessionState/SessionWorker；把 stdio I/O 作为独立可替换模块。** C-63～C-66 中的初始缓存、数字关联、重入 dispose、背压 EOF 说明边界测试不可省，不能推导“引入 RPC 库就全部消失”，也不能推导“已修好就永远不能换”。C 已独立复核并关闭四项，D 不重复编号，也不把 C 的执行记为自己的证据。

### 4.4 TS 客户端生命周期

当前 [client.ts](../../web/packages/client/src/client.ts) 有三个不可委托给普通查询缓存的约束：连接代次/hello/快照守卫；同参请求共用 wire id、调用者各有 Promise 与 AbortSignal；全部订阅者离开后立即清除去重并发送一次 cancel，迟到响应不影响新请求。dispose 还要退订传输、拒绝 pending、清缓存并关闭进程通道。

TanStack Query 的 `Query` 也会合并 fetch、计数 observers，并在最后 observer 离开且消费过 signal 时取消，不能说它“不支持合并或最后订阅者取消”。本轮真实 `query-core@5.104.2` 控制实验得到：两个 observers 只启动一次 query；第一个退订不 abort；最后一个退订 abort 一次。[查询实现][QUERY-SOURCE]

但同一实验把 `{completeness:{status:"partial"}}` 作为成功值返回，Query 正常缓存它；这是库的通用行为，本项目需要额外策略。它的 observer 生命周期也不等于每个 SDK 方法调用者独立结算；连接 hello、wire id、错误归属、先失败后不再发送、原始数字证据不在 Query 的职责内。可配置关闭重试/自动刷新，不应把默认重试行为说成无法改变的限制。

**决定：保留薄 HierClient，不把 TanStack Query 塞进 L5 替换它。** 如果 Studio 的某些产品页面需要服务端状态管理，可在组件上层使用，但不允许形成第二份通用查询缓存或第二个 transport owner。M5 的 selection/tree/source 和 M6 的 graph/layout 各自定义有限状态，禁止把 SDK 的 ready/pending 直接当作全部 UI 状态。

Node 边界还包括 [NdjsonReader](../../web/packages/client/src/node/ndjson.ts)、[FrameInbox](../../web/packages/client/src/node/frame-inbox.ts) 和进程 [ChildTransport](../../web/packages/client/src/node/index.ts)。这些不是缓存库能替代的能力；其中字符串/数字扫描应保持集中，不能在每个方法再写一张字段规则表。

### 4.5 TS 缓存

`ReplyCache` 的语义非常窄：最多 256 项/8 MiB，按 key 加完整 Reply 的 UTF-8 JSON 大小计费；只有 ports/params/bindings 的 complete 回复能进入，资格由生成 metadata 和 HierClient 决定。缓存对象只负责 LRU。[当前实现](../../web/packages/client/src/reply-cache.ts)

`lru-cache@11.5.3` 支持 `max`、`maxSize`、`sizeCalculation`，能直接承接容量管理。研究适配层增加“任一限额为 0 禁用”和“超大值不替换已有项”的 guard；4 个容量配置下，48 步插入、访问、更新、超限和清空操作与当前实现一致。不是 48 个独立协议用例，也没有用它的 `fetch` 模式替代 SDK 请求合并。[文档][LRU]、[源码][LRU-SOURCE]

同一 esbuild 浏览器 ESM 导出实验：当前 ReplyCache 压缩后 731 B、gzip 330 B；LRUCache 为 18,657 B、gzip 5,868 B。候选包没有额外生产依赖，有独立 browser 入口；这些是该版本与打包方式的体积数据，不是性能比较或“库太大”的普遍结论。该版本许可为 BlueOak-1.0.0，不应按旧版本习惯标为 MIT。[包源码][LRU-SOURCE]

**决定：保留这 43 行边界清楚的实现是合理的。** 如果将来引入 TTL、复杂驱逐回调或多策略缓存，再直接采用成熟库；不要在这个类中逐渐重造这些能力。也不要为了提高“采用库”的比例，给当前简单缓存引入另一套请求生命周期。

## 5 M5 M6 组件明确采用表

以下“落点”均为下一阶段拟落点。当前 [viewmodel](../../web/packages/viewmodel/src/index.ts) 和 [views](../../web/packages/views/src/index.ts) 仍是版本骨架，不能把候选库或研究脚本算作已交付 UI。

| 项目 | 分类 | 拟落点与采用内容 | 不交给它的职责 |
|---|---|---|---|
| TanStack Virtual | **直接采用** | `HierarchyTree` 的可见行窗口、测量、滚动；以稳定对象 ID 作 key | 远端树分页、祖先定位、错误/重试、取消、快照、ARIA 树语义 |
| elkjs | **直接采用** | `LayoutService` 中的分层布局、端口约束和边路由，真实 Worker 执行 | 设计连接推导、来源成员、语义去重、超时后 Promise 结算、过期结果发布 |
| react-arborist | **借鉴交互，保留备选** | 键盘导航、焦点与选择分离、树 ARIA；可用于小型完整内存树 | 不直接替代远端 TreeModel；若用于主树，必须证明受控数据投影和状态同步代价合适 |
| Sprotty | **机制参考和正式画布候选** | model/projection/view 分离、command/action、选择、viewport、ELK adapter | 来源所有权、RTL 位段/side、业务撤销、快照；不能因为它支持命令就把图编辑当作设计修改 |
| d3-hwschematic | **借鉴具体实现** | 原网络与显示边反向映射、网络高亮、端口顺序、硬件符号 | 不能把 hyperedge 笛卡尔积当作 RTL 依赖算法；不让它的图对象成为领域事实 |
| HAL | **借鉴具体机制** | SelectionRelay、GraphContext add/remove/batch、viewport 保留、导航到对象 | 不嵌入 Qt GUI，不引入另一套门级数据库，不复制全局选择单例 |
| netlistsvg | **当前交互主画布不采用** | 后续静态 SVG 导出/器件皮肤候选 | 不作为多来源图会话和实时增量交互模型。[入口][NETLISTSVG] |
| X6 | **完整 Studio 图编辑候选** | 需要编辑连线、拖动、撤销时优先评价它的现成插件 | M5 浏览树/M6 只读追踪不因将来编辑需求引入完整编辑器；业务模型仍独立。[实现][X6] |
| DigitalJS | **当前范围不采用** | 若以后做数字电路仿真，可独立评价 | 当前不做仿真或过程块门级化，不借仿真对象替换 RTL 查询事实。[接口][DIGITALJS] |
| libavoid | **当前不新增** | 真正需要交互式避障重布线时作为候选 | 当前 ELK 已承担静态路由，不能同时维护两套路由权威。[项目][ADAPTAGRAMS] |

固定版本的许可记录：TanStack Virtual、react-arborist、HAL、netlistsvg、X6 为 MIT；elkjs 和 Sprotty 提供 EPL-2.0 及各自声明的次级许可路径。**C-69 修订：d3-hwschematic 同一 ref 提交的 package.json 写 EPL-1.0，根 LICENSE 写 EPL-2.0，不能列成单一已确定许可。** 续研下载并校验了 npm 0.1.6 的 integrity，发布包也存在同样冲突，且其 gitHead 与 ref HEAD 不同。实际引入或摘取前还需确认对应产物和文件的许可、归属；此处不自行选择其中一项，不推断 Studio 整体分发许可，当前产品也未引入该依赖。[产物证据](M4-M6-reuse-followup.md)

### 5.1 树的证据与自研边界

react-arborist 的受控 `data`、`childrenAccessor`、`onToggle`、`selection` 与禁用拖拽/重命名选项足以支持外接加载逻辑。空的 `children: []` 也能把未加载分支表示成可展开内部节点。因此 DESIGN §6.4 的理由需要写得更准确，**它不是技术上不能懒加载**。[props][ARB-PROPS]

实际运行未经修改的 `createRoot`、`createList`、`NodeApi`，使用受控 TreeApi 形状对象：初始分支只访问 1 个数据节点；装入 10,000 个子项后，即便分支折叠、只显示 1 行，createRoot 仍访问 10,001 个节点；追加一项后访问 10,002 个。它的真实 `TreeApi.update` 会调用该路径。探针没有渲染 React Tree，也没有测帧率。[建树][ARB-ROOT]、[更新][ARB-API]、[可见列表][ARB-LIST]

TanStack Virtual 的真实 Virtualizer 在合成的 500 px viewport、行高 20、100,001 项、overscan=2 下返回 27 个虚拟项。它接收的是已经确定的行数和 key，既不抓取远端数据，也不自动实现树可访问性。[Virtual 文档][VIRTUAL]

**保留 TreeModel 的理由是远端语义和一次权威状态。** 模型需要持有展开请求、分页 cursor、partial/failed/retry、定位祖先、失效代次和查询取消；Virtual 只消费它的可见行。自研树也可能在更新时全量遍历，不能以“采用 Virtual”保证首屏/展开成本。B 应测增量操作和真实 DOM 数，而不是只数 SDK 返回多少行。

如果 Arborist 的可访问性交互能显著减少自写工作，允许以有限已加载投影替换行组件，但要明确内部 open/selection 与共享模型谁是权威。不能同时让 Arborist 和 TreeModel 各存一份互相覆盖的选择、展开与查询状态。

### 5.2 布局和画布的证据

本轮用实际 `elkjs@0.12.0` bundled 布局计算了三个节点、显式端口以及两条端点相同但事实 ID 不同的平行边。三个边 ID 均保留且产生路由，固定端口顺序有对应几何位置。**不应自写分层布局或正交路由算法。**

实验还发现两点需要落实到适配层：无 Worker 的 bundled 路径会修改传入图对象；这一路径调用 `terminateWorker()` 抛出 `this.worker.terminate is not a function`。这是所测 bundled fallback 的行为，不是浏览器 Worker 缺陷。旧宿主使用 bundled/main-thread 也不能满足新 DESIGN 的 Worker 要求。前次固定 ref 的受控 Worker 实验已经证明“两个布局 Promise 各自 resolve”不等于只发布最新图；本轮未重跑那项。[ELK API][ELK-API]、[历史实验](M5-M6-client-research.md)

正确落点是：GraphSession 产出独立布局投影；LayoutService 拥有 Worker 和任务状态；返回时核对会话、图修订、任务身份，再把坐标映射回该修订的展示对象。超时/销毁必须明确结算调用方，不能只 terminate 后留下 pending。布局失败仍保留可查询语义图和重试入口。

**D-REUSE-04 新证据：** 已在 Chrome 154 原生 Worker 中运行 elkjs 0.12.0。成功布局保留三条事实边，冻结输入未变；浏览器的 terminate 调用成功、五个 Worker 均收到关闭事件，但原库待处理 Promise 和 resolver 仍保留。受控消息门在真实 Worker 内规定先后顺序，旧任务晚到时应用 generation 检查只发布新图；应用主动结算取消后可新建 Worker 重试。这些支持“复用 ELK 加薄生命周期适配”，仍不等于 D-03、计算中途硬取消、打包后 Worker URL 或图画布交互验收。[探针与结果](M4-M6-reuse-followup.md)

Sprotty 已经提供 `SGraph/SNode/SPort/SEdge`、选择 command、展开 action、viewport 以及独立 ELK 投影，不是只能借鉴的概念示意。它允许自定义模型和视图，因此“不能表示 origin/位段”也不是恰当否决理由。成本是与 L6 共享语义状态的桥接，以及 Inversify/Snabbdom 与 React 宿主的整合；是否值得，应对照现成能力和需新增的代码量。[图模型][SPROTTY-GRAPH]、[选择][SPROTTY-SELECT]、[ELK adapter][SPROTTY-ELK]、[依赖][SPROTTY-PACKAGE]

**本轮保留 React/SVG 浏览型路线，不把 Sprotty 永久排除。** 若 M6 实际需要大量通用移动/编辑/连接手柄、命令历史和 viewport 工具，应在写这些通用设施前选 Sprotty 或 X6 的有限集成；不能仅因项目已有 React 就继续扩张自研画布。当前未完成浏览器画布对照，不能声称自写方案的成本或性能已经胜出。

d3-hwschematic 的 `hyperEdgesToEdges` 会把两源两目标变成四条显示边，并用 `hwMeta.parent` 回到原网络；一对一分支还会原地修改输入。前次已运行的这个实验仍是本次采用反向映射、拒绝把显示图当设计事实的依据。可给图元附加来源 metadata，输入格式不是不可克服障碍；主要代价在网络分组/ID、D3 状态、图片段替换和 React 生命周期之间的适配。[投影][D3-PREPARE]、[交互][D3-VIEW]

### 5.3 HAL 与 D 03 的落点

HAL 的 GraphContext 有成员增删、批量变更和布局更新；SelectionRelay 把门、模块、网络选择与引脚 subfocus 交给属性和导航组件。这些是值得落实的产品机制，不等于把全局单例搬进多快照应用。[图上下文][HAL-CONTEXT]、[选择][HAL-SELECTION]

现有 D-03 仍是独立于图形库的契约缺口：A 来源从 `{x,y}` 更新为 `{x,z}`，B 来源和用户追踪仍需要 x，必须能只撤回 A 不再拥有的 y；来源移除后的迟到结果不能重新添加图元。选择 Sprotty、D3、SVG 或 ELK 都不会自动规定这套业务成员关系。

A 在 M6 对应单元前需明确来源实例身份、replace/remove/dispose、共享对象成员和修订号；B 冻结交错场景，C 审发布顺序，再由 D 复核 D-03。此项不阻塞 M4，也不要求在旧工程或 Studio 再实现一份图会话。

## 6 给 A B C 的具体交接

| 单元 | A 的实现或计划动作 | B 的独立验证重点 | C 的审查重点 |
|---|---|---|---|
| C++ Schema 替代候选 | 分开 validator、方法表、默认值；固定 jsoncons 版本和 wire 表示，提供可切换候选 | 原 569 结构、登记/默认、原始数字/Unicode/重复键、真实 Core/SDK，保留全部冻结 oracle | 接受集合、数字/日期适配、离线 Schema 来源、初始化/内存、依赖许可与私有接口变化 |
| decoder 保留 | 把 SAX 实验及实际不适配项回写 M4 计划；保持扫描集中 | 精确偏移、UTF-8 优先级、128/129、合法指数和小数整数、未知字段 | 不因库默认行为改协议；不制造第二份字段约束或 parser fork |
| Session/HierClient | 保持受审状态机边界；I/O 替换另成单元 | 当前 C 反例、取消最后订阅者/迟到/重入/EOF/背压及失败资源回收 | 通用机制与协议语义分离，不因本报告跳过尚未完成的 M4 门禁 |
| M5 树 | Virtual 作为正式依赖，TreeModel 管远端状态；修正 Arborist 排除理由 | collapse 中回包、分页失败/重试、reveal 多祖先、切快照、键盘/焦点/ARIA、真实 DOM 数 | 只有一份选择/展开权威；旧源文件访问保持快照和受限文件身份 |
| M6 图 | 直接采用 ELK；先补 D-03，再实现图投影、Worker 与展示 | 来源替换交错、同端点不同事实、位段/side、折叠反向映射、超时/销毁/旧布局晚到 | 事实、成员、布局坐标分层；Worker 产物与跨包加载；通用编辑能力出现时重新评价框架 |
| 包与两个仓库 | 将 SDK、模型、视图、样式和 Worker 作为同一套通用产物交付；demo 固定布局即可 | 独立消费者安装包、公开导出、浏览器/Node 隔离、Worker URL | demo 与 Studio 不复制 transport/cache/selection/graph，实现业务层隔离 |

本轮没有新增产品缺陷编号，不借选型建议扩大 D 的审批职责。A 对保留项应写具体理由，对替换候选应给具体实现和证据。

## 7 实际验证与复跑材料

| 实际执行 | 结果 | 能证明的范围 |
|---|---|---|
| 固定源码 `clang++ -std=c++20 -O0` 编译 `json-reader.cpp + DecodeFrame.cpp + SchemaPrimitives.cpp`；执行 27 个字节输入 | 编译/执行退出 0；差异完整记录 | 成熟 parser API 与现有 decoder 的有限接受集合、数字保留；不是生产迁移验收 |
| `jsoncons-schema.cpp + SchemaPrimitives.cpp`，固定 jsoncons include；以当前 Schema 和原 B corpus 执行 | 编译/执行退出 0；569/569 结构一致；8 个数字适配后符合预期；dependentRequired 正反例成立 | 历史结构实验和八个整数约束；C-67 已否定据此推导原桥接完整可行 |
| 原 `test_schema_contract.py` 在临时隔离 Python 环境执行 | 退出 0，输入/期望未改 | 取得 B 原输入；系统 Python 初次因缺 jsonschema 退出 1，安装仓库锁定工具后成功 |
| `node reuse-probes/client-ui.mjs <研究目录> <仓库>` | 最终退出 0；4 缓存场景/48 步、Query observers、Arborist、Virtual、真实 ELK 布局 | 库机制和适配成本；没有浏览器组件性能、ARIA 或 Worker 验收 |
| 首次 JS 探针的 bundled ELK 清理 | 退出 1，真实 TypeError 保留；最终脚本将该异常记录为观察值 | 不能把 bundled fallback 当作 Worker；最终退出 0 不表示该清理调用成功 |
| 文档/JSON/探针检查与只读复核 | 见机器证据末尾 verification | 不替代完整产品构建或 CI |

源码探针：[JSON/SAX](reuse-probes/json-reader.cpp)、[jsoncons](reuse-probes/jsoncons-schema.cpp)、[客户端和 UI 库](reuse-probes/client-ui.mjs)。[机器证据](m4-m6-reuse-evidence.json) 中保存了字节输入、逐条输出、B corpus 哈希、固定下载 URL、npm integrity、编译命令、版本和源码 SHA；可在同一研究目录按原命令复跑，也可按固定版本重新准备依赖。

重点源码版本：RapidJSON `24b5e7a8…`，nlohmann `40a62947…`，jsoncons `8f5b66b9…`，vscode-jsonrpc `d91883de…`，TanStack Query `1836f792…`，TanStack Virtual `f211d3a6…`，lru-cache `7e71a1f3…`。本轮实际 npm 包为 `lru-cache 11.5.3`、`query-core 5.104.2`、`virtual-core 3.19.2`、`elkjs 0.12.0`；源码 HEAD 与发布包身份分别记录，不混为同一产物。ref 项目的完整 SHA 见机器证据，其中已在前次研究使用的 UI 源码版本保持一致。

[HAL-CMAKE]: https://github.com/emsec/hal/blob/acc899e297ed3866ad7da432ab0403c3d8d62d1c/CMakeLists.txt#L69
[HAL-JSON]: https://github.com/emsec/hal/blob/acc899e297ed3866ad7da432ab0403c3d8d62d1c/src/netlist/persistent/grouping_serializer.cpp#L84
[HAL-WRITER]: https://github.com/emsec/hal/blob/acc899e297ed3866ad7da432ab0403c3d8d62d1c/src/utilities/json_write_document.cpp
[HAL-CONTEXT]: https://github.com/emsec/hal/blob/acc899e297ed3866ad7da432ab0403c3d8d62d1c/plugins/gui/src/graph_widget/contexts/graph_context.cpp#L75
[HAL-SELECTION]: https://github.com/emsec/hal/blob/acc899e297ed3866ad7da432ab0403c3d8d62d1c/plugins/gui/src/selection_relay/selection_relay.cpp#L95
[RAPID-SAX]: https://rapidjson.org/md_doc_sax.html
[RAPID-READER]: https://github.com/Tencent/rapidjson/blob/24b5e7a8b27f42fa16b96fc70aade9106cf7102f/include/rapidjson/reader.h#L1469
[RAPID-SCHEMA]: https://github.com/Tencent/rapidjson/blob/24b5e7a8b27f42fa16b96fc70aade9106cf7102f/doc/schema.md
[NLOHMANN-SAX]: https://nlohmann.github.io/json/api/basic_json/sax_parse/
[NLOHMANN-PARSER]: https://github.com/nlohmann/json/blob/40a62947d3e23f46cbc863afdcc6f5c933d5ed10/include/nlohmann/detail/input/parser.hpp#L293
[NLOHMANN-SCHEMA]: https://github.com/pboettch/json-schema-validator/blob/0a5c207a8a02dae8c781a205b7746395fbee1f56/README.md
[JSONCONS-SCHEMA]: https://github.com/danielaparker/jsoncons/blob/8f5b66b9e500dc3efc78652917b7b8f7fbc96705/doc/ref/jsonschema/jsonschema.md
[JSONCONS-LICENSE]: https://github.com/danielaparker/jsoncons/blob/8f5b66b9e500dc3efc78652917b7b8f7fbc96705/LICENSE
[JSONCONS-PATTERN]: https://github.com/danielaparker/jsoncons/blob/8f5b66b9e500dc3efc78652917b7b8f7fbc96705/include/jsoncons_ext/jsonschema/draft202012/schema_validator_factory_202012.hpp#L362
[BLAZE]: https://github.com/sourcemeta/blaze/tree/d63a3645b1a1c01960f60a32163fd0a106d6c1ad
[BLAZE-LICENSE]: https://github.com/sourcemeta/blaze/blob/d63a3645b1a1c01960f60a32163fd0a106d6c1ad/LICENSE
[VSC-CONNECTION]: https://github.com/microsoft/vscode-languageserver-node/blob/d91883defb99bdbbc2419450f6eba334b981dfb0/jsonrpc/src/common/connection.ts
[VSC-READER]: https://github.com/microsoft/vscode-languageserver-node/blob/d91883defb99bdbbc2419450f6eba334b981dfb0/jsonrpc/src/common/messageReader.ts#L210
[VSC-MESSAGES]: https://github.com/microsoft/vscode-languageserver-node/blob/d91883defb99bdbbc2419450f6eba334b981dfb0/jsonrpc/src/common/messages.ts
[ASIO]: https://think-async.com/Asio/asio-1.36.0/doc/asio/overview/posix/stream_descriptor.html
[QUERY-SOURCE]: https://github.com/TanStack/query/blob/1836f7924c3750affa925baae1d4096af995a415/packages/query-core/src/query.ts#L630
[LRU]: https://isaacs.github.io/node-lru-cache/
[LRU-SOURCE]: https://github.com/isaacs/node-lru-cache/tree/7e71a1f3babdc68dfbadde91f28eaeea919dad9b
[VIRTUAL]: https://tanstack.com/virtual/latest/docs/introduction
[ARB-PROPS]: https://github.com/jameskerr/react-arborist/blob/d74c4ec696ba98c1a4e981075f6d60cdff3e290b/modules/react-arborist/src/types/tree-props.ts
[ARB-ROOT]: https://github.com/jameskerr/react-arborist/blob/d74c4ec696ba98c1a4e981075f6d60cdff3e290b/modules/react-arborist/src/data/create-root.ts
[ARB-API]: https://github.com/jameskerr/react-arborist/blob/d74c4ec696ba98c1a4e981075f6d60cdff3e290b/modules/react-arborist/src/interfaces/tree-api.ts#L60
[ARB-LIST]: https://github.com/jameskerr/react-arborist/blob/d74c4ec696ba98c1a4e981075f6d60cdff3e290b/modules/react-arborist/src/data/create-list.ts
[SPROTTY-GRAPH]: https://github.com/eclipse-sprotty/sprotty/blob/21b80fc2c852411261a692c834d2a4390ba7f2df/packages/sprotty/src/graph/sgraph.ts
[SPROTTY-SELECT]: https://github.com/eclipse-sprotty/sprotty/blob/21b80fc2c852411261a692c834d2a4390ba7f2df/packages/sprotty/src/features/select/select.ts#L43
[SPROTTY-ELK]: https://github.com/eclipse-sprotty/sprotty/blob/21b80fc2c852411261a692c834d2a4390ba7f2df/packages/sprotty-elk/src/elk-layout.ts#L56
[SPROTTY-PACKAGE]: https://github.com/eclipse-sprotty/sprotty/blob/21b80fc2c852411261a692c834d2a4390ba7f2df/packages/sprotty/package.json
[D3-PREPARE]: https://github.com/Nic30/d3-hwschematic/blob/0664665d87d7fe8575a812714b765a81de1affbf/src/dataPrepare.js
[D3-VIEW]: https://github.com/Nic30/d3-hwschematic/blob/0664665d87d7fe8575a812714b765a81de1affbf/src/d3-hwschematic.js#L235
[ELK-API]: https://github.com/kieler/elkjs/blob/722f1a3f63016e64f534a8b445283d4d31a88d0e/src/js/elk-api.js
[NETLISTSVG]: https://github.com/nturley/netlistsvg/blob/d3518f1b5c996a876b72a1a984bb39d3572c47dc/package.json
[X6]: https://github.com/antvis/X6/tree/b14ca27540693c610257e7687c663f122deb0006/src/plugin
[DIGITALJS]: https://github.com/tilk/digitaljs/blob/a77a6b3a916996e215e6c33c75ffe05dc6f55e3d/README.md
[ADAPTAGRAMS]: https://github.com/mjwybrow/adaptagrams/tree/840ebcff20dbba36ad03a2160edf7cbaf9859984/cola/libavoid
