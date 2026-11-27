# Agent B：M5 共享选择独立冻结与修改前基线

## 结论

固定提案 **52ae57c272cf03ed40ccdd8b1f2995e763cb09b1** 的无争议选择子集已独立冻结：
**27654c9f90d6b9ab209582a15c482bd844ea3504**，test/m5。
新增159项、原两项均因生产缺 SelectionModel/SelectionError 导出失败，未执行选择语义。
提案声明 strict 编译及 B 自写的33项类型负对照通过；这不是运行时验收。
**C-70 输入读取副作用规则仍待补；不批准完整选择契约进入实现，不宣称 M5 完成。**

本轮不看 A 实现、实现差异、自测消费者或自测输出来建立 oracle。
读过共享日志中的 A/C 摘要，明确不宣称严格盲验。
只使用固定 DESIGN §6.5、相关原始需求、公开声明/Schema及本人既有冻结输入。
未实现临时 SelectionModel、自制 mock 产品或改动错误预期取绿。

## 固定对象、所有权与兼容

| 项                    | 固定值                                                           |
| --------------------- | ---------------------------------------------------------------- |
| 契约/修改前产品       | 52ae57c272cf03ed40ccdd8b1f2995e763cb09b1                         |
| B 原测试起点          | 9b1f90f4c924a3cdacd85162511bea942660bedc                         |
| B 独立冻结            | 27654c9f90d6b9ab209582a15c482bd844ea3504                         |
| 自有固定源码/产品输出 | /tmp/hier-b-m5-selection.UMoAV7/source                           |
| 自有测试树            | dft_hierachy-test-m5，test/m5；test/m4 原树不动                  |
| Node/TS/Prettier      | 24.21.0 / 5.9.3 / 3.9.10，darwin arm64                           |
| DESIGN                | fe7e790da95c7b99b917833d3174280e374c810aa00565a8a3d00f963e233980 |
| 公开提案声明          | 80f5e7a1ed1cc2c539c162057212a11a15cdd6fb3ab132942f0f8801d2bfb4e9 |
| Schema                | 30a9ca285b813202b5a9867485a6d301cbd450b31098c582542c3a11c89a1420 |
| SessionContract       | 0295e91ce7b1aac4d8b2a7a9011686f431a787e27747a45309ae6cb636901af6 |

生成/安装只在 B 自有 fixed 目录，未借 A/C 的产品输出或其它工作树 Core 二进制。
元数据审计定义了110个生产/生成/构建/Schema/CI路径（完整范围在脚本及机器输出）：
对 M4 固定 c87f1fa 模式/类型/blob 完全相同，固定 source 的已跟踪文件干净。
这不是 C/A 的294/292路径计数，不能混用范围或冒称执行 Core 三构建。
原14个 B web 独立文件及 fixture 对 B9b/提案逐 blob/实际 SHA 相同，旧红测试未改。

本轮只新增 B 测试、测试类型配置、计划/报告/证据；不改 package scripts、生产 exports 或生产代码。
不修改协议2/schema7、TS原语、C++ API/ABI、IPC、Core/SDK错误、依赖或工程格式。
no-arg/Slice兼容由原两项原字节及新增兼容项保持；导航 back/forward不是规划文档/事实撤销。
首版会话保存/加载/旧工程迁移不适用，不自行恢复被排除的 A20/A21 范围。

## 覆盖与可复核 oracle

[冻结计划](plans/B-M5-selection.md)逐组给出输入、结果、DESIGN依据与待决项；
[运行时测试](../web/tests/independent/selection-contract.test.mjs)包含手写合法输入及63种非法选择、
17种非法构造配置，每项有独立名称/期望错误码/拒绝后的 history/通知检查。
测试只使用公开方法/getters，无私有 hook、Monkey-patch、sleep 或竞速。
固定字面量输入被冻结，避免失败产品篡改后续预期；不以被测输出构造 oracle。

| 组   | 运行时项数 | 主要验收条件                                                                      |
| ---- | ---------: | --------------------------------------------------------------------------------- |
| S01  |          5 | 初值、旧Slice、no-arg/bound、错误类                                               |
| S02  |         20 | 全origin、opaque对象/定义、无宽度、零宽/MAX、有序精确去重、side与Unicode          |
| S03  |         63 | 缺字段/非法类型/显式undefined/null、数值边界、非法后不改合法子集/forward          |
| S04  |         30 | 17项构造错误、bound/unbound/空选择、跨快照、错误优先、输入options复制             |
| S05  |         10 | 初始历史、重复回显、origin不改、重排、分叉、容量1/2/3/默认128、边界no-op          |
| S06  |          4 | 输入复制、所有发布层级深冻结、历史长期有效、未知扩展字段不读取/复制/参与身份      |
| S07  |          9 | 同步状态先提交、登记顺序、多次同函数、幂等退订、发布中新增/取消、非法listener     |
| S08  |          9 | AggregateError原异常顺序、提交不回滚、同身份no-op、变化重入、history移动异常      |
| S09  |          6 | bound/unbound释放、错误优先、通知中dispose停止后续、已有异常仍报告                |
| S10  |          3 | 四个无界面消费者联动、definition/occurrence不猜选、关闭模型的旧微任务不污染新模型 |
| 合计 |        159 | 新增选择子集；不是159个已执行到的语义失败                                         |

