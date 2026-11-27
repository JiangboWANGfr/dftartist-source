# B-ORCH-13 queryAt 固定运行时独立复验

原冻结的功能集合通过；标准接线仍有 **B-POSITION-GATE-01 / C-85**，整交付单元暂不接受。
缺少任一必需控制文件时，controls wrapper 只执行另一文件却退出0；不能以当前完整树全绿关闭此反例。
两个编号是 B/C 各自提出的同一缺陷，不是两个不同产品问题；分别由提出方复验关闭。

## 固定对象与独立输入

- 产品：`89ba7879300be09f115efa4464320f56f1c1c8be`，独立 detached P，无 overlay。
- DESIGN SHA256：`3da148e187b7178c67e6e945de13ebd7ef98f24512647b6bae256c99c35e37c0`。
- 原产品行为冻结：`00f126b93dfe66f0bcaff50f7d0ba617c6a39c0c`；B起点 `fb896cf4888abaa1bc42546def101cef19d7d622`。
- 新标准接线设施首冻：`16c6fc712d43551e7738b26bb74e98a1a1d6a44e`。
- 仅隔离嵌套 Node 测试运行器环境标记的最终设施：`2223c974c1d190fe957c60ee291d8abd35667e8d`。
- B分支 `test/m5-tree`，E=`/tmp/hier-b-orch13-position.M4nAvKNr`，P=`E/source`。
- [计划](plans/B-source-position-runtime-recheck.md)、[原输入/预期](../web/tests/independent-source-position/README.md)、
  [机器档](m5_b_position_runtime_recheck.json)、[核验脚本](../web/tests/independent-source-position/recheck/verify-evidence.mjs)。

原258模型/11真实链/32类型、旧306/34及13控制全部原样；15最终B文件与P逐字节相等，§6.12规范正文保持。
oracle来自规范、原B手算表/原始HDL及公开接口，不读A实现/diff/自测/consumer/witness定预期。
已读交付摘要及计划，故不称严格盲测；C审查和内部辅助不替代本人执行。
为检查接线可读标准runner与公开文档，但不从它生成queryAt算法或产品预期。

## 验收条件及现有覆盖

原冻结逐例 `--list` 有id/input/expected/basis；新运行时不需要新增或放宽oracle。
258覆盖坐标75/错误优先51/发布身份122/派生值2/通知与诊断读取8：当前严格身份、旧包装/跨模型/会话、
普通/撤销Proxy零探测、disposed→身份→changed→原始安全整数与边界、BOM/组合/补充平面/CRLF/EOF/span外、
四个冻结自有字段/显式字节列、状态/通知/SDK/订阅零变化及只读通知期调用。
11链为原B include/宏/Unicode/CRLF、多实例、1/2/200分页五候选、改盘/恢复及跨模型；使用真实公开L6→SDK→Node→Core。
32生产类型实际逐项语义拒绝，保持旧构造/异步命令/错误联合，col必需只读且queryAt同步。
原306/34和13控制回归全文坏代理及端点后文本、错行列和SDK标量层；不拿旧绿替代新逆向入口。

旧wrapper20设施只覆盖identity/default-document model/core，不能证明新增position模式。
新21独立设施按公开position model/core/controls入口及AGENTS固定集合规则定义正常、exit、signal、missing和非法组合，
验证cwd/产品根、环境及参数、非零传播与串行停止。controls是一次Node --test聚合，不臆加逐文件停止或exit23原样透传规则。
这些是门禁设施，不计入2191产品总数。

## 本人实际执行

Node24.21.0、TS5.9.3、Prettier3.6.2，macOS arm64。模型脚本cwd=B树，HIER_B_PRODUCT_ROOT=P；
标准命令cwd=P，HIER_BIN=P/core/build-b-review/hier；完整argv/cwd/UTC/时长/退出及合并双流归档。

| 实际命令                                                                                                                               | 退出/实际结果                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| P：`npm --prefix web ci --ignore-scripts --no-audit --no-fund`；`npm --prefix web run check`                                           | 均0；71依赖，195定义/27方法、四包TS、46模块148依赖、7分层负控制                             |
| `node web/tests/independent-source-position/run.mjs`；同脚本`--core`                                                                   | 均0；258/258、11/11，0fail/skip                                                             |
| `node web/tests/independent-source-position/verify-types.mjs`                                                                          | 0；正例0诊断、32/32独立语义负例、0skip；实际生产声明，不是提案控制                          |
| `node web/tests/independent-source-document/run.mjs`；对应`verify-types.mjs`                                                           | 均0；原306/306及34/34类型负例，0skip                                                        |
| `node --test web/tests/independent-source-position/facility.test.mjs web/tests/independent-source-position/legacy-regression.test.mjs` | 0；13/13、0fail/skip/cancel/todo                                                            |
| `cmake -S core -B core/build-b-review ...`；`cmake --build core/build-b-review --target hier -j4`                                      | 均0；本轮fresh单配置产品，build84.451秒、warning0；完整参数在机器档                         |
| `HIER_BIN=... npm --prefix web run test:independent`                                                                                   | 0，43.102秒；2191/2191、0fail/skip；另13控制通过，不加产品数                                |
| `HIER_BIN=... npm --prefix web run test:independent:m4`                                                                                | 0；294/294（268+26），0fail/skip；与全集重叠不累加                                          |
| `HIER_SCHEMA_PYTHON=<B既有schema-venv>/bin/python npm --prefix web run test:schema`                                                    | 0；655/655结构/元数据和27归一化，0fail/skip/missing-client-methods                          |
| `node --test web/tests/independent-source-gates/wrapper.facility.test.mjs`                                                             | 0；旧20/20设施，单列不代新接线                                                              |
| `node --test web/tests/independent-source-position/recheck/wrapper.facility.test.mjs`                                                  | 首冻1：21=14过7败；仅环境适配后1：21=19过2败、0skip，下面分层解释                           |
| `node --test E/node-context-probe.test.mjs`；`node E/gate-missing-probe.mjs`                                                           | 均0；独立环境诊断1控制、两次普通Node缺文件实际零退出复现；不是产品接受                      |
| 公开导出/声明兼容、来源、逐组结果与保护审计，Prettier/语法/空白检查                                                                    | 0；不声称全仓ESLint或远端CI                                                                 |
| `node web/tests/independent-source-position/recheck/verify-evidence.mjs --inputs --product`                                            | 0；34捕获/32材料/49pin/66压缩块，23项B输入及960次固定产品文件核验（含重叠pin），执行0新语义 |

