# Agent B：C-75固定函数诊断所有权修复独立复验

## 结论、版本及边界

**B-M5-TREE-C75-REVERIFY-01通过原冻结测试和本轮完整门禁。**
固定运行时821c702233062b57b9cea37133da97d84ed01556，
标准接线2003dc00d2e74e105fca5f95bb84e8c2b2e5c50f。
原30/30、9/9、标准287/287及35+14生产类型负例/合法输入、
全集800/800，旧761/693/505/241/33、Schema655/27均通过。
本人完整check.sh exit0，三配置Core75/78/80和真实Tree/Core、Selection/Core链均通过。
通过集合0cancelled/skip/todo；没有改oracle或本轮测试装配适配。
C-73/C-74关闭保持；**最新共享日志中C已正式关闭C-75。**
本报告只签B本人独立复验，不以C结果代替执行，也不代签整M5、UI或所有未来风险结清。

B分支test/m5-tree从5fb7de0继续，计划3c29c9bf25d507ae73baa6894f8e414c46ff9c74。
原d1bfe6a三十项、9a4fa19九项、17/68及历史输入/红归档原字节保持。
已读共享A/C交接摘要，非严格盲验；不读A实现源码/diff、A新增自测或C探针定oracle。
实际执行在本人/tmp/hier-b-m5-tree-runtime.zM31cP/source，自己的三配置增量，
不借主树或A/C产品，不称本轮fresh。

## 原验收条件与实际触达

依据DESIGN §6.6.2/§6.6.5/§6.6.6及公开HierError输入；详表见
[原独立冻结报告](M5_B_TREE_C75_FREEZE.md)，不增加实现专属预期。

roots/children/reveal分别覆盖无属性/属性/根函数、共享循环、数组共享函数、
普通对象同形正对照、函数Get抛undefined、Get中dispose返回或再抛、
可调用Proxy ownKeys失败。修复后30项全部到达完整预期：
字段/图关系自有深冻结，源函数/Error/子对象不执行或冻结，调用者变更不影响旧值，
成功真正省略dataIssue，失败精确read [handler,detail]/enumerate [handler]，
命令拒绝原HierError或disposed.cause原错误，立即清空idle/rows、无复活/通知/后续读取。
不要求投影仍可调用或typeof必须function。

原9项验证全部同页等待者的释放cause（含pending观察者聚合）、手工页与reveal共享、
嵌套读取失败停止祖先后续字段；原68仍覆盖任意抛值/Proxy/路径/守卫恢复/订退阅等。
真实SDK/Tree和原B公开Transport，未替换SDK或使用生产私有hook。
危险输入仍为plain Node子进程、--unhandled-rejections=throw、无全局拒绝监听；
20/30秒为测试防挂，不是SLA或sleep竞速。

## 本人实际命令与结果

Node24.21.0 / TS5.9.3 / Python3.13.3 / macOS darwin25.0.0 arm64。
以下是本轮本人执行，不是A/C结果重述；完整argv/cwd/exit/耗时/stdout在机器证据。

| 本轮执行（npm/node在web）                              | 退出 / 结果                                                          |
| ------------------------------------------------------ | -------------------------------------------------------------------- |
| 原30在旧f099源码重放                                   | 1；3通过/27失败，与原红一致，本轮实际重跑                            |
| 原30在固定2003源码                                     | 0；30/30，未更改源/预期                                              |
| 原任务边界9、诊断读取68各自直跑                        | 各0；9/9、68/68                                                      |
| test:independent:m5:tree                               | 0；287/287，35+14真实生产类型负例及合法函数输入                      |
| 函数合法类型消费者production/proposal各自tsc           | 各0；正例0诊断，不记新增负例                                         |
| verify-diagnostic-read-types production/proposal各自   | 各0；正例0诊断、14真实负例                                           |
| 显式本人普通HIER_BIN test:independent                  | 0；800/800                                                           |
| 明确列出原文件集合                                     | 各0；761/761、693/693、505/505，不改默认入口/skip新项                |
| test:independent:m5                                    | 0；241/241、33真实类型负例/read-stage                                |
| test:schema、web check                                 | 各0；655/655（569结构+86metadata）、27规范化；生成/类型/分层/7负探针 |
| 真Tree/Core7+fixture KAT1，普通/Debug/ASan各HIER_BIN   | 各0；8/8，真实SDK→Node→Core，非模拟服务                              |
| 原真实Selection/Core，三配置                           | 各0；6/6，SDK/后台进程按原资源断言自然退出                           |
| Node24 PATH / JOBS=2 / 本人Schema venv bash ./check.sh | 0；355.814秒，三配置增量完整构建与门禁                               |
| Core登记/实际CTest                                     | 75/75、78/78、80/80，26.04/64.41/239.46秒                            |
| 标准前端批次                                           | 27/258/3/241/6/19/287/8全过，未只摘最后一批                          |
| 源码/输入/依赖/标志、语法/diff、归档校验               | 0；无额外产品/测试装配失败                                           |

