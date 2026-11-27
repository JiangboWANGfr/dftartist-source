# 模块体共享：已核对的条件

对应 `docs/DESIGN.md` 4.1 和验证项 V1。快速路径（多个实例共用一次提取）只对这里记录的 Slang 版本有效。升级 Slang 必须重做本文件的两部分核对并更新版本号。

## 已核对的版本

| 项 | 值 |
|---|---|
| Slang 版本 | v12.0 |
| 提交 | `545f88b2ed3a2d20325fbd17413af177a6bca72f` |
| 源码标识 | `07b9237d652d3a61abd674ae487791fcd97fc0b0a896a6c797b879f4620480db` |
| 核对日期 | 2026-10-06 |

**源码标识**是对实现实例缓存的三个文件内容的哈希：`source/ast/ElabVisitors.h`、`source/ast/InstanceCacheKey.cpp`、`include/slang/ast/InstanceCacheKey.h`。它在配置构建时由 `core/cmake/Slang.cmake` 计算并编入产物，不依赖 git 信息，所以离线构建和没有 `.git` 的源码拷贝也能得到。

运行时启用快速路径的条件是三项全部相等：完整版本号（`12.0.0`）、预发布标记（空）、源码标识。任何一项不同或取不到，都走逐实例路径，`hier info` 和 `hier --version` 会说明原因。已核对的值写在 `core/frontend/src/Frontend.cpp` 的 `verifiedFrontend()` 里。

升级 Slang 时这三个文件只要有改动，源码标识就会变，测试 `cli_version` 和 `unit` 随即失败，直到重做下面两部分核对并更新 `verifiedFrontend()`。

## 第一部分：Slang 判定两个实例模块体相同的确切条件

依据源码 `source/ast/ElabVisitors.h`（`tryApplyFromCache`）和 `source/ast/InstanceCacheKey.cpp`。

**缓存键相同**，即以下全部相同：

- 定义（按定义对象的身份比较，不是按名字）。
- 模块体的全部参数：值参数比较展开后的值，类型参数比较类型是否匹配。
- 每个 interface 端口所连接的 interface 实例的缓存键（递归），以及 modport 名字。

**并且实例有资格参与缓存**，以下任何一条成立则没有资格：

- 实例由配置规则（config）解析得到。
- 实例或其内部是 defparam、bind 的目标（带有层次覆盖节点）。
- 实例带有"禁止缓存"标记（例如由 bind 创建的实例）。
- interface 端口所连的 interface 实例本身没有资格。

**并且模块体没有位置相关的副作用**，以下任何一条成立则不共享：

- 模块体内有向上延伸到实例之外的层次名字（同一个名字在不同父实例下可能解析到不同对象）。
- 模块体被标记为不可缓存的其他副作用。
- 实例位于某个层次赋值（从外部写入实例内部）的路径上：Slang 会撤销这些实例的共享标记。

## 使用时必须知道的三件事

1. **共享标记只在完整展开时才设置。** 原始 Slang 的常规公开入口是 `getSemanticDiagnostics()` / `getAllDiagnostics()`；单独 `getRoot()` 不足以建立标记。本项目的诊断前扩展阶段见下节，它在正常完整展开后调用。
2. **被共享实例的内部没有标记。** Slang 不会进入被共享实例的模块体，所以它里面的子实例拿不到共享标记。遍历时必须改走规范模块体的成员，不能走实例自己的模块体。实测：openc910 有 15848 个实例，带标记的只有 3048 个，但按规范模块体遍历实际只有 503 个不同的模块体。
3. **参数要记值，不能记覆盖表达式。** 参数的覆盖表达式写在父模块的作用域里，值相同的两个实例其表达式可以不同（实测：`fpga_ram` 的 `WRAP_SIZE` 与 `WRAP_SIZE_1`，值都是 1）。`BodyFacts` 里参数只能保存展开后的值。

## 第二部分：差分测试

