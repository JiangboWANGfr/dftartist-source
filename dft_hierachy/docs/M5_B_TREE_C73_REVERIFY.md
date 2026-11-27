# B-M5-TREE-C73-01：诊断快照修复独立复验

## 结论

**C-73原冻结回归通过，但当前树运行时仍不放行。** 本人原17在c066再次复现
4绿/13红，同一字节在固定d87c741/48d6a40为17/17；标准180/35及完整693也全部通过。
最新REVIEW_LOG中C已正式关闭C-73，另确认High C-74（诊断getter异常/读取期间dispose）。
C-74不在原17内，本轮未读取或复跑C探针，不把C的5红或12正对照归为B执行。

A已领取C74契约修订，表示不可读取data的发布形状、读取期间命令重入尚需固定。
B不自行选择空data/丢字段/特殊保留键/新增dataIssue作为正确答案。
已明确的结算、保留原HierError、dispose优先/状态不复活可作为后续独立验收条件；
新表示契约按C审/B冻结前置继续。不得用本轮绿测覆盖C-74或签整个M5。

## 固定对象与职责

- 产品d87c74153f067eae76bd32c3c2930475acf7ec75；标准接线48d6a408cdbeb791794fe82d605aedafbee9d48b。
- 规范6b03e1d的§6.6，DESIGN/原公开声明/Schema/SessionContract四文件与原c066逐字相同。
- 原测试b0a5599，17冻结69a95ab、cursor有据纠正dbb4077；所有oracle原字节未动。
- 计划f18e678：[本轮计划](plans/B-M5-tree-c73.md)；实际生产执行同一B自有
  /tmp/hier-b-m5-tree-runtime.zM31cP/source，测试树test/m5-tree。
- 已读A/C共享摘要，非严格盲验；不读A运行时源码/diff、自测消费者或C探针制定预期。
  A作者补充回归实际由B跑，作者归属不改，不替代独立oracle。

## 输入、预期与判定依据

原[17项输入与预期](M5_B_TREE_RUNTIME_REVERIFY.md)保持：
transport roots/children/reveal的嵌套可变data，SDK disposed三路径，四导航方法非法partial，
必须保留原HierError/字段、发布自有深冻结诊断、原data/Error不冻结，
原data修改和dispose后旧值不变、无额外请求；四Core来源正对照继续通过。
依据仍为§6.6.2/3/5。Getter异常/C74的精确降级data尚未规定，不补造oracle。

原152单元/7真实树/Core/11 SDK/1 fixture KAT/35类型及旧505/33/6保持；
多scope/数组/escaped/Unicode路径、后续页reveal、跨页坏页、并发、两类owner分页取消、
共享SDK、通知异常/重入/释放、同源重开，均由原用例实际执行，不假UI或假SDK。

## 本人实际命令与结果

完整argv/cwd/exit/耗时/stdout合并stderr见[机器证据](m5_b_tree_c73_reverify.json)。

| 命令/批次                                                         | 本人实际                                                               |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 原c066 node --test diagnostic-snapshots.test.mjs                  | exit1；17总，4绿/13红，原HierError/data污染失败完整保留                |
| 同文件固定48d                                                     | exit0；17/17，原冻结字节不变                                           |
| npm run check                                                     | exit0；195定义/27方法生成、四包类型、分层/7负探针通过                  |
| npm run test:independent:m5:tree                                  | exit0；180/180=152+11+17；生产35真实类型负例/正例0诊断                 |
| npm run test:independent:m5                                       | exit0；241/241、33生产负例及原getter消费者                             |
| 原两个目录node --test；完整test:independent（标准门禁后再次复跑） | exit0；505/505，693/693；全部0skip/todo/cancelled                      |
| 真实Tree→SDK→Node→本人Core7+手写SV KAT1                           | 三配置各8/8；真实进程自然退出code0/signalnull                          |
| 原真实Core选择6                                                   | 三配置各6/6；精确历史/属性/快照隔离/释放保持                           |
| npm run test:schema，B隔离Python                                  | exit0；655/655（569结构/86登记），27规范化对照；Cpp654在CTest另计      |
| 本人HIER_SCHEMA_PYTHON=<B venv> JOBS=2 bash ./check.sh            | exit0；完整标准脚本，Core75/78/80，前端27/258/3/241/6/12/180/8全部通过 |
| 标准入口、来源/冻结字节/依赖pins、flags及日志/归档核验            | exit0；新17显式接入标准树入口，不再漏测                                |
| git diff --check、bash -n check.sh；本轮文档Prettier/本地链接     | 产品两项exit0；交付文档另在提交前实际验证                              |

