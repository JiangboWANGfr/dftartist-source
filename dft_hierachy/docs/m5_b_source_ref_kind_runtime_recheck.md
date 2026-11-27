# B27 SourceHit.refKind 独立复验：C-92 未关闭，暂不整体放行

固定产品 `43530c006ca950d504e416e85f859cf0367d3945`（生产870ecab、接线cec81a3）。
Oracle：C26已审 DESIGN §6.16/§5.5.6、B26冻结 `764445d4c91a0113fddaae5d7027eb8fd16946e3`，初红档23123258保持。
当前DESIGN358529字节/SHA256 `1871b147342e4120a63c119d3c910f40501b385b1ad7fb9e4f68a38e9a6d8f63`。

本轮类型/结构/SDK/真实Core语义及适用回归通过，但**原独立Core父项目仍因C-92同名target配置失败，固定交付不整体放行**。
临时私有目标改名后的运行证据不抵销原入口失败。没有新证据表明refKind运行语义错误；不自行关闭C-92。

## 独立性、目录和版本

先读AGENTS、用户决定、最新交接及规范/计划/验证指南；预期沿用冻结输入，不从A实现/diff/自测或聊天重造。
必要检查仅涉及公开API、构建接口与旧fixture来源；A导入的两份B完整binary补丁及20文件逐字核同，不读其实现diff。
E=`/tmp/hier-b-orch27-ref-kind.niSkID`，P=`E/checkout with space 中文`为43530c0独立detached检出，L=`E/legacy source`为146bfa6实际旧源码。
B=`dft_hierachy-test-m5-tree`，起点23123258，分支test/m5-tree。主树和原输入先pin字节/mtime、48声明、主三Core二进制与日志前缀。

Node24.21.0、TS5.9.3、Ajv8.17.1、Apple clang17/macOS arm64，CMake/CTest/npm来自/opt/homebrew/bin。
Python schema工具为原有隔离venv的3.13.3，逐项核与requirements的attrs26.1.0/jsonschema4.25.1等锁定版本一致；生成检查另显式Python3.12。
只读复用6份依赖源码，核tag的实际commit、clean及2403文件SHA，收尾再核全同；不复用A/C产品对象、库、二进制或执行。

## 原入口红、临时实验及恢复

1. B原父项目Debug/Release/ASan-UBSan首次配置分别退出1，错误均CMP0002/重复b_ref_kind_api，业务尚未执行。
2. 最初以 `ca6d3c83f92e94683d8372cd3fea49d6c379250a` 仅改B两处设施的私有target/build/bin名为b_ref_kind_external_api，API源码/输入/预期不变。
   这是继续区分运行语义的临时实验；最新C27接线前对照进一步确认应由A修新增接线，正式提出C-92。没有把临时图绿宣称为原门禁通过。
3. 四配置构建/日志/35二进制及库pin、两份临时设施已保存至E/runtime-pins.json。
   B以 `bcdcfd22348b6ffb37252669bc708402a5e73fe7` **逐字恢复原两文件**，17冻结源及20原交付文件均重新核同。
4. 恢复后实际运行原 `verify-native.mjs --core-api` 再退出1（5.818秒）：Debug旧JSON2、新序列化7、C++结构208已通过，随后原CMake父项目同名冲突；**Core API 0执行**，后续配置未到达。
   原报告的blocked字段为0不等于这些Core断言已运行；机器档及核档器显式记录未执行与C-92。

最终B测试内容与23123258/764445d原字节一致；请A不要导入临时改名来绕过问题。报告提供相对23123258的干净交付，只有计划/报告/核档材料，不含更名或恢复patch。

## 实际命令与结果

默认cwd=B，N=`/Users/jiangbowang/.npm-global/bin/node`，S=`web/tests/independent-source-ref-kind`。
原B runner显式环境为HIER_B_PRODUCT_ROOT=P、HIER_B_BROWSER_TOOLS=P/web、HIER_B_LEGACY_PRODUCT_ROOT=L。
完整展开argv、cwd、UTC、时长、退出与完整输出都封存；同case跨层/配置/页大小分别记账，不累加新业务数。

