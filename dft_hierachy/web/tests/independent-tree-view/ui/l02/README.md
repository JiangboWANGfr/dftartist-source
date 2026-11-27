# L02 独立补充冻结（不是原 140 的改写）

C 已于 REVIEW_LOG 的 B-UI-ADAPTER-01 批准此窄适配；旧申请/coverage 中 pending 字样属于历史。
规范仍是 DESIGN §6.7.3；不借 A 实现、自测或 C 探针定义 oracle。原 140 输入/预期/报告保持原字节。

42＝七 raw × 两真实公开命令 × 三 callback 模式；另六晚会话例，共 48 个生产浏览器输入。
`--list` 逐项列输入、预期、判断依据和限制，独立保存。不能把 L6 AggregateError 内层值计为直接 raw。
同步出口先真实 select 提交再 throw；异步先真实 loadRoots 成功再由**新 Promise**拒绝。
真实委托先失败则原样保留；新 Promise 不是 L6 原 Promise 或实际 Core 错误链。
未知 raw 从不越 JSON 边界，仅在浏览器内 Object.is 后输出安全标量；Proxy 所有探测 trap 必须零。

使用 Node 24，B 本人已固定/构建的源码；本目录不会安装依赖或写产品源码。

```sh
export HIER_B_PRODUCT_ROOT=/absolute/B/fixed/source
node --unhandled-rejections=throw --test --test-reporter=tap web/tests/independent-tree-view/ui/l02/adapter.test.mjs
node web/tests/independent-tree-view/ui/l02/run.mjs --list
node web/tests/independent-tree-view/ui/l02/run.mjs --self-check
node web/tests/independent-tree-view/ui/l02/run.mjs
```

20 个 Node 控制与 14 个真实浏览器 SDK/L6 控制只校验 B 适配能力；不挂假/生产 HierarchyTree，不计 L7 通过。
无 view 原型或重写反馈处理算法。默认入口只挂实际生产导出，缺出口必须 1、48 计划/0语义/0skip。
没有 silent skip/xfail 或环境变量自我授权。将来组件交付后才实际跑 48 条语义，不用冻结库存推断通过。

select 从真实带 forward 分支的历史开始；成功提交后保留新选择/回退前值/前进新值。
同步 callback 核调用栈退出后的微任务 checkpoint 与通知深度 0，不冻结 DOM 事件冒泡、CSS 或微任务内部链长度。
回调再抛 undefined 核 AggregateError 两个真实 entries，顺序/身份严格；absent 固定可见“操作失败”。
roots status 真实成功后消失，反馈仍指原 RowId。晚会话 select 由宿主真实 listener 排队的微任务先失效会话；
loadRoots 在公开 Transport 持有回复时失效会话再释放，成功提交仍保留。

每例 finally 恢复原 descriptor、自有 Promise 结算并释放模型/SDK/page；外层独立尝试 page/browser/server 清理及端口重绑。
零全局 unhandled 不等原 Promise 的 view-owned 处理；L09–11/C77 限制及 L06 强观察、Electron/AX/读屏保持另列。
新 metadata 仅关联 L02，以及对应 absent/capture/throw 的 L03/L04/L05；不是 L07 原观察者 AggregateError 或 L08 生命周期取消测试。
没有实际 Electron IPC 或新工程持久化/旧迁移/计划编辑 undo-redo。此集合当前未加入产品标准入口，不擅自改 A 的 package 接线。
