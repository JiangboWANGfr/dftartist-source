# §6.9 实例属性：B固定候选独立复验

B-M5-PROPERTIES-RETEST-01，2026-10-16，`test/m5-tree`。

**固定产品`9a415f63d7b182662a6de9f9b81e717838c252b5`在B最终冻结
`c2c0facbd03449e3ed16dc3015ccb6a01edeab14`上通过281项模型、5项真实Core集成及22项生产类型负例。**
标准入口在本人隔离候选中仅叠加四个固定B测试文件后，实际810+281+5=1096项通过，0skip。
这不是未吸收B修订的原9a415f6标准全绿，不是主树全门禁、整个M5、UI或Electron放行。

## 规范、独立性与变更

依据C已通过的DESIGN §6.9/§6.6.6，及C本轮即时通过的§6.9.4 subscribe释放窄补文。
候选DESIGN SHA256 `c71679f256ec94f39b6d9c99c5dd7e9cce57ffacc286c4ee19811b9bd965c4c8`；
补文通过事实见共享REVIEW_LOG的C-M5-PROPERTIES-RUNTIME-REVIEW-01即时交接。
已读A/C共享摘要，不自称严格盲测；未读A新模型实现/diff/消费者/自测归档、C临时控制作oracle。
测试保持真实HierClient、公开Transport及真实Node/Core，不补假Model、私有hook或改期望取绿。

本次只改B独立测试/文档/证据，无生产API/ABI/IPC/Schema/锁/依赖/工程格式变化。
完整[验收映射](M5_B_INSTANCE_PROPERTIES_ACCEPTANCE.md)与[运行说明](../web/tests/independent-properties/README.md)维护在原位置；
每项ID/input/expected/basis在`run.mjs --list`和`core-runtime.mjs --list`及机器证据中。

### IP-C01设施纠正：235d19d

先在本人修改前2ad2450真实SDK、withModel=false运行原硬编码顺序断言，实际退出1：
Model出口undefined、模型0、查询/SDK方法/index登记0，SDK已有close→message注册及各1个有效token。
这证明message→close并非模型构造的正确判据，而非由A新实现推导预期。
§6.9.1只要求构造不新增事件订阅、查询或通知，不要求重排借用SDK的既有注册。

单独冻结`235d19dd94d20b1e8049d17ced14824ae1ad1e33`，改为newModel前捕获同一真实SDK的注册序列及有效token，
构造后检查序列、数量、token身份保持；保留初始state/冻结值/snapshot/0方法/0查询/index/通知断言。
未删除订阅验收、未改SDK、未动其余251项。C本轮已复核该窄修订通过。
本次在新候选实际重跑原冻结：251通过/唯一IP-C01失败；修订后252/252通过，两个结果均保留。

### 经C批准后另冻29项：c2c0fac

先提交再执行新增语义，不依据候选表现调整oracle。原252项ID/input/expected/basis逐项保持，默认扩为281。

| 新增输入                              | 数量 | 预期与依据                                                                                              |
| ------------------------------------- | ---: | ------------------------------------------------------------------------------------------------------- |
| IP-S-active-invalid-*                 |   12 | 活模型同步invalid_argument，无状态/查询/通知变化；随后合法加载成功，非法登记不参与通知                  |
| IP-S-disposed-*合法/非法值            |   14 | 释放后同步disposed先于listener合法性，不探参数、不回调，状态/SDK保持；含poison、revoked、callable proxy |
| IP-S-disposed-notification/diagnostic |    2 | 通知/诊断中dispose后subscribe仍同步disposed而非重入/参数错误；原任务disposed、cause/停止后续操作保持    |
| IP-S-old-unsubscribe-borrowed-client  |    1 | 旧unsubscribe释放前后重复调用仍幂等；借用SDK直接查询仍成功                                              |

不额外发明活模型非法listener的raw读取次数。只从公开行为核零回调、无额外查询、状态保持及后续合法加载，
不检查私有listener集合，不将释放后不可直接观测的内部“未登记”冒称内存见证。
原Core5/类型22不变；C对窄契约通过不等于已审/执行这29项，固定SHA和证据另交C复核。

