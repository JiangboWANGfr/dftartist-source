# B-ORCH-16 ready事件基准补冻与初始基线

**B-NAV-Q1/Q2按固定规范收敛并关闭；26项补冻完成。**
C16已由C正式关闭C-86、通过§6.13契约；对应契约审查/独立冻结前置满足，可沿既有授权进入生产实现。
这不是运行时验收：固定产品没有SourceNavigationModel，新入口初始能力红，实际执行0/skip0。

## 固定对象与独立oracle

- 产品/规范修订：`b55f27de0a40ca0ffefac4a20a38ad7cf287f66e`。
- DESIGN326802字节，SHA256 `2f55c38a752d3e184ee4daeec43c361e91e5443f4fe6eb57e2272b26cb1b5ee9`。
- B起点`466ef4f715cfd121788b2bd0bb55aa6329310ef5`，独立test/m5-tree。
- **先冻结后运行**：`0efe853560ade65d1c7252fd214998df6c2ecdb1`，5个新文件；原B284/10/46及报告/原红全部保持。
- E=`/tmp/hier-b-orch16-ready.Ij2g9V`，P=`E/source`，自有detached纯固定树，独立安装/构建，无overlay。
- [计划](plans/B-navigation-ready-baseline.md)、[新增输入说明](../web/tests/independent-source-navigation/ready-baseline/README.md)、
  [机器档](m5_b_navigation_ready_baseline_freeze.json)、[只读核验](../web/tests/independent-source-navigation/ready-baseline/verify-evidence.mjs)。

只从固定DESIGN§6.13.2–3、原Bfixture、Schema和公开接口生成预期；不读A实现/consumer/verifier/能力见证/自测档。
已读A交接摘要/相关计划，故非严格盲测；C结论仅确认契约前置，不把C的执行当B证据。
B内部辅助只读静态QA，不代C，不生成另一套契约。
元数据核core/protocol/生产包/脚本/依赖/CI及隔离声明与a02相等，16个原B导入文件逐字节一致。

## 验收条件、输入与预期

新集合26项，每条--list列id/input/expected/basis。独立入口只跑26；
`run.mjs --all`合并原284为310模型，原Core10/类型46仍各自入口，不能把清单数当通过数。

| 条件 / 新输入数                             | 预期与规范依据                                                                                                                       |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 失败后普通重试4、多个E合并1、pending加入2   | not_found/SDK cancelled不撤销未涵盖E1，loadMore/同绑定locate不重设基准；恢复partial才自动一次；§6.13.2、.3表及Q1                     |
| complete→普通分页partial 2                  | 首pending或complete时收到E1，complete不自动查询也不消费记录；后页partial后从首重载一次；.3命令/交错表                                |
| 显式reload 1、暂停恢复3、绑定失效4          | 显式reload涵盖旧事件；cancelCandidates撤销并暂停，恢复仅未来事件；clear/换点/新文档/dispose不继承E1；.2–3                            |
| Q2 pending内新事件2、截取前合并2            | H1在pending前已涵盖E1，pending监听内1或3个E2合并为H2；总3次source.resolve、不同H1/H2、各自completion；截取前事件合并仅H1；.3确定序列 |
| 自动失败后重试2、自动complete后分页1        | 自动已涵盖E1，失败/SDK cancelled/complete均不回退基准；后来手动partial不能重放E1，原H1仍可观察；.3基准/终态表                        |
| H1失败而E2未涵盖1、显式reload新pending事件1 | 失败本身不重试，但E2仍能在手动恢复partial后启动H2；显式reload撤销E1但不撤销其pending内新E2；.3规则组合                               |

**Q1具体oracle：** pending→E1→not_found→普通loadMore重试partial→自动partial：
原命令拒绝保持身份，失败后先停住；共3次source.resolve、1个H1，completion正常结算后无新事件不再刷新。

**Q2具体oracle：** 初始partial→E1→H1 pending监听内E2（SDK尚未发出）→H1 partial→H2 partial：
共3次source.resolve、2个不同句柄，两个completion分别结算，H2保持为当前且无事件不循环。
基准在资格/queryAt检查通过、调用私有reload前一次截取，不在SDK发送时重取。

这些是规范和冻结预期，不是本轮实际运行的新协调结果。
旧B15的clarifications=open/frozen=false与旧README待澄清文本保持历史，不改写归档；当前收敛以本报告及最新REVIEW_LOG为准。

### 设施与断言边界

所有精确计数只计source.resolve，并独立检查文档未自动重读；最终绝对总数防止晚取基线掩盖多刷。
SDK cancelled由合法错误回复制造，不能用显式cancelCandidates替代它。
Q2只在H1自动pending中注入一次事件，确认SDK尚未发送，不误注入初始locate或H2。
原candidateFinish的await后success假定不用于紧接自动的partial：
新局部辅助提前捕获SDK调用，检查原Reply曾公开发布，允许await后状态已合法进入自动pending，不改旧设施。
句柄/Promise按原公开契约跟踪并收尾，不冻结Promise本体；15秒watchdog不是SLA，无sleep/轮询调度。
四项新设施只证旧公开SDK/Candidates的重试及pending→ready→SDK边界可达，不模拟Navigation。

