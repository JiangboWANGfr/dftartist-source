# SourceCandidatesView 契约准备（A31）

唯一规范为 DESIGN §6.18；本目录只提供隔离声明和消费者，不进入生产 package exports 或标准 UI 门禁。
现有 SourceNavigation/Selection/SourceView 使用实际公开声明，React 使用既有 peer 开发类型；不导入 Node/Electron 类型。

```sh
npm --prefix web run typecheck
node web/contracts/source-candidates-view/verify-types.mjs
```

正例包含宿主组合两个视图、当前导航文档和位置回调；24 个负例逐一移除 expect-error 后要求消费者对应行出现真实语义诊断，
缺模块/缺导出/未使用标记不算类型拒绝。只证明提案类型可表达、旧 SourceView 调用保持；不执行拟议组件、键盘或签发。

下一步交 C 审 DESIGN §6.18、B 独立冻结真实 DOM/动作绑定/原 Promise 观察和包外消费后实施。
现有 B31 六 Q1/八 Core 验证的是已实现 L6 确认，与本提案的 UI 验收分开；不能用类型绿或无 unhandled 代替原 Promise 强观察。

## C-95 / B32-Q2 修订见证（A32）

```sh
HIER_B_PRODUCT_ROOT="$PWD" node --test web/contracts/source-candidates-view/pagination-boundary.test.mjs
```

仅验证真实公开Navigation/SDK在complete+next、partial±next、complete头→partial尾与显式重查的既有行为，
以及公开Schema校验器的已知枚举/未知字段/未知枚举区别；沿用未修改B Transport设施，不提供候选UI替身。
五项是A契约依据见证，不是候选按钮/DOM通过，也不代B补冻C-95或关闭B32-Q1。
生产实现仍待对应完整前置，修订与实际结果见docs/plans/M5-source-candidates-view-c95.md。
