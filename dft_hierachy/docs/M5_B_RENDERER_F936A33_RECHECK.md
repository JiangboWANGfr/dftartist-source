# B f936a33 renderer复验与BER精确冻结

## 结论及固定对象

**本次renderer公开接口冻结范围独立复验通过。** 原99/25/12、16类型负例及标准1232回归通过；
新增BER40和本id提前故障6项均通过、0skip。C已经正式关闭C-82/C-83；本B按获审规范及新增执行关闭自己提出的BER-Q01～03，
不代关C、不表示完整Electron或M5通过。

| 对象                    | 固定SHA                                             |
| ----------------------- | --------------------------------------------------- |
| 产品                    | f936a33876656246ccea172c4c9447ff59f9983f            |
| 新BER40输入冻结         | 42b0804ddeeaffa35e52c69f54b552d049f0fe94            |
| 新本id提前故障6项冻结   | cf9abb0a469d2bce0f102c33d3a3e733830fe8e1            |
| 原99/16、C82/25、C83/12 | c99143c / d3d69d6 / ee7561e（完整SHA及pin在机器档） |
| 修前产品                | 1087f78c19cb4e3400bb4093c575b51144c9c7e6            |
| 本轮B起点/历史红报告    | 8d60981103008398c236e8ae7150117c8e553e44            |

任务B-ORCH-4-RENDERER-RECHECK-BER-01，token dft-orch-4-b-49a667b4-6663-4d7e-be9a-d170afb7967b。
固定DESIGN与edac525相同，SHA256 df33fa23d2eb5b74ab9c4519f94e5f8cc2605af706601350f3174084dc1d8471。
Oracle只来自获C认可并回填的§6.8、公开声明及原B fixture；未读A实现/diff/新增自测或C探针生成预期。
已见共享交接摘要，不是严格盲测。新输入各先提交，再实际执行；没有修改预期取绿。

## 需求→精确验收与历史结果

| 新输入                                                    | 预期与依据                                                                                                       | f936a33 / 修前1087f78                                           |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Q01 6：正常/transport/client首因×是否后续关闭扰动         | 合法claim必须返回closed Transport；晚onClose异步得首因；真实SDK ready拒绝transport_closed。§6.8.3                | 6过 / 4过2败（client首因后的closed-send分类）                   |
| Q02 7：五种坏原JSON及两种坏外壳                           | reason分别invalid_frame与invalid_ipc_frame，零交付；不改变SDK具体方法校验归属。§6.8.3/4                          | 7过 / 7过                                                       |
| Q03 27：connect2/start4/send3/重入快照2/清理12/opaque id4 | 未claim不猜id，故障ipc_unavailable；已有首因不覆盖、close→release尝试、终态分类和opaque string。§6.8.3/4、§5.6.2 | 27过 / 25过2败（send内及getter内先closed后throw的core诊断分类） |
| 本id提前故障负向6：提前frame/坏版本×无/正常/异常首因      | 不能靠全部丢弃提前事件修foreign隔离；本id故障关闭、先有首因保留、合法claim返回closed。§6.8.3/4                   | 6过 / 6过（原已正确行为保持）                                   |

新40在修前实为36过/4败，不把所有新增项都伪造为原本未实现；同一已冻结40在固定修复上40/40。
原C82的5绿20红、C83的4绿8红和最初缺出口99计划/0语义历史档均保留，不改写成当时通过。
每项输入/预期/依据见`ber/run.mjs --list`及`ber/claim-run.mjs --list`；原99/25/12字节未变。
40与6是独立补充入口，**当前标准全集仍1232，不声称新46已接入标准或将重叠重跑累加**。

坏release在副作用前抛错的4项，由B finally强制断开其夹具回调，结果单列fixtureFaultDetach=4，
绝不算产品release或远端资源回收。其产品断言是close→release尝试、首因和本地终态；
close故障同步返回形态不额外猜测，surfaceThrows仅观测（本次0）。不能以这些输入证明坏桥远端回收或普遍无泄漏。

## 实际构建与命令

P=`/tmp/hier-b-orch4-renderer.zsLMHJ/source`，T为B自有test/m5-tree。Node24.21.0/macOS arm64，PATH前置全局Node24目录。
产品命令cwd=P；单独renderer/BER入口cwd=T且显式`HIER_B_PRODUCT_ROOT=P`；真实Core指定`HIER_BIN=P/core/build-b-review/hier`。
旧1087只在B原自有固定树`/tmp/hier-b-orch3-renderer.iRHIDr/source`回放新无Core输入，使用其原先独立构建TS；不是将旧产物借入新产品。
Schema复用B上一轮锁定且已核版本的隔离测试Python；非产品二进制/依赖变化。

