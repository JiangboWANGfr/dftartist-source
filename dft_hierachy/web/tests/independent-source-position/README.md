# B SourcePosition/queryAt independent freeze

规范来源为 DESIGN §6.12、§6.10.3及旧B手算表和HDL。
默认只执行真实公开SourceDocumentModel.queryAt及SourcePositionError；
提案仅显式用于类型控制，不提供运行时fallback。--list不是执行。

```sh
HIER_B_PRODUCT_ROOT=/absolute/fixed/product node web/tests/independent-source-position/run.mjs --list
HIER_B_PRODUCT_ROOT=/absolute/fixed/product node web/tests/independent-source-position/run.mjs
HIER_B_PRODUCT_ROOT=/absolute/fixed/product HIER_BIN=/absolute/fixed/product/core/build-b-review/hier node web/tests/independent-source-position/run.mjs --core
HIER_B_PRODUCT_ROOT=/absolute/fixed/product node web/tests/independent-source-position/verify-types.mjs
# 控制/旧行为，不能记为新queryAt运行时通过：
HIER_B_PRODUCT_ROOT=/absolute/fixed/product node --test web/tests/independent-source-position/facility.test.mjs web/tests/independent-source-position/legacy-regression.test.mjs
HIER_B_PRODUCT_ROOT=/absolute/fixed/product node web/tests/independent-source-position/verify-types.mjs --proposal
```

从B测试树执行，产品自己先构建web；Core来自独立固定产品，不用其它agent的输出。
缺方法或缺导出时非零，planned/实际0/skip0分账，不把缺能力冒作N项语义失败。
run --core 在新入口能力通过之后才检查显式HIER_BIN，要求位于固定产品core目录。
真实链复用原B Core helper和include/宏/多实例原文，预期从原始字节、公开独立句柄及规范而来，
不从A输出或queryAt实际值生成oracle。所有拥有模型/SDK/临时fixture/Core任务都按旧B设施清理。
watchdog只是卡死保护，不是产品时延承诺；不用sleep竞速。
旧SourceDocument完整文本/端点控制必须保留，不能因抽取共用扫描漏检span以外坏代理对。

每例--list有input/expected/basis。手算表的Buffer编码交叉核只是设施，不被任何生产断言当作queryAt替身。
不额外要求返回原型、字段顺序/枚举性或跨调用对象身份；只要求规范四自有数据字段/冻结/正确值。
不冻结message具体措辞，不为错误臆加cause。当前文档错误优先级与零外部探测严格按规范。
返回普通query不可撤销；文档失效后重新queryAt拒绝，并不使先前query或候选模型自动失效。
延迟发起前重查、候选响应绑定、changed文本的展示/Selection/SourceView和自动ready仍属未来宿主。
本轮无UI/Electron、main/preload/L06/L09–11或完整反向导航验收；首版持久化/迁移不适用。
