# 验证与交付证据

命令从仓库根目录执行，另有注明除外。实际 CMake 登记和 package.json 是可执行入口；本文不把尚未实现的测试列作通过。

源码片段物理换行修复（C-S2-10-01）登记`a_sequential_source_excerpt_newlines`，通过真实CLI核CR/LF/CRLF/混合、半开窗口、上下文、共享和预算。
B55最终原件（78a7877a，含0764b8bf最小换行回归与4279afb9适配）原样导入，登记`b55_source_evidence_contract/cli/newlines`；A执行不等于B重新验收。
启用分析层后可用`ctest --test-dir <build> --output-on-failure -R '^(a_sequential_source_evidence_excerpts_.*|a_sequential_source_excerpt_newlines|b55_source_evidence_.*)$'`定向运行6项；上下游范围、定位及C08另按受影响范围运行。完整范围与实际结果见本轮证据，不将定向通过称为全Core门禁。

## 环境

- CMake ≥3.28、C++20 编译器、Python 3；Slang/Catch2 使用 CMake 已固定版本。
- Node 使用 `web/.nvmrc` 指定的 24 或 engines 允许版本。检查 `node --version`，不修改 engines 来迁就 Node 21/23。
- 不复用其他工作树的产品二进制；可以复用已校验的第三方源码目录。记录编译配置、测试/输入 SHA 和实现 head。
- 依赖安装只在缺失/锁文件变化时进行；仓库现有 check.sh 会调用 npm install，执行后检查 package-lock 是否产生意外改动。

## 现有命令

```sh
# 差异与空白；不能单独作为语义/格式化全部通过的证据
git diff --check

# Core 默认完整构建和测试
cmake -S core -B core/build -DCMAKE_BUILD_TYPE=RelWithDebInfo -DHIER_SCHEMA_PYTHON=/path/to/schema-venv/bin/python
cmake --build core/build -j 8
ctest --test-dir core/build --output-on-failure

# 前端类型、分层和七个违规探针
npm --prefix web run check

# 三构建（RelWithDebInfo / Debug / ASan+UBSan）加 web check、SDK/Core及M5选择
./check.sh

# 真实设计回归，输入路径由实际环境提供
./check.sh --designs <processor_core.vc> <openc910/design>

# Linux 在可用容器环境运行；GCC13.4/Ubuntu24.04，未执行需单列
./check.sh --linux
```

可按 CTest 名称运行相关单元，再在交付前运行完整集合。所有产品目标的现有 `hier_warnings` 将警告视为错误；故意失败的分层/sanitizer 探针按各自控制用例解释，不能拿预期失败掩盖产品失败。

### M3 明确启用的阶段门禁

B 冻结测试合入后使用；合入前缺目录/目标是未集成，不能声称运行过。

```sh
cmake -S core -B core/build-m3 -DCMAKE_BUILD_TYPE=RelWithDebInfo -DHIER_TEST_M3=ON
cmake --build core/build-m3 -j 8
ctest --test-dir core/build-m3 -R '^b_m3_' --output-on-failure
ctest --test-dir core/build-m3 --output-on-failure
```

Debug、ASan+UBSan 也必须明确启用 HIER_TEST_M3。标准 check.sh 的 M2 绿测不能替代这个门禁；M3 收尾时须让默认门禁包含已交付的 M3 测试。source 实现后 HIER_TEST_M3 默认 ON，check.sh 也显式启用以覆盖旧缓存中的 OFF；独立验收状态仍以 REVIEW_LOG 为准。
私有 observer 用 -DHIER_TEST_OBSERVER=ON 构建，登记 a_m3_observation、b_m3_observer
及 b_m3_source_sort；生产默认 OFF。标准 check.sh 显式设置普通配置 OFF、Debug/ASan ON，
避免首次检出或旧 CMake 缓存漏跑确定性门禁。需要普通优化版 ON 的专项时单独配置/运行，
随后 check.sh 会恢复普通 OFF；先归档 ON 日志/配置，不能混链两种对象。

### 后续协议 / TS 门禁

```sh
# M4+ 阶段：真实服务进程协议测试
cmake -S core -B core/build-protocol -DHIER_TEST_FUTURE=ON
cmake --build core/build-protocol -j 8
ctest --test-dir core/build-protocol -R '^m4_protocol$' --output-on-failure

# web 目录已有独立 client / selection / 版本测试
npm --prefix web run test:independent

# M4生成零差异已纳入web check；A客户端/真实Node边界回归
npm --prefix web run check:generated
npm --prefix web run test:client
# Python需安装protocol/schema/tests/requirements.txt中的jsonschema
HIER_SCHEMA_PYTHON=/path/to/venv/bin/python npm --prefix web run test:schema
```

先用 `ctest --test-dir <build> -N` 核对实际测试名称和数量；零个匹配不能当作通过。
TS 独立集合中的 M4 与 M5 选择均已有运行时，必须完整执行；未来新增未实现能力须单列红基线，不能提供假实现取绿。

## 按变更选择，按里程碑收尾

| 检查项 | 必须执行的场合 | 当前工程的边界 |
|---|---|---|
| 格式、lint、分层 | 所有改动检查 diff；相关代码运行已有检查器 | C++ 尚无仓库级 formatter 配置，web check 只有类型/分层，不能谎称已有 ESLint/全量格式门禁；代码格式沿相邻风格，新增统一工具单独评审 |
| Core 单测、完整构建 | Core/公开模型/构建配置变化及里程碑收尾 | CTest、-Werror、三构建与 sanitizer |
| 前端单测 | client/viewmodel/views 变化及相应阶段收尾 | web test:independent；UI 实现后增加对应真实测试 |
| IPC/前后端集成 | 协议、transport、Electron 边界变化 | M3 是 CLI→Core 集成；M4 为 NDJSON；Electron 宿主集成尚未发生，不能把 CLI 称为 IPC 测试 |
| E2E/冒烟 | 新纵向功能和相关 UI 变更 | M3 用实际 CLI/API fixture；M5/M6 需要实际 UI/交互验收 |
| 旧工程加载/迁移 | 实际改动持久化、配置或宿主加载链时 | 首版 Hierarchy 不提供会话持久化，M3 不改旧工程；本项标明不适用，不能编造旧文件兼容测试 |
| 既有行为回归 | 修改前面里程碑代码时 | 保留 B 冻结 M1/M2 测试；新行为/修复另补回归 |
| 真实设计/资源/Linux | 受影响风险或里程碑门禁要求时 | 单列未运行项、机器/输入/配置；M7 绝对预算仍由用户确定 |

## 独立上层时序检查消费者

此单元按 DESIGN §7.5 位于 analysis/，不改变 M7 的现有默认门禁或独立验收状态。
显式启用后，原 Core CTest 保持，另登记 `a_sequential_cancel`、`a_sequential_cli`、
`a_sequential_layering`、`a_sequential_logic_cancel` 与 `a_sequential_logic_cli`；
layering 项应因无法包含 Slang 头而通过负控制。原 v1 17 项保持，logic 入口另核显式 v2。

```sh
cmake -S core -B core/build-analysis -DHIER_BUILD_ANALYSIS=ON \
  -DHIER_SCHEMA_PYTHON=/path/to/python-with-jsonschema
cmake --build core/build-analysis -j 8
ctest --test-dir core/build-analysis --output-on-failure
```

Debug/ASan 使用原相应构建参数，并显式保留 HIER_BUILD_ANALYSIS=ON；JSON v1 的
离线验证复用原 Core Schema7，A 的手写 RTL 回归不冒充新的 B 冻结。
命令发现违规/partial 的退出政策和编译时间边界见 [analysis/README](../analysis/README.md)。

显式`--logic --clock-usage`的v3另有`a_sequential_usage_cli`与`a_sequential_usage_cancel`，
手写RTL核data/control/async角色、层级/重排/总线位与scope外用途、共享体不同实例、分页、
组合buffer/保守关系不误报、partial保留正证据、预算/退出政策及旧validator拒绝；
原生核预取消/再次调用/过期deadline/旧aggregate调用。原v1/v2集合不变。
v3 Schema离线引用v2/Core，需将三者装入本地registry，不依赖网络取Schema。
局部消费者构建如复用前A自有Core库，必须记录同源/配置/库hash与未重跑范围，
不能把三配置consumer通过算成当前完整Core CTest。

根约束门控v4新增`a_sequential_gates_cli`与`a_sequential_gates_cancel`，核显式根校验、
AND/OR/反相/向量位/跨层映射、常量开关、未知旁路/嵌套/多根不误判、async角色不误告、
用途模式组合、工作量与所有权/预取消/复用。缺失scope现按公开目标不存在政策为exit3/not_found，
原作者相反预期更新并增强错误码断言；B冻结不改，只执行并分清作者执行与B关闭权。

静态输入值v5新增`a_sequential_values_cli`与`a_sequential_values_cancel`：核AND/OR开关、mux
旁路/按需读取、多位/层级平坦映射、固定clock/async、结构用途不剪除、原partial/保守不升级、
上下文匹配预算、非法/重复输入和旧Schema拒绝；库核预取消/不同上下文/clear不留历史、
Core快照及原驱动不变、Report拥有性与旧ClockRoot名字/aggregate调用。约束只作用于本次条件报告。

## M7 产品规模测量

M7 宽端口关联的 A 回归已接入默认三配置 CTest：

```sh
ctest --test-dir core/build -R '^a_m7_(port_|binding_schedule)' --output-on-failure
python3 core/tests/a_m7/test_port_association.py core/build/tests/m7/a_m7_binding_dump
```

`a_m7_port_association` 核 2048 端口的命名/位置/未知模块完整绑定与物理来源、
重复名称最后表达式/首次来源、隐式/通配/默认/空位置；`a_m7_port_sources` 核私有语法关联，
包含已诊断混合列表的最早候选规则，以及7/8/9/32项短宽表和语法切换/清空/旧返回节点寿命。
来源关联直接借用Slang位置列表，只保留最近语法索引；短表直接查找，原生KAT现为83断言。
新测试属于 A 回归，不替代原 B oracle；临时工作集的实际代价见[来源工作集计划](plans/M7-source-working-set.md)。
原生探针可对新旧二进制完整比较所有 L1 向量、过程/来源顺序和 estimatedBytes。
具体前后 SDK 测量、标准入口及历史红项按[执行计划](plans/M7-port-association.md)和交付报告记录，
不把本优化说成全部库/表达式算法线性或整个 M7/D 验收通过。

```sh
# 开发工具回归；已接入 check.sh
npm --prefix web run test:performance-tools

# 当前 checkout 的真实 Core；输出目录必须不存在
HIER_BIN="$PWD/core/build/hier" npm --prefix web run perf -- \
  --output /absolute/new-performance-directory \
  --processor-filelist "$PWD/../nx9000/design/processor_core/processor_core.vc" \
  --openc910-design "$PWD/../openc910/design"
```

默认五次新进程，合成 1万/10万子实例、100/500/2000 图节点；同时记录公开 SDK 查询、
真实树虚拟化、原生 ELK 布局、取消、释放和内存采样。完整参数、测量定义及失败保留规则见
[工具说明](../web/scripts/performance/README.md)，实际数据见 [M7 计划](plans/M7.md)。
M7 数字不是标准测试默认阈值；避免与构建/GUI 测试并跑。Core RSS 仅为 50ms 采样下界，
浏览器 V8 堆不包含 Worker/原生内存；本地取消不代表 Core 已停止工作，进程关闭与协作取消分开。
五个样本的 P95 就是最大值，不作普遍 SLA 或独立验收结论。

M7 Node可选生产资源控制与demo已确认默认值按
[最新执行计划](plans/M7-defaults-and-review-fixes.md)验证：
`npm --prefix web run test:client`自动执行`tests/client/process-resources.test.mjs`，
包含确定性取消截止时间、真实进程强制回收、RSS超限/探测失败及无选项兼容，
并以真实采样进程检查`close`先于公开`exited`，覆盖探测spawn失败。
`HIER_BIN="$PWD/core/build/hier" npm --prefix web run test:demo-graph`自动执行新增
`demo-graph-resource-limits.test.mjs`，核默认值、逐项覆盖/显式off、主进程配置和真实Electron失败/再次打开；
包外消费仍支持`HIER_A_DEMO_DELIVERY`。这些是A回归，不冒称新增B冻结或独立验收。
`test:performance-tools`还执行真实小Core/browser正常对照及SIGTERM/SIGKILL负控制，
异常退出必须保存failed报告并非零退出；需本树已构建Core或显式`HIER_BIN`。

B的M7冻结测试已合入，原S02纯重构pin按B维护并保存在history/pre-m7/，原红流不改写。
标准check.sh执行`npm --prefix web run test:independent:m7`（23资源/配置及公开类型），
及`test:independent:m7:electron`（真实Electron打开/RSS超限、显式重开、off）；
后者每次输出新证据目录，也可显式指定全新空的`HIER_B_M7_EVIDENCE`。
三Core的CTest登记`b_m7_dynamic_writes`：原公共API adapter随本配置编译，原Python oracle不改；
`a_m7_comparison_cache`覆盖开发比较缓存的CLI边界及全量比较不变性。
完整香山比较需按实际单体大小显式配置诊断缓存，例如：

```sh
core/build/hier verify-sharing --comparison-cache-bytes 268435456 \
  -F /absolute/strict-complete-input.f --top XSTop --unknown-modules-are-errors
```

缓存预算按每份Design计算，校验器先将共享侧完整JSON和查询状态写入匿名临时记录，
释放共享Design后才打开逐实例Design；总RSS和临时存储另记，由外部守护观察。
不能用缓存值替代生产进程上限，或抽样跳过全设计比较。
三配置的标准CTest执行`a_m7_sharing_reference`；也可定向运行：

```sh
ctest --test-dir core/build \
  -R 'a_m7_sharing_reference|verify_sharing|m7_comparison_cache' --output-on-failure
```

A累计101断言/8案例保留原57断言/6案例，覆盖真实Design跨1000项分页/递归、完整字段及过程失败、
差异计数与诊断显示上限、已捕获输入变化和临时记录I/O/异常关闭；另核大记录首/中/尾及长度差异、
前段已不同而后段截断仍失败。原B CLI30预期不变。匿名记录需要可写临时空间，
创建/写入/flush/定位/读取失败必须非零且无成功摘要；相同输入摘要不升级inputHashComplete。
记录只在当前进程使用，不是工程格式或持久化缓存；索引/当前大查询/递归和allocator仍占内存，
不承诺硬RSS界限。方案、实际全设计RSS/磁盘采样及旧失败分列见
[工作集计划](plans/M7-sharing-working-set.md)和[证据](evidence/m7-sharing-working-set-2026-10-27.md)。
记录比较现按64KiB块读取，直接比较当前JsonWriter字符串，实例元数据/过程列表不跨子树存活；
当前查询结果/序列化字符串、祖先children页和磁盘记录不受该缓冲大小限制。
本轮实际验证另见[查询工作集计划](plans/M7-comparison-query-working-set.md)。
动态写临时区间由三配置标准CTest执行`a_m7_write_intervals`：5000次固定序列操作与独立
旧逐位参考核对全部依赖顺序/空写/覆盖，累计1888656断言、3案例；另核巨大均匀范围的
条目数、对象隔离、边界及不支持的均匀位映射拒绝。原B动态写752、CLI30和
SharingReference101/8保持。实际旧新L1/CLI双流、RAM与完整香山容量按
[容量计划](plans/M7-comparison-capacity.md)及其证据单列；A自测不替代B/C独立验收。
静态均匀写批量扩展保留上述原3案例，再以4000次固定操作核批量merge/replace的完整
逐位结果、顺序、重复依赖、空尾/覆盖/边界；另核巨大空尾不展开，累计3308566断言/5案例。
原生完整L1旧新对照覆盖过程、net初始化、端口表达式及动态/静态/异步混合，实际命令、
三配置和配对测量见[静态批量计划](plans/M7-static-write-ranges.md)，不作为B新oracle或性能阈值。
线性bitwise扩展保留原3308566/5源码前缀；再以3000固定操作对独立逐位map核源坐标切片、
多源/重复依赖、混合all/bitwise控制、单个位覆盖和区间overlay，累计4952672断言/7案例。
8192位线性run单条目、前中后切分/源平移及重复符号位/回绕不误压缩另验；
原生完整L1/CLI和原规模验证见[线性区间计划](plans/M7-bitwise-write-ranges.md)，仍是A回归。
异步分类由三配置标准CTest执行`a_m7_async_write_types`：4000次固定操作对独立逐位
`(ref,bit,event)`参考核reset/set/unknown/显式空值、空洞/重叠/多事件与对象隔离，
另核2^50均匀位宽的单区间、只读缺失、借用输入及UINT64边界，1732028断言/3案例。
原WriteIntervals4952672/7整文件及SharingReference101/8保持；原生完整L1覆盖异步与正常写
分类边界、重复目标、多个事件和动态lhs退路，不改变原整个operand常量分类语义。
实际新旧111组/CLI40、五形状配对及原容量见[异步分类计划](plans/M7-async-write-ranges.md)，
不替代B独立oracle或将容器条目数外推为整个Core硬资源界限。
表达式投影由三配置标准CTest执行`a_m7_dependency_bits`：1500组区间代数与独立稠密向量
逐位核对切片/截断/零与符号扩展/重复/拼接/有序并集，2000次投影写与旧逐位map核并集/替换。
另核2^50空/线性范围、只读切片所有权、回绕/宽度拒绝、重复依赖的过程去重与替换保留；
1021137断言/4案例。原4952672/7、1732028/3、101/8及native adapter整文件保持。
完整L1核Expr.uses的全结果位exact覆盖与移位/截断丢弃位，不能只比较最终写依赖摘要。
调用链、共同投影规则、原失败与完整验证见[表达式区间计划](plans/M7-expression-ranges.md)，
该阶段保留的静态连接/常量分类向量由下述单元接续；非线性片段等成本仍在，不作硬资源保证或B新oracle。
静态连接由三配置标准CTest执行`a_m7_static_connection_bits`：1200组固定序列以原逐位
连接/归并算法核切片、符号/零填充、重复/自追加、所有字段和最终vector/string容量，
104个常量宽度覆盖SSO/分配边界及X/Z、分片再归并；另核2^50信号范围、借用/所有权与uint64边界。
449861断言/3案例；原四个A模型/共享目标与native adapter整文件保持。
完整L1同时核绑定、内部端口及operand异步分类；常量格式和estimatedBytes均逐字比较，
不将复制符号位合为假线性片段。原CLI/Slang/冷热缓存/完整设计沿原门禁。
实际命令、十形状配对和成本边界见[静态连接计划](plans/M7-static-connections.md)，新A回归不替代B oracle。
有序依赖并集由三配置标准CTest执行`a_m7_dependency_union`：独立原线性算法核全部Dep字段、
已有重复项、首次出现顺序、跨批次追加/重分配、自追加、字符串容量差异及8192路大列表。
10101403断言/3案例；原五个A模型/共享目标和native adapter整文件保持。
局部索引只借用vector对象/保存下标，不改变事实或实际容量；小列表保留线性扫描，hash碰撞无最坏时间保证。
201完整L1双流/CLI40、十三形状三次配对及原规模实际命令见[有序并集计划](plans/M7-dependency-union.md)。
首轮A新RTL分隔符错误与修正后原预期重跑均保留，不改B oracle或将A回归作独立验收。
端点汇总由三配置标准CTest执行`a_m7_endpoint_accumulator`：独立原线性算法对照500组固定序列，
保留emit身份/首次记录、首个相邻匹配、位段/路线/常量和完整序列化结果；32768项核次序/重分配，
六组共享/cache配置各四个实际drivers/loads查询核64端点和取消。50045断言/5案例。
只为查询拥有vector建立局部下标索引，更新结束坐标前erase、更新后insert，移动vector前销毁索引。
原六个A模型/共享目标和native adapter整文件保持；公开新旧221组（含24预期错误）、原L1/CLI、规模与完整门禁
见[端点汇总计划](plans/M7-endpoint-aggregation.md)。不把A模型作B独立oracle或将索引代价当整条查询硬界限。
M7 驱动扫描扩展由各配置的标准 CTest 执行 `a_m7_driver_tracking` 和
`a_m7_driver_overlay_guard`：前者核单/四线程下的完整驱动、初始化、位段、混合端口、
受限网线/变量及 ref/modport 间接驱动；后者核源码和目标布局拒绝。固定原始 Slang 与
覆盖 Slang 的双流逐字节对照及真实 SDK 规模测量另记执行证据，不以时间阈值代替正确性。
`a_m7_binding_schedule` 在三配置中核对嵌套/条件generate、实例数组、primitive、blackbox与
库绑定的过程编号和源码坐标，以及4096生成槽位的完整保留；完整原/新L1事实序列另留差分。
B的CLI30冻结已原样导入，`b_m7_comparison_cache` 直接运行原oracle；薄runner只为其wx输出
建立本配置下的全新目录并透传退出状态，报告路径保留在CTest日志，不覆盖旧报告/放宽预期。
DefaultConfig本机完整比较另用新外围filelist：`-j 1`一行和`-F /absolute/original-complete-input.f`
一行，再向verify-sharing传该新文件。它显式使用Slang已有线程选项，不改原输入/生产默认；
原默认并发8GiB守护失败与单线程通过分别记录，不作同条件性能或硬峰值保证。

## M5 树 UI 有限对照（实验入口）

`web/experiments/m5-tree-ui` 不属于生产 workspaces 或标准 `check.sh`。
它使用同一套真实 SDK/L6 的固定 Transport fixture；运行方式见其 README。
安装独立锁定依赖和 Playwright Chromium 后：

```sh
npm --prefix web/experiments/m5-tree-ui test
npm --prefix web/experiments/m5-tree-ui run format:check
cd web
node node_modules/typescript/bin/tsc -p contracts/tsconfig.tree-view.json
```

分别运行两种渲染器的六个场景，产出实际 DOM/工作计数和截图；这是 A 的研究对照，
不能取代待审 DESIGN §6.7 的 B 冻结、生产组件测试或 Electron/Core UI 集成。
类型消费者使用实验包的 React 类型，仅编译提案，不新增生产依赖。

## 证据要求

### M5 实例属性契约准备

以下为DESIGN §6.9契约准备阶段的隔离声明/SDK见证入口；生产InstancePropertiesModel现已实现，
当前运行时验收使用下文“实例属性标准门禁”。提案阶段使用现有工具链：

```sh
npm --prefix web run typecheck
node web/node_modules/typescript/bin/tsc -p web/contracts/tsconfig.instance-properties.json
node web/contracts/instance-properties/verify-types.mjs
HIER_BIN="$PWD/core/build/hier" node --test web/contracts/instance-properties/sdk-core-witness.test.mjs
```

18项负例逐项去除标记后核真实诊断，编译不含Node/React/Electron类型。
SDK/Core见证只核现有三个查询的能力、参数化实例/空值/重开，不执行拟议模型或取代B冻结。
新声明不进入生产exports或check.sh；运行时接线在对应契约审查和独立输入冻结之后。

### 通用记录要求

- 每个可验证单元记录命令、工作目录、退出码、用例/断言数量、head、配置及剩余缺口。日志不能只存在于易丢失的终端；关键摘要写入计划/REVIEW_LOG，独立报告归 B。
- 失败分别记录编译失败、缺命令/字段、执行到的语义断言失败、环境错误；缺方法不能冒充该方法所有语义断言已执行。
- 预取消不等于执行中取消；输出条数不等于内部物化受限；共享模式结果相同不等于两者都正确。确定性观察点和故障注入先交 C 审，再由 B 维护独立预期。
- 实现、契约文档、B 冻结测试分别标记版本；公共契约变更需相应版本/旧消费者验证，不能只检查 C++/TS 常量相等。
- 最终 diff 只含本轮授权内容。无新增警告、未说明 TODO、放宽旧测试或未经说明的失败，才可称相关单元完成；整阶段还须完成 DESIGN 的全部验收和 B/C 交接。

### M4 Core 接线后的标准门禁

`a_m4_frozen_raw_decoder`是A接线的B冻结65项原始字节重放。fixture保留B 1abdbcf的
name/bytes/expectedAccept及原有code/offset/token，来源SHA记录在fixture；没有候选库依赖。
hex仅用于测试进程传参，生产decodeFrame实际收到包含NUL/非法UTF8的完整有限span。
此项与B原reader/state测试、C++654结构/登记重放及真实协议门禁同时执行，不替代后者。
它是A执行既有B预期的结果；新接线本身仍交B独立复验。

`check.sh`现在明确启用M3与M4，普通配置observer OFF，Debug/ASan observer ON；
Linux脚本也使用相同阶段/observer开关，避免旧缓存遗漏新协议门禁。原HIER_TEST_FUTURE
选项名保留兼容，默认ON；它现在登记实际M4协议测试。私有reader/state/worker目标始终登记。
标准脚本还执行A客户端测试、B已冻结M4文件子集和实际SDK→Node→Core的27方法集成。

```sh
ctest --test-dir core/build -L M4 --output-on-failure
ctest --test-dir core/build-debug -L M4 --output-on-failure
ctest --test-dir core/build-asan -L M4 --output-on-failure
HIER_BIN="$PWD/core/build/hier" npm --prefix web run test:independent:m4
HIER_BIN="$PWD/core/build/hier" npm --prefix web run test:core
python3 protocol/schema/scripts/generate_cpp.py --check
/path/to/python-with-jsonschema protocol/schema/tests/check_cpp_corpus.py
```

M4原子集显式选择client/node-transport/node-boundaries/version/core-contract/review-boundaries/node-private-controls/
id-boundaries/id-real-core九个B文件，含真实Core E2E、27方法/元数据34项KAT及119项原始数字/Unicode/重入边界，
加上C批准的27项私有Node精确容量/stderr控制、13项SDK ID边界及3项真实Core ID边界，原共258项。
ID适配仅在fresh客户端hello前一次性设置nextId为MAX或MAX-1，此后只走公开SDK/Transport；
具体耗尽code/data.reason尚未规范化，测试不从当前实现补写预期。真实取消项验证wire/本地结算/
进程退出，不冒称Core执行中取消。上述两文件也由原独立全集自动发现，缺少HIER_BIN明确失败。
Core新增`b_m4_review_wire_eof`登记24项原始Unicode/背压EOF测试。
树接线前`test:independent`的原集合为258项M4加241项M5选择及6项独立真实Core集成，共505项；
历史缺SelectionModel红基线仍见原归档，不改写为历史通过。B的private测试源码保持原字节，新增CMake接线
和A辅助测试单独归属。Core公共消费者`b_m4_snapshot`是编译门禁，不计运行用例。

共享传输重构后，`test:independent:m4` 和 `test:independent` 均显式追加
`tests/independent-transport-sharing/compatibility.test.mjs` 的 B 原冻结10项；
该阶段分别为 **268项、810项**。后续受审身份增量接入26项后，M4现为294；完整独立集合组成1628见Source节。
check.sh通过原M4入口自动执行身份wrapper，S02已运行7生产类型负例；缺文件或失败仍非零退出。
新集合核公开导出/声明、旧私有路径在无Node全局realm中的唯一接收权、异步FIFO、关闭/退订、
首投递容量及真实SDK握手/roots/dispose；不是实际浏览器、Electron或Core IPC。
S02声明字节相等仅适用于这次纯重构的固定基线，不构成禁止后续兼容API演进的产品契约；
后续契约变化时由B按受审范围维护该基线，A不能自行放宽。原258/800历史结果保持其原范围，
不同入口的重叠集合不累加。详见[接线计划](plans/M5-transport-regression-wiring.md)。

C++当前无仓库统一formatter配置。本轮A使用临时clang-format23.1.3，只格式化新增文件和
实际修改行；Python生成器/管道回归使用现有隔离ruff。M5新增TS使用临时Prettier3.9.10，工具不是生产依赖。

### M5 选择标准门禁

```sh
npm --prefix web run test:independent:m5
HIER_BIN="$PWD/core/build/hier" npm --prefix web run test:independent:m5:core
HIER_BIN="$PWD/core/build/hier" npm --prefix web run test:core
HIER_BIN="$PWD/core/build/hier" npm --prefix web run test:independent
```

`test:independent:m5`先构建实际包，再执行生产导出的严格消费者及33项类型负对照，
以及B读取阶段getter/cause消费者；最后运行旧2项、选择契约159项、读取阶段80项，共241项。
新增A配置只清除B提案路径映射，使原消费者解析实际包，B原冻结测试/类型文件不改。
此命令已接入`check.sh`，保留原M4的258项显式子集。
`test:independent:m5:core`另运行B冻结的真实Core选择集成6项，显式要求本树HIER_BIN，
同样已接入`check.sh`；原M5纯状态入口仍无需Core。选择接线时独立全集为两个目录/505项，树扩展见下节。
`test:core`保留原27方法和快照两项，新增真实Core引用→绑定选择→属性查询、历史、
重新打开后快照隔离和释放模型不关闭SDK的集成，共3项；没有模拟Transport。
这些是无界面的L6/SDK/Core检查，不能替代后续React、Electron、真实设计UI或M5整体验收。

M5-A-02a原提案仍可用`web: node node_modules/typescript/bin/tsc -p contracts/tsconfig.tree.json`
检查历史声明消费者；生产TreeModel已提供独立入口，提案编译不能代替运行时门禁。

### M5 树运行时门禁

```sh
npm --prefix web run test:viewmodel
npm --prefix web run test:independent:m5:tree
HIER_BIN="$PWD/core/build/hier" npm --prefix web run test:independent:m5:tree:core
HIER_BIN="$PWD/core/build/hier" npm --prefix web run test:independent
```

