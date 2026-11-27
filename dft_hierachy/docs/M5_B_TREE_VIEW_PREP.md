# Agent B：树视图提案独立验收准备结果

## 结论与边界

**B-M5-TREE-VIEW-PREP-01准备部分完成，不是生产UI复验通过或正式UI冻结。**
提案独立消费者正例0诊断、46项实际类型负诊断全部命中；
真实SDK/L6公开边界4/4、0skip/todo/cancelled。
实际生产@hier/views没有HierarchyTree及相关类型，能力/类型检查按原预期退出1。
这是尚未实现的能力缺失，不是46项UI运行时失败，也没有注入fake或skip取绿。

[95条验收矩阵](M5_B_TREE_VIEW_ACCEPTANCE.md)给出每项输入、预期、规范出处和执行层次；
这些是准备条目，不是95个已执行测试。真实React/浏览器测试尚未编写执行。
C-M5-TREE-UI-CONTRACT-01正式结果已出：Q01归入开放C-76（Medium契约缺口），
Q02/Q03也获C确认需明确，§6.7尚未通过；
正式UI冻结及后续生产L7实施的对应前置尚未满足，不新增用户重复批准要求。
C-73/C-74/C-75保持关闭；整个M5/UI未验收。

## 固定对象与独立性

公开提案8da9bd82cf6d8223a9cb39f8fbcda8228c0851dd，
DESIGN SHA256 69702998ffeaa602cc2c29205e3d57e15e08444e9bfc750c2bfe313ba478e3a2。
B分支test/m5-tree从ecf6b680bea62bf0b8ba99060f448b3d53137e84继续，
先提交计划f27175747d5752cd9366ea48634318d2fe595337，再追加主日志领取与问题。

执行用本人/tmp/hier-b-m5-tree-runtime.zM31cP/source固定2003dc00d2e74e105fca5f95bb84e8c2b2e5c50f，
复用本人上一轮已构建的SDK/L6，不称本轮fresh或重新构建Core。
逐项比对固定提案与2003的279份指定生产/构建/锁定输入mode/type/blob完全相同，
因此没有借旧产品冒充新UI实现。检查的是公开声明、元数据和本人原测试，不读A实现/原型/diff。
已读共享交接摘要，非严格盲验；A原型12项及其新增消费者不作为B oracle或本轮执行结果。

proposal.d.ts是原公开声明837字节的精确快照，
SHA256 c0fd475a96370b99c547597bc047693baa33549f50455d994cc00e276359a017。
它只在显式proposal模式代入；production模式始终消费真实生产出口。
只读复用@types/react18.3.26、@types/prop-types15.7.15、csstype3.2.3的类型源码，
按锁定版本核对并前后记录字节/SHA；并非声称重新下载tarball验证所有供应链内容。
未装新依赖、未修改任何锁文件或生产配置。

## 现有覆盖与新增内容

既有B的选择、树、SDK/Core/Schema集合已冻结，上一轮800和三配置结果见ecf6b68；
本轮只盘点原独立文件名和保护其字节，不把旧执行重记成本轮通过。
冻结基线没有独立UI目录，实际生产出口也只有VIEWS_PROTOCOL_VERSION。
现有L6 Node测试不能代替React生命周期、真实键盘/焦点、DOM窗口、AX或辅助技术。

新增[独立测试目录](../web/tests/independent-tree-view/README.md)：
严格消费者及逐项负诊断验证器、真实生产能力探针、
四项公开SDK/L6事实测试和固定公开声明快照。
没有修改原287/35+14、选择241/33或其它冻结输入/预期。
全部357份原B跟踪文件前后原字节保持。

四项BVP分别确认：

- 初始L6 roots=idle，且已有一行roots status，不是空rows；无查询。
- select观察者抛值同步形成AggregateError，原值身份保持，选择已经提交。
- 正常select返回undefined，不是Promise。
- 旧无绑定SelectionModel合法但snapshotId缺省；不能据此省去新UI绑定检查。

## 本人实际命令

