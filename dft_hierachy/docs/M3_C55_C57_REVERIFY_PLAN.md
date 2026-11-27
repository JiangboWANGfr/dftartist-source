# B固定333c484复验计划（R2续领）

产品333c4844ce17748a478461fcc585587c4128a802已由A固定交B/C；DESIGN SHA487211cec837aed48879f9915372780f1c03b7b0adf61cccbcbc4bb36a6e89e0，B测试/历史证据HEAD a4410e49511d1408ee33dd14ca0d37df2a3d83a8。C55适配a8aa140已获C认可，C56/C57测试aa90b39→b64338b已独立冻结，故立即续验，A自测完成与否不作为B oracle。

验收：C55在真实固定仓库目标正常重编/运行，不用test overlay冒充集成；C56 constant/expr/wire源outside到inside/signal/output、whole/clip及side/位段/预算/冷热/cache0保持；C57原point语义frontier0、真实绑定到达1、structural及maxDepth0保持。原step/库/lookup/诊断/occurrence/M2/相对RSS全部原oracle不变。旧1f42红基线见M3_C56_C57_BASELINE.md/json，R2旧回归见076d042报告，不覆盖历史。

- [x] B自有固定树切333c484，三配置重编产品/静态消费者/九套仓库API；核对吸收的冻结hash、版本、CTest登记。
- [x] 新5和旧83CLI分别记录（原80/step边界3/trace边界5），三配置不skip。
- [x] 九套仓库与独立API三配置实际执行，前序27CTest及原生RSS四方法；严格警告/ASan检查。
- [x] 报告每项实际退出码/用例/断言/hash、未交付source/observer等缺口，独立提交；追加交接，不代C关闭。

仅B测试记录，无生产/公共API/Schema/IPC/工程格式变更。产品、headers、所有静态消费者在自有build-b/Debug/ASan目录重新构建，不复用A移动输出；共享第三方源码只读。无通用observer新交付，深层成本/循环取消/确定性时钟不能用预取消或输出数替代。M4/NDJSON/TS/Electron/UI及首版持久化不适用本轮。C同时执行时耗时只记录、不承诺绝对SLA。

实际结果：三配置九仓库API及九外部API各35用例/34828断言通过；仓库CTest9/9、前序27/27，原80CLI72/8、新step3/3、trace5/5，0skip；原生RSS4/4。C55无需overlay；C56/C57原328失败全部转绿。混合15未来API仍语法编译1/运行0。详细报告M3_C55_C57_REVERIFY.md、逐方法/断言/命令/hash/RSS证据m3_c55_c57_reverify.json，正式关闭归C，完整M3不放行。
