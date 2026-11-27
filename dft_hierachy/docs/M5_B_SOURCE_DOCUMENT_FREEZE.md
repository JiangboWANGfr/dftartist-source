# B-ORCH-5-GATE-SOURCE-FREEZE-01：renderer 接线局部通过 / Source 独立冻结

固定产品 **ccbef3f78c16c84463850255c65e5889a42bb321**，独立 B 测试分支 test/m5-tree。
**Source 冻结 6838e4cec4a1f6b08624f2f8bb8d2a742a4ce99d**，先冻结后运行修前产品入口。
DESIGN SHA256：09023b2c435211890f9c2c120487da8dba706da1894142c08df50407e33d7497。

本轮 renderer 标准 182/182、16 类型负例及 browser gate 实际通过，0 skip；
没有新产品运行时，未为报告导入重跑完整1278/Core/Schema。
Source 新计划306受控输入、14真实链输入、34类型负例：修前缺生产公开出口，
两 runtime 入口非零、实际语义执行均0、skip0；生产类型正例失败、负例执行0。
这不是320项语义失败或通过，也不是Source实现完成。隔离声明正例/34负例及6设施通过另列。

## 独立依据、现有覆盖与验收

已读 AGENTS、最新 A/B/C/D 交接、DESIGN§6.10及继承§6.9.3/4、§6.6.6、Core§5.5.6、
公开 Schema/声明和相关计划。未读 A 实现/diff/Source witness/fixture/新增自测；
已读共享交接摘要，不是严格盲测。原 Tree/Selection/Properties 测试提供前序回归和
设施参考，不能代新 SourceModel 覆盖；A 的隔离类型/SDK 见证亦不计独立验收。

验收矩阵与逐条输入/预期/依据见 [独立测试说明](../web/tests/independent-source-document/README.md)
及三套 `--list`，完整枚举在机器档的命名捕获内。
306包括坐标73、版本8、输入32、所有权13、查询12、任务27、dispose11、通知30、
诊断96和明确公共方法故障注入4；另14个真实模型/SDK/Node/Core场景。
源码坐标为B手算字面表，真实Core预期取自B自写HDL的唯一字面范围，均不从实际输出生成。

关键判据包括：原始字符串且ref先于kind校验，不猜ref编码；pending通知后source再read，
仅用FileRef与同一任务signal；原SDK Reply/completeness/扩展身份，冻结自有原子状态；
UTF-8字节→UTF-16单位，BOM/emoji/组合字/CRLF不改写；changed保留当前原文但省略range，
不验证旧范围能否落入新文本；双模型/直接SDK取消互不误伤；旧第一阶段不能启动第二阶段；
通知/诊断读中dispose优先、精确dataIssue、原错与聚合cause、所有未结命令恰好一次。
四个unexpected错误场景显式装饰真实SDK的公共方法Promise，不冒称普通SDK/Core路径。

独立物理字节fixture：leaf107字节，SHA256
`2b19339021a552f70120b78cd116a76837dac9289f137c0de9c37d4d1b1dea5d`；
top177字节，SHA256 `fa2403fcb76f087d3e9eb646cd00a3d16b0c799608056853d5b8888d68e9fac9`。
原始BOM/CRLF/Unicode字节及两份坐标文本的长度/hash/base64归档，不借A输入。

## B 实际命令和结果

P=/tmp/hier-b-orch5-source.zpfhuv1o/source，T为本B测试树；Node24.21.0/macOS arm64。
产品命令cwd=P，独立输入cwd=T，显式HIER_B_PRODUCT_ROOT=P；PATH前置全局Node24。
产品依赖/TS输出独立安装/构建，不使用A/C二进制或对象。本轮未启动Core，不提供HIER_BIN。

| 实际命令                                                                                       | 退出/实际结果/界限                                                                                                                 |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `git worktree add --detach P ccbef3f...`；`npm --prefix web ci --offline --no-audit --no-fund` | 均0；新独立固定目录，71包；锁不变                                                                                                  |
| `npm --prefix web run check`                                                                   | 0；生成195定义/27方法、四包TS、36模块98依赖/7分层负探针                                                                            |
| `npm --prefix web run test:independent:m5:electron-renderer`                                   | 0；解析全部五组99/25/12/40/6=182，全过0skip；16真实类型负例及browser gate另过                                                      |
| `node --test .../gate-closeout.test.mjs`                                                       | 修前设施1、修正后0；最终4/4：7入口顺序、BER40/claim6 exit23传播及BER40真实子进程SIGTERM→1；不算renderer语义                        |
| `node --test .../facility.test.mjs`                                                            | 首轮1=3过3败；规范修正夹具后0=6/6，末次Reviewed仍6/6；手算坐标、Schema正反例、真实SDK/错误身份/设施释放，不算Source模型语义        |
| `node .../verify-types.mjs --proposal`                                                         | 首轮1（B别名循环），修正后0；最后正例0诊断/34逐条真实语义拒绝，非生产类型通过                                                      |
| 两套`run.mjs --list`和`verify-types.mjs --list`                                                | 均0；306/14/34，逐项输入/预期/依据，无skip占位                                                                                     |
| `git commit -m "test: freeze independent SourceDocumentModel contract inputs"`                 | 0；6838e4c，16新增文件；无旧B源或产品修改                                                                                          |
| `node .../run.mjs`                                                                             | **1**；planned306/executed0/skip0，public-export-capability，SourceDocumentModel未导出                                             |
| `node .../run.mjs --core`                                                                      | **1**；planned14/executed0/skip0，同一公开出口缺失；在Core能力检查/进程创建前停止，不伪造14次Core语义失败                          |
| `node .../verify-types.mjs`                                                                    | **1**；正例有10个Source命名导出缺失及级联诊断，negative计划34/执行0，未alias到提案取绿                                             |
| `node .../ber/verify-evidence.mjs`                                                             | 0；历史B30捕获/23pin及旧36绿4红保持；核档本身0当前产品语义执行，不计历史1232为本轮                                                 |
| `node .../provenance.mjs`、冻结源pin/环境资源检查                                              | 全0；原532份B文件、161独立输入、11导入、产品779/共享非日志778、18未跟踪保持；Source15冻结文件未变；自有Core进程0、未建Core输出目录 |
| Prettier新源/计划/报告/档案、`git diff --check`及`--cached --check`                            | 全0；不重排历史文件；报告核档不新增模型语义执行                                                                                    |

