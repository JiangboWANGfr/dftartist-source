# B：固定333c484的C55/C56/C57独立复验

**结论：三项对应的冻结回归在三配置通过，正式关闭归C；不是完整M3放行。** C55真实仓库目标已经正常构建/执行，不需要overlay；C56/C57原四API从328个失败断言转为1848/1848通过，新五CLI全部通过。旧83CLI的source8项仍未交付，observer等证据缺口保留。

## 固定范围与独立性

产品333c4844ce17748a478461fcc585587c4128a802，DESIGN SHA256 487211cec837aed48879f9915372780f1c03b7b0adf61cccbcbc4bb36a6e89e0。B oracle/红基线HEAD a4410e49511d1408ee33dd14ca0d37df2a3d83a8；C55构建适配a8aa140，专项首冻aa90b39/检查器补强b64338b。复验计划1a46d4a8de38ae206f22e70cef0397a174f1b30d。本轮**测试、fixture、预期、注册全部不改**，只补计划/报告/机器证据。

B测试树test/m3，产品树自有detached333c484；三个core/build-b、build-b-debug、build-b-asan及对应外部-api-boundaries目录。自有增量构建重编改变的产品对象，所有实际静态消费者重新链接；保留未变对象，不宣称从零全量重编。产品与测试只使用这些B自建输出，不使用A/C构建；没有测试overlay。第三方源码只读复用，构建前后上游Compilation.h/.cpp SHA不变。未读取A实现/diff/自测或C探针源码；必须读取日志已见概要，不称严格盲测。

依据DESIGN§4.3/5.5.2/5.5.4、独立四位fixture和冻结手算预期。实际命令/逐方法/用例/断言/失败分类/构建输出摘录/全部RSS/hash：[m3_c55_c57_reverify.json](m3_c55_c57_reverify.json)；任务/验收：[复验计划](M3_C55_C57_REVERIFY_PLAN.md)，[专项冻结](M3_C56_C57_FREEZE_PLAN.md)。个别构建工具返回已截断，不称完整raw log；实际退出码与各测试计数完整保留。

## 输入、预期与基线保留

| 项目 | 冻结预期与输入 | 旧1f42 → 新333 |
|---|---|---|
| C55仓库登记 | adapter PRIVATE依赖DB，真实仓库目标构建后执行原3/144，不改变受审适配或生产PUBLIC面 | 三配置原编译2/运行0 → 三配置编译/运行0、3/144通过；无overlay |
| C56源锚点 | trace_boundaries.sv四位q=d，父constant/expr/wire，outside d到inside d/signal d/outside q；whole4/clip1+2、side-aware实际位关系、冷热ID、shared/per/cache0/64MiB | constant/expr原complete空 → 全部完整非空正确路线 |
| C56预算/side控制 | 起点及源锚点工作计预算，nodes1/edges0需partial；同side相交在depth0零边，跨side不能零边等同，不同位不可误连 | 原expr两预算complete空 → 全部正确partial；旧constant/wire/inside/零边/不同位控制保持 |
| C57语义深度 | primitive及known-width unknown方向pin直接起点，combinational/full语义frontier0；实际binding到达1；structural完整停止、maxDepth0正确预算frontier | 原直接起点depth1 → 0；真实绑定/策略/预算控制保持 |

旧红基线及B检查器补强历史保留于提交a4410e4的[M3_C56_C57_BASELINE.md](M3_C56_C57_BASELINE.md)/JSON，不覆写：API三配置各1通过/3失败、1520成功/328失败断言、runner42；CLI各2通过/3失败、退出1。旧C55受限overlay认可不冒充旧原登记已修复。原R2/37a/8a结果亦保持，不转记为这次新执行。

固定产品的fixture/CPP/最终CLI与B冻结SHA完全相同，分别4b20d69a…/32b31672…/41be926f…；两树测试CMake SHA同bc1edb6f617375b29e5a3531d0caa8641dbef3067cb5b0296b7e42fab2d5e7a7。未通过放宽/skip/xfail取绿。

## 本轮实际三配置结果

普通RelWithDebInfo、Debug、RelWithDebInfo+ASan/UBSan；HIER_TEST_M3=ON、HIER_BUILD_EXPERIMENTS=OFF。产品及九仓库API-j3，外部十目标-j2（九语义/适配加RSS probe），严格-Werror；原单次CLI超时40秒未调整。A/C并发执行，墙钟仅记录、不作性能SLA。