方法：对每个实例**各自**生成其模块体内容的指纹，然后检查被 Slang 归为同一规范模块体的实例指纹是否逐字节相同。指纹是 Slang 自己对模块体各成员的序列化（声明、赋值、过程块、表达式），加上每个子实例的名字、定义、参数值和端口连接表达式。实现在 `experiments/Sharing.cpp`。

| 设计 | 实例数 | 不同的模块体 | 共享了先前模块体的实例 | 不一致 |
|---|---:|---:|---:|---:|
| `nx9000/processor_core` | 122 | 17 | 105 | 0 |
| `openc910`（顶层 `openC910`） | 15848 | 503 | 15345 | 0 |
| `tests/fixtures/sharing/adversarial.sv` | 30 | 26（按 Slang 的标记） | 4 | 0 |

对抗样例覆盖：向上引用、defparam、bind、参数不同的 interface 端口、层次赋值、值相同但覆盖表达式不同的参数、由参数选择的 generate 分支。

**对抗样例证实了"只看缓存键不够"**：仅按缓存键分组时，向上引用的那一对实例（`top.upa.u` 与 `top.upb.u`）被分到一组，而它们的内容不同（一个读 1 位，一个读 4 位并带类型转换）。Slang 的规范模块体标记正确地没有共享它们。

对抗样例的结果作为常备测试 `exp_sharing_adversarial` 运行。两个真实设计的结果用 `experiments/run_m0.sh` 复现。

## 结论

对 v12.0，Slang 的规范模块体可以作为快速路径的依据，前提是：打开设计时调用一次完整展开；按规范模块体遍历；事实里参数只存值；有 interface 端口的模块体按 `docs/DESIGN.md` 4.1 继续排除在快速路径之外。

## M2 补充：外部访问标记的 occurrence 边界（2026-10-10，C-37）

连接事实增加了被外部读取/写入的标记，M0 的骨架差分不能单独证明这个新字段可共享。实例数组中 `wire x = u[1].s` 的目标仍可能归入一个 canonical body；按词法路径赋标记会误标 `u[0]`，只比较 symbol 指针又可能漏掉 `u[1]`。

前端在编号模块体前先扫描唯一语义代表的连续赋值、过程块、网线初始化及实例/primitive/blackbox 的连接表达式。层次引用的源体、目标体及祖先体不复用规范体，指向这些规范体的候选也按实际体提取；重新遍历代表图，只对新暴露的 body 解析访问，直到没有新 body。外部访问标记只按目标 symbol 身份设置。这是本工程对位置相关事实增加的保护，没有修改 Slang 的缓存判据。

最初的 C-37 修复曾在扫描前深入所有实际实例，触发 C-44：即使没有层次引用，也把共享 AST 逐实例物化。现已移除该预遍历；无层次引用时只解析唯一代表，代表数量不变的重复子树不会被扫描。库引脚声明在扫描连接方向前读取并冻结，新增 body 若暴露新库名则只加载一次。inout/ref 和双向 primitive 的端点按读写记录，选择器仍只读。

固定回归在 `tests/a_m2/fixtures/review.sv` 的 `external_occurrence`：只有 `u[1].s` 的负载查询为 `partial/hier_ref`，`u[0].s` 保持 complete，共享与逐实例模式一致。真实设计差分继续作为门禁，不把该样例视为所有层次引用构造的证明。

`tests/a_m2/fixtures/rereview.sv` 另覆盖重复父体中的数组目标隔离及双向访问；`tests/a_m2/open_scaling.py` 对 1112、11112、111112 个共享实例分别启动三次新进程，记录打开时间和 RSS，并检查内存增长没有随 occurrence 数量放大。这是针对 C-44 的回归门禁，不替代 M7 的整体性能预算。

## M3 补充：库绑定与诊断收集阶段（C-51 / C-52）

Slang 12 将完整展开和诊断缓存合并在 `getSemanticDiagnostics()` 内。完整展开之前递归
遍历实际 body 会逐 occurrence 物化 AST；之后重新绑定库输入又会产生未进入缓存的新诊断。
`forceElaborate` 刻意不访问实例体，不能用来先建立共享证明。

