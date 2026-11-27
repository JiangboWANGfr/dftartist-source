# B-ORCH-6-SOURCE-RECHECK-01：Source独立通过，S01/S02阶段维护与BD关闭

固定产品 **e4ba060767a3a53d19198b0214ca1f7d1690cc49**（运行时faab4eb）。
**原Source306/14/34及属性281/5/22独立通过；经C审的SDK身份增量26/7通过；BD-SOURCE-01精确补冻4项通过，现由提出方B关闭。**
旧标准入口先实际810/808过2败及M4 268/266过2败；保留失败，不回写历史。
只应用B受审阶段测试补丁后，完整标准命令实际**1598/1598**、M4 **268/268**，0skip。
这不是未维护的原e4ba060测试树全绿，也不等于完整check.sh/整个M5/Electron/UI通过。

## 固定来源、oracle与测试维护

B分支test/m5-tree，起点4dafc5555e9e6b73bb1b31b3ad23a0f7c6e01133。
DESIGN SHA256 **cc4c0b0c86729718933c206ae0758e4917bbe50f6267aad50ee32e4d673c86a7**。
原Source冻结6838e4cec4a1f6b08624f2f8bb8d2a742a4ce99d的15文件/306/14/34枚举逐字保持；
原B自写SV/手算坐标/历史能力红保持。不读A实现/diff/新增自测或Source见证生成oracle；
共享实现/执行摘要已读，非严格盲验，不将A/C执行记B。既有B内部只读辅助非独立C，未跑产品。

- 身份输入初冻 **053b5add7acf50335ddc25d4167e623d812df142**：26运行/7类型，先冻结后执行。
  来源当时公开§5.6.5草案，初冻明确不冒充C通过；随后C-ORCH-6增量条目明确批准同一API，无需改预期。
- 受审阶段维护与BD补冻 **aad11d6c5a2b1540d47465b50ee430ba9c846013**：先固定，再执行精确时序和维护后标准门禁。
  [身份输入](../web/tests/independent-client-identity/README.md)、[历史保留说明](../web/tests/independent-transport-sharing/history/README.md)、
  [BD四项](../web/tests/independent-source-document/recheck/timing.mjs)。
- C的公开增量决定3081字节/SHA256 `b428cadb276133e60a82b7e7e48c74d10aa9a6fa9d6be2a186be0f1955f5d0c7`
  作为审批依据捕获；C源码检查/9控制及最终Source通过只引用归属，不当B oracle或B执行。

S01只允许main原三项+**唯一新增isHierError**，node仍唯一createProcessTransport；
通过真正公共imports，常量2及函数形状继续约束。独立10项正负设施核缺任何旧项/新增项、任意额外main/node出口、
错版本/非函数都仍被拒绝。不是放宽成任意新增出口。
S02仅把main的纯重构381字节/hash换为真实公共旧/新语义消费者：旧constructor/instanceof/外部子类static is、
新unknown类型谓词/readonly错误字段/7负例；不alias、不采用新产物hash作oracle。
node/index.d.ts原**587字节/SHA256 810c9425e1cfdfb11fd31174d3f7feb647238aba61ec534318bd1746b8a163ae**保持。
S03–S09尾部代码/预期逐字保持；旧完整compatibility5741字节/hash
`de57f4502df31cbd4b37aeab587f20f9041c90c89889be4f524a8d22b44524e5`及realm-controls5296字节/hash
`d7956fdc8719aac9eddd159bf37223a6a54338259cb08438534eda34698e22b5`逐字保存在history/pre-identity。
历史归档、旧冻结commit和原门禁红均未删除、改写、skip/xfail。

身份26核真实实例/子类/冻结/字段与cause零读取、旧形状、普通非错误值、真实SDK错误身份。
四类opaque/包装/撤销Proxy/伪造原型仅核boolean/零probe/不抛，不把“不承诺互认”改成跨副本保证或指定识别结果。
BD四项按获审窄选择，source/readSource两阶段×cancel/clear，两个加载等待方和own动作均由通知内dispose接管，
旧加载disposed保留Source cancelled cause、后续listener停止、idle且SDK可继续查询；**不再悬置BD-SOURCE-01**。
原306中两项历史允许分支不改，新精确集合另冻，不从实现反推或覆盖历史结论。

