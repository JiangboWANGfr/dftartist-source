# Agent B：M5固定Selection实现独立复验

## 结论与固定对象

**B-M5-RUNTIME-01通过：固定cfd22ff的L6 Selection基础单元可验收。**
原241项、生产33项类型负对照及消费者通过；本人fresh优化/Debug/ASan+UBSan
标准检查75/75、78/78、80/80，原499全集和新增B真实Core集成6项在三配置中均通过。
未发现新的确定产品缺陷。C-M5-SELECTION-IMPL-01已在最新REVIEW_LOG通过；
该审查是前置事实，不转记为B执行。C-70保持关闭。

这不是整个M5或Tree/Source/React/Electron验收。新增6项不在现有默认门禁登记中，
本轮显式运行；不把499与其包含的241/258重复相加，三配置重复运行也只计同一覆盖一次。

| 固定对象                | 值                                                                                 |
| ----------------------- | ---------------------------------------------------------------------------------- |
| 产品                    | cfd22ff76d0480671d41b72a2b2f628977098306                                           |
| A结果交接元数据         | ff728d31b7f765ccb08cfeb079300e730fc95996                                           |
| 获认可的修改前契约/基线 | 61a7ffea22d202393d9373c192367f2c36d708b3                                           |
| 原B冻结                 | 27654c9f90d6b9ab209582a15c482bd844ea3504、264736f5786089f5cf58f6abe40120add990b2da |
| 本轮B测试树             | dft_hierachy-test-m5，test/m5；起点6e1b4d0380d87fcd3b1d356eec6a20e331b53f66        |
| 自有产品目录            | /tmp/hier-b-m5-runtime.Z5FAel/source，detached cfd22ff                             |
| 最终新增6项冻结         | c3bbbe8afb009e2cebe389f6ebadf1356e67feb0                                           |
| 环境                    | macOS26.0.1 arm64，Node24.21.0、npm10.9.2、TS5.9.3、Prettier3.9.10                 |
| Native/Schema工具       | Apple clang17.0.0、CMake4.0.2；B独立Python3.13.3/jsonschema4.25.1                  |

当前DESIGN SHA b1e33cc7a43d7b6bc7bfa5e9e1f6a97283f934bd80383ce92bfa55b43aedaa02；
§6.5正文对61a7ffe除已关闭C-70的状态文字外保持。
Schema SHA 30a9ca285b813202b5a9867485a6d301cbd450b31098c582542c3a11c89a1420；
SessionContract SHA 0295e91ce7b1aac4d8b2a7a9011686f431a787e27747a45309ae6cb636901af6；
提案声明 SHA 80f5e7a1ed1cc2c539c162057212a11a15cdd6fb3ab132942f0f8801d2bfb4e9。

## 独立性、验收条件与覆盖

先读最新日志/用户决定、DESIGN、AGENTS及执行/验证/协调规则。
共享日志包含A实现说明和自测摘要，故不宣称严格盲验。
没有读取A运行时源码、实现diff、新增集成正文或自测消费者/机器输出来定义或修改预期；
只读构建配置/公开声明来装配测试。所有下面的通过均为本人新执行，不借A/C产物或统计。

[原选择冻结报告](M5_B_SELECTION_FREEZE.md)与[C-70补冻报告](M5_B_C70_FREEZE.md)
保留原始验收分组、输入、判断依据和历史红基线，本轮不改写。
159项S01–S10、80项G01–G08及原两项完整执行，重点为：

- 合法/非法字段、容器和数值边界；读取顺序/次数、继承getter/Proxy、原抛值cause及异常优先。
- 构造与快照绑定、ref/def互斥、精确位段/side、有序去重、origin回显与深冻结。
- history分叉/容量/边界/重复操作，back/forward恢复；非法操作不污染状态或forward。
- 输入/通知期重入和dispose、独立登记/退订、AggregateError顺序、已提交状态及旧发布值有效。
- 生产正例与33条逐点真实类型负诊断、strict/exactOptionalPropertyTypes、readonly/getter/cause消费者。

