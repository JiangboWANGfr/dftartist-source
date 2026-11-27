# B 固定5bd C59原生整合与M3冻结集合最终复验

**B侧M3冻结集合及新增原生整合独立验收通过；C最新原生整合审查也已交付无阻塞结论，C58/C59保持关闭。支持协调者完成M3收尾，不扩展为全部平台/性能/后续IPC与UI已验收。**

日期：2026-10-11领取，2026-10-12完成（Asia/Shanghai）。

## 固定对象、范围和独立性

实际固定集成 `5bd4b46fd8b81ffda973a6e648e3acfeceb8f138`，B自有detached验证树；测试树test/m3起始9422ead，执行计划先独立提交 `470eb9987bfb5bda9f0c4ccf3a94956ffde26a37`。契约取固定验证树/主树DESIGN SHA `487211cec837aed48879f9915372780f1c03b7b0adf61cccbcbc4bb36a6e89e0`，不是B分支旧DESIGN副本。

依[本轮计划](M3_R3_C59_NATIVE_REVERIFY_PLAN.md)、[C59冻结计划](M3_R3_C59_FREEZE_PLAN.md)、[原八项冻结计划](M3_R3_OBSERVER_FREEZE_PLAN.md)验收。78个unit/m3/fixture文件hash与B原冻结树完全一致，包含原M1/M2/M3输入/生成器/CPP/登记；新增CPP SHA `3d94e5b036f549aca10b2513a5a6710cfa328f3381afc6c57da4f8e2bf198ec7`。本轮没有修改测试、fixture、oracle、生产、公共接口或依赖，仅计划/报告/JSON和本人共享日志追加。

只看自己的冻结测试/构建登记、公开头、已获准私有接口hash与编译元数据；不读A实现、生产diff、A/C测试源或独立验证报告。共享日志有A/C摘要，故非严格盲测，但不从其输入/次数/自测结果定答案。生产061与本集成未变关系属A/C审查交接，B不把它写成自己读diff的结论；三个实际ON CLI哈希确与本人的141ON历史相同。无overlay、mock、skip/xfail或预期降级。

## 输入、预期与判断依据

两项使用B独立确定性宏生成769/2305声明及513声明×12数组occurrence；shared/per、cache0/64MiB、Sort/Dedup、同subject组1/256/257/513停止及数组第257，共64＋8=72场景。停止必须实际触发；第1为早停控制，较晚触发确认足够大的同组。契约要求Cancelled、非空错误、无半页/发布，停止后整理通知≤256、amount1。不猜subject编号，不固定stdlib总比较次数或断言最长墙钟延迟。

冷重试Range/Sort/Dedup>0，Publish尝试1结合771/2307/6169完整有序结果判断；热不重排。首73、后211/509交替、热首127，全并集无漏重/游标前进/末页结束；u[2]先u[10]。身份按手写名字通过公开枚举映射，半开offset及1-based ASCII字节行列手算，不借resolveSource输出生成期望。hash与首次快照一致不单独证明SHA算法；独立固定hash正确性由此次也重跑的旧source冻结测试承担。

原八项的有限物化/seek/context准入、动态取消/无半成品及确定性时钟，原12公开API的搜索/表达式/step/trace/源码/游标/共享/冷热门/C58物理身份，全部原88CLI与前序冻结回归均原样保留。C59冷整理未发首个next，不冒称该段原游标取消；既有页内取消/原游标重试另有原八项覆盖。

## 三配置本轮实际执行

M3ON、OBSERVERON、EXPERIMENTSOFF，普通RelWithDebInfo、Debug、RelWithDebInfo+ASan/UBSan。使用B自有构建目录及核验过的只读第三方源码，选定目标增量构建均0；复用未变自有对象/归档，新增原生source_sort实际编译/链接，不称从零或全目标。PRIVATE登记与compile_commands核对：每配置DB5/5、Core8/8翻译单元及两个观察目标同ON；Frontend3/3、protocol/app均未传播宏。

| 实际独立集合，每配置 | 普通ON | DebugON | ASan+UBSanON |
|---|---:|---:|---:|
| 全88CLI方法 | 88/88，0skip | 同左 | 同左 |
| 原生十四API XML | 67用例/3550682断言 | 同左 | 同左 |
| 其中新增source_sort | 2用例/72场景/3411168断言 | 同左 | 同左 |
| 其中原observer | 8用例/285断言 | 同左 | 同左 |
| 实际全B M3登记CTest | 27/27，41.30s | 27/27，91.91s | 27/27，290.11s |
| 前序Core/M1/M2/资源/共享/分层CTest | 27/27，25.19s | 27/27，40.11s | 27/27，164.35s |