前三次红属于B设施：SnapshotInfo.openedAt遗漏权威Schema要求的毫秒；提案消费者把整个
@hier/viewmodel alias到Source声明，引起其TreeDiagnosticIssue循环；macOS临时路径/private
别名导致字符串cwd比较错误。分别改合法时间戳、显式专用proposal消费者别名和realpath比较。
保留原失败捕获，不当产品红转绿；修正均在Source冻结前，没看产品Source实现改预期。
静态QA另发现MAX_SAFE_INTEGER默认column溢出、共享前置等待和Core watchdog清理边界，
均在冻结前修正，并用权威Schema校验坐标语义负例仍是合法wire输入；不放宽模型预期。

## 规范窄边界与限制

**BD-SOURCE-01：** 继承规则只接管尚未结算命令，未唯一规定旧load相对cancel/clear自身
通知的结算先后。两个输入只核own命令disposed、旧load一次cancelled或disposed及相应
cause、模型idle，无权选一种时间顺序为唯一正确答案。请A/C单独澄清，不阻塞其它已明确Source场景。
Core UTF-8不能产生JS孤立代理项；没有根据任一实现猜其归一化策略。
单次扫描/无逐字节索引由实现审查核验，非黑盒耗时证明；无M7资源SLA。

browser gate只bundle/无Node realm模块加载及工厂形状，未在该realm调用工厂，不是真Electron。
BER坏Bridge的fixtureFaultDetach=4仍仅为设施补偿，不计产品release或远端资源回收保证。
本轮无Source模型语义、Core新编/CTest/Debug/ASan、完整1278/268/Schema655/属性复验、
真实main/preload/contextBridge/窗口权限导航崩溃/Core IPC/E2E、生产React UI/AX、SourceView、
反向候选/Selection、L06/L09–11、M7、Linux或远端CI结论。当前无会话持久化，旧工程迁移不适用。
没有生产/API/ABI/IPC/Schema/配置/依赖锁/工程格式变更；若A提取共用任务/诊断，须跑原冻结回归。

## 证据、保护与交接

[机器档](m5_b_source_document_freeze.json)含33条完整命名argv/cwd/UTC/退出/时长/压缩输出、
25份来源pin、4份fixture原始字节；冻结前设施红、冻结commit及修前能力红均保留。
[核档工具](../web/tests/independent-source-document/verify-evidence.mjs)逐块解压/长度/hash，
解析renderer全部五组、验证冻结早于能力红、枚举原样、原B/脏项保持；它执行0产品语义。
工具生成后本地核档/格式/提交检查另行实际执行，不递归把档案自己写入自己。
领取前日志1555831字节、SHA256 `9b14803735590693360e39bb3e584b53f125fcc9faef02d00585ebd7d522318b`
保持；共享日志仅追加未提交，原M3-coordination/research保持；并发C追加未改写。
既有B内部只读QA不替代C，未运行产品、未创建新会话。

**交A：** 原样导入Source冻结与本证据；依已获C审的§6.10和本冻结实施对应数据单元。
新缺出口红是预期修前状态，不是要求把用例改成skip；将来提供固定Source SHA后B执行306+14/34。
无需因报告导入重跑renderer原生/属性全集；共享机制真正重构时按风险跑原冻结。
**交C：** 本轮renderer接线独立通过，已读你cycle5通过结论，不重开已关闭意见；
请核新Source oracle/设施边界与BD-SOURCE-01，不以A见证或本次类型控制代替运行时验收。
**交D/协调器：** D阶段响应关闭/D-03仍限M6；Source冻结及能力红完成，Source运行时待A交付，
main/preload/L06/L09–11/UI仍保留各自前置；不宣告M5整体完成。
本token交接后结束；不新会话/定时器、不恢复已停B LaunchAgent、不向A/C/D发消息、不执行旧ack。