`test:independent:m5:tree`检查实际生产包的B严格消费者/35类型负例及14诊断读取类型负例，
执行152树单元、11公开SDK控制、17诊断快照回归、68诊断读取边界、9任务边界及30函数所有权，共287项。
另外编译diagnostic-callable-production合法输入消费者；这是正类型检查，不增加负例数量。
`test:independent:m5:tree:core`要求本树HIER_BIN，执行7项真实Tree/SDK/Node/Core消费者及1项手写SV KAT。
`test:viewmodel`为A补充生命周期回归，和B独立验收分开记录。三个入口均进入check.sh；失败不跳过。
独立全集包含independent-tree目录，共800项（原505 + 152 + 11 + 17 + 68 + 9 + 30 + 7 + 1）；不能将其中子集重复累加。
本轮接线不改原选择241/33/6、M4 258及SDK/Core原入口。实际红/绿与对应测试SHA以REVIEW_LOG为准：
新增入口的存在不是验收通过声明。运行时首轮的首请求cursor辅助断言已由B独立纠正为
Schema规范化后的空字符串（dbb4077）；原冻结及初红保留，SDK/Schema未改。
B另冻结69a95ab的17项诊断所有权回归，修改前4绿/13红；标准入口显式包含这17项，
避免原163项或旧676全集通过掩盖C-73。修复后的独立验收以B/C交接为准。
B的C-74冻结85d55b0/c66e69c/9d9bbd3包含diagnostic-read及followups两文件，
初始68项为11通过/57失败；标准入口显式包含全部68及verify-diagnostic-read-types production，
防止只跑历史180/693漏掉读取重入/释放和后台拒绝。首次缺生产类型与红基线归档保持。
B后续3e3026e→9a4fa19的9项任务边界及d1bfe6a的30项函数诊断所有权保持.probe.mjs原文件名，
在标准树和完整独立入口均显式列出，避免wildcard只发现.test.mjs而漏跑。
函数未修复基线3通过/27失败保留；修复及独立验收按最新REVIEW_LOG分别记账。
L6无界面链不代替后续Electron/React/Playwright或完整M5验收。



### M5 实例属性运行时门禁

```sh
npm --prefix web run test:independent:m5:properties
HIER_BIN="$PWD/core/build/hier" npm --prefix web run test:independent:m5:properties:core
HIER_BIN="$PWD/core/build/hier" npm --prefix web run test:independent
```

模型入口构建生产包，再运行B最终冻结c2c0fac的严格消费者/22类型负例和281模型测试。
Core入口执行B独立SV的5个真实模型/SDK/Node/Core场景；没有假模型或Electron IPC。
`run-properties-tests.mjs`只集中设置本仓库产品根路径、原样转发B入口及非零退出，B输入文件保持。
两个入口均进入check.sh；完整独立入口保留原810，再顺序执行281/5及类型检查，共1096运行输入。
各脚本分别输出统计，不能只查看末尾5项就声称全集通过；任何前项失败均停止并返回非零。
IP-C01由B235d19d修订为同一SDK在模型构造前后的注册序列/有效token保持，已获C复核并原样合入；
不要求改变既有SDK注册顺序。旧252失败记录保留，新281包含按C批准订阅释放补文追加的29项。
当前实际通过/失败和后续B修订以[运行时记录](plans/M5-instance-properties-runtime.md)及REVIEW_LOG为准。

`test:viewmodel`另含A的cancel/clear通知中dispose及disposed subscribe精度回归，与原19项共22项。
该精度补文已获C通过，B独立冻结29项；A回归仍不替代B独立输入。原Tree诊断捕获提取由既有Tree287/35/14同时约束。
本单元没有PropertiesPanel/HierarchyTree/Electron、持久化/旧工程加载或M7验收结论。

### M5 树视图 L02 独立补充输入

使用Node24，在本树完成四包构建后执行；以下浏览器依赖已锁定于B测试目录。

```sh
npm --prefix web run typecheck -- --force
npm --prefix web/tests/independent-tree-view/c76/browser ci --no-audit --no-fund
node web/tests/independent-tree-view/c76/browser/node_modules/playwright/cli.js install chromium
HIER_B_PRODUCT_ROOT="$PWD" node --unhandled-rejections=throw --test web/tests/independent-tree-view/ui/l02/adapter.test.mjs
HIER_B_PRODUCT_ROOT="$PWD" node web/tests/independent-tree-view/ui/l02/run.mjs --self-check
HIER_B_PRODUCT_ROOT="$PWD" node web/tests/independent-tree-view/ui/l02/run.mjs
node web/tests/independent-tree-view/ui/l02/verify-evidence.mjs
```

新20模型控制/14浏览器控制验证测试适配，生产48语义须由最后一个run入口实际执行。
当前无HierarchyTree导出，该入口退出1、48计划/0执行/0skip，不能算通过或隐藏。
这些新增输入未接入标准入口，原140/810保持；L06/L09–11和Electron仍有独立前置。
如用PLAYWRIGHT_BROWSERS_PATH隔离浏览器，安装和运行都须设置同一路径。

`l02/verify-inputs.mjs`要求B旧测试树全部442文件与8efd1cf一致，只适用于对应B源码副本；
主树早已有产品/文档演进，不能将其非零判为本次导入损坏或修改冻结断言。
主树导入来源、原140及新48枚举另见[导入记录](plans/M5-l02-import.md)和完整证据。

### M5 Electron renderer 单元门禁

```sh
npm --prefix web run test:independent:m5:electron-renderer
npm --prefix web run test:client
node web/tests/independent-electron-renderer/verify-evidence.mjs
```

新增标准入口先构建实际包，通过公开 `@hier/client/electron/renderer` 依次执行 B 的类型消费者、
browser gate、原99运行输入（含15项真实HierClient）、C82/C83的25/12项，以及BER40/本id提前故障6项。
renderer运行合计182项；类型正例必须先成功，才执行16项负例。
wrapper 只绑定产品根并传播非零退出，B 冻结文件不变；此入口已纳入 check.sh 与 test:independent。
renderer接线时独立全集为原810 + 281 + 5 + renderer99 + C82的25 + C83的12 + BER40 + 提前故障6 = 1278；
后续Source新增306/14使全集为1598，见下节。不能把入口重叠或类型负例再加到运行总数；renderer入口只执行182。
1195/1232是历史集合；C82/C83与BER40的修前红保留，提前故障6项修前已绿，不能改写历史。

browser gate 只验证真实包 bundle、无 Node realm 模块加载及工厂形状；A 的 test:client 补充
在无 Node realm 中实际领取/start/SDK 查询/close，以及提前关闭等生命周期风险，仍不是 Electron E2E。
真实 main/preload/contextBridge、来源权限、窗口导航/崩溃和 Core IPC 尚待对应冻结/实现。
固定f936a33已获B独立复验/C审查通过；C关闭C-82/C-83，B独立补冻40/6并关闭BER-Q01/Q02/Q03。
原样导入与接线证据见[计划](plans/M5-renderer-gate-closeout.md)。这些决定仅在renderer已验范围有效。

verify-evidence 只核 B 历史冻结档的 22 捕获/10 pin/能力红，不作为当前产品运行结果。
该目录 audit-baseline.mjs 固定 B 旧 494 文件及产品 782c599，只适用于原上下文；
新主树以固定导入 diff/blob/99 与 16 枚举核来源，不修改其断言来适应新产品。
C82的`verify-review-evidence.mjs`核本轮B历史32捕获/17pin及25/12红结果；
`review-1087f78-provenance.mjs`同样限定旧固定树，不能作为更新主树产品门禁或修改它取绿。
BER的`node web/tests/independent-electron-renderer/ber/verify-evidence.mjs`可在原样导入主树核30捕获/23pin、40/6枚举及历史红绿；
其standardPassed=1232是B历史运行，semanticsExecutedByThisVerifier=0，不改成新集合1278。
`ber/provenance.mjs`固定B旧树与f936a33，保持原样且不作为新主树门禁。坏release的fixtureFaultDetach=4仅属夹具清理，
不计产品释放次数或保证坏Bridge远端资源回收。

### M5 源码文档数据模型门禁

```sh
npm --prefix web run test:independent:m5:source
HIER_BIN="$PWD/core/build/hier" npm --prefix web run test:independent:m5:source:core
HIER_BIN="$PWD/core/build/hier" npm --prefix web run test:independent
```

Source wrapper绑定本树公开产品根，模型入口先实际生产类型正例/34语义负例，再执行B原冻结306项和精确时序4项；
Core入口另执行14项真实SourceDocumentModel→SDK→Node→Core。HIER_BIN必须属于同一产品树core/。
两个入口均纳入check.sh与完整独立集合。Source初交付组成1598=1278+306+14；
新增身份26及BD4接线后组成1628，类型/设施/重叠子集不重复累计。M4为268+26=294，Source模型为306+4=310。
cycle5的check.sh/完整独立命令因旧S01/S02实际退出1，历史失败保留；C-ORCH-6通过身份增量，
B已按受审范围维护S01/S02并在明确测试overlay后实跑1598/268通过。
A原样导入后固定接线c64e9e5，实际完整check.sh与独立1628/M4 294通过，详见收尾计划。
原修前306/14能力红为planned/0executed/0skip，不能改写为320条已执行失败；生产类型修前34计划/0执行。

B冻结6838e4c与报告4dafc55原样导入；新核档器`web/tests/independent-source-document/verify-evidence.mjs`
要求HIER_B_PRODUCT_ROOT为报告固定ccbef3f源码树（只核历史资料，不运行产品）。不得指向推进后的主树取绿或修改其HEAD断言。
`provenance.mjs`还固定B旧测试树/共享HEAD，仅适用于历史上下文；新主树核完整导入diff/blob及306/14/34枚举。
6项设施和4项旧renderer接线控制不计Source模型语义；公共SDK方法故障装饰器输入也不冒称普通Core回包。

生命周期纯提取先回归旧1278，保持旧属性顺序；新实现复用同一TargetDataModel与diagnostic-data，
Source专有查询/坐标独立。新增isHierError用弱身份登记避免任意异常的原型探测，原instanceof不变，
A客户端2项与属性1项回归单列；增量接口已获C审查/B独立通过，BD-SOURCE-01由B依据精确4项关闭。
Source原Reply/completeness保持；changed不使用旧坐标高亮，exact按原文单扫描转换UTF-8字节/UTF-16单元。
SourceView/Selection协调、真实Electron/UI/AX/M7及旧工程迁移不由本无界面数据单元证明。
历史实现结果见[运行时计划](plans/M5-source-document-runtime.md)；最新接线/验收见[收尾计划](plans/M5-source-gate-closeout.md)。

`web/tests/independent-source-document/recheck/verify-evidence.mjs`只核B历史e4ba060+7文件测试overlay树及固定Core产物，
例如HIER_B_PRODUCT_ROOT=/tmp/hier-b-orch6-source.v992hyw6/source；要求53捕获/41pin和固定HEAD/hash，不能指向推进主树。
其1598/268和另列26/4属于B历史执行，核档自身0语义；`recheck/provenance.mjs`也仅适用于原历史上下文。
当前主树用完整导入diff/blob及26/4实际枚举核来源，不修改B的历史断言取绿。

#### 测试执行器路径边界（2026-10-17）

B已独立确认普通fd08ae7的294/1628。C-84的S02脚本路径改用fileURLToPath，B修订82b7531原样吸收922f1b1；
A三路径各10/10、普通M4 294已复验，C-ORCH-8已正式关闭C-84。三路径设施命令：

```sh
HIER_B_PRODUCT_ROOT="$PWD" HIER_B_COMPAT_INPUT_ROOT="$PWD" node web/tests/independent-source-gates/c84-paths.mjs
HIER_B_PRODUCT_ROOT="$PWD" node --test web/tests/independent-source-gates/wrapper.facility.test.mjs
```

前者复制六份B测试输入到ASCII/空格/中文目录，共用本树公开产品，不能当三个完整检出或30项新增产品用例。
后者20项是真实OS子进程设施，不加入294/1628；缺子文件为Node非零退出，不是spawn ENOENT注入。
B-PATH-02原组合检出完整命令810执行/767过/43旧树worker启动失败，后续11组未到达；该历史红保留。
B-ORCH-8进一步实证属性4项worker/3项fixture启动红及Core-model直接入口自然exit0空报告（5计划/0执行）。
六文件必要适配9494755已由B闭环关闭，A原样吸收a79324a；B明确六文件overlay组合检出完整1628/M4 294通过。
原C-84证据见[cycle7计划](plans/M5-c84-path-adaptation.md)和[B原报告](M5_B_C84_PATH_RECHECK.md)；
新边界见[cycle8导入计划](plans/M5-path02-import.md)与[B-PATH-02报告](M5_B_PATH02_RECHECK.md)。

```sh
HIER_B_PRODUCT_ROOT="$PWD" HIER_B_PATH_INPUT_ROOT="$PWD" HIER_BIN="$PWD/core/build/hier" node web/tests/independent-paths/run.mjs
```

该driver复制相同B输入到ASCII/空格/中文目录，每路径核tree43、properties281、Core KAT3、Core-model5和仅import控制。
15项设施共用一个公开产品/自有Core，不是三个完整检出或15个新增产品用例；必须核非空JSON和原5ID，不能仅检查exit0。
新`independent-paths/verify-evidence.mjs`需要HIER_B_PRODUCT_ROOT指向B历史
`/tmp/hier-b-orch8-paths.ObeHkS7G/checkout with space 中文`（bd1ea29加明确六文件overlay）；
核42捕获/10输入pin/63产品pin/6材料及固定binary，0当前产品语义，不能把历史1628写成核档器新执行。
同目录audit固定原共享HEAD，只适用B历史上下文；推进主树应核原样导入diff/blob。普通目录成功不证明所有路径/OS兼容。

`independent-source-gates/verify-evidence.mjs`只核B历史fd08ae7普通树，例如
HIER_B_PRODUCT_ROOT=/tmp/hier-b-orch7-gates.WmVvAE3d/source；31捕获/77产品pin、历史294/1628及20设施。
同目录`c84-verify-evidence.mjs`核40捕获/5输入pin及原固定组合树/产物，保留3条实际失败。
二者均0当前产品语义执行；历史固定树/二进制缺失时应明确缺证，不能改HEAD/hash断言指向推进主树取绿。
同目录两份audit脚本亦仅适用原B上下文；A导入用完整diff与最终文件字节核验。

### M5 快照源码候选分页提案（2026-10-17）

DESIGN§6.11为待审/待冻提案，非生产导出或运行时。验证入口：

```sh
npm --prefix web run check
node web/node_modules/typescript/bin/tsc -p web/contracts/tsconfig.source-candidates.json
node web/contracts/source-candidates/verify-types.mjs
HIER_BIN="$PWD/core/build/hier" node --test web/contracts/source-candidates/sdk-core-witness.test.mjs
```

严格消费者及20项逐一类型负例只证明隔离类型可用；真实SDK→Node→Core见证另列5项，
涵盖LF/CRLF的全部occurrence分页、字节列/整行/空行、query游标绑定、磁盘修改后的快照不变与跨快照stale_cursor。
只改临时A fixture，复用本树已有Core；无新模型、partial注入、宿主自动刷新或UI/IPC验收，不加入1628计数。
本次契约交付无生产变化，不重复完整独立集合/native/check.sh；已有结果保持原执行上下文。
原生完整构建/Core单测、dft-suite/Electron/E2E本轮未执行；首版无持久化，旧工程加载/迁移不适用。
范围/实际结果见[计划](plans/M5-source-candidates-contract.md)及[证据](m5_source_candidates_contract_a_verification.json)。

### M5 源码候选分页运行时（2026-10-17）

§6.11契约获C10通过、B原样冻结88e2e2a/e511880；标准入口绑定当前产品公开exports：

```sh
npm --prefix web run test:independent:m5:candidates
HIER_BIN="$PWD/core/build/hier" npm --prefix web run test:independent:m5:candidates:core
HIER_BIN="$PWD/core/build/hier" npm --prefix web run test:independent
```

首入口先执行生产类型正例/47负例，再执行281受控SDK模型；第二入口执行13真实模型→SDK→Node→Core。
均已接check.sh和完整独立命令，沿用source wrapper的显式candidates模式；document默认三步骤保持。
完整独立计划1922=1628+281+13，类型/26设施/A8取消原帧见证单列不累计。
A10历史结果273/281（8失败）、13/13、47/47；原B cases.mjs:407用params.id检查取消帧，
现有规范/Schema/SDK发params.target，A已提供8场景原帧交B核对，未修改/skip该断言。
该固定版本完整入口非零，不将未到达的末尾13冒记该命令已运行；13另通过专用标准命令执行。
先前纯共享重构前后旧1628均通过；新完整命令的旧1628亦通过，不混用执行上下文。
B verify-freeze.mjs只核原61db0b2固定材料，--product需指原历史P，不能改其pin到推进主树取绿。
来源/实际失败和限制见[运行时计划](plans/M5-source-candidates-runtime.md)，日志中的B修订状态优先于此历史执行记录。

B11以fa8d995修正取消字段并独立执行281/13/47、完整1922通过，C11通过实现及修订；
主树b3d6408原样吸收修订，辅助报告07f6f3d→f8ee1d6。A11当前标准候选入口281/47及设施10通过，
不为辅助报告重跑完整1922，B的1922不写成A本轮执行。原273/8及其证据保留。

### M5 当前文档点查询提案（2026-10-17）

以下为固定42a9256的隔离契约验证命令；旧能力见证含“生产尚无queryAt”断言，应在该历史版本执行。
当前运行时命令见下一节，不能修改历史见证以冒作新入口测试：

```sh
npm --prefix web run check
node web/node_modules/typescript/bin/tsc -p web/contracts/tsconfig.source-position.json
node web/contracts/source-position/verify-types.mjs
HIER_BIN="$PWD/core/build/hier" node --test web/contracts/source-position/model-core-witness.test.mjs
```

类型负例逐项移除标记并要求对应行真实拒绝，不以ts-expect-error存在代替检查。
真实Core见证只执行既有SourceDocument/Candidates：发布身份、BOM/CRLF、正向UTF-16展示与明确给定字节查询、改盘changed/恢复。
不包含queryAt运行时或反向映射实现，不作为B的新oracle，不加入1922独立计数。
新生产入口须C审/B冻；本提案不执行无增量的原生三配置、旧dft-suite/真实Electron/UI/E2E或工程加载迁移。
执行与限制见[计划](plans/M5-source-position-contract.md)，完整命令/结果见本轮固定证据和REVIEW_LOG。

### M5 当前文档点查询运行时（2026-10-17）

C12通过§6.12；B4a068f9/最终00f126b及fb896cf原样导入，生产queryAt与独立错误类已实现。
标准命令以当前产品根运行原B输入：

```sh
npm --prefix web run test:independent:m5:source-position
HIER_BIN="$PWD/core/build/hier" npm --prefix web run test:independent:m5:source-position:core
npm --prefix web run test:independent:m5:source-position:controls
HIER_BIN="$PWD/core/build/hier" npm --prefix web run test:independent
```

分别为32生产类型负例+258模型、11真实模型→SDK→Node→Core、13设施/旧扫描控制（4设施+9旧行为回归）。
沿用source wrapper显式position模式，旧document/candidates默认流程不变；三命令均接完整独立和check.sh。
产品集合2191=1922+258+11，32类型、13控制和20旧wrapper设施单列，不写成2204个queryAt产品用例。
共用全文扫描仍验证旧正向范围、行列和端点之后非法标量；旧306/34在纯重构阶段独立执行。
实际结果/限制见[运行时计划](plans/M5-source-position-runtime.md)。B13功能冻结通过，C13运行时审查未见其它缺陷；
C14/B14已分别关闭C-85/B-POSITION-GATE-01，固定bc1a5d8的修复与原样导入通过；历史未接受档不改写。
controls聚合启动前逐项确认两个必需输入为可读文件；缺任一个必须非零，不依赖Node批量发现的退出0。
新增接线设施单独验证model/core/controls成功、缺失、退出/信号、参数和环境；不计入2191产品总数或原13控制：

```sh
HIER_B_PRODUCT_ROOT="$PWD" node --test web/tests/independent-source-position/recheck/wrapper.facility.test.mjs
```

固定B2223c97的21项保持原样，原19过2败留作89ba787历史证据；B报告及核档脚本不改写为修复后结果。

### M5 文档绑定候选协调标准门禁（2026-10-17）

DESIGN§6.13已获C16契约审查通过；B16关闭Q1/Q2并固定0efe853补冻，原bdbc2c7保持。
生产实现与验证见[运行时计划](plans/M5-source-navigation-runtime.md)；B17/C17功能验收、
C18关闭C-87及B18固定cc1191a常规入口窄复验通过。A执行不代B/C独立运行时验收。

```sh
npm --prefix web run test:independent:m5:source-navigation
HIER_BIN="$PWD/core/build/hier" npm --prefix web run test:independent:m5:source-navigation:core
npm --prefix web run test:independent:m5:source-navigation:controls
node --test web/tests/source-navigation-wrapper.test.mjs
```

model先跑46个生产类型负例，再由ready-baseline/run.mjs --all执行310=284+26模型；Core原入口10项。
controls聚合原4+补冻4个设施，启动前两个必需文件各自预检；A入口9项单列，保留原wrapper20/21设施。
test:independent产品总数2511=2191+310+10；46类型、8设施、A入口9项和构造清理1项均单列，不充产品计数。
构造清理回归位于tests/viewmodel，由test:viewmodel/check.sh执行；公共snapshot访问器故障注入只证明异常清理。
标准test:independent/check.sh均接入navigation的model/core/controls，旧入口顺序与语义保持。

隔离28类型与3项A旧能力见证保留为a02a20c历史；其显式“新导出不存在”断言不适用于当前运行时，不改写它取绿。
B15/16原能力红、open/false历史档保持；可用两份verify-evidence.mjs --inputs核历史证据，不计当前语义执行。
真实SDK/Node/Core集成不代SourceView/Selection/真实Electron IPC；本单元无持久化/迁移。

### M5 受控只读SourceView契约验证（2026-10-17）

DESIGN§6.14主干与Q1/Q2补文已获C19/C20认可，B20正式关闭Q1/Q2并补冻19DOM。
下列为[契约计划](plans/M5-source-view-contract.md)的隔离入口；B原输入/历史缺能力红保持。
隔离声明消费生产SourceDocumentState和既有实验的React类型；它自身不提供生产运行时。

```sh
node web/node_modules/typescript/bin/tsc -p web/contracts/tsconfig.source-view.json
node web/contracts/source-view/verify-types.mjs
```

第二命令先严格编译正例，再逐项移除20个expected-error指令；必须在对应行产生语义诊断，
不允许缺失导入/未用指令或无关错误充数。核实React与生产文档声明确已消费，Node/Electron类型输入为0。
它不执行组件/React/DOM/Core，无新产品用例计数；原2511及全部B冻结保持。
同单元运行`npm --prefix web run check`检查四包/Schema/分层，纯契约不重复原生/全产品回归。
真实浏览器的原文、高亮、局部滚动、焦点/可访问状态，以及React peer/CSS tarball消费须在实施前独立冻结、实施后执行。
生产组件和实际执行见下一节；不能把隔离类型或树实验算作SourceView/Electron/端到端通过。

### M5 受控只读SourceView运行时（2026-10-17）

只读单元已获B22/C22独立验收；实施和历史证据见[运行时计划](plans/M5-source-view-runtime.md)。
安装web锁定开发依赖及对应Playwright Chromium（首次环境执行 `npm --prefix web ci`，
再 `cd web && npx --no-install playwright install chromium`），普通门禁使用web工具目录：

```sh
npm --prefix web run test:independent:m5:source-view
npm --prefix web run test:independent:m5:source-view:package
npm --prefix web run test:independent:m5:source-view:controls
HIER_BIN="$PWD/core/build/hier" npm --prefix web run test:independent
./check.sh
```

分别执行B原28生产类型负例、89DOM与Q1/Q2的19DOM、C-89新增9缩放DOM；6组包外tarball/React单实例/CSS消费；
冻结清单/文档类型/self-check与A入口设施回归。设施计数与产品计数分开，原始失败档不改写。
wrapper预检所有输入，绑定本检出/工具，传播失败和signal；包测试优先显式HIER_B_NPM_BIN、
再npm_execpath/PATH定位npm，并对全部本地tarball安装固定offline，避免用户registry/镜像请求影响该门禁。
不放宽React peer或跳过实际安装；根包不依赖ReactDOM/Node/Electron，CSS在pack --ignore-scripts中真实提供。
C-88已由C21正式关闭于B修订70f91e5，主树原样吸收；其独立路径回归要求显式提供指向同一工具目录的别名：
`HIER_B_PRODUCT_ROOT="$PWD" HIER_B_BROWSER_TOOLS=<web实际别名路径> node web/tests/independent-source-view/recheck/verify-c88-paths.mjs`。
C-89专项现由model入口实际运行；A入口设施新增缺scale输入/目录/非零/signal四例，共23项，不能漏跑后仍报绿。
B22独立通过固定a757417的117/28/6，C22已正式关闭C-89；修复与原红证据见[修复计划](plans/M5-source-view-c89.md)。
标准check.sh新增三个入口；真实Electron main/preload/IPC、系统剪贴板/读屏、SSR与M7性能另行验证。
首版无持久化，本单元不改工程格式，旧工程加载/迁移不适用。

### M5 源码位置交互提案验证

DESIGN§6.15已获C23契约通过/B23冻结；[提案计划](plans/M5-source-position-interaction.md)保留历史准备记录。
以下属于原提案检出57fb80d的隔离接口、既有模型/真实Core能力、原生浏览器位置能力，不是新交互运行时验收：

```sh
node web/contracts/source-position-interaction/verify-types.mjs
HIER_BIN="$PWD/core/build/hier" node --test web/contracts/source-position-interaction/model-capabilities.test.mjs
HIER_A_EVIDENCE=<已存在的证据目录> node web/contracts/source-position-interaction/native-capabilities.mjs
```

类型消费真实React、views和viewmodel声明；浏览器脚本没有新事件处理器，Selection由见证脚本设置，
不声称真实用户事件→候选端到端、B冻结或Electron。B22核档器无参数可离线核历史档；
其--inputs还检查原B检出/主树快照字节及mtime，主树继续推进后不能拿该模式当移动HEAD的验收。

### M5 源码位置交互运行时

[运行时计划](plans/M5-source-position-interaction-runtime.md)保留A23实现与原失败；
B24/C24已接受固定473bfb0配合B维护51606dc，C-90/C-91由C关闭。
导入来源与本轮门禁见[接线计划](plans/M5-source-position-observation-closeout.md)。
现有SourceView三个标准入口新增B23冻结：model先跑旧28/117，再跑新42类型/119场景；
package跑旧6组及新2组；controls含新inventory、8原生设施对照及B24的verify-observation.mjs。
后者验证24真实观察（6同步阳性/18延迟阴性）、24合成、2DOM提交与7透明性/清理，产品执行0。
不把fixture时序问题或被短路的后续入口写成通过。A36项wrapper设施核缺输入/目录/退出/信号和本根接线。

```sh
npm --prefix web run test:independent:m5:source-view
npm --prefix web run test:independent:m5:source-view:package
npm --prefix web run test:independent:m5:source-view:controls
node web/tests/source-position-browser/run.mjs controls
node web/tests/source-position-browser/run.mjs product
```

后两项是A补充设施对照/产品回归，不能替代B冻结或独立验收。controls不导入SourceView；
product复用B已审探针核真实监听器调用栈及原事件身份、缩放/双轴滚动、反向Selection与提交后反馈/视口几何、外部DOM修改拒绝。
eventPhase仅为诊断，不能排除微任务延迟；A23历史档中的同栈判据由A24新执行修正，原档不改写。
A22隔离consumer的I20明确断言生产尚缺新API，保留历史字节，不作为新运行时类型门禁；当前消费使用B42生产声明。
旧117/28/6及B23原始119/42/包2的业务预期不修改，观察设施采用B24已审维护；
真实Electron、候选确认→Selection、其它平台和工程持久化边界保持。

### M5 SourceHit 权威地址判别提案

以下保留A25/146bfa6的历史提案验证；C26已通过契约、B26已冻结，当前入口见下节运行时。
[契约计划](plans/M5-source-ref-kind-contract.md)记录当时的兼容/ABI边界；隔离能力断言不适用于新增字段后的检出。

```sh
node web/contracts/source-ref-kind/verify-types.mjs
node web/contracts/source-ref-kind/schema-compatibility.mjs
HIER_BIN="$PWD/core/build/hier" node --test web/contracts/source-ref-kind/core-capabilities.test.mjs
```

16项逐个类型负例使用实际生产Protocol/Selection声明；启用DOM库提供已有SDK的AbortSignal，types=[]且无Node/React/Electron类型输入。
19项Schema对照只在内存合并待审增量，用实际旧验证器确认旧可选扩展行为；不冒称已实现新SDK响应校验。
真实Core共享/逐实例两模式从公开元数据验证同definition范围包含定义/对象、原1/2/2分页与现有缺字段，
不注入新字段或按前缀猜测。这是历史缺能力见证，新增字段实施后不能继续当新生产验收门禁。
新Core标记/序列化/同版本重编及SDK互操作使用下节入口；候选确认和UI/Electron仍须后续独立验收。

B25新16项观察接线专项已原样导入，保留为独立显式命令：

```sh
HIER_B_PRODUCT_ROOT="$PWD" node web/tests/independent-source-position-interaction/gate/run.mjs
node web/tests/independent-source-position-interaction/gate/verify-evidence.mjs
```

后者仅核B25可携证据；未指定--inputs，不检查历史工作树mtime，不算产品重跑。
标准controls已经包含B24真实观察和A36；B25新16与它们分账，不宣称已自动进入总入口。

### B独立C++结构重放

`b_m4_schema_replay`链接生产decoder/validator；CTest `b_m4_cpp_schema`运行原B结构输入，
共654项（569结构、84登记/默认、1未知方法），不把findMethod不能枚举的方法集合/数量冒称可观测。
所有常规三配置及Linux都登记该门禁，不依赖手工另跑。

`b_m4_raw65_projection`另从B固定1abdbcf研究脚本的白名单AST重建输入，检查raw65 fixture
全部显式字段、精确标量类型及次序。原脚本保持B字节/SHA，仅作为冻结输入来源；这里不执行
候选库研究、不需要jsoncons/RapidJSON或研究用环境变量，也不把研究候选的红测隐藏为通过。

Python jsonschema是已有测试工具，按`protocol/schema/tests/requirements.txt`安装到隔离venv。
`check.sh`用环境变量`HIER_SCHEMA_PYTHON`指定解释器（默认python3，缺包明确失败）；
直接CMake用`-DHIER_SCHEMA_PYTHON=<python>`。Linux脚本在自有build volume建立venv并安装同一锁定文件。
不改变生产依赖或测试预期；`--help`仍可在没有测试依赖时运行。


