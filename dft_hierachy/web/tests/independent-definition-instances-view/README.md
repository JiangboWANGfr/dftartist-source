# B66：DefinitionInstancesView 有限独立冻结

规范固定60b6cc60a2fef9079ee4da83431c12280dc7ae6a的DESIGN §6.25及明确继承§6.23/6.19、§6.24；Schema7/protocol2/公开声明与原B fixture为oracle。不读A consumer/witness/search.sv/实现diff/自测定预期；必读共享摘要已见，不声称盲读。

## 可验证清单

84浏览器场景逐项id/input/expected/basis见cases.mjs和run.mjs --list：19非法props/品牌/Proxy、1可选undefined、5五态、3原query来源（opaque def/外部选择/单实例不自动确认）、3原InstInfo字段/安全文本/reasons、5空页与complete/partial/next、6明确动作（含partial选择）、7原生输入、3Selection的对象ref/共享def/bits与重复行标记、6借用订阅/替换/卸载、9原state/指针/query/未提交/迟到反馈、8原错误结算、5焦点/Tab/多挂载/局部滚动、诊断/原页内index/释放/真实Core链各1。

- InstInfo五种kind均原样保留，原kind/name/pathText/ref/def/defName/childCount与hasParamOverrides“是/否”、path各段按序可读；不合并共享def/name/pathText或重复ref，不猜body，不枚举扩展。原page+页内index为来源，选择失败保留原query/page/index而非扁平索引。
- query.def为页来源，不追随外部Selection自动load/clear；单实例仍保留定义直到明确选择。只有ObjectSelection.ref相同标记行（含bits/side），定义共享def不标全部occurrence；重复行均可被标记但不改多选/历史。明确选择一项原ref、origin=external，无bits/side，不自动reveal/path/source/属性查询。
- complete空且有next不等于无实例；只有全部complete且末页无next才取尽，partial空/有next/完整前缀保留“不完整”，可明确选已知行但不可加载更多。当前SDK合法complete的reasons为空，基础控制明确拒绝不可达complete-with-reasons，不绕过SDK造state。
- 原最近commit state/query/page/index/会话与手势绑定，publication未React commit、追加页/换query/换模型/未完成指针不能转投；每次query身份变化、clear、卸载/释放撤销旧反馈，A→B→A不复活；同query自身结算不误撤销，错误原值/回调捕获及最近有效动作保持。
- 原生button/Enter/Space/主次键/Ctrl/Shift、焦点回退/外部焦点/Tab离开、多挂载ID和整个region高度/局部滚动；只退自己的两个订阅，不cancel/clear/dispose借用资源。UI只用真实公开模型，不写state/仿组件/第二DTO。

26类型负例见types.ts V01–26，proposal逐字锁固定公开声明，production取真实根。正确消费者先零诊断，再内存去指令逐项对应原行真实拒绝且无范围外诊断。Props/four Command/Failure的原query和select必需page/index、非select禁止page/index、深readonly与unknown/返回边界；运行时可选undefined省略与TS exactOptional分账，void回调允许调用方返回Promise不等于组件await承诺。

3包外输入为实际tarball安装后的root/声明、七CSS入口、React peer及原依赖边界，不用workspace alias；原4包探针是前提，不充新3项通过。新增出口/CSS缺失时实际root/CSS失败和peer通过分开记。

4 Node+1浏览器真实模型+1Core模型基础控制另账，不代84 UI。控制验证Schema五InstKind/partial/重复页、原SDK/模型与释放；控制不挂新View。一个真实UI链用原B core/tests/fixtures/m5/b_tree_navigation.sv的literal plain与公开roots/children.def/ref和独立path.resolve定位，实际DefinitionInstancesModel实例页包含plain；定义选择保留，明确UI行选原plain.ref不额外查询。Core模型控制先核已有链，不把无UI选择算成UI执行；不读取A搜索HDL/见证输出设预期。

## 运行、初始红与资源

Node24，先在自有固定检出原锁安装/Web check；原React18.3.1/esbuild0.25.11/Playwright1.64.1，显式固定HIER_B_PRODUCT_ROOT/HIER_B_BROWSER_TOOLS/HIER_BIN与PATH。Core用B自有同源构建按SHA核，不借A/C移动产物。浏览器技能已读/执行入口不可用，按fallback沿原项目隔离runner，无新设施/账户/外部通信。

```sh
node web/tests/independent-definition-instances-view/types.mjs proposal
node web/tests/independent-definition-instances-view/types.mjs production
node --test web/tests/independent-definition-instances-view/facility.test.mjs
node web/tests/independent-definition-instances-view/run.mjs --controls
node web/tests/independent-definition-instances-view/run.mjs --core-control
node web/tests/independent-definition-instances-view/run.mjs
node web/tests/independent-definition-instances-view/package.mjs
```

先独立commit冻结再跑新增基线。新View/CSS缺失时84 planned/0executed/84blocked/0skip，不叫84语义失败或通过；生产正向缺出口时26负例executed=0，proposal通过另账；3包实际缺能力和原4前提分账。旧模型/视图接受不重开。

原scope负责真实SDK/模型/监听/Promise/Core桥回收，方法观察保持receiver/原Promise/Error；B alias仅在旧scope的构造参数处使用真实DefinitionInstancesModel，有instanceof控制，不改公共运行时。原独立端口/浏览器/HTTP/Core桥/包工具复用，不新建观察机制。watchdog是防挂起、非产品SLA，零unhandled不等于任意then-free/堆/Q1证明。

原Boundary负例由真实Boundary核TypeError或原AggregateError，保留原window.error总数，不按消息/身份/重试次数过滤；普通场景要求无意外全局事件。该旧机制不逐一归因预期Boundary场景的其它全局事件，不宣称其总数0或已全部确证归因；本轮不扩张观察设施。

## 限制、歧义与交接

没有具体规范矛盾时不自行采纳某个实现作正确答案。只做DOM/AX，不代表真实读屏/跨平台/Electron；五InstKind是合法受控页，不冒称真实blackbox/primitive等全设计都已验收。候选宿主自动index.ready/选择后联动、真实main/preload/dft-suite/完整processor_core/M5/M7/远端CI另验；L06/L09–11不得据SDK放行。首版无持久化，工程创建/保存/恢复/迁移不适用。

结果/原流/冻结SHA/未执行项记B计划与共享REVIEW_LOG（仅EOF追加、不提交日志）。对应C审/B有限冻结到位A直接生产新组件/公开根/CSS及标准接线；真实共有修改才回归受影响旧冻结，不新增观察/堆/Q1开工前置，旧树51/C-81/D-03/M6保持原归属。
