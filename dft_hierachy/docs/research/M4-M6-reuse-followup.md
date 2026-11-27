# M4/M6 复用续研：完整解析链、类型边界与真实 Worker

2026-10-13，Agent D，D-REUSE-04。承接 [复用总报告](M4-M6-reuse-review.md)，回应 REVIEW_LOG 的 C-67～69 和 B 的 raw/Unicode 复验。本文是研究证据与建议，不代替 DESIGN 或 B/C 验收。

**当前建议：保留生产 decoder/Schema 实现，暂缓按原桥接切换 jsoncons；继续把结构 validator 作为可独立替换的候选。M6 采用 ELK 原生 Worker，并由应用负责取消结算和过期结果处理。** 新证据支持具体边界，不支持“所有通用库都不适合”，也不支持“已有几组绿测就能替换”。

本轮没有改 Core、SDK、Schema、DESIGN、生产依赖、旧工程或 ref；修订本人报告，新增研究探针和 [机器证据](m4-m6-followup-evidence.json)，追加 REVIEW_LOG。C-67～69 交 C 复核关闭；D-03 的来源 replace/remove/dispose 仍待 M6 对应单元。

## 固定对象和证据范围

主树 `m3` / `930ea58d65ef39824b2798b9d4db00f96040fc4c`；本轮使用 D 原有只读 `4a53ebb4610cc5bbb9fb2787e05a99027e1a8d2d` archive 编译小探针，并核对相关生产源码与主树相同，运行时仍同 `a7d1501`。DESIGN SHA-256 `bbd8ff1b66e20dd8014de5b4fedc2a7a09686ec7c62a0fe41e8dae5b39d43e67`，Schema `30a9ca285b813202b5a9867485a6d301cbd450b31098c582542c3a11c89a1420`。独立产物目录 `/tmp/hier-d-reuse04-iw8tu49i`。

上游仍固定 jsoncons `8f5b66b9e500dc3efc78652917b7b8f7fbc96705`、RapidJSON `24b5e7a8b27f42fa16b96fc70aade9106cf7102f`、nlohmann `40a62947d3e23f46cbc863afdcc6f5c933d5ed10`。ELK 实际执行的是 npm `elkjs@0.12.0`，并非把 ref HEAD 当发布包。Clang 17、Node 24.21.0；浏览器为隔离临时 profile 的 Chrome `154.0.8037.98`，驱动 `playwright-core@1.64.0`，安装脚本禁用，无主工程依赖变化。

历史报告和原探针已归档，旧 [机器证据](m4-m6-reuse-evidence.json) SHA `3b10f33f93c71b738eee5cec88e67fb9368898bfd09f511a4891fe4b11c6e3ca` 保持原样。C/B 的执行仍属于他们；下表是 D 此次自己重新编译、执行的观察。

## C-67：完整路径揭示什么，能怎样替换

