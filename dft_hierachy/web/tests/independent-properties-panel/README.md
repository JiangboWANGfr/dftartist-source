# B PropertiesPanel：实例属性有限冻结

依据固定c9f662e的DESIGN §6.19（C54已接受）、§6.9/6.5和公开声明；没有读取A消费者/实现/自测生成预期。
有限集合为69个浏览器输入（68受控真实模型、1真实SDK/Core纵向）、30个独立严格类型负例、3个外部tarball包输入。
cases.mjs逐项列输入/预期/依据，fixture.jsx执行原行为断言；fixture controls与产品语义分账。

## 执行

先在独立固定产品P按原锁安装并运行web check。T为已有C76浏览器工具目录（含原精确React18.3.1/
DOM18.3.1/esbuild0.25.11/Playwright1.64.1），不得混用移动主树产物：

```sh
HIER_B_PRODUCT_ROOT=P node web/tests/independent-properties-panel/types.mjs proposal
HIER_B_PRODUCT_ROOT=P node web/tests/independent-properties-panel/types.mjs production
HIER_B_PRODUCT_ROOT=P node --test web/tests/independent-properties-panel/facility.test.mjs
HIER_B_PRODUCT_ROOT=P HIER_B_BROWSER_TOOLS=T node web/tests/independent-properties-panel/run.mjs --controls
HIER_B_PRODUCT_ROOT=P HIER_B_BROWSER_TOOLS=T HIER_BIN=B固定自有Core node web/tests/independent-properties-panel/run.mjs
HIER_B_PRODUCT_ROOT=P HIER_B_BROWSER_TOOLS=P/web HIER_B_NPM_BIN=/opt/homebrew/bin/npm node web/tests/independent-properties-panel/package.mjs
node web/tests/independent-properties-panel/run.mjs --list
```

proposal只映射隔离声明，production只取真实P生产声明；去除每个expect-error后核其行上的真实诊断。
缺导出时能力红、0语义执行/0skip，保留计划输入和未执行数；不是69条都实际失败。
浏览器旧B Core桥/原SV原样复用；Core bin必须由B自有固定源码构建且先核来源。不提供则不能称真实链已执行。
包测试完整运行原B candidate包门禁，用它创建的真实隔离consumer，不改旧输入；再实际native import新根、
编译新类型、解析新/旧CSS及核peer。保留旧原输出，不把旧4个探针算作新3个通过。

## 权威与有限边界

模型状态/Reply只由真实SDK和受控合法wire发布；方法观察保持receiver、参数、原返回/原抛值，不替换实现，
不代产品消费Promise。只用公开load/cancel/clear/状态/订阅、原DOM/native输入，watchdog只防测试死锁。
L6内置拒绝处理使零unhandled不能证明L7原Promise立即消费；本集合不假称完成旧L06/L09–11或Q1强观察。
原始window.error/unhandled计数保留。正常无边界错误路径必须零意外事件；预期TypeError/回调AggregateError
由真实Boundary核原错误及零副作用，原始全局错误另报、不按对象身份/类型/消息或固定React重试次数豁免。
这不是已解决通用异常归属的声明，不改树51条原红或A51-TREE-OBS-01。

DOM字段的查找仅以region/table/原生button和规范任务文字为依据；无需固定CSS类或组件内部私有状态。
可读布尔/枚举和字段标题不要求唯一拼写；生产DOM若只变语义等价标签，须记录纯定位/可读标签适配，不能改原数值、
顺序、未知/缺失/false、ref或操作预期。当前集合不是所有列/所有语言/所有输入交错的完备证明。
实际读屏、跨平台、成本/堆/大设计不是新实施前置。首版无持久化，Electron/完整PropertiesPanel后续单元另验。

## 单列歧义（不以A未来实现裁决）

- 回调中同步卸载/clear/换模型后再抛值时，撤销本地反馈与下一render聚合的优先级，本节未细化；不冻结该交错。
- 被拒旧DOM动作是否清除既有本地反馈，本节未细化；本集合只核零模型调用，不为该输入额外规定反馈清除。

已明确的同会话更换回调仍把原动作失败交原已提交回调；与旧候选视图规则不同，不复制旧撤销判据。
