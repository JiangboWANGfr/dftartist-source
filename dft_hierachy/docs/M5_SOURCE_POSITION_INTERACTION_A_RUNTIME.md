# A23：SourceView 位置查询实现与待B复核的时序设施

## 固定交付与范围

最终运行时 **7aea654fe1d04ed2af659d243c518a95afc123ba**（主体3a4bc33103316dd60c87f58b2f47e5cb556fc4be，反馈合并修复7aea654），基线57fb80db5581028549e116e40d3f21b759f9b1b2。
C23已通过§6.15契约；B23冻结87dd0ba、设施修订781a1f2、证据3ebb18c原样导入为d92e7d8、06b3a5b、d33896e。
导入binary/full-index diff及14个最终来源blob逐字核对通过。B冻结/历史档、旧117/28/6保持字节。

实现同一SourceView的可选positionQuery及SourceViewPositionQuery/Failure类型，旧四项props与省略行为保留。
配置验证在旧字段之后；回调只读一次、提交后生效。局部双击/Alt+Enter取得原生DOM UTF-16边界并同步调用宿主。
L6负责合法性/旧文档/候选状态；组件只管命令反馈，不拥有模型、订阅、取消或Selection。
原then单读、立即观察、首次结算/嵌套吸收、卸载/会话/动作失效、冻结失败和onError抛值均沿已审规范实现。
提示保留直接ARIA关系，使用固定空间避免显示/清除时挤动正文；鼠标能力提示不清除已有命令错误。

主要文件：views/src/source-view.tsx、source-position-query.ts、source-dom-boundary.ts及index.ts；
标准run-source-view-tests.mjs新增原B交互门禁；A wrapper设施与source-position-browser补充见证。
本次修改此前只读L7组件以增加可选交互，L0–L6运行时不改。44旧声明不变、2旧声明加新出口、2新增内部声明。
Core API/ABI、protocol2/schema7、IPC、依赖/锁和工程格式不变；首版无持久化，旧工程加载/迁移不适用。

## B冻结的实际结果及问题归属

A实际复跑未实现基线119：38通过/81失败；实现后首跑119：111通过/8失败，skip/blocked均0。
生产类型42通过，不再是缺新API的能力阶段失败。八个失败全部保留，**本单元尚未通过全部门禁或B/C独立验收**。

### 五项trusted输入的同栈标记

B fixture在宿主capture监听器将C.inEvent置true，并queueMicrotask置false，locate读取该布尔值。
真实浏览器输入中，前一个原生监听器返回后可能执行微任务，之后才进入同一事件的后续同步监听器。
因此该标记测量了capture回调栈，而非“是否仍在处理同一原生事件”。

可复现命令（无SourceView）：

```sh
node web/tests/source-position-browser/run.mjs controls
```

Chromium156实际记录：native和React的dblclick/Alt+Enter共四次均为
capture → capture-microtask → 同步command；command处标记false，但isTrusted=true、eventPhase为2或3。
不依赖产品代码或新增查询行为，普通原生同步listener也遭同样判定。
生产补充见证在locate内部记录当前eventPhase=3及正确event type、原document/offset，三缩放下双轴滚动鼠标和反向键盘通过。
这是A证据，不是把B五红改成五绿。建议B自行采用能区分同步/延迟调用的原生事件见证，并提供延迟调用负向对照。

### 三项提示的React提交时机

原B鼠标缺API、下一动作清错误、鼠标提示后清理三例，在dispatchEvent返回后立刻读DOM，未等待React提交。
同一controls命令的无SourceView普通React按钮也复现：同步dispatchEvent返回时仍是旧DOM，下一浏览器评估时才完成插入/删除。
本实现使用React状态和布局提交，不引入ReactDOM强刷依赖、不直接修改React拥有的提示DOM。

补充实际产品回归：

```sh
node web/tests/source-position-browser/run.mjs product
```

它等待实际提示DOM提交；验证双提示保留、下一有效动作清理两者、源码text和正文rect/scroll完全不变，另核外部DOM修改拒绝。
建议B明确区分同栈locate要求和React渲染提交，再独立决定是否修订设施；A不修改DESIGN规范、原冻结预期或B报告取绿。

## 验证与限制

收尾自查补修一个内部反馈合并边界：异步失败保留期间出现的原生鼠标提示；鼠标提示更新保留待render的回调AggregateError。
新增A定向用例在3a4bc33旧dist上于“先发鼠标提示后拒绝”共同可见条件失败（30秒设施watchdog），后续回调异常例未到达；
重建7aea654后八组全部通过，包括两种顺序共存与回调异常送宿主边界。旧构建与完整失败输出保留，不改B输入。
Core与L0–L6不变；完整check.sh/independent在3a4bc33运行，最终修复另跑web check及SourceView model/package门禁。

本轮详细命令、耗时、完整双流、Core三配置日志、来源/保护审计及原红保存在
[机器证据](m5_source_position_interaction_runtime_a_verification.json)。实际命令/耗时/分项结果见[运行时计划](plans/M5-source-position-interaction-runtime.md)与REVIEW_LOG交接。
设施对照不挂产品；补充产品八组不替代B119，不与B计数累加。模型4项使用真实L6/SDK和受控Transport，不是Core。
旧门禁和标准完整入口的实际执行/短路分别记录；不把构建通过或A补充通过称为整轮全绿。
真实main/preload/Electron UI→Core、候选确认→Selection、系统剪贴板/读屏、其它浏览器/OS、Linux/真实设计规模、M7及远端CI未执行。
没有新增生产依赖，没有旧工程/ref写入；REVIEW_LOG只追加不提交。

交B：先独立复核两类设施证据，保持原119/42/包2及旧输入，再在固定实现上完整复验。
交C：检查提交后身份、原Promise观察/解析、DOM原始边界、提示几何、错误回调重入与可选兼容；问题关闭权仍属提出方。
此阶段不推进候选确认或其它新实现单元，M5整体未完成。
