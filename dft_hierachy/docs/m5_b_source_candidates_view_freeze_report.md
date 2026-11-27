# B32 候选视图部分冻结与初始基线

## 结论

固定产品 `e2546892a243a624d0caf7ad5b0df2976dd57264`。
独立冻结 `8529290e805ae9b6e57301a1ae8417cc5b9be49e`（9新增路径/1792行），B分支 `test/m5-tree`，前序 `e86f478`。

本轮仅完成 §6.18 的**部分冻结**，不是整个契约/组件实施放行或UI验收。
56项DOM输入及30项类型负例已冻结；每项输入/预期/依据见 cases.mjs、types.mjs、计划。
新组件/CSS未实现，DOM为planned56/executed0/passed0/blocked56/skip0，生产类型负例为planned30/executed0/blocked30。
不是56项语义断言执行失败，也不是0失败代表通过。

依据为产品固定DESIGN §6.18及引用章节、权威Schema、原B fixture和公开接口。
没有根据A实现/diff/隔离消费者/自测改预期；固定交接/计划中连带的A验证表不作为本B证据。
不修改原B121/37、Q1六项/Core八项或旧SourceView/导航/选择冻结。

## 本B实际执行

P=`/private/tmp/hier-b-orch32-candidates-view.BQaLbW/fixed product 中文`；
E=`/private/tmp/hier-b-orch32-candidates-view.BQaLbW`。
Node24.21.0/Darwin arm64；React/ReactDOM18.3.1、esbuild0.25.11、Playwright1.64.1、Chromium156.0.8078.4。
新入口位于B的 `web/tests/independent-source-candidates-view`，设置 HIER_B_PRODUCT_ROOT=P、HIER_B_BROWSER_TOOLS=P/web。
生产依赖/锁不变，独立工具安装仅P，原产物不复用。

| 命令                                                                        | 退出/结果                                                                                            |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| npm --prefix web ci --ignore-scripts --offline（P）                         | 0，按固定锁安装工具，未改锁                                                                          |
| npm --prefix web run typecheck -- --force（P）                              | 0，独立生成49声明，逐字同主树原声明                                                                  |
| node 新目录/run.mjs（冻结后）                                               | **1 / 0.976秒**；缺SourceCandidatesView；56全部blocked；CSS根子路径另有ERR_PACKAGE_PATH_NOT_EXPORTED |
| node 新目录/verify-types.mjs（冻结后）                                      | **1 / 1.006秒**；正例缺4公开名，30负例未执行，不能用缺导出充负例通过                                 |
| node 新目录/verify-types.mjs --proposal（冻结后）                           | **0 / 20.298秒**；B独立声明正例0诊断、30逐项真实语义负例；无Node/Electron类型输入                    |
| node 新目录/run.mjs --controls（冻结后）                                    | **0 / 0.733秒**；12旧模型/浏览器设施，非新候选UI通过                                                 |
| node --test 新目录/facility.test.mjs（冻结后）                              | 0；4清单/Promise观察限制设施，不证明产品原Promise消费                                                |
| npm --prefix web run test:independent:m5:source-confirmation（P）           | **0 / 12.015秒**；原B121行为/37类型+B31 Q1六项，0blocked/skip                                        |
| npm --prefix web run test:source-confirmation:controls（P）                 | **0 / 3.003秒**；B6+新B7+A旧6=19；另A27接线正负控。作者/用途分账，不当独立B业务新增                  |
| npm --prefix web run check（P）                                             | 0；生成一致性、TS/分层及7越层反例，实际原输出随档                                                    |
| 新文件Prettier check、git diff --cached --check、E/protect.mjs --protect    | 0；完整输出/命令已封存或列后封回执                                                                   |
| node 新目录/verify-evidence.mjs --inputs                                    | 0；只核档/输入，不执行业务                                                                           |
| node 新目录/verify-controls.mjs --out E/archive-controls.json；--verify该档 | 0；1正/8正确重封gzip+hash负档均实际退出1且AssertionError，非缺模块/语法失败                          |

12设施包括：真实SDK/Navigation/Selection权威确认、旧SourceView原文、原生真实鼠标click；
8种合法模型前提（complete/partial空、legacy、重复、complete首页+partial末页、pending/failed/cancelled前缀）；
真实旧SourceView Alt+Enter→同导航point查询，Selection仍空。后者不包含新候选行，不能记作完整候选UI纵向链。

## 首设施问题及保留

主档保留35捕获，其中7非零：2次B JSX括号错误造成build阶段失败；3次新能力/类型初始红；
1次未知reason非法wire设施失败；冻结后生产类型能力红。具体name和完整原始输出见主档，不能全部归产品缺陷。
更精确的实际非零name清单由verify-evidence逐项校验，不改写历史。

冻结前依据规范/Schema修正自身设施：partial前缀loadMore是no-op，改合法complete首页+partial末页；
错误码internal_error改为公开枚举internal；unknown reason B_future_reason改合法unsupported/indexing；
移除内部声明拆分文件名约束；源码UTF16点按全文文本定位，不要求首Text节点长度>1。
完整首JSX和未知reason前源码保留。类型/行为期望不从A实现改写；本套件没有已存在新UI实现可迎合。