287=原248+9+30，800=原761+9+30；各子集、三配置结果不重复累加。
两个.probe父文件在标准树与独立入口显式各一次，
原17/68/35/14及合法生产输入消费者接线已实际检查并执行，不只确认脚本存在。

## 兼容、来源与构建

相对f099，277份指定Core/protocol/ci/构建/全部生产包/锁定输入
mode/type/blob相同（明确只排除tree-data.ts及不在该名单内的package门禁配置）；
因此TreeModel调度、Selection、其它SDK/生产类型未变。
76份B保护测试/fixture/报告/计划按5fb7de0与实际目录逐字验真。
§6.6.1–6规范正文、公开声明/Schema/C++SessionContract保持，DESIGN仅阶段说明变化；
固定全文SHA fe04c02d79f9cf89a1c737b7ad104cbc0e2e21a02c51b80cbb5f33f2b21d304a。
没有新API/IPC/Schema/C++ ABI、合法输入排除、依赖或工程格式变更。

26份B树源/配置/手写SV fixture在B冻结、固定目标和执行目录一致，完整内嵌。
本人七份原覆盖先核与目标相同，保存detached overlay f6663ac后安全推进；
没有删除独有数据或覆盖其它session文件。原5ad9fbdc红归档保持，
完整脚本之后实际产品目录git status干净，锁文件没有意外变更。

构建是本人既有三目录增量，不宣称冷构建/全量重编。
普通RelWithDebInfo observer OFF；Debug observer ON；
ASan RelWithDebInfo/sanitize ON/observer ON；M3/FUTURE ON、EXPERIMENTS OFF。
每配置137 Slang TU和27产品TU；ASan的137+27全部有address,undefined标志，
普通/Debug没有；-Werror逐份检查产品27，不归给第三方Slang。
六份第三方源码pin/clean在前后均核验。三个本轮增量build.log零warning，
不改写旧冷构建/其它session的warning历史。
脚本/CTest耗时不是M7性能预算。

## 证据、未执行项及交接

[机器证据](m5_b_tree_c75_reverify.json)，SHA256 **65e332a52d4dddd0788412a48a4fd6cabc7a0f72febb96a91944fb7e28e42db0**。
37条完整验证命令：682959原输出字节/256338 gzip字节；
41内嵌源/配置/日志：1848097解压字节/140414压缩字节，
逐份长度/SHA核验，内外不重复相加。
26源/fixture、6缓存/编译命令、9构建/CTest日志完整保存；
不声称每次初始只读检索/临时编排/提交命令都在该37条里。
[计划](plans/B-M5-tree-c75-reverify.md)与结果文档为独立B提交，主日志只追加，不提交共享协调/research。

未执行UI/React/Electron/dft-suite/浏览器/Playwright、真实大设计、Linux/远端CI/覆盖率/M7；
首版保存恢复/旧工程迁移不适用，不把L6/SDK/Node/Core称为Electron IPC或GUI验收。
本轮没有新的有证据缺陷/规范歧义，也没有为了取绿改写预期。

交C：固定821c702/2003dc0上的原30/9及完整回归本人全绿；
交接前已读取C-M5-TREE-C75-RUNTIME-01正式关闭记录，B结果独立记账，不代签C决定。
机器证据中的评审状态保留捕获时快照，不回写为事后已知状态。
交A/协调者：对应独立复验完成，保留原红报告/全部输入；
后续M5-A-02b仍按已审路线与具体契约/独立验收推进，不从本报告推定整个M5或UI通过。
