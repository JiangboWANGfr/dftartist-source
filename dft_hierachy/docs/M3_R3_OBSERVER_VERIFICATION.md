# B R3 私有 observer 独立验证

八个独立冻结的 observer 用例在普通、Debug、ASan+UBSan 三配置均通过：各 **8用例/285断言、0skip、退出0**。这仅验收受审原 observer 可观察的有限子集，**C58/C59仍开放，source及完整M3不放行**。

## 固定对象与独立性

- 产品 `3c2bdd210324737f82ea29c1afeed4c04727c495`；DESIGN SHA256 `487211cec837aed48879f9915372780f1c03b7b0adf61cccbcbc4bb36a6e89e0`。
- C认可原私有机制；`core/observation/Observe.h` SHA256 `389263691f66f17fcb5e5e89ce4886e4212d7b6040dbfe7201ccdfa12306e26d`。C59段内新观察点尚未认可，不在本八项内。
- B首冻 `f468aa88d21bd8ea38ccd83bbb13b0cd6e3b49f0`；刺激修订先冻 `f8a4883d32aa333269ff8be4ff8d164dac09954e` 再运行；C58独立冻结 `ecc606b3edf38d15cf6d88253889ceb68b813fdb`。
- 输入、预期及依据逐项见[冻结计划](M3_R3_OBSERVER_FREEZE_PLAN.md)、[测试](../core/tests/unit/M3ObserverTest.cpp)、[手写fixture](../core/tests/fixtures/m3/observed_intervals.sv)。逐命令/退出码/实际XML摘要/CTest输出/配置与hash见[证据JSON](m3_r3_observer_verification.json)。
- 不读A实现、diff、A测试源/独立验证报告或C探针，不以共享日志中的A/C执行摘要定oracle；获C授权后仅读受审接口/事件语义。必读共享日志包含A/C摘要，故不称严格盲测。没有以实现输出拟合答案、产品mock、skip/xfail或产品overlay。
- B自有detached固定树与三构建目录；OFF阶段全部结束并在 `ec2ecf1` 保存hash后才显式改为ON。旧OFF产物已原地替换，旧执行证据另见[source报告](M3_R3_SOURCE_REVERIFY.md)，不混记为新ON结果。

## 实际执行

三配置 `HIER_TEST_M3=ON / HIER_TEST_OBSERVER=ON / HIER_BUILD_EXPERIMENTS=OFF`；普通RelWithDebInfo与Debug sanitizer OFF，第三RelWithDebInfo ASan+UBSan ON。产品选定归档/静态消费者/十API及probe重编或重新链接，外部十四目标编译退出0；未变对象/经校验的只读依赖复用，不称从零或全目标构建。

| 实际集合，每配置 | 普通 | Debug | ASan+UBSan |
|---|---:|---:|---:|
| 新observer XML | 8/285，退出0 | 8/285，退出0 | 8/285，退出0 |
| 外部登记observer CTest | 1/1，0.15s | 1/1，1.88s | 1/1，1.06s |
| 原十API＋新source五项，十一外部XML | 55/139136，退出0 | 55/139136，退出0 | 55/139136，退出0 |
| C58两外部API | 1绿1红，92成功1失败断言 | 同左 | 同左 |
| 固定仓库十API＋source/errors CTest | 12/12，4.16s | 12/12，7.96s | 12/12，29.09s |
| 前序Core/M1/M2/资源/共享/分层CTest | 27/27，19.52s | 27/27，34.76s | 27/27，144.38s |

新observer XML与登记CTest是同oracle的两次实际执行，不算不同测试；所有集合0skip。原十API50/136911，新source5/2225；十二外部API执行总57用例中56通过1失败，139228成功1失败断言，wrapper退出1仅因C58，物理测试runner42。并行工作/机器负载下耗时只作记录，不是性能验收。

PRIVATE宏/包含路径实查：DB/Core和新observer目标为ON；Frontend/protocol/CLI没有observer宏，不把它传播为公共接口。外部目标与同配置ON归档链接，Debug/ASan配套，不混链两种instrumented对象。真实协议2/schema6；新公开模型消费者已重编，不承诺旧ABI或M4完整机器Schema/TS一致性。

固定产品的原生CMake尚未登记B新observer/source_increment/source_physical，新增集合均通过B外部runner调用真实产品。B树已提交原生PRIVATE登记供A吸收，但未宣称A固定树已运行这些新增原生目标。