封档后发现证据传输工具一次把1074311字节JSON截断为1048605字节，首次核档因此失败。
坏副本保留E/archive-tool-truncated-v1.json；18个有界文本块经apply_patch恢复原档，最终bytes/SHA同E原档。
核档器首轮只识别多行JSON，误漏单行保护报告，另保留原脚本/AssertionError；修元数据parser后0。
两项属于证据设施，不重跑/改写产品期望；封档后回执单独保留，不递归改主档。

## 可携证据与保护

主档 `docs/m5_b_source_candidates_view_freeze.json`：
**1074311字节，SHA256 3964e9311e779ce9e6a96228fdc90f5a101505af2f1363033023af717466cb3c**。
35实际捕获、24材料、9冻结输入；包括完整压缩原输出、规范/Schema、初始源码、保护及助手审计。
outer stdout_*为合并双流，utc是完成时刻；助手内层36路为实际分离双流，不混淆。

助手只读来源审计18命令全0，574618字节/SHA256 9e0bf8354f82c1d73e003d42a4f547313375fef2ead3dcd1508e49ae05a3380b，已携主档。
B31两笔完整path/mode/type/blob delta相等；最终12文件B/main24处核同。
Core生产77/公开头37、protocol9、web/packages60及锁4对象不变；只核元数据，不据实现定预期。
助手独立静态复核的是本B新增设施，反馈的规范/Schema过约束已在冻结前修正。
其一次过宽只读检索带出旧SDK errors.ts的一行类型import，未用于oracle；不虚称所有辅助输出绝无生产文件名/行。

M1204/B805/P1186原路径字节及mtime保持；主49声明/3普通Core严格保持。
只在P写生成输出，不使用主树/其他工作树的Core编译产物；本轮没有Core运行或冷构建声明。
初始共享日志前2429152字节/SHA256 4bffc2ea5b1b766a3dc724a2428e62dbacedabcf32e1fd65037d2e2b98f355f9保持。
主树原REVIEW_LOG/M3-coordination/research、旧工程/ref只读保护；日志只追加，不提交。
核档正负控制覆盖：DOM基线假绿、隔离类型零跑假绿、浏览器清理失败、标准121零跑、
生产类型能力假绿、oracle改写后重hash、强Promise过度声明及隐去原设施失败。

## 最新C答复及未完成边界

C32的7组诊断/partial反例属于C执行，不写成本B复验。
C接受当前合法wire只用Schema7枚举；B32-Q2作为**输入可达性问题**按此关闭，
未知reason仍“当前合法模型不可达/未覆盖”，不是运行时通过；A前向显示策略补文仍须C审。
C-95由C提出，只有C能关闭：partial+next的UI加载更多条件须A修订，不改既有L6 partial no-op。
本冻结没有partial+next按钮条件断言，保持原输入不擅改规范。补文后B须追加complete+next/partial±next及partial末页按钮负控。
B32-Q1保持打开：C认可native-await盲区及公开调用透传记录，但未批准完整真实浏览器原Promise强观察适配。
Node promise hook方向不能自动代替Chromium实际组件消费证据，不强迫产品使用特定then写法。

本轮剩余未补冻：props读取顺序/订阅精度、flushSync通知栈后签发、未提交render、失败绑定批次；
精确page/index/action/调用次数、旧闭包和pointerdown→重绑/cancel/触摸/辅助激活、同Reply新链；
原Promise直接观察/成功拒绝/同步卸载与迟到反馈/回调替换再抛；
未知扩展/诊断getter不可遍历；多实例ID和局部双轴滚动/焦点移除/外部焦点；
完整tarball根入口/peer/CSS包外消费、真实Core候选UI纵向链与旧全UI回归。
当前56只是部分公开输出/键盘输入，不表示这些剩余均被证明；repeat/IME项是合成边界输入，不是真实IME系统测试。
不据一个Selection通知证明内部select恰一次；未加载组件时fixture编译/设施不能排除所有未来组件路径上的测试问题。

## 交接

交A：可原样导入8529290和本报告提交，不改变旧冻结；先回应C-95及需要的规范补文，
不能把部分冻结/类型绿视为整个SourceCandidatesView实施前置满足。
交C：本B四设施、合法模型12设施及初始红已有独立证据；请审本次固定部分输入与后续具体观察适配，不代B关闭Q1。
交协调器：本轮部分冻结/取证/提交完成；下一实际B任务依新契约或具体受审适配继续，不为报告导入重跑相同全集。

未运行完整web独立/check.sh、三配置Core/CTest/ASan/native、Linux/Windows/真实大设计/M7/远端CI。
没有React/Electron→main/preload→IPC→Core新E2E；旧树L06/L09–11、M5整体、D-03/M6均未关闭。
本B不改产品/API/ABI/IPC/Schema/依赖/配置/工程格式，无持久化，保存/恢复/旧工程迁移本轮不适用。
