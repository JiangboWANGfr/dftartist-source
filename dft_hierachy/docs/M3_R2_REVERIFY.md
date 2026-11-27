# R2-B：固定1f42fb2独立修复复验

**结论：R2-B语义冻结子集通过；固定产品仍有C-55仓库测试构建错误。** C-53/C-54原红例、双向/裁剪/shared/per/cache0及合法方向控制在普通、Debug、ASan+UBSan三配置均通过；原step及指定前序回归未发现新增失败。收尾独立确认C-55并提供仅修测试依赖的独立提交，待A吸收。正式关闭仍归提出方C；source和未交付observer保持缺口，**不是完整M3放行**。

## 固定对象与独立性

产品`1f42fb2711764cfba863acc12a06b46b33f28c44`；DESIGN SHA256 `487211cec837aed48879f9915372780f1c03b7b0adf61cccbcbc4bb36a6e89e0`。原oracle HEAD a22ee50487c99c5f30f71c649707e2a52b66845f，C53/C54边界冻结2e6411ee6dfbe2b23cf0870bce69266ed122081f；本轮计划独立提交292026511be38b3eb7dc422d7c3fe4702b437053。**测试源、fixture和所有预期不变**；唯一代码适配是C-55测试目标PRIVATE依赖修正，独立提交a8aa1403b9d695175512448521c73cf34beff367；其他新增均为计划、报告和证据。

测试树`dft_hierachy-test-m3` / test/m3；产品树`dft_hierachy-b-verify` / detached固定1f42fb2，自有core/build-b、build-b-debug、build-b-asan及对应-api-boundaries目录。产品/静态消费者重新编译链接，不使用A移动主树二进制。只读复用校验过的第三方源码；上游Compilation.h/.cpp构建前后SHA保持fdff6130…/11ae44ba…。

依据DESIGN§4.3/4.4/5.4/5.5.1–5.5.4/5.5.7、独立fixture及手算oracle；不读取A实现/diff/自测代码或验证报告。强制最新日志暴露A概要，不能称严格盲测。当前实际集成链为CLI→JSON→Design→DB/Frontend，不是Electron IPC。

逐方法状态、用例/断言、命令、退出码、构建输出、hash及全部RSS测量：[m3_r2_reverify.json](m3_r2_reverify.json)；执行范围：[计划](M3_R2_REVERIFY_PLAN.md)。

## 验收条件与输入

| 集合/判断依据 | 冻结输入与预期 | 本轮结果边界 |
|---|---|---|
| C53 / §5.5.1–2 | flow.sv的EMPTY，inside/outside×back/forward均partial/unknown_pin_width，无虚构at/map/next；非空显式位段bad_request；已知宽度unknown方向为blackbox | 原红例和控制均通过，不猜引脚位宽 |
| C54 / §4.4、5.4、5.5.2 | step_boundaries.sv合法unknown streaming，data4整段及clip1+2，step back/drivers保留可能关联及blackbox原因，forward/loads非空；declared与独立LibraryProvider In/Out4对照 | 原红例、双向及所有方向控制通过；不要求未规定的streaming精确位图 |
| 原step / §5.5.2 | step_edges.sv高扇出全页并集、游标查询/快照/页大小/重试、绝对映射和显式side、四态常量切片、多驱动fact、寄存器覆盖/角色 | 六API与原八CLI通过；输出边界不冒充内部成本计数 |
| C受审限定适配 | 独立手写Frontend事实→真实DB/index/detail::step；第1/3次提取返回置stop，同DB/原cursor重试；8192事实与16384正预算、索引计费及借用owners | 三API通过，仅L2/L3内部集成，不证明索引/产出循环取消或实际RSS |
| 原trace / §5.5.4 | flow.sv小图：组合环、策略/primitive语义边界、mux角色、保守算术、寄存器事件、深度0、恰满/差一节点/零边预算、位关系组合、side和否定保证 | 原18CLI通过；同快照深层history/frontier游标仍在未编译混合API，不扩大结论 |
| D01黑盒 / §5.5.4 | expr_boundaries.sv独立库inout/ref二位单引脚，两方向跨位保守路线；策略停点/零边命中及unknown方向partial | 原三API通过，无新增oracle |
| 前序与资源 | 原库表达式/诊断/occurrence/lookup，M2/基础/共享/分层；原C52相对RSS四模式 | 均通过，阈值不变，不证明绝对性能SLA |

