# 固定布局 demo 的有限契约消费者

唯一规范：DESIGN §6.27；执行计划：docs/plans/M5-demo-shell-contract.md。
bridge.d.ts 只声明新 app 的选择/打开/关闭能力，不进入通用包或标准生产构建。
consumer.ts 用真实 `@hier/client`、`@hier/viewmodel`、`@hier/views` 公开出口组合面板，
不实现或执行 demo 生命周期/自动联动，不用它代替独立 B 冻结。

```sh
node web/node_modules/typescript/bin/tsc -p web/contracts/demo-shell/tsconfig.json --pretty false
HIER_BIN="$PWD/core/build/hier" node --test web/contracts/demo-shell/core-composition.test.mjs
```

类型消费者包含有限能力边界负例，`@ts-expect-error` 由严格 tsc 验证。
Core 见证只使用已有生产模型/SDK/Node/Core，不执行新 IPC、UI 或 Electron。
新宿主契约由 C 审/B 一次有限冻结后，直接实现 app 和真实 Electron UI 标准门禁；
已验收组件不重开，也不添加观察/堆/Q1 前置。
