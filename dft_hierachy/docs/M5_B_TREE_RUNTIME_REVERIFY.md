# B-M5-TREE-RUNTIME-01：固定远端树运行时独立复验

## 结论

**固定617d6a0/c0665c3不放行。** 原树行为/真实Core159项及35生产类型负例
经本人有据纠正cursor装配后通过，但C-73独立新增17项为4通过/13失败：
client/transport来源的诊断数据能被原data修改，旧树快照因此改变，违反
DESIGN §6.6.2/§6.6.3。Core来源四个正对照绿不能覆盖其它来源。

包含新增回归的独立全集693项为680通过/13失败，0skip/todo/cancelled。
标准脚本仍未接入新增17；不能以其结果代替693独立验收。C-73正式关闭归C，
本报告只确认B独立复现，不代关闭C编号。整个M5及宿主/UI仍未完成。

## 对象、职责和冻结来源

| 项                | 固定对象                                                             |
| ----------------- | -------------------------------------------------------------------- |
| 原规范            | 6b03e1dc7a33ff965992ef5d01a72b540d930675，§6.6.1–5正文与本轮产品相同 |
| 原独立测试        | 297c3fcf838918716ed8ffc8996739d215436913；历史结果b63873a未改        |
| Tree运行时        | 617d6a027253579cd7bfd3c5b2c5a9d5170abfb1                             |
| 标准接线/编译执行 | c0665c3ca622be81d13d9c7f3733a0286a90b853                             |
| 本人计划          | 6714796b3061a6d49f6380c2b570cf70321c973d                             |
| cursor装配纠正    | dbb4077dd3c81f264f242c2a64db70b53ec533dd                             |
| 17项诊断回归冻结  | 69a95abc2b8d08e69c6594f1ad948edae0f7974f，先提交后运行               |

测试树为test/m5-tree；编译执行为本人/tmp/hier-b-m5-tree-runtime.zM31cP/source
detached c0665c3。已读共享A/C摘要，非严格盲验；未读A运行时源码/实现diff、
A自测消费者或C探针来定义oracle。运行时从真实生产入口执行，公开SDK/Transport
没有被替代或改写。A/C的通过数不归作本人的执行。

[原冻结计划](plans/B-M5-tree.md)给出T01–T08；本轮沿
[复验计划](plans/B-M5-tree-reverify.md)，新增D01–D05只补既有深不可变要求，
没有契约变化或C++/协议/Schema/工程格式/依赖/旧工程修改。

## 首请求测试缺陷：依据与首次红均保留

本轮原163项实际exit1，124绿/39红，39份失败栈逐项确认均止于原harness.first
Transport帧cursor缺失断言；这些后续语义在该批次未执行，不能写成已经通过。
原修改前6b缺TreeModel的159红及生产缺导出仍在旧归档，不改写其历史结果。

B分别在修改前6b SDK及c066执行未创建Tree的公开children缺省/显式默认对照：
两调用合并一个请求，实际{cursor:"",inst:"B-root",limit:200}与公开canonicalParams相同。
Schema RequestCursor.default=""及InstChildrenParams引用、DESIGN §5.6.3/§5.6.6、
历史M4默认规范化合并用例是判断依据。Schema字节SHA仍为
30a9ca285b813202b5a9867485a6d301cbd450b31098c582542c3a11c89a1420。

dbb4077仅将harness.first的wire首页cursor断言改为等于空字符串，并加边界说明。
不是放宽首批/后续页/取消/reveal预期，不改SDK或私有发送入口；
另外10份原树源/fixture逐字不变。纠正后163项本人实际163/163。

## C-73新增回归：输入、预期、依据、结果

新增[diagnostic-snapshots.test.mjs](../web/tests/independent-tree/diagnostic-snapshots.test.mjs)
9345字节，SHA256 134cb00e0650f9275018ba2afaa2a7abf217e09fb891c046349ef857d6771a07。
使用本人公开Transport控制和实际HierClient/TreeModel；不读取C探针。
原HierError必须保留；不冻结原Error/调用方data，树发布的TreeFailure必须自有深冻结、
旧值在后来输入修改/释放后仍有效。依据全是原§6.6.2/§6.6.3/§6.6.5。

| 组     | 输入                                                                               | 必须结果                                                                     | 当前实际                              |
| ------ | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------- |
| D01，3 | roots/children/reveal在途，onClose传HierError(transport_closed)及嵌套对象/数组data | 保留原Error/字段，诊断非可变别名且深冻结；外部数据不冻结                     | 0绿/3红，直接借用同data               |
| D02，3 | 同输入；捕获旧值，再改原嵌套数组/字段，最后dispose                                 | 无额外通知，旧诊断不变；即时清空当前行/状态                                  | 0绿/3红，旧诊断随输入改变             |
| D03，3 | ready后SDK dispose，树请求roots/children/reveal                                    | 原disposed/client拒绝；无wire请求，旧诊断自有深冻结且原Error可写             | 0绿/3红，修改原Error.data改变已发布值 |
| D04，4 | roots/children/object/ancestors回方法非法partial                                   | SDK protocol_error/client并关闭；树failed，无下一查询，诊断深冻结/不借原data | 0绿/4红，原data添加字段污染旧值       |
| D05，4 | 同四方法Core not_found/已知message/嵌套data                                        | 字段原样、深冻结、旧值稳定，不关闭借用SDK，不冻结调用方/Error                | 4绿/0红                               |