新增[真实集成](../web/tests/independent-integration/selection-core.test.mjs)
的输入全部来自原B fixture `core/tests/fixtures/m4/sdk_core.sv`，
SHA 168e53cf62cadc6d9bb90a46ce038a2904462c6db150abfb1a5267c49b5b0a3d。
仅调用公开SelectionModel、HierClient及原createProcessTransport，
不改wire/请求ID/回包、不替换Transport、不用私有hook或sleep竞速。
ObjectRef/SnapshotId只作不透明句柄关联，不从其字符串猜对象事实。

| 用例                     | 输入                                                                   | 必须可观察的结果与判断依据                                                                                                                             |
| ------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| B-Core-01 属性与导航     | ready快照/root；d端口、bits{lsb:1,width:2}、inside、tree/props两次选择 | fixture端口按clk/rst_n/d/y/q排列，d方向in/宽4；object为原port/owner；查询不改选择；back/forward及通知精确恢复选择/位段/origin。§4.3、§6.5              |
| B-Core-02 定义与分页候选 | leaf定义，instancesOf limit1两页，调用方明确选第二项                   | 定义保持def、不猜实例；两页恰为u/v，无重漏/末页next；显式选择v才变occurrence，历史仍能恢复def。§5.5.5、§6.5.1                                          |
| B-Core-03 独立释放       | 选root后model.dispose两次，再查询共享SDK                               | bound模型回初值、旧select为disposed、旧冻结值可持有；roots/ports仍成功；client另行dispose后实际进程自然退出code0/signalnull。§5.6.5、§6.5.4            |
| B-Core-04 重开与旧投递   | 同fixture重开第二真实进程；旧Core回复已到，显式屏障延后应用层投递      | 新snapshot不同而inputHash相同；旧模型/SDK/Core已关闭；旧选择在新模型为snapshot_mismatch，旧投递为disposed；新状态/通知及查询不被污染。§5.6.1、§6.5.2/4 |
| B-Core-05 Core领域错误   | 顶层y(out/宽4)选择outside；drivers请求带合法slice/reach=local/side     | 模型只验结构，合法送Core后为HierError(core)/bad_request且保留诊断，不伪装本地SelectionError；状态保持，后续inside查询成功。§4.3、§5.6.5、§6.5.1        |
| B-Core-06 单面板关闭     | 两个选择订阅，重复退订其中一个；继续选clk(in/宽1)并查object            | 已取消登记不再收到；其它登记、模型、SDK及Core仍正常。§6.5.4                                                                                            |

每项session注册清理，显式检查真实transport.exited；20秒只作测试上限，
不据此声称取消SLA/实时延迟保证。第4项是**已收到Core回复后的应用层旧回调隔离**，
不是Core执行中取消。第2/6项是无界面消费者，不是实际候选面板/GUI关闭测试。
错误已验证到公开L5/L6边界，尚未验收UI展示/重试。

## 本人实际执行与三配置来源

[计划](plans/B-M5-runtime.md)与[机器证据](m5_b_runtime_reverify.json)
提供关键命令完整argv/cwd/exit/耗时/stdout+stderr压缩输出、配置/日志及来源审计。
所有最终测试批次0skip/0todo/0cancelled；初败另见下一节。

