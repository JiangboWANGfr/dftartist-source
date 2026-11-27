# B-ORCH-46：Q1 原生 Chromium 堆观察诊断（未批准的观察器）

本轮完成的是**设施可行性诊断**，不是候选组件或原 Promise 消费验收。
固定 A 交付29e0255124f7ef326138ea4f2922aea1d95cd1ae；B 初始536b1e77fdf58ce59f324add0bb499bf81a25907。
依据 DESIGN §6.18.5/6，真实消费观察点先交 C 审；本轮没有接入模型/组件、没有修改旧 oracle，也不关闭 Q1。

## 冻结点及覆盖判断

| 固定点       | SHA                                      | 内容                                                            |
| ------------ | ---------------------------------------- | --------------------------------------------------------------- |
| 首冻         | 7f8c9a2963dd7a4529216ac77ecd440c73ac179f | 14 原生控制/heap parser/probe/计划；暂停内显式 GC 实际失败      |
| 时点修订     | ca03602601512ccae17eeeaaef88756e1e27eda1 | 暂停内重复快照，恢复后独立显式 GC；10 parser 单元与未知布局拒绝 |
| 最终设施输入 | 51f7d0d3fcff2a3ecb6e7941dffb24fcdc9dc2b1 | 显式限 Chromium/V8/Playwright 版本，避免私有布局跨版沿用        |

B45 已由 A 原样导入，生产树未变；不重复其21/四包/六阻塞或属性全量。
C46 本轮正式限定接受 B45 的测试输入/设施，仍保留真实红基线；不包括本 B46。
B45-INPUT-01 旧 TreeView 误对照有原公开声明依据且已校正，本 B 确认校正完成并关闭该测试输入问题，首稿及原失败不擦除。
C-98 已关闭、B44 已获 C45 限定接受，不重开。D 无新输入，D-03 仍 M6。

## 观察形态与不足反例

所有控制都是同 realm、未覆写原型/then/constructor 的原生 Promise，先有设施自建内部处理模拟“已有内部消费”。
它不是实际 L6 内部实现，不将内部处理计作 UI 消费。快照通过真实 heap ID 定位原值并减去 before reaction 身份。
不按闭包名字判断生产处理器；只比较本引擎已知控制的结构和 closure 计数。

| 原生控制                                                               | 截止时新增结构（reaction / 双closure / 单closure / 空转发） |
| ---------------------------------------------------------------------- | ----------------------------------------------------------- |
| direct-dual；native-await                                              | 各 1 / 1 / 0 / 0                                            |
| empty-forward，随后仅消费派生值                                        | 1 / 0 / 0 / 1                                               |
| success-only；reject-only                                              | 各 1 / 0 / 1 / 0                                            |
| two-success；split-handlers                                            | **各 2 / 0 / 2 / 0，当前投影相同**                          |
| microtask-late                                                         | 0 / 0 / 0 / 0；resume 后才出现 1 个双closure reaction       |
| sync-invalidated；feedback-suppressed；no-consumer；internal-dual-only | 各 0 / 0 / 0 / 0                                            |
| fulfilled-direct；rejected-direct                                      | **unsupported-settled**，不判未观察                         |

最终14条已知控制记录符合诊断预期，其中12条检查 pending 结构、2条明确不支持已结算值。
不是14个 Q1 测试通过。只凭当前结构不能区分 two-success 与 split-handlers，因此不能把“有两条新处理器”升级为通用双分支 oracle。
单反应双 closure 与 native await 的可见性只是可行性证据，仍不能排除其它合法消费者写法、解释回调语义或证明实际 UI 桥接。

## 立即窗口与非干扰检查

设施调用 run 后在原消费者栈内 debugger 截止暂停，CDP 调用未等待该页面求值返回。
三个暂停 marker 均 events=[]、integrity=true；晚微任务未执行。
保存 before、immediate-A、immediate-B-repeat、later、later-after-explicit-GC 五份完整原堆快照。

