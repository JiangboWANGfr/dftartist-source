# R1-B：固定37a1b3c独立step验收（2026-10-11）

**结论：step不放行。** 原冻结及新增基本语义、C认可的限定取消/LRU子集与前序回归通过，但收尾独立补测在三配置复现 **C-53/C-54**。两项交A修复、固定head后复验，正式关闭归提出方C。完整M3原80 CLI为52通过/28失败，不等于整个阶段完成。

## 固定范围与独立冻结

产品37a1b3cb7797be47b62fafd18a1a216e9348d403；原修改前8a944f0bf8a32ca4c4b0b321f478d7a392ff6511。DESIGN SHA487211cec837aed48879f9915372780f1c03b7b0adf61cccbcbc4bb36a6e89e0，§4.3/4.4/5.4/5.5.1/5.5.2/5.5.7。B在detached独立验证树重编产品/消费者，主树A在途代码不读不改，不使用移动二进制。强制日志暴露A概述与C反例，不标严格盲审；oracle来自契约、独立fixture和手算，不读取A实现/diff/自测代码或C探针源码。

测试分支test/m3，以fba2a495为底；产品分支不切到B测试分支，独立runner只链接B固定库。新增只涉及测试/注册/fixture/docs，不变更产品/API/IPC/Schema/工程格式；原80 CLI/未来API及前序资源/诊断oracle全部保留。

| 冻结/记录 | 提交 | 范围 |
|---|---|---|
| 首冻step公共API | 6fb04d439851374dcfd481c0e4d9445aa4d3999c | 6用例与新fixture/计划 |
| 待审适配机制 | b612b93 | 先交C，未预先执行 |
| B测试前提纠正 | a6db518→a2f65a4→ec2276e | 连续映射分区、原事实片段、不隐式翻面；旧失败保留 |
| C认可后适配冻结 | 3c00e0494f6a722f300f1cafeae2f80580379415 | 真实L2/L3内部集成3用例 |
| C53/C54新边界 | 551dc4d34865551ae4dad6669cf7df24200ecb06 | 独立3 CLI+3 API、streaming合法对照 |
| 边界编译适配 | 2e6411ee6dfbe2b23cf0870bce69266ed122081f | Catch2 &&外括号，不改表达式/期望 |

输入/预期/判断依据：[step计划](M3_R1_STEP_PLAN.md)、[C认可适配计划](M3_R1_STEP_ADAPTER_PROPOSAL.md)、[新边界计划](M3_R1_STEP_BOUNDARY_PLAN.md)。逐方法/断言/退出码/构建日志/全部RSS/二进制与输入hash：[机器证据](m3_r1_step_verification.json)。

## 修改前基线与早期测试失败

旧8a实际step CLI8为 **1通过/7失败/0 skip、退出1**，fact/continuation字段缺失及unknown方向行为错误，未知宽度outside用例本已通过。首冻新API在旧头编译退出2，缺Hop/Continuation新字段，运行0；不称每条语义断言都测红。限定适配及后加边界没有在8a再次运行；边界的修改前红对象是当前待修复37a，不凭这轮结果断言引入提交。

新公共API首冻在37a普通为5通过/1失败，4717成功/1失败断言。第二、第三冻三配置分别5/1、4762成功/1失败及4765成功/2失败；都是B在分区数量及outside→inside隐式跨面上的错误前提，与契约相冲突。按契约纠正/重新冻结，不改fixture、手算位关系、其他断言或旧oracle，不报A产品缺陷。C后续日志认可显式side纠正依据。最终6/6、5207断言。

边界API首次三配置编译退出2，Catch2不支持裸&&分解；加外括号后重编退出0、语义仍红。手动版本观察一度误用hier version退出2，正确hier --version退出0；是命令错误，不报产品缺陷。完整80两次输出被工具截断，均退出1；最终独立重跑保留全部方法状态/category计数及首事件摘要，确认52/28，不把工具截断当产品错误。

## B实际三配置结果

macOS arm64，RelWithDebInfo / Debug / RelWithDebInfo+ASan+UBSan；HIER_TEST_M3=ON、HIER_BUILD_EXPERIMENTS=OFF，-j4。第三方源码只读复用，产品/公开模型消费者/外部API重新编译链接。没有新增C++警告，原三个重复frontend库链接警告和mimalloc配置建议仍在。

| 集合 | 普通 | Debug | ASan+UBSan |
|---|---|---|---|
| 原42 CLI + 原step8 | 50/50，退出0 | 同左 | 同左 |
| 新公共step API | 6/6、5207断言 | 同左 | 同左 |
| C认可取消/LRU内部集成 | 3/3、144断言 | 同左 | 同左 |
| C-49库API | 5/5、13852断言 | 同左 | 同左 |
| C-51诊断API | 3/3、608断言 | 同左 | 同左 |
| lookup API | 5/5、10365断言 | 同左 | 同左 |
| occurrence API | 3/3、1768断言 | 同左 | 同左 |
| M2/基础/共享/分层 | 27/27、34.93s | 27/27、49.42s | 27/27、176.73s |
| 新C53/C54边界CLI | 1通过/2失败、退出1 | 同左 | 同左 |
| 新C53/C54边界API | 1通过/2失败；584成功/64失败断言、退出42 | 同左 | 同左 |