[同一类型消费者](../web/tests/independent/selection-contract.ts)含旧Slice、全部公开方法/错误码、
ref/def互斥、精确optional和readonly；positive/33个negative输入独立手写。
proposal配置只把模块解析到固定提案 .d.ts；production配置不映射，要求真实生产导出。
[可执行类型门禁](../web/tests/independent/verify-selection-types.mjs)在内存去掉B33条注解，
要求每项在原行有真实diagnostic，且不存在其它位置/import失败冒充负例通过。
不编译/读取 A 的 consumer 作为 B oracle。

S10只是公开模型间的无界面消费者集成，不是 React、TreeModel、source候选查询或Electron E2E。
真实定义多实例候选、源码多命中/用户选择、纯计划宿主映射、ready后会话构造/SDK销毁，
都仍需后续已审契约和实际纵向链。

## B本人实际运行

目录均为上表 B fixed source/web，格式与冻结提交在 B test/m5；
完整 argv/cwd/退出/用时/stdout压缩归档在[机器证据](m5_b_selection_freeze.json)。

| 实际命令                                                                                                          | 退出与结果                                                                                          |
| ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| npm ci --ignore-scripts                                                                                           | 0，安装71包，锁文件/跟踪产品无变；registry的audit endpoint返回404，完整日志保留，不宣称安全审计通过 |
| npm run check                                                                                                     | 0；195定义/27方法生成零差异、四包构建、22模块/37依赖分层通过，7违规探针按预期拒绝                   |
| tsc -p tests/independent/tsconfig.selection-proposal.json                                                         | 0；strict/exactOptionalPropertyTypes/noEmit/skipLibCheck=false                                      |
| node tests/independent/verify-selection-types.mjs proposal                                                        | 0；原消费者0诊断，33负输入移除注解后各有诊断                                                        |
| tsc -p tests/independent/tsconfig.selection-production.json                                                       | 2；8个选择导出缺失及后续级联/unused expect-error，不是提案类型不兼容                                |
| node --test --test-reporter=tap tests/independent/selection.test.mjs                                              | 1；2总/0绿/2红/0skip；原两项缺SelectionModel                                                        |
| node --test --test-reporter=tap tests/independent/selection-contract.test.mjs                                     | 1；159总/0绿/159红/0skip；158缺SelectionModel、1缺SelectionError                                    |
| 原七文件集合：client/node-transport/node-boundaries/version/review-boundaries/node-private-controls/id-boundaries | 1；221总/220绿/1红/0skip；唯一红为真实Core项缺HIER_BIN                                              |
| 上述除node-transport的六个完整文件                                                                                | 0；207/207、0skip；没有删除/过滤前批红项，前批完整归档仍保留                                        |
| Node语法、Prettier/本轮diff空白、固定来源/原字节检查                                                              | 0；只检查本轮B文件，不全仓重排                                                                      |

初始冻结计划误把七文件全部叫“无Core”子集。
实际 node-transport.test.mjs:113 包含必须真实 HIER_BIN 的验收项，本轮没有新构建固定 Core。
这是测试运行范围/准备分类纠正，不是产品缺陷或 oracle 改变；原初败及退出1未删/xfail。
本轮不为纯契约准备借旧或他方 Core 取绿，也不能因此把前批221写成221绿。
六文件207绿只证明相应 TS/Node回归，不是标准完整M4 258/258的新执行。

Selection红是缺能力，未进入constructor/历史/通知等后续语义断言；并无159份已实证行为反例。
所有运行时测试批次均0skip/0todo/0cancelled；没有虚构当前模型已通过或完整前端已通过。

归档范围检查脚本初次退出1：对git status全文trim误删第一行左空格，导致路径切片错误。
仅修正B归档脚本保留status列后同一测试/source检查退出0；初败完整保留，不是产品/选择断言失败。

## C-70与未执行项

已读取 C-M5-CONTRACT-01/C-70 的最新结论。
已声明 getter输入读取期间dispose、嵌套select/back/forward、抛错/错误优先及原子性范围尚未规范化，
本冻结明确排除；不以 C 的探针输出或 A 未来实现填预期，交 A 补文、C确认后再独立冻结。
未声明扩展字段不读取由原§6.5.2.5明确，原扩展getter/循环字段测试保留，不与C-70混淆。
inherited/proxy/symbol/sparse等JS host对象边界、错误message/stack精确文本、错误实例整体freeze
均不擅定；模型getter仍可读/绑定不可变等明文行为由运行时/类型各自覆盖。
C-70只有提出方C能关闭，不能重新阻塞已认可的M4固定接线。

本轮未新跑Core单测/三构建/ASan/Linux、真实Core/GUI/Electron/Playwright、
processor_core/openc910、GC/内存性能/M7预算或远端CI。
理由：本固定交付只有选择契约/声明，没有运行时或上述纵向UI层改变。
历史M4 B/C执行只按历史对象引用，未搬成本轮执行；当前真实Core回归项明确红，不冒称IPC绿。

## 交接

交 A：可吸收独立27654c9及本结果文档；保留原两项和新159项，不删改/skip取绿。
补C-70的固定规范交C/B，满足C契约审查和对应B冻结后再实现，运行时公开导出后两份消费者都须绿。
交 C：审B公开oracle对应关系、optional presence/绑定优先、固定通知集合/异常顺序/重入/释放；
确认C-70后的额外冻结范围。若认为测试有缺陷，请给规范反例，由B修订并记录版本，不让A修改。
交协调者：只记录此无争议子集冻结和修改前基线，不改M4整体状态或宣布完整M5放行。
