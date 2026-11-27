# LayoutService 隔离契约

唯一规范：[DESIGN §6.29](../../../docs/DESIGN.md)。
执行计划：[M6-layout-contract](../../../docs/plans/M6-layout-contract.md)。

proposal.d.ts 声明拟议 API，consumer.ts 用生产 GraphSession 类型表达宿主组合。
本目录没有 LayoutService 运行时，不进入生产根出口、npm 依赖或标准门禁。
10 个 @ts-expect-error 只检查接口表达性，不是 B 独立类型 oracle。

```sh
node web/node_modules/typescript/bin/tsc -p web/contracts/layout-service/tsconfig.json --pretty false
node web/node_modules/prettier/bin/prettier.cjs --check --print-width 100 web/contracts/layout-service
```

生产将直接采用固定 elkjs 0.12.0 的 API 和真实 Worker 产物。
workerFactory 负责宿主 URL/CSP 下创建独占 Worker，timeoutMs 是宿主明确选择的截止时间，
不暗定 M7 性能预算。参考 D 已有真实 Worker 研究，不把其执行归为本提案或产品验收。
当前材料不证明包外 Worker 装载、取消、路由、浏览器交互或完整 M6 已实现。
