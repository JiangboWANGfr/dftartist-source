# B29 C-93 固定修订独立复验

## 结论、固定对象与独立性

固定产品 **d6d8bae5cebbb1fb2c7b097a22f4ecdc54570e65**（A修复4c71fb7063b1cf03641f126225a22b9598867c47）。
**本B的C-93限定复验通过**：原冻结配置3/3、新历史cache/重复开关/真实错误恢复6/6、原native三配置及标准受影响入口均通过。
最新C29已由提出方关闭C-93，C-92保持关闭；不以C关闭代替下列本B执行，不把本单元通过称作M5整体完成。

B分支test/m5-tree，起点332b829；新独立冻结 **301b7be43e168f4f2fa6f7b3a284f0c13cfbed35**，仅新计划与cache-transitions.mjs。
最终报告提交SHA见主树REVIEW_LOG本轮交接；A可依次导入新冻结和报告提交，均无生产/原B文件变化。
原B26冻结764445d、B28配置冻结1c3599d保持，原17+初3+B28新7在B/main/P共81项逐字同原对象。
DESIGN358529字节/SHA256 **1871b147342e4120a63c119d3c910f40501b385b1ad7fb9e4f68a38e9a6d8f63**，§6.16/§5.5.6不变。

Oracle取规范、原B的HDL/Schema/类型/SDK/C++消费者、B28实际历史cache及本机CMake公开选项。
不从A实现/diff/自测/聊天生成预期；没有读取A新增configure-regression.py来生成B输入。
A编写的新配置回归由B真实执行并封存，明确不将其内层阶段当B新独立业务oracle。
C29认可301b7be输入/设施边界但未代跑6项；本B6/6不是C/A执行。

## 工作目录和环境

M=/Users/jiangbowang/MOI/2025/dftartist/2026.9/dft_hierachy；B为同级dft_hierachy-test-m5-tree。
E=/private/tmp/hier-b-orch29-c93.ANK1sc；P=E/checkout with space 中文（detached d6）；O=E/baseline-fa0（detached fa0cee4）。
N=/Users/jiangbowang/.npm-global/bin/node24.21.0，npm10.9.2、CMake/CTest4.0.2、Apple clang17/macOS arm64、C++20。
默认cwd=B，标准命令cwd=P或P/web；HIER_B_PRODUCT_ROOT=P、HIER_B_BROWSER_TOOLS=P/web，HIER_BIN统一canonical P/core内绝对路径。
完整展开argv/PATH/相关环境/cwd/UTC/耗时/状态和原流封存，不以入队接受/turn结束当实际执行。

6份依赖只复用核定tag/HEAD且clean的**源码**，2403源文件前后hash一致；不复用A/C/B28的产品对象或二进制。
原Core+外部消费者三配置独立cold重编；标准内部消费者再在对应图编译，所有头/库/消费者同版本。
不宣称旧C++二进制ABI兼容；本窄修订没有生产API/ABI/IPC/Schema/默认/序列化或工程格式变化。
专用Schema Python3.13.3及6个requirements版本核同；生成检查显式Python3.12。

## 实际执行

S=web/tests/independent-source-ref-kind。全部输入/正确结果/判断依据沿原S/README、inventory/cases及本轮计划；配置新输入详下表。

