# Agent A：R2 C-55/C-56/C-57 修复验证

## 固定范围

- 产品：`333c4844ce17748a478461fcc585587c4128a802`，分支 m3。
- 契约：DESIGN SHA256 `487211cec837aed48879f9915372780f1c03b7b0adf61cccbcbc4bb36a6e89e0`。
- B 测试：`b64338b690fe8415ce26dfd673d9bfc895e7fa1f`；C-55 适配 `a8aa140`。
  连同所需计划、报告、红基线 a4410e4 原样吸收。B 源码/fixture/预期对照无差异。
- 执行者为 A；本报告不是 B/C 的独立验收。C-53/C-54 已由 C 关闭；C-55/C-56/C-57 正式关闭仍归 C。
- 命令均从 `/Users/jiangbowang/MOI/2025/dftartist/2026.9/dft_hierachy` 执行。
  macOS 26.0.1 arm64，Apple Clang 17.0.0，CMake 4.0.2，Node v24.21.0。

## 实现及兼容

C-55 原样加入测试目标 PRIVATE hier_db 依赖。C-56 在 L3 根据端口方向和原始
PortInternal 段插入 outside→inside 锚点；常量或表达式提供的输入 pin 值也能进入本体。
锚点的节点/边/深度都计费，分段定位不用逐位展开，inside step 保持自己的 side 与分页语义。
C-57 只在实际消费已证明绑定后增加语义 frontier 深度，同点 boundary 不加一。
Step 的私有锚点补足已到达、但内部关系尚未解析的端口证据；unknown 起点保留请求切片和 side。

主要改动：`core/query/src/Trace.cpp`、`Step.cpp`；A 的 TraceTest/OpaqueBindingTest/trace fixture；
B 的原生测试登记依赖。没有改 M0–M2 事实；M3 原 outside 源漏报和错误深度被纠正，
新增锚点会改变对应图和小预算结果。公开 C++ 头/ABI、JSON 结构、Schema 5 / protocol 2、
IPC、配置、插件及工程文件均未改，无新增生产依赖。

## 实际验证

完整命令、退出码、日志 SHA、逐方法结果与构建告警保存在 `m3_r2_a_verification.json`。
原始日志 `/tmp/hier-a-r2-*.log`，执行清单 `/tmp/hier-a-r2-manifest.json`。

### 标准构建、前序回归与 web

```sh
PATH=/Users/jiangbowang/.npm-global/bin:$PATH JOBS=4 ./check.sh
```

退出 0：RelWithDebInfo **43/43**，Debug **43/43**，ASan+UBSan **45/45**
（含两个 sanitizer 故意失败控制）；web 类型、分层及五个违规探针通过。
这是当前默认全目标构建及 CTest；HIER_TEST_M3 默认仍 OFF，不能据此称完整 M3 通过。
普通构建额外执行 `ctest --test-dir core/build -R 'a_m3_(trace|opaque_binding)$' -V`，
退出 0：A trace **10 用例/5006 断言**，opaque binding **7/457**。

### 仓库原生 M3 API

以下对 `core/build`、`core/build-debug`、`core/build-asan` 各执行一次；构建完成后才运行测试，
不在消费者链接时写其依赖归档。产品及 Slang 使用各配置自己的构建输出。

```sh
cmake -S core -B core/build -DHIER_TEST_M3=ON
cmake --build core/build --target b_m3_expr_library b_m3_blackbox_loop \
  b_m3_library_diagnostics b_m3_lookup_increment b_m3_library_occurrence \
  b_m3_step_increment b_m3_step_adapter b_m3_step_boundary b_m3_trace_boundary -j 4
ctest --test-dir core/build \
  -R '^b_m3_(expr_library|blackbox_loop|library_diagnostics|lookup_increment|library_occurrence|step_increment|step_adapter|step_boundary|trace_boundary)$' \
  --output-on-failure -V
```

三配置均构建退出 0，CTest **9/9**、合计 **35 用例/34828 断言**、退出 0。
其中 C-55 adapter **3/144**，C-53/C-54 边界 **3/648**，C-56/C-57 新边界 **4/1848**。
这是修复后的仓库原入口，没有测试 overlay；本轮未重复外部 runner。

### 完整 CLI 与尚缺接口

```sh
HIER_BIN="$PWD/core/build/hier" python3 core/tests/m3/run_baseline.py \
  test_inputs test_expr test_expr_safety test_expr_boundaries \
  test_step test_step_boundaries test_trace test_trace_boundaries \
  test_lookup test_lookup_edges test_source test_errors
cmake --build core/build --target b_m3_api -j 4
cmake -S core -B core/build -DHIER_TEST_M3=OFF
```

三配置完整 CLI 各 **88 方法：80 通过/8 失败/0 skip，退出 1**。
新增 trace 五方法三配置均通过。失败项 source 七方法及 source 错误一方法均为
`entry_not_implemented`，没有将缺入口记作通过。分母为原 80 ＋ step 边界 3 ＋ trace 边界 5。
混合 API 目标因缺 source/SourceKind/resolveSource/readSource/checkInputs，三配置编译均退出 2，
原 15 用例未运行；没有拆分、skip 或改 oracle。三配置均已成功恢复 HIER_TEST_M3=OFF。

## 限制、告警与交接

- 严格编译无新增 C++ 警告；标准构建四处既有 duplicate libhier_frontend 链接提示仍在。
  B 已认可的 C-55 测试适配也保留 duplicate hier_db/hier_frontend 链接提示，不称零告警。
- 相关 diff 空白检查通过；C++ 没有仓库 formatter 配置，不能声称运行过全量格式化/lint。
  未添加未经说明 TODO；只提交本人产品/回归/报告与明确交付的 B 提交，共享日志和协调文件不夹带。
- source 系列与确定性成本/索引产出中途取消/时钟 observer 仍未交付，完整 M3 不放行。
  已有预取消、ASan 或有限输出不代替上述证明。
- 本轮未重复真实设计、RSS 资源门禁、Linux、远端 CI、TSan、fuzz。L1/L2 未变，旧轮证据不冒充本轮执行。
  首版不持久化；dft-suite/Electron/NDJSON 属后续集成，UI 功能单测、IPC 和旧工程加载对本修复不适用。
- B 重点：固定 SHA 的 C-55 原入口、源端口三种父连接、整段/切片、不同 side、冷热/cache0、预算和语义深度；保留所有原门禁。
- C 重点：内部映射是否足以证明锚点、真实绑定与 boundary 的深度区别、所有权/计费/取消检查、原 step 单侧语义不变；由 C 正式关闭三个编号。

已按协调规则交固定 SHA。source/observer 顺序仍待后续协调，本轮不扩大范围。
