# Agent B：固定C-74修复独立复验

## 结论与版本

**B-M5-TREE-C74-REVERIFY-01通过对应原冻结与本轮补充测试。**
固定运行时17be3657ef13101953bcdfcadc801d3e8911ebb9，
标准接线f099169553c34b1282b7b7a95880af97350b6b2c。
原68/68、标准248/248及35+14生产类型负例、全集761/761、
旧505/693/241/33、Schema655/27通过；新任务组合边界9/9；
本人完整check.sh exit0，三配置Core75/78/80及三配置真实Tree/Core、Selection/Core均通过。
通过运行集合0cancelled/skip/todo。

最新C已正式关闭C-74；**新增C-75 Medium函数诊断数据可变别名仍开放**，
不以旧248/761通过推翻它，不签树所有问题结清、整M5或UI验收。
本轮没有修产品或改变原oracle。C-73/71/72/B-16关闭保持。

B test/m5-tree从232e5ff继续：计划128608d455958a1214c451ef162c59e1693489da；
新增独立任务边界冻结3e3026e4cac2f74c6ef0657e374450041ac241b4，
规范批次对照适配9a4fa193fae411d47f5e9cccb5d32d713edf5007。
原9d9bbd3的68/14及原17/180/693、35/33、历史红归档不改。
实际运行在本人/tmp/hier-b-m5-tree-runtime.zM31cP/source，自己的三配置**增量**构建；
未借A/C产品、未称fresh。已读共享A/C摘要，非严格盲验；未读实现源码/diff、
A新增测试或C探针建立预期。

## 独立新增9项：输入、预期与依据

依据已审DESIGN §6.6.3/5/6，使用真实HierClient/TreeModel与原B公共Transport。
没有SDK替换或生产私有hook。每项plain Node子进程使用默认拒绝策略，
无node:test/全局拒绝监听，父进程检查自然退出与完整错误输出；
20/30秒只是防挂上限，不是SLA。

| 编号 / 数量 | 输入                                                                                        | 预期                                                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Q01 / 4     | roots/children两个同页等待者；pending观察者正常或抛marker；detail Get内dispose后抛undefined | 两个命令均disposed，cause原SDK错误；有pending异常的第一命令cause保留AggregateError.errors=[marker]及原SDK cause；无新通知/状态复活 |
| Q02 / 2     | 手工children在途；reveal已完成object/ancestors并等待同页；Get抛undefined或dispose后抛       | 只有一个children查询；两个命令保留原HierError，或disposed.cause原错误；存活时page/reveal均有正确冻结read [detail]诊断              |
| Q03 / 3     | roots/children/reveal的branch.detail Get抛；branch与根都有后续getter                        | 原HierError，空冻结data与read [branch,detail]；嵌套及祖先后续字段均不读取                                                          |

共享场景用一个setImmediate事件循环轮次排空已排队SDK continuation，
不是墙钟sleep、预取消或猜超时；查询/状态先核已建立共享等待。
新增9项以.probe.mjs明确单独执行，未计入标准248或默认761，不重复相加。

3e3026e先冻结、初基线0/9。规范审计发现“整个SDK失败过程只比较同一初始批次”
会过度约束合法的page先settled、reveal再settled序列；
9a4fa19改为比较最近一次已完整通知的公共批次，仍要求捕获本身不发布半批。
在跑固定实现之前完成；原输入/9项cause/冻结/停止读取预期与原68都不改。
初源/初红保留，适配后旧基线仍0/9，新修复9/9。
C最新正式复核明确认可该规范适配，并另行执行9/9；C结果不计成本报告B执行。

## 本人实际运行

