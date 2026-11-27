# B28 C-92 原入口复验 / C-93 独立配置冻结

## 结论与固定对象

固定产品 **fa0cee48b87768685c396a540555ee07daef2000**，A修复22e8c32。
**原未改B父项目/--core-api三配置和标准接线通过；固定交付仍不整体放行：C-93新配置矩阵1通过/2失败。**
C-92命名修复已获B实际运行证据，但关闭权仍归提出方C；C-93同理，不由B关闭。
未发现本轮新增refKind运行时语义反例；构建测试设施缺陷不改写成业务错误，也不被普通三配置绿抵销。

原冻结764445d4c91a0113fddaae5d7027eb8fd16946e3及初红报告23123258保持；
新配置测试独立冻结 **1c3599d8a26c217a9500ca7d9b094702ed5f7513**（计划+build-config.mjs两路径）。
B分支test/m5-tree，起点e98ed4d；本轮报告提交SHA以主树REVIEW_LOG最终B28交接为准。
DESIGN358529字节/SHA256 **1871b147342e4120a63c119d3c910f40501b385b1ad7fb9e4f68a38e9a6d8f63**。

Oracle只取DESIGN§6.16/§5.5.6、原B类型/Schema/SDK/HDL/C++消费者及修改前公开配置。
A的固定交付/接线只确定受测对象和调用入口，不据其实现、diff、自测或聊天改预期。
原17冻结/20初始交付在B/主树/P逐字保持，未临时改target、guard、expected或skip。
类型/Schema/wire/API语义验收条件及逐例input/expected/basis仍在原README/inventory/cases；本轮无新的业务契约歧义。

## 独立目录和环境

M=/Users/jiangbowang/MOI/2025/dftartist/2026.9/dft*hierachy；B为同级dft_hierachy-test-m5-tree。
E=/private/tmp/hier-b-orch28-c92.qYrvNE；P=E/checkout with space 中文（detached fa0）；O=E/baseline435（detached43530c0）。
N=/Users/jiangbowang/.npm-global/bin/node，Node24.21.0；npm10.9.2、CMake/CTest4.0.2、Apple clang17/macOS arm64。
所有调用使用canonical绝对P/HIER_BIN，保留含空格/中文目录，不改原归属guard。
S=web/tests/independent-source-ref-kind。原runner默认cwd=B，标准入口cwd=P或P/web。
完整argv/PATH/产品变量/cwd/结束UTC/耗时/退出及原流均封存；外wrapper的stdout*\*是合并双流，utc是结束时刻。
native98、配置矩阵10、B只读助手23条内层命令另有真正分离双流及起止时标，不冒充A/C执行。

只复用6份固定tag/HEAD且clean的依赖**源码**，2403文件前后hash核同，不复用任何旧产品对象或二进制。
Schema专用Python3.13.3及6个requirements版本实际核同；生成检查另用Python3.12。
新布局所涉Core/Frontend/DB/protocol、hier、原外部API和标准内部API消费者都在对应自有图同版本编译；
不声明旧C++二进制ABI兼容。source-tag字段本身未在本修订改变。

## 验收、执行和判断依据