## B实际环境、命令与结果

P=/tmp/hier-b-orch6-source.v992hyw6/source（自有fresh detachede4ba060），T为B测试树。
Node24.21.0/macOS arm64，PATH前置全局Node24。产品命令cwd=P；B独立入口cwd=T，明确HIER_B_PRODUCT_ROOT=P。
所有真实Core用P/core/build-b-review/hier；六份第三方只复用核准确SHA/clean的源码，无A/C产品对象/二进制借用。
优化hier **80.43秒fresh编译**，9324536字节、SHA256
`5127abc22889b163b27eeff3c4aa8317587058a9b8f1bcb5ddfdda9ab3b51aea`，实际build warning=0。
RelWithDebInfo/M3/FUTURE ON，observer/sanitize/experiments OFF。

| 实际命令                                                                                                                     | 退出/实际结果/界限                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `git worktree add --detach P e4ba060...`；`npm --prefix web ci --offline --no-audit --no-fund`；`npm --prefix web run check` | 均0；71包、195定义/27方法、四包TS、41模块123依赖及7分层负探针                                                             |
| 六源码Git版本/clean检查；`cmake -S core -B core/build-b-review ...`；`cmake --build ... --target hier -j 4`                  | 配置/最终构建0，自有全新对象；初次构建早于配置结束而1“could not load cache”保留，是B调度错误，不当产品红                  |
| 原`run.mjs`、`--core`、生产`verify-types.mjs`                                                                                | 全0，Source **306/14/34**；真实Core源范围/字节/坐标/编辑恢复/删除/非法UTF8/新快照/进程退出实际执行，不再是能力红          |
| 原属性`run.mjs`、`core-runtime.mjs`、生产类型                                                                                | 全0，**281/5/22**；为真实共用生命周期回归，不重开原属性验收                                                               |
| 原始`npm --prefix web run test:independent` / `...:m4`                                                                       | **1/1**；**810执行808过2败 /268执行266过2败**，0skip；仅S01/S02，完整入口后续&&组未到达                                   |
| `npm --prefix web run test:independent:m5` / `...:core` / `...:tree` / `...:tree:core`                                       | 另跑均0；241/6/287/8，选择33、树35+14类型负例；与完整集合包含，不相加                                                     |
| `npm --prefix web run test:independent:m5:electron-renderer`                                                                 | 另跑0，182/16类型及browser gate，0skip；不是Electron                                                                      |
| B锁定Python`pip freeze --all`；指定HIER_SCHEMA_PYTHON后`npm --prefix web run test:schema`                                    | 全0；jsonschema4.25.1等，**655/655+27**参数归一化，缺方法0，无重装/锁改动                                                 |
| 新身份`run.mjs`/`verify-types.mjs`对固定产品                                                                                 | 均0，**26/7**；真正公共入口/类型，非提案fallback                                                                          |
| 同一新身份集合对B旧ccbef3f自有TS树                                                                                           | **1/1**；helper缺出口planned26/executed0/skip0，类型正例缺出口、negative0执行；不虚构26个语义失败                         |
| 新`identity-epoch.facility.test.mjs`                                                                                         | 0，10正负设施，不是产品语义                                                                                               |
| 新`timing.mjs`                                                                                                               | 0，**4/4**精确BD输入，无私有新hook、sleep或timing SLA                                                                     |
| 历史原10输入对B旧ccbef3f；维护后原10入口对当前产品                                                                           | 均0，10/10；前者是明确旧版本控制，不计当前产品新通过数                                                                    |
| B维护测试overlay后，实际同一标准`npm --prefix web run test:independent` / `...:m4`                                           | **0/0，完整1598/1598 /268/268**，0skip；解析810 TAP及9组JSON：281+5+99+25+12+40+6+306+14，未把bundle/类型元数据混作运行组 |
| 三套Source--list、来源/provenance/历史Source核档/资源检查                                                                    | 全0；306/14/34原样、Source历史33捕获/25pin/4fixture能力红保持；核档0当前模型执行；本树Core残留0                           |
| 新证据核档、Prettier新/修改文件、`git diff --check` / `--cached --check`                                                     | 全0；53捕获/41pin及红绿/阶段/overlay核验；类型运行器另有一次纯格式检查红，换行修正不改预期/输入/行为，原红保留            |

