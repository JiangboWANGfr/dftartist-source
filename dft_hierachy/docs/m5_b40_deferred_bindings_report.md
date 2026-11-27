# B40：微任务签发与旧工作撤销部分冻结

## 固定版本与结论

产品 `aeef926051b307e196df4c00044ca9617012a70b`；B初始 `931cfce4c524aaebc902022c0b23aefd3c4f6ef8`。
先冻结 `6e6701471a695e6bc97fb23b34648a3e5d14525f`，保留初稿/实际结果；修夹具并再次冻结 **`9b46dde815b9e08211c0b372934a932023e04fe0`**，作为最终接受输入。
依据DESIGN §6.18.1/3/5及旧B公开fixture/已受审调用透传层，不读A实现/diff/自测生成oracle。C-97由C39关闭保持，B39格式吸收已完成，不重复旧CLI矩阵。

最终：**14/14 Node设施、5/5浏览器前提、旧相关27/27**；候选DOM **planned6/executed0/passed0/failed0/blocked6/skip0**，能力门禁exit1。
没有SourceCandidatesView及公开CSS，不提供替身。累计90计划DOM/30历史类型仍部分冻结；六项初稿和修订不能双计。设施执行真实SDK/Nav，不是候选UI或Core/Electron验收。

## 输入、预期与依据

完整库存见`deferred-bindings/cases.mjs`及`docs/plans/M5-source-candidates-view-b40-deferred.md`。

| ID  | 输入与预期                                                                                                                       |
| --- | -------------------------------------------------------------------------------------------------------------------------------- |
| D01 | ready普通flushSync提交：同栈零公开操作，之后按两原page/index各签发一次；无查询/选择                                              |
| D02 | 同输入StrictMode：不重复原tuple签发；不声称已直接测订阅残留                                                                      |
| D03 | 提交后同栈立即卸载：排空已排微任务后零签发/查询/确认/反馈，借用模型存活                                                          |
| D04 | 两对模型事先准备完，同栈连续提交：旧对签发0、新对按其原tuple签发，各零额外查询/选择，不释放借用模型                              |
| D05 | ready提交后同栈host reload，实际pending/空pages检查和pending提交先于首次await：旧工作撤销，wire答复前零行/签发；随后只签新原page |
| D06 | 实际Navigation通知回调内flushSync提交：回调提交前后零公开操作，成功通知见证后才签新原page，除host reload外零命令                 |

前五项依据§6.18.1/3，卸载亦依§6.18.5；D06只覆盖该实际通知回调中的flushSync提交边界，不穷尽订阅顺序/所有读顺序。
D04/D05是已提交旧工作的撤销，不是未提交render。D05的实际L6 pending/空pages为fixture前提；若不能同栈建立，应归设施前提失败而非据此诊断UI缺陷。
调用观察器原样返回原值，既不读then/包Promise，也不替组件消费；host只消费自己的reload Promise。正常异常均finally尝试全部卸载/等待撤销/退订/恢复/模型SDK wire及浏览器server释放。

## 初稿发现与修订，不按实现改预期

辅助静态复核发现D04首次render后才await第二对模型，会让旧微任务先执行，违背冻结输入所称同栈前提。
本B独立调度反例实际exit1，输出`commit:old,queued:old,commit:new`。它是夹具调度诊断，不是旧候选组件执行或产品失败；初稿六DOM当时也仅能力阻塞，不能说D04已通过。
9b46将两对模型都在首次createRoot/render前准备，D05的pending检查/回调同步起步移到首次await前；D03及旧D04补零查询断言，删除D02无断言支撑的“订阅残留已覆盖”表述。
六项cases、原核心断言、14设施、runner字节保持；只改计划和两夹具文件。所有行为预期仍来自相同规范，不因A实现放宽；当前夹具已再次静态复核。

## 本B实际命令与结果

E=`/private/tmp/hier-b-orch40-deferred.pU3Sod`；P=`E/fixed product 中文`独立detached产品；B为test/m5-tree；I=`web/tests/independent-source-candidates-view/deferred-bindings`。
Node24.21.0/Darwin arm64，Chromium156.0.8078.4，React/DOM18.3.1、Playwright1.64.1、esbuild0.25.11。模型/浏览器命令显式`HIER_B_PRODUCT_ROOT=P`，浏览器另设`HIER_B_BROWSER_TOOLS=P/web`。