## 自有环境、构建与调用链

B新detached产品：`/tmp/hier-b-m5-properties-retest.k8s1Ex/source`，固定9a415f6；未修改旧2ad2450运行区。
Node24.21.0、npm10.9.2、TS5.9.3；复用本人第三方node_modules，workspace相对链接解析到新候选，四包`tsc -b --force`通过。
只复用第三方源码，不借A/C或跨工作树产品二进制。新Unix Makefiles/RelWithDebInfo、M3/FUTURE ON、observer OFF，
本人`hier`及生产依赖从新构建目录编译81.444秒，0 warning行；不是全目标、CTest或三配置构建。
首次Ninja因工具缺失配置退出1，另建Make目录后配置0，原环境失败保留。

本人新Core `core/build-b-properties/hier`：9326376字节，SHA256
`2baa307d6b43a55c99c2ee40537c449da188b06593e857981129d6302e8a2eb2`。
调用链分别是Model→真实SDK→B公开Transport，以及Model→SDK→Node→本人Core；后者不等Electron IPC。

```sh
export PATH=/Users/jiangbowang/.npm-global/bin:/opt/homebrew/bin:/usr/bin:/bin
export HIER_B_PRODUCT_ROOT=/tmp/hier-b-m5-properties-retest.k8s1Ex/source
export HIER_BIN="$HIER_B_PRODUCT_ROOT/core/build-b-properties/hier"
```

以下B相对入口在B工作树运行；npm/CMake在本人候选根运行。精确argv、cwd、UTC、退出码和完整合并stdout/stderr见机器档。

| 实际入口                                                                                                                                                                        | 退出码及结果                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `npm --prefix web run typecheck -- --force`                                                                                                                                     | 0，四包强制TS构建                                                     |
| `cmake -S core -B core/build-b-properties -G 'Unix Makefiles' ...`及`cmake --build core/build-b-properties --target hier -j 4`                                                  | 0/0，配置完整参数保存在机器档；新生产目标与依赖构建，不是native全测试 |
| `node web/tests/independent-properties/run.mjs`                                                                                                                                 | 最终0，281/281、0skip；此前原冻结1、251/252，235d修订0、252/252       |
| `node web/tests/independent-properties/core-runtime.mjs`                                                                                                                        | 0，5/5真实参数化实例/空实例/错误重试与释放/两模型/重开                |
| `node web/tests/independent-properties/verify-types.mjs production`                                                                                                             | 0，正例零诊断、22真实负例拒绝、Node/React/Electron平台类型依赖0       |
| `node --unhandled-rejections=strict --test --test-reporter=tap web/tests/independent-properties/fixture-check.test.mjs web/tests/independent-properties/core-controls.test.mjs` | 0，16/16=13 SDK控制+3 Core控制，不冒充5项模型集成                     |
| `npm --prefix web run test:independent:m5:tree`                                                                                                                                 | 0，原287/287及35+14真实类型负例，覆盖公共诊断抽取的旧消费者           |
| `npm --prefix web run check`                                                                                                                                                    | 0，195定义/27方法、四包类型、34模块88依赖、7分层负探针                |
| 原候选`npm --prefix web run test:independent`                                                                                                                                   | 1；旧810通过，再252为251/1，后续Core5未执行，不改写该失败             |
| 仅235d测试overlay的同一标准入口                                                                                                                                                 | 0，810+252+5=1067；仅属于追加29项前的集合                             |
| 最终c2c0fac测试overlay的同一标准入口                                                                                                                                            | 0，810+281+5=1096；分别核各段统计和0skip，不凭尾部5项猜全集通过       |
| overlay后`test:independent:m5:properties` / `test:independent:m5:properties:core`                                                                                               | 0，最终模型281/类型22；Core专用入口此前5/5，文件与后续冻结相同        |
| 新冻结对修改前2ad2450的`run.mjs`                                                                                                                                                | 1，计划281/实际语义0/skip0，仍缺Model；未造假实现补绿                 |
| `--list` / `verify-inputs.mjs` / 串行来源审计                                                                                                                                   | 0，库存/唯一ID/规范依据、来源及资源释放核验                           |

