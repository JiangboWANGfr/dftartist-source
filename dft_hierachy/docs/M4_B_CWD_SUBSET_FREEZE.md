# B cwd独立适配、EOF修订与已审子集正式冻结

2026-10-12；Agent B独立测试工程师。

## 本轮结论与范围

C在REVIEW_LOG正式关闭C60～62，认可公开Schema和B14生命周期。
B据此**正式冻结已发表、已明确的对应测试子集**：27方法/655结构与登记判断，
39客户端、既定11 Node适配+1真实E2E候选及25协议用例。
这不是宣布M4全部测试已经齐备，更不是运行时已经通过；
B15私有可执行测试和完整生成一致性、服务/Node容量/背压等剩余门禁保留。
已受审且对应冻结的A Schema/客户端单元可以推进，不要求先消除所有未来红基线。

固定公开契约2b25f0fab69653a0426e2a74b09b178503add3ba，
DESIGN SHA28916edcb2a14725108af2120ef9ada95e1cd26a10608c91562d3bd114163874，
Schema SHA30a9ca285b813202b5a9867485a6d301cbd450b31098c582542c3a11c89a1420。
自有测试分支从4b5f71b起，纯EOF提交 **ba35d12ec531e5fc3bd052b7e177471bb81e5b42**，
cwd适配提交 **1eb90da05e5636f0b7ffb46503006356f952af54**。
A的新代码仍在工作中，没有固定runtime交接；B不看A实现/diff/新自测源，
不复用主树dist或A二进制，不以A首轮数字做B验收。共享摘要暴露，不称严格盲测。

## cwd缺陷独立复现与必要适配

A请求核对本人[Node测试](../web/tests/independent/node-transport.test.mjs)：
fileURLToPath的fixtures目录带尾/，子进程process.cwd()不保留该尾/。
B绕过产品，以自有Node24原生spawnSync和同目录做实际正/负对照：

| 输入 | 实际值与判断 |
|---|---|
| 原生子进程传cwd=fixtures/，旧严格字符串相等 | process.cwd()为fixtures，raw相等false，probe**退出1** |
| 同输入，预期改为resolve(cwd) | 目录相等true，probe**退出0** |
| 原生子进程传父目录 | 与正规化后的fixtures不相等；负对照保留拒绝，不因正规化掩盖传错目录 |
| 不带尾斜杠的fixtures | 新原生控制测试也要求得到同目标目录 |

§5.6.5要求cwd目录传递，不要求getcwd回显参数的目录分隔符表示。
所以这是B预期的表示错误，不是A功能缺陷；B自行正规化预期为resolve(cwd)，
仍严格比较目标目录，字面args、显式env、默认继承等断言不删不放宽。
新增原生cwd控制与既有[受控producer](../web/tests/independent/fixtures/node-producer.mjs)控制都不算产品Transport验收。
不根据A输出改答案，不让产品伪造B_cwd，也不读A实现验证其如何传cwd。

## EOF纯空白修订与hash归属

C提示两文件EOF空行。B独立范围检查
git diff --check 1408dfd HEAD -- 两Node文件实际**退出2**，同两处诊断。
ba35d12仅移除两个末尾空行；逐文件断言after等于before仅正规化EOF，**退出0**，
正文/所有断言逐字不变，范围复查**退出0**。cwd适配单独提交，不夹在纯格式commit。

| 文件 | 原冻结SHA（历史） | 新SHA |
|---|---|---|
| node-transport.test.mjs | 29f8c4416367b50a6a985a78e2251e84d4a739b644e111af935960ddb2cc5931 | a1a1bc455cfa6881f7ed2f84f6df0a9edd0d2037b401eb41ad27ae11bc63f012 |
| node-producer.mjs | 4355f216a63eff22108357b9f3b2f0f19f8395e3af116f616906e4817e0562b6 | 34cb5d4ae286b0020f0165ee5ec369a57c1f2e1c6121fed8a1ca9270d7098c10 |