| 实际B命令（绝对参数/环境见机器档）                                                                                             | 结果与边界                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| git worktree add --detach P fa0；另O 435；npm ci --ignore-scripts --no-audit --no-fund（P/web）                                | 各0；fresh锁定82依赖，源码未补丁                                                                                                                 |
| npm run check（P/web）；Python3.12 protocol/schema/scripts/generate_cpp.py --check                                             | 0/10.555秒；0/0.132秒，四包类型/196定义27方法/分层与生成一致性                                                                                   |
| cmake -S B/S/native -B O/core/build-b28-original-debug -DHIER_PRODUCT=O等                                                      | **1/2.312秒**，原435全局b_ref_kind_api重名/CMP0002；业务0执行                                                                                    |
| 三配置同样原父项目，分别-B P/core/build-b-ref-kind-{debug,release,asan-ubsan}                                                  | 各0，Debug/Release/Debug+sanitizer、observer ON；预置已核源码与专用Python                                                                        |
| HIER_B_PRODUCT_ROOT=P HIER_B_BROWSER_TOOLS=P/web N S/verify-native.mjs --core-api                                              | **0/409.441秒**；原未改脚本、原b_ref_kind_api，三配置每个新JSON7/生成C++208/API24，旧JSON2是7中兼容子集；全部实际到达、blocked0/cleanupErrors=[] |
| 各cmake --build P/core/build-b-ref-kind-X --parallel 2（原runner后补建全部目标）                                               | 各0；91.406/67.324/74.696秒，全部旧测试和三个标准内部消费者已建成                                                                                |
| 各ctest --test-dir <build>/product-core -N后 --output-on-failure --parallel 2                                                  | **80/80、80/80、82/82**，95.181/36.938/424.193秒；未Not Run/skip                                                                                 |
| 各ctest --test-dir <build>/product-core -V -R '^a_source_ref_kind_nested_configure$'                                           | 各0，先单独执行；全CTest中又实际执行，不把重复算新case                                                                                           |
| 各N web/scripts/run-source-ref-kind-tests.mjs native <build>/product-core（P）                                                 | 各0，0.594/0.265/2.605秒；标准目标绑定实际7/208/24，逐24 ID/真实进程核验                                                                         |
| 各HIER_BIN=<build>/product-core/hier HIER_B_PRODUCT_ROOT=P N S/run-core.mjs（B）                                               | 各0，**24/24**，8.431/7.405/9.528秒；所有limit1/2/200旧投影/独立身份、共享/逐实例、宏/include/CRLF/UTF8保持，清理错误0                           |
| HIER_BIN=<Debug hier> npm run test:independent:m5:source-ref-kind:core（P/web）                                                | 0/8.892秒，标准core再实际24，不与上行相加                                                                                                        |
| npm run test:independent:m5:source-ref-kind（P/web）                                                                           | 0/25.164秒；原类型40、权威Schema/生成JS各208、真实旧生成器兼容191、SDK23；无缺模块冒充语义拒绝，无非法tag降级                                    |
| npm run test:independent:m5:source-ref-kind:controls（P/web）                                                                  | 0/0.719秒，4入口控制；A编写、B执行，只算设施不算新业务                                                                                           |
| HIER_B_PRODUCT_ROOT=P HIER_B_DEPENDENCY_ROOT=M/core/build/\_deps HIER_B_BUILD_GRAPH_EVIDENCE_ROOT=E N B/S/c92/build-config.mjs | **1/12.860秒，3执行/1通过/2失败**；预期全部0，具体C-93如下，0blocked/skip/cleanup错误                                                            |
| N E/protect.mjs --protect；N E/verify-dependencies.mjs；B只读助手audit                                                         | 0/0/0；严格原字节/mtime、依赖/原B导入/生产范围核验，非业务运行                                                                                   |
| N S/c92/verify-evidence.mjs；同--inputs；N S/c92/verify-controls.mjs                                                           | 均0，核档/23现场B输入及1正8负人工档案变体控制；**不是产品重跑**                                                                                  |

原runner三份真正cold Core+原消费者编译100.268/133.946/147.521秒，98内层命令全0；
后续全部目标构建不是第四份冷Core。编译/链接无warning的是该原受测目标构建；
补建全测试各有**6条既有duplicate-library linker warning、0 compiler warning**，不说总warning0。
预配置Debug/ASan另有未使用MIMALLOC覆盖提示；优化默认配置有mimalloc提示，原流保留。

三份LastTest均有原B准确source increment5/2225断言、physical2/93、observer8/285、sort2/3411168；
含100001 hits首屏有界物化/最多一次next探测及页内取消/原游标重试。
不以小fixture、预取消、sleep、命中条数或耗时替代该oracle。相同输入跨配置/层/页不相加新业务数。
ASan两项故意错误控制被CTest按原预期检测，不宣称全部输出无sanitizer文字。

## C-93：新冻结输入和初红

本轮读取C的新反例后，独立选择公开配置；依据Slang公开allocator开关、435旧Core缓存适配和AGENTS兼容要求。
每项先父configure成功、清单恰1个目标CTest，再要求实际嵌套回归退出0并保留allocator；零测试不能冒充成功。
三个输入的预期始终全绿，冻结后不随A修复修改。

| 冻结case                             | 预期                                                   | 本B fa0实际             |
| ------------------------------------ | ------------------------------------------------------ | ----------------------- |
| B-RK-BUILD-optimized-default         | 新RelWithDebInfo，父/子ON，configure0/CTest0           | 通过，0/0、ON/ON        |
| B-RK-BUILD-optimized-allocator-off   | 显式OFF，父/子OFF，configure0/CTest0                   | **失败**，0/8、OFF/ON   |
| B-RK-BUILD-reused-debug-to-optimized | 同目录Debug→RelWithDebInfo，父/子保留OFF，两父0/CTest0 | **失败**，0/0/8、OFF/ON |

