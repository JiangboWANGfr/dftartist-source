# B41 focus/scroll partial independent freeze

行为依据、六项输入/预期/边界见
[计划](../../../../docs/plans/M5-source-candidates-view-b41-focus-scroll.md)及cases.mjs。

显式设置固定产品副本绝对路径 `HIER_B_PRODUCT_ROOT`；
`HIER_B_BROWSER_TOOLS` 为该副本的web目录（锁定依赖已离线安装）。
在web目录运行：

```sh
node --test tests/independent-source-candidates-view/focus-scroll/facility.test.mjs
node tests/independent-source-candidates-view/focus-scroll/run.mjs --list
node tests/independent-source-candidates-view/focus-scroll/run.mjs --controls
node tests/independent-source-candidates-view/focus-scroll/run.mjs
```

Node设施15项与浏览器5项是测量/真实模型/SourceView前提，**不是候选组件通过**。
六候选DOM缺公开组件或CSS须exit1，0执行/6阻塞/0skip。
不替换候选组件，不读私有DOM class，不patch Promise，不用A自测构造oracle。
每项隔离页面，宿主只消费自己的原Promise；清理观察、React根、模型、SDK、wire、页面、浏览器和server。
15秒watchdog是设施防挂，不是产品超时要求。

滚动不足/候选port不可测/合法裁切被单列fixture-premise阻塞，不能冒称通过。
F06只审实际DOM关联及非空说明，不是完整AX/读屏，也不覆盖空态强关联。
Q1尚未关闭；本轮无UI/Electron/Core纵向完成结论。
