# B-ORCH-15 SourceNavigation 无争议部分独立冻结与初始基线

已独立冻结DESIGN §6.13中可唯一确定的部分；**不是新运行时验收通过，也不是完整契约放行**。
固定旧生产尚缺SourceNavigationModel/Error；两个事件基准问题由C确认为C-86，等待固定规范修订。

## 固定对象与独立性

- 固定提案/修改前产品：`a02a20ca8e7e1a225b7d4d5b3db45c0cb2939e23`。
- DESIGN：321543字节，SHA256 `348c171213aef42e46e388a4cce53dc903e99e79dd3b678fba99b08f83600607`。
- B起点：`d397ca5d6d1a245833be9fcd2828fdc0a8448d0e`；独立test/m5-tree。
- **先冻结后运行**：`bdbc2c7fa2fd86c895e05aa9e3bfc25d401d8085`，13个新文件，未改旧测试或产品。
- E=`/tmp/hier-b-orch15-navigation.Kandr42l`；P=`E/source`，B自有detached纯固定产品，独立安装/构建，无overlay。
- [冻结计划](plans/B-source-navigation-independent.md)、[测试说明](../web/tests/independent-source-navigation/README.md)、
  [完整机器档](m5_b_source_navigation_freeze.json)、[只读证据核验](../web/tests/independent-source-navigation/verify-evidence.mjs)。

oracle来自DESIGN §6.13/6.10–12、原B手算坐标/HDL输入、Schema及公开声明。
已读A交付摘要/计划，故不宣称严格盲测；未读A新实现（本轮未交付）、consumer/verifier/能力见证或自测档来生成预期。
C审查与B冻结分开，C的6+2底层探针、A的类型/能力结果不计B本轮执行。
既有B14/C14已关闭，原样导入四报告文件已核，不为该导入重复全量。

## 可验证条件、输入与覆盖

--list为每例保存id、input、expected、basis；模型284、真实Core集成10、类型负例46，ID无重复。
完整输入与清单在机器档，不把清单生成或设施控制当语义执行。

| 条件            | 主要输入与预期                                                                                                                                           |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 所有权/构造     | 未ready、options own descriptor/getter、默认200及边界页大小；先验证后订阅、无构造查询、不关闭借用SDK                                                     |
| 文档/坐标绑定   | 当前严格document身份、changed、混合UTF-8/UTF-16/BOM/CRLF手算位置、恶意/撤销代理；错误优先且不探测被拒输入，同绑定join/no-op，不同document同query重新首查 |
| 原子失效/分页   | 文档pending/失败/取消/reload/clear、候选首/后页在途及晚回复；不发布新文档加旧候选，保留原Reply/页，partial不擅自翻页，过期游标不重试                     |
| 自动ready       | 无历史回放、partial/complete/failed/cancelled交错、事件合并、自动partial无新事件不循环、自动SDK在途新事件、取消/换点/释放撤销、暂停仅恢复未来事件        |
| completion/通知 | 先发布并消费桥Promise、原拒绝身份、成功但监听器抛错、纯协调状态通知、句柄保留/撤销、多个监听抛值单层有序AggregateError、加入者归属                       |
| 重入/释放       | 八命令在输入/通知/跨子模型诊断中的优先拒绝，原失败先登记、dispose cause不被私有子错误替换，旧等待者/completion结算，资源退订                             |
| 类型/真实链     | 严格只读、8 Promise命令、旧错误联合不扩张、无Node类型依赖；Core原文→定位→候选五occurrence，LF/CRLF/宏×页1/2/200及磁盘改后恢复                            |

只要求refresh包装冻结，不要求completion Promise本体冻结，也不要求桥Promise等于私有命令Promise。
不臆加所有通知次数或内部订阅路径；私有子模型所有权/共享机制的实现证据归C。
两例unknown throw/reject为标明的公共候选reload装饰故障注入，不冒充合法wire；
若实现未通过可装饰原型方法，归设施不适用而非产品缺陷，也不能据此算产品通过或skip。
冻结前静态QA修正了装饰器恢复和额外SDK订阅finally清理，没有依据实现输出改预期。

### 未冻结的精细阶段：B-NAV-Q1/Q2 / C-86

1. 候选pending收到E1→not_found失败→显式loadMore重试→partial：E1是否被重试涵盖。
2. E1启动自动命令、发布pending/H1，监听器同步投递E2，随后SDK才查询：基准在pending前还是SDK调用处截取。

现规范不足以唯一确定请求数和句柄数量。两例未猜oracle，不计skip或已覆盖；
冻结的自动在途新事件明确在实际SDK请求发送后注入。
C已独立确认可达并列C-86/open，建议不等于已批准规范。
待A固定修订、C复核后，B再冻结这两例及相邻基准边界；当前无争议冻结可供后续合并，不代表允许提前实现未满足前置的协调器。

## B本人实际命令与结果

