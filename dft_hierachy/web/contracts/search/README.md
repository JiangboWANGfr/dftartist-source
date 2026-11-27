# SearchModel：隔离分页契约

唯一规范为DESIGN §6.22，执行计划为docs/plans/M5-search-contract.md。
本目录保留历史提案声明、不可执行宿主消费者和既有SDK/Core能力见证；C60契约接受/B60有限冻结后，A60已实现@hier/viewmodel根SearchModel。生产门禁和待独立验收范围见docs/plans/M5-search-runtime.md。
连接视图已获B59/C59有限验收，其helper维护不成为搜索前置。

```sh
npm --prefix web run check
node web/node_modules/typescript/bin/tsc -p web/contracts/search/tsconfig.json --pretty false
HIER_BIN="$PWD/core/build/hier" node --test web/contracts/search/sdk-core-witness.test.mjs
```

consumer.ts含20个expect-error类型负例，运行时输入限制仍须生产验证。selectKnownHit仅展示显式命中按kind区分def/ref，
不证明迟到点击/目标代次/Selection协调或定义多实例选择；这些仍属后续交互单元。
SDK/Core见证使用本A HDL、真实子进程和公开SDK，记录二者SHA与会话退出；不执行提案模型，不能代替B冻结或新模型状态验收。
继承Core字面文本/大小写/空kinds/子树作用域及分页规则，不将旧客户端glob或trim逻辑移植到新模型。
本单元不增加索引、查询缓存、自动index.ready刷新、UI或持久化；生产API为兼容新增，IPC/Schema/ABI/工程格式不变，无新增依赖。
