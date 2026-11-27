# B42 synchronous confirmation feedback

依据DESIGN §6.18.1/3/5和§6.5.4；逐项输入/预期见cases.mjs和
[冻结计划](../../../../docs/plans/M5-source-candidates-view-b42-sync-feedback.md)。

仓库根显式设置绝对路径HIER_B_PRODUCT_ROOT（独立固定产品）和HIER_B_BROWSER_TOOLS（该产品web、原锁工具）。

```sh
node --test --test-reporter=tap web/tests/independent-source-candidates-view/sync-feedback/facility.test.mjs
node web/tests/independent-source-candidates-view/sync-feedback/run.mjs --list
node web/tests/independent-source-candidates-view/sync-feedback/run.mjs --controls
node web/tests/independent-source-candidates-view/sync-feedback/run.mjs
```

Node17设施与浏览器4前提单列，不是两个候选UI通过；缺公开组件/CSS须exit1、目标执行0/阻塞2/skip0。
S02是HTMLElement.click的辅助激活形状，不称trusted设备/读屏/Electron E2E。
只观察原公开方法调用/return/throw，不改Promise、getter或模型行为，Q1仍open。
host消费自己的Promise与Selection订阅，finally卸载/退订/恢复/释放；15秒watchdog不是产品超时。