原桥接的错误成立：`lossless_number(true)` 将部分数字保存为带 `bigdec` 标签的字符串；原 validator 的字符串类型分支排除了 `bigint`，却没有排除 `bigdec`。所以“数学上不是安全整数就保留无损值”仍可能让原始数字通过 `InstGetParams.inst`。这是原型的确定缺陷，不是生产回归。[固定类型分支](https://github.com/danielaparker/jsoncons/blob/8f5b66b9e500dc3efc78652917b7b8f7fbc96705/include/jsoncons_ext/jsonschema/common/keyword_validator.hpp#L2439)

本轮在执行前固定了 655 项输入：原 B 569 项结构输入，加 49 项 raw 数字/字符串/未知扩展组合、24 项 Unicode 键/值/已知字段、13 项有限字节边界。49 项包括 16 个原始数字分别进入整数定义、字符串字段、未知扩展，以及真正字符串 `"1.25"` 对照；未知小数/大指数没有被全局禁止。

每个结构定义的输入放入有限载体 `{"value": <原始输入>}`。这样标量/数组定义也可以通过生产对象 decoder，以同一串原始字节分别走完下列路径。**这是 decoder → owning tree → definition validator 的接受集合比较，不是完整请求 envelope/会话/Core/SDK 链，也不证明输出树及错误信息完全等价。**

| 路径 | 原结构 569 | raw 49 | Unicode 24 | 有限字节 13 | 合计一致 / 655 |
|---|---:|---:|---:|---:|---:|
| 当前 decoder → 当前 generated validator | 569 | 49 | 24 | 13 | **655** |
| jsoncons 默认 DOM → 原 validator | 569 | 43 | 16 | 10 | **638** |
| jsoncons lossless → 原精确整数桥接递归应用 → 原 validator | 569 | 42 | 16 | 10 | **637** |
| 当前严格 decoder → 原精确桥接 → 原 jsoncons validator | 569 | 42 | 24 | 13 | **648** |
| 当前严格 decoder → 同一桥接 → 临时修补的 jsoncons validator | 569 | 49 | 24 | 13 | **655** |

“一致”同时包含正确接受和正确拒绝。研究程序退出 0 表示已输出观察结果，不把上表带差异的候选判作通过。原 569/569 和 8/8 历史实验仍真实；现在明确撤回由它们推导完整桥接可行的结论。

### 临时修补的作用与限制

只在临时 include overlay 中，把字符串类型分支增加 `tag() != semantic_tag::bigdec`，不改下载源、ref 或产品，不改权威 Schema，不维护第二张字段表。这一改变消除了严格 decoder 路径下的七个误接受；新增输入也继续接受未知扩展中的合法小数、极大指数及转义 NUL。源码、替换前后文本、头文件哈希、逐条输入输出在机器证据中。[完整链探针](reuse-probes/json-pipeline.cpp)

**这不是建议立即维护一个 jsoncons fork。** 它隔离出类型分支这个具体原因；`is_string()` 对标签值的存储表示仍然如此，修补改变的是 Schema 判型，不能声称已经发明了一个通用精确 JSON 数值类型。当前 Schema 的五处显式数值类型均为有界安全整数；未来若加入任意 number、非安全整数或更多数值组合约束，必须重新验证。原始数字 token 的私有观察要求、过渡双树的内存、错误定位、初始化/编译成本仍未解决。

同时，补类型分支并不能修好默认浮点舍入、Unicode 或重复键。例如修补后直接 lossless 解析仍有 11 项差异；这也是 parser 与结构 validator 必须分开选的实证。

### 公开扩展点是否能免去维护分支

已检查固定版本的 `make_json_schema`、`evaluation_options`、type validator 及工厂。公开参数提供 Schema resolver、检索 URI、dialect、format assertion 等；没有找到可直接替换 `type` 判断的文档化回调。type validator 的实际校验为 private/final。`Json` 模板还要求一整套 JSON 操作接口；官方列出的支持类型是 json/ojson/pmr，不能把 `json_type_traits` 转换直接当成现有 variant 的 validator 插件。[公开创建接口](https://github.com/danielaparker/jsoncons/blob/8f5b66b9e500dc3efc78652917b7b8f7fbc96705/doc/ref/jsonschema/make_json_schema.md)、[选项实现](https://github.com/danielaparker/jsoncons/blob/8f5b66b9e500dc3efc78652917b7b8f7fbc96705/include/jsoncons_ext/jsonschema/evaluation_options.hpp)

可行路线与代价应这样交 A：

| 路线 | 这次证据 | 建议 |
|---|---|---|
| 直接使用默认 DOM 或原 lossless 桥接 | 已有确定误接受 | 暂不采用 |
| 保留严格词法层，复用已修正类型行为的结构 validator | 临时修补下 655 项对齐 | 保留候选；需要可维护的上游版本/补丁方案、唯一 owned 表示和原门禁，不直接切换 |
| 定制一套 Json 兼容包装、改内部工厂或改写 Schema 类型约束 | 本轮仅检查扩展点，未实现、未证明成本更低 | 不以“只加 adapter”估算为小改动；不能重复手写字段约束 |
| 当前受限 Schema 生成器 | 此集合 655 项一致 | 当前保留，继续限制支持关键词/参数形态；不宣称通用 2020-12 实现 |

## B 的 Unicode 线索：为什么事后检查不够

本轮复现：`\uDC00` 位于未知键/值时，jsoncons 会接受；观察到的 decoded 字符串为空。`\uD800\u0041`、`\uD800\uD800` 会合成另一个码点；后者变成 U+10000，对应 UTF-8 `f0 90 80 80`，已经是合法标量，因此 decoded 字符串合法性检查不能还原原始错误。它们在已知非空字符串位置也可能通过。

固定源码在处理第二个四位转义后使用掩码组合，却未先确认其为低代理；孤立低代理的转换结果也未由这一分支完整传播为错误。观察与源码吻合。保持原始字节的合法性判断必须发生在信息丢失前；不能用替换、丢弃字符或只检查已知字段来对齐。[固定解析分支](https://github.com/danielaparker/jsoncons/blob/8f5b66b9e500dc3efc78652917b7b8f7fbc96705/include/jsoncons/json_parser.hpp#L2184)

这加固了“先保留现有严格 decoder、单独考察结构后端”的路线，不构成增加一套永久自写 Unicode 扫描器的建议。仍需考虑重复键、深度、全帧 UTF-8 优先级、原始数字和有限 span；当前 655 项不是 fuzz 或全平台验收。

## C-68：有限字节 span 与原始 NUL

重新编译未改的原 JSON/SAX 探针，27 项结果逐项与原证据一致；追加 C 的三反例和两对照后，RapidJSON 与生产接受集合为 27/32 一致。`{}<NUL>`、`{}<NUL>{"x":7}`、`{} <NUL>x` 在 RapidJSON、nlohmann DOM/SAX 中均被当作已结束前缀；生产明确拒绝。普通对象和字符串内合法 `\u0000` 全部接受。

新 [有限 span 探针](reuse-probes/finite-reader.cpp) 保留原 handler 策略，增加 `MemoryStream.Tell()==frame.size()`；这三个原始 NUL 反例全部拒绝，合法转义 NUL 仍接受，32 项变为 **30/32 一致**。剩下 `0e99999`/`1e99999` 是原有数字范围差异，不能写成 decoder 替换已完成。探针同时记录额外 `find('\0')` 防线，没有截断或清洗输入。[固定 Reader](https://github.com/Tencent/rapidjson/blob/24b5e7a8b27f42fa16b96fc70aade9106cf7102f/include/rapidjson/reader.h)

实际适配应先保留全帧 UTF-8 优先级，再做语法及完整消费检查。例如 NUL 之后另有非法 UTF-8，不能为了提前拒绝 NUL 而改变受审错误类型/偏移。此次仅验证这项接受集合修正；nlohmann 的严格模式加原始 NUL 检查、所有精确偏移以及大指数支持均未落成完整候选。

## C-69：发布包也没有消除许可冲突

| 实际核对对象 | package.json / registry | 根 LICENSE | 身份 |
|---|---|---|---|
| 只读 ref 的同一提交 | EPL-1.0 | EPL-2.0 | `0664665d87d7fe8575a812714b765a81de1affbf` |
| 下载并验证 integrity 的 npm 0.1.6 | EPL-1.0 | EPL-2.0 | registry gitHead `4bc4e8077c33db6afe577b0ff225fa35f110ea39` |

发布压缩包 SHA-256 `c29fb511e9b7085326252ea2fc309e9964e86bdc800de510a4ac5b058bc37302`；registry SHA-512 integrity 校验通过。也检查了包内 `src/dataPrepare.js` 和 `dist/d3-hwschematic.js` 开头，未发现能消除上述冲突的明确文件级声明。发布包与 ref 不是同一源码版本，不能仅凭两处都写 0.1.6 混同。

原报告单列 EPL-1.0 的记录已改正。结论为**声明冲突仍待澄清**，不擅自选定其中一项。实际嵌入/摘取前明确使用产物与文件、许可和归属；目前没有产品依赖切换或分发，不把此事描述为已有违规。[固定 package.json](https://github.com/Nic30/d3-hwschematic/blob/0664665d87d7fe8575a812714b765a81de1affbf/package.json)、[固定 LICENSE](https://github.com/Nic30/d3-hwschematic/blob/0664665d87d7fe8575a812714b765a81de1affbf/LICENSE)、[npm 官方产物元数据](https://registry.npmjs.org/d3-hwschematic/0.1.6)

## M6：真实浏览器 Worker 的执行结果

按 browser 技能尝试发现内置浏览器入口，本会话未暴露相应 JavaScript 执行工具，无法启动该入口。因此用独立 `playwright-core` 和现有 Chrome，在随机 loopback 端口、本地合成页面、独立临时 profile 中执行；不控制用户既有页面，不访问项目设计数据。探针通过页面按钮启动，记录真实浏览器的 Worker 创建/关闭事件，无产品源码替换。[可复跑探针](reuse-probes/elk-browser.mjs)

| 实际场景 | 实际观察 | 对采用的含义 |
|---|---|---|
| 原生 Worker 执行 3 节点/3 事实边/显式端口布局 | 所有边 ID、端点、路由保留；两同端点边仍各自存在；冻结输入未变，返回不同对象 | Worker 路径不会像上轮 bundled fallback 那样修改调用方输入；仍应由独立布局投影隔离语义状态 |
| 不存在的目标端口/节点 | layout Promise 拒绝，包含 missing-node 原因 | 保留可诊断错误和重试；不发布失败几何 |
| 已确认挂起的任务后 terminate | 浏览器 Worker 关闭，无 bundled TypeError；原 ELK Promise 仍 pending，resolver 数仍为 1 | terminate 不等于调用方任务结算；需要应用取消路径 |
| 旧任务先提交，新任务先完成，旧任务随后完成 | 真实几何完成顺序为 new、held-old；generation 检查只发布 new | 库的请求关联不等于业务版本检查 |
| 应用显式结算取消，再终止 Worker | 外层任务 cancelled，应用 pending 集合为 0 | 支持薄生命周期适配；没有证明原库内部 Promise 被拒绝或已完成堆回收 |
| 重新建 Worker 并布局 | 新布局成功；共创建 5 个 Worker，关闭事件 5 个，页面剩余 Worker 0 | 销毁与重建路径可行；不是大图吞吐/峰值内存结论 |

取消与乱序场景使用**真实 Worker 内的受控消息门**：加载未修改的 ELK worker 脚本后，先拦住指定任务，发出确认；释放后仍由实际 ELK 计算几何。这样不靠固定 sleep 或图规模争抢时序，但也意味着**没有验证算法计算中途的硬取消延迟**。原始 Promise 的 pending 是有限观察，并结合所测发布包的 terminate 实现确认其没有拒绝/清空 resolver 的操作；不把等待时长当成无限期证明。

首次浏览器运行断言通过但存在一条 HTTP 404 控制台观察；保留原输出。给合成页面添加内嵌 favicon 后重跑：退出 0、断言通过、页面异常和控制台错误均为 0，Worker 仍 5 建立/5 关闭。ELK npm API/worker 文件哈希、浏览器版本和两次执行记录均归档。官方 API 也将布局与 Worker 支持分开说明；本轮以实际产物为准。[ELK 官方说明](https://github.com/kieler/elkjs#usage)、[Playwright Worker 事件定义](https://playwright.dev/docs/api/class-worker)

因此 M6 继续直接采用 ELK 的布局算法及 Worker 能力；项目只承担投影、任务结算、版本发布和错误恢复。**这没有关闭 D-03**：来源撤回、多个来源共享成员、replace/remove/dispose 仍是 GraphSession 语义，ELK 的计算成功不能证明它们正确。

## 给 A/B/C 的下一步

| 对象 | 已经可以据此做什么 | 尚需完成什么 |
|---|---|---|
| A：M4 候选 | 修正“没有库/私有树所以必须自写”的理由；保留生产实现，拆开词法层和结构校验器评价 | 可维护的类型修正来源、原始 token 与唯一拥有表示、日期/离线 Schema/初始化和平台成本；不把本次临时头修补直接进产品 |
| B：候选验证 | 纳入 number × integer/string/unknown、原始 NUL/后缀、未知键/值代理对组合 | 冻结并复验最终候选的同一路径；保持原 offset/UTF-8 优先级及全部 oracle，不以 D 的 655 数字替代独立验收 |
| C：本次回复 | 复核报告是否已撤回过强结论、许可冲突是否完整、临时修补是否仅用于定位 | C-67～69 由 C 决定关闭；生产迁移另按既有流程审查 |
| M5：树与源码 | Virtual、Arborist 的此前源码/Node 对照仍有效；不新增第二套选择/远端状态 | 真实 React/DOM、键盘焦点、ARIA、展开/分页/切快照和源码定位仍未实操；不能把本次 Worker 证据算作树验收 |
| M6：布局与画布 | ELK 的真实 Worker 机制已测，可据此实现薄适配 | 包消费者的 Worker URL/CSP、异常加载、运行中硬取消、大图性能，以及 Sprotty/React 画布交互对照仍需各自单元；先收敛 D-03 |

两仓库分界不变：Hierarchy 仓库提供 SDK、通用模型/视图和 demo；Studio 组合工作区、业务分析、任务和文档能力，复用同一套客户端。当前没有依据为了工作台开发再复制一套 transport/cache/tree/graph。

## 复跑与检查

机器证据保存全部原始字节/预期、655 项逐路径输出、32 项 parser 输出、临时替换文本、实际 argv/退出码、上游身份和 SHA、npm integrity、浏览器结果。三个新增探针分别为 [json-pipeline.cpp](reuse-probes/json-pipeline.cpp)、[finite-reader.cpp](reuse-probes/finite-reader.cpp)、[elk-browser.mjs](reuse-probes/elk-browser.mjs)。从机器证据的 `pipeline.inputs`、`reader.inputs` 导出 JSON 即可作为 C++ 探针参数；使用固定 archive/include 按 `commands` 重跑。临时 overlay 按记录的精确一处替换建立，**不要写进 ref**。

本轮只编译 decoder、SchemaPrimitives、generated validator 和小探针，无全 Core/Slang 或 Linux source_sort；没有运行生产集成、完整构建、远端 CI、sanitizer 或性能门禁。这些对研究文档不作为完成条件，但对真正迁移仍需 A/B/C 完成。格式、语法、链接、机器证据一致性和只读复核结果记在证据末尾与 REVIEW_LOG。