原[Schema报告](M4_B_CONTRACT_VERIFICATION.md)、
[整合复验报告](M4_B_INTEGRATION_REVERIFY.md)及其JSON不重写；
原hash是当时已执行对象的历史证据，不把它修改成新适配后的hash。
新清单和原始失败另在[本轮机器证据](m4_b_cwd_subset_freeze.json)保存。
B锁文件仍为211e18d6399b816961d027aa8cbe6a3f5ee405524a495f85ef5a1dd3e8a8d73c，不改依赖/engines。

## 实际测试结果与含义

| B本轮实际执行 | 结果与边界 |
|---|---|
| 同原冻结Schema测试，固定2b25的公开Schema | **655/655、0skip、退出0**；其中569手写JSON结构输入、86登记断言。corpus29d46057bbd8d071eca858d3e4536ce4c7bb81470d8a800761e878ee7f492cc6未改；不是655全部均为结构样例 |
| own Node --test，四个独立文件，HIER_BIN=自建旧5bd | **58项5绿53红、0skip、退出1**：39缺HierClient、12缺Node入口、2缺M5 selection。5绿只4控制+1版本常量；0 M4深层断言执行 |
| own Node按^B harness:或^B producer control:选择 | **仅选中4项，4/4、0skip、退出0**；2 Fake控制、1原生cwd、1producer，不算39客户端/11 Node产品通过 |
| Node --check两修订MJS；历史范围Node空白检查 | 各0；语法/空白不当JS全量lint/formatter |
| npm --prefix web run check | 退出0，B自有旧骨架TS/依赖层级/5违规对照；未测试A正在生成的新类型或公开消费者新实现 |
| 原始/正规化cwdprobe；EOF源等价；证据/链接/提交检查 | 实际命令与退出码完整保存JSON；原始probe1与首EOF范围2未抹掉 |

自有旧Core固定5bd4b46fd8b81ffda973a6e648e3acfeceb8f138、schema6，
二进制SHA643d8a20e93ed241da66299410670b412e64e29035a4adffc8c11781d51b29a7。
本轮Node工厂入口不存在，因此虽然设置HIER_BIN，真实Core链未进入；
不能把58旧stub结果套到A正在写的新客户端，不能用控制绿冒充SDK产品绿。
Node24.21.0/npm10.9.2、Python3.13.3/jsonschema4.25.1、macOS26.0.1 arm64。
未安装新依赖或修改Core、公开契约、Schema、工程文件、A/C/D产物或协调表。

## 后续门禁与交接

B15在本轮领取时尚缺受审decoder/SessionState/worker声明、finish后feed状态或允许不变量、
取消意图到request_stop时隙控制。收尾收到C对新SessionContract.h的认可：
头SHA0295e91ce7b1aac4d8b2a7a9011686f431a787e27747a45309ae6cb636901af6、
DESIGN SHAe458f01177b20c0eb60693c90196b7374aa264be5aefe4e178fa94fc927550fd，
具体声明/拥有停止动作已补，B转续私有测试代码冻结，后续另报告。本cwd单元尚不关闭B15。
reader明确输入/consumed等不变量可按受审声明逐步冻结，本轮没有编写替代reader/State，
不声称31设计项已经成为可执行私有测试，也不以其缺口阻止已获准A客户端实现。

B11/12/13实际交付/验收未完成项保留：生成零diff/完整TS-C++同输入判断、
真实服务27方法语义、新快照摘要/filter、Node容量/stderr/背压/部分写、ID耗尽及真实线程/ON-OFF/sanitizer。
无新的固定runtime所以本轮无Core重编/CTest、私有线程/ASan/TSan或远端CI；
后续固定产品交接时按风险实际运行，不用sleep或A自测替代。
M5/M6、React/Electron、布局/导航/Studio迁移仍属后续阶段，本轮不进入D研究任务。

A吸收ba35d12、1eb90da及本报告/计划，使用不变公共行为期望推进已获准实现，
完成后给固定产品/公开生成器与消费者入口。B再独立构建、执行同一测试；
C审实际调用链/产物隔离并维护自己的意见关闭。
本轮正式子集冻结只表示正确行为已定，不表示整个M4已经放行或所有测试已经实现。
