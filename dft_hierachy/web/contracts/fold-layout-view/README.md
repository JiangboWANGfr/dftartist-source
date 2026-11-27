# Folded layout / original SchematicView contract consumer

权威行为：DESIGN §6.33；执行状态：docs/plans/M6-fold-layout-view.md。
A97实施后，本目录为严格编译消费者；proposal.d.ts只转发真实生产根，无运行时替代或测试回退。

```sh
node web/node_modules/typescript/bin/tsc -p web/contracts/fold-layout-view/tsconfig.json --pretty false
```

`proposal.d.ts`转发真实LayoutService、SchematicView及获审类型，私有品牌来自生产类。
C97已关闭C-107并接受具体签名，B97另行冻结了独立集合；本消费者只作A的历史表达性回归。

消费链是生产模型 → 真实 FoldedGraphProjection → 新布局签名 → 原组件的新属性分支 →
原成员/精确选择/共享标注。宿主收到 fold intent 后明确发布新投影；布局仍由明确命令触发。
消费者不是可运行 demo；`currentGeometry` 等捕获初始 props 的方法仅针对返回的该次投影，
后续宿主渲染应使用 publish 收到的新 props，不保存本工厂作为全局当前状态。

原18个有限负类型见证保持；C-107补充5个直接/变量spread/React组件入口反例，
旧分支以projection/onFoldChange可选never排除新分支属性，原旧/新合法入口保持可编译。
合计23个负类型见证及正见证属于A自验，不代B独立冻结；修前5处漏检红基线保留。
严格选项沿父配置：strict、exactOptionalPropertyTypes、noUncheckedIndexedAccess、
noEmit，skipLibCheck=false。没有生产依赖或锁变化；生产标准门禁见docs/VALIDATION.md。
