# B83有限布局冻结

唯一规范DESIGN §6.29，C82已接受；独立输入/预期/依据见cases.mjs/types.ts和B计划。
22运行场景、20类型负例/正向、1包外真实Worker链，先提交冻结再跑基线。
无LayoutService/根类型时真实失败或阻塞，不skip，不回退proposal。

```sh
HIER_B_PRODUCT_ROOT=/fixed/product node web/tests/independent-layout/types.mjs --proposal
HIER_B_PRODUCT_ROOT=/fixed/product node web/tests/independent-layout/types.mjs
HIER_B_PRODUCT_ROOT=/fixed/product HIER_BIN=/owned/hier node --test web/tests/independent-layout/runtime.test.mjs
HIER_B_PRODUCT_ROOT=/fixed/product HIER_B_BROWSER_TOOLS=/fixed/product/web node web/tests/independent-layout/package.mjs
```

受控MessageGate只按固定elkjs 0.12.0原生register/layout RPC收发/故障，不执行算法，
不改生产私有计数或调度；仅Node原生mock timers表达宿主deadline，无sleep/新性能SLA。
不将它叫真实Worker。P01另用包外tarball和真实浏览器classic Worker、同源URL/CSP执行ELK。
L22另用原B RTL/真实SDK/Core→GraphSession→受控布局，仅后半段受控，不冒充算法E2E。
来源原24/20/1/G25与所有早期红保持；无堆、画布/annotation/跨平台或D-03代关闭声明。
