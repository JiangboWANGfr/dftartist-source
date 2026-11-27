# Agent B：§6.17 独立冻结

依据与范围见 [B ExecPlan](../../../docs/plans/M5-source-confirmation-b-freeze.md)。
cases.mjs 是输入/预期/依据的唯一可执行清单；--list 只列举，不执行。
所有被测对象均为固定 HIER_B_PRODUCT_ROOT 的真实公开导出；没有确认替代实现或生产兜底。

运行（Node24；固定产品先 npm ci/check）：

```sh
HIER_B_PRODUCT_ROOT="/absolute/fixed/product" node web/tests/independent-source-confirmation/run.mjs --list
HIER_B_PRODUCT_ROOT="/absolute/fixed/product" node web/tests/independent-source-confirmation/run.mjs
HIER_B_PRODUCT_ROOT="/absolute/fixed/product" node web/tests/independent-source-confirmation/verify-types.mjs
HIER_B_PRODUCT_ROOT="/absolute/fixed/product" node web/tests/independent-source-confirmation/verify-types.mjs --proposal
HIER_B_PRODUCT_ROOT="/absolute/fixed/product" node --test web/tests/independent-source-confirmation/facility.test.mjs
```

能力缺失退出1、0运行时语义执行及全数blocked，不视为skip/绿；
公开类型正例不通过时负例0执行。--proposal 是 B 自己从规范写的隔离类型设施，不是生产通过。
facility只证明既有 SDK、原 Selection、B 清单与适配器，不能替代 run.mjs 新行为。

复用旧 B controlled Transport，真实 SDK 校验/冻结/合并与真实模型均运行；Transport 不冒充 Core或Electron。
同 Reply 新链仅 public resolveSource 的显式适配，先交 C 审；无 private hook、睡眠竞速、GC内存阈值。
questions.mjs 的 B30-Q1 六个 SDK 覆写回调输入有保护动态区间歧义，单列待澄清，不属于121个必测或skip。
精确基类调用次数、不可观测的原异常外壳身份和无界强引用仍需 C 代码审核，不靠黑盒重复选择假证实。
旧测试原样保护，不改预期、不skip、不按 A 新方法实现改 oracle。