维护后不是纯净原测试树：仅将aad11d6中的7个B测试文件显式覆盖/补入P，
P仅compatibility一个原跟踪文件变化，另新identity-epoch和identity目录；**所有生产源码/配置/锁固定不变**。
41来源pin和7overlay摘要精确归档。主共享树未套用测试补丁，等待A原样导入。
1598是该完整标准命令实际执行，不是补跑拼接的总数；其它重叠子集不累加。
新增26与BD4仍为独立专项，**未接标准且不计入1598**，类型/设施/旧版本重跑不增加运行总数。

## 证据、保护、风险与交接

[机器档](m5_b_source_e4ba060_recheck.json)保存53条完整命名argv/cwd/UTC/退出/时长/压缩输出、41来源pin、
审批摘录、初终保护、实际Core/overlay/资源；原两次标准红、两次旧helper能力红及两次B调度/格式红均保留。
[核档器](../web/tests/independent-source-document/recheck/verify-evidence.mjs)逐块解压/hash，检查完整1598组成与阶段，
不重新执行产品语义。生成后格式/核档/提交/交接保护另实际执行，不递归把档案写进自己。
原B551文件只有1个获审维护目标改变，其余550原样，旧目标全文另存；177原独立输入中176原样，
原Source15及A原样导入19文件/历史档不改；产品807、共享非日志806及18原未跟踪逐字保护（产品测试overlay一项明确豁免）。
原日志1587724字节/SHA256 `241c0ad00e5c76ad6a1fb78bacec82785b7b3700408d0e531f94fbe0abf807e2`前缀保持。

本B只修改测试/计划/证据；待测产品含A的新增L6 Source、M5内部共用提取和受审L5命名函数。
Core/protocol树与ccbef3f相同；没有B生产/API/ABI/IPC/Schema/配置/依赖锁/工程格式变更。
没有重跑完整check.sh、Core CTest全套/Debug/ASan三配置或A新增自测，不把A/C历史运行记B。
没有真实Electron/main/preload/contextBridge/窗口权限导航崩溃/Core IPC E2E、SourceView/反向候选/Selection协调、
生产React UI/AX、L06/L09–11、M7、Linux/远端CI或通用无泄漏/大文件SLA结论。当前无持久化，旧工程迁移不适用。
browser gate仅bundle/无Node realm模块加载和工厂形状，不是在该realm调用工厂；坏Bridge的4次fixtureFaultDetach仍非产品release/远端回收。

**交A：** 原样导入053b5ad、aad11d6与本报告提交，保留旧源/红；不必撤销已受审身份API或修改Source产品取绿。
后续把新26/4独立入口接标准再报新的实际集合；当前1598不能称已含这30。纯导入/接线按实际变化验证，不重复无变更原生/属性验收链。
**交C：** 已读你Source通过/增量决定；B按规定维护S01/S02并实际标准1598/268通过，BD由B正式关闭。
可聚焦该测试适配/历史保留/计数与证据，无新整段契约审批请求，不代你关闭其它意见。
**交D/协调器：** Source数据单元本B独立通过、原门禁阻塞有固定B修订和实跑；D-03仍限M6，
main/preload/L06/L09–11/UI及SourceView仍需各自前置，不宣告整个M5/Electron放行。
本token交接后结束，不新会话/定时器、不恢复旧监控、不向A/C/D会话发消息或执行旧ack；共享日志只追加不提交。
