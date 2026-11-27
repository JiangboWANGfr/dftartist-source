# Agent B：C-70输入读取补冻与修改前基线

## 结论与固定对象

固定契约 **61a7ffea22d202393d9373c192367f2c36d708b3** 的C-70补充专项已独立冻结：
**264736f5786089f5cf58f6abe40120add990b2da**，test/m5起点c58ef80。
新增80项；原159项+旧2项保持，三文件联合241项均缺生产导出而红，未进入选择语义。
getter类型消费者及原33项类型负对照、207项TS/Node回归通过。
C-M5-C70-RECHECK-01已正式关闭C-70并认可上述固定契约；对应实现前置已满足，
**可以进入L6选择实现，但没有运行时验收结论，不是完整M5/GUI批准。**

- 本人fixed源码/生成产物：/tmp/hier-b-m5-c70.KbKlPn/source，detached61a7ffe。
- B测试工作树：dft_hierachy-test-m5，test/m5；不使用主树移动产品或他方/其它工作树Core产物。
- DESIGN SHA：e19b2bca047b0b7097a75f0e9bc3ef680eac54dce1c047cd1bab6bd340189a49。
- 公开声明SHA：80f5e7a1ed1cc2c539c162057212a11a15cdd6fb3ab132942f0f8801d2bfb4e9。
- Schema SHA：30a9ca285b813202b5a9867485a6d301cbd450b31098c582542c3a11c89a1420。
- SessionContract SHA：0295e91ce7b1aac4d8b2a7a9011686f431a787e27747a45309ae6cb636901af6。
- Node24.21.0、TypeScript5.9.3、Prettier3.9.10；darwin arm64。

## 独立性、覆盖与判断依据

先读最新日志、用户决定、公开契约/Schema/声明和规则，手写测试并先提交后运行。
没有读A实现、实现diff、自测消费者/输出或C探针来建立oracle；不复制A/C的getter消费者。
共享日志摘要已读，不宣称严格盲验。没有自制SelectionModel冒充产品。
只用公开方法/getters/本地错误及公开合法调用方getter/Proxy输入，无私有hook/monkey-patch/sleep/竞速。

[计划](plans/B-M5-c70.md)逐组给出输入、结果、DESIGN依据；
[运行时专项](../web/tests/independent/selection-read-stage.test.mjs)具名case、手写预期。
immutable字面量防止产品污染后续expected，拒绝后按公开history/通知验证原子性和保护释放。

| 组   | 项数 | 输入与必须可观察的正确行为                                                                                                                               |
| ---- | ---: | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G01  |    5 | 正常/继承getter及Proxy数组；声明字段/索引确定顺序，每路径至多一次Get，缺失不Get；共享对象两条路径分别取值，不枚举扩展、调用toJSON/map/iterator           |
| G02  |   12 | 输入getter内同目标/异目标select、可移动/边界back/forward全部reentrant_change；捕获后允许外层提交，未捕获转invalid_selection/cause；锁释放且原history保留 |
| G03  |   13 | getter/存在性探测抛Error、原语、null/undefined/object/symbol/SelectionError；精确cause且不提前提交；读取异常优先于之前的非法原语/快照状态，不读后续      |
| G04  |   13 | getter/探测内dispose后返回合法/非法/undefined或抛值；disposed即时优先、cause原值保留、不复活/不通知，已发布值仍有效；释放后入口零探测                    |
| G05  |   11 | options继承getter按snapshotId/historyLimit单次读取后校验；读取异常invalid_options/cause，提前异常不读后续，外部副作用不回滚                              |
| G06  |    7 | 通知期间再select先持输入保护，回显/输入失败之后恢复通知保护；结构/绑定校验优先；未捕获读取错进入AggregateError，getter释放立即停peer并保留前错/cause顺序 |
| G07  |    4 | 输入阶段订阅可参与随后提交；失败不回滚合法订阅/退订/外部状态；其它模型可以独立导航，不受本模型锁影响                                                     |
| G08  |   15 | array/function/null等非法记录容器、非实际数组items、稀疏项、继承undefined；正确local错误且非法容器立即停止后续读取                                       |
| 合计 |   80 | 只是新C-70补充，不替代原159+2                                                                                                                            |

[getter类型消费者](../web/tests/independent/selection-read-stage.ts)检查普通/继承访问器、
Proxy、getter内公开导航/订阅/释放调用及ES2022 Error.cause。
只strict/noEmit编译这些表达式，未运行这份消费者当行为证据。
原33条类型负例保持并逐点重跑，未以无关编译失败代替通过。

