# M3 source / observer：Agent A 实现与验证

## 固定对象与职责

产品 `3c2bdd210324737f82ea29c1afeed4c04727c495`，source 功能提交 `057169e`，
observer 初始私有适配 `18d49b8`，source/step/trace 机制回归提交 `3c2bdd2`。
DESIGN SHA256 `487211cec837aed48879f9915372780f1c03b7b0adf61cccbcbc4bb36a6e89e0`。
本报告全部执行归 A，不能替代 B 独立测试或 C 结论；B 冻结 fixture/API/CLI 未改。
用户最新明确要求继续 source 和 observer；共享日志仅追加，调度表留给协调者。

## 实现和主要模块

- L0 `Source.h`：SourceKind/Pos/Span/Hit/Read/InputCheck，以及跨 L1/L2 的快照文件/范围事实。
- L1 `Sources.cpp` 和原 `Connections.cpp`：按原有对象编号附带来源，声明项、实例、连接项、
  过程、register 共用物理范围规则。嵌套宏定位到最外层调用，include 保留物理文件，
  `-D`/宏展开虚拟缓冲不进入文件表。前端持有编译字节，给 L2 的 string_view 借用到 Frontend 析构。
- L2 `SourceIndex.cpp`/`SourceBytes.cpp`：规范路径文件表、不可变 SHA-256/字节行索引、共享范围分组；
  Occurrences 增加 byBody 导航。源文件读取和哈希来自同一次读取，严格 UTF-8，I/O 失败可诊断。
- L3 `Source.cpp`：四个 Design API；范围组内按数值引用序合并共享 occurrence 序列，
  游标定位后只构造本页 SourceHit，最多额外探测一个候选决定 next。没有全 occurrence 命中数组；
  队列只保留匹配共享序列的当前数值身份，首次建表成本单列，取消不发布半页/半索引。
- L4 `main.cpp`/`Json.cpp`：四个 CLI 命令、参数校验及集中序列化。
- `Observe.h`：默认关闭的私有同线程 RAII 观察者和测试时钟；source 事件位置见
  [适配说明](M3_OBSERVER_PROPOSAL.md)。Scope 禁止借用临时 Sink，回调 noexcept，不持有 span。
- A 回归在 `core/tests/a_m3/SourceTest.cpp` 和 `ObservationTest.cpp`。
  M3 全部冻结测试默认登记，check.sh 显式启用，保留未来 M4+ 独立门禁。

## 前序行为与兼容

修改 M1/M2 的 L1 提取以附带源范围、增加相应缓存计费；未改变原连接/访问/依赖事实。
L2 occurrence 增加按 body 的反向索引，继续沿用原稳定 InstKey 编号。
没有复制旧模块或重新解析当前磁盘来推导旧位置。

公开 C++ 新增类型/方法，Frontend 新虚方法提供默认空来源以兼容合成前端的源码；
BodyConnections 布局和 vtable 有变化，静态消费者必须重编，不承诺旧二进制 ABI 兼容。
Schema **5→6**、protocol **2**；旧 JSON 命令/字段含义保持。无新生产依赖，
无 Electron IPC、工程格式、配置字段或持久化迁移。M4 权威机器 Schema/TS 完整结构仍未交付。

## 固定版本执行

实际命令、退出码、耗时、日志 hash、CTest 和 XML 汇总见 [机器证据](m3_source_a_verification.json)。
标准入口为 `PATH=/Users/jiangbowang/.npm-global/bin:$PATH JOBS=4 ./check.sh`（Node24）。
RelWithDebInfo 的 observer OFF；Debug、ASan+UBSan 的 observer ON，后二者另登记 A 适配测试。
三配置均显式 HIER_TEST_M3=ON、HIER_BUILD_EXPERIMENTS=OFF，真实编译所有产品和消费者，
复用已存在第三方归档，不称从零全编。

| 实际执行 | RelWithDebInfo | Debug | ASan+UBSan |
|---|---|---|---|
| check.sh 完整 CTest | **62/62，退出0，15.86s** | **63/63，退出0，41.63s** | **65/65，退出0，128.90s** |
| 完整 CLI 单次集合 | **88/88，0skip，退出0** | 同左 | 同左 |
| 原混合 API XML | **15用例/102083断言，退出0** | 同左 | 同左 |
| A source XML | **4用例/566断言，退出0** | 同左 | 同左 |
| A observer XML | 构建选项OFF，不登记 | **7用例/225断言，退出0** | 同左 |

ASan 的65项包括两个故意失败的 sanitizer 有效性控制，它们被正确检出；正常产品执行无额外报告。
完整 CTest 还包含既有九套 B API（35用例/34828断言）、M1/M2/共享/资源/分层及前序 A 回归。
API XML和CLI复跑是另一次实际执行，不重复计成不同oracle。默认 check.sh 共253.109s、退出0。

