# Agent B：M5树契约独立冻结、修改前基线与选择接线复验

## 结论

固定契约 **6b03e1dc7a33ff965992ef5d01a72b540d930675** 的独立树集合已冻结：
**8e4e21a → 67fcb38（纯格式）→ 297c3fc（公开接口装配适配）**。
C-M5-TREE-REVIEW-02已认可该固定契约并关闭C-71/C-72；B-16由B本人确认关闭。
**对应Tree实现前置已满足，可进入实现；没有Tree运行时验收结论，不是完整M5/GUI通过。**

- 新树单元152项、真实Tree/Core消费者7项，共159项，当前均缺TreeModel生产导出而红。
- 新SDK控制11/11、新真实Core源码KAT1/1通过；新集合联合171项为12绿/159红。
- 新提案类型消费者0诊断，35/35逐点真实负例通过；生产类型消费者14项TS2305缺导出及级联，exit2。
- 原505全集、选择241/原33类型负例、六项新标准入口、SDK真实3项、SDK单测27项、优化CTest75/75通过。
- 所有测试批0skip/todo/cancelled；159红尚未进入树语义，不当作159个已执行到的算法反例。

## 固定对象与独立性

| 项目                | 固定值                                                                             |
| ------------------- | ---------------------------------------------------------------------------------- |
| 初次读取的提案      | 0eca916fd03a0e5e5b5fc2db4e818c148e990843                                           |
| 最终契约/缺实现基线 | 6b03e1dc7a33ff965992ef5d01a72b540d930675                                           |
| DESIGN              | cc9a5bd0a080ee1ad8071e6661523fd7afd47e5fd911ac5f78d9f5106c7432f0                   |
| 树公开提案声明      | da8ffe64b5ad886c9e958851428002a1aaa4136c4b11710c598501274676c5aa                   |
| 权威Schema          | 30a9ca285b813202b5a9867485a6d301cbd450b31098c582542c3a11c89a1420                   |
| SessionContract     | 0295e91ce7b1aac4d8b2a7a9011686f431a787e27747a45309ae6cb636901af6                   |
| 原选择接线          | 515903f226a1ff23dac95d089e830275fe3234f1，包含在本固定基线                         |
| B自有测试树/起点    | dft_hierachy-test-m5-tree，test/m5-tree；981fae9e7606814c7e590c1be3095d92f976c2e7  |
| B自有产品目录       | /tmp/hier-b-m5-tree.j3Udnt/source                                                  |
| 工具                | Node24.21.0、TS5.9.3、Prettier3.9.10；macOS arm64；B Python3.13.3/jsonschema4.25.1 |

先完整读取本轮规则、相关DESIGN、用户决定及最新交接，核mtime/status保护共享dirty。
共享日志含A/C摘要，故不宣称严格盲验；没有读A运行时源/diff、树消费者或自测机器输出定义expected。
公开声明/Schema、原始验收需求和B自写fixture是oracle来源；公共构建配置只用于装配。
新代码在首次freeze前收到规范修订，才把契约由0eca换为6b；这不是看实现或取绿改预期。
生产没有TreeModel，测试没有制造临时Tree、替换SDK或生产私有hook。

## 验收条件、输入与覆盖

[冻结计划](plans/B-M5-tree.md)列明步骤、范围和风险；
[树单元](../web/tests/independent-tree/tree-contract.test.mjs)每项具名输入/手写预期/拒绝后检查。
以下152项来自实际TAP具名分组，不与SDK/类型或重复批次混加：

| 组   | 项数 | 输入与正确行为                                                                                                                                                     |
| ---- | ---: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T01  |   37 | 初值/ready/未ready、合法/非法options和PageLimit、继承getter/抛值/未知扩展：单次顺序捕获、精确cause、无查询/通知，默认200和分组true，不保留/冻结原options           |
| T02  |   10 | 空/多roots、leaf、嵌套scope、单段点/斜线/反斜杠、数组/Unicode：按原path段投影、首次出现分组、有序完整父子关系；稳定RowId、深冻结、隐藏/重显不发查询                |
| T03  |    5 | 同列表并发、重复true/loadMore、独立分支、同scope跨页、无next：共享结算不重复追加、并行逆序回复、loadedCount只计直接实例、status归分页owner                         |
| T04  |   41 | 非法参数/强转陷阱、外模型/不可见/未知/状态/作用域行、折叠重开/reload/cancel：Promise原子拒绝、最后意图、保留已提交页和身份、晚回包隔离、共享SDK不被关闭/误取消     |
| T05  |   10 | roots/续页Core错误、错误父子path、重复ref/cursor/循环及终页数量不符、EOF：保留原HierError/诊断，坏页不提交/保留前缀和cursor，明确重试，不毒化独立SDK               |
| T06  |    6 | 第二页/真实owner/roots/opaque DefRef/缺目标/重复祖先：object→ancestors→逐级分页，保留原ref、不猜occurrence，不用祖先伪造兄弟、不展开目标本身                       |
| T07  |    5 | 两次reveal（含同ref）、合法no-op/非法参数、已结算未continuation、手工页：新意图取消旧定位、错误参数不取消、手工页独立、旧回复不发布成功                            |
| T08  |   25 | 订阅身份/登记顺序/退订/新登记、观察者异常/查询cause、重入/释放/重开：状态先提交，AggregateError不回滚、disposed优先、旧冻结值/SDK仍有效、listener Promise不被await |
| C72  |    4 | reveal独占/原有手工owner页 × 有/无额外SDK消费者：折scope后分别cancelled/pending；晚回复仅手工页可提交，scope保持折叠，wire cancel仅最后订阅离开时发送              |
| B16  |    8 | 四方法非法partial（数组空/非空，object合法对象配两种reason）：SDK protocol_error并关闭，树任务失败投影/前缀保留，不制造partial成功或incomplete                     |
| C71  |    1 | 仅success listener抛E：命令AggregateError保存E，成功页/行无error、不回滚、无另造全局诊断槽                                                                         |
| 合计 |  152 | 当前全部在能力检查处缺TreeModel；上面的语义是冻结要求，不是已经执行成功                                                                                            |