完整2191组成为810 Node +26身份 +281属性/5属性Core +renderer99/25/12/40/6 +Source306/4时序/14Core
+Candidates281/13Core +Position258/11Core。32类型、13控制、旧20/新21wrapper及probe均分别记账；子集不重复相加。
初始修改时间采集对B旧树不存在的AGENTS.md直接stat，实际退出1；改为记录null后0，原错误保留，不是产品失败。
归档材料列表草拟时不存在文件名的读取错误仅属归档准备，不归产品/测试失败；最终材料及哈希核验通过。

## B-POSITION-GATE-01：独立新反例

首冻21中7条controls连正常项都零marker。环境探针确认父级node --test设置NODE_TEST_CONTEXT=child-v8，
继承后子Node明确warning递归跳过、故意exit23的文件不执行却返回0；只删除此标记后，坏文件真实执行且聚合退出1。
因此B仅在设施子进程环境副本删该运行器标记，不改产品、21输入/预期或广泛清环境；原14过7败和首冻保持。

适配后19过2败仅 `controls:missing:0` / `controls:missing:1`：

| 控制输入                                       | 规范预期                 | 本人实际观察                                |
| ---------------------------------------------- | ------------------------ | ------------------------------------------- |
| 缺facility.test.mjs，另一必需文件存在          | 标准控制集合不完整，非零 | Node实际只执行另一stub文件1项，wrapper退出0 |
| 缺legacy-regression.test.mjs，另一必需文件存在 | 同上                     | 同上，退出0                                 |

普通Node最小probe再次在各自独立临时目录复制固定wrapper，逐个不创建所缺文件；非node --test父上下文，
保留完整子argv/cwd/双流，确认现存文件确实执行且只有1项/exit0，不是设施假红。
实际发布的缺陷为标准门禁对必需文件缺失的完整性保护，不否定文件齐全时真实queryAt集合通过。
两个缺文件断言保持非零，不用Node默认忽略路径行为反过来改oracle。
稍后重读日志见C已独立提出同一C-85；C实测4/9分组仅归C，不当作本B的新执行。
由A修标准接线，B/C分别复验关闭；B不实现产品修复，不关闭C意见。

## 来源、资源与兼容

自建Core9325112字节，SHA256 `fe203f283777de14bdfc58969dd7235431588e9a4281ac0d11659651bb06d7ec`。
RelWithDebInfo；M3/FUTURE ON，observer/sanitize/experiments OFF。仅复用既有第三方源码，不用A/C/前轮B二进制或对象。
真实链helpers拥有的进程等待退出0，最终自有Core进程表瞬时0仅作补充，不能单独证明全部退出。
929主树非日志、628原B、911固定产品文件逐字节保持，P无overlay；主树暂存空，原协调/research未跟踪内容保持。
42主树声明未动且与P fresh web构建相等；旧41中38声明保持，index/model/source-location三份按新增API变化，另新错误声明。
旧公共运行时导出无删除，仅增SourcePositionError；SourcePositionErrorCode是类型导出。
core/protocol/SDK/protocol-types/views/锁与基线42a9256整树相同，旧SourceDocument/Candidates公共数据声明不改。
无Core API/ABI、IPC、Schema、生产依赖或工程格式变化；本B只新增测试、计划和证据，不改旧oracle。
领取时日志1806525字节前缀SHA256 `c71bc6e71e0048c0fb6dee2287826a62e5ff63ede347dd11042d9dacc41a0ccb` 保持。

Core未改，本轮只构建fresh hier供真实链，未重复CTest/Debug/ASan/check.sh；A的75/78/80不归B执行。
未执行真实UI/Electron IPC/E2E、Linux/真实设计或远端CI；L06/L09–11、main/preload、自动ready/显示绑定/Selection/SourceView仍未验收。
首版无持久化，旧工程保存/恢复/迁移不适用；D-03仍属M6，M5未整体完成。复杂度共用扫描审查归C，非M7成本结论。
机器档完整保留34捕获（3条非零：元数据脚本、设施初红和真实剩余红）、32材料及49pin；核档/格式/commit/最终追加回执另存E，避免递归归档。

交A：原样吸收2223c97最终设施（含首冻历史），修B-POSITION-GATE-01/C-85后给固定SHA。只改必需文件保护时按风险窄复验，不为报告导入再重复2191。
交C：同缺陷分别关闭，B原32/258/11及旧行为实际通过；新21和环境适配/完整初红可核，不代C实现结论。
交D/协调器：本轮B取证/冻结/复验结束，但接线缺陷未关闭；不因全文件绿宣告整单元或M5完成。
不创建会话/定时器、不恢复监控、不向其它会话发送/排队消息，不接管A/C/D。