| 实际命令                                                                                     | exit / 实际范围                                                                                       |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| P/web npm ci --offline --ignore-scripts                                                      | 0/0.626秒；仅新固定P装锁定工具，主/B依赖锁不变                                                        |
| P/web npm run build；改按公开入口npm run check                                               | 首次**1/0.073秒**，不存在build脚本；随后0/6.774秒，196定义/27方法、TS构建、54模块182依赖及7分层负例   |
| node --test --test-reporter=tap I/facility.test.mjs，首冻/修订                               | 均0，14/14（12纯断言+2真实模型），0.084/0.086秒                                                       |
| node I/run.mjs --controls，首冻/修订                                                         | 均0，5/5（2真实模型+3普通React调度前提），0.813/0.893秒；cleanup/unhandled/releaseErrors空            |
| node I/run.mjs，首冻/修订                                                                    | 均**1**，0.418/0.426秒；能力阶段缺组件/CSS，六项执行0/blocked6/skip0，不是六项语义失败或通过          |
| node E/old-D04-await-preparation-counterexample.mjs                                          | **1/0.023秒**，同栈前提反例，初稿/完整原流保留                                                        |
| node --test --test-reporter=tap pointer-rebind/facility.test.mjs及contract-facility.test.mjs | 0/0.129秒，相关原27设施通过，不重复旧DOM/全部产品                                                     |
| node E/runtime-audit.mjs；node E/protect.mjs --check                                         | 0；14当前输入/初稿与修订差异、重建49声明与主树字节相等；所有3482旧普通路径/M49声明/3Core/日志前缀保持 |
| Prettier --check专项及计划；git diff --cached --check                                        | 0；只检查明确相关范围，不谎称全仓库格式/lint或根check.sh完成                                          |

所有TAP cancelled/skipped/todo为0。四条实际非零均保留：误用build脚本、两次DOM能力红、夹具同栈前提反例；没有产品断言失败被改绿。
一次apply_patch因格式化表格行不匹配而原子拒绝，未写文件；重读准确上下文后正常修订，不是产品命令或测试结果。
fixture编译warnings空；npm日志含本机verbose配置输出，完整stderr保留，不称全过程stderr空。

## Q1强判据反例单独留证

`node E/q1-parent-diagnostic.mjs` exit0/0.023秒：直接双分支then、native await和`const d=p.then(); d.then(ok,bad)`三种手写消费者，均有窗口内原parent链接且收到原拒绝；最后一种没有在原p上提供实际双向回调。
故“parent链接+最终反馈”不是充分判据。此脚本只诊断Node设施，不接真实组件、不证明Chromium原Promise观察，不是获C批准的新观察器，不改变realm/constructor/模型返回值，Q1仍open。
参考[Node promise hooks](https://nodejs.org/api/v8.html#promise-hooks)及[ECMAScript Await](https://tc39.es/ecma262/multipage/control-abstraction-objects.html#await)；运行时结论来自本B实际Node24，不以网页或他人执行充数。

## 来源、保护、证据与交接

辅助只读审计B39两组181→085243、931→ef80c0的raw delta/mode/type/blob及最终三路径一致；20命令/40完整分离原流，§6.18.1以后未变。未比patch正文、不用A报告定oracle，非C审；主B封档逐块再验字节/SHA/压缩SHA。
可携档`docs/m5_b40_deferred_bindings_freeze.json`含原/现输入、E脚本/完整stdout-stderr、初稿与反例、源码来源原流；长度/SHA和最终SHA在REVIEW_LOG。新`I/evidence.mjs`为纯导出API，必须显式调用verifyEvidence/checkEvidenceControls，直接运行模块空成功不算核档。
首冻输入8项、当前输入含6个旧B支持源共14项；初始快照M1303/B894/P1285普通路径、额外M49声明/3Core全部严格字节/mtime保护，不改旧观察helper/冻结/标准入口/历史档/pins。新固定P产物自建，不用主树移动构建。
无生产/前期行为/API/ABI/TS/Schema/C++/IPC/protocol2/schema7/依赖/配置/工程格式变化；首版无持久化，工程保存/加载/恢复/迁移不适用。
未执行根check.sh、Core三配置构建/CTest/ASan、属性/确认全集、旧DOM/30类型/包外全集、真实Core候选UI/Electron/IPC、Node20/22、跨平台/远端CI/压力。未执行不算通过，不借SDK/设施关闭L06/L09–11或M5。

- 交A：按首冻→夹具纠正→本证据顺序原样吸收，保留首稿/失败但以9b46最终输入为准；仍只部分冻结，不实施未满足前置的完整组件。
- 交C：定向核六项规范/公开记录层、D04/D05同栈前提纠正及覆盖边界；Q1实际浏览器强观察仍待具体适配/审查。C-97不重开。
- 交协调器/D：本B40单元结束，Q1/未提交render/连续旧行stale_action/旧闭包/焦点滚动/完整包外纵向UI等差额保持，D无新任务/D-03仍M6；不接管ACD、不新会话/定时器。