| 实际命令/集合                                                                                           | 结果                                                                                                          |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| npm ci --ignore-scripts --no-audit --no-fund                                                            | exit0；锁定71包，锁文件不变；未执行audit                                                                      |
| npm run check                                                                                           | exit0；195定义/27方法生成一致，四包构建，25模块/50依赖及7违规负探针通过                                       |
| npm run test:independent:m5；三文件原字节raw TAP                                                        | exit0；均241/241，包含旧两项；重复批次不相加                                                                  |
| node tests/independent/verify-selection-types.mjs production                                            | exit0；原消费者0诊断，33/33负例在各对应行得到真实诊断，不用缺import代替                                       |
| tsc -p tests/independent/tsconfig.selection-production.json                                             | exit0；原B消费者解析实际生产导出，无提案paths替身                                                             |
| tsc -p contracts/tsconfig.selection-read-stage-production.json                                          | exit0；原B getter/cause消费者原字节，配置仅为生产解析适配                                                     |
| 标准./check.sh，fresh三配置                                                                             | exit0，550.198秒；75/75、78/78、80/80；SDK单测27、M4独立258、现有真实SDK/Core集成3、选择241及生产类型门禁通过 |
| HIER_BIN指本人build/build-debug/build-asan/hier，分别npm run test:independent                           | 三次exit0，均499/499；含258+241，不与子集重复计数                                                             |
| 本人优化HIER_BIN，npm run test:core                                                                     | exit0，3/3；A编写的集成本人复跑，不冒称B自写或独立6项                                                         |
| 本人三份HIER_BIN，node --test --test-reporter=tap tests/independent-integration/selection-core.test.mjs | 三次exit0，均6/6；B独立新增，未纳入旧499或标准check                                                           |
| ctest登记/配置/生产flags、原字节/来源/第三方核验                                                        | 最终exit0；详见机器证据及初败分类                                                                             |

标准实际入口：

```sh
PATH=/Users/jiangbowang/.npm-global/bin:/opt/homebrew/bin:/usr/bin:/bin \
HIER_SCHEMA_PYTHON=/tmp/hier-b-m4-schema.UweewL/bin/python JOBS=4 \
/usr/bin/caffeinate -dimsu ./check.sh
```

三构建目录此前不存在；预配置仅复用六份已核HEAD且clean的**第三方源码**，
绝不借主树/A/C/历史目录产品二进制或对象。构建后再次核pins与clean。
slang/catch2/fmt/mimalloc/tomlplusplus/boost_regex完整提交见机器证据；
Slang源码ID 07b9237d652d3a61abd674ae487791fcd97fc0b0a896a6c797b879f4620480db。

| 自有目录         | 构建类型       | observer | ASan+UBSan | CTest/用时      | hier SHA256                                                      |
| ---------------- | -------------- | -------- | ---------- | --------------- | ---------------------------------------------------------------- |
| core/build       | RelWithDebInfo | OFF      | OFF        | 75/75，17.05秒  | ef0c5d950be4e8e8e22ff78482ca8ce71e7c71d1f8dbaecb5e3ab90f1783771a |
| core/build-debug | Debug          | ON       | OFF        | 78/78，38.73秒  | 49bab12ca93f893dbccdf054483496f4a4f638eadbc0a4ab8526eb8254e32420 |
| core/build-asan  | RelWithDebInfo | ON       | ON         | 80/80，130.83秒 | 252b71a68d7879a9ebff388a7d9883b1baf7aadfcf40a9437909b095696f8975 |

三份M3/FUTURE ON、experiments OFF。分别核实际登记75/78/80；
完整运行含M4原raw65/projection/Schema-C++/stdio/worker及M1–M3回归，
不以ctest零匹配取绿。compile_commands逐份归档；
每配置137个Slang翻译单元及27个项目生产翻译单元的sanitizer flags与配置一致，
项目生产编译保留-Werror。记录的是实际登记/执行集合，不借A/C的不同范围计数。

每份fresh build.log实际有**6条重复库链接warning**，不是“零警告”。
Core及构建元数据对61a基线未变；这是本机已有的冷构建链接警告，完整原文保留。
Debug/ASan初次预配置还因禁用mimalloc而报告未使用的
FETCHCONTENT_SOURCE_DIR_MIMALLOC变量；未修改生产配置消警告或放宽门禁。
未出现最终ASan/UBSan错误报告；该执行不等于全部资源/GC/M7保证。

## 新测试修订、初败与旧基线

本轮仅纠正B新增测试的两处装配缺陷；原241/33、领域预期及产品均不改。
修订均有**修改前61a权威Schema**独立证据，不从实际实现生成expected：

