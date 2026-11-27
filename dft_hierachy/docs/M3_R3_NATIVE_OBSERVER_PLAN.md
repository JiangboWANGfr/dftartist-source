# B 固定141原observer原生整合复验

## 目标、对象和前置

固定产品/测试集成14104075e3cd03a025eeb757191c4c9fb5adec8d；测试树test/m3 HEAD932bc71307dbdec4d042aa5ef724d7bac1036f0b；DESIGN SHA487211cec837aed48879f9915372780f1c03b7b0adf61cccbcbc4bb36a6e89e0。最新日志中C59新观察点未获C认可，本轮只回归C已认可的原机制/原八项，不冻结或验收新增排序/去重事件。原八项已于f468aa8→f8a4883独立冻结；旧3c2三配置8/285通过、新061公开OFF已于932bc71独立验证，均保留为历史，不算本轮执行。

## 输入、预期与范围

沿用[M3_R3_OBSERVER_FREEZE_PLAN](M3_R3_OBSERVER_FREEZE_PLAN.md)全部输入/期望/判断依据，CPP02f87c…、手写fixtureccf6be…及原M3Api/source五/physical两项hash与固定141完全一致；不修改oracle、fixture、测试代码或生产代码。真实原生PRIVATE登记b_m3_observer已存在，须自建后实际执行，不能用A两配置执行代验。

三配置（RelWithDebInfo、Debug、RelWithDebInfo+ASan/UBSan）显式OBSERVER ON/M3 ON/EXPERIMENTS OFF；自有DB/Core与原生/外部observer同宏重编，不混ON/OFF instrumented对象。仅查原生登记/编译宏及私有Kind枚举声明的必要兼容性（仍以TraceFilterRange为最后一个枚举，旧计数数组涵盖新增编号），不读新增事件实现/调用点、A自测/报告，也不使用新增事件作为oracle。

执行原八项原生和外部XML、十二公开API共57/139229、实际原生十二API＋source/errors＋observer登记（预期15，以-N与运行输出核对）、前序27项。原生/外部/CTest为同oracle重复执行，不算不同覆盖。旧061的88CLI/RSS/web不在本轮重跑，明确另报告历史；本轮source/errors为真实CLI子集，不能称完整88CLI新运行。

## 契约、风险与交付

不改API/Schema/JSON/IPC/工程格式/依赖或前序生产代码。现链CLI→Core，Electron/NDJSON/React及M4机器Schema/TS属未来；V1持久化/恢复/迁移不适用，旧ABI不承诺。C59新机制、I/O64KiB/全体≤256取消、总分配/普适复杂度/M7绝对预算不因原八项过而通过。原sink同线程/存活左值/noexcept/无重入/span不外留，原Publish只是尝试，需要真实取消与冷热重试。未请求新C59批准前不会读其机制代码或补测试。

- [x] 本计划f5d3d7d先独立提交，再三配置ON重配重编。
- [x] 原八项原生/外部三配置各8/285；原生13 API65/139514、实际登记15/15、前序27/27，不改oracle取绿。
- [x] 报告/JSON完成并核对；最终独立提交与主树追加交接见REVIEW_LOG末尾B条目，不改协调表或夹带他人内容。
- [x] 执行期间C认可新增机制，另领取/先冻dd8fbf9→必要类型适配76dce23；新两项72场景三配置通过。见[M3_R3_C59_VERIFICATION](M3_R3_C59_VERIFICATION.md)，C已关闭C58/C59，完整M3不因专项通过放行。

失败先区分编译/测试刺激/产品，不推断通知缺失就等于取消失效，不用sleep或wallclock阈值。保留旧首冻7绿1红刺激失败、旧C58红；本轮不再次改期望。任务结束再读最新日志/协调，有满足前置的新任务才继续。