重复执行和子集重叠不能累加；Tree287、Core旧消费者等已在原810内，类型负例不算运行时用例。
原252项含133诊断边界和4项plain Node原Promise后台拒绝输入，最终已实际执行；不外推L7原view Promise消费。

## 来源保护与测试overlay

标准入口验证只叠加c2c0fac的四项测试：cases.mjs、run.mjs、verify-inputs.mjs、subscribe-cases.mjs。
候选696个跟踪输入中，仅前三项B测试有diff；新增第四项未跟踪B测试，全部与固定B blob逐字节相同。
其余候选文件完全保持，生产修改0；记录该明确非clean的测试overlay，不虚称整个候选clean。
最终候选输入映射SHA256 `f8a24e1de4ef81cc81990c27831ca24533a1a032f27b9df87e1dffff5c939757`。
Core/Schema完整Git tree与修改前2ad2450相同，锁文件同一blob；本次仍独立构建/运行，不用身份相同代替测试。

原B454项文件（含C-81设施）全部保持；本轮起点474项中仅五个已说明的新属性测试/映射/README演进，历史报告/归档不变。
旧2ad2450产品保持原head且clean；最终无本人Core进程遗留，初始共享日志前缀保持。
新构建54项JS/声明输出映射SHA256 `c6fff33d77231d222bda5af465e7b8373751e584623fd48dba6977ad9f2a13c4`。

## 完整证据与复核

[机器归档](m5_b_instance_properties_retest.json)：33份命名完整命令捕获，原始664004字节/gzip100692字节，28项固定源码pin。
SHA256 `33eff6fd38a754803cf8ebc8b0f3f28426a2970d882050fe674e2ecbad2a38a8`。
包括修改前SDK反例、原252唯一失败、未叠加标准入口非零、Ninja环境失败、新旧缺能力红及全部实际绿结果；不只保留尾部。
这是命名入口的完整捕获，不声称穷尽所有探索工具调用。

原252枚举75679字节/SHA256 `cde21ad8baad5e660aadaafad07b6239a1f18bc57520585fa5916e4cb98a5dce`；
新281枚举85658字节/SHA256 `52e8c231e2d50c2f884d0e27c4b9beddf0741ba2cc0235b26cb0f591709f067f`，过滤新增29后与原252逐项一致。
Core5枚举原1391字节完全保持。

```sh
node web/tests/independent-properties/verify-retest-evidence.mjs
```

[新核验器](../web/tests/independent-properties/verify-retest-evidence.mjs)已退出0，核解压长度/hash/退出码、全部输入、
分段运行统计/真实类型诊断、来源及失败保留；只核档案，不另跑模型。
原[冻结报告](M5_B_INSTANCE_PROPERTIES_FREEZE.md)/28份归档与3份追加归档保持。
旧verify-evidence在本轮演进前已实际0，其current-file pin只适用于旧测试快照；原始源码仍可由固定Git blob核验，
不为新测试演进偷偷更新旧归档或旧pin。归档收尾检查另存[machine checks](m5_b_instance_properties_retest_archive_checks.json)。

## 限制与交接

本轮通过的是本无界面数据单元在上述固定生产/测试组合上的独立输入，不替代合入主树后的完整门禁。
未跑完整check.sh/native全目标/CTest、Debug/ASan、独立Schema655/654重放、真实设计性能/M7、Linux/远端CI或覆盖率百分比。
没有React属性面板/HierarchyTree/Electron/AX/读屏结论；首版保存恢复/旧格式迁移、计划编辑undo-redo不适用。
参数具体展示拼写及裸ref来源的原精度边界保持，不能从新模型通过推导未知blackbox真实Core已运行。

交A：原样吸收235d19d及c2c0fac，更新状态/计数并在主树重跑标准完整门禁，固定合入SHA；不再为错误顺序改SDK。
交C：复核新增29输入的规范归因、公开可观测边界及本完整分段证据；C已审代码/IP-C01不冒充已审新281集合。
C-81另项保持开放，未在本单元修复/关闭；L06、原view Promise、Electron等限制均保持。
