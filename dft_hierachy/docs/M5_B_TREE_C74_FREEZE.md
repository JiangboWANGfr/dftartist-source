# Agent B：C-74 读取边界独立冻结与未修复基线

## 结论与固定对象

B-M5-TREE-C74-CONTRACT-01完成：**68项运行时测试、14项真实类型负例已独立冻结**。
C已正式认可固定dfcda6781f739e1ce4e48a322602370050220e3c的DESIGN §6.6.6及公开声明。
生产仍d87c74153f067eae76bd32c3c2930475acf7ec75 / 接线48d6a408cdbeb791794fe82d605aedafbee9d48b，
**新运行时基线11绿/57红，C-74 High仍阻止树运行时/M5放行**。
契约认可+B冻结前置现已齐备，交A实施；B不代C关闭缺陷，不要求用户重复批准路线。

冻结提交：85d55b0b8590f13e27884567e45d14a3af4bbf10（初64项/14类型），
c66e69c1c4f8164aa5f529a16e54729da5f395ca（仅四处类型注释位置），
9d9bbd38f5f109889dc68ec2cf7a7ab645eae45f（规范覆盖审计追加4项，最终68）。
这三份是A按顺序吸收的测试提交；本报告/证据/计划收尾是另一份结果提交。
原17/180/693、35/33与原12份Tree源/fixture原字节保持，没有skip/xfail或放宽。

依据DESIGN/公开m5-tree.d.ts/原fixture独立定预期。已读共享A/C摘要，非严格盲验；
未读A实现、实现diff、A消费者/自测或C探针建立oracle。
实际产品执行全部在本人固定/tmp/hier-b-m5-tree-runtime.zM31cP/source；
B test/m5-tree仅存独立测试/文档。不能直接用B分支的旧声明代替固定提案。
使用真实HierClient/TreeModel、原B公共Transport控制，不改SDK方法、不用生产私有hook。

## 输入、预期与判断依据

全部新预期来自§6.6.6；所有场景以公开Transport.onClose输入原HierError触发真实SDK/Tree错误链。
原错误身份、冻结状态及通知/生命周期沿§6.6.3/§6.6.5保持。
每个独立场景的method/scenario/site/throwValue等实际输入在测试配置中，机器证据另列验收分组。

| 编号 / 数量 | 输入与精确预期                                                                                                                                                 | 未修复绿 / 红 |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| R01 / 21    | roots/children/reveal的detail getter抛Error/undefined/null/0/false/空串/poison Proxy；原HierError拒绝，空冻结data、read [detail]，不检查抛值/不读后续字段      | 0 / 21        |
| R02 / 3     | 三方法的HierError.data Get抛错；read []、原错误不替换                                                                                                          | 0 / 3         |
| R03 / 5     | 嵌套点/斜线/空键/Unicode组合与分解、数组下标；路径保留原键，下标为字符串2                                                                                      | 0 / 5         |
| R04 / 5     | 根/嵌套ownKeys、描述符、revoked Proxy、数组length故障；对应enumerate/inspect/read及原相对路径精确匹配                                                          | 0 / 5         |
| R05 / 14    | 字段三方法、data/ownKeys/描述符/length中dispose，返回或再抛；disposed优先/cause原错误，rows空/root idle0/reveal idle、无新通知/后续读取/状态复活               | 2 / 12        |
| R06 / 3     | 三方法getter内七命令，包含no-op/非法Proxy参数；Promise reentrant_change先于参数读取，无额外query/取消，正常捕获后保护恢复                                      | 0 / 3         |
| R07 / 4     | 三方法读取中订阅/退订、跨模型命令；退订不通知，新订阅参加下一实际批次，保护仅本模型                                                                            | 4 / 0         |
| R08 / 4     | roots/children同页双等待者、roots/reveal失败观察者抛错；单query、两者原错误，单settled通知，AggregateError.errors为观察者值且cause原SDK错误                    | 0 / 4         |
| R09 / 5     | 空data/普通getter/共享循环/稀疏数组/SDK自有dataIssue字段；深拥有、图关系/空洞/长度/字段保持、一次读取、真正省略顶层issue、不冻源对象、不调用强转方法、旧值稳定 | 5 / 0         |
| R10 / 3     | 三方法getter先发七重入命令再抛错；保护与原错误要求保持，失败捕获退出后合法命令可执行                                                                           | 0 / 3         |
| R11 / 1     | 两路径引用同一抛错对象；首次发现路径[first,detail]，一次读取、不读后续字段                                                                                     | 0 / 1         |

失败dataIssue的code恒为data_read_failed，operation仅inspect/enumerate/read；
整份未完成副本丢弃，发布冻结空data与自有深冻结issue，不把任意抛值留在状态中。
成功（含正常空data）真正省略顶层dataIssue，SDK data内部同名字段不冲突。
字段code/origin/message保持，原请求错误不成为inconsistent_reply或独立后台拒绝。
getter同步观察原pending完整批次；诊断准备不通知，无dispose仅一次settled，dispose立即静默清空。

类型D01–D14：精确code/operation、字符串路径、path及元数据/failure只读、必需字段、
null与显式undefined不合法（exactOptionalPropertyTypes）、不新增TreeErrorCode、不暴露thrown字段。
提案正例无诊断；移除14处expect-error后，在各目标行得到真实编译诊断，不能把注释本身当通过。
原旧TreeFailure对象继续可用；合法getter数据的Readonly<Record<string,unknown>>消费者不强转。

## 本人实际命令与结果

Node24.21.0 / TS5.9.3 / macOS darwin25.0.0 arm64。
以下都是本轮在本人固定目录执行，不借A/C结果；完整argv/cwd/退出/耗时/stdout在机器证据。

