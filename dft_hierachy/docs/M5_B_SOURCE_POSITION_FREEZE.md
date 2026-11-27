# B-ORCH-12 当前文档 queryAt 独立冻结与旧基线

完成 §6.12 独立测试冻结；生产 queryAt 尚未实现，未作运行时接受。
同固定契约已获 C-ORCH-12 认可；B 冻结前置现已满足，交 A 实施，不另开报告导入审批。

## 固定版本与范围

- 固定契约/旧生产：`42a92564d5d407aa537960f4738ec8aab7775aa8`。
- DESIGN SHA256：`ab758f1a52725f2e76c5d7b9b1719e4e86c46840922aabda56574d01139f52d5`。
- B 起点：`07f6f3d338dccc12b4fc312561319166296087d5`；分支 `test/m5-tree`。
- 首冻：`4a068f94ca17928af3ccc69ea4fdf2ea75030de9`，先提交，后执行新模型/类型/设施基线。
- 设施分层修订/最终测试冻结：`00f126b93dfe66f0bcaff50f7d0ba617c6a39c0c`。
- E=`/tmp/hier-b-orch12-position.OXc7HyMk`，P=`E/source`；独立 detached 纯固定产品，无 overlay。
- [验收计划](plans/B-source-position-independent.md)、[执行说明](../web/tests/independent-source-position/README.md)、
  [机器档](m5_b_source_position_freeze.json)、[证据核验](../web/tests/independent-source-position/verify-evidence.mjs)。

只据 DESIGN §6.12/§6.10.3/§5.6.2、原 B 手算坐标/HDL 和公开声明定义预期。
未读取 A 实现、consumer、verifier、witness 内容定 oracle；已读交付摘要和计划，故不声称严格盲测。
所有测试从真实公共导出启动；无假 queryAt、运行时提案适配或第二套产品 mapper。
新错误、方法和字段不由 A 自测结果补齐或改预期。

## 验收条件与输入

| 集合             | 输入、预期、依据                                                                                                                                                |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 坐标 75          | 原 B 混合/BOM 表和独立手算 16 组文本；ASCII/tab/BMP/补充平面/组合/BOM/CR/LF/CRLF/空文/EOF/span外/重复长文；按 §6.12.3 返回 UTF-8 字节列，半代理对/CRLF 内部拒绝 |
| 错误优先 51      | disposed、恶意文档、changed 加非法 offset；按 disposed→严格当前身份→changed→原始安全整数/边界同步报独立 SourcePositionError；不探测/转换错误对象                |
| 发布身份 122     | 16 类伪文档/各状态、clone/普通及撤销 Proxy/继承体、跨模型/会话、reload相同底层Reply及新发布；success同目标no-op保持，旧文档不复活；§6.12.2                      |
| 派生值生命周期 2 | 原 query 不可撤销；clear 后原文档重新映射失败，但先前普通 query 不因此自动失效；§6.12.4                                                                         |
| 通知/诊断读取 8  | pending/success/失败/取消/idle/释放通知及 error.data 读取；按当时状态同步读取，不能当命令重入；§6.12.1–2                                                        |
| 真实模型/Core 11 | B 原 include/Unicode/BOM/CRLF、多实例、独立宏，1/2/200 分页；真实文档→queryAt→全部五候选、字节范围/排序、改盘/恢复、跨模型身份；§5.5.6/§6.12                    |
| 独立类型负例 32  | 正向消费者先过，再逐个无标记语义拒绝；同步返回、必需 readonly col/参数、新旧错误联合隔离、保留旧构造/命令；公开声明                                             |

每个模型/真实链用例的 id、input、expected、basis 用 `run.mjs --list` / `--core --list` 列出；
类型集合用 `verify-types.mjs --list`。清单不是执行，draft core 清单曾为 9，最终明确为 11。
模型每次成功/拒绝均检查原 state 身份、SDK/wire/通知/订阅计数不变；返回恰有四自有冻结数据字段。
不增加未规定的对象原型、字段顺序/枚举性、跨调用结果身份或 message 文字约束。
手表的 Buffer 字节交叉核仅属设施，不被运行时断言当作生产转换器。
真实链所有预期源于原 HDL 字节，不由 resolveSource/queryAt 输出生成；复用旧 B 真实 Core helper。

## 本人实际命令与结果

从 B 测试树执行脚本，环境 `HIER_B_PRODUCT_ROOT=P`；安装/构建在 P。
Node24.21.0、TS5.9.3、Prettier3.6.2，macOS arm64。完整 argv/cwd/完成 UTC/时长/退出及合并双流可携保存。

