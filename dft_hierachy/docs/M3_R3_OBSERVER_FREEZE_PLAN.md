# B R3 受审私有 observer 独立冻结/验证

## 依据、固定对象与范围

产品3c2bdd210324737f82ea29c1afeed4c04727c495；DESIGN SHA487211cec837aed48879f9915372780f1c03b7b0adf61cccbcbc4bb36a6e89e0。C最新日志明确认可该固定版Observe.h机制，SHA389263691f66f17fcb5e5e89ce4886e4212d7b6040dbfe7201ccdfa12306e26d；B只读受审接口/事件说明，不读实现、A自测代码/结果、C探针。旧source OFF报告ec2ecf1/原oracle保留，不能混称为ON验证。

新增M3ObserverTest.cpp八API，按公开API调用真实Design/DB/Frontend，观察者仅固定计数、在具体事件同步request_stop和替换单调时钟。无产品mock/事实替换/假输出，无sleep/线程竞速、重入Design、抛异常回调或保留借用span；逻辑context的数值span只在回调内复制到定长自有数组。Sink/context为全Scope存活左值，编译期拒绝临时Sink。只在测试目标PRIVATE依赖受审接口；生产/Schema/IPC/工程格式不改。

## 输入、预期、判断依据

| 用例 | 独立输入/预期 | 依据及限制 |
|---|---|---|
| 大源码首屏冷/热 | 原source_large.sv手数100001；limit1每次Candidate2（1项＋1next探测）、Materialize1/Emit1；冷建表有事件、热不重建，结果一致 | §5.5.6 limit有界，Candidate仅选中身份，不推导全范围扫描/堆操作成本 |
| 索引取消/冷重试 | OccurrenceVisit第2、OccurrencePublish第1、SourceIndexRange第2、SourceIndexPublish第1同步停止；Cancelled无半页，停止后无额外事件，重试应重做尚未发布结构 | 通知是操作前尝试；靠重试冷建表事件证明，不把Publish一次当完成 |
| 页内取消/原游标 | 原首屏next，page7；Materialize/Emit第1同步停止Cancelled；原游标重试与完整控制相同，物化7且Candidate≤8 | 真实执行中取消，非预取消；控制页只判重试不丢结果，原100001完整集合由旧API独立计数 |
| 热逻辑准入 | 原fanout12不同TAG体；首屏maxHops1000，shared/per冷和hot各恰两个不同逻辑context，第三前截断；hot索引不重建/原fact与cursor不变 | §5.5.2以逻辑context计数，不用物理提取次数替代 |
| seek/构造 | 新observed_intervals.sv逐位独立64/4096事实，只查末bit、maxHops1；候选/Hop构造≤2、Emit1、正确位关系；cold建表单列，hot不重建；fanout增长64倍，hot SeekNode+Compare≤16×(64事实控制+1) | 有限相对成本回归guard，阈值独立取宽松16倍，不由A计数拟合；不是全部复杂度/内存上界或任意有效实现的唯一常数保证 |
| 连接/缓存发布取消 | Entry或Publish第1停止Cancelled；重试索引构造>0、再hot为0，真实结果正确 | §5.5.1不发布半成品；不扩大为CacheEvict或所有LRU路径已覆盖 |
| Trace构造/筛选取消 | 新独立diamond的a→b/c→q两路线收敛，Relation/FilterRange第1停止Cancelled，不返回局部图；重试同真实完整图ID | §5.5.1/5.5.4；FilterRange只指定已有区间合并循环，不计全部内存 |
| 确定性时钟 | 相同bit_paths，maxMillis1，假steady_clock每读增加2ms应partial/budget_time+frontier；恒定单调时钟重试真实complete非空图 | 不用wallclock阈值，时间预算不是功能错误，旧公开图oracle保留 |

原source_large/flow SHA沿旧冻结；新intervals为手写generate，不取实现输出生成。CPP/新fixture最终SHA在冻结commit及报告。sourceIndex排序/去重中C59缺事件，**本八用例没有覆盖该段**；C59新适配须A固定→C审→B另冻结。I/O每64KiB取消、全体≤256候选检查、CacheEvict/continuation分配、trace全部分配、索引building代次强制、并发IPC及M7绝对预算仍不因此通过。

## 执行与证据

首冻f468aa8后三配置八API实际7绿1红/275成功1失败断言/runner42。B原选bit_paths单路线未触发FilterRange，独立console诊断确认stage18/count0/stop=false，产品正确返回未取消的完整图；这是B测试刺激不足，不是产品吞取消。仅补诊断及改为手写双臂收敛diamond以实际访问已有区间；Cancelled/无半图/重试预期不改、不skip。旧CPP/fixture首冻和红输出保留，新刺激先提交再三配置重跑。明确先断言stop请求确实已发，若事件未发生则是覆盖前置未满足，不能直接归产品错误。没有读取Trace实现或A自测来选择答案。

- [x] 独立提交八用例/fixture/PRIVATE测试登记后再运行；f468aa8首冻，f8a4883刺激修订先提交，首轮7绿1红留证。
- [x] OFF source全部运行结束且SHA记录后，B固定树三配置显式OBSERVER=ON重编L2/L3及实际消费者，外部新observer同宏重编；三配置宏/配套SAN实查，不混链ON/OFF instrumented归档。
- [x] 八API三配置各8/285、0skip、退出0；外部登记CTest各1/1，原十一外部55/139136、原仓库12/12及前序27/27通过。原C58两项各1绿1红单列，不用A机制测试代验。
- [x] 原C58红保留，C59不代测；[报告](M3_R3_OBSERVER_VERIFICATION.md)/[JSON](m3_r3_observer_verification.json)落盘独立提交，主树只追加交接/不改协调表。

验证目录复用B自有build-b/Debug/ASan，未变第三方对象只读复用；此是新ON阶段，旧OFF产物hash/缓存状态保存在ec2ecf1，不把其历史状态改记新执行。整个M3/source仍因C58/C59不放行，观察机制与对应有限功能验收分开。
