# B C59 整理段独立冻结

固定14104075e3cd03a025eeb757191c4c9fb5adec8d（生产061d1d1）；DESIGN SHA487211cec837aed48879f9915372780f1c03b7b0adf61cccbcbc4bb36a6e89e0。C在REVIEW_LOG认可SourceIndexSortCompare/SourceIndexDedupCandidate真实谓词前通知和停止前后边界；受审Observe.h SHA60dc1a3f0efd0fb61b000b123f4c0d3ed4dee37bbf9a1374859769a8f5ea8b90。仅读该私有接口/语义及公开头，不读A实现、SourceIndex调用点、A/C测试源/报告，不从A总次数拟合答案。

## 输入与手写预期

新增M3SourceSortTest.cpp两API使用独立确定性生成器，不用A宏/fixture。769/2305（3×256+1、9×256+1）个wire声明来自一次宏；无端口/赋值，每个声明应定位到同一最外物理调用范围。module定义＋顶实例定义＋N信号，全部页N+2，先定义引用再顶实例、后信号按声明编号顺序。另一输入513声明×12数组子实例，位置在leaf宏内，只有leaf定义＋12个leaf实例定义＋12×513信号，共6169；u[2]先u[10]，全部occurrence不得漏重。引用身份取公共definitions/roots/children/signals按独立名字映射，不猜编号/源码返回排序。offset/line/column和半开范围从生成的原始ASCII字节手算，不借产品source输出生成期望。

两Case均shared/per、cache0/64MiB对照。Case1各规模/模式/缓存，对Sort/Dedup在当前同subject组的第1/256/257/513通知同步停止；第1为早停控制，第256及以后确认进入足够大的段，不把早停控制叫大组证明。Case2两个事件在同组第257停止。阈值来自契约粒度，不固定标准库精确总比较次数、不绑定group数值。实际停止前置必须成立，未触发是覆盖/输入问题，不能直接当吞取消。

## 每次判断

- 真实request_stop后返回Cancelled、非空错误、无半页；停止后整理候选总通知≤256；载荷amount=1，通知编号在当前接口范围内。
- 未出现SourceIndexPublish或SourceCandidate/HitMaterialize/Emit，未完成索引不能发布。Publish仍是操作前尝试，不当完成通知。
- 同Design原查询无cancel重试，SourceIndexRange/Sort/Dedup>0证明冷重建，成功发布尝试1与完整N+2/6169有序无漏重结果共同判断。
- 分页首73，随后211/509交替；冷热首127并串页，完整结果同手写预期、页大小≤limit/游标前进/末页结束，span/rawhash不变。热不再重排/去重/建表。既有原八项游标页内取消继续回归，但C59冷整理前本无已发next，不冒称强制同段原游标取消。
- 文件通过mkdtemp自建唯一目录，RAII关闭文件和清理仅自有夹具；Scope借用全程存活左值、同线程、noexcept回调，仅固定计数/subject，不抛异常、重入、修改事实或保存借用span。

## 构建、基线及范围

仅B原生条件ON的PRIVATE测试登记与外部同宏目标；不改生产/API/Schema/IPC/工程格式/依赖。新固定A树未登记此两项，先走B外部链接真实自建ON归档，不称原生已整合。先独立提交CPP/登记/计划再编译运行；若必要头/类型/构建适配要保留初败另提交，不降低预期。

旧3c2已有观察接口但没有新两个Kind：用旧受审头与旧公开头做新CPP语法基线，应编译失败/运行0；不将其写成已测量段内取消延迟。C旧实现缺检查点证据属于C。新141三配置单列两Case的真实XML/注册CTest；原八API/十二公开API/前序回归及source/errors另一集合单列。

- [x] 新oracledd8fbf9先独立commit；三配置首次编译2/运行0，公开PageRequest.limit为int而测试使用size_t，-Werror报告缩窄/有符号比较。只加三处显式类型转换，所有受控值≤2306、预期/输入不改，适配另commit后重编。旧头首编同含此测试错误，适配后另跑纯缺Kind基线。
- [x] 适配后旧头仅缺新Kind退出1/运行0；新三配置编译0，新增2/72/3411168、外部14 API67/3550682全绿，真实外部CTest2/2。逐命令/输入hash/XML摘要/原生15及前序27见[M3_R3_C59_VERIFICATION](M3_R3_C59_VERIFICATION.md)。
- [x] 报告/JSON完成并核对；最终独立提交与主REVIEW_LOG交接见末尾B条目，C已正式关闭C58/C59，完整M3不由专项结果宣布验收。

仅可观察谓词计数，不覆盖swap/move/析构/全分配/OS等待，也不证明I/O64KiB/所有其他循环256、M4排队IPC或M7绝对RAM/SLA。旧缺接口、旧C58红、旧observer刺激不足红均不覆盖。并发机器负载下时间只记录，不做wallclock oracle，不sleep。
