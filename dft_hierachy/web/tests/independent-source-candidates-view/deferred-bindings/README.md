# Deferred original bindings — B40

规范及输入见docs/plans/M5-source-candidates-view-b40-deferred.md及cases.mjs。
使用真实SDK/Nav/Selection、React18.3.1、Chromium和合法controlled Transport；不提供候选组件替身。
调用：HIER_B_PRODUCT_ROOT=<固定绝对路径> HIER_B_BROWSER_TOOLS=<锁定web工具路径> node run.mjs；加--controls仅跑两真实模型/三React调度前提。
facility.test.mjs的14项也必须显式HIER_B_PRODUCT_ROOT，模型缺失不得skip。
六DOM缺组件/CSS时exit1/执行0/blocked6，不当六项通过。D04/D05不是未提交render；本专项不读取或证明组件Promise消费，Q1仍open。
