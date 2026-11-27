# B R3 固定141 C59专项独立验收与原observer原生复验

**C59新增两项和原八项在三配置通过，原oracle未降低；C58/C59已由提出方C正式关闭。完整M3未因此宣布验收。**

## 固定对象与独立性

实际产品/集成 `14104075e3cd03a025eeb757191c4c9fb5adec8d`，自有detached验证树；生产061d1d1的关系来自交接，B不以读取生产diff另作证明。测试树test/m3，原生复验计划先冻 `f5d3d7df8960e87f1e4b48e0b1562c20b6a80ed7`，新测试先冻 `dd8fbf9cdb67440f77032a96126db995855c1d3e`，必要类型适配另提交 `76dce231a8dfc9714a9bf4501401baf4174984d8`，运行均在适配提交之后。

契约采用固定验证树/主树DESIGN SHA256 `487211cec837aed48879f9915372780f1c03b7b0adf61cccbcbc4bb36a6e89e0`，不是测试分支保留的旧DESIGN副本。读取协调规则、最新REVIEW_LOG、公开头以及C认可的私有Observe.h/新增事件语义；不读A实现、生产diff、SourceIndex调用点、A/C测试源或独立验证报告。共享日志/获准接口说明已暴露A/C摘要，故不称严格盲测；不从其输入、次数或自测结果推导答案。无产品overlay、mock、skip/xfail或预期降级。

原八项CPP `02f87c…`、手写fixture `ccf6be…`、原M3 API `2bac98…`、source五项 `944d55…`、physical两项 `c8b54b…`保持原冻结hash。新增CPP SHA256 `3d94e5b036f549aca10b2513a5a6710cfa328f3381afc6c57da4f8e2bf198ec7`；受审Observe.h为 `60dc1a3f0efd0fb61b000b123f4c0d3ed4dee37bbf9a1374859769a8f5ea8b90`。

## 输入、预期与判断依据

详细定义见[C59冻结计划](M3_R3_C59_FREEZE_PLAN.md)、[原生复验计划](M3_R3_NATIVE_OBSERVER_PLAN.md)、[原八项冻结计划](M3_R3_OBSERVER_FREEZE_PLAN.md)；新增输入由B独立确定性生成，非A/C fixture。范围/坐标依据DESIGN §5.5.6，取消与分页依据§5.5.1/§5.5.7，通知含义仅依据C明确许可。

| 新测试 | 输入与场景 | 手写期望及检查 |
|---|---|---|
| 宏整理段取消及冷重试 | 一次宏产生769/2305声明；shared/per、cache0/64MiB、Sort/Dedup、同subject组第1/256/257/513通知停止，64场景 | 全页分别771/2307命中；定义/实例在前，声明按数值序；实际停止、Cancelled、无发布/半页，停止后整理候选通知≤256；冷重建全量有序，热不重排 |
| 十二数组occurrence回归 | 513声明×12数组子实例，模式/缓存/事件对照，同组第257停止，8场景 | leaf定义＋12实例定义＋6156信号=6169；u[2]先u[10]；同样取消、冷/热分页无漏重、快照span/rawhash保持 |

第1事件只是早停控制；第256及以后确认真实进入足够大的同组。每场景先断言stop_requested，未触发不能归类产品吞取消。不猜subject数值，也不冻结标准库总比较次数。载荷amount=1；Cancelled错误非空，SourceIndexPublish/SourceCandidate/HitMaterialize/Emit均0。计数只能证明≤256通过，不声称记录了精确停止后次数。

冷重试Range/Sort/Dedup实际>0，Publish尝试1必须结合完整结果判断，不把发布前通知当完成。首屏73，后211/509交替；热首127后完整分页；逐命中检查ref/kind/file/hash及原始ASCII字节推导的半开offset/1-based行列。ref身份从公开definitions/roots/children/signals按手写名字映射，不解析opaque编号，不从resolveSource结果生成期望。未发首个next的冷整理取消不冒充该段“原游标取消”，既有页内取消/原游标重试由原八项另回归。

三种生成输入分别11489/35834/7701 bytes，SHA256与宏起点的独立Node重算均留JSON。RAII仅关闭/清理mkdtemp自有目录；sink为存活左值/同线程/noexcept、固定计数、不重入、不修改事实、不外留借用span。

## 修改前基线与首次失败

旧3c2受审Observe.h不含新增两个Kind。用该旧头与经hash核对未变的公开头编译新CPP，退出1、运行0；适配后只剩缺Kind编译诊断。这是“接口尚未实现”的编译基线，不是旧产品段内取消延迟的动态测量；不替代C原缺检查点证据。