| 本轮命令/集合（npm/node在web）                                 | 退出 / 结果                                                            |
| -------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 原68在修改前dfc源码重放                                        | 1；11通过/57失败，与原红一致，不借历史结果                             |
| 新9在修改前dfc源码，初版及批次适配后                           | 各1；0通过/9失败，原输出保留                                           |
| 原diagnostic-read与followups在f099                             | 0；68/68                                                               |
| diagnostic-task-boundaries.probe.mjs在f099                     | 0；9/9                                                                 |
| test:independent:m5:tree                                       | 0；248/248，35+14真实生产类型负例                                      |
| verify-diagnostic-read-types proposal与production各自          | 各0；正例0诊断、14移除注释后真实诊断                                   |
| test:independent:m5                                            | 0；241/241、33生产类型负例及read-stage消费者                           |
| test:independent，显式本树普通HIER_BIN                         | 0；761/761，含原693及新68                                              |
| 明确列出原文件的旧693、旧505                                   | 各0；693/693、505/505；未修改默认入口或skip新项                        |
| test:schema / web check                                        | 各0；655/655（569结构+86metadata）、27归一化；生成、类型、分层/7负探针 |
| 真Tree/Core7+fixture KAT1，三配置显式本树HIER_BIN              | 各0；8/8，SDK/Node真实进程自然释放                                     |
| 原真实Selection/Core，三配置                                   | 各0；6/6                                                               |
| JOBS=2 HIER_SCHEMA_PYTHON=本人venv Node24 PATH bash ./check.sh | 0；331.969秒，真实标准三配置增量完整门禁                               |
| Core登记/执行                                                  | 75/75、78/78、80/80，CTest26.69/61.94/217.43秒                         |
| 标准前端各独立批次                                             | 27/258/3/241/6/17/248/8，全过，不只摘最后一批                          |
| 语法/新测试格式、diff；源码/依赖/标志/归档核验                 | 最终0；辅助ASan配置断言初败见下                                        |

Node24.21.0、TS5.9.3、macOS darwin25.0.0 arm64、Python3.13.3。
没有本轮React/Electron/浏览器/Playwright/真实大设计/Linux/远端CI/覆盖率/M7执行；
首版保存/恢复/旧工程迁移不适用。L6→SDK→Node→Core不称GUI/IPC验收。
完整脚本/CTest耗时不是性能预算；也未以A新增12000层测试冒称B新性能验收。

## 构建、兼容与辅助审计初败

三配置缓存：普通RelWithDebInfo observer OFF；Debug observer ON；
ASan为**RelWithDebInfo + sanitize ON + observer ON**。
M3/FUTURE均ON、EXPERIMENTS OFF。每配置137 Slang与27产品TU；
ASan对全部137+27核address,undefined，普通/Debug无该标志；
-Werror逐份核产品27，不把它归给第三方Slang。
本人三个增量build.log本轮零warning，不覆盖C fresh Debug的6条warning或旧冷构建历史。

首次ASan元数据辅助脚本错误传入预期Debug，实际标准check.sh明确RelWithDebInfo，
该断言exit1完整保留；仅按标准入口纠正参数后exit0，
不改编译器/产品/构建配置或sanitizer/Werror预期。不是产品失败或关闭检查取绿。

相对dfc，272份指定Core/协议/构建/SDK/Selection/锁定依赖输入mode/type/blob相同；
63份保护B测试/fixture/报告/计划与232e5ff原字节保持。
§6.6.1–6正文、公开m5-tree.d.ts、Schema、C++SessionContract保持，
DESIGN只允许阶段说明变化，固定全文SHA
cd0edba939d07ed45a153fb925854ee3017518f28a0e88b409e5fa349564a2c3。
标准入口实际显式包括原17、新68与生产14类型，不以入口存在冒充执行。
本人源与B冻结逐份一致；19原源、2新源、1初版runner均内嵌。
原26ba2244基线证据保持。本地七份覆盖先验证与固定f099一致，
保存到本人detached overlay 583340e后安全推进，新增两份不覆盖他方文件。

新字段为已审L6可选扩展，旧TreeFailure/TreeErrorCode与消费者保持；
SDK/wire/IPC、Schema/C++ ABI、Selection、依赖、工程格式未变。
未根据实现补预期、改schema或删除/放宽旧测试；目前无本C-74单元未解决规范歧义。

## 证据与交接

[机器证据](m5_b_tree_c74_reverify.json)，SHA256 **4099d2e026d413fdba37064150cda21345363452019da94807da71da92cd1822**。
36完整验证命令：738396原输出字节/244832 gzip字节；
37内嵌源/配置/日志：1843697解压字节/138581压缩字节，
全部长度/SHA核验，内外不重复相加。
不声称包含每次初始只读检索、临时编排或提交动作。
[计划](plans/B-M5-tree-c74-reverify.md)与本轮测试冻结独立提交，主日志仅追加，不提交共享协调/research。

交A/C：对应C-74冻结及9项新组合边界本人复验全绿，C正式关闭保持；
新9可按3e3026e→9a4fa19原样吸收并显式接线，当前不说761已经含它们。
继续C-75原规范独立冻结，保留上述所有oracle/报告及C-75初红；
不能把原函数别名遗漏记成17be365新引入回归。
C-75关闭仍归C，整M5/UI仍待后续，不因本报告推进未审客户端契约。
