# B 5bd4b46 新C59原生整合最终独立复验

## 对象、权威与验收

固定产品/集成5bd4b46fd8b81ffda973a6e648e3acfeceb8f138；B test/m3起始9422ead1d57052d1a6ae3ed62fd9e0cec51d8e33；契约取固定验证树/主树DESIGN SHA487211cec837aed48879f9915372780f1c03b7b0adf61cccbcbc4bb36a6e89e0，而非B分支旧文档。C已正式关闭C58/C59，新观察机制已许可；本轮原生集成门禁不再等待重复批准。

沿用[C59冻结计划](M3_R3_C59_FREEZE_PLAN.md)和[原八项冻结计划](M3_R3_OBSERVER_FREEZE_PLAN.md)全部手写输入/预期/依据。新增CPP3d94e5…，原八项02f87c…/fixtureccf6be…，原公开source/physical及M3 CLI/API不改。新增独立宏769/2305＋513×12、同组1/256/257/513停止、实际stop前置、≤256/无半索引/冷重建771/2307/6169完整有序/热不重排均保持；两项72场景仅按XML实际执行核对，不从A的次数拟合。旧141外部、旧061OFF、旧3c2红均分开保留。

## 修改范围、构建与公共边界

只新增B计划/报告/JSON并向主树REVIEW_LOG追加本人领取/交接，不改协调表、生产、测试代码、fixture或依赖。只读公开头、获准私有接口、自己的原生/外部CMake登记；不读A实现/生产diff/测试源/独立报告。共享日志摘要已暴露，不声称严格盲测。

B干净自有detached树切固定5bd，不切A分支、不用A产品输出。复用自有build-b/build-b-debug/build-b-asan及核验过的只读依赖，显式M3ON/OBSERVERON/EXPERIMENTSOFF，普通RelWithDebInfo、Debug、RelWithDebInfo+ASan/UBSan；选定归档及真实消费者同宏重编/重链接，不称从零或全目标。PRIVATE宏同ON；Frontend/protocol/CLI不传播；新增source_sort这次应真正原生登记，不仅外部通过。

不改变API/ABI/JSON/schema6/protocol2/工程格式；重编消费者不承诺旧ABI。当前CLI→Core为真实集成，NDJSON/Electron/UI/M4完整机器Schema/TS、并发取消等属后续；V1无持久化，保存/恢复/迁移/撤销重做不适用。

## 实际执行与记录

- [x] 计划470eb99先独立commit；固定5bd，78个unit/m3/fixture文件hash完全等于B冻结树。
- [x] 三配置配置/选定增量构建0、原生十四API67/3550682；新2/72/3411168及原8/285，0skip、退出0，不改oracle。
- [x] 实际登记/运行全B M3各27/27、全部CLI各88/88，前序各27/27；没有空匹配或沿用旧外部结果。
- [x] 新跑普通ON原生RSS四方法/36样本、最大中位数8847360 bytes，原门禁未改，不作M7绝对预算；并发时间边界已说明。
- [x] Node24.21.0/npm10.9.2新跑web类型/分层/五控制0；独立11项1绿10未来红、0skip/退出1；未安装依赖或改锁/engines/假客户端。
- [x] [独立报告](M3_R3_C59_NATIVE_REVERIFY.md)/JSON已生成；实际宏/hash/退出码/计数/本地链接核对及最终提交、主树交接以REVIEW_LOG末尾B条目为准。C最新整合审查通过，支持协调者收尾M3。

不跑whole check.sh、全目标/fullCTest/A自测；标准脚本显式OFF/ON和生产目录未变归C独立核对。本B完整冻结集合通过支持M3协调收尾，但不独自宣称未覆盖范围已验收。新原生结果不能从旧外部结果复制；没有实际动态停止也不能写取消通过。

## 风险、历史与收尾

旧缺Kind编译失败/运行0、首冻测试signed limit编译2及适配、旧C58红和observer刺激不足红见[上一轮独立报告](M3_R3_C59_VERIFICATION.md)，均不覆盖。不用sleep/wallclock竞速，不冻结stdlib总比较次数，通知只覆盖真实谓词/已审粒度，不代表swap/move/析构/全分配/OS最长等待。I/O64KiB/全部循环256/trace和continuation全分配/M7绝对RAM或SLA、真实RTL/Linux/Windows/CI/TSan/fuzz/故障注入未因此证明。只清理测试生成的自有mkdtemp目录，不动用户输入。

完成后重读协调与最新日志；有新固定且满足前置的B任务才继续，否则交C/协调者记录M3收尾及限制，不修改其调度状态。