逐项冻结来源：[原M3计划](INDEPENDENT_M3_TEST_PLAN.md)、[step计划](M3_R1_STEP_PLAN.md)、[边界计划](M3_R1_STEP_BOUNDARY_PLAN.md)、[限定适配](M3_R1_STEP_ADAPTER_PROPOSAL.md)。

## 修改前红基线保留

历史独立37a结果在[M3_R1_STEP_VERIFICATION.md](M3_R1_STEP_VERIFICATION.md)及其JSON，未重跑转记为本轮证据：新边界CLI三配置均1通过/2失败、退出1；API均1通过/2失败，584成功/64失败断言、退出42；普通原80为52通过/28缺入口失败。旧8a及B前提/编译适配错误也继续保留。修复后新增边界分母仍单列，不把三方法塞入原80后改变历史分母。

## B本轮实际结果

macOS arm64，Apple Clang17.0.0、CMake4.0.2、Python3.13.3；三配置分别RelWithDebInfo、Debug、RelWithDebInfo+ASan/UBSan。均HIER_TEST_M3=ON、HIER_BUILD_EXPERIMENTS=OFF，产品-j3、外部API-j2；C另在独立目录运行，墙钟不作绝对SLA。

| 集合 | 普通 | Debug | ASan+UBSan |
|---|---|---|---|
| 产品/四消费者与九外部目标重编 | 退出0 | 退出0 | 退出0 |
| 原80CLI | 72通过/8失败/0skip，退出1 | 同左 | 同左 |
| 新边界3CLI | 3/3，退出0 | 同左 | 同左 |
| step新增API | 6/6，5207断言，退出0 | 同左 | 同左 |
| C认可取消/LRU适配 | 3/3，144断言，退出0 | 同左 | 同左 |
| C53/C54边界API | 3/3，648断言，退出0 | 同左 | 同左 |
| D01黑盒自环API | 3/3，388断言，退出0 | 同左 | 同左 |
| 库表达式/诊断/lookup/occurrence API | 5/13852、3/608、5/10365、3/1768，均退出0 | 同左 | 同左 |
| M2/基础/共享/分层CTest | 27/27，退出0，22.64s | 27/27，退出0，37.77s | 27/27，退出0，160.15s |

八套语义/限定适配API每配置共**31用例/32980断言**全部通过、0skip；资源为第九外部入口，仅普通执行。未出现额外sanitizer内存/UB报告；没有以sanitizer绿代替未验收的资源/取消门禁。构建保留既有重复frontend库链接警告，没有新增C++警告。仓库无统一formatter，不声称已运行全量格式检查。

原80剩余八失败全部为**source7 + source相关errors1，entry_not_implemented**；18 trace及两项trace/paths错误校验本轮新增通过。另单独保留一个source控制完整错误：合法top引用查询source --kind definition，退出2、bad_request/unknown option --kind。深层source断言未到达，不能称已测出八个语义缺陷。混合原15API实际-fsyntax-only退出1，缺source、SourceKind、resolveSource、readSource、checkInputs；**运行0用例**，原oracle未拆改/skip/xfail。

原80与新增3合并观察为75通过/8失败/0skip，共83；它是两次执行的统计合并，不是另一次83命令。R2-B子集通过不是整个CLI/M3全绿。

## C-55仓库入口：原失败与受限修正

原固定1f42fb2三配置实际单独构建b_m3_step_adapter均退出2，M3StepAdapterTest.cpp:3缺hier/db/DesignDb.h；该目标运行0。前述外部runner八套全绿**不能证明原仓库目标可构建**。这不是source未来API的失败，也不是C53/C54语义回归。

B仅在测试目标PRIVATE链接hier_db，不改变生产PUBLIC包含面或受审适配/预期。先独立冻结a8aa1403b9d695175512448521c73cf34beff367，再在B验证树叠加同一行测试登记，产品代码仍固定1f42fb2。验证证据单列为test-only overlay，不称原固定产品原登记已修复。说明见[M3_C55_BUILD_ADAPTATION.md](M3_C55_BUILD_ADAPTATION.md)。

三配置修正overlay后：八个已交付仓库API目标重编均退出0；仓库CTest实际8/8（31用例/32980断言），其中adapter原3/144；普通/Debug/ASan分别0.48/1.47/1.92s。外部八套runner另独立复跑，各31/32980全部通过，0skip、无额外sanitizer报告。不是原固定登记的通过，也不是完整M3全目标构建。

