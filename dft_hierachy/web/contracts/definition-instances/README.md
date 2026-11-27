# DefinitionInstancesModel 有限契约

唯一规范为 [DESIGN §6.24](../../../docs/DESIGN.md)。声明与消费者只供编译，不进入生产根出口，也没有替代模型或假实现。类型复用现有 SDK/生成的 def.instances/诊断类型，使用严格可选属性与深只读页。

```sh
npm --prefix web run check
node web/node_modules/typescript/bin/tsc -p web/contracts/definition-instances/tsconfig.json --pretty false
HIER_BIN="$PWD/core/build/hier" node --test web/contracts/definition-instances/sdk-core-witness.test.mjs
```

消费者的 18 个类型负例与显式选择示意只验证接口表达性，不能验证运行时的状态、手势、过期动作或资源清理。DefRef/ObjectRef 保持原生成的 opaque string 类型；类型系统不能拒绝所有语义上错误的裸字符串，存在性/地址种类由 Core 判定。

真实能力见证复用已有 A search fixture/session，只调用已接受 SearchModel、SelectionModel、TreeModel 及现有 SDK/Core；覆盖多实例原页、明确选择后 reveal、单实例仍保持定义选择、跨定义游标拒绝及预取消后的会话可用。它不是新 DefinitionInstancesModel、候选 UI 或 Electron 验收；partial/执行中取消/迟到响应等新模型边界由 B 依据规范有限冻结。

C64接受契约/B64有限冻结后，A64已实现生产模型及标准门禁；公开入口位于 @hier/viewmodel，复用既有 PagedQueryModel/QueryDataModel 与输入边界，见[生产计划](../../../docs/plans/M5-definition-instances-runtime.md)。本目录仍是历史隔离声明，未变成另一个运行时。旧 B 集合、初始缺能力红保留。