17项均进入语义断言，非缺导出/缺能力、非fixture类型或Schema刺激错误。
13红是所有权缺陷；Core正对照与原159绿保持，绝不删/skip/xfail/放宽取绿。
原Error身份、诊断字段、借用SDK的关闭/资源边界和调用方可修改性均明确断言。
这些输入是JSON形状的普通对象/数组；不把任意原型/循环/访问器data支持冒称已经覆盖。

## 本人实际命令与结果

完整argv/cwd/exit/输出/耗时见[机器证据](m5_b_tree_runtime_reverify.json)；
下表只作可读索引。web命令均用Node24 PATH、HIER_BIN指本目录自有配置，非主树二进制。

| 命令/批次                                                        | 退出 / 实际结果                                                            |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------- |
| npm ci --no-audit --no-fund；npm run check                       | 0；锁文件无改，生成/四包类型/分层/7负探针通过                              |
| node tests/independent-tree/verify-tree-types.mjs production     | 0；正例0诊断，35项真实负diagnostic                                         |
| 原树单元+SDK两文件，未纠正harness                                | 1；163总，124绿/39装配红                                                   |
| 同批次，dbb纠正后；npm run test:independent:m5:tree              | 0；163/163（152树+11SDK），35类型也过                                      |
| npm run test:independent:m5                                      | 0；241/241、33生产负例及原getter消费者通过                                 |
| 原两个目录node --test（原505）                                   | 0；505/505                                                                 |
| npm run test:independent，新17前                                 | 0；676/676                                                                 |
| node --test tests/independent-tree/diagnostic-snapshots.test.mjs | 1；17总，4绿/13产品红                                                      |
| npm run test:independent，新17后                                 | 1；693总，680绿/13产品红                                                   |
| 真Tree/Core7及B fixture KAT1                                     | 各配置本人运行8/8，真实进程exited={code:0,signal:null}                     |
| 原真实Core选择6                                                  | 各配置本人运行6/6                                                          |
| npm run test:core                                                | 0；3/3，A作者用例，B实际执行，非本人的oracle创作                           |
| npm run test:viewmodel                                           | 0；10/10，A作者生命周期用例，B实际执行                                     |
| npm run test:schema，隔离jsonschema Python                       | 0；655/655（569结构、86登记），27规范化对照；C++654重放另在CTest           |
| 三配置fresh configure/build/register                             | 0；普通75、Debug78、ASan80实际登记，flags/产物哈希逐配置核验               |
| JOBS=2 HIER_SCHEMA_PYTHON=<B venv> bash ./check.sh               | 0；完整实际执行，三配置CTest75/78/80及所有现有显式前端入口通过；未包含新17 |
| git diff --check；Prettier新增测试/文档；bash -n check.sh        | 0；新增冻结测试格式、空白和标准脚本语法检查实际通过；报告/JSON交付格式另核 |

批次相互重叠，不加成新总数。原505内含258 M4、241选择、6真实选择；
原676=505+171；新693=505+188；188=152树单元+17诊断+11 SDK+7真实树+1 KAT。
原159=152+7；35/33是类型负例，不算Node运行用例。新17中的4正对照也真正实例化Tree。

## 构建、资源和来源

Node24.21.0 / TS5.9.3 / macOS arm64；Schema Python为B已有隔离venv。
本轮自有空目录首次可归档构建耗时普通182.806s、Debug128.973s、ASan291.493s，
仅是执行耗时，不作性能承诺。归档执行器中断的先前两轮不计上述数字。
标准脚本重新配置后实际重编，不叫三配置纯增量；完整check.sh为919.565s。
三配置CTest实际75/78/80通过，分别27.44/63.60/218.50s。
每次可归档冷构建6条既有duplicate-libraries警告；标准的三个build.log也各6条，
外层stdout的warnings=[]不代表内部build.log零warning。全部警告原样归档。
初次/重试Debug和ASan配置的unused FETCHCONTENT_SOURCE_DIR_MIMALLOC告警另保留，
不归为新增C++源告警。最终编译后再本人运行各配置真实Core8/6，全部通过。

