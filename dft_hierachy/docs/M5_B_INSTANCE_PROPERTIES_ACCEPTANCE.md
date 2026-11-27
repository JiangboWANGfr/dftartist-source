# §6.9 实例属性：B独立验收映射

权威是受审DESIGN §6.9/§6.6.6，不是本映射或实现输出。每个可执行输入的ID、input、expected、basis由
`web/tests/independent-properties/run.mjs --list`及`core-runtime.mjs --list`完整枚举。
本表解释各需求的观察边界；库存数不是测试执行数、实现放行或覆盖率。

| 验收条件                              | 冻结分区/主要ID                                      | 输入、预期及依据                                                                                                                    |
| ------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 构造不启动工作，固定快照；ready前原错 | IP-C01–03                                            | 真SDKready前/后/关闭后，零查询/额外订阅，idle/null或原SDK错误；6.9.1                                                                |
| 输入验证原子、无强转                  | IP-I-*                                               | 12种非法原语/容器/poison及三种opaque字符串；非法不取消合法任务，非空是否实例由Core判断；6.9.1                                       |
| 三查询顺序与一次完整提交              | IP-D-order-ports/params                              | get先行，同signal的ports→params不互await；两到达顺序均保持同pending对象到三成功；6.9.2                                              |
| 领域事实唯一来源                      | IP-D-empty/width-zero、IP-D-order-*                  | 空值合法、0/缺失width、interface/multi、同名ref、参数文本/标志/扩展字段/顺序/原Reply及冻结；6.9.2                                   |
| 不一致与partial错误                   | IP-D-inconsistent/partial-*                          | 错ref不发后两查询；三个端点非法partial由真SDK拒绝，不能投影success；6.9.2                                                           |
| join/no-op/重试                       | IP-T-join/success-noop/retry-*                       | 每等待方一次，join不增SDK调用，不要求Promise相等；failed/cancelled须重试；6.9.3                                                     |
| reload与最终目标                      | IP-T-replace-_/reload-_/reload-cache                 | get/后两阶段替换旧任务；旧响应不覆盖；重载三SDK调用不强制三wire；6.9.3                                                              |
| 任一查询阶段取消/清空/释放            | IP-L-_，含one-pending-_                              | get、两待办、仅一secondary未完成；正确终态、旧任务不留部分data；6.9.3/4                                                             |
| 非pending/no-target动作               | IP-L-noop-*                                          | idle/success/failed/cancelled × 三动作，no-op保持对象/通知；clear/reload按目标行动；6.9.3                                           |
| 共享SDK订阅所有权                     | IP-O-shared-*/two-models，IP-N-other-model           | 独立SDK消费者/另一模型仍成功，无共享cancel/SDK关闭，保护不全局化；6.9.3/4                                                           |
| 原错误与首错胜出                      | IP-E-sdk-_/first-_/same-turn-*                       | Core/取消分类、原HierError及自有诊断，两个响应先后/同turn的首处理错误不被晚错替换；6.9.4                                            |
| 观察者顺序与任意抛值                  | IP-N-subscriptions/throw-*/order-cause               | 不回放，重复独立，订退阅边界；七raw与两通知阶段，所有加入者聚合原值/cause，提交不撤销；6.9.4                                        |
| action通知错误归属                    | IP-N-own-cancel/clear                                | pending观察者错误留旧load；取消/清空自身通知错误只交自身Promise；6.9.3/4                                                            |
| 重入/no-op与忽略listener返回值        | IP-N-reentrant-_/not-await，IP-R-reentrant-_         | 通知/诊断中四异步命令先重入拒绝、不探参数；owned未结算listener Promise不能阻塞模型；6.9.4                                           |
| dispose最高优先级                     | IP-L-dispose-_、IP-L-after-dispose-_、IP-R-dispose-* | 诊断/通知中仍保留可释放任务；停止后续读取/listener、清空idle、全部加入者disposed，原error/聚合cause保留；6.9.4                      |
| 不可读诊断                            | IP-R-fail-_/falsy-_                                  | data/字段/嵌套特殊键/枚举/描述符/length/index/revoked各阶段，首次停止、准确issue、冻结空data、原错不变、未知抛值零探测；6.6.6/6.9.4 |
| 可读诊断所有权                        | IP-R-normal-*                                        | 访问器一次、共享/循环、稀疏数组、函数字段/别名、有限深度、原dataIssue普通字段；不执行hook/冻结调用方；6.6.6                         |
| 诊断期间订退阅与跨模型                | IP-R-subscribe-ownership                             | 新注册参加随后失败通知，已退订不调用；其他模型no-op不受本模型guard影响；6.9.4                                                       |
| L6后台拒绝                            | IP-P-unhandled-*                                     | plain Node四子进程无全局拒绝listener，丢弃原loadPromise仍自然退出0；不冒称L7原Promise消费；6.9.4                                    |
| 严格公开类型                          | types.ts IP-T01–22                                   | 自写合法消费者及22真实负诊断；原ResultOf/Reply、readonly联合、错误词汇、exact optional；6.9.5                                       |
| 独立真实链                            | IP-CORE-*五项，core-controls三项                     | B新SV固定W2/6、localparam/type与空实例；真实SDK/Node/Core、错误重试、SDK存活、两模型、重开快照；6.9.5                               |

2026-10-16受审窄补充：C通过§6.9.4 disposed subscribe优先级后，B独立新增29项IP-S输入。
12种active非法listener同步invalid_argument；同12种与两个合法function/callable proxy在disposed时同步disposed，
先于合法性检查且不探测参数；通知/诊断中dispose后的同步subscribe仍disposed，旧unsubscribe幂等且借用SDK存活。
仅以公开行为核零回调/无模型查询/状态保持，不检查私有listener集合；不额外规定active非法参数的raw读取次数。
原252项ID/input/expected/basis保持，合计281项；Core5与类型22保持。IP-C01改为构造前后同一SDK订阅保持，
独立修订235d19d以修改前无Model SDK反例为依据，原失败/初红归档保持。

## 原有覆盖与范围排除

原Tree/Selection/M4测试覆盖其已验收行为，但不证明新InstancePropertiesModel的状态机、诊断消费者或Core链。
A的公共声明仅供独立B消费者编译；不读其消费者/SDK见证来生成上表期望。
新增运行时能力缺失时，所有下游语义计未执行而非skip/逐条失败，不使用假实现补绿。
原454文件及C-81设施保持。C-81另修，不阻塞此冻结；原Tree诊断回归在将来共享抽取时仍需保持。
无保存/恢复/旧迁移/计划编辑undo-redo，不把SDK公开Transport叫Electron IPC；没有PropertiesPanel/UI/M7结论。

## 不自行猜测的精度边界

1. 参数value的具体展示拼写未由§6.9统一为十进制或SV原字面量。本模型必须保留Core返回原文本；
   fixture用明确文本证明无number转换，独立Core用width/flags做KAT，不从A输出补写text格式oracle。
2. ObjectRef不含snapshot来源；不要求识别另快照相同裸字符串。重开只核新snapshot/model与旧冻结值。
3. 初始c3103c6曾将disposed subscribe优先级单列；C于2026-10-16批准DESIGN窄补文，
   已按上文IP-S单独补冻。既有252/5/22预期和历史初红不改写，不用Tree实现猜答案。