| 实际命令                                                                                                                               | 退出/实际结果                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| P：`npm --prefix web ci --ignore-scripts --no-audit --no-fund`；`npm --prefix web run check`                                           | 均0；71依赖，195定义/27方法、四包TS、45模块144依赖、7分层负控制                              |
| `node web/tests/independent-source-position/run.mjs`，首冻及终冻各一次                                                                 | 均1；planned258 / actual0 / pass0 / fail0 / skip0；能力门缺公开 queryAt                      |
| 同脚本 `--core`，首冻及终冻各一次                                                                                                      | 均1；planned11 / actual0 / skip0；同一能力门，尚未检查 HIER_BIN，未启 Core                   |
| `node web/tests/independent-source-position/verify-types.mjs`，首冻及终冻各一次                                                        | 均1；正向消费者先报缺 SourcePositionError/Code（2305×2）、queryAt（2339）；32负例实际0/skip0 |
| 同类型脚本 `--proposal`                                                                                                                | 0；B 正例0诊断、32/32逐项语义拒绝；仅新导入指向隔离声明，不是生产接受                        |
| `node --test web/tests/independent-source-position/facility.test.mjs web/tests/independent-source-position/legacy-regression.test.mjs` | 首轮1：10例7过3败；分层修订后0：13/13，0fail/skip/cancel/todo；见下文                        |
| `node web/tests/independent-source-document/run.mjs`                                                                                   | 0；原306/306，0fail/skip；旧模型受影响回归，不是新queryAt通过                                |
| `node web/tests/independent-source-document/verify-types.mjs`                                                                          | 0；原正例0诊断及34/34逐项负例，0skip                                                         |
| 新目录 `.mjs` 的 `node --check`、本轮 Prettier及 `git diff --check`                                                                    | 0；仅本轮输入/报告，不声称全仓 lint                                                          |
| `node E/audit.mjs`                                                                                                                     | 初次1：证据脚本误写不存在的包目录protocol；改为protocol-types后0，原错误保留，不是产品失败   |
| `node web/tests/independent-source-position/verify-evidence.mjs --inputs --product`                                                    | 0；33捕获/38材料/50pin/71压缩块，34项B输入及943次固定产品文件核验（含重叠pin）；0新产品语义  |

终冻模型/真实链在能力门退出，不能记为 258 或 11 项语义失败，也不能记为通过。
生产类型负例未执行不能用隔离声明 32 通过替代。首/终冻重复尝试不相加。
没有运行 A 的20类型/3见证，亦未用 C 的26旧投影控制代替本人证据。

### 首次设施红与边界适配

首轮三个坏代理文本 `A\uD800`、`A\uDC00`、`A\uD800B` 直接由自定义 Transport 入站，
按原 §5.6.2 全 wire Unicode 标量规则先触发 SDK protocol_error，未触及 L6。
这是测试注入层错误，不归 A 产品缺陷；完整首轮输出和首冻原测试/计划均保留。
最终保持同一原文及 L6 inconsistent_reply 预期，只在真实公开 client.readSource 成功返回后，
包装新 Reply/result 注入坏原文；真实 wire 交合法 `A`，并断言 SDK 自己确已成功。
这是显式公共方法故障注入，不是合法 SDK 数据流或原 Reply 身份保持。
另增三条普通 wire 控制按 §5.6.2 检查原 HierError(protocol_error) 身份透传。
合法末尾代理对及错行/列两端点控制保持；258/11/32、新手工 oracle 及其余10冻结文件 blob 均未改。
既有 B 内部 QA只静态核分层/契约，不计为 C 审查或额外测试执行。

## 来源、保护与限制

固定产品与 a35122a 的 core/protocol/web生产包/scripts/ci/check.sh/依赖整树一致。
核 fa8d995/07f6f3d 的最终6个 B blob 原样导入；不为辅助报告重复旧1922收尾。
911主树非日志文件、613原B文件、893固定产品文件逐字节保持；41主树声明未动且与 P fresh web 构建声明一致。
领取时日志1774864字节前缀 SHA256 `9c69cc3b753c627fa6119d6b2b766961e9c97177c5ed7ea1330f5fedf3dbf296` 保持。
主树原协调/research未跟踪内容保留；日志只追加、不提交；无产品 overlay 或旧 B 修改。
本轮只新增独立测试/计划/证据，不改生产 API/ABI、IPC、Schema、依赖/锁或工程格式。

新原生执行为0；未构建/复用 A/C/前轮 B 的二进制，也未重复完整1922、M4 294、CTest/三配置/check.sh。
未执行真实 UI/Electron IPC/E2E、Linux/真实设计或远端 CI；受控 SDK/模型不替代这些链路。
首版无持久化，工程保存/恢复/迁移不适用；不新增持久化要求。
单次扫描/常量额外空间留给 A 实施与 C 审查，当前长文坐标例不是 M7 成本证明。
exact只表示上次读取；返回query不可撤销，后续宿主须在异步延迟后重新校验。
文档/候选响应绑定、ready刷新、Selection/SourceView、main/preload/L06/L09–11均未完成，不宣告M5整体完成。
规范未见阻塞本单元的剩余歧义；C-81等历史项不重开、D-03仍属M6。

机器档保存33真实捕获（8条非零含上述能力/设施/核档路径错误），38材料、50来源pin、71压缩块。
格式、核档、提交及最后共享日志追加的回执另存 E，避免递归自归档；核档不执行产品语义。
交 A：原样吸收两次测试冻结后实施 queryAt及共用扫描，保持旧全文/两端校验；新运行时交付后再由 B 验收、C 审实现。
交 C：冻结/分层修订及原失败证据可核，不把提案32类型或旧306当作新运行时通过。
交 D/协调器：本轮 B 已结束，无新契约阻塞；不创建会话/定时器、不恢复监控、不向其它会话排消息，不接管A/C/D。
