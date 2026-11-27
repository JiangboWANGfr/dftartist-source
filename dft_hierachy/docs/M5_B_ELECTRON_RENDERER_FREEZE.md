# M5 renderer 专项独立冻结与初始基线

任务：B-ORCH-2-ELECTRON-RENDERER-FREEZE-01；协调器cycle=2，2026-10-16。

## 结论与固定点

独立输入冻结 **c99143c5baff94fbe1f41a5c3da77a0b70f475e9**：99项renderer Transport/真实SDK集成输入
（其中15项SDK链），16项类型负例及正例消费者。逐项输入/预期/依据由`run.mjs --list`与`verify-types.mjs --list`列出。
固定产品 **782c599f710bd73a7e1be1cb38a4dca7786831bd**，B原基线44be464307b747ff177178943dace973c349ed71。
本轮先提交冻结，再执行产品能力门禁。产品尚无公开renderer出口，初始基线为能力红，**99计划/0语义执行/0skip**；
公开类型正例缺模块，16项负例实际执行0。不是99项语义逐项失败，也不是产品通过或用skip隐藏失败。

只冻结renderer这一增量，不宣称整个Electron冻结或M5放行。可控Bridge是公共单元输入，不是preload/IPC替身。
依据获C通过的DESIGN §6.8、§5.6.2/5.6.5和公开隔离声明、手写B wire样例；未从A实现/diff/自测生成oracle。
已见共享交接摘要，故不是严格盲测。本轮新文件与计划不改生产/API/ABI/IPC/Schema/工程格式/依赖锁；旧测试/历史红不变。

## 验收条件与层次

| 条件                | 输入/预期与依据                                                                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Bridge/版本/connect | 缺失/非法能力先拒绝且零connect；坏版本不领取；失败重建本地HierError；损坏结果protocol_error且不猜别的id。§6.8.1/4                               |
| 所有权、顺序、清理  | 唯一onMessage、off不恢复所有权、start晚于订阅返回、通知异步FIFO、关闭/退订取消排队、onClose独立与晚订阅、只清自己的id。§6.8.3/4、§5.6.5         |
| 边界/非法数据       | 256/257完整帧，ASCII/中文原UTF8 4MiB−1/恰好/+1；首投递后解除局部cap；损坏IPC外壳、重复解码键/非法JSON/代理字符不交SDK。§6.8.3/4、§5.6.2         |
| 出站与诊断          | owning JSON不随调用者修改，Unicode失败不发送；关闭原因固定、DTO为本地错误且保留JSON诊断，不搬运remote stack。§6.8.3/4                           |
| 真实SDK集成输入     | hello→roots保留Core snapshot；原始小数/指数token不经stringify抹除证据；Core原错误后仍可查询；pending只结算一次；非法首帧不能滤成成功。§5.6/§6.8 |
| 类型/包边界         | 实际公共正例零诊断后才运行16负例；缺模块不算类型负例通过；浏览器bundle/无Node realm仅模块加载与工厂导出形状，不调用工厂。公开声明/§6.8.5        |

设施自检只验证B输入：7项（含某资源清理抛错仍继续清其余资源），Schema 2正2负；不是产品用例通过。
`--proposal`是显式隔离声明控制，正例零诊断/16负例真实语义拒绝；不存在运行时工厂替代或公开出口自动fallback。
setImmediate任务边界排空微任务，无sleep竞速；15秒watchdog只防挂死，不是产品SLA。

## 实际命令与结果

P=`/tmp/hier-b-orch2-renderer.MYz8ta/source`，自有detached782c599；T为B的`dft_hierachy-test-m5-tree`。
Node24.21.0/darwin/arm64，PATH=`/Users/jiangbowang/.npm-global/bin:/opt/homebrew/bin:/usr/bin:/bin`。
未另注cwd为T；产品相关命令显式`HIER_B_PRODUCT_ROOT=P`，审计另有`HIER_B_MAIN_ROOT`指向共享主树。
详细绝对argv/cwd/UTC/退出/时长/完整输出gzip/长度/hash见机器档。