上述全部退出0，API 0skip；14套包括原公开12套57/139229（source5/2225、physical2/93）、原observer8/285和新增两项。实际-N和逐条运行核对全B M3为12 CLI＋14 API＋1资源=27，不用空匹配充通过。两项这次确已原生整合并执行，不以旧141外部绿代验。API/CLI wrapper/CTest重复执行同oracle，不重复计覆盖。并发运行两组CTest，LastTest.log可能相互覆盖；JSON保存各runner分别捕获的实际输出而非复用该文件。时间受本机并发影响，不作性能oracle。

命令为 `cmake -S core -B core/build-b{,-debug,-asan}` 显式开关、`cmake --build … --target … -j2`、原生十四目标XML wrapper、B的12 CLI suite wrapper、`ctest --test-dir … -R '^b_m3_' --output-on-failure`及前序27项正则；完整参数、目标、方法、输出和退出码见[证据JSON](m3_r3_c59_native_reverify.json)。本轮未whole check.sh/全目标/fullCTest/A自测，也未恢复普通OFF；B保留三个ON，标准脚本及OFF归C复核，不把C结果记作B执行。

## 资源、web与元数据

本次新跑普通ON原生provider open资源门禁：四方法/36样本退出0，fan10/depth3/4/5、原相邻3倍/整体5倍门禁不改，最大中位数 **8847360 bytes**。在自身重型测试前运行，其他会话可能活跃；仅open/snapshot/diagnostics，非source/trace/M7绝对RAM或SLA。

Node24.21.0/npm10.9.2，实际web类型/分层及五反向探针0；独立11项 **1绿10未来M4/M5红、0skip、退出1**，八HierClient/两SelectionModel导出尚未实现。通过项仅protocol版本一致，不当M4完整机器Schema/TS一致性验收。未安装依赖、未改锁/engines或做假客户端。辅助候选Node/生成器路径查找缺失不作产品失败，实际存在的Node与已冻生成器用于执行。

公开头、已审Observe.h60dc1a3f…、锁211e18d6…及复用Slang两源码hash保持；CLI实际--version0，protocol2/schema6。三ON CLI SHA分别643d8a20…/9ad96066…/327f67f9…；原生新增测试二进制普通584a937c…、Debugaf6923b9…、ASanb697da43…，完整值、78文件manifest及宏核对均JSON。固定树收尾干净；无本轮产品编译/语义失败或新增sanitizer报错，已有重复静态库链接警告保留。-Werror通过，不冒称仓库级C++formatter。

## 历史、交接与边界

旧141只有新增两项外部执行，见[上一轮报告](M3_R3_C59_VERIFICATION.md)9422ead；旧061OFF88CLI/RSS/web见[公开复验报告](M3_R3_FIX_REVERIFY.md)932bc71，均不混为本轮新结果。本次确重新运行全88CLI、原生RSS和web。旧缺Kind编译1/运行0、首冻有符号limit测试编译2/必要适配、旧C58红及observer刺激不足红保留在历史报告；本轮不重跑旧产品或构造新oracle，不覆盖红。

交A：新原生两项及整个B冻结集合在固定5bd三配置已独立通过，无新增待修产品项，无需重改oracle/重复等待C许可。交C/协调者：C最新原生PRIVATE/标准门禁审查通过且C58/C59保持关闭；B侧M3验收完成，当前没有本人的未关闭确定缺陷或未完成新增原生测试阻塞，支持协调者核对既有交付后收尾M3。协调表/里程碑状态由协调者更新，不将此冻结集合证明扩展到未执行范围。复验期间未见新的已满足前置的B固定任务。

未新增执行独立真实NX9000/C910、Linux/Windows/远端CI/TSan/fuzz/mutation/覆盖率/stat或分配故障注入；不证明I/O64KiB/全部循环256、全分配/trace与continuation分配、swap/move/析构/OS最长等待或M7绝对预算。当前CLI→Core不当NDJSON/Electron/React/UI，M4协议排队/并发/取消/完整Schema等保留未来红；V1无持久化，保存/恢复/迁移/撤销重做不适用。不会把这些边界无证据改列为新的M3产品缺陷。