“验证器只看到自有值”的公开黑盒保证由首值结果、原getter次数/顺序及扩展不读取体现；
不能据此声称黑盒枚举了内部参数地址或证明内部具体实现，机制审查仍归C。
存在性probe同时设置has/getOwnPropertyDescriptor的相同副作用，不要求生产采用特定一种探测API。
cause要求保留原抛值/身份；特别检验throw undefined时cause属性存在，不能仅以不存在属性读到undefined取绿。
记录容器错误立即停止，但普通非法原语仍需先取得其后声明字段；否则后续getter抛错的优先级会错误。

## 本人实际执行

关键argv/cwd/退出/用时及完整stdout/stderr见[机器证据](m5_b_c70_freeze.json)。
所有测试批次0skip/0todo/0cancelled，以下同类重复批次不相加制造“更多独立绿例”。

| 实际命令（fixed source/web）                                                                                       | 退出/结果与边界                                                                      |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| npm ci --ignore-scripts --no-audit --no-fund                                                                       | 0；本人锁定依赖71包；未执行audit，不声称安全审计绿                                   |
| npm run check                                                                                                      | 0；195定义/27方法生成零差异、四包构建、22模块37依赖分层通过，7违规探针按期望拒绝     |
| tsc -p tests/independent/tsconfig.selection-read-stage.json                                                        | 0；getter/cause公开消费者strict/exactOptionalPropertyTypes/noEmit/skipLibCheck=false |
| node tests/independent/verify-selection-types.mjs proposal                                                         | 0；原消费者0诊断，33/33类型负对照各有对应真实diagnostic                              |
| tsc -p tests/independent/tsconfig.selection-production.json                                                        | 2；缺8个生产选择导出及级联诊断；不与提案编译混同                                     |
| node --test --test-reporter=tap tests/independent/selection-read-stage.test.mjs                                    | 1；80总/0绿/80红，均缺SelectionModel，未进入新读取语义                               |
| node --test --test-reporter=tap tests/independent/selection.test.mjs tests/independent/selection-contract.test.mjs | 1；161总/0绿/161红；160缺SelectionModel、1缺SelectionError，原两项/159项不改         |
| 三文件联合同入口                                                                                                   | 1；241总/0绿/241红；240缺Model、1缺Error，没有缺实现skip                             |
| 完整client/node-boundaries/version/review-boundaries/node-private-controls/id-boundaries六文件                     | 0；207/207；不替代标准258/Core/真实Node链                                            |
| Node语法、锁文件/来源/旧字节、Prettier和本轮git diff --check                                                       | 0；仅本轮B文件格式化/检查，不全仓重排                                                |

所有80项是“缺公开能力”，不冒称80个getter/算法已被真实实现反例击中，亦非新回归。
没有编临时模型或按实现修改期望，更没有为取绿删/skip/xfail原测试。
旧报告中的七文件220/221缺HIER_BIN和归档脚本初败保持原字节；本轮没有再次误叫七文件无Core。

## 来源、兼容与未执行范围

110个明确定义的生产/生成/构建/Schema/CI路径对原提案52ae57c模式/类型/blob相同；
原B web独立19文件及原三份选择计划/报告/机器证据共22文件逐blob/实际SHA相同。
新3份测试/类型文件在实跑后与264736f逐字相同；本次计划只追加实际结果，
fixed目录B覆盖的初始计划仍保存原freeze版本。
固定source已跟踪产品干净，npm没有改锁文件；不夹带A/C、协调或研究文件。

只新增B专项、类型config、计划/报告/JSON。
不改早期生产/公开声明签名、C++ API/ABI、协议2/schema7、IPC、SDK/Core错误、依赖或工程格式。
原Error.cause继承自Error，未添加自有生产声明/错误码。
首版不提供会话保存/迁移，规划编辑undo/redo也不适用；本测试是导航/模型输入事务。

本轮未跑fresh Core单测/三构建/ASan/Linux、真实SDK-Core/Electron IPC、
React/Tree/Source/Playwright、processor_core/openc910、GC/M7性能预算或远端CI。
原因：纯选择契约阶段无Core/SDK生产变更或真实UI纵向链；不借旧/他方产物取绿。
旧真实Core门禁源码保持，但未运行不等于通过；不把历史M4放行证明当本轮新执行。
本轮也未对所有JS intrinsic异常（如revoked Proxy检查）、刻意伪造数组length返回值等未明确边界设oracle；
不据此新增没有规范反例的阻塞。Error.message/name/stack精确文本、无抛值时cause形状不自定。

## 交接

已见C本人正式关闭C-70，认可固定61a7ffe。B本次264736f冻结交付后，
A可按该契约继续L6 Selection实现，不需重复C/用户相同许可。
请A按原字节吸收独立测试和结果，原159/2/33及80均保持；如有测试疑点，提供规范反例交B处理。
运行时固定提交后B重新在独立目录执行全部选择241项、生产类型消费者及相关前序回归，
真实UI/会话纵向能力仍按后续单元先契约/冻结。
C继续负责实现机制/兼容/资源审查，B不代关闭其它意见或修改协调总体状态。