Node24.21.0、TS5.9.3、Prettier3.6.2，macOS arm64。
下表node均为`/Users/jiangbowang/.npm-global/bin/node`；测试cwd=B树，
`HIER_B_PRODUCT_ROOT=P`；npm安装/检查cwd=P。机器档保留实际argv、cwd、完成UTC、耗时、退出及完整合并输出。

| 实际命令                                                                              | 退出及结果                                                                               |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| P：`npm --prefix web ci --ignore-scripts --no-audit --no-fund`                        | 0；独立安装71包                                                                          |
| P：`npm --prefix web run check`                                                       | 0；195定义/27方法、四包TS、46模块148依赖、7分层负控制                                    |
| `node web/tests/independent-source-navigation/run.mjs`                                | **1**；缺公开SourceNavigationModel；planned284，executed/pass/fail/skip均0               |
| 同上加`--core`                                                                        | **1**；同一公开能力红；planned10，实际0/skip0，未进入HIER_BIN检查或构建/执行Core         |
| `node web/tests/independent-source-navigation/verify-types.mjs`                       | **1**；生产正例缺6个导出（4项2305、2项2724），负例实际0/skip0                            |
| `node --test web/tests/independent-source-navigation/facility.test.mjs`               | 0；4/4，0fail/skip/cancel/todo；真实旧SDK/模型及原B输入控制，不是Navigation运行时        |
| 新`verify-types.mjs --proposal`                                                       | 0；隔离声明正例0诊断、46/46独立逐项语义负例，0skip；旧类型仍来自真实包，不是生产类型通过 |
| 原`independent-source-document/run.mjs`及`verify-types.mjs`                           | 0；306/306模型、34/34类型负例，0fail/skip                                                |
| 原`independent-source-candidates/run.mjs`及`verify-types.mjs`                         | 0；281/281模型、47/47类型负例，0fail/skip                                                |
| 原`independent-source-position/run.mjs`及`verify-types.mjs`                           | 0；258/258模型、32/32类型负例，0fail/skip                                                |
| 新集合--list、Node24语法、Prettier与`git diff --check`                                | 0；只对本轮文件，不声称全仓lint                                                          |
| `node web/tests/independent-source-navigation/verify-evidence.mjs --inputs --product` | 0；37捕获/70材料/47pin/107压缩块，58项B输入、976次产品文件核对（含重叠pin）；新语义执行0 |

三项非零是未实现能力的初始红，不伪称294项语义失败，也不标xfail/skip。
原模型845项及旧类型113项确实为B本轮重跑，但与新模型0执行分账；新设施4项和提案类型46项另列，不相加冒充新功能验收。
没有运行A consumer/verifier/capabilities；无需为报告导入重跑2191或旧Core全集。

## 来源、保护及证据

机器档742958字节，SHA256 `2d5115a57f38fe05fc7bd45b9515f86c04f63b4ce7bdbe82cd0a48a3a85168d5`。
37份完整捕获、70份材料（含原B依赖/手算表/HDL、规范/Schema/声明及取证工具）、47份公开pin可携；
归档核验/格式/报告commit/最后日志保护回执另存E，避免递归改写机器档。
清单canonical SHA256 `846ab9d5ac574b8dddf81c0a8a317746209aa88d099ca5ca8b59be1accf3b155`。

947主树非日志文件、637原B文件、929固定产品文件逐字节保留，其中236原测试文件未动。
42份主树生成声明保持且与P独立构建相同；主树暂存空，既有协调/research未跟踪内容保持。
领取时日志1869204字节前缀SHA256 `375da80d2dd03ea531792e804feda84a5a3a122aea77bbd7c0ed9ec81dd9b1a3`保留。
未改core/protocol/生产包/依赖/命令/API/ABI/IPC/Schema或工程格式。
运行的旧模型/SDK/Promise按原设施finally释放和检查unhandled rejection；新协调器资源语义尚未执行，不宣称新资源验收完成。

## 限制与交接

未运行新Navigation语义、真实Core集成10、2191全量、原生CTest/三配置/check.sh、真实UI/Electron IPC/E2E、
Linux真实设计、全进程FD/内存负载、旧宿主或远端CI。旧生产同字节且未交付新运行时，故本轮比例适当仅重跑相关三模型/类型。
SDK控制不能代替L06/L09–11/main/preload；SourceView/Selection/M5整体、D-03(M6)、M7仍待各自前置。
首版无会话持久化，保存/恢复/迁移不适用，不自行扩范围。

交A：保持已冻结输入；先提供C-86固定规范修订，不以建议或实现暗定上述两例。C通过且B补齐冻结后再推进对应实现。
交C：本轮B仅无争议部分已冻结；请独立复核固定修订及将来的私有所有权/任务通知协作，C-86只由C关闭。
交协调器：本轮B冻结及初始红已交付，未完成运行时接受或完整契约放行；待修订后有限补冻，不为旧报告状态重复全量。
不接管A/C/D、不新建独立会话/计时器、不恢复监控、不跨会话发送或排队消息；本轮结束。
