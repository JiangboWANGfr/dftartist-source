# B-M5-UI-CLEANUP-01：C-78异常回收修订与复验

结论：B自有UI测试运行器的C-78清理缺陷已修订，25项独立控制通过，交C复核关闭。
不是A产品修复、生产HierarchyTree或Electron放行。

计划7c0f2287f9ec16e3b0b0f23e46388937f7f8ead6；
先冻真实资源输入2e6e0c7ea74752e771f01d4b0b74d282030a4992；
固定修订/单元及桥接输入5d226365b68e4fffb4fa0555829fe3a73731e142。
产品始终为8d9c334，规范SHA36fd76c2b0df8f44827644ff045c789ce5175bb5be39f27d20dba1816f542de0。
只修B测试设施，未读A实现/新增自测或C反例脚本；已读C共享发现，非严格盲验。

## 验收与输入

任一资源释放或Core退出断言失败，都必须继续尝试其他自有资源清理，收集分阶段错误并非零退出。
先请求全部Core关闭，再分别等待退出、退订、清空帧/释放poll；重复关闭、无资源和部分初始化同样处理。
退出码断言放在HTTP等资源释放之后；报告不能因undefined等拒绝值再次抛错。
不以强制process.exit或父控制补救冒充原运行器自行回收。

| 输入/位置                                                                              | 预期与判断                                                                                                                                |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| [阶段/会话单元16项](../web/tests/independent-tree-view/ui/c78-cleanup-stages.test.mjs) | 正常、空集、各阶段拒绝、多项falsy拒绝、真实门控顺序；保留原拒绝值，后续阶段不跳过；退出/退订/poll故障不阻断其他会话                       |
| [真实资源7项](../web/tests/independent-tree-view/ui/c78-resource-cleanup.test.mjs)     | 正常、已关页面、shutdown拒绝undefined、page.close拒绝、browser.close真实关闭后拒绝、首个Core SIGTERM、server.close真实关闭后回调错误      |
| [资源控制worker](../web/tests/independent-tree-view/ui/c78-resource-worker.mjs)        | 实际浏览器/HTTP；每例开2个实际自有Core并建立pending poll。补救前页面关闭、浏览器断开、两个child close、poll完成、同端口重绑；正常0，故障1 |
| [真实桥2项](../web/tests/independent-tree-view/ui/c78-core-bridge.test.mjs)            | 空桥关闭防止晚开进程；close返回同一Promise；两Core退出0、消息/关闭/poll监听释放、缓存0、pending=false，重复close不改变状态                |

共25个不同控制。早先23项开发执行是其中重叠子集，不合计48项。
单元阶段stub只用于B清理器故障分区，真实资源行使用实际Playwright/HTTP/ProcessTransport/Core；
没有伪造模型、行或HierarchyTree。受控包装只针对本进程自有资源出口；Core信号仅发给已捕获的本人ChildProcess。
同步/异步判断使用具体HTTP request/close/exit及Promise门控，40/45秒只是死锁看门狗，无sleep或性能阈值。

## 修改前基线：正常1过、异常6失败

原runner与桥固定c9256dd（等同原5aa7f5a）。先跑已冻2e6e0c7的7项，不据实现改预期。
正常路径原本通过；6项失败不能统称6个泄漏：

| 原控制                     | 补救前实际观察                                                          |
| -------------------------- | ----------------------------------------------------------------------- |
| page-gone                  | browser/server及2个Core仍活，poll未完成，端口不可重绑                   |
| page-close-reject          | 页面也未关，browser/server及2个Core仍活                                 |
| browser-close-reject       | browser已真实关闭，但server与2个Core仍活                                |
| core-nonzero               | Core均退出且browser关闭，退出断言跳过server释放                         |
| shutdown-reject(undefined) | 资源已释放，但原catch读取error.message自身抛TypeError，原报告未正常返回 |
| server-close-reject        | 资源已关闭，报告缺closedOwn标志；不是实测泄漏                           |

父控制在观察后分别回收本人残留，完整观察与补救结果都保留。
undefined路径的worker捕获import失败以便补救，其诊断退出0不算原runner通过；原始集合最终1过/6失败、退出1。

## 修订、历史与兼容