逐项命令（三个cfg分别执行，不使用同一旧二进制冒充）：

```sh
HIER_BIN="$PWD/core/<cfg>/hier" python3 core/tests/m3/run_baseline.py \
  test_inputs test_expr test_expr_safety test_expr_boundaries \
  test_step test_step_boundaries test_trace test_trace_boundaries \
  test_lookup test_lookup_edges test_source test_errors
core/<cfg>/tests/m3/b_m3_api --reporter xml
core/<cfg>/tests/hier_source_tests --reporter xml
# 仅 Debug/ASan 的 observer ON 产物
core/<cfg>/tests/hier_observation_tests --reporter xml
```

Node **24.21.0** 下 `npm --prefix web run check`（由check.sh执行）通过类型检查、分层检查和五个反向探针。
另实际运行 `npm --prefix web run test:independent`：**11方法，1通过/10失败/0skip，退出1**。
失败为尚未交付的 M4 HierClient 八方法、M5 SelectionModel 两方法；唯一版本一致性方法通过。
这不是前端全部绿，也没有为M3实现或放宽后续阶段的测试。

### 真实设计冒烟与回归

普通配置实际执行，逐命令argv/耗时/hash在JSON的realDesigns。NX9000使用processor_core.vc，
OpenC910使用C910_asic_rtl.fl，CODE_BASE_PATH指向构建目录内已有/新建的gen_rtl链接，输入只读。

```sh
core/build/hier source i:0 --kind definition -f <filelist> --top <top>
core/build/hier read-source <source返回的file> -f <filelist> --top <top>
core/build/hier check-inputs -f <filelist> --top <top>
core/build/hier verify-facts -f <filelist> --top <top>
# NX9000还执行
core/build/hier resolve-source <file> --line <start.line> --col <start.column> --limit 1 -f <vc> --top processor_core
core/build/hier verify-sharing -f <vc> --top processor_core
```

以上 **10条命令均退出0**。两设计的原始字节/hash/read精确一致，checkInputs均changed=[]/complete=true；
NX反查首屏1项及next、complete。NX共享检查324实例、shared17体/per122体，different0/failed queries0；
facts为slangCompared306/selfChecked597/mismatched0；OpenC910 facts为slangCompared42728/mismatched0。
没有把普通真实设计冒烟称为ASan真实设计全量或M7资源预算证明。

开发阶段还运行了源坐标/哈希/分页的小集合；这些旧执行不重复算进固定版本结果。
开发中修复了：source 索引取消后多发事件、命令行 -D 虚拟文件误入表。
前者原 A observer 运行 5/6 用例成功、1 个失败断言；修复后再运行。失败的工具输出摘要保留在JSON，
临时XML已被成功复跑覆盖，不宣称仍有完整旧raw文件。B oracle 未改。
证据收集器首次只识别CTest的Test Passed、漏掉Test Pass Reason格式，已修正解析并核对62/63/65记录；
这是报告收集错误，未改产品、CTest或期望。git diff --check退出0，冻结B目录相对333c484零diff。

## 限制及 B/C 交接

- source 和 observer 已实现；完整 M3 仍须 B 固定版本独立复验、C 审 source 与 observer 适配，
  B 再冻结并执行 observer 的独立 oracle。A 的观察事件/自测计数不代替这些步骤。
- 首次源码范围索引会提取各模块体事实；该建表成本与热页分开。范围组和 occurrence 导航保留在快照，
  未宣称零建表成本或通过 M7 的绝对内存/时间预算。
- 未运行 Linux/远端 CI/TSan/fuzz/mutation/分配失败注入。C++ 无项目 formatter 配置；
  新代码人工按相邻风格整理，实际门禁是 diff 空白检查和严格 -Werror，不能声称全量 clang-format/lint。
- 既有 mimalloc 配置和 duplicate-library 链接提示保留；编译记录与正常 sanitizer 执行单独判断。
- 当前纵向链是 CLI→Core；Electron/NDJSON/UI 为后续阶段，不能称 IPC/UI 已验收。
  首版不持久化，本轮旧工程加载/迁移不适用。
- **B 重点：** 原 source CLI/15API、宏/include/-D/字节位置、共享/逐实例、10万 leaf 全页并集、
  改页/错游标/磁盘变化、取消重试；observer 获审后独立验证热逻辑准入、seek、候选和中间物化上界。
- **C 重点：** Slang 字节借用与文件表物理边界、宏端点、原编号与来源一致性、共享序列数值排序/去重、
  游标代次和有界物化、取消发布、表内 I/O、公开布局/Schema 变化及私有 observer 的 ODR/生命周期。
