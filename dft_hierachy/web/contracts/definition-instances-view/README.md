# DefinitionInstancesView 有限契约

唯一规范为 [DESIGN §6.25](../../../docs/DESIGN.md)。隔离声明及宿主组合仅供编译，不进入生产 exports，没有替代组件/模型或假状态。使用已接受的 DefinitionInstancesModel、SelectionModel 和 SearchResultsView；明确的 showSelectedDefinition 动作返回原模型 Promise，由宿主消费错误、管理提交反馈和挂载/释放。本目录未实现宿主自动协调器。

```sh
npm --prefix web run check
node web/node_modules/typescript/bin/tsc -p web/contracts/definition-instances-view/tsconfig.json --pretty false
HIER_BIN="$PWD/core/build/hier" node --test web/contracts/definition-instances-view/model-selection-witness.test.mjs
```

18 个类型负例只核接口表达性。真实链见证使用生产 DefinitionInstancesModel/Selection/Tree、SDK/Node/Core 与原 A search fixture/session：查询和显式分页保留定义选择，明确实例确认后才以原 ref 选择/定位；单实例也不自动确认。见证不执行拟议组件，不计 DOM、CSS 包、原生输入/焦点、partial/执行中取消或真实 Electron 验收；B 根据规范独立冻结，不从 A 消费者/见证生成预期。

前序模型已有 B65/C65 接受。新视图对应 C 审/B 有限冻结后直接实现组件、公开类型/CSS 和现有标准门禁，不增加观察、堆、Q1 或跨平台实施前置。原初始能力红、旧树 51 失败及完整 M5 未完成状态保留，实际命令见[计划](../../../docs/plans/M5-definition-instances-view-contract.md)。

C66契约接受/B66有限冻结后已有生产组件、根类型和CSS；本目录仍为历史隔离消费者，生产入口与实际结果见[生产计划](../../../docs/plans/M5-definition-instances-view-production.md)。
