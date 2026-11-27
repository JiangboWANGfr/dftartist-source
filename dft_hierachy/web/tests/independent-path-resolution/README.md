# B68：路径定位模型和结果视图有限独立冻结

唯一行为依据为固定610e405的DESIGN §6.26及明确继承§6.24/6.25/6.9、Core路径规范与Schema7/protocol2。必读A/C摘要已见，不声称盲读；未取A consumer/witness/实现diff/详细自测档作oracle。

## 有限验收与输入

58模型场景见model-cases.mjs逐项id/input/expected/basis：无自动查询/SDK ready与释放错误、11非法shape/字段及快照、6原文本（空/空白/点/斜杠/转义终止空白/疑似ref）、自有descriptor/Get顺序/一次投影/扩展忽略/抛值cause/dispose和重入优先级、捕获冻结query；原单Reply/数组/顺序重复/complete和partial各零一多结果、同目标pending原Promise/成功no-op、cancel/clear/replace/reload/dispose及迟到结果、错误重试/共享SDK、独立订阅/通知顺序/监听异常/重入/释放接管/Promise listener、原错误诊断和循环共享数据/dataIssue/旧回复可读。只冻结自己的包装，不要求额外冻结或改写SDK原对象；没有pages/loadMore或假分页。

83浏览器场景见cases.mjs：19非法props/品牌/Proxy、可选undefined、五态、5原查询文本/外部选择/单结果确认、原ref数组/安全文本/理由、complete空和partial零/多结果、5显式动作、7原生输入、3选择命名空间/bits/重复标记、6借用生命周期、9旧state/query/reply/手势与反馈、8异常路径、5AX/焦点/Tab/高度/滚动，诊断/原reply+index身份/释放/1真实链各1。每项沿原真实SDK/模型/Selection，不写state或仿组件。单结果不自动选择，查询保留宿主原text；路径不在客户端解析/trim，结果不查元数据或自动reveal，定义选择不标对象；选择原reply.result[itemIndex]且origin=external，无bits/side。

40类型负例V01–40覆盖构造/查询/无分页/只读/五态联合/错误码和View props/Failure/原reply+index/unknown/exactOptional。types.mjs proposal只把新两包入口映射到公开隔离声明并转发真实旧viewmodel声明；proposal.d.ts的规范部分与固定公开声明一致，末尾单一export用于编译组合而非产品新增API。production始终映射真实根，先正向0诊断，再移除标记按原行核40真实拒绝，无范围外诊断。void回调允许宿主返回Promise不意味着组件await承诺。

3外部包case为真实tarball安装后的模型+视图根/严格外部消费者、八CSS（原七保留）、React peer/原依赖闭包；原4包探针只作前置，不计新3。路径模型根不能依赖React/Node/Electron，既有层次门禁随Web check核。

## 控制与运行

3 Node基础控制仅原Schema/SDK单Reply/Selection；core-control.mjs另1原SDK/Core控制用原B LF fixture的literal b_sd_top/left及原children独立ref。它们不构造拟议模型、不是模型或UI通过。浏览器真实新模型与Core模型fixture控制各1，缺模型时能力门禁0执行/1阻塞，不作为基础工具绿。

真实UI链用原core/tests/fixtures/m5/b_tree_navigation.sv：roots/children定位literal plain的权威ref，实际PathResolutionModel查询b_tree_top/plain，UI保持原定义选择直到明确原ref确认，无隐式查询。Core模型控制使用同一原链而不挂View。真实Core通常complete，合法partial只由受控SDK输入提供，不据此声称Core partial/执行中取消时延。

使用Node24，显式HIER_B_PRODUCT_ROOT/HIER_B_BROWSER_TOOLS/HIER_BIN及PATH，先原锁安装/Web check，先独立冻结commit再执行：

```sh
node web/tests/independent-path-resolution/types.mjs proposal
node web/tests/independent-path-resolution/types.mjs production
node web/tests/independent-path-resolution/model-run.mjs
node web/tests/independent-path-resolution/run.mjs
node web/tests/independent-path-resolution/run.mjs --controls
node web/tests/independent-path-resolution/run.mjs --core-control
node web/tests/independent-path-resolution/package.mjs
node --test web/tests/independent-path-resolution/facility.test.mjs
node web/tests/independent-path-resolution/core-control.mjs
```

缺公共模型/View/CSS时模型58/UI83及两模型控制都是能力红/零执行/blocked/0skip，不是语义失败或通过。缺生产正向出口时40负例0执行；proposal通过单列。包根/CSS缺失的实际失败和peer通过分账。SDK4基础控制绿不充新增模型/UI。

## 原工具、资源和边界

harness沿原SourceCandidates ownership scope；public-model沿原PropertiesPanel scope，只替换真实公开构造与单次path.resolve方法/Reply接口，原receiver/Promise/Error保持，原清理负责模型/SDK/监听/Promise/Core bridge。不修改旧scope/工具、不造假页或state，临时路径适配非新增观察设施。

browser技能完整读取后内嵌入口未提供，按fallback沿原隔离runner。原Boundary负例核TypeError/AggregateError并保存window.error原总数，普通case要求无意外全局事件；未逐事件归因，不称全局全零或全部确证归因。watchdog防挂起非SLA，零unhandled非任意then-free/堆/Q1证明。

无已证实规范矛盾，不自行取某实现作答案。对应C审/B有限冻结后直接实现整个模型+视图、出口/CSS及既有标准接线，无另轮数据→视图契约。宿主表单/自动联动/Electron/main/preload、L06/L09–11、完整processor_core/M5/M7/读屏/跨平台/CI另验；首版无持久化，工程保存恢复/旧版迁移不适用。旧树51/C-81/D-03/M6不由此关闭。结果写B计划与REVIEW_LOG，只EOF追加、不提交共享日志。

## B70：已接受的构造兼容澄清

上述B68冻结与B69失败保持历史来源。C69正式接受、固定c566b726的DESIGN §6.26.1已落实：构造传播公开snapshot读取实际抛出的原异常；已取得快照在SDK dispose后仍可读，不额外保证SDK活跃。因此仅修订原PRM-constructor-client-disposed，输入仍ready→dispose，核原快照绑定、零构造查询/订阅，以及首次load保留SDK原disposed错误身份/failed诊断且零wire请求。没有用探测查询制造错误oracle；原not-ready同步错误身份要求、其余57场景和83UI/40类型/3包/6控制不变。不增加类别或观察设施，原51/58、57/58及本轮修订前失败保留。实际冻结与结果见docs/plans/B-M5-path-resolution-constructor.md；A68-PATH-CONSTRUCTOR-01由提出方A确认关闭。