A SDK27、Core3、补充生命周期12是A作者用例，B实际运行。
35/33是类型负例，不算Node用例；693=旧505+152+11+17+7+1。
表中各批次重叠，不累加新总数；本轮没有新增/删除/放宽/skip/xfail旧测试。

## 构建来源、配置与兼容

c066→48d明确保护的272份Core/协议/构建/SDK/Selection/锁/配置输入
逐mode/type/blob一致，保护范围在机器证据列明，不与A477/471或旧B范围混算。
同一B源/构建目录推进：先把原harness/17 overlay单独保留为8480ec2，
它们已逐字等于目标48d；安全切固定目标后工作目录clean。这个本目录overlay提交
不改变A产品或独立冻结，只使原未提交输入可追溯，b0/69亦长期保留。

本轮为**本人既有三配置增量构建及新CTest执行**，不是重新cold，不借其他树产物。
Node24.21.0/TS5.9.3/macOS arm64；普通observer OFF、Debug/ASan ON；
M3/FUTURE ON、experiments OFF；137 Slang/27项目生产TU逐配置核sanitizer，
27项目生产TU另核-Werror。6份第三方源码pins/clean前后核验、只读复用。
最终二进制/cache/compile_commands SHA单列于证据，对应实际Core批次。

完整check.sh 335.845s，CTest75/78/80分别
27.39/62.88/223.50s，仅为实际耗时，不是M7性能预算。
本轮三个增量build.log零warning，不能改写上一轮冷构建/标准重编各6条重复库链接warning。
没有新API/ABI/IPC/Schema/依赖/工程格式或迁移变化；旧工程/ref未写入。
npm依赖已存在且锁未变，不重复npm ci；标准脚本自身npm install实际执行后锁未漂移。

## 来源、归档与历史保护

50份指定B测试/fixture/历史报告/计划与b0及目标48d逐字一致；
原C73不放行/13红报告、机器证据SHA
d1d5e4a283ba05b620b3bc8bb18d0597233081948dfec8aee7a14dc8e57c99f1保持，绝不把历史失败改为通过。
12份树源/fixture与原B冻结字节相同；标准package入口明确包含diagnostic-snapshots及35生产消费者。
主树只追加领取/证据/交接，已有用户日志及未跟踪协调/research保留，不提交共享主树内容。

机器证据含29条完整命令输出，537343原始字节/231319 gzip字节；
内嵌27份源/配置/日志：12份B源、6份cache/compile_commands、9份build/CTest/LastTest日志，
1961268解压字节/143816压缩字节。
逐份核长度/SHA，内嵌数据不与外层重复相加。前/后红绿均可复现，未借A/C机器输出替代运行。

## 限制、歧义与交接

未执行React/Electron/Playwright/真实大型设计UI/Linux/远端CI/覆盖率/GC/M7预算；
首版持久化/工程保存恢复/旧文件迁移不适用。L6/SDK/NDJSON链不冒称实际UI IPC验收。
原scope label文本、多错误cause组合/交叉优先歧义仍保留。
新增C74不可读data如何投影、读取期间命令重入由A固定契约、C审、B再冻结；
不从d87实现或C探针选答案，不把正常getter支持等同于异常安全。

交A/C：C73原17已独立转绿，前置/历史冻结保持；C74仍阻止放行。
A/C74固定契约交接后B领取相应冻结；C已关闭C73，不由B重开或代签。
交协调者：B本轮C73复验/归档完成，整体树/M5不通过，不自行改调度总状态。