| 最终配置    | hier二进制SHA256                                                 |
| ----------- | ---------------------------------------------------------------- |
| build       | 0e7f24f54aa619414811357c3388fd06cb919215099cc8381f87c4dd87400e6a |
| build-debug | 8e0be50b04f605ad5bf31adf392b1bb9532e7d4a47cb3c92ea757c7232a0f58e |
| build-asan  | 21aa1003240cc40f3aea1a59366731e8aec255496db100bec201844b9e6b2c28 |

二进制/cache/compile_commands的完整SHA、配置及相应实测批次在机器证据中分开。
标准重编前后的产物与测试各自标识；不能混用早期二进制SHA当最终产物。

6份第三方源码pins/clean在构建前后均本人核验，只读复用源码；Slang固定v12提交
545f88b2/sourceId07b9237d652d3a61abd674ae487791fcd97fc0b0a896a6c797b879f4620480db。
不借任何其他工作树产品对象/二进制。137个Slang与27个项目生产TU逐配置核sanitizer；27个项目生产TU另核-Werror。
M3/FUTURE ON、experiments OFF、普通observer OFF、Debug/ASan ON。

主要资源断言是确定性状态/订阅/进程退出，不是GC证明或绝对预算：
scope折叠按请求来源成对检查，另SDK消费者不中止，晚回包无新发布；
Tree dispose不关闭借用SDK；真实Core退出code0/signalnull，重开快照隔离。
没有新私有hook、sleep竞速、成本阈值或性能承诺。

## 测试/环境事件与核验范围

1. 首次来源审计把新增B SV fixture也当作6b已有文件，metadata比较exit1；
   只调整审计集合允许该唯一已冻结fixture新增，所有原条目的mode/type/blob不变。
   没改任何行为预期，原失败日志保留。
2. cursor错误按上节单独dbb纠正，原39装配红保留。
3. 并行归档执行器打印summary时TypeError中断，初轮Debug/ASan/schema/标准树
   的部分tool返回未收回。初轮构建完成后移到本目录build-debug-unarchived-first、
   build-asan-unarchived-first，可恢复、无删除；不算其退出/输出为通过证据。
   后续schema/标准树实际重新运行，Debug/ASan从空原路径再次冷配置/冷构建并完整捕获。
4. 标准重配置的旗标诊断初轮误断言只有tmp别名差异；实际还改变显式native
   -arch arm64的变化，第一份audit exit1保留；纠正只用于元数据审计。
   标准脚本实际重编，最终flags/binary/cache与日志另核，未改sanitizer/Werror或oracle。
5. 一次归档tool输出预算不足导致JSON截断，不是命令/产品失败；恢复情况见下节，
   未计作完整命令记录或使用不完整base64当证据。

B起点981fae9的全部310份条目保留，原32份选择/M4/集成/历史报告字节核验一致。
原新树11源仅harness按dbb规定变更；新增17源与69冻结字节一致。
原b638归档SHA64770b479b7fc1fdba35e53eb50a47735522f65d695938f14ea28a8e02880eea不变。
6b→c066指定Core/protocol/ci/client/protocol-types/views构建输入的既有条目保持，
唯一新增为B手写SV；不把本范围与A298/C452或旧B274混算。

[机器证据](m5_b_tree_runtime_reverify.json)含58条完整捕获命令，
941410原始输出字节/352212 gzip字节，逐条长度/SHA验真。
内嵌34份源/配置/日志另逐份解压核验：
13份B最终/原harness源码，12份重编前后cache/compile_commands，9份标准构建/CTest/LastTest日志，
共3407961解压字节/212456压缩字节。
内嵌数据已包含于外层命令输出，不把二者相加冒充独立总数据量。
一条日志归档tool返回预算截断不计58条完整记录；同命令重跑扩大输出预算，
原返回头的stdout大小/SHA与完整重跑逐字节对应哈希一致，恢复说明保留。
全部产品首次红、测试/审计初败、纠正后绿和最终13产品红均可追溯。

## 未执行、歧义与交接

未执行React/Electron/Playwright/DOM键盘ARIA、真实大型设计UI、Linux/远端CI、
覆盖率、TSan/fuzz/mutation、GC/M7绝对预算。首版持久化/保存恢复/旧文件迁移不适用。
已存在M4异步/并发/原始帧/错误回传和Selection撤销重做回归本轮实际通过，
但不能冒称尚不存在的UI IPC/工程恢复验收。

scope label精确显示格式、多错误dispose.cause组合容器和非法参数×通知重入交叉
优先仍按原计划列为未定，不自行采用实现为正确答案。未修改这些预期或补假实现。

交A：原样吸收dbb4077和69a95ab；修C-73，保持原HierError和调用方data可变，
对发布诊断满足自有/深冻结/旧值稳定；把新17接入显式标准树入口，再给固定SHA。
交C：17独立回归及完整证据可核；只有C可关闭C-73。cursor测试纠正不代替产品修复。
交协调者：本轮独立复验完成但运行时不通过；不修改协调总状态，也不提前开始宿主/UI。