| 集合 | 普通 | Debug | ASan+UBSan |
|---|---|---|---|
| 产品/四消费者/九仓库API构建 | 退出0 | 退出0 | 退出0 |
| 九仓库API直接XML报告 | 9套、35用例/34828断言通过 | 同左 | 同左 |
| 同九API仓库CTest实际登记入口 | 9/9，退出0，0.68s | 9/9，退出0，1.81s | 9/9，退出0，2.47s |
| 九独立外部API | 9套、35用例/34828断言通过 | 同左 | 同左 |
| 原80CLI | 72通过/8失败/0skip，退出1 | 同左 | 同左 |
| 原step边界3CLI | 3/3，退出0 | 同左 | 同左 |
| 新trace边界5CLI | 5/5，退出0 | 同左 | 同左 |
| M2/基础/共享/分层CTest | 27/27，退出0，25.11s | 27/27，退出0，39.06s | 27/27，退出0，167.83s |

九API断言明细（每配置、每入口分别执行）：expr/library 5/13852；D01 3/388；diagnostics 3/608；lookup 5/10365；occurrence 3/1768；step 6/5207；限定适配3/144；C53/C54边界3/648；C56/C57边界4/1848。直接XML、CTest、外部runner是分别运行，不把三个入口重复统计为不同oracle用例。C53/C54旧绿回归保持，不由新trace重开。

三组CLI分母原80/step3/trace5分开；合并观察为**88方法、80通过/8缺source失败/0skip**，不是另一次88命令。八失败为source7+source相关errors1，全部entry_not_implemented；未到达深层source断言。混合原15API实际语法编译仍退出1，缺source/SourceKind/resolveSource/readSource/checkInputs，运行0；未拆改原集合。

全部正常集无额外ASan内存/UB报告；保留既有三条frontend消费者重复链接提示和adapter的DB/frontend重复提示，无新增C++警告。无仓库统一formatter，不称全量格式门禁完成。JSON解析、计数一致性和git diff --check作为本次记录检查，不替代产品测试。

收尾再次确认验证树干净detached333c484、三配置缓存及共享第三方/契约SHA；B core/tests相对a4410e4差异为空。两次只读路径核对先误指B依赖路径/主树B缓存，已按实际缓存纠正，成功复核记录在JSON finalRecordChecks；不将路径错误记作产品失败或成功检查。

## 原生相对RSS与版本

原provider open scaling四方法4/4、退出0；depth3/4/5、fanout10、每尺度三独立进程、原seed524437/相邻3×及总体5×阈值不变。none/empty/miss中位数bytes均8585216 / 8585216 / 8765440；sparse8585216 / 8585216 / 8798208，最大约8.39MiB。只open/snapshot/diagnostics，不当query物化/取消或M7绝对容量证明；Debug/ASan不运行原生RSS门禁。全部36样本和输入SHA见JSON。

实测protocol2/schemaVersion5；公开Design/Trace/Schema头SHA与前一固定1f42相同，实际静态消费者重新链接。既有模型版本/ABI边界继续遵守，不从三个头SHA/版本值推导全部ABI或M4权威机器Schema/TS一致性。

## 命令与限制

产品树各独立配置使用cmake -S core -B core/<build-b|build-b-debug|build-b-asan>，显式HIER_TEST_M3=ON/HIER_BUILD_EXPERIMENTS=OFF，保留既定build type/ASan设置；构建hier、hier_tests、b_review_api、b_followup_api及九b_m3 API目标。核对CTest-N有九实际API，再执行以b_m3精确名称结尾的九目标选择集-V；前序27按unit/b_review_api/b_followup_api/cli_version/verify_sharing_/layering_/m2_选择。

B外部runner链接固定产品自建库，先重构建十目标再各API --reporter xml；B测试树HIER_BIN分别运行run_baseline.py的原80选择集、单列test_step_boundaries、单列test_trace_boundaries。失败wrapper保留所有方法状态/category/eventCount、首个完整事件及非零退出；原生另provider scaling及混合未来API语法检查。完整命令/目录/退出码见JSON。

未执行whole check.sh、全部未来M3目标构建/完整CTest、A自测、真实设计独立verify、Linux/远端CI/TSan/fuzz/mutation/覆盖率。通用observer、热逻辑体准入/seek/候选/中间物化计数、索引/产出循环取消及确定性时钟仍无交付/受审，不用预取消/输出条数/墙钟/RSS替代。混合API中的其他深层trace历史/frontier游标仍未执行，不从本四位子集推导全面trace正确。CLI→Core不是Electron IPC；M4 NDJSON/Schema/TS和后续React/UI未交付，首版持久化/工程恢复/迁移/撤销重做不适用。

## 交接

**C：** C55固定仓库集成及C56/C57原冻结三配置已独立复验通过，正式关闭仍归你；仅放行对应子集，剩余observer/source/深层trace缺口不改绿。

**A：** 原样保留全部oracle/阈值和1f42红历史，本轮没有新增实现缺陷；后续source/observer顺序按协调决定，不能用本报告宣称完整M3交付。

**协调者：** 可登记本固定修复B复验完成、三项冻结子集通过，待C正式结论；M3全量仍不通过。B独立提交报告/JSON，主树只追加本人记录，不夹带他人内容或更新调度表。
