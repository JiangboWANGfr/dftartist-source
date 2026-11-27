# 路径定位模型与结果视图的有限隔离契约

唯一规范为 DESIGN §6.26，执行计划见 docs/plans/M5-path-resolution-contract.md。
path-resolution.d.ts 是隔离提案，不进入生产根导出或标准门禁。
consumer.ts 编译宿主文本提交、借用 Selection/Tree、明确选择后 reveal 与公开只读类型。

拟议模型只保持一份原 Reply<ObjectRef[]>，视图只显示该回复并转发明确选择。
路径语法、转义、顶层歧义、排序和对象身份由 Core 负责；单结果也不自动确认。
模型和结果视图合为同一有限实施单元，对应 C 审/B 冻结后直接生产，不扩张观察/堆/Q1 前置。

验证（仓库根，Node24、自有 Core）：

```sh
npm --prefix web run check
node web/node_modules/typescript/bin/tsc -p web/contracts/path-resolution/tsconfig.json --pretty false
HIER_BIN="$PWD/core/build/hier" node --test --test-reporter=tap web/contracts/path-resolution/sdk-core-witness.test.mjs
```

26 个类型负例仅核提案表达性。真实能力见证复用原 A search fixture/session，
调用现有 SDK/SelectionModel/TreeModel，不执行拟议模型或新视图；
真实 Core 页是否 partial、取消方式和关闭结果按实际报告。
不代 B oracle、DOM/包、Electron、规模或整阶段验收。