首冻dd8fbf9在三配置首次实际构建均退出2、运行0：测试把size_t用于公开PageRequest.limit(int)，严格-Werror报两处缩窄及一处有符号比较。76dce23仅加三处显式转换，受控值≤2306，输入/预期不变，提交后重编、运行全绿；旧头首次诊断也含该测试问题，保留而不改写。脚本模板反引号碰撞在任何文件编辑/产品运行前失败；辅助flags/hash查询曾用错路径，修正后完整0。预链接版本采集读到旧OFF二进制，排除为新证据；最终重新执行--version为0、protocol2/schema6。均不当产品缺陷。

## 本轮真实执行

三配置显式M3 ON、OBSERVER ON、EXPERIMENTS OFF；普通RelWithDebInfo、Debug均sanitizer OFF，第三RelWithDebInfo ASan+UBSan ON。自有DB/Core及instrumented消费者同宏重编/重链接，未变Frontend/Slang对象复用，不称从零/全目标构建。最终宏核对DB/Core、原生observer、外部observer/source_sort均ON，Frontend/protocol/CLI不传播。PRIVATE登记不改变公共API/JSON/Schema/依赖；原生固定141尚无新增source_sort登记，B新CMake供A吸收，新增两项实际走外部目标链接真实归档。

| 每配置实际集合 | 普通 | Debug | ASan+UBSan |
|---|---:|---:|---:|
| 原生13 API XML（含原八项） | 65用例/139514断言 | 同左 | 同左 |
| 其中原八项：原生及外部 | 8/285 | 8/285 | 8/285 |
| 新C59外部两项XML | 2用例/72场景/3411168断言 | 同左 | 同左 |
| 更新登记后外部14 API XML | 67用例/3550682断言 | 同左 | 同左 |
| 真实原生13 API＋source/errors CTest | 15/15，7.55s | 15/15，12.84s | 15/15，35.69s |
| 前序Core/M1/M2/资源/共享/分层CTest | 27/27，24.97s | 27/27，39.94s | 27/27，167.47s |
| 外部observer/source_sort登记CTest | 2/2，0.69s | 2/2，7.12s | 2/2，3.91s |

以上全部退出0、API 0skip；实际-N及逐条运行核对15/2登记，非空匹配。原公开12 API为57/139229，含source5/2225、physical2/93，三配置原生/外部皆绿。原生/外部/CTest及两项先单跑后合跑是同oracle重复验证，不重复计算覆盖；时间受并发负载影响，不是性能门禁。

本轮未重跑完整88CLI/RSS/web；仅真实source/errors CLI子集。固定061 OFF的88CLI、RSS36样本/web类型与独立1绿10未来红见[上一轮报告](M3_R3_FIX_REVERIFY.md)932bc71，不冒称本141 ON新执行。旧3c2 C58红见[旧source报告](M3_R3_SOURCE_REVERIFY.md)ec2ecf1；旧observer首冻刺激不足红及修订见[旧observer报告](M3_R3_OBSERVER_VERIFICATION.md)1a7933d，均保留。

[逐命令/退出码/实际XML摘要/72场景/CTest/配置/输入和二进制hash](m3_r3_c59_verification.json)。XML wrapper保存逐case/section/汇总，不声称保留全部原始XML；构建工具若截断则按original_token_count注明，不声称完整stdout。三ON CLI SHA256为643d8a20…/9ad96066…/327f67f9…（完整值在JSON），原OFF归档已重建，旧hash证据保留，不称旧二进制仍存在。固定验证树与测试提交收尾干净。

## 交接与边界

最新REVIEW_LOG已由C正式关闭C58/C59；本报告提供B新专项独立通过证据，不把C的探针当B执行，也不重开已关闭缺陷。交A：原样吸收dd8fbf9→76dce23及本报告提交，在新固定集成三配置实际原生运行新增两项后交接；不要改oracle。交C/协调者：本阶段B领取完成，保持正式关闭与完整M3收尾分别记录，协调表由协调者更新。

未执行whole check.sh/全目标/fullCTest/A自测、独立真实NX9000/C910、Linux/Windows/远端CI/TSan/fuzz/mutation/覆盖率/分配或stat故障注入；不证明swap/move/析构/全部分配或OS等待、I/O64KiB/全部其他循环256、trace/continuation全分配、M7绝对RAM/SLA。当前CLI→Core不等于Electron/React/NDJSON IPC；M4机器Schema/TS完整一致性、异步IPC并发取消等属后续里程碑，V1无持久化，保存/恢复/旧格式迁移/撤销重做不适用，不挪用旧dft-suite规范。
