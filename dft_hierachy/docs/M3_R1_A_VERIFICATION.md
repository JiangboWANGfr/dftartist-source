# R1-A：cone/paths 与 C-53/C-54 实现交接

## 固定对象与结论边界

- 执行者：Agent A；目录`dft_hierachy`，分支`m3`。
- 最终产品：`1f42fb2711764cfba863acc12a06b46b33f28c44`（主体53be0e4，加未知黑盒终点预算补修）。
- DESIGN SHA-256：`487211cec837aed48879f9915372780f1c03b7b0adf61cccbcbc4bb36a6e89e0`，未修改契约。
- B新增边界测试冻结：`2e6411ee6dfbe2b23cf0870bce69266ed122081f`；按B要求顺序吸收6fb04d4至a22ee50九个提交，原样保留oracle和资源阈值。
- 本报告是A执行证据，不是B/C独立验收。C-53/C-54等待C固定版本复核关闭；source和通用观察适配仍未交付，整个M3未完成。
- [机器可读证据](m3_r1_a_verification.json)包含实际命令/退出码、逐方法结果、日志/冻结SHA和资源原始数据。

## 实现及兼容

1. L0新增Trace类型/枚举/Budget；L3实现单事实step驱动的BFS、三策略、区间组合与路线筛选、环、黑盒同引脚跨位关系、端口锚点、语义/预算frontier、取消。
2. `TraceGraph.cpp`集中稳定身份、排序、入图计费与区间筛选；目标命中部分先停止，未命中部分继续。无位空间的目标保留语义缺口，不能给complete空图。
3. L2按实例保存原绑定索引位置并计入LRU；step提供私有、借用生命周期明确的锚点上下文。公开Hop保持此前字段，公开step默认行为只受下面两项修复影响。
4. C-53：未知宽度原因不再被bodyless inside兜底覆盖。C-54：修正streaming位宽/独立投影、库output赋值分支，并在L1保存unknown复杂左值的可写区间；step索引及M2 drivers共用它。动态selector和纯rvalue不充作可写目标，输出streaming未精确建模时仍保留unsupported。
5. M2行为变化：原来漏报的可能输出/输入关联不再返回complete空集；原精确依赖契约保留。`PinBinding::possibleWrites`为默认空的内部提取元数据，不新增bindings JSON字段；计费和occurrence引用转换同步更新。
6. L4集中序列化Trace，CLI仅解析参数和调用Core；整对象范围在Core中解析并纳入查询计时。新增C++ cone/paths及便利重载，schemaVersion **4→5**，protocol **2不变**。C++模型布局/静态消费者必须重编，不承诺ABI兼容。无新生产依赖；无Electron IPC、插件、用户配置、工程格式或持久化迁移。

## 固定产品验证

使用Node **v24.21.0**；默认三配置HIER_TEST_M3仍OFF，另外显式运行B冻结CLI/API，不把默认CTest当作完整M3。

| 实际命令/入口 | 结果 |
|---|---|
| `PATH=/Users/jiangbowang/.npm-global/bin:$PATH JOBS=4 ./check.sh` | 退出0。RelWithDebInfo **43/43**、Debug **43/43**、ASan+UBSan **45/45**；包含两个sanitizer有效性控制。web类型、分层及5个违规探针通过。 |
| 默认CTest中的`a_m3_trace` | 三配置各 **8用例/1450断言**；部分目标/剩余语义分支、表达式端口、重复actual映射、百万位区间、最短命中、页内游标、缓存/共享、预取消及巨大时间值回归。预取消不代执行中取消。 |
| 默认CTest中的`a_m3_opaque_binding` | 三配置各 **6用例/391断言**；C-53/C-54、选择器/rvalue负对照、已知方向及事实自检、无对端黑盒终点身份、未知对端计入工作图预算。 |
| B独立API外部runner（下方命令） | 三配置各 **8/8套件**，重新编译并链接当前产品；具体用例/断言见下表。 |
| B完整CLI 83方法（下方命令） | 三配置各 **75通过/8失败/0 skip，退出1**。8个失败均为尚未实现的source入口：source7及source错误检查1，没有运行到的深层断言不算验证。 |
| 混合`M3ApiTest.cpp`语法编译 | **退出1**，缺`source`/`SourceKind`/`resolveSource`；15个混合用例未执行，未拆改B文件取绿。 |
| `git diff --check`；对照a22ee50的B冻结路径diff | 退出0；B测试/输入未改。没有仓库C++ formatter配置，环境无clang-format；不把空白检查说成全量格式化。 |

产品严格`-Werror`构建通过，没有新增C++警告。三配置各保留原有4条重复libhier_frontend链接警告。

| B API目标 | 每配置实际结果 |
|---|---|
| b_m3_expr_library | 5用例 / 13852断言 |
| b_m3_blackbox_loop | 3 / 388 |
| b_m3_library_diagnostics | 3 / 608 |
| b_m3_lookup_increment | 5 / 10365 |
| b_m3_library_occurrence | 3 / 1768 |
| b_m3_step_increment | 6 / 5207 |
| b_m3_step_adapter | 3 / 144；C已审现有Frontend入口，L2/L3内部集成 |
| b_m3_step_boundary | 3 / 648；C-53/C-54原红例及控制 |

