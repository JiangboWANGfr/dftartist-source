# 首版扁平图与 SchematicView 隔离契约

规范唯一来源：[DESIGN](../../../docs/DESIGN.md) §6.30。
执行范围：[M6-A-04a](../../../docs/plans/M6-schematic-view-contract.md)。

`proposal.d.ts` 给出拟新增的 L6 投影/选择桥接与 L7 视图类型，直接借用现有生产类型。
`consumer.ts` 组合真实 GraphSession/LayoutService/SelectionModel、已有 HierarchyTree 与拟议视图，
展示显式布局、原事实反查和宿主释放顺序。仅严格编译，不存在假运行时或生产根出口。
CSS 子路径在生产实施时加入，当前样例用注释说明，不伪装资源已经发布。

```sh
node web/node_modules/typescript/bin/tsc -p web/contracts/schematic-view/tsconfig.json
```

从仓库根运行；需现有 web 依赖和生产包声明已构建。少量负类型见证只验证签名可表达性，
不等于 B 冻结或 UI/Worker 运行通过。获 C 审和有限 B 冻结后直接进入生产实现。
本轮不增加 helper/观察设施前置、不改历史 oracle。完整 M6 的折叠/标注/demo/包消费尚待后续单元。