Node24.21.0（明确PATH，不沿用默认shell的23）/ TypeScript5.9.3 / macOS arm64。
命令及环境复现见测试目录README；完整argv/cwd/exit/耗时/stdout-stderr在机器证据。

| 实际集合                                                               | 结果                                                            |
| ---------------------------------------------------------------------- | --------------------------------------------------------------- |
| 公开提案/依赖/279生产输入/357原B文件审计，前后各一次                   | 均0；来源一致、运行目录干净，公开声明快照相同                   |
| verify-tree-view-types proposal，前后各一次                            | 均0；正例0诊断，V01–V46移除指令后逐项真实负诊断，无其它错误     |
| 同一消费者production，前后各一次                                       | 均1；4个TS2305缺出口，继发46个TS2578和1个TS7006，原始51诊断全留 |
| production-capability                                                  | 1；真实导出只有VIEWS_PROTOCOL_VERSION，HierarchyTree为undefined |
| plain Node --unhandled-rejections=throw --test public-model-boundaries | 0；4/4，0skip/todo/cancelled                                    |
| 来源/旧覆盖/95个唯一验收ID/6份测试来源hash盘点                         | 0；仅准备矩阵，不执行95个UI用例                                 |
| 新测试语法、Prettier及diff检查                                         | 0；不是全量ESLint或远端CI                                       |

以上10份完整归档记录包含前后复跑，46个独立负例不累加为92，
两次缺生产类型不算两个不同功能缺陷。
新验证器默认React类型寻址在编写阶段按package.json定位修正，显式测试输入/预期未变；
最终源码已重新运行两模式并保存两组输出。原公开声明和原B oracle均未改。
首次审计将完整第三方源码装入嵌套输出，超出终端返回预算导致JSON截断；
工具错误摘要在归档保留，初轮并行返回未完整收集，不宣称其结果或输出完整。
随后改为只打印来源hash/pin，重跑获得本归档10份完整记录；没有放宽产品断言。

## 未明预期与交接

Q01：L6初始已有idle status，但UI加载按钮以无行作为条件，idle页动作也未列明。
Q02：status命令反馈的rowId是激活行，还是实际命令owner/null。
Q03：同步select抛值是否走同样回调/本地错误和回调异常AggregateError。
完整反例和依据已在主REVIEW_LOG领取条目交A/C；B不从原型选答案，也不代C关闭缺陷。
独立测试提交61b52b75642280b08c257636fd2548175f75d54d后、交接前读到C正式结果：
其C-76与本Q01同一缺口，BVP01已有本人公开API事实支持；不声称尚无生产UI已经死锁。
Q02/Q03仍由A写回唯一DESIGN并经C确认，C的建议方向不擅自当作已定oracle。
本次仅更新报告/矩阵/计划状态；机器证据保持捕获时的“C在审”快照，不回写旧记录。

交A/C：请在契约审查/修订中明确上述三项并给固定受审版本；
本准备结果不能当正式UI冻结或生产开工前置已完成。
其余明确条件按95条矩阵继续转为真实React/浏览器集合，保留本提案和原基线结果。
[本人计划](plans/B-M5-tree-view.md)仅将准备项完成，正式冻结仍未勾选。

## 证据与未执行

[机器证据](m5_b_tree_view_prep.json)，SHA256
**d0a6f3b1c97b3091f155a275d8c5e68502572ce41ba78ce33ad2b3036d565dfe**。
10条完整输出共46062原字节/7200 gzip字节，逐份长度/SHA核验。
另有6份实际测试/原B fixture来源hash及9份依赖/规范来源hash；
源码由独立Git提交保存，不称这些hash记录为完整嵌套源码归档。

未执行React DOM/浏览器/AX/读屏、Core UI桥、Electron、真实大设计、Linux/远端CI/覆盖率/M7。
未重跑无关Core/check.sh，也不引用A/C执行为本人新验收。
本轮不改生产/API/IPC/Schema/C++ ABI/工程格式；首版持久化/恢复/旧版本迁移不适用。
主日志仅追加不提交，原协调/research、A/C计划、只读旧工程/ref保持。