| 实际命令                                                                                 | 结果/解释                                                                                                             |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| cwd P，`npm --prefix web ci --offline --no-audit --no-fund`                              | 0，71包；只有锁定第三方开发依赖，不借别的树产品产物                                                                   |
| cwd P，`npm --prefix web run check`                                                      | 0，四包TS构建、195定义/27方法、34模块/88依赖、7分层负探针；未运行A自测作为B证据                                       |
| `node --test web/tests/independent-electron-renderer/facility.test.mjs`                  | 0，最终7/7、0skip；设施控制，不是产品                                                                                 |
| `node web/tests/independent-electron-renderer/run.mjs --list`；`verify-types.mjs --list` | 均0；最终99与16枚举，原预冻结94枚举另存且不冒称最终输入                                                               |
| 同目录`verify-fixture-schema.mjs`                                                        | 0，SnapshotInfo/InstInfo 2正2负，只核样例与公开Schema                                                                 |
| 同目录`verify-types.mjs --proposal`                                                      | 0，获审声明正例0诊断，16逐项真实负例；非生产出口                                                                      |
| 同目录`run.mjs`                                                                          | **1**，ERR_PACKAGE_PATH_NOT_EXPORTED，99计划/0语义/0skip                                                              |
| 同目录`verify-types.mjs`                                                                 | **1**，正例TS2307缺公共模块及后续implicit-any；0负例执行                                                              |
| 同目录`browser-gate.mjs`                                                                 | **1**，同一缺出口能力红；0模块加载，不声称browser/Electron通过                                                        |
| `node --test web/tests/independent-transport-sharing/compatibility.test.mjs`             | 0，既有10/10、0skip；原公共导出/声明/获准旧收件箱兼容及真实SDK；隔离JS realm不是Electron                              |
| `node web/tests/independent-tree-view/ui/l02/c81/verify-evidence.mjs`                    | 0，旧16捕获/8pin档完整性，0新生产语义；不重复C81浏览器集                                                              |
| 同目录`audit-baseline.mjs`                                                               | 0；494份原B跟踪文件逐字未变，产品730/共享主树729非日志跟踪文件匹配固定SHA；10份冻结测试源逐字匹配；领取前日志前缀保留 |

完整机器档：[m5_b_electron_renderer_freeze.json](m5_b_electron_renderer_freeze.json)。
22条命名捕获、10份冻结源pin；104777原始输出字节/19826 gzip字节。
最终机器档82074字节，SHA256 `8db96201a93e81efd7008cc0a0dc772ea836a63290ad519f42990323b135ed84`。
`node web/tests/independent-electron-renderer/verify-evidence.mjs`只核归档/冻结源/枚举与红绿分类，不把档案核验当产品运行。
实际最终执行退出0，核到22捕获/10pin；最终Prettier检查与`git diff --check`均0。
整理机器档时追加argv产生一次JSON格式检查退出1；仅格式化机器档后最终检查0，未改冻结输入或产品，非产品缺陷。
审计只hash字节确认出处，没有读取生产实现建立预期；共享未跟踪18文件在本次审计时留pin，不冒称有本轮领取前全量未跟踪快照。

## 限制、窄歧义和交接

- BER-Q01：connect结果前closed时工厂Promise应返回closed Transport或拒绝，未冻结唯一形态。
- BER-Q02：合法IPC外壳中的非法原JSON，已冻明确关闭code/origin/零交付，但`invalid_frame`与`invalid_ipc_frame`的精确reason未自定。
- BER-Q03：声明外Bridge函数直接throw/reject的转换优先级及sessionId空串/格式未明确，不据实现自定。

交C/A核这三个窄点，不重开已审§6.8或阻塞无歧义输入/既有属性；A待该增量按既定C/B前置实施，不从能力红倒推预期。
剩余Electron主进程/preload来源权限、真实contextBridge、双窗口/导航/崩溃/重开、Core进程回收和真实Electron→SDK→Core E2E另冻/执行；
本轮不是这些任务的完成证据，也不是L06/L09–11、UI/AX、M7、三配置/CTest、Linux/远端CI或1096新执行。
不以设施计数声称普遍无资源泄漏。缺实现之外，浏览器gate即便未来通过，也仅证明bundle加载/工厂形状，不证明factory在无Node realm执行。

结束前最新C交接已通过Source§6.10契约并正式关闭C-81；这是C的决定，不记为B本轮执行。
Source独立冻结已满足C前置但不在本renderer增量内，下轮可领取；属性验收不重开、历史红保持。
本协调器token交接后结束，不创建会话或定时器、不恢复已停B LaunchAgent、不执行旧监控ack、不向A/C/D会话投递消息。