| B实际命令（所有绝对参数见机器档）                                                                                                     | 结果/准确边界                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 两份git worktree add --detach；npm ci --ignore-scripts --no-audit --no-fund（P/web）                                                  | 均0，fresh82锁依赖，P/O不作补丁                                                                                                         |
| npm run check（P/web）；Python3.12 protocol/schema/scripts/generate_cpp.py --check                                                    | 0/12.052秒；0/0.061秒，四包类型/196定义27方法/分层及生成一致性                                                                          |
| 原S/c92/build-config.mjs，显式产品O/P、依赖M/core/build/\_deps、E输出                                                                 | fa0 **1/16.114秒，3执行/1通过/2失败**；d6 **0/19.139秒，3/3**。每轮10内层命令，预期保持父0/CTest0/父子allocator一致                     |
| 新S/c93/cache-transitions.mjs，同样显式O/P及自有E                                                                                     | fa0 **1/3.444秒，6计划/1执行/0通过/1失败/5blocked**；d6 **0/13.542秒，6/6**，15内层命令，只有预定真实include故障8且随后恢复0；0清理错误 |
| 原B父项目三配置cmake -S B/S/native -B P/core/build-b-ref-kind-X等                                                                     | 各0，Debug/Release/Debug+ASan-UBSan、observer ON，6份已核源码和专用Python预配置                                                         |
| N S/verify-native.mjs --core-api（原未改脚本/原b_ref_kind_api）                                                                       | **0/324.243秒**；三配置各新JSON7/生成C++208/API24，旧JSON2是兼容子集；98内层命令全0、无blocked/cleanup错误                              |
| 各cmake --build <build> --target hier_source_ref_kind_serialization hier_source_ref_kind_schema hier_source_ref_kind_api --parallel 2 | 各0，4.697/4.590/6.065秒，标准内部三消费者实际编译；未build所有单测目标                                                                 |
| 各ctest --test-dir <build>/product-core -V -R '^a*source_ref_kind*(nested_configure\|configure_regression)$'                          | 各**2/2**，18.864/27.471/18.943秒；实际旧嵌套图+新A配置驱动，不是全CTest                                                                |
| 各ctest -V -R '^b_ref_kind_serialization$'                                                                                            | 各**1/1**，实际原7项；与上述2/2分次执行不混称全量                                                                                       |
| 各N web/scripts/run-source-ref-kind-tests.mjs native <build>/product-core                                                             | 各0，各**7/208/24**，0.540/0.263/2.420秒；标准target绑定真实逐24 ID/进程                                                                |
| 各fresh HIER_BIN下N S/run-core.mjs                                                                                                    | 各0，各**24/24**，8.204/7.871/9.830秒；共享/逐实例/所有对象/宏/include/CRLF/UTF8、全部occurrence和limit1/2/200完整旧投影，0清理错误     |
| HIER_BIN=<Debug hier> npm run test:independent:m5:source-ref-kind:core                                                                | 0/8.557秒，标准接线实际再24，不累计新case                                                                                               |
| npm run test:independent:m5:source-ref-kind（模型入口）                                                                               | 0/16.384秒；原类型40、权威Schema和生成JS各208、真实旧兼容191、SDK23；0skip/blocked/cleanup错误                                          |
| npm run test:independent:m5:source-ref-kind:controls                                                                                  | 0/0.342秒，4项A入口控制由B执行；设施不计新业务                                                                                          |
| N E/protect.mjs --protect；N E/verify-dependencies.mjs；只读助手hash审计                                                              | 全0，原文件/mtime/48声明/3旧二进制/日志前缀/依赖及来源核同，非产品重跑                                                                  |
| N S/c93/verify-evidence.mjs；同--inputs；N S/c93/verify-controls.mjs                                                                  | 均0，可携证据/20现场B输入、1正9负核档变体；不算产品业务重跑                                                                             |

原runner三配置cold受测Core+原API消费者构建86.310/110.428/99.808秒；标准消费者是同图后续增量，
不称额外三份冷Core或所有单测目标全编。上述实际编译/链接输出没有warning行；
配置时mimalloc原提示及Debug/ASan未使用MIMALLOC覆盖提示保留，不称全部输出无提示。
并发耗时不作性能SLA。相同208/24输入跨配置/层/页分账，旧JSON2不与7相加。

标准A回归实际内层3/5/3阶段、11/17/11命令，每次恰一次刻意故障8并实际恢复0；
完整原分离流和LastTest另行封存。运行后逐配置确认其自有临时父目录已删除。
新B配置fixture目录保留诊断，不是未释放Core对象；其timeout看门狗杀自有子进程组，正常无后台Core业务任务。
30份库/二进制pin及配置/链接参数保留；Core/Frontend/JSON和**Slang完整137单元（130源+7生成/适配）**插桩一致。

## 新冻结6阶段：输入、预期、初始结果

独立依据B28主档bdd3c4e3已实际保存的MIMALLOC错误项和CMake本机CMAKE_PROJECT_INCLUDE帮助。
不指定A如何修；依赖覆盖允许不存在/空或正确源，不能串用另一依赖目录。
每次清单必须恰1条指定CTest；零测试不算成功，失败必须是指定真实CMake错误，不能缺模块/启动失败取绿。

| B冻结阶段                                              | 正确结果                                   | fa0初始 / d6复验                |
| ------------------------------------------------------ | ------------------------------------------ | ------------------------------- |
| fresh-off：新优化父allocator OFF                       | 父0/CTest0、父子OFF，依赖来源正确          | fa0实际CTest8，首项失败；d6通过 |
| history-repair：子cache遗留MIMALLOC→boost_regex-src    | 0/子OFF，覆盖空/不存在或正确mimalloc       | fa0未达blocked；d6通过          |
| repeat-on：同目录改ON                                  | 父0/CTest0、子ON，真实依赖不串项           | fa0未达；d6通过                 |
| repeat-off：再OFF                                      | 父0/CTest0、子OFF，不留错源                | fa0未达；d6通过                 |
| real-error：子CMAKE_PROJECT_INCLUDE指自有不存在fixture | 真实非零、恰1测试失败且包含指定include原因 | fa0未达；d6实际8，预期错误通过  |
| error-recovery：清空该值，保留同目录                   | 0/子OFF，可重试                            | fa0未达；d6实际恢复0            |

