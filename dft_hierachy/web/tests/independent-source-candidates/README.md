# Agent B SourceCandidates 独立冻结

唯一 oracle：DESIGN §6.11 / §5.5.6 及显式继承的生命周期/诊断条款。
C 契约批准与本测试冻结不是同一事实；提案尚待批准时只能叫草案输入冻结。
不读 A 实现、消费者、类型负例或自测生成预期。复用的 Wire/观测/原 HDL 来自旧 B 冻结。

显式指定固定产品目录；默认只接受真实公开 @hier/client / @hier/viewmodel。
没有候选模型导出时必须非零；planned 与 executed 分开、skip=0，不提供假模型。

```sh
HIER_B_PRODUCT_ROOT=/absolute/fixed/product node web/tests/independent-source-candidates/run.mjs --list
HIER_B_PRODUCT_ROOT=/absolute/fixed/product node web/tests/independent-source-candidates/run.mjs
HIER_B_PRODUCT_ROOT=/absolute/fixed/product HIER_BIN=/absolute/fixed/product/core/build-b-candidates/hier node web/tests/independent-source-candidates/run.mjs --core
HIER_B_PRODUCT_ROOT=/absolute/fixed/product node web/tests/independent-source-candidates/verify-types.mjs
# 以下只是测试设施和隔离提案声明控制；不是生产模型通过/契约批准：
HIER_B_PRODUCT_ROOT=/absolute/fixed/product node --test web/tests/independent-source-candidates/facility.test.mjs
HIER_B_PRODUCT_ROOT=/absolute/fixed/product node web/tests/independent-source-candidates/verify-types.mjs --proposal
HIER_B_PRODUCT_ROOT=/absolute/fixed/product HIER_BIN=/absolute/fixed/product/core/build-b-candidates/hier node web/tests/independent-source-candidates/sdk-controls.mjs
```

从 B 测试树运行以上脚本，cwd 不需在产品目录；产品目录自己构建 TS 和 Core。
--list 输出每例输入/预期/依据，不执行产品；type --list 同理。
runtime 是真实模型→真实 SDK→公开可控 Transport，不是 Core/Electron；core 才是独立实进程链。
SDK controls 只是同一原始 fixture 验证的底层能力，不冒充新模型。
每例清理所有模型/任务/监听；真实 Core 先关模型再 SDK/进程并断言 exited={code:0,signal:null}；
临时文件只在 mkdtemp 所有权目录创建/删除。watchdog 是 B 卡死保护，不是产品超时承诺。
生产无额外私有测试 hook；同步 throw/诊断 Proxy 用公开方法故障注入，不能称为合法 wire 数据。
原 Promise 行为在 OS 子进程检验，文件路径用 fileURLToPath，支持空格/中文。

当前规范边界不自行补 oracle：

1. 保证页元素 Reply 身份，不要求跨状态 pages 数组包装相同身份；无发布时 state 身份保持。
2. 输入读取和诊断读取的 dispose/cause 明确；不臆定恶意回复 getter 的精细顺序。
3. 无 observer 错误时 stale_cursor 的 loadMore 拒绝同一原错误；若旧任务曾有 observer 聚合，
   重复 loadMore 是否再次聚合须单独澄清，不把一个实现当答案。
4. 构造“先读 snapshot”不扩张为 getter 恰好一次。
5. UInt 最大值取权威 Schema 9007199254740991，PageLimit 为 2147483647；
   L6 语法合法不等于 Core 坐标存在，不从 C++ 的 uint32_t 猜 L6 边界。
6. 不强迫 idle.pages 在类型层成为空元组，公开声明为 readonly 页数组。

不验 UI/Electron、当前文档发布身份/changed 禁点/UTF16 转换、index.ready 自动刷新、
Selection/实例候选协调或 SourceView。首版无会话持久化，工程加载/迁移不适用。
