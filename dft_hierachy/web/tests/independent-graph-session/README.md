# B79 独立图来源冻结

依据 C78 接受的 DESIGN §6.28，24 个运行时场景/20 个公共类型负例和正向消费者/
1 条真实 SDK/Core 输入控制；每个输入、预期、依据见 cases.mjs、types.ts 与 B 独立计划。
不读取 A 的消费者/见证来定 oracle，不实现或内置替代 GraphSession。

先在独立固定产品树安装并编译已有公开包；三个命令均从 B 测试树运行，Node24：

```sh
HIER_B_PRODUCT_ROOT=/absolute/fixed-product node web/tests/independent-graph-session/types.mjs --proposal
HIER_B_PRODUCT_ROOT=/absolute/fixed-product node web/tests/independent-graph-session/types.mjs
HIER_B_PRODUCT_ROOT=/absolute/fixed-product HIER_BIN=/absolute/owned/hier node --test web/tests/independent-graph-session/runtime.test.mjs web/tests/independent-graph-session/input.test.mjs
```

proposal 只检获审隔离声明；默认 production 只检实际 @hier/viewmodel 根声明，不回退 proposal。
运行时只消费实际生产 GraphSession/GraphSessionError；缺出口失败而非 skip，不将入口失败计作语义执行。
input 控制本身不执行 GraphSession，不能以它通过冒充 G24。后续实施复验用完全相同冻结输入。
受控来源 DTO 仅是结构/事务输入，真实 Core 来源由本目录原创 HDL 单独检验。

复用原 B SDK/ControlledTransport/清理作用域；异步提供者自有 deferred，无 sleep，
watchdog 是测试安全边界，不是取消性能 SLA。仅进程控制拥有真实 Core 子进程并正常关闭。
不触碰 M5 原冻结，不加布局/DOM/Worker/堆/读屏/跨平台前置，也不关闭 D-03/M6 整体。

C80实际C-105缺陷另有单条opt-in `node web/tests/independent-graph-session/c105.mjs`，
仍给HIER_B_PRODUCT_ROOT，原24/20/1不变。小型无环共享结构相等和非等控制只调用公开来源；
外置原20秒安全watchdog避免已知同步卡住测试进程，不是新增产品响应SLA/通用性能门禁。
只终止本测试拥有且不启动Core/外部任务的Node worker，不建立后台定时或观察设施。
