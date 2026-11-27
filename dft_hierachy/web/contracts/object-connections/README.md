# ObjectConnectionsModel：隔离数据契约

行为唯一规范为 DESIGN §6.20；执行计划是 docs/plans/M5-object-connections-contract.md。
本目录包含提案声明、宿主消费者和现有 SDK/Core 查询能力见证，没有替代模型或生产导出。
实例 PropertiesPanel 已获 B55/C55 接受；本数据契约已获 C56 接受/B56 有限冻结。生产模型已进入 @hier/viewmodel，标准门禁见 docs/VALIDATION.md；本目录保留历史声明与能力见证，不代生产验收。

从仓库根运行，使用已有锁和 Node 24：

```sh
npm --prefix web run check
node web/node_modules/typescript/bin/tsc -p web/contracts/object-connections/tsconfig.json --pretty false
HIER_BIN="$PWD/core/build/hier" node --test web/contracts/object-connections/sdk-core-witness.test.mjs
```

消费者含 16 个 expect-error 类型负例。number 的安全整数/正宽度限制属于运行时验证，不能用 TypeScript 数字类型证明。
查询见证使用真实 SDK、子进程 Core 和本目录 A fixture，覆盖原位段、端口 side、local/hier、常量/空连接和 partial。
三查询能力不等于新模型的任务调度、原子发布、取消或独立 B 验收；B 从 DESIGN 独立给出预期。
所有会话由测试拥有并释放，记录 Core/fixture SHA；HIER_BIN 指向本仓库构建产物，复用不计为本轮新构建。

没有新增依赖、IPC/Schema/ABI/工程文件变化，也不变更当前 PropertiesPanel props。生产阶段复用已有 L6 任务与诊断代码，
模型/根类型与 B 原冻结已接标准门禁，后续推进连接展示。partial 不改写成 complete 或失败，也不自动重试。
