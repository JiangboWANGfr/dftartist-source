# B17 runtime补充输入

依DESIGN§6.13及旧§6.6.6/6.10–11、公开VALIDATION标准入口，不读A实现/回归源或自测档定预期。
先独立commit冻结，才运行本新增8模型/23接线设施；原310/46/10不动。

```sh
HIER_B_PRODUCT_ROOT=/fixed/product node web/tests/independent-source-navigation/recheck/coexistence.test.mjs --list
HIER_B_PRODUCT_ROOT=/fixed/product node --test web/tests/independent-source-navigation/recheck/coexistence.test.mjs
HIER_B_PRODUCT_ROOT=/fixed/product node web/tests/independent-source-navigation/recheck/wrapper.facility.test.mjs --list
HIER_B_PRODUCT_ROOT=/fixed/product node --test web/tests/independent-source-navigation/recheck/wrapper.facility.test.mjs
```

8模型：共享SDK同参数合并，Nav或外部Candidates取消/释放仅结算自身，其他消费者完成并保留自身原Reply/文档、SDK存活（4）。
Nav诊断中外部Document/Candidates.clear，以及反方向的诊断中Nav.clear，不成为SDK/模块级全局锁（4）。
诊断getter延用原B明确的公共SDK方法故障装饰器，不称合法wire；取消共享请求实际走真实SDK/Transport。
只要求每个模型保留自己获得的Reply，不假定两个逻辑SDK消费者的Reply必须互为同一对象。
构造失败私有资源清理的完整实现证据仍归C，原310已含SDK订阅抛错，但未把它当完整内部所有权证明。

23接线设施：3正常+5入口×3失败(exit/signal/missing)+2controls目录替代+3非法组合。
model第二步必须带--all；Core带--core；controls聚合不要求一个文件失败后另一个停止。
controls缺任一必需文件或给目录，必须在启动所有子进程前非零，不能Node聚合0测试或另一文件绿掩盖。
仅隔离NODE_TEST_CONTEXT内部标记；保持caller其他env、root覆写、cwd和首败传播。
Core路径是临时可执行marker，只传给stub，不执行真实Core，23不加入产品语义计数。
model缺后一步时允许先整体预检而零子进程，或已完成前置步骤；不强求必须先运行类型stub。
模型15秒/设施子进程10秒watchdog只防挂起，不是SLA；超时释放自有上下文并终止该设施独立进程组。
每个临时目录由mkdtemp取得，finally只删除该校验前缀的自有fixture；保留输出后清理。
不额外要求全权限/符号链接/TOCTOU保证，不碰其它工作树或真实设计；无skip/xfail。
