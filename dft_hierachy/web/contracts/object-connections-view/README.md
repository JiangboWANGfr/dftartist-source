# ObjectConnectionsView：有限 UI 契约

唯一行为规范是 DESIGN §6.21，实施计划为 docs/plans/M5-object-connections-view.md。
本目录是隔离提案声明与编译消费者，没有运行时组件或生产包出口；消费者不能直接执行。

消费者使用真实公开 ObjectConnectionsModel、SelectionModel、InstancePropertiesModel 和已实现 PropertiesPanel，
演示显式宿主目标、共享选择、两个独立区域的类型组合与信号连接区域的独立使用。
它保留失败的查询目标与实际选择项区别，不新增 SDK 查询路径、端点 DTO 或自动目标协调。

从仓库根运行：

```sh
npm --prefix web run check
node web/node_modules/typescript/bin/tsc -p web/contracts/object-connections-view/tsconfig.json --pretty false
```

15 个 expect-error 类型负例仅证明静态 API 边界，不是独立 B oracle、运行时正数校验、DOM 或纵向验收。
C58已接受本契约、B58有限冻结已完成；A已在生产包实施组件/根出口/CSS和标准接线。本目录仅保留原隔离类型见证，实际运行验收走 docs/VALIDATION.md 生产入口。
生产阶段验证原partial/端点显示、目标与整端点选择、动作/反馈生命周期、包消费及旧实例面板回归。
数据模型已获B57/C57接受；不扩张旧模型、通用观察设施、堆/读屏/跨平台的生产前置。

本目录不改变现有 PropertiesPanel props、生产 API、IPC、Schema、Core ABI 或工程格式，无新增依赖/迁移。