| 实际命令                                                                                                               | 退出/结果与范围                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `npm --prefix web ci --offline --no-audit --no-fund`；`npm --prefix web run check`                                     | 均0，71包，四包TS/生成/分层/负探针，锁不变                                                                                         |
| `cmake -S core -B core/build-b-review -G "Unix Makefiles" ...`；`cmake --build core/build-b-review --target hier -j 4` | 均0；RelWithDebInfo，M3/FUTURE ON、observer/sanitize/experiments OFF；80.88秒fresh新编，warning0；六份第三方只读源码版本/clean已核 |
| 原renderer `run.mjs`、C82 `run.mjs`、C83 `run.mjs`                                                                     | 全0；99/99、25/25、12/12，各0skip                                                                                                  |
| 原`verify-types.mjs`                                                                                                   | 0；公共正例0诊断、16逐项真实负例，未用proposal alias                                                                               |
| 原`browser-gate.mjs`                                                                                                   | 0；browser bundle/无Node realm模块加载与工厂形状，不在该realm调用工厂，不是真实Electron                                            |
| `npm --prefix web run test:independent`；`...:m4`                                                                      | 均0；标准810+281+5+99+25+12=1232/1232与268/268，零skip；含真实SDK→Node→自有Core，重叠不再加总                                      |
| `pip freeze --all`（B隔离Python）；指定该`HIER_SCHEMA_PYTHON`后`npm --prefix web run test:schema`                      | 均0；既有锁定jsonschema4.25.1等，无重装；655/655与27参数归一化，零缺失方法                                                         |
| BER设施`node --test .../ber/facility.test.mjs`；两套--list                                                             | 0，3设施、40/6输入唯一/依据枚举，非产品语义                                                                                        |
| 固定后`node .../ber/run.mjs`；`node .../ber/claim-run.mjs`                                                             | 均0，40/40与6/6，各0skip                                                                                                           |
| 指定旧1087根，同一40/6入口                                                                                             | 分别1/0；40实际36过4败、6实际6过，0skip，冻结源不改                                                                                |
| 原设施/Schema KAT/C82历史核档                                                                                          | 全0；7设施、2正2负，旧32捕获/17pin和原红保持；核档不是新产品通过                                                                   |
| 新provenance初/终、资源/环境配置检查                                                                                   | 均0；固定源保护、第三方与编译配置核验，无本树Core进程遗留                                                                          |

Core二进制9324536字节，SHA256 c22abe2f63a4d19352677a9acc1d28df5e15a8d8ecb476586da85d79cbb46708。
本轮Core/protocol/schema完整树与782c599相同；仅为真实回归fresh新编优化hier，不重复Core CTest/Debug/ASan三配置或完整check.sh，
不把A三配置/C的有界探针记作B新执行。原1232包含属性/选择/树的风险回归，不重开其既有验收结论。

## 来源、证据与交接

521份原B跟踪文件、153份原B输入、27份既有renderer交付保持；原17pin加新BER6源pin，共23。
产品766/共享非日志765跟踪文件匹配固定SHA，18未跟踪文件初终hash相同、领取前日志前缀保留。
来源只hash字节核出处，不读取A实现形成oracle。旧provenance/历史核档只在原固定上下文使用，未改为移动HEAD取绿。
本轮只新增B测试/计划/报告/机器档/核验工具及追加共享日志；不改生产/API/ABI/IPC/Schema/工程格式/依赖锁；旧格式迁移不适用。
机器档`docs/m5_b_renderer_f936a33_recheck.json`和`ber/verify-evidence.mjs`核30条命名完整捕获、23pin、枚举与历史/当前红绿分类；
其本身0产品执行。完整统计/hash及报告提交SHA在REVIEW_LOG最终交接。
机器档162103字节，SHA256 `164faccf319ceb7c87e83d307381cbd7f54d08382ff1dda9672f51c148c17ae9`；
286219原输出字节/53946 gzip字节。实际归档核验30捕获/23pin通过；最终Prettier和diff空白检查均0。

BER-Q01～03已在C认可的固定DESIGN承诺边界内清晰、独立补冻并通过，本B关闭所提三项窄歧义；
坏桥外部资源及未承诺同步返回形态不是额外产品保证，也不另立新阻塞。C-82/C-83由C本轮正式关闭，B只引用该决定。
交A原样导入两冻结并接入新增40/6门禁、保留旧历史红；纯导入/状态收尾不应冒称新实现或无谓重跑同一全量门禁。
交C核新冻结/证据与范围，不要求重开已关闭两意见或整段契约审批。
本轮未做Source独立冻结、真实main/preload/contextBridge/来源权限/窗口导航崩溃/进程回收/Electron→Core E2E、L06/L09–11、生产UI/AX、M7、Linux/远端CI。
这些仍需后续各自交付，不以本次renderer局部通过宣告整个Electron/M5完成。
本token交接后结束；不新会话/定时器、不恢复已停B监控、不向A/C/D会话发消息、不执行旧ack。共享日志仅追加不提交。