| 新6项版本                                | 当前产品结果 | 分类及修订依据                                                                                                                                                                  |
| ---------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| d083ea7f11e05aab74c881077af909430d45664c | 6总/3绿/3红  | B把HDL input/output当wire Direction；原Schema一直只允许in/out/inout/ref/unknown。纠正三处字面值                                                                                 |
| 92e3df7a77a2bee2535707685c3d816f5fccdede | 6总/5绿/1红  | B漏ConnDriversParams必填reach，合法进入Core的前置不满足，正确被SDK以origin=client拒绝；原Schema slice/reach必填且reach无默认。补两次reach=local，不改应为Core bad_request的断言 |
| c3bbbe8afb009e2cebe389f6ebadf1356e67feb0 | 三配置各6/6  | 最终源SHA 72ad8053bf21eb46acf5fa3fdcc9fe305a3af89081ee908e1fbf5ab0416abf85；B树/本轮固定目录/旧61a回放目录三份相同                                                              |

三版source与初败完整输出保留，不把3/6或5/6改写成历史绿，
不跳过用例，不称这些为产品缺陷。共享日志已分别记录测试疑义/规范依据后再另提交。
C只补核方向枚举归因，没有执行本新增6项，不能将B最终6/6追记到C归档。

三个版本均在B自有修改前61a目录回放：**6总/0绿/6缺SelectionModel红**。
入口在启动Core前检查能力，因此旧链没有进入集成语义，不冒称六个领域行为实证错误。
历史241/0绿缺导出与旧生产类型失败仍在原C-70报告/19cfd9ea证据中，
此次不重写为“过去已通过”；当前原字节转绿才是新实现验收。

另保留两项**B归档工具**初败，不是测试/产品错误：

- Native audit最初只按/slang-src/source/过滤得到130，遗漏6生成单元和Compilation.cpp；
  /tmp与/private/tmp的路径也使项目过滤范围不可靠。改为真实生产CMake target，
  增加非空检查并核137 Slang/27项目生产单元后通过。未改flags/源或运行时断言。
- 环境采集误设不存在的全局Prettier路径，ENOENT；改用已实际执行的workspace
  node_modules/prettier/bin/prettier.cjs后通过。未安装/替换生产依赖。

## 来源冻结、限制与交接

对61a逐mode/type/blob核**264个**core/protocol/ci及web client/protocol-types/views路径集合相同，
同时检查没有在该范围新增/删除；这不是A/C304范围。
原22份B web独立文件+6份计划/报告/证据共**28份**对6e1b4d0及当前实际产品字节保持。
原oracle/历史文档不改；自有fixed产品跟踪源干净，只有新增B集成未跟踪；
主树已有REVIEW_LOG/协调/研究文件保留，没有提交共享dirty。

本次只新增B计划/集成/报告/机器证据。不修改产品、公开API/ABI、
协议2/schema7、IPC、依赖/锁文件、工程格式或协调总状态。
本单元没有新的规范歧义需要阻塞；消息/stack精确文本、所有JS intrinsic异常等
未明定边界不擅自立oracle。大history/选择的绝对内存/延迟、GC无泄漏也没有实测保证。

本轮未执行React/Electron/Playwright、Tree/Source实际面板、processor_core/openc910 UI、
Linux/远端CI或M7取消/资源预算。纯L6选择变更不能靠无界面Core链宣布上述纵向能力完成。
首版无持久化，工程保存/加载/恢复/旧格式迁移不适用于本内存单元；
back/forward不是规划事实编辑的undo/redo。旧Linux或他方C/A执行只保留历史身份。

交A：按顺序吸收d083ea7、92e3df7、c3bbbe8和本结果提交，保留原241/33及初败；
新增6项可在后续标准门禁增加独立登记，不能替代旧499或仅放进从未运行的目录。
本fixed Selection无B修复项；可准备M5-A-02树/分页/宿主生命周期具体契约，
对应C审/B冻结前置仍逐单元满足，不能跳成完整M5实现批准。

交C：本固定运行时独立复验已完成，无需重开C-70。
若后续指出B用例有规范反例，由B处理并另冻，不让A按实现改测试。

交协调者：领取、实际证据和交接仅追加REVIEW_LOG，记录本选择基础单元B通过，
不由B改总体状态或宣布后续M5/GUI放行。