本项目维护 **本地编译阶段扩展** `core/cmake/SlangElaboration.cmake`，不是 upstream
已提供的 API。它给 `getSemanticDiagnostics` 增加同步回调重载：原 `elaborate()`
（含 DiagnosticVisitor::finalize）完成之后、`diagMap.coalesce` 之前执行一次。
原无参入口转发空回调；已缓存时不再调用回调。回调不得递归汇总诊断或改变实例层次，
若抛异常须销毁本次编译；Frontend 的打开过程符合这些限制。

Frontend 在此阶段运行原有模块体编号与外部引用排除固定点，再对最终模块体绑定库输入。
语义诊断包括新增错误；最终 getAllDiagnostics 仍由 Slang 自身合并、排序、去重。
后续查询只读已绑定 AST。空 provider、未命中及真实命中均走相同共享路径。

扩展只生成 build-local Compilation.h/.cpp；FetchContent 原源码不改写，避免影响复用
依赖源码的其他工作树。CMake 检查原文件 SHA-256：

- Compilation.h：`fdff61304e3460ccd98191b5fef0eaa355a761ada50d40e64ecfd59b2319654c`
- Compilation.cpp：`11ae44ba59e54486f64d46df3b4a800af5dc3c425934e156f1c0ad05b880c664`

版本或源码不符立即配置失败，不能静默跳过；更改补丁必须重新检查阶段顺序及下列回归。
前述三个实例缓存文件及其 source id 保持不变，该 source id 表示缓存判据而非整个依赖
逐字节未修改。构建扩展新增重载，没有改变 Slang 对象布局，本项目仍整体重建静态依赖。

必跑回归：B C-52 的四种 provider 打开 RSS 相对增长；C-51 非法类型/过窄 streaming
位置与诊断稳定；C-49 库表达式语境；A 重复库 occurrence 的错误合并与层次引用目标
隔离；既有共享对抗、C-37/C-44 和真实设计差分。资源相对门禁不替代 M7 预算。

## M7 补充：密集合法驱动的分析扫描

`core/cmake/SlangDriverTracking.cmake` 沿同一构建期覆盖机制生成 DriverTracker.h/.cpp，
不改原源码。原文件 SHA-256：

- DriverTracker.h：`44ecd8c0d80f9a76bcede3539c6c24932a885cb53d3cd1a6182cf433c5dffaad`
- DriverTracker.cpp：`b92f4a2107d562956be2612926dc3afbeb1777cb0fa95ed34a3e01b1ac553e68`

原 `addDriver` 在相交区间内仅当两驱动的 `isUnidirectionalPort` 不同，或
`checkOverlap=true` 时可能调用 `handleOverlap`。每符号状态仍持有完整原区间树，
所有插入（含初始化及 modport 驱动）同时维护两位类别汇总。只有 `!checkOverlap` 且
汇总等于新驱动类别时直接插入；原循环此时没有诊断或其它副作用。混合类别仍完整扫描，
不是所有合法多驱动网络的通用复杂度保证。树的插入、迭代和诊断顺序保持。

间接驱动登记、interface/ref 层次副作用和初始化处理在分支之前保留；状态和树受
原 `symbolDrivers` visitor 锁共同保护。没有删除驱动、关闭分析/诊断或改变实例缓存判据，
前述 source id 不变。与诊断阶段扩展不同，**此扩展改变 Slang 私有对象布局**；
生成头以 PUBLIC BEFORE 进入静态 Slang 及其消费者，所有配置必须整体重建，禁止与
未覆盖的预编译库混链。hier 公共头/ABI、IPC、Schema 及默认资源策略不变。

标准 CTest 增加 `a_m7_driver_tracking`（手写 HDL 的全部驱动、类别、位段和冲突诊断，
单线程/四线程）及 `a_m7_driver_overlay_guard`（缺源码、摘要不符、目标布局错误拒绝）。
还须保留原库与覆盖库的逐字节诊断/驱动顺序对照、三构建及原源码访问/共享 oracle、
真实 SDK 冷查询/取消和实际设计回归。测量不证明 Slang 任意阶段可中断或 RSS 硬上限。