## 已证明与首轮失败

- 原100001命中首屏limit1冷/热：选中Candidate2、Materialize1、Emit1；热不重建。此不是所有范围扫描/堆操作成本证明。
- Occurrence/SourceIndex指定建表及发布前事件实际停止；Cancelled不回半页、停止后无额外事件；原样重试重新冷建表。Publish事件是尝试，不独自证明已发布。
- 页内Materialize/Emit停止，原next仍可重试得到原完整控制页；page7物化7、候选≤8。
- shared/per冷/热step都在第三逻辑context前截断，恰准入两个不同context；hot索引不重建，fact/cursor不变。
- 手写64/4096独立逐位事实：末bit/maxHops1正确，候选/Hop构造≤2、Emit1，hot不重建；seek相对guard通过，仅是有限规模回归，不是任意索引通用复杂度证明。
- Entry/CachePublish停止后冷重试重新构造、随后热不构造，真实结果正确。未扩大到CacheEvict所有路径。
- 手写diamond两路径收敛：Relation/FilterRange处实际request_stop，Cancelled无半图；重试完整图相同。FilterRange仅覆盖已有区间合并循环。
- 注入单调时钟每次+2ms，在maxMillis1下得到partial/budget_time及frontier；恒定时钟重试真实complete非空图，不用sleep或墙钟判定。

首冻三配置均7绿1红，275成功1失败断言，runner42/wrapper1。原选线性bit_paths没有触发FilterRange：独立console证据stage18/count0/stop_requested=false，产品正确返回未取消的完整图，**这是B测试刺激不足，不是产品吞取消**。保留首冻/红记录，仅加诊断和手写diamond，并先断言停止请求确已发出；Cancelled/无半图/原样重试预期不变。新刺激提交后才三配置重跑，无实现读取或期望降级。

最后hash采集首次漏写公共模型路径的model/，只读命令退出1；经rg定位改正后退出0。证据校验器另有首轮正则转义、次轮CTest单/双空格计数错误，修正后严格核对实际登记1/12/27、XML全部计数和本地链接退出0；错误/修正均留JSON，不归产品运行错误，不改预期或重跑产品。

## hash与未完成边界

测试CPP SHA256 `02f87c91154db08b753dd8a4bbab95aed5618e1948562ed1d36600217c4aa9d7`；新fixture `ccf6bec2bb8c7aac6c5bf2d9c337ce401f70be51df5ce8a29455fd8cbbfc4e35`。原M3Api、source_large、flow、新source/physical用例均未改；DESIGN/公开头/锁及复用Slang两文件hash与OFF阶段一致。

ON三CLI SHA256：普通 `e4bade4eb305f70369dd144352b9a8a4f4665c96a3a2885239e68d59fbee1601`；Debug `1fd6bd1249ccaa281730d63cc65c47730e708111873cd5f0302b3e4ea4d4a79f`；ASan `dcdf4636428cbc71ec4c2e945d19ec24381696249cb4757ea27624a14dc8c537`。

C58在OFF/ON各三配置独立失败：同物理hard include修改后实际两个FileRef，预期一个；soft及同字节不同物理copy控制通过。C59段内取消是C代码证据，本八项不能测：等A新固定SHA/具体检查点→C认可→B独立补冻，不用外层取消代验。两项正式关闭归C，A最新日志只领取修复，尚无新固定交付。

未执行whole check.sh/全目标/完整CTest、A自测、ON完整88CLI/RSS/web重跑、真实设计独立verify、Linux/远端CI/TSan/fuzz/mutation/覆盖率/分配失败。原OFF88/88、RSS4/36样本、web独立1绿10未来红仍只是另报告的实际历史结果。I/O64KiB、全体≤256候选检查、continuation/trace全部分配、强制building代次、并发IPC及M7绝对RAM/SLA未因此验收。当前CLI→Core不是Electron/React；首版持久化/恢复/迁移/撤销重做不适用。

## 交接

交A原样吸收observer `f468aa8→f8a4883`，不要改oracle；修C58/C59并交新固定对象/适配。交C/协调者登记“原受审observer有限八项独立三配置通过”，不能登记完整source/M3完成。B只在自有树提交测试/计划/证据，主树仅追加本人REVIEW_LOG，不改协调表或他人条目。
