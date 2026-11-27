# Agent B：M3 独立测试冻结及修改前基线（2026-10-11）

## 结论

测试冻结 `92d8f08`（`test/m3`），**60 个 Python 方法 + 15 个 C++ API 用例**。
基线 CLI 实际 **4 通过 / 56 失败 / 0 skip**，退出1；API 编译退出1，**15 用例未运行**。
M2 旧回归门禁 **27/27 通过**。这是 M3 未实现基线，不是 M3 交付通过，也不是 M2 被撤销放行。

设计/逐项 oracle/输入 SHA 见 [INDEPENDENT_M3_TEST_PLAN.md](INDEPENDENT_M3_TEST_PLAN.md)。
逐方法状态及每次失败 traceback 末650字符、编译错误行见
[m3_baseline_cli.json](m3_baseline_cli.json)；不把重复 subTest 错误数当测试方法数。

## 固定证据对象与独立性

- 产品基线：`e8f6087a40433ac8c21aee45ed1afea5f82bbed8`，独立 detached 工作树 `dft_hierachy-b-verify`，运行前后产品工作树干净。
- 获 C 放行的公开 DESIGN SHA：`e8217ff1afcddf83cee27814c70727310767544d74cd95636a4024e0f4d48ab2`；C 日志中对应文档提交 `1eda5be`。按文档及基线公开头文件设计，未查看 M3 实现/实现diff/自测来反推预期。
- 执行机：macOS 26.0.1 (25A362)，arm64，CMAKE_BUILD_TYPE=RelWithDebInfo。
- 固定二进制：`dft_hierachy-b-verify/core/build-b/hier`；SHA-256 `de49d8d5c19b8270a65d982af718d28b902e7b2d192689700e511bc408826178`。本轮从该基线重新构建 hier 及三组原有 C++ 测试。依赖取已固定源码缓存，没有更新 Slang/Catch2。
- 测试和输入在完整语义基线运行前提交；之前仅运行输入合法性/原有 verify-facts 控制。源文件小型合法控制21组×两模式通过；另验证固定生成器完整字节输出一致、大型输入 errors=0/warnings=0、fast/bodyCount7。
- 冻结后只做两种 harness 适配：诊断记录器将 unknown-option 与 unknown-command 一起归为入口未实现；两个正页大小比较显式转 size_t 避免未来 -Werror 符号比较。未删断言、改期望或添加skip。适配后重跑60方法，各方法通过/失败状态与首次运行完全相同，API编译仍退出1。

## CLI 基线结果

| 组 | 方法数 | 通过 | 失败 | 首次失败层次 |
|---|---:|---:|---:|---|
| inputs | 2 | 2 | 0 | 输入合法/原有事实控制通过 |
| expr | 11 | 1 | 10 | 现有proc返回但缺根width/type及新表达式形状；投影断言多数在width处先停 |
| step | 8 | 1 | 7 | 现有step缺fact/per-continuation字段；unknown候选缺reason/终点形状未收敛 |
| trace | 18 | 0 | 18 | CLI不接受policy/from-lsb/to-side等新选项，未取得追踪图 |
| lookup | 9 | 0 | 9 | resolve-path/def-instances未知命令，search新kind/scope等选项缺失 |
| source | 7 | 0 | 7 | source的kind选项入口缺失，尚未到反查/span/read语义 |
| errors | 5 | 0 | 5 | 新方法合法成功控制失败；不把旧解析器拒绝选项算负例通过 |
| **合计** | **60** | **4** | **56** | **0 skip/xfail** |

原本通过的四个完整方法：

1. `test_inputs.Inputs.test_all_handwritten_inputs_compile_in_both_modes`。
2. `test_inputs.Inputs.test_existing_fact_checker_controls_small_inputs`。
3. `test_expr.Expressions.test_procedural_source_has_no_value_expression_tree`：always_comb 无expr/exprMap。
4. `test_step.Steps.test_unknown_width_is_not_a_fabricated_one_bit_or_unconnected`：EMPTY() outside 缺宽度不伪造位段，正确unknown_pin_width。

56个失败按执行深度区分：

- **39方法停在新CLI入口/选项**：不声称已经运行对应图、路径、搜索、源码或错误输入语义。实际错误例 `unknown option --policy`、`unknown option --from-lsb`、`unknown option --kind`、`unknown command resolve-path`；均非零退出。
- **17方法获得现有proc/step/endpoint回复但未满足新契约**：10个expr方法、7个step方法。多数在缺width/fact/reason处即停；不能把后面的位投影、整棵树或分页深层断言都说成已执行失败。
- unknown-direction 方法的子场景还实际观察到终点仍为 blackbox_pin 而不是新契约要求的单个 unresolved；这是新收敛契约的待实现差异，不据此放宽预期。unknown_pin_width 完整方法保持通过。

所列“首次失败”是执行事实，不是测试设计依据；完整冻结 oracle 仍以独立计划与源码断言为准。

## C++ API 可用性

针对固定基线公开头文件，对 M3ApiTest.cpp 执行 C++20 `-fsyntax-only -ferror-limit=0` 与原工程的严格 warnings/-Werror，退出 **1**，编译器报告 **123 个错误**。首先缺 TracePoint、TraceResult、SearchQuery，随后缺 search/instancesOf/cone/paths/resolvePath/source/resolveSource/readSource/checkInputs、新取消签名/ErrorCode::Cancelled、Hop.fact/Continuation.from。

123 是带级联与 Catch2 宏展开的编译诊断数，**不是123个独立功能缺陷/测试失败**。没有链接或运行新API测试，故不得声称高扇出同快照分页、乱序/缓存、取消、源码游标、十万命中全页或资源释放已获运行证据。当前未有可编译新类型，测试本身的后续类型表示适配也未验证；适配只能保持原oracle。

## 修改前 M2 回归

```sh
ctest --test-dir dft_hierachy-b-verify/core/build-b \
  -R '^unit$|^b_review_api$|^b_followup_api$|^cli_version$|^verify_sharing_|^layering_|^m2_' \
  --output-on-failure
```

实际退出0，**27/27**，含18个旧单元/API/CLI/导航共享/分层控制门禁、9个M2语义/资源入口；不选择Agent A新阶段自测。M2 Python为79语义方法 + 1资源方法。
三组既有C++二进制另行直接运行：unit **18用例/1343断言**，b_review_api **4/376**，b_followup_api **4/544**，总 **26用例/2263断言**均通过；不存在文件的stderr属于原有负例，进程退出0。

与产品基线比较 `core/tests/m2` 及原有API测试无差异。本轮不重复先前Debug/ASan/Linux/真实设计/mutation执行，不能将它们写成本轮通过；本次27也不是远端CI或主工程M3全部CTest。

## 交接和未覆盖项

A 可以吸收独立冻结及本报告，选择 HIER_TEST_M3=ON 后必须以固定实现head重新验收；缺接口/编译失败不可skip成绿。B的旧M2断言保留。

C已关闭C-46～C-48的**设计问题**，不是免除其实现验收。执行中取消/时钟控制、页内游标重试、逻辑体访问及SourceHit物化计数、强制索引失效、真实缓存淘汰仍需受审测试适配；本轮预取消/输出页大小不能代替成本证据。合法exprMap unresolved输入、C++可选filter/side表示及M4～M7清单仍见计划的待办，不推测实现。

协议/Schema/TS/UI/IPC、并发竞态、撤销重做、文件工程兼容和全局资源阈值不在本次通过声明。新项目首版不提供session保存/恢复，遵守用户已定范围，不套用旧工程规范。