[公开控制框架](../web/tests/independent-tree/harness.mjs)使用真正HierClient和手写Transport回复。
仅传已验证结构的公开帧，按实际发送请求的id对应回复/取消；不覆写client方法、解析对象地址、操控私有字段。
测试只持有自己的Transport记录；cacheEntries=0是公开SDK参数，避免把SDK缓存当成树行为。
20秒是harness失败上限，不是Core取消SLA；异步次序由明确请求/回复或应用Promise控制，不用sleep竞速。

[SDK对照](../web/tests/independent-tree/sdk-boundary.test.mjs)11项独立执行：
四方法合法complete/非法partial共8项、合并订阅独立取消、opaque DefRef文本到Core错误、def.instances合法partial正对照。
该控制只证明刺激/SDK边界，不冒称11项Tree已通过。B-16修订保持原M4/C-62边界。

[真实Tree/Core](../web/tests/independent-tree/tree-core.test.mjs)7项先冻结：
多top/leaf/首批、全页跨scope/escaped/数组、深层后续页reveal、port原ref/owner、
分组开关及折叠身份、独立释放、同源重开/旧RowId。
每个测试先要求真正Tree导出，缺能力即失败，启动Core前结束；不skip或借假模型执行。

## 新真实Core fixture与类型检查

[SV输入](../core/tests/fixtures/m5/b_tree_navigation.sv)，SHA
36b9dc146d681966ca01042da7f7675b20fa537e1bb1d610c5ef8849862ccb53，由B手写。
两tops b_tree_other/b_tree_top，后者10直接实例：
g[0..2]各left/right、单段escaped a.b、lanes[0..1]、plain；mid下有child，leaf有d/y标量端口。
[源码KAT](../web/tests/independent-tree/core-fixture.test.mjs)独立于Tree运行，实际核对：
全部一项一页并集、原路径段/顺序/childCount、游标无循环、唯一ref、深child祖先链及端口in/out/宽1，
原Node工厂→B自有Core，结束明确检查真实exited code0/signalnull。不能搬作Tree七项已通过。

[类型消费者](../web/tests/independent-tree/tree-contract.ts)和[逐条验证器](../web/tests/independent-tree/verify-tree-types.mjs)
用同一份输入检查提案/生产；35负例逐条移除expect-error，要求本对应行真实diagnostic，禁止其它import失败冒充负例。
检查名义RowId、全部命令Promise、互斥状态/error、readonly深层路径/诊断、Error.cause、
Complete-only及删除未发布incomplete码。proposal只映射公开声明；production不做替身。
strict/exactOptionalPropertyTypes/noEmit/skipLibCheck=false，提案0诊断/35负例全符合；
production14个缺Tree公开导出和后续unused-expect-error保持红，不改声明造假运行时能力。

## 本人实际命令

完整argv/cwd/exit/耗时/stdout+stderr见[机器证据](m5_b_tree_freeze.json)，重复执行不相加。