[resource-cleanup](../web/tests/independent-tree-view/ui/resource-cleanup.mjs)逐阶段收集错误；
顶层和逐例的shutdown与page.close分离；browser/server第一次失败仍记录并尝试必要回收。
Core桥先关所有会话，再逐会话结算exited/退订/缓存/poll；释放close监听、阻止清理开始后的晚开进程，close幂等。
所有资源处理之后再核Core退出；cleanupErrors含阶段，旧cleanupError保留首错，原业务error仍保留。
closedOwnBrowserServerAndCore表示实际全部资源已释放，故障仍exit1，不再把报告标志当“所有步骤没抛错”。
任意永不settle/不可关闭OS API不在已测声明内；单元close抛错控制的exited明确已settle，不冒称已杀任意无法关闭的进程。

c925起点399文件中397逐字保持；仅原B `ui/run.mjs`、`ui/core-bridge.mjs`是明确设施例外。
140业务输入/预期、原24 C76、C77、95映射、旧证据/报告及原verify-evidence工具均保持。
原工具绑定“今天文件也等于旧冻结”，修订后不能声称其原样当前通过。
[历史核验器](../web/tests/independent-tree-view/ui/c78-verify-history.mjs)核32完整输出/27 Git来源，
**明确报告两个当前设施差异**，不改旧hash或把历史自检重记成新版执行。
旧主归档SHA5db8ea2494817e4288f7b0ae13a59a1cbc1fe81d23161a2527993d2f93fd7bcd保持。

## 固定修订的实际回归

- 25/25：16阶段/会话单元、7真实浏览器资源、2实际桥；无skip/todo/cancelled。
- 7项真实资源均在父补救之前全部释放、poll完成且同端口立即重绑；正常0，6种受控故障各1。每项2份实际Core。
- 原普通fixture自检0：mixed/wide/deep/empty/paged、StrictMode两次mount/cleanup、一次点击均保持；没有生产组件。
- 三配置实际Core UI桥自检各0：每组两个不同snapshot、12行/11查询，退出0/signal null、缓存0/poll false及三类监听释放。
- 原独立800/800、新M4兼容10/10、C77原控制4/4、95条件/140输入/8手工步骤映射通过。
- M4归档27输出/52来源及旧UI历史32输出/27来源通过；原UI能力红仍1，缺HierarchyTree，零生产语义。
- 源码/产物/进程审计通过：产品干净8d9c334、247项native/build/锁输入保持、三配置本人二进制SHA保持，结束无本人Core活进程。

Node24.21.0/macOS arm64、Chromium156.0.8078.4。按browser技能先发现首选执行接口不可用并告知，
使用B已有隔离Playwright浏览器，实际核资源，不用VM结果冒充。无借A/C运行状态或二进制。
本C78单元没有TS/native编译、Core75/78/80或check.sh重跑；前一M4单元64b1e0b结果不重记为本单元执行。
原API/IPC/Schema/ABI/生产依赖/锁/DESIGN均未修改。

## 证据、复跑和交接

主归档SHA256为d946a80cd770876ef7a28e0da55e74188c670ac53b77fbbbeaa9741b6e08aab0。
[后检记录](m5_b_ui_cleanup_c78_archive_checks.json)另存归档/来源/资源观察核验、格式与diff检查，三项均0，避免自引用。

[完整机器证据](m5_b_ui_cleanup_c78.json)：16条捕获208125原字节/32307gzip字节，
完整argv/cwd/退出、基线1过6失败、固定修订25过、已知能力红、8项当前及2项历史Git来源。
[核验器](../web/tests/independent-tree-view/ui/c78-verify-evidence.mjs)逐份解压/长度/SHA、固定Git/当前来源及7资源观察核验：

```sh
node web/tests/independent-tree-view/ui/c78-verify-evidence.mjs
HIER_B_PRODUCT_ROOT=/absolute/B/source HIER_BIN=/absolute/B/source/core/build/hier node --unhandled-rejections=throw --test web/tests/independent-tree-view/ui/c78-cleanup-stages.test.mjs web/tests/independent-tree-view/ui/c78-core-bridge.test.mjs web/tests/independent-tree-view/ui/c78-resource-cleanup.test.mjs
```

交C：请按固定2e6e0c7/5d22636与本报告核C-78；B不自行关闭意见。
交A：只接收测试设施修订，不要求产品为此改动，不把正常fixture或资源控制记成140生产UI通过。
C-77条目已由C按声明纠正关闭，L09～L11的原Promise消费仍待验证；C-79定位、获批L02适配、L06强观察另单元继续。
实际140生产UI/AX/读屏、Electron独立冻结/运行时、Linux/远端CI/覆盖率/M7/真实大设计仍未放行。
首版无保存恢复/旧工程迁移/计划编辑undo-redo；共享日志只追加不提交，协调/research/ref/旧工程不动。