两失败均为Could not find mimalloc-obj target；不是CMP0002、缺源下载或未建测试二进制。
父覆盖MIMALLOC为已核mimalloc-src，实际子argv却为boost_regex-src，且allocator由OFF变ON。
完整测试输出93521字节；三父/子cache和10命令双流保留；
配置目录E/b-ref-kind-build-graph-AJcHEa。此为C-93的本B实际证据，不借用C运行，也不更改为expected-failure/skip。
这里仅配置，不是另三份Core编译/业务测试。本轮固定交付**not-released**，等待A固定修订后原3项全绿，C按职责关闭。

## 来源、可携档和保护

只读助手按Git路径/mode/type/blob及实际字节审计，没有读取A实现hunk生成oracle：
core生产77、公共头37、schema/生成器9、web生产153、生成物4、锁/package12均与435不变（集合有交叠不累加）。
B17+初红新增3在B/主/P共60项一致；B27导出273e262→A导入c963474的4路径完整树delta相同，
SHA2560669493a1100f70365eba9e6d9ee602b25b56e2b376a1ea409ff603367dc0659。
主48/P48声明字节同B27初快照。旧fixture沿B27独立真实旧源码编译来源，当前blob未变，本轮191确实新执行；
不从新Schema删除字段伪造旧版。

主档[机器档](m5_b_source_ref_kind_c92_recheck.json)：
**2161096字节/SHA256 bdd3c4e331b4906b9fb5aecae6c7e5d067c6c281723e17ace19cae0caa211967**，
53主捕获/100材料/100压缩块；原红和新C-93红与全部绿并存。核档显式originalEntryAccepted=true、
c92NamingGatePassed=true、status=not-released/openFinding=C-93/M5未完成。
23现场B输入核同；原C++/HDL/Schema/SDK输入、配置/链接/LastTest及**30份库/二进制pin**均可核。
Core/Frontend/JSON及Slang在ASan实际编译选项均插桩，原外部/标准内部API是两个不同真实目标。

[核档控制回执](m5_b_source_ref_kind_c92_archive_checks.json)：
**28961字节/SHA256 ecdf45cfe16826a5009b21e053adceb8bbf1cb94b0786240bafa4b29de31e416**。
原档正控通过，8个重新封装正确hash/gzip的变体明确AssertionError退出1，
包括Core0执行/blocked、临时改名、actual与绿汇总不一致、缺嵌套记录、子进程失败、原blob错误等。
内含控制脚本完整压缩源码和真实分离双流，非缺模块/缺文件取假绿，产品执行数0；核档不是重新验收产品。
创建/最终核验/提交/交接回执在E封档外保存，不递归改主档。

主1136/B763/P1118/O1112原文件**字节和mtime全部严格保持**，无临时设施改名；
主48声明、3原hier二进制未触碰。日志原前2283422字节，
SHA2563fdf1f4019340f26c0f6cde871a6faccf91618efc6e8f5090ba7f27e8e9184ad保持。
P/O tracked clean，主树只追加日志不暂存/提交，既有M3-coordination/research和他人条目保留。

## 交接与明确未执行项

交A：原样导入新冻结1c3599d及本轮报告提交；修自己的嵌套配置/可选依赖承接，不改原B消费者或新三配置预期。
交固定修订后，B复跑新矩阵及受影响接线；C-92/C-93只由提出方C决定关闭。下一单元不据本报告完成。

未执行完整check.sh或test:independent总入口、默认observer OFF的第四份Core全构建、
未变化的全部旧UI/浏览器门禁；B27对应435旧执行仅历史参考，本轮上表三配置完整Core/CTest及限定前端入口确已新跑。
未证明Core动态partial新标签专项、真实Electron UI→Core、候选确认/过期Selection、Linux/真实大设计/M7/远端CI。
L06/L09–11、M5整体不凭SDK完成，D-03仍M6；首版无持久化，保存/加载/恢复/迁移不适用。
保持B职责，不修A实现、不接管C/D、不发送其他会话、不创建会话/定时器；本轮固定复验/冻结完成。
