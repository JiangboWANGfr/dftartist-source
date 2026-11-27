# 图来源与成员所有权历史提案

唯一规范是 DESIGN §6.28，执行计划为 docs/plans/M6-graph-source-contract.md。
proposal.d.ts 与 consumer.ts 为隔离编译材料，不进入生产根出口或标准门禁。
它们表达来源替换/清空/释放、异步刷新、共享设计图元和外部命名空间；
此目录不包含运行时。C78 接受/B79 冻结后，A79 已在 @hier/viewmodel 实现 GraphSession；
生产验证见 docs/plans/M6-graph-source-runtime.md；固定735d227已获B81原24/20/1及G25独立通过，
C81已关闭C-105。新布局单元的具体提案见相邻layout-service目录。
布局、折叠、画布和新的 DFT 分析器仍不在本单元。

```sh
node web/node_modules/typescript/bin/tsc -p web/contracts/graph-session/tsconfig.json --pretty false
HIER_BIN="$PWD/core/build/hier" node --test web/contracts/graph-session/sdk-core-witness.test.mjs
```

类型消费者只证明接口可表达宿主流程，负例不代替 B 冻结。
能力见证使用已有 SDK/Core 和原 A search.sv；核 trace 原始身份/位段、
跨查询共享、partial 与取消，明确不执行拟议模型或绘图。
Core/协议仍是设计事实的唯一来源；HAL 参考与后续阶段边界见执行计划。