## B本人实际执行

Node24.21.0、TS5.9.3、Prettier3.6.2，macOS arm64。
下列node为`/Users/jiangbowang/.npm-global/bin/node`；测试cwd=B树、HIER_B_PRODUCT_ROOT=P，npm cwd=P。
机器档保存完整argv/cwd/完成UTC/耗时/退出及完整合并stdout/stderr。

| 实际命令                                                                               | 退出与结果                                                                          |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| P：`npm --prefix web ci --ignore-scripts --no-audit --no-fund`                         | 0；独立71包                                                                         |
| P：`npm --prefix web run check`                                                        | 0；195定义/27方法、四包TS、46模块148依赖、7分层负控制                               |
| `node web/tests/independent-source-navigation/ready-baseline/run.mjs`                  | **1**；缺生产公开SourceNavigationModel，planned26，executed/pass/fail/skip均0       |
| 同一入口`--list`及`--all --list`                                                       | 0；26及310唯一输入清单，0语义执行                                                   |
| `node --test web/tests/independent-source-navigation/ready-baseline/facility.test.mjs` | 0；4/4，0fail/skip/cancel/todo；新设施控制                                          |
| `node --test web/tests/independent-source-navigation/facility.test.mjs`                | 0；原4/4，0fail/skip/cancel/todo；旧设施回归                                        |
| `node web/tests/independent-source-navigation/verify-types.mjs --proposal`             | 0；隔离声明正例0诊断、46/46逐项语义负例、0skip；非生产新类型接受                    |
| 原`independent-source-navigation/verify-evidence.mjs --inputs`                         | 0；B15历史37捕获/70材料/47pin/107块、58输入；productChecks=0、当前语义0             |
| 新3个冻结mjs语法、Prettier与冻结`git diff --check`                                     | 0；仅本轮文件，不声称全仓lint                                                       |
| 新`ready-baseline/verify-evidence.mjs --inputs --product`                              | 0；21捕获/42材料/47pin/63压缩块，27项B输入、993次产品文件核对（含重叠pin），0新语义 |

唯一非零捕获为缺公开能力的初始红，不伪称26项语义失败，不标skip/xfail。
新旧4+4设施、提案类型46与模型0执行分别记账，C/A的结果不作B执行。
本轮未重跑同字节旧845/113、2191或Core全量；B15的结果仅保留历史归属。

## 可携证据与保护

机器档591715字节，SHA256 `90909f0ba7a66519c9ff91e5c61c259028db52873643a1dc9da3c286de431760`。
21完整捕获/42材料/47公开pin/63压缩块可逐一核验，含原B依赖/规范/Schema/工具及独立C16日志结论。
新清单SHA256 `b98d48b340019871e536c004ed5274659ea4e741f5759522ba9508fc933ec94e`；
310组合清单SHA256 `b22cc649b5f9630b750869f8a7e341bd7dbdb4ac65be7877113e55ee207f9c5c`。
归档后格式/核验/报告commit/最后日志保护回执另存E，不递归修改机器档。

964主树非日志、653原B、946固定产品文件逐字节保留，其中249旧B测试文件未动。
42主树生成声明保持且与P独立构建相同；主树暂存空，原协调/research保持。
领取时1901309字节日志前缀SHA256 `4dd22428d09995b6d77226fe058db36ed19f93630fa069f08b1ecf3dc6196072`保留。
本轮只新增测试/计划/报告，没有生产、API/ABI、protocol2/schema7、IPC、依赖/lock/标准命令或工程格式修改。
实际SDK/旧模型按finally释放，外部额外订阅finally退订；新协调器资源语义仍0执行，不作FD/内存保证。

## 限制与交接

未执行310新旧组合语义、原Core10/新Core构建、生产类型新导出、旧845/113、全2191、
CTest/三配置/check.sh、实际UI/Electron/IPC/E2E、旧宿主、Linux真实设计、全进程FD/内存或远端CI。
SDK/L6不代L06/L09–11/main/preload；SourceView/Selection、M5整体、D-03(M6)、M7仍各自待验。
首版无持久化，本轮保存/恢复/旧文件迁移不适用。

**B-NAV-Q1/Q2由B关闭：** 规范歧义已消除且对应有限输入已冻结；不是已实现功能缺陷的运行时关闭。
C-86由C16正式关闭，本B不代C；B-POSITION-GATE-01/C-85及前期单元保持已有结论。

交A：原bdbc2c7+本0efe853形成当前冻结，生产模型须实际执行组合310、原类型46/Core10及受影响旧回归；
按§6.13复用共享任务/通知和私有阶段/原失败登记协作，不删除、放宽或skip冻结。
对应C审/B冻已满足，无需新增用户/D审批，沿既有授权实施后提供固定SHA供B独立验收。
交C：后续审实际所有权/阶段边界/旧默认行为/桥接completion；契约通过不代实现正确。
交协调器：本轮有限补冻及初始基线已交付，可以推进实现，不为原样报告导入重跑全量或新增收尾审批。
不接管A/C/D，不新独立会话/计时器，不恢复监控，不跨会话发送/排队消息；本轮结束。