新增PRIVATE静态依赖使adapter每配置链接时报告一条重复库提示（hier_db、hier_frontend）；已保留原始输出，无C++警告，不隐去此构建提示。三个CLI产品二进制SHA与overlay前完全相同。收尾用明确补丁撤销本人一行overlay，重新配置原固定三目录，验证树恢复干净detached1f42；留下的已编译测试缓存不代表原登记能再次构建。测试分支保留修正a8aa140，待A原样吸收/C正式核对。

## 原生相对RSS

test_library_open_scaling.py原四方法4/4、退出0；fanout10、depth3/4/5、每尺度三独立进程、seed524437，只open/snapshot/diagnostics。原相邻3×/总体5×门禁不变，未用bodyCount代RSS，也不跑Debug/ASan的原生门禁。

none/empty/miss中位数bytes均8585216 / 8585216 / 8699904；sparse为8585216 / 8585216 / 8732672，最大8732672 bytes（约8.33MiB）。完整输入SHA/36个样本在JSON。资源测试期间有独立ASan回归等并发，时间只记录、不作性能承诺。

## 实际入口与结论边界

以下普通命令在B产品树执行；Debug/ASan分别替换独立目录和构建类型，ASan显式HIER_SANITIZE=ON。完整绝对参数及工具退出码在JSON。

```sh
cmake -S core -B core/build-b -DCMAKE_BUILD_TYPE=RelWithDebInfo \
  -DHIER_SANITIZE=OFF -DHIER_TEST_M3=ON -DHIER_BUILD_EXPERIMENTS=OFF
cmake --build core/build-b --target hier hier_tests b_review_api b_followup_api -j3
ctest --test-dir core/build-b \
  -R '^unit$|^b_review_api$|^b_followup_api$|^cli_version$|^verify_sharing_|^layering_|^m2_' \
  --output-on-failure
```

B测试树：指定HIER_CORE_ROOT/HIER_CORE_BUILD/HIER_CATCH_SOURCE配置independent_api，重编九目标；八语义/适配runner各--reporter xml并保留每项退出码/断言。先CTest-N核对九外部和27前序登记，不把零匹配当通过。各HIER_BIN执行run_baseline.py原80选择集及单列test_step_boundaries；wrapper只缩减失败文字展示，保留全部方法状态/category/eventCount和非零退出码。普通另跑原生RSS四方法及未交付混合API语法编译。

观察protocol2/schemaVersion5；公开模型及所有实际静态消费者重编。无ABI兼容结论，也不把常量和JSON版本相同当作M4权威机器Schema/TS一致性证明。本轮没有产品/API/IPC/Schema/工程格式修改。

未运行whole check.sh、默认全M3目标构建/完整CTest、A trace/修复自测、真实设计独立verify、Linux/远端CI/TSan/fuzz/mutation/覆盖率、通用observer成本/循环取消/确定性时钟，以及未编译混合API中的同快照trace history/frontier游标。M4 NDJSON/TS、后续React/Electron/UI未交付；首版session/工程持久化、恢复/迁移、撤销重做不适用本轮范围。没有以预取消、输出条数或RSS绿替代未验证行为。

## 交接

**C：** 原冻结C53 Medium/C54 High的三配置复验全部通过；是否正式关闭由你综合独立复跑和修复审查决定，B不代关。C55亦独立复现，必要测试依赖修正已单独冻结供你核对；上述observer/深层trace缺口保持。

**A：** 本轮未改任何oracle，原集合及边界修复通过；请原样保留。原样吸收C55一行测试构建依赖修正a8aa140及对应独立证据，交新固定SHA供C核对，不把原1f42仓库入口的失败改记通过。source仍未交付；后续source/observer顺序按协调者在R2-B/R2-C结论后决定，不从本报告自行扩大授权。

**协调者：** 可登记R2-B固定产品语义复验完成、冻结子集通过，另有C55测试构建适配待A吸收/C关闭；等待R2-C正式结论。完整M3仍有source/observer/深层trace等缺口，不登记整个M3放行。本报告与机器证据在B test/m3独立提交，主树只追加日志，不夹带共享内容。

### 收尾最新审查事实

提交前重读主日志，C已正式关闭C53/C54，并提出C56 High（outside输入源锚点漏路线）、C57 Medium（语义boundary多增frontier深度）。这里仅记录C审查状态，不把C执行转记为B证据；原B冻结集合绿不覆盖新反例。C55/C56/C57仍开放，固定产品不能整体放行。B按C交接继续从同一DESIGN/独立最小fixture补冻C56/C57，在新集合记录1f42红基线，后续报告单列，不回写本轮原80/三边界分母。