外部runner配置示例（工作目录为仓库根）：

```sh
cmake -S core/tests/m3/independent_api -B /tmp/hier-a-r1-api-rel \
  -DCMAKE_BUILD_TYPE=RelWithDebInfo -DB_SANITIZE=OFF \
  -DHIER_CORE_ROOT="$PWD/core" -DHIER_CORE_BUILD="$PWD/core/build" \
  -DHIER_CATCH_SOURCE="$PWD/core/build/_deps/catch2-src"
cmake --build /tmp/hier-a-r1-api-rel -j 3
ctest --test-dir /tmp/hier-a-r1-api-rel -E library_open_scaling --output-on-failure -V
```

Debug对应runner后缀debug、类型Debug、Core目录build-debug；ASan对应后缀asan、类型RelWithDebInfo、B_SANITIZE=ON、Core目录build-asan。均实际配置、构建、执行。

另执行`ctest --test-dir /tmp/hier-a-r1-api-rel -R library_open_scaling --output-on-failure -V`，退出0，1个CTest入口内4方法通过。
none/empty/miss/sparse在深度3/4/5独立进程的RSS中位数最大8716288 bytes，原相对门禁通过；不把耗时或RSS当作M7绝对容量承诺。原始数据在证据JSON中保留。

完整CLI实际命令如下；Debug/ASan分别替换HIER_BIN为对应目录。JSON保留每个方法状态、原始退出码及未交付入口，不设skip/xfail。

```sh
HIER_BIN="$PWD/core/build/hier" python3 core/tests/m3/run_baseline.py \
  test_inputs test_expr test_expr_safety test_expr_boundaries test_step \
  test_step_boundaries test_trace test_lookup test_lookup_edges test_source test_errors
```

混合API实际编译探针（未链接/运行）：

```sh
c++ -std=c++20 -fsyntax-only -ferror-limit=3 \
  -Icore/query/include -Icore/model/include -Icore/protocol/include \
  -Icore/build/_deps/catch2-src/src -Icore/build/_deps/catch2-build/generated-includes \
  '-DHIER_FIXTURES="core/tests/fixtures"' core/tests/unit/M3ApiTest.cpp
```

## 真实设计与验证过程

本轮实际执行（退出0）：

```sh
PATH=/Users/jiangbowang/.npm-global/bin:$PATH JOBS=4 ./check.sh --designs \
  /Users/jiangbowang/MOI/2025/dftartist/2026.9/nx9000/design/processor_core/processor_core.vc \
  /Users/jiangbowang/MOI/2025/dftartist/2026.9/openc910/design
```

- 普通/ASan均对照nx9000 **324实例**、openC910 **15848实例**，different=0、failed queries=0。
- 两配置的共享/逐实例verify-facts均mismatched=0。nx9000共享306个Slang比较/597自检，逐实例562/737；openC910共享42728，逐实例296867。
- 普通CLI真实trace冒烟分别从cpu_en和pad_yy_scan_enable查询：`cone s:0:0 --dir back --policy full --lsb 0 --width 1 --max-nodes 10 --max-edges 12 --max-depth 2`，两者均2节点/1边/complete；同点paths、maxDepth=0均1节点/0边/complete。
- 这组真实设计命令在固定提交前工作树执行；随后只修改Trace终点身份、无位空间目标处理、未知黑盒终点预算及A回归，L1/L2/M2事实/共享代码未再变化。固定产品另外完整重跑上述标准三配置和B门禁，不把较早的真实trace冒烟标为固定head复跑。
- 首次外部API链接与主构建写libsvlang.a重叠，退出2、malformed archive，是A验证编排错误。等待Core库构建完成后重新链接通过；固定head复跑按依赖顺序执行，未用失败产物作证据。
- 开发期间的-Wshadow、临时AST引用const编译错误以及A边界语义失败均已修复；未修改B预期来消除失败。

## 未完成、风险和交接

- source尚未实现，完整M3混合API/默认门禁集成仍未完成。M4权威机器Schema/TS、NDJSON，后续Electron/UI尚不适用；没有工程保存/旧文件迁移能力，本轮工程加载迁移测试不适用。
- 未执行Linux、远端CI、TSan、fuzz/mutation。web本轮执行类型/分层检查；没有把尚未实现的M4/M5独立客户端/UI测试列为通过。
- 通用test-only observer仍未提供：热缓存逻辑体准入、seek/候选/中间物化计数、索引构建及产出中途取消、确定性时钟证据待单独方案/diff交C审后由B冻结。不用预取消、输出条数、ASan通过代替这些门禁。
- B重点：固定1f42fb2重编复验原集合+C-53/C-54，新增cone/paths按位可达性、部分目标继续、表达式/两端端口side、黑盒自环、预算恰满与frontier游标、查询历史/缓存等价。
- C重点：C-53优先级、C-54位宽/左值候选与M2语义；工作图及区间筛选空间界限、未知引脚终点计费、原子入图、目标位段拆分、step锚点与端口表达式、取消/缓存借用、模型布局及JSON边界。条目关闭与新单元放行由C明确记录。
- 共享REVIEW_LOG和协调计划保留其他会话内容，A不修改调度表、不将它们夹带提交；A自己的代码、计划和证据单独提交。
