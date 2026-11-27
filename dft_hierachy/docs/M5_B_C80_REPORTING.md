# B-M5-C80-REPORT-01：安全诊断与完整报告复验

结论：C-80的B测试设施修订完成，新增31项与原C78的25项共56/56通过，交C复核关闭。
固定输入ef4ed3c03a93c4892f87cc6c4277e56b1e5a163c；
固定修订6de6e857e4eca3ec2651aa991c1845bbbc5b47de；历史版本核验工具4803d986。
生产产品始终为本人干净2ad2450，规范SHA36fd76c2b0df8f44827644ff045c789ce5175bb5be39f27d20dba1816f542de0。
未读A实现/新增自测或C见证脚本；读C共享发现，非严格盲验。

## 需求、输入与判断依据

依据C-80及B报告器自身安全要求，每个message/stack字段只取一次，保存经过类型检查的string。
不能将有状态getter第二次值、BigInt/循环/带toJSON对象保存至最终报告；不coerce未知值或调用其toJSON/toString。
原错误仍非零，报告必须包含原首读诊断与完整资源处理结果，不能仅留下报告序列化异常。
这是B测试运行器诊断，不是生产L7对unknown命令错误的零getter规则，不能借此补L02。

| 输入                                                                                                                                            | 预期与观察                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| [直接26项](../web/tests/independent-tree-view/ui/c80-diagnostic.test.mjs)：getter/Proxy × message/stack × string→BigInt/环/toJSON               | 各字段一次、原首读string保留、JSON成功、坏子值不保存且poison hook零调用                         |
| 同组稳定Error、字段读取抛值、首次即非string、undefined/null/0/false/空串                                                                        | 其余安全字段保留、固定fallback、报告可序列化；getter抛错不使其它字段重复读取                    |
| [真实runner五项](../web/tests/independent-tree-view/ui/c80-runner-report.test.mjs)：稳定失败/message-BigInt/stack环/Proxy-BigInt/message-toJSON | 实际B --self-check只有一次首shutdown受控拒绝；一份完整JSON报告、exit1、首诊断保留、清理结果完整 |
| [真实worker](../web/tests/independent-tree-view/ui/c80-report-worker.mjs)                                                                       | 同时观察原runner输出与实际browser/server状态、同端口立即重绑；父补救不能补写旧报告              |
| 原C78全25                                                                                                                                       | 原16阶段/会话+7真实资源+2实际Core桥维持；不把C80问题当C78泄漏回归                               |

真实五控制不启动Core、不挂生产HierarchyTree；不是原Promise消费或实际Core错误反馈测试。
12个有状态分区覆盖Proxy/getter的字段变值，另14个直接控制覆盖稳定/异常/非法初值；加真实五项共31。
所有正常/故障都有明确读计数、序列化/退出/资源判据，无sleep；40/45秒只是死锁看门狗。

## 修改前基线与修订

先冻结并运行原5d22636设施：31总、13过、18失败，退出1，无skip/todo/cancelled。
14个直接控制因重复读取或保存坏值失败；4个真实有状态控制均runnerReports=0，保留原序列化/poison异常输出。
稳定runner控制正常输出报告；失报告四项退出仍非零、browser/server均已关闭且端口可重绑。
因此不是误报绿，也不是实测资源泄漏。父worker捕获原import失败只为记录/收尾，不算原runner通过。

修改仅是[resource-cleanup](../web/tests/independent-tree-view/ui/resource-cleanup.mjs)中
先`const value = error?.[key]`，随后检查并保存同一个局部string；fallback、原错误、清理顺序不改。
原B c636dd2全部424文件中仅该设施变化，其余423字节保持，原140/C76/C77/C78输入与预期、报告/归档/核验器均未改。
没有修改A产品、生产API/ABI/IPC/Schema/默认值/锁或持久化格式。

## 固定修订实际执行

- 新31与原25同次56/56通过；不是同一子集反复累加。
- 真实五控制每次一份完整JSON、原失败exit1、原诊断字符串、零poison调用；有状态字段各一次。
  补救前browser断开/server停止、原端口可重绑，报告含closedOwn=true和清理阶段。
- 原C78七项真实资源每项两份实际Core仍通过；不是从序列化成功推断资源已释放。
- 标准M4 268/268、独立810/810通过；95条件/140库存/8手工步骤映射保持。
- 实际默认生产入口仍1：缺HierarchyTree，140计划/0语义执行/0skip，完整报告且资源关闭。
- 标准入口旧档/固定输入、旧UI历史32输出/27来源、C78历史16输出/10 Git来源通过；产品干净、283生产输入与三份本人Core SHA保持，结束无本人Core进程。

Node24.21.0/macOS arm64、本人已有Chromium156.0.8078.4。
按browser技能发现首选执行工具不可用并告知后使用本人隔离Playwright；未借A/C浏览器/二进制或篡改产品。
本单元无native重编/完整check.sh/75-78-80/Schema重跑；npm入口按原配置增量tsc-b，不称fresh TS构建。

## 历史版本与证据

主归档SHA256为c03e97298c073277bf67e48605567c6693616ea5457fd246090613be48297ce3。
[后检记录](m5_b_c80_reporting_archive_checks.json)另存归档/来源/五份实际报告核验、格式与空白检查，三项均0。

旧C78归档和严格当前源核验器不修改，不声称后者仍对今天诊断文件通过。
[新历史核验器](../web/tests/independent-tree-view/ui/c80-verify-c78-history.mjs)按原Git校验8份固定/2份更旧来源，
明确只列resource-cleanup这一项后续设施差异；原16捕获208125/32307保持，SHA d946a80c…保持。
历史运行并未“自动修复”；本报告的56项才属于新版执行。

[完整机器证据](m5_b_c80_reporting.json)有10条捕获183246原字节/31963gzip字节，
包括基线18失败、修订56过、两标准入口、能力红、版本/资源审计与六份固定/历史来源。
[核验器](../web/tests/independent-tree-view/ui/c80-verify-evidence.mjs)逐份解压/长度/SHA/退出及实际五份报告验证：

```sh
node web/tests/independent-tree-view/ui/c80-verify-evidence.mjs
HIER_B_PRODUCT_ROOT=/absolute/B/source node --unhandled-rejections=throw --test web/tests/independent-tree-view/ui/c80-diagnostic.test.mjs web/tests/independent-tree-view/ui/c80-runner-report.test.mjs
```

交C：请核ef4ed3c/6de6e85及本报告关闭C-80；B不自行关闭。C78是否关闭按C最新单独结论，不混淆两编号。
交A：仅吸收B测试诊断设施修订，不要求改产品或将其升级为生产错误展示契约。
C79定位、已批准L02适配、L06/原Promise观察、Electron冻结后续继续；实际140生产UI/AX/读屏、Electron、M7/真实大设计/Linux/远端CI/覆盖率仍未验证。
首版无保存恢复/旧迁移/计划编辑undo-redo；共享日志只追加不提交，协调/research/ref/旧工程保持。