### Linux sanitizer工具链

CI镜像保留Ubuntu24.04，使用固定digest官方GCC13.4工具链；`CC/CXX`明确指向该版本。
原Ubuntu GCC13.3在aarch64会生成缺少FakeStack占用flag清理的ASan返回路径，
上游修复为[GCC r13-9350](https://gcc.gnu.org/pipermail/gcc-cvs/2025-January/416552.html)。
`ci/sanitizer-stack-probe.cpp`以公开ASan接口验证65536次单层调用均有fake frame，无时间阈值。
此预检用于发现编译器插桩退化；ASan/UBSan/UAR仍开启，不靠禁用检查或提高600秒门禁。
新镜像`hier-ci:ubuntu24.04-gcc13.4`及volume `hier-ci-gcc13.4-build`隔离旧编译产物，
旧13.3红仍单独归档。切换工具链必须全量重编所有对象，不能只重链产品。

### M5 SourceHit 权威地址判别运行时

DESIGN§6.16已获C26契约通过/B26冻结。A实现及验收状态见[运行时计划](plans/M5-source-ref-kind-runtime.md)。

```sh
npm --prefix web run test:independent:m5:source-ref-kind
HIER_BIN="$PWD/core/build/hier" npm --prefix web run test:independent:m5:source-ref-kind:core
npm --prefix web run test:independent:m5:source-ref-kind:controls
node web/scripts/run-source-ref-kind-tests.mjs native core/build
./check.sh
```

model运行B原40类型负例、208结构的权威Schema/JS双验证、191实际旧schema7兼容及23 SDK/候选输入；
core运行B原24真实SDK/Node/Core、全部对象身份与共享/逐实例/宏/include/CRLF/UTF8/分页投影。
固定旧fixture为146bfa6的实际Schema和构建JS，逐文件压缩字节/SHA校验，运行后清理，非从新Schema删字段造旧版。
controls只验证入口的参数、错误传播与清理，不计产品业务用例。

Core CMake编译B原7序列化、208结构回放与24公开Core API消费者源。序列化也注册CTest；
check.sh在现有三配置完整构建后逐配置执行native入口，不改B原独立runner或业务期望。
所有C++库与消费者同版本重编，目录可复用缓存；不声称冷构建或旧二进制ABI兼容。
标准test:independent包含model/core/controls；三配置native在check.sh中执行。
旧M3SourceSort/M3SourceIncrement/Observer及大occurrence、动态页内取消仍由原CTest门禁执行。
同一输入跨语言/配置/页大小不相加计数；不冒称Core动态partial、真实Electron或候选确认已覆盖。
旧提案的无字段能力断言保留历史，不放进新运行时门禁。首版无工程持久化，加载/迁移不适用。

### C-92 原独立Core父项目回归

A26的直接Core入口未检测全局target重名，C27/B27确认原B父项目配置失败。修复见[执行计划](plans/M5-source-ref-kind-c92.md)。
A集成target使用`hier_source_ref_kind_{serialization,schema,api}`；B原父项目保留`b_ref_kind_api`，输入/预期不变。
新CTest `a_source_ref_kind_nested_configure`直接配置B原父项目，独立输出目录、复用当前FetchContent依赖源码；
正常check.sh三配置均执行，避免只测直接Core图。配置回归不冒充实际Core API执行。

```sh
ctest --test-dir core/build -V -R '^a_source_ref_kind_nested_configure$'
HIER_B_PRODUCT_ROOT="$PWD" HIER_B_BROWSER_TOOLS="$PWD/web" node web/tests/independent-source-ref-kind/verify-native.mjs --core-api
./check.sh
```

第二条为B原未改runner，在当前macOS工具链下实际构建Debug/Release/Debug+ASan-UBSan完整Core及原外部消费者，
分别运行原7/208/24；源码/库必须同版本。可预配置其独立build目录复用只读依赖源码，不能替换B的目标或源文件。
C28已按固定fa0cee4及原入口证据关闭C-92；当前状态以REVIEW_LOG为准。

### C-93 嵌套配置的依赖与allocator继承

不能把默认优化/Debug绿当可选allocator OFF正确。B28冻结的原3项检查默认ON、显式OFF及Debug→优化复用OFF，
要求实际嵌套CTest恰1条并通过，父子选择保持。运行时显式给产品与只读依赖源码根：

```sh
HIER_B_PRODUCT_ROOT="$PWD" HIER_B_DEPENDENCY_ROOT="$PWD/core/build/_deps" \
  node web/tests/independent-source-ref-kind/c92/build-config.mjs
ctest --test-dir core/build -V -R '^a_source_ref_kind_configure_regression$'
```

第二条为A自有回归，三份标准配置都会执行：真实Core父配置→原B嵌套图，验证当前配置、OFF、优化复用、
清理旧错误依赖覆盖；allocator可用时再OFF→ON→OFF，另验证真实子配置错误非零及恢复。
临时目录含空格/中文、结束清理，仅调用指定配置测试，绝不递归全CTest或复用产品对象。
它不是新增Core业务执行；原7/208/24及旧source/observer/取消门禁仍由标准check.sh执行。
修复/实际结果见[C-93计划](plans/M5-source-ref-kind-c93.md)，B冻结不随A修改，C-93由C复核关闭。

### M5 显式候选确认提案（2026-10-18）

以下是A29固定04737e4/ecbe038的历史命令；A30/C-94的23项在固定8fdc91a验证。
新生产方法实现后，历史C17与旧能力“缺方法”断言不再适用，不改旧断言取绿。当前命令见下节。

B29限定通过/C29关闭C-93后，继续DESIGN§6.17；[计划](plans/M5-source-confirmation-contract.md)和
[隔离说明](../web/contracts/source-confirmation/README.md)界定本轮范围。以下仅为A提案/既有能力见证，不是新确认方法实现或B独立验收：

```sh
node web/contracts/source-confirmation/verify-types.mjs
HIER_BIN="$PWD/core/build/hier" node --test web/contracts/source-confirmation/capabilities.test.mjs
npm --prefix web run check
```

类型检查逐项确认22个语义负例；真实shared/per-instance Core各5命中，另核现有Selection提交/历史/通知后异常。
实际source.resolve不缓存，连续重载返回新Reply；并发请求可跨模型共享Reply，不能据页身份推断动作归属。
首轮A见证错误缓存假设的失败及修正留可携档。新确认方法尚不存在，未测试其运行时，正式实现后不得改旧能力断言取绿。
生产/Schema/构建入口不变，故不重复完整check.sh或所有未变业务测试；无持久化工程格式，旧工程加载/迁移不适用。

### M5 显式候选确认运行时（2026-10-18）

C30已接受DESIGN§6.17主干与B公开SDK同Reply适配；原B0a83e08冻结不改，Q1六输入由B据补文另行冻结。
运行时执行记录见[计划](plans/M5-source-confirmation-runtime.md)：

```sh
npm --prefix web run test:independent:m5:source-confirmation
npm --prefix web run test:source-confirmation:controls
HIER_BIN="$PWD/core/build/hier" npm --prefix web run test:source-confirmation:core
./check.sh
```

第一条运行B121真实模型/SDK+controlled Transport行为及37公开类型，不包含Core或UI。
第二条包含B6设施和A6条Q1同步起步/异步续步回归，二者分别报告，不将A6当B补冻通过；
controls入口先检查两个必需文件，禁止缺文件仍零测试成功。
第三条是A的真实SDK→Node→Core→SourceNavigation确认→Selection集成，两种body模式各五个公开metadata权威命中；
覆盖追加保持动作、候选重载/新文档使旧动作失效、选择/历史与借用资源释放，不冒充独立B或Electron UI端到端。
三条均接check.sh，原SourceDocument/Candidates/Navigation/Selection/SourceView门禁保持。
历史A/B证据核验不算本轮业务执行；首版无持久化，旧工程格式加载/迁移不适用，协议旧schema7省略refKind仍有独立回归。

### B31 确认回归增量及候选视图准备

C31/B31已通过16b18a0确认实现，C-94/B30-Q1由各提出方关闭。原样导入bb3428c/e86f478后，沿用上节三个标准命令：
model执行B原121/37和B31 Q1六项；controls执行B原6、新7设施及A原6回归，随后A27项接线控制；
core执行B31八项真实Core和A原两项。设施/重复入口/不同作者分别报告，不相加为新业务用例。
所有Node --test输入（含Core入口）预检普通文件；临时接线设施只造子进程回执，不模拟模型/替代B oracle。

DESIGN §6.18为下一单元提案，以下只核隔离类型，不执行新UI：

```sh
node web/contracts/source-candidates-view/verify-types.mjs
npm --prefix web run check
```

组件/CSS出口尚未实现，对应真实DOM/键盘/原动作绑定、原Promise观察、包消费和纵向链由B独立冻结后实施。
本轮不改产品运行时，不重复已接受的完整check.sh或三配置；无实际Electron/持久化迁移验收。

### C-95 / B32 输入边界修订

B32部分冻结8529290/报告579c731原样导入，56 DOM和30生产类型当前是缺组件/导出的能力红，不能纳入已实现标准门禁取绿。
`--proposal`仅检验B独立声明；`run.mjs --controls`的12项为旧公开模型/浏览器设施，不挂载新候选视图。
执行时显式设置HIER_B_PRODUCT_ROOT为当前固定产品、HIER_B_BROWSER_TOOLS为其web目录；冻结仍归B维护。

```sh
HIER_B_PRODUCT_ROOT="$PWD" node --test web/contracts/source-candidates-view/pagination-boundary.test.mjs
node web/tests/independent-source-candidates-view/verify-evidence.mjs --inputs
node web/tests/independent-source-candidates-view/verify-controls.mjs --verify docs/m5_b_source_candidates_view_freeze_controls.json
```

第一条为A的五项L6/Schema见证，不执行候选按钮或真实Core；后两条只核历史证据，不重跑产品。
DESIGN §6.18修订partial不续页、显式重查及未知reason当前Schema7不可达/未覆盖；不改变既有L6或Schema。
C33已关闭C-95；B32-Q2由B关闭，Q1及其余UI差额保持，完整组件实施前置尚未满足。

### B33 分页部分冻结

9fd645b/4f4fb5b原样导入；新增8 DOM与原56 DOM/30类型分账，不纳入已验收标准全绿入口。
在仓库根显式指定当前固定产品与浏览器工具：

```sh
export HIER_B_PRODUCT_ROOT="$PWD"
export HIER_B_BROWSER_TOOLS="$PWD/web"
node --test web/tests/independent-source-candidates-view/pagination/facility.test.mjs
node web/tests/independent-source-candidates-view/pagination/run.mjs --controls
node web/tests/independent-source-candidates-view/pagination/run.mjs
node web/tests/independent-source-candidates-view/pagination/verify-evidence.mjs
node web/tests/independent-source-candidates-view/pagination/verify-controls.mjs --verify docs/m5_b_source_candidates_view_pagination_controls.json
```

前两条为11 Node设施、11真实模型/原生浏览器设施，不挂载新候选组件；第三条当前预期退出1、0执行/8blocked，不能计作8项通过。
后两条只核B历史档案（26捕获/21材料/8输入和1正8负控制），不是新产品执行。
公开调用记录器不读then/加catch/替换原返回，不能关闭原Promise消费Q1。A33新增的继承方法清理失败反例及B交接见[计划](plans/M5-source-candidates-view-contract.md)，不修改B冻结期望。

### B34 观察器恢复失败修订

B34的ad3e749/f27fee6先冻结11项，c8b42f8只修继承删除失败漏报，49853d9交付证据；原样导入且保留旧档/旧pins。
上节B33核档现在不带--inputs，只核历史证据；其--inputs限旧helper树（例如f725b1e），对修后当前树应退出1。
当前精确修订使用release核验器，不改旧hash取绿。沿用上节产品/工具环境，执行：

```sh
node --test --test-reporter=tap web/tests/independent-source-candidates-view/pagination/release/release.test.mjs
node web/tests/independent-source-candidates-view/pagination/release/verify-evidence.mjs --inputs
node web/tests/independent-source-candidates-view/pagination/release/verify-evidence.mjs --verify-controls docs/m5_b_observer_restoration_controls.json
```

第一条11项设施测试；后两条核38捕获/24材料/5输入、6封档回执与1正10负元数据对照，当前产品执行0。
故障注入导致不可配置包装无法删除时，应聚合报告并继续其余恢复，不声称包装已恢复。
A34复验原A3项及真实Navigation的dispose/setup两条路径后关闭A33-B-OBSERVER-01；C35已独立复核该修订通过。
原调用/返回/抛值身份和Promise不代消费保持；Q1及完整组件冻结差额未关闭，设施绿不是候选UI通过。

### B35 原动作部分冻结与C-96核档入口

fea9ebd至7e07d98九笔交付应完整导入后运行最终集合，不执行已记录递归注册错误的中间测试版本。
新增8项DOM、17 Node设施、9真实模型/原生浏览器前提；原64 DOM/30类型保持。
沿用显式HIER_B_PRODUCT_ROOT/HIER_B_BROWSER_TOOLS，仓库根执行：

```sh
node --test --test-reporter=tap web/tests/independent-source-candidates-view/pagination/release/cli.test.mjs
node --test --test-reporter=tap web/tests/independent-source-candidates-view/actions/facility.test.mjs
node web/tests/independent-source-candidates-view/actions/run.mjs --controls
node web/tests/independent-source-candidates-view/actions/run.mjs
node web/tests/independent-source-candidates-view/actions/verify-evidence.mjs
node web/tests/independent-source-candidates-view/actions/verify-evidence.mjs --verify-controls docs/m5_b_candidate_action_identity_controls.json
```

CLI最终16项验证真实/符号链接路径、有效/无效archive、输入篡改拒绝、自测/回执非空输出及模块/stdin/eval导入不执行核档。
旧B33核验器仍须从真实路径运行；其同根因别名空成功为历史限制，不能计通过，本轮未改旧verifier/pins。
新actions DOM当前退出1、planned8/executed0/passed0/blocked8/skip0；累计72计划DOM不代表完整冻结或已执行。
核档器只验证历史68捕获/45材料/12历史输入及7回执，核1正6负元数据对照和历史8个CLI控制回执；不计当前产品执行。
其--inputs只适用于修前输入（如9958f0e）；B36修订release入口后应拒绝16759 != 16565，旧pins保持。
两个pointer准备/取消输入为synthetic边界；键盘断言在keydown后、keyup前检查原动作/次数/defaultPrevented。
C36已关闭C-96并限定认可B35动作输入；新增C-97及修订见下。Q1与其它列明差额保持，不把调用记录或原生输入设施当实际组件消费/平台E2E。

### B36 跨页部分冻结与 C-97 导入边界

a681937/e655f8b/97b7dcd/578e22c四笔原样导入；先冻32项导入/CLI边界，再修两入口main识别。
沿用上述显式产品/浏览器环境，在仓库根执行：

```sh
node --test --test-reporter=tap web/tests/independent-source-candidates-view/imports/cli-import.test.mjs
node --test --test-reporter=tap web/tests/independent-source-candidates-view/pagination/release/cli.test.mjs
node --test --test-reporter=tap web/tests/independent-source-candidates-view/multipage/facility.test.mjs
node web/tests/independent-source-candidates-view/multipage/run.mjs --controls
node web/tests/independent-source-candidates-view/multipage/run.mjs
node web/tests/independent-source-candidates-view/multipage/verify-evidence.mjs
node web/tests/independent-source-candidates-view/multipage/verify-evidence.mjs --self-test
```

前两条为32项新边界与16项旧CLI：导入不解析消费者参数/输出核档报告，真正CLI必须核验并拒绝无效档。
14 Node、8真实模型/原生浏览器前提为设施；六项DOM当前exit1、0执行/6blocked/0skip，累计78计划DOM仍为部分冻结。
核档器核41捕获/33材料/12历史输入，1正6负元数据对照；B38三入口修订后当前根--inputs应拒绝20835 != 20834。
旧8项evidence-cli.test.mjs须在历史12输入/档/测试加当前multipage入口的独立snapshot运行，范围见下节；不算当前根inputs或候选UI通过。
新核档器仅支持--archive/--inputs/--self-test，没有--verify-controls入口；后封控制档由交付来源/字节核验及其回执审计覆盖。
native import.meta.main优先，fallback在Node24副本去除native单行后重跑32项；不声称原生Node20/22已验证。
C37限定认可跨页六项；C-97组合-pe的B38修订见下节，已在三个原生版本定向验证，C39已关闭。
以上历史Node24 fallback32通过本身不证明组合形态覆盖；Q1、旧动作/通知/生命周期/滚动/包外/真实Core UI差额保持。

### B37 原行移除与指针捕获部分冻结

08b53c/a8062c/2da0dd5/8ed9838依序原样导入；08首冻含两处规范过约束，仅保留历史，最终使用2da修订集合。
两项先冻设施正例验证failure字段不必可枚举、已移除原行配套click可以零确认；宿主等待真实pending/空页链和DOM零行后才答复普通重载。
沿用显式HIER_B_PRODUCT_ROOT/HIER_B_BROWSER_TOOLS，在仓库根执行：

```sh
node --test --test-reporter=tap web/tests/independent-source-candidates-view/pointer-rebind/contract-facility.test.mjs
node --test --test-reporter=tap web/tests/independent-source-candidates-view/pointer-rebind/facility.test.mjs
node web/tests/independent-source-candidates-view/pointer-rebind/run.mjs --controls
node web/tests/independent-source-candidates-view/pointer-rebind/run.mjs
node --input-type=module <<'JS'
import fs from 'node:fs';
import {verifyEvidence, checkEvidenceControls} from './web/tests/independent-source-candidates-view/pointer-rebind/evidence.mjs';
const a = JSON.parse(fs.readFileSync('docs/m5_b_pointer_rebind_freeze.json'));
console.log(JSON.stringify({evidence: verifyEvidence(a, {root: process.cwd()}), controls: checkEvidenceControls(a)}));
JS
```

前两条为2项规范回归/25项设施，浏览器9项为真实模型及输入前提；DOM当前exit1、0执行/6blocked/0skip。
最后显式API核35捕获/124材料/11当前输入与1正6负元数据对照，不执行产品。evidence.mjs没有CLI；直接node运行或传--inputs/--verify-controls不能算核档。
六DOM使用合成PointerEvent，不是设备E2E；sameReply适配仅为L6前提，不证明原行连续存在。累计84计划DOM仍部分冻结。
C38已限定认可新输入/两处规范纠正；P04取消是在原行已移除后，不覆盖连续保留行的取消捕获分支。Q1及其它差额保持。

### B38 C-97 组合参数与原生 Node 回归

五提交2e50c78/1724c0d/3734a26/e02ae07/5ceb3a5原样导入；三个核验main各加一个+，其余verify/selfTest/历史档和pins保持。
在仓库根，分别用已校验的Node20.12.2、22.0.0、24.21.0替换下列node；旧版本仅作兼容测试：

```sh
node --test --test-reporter=tap web/tests/independent-source-candidates-view/imports/combined-print.test.mjs
node --test --test-reporter=tap web/tests/independent-source-candidates-view/imports/cli-import.test.mjs
node --test --test-reporter=tap web/tests/independent-source-candidates-view/pagination/release/cli.test.mjs
node --input-type=module <<'JS'
import fs from 'node:fs';
import {verifyEvidence, checkEvidenceControls} from './web/tests/independent-source-candidates-view/imports/evidence.mjs';
const a = JSON.parse(fs.readFileSync('docs/m5_b_c97_native_print.json'));
console.log(JSON.stringify({evidence: verifyEvidence(a, {root: process.cwd()}), controls: checkEvidenceControls(a)}));
JS
```

76为独立输入数，不把三个版本计成228种不同用例；修前20/22各64通过12失败，修后三版本均76/76，旧32/16均通过。
旧multipage 8项：从固定9e99a04提取其12 pins及旧档/测试，只换当前multipage入口（不在12 pins内），共15文件；三版本8/8不代表当前根--inputs有效。
显式纯API核51捕获/132材料/8输入及1正7负元数据对照，不运行产品；直接执行imports/evidence.mjs不构成核档。
历史pins保持，multipage当前--inputs明确拒绝，release五输入仍有效。后封controls的排版变更须与e02 JSON对象相等。
A38格式检查exit1，仅新format_receipts JSON未规范排版；该失败和原字节保留历史，B39整理及A39复验见下节。
C39已正式关闭C-97；84计划DOM/30历史类型、Q1与完整组件差额不借CLI通过关闭。

### B39 回执排版修订

181bf67/931cfce依序原样导入，仅改变format_receipts JSON两个command数组排版并新增B报告/证据。
原5ceb目标14224字节/SHA bf491b7eaab55d2f61812f731d29b02991ce4d1d7cb0d2fb8fa9af70382bd6a9；
当前14152字节/SHA ffe5188a6a53fb7ec6a23ebb87ed9a61f10dba94574a33f04658bbd500f3e534。
原JSON对象完全相等，八条回执/原exit1/16条双流及其长度/SHA保持；没有重跑八条历史命令。

```sh
node web/node_modules/prettier/bin/prettier.cjs --check docs/m5_b_c97_native_print_format_receipts.json docs/m5_b39_format_receipts_report.md docs/m5_b39_format_receipts_verification.json
```

A39实际修前单文件exit1/0.066秒，修后三文件exit0/0.103秒；Prettier3.9.10与现有lock一致，未安装依赖。
上节显式metadata API在当前根仍通过51捕获/132材料/8输入和1正7负；这是历史档核验，不是重新执行76/32/16/历史8或Node20/22。
A38可携档中旧format_receipts引用对应固定5ceb，应按其sourceCommit核旧字节，不能改成当前格式SHA或要求其等于当前文件。
本轮产品/Core/IPC/DOM/完整构建未重跑，编译输入未变；旧工程加载/迁移不适用。A38排版项已复验完成，完整组件差额保持。

### B40 提交后微任务签发/撤销部分冻结

6e67014/9b46dde/6ee5fc4依序原样导入，最终接受输入以9b46为准；首稿D04等待导致同栈前提失效的反例保留历史。
沿用显式HIER_B_PRODUCT_ROOT（主树绝对路径）/HIER_B_BROWSER_TOOLS（主树web绝对路径），仓库根运行：

```sh
node --test --test-reporter=tap web/tests/independent-source-candidates-view/deferred-bindings/facility.test.mjs
node web/tests/independent-source-candidates-view/deferred-bindings/run.mjs --controls
node web/tests/independent-source-candidates-view/deferred-bindings/run.mjs
node --test --test-reporter=tap web/tests/independent-source-candidates-view/pointer-rebind/facility.test.mjs web/tests/independent-source-candidates-view/pointer-rebind/contract-facility.test.mjs
node --input-type=module <<'JS'
import fs from 'node:fs';
import {verifyEvidence, checkEvidenceControls} from './web/tests/independent-source-candidates-view/deferred-bindings/evidence.mjs';
const a = JSON.parse(fs.readFileSync('docs/m5_b40_deferred_bindings_freeze.json'));
console.log(JSON.stringify({evidence: verifyEvidence(a, {root: process.cwd()}), controls: checkEvidenceControls(a)}));
JS
```

A40实际14/14 Node设施、5/5浏览器前提、旧相关27/27通过；六DOM能力门禁exit1、planned6/executed0/passed0/blocked6/skip0，缺组件/CSS。
已有主树70生产源码/构建配置及98编译模块/声明与B固定aeef独立编译字节一致，A未重建主树；夹具实际构建warnings空。
14/5包含真实SDK/Nav与React调度前提；不能将本轮概括为所有产品执行0，也不能把设施绿记为候选UI/Core/Electron验收。
纯metadata API核31捕获/74材料/14当前输入与1正7负，核档调用本身不执行产品；直接运行evidence.mjs不构成核档。
D04/D05不覆盖未提交render，D06不穷尽订阅/读取顺序；B的Q1父链接+反馈反例仅为Node诊断，A未重跑，不是浏览器强观察适配。
C41已限定接受B40最终9b46六项及前提纠正；原90计划DOM/30历史类型仍属部分冻结，Q1及完整组件差额保持。
没有生产编译输入变化，未重跑旧CLI/完整web/Core/旧DOM/类型/包外全集或真实Core UI/Electron/IPC；无持久化迁移。

### B41 焦点/局部滚动部分冻结

936f411/8077277依序原样导入；首冻八文件保持，累计96计划DOM/30历史类型仍部分冻结。
沿用显式HIER_B_PRODUCT_ROOT（主树绝对路径）/HIER_B_BROWSER_TOOLS（主树web绝对路径），仓库根运行：

```sh
node --test --test-reporter=tap web/tests/independent-source-candidates-view/focus-scroll/facility.test.mjs
node web/tests/independent-source-candidates-view/focus-scroll/run.mjs --controls
node web/tests/independent-source-candidates-view/focus-scroll/run.mjs
node --test --test-reporter=tap web/tests/independent-source-candidates-view/deferred-bindings/facility.test.mjs web/tests/independent-source-candidates-view/pointer-rebind/facility.test.mjs web/tests/independent-source-candidates-view/pointer-rebind/contract-facility.test.mjs
node --input-type=module <<'JS'
import fs from 'node:fs';
import {verifyEvidence, checkEvidenceControls} from './web/tests/independent-source-candidates-view/focus-scroll/evidence.mjs';
const a = JSON.parse(fs.readFileSync('docs/m5_b41_focus_scroll_freeze.json'));
console.log(JSON.stringify({evidence: verifyEvidence(a, {root: process.cwd()}), controls: checkEvidenceControls(a, {root: process.cwd()})}));
JS
```

A41实际15/15设施、5/5浏览器前提、旧相关41/41；六DOM能力exit1、planned6/executed0/passed0/failed0/blocked6/skip0。
前提确有真实SDK/Nav/Selection/SourceView执行，实测window(60,20)、outer(80,30)、sourceHost(15,12)、SourceView内部(23,11)非零滚动，普通DOM局部滚动与父移动负例成立。
这些不是六目标UI行为通过；SourceCandidatesView/公开CSS尚缺。F06实际DOM关联不等于完整AX/读屏或空态强关联。
纯API核24捕获/48流、28材料（26普通+2重建审计）/10输入及1正7负，核档调用产品执行0；直接执行API文件不构成核档。
两份B历史来源审计可重建，各41命令/82双流，28块去重保存；外层首次截断和首次seal语法错误保持历史，不冒称完整外层捕获。
70生产源/配置及98主树产物与B固定548d独立构建字节一致，A未重建主树；新夹具构建warnings空。
A/B bundle不同哈希来自46处生成路径注释及9处CommonJS路径标签，逐行限定替换后全文相等；A初始核对脚本两次非零及修正证据见本轮归档/REVIEW_LOG。
C42已限定接受B41六项/设施/证据；Q1/未提交render/连续原行新代次/旧闭包/完整生命周期/包外与纵向差额保持。无生产/持久化变化，未重跑无变化Core/产品全集。


### B42 同步确认错误/回调资格部分冻结

509d4d8/b7b6162依序原样导入；八首冻文件保持，累计98计划DOM/30历史类型仍部分冻结。
以下为A42历史命令；C-98修订已改变两份设施，旧档须在固定0a0f0f17的旧树验证，不能用当前文件匹配旧pins。
在该固定旧树设置HIER_B_PRODUCT_ROOT为其绝对路径、HIER_B_BROWSER_TOOLS为其web绝对路径并从其根目录运行；当前修订命令见下一节：

```sh
node --test --test-reporter=tap web/tests/independent-source-candidates-view/sync-feedback/facility.test.mjs
node web/tests/independent-source-candidates-view/sync-feedback/run.mjs --list
node web/tests/independent-source-candidates-view/sync-feedback/run.mjs --controls
node web/tests/independent-source-candidates-view/sync-feedback/run.mjs
node --test --test-reporter=tap web/tests/independent-source-candidates-view/actions/facility.test.mjs web/tests/independent-source-candidates-view/pagination/release/release.test.mjs
node --input-type=module <<'JS'
import fs from 'node:fs';
import {verifyEvidence, checkEvidenceControls} from './web/tests/independent-source-candidates-view/sync-feedback/evidence.mjs';
const a = JSON.parse(fs.readFileSync('docs/m5_b42_sync_feedback_freeze.json'));
console.log(JSON.stringify({evidence: verifyEvidence(a, {root: process.cwd()}), controls: checkEvidenceControls(a, {root: process.cwd()})}));
JS
```

A42实际17/17新Node设施、4/4浏览器前提、28/28相关旧设施；两DOM门禁exit1、planned2/executed0/passed0/failed0/blocked2/skipped0。
S01要求原同步错误E/回调原抛值X链、浅冻结failure及外层AggregateError顺序；S02要求实际DOM click到flushSync替换同栈撤销反馈资格。
这两项候选UI交错、边界传播与卸载异常分支实际未执行，不由真实SDK/Nav/Selection及普通React/DOM前提代验。
合成HTMLElement.click没有pointerdown，不称trusted鼠标/平台读屏或Electron E2E；本轮无Q1新观察适配。
纯API显式调用核21捕获/42流、28材料/13输入、22来源Git命令/44原流及1正7负/空对象拒绝，核档本身产品执行0。
70生产源/配置及98主树产物与B固定e4e99独立构建字节一致；A只读核对，未把B构建计为自己的执行。夹具构建warnings空。
A实际bundle SHA45b02f8030f229978ae4533c6cec376de02d712ceb7c40a8b0732cfccdbda2d9与B布局不同，未声明原始bundle相同；两次A运行哈希一致。
C43已核B42来源/历史结果并提出C-98设施缺陷；后续修订见下，不回写A42历史为已修复。Q1/完整组件和既有差额保持。无生产/持久化变化，未重跑无变化Core/完整web/CLI/IPC/旧工程迁移/远端CI，不计完整构建或M5完成。


### C-98设施修订与B43回调生命周期部分冻结

B五笔C-98修订及B43两笔前置原样导入；正常runner仍只读真实公开包。独立probe的显式别名仅用于设施正负对照，productionCandidateUIExecuted=0。
当前仓库根设置HIER_B_PRODUCT_ROOT为主树绝对路径、HIER_B_BROWSER_TOOLS为主树web绝对路径，I=web/tests/independent-source-candidates-view，R=I/sync-feedback/revision-c98：

```sh
node --test --test-reporter=tap "$R/channels.test.mjs" "$I/sync-feedback/facility.test.mjs" "$I/feedback-lifecycle/facility.test.mjs" "$I/actions/facility.test.mjs" "$I/pagination/release/release.test.mjs"
node "$R/probe.mjs"
node "$R/probe.mjs" --leak
node "$R/probe.mjs" --S01
node "$R/probe.mjs" --S01 --boundary-leak
node "$I/sync-feedback/run.mjs" --controls
node "$I/sync-feedback/run.mjs"
node "$I/feedback-lifecycle/run.mjs" --controls
node "$I/feedback-lifecycle/run.mjs"
```

A43实际74/74 Node（新13+sync17+B43 16+actions17+release11）、四组最终浏览器对照、原4/4与新5/5前提通过。
两生产runner均exit1，S01/S02 planned2/executed0/blocked2，T01–03 planned3/executed0/blocked3；passed/failed/skipped均0。不是正式候选UI通过。
旧漏检复现须将HIER_B_PRODUCT_ROOT指向固定0a0f0f17的旧树；用当前R/probe.mjs --legacy与--legacy --leak，A实际分别exit0与exit1。
后者原detail.pass=true而原生error/pageerror各1，恰为应拒绝却漏检的回归；修订后--leak的exit0表示已拒绝预期故障。
S01正控许可实际componentDidCatch快照中的具体index/value事件；同一wrapper后续逸出仍被拒。本机观察到2条边界报告及迟到4条全局事件，不把具体次数升级成产品oracle。
观察不preventDefault、不读then/消费UI原Promise；空message映射只适配锁定Playwright投影。新三项与修订均不证明Q1。

纯验档API均须显式import后调用verifyEvidence/checkEvidenceControls：

- sync-feedback/revision-c98/evidence.mjs配docs/m5_c98_sync_feedback_revision.json：当前root，1正6负/空对象拒绝，46捕获/30材料/13嵌套bundle/14来源Git命令。
- feedback-lifecycle/evidence.mjs配docs/m5_b43_feedback_lifecycle_freeze.json：当前root，1正7负/空对象拒绝，20捕获/31材料/16输入/25来源Git命令。
- 原sync-feedback/evidence.mjs配原B42档：固定旧root验证通过，当前修订root应按旧pins拒绝；保留旧API和档不改。

70生产输入/98产物与B固定0a0f独立构建字节一致，A未重建产品；新/修订测试、计划、报告、档Prettier与git空白检查通过，夹具构建warnings空。
旧两份设施为明确修订，其余原路径及历史pins保持；DESIGN规范未变。C44已正式关闭C-98、限定接受B43三项；该单元累计101计划DOM/30类型仍部分冻结，后续B44见下。
未重跑无变化Core/CLI/完整web/check.sh/旧DOM类型包外全集/真实Core UI/Electron/IPC/跨平台/远端CI，首版无持久化加载迁移；不计完整构建/M5完成。


### B44未提交render三项限定冻结

52ae45c首冻→7cc75a6 Plain设施适配→fa52c59有效范围→7a0f805证据原样导入。当前以fa52范围执行，首稿/中间版/失败保持历史。
仓库根显式HIER_B_PRODUCT_ROOT=主树绝对路径、HIER_B_BROWSER_TOOLS=主树web绝对路径：

```sh
node --test --test-reporter=tap web/tests/independent-source-candidates-view/uncommitted-render/facility.test.mjs
node web/tests/independent-source-candidates-view/uncommitted-render/run.mjs --list
node web/tests/independent-source-candidates-view/uncommitted-render/run.mjs --controls
node web/tests/independent-source-candidates-view/uncommitted-render/run.mjs
node --test --test-reporter=tap web/tests/independent-source-candidates-view/deferred-bindings/facility.test.mjs web/tests/independent-source-candidates-view/feedback-lifecycle/facility.test.mjs
node --input-type=module <<'JS'
import fs from 'node:fs';
import {verifyEvidence, checkEvidenceControls} from './web/tests/independent-source-candidates-view/uncommitted-render/evidence.mjs';
const a = JSON.parse(fs.readFileSync('docs/m5_b44_uncommitted_render_freeze.json'));
console.log(JSON.stringify({evidence: verifyEvidence(a, {root: process.cwd()}), controls: checkEvidenceControls(a, {root: process.cwd()})}));
JS
```

A44实际12/12新Node、5/5浏览器前提、30/30相关旧设施通过；目标三DOM exit1，planned3/executed0/passed0/failed0/blocked3/skipped0，缺组件/CSS。
5前提含真实SDK/Nav/Selection原tuple、普通React Suspense abandon/replace/resume和passive整栈负控；均candidateUI=false，不能代验三目标UI。
U01未提交后卸载，U02换预先就绪新模型对后开放旧gate，U03同原模型/state在host同栈开放gate并显式flushSync重试；不涵盖全部自动/并发路径。
候选后的render/layout witness及尾gate在同一primary；整栈零命令须在flushSync返回后/让出当前栈前检查。真实普通passive负控产生1条记录并被拒，不靠layout快照单独取绿。
B44-SCOPE-01：瞬时Navigation.subscribe次数未明定，只记录诊断；Selection不订阅仍检查，完整UI退订未覆盖，不以host dispose替代。gate为host自有Promise，不证明UI命令原Promise消费/Q1。
纯API显式调用核36捕获/72流、38材料/15输入、内层最终49Git/98原流及1正7负/空对象拒绝；首稿漏传Plain与审计语法失败等五非零保持历史。
70生产输入/98主既有产物与B固定7e79435独立构建字节一致，A未重建产品；定向Prettier/git空白及来源保护通过，夹具warnings空，controls清理/全局通道/pageerror/releaseErrors为空。
C44关闭C-98并接受B43，C45已限定接受B44最终三项；累计104计划DOM/30类型仍部分冻结，Q1/完整组件/M5不放行。
无生产/API/ABI/IPC/Schema/依赖/工程格式变化；未重跑无变化Core/CLI/完整web/check.sh/旧DOM类型包外全集/真实Core候选UI/Electron/IPC/跨平台/远端CI；首版无持久化加载迁移，不计完整构建。


### B45候选包外tarball消费专项

沿DESIGN§6.18.1/6、§6.14.5，B四笔原样导入，最终50c2a8d/证据536b1e7；C46已限定接受测试输入/设施及导入，B45-INPUT-01由B46关闭。
独立临时consumer真实安装四产品与八原锁runtime/types tarball；私有空cache/config、offline/ignore-scripts/strict-peer-deps，无force/legacy-peer/network/workspace产品链接。

从仓库根执行，显式设置HIER_B_PRODUCT_ROOT为本仓库绝对路径、HIER_B_BROWSER_TOOLS为本仓库web、HIER_B_NPM_BIN为npm绝对路径；HIER_B_PACKAGE_EVIDENCE_ROOT为已存在的自有临时目录。

~~~sh
node --test --test-reporter=tap web/tests/independent-source-candidates-view/packaged/facility.test.mjs
node web/tests/independent-source-candidates-view/packaged/run.mjs --list
node web/tests/independent-source-candidates-view/packaged/run.mjs
node --input-type=module <<'JS'
import fs from 'node:fs';
import {verifyEvidence, checkEvidenceControls} from './web/tests/independent-source-candidates-view/packaged/evidence.mjs';
const a = JSON.parse(fs.readFileSync('docs/m5_b45_packaged_freeze.json'));
console.log(verifyEvidence(a, {root: process.cwd()}));
console.log(checkEvidenceControls(a, {root: process.cwd()}));
JS
~~~

A45实际21/21设施、1正8负归档控制通过；四包probe执行4/通过1/失败3/阻塞0/skip0，runner exit1如实保留。
PK01缺候选函数根出口；PK02正例缺四公开名字TS2305，六隔离语义负例执行0/阻塞6；PK03缺CSS子路径，尚未读取/解析该产品CSS；PK04严格安装/React18.3.1物理单例通过。
原SourceView根/类型对照通过，实际声明来源检查通过；TS7006/2344仅缺出口后续诊断，不当额外独立缺陷。
类型标准库豁免须同时满足真实编译器lib目录、lib*.d.ts名与默认库标志；纯设施真实TS/esbuild正负对照不等于产品候选已消费。
保留B45-INPUT-01首稿错误TreeView旧对照、4094修正及原失败；最终新候选语义预期未改。包能力不是DOM/Core/Electron/Q1执行，六负例不混计原30类型。
70源/配置及98既有JS/声明与B固定e2da独立构建一致；A未重建产品。12 tarballs原字节/15子命令30完整流在A可携档保留。A/B九包原字节相同，另三包差异仅tsconfig.tsbuildinfo，不声称12包原字节全等。
来源/状态/保护见docs/m5_packaged_a_verification.json；A自有采集脚本两次失败及纠正保留：元数据/产物报告同名导致KeyError、随后包含原日志既存空白导致diff检查失败。改为不同输出名及交付路径检查，原日志前缀保持。
C46已限定接受B45测试输入/设施，真实红基线与Q1/完整组件/M5未放行保持。无生产/API/ABI/IPC/Schema/依赖/工程格式变更；首版无持久化加载迁移。
未重跑无变化Core/CLI/完整web/check.sh/旧DOM类型包外全集/真实Core候选UI/Electron/IPC/跨平台/压力/远端CI，不计完整构建或本轮独立验收。


### B46原生Promise堆可行性诊断（不是Q1正式oracle）

新诊断只使用固定Playwright/Chromium，未导入SDK/Nav/候选UI。原样导入首冻7f8c9a2、时点修订ca03602、引擎固定51f7d0d及证据f373301；C47限定认可诊断可行性，允许pending子集透明桥接探索。
从仓库根设置HIER_B_BROWSER_TOOLS为本仓库web绝对路径、HIER_B_Q1_EVIDENCE_ROOT为已存在自有临时目录，无需产品根：

~~~sh
node --test --test-reporter=tap web/tests/independent-source-candidates-view/promise-heap-diagnostic/facility.test.mjs
node web/tests/independent-source-candidates-view/promise-heap-diagnostic/probe.mjs --list
node web/tests/independent-source-candidates-view/promise-heap-diagnostic/probe.mjs
node --input-type=module <<'JS'
import fs from 'node:fs';
import {checkEvidenceControls} from './web/tests/independent-source-candidates-view/promise-heap-diagnostic/evidence.mjs';
const a = JSON.parse(fs.readFileSync('docs/m5_b46_promise_heap_diagnostic.json'));
console.log(checkEvidenceControls(a, {root: process.cwd()}));
JS
~~~

A46实际10/10 parser通过；诊断exit0/0.948秒，14条记录=12pending结构检查+2unsupported-settled，不是14项Q1通过。
五完整原堆/60CDP记录保存；回读重算70投影与原14输入一致，两个即时堆结构/identity相同，resume后才观察晚微任务，恢复后显式GC保持已知结构，三个暂停marker均events[]/integrity=true，page/cleanup errors均空。
固定Chromium156.0.8078.4/revision f842f52ef39fd97b449eb27cff414bf05a98ddce、V8 15.6.75、Playwright1.64.1；不能推广私有布局。空转发不是双closure，two-success/split-handlers当前投影同形，settled明确不支持。无全局错误不作为消费证明。
B46-FACILITY-01首冻暂停内显式GC超时保留于原B档；修订仅改重复暂停快照/恢复后GC时点，不声称原请求成功。新B档显式API1正8负（含空对象）通过，保留15原堆/原失败，重算两次历史成功运行各14记录，不是A重跑该历史流程。
A可携证据docs/m5_promise_heap_a_verification.json包含实际原堆/双流/来源保护；准备脚本初次bytes/str错误在仓库写入前修正、原保护基线保持，说明存档。
70生产输入/98既有JS及声明只读核对，未重建。无前序生产/API/ABI/IPC/Schema/依赖/工程格式改变，持久化不适用。
C47限定认可B46已知控制诊断、证明范围修订及引擎固定；正式UI oracle批准/Q1关闭均false。B47作为提出方按收窄范围关闭B46-FACILITY-01；原Runtime.evaluate与HeapProfiler.collectGarbage两个20秒watchdog保留，不称原暂停内GC成功。
无实际命令返回→UI事件截止桥接，SDK/候选UI/Core/Electron执行0；该诊断不增加历史DOM/类型及包外4probe/6负例计数。
未重跑无变化B45包消费、Core/CLI/完整web/check.sh/旧DOM类型全集/真实Core候选UI/Electron/IPC/跨平台/压力/远端CI，不计完整构建或M5通过。


### B47会话切换配套手势部分冻结

按249c20a首冻→9adca59异常控制→179bfdc清理错误修复→6096388证据原样导入；G01/G02及清理控制预期保持。C48认可所声明会话判据与原清理窄修复，新增C-99/Medium部分构造回滚遗漏；设施整体未通过，详见下节。
从仓库根执行，显式HIER_B_PRODUCT_ROOT为本仓库绝对路径、HIER_B_BROWSER_TOOLS为本仓库web；node使用原锁工具环境。

~~~sh
node --test --test-reporter=tap web/tests/independent-source-candidates-view/pointer-session/facility.test.mjs web/tests/independent-source-candidates-view/pointer-session/cleanup-control.test.mjs
node web/tests/independent-source-candidates-view/pointer-session/run.mjs --list
node web/tests/independent-source-candidates-view/pointer-session/run.mjs --controls
node web/tests/independent-source-candidates-view/pointer-session/run.mjs
node --input-type=module <<'JS'
import fs from 'node:fs';
import {verifyEvidence, checkEvidenceControls} from './web/tests/independent-source-candidates-view/pointer-session/evidence.mjs';
const a = JSON.parse(fs.readFileSync('docs/m5_b47_pointer_session_freeze.json'));
console.log(verifyEvidence(a, {root: process.cwd()}));
console.log(checkEvidenceControls(a, {root: process.cwd()}));
JS
~~~

A在6777110修前固定阶段实际执行两清理控制：exit1，2项1过1失败；原错误/双流保留。修复后732cda0实际14/14 Node、3/3浏览器前提通过。
B47-FACILITY-01由B修复关闭：setup失败且cleanup失败时聚合原值并保留cause；清理成功仍原样抛setup。真实Selection子类故障控制核构造2/释放1/disposed=true。
三浏览器前提全部candidateUI=false；Selection-only旧action仍可提交，普通React同位置mount1/unmount0，配套down/up/click及独立AT click的detail为0/0/1/0，全部isTrusted=false。
目标DOM planned2/executed0/passed0/failed0/blocked2/skipped0，exit1：SourceCandidatesView/公开CSS缺失。G01换模型对、G02仅换同snapshot Selection；旧手势零confirm/反馈/历史改变后，再独立AT向新Selection一次；不依赖no-op或模型拒绝掩盖调用。
前提cleanup.errors/globalErrors/unhandled、controlPageErrors/releaseErrors及门禁gatePageErrors/releaseErrors全空。三个前提不计候选UI、真实设备、读屏或Q1消费通过。
B档显式API1正8负/空对象拒绝，27捕获/54外流、34材料/227块/17输入核验。A另按原runner选项重建一次fixture，2900444字节/62输入/warnings空，SHA与两个实际报告一致；这是重建同hash，不是截获原bundle，也不声称A/B bundle相同。
70产品源/98既有JS声明与B固定bf8ef4d独立构建字节一致，A未重建产品。四笔完整patch/raw/blob及最终11路径一致，九旧helper保持；1448基线路径除四状态文档外1444条bytes/mtime不变，日志原前缀/规范尾保持。
A47-EVIDENCE-01：自有来源审计首跑误用G01/G02短ID，实际冻结ID是B47-G01/B47-G02；保留首脚本/exit1双流，只纠正自有核对值后通过，不改B oracle。
A证据docs/m5_pointer_session_a_verification.json保留上述失败、DOM阻塞及实际完整双流；来源76Git命令保留完整比较后的argv/长度SHA摘要，不冒称原Git流留档。
累计106计划DOM/30历史类型仍部分冻结；C47仅准pending诊断桥接探索，C48新增B47设施C-99，Q1/连续旧行新代次/旧闭包/完整生命周期等未覆盖。
无前序生产/API/ABI/IPC/Schema/依赖/工程格式变化，首版无持久化迁移。未重跑无变化Core/CLI/完整web/check.sh/旧DOM类型包消费全集/真实Core候选UI/Electron/IPC/跨平台/压力/远端CI，不计完整构建或M5通过。


### A48：C-99部分构造清理反例复现（未修复）

固定产品/设施a3468d074d71ac9d22c51b2c7df0acaf25fc79dc。C原探针来自/private/tmp/hier-c-orch48.oBSRFf/pair-setup-probe.mjs，2209字节/SHA16b710019248c956514dc3d80b44e0b5d4063c6749893a2c5b157ec4f15d611c，与C48固定证据材料pin一致。
A仅将四处/tmp/hier-c-orch48.oBSRFf/fixed绝对模块/产品根改成本仓库，异常注入/断言/finally不变；原版、适配版、来源及实际完整双流保存在docs/m5_c99_a_reproduction.json。
E=/var/folders/g4/bhc8hd9969l3z_9yg53y_9wm0000gn/T/hier-a-orch48-c99-m27punya，cwd=仓库根，N=/Users/jiangbowang/.npm-global/bin/node：

~~~sh
N=/Users/jiangbowang/.npm-global/bin/node
E=/var/folders/g4/bhc8hd9969l3z_9yg53y_9wm0000gn/T/hier-a-orch48-c99-m27punya
"$N" "$E/pair-setup-probe.mjs"
HIER_B_PRODUCT_ROOT="$PWD" HIER_B_BROWSER_TOOLS="$PWD/web" "$N" --test --test-reporter=tap web/tests/independent-source-candidates-view/pointer-session/facility.test.mjs web/tests/independent-source-candidates-view/pointer-session/cleanup-control.test.mjs
~~~

以上N/E为记录中的绝对路径缩写。探针exit1/0.120秒，失败于“ALL created navigations released by setup failure: pair”；两种模式原setup抛值保持。
selection第一套Nav disposed=true/release1、Client release1；pair第一套正确但第二Nav disposed=false/release0、第二Client release0，构造2次。探针finally补释放观察到的残留资源，不改变设施自身回滚的失败事实。
原两文件14/14通过（exit0/0.151秒），说明既有selection故障控制未覆盖pair部分构造；不能据此关闭C-99，也不声称已测长期堆/生产连接泄漏。
B48确认尚未修复，C明确由B先冻pair释放/异常控制并修共同helper，A后续原样吸收、C复核关闭。A本轮不改B oracle/helper，也未导入或执行B48新桥接探索；其七正常前提不消除C-99。
本轮产品/API/ABI/IPC/Schema/依赖/工程格式与原规范尾不变，首版无持久化迁移。原1460路径除四状态文档外1456条bytes/mtime保持、98既有产物对A47固定pins不变；未重跑无变化Core/CLI/浏览器前提/候选DOM/完整web/check.sh/真实Core UI/Electron/IPC/跨平台/压力/远端CI，不计完整构建或组件通过。


### A49：C-99修订的固定旧helper对照与回归

测试head=92c50f6d4c17d1cf5ea792757b84b9ba5c2b92f1；B49六笔原样导入，一个旧pagination/public-model.mjs修订；B48三笔仅作为B49输入pins/回归依赖补齐。
从仓库根设置HIER_B_PRODUCT_ROOT为本仓库绝对路径、HIER_B_BROWSER_TOOLS为本仓库web。E为REVIEW_LOG所列A49证据目录：

~~~sh
D=web/tests/independent-source-candidates-view/context-ownership
node --test --test-reporter=tap "$D/partial-construction.test.mjs" "$D/reentrant-close.test.mjs" "$D/async-close.test.mjs" "$D/normal-command.test.mjs"
node --import "$E/use-original-helper.mjs" --test --test-reporter=tap "$D/partial-construction.test.mjs" "$D/reentrant-close.test.mjs" "$D/async-close.test.mjs" "$D/normal-command.test.mjs"
node "$E/pair-setup-probe.mjs"
node web/tests/independent-source-candidates-view/pointer-session/run.mjs
~~~

A首11冻结在ad95b65原helper实际1过10失败（exit1/0.150秒）。最终14原helper重放3过11失败（1/0.226秒），当前14/14（0/0.219秒）；只路由一个测试helper到保存的887698b原字节，公开产品及其它模块未改，B路由脚本仅改两路径。
原C探针同A48适配版逐字节一致，本轮两模式原setup身份保持、所有已创建Nav/Selection disposed且释放1次、Client释放1次，exit0/0.172秒。
B指定16文件组合实际162/162（0/0.207秒），包含新14与B48六设施；不与新14相加当176项独立覆盖。完整argv保存于A档related-node捕获。
九既有runner --controls：pagination11、actions9、multipage8、pointer-rebind9、deferred-bindings5、uncommitted-render5、feedback-lifecycle5、sync-feedback4、pointer-session3，共59/59。
B43两故意error/rejection和B42两AggregateError/boundaryEvents精确匹配原控制；其余非预期错误/清理通道空，不称全部pageErrors为空。九组只记录runner实际bundleSHA，不保存原buffer或另重建，不称拥有原bundle。
B47目标DOM planned2/executed0/passed0/failed0/blocked2/skipped0，exit1/0.432秒，缺SourceCandidatesView/公开CSS，gatePageErrors/releaseErrors空；前提不代验候选语义。
显式B49 verifyEvidence(root=当前仓库)/checkEvidenceControls通过：48捕获/12材料/288块，另核两顶层helper、67当前输入、四历史引用，1正8负。旧B48档不对当前已改helper根调用旧pins核验；未执行七浏览器桥/56堆回放。
九笔完整patch/raw delta/逐提交及最终19路径blob一致；136来源Git命令完整比较后只留argv/长度SHA摘要，不冒称原始流。A审计首跑错将唯一文件计为20，纠正为19，保留audit-first.py/exit1双流，仅改A计数，不改B预期。
70产品源/98既有产物与B49固定887698b独立构建同字节，A未重建产品；1461基线路径除四状态文档/明示helper外1456条bytes/mtime保持，规范尾/日志原前缀保持。
07是超出合法同步投递的故障控制；12是合法微任务投递但未覆盖提前退订抑制；11不扩大为Promise身份或同步起步专门证明，构造未返回对象内部/移交后ready初始化catch不在本修复范围。
C-99已修订待C复核关闭，不替代B/C独立验收；Q1/106计划DOM/30历史类型/完整组件/M5未放行。无生产/API/ABI/IPC/Schema/依赖/工程格式改变、无持久化迁移。
未重跑无变化Core/CLI/完整web/check.sh/旧DOM类型包消费全集/真实Core UI/Electron/IPC/跨平台/压力/远端CI；不计完整产品构建。可携原始证据见docs/m5_c99_fix_a_verification.json。


## SourceCandidatesView 首版生产门禁（DESIGN §6.18）

依据 2026-10-18 用户决定，既有 106 DOM/30 类型为充分实施前置。生产验证使用原 B 输入，不再以“缺少组件”的历史能力结果代替实际执行。

```sh
npm --prefix web run test:independent:m5:source-candidates-view
npm --prefix web run test:independent:m5:source-candidates-view:package
npm --prefix web run test:independent:m5:source-candidates-view:controls
```

三入口先构建 TypeScript；wrapper 固定当前仓库产品和工具，预检所有必需输入，非零子进程立即失败；package 使用实际 npm tarball 外部消费者。已接 `test:independent` 和 `check.sh`。model 运行原 11 组 106 DOM 和原 30 类型，随后运行 B50 `pointer-session/run.mjs --c100` 两条生产缺陷回归（共108 DOM，原106不改）；package 的四探针/六额外类型负例单列，不计为额外 DOM；controls 为原有设施/浏览器前提，非产品覆盖。

本组件不改变 Core/协议/Schema 或会话持久化。原 SourceView 与 SDK/Core 纵向回归仍走 `check.sh`。真实 Electron/main/preload、整套 UI 的 processor_core E2E、Q1 强观察、读屏及跨平台仍另验，不能把本轮通过当 M5 整体放行。生产交付与实际命令见[计划](plans/M5-source-candidates-view-production.md)。

controls 中 B36 的八项历史证据 CLI 使用原档12输入字节的隔离目录运行；旧档中两个 verifier 在后续已获接受的维护中改变，不能用当前根冒称旧pins匹配。wrapper 校验旧字节长度/SHA并原样运行当前冻结CLI；其余209项设施与76浏览器前提使用当前产品。历史CLI不计当前组件语义覆盖。


## HierarchyTree 生产门禁（DESIGN §6.7）

```sh
HIER_BIN="$PWD/core/build/hier" npm --prefix web run test:independent:m5:tree-view
HIER_BIN="$PWD/core/build/hier" npm --prefix web run test:independent:m5:tree-view:controls
```

model依次执行原46类型、L02 48错误、B52 C-102九例及原140 UI（其中两条真实UI→SDK→Core）；已接test:independent及check.sh。九例由原ui/run.mjs的--c102分组运行，不改原140集合。首次缺少B独立c76/browser工具时按其原lock安装，浏览器二进制由既有Playwright环境提供。默认采用B52独立观察的纯DOM定位ui/observed-expansion.mjs，移除已被替代的A定位器；HIER_B_EXPANSION_ADAPTER仍可覆盖。非零立即传播，不跳过非法props或过滤错误。controls是已有夹具自身检查，不计产品通过。

A51给SourceView、位置交互和候选列表的三个包runner仅补virtual-core本地tarball输入，使新增生产依赖可在原空cache严格离线消费者安装；消费断言/原React peer与禁ReactDOM/Node/Electron边界保持。B52独立维护提交83a6dae与当前三文件同字节，C52接受其范围。A52仅导入B72c2f1a/b0cc50a定位和九例及分组路由，原140/46/L02 48断言保持。

当前树非法props用例的React开发重试与旧windowErrors身份匹配差异保留原失败；详见树生产计划，不能把单项业务断言成立或控制诊断通过计为140全通过。实际读屏/强观察/跨平台、真实Electron/完整processor_core演示链仍另验。

## PropertiesPanel 实例属性隔离契约（历史见证，DESIGN §6.19）

```sh
npm --prefix web run check
node web/node_modules/typescript/bin/tsc -p web/contracts/properties-panel/tsconfig.json --pretty false
```

隔离声明使用已有公开L6/React类型；11个expect-error负例与正向宿主消费者仅核提案可表达性，不进入生产exports、不算组件/DOM通过。C54已接受契约、B54已完成有限冻结；该隔离命令不代替以下生产门禁。旧属性281/1096及树140/46/48输入保持；首版无持久化，工程加载/迁移不适用。


## PropertiesPanel 实例属性生产门禁（DESIGN §6.19）

```sh
npm --prefix web run test:independent:m5:properties-panel
npm --prefix web run test:independent:m5:properties-panel:package
npm --prefix web run test:independent:m5:properties-panel:controls
```

原样执行 B54 的 9a7d312/ca910b0：model 为生产类型正例/30真实负例及69浏览器输入（含1实际SDK/Core纵向）；package 为3新增包输入，复用旧候选包的4探针/6类型/16内部命令，分别报告；controls 为6夹具单测和1真实模型控制，不计产品UI。wrapper 使用仓库构建产物与现有锁下工具，HIER_BIN默认core/build/hier，可显式覆盖；包输入使用实际npm隔离tarball消费者。非零立即传播，不改B断言。已接test:independent/check.sh，放在保留51历史失败的树门禁之前。

使用组件时从@hier/views导入PropertiesPanel及公开类型，另引入@hier/views/properties-panel.css；宿主拥有并显式load实例模型，选择模型必须同快照。根入口不引入ReactDOM/Node/Electron，无新增依赖。生产验证不等于B/C独立验收或完整M5：自动目标协调、定义/连接面板、真实Electron、读屏、跨平台、M7仍另验。


## ObjectConnectionsModel 生产门禁（DESIGN §6.20）

```sh
npm --prefix web run test:independent:m5:connections
HIER_BIN="$PWD/core/build/hier" npm --prefix web run test:independent:m5:connections:core
npm --prefix web run test:independent:m5:connections:controls
```

三入口先typecheck；wrapper固定当前产品根，预检必需输入并传播非零/信号。model原样执行B56的24个真实类型负例和83模型输入；core执行原5项真实模型/SDK/Node/Core独立SV，controls为6项夹具/SDK控制，控制不计模型通过。HIER_BIN默认本仓库core/build/hier，可显式指定。已接test:independent/check.sh，旧门禁与树51历史失败保留。

新模型只借用ready SDK，沿原obj.get/conn.drivers/conn.loads Reply和各自completeness。共用输入边界抽取必须保留原SourceCandidates集合；完整check.sh继续验证旧模型/视图、Core三配置与Schema兼容。无IPC/Schema/ABI/工程格式变化、无持久化迁移。本单元是无界面数据链，不代表连接UI、真实Electron或完整M5通过。实际运行结果见[生产计划](plans/M5-object-connections-runtime.md)。

## ObjectConnectionsView 有限隔离契约（历史见证，DESIGN §6.21）

```sh
npm --prefix web run check
node web/node_modules/typescript/bin/tsc -p web/contracts/object-connections-view/tsconfig.json --pretty false
```

真实公开L6/React/已实现PropertiesPanel组合消费者及15个expect-error标记，仅核历史提案类型；本目录没有运行时组件，不算DOM/独立B冻结。C58接受/B58有限冻结后已进入生产组件/根出口/CSS和标准接线，实际验证见下方生产入口；覆盖两组partial、坐标、明确目标/整端点选择、借用生命周期、错误/旧动作、包消费及真实UI链，并回归旧PropertiesPanel。数据§6.20已获B57/C57接受，不重开原83/24/5或追加通用设施前置。完整M5、真实Electron和旧树51失败仍分账；工程加载/迁移因首版无持久化不适用。


## ObjectConnectionsView 生产门禁（DESIGN §6.21）

```sh
npm --prefix web run test:independent:m5:connections-view
npm --prefix web run test:independent:m5:connections-view:package
npm --prefix web run test:independent:m5:connections-view:controls
```

run-object-connections-view-tests.mjs原样运行B58冻结25eaddb：model为24严格类型负例和82浏览器（含1真实Core纵向），package为3新输入及原包前提，controls为4Node/1浏览器模型/1真实Core模型控制。固定本仓库生产/工具根、预检必需输入、原样传播失败/信号；HIER_BIN默认core/build/hier，可显式指定。三模式已接test:independent及check.sh，旧面板与树门禁保留。

公开入口@hier/views的ObjectConnectionsView/Props/Command/Failure，样式@hier/views/object-connections-view.css；借用已load的连接模型和同快照Selection。PropertiesPanel共用内部命令/原生按钮生命周期，须保留其69/30/3回归；不改变SDK、Schema或工程格式。生产自测结果及剩余原冻结问题见[生产计划](plans/M5-object-connections-view-production.md)，不以控制通过代UI验收。


## SearchModel 有限隔离契约（历史见证，DESIGN §6.22）

```sh
npm --prefix web run check
node web/node_modules/typescript/bin/tsc -p web/contracts/search/tsconfig.json --pretty false
HIER_BIN="$PWD/core/build/hier" node --test web/contracts/search/sdk-core-witness.test.mjs
```

历史提案位于web/contracts/search；C60接受/B60冻结后已有生产出口，以下旧见证不代生产门禁。消费者20个类型负例，真实SDK/Core五项能力见证覆盖六类命中、原分页、字面文本/空kinds/作用域、定义occurrence和对象路径；不把底层能力算新L6状态/取消/partial或UI验收。对应C审/B有限冻结后直接实现并接标准门禁，既有连接视图已获B59/C59有限接受。首版无持久化，旧工程加载/迁移不适用；真实Electron/完整M5和原树51仍分账。实际结果见[搜索计划](plans/M5-search-contract.md)。


## SearchModel 生产门禁（DESIGN §6.22）

```sh
npm --prefix web run test:independent:m5:search
HIER_BIN="$PWD/core/build/hier" npm --prefix web run test:independent:m5:search:core
HIER_BIN="$PWD/core/build/hier" npm --prefix web run test:independent:m5:search:controls
```

三入口先typecheck，run-search-tests.mjs固定当前仓库产品/工具根并预检必需输入；子进程失败/信号直接传播。model原样执行B60冻结1d33ae8的26严格类型负例与100模型场景；core执行4真实SDK/Node/Core模型场景；controls另列4受控SDK与1SDK/Core前提，不计模型通过。HIER_BIN默认core/build/hier，可覆盖。已接test:independent/check.sh，在保留51历史失败的树门禁之前运行。

@hier/viewmodel根新增SearchModel/SearchError及六个类型，借用ready客户端，显式load/loadMore/reload，保留原Reply和partial；不自动index.ready、选择/定位或加载定义实例。内部PagedQueryModel与候选模型共用原分页策略，QueryDataModel仍唯一管理任务；旧候选/导航/确认回归和三配置Core完整门禁继续执行。无IPC/Schema/ABI/工程文件变化、无依赖新增或持久化迁移；真实Electron/搜索UI/完整M5、跨平台/读屏另验。结果见[生产计划](plans/M5-search-runtime.md)。

SearchModel固定2e230d5已获B61独立100/26/4及旧分页回归通过、C61正式接受。A60完整门禁仍为exit1/旧树51，不因搜索有限接受改写。

## SearchResultsView历史有限契约（DESIGN §6.23）

```sh
npm --prefix web run check
node web/node_modules/typescript/bin/tsc -p web/contracts/search-results-view/tsconfig.json --pretty false
HIER_BIN="$PWD/core/build/hier" node --test web/contracts/search-results-view/model-selection-witness.test.mjs
HIER_BIN="$PWD/core/build/hier" node --test web/contracts/search/sdk-core-witness.test.mjs
```

隔离声明/宿主表单消费者包含18个类型负例；三个A实际SearchModel→Selection/SDK/Core见证覆盖原六类命中、明确分页保留原页与选择、定义地址保留及显式查询四occurrence。原五项SDK见证只抽取会话资源清理，共用原A fixture；B冻结不改。编译消费者不执行拟议组件，没有UI/DOM/CSS包/真实Electron验收；新契约对应C审/B有限冻结后直接生产。实际命令和类型逐项去指令证据见[视图计划](plans/M5-search-results-view-contract.md)。本纯契约/见证单元不重复无变更Core三配置/旧UI/全check.sh，保留历史结果与失败。

## SearchResultsView生产门禁（DESIGN §6.23）

```sh
npm --prefix web run test:independent:m5:search-results-view
npm --prefix web run test:independent:m5:search-results-view:package
HIER_BIN="$PWD/core/build/hier" npm --prefix web run test:independent:m5:search-results-view:controls
```

C62接受/B62冻结4f1c587后A62已新增@hier/views的SearchResultsView及Props/Command/Failure三个类型、search-results-view.css。借用同快照SearchModel/Selection，显示原query/pages/完整性，明确一页/重载/取消及对象或定义选择；数据与任务状态仍归L6。组件不隐式Core查询/实例选择/树定位，宿主原文本表单另拥有。

run-search-results-view-tests.mjs原样执行B84浏览器（含1真实Core链）/26生产类型、3包外输入与6控制；后者4 Node+1浏览器模型+1Core模型另账。共用run-view-contract-tests执行边界，固定本仓库根/原输入预检/退出传播，已接test:independent和check.sh；保留旧树门禁。HIER_BIN默认core/build/hier。共用view-commands抽取须保留旧面板69/30/3与连接视图82/24/3回归。实际结果见[生产计划](plans/M5-search-results-view-production.md)，生产独立接受不由A自测代签。无Core/IPC/Schema/工程格式/依赖变化；首版无持久化，旧工程迁移不适用；真实Electron/跨平台/读屏/完整M5另验。

## DefinitionInstancesModel 历史有限隔离契约（DESIGN §6.24）

```sh
npm --prefix web run check
node web/node_modules/typescript/bin/tsc -p web/contracts/definition-instances/tsconfig.json --pretty false
HIER_BIN="$PWD/core/build/hier" node --test web/contracts/definition-instances/sdk-core-witness.test.mjs
```

新隔离声明/消费者的 18 个类型负例只验证提案表达性，不进入生产 exports。四个真实能力见证复用原 A search fixture/session，执行已接受 SearchModel、SelectionModel、TreeModel 和原 SDK/Node/Core；覆盖两顶层的四 occurrence 原分页、明确选择后 reveal、单顶层仍保留定义、跨定义游标拒绝及预取消后会话可用。不是新模型运行时/候选 UI/执行中取消或真实 Electron 验收；partial 仅按现有机器登记核可达类型，实际 Core 页完整性如实记录。

对应新数据单元 C 审/B 有限冻结后直接实现，复用原分页任务与输入边界，不新增观察/堆/Q1类别。原 SearchResultsView 已获 B63/C63 独立接受；本纯契约单元不重跑无变更旧 UI、Core 三配置或完整 check.sh，保留 A62 exit1 和旧树 51 失败。实际结果见 [计划](plans/M5-definition-instances-contract.md)；首版无持久化，旧工程迁移不适用。


## DefinitionInstancesModel 生产门禁（DESIGN §6.24）

```sh
npm --prefix web run test:independent:m5:definition-instances
HIER_BIN="$PWD/core/build/hier" npm --prefix web run test:independent:m5:definition-instances:core
HIER_BIN="$PWD/core/build/hier" npm --prefix web run test:independent:m5:definition-instances:controls
```

C64契约接受/B64首冻86320dc后A64已实现@hier/viewmodel的DefinitionInstancesModel/Error及六个类型。原三入口先编译，run-definition-instances-tests固定当前产品/工具根并预检10个必需冻结输入，原样传播退出/信号；HIER_BIN默认本仓库core/build/hier，可显式覆盖。model执行原91模型/24生产类型，core执行原3真实模型/SDK/Node/Core链，controls另列4 Node与1SDK/Core前提；不把控制计为模型验收。均已接test:independent/check.sh，在保留51原失败的树门禁之前。

Search及新模型入口共用run-paged-model-tests；原Search模式/冻结输入不改。新模型直接使用现有QueryInput/readPageSize/PagedQueryModel/QueryDataModel；原页、五态、partial与取消由这些既有机制管理，无第二份实例索引或Selection。无Core/IPC/Schema/工程格式/依赖变化；首版无持久化，旧工程加载不适用。候选UI/宿主自动联动/真实Electron/完整M5另验，实际结果见[生产计划](plans/M5-definition-instances-runtime.md)。


## DefinitionInstancesView 历史有限隔离契约（DESIGN §6.25）

```sh
npm --prefix web run check
node web/node_modules/typescript/bin/tsc -p web/contracts/definition-instances-view/tsconfig.json --pretty false
HIER_BIN="$PWD/core/build/hier" node --test web/contracts/definition-instances-view/model-selection-witness.test.mjs
```

18个类型负例及宿主组合使用生产DefinitionInstancesModel/SelectionModel/SearchResultsView；拟议新视图仍为隔离声明，不进入生产根或标准组件门禁。两个真实模型/SDK/Node/Core见证复用原A search fixture/session，覆盖多occurrence原分页、明确选择后宿主reveal、单实例仍保持定义选择及共享会话存活。它们不执行新UI、不代B冻结或DOM/CSS包/partial/执行中取消/真实Electron验收。实际命令见[计划](plans/M5-definition-instances-view-contract.md)。

前序数据模型固定3ed5a75已获B65/C65生产接受；新视图对应有限C审/B冻结后直接实现与标准接线，不增加观察/堆/Q1前置。本契约单元不重跑无变更Core三配置/旧UI/完整check.sh，A64旧树51及历史能力红保持；首版无持久化，旧工程加载不适用。


## DefinitionInstancesView 生产门禁（DESIGN §6.25）

```sh
npm --prefix web run test:independent:m5:definition-instances-view
npm --prefix web run test:independent:m5:definition-instances-view:package
HIER_BIN="$PWD/core/build/hier" npm --prefix web run test:independent:m5:definition-instances-view:controls
```

C66契约接受/B66首冻86701675后A66已实现@hier/views根DefinitionInstancesView及Props/Command/Failure、definition-instances-view.css。视图借用同快照模型/Selection，展示原query/实例页/完整性并转发明确分页、取消、重载和实例ref选择；不自动选第一项或查询，Core/L6保持事实与任务所有权。

run-definition-instances-view-tests复用原runViewContractTests，固定当前根/工具、预检10个必需输入、传播非零/信号；model原26生产类型及84浏览器含1真实Core链，package原3实际tarball输入，controls为4Node/1浏览器模型/1Core模型，控制另账不充UI。三入口已接test:independent/check.sh，HIER_BIN默认core/build/hier，旧树门禁保持。

共有PagedResults和paged-result-actions从SearchResultsView纯提取，原搜索84/26/3与控制回归；useViewCommands/useInspectorButtons及L6不改。无新生产依赖或IPC/Schema/Core ABI/工程格式变化，旧CSS/React peer保持。完整测试证据、限制与固定交付见[生产计划](plans/M5-definition-instances-view-production.md)。首版无持久化、旧工程加载不适用；真实Electron/自动宿主协调/读屏/跨平台/完整M5仍另验。


## 路径定位模型与结果视图有限隔离契约（DESIGN §6.26）

```sh
npm --prefix web run check
node web/node_modules/typescript/bin/tsc -p web/contracts/path-resolution/tsconfig.json --pretty false
HIER_BIN="$PWD/core/build/hier" node --test --test-reporter=tap web/contracts/path-resolution/sdk-core-witness.test.mjs
```

模型与结果视图的声明/宿主消费者同一有限单元交审；26个类型负例只验证提案表达性。四条真实已有SDK/Core能力见证复用原A search fixture/session，覆盖多顶层同名端口/信号、原文本转义终止空白/generate语法、明确对象选择后宿主reveal及空结果/错误/预取消。实际页为complete，不执行拟议PathResolutionModel/View、不代B oracle/DOM/包或真实Electron验收。对应C审/B有限冻结后直接实施两者及既有标准门禁，不另开观察/堆/Q1前置；详情见[计划](plans/M5-path-resolution-contract.md)。

### M5 路径定位模型与结果视图生产

按 B68 原冻结，通过现有公共包 runner 执行整个单元：

```sh
npm --prefix web run test:independent:m5:path-resolution
npm --prefix web run test:independent:m5:path-resolution:package
npm --prefix web run test:independent:m5:path-resolution:controls
```

分别包含40生产类型/83浏览器/58模型、3外部包、原6基础与模型控制及A的7实际Core文本/兼容回归。接入test:independent和check.sh，原失败非零传播；A回归不增加B通过数。初始六项first缺导入和已释放SDK快照契约冲突保留原输入/失败，见路径生产计划；未变更SDK以迎合新预期。真实Electron/宿主表单、读屏/跨平台和完整M5不由本单元代验。

### 子进程私有文本通道（DESIGN §6.8.3）

```sh
npm --prefix web run check
npm --prefix web run test:client
HIER_BIN="$PWD/core/build/hier" npm --prefix web run test:independent:m4
HIER_BIN="$PWD/core/build/hier" npm --prefix web run test:core
```

A70将Node实现原样提取后，为同一子进程所有者增加私有原文本投影/发送入口。原公共Node入口、renderer与package exports保持；FrameInbox只增加默认unknown的泛型，NdjsonReader在原解码处额外传出文本，原探针调用兼容。

test:client的既有文件匹配自动覆盖process-text.test.mjs的8项A回归；test:core的既有集成文件新增1项真实Core→原文本→克隆字符串→重新解码→SDK的roots/children往返。它们已由现有check.sh执行，不新增第二套入口；文本往返不是Electron/contextBridge验证。原M4冻结、renderer回归、格式和完整门禁的实际结果见[执行计划](plans/M5-process-text-transport.md)。main/preload仍按既有§6.8另行冻结与实现。

## M5 Electron 宿主标准门禁（A71）

`npm --prefix web run install:electron`显式安装已锁定42.3.3二进制；类型安装不算运行时。
`test:independent:m5:electron-host`执行B原类型16、main25、preload10、文本15和设施3；
`:core`执行原文本Core1；`:e2e`先核实际Electron版本，再执行B原sandbox/contextBridge/SDK/Core链。
三者已接入check.sh和test:independent，不因缺运行时/能力/显示环境自动skip。
普通依赖输入单元不能代替Electron。A72原样导入B72的启动/退出修订后，E2E核对完整查询、
隔离配置、实际版本及await exited后的同步完成报告；空输出exit0也失败。历史红及本轮结果见生产计划和REVIEW_LOG。
旧tree原红保留，未执行的后续阶段不算通过。旧工程加载不适用（本版无持久化）。

## 固定布局 demo 的有限隔离契约（DESIGN §6.27）

```sh
node web/node_modules/typescript/bin/tsc -p web/contracts/demo-shell/tsconfig.json --pretty false
HIER_BIN="$PWD/core/build/hier" node --test --test-reporter=tap web/contracts/demo-shell/core-composition.test.mjs
```

严格类型消费者使用八个真实生产视图与同一组 L6 模型，12个负例限定 app 私有控制桥的能力。
source/filelist 两项见证运行已有 SDK/Node/Core→树/选择/属性/源码/搜索/路径/定义实例与关闭，
不执行新 demo 控制器/IPC 或 UI，也不代 B oracle。
对应有限 C 审/B 冻结后实现 app，沿原标准门禁验收真实 Electron UI。

## M5 固定布局 demo 生产入口（A73）

```sh
npm --prefix web run build:demo
HIER_BIN="$PWD/core/build/hier" npm --prefix web run test:independent:m5:demo
npm --prefix web run demo
```

主进程与 renderer 分别严格编译，renderer 无 Node ambient types；esbuild 分别生成
main、sandbox preload 与 browser 产物，核外部依赖、React 单实例和零构建警告。
测试入口接 B73 原 20 类型、3 设施、2 Core 输入控制及 25 真实 Electron 场景，
并纳入 `check.sh` / `test:independent`。A74 原样导入 B74 启动/DOM 绑定及
C-103 单条 DR01 回归，既有入口自动执行 25+1；DC12 的旧回复观察阻塞继续
导致非零退出，不计通过或 skip。DQ01–04 保留独立覆盖缺口。
原冻结驱动的启动/DOM 绑定问题与实际失败见 REVIEW_LOG；A 私有诊断绑定不算 B 验收，
不改写失败或把测试进程退出当成通过。首版无工程文件持久化/迁移。

### M5 包外 demo 交付（A75）

```sh
npm --prefix web run pack:demo -- --output /absolute/new-demo-directory
cd /absolute/new-demo-directory
HIER_BIN=/absolute/path/to/hier npm start
```

输出必须新建且在仓库外。四包以真正 tarball 安装，继承原第三方锁版本，
独立严格 TS 和同一 app 构建；`delivery.json`、`dependencies.json` 与输出锁
记录实际输入/产物/解析树。当前平台的 Electron 运行时安装使用原官方脚本，
Core 与设计仍是显式外部输入。详见[执行计划](plans/M5-demo-package.md)及 app README。
A76 打包从独占暂存源码编译，排除共享 dist/增量缓存，交付成功移除暂存。
标准 demo runner 先执行 A 的4项打包回归（原3项输出保护及私有过时输出回归），
再执行不变的 B 类型/控制/26场景；
A 回归不增算 B 通过数，原 DC12 仍令整体退出1。

B77 的 `web/tests/independent-demo-shell/package-source-regression.mjs` 为显式
opt-in 的一例独立 C-104 回归。执行时提供三个绝对环境值：
HIER_B_PACK_PRODUCT（固定产品 git 根）、HIER_B_PACK_TEMP_PARENT（自有临时父目录）、
HIER_B_NPM_CLI（实际 npm CLI）。它只在私有 archive 副本注入输入，保留坏/好包；
不加入原默认26。实际旧红新绿和初始 archive 准备阻塞见 B 的包验证计划及 REVIEW_LOG。

### M6 来源契约能力验证（A77，非生产运行时）

```sh
node web/node_modules/typescript/bin/tsc -p web/contracts/graph-session/tsconfig.json --pretty false
HIER_BIN="$PWD/core/build/hier" node --test web/contracts/graph-session/sdk-core-witness.test.mjs
```

严格编译仅核隔离接口与宿主表达；两条能力见证运行已有 SDK/Core，
核共享规范身份、自闭合端点/原位段、实际 partial 和预取消后继续查询。
明确不执行拟议 GraphSession，不代来源替换、晚回复、布局、UI 或 B 独立验收；
此历史能力入口不导出实验运行时；生产入口见下段。

### M6 GraphSession 来源运行时（A79，待 B/C 独立复验）

```sh
HIER_BIN="$PWD/core/build/hier" npm --prefix web run test:independent:m6:graph
npm --prefix web run test:viewmodel
```

标准脚本固定使用当前 checkout，先检生产根声明原20输入，再运行 B 原24场景及1输入控制，
不回退隔离 proposal。G24 实际执行 SDK/Core → GraphSession，独立 input 控制本身不执行模型，
两者分账。命令已接入 test:independent 与 check.sh，不更改 B 的 fixture/oracle。
A 的 graph-lifecycle 四条回归进入既有 test:viewmodel：诊断/通知释放、原错误保留、
提供者自撤回、共享扩展只读复制与循环拒绝。没有 Worker/浏览器或布局能力声明。
实际命令、结果及范围见 [生产计划](plans/M6-graph-source-runtime.md)。

### M6 C-105 定向回归（B80 单例，opt-in）

```sh
HIER_B_PRODUCT_ROOT="$PWD" node web/tests/independent-graph-session/c105.mjs
```

当前公开包须先完成 `npm --prefix web run typecheck`。此G25保持B原单例：相等共享无环
扩展及第一/第二分支不等控制，失败保持原state/owners。不改变原24/20/1标准计数；
20秒是测试自有worker安全guard，不是产品性能SLA。B原基线红、A定向修复及实际结果
见来源生产计划和REVIEW_LOG，C-105由C复核关闭。


### M6 LayoutService / ELK Worker（A83，待 B/C 生产复验）

```sh
HIER_BIN="$PWD/core/build/hier" npm --prefix web run test:independent:m6:layout
npm --prefix web run test:viewmodel
```

标准入口固定当前checkout，先核生产根20类型输入，再跑B原22运行场景，最后打包到
仓库外安装并运行原生classic Worker/CSP链；不回退proposal，不改B oracle。
L22实际SDK/Core→GraphSession，P01实际ELK算法/URL装载分账，受控消息不冒充算法。
入口已接入test:independent与check.sh。A另有4条清理重入/异常原因/构造选项回归，进入test:viewmodel。

`typecheck`的既有声明构建后复制精确elkjs0.12.0原版资源与许可到
`@hier/viewmodel/dist/elk-worker.min.js`和`dist/ELK-LICENSE.md`；宿主把Worker发布到
明确URL，再传入`workerFactory: () => new Worker(url)`与必填timeoutMs。
不在模块导入时读取Worker全局、不提供主线程布局回退；公共输入/状态以DESIGN §6.29为准。
包外链含原资源字节比对、无Worker全局导入、加载失败/错误/超时/取消/重试/释放。
真实运行命令、未执行范围和已知环境限制见[生产计划](plans/M6-layout-runtime.md)。

## M6 首版扁平投影与 SchematicView（A87）

```sh
npm --prefix web run test:independent:m6:schematic
```

入口固定当前 checkout，构建生产声明后执行 B87 原 20 类型、12 模型、1 原生 Worker 输入控制和
16 浏览器语义集合；不回退 proposal，失败原样非零。已接 test:independent / check.sh。
真实键盘、旧任务/旧 DOM、借用挂卸、错误回调及来源/事实详情都由既有冻结执行。
当前首版无自动 Core 查询、折叠、标注或持久化；此入口不代后续组合 demo、包外视图消费或完整 M6。
实际范围、历史失败与回归见[生产计划](plans/M6-schematic-view-runtime.md)。

### M6 共享对象标注

```sh
npm --prefix web run test:independent:m6:annotations
```

先构建生产声明，`run-annotation-tests.mjs`固定当前产品/工具根，原样执行B90冻结的
20类型、22模型、1原生ELK旧模型输入控制、10浏览器用例，失败/信号直接传播。
已接`test:independent`/`check.sh`，无proposal运行时回退，不修改原树/图oracle。
标注按对象精确匹配，两个视图借用同层，只更新呈现；Core/SDK/IPC/Schema/工程格式无变动。
新增可选Props/根符号为兼容添加；原A88编译入口现转发真实公开类型，保留18个类型见证。
旧树门禁的历史失败和实际对照、Core/集成/构建结果见[标注计划](plans/M6-annotation-contract.md)，
不将新标注集合通过称为完整M6或折叠/组合demo/包外消费通过。

### M6 折叠投影与原成员反查

```sh
npm --prefix web run test:independent:m6:fold
node web/node_modules/typescript/bin/tsc -p web/contracts/fold-projection/tsconfig.json --pretty false
```

首命令构建真实包声明，由`run-fold-projection-tests.mjs`固定当前产品根，原样执行B93最终冻结的
20严格类型、24模型/选择/标注运行时和1合法输入控制；失败/信号非零，不回退`--proposal`。
已接`test:independent`/`check.sh`。第二命令验证原18个编译消费者见证，隔离声明已转发公开根；
不是第二份运行时或B oracle。旧平铺投影回归继续使用原`test:independent:m6:schematic`。
本单元只新增L6符号；布局、折叠UI、投影/布局代次围栏及原生ELK展开恢复尚待后续接入。
实际命令、历史失败和范围见[折叠执行计划](plans/M6-fold-projection.md)，不据纯L6通过宣布A17/完整M6完成。

### M6 折叠布局与原 SchematicView（A97）

```sh
npm --prefix web run test:independent:m6:fold-layout-view
node web/node_modules/typescript/bin/tsc -p web/contracts/fold-layout-view/tsconfig.json --pretty false
```

前者构建真实产品，`run-fold-layout-view-tests.mjs`固定本产品/工具根，原样执行B97
0f94dc2的24类型、12模型、12DOM、1原生ELK展开恢复和1原输入控制；无proposal回退。
五项均执行并汇总失败退出，保留原捕获；已接入check.sh和独立总入口，不跳过已知红项。
后者的历史A消费者已转发真实根，23处见证不是B oracle。
实际结果、保留失败及B/C交接见[纵向实施计划](plans/M6-fold-layout-view.md)。
这套入口不代替A-04c组合demo/包外视图消费、完整M6或旧树历史51红的修复。


### M7 连接查询事实快照（A回归）

三配置标准CTest新增`a_m7_connection_snapshot`（229断言/4案例）：现有FakeFrontend核cache0/小预算/淘汰、
BodyId提取计数、共享发生位置/无体/primitive、不可变租约释放与确定性取消重试；真实Design API核四预算×两共享模式。
`a_m7_connection_query_dump`是测试专用公开C++消费者，不是生产API；以同源同编译/链接参数连接旧新库，
112完整查询双流/exit对照，另226CLI（原221前缀保持）/203完整L1（原列表保持）/40CLI原样回归。
实际三配置94/97/99、23形状138 fresh配对、原规模/打包及旧DC12/树51边界见
[计划](plans/M7-connection-snapshot.md)和[证据](evidence/m7-connection-snapshot-2026-10-29.md)。
Walk快照内每个访问BodyId一次取得所有权；入口对象校验仍可先提取一次，不声称整次API一次。
elapsed含打开/查询/序列化/捕获、排除证据写入，与上一单元度量不同；A新回归不代独立B oracle。


### M7 过程分析匹配（A回归）

三配置标准CTest新增`a_m7_procedure_analysis_lookup`（18627断言/3案例）及`a_m7_procedure_analysis_facts`（2项）。
前者以原线性匹配独立对照完整签名/直接优先/最后匹配、按需构建及异常重试，元数据fixture不冒作Slang语义oracle；
后者通过既有完整L1 adapter核32生成块、连续/过程源、两层/非代表父实例子树的逐bit手写依赖、来源与真实Slang计数。
原203 L1前缀保留，扩展211；原226 CLI/112公开C++整列表和40CLI保持。三配置96/99/101、实际命令/配对与原规模
见[计划](plans/M7-procedure-analysis-lookup.md)和[证据](evidence/m7-procedure-analysis-lookup-2026-10-29.md)。
不更换Slang oracle/覆盖/分配器或减少独立校验；新A回归不代B独立oracle，整体验收与旧失败分账。


### M7 表达式写目标投影（A回归）

三配置CTest新增`a_m7_expression_target_projection`（156778断言/3案例）与`a_m7_expression_target_facts`（2项）。
原线性投影独立对照原片段次序/capacity、跨ref/同ref/重复/长重叠/阈值/uint64边界，32768反序目标核准确裁剪。
真实L1核64位全排列及64不同二位目标的绝对RHS from/to/width、mapped、依赖、共享/逐实例与Slang计数。
原211 L1前缀扩217；原226CLI前缀扩230（新增proc公开映射流），112公开C++整列表及40CLI保持。
三配置98/101/103及实际命令/原值/限制见[计划](plans/M7-expression-target-projection.md)和
[证据](evidence/m7-expression-target-projection-2026-10-29.md)。新A回归不代独立B oracle；旧失败/整体验收分账。


### M7 分析代表父槽位路由（A回归）

三配置新增`a_m7_analysis_slot_routing`（实际Slang AST101断言/3例）、`a_m7_analysis_routing_order`（公开Frontend214断言/1例）及`a_m7_analysis_slot_facts`（共享/逐实例2项）。
核数组/generate/primitive占位、首有效/自对应/短代表、最近父对切换/失败重试；新Frontend正/逆/固定打乱完整事实/来源/计数/estimatedBytes不变。
混合RTL独立手写ref/not位映射/Dep和Slang对照，原217 L1/230CLI前缀扩223/238（新增第二父实例四proc×两模式）；112公开C++整列表及40CLI保持。
三配置101/104/106、34定向及实际命令/原值/限制见[计划](plans/M7-analysis-slot-routing.md)与[证据](evidence/m7-analysis-slot-routing-2026-10-29.md)。
新A回归不替独立B oracle；collector抛错不等于真实全局分配故障注入，旧失败及整体验收分账。


### M7 无体实例端口归并（A回归）

三配置新增`a_m7_occurrence_ports`，182909断言/3例。独立原线性全流核两路径阈值/重复/错引用/反序/空/primitive；32768pins/65536绑定核覆盖和输出拥有值。
真实命名/位置空引脚、库/无库×共享/逐实例×cache0/1/64MiB，公开ports与ConnectionSnapshot相同，手写width/direction/attrs/ref及预取消重试。
原223 L1/238CLI前缀扩229/254；112 C++整列表/40CLI保持。三配置102/105/107及实际命令/原件/限制见[计划](plans/M7-occurrence-port-join.md)和[证据](evidence/m7-occurrence-port-join-2026-10-29.md)。
新A只记A编写/执行归属，不替B独立oracle；准备/编译失败及旧DC12/树51保持，预取消不冒充运行中硬SLA。


### M7 连接索引寄存器边界归并（A回归）

三配置新增`a_m7_register_partitions`，101785断言/4例。原线性参考独立核全部切点/原组首项/遮蔽边界/重复/空洞/uint64边界及wrap；32768寄存器逐写手写段/空洞。
回调检查点取消和emit抛错后重试，真实两层RTL shared/per-instance×cache0/1/128/64MiB核register/map、独立clock/data hop及预取消/重试。
原229 L1/254CLI前缀扩235/266，新增双向step实际触发索引；112 C++连接查询为控制，40CLI保持。三配置103/106/108及命令/原件/限制见[计划](plans/M7-register-partitions.md)与[证据](evidence/m7-register-partitions-2026-10-29.md)。
A首败/测试预期纠正记录保留，不替B oracle、不改生产Werror/历史失败；回调取消不冒充任意运行中硬SLA。


### M7 寄存器分页按页物化（A回归）

三配置新增`a_m7_register_pages`，53198断言/4例。共用旧offset游标窗口、原全量DFS参考核逐页/变大小/别名/EOF/无体/重复与页外partial原因。
既有Frontend接口停点核页外提取失败/取消优先于无效page与重试，真实两层RTL shared/per-instance×cache0/1/128/64MiB取完64行并手写全部寄存器身份/位段/clock。
原235 L1/266CLI前缀扩237/302，新增千/十万首尾/EOF/越界/非递归；112公开C++连接查询是控制，新分页由API/CLI覆盖。
三配置104/107/109及实际命令/原件/边界见[计划](plans/M7-register-pages.md)与[证据](evidence/m7-register-pages-2026-10-29.md)。
无效单十万数组/测试编译首败及旧失败保留；新A不代B oracle，完整原因/事实成本不作硬内存保证，预取消/Frontend停点不作任意硬取消SLA。


### 2026-10-29 / cycle174 搜索候选按需投影

生产e82815d427b67b1efccb61ba816b0ccf5f76c578，纯重构244c847a22e6987683f0de34eed91ea09b531afb；[计划](plans/M7-search-projection.md)、[完整证据/命令/原值/失败](evidence/m7-search-projection-2026-10-29.md)。
`core/build/tests/m7/a_m7_search_projection`新增77656断言/3例；相关CTest41项和三完整Core105/108/110通过，C++warning0。
初/终346CLI/237L1/112 C++及原40CLI完整双流/exit相同；原302查询前缀/19模型保持，48形状288fresh进程含新415/40015搜索候选。
`caffeinate -disu bash ./check.sh`exit1，前76阶段通过，第77仍原DC12 25过1阻塞；树89过/51原失败ID顺序保持。原两8GiB完整sharing/12真实设计、demo与包外各10/打包通过。
A构建含保护WIP，非clean HEAD；性能为含打开/分析/输出/pipe的三样本，非纯search/OS隔离/SLA。B17/C18仅验原7f45407，新单元待独立B/C。


### 2026-10-29 / cycle174 第2/3：连接引用索引

生产583d1085d8afa572534eb165cc352cb2f303be8a；[计划](plans/M7-connection-references.md)、[实际命令/证据/原值/首败](evidence/m7-connection-references-2026-10-29.md)。
`core/build/tests/m7/a_m7_connection_references`13008断言/5例，相关CTest53项/三完整Core106/109/111通过，C++warning0。
初/终382CLI/239L1/176 C++及原40CLI完整双流/exit同；原346/237/112前缀/20回归文件保持。53形状318fresh进程含16/100/1000跨层桥接；时间含打开/分析/输出/pipe，非纯查询/SLA。
`caffeinate -disu bash ./check.sh`exit1，前76阶段过，第77仍DC12 25过1阻塞；树89过/51原失败ID顺序同。原两8GiB/12真实设计、demo与包外各10/打包通过。
25保护文件/3872输入/日志前缀保持；A构建含原WIP非clean HEAD，局部索引仍有内存成本。搜索与本单元待本批B/C，最新B17/C18只归原7f45407。


### 2026-10-29 / cycle174 第3/3：实例描述路径复用

纯提取d00430c551f58a4f16e8684adc2a5195223efc1d、生产8d6f13f3004eeffee0e9b058191dc94d022c1491；[计划](plans/M7-instance-descriptions.md)、[实际命令/证据/原值/首败](evidence/m7-instance-descriptions-2026-10-29.md)。
`core/build/tests/m7/a_m7_instance_descriptions`10302断言/3例，相关CTest47项/三完整Core107/110/112通过，C++warning0。
初/终430CLI/241L1/176 C++/原40CLI双流/exit同，原382/239前缀/176整列表/21旧回归保持；63形状378fresh进程含24层链下千/十万叶。
`caffeinate -disu bash ./check.sh`exit1，前76阶段过，第77仍DC12 25过1阻塞；树89过/51原失败ID顺序同。两原8GiB/12真实设计、demo与包外各10/打包通过。
A构建含保护WIP非clean HEAD；首败3项父key/完整目标错误已原DB退路修正，不改期望。三样本含打开/分析/输出/pipe非纯描述/SLA，跨平台等边界列报告。本批三生产单元待统一B/C，最新B17/C18只归7f45407。


### 2026-10-29 / cycle175：筛选信号分页工作集

纯提取0dc13e6cf4914c92fb8fbba26b723374fd9181de，生产c99ae15ac2da1f8660e558ed03ac0aff011ac1f4；[计划](plans/M7-signal-pages.md)、[实际命令/证据/原值/限制](evidence/m7-signal-pages-2026-10-29.md)。
三配置新增 `a_m7_signal_pages`（112834断言/3例）：原全匹配参考/literal游标独立对照、重复/NUL/UTF8/空/EOF/错误优先级、Frontend取消重试、十万行尾与拥有值；真实RTL shared/per×四cache。
`HIER_BIN="$PWD/core/build/hier" node --test web/tests/integration/signal-pages.test.mjs` 两条真实SDK/Core回归，经原test:core glob进入check.sh；原4例保持，新2例本轮标准亦执行。
32组完整公开C++筛选对照、430原CLI/40CLI兼容控制相同；CLI没有filter选项，不能把控制作筛选覆盖。三Core108/111/113、标准前76阶段过，第77仍DC12 25过1阻塞/整体exit1；树51原失败顺序同。
20fresh Core/每侧1410终态同，5进程×20热查询中位约11ms基本持平，含协议/pipe/帧处理；A构建含原WIP，非clean构建/独立B数据。两原8GiB/12真实设计/演示/包外/打包与未覆盖范围列证据。


### 2026-10-29 / cycle175 第2/3：路径候选匹配

生产1b5e7b1d3040309894f6c874edc547b611e04dab；[计划](plans/M7-path-matching.md)、[实际命令/失败/原值/边界](evidence/m7-path-matching-2026-10-29.md)。
三配置新增 `a_m7_path_matching`（375462断言/4例）：原构造器语法自比+手写KAT、原完整物化算法对照、多top/generate/转义/多维负下标/重复/无体、原错误/取消与拥有值；自比不替B语法oracle。
`HIER_BIN="$PWD/core/build/hier" node --test web/tests/integration/path-matching.test.mjs web/tests/integration/signal-pages.test.mjs` 原test:core glob接线，路径2+前信号2通过；标准实际执行原4+信号2+路径2。
49定向、初/终466CLI（原430前缀）/40CLI、32前信号C++控制同，三Core109/112/114过。标准首轮第36原npm pack超时、原目标重跑通过及原尾段41阶段续跑分账，仍DC12 exit1/树51原失败，不称单次标准绿。
12形状120fresh CLI含打开/分析/查询/输出/time wrapper，非纯Core/硬资源保证；小例/整进程RSS退化原值保留。原两8GiB/12真实设计/演示/包外/打包通过；A构建含原WIP，不作clean固定源码或独立B证据。


### 2026-10-29 / cycle175 第3/3：源码范围窗口与子 occurrence 投影

生产7340bacd1cbfabfb66598342fce59c104e04e872；[计划](plans/M7-source-range-window.md)、[实际命令/失败/原值/边界](evidence/m7-source-range-window-2026-10-29.md)。
新增 `a_m7_source_range_window` 最终11508断言/3例，原扫描/完整key算法在同DB核字面游标与全部字段，重叠/跨文件/CRLF/空/EOF/非法游标/取消/重试/拥有值。先前A临时字符串借用夹具首次Debug失败，修复5de28c6并加固定行数断言；保留首次失败，B原集合未改。三Core完整110/113/115过、C++warning0。
`node --test web/tests/integration/source-range-window.test.mjs web/tests/integration/path-matching.test.mjs web/tests/integration/signal-pages.test.mjs` 新源码2+前路径2+信号2；原test:core glob标准实际原4+本批6。474完整CLI（原466前缀）/8公开C++组合（只归一化每快照opaque token，原始页保留）/40原CLI同。
完整标准重跑77阶段末项仍DC12 exit1，树51原失败保持。24fresh/600次公开方法热查询排除序列化/首次索引，cold/完整进程RSS/退化另列，child准备页count+1非limit1首屏；无全查询硬资源/SLA保证。原两8GiB/12真实设计/演示/包外/打包通过；A三构建含原WIP，不作clean固定源码或独立B证据。首版无持久化迁移，旧dft-suite完整构建未执行。


### 2026-10-29 / cycle176：实例属性按需投影

生产5143f4ce8cb38d130f128f3501e7141b3e67ba77；[计划](plans/M7-instance-properties.md)、[实际命令/失败/原值/边界](evidence/m7-instance-properties-2026-10-29.md)。
新增 `a_m7_instance_property_queries` 65279断言/2例：同DB原查询全字段、顶层/共享覆盖、NUL/重复/空/转义、五类对象/非法和alias、无体provider读取次数/失败/取消优先级/重试/拥有值；A兼容参考不代B独立oracle。三Core111/114/116全过、C++warning0。
真实SDK属性2+前批6共8通过，原test:core glob标准原4+前批6+新2=12；506完整CLI（原474前缀）、16完整原库公开消费者/40CLI同。原Schema拒绝旧版本/IPC/E2E与构建执行，完整check.sh仍原DC12 exit1，树51原失败保持。
24fresh/600次热公开Core方法调用排除序列化/KAT/输出/open/首次提取，cold及整进程RSS/退化分列，非硬资源/SLA；原两8GiB/12真实设计/演示/包外/打包通过。首个consumer编译错误、native目标未配置、SDK漏HIER_BIN等设施首败保留。A三构建含原WIP，非clean固定源码；首版无持久化迁移，旧dft-suite完整构建未执行。


### 2026-10-29 / cycle176 第2/3：连接覆盖树线性归并

生产864f32f01f1d0c718de995556216c134d96ff7bc；[计划](plans/M7-connection-coverage.md)、[实际命令/失败/原值/边界](evidence/m7-connection-coverage-2026-10-29.md)。
新增 `a_m7_connection_coverage` 123439断言/3例：旧完整builder/3000范围对、无序/零宽/uint64旧算术、Entry/全部coverage/绑定/寄存器切分/partial原因、线性seek/容量差额/拥有值/取消重试；A兼容参考不代B独立oracle。三Core112/115/117过，C++warning0。
真实SDK覆盖2+前8共10，标准test:core原4+前8+新2共14；531完整CLI（原506前缀）、24完整旧库/新库消费者（只归一化opaque cursor、原页保留）/40CLI同。新增CLI初稿3nonce不能直接跨快照比较，完整失败/534初稿保留，未改原506/B预期；SDK误用process/expr.kind及未用测试helper Werror首败分账。
24fresh/24首+600热step的signals准备/首方法/热方法/整进程RSS分列，512MiB缓存只用于对照，不改产品预算；十万写重复于8192位总线/4096稀疏坐标，不冒作十万互异区间。实际capacity/估算可减少、物理cache可变化，不作硬资源/SLA。原两8GiB/12真实设计/演示/包外/打包通过，完整标准仍DC12 exit1/树51原失败；三A构建含原WIP，非clean固定源码，首版迁移不适用。


### 2026-10-29 / cycle176 第3/3：查询partial原因汇总

生产9c23e6a94d6031aef9d73651c42080771c879300；[计划](plans/M7-partial-reasons.md)、[实际命令/失败/原值/边界](evidence/m7-partial-reasons-2026-10-29.md)。
新增a_m7_partial_reasons 113996断言/3例，完整旧线性参考/原重复detail/NUL空值大小写/8192增长/取消不发布与同对象重试；A兼容参考非B oracle。SDK shared/per两实例40黑盒的完整原因顺序、drivers/loads/step真实分页/cone/预取消/拥有值，标准Core SDK累计16例。53定向、547完整CLI原531前缀与32完整旧库公开消费者同，三Core113/116/118通过、C++warning0。
完整check.sh仍末项DC12 exit1，树51旧失败保持；原两8GiB/12真实设计/演示/包外/打包通过。24fresh/24首+120热公开查询，准备/方法/整进程RSS分列，512MiB仅测量，保留退化/首败，不作硬资源或SLA。三A构建含原TraceGraph WIP非clean固定源码，933旧测试不变/CMake仅增A目标；首版无持久化迁移，旧dft-suite完整构建未执行。


### 2026-10-29 / cycle177：C-M7-03公开step取消边界

生产fc1d91c441447afe3d264e08780d75baa77884ab；[计划](plans/M7-step-cancel-boundary.md)、[实际命令/首败/边界](evidence/m7-step-cancel-boundary-2026-10-29.md)。B52d8d60最小冻结原样导入，原完整Debug修前exit42/四配置Error逃逸，修后72断言/1例绿；A真实worker修前SIGABRT(-6)，修后489/3覆盖公开step/cone/paths/Dispatch cancelled、失败anchors、真实worker取消/排队roots/同会话重试和释放。Debug/ASan两完整配置均运行B72/A489，优化OFF不编入私有停点；不把A执行当B验收，也不冒称外部serve/UI崩溃注入。
三Core113/118/120、547CLI/32完整原库公开消费者/40CLI、SDK16、原两8GiB/12真实设计/演示/包外/打包过；完整check.sh仍DC12 exit1/树51旧失败。C++warning0，原Apple ld提示分列；A初编译signedness/const unique_ptr错误只修A测试、首稿/双流保留。A构建含原TraceGraph WIP非clean固定源码，935旧测试不变/两CMake仅接线，首版迁移不适用；C-M7-03保持Open待C复核关闭。


### 2026-10-29 / cycle177第2/3：递归寄存器遍历工作集

生产176f03102d49e6c70d6bfdac47744a0d2f1bc2cb、纯提取5abf076f5b28df9239b8159bcc8647ba2c63ac4c、EOF空白修正e85b5ff26878ddbb1c360c2fe148cddffb845529；[计划](plans/M7-register-traversal.md)、[实际命令/数据/首败](evidence/m7-register-traversal-2026-10-29.md)。新a_m7_register_traversal2802/3覆盖原查询完整对照/页外错误取消/重复原因/拥有值及32768合成深度（不作Slang深度承诺）；真实SDK2过，原test:core自动发现18/18；567CLI含原547不变前缀、16完整原库消费者fresh逐字同。
三Core114/119/121、原寄存器53198/4和C03 B72/A489保持，C++warning0；24实际RTL规模进程24首+72热、另8全量值进程核同，原两8GiB/12真实设计/demo包外各10/打包过。check.sh77阶段仍DC12 exit1/树51旧失败，未称整体绿；A误填top与EOF check首败保留，门禁启动于生产提交/EOF修正后另强制三配置重编译运行最终新native。含原TraceGraph WIP非clean固定源码，不代B/C验收/C关闭权；首版迁移不适用，未跑Linux/远端CI/旧dft-suite完整构建。


### 2026-10-29 / cycle177第3/3：源码哈希工作集

生产4972b2e2919ef2184e11862d564843bf176401e7、纯提取7e74d74d6b298ed79198bbd1437d8b0f8b230e71；[计划](plans/M7-source-hashing.md)、[实际命令/数据/首败](evidence/m7-source-hashing-2026-10-29.md)。a_m7_source_hashing343033/3：独立SHA KAT/分片和尾块、原完整metadata编码/重复路径/库/完整性、实际文件跨64KiB/缺失/目录/取消；目录原ifstream在macOS成功为空，A错误假设首败42保留，仅修新测试比较原行为，不改B预期。真实SDK2、标准Core SDK20、567原CLI和8完整旧库消费者（只归一化snapshotId/openedAt，inputHash全比）通过。
三Core115/120/122、前C03 B72/A489和寄存器2802/53198保持，C++warning0。18公开Core真实大文件进程18首+54热、原两8GiB/12真实设计/demo包外各10/打包通过；完整标准仍DC12 exit1/树51旧失败，未称整体绿。A构建含原TraceGraph WIP非clean固定源码，942原测试及保护保持；原公开头/协议/默认预算/工程格式不变，迁移不适用，未跑Linux/远端CI/旧dft-suite完整构建。C-M7-03仍Open待C定向关闭，本批三单元待协调器统一B/C，A不启动等待其turn。


### 2026-10-29 / cycle178：源码UTF-8校验

生产66f415bdb85931a7d34777c57318721c9df9d120、纯提取a4ce58016b2f5c85c83992d9d2d1d35c95a61798；[计划](plans/M7-source-utf8.md)、[实际命令/数据/边界](evidence/m7-source-utf8-2026-10-29.md)。a_m7_source_utf8 2389896断言/3例：码点/短字节独立KAT、旧解码对照、16非对齐与词/4096/65536边界、混合/截断/取消重试；真实SDK2、标准Core SDK22，567原CLI/8完整旧库消费者仅排除每次打开身份/时间、全字段保持。
三Core116/121/123、原B72/A489/寄存器2802/53198/哈希343033保持，C++warning0；24真实Core进程24首+72热及另8完整JSON值进程、原两8GiB/12真实设计/demo包外各10/打包过，标准仍DC12 exit1/树51旧失败。本单元无新增执行失败，原失败保持；含原TraceGraph WIP非clean固定源码，944原测试与保护不变，公开API/ABI/IPC/Schema/工程格式未改/迁移不适用。C22已关闭C-M7-03/B21已接受旧851；新单元待独立复验，不把原接受当本次或整个M7/D放行。未跑Linux/远端CI/读屏/全局OOM/旧dft-suite完整构建或新真实CPU运行取消，ASCII检查间隔最多4096字节不作硬SLA。


### 2026-10-29 / cycle178 第2/3：源码行索引

生产85ba0c00bc2dbdb867b563b4b4b49d9a77bdb877、纯提取412be06a3ec41e298990b92d200a8fb15de27fa5；[计划](plans/M7-source-lines.md)、[实际命令/数据/原件](evidence/m7-source-lines-2026-10-29.md)。`a_m7_source_lines` 150875断言/3例、真实Core SDK新增2例通过；51原定向、567原CLI、8完整旧新消费者两侧fresh对照（仅snapshotId/openedAt字符串值替换，其余原始字节/字段顺序同）。手写行图/CRLF regex/字节位置/hash独立KAT与A旧算法参考分账。
`caffeinate -disu bash ./check.sh` 三Core117/122/124、SDK24及原前序回归通过，77阶段末项仍DC12 exit1/25过0失败1阻塞；树140原51失败，cleanupErrors空。24实际Core进程24首次源码快照方法+72热方法、完整span计时外核同；原两8GiB/12真实设计/demo包外各10/打包通过。A消费者首编译unused s/Werror exit1和首稿/原流保留，只修A消费者，不改产品/B oracle。C++warning0，原Apple ld提示保持，946原测试/25保护/3872输入与日志前缀保持。
A构建含原TraceGraph WIP非clean固定源码；公开API/ABI/IPC/Schema/工程格式不变，持久化迁移不适用。B21/C22只归851，C-M7-03已关闭；前UTF8和本单元待统一独立复验，不签M7/D。未跑Linux/跨平台/读屏/远端CI/全局OOM/旧dft-suite完整构建/新真实CPU运行取消。扫描段最多64KiB不代表取消最坏间隔或行表/Core空间有界，保留原CRLF跳过边界检查行为。


### 2026-10-29 / cycle178 第3/3：源码范围分组

生产eb7a67004aa53985085ab43fc2bf3d5d924a8a66、纯提取e27cbd97cc5ece7995bd77e389ce49567b4a0edd；[计划](plans/M7-source-groups.md)、[实际命令/数据/原件](evidence/m7-source-groups-2026-10-29.md)。`a_m7_source_groups` 443445断言/3例、真实SDK2通过；完整原map/KAT输入排列/范围kind/owner/ref/去重/插入序/容量、取消和拥有值分列。567原CLI/8完整旧新库消费者两侧fresh（仅身份/时间字符串值替换，其余原字节/字段顺序同）、原51定向通过。
`caffeinate -disu bash ./check.sh` 三Core118/123/125、SDK26及本批前UTF8/行索引/B72/A489等回归通过；77阶段末项含DU05看门狗失败与原DC12 exit1/24过1失败1阻塞（DU05看门狗失败/DC12原阻塞），树140原51失败ID序同/cleanupErrors空。DU05全量45秒watchdog/SIGKILL，原配置单例1.364秒通过，原因未定位；原红不覆盖。A收集器旧25/0/1统计假设失败，原脚本/复现流保留，只修实际统计。24实际Core进程24首次反向方法+72热方法，计时外完整小页/独立span hash行列核同；原两8GiB/12真实设计/demo包外各10/打包通过。最终完整Electron门禁额外发生DU05驱动45秒watchdog/SIGKILL；原配置原时限的--case单例1.364秒/1过0失败0阻塞，原因未定位，保留全量24/1/1红流，不用单例绿替代。A收集器最初套用旧25/0/1而断言失败，原脚本/原阈值复现流与命令保留；只修统计，不改B oracle或时限。
原失败保持；C++warning0/原Apple ld提示保持，948旧测试/25保护/3872输入核同。
A构建含原TraceGraph WIP非clean固定源码，公开API/ABI/IPC/Schema/工程格式不变，迁移不适用。原map/完整索引仍O(N)，无额外全量暂存，无整体空间/硬取消/任意OOM保证；未跑Linux/跨平台/读屏/远端CI/全局OOM/旧dft-suite完整构建/新真实CPU运行取消。前UTF8/行索引与本分组待统一复验，旧B21/C22仅归851/C-M7-03已关闭，不签整个M7/D。

### S2 同快照命名场景来源比较（cycle203第3/3）

可选analysis/CMakeLists新增a_sequential_scenarios_unit及a_sequential_scenarios_cli，
生产Scenarios.cpp调用原analyze，新独立封装Schema复用五旧模式定义；旧测试/oracle不变。
作者新RTL覆盖旁路/门控、结构唯一终点、无位段unconnected不猜、反相奇偶/总线/共享体、
四态常量、原告警保留与partial/预算/错误/公共flag分段。库核确定性过期deadline/not_run、
预取消与错误后复用、原调用/常量解析与拥有值；不以sleep制造取消竞速。
命令为启用HIER_BUILD_ANALYSIS的CTest入口，消费模式可只重编分析并匹配链接A自有clean三配置Core。
三配置/原B冻结作者执行、五旧格式对照和真实有界双场景的实际结果见本单元evidence；
不是本轮完整Core/check.sh/GUI/跨平台/独立B/C验收。

### cycle204：名称编码与来源清单

新增a_sequential_names_unit/cli及a_sequential_inventory_unit/cli接可选analysis原CTest。
原B UTF8 CLI/库反例原样作者执行，作者补合法/非法scalar序列和128字节边界。
新14组RTL CLI覆盖来源/极性、总线/实例既有投影、事件多引用、常量逻辑组、原finding与partial、
单/多场景、预算与原索引；库核有界输入形状/错误、确定性过期、预取消/复用、输入释放后拥有值。
三配置消费模式仅重编analysis并链接前A自有clean同源Core库，非本轮完整Core/check.sh。
实际命令、原失败/修正、B作者执行、旧六格式对照与两真实设计结果见本单元evidence。

### cycle204 第2/3：派生控制生成链

可选analysis/CMake新增a_sequential_generation_unit/cli。原20消费者先验证纯提取，
新真实RTL/库核生成关系跨scope、事实位/共享/分页、原async边、场景上下文不推Q、循环见证，
depth/control/generator/fact/work/trace/logic/cycle限与原partial、快照/非法输入/预取消/拥有值。
三配置仅分析消费者重编并匹配复用A自有clean Core；原B21/15/UTF8作者执行分账。
七旧格式/Schema/原oracle保持，组合清单及有界真实设计按本单元evidence记录；
未跑完整Core/check.sh/GUI/跨平台/CI不写通过，不作为新的前置关卡。

### cycle204 第3/3：生成结构场景差异

新增a_sequential_generation_comparison_unit/cli，真实RTL核直接源相同/生成链变化、极性/async、
同值回返、共享/位、循环/未知/partial与上下文、预算前缀、Schema/退出码/组合清单；库核索引重排、
非法快照/seed/source/page、预取消/确定性过期、not_run及释放原输入后的拥有值。
纯writer提取先原22入口回归；三配置本分析消费者/原B冻结作者执行与旧八模式兼容分账，
实际命令/首败/保护/真实设计限制见本单元evidence，不冒完整Core/check.sh/GUI/跨平台/远端CI。

### cycle205：B48冻结接线与独立寄存器统计

B48 run.py/design.sv/unit.cpp按33fb393原bytes导入analysis/tests/independent-generation，标准CTest
b48_generation_contract/cli执行，adapter仅分配保留输出目录并记录原argv/exit；不改oracle。
新增a_sequential_statistics_unit/cli核参数实例、事实位/并集/重叠/位洞、真实分页、空/黑盒、
页与聚合索引/整数端点、预算前缀/原子汇总、scope/参数/预取消/过期/复用/拥有值及新Schema。
三配置仅本分析及消费者重编、匹配复用前A clean Core库；九旧格式和原21/15/UTF8保持，
实际三配置命令、首败及真实processor/OpenC910统计见本单元evidence，不冒完整Core/check.sh/GUI/跨平台CI。

### cycle205续：寄存器原始事件分组

新增a_sequential_event_groups_unit/cli；原区间/事件身份/writer纯提取先原28入口回归。
新12组RTL CLI和库核同组重复、跨组同位/三重/无交叠、clock边沿/async身份/角色、同定义实例、
原页/成员索引、组内/归属原子发布/各限、缺身份不合并、非法输入/预取消/过期/复用/拥有值。
三配置原B48/21/15/UTF8保持，十旧格式和真实processor/OpenC910按本单元evidence记录。
新ClockEvent序列化首败原件保留，修新产品表示，不放宽Core或新Schema；未跑项目全量/GUI/跨平台不冒通过。


寄存器控制来源profile新增`a_sequential_register_profile_unit/cli`，在原30入口之上实际执行，
新RTL查同根alias/async组重叠重新求并集、edge/极性、派生/常量/未驱动/未知/门控与静态输入，
并查原组/check/cohort/事实索引、预算/原子coverage/partial、快照/取消/复用/拥有性。
`register-profile.py`核严格新及嵌套原Schema，十一旧格式拒绝；原B oracle不改。
实际三配置/真实设计/兼容/未执行项按对应证据记录，不从作者测试推独立验收或全Core门禁通过。


已解析完整事件组合新增`a_sequential_resolved_events_unit/cli`，保留原32入口。
手写RTL与公开库检查完整clock+async别名合组、相同clock不同reset/role/edge/极性/顺序不合组，
跨组合/三组共享位、未知async不借clock cohort、上下文/分页/参数实例、前缀/原子coverage与归属，
以及source proof投影/索引/快照校验、预取消/确定性过期/Design释放后执行/输入释放后拥有性。
严格新及三层嵌套Schema/十二旧格式边界，三配置/旧B冻结/真实设计实际结果列对应证据；未执行项不计通过。


cycle206寄存器场景新增`a_sequential_register_scenarios_unit/cli`，标准可选analysis CTest。
B49最终run.py/unit.cpp/design.sv按198639ca→1ee74b92→9a764448原bytes导入，新增
`b49_registers_contract/cli`原46断言/22组72CLI；adapter只分配保留目录和记录原命令/结果。
作者场景库/CLI查原rawGroup匹配、组号重排、完整clock/async/极性变化、0/1/0、未知保留正证据、
变化同位去重、分页/参数实例/空/黑盒、预算前缀/原子coverage/互斥/UTF8/快照/预取消/确定性
过期not_run/错误复用/拥有值；严格共享视图还原原Schema。profile_only中途边界没有独立确定性注入，
不冒已动态覆盖；软time/heap不升级硬保证。旧十三模式兼容、三配置/冻结原件/真实设计按本单元证据分账。
未跑完整Core/check.sh/GUI/IPC/工程加载/跨平台CI不计通过；A执行B冻结不代新独立B/C接受。


寄存器控制多级生成网络新增`a_sequential_register_generation_unit/cli`，可选analysis标准CTest。
纯GenerationInput/profile校验/图writer提取先原38入口回归，新库/RTL查scope外多级clock及生成reset、
共享生成与不同写入位、原clock/async→check/seed映射/部分前缀、静态0/1/0/分页/参数实例/循环/未知，
以及非法引用/来源proof/快照、预取消/图与映射确定性过期、复用和释放后拥有值。
新Schema沿原严格Graph和完整profile，旧十四格式对照及三配置/原B690输出、两真实有界命令分账记录。
不把mappingComplete当来源已知，不从有限native测试推硬heap/time/全Core/check.sh/GUI/跨平台或独立B/C验收。


完整寄存器生成结构场景/影响位新增`a_sequential_register_generation_scenarios_unit/cli`。
共用只读比较view、变化事实/区间及writer提取先原40回归；新RTL/native核直接同源但深链变化、
生成async/极性、0/1/0、局部未知/循环不判相同、跨组同位并集/重叠、原组→event→cone索引，
各阶段预算/影响行原子发布/coverage前缀、非法快照/输入/预取消/确定性post截止/not_run/复用/拥有值。
新严格共享视图及原嵌套Schema验证、三配置/冻结原B690输出/十五旧模式兼容/两真实有界命令分账。
不从有限native/私有过期推硬heap/time/编译硬取消或全Core/check.sh/GUI/跨平台/独立B/C验收。


cycle207先按B50最终02633ad2三原件原bytes导入，新增b50_register_evolution_contract/cli（44断言/18组60CLI），
原CMake只读；两次纯接线/共享提取各44入口回归。新a_sequential_register_fanout_unit/cli进入可选analysis标准CTest。
新7组RTL和native核多级clock/async最短路径、共享根/原组角色、同位重叠/参数实例/循环/未知、origins/seed/node/link/
成员/coverage前缀、非法索引/快照/原证明、预取消/确定性过期/Design释放后纯后处理和输入释放后的拥有值。
严格新及原嵌套Schema、三配置46入口/冻结B870输出/十六旧模式86组兼容/两真实有界运行按本单元证据分账。
未跑完整Core/check.sh/GUI/IPC/工程加载/跨平台CI不计通过；私有过期不冒硬time/heap/编译硬取消，作者执行不代独立B/C。


终端来源聚合新增a_sequential_register_sources_unit/cli；共享扇出writer提取先46入口回归并单独提交。
手写7组RTL及native核别名/极性、完整clock/async原事件追溯、多级generated与终端分类、同fact多来源、
跨源同位交叠、参数实例、未知/循环/输入partial、rows/source/成员/段/work/交叠成员前缀与整信号原子发布，
坏图/快照/预算/预取消/确定性post过期/Design释放后运行及返回拥有值。新严格Schema与完整旧fanout逐嵌套核验。
首编缺IntervalCoverage.h保留原流后补生产include；首CLI6/7为作者误将合法旧fanout无新flag期待错误，
保留首败后显式核旧命令exit0和原Schema，非法依赖/预算断言保持。当前三配置/870冻结输出/17旧模式/真实有界结果
按本单元evidence分账，不冒独立B/C/全Core/check.sh/GUI/IPC/工程加载/跨平台CI或硬heap/time保证。


终端来源场景矩阵新增a_sequential_source_scenarios_unit/cli；共用生成场景/source/fanout writer先原48入口回归并单独提交。
RTL/native核同源覆盖增减/0-1-0、写入重数变但位并集相同、原deep变化与覆盖不变并存、多级clock/async/极性、未知/循环/
源partial不判缺失、原结构预算partial下局部完整覆盖可判、空/重复/8场景、行/cells/intervals/work索引前缀/原子发布，
坏快照/重复名/语义输入/嵌套预算、预取消/确定性post not_run/复用/释放后拥有值；严格compact视图逐层还原原Schema。
三配置50入口/原B870输出/十八旧模式/两真实有界运行按本单元证据分账；未跑全Core/check.sh/GUI/IPC/工程加载/跨平台
不计通过，不把私有deadline/预取消当硬资源或编译硬取消，不将A执行冻结当新独立B/C验收。


cycle208按B51初冻43160589/最终e09514e4三原件原bytes接入b51_register_sources_contract/cli（36断言/20组55CLI），
原CMake只读，不改unresolved计数的B修订；导入原52入口、规范化/writer共用提取后原52入口分别回归。
新增a_sequential_source_deltas_unit/cli，RTL/native核三集合差/保留、孔洞/触边/大端点和线性访问、0/1/0、极性/重数、
未知无假0、总partial下正明细、每预算整行原子发布、坏快照/名字/第二context错误、预取消/确定性post过期/复用/拥有值。
严格新及原矩阵/compact视图还原核验，三配置54/冻结1035输出/十九旧模式/两真实有界运行分账记录，不冒独立B/C、
全Core/check.sh/GUI/IPC/工程加载/跨平台CI或硬heap/time/编译硬取消。本轮原oracle/全部历史首败保持。


来源位反向归属新增`a_sequential_source_attribution_unit/cli`，与原二十格式和B51原冻结一同运行。
作者逐位角色集合oracle核同位多来源/来源迁移去重、0/1/0、孔洞/极性/未知/空/8contexts、
比较输入与signal行原子预算；native核共用端点扫描/最大端点、预取消/错误复用/拥有值及确定性post过期。
三配置analysis消费者真实重编、匹配前A clean Core复用及未跑全Core须分别记录，不能冒独立B/C或完整check.sh。


来源集合转换新增`a_sequential_source_transitions_unit/cli`，原attribution writer先共享提取并原56入口回归。
作者按原位段/逐位来源集合独立核cohort键排序/成员引用/唯一位、跨signal同组、多对多不猜配对、0-1-0/极性/孔洞/空/8contexts、
未知/partial及来源证明和输出完整分开、每预算完整cohort原子性；native核预取消/坏输入/嵌套预算/复用/拥有值及确定性post截止。
三配置58入口、原B1035输出、二十一旧格式兼容、真实有界运行分账，不冒独立B/C、全Core/check.sh/GUI/IPC/工程加载/跨平台或硬资源保证。


cycle209原样接入B52 ae092972最终run.py/unit.cpp/design.sv，标准b52_source_changes_contract/cli（39断言/20组59调用），原CMake只读。
导入及transition writer共享提取各原60回归，新增a_sequential_source_impact_unit/cli，核层次scope/同定义多实例不去重、
成员引用/唯一位与实例/定义双视图守恒、unknown/partial/空、原子实例与定义归并/各预算、坏定义对应关系、取消/复用/拥有值/确定性post截止。
三配置62入口/1212冻结输出/二十二旧模式兼容/两真实有界运行分账；不冒独立B/C、全Core/check.sh/GUI/IPC/工程加载/跨平台或硬资源保证。


来源影响层次汇总新增`a_sequential_source_hierarchy_unit/cli`；原impact writer/受检计数加法共享提取先原62回归并单独提交。
作者依据原统计path分量和原实例行独立核多级scope/真实实例父链、generate非实例、转义点名、直接根行与后代、共享体不同实例、
跨contexts拓扑缓存、原成员引用/根计数不重复、空/unknown/partial、导航与完整链计数、完整节点前缀/六预算；native还核
坏元数据/Core身份、快照/名字/第二context错误、嵌套预算、预取消/确定性post过期/复用/释放后拥有值。
新严格Schema及逐层原impact/proof保留，三配置64入口/1212冻结输出/二十三旧格式及两真实有界运行按本单元证据分账。
A执行原冻结非新B/C验收；完整Core/check.sh/GUI/IPC/工程加载/跨平台/远端CI未执行，不冒硬截止/heap/编译取消或DFT结论。


来源×子树覆盖矩阵新增`a_sequential_source_hierarchy_matrix_unit/cli`；原hierarchy writer先共用提取并原64回归单独固定。
作者按原delta角色→matrixRow及原attribution位段独立还原期望，核{a,b}→{b,c}的三角色/保留不误计、原引用/位集合、
共享体不同实例/真实父链/generate/转义名/局部scope、0-1-0/8context、空/unknown/partial和无半索引/完整pair预算前缀。
native还核快照/Core身份/第二context/嵌套预算/预取消/确定性post截止/复用/释放后拥有值，角色名集中转换；
新CLI240秒仅作者入口设施预算，不改原B或既有入口超时/oracle。三配置66、1212原冻结/二十四旧模式及两真实partial分账。
完整Core/check.sh、未变GUI/IPC/工程加载/跨平台/远端CI不计通过；A执行冻结不等同新B/C验收或硬资源保证。


cycle210原样导入B53初冻6ae9fa9a及补充最终274eee27的六输入，标准新增b53_source_hierarchy_contract/cli及empty_prefix/empty_cli四入口。
原20组/361断言、确定性真实statisticsWithDeadline producer的3项对照、4公开1ms命令允许0/4策略均不改；B CMake只读。
先在未修生产保存2/4入口通过、producer1/3和公开2/4的真实失败，再修复C-S2-08-01；不以此A执行代B53/C210独立关闭。
作者H/M既有native新增真实空producer/零导航与scope省略/嵌套partial/取消及自身截止、错误快照/伪造complete空统计/非法scopeproducer、
完整已访问无本地寄存器scope/非空metadata/复用/释放后拥有值；不新增hook/sleep或观察前置。
三配置完整70入口、37原B输入、所有25旧Schema/有限差分及真实有界结果分账；完整Core/check.sh/未变UI/IPC/工程加载/跨平台等未执行不计通过。


来源子树范围明细新增`a_sequential_source_hierarchy_ranges_unit/cli`。原matrix writer/角色五计数/相邻范围追加纯提取先原70回归单独固定。
作者用原矩阵成员的逐位角色集合独立压缩expected，核多级/局部scope/多实例、相邻合并保留全部引用、孔洞/角色边界、多来源同位，
0-1-0/8contexts、unknown/空/partial/原矩阵前缀、各预算的完整pair原子发布和规范范围准入。
native核uint64最大端点、共用append准入不变、预取消/独立确定性post截止、真实空统计producer/C08传递、错误复用及输入释放后拥有值。
三配置72入口、1389冻结输出、25旧模式113组、两真实有界partial及37 B原件保护分账；新作者CLI240秒不改变旧B或已有入口时限/oracle。
完整Core/check.sh/未变UI/IPC/工程加载/跨平台/远端CI未跑不计通过，不代独立B/C或C-S2-08-01关闭，不冒硬time/heap/编译取消。


### 来源位范围定向选择

新增`a_sequential_source_range_selection_unit/cli`，三配置分析层共74入口（含55旧A与17原B、2新A）。
旧range/signal writer和UTF8共用提取保留26旧格式与原scenario编码政策；旧冻结原件/历史红保持，不将A执行当B独立验收。
作者有限位集合核来源/精确节点/信号/角色/窗口交集、截取后计数、合并段的窗内外证明、完整signal预算前缀、原partial/C08、Design释放后的查询和返回拥有性。
实际源/命令/配置/结果/限制见[计划](plans/S2-source-range-selection.md)与固定证据；完整Core/check.sh、GUI/IPC/工程加载/跨平台/远端CI/物理AT/IME不在本分析层执行中冒通过。


### 来源选择的逐场景事实证据

原样导入B54 ec0cbaec的run/unit/design，新增b54_source_ranges_contract/cli，保持549c5221初冻及坐标修订首红在B原档。
新a_sequential_source_range_evidence_unit/cli使本层78入口=59作者+19 B；共用selection writer与相交操作先76回归单独固定。
以原组/原统计写入区间的独立有限位集合核metadata、added/removed/retained context、证明与fact截取、重叠事实/字典去重/整行原子性、C08/partial/取消/坏引用/输入释放拥有性。
实际命令、三配置、旧格式对照、真实有界partial及保护见[计划](plans/S2-source-range-evidence.md)与固定报告；未执行完整Core/check.sh/GUI/IPC/工程加载/跨平台/远端CI/物理AT/IME不记通过。


### 来源证据的Core源码定位

新增`a_sequential_source_evidence_locations_unit/cli`（分析层80入口=61作者+19 B），原evidence writer共用提取先核原2入口与28旧格式122组有限对照。
自有物理源码字节核信号声明/过程语句/宏调用位置与SHA256/行列；共享定义实例不合并、同过程多事实去重、原字典映射、完整fact原子cap/恰好预算、C08/partial/取消/快照/坏引用/NotFound与释放后拥有值。
NotFound native用构造边界输入明确分账，不冒原RTL producer一定发缺失位置。新格式严格条件Schema及Core原SourceSpan共用；实际命令/配置/原流/兼容/真实有界运行见[计划](plans/S2-source-evidence-locations.md)与固定报告。
复用匹配自有Core/Slang，当前analysis/消费者重编；完整Core/check.sh/未变UI/IPC/工程加载/跨平台/远端CI未跑不计通过，不代新B/C或硬资源保证。


### 快照核对后的源码片段

新增`a_sequential_source_evidence_excerpts_unit/cli`，分析层82入口=63作者+19原B；原位置writer纯提取先核原2入口及29格式125有限对照，实际阶段流/源均保留。
作者以物理行列表/字节位置核上下文0/1/2/20、UTF8/CRLF、宏调用、多文件/共享定义与共享窗口；核整行/文件/cache/snippet原子预算、恰好上限、取消/坏快照/span/路径不授权、拥有值及C08。
native只改自有临时SV/头文件，确定性覆盖读取前截断修改/无UTF8/删除/恢复；不以sleep竞速或修改真实RTL/B输入。变化时不套旧offset，不输出不匹配文本，真实CLI正域与库变化边界分账。
实际三配置/原冻结/严格Schema/旧29兼容及真实有界partial见[计划](plans/S2-source-evidence-excerpts.md)及固定证据。复用自有匹配Core/Slang；完整Core/check.sh、未变UI/IPC/工程加载、跨平台/远端CI未执行不计通过，不冒硬IO/heap/单调用截止/DFT或新B/C验收。

### 来源调查组合入口（DESIGN7.5.30）

构建`dft_source_investigation_unit`与`dft-seqcheck`，执行
`ctest --test-dir <build> --output-on-failure -R '^a_sequential_source_investigation_'`。
公开API测试覆盖原producer索引/拥有性、明确场景/精确node、六段预算partial、全部请求段预验证及预取消/原错误；CLI覆盖快捷/显式链等价、严格原Schema/物理字节、参数顺序和冲突。相关回归为原source_range_evidence/source_evidence_locations/source_evidence_excerpts、物理换行、B55/B54/C08。作者测试和A执行冻结测试不等于新的B/C独立验收。

### RTL对象清单（DESIGN7.6）

构建 `dft-objects dft_object_catalog_unit`，执行
`ctest --test-dir <build> --output-on-failure -R '^a_object_catalog_'`。
native/CLI以手写对象集合核共享/数组/generate/转义名、参数宽度、方向、原引用与拥有性，核分页顺序、
scope/字面过滤、精确预算、部分前缀、预取消和确定性过期；CLI核严格新Schema、黑盒未知、文件列表和错误退出码。
layering测试预期Slang私有头不可见，编译拒绝才通过。公共UTF8提取须连同原names/冻结UTF8用例和旧命令有限差分回归。
真实设计采用明确预算，partial须保留原因，不能推断全设计不存在对象。具体三配置/首败/有限验证见
[执行计划](plans/S2-object-catalog.md)及固定证据；不以A自测代独立B/C验收或SDC/Studio完成。

### 宏接口调查（DESIGN7.7）

构建 `dft-memory dft_macro_interfaces_unit`，执行
`ctest --test-dir <build> --output-on-failure -R '^a_macro_interfaces_'`。
手写宏/引脚集合核精确定义、同定义多实例、generate/转义名、父层原绑定及常量/未接/重排位段，
原始结构时钟、缺失引脚、真实顶层和子树外父层；核整宏预算、精确上限、partial前缀、取消/确定性详情截止和拥有性。
严格Schema正负域与引用、Slang不可见分层门禁；相关回归为原对象清单、调查组合入口和原样B56。
对象writer共用提取以基线二进制逐字段/退出码有限差分，记录去掉的快照瞬时字段。
三配置当前消费者、真实有界输入、原Core复用身份、开发首败与修复分别归档；A执行原冻结不等于B/C新验收。
见[计划](plans/S2-macro-interfaces.md)。完整Core/check.sh、GUI/IPC/工程加载/跨平台/远端CI未跑不计通过。

### 显式存储器模型映射（DESIGN7.8）

构建`dft-memory dft_memory_map_unit`，运行`ctest --test-dir <build> --output-on-failure -R '^(a_macro_interfaces_.*|a_memory_map_.*)$'`。
以手写RTL和独立模型核共享/generate/转义实例、参数化不匹配、非2次幂深度、原引脚索引、方向/宽度/掩码/额外与缺失引脚；
完整行原子预算及容量守恒、原partial保留、预取消/确定性截止/请求与形状错误/释放后拥有性、严格Schema正负域。
大容量native合成DTO仅验证算术边界，不冒真实RTL证据；真实黑盒unknown方向不得用模型角色覆盖。
原宏writer提取用旧binary36命令有限对照，三配置各新旧5入口；无修改的B原件/32旧Schema保持，不把上一turn的B运行算成本次执行。
见[计划](plans/S2-memory-map.md)及固定证据；本轮未执行的全Core/check.sh、GUI/IPC/工程加载/跨平台/CI不计通过。

## S2 显式黑盒库输入（DESIGN7.9）

受影响构建目标 `dft-memory dft_macro_interfaces_unit dft_memory_map_unit dft_memory_library_unit`；相关门禁：

```sh
cmake --build BUILD --target dft-memory dft_macro_interfaces_unit dft_memory_map_unit dft_memory_library_unit -j4
ctest --test-dir BUILD --output-on-failure -R '^(a_macro_interfaces_.*|a_memory_map_.*|a_memory_library_.*)$'
```

分别运行 RelWithDebInfo、Debug、ASan+UBSan；library native 验证不可变声明/拥有返回、Core 实际端口与位置空位、普通 RTL 不覆盖、used/unused cell 与 source hash、模型冲突、取消及形状/字节边界。CLI 两原模式接库后均按独立 `library-memory.schema.json` 校验；错误保持原 envelope。无库旧宏36+映射38命令只去 snapshotId/openedAt 后做前后逐项对照。

真实 NX9000/OpenC910 只运行明确限制的宏调查，库来源明确标记为手写 demo 输入，不冒独立厂商库证明。保留原 partial/inputHashComplete=false，不以 matchedCapacityBits 声称实际 SRAM 容量或 MBIST 可测性。Core 与 Slang 无生产改动时可复用已记录同源码本人库，并记录 hash、当前消费者编译参数和 clean 源输入；不得把历史构建/历史 B 二进制冒充当前验证。完整 Core/GUI/IPC/工程迁移和远端 CI 未运行需明确列出。

## S2 内存完整调查与匿名端口（cycle214 / DESIGN7.8、7.10）

新增 `dft_memory_investigation_unit` 与字节不改导入的 `b57_memory_contract`。构建原4个memory目标及这两个目标后：

```sh
ctest --test-dir BUILD --output-on-failure -R '^(a_macro_interfaces_.*|a_memory_map_.*|a_memory_library_.*|a_memory_investigation_.*|b57_memory_contract)$'
python3 analysis/tests/independent-memory/run.py --binary BUILD/analysis/dft-memory --product . --out OUT
```

三配置运行：完整API对照原两步结果、匿名/有名混合/空位、原ref/owner、未知pin不猜名、其它matched行保留、库正对照、分阶段预算/partial、所有参数先于scope查询校验、预取消/错误复用/拥有性。作者CLI核缺文件/-f/-F exit2、编译错误/scope缺失 exit3，并做现有三模式103命令差分。

B57原四文件来自test/m5-tree `511ecb32`，冻结原样保存；native L06和CLI C14用于C-S2-12-01复验。CLI C12缺文件expect3为B-S2-57-01旧契约歧义，DESIGN7.10明确既有Core BadRequest→exit2后，A仍不得代改预期或把整套CLI写通过。单独执行并完整记录其原exit1、13/14及唯一C12失败；不将记录分类的外层脚本exit0冒作B全绿。关闭权留B/C。

内存测试规划（DESIGN7.11）启用analysis后增加`a_memory_test_plan_unit/cli`：手写RTL验证模型/域/分区隔离、控制器容量与步骤功耗/并行拆分、成员双向索引/周期/功耗/容量守恒、缺声明/接口不匹配、partial与原子预算前缀、预取消与确定性过期deadline、拥有性、CLI先验证及新严格Schema/旧格式拒绝。可连同`a_macro_interfaces_.*|a_memory_map_.*|a_memory_library_.*|a_memory_investigation_.*|b57_memory_contract`运行三配置受影响集合。B57 CLI原C12未改，单列原驱动失败，不登记为WILL_FAIL或冒全绿。全Core/宿主/跨平台并不包含在此定向门禁中。


内存库文件输入（DESIGN7.12）新增 `a_memory_library_input_unit/cli`，核文件与原声明参数等价、模型/可选引脚与成本关系、精确整数、重复键/Unicode/未知字段、1 MiB边界、目录/FIFO/缺失文件、互斥与打开前验证、拥有性及预取消。输入Schema位于memory/input，不进入旧输出联合。共用JSON门面使L4静态消费者重编：同时跑原 `b_m4_reader_state`、`b_m4_worker`、`a_m4_core_boundary`、`a_m4_frozen_raw_decoder`、`b_m4_raw65_projection`、`b_m4_cpp_schema`、`a_m4_cpp_generated`、`a_m4_stdio`。观察点测试必须使用启用相同 HIER_TEST_OBSERVER 的L2/L3/L4，不能只给测试目标加宏而复用未启用的Core库。测试启动原serve子进程覆盖协议边界，不等于未执行的SDK/Node/Electron/UI全链验收。


## S2 层级测试分配规则（cycle215 / DESIGN7.13）

新增 `dft_memory_test_rules_unit` 和 `a_memory_test_rules_unit/cli`；构建全部 memory 单测、`dft-memory` 与原 B57 native 后运行：

```sh
ctest --test-dir BUILD --output-on-failure -R '^(a_macro_interfaces_.*|a_memory_.*|b57_memory_contract)$'
python3 analysis/tests/independent-memory/run.py --binary BUILD/analysis/dft-memory --product . --out NEW_OUT
```

三配置验证实际路径段、层级继承/最深覆盖/精确优先、顺序无关、escaped 名称与数组、1024 规则、预算截断与缺域、未匹配接口、先验证/预取消/拥有性、文件边界和严格 Schema。规则报告内嵌计划与独立手工展开的原 `--test-instance` 结果逐 JSON 对照；旧 226 命令及真实有界设计另做前后/等价对照。Core/协议无变化时复用核同本人库，analysis 静态消费者重新编译，原 Slang 分层负编译门禁仍执行。

B57 CLI 现逐字节采用 B 的 `4e2443c1a966659f4f66732211fae546f3b7d195` C12 维护（结果固定 `2f0ceb27fde2d360140b4a6854d8cb1cae71cee0`）；之前各节所记旧失败是历史事实，未覆盖。B58 原件在该 B 固定中独立冻结，A 以临时驱动链接当前分析库运行原 native/CLI，不修改其 oracle。B58 文件测试须使用新的输出目录，不能复用上次的符号链接。A 执行冻结测试不等于 B/C 已验收本轮新规则。

本单元不改 L0–L4、IPC、UI、工程格式或依赖，不重复无影响的全 Core/协议/宿主门禁；不把未执行的跨平台/CI、任意中途取消、并发文件替换或硬 heap/deadline 证明计为通过。


## S2 跨控制器测试批次（DESIGN7.14）

增加 `dft_memory_test_schedule_unit`、`a_memory_test_schedule_unit/cli`。构建当前全部memory目标后，可用原 `ctest --test-dir BUILD -R '^(a_macro_interfaces_.*|a_memory_.*|b57_memory_contract)$' --output-on-failure` 选择完整受影响集合；临时固定消费者另含B58原native，B57/B58原CLI仍分别运行。三配置均重新编译当前analysis，Core/协议未变时使用核同本人静态库。

手写8宏/4控制器/5步骤的精确三批次oracle及独立功耗/顺序/成员计数验证；同时检查并行/功耗阈值、所有阻碍、候选批次与阻碍决定的原子丢弃、exact cap、上游partial/无控制器、原显式与规则分配等价、黑盒库、预验证/预取消/确定性过期deadline和拥有性。新Schema严格核每状态可有字段及完整结果不允许pending/blocked/原因；引用原完整source格式，旧Schema不扩联合。旧CLI对照与真实有界设计另记实际命令/结果，不将A执行冻结集合冒独立B/C接受。

全Core/协议/SDK/UI/工程加载与远端CI未执行即不计通过。批次假定执行端提供屏障，不提供频率或跨域耗时、最优装箱、物理功耗或MBIST执行RTL证明。

### 显式时钟的测试时长预算（DESIGN7.15）

新增`dft_memory_test_timing_unit`和`a_memory_test_timing_unit/cli`，与原全部memory目标共同构建和定向运行三配置。实际RTL覆盖不同周期的并行最大值/批次屏障/固定开销、累计时间精确边界、work整批丢弃、缺时钟、上游partial/空计划、真实32位地址模型的乘法/开销加法/累计加法溢出、静态先验证/预取消/确定性过期与拥有性；所有成功和错误输出验证严格Schema。B57/B58原冻结保持，旧CLI逐项对照，仅去snapshotId/openedAt。完整Core/协议/SDK/UI/工程加载/跨平台/远端CI未受变更影响，不以定向门禁冒这些验证。

### 内存测试配置输入（cycle216 / DESIGN7.16）

新增 `dft_memory_test_config_unit` 与 `a_memory_test_config_unit/cli`。受影响全套 memory 构建与三配置定向回归包含文件/原 CLI 的 assignment 与 rule 三阶段等价、静态模型与库文件兼容、部分默认值、完整配置先验证、所有数值边界、冲突选项、重复键/名称、UTF-8/精确整数/1 MiB/普通文件、预取消和拥有性。共用规则解码不改变原文件接口，旧输入/输出 Schema 不变，新输入 Schema 引用原规则形状。

B59原冻结来自B结果 `1d0bbb1e8171c4460f2cc8f446927ecf750c61df`，与B57/B58一并重新编译运行；不得修改其oracle。修复B-S2-59-01仅限制trie最大规则深度，缺边尝试仍计数。旧命令差分须独立从原始路径段重算旧/新visitedSegments，逐一记录有意变化，不能全局屏蔽该字段。A运行冻结集合不代表B已关闭该意见。

此次不改Core、协议、宿主或工程格式；相同源码与配置的本人Core/L4/Slang库核hash复用。完整Core/协议/SDK/UI/工程加载、跨平台与远端CI未运行不计通过。真实设计限有界调查与显式示例声明，保持partial/inputHashComplete=false，不声称全设计或物理MBIST签核。

### 同一调查的配置方案比较（cycle216 第2/3 / DESIGN7.17）

增加`dft_memory_test_comparison_unit`和`a_memory_test_comparison_unit/cli`，与所有原memory/原B57、B58、B59冻结集合在RelWithDebInfo、Debug、ASan+UBSan分别编译执行。原分层负编译门禁保持；私有可信事实入口由原API和比较API共用，旧输入/输出Schema逐字节保持。新Schema引用原timing成功格式，完整性/差值存在性严格联动，行/配置对应及算术关系另由运行断言核验。

以手写8宏对四套约束独立核算控制器/步骤/批次及144021、176035、64007、128028皮秒，验证正负/零差值、配置顺序/8项上限、assignment与rules各原报告等价、shared investigation身份/前缀、参考或候选partial禁差值、空完整结果、先验证全部配置、所有混用错误、预取消/错误恢复/释放后拥有性。旧单配置与新原报告逐JSON比较；旧全部552命令仅去snapshotId/openedAt做前后对照，不屏蔽其它字段。NX9000/OpenC910各2份声明作为有界比较，必须保持原partial/inputHashComplete=false、无delta及原每项报告等价，不称全设计或物理签核。共享调查只复用本次事实，不等于文件系统事务。

复用本人核同同配置Core/DB/L4/frontend/Slang库并重编analysis，不运行未变全Core/协议/SDK/UI/工程加载/跨平台/远端CI充数。新比较A自验不替代独立B/C；B-S2-59-01关闭仍归B。

### 逐内存测试覆盖（cycle216 第3/3 / DESIGN7.18）

新增`dft_memory_test_coverage_unit`与`a_memory_test_coverage_unit/cli`，三配置运行全memory与B57/B58/B59原冻结集合。用实际8宏手算成员时段，核开销后同时开始、先结束成员仍等待屏障；逐行索引连回原timing报告。覆盖所有阶段partial、未发布候选不虚构行、映射缺陷在规划截断前保留、同批clock_missing只归因对应entry、功耗阻碍与后续较小步骤的区别、overflow/时长预算/原单命令等价、静态验证、显式开关、预取消与拥有性。新严格输出Schema引用原timing成功格式；旧Schema不改。

旧全部621 CLI（上一单元552+69）仅去snapshotId/openedAt做前后JSON与退出码对照。NX9000/OpenC910沿前轮单方案真实有界输入追加覆盖选项，对照完整source不变并保留partial/inputHashComplete=false；不据此称全设计覆盖。复用本人同配置15库，重编当前analysis；Core/L4/SDK/UI/工程格式未变的全套不计通过。A运行原B oracle不代独立验收，B-S2-59-01仍由B关闭。

DESIGN7.19 新内存时钟来源可定向运行 `ctest --test-dir <build> -R '^a_memory_clock_sources_' -V --output-on-failure`。共享逻辑证明writer的变更同时运行原 `a_sequential_logic_.*`、`a_sequential_gates_.*`、`a_sequential_values_.*` 与旧CLI差分；来源求解器算法不变。原B57–B60冻结由本轮证据driver运行，A执行不代签新接口的独立验收。

DESIGN7.20 的 `a_memory_test_domains_unit/cli` 覆盖跨模型/分区显式域归并、来源位和边沿、mixed与未决共存、缺分配、规划/映射/时钟前缀、unused分配造成原plan partial、真正完整空调查、规则/配置输入、所有参数先验证、预取消及拥有性。原source与独立计划、clocks与独立来源报告逐JSON等价，关联索引/计数/状态由断言核验；新Schema只约束形状和局部关系，不冒跨数组语义。三配置重编当前analysis和静态消费者、运行全部memory及原B57–60，原B oracle保持。原时钟实现和writer提取私有事实入口/共享字段后，732旧CLI只归一snapshotId/openedAt作前后对照。真实NX9000/OpenC910沿有界配置检查，不把已观察成员或mixed判断当全设计/电气签核。

DESIGN7.21 增加`dft_memory_clock_check_unit`和`a_memory_clock_check_unit/cli`。定向`ctest --test-dir BUILD -R '^a_memory_clock_check_' -V --output-on-failure`验证真实RTL的根路径/位/有效边沿、同域多个来源与跨域共享、成员优先级、fail+partial、pass资格、预算未到达、未分配/未声明/未观察约束、原报告等价、验证先于查询/预取消/拥有性。输入覆盖严格字段、重复域/源、计数/全局来源/UTF8/字符串字节上限、精确整数、1MiB、目录/FIFO/缺失文件与模式互斥；不修改原B57–60。三配置重编当前分析层和消费者，运行全部memory/相关sequential及冻结回归；779旧CLI逐JSON/退出码对照只去snapshotId/openedAt。真实有界NX9000声明仅允许dco_clk用于展示匹配/已知违例共存，OpenC910保留未决；这些作者约束不是独立oracle或物理/MBIST可行性判断。

DESIGN7.22 的 `a_memory_test_assessment_unit/cli` 将真实RTL的规划/调度/计时覆盖与来源允许集交叉验证：手算6宏两波32014ps，已计时+违例、已知功耗/缺周期+匹配、两路同时阻碍、未提交整波与映射/时钟前缀、unused/无域/无约束、完整空范围、全部请求先验证、预取消/拥有性。原coverage与独立7.21输出逐JSON对照，计数/索引/issue顺序核验；私有域/校验/writer提取先运行原三接口和B61。三配置重编当前分析层，运行全部memory/相关sequential及B57–61原冻结；863旧CLI只归一snapshotId/openedAt做前后对照。NX9000/OpenC910联合检查保留原有界partial与完整旧coverage/时钟结果，不冒物理或全设计签核。未改Core/IPC/SDK/UI/工程格式，未执行其全套不计通过。

DESIGN7.23 `a_memory_assessment_comparison_unit/cli`：同一调查/公共时钟证据与原单方案及原timing比较全报告等价；手算6宏两波32014ps、正反向两处来源违例、周期改变-28800ps但状态不变、联合partial与timing complete独立、参考partial禁止所有差值、每配置预算/映射与时钟前缀、完整空及8配置、规则/显式输入、名称配对/缺少/多余/重复/全请求先验证、预取消/拥有性。严格Schema反例和索引/差值关系核验；三配置memory/相关sequential与原B57–61保持。真实NX9000/OpenC910沿原有界调查，不能由已观察状态转换推出全设计变化。未变Core/IPC/SDK/UI/工程加载/远端CI未执行不计通过。

### 共享测试资源容量（DESIGN7.24）

构建 `dft_memory_schedule_resources_unit dft-memory`，运行
`ctest --test-dir BUILD -R '^a_memory_schedule_resources_' -V --output-on-failure`。
新增实际RTL用例核多资源交叠、同域不同控制器、容量/功耗/全局并行共同准入、资源暂缓与独立域、整批预算/精确work、预取消/确定性过期和拥有性；CLI核独立文件/配置/规则等价、全部下游计时/覆盖/联合比较及新严格Schema反例。
受影响全memory和原B57–61、共享sequential消费者三配置重编执行；对上一固定Release全部实际旧memory CLI命令做逐JSON/退出码差分，只归一snapshotId/openedAt。原schedule/config Schema仅增加可选资源声明，其余Schema不改。新含资源格式的旧严格读取器不兼容必须说明，不能把旧输出相同扩成双向兼容。未变化的Core/IPC/SDK/UI/工程加载、跨平台和远端CI不以此定向验证代替。

### 测试域先后约束（DESIGN7.25）

构建 `dft_memory_schedule_dependencies_unit dft-memory`，运行
`ctest --test-dir BUILD -R '^a_memory_schedule_dependencies_' -V --output-on-failure`。
真实RTL验证多步/多控制器前置、声明/控制器顺序相反、汇合、缺失/受阻链传播、独立域、资源功耗共同准入、精确work和整批回滚、规划partial、预取消/过期与拥有性。CLI贯通独立文件/config/rules/计时/coverage/assessment/两类比较，24个固定seed DAG按先后时段不等式验证，严格Schema反例、先验证后设计打开。B57–62原冻结消费者只读复跑，不替代新增契约的独立B/C验收。

三配置受影响memory/共享sequential构建回归；旧Release实际命令逐JSON/退出码比较仅归一snapshotId/openedAt。旧无依赖默认保持，新字段/原因需新版reader；三份旧Schema为明确可选扩展，不宣称所有Schema字节保持。真实NX9000/OpenC910只作有界条件计划验证，不记全设计通过。未改变Core/IPC/SDK/UI/工程加载等全套和远端CI未执行时如实列明。

### 共享测试资源恢复间隔（DESIGN7.26）

构建 `dft_memory_resource_recovery_unit dft-memory`，运行
`ctest --test-dir BUILD -R '^a_memory_resource_recovery_' -V --output-on-failure`。
实际RTL核首次/末次使用、资源整体屏障、同波共享只收费一次、多资源取最大等待、中间独立批次抵扣、已恢复资源省略、整批work/时长截止和取消/过期/拥有性。CLI贯通资源文件/config/rules、计时、覆盖、联合评估与比较；固定seed资源组合独立重算起止/等待/work，输入精确整数/错误先验证、严格Schema反例与默认0兼容。

三配置运行受影响memory/共享sequential及B57–62原冻结；旧CLI差分只归一snapshotId/openedAt。schedule资源定义、timing、comparison三份Schema扩展，其余保持；新字段需新版严格reader，C++消费者重编。真实设计有界验证不升级原partial，不推物理恢复或全设计MBIST可行性。未变化Core/IPC/SDK/UI/工程加载/跨平台/远端CI未执行不计通过，A复跑不替代新B/C验收。

### 资源级功耗预算（DESIGN7.27）

构建 `dft_memory_resource_power_unit dft-memory`，运行 `ctest --test-dir BUILD -R '^a_memory_resource_power_' -V --output-on-failure`。真实RTL核单步超限/累计暂缓、精确边界、同域多控制器、重叠资源晚拒绝不占位、全局/依赖优先级、blocked传播、恢复等待、work整批回滚、取消/过期/拥有性；CLI核文件/config/rules、覆盖/联合评估/比较和严格Schema。三配置重编当前analysis及静态消费者，复跑全memory/相关sequential和原B57–62，不修改独立oracle。旧CLI差分仅去snapshotId/openedAt，默认0保持，新reader边界明确验证。真实有界设计保持partial，不替代物理或全设计签核；未变化全Core/协议SDK/UI/工程加载/跨平台/远端CI未执行不计通过。

### 测试域依赖的最小间隔（DESIGN7.28）

构建`dft_memory_dependency_gap_unit dft-memory`，运行`ctest --test-dir BUILD -R '^a_memory_dependency_gap_' -V --output-on-failure`。手算多步骤/多控制器前置完成屏障、多前置取最大、同波共享一次计费、中间波抵扣、资源恢复覆盖与新增等待分解、预算原子性及比较正反向差值。文件/config/rules贯通覆盖与联合评估，严格Schema和新旧reader验证；三配置全memory/相关sequential与B57–63原冻结复跑、旧CLI仅去snapshotId/openedAt做对照。真实有界输入保持partial；未变Core/IPC/UI等全套和远端CI不记通过，A不代B/C独立验收。

### 共享资源占用分析（DESIGN7.29）

构建`dft_memory_resource_usage_unit dft-memory`，运行`ctest --test-dir BUILD -R '^a_memory_resource_usage_' -V --output-on-failure`。核原source不变、原wave/entry见证、同域/多步骤/重叠资源、短entry至屏障预留、等待不算占用、未使用零值、上游partial、精确work/uses整波提交、预取消/过期/拥有性。文件/config/rules等价、严格新Schema与旧reader边界；三配置受影响memory/相关sequential及B57–63原冻结保持，旧CLI对照只归一运行标识。真实有界设计保持partial，未变Core/IPC/UI全套及远端CI不冒通过。

### 多配置资源占用比较（DESIGN7.30）

构建`dft_memory_resource_comparison_unit dft-memory`，运行`ctest --test-dir BUILD -R '^a_memory_resource_comparison_' -V --output-on-failure`。手算占用/峰值正负差值；独立按名称和域集合核矩阵，覆盖重排/域变化/缺失与未使用、2..8配置、长UTF8名、逐配置预算、上游partial/参考partial、预取消/过期、先验证与拥有性。原source及逐配置usage与独立原接口逐JSON等价；严格Schema检查status/index/delta存在关系，不冒跨数组关联由Schema保证。三配置受影响memory/相关sequential与B57–63原冻结不改，旧CLI只去snapshotId/openedAt作差分。真实设计仅有界partial验证；旧reader接受原配置/source、拒新模式/格式。未变全Core/IPC/UI/工程迁移或远端CI未跑不计通过。

### 资源单元需求与容量（DESIGN7.31）

构建`dft_memory_resource_units_unit dft-memory`，运行`ctest --test-dir BUILD -R '^a_memory_resource_units_' -V --output-on-failure`。手算不同域需求/默认1、同域多控制器、独立数量与单元容量、重叠资源、晚拒绝不占位、单步阻碍及依赖/coverage传播；逐work截止核整波原子性、uses预算、预取消/过期/拥有性。CLI独立按成员重算单元峰值及容量，严格输入与Schema、默认0/空数组归一、比较默认基线和partial。三配置当前analysis及消费者重编，复跑受影响memory/相关sequential及B57–64原冻结；旧CLI仅去运行标识差分，旧reader拒新字段/原因。真实有界设计保留partial，不冒全设计或物理签核。未变全Core/IPC/UI/工程迁移、跨平台和远端CI未执行不计通过。

### S2 资源不可用时段（DESIGN7.32）

受影响目标新增 `dft_memory_resource_availability_unit`，CTest `a_memory_resource_availability_unit` / `a_memory_resource_availability_cli`。
验证半开边界、多个资源连续冲突/相同起点、过期区间、unused资源、同波共享计费、恢复/依赖等待归因、精确work/duration原子截断、覆盖/占用/比较、先验证/取消/拥有性和严格Schema。
沿原release/debug/ASan配置及B57–64冻结回归，默认旧CLI仅归一snapshotId/openedAt作差分；真实NX9000/OpenC910有界调查保持partial，不能计作全设计完成。实际命令、产物hash及限制见本轮证据。

### S2 共享资源分区归属（DESIGN7.33）

新增目标 `dft_memory_resource_partitions_unit`，CTest `a_memory_resource_partitions_unit` / `a_memory_resource_partitions_cli`。
核同域不同partition、空/通配区别、capacity/power/units/recovery/calendar、原成员索引/整波预算、比较身份优先级及Schema/旧默认回归。
三配置运行受影响memory/相关sequential及B57–64原冻结；真实NX9000/OpenC910仅有界partial。为控制磁盘占用，全验证后保留Release CLI、产物hash和metadata，清理本人本轮其余构建生成物，不删历史reader或复用库。

### S2 日历等待的安全整数发布范围（DESIGN7.32）

CTest `a_memory_calendar_wire_range_cli` 使用两波各16007ps的已有RTL，核等待10^12、10^12+1、累计恰2^53−1、duration/work原子截断，以及timing、coverage、usage、test comparison、usage comparison、assessment、assessment comparison七种完整Schema/source等价。占用不包含日历等待，正反差值和partial禁delta保持。实际嵌套输出的非正/非整数/超安全整数等待仍拒绝，恢复与依赖等待的10^12上限保持。

```sh
ctest --test-dir build -R a_memory_calendar_wire_range_cli -V --output-on-failure
```

本项修复B-S2-65-01/C-S2-20-01所指Schema范围矛盾，A复跑不代替B/C独立关闭。

### S2 分区限定的域依赖（DESIGN7.34）

构建 `dft_memory_dependency_partitions_unit dft-memory`，运行
`ctest --test-dir BUILD -R '^a_memory_dependency_partitions_' -V --output-on-failure`。
原生验证同域不同分区的阻碍隔离、空/通配、缺失前置、同域对多边、匹配前置波屏障、恢复/日历组合、work/duration整波原子性、输入先验证/预取消/过期/拥有性。
CLI 以显式八控制器声明和全扫描参考重算调度及历史波时间，贯通独立文件/config与七类完整报告、共享source等价和严格Schema反例。
三配置重编当前analysis及消费者，复跑受影响memory/共享sequential与B57–65原冻结。旧CLI只归一snapshotId/openedAt做差分；新字段由旧严格reader拒绝。
真实设计仅有界partial；未变化全Core/IPC/UI/工程迁移、跨平台和远端CI不计通过，A自测不替代新增契约独立验收。

### S2 分区测试周期（DESIGN7.35）

构建 `dft_memory_clock_partitions_unit dft-memory`，运行
`ctest --test-dir BUILD -R '^a_memory_clock_partitions_' -V --output-on-failure`。
核精确分区优先于域默认/顺序无关、原索引和unusedClocks、重叠/重复/空与通配/UTF8及总量、先验证/预取消/过期、整波预算和拥有性。CLI贯通手工/config及七种完整报告，使用显式16cycles步骤的全扫描周期参考；三配置运行受影响memory/共享sequential及原B57–65冻结，旧命令只去snapshotId/openedAt作差分。新字段旧reader拒绝；真实设计只计有界partial，不替代独立B/C验收。

## Wrapper 边界消费者

显式分析构建新增 `dft-wrapper`、`dft_wrapper_unit`；定向命令：
`ctest --test-dir <build> --output-on-failure -R '^a_wrapper_boundary_'`。
API 核位重排/共享 occurrence/嵌套边界/事件及条件角色/循环/原子位前缀/取消/拥有性；
CLI 核真实 RTL、严格新增 Schema、参数和退出政策、24组固定 seed 位重排参考。
layering 为 Slang include 的预期失败负控制。三配置消费者验证不等于全 Core 或 UI 验收。


### Wrapper 单元建议（DESIGN7.37）

新增构建目标 `dft_wrapper_plan_unit`；运行
`ctest --test-dir BUILD -R '^a_wrapper_(boundary|plan)_' -V --output-on-failure`。
新 native/CLI 覆盖重复别名、重叠寄存器事实、occurrence 分离、控制路径、显式位规则/冲突/unused、
候选数门限、源质量保留、原始调查相等、拥有性/预取消/确定性deadline、逐work原子前缀。
24组seed224实际RTL使用Python位集合独立计算候选与全局并集；严格Schema负控制保留。
三配置重编分析消费者，回归原wrapper及sequential/catalog/memory相邻调用；旧默认CLI逐调用对照，
旧reader拒绝新flag/格式。真实RTL仅有界partial，不把结构规划宣称扫描插入或物理安全。


### Wrapper 逻辑链组织（DESIGN7.38）

构建 `dft_wrapper_chains_unit dft-wrapper`，运行
`ctest --test-dir BUILD -R '^a_wrapper_(boundary|plan|chains)_' -V --output-on-failure`。
新增native核共享区间分裂/复用位置、别名/方向、跨链冲突与容量失败的暂存回滚、后续复用、
规则unused、段数/work/rows原子前缀、原source相等、拥有性/预取消/确定性deadline。
CLI执行24组seed225实际RTL别名与逐位链声明，以独立字典分配参考验证位置/容量/冲突；
核严格Schema、静态拒绝、旧reader拒新flag和原默认/单元规划输出兼容。三配置执行新旧wrapper
及共享sequential/catalog/memory定向回归；真实设计只作有界partial，不外推全芯片或物理扫描安全。

### Wrapper 配置输入（DESIGN7.39）

新增 `dft_wrapper_config_unit` 和 `a_wrapper_config_unit/cli`。实际RTL验证三模式配置与
手工参数完整报告等价、共享链/容量/预算/源partial、所有选项冲突先于Design打开、严格Schema、
未知/重复字段/精确数字/非法UTF8/字节上限、目录/FIFO/符号链接、预取消与拥有性。
共用有界输入实现的提取同时运行原memory library-input/test-config原生与CLI，及旧wrapper全部。
三配置命令 `ctest --test-dir BUILD -R '^a_(wrapper_|memory_(library_input|test_config)_)' -V --output-on-failure`。
旧命令逐退出/JSON对照仅去快照运行标识和分页游标精确身份段；旧reader拒新--config。
真实设计只做有界配置/手工等价，保留partial；未变全Core/IPC/UI/工程迁移/远端CI不计通过。

### Wrapper 多方案比较（DESIGN7.40）

新增 `dft_wrapper_comparison_unit` / `a_wrapper_comparison_unit/cli`。真实RTL核同源原API全等、
共享/专用/排除的手算位资源、正负差值、链名重排/新增/移除/未使用、2..8配置、partial门禁、
逐work/链数整行前缀、确定性矩阵截止、预取消与拥有性。24组seed227声明式位集合独立核算，
新严格Schema控制delta存在关系和局部索引，CLI全请求在Design打开前验证。定向命令
`ctest --test-dir BUILD -R '^a_wrapper_' -V --output-on-failure`，并跑相邻sequential/catalog/memory输入回归。
三配置重编当前analysis与消费者，原单方案命令只去快照身份后逐输出比较；旧reader拒新选项。
真实设计仅有界比较且保留partial，不当全芯片或物理安全验收，新增能力不冒独立B/C已通过。

### Wrapper 逐位链覆盖（DESIGN7.41）

构建dft_wrapper_coverage_unit/dft-wrapper，运行`ctest --test-dir BUILD -R '^a_wrapper_' -V --output-on-failure`。
真实RTL检查原报告全等、逐端口位三层索引、共享/专用/别名/碎片区间位置、inout分向汇总、
首要阻碍与pending区别、位置满后无位置行、每work和新端口组原子回滚、拥有性/预取消/确定性deadline。
24组seed228独立位字典分配核状态、链位置、容量/冲突，不使用产出segments生成oracle；严格Schema负控制。
三配置运行wrapper和相邻sequential/catalog/memory输入回归，旧binary逐命令完整JSON对照，真实设计仅有界验证。
未变全Core/UI/IPC/工程迁移/远端CI不计通过，作者验证不代独立B/C验收。

## Wrapper 链共享状态功能时钟（DESIGN7.42）

新增目标`dft_wrapper_clocks_unit`，CTest `a_wrapper_clocks_unit`/`a_wrapper_clocks_cli`；CLI测试
由Python3.12/jsonschema执行`analysis/tests/wrapper-clocks.py <dft-wrapper> protocol/schema/hier.schema.json`。
连同原wrapper boundary/plan/chains/config/comparison/coverage回归执行，独立生成RTL时钟/边沿
oracle及手算实例检查别名、分页完整性、跨层反相、混钟、重叠写者、未知源、预算/取消和拥有性。

隔离驱动E记录源hash、实际构建/CTest命令双流和15同配置clean底层库hash，Release/Debug/ASan
重编当前analysis/消费者。`python3 E/build.py <release|debug|asan>`、`python3 E/test.py <mode>`，
`python3 E/compat.py`重放716对旧wrapper命令；`Python3.12 E/real.py`在NX9000/OpenC910各跑
原规划及功能时钟/行/work/事实预算共5次产品调用，保持真实原报告partial。旧输出比较仅归一
snapshotId/openedAt及m3 next中的精确身份段，不删除游标其它内容；新Schema不替代原Schema。
新时钟结果的complete表示证据完整而非混钟可接受，不证明scan测试时钟/物理实现。
全Core/SDK/IPC/UI/E2E/远端CI未执行不计通过；A新增用例不替代B/C独立验收。

## Wrapper 链异步控制保持约束（DESIGN7.43）

新增`dft_wrapper_resets_unit`与`a_wrapper_resets_unit/cli`，执行
`ctest --test-dir BUILD -R '^a_wrapper_' -V --output-on-failure`，并跑相邻sequential/catalog/memory回归。
RTL覆盖反相/层次、reset/set、同源相反电平、总线输入位、未知原事件、常量0/1/X、专用/空链、
源时钟未知但异步来源已知；已知冲突不掩盖其它未知。逐work和row/event预算核整行原子提交，
预取消、确定性deadline、返回拥有性及原ClockReport全等。CLI 20组seed226声明式独立生成约束oracle，
严格新Schema负控制和手工/配置等价；不修改B独立测试。

隔离E/build.py重编17个analysis及消费者目标，E/test.py在Release/Debug/ASan跑29个CTest，
核15个同配置clean底层库hash；E/compat.py对照860对旧wrapper命令，旧reader拒绝新flag。
真实NX9000/OpenC910仅作有界事实/约束及预算验证，保留source partial和inputHashComplete，
不外推全芯片。全Core/SDK/IPC/UI/E2E/远端CI未执行；作者自测不替代B/C独立验收。

## Wrapper 链功能控制兼容性（DESIGN7.44）

目标dft_wrapper_compatibility_unit、CTest a_wrapper_compatibility_unit/cli。定向运行
`ctest --test-dir BUILD -R '^a_wrapper_' -V --output-on-failure`及相邻sequential/catalog/memory回归。
核同Design原ResetReport全等、单链默认与显式集合、跨集合复用/组内拒重复、同源不同bit、clock/hold相互冲突、
常量/混钟/未知共存、专用未定义、局部complete与source partial、预算整组提交/拥有性/预取消/确定性deadline。
独立生成RTL按声明的源/反相/边沿/成员集合推导期望，严格新Schema正负控制；原B oracle不改。

隔离E/build.py各18目标、E/test.py三配置各31CTest，15同配置clean底层库核hash复用。
E/compat.py对照999对旧命令，旧reader拒新flag；E/real.py在NX9000/OpenC910做有界默认/显式集合/预算，
source partial保持，不外推全芯片。未变Core/IPC/UI/E2E/远端CI等未跑，不以作者自测代替独立B/C。

### S2 Wrapper 自动活动批次

新增目标`dft_wrapper_activity_unit`及`a_wrapper_activity_unit/cli`；执行
`ctest --test-dir BUILD -R '^a_wrapper_' -V --output-on-failure`，加相邻sequential/catalog/memory回归。
新native检查first-fit、容量、已知冲突与未知/专用/空链、原source全等、逐work完整前缀、批次上限的尾部接纳、
取消/静态错误/确定性deadline/拥有性。CLI按独立RTL声明生成电平和clock约束并计算first-fit答案，逐批次用原显式集合模式交叉核验。
旧命令完整输出对照验证共用内部单组判据提取未漂移；仅归一快照身份和m3游标已知长度身份段。
三配置隔离重编analysis/消费者，同配置clean底层库核hash复用，不编历史Core WIP；新阶段为软预算，真实芯片只做有界检查。
实际命令、退出和范围记录到本轮证据，不以A自测冒充B/C验收。

### S2 Wrapper 功能活动脉冲时序

目标`dft_wrapper_schedule_unit`，CTest `a_wrapper_schedule_unit/cli`。运行相关wrapper及sequential/catalog/memory定向回归。
新native核同Design原activity全报告相等、正负有效边沿/反相、高低保持电平、逐work/rows/ticks边界及优先级、
safe整数精确上下界/累计容量、零setup/空链/未知/专用、预取消/确定性deadline/拥有性。
新CLI按独立RTL源反相与边沿声明计算批次，小脉冲显式展开目标/返回事件作时间参考，大脉冲验证恒定大小表示和精确整数。
严格Schema正负验证、手工/配置输入全等、原命令退出/完整JSON比较；只归一快照身份及游标精确身份段。
三配置隔离重编当前analysis与消费者，复用已核hash同配置底层库，真实设计只作有界partial/预算验证；不计为扫描协议或物理时序验收。

### Wrapper CLI 诊断闭环（DESIGN7.47）

目标dft_wrapper_explanation_unit，CTest a_wrapper_explanation_unit/cli；三配置连同原wrapper及相邻sequential/catalog/memory回归。
验证原兼容报告全等、原cell/boundary/clock/reset索引、声明位置与contentHash、定位去重、冲突/未知/空/pending、预算整链提交、
预取消/确定性deadline/拥有性、JSON/text同一模型与字符串转义；错误仍为JSON，旧命令逐退出/完整JSON对照。
生成RTL的声明行号独立核对，临时配置从已知冲突改为显式排除再运行，不改B oracle。
NX9000/OpenC910只读真实RTL，实际CLI text→快照路径/hash/行号→修改临时约束副本→JSON/text复验；保留未调查范围的partial。
该验证不等于Studio宿主Scan闭环、自动修复或扫描插入认证。新接口为analysis消费者，Core/IPC/UI/工程迁移未改不冒充通过。

### Wrapper CLI 安装交付（DESIGN7.48）

CTest `a_wrapper_install_cli`使用真实CMake WrapperCLI组件，安装并搬移到含空格/Unicode的prefix，从空cwd运行包内原生示例并核完整JSON/text与构建binary一致。
校验包内所有文件hash与Schema依赖闭包、重复安装清单稳定、DESTDIR及自定义相对bin/data布局。自定义布局用最小CMake安装consumer加已构建native字节，不冒充另一次完整产品重编。
负控制覆盖缺文件/内容修改/链接/非法与重复清单/数值类型、禁止覆盖归档及sanitizer发行拒绝。所有破坏仅在临时安装树。
连同原wrapper与相邻回归三配置执行；正式Release归档在另一个prefix解包后运行真实设计有界诊断/定位/约束副本复验，保持partial。
不声明跨平台通用二进制、非系统库自动收集、签名或公证；Python verifier是字节校验，不是来源认证。原C++/CLI/Schema不改，不重复扩独立B冻结或UI门禁。

### 原生 Analysis CLI 套件（DESIGN7.49）

`a_analysis_install_cli`使用标准AnalysisCLI组件安装/搬移四个真实命令，包内全部Schema逐份check_schema、原URI唯一和引用闭包离线验证。
四工具version/help及五份完整报告与构建binary比较，独立核时序事实数、对象过滤、显式内存规划时长、Wrapper冲突/排除后复验。
核原Wrapper组件同prefix共存、两清单独立、重复安装/DESTDIR、套件严格格式/四命令身份及缺文件拒绝、发行成员/权限和无覆盖。
受控installer返回合法旧组件时，显式AnalysisCLI请求仍须拒绝且回收临时prefix，不能依赖文件数猜组件。
相关原回归连同旧Wrapper安装三配置执行，Release包隐藏源/构建后运行四工具及真实设计有界输入；保留partial，不作全Core/Studio/跨平台结论。

### 四工具原生报告导出（DESIGN7.50）

`a_cli_output_unit`通过受控Main回调验证0/1/4发布、2/3/5/130及其它错误不发布、异常和坏流恢复、参数字节/argv终止符、链接/已有文件及父路径错误。
发布竞态由同一回调在发布前写入目标，确定性证明无覆盖和清理，不用sleep竞速。该私有入口不冒任意中途取消或多线程安全。
`a_cli_output_cli`调用四个真实工具对照控制台/文件原完整JSON及原Schema，含partial、seq检查失败、Wrapper text及--output字面过滤值。
核错误仍控制台、旧结果bytes+mtime、私有输入副本不被截断、符号链接、前缀严格语法和临时目录回收；原分析/安装回归三配置执行。
Release安装包隐藏源/构建后在真实设计有界调查中导出报告，核文件Schema及partial退出，原RTL只读。未作fsync/断电、强制kill清理或跨平台验证。

### C-CLI-26-01：自定义布局一致性

`a_cli_install_paths`覆盖默认、./bin、./share、内部./及重复/末尾分隔符、Unicode/空格和prefix根目录共7布局×2组件。
只配置真实analysis/CMake安装注册，复制当前同配置原生四工具并逐hash核同，不编译替身或声称每布局另一次完整产品重编。
核安装→搬移→verify、规范唯一排序/kind/元数据/默认逻辑文件集合相等、真实Wrapper报告导出与原Schema、重复/共存/DESTDIR、归档/解包/不覆盖及sanitizer拒绝。
两种目录各10个非法值在configure拒绝，手工./清单仍由未修改的verify拒绝。成功样本的重复native/归档在保存hash、manifest和命令流后删除以约束磁盘；失败现场保留。
原41回归三配置及B71固定路径回归原样复验分账，不能冒B新验收或C关闭；其他领域/Studio/跨平台范围不扩大。

### CLI 发行归档复现

`a_cli_bundle_repro`对真实WrapperCLI/AnalysisCLI、默认/Unicode长路径重复标准CMake安装并逐字节比较tar.gz。
解析gzip header、全部tar成员/原payload hash、排序、权限及PAX路径；受控`--cmake`复制真实安装树扰动mtime/模式，字节仍相等。
合法修改README及对应manifest hash后归档必须不同；解包/严格verify/真实原生版本、旧目标/链接保护及归档中途写入异常清理保持。
该异常只用测试进程内mock，在已写第一成员后确定性失败，无生产hook或sleep竞速。ASan仅验证发行拒绝，不伪装成非sanitizer包。
同工具链是复现边界，跨压缩库版本、签名/来源认证或恶意并发filesystem未作承诺；前述受影响回归继续三配置执行。

### 安装清单文本边界

`a_cli_install_text`用Python严格UTF8解码和控制字符分类独立判定CMake检查器的期望，覆盖全部可表示C0/C1、UTF8边界/非法序列和固定种子字节。
真实组件验证bin/data、system/processor、配置名称在configure拒绝坏文本；生成脚本单独执行时再拒绝动态非法configuration且不改旧清单bytes/mtime。
补充平面/组合字符目录和含引号、反斜杠、分号、美元及CMake形式的metadata须逐字节往返，不能被生成脚本解释。
两组件安装/strict verify/原生版本/归档解包保持原文件数，sanitizer不发行。生成脚本嵌入同一Text.cmake实现，不额外安装helper或依赖Python。
本次无C++改动，可核hash复用前turn同配置真实产品，在当前CMake/当前源测试下运行；须明确复用、配置/负控制编译与实际重编的区别。

### 已有分析 CLI 的 Node 宿主（DESIGN7.53）

`npm --prefix analysis/host test`执行真实子进程边界测试：原退出码、UTF8/对象边界、argv/cwd、不启动预取消、
READY握手后取消/并发隔离、忽略SIGTERM后的回收、超时/双流上限、日志回调副本/失败及幂等dispose；不靠sleep竞速。
这些受控fixture只证明进程边界，不冒领域端到端。原native通过独立`npm --prefix analysis/host run test:native`调用：
必需环境NATIVE_ANALYSIS_BIN和NATIVE_ANALYSIS_DATA指向真实AnalysisCLI安装，缺少时失败而非skip。
完整JSON比较只归一snapshotId/openedAt，Wrapper text只归一Snapshot行；四工具partial、seq检查失败、参数/设计错误及约束修改复验保留。
原Schema在独立离线registry验证原报告，npm pack后空目录消费者安装/import并严格tsc检验公开声明。
无C++/Core/旧SDK/IPC/UI/工程格式修改时不重复其完整门禁；具体原生复用SHA、实际配置与未执行项在证据中分列。

### 设计会话绑定与旧结果（DESIGN7.54）

`npm --prefix analysis/host test`保留原16项，新增会话快照/品牌/同输入换代、clear、替换中dispose、并发拒绝与多child回收。
READY握手取消不用sleep；在原公开Host结果Promise外包一层测试调度，真实child先close再换代、再释放原结果，确定性核发布前防线，无生产hook。
`test:native`保留原四工具报告对照并新增同一RTL经-f/-F/直接文件、include/宏驱动四工具，核共同inputHash与完整报告原Schema。
两条3位RTL状态输出应为6个bit事实，宏改2位后为4；显式内存例子16操作/1000ps为16000ps，Wrapper原冲突/排除后复验和partial保持。
npm包外消费者按包名运行同一组原Host与新会话案例，旧/新类型消费者共同strict tsc；示例调用真实4工具。
记录输入/命令流及任何测试维护，不把fixture或A自测称独立B/C验收，不冒Studio任务/IPC/UI完成。

### 原报告消费与匹配源码（DESIGN7.55）

Node reports测试复用原66Schema，明确坏结构/工具/版本/text/可变payload、不可伪造报告、过期代际及资源上限。
真实文件验证UTF8/CRLF/BOM/字节→UTF16、改盘摘要拒绝/缺失/目录/FIFO、预取消、真实FileHandle.read完成后的取消/换代及handle.fd=-1；无生产hook或sleep竞速。
新增可选报告入口执行原Schema，原28进程/会话测试保持；三配置真实四CLI验证原报告/错误、原SourceSpan及源码片段。
随包report-source-workflow复制临时输入：原Wrapper冲突→摘要匹配片段→修改临时约束→setDesign换代→原JSON复验，不能冒自动修复或Studio接线。
空目录离线安装实际固定依赖，按reports子路径使用；strict tsc、原根导出和许可/锁及npm包成员核验。
任何早期测试观测错误保留失败记录，不改原B oracle或生产Schema取绿；原Core/Studio/UI/IPC/迁移/跨平台/远端CI不新跑不计通过。
