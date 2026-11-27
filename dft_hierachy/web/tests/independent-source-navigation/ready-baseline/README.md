# B16 ready事件基准有限补冻

依据固定b55f27d的DESIGN§6.13.2–3；原B284/10/46及原红保持，不从A实现/自测或辅助探针构造oracle。
新增26确定性受控Transport/真实SDK/公开Navigation场景，所有id/input/expected/basis可由--list检查。
Q1失败后普通重试保留未涵盖事件、Q2自动pending前一次截取及相邻对照；C-86关闭归C，B只收敛自己的问题。

```sh
HIER_B_PRODUCT_ROOT=/fixed/product node web/tests/independent-source-navigation/ready-baseline/run.mjs --list
HIER_B_PRODUCT_ROOT=/fixed/product node web/tests/independent-source-navigation/ready-baseline/run.mjs
# 原284加本26，未来运行时必须两组都执行；原Core10/类型46入口保持：
HIER_B_PRODUCT_ROOT=/fixed/product node web/tests/independent-source-navigation/ready-baseline/run.mjs --all
HIER_B_PRODUCT_ROOT=/fixed/product node --test web/tests/independent-source-navigation/ready-baseline/facility.test.mjs
```

无fallback/skip/xfail；缺生产公开导出时非零、planned/actual0/skip0分账。
精确数量只计source.resolve，另断文档没有自动重读；不用sleep或毫秒预算，watchdog仅防挂起。
原candidateFinish的await后success断言不用于紧接自动刷新步骤：先捕获SDK调用，再核原Reply曾公开发布，允许await后已合法进入自动pending。
SDK cancelled由合法错误回复触发，不用cancelCandidates替代；后者撤销记录并暂停。
Q2只在H1自动pending监听中注入一次事件，明确SDK尚未发出；多次新事件合并为一次H2，保留H1等待者。
所有句柄completion跟踪结算一次，最终显式请求总数及句柄身份检查防止晚基线掩盖多刷；包装冻结沿原公共不变量。
facility四项只证旧SDK/候选重试和时序可达，不模拟协调、不作26语义验收。

无新API/IPC/Schema/依赖/旧格式变更，不建立UI/Electron、SourceView/Selection、L06/L09–11、D-03(M6)/M7或持久化结论。
原B15可携证据为历史，当前运行时/完整前置结论见新报告及REVIEW_LOG。