均0 skip；sanitizer运行未出现内存/UB报告。失败是确定语义红例，不因为sanitizer绿而放行。原80普通CLI **52通过/28失败/0 skip、退出1**，剩余trace18/source7/相关errors3入口未交付，未到达深层断言不记通过。新3边界CLI单列，不加入原80分母。原混合15 API/D01未来3 API本轮未编译运行。

## 两项阻塞缺陷与手写对照

C-53：原flow.sv EMPTY inside查询back/forward给partial/blackbox，正确是partial/unknown_pin_width；outside、强行指定非空bits拒绝及已知width未知direction控制通过。只误原因，不夸大为虚构一位/complete。

C-54：独立step_boundaries.sv的absent cell P连接合法{<<{data}}。data4整段及clip1+2，反向step/drivers漏可能输出；普通实际诊断进一步确认 **back/forward step及drivers/loads均空且complete、reasons=[]**。known-width/unknown-direction不能证明没有前驱/负载，须保留有原因的可能关联，不猜方向/精确位图。declared及独立库In/Out4对照全部通过：input无驱动/前驱且complete、正向有读关系，output不能empty complete；V1 streaming输出允许unsupported，不要求未规定的精确映射。

新CLI三方法每配置有C53四失败事件/C54八失败事件；API64失败断言是重复配置/方向/位段上的两个缺陷，不是64个不同缺陷。双方责任区分：这两项是产品缺陷；前述B分区/side和Catch构建问题是B测试问题。C-51/C-52已关闭保持，B不代C关闭C53/C54。

## 确定性适配的严格边界

C在REVIEW_LOG限定认可1–3后，B只读取既有Frontend/DesignDb/Step.h接口，不读Step.cpp或A测试。独立HandFrontend手写L0事实，真实DB/index/detail::step不替换。第1/3次实际提取返回时同步request_stop，入口token未取消；Cancelled不返回partial，同DB/原cursor重试以三child完整手算集合和提取计数证明取消本次未发布，已完成缓存保留。正预算16384、手写事实计费8192，两纯facts恰容纳；非零索引使两entry不能容纳，实际LRU重提取与保留facts/index shared_ptr/list借用均验证。

这是L2/L3内部集成及计费元数据测试，不称公开Design/CLI端到端、不当RSS预算。不证明热逻辑体准入计数、seek候选/中间物化、索引排序/产出循环取消。C第4项通用observer未提供/未获审，此类缺口交A方案→C审→B冻结。

## 资源与版本观察

原C-52相对RSS四模式4/4、退出0，fanout10/depth3/4/5，各三次独立进程，seed524437；原相邻3×/总体5×阈值未改。none/empty/miss中位数bytes均8585216 / 8585216 / 8749056，sparse8585216 / 8585216 / 8765440，最大约8.4MiB。只open/snapshot/diagnostics、error0/fast/bodyCount=depth+2，不以bodyCount代替RSS。不跑sanitizer资源阈值；A/C等会话并行影响耗时，时间只记录、不作绝对SLA。

观察protocol2/schemaVersion4，全部实际静态消费者重编，不称ABI兼容/M4 TS权威Schema一致性。上游Compilation.h/.cpp SHA仍为先前已校验值，未写共享上游源。没有新Slang扩展/SHA拒绝注入或外部ABI证明。

## 实际命令与未执行项

产品各配置：
```sh
cmake -S core -B core/build-b -DHIER_TEST_M3=ON -DHIER_BUILD_EXPERIMENTS=OFF
cmake --build core/build-b --target hier hier_tests b_review_api b_followup_api -j4
ctest --test-dir core/build-b \
  -R '^unit$|^b_review_api$|^b_followup_api$|^cli_version$|^verify_sharing_|^layering_|^m2_' \
  --output-on-failure
```

外部runner指定HIER_CORE_ROOT/HIER_CORE_BUILD/HIER_CATCH_SOURCE/CMAKE_BUILD_TYPE，ASan另B_SANITIZE=ON；六语义/限定适配API及边界分别--reporter xml，保留pipefail。测试树各HIER_BIN执行run_baseline.py的50/80及单列test_step_boundaries，精确选择和wrapper在机器证据。原生另执行test_library_open_scaling.py四方法。

没有执行whole check.sh、默认全部M3目标构建/完整CTest、A测试、真实设计verify-facts/verify-sharing、web/NDJSON/TS/React/Electron IPC/UI、Linux/远端CI/TSan、mutation/fuzz/覆盖率、全面文件/后台任务释放、M7绝对预算。CLI→Core是本轮真实集成链，不当Electron IPC；首版无session持久化，工程保存/迁移不适用。测试修改不涉产品/API/Schema/工程格式迁移。

**交接A：** 按顺序原样吸收B本轮测试/方案提交，修C53/C54且保留全部既有门禁，交固定head。**交接C：** 独立红证据支持两项，最终关闭仍归你；只认可已限定的适配证据。**交接协调者：** R1-B独立测试/证据交付完成，37a step因C53/C54不放行、完整M3仍红；后续修复复验由新固定对象派工。未擅自切到移动的cone/paths实现。