| 本人执行                                      | 退出与实际结果                                                                                                |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 新诊断初64项                                  | 1；11通过/53失败，0cancelled/skip/todo                                                                        |
| 新诊断最终68项（两个父测试文件）              | 1；11通过/57失败，0cancelled/skip/todo                                                                        |
| 初默认test:independent含新64项                | 1；757项，704通过/53失败                                                                                      |
| 最终默认test:independent含新68项              | 1；761项，704通过/57失败；原693均仍绿                                                                         |
| 显式列出原文件、排除两个新增父文件的旧回归    | 0；693/693，0cancelled/skip/todo；不是偷偷把默认门禁改绿                                                      |
| 标准test:independent:m5:tree                  | 0；180/180，含原17；生产类型35负例真实命中                                                                    |
| 标准test:independent:m5                       | 0；241/241，生产类型33负例、getter消费者通过                                                                  |
| test:schema                                   | 0；655/655（569结构+86metadata）、27规范化检查，0skip                                                         |
| web check                                     | 0；生成一致性、生产类型、分层及7分层负探针通过                                                                |
| 新提案类型首次 / 修正后                       | 首次1是B注释位置错误；修正后0，正例0诊断/14真实负例                                                           |
| 新生产类型（首次及修正后）                    | 1；缺TreeDiagnosticIssue与TreeFailure.dataIssue，TS2305/2353/2339及缺类型后的unused注释级联；不是14项生产通过 |
| 七份新源语法/格式、git diff --check；来源审计 | 0；不读/改生产实现                                                                                            |

危险getter每例由plain Node子进程运行，明确--unhandled-rejections=throw，
无node:test/全局拒绝监听，父测试记录退出与stderr，不把后台错误吞成成功。
子进程20秒/父测试30秒是防挂上限，不是性能SLA。
R10 roots在两个最终运行集合中均触发20秒ETIMEDOUT，未取得合法结算；
不据此猜实现原因或调整期望。其它红项完整退出/断言/未处理错误均保留。
57红是同一C-74契约边界的独立变体，不重新记成57个产品缺陷。

本轮纯L6契约冻结不重建Core、不跑CTest/check.sh；复用的是本人C-73同目录三配置产物，
三份二进制SHA/字节与前轮本人记录一致，非其它session产品。
本轮693及默认集合确实执行了普通配置真实SDK→Node→Core旧集成（含树7+fixture KAT1、选择6）。
C-73前轮29命令、三配置75/78/80等归8970de1/c79b4251历史证据，不能充成本C-74单元新执行。
不声称本轮Debug/ASan集成或新的运行时修复已经通过。

## 测试装配与追加冻结记录

初85d55b0先提交再跑。Prettier将四个负例变成多行对象，D01/D02/D03/D13注释
位于const行而真实诊断在属性行，首次提案因此exit1；属于B测试装配，不归因产品。
c66e69c只移动这四处注释，机器核验移除这些注释后的消费者文本完全相同。
初败输出与初TS源保留，修正后14项真正通过。

随后按规范核覆盖，发现失败退出保护恢复与共享对象首次路径需直接场景；
9d9bbd3新增4项R10/R11并先提交再执行。初64父文件保持原字节，原预期不变，
runner仅增加新配置的分支；初64的11/53及最终68的11/57同时归档。
不是根据A实现或运行时输出改oracle。无尚未解决的规范歧义。

## 来源、证据与交接

固定dfc提案相对48d的279份指定Core/protocol/ci/全部web生产包/锁文件/脚本输入
mode/type/blob完全相同；保护名单明确记录在首条机器证据，不声称全仓任何文件都未变。
原12份Tree源/fixture与b0原字节/SHA相同；七份新源同时匹配最终B冻结和实际执行目录。
提案DESIGN SHA256 010b079ef15754b774e71debc48219f8c43429f6bc2929e352d507164c8e88aa；
公开声明7b5aec186d65d28238a69e229b164c59286508aa1e44b8e7f864e4b279bc8c83；
Schema30a9ca285b813202b5a9867485a6d301cbd450b31098c582542c3a11c89a1420。

[机器证据](m5_b_tree_c74_freeze.json)，SHA256 **26ba2244a023016dbe7592d712b21c9109e9e8d8f459622577cf3326a9981c3f**。
18条完整验证命令，输出712342解压字节/93663 gzip字节；
内嵌9份新源/初源为54721解压字节/13202压缩字节，逐份长度/SHA验真。
内外不重复相加；不声称记录所有初始只读检索、临时编排或提交命令。
[计划](plans/B-M5-tree-read.md)，新测试位于web/tests/independent-tree/diagnostic-read*及对应两配置/verifier。

交A：按顺序吸收85d55b0、c66e69c、9d9bbd3，保留原17/180/693与本轮红证据；
实现§6.6.6，并显式把两个新增运行时父文件与新类型verifier production接入标准Tree门禁。
当前标准180入口**尚不包括新68**；默认独立wildcard已包括，实际761红已证。
提案类型14绿不是生产新类型实现通过。请交固定修复产品/接线SHA，再由B原oracle复验、C正式关闭C-74。
交C/协调者：对应契约审查与B冻结前置齐备，不增D/UI前置，不重复请求路线批准；
C-73关闭保持，C-74未关闭。主树只追加本人日志，不提交共享协调/research/其它session内容。

未执行React/Electron/浏览器/真实UI、大型设计、Linux/远端CI/覆盖率测量/M7。
工程保存/加载恢复及旧格式迁移属首版明确排除，不从通用清单另立功能。
