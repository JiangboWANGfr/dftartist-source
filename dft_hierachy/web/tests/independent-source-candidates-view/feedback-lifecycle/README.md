# B43 callback-session invalidation / latest confirmation

依据DESIGN §6.18.1/3/5。输入/预期见cases.mjs及
[计划](../../../../docs/plans/M5-source-candidates-view-b43-feedback-lifecycle.md)。

仓库根显式设置绝对路径HIER_B_PRODUCT_ROOT（独立固定产品）和HIER_B_BROWSER_TOOLS（其web锁定工具）。

```sh
node --test --test-reporter=tap web/tests/independent-source-candidates-view/feedback-lifecycle/facility.test.mjs
node web/tests/independent-source-candidates-view/feedback-lifecycle/run.mjs --list
node web/tests/independent-source-candidates-view/feedback-lifecycle/run.mjs --controls
node web/tests/independent-source-candidates-view/feedback-lifecycle/run.mjs
```

Node16、浏览器5前提单列，不是三候选UI通过；缺组件/CSS须exit1、0执行/3阻塞/0skip。
全局error/rejection负控只消费已核原身份的两个明确设施事件；目标用例新页面不删除异常记录。
runner另外实际见证两个原生负控pageerror；目标任何pageerror均失败，不preventDefault掩盖默认报告。
不换Promise/装then或catch，不用无事件证明原Promise消费；Q1仍open。
HTMLElement.click为辅助激活形状合成输入，不称trusted设备/读屏或Electron E2E。