新冻结301b7be的代码/期望未按A实现或执行结果改变。fa0后5项明确blocked，不报“旧基线6项全失败/全通过”。
旧三项仍原样：默认ON、显式OFF、Debug→优化保留OFF；d6全部父子一致且测试0，不以预期失败洗绿。
新6阶段仅配置/恢复验收，不冒充6个Core业务或真实UI流程。当前契约无须按某个实现自行选答案的歧义。

## 来源、失败保留与可携证据

只读助手未看A实现hunk/新Python/自测档，仅做对象/路径/实际字节审计：
core生产77/公共头37/protocol9/web生产153/generated4/锁与package12对fa0无变（集合交叠不相加）；
B原27在B/main/P实际81项一致，main/P各48声明同B28快照。
1c3599d→bac25793与332b829→1c3fd1d两笔完整路径/mode/type/before-after blob delta严格等价，
SHA分别2281f9e1ab55ef071972c4c8a3a4b48182ba2eeae02316de19a4b3242be8716b、
a60e581e44fd7ac4e4d415c31244a7b8f7c7af6ff8321b08a72a571a38d03cd6。
真实旧fixture沿B28独立旧源码编译来源且当前对象未变，本轮191实际新执行，不伪造旧Schema。

两个纯证据设施问题完整保留，未改产品/输入或借重跑洗去失败：

- 只读助手首轮误用B28归档材料label initial-snapshot，声明/末尾guard未到；保留首JSON/源码/双流，按实际evidence/initial.json字节SHA定位后全审计0。两轮各27条Git命令本身全0，首设施退出1不算产品红。
- 首封档器将“仅/slang-src/源码130”与“完整目标137”比较，两次核档退出1。真实compile_commands逐项确认130+7生成/适配=137，全部正确插桩；只修collector覆盖完整目标，未改冻结期望/重编业务。首完整candidate **3458560字节/SHA fd3be820bff450b7e2f1d2e0c358bb9eeb7f3fe7a069c92294dda24f4c073a68** 留E，首准确源码/collector/runtime/输出纳入新主档。

最终[机器档](m5_b_source_ref_kind_c93_recheck.json)：
**3615501字节/SHA256 8e7ee62a5bbb8770cf3b14cf2feef6b6dca6633e3953171a36ae5a4abb0a298a**，
60主捕获/103材料/103压缩块，全部长度SHA核验；20现场B输入同源。
明确scoped-tests-passed/c93GatePassed=true/originalEntryAccepted=true/C关闭归属、M5未完成；
notFullCTest=true，限域2/2和1/1，绝不将B28旧80/80/82或A28的全门禁移作本轮。
主档原4非零捕获分别两条基线功能红、两次核档设施失败；助手首红另完整保存于材料。

[核档控制回执](m5_b_source_ref_kind_c93_archive_checks.json)：
**85906字节/SHA256 78e3421f2c4540fe763f9babcc47dd81141e5cce430542de9f6bb1d01a4b9a52**。
1正控0、9个正确重封hash/gzip的变体以AssertionError退出1，
包括Core0执行/blocked、改原target、actual与绿汇总不符、配置8仍绿、缺恢复、真实错误误记0、原81blob错误。
无缺模块/ENOENT/超时假绿；包含完整控制脚本及真实分离双流，产品执行数0。
核档只读取冻结case数据，不执行产品/测试主入口。封档/提交/交接回执留E，不递归改主档。

外wrapper stdout\_\*确为合并双流、utc是结束；native98、原矩阵10/新cache15及助手的内层流分开保留；
A驱动实际普通字符串双流完整保存，不虚称其原字段也采用gzip封装。
主1146/B770/P1128/O1118原文件字节及mtime严格保持，主48声明/3旧hier不动；
初始日志前2321776字节/SHA256 3b633f6082dae92c77222536355bd117d600070e8b7b98fe69383e7e7e8eda1d保持。
主树仅追加日志不提交，M3-coordination/research和他人条目保留；P/O tracked clean。

## 交接和限制

交A：原样衔接301b7be及最终报告提交，保留旧oracle；C-92/C-93已由C关闭，按既定范围继续，不新增重复审批或无关重构。
交C/协调器：本轮B固定复验完成，无新具证据的产品/配置阻塞；来源、原失败、实际绿及准确范围已封存。
不把本报告作为整个M5或后续候选确认完成。

未运行完整check.sh/test:independent总入口、所有旧单测目标/全CTest、默认observer OFF第四份Core冷构建、全部未变UI/浏览器门禁。
旧精确source成本/取消/大occurrence全门禁本轮未另跑；对fa0的B28独立80/80/82仍是历史，生产字节未变不重开，绝不改称d6新执行。
未证明Core动态partial新tag专项、真实Electron UI→Core、候选确认/过期Selection、Linux/真实大设计/M7/远端CI。
L06/L09–11/M5整体不凭SDK完成，D-03仍M6；首版无持久化，工程创建/保存/恢复/迁移不适用。
保持B，不修A实现、不代C/D关闭或接管、不投递其它会话、不新会话/计时器；本轮结束。