- 同一次暂停内，两份即时快照的原 reaction/closure 身份与结构逐项一致。
- 恢复原栈后才观察到 late-installed；不能用此 later 结果补成立即通过。
- 仅在恢复后显式 collectGarbage，再拍的已知结构与 later 相同。
- 原 Promise identity/原型/own keys/then/constructor 校验保持；观察阶段没有替 UI 安装 then/catch、替换原 Promise 或进行跨 realm assimilation。
- 结算阶段在测量结束后才拒绝 pending 原值并等待设施自己的派生分支；native await 捕获原 sentinel。最终无 pageErrors/cleanupErrors 不作为消费证明。

这是控制内的有限非干扰见证，不是证明 CDP/GC 对所有 React/定时器/引擎调度绝对透明。
Heap snapshot 本身包含引擎私有布局；协议 API 的存在不承诺该布局稳定。本诊断固定 Chromium156.0.8078.4、revision f842f52ef39fd97b449eb27cff414bf05a98ddce、V8 15.6.75、Playwright1.64.1，版本不符拒绝运行。
官方接口依据为 [CDP HeapProfiler/Debugger 协议](https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/json/js_protocol.json)，语言层 pending/settled 处理与空 handler 区分参考 [PerformPromiseThen](https://tc39.es/ecma262/multipage/control-abstraction-objects.html#sec-performpromisethen)；本项目预期仍只来自 DESIGN，不由这些引擎细节新增产品契约。

## 原失败、修订及清理

首次七消费者探索 exit0/1.034秒，保留原脚本、三原快照及投影；只是探索，没有将七条全计为正式通过。
首冻14控制运行 **exit1/20.848秒**，暂停内 HeapProfiler.collectGarbage 未返回，20秒设施 watchdog 报错。
此时只保存 before/immediate-A 和两个 marker；cases=[]，没有运行完14项断言，不能回写为通过。
**B46-FACILITY-01**：保留原输入/原 CDP 超时/两原快照。修订只收窄暂停内 GC 证明；不声称原请求成功，也不推广为该引擎永远不支持此 API。

修订后实际 exit0/0.956秒，固定版本后再次 exit0/1.007秒；各保存五快照、60条 CDP请求/响应、完整原 Promise heap ID/反应投影。
首轮失败有53条 CDP记录，含失败请求/原错误，不冒称有对应成功响应。
每次 finally 都尝试恢复暂停、释放 remote object group、detach CDP、关闭 page/browser；三次正式运行 cleanupErrors/pageErrors 均空。
没有本地 server、产品 timer、后台常驻或自有未释放任务；原快照/临时目录留证，不删除用户文件。
20秒仅防设施挂死，不是产品超时/性能承诺。

10项 parser 单元 **10/10**，fail/cancelled/skipped/todo均0。
包括库存、空转发与双closure数据、缺原 heap ID、未知状态、未知隐藏目标、未知 schema、反应环、baseline身份变异与 settled 不支持；这些合成 parser 数据绝不进入产品模型/组件。

## B 实际命令

E=/private/tmp/hier-b-orch46-q1.psD24D。
B=/Users/jiangbowang/MOI/2025/dftartist/2026.9/dft_hierachy-test-m5-tree。
T=/private/tmp/hier-b-orch45-packaged.25WO2j/fixed product 中文/web，仅只读工具，不作当前产品运行树。
N=/Users/jiangbowang/.npm-global/bin/node，PATH=/Users/jiangbowang/.npm-global/bin:/opt/homebrew/bin:/usr/bin:/bin。
D=web/tests/independent-source-candidates-view/promise-heap-diagnostic。
测试 cwd=B；显式 HIER_B_BROWSER_TOOLS=T、HIER_B_Q1_EVIDENCE_ROOT=E；不设置产品根，不导入 DFT SDK。

| 实际命令                                         | exit / 秒 / 结果                                                            |
| ------------------------------------------------ | --------------------------------------------------------------------------- |
| N E/protect.mjs --snapshot                       | 0 / 0.715，M/B ordinary 1387/972、M49声明/3Core、工具锁及日志前缀           |
| N E/probe-explore.mjs                            | 0 / 1.034，7消费者原生探索/三原堆                                           |
| N D/probe.mjs --list                             | 0 / 0.026，14控制库存                                                       |
| N D/probe.mjs，首冻                              | **1 / 20.848**，B46-FACILITY-01，0个完成控制/两原堆                         |
| N --test --test-reporter=tap D/facility.test.mjs | 0 / 0.064，10/10 parser设施                                                 |
| N D/probe.mjs，ca036时点修订后                   | 0 / 0.956，12 pending结构+2 unsupported/五原堆                              |
| N D/probe.mjs，51f7固定引擎后                    | 0 / 1.007，同14诊断记录/五原堆                                              |
| N E/source-audit.mjs                             | 0 / 0.695，35 Git命令/70完整流、四笔导入/12路径、5输入/98旧产物、15原堆回读 |
| N E/protect.mjs --check，报告前                  | 0 / 0.562，旧路径/声明/Core/锁/日志前缀保持                                 |

Node24.21.0/Darwin arm64。工具锁/manifest与当前固定交付同字节，没有安装新依赖或重建产品。
原阶段原始输入、探索与失败/两次修订后结果、15份原快照和全部捕获留在 docs/m5_b46_promise_heap_diagnostic.json；精确argv/cwd/状态/时间/分离双流可回读。
source-audit独立从原始五份快照重算每次成功运行的14条记录，而不是信任摘要；archive API正负控制仅核档，不算再执行产品或浏览器。
封后格式/回读/提交及保护回执另留E，不递归将自身哈希写入档。

## 来源、保护及范围

B45→A四笔原始blob delta及12最终导入路径相等：
8e1c759→9589334、4094b76→e2b5da2、50c2a8d→becca35、536b1e7→31c8083。
只比较自有测试的Git元数据，不读A生产实现/diff来定义oracle。
固定产品core/protocol/web packages/scripts/原锁/check入口七树项与e2da1afb相同；98既有JS/声明同原B45 pins和只读工具树，不是本轮重建。
§6.18.1至§7前规范15412字节/SHA256 baa78949e5354e1ed384e0f57b141002c1f3c1391a1fd25a790dca9ed08de1db保持。
M/B原ordinary 1387/972及M49声明/3Core bytes/mtime保持；工具两个锁/manifest保护。
原日志前2910044字节/SHA256 6b4a72b13003e9b17a814252e18bf7ceb836e2d690b4fefb631f025967ebc303保持，只追加不stage/commit；旧协调/research/旧工程/ref/真实输入不改。
B45历史证据回读不算重跑其21/四包/六阻塞；C46执行只作状态，不作B证据。
原四输入三阶段原文及新增parser单元完整保留；14消费者cases原字节未变。
辅助静态质询仅检查B设施与限制，未执行、不代C。

## 交接

**不能用本诊断关闭Q1。** 没有实际公开模型返回前baseline→实际UI事件尾截止桥接；sync-invalidated只是设施分支，不是真React同步卸载。
已结算原值尚无可用判据；split-handlers与two-success当前投影同形；其它合法回调/跨realm等未覆盖，不能强迫特定then写法。
请C审阅本原生观察点诊断、失败修订与这些明确不足，决定后续pending子集桥接探索是否可用；本轮不请求按当前算法批准通用oracle或完整组件实施。

A可原样导入诊断和证据，但不能把它写成原Promise消费冻结已齐。后续仍需满足原契约/透明适配/C审/B实际冻结前置。
真实候选DOM、SDK、Core、Electron/IPC执行均0；104计划DOM/30历史类型不增，Q1/持续原行stale_action/旧闭包/完整生命周期/空态强关联/AX/纵向差额保持。
没有重跑无变化Core三配置/CTest/ASan、完整check.sh、属性1096/旧74/4/5/旧DOM类型包外全集、大设计/Node20/22/跨平台/压力/远端CI；不称完整构建、UI或M5通过。
无生产/API/ABI/TS/IPC/Schema/protocol2/schema7/依赖/配置/工程格式改变；首版无持久化，本增量保存/恢复/迁移不适用。
D无新交付，D-03仍M6；交接后结束本轮，不接管A/C/D、不新会话/定时器或发消息。
