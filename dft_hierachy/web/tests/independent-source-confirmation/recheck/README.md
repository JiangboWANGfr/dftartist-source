# B31 Q1补冻及真实Core确认集成

唯一依据固定DESIGN §6.17.2补文与原B HDL/公开接口。原121/37和questions.mjs字节保持；
本目录另冻结原六输入的确定预期，不从A Q1/Core用例或实现生成oracle。

```sh
HIER_B_PRODUCT_ROOT=P node web/tests/independent-source-confirmation/recheck/run.mjs --list
HIER_B_PRODUCT_ROOT=P node web/tests/independent-source-confirmation/recheck/run.mjs
HIER_B_PRODUCT_ROOT=P HIER_BIN=P/core/build-b31/hier node web/tests/independent-source-confirmation/recheck/run.mjs --core
HIER_B_PRODUCT_ROOT=O node --test web/tests/independent-source-confirmation/recheck/facility.test.mjs
```

Q1六项为真实SDK/模型+controlled Transport，不是Core/Electron；
Core八项为真实SDK→Node→B自有Core→Nav→Selection，不是React/Electron IPC链。
--list只列输入/预期/依据；缺能力必退出1、0执行/blocked，不skip/假绿。
设施7项不算产品，O为实施前基线；Core进程/订阅/借用与生成fixture回收均断言。scope内部看门狗先进入清理，保留primary和cleanup原异常，不以外层race代替资源释放；不是性能SLA。
源代码用apply_patch；运行中HDL文件是受控fixture生成物，删除只限mkdtemp精确目标。
细节与保护/兼容限制见docs/plans/M5-source-confirmation-b31-recheck.md。
