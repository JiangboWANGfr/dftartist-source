# SearchResultsView 历史隔离契约消费者

唯一行为规范为 [DESIGN §6.23](../../../docs/DESIGN.md)，执行记录见[计划](../../../docs/plans/M5-search-results-view-contract.md)。本目录提供拟新增的L7声明与可编译宿主表单组合；C62接受/B62冻结后已有生产组件、根出口和CSS，见[生产计划](../../../docs/plans/M5-search-results-view-production.md)；本目录保持历史提案，不替代生产门禁。

consumer.ts使用真实@hier/viewmodel类型、现有SelectionModel和隔离SearchResultsView声明。宿主保留文本草稿，明确提交原text/kinds/scope；组件负责结果展示与明确分页/对象或定义选择。此历史消费者只编译，不运行组件，不计UI/DOM验收。

```sh
npm --prefix web run check
node web/node_modules/typescript/bin/tsc -p web/contracts/search-results-view/tsconfig.json --pretty false
HIER_BIN="$PWD/core/build/hier" node --test web/contracts/search-results-view/model-selection-witness.test.mjs
HIER_BIN="$PWD/core/build/hier" node --test web/contracts/search/sdk-core-witness.test.mjs
```

三个A见证实际使用已接受的SearchModel、SelectionModel、SDK/Node Transport和Core：六类原命中/同名port+signal选择、明确追加页保留原前缀和选择、定义地址与四occurrence。借用模型先dispose，SDK随后关闭并核Core真实退出。沿用原A search.sv与会话清理；不是新造model/transport、生产组件或B独立oracle。

18个类型负例逐项去除指令核真实诊断，正向消费者零诊断。其范围为公开类型可组合性；运行时readonly/快照、输入、DOM、焦点、过期手势及原Promise反馈由对应生产冻结集合验证。B独立从DESIGN和fixture定预期，不以本目录的自测反推结果。

无生产依赖、Core/IPC/Schema/工程格式变更。真实Electron/dft-suite、全M5、读屏/跨平台/规模及旧树51历史失败分账；首版无持久化迁移。