| 本人fixed6b或注明目录的入口                                 | exit / 结果                                                                            |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| npm ci --ignore-scripts --no-audit --no-fund；npm run check | 0；71包、195定义/27方法生成、四包、25模块/50依赖及7违规负探针；未执行audit             |
| 新SDK对照                                                   | 0；11/11                                                                               |
| 新树单元；新真实Tree/Core                                   | 各1；152/0绿/152红、7/0绿/7红，均缺TreeModel                                           |
| 新四文件联合                                                | 1；171总/12绿/159缺能力红                                                              |
| verify-tree-types.mjs proposal                              | 0；正例0诊断、35/35真实类型负例                                                        |
| tsc -p tests/independent-tree/tsconfig.tree-production.json | 2；14个TS2305缺导出及级联                                                              |
| 新Core源码KAT（297适配后）                                  | 0；1/1；初次0/1红另存                                                                  |
| 0eca同自有目录fresh cmake/build；切6b后增量build            | 均0；前者101.771秒，后者同源同目录，不叫6b冷编                                         |
| ctest --test-dir core/build -N；--output-on-failure         | 均0；75登记、75/75，46.99秒；不是零匹配                                                |
| 本人HIER_BIN npm run test:independent                       | 0；505/505，含258+241+6，不重复加总                                                    |
| test:independent:m5；原read-stage production tsc            | 0；241/241、原33生产类型负例和getter/cause消费者通过                                   |
| 本人HIER_BIN test:independent:m5:core；test:core            | 均0；B原6/6标准入口和A既有真实集成3/3                                                  |
| test:client；test:schema                                    | 均0；SDK27/27，655结构/元数据判断及27参数规范化；C++654由实际CTest覆盖，不混为同一计数 |
| 来源/pins/配置/格式/语法/本次diff                           | 最终通过；初败见下节                                                                   |

自有优化配置RelWithDebInfo，M3/FUTURE ON，OBSERVER/SANITIZE/EXPERIMENTS OFF，
137 Slang/27项目生产翻译单元与该配置一致，生产-Werror保持。
hier SHA 7e500a42746e0e17b55c8a6cd2255df1d13dd03f4ceef9385ce2965ff2a14ec6。
fresh build六条已有重复库链接warning，不称零warning。本轮没有执行三配置check.sh或Debug/ASan，
不把历史cfd75/78/80或C78搬作本轮新执行；本次纯契约/TS入口接线无Core生产变化。

0eca→6b的274个明定生产/构建输入逐mode/type/blob及路径集合相同；
切同一自有worktree后仅增量确认原自有对象，没有借另一工作树二进制/对象。
前后核六份第三方源码HEAD/clean；Slang源码ID仍07b9237d…，完整pin见机器记录。
B分支原310个跟踪文件全部保持；其中22旧B独立web+1选择Core+9历史文档共32份对实际产品逐字相同。
三种范围不混用，Schema/SessionContract/锁文件未变，自有固定产品跟踪源clean。

## 首次失败、修订与保存

1. 8e4e21a首冻的SV末尾空行检查exit2；另以67fcb38纯格式删除一行，语义断言不变。
   初次检查输出保存于机器证据的setup incident；不把后续检查0写成首次0。
2. 测试覆盖到固定目录时apply_patch拷贝多了一层EOF换行；运行前逐字检查并只移除多余换行，保留freeze内容。
3. Core KAT初次exit1：B错误把path.resolve的ObjectRef[]当成ObjectHit[]筛kind。
   修改前61a Schema本就明确数组元素ObjectRef；297只适配辅助函数，用公开object检查instance，
   一条目标、路径/祖先/端口/宽度预期均不改，原红完整保留。
4. 规范证明审计最初假定PathResolveResult是别名；实际为inline数组。初次审计失败保存，
   按公开Schema结构纠正证明表达后0，与KAT数据/生产无关。
5. 第三方pins采集漏base实参，使git在不存在cwd失败ENOENT。传实参后pins/clean通过再编译，
   预配置与成功核验先后分开记录，未改依赖/源码取绿。

这些为B装配/归档/纯格式问题，不是Tree实现缺陷。历史选择缺能力红及本树159项缺能力红均保留，
只有上述合法接口形状适配，不用实际A行为生成expected。

## 交接与边界

交A：按8e4e21a→67fcb38→297c3fc吸收本独立集合及结果提交，
原241/33/6/505与历史记录保持。生产固定Tree后，请B在自有目录原字节执行159、
生产35负对照/消费者、原505及真实Core链；新增目录尚未注册默认门禁，正式接线单独留证。
对应C认可+B冻结已满足，不需重复用户许可，但Tree/UI运行时验收仍欠缺。

交C：已读取固定6b契约通过并由B关闭B-16；本人没有关闭C编号或借用C执行统计。
如有B oracle疑义请给规范反例，由B另冻修订，不让A改测试迎合实现。

scope label精确文本、多错误dispose.cause容器、非法参数与通知重入的交叉优先未自定；
已明确组合单独覆盖，不从实现填空。这不是新增整体阻塞。
没有GC/绝对内存/延迟/取消预算、远端CI/Linux、真实设计UI、React/Electron/Playwright结论。
首版保存/加载/恢复/旧文件迁移不适用，导航/展开不是规划事实undo/redo。
本轮仅新增B测试/fixture/计划/报告/机器证据，无生产/API/ABI/IPC/Schema/依赖/工程格式或协调状态修改。
共享主树仅追加本人领取/问题/关闭/证据/交接，主树用户/A/C修改及旧工程/ref全部保留。