| B实际命令                                                                                                                                       | 结果及准确范围                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci --ignore-scripts --no-audit --no-fund`；`npm run check`（P/web）                                                                        | 0/0；fresh82依赖、四包TS、196定义/27方法、分层门禁；check9.864秒                                                                                                 |
| `N P/web/node_modules/typescript/bin/tsc -p L/web/packages/protocol-types`                                                                      | 0/2.716秒；原146bfa6源码实际编译旧协议包，不用新Schema删字段伪造旧版                                                                                             |
| `N S/verify-types.mjs production`（既有B助手执行）                                                                                              | 0/25.373秒；正例0诊断，40/40相应行语义拒绝，0skip，无Node/React/Electron ambient代替                                                                             |
| `N S/verify-schema.mjs production`（同助手）                                                                                                    | 0/0.540秒；权威Schema及生成JS各208/208，实际旧生成器191/191；能力5项全真，0失败/blocked/skip，新枚举17不冒充旧适用项                                             |
| `N S/run-sdk.mjs`（同助手）                                                                                                                     | 0/0.301秒，23/23；旧省略/合法/非法、partial/空页/混合/并发/换页、protocol_error/关闭/pending/拥有冻结与清理，cleanupErrors=[]；不是Core/Electron                 |
| 三配置CMake configure，临时改名后 `cmake --build <build> --parallel 3`                                                                          | 0；独立cold全目标Debug189.784秒、Release243.106秒、Debug+ASan/UBSan242.019秒，均observer ON；源码/库/C++消费者同版本全重编                                       |
| `N S/verify-native.mjs --core-api`（仅临时更名图）                                                                                              | 0/30.563秒；每配置新JSON7、C++结构208、公开API24全过；旧2项为兼容子集，0blocked/cleanup。捕获名native-original-three-config是历史名字，不表示图未适配            |
| `HIER_BIN=<各自fresh hier> N S/run-core.mjs`                                                                                                    | Debug10.639秒、Release7.909秒、ASan14.977秒，分别24/24、0skip/blocked/cleanup；全部对象/宏/include/CRLF/UTF8、独立身份、全occurrence及1/2/200完整旧投影          |
| `ctest --test-dir <各product-core> -N`；`ctest --output-on-failure --parallel 3`                                                                | 实际登记并全跑Debug79/79、Release79/79、ASan81/81，分别119.102/55.867/374.395秒；非零/漏登记未被当通过                                                           |
| 独立普通Core根：`cmake -S P/core -B P/core/build-b27-production -DCMAKE_BUILD_TYPE=RelWithDebInfo -DHIER_TEST_OBSERVER=OFF ...`；全build及CTest | 0/0/0；第4份cold全目标216.002秒、CTest76/76/26.778秒，无临时父图，35pin含本配置8文件                                                                             |
| 普通OFF binary运行原SDK-Core24；标准core入口（canonical路径）                                                                                   | 各0，24/24；原runner8.000秒、标准入口8.484秒；不是用observer ON替代生产默认模式                                                                                  |
| `N web/scripts/run-source-ref-kind-tests.mjs native core/build-b27-production`（P）                                                             | 0/0.321秒；直接Core图的7/208/24，输出逐个24 ID及24真实API进程；仍不抵销C-92原父图红                                                                              |
| `npm run test:independent:m5:source-ref-kind`；`:controls`（P/web）                                                                             | 0/0；标准接线复跑同40/208/191/23，以及A所写4项入口控制由B执行；不把这4项称B独立新业务oracle                                                                      |
| `HIER_BIN=<canonical普通OFF hier> npm run test:independent`（P/web）                                                                            | 0/186.644秒；完整标准独立入口实际走到底，旧选择/树/属性/renderer/文档/候选/位置/导航、SourceView浏览器/包消费及新字段入口。分段统计/原JSON全保留，不重复合计总数 |
| `python3.12 protocol/schema/scripts/generate_cpp.py --check`（P）                                                                               | 0；196定义/27方法零差异，实际JS/C++208结果另行验证                                                                                                               |
| `N E/audit.mjs`；`N E/protect.mjs --protect`                                                                                                    | 0/0；B20来源、原字节/mtime、日志前缀和主声明/三二进制保护；P/L tracked clean                                                                                     |

三配置完整CTest确实执行原M3页内取消/重试/大occurrence观察、全页/游标/排序与前序M2/M4；保存的LastTest.log各自显示：increment5/2225断言、physical2/93、observer8/285、sort2/3411168。
100001命中只物化本页及最多一次next探测、热缓存/构建发布取消等继续采用原精确适配，不用sleep/预取消或条数代替。普通OFF配置未注册observer/sort，不虚报该配置执行。
四次全build均有6条duplicate-library linker warning、无compiler warning；项目-Werror生效，不声称全部warning为0。并发实测时长不作为性能预算验收。

## 首失败、旧fixture来源和证据边界

- 保留三次原configure红及恢复后原完整runner红；临时图/恢复前后源、配置、完整输出均封存。它们构成C-92证据，不删除、skip或改原预期。
- 助手首preflight遇本B的ca6提交，HEAD仍被旧guard固定为231，退出1/三业务0执行。保留原脚本与execution；只允许已记录的精确目标名替换后重跑，40/208/191/23源码未改。不是产品失败。
- 标准core与完整独立入口各有一次路径guard红：调用提供/tmp binary，wrapper根来自/private/tmp。先前已执行的完整入口分段保留，只有当次新Core入口0执行；不能把整个首跑归零。
  两别名经same inode/bytes/SHA核同，重跑仅改调用的canonical binary/root字符串，B归属guard、产品和测试期望不改；两首流及两次成功全保留。
- 公开旧fixture来源由既有B助手独立核7个预先固定路径：旧Schema、package.json、全部5 JS，与L真实源码/本次编译输出逐字相同；10个源码输入核146bfa6 Git blob，16保护文件字节/mtime保持。
  比对不import/执行fixture JS；实际旧验证器191语义执行由schema runner承担，不借A/C执行作B证据。

机器档 `docs/m5_b_source_ref_kind_runtime_recheck.json` 封存完整捕获、两助手原始材料、初始快照、依赖pin、35二进制/库pin与配置/LastTest、原冻结输入、临时设施和恢复来源。
新 `S/recheck/verify-evidence.mjs` 默认只可携核档，`--inputs`另核现场B材料；不是重新执行业务。块/双流长度SHA逐项核验；最终核档/提交/共享日志后的回执留E，不递归改封档。
主1130/B759/P1112/L1086原路径字节保持；B两原设施的mtime因临时改名/恢复改变，除此旧文件mtime保持。主48声明及3原二进制未触碰，日志只追加不提交。
外wrapper历史stdout\_\*是merged双流，utc为捕获结束；助手与native内层实际分开捕获双流。只读探索及摘要命令不充产品测试。

## 交接

交A：修自己新增集成目标及调用绑定，保持B原父项目/目标/输入，交固定SHA；**不要把ca6临时适配导入产品来宣称解决C-92**。下一轮复验原未改`verify-native.mjs --core-api`与标准入口都实际执行。
交C：C-92保持open，由提出方按固定修订关闭；本轮临时图与直接Core绿仅证明各自范围，不要求新审批或无关架构/重构。未新增其它有证据的运行时缺陷。
未运行完整check.sh本身（但上述四独立全build/CTest与完整test:independent确已实跑）、真实Core动态partial新tag专项、真实Electron UI→Core、候选确认/过期页Selection生命周期、Linux/真实大设计/M7/远端CI。
L06/L09–11不凭SDK/浏览器局部门禁称完成；首版无工程持久化/迁移，M5整体未完成，D-03仍M6。保持分工，不新会话/定时器或其它会话消息；本轮结束。
