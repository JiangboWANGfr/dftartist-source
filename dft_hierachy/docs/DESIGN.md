# dft_hierachy 设计文档

方案始于2026-10-11，最近修订2026-10-27。本文规定架构与契约；各里程碑的实现、独立验收及未关闭项以 [REVIEW_LOG.md](REVIEW_LOG.md) 最新交接为准。各节保留阶段性草案与后续修订记录；M0 实测见 [M0_RESULTS.md](M0_RESULTS.md)。

前置资料：
- 现状审计与验收场景：[ref/HIERARCHY_REWRITE.md](../ref/HIERARCHY_REWRITE.md)（下文的 R1–R3、S1–S7、U1–U8、A01–A24 均指该文档的编号）
- 参考项目索引：[ref/README.md](../ref/README.md)
- 旧内核的分层设计：`dft_planner/dft-core/dft-core/docs/2026-06-27-layers-and-api.md`、`2026-06-27-DesignHierarchy-complete.md`

本文回答五个问题：分几层、数据模型是什么、每层接口长什么样、和旧代码是什么关系、第一版做到哪里。

---

## 1. 目标与范围

### 1.1 这个工程是什么

一个独立工程，交付两样东西：

1. **设计内核**（C++）：把 HDL 变成可查询的设计数据库，回答"这个对象是什么、属于谁、每一位连到哪里、依据哪段源码"。
2. **导航组件**（TypeScript/React）：层级树、属性面板、源码视图、局部网表图，建立在内核的查询接口上。

另有一个演示壳，仅用于开发期独立运行和端到端测试，嵌回 `dft-suite` 后丢弃。

### 1.2 第一版范围

| 做 | 不做（留接口） | 不做（不留接口） |
|---|---|---|
| 编译、层级、参数、端口、位级连接、驱动负载、跨层追踪、时序单元识别、搜索、源码定位 | DFT 分析（时钟复位树、Scan、wrapper、MBIST、寄存器统计、SDC）：通过 C++ 查询接口和界面标注接口接入 | 仿真值、时序数值 |
| 层级树、属性、源码、局部图 | 规划编辑：通过图片段接口显示规划对象 | VHDL |
| 连续赋值和端口表达式的表达式结构 | 过程块拆成门级图元：通过"节点展开为子图"接口接入 | 会话保存、跨编译对象重映射 |

interface/modport 第一版只识别并标注，不解析其内部连接。

### 1.3 第一版对应的验收场景

| 场景 | 第一版 |
|---|---|
| A01–A08、A11–A18、A22–A24 | 全部 |
| A09 | blackbox、primitive、缺库做全；interface/modport 只标注 |
| A10 | 可静态解析的做全，其余带状态返回 |
| A19 | 树、源码、图之间做全；分析模块只提供标注接口 |
| A20（会话恢复）、A21（规划编辑） | 不做 |

---

## 2. 旧分层为什么失效

旧文档定了 6 个代码层和一条铁律"只有 frontend 碰 slang"。实际代码里 `service/` 下 4 个文件直接包含 slang 头文件，`DesignDb.cpp` 长到 7473 行，`cache/` 层不存在。原因有三个，新设计逐一对应：

| 失效原因 | 证据 | 新设计的对策 |
|---|---|---|
| **中间模型太薄。** `DesignIR.h` 只有实例和定义，没有连接和行为，所以每个查询都只能直接走 slang AST。 | 所有分析都 `using namespace slang::ast`，没有任何中间网表模型 | 模型层完整表达连接、行为依赖和时序单元（第 4 节）；前端层一次性把一个模块体提取成模型，之后的查询不再碰 slang |
| **规则只写在文档里。** 没有任何构建或检查机制阻止跨层包含。 | `service/Netlist.cpp` 等直接包含 slang | 用构建系统强制：`db`、`query` 目标不带 slang 的头文件路径，包含了就编译不过（3.3 节） |
| **分析以"加方法"的方式长进内核。** 时钟树、wrapper、MBIST 都成了 `DesignDb` 的成员函数，并把自己的状态存进去。 | `DesignDb.h` 里通用查询和 DFT 分析混在一个类；`memTemplates` 被写入后会改变 `getPorts` 的结果 | 内核不含任何 DFT 概念；分析在内核之外，链接查询库；内核的缓存只做纯记忆化 |

另有一类问题新设计必须消除：**结果依赖调用顺序**。旧代码里 defId 的代表实例是"第一个被注册的"，逻辑块 ID 要先追踪过才存在，SDC 的 `get_pins` 只能看到用户展开过的实例。新设计的约束是：**任何查询的结果只取决于快照和参数，与之前调过什么无关**，并用随机顺序的等价性测试来保证。

---

## 3. 分层

### 3.1 总览

共 8 层，下层不知道上层的存在。

```
┌─────────────────────────────────────────────── TypeScript（Electron 渲染进程）
│ L7 views      React 组件：树、属性、源码、图
│ L6 viewmodel  树模型、选择、图会话、布局（Worker）
│ L5 client     类型化客户端：传输、快照守卫、取消、缓存
├─────────────────────────────────────────────── 进程边界：NDJSON
│ L4 protocol   协议服务端、命令行                        C++
│ L3 query      导航、搜索、连接、追踪、源码定位    ← 内核的"真接口"
│ L2 db         快照、模块体仓库、实例树、索引
│ L1 frontend   编译；把模块体提取成模型            ← 唯一接触 slang 的层
│ L0 model      纯数据类型
└───────────────────────────────────────────────
```

### 3.2 各层职责

| 层 | 职责 | 依赖 | 禁止 |
|---|---|---|---|
| **L0 model** | ID、位范围、对象结构、结果类型、完整性状态 | 仅标准库 | 算法、IO、slang |
| **L1 frontend** | 驱动 slang 编译；给定一个模块体，产出它的 `BodyFacts`；提供诊断和源码文本 | L0、slang | 任何跨模块体的逻辑；缓存策略；业务判断 |
| **L2 db** | 持有快照；按需向 L1 要 `BodyFacts` 并缓存；维护实例树和各类索引；后台建立全设计索引 | L0、L1 的抽象接口 | slang 头文件；JSON；追踪算法 |
| **L3 query** | 在 L2 之上实现所有查询；管理预算和取消；产出带完整性说明的结果 | L0、L2 | slang；JSON；任何会话状态 |
| **L4 protocol** | NDJSON 编解码、请求关联、取消、版本握手；命令行 | L0、L3 | 业务逻辑：只做翻译 |
| **L5 client** | 类型化方法、传输抽象、过期响应丢弃、请求去重、取消、有限缓存 | 协议类型 | React；任何视图概念 |
| **L6 viewmodel** | 树的可见行模型、类型化选择与历史、图会话（投影、展开折叠、总线折叠）、Worker 布局 | L5 | React；直接访问传输 |
| **L7 views** | 渲染与交互；标注和图片段的扩展点 | L6 | 直接调用 L5；保存设计事实 |

L1 对 L2 暴露的是抽象接口 `Frontend`，入参出参全是 L0 类型。以后接其他语言前端，只需再实现一个 `Frontend`。

### 3.3 如何强制分层

- **C++**：每层一个 CMake 目标。只有 `hier_frontend` 用 `PRIVATE` 链接 slang，其他目标拿不到 slang 的头文件路径。
- **TypeScript**：每层一个包，用依赖检查工具（dependency-cruiser）在 CI 里拒绝越层导入。
- **内核不含 DFT 概念**：`model` 里不出现 clock tree、scan、wrapper、mbist 等词；代码评审按此把关。

### 3.4 进程与线程

- **一个进程对应一个设计快照。** 重新加载就是启动新进程，旧进程退出。内存释放和"旧结果污染新设计"两个问题由进程隔离直接解决。
- **打开时完整展开。** 打开设计时调用一次 Slang 的完整展开，之后才有模块体的共享标记。M0 实测 openc910 上是 0.16 秒，10 万个互不相同的模块体是 1.2 秒，不需要延迟展开。全设计的骨架索引随后在毫秒级建好，所以 `indexState` 的 `building` 状态实际上极短；保留这个状态是为了以后索引内容增加时不改协议。
- **进程内两个线程**：协议线程收发消息，工作线程独占 slang 并串行执行查询。长查询在循环中检查取消标志。slang 的延迟展开不是线程安全的，所以第一版不做并行查询。
- **内核是库，协议层可嵌入。** 独立运行时宿主是本工程的 `hier serve`。DFT 分析在新接口上重写之后，由一个宿主进程链接本库，同一进程内既挂通用查询方法，也挂分析方法，设计只编译一次。

---

## 4. 数据模型

### 4.1 核心决策：折叠模型

不把设计展平。连接事实按**模块体**存一份，对象用"实例路径 + 模块体内的局部对象"来指认。

- **模块体（Body）**：一个定义在一组参数值下展开的结果。同一模块实例化一千次，只要参数相同，就只有一个模块体。
- **出现（Occurrence）**：`(实例路径, 局部对象)`。`soc.u_a.clk` 和 `soc.u_b.clk` 是同一个局部对象的两次出现，身份不同。

这个模型来自 naja 的 `SNLOccurrence`、OpenSTA 的 Pin/Term 和 CIRCT 的实例图。它直接解决两件事：
- **R1、R2**：身份由实例路径决定，不可能因为源码位置相同或名字相同而混淆。
- **规模**：内存随"不同的模块体数量"增长，而不是随实例数量增长。

**共享的判据是"提取出的事实完全相同"**，而不是某个由定义和参数拼出来的键。这样任何影响展开结果的输入（包和编译单元里的参数与类型、宏、include、作用域相关的名字查找、bind、defparam、库信息）只要造成差异，就一定体现在事实里，不存在"漏掉一类输入"的问题。因此也不需要定义参数值的文本规范化。

这句话是**正确性的定义**，不是运行时的判断步骤：运行时不可能先提取两份再决定要不要共享。运行时用的是下面的充分条件。

**快速路径的安全不变量**由三条组成，三条同时成立时，只提取一次是安全的：

1. **Slang 的保证**：`getCanonicalBody()` 认定相同的两个实例，其模块体内容除"依赖所在层次位置的部分"外语义等价。这是 Slang 实例缓存自身正确性所依赖的性质。
2. **事实不含位置相关的内容**：`BodyFacts` 的每个字段都只由模块体自身的内容决定，不包含层次路径、父实例信息、或经向上查找解析出的外部对象。这一条由本工程的模型定义保证。
3. **排除位置相关的构造**：模块体内有向外的层次引用、是 bind 或 defparam 的目标、或有 interface 端口时，不走快速路径。连接事实还包含被外部读写的标记：先按唯一语义代表扫描连续赋值、过程块、网线初始化和端口表达式，发现层次引用后将源体、目标体及其祖先体保持独立，再扫描因此新出现的实际体，直到代表选择稳定。无层次引用的共享体只扫描一次，不能为识别外部访问而预先深入所有 occurrence 的 AST。扫描连接前冻结库信息，按普通端口、primitive 和库引脚的有效方向记录读写；inout/ref 记录两侧，左值选择器只记录读取。不能仅靠 Slang 对层次赋值的共享保护，也不能把一个 occurrence 的访问标记按词法名字传播给同定义的其他实例。

第 2、3 条是本工程自己控制的。第 1 条依赖 Slang，已在 M0 核对：Slang v12.0 判定相同的确切条件、差分测试的结果和三条实现上必须遵守的事项，记录在 `core/frontend/SHARING_VERIFIED.md`。其中两条直接约束本模型：遍历必须走规范模块体的成员（被共享实例的内部没有共享标记）；参数只存展开后的值（覆盖表达式写在父作用域里，值相同的实例其表达式可以不同）。

| 路径 | 做法 | 何时使用 |
|---|---|---|
| 快速路径 | 满足上面三条的实例共用一次提取 | V1 已对 Slang v12.0 确认；链接的 Slang 版本与已核对版本一致时启用 |
| 逐实例路径 | 每个实例各自提取，再按事实内容去重存储。结果一定正确，代价是提取时间随实例数增长；存储仍然随"不同的事实"增长 | 不满足三条的实例；以及 V1 未确认时的全部实例 |

测试通过不等于运行时保证，所以 V1 的通过标准有两部分，缺一不可（两部分都已在 M0 完成）：

- 读 Slang 的实例缓存实现（`InstanceCacheKey` 及其使用处），写出它判定相同的确切条件，确认第 1 条成立，或列出需要补进第 3 条的例外。
- 差分测试：在测试设计上两条路径都跑，断言结果逐字节相同。

另外提供一个常备的校验模式 `hier verify-sharing <设计>`：对任意设计两条路径都跑并比较。M1 起可用，目前比较的是骨架级事实（每个实例的信息、端口、参数）；连接级事实在 M2 加入比较。它用于在真实设计上发现第 1 条的反例，是检测手段，不是正确性证明。发现不一致时以非零状态退出，并列出不一致的实例。它只在"确实比较了、并且全部一致"时才报告成功：设计有编译错误、没有顶层实例、快速路径没有启用、遍历中任何一次查询失败、或者一个实例都没比较到，都是失败。否则 filelist 或顶层名写错时，它会以"0 处差异"通过。

**防止以后静默失效。** V1 的结论只对被核对过的那个 Slang 版本成立，所以把它固化成运行时策略：

- M0 产出一份记录（`core/frontend/SHARING_VERIFIED.md`）：核对过的 Slang 版本和提交号、它判定模块体相同的确切条件、差分测试覆盖的设计。
- 代码里记录"已核对的 Slang"的三项身份：完整版本号、预发布标记、源码标识（`core/frontend/src/Frontend.cpp` 的 `verifiedFrontend()`）。源码标识是对 Slang 中实现实例缓存的三个文件内容的哈希，配置构建时计算并编入产物，不依赖 git 信息。打开设计时三项与实际链接的 Slang 逐项比较，任何一项不同或取不到就不启用快速路径，内核自动走逐实例路径，并在 `design.info` 里说明是哪一项、实际值和期望值。只比较主次版本号是不够的：补丁版本、预发布版本、或者版本号相同但源码不同的构建都必须被拒绝。升级 Slang 的人必须重做 V1 并更新这三项，快速路径才会重新启用。
- 打开设计时可以用选项强制走逐实例路径，供排查问题时使用。
- 每次升级 Slang，以及持续集成中，都在全部回归设计上运行 `verify-sharing`；失败即构建失败。

`SnapshotInfo` 里带一个字段说明本次用的是哪条路径，出问题时可以直接看到。

模块体在内核里的编号是内部的，不出现在任何接口里。编译选项、语言版本和库信息是整个快照共用的，一个进程只有一个快照，所以它们不需要进入共享判据。

### 4.2 模块体里有什么

`BodyFacts` 分两级，分别按需提取：

`BodyFacts` 是自包含的数据：不持有任何 Slang 对象的指针或引用，源码位置用文件编号加偏移表示。L0 的类型拿不到 Slang 头文件，这一点由构建保证。因此事实的生命周期与前端无关，可以缓存、可以跨线程读。

骨架常驻内存。连接级事实放在有字节预算的缓存里，超出预算时淘汰最久未用的，需要时重新提取；预算值在 M0 根据 V3 的测量结果确定。

**事实的来源**（M0 的 V2 结论）：连续赋值和过程块的本地读写位段以 Slang 12 分析模块的结果为准，它已经处理了过程块里的控制流。以下四项 Slang 不提供，由前端自己的遍历补上：网线声明初始值作为驱动；写位段与读位段之间的逐位对应和读的角色；端口连接表达式的读；经规范模块体查询（分析只在规范模块体上做）。前端按 5.4 的三类规则检查事实：适用的连续赋值和过程块以独立源码访问集合对照 Slang，并分别检查完整写目标与输出依赖投影；`init`、`port_expr` 做自有逻辑检查；含 `externalRefs` 的源跳过 Slang 等值检查、单独计数并保留本地自检和 `partial/hier_ref`。检查失败的运行时退路见第 10 节，不能发布漏掉 Slang 写目标的事实。

**骨架**（便宜，建实例树和搜索用）

| 对象 | 内容 |
|---|---|
| Port | 名字、方向、类型、声明范围（如 `[15:8]`、`[0:7]`）、位宽、对应的内部信号、种类（普通 / interface / 复合） |
| ChildSlot | 子实例位置：名字、所在 generate 作用域、数组下标、种类（模块 / blackbox / primitive）、指向的定义和参数 |
| Scope | generate 块和 generate 数组构成的作用域树 |
| Param | 名字、展开后的值、类型、是否 localparam |

**连接**（较贵，查连接和追踪时才提取）

| 对象 | 内容 |
|---|---|
| Signal | net 或变量：名字、类型、声明范围、位宽、所属作用域、net 类型 |
| PinBinding | 子实例引脚的位段连到什么（见 4.4） |
| Process | 一个驱动源：连续赋值、过程块、声明初始值、端口连接表达式。记录它写哪些位段、读哪些位段、每个读的角色 |
| Register | 时序单元：被写的变量位段、时钟及边沿、异步控制信号及边沿和类型 |

所有局部对象在模块体内有一个整数 `localId`，按声明顺序分配，因此是确定的。

**提取是快照和模块体的纯函数。** 同一快照内，对同一个模块体提取多少次、在什么时候提取，得到的事实逐字节相同。具体约束：

- `localId`、驱动源和时序单元的顺序、绑定片段的顺序，都由源码声明顺序的遍历决定。
- 事实里不出现内存地址、哈希表的遍历顺序、或任何随运行变化的值。需要排序的集合一律按确定的键排序。
- 文件编号来自快照的源文件表。该表在打开设计时一次建好，之后不变。
- 图上的事实编号 `factId` 由"对象的 `ObjectRef` + 事实在该对象内的序号"构成，不依赖事实在内存或序列化中的位置。

因此连接级事实被淘汰后重新提取，所有 ID 和事实编号保持不变。这一点由测试保证：随机顺序等价性测试在"缓存预算极小、每次查询都触发淘汰"的配置下再跑一遍，结果必须与正常配置逐字节相同。

M7 的连接绑定调度仍采用同一声明遍历：每个子槽位预先关联到其祖先中最早被遍历的声明，
在该声明事实之后按槽位编号处理；没有匹配声明的槽位仍按编号在末尾处理。
调度表只在一次提取内持有，避免对每个成员重复全扫槽位，不成为新的对象/编号事实来源。
绑定、驱动源、源码记录和保留事实容量的结果序列保持；无子槽位的模块体不建立调度表。

宽端口的关联同样保持原事实顺序：L1 使用 Slang 已有的端口连接映射，复合端口仍按原分量顺序提取。
源码连接直接借用 Slang 的位置列表，短连接表直接查找，宽表建立命名索引；一次提取只保留最近实例语法的索引，
相邻共享语法复用，交错语法按需替换，临时元数据随当前/切换实例宽度增长，不保留整个模块的唯一语法集合。
命名连接取首次拼写，位置连接计入空项和通配项的原序号；
没有对应连接语法时不新增来源记录。未知模块名称仍按原库/源码顺序，重复命名的表达式仍取最后一次匹配。
索引只借用当前编译对象内的语法及 token 文本，不进入保留事实缓存，不改变编号或库方向/宽度规则。

**子实例位置的编号规则**（`InstKey` 的每一级就是这个编号）：

1. 按源码声明顺序深度优先遍历模块体的成员。
2. generate 条件分支：只有被选中的分支产生位置，未选中的不占编号。
3. generate 循环：按循环的展开顺序，每次迭代依次展开。
4. 实例数组：每个元素是一个独立的位置，按下标从小到大，例如 `u[3:1]` 的顺序是 1、2、3；多维数组外层维度先变化得慢，例如 `g[1:0][0:1]` 的顺序是 `[0][0]`、`[0][1]`、`[1][0]`、`[1][1]`。（评审时写的是"按声明范围从左到右"；M1 实现时改为与 Slang 存储元素的顺序一致，避免本工程与前端各有一套顺序。）

稳定性的保证范围：同一快照内永远不变。跨编译时，只有源码和参数都没变才相同；第一版不承诺跨编译稳定，这属于"会话恢复"的范围。

### 4.3 对象身份

| 标识 | 形式 | 说明 |
|---|---|---|
| `InstKey` | `"0.3.12"` | 从顶层开始、每一级取子实例位置下标。顶层按名字排序编号 |
| `ObjectRef` | `"s:0.3.12:45"` | `种类:InstKey:序号`。种类有 `i` 实例、`p` 端口、`s` 信号、`x` 驱动源、`r` 时序单元。序号是该对象在所属模块体同类对象中的位置，各类分别从 0 起、按声明顺序。黑盒实例的引脚也有端口引用，序号是引脚在该处例化中出现的位置 |
| `DefRef` | `"d:17"` | 全部定义按（名字, 文件, 行号）排序后的下标。黑盒和基本门没有文件，与其他定义一起按名字参与同一个排序，不单独成组 |
| `Slice` | `ObjectRef` + `{lsb, width}` | 位段，在该对象的"位空间"里按位置编号 |

**位空间**：每个信号和端口有一个一维的位空间，位置 0 是最低位。

| 类型 | 位空间 |
|---|---|
| 标量、packed 数组、packed 结构 | 全部位按 packed 布局排列 |
| 定长 unpacked 数组、unpacked 结构 | 各元素的位空间依次拼接，与 Slang 报告的位段编号（`ValuePath` 的 `lspBounds`）一致（验证项 V6，M0 已确认） |
| 动态数组、队列、字符串、类句柄、real 等没有固定位布局的类型 | 没有位空间，标记为 `opaque`；只能整体引用，依赖一律记为 `conservative` |

`SignalInfo` 和 `PortInfo` 的 `members` 递归记录 `{name, type, bits, signed, dims, members}`；数组中的成员偏移相对于单个元素。两者带完整的维度信息（每一维的左右边界、packed 还是 unpacked、是否有符号），结构类型另带每个成员的名字、偏移和宽度。显示时由此把位置换算回声明形式，例如 `mem[3][15:8]`。成员的偏移必须由前端给出，界面不能自己推算：M0 实测 packed 结构的第一个成员在高位，unpacked 结构的第一个成员在低位。反向范围 `[0:7]` 只影响显示换算，不影响位空间。

约束：

1. **ID 可以不依赖历史算出来。** 同一快照内，任何时候、以任何顺序查询，同一对象得到同一个 ID。
2. **客户端把 ID 当不透明字符串。** 不得拆开解析；需要父实例、祖先、名字，一律问内核。
3. **显示路径与身份分开。** 每个对象另带 `path: string[]`（未转义的路径段）和格式化后的 `pathText`。含 `.` 的转义标识符是一个路径段，不会被切开（对应 S5、U4、A08）。
4. **generate 作用域不是假模块。** 它是模块体内部的作用域，出现在路径段里，树上可以选择是否显示为中间行（对应 A07）。
5. **引脚和端口是同一个对象，两个视角用 `side` 区分。** 子实例 `0.3.12` 的第 2 个端口，`ObjectRef` 只有一个：`p:0.3.12:2`。连接类查询作用在端口上时，必须带 `side` 参数：
   - `"outside"`：从父模块看，查的是父模块体里连到这个引脚的东西。
   - `"inside"`：从自己看，查的是本模块体里这个端口对应的内部信号。
   - 顶层端口只有 `inside`。对端口不带 `side` 是 `bad_request`，没有默认值，避免两端各自假设。

用户输入的路径文本（SDC、命令行、搜索框）统一由内核的 `path.resolve` 解析成 `ObjectRef`。旧代码里有三处各自实现"顶层名可省略、`/` 和 `.` 混用"，新设计只留一处。

### 4.4 连接的三类事实

模块体内的连接分三类，类型上就分开，避免被当成同一种边：

| 类别 | 含义 | 例子 |
|---|---|---|
| **绑定**（PinBinding） | 引脚位段直接连到信号位段、常量或悬空 | `.d(bus[7:4])`、`.en(1'b0)`、`.q()` |
| **依赖**（Process） | 一个驱动源写某些位、读某些位 | `assign y = a & b;` 中 y 依赖 a 和 b |
| **内部对应**（Port.internal） | 端口对应的内部信号 | `output [7:0] q` 对应内部的 `q` |

绑定的目标是一个有序片段列表，每个片段是以下之一：

```ts
interface PinBinding {
  inst: ObjectRef;          // 子实例
  pin: ObjectRef;           // 该子实例的端口引用
  port: string;             // 端口名；无库的位置连接为 ""，身份由 pin 引用的出现位置区分
  direction: "in" | "out" | "inout" | "ref" | "unknown";
  width: number | null;     // null 表示库和连接表达式都不能确定宽度
  segments: BindSegment[];  // 宽度已知时按 pinBits.lsb 升序，互不重叠并覆盖全部位
  unresolved?: ReasonCode;  // 未知宽度为 unknown_pin_width；interface 边界为 interface_port
}
interface BindSegment { pinBits: BitRange; target: BindTarget; }

type BindTarget =
  | { kind: "signal"; signal: ObjectRef; bits: BitRange }  // 位宽与 pinBits 相同，逐位对应
  | { kind: "const"; value: string }                       // 四态常量
  | { kind: "unconnected" }                                // 悬空
  | { kind: "expr"; process: ObjectRef }                   // 非平凡表达式，转成一个驱动源
  | { kind: "unresolved"; reason: ReasonCode };            // 无法静态解析
```

规则：

1. **有声明或库信息的子实例，每个已知引脚都有一项**，包括悬空的和没有写出来的端口。悬空且宽度已知时是一个覆盖全部位的 `unconnected` 片段。没有 LibraryProvider 的 blackbox 只列本次例化实际出现的引脚；不凭名称猜未出现的引脚或方向。优先采用库端口的方向和宽度；没有库端口时，能从连接表达式确定宽度才填 `width`。例如 `.Y()` 既无库声明也无表达式，返回 `width: null`、`segments: []`、`unresolved: "unknown_pin_width"`，不伪造一个位。
2. **有片段时 `pinBits` 总是给出。** 宽度已知的片段按引脚的低位到高位排列，并恰好覆盖全部位。这与源码里拼接的书写顺序相反：`.d({a, b})` 的第一个片段是 `b`。`conn.bindings` 直接返回这些事实和显式的 `unresolved`；`conn.drivers`、`conn.loads`、`conn.step`、`trace.*` 经过未知宽度引脚时返回 `partial`，原因 `unknown_pin_width`，不把它当作悬空。
3. **常量的文本形式固定**为 `位宽'b` 加恰好那么多位的二进制数字，高位在前，数字只有 `0`、`1`、`x`、`z`（小写）。例如 `4'b10xz`、`1'b0`。
4. **平凡输入连接**展开成片段，不产生驱动源。平凡连接只由这些构成：整个信号、常量下标的位选和段选、拼接、常量次数的重复拼接、常量、以及输入位宽转换。等宽输出的静态左值也直接映射；有输出宽度转换时按第 7 条表示。
   - 截断：只保留低位的片段。
   - 零扩展：高位是一个常量 0 的片段。`.d(a[1:0])` 接 4 位端口，得到 `pin[1:0] = a[1:0]` 和 `pin[3:2] = 2'b00`。
   - 符号扩展和重复拼接：`signal` 片段要求两侧位宽相同，所以展开成多个片段。4 位端口接 `$signed(a[1:0])` 得到 `pin[1:0] = a[1:0]`、`pin[2] = a[1]`、`pin[3] = a[1]`。
5. **其余输入表达式**（运算符、条件运算、函数调用、动态下标等）是非平凡的：引脚上以 `expr` 片段指向 `port_expr` 驱动源，写目标是该引脚。复合端口按分量建立片段和驱动源，写位号保留在整个引脚中的偏移，不能把非平凡分量变成悬空。普通单分量端口仍是一个覆盖全宽的 `expr` 片段。
6. 隐式连接（`.d`、`.*`）与显式连接结果相同。有默认值的端口没有连接时，按默认值表达式处理。
7. **输出连接按赋值方向转换。** 当父侧左值宽度与子输出不等，或输出左值不平凡时，绑定以 `expr` 指向 `port_expr`；其 `Write.target` 是父模块的完整左值，`Dep.signal` 可引用该子输出引脚。低位按位对应，零扩展高位无依赖，符号扩展高位依赖子引脚符号位，截掉的子引脚高位无父侧负载。父侧驱动查询停在这个转换过程，不把高位报成“空且完整”，也不把绑定与转换过程重复算作两个驱动。输入、输出两种 `port_expr` 都由原始连接 AST 独立检查目标与依赖投影。有库 blackbox 的输出声明按无符号位空间执行宽度转换；无库时方向仍为 unknown，不猜测转换。

blackbox 的位置连接按源码参数序号保留，包括显式空位置；无库时名字为空，有库时按库声明顺序匹配。Slang 绑定列表省略的空位置也不能导致后续引脚前移。

这对应 S1–S3：切片、拼接、常量（含 X/Z）、悬空、无法解析，五种情况各有表示，不再用空字符串混在一起。

**interface 和 modport 在第一版的确切行为：**

| 查询 | 行为 |
|---|---|
| `inst.children` | interface 实例正常列出，`kind` 为 `"interface"` |
| `inst.ports` | interface 端口正常列出，带 interface 类型名和 modport 名，不展开成内部信号 |
| `conn.bindings` | interface 端口的绑定目标为 `unresolved`，`reason` 为 `"interface_port"` |
| `conn.drivers`、`conn.loads`、`trace.*` | 走到 interface 端口或 interface 内部信号就停下；结果为 `partial`，原因 `interface_port`，`at` 指向停下的对象 |

也就是说，经过 interface 的连接在第一版一律报"不完整"，不会被当成"没有连接"。

依赖里每个读操作带角色：`data`（数据）、`control`（if/case 条件）、`clock`（时钟事件）、`async`（异步控制事件）。时序过程块的每个写都带时钟角色的依赖。wrapper 分析需要区分数据依赖和控制依赖，时钟分析需要时钟角色，所以角色是事实的一部分，而不是分析自己再推一遍。

**依赖的精度**是事实的一部分，承载在三处：

```ts
interface Write {
  target: Slice;            // 输入 port_expr 写引脚；输出转换 port_expr 写父侧信号位段
  deps: Dep[];              // 可以为空：只由常量决定
  exprMap?: ExprMapping;    // M3：有 ProcessInfo.expr 时必填；结果位到本目标的值映射
}
type ExprMapping =
  | { status: "mapped"; segments: BitMap }
  | { status: "unresolved"; reason: "unsupported" };
interface Dep {
  signal: ObjectRef; bits: BitRange;
  role: "data" | "control" | "clock" | "async";
  precision: "exact" | "conservative";
  align: "bitwise" | "all";
}
// ProcessInfo 的每个 Write 带一组 Dep；TraceEdge 也带 precision；
// TraceResult 带 hasConservative: boolean，表示结果里是否含保守依赖
```

**`align` 说明写位段与依赖位段的对应方式**，这样既能区分"第 i 位对第 i 位"和"每一位依赖全部位"，又不必把事实拆到单个位：

- `bitwise`：`bits` 与 `target.bits` 位宽相同，目标的第 i 位依赖 `bits` 的第 i 位。
- `all`：目标的每一位都依赖 `bits` 的全部位。`conservative` 的依赖一律是 `all`。

一个驱动源的写被切成若干个 `Write`，每个 `Write` 内部的对应关系是统一的。例如：

| 源码 | Write |
|---|---|
| `assign y = a & b;`（4 位） | `y[3:0]`：`a[3:0]` bitwise，`b[3:0]` bitwise |
| `assign y = c ? a : b;` | `y[3:0]`：`a[3:0]` bitwise，`b[3:0]` bitwise，`c` control all |
| `assign y = a << 1;` | `y[3:1]`：`a[2:0]` bitwise；`y[0]`：无依赖 |
| `assign y = a + b;` | `y[3:0]`：`a[3:0]` all conservative，`b[3:0]` all conservative |
| `assign y = {a[0], a[1]};` | `y[1]`：`a[0]` bitwise；`y[0]`：`a[1]` bitwise |

**同一个信号可以以多个角色出现。** 角色记录的是"为什么依赖"。同一个 `Write` 里，同一组（信号, 位段, 角色）只出现一次，但同一个信号可以既是 `async` 又是 `control`。例如：

```systemverilog
always_ff @(posedge clk or negedge rst_n)
  if (!rst_n) q <= '0;
  else        q <= d;
```

`q` 的依赖是四项：`d` data bitwise、`rst_n` control all（它是 if 的条件）、`rst_n` async all（它在事件列表里并被判定为异步控制）、`clk` clock all。两项都报，不合并。

- `exact`：这一位确实依赖那一位。
- `conservative`：过近似，实际依赖是所报告依赖的子集。结果不会漏，但可能多。

`conservative` 与"不完整"是两回事：它不影响 `Completeness`，但界面必须把保守的边区别显示，分析不得把它当作精确结论。

各类运算的规则：

| 运算 | 精度 | 依赖 |
|---|---|---|
| 常量下标的位选和段选、拼接、重复拼接 | exact | 按位映射 |
| 按位与、或、异或、取反 | exact | 输出第 i 位依赖各操作数第 i 位 |
| 条件运算 `c ? a : b` | exact | 数据按位映射；条件的全部位以 `control` 角色作用于输出每一位 |
| 零扩展、符号扩展、截断 | exact | 按位映射；符号扩展的高位依赖符号位 |
| 常量位移 | exact | 按位映射；逻辑移位和算术左移补 0；算术右移 `>>>` 仅当经赋值语境类型转换后的左操作数为 signed 时复制其最高位，否则补 0。超过位宽时同样按补 0/复制符号位处理 |
| 缩减运算、比较、相等、逻辑与或非 | exact | 1 位输出依赖操作数全部位，这是真实依赖 |
| 加、减、乘、除、取模、乘方 | conservative | 输出每一位依赖操作数全部位 |
| 变量位移 | conservative | 输出每一位依赖被移数全部位和移位量全部位 |
| 动态下标的位选、段选、数组索引 | conservative | 依赖被索引对象的全部可能位置和下标全部位 |
| 流拼接、函数调用、系统函数 | conservative | 输出全部位依赖参数全部位 |
| 过程块中的赋值 | 同上各行 | 外加所在 if、case 条件的全部位，角色为 `control` |

动态左值下标以`control/all/conservative`作用于该左值可能写入的各位；
嵌套位选、段选、成员选择及拼接分别按目标路径处理，不将地址依赖附给同一过程的其它写目标。
内部写集合以互不重叠的区间表示同一目标各位的依赖并集；均匀的`all`关系按区间积累，
与静态单个位写重叠时切分边界，保留原位映射、事件分类和最终相邻合并规则。
不为整个可能写入范围逐位建立临时条目，也不在缺失时钟/异步分类的只读查询中插入空项。
静态连续同目标的相同`all`/空依赖及按位线性递增的`bitwise`依赖批量积累；过程写保留并集，
net初始化/端口表达式保留覆盖，不足RHS的尾部仍保留空写。线性区间切分或重叠时，
按目标偏移平移`bitwise`源起点、调整源宽度；重复符号扩展位不被当作线性递增。
静态拼接、重复目标和位映射按原顺序处理。异步类型按目标对象/事件保存互不重叠区间，
相同分类保留、不同分类的重叠仍为`unknown`；缺失查询不插入条目。原常量求值和整个operand
非零分类规则保持，带异步分类的静态写按连续目标及相同分类分组；依赖/分类记录共用目标边界，
后续正常写不擦除既有分类边界，最终合并/寄存器用覆盖点查询，不合并不同分类。
表达式结果同样以拥有依赖的区间序列表示空、均匀`all`和线性`bitwise`关系，切片/截断、
拼接/重复、符号扩展、条件及按位并集沿原输出位次序计算；与写集合共用源坐标投影规则。
过程赋值、初始化和端口表达式直接消费投影区间，过程并集仍去重，替换仍保留输入重复项。
有序并集仍以原vector为唯一事实，按首次出现顺序追加，保留目标原有重复项；大批量查重使用局部成员索引，
只保存下标并借用vector对象，不持有元素指针或复制事实。小批量保留线性路径，索引不跨外部修改/移动，
不改变vector/string分配策略与实际容量记账；索引分配失败传递异常，不发布半成品。
不把重复符号位当线性；非线性关系保留多个区间。表达式来源按区间汇总涉及位段，
只有全部结果位均有的`exact/all`关系保留为exact，截断/位移丢弃的位不复活。
静态连接同样直接保存信号/常量/未连接片段，供赋值左值、端口绑定和内部端口共用；
切片平移信号源坐标，常量位串保留低位次序、X/Z及符号/零填充。常量相邻片段只在输出边界
一次归并，保持原字面量格式与实际容量记账，不逐位建BindTarget或反复复制全部前缀。
异步常量分类按原concat operand范围保存，与目标/数据片段交汇后写入；整个operand非零分类、
不同分类边界、重复目标顺序和动态lhs退路保持，不逐位存分类字符串。
这只是临时表示调整，不缩减范围、精度或独立Slang检查；非线性/符号复制片段、
常量输出字符串、AST及独立分析仍可能有逐位代价。

这套规则与旧 wrapper 实现的逐位依赖做过逐类对照（验证项 V5，M0 完成）。结论是没有一类比旧实现粗，所以 wrapper 分析改用新规则不会比现状差：

| 对照结果 | 运算类别 |
|---|---|
| 与旧实现一致 | 常量选择与拼接、按位与、按位取反、条件运算、缩减、比较、相等、加法、乘法、变量位移、动态位选、动态段选、函数调用、过程块 if、过程块 case |
| 比旧实现更细 | 重复拼接、零扩展、符号扩展、常量位移 |
| 比旧实现粗 | 无 |
| 漏掉真实依赖 | 无（规则表和旧实现都没有） |

旧实现对加法和乘法同样是"每一位依赖全部输入位"。对照的样例、手写的真实依赖和脚本在 `core/tests/fixtures/precision/`（`ops.sv`、`compare.py`），逐行输出见 `M0_RESULTS.md` 2.5。这一步对照的是**规则表**；新实现的输出是否等于规则表要到 M2 才能检验。

**多驱动原样保留。** 一个信号位有几个驱动就记几个，是否违规由使用方判断（对应 R3、A03）。

### 4.5 表达式结构

连续赋值、声明初始值、端口连接表达式，除了读写位段外，还提取一棵小的表达式树：

```ts
// 对外形状；L1/L2 中的引用仍是模块体局部引用，L3 限定到 occurrence。
// 操作数、宽度转换、other 及 Write.exprMap 的语义见 5.5.3。
interface Expr {
  op: "ref" | "const" | "not" | "and" | "or" | "xor"
    | "reduce_and" | "reduce_or" | "reduce_xor" | "mux" | "concat" | "other";
  width: number | null; signed: boolean;
  slice?: Slice; value?: string; text?: string;
  args?: Expr[]; uses?: Dep[];
}
```

理由：时钟复位树要"穿过缓冲、反相、与或门、选择器"，旧实现直接读 slang 的表达式节点。不提供表达式结构，时钟分析就无法脱离 slang。

第一版不对过程块做同样的降级，过程块只有读写集合和时序单元信息。把过程块拆成门级图元是以后的事，届时在这棵表达式树上扩展。

**由此带来的确切边界：** `ProcessInfo` 的 `expr` 字段只在连续赋值、声明初始值、端口连接表达式上存在；过程块上没有。

| 驱动源 | 分析能拿到什么 | 能做什么 |
|---|---|---|
| 连续赋值、初始值、端口表达式 | 读写位段、每个读的角色、表达式树、exprMap | 表达式和目标映射均可解析时，判断缓冲、反相、门控、选择器并做三值推导 |
| 组合过程块（`always_comb`、`always @*`） | 读写位段、每个读的角色（`data` 或 `control`） | 知道输出依赖哪些输入、哪些是条件；**不知道分支结构和优先级**，不能做三值推导 |
| 时序过程块 | 同上，外加时序单元的时钟和异步控制 | 作为时序终点 |

例如 `always_comb if (enable) y = clk_a; else y = clk_b;`：内核报告 y 以 `data` 角色依赖 `clk_a`、`clk_b`，以 `control` 角色依赖 `enable`，但不提供"enable 为 1 时选 clk_a"。

第一版的规则：**需要按条件取值的分析走到组合过程块必须停下**，把该点报告为"过程块内的选择逻辑，不支持推导"，不得猜测。只需要依赖关系的分析（扇入扇出、wrapper 的可达性）可以照常穿过。

据对旧实现的调研，旧的时钟复位树也是这样：表达式穿透只作用于连续赋值，遇到过程块驱动就作为终点。所以这条边界不比旧实现差；我没有亲自读这段旧代码，集成阶段重写时钟分析时要再核对一次。

这条边界在实际设计里的影响，M0 做了统计（`M0_RESULTS.md` 第 3 节）：`processor_core` 和 `openc910` 的时钟与异步复位路径上，用过程块写的选择逻辑都是 0 处；`openc910` 有 1 处用 `assign` 加条件运算符写的选择器，新设计可以推导。统计不穿过 blackbox，且只有两个设计。

以后要支持时，给过程块增加分支摘要（每个写位段在各分支下的条件表达式、取值来源和优先级），放在 `ProcessInfo` 的新字段里，不改变现有字段。它与"过程块拆门级"是同一项工作的两个层次，一起排期。

### 4.6 时序单元

识别规则沿用旧实现的 `extractSeq`，但只保留一份（旧代码里有三份各自实现）：

- 过程块是 `always_ff` 或 `always`，并由边沿事件触发。
- 边沿事件的信号若出现在开头的 if / else-if 条件里，是异步控制；否则是时钟。
- 异步分支按当前左值变量/位段取得被赋常量：非零记为置位，零记为复位，不能判定的值记为 unknown。拼接左值按各操作数对应的 RHS 位段分别分类；普通整变量的非零常量仍按整变量记为置位，不把另一操作数的值用于本目标。

与旧实现的差异：**按被写的变量位段记录**，而不是按过程块记录。这样寄存器统计、wrapper、时钟分析用的是同一份事实。

第一版不识别同步复位、使能和锁存器。内核的时序单元只来自 RTL 过程块；例化的库触发器单元在内核里就是一个 blackbox 实例，是否把它当作时序单元由分析根据库信息自己判断（见 4.8）。

### 4.7 跨层连接

不预先计算全设计的网络。跨层查询在需要时沿着"绑定"和"内部对应"上下走：

- **向上**：当前实例的端口 → 父模块体里这个子实例位置的绑定 → 父模块的信号位段。
- **向下**：子实例引脚 → 子模块体里该端口的内部信号位段。

每一步都保留位映射。走到驱动源、顶层端口、blackbox 引脚、常量或悬空处停下。这就是"等电位"查询，参考 naja 的 `SNLEquipotential` 和 OpenSTA 的 `HpinDrvrLoad`。

### 4.8 快照与外部信息

**快照**：一次编译的全部输入和结果。

```ts
interface SnapshotInfo {
  snapshotId: string;            // 每次打开唯一
  inputHash: string;             // 见下
  inputHashComplete: boolean;    // false 表示哈希没有覆盖全部输入
  schemaVersion: number;
  tops: { inst: ObjectRef; name: string; isCandidate: boolean }[];
  frontend: { name: "slang"; version: string };
  indexState: "building" | "ready";
  bodySharing: "fast" | "per-instance";
  // 打开选项里两项默认开启，与旧工具一致（M0 实测 openc910 不开会有两千多个错误）：
  //   全部文件作为一个编译单元；未知模块当作 blackbox 而不是错误
}
```

`inputHash` 在编译完成后计算，覆盖：编译实际读入的每个文件的内容哈希（含 include 进来的文件和从库目录找到的文件，名单取自 Slang 的源码管理器，而不是 filelist 的字面内容）、命令行宏、include 目录和库目录的列表、top、语言版本等编译选项、库信息提供方的内容、前端版本。filelist 里的环境变量在展开后参与哈希。M0 已确认可以从 Slang 取到完整的已读文件名单（V7），所以 `inputHashComplete` 正常情况下为 `true`。

`inputHashComplete` 为 `false` 时，`inputHash` 不能代表全部输入，使用上有三条限制：不得用它判断两个进程打开的是同一设计；不得用它作为任何持久化缓存的键；界面必须提示"无法检测 include 和库文件的变化，修改后请手动重新加载"。同一进程内的查询结果不受影响：它们对应的就是这次编译，过期检测靠的是每次打开都不同的 `snapshotId`。

**快照是不可变的。** 所有查询结果描述的都是打开那一刻读入的内容。进程存活期间磁盘上的文件被修改，不会改变任何查询结果，内核也不声称与磁盘实时一致。相应地：

- 界面在设计信息处显示打开时间，表明结果"基于打开时的版本"。
- 提供 `design.checkInputs` 查询：重新计算源文件表里各文件的哈希，返回已变化的文件列表。它不会让快照失效，也不会拒绝后续查询。界面在窗口重新获得焦点等时机调用它，有变化就显示"输入文件已变化，重新加载后才会生效"。
- `inputHashComplete` 为 `false` 时，源文件表可能不全，`design.checkInputs` 检查不到表外的文件。此时上面的提示改为常驻的"无法检测 include 和库文件的变化"。
- 源码视图单独处理：`source.read` 的 `matchesSnapshot` 为 `false` 时提示位置可能不准。

**库信息提供方**：blackbox 没有端口声明，引脚方向和单元角色只能来自外部库。旧代码里这是"跑过 memory-map 之后 `getPorts` 的结果会变"的隐式副作用。新设计把它做成打开设计时的显式输入，它的内容计入 `inputHash`：

```cpp
struct LibraryProvider {
  virtual std::optional<CellInfo> cell(std::string_view definitionName) const = 0;
};
struct PinInfo  { std::string name; Direction dir; std::optional<uint32_t> width;
                  std::map<std::string, std::string> attrs; };
struct CellInfo { std::vector<PinInfo> pins; std::map<std::string, std::string> attrs; };
```

第一版提供接口和一个空实现；没有库信息时 blackbox 引脚方向报 `unknown`，宽度按 4.4 的规则从连接表达式取得，取不到则为 `null`。

**内核对库信息的使用边界：**

- 内核只使用引脚的名字、方向和声明宽度。这些是结构信息，决定引脚位空间和它是驱动端还是负载端；声明宽度优先于连接表达式推断。
- `attrs` 是不透明的键值对，内核只保存并原样带出（在 `inst.ports` 和 `Hop.cell` 里），不读取、不解释。"这是触发器"、"这是门控单元"、"这个引脚是时钟"之类的含义由分析侧约定键名并解释。
- 库的 `attrs` 不改变内核遍历行为：`step` 遇到 blackbox 引脚返回终点；`full` 按已知方向构造输入到输出的保守依赖，不看 `attrs`，精确规则及未知方向的 partial 见 5.5.2、5.5.4。是否把某个库单元当缓冲器精确穿过，只能由调用 `step` 的分析决定。

### 4.9 完整性

所有查询结果都带完整性说明。空结果只有在 `complete` 时才能解释为"没有"。

```ts
interface Completeness {
  status: "complete" | "partial";
  reasons: {
    code: "budget_nodes" | "budget_edges" | "budget_depth" | "budget_time" | "blackbox" | "unresolved_expr"
        | "hier_ref" | "interface_port" | "unknown_pin_width" | "complex_port"
        | "indexing" | "unsupported";
    at?: ObjectRef;              // 在哪里停下
    detail?: string;
  }[];
}
type ReasonCode = Completeness["reasons"][number]["code"];
```

---

## 5. 内核接口

### 5.1 C++ 接口（L3）

这是内核的接口概览，协议和命令行都是它的翻译。DFT 分析在集成阶段直接链接并调用它。以下省略错误外层；实际使用已交付的 `Result<T>`。M3 新增方法的可编译签名和数据约定以 5.5 为准。

```cpp
namespace hier {

class Design {
 public:
  static Expected<std::unique_ptr<Design>> open(const OpenOptions&, const LibraryProvider* = nullptr);
  const SnapshotInfo& snapshot() const;
  Diagnostics diagnostics(Cancel);                      // 首次调用会展开整个设计
  InputCheck  checkInputs(Cancel) const;                // 哪些源文件在打开后被改过；不改变快照

  // —— 导航 ——
  std::vector<InstRef> roots() const;
  Page<InstInfo>  children(InstRef, PageReq) const;     // 确定排序，分页
  std::vector<InstInfo> ancestors(InstRef) const;       // 从顶层到父实例
  InstInfo        instance(InstRef) const;
  Page<DefInfo>   definitions(PageReq) const;
  QueryResult<Page<InstInfo>> instancesOf(DefRef, PageReq, Cancel) const;

  // —— 详情 ——
  std::vector<PortInfo>  ports(InstRef) const;
  std::vector<ParamInfo> params(InstRef) const;
  Page<SignalInfo>       signals(InstRef, SignalFilter, PageReq) const;
  Page<ProcessSummary>   processes(InstRef, PageReq) const;
  QueryResult<ProcessInfo> process(ObjectRef) const;    // 含表达式结构；有层次引用时为 partial
  ObjectInfo             object(ObjectRef) const;       // 任何引用是什么、属于哪个实例
  QueryResult<Page<RegisterInfo>> registers(InstRef, bool recursive, PageReq, Cancel) const;

  // —— 搜索与路径 ——
  QueryResult<std::vector<ObjectRef>> resolvePath(std::string_view text) const;
  QueryResult<Page<ObjectHit>> search(const SearchQuery&, PageReq, Cancel) const;

  // —— 连接 ——
  LocalNetlist bindings(InstRef) const;                 // 一层：信号、子实例引脚绑定
  QueryResult<std::vector<Endpoint>> drivers(Slice, Reach, Side, Cancel) const; // Reach: Local | ThroughHierarchy
  QueryResult<std::vector<Endpoint>> loads  (Slice, Reach, Side, Cancel) const; // Side 仅对端口有意义，见 4.3

  // —— 追踪 ——
  QueryResult<StepResult> step(Slice from, Direction, Side, StepLimit, Cancel) const;  // 走一步，见下
  QueryResult<TraceResult> cone (TracePoint start, TraceDirection, TracePolicy, Budget, Cancel) const;
  QueryResult<TraceResult> paths(TracePoint from, TracePoint to, Budget, Cancel) const;

  // —— 源码 ——
  SourceSpan source(ObjectRefOrDefRef, SourceKind) const; // 定义处 / 实例化处 / 语句处
  QueryResult<Page<SourceHit>> resolveSource(FileRef, int line, optional<int> col, PageReq, Cancel) const;

  // —— 给分析用的低层访问 ——
  const BodyFacts& body(InstRef, FactLevel) const;      // 骨架 / 连接
  void forEachInstance(InstRef root, const InstVisitor&, Cancel) const;
};

}  // namespace hier
```

**统一的返回约定。** 凡是结果可能不完整的查询，C++ 一律返回 `QueryResult<T>`，协议上对应 `{result, completeness}`，TS 客户端对应 `Reply<T>`。三者是同一个契约：

```cpp
template <class T> struct QueryResult { T result; Completeness completeness; };
```

不返回 `QueryResult` 的方法（`children`、`ports`、`params`、`instance` 等）只读骨架或单个模块体的事实，结果总是完整的；协议上它们的 `completeness` 恒为 `complete`。精度摘要 `hasConservative` 属于结果本身，放在 `TraceResult` 和 `StepResult` 里。

**逐跳枚举**是追踪与分析的分界线。内核提供"从一个位段走一步"的查询，分析在其上写自己的循环，自己保存状态：

```cpp
// 从一个位段出发、沿一个方向走一步，返回下一跳
QueryResult<StepResult> step(Slice from, Direction, Side, StepLimit, Cancel) const;

struct StepLimit  { int maxHops = 1000; std::string cursor; };
struct StepResult { std::vector<Hop> hops; std::string next; bool hasConservative; };

struct Hop {
  enum Kind {
    BindingUp,        // 经本实例的端口到父模块的信号
    BindingDown,      // 经子实例的引脚到子模块的内部信号
    Process,          // 遇到驱动源（向后）或读取者（向前）
    Register,         // 遇到时序单元
    BlackboxPin, PrimitivePin, // 遇到 blackbox / primitive 的引脚
    TopPort, Const, Unconnected, Unresolved
  } kind;
  Slice  from;                    // 起点中由这一跳负责的部分
  BitMap map;                     // 兼容字段；M3 的逐 continuation 映射见 5.5.2
  ObjectRef via;                  // 经过的引脚、驱动源、时序单元或 blackbox 引脚
  std::vector<Continuation> next; // 可以继续走的位段，每个带角色和精度
  std::optional<CellInfo> cell;   // BlackboxPin：库信息提供方给出的引脚方向和单元角色
  ReasonCode reason;              // Unresolved：原因，与 Completeness 的 code 是同一个枚举
};
// M3 的 Continuation 另有 from/side/align/map，完整结构见 5.5.2。
struct Continuation { Slice slice; UseRole role; Precision precision; /* ... */ };
```

`step` 的成本、取消和完整性：

- **成本上界**：一次 `step` 最多访问两个模块体的连接级事实（当前模块体，以及一个父或子模块体）。需要其他相邻模块体时提前分页；冷、热缓存采用同一分页边界。使用局部索引定位游标，提取之外不扫描全部扇出再截断，具体见 5.5.2。
- **取消**：接受 `Cancel`，检查点在每次模块体提取之后和每产出一批跳之后。
- **数量上限**：高扇出的信号向前走一步可能有上万个负载。超过 `maxHops` 时只返回前一部分，`next` 给出游标，`completeness` 为 `partial`、原因 `budget_nodes`。跳的顺序是确定的，游标在快照内有效。
- **位映射的大小**：`BitMap` 用连续段表示（起始位、目标起始位、长度），大小与段数成正比，不与位宽成正比。
- **完整性**：遇到 interface、层次引用、无法解析的表达式时，对应的跳种类为 `Unresolved` 并带原因，同时 `completeness` 里汇总同样的原因。两处一致：`Hop.reason` 说明是哪一跳，`completeness` 让调用方不必逐跳检查就知道这一步是否完整。
- 已知方向及宽度的 blackbox 引脚是确定终点，不算不完整；未知方向或宽度的具体端点/reason 见 5.5.2。

分析循环调用 `step` 时，要自己把每一步的 `completeness` 汇总进最终结果；内核自带的 `cone` 也会汇总。策略要求继续而终点缺少内部关系时，还须添加相应语义缺口，不能仅凭 step 的局部 complete 宣称整个追踪完整（5.5.4）。

每一跳给出分析做决定所需的全部上下文：这一跳是什么、经过哪个对象、位怎么映射、从哪些输入可以继续、各输入的角色。对 `Process` 跳，分析用 `process(via)` 取表达式结构；对 `BlackboxPin` 跳，`cell` 给出库单元信息。

是否继续、从哪个输入继续、何时停下，全部由调用方决定，可以细到"穿过这个 blackbox 的 A 引脚但在 B 引脚停下"。三值状态、引脚约束、记忆化都是分析自己的状态，内核不保存也不感知。

内核自带的 `cone` 和 `paths` 就是用 `step` 写的循环，只提供三种固定策略：`structural`（只沿绑定走，遇到驱动源就停）、`combinational`（穿过组合驱动源，停在时序单元和 blackbox）、`full`（遍历全部可用依赖；缺少所需内部关系则 partial）。具体语义边界和 paths 的否定保证见 5.5.4。它们服务于界面上的通用追踪。时钟复位树这类有自己规则的分析不使用 `cone`，直接用 `step`。

这个接口不含任何 DFT 概念，内核仍然只描述设计结构。

**规划对象不进内核。** 旧实现里规划的 mux、OCC 点、引脚约束，都是分析侧用路径字符串做匹配和后处理，并不创建设计对象。新设计延续这一点：`step` 只走真实设计，分析在自己的循环里叠加规划。因此内核不需要"虚拟连接"机制。

### 5.2 协议（L4）

沿用标准输入输出上的 NDJSON。旧的 `daemon.cjs` 机制可用，问题在于没有版本、没有取消、没有快照校验。

```jsonc
// 握手（进程启动后的第一条）
{"event":"hello","protocol":2,"snapshot":{...},"capabilities":["cancel","progress"]}

// 请求
{"id":7,"method":"conn.drivers","snapshot":"s-91ab","params":{...}}

// 响应
{"id":7,"ok":true,"result":{...},"completeness":{"status":"complete","reasons":[]}}
{"id":7,"ok":false,"error":{"code":"stale_snapshot","message":"...","data":{}}}

// 取消与进度
{"method":"cancel","params":{"target":7}}
{"event":"progress","target":7,"done":1200,"total":17100}
{"event":"index","state":"ready"}
```

错误码：`bad_request`、`unknown_method`、`stale_snapshot`、`stale_cursor`、`not_found`、`cancelled`、`unsupported`、`internal`。

方法清单（与 5.1 一一对应）：

| 方法 | 入参 | 出参 |
|---|---|---|
| `design.info` | — | `SnapshotInfo` |
| `design.diagnostics` | — | 诊断列表 |
| `design.checkInputs` | — | `{changed: FileRef[], complete: boolean}` |
| `inst.roots` | — | `InstInfo[]` |
| `inst.children` | `inst, cursor?, limit?` | `{items: InstInfo[], next?}` |
| `inst.ancestors` | `inst` | `InstInfo[]` |
| `inst.get` | `inst` | `InstInfo` |
| `inst.ports` | `inst` | `PortInfo[]` |
| `inst.params` | `inst` | `ParamInfo[]` |
| `inst.signals` | `inst, filter?, cursor?, limit?` | `{items: SignalInfo[], next?}` |
| `def.list` | `cursor?, limit?` | `{items: DefInfo[], next?}` |
| `def.instances` | `def, cursor?, limit?` | `{items: InstInfo[], next?}` |
| `search` | `text, kinds?, scope?, cursor?, limit?` | `{items: ObjectHit[], next?}` |
| `path.resolve` | `text` | `ObjectRef[]` |
| `conn.bindings` | `inst` | `LocalNetlist` |
| `conn.drivers` / `conn.loads` | `slice, reach, side?` | `Endpoint[]` |
| `conn.step` | `from, direction, side?, maxHops?, cursor?` | `StepResult` |
| `trace.cone` | `start: TracePoint, direction, policy, budget` | `TraceResult` |
| `trace.paths` | `from: TracePoint, to: TracePoint, budget` | `TraceResult` |
| `seq.registers` | `inst, recursive, cursor?, limit?` | `{items: RegisterInfo[], next?}` |
| `proc.list` | `inst, cursor?, limit?` | `{items: ProcessSummary[], next?}` |
| `proc.get` | `ref` | `ProcessInfo` |
| `obj.get` | `ref` | `ObjectInfo` |
| `obj.source` | `ref, kind` | `SourceSpan` |
| `source.resolve` | `file: FileRef, line, col?, cursor?, limit?` | `{items: SourceHit[], next?}` |
| `source.read` | `file: FileRef` | `{text, contentHash, matchesSnapshot}` |

M2 各方法的参数和结构的完整定义见 5.4；M3 草案见 5.5。这里的协议方法在 M4 实现，M3 验收核心 API 和 CLI。

协议上的 `policy` 取内核自带的三种名字之一。`conn.step` 与 C++ 的 `step` 等价，界面上的手动逐步展开用它。

**取消与工作线程的确切语义：**

- 请求按到达顺序排队，由唯一的工作线程逐个执行。
- 取消一个**还在排队**的请求：从队列移除，回复 `cancelled`。
- 取消一个**正在执行**的请求：设置取消标志。工作线程在检查点看到标志后中止，回复 `cancelled`，不返回部分结果。检查点是：每提取完一个模块体、追踪和搜索中每处理一定数量的节点。
- 取消一个已完成或不存在的请求：忽略，不回复。
- **每个请求恰好得到一个回复**：成功、错误或 `cancelled`。由下面的状态规则保证：
  - 每个请求有一个状态：`排队` → `执行中` → `已结束`。进入 `已结束` 的转换在一把锁下完成，只发生一次，回复在同一次转换中入队。
  - 取消消息对 `排队` 的请求：由协议线程完成转换，回复 `cancelled`。
  - 取消消息对 `执行中` 的请求：只设置标志，不做转换。转换始终由工作线程完成：它在检查点看到标志就以 `cancelled` 结束；如果在看到标志之前已经算完，就以成功结束，取消不生效。
  - 取消消息对 `已结束` 的请求：什么都不做。
  - 因此不会出现成功和 `cancelled` 两个回复，也不会出现取消后没有回复。
- **取消是尽力而为的。** 两个检查点之间的工作不可中断，Slang 的展开和整设计诊断尤其如此。取消后工作线程可能继续忙一段时间，后面排队的请求要等它。最长的不可中断时间在 M0 测量（验证项 V8）；超过可接受范围时，客户端的最后手段是重启进程。
- 模块体的提取是原子的：被取消时丢弃未完成的那一个，已完成的保留在缓存里。因此取消不会让缓存处于半成品状态。
- 标准输入关闭时，工作线程执行到下一个检查点后进程退出，未完成的请求不再回复。客户端把传输关闭视为所有等待中的请求失败。
- 客户端一侧：调用方中止后立即以 `cancelled` 结束等待，之后到达的回复直接丢弃。

**源码读取的权限与版本：**

- 快照有一张源文件表，记录编译时读入的每个文件及其内容哈希。`SourceSpan` 里的文件用表内编号 `FileRef` 表示，另带路径用于显示。
- `source.read` 的入参是 `FileRef`，不是路径。内核只读表内的文件，其他路径一律 `not_found`。
- 回复为 `{text, contentHash, matchesSnapshot}`。内核打开文件一次，把全部内容读入内存，`text` 和 `contentHash` 都由这一份内存内容得出，二者必然一致；读取过程中文件被替换不会造成文本与哈希对不上。
- `matchesSnapshot` 是把这个哈希与快照文件表里的哈希比较的结果。为 `false` 时界面必须提示"源码已变化，位置可能不准"。

**分页游标：**

- `inst.children`、`inst.signals`、`def.list` 的顺序由模块体内的声明顺序或定义排序决定，与索引状态无关。它们的游标在整个快照内有效。
- `search`、`def.instances`、`source.resolve`、`seq.registers` 的递归形式依赖全设计索引。索引建立期间发起的查询，结果为 `partial`，原因 `indexing`；这期间拿到的游标带有索引状态标记，索引就绪后再使用会得到 `stale_cursor`，客户端从头重新查询。
- 游标对客户端不透明，不跨快照使用。
- **游标绑定产生它的查询。** 游标内部记录方法名和决定结果顺序的全部参数（例如 `conn.step` 的 `from`、`direction`、`side`）。带着游标发来的请求，这些参数必须与原查询一致，否则返回 `bad_request`。每页数量（`limit`、`maxHops`）不在绑定之内，它只决定这一页取多少，不改变顺序，翻页途中可以改。
- **游标不受缓存淘汰影响。** 游标记录的是确定顺序中的位置；事实重新提取后顺序不变（4.2），所以同一游标仍然指向同一位置。

主要类型：

```ts
interface InstInfo {
  ref: ObjectRef; name: string; path: string[]; pathText: string;
  kind: "module" | "interface" | "blackbox" | "primitive";
  def: DefRef; defName: string;
  childCount: number;            // 0 表示叶子
  hasParamOverrides: boolean;
}

interface Endpoint {
  kind: "process" | "top_port" | "own_port" | "module_pin" | "blackbox_pin" | "primitive_pin"
      | "const" | "unconnected" | "unresolved";
  queried: BitRange;             // 被查询位段中由这个端点负责的部分
  ref?: ObjectRef;               // 驱动源、端口或引脚
  inst?: ObjectRef;              // ref 所属的实例
  bits?: BitRange;               // 端点自己一侧的位段；process 时等于 at.bits
  at?: Slice;                    // process 必填：查驱动时是写目标，查负载时是被读信号
  value?: string;                // const：只含本次返回位段，位宽等于 queried.width
  reason?: ReasonCode;           // unresolved 或未知方向 blackbox 候选的原因
  via: Hop[];                    // 穿过了哪些层次边界，每步带位映射
  source?: SourceSpan;
}
// 位映射：连续段的列表，from 是这一步起点一侧的最低位，to 是终点一侧的最低位
interface BitMapSegment { from: number; to: number; width: number; }
type BitMap = BitMapSegment[];

interface TraceResult {
  nodes: TraceNode[];            // 完整结构见 5.5.4
  edges: TraceEdge[];
  frontier: TraceFrontier[];     // 含 side、深度、停止原因及可选的 step 游标
  hasConservative: boolean;      // 结果里是否含保守依赖
  // 完整性在外层：协议的 completeness 字段，C++ 的 QueryResult
}

interface Budget { maxNodes?: number; maxEdges?: number; maxDepth?: number; maxMillis?: number; }
```

### 5.3 命令行

`hier <命令> [参数] <设计>`，每个命令对应一个协议方法，输出一行 JSON。用途是测试、脚本和差分验证。`hier serve <设计>` 启动协议服务（M4）。`<设计>` 的写法见 `hier --help`。

**输出的外形只有两种：**

- C++ 返回 `QueryResult<T>` 的方法，输出 `{"result": T, "completeness": {"status": "complete" | "partial", "reasons": [{"code", "at"?, "detail"?}]}}`。
- 其余方法直接输出 `T`。分页的 `T` 是 `{"items": [...], "next"?: "..."}`。

失败时以非零状态退出，输出 `{"error": {"code", "message"}}`。

**位段的写法**：`--lsb N --width W`，位置编号见 4.3。两个都不给时表示对象的全部位；只给一个是 `bad_request`。

| 命令 | 对应方法 | 输出 | 里程碑 |
|---|---|---|---|
| `info`、`diags`、`roots`、`defs` | `design.info` 等 | 直接 | M1 |
| `inst <inst>`、`children <inst>`、`ancestors <inst>`、`params <inst>` | `inst.*` | 直接 | M1 |
| `ports <inst>` | `inst.ports` | 直接；M2 起每项带 `ref` 和 `internal` | M1，M2 扩充 |
| `verify-sharing` | — | 文本，退出状态 | M1 |
| `signals <inst> [--limit N] [--cursor C]` | `inst.signals` | 直接，分页 | M2 |
| `bindings <inst>` | `conn.bindings` | 直接 | M2 |
| `procs <inst> [--limit N] [--cursor C]` | `proc.list` | 直接，分页 | M2 |
| `proc <ref>` | `proc.get` | `result` + `completeness` | M2 |
| `registers <inst> [--recursive] [--limit N] [--cursor C]` | `seq.registers` | `result`（分页）+ `completeness` | M2 |
| `obj <ref>` | `obj.get` | 直接 | M2 |
| `drivers <ref>`、`loads <ref>`，带 `[--lsb N --width W] --reach local\|hier [--side inside\|outside]` | `conn.drivers`、`conn.loads` | `result` + `completeness` | M2 |
| `step <ref> [--lsb N --width W] --dir back\|forward [--side …] [--max-hops N] [--cursor C]` | `conn.step` | `result` + `completeness` | M2 |
| `verify-facts` | — | 文本，退出状态 | M2 |

`verify-sharing`另接受`--comparison-cache-bytes N`（M7诊断增量），仅给这两份比较快照设置
既有`OpenOptions.connectionCacheBytes`。N为0..本平台size_t最大值的无符号十进制字节数，
0关闭连接缓存；省略保持OpenOptions原默认。无效/溢出/缺值为bad_request，其他命令含serve拒绝该选项。
此参数只控制开发比较的缓存驻留，不是Core进程RSS上限，也不改变demo预算或oversized淘汰规则。
每实例/每过程比较及失败条件保持；大于缓存的单模块会反复提取，诊断时可显式选有界较大值。

完整共享校验先将共享侧每实例的原始完整查询JSON及成功状态写入本次调用的匿名临时文件，
释放该Design后再打开逐实例侧，按相同引用、过程列表和分页逐bytes比较；不以摘要替代事实。
ref到文件位置的索引与当前查询/序列化值仍占内存，临时存储随完整结果量增长，需要可写临时空间。
创建、写入、flush、定位或读取失败明确非零退出，不发布成功摘要。两次打开间已捕获输入哈希不同也明确失败；
相同哈希不改变inputHashComplete的完整性含义。临时记录只在同一进程内读取，正常/异常结束关闭，
不是工程格式或持久缓存；此策略减少同时存活的编译设计，不承诺整个命令的硬RSS上限。
捕获直接写入现有JsonWriter的完整字符串，不另建返回值副本；比较按64KiB缓冲读取记录，
逐bytes/长度核对当前序列化结果，即使已发现差异也读完本条记录，后段截断仍明确失败。
实例元数据和过程摘要在进入子树前释放；当前查询/JsonWriter、祖先children页、引用索引和
临时磁盘仍可能很大，固定读取缓冲不表示所有查询或递归工作集有界。

`--reach` 必须给出。`--side` 在 `<ref>` 是端口时必须给出，不是端口时不得给出（4.3 第 5 点）。

### 5.4 M2 的数据结构

这一节把 M2 用到的结构写全。它回答评审记录里的 B-01 至 B-07；与前面章节里的示意有出入的地方，以这一节为准。

**对象查询（B-02）。** 任何引用都能问出它是什么、属于哪个实例：

```ts
// obj.get(ref)
interface ObjectInfo {
  ref: ObjectRef;
  kind: "instance" | "port" | "signal" | "process" | "register";
  name: string;        // 驱动源和时序单元没有名字，为空
  inst: ObjectRef;     // 所属实例；实例自己的 inst 是它本身
  pathText: string;    // 实例路径；端口和信号再加上自己的名字
}
```

`Endpoint` 也直接带 `inst`（5.2），所以跨层查询的结果不需要再查一次。

**端口和信号（B-02）。** `inst.ports` 的每一项在 M1 的字段之外增加：

```ts
interface PortInfo {
  // ……M1 的字段
  ref: ObjectRef;               // "p:<InstKey>:<序号>"
  internal: PortInternal;        // 不缺省；无法静态解析也显式说明原因
}
type PortInternal =
  | { kind: "direct"; signal: ObjectRef; bits: BitRange }
  | { kind: "mapped"; segments: InternalSegment[]; status: "complete" | "partial"; expr?: string }
  | { kind: "unresolved"; reason: ReasonCode; expr?: string };
// mapped.status == partial 和片段级 unresolved 为预留能力，M2 支持矩阵见下。
interface InternalSegment {
  portBits: BitRange;
  target: { kind: "signal"; signal: ObjectRef; bits: BitRange }
        | { kind: "const"; value: string }
        | { kind: "unresolved"; reason: ReasonCode };
}
// inst.signals(inst, page)
interface SignalInfo {
  ref: ObjectRef; name: string;
  kind: "net" | "variable";
  type: string; width: number; signed: boolean; dims: Dim[];
  members: MemberInfo[]; // 结构成员的声明顺序及位偏移；普通类型为空
  opaque: boolean;     // 没有位空间的类型（4.3），只能整体引用
}
```

端口和它的内部信号是两个对象、两个引用，通常同名。`direct` 保留普通端口的一对一形态，`bits` 与端口全宽逐位对应。非 ANSI 和复合端口能静态拆开的，按端口低位到高位返回 `mapped.segments`；片段互不重叠且覆盖端口全宽，信号片段等宽逐位对应。整段无法解析、interface/modport 和无内部实现的 blackbox 用顶层 `unresolved`，带明确原因。`conn.drivers`、`conn.loads` 和追踪在穿过未解析的内部对应时返回 `partial`。端口声明的精度不依赖引脚外侧是否有连接。

**M2 的内部映射支持矩阵（B-10）。**

| 合法输入 / 能力 | M2 行为与验收 |
|---|---|
| 本地定长信号的一对一对应，包括可静态确定的位选、段选和成员 | `direct`，必须给出正确的内部信号和位段 |
| 可静态拆分的复合端口，例如非 ANSI 拼接和显式 ANSI 端口中的等价拼接 | `mapped` 且 `status: complete`，核对每段位对应及跨层查询；不能因写法复杂而退为 unresolved |
| 整体不支持的端口，如 interface/modport、无内部实现的 blackbox | 顶层 `unresolved`，核对原因和相应连接查询的 partial 行为；有端口表达式时保留 `expr` |
| `mapped.status: partial` 与 `InternalSegment.target.kind: unresolved` | **预留接口能力，不要求 M2 用合法 HDL 触发这一分支。** 目前没有已确认的 Slang v12.0 合法触发样例；编译错误不能充当该分支的 oracle |

片段级降级以后启用时，必须先提供可编译输入及手写期望并通过契约评审：局部无法解析的片段用 `unresolved`、整体 `status: partial`，保留 `expr`；查询只在涉及未解析片段时带对应 `reason`，已解析片段仍可返回。这一表示继续保留，但不算 M2 已实现或已测试的功能。M2 的 A10 门槛要求可解析复合端口与整体 unresolved；发现新的合法、可静态解析构造仍须按 A10 正确映射，不能引用“预留”作为省略支持的理由。

**一层的绑定（B-03）。**

```ts
// conn.bindings(inst)
interface LocalNetlist { inst: ObjectRef; bindings: PinBinding[]; }
```

`PinBinding`、片段的顺序、常量的文本形式、平凡与非平凡的划分，见 4.4。`bindings` 按子实例位置的顺序、每个子实例内按端口声明顺序排列。

**驱动源（B-04）。**

```ts
// proc.list(inst, page)：一个实例的全部驱动源，按声明顺序
interface ProcessSummary { ref: ObjectRef; kind: ProcessKind; }
type ProcessKind = "assign" | "init" | "port_expr"
                 | "always_comb" | "always_ff" | "always_latch" | "always" | "initial";

// proc.get(ref)，返回 QueryResult
interface ProcessInfo {
  ref: ObjectRef; kind: ProcessKind; inst: ObjectRef;
  writes: Write[];                 // 见 4.4；按目标声明/位段排序，不表示 RHS 位顺序；M3 值映射见 5.5.3
  expr?: Expr;                     // 仅 assign、init、port_expr（4.5）
  externalRefs: { text: string; access: "read" | "write" }[];   // 层次引用，见下
}
```

- `init` 是带初始值的网线声明（`wire x = a & b;`），它写的是那根网线。带初始值的变量声明不是驱动源。
- 输入 `port_expr` 写子实例引脚，输出转换 `port_expr` 写父模块信号并读取子实例引脚；具体转换、复合端口的全局位号和查询规则见 4.4。
- `always` 是既不是 `always_comb`、`always_ff` 也不是 `always_latch` 的 always 块，不论它是组合的还是时序的。

**不变量检查命令。** `hier verify-facts <设计>` 分开统计 Slang 对照和本工程自有逻辑检查，不能把两者合成一个"已对照"数字。

过程分析匹配可在本次 L1 提取内索引化：先按原 Symbol 身份匹配，再以 canonical 分析中的
`kind/location/relative` 完整签名退路，均保留原列表最后匹配。索引只借用已完成分析的稳定对象，
随 Extractor 释放，不是另一个 oracle 或全局缓存；直接命中不计算退路路径，退路元数据按需构建成功后发布。
独立源码访问、Slang 驱动/读集合、自检、计数、缺失分析与不一致退路保持原规则；索引不改变分析范围或预算。

非代表父实例中的子体按原父/代表父的相同槽位查找分析来源，仍以唯一SlotWalker定义顺序，保留首个有效Instance对应及自对应停止规则。
该路由可只保存最近一个父对的完整对应表，切换时构建后替换；表只借用本快照AST，递归前复制目标AST指针，不能借用可替换表的元素。
异常展开清除未完成Body查找的递归占位，已完成分析memo保持；不以名称/参数另造共享判据，不改变原缺失分析退路或Slang覆盖。

1. `assign` 和过程块才有 Slang `AnalysisManager` 的逐驱动源读写集合。先把 Slang 和本工程两侧都投影到**该模块体内的信号位空间**，按 `{信号, 位}` 做集合比较。源码访问集合由独立 AST 访问遍历产生（按 Slang 的控制流语义排除已证明不可达的分支，例如穷尽 `casez` 的 default）：左值遍历记录完整本地写目标，右值、选择器及条件遍历记录源码读取；它们分别与 Slang 的写集合和读集合比较，排除单独的事件表达式。输出依赖单独验证：全部本地 `Write.target` 与独立左值集合相等；`Dep` 的 `data`、`control` 并集与独立的逆向位段需求投影相等，排除 `clock`、`async` 事件角色。逆向投影按输出需要的位段回溯表达式，不调用生成 `Dep` 的逐位遍历，不读取生成后的事实；常量移位、截断等丢弃位仍保留在源码访问集合中，但不进入输出影响集合。具体逐位映射、角色和精度另以手写 KAT 核对，不能仅用集合相等证明映射正确，也不能只要求 `Dep` 是 Slang 读集合的子集。Slang 的 `getReadSet()` 是过程体读集合，不含事件表达式的单独读取；同一信号既是事件信号又是 `if` 条件时，条件读取仍在读侧，不能按信号名直接扣掉。比较前两侧都按位展开、去重和排序，重叠写不因集合去重而被允许；同一驱动源的 `Write` 仍不得重复覆盖同一目标位。
2. `init`、`port_expr` 没有 Slang 的逐驱动源 oracle，不参与上一项的等值比较。初始化和输入连接以声明宽度/引脚位空间核对完整目标；输出连接以独立左值遍历核对父侧目标，并把 Slang 输出占位表达式对应到子引脚位空间。以独立表达式访问遍历收集源码读取，再用逆向位段需求投影核对输出依赖。访问集合与输出依赖不强制相等；二者均独立于生成 `Dep` 的逐位遍历。再用手写 KAT 核对具体位映射、角色和常量，不能把自检计数写作 Slang 对照数。
3. 含 `externalRefs` 的 `assign` 或过程块：本版**跳过该驱动源的 Slang 等值比较**，计入 `skippedExternal`，并保留 `proc.get` 的 `partial/hier_ref`；本地 `Write`/`Dep` 仍执行第 2 项的边界、独立左值和逆向位段需求检查。不能把外部对象丢掉后声称全量等值。`verify-facts` 对此可成功退出，但必须报告跳过数及位置；含层次引用的 fixture 必须断言该数大于零。

命令至少输出 `slangCompared`、`selfChecked`、`skippedExternal`、`mismatched` 四个数和前若干处不匹配的位置。设计有编译错误、没有顶层、没有任何驱动源，或任一检查不匹配时失败；有驱动源但只有 `init`/`port_expr` 时，只有自有逻辑检查成功也可通过，`slangCompared` 必须为零。运行时也强制执行适用的检查，完整退路见第 10 节：源码访问、独立写目标或输出依赖投影检查不符时，以 Slang 的完整本地写集合重建保守目标和依赖；不能安全重建或自有检查失败时，不发布该驱动源的连接事实，并让受影响的查询返回明确 `partial/unsupported`。`mismatched` 记录退回前的检查失败，保守重建成功也不能把 `verify-facts` 变成成功。CI 在普通样例和两个真实设计上要求 `slangCompared > 0`，在层次引用 fixture 上要求 `skippedExternal > 0`。`verify-facts` 的成功只表示**适用的检查全通过且跳过被明确报告**，不表示外部引用被精确提取。

**端点（B-06）。** `Endpoint` 见 5.2。各种 `kind` 出现的场合：

| kind | 含义 | `reach: local` | `reach: hier` |
|---|---|---|---|
| `process` | 驱动源（查驱动）或读它的驱动源（查负载） | 有 | 有 |
| `own_port` | 本实例自己的端口：信号经它出入本模块 | 有 | 没有：继续穿到父模块 |
| `module_pin` | 子模块实例的引脚 | 有 | 没有：继续穿进子模块 |
| `top_port` | 顶层端口，没有父模块可穿 | 没有：局部时报 `own_port` | 有 |
| `blackbox_pin`、`primitive_pin` | 黑盒或基本门的引脚，里面没有可查的内容 | 有 | 有 |
| `const` | 引脚绑定到常量 | 有 | 有 |
| `unconnected` | 引脚悬空 | 有 | 有 |
| `unresolved` | 无法解析，带原因 | 有 | 有 |

`assign x = 1'b0;` 的驱动是一个没有依赖的 `process`，不是 `const`；`const` 只来自引脚绑定。

每个端点的 `queried` 互不重叠时可以拼出被查询的位段；多驱动时会重叠。端口和引脚的 `bits` 是它们自己的位空间。`process` 的 `ref` 只标识驱动源，必须另带 `at: Slice`：查驱动时 `at` 是该 process 的写目标，查负载时是它读取的信号；`bits` 等于 `at.bits`，仅为现有通用端点读取方式保留。这样同一 process 的 `a[0]` 和 `b[0]` 不会混淆。`const` 没有位空间，不带 `bits`；`value` 只含本次返回的位段，位宽等于 `queried.width`（例如单查 `4'b10xz` 的第 1 位返回 `1'bx`）。

M7 的端点汇总保持原发现顺序、去重身份与首个相邻匹配规则；局部索引只保存查询拥有vector的下标，
不复制事实或改变路线字段。相邻查找按原下标优先，结束坐标修改前移除旧键、修改后重插；
借用索引在vector移动前销毁，取消/错误不发布局部半成品。小集合保留线性路径，常量文本和遍历/查询副本成本仍存在。

连接查询的Walk用查询范围的不可变租约读取canonical BodyConnections，按BodyId复用，按发生位置限定命中引用；
不逐个调用公开proc或复制整个过程树/绑定集合。普通/无体实例端口投影与公开ports使用同一边界，
保持旧宽度、attrs和方向覆盖规则。租约独立于L2保留预算，淘汰不使查询引用悬空，返回端点拥有全部值；
查询结束释放租约，不产生全局缓存或改写事实/estimatedBytes。原入口对象校验仍可先冷提取，
整个查询的访问体、端口投影、遍历和结果仍有内存/时间成本，不能将租约数量视作硬资源界限。

无体实例的宽端口投影可按已生成端口引用建立本次调用内的借用索引，按父绑定原序查找并回填；短表仍可线性。
两路径共用原覆盖规则：有值宽度覆盖、attrs取后项、只有in/out/inout更新方向，未知/ref不清除已知方向。
引用仍沿原qualify精确比较，不按名称合并；元数据在输出vector移动/返回前释放，取消或异常不发布半结果，不另建事实或改变L2预算。

连接索引的寄存器边界可按原process/target分组在本次构建内预先归并，保留所有有效寄存器端点，含被更早项遮蔽的边界。
写片段按原切点分割、重叠取原分组首项，不能合并相邻同赢家片段或改变Dep路由/索引字节计费；短组和异常unsigned-wrap范围保持原线性规则。
临时表只借用不可变事实和已完成分组，完整构建后发布、随builder释放；取消/异常不发布半索引，不增加全局缓存或另造寄存器事实。

**时序单元。**

```ts
// seq.registers(inst, recursive, page)，返回 QueryResult
interface RegisterInfo {
  ref: ObjectRef; inst: ObjectRef;
  signal: ObjectRef; bits: BitRange;      // 被写的变量位段
  process: ObjectRef;
  clock: { signal: ObjectRef; bits: BitRange; edge: "posedge" | "negedge" | "both" };
  async: { signal: ObjectRef; bits: BitRange; edge: "posedge" | "negedge"; type: "reset" | "set" | "unknown" }[];
}
```

寄存器分页可沿原DFS读取事实并计数/汇总全树完整性，仅为原offset窗口内的寄存器复制和限定发生位置。
页外partial原因和提取错误/取消不能因页面已满而忽略；页面参数错误仍在原数据遍历之后报告，原游标文本/边界/错误语义沿共用分页实现，不另造缓存或第二份寄存器事实。
页内物化不代表整查询内存有界：仍有原事实提取、深度栈与全树原因列表的成本。

**层次引用（B-07）。** 层次引用指向别的模块体里的信号，放不进本模块体的 `Write` 和 `Dep`。第一版只识别并标注，行为如下：

| 查询 | 行为 |
|---|---|
| `proc.get`，驱动源里有层次引用 | `externalRefs` 列出每一处的源码文本和读写方向；`completeness` 为 `partial`，原因 `hier_ref`，`at` 是这个驱动源。本模块体内的写和依赖照常给出 |
| `conn.drivers`，被查的信号在别处被层次引用写入 | 照常给出本模块体内的驱动；`completeness` 为 `partial`，原因 `hier_ref`，`at` 是被查的信号 |
| `conn.loads`，被查的信号在别处被层次引用读取 | 同上，方向相反 |
| `conn.step`、`trace.*` 经过上述任一情形 | `partial`，原因 `hier_ref` |

所以对被层次引用读写的信号查驱动或负载，结果不会是"空且完整"。

"在别处被层次引用"按实际 occurrence 的目标信号及读写方向标记，遵循 4.1 的共享排除规则。只有实际被引用的目标因该访问得到 `partial/hier_ref`；未被引用的同定义兄弟实例不会继承这个标记，共享与逐实例模式的结果一致。目标标记已精确到实例；第一版仍不提供层次引用的完整跨层连接遍历，因此保留上述 partial 行为。

---

### 5.5 M3 公开契约草案（2026-10-11，待独立冻结）

本节把 M3 的未定结构补成可写独立测试的契约；**不代表这些接口已实现或评审通过**。产品基线为 M2 `d98a124`，包含 B 最终冻结测试的集成基线为 `e8f6087`。B 从本节、HDL fixture 和手写映射冻结测试；C 审查本节的兼容性与工作量边界。已有 M2 断言继续保留。

#### 5.5.1 公共入口、错误和排序

C++ 沿用 `hier::Result`、`model::QueryResult`、`PageRequest`、`Page<T>`，新增纯数据类型放 L0。`Direction` 已用于引脚方向，追踪另用 `TraceDirection { Back, Forward }`；`TracePolicy { Structural, Combinational, Full }`；`SourceKind { Definition, Instantiation, Statement }`。JSON 名字分别为小写 `back/forward`、`structural/combinational/full`、`definition/instantiation/statement`。

```cpp
using Cancel = std::stop_token;  // 默认 {} 表示不请求取消；新增 ErrorCode::Cancelled

// 以下是 Design 的新增方法声明；model 类型可在声明处写全限定名。
Result<model::QueryResult<Page<model::InstInfo>>>
instancesOf(std::string_view def, const PageRequest& page = {}, Cancel cancel = {}) const;
Result<model::QueryResult<Page<model::ObjectHit>>>
search(const model::SearchQuery&, const PageRequest& page = {}, Cancel cancel = {}) const;
Result<model::QueryResult<std::vector<std::string>>>
resolvePath(std::string_view text, Cancel cancel = {}) const;
Result<model::QueryResult<model::TraceResult>>
cone(const model::TracePoint&, model::TraceDirection, model::TracePolicy,
     const model::Budget& budget = {}, Cancel cancel = {}) const;
Result<model::QueryResult<model::TraceResult>>
paths(const model::TracePoint& from, const model::TracePoint& to,
      const model::Budget& budget = {}, Cancel cancel = {}) const;
Result<model::SourceSpan> source(std::string_view ref, model::SourceKind) const;
Result<model::QueryResult<Page<model::SourceHit>>>
resolveSource(std::string_view file, uint32_t line, std::optional<uint32_t> col = {},
              const PageRequest& page = {}, Cancel cancel = {}) const;
Result<model::SourceRead> readSource(std::string_view file, Cancel cancel = {}) const;
Result<model::InputCheck> checkInputs(Cancel cancel = {}) const;
```

现有 `step(ref, bool upstream, ConnectionRequest, StepLimit)` 保留调用兼容性，末尾增加默认 `Cancel = {}`；`upstream=true` 对应 `back`。查询在入口校验参数，然后检查取消标志；在每次模块体提取前后、每个追踪扩展点、每页产出循环检查取消。搜索/索引扫描及大列表的检查间隔至多 256 条候选事实，读取文件每个至多 64 KiB 的块后检查。常数是协作式检查粒度，不是取消耗时保证；Slang 单次提取和系统调用仍可能不可中断。取消返回 `ErrorCode::Cancelled`，不返回 partial 结果；未完成的索引或事实不发布，已完成的缓存可保留。M4 的排队/响应竞争和 M7 的最长等待预算另行验收。

M3 入口的通用校验与顺序（不借本节改写 M1/M2 冻结测试）：

- 非法枚举、格式错误的引用、零/负页大小、非法位段、端口缺 side 或非端口带 side，返回 `bad_request`。格式合法但不在快照内的引用返回 `not_found`。TracePoint 仅接受信号和端口。固定宽度位段须非空且不越界；opaque 信号和未知宽度端口只能整体查询，在 TracePoint 中以 `{lsb:0,width:0}` 表示“无可用位空间”，不是一个合法的零宽位段。它们分别给 partial/unsupported 或 partial/unknown_pin_width，不生成一位连接；若强行指定非空位段则 bad_request。
- `limit` 默认 200，`maxHops` 默认 1000，均为正整数；空游标表示首页。分页最后一页 C++ `next` 为空、JSON 省略 `next`。非末页游标必须前进，不能连续返回同一游标。错查询 `bad_request`、跨快照或失效索引代次 `stale_cursor`，页大小可改变。
- 以下的“引用顺序”指内部解析后的数值元组：定义按定义编号；对象按 `(InstKey 的数值字典序, i/p/s/x/r 的固定次序, 同类序号)`，祖先先于后代。不是字符串排序（例如实例 2 在实例 10 前）。引用仍对客户端不透明。
- 同一快照、同一参数，在完整索引下结果及顺序不受查询历史、共享/逐实例模式、连接缓存淘汰影响。时间预算可能使返回前缀不同；不把墙钟时间相等作为 oracle。
- M3 同步查询完成所需索引后返回，或被取消；不要求公开接口必经一次 `partial/indexing`。未来并行读取正在建立的索引时仍遵守 5.2 的代次与 stale_cursor 规则。测试不得用调度时机推断索引状态；若需要强制 building 状态，须先评审独立测试适配接口。

#### 5.5.2 step 的 continuation、边界和分页

保留 M2 的 `Hop.kind/from/via/map/next/cell/reason`，扩充如下。字段未标可选时必填；C++ 可选值用 `std::optional`，JSON 不输出缺省可选字段。

```ts
type Side = "inside" | "outside";
interface TracePoint { slice: Slice; side?: Side; }
interface Continuation {
  from: BitRange;                  // Hop.from.ref 上实际参与本条关系的部分
  slice: Slice; side?: Side;       // 可直接作为下一次 step 的参数
  role: "data" | "control" | "clock" | "async";
  precision: "exact" | "conservative";
  align: "bitwise" | "all";
  map: BitMap;
}
interface Hop {
  kind: "binding_up" | "binding_down" | "process" | "register" | "blackbox_pin"
      | "primitive_pin" | "top_port" | "const" | "unconnected" | "unresolved";
  fact: string;                   // 快照内事实身份；不含查询先后次序/分页位置
  from: Slice; via?: ObjectRef;
  map: BitMap; next: Continuation[];
  at?: TracePoint;                // 终点位置；已知宽度的引脚/顶层端口必填
  value?: string;                 // const 必填，格式同 Endpoint.value
  cell?: CellInfo; reason?: ReasonCode;
}
```

`from` 和 `map[].from` 均是被查对象的绝对平坦位坐标，`map[].to` 是该 continuation 对象的坐标，不是相对本次查询的偏移。`bitwise` 的映射恰好覆盖该 continuation 的 `from` 和 `slice.bits`；`all` 的 `map=[]` 表示 `from` 中每位与 `slice.bits` 全部位有关，不伪造一对一关系。`conservative` 必为 `all`。反向追踪交换关系两端，保留原依赖的 role/precision；不把时钟或条件变成 data。

`Hop.map` 兼容字段等于按 `next` 顺序拼接各 continuation 的 bitwise 映射，多个目标之间可能重叠，**不能独立于 next 用来判断映射目标**。`next` 为空且 `at` 有已知位空间时，它描述 `Hop.from → at.slice` 的直接绑定；无位空间的终点为空映射。新调用方读取 `Continuation.map`。`hasConservative` 是本页实际返回关系的摘要；与 partial 独立。

逐跳规则：

1. 绑定跳只沿可证明的绑定映射，`binding_up/down` 的方向按层级升降命名，与 back/forward 无关。下一对象若为端口必须携带可直接查询的 side；顶层只有 inside。直接查一个端口时，只查询指定一侧，不隐式再次翻面。
2. 过程依赖按 `Write/Dep` 与查询位段求交后投影；`all` 不按相同位号裁掉对端。每个 Hop 对应一个 Write/Dep 关系或一个无依赖的 Write，`next` 至多一条，避免一个 Hop 藏无限扇出。同一 process 可有多个 Hop；多驱动和同一信号的不同角色不可合并。无依赖的 assign/init 仍为 process，不冒充引脚常量。
3. 时序识别按 Write 的目标与 RegisterInfo 求交，涉及被识别寄存器的关系用 `register`，`via` 为该寄存器；正、反方向一致。未被寄存器覆盖的目标保留 process；跨边界时拆段。依赖仍由其 process 提供；`step` 给出 continuation，由调用方决定是否穿越。
4. `fact` 标识原始 occurrence 上的绑定片段或 `(process, Write, Dep)`，没有 Dep 的 Write 也有身份；寄存器引用及角色参与区分。它不含裁剪位段或查询方向，因此两次查询命中同一原始关系可相认。同一事实的不同位段保留各自 from/map。最终字符串编码由实现选择，B 校验身份等价/不等价，不猜编码。
5. 跳按 `(via 引用顺序, 原始事实声明/片段顺序, from.lsb, next 的引用/位段/角色)` 排序；reason 终点再按 `(reason, via, from)` 排序。绑定片段低位在前，Write/Dep 沿 5.4 的事实顺序；缺失字段排在有值字段之前。仅合并同事实、同角色精度、且连续映射可直接拼接的相邻段。
6. 分页必须在局部索引上定位事实，不能先生成整扇出再截断。每页至多 `maxHops`，并至多访问当前体和一个相邻体；准备访问第三个体时提前结束，仍返回 `next` 与 `partial/budget_nodes`。当前体按被查 side 所属的上下文确定（子端口 outside 的上下文是父体）。这里按逻辑体访问计数，缓存命中也计入，所以冷热分页相同。一页不足 maxHops 不代表末页。事实提取之外的开销为索引定位加所枚举/返回的事实与映射段，不按总位宽逐位展开。提取本身的全体成本单独记录。
7. 原因按 `(code, at)` 去重，`detail` 仅为诊断文字；测试核对 code/at。本页发生的语义不完整与预算原因同时保留。只有预算截断产生 next；语义不完整的终点没有 next。所有页拼接后等于不截断的事实集合，不能把中间页的预算原因当作永久缺失事实。

**blackbox/primitive 与未知信息。** 该表同时收敛 M2 遗留的 endpoint/reason 歧义；已通过的明确终点与映射不变。

| 情形 | drivers/loads | step | cone/paths |
|---|---|---|---|
| 方向、宽度已知的 blackbox 引脚 | `blackbox_pin`，complete | `blackbox_pin`，next 为空，at 指向引脚 outside；cell 仅携带信息 | structural/combinational 停止且 complete；full 见 5.5.4 |
| 宽度已知、方向 unknown | 两个方向均返回可能关联的 `blackbox_pin`，`reason: blackbox`，partial/reason.at 为引脚 | 返回一个 `unresolved`，via 为该引脚，reason=blackbox，next 为空；不再额外给一个无原因的 blackbox 跳 | 保留边界和 partial，不猜内部方向 |
| 宽度 unknown | `unresolved`，reason=unknown_pin_width，不带虚构的引脚 bits | `unresolved`，同一原因，无虚构 at 位段 | partial/unknown_pin_width |
| primitive 已知引脚 | `primitive_pin` | `primitive_pin`，at 为引脚 outside，next 为空；局部引脚枚举 complete | structural 保留策略终点；combinational/full 若需继续探索内部则 partial/unsupported，并保留引脚 frontier（5.5.4）；第一版不展开内部关系 |
| interface/complex_port/hier_ref/无法安全发布的事实 | 沿 5.4 返回已知事实及 partial | 对每个 `(reason, at)` 给出 unresolved 终点并保留可用的独立关系 | 遇到的原因全部上传，不扩展 unresolved |

同一引脚同时缺方向和宽度时，优先报告 `unknown_pin_width`；修复宽度后再显露 `blackbox`，不把两个未知合成“悬空”。`drivers/loads` 的 unknown 黑盒候选不是已证实的驱动方向；用户必须结合 partial 解读。已知 blackbox 的库 attrs 不会把 step 终点自动变成 register 或组合门。

#### 5.5.3 表达式树

4.5 的树以**赋值语境完成类型转换后的 RHS**为语义对象，`width/signed` 为该子表达式的位宽和有符号性，非固定位宽为 null。可计算的整型常量折成 const；四态 value 为 `<宽度>'b<从高到低的 01xz>`。`ref.slice` 是 occurrence 引用与平坦位段。源码文本不参与对象身份。

**表达式结果到写目标的映射（C-46）。** 根 expr 的结果位空间为 `[0, expr.width)`，0 是该赋值转换后的 RHS 最低位，根宽度是完整左值所需的宽度；不能在按目标排序或拆成多个 Write 后重新编号。每个带 expr 的 process，其每个 Write 都必须带 4.4 的 `exprMap`：

- `status=mapped` 的每段 `{from,to,width}` 表示 `expr.result[from+i]` 的**值**赋给 `Write.target.ref` 上的平坦位 `to+i`。from 是根表达式结果的绝对位置，to 是目标对象的绝对位置，二者均不相对 Write.target.bits.lsb；不指向 Dep.signal 的位空间。
- 每段 width>0，来源不越过 expr.width，目标不越过该 Write.target.bits；按 `(to,from)` 排序，目标段互不重叠并恰好覆盖该 Write.target.bits。相邻段仅在 from/to 都连续递增时合并。来源可由多个段复用；目标重排用多段表达，不因依赖为空而省略。
- 左值拼接按 HDL 位布局分配：最右操作数占 RHS 最低位，嵌套递归处理；常量选择与非零目标 lsb 按目标平坦坐标映射。截断/符号扩展/零扩展先体现在赋值语境的根 expr 中，再将其结果映射到左值。输入/输出 port_expr 和 init 采用相同规则。
- 依赖规则把一个目标拆成多个 Write 时，对原始值映射按各 Write.target.bits 求交：若目标段左边裁掉 k 位，则 from/to 同加 k，width 相应缩短。合并或排序 Write 不得按新顺序重建值映射。值分析查询目标子位段时也用这一规则裁剪；不允许从 deps 或 writes 的排列猜 RHS 位号。
- 映射不可安全确定时使用 `status=unresolved, reason=unsupported`，不发布部分 segments 充作完整映射；proc.get 为 partial/unsupported，reason.at 指向 process。有效 Write/Dep 仍保留，按现有规则上传不完整性。值分析必须停止对该 Write 的推导；不能猜常量、把缺字段当 identity，或绕回 Slang/解析 text。对本节要求支持的静态左值拼接/重排，退为 unresolved 不算通过。
- 没有 expr 的过程块不带 exprMap；依赖保守或 expr.op=other 并不自动使已知的左值布局 unresolved。opaque/动态目标无法建立固定值映射时走上述显式退路。`mapped` 仅证明结果到目标的搬运关系，不能把 other 变成可计算表达式。

M7可为大批写目标建立提取内投影索引：左值片段vector仍是唯一事实，按目标引用和重叠位段找全候选，
候选按原下标恢复产生顺序，再沿同一裁剪规则生成片段；原排序、覆盖/重叠校验、合并、unresolved退路和容量策略保持。
索引只借用本次不可变左值并保存下标/子树边界，先于左值释放；小集合保留线性路径，不新增全局缓存或改变映射语义。

C 的两个例子有同一根 `const 2'b01`、相同且为空的 deps，值映射必须不同：

| 赋值 | a 的 exprMap.segments | b 的 exprMap.segments | 目标值 |
|---|---|---|---|
| `assign {a,b} = 2'b01;` | `[{from:1,to:0,width:1}]` | `[{from:0,to:0,width:1}]` | a=0，b=1 |
| `assign {b,a} = 2'b01;` | `[{from:0,to:0,width:1}]` | `[{from:1,to:0,width:1}]` | a=1，b=0 |

例如 a 声明为 `[3:0]`、y 声明为 `[7:0]`，写 `assign y[6:3] = a << 1;`：y[3] 的无依赖 Write 映射 `{from:0,to:3,width:1}`；y[6:4] 的 Write 映射 `{from:1,to:4,width:3}`。这里 from 是移位**结果**的位置，a[2:0] 的精确依赖仍另记在 Dep 中。B 应分别核对值投影与依赖，不能只比较两例的树或依赖集合。

| op | 有效字段和顺序 |
|---|---|
| ref | slice；无 args/uses/value |
| const | value；无 slice/args/uses |
| not、reduce_and/or/xor | args 恰好一个，操作数保持源码顺序 |
| and/or/xor | args 恰好两个，左、右；不重新结合或按名字排序 |
| mux | args 恰好三个：条件、真分支、假分支；不使用另一个 cond/then/else 形状 |
| concat | args 按源码从左到右，即高位到低位；与低位在前的 binding.segments 区分 |
| other | text 非空、uses 为完整可解析的依赖摘要；没有伪造的已支持运算 args |

`text` 对已支持节点可选，不作为字符串逐字比较的验收项。无语义影响的转换可省去；截断、符号扩展、零扩展或其他不在树枚举中的运算以 `other` 保留文本/uses，不能剥去转换后冒充等宽 buffer。`other.uses` 保留 4.4 的依赖角色，是表达式结果的依赖摘要；`align=all`，不宣称树未表达的逐位关系。汇总丢失逐位精度时必须 conservative，只有本来就是精确 all 的依赖才可 exact。逐位精确关系仍由 Write/Dep 提供。树不能表达某个运算本身不使完整性变 partial；确有依赖缺失时才给相应原因。

assign/init/port_expr 有 expr；过程块没有 expr。调用方需要表达式值语义时遇到 other 或过程块必须停止推导；通用 dependency 追踪仍可使用 Write/Dep。树、源码访问集合、输出依赖映射三个概念分别验证，沿用用户已决定的 M2 精确依赖契约。

#### 5.5.4 cone/paths 的图、策略、预算

```ts
interface TraceNode {
  id: string;
  kind: "slice" | "process" | "register" | "blackbox_pin" | "primitive_pin"
      | "top_port" | "const" | "unconnected" | "unresolved";
  point?: TracePoint;              // slice 必填；已知引脚/端口终点也填
  ref?: ObjectRef;                 // process/register/引脚等可定位的对象
  fact?: string;                   // 非 slice 终点的原始事实身份
  value?: string; reason?: ReasonCode;
}
interface TraceEdge {
  id: string; fact: string;
  from: string; to: string;        // TraceNode.id；沿本次查询的探索方向
  via?: ObjectRef;
  kind: "binding" | "dependency" | "blackbox" | "boundary";
  role: "data" | "control" | "clock" | "async";
  precision: "exact" | "conservative";
  align: "bitwise" | "all" | "none";
  fromBits?: BitRange; toBits?: BitRange; // 非 boundary 必填，实际参与关系的位段
  map: BitMap;
}
interface TraceFrontier {
  point: TracePoint;
  depth: number;
  reason: ReasonCode;
  stepCursor?: string;             // 在该 point 尚未消费的 step 页
}
// TraceResult、Budget 的外形见 5.2。
```

图是位段关系图。可穿越的 process/register 通过 edge.via 定位；策略要求停止时，才生成对应终点节点及 boundary 边，不强制再造一个中间门级节点。binding 只表示直接连线，dependency 必须带驱动源或寄存器的 via；两者不能因端点相同而合并。非 boundary 的 fromBits/toBits 属于两端节点的位空间，须为各自 point.bits 的子集；all 只关联这两个实际位段，不能扩大为整个节点总线。blackbox 边是 full 策略的保守关系。boundary 仅表示“在此停止”，role=data、precision=exact、align=none、map=[]，不带 fromBits/toBits，不声称存在数据依赖；终点未知时用 reason 表明。

节点身份由 `(kind, point 的 ref/bits/side, ref, value, reason, fact)` 决定；slice 节点没有终点 fact。边身份由 `(fact, from, to, kind, role, precision, align, fromBits, toBits, map)` 决定。返回的 id 为此身份在快照内的稳定、不透明编码，不得按访问序号编号。同位段不同 side、不同实例、不同真实驱动、不同角色均保持不同身份。预算默认不逐位拆总线；需要求交或事实关系变化时按区间拆分。返回节点和边分别按其身份元组排序，枚举按本节列出顺序、缺失值在前、位段按 lsb/width 比较；frontier 按 `(depth, point 引用/位段/side, reason, stepCursor 对应的位置)` 排序。

三种策略都沿 binding，具体到过程边界：

| 策略 | process | register | blackbox | primitive | unresolved/顶层/常量/悬空 |
|---|---|---|---|---|---|
| structural | 策略终点 | 策略终点 | 策略终点 | 策略终点 | 终点 |
| combinational | 沿全部已知依赖，含 control | 策略终点 | 策略终点 | 需要内部关系时为 partial/unsupported 终点 | 终点 |
| full | 同上 | 沿全部角色，包括 clock/async | 已知方向的保守穿越 | 需要内部关系时为 partial/unsupported 终点 | 终点 |

无 RegisterInfo 的过程依赖仍按 process 处理，不能凭名字猜时序单元。表中的“策略终点”表示该 cone 策略明确不再要求后继，停止本身是 complete 且不产生 frontier；这个 complete 仅表示所请求策略已穷尽，不是任意硬件不可达证明。已有语义缺失仍为 partial，即使策略原本会在这里停止也不能丢原因。full 不把缺少内部依赖模型视为 complete 的策略终点。

**primitive 的语义边界（C-47）。** V1 继续只提供引脚/外部绑定，不新增内部真值或依赖展开。step 的 primitive_pin/complete 表示这一跳找到了明确引脚，不能据此认定内部没有后继。cone 的 combinational/full 及固定 full 的 paths 若到达该引脚且需要向内部继续，添加 `partial`、`{code:"unsupported",at:<引脚引用>}`，保留已知 primitive_pin 终点并令其 reason=unsupported；frontier 指向该引脚的实际 bits/side，reason=unsupported、无 stepCursor。这是未探索的语义边界，不是预算截断，也不伪造内部边。

若 paths 已在该引脚命中目标，对已命中的位段无需继续内部，不额外产生这个原因；其他未完成支路的原因仍保留。路径筛选删掉终点支路也不能删掉已遇到的 frontier/reasons。此规则使“按策略停止”与“未知的内部关系阻止证明”可由返回结果区分。

**full 的 blackbox 穿越**：方向 in 为输入集合，out 为输出集合，inout/ref 同时在两集合。从每个输入到每个输出引脚构造 `all/conservative/data` 关系，覆盖双方全宽；back 用同一关系的逆向。**同一个 inout/ref 引脚在两集合中时也必须保留该关系**，包括不同位之间的可能依赖，不能只保留逐位 identity 或因 ref 相同而删边。它是内部的保守依赖，不是外部绑定；按下述位段状态/visited 规则处理自环与回边。仅列已知方向和宽度的引脚，不读 attrs，不声称逻辑等价或时钟透传。未知引脚使所涉黑盒遍历 partial，已知关系可保留；不存在任何匹配的已知对端时仍保留引脚终点。step 始终停在引脚；cone/paths 用该终点和 bindings/ports 枚举上述固定关系。保守关系本身不会产生 partial，`hasConservative=true`。

例如库只声明一个 2 位 inout 引脚 p、父侧 `.p({y,a})`：full 必须包含 p[0]→p[1] 的保守可能性。因此预算足够且没有其他语义缺口时，a→y 的 paths 返回非空保守路线、complete；反向 cone 也可回到 a，不能返回 complete 的空图。单次查询的状态和关系仍按区间及预算处理，不逐位枚举 p 的笛卡尔积。未知方向/宽度的同名输入仍沿原 partial 规则，不能套用这一已知库关系。

**终止与预算：**

- 默认 `maxNodes=1000`、`maxEdges=4000`、`maxDepth=64`，maxMillis 省略表示不设时间限额。这些是单次查询的默认上限，供 B/C 评审；不是 M7 的整机容量或耗时承诺。maxNodes 必须 ≥1，maxEdges/maxDepth 可为 0，maxMillis 若给出须为正整数；越界/溢出为 bad_request，不静默纠正。
- 起点深度为 0，计入 maxNodes。广度优先按 step 的顺序扩展；消费一个可继续关系使深度加一。一个 terminal 节点也计节点及边预算，边界的可视化不算额外依赖深度；位段拆分后的每个唯一节点和每个不同真实边分别计数。
- visited 键包含 `(slice.ref, bits, side, direction, policy)`；同一状态最多扩展一次，回边照常保留。组合环、时序反馈不能无限追加事实。重复状态不增加节点预算；不同角色的边仍各计一次。处理的状态按最短深度扩展，不因先经过长路径而漏掉短路径下可扩展的后继。
- depth==maxDepth 的可扩展点保留在 frontier，原因 budget_depth，不先无界探测其全部后继。其实际是否为叶子尚未验证时也必须 partial。因此 maxDepth=0 仅返回起点与 frontier，不假称完整。
- 加入一条关系前计算它所需的新节点和边；任一上限不足就不加入这条关系，停止扩展并返回 frontier，分别使用 budget_nodes/budget_edges。其余队列中未探索的点也进入 frontier。到达上限但队列恰好已完成时为 complete；不只按 `size==limit` 推断截断。
- 时间使用单调时钟，计入本次查询需要的索引/事实提取；在上述检查点发现超限后以 partial/budget_time 返回。取消优先于预算部分结果。时间检查、取消不能等到整扇出数组构造后才执行。
- frontier 指向仍有未消费工作的起点，必须保留端口 side；正在分页时 stepCursor 指向第一条尚未消费的事实。如果一页只消费了部分，游标也必须定位到该部分，不能跳过整页。语义 unresolved 也进入 frontier，带原始原因且无游标，表示当前快照无法继续。按策略结束和已完成的环回状态不进 frontier。
- 内部 step 的分页预算由 trace 循环消费；消费完全部页后不残留那次 budget_nodes。真实的查询预算及语义原因按 `(code, at)` 汇总。`hasConservative` 为返回边的精度摘要，不把 partial 当作 conservative。

`paths(from,to,budget)` 固定沿 **forward/full**，返回 from 到 to 的可达依赖关系子图，不枚举指数个路径列表。目标命中要求同 ref、同 side 且位段相交，命中位段裁到交集，不再从命中部分继续；未命中部分可继续。目标判断先于深度截断，所以 from 与 to 已相交的交集有零边路径，即使 maxDepth=0 也成立。必须组合沿途位关系判断可达性，不能只因两个边经过同一个总线节点就认定不同位连通；all/conservative 的路径仍标保守。环只出现一次，不要求展开任意圈数。

端口可作 paths 的两端。若 step 的绑定跳直接跨过了请求中的端口，paths 必须按 bindings/ports 中该 side 的映射插入端口锚点和 binding 边，不能因 next 没有显式停在端口就漏报路线。inside 锚定本体对应关系，outside 锚定父体对应关系；它们不因引用相同而相互命中。表达式连接通过相应 port_expr 的依赖来连接锚点，不能当直接 wire；未解析对应关系上传 partial。插入的节点、边及读取事实照常计预算，计数在路径筛选之前。

返回图只保留已找到路线的关系并集（零边路径保留命中节点），以及表达这些路线所需的节点；探索到但未取得通向目标路线的支路不混入路线。搜索未完成时仍保留完整的 frontier/reasons，即使 frontier 所指点不在返回路线图中。

**paths 的否定保证：** 仅当 forward/full 的全部所需关系已探索、遇到的关系均已精确表示或安全过近似，且没有预算/语义缺口时，才能返回 complete。此时 nodes/edges 均为空可证明当前编译快照的静态依赖图中 from 到 to 不可达。primitive 内部、未知方向/宽度、interface、hier_ref 等未探索语义边界必须使结果 partial；不能因路线筛选后图为空而恢复 complete。partial 空图只表示尚未得到路线，不证明不存在。非空保守路线也不能宣称每条关系都是真实可行路径。

| 输入事实与查询 | 预算足够时 paths 的要求 |
|---|---|
| 仅有 `buf u_buf(y,a)` 连接的内部信号 a→y | 硬件有路径，但 V1 无内部模型；nodes/edges 为空，必须 partial/unsupported，at/frontier 为实际到达的 primitive 输入引脚 |
| a 与 y 无关联，探索 a 的可达支路不遇语义缺口 | 空路线图、complete、frontier/reasons 为空 |
| a 的支路进入方向 unknown 的 blackbox 引脚，尚未得到到 y 的路线 | nodes/edges 为空、partial/blackbox，保留对应 frontier/reason |

maxNodes/maxEdges 约束**探索工作图**，不能先无限搜索再按最后的路线图大小计数。各位段关系的组合和暂存也必须采用区间形式及相同工作预算，不能枚举逐位路径后再压缩。

#### 5.5.5 搜索、定义实例与路径

```ts
type HitKind = "definition" | "instance" | "port" | "signal" | "process" | "register";
interface SearchQuery { text: string; kinds?: HitKind[]; scope?: ObjectRef; }
interface ObjectHit {
  kind: HitKind; ref: ObjectRef | DefRef;
  name: string; path: string[]; pathText: string;
  inst?: ObjectRef; def?: DefRef;
}
```

- search 是区分大小写的字面子串匹配，不解释通配符/正则；对 name、pathText 匹配，instance 还对其 defName 匹配。text 不 trim，空文本匹配所有项。kinds 省略表示全部六类，空数组表示无结果；重复 kind 规范化后去重。scope 必须是实例引用，包含其自身与全部后代，不按路径文本前缀误包含同名前缀兄弟。
- definition 命中每个 DefRef 一次，path=[name]，pathText 是该名字的转义形式，def=ref，无 inst；有 scope 时只返回该子树实际使用的定义。instance 命中 inst=ref、def 为其定义；其余命中 inst 为所属实例、def 为所属定义。端口与同名内部信号是不同引用，各自返回；generate scope 本身没有 ObjectRef，不伪造命中。
- instance/port/signal 的 path 是设计层级路径。process/register 的无源码名字不伪装成 HDL 标识符：name 采用 `@process:<本体序号>` / `@register:<本体序号>`，path 在所属实例路径后增加该展示段；pathText 仅显示，定位使用 ref。这两类展示路径不要求 resolvePath 接受。所有有真实 HDL 路径的命中必须可 round-trip，至少包含原 ref。
- 顺序为 HitKind 表中次序，再按引用顺序；同一 ref 不因命中多个字段重复返回。翻完全部页恰好等于完整集合；游标绑定规范化 kinds 集合、原 text、scope。分页改变 limit 不改变顺序。
- `instancesOf(def)` 返回 InstInfo，按实例引用顺序分页，包括 blackbox/primitive 和顶层；不按共享 body 合并 occurrence。合法但未实例化的定义返回空且 complete。

**resolvePath 的唯一语法：**

1. 非转义标识符为 `[A-Za-z_][A-Za-z0-9_$]*`；紧随的一个或多个 `[有符号十进制整数]` 为实例/generate 数组下标。下标按数值比较，允许负数，不接受范围、通配符和信号位选；信号的 bits 由 Slice 单独指定。
2. 段间接受 `.` 或 `/`，允许混用和周围空白。转义段从 `\` 起到至少一个空白终止，内部的点、斜线、方括号均为名字字符；终止后可接数组下标。末尾的转义段也必须有终止空白。JSON 中反斜杠按 JSON 规则转义；CLI 按 shell 规则引用。
3. 可选一个前导 `/` 表示绝对路径，必须带顶层名；无前导 `/` 时，首段若是顶层名则只作带顶层路径，否则在每个 top 下按省略顶层解析。多 top 同名尾路径返回全部候选，不默选第一个，也不做任意后缀搜索。
4. 返回可寻址的实例、端口和信号引用，按引用顺序排序去重。同名 port/internal signal 可以同时返回；generate scope 只参与导航，不能单独命中；不解析 DefRef、过程展示名、SDC `get_*` 表达式或任意 Tcl 语法。
5. 空文本、空路径段、未终止转义、非法下标、尾部分隔符为 bad_request；语法有效但没有对象为 `result:[], complete`。中间节点不是可导航作用域时同样无匹配。未被 UI 加载不影响解析。

例：`top.g[2].\a.b .u[3]` 与 `top/g[2]/\a.b /u[3]` 等价；`top.a.b` 不是含点名字 `a.b`。转义名字 `\u[3] ` 和实例数组 `u[3]` 不能因显示文本相同而混为一物。

#### 5.5.6 源码位置与反向命中

```ts
type FileRef = string;
interface SourcePos { offset: number; line: number; column: number; }
interface SourceSpan {
  file: FileRef; path: string;
  start: SourcePos; end: SourcePos;
  contentHash: string;
}
interface SourceHit {
  ref: ObjectRef | DefRef; kind: "definition" | "instantiation" | "statement";
  span: SourceSpan; inst?: ObjectRef;
}
interface SourceRead { text: string; contentHash: string; matchesSnapshot: boolean; }
interface InputCheck { changed: FileRef[]; complete: boolean; }
```

- FileRef 是编译时实际读入文件表内的稳定编号，按规范化绝对路径排序生成，客户端不解析；表含 include 文件。重复读同一物理文件只占一项；宏展开缓冲不伪装成磁盘文件。不同路径指向同一文件时在打开时规范化；显示 path 为该规范化路径。打开后的路径变化不改变快照表。
- offset 为文件起始的 0 基字节偏移；line/column 为 1 基，column 按 UTF-8 字节而非 UTF-16 单元或显示宽度计，tab 算一个字节，CRLF 算一个换行。span 为 `[start,end)`；end 是最后一个源码 token 后的位置，不含尾随空白/注释。contentHash 为编译时原始字节的 SHA-256 小写十六进制，不受查询时磁盘修改影响。
- definition：DefRef 或 instance 指向完整定义声明；port/signal 指向对应声明项；同一语句中的多个声明项使用各自 declarator 的范围。statement：process 指向整个赋值/过程语句，register 使用对应 process 的范围。instantiation：instance 指向该 instance declarator，port 指向该实例上的命名或位置连接项；数组实例可共享同一范围。顶层无例化位置、blackbox 无定义位置、合成且无独立源码的对象无位置。
- 对象种类不适用某个 SourceKind，或对象确实没有源码，`source` 返回 not_found；不是返回空文件、0 行号或 internal。port_expr 的 statement 使用生成它的连接项范围，init 使用初始化 declarator。源范围取快照，不通过重新解析当前磁盘文件计算。
- 宏产生的对象定位到最外层宏调用范围；不把展开后的虚拟偏移当真实文件偏移。include 中的普通声明定位到 include 文件。反向查询使用同一物理范围规则，因此同一宏调用可返回多个命中；本版不另做宏定义/展开栈浏览器。
- resolveSource 只接受表内 FileRef。line/col 为 0 或超出快照文件范围为 bad_request；列号可指一行末尾的插入位置，但不因此命中已结束的 span。省略 col 时返回与该行字节范围相交的所有 span；有 col 时返回包含该字节位置的所有 span。有效空白位置可返回空且 complete。
- 候选包含所有有该 SourceKind 范围的 DefRef/ObjectRef，**全部页的并集**返回所有 occurrence，不只返回共享体的规范实例。嵌套/重叠范围不择一；例如点在模块声明内部，可同时命中定义、其各实例的 definition 和具体语句。仅相同 `(ref, kind, span)` 去重；全局顺序为 `(span.start.offset, span.end.offset, kind 的 definition/instantiation/statement 次序, 引用顺序)`，定义引用在对象引用前，其余沿 5.5.1。分页不改变此顺序，索引和枚举均支持 Cancel。
- **有界分页（C-48）：** resolveSource 返回 `QueryResult<Page<SourceHit>>`，使用 PageRequest，默认 limit=200，须为正整数。每页最多 limit 个 items；有剩余命中就返回非空且前进的 next，末页省略 next。索引完整时正常分页的 completeness 为 complete，next 表示仍有后续页，不因分页本身添加 budget_nodes；调用方必须取完 next 才取得全部命中。无匹配时为 items=[]、无 next、complete，不能静默截断。
- 游标绑定 `(source.resolve, FileRef, line, col 是否给出及其值)`、快照和索引代次，limit 不绑定。换 file/line/col 使用旧游标为 bad_request；跨快照/失效代次为 stale_cursor；非法游标为 bad_request。省略 col 与显式给列号是不同查询。冷热缓存、共享/逐实例模式、改变页大小均不改变全部页拼接的有序结果；磁盘文件变化不使快照内的位置索引或游标失效。
- **不能先构造全 occurrence 命中列表再切页。** 范围索引保存定义/模块体内的共享源码范围，与已有的 occurrence 导航/反向索引组合；在确定顺序中定位游标，按需限定并物化本页命中。判断有无 next 至多再探测一个命中，不复制它后面的 occurrence；游标只保存位置和查询绑定，不携带其余命中列表。构造与序列化的 SourceHit 数量受 limit 约束，临时结果内存与本页条数及实际匹配的共享范围数相关，不随全部命中 occurrence 数强制物化。首次范围索引建立成本单列并支持取消，不承诺首次调用零索引成本；不能把全命中数组换名为缓存来绕过此约束。
- 对 `synthetic/gen.py --fanout 10 --depth 5 --unique 0` 的 leaf 定义内部位置，即使有至少 100001 个定义/实例命中，limit=1 也只返回一项及 next。取完全部页仍必须返回这些 occurrence 和该位置其他适用的重叠命中，无漏重。取消某页返回 cancelled、不发布半页结果；用原游标重试仍从该页起点开始，已完成的其他页及缓存不受损。
- readSource 沿 5.2 只读表内文件，文本与 SHA-256 来自同一次打开读入的字节。输入为 UTF-8 时 text 无换行改写；不能无损解码为 UTF-8 时返回 unsupported。不可读/已删除文件返回 not_found。表外路径字符串返回 not_found，不能作为任意文件读取通道。
- checkInputs 按表顺序检查所有文件，内容哈希不同、删除或不可读均放 changed；若有文件因 I/O 错误无法完成内容比较则 complete=false。所有比较完成且内容相同为 changed=[]/complete=true；取消返回 cancelled。不重建快照，source/resolveSource 仍按旧范围工作。

#### 5.5.7 CLI 与独立冻结清单

沿用 5.3 的打开选项、输出包装和错误退出约定，增加以下命令。C++ 中的动态取消和同快照多次查询用公开 API 验收，不能用每次重开快照的 CLI 冒充。

| CLI | 返回 |
|---|---|
| `def-instances <def> [--limit N] [--cursor C]` | QueryResult<Page<InstInfo>> |
| `search <text> [--kind K …] [--scope inst] [--limit N] [--cursor C]` | QueryResult<Page<ObjectHit>>；多个 --kind 取集合 |
| `resolve-path <text>` | QueryResult<ObjectRef[]> |
| `cone <ref> [--lsb N --width W] [--side S] --dir back\|forward --policy structural\|combinational\|full [预算]` | QueryResult<TraceResult> |
| `paths <from> <to> [--from-lsb N --from-width W] [--from-side S] [--to-lsb N --to-width W] [--to-side S] [预算]` | QueryResult<TraceResult> |
| `source <ref> --kind definition\|instantiation\|statement` | SourceSpan |
| `resolve-source <fileRef> --line N [--col N] [--limit N] [--cursor C]` | QueryResult<Page<SourceHit>> |
| `read-source <fileRef>`、`check-inputs` | SourceRead、InputCheck |

`[预算]` 为 `--max-nodes N --max-edges N --max-depth N --max-millis N` 中任意组合；省略值用 5.5.4 默认值。paths 的每端位段分别遵守成对提供规则；所有端口 side 均显式。新的分页游标用同一 Design 对象有效；独立 CLI 进程重开的快照不能假定共用游标，跨页语义须由 API 测试覆盖。

以下是 A 提交给 B 的验收需求，**不是 B 已冻结的测试或执行结果**：

| 组 | 手写预期的最小覆盖 |
|---|---|
| A12 环与预算 | 两 assign 组合环、寄存器反馈；有回边且有限；maxDepth=0、刚好完成的 maxNodes、差一个节点/边、高扇出跨多个子体提前分页；frontier side/游标不漏工作；串完全部 step 页等于完整集合 |
| A13 映射与表达式 | y=a&b、mux 的 control/data、concat 高低位、常量/扩展/截断、移位丢弃位、加法 conservative；C-46 两种常量左值顺序、嵌套左值、同总线分段/非零 lsb、Write 拆分后的 exprMap 与目标值；缺值映射显式 unresolved；过程块无 expr/exprMap；多驱动/不同角色保留；forward/back 的依赖映射相互对应 |
| 路径正确性 | a[0]→b[0] 不等于 a[0]→b[1]；all 依赖；有向环与真正不连通；起终相交零边路径；C-47 buf 已知硬件路径在 V1 必须 partial/unsupported，区别于真实不连通的 complete 空图与 unknown 黑盒的 partial/blackbox；按探索工作而非输出路径计预算 |
| 边界 | known/unknown 黑盒方向与宽度优先级；full 保守穿越、attrs 不改策略；primitive 的 step/structural 终点与 combinational/full 语义 frontier 区分；hier_ref 实际目标、interface/complex_port/unsupported 原因上传 |
| A16 查找 | 六类命中、多 scope 同名、多 top、escaped 点/斜线/方括号、generate/实例数组、声明同名端口信号；filter/scope、错游标、页大小变化、def.instances 无漏重 |
| 源码 | 多 occurrence 同位置、定义/声明/例化/语句、宏调用/include、UTF-8/CRLF、精确列与整行、表外文件、修改/删除后的旧 span 与 read/hash/checkInputs；C-48 10 万 leaf 有界首屏、全部页无漏重、页大小变化/错误游标、冷/热/共享等价、页内取消后原游标重试 |
| 顺序/共享/取消 | 同一快照固定种子打乱查询、冷/热缓存、共享/逐实例结果等价；预取消与执行中取消后正常查询；取消不发布半成品；核心测试可控检查点适配先交 C 审，不用 sleep 竞速做 oracle |

B 应记录 fixture SHA、DESIGN 冻结 SHA、手写预期来源、未实现基线的真实失败方式，分别报告 CLI/API、语义/资源检查；不得把缺方法导致的退出当成每条语义断言均已验证。完成此冻结及 C 的契约评审后，A 再按“step/expr → cone/paths → search/path/source”的顺序提交 M3 实现。M2 全量回归继续作为门禁；B-11/B-12 的协议/schema、B-13 的视图契约和 M7 资源总预算保持各自阶段归属。

---

### 5.6 M4 协议与客户端补充草案（2026-10-12，待 C 审查 / B 冻结）

本节回应 REVIEW_LOG 的 B-11、B-12 和 B-13 客户端部分，补齐 §5.2/§6.1 的示意接口。
**当前是评审对象，尚未实现，也未由 A 自行关闭上述意见。** 通过审查后，本节的完整规则
用于 M4，早期简写与本节冲突时以本节为准。M3 的语义、冻结测试与历史 DESIGN SHA 不追溯改变；
其最终实现/独立证据见 [M3 收尾索引](M3_CLOSEOUT.md)，总状态由协调者登记。
实施步骤见 [M4 ExecPlan](plans/M4.md)。

#### 5.6.1 会话、版本与响应关联（B-11）

- `hier serve <设计>` 复用单次 CLI 的设计输入选项，打开成功后第一帧为 §5.2 的 hello。
  `protocol` 为 **2**，首个 M4 客户端拟支持的 `snapshot.schemaVersion` 为 **7**。
  hello 的完整 SnapshotInfo 使用下述 schema7 增量模型；capabilities 至少含 `cancel`、`progress`。
  打开失败时尚无快照，stderr 输出可诊断错误并非零退出，不伪造 hello 或一个无关联请求回复。
- 一个服务进程、Transport、HierClient 各自固定到一个快照/连接；重新加载创建新进程、
  新 Transport 和新 HierClient。禁止在已有 Transport 后面替换进程或将旧进程消息接到新连接。
- **响应保持 §5.2 的无 snapshot 字段形式。** 客户端把每个发出的 id 与当前连接代次及
  hello.snapshot.snapshotId 一起保存，响应只能结算同一存活连接的 pending id。
  这是 §6.1 “快照守卫”的具体关联依据，不要求服务端增加一个草图未有的字段。
  dispose/关闭时先废弃连接代次，再退订；已经排进事件循环的旧回调也必须检查代次。
  未知、已完成、已本地取消的 id 的合法迟到响应直接丢弃，不入缓存、不分配给其他请求。
- hello 只能出现一次。重复 hello（即使同快照）、hello 前的响应或结构错误的已知消息
  是协议故障，关闭连接并使全部 pending 失败，不能悄悄更换 snapshot。未知事件名按扩展规则忽略。
- protocol/schema 不支持时，客户端 ready 失败并关闭传输；不发送查询、不尝试按旧类型解码。
  协议帧/生命周期破坏性变化递增 protocol；模型字段形状/含义按现有约定递增 schemaVersion。
  同版本可选扩展字段可忽略；新版本必须明确支持才能使用，不能仅比较“版本不低于7”。

**快照模型增量及 schema6 → 7（机器契约核对后修正）。** 当前已验收的 SnapshotInfo 只有
schemaVersion/frontend/tops/definitionCount/bodyCount；私有 DB 已有跨打开唯一的 snapshotId，
公开模型和 JsonWriter 尚未提供 §4.8 的快照字段。不得在 L4 临时生成另一个快照身份或伪造完整输入哈希。
M4 在 Core 的 SnapshotInfo 新增 snapshotId、inputHash、inputHashComplete、indexState、openedAt、topCandidates：

- snapshotId 直接复用 DB 的打开身份，与 Core 游标属于同一快照；两次打开即使输入相同也不同。
  indexState 表示公开全设计索引的状态，现有同步实现可直接 ready；不伪造 building 过程。
- inputHash 是打开时捕获的实际文件、有效选项、前端及库输入描述的 SHA-256 小写十六进制。
  相同捕获输入确定相同值；目录/宏/库路径等有序选项保留顺序，实际文件按规范路径排序。
  L1 捕获实际读入的文件/展开后的 filelist 参数与有效编译选项，L2/L3 计算并持有摘要；
  不重新读取当前磁盘生成“打开时”哈希，也不在 L4/TS重复解析 filelist。
  snapshotId、openedAt、缓存容量/共享模式等非编译语义不参与 inputHash。
- inputHashComplete 只在该描述覆盖全部影响编译的输入时为true。非空 LibraryProvider 若无法取得
  可验证的完整库身份，则为false，并保留已捕获库信息参与摘要；不靠地址或类名冒充库内容。
  首次M4不为此增加 LibraryProvider 虚函数。无法完整捕获 filelist/选项也必须false，沿用§4.8的限制。
  该标志与checkInputs.complete（本次表内文件是否全部成功比较）是不同含义，不改M3文件比较行为。
- openedAt 为本次打开成功时的 UTC 时间，格式 `YYYY-MM-DDTHH:mm:ss.sssZ`；后续查询不更新它。
- **保留现有 tops: InstInfo[] 的形状和 ref 字段。** 新增 topCandidates: ObjectRef[]，按 tops 顺序
  列出由前端自动推断而非调用方显式指定的顶层；显式选择全部top时为空。该数组是候选标记的唯一wire表示，
  不再添加 §4.8 早期草图的 tops[].inst/isCandidate 别名，不改变 roots/instance 的 InstInfo 形状。

这是新的公开模型字段与静态库布局增量，正式实现时将 kSchemaVersion 从6升到7并重建所有C++消费者；
旧字段/CLI命令/引用与查询语义保留，旧schema6样例在新客户端握手时明确拒绝，不能冒称二进制ABI兼容。
此前28a9d86草案中“保持schema6”的假设由本增量纠正；M3历史验收仍固定schema6，当前生产版本未改。

#### 5.6.2 帧、请求关联与非法输入（B-12）

一行一个 UTF-8 JSON 对象，LF 分隔，接受 CRLF；stdout 只写协议帧，日志写 stderr。
不能用一次 read 返回一次消息的假设；拆包、粘包、UTF-8 多字节拆分均须正确处理。
输入空行、重复 JSON 键、注释、尾随内容、非对象帧、无换行的 EOF 残片均是非法输入。
wire所有字符串（含对象键、未知字段中的字符串）必须是Unicode标量值序列：合法UTF-8、
正确高低代理转义对及转义NUL接受；孤立高/低代理、反序/不完整代理对或编码错误拒绝，
不以替换字符静默修复，不增加Unicode规范化或大小写折叠（2026-10-13，C已认可边界澄清）。
该规则同样适用于JS出站参数，未知字段被忽略前也必须满足。失败沿现有非法JSON值路径：
客户端参数快照以bad_request/origin=client拒绝且不发请求；Node原始入站以transport_closed/
origin=transport、data.reason=invalid_frame关闭；自定义Transport交付非法JS字符串时，
HierClient以protocol_error结束连接。Core坏编码/转义仍按下表不可关联错误处理。
请求行上限 1 MiB（不含分隔符）、容器嵌套深度上限128；超限按下述不可关联错误处理。
深度按同时打开的对象/数组容器计数，根对象为1，进入一个对象或数组加1；
字符串内的括号不计数，未知字段的值也受此限制。128合法，129非法；不是按字段路径段数计数。
这些是新传输的局部限制，不是 M7 全进程内存或耗时预算。

请求为 `{id, method, snapshot, params}`，四字段必填，params 必须是对象（无参数方法用 `{}`）。
id 为 `[1, 9007199254740991]` 内的整数；普通请求按到达顺序**严格递增**，允许跳号。
合法新 id 即被消费，随后参数/快照错误也不能复用。取消的 target 不消耗 id，不参与递增比较。
客户端在单连接内从1递增，耗尽时拒绝新请求并要求新连接，不回绕。用最高已消费 id 检测复用，
不用保存整段已完成历史造成会话内存无界增长。

| 输入 | 行为 |
|---|---|
| 合法新 id，缺/错 method、snapshot、params，或方法参数结构错误 | 该 id 一次 `bad_request`，随后合法新请求可恢复 |
| 结构合法但 snapshot 不匹配 | 该 id 一次 `stale_snapshot`，不访问 Design；error.data 含 expected/received |
| 结构合法、快照正确但方法未知 | 该 id 一次 `unknown_method`，不访问 Design |
| 参数结构合法但引用/位段/游标不合法或不存在 | 交 Core 返回既有 bad_request/not_found/stale_cursor，不在 L4 解析对象身份或复制域规则 |
| 无可安全关联的 id、坏 JSON/编码、超限、id 重复/倒退 | 输出仍可写时发一帧 `event:"protocol_error"`、error.code=`bad_request`、非空 message，随后关闭并非零退出；不以复用 id 再回复一次 |
| 合法 cancel 的 target 未知、已结束 | 忽略，不产生任何回复 |
| cancel 含 id 或 target 非法/缺失 | 不可关联错误；protocol_error 后关闭，不取消其他请求 |

校验顺序为帧/新 id → envelope 类型 → snapshot → method → 方法参数结构 → Core 语义。
因此快照错误优先于未知方法或合法参数中的无效引用。错误消息说明字段/原因，不回显整段大输入。
protocol_error 是连接故障通知，不是某个请求的第二个响应；其后未结算请求按传输关闭失败，
适用 §5.2 的 EOF 例外，不承诺已断连接仍逐个收到终态帧。

未知对象字段在结构验证后忽略，客户端不回显；所有**已知**字段的类型/枚举必须验证，
不能把错类型当缺省。未标 nullable 的可选字段遇 null 为 bad_request，缺失才用既定默认值；
空数组、空字符串不是通用的“缺省”，按各字段含义处理。未知方法/未知枚举不是未知字段扩展。
已知帧的顶层关联/判别字段不能混用：request 不含 event/ok/result/error/completeness，
cancel 不含 id/snapshot/event/ok/result/error/completeness；响应不含 method/event，
已知事件不含 id/method/ok/result/completeness（error 仅 protocol_error 可用）。
这些保留字段不是可忽略扩展；hello 合法后收到未知 event 名则忽略整帧及其扩展负载，
不把其中的 id/error 等字段当已知响应解码。任何事件都不能绕过第一帧必须 hello 的顺序要求。
成功响应必须有 result/completeness，不能有 error；失败响应必须有 error，不能有 result/completeness。
WireError 的 code/message/data 必填，data 为对象、无附加信息时 `{}`；Core Error 的已有 code/message
原样传递，L4 独有 unknown_method/stale_snapshot 留在边界，不把协议状态塞入领域模型。

wire 的整数必须能被 JS 安全表示且满足字段自己的范围；按数值判断整数（1与1.0同值），
禁止截断非整数、字符串转数值、bool 当整数。
C++ 结果若确有超出安全整数范围的字段，服务返回 unsupported，data.reason=`unsafe_integer`，
不静默舍入、不临时把 number 改成 string；原 C++ API/单次 CLI 的整数能力不因此缩减。

#### 5.6.3 方法、默认值与完整性

§5.2 的每个方法都在本阶段实现，结构依据 §4、§5.4、§5.5 和本节；引用仍是不透明字符串。
以下补齐早期简写，不以当前输出自动推导规范：

- `design.diagnostics` 返回 `Diagnostics {errorCount, warningCount, items, truncated}`，不是裸数组。
  参数 `maxItems?` 为非负安全整数，默认200；0只取计数，truncated 表示 items 被截断。
  它是诊断展示截断，不等同于连接语义的 partial。
- `inst.signals.filter?` 明确为 `{text?: string}`：按该实例信号的 `name` 做区分大小写的字面子串匹配，
  缺 filter/缺 text/空 text 均不筛选；结果保留原信号声明顺序、名称和引用，不把模式当正则或路径。
  筛选由 Core 执行，游标绑定有效 text；空筛选沿用旧 signals 行为，变页大小仍合法。
  这是对原先未定义 SignalFilter 的补充，需 B 独立冻结，不由 UI/IPC 对已截断一页再过滤。
- 页大小 limit 默认200、范围1..2147483647；maxHops 默认1000、同样范围。
  cursor 缺失或空字符串表示首页；result.next 在末页省略，不能发送 null。
- `conn.drivers/loads.slice` 为 `{ref, bits?}`，bits 缺失表示整个对象；reach 必填为 local/hier；
  `conn.step.from` 同为 `{ref,bits?}`，direction 必填 back/forward，side 仍是顶层可选参数。
  端口 side 必填且非端口不能带 side；值域判断交 Core。step 固定局部逐跳，不接受 reach 参数作为另一种模式。
- trace.cone 的 start 及 trace.paths 的 from/to 使用 §5.5 的 TracePoint（slice.bits 必填、side 在点内）；
  cone 的 direction/policy 必填，paths 不新增 policy。budget 可省略，空对象按 Core 默认
  maxNodes=1000/maxEdges=4000/maxDepth=64/maxMillis缺失；maxNodes≥1、maxEdges/maxDepth≥0，
  maxMillis若给出须为正整数，沿用 §5.5.4，不放宽为任意字段都可为0。
- seq.registers 的 recursive 默认false；search/源码 kind/line/col/查询绑定保持 §5.5；obj.source.kind 必填。
  source.read 仅 FileRef、design.checkInputs 无参数；不引入路径读接口或自动重新加载。
- 非 QueryResult 的方法按 §5.1 包装 complete；QueryResult 的完整性原样上传。
  bindings 的 complete 表示绑定事实枚举，内部 unresolved 仍保留，穿越它的连接查询按原契约partial；
  source.read 的 matchesSnapshot=false、checkInputs.complete=false 不擅自转换成连接 partial。
  已有 partial/reasons 不丢失、不因结果数组为空而变成 complete。
- Endpoint.via 保留已验收的 M2 边界路线：`BoundaryRoute {kind:"boundary", from:Slice,
  via:ObjectRef, map:BitMap, next:{slice:Slice,role:UseRole,precision:Precision}[]}`。
  它不含 M3 step 的 fact 或完整 Continuation；机器Schema分别命名 BoundaryRoute 与 Hop，
  不把当前 route 补空 fact 冒充一条 step 事实，不因此改旧 endpoint 返回。

所有方法的参数、响应与 TS 方法映射须有机器登记；协议不能少实现一个方法却在 TS 返回空成功。
保留 §6.1 的 `children(inst, page?, signal?)`。以下表格列出其余参数，
**每个函数最后再有可选 `signal?: AbortSignal`**，全部返回对应 wire 结果的 `Promise<Reply<T>>`。
page 是 `{cursor?,limit?}`；request 对象使用对应方法的完整 params 类型，query 不包含 page 字段。
参数类型、枚举及返回值均从 Schema 方法登记生成，不另造一套查询参数语义。

| TS 函数 | wire 方法 | signal 前的参数 |
|---|---|---|
| info | design.info | 无 |
| diagnostics | design.diagnostics | `options?: {maxItems?: number}` |
| checkInputs | design.checkInputs | 无 |
| roots | inst.roots | 无 |
| children | inst.children | `inst: ObjectRef, page?: PageReq` |
| ancestors / instance | inst.ancestors / inst.get | `inst: ObjectRef` |
| ports / params | inst.ports / inst.params | `inst: ObjectRef` |
| signals | inst.signals | `inst: ObjectRef, options?: PageReq & {filter?: {text?: string}}` |
| definitions | def.list | `page?: PageReq` |
| instancesOf | def.instances | `def: DefRef, page?: PageReq` |
| search | search | `query: {text: string, kinds?: HitKind[], scope?: ObjectRef}, page?: PageReq` |
| resolvePath | path.resolve | `text: string` |
| bindings | conn.bindings | `inst: ObjectRef` |
| drivers / loads | conn.drivers / conn.loads | `request: 对应方法的params` |
| step | conn.step | `request: 对应方法的params` |
| cone / paths | trace.cone / trace.paths | `request: 对应方法的params` |
| registers | seq.registers | `inst: ObjectRef, options?: PageReq & {recursive?: boolean}` |
| procs | proc.list | `inst: ObjectRef, page?: PageReq` |
| proc / object | proc.get / obj.get | `ref: ObjectRef` |
| source | obj.source | `ref: ObjectRef | DefRef, kind: SourceKind` |
| resolveSource | source.resolve | `query: {file: FileRef, line: number, col?: number}, page?: PageReq` |
| readSource | source.read | `file: FileRef` |

#### 5.6.4 服务的所有权、取消与退出

沿用 §3.4/§5.2 的两个线程：I/O 线程收发帧，唯一工作线程打开/持有/查询/销毁 Design。
工作线程以 RAII 持有 Design 和每任务 stop_source；队列不持有 frontend/AST 裸资源。
hello 在打开成功后由 I/O 线程发送，任何其他帧不得抢在它之前。

- 无取消、无错误的已接受请求按 FIFO 完成；校验错误和排队取消允许先于正在运行的请求回复。
  客户端始终按 id 关联，不依赖回复顺序。
- 排队 → 执行中 → 已结束的规则及运行中取消胜负沿用 §5.2：转换和终态帧入队在同一锁下完成一次。
  stop 已被检查点观察到才产生 cancelled；终态已确定后收到取消不改成功为取消。
  锁内不执行业务、阻塞读写或外部回调。
- 未结算业务任务上限256（含运行中）；合法新请求在达到上限时得到一次 bad_request，
  data.reason=`queue_full`。cancel 不占该容量；一个任务进入终态即释放准入槽。
  I/O 输出必须处理部分写与背压，不能无限接受输入堆积响应；停止接收期间的取消不作最长延迟保证。
- 现有支持 Cancel 的 Core 调用直接传 stop_token。旧同步入口有长循环时，Core 增加兼容的可取消重载，
  保留已验收语义和旧入口；协议层不能靠提前回 cancelled、后台继续访问同一 Design 伪装取消。
  每任务调用前/后都有检查点；不可中断的 Slang/系统调用边界继续明确列出。
- 正常 stdin EOF 请求正在执行任务停止、丢弃队列，在工作线程下一个检查点退出并回收所有权，
  退出0；未完成请求不再要求回复。stdout 关闭/写失败或坏帧是传输故障，非零退出并走同样回收路径。
  不遗留 detached 线程，不让 Design 先于使用它的工作线程析构。
- progress 帧含 target、done、total，数字非负安全整数且 done≤total；本版每项任务以一次工作为单位，
  实际开始发送0/1，实际结束发送1/1（包括 Core 错误），随后终态；排队取消没有伪造的开始/完成进度。
  它不声称节点级进度或预计剩余时间。客户端忽略已本地结束任务的迟到 progress。
- index.ready 仅在实际公开索引状态从 building 变为 ready 时发出，不为已有同步 ready 快照伪造过渡。
  保留 §5.5.1：没有强制第一次查询必须返回 partial/indexing 的要求。

#### 5.6.5 Transport、状态与错误（B-11）

```ts
type Unsubscribe = () => void;
interface Transport {
  send(message: object): void;
  onMessage(handler: (message: unknown) => void): Unsubscribe;
  onClose(handler: (cause?: Error) => void): Unsubscribe;
  close(): void;
}
type WireErrorCode = "bad_request" | "unknown_method" | "stale_snapshot" | "stale_cursor"
  | "not_found" | "cancelled" | "unsupported" | "internal";
type ClientErrorCode = "not_ready" | "disposed" | "transport_closed" | "protocol_error"
  | "protocol_mismatch" | "schema_mismatch";
class HierError extends Error {
  readonly code: WireErrorCode | ClientErrorCode;
  readonly origin: "core" | "client" | "transport";
  readonly data: Readonly<Record<string, unknown>>;
}
// 2026-10-16 Source所需兼容增量：C-ORCH-6审查/B-ORCH-6独立回归通过。
function isHierError(value: unknown): value is HierError;
interface ClientOptions { cacheEntries?: number; cacheBytes?: number; }
// HierClient 除各类型化查询外提供：
// constructor(transport: Transport, options?: ClientOptions)
// readonly ready: Promise<SnapshotInfo>; readonly snapshot: SnapshotInfo;
// onIndexReady(handler: () => void): Unsubscribe;
// dispose(): void;
```

**错误身份兼容增量（2026-10-16，C已审查/B已独立通过）：** `isHierError` 从client主入口导出，
只识别本模块实际构造的HierError及真实子类，通过私有弱登记读取身份，不执行value的字段/原型探测。
它不读取任意cause，不改变原constructor/instanceof或错误DTO；包装Proxy、伪造原型和另一模块副本不保证互认。
此函数用于§6.10意外抛值分类，同时保留正常SDK错误原身份；没有新增静态成员或IPC/Schema字段。
具体实现/实际红绿与旧消费者回归见[Source运行时计划](plans/M5-source-document-runtime.md)。

Transport 的消息与关闭订阅都可幂等退订；close 幂等。关闭状态只转换一次，
**每次 onClose 注册**至多通知一次；不同注册不共用一个“已经通知”标志。
EOF、进程异常退出、解析失败和 send 抛错都必须让等待方获知，不静默吞掉。
一个 Transport 只属于一个 HierClient；Node 适配器只服务固定子进程，关闭 stdin/回收监听器，
stderr 单独保留可诊断上下文，禁止将其当 NDJSON。

**首次绑定与晚订阅（B-14）。** 保留现有四个Transport方法；createProcessTransport可以立即启动进程，
调用方稍后构造HierClient也必须得到明确结果，不能丢掉握手或关闭通知而永久pending。

- 首次onMessage之前收到的帧保序等待，保留原始首帧和重复帧，不能只挑出一个hello掩盖非法顺序。
  首次订阅返回退订函数后，在后续microtask开始投递；到达的新帧排在已等待帧之后，不能插队。
  订阅和send/close都不在其调用栈内同步调用消息/关闭handler，避免构造期间重入。
- 首次消息订阅取得本连接的唯一接收权；同一Transport第二次调用onMessage（包括退订后）
  抛bad_request/origin=client，不重播旧hello、不替换接收者，也不关闭原接收者的连接。
  未握手的HierClient仍按not_ready拒绝查询。Transport尚未取得接收权时send抛not_ready；
  已关闭时send抛transport_closed。关闭状态优先于未绑定状态。
- 首订阅开始投递前最多保留256个完整帧、合计4 MiB收到的UTF-8 JSON内容；
  按原始字节计数，不含LF/CRLF分隔符，当前未完成帧也计入字节上限。
  超出任一上限即关闭并保存transport_closed，data.reason=`prebind_buffer_overflow`，
  清空等待内容，后来的客户端明确失败。可通过底层暂停/背压限制读取，但不能静默丢帧或无限缓存。
  这是首次绑定的局部限制，不改变绑定后source.read等结果大小契约，也不声称JS堆峰值等于4 MiB。
- Transport保存第一次关闭的原因（正常关闭可无cause），之后错误不能覆写该原因或重新打开连接。
  onClose在关闭前注册则等待转换；关闭后注册则在后续microtask获得已保存的原因。
  每次注册独立计一次，取消的注册不再通知；重复close不会向旧注册再次投递。
- 已关闭Transport允许首次onMessage注册并返回可幂等退订的函数，但不投递任何历史消息。
  **关闭发生在第一条等待消息投递之前时，关闭优先**：清空握手/其他等待帧，晚绑定ready以
  transport_closed失败；不得先成功重播旧hello再假装连接仍可查询。已成功ready后才关闭则不改变
  已结算的ready，拒绝其余pending并关闭客户端。Node在绑定前观察到进程退出即进入关闭状态，
  不因stdout尚未消费而继续保留“可握手”状态。
- 每次排队回调执行前重新核对该注册是否仍有效及连接是否允许消息投递；先退订/关闭后执行的
  消息回调必须取消，已经进入handler的调用不能撤回。关闭回调只检查自己的注册是否仍有效。
  清空等待帧、解除外部订阅和回收子进程各自完成，不能因接收者退订而遗失子进程退出回收。
- HierClient构造时先建立内部状态，再注册onClose和onMessage；两者都注册后才能处理排队通知。
  dispose先废弃代次并退订，再close；握手前dispose使ready以disposed结算，不被迟到hello/close改写。
  适配器要内部观察启动失败的exited拒绝，避免用户晚接入前出现无人处理的Promise rejection；
  公共exited仍保留同一失败结果，onClose保存并投递诊断，不能把启动失败变成成功。

以下是可由可控事件和microtask逐步验证的顺序，不能用sleep碰巧取到某种竞态：

| 首次绑定相关事件顺序 | 要求 |
|---|---|
| 收到hello → 构造HierClient → 投递 | hello只投递一次，ready成功，原snapshot不变 |
| 收到非hello/重复hello → 构造 → 依序投递 | 不丢帧；按§5.6.1产生protocol_error并关闭 |
| 启动失败/EOF/退出/主动close → 构造 | onClose晚订阅得到保存的关闭原因，ready拒绝；不发请求 |
| 收到hello → 关闭 → 构造 | 丢弃等待消息，ready以transport_closed拒绝 |
| 构造已排入hello回调 → 投递前关闭 | 取消消息回调，ready以transport_closed拒绝 |
| 构造 → 投递前dispose | ready以disposed拒绝，退订后的消息/关闭回调均不再执行 |
| 注册onClose → 退订 → 关闭 → 新注册 | 旧注册无回调，新注册异步收到原因一次 |
| 超过首次绑定缓冲上限 → 构造 | ready拒绝且可诊断prebind_buffer_overflow，不无限等待 |

客户端状态为 waiting_hello → ready → closed/failed；不会从 closed/failed 自动重连。
ready 在合法 hello 后成功，在握手/传输失败或提前 dispose 后拒绝一次。
未 ready 时查询以 not_ready 拒绝，不偷发缺 snapshot 请求；snapshot getter 在握手前抛同类错误，
握手后始终返回该不可变快照。dispose 使全部仍等待的订阅者以 disposed 结束、废弃代次、
解除 AbortSignal/Transport/事件监听、清空缓存和请求表并关闭传输；重复调用无副作用。

Core/协议失败帧转为 HierError（origin=core），保留 wire code、message、data；客户端本地 abort
使用 cancelled/origin=client，EOF/进程异常使用 transport_closed/origin=transport。
协议帧错误/不兼容版本使用对应 ClientErrorCode，握手和所有 pending 都失败并关闭连接。
正常查询错误仅使该请求失败，不毒化下一个请求；已验证结构正确的未知 id 不当全连接错误。
这只保证错误到 L5，M5 才验收 UI 的展示和重试行为。

Node 的真实适配在独立入口 `@hier/client/node`，主入口不得依赖 Node 或 Electron。
其公开工厂 `createProcessTransport({command, args, cwd?, env?, shutdownGraceMillis?, resourceLimits?})`
以参数数组启动子进程、shell=false，不自行解析用户的 shell 命令；不传 cwd/env 时继承调用环境。
返回值实现 Transport，另有 `exited: Promise<{code: number | null, signal: string | null}>`，
实际子进程退出/失败启动并完成句柄清理后才结算；启动失败以 HierError(transport_closed) 拒绝。
stdout 的 NDJSON 解码与 stdin 的写入错误走 onClose，stderr 保存有界末尾64KiB作为错误 data 上下文。
主动 close 先结束 stdin，等待自然退出；默认2000ms后仍未退出则对自有子进程发 SIGKILL 并等待退出回收，
该可配置宽限为非负整数、最大2147483647ms，0表示立即终止。它是本地回收退路，不是 M7 Core 取消 SLA。
关闭通知/退订与内部等待进程退出的监听分开，不能因为已通知 L5 就丢掉进程回收。

**M7 可配置进程预算（2026-10-26，生产实施后交B/C）。** 用户最新要求先完成实现再交B/C。
Node公开类型`ProcessResourceLimits`包含三个可选正整数：`openTimeoutMillis`、
`cancelTimeoutMillis`（各1..2147483647ms）及`maxRssBytes`（1..Number.MAX_SAFE_INTEGER字节）。
`ProcessTransportOptions.resourceLimits`缺省或空对象不启用新限制，保留原调用行为；
输入在spawn前校验并复制，调用后修改原对象不改变预算。Node通用工厂不自动启用demo默认值。

- 打开预算从启动进程开始，到收到结构合法Hello结束；等待renderer绑定不延长或重启预算。
- 取消预算从写出合法cancel开始，到该target的合法终态回复结束；该target须为本传输已写出的
  未终态请求。未知/已完成target忽略，重复cancel不延长预算；扩展事件的id不能确认请求。
  SDK各订阅者仍立即按原规则以cancelled结算，Node继续观察Core终态。
- RSS预算在macOS/Linux由主进程对自有Core PID用`/bin/ps`采样，间隔100ms加探测时间，
  探测最长1000ms。采样值大于上限即超限；这是采样RSS限制，不能保证瞬时峰值不越界，
  不计renderer/Worker或其它进程。不支持平台在spawn前拒绝RSS配置；探测失败必须显式报错并关闭。

超限先关闭传输、拒绝其余pending，再对自有Core立即SIGKILL；`exited`仍等待实际句柄及
采样子进程回收。取消升级会终止整个快照，连带同会话其他查询，不自动重连或重放。
这三项限制优先于显式关闭的shutdownGraceMillis，不在超限后再追加2000ms宽限。
定时器受Node事件循环/OS调度影响，配置值不是严格的物理回收上界。

错误复用`transport_closed/origin=transport`，不扩协议或Schema错误枚举。
data.reason为`open_timeout`、`cancel_timeout`、`memory_limit`或`resource_monitor_failed`；
前两者带`limitMillis/observedMillis`，取消另带`requestId`，RSS超限带`limitBytes/observedBytes`，
探测失败带有界detail；原stderr末尾照常保留。Electron通过现有关闭错误原样转发到UI，
UI按既有failed/重新打开链处理，不将超限伪装为成功或partial。

演示壳主进程支持可选环境配置`HIER_CORE_OPEN_TIMEOUT_MS`、`HIER_CORE_CANCEL_TIMEOUT_MS`、
`HIER_CORE_MAX_RSS_BYTES`。用户于2026-10-26确认首版目标当前M4 Pro/24GiB、十万实例：
demo主进程缺省传入30000ms打开、2000ms取消后升级、4294967296字节采样RSS。
环境中的十进制正整数分别覆盖默认值，精确文本`off`显式关闭该项（转换为省略Node字段）；
不接收renderer IPC预算、不新增持久化工程字段。三项都off可恢复原demo无预算行为。
该首版RSS实现支持macOS/Linux；其它平台须显式关闭RSS或提供后续平台实现。
独立验收状态在REVIEW_LOG记录，数值是触发阈值，OS调度/回收及采样局限保持。

原 §6.1 的 Transport 是未实现草图；本节新增关闭/退订是公开契约增量。
B 在审查后自行适配FakeTransport的关闭/退订及上述首次绑定行为，把旧schemaVersion=1示例换成7、
补全早期对象必填字段。**保留旧测试目标，纠正与既定契约冲突的刺激/断言（C-62）**：
children正例使用complete；验证真实partial的用例改用instancesOf等QueryResult方法；
另测children收到partial应protocol_error并关闭。三种允许缓存方法各自验证complete缓存/LRU，
禁止缓存的方法验证再次发请求，不能仅以children不缓存证明整个缓存策略。
原“八项语义断言全部不变”的交接不准确，由B记录必要修订，A不修改B oracle，
也不放宽已正确的InstChildrenResponse来迁就旧草案。

#### 5.6.6 合并请求、独立取消与缓存（B-13 客户端部分）

- 同连接/快照、方法、规范化参数相同的同时等待调用共用一个 wire id，各自拥有独立 Promise 和 AbortSignal。
  参数递归按对象键排序，数组保序，省略 undefined 的可选项；方法默认值在边界统一补齐。
  等价对象键顺序、显式默认与缺省合并；不同 cursor/limit/side/budget 不合并。
  原参数对象在调用时取值，调用方随后修改不能改已发送请求/键。
- 已中止的 signal 立即以 cancelled 拒绝，不发请求、不命中缓存；一个订阅者中止只拒绝自己的 Promise。
  其余订阅者继续等待；**最后一个**离开才发送一次 cancel，立即移除去重项。
  此后同参数调用分配新 id；旧结果迟到不能结算新请求或写入缓存。所有订阅者都已本地结束时不等待 Core 回复回收状态。
- success、abort、dispose 谁先完成某订阅者终态，后续事件就不再改它；一次成功不能又变成 rejected。
  公共结果是只读快照；合并和缓存不允许一个消费者修改返回数据影响另一个。实现深冻结或隔离副本，
  不能仅用 TypeScript readonly 声称运行时无污染。
- 仅缓存 **ports、params、bindings** 的 complete 成功回复。source.read/checkInputs、分页查询、trace、
  错误/cancelled/partial 都不缓存；并发相同请求仍可合并，完成后下一次读磁盘会真正发新请求。
- LRU 默认最多256项、8 MiB；ClientOptions 可设非负安全整数，任一为0禁用缓存。
  字节计费为规范化 key 加完整 Reply 的 UTF-8 JSON 字节数（不承诺 JS 堆的精确字节数）。
  单项超预算不缓存；插入/访问更新最近使用次序，逐个淘汰直到两项限制都满足。
  options 非法在构造时抛 bad_request/origin=client，不接受 NaN/负数/小数。
- partial 的 completeness 原样返回；index.ready 通知订阅者，由视图模型决定重查。
  onIndexReady 的退订幂等，dispose 释放全部订阅，不后台静默重试或把旧 partial 改写成 complete。

#### 5.6.7 权威 Schema 与独立一致性门禁（B-12）

M4 必须交付仓库内 `protocol/schema/hier.schema.json`（JSON Schema 2020-12），
作为 wire 字段/枚举/可选性/null/范围、方法参数与结果映射的**唯一机器来源**。
该文件现已作为待审草案存在，结构自检与使用说明见 [Schema 说明](../protocol/schema/README.md)；
尚未生成 TS 或接入运行时。协议/模型版本和方法映射在元数据登记，字段默认值在对应定义登记；
实施时与 Core 受审值做可执行核对，不在 TS/IPC/UI 再维护一套手写默认或域规则。

- Schema 先依据已审 DESIGN 和独立手写输入编写；禁止用序列化当前输出反推“正确 Schema”。
  C++ 领域结构仍是 Core 事实，wire 只在 L4 映射。TS 类型和结构验证从 Schema 生成，
  生成文件标注来源，禁止手改；检查脚本在临时目录重生成并要求零 diff。
- Schema 含 hello、request/cancel、success/error、progress/index/protocol_error，以及每个方法的 params/result。
  discriminator、required、nullable、枚举、版本与整数范围均可测试；省略和 null 不混同。
  Request 方法映射与 success 结果的关联靠 pending method 验证，不能仅有 `result: any` 的万能壳。
- C++ wire 编解码与生成 TS 都必须对 B 独立正/反例接受/拒绝一致；每方法至少成功/错误，
  有 QueryResult 的覆盖 partial/reasons、空结果与可选字段。现有 CLI 结果用同一模型定义核对，
  protocol envelope 的新增约束不偷偷改变旧 CLI 包装；snapshot新增字段按本节明确的schema7增量验收。
- 必须有版本不兼容、未知字段、缺字段、错类型/枚举、整数溢出、重复键、未知/重复 id、
  截断帧/粘包/拆包、UTF-8、错 snapshot、部分结果、传输关闭和迟到回调的独立门禁。
  Schema 验证不替代语义 oracle、核心回归或线程/取消的真实执行证据。
- 首次服务只支持 protocol2/schema7；保留旧握手样例（如 schema1/schema6、未知 protocol）并明确拒绝、释放资源。
  这是 wire 兼容测试，不是持久化迁移。M3 已验收字段如确需破坏性修订，必须另给理由、版本边界和回归，
  不能借生成器顺便改旧模型。

完成上述契约审查、B 独立冻结及红基线后，A 才实施受影响 M4 单元。
机器产物、生成工具和全部门禁实际交付前，不宣称 B-12 或整个 M4 已完成。

#### 5.6.8 私有 reader / scheduler 确定性测试接口草案

本增量回应 B 在 a7c150a 交接中明确保留的精确分片、深度、队列和取消赢家门禁。
**接口尚未实现，先交 C 审查，再由 B 独立冻结测试。** 它不把整个 M4 的其他单元重新设为等待，
已有 C 认可和 B 冻结的单元可独立推进。本节不改变 wire 字段、公开 Design/Transport 或 M3 observer；
上面补充的深度计数是 §5.6.2 的待审边界澄清。

**同一生产 reader 的直接入口。** 拟在 `core/protocol/src/FrameReader.h` 放 L4 私有头，
不加入 `protocol/include` 或 PUBLIC include 路径。serve 和 B 的 reader 测试都链接同一实现；
测试自行给定每次 feed 的字节串，不经过可能合并写入的 OS 管道，也不另写测试用解析器。

```cpp
// 私有接口草案；以下名称不是当前已有符号。
enum class ReadStatus { need_more, frame, fault };
struct ReadStep {
    size_t consumed;
    ReadStatus status;
    std::string frame;  // 拥有完整 JSON 原始字节，不含 LF / CRLF；仅 frame 状态非空。
};
enum class EndStatus { clean, fault };
class FrameReader {
public:
    ReadStep feed(std::span<const std::byte> bytes);
    EndStatus finish();
};
```

- 一次 feed 最多取出一帧，consumed 精确包含该帧的分隔符；调用方保留未消费后缀，
  待调度/输出允许继续接收时才再次 feed。need_more 消费全部本次输入；fault 为粘滞终态，
  后续 feed 不消费输入。空 span 不表示 EOF、不改变状态；EOF 只由 finish 表达。
  已 finish 的 reader 不再接受数据；重复 finish 返回同一结果。正常无残片 EOF 为 clean，
  有任何未分隔字节或先前 fault 则为 fault；错误到协议错误帧/退出码的映射仍按 §5.6.2。
- 在 LF 处仅剥掉紧邻的一个 CR；分片可以落在 CR/LF 之间，也可以落在 UTF-8 多字节之间。
  空行立即 fault；空白行、非对象、非法 UTF-8、重复键等由下一步严格解码拒绝。
  行长度按原始字节而非字符计，最多缓存1 MiB有效内容及一个待判定是否为分隔符的 CR；
  不能先复制整块输入或累计任意多行，再检查单行上限。
- 完整 frame 交给 L4 同一严格解码函数，服务和测试共用它验证 JSON/UTF-8/重复键及深度，
  再做请求 envelope 校验。测试可观察其“得到解码对象 / 不可关联帧错误”结果；
  不暴露第三方 JSON 类型到公开 C++ 头，不把深度检查只放在测试 wrapper 中。
  重复键比较解码后的键名，不能让转义拼写绕过重复判断。
- B 可用同一手写字节输入枚举分片位置并拼接所有 frame，直接断言 consumed 和输出顺序；
  分别冻结1 MiB/多1字节、CRLF分隔、EOF残片、128/129层对象与混合数组、
  含括号/转义的字符串以及未知字段内深层嵌套。OS管道测试继续验证实际接线，两类证据分报。

**生产任务状态与测试控制。** 拟将队列/取消/唯一终态收敛到
`core/protocol/src/SessionState.h` 的私有 SessionState，serve 的 I/O 和工作线程共用它。
测试直接调用其 admit / take / cancel / finish / close 操作，不实现另一套 scheduler。
这些操作只处理拥有自身存储的请求/结果及 stop_source，不读取 Design，不包含用户回调或系统 I/O。
生产路径中的 Design 始终由唯一工作线程打开、查询、销毁；测试不能从控制线程借用它。

| 私有操作 | 在同一状态锁下完成的事实 | 锁外工作 |
|---|---|---|
| admit | 为已验证新请求占一个未结算槽并入FIFO；256满则返回queue_full；拒绝不占槽 | JSON解码和ID检查在I/O路径；ID即使被queue_full拒绝也已消费 |
| take | 取FIFO首项并标运行中；最多一个运行中；记录开始progress | 工作线程进行调用前取消检查和真实Core调用 |
| cancel | 排队项直接确定一次cancelled终态并释放槽；运行项记录取消意图；未知/已结束忽略 | 对运行项持有的stop_source副本调用request_stop，避免锁内执行stop_callback |
| finish | 最后一次取消检查、唯一终态确定与回复入队为一个临界区；释放槽一次 | 查询及候选结果序列化在锁外，锁内只移交已拥有的结果/帧 |
| close | 标连接结束、丢弃排队项、禁止后续发布、记运行项取消意图 | 唤醒等待、request_stop、等待worker退出；Design在worker上析构 |

取消意图的记录先于锁外request_stop。finish的最终检查也观察该意图，避免I/O已经记录取消、
但尚未调用request_stop的间隙错误提交成功；这属于 §5.6.4 的调用后取消检查点。
finish先提交终态则后到cancel无效；cancel先记录且被检查点观察则终态cancelled。
被取消的Core调用必须实际返回后才能finish，不能先发终态、另让Core在后台继续执行。
开始/完成progress和终态均按 §5.6.4 入队；直接取消排队项没有伪造progress。
状态表仅保存未结算任务与仍需输出的有界状态，不能积累整段已结束请求历史；
队列256不能替代输出背压，输出缓冲/部分写仍须另有实际门禁。

**两线程的可控顺序。** 单线程直接调用SessionState只能证明状态转换；还须验证真实worker接线。
拟在相邻私有 `SessionProbe.h` 定义以下测试构建接口，仅 `HIER_TEST_OBSERVER=ON` 可安装：

```cpp
enum class SessionPhase { before_take, before_core, after_core, after_terminal };
struct SessionProbe {
    virtual ~SessionProbe() = default;
    virtual void reach(SessionPhase phase, uint64_t requestId,
                       std::stop_token closing) noexcept = 0;
};
```

- private会话启动入口在测试构建可接收 `std::shared_ptr<SessionProbe>`，会话持有到worker已join；
  OFF无安装参数、无probe存储/回调/公共符号，不提供CLI开关、环境变量、wire或JS注入入口。
  复用现有构建开关，不把M3的thread_local Scope直接跨线程传递；M3事件和冻结oracle保持。
- 所有reach调用都在工作线程、状态锁和输出锁之外。before_take在有可取任务后、真正take前，
  requestId为待取队首候选；测试阻塞时该项仍可能被I/O取消，恢复后必须重新读取队列，
  不能借用旧项或假定原ID仍将执行。before_core在运行中标记/开始progress之后、调用前检查之前；
  after_core在真实查询返回之后、finish最终检查之前；after_terminal在终态已确定且已解锁之后。
- B 的probe只记录值并用条件变量/闩锁控制继续；不得调用Design、改请求/返回结果或伪造取消观察。
  closing为会话关闭专用token，与每任务取消token分开；等待必须响应closing并在析构/断言失败时释放，
  防止测试失败造成join永久等待。会话关闭在等待join前先在锁外请求closing停止并唤醒等待。
  不以sleep、耗时足够长或progress碰巧先到证明线程阶段。
- before_take固定队列占用，可验证256槽、第257拒绝、排队cancel立即释放槽及下一新请求入队；
  before_core/after_core分别控制运行中取消的调用前/调用后检查，after_terminal控制成功先提交的对照。
  B须断言唯一终态/无队列取消progress/关闭后不发布，以及probe清理后worker和Design均回收。
  这些边界检查不冒称取消发生于Core内部长循环；其执行中取消仍由已有M3检查点及相应回归证明。

正式接入时 C 检查所有probe调用点和 OFF 产物（预处理/符号/消费者隔离），B分别运行
真实serve的OFF集成、ON确定性线程门禁以及Debug/ASan+UBSan；不得只测替代调度器。
本草案没有完成Node适配器精确缓冲/stderr门禁、部分写与背压、客户端ID耗尽、
输入哈希/缓存key精确编码或生成器一致性；这些仍分别保留在M4计划和B的未完成清单。

---

### 5.6.9 B-15 可编译声明提案（待 C 审查、B 冻结）

具体声明见私有 [SessionContract.h](../core/protocol/src/SessionContract.h)。本文件目前只有
声明、没有定义、没有加入CMake；不提供可链接runtime，不改变当前Core/schema6。
它将§5.6.8原拟分散的词汇先收敛到一个私有头，正式实现可拆文件但保持受审签名。
只有私有测试显式添加该目录；禁止安装或PUBLIC传播，不向公共C++/TS/协议暴露JSON类型。

- `FrameReader.feed` 在 `finish(clean)` 后固定返回 `{0,need_more,{}}`，finish仍clean；
  fault后为 `{0,fault,{}}`。这个补充消除B15的具体状态歧义；其余分片/长度规则沿用§5.6.8。
- `decodeFrame` 只接受完整、不含换行分隔符的frame；成功返回拥有的Object，失败返回
  `{code,byteOffset}`，offset为原输入0基UTF-8字节位置，EOF错误可等于size。
  合法空白、Unicode及转义正常解码；重复键按解码名判定，错误位置取第二个键的开引号。
  深度超限位置取第129层开括号。非法UTF8先于JSON扫描报告；其余按左到右最早可判错误报告。
  数字暂保留完整词法token，后续envelope/Schema验证再检查整数/安全范围，避免double舍入掩盖溢出。
  `JsonValue`是唯一拥有的边界树，不同时长期保存第二份解析树；decoder库选型不在本声明中假装完成。
- `admit`只接已通过envelope/schema和ID登记的Request；状态内不重复业务校验。
  accepted转移拥有值；其他返回不入队。满256个未结算时优先queue_full。
  `backpressured`是私有“先排空输出再重试”状态，不生成新的wire错误、不得重复消费ID；
  admit仅在accepted时从右值引用移动；其余状态保持调用方拥有请求，I/O保留它、不继续读下一帧。
- 为明确有界性，状态最多保留768个输出记录，并为每个未结算请求预留最多3个记录
  （开始progress、完成progress、终态），入队一个记录相应消费一个预留。
  admit须满足 `queuedOutputs+reservedOutputs+3<=768`，
  否则backpressured；排队cancel只发一个Terminal(Cancelled)，释放多余预留。
  take一次发0/1，finish一次发1/1再终态；这限制积压记录数，不声称限制单个source.read回复字节。
  实际stdout部分写/不可写时保留当前拥有帧、停止继续接收，仍需真实I/O独立门禁。
- `take`在已有运行项/空队列/关闭时返回nullopt，否则移动出Request并借助拥有的stop状态返回token。
  `waitFront`阻塞至存在可取队首或关闭/传入token停止，后两者返回nullopt；仅返回ID候选，
  probe返回后必须重新take。`unsettled`含运行项；终态原子入队时释放槽。
- `cancel`对排队项立即发布cancelled并返回nullopt；运行项先在同一锁下记录intent，
  再返回拥有的stop_source副本；未知/已结束/关闭返回nullopt。调用者在锁外request_stop；
  测试可以保存副本而暂不调用，直接断言运行token仍false，随后真实worker经过after_core、
  finish仍必须因intent发布Cancelled。finish先发布时后续cancel无效。
- `finish`仅能用于已实际返回的当前运行任务；published表示一次终态入队；错误ID/重复finish
  返回not_running，关闭返回closed且不发布。候选回复在锁外拥有/序列化，取消时直接换成
  Terminal(Cancelled)，其wire编码在I/O出队后完成，锁内不调用业务/序列化器/用户回调。
- `tryPop`无输出时nullopt；`waitPop`等输出，关闭或停止时nullopt；二者均按记录入队顺序取出。
  close先原子禁发布、清空排队/待输出，再在锁外请求运行停止并唤醒等待；幂等。
  已运行任务仍须实际返回、worker退出才能回收，不以unsettled变少声称Core已停止。
- `SessionWorker`构造只保存options/私有probe；start创建唯一工作线程，由该线程open/query/destroy Design。
  重复start返回already_started，关闭后返回closed。waitOpened在未start且未close时抛logic_error；
  否则等实际打开成功/Error/Closed，重复调用返回同一拥有结果；I/O先发hello再接收查询。
  Open错误退出worker；打开中close不能中断Slang系统边界，但禁止发布已关闭快照。
  close先请求独立closing token（唤醒probe），再关闭state；join只等待，析构调用close+join。
  joined只在实际join完成后true。SessionState引用不得晚于worker使用；probe持有到join结束。
  OFF声明不含probe参数/类型，ON四个phase位置保持§5.6.8；不新增wire或环境注入。

本提案供B编译适配与确定性oracle冻结；A本轮只做头文件ON/OFF语法验证。
不将声明编译通过算reader/decoder/worker执行通过，不提前关闭B15，也不改变已获准TS实施。

## 6. 前端接口

### 6.1 客户端（L5）

```ts
interface Transport {                     // Electron IPC、Node 子进程、测试用假实现
  send(msg: object): void;
  onMessage(handler: (msg: object) => void): void;
  close(): void;
}

class HierClient {
  constructor(transport: Transport);
  readonly snapshot: SnapshotInfo;
  // 每个协议方法一个类型化函数；都接受 AbortSignal
  children(inst: ObjectRef, page?: PageReq, signal?: AbortSignal): Promise<Reply<Page<InstInfo>>>;
  // ...
  onIndexReady(handler: () => void): Unsubscribe;
  dispose(): void;
}

interface Reply<T> { result: T; completeness: Completeness; }
```

客户端负责四件事，视图层不必再各自处理（对应 U2、U3、U6、A14、A15）：

- **快照守卫**：响应的快照与当前不一致就丢弃。
- **取消**：`AbortSignal` 触发时发 `cancel`，并立刻以 `cancelled` 结束等待。
- **去重**：相同方法、相同参数的并发请求合并为一个。
- **缓存**：对不可变结果（端口、参数、绑定）做有容量上限的缓存，键里包含快照。**只缓存 `complete` 的结果**；`partial` 的结果不缓存，下次照常发请求。原因为 `indexing` 的结果，在收到索引就绪事件后由视图模型重新查询。
- **不完整状态必须上传**：`Reply` 的 `completeness` 原样交给视图模型，视图必须把 `partial` 显示出来（例如"结果不完整：超出预算"），不得当作完整结果展示。

### 6.2 视图模型（L6）

**树模型**

下列为早期示意；具体行、分页、异步命令与生命周期见§6.6。生产TreeModel已导出并经B/C独立验证；L7仍待具体契约冻结。

```ts
class TreeModel {
  constructor(client: HierClient, opts: { showGenerateScopes: boolean });
  readonly rows: readonly TreeRow[];           // 当前可见行的扁平列表
  setExpanded(row: RowId, expanded: boolean): void;   // 目标状态，不是切换
  reveal(ref: ObjectRef): Promise<void>;       // 逐级加载祖先并展开
  subscribe(listener: () => void): Unsubscribe;
}
```

展开是"设为目标状态"而不是"切换"，连续点击的最终状态取最后一次意图。

**选择**

以下为早期接口示意；M5 首单元的完整选择契约、兼容性及实施状态见 §6.5。

```ts
interface Selection { items: Slice[]; origin: "tree" | "graph" | "source" | "props" | "external"; }

class SelectionModel {
  readonly current: Selection;
  select(sel: Selection): void;
  back(): void; forward(): void;
  subscribe(listener: (sel: Selection) => void): Unsubscribe;
}
```

树、属性、源码、图共用一个选择模型。源码位置对应多个实例时，返回全部候选让用户选，不猜（对应 A19）。

**图会话**

以下是未发布的早期示意。M6-A-01 来源/语义成员的生产契约见 §6.28；
布局、折叠、annotation 和画布仍按 M6 后续单元审查，不以该示意作为现有生产 API。

```ts
interface GraphElementBase { id: string; origin: "design" | "analysis" | "plan"; ref?: ObjectRef; }
interface GraphNode extends GraphElementBase { kind: string; label: string; ports: GraphPort[]; expandable?: boolean; }
interface GraphEdge extends GraphElementBase { from: PortId; to: PortId; factId?: string; net?: string; bits?: BitRange; }
interface GraphFragment { nodes: GraphNode[]; edges: GraphEdge[]; }

interface GraphSource {                        // 图内容的来源
  id: string;
  expandNode?(node: GraphNode, signal: AbortSignal): Promise<GraphFragment>;   // 把一个节点展开为子图
}

class GraphSession {
  constructor(client: HierClient, layout: LayoutService);
  addFragment(fragment: GraphFragment): void;          // 任何来源都可以加
  registerSource(source: GraphSource): void;
  traceFrom(slice: Slice, direction: Direction, steps?: number): Promise<void>;   // 内置的设计来源
  expand(nodeId: string): Promise<void>;
  collapse(nodeId: string): void;
  setBusFolded(net: string, folded: boolean): void;
  readonly view: LaidOutGraph;                         // 布局后的可见图
  readonly layoutState: "idle" | "running" | "failed";
  retryLayout(): void;
}
```

要点：

- **图元带来源。** `design` 表示真实设计事实，`analysis` 和 `plan` 是外部加进来的。渲染时区别显示，且外部图元永远不会回写设计事实。
- **节点 ID 用 `ObjectRef`，边 ID 用事实编号加两端和位段。** 只有完全相同的事实才去重。不同驱动、不同位段、不同实例一定是不同的图元（对应 R1–R3、S6）。
- **折叠只改视图。** 总线折叠、层级折叠都保留到原始图元的映射，展开后连接不变（对应 A17）。
- **"展开节点为子图"是通用操作。** 层级展开由内置的设计来源提供；以后把过程块拆成门级图元，只需再注册一个来源。
- **规划编辑的显示**通过 `addFragment` 加入 `origin: "plan"` 的图元实现。旧代码里时钟、DRC、wrapper、DFX IP 四个页面都是整个替换原理图存储，新设计改为各自往图会话里加片段。

**布局**：ELK 在 Worker 里运行，带超时；过期的布局结果丢弃；失败时 `layoutState` 为 `failed`，图数据仍可查询，可重试（对应 U7、A18）。

### 6.3 视图与扩展点（L7）

组件：`HierarchyTree`、`PropertiesPanel`（端口、参数、驱动负载）、`SourceView`、`SchematicView`。

给分析模块的标注接口（未发布的早期示意；具体快照/状态/视图契约见 §6.31 提案）：

```ts
interface Mark { color?: string; badge?: string; tooltip?: string; severity?: "info" | "warn" | "error"; }

class AnnotationLayer {
  constructor(id: string, label: string);
  set(marks: Map<ObjectRef, Mark>): void;       // 整层替换
  clear(): void;
}
// 树和图都渲染已注册的标注层
```

分析模块把结果按对象挂上来（例如高亮一条时钟路径、标出 DRC 违例），不需要了解树和图的内部。

### 6.4 两个选型决定

| 部分 | 决定 | 理由 |
|---|---|---|
| **树** | 自有 `TreeModel` + TanStack Virtual Core | Core 负责远端分页/祖先，TreeModel 负责加载、意图和可见行，Virtual 负责窗口与滚动。react-arborist 可以受控懒加载，但仍构造已加载节点的 NodeApi；其键盘/焦点/ARIA 机制作为参考，采用整树组件前另验数据投影和状态同步成本 |
| **图** | 当前保留自有 React/SVG 渲染 + `elkjs` 布局 | ELK 提供布局算法，项目维护来源/事实到展示投影的边界。Sprotty 保留为正式候选；其展示模型、选择同步及 DI 的实际适配成本，须与 React/SVG 的自写交互成本在同场景比较。d3-hwschematic 的网络高亮/端口投影可参考，输入改写和显示 ID 分配须隔离并保留事实反向映射 |

如果你倾向直接用 react-arborist 或 Sprotty，这两处可以改，不影响 L5 以下。

M6 的有限画布比较与来源生命周期收敛见[执行计划](plans/M6.md)。DI 或输入格式差异不足以单独证明长期维护成本；
A84 已交付两条真实浏览器入口及同场景三次有限对照，见[比较结果](plans/M6-canvas-comparison.md)。
两路线功能场景通过；Sprotty 发布版卸载残留窗口监听，整体实验保留失败退出；折叠仅展示聚合，
不代表生产折叠或组件验收。继续当前 React/SVG 路线，不以小图耗时或 DI 单独排除 Sprotty。
D-03 对应来源契约见 §6.28，C78 接受/B79 冻结后 A79 已实现来源数据单元，固定735d227已获B81/C81定向验收；M5 的既有实施前置保持。

### 6.5 M5 共享选择契约（2026-10-13，契约已审 / 测试已冻）

本节补 B-13 的**选择**部分，唯一规范仍为本文。
[原冻结声明](../web/contracts/m5-selection.d.ts) 保留契约提案时的编译投影；
生产 API 由 [viewmodel](../web/packages/viewmodel/src/index.ts) 导出。
C已认可固定61a7ffe并关闭C-70，B已冻结原161项及读取阶段80项；
A已实现选择运行时，固定cfd22ff已获C审查及B独立验收通过，B结果981fae9已吸收。[M5 计划](plans/M5.md) 记录实施次序和证据。
树的行/分页/reveal、源码模型、Electron 挂载将在后续单元先补契约，再独立审查/冻结；
本节不将 B-13 整体或 M6 的 D-03 标为解决。M4 §5 的契约保持原文。

#### 6.5.1 地址与单一选择状态

每份打开的设计会话有一个共享 `SelectionModel`；树、属性、源码、图订阅它。
模型仅保存导航状态，不拥有客户端，不查询或推断设计事实。
采用 HAL SelectionRelay 的共享通道/反馈抑制思想；不复制其全局单例、Qt 或业务撤销。
A 核对的参考为 `ref/hal` acc899e297ed3866ad7da432ab0403c3d8d62d1c 的
`plugins/gui/include/gui/selection_relay/selection_relay.h` 及对应 cpp；没有引入该源码。

```ts
type SelectionOrigin = "tree" | "graph" | "source" | "props" | "external";
type SelectionBits = Readonly<Pick<BitRange, "lsb" | "width">>;
interface ObjectSelection {
  readonly ref: ObjectRef;
  readonly bits?: SelectionBits;
  readonly side?: Side;
  readonly def?: never;
}
interface DefinitionSelection {
  readonly def: DefRef;
  readonly ref?: never;
  readonly bits?: never;
  readonly side?: never;
}
type SelectionItem = ObjectSelection | DefinitionSelection;
interface Selection {
  readonly items: readonly SelectionItem[];
  readonly origin: SelectionOrigin;
  readonly snapshotId?: SnapshotId;
}
```

- `{ref}` 可以表示实例、端口、信号、过程或寄存器，不需要虚构位宽。具体对象种类由
  `client.object(ref)` 返回；L6/L7 不解析 ref 编码或按字符串拆层次。
- `{ref, bits}` 兼容旧 Slice；bits 是可选位段，缺省表示对象本身，不表示“已经查明全宽”。
  保留现有 BitRange 的非负安全整数规则，包括 width=0；模型不猜实际范围/方向。
  发起连接/追踪时仍按对应 Core 方法的契约校验，不能把零宽选择直接当合法查询切片。
- `{ref, side}` 保留端口内外侧。省略 side 与 inside/outside 是三种不同的选择；
  消费者在需要方向的操作中显式取得合法 side，不从 origin 或图位置推断。
  模型只校验 Side 枚举，端口适用性和对象存在性由 Core 验证。
- `{def}` 明确表示定义而非 occurrence；不得伪造 `{ref: def}` 或自动选择第一个实例。
  后续模型使用 `instancesOf(def)` 列出分页候选，由用户选 occurrence 后再定位。
  源码多命中同样展示全部候选；没有选择时不自动把候选集写成多选。
- items 的顺序有意义：第一项是主选择，后续项为有序多选。完全相同的项去重并保留首次位置；
  def/ref 类别、引用原值、bits 是否存在及其两字段、side 是否存在及其值共同决定身份。
  不按标签、路径文字、位段包含关系或 Unicode 归一化合并。
- 纯计划对象属于宿主业务文档的 `document/revision/localId`，不冒充 ObjectRef/DefRef。
  宿主导航到计划项时，明确映射得到的设计引用可交本模型；无映射则以 external 空选择
  清除原设计联动，计划项本身仍由宿主文档持有。该文档不是本仓库第二份设计选择事实。
  M5 不实现计划编辑或其 undo/redo。

#### 6.5.2 快照、构造及输入边界

```ts
interface SelectionOptions { readonly snapshotId?: SnapshotId; readonly historyLimit?: number; }
class SelectionModel {
  constructor(options?: SelectionOptions);
  readonly snapshotId: SnapshotId | undefined;
  readonly current: Selection;
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;
  readonly disposed: boolean;
  select(selection: Selection): void;
  back(): void;
  forward(): void;
  subscribe(listener: (selection: Selection) => void): Unsubscribe;
  dispose(): void;
}
```

1. 正式视图在 `await client.ready` 后，用其 `snapshotId` 构造模型。绑定不可修改；
   每次 select（含空选择）必须带相同 snapshotId。缺省、异快照或向无绑定模型传入
   snapshotId 均拒绝，不能悄悄接纳或重新绑定。宿主重开设计时销毁旧模型并创建新模型；
   即使重开同一输入也不复用旧 Transport/HierClient/SelectionModel。
2. 保留 `new SelectionModel()`：无绑定的纯内存模式，只接受无 snapshotId 的输入，
   供旧公开示例和独立无客户端测试使用。它不具备跨快照安全保证，demo/正式视图不得使用。
   不在此模式调用 SDK，不能借它绕过客户端快照守卫。
3. 初值为 `{items: [], origin: "external"}`；绑定模式另带该 snapshotId。
   初值是第一条历史记录；构造不发通知。`historyLimit` 默认为 **128**，是包括当前项的
   历史条数上限；必须为正安全整数，1 合法。此配置不作为 M7 总资源保证。
4. 模型只校验选择结构、origin、互斥的 ref/def、已有 ObjectRef/DefRef/BitRange/Side/
   SnapshotId 原语及模型绑定。复用 protocol-types 的公开验证器，不另写 ref 编码或位宽规则。
   同为 opaque string 的 ref/def 的语义归类由生产者负责，不声称原语验证能查出地址的真实类型。
   已出现的可选字段必须有效，不能用 undefined/null 替代省略；DefinitionSelection 不接受 bits/side。
5. 模型同步复制声明中的字段和数组、去重并深冻结发布值；协议扩展字段等未声明字段不参与
   选择状态，不遍历/复制到模型。调用者之后修改输入不影响 current/历史/通知，订阅者不能
   修改任何已发布层级。整个输入校验成功后才提交；某项非法时不接受其它“合法子集”。
   复制可以执行声明字段的getter；输入读取期间的保护、例外和错误顺序见下述C-70补充，
   不能把“同步”当作“不会执行调用方代码”。
6. 导出 `SelectionError extends Error` 和只读 code：`invalid_options`、`invalid_selection`、
   `snapshot_mismatch`、`disposed`、`reentrant_change`。诊断 message 非空，内容不作稳定常量。
   构造参数非法为 invalid_options；选择结构/原语非法为 invalid_selection；结构合法但与
   模型绑定不符为 snapshot_mismatch。释放检查先于其他检查，正常 select 先完整验证再比较/提交。
   这些是 L6 本地错误，不变更 M4 HierError、Core 错误或 wire Schema。

**输入读取与验证阶段（C-70已由C关闭，B专项已冻结）：**

- 允许声明字段为普通数据属性或getter（含继承的声明属性）。不要求调用方先JSON序列化。
  记录容器须为非null对象且不是数组，items须为实际数组；函数不是记录容器。
  只探测/读取本节声明字段，不枚举对象，不读取扩展字段、toJSON或自定义迭代器；
  属性是否存在与值为undefined不同，仍适用原显式undefined拒绝规则。
- 一个select从检查disposed、取得本模型的**输入读取保护**开始，先于任何参数属性的探测/读取。
  输入期的嵌套select/back/forward一律抛reentrant_change，哪怕意图可能是同身份或边界no-op；
  此时尚无可信自有输入，不能为判定no-op再次读取调用方对象。
  getters及subscribe/unsubscribe可以照常使用；dispose始终允许且立即生效，不延迟到输入结束。
  若已经disposed，则所有导航/subscribe仍优先抛disposed。
- 输入先投影为模型自有的普通数据：选择字段按snapshotId、origin、items顺序探测/读取，
  items的length读取一次，再按索引从0递增取得每项（不使用调用方的map或iterator）。
  每项按ref、def、bits、side顺序探测/读取；bits是对象时在该步取得lsb、width。
  每个存在的声明字段值、数组长度和每个索引在其输入路径上最多读取一次；缺失字段不Get。
  同一对象出现在两条输入路径时分别取值，不承诺两个时点合成同时快照。
  非法容器、读取异常或期间dispose立即终止本次投影，不再读其后字段。
- 对象/数组的属性探测和Get都视作可能执行调用方代码的操作；每次返回或抛错后复查disposed。
  不将调用方对象传给原语验证器；只对已取得的自有数据验证ObjectRef/DefRef/BitRange/Side/
  SnapshotId及选择形状，之后检查快照绑定。这样验证器内部重复读字段也不再次执行输入getter。
  校验、比较身份和提交均不能重新读取原输入。所有退出路径都释放本次输入读取保护。
- getter/属性探测抛出的值（不论Error、SelectionError或其它值）若发生在活模型上，
  外层select抛invalid_selection，并通过标准Error.cause保留原抛出值；不作为通知AggregateError。
  嵌套导航的reentrant_change若未在getter内捕获，也按该规则成为外层invalid_selection的cause；
  若getter自行捕获并返回合法值，外层选择可以正常提交，嵌套导航从未改变历史。
- 输入期只要dispose已生效，外层select最终抛disposed，优先于读取异常、结构错误和快照不匹配；
  同一次属性操作还抛出值时，以Error.cause保留该值。释放后的初始空状态不被外层提交复活，
  不发选择通知、不恢复历史/订阅。没有dispose时，读取异常先于后续结构/绑定判断；
  全部取值成功后仍按“结构非法→snapshot_mismatch→身份/重入判断→提交”的原顺序。
- 输入期内合法subscribe/unsubscribe/dispose及getter的外部副作用不回滚；原子拒绝保证的是
  **本次外层select不提交、不改历史、不发通知**。它不保证撤销调用方执行的独立操作。
  单纯读取getters能观察到外层开始前状态，除非期间dispose或订阅操作显式改变了相应状态。
- select在通知期间也须先保护自己的输入读取，再按原规则判断同身份no-op或变化重入。
  读取保护结束后恢复原通知状态；不能因一次失败/回显而把仍在进行的通知阶段当作空闲。
  输入getter内dispose仍即时停止本轮后续通知；当前listener若因此抛错，遵循§6.5.4的异常聚合。
- 构造options同样只读取snapshotId、historyLimit（依此顺序），每字段最多一次，再校验自有值；
  getter/属性探测异常映射为invalid_options并保留Error.cause，不返回半初始化模型。
  options执行的外部副作用不回滚。构造函数和SelectionError公开签名不变，Error.cause沿用标准Error属性。

#### 6.5.3 重复选择、历史与分叉

- 比较采用 §6.5.1 去重后的**有序 items**，快照固定；origin 是动作来源，不是身份。
  与 current 身份完全相同的 select 是 no-op：不改 origin、不通知、不增历史、
  不清 forward。这样树→图→源码回显同一选择时仍只有一次导航。
- 其它合法 select 在当前历史位置之后截断 forward，追加新记录并成为 current；
  超过 historyLimit 时从最老一端淘汰。缺少 bits/side 与显式值不等价；多选重排是新导航。
  改变 origin 而目标不变不是新导航；如需激活面板或滚动，用宿主回调，不伪造选择变化。
- back/forward 只移动已有历史位置，恢复原 items、原 origin、原 snapshotId，
  不追加或改写记录；真正移动恰好通知一次。边界上是 no-op；canGoBack/Forward 反映是否可移动。
  `select A → select B → back → select C` 后不能 forward 到 B；
  `select A → select B → back → select A` 不丢 B。
- 输入无效/跨快照/不允许的重入在提交前失败，本次操作不改变current、历史或订阅。
  输入访问器显式执行的dispose/订阅等独立操作不回滚，见§6.5.2。
  历史只代表导航，不对设计事实、计划文档或分析执行撤销/重做。

#### 6.5.4 通知、异常与释放

- subscribe 只登记，不立即回放 current；消费者先读 current 再订阅，调用均同步。
  每次登记独立，即使回调函数相同；返回幂等 unsubscribe。提交状态后同步按登记顺序通知。
  每次发布固定本轮登记集合，轮到前已取消的登记不调用；通知中新增登记从下次发布开始。
  非函数 listener 抛 TypeError 且不登记；若已释放，disposed 检查仍优先。
- 订阅者读取/渲染，不应发起新的导航。通知中重复 select 当前身份允许 no-op；
  通知中会改变选择的 select/back/forward 抛 reentrant_change，不能插入第二轮通知。
  边界 back/forward 不改变状态，仍是 no-op。若确有下一次用户导航，待当前同步调用结束后发起。
  上述no-op例外不延伸到输入getter中的嵌套导航；输入读取阶段优先适用§6.5.2的保护规则。
- 某回调抛异常时，其余仍有效登记继续收到已提交的同一状态；收集异常后向本次发起者抛
  `AggregateError`，errors 按调用顺序包含原异常。已提交的状态和历史不回滚，不静默吞掉异常。
  调用者能区分提交前的 SelectionError 与提交后的观察者 AggregateError。
- dispose 幂等，立即清空登记和历史，current 变回本绑定的初始空选择，两个 canGo 标志为 false，
  disposed 为 true；不发“选择改变”通知，也不关闭共享 SDK。已交出的冻结值仍有效。
  若在回调中 dispose，本轮后续回调停止；此前抛出的回调异常仍按上条报告。
- 释放后 getters 仍可读，dispose/旧 unsubscribe 仍幂等；select/back/forward/subscribe
  均抛 disposed。关闭面板只取消自己的订阅；设计会话所有者在关闭/替换会话时销毁共享模型。
  旧异步回调不得提交到新模型，调用旧模型则明确失败；后续异步模型还须自行校验请求代次。

#### 6.5.5 独立冻结边界与兼容

保留 B 原两项选择草案原字节及 no-arg/Slice 输入的结果形状；不提前将其标为完整 M5 验收。
尚未交付过 SelectionModel，新增类型/readonly 输出不迁移运行中的已发布 API；
本轮不改变 protocol=2/schema=7、SDK/C++/ABI、IPC、依赖或工程格式。

B 应从上述行为独立冻结：对象无位段、定义多实例不猜选、side/位段差异、有序去重、
输入/输出不可变、构造/非法输入原子性、绑定/未绑定/跨快照、重复 origin 回显、
初始空状态、分叉/no-op 保留 forward、容量 1/边界淘汰、订阅变更/异常/重入/dispose。
定义候选的真实查询和纯计划宿主流程须在相应后续纵向单元验证，不能仅靠 R1 状态测试宣布实现。
消费者严格编译仅证明声明与当前公共类型相容，不证明运行时、GUI、Electron 或资源无泄漏。

---

### 6.6 M5 远端树契约（2026-10-14，契约已审/已冻结，C-73/C-74/C-75已独立复验关闭）

本节是M5-A-02a；§6.6.1–5固定6b03e1d正文已通过C审，B对应集合已冻结。
[契约声明](../web/contracts/m5-tree.d.ts)包含§6.6.6的C-74已审补充；旧声明审查基线保留于6b03e1d。
生产入口为@hier/viewmodel的TreeModel/TreeError及类型导出，已提供兼容可选的dataIssue/TreeDiagnosticIssue。
[实施计划](plans/M5-tree.md)记录运行时验证和交接；C-74/C-75均已获B复验及C关闭，见2026-10-15 REVIEW_LOG交接。
Selection沿用§6.5，整个M5仍未完成。
Electron连接、React挂载/键盘/ARIA及属性视图在M5-A-02b另给具体契约；本节只定义无宿主依赖的L6。

#### 6.6.1 职责、构造与公开入口

TreeModel借用同一份HierClient，保存这棵树已加载的分页前缀、展开意图及可见行。
SDK继续独占传输、请求合并/独立取消和complete缓存；树不另存一份通用查询缓存、不判断DFT业务。
每个模型固定一个snapshotId，不重绑；关闭面板释放它，关闭设计时宿主先释放模型再关闭SDK。
语义选择由SelectionModel独占；树命令包括reveal都不写选择、不设置DOM焦点或滚动位置。

```ts
interface TreeOptions { readonly showGenerateScopes?: boolean; readonly pageSize?: number; }
class TreeModel {
  constructor(client: HierClient, options?: TreeOptions);
  readonly snapshotId: SnapshotId;
  readonly showGenerateScopes: boolean;
  readonly rows: readonly TreeRow[];
  readonly rootState: TreePageState;
  readonly revealState: TreeRevealState;
  readonly disposed: boolean;
  loadRoots(): Promise<void>;
  setExpanded(row: RowId, expanded: boolean): Promise<void>;
  loadMore(row: RowId): Promise<void>;
  reload(row: RowId | null): Promise<void>;
  cancel(row: RowId | null): Promise<void>;
  setShowGenerateScopes(show: boolean): Promise<void>;
  reveal(ref: ObjectRef): Promise<void>;
  subscribe(listener: () => void): Unsubscribe;
  dispose(): void;
}
```

- 宿主先await client.ready，再构造树；options校验后读取client.snapshot并固定其snapshotId。
  构造不发查询、不登记SDK事件、不触发通知。未ready的client.snapshot错误原样抛出；不返回半初始化树。
  已关闭SDK仍可能有旧snapshot；其后查询明确失败，宿主负责关闭时释放树，不猜测SDK私有状态。
- showGenerateScopes缺省true；pageSize省略时直接使用SDK/Schema的PageLimit默认值（当前200），
  显式值用同一PageLimit验证器校验，不维护另一套整数范围。未知options字段忽略。
  按showGenerateScopes、pageSize顺序各探测/Get至多一次，允许继承getter，不枚举/读取扩展字段；
  两值捕获后再验证，显式undefined/null非法。访问器抛值为TreeError(invalid_options)，cause保留原值。
  options容器要求与§6.5记录相同；外部副作用不回滚。实例构造后不再读取原options。
- 所有命令参数为原始boolean/string或明确的null；不强转、不读取对象上的toString/valueOf。
  RowId是带名义标记的opaque string，只从本模型发布行取得；拒绝其它模型、过期/不可见行的ID。
  ref复用ObjectRef原语，不解析编码。参数非法原子拒绝，不取消已有合法任务。
- 相比§6.2早期void示意，setExpanded明确返回Promise<void>；其它异步命令也可await/catch。
  这是首次Tree API提案，无已发布实现需要迁移。参数/释放/重入错误均以拒绝Promise返回，
  constructor/subscribe仍同步抛错。每个Promise恰好结算一次；内部登记拒绝处理避免无人观察的后台拒绝，
  但调用方取得的原Promise仍保持拒绝。页面/定位任务失败或取消时，才按下述规则将任务错误投影到
  对应TreePageState/revealState；这两个状态不收集所有命令错误。参数/重入拒绝不改任务状态，
  观察者异常仅由负责命令的Promise返回、不把已成功页面或定位改为failed；dispose按§6.6.5清空状态。

#### 6.6.2 行投影与generate作用域

所有行都有只读id、parentId（可见父行或null）、depth（根为0）。发布数组、行、path、状态、
诊断data和completeness均为模型自有或SDK已有的深冻结值；不冻结调用方/Error对象。
旧值在后续翻页/重载/释放后仍有效。同一批状态先全部提交，再通知，getters不会观察到半批行。

| kind | 额外字段 | 含义 |
| --- | --- | --- |
| instance | instance: TreeInstance、expandable、expanded、children: TreePageState | TreeInstance为只读InstInfo；引用只取instance.ref，childCount由Core给出 |
| scope | owner: ObjectRef、scopePath: readonly string[]、label、expanded | owner为其实际父实例；scopePath为相对该实例的完整generate前缀，不提供ref/def或伪造InstInfo |
| status | owner: RowId或null、state: TreePageState | owner为分页父实例行，null表示roots；展示加载/错误/取消/后续页提示，不参与语义选择 |

- RowId在同一模型内按行身份稳定，跨模型不可互用；不按数组下标、label、pathText拼接碰撞键。
  实例身份为snapshot及原ref，scope身份为父实例及完整scopePath片段序列，status身份为分页父实例或roots。
  折叠/翻页/分组开关不改变同一身份ID。reload移除的行当前不可操作，重新出现同一身份时恢复原ID。
- Core children只含直接子实例，ancestors只含实例。已知直接父P和子C时，校验C.path以P.path
  为严格前缀；剩余路径的末段是C.name，中间段才投影为generate分组。逐段比较原值，
  不split(pathText)、ref或包含点/反斜杠的单段，不对Unicode归一化。数组实例的下标留在原段里。
- showGenerateScopes=false时，实例直接挂到父实例、保留Core分页顺序；为true时插入分组行，
  同一父实例/前缀只创建一个分组，跨页重复前缀合并。各层按首次出现顺序分组，组内保持Core顺序，
  不按label重新排序。新的分组默认展开；实例默认折叠，childCount=0的实例不可展开。
  非leaf初始children为idle/0；leaf依Core的childCount=0初始化为success/0/complete、无next且不展开。
  完全没有子实例的generate作用域无法从当前公开API枚举，不虚构空scope行，也不为显示它新增Core查询。
- setShowGenerateScopes只重投影已加载数据，保留实例/分组展开意图及稳定ID，不发Core请求。
  scope展开只显示已加载成员；分页始终归owner实例，不能拿scope的RowId/路径去调用children。
  因分组尚未完整加载，scope不宣称全量成员数；也不能以隐藏行数量当Core childCount。
- roots列表末尾或展开实例的已加载子树末尾，最多一个对应status行；depth为其owner行depth+1，
  roots status的depth为0，parentId与owner一致。只要idle/pending/failed/cancelled或有next便出现；
  success且无next且complete时消失。scope内没有独立分页status，父实例status始终可见，不被某个scope折叠遮掉。
  初始rootState=idle/loadedCount=0、revealState=idle，rows含一个roots status；dispose后rows为空。

#### 6.6.3 分页、展开、失败与重试

TreePageState包含status、loadedCount、可选next、可选completeness；failed/cancelled时必须有error，
其它状态没有error。TreeFailure是拥有自身数据的code/origin/message/data投影：SDK错误保留原字段，
本地错误origin=tree、data={}。请求Promise仍拒绝原HierError（含data），不换成“没有结果”。
TreeError的code为invalid_options/invalid_argument/invalid_row/disposed/cancelled/
inconsistent_reply/reentrant_change，message非空，访问器或观察者相关原异常保留cause。

- loadedCount只计已提交的直接子实例，排除scope/status/孙实例。next为Core的opaque Cursor，
  省略表示无后续页，不自行生成或算偏移。TreeCompleteness是权威Schema Complete的深只读投影，
  描述已取得的分页前缀；本单元合法回复只能complete，complete前缀有next仍不是全列表。
  无任何已提交回复时completeness省略；leaf按§6.6.2初始化为complete，合法空回复同样是complete。
- loadRoots只调用roots，第一次或failed/cancelled时尝试；成功后no-op，显式重取需reload(null)。
  roots无分页，保留Core顺序。一个列表同时最多一个在途请求，重复装载同一列表共享该次结算，
  不发第二个SDK调用、不重复追加；不同展开实例可以并行。SDK其它调用方仍有独立订阅与取消。
- setExpanded(instance,true)同步提交展开意图及其可见状态，并在首次未加载时取第一页；
  重复true不切换、不重复取页，若第一页在途则等待同一任务。已failed/cancelled的展开分支不隐式重试，
  返回当前错误；显式loadMore或reload才重试。已完成首批后只展示缓存，后续页由loadMore请求。
  leaf的true/false都是no-op。scope的true/false只改变本地展开意图。
- setExpanded(row,false)立即隐藏其后代并使其在途子树任务失效/取消，Promise不等待Core执行结束；
  已加载数据和后代展开意图保留，再展开不额外读取已完成页。被取消的在途列表保留成功前缀和待取cursor，
  status=cancelled，后代如果仍展开则显示重试status。所有合法外部命令先执行§6.6.4的reveal取消规则；
  随后scope折叠只取消其已知后代实例的请求，不取消独立手工发起的owner分页，
  因为那一页还可能含其它scope或直接子实例。由旧reveal独自发起的owner分页仍须先取消，
  保留已提交前缀及待取cursor、置cancelled，晚回复不提交；不能因owner在scope之外而豁免。
- loadMore只接受当前可见且展开的实例行：idle取首批，有next取该cursor，failed/cancelled重试先前未提交cursor；
  success且无next时no-op。scope/status行或折叠实例拒绝invalid_row。
  请求开始status=pending；成功才一次性追加，失败/取消保留已提交前缀及cursor，不清空前面的成功行。
- reload(null)重载roots并移除全部已加载子树；reload(instance)重载其children并移除旧子树。
  先使被替换子树请求失效、再清除页前缀并取第一页；实例自身展开意图不改变。
  保留按稳定身份保存的展开意图，新回复中的同一节点恢复原值；删除对象数据/请求/监听引用。
  当前可见的折叠实例可reload但不被自动展开；scope/status拒绝invalid_row。
- cancel(null)取消全部本模型任务；cancel(instance)取消该子树任务但不折叠它。无在途任务时不改变成功状态。
  不清已完成页、不关闭SDK、不取消其它SDK消费者。被取消调用拒绝TreeError(cancelled)，状态可重试。
- 当前§5.6及权威Schema将roots/children/ancestors/object的合法回复限定为Complete；
  不依赖index.ready，不触发全设计搜索，不订阅index事件或自动循环重试。
  partial（包括空结果）是非法方法回复：SDK以HierError(client)/protocol_error拒绝并关闭连接，
  树保留已提交前缀，将受影响的页面/定位任务置failed并投影该诊断，Promise仍保留原错误。
  不提供partial成功状态或TreeError(incomplete)，不绕过SDK校验。将来若扩展这些导航方法，
  须先审查Schema/SDK兼容方案，再扩展树类型/行为和独立冻结；不将当前不可达分支列作本轮验收。
  响应结构由SDK验证；跨页重复ref、循环/重复cursor、父子path不一致或完整终页数量与childCount不符，
  属无法安全投影的inconsistent_reply。坏页不提交，停止该列表并保留前缀，不能无限请求或静默吞项。

#### 6.6.4 reveal与最终意图

reveal接受ObjectRef，通过client.object(ref)取得真实所属实例（实例自身亦由该结果确定），
再调用ancestors(inst)取得从root到直接父实例的链。DefRef和非法引用的错误由Core传回，
不把同定义第一个occurrence自动选中，不解析引用。调用方要先明确选择定义候选。

1. 发布revealState={status:pending,ref}，必要时加载roots；依Core祖先链逐级定位已加载项，
   目标尚未在当前前缀时按next逐页请求，直到找到需要的直接子实例。不能只查第一页，
   也不能用ancestors返回项直接伪装成已加载兄弟列表。已经加载的前缀复用，不重复取页。
2. 打开目标的实例祖先和（当前显示时）必要scope，使目标实例行可见；不展开目标自身。
   完成时revealState={status:success,ref,rowId}，Promise resolve；rowId是所属实例行，
   端口/信号/过程/寄存器的原ref仍保留在revealState.ref供调用方自行处理。
   只发布可见行定位结果，不更改Selection或DOM焦点。
3. 一个模型同时一个active reveal。较新的reveal（即使ref相同）取消旧reveal；所有其它已验证的
   外部树命令也取消active reveal，即使该命令最终为no-op。错误参数不会影响旧任务。
   内部为reveal执行的翻页/展开不当作新外部意图。该规则让用户的折叠/分页/显示模式优先于早先定位。
4. 取消旧reveal时，中止由它独自启动且尚未结束的SDK请求；它等待的原有手工页面请求继续，
   除非折叠/cancel/reload本来也要求取消该子树。新外部命令在取消旧reveal之后才决定复用/发起新请求。
   例如折叠scope G：旧reveal发起的owner P分页被取消，P页保留前缀/cursor并置cancelled；
   若该页由更早的手工命令发起，P保持pending，合法回复仍提交，G保持折叠，旧reveal不再展开任何行。
   两者都先令旧reveal拒绝cancelled并置revealState=cancelled。只撤销本模型相应SDK订阅，
   另一个SDK消费者仍可接收回复；是否发送wire cancel由SDK最后一个订阅规则决定。
   成功提交过的页/展开不回滚；旧回包绝不再展开、改新revealState或发布success。
5. 每个await之后及提交/发起下一请求前检查本模型生命周期、任务代次与展开意图，
   即便SDK响应已结算而任务continuation尚未执行，也不能绕过失效检查。
6. object/ancestors/roots/children只消费SDK接受的complete回复；非法partial遵循§6.6.3的protocol_error路径，
   不继续定位或发下一请求。目标已在取得的前缀时可以成功，不要求耗尽无关兄弟的后续页。
   revealState=failed时保留诊断。无next且耗尽后仍缺Core报告的祖先/目标、祖先循环或重复ref则为inconsistent_reply。
   SDK not_found/bad_request等仍原样拒绝。失败保留已加载数据，不能跳到相似名字的行。

#### 6.6.5 通知、异常、释放及独立冻结

- subscribe仅登记同步listener，不回放；每次注册独立、unsubscribe幂等。本批按登记顺序调用，
  中途取消的后续登记跳过，新登记下批才调用；不得以函数相等合并两次注册。
  listener可读全部getters/订退阅/dispose，所有树命令在通知期间一律拒绝reentrant_change，包含可能的no-op。
  dispose优先于重入。listener返回的Promise不由模型await，异步listener须自行处理其异步工作。
- 每次可观察状态转换至多一批通知；无状态变化不通知。分页pending及settled各一批，
  多个列表被一次折叠/取消影响时原子更新后通知一批。所有listener接收同一已提交状态。
  捕获同步抛值并继续其它有效登记，不撤销已提交结果。通知错误归属触发这次状态转换的命令，
  在该命令最终结算时拒绝AggregateError，errors按发生顺序保存原抛值；如果查询本身也失败，
  以AggregateError.cause保留该错误，TreePageState/revealState仍如实显示查询失败。
  查询成功而仅listener抛错时，状态保持success且无error，AggregateError只在命令Promise上可观察；
  通知内重入拒绝亦不伪造页面/定位失败，调用方须处理相应Promise。
  查询不得因pending通知的异常被遗留；已经开始的任务仍须完成/取消并结算。
- dispose幂等，无通知，立即标disposed，取消本模型SDK订阅、清空行/注册/页面对象，rootState恢复idle/0，
  revealState恢复idle；snapshotId与分组模式仍可读。全部未结算命令拒绝TreeError(disposed)，
  高于取消/查询/观察者错误，同一任务已有的错误放cause保留。释放期间不产生第二次状态发布。
  旧unsubscribe幂等，旧冻结值有效；getters仍可读，其余调用优先disposed，subscribe同步抛。
- 不在树模型持有React组件、DOM、Electron、任意源码路径或业务store；不提供生产私有测试hook。
  B可以用真实HierClient和公开Transport可控回复冻结读取顺序/晚回包/取消，另用真实Core分页fixture验证链路。
  独立冻结至少包括：多顶层、leaf、数组/escaped路径、跨页scope、隐藏/切换分组、后续页reveal，
  展开→折叠→展开、两次reveal交错、四导航方法合法complete及非法partial的协议失败投影、
  坏cursor/页原子拒绝、错误重试、scope折叠时reveal发起页与原有手工页的成对取消用例、
  SDK共享消费者不被取消、成功后观察者抛错/重入拒绝/释放清空、查询和通知双重错误、同设计重开。
  类型消费者不代替这些运行时或真实UI验收。

#### 6.6.6 诊断读取边界补充（2026-10-14，C-74已独立复验关闭）

本节明确诊断访问器失败和读取期间生命周期规则；固定dfcda67获C认可，B冻结68项/14类型，A已实现。
C-73/C-74已关闭；其验证见[M5-tree-c74](plans/M5-tree-c74.md)。
C-75按既有所有权规则修复函数属性别名，已获独立复验关闭，记录见[M5-tree-c75](plans/M5-tree-c75.md)。
本节为§6.6.3的data字段保留规则补充“无法读取”的显式例外，并定义读取阶段的命令入口；
可读取数据、原请求错误身份、分页/通知/取消/释放承诺保持。TreeFailure增加以下可选字段：

```ts
interface TreeDiagnosticIssue {
  readonly code: "data_read_failed";
  readonly operation: "inspect" | "enumerate" | "read";
  readonly path: readonly string[];
}
interface TreeFailure {
  // 既有code/origin/message/data字段保持。
  readonly dataIssue?: TreeDiagnosticIssue;
}
```

**诊断数据与读取失败。** HierError.data允许普通访问器，不能因其在TypeScript中只读而当作
无副作用的深不可变值。正常副本仍保留所有可枚举自有字符串字段、数组长度/空洞及共享/循环关系，
每个源对象只捕获一次；不读取符号或不可枚举字段的值，不调用toJSON/valueOf/toString。
成功时data为自有深冻结副本，dataIssue省略；正常空data也省略dataIssue，不把undefined作为“省略”。

捕获对源对象的探测、枚举和字段Get均可能抛错或执行调用方代码。
对当前源对象枚举一次自有键，按其键顺序探测可枚举性，再对可枚举字符串字段Get至多一次；
数组长度只读取一次，每个共享源对象沿首次发现的路径登记。下列操作分别归类：

| operation | 外部操作 | path含义 |
| --- | --- | --- |
| inspect | 判断数组、探测字段自身描述符/可枚举性 | 当前对象路径；探测字段时包含该字段键 |
| enumerate | 获取自有键集合 | 被枚举对象路径 |
| read | 读取data、数组length或可枚举字段值 | data本身为[]；其它为相对data的字段路径，length也作为一段 |

路径是字符串键数组，数组下标为字符串，点/斜杠/空字符串键不拆分、不归一化。
首次读取失败即停止后续读取，放弃整份未发布副本；data发布为冻结空对象，
dataIssue发布为自有深冻结的`{code:"data_read_failed",operation,path}`。
它明确表示原诊断不可读取，不能解释成原SDK返回了空data；code/origin/message仍来自原HierError。
路径和操作提供定位信息，不把任意抛值放进发布状态，也不再检查/强转抛值来拼错误消息，
避免在错误处理期间再次执行其getter/Proxy/toString。原HierError及其data不改写、不冻结，
命令仍拒绝原HierError；读取失败不能替换成inconsistent_reply，也不产生独立后台拒绝。

**读取阶段与重入。** 进入诊断捕获前，原任务错误已登记到负责命令，但尚不发布失败状态，
任务仍保留在可释放的活动集合中。捕获期间同步getters只看到上一批完整状态；
subscribe/unsubscribe及dispose可调用，所有树命令（含no-op/非法参数入口）拒绝reentrant_change，
不读取其参数、不取消reveal、不发查询、不改状态。保护只作用于本模型，退出时无论成功/抛错均恢复；
其它模型独立。新订阅在后续实际通知开始时按§6.6.5的有效注册规则处理。

**释放与提交。** 每次外部操作返回或抛错后先检查disposed，释放优先于读取失败和重入。
getter内dispose立即清空行/页面/reveal/注册，无通知；全部未结算命令按§6.6.5拒绝disposed，
cause保留进入读取前已登记的原任务错误（已有观察者错误仍按原规则聚合）。
从该次外部操作返回后停止读取，不再访问后续getter、不写dataIssue、不重新发布failed/cancelled。
即使getter在dispose后又抛值，也不替换已按释放规则结算的命令或复活状态。

副本完整准备后，必须再次核验model未释放、任务仍active且仍是对应页面/reveal的当前任务，
然后才移除活动任务、同步提交状态并通知。诊断准备本身没有通知；无dispose时失败仅发布一批settled，
所有等待同一页的命令仍恰好结算一次，观察者异常沿§6.6.5聚合并以原查询错误为cause。
取消、晚回复、原前缀/cursor、共享SDK订阅及成功状态通知的既有行为保持。

**兼容与独立验收。** 这是L6只读API的可选字段扩展，旧字段/旧TreeFailure对象继续有效，
不新增TreeErrorCode，不改变SDK、wire/IPC、Schema、C++ ABI或工程格式。
C审/B冻至少补充：roots/children/reveal的读取抛错、空抛值及嵌套路径、正常访问器正对照，
探测/枚举Proxy抛错、读取中dispose（含dispose后抛错）、读取期间命令重入/订退阅、
原错误身份/诊断字段、旧值稳定、后续字段不再读取、无未处理拒绝、以及原17/180/693保持。
声明编译通过不等于该边界已实现，不用作者探针替代独立冻结。

### 6.7 M5 树视图（2026-10-19，生产实现待独立验收）

§6.7主体固定b753daa已获C通过、C-76已关闭；B的140 UI、46类型及L02 48错误输入已冻结。
生产HierarchyTree、公开类型/出口/CSS已实现，见[生产计划](plans/M5-hierarchy-tree-production.md)。
A使用原断言实际执行；当前非法props的React开发重试错误计数存在夹具差异，原门禁不放宽，交B定向处理。
2026-10-19 C53已正式关闭生产修复896027e的C-101/C-102，B53九例独立通过；原140仍89/51，完整树/M5验收未完成。
L06/L09–11强观察、实际读屏与跨平台要求保持；不以A实施或DOM/AX通过宣告完整95条件/M5验收。
树UI对照见[参考实验](M5_TREE_UI_COMPARISON.md)。窗口与滚动沿TanStack Virtual，树状态仍归TreeModel。
A51核对§6.14的views入口不得依赖ReactDOM约束后，采用既有实验锁链的`@tanstack/virtual-core` 3.19.4，
以局部React生命周期绑定连接其窗口算法；不使用静态导入ReactDOM/flushSync的react-virtual封装。
此依赖边界修正不改变下列公开行为/默认值，不引入第二套树状态；React仍为原有peer。

#### 6.7.1 入口、边界与所有权

```ts
type TreeViewCommand = "loadRoots" | "setExpanded" | "loadMore" | "cancel" | "select";
interface TreeViewCommandFailure {
  readonly command: TreeViewCommand;
  readonly rowId: RowId | null;
  readonly error: unknown;
}
interface HierarchyTreeProps {
  readonly tree: TreeModel;
  readonly selection: SelectionModel;
  readonly ariaLabel: string;
  readonly height: number;
  readonly rowHeight?: number; // default 28 CSS pixels
  readonly overscan?: number; // default 2 rows per side
  readonly className?: string;
  readonly onCommandError?: (failure: TreeViewCommandFailure) => void;
}
function HierarchyTree(props: HierarchyTreeProps): ReactElement;
```

- 宿主拥有 client、tree、selection；先 ready、构造同 snapshotId 的两个模型，再挂载。
  无 snapshotId 的选择模型不接受；释放的模型、快照不一致或非法 props 在 render 同步抛
  TypeError，交宿主 React error boundary，且不订阅/不执行模型命令。
  ariaLabel 要求非空白字符串；height/rowHeight 为有限正数；overscan 为有限非负整数。
  省略可选尺寸使用上述默认值，显式 undefined 同省略；其他类型不转换。
  TS 的 exactOptionalPropertyTypes 提供更窄的静态输入。宽度跟随容器，内容允许横向滚动。
- 模型是借用实例。L7 只依赖 L6/协议类型和 React/Virtual，不直接查 SDK、解析引用或路径，
  不重新维护 roots/children/展开图、分页 cursor、请求缓存或 Selection 历史。
  可缓存当前 rows 的展示索引、DOM 标识、焦点 RowId 和滚动信息；模型发布新值时重建相应投影。
  RowId 是不透明键，不能以实例名、数组下标或序列化路径代替；每个挂载实例的 DOM ID 必须隔离。
- 用同步外部 store 订阅读取已提交模型状态；订阅回调只安排渲染，不在 L6 通知期间执行命令。
  挂载本身不发查询；宿主可显式 loadRoots，也可让用户激活初始行。新建活 TreeModel 的正常初始值是
  rootState={status:"idle",loadedCount:0}，rows 含一条真实 roots status（owner=null、state.status=idle）。
  组件保留该行，显示“加载层次”；首次进入树可聚焦该行，点击/Enter/Space 仅调用一次 loadRoots，
  随后按§6.7.3显示 pending 和结算状态。不以“rows为空”为首次加载条件，不隐藏该 status，
  不新增独立加载按钮或伪造 TreeRow/RowId，不要求宿主预加载。StrictMode挂载重放仍为零查询。
  根查询成功且结果为空时，rows 为空，显示“无顶层实例”；不显示可重试 status、不自动重试。
- 替换模型需作为一次新视图会话：旧订阅解绑、清除本地焦点/滚动/命令反馈，再订阅新实例。
  卸载不 dispose/cancel 借用模型，不撤销宿主或其它视图的任务；只解绑订阅和丢弃本挂载的迟到反馈。
  宿主关闭顺序是先卸载所有借用视图，再 dispose 模型，再 dispose client。
  重新挂载读取当前模型状态；不能让旧挂载的 Promise 结算改新挂载或调用新回调。
  React StrictMode 的挂载/清理重放不得额外发查询、改变模型状态或遗留重复订阅。

#### 6.7.2 行、语义选择、焦点与定位

- 严格按 TreeModel.rows 顺序和 depth 显示。实例标签取 instance.name，scope 取 label；
  不把 pathText 拆成层次。只有实例行可产生 Selection；一次普通点击或 Enter/Space 以
  origin=tree、匹配 snapshotId、一个 `{ref: instance.ref}` 替换选择。对实例的展开控件
  只调用 setExpanded，不能顺带更改选择。scope 点击/Enter/Space 只开合；status 只执行页动作。
- 焦点与语义选择分离。方向键、折叠、滚动、reveal、外部 Selection 更新不写选择历史；
  单击行会聚焦该行，外部选择/外部 reveal 不抢走树以外的 DOM 焦点。
  多对象外部选择按直接匹配的实例 ref 高亮；若当前成功 reveal 的 ref 匹配选择项，额外高亮其
  owner rowId，但保留原端口/信号 ref、bits、side。定义选择不猜 occurrence，也不发隐式查询。
  UI 本轮不提供范围/多选编辑；Ctrl/Shift 不引入另一套选择规则，普通选择仍替换为单项。
- 自动“外部选择 → reveal”属于宿主导航策略，只能有一个协调者。组件只展示模型状态；
  宿主需要联动时在通知栈之后调用 tree.reveal，不能让多个视图订阅后竞争发起同一定位。
  新 success reveal 可滚动到其可见 rowId（最近边缘对齐），不改变语义选择和已有焦点。
  挂载时已有 success 且 rowId 可见可滚动一次；失败/取消不滚到旧目标、不发自动重试。
- 首次进入树时优先当前可见的已选实例，否则第一行；后续进入恢复仍有效的本地焦点。
  行仍可见时保留 RowId；行因折叠/分组变化/重载消失时沿旧 parentId 链找最近可见祖先，
  再退到第一行；没有行则焦点留树容器。回退不改 Selection。

| 按键 | 行为（不改变语义选择，除明确激活） |
| --- | --- |
| Down / Up | 当前可见行的下一/上一行，端点保持；不自动展开/分页 |
| Home / End | 当前可见第一/最后一行，不请求尚未加载的页 |
| Right | 可展开且关闭时展开；已打开则移到其第一可见子行；无子行/leaf 保持 |
| Left | 已展开实例/scope 折叠；否则移到可见父行，根保持 |
| Enter / Space | 实例选中；scope 开合；status 执行下述页动作 |
| Tab / Shift+Tab | 按浏览器顺序离开/进入树，不困住键盘焦点 |

#### 6.7.3 页动作、同步/异步结算与错误

status 的 owner=null 表示 roots，否则为实例的页。点击、Enter、Space 均执行同一映射；
一次激活只转发一次模型命令，不同时触发行和内部控件的重复处理：

| status 状态 | 可读动作标签 | owner=null（roots） | owner为实例RowId |
| --- | --- | --- | --- |
| idle | 根为“加载层次”，实例页为“加载子实例” | loadRoots() | loadMore(owner) |
| pending | “加载中，取消” | cancel(null) | cancel(owner) |
| failed | “加载失败，重试”，同时展示稳定code/message | loadRoots() | loadMore(owner) |
| cancelled | “已取消，重试”，保留取消诊断 | loadRoots() | loadMore(owner) |
| success且有next | “加载更多” | 现有roots不分页，此组合不可达 | loadMore(owner) |

success且无next时L6不发布status行；根空成功展示§6.7.1的非操作性空态。
页动作保留已成功前缀，只转发模型命令；不绕过 L6 的取消、共享等待者、参数或完整性规则。

**错误事件来源（B-VIEW-Q02）：** `TreeViewCommandFailure.rowId` 总是捕获动作启动时的
触发行 id，不是转发给模型的 owner 参数。`command` 是实际调用的方法名，二者在调用之前捕获。
异步结算时即使该行已消失、焦点移动或同一模型reload，也保留启动时的 RowId；不改指向其它行。

| 触发动作 | 模型调用 | failure.command | failure.rowId |
| --- | --- | --- | --- |
| 实例行选择 | selection.select(...) | select | 该实例行id |
| 实例开合（展开控件或方向键）；scope开合 | tree.setExpanded(row.id, expanded) | setExpanded | 该实例或scope行id |
| roots status首次加载或重试 | tree.loadRoots() | loadRoots | 该roots status.id（不是null） |
| 实例status首次加载、继续页或重试 | tree.loadMore(status.owner) | loadMore | 该status.id（不是owner） |
| 任意pending status取消 | tree.cancel(status.owner) | cancel | 该status.id（根亦非null） |

仅移动焦点不产生模型命令或失败事件。本版不提供独立无行按钮，所有上述事件rowId均非null；
声明中的 `RowId|null` 保留不变，null表示无触发行，但本版没有可产生该值的交互入口。
不得以null替代已消失的触发行。卸载/更换模型的反馈抑制优先于保留来源，规则如下。

**统一结算通道（B-VIEW-Q03）：**

- 事件处理在同一调用栈中调用对应模型方法，并捕获其同步抛值；同步正常返回void即为成功。
  如果返回Promise，立即为该Promise登记结算/拒绝处理。SelectionModel.select保持同步void，
  不为统一反馈改变L6签名或延后实际选择提交；树命令继续返回Promise。
- 同步抛值和Promise拒绝都以原值作为 `error`，不包裹、不展开AggregateError、不以undefined表示
  “没有错误”。同步失败的反馈安排在当前调用栈退出后的微任务；异步失败在Promise拒绝处理时反馈。
  两者均在模型通知结束后，且反馈前复查发起动作的挂载/模型会话仍有效。
  select观察者抛错时，已提交的Selection/历史和其他有效listener通知保持，不回滚、不重试select；
  原AggregateError及其errors身份保留。该select失败在挂载/会话仍有效且有回调时恰好调用一次
  onCommandError；无回调时显示本地错误。正常同步select不发错误事件。
- 每个失败命令最多反馈一次，使用 `{command,rowId,error}` 调用 onCommandError；没有回调也必须
  有可见错误区域。UI 不以成功页/已选状态推断命令一定成功（观察者可能抛错）。
  cancelled/disposed 的预期生命周期结算可只显示相应模型状态，不重复全局错误提示；仍在本挂载有效时
  回调可收到原值。页面诊断只读 L6 发布的 code/message；命令独有的 unknown 使用固定“操作失败”，
  不读其 Error.message/code/getter，不运行 JSON.stringify/toString；完整原值由回调交宿主诊断。
- 上述回调及本地错误更新均遵循统一反馈时序；不让select抛值直接逃出DOM事件处理而绕过反馈。
  回调同步抛错时（无论原命令同步失败还是Promise拒绝），
  下一 render 抛 AggregateError([原命令错误, 回调抛值]) 给宿主 error boundary，不吞掉或回滚模型。
  回调的类型是同步 void；如返回 Promise，其异步错误归回调自身处理，与 L6 listener 约定一致。
  卸载/更换会话后仍消费旧 Promise 拒绝，并丢弃已排队的同步失败反馈；不发布本地错误、滚动、聚焦，
  不调用旧/新 onCommandError，不将旧回调异常安排为新会话render错误。

#### 6.7.4 虚拟化、可访问性与独立验收

- 使用固定行高窗口化，height/rowHeight/overscan 明确可测；当前活动行即使滚出窗口也保留 DOM，
  确保 aria-activedescendant 不悬空。DOM 焦点采用单个 tree 容器，不让虚拟行各占 Tab 位。
  aria-label 来自 ariaLabel；各行 role=treeitem、aria-level=depth+1，只有可展开行有 aria-expanded。
  只有实例有 aria-selected；支持显示外部多项选择，tree 标明 aria-multiselectable=true。
- 根据当前投影设置 aria-posinset；拥有该组的实例页尚有 next、未成功或仍 pending 时，
  aria-setsize=-1，包括可能被后续页补充的 generate scope 内部兄弟；不得用已加载前缀冒充总数。
  页已完整时使用当前投影的兄弟数（包括可导航 status 行如有）。pending 状态有可读文本，
  失败/取消有明确操作标签；错误区域可被辅助技术发现。不得仅靠颜色表达焦点、选择或失败。
- 先依据本节冻结真实 React/浏览器测试，再实现 L7。B 至少覆盖三类行、根空/失败/重试、
  同名/escaped/数组路径、跨页 scope、模式切换、reveal 页外目标/端口 owner、外部多项/定义选择、
  键盘端点/Tab/焦点回退/页动作、可见行与 DOM 上界、实例间 DOM ID 隔离、StrictMode、
  卸载重挂/模型替换/晚失败/取消、回调抛错和公共类型消费者。
  原型的 12 个场景只是 A 对照证据，不是本节 B 冻结集合；其缺口见对照报告。
  本轮补冻点：未预加载的真实roots idle status、点击/Enter/Space各一次首次加载、StrictMode零查询、
  pending/空成功/失败/取消重试；上表五类来源行id与owner区分、结算前触发行消失仍保留id；
  合法select的同步成功和观察者同步失败、原AggregateError身份/已提交选择、微任务反馈与一次回调、
  无回调可见错误、回调再抛的聚合顺序、反馈前卸载/换模型的抑制。准备矩阵需由B据受审文本更新。
- DOM 属性检查不等于读屏合规；生产交付须核浏览器可访问性树及实际辅助技术下的层次/活动项公告。
  本轮固定宽树/深树测试没有给出 M7 绝对性能预算、任意深度安全性或真实大设计结论。
  本节只新增组件提案，不改变协议、Schema、Core ABI、工程文件或已验收 L6 契约；Electron
  main/preload/renderer 的绑定/关闭契约仍作为后续子单元单独交审。

### 6.8 M5 Electron 会话与传输契约（B72宿主有限验收通过/C72生产接受）

本节属于既定 M5-A-02b；[执行计划](plans/M5-electron-contract.md)记录状态。
§6.7 固定 b753daa 已获 C 通过、C-76 已关闭；其正文保持原字节，当前实施状态见该节。
本节开始时B已冻结24项C-76专项；后续140 UI及L02交付见树生产计划。本节不依赖视图实现，不宣称 Electron 已运行。
2026-10-16 cycle4状态：固定f936a33的renderer修复已获B独立复验及C审查通过，C正式关闭C-82/C-83。
B补冻BER40/本id提前故障6项并关闭BER-Q01～03；原99/25/12及16类型保持，见[门禁收尾计划](plans/M5-renderer-gate-closeout.md)。
A71宿主生产0861785已获B72 main25/preload10/类型16/文本15/Core1/真实E2E1有限验收及C72生产接受。
A72原样导入B的E2E启动/退出/完成判据修订，标准真实Electron入口实际通过；历史失败保留。
见[生产计划](plans/M5-electron-host-production.md)，不代表demo或整个M5已完成。
A70的Node工厂与包内私有文本通道共用同一子进程实现，分帧后先校验再投影原对象或原文本，不经JSON重序列化生成转发帧；见[执行计划](plans/M5-process-text-transport.md)。私有文本入口不在package exports中；Node/Core见证与后续真实Electron验收分别记账。

#### 6.8.1 入口与唯一所有者

新增入口提案分别是 `@hier/client/electron/main`、`/preload`、`/renderer`；
[可编译声明](../web/contracts/electron/README.md)不进入生产包。renderer与main/preload子入口已实现；主入口仍保持浏览器边界。
主入口与 renderer 入口不导入 Node/Electron；main 可用 Node/Electron，preload 只用 Electron
允许的沙箱 preload 能力。生产分层门禁按具体入口放行，不整体豁免 client。

- main：`createElectronSession({webContents, documentUrl, process}) → ElectronSession`。
  process 直接复用已交付 `ProcessTransportOptions`；仅可信宿主提供 command/args/cwd/env，
  renderer 的连接请求不携带这些值。返回只读 id、`exited: Promise<ProcessExit>`、幂等 close。
- preload：`exposeElectronBridge(apiKey)`，在当前主文档安装一次命名桥；
  apiKey 必须是非空字符串，不能覆盖已存在的窗口属性；无效参数/重复安装抛 TypeError，
  失败不遗留监听。子 frame 禁止安装。宿主启用 contextIsolation=true、nodeIntegration=false、sandbox=true。
- renderer：`connectElectronTransport(bridge): Promise<Transport>`。
  只领取已配置会话，不打开文件、不启动任意程序、不创建 SDK。成功后由宿主创建一个 HierClient，
  await ready 后创建共享 TreeModel/SelectionModel，再挂载借用视图。
  连接没有可领取会话以 not_ready/client 拒绝；同一会话第二次领取以 bad_request/client 拒绝，
  不关闭第一个连接。失败后可对后来新建的会话重试；关闭的 Transport/SDK 从不复活。
  bridge 必须包含声明中的函数和 version；形状错误以 bad_request/client 拒绝且不发 IPC，
  结构合法但 version 不同以 protocol_mismatch/client 拒绝。

main 独占一个子进程；renderer 独占该会话的一个 SDK。面板借用模型，不拥有 Transport。
main 不建立第二个 SDK/请求表/缓存，不解释路径、分页、选择或 DFT 业务规则。
对象地址和 snapshot 来自原 Core hello；sessionId 只关联 IPC 生命周期，不替换 SnapshotId。
本版一份 webContents 同时至多一份设计会话，不提供多窗口共享同一进程。

#### 6.8.2 文档绑定与首次领取

createElectronSession 在配置验证完成后立即启动子进程，与 Node 入口一样允许 renderer 晚连接。
webContents 必须存活，documentUrl 是宿主批准的完整绝对 URL，必须与创建时 getURL() 完全一致；
捕获当前 mainFrame 的身份。无效配置以 bad_request/client 同步失败，不启动进程或注册残余监听。
同 webContents 的上一进程尚未完成 exited 时拒绝创建，不隐式关闭/替换旧会话。
新会话分配从不复用的随机 id；闭合旧会话可保留一个有界终态记录，直到新建或 webContents 销毁，
以支持进程先退出、renderer 后领取时明确得到关闭结果。每份 webContents 最多一条记录。

每个 main IPC 入口检查 event.sender 就是该 webContents，senderFrame 非空且为捕获的 mainFrame，
当前文档仍匹配批准 URL；对 start/send/close 还核对 sessionId 和已领取身份。
其它窗口、子 frame、过期文档、未知/旧 sessionId 不得查询或关闭当前会话。
无权限 connect 返回通用 bad_request/client，不透露别的窗口会话信息；无权限单向消息直接丢弃。
授权会话内的非法包则关闭该会话并提供 invalid_ipc_frame 诊断，不能静默丢掉合法请求的错误。

main 在创建时安装生命周期监听。主 frame 开始任何导航（包括同文档导航）、renderer 消失或
webContents 销毁都使会话终止；导航后即使 URL 相同也必须由宿主显式新建会话。
这避免拿相同 webContents/id/URL 给新文档继承旧权限；demo 固定布局不依靠 hash 路由维持会话。
旧的关闭通知、清理回调只能操作自己捕获的会话，不得删除或关闭后来新建的记录。
共享 IPC 监听由适配模块统一注册/按需回收，只移除自身 handler，不能 removeAllListeners 清空宿主监听。

#### 6.8.3 首帧、帧表示与公开 Transport 行为

连接按以下顺序进行，不依靠定时 sleep 或 renderer 恰好先启动：

1. main 启动进程，复用 §5.6.5 的首绑等待：原始顺序、256 完整帧/4 MiB 原始 JSON 字节，
   含未完成帧且不含分隔符。首个交付前关闭/溢出清空内容并保存原因。
2. preload 先安装专用事件接收器，再发起 connect 领取。main 返回 id，尚不订阅进程消息输出；
   此时若进程已关闭，允许唯一领取，返回 id 并异步送出保存的关闭原因。
3. renderer 工厂安装本地消息/关闭状态后返回 Transport。第一次 onMessage 取得唯一接收权，
   在订阅返回后的微任务发出 start；main 此后才订阅进程消息，按原顺序转发。
   重复 start 幂等；第二次 onMessage 仍按 §5.6.5 抛 bad_request，退订不恢复接收权。
4. 转发后的消息仍在 renderer 后续微任务投递；每次执行前检查关闭/退订/当前代次。
   main 观察到关闭便停止后续转发；renderer 已观察到关闭则丢弃尚未投递的帧。
   尚未跨进程到达的关闭不能追溯撤销已执行的 handler；不声称两个进程的同时性。

main 首绑前的缓冲复用既有进程收件箱；renderer 收到文本后，在自身首次实际 handler 投递前
另按 §5.6.5 限制 256 帧/4 MiB（文本 UTF-8 字节数，无分隔符），超限同样关闭并保存
prebind_buffer_overflow。共享收件箱机制移到无 Node 依赖的内部模块，不复制业务缓存。
这两处各自约束已收到的数据，不声称跨进程总缓存/IPC 系统队列或堆峰值只有 4 MiB。
preload 不另存 hello 队列，renderer 首绑前 main 不发送 frame；closed 可在 connect 结果前到达，
工厂须保存首次关闭，不能丢失或先成功 ready。合法claim确认id后，若该id已关闭，工厂返回已关闭的Transport；
晚onClose异步得到原首因（包括正常undefined），SDK ready以transport_closed拒绝，不重播hello或先发布ready。
释放后排队的回调取消；显式 close 不等待 main 回复便关闭本地 Transport、通知本地订阅，
并向 main 发一次 close。已关闭时 send 优先抛 transport_closed；未获得接收权时抛 not_ready。
closed DTO可包含其它合法code/origin；onClose保持原首因，send仍按终态分类为transport_closed/transport，
不把业务诊断作为send错误码，不改变合法connect失败或普通Core响应错误。
所有通知异步、onClose 晚注册得到保存的原因、独立退订、第二个接收者拒绝等均沿用 §5.6.5。
一次 connect 只容纳自己领取的 id；其它 id 的事件丢弃，不把旧关闭当新连接失败。
此隔离同样适用于claim确认前的交错；本id提前非法frame仍须拒绝，不能以全部丢弃提前事件绕过校验。
sessionId在renderer是opaque string，不另加UUID或非空限制；main不复用id及文档/connectionId绑定责任不变。

**IPC 携带原始 JSON 文本，不发送已解析 Core 对象。** 原文本是单个完整 NDJSON 内容，去掉 LF/CRLF
分隔符，保留其它字节解码后的文本。main 仍执行已有 UTF-8、JSON、重复键、Unicode 和通用帧数字检查。
renderer 用同一内部文本解码器恢复 frame 和 WireNumberEvidence，再交 HierClient 按具体方法验证。
合法IPC外壳中的坏原JSON按transport_closed/transport、reason=invalid_frame关闭且零交付；
坏IPC外壳仍使用invalid_ipc_frame。合法外壳内json字符串含字面CR/LF属于坏单帧，
同样以invalid_frame拒绝且零Core写入（B71-HOST-Q01已由B72关闭，C72接受）。
SDK具体方法/结果的protocol_error校验保持在SDK层。
不以 JSON.stringify(parsedFrame) 代替原文；它会抹掉被 IEEE-754 舍入的非整数证据。
同一证据只存在于当前进程解码结果的 WeakMap 中；它不是可结构化克隆的协议字段。
分隔/原字节计数和子进程控制仍在 Node 层；纯文本检查/数字证据逻辑提取为 client 内部共享代码，
不另写 Electron 专用解析器，也不新增公开“跳过验证”接口。

renderer send 复用 owning JSON snapshot/Unicode 校验后编码请求，preload 只发固定通道。
main 对 json 的类型、单帧（不得含字面 CR/LF）、JSON 对象与现有 ClientFrame 生成验证器作边界校验；
合法文本按一条 NDJSON 写入同一进程。方法参数、默认值、snapshot、取消和结果语义仍由 SDK/Core 判断。
main 不重写 id、合并请求、生成假 hello 或把命令转成 shell 字符串。
已开始转发后的合法大响应不套用首绑 4 MiB 限制；IPC 吞吐/堆峰值与 M7 资源 SLA 仍需另测。

#### 6.8.4 IPC 版本、预加载桥与错误

桥版本固定 1，与 protocol=2/schema=7 不同。通道固定为 `hier:bridge:connect`（invoke）、
`hier:bridge:start`、`hier:bridge:send`、`hier:bridge:close`（单向）及 `hier:bridge:event`（main→preload）。
preload 为每次 connect 分配不复用的随机 connectionId，参数为 `{version:1,connectionId}`；
其它请求为 `{version:1,connectionId,sessionId}`，send 再带 `json:string`。
main 首次领取时绑定 connectionId，后续消息必须同时匹配它和文档/sessionId；它用于登记关联，不代替来源验证。
main→preload 的外层为 `{connectionId,event}`，事件本身按
[bridge 声明](../web/contracts/electron/bridge.d.ts) 是 frame 或 closed；未知 kind/字段类型/版本
在本连接上产生 transport_closed/transport，data.reason=invalid_ipc_frame，不交 SDK 当 Core 帧。
额外未知字段忽略；不支持版本协商或自动降级。connect 版本不符返回 protocol_mismatch/client，
不领取或关闭现存会话。renderer 工厂也先验证 bridge.version，错误时不发 connect。

contextBridge 只暴露声明里的 version/connect/start/send/close/release，不暴露 Electron event、
ipcRenderer、通用 channel、Node 句柄或任意文件读取。connect 的回调在发送请求之前安装；
失败时立即移除对应登记，成功后该登记按 sessionId 绑定。外层 connectionId 在 preload 内路由，保证 invoke 结果前的 closed
也只到达发起本次领取的登记；它不作为 renderer 的公开可写参数。
release 只清理本地事件回调且幂等，不关闭进程；
Transport 的关闭路径先发 close（若需要），再 release，避免只退订留下进程。
同一文档的多个 connect 调用按各自登记隔离；失败/释放第二次领取不能移除第一次的回调。
同一 id 不能被后来的失败调用覆盖。实现不能用“最后一个全局 callback”存放这些登记。

connect 成功返回 `{ok:true,version:1,sessionId}`，失败返回 `{ok:false,error}`。
preload 捕获 invoke 拒绝并转成 transport_closed/transport、reason=ipc_unavailable，
不依赖 Electron 对 Error 的自动序列化。单向发送失败也以同一错误事件交本连接；
renderer 工厂重建本地 HierError，普通 connect 失败以 Promise 拒绝结算。
未知/损坏的 connect 返回值按 protocol_error/client 拒绝；若可确认是本次合法领取的 id，关闭并释放它。
不能从损坏返回中猜测 id 去关闭另一个会话。

renderer对违反桥声明的直接抛错作有限防御：未形成合法claim时，connect直接throw/reject转换为
transport_closed/transport、reason=ipc_unavailable，不猜id关闭或释放别人的领取。
start/send直接throw且尚无终态时，以相同ipc_unavailable终止本地Transport；若已有首因（含正常undefined），
后续桥调用或close/release故障不能覆盖它。关闭仍先尝试必要的close、再尝试release并清理本地引用；
桥自身已损坏时不能据此保证远端资源实际释放。合法connect失败DTO仍保持原code/origin/message/data。

ElectronFailure 使用现有 code/origin、message、只含 JSON 数据的 data；只复制自有可序列化数据，
不转发 Error 原型、stack 或可执行对象。Core 错误仍在原始响应帧中，由 SDK 保留原 code/message/data。
进程失败沿用 transport_closed/transport 的 reason、stderr、code/signal；正常 close 可无 error。
适配器新增 reason：invalid_ipc_frame、ipc_unavailable、renderer_gone、document_navigated。
正常窗口销毁使用 renderer_gone；首次原因固定，后来的进程 exit 不能覆盖它。
renderer 丢失后无法要求 UI 收到消息，但 main 仍必须独立回收子进程并结算 exited。

#### 6.8.5 关闭、重开与验收边界

宿主主动关闭设计依次卸载借用视图、dispose 模型、dispose SDK；Transport close 触发 main 回收。
main 自己关闭设计或窗口异常退出也能独立回收：结束 stdin，按既有 shutdownGraceMillis
等待/终止自有进程，监听器清理后 exited 才结算。启动失败的 exited 拒绝由内部立即观察，
公共 Promise 仍保留失败，不能改成成功；无须 renderer 仍在才能完成回收。
宿主在 main await 旧 exited 后才能同窗口开新会话，使用新 id、Transport、SDK 和模型；
不沿用旧 ready、pending、缓存、行 id 或选择。关闭单个面板只退订，不关闭设计。
主程序退出要等待所拥有会话的回收；硬 OS 终止不属于 JS 可保证的正常退出流程。

本单元未来至少独立验证：

- 提前 hello/重复 hello/非法首帧、未领取与领取未 start 的缓冲边界、先退出后连接、
  connect 前/后关闭、首个交付前关闭、晚 onClose、退订、重复接收者和多次领取隔离。
- 两窗口/子 frame/同 URL 新文档/旧 id、窗口崩溃、旧关闭与新打开交错，不跨会话查询或回收。
- 非整数原 token（含嵌套具体方法结果）、合法指数整数、重复键/无效 UTF-8/Unicode、Core 原错误、
  发送失败、桥版本/损坏包、启动失败/真实 EOF/强制终止和 pending 的唯一结算。
- 隔离 preload 真正经 contextBridge 工作；renderer 包不含 Node/Electron，真实 Electron→SDK→
  `hier serve`→roots/children 与关闭句柄，而非 fake IPC 或 Node 子进程测试代称 Electron 通过。
- 前序 M4 所有冻结 Node/SDK/schema 集合回归；未来内部提取与功能添加分提交。

提案阶段只新增契约声明与编译消费者；后续renderer单元兼容新增生产子入口，无 Core ABI、协议 Schema、L6/L7、配置或工程格式变化。
没有旧格式迁移；正式 dft-suite 双进程过渡仍属于 §7.2 的未来宿主集成。
A71实现固定真实runtime及可选peer为Electron 42.3.3，sandbox preload使用现有esbuild打成单一CJS；
既有提案使用同版本官方声明，实际运行验证结果另记生产计划，
不以声明可编译证明平台行为。参考读取日期 2026-10-15：
[隔离边界](https://www.electronjs.org/docs/latest/tutorial/context-isolation)、
[桥允许的数据与函数](https://www.electronjs.org/docs/latest/api/context-bridge)、
[IPC](https://www.electronjs.org/docs/latest/api/ipc-main)、
[文档与 renderer 生命周期](https://www.electronjs.org/docs/latest/api/web-contents)。

### 6.9 M5 实例属性数据契约（2026-10-16，已获 C 通过 / B 冻结）

本节是既定M5-A-03的首个数据单元，执行状态见[计划](plans/M5-instance-properties-contract.md)，
可编译声明见[说明](../web/contracts/instance-properties/README.md)。固定68955ff及订阅释放补文已获C通过，B最终冻结c2c0fac；
生产导出与运行时实施记录见[运行时计划](plans/M5-instance-properties-runtime.md)，独立验收以REVIEW_LOG为准。
PropertiesPanel最终还需对象/位段的驱动负载、定义候选和共享选择联动；源码另属SourceView。
这些不由本节的实例信息/端口/参数成功推导为已实现，也不改变§6.7/§6.8的独立前置。

#### 6.9.1 职责、入口与快照

`InstancePropertiesModel`借用一个已ready的HierClient，保存一个明确实例目标的当前属性任务及只读结果。
它不拥有SelectionModel、DOM、Electron或Transport，不改选择/历史、不自动把端口/定义映射成某个实例。
宿主或后续受审协调层提供明确目标；多选/定义候选不能在UI里随意挑第一项调用本模型。
SDK继续独占complete缓存、请求合并/独立取消；模型不维护跨实例查询缓存或再实现端口/参数事实规则。

```ts
class InstancePropertiesModel {
  constructor(client: HierClient);
  readonly snapshotId: SnapshotId;
  readonly state: InstancePropertiesState;
  readonly disposed: boolean;
  load(inst: ObjectRef): Promise<void>;
  reload(): Promise<void>;
  cancel(): Promise<void>;
  clear(): Promise<void>;
  subscribe(listener: () => void): Unsubscribe;
  dispose(): void;
}
```

构造只读取client.snapshot并固定snapshotId，不发查询、不登记SDK/Selection事件、不通知。
未ready时snapshot访问的原错误同步抛出。模型不重绑；新设计创建新SDK与模型，宿主先释放模型再关SDK。
SDK关闭后仍可能保留旧snapshot，模型不读其私有状态猜测可用性，后续查询按SDK明确失败。

load只接收原始string并使用既有ObjectRef验证器，不强转、不读取toString/valueOf、也不解析编码猜实例。
语法有效是否确为本快照实例由Core的inst.get判定；模型不把ObjectRef的TS字符串别名当存在性/会话证明。
裸ObjectRef不带snapshotId；另一个快照恰有相同字符串时，本入口无法识别其来源。
调用方须从当前会话提供目标，后续共享选择协调层先核Selection的快照绑定；本模型不声称拒绝所有外来裸ref。
无效参数拒绝InstancePropertiesError(invalid_argument)，不取消已有合法任务、不改变state。
所有异步命令的释放/重入/参数错误均通过拒绝Promise返回；constructor/subscribe为同步边界。

#### 6.9.2 状态、结果与加载顺序

状态是一个自有冻结的判别联合，state在没有发布时保持同一对象身份：

| status | target | 附加字段 |
| --- | --- | --- |
| idle | null | 无data/error |
| pending | 本次ObjectRef | 无data/error |
| success | 本次ObjectRef | data必有，error省略 |
| failed / cancelled | 本次ObjectRef | error必有，data省略 |

data只含`instance: Reply<ResultOf<"inst.get">>`、`ports: Reply<ResultOf<"inst.ports">>`、
`params: Reply<ResultOf<"inst.params">>`，复用生成Schema类型和SDK深只读结果；不另造端口/参数DTO。
三个原Reply及其completeness原样保留，包装深冻结，不改写SDK结果；旧state/data持有者仍可安全读取。
这些方法在当前方法登记中均只允许complete。非法partial由SDK按既有协议规则拒绝，模型不改成success，
也不自行将一般Completeness类型收窄成假定永远complete的第二套协议类型。

一次新加载执行：

1. 检查释放/重入及输入，建立新任务身份，撤销旧任务；原子发布pending并通知，清除当前旧data/error。
2. pending通知结束后再次检查任务仍有效且模型存活，再调用client.instance(target, signal)。
   返回instance.ref必须严格等于target；不一致拒绝inconsistent_reply，且不开始后两查询。
3. 第一步查询成功后，用同一任务AbortSignal依次调用client.ports、client.params，不在两次调用之间await。
   两份结果可以任意顺序到达；取得其中一份仍是同一个pending state，不提前发布部分data。
4. 三份结果都成功且任务仍当前时，一次发布完整success，通知后结算负责命令。
   任一当前查询失败先登记终态原因，撤销其余本任务订阅，诊断准备后发布一次failed/cancelled，
   不等待已撤销查询的晚响应；第一次被当前任务处理的查询错误为终态原因。
   从诊断准备到通知/命令结算，任务仍留在可释放集合中，不能提前移除而躲过dispose。
   所有已发起Promise立即登记结算处理，失败/取消后的晚回包只被消费，不能再改state。

Core结果顺序、端口ref/name/direction/kind/internal/type/width/dims、参数value/isType/isLocal/isPort/isOverridden
完整保留；不按name合并端口、不重算位宽、不用定义级结果覆盖参数化实例、不把未知width补为1。
原始参数值是Core文本，不转换成JS number。空ports/params数组是合法success，不是尚未加载。
本单元选择三份结果原子发布；任一失败时不保留其它部分为“完整属性”。后续逐区加载需要单独契约，
不能在实现中暗加部分成功规则。失败state给出诊断，load的Promise保留实际错误，允许显式重试。

#### 6.9.3 最终目标、重试与取消

- load与当前pending目标相同：加入同一任务，不再调用SDK；每个调用都有可观察、恰好一次的结算，
  不承诺返回Promise对象同一身份。加入者共同观察该任务的查询及通知结算。
- load与当前success目标相同：直接成功，不查询、不通知。failed/cancelled同目标则启动新任务重试。
- load不同目标：旧任务所有等待方以cancelled拒绝，撤销其SDK订阅；新目标只发布一批pending，
  不向state插入旧目标cancelled。即便旧任务尚在inst.get阶段或旧回复先后交错，也只认新任务身份。
- reload：无target时成功no-op；否则强制同目标新任务，即使pending也替换而不是加入。
  它重新调用三个SDK方法，但不越过/清空SDK已有complete缓存，不能解释为三个请求必然写入wire。
- cancel：只有pending时撤销当前任务、发布cancelled并通知；目标保留，data省略。
  原load/reload等待方拒绝cancelled；cancel自身成功完成取消动作，只有它自己的通知错误会使其拒绝。
  非pending时成功no-op，不把既有success/failed改为cancelled。
- clear：撤销待办并清空当前目标，发布idle；已idle时no-op。被撤销任务的等待方拒绝cancelled。
  clear本身不关闭SDK；它自己的通知错误归clear，不重复塞给被撤销的旧命令。

撤销仅影响本模型拥有的SDK调用订阅；另一个模型/直接SDK消费者共享同一请求时继续正常结算。
控制器abort只表示请求停止意图和本地订阅结束，不声称不可中断的Core工作已经停下。
所有no-op也先检查disposed及通知/诊断读取重入，再决定是否无状态变化。
普通状态读取、订退阅不发查询；不增加计时器、轮询或index.ready自动刷新，这三个方法没有indexing partial。

#### 6.9.4 错误、通知与释放

新增InstancePropertiesError的code为invalid_argument、disposed、cancelled、inconsistent_reply、reentrant_change。
它只表达模型命令/一致性错误。SDK HierError保持原code/origin/data与原对象身份，
没有观察者异常时负责命令直接拒绝原错误，不统一包装成“属性加载失败”。
模型产生的取消以InstancePropertiesError(cancelled)表达；SDK的code=cancelled也发布cancelled，其余查询错误发布failed。
非法参数/重入仅拒绝对应命令，不污染正在加载的任务状态。

状态中的InstancePropertiesFailure是code/origin/message/data/dataIssue的自有诊断投影：
模型错误origin="properties"且data为冻结空对象；SDK错误保留其origin/code/message。
data和可选dataIssue**采用§6.6.6已受审的同一捕获与读取规则**，直接复用TreeDiagnosticIssue的元数据类型，
不复制第二个字段/默认值定义。后续实现提取既有内部捕获算法供两个模型调用，Tree公开行为不变。
该诊断是L6内存数据，可包含共享/循环关系，不承诺JSON序列化；不能复用B运行器的describeFailure作为产品捕获器。

诊断读取前登记原任务错误，进入本模型命令重入保护；每个外部探测/枚举/Get之后检查disposed。
读取失败发布冻结空data及准确dataIssue，不检查或保存任意抛值；负责命令仍保留原SDK错误。
读取中dispose立即按下述释放规则结算，不再读取下一字段、发布error或复活任务。
最终提交前再次检查当前任务身份；getters在准备期间只见上一批完整状态。

subscribe不回放；非function同步抛invalid_argument。每次注册独立，unsubscribe幂等，
通知开始时固定本批登记顺序；已退订的后续项跳过，新订阅下一批开始参与。
listener可读状态、订退阅或dispose；任何模型命令在通知/诊断读取期间拒绝reentrant_change，
不读其参数、不发查询。同步listener抛值被保存并继续其余有效登记，不回滚已提交状态；返回Promise不由模型await。

**订阅释放精度补充（2026-10-16，已获C通过/B补冻）：** subscribe先检查模型是否disposed，
已释放时同步抛InstancePropertiesError(disposed)，优先于listener合法性检查，且不登记回调；
活模型继续按上文同步拒绝非function。旧unsubscribe保持幂等，不受此检查影响。
此窄补充回应B验收映射的未明确项，不改变已冻结异步命令/通知/释放判据，不将A回归算为B独立验收。

每次状态发布一批通知，无状态变化不通知。查询完成前的pending通知异常归该加载任务，
不能导致任务遗留；任务最终成功时，state保持success，但全部加入者拒绝AggregateError，
errors按通知发生顺序包含原抛值。查询也失败/被取消时，AggregateError.cause是终态查询/取消错误。
cancel/clear自己的通知异常只由它们各自的Promise返回；旧任务先前已有的通知异常仍按上述规则结算。
每个命令Promise内部登记拒绝处理以免无人观察的后台拒绝，但调用方拿到的Promise仍可拒绝；
这不替代未来L7必须立即独立消费命令Promise的职责。

dispose幂等、同步且无通知：先标disposed，撤销本模型任务/订阅、清空listener与目标，state恢复idle，
全部尚未结算命令拒绝InstancePropertiesError(disposed)，优先于取消/查询/通知错误。
已有终态错误及观察者聚合按上述规则先合成为一个cause保留；没有既存错误则cause省略。
若在success通知中dispose，未结算命令仍以disposed结束，不能先承诺成功再清空。
通知尚未调用的登记立即停止；旧unsubscribe与已发布冻结值有效，snapshotId/disposed/state仍可读。
释放不dispose借用的SDK，不改变共享SelectionModel或另一个属性模型。

#### 6.9.5 兼容与独立冻结

这是新增L6入口。已有Tree/Selection导出、protocol=2/schema=7、Core API/ABI、IPC、工程格式和生产依赖不变。
不新增公共私有测试hook；B使用真实HierClient、公开Transport可控响应及独立SV/Core fixture。
本无界面单元已按C审/B冻契约实现，PropertiesPanel及选择联动仍需单独声明/实现/浏览器验收。

独立冻结至少覆盖以下可观察条件，不以本轮类型编译或SDK见证当作模型运行时通过：

| 类别 | 必须区分的输入与观察 |
| --- | --- |
| 构造/输入 | ready前原错、构造零查询/通知、ObjectRef原语/对象强转拒绝、语法有效但非实例由Core拒绝、非法调用保留当前合法任务 |
| 数据 | 同定义不同参数实例、空端口/参数、未知width、interface/multi、原值/顺序/扩展字段/深冻结、同目标一致性错误、SDK非法partial |
| 时序 | inst.get先于后两查询、ports/params两种到达顺序、原子success、同目标join/no-op/reload、换目标/clear/retry及旧响应晚到 |
| 取消/所有权 | 每一查询阶段取消、非pending no-op、不同共享SDK消费者保持、释放不关SDK、重开使用新模型/旧模型不重绑，裸ref来源不可鉴别边界 |
| 错误/观察者 | 原HierError身份/诊断、两后续查询先后失败的首错、pending/settled通知抛值/加入者/重入/订退阅、cancel/clear错误归属、dispose优先与cause |
| 诊断/释放 | §6.6.6读取失败/函数/循环/深度/Proxy/释放/晚提交边界在新消费者适用；未来共享抽取同时保留原Tree冻结集合 |
| 类型/真实链 | 只读联合状态、原ResultOf/Reply消费、非法参数/状态负例；独立真实Core参数化实例与模型释放后的SDK存活 |

### 6.10 M5 源码文档数据契约（2026-10-16，运行时已获 C 审查 / B 独立验收通过）

本节推进M5-A-03的正向源码读取/定位单元；执行记录见[计划](plans/M5-source-document-contract.md)，
隔离声明和实际SDK能力见证见[说明](../web/contracts/source-document/README.md)。
B已冻结6838e4c的306模型/14真实Core/34类型，A运行时与共用任务提取见[实施计划](plans/M5-source-document-runtime.md)。
C-ORCH-6通过实现/共用提取/§5.6.5身份增量，B-ORCH-6独立通过并关闭BD-SOURCE-01；
受审S01/S02基线维护与新增26/4标准接线见[门禁收尾计划](plans/M5-source-gate-closeout.md)。
本节不含SourceView、反向命中分页、定义实例候选选择或共享选择协调；这些仍按M5逐单元完成，
不得把本数据单元成功当作源码双向导航或M5整体完成。既有§5.5.6的Core范围/文件表语义保持。

#### 6.10.1 职责、入口与目标

SourceDocumentModel借用一个已ready的HierClient，持有一个明确对象/定义及SourceKind的文档任务。
Core是FileRef、物理范围、快照哈希、当前文件文本及matchesSnapshot的事实来源；
L6只负责任务/诊断和UTF-8字节到展示坐标的转换，L7后续负责显示。模型不访问文件系统或Transport，
不持有SelectionModel、不修改选择/历史，不通过路径解析推导对象，也不自动挑另一SourceKind作为fallback。

```ts
class SourceDocumentModel {
  constructor(client: HierClient);
  readonly snapshotId: SnapshotId;
  readonly state: SourceDocumentState;
  readonly disposed: boolean;
  load(ref: ObjectRef | DefRef, kind: SourceKind): Promise<void>;
  reload(): Promise<void>;
  cancel(): Promise<void>;
  clear(): Promise<void>;
  subscribe(listener: () => void): Unsubscribe;
  dispose(): void;
}
```

构造沿§6.9.1读取并固定client.snapshot.snapshotId，不查询、不订阅、不通知，未ready时原错误同步抛出。
不重绑会话；宿主先释放模型再关闭SDK。裸ref不带snapshotId，来源鉴别限制沿§6.9.1，
本入口不能识别另一个快照中碰巧相同的字符串，协调层须另核当前选择的快照绑定。

load先检查disposed、通知/诊断读取重入，再按ref、kind顺序检查原始string及既有ObjectRef或DefRef、SourceKind验证器。
无强制转换、对象字段探测或toString/valueOf调用。两个参数全部有效后才形成自有冻结的
SourceDocumentTarget `{ref, kind}`；目标身份按两字符串值比较，不按包装对象身份或ref前缀推断对象种类。
格式合法后的存在性和kind适用性由Core决定：例如顶层instantiation、blackbox definition仍原样not_found，
不能改成空文本或成功。无效参数拒绝SourceDocumentError(invalid_argument)，保留原任务/状态。
异步命令错误通过拒绝Promise返回，constructor/subscribe为同步边界。

#### 6.10.2 两阶段读取与原子状态

SourceDocumentState为冻结联合：idle的target为null且无data/error；pending携带目标且无data/error；
success携带目标和data、无error；failed/cancelled携带目标和error、无data。未发布时state身份保持。
SourceDocument只含三项：

- source：原`Reply<ResultOf<"obj.source">>`；
- content：原`Reply<ResultOf<"source.read">>`；
- location：下节定义的精确展示范围或changed状态。

原Reply、completeness、扩展字段、text和hash保持原值/身份；自有target/data/location及坐标对象深冻结。
不另造SourceSpan/SourceRead协议DTO，不重算SHA或改写matchesSnapshot，不把路径用作读取权限。
当前obj.source/source.read均只允许complete，非法partial由SDK拒绝；仍保留一般Reply类型与原completeness。

一次新任务按以下次序执行：

1. 验证输入后建立任务身份、撤销旧任务，原子发布新pending并通知；旧data/error从当前状态移除。
2. pending通知结束且任务仍有效时调用client.source(ref, kind, signal)。
3. 获得范围后先检查任务仍当前且模型未disposed，再只用该Reply的result.file调用client.readSource(file, signal)，
   沿用本任务的独立AbortSignal。旧第一阶段回复不得发起第二个SDK调用。
   不使用result.path，不同时读旧文件，不在此时发布source部分成功，也不根据源码内容推断目标。
4. 第二份Reply成功后做下节的一致性/坐标检查；当前任务仍有效才一次发布success，通知后结算命令。
   任一阶段失败则登记原错误、撤销本任务订阅，经诊断准备后发布failed/cancelled，清除当前data。
   已发Promise立即登记结算处理，过期回包只消费不发布；任务直到通知/命令结算结束仍可被dispose收回。

readSource不返回FileRef；两份回复的关联由同一任务的`readSource(source.result.file, signal)`调用参数保证，不伪造响应file字段。
原文可能为空；本模型以合法范围检查区分空文件的合法EOF范围和不一致回复，不把空字符串当pending。
变化后的磁盘内容可为空或完全不含原声明；此时按changed处理，不因旧范围超出新文本而拒绝正常读取。

#### 6.10.3 快照一致性与展示坐标

令span=source.result、read=content.result。先检查span.start.offset <= span.end.offset；违反时拒绝inconsistent_reply。
再核`read.matchesSnapshot === (read.contentHash === span.contentHash)`，不一致拒绝inconsistent_reply；
此检查比较Core已有事实，不重算文本哈希、不从客户端猜测实际磁盘版本。

- matchesSnapshot=false：正常success，location为`{status:"changed"}`，range必须省略。
  保留快照原span与当前text/hash，L7必须展示“源码已变化，位置可能不准”；不得把旧span裁剪、钳制、
  搜索猜测为当前精确高亮，也不能把当前文本点击坐标直接送往快照source.resolve。
  不用旧offset/line/column校验或裁剪新文本，不自动重编译；用户显式reload可再次读取。
- matchesSnapshot=true：对原text严格转换，location为`{status:"exact", range}`。
  SourceTextRange为半开[start,end)，两端SourceTextPosition的offset是从原text起点算的0基UTF-16单元偏移，
  line/column为1基，column按该行UTF-16单元计。它不是像素、字形簇或tab展开后的显示宽度。

转换只解释原文编码和换行：ASCII/制表符各1个UTF-8字节与1个UTF-16单元；BMP标量按其UTF-8字节数/1单元，
补充平面标量按4字节/2单元。组合字符逐标量计，BOM作为原文U+FEFF保留并计3字节/1单元，不做Unicode规范化。
CRLF算一个换行，单CR或单LF也各算一个换行；UTF-16绝对offset仍计入原CRLF的两个单元。
下一行从换行序列之后开始，末尾换行后的空行及EOF位置均合法。不得split再join或改写text来方便定位。

每个端点须在[0,原文UTF-8总字节数]内、位于完整Unicode标量边界、且不位于CRLF的CR与LF之间。
端点所在行/按UTF-8字节计的列必须与原SourcePos.line/column完全相符；空范围允许start=end，非空范围不得反序。
半个多字节字符、CRLF内部、越界、行列与offset不一致均拒绝inconsistent_reply，不就近修正。
精确空文本仅允许offset=0、line=1、column=1的两端；尾随换行后的EOF按新空行column=1处理。
生成的展示端点不能切开UTF-16代理对；源坐标不作为String.slice入参，使用转换后的UTF-16 offset。

同一文本只需一次顺序扫描确定两个端点；不为每字节保存第二份索引/字符串，也不在UI重复转换算法。
原SDK文本和Core范围是权威数据，range只是与该data绑定的展示投影。这里只承诺编码正确性，
不承诺大文件同步转换的M7时延/内存预算；新目标或释放后旧data可被持有者读取，但不得继续作为当前文档提交。

#### 6.10.4 重试、取消、错误与生命周期

命令和观察者语义采用§6.9.3/§6.9.4的相同规则，以下名称映射和差异明确适用：
实例目标替换为(ref,kind)二元组，InstancePropertiesError/Failure替换为SourceDocumentError/Failure，
模型诊断origin="source"；查询任务替换为本节source→readSource两阶段，成功结果替换为SourceDocument。
不继承实例专用三查询或端口/参数数据规则；不改变既有属性模型行为。

- pending同目标load加入一个任务，全部加入者各结算一次；success同目标load成功no-op，不发查询/通知。
  failed/cancelled同目标load重试。kind不同也是新目标，即使ref相同；旧任务等待方cancelled，新pending替换旧状态。
- reload无目标时no-op，否则强制新任务（含pending替换），重新调用两方法。两个SDK方法不缓存complete，
  仍可能合并其它消费者的并发同参数请求；不承诺每次调用必有独立wire请求，也不清空SDK共享状态。
  success只是上次读到的文档，不保证磁盘一直未变；无文件监听、轮询、index.ready刷新或隐式reload。
- cancel只作用于pending，发布cancelled并使加载等待方拒绝；cancel自身完成动作，仅因本次通知/释放错误拒绝。
  clear撤销待办并发布idle，已idle时no-op；它们的通知错误归各自命令，不额外塞给旧任务。
- 所有命令含no-op先执行disposed/重入检查；取消/释放只撤销本模型SDK订阅，其他模型/直接SDK调用继续工作。
  不把本地abort视作Core已停。disposed优先，释放不关闭借用SDK。

SourceDocumentError的code仅invalid_argument、disposed、cancelled、inconsistent_reply、reentrant_change。
正常SDK查询失败保持原HierError身份/code/origin/data；无观察者错误时命令拒绝原对象。
失败状态采用SourceDocumentFailure自有诊断；data/dataIssue复用§6.6.6与现有内部diagnostic-data，
模型错误origin="source"、data为冻结空对象。SDK code=cancelled及模型取消发布cancelled，其它任务错误发布failed。
解析当前Reply/投影的意外非HierError抛值转为SourceDocumentError(inconsistent_reply)，cause保留原值，
不得把通知抛值误认为查询失败。诊断读取逐步检查dispose，读失败元数据与循环/函数规则沿§6.6.6。

subscribe不回放，disposed先于listener合法性检查；非function同步invalid_argument，独立登记、退订幂等。
通知快照顺序、新订阅下一批、退订跳过、监听器可读/订退阅/dispose、命令重入拒绝等均沿§6.9.4。
通知抛值继续收集；成功任务状态仍success、命令拒绝AggregateError，失败/取消时cause保留终态错误。
pending通知异常持续属于当前任务及其加入者；listener返回Promise不await，每个命令内部消费拒绝但调用者仍能观察拒绝。
dispose同步幂等、无通知，先标disposed，再撤销任务/监听并恢复idle；所有未结算命令以disposed拒绝，
既存查询/通知错误合成为cause，success通知中释放亦不得提前兑现成功。任务在诊断与终态通知期间仍归模型所有。
旧unsubscribe有效，snapshotId/disposed/state仍可读取，绝不复活旧目标或改共享选择。

存在待办加载时，cancel/clear先登记旧load的cancelled，再发布动作状态并通知，旧load及加入者在动作通知后结算。
因此动作通知内dispose会接管仍未结算的旧load、加入者和动作命令；旧load以disposed拒绝并保留cancelled cause。
这沿用属性模型的原有顺序，不重新结算已兑现的Promise，也不关闭借用SDK。

#### 6.10.5 兼容与独立冻结

本节的Source公开L6运行时已获C代码审查/B独立验收；protocol=2/schema=7、Core API/ABI、IPC、工程格式与依赖均保持。
本轮纯提取属性模型实际共用的任务/通知机制，单独验证原Tree/Selection/Properties冻结后固定63e52fd；
不能复制整个属性模块形成并行事实来源，也不能用未使用的通用框架替代当前具体需求。

独立冻结至少覆盖：

| 类别 | 可观察条件 |
| --- | --- |
| 输入/所有权 | ready前原错、构造零查询/订阅、ref/kind原语校验/顺序、合法但无源码由Core拒绝、裸ref来源限制、释放不关SDK |
| 查询/状态 | source先于read、只用返回FileRef、原Reply/扩展字段/complete、原子发布、两阶段各自错误、两回复版本矛盾、非法partial |
| 坐标 | ASCII/tab/BMP/补充平面/组合字符/BOM、CRLF/单CR/单LF、空范围/空文本/末行EOF、半字符/CRLF内部/越界/行列矛盾 |
| 版本变化 | 读取后磁盘变更、changed仍success且无range、旧span超出新文本仍changed、reload变更/恢复/删除/非法UTF-8、无自动重编译 |
| 任务 | 同目标join/no-op/reload、同ref不同kind、目标替换/clear/取消/过期回复、双模型/直接SDK共享订阅互不误伤 |
| 诊断/通知 | §6.9.4及§6.6.6在新消费者适用、独立注册/重入/聚合与cause、pending/查询终态/读取中dispose、所有未结命令结算 |
| 类型/真实链 | 只读状态/精确与changed联合、ResultOf/Reply、逐项类型负例；真实Core定义/例化/include/多实例及编辑还原、不同snapshot |

A隔离声明与既有SDK见证不作为这些新模型行为的独立验收。反向source.resolve仍保持全部分页候选，
本单元不自动调用它或挑第一项；未来点击/候选/Selection协调另行冻结，changed文本尤其不能伪造快照精确定位。

### 6.11 M5 快照源码候选分页契约（2026-10-17，运行时已获C审查/B独立验收）

推进M5-A-03的原始反向候选数据单元，执行与隔离类型见[计划](plans/M5-source-candidates-contract.md)。
§5.5.6的Core范围、全部occurrence及排序/游标规则保持。固定61db0b2契约已获C10通过，B最终e511880已冻281/13/47。
A已实现公开模型及共享状态投影，历史验证见[运行时计划](plans/M5-source-candidates-runtime.md)。
B11接受a35122a+fa8d995（取消帧字段测试窄修订），C11通过实现及修订；主树原样吸收为b3d6408，报告07f6f3d→f8ee1d6。

#### 6.11.1 输入、职责与所有权

SourceCandidatesModel借用一个ready的HierClient，绑定其snapshotId；只通过resolveSource查询一个明确的快照位置。
Core是候选与范围事实来源；模型拥有查询目标、任务和已提交页序列，不读取文件、不解析HDL、不再建范围索引或SDK缓存。

```ts
interface SourceCandidatesQuery {
  readonly snapshotId: SnapshotId;
  readonly file: FileRef;
  readonly line: number;
  readonly col?: number;
}
interface SourceCandidatesOptions { readonly pageSize?: number; }
type SourceCandidatesPage = Reply<ResultOf<"source.resolve">>;
class SourceCandidatesModel {
  constructor(client: HierClient, options?: SourceCandidatesOptions);
  readonly snapshotId: SnapshotId;
  readonly state: SourceCandidatesState;
  readonly disposed: boolean;
  load(query: SourceCandidatesQuery): Promise<void>;
  loadMore(): Promise<void>;
  reload(): Promise<void>;
  cancel(): Promise<void>;
  clear(): Promise<void>;
  subscribe(listener: () => void): Unsubscribe;
  dispose(): void;
}
```

构造先读取client.snapshot.snapshotId，未ready时保留原错误；options省略或undefined使用默认，
其它值须为非null非数组对象（函数非法）。唯一声明字段pageSize只探测一次自有描述符，有该字段才Get一次；
继承字段不读取，自有字段缺省时200，自有pageSize=undefined非法。值必须为原始number/安全正整数且通过现有PageLimit验证。
不枚举扩展属性，不强制转换；非法options抛invalid_options，描述符探测/Get异常保留原cause。
构造不发查询、不订阅SDK事件。一个模型不重绑会话，dispose不关闭借用SDK。
所有异步命令的释放/重入/参数错误均通过拒绝Promise返回；constructor/subscribe为同步边界。

load先检查disposed、输入/通知/诊断重入，再投影输入；验证完成前不取消旧任务、改状态或发查询。
query须为非null非数组对象；按snapshotId、file、line、col顺序检查自有字段，必需前三项存在。
每个字段只探测一次自有描述符，有该字段才Get一次；自有getter允许，继承字段不充当输入，不读取/枚举扩展字段。
先完成四字段投影（缺失字段只记录缺失），再按同顺序验证必需存在/原语，全部通过后才检查snapshot绑定；
投影抛错或disposed即停止，不继续后续字段。缺失/非法早字段不抢在后续投影异常之前拒绝。
col缺省表示整行查询；自有col=undefined非法，显式列号与省略列号严格不同。
snapshotId/file须为原始string并通过现有SnapshotId/FileRef验证，line/col须为原始number/安全正整数并通过UInt验证；
具体文件是否存在及坐标是否越界由Core决定，合法语法不等于合法位置。
snapshotId必须等于本模型绑定值，否则拒绝snapshot_mismatch；此字段是调用方声明，不能鉴别伪装成当前快照的裸FileRef来源。
不按path或ref前缀推断文件/对象，不做字符串数字或坐标归一化。

投影期间所有命令含no-op拒绝reentrant_change且不再读嵌套输入；subscribe/unsubscribe/dispose可执行。
每次外部探测/Get返回或抛错后检查disposed，释放优先并停止后续读取；同次操作先dispose再抛错时disposed的cause保留该抛值，
正常返回后发现dispose不人为添加cause。其余读取异常为invalid_argument，cause保留原抛值。
验证成功后保存自有冻结query；身份按snapshotId/file/line以及col的有无和值比较，不按输入对象身份比较。

**坐标边界：** line/col是§5.5.6的快照UTF-8字节坐标，不是编辑器UTF-16列、字符索引或显示宽度。
本入口不接SourceDocument/当前文本，故不能检测调用方是否误传changed文本的位置。
未来文档适配必须核当前文档发布身份/快照，要求exact并在L6转换；changed禁用反向点击，不能将旧span或当前文本坐标直接传入本模型。
本提案不改变§6.10或宣告该适配已实现。

#### 6.11.2 页序列与完整性

SourceCandidatesState为冻结联合，所有分支都有readonly pages数组：idle为query=null/pages=[]；
pending/success为非null query且无error；failed/cancelled为非null query及SourceCandidatesFailure。
pages是唯一已提交候选数据，元素为原SourceCandidatesPage，保留Reply、items、命中、扩展字段、completeness和next原值/身份。
仅自有query/state/pages包装冻结；未发布时state身份保持，不另存平行的扁平items/next/count或替代SourceHit DTO。
使用方按pages顺序展示每页items；模型不重排、去重、截断、合并同ref不同kind/span，也不预取所有后续页。

每次命令至多请求一页，首请求省略cursor；后续请求只用前一页原next，pageSize保持构造时固定值。
snapshotId是L6绑定检查，不作为新增wire参数；SDK调用仍为resolveSource({file,line,col?},{limit,cursor?},signal)。
响应超过pageSize，或next重复当前请求cursor/当前已提交页链中的任一next，会拒绝inconsistent_reply；
坏页及其新next不登记，重试沿原前缀；reload、重新load及clear随清空页链重置游标历史，不跨目标/重载误判重复。
坏页不追加，保留之前已提交页，不循环请求。
候选事实/排序仍由Core保证，本层不复制Core的范围查找或引用排序算法。

source.resolve允许partial。合法partial是success，原页照常发布；即使items=[]或无next也不能显示“没有候选/已全部加载”。
仅当**所有已提交页均complete且末页next省略**时，此查询的候选已取尽；完整前缀有next仍只是前缀。
loadMore仅沿全部complete的前缀及末页next继续。末页partial时不使用其next，loadMore成功no-op，显式reload从首请求恢复。
完整空首/末页且无next是合法结果；partial的reasons与其他元数据必须原样显示，不能因任务成功而抹去。

#### 6.11.3 命令、失败与取消

- 新query的load先使旧任务失效，原子发布pending/query/空pages，再在通知结束且仍有效时发首请求。
  旧任务等待方以cancelled拒绝，不向state插入旧query的cancelled；沿§6.10.4保留结算前的dispose接管。
  同query且pending加入当前任务（包括在途后续页），各调用者独立结算；success同query为no-op，包括partial成功。
  failed/cancelled同query的load从首请求重启并清空旧页；只重试失败后续页应使用loadMore。
- loadMore在idle无目标时no-op；pending时加入当前任务；完整前缀有next时只取该页，pending保留原pages。
  失败/取消保留已提交页和未提交cursor；再次loadMore重试该页。首请求失败且pages为空时loadMore重试首请求。
  success且已穷尽或partial时no-op。没有暗中重试、预取或页大小变化。
- reload有目标时无条件撤销旧任务、清空页链并从首请求开始；无目标时no-op。stale_cursor保留原SDK错误及已提交页供展示，
  不自动重发失效cursor；该终态下loadMore拒绝同一原错误，显式reload或load重建页链。
- cancel仅撤销当前任务，发布cancelled并保留已提交页；无任务时no-op。clear撤销当前任务并发布idle/空pages，已idle时no-op。
  原任务等待方按cancelled拒绝。两动作自身只因通知/释放错误拒绝，沿§6.10.4先登记旧任务取消、通知后结算；通知中dispose仍可接管未结算等待方。
- 响应成功且任务仍有效时一次追加整页并发布success，通知后结算；晚回复只消费，不追加、不改新query、不触发下一页。
  本地AbortSignal只退出本模型SDK订阅，不保证Core已停止，不影响其它模型/直接SDK消费者。

SourceCandidatesError的code为invalid_options、invalid_argument、snapshot_mismatch、disposed、cancelled、inconsistent_reply、reentrant_change。
本地Failure.origin="source_candidates"，data为冻结空对象；SDK错误保持原HierError身份/code/origin/data，命令拒绝原对象。
state的失败诊断按§6.6.6捕获为自有冻结快照，不承诺state.error.data与原异常data的身份相同；使用同一TreeDiagnosticIssue。
诊断读取中dispose优先，原cause不二次探测。
SDK cancelled及本地取消发布cancelled，其它查询错误发布failed；SDK调用/回复解析及页投影的意外非HierError为inconsistent_reply并保留cause，
不包含前述输入投影的invalid_argument或构造的invalid_options。
无论失败是否发生于后续页，旧成功页仅供显示，不伪装本次成功或自动提交选择。

subscribe、独立注册/幂等退订、通知快照、新订阅/退订、命令重入、Promise拒绝内部消费等沿§6.9.4/6.10.4。
监听器同步抛错继续通知其他有效注册，成功页仍success，负责命令以AggregateError拒绝；失败/取消以终态错误为cause。
pending通知异常属于当前任务与全部加入者。listener返回Promise不await，调用方仍须立即消费每个命令原Promise。
dispose同步幂等且无通知，先标disposed、撤销任务/监听并恢复idle；通知中释放停止余下listener，未结算命令以disposed拒绝并保留既有cause。
旧冻结页与退订函数仍可使用；state/snapshotId/disposed可读，但旧页不能继续作为新会话当前候选。

#### 6.11.4 宿主协调与独立冻结

本原始分页模型只提供显式命令，不订阅index.ready、不持有SourceDocumentModel/SelectionModel。
§6.1/§5.6.6要求的indexing就绪重查由后续宿主协调层订阅SDK后调用本模型reload执行，不能把本单元当作自动联动已完成。
协调层须处理ready先于partial回包：记录事件/查询代次，或对仍pending的当前query从头重载；不能仅检查事件瞬间的success/partial而漏刷新。
通知/诊断期间不可重入reload；排队后须再核目标和cancel/clear/dispose意图，每次就绪事件不得造成无限重试。
协调层立即消费reload原Promise并给宿主可诊断反馈；关闭时先退订SDK/模型，再dispose自己创建的模型，不关闭借用SDK。
隔离消费者仅证明这条接口接线能编译，不提供事件时序运行时验收。

SourceHit.kind只表示definition/instantiation/statement范围种类，不区分DefRef与ObjectRef；definition也可命中实例/端口/信号声明。
本模型不根据kind、ref前缀或inst缺省自动构造Selection，不自动挑第一项或展开instancesOf。
source.resolve本已包含全部occurrence；定义的实例候选与用户确认后的Selection协调另行明确地址判别/分页契约，不能借本提案提前认定协议判别字段。

未来新增L6公开API；本提案不修改已有生产导出、Core API/ABI、protocol2/schema7、IPC、依赖或工程格式，无迁移。
C审/B冻至少覆盖：显式快照绑定、整行/列区别、输入读取重入/释放、按页加载/前缀保留/游标循环、
partial空/非空/带next与显式重载、stale_cursor恢复、原Reply/所有occurrence/顺序、同query加入者/晚页、
通知错误/诊断释放/任务所有权、37既有声明与原产品回归、实际Core多实例/宏include/空白/不同页大小底层能力。
未审/未冻前不实现生产SourceCandidatesModel；其后也须另验文档坐标适配、自动刷新、候选选择与SourceView。

### 6.12 M5 当前文档到快照点查询契约（2026-10-17，运行时与接线已获B/C接受）

继续M5-A-03，连接§6.10的原文身份和§6.11的快照点查询；执行见[计划](plans/M5-source-position-contract.md)，
隔离声明/消费者见[说明](../web/contracts/source-position/README.md)。C12通过固定42a9256，B最终00f126b已冻258/11/32。
A已实现queryAt及共用全文扫描，见[运行时计划](plans/M5-source-position-runtime.md)。B13功能冻结通过，C13运行时审查保持；
固定bc1a5d8的接线修复已获B14/C14复验，B-POSITION-GATE-01/C-85分别由提出方关闭。以下规范正文保持。

#### 6.12.1 最小入口、职责与兼容

在现有SourceDocumentModel新增同步派生方法，不另建文档模型或请求协调器：

```ts
// 现有SourceDocumentModel的新增成员；其构造及其它成员保持。
queryAt(
  document: SourceDocument,
  utf16Offset: number,
): SourceCandidatesQuery & { readonly col: number };

type SourcePositionErrorCode =
  | "disposed" | "stale_document" | "changed_document" | "invalid_argument";
class SourcePositionError extends Error {
  constructor(code: SourcePositionErrorCode, message: string);
  readonly code: SourcePositionErrorCode;
}
```

L6根据当前发布的原文转换坐标，Core继续决定命中和候选顺序；queryAt不调用SDK、不读盘、不订阅、不通知、
不修改state/target/error/选择，不隐式取消或重启任务。无Promise、任务状态或失败诊断发布；错误同步抛出SourcePositionError，
name为"SourcePositionError"，code稳定、message供诊断但不冻结具体措辞，不为本入口合成cause。
使用独立错误类/联合，不扩大已验收的SourceDocumentErrorCode或改旧异步方法的拒绝行为。
无需Node/React/Electron类型或编辑器依赖；新方法只读当前数据，通知/诊断期间亦按相同规则允许调用。

#### 6.12.2 当前发布身份与错误优先级

调用依次执行以下同步检查；前一步失败即停止，不探测调用方document的属性、原型、描述符或toString：

1. 本模型disposed时抛disposed，优先于其它输入/状态错误。
2. 当前state必须为success，且document必须严格等于该state.data（`===`）；否则抛stale_document。
   idle/pending/failed/cancelled均无当前可点击文档；任意不匹配值（含null/undefined/原语）、结构相等副本、
   原文相同的另一个模型文档、旧发布、包装Proxy均拒绝，不读取它们的字段或触发其trap。
3. 当前document.location.status必须为exact；changed抛changed_document，优先于位置参数错误。
4. utf16Offset必须为原始number、安全整数、非负且不大于原text.length，并位于下节合法边界；否则抛invalid_argument。
   不强制转换、不调用valueOf；负零与0同义。其余错误不借本入口重新解释为查询失败。

文档身份使用现有SourceDocument成功发布的冻结data包装，不新增token、版本字段、品牌表或平行文档副本。
同目标success的load no-op不发布新data，旧document仍当前；reload/换目标开始发布pending后旧document立即失效，
后续即便返回相同文本/hash/范围也产生新data，不能使旧document重新有效。clear/dispose亦使旧文档不可用于本模型。
只有同一模型的当前成功文档才接受，不能凭相同snapshotId/FileRef或相同底层Reply替代；跨模型/跨会话文档均不接受。
这些是本入口的身份保证，不将裸SourceCandidatesQuery/FileRef提升为防伪或可撤销凭证。

exact只说明Core读出的text/hash与该快照一致；文件后来在磁盘变化不会自动更新当前data，queryAt不重新探测磁盘。
界面必须以document.content.result.text原文为坐标基准；本只读源码单元不接本地编辑缓冲区，也不能识别调用方对屏幕文本的私自改写。
changed文档不采用旧span、字符串搜索、裁剪或当前文本猜测快照位置，须保留§6.10的变化提示。

#### 6.12.3 UTF-16偏移到UTF-8点坐标

utf16Offset是整个未改写text的0基UTF-16单元偏移，允许0和text.length（含空文本EOF）。
不是行列对、UTF-8偏移、字形簇、像素或tab展开宽度；调用方不能使用改写换行/去BOM后的文本偏移。
只接受Unicode标量及完整换行序列的边界：补充平面代理对内部、CRLF之间均拒绝，不左右吸附、截断或钳制。
单CR、单LF各是一个换行；CRLF是一个不可拆换行，原绝对UTF-16偏移仍计两单元。
换行前位置属于前一行末尾，序列之后属于下一行第1列；末尾换行后的空行和EOF均合法。
ASCII/tab各计1字节/1单元；BMP、补充平面、组合字符和BOM均沿§6.10.3原文规则计数，不做Unicode规范化。
BOM前为第1行第1字节列，BOM后为第1行第4字节列；组合字符间合法标量边界不按视觉字形合并。

返回自有冻结对象，恰含snapshotId、file、line、col四个自有数据字段：

- snapshotId为本模型绑定值；file取当前document.source.result.file，不接受路径或调用方另传FileRef；
- line为1基行号，col为该行1基UTF-8字节列；两者与§5.5.6一致，col始终存在，绝不降格为整行查询；
- 坐标允许位于当前文件任何合法位置，包括原source span之外，不限制到高亮范围；是否有命中由Core决定；
- 无offset、text、hash、cursor或文档包装；不承诺不同调用的返回对象身份，不持久缓存另一套查询/坐标事实。

正向显示与反向点转换必须复用同一标量/CRLF计数规则；后续实施应在实际共用处提取扫描机制，
保留旧projectSourceLocation对整个文本的非法标量、两端范围及行列一致性检查。
本单元允许每次映射对原文做至多一次线性扫描、常量额外空间，不建立按字符/字节的常驻索引；性能验收仍属M7。

#### 6.12.4 宿主使用、派生值有效期及冻结范围

视图保留**该次渲染所用document**；点击时将它与相对该原文的UTF-16偏移交queryAt，不能临时换成另一个当前文档来掩盖陈旧点击。
取得query后可同步调用同会话SourceCandidatesModel.load，并立即消费该命令原Promise；同步位置错误与异步查询错误分别反馈。
如有await/队列/延迟调度，须在真正发起查询前用原document和偏移重新queryAt，不把先前派生query当作仍有效的证明。
候选模型还会独立核snapshotId；本入口无跨会话候选模型所有权，不自动创建/关闭候选或文档模型。

queryAt是一次同步读取，不能撤销已经返回的值，也不保证之后文档不变。候选返回后的展示绑定、文档变化时取消/清空候选、
ready先于partial的自动重查、候选用户确认到Selection及SourceView均由后续宿主协调契约处理；本提案不宣告完整反向导航。
旧SourceDocument/Reply仍可被调用方只读保留，旧文档不能因此重新成为当前点击凭证。

C审/B冻至少覆盖以下可观察条件，A类型消费者和旧能力见证不作为新运行时oracle：

| 类别 | 必须验证的边界 |
| --- | --- |
| 发布身份 | 当前exact；success no-op仍同文档；reload pending及完成后的旧文档；换目标/clear/失败/取消；同文本另一模型/跨快照；clone/Proxy拒绝且零外部字段探测 |
| 错误优先 | disposed→当前身份→changed→原语/范围/边界；恶意文档/offset对象无强制读取；同步抛值不改状态或通知/SDK计数 |
| 位置 | ASCII/tab/BMP/补充平面/组合/BOM；CR/LF/CRLF；首点/空文本/末行EOF；代理对和CRLF内部、负/小数/非安全数/越界；span外合法点 |
| 输出/旧行为 | 原FileRef/绑定snapshot、显式字节col、冻结与字段集合、无请求或订阅；通知中读取；旧SourceDocument及共用扫描回归，旧错误联合保持 |
| 真实链/类型 | 真实Core原文/UTF-16点到全部候选、include/多实例与改盘后changed；逐项类型拒绝、平台无关；不按kind/ref推断Selection |

本轮仅新增规范/隔离声明，无生产API、Core API/ABI、protocol2/schema7、IPC、依赖或工程格式变化；首版无持久化迁移。
对应C审查及B独立冻结后才实施生产queryAt，已验收的§6.10/§6.11本轮保持。

### 6.13 M5 当前文档绑定的源码候选协调（2026-10-17，运行时已获B/C接受）

继续M5-A-03，执行见[计划](plans/M5-source-navigation-contract.md)，隔离声明/消费者见
[说明](../web/contracts/source-navigation/README.md)。本节定义新增SourceNavigationModel，复用§6.10–6.12已验收模型。
生产SourceNavigationModel已按本节实现，执行见[运行时计划](plans/M5-source-navigation-runtime.md)。
B17/C17已验功能；C18正式关闭常规入口C-87，B18对固定cc1191a四输入及普通入口独立通过。
本单元独立验收完成；旧模型能力、隔离类型与A自测仍不代B/C验收，原契约准备记录保持历史归属。

#### 6.13.1 所有权、API与唯一数据来源

SourceNavigationModel借用ready的HierClient，自建并私有拥有一个SourceDocumentModel和一个SourceCandidatesModel。
不接管外部已有模型，不公开子模型或允许替换它们；子模型dispose无通知，因此不能仅靠借用对象的subscribe保证有效性。
先完成client就绪/候选options验证，再安装两个模型订阅和一个SDK index.ready订阅；构造不发查询。
所有订阅必须在首次查询之前完成；构造失败释放已取得的订阅/子模型，不关闭SDK。
options沿§6.11.1的SourceCandidatesOptions/pageSize读取及错误规则，不新增第二套页大小默认值。

```ts
interface SourceNavigationCandidates {
  readonly document: SourceDocument;
  readonly utf16Offset: number;
  readonly state: Exclude<SourceCandidatesState, { readonly status: "idle" }>;
}
interface SourceNavigationRefresh {
  readonly document: SourceDocument;
  readonly utf16Offset: number;
  readonly completion: Promise<void>;
}
interface SourceNavigationState {
  readonly document: SourceDocumentState;
  readonly candidates: SourceNavigationCandidates | null;
  readonly refresh: SourceNavigationRefresh | null;
}
type SourceNavigationErrorCode = "disposed" | "reentrant_change";
class SourceNavigationError extends Error {
  constructor(code: SourceNavigationErrorCode, message: string);
  readonly code: SourceNavigationErrorCode;
}
class SourceNavigationModel {
  constructor(client: HierClient, options?: SourceCandidatesOptions);
  readonly snapshotId: SnapshotId;
  readonly state: SourceNavigationState;
  readonly disposed: boolean;
  load(ref: ObjectRef | DefRef, kind: SourceKind): Promise<void>;
  reloadDocument(): Promise<void>;
  cancelDocument(): Promise<void>;
  clear(): Promise<void>;
  locate(document: SourceDocument, utf16Offset: number): Promise<void>;
  loadMore(): Promise<void>;
  reloadCandidates(): Promise<void>;
  cancelCandidates(): Promise<void>;
  subscribe(listener: () => void): Unsubscribe;
  dispose(): void;
}
```

state.document和state.candidates.state保留各自原模型的冻结状态引用；候选页/Reply及源码文本保持原身份，不复制页或扁平items。
仅协调state、candidates绑定包装和refresh句柄为新增冻结对象；没有平行范围索引、Selection或SDK缓存。
无可观察变化时state对象身份保持。构造/clear/释放后document为idle，candidates与refresh为null。
candidates非null时，其document必须严格等于document分支的当前success.data，且location为exact；
其state.query与该document/offset经queryAt得到的快照点四字段值相等，不要求query对象身份相同，col不可省略。candidates.state不得为idle。
可保留仍绑定当前文档的failed/cancelled页前缀，按原状态显示，不能把它们当作本次查询成功。

#### 6.13.2 显式命令、绑定与失效

所有八个异步命令均返回Promise<void>，包括无操作和参数错误；不向调用者同步抛位置/模型错误。
命令入口先核disposed，再核本协调器的输入读取/通知/诊断重入，失败分别拒绝SourceNavigationError(disposed/reentrant_change)。
重入含底层将成为no-op的命令；不读取嵌套输入、不改变旧任务。subscribe/unsubscribe/dispose在这些阶段仍可执行。
本层保留外层入口保护直至子命令的同步输入读取/起步结束，不能因换了子模型而绕过重入限制。

- load/ref/kind按原SourceDocumentModel验证；非法参数保留原SourceDocumentError，不使候选失效。
  同目标success no-op保留原document、绑定、refresh和页；同目标pending加入原任务；其它合法load开始新文档任务。
- reloadDocument有目标时强制重读，cancelDocument仅取消文档在途任务；无目标/无任务行为沿原模型。
  对success文档cancelDocument不取消候选或清绑定。clear同时清文档和候选、撤销自动工作。
- 文档开始新pending、被清除或不再是绑定的success.data时，旧绑定和refresh在该状态对外发布前即失效；
  同步撤销候选任务并清空私有候选页。新文档即使text/hash/FileRef/坐标相同也不能继承旧页。
  对外不得出现新document配旧候选的中间态；清子模型产生的中间通知在本次协调转换内合并，不冒作独立用户意图。
- locate先调用自有documentModel.queryAt(document, utf16Offset)；沿§6.12的严格身份/exact/偏移顺序，
  失败保留同一SourcePositionError拒绝值。非法点击不取消旧查询、不清绑定或refresh，不探测伪document/offset属性。
  视图须传实际显示document，排队/await后再locate，不能换成最新document掩盖旧点击。
- 合法locate以document严格身份及UTF-16 offset确定绑定，-0与0同义。不同绑定先清旧页再load新query，
  新pending对外发布时绑定已更新；旧任务等待方按取消结算，晚页不能附着到新绑定。
  同绑定沿候选load的pending加入/success no-op/failed或cancelled从首请求重启；不自动选择候选。
- loadMore按§6.11继续至多一页；无绑定no-op。reloadCandidates在有效绑定上重新queryAt再从首请求重载；无绑定no-op。
  两者不读盘或改变文档，重载保持该文档身份；partial、stale_cursor与前缀展示均沿旧模型。
- cancelCandidates撤销当前候选任务、保留绑定和已提交前缀，同时撤销排队自动工作并暂停未来自动重查，
  即使底层success时cancel是no-op，暂停意图仍生效，refresh变null。它不清文档、不改变Selection。
  下次合法locate/loadMore/reloadCandidates恢复自动监听资格，仅未来ready事件可驱动；恢复本身不补发已撤销的旧事件。

明确新绑定、显式候选重载、clear、文档失效或cancelCandidates都撤销旧自动意图/句柄；
同绑定pending加入或success no-op不撤销尚有效的自动工作（除从显式暂停恢复的上述情形）。
同绑定locate及普通loadMore均不撤销当前有效ready记录，也不更新§6.13.3的已涵盖事件基准；
这包括failed/cancelled后重试、真正续页、pending加入和success no-op。底层发了新请求并不自动涵盖旧事件。
显式reloadCandidates撤销旧自动意图，并在子reload调用/pending发布前建立新基准；此前事件由该显式重载涵盖。
从cancelCandidates暂停中恢复时优先适用撤销/恢复规则，不能按普通loadMore保留规则重放已撤销事件。
状态不因内部代次数字单独发布；但refresh从非null清为null等可见变化必须发布，不能因子命令no-op漏通知。
所有内部命令原Promise在获得时立即安装结算处理，包括当前意图在同步通知中已经释放/改变的情况；过期只抑制发布，不省略结算。

#### 6.13.3 index.ready的有限自动重查

SDK onIndexReady不回放历史事件；本模型从自有候选首次查询前即订阅，不接管未知的旧pending/partial。
SDK回调只记录就绪事件/当前意图，不直接调用reload或通知外部监听器；实际重查安排在本轮同步调用和相关候选命令结算以后。
不在输入读取/模型通知/失败诊断过程中重入子命令，不用sleep或轮询等待ready。

**事件记录与涵盖边界（C16已审修订）：** 对每个有效绑定意图区分“已记录的最新ready”和“已涵盖的ready”。
这里的顺序只指本协调器收到SDK回调的先后，不推断Core索引时间，不新增公开序号字段。
有效绑定且未暂停/释放时收到的事件先记录；晚于已涵盖基准且未被撤销的事件，才可驱动自动重载。
“记录”不等于已消费；“涵盖”表示该事件不能再驱动该意图的自动工作；“撤销”丢弃旧意图的全部记录及排队资格。

新绑定、从暂停恢复、显式reloadCandidates都先完成验证及旧意图撤销，再在调用子候选命令前建立新基准；
此前事件不转交新意图，之后收到的事件才属于新意图。恢复命令即使是no-op，也不能复活旧事件。
实际自动重载在当前资格与queryAt检查通过后，紧接调用私有reload之前一次截取最新已记录事件作为已涵盖基准。
这个边界严格早于该重载的pending/refresh发布及监听回调；进入SDK source.resolve时不再次截取。
因此pending监听器内同步收到的新ready属于基准之后，即使底层尚未调用SDK；它不被本次自动重载涵盖。
自动命令后续成功、失败、取消或异常都不回退已涵盖基准；重试同一事件不能因命令失败而恢复资格。

| 命令或状态变化                                             | 对ready记录/已涵盖基准的影响                                                    |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 新绑定locate、合法显式reloadCandidates                     | 按上文边界建立新意图/基准；旧记录和排队工作撤销                                 |
| cancelCandidates后合法locate/loadMore/reloadCandidates恢复 | 建立新意图/基准，仅接受恢复边界后的事件；优先于下行普通命令规则                 |
| 未暂停的同绑定locate、普通loadMore                         | 保持记录/基准，含失败或取消后发首请求/续页、pending加入、partial或末页no-op     |
| 实际自动reload                                             | 在pending发布前一次涵盖已记录事件；此后新事件保留，SDK调用不重设基准            |
| 原候选任务成为failed或cancelled                            | 终态本身不撤销记录/改变基准，也不自动重试；显式cancelCandidates仍按暂停规则撤销 |
| success且所有已提交页complete                              | 不触发重查，不据此消费仍未涵盖事件；后续显式命令仍按上述规则                    |
| 非法命令、同文档load no-op/join、success文档cancelDocument | 不改变有效候选意图或基准                                                        |
| clear、文档失效、换绑定、dispose                           | 撤销旧记录/排队资格；旧事件不传给之后的绑定                                     |

在上述记录/基准规则下，按当前候选状态决定是否执行：

| 交错/当前状态                                 | 协调动作                                                    |
| --------------------------------------------- | ----------------------------------------------------------- |
| 无绑定，或已暂停/释放                         | 不排查询；以后新点击不继承这次事件                          |
| 当前success包含partial页，ready到达           | 排队一次从第一页重载，完整性元数据在真正重载前保持原样      |
| 当前pending，ready先到，随后partial成功       | 记录ready；等原命令结算后从第一页重载，不能漏掉这次ready    |
| 当前pending，ready先到，随后全部页complete    | 不重载；保留完整前缀/next，不顺便自动loadMore               |
| 当前pending，ready先到，随后failed/cancelled  | 不自动重试；未显式撤销时保留事件，后续显式恢复partial可使用 |
| 已success且所有已提交页complete（含尚有next） | 不自动重查或预取                                            |
| 多个ready在一次排队执行前到达                 | 合并为一次；在上述pending前边界一次涵盖最新已记录事件       |
| 自动重载再次partial但没有更新ready            | 保持partial，不循环、不定时重试                             |
| 自动重载截取基准后又收到ready，随后partial    | 含pending监听内事件；原命令结算后再按未涵盖事件重载一次     |
| 排队后换文档/点、clear/cancel/dispose         | 原意图失效，队列执行时丢弃，不触发SDK查询或恢复旧绑定       |

同一就绪事件对同一有效意图至多触发一次自动重载；多个事件允许合并，自动重载次数不超过该意图收到且未撤销的ready次数。
没有尚未涵盖且未撤销的ready事件不得再次自动重载。
检查当前原document身份/exact、绑定意图、暂停/释放状态和候选终态后，才调用queryAt及候选reload。
不得只比较query字段：同文件/同点的新document或取消后再点仍是新意图。
自动重查只作用于候选，不自动重读磁盘、重编译、替换文档或推进Selection。

**两条确定序列（均从新绑定开始，无额外事件、监听异常或撤销；各自动回复也为partial）：**

1. B-NAV-Q1：首请求pending → ready E1 → not_found失败 → 显式loadMore重试 → partial。
   失败时停住，不创建refresh、不自动查询；E1仍未涵盖。loadMore不更新基准，其命令结算后E1驱动一次从首请求自动reload。
   总共3次source.resolve（原失败、手动重试、自动重载），只创建H1一个自动refresh；H1.completion正常完成。
   自动重载已涵盖E1，第三次partial后停止；不以“仍为partial”再次刷新。原not_found拒绝仍由原显式命令反馈。
2. B-NAV-Q2：首请求partial → E1 → 自动重载截取E1、发布pending/H1 → pending监听内同步E2 → SDK发送 → partial。
   E2晚于截取边界，H1不涵盖E2；H1.completion结算后E2驱动第二次自动reload并创建不同的H2。
   总共3次source.resolve（初始、第一次自动、第二次自动），自动句柄依次H1/H2，两个completion各自正常完成。
   H2涵盖E2且成为当前refresh；调用者保留H1仍可观察其结算。H2再次partial且无新事件时停止。

对照：Q1中将手动loadMore改为显式reloadCandidates会撤销旧E1，故其partial后无额外自动重载；
在恢复前执行cancelCandidates、clear、换绑定或dispose同样不能重放E1。Q2中若E2在自动截取边界之前到达，
则E1/E2合并为一次自动重载/一个句柄；没有后续事件就不因partial再刷。

#### 6.13.4 自动命令可观察性、通知与释放

每次实际启动自动重查分配一个SourceNavigationRefresh句柄；document/offset指向其启动绑定。
completion为本次自动协调命令的桥接Promise，不承诺等于私有候选reload返回的Promise。
在首次公开句柄之前创建并安装内部拒绝消费；正常从首个候选pending通知起即可读到该句柄。
候选查询失败的原HierError/SourceCandidatesError保留身份；候选状态success但公开监听器抛错时，completion仍须拒绝AggregateError。
只有原模型失败诊断已经存在时才引用它，不能把通知失败伪造为Core查询失败或强行改success为failed。

句柄保留至下一实际自动重查、显式候选重载、绑定失效/暂停/clear/dispose；候选同绑定的分页更新保持其身份。
completion成功或失败本身不再发布一套任务状态；查询状态仍由candidates.state表达，通知/命令异常由completion反馈。
宿主订阅发现新句柄后立即观察它；晚反馈前复查未释放且model.state.refresh===捕获句柄，防止旧命令错误覆盖当前面板。
内部catch只防无人观察时的unhandled rejection，不把公开completion改成成功、不丢掉原拒绝值。
它不是持久化字段或可撤销句柄；调用者保留旧句柄仍能观察最终结算。

排队资格丢失发生在分配前时不创建句柄；分配后同步通知中dispose必须撤回当前引用，并结算旧completion。
同步调用异常同样必须结算：保持绑定时发布可观察句柄并拒绝对应异常，已失效时只结算旧句柄，不恢复状态。
无论是否当前，都必须观察已经产生的子命令原Promise；不能因代次失效提前return造成悬挂等待方。

subscribe先同步检查disposed，失败抛SourceNavigationError(disposed)，再检查listener为函数，非法时抛TypeError；
注册不立即通知，每次调用独立注册，退订幂等。SourceNavigationError.name为"SourceNavigationError"，message不冻结。
发布先提交冻结state，再按注册顺序快照通知；新增注册下次生效，已退订不调用，dispose停止余下回调。
监听器返回值不await；宿主自管其异步回调。同步抛值全部收集，不阻止其余有效监听器、不回滚状态。
由对应显式命令或自动completion以AggregateError拒绝，errors按本次命令实际通知顺序保存原抛值；
若该命令本已有失败，则cause为原失败。即使没有子模型通知的纯协调变化，其监听异常也归该协调命令。
本层不把监听异常抛回SDK index事件回调，不阻止其他SDK订阅者；不能只读candidates.state.error而漏掉success后的通知失败。
同一次底层任务的加入者各自Promise结算，继承同一批任务通知抛值；不把私有订阅桥的实现细节新增成多层通知AggregateError。
内部清理命令的失败归启动清理的协调命令；被替换旧任务的cancelled仅结算旧等待方，不使正常新load失败。
正常结算先取该命令原失败（若有），再把本层监听抛值组成一层AggregateError并以原失败为cause；
无监听抛值时直接使用原失败，成功则resolve。监听器自己抛出的AggregateError按一个原抛值保留，不递归展平调用方对象。

除自身disposed/reentrant_change错误外，输入/查询错误沿原模型类型及身份；同步未知调用异常保留原抛值拒绝，不尝试二次读取cause。
不为新协调器扩展旧SourceDocumentError/SourceCandidatesError/SourcePositionError联合。
dispose同步幂等：先标disposed并作废排队意图，退订SDK/两个模型，dispose两个自有模型，清聚合状态和监听，不关闭借用SDK。
无释放通知；state/snapshotId/disposed仍可读。未结算显式命令及completion以SourceNavigationError(disposed)拒绝；
若释放前已登记原失败或监听抛值，将按上段规则构成的原拒绝值作为cause，二者皆无时不合成cause。
释放优先，已结算Promise不改写；子模型随后返回的取消/释放拒绝仍消费，不重结算。
原失败须在读取其诊断前登记，不因尚未进入Promise handler丢失或改成私有模型的disposed包装。
未来实施须在共享QueryDataModel内复用任务/通知机制，增加只供自有协调使用的内部阶段/失败登记协作点；
跨子模型的诊断data getter重入也必须拒绝，不能只靠公开subscribe或同步起步标志。旧独立模型无该协作时的默认行为/错误保持。
旧只读data/页/句柄可被调用者保留，不代表可继续查询或显示为当前绑定。

#### 6.13.5 验收、兼容与后续边界

C审/B冻至少覆盖：

- 先ready/options验证、构造无查询、首次请求前订阅、两子模型唯一所有权、释放不关闭借用SDK。
- 实际渲染文档严格身份、changed禁点、合法位置在span外、同绑定no-op/加入、不同发布同query强制新页链。
- 文档新pending/失败/取消/clear时绑定同步消失，候选晚页不能重新显示；非法命令保持旧绑定。
- ready先于partial/complete/failed、多个事件合并、自动再partial无循环、刷新中第二事件、排队后取消/清空/换目标/释放。
- Q1失败后普通loadMore保留未涵盖E1、Q2自动pending监听内E2晚于基准；对应显式reload/暂停恢复及截取前合并对照。
- success时cancelCandidates仍暂停及清句柄，后续显式动作恢复资格但不复活旧事件；loadMore前缀与partial/stale_cursor保持。
- completion预登记/实际结算、原错误身份、成功后的监听AggregateError、纯协调通知、通知中dispose、晚反馈身份过滤。
- 无Core/Schema/旧模型默认行为变化、原公开声明与冻结回归、真实SDK/Core页身份与文档重发布能力、平台无关类型。

本单元保留所有原始SourceHit；kind只描述范围类型，ObjectRef/DefRef在当前Schema中均为opaque非空字符串，
不能按kind、前缀、inst缺省或object查询失败构造Selection。用户确认后的权威地址判别属于后续契约。
SourceView显示、候选UI/键盘、Selection、main/preload/Electron、打包与M7预算仍各自验收。
本单元新增L6 API，旧默认命令、Core API/ABI、protocol2/schema7、IPC、生产依赖及工程格式保持；无迁移。

### 6.14 M5 受控只读 SourceView（2026-10-17，运行时已获B22/C22验收）

本节推进M5-A-03的源码展示单元，执行见[运行时计划](plans/M5-source-view-runtime.md)，
隔离声明/消费者见[说明](../web/contracts/source-view/README.md)。现有§6.10–6.13提供文档与导航事实；
本节定义L7受控展示组件。生产`@hier/views`已导出SourceView；A执行结果与独立运行时验收分开记录。
C19/C20认可主干及Q1/Q2补文，B20正式关闭Q1/Q2并补冻19DOM，保留B19的89DOM/28类型/6组包消费。
B22对固定a757417独立通过117DOM/28类型/6包，C22正式关闭C-89；C-88保持C21关闭，修订已原样吸收。
缩放修复与历史原红见[修复计划](plans/M5-source-view-c89.md)；下一可选位置查询交互提案见§6.15，本文已验契约保持。

#### 6.14.1 入口、数据与所有权

```ts
interface SourceViewProps {
  readonly state: SourceDocumentState;
  readonly ariaLabel: string;
  readonly height: number;
  readonly className?: string;
}
function SourceView(props: SourceViewProps): ReactElement;
```

从`@hier/views`新增导出SourceView/SourceViewProps。state直接使用L6已发布的SourceDocumentState，
不另建文本/范围/错误DTO；宿主传`navigation.state.document`或独立SourceDocumentModel的state。
宿主负责订阅、重新渲染及命令反馈；SourceView不收SDK/model/Selection，不订阅模型、不启动读取/请求/Promise，
不持有业务任务、缓存文档副本或改变借用状态。它只保留DOM引用和滚动所需的上次显示文档身份。
props更换立即反映当前状态；卸载不dispose任何借用模型/SDK，不改选择/候选/历史。

ariaLabel必须为非空白原始字符串，作为组件可访问名称使用原值；height必须为有限且大于0的number，
表示整个组件的CSS像素高度；className可省略，给出时必须为原始string（可为空）。
**B-SOURCEVIEW-Q1补文：** JS运行时明确区分省略className与显式传入`className: undefined`：
省略合法，空字符串合法；显式undefined与null、String包装对象及其它非原始string均同步抛TypeError。
不把显式undefined替换为缺省值；这项运行时规则独立于TS的exactOptional检查，声明仍为`className?: string`。
§6.7.1对树可选尺寸的undefined缺省规则保持，不扩展到本组件的className。
这三项按ariaLabel、height、className顺序验证；非法值同步抛TypeError，由宿主React错误边界处理，
不伪造SourceDocumentFailure。字段类型/readonly由TS辅助约束，空白/NaN/Infinity等仍须运行时验证，
不做隐式强转。state按既有合法公开联合值消费，不检测模型来源或把任意伪造的JS对象作为受支持输入。

#### 6.14.2 五态与原文显示

组件有一个以ariaLabel命名的region，包含可见状态信息和独立源码滚动区域。
状态信息不混入源码code节点的文本；pending时region为aria-busy=true，其余为false。
状态消息使用role=status（polite）；不把全文放入live region，不在状态变化时移动焦点。

| state.status | 必须可观察的展示                                                                 |
| ------------ | -------------------------------------------------------------------------------- |
| idle         | “未选择源码”，无源码正文/高亮/前次错误                                           |
| pending      | “正在加载源码”，无前次正文/高亮/错误；不把旧成功文档当作当前内容                 |
| success      | 原始正文；exact显示精确范围或空范围位置，changed按下节警告；空字符串同样是成功   |
| failed       | “源码加载失败”，并以文本显示当前error的origin、code、message；无正文/高亮        |
| cancelled    | “源码加载已取消”，同样显示当前origin、code、message；无正文/高亮，不触发自动重试 |

成功正文的唯一数据源是`state.data.content.result.text`，在`pre > code`的文本节点内呈现，
code.textContent必须与原文逐UTF-16单元相等。BOM、CR、LF、CRLF、tab、尾换行、非BMP字符、空文和HTML样文本均保留；
不split后重拼、不trim/规范化换行、不解析HTML、不添加行号或占位字进入code.textContent。
正文以保留空白、不折行、横纵可滚动的样式显示；视觉布局由浏览器负责，不据视觉行重算源码坐标。
允许浏览器原生文本选择、复制和键盘滚动，不提供编辑/contenteditable、拦截剪贴板或编造复制内容。
原文DOM保真不等于操作系统剪贴板换行格式承诺；本单元不定义自有剪贴板转换。

失败/取消只读取已有类型的origin/code/message字符串，作为普通文本显示；不读取error.data/dataIssue，
不遍历/JSON.stringify诊断、不追踪cause、不探测扩展属性或执行其getter。
没有独立异步任务，故不新增onCommandError或一套pending/settlement；宿主继续观察原模型命令。

#### 6.14.3 精确范围与源码变化

location.status为exact时，只用L6已验证的`location.range.start.offset/end.offset`半开UTF-16区间。
非空区间通过单一mark包裹对应原文片段；其textContent必须等于text.slice(start,end)，
前后片段和mark拼回整份原文，不重新扫描UTF-8、物理span、行列或token，不clamp/修复范围。
可见位置说明使用已有start/end的line/column，放在code之外；不通过内容重算坐标。
mark提供突出样式，且位置说明按下述Q2规则通过aria-describedby关联正文容器，使范围不只靠颜色表达。

start.offset===end.offset时为合法空范围（包括空文件/EOF）。显示code之外的起点行/列说明和“空范围”，
不得高亮相邻字符、插入空格/零宽字符、把该状态改成无源码。可用无文本锚点定位，其不改变code.textContent。
不要求浏览器原生Selection选中范围，不改变用户选择或焦点。
空范围的位置说明同样必须按Q2关联；空文件、EOF和末尾换行后的EOF均不例外。

location.status为changed时，显示当前正文和可见“源码已变化，位置可能不准”警告，
按Q2通过aria-describedby关联正文容器；不创建exact mark/空范围锚点，不显示旧精确坐标或使用source.result的快照范围猜测位置。
旧快照范围即使大于当前文本也不裁切/高亮；不触发文件重读、快照重编或候选查询。
视图不再解释matchesSnapshot/hash，版本结论只取location.status。

**B-SOURCEVIEW-Q2补文：** 非空exact的位置说明、空范围/EOF的位置说明和changed警告，
都必须由§6.14.4中可聚焦（tabIndex=0）、承担正文横纵滚动职责的**同一个DOM容器**直接以aria-describedby关联。
即使空文或短文没有溢出/滚动条，也使用这个容器。该属性的ID引用列表须包含当前可见说明的有效ID，
说明位于code之外、属于当前组件实例，按§6.14.5保持实例间ID不冲突；不限定ID字符串或属性列表序列化顺序。
仅在外层region或不承担上述职责的pre等节点上关联不能满足要求，额外祖先关联也不能替代正文容器的直接关联。
不限制容器标签：pre等元素若自身同时承担该可聚焦正文滚动容器职责，则是合法目标。

#### 6.14.4 局部滚动与状态切换

正文容器可聚焦（tabIndex=0），也是§6.14.3说明的直接关联目标；宿主保持正常tab顺序，组件不自动focus、不注册全局键盘监听。
成功文档首次显示、data身份变更（即使内容相同）或从非success进入success时，登记一次局部定位：
exact让起点所在行/边界进入**本组件正文容器**的视口；范围跨屏时只保证起点可见，长行支持水平定位。
空范围/EOF按起点定位，空文件停在起点；changed从容器顶部/左侧显示。
实现可用DOM Range或无文本锚点测量，不重新计算文本坐标；只能调整本容器scrollTop/scrollLeft，
不得调用导致父容器/页面滚动的无边界scrollIntoView，也不改变宿主页面/其他SourceView的位置。
定位不使用平滑动画或产品超时；DOM提交后的布局阶段应用，重渲染不能产生滚动循环。
定位可见性保证以正文容器可测且clientWidth/clientHeight均大于0为前提；隐藏初挂或状态栏占满高度时，
保留尚未定位标记，后续本组件首次可测的提交补做一次。同文档仅在尚未定位时允许这次补做。
不注册定时器/ResizeObserver等待外部布局；仅外部CSS改变且无组件提交时不承诺自动定位，宿主显示面板时须使组件重新渲染。

已完成定位后，持续success且data严格同一对象时，新的state包装、ariaLabel/className/height变化及父组件重渲染均不重新定位，
保留用户当前滚动（浏览器因尺寸变化进行的合法边界裁切除外）。不同data才是新文档，即使text/range值相同；
同一data从pending/failed/cancelled/idle恢复也视为重新显示。非success清除正文和上次显示身份。
卸载后的新挂载视为首次显示；不使用全局scrollMem，不跨面板保存滚动或实现会话持久化。
React严格模式重复effect必须给出相同可观察结果；清理后的延迟工作不能滚动旧/新容器，首版不需异步滚动调度。

#### 6.14.5 依赖、包装与兼容

沿既有React技术路线，生产使用React peer `>=18.3.1 <19`，验收固定React/ReactDOM18.3.1，
宿主负责ReactDOM与渲染器；views生产入口不依赖ReactDOM/Node/Electron。
本单元支持客户端DOM渲染；SSR/HTML序列化后的hydration不在本次保真或滚动承诺内，不以服务端HTML解析代替浏览器验证。
web开发依赖固定React/ReactDOM18.3.1及相应类型、Playwright和既有esbuild；生产构建和标准门禁不依赖实验目录。
只读展示使用原生文本DOM，不新增编辑器/语法解析/虚拟化框架；大文档性能在M7验收，本文不承诺未测阈值。

组件样式通过公开`@hier/views/source-view.css`子路径提供，由宿主显式导入。
该出口为随包发布的静态CSS；package exports/types/产物保留现有根入口和版本常量的意义，
验证包外安装tarball后根入口/声明/CSS均可消费、React peer单实例且不依赖实验目录或monorepo相对路径。
必需的保留空白/不折行/滚动/高度布局由组件内置样式提供；公开CSS用于状态/高亮/焦点的视觉样式，
不承载坐标/状态规则。宿主必须导入CSS取得完整展示；缺少CSS也不能改变原文/业务判断或基础布局。
不同实例的说明关联ID必须独立，不依赖内容或裸ref构造会冲突的DOM id。

本节新增L7 API，不修改早期SourceDocument/Navigation行为、C++ API/ABI、protocol2/schema7、IPC、配置/工程文件或插件。
首版无持久化，旧工程加载/迁移不适用；包出口/React peer作为实际公开变更审查，包外消费者验证独立记录。
源码点击→候选、候选键盘交互及确认写入Selection另立契约；SourceHit权威地址判别限制沿§6.13.5，禁止前缀/种类猜测。
main/preload、真实Electron、M5/M6演示壳、M7预算仍各自完成。

#### 6.14.6 实施前独立冻结与验收

C审/B冻须覆盖以下实际DOM/浏览器输入，不以隔离类型、树实验或A助手代替：

- 五态及success→pending/failed/cancelled/idle转换：当前正文/高亮/诊断原子替换，没有旧文残留、额外查询或dispose。
- 原文UTF-16保真：LF/CRLF/孤立CR/BOM/tab/尾换行、非BMP、HTML样字符、空文；mark切片准确、空范围/EOF无伪字符。
- changed当前文本短于/不同于快照时只警告、无旧位置，诊断的data getter/扩展对象不被遍历。
- ariaLabel/height/className输入边界、位置/警告关联、各状态busy/status语义、键盘可滚动与焦点不被抢夺。
- 首次/新data/同data不同state/退出再进入/卸载重挂/StrictMode、多实例局部滚动、长行/跨屏/EOF、隐藏后首个可测提交、尺寸变化及普通rerender保留用户滚动。
- 借用值/模型/SDK生命周期不变，正文不可编辑，无Selection/候选副作用；实际包消费者/声明/React peer/CSS根与子路径。

隔离tsc与逐项负例只验证公开类型形状/readonly/无Node或Electron类型输入；React类型是此L7边界的明确依赖。
C审/B冻结前不实现生产组件；通过后先做真实state→DOM最小链，再边界/包消费与受影响回归，独立验收后进入下一源码交互单元。

### 6.15 M5 SourceView 位置查询交互（2026-10-17，B24独立复验/C24运行时审查通过）

§6.14只读展示已经B22独立验收/C22审查，C-89正式关闭；本节可选交互在固定产品473bfb0配合B设施维护51606dc上，
已获B24独立复验/C24运行时审查通过，C-90/C-91由C本人关闭。原失败保持历史归属，M5整体仍未完成。
历史准备见[位置交互计划](plans/M5-source-position-interaction.md)，实施见[运行时计划](plans/M5-source-position-interaction-runtime.md)，隔离声明和能力见证见
[契约目录](../web/contracts/source-position-interaction/README.md)。源码点查询和快照规则继续以§6.12/6.13为准。

#### 6.15.1 入口、兼容与所有权

同一个SourceViewProps增加可选字段，保留原四项与组件出口：

```ts
interface SourceViewPositionFailure {
  readonly document: SourceDocument;
  readonly utf16Offset: number;
  readonly error: unknown;
}
interface SourceViewPositionQuery {
  readonly locate: (
    document: SourceDocument,
    utf16Offset: number,
  ) => Promise<void>;
  readonly onError: (failure: SourceViewPositionFailure) => void;
}
interface SourceViewProps {
  readonly state: SourceDocumentState;
  readonly ariaLabel: string;
  readonly height: number;
  readonly className?: string;
  readonly positionQuery?: SourceViewPositionQuery;
}
```

省略positionQuery时完整保留§6.14的展示、原文、ARIA、局部定位、类型及包出口行为，没有查询交互/提示。
显式undefined/null不等于省略。完成旧ariaLabel/height/className检查后，再检查已提供的positionQuery为非null、非数组object，
locate/onError均为函数，否则render同步抛TypeError，不调用回调。只读取这两项各一次，不枚举扩展字段、克隆或冻结调用方；
访问器原抛值交React错误边界，不包装为Core错误。每次render捕获的有效配置仅在实际提交后成为当前配置。

宿主拥有SDK/SourceNavigationModel/订阅和配置对象；典型locate为(document, offset) => navigation.locate(document, offset)。
不能直接传未绑定的模型方法后要求组件推断this。SourceView不持有/创建/释放模型、不读取candidates、refresh或Selection。
positionQuery对象身份代表该视图的命令接收方会话；宿主在同会话内保持它的身份，换会话提供新对象。
配置回调更新时同样提供新对象，禁止原地改readonly配置。新包装state或外层render不等于命令会话更换。

候选pending/success/failed/cancelled、partial和refresh由既有L6发布；本组件不复制它们作为第二套请求状态。
每个实际发起动作只保留反馈所需的挂载身份、配置对象、显示document、原offset与本挂载动作次序。
无自动请求、重试、预取、订阅、timer或文档重读。候选UI与确认Selection另立契约，SourceHit不得按前缀/kind/inst缺省猜地址。

#### 6.15.2 显式触发与位置捕获

仅在当前已提交state为success、location.status为exact且positionQuery已提供时启用。
非success和changed不调用locate；changed的旧快照坐标不能借本入口重新解释为有效位置。
启用时提供code之外的可见说明“查询此处对象：双击源码，或在源码选区处按 Alt+Enter”，
说明通过正文滚动容器aria-describedby追加关联，保留§6.14原范围说明关联和独立实例ID。
正文声明aria-keyshortcuts="Alt+Enter"，省略配置/不启用时不宣称快捷键可用。

- **鼠标：** 正文code内容上的主按钮、无Ctrl/Meta/Alt/Shift的dblclick发起一次。单击、拖动、pointermove、
  contextmenu、滚动和复制不发查询，不注册document/window全局事件。不preventDefault双击，不干预浏览器原生选词/Selection。
  同步捕获该次事件clientX/Y、当前显示document和配置；以当前正文DOM的原生caret命中位置取得文本边界。
  使用视口坐标调用caretPositionFromPoint（可用时），否则可用caretRangeFromPoint；不按字符宽度、行高或缩放比例猜偏移。
  命中位置必须落在本实例code内，事件target也须属于该code；状态栏/正文padding/滚动条、别的实例或无有效命中均不查询。
  两接口均不可用时显示code之外的可见提示“无法从鼠标位置查询，请选中文本后按 Alt+Enter”，不伪造offset或调用locate。
- **键盘：** 正文滚动容器接收非repeat、非composing的Alt+Enter，且Ctrl/Meta/Shift均未按下时，
  读取其ownerDocument当前原生Selection。要求恰有一个Range，anchor和focus均位于本实例code内；
  使用focus端点，不排序到range.start，反向选区因此使用其实际活动端。折叠选区也合法。
  无选区、跨实例/跨面板、非正文目标或不启用时不查询，也不阻止原生事件；成功取得本实例位置后才preventDefault。
  不move/collapse/extend原生Selection，不主动focus正文、候选或其他面板。

原生浏览器自身响应用户双击/按键造成的选区或焦点行为不算组件主动副作用；验收须与同样原生操作的对照区分。
不把双击选词结果当指针位置，也不把键盘的focus替换成文档高亮起点。

DOM端点转换只计算code内该边界之前Text.data的UTF-16单元数；Text端点使用其局部offset，
Element端点的offset是子节点边界，按此前子树文本长度累计。mark拆分及无文本定位锚点不增加单元。
不能用innerText、分行拼回、选区显示字符串长度、词法token、字节长度或行号乘宽度推算，不能把状态/说明文本算进去。
空code合法边界为0，EOF为原文text.length；保留CRLF两个单元、孤立CR、tab、BOM和非BMP代理对。
UI不检查/修复UTF-16位置是否切开CRLF或代理对，也不转换UTF-8；这些语义仍由queryAt统一拒绝。
只接受本次仍连接的当前code及其有效端点，不跨ShadowRoot/Portal找宿主源码，不接收调用方篡改后的未知DOM。

取得位置后，在同一DOM事件调用栈内恰好调用一次捕获的locate(document, utf16Offset)，不排队再换成最新document。
宿主必须把这两个原值直接交navigation.locate，不在await之后替换成model.state.document；旧显示文档由L6拒绝为stale_document。
组件不自行调用queryAt重复合法性规则，也不以快照hash/文本值相等合并文档。每个合法用户动作都调用一次，
同点no-op/加入和不同点取消由L6决定；页面渲染、选择变化、自动ready和props更新都不是用户查询动作。

#### 6.15.3 原命令观察、失败与过期反馈

调用locate前捕获本动作标识及onError。捕获同步抛值；公开类型要求Promise<void>，动态边界接受
非null对象/函数且then为函数的Promise或thenable，含跨realm Promise，不依赖instanceof Promise。
只读取then一次并按Promise解析语义观察；then读取/调用抛值作为原失败，非thenable以TypeError失败，不当成功。
任何已取得的返回Promise必须立即登记成功/拒绝处理，即使locate同步触发了文档更换、配置更换或卸载也不能略过观察。
记录成功不制造候选状态/滚动/焦点；原Promise结算归原模型，视图不得将拒绝改成成功、回滚或重试模型。
同步抛值/非Promise失败在当前调用栈后的微任务反馈；异步失败在原Promise拒绝处理时反馈。

反馈前同时核：仍为原挂载、positionQuery严格同一对象、仍success/exact且data严格同一document、
并且是本挂载最近一次实际发起的动作。其一失效就只消费旧Promise，不显示错误、不调用新旧onError、不影响新会话。
一次退出success/exact、移除/更换配置或卸载即撤销旧反馈资格，之后恢复同一data/配置也不能复活旧动作。
单纯同data重渲染、ariaLabel/className/height改变不撤销；没有发起查询的普通点击/无效命中也不撤销。

有效失败恰好一次以冻结的{document,utf16Offset,error}调用捕获的onError；document与error均借用原值，
不深冻、不读取Error.message/code/cause/data/getter，不JSON.stringify/toString，不展开AggregateError；抛undefined也为失败。
同时在code之外显示固定“源码位置查询失败”状态文本，通过正文aria-describedby关联；提示不得改变原文/高亮或强迫滚动。
本地提示只表示命令失败（含成功后监听器抛错），不能把文档/候选的success改成failed，也不能把它解释为“没有候选”。
有效新动作开始或上述反馈资格失效时清除旧命令提示；原生鼠标定位不可用提示独立于模型诊断，
也在下一有效查询或配置/文档失效时清除，不跨挂载保留。

onError同步抛值时，按§6.7既有反馈模式在下一render抛AggregateError([原命令错误, 回调抛值])给宿主错误边界；
不在Promise handler再产生无人观察拒绝。回调返回值不await；返回Promise的异步责任归宿主回调，与既有listener约定一致。
回调同步导致会话失效/卸载后才抛值时不得向新会话发布render错误；原抛值已经由本次回调接收，旧链仅完成清理。
本提案不增加取消按钮/AbortController，卸载/移除配置不dispose或cancel借用模型；模型生命周期继续归宿主。

#### 6.15.4 独立冻结、实施与边界

C审/B冻至少包括：

- 省略配置完整保持原117DOM/28类型/6包；配置成组/optional/函数验证、扩展getter不读、未提交render不启用新配置。
- 双击和Alt+Enter各自真实浏览器输入；单击/拖选/复制无查询；修饰键、repeat/composition、非正文、跨实例/选区对照。
- mark前中后/Text与Element边界、EOF/空文、CRLF/孤立CR/非BMP/BOM/tab原始offset，缩放/滚动后实际caret命中。
- 原生caret接口缺失提示、null/外部命中不查询；反向Selection使用focus，组件不设置Selection或主动focus/滚动。
- 当前文档原值、同data包装与新data区别，事件与locate同调用栈；changed禁点、旧document由实际L6拒绝，不换最新文档掩盖。
- 原Promise在同步失效/卸载后仍观察，成功不重复状态；同步throw/异步reject/undefined/AggregateError/非Promise，原拒绝身份不改。
- 配置/文档更换与退出再恢复、卸载重挂、后发动作覆盖前发反馈；同会话重渲染保持；回调抛值与错误边界无无人观察拒绝。
- 使用实际SourceNavigationModel/SDK查询可观察pending/候选结果，现有B导航/位置冻结回归和包外类型/浏览器消费。

提案轮隔离声明/原生浏览器与既有模型能力见证均不是上述交互实现，不替代C审/B冻结或新的独立端到端验收。
实施复用现有SourceView，公共增量限positionQuery和相关类型；旧提案/报告/冻结保持历史字节，不能改旧oracle取绿。
Core API/ABI、协议/Schema/IPC/依赖/配置持久化/工程格式不变，首版仍无会话持久化。
候选列表/键盘确认、权威地址判别→Selection、main/preload/Electron、演示壳和M7仍按原计划分别完成。

### 6.16 M5 SourceHit 权威地址判别（2026-10-17，C26契约通过/B26冻结）

本节是§6.11.4/§6.13.5中“候选确认前的权威地址判别”增量；不实施候选列表、确认命令或Selection自动提交。
计划见[执行计划](plans/M5-source-ref-kind-contract.md)，隔离类型/Schema与既有Core能力见证见
[契约材料](../web/contracts/source-ref-kind/README.md)。实现与独立验收状态见[运行时计划](plans/M5-source-ref-kind-runtime.md)。

#### 6.16.1 字段与单一事实来源

在既有SourceHit中增加一个可选字段，旧字段的形状/含义保持：

```ts
type SourceRefKind = "definition" | "object";
interface SourceHit {
  ref: ObjectRef | DefRef;
  kind: SourceKind;
  span: SourceSpan;
  inst?: ObjectRef;
  refKind?: SourceRefKind;
}
```

`ref`仍是唯一地址字符串；refKind只标记其地址空间，不另加target、def别名或另一份ref。
definition表示该ref是DefRef；object表示ObjectRef，包括instance/port/signal/process/register等所有已有可命中对象。
`kind`继续只描述源码范围；definition范围可同时命中定义、实例、端口/信号声明，与refKind不等价。
inst仍只保留原发生实例上下文；不以它是否存在、引用文本前缀、范围种类或obj.get请求失败作为判别规则。

新Core的resolveSource公开结果中，每一个实际发出的命中都必须有合法refKind，包括分页/partial结果中的每一项。
权威来源是L3已枚举的身份（当前Identity首项与L2 SourceSequence::Owner），与ref在同一次物化时填写。
不从序列化字符串反解，不在L4、SDK或UI补猜，不新增查定义/obj.get往返，也不维护第二套全量地址表。
L1事实与L2索引不因本字段重建。新字段不参与去重/排序/游标绑定；§5.5.6的范围、全部occurrence、分页/取消/内存约束保持。
新旧输出投影掉refKind后，原字段、命中数量、顺序、next与completeness语义一致；不因标记将定义展开成实例或自动选择第一项。

#### 6.16.2 C++、序列化与wire兼容

在L0增加`enum class SourceRefKind { Definition, Object };`，SourceHit的inst之后追加
`std::optional<SourceRefKind> refKind = std::nullopt;`。现有默认构造和四项聚合初始化仍合法，缺省为空，不能默认猜成Object。
Core查询负责填全；optional用于兼容现有调用方自行构造的SourceHit及旧序列化输入形状，不降低新Core输出义务。
JsonWriter仅在字段有值时输出`"definition"`/`"object"`，缺省时省略、不输出null；对非法强转枚举显式抛std::invalid_argument，
不能越界索引、误写任一合法值或静默按缺省序列化。此为C++调用方非法值，不是新增客户端可请求的业务错误。

权威Schema增加SourceRefKind枚举定义及SourceHit.properties.refKind引用，required保持原ref/kind/span三项；
additionalProperties保持true。生成器同步生成C++结构校验、TS类型/验证器，L5不得手写另一套合法值表。
协议2/schema7沿§5.6.1同版本可选扩展规则保持；旧字段既不新增必填约束，也不改变含义，故不升级协议或要求拒绝旧schema7会话。
方法参数、hello、capabilities、请求/取消/快照关联和错误外壳不变；不用版本号推断某条旧响应一定有refKind。

| 组合/输入 | 明确行为 |
| --- | --- |
| 旧schema7客户端 ← 新Core | 旧验证器允许未知扩展字段；既有只读/分页功能保持，旧客户端无需消费refKind |
| 新客户端 ← 旧schema7 Core，无字段 | 正常解码、原页冻结/发布；显示与分页可继续，地址判别不可用；不得猜测后提交Selection |
| 新客户端 ← 新Core，有合法字段 | 保留原字段，按refKind获得权威地址种类；后续确认单元仍须校验当前候选身份/快照 |
| 字段显式null、数字、布尔、对象、数组、空串或未知枚举 | 新Schema拒绝；SDK沿现有响应结构错误路径protocol_error关闭连接/结算pending，不能降级成缺字段 |
| 字段省略 | 合法兼容输入；不是空字符串、null或object默认值，不能宣称支持权威选择 |

本节无额外capability协商：每个命中有无合法字段即该命中的可用信息；新Core填全由其契约测试保证。
结构验证不尝试解析opaque ref以验证地址语义；例如名字看起来像对象但refKind=definition，消费者须按权威字段处理。
refKind与kind/inst不设置可推导的结构约束，真实Core的语义一致性由公开API/SDK-Core独立测试验证。
JS自造对象的显式undefined不是wire值；隔离TS在exactOptionalPropertyTypes下拒绝，JSON省略策略不成为新默认值。

**C++ ABI边界：** 尾字段追加会改变公开SourceHit的布局及Page<SourceHit>元素尺寸；不保证旧二进制兼容。
实施发布时须从同一版本重建Core静态库与全部C++消费者，包括宿主，不允许新库配旧头文件。
保留源码初始化与方法签名不等于ABI兼容；现有按源码构建/链接流程承接此增量，无稳定二进制插件迁移承诺。
选择尾字段是为保留旧源码与同一查询事实；另造平行resolveSource/SourceHit版本只为维持布局会造成双份契约。
首版无持久化工程格式，无数据迁移或旧工程加载变更；旧dft_planner/ref只读，生产依赖不新增。

#### 6.16.3 后续Selection消费边界与验收

后续确认在合法且当前的候选上，definition映射`{def: hit.ref}`，object映射`{ref: hit.ref}`，
再通过既有SelectionModel.select提交origin=source及该候选绑定的snapshotId。不得加入bits/side、自动instancesOf或改写发生实例。
缺字段时保留旧选择并呈现“地址类型不可用”；确认API、错误类型、动作身份和UI文案属于后续确认契约，本节不新增运行时函数/状态。
有字段也不是确认授权：旧页/旧文档、错误快照或释放后的选择仍不能提交；此处类型消费者只证明地址形状能接入既有Selection。

C审/B冻至少覆盖：

- 新旧SourceHit结构、合法值/省略/非法值、未知扩展、TS精确可选性、旧类型消费者仍可接收新字段；不以缺模块充语义负例。
- Core返回定义及所有对象种类的权威标记，definition范围中的定义/实例/端口/信号不同地址种类；宏/include、共享/逐实例、多发生实例。
- 原字段投影、不同页大小拼接、空页、顺序/去重/next/partial、游标和取消不变；仍仅物化本页及最多一个next探测。
- C++旧默认/聚合初始化、有效枚举/空optional序列化、非法枚举明确失败；消费者重编及三配置构建，无ABI兼容虚称。
- Schema单一生成/JS与C++结构验证一致；旧schema7握手/无字段回复继续正常，新字段非法时既有SDK协议失败路径。
- 旧M3/M4与M5候选/文档/导航/只读及位置交互冻结保持；如B精确对象预期受新增字段影响由B记录窄适配，A不放宽原语义。

C26已通过本契约，B26已冻结类型/结构/SDK/Core/native输入。A26实施Core身份→L0→JSON/Schema→SDK纵向链；
具体执行与独立验收分别记录在运行时计划和REVIEW_LOG，不能把契约通过当作产品验收；候选UI和确认生命周期另立单元。

### 6.17 M5 源码候选的显式确认（2026-10-18，B31独立通过/C31运行时审查通过）

§6.16的权威地址判别及其构建设施已获B29限定复验/C29通过，C-92/C-93已关闭。
本节推进M5-A-03的候选确认命令；执行见[计划](plans/M5-source-confirmation-contract.md)，隔离材料见
[说明](../web/contracts/source-confirmation/README.md)。C30已接受主干契约和B同Reply适配，B已冻结121行为/37类型。
实现与标准接线见[运行时计划](plans/M5-source-confirmation-runtime.md)。固定16b18a0已获B31限定独立通过/C31运行时审查通过；
C本人关闭C-94，B本人关闭B30-Q1并补冻6项Q1/8项Core。本单元验收不等于候选UI或M5整体完成。

#### 6.17.1 所有权与API

在现有SourceNavigationModel增加两个同步方法，构造参数及原八个异步命令保持。
导航模型拥有文档/候选绑定和动作有效性；借用调用方的SelectionModel，既不创建第二份选择状态，也不订阅选择或自动反向加载文档。
页和命中仍为§6.11/6.13的原数据；动作只携带原页引用及项下标，不复制ref、refKind、SourceHit、query或Selection DTO。

```ts
declare const sourceCandidateActionBrand: unique symbol; // 不公开此值或构造器
interface SourceCandidateAction {
  readonly page: SourceCandidatesPage;
  readonly itemIndex: number;
  readonly [sourceCandidateActionBrand]: true;
}
// SourceNavigationModel的增量成员：
createCandidateAction(page: SourceCandidatesPage, itemIndex: number): SourceCandidateAction;
confirmCandidate(action: SourceCandidateAction, selection: SelectionModel): void;
```

动作由该模型签发、浅冻结（page已由SDK深冻结），内部关联签发模型、当前文档绑定和候选页链代次。
不用ref字符串、坐标值、深相等或公开品牌属性证明动作归属。伪造、展开复制、Proxy包装、另一导航模型签发的动作均无效，
不得读取这些外来对象的字段/getter/自定义转换；TypeScript名义品牌只辅助编译，不能取代运行时身份校验。
不为全部候选预建动作数组；只为显式调用签发，模型不能强持有无限增长的已签发动作列表。旧冻结动作可留在调用方供展示，不能因此获得新代次的确认资格。
未来视图在绑定候选行/事件时保存对应动作，确认时交回该动作；不得临时替换成最新页/新签动作以掩盖过期点击。

#### 6.17.2 当前页、签发与失效

两方法先检查本导航模型disposed，再检查其输入/命令/通知/诊断重入及进行中的确认；分别同步抛SourceConfirmationError(disposed/reentrant_change)。
这里包含创建动作；宿主不能在导航通知栈内签发，而应在通知完成后的呈现/事件绑定阶段取当前页。
只读state/snapshotId/disposed、subscribe/unsubscribe/dispose沿原规则；原八个方法仍以Promise拒绝，不能改成同步抛错。

**B30-Q1补明（沿§6.13.2）：** 命令保护覆盖同步输入读取/起步调用栈及已规定的通知、诊断读取、确认阶段；
pending状态或尚未结算的Promise本身不构成重入。SDK公开方法覆写在同栈source/resolveSource起步内调用两新方法，
按reentrant_change拒绝；obj.source答复后，离开原同步起步栈的readSource异步续步若不处于其它规定保护阶段，
两新方法按下文普通校验顺序处理（例如create为not_ready，confirm依动作先判断invalid_action/stale_action）。
不将SDK调用的全部异步动态区间扩为保护阶段，也不改变原八方法的Promise与保护语义；B原Q1六输入由B据补文另行冻结。

createCandidateAction随后按顺序检查：

1. 当前文档为success，严格等于当前候选绑定的document且location为exact；候选state为success。否则not_ready。
2. page必须严格等于当前已提交pages中的一个原Reply；不探测参数属性，副本/裸result/不在当前pages中的页为invalid_page。
   若并发合并使两模型持有同一个原Reply，该页在本模型中也可签发，但新动作只属于本模型，不能跨模型确认。
3. itemIndex须为原始number、非负安全整数且小于该页items.length；-0按0存，禁止字符串/强制转换/包装对象，非法为invalid_index。
4. 签发冻结动作；无SDK请求、选择写入、导航状态发布或通知。缺refKind也允许签发，后续确认必须报告address_unavailable。

动作有效性由**页链代次**及原文档绑定决定，不能复用§6.13自动ready的intent/covered计数代替：

| 事件 | 已签发动作 |
| --- | --- |
| 同绑定locate的pending加入/success no-op；普通loadMore追加、加入或no-op | 原页仍在同一链中，动作保留；是否此刻可确认另按状态判断 |
| 后续页pending、失败或取消，保留原前缀；cancelCandidates仅暂停自动重查 | 代次不变；非success时暂不可确认，后续同链续页成功可再用；success时暂停本身不禁用明确确认 |
| 合法locate换绑定；failed/cancelled同绑定locate实际从首请求重启 | 在新页链pending对外发布前使旧动作失效 |
| reloadCandidates及实际开始的ready自动重载 | 在重载pending发布前使旧动作失效；仅收到/排队ready而尚未开始，不提前失效 |
| 文档新pending/换文档/clear/dispose；旧绑定消失 | 在旧绑定失效时同步使动作失效；相同text/hash/FileRef/坐标的新文档也不能继承 |
| 非法/重入而未接受的旧命令、真正no-op | 不单独失效；dispose始终按上行处理 |

按§5.6.6，source.resolve不缓存；连续重载产生内容可相等的新Reply。并发相同请求可合并，不同导航模型可能持有同一Reply，
因此页身份不能代替签发模型归属。页链代次是显式生命周期契约，不以SDK缓存为前提：
即使测试适配器在新代次重新发布相同Reply，旧动作仍为stale_action，只有新代次签发的动作可确认；
此适配器场景不是当前真实Core连续重载的行为。不能只靠pages.includes(action.page)或相同snapshotId判断动作有效性。
stale_cursor的保留前缀只显示：failed时not_ready，loadMore沿原契约拒绝，真正从首请求恢复必须失效旧动作。
动作不因选择变化/历史回退或一次成功确认而自动消费；只要仍有效，可再次确认，Selection自己的同身份no-op保持。

#### 6.17.3 确认、状态与权威映射

confirmCandidate通过入口检查后，按以下固定顺序处理；提交前校验失败不改本次选择/历史或导航状态，提交后的通知异常见§6.17.4：

1. 以签发记录验证action身份，不读取传入对象字段；未由本模型签发为invalid_action。
2. 本模型签发但文档绑定/页链代次已失效，或原页已不在当前链，为stale_action；失效优先于当前新链pending等not_ready。
3. 当前绑定、文档exact以及候选success按§6.17.2检查；仍同链但pending/failed/cancelled为not_ready。
4. 从该动作的原页/原项读取SDK已验证的hit。缺refKind为address_unavailable，保留旧选择，不猜地址、不发obj.get试探。
   合法partial成功页的真实命中允许明确确认；partial及其reasons原样保留，不能把选择成功解释为查询已完整。
5. 校验目的SelectionModel是真实模型实例（包括拥有其基类私有状态的子类），否则invalid_selection_model。
   伪原型对象、Proxy或只有select函数的对象均不接纳，不调用其自定义getter/select。使用本模块原SelectionModel实现的读取/提交边界，
   不分派给外部覆写方法；正常模型的disposed、snapshot_mismatch、输入/通知重入由既有SelectionModel按§6.5处理，原错误对象继续抛出。
6. 在同一同步调用栈中调用一次现有SelectionModel.select，提交恰一个项、origin="source"、snapshotId=本导航绑定值：
   definition→`{def: hit.ref}`，object→`{ref: hit.ref}`。不加bits/side，不以inst替换ref，不展开instancesOf，不自动选第一项或多选。

Selection必须绑定同一snapshotId；无绑定内存模式/异快照模型由原SelectionError(snapshot_mismatch)拒绝。
本层不另存选择/current/history，不重实现去重、相等、历史或通知规则；创建动作不接受目标Selection，也不订阅/释放它。
确认不执行异步请求、文件读取、任务取消、重载或导航通知，没有新增pending/cancelled状态；同步返回void表示本次调用完成，失败同步抛出。
原查询任务的pending/success/failed/cancelled和自动refresh.completion保持，UI按实际模型状态解释确认是否可用。

新导出SourceConfirmationError extends Error及只读code：disposed、reentrant_change、not_ready、invalid_page、invalid_index、
invalid_action、stale_action、address_unavailable、invalid_selection_model。message非空、不冻结文案常量；无新增wire错误/状态诊断对象。
address_unavailable对应可呈现的“地址类型不可用”；本节不规定候选列表布局/键盘或其它UI文案。

#### 6.17.4 提交后的通知、重入与释放

从确认入口到Selection.select完成的整个同步区间，导航模型保留确认保护。Selection监听器内对该导航调用原八个命令，
仍返回拒绝SourceNavigationError(reentrant_change)的Promise并且不读取新输入；对两新方法同步抛SourceConfirmationError(reentrant_change)。
不把另一模型的命令笼统禁止；宿主须消费每个原Promise。dispose、订阅/退订、只读状态仍按原规则立即可用。

确认通过原select提交后，Selection通知可能抛AggregateError。不得把这个异常转换为“未选择”、吞掉、回滚历史或自动重试；
沿§6.5继续通知其它有效注册并原样同步传播错误，调用者重新读取selection.current了解已提交状态。
同identity的选择沿原no-op：不增加历史/通知，也不为了把旧origin从tree改成source而强制发布；提交参数的origin恒为source不等于current.origin必改变。
Selection监听中dispose导航立即失效动作但不追溯撤销已提交选择；监听中dispose Selection自身按原规则清空并停止后续通知，
本层不得恢复它或在select结束后附加disposed异常覆盖原结果。若监听还抛错，保留原Selection通知错误。
所有退出路径释放确认保护；本层不新建通知队列/错误缓存，不把旧页晚反馈、index.ready或确认成功转为自动确认循环。

#### 6.17.5 兼容、参考与独立冻结清单

这是既有导航模型的L6增量，原构造/8个命令/状态结构保持，SourceCandidatesModel/SelectionModel默认语义不变。
未来可能调整内部页链代次协作以记录真实起步边界，不能新增第二套query/pages事实或按新旧对象碰巧不同推断代次。
公开C++/ABI、Core/IPC、protocol2/schema7、生成器、依赖/配置/工程格式不变，无持久化迁移。
沿HAL SelectionRelay共享选择与origin反馈抑制的职责思想，复用本仓库§6.5实际实现；不复制旧全局store或Qt代码。
候选列表/键盘、UI绑定接线、Selection→源码自动加载、main/preload/Electron、demo、M7仍是后续单元。

C审/B冻至少覆盖以下可观察行为，A隔离类型与既有能力见证不能替代：

- 原/复制/伪造/Proxy/异模型页或动作、索引原语与范围、品牌不可构造、冻结/原页身份，外来属性不可被读取。
- 同链追加/加入/no-op保持；失败/取消/partial/stale_cursor的展示与确认资格；清空/新绑定/文档发布/显式及自动重载失效。
- **独立测试适配器在新代次再发布同一个Reply**仍拒绝旧动作，签发新动作可用；真实SDK另核不缓存/并发合并；失效必须先于pending通知，不靠异步时间窗。
- 新/旧schema7合法缺refKind，object/definition与kind/inst不一致但权威值明确；所有occurrence原地址、不猜前缀/多查Core。
- 默认/错误快照/已释放/伪目标/子类覆写目的模型；九种本地错误及原Selection错误的优先级、身份和无错误写入。
- 同身份no-op及origin/历史保持；真实通知AggregateError发生于提交后、重入旧异步/新同步方法、两模型各自dispose、保护退出恢复。
- 所有原声明/冻结、Selection/SourceNavigation/SourceView回归，真实SDK/Core的权威标记与完整/partial原页保留；无新增请求或自动选择。

### 6.18 M5 源码候选列表与键盘确认（2026-10-18，首版及C-100修复已独立验收）

最新状态：依据 REVIEW_LOG 2026-10-18 用户决定，以下主契约与既有106 DOM/30类型冻结已足够进入首版实施。
生产 SourceCandidatesView、公开类型/根出口、CSS及标准门禁已实现，见[生产计划](plans/M5-source-candidates-view-production.md)。
B50独立验证固定0cdee6e的原106 DOM/30类型、包外四探针/六额外类型与完整check.sh通过；C50正式关闭C-99，同时提出真实生产缺陷C-100：旧手势外部释放后首次独立点击被吞。A按既有§6.18.3修复点击配对，并将B50同类别两条回归接入标准入口；固定41c517c/f080dbc已获B51原冻结复验通过及C51代码审查通过，C由提出方正式关闭C-100；原G01/G02及新增两例同时成立，实际证据见该计划与REVIEW_LOG。Q1/堆/trusted/读屏/跨平台为并行复核或实现后加固，不阻塞生产修复；M5整体仍未完成。

以下记录实施前契约和测试积累，其历史“未放行/未实现/待补冻”描述不覆盖上述用户新决定：
§6.17在固定16b18a0获B31独立通过/C31代码审查，C-94与B30-Q1已分别由提出方关闭。
本节推进M5-A-03的实际候选展示与显式操作；[执行计划](plans/M5-source-candidates-view-contract.md)及
[隔离类型](../web/contracts/source-candidates-view/README.md)是本轮交付，生产组件尚未实现。
C32接受所有权/原动作/焦点主干，C33已在7a1675f/4d80e42上关闭C-95，修订见[计划](plans/M5-source-candidates-view-c95.md)。
B32原56 DOM/30类型、B33新增8项分页、B35新增8项原动作、B36新增6项跨页、B37修订6项指针、B40新增6项微任务签发/撤销、B41新增6项焦点/局部滚动、B42新增2项同步错误反馈、B43新增3项回调内失效/最近操作、B44新增3项未提交render及B47新增2项会话切换手势输入构成部分冻结（106计划DOM）；B32-Q2保持B限定关闭。
Q1原Promise消费观察及其余差额仍待B补冻/C审。调用/原返回值记录的恢复修订已获C35限定复核，仍不证明实际组件消费；
C36限定认可B35动作输入并关闭C-96；C37限定认可B36跨页六项，C38限定认可B37规范纠正及指针六项。
B38已冻结76项并修订三个核验入口的组合-pe识别，原样导入后原生Node20/22/24定向回归通过；C39已正式关闭C-97。
B39回执JSON排版修订已原样吸收并获C40限定复核通过；原八条回执、失败记录和历史pins保持。
B40最终9b46六项及前提纠正已获C41限定接受；14设施/5浏览器前提通过，六DOM缺组件而0执行。
B41两笔已原样导入，新15设施/5真实模型与SourceView测量前提通过，六DOM能力阻塞；已获C42限定接受。
B42两笔已原样导入，C43确认来源及历史17/4/28结果，指出S02漏检全局同步异常（C-98 Medium）。
B对应五笔设施修订已原样导入；旧漏检实际重现，最终四组对照可区分，74Node/4原浏览器前提通过；C44已正式关闭C-98。
B43三项部分冻结已获C44限定接受，5浏览器前提通过；S01/S02及T01–03目标DOM分别执行0/阻塞2和3，Q1观察边界不变。
B44最终fa52范围已原样导入，12新Node/5浏览器前提/30相关旧设施通过，三DOM执行0/阻塞3；C45已限定接受。
B44-SCOPE-01保留未提交阶段瞬时Navigation.subscribe次数为诊断/未覆盖；本三项只覆盖受控Suspense及显式同栈重试，不证明全部并发路径或完整退订。
B45包外专项四笔已原样导入，21Node设施通过；真实12 tarballs严格离线安装后四probe执行4/通过1/失败3。
原SourceView根/类型回归及React单例通过；候选根出口/组件及Props/Command/Failure具名导入/CSS缺失，新增六包外类型负例执行0/阻塞6。C46已限定接受测试输入/设施及导入，B45-INPUT-01由B46关闭；不计组件交付。
B46原生Promise堆诊断四笔已原样导入，10parser通过；固定Chromium下12pending结构记录与2unsupported-settled、五原堆/70投影回读通过。
该诊断已获C47限定认可，可继续pending子集透明桥接探索；尚无实际模型→UI事件桥接，两个单分支reaction仍无法区分角色，settled不支持，不是Q1正式oracle。
B46-FACILITY-01由B47按收窄证明范围关闭；原Runtime.evaluate及HeapProfiler.collectGarbage两个20秒watchdog均保留，不称暂停内GC成功。
B47四笔会话切换手势输入/清理修订已原样导入；先复现修前两清理控制1过1失败，最终14Node/3浏览器前提通过，两个目标DOM执行0/阻塞2。C48认可所声明会话判据及原清理修复，新增C-99/Medium：第二套模型部分构造失败时Nav/Client漏释放，设施整体尚未通过。
B47-FACILITY-01由提出方B修复关闭：清理失败保留原setup/cleanup对象及cause。G01换模型对、G02仅换Selection，同位置旧配套手势零调用后独立AT确认一次；synthetic前提不当trusted设备或读屏验收。
C-99由A48复现、C49核对复现证据成立；B49六笔冻结/共同context回滚修订已由A49原样吸收，见[修复导入计划](plans/M5-source-candidates-view-c99-import.md)。最终14项固定旧helper为3过11失败、修后14过，原C反例转绿，162相关Node/59浏览器前提通过；C-99保持开放、待C定向复核，不改变G01/G02预期。
B48真实公开pending命令→普通React事件截止桥接三笔已为B49的67输入pins/162回归补齐原始来源；C尚未审，本轮仅包含其六设施及两个正常命令回归，不执行七浏览器诊断/56堆回放。旧B48档仍按原helper核历史pins，不用当前修后根冒称匹配；不批准正式UI oracle或Q1关闭。
原Promise消费Q1、连续原行新代次stale_action等完整组件差额保持。
这不是完整组件实施放行，不重开已验收的§6.17及其标准接线。
本节采用§6.7的借用模型视图方式；§6.14的SourceView继续接受受控文档state，两者通过同一宿主/导航模型组合。

#### 6.18.1 公共入口、所有权与输入

```ts
type SourceCandidatesViewCommand =
  | "bindActions" | "confirm" | "loadMore" | "reloadCandidates" | "cancelCandidates";
interface SourceCandidatesViewFailure {
  readonly command: SourceCandidatesViewCommand;
  readonly action: SourceCandidateAction | null;
  readonly error: unknown;
}
interface SourceCandidatesViewProps {
  readonly navigation: SourceNavigationModel;
  readonly selection: SelectionModel;
  readonly ariaLabel: string;
  readonly height: number;
  readonly className?: string;
  readonly onCommandError: (failure: SourceCandidatesViewFailure) => void;
}
function SourceCandidatesView(props: SourceCandidatesViewProps): ReactElement;
```

从`@hier/views`根出口新增以上组件/类型。宿主拥有模型/SDK，并负责SourceView的位置回调与
导航自动refresh.completion的原Promise消费；本组件不代宿主处理它未发起的命令。
组件订阅navigation并读取其原state，使用React同步外部store机制；订阅回调只安排渲染，不执行模型命令。
挂载/普通rerender不查询、不写Selection。无第二份候选页/命中/选择/历史/游标缓存；
只保存DOM、页/项身份到显示行的索引、该行签发动作、焦点与本地反馈，不复制SourceHit或refKind规则。
Selection只作为确认目标借用，不订阅、不显示“已选中”标记；箭头移动的焦点不能写入Selection。

按ariaLabel、height、className、onCommandError、navigation、selection顺序验证。
前三者沿§6.14原始字符串/有限正高度/可省略但不可显式undefined的规则；onCommandError必须为函数。
两模型须是当前包的真实、存活实例；Selection必须有与navigation相同的snapshotId，无绑定、异快照、已释放或伪造模型
均在render同步抛TypeError给宿主错误边界，且该次render不订阅/执行命令。支持对象是按公开API构造的模型，
不把只有同名方法的对象或Proxy当模型。state仍从模型原值读取，不接纳调用方另造状态DTO。
宿主关闭顺序为先卸载视图，再释放模型，再释放SDK；组件卸载/换模型只退订和撤销本地工作，不dispose/cancel借用资源。

navigation或selection身份变化构成新视图会话，清除旧动作/焦点/滚动/反馈；onCommandError身份变更仅撤销旧反馈接收资格，
不重置模型/焦点。StrictMode重放不遗留重复订阅、不查询、不确认；未提交render不签发动作或执行任何命令。

#### 6.18.2 显示、完整性与分页

组件包含以ariaLabel命名的region、独立role=status状态区、可垂直/水平滚动的候选列表和操作区；
height表示整个组件CSS像素高度，宽度随宿主。候选列表使用原生列表及每行一个button；焦点/可操作性见下节。
不向列表声明与Selection无关的aria-selected。诊断和状态不混入按钮的对象身份文本。

navigation.state.candidates为null时显示“尚未查询源码位置”，无旧行/分页操作。
有绑定时按原pages顺序及每页items顺序展示全部已加载命中；空页、重复ref/同值命中不合并、不排序、不自动选第一项。
每行展示原hit.ref、hit.kind、hit.span.file、起止line/column，存在inst时另示原inst；存在refKind时显示“定义”或“对象”，
缺失时显示“地址类型不可用”。字段按文本转义，不解析地址前缀/文件路径、另查obj.get或猜测类型。
未知扩展字段及错误data/dataIssue不枚举、不串行化、不读取其嵌套getter。

| 候选状态 | 展示和交互 |
| --- | --- |
| pending | “正在查询候选”，aria-busy=true；已提交前缀仍显示，行暂不可确认；提供“取消查询” |
| success | aria-busy=false；显示已加载项数，允许具备绑定动作且refKind已知的行明确确认；零项且所有页complete显示“未找到候选” |
| failed | aria-busy=false；前缀仍显示，行不可确认；“候选查询失败”及原error.origin/code/message；提供“重新查询” |
| cancelled | aria-busy=false；前缀仍显示，行不可确认；“候选查询已取消”及原error.origin/code/message；提供“重新查询” |

逐页保留completeness：任何已加载页partial时始终显示“结果不完整”，展示各partial页原reasons的code及存在时的at/detail（按页顺序，不去重），
不能因重渲染、用户选中或零命中隐藏警告。partial零项显示“当前结果未找到候选”，不得宣称不存在。
已加载数量不是总数；有next不显示“全部候选”。

**B32-Q2输入边界：** 未知reason code按原文本保留是显示层的前向保留策略，不是当前SDK接纳新枚举的协议承诺。
当前Schema7的ReasonCode是封闭枚举；本单元合法wire/公开模型验收仅使用该枚举，展示原code及存在时的at/detail，
不能把未知对象字段与未知枚举值等同。未知reason的显示在当前合法模型不可达，标为未覆盖，不记通过；
不放宽Schema/SDK、不伪造NavigationState或改用绕过校验的fixture取得覆盖。未来开放枚举须另审协议兼容。
任何partial页都不能因reason的显示策略变成complete。

操作按钮只调用本导航模型的一个对应公开命令，每次明确激活至多一次，不拼接cursor或自己发SDK请求：

- “加载更多”：仅当候选state为success、已提交pages非空且每页completeness.status均为complete、末页result.next存在时可用。
  pending、无next或含partial页时不可激活、不调用loadMore；保留原partial页的next/reasons，不删除元数据来伪造取尽。
  这是§6.11.2既有续页资格在UI中的呈现，不改变L6在partial时成功no-op的语义。
  失败或取消前缀的恢复本单元统一使用“重新查询”，不推测续页是否可恢复。
- “重新查询”：存在候选绑定且非pending时可用，调用reloadCandidates；partial无论有无next都可显式重查，从首请求恢复。
- “取消查询”：仅候选pending时可用，调用cancelCandidates。

不自动loadMore、不轮询/定时重试，不改变既有ready自动刷新策略。动作按绑定状态显示；自动refresh.completion仍由宿主观察。
原模型失败state与本视图命令失败反馈是两个来源：前者展示查询诊断，后者说明此次交互调用失败，不互相改写。

#### 6.18.3 行动作绑定与过期输入

DOM提交后，以该次提交捕获的navigation原state身份建立行绑定；签发放到当前调用栈结束后的微任务，
避免flushSync/StrictMode使布局阶段仍处于导航通知栈。执行前须确认挂载会话、navigation.state原身份和本次提交仍当前；
若已替换则丢弃该次工作，不能用新state给旧行签发。未提交/已卸载render不得产生签发。
只有当前文档success/exact且为候选原document、候选success才对实际显示行逐项调用createCandidateAction(原page,原itemIndex)。
未完成绑定期间行显示但不可确认，状态区显示“正在准备候选操作”；此状态不伪造导航pending或aria-busy查询状态。
同一提交不会因本地反馈/焦点rerender反复签发；新候选state提交可重新绑定，旧动作不被改写。
任一签发抛值使本批行保持不可确认，按bindActions反馈一次；无自动循环重试，下次实际新state提交或显式重新查询可恢复。
绑定是视图对已呈现行的按需引用，模型不预建所有动作；首版显示所有已加载行，无未测规模/虚拟化承诺。

每个已启用行事件闭包保存其本次签发的原action。确认只调用一次
`navigation.confirmCandidate(action, selection)`，不在事件发生时重新签发、不改用当前页同下标、不按ref/深相等找替代行。
读取refKind只用于展示/不可操作提示，最终资格、代次、地址映射、选择历史与异常全部由§6.17的L6命令决定。
成功不得自动移动选择到下一行、重载文档或把partial显示为complete。

鼠标/触笔/触摸主指针在pointerdown捕获该行当时的动作（未准备好则记录不可用）；配套click使用该原动作。
若期间行被重新绑定而仍存在，不替换成新动作；同会话过期动作由L6明确拒绝并报告原stale_action。
若原行已移除、整个会话已切换/卸载，配套click不执行命令；pointercancel丢弃捕获。一次click最多确认一次。
没有配套pointerdown的click（包括辅助技术激活）使用处理事件时已提交的行绑定，仍不得临时签发。
带Ctrl/Meta/Alt/Shift或非主键的指针激活不确认。DOM更新本身绝不构成确认；旧闭包不能读取一个可变“最新动作”引用来替换其原action。

#### 6.18.4 键盘、焦点与局部滚动

列表采用roving tabindex：有行时首次Tab进入第一行按钮，之后进入记住的焦点行；并不自动focus或选择它。
所有行可被键盘检查，包括旧schema缺refKind和暂不可确认的行；不可操作使用aria-disabled=true及关联说明，
不用native disabled使它从检查顺序消失。空列表有可聚焦的列表容器和关联空态说明。
区域/列表/行/反馈说明ID按挂载隔离，多实例不能碰撞；状态用polite，不把整份列表放进live region。

焦点在行按钮上且无Ctrl/Meta/Alt/Shift时：ArrowDown/ArrowUp移动一行、Home/End到首/末行；边界停住、不循环。
移动只改变本地焦点；允许重复方向键。Enter/Space在keydown时捕获原action并明确确认一次，preventDefault阻止随后原生重复激活/空格滚动；
repeat或isComposing输入不确认，也不产生后续原生确认。禁用行不确认；未支持键、组合键、IME文字输入保持浏览器默认。
Tab/Shift+Tab沿宿主正常顺序离开/进入，Escape不取消模型；操作区按钮保持原生键盘规则。

同原page/项仍显示时追加页或普通rerender保留焦点、用户滚动；不能因新页到达跳到首项。
当前焦点行移除且焦点确在本列表内时，只把焦点交给本列表容器；下一次用户方向导航再进入当前行，不自动确认。
外部焦点不被状态发布抢回；模型切换也不自动focus新行。用户箭头导航仅滚动本列表容器使目标可见，
不移动SourceView、父滚动区/页面，不用无界scrollIntoView。其余状态变化不自动滚动到新候选；合法尺寸裁切除外。

#### 6.18.5 命令结算、反馈与释放

签发/确认同步命令捕获原抛值；loadMore/reloadCandidates/cancelCandidates按原公开Promise消费。
每次实际调用后立即为其**原返回Promise**安装成功/拒绝观察，即使同步副作用已经卸载组件，也先消费该返回值。
不得把只观察派生Promise、当前模型state或unhandledRejection作为原Promise已消费的证明。
同步抛值进入同一失败路径；成功不调用onCommandError，不自动发下一条命令。本节不改变模型命令的pending/success/failed/cancelled。

可见反馈属于当前挂载/模型对、原候选document+utf16Offset绑定、捕获的onCommandError及最近实际发起的视图操作。
绑定消失/换文档或位置、模型对切换、回调替换、卸载/新操作时，旧命令仍被消费，但不显示其迟到反馈或调用旧/新回调。
该操作自身引起同文档/坐标pending→failed等状态不使自身错误失去反馈资格；同绑定ready刷新也不擅自重发操作。
行确认抛出的AggregateError可能发生在选择已经提交后：显示中性“候选操作未正常完成”，原错误交宿主，
不得显示“未选择”、回滚、重试或据错误猜Selection当前状态。

仍有效的失败在微任务反馈阶段至多调用一次捕获的onCommandError，并显示上述中性反馈；failure为浅冻结
`{command, action, error}`，confirm带原action，其他命令为null，error可为任意原抛值，保持身份，不枚举/格式化它。
本地反馈清除于下次实际操作、绑定/会话变化；不能清除模型的原查询诊断。
onCommandError同步抛值时，下一次仍有效render抛AggregateError([原命令错误, 回调抛值])给宿主错误边界；
若回调中已卸载/换会话则不向新会话抛错误，不制造未处理Promise。回调同步返回void，返回值不作后续命令。

卸载使待签发微任务、指针捕获和反馈失效并退订；已经开始的原Promise仍消费，不取消借用模型任务。
无产品超时/后台timer/全局键盘监听，无跨挂载动作列表、滚动或选择持久化。对象保留限当前已显示行和未结算操作所需引用。

#### 6.18.6 兼容、参考与独立验收

新增L7出口及`@hier/views/source-candidates-view.css`静态子路径，沿现有React peer和CSS打包方式，
基础高度/滚动/空白布局内置，宿主导入CSS取得焦点/状态样式。无新生产依赖；客户端React18.3.1 DOM支持，SSR/hydration仍不在承诺内。
借用模型/单一选择源/命令反馈沿§6.7与§6.15；本轮复读ref/hal的SelectionRelay（固定acc899e）关于明确提交与sender通知的接口，
只借鉴共享语义选择和来源，具体生命周期使用本项目§6.17，不复制Qt/全局store。原SourceView继续§6.14/6.15行为。
不改M0–M4 Core/C++/ABI、protocol2/schema7、Electron IPC、Schema、插件/配置/工程文件，无数据迁移；M5整体及真实Electron链另验。

C审/B冻至少覆盖：

- 真实公开模型五态/前缀、空/partial/reasons/next、重复命中、旧schema缺refKind、诊断不可遍历，挂载零查询/零选择。
- C-95分页对照：complete+next可续页；partial+next及partial无next均不可续页、可重新查询；complete首页→partial末页后停止续页且保留完整性/原next。
  普通公开模型链遇partial停止，不构造partial后追加complete的不可达链；未知reason按B32-Q2标当前合法模型不可达/未覆盖。
- 模型/快照与props边界、同步store通知/flushSync/StrictMode、签发微任务与未提交render、换模型/卸载/重复订阅保护。
- 原行page/index/动作身份、追加保持、首请求重启/新文档失效、pointerdown→重绑→click、旧闭包、触摸/取消/辅助激活。
- 实际浏览器鼠标/Enter/Space/组合键/IME/repeat、roving焦点/Tab/缺地址行说明、多实例局部滚动、行移除/外部焦点保留。
- 每个同步/异步命令恰一次、原Promise直接观察（明确观察时点及强反例，不能以最终无unhandled代替）、失败原值/通知后AggregateError/回调再抛/迟到抑制。
- 包外tarball根入口/类型/CSS/peer、真实SourceView位置→导航候选→视图显式确认→Selection链及已有SourceView/导航/Selection回归。

可使用真实SDK+controlled Transport控制响应，并以公开模型方法的透传观察器记录调用/原Promise观察；
观察器不得替换模型行为或预期，具体观察点/负对照先交C审、由B冻结。不把树旧L06/L09–11未补冻自动计作本单元已解决。
本轮隔离类型只说明API可表达；没有候选UI运行时，不可用类型绿代替DOM/纵向链通过。

### 6.19 M5 PropertiesPanel 实例属性增量（2026-10-19，B55 独立通过 / C55 生产接受）

本节推进M5-A-03的实例属性面板，复用已验收§6.9数据模型与§6.5选择。
[契约计划](plans/M5-properties-panel-contract.md)、[生产计划](plans/M5-properties-panel-production.md)记录交付与验证。
[隔离声明与消费者](../web/contracts/properties-panel/README.md)保留历史类型见证，实际组件/类型/CSS由views生产包提供。对象/位段驱动负载、定义候选和自动选择目标协调仍属于完整PropertiesPanel的后续增量；
本节不将实例属性显示等同于这些功能或完整M5验收。原树51项观察设施维护与本节分开推进。

#### 6.19.1 入口、目标与所有权

```ts
type PropertiesPanelCommand = "reload" | "cancel" | "select";
type PropertiesPanelCommandFailure =
  | { readonly command: "reload" | "cancel";
      readonly target: ObjectRef; readonly ref?: never; readonly error: unknown }
  | { readonly command: "select";
      readonly target: ObjectRef; readonly ref: ObjectRef; readonly error: unknown };
interface PropertiesPanelProps {
  readonly properties: InstancePropertiesModel;
  readonly selection: SelectionModel;
  readonly ariaLabel: string;
  readonly height: number;
  readonly className?: string;
  readonly onCommandError?: (failure: PropertiesPanelCommandFailure) => void;
}
function PropertiesPanel(props: PropertiesPanelProps): ReactElement;
```

- 两个模型由宿主拥有，必须是存活的真实公开实例，Selection必须绑定与properties相同的snapshotId。
  ariaLabel为非空白字符串，height为有限正数（面板整个区域的CSS像素高度）；className可省略或为string，
  onCommandError可省略或为function。运行时显式undefined等同省略，类型沿exactOptionalPropertyTypes。
  伪模型、已释放、快照未绑定/不一致或非法props在render同步抛TypeError给宿主error boundary，先于订阅/模型命令。
- 使用同步外部store读取原properties.state与selection.current，每个挂载分别一个订阅；订阅不发查询。
  原InstanceProperties及三个Reply是唯一事实表示，不另造端口/参数DTO、缓存或loading状态机。
  多面板可借用同一模型；卸载只退自己的订阅，不cancel/clear/dispose共享模型，不关闭SDK。
  StrictMode重放不发查询/选择，模型替换创建新视图会话，旧订阅与本地反馈清理。
- **宿主显式调用properties.load(inst)。** 面板挂载、外部Selection、渲染和状态通知均不自动load/reload/clear。
  面板标题始终对应properties当前target；外部选择可与该目标不同，不把它伪装为“当前选择的属性”。
  多选、def、端口/信号的owner解析与自动跟随由后续协调层/宿主负责，不能在L7挑第一项、解析ref或拆pathText。
  因此本单元可以用于固定实例的属性页，也能由未来唯一宿主协调者驱动。

#### 6.19.2 五态与只读展示

| 原state | 展示与可用操作 |
| --- | --- |
| idle | “尚未指定实例”，无查询按钮；不将空target解释为可自动选择第一根 |
| pending | 当前target及“加载中”，仅取消；旧data不继续显示为当前属性 |
| failed | 当前target、稳定code/message及“加载失败”，重试调用reload |
| cancelled | 当前target、稳定code/message及“已取消”，重试调用reload |
| success | 实例概要、端口表、参数表和刷新按钮；原空数组分别显示“无端口”/“无参数” |

这里的target是原opaque ObjectRef；有实例数据时用Core的name/pathText作可读标识，不从ref合成路径。
实例概要显示name、pathText、kind、defName、childCount、hasParamOverrides；原ref/def保留原值，
实例的“选择实例”按钮只在success可用。显示字段如下，不因视图宽度或重复名称丢失行：

- 端口严格按ports.result原顺序显示，身份取原ref：name、direction、kind、type、width、signed、dims、
  interfaceDef、modport。direction/kind保持原枚举含义；可读标签不改变原值。可选字段缺失显示“未提供”，
  width缺失显示“未知”，零宽度显示0，不补1、不从type/dims推算。signed=false不能当缺失。
  dims按原顺序展示每项left/right与packed/unpacked标志，不交换上下界或规范化为新位段。
- 参数严格按params.result原顺序显示：name、value、type、isType、isLocal、isPort、isOverridden。
  value保留Core原文本（含四态/大整数/类型参数文本），不转Number；重复名称不合并，参数无ObjectRef，不能伪造选择目标。
- 本实例增量不展开port.internal的连接/映射、members、attrs或提供编辑；原数据继续在L6完整保留。
  对象/位段连接详情在后续驱动负载单元提供；不能从本表缺少连接列推断“无连接”。
- 文本按文本节点展示，保留文本内容，禁止innerHTML；长标签/参数可滚动查看，不将截断字符串用于身份或选择。
  状态诊断只读L6提供的code/message；dataIssue存在时显示诊断数据读取不完整，不遍历/序列化data或原命令unknown错误。
  三份查询的complete约束由§6.9及SDK保证，不在视图制造partial合并/“部分success”。

#### 6.19.3 明确操作与共享选择

| 明确激活 | 唯一调用 |
| --- | --- |
| success刷新、failed/cancelled重试 | properties.reload() |
| pending取消 | properties.cancel() |
| success选择实例 | selection.select({snapshotId, origin:"props", items:[{ref: 原instance.ref}]}) |
| success选择某端口 | 同上，ref为该条原port.ref；不使用port.internal中的signal |

采用原生button，鼠标主键或Enter/Space一次激活只调用一次；Ctrl/Shift不提供多选编辑，仍明确替换单项。
实际次键不触发选择或查询；保留平台Ctrl主键的明确激活，不能将任意ctrl-contextmenu转成调用。
参数、空态和普通表格文本不产生选择。选择不调用load/reload/reveal；外部多选中ref匹配的实例/端口
用非颜色的“已选中”文本标记，不改Selection中的bits/side或历史；明确整端口激活才替换为单个无bits/side的ref。

动作绑定最近已提交视图的原模型会话、发布state和原target/ref。处理前核当前模型仍存活且state身份/状态匹配；
模型已发布新state而React尚未提交时，旧DOM也不能对新目标操作。跨目标/会话的未完成指针手势不转移给新按钮；
旧闭包/已移除行不能用新数组索引代替原ref。无效旧动作零模型调用，不能自动重试到新目标。
此处只保护用户输入的来源，不在视图复算模型的取消/重载规则；reload沿§6.9，不承诺绕过SDK缓存重发wire。

#### 6.19.4 结算、反馈与焦点

事件同栈调用原方法并捕获同步抛值；select仍同步void，不用async包装延后其选择提交。
对模型返回的原Promise立即登记成功/拒绝处理，所有迟到拒绝仍被消费。同步失败反馈在当前栈后的微任务，
异步失败在结算之后；都在模型通知之外发生，不回滚已提交的Selection/属性state，不重试。

failure.target是**动作开始时的实例target**；select另带实际选择的原ref，两者不会在迟到结算时改成当前对象。
error保留原抛值/拒绝身份，包括AggregateError、undefined及非Error值。回调存在时每个有效失败恰一次通知；
无回调时显示固定“操作失败”。回调同步再抛时，下一render以AggregateError([原错误, 回调错误])交宿主boundary。
回调取动作开始时最近已提交的onCommandError；同会话随后更换回调不将旧失败转投新回调，未提交render不能改变该捕获。
回调签名为同步void，若调用方返回Promise，其拒绝由调用方负责，沿现有视图约定。

卸载、换任一模型、动作开始后目标发生切换/clear时撤销该动作的本地反馈，即使目标随后回到原ref也不复活。
同一目标的pending→success/failed/cancelled正常结算不使当前动作失效；本地错误在下一明确动作或目标/会话切换时清除。
本地反馈只保留最近明确动作；旧动作仍消费结算但不覆盖较新的反馈。模型状态失败照常显示原L6诊断，不因有回调而隐藏。

面板为有ariaLabel的region，包含原生标题/语义表格/表头/按钮及可读任务状态，pending区域标aria-busy。
height限定整个区域、宽度随宿主，允许局部纵横滚动。初版采用普通语义表格，不承诺虚拟表格或M7规模预算。
Tab按原生顺序遍历按钮并能离开面板；没有自造grid/树键盘模式。外部选择/数据更新不抢面板外焦点，
当前仍存在的按钮保持焦点；若正聚焦的按钮被移除，焦点回退本面板region，不能跳到另一实例/另一面板。
各挂载的DOM ID隔离。DOM/AX检查与实际读屏分账，不以类型/DOM通过宣称辅助技术或跨平台验收。

#### 6.19.5 交付、兼容与有限冻结

生产阶段增量导出PropertiesPanel及上述Props/Command/Failure，样式子路径@hier/views/properties-panel.css；
既有根出口/三CSS入口保持，沿当前React peer与根入口无Node/Electron/ReactDOM依赖边界，不新增生产依赖。
本增量只新增上述兼容生产出口；IPC、Core ABI、Schema、工程格式不变，新工程无持久化迁移。

参考只读HAL固定acc899e的SelectionDetailsWidget::handleSelectionUpdate和ModuleInfoTable：
借鉴属性分组与共享语义选择，使用已存在的L6/React实现边界；不复制Qt代码/全局单例/编辑菜单。

C审/B冻限定本纵向增量的现有能力：

- 真实公开模型五态、原Reply字段/空集合/重复名/未知宽度/参数原文本及只读文本安全。
- 模型/快照/props有效性、挂载/StrictMode零查询零选择、共享模型订阅/释放与模型替换。
- 明确刷新/重试/取消与实例/端口选择的一次转发、参数来源、原Selection历史及外部多选保持。
- 目标/发布state切换后的旧动作、同目标正常结算和旧目标迟到反馈；原错误与回调聚合。
- 原生键盘/主次键、局部滚动/焦点回退/多挂载，包外根类型/CSS/React peer边界。
- 真实属性SDK/Core数据→面板→Selection的纵向冒烟和已有视图回归；不称Electron IPC。

可复用既有真实模型、controlled Transport和React/浏览器工具；B独立生成预期，A不提供假组件或伪造L6 state取绿。
成本预算、通用观察框架、堆/跨平台/真实读屏为另外的验证边界，不把其枚举当本增量生产前置。
生产822be53已获B55原69/30/3独立通过及C55正式接受；完整M5未验收。树观察设施51红保留，
不阻塞后续已授权单元。对象/位段驱动负载数据单元见§6.20，不扩大本实例增量的验收范围。

### 6.20 M5 对象与位段驱动负载数据契约（2026-10-19，B57 独立通过 / C57 生产接受）

继续M5-A-03剩余属性数据链；[契约计划](plans/M5-object-connections-contract.md)保留准备记录，
[生产计划](plans/M5-object-connections-runtime.md)记录实现/实际验证。C56已接受§6.20，B56已冻结83模型/24类型/5Core，
A已交付生产模型/根出口与标准门禁；B57原83/24/5独立通过，C57正式接受生产及共用输入抽取，无新增缺陷。原[隔离材料](../web/contracts/object-connections/README.md)保持历史类型/SDK见证。
本节新增L6数据单元；实例PropertiesPanel已验收，连接展示及自动目标协调后续单独落实。

#### 6.20.1 入口与权威数据

```ts
type ObjectConnectionsTarget = {
  readonly slice: Readonly<Pick<SliceRequest, "ref">> & {
    readonly bits?: Readonly<Pick<RequestedBitRange, "lsb" | "width">>;
  };
  readonly reach: ParamsOf<"conn.drivers">["reach"];
  readonly side?: Side;
};
interface ObjectConnections {
  readonly object: Reply<ResultOf<"obj.get">>;
  readonly drivers: Reply<ResultOf<"conn.drivers">>;
  readonly loads: Reply<ResultOf<"conn.loads">>;
}
class ObjectConnectionsModel {
  constructor(client: HierClient);
  readonly snapshotId: SnapshotId;
  readonly state: ObjectConnectionsState;
  readonly disposed: boolean;
  load(target: ObjectConnectionsTarget): Promise<void>;
  reload(): Promise<void>;
  cancel(): Promise<void>;
  clear(): Promise<void>;
  subscribe(listener: () => void): Unsubscribe;
  dispose(): void;
}
```

模型只借用一个ready的SDK，构造固定snapshotId，零查询/零SDK事件订阅；ready前的snapshot原错误同步抛出。
它不拥有Selection、DOM或Transport，不改选择/历史，不由定义、多选或某个实例推断连接目标。
沿§6.9.1的快照边界：裸ref不携带会话证明，来源核对由显式宿主/未来协调层负责；不得声称识别所有跨快照同编码ref。
请求/结果类型均来自现有Schema和SDK，不新增Endpoint DTO、宽度推导或跨目标缓存。

#### 6.20.2 目标捕获与查询语义

load先按§6.9检查disposed/通知及诊断重入，并在整个输入读取中保持本模型的命令重入保护。
只接收非null、非数组object。按slice、reach、side顺序捕获根的自有字段，再按ref、bits捕获slice，
若bits自有字段存在，再按lsb、width捕获bits；slice和bits也须为非null、非数组object。
每字段只探测一次自有descriptor、存在时至多一次Reflect.get；继承字段不参与，未知字段不枚举、不读取。
在所需对象形状可读取的前提下，先捕获上述声明字段，随后只验证自有副本的原语值，不强转输入或读取toString/valueOf。
每个外部探测/Get后检查disposed；调用方抛出的任意值保持不检查，作为invalid_argument的cause；若读取中dispose，则disposed优先且保留该cause。
正常读取后已dispose时不捏造cause。输入期间重入命令以reentrant_change拒绝，不读取重入参数。

ref须为既有ObjectRef验证器接受的原始string；reach必须显式local或hier，side若存在必须inside或outside。
bits省略表示请求整个对象，不补位宽；若存在，则lsb为安全整数且满足UInt，width为正安全整数且满足PositiveInt。
lsb=0（含-0）合法；宽度0不能转换成整对象。显式undefined/null与省略不同，前者拒绝。
无效输入只拒绝本次load，不撤销合法任务、不改变state；成功捕获的目标、slice、bits均自有冻结，调用方后续修改不影响请求。

L6只验证上述结构。ref指向哪类对象、是否存在、位段是否越界以及端口side组合由Core决定；不解析opaque ref、不增加inst.ports查询推导宽度。
Core当前规则仍是信号无side、端口需显式side、顶层端口只有inside；本模型不加默认side，也不在UI复制这些规则。
obj.get可返回实例/process/register等元数据，后续连接查询若不支持则保留原Core错误，不预先伪造空结果。
原Endpoint顺序及kind/queried/ref/inst/bits/at/value/reason/via/source和扩展字段全部保留。
queried是所查对象位坐标，端点bits/at是端点坐标；不能用一个替换另一个，不能把process的ref误当at.ref。

#### 6.20.3 五态、原子发布与partial

ObjectConnectionsState为自有冻结判别联合：idle的target=null，无data/error；pending带冻结target，无data/error；
success带同一target及ObjectConnections，无error；failed/cancelled带target及ObjectConnectionsFailure，无data。
不发布时state身份稳定；旧state、target、data保持可读。

新任务原子发布pending并通知；确认仍当前后调用client.object(target.slice.ref, signal)。
object.result.ref必须严格等于请求ref，否则inconsistent_reply且不启动连接查询。
随后用同一任务signal依次发起client.drivers(target, signal)、client.loads(target, signal)，两调用间不await；
两份回复可任意顺序到达。三份全部成功才一次发布success；data包装冻结并直接持有三份SDK原Reply，不克隆或改写原Reply。
任一当前查询失败按§6.9.2登记首个错误、撤销同任务其余订阅，发布failed/cancelled；原Promise立即被观察，迟到回复不更新状态。

obj.get按现有方法登记只允许complete，非法partial由SDK拒绝。conn.drivers/loads允许partial；
**success表示三个查询均已返回合法回复，不表示连接已complete。** 两份连接的completeness分别原样保留：
一份partial一份complete、两份partial、partial空集合或complete空集合均允许；不合成一个“完整属性”布尔值，
不删除reasons，不把partial映射成失败或“没有驱动/负载”。这种原子发布不合并互不兼容的终态：实际查询失败时仍不发布data。

没有index.ready监听、自动重试、轮询或定时器。partial也是当前success，同目标load仍no-op；
需要重新查询时由调用方明确reload。reload重新调用SDK，缓存/请求合并继续由SDK负责；不承诺三次wire请求或清空complete缓存。

#### 6.20.4 生命周期、诊断与兼容

目标相等只比较ref、reach、side的存在与值、bits的存在及lsb/width数值；省略bits不等同于显式整宽bits。
新输入捕获后才比较；pending同目标加入，success同目标no-op，failed/cancelled同目标重试，异目标撤销旧任务。
reload/cancel/clear/subscribe/dispose和通知、原Promise结算、诊断准备的完整语义直接沿§6.9.3–4及§6.10.4的结算前释放规则，
把模型名替换为ObjectConnectionsModel、目标替换为本节目标；前节“这三个方法没有indexing partial”的事实不适用于本节，partial依§6.20.3。
复用现有TargetDataModel/QueryDataModel和诊断捕获，不复制生命周期实现。只撤销自有SDK调用订阅，dispose不关闭借用SDK。

ObjectConnectionsError的code为invalid_argument、disposed、cancelled、inconsistent_reply、reentrant_change。
ObjectConnectionsFailure含readonly code（模型code或HierError.code）、origin（"connections"或HierError.origin）、message、
data（Reply<Record<string, unknown>>["result"]）、可选dataIssue（原TreeDiagnosticIssue）。
模型错误诊断用origin="connections"及冻结空data；SDK错误code/origin/message/data保持既有安全投影规则。
无通知异常时命令拒绝原SDK错误；未知查询抛值转inconsistent_reply并以cause保留；通知聚合顺序/cause、取消和dispose优先级沿既有模型。
subscribe已dispose先同步拒绝disposed，非法listener同步invalid_argument；unsubscribe幂等。异步命令所有参数/重入/释放错误均拒绝Promise。

生产已兼容新增上述类/类型到@hier/viewmodel根入口；隔离声明仍独立保留，不进入包exports。
旧模型/API、Core ABI、IPC、Schema7/protocol2、配置/插件/工程格式不变，无新依赖；首版无持久化迁移。
参考只读HAL acc899e的endpoint_table_model.cpp源/目标分组方式；采用分组展示思想，保留本项目完整Endpoint，
不复制Qt全局netlist或简化成gate/pin四列表。当前不新增连接展示组件或变更已验收PropertiesPanel props。

#### 6.20.5 有限独立冻结

C审本节具体公开契约；B通过真实HierClient/公开Transport及独立SV输入冻结这一有限数据单元：

- 构造与快照边界、目标结构/省略/side/位段、自有冻结与非法输入保留现任务；输入读取抛值/重入/释放沿既有机制。
- obj.get匹配后发两连接查询、任意结算顺序和三Reply原子发布、空集合/partial原标记/字段/坐标保持。
- 同/异目标、reload、cancel、clear、迟到响应、共享SDK独立消费者、通知/诊断错误与dispose的原结算语义。
- 类型消费者与兼容根出口；真实Core的信号/端口side、位段及partial有限纵向验证。

不重开实例面板69/30/3或旧模型已验收契约，不新增通用观察框架/堆/读屏/跨平台实施前置；
本有限C审/B冻结已满足，A已沿原集合实施。隔离编译/既有SDK见证、A生产自测与B/C独立运行时验收分别记录。

### 6.21 M5 ObjectConnectionsView 驱动负载展示（2026-10-19，B59独立通过 / C59生产接受）

本节继续M5-A-03，用已验收§6.20数据模型提供可组合的连接属性区域；
[契约计划](plans/M5-object-connections-view.md)保留准备记录，[生产计划](plans/M5-object-connections-view-production.md)记录组件/出口/CSS与门禁实现及实际结果；[隔离消费者](../web/contracts/object-connections-view/README.md)验证API可表达性。
PropertiesPanel保留§6.19的实例属性职责；宿主可并列两个区域，或只在信号/端口页面显示连接视图。
这里不增加自动选择目标协调、定义解析、Search或Electron职责，不将连接显示视为完整M5验收。

#### 6.21.1 公开入口与所有权

```ts
type ObjectConnectionsViewCommand = "reload" | "cancel" | "select";
type ObjectConnectionsViewFailure =
  | { readonly command: "reload" | "cancel";
      readonly target: ObjectConnectionsTarget;
      readonly item?: never; readonly error: unknown }
  | { readonly command: "select";
      readonly target: ObjectConnectionsTarget;
      readonly item: ObjectSelection; readonly error: unknown };
interface ObjectConnectionsViewProps {
  readonly connections: ObjectConnectionsModel;
  readonly selection: SelectionModel;
  readonly ariaLabel: string;
  readonly height: number;
  readonly className?: string;
  readonly onCommandError?: (failure: ObjectConnectionsViewFailure) => void;
}
function ObjectConnectionsView(props: ObjectConnectionsViewProps): ReactElement;
```

模型/快照/props验证沿§6.19.1，将properties换为connections：存活真实公开实例、同一绑定snapshot，非空白label、有限正height，
可选string className/function回调，非法输入render同步TypeError，先于订阅/命令。显式undefined的运行时处理与类型exactOptional规则沿该节。
每挂载分别订阅connections.state与selection.current一次；模型状态/原Reply是唯一查询事实，不复制端点DTO或任务状态机。
宿主显式connections.load(target)；mount、StrictMode、外部Selection、状态通知和渲染均零自动load/reload/clear/select。
不补reach/side，不由ref或obj.kind推断连接领域规则，不为端点名称发附加obj.get。
模型由宿主拥有；卸载只退自身订阅，不cancel/clear/dispose模型或关闭SDK。换任一模型建立新视图会话。

#### 6.21.2 五态、完整性与字段

| 原state | 显示与操作 |
| --- | --- |
| idle | 尚未指定连接目标，无查询或选择按钮 |
| pending | 原target及加载中，只有取消，不显示旧data |
| failed / cancelled | 原target、加载失败/已取消、原code/message；重试调用reload |
| success | 对象概要、驱动和负载两个分组；刷新及明确选择按钮 |

目标始终显示原slice.ref、reach、side（省略显示“未指定”）、请求bits（省略显示“整个对象”）。
位段均用分别标注的lsb/width表示，保持0，不推算范围或把省略bits补成数据位宽。success另显示原object.result的name/pathText/kind/inst；
名称/路径不从opaque ref解析，标题描述当前连接目标，不能因为外部Selection不同而伪装为其属性。
failed/cancelled诊断沿§6.19.2，只读code/message及dataIssue提示，不遍历错误data或未知抛值。

驱动与负载**分别**显示各自completeness.status和reasons，reasons按原顺序显示code及存在的at/detail，重复项不去重。
complete空数组显示“无驱动”/“无负载”；partial空数组显示“尚无已返回端点（结果不完整）”，不能等同无连接。
partial有结果也明确显示“不完整”；success不改写成全连接complete，也不自动重试/index监听/轮询。complete附带reasons也照常显示。

两组端点各按原result顺序展示，重复ref/重复行保留，不以ref或名称合并。每行可见：

- kind原枚举；ref、inst；“查询对象位段”queried与“端点位段”bits分列标注，bits缺失为“未提供”，不能用queried补。
- at另显示其原ref与bits，明确为“作用位置”；process.ref与at.ref可以不同，不能互相替代。
- value保留Core四态/大整数原文本，缺失与空文本不同，不转Number；reason显示原码。无ref的const/unconnected/unresolved不制造身份。
- via按原顺序显示每步from(ref/bits)、via、map各段from/to/width、next各项slice(ref/bits)/role/precision；空via显示“无边界步骤”。不重建/补齐路线，不把map当端点bits。
- source存在时显示file/path、start/end的offset/line/column及contentHash；缺失显示“未提供”，没有源文件读取/打开动作或字节坐标转换。

可用语义表格和行内字段分组，初版全部行可访问，不承诺虚拟表格/M7规模；长文本保留全文并允许局部滚动。
仅显示上述声明字段，扩展字段原封不动留在L6，不枚举/JSON序列化未知字段。所有文本用文本节点，不用innerHTML。
B58核明当前合法Schema要求complete的reasons为空且FourStateValue非空；上文相应展示描述是防御性处理，不扩大合法wire输入，也不声称经真实模型覆盖不可达输入。

#### 6.21.3 明确操作与共享选择

success的“选择查询目标”一次调用selection.select，参数snapshotId来自connections，origin="props"，items只有一个ObjectSelection：
ref为原target.slice.ref，bits仅在请求存在时传原lsb/width，side仅在target存在时传原值；reach不属于Selection。
每个有ref的端点行有“选择整个端点对象”按钮，items仅含{ref: 该行原endpoint.ref}，**不携带bits/side**。
这是明确的整对象选择：不能把queried、at、端点bits或查询side转到该动作；process选择process.ref。
无ref行无选择按钮，不用inst、at.ref、via或数组索引补目标。source/via/普通文本不产生隐式选择或查询。

查询目标只有在外部某ObjectSelection的ref、bits存在与数值、side存在与值全部匹配时标“已选中”。
端点按ref匹配外部对象选择，标“对象在选择中”（包括该ref已有位段选择）；definition项不匹配。
显示标记不写Selection；明确按钮替换为上述单项。Selection保留自身去重/历史规则，视图不维护第二套选择。
Ctrl/Shift不提供多选编辑。刷新/重试唯一调用connections.reload，pending取消唯一调用connections.cancel，均不承诺绕过SDK缓存。

原生按钮主键/Enter/Space、次键与平台Ctrl主键、一次转发、发布state身份和未完成指针手势保护沿§6.19.3，
绑定当前已提交会话、原state、原target及上述item；旧DOM不能对新发布state执行。重复端点行也绑定自己的原动作来源。
动作开始后任一次发布的target**对象身份改变**或clear即撤销本地反馈，即使新目标字段相同、或A→B→A在一次React批处理中发生。
这是视图动作来源的保守撤销规则，不实现L6目标值比较；reload和本任务正常pending→终态持有同一target，不撤销自身反馈。

#### 6.21.4 结算与原生可访问性

沿§6.19.4同栈调用、原Promise立即登记成功/拒绝处理、同步失败微任务反馈、原错误身份和最新明确动作优先。
failure.target是动作开始时L6的原冻结target；select的item为该动作传给Selection的自有冻结ObjectSelection（仅声明字段，bits若有也只含冻结lsb/width）。
failure外壳冻结；任意原error不检查、不包装。回调取最近已提交捕获值，存在时有效失败恰一次；无回调显示固定“操作失败”。
回调同步再抛交宿主AggregateError([原错误, 回调错误])；回调中使会话/目标失效时撤销优先。
未提交render不改变动作捕获。换模型/卸载/dispose/目标身份改变时只抑制本地反馈，迟到拒绝仍消费，不回滚模型或Selection。
同会话同target正常结算保留反馈；下一有效明确动作清除旧反馈，无效旧动作不清除。回调返回Promise由调用方负责，签名为同步void。

区域有ariaLabel、原生标题/语义表格/表头/按钮、可读任务状态及各组完整性，pending标aria-busy。
height约束整个区域；Tab原生顺序且能离开。外部选择/数据更新不抢外部焦点；仍存在的按钮保持焦点，
正聚焦按钮被移除且焦点掉到body时回退本视图region，不跳到其它目标或并列PropertiesPanel。DOM ID按挂载隔离。
不新增grid键盘模式。DOM/AX验证与真实读屏/跨平台分账。

#### 6.21.5 交付、兼容与有限冻结

生产兼容新增@hier/views根ObjectConnectionsView及上述三个类型、@hier/views/object-connections-view.css；
既有PropertiesPanel签名/行为与四个CSS子路径保持，沿已有React peer/根入口依赖边界，无新生产依赖。
模型、IPC、Schema7/protocol2、Core ABI、配置/工程格式均不变；首版无持久化迁移。
内部复用两个视图实际共有的命令/手势生命周期，不复制整个面板；纯抽取与新增显示分变更组，旧PropertiesPanel原冻结集合必须保持。

C审/B冻限定本节已有能力：五态与原字段/partial空集合、两种明确选择及来源、借用订阅/替换/卸载、
旧state/目标/指针与原错误结算、原生键盘/焦点/多挂载、根类型/CSS包消费和真实模型→UI→Selection/SDK/Core一条纵向链。
用现有真实模型/controlled Transport/浏览器工具即可，不新增通用观察设施、堆、Q1、读屏、跨平台或旧树51修复作为生产前置。
C59已接受8434579生产及9334545共有抽取；B59以自身b7a95f0请求领取维护在固定生产上独立通过原82浏览器/24类型/3包（6控制另账），旧PropertiesPanel原69/30/3通过。B维护原样接入，C60已定向接受helper修订。原81/82与历史失败保留，不改写成原helper全绿，不等于完整M5验收。

### 6.22 M5 快照搜索分页（2026-10-19，B61独立通过 / C61生产接受）

承接M5-A-03的搜索数据单元；执行记录见[契约计划](plans/M5-search-contract.md)及[生产计划](plans/M5-search-runtime.md)，[隔离声明与能力见证](../web/contracts/search/README.md)只核API表达性和既有SDK/Core能力，不代新模型生产实现或独立验收。
Core §5.5.5是匹配、过滤、命中身份和排序的事实来源；L6提供明确查询目标、任务与原分页结果，未来L7展示与宿主显式选择消费它。

#### 6.22.1 公开入口与输入

```ts
interface SearchQuery {
  readonly snapshotId: SnapshotId;
  readonly text: string;
  readonly kinds?: readonly HitKind[];
  readonly scope?: ObjectRef;
}
interface SearchOptions { readonly pageSize?: number; }
type SearchPage = Reply<ResultOf<"search">>;
class SearchModel {
  constructor(client: HierClient, options?: SearchOptions);
  readonly snapshotId: SnapshotId;
  readonly state: SearchState;
  readonly disposed: boolean;
  load(query: SearchQuery): Promise<void>;
  loadMore(): Promise<void>;
  reload(): Promise<void>;
  cancel(): Promise<void>;
  clear(): Promise<void>;
  subscribe(listener: () => void): Unsubscribe;
  dispose(): void;
}
```

借用ready HierClient并绑定其snapshotId；构造先读snapshot，ready错误先于options访问。options/pageSize完整沿§6.11.1：默认200，自有undefined非法，原始number/安全正整数且通过PageLimit，构造输入错误为SearchError且code=invalid_options。构造不查询、不订阅SDK事件；dispose不关闭SDK，不能重新绑定快照。

load先检查disposed及输入/通知/诊断重入，再投影非null非数组对象。按snapshotId、text、kinds、scope顺序各探测一次自有描述符，存在才Get一次；必需snapshotId/text不从原型取值，不枚举扩展字段。先投影全部顶层字段，再处理自有kinds，最后做值验证及快照绑定；投影抛错或dispose立即停止，不读取后续字段。缺失/非法早字段不抢在后续投影异常前拒绝。

kinds存在时必须为数组（允许普通数组Proxy）；Array.isArray后读取length一次，要求原始number/安全非负整数且不超过2^32−1，再按0..length-1探测自有索引并Get存在项各一次，保存自有副本。洞/继承索引不充当值，记录缺失但完成其余索引投影后验证；不迭代调用方iterator，不枚举额外键。自有kinds=undefined非法；数组元素须为原始string并通过生成HitKind验证。允许空数组、重复和任意顺序，捕获数组冻结且保持原顺序/重复；Core负责集合解释，L6不维护第二套搜索过滤算法。

全部投影后按snapshotId、text、kinds、scope验证：snapshotId通过SnapshotId；text是原始string，通过Text且允许空串/空白/通配字符字面文本，不trim、不转大小写、不拼glob；scope若存在须为原始string并通过ObjectRef，自有undefined非法。scope是否为存在的实例由Core判断，L6不解析ref前缀或路径。最后检查snapshotId等于绑定值，否则snapshot_mismatch；显式声明不能鉴别伪装成当前快照的裸引用来源。

输入投影的重入/异常/dispose优先级沿§6.11.1：所有命令含no-op拒绝reentrant_change，subscribe/unsubscribe/dispose允许；每次外部探测/Get返回或抛错后复查dispose。异常为invalid_argument并保留原cause，已dispose则disposed优先并保留同次抛值；无原异常不造cause。验证完成前不撤销旧任务、不发布/查询。验证后query及kinds均为自有冻结值。

同query比较snapshotId、原text、scope有无/值及kinds有无/长度/逐项值。省略kinds与[]严格不同；重排或增减重复kind可语义等价，但仍视为新L6目标，保留调用者提交的过滤表示；Core/SDK自己的规范化、去重和缓存规则不变。不按调用者对象身份比较。

#### 6.22.2 原页、命中和完整性

SearchState是冻结联合，所有分支有readonly pages：idle的query=null/pages=[]；pending/success持有SearchQuery且无error；failed/cancelled持有query与SearchFailure。pages是唯一已提交命中集合，元素为原SearchPage，原Reply/items/ObjectHit/扩展字段/completeness/next及身份不改，仅state/query/pages包装自有冻结。未发布时state身份不变，不另存items/count/next或自造Hit DTO，不重排/截断/去重重复行。

每次命令至多一页：client.search({text,kinds?,scope?},{limit:pageSize,cursor?},signal)，首请求省略cursor，后续只用末页原next；snapshotId仅本地绑定，不加wire字段。传递给SDK的kinds用已捕获值的普通数组副本，不把readonly类型靠强制转换当可写数组。pageSize固定，不自动扫完全部页。空kinds也调用Core，不能在L6伪造空结果并绕过scope/快照错误。

沿§6.11.2页一致性：items超过pageSize或next重复当前请求cursor/已提交链任一next，拒绝inconsistent_reply，坏页不追加；旧前缀保留，重试仍从未提交cursor开始。reload/新load/clear重置页链，不跨链误判循环。

search允许partial；合法partial页仍success，reasons/next/空items原样保留。全部页complete且末页无next才表示已取尽；partial空不能表示无匹配。有next的完整前缀可loadMore；末页partial时loadMore成功no-op，显式reload从首请求恢复。不由任务success推导结果complete，不自动index.ready重查/轮询。

ObjectHit.kind是本查询的权威判别：definition的ref是定义地址，其他五类是对象地址，不能从字符串前缀猜测。原generated类型复用，不为此修改Schema或新造refKind字段。definition不自动挑实例；实例列表由宿主后续显式instancesOf分页取得。端口与同名signal是两条原命中；process/register展示路径不用于path.resolve。模型不自动Selection.select/reveal/读源码、不从pathText解析祖先。命中选择/定义多实例确认/搜索UI另属有限交互单元。

#### 6.22.3 命令、诊断与所有权

分页命令沿§6.11.3，只把候选query/page/error替换为本搜索类型：

- 新目标load撤销旧任务并发布pending/query/空pages，通知结束仍有效才发首请求；旧等待方cancelled拒绝，无旧终态写入新目标。同query pending加入当前任务（包括后续页），success为no-op，包括partial；failed/cancelled同query load从第一页重启。
- loadMore在idle为no-op，pending加入任务；完整前缀有next时请求一页，pending保留原pages。失败/取消保留已提交页，再loadMore重试失败页；pages=[]重试首请求。穷尽或partial成功为no-op。
- reload有目标无条件清空页链并重启，idle无操作。stale_cursor保留原SDK错误和前缀，该终态loadMore拒绝同一原错误，不自动重发；reload或load重建页链。
- cancel只撤销当前任务、发布cancelled并保留页；clear撤销并发布idle/空页，已idle无操作。两动作自身沿已有通知/释放结算规则，不把原任务取消拒绝混成动作必定失败。晚回复只消费，不能追加、改目标或触发下一页。

SearchError的code为invalid_options、invalid_argument、snapshot_mismatch、disposed、cancelled、inconsistent_reply、reentrant_change。SearchFailure.code为这些码或HierError.code，origin="search"或原HierError.origin，message/data/dataIssue结构沿§6.11.3/§6.6.6。原SDK错误身份不包装，命令拒绝原对象；state诊断是冻结快照，不承诺data与原异常data同一身份。本地data为空冻结对象，意外SDK调用/回复投影非HierError为inconsistent_reply并保留cause；输入投影/构造错误不改成此码。SDK cancelled及本地取消发布cancelled，其它查询错误failed。

subscribe、独立注册/幂等退订、通知快照/重入/异常聚合、诊断中dispose与结算前dispose接管沿§6.9.4、§6.10.4及§6.11.3。listener失败不回滚已发布页，继续通知其他有效注册；负责命令AggregateError拒绝，失败/取消保留原终态错误cause。listener返回Promise不await；调用方须即时消费命令原Promise。dispose同步幂等/无通知，先标记释放，撤销任务/监听并恢复idle；未结算命令disposed拒绝，旧冻结页可读，不能继续充当新会话当前命中。

只退出本模型SDK订阅，不取消共享SDK其它消费者；无第二个请求关联器/缓存/搜索索引。indexing就绪重查是宿主协调职责，沿§6.11.4明确事件先于回复、排队后再核目标/cancel/clear/dispose以及有限重试；本数据单元不宣称自动联动已交付。UI键入草稿/提交与debounce属后续视图，模型只执行显式命令。

#### 6.22.4 兼容与有限交付

已兼容新增@hier/viewmodel根SearchModel/SearchError及Query/Options/Page/ErrorCode/Failure/State类型；C60接受契约、B60有限冻结后A60实现，固定2e230d5（生产6c6ab29/纯抽取9223299）已获B61原100/26/4及相关回归独立通过、C61正式接受，无新增缺陷。保持既有公共调用、Schema7/protocol2、Core ABI、IPC、工程格式和依赖，首版无持久化迁移。生产复用QueryDataModel与内部PagedQueryModel/readPageSize；原候选分页抽取单列9223299，保持原页链token和SourceCandidates行为，原集合及导航回归见生产计划。

C审/B冻限定现有能力：输入与显式快照/过滤区别、只读原页/命中/partial、显式一页与游标恢复、任务取消/旧回复/借用所有权、现有通知和原错误规则、公开类型及一条真实SDK/Core搜索链。无需新增观察/堆/Q1/读屏/跨平台类别作为开工前置。B从规范独立定预期，不使用A消费者/能力见证反推oracle；已有连接视图/实例面板不重开。对应C审/B有限冻结到位后直接实施此模型。

### 6.23 M5 SearchResultsView 搜索页展示与明确选择（2026-10-19，B63独立通过 / C63生产接受）

继续M5-A-03，以已获B61/C61接受的§6.22 SearchModel提供可组合的结果区域；执行见[契约计划](plans/M5-search-results-view-contract.md)，[隔离消费者](../web/contracts/search-results-view/README.md)用于核公开API和真实现有调用链。C62接受契约/B62有限84/26/3冻结后A62已实现，固定db8d3ce（生产f6d337b、共有抽取8effd9e/e093c3a）获B63原集合及旧两面板回归独立通过、C63正式接受，无新增生产修复项，见[生产计划](plans/M5-search-results-view-production.md)。隔离消费者仅作历史表达性见证。
宿主拥有文本草稿与显式过滤条件，提交时调用search.load({snapshotId,text,kinds?,scope?})；草稿不冒充已提交query。原text包括空串/空白/通配字符均原样提交，不trim/glob，不因kinds=[]跳过Core。初版宿主示例使用明确提交，无隐式debounce/轮询；视图负责原结果展示和下述明确操作。路径文本解析、树reveal、源码加载、定义多实例选择与index.ready自动协调仍由后续显式协调单元负责。

#### 6.23.1 公共入口与所有权

```ts
type SearchResultsViewCommand = "loadMore" | "reload" | "cancel" | "select";
type SearchResultsViewFailure =
  | {
      readonly command: "loadMore" | "reload" | "cancel";
      readonly query: SearchQuery;
      readonly page?: never;
      readonly itemIndex?: never;
      readonly error: unknown;
    }
  | {
      readonly command: "select";
      readonly query: SearchQuery;
      readonly page: SearchPage;
      readonly itemIndex: number;
      readonly error: unknown;
    };
interface SearchResultsViewProps {
  readonly search: SearchModel;
  readonly selection: SelectionModel;
  readonly ariaLabel: string;
  readonly height: number;
  readonly className?: string;
  readonly onCommandError?: (failure: SearchResultsViewFailure) => void;
}
function SearchResultsView(props: SearchResultsViewProps): ReactElement;
```

模型/props验证沿§6.21.1，search替代connections：按ariaLabel、height、className、onCommandError、search、selection验证，非空白原始字符串label、有限正height、可选string className/function回调。可选值的运行时undefined与类型exactOptional边界沿§6.19.1；不因类型负例扩大运行时承诺。
模型须为当前包公开构造的真实存活实例，Selection绑定snapshot必须与search相同；无绑定、异快照、已释放、Proxy/伪造实例在render同步TypeError，先于本次订阅/命令。无另造state/DTO输入或第二个SDK参数。

每挂载分别订阅search.state与selection.current，用现有同步外部store方式读取；L6的query/pages/Reply为唯一数据来源。挂载、普通rerender、StrictMode、外部Selection更新、状态通知和未提交render均不自动查询、选择或签发新L6动作。仅允许视图本地DOM/原页身份与行key映射、焦点及命令反馈状态，不缓存一份命中对象/选择历史/next。
宿主先卸载再释放模型/SDK；组件卸载只退自己的订阅和本地工作，不cancel/clear/dispose借用资源。换任一模型建立新会话，撤销旧手势/反馈并清本地焦点/滚动；回调身份变化不换会话、不查询。没有自动订阅SDK的index.ready。

#### 6.23.2 原页、完整性与空结果

组件为以ariaLabel命名的region，有标题“搜索结果”、独立role=status状态区、查询概要、原生结果列表与操作区；height限定整个区域CSS像素高度，宽度随宿主，可局部纵横滚动。

| 原state   | 展示与动作                                                                                 |
| --------- | ------------------------------------------------------------------------------------------ |
| idle      | “尚未执行搜索”，无旧行或查询/选择按钮                                                      |
| pending   | “正在搜索”，aria-busy=true；原query与已提交前缀保持可读，行不可激活；仅“取消搜索”          |
| success   | 已加载数量、原结果；允许明确行选择、重新搜索及满足资格的加载更多                           |
| failed    | “搜索失败”、原error.origin/code/message和dataIssue提示；前缀保持可读但不可选，仅“重新搜索” |
| cancelled | “搜索已取消”及同样原诊断；前缀保持可读但不可选，仅“重新搜索”                               |

query非null时显示原text、kinds与scope：text为空显示“空文本”，空白原文本保留可见空白样式；kinds省略显示“全部种类”，[]显示“空种类集合”，非空按原顺序显示原枚举含重复；scope省略为“全部范围”，存在时显示原opaque ref。界面不解析/排序/规范化这些值，不将宿主尚未提交草稿当作当前查询。

逐页按原pages顺序及页内items顺序展示所有已加载行。每行显示hit.kind、name、pathText、ref、def和存在时inst（缺失显示“未提供”）；所有字段为文本节点，长文本可滚动，不用innerHTML，不从path/地址推导身份。不同原页或不同itemIndex的同值/重复ref行保留，不以ref去重。原page身份加itemIndex标识行，不能仅用当前扁平下标指代跨页来源。首版不承诺虚拟化或M7规模预算。

每页的completeness.status及原reasons可读，reasons按原顺序展示code及存在时的at/detail，重复项保留；只读声明字段，不枚举/序列化扩展或错误data/unknown抛值。当前合法Schema complete要求reasons为空；不为覆盖不可达输入绕过SDK。任一partial页始终有“结果不完整”提示，保留其原next/空items含义，不因success、选择或重渲染隐藏。

“已加载N项”只统计已提交页，不是总命中数。只有success、pages非空、所有已提交页complete且末页无next时，才可标“已取尽当前查询”；在此条件下N=0才显示“未找到匹配”。N=0但有next时显示“当前已加载页未返回匹配，仍可继续加载”；partial零项显示“当前结果未返回匹配（结果不完整）”。空的完整页可以有next，不能据空页宣称无匹配。没有页面时不推断全查询完整。

#### 6.23.3 明确分页与类型化选择

| 明确激活                                                   | 唯一调用                                                                                     |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| success且pages非空、全部complete、末页next存在时“加载更多” | search.loadMore()                                                                            |
| 有query且非pending时“重新搜索”                             | search.reload()                                                                              |
| pending时“取消搜索”                                        | search.cancel()                                                                              |
| success行“选择定义”（hit.kind===definition）               | selection.select({snapshotId:search.snapshotId, origin:"external", items:[{def:原hit.ref}]}) |
| success其它五类行“选择对象”                                | 同上，items:[{ref:原hit.ref}]，无bits/side                                                   |

一次激活只转发一个公开调用，不拼cursor、不直接client.search、不自动扫全页；failed/cancelled的恢复采用reload，不猜失败游标。partial行仍为可明确选择的已知命中，但partial禁止加载更多，恢复通过重新搜索。L6继续拥有分页资格/失败语义，视图只呈现上述可用操作。

ObjectHit.kind为权威地址判别，definition使用该hit.ref作为DefRef（不能改用inst/第一occurrence），其余kind使用该hit.ref作为ObjectRef；不从ref前缀、def、pathText猜目标。origin沿现有external，不新增Selection枚举或自动转换为tree/props。Selection是唯一语义选择渠道，不另设onSelect；不自动树reveal/属性load/源码读取/path.resolve/instancesOf，也不因定义只有一个实例就替用户选实例。

外部Selection中definition项def等于该定义ref，显示“定义在选择中”；对象项ref等于该对象ref显示“对象在选择中”，包含该ref已有bits/side的外部选择。定义和对象命名空间不能混配。标记不写Selection、不修改外部多选/历史；只有明确激活才替换为上述单项整对象/定义选择。重复行标记可以相同，各行动作来源仍独立。Ctrl/Shift不增加多选编辑，文本和焦点移动不选择。

原生button的主键/Enter/Space、次键与平台Ctrl主键的一次激活规则沿§6.19.3/§6.21.3。动作捕获最近已提交会话、原search.state、原query，行另捕获原page与itemIndex；处理前要求模型存活、提交state仍为当前原state且状态/资格匹配。原page必须仍属于该state，index取其原items，不在事件时用当前扁平下标、同ref或深相等页替换。
发布了新state但React还未提交时旧DOM零调用；任何跨已提交state/会话的未完成指针手势都不转投新按钮，包括同query追加页、重新搜索和A→B→A。旧闭包/已移除行不能选择新行。有效新键盘/AT激活使用其独立当前来源；无效旧动作不重试、不清新反馈。这里是UI来源防护，不新增SearchModel的公开action/token API。

#### 6.23.4 结算、反馈与原生可访问性

沿§6.21.4：事件同栈调用，select保持同步；对reload/loadMore/cancel返回的原Promise立即登记成功/拒绝处理，即使命令通知中卸载也消费原拒绝。同步抛值在当前栈后的微任务反馈，异步在结算后；不回滚模型/Selection、不重试、不检查或字符串化unknown error。

failure外壳冻结，query为动作开始时的原冻结SearchQuery；select另带原SearchPage与原itemIndex，引用保持，不复制hit。error保留原抛值/拒绝身份（含undefined/AggregateError）。每个有效失败有回调时恰一次通知，无回调显示固定“操作失败”；模型本身failed/cancelled诊断始终独立展示。回调取动作开始时最近已提交值，不将旧失败转投后来的回调；回调同步再抛则下一render向宿主boundary抛AggregateError([原错误,回调错误])，回调中失效时撤销优先。回调返回Promise由调用方负责，类型为同步void。

按每次模型通知观察query对象身份，任一次改变/clear撤销旧本地反馈，即使A→B→A被React批处理；卸载、换任一模型、dispose也撤销。相同原query的本任务pending→终态、追加页/重载正常结算不撤销自身反馈。仅保留最近有效明确动作；新动作清旧反馈，旧动作结算始终消费但不覆盖较新反馈。未提交render不能改动作/回调捕获。模型值相等比较仍归L6，视图不复制kinds或目标规范化。

Tab按原生顺序遍历按钮并可离开，Enter/Space按原生按钮语义，不新造grid/树方向键模式。外部选择/查询更新不抢外部焦点；仍存在的按钮保留焦点，正聚焦按钮被移除且焦点掉到body时回退本region，不跳到另一行/面板。DOM ID按挂载隔离，状态可读、pending标aria-busy。DOM/AX与真实读屏/跨平台分账。

#### 6.23.5 交付、兼容与有限冻结

已兼容新增@hier/views根SearchResultsView及Props/Command/Failure三类型、@hier/views/search-results-view.css。现有五个CSS入口、React peer与根入口无Node/Electron/ReactDOM依赖边界保持，无新生产依赖。L6、SelectionOrigin、Core API/ABI、IPC、Schema7/protocol2、配置/工程格式不变，首版无持久化迁移。
复用已存在的原生按钮/原Promise/命令反馈机制；如需为query与target提取真正共有的访问边界，纯重构单列并保留PropertiesPanel/ObjectConnectionsView原冻结回归。不得复制整套inspector或建立第二任务状态。

C审/B有限冻结仅覆盖：五态与原query/pages/六类命中/重复行、partial/完整空页有next/取尽区别、明确一页与两种选择；借用订阅/快照/替换/卸载、原state/指针/查询切换与原错误/最近反馈、原生输入/焦点/多挂载、公开类型/CSS包消费及一条真实SearchModel→UI→Selection/SDK/Core链。复用已有模型/Transport/浏览器/包工具，B独立依据本规范定预期，不从A消费者/见证反推oracle。不增加通用观察、堆、Q1、读屏/跨平台或旧树51修复作为实施前置；对应条件满足后立即生产实现。

参考D既有流程一、旧TreeSearch和HAL固定acc899e的搜索栏/代理模型：采用全设计查询与类型化结果选择；本组件直接消费Core/L6分页，客户端过滤算法、Qt全局状态、旧glob/trim和吞错语义不迁入。

### 6.24 M5 定义的实例候选分页（2026-10-19，B65独立通过 / C65生产接受）

继续§6.5的定义选择及M5-A-03搜索链：定义保留DefRef，显式取得其全部occurrence候选，再由后续交互选择实例。固定3ed5a75（生产20a3830、共有runner抽取0d4e5fc）已获B65原91模型/24类型/3Core及5控制独立通过、C65正式生产接受；受影响Search原100/26/4及控制也通过，无新增修复项，见[生产计划](plans/M5-definition-instances-runtime.md)。原[契约计划](plans/M5-definition-instances-contract.md)与[隔离声明/能力见证](../web/contracts/definition-instances/README.md)保留历史表达性验证，不代生产独立验收。Core §5.5.5及def.instances为枚举、顺序和身份的唯一事实来源。

#### 6.24.1 入口、目标与所有权

```ts
interface DefinitionInstancesQuery {
  readonly snapshotId: SnapshotId;
  readonly def: DefRef;
}
interface DefinitionInstancesOptions { readonly pageSize?: number; }
type DefinitionInstancesPage = Reply<ResultOf<"def.instances">>;
class DefinitionInstancesModel {
  constructor(client: HierClient, options?: DefinitionInstancesOptions);
  readonly snapshotId: SnapshotId;
  readonly state: DefinitionInstancesState;
  readonly disposed: boolean;
  load(query: DefinitionInstancesQuery): Promise<void>;
  loadMore(): Promise<void>;
  reload(): Promise<void>;
  cancel(): Promise<void>;
  clear(): Promise<void>;
  subscribe(listener: () => void): Unsubscribe;
  dispose(): void;
}
```

构造借用ready HierClient并绑定snapshotId；先读取client.snapshot，原ready错误先于options访问。options与pageSize沿§6.11.1：缺省200，原始number/正安全整数并通过PageLimit，自有undefined非法。构造不查询、不订阅SDK事件；释放不关闭借用SDK，不重绑快照。

load先检查disposed及输入/通知/诊断重入，再接受非null非数组对象；按snapshotId、def顺序各探测一次自有描述符，存在才Get一次，必需字段不从原型取值，不枚举扩展字段。先完成两字段投影，再按同顺序验证原始string及生成的SnapshotId/DefRef，最后检查snapshotId等于绑定值；否则snapshot_mismatch。不解析ref前缀/路径，不把ObjectRef或名称转换成DefRef；语法验证不能识别伪装成当前快照的引用来源，合法DefRef是否存在由Core判断。

输入异常/dispose/重入优先级沿§6.11.1：外部探测/Get之后复查释放，释放优先且保留同次抛值cause；其余输入读取异常invalid_argument并保留原cause。缺失/非法早字段不抢在后续投影异常之前拒绝；验证成功前不取消旧任务、不发布或查询。所有异步命令的释放/重入/输入错误以Promise拒绝；constructor/subscribe为同步边界。捕获的query自有冻结，同目标比较snapshotId与def原值，不按输入对象身份比较。

#### 6.24.2 原实例页与完整性

DefinitionInstancesState为冻结联合：所有分支有readonly pages；idle的query=null/pages=[]；pending/success持有query且无error；failed/cancelled持有query和DefinitionInstancesFailure。pages是唯一已提交候选集合，元素为原DefinitionInstancesPage，保留Reply/items/InstInfo/扩展字段/completeness/next的原值与身份；仅自有state/query/pages包装冻结，未发布时state身份保持。

每次命令至多一页：client.instancesOf(query.def,{limit:pageSize,cursor?},signal)。首请求省略cursor，之后使用末页原next，snapshotId只作本地绑定，不新增wire字段。items超过pageSize或next重复当前请求cursor/本页链任一已提交next时，拒绝inconsistent_reply，坏页不追加，原前缀和未提交cursor保留；新load/reload/clear重置链。不预取、不重排、去重、截断或按def/body合并occurrence；即使多个实例共享定义、body或名称，仍保留Core原InstInfo。

def.instances的机器登记允许partial，当前Core Lookup正常同步枚举返回complete；L6仍须接受合法partial页并发布success，保留原reasons/next/空items。只有所有已提交页complete且末页无next才表示取尽；partial空不能表示没有实例。loadMore仅沿完整前缀和原next继续，partial时成功no-op，显式reload从首请求恢复。不在L6根据当前实现惯常complete而收窄协议，不把任务success等同结果complete。

InstInfo.ref是该行occurrence的ObjectRef，def是定义；原name/path/pathText/kind等字段不改写，父层或generate定位由Core/Tree既有接口完成，不在候选中另造字段。Core内部共享body不能充当occurrence身份，当前InstInfo未声明body字段。顶层、普通实例、generate内实例及Core返回的blackbox/primitive均保留，不能只保留可展开模块。合法且未实例化的定义返回complete空页；非法地址、失效游标和取消保留Core/SDK原错误，不伪造空成功。

#### 6.24.3 命令、诊断与生命周期

完整沿§6.22.3及其引用的§6.11.3分页命令/通知规则，以DefinitionInstances类型替代Search类型：新load先撤销旧任务，再原子发布pending/新query/空pages，通知结束仍有效才发首请求；同目标pending加入当前任务、success为no-op，failed/cancelled同目标load从首请求重启。loadMore一次一页、pending加入、失败/取消保留前缀并重试未提交页；idle/穷尽/partial成功no-op。reload有目标总是清空链重启；stale_cursor终态loadMore拒绝同一原错误，只有显式load/reload重建链。

cancel只撤销当前任务并发布cancelled/保留页；clear撤销并发布idle/空页；迟到回复只消费。同步幂等dispose先标释放、撤销任务与监听并恢复idle，无通知；未结算命令disposed拒绝，旧冻结页可读。独立注册/幂等退订、通知快照/重入、AggregateError与cause、诊断投影及结算前dispose接管沿原规则；监听器抛错不回滚已发布页，继续其它有效注册，listener返回Promise不await。

DefinitionInstancesError.code为invalid_options、invalid_argument、snapshot_mismatch、disposed、cancelled、inconsistent_reply、reentrant_change；Failure.code为本地码或HierError.code，origin="definition_instances"或原HierError.origin，message/data/dataIssue沿§6.22.3。原SDK错误原样拒绝，state诊断为自有冻结快照；本地data为空冻结对象。SDK调用/回复投影的意外非HierError归inconsistent_reply并保留cause，输入/构造错误保持其专属码。SDK cancelled和本地取消为cancelled，其它查询错误为failed。

不自动读Selection、选第一项、写多选、reveal、解析路径或读源码；调用方显式load定义。查询后哪怕仅一实例也保留原定义选择，后续明确确认才用原InstInfo.ref提交对象选择。自动index.ready协调按§6.11.4另属宿主，本数据模型不订阅或重试；不取消共享SDK其它消费者、不另建缓存/请求关联器/实例索引。

#### 6.24.4 兼容与有限交付

已兼容新增@hier/viewmodel根DefinitionInstancesModel/Error及Query/Options/Page/ErrorCode/Failure/State，原调用保持。实现复用现有QueryInput/readPageSize、PagedQueryModel与QueryDataModel，未修改其已有生产逻辑。标准测试执行边界与Search共用，原输入/根绑定/退出传播保持；新三入口已接test:independent/check.sh，旧树失败保持。无Core API/ABI、IPC、Schema7/protocol2、SelectionOrigin、配置/依赖/工程格式变化；首版无持久化迁移。

C审/B冻结限于本单元输入与快照/定义身份、原页与partial/游标恢复、显式命令/任务/错误与借用生命周期、公开类型和一条真实SDK/Core定义实例链。B依据规范独立设预期，A可编译消费者和既有链路见证不代新模型验收；不扩张观察/堆/Q1/读屏/跨平台作为实施前置。前置满足即直接实现并接既有标准门禁。实例候选UI、选择后宿主联动与真实Electron/M5完整验收另列。

### 6.25 M5 DefinitionInstancesView 定义实例候选与明确选择（2026-10-20，B67独立通过 / C67生产接受）

继续M5-A-03，消费已获B65/C65接受的§6.24模型。宿主明确调用instances.load({snapshotId,def})；视图显示该查询的原实例页，用户明确选择一个occurrence。搜索/外部Selection中的定义不自动变为实例；只有一项时仍需明确操作。固定4374f58（生产d69e141、共有提取ccd07a2）已获B67原84浏览器/26类型/3包及6控制、受影响搜索回归独立通过，C67生产与共享提取接受，无新修复项；见[生产计划](plans/M5-definition-instances-view-production.md)。[原契约计划](plans/M5-definition-instances-view-contract.md)与[隔离声明/宿主组合](../web/contracts/definition-instances-view/README.md)保留历史表达性见证，不代生产独立验收。

#### 6.25.1 公共入口与借用边界

```ts
type DefinitionInstancesViewCommand =
  "loadMore" | "reload" | "cancel" | "select";
type DefinitionInstancesViewFailure =
  | {
      readonly command: "loadMore" | "reload" | "cancel";
      readonly query: DefinitionInstancesQuery;
      readonly page?: never;
      readonly itemIndex?: never;
      readonly error: unknown;
    }
  | {
      readonly command: "select";
      readonly query: DefinitionInstancesQuery;
      readonly page: DefinitionInstancesPage;
      readonly itemIndex: number;
      readonly error: unknown;
    };
interface DefinitionInstancesViewProps {
  readonly instances: DefinitionInstancesModel;
  readonly selection: SelectionModel;
  readonly ariaLabel: string;
  readonly height: number;
  readonly className?: string;
  readonly onCommandError?: (failure: DefinitionInstancesViewFailure) => void;
}
function DefinitionInstancesView(
  props: DefinitionInstancesViewProps,
): ReactElement;
```

props验证完全沿§6.23.1，以instances替代search；顺序为ariaLabel、height、className、onCommandError、instances、selection。label为非空白原始字符串，height为有限正数CSS像素；可选className/function的运行时undefined与exactOptional类型边界沿§6.19.1。两模型必须为当前包公开构造的真实存活实例且Selection绑定同一snapshot；无绑定、异快照、已释放、Proxy/伪造实例在render同步TypeError，先于本次订阅/命令。

每挂载只订阅这两个借用模型，以同步外部store读取state/current；不接受第二个SDK、复制state或自造InstInfo DTO。挂载、普通rerender、StrictMode、未提交render、外部Selection和模型通知不签发查询/选择。实例页可以继续显示宿主已加载的定义，即使外部选择已切到另一定义或实例；query始终明确展示当前页来源，不自动跟随Selection重查或清空。宿主显式换目标/clear，组件不隐式协调index.ready。

本地仅持有DOM行key/原页身份、焦点及命令反馈。换任一模型建立新会话，撤销旧手势/反馈并清本地焦点/滚动；回调身份变化不换会话。宿主先卸载再释放模型/SDK；组件卸载只退自己的订阅/本地工作，不cancel/clear/dispose借用对象。没有实例缓存、分页状态机或选择历史副本。

#### 6.25.2 原实例页、完整性和空结果

组件为以ariaLabel命名的region，含标题“定义实例”、独立role=status状态区、查询定义地址、原生候选表格和操作区。height限定整个区域，宽度随宿主；局部纵横滚动。query非null时显示原query.def；不从ref前缀/名称/路径猜目标，不通过额外查询补定义名。

| 原state   | 展示与动作                                                                                   |
| --------- | -------------------------------------------------------------------------------------------- |
| idle      | “尚未查询定义实例”，无旧行或查询/选择按钮                                                    |
| pending   | “正在查询定义实例”，aria-busy=true；原query与已提交前缀可读，行不可激活；仅“取消查询”        |
| success   | 原候选及已加载数量；允许明确行选择、重新查询及符合资格的加载更多                             |
| failed    | “定义实例查询失败”、原error.origin/code/message及dataIssue提示；前缀可读不可选，仅“重新查询” |
| cancelled | “定义实例查询已取消”及同样原诊断；前缀可读不可选，仅“重新查询”                               |

按原pages和页内items顺序展示所有已加载InstInfo。每行显示原kind、name、pathText、ref、def、defName、childCount和hasParamOverrides（“是”/“否”）；path各原段按顺序作为文本列表可读，不重新拼接成地址或替代pathText。全部五种InstKind原枚举保留，顶层/生成作用域内/blackbox/primitive不按可展开性筛掉；childCount只展示，不推导未加载列表。没有body字段，不按共享def/name/pathText合并实例。

原page身份加页内itemIndex标识一行；跨页和页内同值/重复ref均保留，不能用ref去重或当前扁平下标替换来源。声明字段均作文本节点，长文本/空白可读，不用innerHTML、不枚举或字符串化扩展/unknown值。首版不承诺虚拟化或M7规模预算。

逐页显示completeness.status及原reasons，保持code和存在的at/detail、原顺序与重复。任一partial页始终明示“结果不完整”；success、选择或rerender不隐藏它，不根据当前Core通常complete收窄Schema。合法complete的reasons为空，不为覆盖不可达输入绕过SDK。

“已加载N项”只统计已提交页，不是总实例数。仅success、pages非空、全部complete且末页无next时显示“已取尽当前定义实例”；该条件下N=0才显示“该定义没有实例”。空complete页有next显示“当前已加载页未返回实例，仍可继续加载”；partial零项显示“当前结果未返回实例（结果不完整）”。无页、pending/failed/cancelled不能宣布无实例或取尽。

#### 6.25.3 明确动作与实例身份

| 明确激活                                                   | 唯一调用                                                                                             |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| success、pages非空、全部complete且末页next存在时“加载更多” | instances.loadMore()                                                                                 |
| 有query且非pending时“重新查询”                             | instances.reload()                                                                                   |
| pending时“取消查询”                                        | instances.cancel()                                                                                   |
| success行“选择实例”                                        | selection.select({snapshotId:instances.snapshotId, origin:"external", items:[{ref:原InstInfo.ref}]}) |

一次有效激活恰一次公开调用；不直接client.instancesOf、拼cursor、预取或自动扫完。partial页的已知实例可以明确选择，但禁止加载更多，恢复为重新查询；failed/cancelled沿reload恢复。分页资格和原错误语义归L6，组件只呈现可用操作。加载/分页/取消/重载不改变Selection，单实例不会自动确认。

实例行的权威对象地址为原InstInfo.ref，不用def、path、pathText或首occurrence替换；选择始终为整对象，无bits/side。Selection是唯一语义选择渠道，不增加onSelect或SelectionOrigin枚举。外部对象选择的ref相同（包括带bits/side）时显示“实例在选择中”；仅def相同的定义选择不标记其所有occurrence。标记不写Selection或重排，重复行可同时标记；明确选择才替换成上述单项。Ctrl/Shift不增加多选编辑，文本和焦点移动不选择。

原生主键/Enter/Space、次键与平台Ctrl主键一次激活规则继承§6.23.3/§6.19.3。动作捕获最近已提交会话、原instances.state/query；行另捕获原page/itemIndex，处理前核模型存活、提交state仍为模型当前原state及资格。原page必须仍属于该state，index取其原items；不以同ref/深相等页重定向。

新state已发布而React未提交时旧DOM零调用；跨任何已提交state或会话的未完成指针手势不转投新行/按钮，包括追加页、reload和A→B→A。旧闭包/被移除行不能选择新来源，独立当前键盘/AT激活仍有效。无效旧动作不重试、不清新反馈，不新增L6 action/token公开API。树reveal、属性/源码加载、path.resolve属于后续宿主显式协调，本组件不隐式调用。

#### 6.25.4 结算、反馈和可访问性

完整继承§6.23.4，以DefinitionInstancesQuery/Page和instances替代Search类型/对象：select同栈同步调用，异步命令返回的原Promise立即登记成功/拒绝处理，即使通知中卸载也消费原拒绝。同步抛值在当前栈后微任务反馈，异步结算后反馈；不回滚、不重试、不检查或字符串化unknown error。

failure外壳冻结，query为动作开始时的原冻结查询，select另带原page和页内itemIndex；error保留原身份含undefined/AggregateError。有效失败使用动作开始时最近已提交回调恰一次，无回调显示固定“操作失败”；模型failed/cancelled诊断独立可读。回调同步再抛，下一render向宿主boundary抛AggregateError([原错误,回调错误])；回调内失效以撤销优先。回调返回Promise由调用方负责。

每次模型通知观察原query身份；任一次变化/clear、卸载、换模型或dispose撤销旧反馈，包括批处理A→B→A。相同原query的本次pending→终态、追加页/reload不撤销自身反馈；只保留最近有效明确动作。旧结算始终消费但不能覆盖新反馈，未提交render不改动作或回调捕获。视图不复制L6目标值比较。

Tab按原生顺序可离开，Enter/Space沿原生button，不引入grid/listbox/树方向键模式。外部Selection/查询不抢外部焦点；仍存在按钮保留焦点，被移除的聚焦按钮使焦点掉到body时回退本region，不跳另一行/面板。DOM ID按挂载隔离、pending标aria-busy；读屏/跨平台实测独立记账。

#### 6.25.5 交付、兼容与有限冻结

已兼容新增@hier/views根DefinitionInstancesView及Props/Command/Failure三个类型、@hier/views/definition-instances-view.css。保持原组件/CSS入口、React peer和根无ReactDOM/Node/Electron边界，无新生产依赖或Core API/ABI、IPC、Schema7/protocol2、SelectionOrigin、配置/工程格式变化；首版无持久化迁移。

生产直接复用现有useViewCommands与useInspectorButtons；SearchResultsView和新视图共用内部PagedResults原页展示及paged-result-actions动作资格/来源比较，纯提取ccd07a2保持旧搜索视图原文案、DOM结构与页/行key规则，原84/26/3及控制回归通过。领域字段/选择仍各自明确，L6和任务/反馈机制不变；不建立schema驱动UI框架。

C审/B有限冻结限本视图五态/原页/InstInfo/重复行、partial/空页有next/取尽、一页与明确实例选择；同快照借用/替换/卸载、原state/手势/查询来源和原错误反馈、原生输入/焦点/多挂载、公开类型/CSS包消费及一条真实模型→UI→Selection/SDK/Core链。复用既有工具，B按规范独立定预期，不从A消费者/能力见证反推oracle。对应C审/B有限冻结齐备后直接生产；不增加观察、堆、Q1、读屏/跨平台或旧树修复为实施前置。

沿D既有HAL/Studio研究采用共享语义选择、结果页保留明确查询与宿主拥有协调的分工；不迁入Qt全局单例或另造实例索引。该组件不会据已选实例自动打开/关闭宿主面板，真实Electron及完整M5仍另验。

### 6.26 M5 路径定位数据与结果视图（2026-10-20，B70有限验收通过/C70接受，A70构造问题关闭）

推进M5-A-03明列的path.resolve。模型和结果视图作为同一有限实施单元，契约/冻结齐备后直接一起生产；执行见[计划](plans/M5-path-resolution-contract.md)，[隔离声明/消费者](../web/contracts/path-resolution/README.md)不进入生产包。Core §5.5.5和Schema7/protocol2是路径语法与结果的权威；不重开已接受的搜索/定义实例单元。

A68已实现模型、结果视图、公开根出口/CSS和标准接线，见[生产计划](plans/M5-path-resolution-production.md)。C69确认构造兼容边界后，A69修订正文，B70按正文定向修订原构造用例224be00，独立通过原58模型/83浏览器/40类型/3包及6控制；C70接受正文、窄修订与有限验收。A70原样集成并实际复验58/58，关闭A68-PATH-CONSTRUCTOR-01；first导入问题沿A69已关闭。路径有限单元已获B/C接受，原51/58、57/58及历史失败保留；完整M5及真实Electron仍各自验收。

#### 6.26.1 路径查询模型、输入与所有权

```ts
interface PathResolutionQuery {
  readonly snapshotId: SnapshotId;
  readonly text: string;
}
type PathResolutionReply = Reply<ResultOf<"path.resolve">>;
class PathResolutionModel {
  constructor(client: HierClient);
  readonly snapshotId: SnapshotId;
  readonly state: PathResolutionState;
  readonly disposed: boolean;
  load(query: PathResolutionQuery): Promise<void>;
  reload(): Promise<void>;
  cancel(): Promise<void>;
  clear(): Promise<void>;
  subscribe(listener: () => void): Unsubscribe;
  dispose(): void;
}
```

构造只读取借用的client.snapshot绑定快照；该读取实际抛出的错误原样同步传播，包括未ready或取得快照前已失败/释放的情形。已取得的SDK快照在dispose后仍可读，构造不额外保证SDK活跃。不查询、不订阅SDK事件、不接收Selection，不拥有客户端或重绑快照。新建模型后实际查询的失败沿SDK原错误身份和现有五态规则处理，不另造构造异常。SDK首次以dispose终止时，该原错误为disposed；不覆盖其更早已保存的其他SDK失败。无构造options/分页参数/loadMore，返回值是单次原Reply而非Page。

load的输入读取与优先级沿§6.24.1，以text替换def：先disposed/输入或通知或诊断重入检查；非null非数组对象，按snapshotId、text顺序各探测一次自有描述符，存在才Get一次；两字段投影完成后按顺序验证原始string和生成的SnapshotId/Text，最后核snapshotId等于绑定值。不枚举扩展字段、读取继承值或toString。捕获query自有冻结，目标相等比较snapshotId与text原值。

text逐字转发client.resolvePath(query.text,signal)，不trim、分段、拼顶层、替换斜杠/点号、补转义终止空白或解释ref前缀。空字符串、空白与转义路径都允许通过L6字符串投影；路径语法错误由Core返回bad_request，语法有效但不存在则由Core返回complete空数组。合法UTF/JSON边界仍归既有SDK，L6不再实现编码或路径解析器。显式snapshotId仅用于本地校验，不新增wire字段。

外部探测/Get后的释放检查、抛值cause和重入沿§6.24.1；读取异常为invalid_argument，读取期间dispose优先为disposed且保留同次cause。验证成功前不撤销旧任务、不发布或查询。异步命令的输入/重入/释放错误以Promise拒绝；constructor/subscribe是同步边界。

#### 6.26.2 单次原回复、五态与命令

PathResolutionState为冻结只读联合，未发布时state身份保持：

| status | query | reply | error |
| --- | --- | --- | --- |
| idle | null | 不存在 | 不存在 |
| pending | 原捕获query | 不存在 | 不存在 |
| success | 原捕获query | 原PathResolutionReply | 不存在 |
| failed/cancelled | 原捕获query | 不存在 | PathResolutionFailure |

reply直接保留SDK原Reply、result数组与所有ObjectRef、completeness/reasons及扩展字段的值和身份。只冻结自有state/query/诊断包装；不复制或改写SDK回复，不为复用分页UI制造假page/items/next。Core可能返回多个顶层候选及同名端口/信号，保持原顺序；即使合法受控回复含重复ref也逐项保留，不去重/排序/截断或补查对象元数据。

path.resolve登记allowsPartial=true、cacheComplete=false。合法partial同样发布success并保留原reasons；partial空不能表示不存在。当前Core正常解析通常complete，不能据此收窄协议或把任务success等同complete。本模型不缓存结果、不拼接多次响应、不隐藏partial。

命令/通知/诊断复用§6.9/§6.24.3的既有QueryDataModel规则，区别于分页的地方明确如下：

- 新有效load撤销旧任务，原子发布pending/新query/无reply，通知结束仍有效才发一次resolvePath；不保留旧结果供新目标选择。同目标pending加入当前原任务Promise，success为成功no-op（包括partial）；failed/cancelled同目标load重新请求。reload有query总是撤销当前任务并用原query发起新请求，idle时no-op。
- 当前成功回复一次发布success；晚到/取消/被替代的回复只消费，不发布、不调用Selection或继续查询。失败只发布failed/cancelled和诊断，不伪造空成功。
- cancel仅在pending时撤销并发布cancelled/原query/无reply；原load以cancelled拒绝，cancel命令按自身通知结算。非pending时cancel成功no-op。clear撤销并恢复idle，旧load取消；idle的clear no-op。
- 同步幂等dispose先标释放、撤销任务/订阅、恢复idle且不通知，未结算命令disposed拒绝；已取得的冻结reply仍可读。dispose不关闭借用SDK，不取消共享SDK其它消费者。
- 独立注册、幂等退订、通知快照、监听器读取/订退阅/dispose、禁止命令重入、监听器异常继续传播与AggregateError、诊断投影及结算前dispose接管保持原规则。监听器返回Promise不await；不吞错误或把通知失败改成查询失败。

PathResolutionError.code为invalid_argument、snapshot_mismatch、disposed、cancelled、inconsistent_reply、reentrant_change；Failure.code为本地码或HierError.code，origin="path_resolution"或原HierError.origin，message/data/dataIssue沿§6.24.3。原SDK错误原样拒绝，state诊断为自有冻结快照；本地data为空冻结对象。SDK调用/回复投影的非HierError意外异常归inconsistent_reply并保留cause，输入错误保持专属码。SDK cancelled与本地取消显示cancelled，其余查询错误为failed。不订阅index.ready或自动重试。

#### 6.26.3 结果视图与借用边界

```ts
type PathResolutionViewCommand = "reload" | "cancel" | "select";
type PathResolutionViewFailure =
  | {
      readonly command: "reload" | "cancel";
      readonly query: PathResolutionQuery;
      readonly reply?: never;
      readonly itemIndex?: never;
      readonly error: unknown;
    }
  | {
      readonly command: "select";
      readonly query: PathResolutionQuery;
      readonly reply: PathResolutionReply;
      readonly itemIndex: number;
      readonly error: unknown;
    };
interface PathResolutionViewProps {
  readonly resolution: PathResolutionModel;
  readonly selection: SelectionModel;
  readonly ariaLabel: string;
  readonly height: number;
  readonly className?: string;
  readonly onCommandError?: (failure: PathResolutionViewFailure) => void;
}
function PathResolutionView(props: PathResolutionViewProps): ReactElement;
```

验证顺序及同步TypeError沿§6.25.1，以resolution替换instances：ariaLabel、height、className、onCommandError、resolution、selection；真实模型品牌/存活/同快照检查先于本次订阅或命令。可选props运行时undefined与exactOptional静态边界不变。每挂载仅订阅两个借用模型，换任一模型建立新会话并撤销旧手势/反馈、清局部焦点/滚动；换回调不换会话。

宿主拥有文本输入表单，显式调用load({snapshotId,text})并消费Promise。通用视图仅显示当前查询结果；不保存第二份查询、不渲染提交表单、不从外部Selection反推文本。挂载/普通render/StrictMode/未提交render/外部Selection与模型通知均不隐式load、select或clear。卸载只释放自身订阅/本地工作，不cancel/clear/dispose借用对象；宿主先卸载再释放模型/SDK。

region由ariaLabel命名，标题“路径定位”；height为区域CSS像素高度，宽度跟随宿主并局部横纵滚动。独立role=status/aria-live=polite；pending设置aria-busy。query非null时显示“查询路径”和原query.text，保留空白/换行；原text为空时另标“空文本”，不修改传入值。

| 状态 | 文案与动作 |
| --- | --- |
| idle | “尚未定位路径”；无结果/命令按钮 |
| pending | “正在定位路径”；无旧结果；仅“取消定位” |
| success | 原结果；“重新定位”及各行“选择对象” |
| failed | “路径定位失败”，原error.origin/code/message及dataIssue提示；仅“重新定位” |
| cancelled | “路径定位已取消”，同样原诊断；仅“重新定位” |

success显示“已返回N项”，N仅为原reply.result.length，不称设计对象总数；显示完整性与原reasons的code/存在的at/detail，保留顺序/重复。partial始终明示“结果不完整”；partial空显示“当前结果未返回对象（结果不完整）”。仅success+complete+空数组显示“未找到匹配路径”。idle/pending/failed/cancelled不能据无reply宣布无结果。

原生表格列为“引用”“选择”；按原数组顺序显示全部ObjectRef文本，用原reply身份与itemIndex标识行并保留重复。不能从ref前缀推名称/种类/层级，不额外obj.get或做第二份对象索引。文本安全渲染、不用innerHTML或枚举unknown扩展。首版不承诺虚拟化/M7规模预算。

#### 6.26.4 明确选择、反馈与输入

pending的“取消定位”只调用resolution.cancel()；有query且非pending的“重新定位”只调用resolution.reload()。success行选择仅同步调用selection.select({snapshotId:resolution.snapshotId,origin:"external",items:[{ref:原reply.result[itemIndex]}]})，无bits/side；partial已知对象可选。单结果仍需明确选择；查询/重载/取消不改Selection。没有loadMore、自动挑第一项、选择定义、树reveal或源码/属性加载。

外部对象选择的ref相同（含bits/side）显示“对象在选择中”；定义选择不标记对象，重复ref各行可被动标记。明确选择才替换为上述单项；Ctrl/Shift不引入多选编辑，文本/焦点移动不选择。

动作捕获最近已提交会话、原state/query；行另捕获原reply/itemIndex。处理前检查模型存活、提交state仍为当前模型state、状态资格；select要求state.reply===捕获reply、index为有效整数且位于原数组。新state已发布但React未提交、已移除行/旧闭包、跨提交state/会话的未完成pointer均零调用，不以同ref或深相等回复重定向。原生主键/平台Ctrl主键/次键、Enter/Space/独立AT规则继承§6.25.3，无效旧动作不重试或清新反馈。

完整继承§6.25.4的原Promise即时消费、微任务反馈、最近有效动作/已提交回调、逐通知query身份撤销、同query结算保留自身反馈、无回调“操作失败”、回调再抛AggregateError([原错误,回调错误])及回调内失效优先规则。failure外壳冻结，query/reply/error保持原身份；select带原itemIndex，其它命令不伪造来源。卸载/替换/dispose/任何query变化（含批处理A→B→A）撤销旧反馈，旧结算仍消费。

Tab沿原生按钮顺序可离开，方向键不建立tree/grid/listbox模式。外部变化不抢外部焦点；目标按钮仍在时保留焦点，被移除按钮使焦点落到body时仅回退本region，不跳到另一候选。DOM ID按挂载隔离，状态/焦点与完整性分别表达；读屏和跨平台实测独立记账。

#### 6.26.5 实施、兼容与有限冻结

拟兼容新增@hier/viewmodel的PathResolutionModel/Error及Query/Reply/ErrorCode/Failure/State、@hier/views的PathResolutionView及Props/Command/Failure和path-resolution-view.css。既有入口/CSS/React peer保持；无新生产依赖、Core API/ABI、IPC、Schema7/protocol2、SelectionOrigin、配置或工程格式变化；首版无持久化迁移。L5根及模型不引入React/Node/Electron，视图使用既有React依赖。

模型复用QueryInput/QueryDataModel和原诊断；视图复用useViewCommands/useInspectorButtons，领域投影/选择保持轻量。仅提取确有共有用途的展示，不复制查询/分页/反馈状态机或用假页适配单回复。开发/受影响回归与原标准门禁保留；新入口在对应冻结后接入，旧树失败不隐藏。

C审/B有限冻结针对两字段捕获/快照、原文本/单回复/partial/五态与取消/释放、明确原回复位置选择/手势/错误反馈、同快照借用与类型/CSS包消费及一条真实SDK/Core→Selection链。A能力见证不代新模型/UI验收；不把新增观察设施、堆/Q1或旧树修复列为本单元开工前置。文本表单、自动宿主联动、main/preload/真实Electron与完整M5仍按原计划完成。

### 6.27 M5 固定布局 Electron 演示壳（2026-10-20，C73 审通过/B73 首次冻结）

本节落实既定 `web/apps/demo`，消费已实现的 §6.5–6.26 与 §6.8 生产出口。
[契约计划](plans/M5-demo-shell-contract.md)与[隔离消费者](../web/contracts/demo-shell/README.md)
保留提案阶段记录；[生产实施](plans/M5-demo-shell-production.md)对应
[`web/apps/demo`](../web/apps/demo/README.md)，独立验收以 REVIEW_LOG 为准。
demo 是同仓库可丢弃宿主，不是 Studio 工作区，不增加持久化、
DFT 规则、多窗口会话、图/M6或路径解析器。B72/C72 已接受的宿主与各组件不重新冻结。

#### 6.27.1 打开输入与最小控制桥

main 从可信启动配置取得 Core 可执行文件（开发入口 `HIER_BIN`，默认本仓库 `core/build/hier`）。
renderer 只能选择“HDL 文件”或“文件列表”，以及可选的单个顶层名；main 弹出所属窗口的原生
单文件选择框。顶层名非空、不含 NUL/CR/LF，保持原文作为独立 `--top` 参数，不解析 HDL 名字。
取消选择不关闭旧设计、不清旧选择。文件选择/读取失败显示诊断，不能伪造成功。

main 把用户选择的绝对路径保留在本地，创建不复用的 opaque token；renderer 仅取得 token 和
文件名 label。每个文档至多保留一个未消费选择；新选择开始使旧 token 失效，取消也不复活它。
source 使用 `["serve", ...topArgs, absolutePath]`；filelist 使用
`["serve", ...topArgs, "-F", absolutePath]`，明确采用 Core 的相对文件列表规则。
cwd 固定为所选文件的父目录；include/filelist 解释仍交 Core。renderer 不能提交路径、
command、args、env、cwd 或 shell 字符串。不重写旧 `-f/-F` 语义。

demo 私有桥 `window.hierDemo` 只含 version=1、`pickDesign(options)`、
`openDesign(token)`、`closeDesign(sessionId)`，形状见[生产声明](../web/apps/demo/src/bridge.ts)。
三个固定 invoke 通道是 `hier:demo:pick`、`hier:demo:open`、`hier:demo:close`；
包络分别为 `{version:1,options}`、`{version:1,token}`、`{version:1,sessionId}`。
成功返回 `{ok:true,value}`；失败返回克隆安全的 DemoFailure，无 Error 原型/stack。
native 取消是成功的 null；open 返回新 `{sessionId,label}`，不捏造 snapshot 或 ready。
DemoFailure 的 code 为 bad_request、busy、stale_choice、host_failure、ipc_unavailable，
origin 固定 demo；已知底层 HierError 可附原 ElectronFailure DTO 作为 cause。
preload 将 invoke 拒绝变为 ipc_unavailable；损坏返回同样拒绝为该错误，不猜测身份关闭会话。

这是 app 私有控制边界，不能加到原 `ElectronBridge` 六成员或更改其版本/包出口。
preload 同时安装原 `hierBridge`；两桥只暴露各自命名能力，无通用 IPC。
main 先加载固定本地页面，捕获批准 URL/mainFrame 后才显示窗口；每次控制请求及异步 picker
完成后复查该文档身份。其它窗口/子 frame/旧文档/version 错误返回通用 bad_request，无副作用。
同文档只执行一个 pick/open/close 操作；并发请求 busy，不排队隐式重开。
未领取/已消费/旧文档 token 返回 stale_choice，校验失败发生在任何旧会话关闭之前。
close 只匹配当前 id；重复关闭同一终态 id 幂等，旧 id 不得关闭新会话。
导航/崩溃/销毁作废 pending picker、token 和后续 open 续体，按 §6.8 回收自有进程。
固定页面不做 hash 路由；拒绝外部导航/新窗口，不给外部文档继承能力。

#### 6.27.2 会话与资源所有权

UI 操作明确显示选择中、关闭中、连接中、成功、失败、取消；选择框打开期间旧面板可读但
打开/关闭操作禁用。用户取消 picker 保留旧会话；合法选择后先卸载旧借用视图/宿主订阅，
dispose 模型和 SDK，再调用 openDesign。main 消费 token，关闭并等待旧 exited 后才
createElectronSession；旧退出失败须可诊断且不启动新进程。更换设计失败不复活已释放模型。
已结算失败的旧进程记录在报告错误后释放，随后新的选择/打开可重试；不得因重复等待同一
已拒绝的 exited 永久锁死。尚未结算则保持关闭中，不谎称资源已经回收。

open 成功后 renderer 使用原 connectElectronTransport(hierBridge)，只创建一个 HierClient，
await ready，并通过既有 design.diagnostics 核对编译结果（非空 tops 也可有语义错误，
warning 不算失败），再创建绑定同 snapshotId 的 SelectionModel 及所有 L6 模型。连接/编译失败
显示原错误，释放局部已创建资源，并请求 closeDesign 清理已知 id。已取得 id 的连接中状态
可“取消打开”，释放本地 SDK/Transport 并 closeDesign；尚在 main 关闭旧进程阶段只等待，
不把未结束的关闭伪装取消完成。过期 ready/操作结算不能挂载旧设计。

宿主阶段与对应message在同一快照发布；通知或同步卸载可以释放/替换当前操作，
发布后重新检查原代次/活性再发起picker、open、connect或后续模型查询。新快照已发布时
停止旧快照剩余通知，关闭完成回调中新开的操作不能被旧关闭message覆盖。
文档最终释放同步清空快照中的借用模型、诊断和历史引用，退订且幂等，不向正在销毁的视图重发通知；
释放后的订阅/dismiss及晚回不改变最终快照。已经取得或迟到返回的已知session id/transport仍完成必要清理，
清理拒绝保留原原因供诊断，不复活视图或发起新的打开/查询；main独立回收责任保持。

已ready的Core/Transport意外关闭同样先撤销借用视图并释放检查、模型和原生布局Worker，
再等待main回收结算后发布原错误和可重试状态；不能只更新失败文字而留下活动资源。
native picker尚在等待时先完成本地释放，待该控制操作结算后才串行closeDesign，不向busy的main并发关闭。
选择取消/失败仍报告断线及清理错误；合法新选择仅在旧清理成功后打开，原断线提示保留在最近操作提示中。
清理失败不启动替换进程；正常关闭/取消不冒意外断线，旧通知不影响新会话，文档释放仍由main独立回收。

工作区React render/lifecycle错误由私有边界捕获，顶部设计控制与状态继续可用。
边界保留原异常日志，在commit结束后的微任务按捕获时的session id向原生命周期报告；
仅当前活跃工作区可撤销借用模型，旧边界晚回/文档释放不影响下一会话。
该失效与意外断线复用唯一清理链，原渲染原因与清理嵌套原因都保留，等main回收结算后允许明确重开。
picker pending仍先本地释放、待picker结算后串行清理；取消/失败显示原故障，合法替换须清理成功，
原故障保留为操作历史。不自动重试损坏组件、不重放旧任务；普通事件/Promise错误仍沿既有命令反馈。
此边界只覆盖工作区子树，非全局JavaScript错误恢复机制；诊断抛值无法格式化时显示明确退化提示并记录原异常及格式化原因。

宿主诊断在一个私有入口格式化：普通Error/DTO的code、message、AggregateError.errors及cause
保留原深度优先顺序和循环/共享原因的既有文本，改用显式栈避免原因深度占用JS调用栈。
每次访问节点时字段只读取一次；字段/值转换/聚合迭代失败时，保留其它已知可读原因并显示明确退化提示，
通过console聚合记录原异常及检查异常身份。共享节点仍按原约定重复显示message，但不再次展开原因。
不截断原因或新增查询预算，不承诺恶意无限迭代/属性执行或任意OOM有界。
所有宿主错误、清理和信息显示复用该入口，workspace不另设第二套格式化规则；
格式化可能触发getter重入，完成后重新核当前会话/操作资格，旧诊断不得覆盖新会话或新打开阶段。

main按owned会话先登记唯一清理Promise，再调用session.close；同步close异常也继续等待原exited结算。
关闭、替换、文档失效及shutdown都复用该记录，close重入不重复调用；尚未结算不发布可重试终态，
不启动替换进程。结算后才释放记录/保留终态id并报告close与exited全部原因，后续明确新选择可以恢复。
单一HierError继续沿原DemoFailure/cause/data DTO传递，其它聚合异常复用私有诊断显示原原因，
不增加IPC字段或通道。shutdown同步撤销授权并缓存同一清理结果，重复调用不再重发close或重置生命周期。
若上游exited始终不结算仍保持原等待，不新增关闭时限、越层kill或假完成。

关闭设计依次卸载视图、退订宿主协调、dispose 模型、dispose SDK、closeDesign 并等待完成。
窗口销毁或应用退出由 main 独立 close/await exited；应用持有 window-all-closed/before-quit
退出责任，不能靠最后窗口销毁时默认退出代替回收。错误保留诊断，完成后才能退出。
关闭某个面板只卸载/退订，不关闭共享 SDK；新设计使用全新 SDK/模型/选择/行身份。
所有命令 Promise 和导航 refresh.completion 都即时消费，失败显示在相应操作区域，
不使用空 catch；旧代次仍消费拒绝但不覆盖当前反馈。

#### 6.27.3 固定布局与选择协调

顶部为打开/关闭、设计状态、搜索与路径原文表单；左侧 HierarchyTree，中间为主内容区域。
顶部设计操作使用命名原生表单，顶层输入Enter与打开按钮共用原open入口；关闭/取消按钮不提交表单。
操作进入忙态禁用原控件时，仅交接该控件拥有的焦点到设计状态，保留外部工作区输入焦点与草稿。
工作区视图、导航/详情和显式开关图入口集中在全宽工具栏；“查询工具”可显式收展搜索/路径表单，
默认展开保留直接查询流程。收起保留输入DOM/原文、查询结果与选择，不提交/取消查询；
展开聚焦搜索，表单内非输入法组合的Escape收起并返回入口。组件命令反馈位于折叠区之外，
其诊断不会随表单隐藏；新设计重置表单及其显示状态。
设计状态呈现打开/连接/关闭等生命周期及其失败；模型命令报告单列为“最近一次操作提示”，
用户可关闭提示，焦点返回设计状态。关闭只移除历史反馈，不清除模型当前错误或结果；
其它查询成功不代表该提示已解决。关闭/替换设计时清除旧设计提示，picker取消保留原设计提示。
组件onCommandError与宿主同步命令沿同一报告通道，不在Workspace/图工作区另存不可关闭的历史错误。
搜索、路径和连接加载的宿主等待方各自持有报告资格；同模型的新命令、取消或清空撤销旧资格，
包括同查询身份的组件重载。当前命令自身的成功/失败发布不撤销其反馈；旧拒绝仍消费而不覆盖当前提示。
资格只引用原模型发布，不镜像请求/查询/结果；三个模型互不撤销，选择及设计释放的原代次守卫保持。
宿主将原等待方的纯资格probe传到诊断格式化后的实际发布点，同时核当前会话owner和选择代次；
格式化getter内同模型发布清除/取消或新查询时，旧提示失效。单一历史提示的报告序号保护重入顺序，
更新的组件错误报告不会被外层旧格式化覆盖；其它模型的普通成功不撤销当前错误或清除历史。
组件错误入口保持稳定，进入时捕获代次并保留原异常身份，资格函数仅在renderer内使用，不序列化或进入IPC。
原理图追踪开始、替换、取消和清除也共用该宿主报告资格；显式收图取消原来源时撤销旧追踪等待方。
GraphSession发布多个来源，宿主只观察追踪GraphSource原state身份变化，外部示例等其它来源不撤销其资格。
等待方还核对原source revision；来源replace直接发布success也撤销旧资格，同修订的当前成功/失败终态不冒作替换。
当前Core/命令入口/监听错误保留原原因，取消/清除状态仍由GraphSource呈现；普通取消不另报旧等待方错误，
清理失败仍沿原清理命令报告，不按cancelled字符串吞掉。原Promise即时消费并原样返回，不新增图状态或请求表。
报告入口身份属于当前Workspace，释放后不再发布；模型及组件当前失败/partial状态仍从原状态读取。
SourceView的positionQuery配置与组件报告回调在同一Workspace内保持身份稳定，无关表单、侧栏或尺寸重绘
不冒新命令绑定；新文档/动作/设计仍由原组件和模型撤销旧资格，不放宽公共过期守卫或自动重发查询。
设计信息显示Core的openedAt和“基于打开时的版本”；inputHashComplete为false时常驻§4.8提示。
手动“检查输入变化”及工作区重新获得焦点消费既有design.checkInputs，宿主打开/关闭中不自动发起，
同一pending检查合并触发、不排队；可取消，关闭/替换设计后不发布旧结果。失败/取消保留上次完成的
观察并明确其状态，不能显示成未变化；已变化时提示重新加载才生效，不自动重编译、重读源码或改选择。
检查返回的complete不足时也保持范围不完整说明；FileRef不解析，变化列表最多显示前100项并标明完整总数。
输入检查/取消共用持续挂载的按钮；pending显示“取消检查”、其它阶段显示“检查输入变化”，
完成或取消后保留该控件焦点，不抢外部输入焦点。宿主暂停时不开始新检查，但已有pending仍可取消。
暂停时非pending检查控件以aria-disabled保持可聚焦的不可用状态；鼠标、键盘或DOM激活均不开始新检查。
检查任务在首次微任务之后、进入SDK之前复核当前任务/文档资格；取消/销毁/替换的旧任务不进入SDK。
同一检查的突发触发复用原completion，不排队。通知中产生新快照或释放后停止旧快照余下通知；
单个订阅异常保留原身份作显式console诊断，其它仍有效的订阅继续，不能把通知错误改写为Core检查失败。
检查失败仍保留原SDK异常身份和上次Core观察，取消/旧回不覆盖后续检查结果。
取消先发布撤销状态再触发旧abort回调，后者新启动的检查不被旧状态覆盖。失败显示文本在发布前只观察一次，
格式化后复核原任务/文档资格；视图读取已提交文本，不在render重读外部诊断getter。
编译诊断复用打开核对的原Reply，摘要直接显示Core计数和首个错误；按需展开原severity/message/file/line
及truncated提示，无诊断时不增加空面板。错误详情仅在失败清理结算后与可重试状态发布；仅有警告仍成功。
2026-10-23 按用户同意的宿主整理：默认源码，打开 M6 图时进入原理图主视图，双视图按需选择；
源码候选随明确查询展开，可收起而不清除。右侧属性/连接/搜索结果/定义实例/路径结果使用上下文 tab，
搜索/路径提交进入对应结果，可返回对象详情。图的高级参数、演示/标注和分组命令按需展开，
partial、错误、过期状态保留可见入口。显示切换保留借用模型、选择和已完成结果，不关闭共享会话；
显式关闭图/设计仍按原所有权释放。标签支持键盘切换且不因外部选择抢焦点。
演示壳的显式“收起原理图”先卸载借用图视图，再取消宿主的pending追踪、布局及组件分组查询；
原生Worker须回收，取消失败仍尝试其它任务并在最近操作提示中保留清理原因链。
宿主持有原布局/重试命令Promise至结算，因为清理错误可归原任务而非cancel命令；不复制服务状态或几何。
源码/原理图/双视图切换仅隐藏，保留在途任务与已完成布局；显式收起仍保留设计会话和图成员，
再次显示不隐式查询或布局，重新创建的投影继续遵守原布局身份匹配，不把旧结果冒作新投影结果。
分组查询由每个已挂载图视图的单一私有控制器持有；构造不监听，借用订阅建立图监听，
最后退订同步撤销查询、清理分组与状态并退订，重新挂载不隐式查询。新查询替换旧任务，
取消或失败保留同一图的上次完成分组，明确清除与图修订撤销分组；pending通知或取消发生在SDK前时不进入旧查询。
错误保留原异常及嵌套可读原因，复用宿主统一诊断；格式化后的原任务资格再次核对，
诊断getter中产生的清除/取消/新查询或卸载不会被旧失败覆盖。组件只呈现快照与转发操作，
Core所属实例查询与投影折叠规则保持；普通隐藏不退订，显式收图卸载会取消分组。
当前焦点在已展开的高级控制或来源详情内容区内时，非输入法组合且未被内层控件消费的Escape
只收起该内容区并返回对应入口；另一内容区的显示状态保持。
入口按钮自身及无关工具栏焦点不触发面板Escape，入口仍以原生Enter/Space切换。
详情内容沿用原视图的焦点顺序；浏览器可聚焦的溢出详情滚动区也属于该内容区，
非溢出且没有可聚焦控件的空详情区不新增Tab停靠点。组合中的Escape与已消费事件保留面板及当前焦点。
仅当当前焦点位于即将隐藏/移除的结果区时，宿主交接到可见的当前Inspector标签；外部输入焦点保持。
继续按用户空间整理要求：导航/Inspector可手动收起，图画布在有限容器中占据剩余空间；
追踪主操作保留，高级参数、演示及说明集中到按需选项区，图来源/图元详情按需展开。
收起详情仍显示当前图来源任务状态、partial原因与失败摘要，完整原诊断保留在详情中。
这些呈现改变不调度额外布局/查询、不改变模型事实或共享资源所有权。
双视图按主内容区可用宽度采用左右并排或上下排列；侧栏收展只影响呈现尺寸，保留源码DOM与已有图布局。
双视图的原间隔提供可拖动分隔条，按当前排列用左右或上下键调整原理图尺寸，Home/End至可用边界，
Enter/双击恢复默认分配，Escape/指针取消恢复拖动起点。两种排列分别保留当前Workspace尺寸偏好；
窗口受限时保留最小空间/滚动并限制实际尺寸，恢复空间后恢复偏好，换设计重置。方向变化重建手柄以结束旧轴拖动。
该调整不替换源码/图组件，不查询、不确认候选或调度新图布局。
两侧分隔条可拖动或用左右方向键调整宽度，Home/End至可用边界，Enter/双击恢复默认；
拖动期间Escape或指针取消恢复开始时的可见宽度。尺寸偏好仅属于当前Workspace，收展保留、换设计重置。
窗口缩小时限制实际侧栏宽度，为主区保留最小空间；放大后恢复偏好，极窄窗口仍可横向滚动。
分隔条有名称、数值、方向及受控区域关联；尺寸变化不提交选择、查询或图布局。
右侧上下文标签可换行展示，保持原方向键/Home/End导航与条件性焦点交接。
宿主以统一表面、边界、标题和按钮层级呈现组合视图，通过组件已有CSS变量协调颜色，保留公共组件默认样式。
打开/追踪为强调操作，当前视图/标签同时以底线和字重标识；键盘焦点持续可见，诊断与表格内容不因视觉整理隐藏。
源码候选区域由持续可见的收展按钮命名，宿主不重复显示其Pane标题；组件命名区域、状态、确认操作和原可用高度保持。
候选区上边界支持拖动或上下方向键调整高度，Home/End至可用边界、Enter/双击恢复默认；Escape/指针取消恢复拖动起点。
默认与最小高度保持，实际高度受主区空间和源码最小高度约束；空间不足时沿原滚动，不压成不可操作的候选列表。
偏好只属于当前Workspace，收展/视图切换保留，窗口放大恢复，换设计重置；调整不查询、不确认候选或改变源码文档。
上述分隔条取消时恢复拖动前的原始偏好，包括未设置偏好时的响应式默认；不把窗口受限后的可见尺寸写成新偏好。
隐藏分隔条或其源码工作区、双视图换轴及Workspace卸载均撤销未完成拖动并释放指针捕获；
换轴只恢复旧轴偏好，不覆盖另一轴。输入法组合中或已被消费的键盘事件不调整尺寸或取消拖动。
复用全部原视图及 CSS，不复制行投影、候选确认、查询缓存、分页、键盘状态机或业务规则。
树 ready 后只 loadRoots，不遍历全树或自动选第一项。搜索只在明确提交时 load，
路径表单按原文提交（包括转义终止空白），不 trim/split/自行补顶层。

全宿主只有一个绑定快照的 SelectionModel；视图按原契约提交选择。宿主订阅后协调：

| 当前选择 | 宿主动作 |
| --- | --- |
| 空或多项 | 清除单目标属性、连接、定义实例及源码；不任取第一项 |
| 单定义 | 清属性/连接，DefinitionInstancesModel.load({snapshotId,def})，源码 kind=definition；不自动挑 occurrence 或 reveal |
| 单对象 | 先查原 SDK obj.get，按返回 kind/inst 取所属实例属性，并 tree.reveal(原ref)；不解析 ref/路径 |
| 单 port/signal | 在上行基础上加载连接，传原 ref/bits/side，reach 固定 local；其它种类清连接，不自行推导寄存器信号 |

对象连接区提供明确的连接侧选择（未指定/inside/outside），初值来自当前连接目标。
用户更改时以原 slice（含 bits）和 reach 调用同一连接模型；不更改共享选择、源码或图追踪参数。
无目标时禁用，新选择沿上表重新建立目标，不继承上个对象的手动连接侧；未指定或不适用的侧仍由 Core 校验。
右侧窄栏中的驱动/负载上下排列，保留原表格滚动及完整性信息。

对象源码默认 kind=definition；宿主提供 definition/instantiation/statement 明确切换与刷新/取消，
刷新/取消使用同一持续挂载按钮，直接按源码模型状态在pending显示“取消源码请求”、其它状态显示“刷新源码”；
无文档目标时禁用。请求结束保留按钮焦点，不转移外部输入焦点；原状态、错误和取消后重试仍由模型及SourceView提供。
无范围或不支持 kind 保持原 Core 错误，不猜一个替代范围。定义选择只提供 definition。
**origin=source 的明确候选确认**更新属性/连接/树/定义实例，但保留当前源码文档、位置和候选；
不得立即 reload/clear 导致原动作身份失效。用户后续明确切换源码 kind、刷新或选择其它来源对象
才按相应命令更新。跨设计不保留源码，空选择仍清除。重复选择 no-op 继续沿 §6.5。

每次选择同步撤销上一代宿主 obj.get/后续动作资格并abort旧lookup；依赖模型的清理和加载
在当前同步通知退出后的微任务执行，避免在原模型通知/输入读取中回入该模型。每步调用后
复核选择代次；同栈多次选择仅当前代次联动，选择历史仍由原SelectionModel保存。
空/多项仍清除全部单目标面板，不任取对象；不放宽公开模型的重入保护。
明确源码kind/刷新/取消也在通知退出后执行，较新源码意图撤销旧排定动作和默认加载；
source-origin确认保留绑定、文档与候选，其当前refresh等待方按保留后的上下文消费。
其它旧refresh拒绝只消费，不冒新选择/动作的报告；释放同步撤销所有排定动作，不启动新查询。
异步续体核当前会话与选择代次。使用 SDK AbortSignal 取消宿主查询，不发明新请求表。
各模型仍拥有自己的 pending/success/failed/cancelled 与过期回复逻辑；宿主不镜像其状态。
SourceView 接 navigation.state.document 和 locate；SourceCandidatesView 借同一 navigation/selection。
订阅 navigation 时消费每个新 refresh.completion，选择变化及 release 的旧错误不能盖新反馈。
树/搜索/路径/候选成功不等于 complete；partial、磁盘变化、分页和原错误仍由原视图明确展示。
布局调整提供有限正高度；各命名区域可键盘进入/离开，外部选择不抢焦点。

#### 6.27.4 实施与有限验收

main/preload/renderer 与构建/启动集中在 `web/apps/demo`，用现有 esbuild 分别构建 Node main、
单文件 sandbox CJS preload、无 Node/Electron 的 renderer。React 单实例，
contextIsolation=true、nodeIntegration=false、sandbox=true；本地 CSP 不开放远程脚本。
既有包消费者/标准回归保留，demo 生命周期与真实 Electron UI 门禁接现有入口。

新单元仅冻结：原生选择取消/输入与文档授权；打开/关闭/重开/连接取消及错误回收；
真实 Electron 树→选择→属性/源码；搜索/路径/定义多 occurrence 的明确选择；
source-origin 确认保留文档和旧选择晚回隔离；构建/样式/入口隔离。
允许只在原生 picker 边界注入固定文件选择以自动化，不用 fake IPC/Core 冒充实际纵向链。
processor_core 的真实浏览/搜索/源码定位作为 M5 阶段验收，记录设计输入和运行环境；
不把 UI 运行数量、旧树观察控制或 A 能力见证代替独立验收。
新控制桥经本次有限 C 审/B 冻结后，直接实现整个 demo，不新增观察/堆/Q1 实施前置。
无通用包 API、Core ABI、Schema7/protocol2 或持久化格式变更。

### 6.28 M6 图来源与成员所有权（2026-10-21，B81/C81 定向验收完成）

落实 [M6-A-01](plans/M6-graph-source-contract.md) 和 D-03，隔离可编译声明见
[proposal.d.ts](../web/contracts/graph-session/proposal.d.ts)。本节是新图单元，
不重开已充分冻结、已实现的 M5 组件；C78 接受具体契约，B79 完成有限冻结，
A79 已实现来源 → 可查询语义成员的完整链及 @hier/viewmodel 根出口。
[生产计划](plans/M6-graph-source-runtime.md)记录实际验证；固定735d227/生产2ab8425已获B81原24/20/1及G25独立通过，C81关闭C-105，无新增来源实现阻塞。M6整体未放行。
Worker/LayoutService、层级/总线折叠、AnnotationLayer 和 SchematicView 是后续单元。

#### 6.28.1 责任与公开入口

`new GraphSession(client)` 借用已 ready 的 HierClient，只读其 snapshotId 并固定绑定；
构造未 ready 的原错误不包装。构造不查询、不注册 SDK 事件、不布局；
dispose 不关闭 SDK，也不拥有或修改 SelectionModel。Core §5.5.4 和 Schema7
是事实/身份/完整性的唯一来源，L6 不解析 ref、计算追踪关系或重新编码 Core 的事实身份。

来源由 `registerSource({label, origin})` 返回独占句柄，origin 为 design/analysis/plan。
label 是可读文字，允许相同；不能提交调用方自选的 source ID。
同一会话两次注册即两个来源实例；释放后同标签重注册也不能复用旧来源身份。
来源 ID、图会话 ID、图节点/边 ID 是独立 opaque 类型，不用标签或遍历序号冒充。

| 入口                                      | 行为                                                        |
| ----------------------------------------- | ----------------------------------------------------------- |
| `registerSource(options): GraphSource`    | 同步读取/验证，分配空闲句柄；注册本身不发布图变更           |
| `source.replace(fragment): Promise<void>` | 完整替换本来源的已提交成员，一次事务发布                    |
| `source.refresh(loader): Promise<void>`   | 取得新来源修订，调用带 AbortSignal 的提供者；成功后完整替换 |
| `source.cancel(): Promise<void>`          | 取消本来源 pending 刷新，保留上次已提交内容                 |
| `source.clear(): Promise<void>`           | 撤销 pending 并移除本来源全部成员，句柄可重用               |
| `source.dispose(): Promise<void>`         | 撤销任务、移除成员与公开来源记录；句柄永久失效，幂等        |
| `graph.subscribe(listener): Unsubscribe`  | 观察完整不可变 state；不立即调用，独立注册、幂等退订        |
| `graph.dispose(): void`                   | 同步标记关闭、撤销所有来源/等待方和监听；幂等、无通知       |

`GraphSession.state` 含 sessionId、snapshotId、发布 revision、已发布 sources、
nodes、edges。注册但从未执行有效更新的句柄仅由会话拥有，尚不出现在 sources 中。
首次 replace/refresh/clear 发布该来源；clear 后保留 idle 记录；source.dispose 移除记录。
句柄 `state` 总可读，初始 revision=0/status=idle/content=null，释放后 status=disposed。
图会话初始 revision=0；每次实际发布增一，不暴露可写集合/Map。
所有状态为自有递归冻结快照，历史快照保持可读且不受后续输入修改影响。

对比 §6.2 未发布示意：无来源的 addFragment 改为来源句柄完整替换；
构造不再要求 LayoutService；traceFrom/expand/collapse/view/retryLayout 不在本单元假装实现。
宿主先用 source.refresh 调原 client.cone/paths，保留原 Reply 信息；
未来便利入口必须调用这份成员机制，不维护第二份追踪图。现有生产 API/IPC/Schema 不变。

参考 HAL 固定 acc899e297ed3866ad7da432ab0403c3d8d62d1c 的
GraphContext beginChange/endChange/add/remove，采用批量发布边界；
未复制 Qt 实现，其机制不提供本节的多来源修订/共享成员保证。

#### 6.28.2 输入、规范身份与共享成员

每次 GraphFragment 必须带相同 snapshotId、nodes、edges、completeness、frontier、
hasConservative。设计节点/边分别以 `{kind:"design", value: TraceNode/TraceEdge}` 接收原 DTO。
来源类别与图元类别分开：analysis 来源可以引用原 design 事实，但不会把分析关系变成设计边。
外部关系一律为 external，不可伪造 FactId 冒充 Core 事实。

| 图元类别      | 成员身份                          | 保留的原始信息                                                |
| ------------- | --------------------------------- | ------------------------------------------------------------- |
| design 节点   | 本图会话 + Core NodeId            | 完整 TraceNode，包括 point 的 ref/bits/side、终点 fact/ref    |
| design 边     | 本图会话 + Core EdgeId            | 完整 TraceEdge，包括 fact、端点、位段、via/role/precision/map |
| external 节点 | 本图会话 + 来源实例 ID + 节点 key | label、局部 ports、可选显式 ObjectSelection target            |
| external 边   | 本图会话 + 来源实例 ID + 边 key   | label 和两个明确的节点/端口端点，不声称设计依赖               |

Core ID 在快照内稳定且不透明，已表达 §5.5.4 的完整元组，L6 直接按 ID 去重。
早期“节点 ID 用 ObjectRef”不足以区分同一 ref 的位段/side，本节使用原 NodeId；
边不按端点或显示线条合并。GraphNodeId/GraphEdgeId 仅是会话内对应上述身份的句柄；
公开 member 同时保留原 DTO/局部 key，命中可反查原值。外部 label 变化不改变身份。
同一未释放来源的相同 key 移除后再加入，身份仍相同；新来源实例不复用旧身份。
不能通过不断累积已删除图元/旧版本来维持身份。

每份 fragment 自闭合：design 边两端必须在本份 nodes 中以原 NodeId 出现；
external 边的 GraphNodeKey 只能引用本份 design ID 或本来源 external key。
不能只因别的来源当前有该节点就省略自己的成员所有权。external 端点可带 port，
但只能指向本份 external 节点中明确列出的 port key；design 端点不接受自造 port key。
外部节点的 target 只是已有 §6.5 ObjectSelection 的显式导航映射，不改变外部身份，
不允许把 DefRef 或 plan 的局部 key 填入 ref。目标存在性/端口语义仍交 Core 查询。
origin=design 的来源只接受 design 图元；analysis/plan 来源可混合引用 design 与 external。

同一 fragment 重复节点身份、边身份或同节点重复 port key 均 invalid_argument，
不按数组“最后一个胜出”。不同来源可以共享同一个规范 design 成员，
但同 ID 的原 DTO 必须结构相等（对象字段顺序无关、数组顺序和可选字段是否存在有意义）；
冲突为 conflicting_fact，拒绝整次更新，无 last-writer-wins 或静默吞冲突。
Core DTO 的扩展 JSON 字段也保留并参与相等比较；本边界不验证其来源真实性，
来源提供者须只把相同快照的真实 SDK/Core 返回值标成 design，外部分析自有事实标 external。

成员的 owners 为当前拥有它的来源 ID，按注册顺序排列，来源记录同序。
节点/边分别按 design 在前、external 在后；design 按原 ID 的 UTF-16 码元序，
external 按来源登记顺序再按 key 码元序；不因回调抵达顺序或 locale 改变排序。
清空/替换 A 只更新 A 的成员集合。仅最后一个 owner 移除时才从 union 删除该成员；
成员的端点所有权规则保证不会留下悬空边。external 图元只归本来源所有。
union 是规范成员和所有权的查询投影；sources.content 只保存成员 ID/结果元数据，
不持有第二份可独立修改的事实副本。

每个来源分别保留原 completeness、frontier 和 hasConservative；
不把多个来源的 partial 误合并为全图 complete。成功空 fragment 是 content 非 null/
空成员；从未提交或 clear 为 null。刷新 pending/failed/cancelled 保留旧 content，
其中 sourceRevision 明示它属于上次成功，不能把旧内容标成当前修订的新结果。
replace/refresh 成功的来源状态为 success，content 的 sourceRevision 等于当前来源 revision；
pending 的 cancel 发布 cancelled/error=cancelled 并保留旧 content；
clear 发布 idle/content=null。有效 replace、clear 和首次 source.dispose 各发布一次，
包括空内容的情况；refresh 发布 pending 后至多发布一次属于自己的终态。

#### 6.28.3 输入事务与异步来源修订

source.replace/refresh/cancel/clear/dispose 均返回 Promise；入参/重入错误以拒绝表达。
registerSource/subscribe/constructor 是同步边界。注册 options 与 GraphFragment 外壳
按声明的精确字段检查；可选字段“存在但 undefined”非法；label 可空，key/port key 必须
非空原始 string、不含 NUL、不 trim 或 Unicode 归一化。来源 options 固定不可再写，
可变化的图元 label 位于每份 fragment 中。
设计 DTO/Completeness/TraceFrontier 复用现有机器 Schema 检查，
完整 JSON 数据须可自有复制（有限数值、无循环/函数/symbol/BigInt）。
未知的 GraphFragment/包装/外部图元字段拒绝；Core DTO 允许的扩展字段沿 Schema 保留。
未知外部字段不能被拿来注入几何、选择历史或另一个 source ID。

输入先完整投影到自有值，再检查跨成员/快照/冲突；验证失败前不撤销旧任务或发布。
每个字段只 Get 一次；读取期禁止源命令/注册的重入，读取抛错拒绝 invalid_argument
并保留 cause。每次外部读取后复查 graph.dispose；已释放优先为 disposed。
借用已有输入/诊断复制机制，不新增另一套协议解码器。
graph 已关闭时，除幂等 dispose 外的入口优先 disposed；仅来源已关闭则其命令
source_disposed，subscribe/registerSource 的调用方仍可操作未关闭 graph。
已释放的 source.dispose（包括 graph.dispose 导致的释放）成功 no-op，无通知。
活跃来源的 dispose 仍遵守通知/读取期重入限制；graph.dispose 始终允许。

每个来源维护非负安全整数 revision，代表最新有效更新意图。有效 replace、refresh、
clear、首次 dispose，以及 pending 时 cancel 先分配下一修订，再撤销旧 pending。
无 pending 的 cancel、重复 source.dispose 是无发布 no-op；重复有效 replace/refresh
即使内容相同也形成新意图，不与旧任务共享资格。编号耗尽拒绝 revision_exhausted，
不得回绕；graph.dispose 在耗尽时仍可关闭。
refresh 准入时为自己的终态发布预留一次 graph revision，其他更新不能消耗仍在途任务
的预留容量，避免 pending 已发布后因编号耗尽而无法发布终态。

refresh 的提供者只收到
`{sessionId,snapshotId,sourceId,sourceRevision,signal}`，返回 GraphFragment 或其 Promise。
先建立新任务资格、撤销旧任务、发布 pending，再调用提供者；调用前复核仍有效。
同来源新命令胜出、不同来源可独立 pending。取消只 abort 本来源调用获得的 signal，
SDK 仍决定共享请求的底层取消，不关闭共享 transport 或别的来源任务。
在发出旧 signal.abort 前，旧任务必须已经失去发布资格；同步 abort 监听中的源变更
按当前更新事务的 reentrant_change 拒绝，graph.dispose 仍可接管。提供者返回值按
Promise 解析规则采用，then 访问/调用异常走同一失败结算，不悬挂等待方。

提供者同步抛错、Promise 拒绝、非法返回均形成明确失败；成功返回也必须通过完整
输入验证及冲突检查后一次提交。只有会话未关闭、句柄未释放、captured sourceRevision
仍当前且任务尚有效，才可发布结果。替换/撤回后晚到成功不能复活；晚到拒绝也必须被消费。
cancel/clear/dispose 不等待忽略 signal 的提供者，原 refresh 等待方及时 cancelled
（source.dispose 为 source_disposed，graph.dispose 为 disposed）拒绝；
这仅证明 L6 等待方结算，不证明提供者的外部进程已经终止。

有效 refresh 成功/失败结算不再分配来源意图 revision，但发布新的 graph.state.revision。
提供者抛/拒绝原 HierError 时原对象作为命令拒绝，不包装；本地输入/冲突错误保留
GraphSessionError。其他提供者异常为 source_failure 并保留 cause。
state.error 是冻结的诊断投影，沿 §6.22.3 的 code/origin/message/data/dataIssue 规则；
SDK cancelled 显示 cancelled，其余错误 failed。旧 content 不因失败被当成新结果。

#### 6.28.4 原子发布、通知与后续消费者

一次提交先构造全部新来源成员、规范 union、端点映射和冻结 state，再替换当前 state，
最后通知本次开始时的监听快照。监听看到的 sources/nodes/edges 必须同一发布版本；
不得先删除共享节点再让监听短暂看到悬空边。通知错误不回滚已提交数据。
监听错误继续收集、继续通知仍有效注册，由负责该命令的 Promise 在结算时
AggregateError 拒绝；若命令本身失败，以原终态错误为 cause，沿既有模型规则。
pending 通知错误由该 refresh 命令记录，提供者仍按正常资格执行，终态时统一结算；
不把监听异常冒充 Core 失败。listener 返回 Promise 不 await，由订阅者消费自己的异步错误。

输入读取/诊断投影/通知期间，来源变更命令及 registerSource 拒绝 reentrant_change；
subscribe/退订及 graph.dispose 可用。新注册监听不加入当前通知，已退订监听跳过。
graph.dispose 同步先标记释放，令全部来源句柄失效、撤销任务/等待方、清空当前成员/监听，
不通知、不抛因计数耗尽而无法释放；终态 state 保留最后 revision 和会话/快照身份、
空 sources/nodes/edges，配合 graph.disposed=true。未结算命令以 disposed 结束，
已发生的通知/任务错误保留为 cause。旧冻结 state 可读，不再是当前图。

GraphSession 不调用 SelectionModel.select/clear/back，不自动选第一项或相邻项。
成员从图消失但其设计对象仍在快照中，共享选择和历史保留；画布投影中不存在的成员
不显示高亮。外部无 target 的节点不伪造设计选择，未来显式点击规则另在 L7 定义。
图来源撤回不是删除设计对象，也不自动撤回独立分析模块持有的 annotation 层。

后续折叠/布局/annotation 渲染仅借当前 state：保留原 member ID 反向映射，
自己的结果绑定 `(sessionId, state.revision)`；发布前重新核对，来源替换/清空后旧
几何不得成为新图的当前布局。图事实提交不等待 Worker 或 UI。annotation 过滤以
当前成员集为准，不先发布缺成员的标记；独立层的所有权/清理另由其公共契约管理。
本单元不提供折叠/几何缓存，因此也不把这些未来约束算成已执行验证。

#### 6.28.5 有限验收输入与交接

本单元一次冻结以下行为即可进入上述完整来源运行时实施，不把 Worker/浏览器观察/
堆/读屏/跨平台前置到来源数据单元；原 oracle 与失败记录保持。

- A 的 `{x,y} → {x,z}`、U/B 同时拥有 x：替换去 y；撤回 A 后 U/B 的 x 仍在；
  最后一个 owner 撤回才删除 x，失败替换保持旧内容。
- 两个来源均用 external key=node1、同标签也不碰撞；本来源只改 label 保持 member ID。
  同 ref 不同位段/side、同端点不同事实边保持 Core 原身份，不按显示外观去重。
- A 刷新1未完、刷新2/replace/clear/dispose先行：旧成功/拒绝不复活或盖写；
  原等待方明确结算；另一来源不被取消，pending/失败保留旧 content 的修订和 partial。
- 原子 union、冲突/坏端点/快照错误无部分发布；输入深复制/只读历史，
  通知错误/重入与 graph.dispose 的既有边界；来源撤回不写共享 SelectionModel。
- ready SDK/Core 的实际 trace DTO 可作为输入；来源成功不等于 complete，
  不把本提案编译或已有 SDK 能力见证算成拟议 GraphSession 已实现。

C 审此具体契约及隔离接口，B 按获审文本做有限独立冻结；D 按原 D-03 范围复核，
包括后续投影/布局的阶段性限制，A 不自行关闭 D-03。M6-A-02/A-03/A-04 不因此标为完成。

### 6.29 M6 布局服务与 Worker（2026-10-21，B84/C84 有限生产接受）

承接 [M6-A-02](plans/M6.md)，契约准备见[布局计划](plans/M6-layout-contract.md)，
实现与实际验证见[生产计划](plans/M6-layout-runtime.md)。
来源单元已获 B81 独立复验、C81 关闭 C-105；C82 已接受本节正文及隔离签名。
B83 已冻结22运行/20类型/1包外链；A83 原样导入并实现 LayoutService、原生 Worker 资源和标准门禁。
固定 b2dc509 已获 B84 原22/20/1与来源回归独立通过、C84 实现审查接受；本节获审正文保持，不重开 §6.28 或 M5 已接受范围。
首个纵向链提供扁平图布局。生产折叠规则、annotation和画布交互仍按后续单元推进；两路线有限比较见 §6.4。

#### 6.29.1 责任、接口和所有权

`new LayoutService(graph, {workerFactory, timeoutMs})` 绑定一个尚未释放的生产 GraphSession。
服务借用 graph；不拥有 SDK、来源或 SelectionModel，不修改它们、不发 Core 查询。
一个 graph 可绑定多个独立面板服务；释放其中之一不影响其他服务或 graph。
构造只捕获选项/绑定生命周期，不创建 Worker、不计算布局。graph 已释放以 disposed 同步拒绝；
非法 graph/选项以 invalid_argument 同步拒绝，不留下绑定。timeoutMs 是必填的
1..2147483647 整数毫秒，包含创建/加载 Worker 时间；不是 M7 的性能预算或按时执行保证。
workerFactory 是同步函数，每次返回新的独占浏览器 dedicated Worker，运行固定 ELK worker。
返回 Worker 的所有权转移给服务；宿主不得复用、改消息处理器或自行 terminate。

| 入口                                | 行为                                                                                    |
| ----------------------------------- | --------------------------------------------------------------------------------------- |
| `state` / `disposed`                | 当前深冻结状态 / 是否释放；读取不创建任务、不通知                                       |
| `layout(projection): Promise<void>` | 验证并拥有输入后开始新布局，替代本服务旧任务；成功时 state.result 可读                  |
| `retry(): Promise<void>`            | 仅 failed/cancelled 且原输入仍属当前图修订时可用；用保存的自有输入创建新任务和新 Worker |
| `cancel(): Promise<void>`           | pending 时取消本服务任务并发布 cancelled；其余活动状态幂等 no-op                        |
| `subscribe(listener): () => void`   | 独立注册、不立即调用；幂等退订                                                          |
| `dispose(): void`                   | 同步幂等、无通知；先禁发布/结算等待方，再回收资源和图绑定                               |

所有命令错误以 Promise 拒绝，constructor/subscribe 是同步边界。dispose 后除 dispose/state/disposed
外均以 disposed 拒绝；subscribe 非函数为 invalid_argument。retry 无可重试输入为 invalid_argument，
有旧输入但图已变时为 stale_graph；不自动重新测量或重新查询。合法 layout 即使输入值相同也创建新任务，
不合并不同调用的等待方。身份由服务分配，不接受调用方 taskId，跨服务/释放重建不复用；
有限整数实现若耗尽须在撤销旧任务前 identity_exhausted 拒绝，不能回绕。可采用进程内递增 bigint 转不透明字符串。

#### 6.29.2 扁平输入与事实映射

LayoutProjection 的必填字段为 sessionId、graphRevision、direction、nodes、edges。
revision 是非负安全整数；sessionId/revision 必须与绑定 graph 的当前 state 相同，否则 stale_graph。
direction 为 RIGHT/DOWN/LEFT/UP，无隐含默认。输入只含当前图全部节点/边各一次，
不得重复、漏项、引入未知成员或另一会话 ID；每条边的真实 from/to 从捕获的 graph.state 取得。
输入自有复制后再次核图身份和 revision；整个输入通过前不撤销旧任务、不发通知、不调用 factory。

每个节点输入为 `{id,width,height,ports}`；width/height 为有限正数。
每个显示端口为 `{key,width,height,side}`；key 为非空、节点内唯一的原字符串，
尺寸为有限非负数，side 为 NORTH/EAST/SOUTH/WEST。端口数组顺序为同侧固定顺序；
这些是显示锚点，不产生新的 Core 端口事实，不把外部来源的电气端口语义改写为几何。
每条边输入为 `{id,fromPort?,toPort?}`；可省略显示锚点，由 ELK 接到对应节点；
存在的 key 必须属于该边真实 from/to 节点的显示端口。外部边原始 port、位段/side、
ref/fact、owners、partial/frontier 等继续只在 graph.state 中权威保存，不复制进布局输入。
锚点可分组展示不同原端口，但不得合并边或修改其真实节点端点。

外壳、节点、端口和边只接受所声明自有字段；未知字段/显式 undefined/洞数组/非有限尺寸/循环等
为 invalid_argument。只接受普通或 null 原型记录、稠密数组和声明的原始值；字符串不 trim/规范化。
沿 §6.28 的自有输入纪律：枚举/读取只捕获一次，验证基于捕获值，getter/Proxy 抛值不静默吞掉，
以 invalid_argument 包装并保留原 cause；外部读取返回/抛出后先复查释放，再核图修订。
同次已释放优先 disposed，有抛值时保留 cause；图已变优先 stale_graph。输入期间服务命令
拒绝 reentrant_change；dispose、订阅和退订允许。无效输入本身不变更 state 对象或旧任务资格；外部 getter 自行触发的图变更/释放不回滚。

转换只创建独立 ELK 图：固定 layered 算法、ORTHOGONAL 路由、指定方向、端口 FIXED_ORDER；
不暴露任意 ELK option 字典或让宿主设置算法事实。内部编码 node/port/edge ID 的命名空间互不碰撞，
每个显示 ID 可反查原 GraphNodeId/GraphEdgeId/本节点 port key；不能靠遍历序号推断 Core 身份。
同端点不同 GraphEdgeId（包括不同 fact/位段）逐条送入并保留，允许环和自环；不按外观去重。
本节所有成员平铺一个 root，不创建折叠/层级语义。以后新增折叠投影须另定反向映射，不破坏本输入。
空图合法，按同样 pending→success 顺序得到宽高0、空几何，不需要创建 Worker。

#### 6.29.3 任务、图变更与发布

每个服务至多一个当前任务、一个 Worker、一份最近成功结果和一份最近已接受输入。
不保留历史任务/输入/坐标缓存。接受输入后分配 `(sessionId,snapshotId,graphRevision,taskId)`，
先撤销旧任务资格并以 superseded 结算旧 layout/retry 等待方，再发布 pending；pending 保留最近成功结果。
旧任务计时器/监听/Worker 清理后才创建新 Worker；单任务结束后同样清理，下一次请求使用新 Worker。
这样失败、取消、超时或重试均不复用损坏线程；首版不做 Worker 池，不据此承诺大图吞吐。

| 事件                                                      | 当前状态与等待方                                                                           |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 初始                                                      | idle，request/result 为 null，graphRevision 为当前图修订                                   |
| 接受 layout 或有效 retry                                  | pending，request 是新身份；原 result 可保留，但不是当前可交互布局                          |
| 合格 Worker 成功且结果有效                                | success，request/result 身份相同；Promise resolve                                          |
| factory/postMessage/error/messageerror 或 Worker 装载失败 | failed / worker_failure，拒绝当前 Promise；保留旧 result                                   |
| ELK 布局拒绝 / 格式或反向映射不合法                       | failed / layout_failure 或 invalid_result；不发布部分几何                                  |
| 截止计时回调先取得资格                                    | failed / timeout；立即结算等待方并终止 Worker；保留旧 result                               |
| cancel 作用于 pending                                     | cancelled / cancelled；原 layout/retry 拒绝，cancel 自己在通知后 resolve                   |
| 图修订发布                                                | 更新 graphRevision；曾接受过输入则 stale，否则 idle；request=null，待办以 stale_graph 拒绝 |
| 服务或绑定 graph 释放                                     | disposed，request/result=null；全部未结算命令 disposed 拒绝、无通知                        |

图的每次 revision 发布都使旧布局失效，包括来源 pending/failed/cancelled 但成员未变的发布；
不自行推测“成员等价”而复用旧坐标身份。stale 保留最多一份旧 result 供只读过期画面；
新 layout 必须提交新修订输入，retry 不把旧尺寸/端口列表冒充新输入。
只有 state.status=success 的 result 是当前布局；pending/failed/cancelled/stale 的旧 result
必须显示过期状态并禁用基于它的命中/共享选择操作，即使恰好是同一 graphRevision。
失败/取消/布局释放不清空语义图或共享选择。图没有再次变化时，成功结果也不会因无关读取变旧。

GraphSession 增加内部生命周期连接点：先更新其不可变 state，再同步使绑定布局失效，
多个绑定先全部完成状态/任务资格失效，再执行 Worker 清理和布局监听，
最后发既有 graph.subscribe 通知，避免第一个布局监听读到第二个服务的旧 success。
图提交不 await Worker。公共来源 API/通知次数不变，
graph.dispose 仍不调用公共 graph/layout 监听，但须同步关闭全部绑定布局，包括无来源 pending 的情况。
不靠应用记得按序 dispose、不轮询 graph.disposed，也不在 UI/Electron 重复同一规则。
布局服务释放撤销此内部绑定；不能通过公共 subscribe 顺序来碰运气保证失效优先。

Worker 成功/失败、超时、取消和 supersede 竞争，以首先在服务中取得当前任务资格的终态为准；
所有返回路径重新核 graph 未释放、session/revision、任务身份和 Worker 实例，撤销者不能再发布。
异步线程回复不是已发布的结果；结果复制/验证中图改变或释放同样失效。所有晚成功/晚拒绝被消费，
不复活状态、不产生未处理拒绝。超时从输入验收完成开始，在 factory 调用前登记；
同步 factory 必须及时返回，JS 主线程被宿主阻塞时无法保证计时回调准时执行，这不是硬实时保证。
取消/超时不等待 ELK Promise 或 Worker 关闭事件后才结算应用等待方。

#### 6.29.4 几何、错误与通知

只接受和请求一一对应的 node/port/edge ID 集合、正确边 sources/targets；
缺失、重复、多余、篡改端点或不可解释的层级结果为 invalid_result。
输出只提取有限 x/y、非负根/端口尺寸、正节点尺寸和边 sections；每条边至少一段，
每段至少起终两点且各坐标有限。节点坐标和路由点在 root 空间，端口坐标相对所属节点，允许负位置。
不固定具体像素、布局排序或自环形状为契约；不从 ELK 输出导入业务属性。
结果节点/边按捕获的 graph.state 顺序、端口按输入顺序输出；sections/点保持 ELK 路由顺序。
原 member ID、边 from/to 和可选锚点来自自有输入/原图映射；原事实/位段从对应图修订反查。
完整拥有、验证并深冻结后一次发布 LayoutResult，含原身份/direction/根宽高/nodes/edges。
输入、graph.state 与旧冻结结果均不能被 ELK 或服务修改；worker 转移复制不等于可省略自有输入隔离。

LayoutError.code 为隔离声明所列稳定枚举。state.error 只含 code、origin=layout_service 和
稳定诊断 message；原 factory/ELK/监听抛值保存在拒绝错误 cause，不执行任意 thrown 对象的
message/toJSON 等来拼状态，避免再次执行宿主代码；不把错误伪装成空图 success。
constructor 选项读取错误遵守同一包装规则。回收先撤销资格、清空内部引用、计时器和监听，
再 terminate；原生 terminate 无返回等待承诺。若合约外 Worker 适配在清理时抛出，保留为终态 cause，
若本来成功则改为 failed/worker_failure；已有失败/取消保留原 code 并聚合清理 cause。
dispose 完成全部清理后同步 AggregateError 报告，重复 dispose 不再清理；不让清理抛值留下 pending。
graph 触发的内部释放须尝试关闭全部绑定服务，合约外清理抛值在全部关闭后汇总抛出，
不打断原图/来源的释放；该新增异常只适用于违反原生 Worker 合约的适配，正常来源路径不变。

订阅快照、独立注册/幂等退订、监听期间重入与异常聚合沿 §6.28.4：服务输入/通知/factory/结果处理
期间其 layout/retry/cancel 拒绝 reentrant_change，subscribe/退订/dispose 允许。
通知异常不回滚状态，继续其他有效监听，由负责命令 AggregateError 拒绝；失败/取消时
原 LayoutError 为 cause。pending 通知异常累积到该任务结算；监听返回 Promise 不 await。
图修订导致的 stale/idle 通知发生于图提交事务，其监听异常纳入负责图命令的既有 AggregateError，
不得丢到无人消费的异步路径。失效中原布局等待方仍以 stale_graph 结算；两条命令各有自己的结果。
允许宿主在随后 graph.subscribe 中调用 layout(newProjection)；layout 自己通知中不能递归启动。
释放优先于尚未结算的命令结果，已发生异常仍为 cause；释放禁止后续监听和 Worker 创建。

#### 6.29.5 复用、资源和有限验收

拟采用发布包 elkjs 0.12.0 的 `lib/elk-api.js` 和 `lib/elk-worker.min.js`，
依据 D 已核固定 ref `722f1a3f63016e64f534a8b445283d4d31a88d0e` 与独立发布包真实 Worker 研究；
二者身份不混用。生产精确锁版本/integrity，保留 EPL-2.0 OR GPL-3.0-or-later 许可/版权。
复用 ELK 原生协议/API和算法；只薄封装生命周期与投影，不复制分层/正交路由算法。
禁止 elk.bundled.js 主线程回退、worker_threads 伪装浏览器 Worker或静默改用同步计算。

生产包须携带未改写的 worker 产物和许可（拟位于 @hier/viewmodel 的 dist/elk-worker.min.js）；
宿主明确把该文件发布到 URL，再由 factory 创建 classic Worker。模块 import 不访问 Worker 全局，
未调用 layout 不要求浏览器环境。无默认 CDN/blob/eval/远端下载；宿主实际 worker-src/script-src
和资源路径由真实包外浏览器/Electron 消费验证，不把 monorepo 编译当资源装载通过。
底层 ELK terminate 不结算 resolver 的事实已由 D 观察；服务拥有的公共 Promise 必须独立结算，
并释放其 Worker/API 引用。资源计数只能作为清理证据，不推导一般堆零泄漏。

本单元一次冻结以下有限公开行为后直接实施完整服务/资源/门禁；不增加来源单元前置：

- 原真实 GraphSession + 明确尺寸/端口输入可布局；原图/输入不变；不同 fact/位段的平行边、
  node/port/edge 映射与返回几何保留。空图与非法输入原子拒绝的边界清楚。
- L1 pending，接受 L2 后 L1 晚成功/晚拒绝均无发布；L1 等待方明确 superseded。
  图来源替换/清空导致修订改变，旧布局失效；新的输入成功恢复，旧结果不能点击成新图。
- 真实 Worker 加载失败/错误、超时、取消、dispose 结算；retry 使用新 Worker成功；
  单独 layout.dispose 不释放 graph；graph.dispose 会关闭所有绑定服务且无后续通知。
- 输入和结果拥有性、通知/释放异常与一个包外真实 Worker URL/CSP 消费链。
  对时间/乱序可使用受控消息门或现有定时控制，但不能把控制器叫成真实 ELK 算法执行。

C 审生命周期、映射、旧来源兼容；B 据规范冻结有限 oracle，保留全部历史来源测试/失败。
A 的编译消费者、D 研究或一次真实 ELK 成功不代生产独立验收。D-03 仍由 D 按原范围复核。

### 6.30 M6 首版扁平投影与 SchematicView（2026-10-22，B88独立通过/C88生产接受）

承接 §6.28/§6.29 和 [M6-A-04a](plans/M6-schematic-view-contract.md)。
B85 实际复现、C85 接受双画布有限比较；保持 React/SVG，不将 Sprotty resize 残留作为继续前置。
本节对应首个生产视图增量，隔离签名/消费者位于 `web/contracts/schematic-view`。
C86 已接受固定 2f7f623 的本节契约与隔离签名；B87 有限 12 模型/16 浏览器/20 类型及输入控制已冻结。
A87 已实现 L6 投影/选择桥接、L7 SchematicView、公开根/CSS 和既有标准门禁，自验通过冻结集合。
B88 已独立通过原有限集合及受影响回归，C88 接受固定 ad6c7d3 的生产实现，无新增待修项。
生产交付及实际回归见[执行计划](plans/M6-schematic-view-runtime.md)；本节获审正文不变。

本增量是一对一完整扁平图、只读来源/事实详情、布局命令及共享选择。
层级/总线折叠、AnnotationLayer、追踪/源码组合 demo、包外消费分别留在 M6-A-04 后续增量，
不删除 A17–A19，也不声称实验聚合已经实现生产折叠。首版无编辑、持久化或自动 Core 查询。

#### 6.30.1 权威、接口与纯投影

L6 新增 `createGraphProjection(graph, direction?)`，direction 省略为 RIGHT，其余为 §6.29 枚举。
同步读取一个活动的真实 GraphSession，返回深冻结 GraphProjection；不订阅、不创建任务、
不调用 SDK、不修改来源/选择，也不缓存历史。通过类自身的身份/生命周期读取验证 graph，
不接受结构替身、`Object.create(prototype)` 或包裹实例的 Proxy；不读取被覆盖的实例 getter。
非法实例/direction 为 GraphProjectionError(invalid_argument)，真实实例已释放优先 disposed。

GraphProjection 包含：

- `state`：本次捕获的原 GraphSessionState **同一引用**，保留 snapshot/session/revision、来源、
  owners、completeness/frontier 和全部原 DTO，不另拷贝成一套语义事实。
- `nodes`、`edges`：按 state 的成员顺序，一对一的只读显示描述；每项含 `target`、`member`、
  `label`、`items`。member 是对应原 GraphNodeMember/GraphEdgeMember 同一引用。
  target 是 `{sessionId,graphRevision,kind,id}`，kind 区分 node/edge，ID 使用原不同品牌类型。
- `layout`：仅 §6.29 LayoutProjection 的尺寸/显示锚点/方向，含全部节点/边各一次。
  不含 ref/fact/owners 的副本。空图返回空描述和合法空布局输入。

新对象/数组自有且冻结；成员引用已经由 GraphSession 拥有并冻结。图后续发布不会改写旧投影。
同一 revision 的两次调用可返回不同对象，不承诺引用缓存；target 值相同，不依赖显示遍历编号。
不解析不透明 GraphNodeId/GraphEdgeId/ObjectRef，也不按标签、端点或位段相似合并成员。
图的每次 revision（包括来源状态变化）均使旧 target 过期，不自行判定成员等价。

label 规则只读已验证原始值：external 节点/边为原 label；design 节点为
`kind + ": " + (point.slice.ref ?? ref ?? id)`，design 边为 `kind + ": " + fact`。
其中 point 优先只用于既有字段，无层级路径推断；空 external label 仍保留空字符串。
L7 完整可访问名称另加图元种类/ID，以免空标签没有名称。字符串按文本渲染，不解释 HTML。

显示锚点不是 Core 端口：每条边的 from/to 各在真实端点节点创建一个独立锚点，
key 为 `JSON.stringify(["edge", edge.id, "from" | "to"])`；自环两端也不同。
这些是由完整原 ID 派生的显示 key，不反向解析为事实。节点锚点按 state.edges 顺序，
一条边先 from 后 to；平行边不共享锚点，边输入引用各自 key。
RIGHT/LEFT 分别从 EAST/WEST 出、到 WEST/EAST 入；DOWN/UP 分别从 SOUTH/NORTH 出、到 NORTH/SOUTH 入。
锚点尺寸 6×6。水平布局节点 width=160，height=max(64,16×(最大单侧锚点数+1))；
垂直布局 height=64，width=max(160,16×(最大单侧锚点数+1))。这些是显示默认量，不是电气宽度。
external 原 ports 和 endpoint.port 在 member 中保留并在详情展示；未连接的原端口不凭空生成连线。
此版锚点按边端分配，不冒称原端口一对一几何。ELK 实际坐标仍由 LayoutService 权威发布。

#### 6.30.2 精确选择与命中边界

L6 集中生成每个描述的 `items: readonly ObjectSelection[]`，不让 UI 重写这套映射：

| 原成员                             | 选择项                                                                                                                              |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| design 节点有 point                | point.slice.ref / point.slice.bits 的 lsb、width，以及存在的 point.side                                                             |
| design 节点无 point、有 ref        | `{ref}`，不补位宽或 side                                                                                                            |
| design 节点两者均无                | 空 items；可以查看事实，但不能伪造 ObjectRef                                                                                        |
| external 节点有 target / 无 target | 原 target 的标准选择字段 / 空 items                                                                                                 |
| design 边                          | 依次取真实 from、to 节点的上述项；对应 fromBits/toBits 存在则替换该端的 bits，保留 ref/side；缺省沿用节点项；不存在端点选择则不造项 |
| external 边                        | 依次取真实 from、to 节点项；endpoint.port 仅为原外部端口标识，不据其猜 bits/side                                                    |

只复制标准选择字段，保留省略与明确值的差异；不从 via、fact、map 或端口名称推导额外对象。
最终精确重复项按 §6.5 规则去重、保留第一次顺序；复用同一规范化/等价机制，不另订范围包含算法。
零宽 bits 等已合法输入仍按 §6.5 保留。TraceNode 同时有 point/ref 时 point 优先，不偷偷求并集。
边的一端没有对象时可选择另一端；两端都没有则不可选择。原 fact、precision、role、map 和完整
fromBits/toBits 继续从 member 查阅，边选择不增加任何 FactSelection 类型。

`selectGraphElement(graph, selection, target): void` 是 L6 同步选择桥接。要求真实活动模型，
selection 必须绑定与 graph 相同且已定义的 snapshot。验证目标当前性后，用当前原成员重新映射，
调用一次 `selection.select({snapshotId: graph.snapshotId, origin: "graph", items})`。
它不要求 LayoutService，故也可供宿主的文本图成员列表使用；L7 的几何命中另受下节严格限制。
items 为空时以 not_selectable 拒绝，不能意外清空共享选择。未知成员以 invalid_argument 拒绝。

GraphProjectionError.code 为 invalid_argument、disposed、snapshot_mismatch、stale_graph、not_selectable。
非法模型先 invalid_argument；真实模型已释放优先 disposed；选择快照未绑定/不同为 snapshot_mismatch。
以上模型检查先于 target 读取。target 只接受普通/null 原型记录和所声明的四个必填自有字段，
不接受未知字段、显式 undefined 或无效 kind；ID 必须为非空字符串，revision 必须为非负安全整数。
每个外部属性读取/枚举只捕获一次，返回或抛出后复核模型存活及本次初始 graph revision；
已释放优先 disposed，图已变化优先 stale_graph，其他输入错误为 invalid_argument；有抛值保留原 cause。
格式合法但 session/revision 不匹配为 stale_graph。输入期间 getter 自己的外部变更不回滚。
桥接无自身订阅/通知/可变命令状态；执行 select 前再核存活/revision。未调用 select 的拒绝不改变选择或历史。
select 自身的 SelectionError/监听 AggregateError 原样传播，不能包成成功或在已提交选择后回滚；
监听中后续图变更/释放遵守原模型契约，不使已提交选择变成未提交。

高亮仅是共享选择的派生：描述 items 非空，且每项都在 selection.current.items 中精确存在，
才标记选中；忽略 origin、项顺序和多余选中项，不将 `{ref}` 当作任意 bits/side 的包含关系。
DefinitionSelection 不匹配对象。不同 fact 的边若产生相同对象项可同时高亮，
它们仍是独立图元/详情，不虚构共享选择具有 fact 身份。焦点/详情目标是局部展示状态，不产生第二份选择历史。

#### 6.30.3 视图属性、状态与渲染

`SchematicView({graph, layout, selection, ariaLabel, height, direction?, className?, onCommandError?})`
借用三个活动真实模型；layout 必须绑定该 graph.sessionId，selection 快照须与 graph 相同且已定义。
不接受伪实例/Proxy。ariaLabel 为非空白字符串；height 为有限正数；direction 省略 RIGHT；
className 若给出必须为字符串，onCommandError 若给出必须为函数。初次挂载/更换模型时，
非法 props（含已释放模型）同步 TypeError，开始订阅前拒绝，不创建 Worker/模型或发查询。
已接受的同一模型组合之后若释放，下次渲染显示 disposed 并禁用命令；不因此抛构造属性错误，
也不承诺在无通知的 dispose 后立刻重绘。方向属性只用于下次“布局”，不隐式重排已发布结果。

挂载只订阅/读取 graph、layout、selection；没有自动布局、自动追踪或来源刷新。
同一个图可由不同 LayoutService 的面板分别展示；组件不会 dispose/cancel 借用模型来隔离自己。
宿主在初次布局前可先装入来源；布局由明确按钮或宿主直接调用服务触发，沿用同一布局权威。
组件根据 graph revision 派生当前投影，不长期持有多修订映射/历史坐标缓存。

- 来源区按 graph.state.sources 顺序显示原 label、origin、status；content 的 complete/partial、
  原 reason(s)、frontier 数量和 hasConservative 单独可见。failed/cancelled 显示原 code/origin/message，
  保留旧 content 时标明是先前结果。没有 content 是“尚无结果”，不能当作 complete 空图。
  不把多个来源汇成一个虚构全局 Completeness；节点/边按 owners 反查所有来源及其标签/origin。
  design DTO 的 kind 与来源 origin 分开展示，analysis/plan 拥有真实事实不改写该事实种类。
- 状态区明确 idle/stale/pending/success/failed/cancelled/disposed；pending 不能标成 success；
  布局失败显示稳定 error.code/message，语义图与选择仍可查询。空图显示“当前图无成员”，
  来源 partial/错误仍独立可见，不写“设计没有连接”这样的业务结论。
- 仅当 result 的 session/snapshot/revision 都等于当前 graph，才可用它与当前 member 组合绘制。
  不同 revision 的保留坐标不绘制，不把旧几何连到新事实；显示“图已改变，重新布局”。
  同 revision 的 pending/failed/cancelled 保留结果可只读灰显并明确“旧布局，暂不可选择”。
  只有 **status=success 且 request/result 身份相同** 才允许图元激活。
- SVG 按 LayoutResult 的实际方向、节点坐标/尺寸/相对端口与边 sections 绘制，完整保留 ID 集合。
  宿主可提交其他合法尺寸/锚点输入；视图按实际 result 绘制，不要求与标准投影的尺寸/key 相等，
  不从自定义锚点推断语义端口。每条边独立路径/命中目标，端点带方向指示，不因同端点合并；空根宽高按至少1显示单位处理。
  画布容器高度为 height，坐标画布溢出可滚动；首版不承诺 pan/zoom、空间键盘导航或大图虚拟化。
  标签可以视觉截断，完整名称/详情仍可读；不按名称推断 DFT 含义。
- 当前焦点图元的只读详情显示原成员 ID、种类、owners；design 节点的 id/kind/point/ref/fact/value/reason
  按实际存在显示，design 边的 id/fact/from/to/via/kind/role/precision/align/fromBits/toBits/map 可逐项查阅，
  external 节点 target/原 ports 及边原 endpoints 同样可查。只显示声明字段，不递归展开未知 DTO 扩展。
  来源 frontier 详情保留原 point/reason/depth/stepCursor 声明字段；不执行任意对象 toJSON，不从呈现值回写数据。

成员移除不会由视图清空/修剪共享选择：SelectionModel 可代表图外对象，旧条目按当前投影自然不再高亮。
来源变更导致过期时，无旧图元可激活；新布局成功后再基于当前映射高亮。组件不接管树/源码导航，
宿主可将现有其他组件连接同一 SelectionModel；多候选行为仍遵守 M5，不从图点击猜一个实例。

#### 6.30.4 命令、键盘、错误与卸载

显式按钮命令如下。方向变化不替代 retry 保存的原输入；需要新方向时点击“布局”。

| 命令   | 可用条件与作用                                                                                             |
| ------ | ---------------------------------------------------------------------------------------------------------- |
| layout | 模型活动且非 pending；生成当前 createGraphProjection 的 layout，调用 layout.layout；可重新布局已有 success |
| retry  | failed/cancelled 且 request.graphRevision 为当前 revision；调用 layout.retry，不重新查询或重测旧输入       |
| cancel | pending；只调用借用 layout.cancel，等待方仍按 §6.29 cancelled 结算                                         |
| select | 当前成功几何中的有 items 图元；调用 selectGraphElement，单次替换共享选择，不自动 back/forward              |

事件执行前重新核已提交 props 会话、三个模型存活、graph revision 及布局的当前 state/request/result 身份。
旧 DOM handler、React 批处理中的旧 render、卸载/更换模型后的回调不能对新会话发命令；
过期/禁用事件无命令副作用。命中身份包含当前 taskId，不能只检查 revision 而接受被新布局替代的几何。
本地 pending/反馈不替代服务状态，不为防双击另建一套布局任务；第一个命令同步发布 pending 后后续旧事件失效。

图元按投影 nodes 后 edges 的稳定顺序组成一个键盘序列，SVG 容器为具名 group，
图元为带完整名称的 button，aria-pressed 由共享选择派生。可查看但不能选择的图元为 aria-disabled，
仍可聚焦读详情；非成功布局全部禁止激活。容器本身可聚焦，空图/过期图有明确状态描述。
可绘制图中一个图元 tabIndex=0，其余=-1；初始第一个图元，焦点只移动，不自动修改选择。
ArrowRight/ArrowDown 到下一个，ArrowLeft/ArrowUp 到上一个，Home/End 到首/末，不循环；
Enter/Space 激活当前图元一次（阻止 Space 滚动），其他按键不拦截，不加 document/window 全局键监听。
点击图元先聚焦并显示详情，仅符合选择条件时再激活；点击空白不清选择。

同会话重绘若 ID 仍在可保持焦点目标；目标移除、过期几何隐藏或借用模型更换时清除旧详情目标。
只有实际 DOM 焦点在本组件的待移除图元内时才将焦点移至自身容器，不抢其他面板焦点；
新结果出现不自动抢焦点。序列排序不代表电气/层级关系；ARIA/真实键盘在既有浏览器测试设施有限验证，
一般读屏/跨平台/大图验证为实现后加固，不扩成当前契约的无限实施前置。

SchematicViewFailure 是判别联合：layout/retry/cancel 带调用起始 sessionId/graphRevision；
select 另带原 target 与被命中的 LayoutIdentity；所有分支保留原 `error: unknown`。
合法命令捕获同步抛值/原 Promise 拒绝，附一次消费处理，不吞成 success/空图，也不产生未处理拒绝。
当前命令失败在组件显示通用失败反馈；回调存在时在后续微任务调用一次，使用发起时回调，原错误不转换。
onCommandError 抛值时，仍有效的组件向 React 错误边界抛 AggregateError([原错误, 回调抛值])，
不把回调异常传回领域模型。状态区一直反映模型稳定诊断，组件反馈不把未知 thrown.message/toJSON 当成安全文本。

反馈资格是同一挂载/模型组合、同一 graph revision、当前操作和其布局任务；
新图修订、新命令、宿主替换任务、模型释放或卸载均撤销旧反馈。layout/retry 自身的 pending→终态
不撤销自己的反馈；cancel 为当前 pending 任务的取消命令，撤销先前 layout/retry 的组件回调资格，
原等待方仍独立结算。若同步重入使任务归属无法确定，不向新任务发布旧命令反馈，保留原拒绝消费和模型诊断。
取消/失败后允许按状态重试，不在选择监听中自动发新布局。严格模式挂卸也不能创建额外任务。

卸载/换模型只撤销本组件事件/命令反馈与三模型订阅、释放 DOM 处理器/局部引用；
不清空来源/选择、不取消或释放宿主的在途布局。晚成功/拒绝均不得更新旧组件或调用其回调。
宿主按先卸载视图再释放模型的顺序关闭；GraphSession/LayoutService dispose 本来无公共通知，
组件不另加轮询。每个事件仍检查真实 disposed，避免宿主违规先释放时发出新命令。
引用不再保存旧会话，不承诺有限监听计数等于一般堆零泄漏。

#### 6.30.5 兼容、导出与有限验证

实施时 `@hier/viewmodel` 根出口新增本节投影/选择函数、错误及描述类型，`@hier/views` 新增
SchematicView/Props/Command/Failure；样式独立导出 `@hier/views/schematic-view.css`，不隐式注入全局样式。
采用现有 React18、SVG 和原 LayoutService/ELK 资源，无新生产依赖。UI 不自己创建 Worker URL/CSP 策略。
M0–M5、原图来源/布局公共 API、C++ ABI、IPC、schema7/protocol2、工程文件不变；无数据迁移。

有限验证按本节行为分组：手写平行事实/精确位段与无对象成员的投影反查；来源共享/撤回与不完整提示；
共享选择往返/焦点与键盘；当前/旧布局事件门、失败/取消/重试；借用模型卸载/重挂；公开类型/根出口/CSS接线。
使用既有类型、模型和浏览器门禁，不另建观察/堆/证据平台。A 的隔离消费者是编译见证，不计 B 冻结。
原来源/布局/M5 oracle 和所有历史红保留；组件实现后执行当前冻结与受影响回归，再交 B/C 固定生产版本。
包外 Worker/CSP、Core 查询到图/源码的 demo、折叠和标注仍按 M6 后续实际交付验收，不由本节冒领通过。

### 6.31 M6 共享对象标注层（2026-10-22，B91独立通过/C91生产接受）

承接 §6.3 的未发布示意与 M6-A-04b，具体签名/消费者位于 `web/contracts/annotation-layer`。
A-04a 固定 ad6c7d3 已获 B88 原有限集合独立通过及 C88 生产接受；本节是新增单元，
C89 已接受本节，B90 已交付 22 模型/10 浏览器/20 类型有限冻结；A90 已实现 L6 层/纯查询、
树图借用展示及原 CSS/公开根/标准门禁，固定 b1c187c 已获 B91 独立通过及 C91 生产接受。
实际证据与限制见[执行计划](plans/M6-annotation-contract.md)。
不重批原理图充分冻结契约，也不新增观察/堆/证据平台前置。
A-04b 先交付树/图共享标注，再落实折叠的显示身份、反向映射和边界重布线；完整 A17–A19 不削减。

#### 6.31.1 权威、接口与快照

标注是宿主/分析提供的展示数据，L6 `AnnotationLayer` 是一层标注的唯一权威表示。
它不拥有 SDK、GraphSession、TreeModel、LayoutService 或 SelectionModel，不发查询、
不生成 DFT 结论，不把标注写回事实或改写其他分析层。多个视图可借用同一真实层实例。

新增公开类型：

- `AnnotationMark`：可选只读 `color?: string`、`badge?: string`、`tooltip?: string`、
  `severity?: "info" | "warn" | "error"`。color 只接受 `#[0-9a-fA-F]{6}` 的六位十六进制值；
  原大小写保留，不接受 CSS 函数、变量、URL、样式对象或事件处理器。badge/tooltip 为任意字符串，
  包括空串，省略与空串保持区分；空 Mark 合法。所有文字只作文本，颜色只是标记色块。
- `ObjectAnnotation`：`{readonly ref: ObjectRef; readonly mark: AnnotationMark}`。
  这是对象级标注，没有 bits、side、fact、DefRef、ID 编码解析或父子包含规则。
  同 ref 的不同位段/side 可共享对象级标注，但不影响 §6.30 的精确选择高亮。
- `AnnotationLayerOptions`：必需 `{snapshotId, id, label}`。
  snapshotId 按已有 SnapshotId 边界接受非空不透明字符串；id/label 为非空白字符串，原值保留不 trim。
  id 是宿主给层的标识，不是图元/事实身份，也不暗含 origin。label 相同允许存在不同 id 的层。
- `AnnotationLayerState`：只读 `{snapshotId,id,label,revision,status,marks}`，
  status 为 `"active" | "disposed"`，marks 为 `readonly ObjectAnnotation[]`。
- `AnnotationLayer`：`constructor(options)`、只读 `state` / `disposed`，
  `set(marks): void`、`clear(): void`、`subscribe(listener: () => void): () => void`、`dispose(): void`。
  状态读取使用自身私有品牌；不接受结构替身、伪原型实例或包裹实例的 Proxy 充当真实层。

初始状态 active/revision=0/空 marks；options 自有字段、已捕获文本及后续状态均不保留可变输入。
每个状态及其数组/entry/mark 全部深冻结，旧 state 在后续 set/clear/dispose 后仍保持原值。
一个层永远绑定同一 snapshot/id/label，换快照必须新建；无需全局层注册表，两个独立宿主可使用相同 id。
同一个视图或一次多层查询内 id 必须唯一，也不允许重复同一层实例。

早期 `constructor(id,label)` / `set(Map<ObjectRef,Mark>)` 是未发布示意，不是需迁移的 API。
具体入口显式绑定 snapshot，set 使用只读条目数组，避免跨会话误标并可明确拒绝重复 ref，
状态仍只有这一份标准表示；不同时维护公开 Map/数组两个事实来源。现有 API 保持不变。

#### 6.31.2 整层替换、错误、通知与释放

`set(marks)` 同步整层替换；`clear()` 等价于提交空数组，不清其他层。
每次合法 set/clear（含与旧内容相等或已空）使 revision 增加 1、原子发布一个新状态并通知一批。
输入次序保留；同层 ref 重复拒绝，不暗中覆盖、合并或排序。ObjectRef 按既有非空不透明字符串边界验证，
不从前缀判断对象种类，也不通过 SDK 验证存在性；图外/尚未加载对象的合法标注仍保留。

options、entry、mark 仅接受普通/null 原型记录，字段限声明集合，必需字段不可缺少；
未知/符号字段、显式 undefined、不合法值、数组空槽/附加字段均 invalid_argument。
外部属性与数组槽只捕获一次，不调用迭代器/toJSON。set 先验证并复制全部输入，再发布，
坏后项不能先替换前项；拒绝保留旧 state、revision、监听与其他层。
可沿用现有输入复制机制，但错误和生命周期仍属于本模型，不能用一套 UI 校验代替 L6。

`AnnotationError.code` 为 `invalid_argument | snapshot_mismatch | disposed | reentrant_change | revision_exhausted`。
构造参数/方法参数错误为 invalid_argument；多层查询的不同快照为 snapshot_mismatch，
视图 props 的错误按 §6.31.4 拒绝为 TypeError。set/clear 先检查真实层已释放，
再检查本层正在读取或通知中的重入；分别 disposed/reentrant_change，
这些入口拒绝先于读取新参数。set 外部读取每次正常/异常返回后检查释放：已释放优先 disposed；
其他读取抛值为 invalid_argument，异常保留原 cause。getter 自己产生的外部变更不回滚。
revision 为非负安全整数，到 MAX_SAFE_INTEGER 后拒绝新的 set/clear，以 revision_exhausted 保留状态；
仍可读、退订和 dispose。其他层的独立更新不属于本层重入。

subscribe 不立即回调；重复注册同一函数分别生效。通知捕获本批 registration 顺序，
回调新增的监听下批生效，本批之前已退订的监听跳过；回调错误收集后统一抛原值数组 AggregateError。
回调看到已提交状态，任何监听错误均不回滚已发布标注；set/clear 在本层通知中拒绝重入。
subscribe/退订可在通知中进行，返回退订函数幂等、释放后可调用。订阅非法 listener 为 invalid_argument，
已释放层仍优先 disposed。层实例命令为同步原子操作，不虚构 pending/failed/cancelled 异步任务状态。

dispose 幂等：立即发布 disposed/空 marks 的冻结终态，保留 snapshot/id/label/最后 revision，
清空监听及内部标注索引，不通知、不发查询/取消/清选择，也不释放借用模型。
dispose 可在输入 getter 或监听里调用；输入期 set 按上面的 disposed 优先拒绝；
通知期停止余下监听，已提交 set/clear 不回滚，已收集监听错误仍原样聚合，不倒签为未提交。
视图宿主先卸载/移除层再释放；无通知的 dispose 后仅承诺下一次视图渲染不再展示该层标注，不轮询。

#### 6.31.3 多层读取及唯一对象匹配

L6 根出口增加纯函数：

`resolveObjectAnnotations(snapshotId, refs: readonly ObjectRef[], layers: readonly AnnotationLayer[]): readonly ResolvedObjectAnnotation[]`

其中 `ResolvedObjectAnnotation` 是只读 `{layer: AnnotationLayerState, entry: ObjectAnnotation}`。
layer/entry 分别引用本次捕获的原冻结 state 和原 entry，不复制 Mark、ref 或构造另一份业务事实。
函数无订阅、缓存、查询、命令或选择副作用，返回新深冻结结果数组/记录。

先按声明捕获 snapshotId、refs/layers 两个稠密数组，数组不可有附加/符号字段；每个长度/槽读取一次，
输入抛值转 AnnotationError(invalid_argument) 并保留 cause。捕获阶段调用者自身修改层不回滚。
之后通过层自身的身份/状态读取一次捕获所有层，忽略被覆盖的实例 getter；中间不再执行调用者代码。
因此采用最后一次外部输入访问完成后的层状态，不把一个层的两个 revision 拼在一次结果里。
非法数组/实例、重复实例或重复 layer.state.id 为 invalid_argument；合法不同 snapshot 为 snapshot_mismatch，
这些检查完成后才查匹配。已 disposed 的真实同快照层可在列表中出现，但不贡献结果；不对其调用 subscribe。
本函数不对层发命令，故不会以 disposed 拒绝整个只读查询，也不会激活已释放层。

refs 按第一次出现顺序去重。结果顺序是外层按 layers 输入顺序、内层按去重 refs 顺序；
每个 `{layer,ref}` 至多一项，存在于该层 marks 才输出，未知 ref 为零项。
同 ref 在两个层的标注都保留，即使文字/颜色相同，也不覆盖；不自动合并 severity 或选择“优胜”层。
调换 layers 次序仅调换呈现优先顺序，不写回 layer.state，也不改变图成员/布局/选择。
这是精确 ObjectRef 相等匹配，不把实例标注自动传给子信号、不根据路径文本推断父实例。

#### 6.31.4 树与图的可选借用呈现

`HierarchyTreeProps` 和 `SchematicViewProps` 各新增可选 `annotations?: readonly AnnotationLayer[] | undefined`。
省略/undefined/空数组时，原 UI/查询/命令/布局/焦点与可访问输出完全保持；不增默认全局标注层。
同一个数组内按 §6.31.3 校验真实层、唯一 id、快照：树为 tree.snapshotId，图为 graph.snapshotId。
非法 props（包括不同快照、非数组、重复/伪层）同步 TypeError，在安装新订阅前拒绝。
同快照已释放层允许传入，忽略其 marks，不订阅；不能因为一个层后来释放而让整棵树/原理图报构造错误。
每次 render 捕获自有层列表；调用方随后修改原数组不会改变已提交订阅，下一次 render 再捕获。

两个视图复用一个内部标注订阅/呈现边界，L6 解析函数集中对象匹配：

| 视图对象           | 传给 L6 的 refs                     | 约束                                                      |
| ------------------ | ----------------------------------- | --------------------------------------------------------- |
| 树 instance 行     | 仅 row.instance.ref                 | 不使用当前选中 ref/reveal.ref 代替实际行对象              |
| 树 scope/status 行 | 空                                  | 不把 owner 或子对象标注冒充此行标注                       |
| 图 node/edge 描述  | §6.30 描述 items 中的 ref，保持顺序 | point/ref、原边端位段和外部 target 映射仍由原 L6 投影负责 |
| 图无对象描述       | 空                                  | 不从 label/fact/via/ports 或未知扩展猜对象                |

图 items 可能含同 ref 不同 bits/side，本节 resolver 仅按对象去重；边两端不同 ref 则各自显示，
不能把“两端有标注”解释成这个 fact 自己有分析结论。相同对象出现在多个独立图元，各图元都可显示标注。
原选择高亮继续按 §6.30 精确比较，标注颜色不覆盖选中/焦点提示。

有匹配的可见行/图元展示只读标注标记，顺序保持 resolver 返回顺序；每项使用其 badge，
badge 省略时用 severity，再省略时用层 label（空 badge 仍保留，不改用 fallback）。
有 color 时在标记旁画色块；tooltip、severity、层 id/label 和 ref 完整保留于文本详情/可访问说明。
所有多个层/两个端点的原项都能逐项查阅，不采用“最高 severity”代替其他项。
文字和色块只用于展示，不增加可激活按钮、tab stop、全局键盘监听或标注编辑能力。

树在已虚拟化行的固定 rowHeight 内展示；可视觉截断，但完整标注说明通过该行的可访问名称/描述与
纯文本 title 提供，不渲染隐藏行对应的业务节点。图在既有节点/边旁绘制标记，使用已有 result 几何；
不修改节点尺寸、原 ports/sections，不触发重新布局。空间不足可以视觉裁剪，完整内容在
图元可访问说明和聚焦后的原详情区逐项显示。CSS只加到现有 hierarchy-tree.css/schematic-view.css，
不注入全局样式、不执行 tooltip HTML、不创建新的公共 CSS 必需入口。

只订阅当前列表中的活动层；列表替换/换模型/卸载撤销旧订阅，StrictMode 无查询或任务。
原3模型/TreeModel订阅和命令职责保持；layer.set/clear 仅触发呈现，不调用 SDK、
GraphSource 更新、LayoutService.layout/retry/cancel 或 SelectionModel.select/back/forward。
所以 graph revision、当前布局 request/task/result、共享选择/历史和树展开状态不因标注改变。
同修订旧布局仍按原规则灰显/禁止选择，可显示当下对象标注；过期几何隐藏时不挂旧图元标记。
层更新不抢 DOM 焦点，不以标注重建图元身份或清除局部详情。视图不 set/clear/dispose 共享层。

#### 6.31.5 兼容、实施边界与有限验证

生产阶段将从 `@hier/viewmodel` 导出上述层/错误/类型/纯查询，从 `@hier/views` 现有根扩展两个 Props；
保留同一个 HierarchyTree/SchematicView，不另造 annotated/v2 组件或并行事实仓库。
新增可选 props/根符号是兼容添加；旧消费者原样编译。无 C++ ABI、IPC、Schema7/protocol2、
插件、配置或持久化格式变动，无生产依赖新增；首版无工程文件迁移。

有限冻结分组：层整份替换/输入与冻结状态；监听/错误/释放；对象精确匹配与多层顺序/快照；
实际树与图的映射/文本/颜色/可访问呈现；借用列表替换/卸载及无选择/查询/布局副作用；
公开类型/根/CSS兼容及原树/原理图回归。沿已有模型、类型、浏览器设施执行，
不新增观察/堆/基准平台，不用A消费者当B oracle，不重冻不变的§6.30。

A88 原隔离声明固定于 0a4f0ef；生产发布后编译入口转发实际公开根，避免重复的名义层类型，
不改变接口/负类型预期。A90 自验不代 B/C 生产接受。折叠/A17、真实追踪/源码组合demo及包外视图消费仍按原后续增量交付，
不从标注显示推导 DFT 算法已实现，也不在此扩大一般读屏/跨平台/大图加固前置。

### 6.32 M6 折叠投影、边界重布线与成员反查（2026-10-22，C92获审/B93冻结，A93实现待独立复验）

承接A-04b/A17；共享标注b1c187c已获B91/C91接受。本节新增L6接口已由A93实现，待B/C生产复验，
公开符号在`@hier/viewmodel`；`web/contracts/fold-projection`转发生产声明并保留消费者，执行步骤见[计划](plans/M6-fold-projection.md)。
先明确可独立验收的L6显示投影与选择映射；随后的布局/原视图接入仍须完成，不能据本节编译通过宣布A17完成。
旧`createGraphProjection`、`selectGraphElement`、LayoutService和SchematicView接口及行为保持。

#### 6.32.1 权威、输入及身份

GraphSession仍是节点/边/来源成员的唯一事实表示；折叠只派生显示拓扑，不造第二个GraphSession，
不写回来源、查询SDK、猜父子路径或DFT结论。宿主显式提供显示分组；`hierarchy`描述层级显示意图，
`bus`描述一批需要捆束的边，不声称任意显式分组已由Core证明为同一层级/网络。

新增L6入口：

```ts
createFoldedGraphProjection(graph: GraphSession, options: GraphFoldOptions): FoldedGraphProjection;
selectFoldedGraphElement(graph: GraphSession, selection: SelectionModel,
  projection: FoldedGraphProjection, target: FoldedGraphTarget): void;
```

`GraphFoldOptions`必需`{groups: readonly GraphFoldGroup[], collapsed: readonly string[]}`，空数组合法。
Group为判别联合：层级`{kind:"hierarchy",key,label,nodes:readonly GraphNodeId[]}`；
总线`{kind:"bus",key,label,edges:readonly GraphEdgeId[]}`。key/label非空白，原字符串保留不trim；
group key跨两种kind唯一。nodes非空、edges至少两项，均是当前graph.state中的对应成员ID，组内不可重复。
不同bus组的edges必须不相交；节点和边的成员ID分别验证，不以相同字符串互认。
hierarchy节点集合可以不相交或严格包含，拒绝部分交叠、相等集合和循环式歧义；包含关系由集合唯一确定，
不额外维护parent/path字段。bus与hierarchy可作用于同一批事实的不同维度。
collapsed只含已声明group key且不重复；顺序仅保留输入，不决定输出排序。省略的组为展开。

新增名义字符串类型`FoldProjectionId`、`DisplayNodeId`、`DisplayEdgeId`，不得赋给原GraphNodeId/GraphEdgeId。
每次成功工厂调用产生新的projection.id；即使输入内容相同，也不混用两次投影目标。
显示ID只在同一真实GraphSession内承诺稳定，独立于遍历序号、标签、折叠清单顺序和projection.id：

| 显示元素               | 稳定身份依据                               |
| ---------------------- | ------------------------------------------ |
| 未聚合节点             | 当前会话 + 原GraphNodeId                   |
| 层级聚合节点           | 当前会话 + hierarchy key                   |
| 未捆束边（即使重布线） | 当前会话 + 原GraphEdgeId                   |
| 总线捆束边             | 当前会话 + bus key + 有向显示from/to节点ID |

种类/命名空间互不碰撞；节点与边ID不解析为Core引用。group更换成员可保持同一显示ID，
但必须重建投影并取得新projection.id；目标同时带该代次，不能仅凭显示ID继续使用旧命中。
不同graph实例不共享显示身份；不承诺重新打开设计、跨进程或序列化后稳定。
不需要缓存所有历史投影；实例释放给GC，未提供订阅、dispose或拥有资源的句柄。

#### 6.32.2 层级折叠与完整反查

工厂先捕获当前graph.state及全部options，按当前原成员计算投影。
对每个原节点：若它属于多个collapsed层级组，取集合最大的最外层；否则显示原节点。
外层折叠时隐藏内层聚合节点，但保留内层collapsed意图；展开外层后内层可再次显示。
所有原节点恰好属于一个显示节点，任何原成员都不因为折叠从GraphSession删除。
显示节点按其首个原节点在state.nodes中的位置排序；其members仍按state.nodes顺序，保留原冻结member引用。
层级节点label取组label，未聚合节点label/items沿§6.30原节点投影规则。

原边的from/to先分别映射到显示节点：

- 两端在同一个层级聚合节点：不画外部边，原member进入该节点的internalEdges，按state.edges顺序。
  包括该层级内原来的自环；保留完整from/to、fact、端位段、side和来源关系。
- 其余边保留为待显示边，显示from/to使用映射后的DisplayNodeId；原GraphEdgeMember不变。
  未聚合节点的原自环仍显示自环；反向边和不同fact/位段不能因同两端而被擅自合并。

公开`FoldedGraphNode`为`kind:"member"|"hierarchy"`判别描述，含target、label、members、internalEdges、items；
只有hierarchy含groupKey。member节点的members为单项且internalEdges为空。
`FoldedGraphEdge`为`kind:"member"|"bus"`，含target、label、显示from/to、members、items；
只有bus含groupKey，未捆束members为单项。总线members至少两项。
全部原边恰好出现在一个可见边members或一个聚合节点internalEdges中，两类互斥且并集完整。
外部消费者直接沿这些原引用反查；不另暴露一份复制的事实DTO或独立可变反向索引。

#### 6.32.3 总线捆束、排序及展开

层级映射完成后，仅处理仍可见且属于collapsed bus组的原边。
每个组按**有向显示(from,to)**分区；同分区至少两条才捆束为一条bus显示边，
单项分区保留原member边。不同bus组/未分组边绝不合并；反向边属于另一分区。
bus组内被层级隐藏的边只在internalEdges中，不重复列入捆束边。
层级展开导致端点分开时，原bus折叠意图仍保留，但各分区可能退化为单边；无需篡改组或拒绝合法展开。

显示边按所含首个原边的state.edges位置排序，各members按原边顺序，不按输入groups或key排序。
bus label使用组label，未捆束边label沿§6.30；标签不参与身份、去重或端点判断。
组的集合输入顺序不改变显示成员次序。所有组展开时，每个原节点和原边独立显示，
原端点、原member对象、fact/位段/来源内容可逐项恢复；显示ID仍与原成员ID分域。
更改来源后旧投影仍为可读历史值，但不能用其目标选择新状态；新工厂只接受当前图中存在的组成员。
若来源撤回了组成员，宿主更新明确的分组输入，不能由投影静默删减组来掩盖过期输入。

#### 6.32.4 冻结、输入原子性及选择

`FoldedGraphProjection`是由工厂创建的真实私有品牌只读实例，构造器不公开，包含：
`id`、原`state`引用、捕获的`options`、`nodes`、`edges`。所有公开层级深冻结，保留的原member/state引用不复制。
不接受结构替身、伪原型或实例Proxy。输出只读、没有命令/监听/SDK/Worker；工厂不发布GraphSession状态。
新错误`FoldProjectionError.code`为`invalid_argument | disposed | stale_graph | snapshot_mismatch | not_selectable`，
不扩展已发布GraphProjectionError或LayoutError的union。

options/group/target只接受普通或null原型记录，字段严格限各判别分支声明；拒缺字段、未知/符号字段、
显式undefined、稀疏或附加属性数组。复用现有JSON捕获规则，每个外部属性/槽至多读取一次，不调迭代器/toJSON。
工厂先验证真实GraphSession品牌及活性，再读options；每次外部读取正常/异常返回后检查：
graph已释放优先disposed，已捕获state被新状态取代则stale_graph，其他读抛值为invalid_argument并保留原cause。
校验全部输入后才返回新投影，坏后项不产生部分结果，不改变图、选择或任何先前投影；getter自身变更不回滚。
构建期间没有外部回调；来源共享和原图发布/取消仍按§6.28处理。

target为严格`{projectionId,kind:"node"|"edge",id}`，id类型与kind匹配。
节点items按其members的§6.30对象选择映射依次归一化；不附加虚假group ref，
不把internalEdges的端位段重新当成节点本身的选择。边items按members依次取**原边两端**的原选择映射，
不能拿重布线后的聚合节点全部对象替代原端点；保留bits/side，沿原SelectionModel归一化和去重规则。
标注可把descriptor.items中的ref直接交§6.31 resolver；不会把某个最高severity或父实例推断成组事实。

选择入口先核graph/selection/projection真实品牌；graph或selection已释放优先disposed，
selection未绑定或快照不同为snapshot_mismatch；projection非该graph实例的当前state为stale_graph。
然后一次捕获target，外部读取也检查disposed/图变更并保留cause；target.projectionId不符为stale_graph，
合法种类但未知显示ID为invalid_argument。无对象items为not_selectable且不改历史。
成功只调用一次原selection.select，snapshotId取原图、origin="graph"，items为描述中完整精确选择；
不改折叠、图、布局、标注或触发查询。SelectionModel自身拒绝/监听AggregateError原样传播，不包装成投影成功或回滚其提交。
同一graph修订可同时存在多个合法不可变投影；本纯入口要求target对应调用方明确传入的projection，
不维护暗中的“当前折叠视图”。后续L7必须通过其当前投影/布局代次阻止旧DOM命中，不能省略该围栏。

#### 6.32.5 兼容、后续纵向链与有限冻结

本单元只新增L6符号；`FoldedGraphProjection`刻意没有可伪装成原LayoutProjection的layout字段。
现有LayoutService要求完整平铺成员、捕获原端点且公开geometry用原ID，不能强转显示ID绕过该校验。
后续布局接入需复用原Worker、超时/取消/Promise结算与ELK几何验证实现，保留旧构造/调用/状态类型，
为显示节点/边及投影代次提供明确的兼容类型边界；不复制整个服务或建立第二个语义图。
原SchematicView随后接入折叠/展开、反查详情、原精确选择/标注，布局结果与命中同时核图修订和投影代次。
没有这些实际接入、原生ELK验证及展开恢复连接，A17/完整A-04b仍未完成。

无C++ ABI、IPC、Schema7/protocol2、插件/配置、生产依赖或工程文件变化；首版无持久化/迁移。
具体兼容声明和消费者以隔离目录交付，无proposal.js或mock运行时。C审本新增节后，B一次有限冻结：
输入/原子捕获；层级嵌套/内边/边界重布线；总线分区/身份/顺序；原成员反查/精确选择/标注；
公开类型兼容与原投影回归。使用既有真实GraphSession/SelectionModel与合法DTO/外部片段输入，
不新增堆/基准/观察设施，不重冻§6.30/§6.31；前置齐备后A直接实现本单元和现有门禁。

### 6.33 M6 折叠布局与原 SchematicView（2026-10-22，B98独立通过/C98生产接受）

§6.32 的纯折叠投影已获 B95 独立确认，C95 接受并关闭 C-106。本节完成 §6.32.5 指定的
布局/视图公共边界，执行见[计划](plans/M6-fold-layout-view.md)，具体签名与编译消费者见
`web/contracts/fold-layout-view`。C97已关闭C-107并接受具体签名，B97已完成0f94dc2有限冻结。
A97已实现同一LayoutService固定folded模式及原SchematicView折叠/详情/选择标注接线。
B98修正FL09、FU03/FU04两处夹具并独立通过既有五组，C98接受生产并关闭C-108/C-109；
原三红保留在历史证据，A98已原样导入修订及报告。以下获审规范正文保持。
A98已将这些公开接口接入原Electron demo，交付真实Core追踪/外部示例、共享选择/源码/标注、
受控显示组及包外Worker消费；见[组合实施计划](plans/M6-combined-demo.md)。
固定ffb4401组合宿主已获B99真实包外有限复验、C99生产接受；不外推整个A17–A19或M6验收。
A99继续原宿主显式分组：按SDK obj.get返回的inst形成互斥实例显示组，inst.get仅提供标签；
设计边构成可选边束，由原投影按有向显示端点捆束。无引用节点保留独立显示，
不推导祖先层级/电气网络，不改变事实、公开API或下列获审正文。
分组查询属于宿主，显式启动/取消，图修订变化和卸载使其结果失效；折叠本身不发Core查询。

#### 6.33.1 同一布局服务、固定身份模式

原 `LayoutService` 增加泛型 `Mode extends LayoutMode = "graph"`，LayoutMode 为 graph/folded。
默认构造、layout(LayoutProjection)、LayoutState/Result/Identity 及错误 union 保留原含义和字段；
没有 mode 的原选项仍有效，旧类型不扩宽为显示 ID 的联合。折叠使用明确的构造：

```ts
const layout = new LayoutService<"folded">(graph, { workerFactory, timeoutMs }, "folded");
await layout.layout(projection, "RIGHT"); // projection 为真实 FoldedGraphProjection
```

构造 options 继续只接受原 workerFactory/timeoutMs 两字段；folded 模式通过必填第三参数
字面量 "folded" 指定。旧构造不传第三参数，模式为 graph；显式第三参数 undefined/其他值
为 invalid_argument，不用 options 中可被结构化类型隐藏的额外属性决定结果身份。
泛型本身不提供运行时安全：服务按构造实参固定模式并校验对应输入；默认类型要求无第三参数，
显式 LayoutService<"folded"> 要求第三参数。新增只读 mode getter 返回 graph/folded，供视图
用原型 getter 验证真实实例/模式，不提供 setter，一个实例生命周期只持有一种结果身份。
构造所有权、真实 graph 校验、同步异常、选项单次捕获及无 Worker 副作用沿 §6.29.1–.2。

folded 的 `layout(projection, direction?)` 仍返回 Promise<void>，direction 缺省/undefined 为 RIGHT，
其余只接受原四值。projection 必须是 §6.32 工厂发布的真实对象，拒绝外壳复制、Proxy/伪造/其他对象；
不读取伪造对象的任意属性来判定品牌。先沿原命令边界拒绝 disposed/reentrant_change，再校验品牌，
检查 projection.state 与绑定 graph 当前 state **引用相同**；其他会话/旧修订为 stale_graph。
最后验证方向。整个输入通过前不撤销旧任务、通知或创建 Worker。原 FoldProjectionError 不另扩入
布局错误联合：非法品牌/方向为 LayoutError invalid_argument，过期为 LayoutError stale_graph。

同一图修订的两个真实投影各自可以提交；服务只决定最新已接受任务，不保存一个暗中的全局当前投影。
每次有效调用即使 projection.id 不变也分配新 taskId，原 superseded/取消/超时/重试/释放及等待方
结算规则完全复用。不同面板仍可各用一个服务，没有第二份 GraphSession 或 Core 请求。

#### 6.33.2 显示几何、原成员反查与任务

FoldedLayoutIdentity 在原四字段上增加必填 projectionId；FoldedLayoutResult 同样携带该字段。
节点 geometry.id 为 DisplayNodeId；边 id 为 DisplayEdgeId、from/to 为 DisplayNodeId。
其他坐标、端口、方向、section 和尺寸语义沿 §6.29，不把原 Graph ID 强转显示 ID 或反向强转。
FoldedLayoutState 的每个 status/request/result/error 分支对应原 LayoutState，只有 request/result
换成显示身份类型；idle/stale/disposed 的 request 仍 null，disposed 的 result 仍 null，
success.result 必填；pending/failed/cancelled/stale 最多保留一份旧显示结果。
state 顶层不添加 projectionId，保留结果可能属于另一个投影，调用方必须分别核 request/result。

布局输入只来自已冻结投影的可见 nodes/edges；顺序沿投影，隐藏 internalEdges 不送入 ELK。
节点/边的内部编码仍以 node/port/edge 分开，端点从捕获投影的 edge.from/to 取得。
每条可见边各有两个显示锚点：JSON.stringify(["edge", displayEdgeId, "from"/"to"])，
尺寸6×6，RIGHT/LEFT/DOWN/UP 的源/目的侧分别为 E/W、W/E、S/N、N/S。
端口按投影边顺序逐边添加，含同节点端点两次；节点尺寸沿 §6.30 的默认规则：
extent=16×(同侧最大锚点数+1)，水平 width=160/height=max(64,extent)，
垂直 width=max(160,extent)/height=64。默认锚点与原平铺共用一个生产实现。
本新增入口首版不暴露自定义尺寸/任意 ELK 选项；原 graph 模式自定义输入能力完整保留。

仍由同一几何编码/验证、LayoutWorker、任务状态机执行 layered/ORTHOGONAL/FIXED_ORDER。
结果须完整对应显示节点/边/端口，所有端点必须等于捕获的显示端点，不能接受额外内部边、
替换成原成员 ID、重复/遗漏、篡改端点或非法几何；invalid_result 不发布部分结果。
返回顺序沿投影而非 ELK 遍历顺序；坐标/结果深冻结，projectionId 取自捕获投影而非 Worker 返回值。
空投影仍 pending→success、宽高0且不建 Worker；原层级/总线和内部边事实通过 projection 反查。

新任务替代旧任务只保留原服务规定的最近输入/成功结果；无历史投影/几何缓存。
retry 使用已捕获投影与原方向，保留 projectionId、分配新 taskId，failed/cancelled 条件沿原规则。
图 revision 发布先使全部绑定服务失效，旧在途等待方 stale_graph；retry 不重建过期投影。
Worker/结果捕获/资源回收的 disposed 优先、原 cause、监听 AggregateError 和两阶段失效均沿 §6.29。
构造/布局/失败/释放都不变更 graph.state、纯投影、共享选择或来源；不修改原成员 owners/事实/位段。

#### 6.33.3 原组件的受控折叠入口

`SchematicView(props)` 增加 FoldedSchematicViewProps 分支，继续同一组件/根出口/CSS，
不另造折叠画布组件。旧 SchematicViewProps 和 SchematicViewFailure 不添加必填字段或改宽含义。
新属性沿用 graph/selection/annotations/ariaLabel/height/direction/className，layout 必须为
LayoutService<"folded">；新增必填 projection 和同步 `onFoldChange(options: GraphFoldOptions): void`，
onCommandError 改用独立 FoldedSchematicViewFailure。无 projection 的旧分支只接受默认 graph 服务；
旧 Props 显式声明 `projection?: never`、`onFoldChange?: never`，使组件入参两分支静态互斥；
直接调用、变量/spread 和 React.createElement 均不能借旧分支接纳错误折叠接线，原合法调用无需增加字段。
新分支不能借用默认服务。即使绕过 TS，也先验证服务/模型/投影真实品牌及模式，再安装订阅。
非法品牌/跨会话投影或模型快照不匹配/非法基础 props/非函数回调同步 TypeError，沿原组件错误边界。

投影属于同一 graph 的旧 state 时允许只读状态呈现：隐藏全部旧几何/图元详情、禁止布局/重试/选择/
折叠命令，显示“图已改变，更新折叠投影”；来源仍取当前 graph.state。宿主据新来源/图修订重新
构造适用分组和真实投影，组件不删无效成员以猜测新的分组。所有模型释放纪律沿原组件。
方向属性只用于下一次明确布局，改变 props、挂载/严格模式重挂、折叠 intent 均不自动启动 Worker。

折叠控制区按 projection.options.groups 顺序显示每个组的原 label、kind、成员数，以及一个原生按钮。
组 key 为控制身份，按钮可访问名称包含动作（折叠/展开）、kind、完整 label 和 key，
aria-expanded 表示该组是否不在 collapsed；即使外层组已折叠，内层控制仍存在以表达保存的独立意图。
没有组时不展示伪造控制；投影过期或模型已释放时禁用。正常折叠控制不依赖布局 success，
可以在 idle/pending/failed 时请求改变投影，不借它修改来源或电气事实。

激活时复核当前提交帧/graph state/真实投影和组 key。以捕获的 projection.options 为唯一当前值，
折叠在 collapsed 末尾追加该 key，展开仅移除该 key，其他 key 和顺序保持；groups 复用原冻结数组，
新的 options/collapsed 深冻结。每次原生激活只调用一次发起时的 onFoldChange，不直接改 projection、
选择、图或布局。宿主决定并发布新的真实投影；宿主未接受时原控制状态保持，不维护乐观第二份 collapsed。
宿主如需异步操作自行管理其 Promise，本回调约定同步，不把 Promise 返回当成投影。

#### 6.33.4 投影、任务、命令反馈与原事实呈现

只有当前投影的 state===graph.state 且 result 的 session/snapshot/revision/projectionId 全匹配才绘制。
同图修订更换 projection.id 后，旧结果立即不合格，即使显示 ID/成员/折叠选项相同也不复用旧命中；
显示“折叠状态已改变，重新布局”。同一投影 pending/failed/cancelled 的保留结果沿原只读灰显规则。
可选择还须 success 且 request/result 的完整身份（含 taskId、projectionId）相同。

| 命令   | folded 分支资格/行为                                                                                                 |
| ------ | -------------------------------------------------------------------------------------------------------------------- |
| layout | 活动且投影当前；同投影 pending 禁用，不同投影的旧 pending 允许新明确布局 supersede；提交当前 projection 与 direction |
| retry  | failed/cancelled，request.graphRevision 及 projectionId 对应当前投影；使用服务已捕获输入，不把新投影伪装为旧 retry   |
| cancel | pending 且 request.projectionId 对应当前投影；只显式取消本服务当前任务                                               |
| select | 当前成功几何且有 items；调用 selectFoldedGraphElement(graph, selection, 当前projection, 完整target) 一次             |
| fold   | 活动且投影当前、组存在；按 §6.33.3 发一次同步受控意图                                                                |

宿主换 projection 不自动取消借用任务，旧任务仍按服务 deadline/取消/替代结算；晚成功/拒绝不能
成为当前视图结果或当前命令反馈。视图不拿“图 revision 未变”当成接受旧投影的理由。
每个事件/反馈还须原挂载与模型组合、当前提交帧、当前 graph state、当前 projection **对象**，
布局命令/选择同时核完整任务身份。图、投影或新操作取代旧操作后撤销旧反馈；同一合法命令自己的
pending→终态不撤销自身反馈。取消撤销旧布局命令回调但消费其拒绝，保持原规则。

FoldedSchematicViewFailure 所有分支带起始 sessionId/graphRevision/projectionId/error:unknown。
layout/retry/cancel 无 hit target；select 带原 FoldedGraphTarget 和 FoldedLayoutIdentity；fold 带
原 groupKey、请求的 collapsed:boolean，无 target/layoutIdentity。同步回调抛值和模型 Promise
拒绝沿原反馈纪律：只在仍合格时微任务报告一次、保留原 error；onCommandError 再抛时由 React
边界接收 AggregateError([原错误,反馈抛值])。新投影同步发布后旧 fold 抛值仍消费但不污染新帧。
不读取任意 thrown.message/toJSON，也不吞掉有效失败。卸载不 cancel/dispose 借用模型。

SVG 图元顺序、键盘、焦点回退、ARIA 和坐标规则沿 §6.30。投影更换即清旧焦点/详情目标，
仅当前 DOM 焦点属于待移除图元时回退自身容器；不复用旧 handler 或自动抢焦点。
节点/边显示原投影 label；层级/总线组详情额外展示 groupKey、全部原 members，层级节点同时展示
全部 internalEdges。每个原成员使用原字段清单与 owners/来源反查，原边 from/to/fact/位段/side/
映射均可查，不能只显示聚合计数或改写原端点；各成员在完整原事实详情中仍只读。
选择 items、精确高亮和 resolveObjectAnnotations 直接沿 §6.32/§6.31，聚合节点不把 internalEdges
的端点对象擅自加入选择；原来源 complete/partial/frontier/错误保持可见，不能由折叠改成 complete。
展开全部组后，布局显示每个原成员对应的独立显示图元，连接/位段/事实/owners 可反查原值；
几何坐标可重新计算，不承诺恢复以前的像素。

#### 6.33.5 兼容、实施与有限验证

本节只新增 L6/L7 能力，默认 LayoutService 的旧状态/输入、原投影工厂和原视图Props/Failure保持；
运行时共用既有 Worker/任务/锚点/几何/呈现实现。无 Core/SDK/IPC/Schema7/protocol2、C++ ABI、
插件/配置、依赖或工程格式变化，首版无持久化/迁移。新类型/组件仍由原包根导出。

C 审本节和具体签名后，B 仅对实际新边界一次有限冻结：显示布局身份与原生 ELK 往返；任务/
图失效；受控折叠与成员/内部边详情、选择和共享标注；投影/任务/旧事件反馈围栏；旧类型与行为回归。
复用既有真实 GraphSession/合法 fixture、Worker/浏览器设施，不新增观察、堆、基准或一般读屏平台。
纯投影原24/20/1以及原布局/原视图/标注 oracle 保留，不新增重冻条件。
前置齐后 A 直接实现上述完整纵向链、CSS/公开根/既有标准门禁，原生 ELK 展开恢复才可交付 A17；
A-04c 组合 demo/包外消费与 D-03 仍按原职责继续，不以本声明或内部重构宣布完整 M6。

## 7. 与旧代码的关系

### 7.1 第一版期间

新工程完全独立，不改 `dft_planner` 的任何文件，也不与旧的 `hdl-core` 链接。

Slang 不沿用旧工程的 10.0.101 预编译库，改为锁定一个较新的正式发布版本，从源码构建。理由：
- 旧分析以后都要在新接口上重写，不存在"新旧两个库链接进同一进程"的需求，版本不必一致。
- 从源码构建后，Debug 和 Release 都能用。旧工程因为预编译库是 Release 构建，Debug 构建会因 ABI 不一致而崩溃。
- `ref/slang-netlist` 和 `ref/yosys-slang` 跟随的都是较新的 Slang，对照它们的实现和测试更直接。

M0 确定的版本是 v12.0（2026-09-29 发布，提交 `545f88b2`），记录在 `core/cmake/Slang.cmake`。首次构建约 1 分钟。

构建期维护的本地扩展只生成 build-local 文件，上游/ref 源码保持只读，固定源码摘要不符时
配置失败。除诊断收集阶段的回调扩展外，M7 为 `DriverTracker` 增加每个符号的驱动类别汇总：
保留完整区间树及全部驱动，只有原 `checkOverlap=false` 且全部旧驱动与新驱动的
`isUnidirectionalPort` 相同时，才跳过不可能报告问题的两两扫描。混合类别、静态变量、
uwire 和无解析函数的用户网线类型仍走原重叠检查；初始化、间接端口及层次副作用处理保持。
汇总与区间树在原并发 visitor 锁内更新，不新增旁路缓存或改变源码访问对照。

该优化改变 Slang 私有对象布局，静态 Slang 与全部消费者必须使用同一覆盖头完整重建，
不能与未覆盖的预编译 Slang 混链；hier 公共 C++/协议/Schema/工程格式和生产预算不变。
实例缓存三个文件的 source id 继续只表示缓存判据，不能当作整个 Slang 未修改的证明。
固定源码摘要、诊断/驱动保留回归见 `core/frontend/SHARING_VERIFIED.md`；实际规模测量与
取消边界见 [M7 执行计划](plans/M7-dense-driver-analysis.md)，不作全平台延迟保证。

### 7.2 之后的集成顺序

| 阶段 | 内容 |
|---|---|
| 1 | `dft-suite` 用新的树、属性、源码、图组件替换 `HierarchyTree`、`PortsTab`、`HdlSourceTab`、`SchematicTab`，通用查询走新内核 |
| 2 | 分析逐个在 C++ 查询接口上重写，由简到难：寄存器统计 → 时序单元与 `drc-core` → SDC 对象枚举 → MBIST → 时钟复位树 → wrapper |
| 3 | 四个分析页面改为通过图片段和标注层显示，不再整体替换原理图存储 |
| 4 | 旧的 `hdl-core` 下线 |

不提供从新 ID 取 Slang 符号的过渡通道：分析是重写，不是移植。

过渡期的代价：阶段 1 到阶段 4 之间，新内核进程和旧守护进程并存，同一个设计会被编译两次，内存和打开时间相应增加。每重写完一个分析，旧守护进程少承担一项，到阶段 4 消失。

过渡期两个进程并存时的规则：

| 问题 | 规则 |
|---|---|
| 谁是权威 | 层级、端口、连接、源码位置以新内核为准。旧进程只对尚未重写的分析结果负责 |
| 两边是否同一设计 | 由 Electron 主进程里的一个"设计会话"对象统一持有打开参数，用同一份参数启动两个进程，重新加载时两个一起重启。界面上任何结果都带所属会话编号，编号不符的丢弃 |
| ID 互通 | 禁止把 `ObjectRef` 传给旧进程，也禁止把旧的路径字符串直接交给新组件。唯一的转换点是一个适配模块：旧路径经 `path.resolve` 变成 `ObjectRef`；解析不出来就显示为"无法定位"，不猜 |
| 切换粒度与回滚 | 按页面切换，每个页面有一个开关决定用新组件还是旧组件。一个页面在同一时刻只用一套 ID 和缓存。回滚就是关掉开关 |
| 旧进程退出 | 导航、属性、源码、图照常工作；尚未重写的分析页面显示"分析后端不可用"并可重试启动 |

对应的测试（两进程输入不一致、开关回滚、旧进程中途退出）属于阶段 1 的验收，不在本工程 M0–M7 之内，因为 M0–M7 交付的是独立工程，还没有接入 `dft-suite`。

### 7.3 旧协议方法的去向

| 旧方法 | 去向 |
|---|---|
| `expand-children`、`get-ports`、`get-parameters`、`get-source-location`、`get-diagnostics` | `inst.children`、`inst.ports`、`inst.params`、`obj.source`、`design.diagnostics` |
| `get-netlist` | `conn.bindings` |
| `find-objects` | `search`、`path.resolve` |
| `trace-fanin`、`trace-fanout`、`trace-drivers`、`trace-loads`、`trace-net`、`trace-net-loads`、`trace-into`、`trace-logic`、`trace-source` | `conn.drivers`、`conn.loads`、`trace.cone` |
| `get-sequential` | `seq.registers` |
| `decompose-logic` | 第一版只有 `proc.get` 的表达式结构；过程块降级以后做 |
| `get-register-count`、`clock-reset-tree`、`scan-budget`、`wrapper-cells`、`wrapper-cone`、`mbist-plan`、`memory-map`、`dfx-ip-cone`、`sdc-lint`、`dp-shell` | 留在 `dft-core`，阶段 2 在 C++ 查询接口上重写 |

### 7.4 各分析所需能力的核对

依据是对旧实现的逐项梳理。

| 分析 | 它读什么 | 新接口是否覆盖 |
|---|---|---|
| 寄存器统计 | 每个模块体里时序过程块写的变量位宽；模块体等价性 | `body().registers`、`forEachInstance`，模块体共享直接可用 |
| 时序单元、`drc-core` | 时序单元及其时钟、复位信号；沿结构追到源头 | `registers`、`cone` 用 `structural` 策略 |
| 时钟复位树 | 逐跳的驱动源分类、表达式穿透、常量折叠、上下穿层、blackbox 引脚 | `step` 逐跳枚举加 `process` 的表达式结构。循环、三值推导、引脚约束和记忆化留在分析侧。组合过程块里的选择逻辑第一版不能推导，见 4.5 |
| wrapper | 每个模块体的位级读写反向索引，含条件依赖和事件信号 | `body()` 的连接级事实，读操作带角色 |
| MBIST、memory map | 所有 blackbox 的路径和定义名；引脚连接；时钟追到根 | `search` 按种类过滤、`bindings`、`cone` |
| SDC 对象枚举 | 全设计的端口、引脚、信号、单元名字 | `forEachInstance` 加骨架事实；路径规范化用 `path.resolve` |
| dp-shell | 查找对象、顶层名、调用其他分析 | `search`、`path.resolve`、`roots`；规划状态继续留在 dp-shell |
| pad-core | 按定义名找 blackbox；引脚到信号；向上解析到顶层端口 | `search`、`bindings`、`drivers` 穿层 |

`genconn-core`、`ctrlgen-core`、`specgen-core`、`sdc-core` 不依赖设计数据库；`inject-core` 只做语法树级的文本改写。这五个与本工程无关。

### 7.5 首个独立时序结构检查消费者

按用户固定 M7 后推进上层分析的决定，`analysis/` 提供可选 C++ 消费者 `dft-seqcheck`，
通过公开 Design/Model 接口工作，规则不进入通用 Core 层，也不直接访问 Slang。
它是独立原生命令，尚未接入 Studio、Tcl、Electron 或原 NDJSON；新单元独立 B/C 待复核，
不将 M6 冻结集合的通过扩展为本分析已验收。构建默认关闭，以 `HIER_BUILD_ANALYSIS=ON` 显式启用。

首版枚举明确 scope 的 RTL 时序事实及实例/位段/源码，按完整控制点合并本次报告中的重复追踪，
沿 `cone(back, structural)` 保留原 TraceResult 证据。只经绑定到顶层 input 标为结构主输入来源；
完整精确追踪明确终止于未驱动/常量且没有主输入时才产生 CLK-UNCTRL / RST-UNCTRL。
内部过程/时序逻辑为待分析边界，黑盒、混合/保守来源、语义不完整或预算截断均保留 partial；
零违规不意味着 DFT clean。同步复位不从数据逻辑猜测，门控/测试旁路/库触发器和签核检查不在本版。

事实/实例/控制点及累计图大小和分析时间都有显式预算；取消/查询错误不返回成功报告。
每条事实仍保留原 clock/async 事件，控制点可被多个事实和角色引用，findings 按控制点/规则去重。
命令的 JSON v1 机器边界复用原 Schema7 定义，不修改 Core API/ABI、协议或默认生产预算。
执行成功与发现违规分账，默认 exit0；可显式选择违规 exit1 或不完整 exit4，后者优先。
完整解析未找到scope实例为not_found/exit3；语法/歧义/非实例为invalid_arguments/exit2，
解析不完整为执行失败exit5。此处缺失scope从原exit2修为3，与公开的目标不存在政策一致。
详见[命令与语义边界](../analysis/README.md)和[执行计划](plans/S2-sequential-check.md)。

#### 7.5.1 显式逻辑来源报告 v2

用户继续同一生产批次后，增加 `--logic` 的独立 v2 消费边界，默认 v1 结构模式不变。
只在原完整精确结构追踪的 logic_boundary 上，以公开 step/proc 追源并按 Write.exprMap
解释单个目标位；assign/init 支持 ref/const/not/concat/and/or/xor 与常量条件、相同分支 mux。
不解析 text、不从 conservative deps 猜值、不剥去 other/转换，也不推导过程块或 port_expr。
process/register 跳只定位身份；完整 Expr+精确值映射可独立确定值，不把原保守依赖改成 exact。
未知/混合来源、循环、多驱动、语义 partial 或预算不足保持停止；新证据保存原 step/proc。

直接 RTL 时序来源报告 CLK-GEN/RST-GEN；未知 mux/一般门控不据此推定不存在测试旁路。
来源分类不提供仿真波形等价性或签核证明，常量计算保留 X/Z 四态含义。
新增工作量预算全报告共享，解释深度/取消/deadline 同样生效；不承诺单次 Core 提取的硬截止。
v2 独立 Schema 复用原 Core 定义，旧 v1 validator 明确拒绝，原协议不变。
分析静态库 DTO 布局扩展须同批重编，旧 Request aggregate 字段顺序保留，Core ABI 不变。
本批新分析仍待统一独立复核；见[第二单元计划](plans/S2-control-logic.md)。

#### 7.5.2 显式时钟用途报告 v3

`--logic --clock-usage`显式启用rtl-control-usage-v1/v3，旧v1/v2不加字段或规则。
从已枚举的clockCheck按原位段/side双向遍历精确bitwise结构绑定，查找电气别名的
RTL register data/control/async精确依赖，产生CLK-AS-DATA warning。
不跟随过程内部逻辑；下游组合process可能是时钟buffer，单凭读取不能产生此警告，停为partial。
保守关系只作为不完整原因，黑盒/primitive/语义缺失/预算截断均保留partial和独立正证据。
complete仅说明当前结构别名域穷尽，不证明全部组合路径或全芯片用途完整。
scope限定被枚举的寄存器/时钟，用途可在其scope之外、仍属于同一打开设计。

新clockUsage保留原双向step响应、step/hop/continuation见证下标及原角色，
按原fact与裁剪位段去重；每个clockCheck仅执行一次，不跨不同实例合并检查项。
maxUsageWork在全报告累计，BFS按完整点身份去重，maxDepth/原deadline/取消同样生效。
warning不触发--fail-on-error；原error与partial优先退出政策保持。
v3机器Schema复用v2/Core定义，旧validator明确拒绝新格式；分析静态DTO须同批重编，
Core公开API/ABI、原协议/Schema7/预算/依赖/工程格式不变。
本批独立复核仍待完成，见[第三单元计划](plans/S2-clock-usage.md)。

#### 7.5.3 显式根的门控来源

`--logic --clock-root PATH BIT`声明最多64个顶层input端口的平坦位，公开路径解析后
只接受唯一顶层输入端口，拒绝内部对象/越界/重复语义位。不改变Core或强制信号值。
根声明才启用v4/rtl-rooted-gates-v1，旧三模式成功报告不加字段/规则；可合用clock-usage。

值解释沿已有完整step/proc与精确exprMap，在常量折叠后识别单个AND/OR门：恰有一
操作数来源匹配声明根，另一源为PI/register/undriven。gated结果保持partial/需测试协议，
enable为register或undriven时仅对clock角色给CLK-GATED warning；PI enable不告不可控。
两个声明根、未知mux/可能旁路、嵌套门控及不支持过程不猜测；常量开关沿原规则。
logic.gates保存过程、目标位、Expr args路径/结果bit、两端来源与反相，最终结果以gate下标
引用实际证据；未被最终结果采用的候选不产生finding。域为受支持RTL门，不推ICG/波形/DFT签核。
根匹配共享maxLogicWork，原深度/deadline/取消保持；根解析最多64项，单次Core调用非硬时限。
v4 Schema离线复用原三版/Core；分析静态DTO同批重编，旧aggregate源码位置保持，
Core API/ABI/协议/Schema7/依赖/工程格式不变。本单元待独立复核；见[计划](plans/S2-rooted-gates.md)。

#### 7.5.4 静态输入值上下文

`--logic --input-value PATH BIT 0|1`给最多64个顶层input平坦位指定静态值；输入解析与
clock-root共用PrimaryInputs，旧ClockRootInput/ClockRoot保留源码别名，不强制内部或inout。
重复语义位即使值相同也拒绝。每类解析有64项上限，deadline/取消保持，输入匹配计入logicWork。
只在原完整精确top_port终点应用该值，原Core响应与快照不变；已有primary_input在有上下文时
也重新解释，原语义partial/保守/混合不升级。缓存只在当前解释内，不跨上下文/请求。

显式v5/rtl-input-values-v1及interpretation=under_input_values表明这是条件结论；inputValues
保留canonical点和值，proof.appliedInputs保留实际读取的上下文下标，非最小依赖集合。
可静态打开/关闭门控或选择mux旁路；与声明根重叠的固定clock位不能仍作为可切换源。
CLK/RST-UNCTRL可能由有意的静态条件产生，不判断整个测试协议；结构clock-usage不随值剪除。
无值上下文时原四模式成功报告/机器Schema保持。v5复用旧值/门控/用途定义、旧validator拒绝，
没有声明根时clockRoots/gates为空。分析静态DTO同批重编，Core API/ABI/协议/Schema7/预算/
依赖/工程格式不变；无持久化/Studio/IPC/GUI接线，不提供模式切换或签核证明。
新单元待独立复核，见[计划](plans/S2-input-values.md)。

#### 7.5.5 同快照命名场景与来源比较

`--logic --scenario NAME`重复2..8次，在同一次Design::open与不可变快照运行原analyze。
每个分隔符后的input-value只属于当前场景，其它scope/根/预算/usage模式仍公共；
禁止第一个分隔符之前的input-value，无隐式全局覆盖。名称唯一/非空/最多128 UTF-8字节。共享请求校验拒绝非法scalar编码，错误不回显原非法字节。
新compareScenarios拥有独立请求/报告DTO，不改旧Request/Report布局或analyze签名。

独立rtl-scenario-sources-v1/formatVersion1封装保留所有已跑场景的原v2–v5完整报告、
公共原请求与各场景输入请求；五旧Schema拒绝封装。比较相对首场景，按完整控制点
ref/lsb/width/side并集匹配、保留两侧原checks下标，缺失为null，不解析opaque ID或按定义合并。
已证明单比特PI/register/常量/undriven描述才比较来源kind、来源point/ref、反相奇偶或四态值。
完整结构终点可保守投影；无位段身份unconnected/多终点/unknown/gated/缺失均unresolved。
changed/unchanged仅是支持域内的来源与有效0/1极性关系，不是功能/四态波形/测试协议等价。
原findings保留，不从无告警推定修复；局部partial不抹去其它已证明来源变化。

原分析预算逐场景适用、最多8份证据；整批另有max-scenario-millis默认60000/1..60000软时限、
max-comparisons默认10000/1..100000总比较行限。嵌套报告记录实际较小时间预算。
未开始场景显式not_run/budget_time，输入只是原请求；比较不确定/场景partial/时间或行截断
均使封装partial并保留正证据。错误或取消不发布半成功封装；原2/3/5及partial4优先/error1政策保持。
无硬编译/单次Core时间或总堆上限；取消/错误后可复用Design，无跨上下文值缓存。
共享私有请求/scope/常量解析与单一报告writer，Core/协议/Schema7/依赖/工程格式不改，
无Studio/Tcl/IPC/GUI接线；见[命令契约](../analysis/README.md)与[计划](plans/S2-scenarios.md)，待独立复核。

#### 7.5.6 控制来源清单

`--source-inventory`在原单/多场景分析后，用同一ControlSource/SourceIdentity权威投影按
已证明来源与极性分组，列出原checks及registers的clock/async事件引用。不查询或修改Design，
不扩大原分析范围；场景各自独立，not_run不构造清单。常量按值分组，不代表物理来源数。
旧ScenarioSource结构体标签保留，ControlSource为同一类型的公共别名，旧Request/Report和analyze/compareScenarios签名保持。

新rtl-control-inventory-v1/formatVersion1封装完整原分析和各清单；六旧Schema拒绝，无flag时
旧成功格式不变。组内checks、members.record/check/asyncIndex引用同一原报告，事件角色/
edge/type/位宽保持原事实，跨角色/多事实不丢引用。未知/门控/无身份终点单列unresolved，
不因名称/文本/无finding合组。原partial、缺失引用及任意截断使清单partial，保留原findings；
require-complete/exit4仍优先，error1仍依据原findings。完整仅指原已枚举RTL控制事件支持域。

新增inventorySources借用Report仅本次调用，结果拥有来源与索引；可在Design释放后运行。
有界预校验最多10000检查/100000事实/1000000事件的引用/形状/唯一控制点，非事实真实性证明。
每清单group默认10000/上限10000、members默认100000/上限1000000、work默认1000000/
上限10000000、millis默认1000/上限60000，均至少1；参数须显式source-inventory。
预校验独立于work；检查/结构投影边节点/事件访问计work，soft时间在原分析后单独起算，
取消/错误不发布半成功。组满仍可并入已有组；检查/成员前缀和输入总量/processed/visited计数
明确保留，未处理项非零扇出。最多8份清单限制逐份适用，非整批硬堆/时间或物理扇出保证。
Core API/ABI/协议2/Schema7/依赖/默认预算/工程格式不改，无Studio/Tcl/IPC/GUI/持久化接线；
见[命令契约](../analysis/README.md)、[计划](plans/S2-source-inventory.md)，本单元待独立复核。

#### 7.5.7 派生控制生成链

`--logic --control-generation`在原单/多场景分析之后解释已证明CLK-GEN/RST-GEN的生成关系，
可合用source-inventory。用公开origin对象所属实例分页查询registers，按完整ref匹配生成器，
保留原页/item/响应与RegisterInfo，再用同一ControlResolver解释clock/async事件。
可越出起始scope解释生成器，仍在同Design/上下文内，不改原报告范围或findings，不推寄存器Q值。
这不是物理时钟树、数据状态、波形、测试协议或完整DFT签核。

新增controlGeneration及拥有值DTO；核输入请求/引用形状/匹配快照，要求同Design未改写Report，
不认证任意伪造事实。seeds引用原checks，nodes按完整控制点去重，原证据按originalCheck引用，
新增点拥有control证明；generators按原事实ref展开一次，保留原clock/async顺序及页/item证据。
同信号不同位/事实不按名称合并，expanded仅指事件边已枚举。依赖循环提供闭合生成器/控制路径
（DFS回边见证、非枚举所有简单环），与未知/门控/原partial/未展开/预算不足一同保持partial。
原findings保留，partial4优先/error1仍依据原报告，不从图完整或零新finding推clean。

新rtl-control-generation-v1/formatVersion1封装完整原分析（可为清单封装）及各已跑场景图，
七旧Schema拒绝，无flag时旧输出保持。逐图controls1000/上限10000、generators1000/10000、
registerFacts10000/100000、work1000000/10000000、generationDepth16/0..1000、cycles64/1000、
millis1000/60000；新增累计traceNodes10000/1000000、traceEdges40000/0..4000000、logicWork10000/1000000。
其它限制至少1。生成深度与原单点logic深度独立，预算在原分析/清单之后逐图起算，非整批硬时间/堆。
原seed证据不重复计新增trace/logic数，work覆盖seed/投影、查询分派/事实、事件/展开与循环审计，
非Core调用总次数或字节数，单点解析另受累计trace/logic预算约束。
输出输入检查数、实际返回事实数/工作及前缀，未展开不冒不存在；取消传入Core，错误无半成功。

共用单点解析/报告校验/来源投影/原writer，旧Request/Report/已有API签名与结构体标签保持，
Core API/ABI/协议2/Schema7/默认预算/依赖/工程格式不改，无Studio/Tcl/IPC/GUI/持久化；
见[契约](../analysis/README.md)、[计划](plans/S2-control-generation.md)，本单元待批次独立复核。


#### 7.5.8 生成控制结构的场景差异

`--compare-generation`要求logic/control-generation及2..8场景，在原生成图之后按每个原控制点
比较可达生成解释结构。直接来源相同而上游生成器clock/async来源/极性或生成级数改变时，
仍可报告changed；原直接来源比较与findings保持。此为RTL控制生成结构相等，不是逻辑/波形/
可达性/测试协议等价或新增DFT规则，不将生成器反相沿时序边乘成根极性。

新增compareGenerationScenarios借用同快照未改写ScenarioReport与有序GenerationContext图引用，
不查询Design；结果拥有点/状态/索引容器，索引须配合同一原图解释。逐检查cone列原图节点索引，
按完整point排序；比较完整来源kind/point-ref-位-side/值/极性与生成事实身份及clock/async原事件。
显示路径、节点编号、发现深度、分页/发现顺序不是结构身份。两个局部cone均封闭、来源明确、
无循环/截断才能changed/unchanged，否则unresolved；不相关原partial不抹掉已有局部证明，
总质量仍与原批次/图合取。not_run/缺seed/未展开不当unchanged。

独立rtl-generation-comparison-v1/formatVersion1封装完整原generation输出及逐场景cones/比较行；
可合用source-inventory，旧八模式/Schema/签名与DTO布局保持。全比较批次cones默认10000/上限80000、
members100000/1000000、rows10000/100000、work1000000/10000000、millis1000/60000，均至少1。
有界结构/索引校验独立于work（最多8图、每图10000节点/生成器、100000事实/页、1000000事件），
不认证任意伪造事实。work计cone/节点/边/比较访问，排序/校验/单次操作非硬截止；软时限在原图后
单独起算，不是整批堆/硬时限。inputCones/processedCones/memberEntries/work及比较前缀显式保留，
member是上下文内各cone成员条目非物理数量。错误/取消无半成功封装，partial4/error1沿原政策。

复用原来源身份、报告校验及generation writer，无新增依赖；静态分析消费者同批源码构建，
Core API/ABI/协议2/Schema7/默认预算/工程格式及Studio/Tcl/IPC/GUI/持久化保持。
见[契约](../analysis/README.md)、[计划](plans/S2-generation-comparison.md)，本单元待批次独立复核。


#### 7.5.9 独立RTL寄存器位统计

`--register-statistics`独立枚举显式scope的RTL时序事实，不执行控制追踪/逻辑/场景。
registerStatistics通过公开scope/children/registers/object接口按实例分页，保留InstInfo、信号ObjectInfo、
原页/cursor/响应与事实page/item索引；含空实例并按实际definition ref汇总，参数化实例逐一求和。
同一信号按原扁平位区间扫描：factBits相加原事实宽度，coveredBits为并集，overlapBits为重数>1
的位数，segments给出各连续区间factCount。不同实例/信号不因定义/显示名合并，重叠不定性多驱动。
此为RTL写入位统计，非物理FF/Scan位数或DFT签核，未建模黑盒/primitive/interface保持partial。

新增StatisticsRequest/RegisterStatistics拥有值DTO/API和rtl-register-statistics-v1/formatVersion1严格
Schema。独立模式与原logic/scenario/inventory/generation及旧分析预算互斥；统计预算均--max-statistics-*。
默认/上限facts100000/1000000、instances100000/100000、signals100000/100000、segments200000/2000000、
work1000000/10000000、millis30000/60000，均至少1。逐实例非递归页最多200，总返回事实有界。
returnedFacts与已处理facts分账，原页未处理后缀保留。每信号coverage只在全部已收集区间完成后
原子发布；未完成信号保留原事实但无coverage，summarizedFacts/signals与coveredBits显式分账。
总partial时计数仅归已收集/已汇总域，coveredBits为下界，不能将未访问项当零。

整数端点/累计计数溢出返回错误，不wrap或发布半成功；取消传入Core并在扫描/汇总边界检查。
work计实例/分页/事实/信号元数据/子节点和区间访问；有界记账、排序/单Core操作非硬截止，
不保证编译硬取消/总堆。Core partial/未访问实例/任一截断保持总partial、原响应原因保留。
统计无违规规则，正常exit0（fail-on-error无finding可触发），require-complete沿partial4优先；
参数/不存在scope/执行错误沿2/3/5，库取消Error。所有返回值拥有，旧API/DTO/九Schema保持。

复用scope权威，统计独立遍历有自己的分页证据和预算，不修改已验收Check行为。
静态分析消费者同批重建；Core API/ABI/协议2/Schema7/web/默认生产预算/依赖/工程格式及
Studio/Tcl/IPC/GUI/持久化保持。见[契约](../analysis/README.md)、[计划](plans/S2-register-statistics.md)。
新统计待独立复核；先前三分析按REVIEW_LOG B48/C205限定对象接受，C-S2-02-01由C205正式关闭。


#### 7.5.10 寄存器原始事件分组与跨组位归属

`--register-statistics --register-event-groups`在原统计之后按原ClockEvent的signal/lsb/width/edge
与有序AsyncEvent（另含type）完整元组分组。ClockEvent无异步type，按Core原边界省略；
共享EventInfo内部默认分类不成为clock字段。不同实例/位/边沿/异步事件不按名字或定义合并。
缺signal/位身份的事实各自保留未决组，不合并、不参与已证明的跨组归属；保留原事件，统计不推可控。
这是原始事件元组组，不是主输入根等价、物理时钟域、DFT违规或波形/扫描协议判定。

新增groupRegisterEvents借用同源未改写RegisterStatistics，仅后处理、不查询Design，可在Design
释放后运行；返回事件值/索引容器拥有，索引仍需原统计报告解释。组成员引用原facts，
(group,原signal)对共用既有位覆盖计算；组内去重位之和可重复计跨组同位，不冒全局并集。
跨组归属只计同一状态信号同时被不同已知事件组覆盖的位，每段保留真实group索引，
同组多事实重叠不算跨组，三组共享4位仍是4位而非额外8条成员。

独立rtl-register-event-groups-v1/formatVersion1封装完整原统计及groups/signals/attributions。
分组收集和原信号归属均有计数；checkedSignals仅归成员全部分配且完成归属的原信号，
多已知组信号保留归属记录（可无交叠段），单已知组不增冗余记录；未知/未处理不冒零交叠。
组内coverage和每信号归属原子发布，输入partial及任意截断保持总partial与正证据/前缀。
默认/上限groups100000/100000、members100000/1000000、segments200000/2000000、
overlapMembers100000/1000000、work1000000/10000000、millis30000/60000，均至少1。
segments由组内和跨组共用，overlapMembers限交叠段group索引数；成员/新组满停止收集前缀，
仍可汇总已收集域。限制原统计后单独软起算，校验/排序/单操作非硬截止或总堆保证。

有界引用校验独立于work（最多1000000事实、100000信号/实例/定义、1100000页、4000000原事件），
核原事实位宽总和及索引形状，不认证任意伪造事实。错误/取消无半成功，partial4及原统计0/2/3/5
政策保持，不增加finding。十旧格式/Schema/DTO/API保持，纯提取原区间/整数/事件身份及统计writer
供实际使用方共享，静态分析消费者同批构建；Core/protocol/web/API/ABI/Schema7/协议2/默认预算/
依赖/工程格式及Studio/Tcl/IPC/GUI/持久化不改。见[契约](../analysis/README.md)、
[计划](plans/S2-register-event-groups.md)，新单元待复核，不将B48/C205原固定对象接受扩大。

#### 7.5.11 寄存器控制来源与来源内RTL位覆盖

`--register-statistics --register-event-groups --register-control-profile`在原统计/原事件分组之上，
复用ControlResolver、PrimaryInputs与SourceIdentity解释每组clock/async；可选既有logic/root/input-value。
控制检查按原signal/lsb/width去重，原角色/edge/type仍在原事件组，检查复用不合并事件身份。
已证明clock来源按完整ControlSource（含极性）+原edge建cohort；async独立保留证明和下标，
不同async不拆clock cohort，不将反相换算成edge等价。PI/constant/generated/undriven类别明确，
已知身份不等于可控或安全；unknown/gated/投影无唯一身份不进入已证明cohort，保留partial。
这不是物理时钟域、根波形等价、完整树/DFT/扫描协议或多驱动诊断，没有新增finding。

profileRegisterControls要求同Design快照且未改写RegisterStatistics，调用内借用Design/统计，
先调用原groupRegisterEvents，再独立起算profile软时限。返回拥有原组/新增控制证明/来源/索引容器；
原fact索引仍配同一统计解释，不跨Design/输入上下文缓存，不认证伪造事实。错误/取消无半成功。
每原组保留clockCheck/asyncChecks/eventsComplete/cohort，已处理组/事件/已归属事实分账；
未知或截断留下未决/缺映射，不冒零位或零扇出。同源cohort各原signal汇集其原事实后共用区间算法
求并集/重叠，不能简单相加原事件组位数；cohort之间的位数之和也不冒全局并集/物理FF/扫描位。
成员截断是组顺序/组内信号与事实的已访问前缀；coverage仅对该已收集域整信号原子发布。
输入partial、任意预算或来源未决保持全局partial，已证明来源和下界仍保留；完整只指当前RTL支持域。

新独立rtl-register-control-profile-v1/formatVersion1封装完整原事件分组（含原统计）与上述结果。
复用单点预算checks1000/上限10000、traceNodes10000/1000000、traceEdges40000/0..4000000、
depth64/0..1000、logicWork10000/1000000、millis30000/60000；logicWork为正且只在logic执行使用。
新增profile work1000000/10000000、members100000/1000000、segments200000/2000000，均至少1。
CLI原--max-checks/trace-nodes/trace-edges/depth/logic-work/millis只在此统计扩展模式可用，
新增--max-register-control-work/members/segments须显式profile；不合用其它分析/场景/usage选项。
原事件分组预算独立；检查/来源投影/组/成员/区间访问计work，trace/logic另按原累计预算；
校验/单Core/排序非硬截止/总堆保证。require-complete partial4优先，正常0与原2/3/5/取消Error保持。

复用原事件writer和已有coverage/control/source writer及解析权威；十一旧成功格式/Schema/原API/DTO保持，
新增静态消费者同批重建，不承诺新ABI稳定。Core/protocol/web/API/ABI/Schema7/协议2/默认预算/依赖/
工程格式及Studio/Tcl/IPC/GUI/持久化不改。见[计划](plans/S2-register-control-profile.md)与[命令说明](../analysis/README.md)。
本新单元与前一统计/事件单元待批次独立复核，B48/C205仍限原固定24df94a。


#### 7.5.12 寄存器已解析完整事件组合与跨组合位归属

`--register-resolved-events`要求原register-statistics/register-event-groups/register-control-profile，
后处理同一原统计/profile，不再查询Design。按已证明clock的完整SourceIdentity（含极性）+原edge，
及按原序排列的全部async SourceIdentity/edge/type合组；type=unknown照原事实保留，不假定reset。
只有每事件的原check/source证据齐全才可合组；unknown/gated/缺映射/未访问保留未决行及原因，
不能借clock-only cohort推断async。同clock不同reset/set、edge、极性或原async顺序不合并，
别名若完整组合来源相同可合组；不把反相转换为edge等价，不推物理域/波形等价/扫描/DFT安全。

新增groupResolvedRegisterEvents借同源未改写RegisterStatistics和RegisterControlProfile于调用期，
返回拥有来源值、组/行/成员/位段索引容器，可在Design释放后执行；解释原fact/原组索引仍需原报告。
先有界核快照/scope、原组/事实/事件/point关联、唯一检查与source和原共享proof投影一致，
不认证伪造事实；未使用的clock-only coverage不是本层来源证明。原source归属预算导致profile
partial时仍可重新汇总已证明事件，但全局partial保持，不升级原分析结论或丢失原findings边界。

rows为原组访问前缀，每行rawGroup/resolvedGroup/reasons及membersComplete分开记录来源已知与成员收集。
groups.rawGroups与signals.facts可回溯原profile/统计；组内按原signal共享区间覆盖重新求并集/重叠。
同组合重复写入不构成跨组；不同完整组合共享的状态位经原同一归属算法保留精确组号和区间，
三组共4位仍4位，不是额外8成员。只有该原signal全部原事实均已分配才发布跨组合归属，
未知/缺失不冒零交叠。coverage和每原signal归属原子发布，已收集域下界、summarized与assignedFacts分账；
组内位数之和可重复跨组同位，非全局并集/物理FF/扫描数。所有输入partial/未决/任意截断保持总partial。

独立rtl-register-resolved-events-v1/formatVersion1封装完整原profile（含事件/统计）和新结果。
默认/上限rows10000/100000、groups10000/100000、members100000/1000000、segments200000/2000000、
overlapMembers100000/1000000、work1000000/10000000、millis30000/60000，均至少1。
CLI --max-resolved-event-rows/groups/members/segments/overlap-members/work/millis须显式新flag。
组满仍能并入已有组，遇新组截断；成员按原组/组内信号/事实访问，segments共享组内与交叠段，
overlapMembers只计交叠段group索引数。新软时限在profile后单独起算；引用校验独立于work，
限制1m事实/100k信号/实例/定义/1.1m页/4m原事件、10k检查/1m trace节点/4m边；校验/排序/单操作不保证硬time/heap。
取消/错误无半成功；无新finding，正常0、require-complete partial4及原2/3/5政策保持。

纯提取原统计引用校验/跨组区间归属/profile writer供真实两消费者共享，十二旧格式/Schema/原API/DTO保持；
新增静态消费者同批重建，不承诺新ABI稳定。Core/protocol/web/API/ABI/Schema7/协议2/生产默认预算/依赖/
工程格式及Studio/Tcl/IPC/GUI/持久化不改。见[计划](plans/S2-register-resolved-events.md)与[README](../analysis/README.md)。
本批新单元待独立复核，不从B48/C205原固定24df94a接受推新代码通过。


---

#### 7.5.13 同快照寄存器完整控制事件场景比较

`--compare-register-scenarios`要求四个register flag、`--logic`和2..8个命名`--scenario`。
每个scenario之后的`--input-value PATH BIT 0|1`只属于该场景；首scenario前不允许全局输入值。
名称沿原严格UTF8 scalar/非空/128字节/唯一性校验，共同clock roots与单点预算保持。
CLI只枚举一次原统计，compareRegisterScenarios只分组一次原事件；各场景在同一Design快照下
复用原ControlResolver/PrimaryInputs/SourceIdentity和完整事件组合，无跨场景输入值或推理缓存。

相对首场景，按同一原rawGroup匹配，比较完整已证明clock来源/极性/原edge及全部有序async
来源/极性/原edge/type；不比较场景内resolvedGroup序号。同号可能不同源、异号也可能同源。
双方完整证据齐全才为changed/unchanged；任一未决/缺映射为unresolved，不借clock-only证明。
changed只指来源元组变化，不是状态数据功能/波形/物理FF或扫描协议等价、DFT违规或安全结论。
每个比较对changed原组的原state signal事实重新求位并集/重叠，多个事件组写同位只计一次；
changedTotals属该比较已收集/已汇总域，不将多个比较位数相加冒全批唯一受影响位。

新增RegisterScenarioRequest/Report及compareRegisterScenarios(Design&, statistics, request, Cancel)。
调用期借同源未改写Design/原统计，核快照及原有引用形状；不认证任意伪造事实。
结果拥有原组、各场景证明/来源/索引/位段，原fact索引仍须配原统计解释。
最多8份profile为保持原公开DTO各拥有一份共用事件值；不承诺硬总堆上限。
输入partial/任意场景或比较partial/预算/未知使总partial；局部已证明行与覆盖下界保留。
未开始场景为not_run，profile完成但batch截止未开始resolved为profile_only；不捏造空成功。
取消/已启动阶段错误返回Error，不发布半成功批次；不通过错误字符串推测截断，Design可重用。

新严格rtl-register-scenarios-v1/formatVersion1：analysis只存一份完整原事件/统计，场景profile和
resolved为省略analysis的严格视图（其余字段沿原Schema引用），按共享输入可还原两份原完整报告。
每场景记录请求输入、实际裁剪预算、阶段状态/原因和原证明；比较保留双方group引用和原rawGroup。
既有十三格式/Schema/原API/DTO保持，新增静态消费者同批重建，不承诺新增ABI稳定。

原统计/分组预算独立；共享分组之后batch软时间默认/上限60000/60000ms，单点profile/resolved
时间上限按剩余量裁剪。各context原profile/resolved预算各自适用，非全批累计trace/logic上限。
全批比较行maxComparisons10000/100000、work1000000/10000000、changed members100000/1000000、
segments200000/2000000，均至少1；CLI复用max-scenario-millis/max-comparisons，新增
max-register-scenario-work/members/segments。work计比较行/键async访问/成员/区间，原分组和
profile工作另记；比较行/成员按访问前缀，整信号coverage原子发布，缺项非零。
校验/排序/单Core查询非硬截止/总堆保证。无新finding，正常0、require-complete partial4优先，
原参数2/scope3/执行5及库取消Error保持。Core/protocol/web/API/ABI/协议2/Schema7/默认生产预算/
依赖/工程格式保持，无Studio/Tcl/IPC/GUI/持久化接线。B49/C206接受限先前dc7b35b四层分析，
本新场景单元独立B/C待复核。见[计划](plans/S2-register-scenarios.md)与[使用说明](../analysis/README.md)。


#### 7.5.14 寄存器控制的多级时序生成网络

`--register-control-generation`要求register-statistics/event-groups/control-profile和logic，
与register-resolved-events、register scenarios、旧control-generation/inventory互斥；不是隐式更改旧模式。
registerControlGeneration(Design&, statistics, profile, limits, Cancel)在同快照、同源未改写profile上，
借私有只读GenerationInput视图向原ControlGeneration walker提供request、控制访问器、roots/inputValues，
不复制证据构造伪造Report。复用原profile关联/原事件/来源proof校验及原生成解析/分页/循环权威。
旧Report入口验证顺序/含义保持，旧十四格式/Schema/API/DTO不变，新增静态消费者同批重建。

图保留原profile check的seed、原控制/新查询证明、generating RegisterInfo和实际查找页/item、
clock/有序async依赖和闭合循环见证，可查询统计scope之外的生成事实，按原ref/位/side身份去重。
不同写入位保持不同生成事实，多个别名指向同事实可共享节点；不推生成寄存器Q值、波形等价、
物理时钟域/扫描协议或DFT安全。门控/未知/未建模/循环/预算保持图partial，保留正证据。

新增RegisterGeneration拥有图及原组事件映射。events按原rawGroup序、clock后原async序访问，
每行保存role/asyncIndex、profile check和生成seed node；未访问check/seed保留null及原因，不能用node0补足。
已映射节点仍可能来源未知；mappingComplete只指原事件全部关联，不能替代图或profile完整性。
总complete合取原统计/事件/profile、生成图和映射完整性；任一partial/截断不能被下层升级。
调用期借Design/statistics/profile，结果拥有证明/来源/映射/页；原check/fact下标仍须原报告解释。
验证核快照/索引/投影形状，不认证伪造事实。错误/取消无半成功，Design可复用。

原GenerationLimits及--max-generation-*默认/上限/记账复用7.5.7，仅新flag或旧control-generation可用。
生成软时间在profile后验证完成独立起算；新映射maxEvents100000/1000000、maxWork1000000/10000000、
maxMillis30000/60000，均至少1，CLI --max-register-generation-events/work/millis仅新flag。
映射软时间在生成图之后独立起算，work一原事件行一次，行达到cap停止前缀；整行原子发布。
有界验证、原组事件计数/seed索引构建、排序和单Core调用不包含在映射work内，不承诺硬time/heap或编译硬取消。

新严格rtl-register-control-generation-v1/formatVersion1封装完整原profile（含事件/统计），
graph沿原Graph严格定义且scenario=null；limits记录图/映射预算，图quality/mappingComplete/全局quality分账。
生成writer共用、无新增finding，正常0/require-complete partial4优先、原参数2/scope3/执行5/库取消Error保持。
Core/protocol/web/API/ABI/协议2/Schema7/默认生产预算/依赖/工程格式保持，无Studio/Tcl/IPC/GUI/持久化接线，
不承诺新增分析ABI稳定。B49/C206只接受原dc7四层，本批新场景及本单元待独立B/C复核。
见[计划](plans/S2-register-generation.md)与[使用说明](../analysis/README.md)。


#### 7.5.15 完整寄存器生成结构的场景差异与影响位

`--compare-register-generation`要求原compare-register-scenarios及其全部依赖，在同一Design/原统计下
先执行原直接来源场景报告，再对每个已跑profile生成多级网络，复用原GenerationComparison的完整cone比较。
内部compareRegisterGenerationScenarios借私有只读batch view（场景存在性/check数量/point访问）接同一比较器，
不伪造ScenarioReport，不另造生成/控制/来源等价算法；原Report入口继续原验证。

原直接来源可能不变，而其生成寄存器的上游clock/async控制来源、极性或结构变化，本层仍可检出。
身份沿完整ref/位/side、已证明SourceIdentity、生成事实身份/原clock/有序async，不比较图号/check号。
每原rawGroup保留clock后全部有序async到结构比较controls行的引用；双方每事件已映射且完整cone比较已决，
才判断changed（至少一事件变）或unchanged（全部不变），任一缺映射/未决为unresolved。
相同的未展开生成链/循环也不是unchanged；局部完整cone在其它partial下可保留正证据。
changed只指证明的生成结构，非Q值/波形/物理域/扫描协议等价或DFT安全。

对changed原组按原state signal共享ChangedRegisterCoverage/IntervalCoverage求原事实位并集、重叠和段。
不同变化组覆盖同位仅计一次；changedTotals是每比较已收集/汇总域，不相加冒全批唯一位或物理FF/扫描数。
原直接来源报告完整保留，可同时见direct unchanged与deep changed。原统计调用期借用；返回拥有所有场景/
profile/直接比较、图/映射、结构cone/比较、原组影响/位段容器，原fact下标仍需原统计解释。
同快照/原引用校验非任意事实认证，无跨输入缓存。错误/取消无半成功，Design可复用。

原场景阶段预算不变；post阶段在其后独立软起算maxMillis60000/60000。逐图/映射由同一post截止裁剪，
原每阶段GenerationLimits/GenerationComparisonLimits继续适用，各context预算分别记录；图后再比较cone。
profile未跑或post截止使generation not_run，保留原因；不造空成功。新影响全批rows10000/100000、
events100000/1000000、work1000000/10000000、members100000/1000000、segments200000/2000000，均至少1。
每组影响行及其全部event引用原子发布；rows/events满或工作中断不发布半组，work计行/事件/成员/区间访问。
已发布changed组的成员/coverage沿原访问前缀与整信号原子发布，缺项非零。验证/索引/排序/单Core非硬time/heap。
输入partial/任一图/结构/影响截断均保持全局partial，零变化不是全域无影响。

CLI复用--max-generation-*、--max-register-generation-*、--max-generation-comparison-*；新增
--max-register-impact-rows/events/work/members/segments/millis须新flag，与单报告register-control-generation/
旧generation/inventory互斥。独立严格rtl-register-generation-scenarios-v1/formatVersion1：analysis为原完整场景，
逐context generation及structure只省略重复analysis，其余字段引用原严格Schema；按共享输入可还原原generation报告，
原组影响行events索引该比较的structure.controls。各阶段quality/原预算/全局计数保留；不重复输出大事实。

原十五格式/Schema/DTO/API含义保持，静态消费者同批重建，不承诺新增分析ABI稳定。无新增finding，
正常0/require-complete partial4优先及原2、3、5/取消Error保持。Core/protocol/web/API/ABI/协议2/Schema7/
默认生产预算/依赖/工程格式不改，无Studio/Tcl/IPC/GUI/持久化接线。B49/C206限原dc7接受，
本批三新单元待统一独立B/C。见[计划](plans/S2-register-generation-scenarios.md)与[说明](../analysis/README.md)。


#### 7.5.16 生成控制节点的寄存器位扇出与依赖见证

`--register-control-fanout`要求原register-control-generation及其依赖，沿原统计→profile→生成网络后处理。
新增纯API `registerGenerationFanout(statistics, profile, generation, limits, Cancel)`无Design查询，可在Design释放后运行。
只在调用期借同源未改写输入，返回拥有路径、归属和覆盖；原graph/event/fact索引仍需对应原报告解释。
复用原profile及生成图引用验证，另核原事件顺序/映射/闭合循环见证；形状校验不认证任意伪造事实。

origins为原generation.events的访问前缀，event索引保留原rawGroup、clock/async角色和asyncIndex。
只对捕获且有check/node的唯一check建立seed，按check升序；seed.origins引用origins，origin.seed未建立为null。
每seed按原generator clock后有序async边BFS，首次访问每node一次；steps保留首次最短依赖路径，parent指该seed
更早step，generator指原图生成事实，asyncIndex=null为clock，root三项均null。循环visited有限，不枚举全部路径。
每发现节点保存reaches(seed,step)，同seed多路径不重复；只有已发现节点有输出，不造未访问节点的零扇出。

逐节点从reaches合并已捕获原事件的唯一rawGroup，再按原state signal收集一次事实；复用原区间算法求coveredBits、
overlapBits和重数。clock/async同事实或不同组覆盖同位不重复算并集位；例如两事实[9:4]/[7:1]的factBits13、
coveredBits9、overlapBits4。不同节点的同一状态位可以重复出现，禁止把其覆盖相加解释为全设计唯一位。
这是RTL控制依赖的原scope状态位覆盖，非物理时钟树端点、物理FF/扫描位、Q值波形或DFT安全证明。

输入partial/未知/未展开/循环/任一截断保持全局partial，已发现路径和覆盖下界保留。traversalComplete只指该seed
对已提供图的遍历/来源展开完成，不能升级上游quality；membersComplete只指已发布reaches及已捕获origins的原组/
事实/覆盖完成，不证明完整设计范围。未汇总coverage省略，不用0替代未知；无节点也不能推出无影响。
错误/取消无半成功，随后可复用；origin/step/reach原子发布，coverage整信号原子发布。

RegisterFanoutLimits默认/上限：origins100000/1000000、seeds1000/10000、nodes10000/10000、links100000/1000000、
members100000/1000000、segments200000/2000000、work1000000/10000000、millis30000/60000，均至少1。
CLI对应--max-register-fanout-origins/seeds/nodes/links/members/segments/work/millis，只能显式新flag时使用。
links计(seed,node)路径/reach数，members计逐节点fact引用，segments计已发布coverage段；work计origin/seed/遍历边/
归属/成员/区间访问。前置有界校验、索引、排序及部分容器分配不在work内，软时间在校验后独立起算；非硬time/heap。
原统计/profile/生成预算独立，不将post时限当全调用截止，取消检查不构成Core编译中硬取消。

严格rtl-register-control-fanout-v1/formatVersion1封装完整原generation报告为analysis，原角色/事实/页/来源可追溯。
summary只汇总origins/seeds/nodes/links及信号条目，不输出跨节点coveredBits总和。共享RegisterFactCoverage沿原
RegisterChangedSignal结构tag与布局，旧十六格式/Schema/DTO/API含义保持，静态消费者重编，新增分析ABI不承诺稳定。
无新增finding，正常0/require-complete partial4优先及原参数2/scope3/执行5/取消Error不变。
Core/protocol/web/API/ABI/协议2/Schema7/默认生产预算/依赖/工程格式保持，无Studio/Tcl/IPC/GUI/持久化接线。
B50/C207有限接受原52154874，新单元待独立复核；见[计划](plans/S2-register-fanout.md)与[说明](../analysis/README.md)。


#### 7.5.17 终端控制来源的寄存器位覆盖与交叠

新增`--register-control-sources`要求原register-control-fanout及其依赖，库入口
`summarizeRegisterControlSources(statistics, profile, generation, RegisterSourceLimits, Cancel)`先运行原纯fanout，
再聚合终端来源。无Design查询，可在Design释放后运行，返回拥有fanout/源/索引/位段；原索引需对应输入报告解释。
复用原profile/生成图验证，形状验证不认证任意伪造事实；无跨上下文缓存，错误/取消无半成功，可随后复用。

每个已发布fanout.nodes节点对应一row，node索引fanout.nodes。kind沿原图已证来源，未知为unresolved。
只对primary_input/constant/undriven按完整ControlSource身份kind/point/side/sourceRef/value/inverted分组，
generated中间节点与unresolved行group=null，不猜根。groups按首次访问顺序，nodes反指fanout.nodes行，原路径仍在fanout。
极性不同分开；源组刻意不合并原事件语义：clock/async/edge/type仍沿origins→原generation.events/路径追溯，
它不是完整事件元组/波形等价/物理时钟域或DFT安全分组。

逐源组从其已发布节点合并唯一原rawGroups，复用ChangedRegisterCoverage/IntervalCoverage对原state signal事实求并集。
多个节点/别名/角色/路径同一fact只计一次。不同source组可共享同一fact，例如clock和async来源均影响该寄存器；
共享GroupIntervalAttribution按已收集facts求每个signal的多源归属段和crossGroupBits，同一位在该signal只计一次交叠。
13写入位[9:4]/[7:1]同源别名合为9并集位/4重叠位；不同极性为两源，交叠4位。两个独立clock/reset源共同影响
同一10位事实则两组各10位、跨源交叠10位，不能相加冒20个物理FF。交叠不判电气冲突/CDC/扫描违规。
summary只计条目，不相加source coveredBits当全域唯一位；这是已捕获RTL控制依赖，不推Q值/波形/物理扇出/扫描数。

fanout输入partial/未知/循环保持；rows/source/members/coverage/归属截断使全局partial，正证据保留。
组membersComplete只归本次已发布nodes及其已捕获rawGroups，任一输入node.membersComplete=false继续该组false，
不因重算局部coverage升级来源。attributionsComplete只归已发布组成员的归属阶段完成且各组本地完整，不证明全设计。
归属索引中断则attributionSignals为已索引signal数，完整索引后checkedSignals为排序signal访问前缀；
每个多组signal只原子发布全部交叠段，缺coverage省略、未访问范围不作0/无影响。节点行及反向组成员原子发布。

RegisterSourceLimits含原fanout预算；post默认/上限rows10000/10000、sources1000/10000、members100000/1000000、
segments200000/2000000、overlapMembers100000/1000000、work1000000/10000000、millis30000/60000，均至少1。
CLI对应--max-register-source-rows/sources/members/segments/overlap-members/work/millis，仅新flag可用。
原fanout/统计/profile/生成预算独立；post在fanout后独立软起算，work计行/节点原组/事实/区间/归属访问，
members计各源组fact引用，segments共享coverage与交叠段计数，overlapMembers计交叠段中的group引用数。
校验/排序/索引容器部分分配不在work内，非硬总堆/截止或Core编译中取消承诺。post过期保留完整fanout证据。

新严格rtl-register-control-sources-v1/formatVersion1封装完整原fanout为analysis；limits记录post，原fanout预算仍在analysis。
共享原扇出writer，不复制来源/区间/归属算法。原十七格式/Schema/API/DTO含义保持，新增静态消费者重编，新增分析ABI不承诺稳定。
正常0/require-complete partial4及原参数2/scope3/执行5/取消Error保持，无新finding；Core/protocol/web/API/ABI/协议2/
Schema7/默认生产预算/依赖/工程格式保持，无Studio/Tcl/IPC/GUI/持久化接线。本批扇出/本单元待统一独立B/C，
原B50/C207限52154874；见[计划](plans/S2-register-sources.md)与[说明](../analysis/README.md)。


#### 7.5.18 终端控制来源的静态场景覆盖矩阵

`--compare-register-sources`要求原compare-register-generation及其全部场景依赖；与单报告register-control-sources/fanout互斥。
新增`compareRegisterSourceScenarios(Design&, statistics, RegisterScenarioRequest, limits, Cancel)`先运行原完整生成场景，
再对其已运行profile/generation复用终端来源聚合。原统计/事件只枚举一次，无第二套来源/生成/区间算法。
API只在调用期借Design/原统计，返回拥有原场景/图/路径/来源/位段/矩阵，解释原fact仍需对应统计；
同快照/引用验证不认证伪造事实。没有跨上下文缓存；已启动阶段Error/取消无半成功批次，随后Design可复用。

按完整SourceIdentity(kind/point/side/sourceRef/value/inverted)跨context匹配，矩阵行按context首次发现及原source组顺序。
每row.source为原已证终端身份，groups包含每个context的source组索引或null，status为baseline0对context1..N-1。
不能用场景内临时group编号判断身份。只有双方source报告完整时null才是已证明空覆盖；not_run/partial的缺项未知，
比较为unresolved。同一身份的原state signal位并集相同为unchanged，不同为changed；合并相邻coverage段并忽略factCount，
不用事实列表/写入重数变化冒状态位覆盖变化。相同覆盖可与原deep结构changed并存，原报告完整保留用于分别判断。
极性不同为不同source行，不推事件边沿等价、跨触发器相位/Q值/波形/物理clock域/FF/scan或DFT安全。

原deep全局partial继续新全局partial；若partial只归原结构比较预算、各source上下文仍完整，可保留独立已决覆盖行。
source partial/未知/循环时不借相同已知子集判unchanged。零changed/无行不证明全设计无变化。
indexComplete仅指全部已提供source上下文的组索引已访问，不证明缺失context/全设计完整；inputSources是已索引唯一身份数，
索引中断为下界且不从未找到项判缺失。rows/groups/status整个source行及所有context引用原子发布，截断不发半行。
完整行可在其它partial下保留，intervals仅计已发布行使用的各context规范化区间；work含未提交行的实际访问。

RegisterSourceScenarioLimits含原generation scenario及source/fanout预算，CLI复用--max-register-fanout-*、--max-register-source-*。
新增post默认/上限rows10000/100000、cells100000/1000000、intervals200000/2000000、work1000000/10000000、
millis60000/60000，均至少1，对应--max-register-source-scenario-rows/cells/intervals/work/millis，须显式新flag。
cells计每完整row的全部context slots（含null）；intervals计逐context原signal规范化并集段，不按位展开；work计索引/行/slot/
区间/比较访问。原deep完成后独立软起算，逐source fanout及post用同一outer截止裁剪，实际预算记录在各context报告。
原公开source/fanout独立截止及私有post-only确定性入口不变；未启动来源context为not_run，已经启动的partial证据保留。
校验/排序/索引容器部分分配/单Core调用非硬总堆/截止/编译硬取消，最多8上下文仍为软内存边界。

严格rtl-register-source-scenarios-v1/formatVersion1：analysis为原完整生成场景；scenarios逐context sources及fanout
各省略重复analysis，其余属性逐一引用原Schema。由原deep的共享profile/事件/统计还原generation，再作为fanout.analysis，
最后作为sources.analysis，可验证完整原三格式。status为not_run时二者均省略，有实际结果时二者同时存在。
复用原writers，无手写第二套事实输出。limits记录原generation、source post、fanout及新矩阵post预算；summary不求跨场景位总数。
原十八格式/Schema/API/DTO含义保持，新增静态消费者重编，新增分析ABI不承诺稳定；正常0/require-complete partial4及原2/3/5/
取消Error不变，无新finding。Core/protocol/web/API/ABI/协议2/Schema7/默认生产预算/依赖/工程格式保持，无Studio/Tcl/IPC/GUI/
持久化接线。本批三单元待统一独立B/C，B50/C207仅限原52154874；见[计划](plans/S2-source-scenarios.md)与[说明](../analysis/README.md)。


#### 7.5.19 终端来源覆盖的新增、移除与保留位段

新增`--source-coverage-deltas`要求原compare-register-sources及其全部依赖；新
`compareRegisterSourceDeltas(Design&, statistics, RegisterScenarioRequest, limits, Cancel)`先运行原来源矩阵，
再解释其每个(source row, scenario1..N-1)比较。无重复原事实/场景枚举，无第二套来源/生成判断。
原规范化位并集提取为共用canonicalSourceCoverage，原矩阵的相邻合并/重数忽略/work/interval计费保持。
原矩阵/路径/来源/位段/索引完整保留在analysis，返回拥有全部值，调用期借Design/统计；原fact解释需该统计。
形状验证不认证伪造事实，无跨context缓存，已启动阶段Error/取消无半成功批次，Design可随后复用。

明细rows按matrixRow升序、scenario1..N-1顺序，是原analysis.rows及其status的访问前缀，不能重新推断或升级原verdict。
unresolved行不提供delta，不把未知填0。已决行delta按原statistics signal索引升序，给added/removed/retained位段及counts；
新增为B\A，移除为A\B，保留为A∩B。每组规范化后线性扫描有序端点，不逐位展开；同类相邻段合并，触边不算交叠，
uint64_t最大端点是合法事件而非终止哨兵。使用原BitRange，所有端点/位数累加按原受检计数。
counts含baselineBits/scenarioBits/addedBits/removedBits/retainedBits，前者=removed+retained、后者=added+retained。
逐行totals仅合计该来源/该比较的不同原signal；忽略写入重数，同位不会在一来源内重复算。

原完整context对某来源两侧均空可给精确空delta；partial/not_run缺项沿原矩阵unresolved，不能从空推不存在。
原矩阵全局partial继续明细全局partial，但其中独立已决行可保留。跨来源或比较可能共享同位，不将数量相加冒全批
唯一状态位/物理FF/scan；明细不是Q值/波形/物理clock域/DFT安全证明。inputRows/inputComparisons只归原已发布矩阵，
不代表全设计/原未访问source；无行或added0/removed0不证明全域无变化。

RegisterSourceDeltaLimits含原scenarios预算；新post默认/上限rows10000/100000、signals100000/1000000、ranges200000/2000000、
intervals200000/2000000、work1000000/10000000、millis60000/60000，均至少1，CLI为
--max-source-delta-rows/signals/ranges/intervals/work/millis，仅显式新flag可用。post在原矩阵后独立软起算，原预算独立。
rows计所有已发布明细行，signals/ranges/intervals仅计完整已决行：ranges是三类输出条目，intervals是该行两context
规范化输入（不同比较可重复基线），work含规范化/端点/信号/计数访问及未提交行的实际工作。每行全部信号/范围/计数
原子发布，任一cap/time/work中断不发半行或半计数，保留完整前缀；取消仍Error。排序/校验/部分容器分配及原阶段
单Core调用非硬总heap/time/编译硬取消承诺，private确定性post截止不改原矩阵截止或编译期取消语义。

新严格rtl-register-source-deltas-v1/formatVersion1封装完整原矩阵为analysis，直接复用原writer，原十九格式/Schema/API/DTO
含义保持；只增加新API和格式，静态消费者重编，新增分析ABI不承诺稳定。正常0/require-complete partial4及原2/3/5/
取消Error保持，无新finding。Core/protocol/web/API/ABI/协议2/Schema7/默认生产预算/依赖/工程格式保持，无Tcl/IPC/GUI/
Studio/持久化接线。B52/C209在实际有限集合接受bea973cc；本明细及后两投影视图的独立范围见REVIEW_LOG，见[计划](plans/S2-source-deltas.md)与[说明](../analysis/README.md)。



#### 7.5.20 按状态信号与位段反查来源覆盖变化

新增`--source-bit-attribution`要求`--source-coverage-deltas`及原全部依赖；
`compareRegisterSourceAttribution(Design&, statistics, RegisterScenarioRequest, limits, Cancel)`先调用原位差明细一次，
再对scenario1..N-1相对baseline按原统计signal升序反查来源。原完整delta/matrix/proof保留为analysis，
不重复事实/场景/来源/生成判断或位集合差算法；返回拥有analysis/行/段/引用，Design/统计仅本次调用借用，原fact仍需统计解释。

每个comparison固定scenario，state为complete/partial/not_run，inputCollected、sourcesComplete分开记录。
inputCollected仅在该comparison全部输入明细收集完成后为true；resolvedRows/unresolvedRows/missingRows对应原已发布矩阵的
来源行域，缺失的上游delta行计missing，不指全设计未访问来源。未完成收集时不发布半源索引：三计数保留0/0/原inputRows，
没有行，sourcesComplete=false；后续comparison为not_run。sourcesComplete仅原matrix.complete且全部matrix来源行已有已决delta，
无missing/unresolved时成立。上游任意partial保持全局partial，sourcesComplete不是整个上游/全设计完整性。

每signal一row，segments按lsb升序、互不相交，覆盖本comparison所有已决来源的新增/移除/保留证据并集。
每segment有原BitRange及addedRows/removedRows/retainedRows三个升序不重复数组，引用analysis.rows，
其中row.scenario必须等于当前comparison；三数组至少一个非空。来源身份/极性沿原matrixRow，不重新合并。
相邻且三个集合完全一致的段合并；触边不算交叠。先把(deltaRow,role)编码为私有组标签，复用原组端点归属扫描，
新视图取至少1个活跃标签，原跨组入口仍取2，旧work/区间计费不变。无需逐位展开，最大uint64端点正常处理。

每row及comparison.totals为coveredBits/changedBits/retainedOnlyBits：同一signal已发布段的唯一位；
有任意added或removed引用的段算changed，其余仅有retained算retainedOnly；covered=changed+retainedOnly。
同位由一个来源移除并被另一来源新增时保留两个引用，只算一次changed；多个保留来源共享同位也只算一次covered。
不同signal在comparison内求和，不跨comparison求全局唯一位。计数只归已发布行及已决来源证据；sourcesComplete=false时，
retainedOnlyBits、空行、changed0均不能证明所有来源不变/无影响。未知来源从不造0明细；不是Q值、波形、物理FF/scan或DFT安全结论。

新post在原delta后独立起算软时限，原各阶段预算独立；RegisterSourceAttributionLimits.deltas为原预算，JSON原预算在analysis.limits，
新JSON limits仅列post项。默认/上限rows10000/100000、intervals200000/2000000、segments200000/2000000、
members1000000/10000000、work1000000/10000000、millis60000/60000，均至少1；
`--max-source-attribution-rows/intervals/segments/members/work/millis`仅显式新flag可用。
intervals累计完成收集的comparison输入范围数（不同comparison可重复），rows/segments/members仅累计已发布行/段/三个引用数组元素；
work计实际输入/端点/成员/行访问，包括失败阶段。收集失败不累计其intervals，signal行失败不累计其rows/segments/members/totals，
保留已发布完整signal前缀；已完成收集预算仍保留。排序/分配/单Core调用非硬heap/time或编译硬取消。Error/取消不发半成功，可复用Design。

严格`rtl-register-source-attribution-v1/formatVersion1`直接共用原delta writer；新增标准API与CLI门禁。
旧二十格式/Schema/API/DTO/正常0/require-complete partial4/原错误2、3、5及取消政策保持，无新finding/依赖。
新增静态分析消费者重编，新增ABI不承诺稳定；Core/protocol/web/API/ABI/协议2/Schema7/工程格式不改，
无IPC/GUI/Studio/持久化。B52/C209对固定bea973cc有限接受本单元及7.5.19；见[计划](plans/S2-source-attribution.md)。


#### 7.5.21 来源集合转换的状态位分组

新增`--source-transition-cohorts`要求`--source-bit-attribution`及其原依赖；
`compareRegisterSourceTransitions(Design&, statistics, RegisterScenarioRequest, limits, Cancel)`只调用原反向归属一次，
再按每comparison的原段分组。完整原attribution/delta/matrix/proof在analysis，不重复事实/场景/来源/生成/位差/归属算法。
返回拥有所有analysis/cohort/source/member值，Design/统计仅调用期借用，原fact解释仍需原统计；Error/取消无半成功、可复用。

comparison按原scenario1..N-1，inputRows是原已发布归属行数；sourcesComplete沿原来源证明，inputComplete仅原comparison.state==complete，
不把来源已知冒原输出完整。两者是输入元数据，在本post未运行或过期时仍可为true，不代表已发布转换分组。
inputCollected仅本comparison整段索引完成后true；未完成收集不发cohort，inputSegments0，后续comparison not_run。
state complete要求inputComplete且全部cohort发布；否则partial/not_run。原任意partial保持本层总partial。

对每原段，baselineSources由removedRows+retainedRows，scenarioSources由addedRows+retainedRows映射原deltaRow.matrixRow后升序去重；
两个数组索引完整原matrix行（report.analysis.analysis.analysis.rows），来源完整身份/极性仍沿原行，不新造等价。
以两个vector的字典序为cohort顺序，只输出完整前缀。每cohort保存baselineSources/scenarioSources、changed、members及counts；
members为(row,segment)，索引analysis.comparisons[scenario-1].rows[row].segments[segment]，按原row/segment顺序。
相同集合对可把不同signal或同signal非相邻段归同一cohort。至少一个member、至少一侧来源集合非空，不逐位展开。

changed仅表示两个已知来源集合不同，与原段有added/removed一致；成员原位段互不交叠，每cohort唯一位数为其width之和，
counts复用coveredBits/changedBits/retainedOnlyBits、covered=changed+retainedOnly；changed组全部计changed，否则全部retainedOnly。
comparison.totals仅合计已发布cohort。比如{a,b}→{b,c}是一个完整集合转换，不展开为猜测的a→c或其它一对一配对；
同位多来源只算一次位宽。sourcesComplete/inputComplete不成立时，仅表示已发布已决证据的部分集合，
空集合/无组/retainedOnly/changed0不证明所有来源不变或不存在。不是Q值、波形、物理FF/scan、全芯片唯一位或DFT安全证明。

新post原归属之后独立软起算；RegisterSourceTransitionLimits.attribution含原预算，JSON原预算在analysis.limits，外层limits仅新post。
默认/上限cohorts1000/10000、members100000/1000000、sources100000/1000000、inputSegments200000/2000000、
work1000000/10000000、millis60000/60000，均至少1；
`--max-source-transition-cohorts/members/sources/input-segments/work/millis`仅新flag可用。
inputSegments累计已完成收集的comparison原段数；cohorts/members/sources仅计完整发布组/段引用/两来源数组元素，work含失败访问。
收集失败不提交其inputSegments；发布失败不提交该cohort的来源/成员/计数，保留字典序前缀，已完成收集计数保留。
临时索引受inputSegments/work约束，cohorts/members/sources为发布预算而非硬堆上限；排序/分配/单Core调用非硬time/heap或编译取消承诺。

严格`rtl-register-source-transitions-v1/formatVersion1`直接共用原attribution writer和counts，标准API/CLI门禁接线。
原二十一格式/Schema/API/DTO/正常0/require-complete partial4/原错误与取消政策保持，无新finding/依赖。
新增静态消费者重编，新增分析ABI不承诺稳定；Core/protocol/web及其API/ABI/协议2/Schema7/默认预算/工程格式保持，
无IPC/GUI/Studio/持久化。B52/C209在各自有限执行范围接受固定bea973cc的7.5.19–21；见[计划](plans/S2-source-transitions.md)。



#### 7.5.22 按层次实例和定义汇总来源转换影响

新增`--source-impact-summary`要求`--source-transition-cohorts`及其全部依赖；
`compareRegisterSourceImpact(Design&, statistics, RegisterScenarioRequest, limits, Cancel)`仅调用原转换一次，再投影其已发布成员。
完整原transition/attribution/delta/matrix/proof留在analysis，不重跑事实/来源/场景/位差/区间归属，不增加Core查询。
结果拥有analysis/实例行/定义行/原引用；Design/统计只在调用期借用，原fact解释仍须对应统计。Error/取消无半成功、可复用。

每comparison沿scenario1..N-1，inputCohorts为原cohort数。inputComplete取原transition.state==complete，sourcesComplete沿原来源证明，
二者为输入元数据，本post未运行/过期时也可为true，不表示新汇总已发布。inputCollected仅整comparison成员索引完成后true；
未完成收集不发实例/定义行或inputMembers，后续not_run。原任意partial保持总partial。

每原成员(cohort,member)指analysis.comparisons[scenario-1].cohorts[cohort].members[member]，再沿原归属row.signal映射
statistics.signals[signal].instance及statistics.instances[instance].definition。使用到的定义关系检查下标/原definition ref/name、
definition.instances的有效唯一实例及反向definition一致；按定义缓存本comparison已检成员集合，访问计work，不反复线性查找。
此为新入口所需元数据形状验证，不认证伪造事实，不改变旧API验证行为。

instances按原statistics instance下标升序，每行含instance/definition、原序(cohort,member)引用及SourceAttributionCounts。
原段同signal互不交叠，按其width及原cohort.changed汇总covered/changed/retainedOnly，不逐位展开，同位多来源不重复计数。
definitions按原definition下标排序，每行含该definition、已发布实例原下标升序数组和对应counts；同定义的不同实例各自状态位必须保留，
例如两个4位实例合计8位，不以模块体共享折成4。comparison.totals=实例计数之和=定义计数之和，这两个视图不能再相加。
定义仅汇总本次已发布实例前缀，不证明该定义在全设计的所有实例都已处理；不是物理库单元/物理FF/scan/DFT结论。
inputComplete/sourcesComplete不成立时，0/空行/retainedOnly也不证明全设计无变化或无来源。

新post在原transition后独立软起算，RegisterSourceImpactLimits.transitions含原预算，JSON原预算在analysis.limits，外层limits仅post。
默认/上限instances10000/100000、definitions10000/100000、members200000/2000000、inputMembers200000/2000000、
work1000000/10000000、millis60000/60000，均至少1；
`--max-source-impact-instances/definitions/members/input-members/work/millis`仅新flag。
inputMembers计完成收集comparison的原成员数；instanceRows/definitionRows/members计已发布实例行/定义行/原引用数；
work计输入/定义关系/实例成员访问及失败实际访问。收集失败不提交inputMembers；发布阶段每完整实例与对应定义成员/两个计数视图原子提交，
失败保留实例升序前缀。定义只有该前缀的聚合，定义输出排序不承诺定义访问前缀。定义视图收尾和序列化不额外开启可截断的半视图阶段。
临时索引受inputMembers/work限制，发布cap非硬heap上限；排序/分配/单Core非硬time/heap/编译取消承诺。

严格`rtl-register-source-impact-v1/formatVersion1`共用原transition writer/counts；标准API/CLI门禁和B52原冻接线。
原二十二格式/Schema/API/DTO/正常0/require-complete partial4/原错误与取消政策保持，无新finding/依赖。
新增静态analysis消费者重编，新增ABI不承诺稳定；Core/protocol/web及其API/ABI/协议2/Schema7/默认预算/工程格式不改，
无IPC/GUI/Studio/持久化。B53/C210在各自实际范围有限接受固定e02b0679的本单元，见[计划](plans/S2-source-impact.md)。


#### 7.5.23 来源影响的层次子树汇总

B54/C211已在固定c8edfde6复验相关范围，C-S2-08-01由提出方C211确认关闭；有限接受不扩大为整个M7/DFT验收。
沿7.5.22原实例影响新增compareRegisterSourceHierarchy，调用原impact一次后，以公开Design.instance/ancestors取权威实例链。
统计已有已访问实例时，scope来自原统计首实例ref，经Core返回canonical pathText与原scope核同；局部实例身份的ref/path/pathText/def/defName与原统计核同。
祖先Core顺序root到parent，不含self；从实际scope实例截断后加self。generate作用域不是实例，转义名字不解析pathText。
每不同局部ref只查一次instance/ancestors，同次调用跨contexts只缓存完整拓扑链，不缓存来源/位差结论；缓存不逃逸调用/快照。
排序用Core原path分量向量，仅此用于顺序，不据分量推导父关系。原统计/导航 metadata不一致报BadRequest，不伪造树。
无新增Core/protocol/web/依赖/工程格式/持久化或Studio接线；早期仅共享原impact writer和checked三计数加法。

compareRegisterSourceHierarchy(Design&,statistics,request,limits,Cancel)拥有原analysis/权威导航metadata/节点/引用，Design/统计仅调用期借用。
每comparison按scenario1..N-1，inputComplete沿原impact.state==complete、sourcesComplete沿原来源证明；原partial保持总partial。
scope只有成功公开查询后提供，queries记录实际启动的导航调用（scope.instance及每不同局部instance/ancestors）。
原统计在解析scope后、首实例访问前到期时，合法返回partial及instances=[]；本入口接受该前缀，省略scope metadata，不发起新导航，
queries/ancestorEntries/nodeRows/members/work为0，保留原analysis中的canonical scope和全部partial证据。不得把资源前缀改为BadRequest/exit2。
空comparison在新post实际运行时inputCollected=true/state=partial、无节点/无虚构根；原inputComplete/sourcesComplete不升级。
新post自身取消/过期仍沿原Error/未运行政策；空且complete的统计不是该producer合法结果，仍拒绝；非空原metadata验证不变。
此入口只继承原统计引用/快照验证，不为尚未访问的空前缀补做Core解析；不认证调用方伪造DTO的scope字符串。
合法公共scope仍由统计producer先解析，非法scope即使deadline已过仍按原错误返回；有完整已访问实例但无本地状态时仍查询并发布scope metadata。
--require-complete对此资源截断正常exit4；无该flag沿原成功exit0，绝不伪造complete或无变化结论。
ancestorEntries计完整接纳的scope到局部实例链条目（含两端、不同局部链可重复祖先）；不承诺底层单查询分配/执行的硬上限。
每节点info为Core原InstInfo，parent为scope内直接实例父ref或scope的null；depth按实际实例链计，不按generate路径分量数。
members为原analysis.comparisons[scenario-1].instances的升序行号，local为该节点对应本地实例行或null；每原行在一节点仅计一次。
节点counts是这些原行counts之和，原实例状态位互不重叠；不同层节点会重复包含同一位，不能相加。
comparison.totals仅取已发布scope根节点counts；根未发布/无已决实例行时为0，不造空节点。根发布后即使子节点被预算截断，根成员及计数仍完整属于原已发布实例域。
inputCollected仅整comparison分组完成后true，失败不发半节点；节点按Core path向量字典序完整前缀发布，父节点必已发布。
收集/节点失败不提交半成员/计数，queries保留实际调用数，完整链缓存计数保留。Error/取消无半成功，可复用Design。
输入partial/无节点/0/retainedOnly不证明全设计无变化；不是物理FF/scan/DFT安全或完整全芯片树。

post默认/上限queries10000/100000、ancestors200000/2000000、nodes10000/100000、members200000/2000000、
work1000000/10000000、millis60000/60000，均至少1；原impact预算独立，外层JSON limits仅post，原预算在analysis.limits。
members计已发布节点的原行引用，nodeRows计发布节点，work含导航处理/链/成员实际访问及失败访问。缓存/分组受ancestors/work约束，发布cap不是硬heap；
排序/分配/单Core调用为软time/heap边界，导航使用原Cancel，不新增编译硬取消保证。

--source-hierarchy-summary要求--source-impact-summary及全部原依赖；--max-source-hierarchy-{queries,ancestors,nodes,members,work,millis}仅新flag。
严格rtl-register-source-hierarchy-v1/formatVersion1封装共用impact writer和Core InstInfo Schema；旧二十三格式/API/DTO/退出政策保持。


---

#### 7.5.24 终端来源与层次子树的覆盖变化矩阵

B54/C211在固定c8edfde6复验/有限接受相关范围，C-S2-08-01由C211确认关闭；保留原空统计partial传播语义。
沿原hierarchy只调用compareRegisterSourceHierarchy一次，复用其node.members→原impact实例/cohort/member→原attribution段。
每cohort只把原两个有序来源集合合并为三角色，完整原证据保留analysis；不重跑事实/来源/场景/位差/区间归属或新增Core查询。
早期仅共用原hierarchy writer，原64回归单独固定；Core/protocol/web/工程格式/生产依赖不改。

compareRegisterSourceHierarchyMatrix(Design&,statistics,RegisterScenarioRequest,limits,Cancel)仅借用输入到调用结束，返回拥有所有analysis/row/member。
report.analysis为完整RegisterSourceHierarchyReport，外层limits仅新post，原预算在analysis.limits。
合法首实例未访问partial沿同一hierarchy修复链接受；原scope metadata省略/查询0，矩阵无原节点则无source-node行、五全局计数0。
原canonical scope/partial证据保持嵌套analysis，比较按原partial/未运行政策，不把空前缀包装为参数错误或完整无影响。
comparison沿scenario1..N-1，inputNodes为原已发布节点数；inputComplete沿原hierarchy comparison.state==complete，sourcesComplete沿原证明。
先完整收集comparison，再按(source,node)原索引字典序发布完整pair行前缀；inputCollected仅完成收集后true。
每row.source索引原matrix行（report.analysis.analysis.analysis.analysis.analysis.analysis.rows），node索引report.analysis.comparisons[scenario-1].nodes。
每member(row,segment,role)指原attribution（report.analysis.analysis.analysis.analysis.comparisons[scenario-1].rows[row].segments[segment]），
role为added/removed/retained，只表示该来源在原cohort两侧集合的归属；成员按原row/segment升序、同pair不重复。
同位{a,b}→{b,c}中a removed/b retained/c added，不猜一对一迁移；保留来源即使同位其他来源改变仍计retained。
row.counts复用SourceDeltaCounts：baselineBits=removedBits+retainedBits，scenarioBits=addedBits+retainedBits。
不同状态signal/段互不交叠，同source-node只计一次；不同source可能共用位，不同node层级包含相同位，各行不可相加为全局唯一位。
不增加全局totals以免混淆。只列原已发布节点及实例成员的已决证据，不重建未发布祖先/节点/来源或未知的0行。
inputComplete/sourcesComplete是原输入元数据，不表示本post完成；原partial保持总partial，无行/retained/0非全设计无变化/DFT证明。
comparison.inputNodes始终记录原节点数；global inputNodes及inputMembers仅计完整收集。收集失败不发半索引/新增全局收集计数/行；输出行成员与五计数原子发布，后续comparison not_run。
Error/取消无半成功，Design可复用，原fact仍需原统计解释；结果在输入释放后拥有全部新值及嵌套证据。

新post在hierarchy后独立软起算，默认/上限rows10000/100000、members200000/2000000、inputNodes10000/100000、
inputMembers200000/2000000、work1000000/10000000、millis60000/60000，均至少1。
inputNodes/inputMembers计完成收集comparison的节点数/来源角色展开引用数；rows/members仅完整发布行/引用，work含实际失败访问。
临时cohort角色cache限同comparison、同快照，且仅复用原集合归属；原链仍单次调用，不另跨输入缓存判断。
缓存/临时分组受原输入/new work/inputMembers控制，发布cap非硬heap；排序/分配/单Core仍软边界，不新承诺编译硬取消。

--source-hierarchy-matrix要求--source-hierarchy-summary及原全部依赖，--max-source-hierarchy-matrix-{rows,members,input-nodes,input-members,work,millis}仅新flag。
严格rtl-register-source-hierarchy-matrix-v1/formatVersion1，旧二十四格式/API/DTO/Schema/退出/错误/取消政策保持。


---

#### 7.5.25 来源子树变化的信号位范围明细

B54/C211对固定c8edfde6的本单元及定向选择有限接受，C-S2-08-01由C211确认关闭；不扩大为整体里程碑或DFT签核。
沿7.5.24原矩阵只调用compareRegisterSourceHierarchyMatrix一次，再线性展开已发布pair成员，不重跑事实/来源/角色/位差/归属，不新增Core查询。
原matrix writer、checked角色五计数及端点partition的相邻范围追加先共用提取，原70回归单独固定；旧阶段工作/范围准入位置和语义保持。
范围只从原attribution的已决不交叠段合并相邻同role项，不推导新覆盖或补造被截断的证据。原signal/fact索引须用对应统计解释。
Core/protocol/web/依赖/工程格式/持久化/IPC/GUI/Studio不改，新增静态analysis消费者重编，无新增ABI稳定承诺。

expandRegisterSourceHierarchyRanges(Design&,statistics,RegisterScenarioRequest,limits,Cancel)同步借用输入，返回拥有全部analysis/新pair/signal/range/member值。
每comparison沿scenario1..N-1，inputRows为原已发布矩阵pair数，inputComplete沿原matrix.state==complete，sourcesComplete沿原证明；原partial不升级。
每row.matrixRow指analysis.comparisons[scenario-1].rows，按原行号完整前缀；其signals按原statistics.signal升序。
每signal含signal、added/removed/retained三个BitRange数组、原SourceDeltaCounts及members（升序索引该原matrix row.members）。
原member再指五层analysis下原attribution段；source/node身份继续引用原matrix，不重造新的来源或实例标识。
同role区间按lsb升序、不交叠且相邻合并；孔洞不填、不同role不合并、不同signal不合并，不逐位展开。
原矩阵成员顺序已是原attribution row/segment顺序，新入口线性分signal，仅验证所用引用/区间非交叠/顺序，原role原样解释。
每signal counts baseline=removed+retained、scenario=added+retained，复用原SourceDeltaCounts/受检角色计数更新；所有signal和该pair原计数一致。
每signal members仍保留全部原段引用，即使多个原段合成一个范围也不丢证明。行不另复制source/node/counts权威表示，不加误导全局totals。
来源之间及祖先层级相互重叠，不相加为全局唯一位；范围只属于原已发布已决证据，partial/0/空不证明无来源/无变化/物理FF/scan/DFT。

每完整pair的signals/所有角色范围/members/计数原子发布；失败不发半pair，后续comparison not_run，work保留失败访问。
comparison.state complete仅原inputComplete且全部pair完成，否则partial/not_run；metadata输入完整不表示新post完成。
原合法空统计partial沿C-S2-08-01修复链接受、原H scope省略/query0，新明细无行/计数0，不伪造根；自己的post截止/取消独立保持。
错误/取消无半成功且Design可复用；所有新值与原analysis在输入释放后拥有，原fact解释仍需对应统计。

新post独立软起算，原matrix预算在analysis.limits，外层JSON limits仅新项。默认/上限rows10000/100000、signals100000/1000000、
ranges200000/2000000、members200000/2000000、work1000000/10000000、millis60000/60000，均至少1。
rows/signals/ranges/members仅计完整发布pair/信号/规范区间/引用；范围合并不增加ranges，原成员不丢失；work计每pair/成员访问及失败访问。
临时最多当前pair，受原matrix输入/new work约束，发布cap非硬heap；分配/序列化/单Core/编译取消非硬时限或硬堆承诺。
--source-hierarchy-ranges要求--source-hierarchy-matrix及全部原依赖，六--max-source-hierarchy-range-{rows,signals,ranges,members,work,millis}仅新flag。
严格rtl-register-source-hierarchy-ranges-v1/formatVersion1，旧25格式/API/DTO/Schema/正常0/require-complete partial4/原错误及取消政策保持。


---

#### 7.5.26 来源信号位范围的定向选择查询

新增selectRegisterSourceHierarchyRanges仅借用同源未改写的RegisterSourceHierarchyRangeReport，不访问Design、不重跑来源/层级/位段算法，Design/统计可已释放。
结果拥有新query/行/区间/成员值，返回索引需配同一原range报告解释，不认证任意伪造事实；使用到的索引/区间/角色检查失败返回Error，不发半成功。
默认scenario1（对baseline0），须1..7且在输入comparisons存在。可组合原source矩阵索引、精确Core canonical node.pathText、原statistics signal索引、added/removed/retained角色与位窗口。
未填字段不限，source/signal合法索引值可无匹配；节点不拆路径/不猜父子/不作前缀，非空有效Unicode scalar UTF8、无NUL、最多4096bytes。
query的索引/窗口JSON数值为uint64十进制，消费者须使用精确整数解析（可超过JavaScript Number安全范围）；这不是Core BitRange事实或IPC字段。
位窗口半开[lsb,lsb+width)，width正且加法不溢出uint64；各信号独立截取，孔洞/不同角色不合并，不逐位展开生产范围。

新SourceRangeSelection.rows每行rangeRow/rangeSignal指input.comparisons[query.scenario-1].rows[rangeRow].signals[rangeSignal]。
value复用SourceHierarchySignalRanges，signal为原statistics索引、三role范围和SourceDeltaCounts只计所选角色/窗口，未选角色为空/计数0。
value.members仍为原matrix row.members索引，保留所有真正相交的原证明段，滤掉窗外/未选role；一个合并范围可保留多个证明。
返回行按原rangeRow/rangeSignal顺序，仅完整匹配signal原子发布；与原range阶段整pair原子性分开，不重排成新的来源/实例身份。
inputRows为所选原comparison已发布range行数，visitedRows计本次实际访问pair，inputComplete仅所选comparison.state==complete，sourcesComplete沿原。
原report任一partial继续使查询总partial，即使筛选无命中或所选comparison完整；空结果不推未发布域无来源/无变化/物理FF/scan/DFT。
不同来源/祖先的同位仍可能重复，不能相加为全局唯一状态位；无新增finding或全局位总计。

预算默认/上限rows10000/100000、ranges200000/2000000、members200000/2000000、work1000000/10000000、millis60000/60000，均至少1。
rows/ranges/members仅完整已发布signal行；work逐原pair/signal/所选role区间/证明成员访问，包含非命中及失败访问，非查找成本为0的索引服务。
row满只在出现下一匹配行时截断；不把后续非匹配扫描当超限。失败保留完整匹配前缀及实际work，不发半行。取消返回Error，错误后调用方仍可复用原输入。
新post独立软起算，临时最多当前signal；分配/单操作非硬堆/时限，非Core/编译硬取消承诺。
原C08空producer经44aadad6范围链保留scope省略/query0，查询inputRows/visitedRows/work/范围/成员0且partial，不伪造根或升级空结果。

CLI --select-source-ranges要求--source-hierarchy-ranges及全部原依赖，只生成一次原range报告再调用借用选择API。
--select-scenario/source-index/node/signal-index/role/lsb/width与--max-source-selection-rows/ranges/members/work/millis仅该flag使用；lsb与width必须同时出现。
严格rtl-register-source-range-selection-v1/formatVersion1将完整原range输出保留analysis，并序列化上述query/limits/quality/metadata/rows/counters。
原range/signal writer和既有UTF8规则实际共用，原scenario名128bytes/唯一性/编码政策保持。
旧26格式/API/DTO/Schema/退出0/require-complete partial4/原错误2/3/5/取消政策保持；新增静态消费者重编，无新ABI稳定承诺。
Core/protocol/web/依赖/工程格式/持久化/IPC/GUI/Studio不变。B54/C211对固定c8edfde6有限接受，C-S2-08-01由C211确认关闭。


---

#### 7.5.27 来源选择结果的逐场景写入事实证据

explainRegisterSourceSelection(statistics,ranges,selection,limits,Cancel)只同步借用对应快照、未改写的三个producer结果，不查询Design或重跑来源/范围/选择，Design可已释放。
每原selection行提供原ControlSource、Core节点InstInfo、状态信号ObjectInfo及其所属实例InstInfo；节点可能为祖先，不把它当状态信号所属实例。
每原选中matrix成员展开role与原attribution段按query窗口的截取，再按原source-matrix.groups[context]→source-context.groups→同signal.facts列所有且仅真正相交的原写入事实。
removed仅baseline0，added仅query.scenario，retained按0再query.scenario；保留context/group和matrix成员索引，不重新判断控制来源或哪个事件可控。
原RegisterInfo的ref/inst/signal/process/bits/clock/async完整复制、不改原bits；每fact entry另有与该proof截取段相交的bits。
process只是原Core引用，不提供新HDL位置、因果/波形/物理FF/scan/DFT规则。原控制来源组仍是归属权威，原路径/判定保留在analysis。

新facts字典按首次使用顺序对原statistics.fact索引去重，每原RegisterInfo最多复制一次；row/proof/context的fact entry指本字典。
同事实可跨proof/context/祖先重复，factEntries计条目，不能将各条位宽相加为唯一位；字典去重也不合并不同实例/不同事实。
rows保留selectionRow，proof保留原matrix成员索引/role/bits，contexts保留scenario/group，fact字典保留原fact索引及owned info。
返回所有query/metadata/原事件/截取范围/容器都拥有，释放Design/统计/ranges/selection后仍可展示；原索引回溯仍对应原producer。
每完整selection行及其新增事实字典、proofs/contexts/factEntries同时原子发布；失败不发半行或悬空字典引用，保留完整行前缀及实际work。
inputRows沿selection.rows数，inputComplete沿selection.complete，sourcesComplete沿原；统计/ranges/selection任一partial均保留总partial，输入metadata完整非本post已完成。
C08合法空producer保持空rows/facts/计数/work，scope字符串来自原统计canonical scope，原Hierarchy仍省略scope metadata/query0，不伪造新根或完整零变化。

复用原validateStatisticsReferences有界校验统计引用（独立于新work）；核原RegisterScenarioReport snapshot/scope、用到的source/group/signal/member/fact身份及选中段包含关系，非认证任意伪造事实。
仅本调用缓存(source,scenario,signal)原组信号查找与已发布事实字典，指针不逃逸、不跨输入/快照缓存，不复制来源判定/区间算法；相交与原selector共用。
预算默认/上限rows10000/100000、proofs100000/1000000、facts(引用条目)200000/2000000、work1000000/10000000、millis60000/60000，均至少1。
rows/proofs/contexts/factEntries与新增字典仅整行提交；work计行/proof/所选范围/context/组信号/fact访问及失败，查找命中仍计context，校验/分配/单操作不是硬时限或硬堆。
原统计引用校验后独立软起算，临时最多当前行且受新proof/fact预算约束；取消/Error无半成功，原输入可复用，不承诺Core/编译硬取消。

--explain-source-ranges要求--select-source-ranges及原依赖；--max-source-evidence-rows/proofs/facts/work/millis仅新模式。
严格rtl-register-source-range-evidence-v1/formatVersion1保留完整selection封装在analysis，共用原query/ControlSource及Core metadata/RegisterInfo Schema与writer。
旧27格式/API/DTO/Schema/0/require-complete partial4/原错误2/3/5/取消政策保持，新增静态消费者重编，不承诺新增稳定ABI。
Core/protocol/web/依赖/工程格式/持久化/IPC/GUI/Studio不变。B55/C212对固定7e48af81的本节有限接受；接受范围与执行证据见REVIEW_LOG，C08沿C211 closed。


---


#### 7.5.28 写入事实的声明与过程源码定位

locateSourceEvidence(Design,evidence,limits,Cancel)同步借用活动Design和对应快照、未改写的SourceRangeEvidence，先调用原snapshot(Cancel)核snapshotId。
仅遍历原evidence.facts，逐事实调用原Core.source(signal,Definition)与Core.source(process,Statement)，不重跑统计/来源/位选择或从HDL文本猜位置。
位置字典按(ref,kind)首次使用顺序去重；同一过程的多个写入事实共用一个位置，不因共享定义的物理span相同而合并不同实例引用。
每行保存原evidence字典fact、原statisticsFact、寄存器ref/inst及本字典signalLocation/processLocation；不复制原事件或增加新的因果/DFT判定。
位置保存原ref/kind和Core SourceSpan的file/path/start/end/contentHash；status为located或not_found，只有located有span。
NotFound原结果使该位置not_found且总partial，继续其它事实；不是断言任意伪造引用为真实对象。其它Core错误（含BadRequest/取消）原样返回Error，无半成功。
要求scope非空、原query合法，所用fact索引/寄存器引用唯一且四个原引用非空；同快照不认证任意篡改的producer，合法输入须来自原未改写证据。
返回拥有全部引用/位置/查询值，Design和evidence释放后仍可导航；文件hash和偏移描述原快照物理文件，不证明磁盘未改变，不读磁盘或复制源码文本。

默认/上限facts10000/200000、locations20000/400000、queries20001/400001、work1000000/10000000、millis60000/60000，均至少1。
queries计一次snapshot和所有实际source调用，含未发布行；work计每fact及两位置查找（缓存命中仍计），不把源索引内部工作计作0成本性能保证。
每完整fact行与其最多两个新位置一起原子发布，rows为原fact字典前缀；locations/missing只计已发布字典，失败不发半行/孤儿位置，实际work/queries保留。
maxFacts满只有出现下一事实才partial，恰好预算允许完整；snapshot后检查自身软截止，空输入仍queries1/work0；取消/Error后输入可复用。
inputFacts沿原字典数，inputComplete沿evidence.complete，sourcesComplete沿原；原partial保持总partial，所有已定位也不把上游升级complete。
C08空producer沿原链scope metadata缺省/导航0，新层只作一次snapshot校验、空rows/locations/work0且partial，不伪造根或完整零变化。
仅本调用缓存位置，软时间覆盖snapshot/source；单次Core/分配非硬截止、硬heap或编译取消保证。

--locate-source-evidence要求--explain-source-ranges及原全部依赖，--max-source-location-facts/locations/queries/work/millis只供此模式。
严格rtl-source-evidence-locations-v1/formatVersion1保留完整原evidence在analysis，共用原query/quality及Core SourceSpan Schema与writer。
旧28格式/API/DTO/Schema/默认预算/0/require-complete partial4/原错误2/3/5/取消政策保持；新增静态消费者重建，无新稳定ABI承诺。
Core/protocol/web/依赖/工程格式/持久化/IPC/GUI/Studio不变。B55/C212对固定7e48af81的本节有限接受；接受范围与执行证据见REVIEW_LOG，C08沿C211 closed。

---


#### 7.5.29 核对快照后的源码证据片段

readSourceEvidenceExcerpts(Design,locations,limits,Cancel)同步借用活动Design及其原未改写SourceEvidenceLocations，snapshot(Cancel)核snapshotId，只传原span.file给Core.readSource。
不按路径打开文件、不重算SHA或解析HDL。Core读取当前文件一次、返回同份字节的text/contentHash/matchesSnapshot；本层只有matchesSnapshot且hash等于原span.contentHash才应用旧偏移。
成功读但不匹配为changed；NotFound/Unsupported分别为file_not_found/unsupported；原位置无span为location_unavailable，均发布无snippet的状态行并使总partial。
其它Core错误原样返回Error（含取消）。文件改变到很短/空时不对当前text套原offset；匹配快照但使用到的span越界/零宽/UTF8字节边界不合法、端点位于CRLF内部或hash不对应则BadRequest。
原scope非空、query合法、所用ref/kind/file/path/hash及同FileRef的原path/hash一致；检查不认证任意伪造producer。path只显示，不成为读取权限。

文件字典按原FileRef首次使用顺序去重，包括read/not_found/unsupported；read时回显Core contentHash/matchesSnapshot，所有文件保留原path/snapshotHash，无整文件text输出。
只暂存匹配文件的UTF8原文；changed/error文件不保留text。按原位置顺序发布行，保存location与本file索引，available另带本snippet索引；其余无snippet，location_unavailable无file。
默认contextLines2，可0..20；与Core SourcePos相同，CRLF为一个换行，单CR或单LF各为一个换行，混合文本按原顺序处理。
窗口包含与原半开span相交的完整物理行及两侧指定行数，保留原UTF8和全部换行字节；行尾包含其完整换行序列，CRLF不可拆开。
span.end恰在下一行开头时，该下一行不属于零上下文窗口；首尾扩展止于文件边缘，无末尾换行也不补写字节。
窗口startOffset/endOffset半开、startLine从原Core行号及向前跨越的物理换行数导出，不把两字节CRLF计成两行。
片段字典按(file,派生start,end)去重，原span窗口查找也仅本调用缓存；同物理文本可共享，不合并原实例/位置/事实引用。
返回拥有元数据/窗口/text，释放Design/locations或文件继续变化不回改结果；不同文件不是同一时刻的整工程事务，不承诺磁盘读后不变。
每完整location行及新增文件/匹配文本缓存/片段/计数原子发布；失败保留原位置前缀，无孤儿字典或半文本。原partial保持总partial；C08空输入仅新snapshot1/work0，无文件读取/新字典。

默认/上限locations10000/400000、files1000/10000、queries1001/10001、bytes1MiB/16MiB、snippetBytes64KiB/1MiB、cachedBytes8MiB/64MiB、work1000000/10000000、millis60000/60000，除contextLines均至少1。
queries含snapshot和实际readSource（含未发布行），readBytes累计Core成功返回UTF8字节（含未发布项），可大于缓存/输出预算；错误读取字节数不由Core公开，不猜测。
cachedBytes仅已发布匹配文件的临时缓存字节，bytes仅已发布唯一snippet UTF8字节；复用片段不再次占bytes，复用文件不再次占cachedBytes/查询。
work计location、文件与窗口查找、上下文移动字节和首次片段复制字节；缓存命中仍计查找，定界符条件检查不另计，Core内部读/hash工作不冒0成本性能保证。
超出任一输出/cache/work/查询准入只发完整前缀；恰好预算可完整。自身软时间覆盖snapshot/read/扫描/复制，取消/Error无半成功，原输入可复用。
Core仍单次整文件读入，本层最多一个新文件/片段待提交；缓存/输出上限非硬heap/IO/单调用时间或编译取消保证。

--source-evidence-excerpts要求--locate-source-evidence及原全部依赖；--source-excerpt-context-lines与--max-source-excerpt-locations/files/queries/bytes/snippet-bytes/cached-bytes/work/millis只供新模式。
严格rtl-source-evidence-excerpts-v1/formatVersion1保留完整原位置报告在analysis，共用原query/quality及Core读取语义，writer与原29格式共用；旧API/DTO/Schema/默认预算/退出0/partial4/原错误2/3/5/取消保持。
Core/protocol/web/依赖/工程格式/持久化/IPC/GUI/Studio不变，新增静态消费者重建，无新稳定ABI承诺。B55/C212指出固定7e48af81的CR片段不一致（C-S2-10-01）；本节按Core物理换行规则修订，修复待独立复验，关闭权C。7.5.27–28已获有限接受，C08沿C211 closed。

#### 7.5.30 寄存器来源调查入口

investigateRegisterSources(Design,SourceInvestigationRequest,Cancel)同步借用活动Design，请求拥有statistics、scenarios、ranges、query、selection、evidence、locations、excerpts八个原请求/预算段；默认值沿用原类型，调用者必须给显式scope及2..8个具名场景，并启用scenarios.common.resolveLogic。query.scenario必须属于本请求的比较场景，0不可选。
入口先检查取消，然后在任何Design查询前验证全部请求段、嵌套预算和场景索引；坏请求BadRequest，预取消Cancelled，其余阶段Error原样传播。不改变原单阶段验证或其算法。
依次调用registerStatistics、expandRegisterSourceHierarchyRanges、selectRegisterSourceHierarchyRanges、explainRegisterSourceSelection、locateSourceEvidence、readSourceEvidenceExcerpts；每个阶段边界及返回前检查取消。预算partial是正常结果，保留原已发布前缀并继续有界下游，不解释为空域完整。
SourceInvestigation拥有statistics/ranges/selection/evidence/locations/excerpts六个原结果，对应索引指向同一bundle内的原producer，不重新排序/编号/推导；请求、Design释放后仍可读取。出错或取消只返回Error，不发布部分bundle，局部值由RAII清理。最终质量沿excerpts.complete及各原quality，不增加另一套总状态或错误模式。
各原预算分别计量，各阶段软时限从该阶段调用开始，无新全链截止/总work/硬heap保证；整文件读取限制沿7.5.29。一次调用不代表整工程同时刻磁盘事务。
CLI新增--inspect-register-sources，展开统计→范围→证据→片段全链及--logic；显式top/scope/输入/场景仍必需，不生成默认场景。允许与原对应显式开关并用，重复同名开关、互斥单场景模式和错误参数按原invalid_arguments/exit2拒绝；与参数出现顺序无关，但input-value归属仍由前一scenario决定。
快捷模式和原完整片段模式共用新编排，输出原rtl-source-evidence-excerpts-v1，预算/选择选项含义、严格Schema/formatVersion1/原退出码保持。无新JSON封装，较短模式与单阶段API保留；新增静态C++接口需重编，无稳定ABI承诺，Core/协议/UI/工程格式/依赖不变。本入口由A实现及自验，不代B/C独立验收。

### 7.6 SDC所需的RTL对象清单

按7.2/7.4的上层重写顺序，新增独立dft_objects/enumerateObjects与dft-objects CLI，仅通过公开Design API枚举对象。请求显式scope，recursive默认false，kinds默认instance/port/signal全部，text默认空且按原对象name或canonical pathText作区分大小写的字面子串匹配；不解释glob/正则/Tcl/SDC。不解析opaque ID或拼接路径。
CatalogRequest含scope/text、recursive、三种唯一且非空的kinds及limits。scope非空、scope/text各至多4096 UTF8字节，无NUL且仅Unicode标量。参数/枚举/预算先校验；预取消优先Cancelled。scope经resolvePath完整且唯一解析为实例；无匹配NotFound、非实例/歧义BadRequest、不完整Unsupported。原Core错误传播、不返回半成功。
报告拥有原snapshot、canonical scope InstInfo、原request、访问过的instances字典和objects行。每行含kind、owner实例索引和原ObjectInfo；port/signal另含完整原PortInfo/SignalInfo，instance行元数据在instances[owner].info。实例自身与内部端口/信号保留不同Core ref，即使是同一电气网络也不合并；维度、方向、宽度等沿原模型，不展开每bit或推物理pin/net/cell。text/kinds仅过滤objects，不改变范围遍历和instances字典。
先处理scope，自身→原ports顺序→原signals分页顺序，子实例按Core.children顺序广度优先；recursive=false不访问孩子。每访问实例有objectsComplete/childrenComplete，后者仅表示本请求的子层次安排完成，非整个子树已完成。只发布完整对象行，任何预算截断保留已发布前缀及所有索引归属，未访问/未发布不推不存在。相同参数不同pageSize集合/顺序相同，计数可不同。
请求signals时保留每实例signalStatus：普通体沿Core.connectionStatus，partial及原因传至总质量；blackbox/primitive的内部信号未知，由分析层构造partial状态，原因分别使用Core Completeness已有blackbox/unsupported码，总报告原因opaque_instance，不冒称Core返回的状态。未知或原Core partial使objectsComplete=false，不因Core空signals推为完整。仅请求实例/已知端口时允许其已公开骨架完整，仍非黑盒内部证明。类型opaque的原SignalInfo如实保留。完整仅指本次请求公开RTL对象域穷尽，与输入hash完整性、时序/DFT clean分别陈述。
预算默认/上限：maxInstances10000/100000，maxObjects100000/1000000，maxQueries100000/1000000，maxWork1000000/10000000，maxMillis30000/60000，pageSize200/2000。queries最少3，其余最少1。初始snapshot、scope解析、instance共3查询必须建立报告身份；时间从调用开始，三次后核软截止，可返回空instances/objects的partial，不伪造scope。之后每查询前及返回后检查取消/时间；每查询准入、实例访问和候选对象访问各计1work，queries计实际Core调用。候选先取原ObjectInfo和过滤，再检查maxObjects，故正好匹配数量上限可complete。
待访问子实例和已访问实例合计不超过maxInstances；children用剩余容量+1有界探测截断。对象/工作/查询/实例预算或软时间停止后不继续遍历；取消只返回Error。maxObjects不限制Core.ports整向量、Core内部提取/索引或snapshot大小，非硬heap/编译/单调用IO时间保证。返回拥有值在Design释放后有效，无跨调用缓存/持久化。
CLI要求输入、单top、scope；支持--recursive、可重复--kind instance|port|signal、--text、上述六预算开关和--require-complete。成功默认0、partial且require-complete为4；参数2、目标/设计无效3、其它执行5、取消130。独立rtl-object-catalog-v1/formatVersion1严格Schema复用Core公开DTO，原dft-seqcheck30格式不改。没有SDC文件执行/导出、约束lint或Studio/IPC接线；新静态接口需消费者重建。

---

### 7.7 MBIST所需的宏接口调查

独立dft_memory/inspectMacroInterfaces和dft-memory通过公开Design及原对象目录工作。请求显式scope、recursive默认false、1..256个唯一definitionNames（精确defName匹配），0..32个唯一clockPins（精确PortInfo.name匹配），均非空、Unicode标量UTF8、无NUL、每项至多4096字节。选择是调用者声明的候选宏，不证明它是RAM、容量/端口角色或已映射技术库；不默认把所有blackbox认作存储器。
先预取消及全部请求验证，再以原对象目录instance-only、空text枚举范围。返回拥有原ObjectCatalog作为catalog，保留其partial/快照和scope；宏顺序沿catalog.instances访问顺序，definitionNames不改变遍历。每宏引用catalog实例索引，持有原父InstInfo/父connectionStatus（真实顶层省略）、原PortInfo/ObjectInfo和属于该实例该port的原PinBinding，绑定顺序沿父LocalNetlist。身份匹配使用PinBinding.inst及PinBinding.pin，port仅为原引脚名称。不解析引用、拼路径或按同名端口跨实例连接；scope为子树时父层仍可位于scope外。
每指定clockPins名称在每选中宏中要求存在；缺失时发布missingClockPins并使总质量partial。每匹配引脚以整个端口的原平坦位空间作back/structural cone，非顶层side=outside，真实顶层side=inside。返回原QueryResult<TraceResult>，不猜端口方向或折叠表达式；Core partial/frontier/conservative和process/register/其他未知终端保留，并将总质量标partial。const/unconnected是原结构证据，不据此自动发违规；完成只说明该请求结构接口证据穷尽，非物理时钟/测试可控性结论。
详情默认预算：maxMacros1000、maxPins10000、maxBindings20000、maxQueries100000、maxWork1000000、maxMillis30000、maxTraceNodes10000、maxTraceEdges40000、maxDepth64；上限依次10000/100000/1000000/1000000/10000000/60000/1000000/4000000/1024，均至少1。目录使用原CatalogLimits，详情软时间从目录完成后开始；无全链硬deadline。每目录实例检查、查询、端口、父binding扫描、选中binding的每segment、clock名称存在性检查和trace节点/边检查各计work；详情queries单计实际Core调用，不含catalog查询。每cone最多1000nodes/4000edges/100ms并受剩余累计nodes/edges/软时间限制，累计计实际返回的节点/边，前沿仍保留。
整宏完整生成后才原子发布；宏/引脚/绑定上限按已发布+本宏暂存计，截断丢弃未完成宏但保留之前完整宏和已用query/work/trace计数。恰好宏数上限只有发现下一匹配实例才截断。父bindings/ports整向量、snapshot/ancestors/Core内部提取不受硬heap限制。父质量partial、缺失child绑定、原binding.unresolved/unknown target、时钟追踪边界各明确partial，未访问不推不存在。真实顶层无父绑定是合法边界。取消只返回Cancelled、原Core错误传播，无半报告；返回无Design借用或跨调用缓存。
CLI输入沿-f/-F/-I/-D、单top/显式scope，重复--definition/--clock-pin是列表，重复名称拒绝；--recursive、目录与详情预算及--require-complete显式。独立rtl-macro-interfaces-v1/formatVersion1严格Schema引用原目录及Core DTO。wire的request保存definitionNames/clockPins/详情limits，scope/recursive/遍历limits保留在catalog.request。默认成功0、partial+require-complete为4、坏参数2、目标/设计无效3、执行失败5、取消130。旧对象/seq格式与Core/协议/Studio不变，新静态消费者重编；不执行MBIST规划、TCD映射、SDC或持久化。

### 7.8 显式存储器模型与RTL接口映射

mapMemories借用同一次未改写MacroInterfaces，仅映射、不查询Design；结果拥有请求、快照ID、行/诊断，索引配原输入解释。先取消，再预验证请求与输入归属形状（不认证伪造事实），最多10000宏/100000引脚；取消/错误仅Error。scope/原partial/绑定和可选clock原证据由CLI完整封装interfaces，映射总complete与原interfaces.complete合取。
原Core端口显示名允许为空，多个匿名端口靠各自非空唯一ref和一致owner区分；非空名字仍须合法且在同宏中唯一。匿名端口不参与模型名称查找，不按位置猜名，每个匿名原pin按原顺序产生unmapped_pin（pin保持空串），未找到的模型角色照常pin_missing；保留其它行/原partial，不能把合法匿名producer归BadRequest。伪造/重复ref、不一致owner或异常重复非空名仍拒绝。
请求含1..256个唯一definitionName模型，按精确defName匹配；words为2..2^32、dataBits为1..65536、maskLaneBits为1..dataBits且整除dataBits（默认1）。这些是调用者声明，不推导RAM容量或行为。当前仅独立数据输入/输出的单读写接口；每模型4..8个RoleBinding，role与pin各唯一，必需address/data_in/data_out/clock，可选chip_enable/write_enable/output_enable/write_mask。name为非空Unicode标量UTF8、无NUL、至多4096字节。sense：clock只能posedge/negedge，三个enable及write_mask只能high/low，address/data_in/data_out只能none；非法枚举/重复/不完整模型先BadRequest。
address须input且width=ceil(log2(words))，data_in为input/data_out为output且width=dataBits，clock和enable为scalar input，write_mask为input且width=dataBits/maskLaneBits。方向沿Core in/out，不修改未知方向、不会把库角色写回Core。每发布宏按原顺序匹配模型，逐角色给原pin下标/compatible，缺pin不伪造下标；每个未声明的RTL pin给unmapped_pin。问题码pin_missing/pin_width/pin_direction/unmapped_pin/model_missing保留role/pin及expected/actual文本。行status为matched/mismatch/unmapped；仅全部角色兼容、无额外pin时matched。父绑定/时钟partial与局部接口匹配分开，局部matched不能擦除总partial；无模型实例明确unmapped。
每行引用原macro下标与可选model下标，模型序/角色序原样保留，按完整pin名称匹配；实例共享定义仍分别计数。matchedInstances和matchedCapacityBits仅累加已发布matched行的声明words*dataBits，按实例计量，不是硅实现容量证明。每模型乘积≤2^48、最多10000输入宏，uint64可容纳汇总；安全整数JSON按既有writer约定可为十进制字符串。
MappingLimits默认maxMacros1000/maxWork1000000/maxMillis1000，上限10000/10000000/60000，均至少1。请求/输入形状预验证有上述独立上限，不计work；软时间从验证后开始。每输入宏、pin索引建立、角色匹配、额外pin检查各计1work；完整宏行生成后原子发布并累加摘要，预算不足丢本行，保留已发布前缀/已消耗work/visitedMacros。恰好行数上限且无更多宏可complete，确定性测试截止沿同一生产路径；无跨调用缓存/持久化、硬heap或全链时限承诺。
CLI新增重复--model DEF WORDS BITS、--role DEF ROLE PIN SENSE，及--mask-lane DEF BITS、--map-max-macros/work/millis。模型/角色可任意顺序，未定义DEF、重复角色/pin/lane/模型拒绝；模型出现启用rtl-memory-map-v1/formatVersion1独立严格Schema，定义列表从模型建立，禁止混用--definition避免两套范围。--clock-pin仍是显式独立结构调查请求，模型clock角色不自动声明所有同名引脚都是时钟，不隐式启动trace。无--model时原宏模式/版本/退出语义保持，新参数孤立使用拒绝。原宏与映射全部请求在打开设计前校验，输入-f/-F/-I/-D/scope/recursive及原预算不变；映射partial+require-complete为4，默认0，参数2/目标3/执行5/取消130。新格式封装原interfaces及mapping，不替换原格式、原32 Schema不变；无TCD解析/MBIST控制器规划/Studio或工程格式变化。

## 8. 目录结构

```
dft_hierachy/
  docs/DESIGN.md
  ref/                       参考仓库（只读）
  core/                      C++
    CMakeLists.txt
    third_party/             Slang（锁定版本，源码构建）
    model/                   L0
    frontend/                L1（唯一链接 slang）
    db/                      L2
    query/                   L3，公开头文件在 include/hier/
    protocol/                L4
    app/                     hier 命令行
    tests/
      fixtures/              小型 HDL 样例和期望结果
      unit/  integration/
  web/                       TypeScript
    packages/
      protocol-types/        协议类型，由 core 的定义生成或手写后做一致性测试
      client/                L5
      viewmodel/             L6
      views/                 L7
    apps/demo/               演示壳（Electron）
    tests/e2e/
```

---

## 9. 验证

### 9.1 动手前要先验证的技术假设

这些假设影响设计是否成立，实现的第一步就是逐个做小实验确认，结果回写本文档。

| 编号 | 假设 | 不成立时的退路 |
|---|---|---|
| V1 | 快速路径的共享判断是正确的：在测试设计上，被判为可共享的实例，各自提取出的事实逐字节相同 | 改用兜底路径：逐实例提取、按内容去重（4.1） |
| V2 | 每个连续赋值和过程块的读写位段可以直接取自 Slang 12 分析模块（`AnalysisManager`）的结果；前端自己只需补四项：网线初始值驱动、逐位对应与角色、端口连接表达式的读、经规范模块体查询（M0 前的原方案是自己遍历语法树，已放弃：v12 里 `LSPUtilities` 已不存在，对应的是 `ast::ValuePath`） | 四项中某一项做不到精确时，该处的依赖标为 `conservative` 或结果标为 `partial`，不得静默产出不完整的事实；整体不可行时参照 slang-netlist 的数据流分析 |
| V3 | 10 万实例规模下，骨架索引的耗时和内存可接受；连接级事实在给定字节预算下可以靠淘汰和重提取运转 | 索引只建到模块体级，按实例的搜索改为按需遍历；调低预算或限制单次追踪规模 |
| V4 | 跨模块体的层次引用（`a.b.c = ...`）可以先识别并标注为不完整 | 同左，第一版不解析其连接 |
| V5 | 4.4 的精度规则在每一类运算上不比旧 wrapper 实现粗（实验方法见下） | 对落后的那几类运算补上精确规则 |
| V6 | Slang 对 unpacked 数组和结构给出的位置编号可以作为统一的位空间；符号扩展、反向范围、四态常量在位映射中不丢信息 | unpacked 类型退为 `opaque`，只做整体依赖 |
| V7 | 能从 Slang 取到编译实际读入的全部文件名单，用于 `inputHash` | 哈希只覆盖 filelist 列出的文件和显式选项，并把 `inputHashComplete` 置为 `false`，适用 4.8 的三条限制 |
| V8 | 单个模块体的提取和 Slang 的单次展开，最长不可中断时间在可接受范围内（在 openc910 上测量） | 把大模块体的提取拆成多个检查点；仍不够时以重启进程作为硬取消 |

V2 用 `ref/slang-netlist` 的测试用例做对照。

**M0 的结论（2026-10-06，详见 [M0_RESULTS.md](M0_RESULTS.md)）：**

| 编号 | 结论 |
|---|---|
| V1 | 成立。条件已从 Slang v12.0 源码写出；三个设计差分零不一致；对抗样例证实必须排除向上引用 |
| V2 | **方案已选定并部分验证。** 已验证：Slang 给出的读写位段在 `bits.sv` 上逐项正确；分析在 openc910 上耗时 0.18 秒。**尚未验证**：前端自己补的四项，以及 5.4 规定的三类事实检查（适用范围内的 Slang 本地读写集合对照、自有逻辑检查、层次引用跳过与本地自检）。它们要有实现才能检验，对应的失败测试是进入 M2 连接提取之前的门槛（见第 10 节） |
| V3 | 成立，前提是按折叠方式遍历。openc910：15848 个实例、503 个模块体、展开 0.16 秒、425 MB |
| V4 | 成立。跨模块体的读和写都能识别 |
| V5 | 成立。19 类运算中 15 类与旧实现一致，4 类更细，没有更粗的 |
| V6 | 成立。Slang 对定长类型给出统一的位置编号，含 unpacked 数组和结构 |
| V7 | 成立。包含嵌套 include 和经库目录找到的文件 |
| V8 | 可接受。最长不可中断调用是完整展开：openc910 上 0.16 秒，最坏情况 1.2 秒 |

**V5 的实验方法。** M0 阶段新内核还没有实现，所以 M0 能做的是拿 4.4 的规则表与旧实现的实际行为比较；实现之后的比较放到后面。

| 项 | 定义 |
|---|---|
| 基准 | 旧工程 `hdl-core/service/DesignDb.cpp` 的 wrapper 逐位依赖实现（`depOf`、`srcOf`、`readBitsOf`）。以当前工作区的文件为准，SHA-256 前 16 位为 `7c34244e5911466e`；旧仓库有未提交修改，所以用文件哈希而不是提交号锁定 |
| 输入 | 一组新写的小模块，4.4 规则表的每一行至少一个：一个输出由一个该类运算驱动，输入输出都接到顶层端口。放在新工程的 `core/tests/fixtures/precision/` |
| 旧实现的结果 | 运行旧 `hdl` 的 `wrapper-cone`，取每个输出位追溯到的输入位集合。旧后端从只读的旧源码构建，构建目录在新工程的 `core/build/old-dft-core`，旧工程目录不产生文件。本机构建需要强制包含 `core/experiments/oracle/tcl85_shim.h`（旧源码用到 Tcl 8.6 的一个函数，系统自带的是 8.5） |
| 真实依赖 | 每个样例手写"每个输出位真正依赖的输入位集合" |
| 判定 | 对每个输出位，设规则表给出的集合为 N、旧实现给出的为 O、真实依赖为 T。要求 T ⊆ N（不漏）且 N ⊆ O（不比旧的粗）。按集合包含判定，没有"允许多少误报"的数值上限 |
| 旧实现不支持的运算 | 旧实现报错或给出空集合时，该行记为"无基准"，只要求 T ⊆ N |

实验分三步：

- **M0（已完成）**：规则表对旧实现。19 个样例，结果已回写 4.4，逐行输出在 `M0_RESULTS.md` 2.5。用 `core/experiments/run_m0.sh` 的第三个参数可以重跑。
- **M2**：新实现对同一组样例，要求输出等于规则表。
- **集成阶段 2**：wrapper 在新接口上重写后，在 `processor_core` 和 `openc910` 上比较新旧的最终分类结果，差异逐条解释。


### 9.2 测试分层

| 层次 | 方法 |
|---|---|
| 模型与提取 | 小型 HDL 样例，期望结果手写，不由被测代码生成。先覆盖 R1–R3、S1–S7 |
| 查询 | 命令行输出与期望结果比对；**随机顺序等价性**：同一组查询以不同顺序执行，结果逐字节相同 |
| 协议与客户端 | 用假传输注入乱序、延迟、过期快照、取消 |
| 视图模型 | 无界面测试：展开折叠序列、图投影前后连接一致 |
| 端到端 | 演示壳上的 Playwright 测试 |
| 实际设计 | `nx9000/processor_core`（24 个定义、324 个层次节点）做日常回归；`openc910`（526 个 RTL 文件、约 41.8 万行，filelist 为 `design/filelists/C910_asic_rtl.fl`）做中等规模回归 |
| 性能 | 合成 1 万、10 万实例的设计，记录打开、索引、分页、搜索、布局的耗时和内存 |

缺二进制或缺依赖时测试必须失败，不能跳过（对应 A24）。

真实设计的规模上限在 M0–M6 期间由 openc910 代表（旧文档记录约 1.7 万实例）；10 万实例一档用合成设计覆盖。大规模真实设计的回归放在 M7，候选是香山；它没有现成的 Verilog，需要用 Chisel 工具链生成，届时再决定在哪台机器上生成。

---

## 10. 实施顺序

每个里程碑结束时都有可运行、可验证的东西。

| 里程碑 | 内容 | 完成标准 |
|---|---|---|
| M0（已完成） | 工程骨架、构建、分层检查、V1–V8 验证实验 | 八项假设都有结论（成立，或已切换到退路）并回写本文档 |
| M1（已完成） | 模型、骨架提取、实例树、`hier` 命令行的导航和详情命令 | A04、A07、A08 的样例通过 |
| M2（已完成，产品快照 `d98a124`） | 连接提取、`bindings`、`drivers`、`loads`、时序单元。**进入门槛**：先写好下面四组样例和不变量测试并让它们以失败状态存在，再开始写连接提取 | A01–A03、A05、A06、A11 通过；四组样例和不变量测试通过；B/C 最终验收见 REVIEW_LOG 2026-10-11 条目 |
| M3（契约草案见 5.5，待冻结） | 追踪、搜索、路径解析、源码定位、表达式结构及延后的 def.instances | 先由 B 冻结独立测试、C 评审契约，再提交实现；A12、A13、A16 及随机顺序等价性通过 |
| M4 | 协议、TS 客户端 | A14、A15、A23 的协议层部分通过 |
| M5 | 树、属性、源码视图、演示壳 | 在 `processor_core` 上完成浏览、搜索、定位 |
| M6 | 图会话、布局、原理图视图、标注层 | A17、A18、A19 通过 |
| M7 | 性能测量、实际设计回归；确定资源预算 | A22 的数据记录在案；三项预算有数值并有超限行为 |

---

**M1 的交付（2026-10-06）。**

| 层 | 内容 |
|---|---|
| L0 | `OpenOptions`、骨架事实（端口、参数、作用域、子实例位置）、实例键与引用、`Result` 和分页 |
| L1 | 编译并完整展开；按固定顺序给模块体编号；提取骨架；诊断 |
| L2 | 骨架缓存；把实例键解析到模块体 |
| L3 | `snapshot`、`diagnostics`、`roots`、`instance`、`children`、`ancestors`、`definitions`、`ports`、`params` |
| L4 | JSON 输出；命令行 `info`、`diags`、`roots`、`inst`、`children`、`ancestors`、`ports`、`params`、`defs`、`verify-sharing` |

测试：`core/tests/unit/NavTest.cpp`，12 组、1230 条断言，期望值全部按源码手写。除 A04、A07、A08 外还包括：分页不漏不重、游标不能跨查询使用、错误引用的报错、**共享与逐实例两种方式对每个实例的每项查询结果相同**、**打乱查询顺序结果不变**。做过一次反向验证：把"参数是否被覆盖"放回共享的模块体事实里，A07 和共享等价两组测试都报错。

在真实设计上：`verify-sharing` 对 `processor_core`（324 个实例，17 个共享模块体）和 `openc910`（15848 个实例，503 个共享模块体）都是零差异。`processor_core` 的 324 与旧工具报告的层次节点数一致。openc910 打开加查询约 0.4 秒，内存约 430 MB。

M1 实现时定下、评审时没有写明的三处：

1. **实例数组的顺序**改为按下标升序（见 4.2）。
2. **缺少 timescale 的设计元素**默认按 `1ns/1ns` 处理。`processor_core` 混用了有和没有 timescale 的文件，不给默认值会有 23 个错误。这是打开选项，可以改或关掉。
3. **"参数是否被覆盖"是实例的属性，不是模块体的属性。** 两个实例参数值相同就共享模块体，但其中一个可能显式写了覆盖。这个标记记在父模块的子实例位置上，查询时再合并进参数列表。

推迟的一项：`def.instances`（列出某个定义的全部实例）没有在 M1 做，它需要全设计的反向索引，与搜索一起放在 M3。

**M2 的进入门槛（V2 的未验证部分）。** Slang 不提供、由前端自己实现的四项，各有一组样例，预期结果手写：

| 项 | 样例必须覆盖 |
|---|---|
| 网线声明初始值作为驱动 | `wire x = a & b;`；带位段的初始值；同一网线另有 `assign` 时是两个驱动 |
| 逐位对应与角色 | 4.4 规则表每一行；左侧拼接；条件为 `control`、数据为 `data`；过程块里嵌套的 if 和 case |
| 端口连接表达式的读 | 直接连接、位段、拼接、常量、表达式、悬空；输入和输出两个方向 |
| 经规范模块体查询 | 同一模块多次实例化，对非规范实例的查询结果与规范实例一致；有层次引用的实例不共享 |

A09/A10 的 M2 专项按 5.4 的支持矩阵冻结：覆盖可解析复合端口的逐片段映射和跨层查询、整体 unresolved、未知宽度 blackbox；片段级 unresolved 是预留能力，不要求编译错误样例或未定义的合法输入来触发。

事实检查的适用范围和计数统一采用 **5.4 的三类规则**，同时用于测试断言和运行时检查：

- 测试在全部样例和两个回归设计上覆盖每个驱动源。适用 Slang 对照的连续赋值和过程块，以独立源码访问集合对照 Slang，并分别检查完整写目标与输出依赖投影；`init`、`port_expr` 做自有逻辑检查并由手写 KAT 核对；含 `externalRefs` 的源按 5.4 跳过 Slang 等值比较，核对 `skippedExternal`、本地自检和 `partial/hier_ref`。任何适用检查失败都使测试失败，不能把跳过计作对照成功。
- 运行时，**源码访问对照、独立写目标或输出依赖投影检查任一不符**，都丢弃该驱动源原有的本地 `Write`/`Dep`，以 Slang 报告的完整本地写集合重新生成互不重叠的目标位段：每个 Slang 写位依赖全部本地 Slang 读位，依赖用 `align: all`、`precision: conservative`，另保留独立提取的 `clock/async` 事件依赖，并记录哪类集合不符的诊断。写集合漏位时必须补回这些目标；只给已有的 `Write.target` 增加依赖不算有效退路。
- Slang 集合无法安全映射或无法完整重建时，不发布该驱动源的连接事实，记录诊断及事实缺失标记，让 `proc.get` 和受影响的 `drivers`、`loads`、`step`、`trace.*` 返回 `partial`，原因 `unsupported`。如果不能准确限定受影响对象，则对该模块体的连接查询整体标为 `partial`，不得把省略的源解释为"没有驱动/负载"。`init`、`port_expr` 和含层次引用源的本地自检失败时，也采用这一退路，因为它们没有可用的完整 Slang 对照结果。
- `verify-facts` 和测试保留**退回前**的失败状态与 `mismatched` 计数；即使运行时成功生成保守事实，命令仍非零退出。运行时退路保证查询的安全性，不替代实现通过不变量检查的验收要求。

**资源预算（M7）。** M0 的性能数字只在一台 24 GB 的 Apple M4 Pro 上测过，说明样例能跑，不是对其他环境的保证。用户已确认首版目标机器、十万实例规模和三项触发阈值；默认值、配置覆盖、超限行为与采样/调度边界统一见 §5.6.5。实际测量和独立验收分别记录，不把有限样本写成全平台性能保证。

---

## 11. 已确认的决定（2026-10-06）

1. 一个进程对应一个快照，重新加载即重启进程。
2. 树用自有模型加轻量虚拟化库；图用自有 SVG 渲染加 elkjs。
3. Slang 不与旧工程锁定版本，使用较新的发布版本并从源码构建。
4. C++ 命名空间和命令行叫 `hier`，库叫 `libhiercore`。
5. 不提供取 Slang 符号的过渡通道；旧分析在新接口上重写。
6. 中等规模回归用 `openc910`，更大规模用合成设计；大规模真实设计（香山）推到 M7 再处理。

### 7.9 显式黑盒引脚库接入（S2 memory library）

分析层 `PinLibrary::create(LibraryDeclaration, Cancel)` 构建拥有独立数据的不可变 `LibraryProvider`；声明含非空 `source` 标签和按定义名排序的 `map<string, CellInfo>`。仅使用 4.8 的公开 open.library，在 `Design::open` 前安装，不修改打开后的 snapshot，也不从 7.8 模型推导方向/位宽。`cell()` 按完整定义名返回拥有副本，未知定义返回空；`declaration()` 是 provider 生命周期内的 const 借用，包含规范化后的有效输入。

输入界限：1..256 cells，每 cell 1..256 pins，总 pins ≤16384；每 pin 必须声明 width 1..65536，direction 为 in/out/inout/ref/unknown，pin 名唯一且保留声明顺序（位置连接有语义）。source/定义/pin/attrs 字符串均为无 NUL 的 UTF-8 scalar，source/名称 ≤4096 bytes 且非空；每 cell/pin attrs ≤32 个，key 非空 ≤256 bytes、value 可空 ≤4096 bytes；全部字符串累计 ≤8 MiB。保留 opaque attrs；输入 cell attrs 不得占用 `dft.library.source`，构造时在每 cell 加入该键值=source（输出允许第33个 attrs）。非法输入 BadRequest，预取消优先 Cancelled，循环检查取消，不发布半成品。不另设软预算/partial provider；这些是输入形状上限，不是编译内存/时限承诺。

CLI `dft-memory --library-source LABEL --library-pin DEF PIN DIR WIDTH ...` 两者必须共同出现，source 只允许一次，pin 重复报错；同 cell 的参数出现顺序保留，定义按名称排序。DIR 严格接受上述五值，整数十进制。库校验在打开设计前；其余模型/调查参数和 exit 规则不变。该版本 CLI 不提供 attrs 输入；C++ API 可提供 opaque attrs。LABEL 是调用者来源标识，程序不读取/认证该标签指向的库文件；这不是 TCD/Liberty parser。

指定库时输出新 `rtl-library-memory-v1` formatVersion1：`library:{source,cells:[{definitionName,cell:{pins:[{name,direction,width,attrs}],attrs}}]}` 为完整有效输入，`analysis` 嵌套原 7.7 宏或 7.8 映射报告，不修改其中原事实、索引、partial 和快照。独立严格 `library-memory.schema.json` 引用既有 Schema；错误沿原 envelope，旧未指定库模式/版本输出保持。外部调用者将报告与其原输入一起解释；这里不声称所有提供 cell 都被使用或匹配。

Core 只对其实际查询 cell（含缺失）冻结并计入 inputHash；有效声明中的 source opaque attr 因而随被使用 cell 进入 hash，修改使用中方向/宽度/来源需要重新打开设计。未使用声明不保证改变 inputHash，完整输入仍保留在 wrapper。任何 provider 仍令 inputHashComplete=false，不据此认证完整工程身份或跨进程缓存。普通有 RTL 定义的 module 保持其真实端口，不被声明覆盖；未知/缺失库 pin、未映射 pin、错方向/位宽仍由原事实和 7.8 映射显式报告。库与模型相符只证明调用者结构声明兼容，不能证明物理存储、库真实性、时钟波形或 MBIST 可测性。


### 7.10 完整内存接口调查入口与错误分类

`investigateMemories(Design&, MemoryInvestigationRequest, Cancel)`同步借用调用者已打开的Design。请求含scope、recursive（默认false）、clockPins、CatalogLimits traversal、MacroLimits interfaces和MemoryMapRequest mapping；宏候选definitionNames只由映射模型按原顺序生成，不提供第二份候选列表。结果MemoryInvestigation拥有原MacroInterfaces interfaces及MemoryMap mapping，原macro/pin/model索引只在同一bundle内解释；释放请求和Design后仍有效。最终完整性读mapping.complete，保留两阶段各自reasons/预算和原partial，不新增另一个总状态。

执行先预取消，再验证全部模型、宏/目录参数，才调用inspectMacroInterfaces；其partial继续mapMemories，阶段间与返回前检查取消。取消或任一错误只返回原Error，无半bundle/跨调用缓存。复用原阶段生产实现，不复制查询/映射规则；原阶段各自软预算/时限独立，非全链deadline。库声明由调用者在Design.open时安装，本入口不打开设计、不修改library/快照。原直接inspectMacroInterfaces/mapMemories API保持。

CLI原--model模式改用同一入口和预验证，输出仍是7.8原格式；显式library仍使用7.9原wrapper。无模型模式不变，不新增开关/JSON字段/Schema。静态消费者重建，无Core/IPC/GUI/工程文件或依赖变化。

7.7–7.10统一明确现有错误翻译：CLI选项/模型/库/查询参数校验，或Design::open返回BadRequest（含无法处理缺失的显式source/-f/-F输入）为invalid_arguments/exit2；这不表示已打开一个编译错误的设计。成功open后diagnostics.errorCount>0或无roots为design_invalid/exit3，合法请求的scope/object NotFound为not_found/exit3。其它执行错误5、取消130、成功partial+require-complete4、成功默认0。保持Core错误码原样翻译，不通过消息substring猜错误类型或另造文件系统检查；本澄清不改变旧退出行为，B-S2-57-01冻结expect3由B据正式契约自行决定，不代改oracle。

### 7.11 显式约束的内存测试规划

按7.2/7.4继续上层MBIST消费者，新增`planMemoryTests(Design&,MemoryTestRequest,Cancel)`。request包含7.10 investigation与planning；先预取消，再验证所有阶段参数，之后查询并规划。返回拥有investigation、原planning request及plan，不接受调用者拼装的mapping作为事实。只处理该次mapping已发布前缀；每条plan memory引用mapping.memories索引，原宏/模型/快照/绑定/clock cone保留。原API、格式和34Schema不变，新增静态消费者重编。

planning.profiles恰好覆盖每个模型（1..256），以唯一definitionName关联；operationsPerWord为1..1024，powerMicrowatts为1..10^12整数。它们是调用者的测试成本声明，不是从RTL或厂商算法推导。planning.assignments为0..10000个唯一instancePath的{instancePath,clockDomain,partition}；路径精确匹配Core InstInfo.pathText，不解析/拼接opaque ID，不解释glob。domain非空，partition可空；相同domain仅表示调用者声明可共用测试时钟域，不由cone证明，也不检查物理等价。所有名字有效UTF8、无NUL、最长4096字节（名字非空，partition例外），planning字符串总量≤16MiB；重复/孤立profile或非法policy/limits均BadRequest，必须在查询前报告。

policy默认maxMemoriesPerController=64（1..1024）、maxParallelMemories=4（1..1024）、maxPowerMicrowatts=500000（1..10^12）。只有matched接口且有assignment、单宏声明功耗≤步骤上限可调度；其余按此优先级记录interface_unmatched、domain_missing或power_exceeded，complete=false。即使mapping因目录/时钟边界partial，已观察matched宏也可生成**条件计划**，整体继承mapping_partial，绝不宣称全工程完整或MBIST可测。不存在任何候选且没有unused assignment可为完整空计划。

按mapping原顺序处理，兼容键为精确model索引+domain+partition，绝不仅凭容量合并模型。每键填当前控制器到maxMemoriesPerController后新建，控制器按首次出现顺序编号，reason为compatibility_group或controller_capacity。各控制器只向末尾步骤next-fit添加；达到并行数或加入后超过功耗上限时新建步骤，记录parallel_limit/power_limit（可同时），首步initial。步骤memories引用plan.memories索引；controller通过steps拥有成员，无另造重复权威成员表。step.cycles=words*operationsPerWord（同控制器同model/profile）；step.powerMicrowatts为并行宏声明和；controller.cycles为顺序步骤之和，peakPowerMicrowatts为最大步骤功耗。不同域周期不可直接相加，因此无全局cycles/runtime/peakPower或跨控制器并行假设。原matched容量不当成功调度容量；计划只汇总scheduledInstances、scheduledCapacityBits。

planning.limits默认maxControllers=1000（1..10000）、maxWork=100000（1..10^7）、maxMillis=1000（1..60000）。这些是调查结束后开始的独立软规划预算；每尝试一个mapping row花1work/visitedMemories，整行（含控制器/步骤更新）原子提交。必要新控制器超限、work耗尽或deadline到达时返回已发布前缀并标budget_controllers/work/time；exact cap且无后续工作不因数量本身判partial。结束时unusedAssignments列出未与**已发布行**关联的原assignment索引（可能是不在范围、上游截断或规划截断，不谎称实例不存在），非空加unused_assignments。validation/索引建立/最终unused扫描有输入上限与取消检查，但不计row work；非硬heap、编译/全链deadline。取消/Core错误无半bundle，错误分类沿7.10。整数界限保证controller.cycles≤2^52，累计容量沿既有JsonWriter大整数编码，单宏超过功耗是可报告阻碍而非静默超预算。

CLI显式`--plan-tests`启用新`rtl-memory-test-plan-v1`/formatVersion1；必须有--model，重复`--test-profile DEF OPERATIONS_PER_WORD POWER_MICROWATTS`与`--test-instance EXACT_PATH DOMAIN PARTITION`输入声明（空partition传空参数）。policy为`--test-max-controller-memories`、`--test-max-parallel`、`--test-max-power`，预算`--test-max-controllers/work/millis`。任何test参数无--plan-tests拒绝；所有参数先于Design.open校验。新格式{formatVersion,algorithm,investigation:原rtl-memory-map-v1,plan,library?}，显式library时保存原有效声明，旧rtl-library-memory-v1不扩联合。默认partial退出0，--require-complete时4，其余沿7.10；原--version保持。新Schema严格且离线引用原映射与库声明，不改变旧格式。此单元不含TCD/Liberty导入、自动时钟根分域、DEF/UPF、频率/物理功耗、实际MBIST算法/RTL生成、界面或持久化。

### 7.12 可复用内存库文件输入

新增独立边界库dft_memory_input，公开`parseMemoryLibrary(std::string_view,Cancel)`和`loadMemoryLibrary(const std::filesystem::path&,Cancel)`，结果MemoryLibraryInput拥有models、testProfiles和可选不可变PinLibrary共享所有权。借用输入仅在调用期间；调用者用library设置OpenOptions.library，再把models交映射、testProfiles交规划。加载只解释显式声明，不打开RTL、不猜类型/几何、不修改现存Design，不读include/其它文件。它是分析输入库，不是会话/工程持久化或TCD/Liberty格式。

JSON顶层严格为`{formatVersion:1,kind:"memory-library",models:[...],library?:...,testProfiles?:[...]}`。models为7.8模型数组（definitionName/words/dataBits/roles必填，maskLaneBits省略为1）；role/pin/sense全必填。library结构与7.9声明相同：source、cells[{definitionName,cell:{pins:[{name,direction,width,attrs?}],attrs?}}]，attrs省略为空，方向严格五值，cell attrs仍禁止dft.library.source输入，由PinLibrary唯一添加。model与library无隐式派生，不要求相同定义集合；库可能含未使用cell，模型可能有真实RTL定义。testProfiles省略或[]表示无测试成本；非空则必须恰好覆盖每个模型，成本/名字界限沿7.11；它们不自动启用规划。库、模型与profile的既有验证器是领域规则唯一实现，失败不返回半结果。

输入UTF8、≤1048576字节，顶层object；未知字段/重复字段（含转义后同名）、尾随内容、注释、非法UTF8/surrogate、深度超过现有128容器限制、非法数字语法拒绝。数值以精确十进制规则解释，接受1.0/1e0等数学整数，拒绝带小数残余、布尔/字符串代整数及超范围，禁止浮点舍入。所有字段类型/数组上限先检查后构造；现有模型/库的数量/字节/角色/宽度界限仍适用，文件1MiB可能先于更大领域字符串上限触发。独立`analysis/memory/input/memory-library.schema.json`描述输入形状、范围和未知字段拒绝；名字唯一、角色集合、字节总量等关系由既有领域验证器负责，不能把JSON Schema单独通过当语义接受。

复用L4现有严格decoder：公共`hier/protocol/JsonDecode.h`提供拥有JsonValue/JsonNumber（保留原数值token）、JsonDecodeFault/Result与decodeJsonObject；原private session名称为同一类型别名，decodeFrame执行语义保持，所有L4静态消费者重编，无ABI兼容承诺。jsonSafeInteger复用原精确整数规则，对手工构造的JsonNumber也先验证单个number token语法；只返回±(2^53−1)内精确整数。公共decoder不带IO/领域规则/取消，也不替调用者限制字节数；文件入口在调用前限1MiB、检查预取消，解码后及构造循环再检查取消，不承诺解码中即时取消。不得公开private session状态机或添加Slang依赖。

load仅允许当前检查为普通文件的路径（符号链接指向普通文件允许），binary按64KiB块读取、每块检查取消，读取过程中增长越界也拒绝，不一次按宣称文件长度分配。路径空/NUL、非普通文件、缺失/无法打开/读取或超限为BadRequest；非文件系统事务，非目录/FIFO/设备流接口。JSON解码错误含类别与byte offset，语义错误保留明确错误说明；预取消优先Cancelled，失败无半provider/模型集合。

CLI新增单次`--memory-library FILE`，只替代静态models/library/testProfiles。禁止与--definition、--model/--role/--mask-lane、--library-source/--library-pin、--test-profile混用（无隐式覆盖或合并）；允许原调查/映射预算、clock-pin、--test-instance、policy/规划预算及--plan-tests。无--plan-tests时testProfiles仅为可用声明、不运行规划；有--plan-tests但文件无完整profiles时原规划验证拒绝。全部文件/请求验证先于Design.open。输出仍是原映射、可选库wrapper或计划格式，保存所有实际使用的声明；文件路径/字节哈希不新增到Core snapshot，不自动重读/热更新。library.source仍是显式标签而非认证，inputHashComplete与Core实际查询库hash规则保持。旧无文件命令/--version/错误分类均保持；新输入Schema不加入输出格式联合，UI/IPC/工程格式/依赖不变。

### 7.13 内存测试域与分区的层级分配规则

新增分析API `planMemoryTestsByRules(Design&,MemoryTestRuleRequest,Cancel)`；request含原MemoryTestRequest test和rules，test.planning.assignments必须为空，profiles/policy/limits及investigation全部沿7.11。先预取消、验证全部请求/规则，再调用原investigateMemories一次，按其已发布mapping行展开分配，调用同一内部planner；不重复调查、不修改Core事实，不提供外部拼造mapping入口。返回拥有MemoryTestRulePlan及原MemoryTestReport report，释放Design/输入后有效。

每条MemoryTestRule含path（Core InstInfo.path原始未转义段数组）、recursive、clockDomain、partition。1..1024规则，每path为1..256非空段；所有段/domain非空、partition可空，UTF8 scalar无NUL、每字符串≤4096bytes，规则字符串总量≤16MiB。相同(path,recursive)重复为BadRequest，即使域相同；同path允许一条exact和一条recursive。无glob/文本路径解析、ref拼接或大小写折叠；数组索引与含点/斜线/空格的escaped名称均作为一个原始段。API/文件都要求明确recursive和域/分区。

规则匹配真实InstInfo.path：recursive规则匹配自身及其完整段前缀的后代，exact规则仅匹配全路径；较深路径胜出，同深度同路径exact胜出，不依赖规则顺序。用段trie单次沿路径查找，最多到规则最大深度，不枚举所有规则×实例组合。每个mapping行都生成choice {memory,rule?,assignment?}，未命中只含memory；命中时按mapping顺序生成原MemoryTestAssignment（instancePath取原pathText）并记录对应两个索引，含原接口不匹配行也保留来源。visitedSegments计每次尝试查找下一段的次数（缺边尝试计1），不是Core查询/规划work。unusedRules按输入顺序列未成为任一已观察行胜者的规则索引；可能是遮蔽、范围外或上游截断，既不证明路径不存在，也不独自使计划partial。空候选可有unusedRules且原plan完整。

展开后沿7.11原assignment数量/字符串/路径界限验证，超限返回BadRequest而非截断后伪造domain_missing。其余未命中由原planner报告domain_missing，接口不匹配等优先级不变。生成分配覆盖全部已发布mapping行，原规划预算可只发布前缀，剩余原unusedAssignments保持；choice不是调度成功证明。原mapping/plan partial、完整性、预算、控制器/步骤算法及成本解释保持。最终完整性唯一读取report.plan.complete。规则/trie构造及匹配检查取消，不新增软预算，输入形状上限非硬heap/编译/全链deadline。

边界API `parseMemoryTestRules(std::string_view,Cancel)` / `loadMemoryTestRules(path,Cancel)` 返回拥有规则数组，独立输入为 {formatVersion:1,kind:"memory-test-rules",rules:[{path:[...],recursive:bool,clockDomain:string,partition:string}]}，所有字段必填、未知字段拒绝；1MiB/普通文件/Unicode/重复键/精确数值/错误分类与7.12共用实现。新输入Schema memory/input/memory-test-rules.schema.json；不能把Schema通过当重复选择器/字节总量已验证。文件不引用别的文件、模型或工程，也不自动加载。

CLI单次--test-rules FILE必须同时--plan-tests，禁止与--test-instance混用；模型/角色/成本可继续显式CLI或--memory-library，policy/预算仍用原参数。文件及全部请求验证先于Design.open。启用时新增严格rtl-memory-test-rules-v1/formatVersion1：{formatVersion,algorithm,rules,choices,unusedRules,visitedSegments,report:原rtl-memory-test-plan-v1}，report保存原investigation/plan及可选library；原35输出Schema/所有旧格式不变。新wrapper的JSON数值/索引/错误/partial退出沿7.11，--version不变。静态分析消费者重编；Core、IPC、UI、工程格式与依赖保持，域只是用户分配声明，非自动时钟域推断、MBIST实现或电气证明。

### 7.14 跨控制器内存测试批次调度

新增分析API `scheduleMemoryTests(Design&,MemoryTestScheduleRequest,Cancel)`，request包含原MemoryTestRequest test、可选rules（存在时按7.13验证，不能为空且原assignments必须为空）与MemoryTestScheduling scheduling。先预取消、全部上游及调度参数验证，再执行一次原planMemoryTests或planMemoryTestsByRules。返回拥有source（上述两种原报告的variant）和schedule；不接受外部手工拼造plan作为事实。原API、规划策略及所有旧格式保持。仅新增静态分析消费者重编；Core/IPC/工程格式/依赖不改。

scheduling.policy默认maxParallelControllers=4（1..1024）、maxPowerMicrowatts=500000（1..10^12），限制同一批次同时运行的控制器数与各就绪步骤声明功耗之和。scheduling.limits默认maxWaves=10000（1..10000）、maxWork=1000000（1..10^7）、maxMillis=1000（1..60000）。这是原规划完成后独立软调度预算，非全链deadline或硬heap。所有成本沿原显式声明，不推物理峰值、频率或不同域周期换算。

每个原plan controller的初始nextStep=0；按控制器编号递增扫描尚未完成/阻碍的控制器，每次只考虑其当前就绪步骤。若步骤功耗单独超过全局上限，标该控制器blocked/step_power_exceeded，保留nextStep，后续步骤不越过它；其它控制器仍可调度。可容纳时放入当前wave，不能容纳则留到后续批次；并行数已满即可结束本次扫描。无重新拆分局部步骤、重新排序控制器、回填已结束批次或最优装箱承诺。每wave最多包含同一controller一次，所有成员结束后下一wave才开始；该同步屏障是计划执行前提，未实现执行协议/RTL。不同域可在同批中按声明运行，但不提供全局cycles/runtime。

wave.entries为{controller,step}引用原plan.controllers及其steps，powerMicrowatts为成员步骤声明和。schedule.controllers与原controllers一一对应，含nextStep及status（pending/complete/blocked），blocked才有reason=step_power_exceeded；nextStep只在成功发布批次时前进。complete表示该控制器原计划步骤全部纳入批次，并非全设计完整。scheduledSteps计已发布entry，scheduledInstances/CapacityBits仅累加对应原step.memories的实例数/模型声明容量，不能以原计划总量冒已调度总量。

每次考虑一个就绪步骤耗1work，包括暂时放不下及过功耗；完成/阻碍控制器不再扫描。整个候选批次的entries、进度和阻碍决定原子发布；工作/时间预算在构造中耗尽则丢弃该次候选的所有改变，保留此前批次及已耗work。只有阻碍而无entry的完整扫描可以提交阻碍，不产生空wave。maxWaves检查发生在仍有待处理控制器时，恰好全部完成不因等于上限而partial。取消或Core错误只返回Error、无半报告；构建索引与最终计数检查取消但不计候选work，最后时间检查仍可标预算partial。

schedule.complete只有原plan.complete且所有controller完成时true；reasons去重且首次出现顺序保存：plan_partial、step_power_exceeded、budget_work、budget_waves、budget_time。上游空/partial与上游未调度原因原样保存在source；无控制器时仍继承原partial。返回的控制器pending及原源报告能解释预算剩余，不把未访问步骤判成功或不存在。

CLI --schedule-tests需同时--plan-tests，兼容--test-instance或--test-rules、--memory-library；新增单值--schedule-max-parallel/power/waves/work/millis，未启用--schedule-tests时这些参数拒绝，全部校验早于Design.open。显式启用时新rtl-memory-test-schedule-v1/formatVersion1包含source（原计划或规则完整格式）和schedule（request、complete/reasons、work、scheduledSteps/Instances/CapacityBits、controllers、waves）。独立严格Schema离线引用原两格式，不扩旧格式联合，--version不变。JSON整数沿原writer安全编码，默认partial exit0、--require-complete读schedule.complete退出4，错误沿7.10；无UI/持久化/自动域推导/MBIST算法生成。

### 7.15 显式测试时钟下的批次时长与时间预算

新增`timeMemoryTests(Design&,MemoryTestTimingRequest,Cancel)`；request含原MemoryTestScheduleRequest schedule和MemoryTestTiming timing。预取消、全部上游/时长参数验证先于实际查询，随后调用一次原scheduleMemoryTests，不接受外部拼造报告。结果MemoryTestTimingReport拥有完整原source调度报告和timeline；既有API/37旧输出格式保持，Core/IPC/依赖/工程格式不变，新增静态消费者重编，无ABI承诺。

timing.clocks为0..10000个唯一{clockDomain,periodPicoseconds}，域按原控制器显式标签精确匹配；非空有效UTF8/无NUL/每名≤4096字节、总≤16MiB，周期为1..10^12整数皮秒。周期仅是测试时钟声明，不从RTL时钟频率/相位推导，不核电气可行性。policy.waveOverheadPicoseconds默认0（0..10^12），表示每批运行前固定开销；maxDurationPicoseconds默认9007199254740991（1..该值），限制**已发布批次累计时长**，不作最优调度/重排。limits.maxWork默认1000000（1..10^7）、maxMillis默认1000（1..60000）是调度返回后独立软计算预算，不是执行时间上限或全链deadline。

按source.schedule.waves原顺序处理完整前缀，每entry耗1work，保留原entry顺序。时长=原step.cycles乘对应clock.periodPicoseconds；并行批次时长=waveOverheadPicoseconds+各entry时长最大值，起点=已发布总时长，终点=起点+批次时长。整数乘加先检查uint64溢出，禁止浮点近似或环绕。缺域声明clock_missing、乘加溢出duration_overflow、终点超maxDurationPicoseconds为duration_limit；停止于首个失败批次，不跳过、不拆分，不将时长未知当零。全部计算和最后取消/软时间检查通过才发布该批及计数；中途work/time中断亦丢弃整批，但保留已耗work与先前完整前缀。精确等于时长或work上限、且无后续批次时可完整；空输入只继承上游完整性。

timeline保存request、complete/reasons、work、durationPicoseconds、timedSteps/Instances/CapacityBits、waves、unusedClocks和可选stop。waves与原批次一一对应前缀，每批{startPicoseconds,durationPicoseconds,endPicoseconds,entries:[{clock,durationPicoseconds}]}；entries与原批次同序，clock引用请求声明索引，无第二套controller/step权威。计数仅对应已发布entry及原step成员。unusedClocks按输入顺序列未用于**已发布批次**的索引，不能当作设计没有此域，不单独导致partial。stop含wave=首个未发布批次索引、reason，只有定位到某entry时带entry；duration_limit不带entry。reasons去重并按首次发生顺序保留：schedule_partial、clock_missing、duration_overflow、duration_limit、budget_work、budget_time。complete只有原schedule.complete且所有原批次成功计时才true；上游缺成员/阻碍/partial不被计时完整掩盖，取消/错误只返回Error无半报告。

CLI显式--time-tests须同时--schedule-tests和--plan-tests，--test-clock DOMAIN PERIOD_PS可重复（域不可重复），单值--time-wave-overhead、--time-max-duration、--time-max-work/millis；所有时长参数无--time-tests拒绝且在Design.open前验证。新严格rtl-memory-test-timing-v1/formatVersion1输出{formatVersion,algorithm,source:原调度完整报告,timeline}，离线引用原Schema，不改变旧格式；--require-complete按timeline.complete退出4，原错误分类保持。计划仍以批次间屏障和声明成本为前提，不生成算法/RTL/运行协议，不把声明时长当实测或全芯片测试时间。

### 7.16 可复用内存测试配置输入

新增边界API `parseMemoryTestConfig(json, investigation, profiles, Cancel)`及`loadMemoryTestConfig(path, investigation, profiles, Cancel)`，返回已有`MemoryTestTimingRequest`拥有值。investigation和profiles由调用者提供且只在调用期间借用；配置负责其余分配/规则、规划策略/预算、调度策略/预算和计时声明。先预取消，再按原1MiB普通文件/严格JSON边界读取，构造完整请求，调用7.15原全阶段验证器后返回；错误无半请求。不会打开Design、加载模型/库或其它文件，不推导缺省域/成本，不保存会话。原库文件、规则文件API保持，规则行解码共用一个私有函数，领域验证不另抄一份。

顶层严格为`{formatVersion:1,kind:"memory-test-config",assignments?:[...],rules?:[...],planning?:{policy?:{...},limits?:{...}},scheduling?:{policy?:{...},limits?:{...}},timing?:{clocks:[...],policy?:{...},limits?:{...}}}`。assignments/rules必须恰有一个：assignments为0..10000个{instancePath,clockDomain,partition}，rules沿7.13的1..1024行；所有行字段必填。planning/scheduling/timing的policy和limits只接受原对应字段，字段可省略，使用各原C++请求默认值；timing存在时clocks必填（可空），沿7.15。未出现的段完全使用原默认值。格式版本/所有整数用现有精确十进制规则，未知字段/null/错误类型/重复键/非法UTF8/超界拒绝；名字唯一、selector重复、字符串总量、模型/profile覆盖等沿原领域验证器。独立输入Schema描述形状和范围，Schema通过不代表关系验证通过。文件内容和外部investigation/profiles全部验证，包括当前执行阶段未使用的配置段。

CLI新增单次`--test-config FILE`，必须显式`--plan-tests`；可组合原静态模型/成本或--memory-library、调查/映射预算、--schedule-tests和--time-tests。文件不启用调度/计时；阶段仍由原开关选择，同一合法配置可用于三个阶段。禁止与--test-instance、--test-rules、所有--test-max-*、--schedule-max-*、--test-clock和--time-*参数混用（--time-tests执行开关例外），不合并/覆盖冲突来源。配置加载与完整验证在Design.open之前；原模式输出原计划/规则/调度/计时格式且记录实际有效声明，不新增wrapper、文件路径/哈希或Core快照字段。错误/partial/--require-complete沿当前阶段原行为。旧输出Schema/Core/IPC/UI/工程格式/依赖保持；静态输入消费者重编，不承诺ABI。

### 7.17 同一调查下的内存测试配置方案比较

新增`compareMemoryTestConfigurations(Design&,MemoryTestComparisonRequest,Cancel)`。请求含唯一investigation与2..8个具名configurations（按输入顺序）；每项{name,configuration}，configuration组合原MemoryTestPlanning planning、可选rules、MemoryTestScheduling scheduling和MemoryTestTiming timing。名字唯一、非空UTF8 scalar/无NUL/最多128字节。原profile覆盖、assignments/rules互斥与全部字段边界沿7.11–7.16。先预取消、验证所有配置和公共调查，才调用一次investigateMemories；通过私有可信事实入口按配置复用原规则展开/规划/调度/计时算法，不重复Core调查、不接受外部伪造报告。每配置阶段独立软预算，无新全链deadline；规则/汇总循环检查取消。错误或取消只返Error，无半比较。Design同步借用，所有请求与结果拥有。

结果MemoryTestComparison包含按序configurations[{name,report:原MemoryTestTimingReport}]与rows。每个report拥有同一调查事实的拷贝，原snapshot/索引/输入hash/partial原样保留，不跨设计拼接。rows与configurations一一对应，含metrics {controllers,plannedSteps,scheduledWaves,timedWaves,timedInstances,timedCapacityBits,durationPicoseconds}，分别统计原plan所有控制器/局部步骤、已发布schedule批次、已发布timeline批次与原计时汇总；这些前缀指标不代表全设计。reference固定0；row.comparable仅参考和该项timeline.complete都为true时true，届时才提供delta {controllers,plannedSteps,scheduledWaves,durationPicoseconds}，值为该项减参考，整数有符号且不溢出，参考自身为0。否则delta必须省略，保留原各阶段reasons/stop；即使指标看似相等也不能把不同partial前缀相减。总complete只有所有timeline.complete时true。完整也只指该显式scope/候选/声明，不等于inputHashComplete或物理签核。profiles/域/周期/功耗均为配置声明，差值不证明电气等价、不自动决定最优方案或生成MBIST执行器。

CLI重复`--compare-test-config NAME FILE`选择比较模式，必须显式--plan-tests --schedule-tests --time-tests，2..8项、名称唯一。模型/成本仍来自原静态声明或--memory-library，各文件按7.16加载，共享原调查/映射参数。禁止同时--test-config、--test-instance、--test-rules及--test-max-*、--schedule-max-*、--test-clock、--time-*数值参数；允许三个执行开关，所有文件与配置先于Design.open验证。新独立严格输出rtl-memory-test-comparison-v1/formatVersion1，含reference:0、complete、configurations和rows，report沿原timing writer含可选library；输出Schema离线引用原timing成功格式。JSON计数/容量沿原writer，大容量仍按原安全整数编码；差值界限安全整数。--require-complete读总complete返回4，错误沿7.10。旧输入/输出Schema/API/默认/版本/Core/协议/UI/工程格式/依赖保持，静态分析消费者重编，无ABI承诺。

### 7.18 逐内存测试覆盖与阻碍定位

新增 `inspectMemoryTestCoverage(Design&,MemoryTestTimingRequest,Cancel)`，预取消后沿7.15原完整验证与一次timeMemoryTests调用，返回拥有MemoryTestCoverageReport {source:原MemoryTestTimingReport,coverage}。不接收外部报告、不重复调查或规划、不改变原算法。coverage.rows按原investigation.interfaces.macros顺序，为每个已发布宏恰有一行；调查尚未发布的候选不虚构行。coverage.complete严格等于source.timeline.complete，原所有partial原因/stop留在source；完整仅指显式scope/候选/声明，非inputHashComplete或物理可测性。rows是原报告的派生索引，原source仍是唯一事实；线性构建反向索引并检查取消，不设新的阶段预算或硬heap/全链deadline。错误/取消返回Error无半覆盖。

每行{macro,stage,status,reason?,memory?,plannedMemory?,controller?,step?,wave?,entry?,timing?}：macro索引原interfaces.macros；memory索引mapping.memories，plannedMemory索引plan.memories，controller/step索引原局部控制器步骤，wave/entry索引原schedule批次及成员。仅原对应行/成员已发布才有相应索引；未到达不猜索引。status为timed/blocked/pending；stage为mapping/planning/scheduling/timing。映射未发布为pending/mapping_not_reached；原映射非matched为blocked/interface_unmatched，保留原issues且即使规划未发布也有该映射结论。匹配后规划未发布为pending/planning_not_reached；原计划blocked则沿其reason（domain_missing或power_exceeded）。已计划但无批次：控制器blocked且step==nextStep为blocked/step_power_exceeded，后续step为blocked/prior_step_blocked；其它为pending/schedule_not_reached。不能把后续较小步骤称自身过功耗。

已有批次但未计时：首个stop批次中，clock_missing/duration_overflow且entry等于原stop.entry的成员为blocked并沿原原因；该批其它成员为pending/wave_not_committed。duration_limit/budget_work/budget_time为整个未发布批次pending并沿原原因，不以部分entry计算值发布时段；后续批次pending/timing_not_reached。原stop可因最终软时间检查位于已发布末尾之后，既有timed行仍timed但coverage.complete保持false。已发布timeline批次的成员为timed/timing且省略reason；timing含startPicoseconds=原wave.start+声明waveOverhead、durationPicoseconds=原entry.duration、endPicoseconds=start+duration、barrierEndPicoseconds=原wave.end。成员在开销之后同时开始，较短成员可先结束但仍等待屏障；不把整个wave时长或未发布中间值当成员时长。原整批整数检查保证相加不溢出且≤安全整数上限。

coverage汇总observedMacros=rows数，matchedInstances=原mapping.matchedInstances，plannedInstances=原plan.scheduledInstances，scheduledInstances=原schedule.scheduledInstances，timedInstances=原timeline.timedInstances；blockedInstances/pendingInstances按rows状态累计，与timedInstances之和等于observedMacros。这些是同一观察前缀各阶段实例数，不提供覆盖百分比或未知后缀大小。所有结果拥有，释放Design/请求后仍有效；声明时段不证明物理/电气/功能或MBIST执行。

CLI单次 `--test-coverage` 必须显式--plan-tests --schedule-tests --time-tests，沿原静态分配/rules/--test-config与调查/模型/成本/策略选项；禁止与--compare-test-config混用，重复开关或缺阶段在Design.open前拒绝。新增独立严格 `rtl-memory-test-coverage-v1` / formatVersion1输出{formatVersion,algorithm,source:原timing成功格式,coverage}，Schema离线引用原timing；行状态与原因、成对索引和timing存在性受形状约束，跨数组索引、算术与汇总关系由运行时/测试保证。--require-complete读取coverage.complete，partial退出4、默认0；原错误/版本/Schema/public签名不变，无Core/IPC/SDK/UI/工程格式/依赖变化，静态消费者重编不承诺ABI。

### 7.19 内存时钟脚的逻辑来源与有效边沿分组

新增 `inspectMemoryClockSources(Design&,MemoryClockRequest,Cancel)`；请求含原investigation和limits（maxWork默认1000000、1..1000000；maxDepth默认64、1..256；maxMillis默认1000、1..60000）。先预取消、完整验证再调查一次，不接受外部报告。返回MemoryClockReport拥有原MemoryInvestigation source、原limits及clocks结果。仅处理已发布mapping.memories，rows按memory索引形成前缀，每行带memory、macro；未映射后缀不虚构。非matched行status=unmatched/reason=interface_unmatched；matched时取模型唯一兼容clock角色的实际pin，时钟脚为scalar，根实例从inside、其它实例从outside求解。按原SourceLogic的step/proc/exprMap规则分析透明连接、常量、位选择、反相及可证明逻辑，不解析源码字符串、不把依赖边当值传递；不提供额外根/输入假设，动态门控/mux不猜来源。原算法不变，返回完整LogicProof（result/work/reasons/steps/processes），复用原v2证明writer及Schema。

primary_input且有精确scalar origin/sourceRef才可resolved；按根port ref+bit+有效采样边沿分组，边沿为模型posedge/negedge异或证明inversions奇偶，根point/完整pathText/edge保存在groups。不同bit/边沿不合并，同源等效双反相可合并。组顺序按首次resolved行，members为rows索引；行仅resolved时有group。此分组不证明物理同域/频率/波形/安全测试条件，不改变7.11的显式域分配。constant/undriven为unusable（reason同verdict），generated/logic_boundary/unknown为unresolved（reason同verdict）；证据保留原判定，不将生成源递归当主时钟或把未决填默认根。映射不匹配不进入求解。完整只在source.mapping.complete且全部已发布memory均resolved时true；reasons首遇去重，含source_partial、interface_unmatched、source_unusable、source_unresolved、budget_work、budget_time。空且上游完整为complete。

新增阶段在调查返回后独立起算软deadline；每行入口、首次组根object查询各耗1work，其余沿原求解器全局work计费。达到work/time后不启动下一行；求解中耗尽可发布带完整已收集证明的unresolved行，无半group/member，后续行不发布；proof即使得出PI但无法支付首次组metadata查询仍为unresolved/budget_work或budget_time。最终deadline检查可令已有完整前缀partial，已发布resolved行不撤销。循环及调用检查Cancel，Error/取消返回Error无半报告；没有跨调用缓存/裸指针所有权。排序/容器分配与单Core调用非硬总heap/time承诺。

CLI `--clock-sources`要求模型（静态--model或--memory-library），与--plan-tests及其派生阶段互斥；`--clock-max-work/depth/millis`仅此模式可用，重复/越界/模式错误在Design.open前拒绝。原--clock-pin仍仅影响原调查证据，来源分析以模型clock角色为准。新独立严格rtl-memory-clock-sources-v1/formatVersion1输出含source（原rtl-memory-map-v1）、可选library、limits和clocks {complete,reasons,work,resolvedInstances,rows,groups}；proof复用原逻辑Schema，旧Schema/public签名/默认/version不改。--require-complete读取clocks.complete，partial退出4、默认0，错误沿7.10。静态消费者重编，无ABI稳定承诺，不新增Core/L4/SDK/UI/工程格式或依赖。

### 7.20 显式测试域与观察到的 RTL 时钟来源

新增 `inspectMemoryTestDomains(Design&,MemoryTestDomainRequest,Cancel)`；请求含原 MemoryTestRequest test、可选 rules 和 MemoryClockLimits limits。先预取消、完整验证规则/规划/时钟预算，再调用一次原显式/规则规划；在其拥有的同一 investigation 上运行7.19原时钟求解器，无第二次调查、外部报告导入或另一套推导。返回拥有 source（原计划/规则variant）、limits、clocks（7.19原结果）和domains。内部可信事实入口不作为公开API；原独立时钟入口及旧输出保持。

每个已发布mapping memory恰好一个domains.rows行 {memory,assignment?,domain?,clock?}，顺序同mapping，索引分别指原plan.request.assignments、domains.groups及clocks.rows。按原实例pathText精确关联显式分配（规则已在原报告展开），包括原plan预算未到达、接口不匹配或被阻碍的内存；不以已调度前缀替代观察范围。无分配行只保留memory/可用clock，列入unassignedMemories（mapping索引）；不凭时钟来源自动填域。clock仅在原时钟行已发布时出现；有证明但未形成来源组也仍是未决。

域按已观察memory首次遇到的clockDomain排序，忽略模型/partition差异，成员保存本报告rows索引。每域 {clockDomain,members,clockGroups,controllers,resolvedInstances,sourcesComplete,status}；clockGroups按成员首次出现顺序去重，引用clocks.groups；controllers按原plan顺序列该域全部原控制器索引。只有已观察域有条目，未使用分配保留于原计划，不声称其路径不存在。sourcesComplete只表示此域已观察成员全部有已决来源，不能证明上游未观察后缀。status：已知来源组≥2为mixed（即使仍有未决成员）；恰有1组且全部成员已决为uniform；其余unresolved。来源组沿7.19位和有效边沿区分，不推频率、相位或物理等价。

domains.complete = 原plan.complete && clocks.complete && unassignedMemories为空；reasons按固定顺序为plan_partial、clocks_partial、domain_missing（条件成立才列），assignedInstances/resolvedInstances分别统计已分配成员和其中已决成员。mixed本身不使complete为false：这是完成观察后发现多个RTL来源，并不证明显式测试域无效（后续测试mux/时钟切换可另行设计）。uniform也不证明电气安全或MBIST可执行。报告不改写原分配、控制器、成本或时间声明。

时钟预算沿7.19在原规划后独立开始；最后关联为有界输入上的索引构造/成员遍历，检查取消、不另计时钟work，无硬heap或全链deadline承诺。取消/Core错误仅返回Error，无半报告。CLI `--inspect-test-domains` 必须同时 `--plan-tests`，支持原test-instance/test-rules/test-config与library输入；与clock-sources/schedule-tests/time-tests/test-coverage/compare-test-config互斥。原clock-max-work/depth/millis亦可用于本模式，所有验证先于Design.open。test-config仍验证所有声明阶段，不自动启调度/计时。新增严格 `rtl-memory-test-domains-v1`/formatVersion1 Schema引用原plan/rules/clock定义；旧Schema、--version、错误码保持。--require-complete读domains.complete，partial退出4，mixed且complete退出0。静态消费者重编，无ABI承诺；Core/IPC/SDK/UI/工程文件/依赖不变。

### 7.21 显式测试域的 RTL 时钟来源允许集校验

新增 `checkMemoryClockSources(Design&,MemoryClockCheckRequest,Cancel)`；request含7.20 MemoryTestDomainRequest domains和expectations。预取消、全部域/规划/时钟预算及允许集验证先于查询，随后只调用一次inspectMemoryTestDomains，不重复调查或求解、不接受外部拼造报告。结果拥有source（原MemoryTestDomainReport）及check；原事实/分配/控制器/证明不改。

每条MemoryClockExpectation含clockDomain及1..256个sources，每个源为{path,bit,edge}。domain精确匹配原显式域，path精确匹配7.19根port object.pathText，bit为Core归一后的零起始位偏移（不是SV声明下标），edge为posedge/negedge的有效采样边沿。没有glob、路径解析、ref持久化、大小写折叠、周期/相位或等价推测。expectations允许0..10000条且域唯一；来源总数≤10000，同域重复(path,bit,edge)拒绝，不同域允许同一来源。bit为0..9007199254740991整数，字符串非空有效UTF8 scalar/无NUL/≤4096字节，总域名/源路径≤16MiB。无效参数BadRequest，域/路径不在已观察范围并非输入语法错误。

check.request保留拥有的expectations；rows与source.domains.rows一一对应，每行{row,status,expectation?,source?,reason?}，row为原域报告行索引，expectation指输入数组，source仅match时指该条允许sources局部索引。优先级：原行无domain→unassigned；域未声明允许集→unconstrained；有允许集但clock未发布→unresolved/clock_not_reached；clock已发布但无已决group→unresolved/source_unresolved；已决根(path,bit,edge)在允许集中→match，否则mismatch。匹配不要求所有允许来源都实际使用。mismatch不抹掉原事实或发明期望源已存在的证明，恒定/浮空/生成/动态/接口不匹配等仍通过原clocks保留，不误称确定性来源冲突。

汇总matchedInstances/mismatchedInstances/unresolvedInstances/unconstrainedInstances/unassignedInstances之和等于rows数。unusedExpectations按输入顺序列未关联任何已观察域行的声明，不证明域不存在；非空使校验partial，因为本次没有检查到这些要求。complete仅在source.domains.complete、所有行均match或mismatch且unused为空时true。reasons固定顺序列条件成立项：source_partial、domain_missing、expectation_missing、source_unresolved、unused_expectations。verdict为fail（任一已知mismatch，允许同时partial），否则complete时pass，其余unknown。complete表达检查范围/证据充分性，fail表达已观察违例；禁止把partial中所有已检查成员match当pass，也不把已知fail因别处未决降为unknown。完整空观察+空允许集可pass，完整空观察+非空允许集为unknown。预算沿7.20，最终允许集索引/逐行匹配检查取消，不另计时钟work；无新全链deadline或硬heap承诺，Error/取消无半结果。

新增输入API parseMemoryClockExpectations(string_view,Cancel)/loadMemoryClockExpectations(path,Cancel)，严格JSON形状{formatVersion:1,kind:"memory-clock-expectations",domains:[{clockDomain,sources:[{path,bit,edge}]}]}。共享7.12的1MiB、普通文件、精确整数、Unicode、重复key/未知字段拒绝和错误分类；先验证全文件，不加载其它文件、不保存会话。输入Schema位于memory/input；Schema不证明重复domain、字符串字节总量或跨字段关系。

CLI `--check-test-clocks FILE`必须`--plan-tests`，支持test-instance/test-rules/test-config/library及clock-max-*，与独立clock-sources/inspect-test-domains及调度/计时/覆盖/比较互斥。重复/冲突/文件和全请求错误先于Design.open。新独立严格rtl-memory-clock-check-v1/formatVersion1 {source,check}，引用原域报告及输入sources形状；原Schema/默认/API/--version/错误码保持。默认输出返回0，--require-complete仅在check.complete=false时返回4，已知完整fail不作为执行错误；消费者读取verdict。静态消费者重编，无ABI承诺；Core/IPC/SDK/UI/工程格式/依赖不变。此处校验用户声明的**RTL来源允许集**，不把功能时钟来源当未来MBIST测试时钟，不证明电气安全或生成切换/执行电路。

### 7.22 声明测试方案与 RTL 来源约束的联合检查

新增 `assessMemoryTests(Design&,MemoryTestAssessmentRequest,Cancel)`，请求含原MemoryTestTimingRequest test、MemoryClockLimits clockLimits与MemoryClockExpectation数组expectations。先预取消并完整验证所有规划/规则/调度/计时/时钟/允许集参数，再调用一次inspectMemoryTestCoverage；在其唯一原调查和原计划上复用7.19来源求解、7.20域关联及7.21允许集评估，不再调查或重跑计划，不接受外部报告。返回拥有MemoryTestAssessmentReport {source:原MemoryTestCoverageReport,clockLimits,clocks,domains,check,assessment}。source保留全部原事实与索引；其余沿原组件类型与语义，派生视图不成为第二份计划权威。域/时钟/校验结果应与相同声明的独立7.21分析等价，实际软时间截断各按真实执行记录。

assessment.rows与source.coverage.rows一一对应，按macro顺序；每行{macro,clockCheck?,status,issues}。macro也索引原覆盖行，clockCheck仅该宏有已发布mapping及其校验行时出现，索引check.rows。issues固定顺序：原覆盖blocked列test_blocked，pending列test_pending；无对应校验行列clock_check_not_reached，否则按校验mismatch/unresolved/unconstrained/unassigned分别列clock_mismatch/clock_unresolved/clock_unconstrained/domain_missing，match不加问题。所有问题保留，原具体阻碍、证明和时段通过索引回原source，不复制或猜测。status：原覆盖blocked或校验mismatch即blocked；原覆盖timed且校验match才satisfied；其余pending。已知阻碍不因另一分支未到达而降为pending；satisfied只指这个已观察成员同时满足声明的两条检查，不代表全范围或物理/MBIST可执行。

assessment汇总satisfiedInstances/blockedInstances/pendingInstances之和等于rows数。complete仅source.coverage.complete && check.complete；reasons按固定顺序条件列coverage_partial、clock_check_partial。verdict存在blocked即fail（可partial），否则complete且无pending时pass，其余unknown。完整空范围/空允许集可pass；unused约束使check partial，即使所有已观察成员satisfied也不pass。规划/功耗/缺周期等确定阻碍与时钟来源违例均可使fail，不将“只未到达”当违例。不会过滤不合格成员、重排原批次、重算时段或生成执行器。

时钟预算沿7.19，在原覆盖分析返回后独立开始；原各阶段预算保持，最终派生遍历检查取消，无新全链deadline或硬heap承诺。取消/Core错误只返回Error、无半联合报告；同步借用Design、结果全拥有。

CLI新增 `--assess-tests FILE`，FILE沿7.21允许集输入。必须同时--plan-tests --schedule-tests --time-tests，可用原静态分配/rules/test-config/library及clock-max-*；与clock-sources/inspect-test-domains/check-test-clocks/test-coverage/compare-test-config互斥。所有模式和文件/完整请求错误先于Design.open。新增严格rtl-memory-test-assessment-v1/formatVersion1成功格式，引用原coverage、clock/domain/check形状，原输入及48旧Schema不变。默认正常输出exit0，--require-complete仅联合complete=false退出4；完整fail由verdict表达。新增静态消费者重编无ABI承诺；Core/L4/IPC/SDK/UI/工程格式/依赖不变。联合检查不证明RTL功能、频率/相位、电气/物理测试可行性或MBIST切换/执行电路。


### 7.23 同一调查和时钟证据下的多测试方案联合比较

新增compareMemoryTestAssessments(Design&,MemoryTestAssessmentComparisonRequest,Cancel)。请求含原MemoryTestComparisonRequest tests、公共MemoryClockLimits clockLimits和按配置顺序一一对应的expectations数组（每项沿7.21允许集）。沿原2..8配置及名称/全部阶段验证，并要求expectations数量完全对应、每项合法；预取消和全部验证先于任何调查。只调用一次原compareMemoryTestConfigurations，在其共同调查上求解一次公共clocks，按各配置已有timing/plan派生原coverage/domains/check/assessment，不重跑调查/规划/计时/来源，也不接受外部报告。

返回拥有MemoryTestAssessmentComparison {source:原MemoryTestComparison,clockLimits,clocks,configurations,complete,rows}。source是唯一原配置名称/调查/计划/时段/原timing指标及delta权威；clocks是公共来源证据。configurations与source.configurations按序对应，每项{coverage,domains,check,assessment}严格沿7.18/20/21/22类型/意义；其索引指对应source.configurations[i].report及公共clocks，不额外复制原事实。结果释放Design/请求后仍可用。公共时钟预算只执行一次，在原配置比较后独立起算；各配置原阶段预算保持，派生遍历检查取消。Error/取消无半结果，无新硬heap/全链deadline。

rows与configurations一一对应，参考固定0；每行{comparable,delta?,transitions}。comparable仅参考和本项assessment.complete都为true；届时delta={satisfiedInstances,blockedInstances,pendingInstances}为本项减参考，int64安全计数，参考自身0；否则省略delta。transitions按同一已观察macro顺序，逐行{macro,referenceStatus,status}直接引用两项assessment.rows状态，包含不变行；partial时仍列已观察状态对，不声称这些状态对是完整设计变化。两项同blocked但issues不同仍由原assessment保留，不另推原因等级或自动选最优。外层complete仅所有assessment.complete，与pass/fail独立；完整fail方案可参与差值，原timing-comparison的comparable/delta只表达时间链，不能代替联合完整性。

CLI重复--compare-clock-expectations NAME FILE启用联合比较，必须有原--compare-test-config NAME FILE的2..8项及--plan-tests --schedule-tests --time-tests。允许集按名称精确配对，输入顺序任意但输出遵从配置顺序；缺失/多余/重名/超8条拒绝，空允许集通过显式空文件表示，不默认为未指定。允许公共clock-max-*；既有compare-test-config和其它模式互斥/禁止覆盖阶段参数规则保持，与--assess-tests/--check-test-clocks等不混用。全部文件和请求先于Design.open验证。新增独立rtl-memory-test-assessment-comparison-v1/formatVersion1，reference=0，引用旧comparison及各字段Schema；49旧Schema/原模式输出/API含义不变。默认exit0，--require-complete仅外层partial退出4，不因fail退出错误。Core/L4/IPC/SDK/UI/工程文件/依赖不变；静态消费者重编，无ABI承诺。只比较用户声明和已观察RTL事实，不是物理等价/签核或MBIST执行器。

### 7.24 显式共享测试资源容量约束

MemoryTestScheduling新增默认空resources，每项MemoryScheduleResource {name,maxParallelControllers=1,clockDomains}，表示列表中每个域的控制器在整个批次占用本资源1单位，批次屏障后释放。计数单位是控制器而非memory、step.cycles或域：同域分模型/partition形成多个控制器时分别计数。一个域可使用多个资源，全部容量必须同时满足；不同域可共享同一资源。标签精确匹配、不分解路径、不从RTL来源组自动产生关系。资源名唯一非空UTF-8且不含NUL；名/域各至多4096字节，总字符串至多16MiB；至多1024资源，每项容量1..1024、1..1024个不重复域，所有域成员总计至多4096。全部资源和原请求验证在调查前，预取消优先。

原7.14 Scheduler保留控制器顺序、每批每控制器最多一步、全局并行/功耗与原整批发布。候选先检查原功耗：单步超全局功耗仍blocked；当前批功耗容不下则暂缓。其余按资源声明顺序检查所属资源，任一占满则暂缓本控制器并继续扫描后续控制器；通过全部检查才增加该候选批资源占用。暂缓不是blocked，不加partial原因，下一批重新尝试。非空批完成后容量清零；容量均正且单步功耗可满足时不产生资源死锁。算法确定性但不保证最少批次/最优时长，也不改变原局部计划、成员与控制器归属。

为资源域建立至多4096成员的反向索引，初始化逐成员检查取消/调度deadline，未完成索引不运行批次。原每次就绪控制器检查计1work；仅通过功耗准入的控制器继续按声明顺序对每个匹配资源检查计1work，首个资源冲突即停止该控制器检查。初始化与更新候选占用不额外收费，输入上限/逐检查取消及软时间限制保持，不承诺硬heap/deadline。任何work/time cutoff都丢弃整个候选批及其阻碍决定，占用仅是私有临时状态，不能推进原进度；计费work仍保留。未声明资源时原work、顺序、输出不变。声明未观察域不生成控制器、不改变完整性，也不声称全设计该域不存在。

parseMemoryScheduleResources/loadMemoryScheduleResources返回拥有vector，严格JSON {formatVersion:1,kind:"memory-schedule-resources",resources:[...]}，复用原1MiB普通文件、重复键/精确整数/UTF-8等输入约束。原memory-test-config v1增加可选scheduling.resources，共用同一解码和验证。CLI --schedule-resources FILE仅用于原--plan-tests --schedule-tests链，支持time-tests/test-coverage/assess-tests；与test-config/compare-test-config的阶段覆盖规则保持互斥，比较分别使用每份配置中的资源。重复选项/文件/完整资源错误在Design.open前拒绝。

原schedule v1的schedule.request增加可选resources，仅非空才写，包含完整声明及原顺序；资源占用可由原plan和waves核算，不另复制计划或伪造物理事实。计时/覆盖/联合评估与多配置比较沿原source消费真实新批次，时间预算/差值自然反映约束；不复制调度器。input Schema引用schedule的资源$defs，运行验证器额外执行名唯一、总数量/字节及UTF-8关系。旧无资源输入/输出保持逐字段兼容；新带资源文档需要更新Schema/consumer，旧严格消费者会拒绝新增字段，非双向兼容。C++结构布局新增成员，静态消费者需重编、无ABI承诺；Core/L4/IPC/SDK/UI/工程格式/依赖不变。只约束声明的逻辑资源，不能替代功能/测试时钟切换、电气/功耗签核或MBIST执行电路。

### 7.25 显式测试域先后约束

在7.14/7.24的MemoryTestScheduling增加默认空dependencies，每项MemoryScheduleDependency为{before,after}精确测试域标签，表示after的任何控制器开始前，before域的全部**已发布计划控制器**必须完成。0..4096条边；每标签非空、有效UTF8、无NUL、≤4096bytes，总字符串≤16MiB。禁止自环、重复有向边及任意环路；按有界非递归DAG检查，在查询设计前验证全部边。允许相同后置域多个前置、任意声明顺序、未观察标签；不根据RTL/名字推断依赖。原计划不完整仍为条件计划，不把未观察/未规划内存当已测试。

Scheduler建立域的控制器总数、未完成数、blocked数及后置域→原依赖索引（保留声明顺序）。每次候选扫描先花原1work，再对该控制器的每条直接前置依次花1work：before没有已发布控制器则本控制器blocked/dependency_unavailable；已有blocked控制器则blocked/dependency_blocked；否则任一未完成就暂缓。暂缓后仍检查其余前置以报告已知阻碍，到首个阻碍停止；全部满足才进入原功耗/资源检查。阻碍的progress额外记录dependency=原声明索引，nextStep不推进。原因表示本次计划可用性，unavailable不证明RTL域不存在；同域多个控制器必须全部完成，部分完成不得解锁。

依赖只读取本批开始前提交的状态；本批刚完成/blocked的前置不会在同批解锁/阻碍后置。整批波次、控制器进度、阻碍及域计数一起原子提交；work/time截止丢弃本轮全部候选及新阻碍，work保留。无可运行成员但有阻碍时只提交阻碍、不发布空wave，下一轮传播；DAG与正容量保证在预算内每轮有进展。新阻碍使schedule.complete=false并加入相应reason；其后步骤沿prior_step_blocked。缺失/受阻和独立域可并存，不能跳过前置执行后置。未声明依赖时原work/顺序/输出保持。

公开parseMemoryScheduleDependencies(string_view,Cancel)/loadMemoryScheduleDependencies(path,Cancel)拥有返回vector，输入{formatVersion:1,kind:"memory-schedule-dependencies",dependencies:[{before,after}]}严格字段、1MiB/普通文件/UTF8/重复键/取消/错误规则沿7.12。test-config v1可选scheduling.dependencies由同一解析/领域验证处理；CLI单次--schedule-dependencies FILE要求--plan-tests --schedule-tests，与test-config/compare逐项覆盖禁止规则一致；比较从各自配置获取依赖。输出schedule.request.dependencies非空才写，blocked progress的dependency只随两种新原因出现。schedule Schema提供唯一dependencies定义，输入/config引用；coverage scheduling blocked枚举添加两新原因，引用原controller进度不复制依赖表。计时、coverage、assessment与comparison消费同一原调度，保留上游partial；无额外调度副本。

旧API调用/默认无依赖文档保持；C++聚合布局变化，静态消费者需重编，无ABI保证。新依赖文件/字段/原因需新版严格Schema及reader，旧reader明确拒绝，不承诺双向兼容。Core/IPC/SDK/UI/工程格式不变。声明是条件执行计划，不是MBIST执行器、最优调度、物理电源/时钟切换或电气安全证明。

### 7.26 共享测试资源的恢复间隔

MemoryScheduleResource增加recoveryPicoseconds（默认0，0..10^12整数），表示该**整体资源**在一个使用批次屏障结束后，再次使用前须等待的间隔。沿7.24容量/域名/数量/UTF8与字节约束验证，所有入口在设计查询前拒绝非法值；独立memory-schedule-resources文件及test-config.scheduling.resources同一可选字段，不新增第二输入权威。原Scheduler的准入/顺序/成员/work不变，恢复时间由7.15原Timer执行；只运行schedule-tests时仍是尚未计时的批次，不冒已满足时间要求。

Timer对recovery>0的资源建立域反向索引，保存各资源最后一个**已发布使用批次**的endPicoseconds。首次使用不需等待。每波仍先按原entry顺序验证时钟与周期时长；每个entry原1work，随后按资源声明顺序对本波首次遇到的正恢复资源额外1work（同波多个控制器共用同资源只计一次，首次全局使用也计）。资源无上次使用则只登记本波使用；否则ready=上次使用批次end+recovery。候选start=max(前波end,本波所有使用资源ready)，duration仍为overhead+最长entry时长，end=start+duration。未使用该资源的中间波时间可吸收部分/全部间隔；不同资源的等待取最大值不相加。容量>1也按整个使用波的屏障统一释放/恢复，不按各控制器提前结束或每个容量槽分别计时。

整波算术/时间上限/工作与软deadline通过后，才发布波次、等待与所有本波资源结束时间。任何失败均保留已发布前缀和已耗work，不更新资源可用状态/usedClocks/成员计数，不发布半波等待。乘加沿原uint64溢出检查；超maxDuration为duration_limit，不把等待排除在预算外。索引逐成员检查取消/deadline，未完成索引不执行波次；每波/entry/新资源检查取消与时间。默认0资源不建立恢复索引、不额外收费，旧执行/输出保持。最后一波结束后的恢复不计总时长，无虚构空波或调度重排。

MemoryTimedWave可选resourceWait={durationPicoseconds,resources}仅实际等待>0时存在：duration=resourceStart-前波end（无7.28依赖等待时resourceStart=start），resources按声明索引升序列出本波所有ready>前波end的资源（含非决定最大值者），引用source.schedule.request.resources；不列未使用或已恢复资源。MemoryTestTimeline.resourceWaitPicoseconds为已发布波等待之和，JSON仅非0输出。原wave.duration不含波前等待，timeline.duration为最后已发布end，包含等待；coverage中成员start仍wave.start+overhead，全部原索引/原因/完整性保持。共享等待只能随整个波次发布，未计时成员沿原pending/stop语义，不能伪造timed。

原MemoryTestMetrics增加resourceWaitPicoseconds，非0才输出；MemoryTestDelta增加同名有符号本项减参考差值，仅原comparable条件成立且参考/本项至少一个等待总量非0时写（参考自身写0），partial仍省略整个delta。原duration差值自然包含恢复时间，联合assessment/comparison沿已有计时/coverage消费，不重复计时或改时钟来源判定。resourceWait总量≤总时长≤2^53−1，差值安全落int64；新字段仅是同一已发布时段的可验证聚合。

schedule的资源$defs、timing及comparison三份Schema扩展可选字段；所有其它原Schema通过原引用消费，默认0/省略保持旧文档。资源request仅非0时写recoveryPicoseconds，新恢复配置/输出需新版严格reader，旧reader拒绝新字段；C++ DTO布局变化需静态consumer重编，无ABI承诺。Core/IPC/SDK/UI/工程格式/依赖不变。此能力是用户声明下的条件时序规划，不推物理恢复、频率/电源安全、最优调度或可执行MBIST控制RTL。

### 7.27 共享测试资源的独立功耗上限

MemoryScheduleResource新增maxPowerMicrowatts（默认0，0..10^12整数），0表示不额外限制该资源的功耗。非0时，使用该资源的本批每个控制器的当前step.powerMicrowatts全部计入该资源总量，累计不得超过上限；同域多个控制器分别计入。域同时匹配多个资源时，完整step功耗计入每一个匹配资源，不按资源数分摊，也不根据RTL名字推电源归属。原模型/profile/step功耗声明是唯一数值权威，原步骤不被重新拆分。容量与恢复声明仍独立适用。

Scheduler保持原前置依赖→全局单步/本批功耗→资源声明顺序。每次资源访问仍只计原1work（功耗与容量在同次访问内检查，不另收费）。本step功耗超过该资源非0上限时，本控制器blocked/resource_power_exceeded，记录resource=原资源声明索引；首个资源拒绝即结束当前候选。否则容量已满或该资源本批剩余功耗不足时仅暂缓，不blocked、不添partial，继续扫描后续控制器；下一波重新尝试。前面的资源暂缓可能推迟后面资源的检查，沿原首次拒绝顺序，不预扫描重排或提前选择诊断。原全局单步超限仍step_power_exceeded，依赖缺失/受阻仍保持优先级。

全部匹配资源通过后才同时增加本候选批的各资源占用/功耗。候选波、控制器进度、阻碍索引和依赖域计数仍在整批提交；work/time截止丢弃本轮所有占用/阻碍，work保留。下一批容量和累计功耗归零；单步满足所有非0预算且容量为正时仍可前进。资源单步阻碍沿原dependency_blocked传给后置域；coverage当前步骤保留resource_power_exceeded，后续步骤为prior_step_blocked。原progress是阻碍索引权威，覆盖/assessment不另复制资源表。

独立资源文件和test-config同一可选字段、验证0..10^12精确整数与原严格文件/字段规则，全部输入先于设计查询；预取消优先。schedule.request资源只在非0时写maxPowerMicrowatts；blocked/resource_power_exceeded进度必须有resource且无dependency，其余进度禁止resource。schedule reasons和coverage scheduling blocked枚举增加该原因。schedule资源$defs与coverage两Schema扩展，input/config及其他派生Schema沿原引用消费。无新增CLI模式，原--schedule-resources/--test-config/--compare-test-config即可输入，计时/恢复/coverage/assessment/比较使用真实新波次和原完整性，partial不得升级。

默认省略/0时旧功耗/容量/依赖/恢复行为、work、输出不变；新增字段/原因需要新版严格reader，旧reader明确拒绝，C++ DTO布局变动需静态消费者重编，无ABI承诺。Core/IPC/SDK/UI/工程格式/生产依赖不变；只实现显式逻辑资源预算下的条件调度，不推实测峰值、电源网归属、电气签核、最优调度或可执行MBIST控制RTL。

### 7.28 测试域依赖的最小等待间隔

MemoryScheduleDependency增加minimumGapPicoseconds（默认0，0..10^12整数）。before→after仍按7.25要求全部已发布前置控制器完成；非0时，after的任何步骤所在波开始还必须≥before全部控制器完成波的屏障end+gap。使用域最后一个已发布步骤所在波的屏障，不按单个entry提前结束；已有中间波时间可抵扣，多个前置取最大ready，不相加。前置计划控制器全无步骤时完成时刻为0；没有前置控制器或前置受阻仍按原Scheduler阻碍后置，不用0虚构可运行。原步骤、批次和Scheduler work不变，schedule-only不能声称已满足间隔。

原Timer仅对正gap建立after→原依赖索引和before→最后已发布使用波end（初始0）。输入来自同一原Scheduler的波次前缀，其先后契约保证后置进入时所有前置步骤已发布；不另复制域调度算法或接受外部计划。每entry仍原1work，按原顺序检查周期与资源恢复，随后对该entry域匹配且本波首次遇到的每条正gap依赖按声明顺序额外1work；同波多控制器共享同一边只计一次，后续波再次访问仍计费。ready=end+gap按原uint64加法溢出检查。全部候选结束后才提交依赖前置域end、资源end、时段与汇总；work/time/duration截止保留前缀和已耗work，丢弃整候选的所有状态。

实际start=max(前波end,所有使用资源ready,所有匹配依赖ready)，duration仍overhead+最长entry，end=start+duration，最大时长预算包含全部等待。为避免重叠等待重复累计，先定义resourceStart=max(前波end,资源ready)；原resourceWait.duration固定为resourceStart−前波end，resources仍列所有resource ready>前波end者。新增可选dependencyWait={durationPicoseconds,dependencies}仅start>resourceStart时存在，duration=start−resourceStart，dependencies按原声明索引升序列所有dependency ready>resourceStart者，含非决定最大值者。这只是等待归因顺序，不表示资源恢复和域切换物理串行；两等待之和恰为start−前波end。未使用、不再需要等待或完全被资源等待覆盖的依赖不列出，末波不追加尾等待。

timeline、comparison metrics增加dependencyWaitPicoseconds（已发布dependencyWait之和），非0才输出；comparison delta同名有符号差值只在原comparable且参考/本项至少一方非0时输出，partial仍省整个delta。总量≤总时长≤2^53−1，无重叠重复计数；原duration自然反映全部延迟，coverage成员时段和联合评估沿原链消费，不能由等待推断时钟来源允许或物理安全。

独立dependencies文件与test-config使用同一可选字段/验证，原DAG/UTF8/大小/取消与先验证后查询规则不变，重复边仍仅按before/after身份拒绝。schedule.request依赖仅非0写minimumGapPicoseconds；schedule/timing/comparison三Schema扩展，input/config/下游沿原引用消费。CLI沿原--schedule-dependencies、--test-config和比较模式，无新增模式。默认0旧行为/work/输出不变；新文档需新版严格reader，旧reader拒绝，C++布局扩展需静态消费者重编。Core/IPC/SDK/UI/工程格式/依赖不变，不推实测切换时间、电气稳定、最优调度或可执行MBIST控制RTL。

### 7.29 共享测试资源的占用与成员见证

新增inspectMemoryResourceUsage(Design&,MemoryResourceUsageRequest,Cancel)。request包含原MemoryTestTimingRequest test及MemoryResourceUsageLimits；预取消优先，全部参数先验证，再调用原timeMemoryTests一次。返回拥有原source及usage，不接受调用者拼造时间线，不重复查询/调度/计时。仅遍历source.timeline已发布完整波前缀；原scheduled但未timed后缀不产生占用。source.timeline不完整时usage.complete=false/reasons含timing_partial，不据已观察零值推全设计未使用。

usage.rows与source.source.schedule.request.resources一一对应，按原索引顺序含全部资源；row含resource、occupiedPicoseconds、peakControllers、peakPowerMicrowatts及uses。每个use仅含wave和entries（原schedule该wave的entry索引、原顺序），由原entry继续索引controller/step和成员；不复制名称、时段或成员权威。每控制器域匹配资源的clockDomains便预留一次，同域多控制器分别计入，重叠资源各保留完整成员/功耗。row.occupiedPicoseconds为其使用波duration之和（wave.start至屏障end，含overhead，含短成员等待屏障），不含波前资源恢复/依赖等待或最后尾恢复；peakControllers取各使用波entries数量最大，peakPower取其中step声明功耗和最大。没有使用者为0/空uses。各资源占用不可相加冒全局时长；这些是条件计划预留，不是测得的电气活跃时间/功耗。

usage另含limits、complete、reasons、work、processedWaves、uses（已发布资源×波记录总数）及可选stop={wave,entry?,reason}。limits默认maxWork=1000000（1..10^7）、maxUses=100000（1..10^6）、maxMillis=1000（1..60000）；计时结束后开始独立软deadline。全部空row建立时检查取消，随后建立domain→原资源声明索引时检查取消/时间，不计work；索引未完成时不发布任何uses/波。逐波按原entry顺序访问，每entry先计1work，再对匹配的每个原资源按声明顺序计1work，累计其成员及step功耗。同波多entry共享资源仍逐entry计费；首次本波遇资源时若总已提交uses+候选uses达maxUses则budget_uses，已收费保留。work/time不足分别budget_work/budget_time；整波所有候选通过后才一次提交各row汇总/uses、processedWaves。stop.wave等于processedWaves，entry仅确定到具体entry时写。exact cap且无后续收费/新增use不自动partial；没有资源的波仍处理entry并推进processedWaves。不发布半波/半资源；source及上游预算不变。取消抛Cancelled而不返回半bundle，结果拥有索引/数值，释放Design/请求后仍可序列化。

原Timer/Scheduler界限保证row累计占用≤总已发布时长≤2^53−1、每波峰值功耗≤10^12，控制器≤1024；不引入能量乘积或舍入百分比。独立新rtl-memory-resource-usage-v1/formatVersion1输出含source=原rtl-memory-test-timing-v1和usage；新严格Schema离线引用原timing并沿用原错误envelope，全部旧Schema不变。CLI --test-resource-usage要求--plan-tests --schedule-tests --time-tests，兼容原手工/文件/test-config/test-rules；--usage-max-work/uses/millis只允许新模式。新模式与coverage、assessment、domain/clock检查及比较模式互斥，参数次序无关，错误在Design.open前拒绝。--require-complete按usage.complete决定exit4，原--version/其它模式不变。新格式需识别它的reader，旧CLI拒新flag；无工程保存或迁移，无Core/IPC/TS/UI/依赖变化。

### 7.30 多配置共享资源占用比较

新增compareMemoryResourceUsage(Design&,MemoryResourceUsageComparisonRequest,Cancel)。request.tests为原MemoryTestComparisonRequest（2..8个有名配置，共同调查），limits为7.29的同一MemoryResourceUsageLimits。预取消优先，所有配置和limits先验证；原compareMemoryTestConfigurations只调用一次，不逐配置重新调查。原比较source完整保留，按配置顺序对其中每份可信timing调用7.29唯一派生器；每份拥有独立相同limits/work/uses/软deadline，某配置耗尽不消耗其它配置预算。返回source、configurations（每配置原MemoryResourceUsage）、complete、rows；reference固定0。complete当且仅当全部usage.complete，存在不可比资源并不等于分析执行不完整。取消返回Cancelled，不发布半bundle；不接受外部报告导入，结果拥有数据。

资源矩阵rows按配置输入顺序、每配置原资源声明顺序首次遇到的**精确name**排列（不是排序或数组位置对齐）；每row={name,cells}，cells长度和顺序等于配置。cell.resource存在时引用该配置原schedule.request.resources及usage.rows的同一索引；缺失则省略，绝不能填0冒第一个资源或将缺失用量当零。资源数各≤1024，因此矩阵≤8192行×8格；构造索引/域集合/每行每格均检查取消，不另引入work账本或声称全链deadline。名字和域名都按原UTF8精确字节相等，不做模糊匹配或物理推断。

cell.status按下列优先级唯一决定：本配置无此声明→missing_resource；参考无此声明→reference_missing；双方clockDomains作为无序集合不同→domain_mismatch；任一usage.complete=false→partial；否则compared。只有compared有delta={occupiedPicoseconds,peakControllers,peakPowerMicrowatts}，三项有符号本项减参考，自参考写0；所有其它状态禁止delta。双方已声明但未使用且完整时可比较0；缺失、域变化即使观察到0也不生成delta。域声明顺序变化不影响身份；容量、功耗上限、恢复间隔、依赖、规划/时钟条件可变化，具体差异保留原source，不作为身份条件，比较是在这些声明条件下的结果差，不证明物理等价。上游/占用预算partial时仍保留原完整前缀供检查，不据同样前缀输出可比差值。三种数值沿7.29界限，转换int64再减安全；无百分比/能量/排名。

新增rtl-memory-resource-usage-comparison-v1/formatVersion1严格Schema，引用原comparison及原usage结构，原全部Schema不变。原writer的usage对象与limits验证在内部共享，单配置输出/work完全保持。CLI独立--compare-resource-usage要求--compare-test-config至少2项和原三阶段开关；--usage-max-work/uses/millis现在允许单配置占用或本新比较模式。与--test-resource-usage、coverage、assessment、clock/domains及comparison-clock-expectations互斥，原比较与单test-config/手工规划参数的互斥保持；参数次序无关，错误先于Design.open。--require-complete只按整体complete返回4，不因资源不匹配返回4。旧CLI拒新模式，旧reader可读不变原config/source但拒新envelope；无持久化/IPC/TS/UI/工程格式或依赖变化，新C++消费者重编且无整体ABI保证。该单元仅比较条件MBIST计划，不生成控制RTL或完成电气签核。

### 7.31 共享测试资源的单元需求与容量

原MemoryScheduleResource追加maxUnits（默认0，0..10^12）和domainUnits（默认空数组，每项{clockDomain,units}，units为1..10^12整数）。maxUnits=0不限制单元总量，原maxParallelControllers仍独立限制控制器数量。每个匹配此资源的控制器，在每个步骤所在波占用其域声明的units；没有覆盖项默认1。同域多个控制器分别占用，步骤内内存数不再乘units；重叠资源各按自身声明独立计入，不分摊。domainUnits最多1024项，域必须在同一资源clockDomains中且唯一；域名沿原UTF8/非空/4096字节规则，并计入资源总体16MiB字符串预算。由原总域数4096及覆盖子集规则同时界限总覆盖项数。全部解析/API验证在查询前完成，预取消优先；不推RTL物理通道/带宽。

CLI沿原独立resources文件和test-config.scheduling.resources进入，无新模式。maxUnits仅非0输出，domainUnits仅非空按原声明顺序输出；显式默认0/[]归一为省略。原Scheduler按依赖→全局功耗→资源声明顺序逐项检查，每资源仍只原1work。资源内先检查原单步功耗超限，再检查本控制器units>非0maxUnits：后者blocked/resource_units_exceeded并带唯一原resource索引；两种单步不可满足均先于累计容量/功耗/单元暂缓。否则控制器数量满、累计功耗不足或累计单元不足均只暂缓，继续其它控制器。前资源的暂缓可延后对后资源的诊断，保持首次拒绝规则，不额外预扫描。所有匹配资源通过后才同时占位，整波全部通过才提交进度/阻碍/依赖传播和波次；work/time截断保留已耗work、丢弃整轮候选。maxUnits>0且单需求已验证≤maxUnits，剩余容量用减法安全比较；每批重新释放单元，恢复仍按整体波屏障。

资源域索引为每个域按原资源顺序保存{resource,units}，供Scheduler与7.29唯一usage派生器共用构造语义；索引逐覆盖/域检查取消与软deadline，不计work，不发布未完成索引。默认请求收费和行为不变。resource_units_exceeded沿原progress→coverage→assessment传播，后续步骤仍prior_step_blocked，后置域沿原dependency_blocked，不新增第二套阻碍映射或改变Timer/模型成本。

7.29的usage row追加可选peakUnits：仅对应资源maxUnits非0或domainUnits非空时存在（即便未使用也为0）；值为已发布使用波中各entry所属控制器单元需求之和的最大值。仍随整波与全部uses/汇总一起提交；不按内存数或短步骤时长加权，不含波前等待。未启用单元声明的旧资源不输出该字段，其默认单元峰值等于原peakControllers。7.30的delta追加可选peakUnits：仅原status=compared且参考/本项至少一方有单元声明时存在，采用各自peakUnits或旧资源的peakControllers作本项减参考，自参考为0；缺失/域不同/partial仍禁止整个delta。容量和单元覆盖是配置条件而非资源身份，不改变原name/域集合匹配规则。单元峰值≤1024×10^12=1024000000000000<2^53，signed delta安全落int64，不引入浮点百分比或能量。

schedule资源定义/阻碍枚举、coverage原因以及usage/usage-comparison的可选字段共四份Schema扩展，输入/config等沿原引用消费。默认请求及所有不含新声明的旧输出/work保持；新字段/原因需新严格reader，旧reader拒绝，不承诺双向兼容。C++聚合布局扩展需消费者重编，无ABI保证；Core/protocol/web/IPC/SDK/UI/工程格式/依赖不变。仍为声明条件下的调度与资源预留，不生成MBIST控制RTL或作物理签核。

### 7.32 共享测试资源的不可用时段

MemoryScheduleResource追加unavailableIntervals（默认空数组），每项{startPicoseconds,endPicoseconds}为相对计时原点0的半开区间[start,end)，精确整数0≤start<end≤2^53−1。每资源最多1024项，总计最多4096项；必须按start升序且不重叠（前end≤后start，相邻允许）。重复、逆序、重叠和反向区间拒绝，不隐式排序。原资源域成员确定适用范围，无使用者不约束波。统一资源解析/API验证在查询前完成，取消优先，沿原严格字段/文件限制；CLI沿原resources/test-config入口，无新模式。request仅非空输出原顺序区间，显式[]归一省略。

原Scheduler容量/功耗/单元/依赖、步骤和波分组均不变；仅Timer让完整使用波[start,start+duration)避开所有使用资源的所有不可用区间。包括overhead及短成员屏障等待，容量或单元有余仍不能使用处于不可用时段的资源。先按7.26/28计算恢复和依赖ready的最大baseline，再求≥baseline的最早整波空隙；不拆波、不重排控制器、不自动优化资源声明。波结束恰等于区间start，或波开始等于区间end，均可使用。

Timer仅对有区间的资源建域反向索引，逐域检查取消/软deadline，不计work。每entry按原时钟/恢复/依赖处理后，按原资源顺序登记本波首次遇到的有区间资源，每个额外1work；同波共享一次，后续波重计，即便未发生等待也收费。随后将这些资源区间按(start,原resource索引,原interval索引)小顶堆合并，每资源至多一个待访问项。若堆首start<当前候选end，则弹出并额外1work，过期或已不相交项同样收费；若该区间end>当前start则将start推进至其end并记录原索引见证；再放入该资源下一项。start单调前进，已消费区间不会重新冲突。堆首start≥候选end即结束，不消费/收费；每波从各资源首项开始，无跨波游标隐藏状态。堆最多1024项、每波访问最多4096区间。集体合并阶段的stop无entry，登记阶段保留entry。逐步检查取消/deadline、start+duration的uint64溢出，最终maxDuration仍包含所有等待；失败沿原duration_overflow/duration_limit/budget_work/budget_time。候选结束前最终检查，全部资源/依赖结束、usedClocks、等待/成员汇总只随完整波原子发布。

原resourceWait和dependencyWait归因保持，新增可选availabilityWait={durationPicoseconds,intervals:[{resource,interval}]}仅最终start>baseline时存在。duration为新增等待，发布字段及其Schema范围为精确整数1..2^53−1（仍受最终累计maxDuration约束），不沿用resourceWait/dependencyWait各自10^12的上限。索引引用原schedule.request.resources及其unavailableIntervals；见证按堆访问顺序仅含实际严格推进start的区间，不列过期、不相交或被前面跳跃覆盖的区间。三等待之和恰为波开始减前波结束，无重计。timeline追加availabilityWaitPicoseconds，为已发布新增等待之和，JSON仅非0输出。coverage/assessment沿原计时消费新成员时段；usage仍仅计wave.duration，不把任何波前等待算占用。

comparison metrics追加同名汇总，非0写出；delta在原comparable且参考/本项至少一方该汇总非0时写有符号本项减参考，自参考写0，partial省整个delta。总量≤已发布总时长≤2^53−1，差值安全落int64。资源占用比较身份仍name/域集合，时段是配置条件而非身份。schedule资源定义、timing和comparison三份严格Schema扩展，其他Schema沿原引用消费。默认无区间时旧work/输出保持；新字段需新版reader，旧reader明确拒绝。C++聚合新增字段需消费者重编，无ABI保证；Core/IPC/SDK/UI/工程格式和依赖不变。仅实现显式条件下可用性规划，不推物理资源安全或生成MBIST控制RTL。

### 7.33 共享测试资源的分区归属

MemoryScheduleResource追加partitions（默认空数组）：[]/省略表示所有测试partition；非空时只有controller.clockDomain属于clockDomains且controller.partition精确命中列表，才使用该资源。允许空字符串表示7.11原空partition，故[""]与[]含义不同；不解析路径、glob或从RTL猜物理分区。每资源最多1024项、总分区项最多4096，每项有效UTF8/无NUL/≤4096字节，唯一，允许空，计入原资源16MiB字符串总量。域/单元声明仍按原规则验证，不因未匹配而放过非法资源。独立resources文件和test-config同一解析验证、先查询前验证与预取消；仅非空输出原顺序partitions，显式[]归一省略，无新CLI模式。

同一权威资源索引保存domain→按原声明顺序的{resource,units}和每资源分区集合；不展开域×分区笛卡尔积。构造逐项检查取消/软deadline，不计work，未完整构建不得执行阶段。Scheduler、Timer、usage共用该索引及匹配谓词。逐entry/候选先按域找到资源，再逐资源检查取消/deadline和分区匹配；不匹配不计资源work、不预留数量/功耗/单元、不阻碍、不更新恢复状态、不参与不可用时段和usage。原entry work保持。匹配后原计费、声明顺序、单步拒绝优先级、整波提交和预算截断均保持。Timer仍先恢复、再依赖、再可用性；同波多控制器只要有一个匹配就按原规则预留整个使用波、恢复/可用性各只计一次资源。后续不匹配波的时间可消耗先前恢复间隔，但不更新该资源last-end。依赖仍为全域before→after，不因本字段隐式变成分区依赖。

usage.rows继续包含所有资源声明；uses只记录同时满足域与分区的entry，峰值功耗/控制器/单元仅计这些成员。资源被至少一个成员使用时仍占整个波的duration，未匹配则0/空uses。重叠资源各按自身分区声明独立计入；原controller.partition为唯一归属权威，报告不复制成员或新增物理推断。coverage/assessment沿原步骤和时间线，默认行为与收费不变。

7.30的资源比较身份细化为精确name、clockDomains无序集合、partitions无序集合，空集合表示通配而非空字符串成员。优先级为missing_resource→reference_missing→domain_mismatch→新增partition_mismatch→partial→compared；只有compared有delta。分区不同即便当前观察成员相同、usage为0或上游partial也标partition_mismatch，不把不可比值差当优化收益。分区顺序不同不影响身份，缺失原resource索引和零使用含义保持。capacity/power/units/recovery/calendar仍是可变化条件，不加入身份。

schedule资源定义与usage-comparison状态两份Schema扩展，所有派生沿原引用承接；严格结构不能替代跨字段/字节语义验证。默认无分区过滤的旧work/输出保持，新字段/状态需新版reader，旧reader拒绝；C++资源DTO追加字段及状态枚举扩展要求消费者重编，无ABI承诺。Core/protocol/IPC/SDK/UI/工程格式/生产依赖不变；这是声明的测试partition归属，不推UPF、物理电源岛或可执行MBIST RTL。

### 7.34 按测试分区限定域先后依赖

MemoryScheduleDependency追加beforePartitions/afterPartitions（默认空数组）。前置/后置各自以原before/after域精确匹配，再按对应非空列表匹配controller.partition；省略/[]为所有分区，[""]仅空分区。字符串是显式标签，不解析路径/glob。每侧最多1024项，全部边两侧总计最多4096项；每项有效UTF8、无NUL、≤4096字节，允许空，计入依赖原16MiB总字符串预算，同侧唯一。前后域对相同但选择集合不同的多条边允许；before/after及两侧无序集合相同即重复，gap差异不豁免。保留7.25域级有向无环限制：所有声明先于查询验证，分区不相交也不能声明同域自边/域环；不引入分区级循环推断。

Scheduler对每条依赖维护匹配前置控制器的total/remaining/blocked；包括已发布计划中的空步骤控制器（完成），不猜未观察内存。只有匹配after侧的候选受该边约束，匹配前置为空为dependency_unavailable，任一匹配前置受阻为dependency_blocked，引用原依赖索引；其它同域分区不传播阻碍。原声明顺序决定首个确定阻碍，pending不掩盖后续确定失败。所有匹配前置全部完成后，匹配后置才可进入后续波；同波不提前看候选完成状态。上游partial仍保持，已发布前缀不升级为全设计完成。

Timer对正gap的每条边记录匹配before侧的最后已发布波屏障；只有匹配after侧的entry检查该gap，同波同边只计一次原work。其它前置域分区的后续波可以消耗等待，但不刷新该边结束时间；多边ready取最大，原恢复→依赖新增等待→日历新增等待归因不变，等待见证继续原边索引。没有匹配的后置不收费/等待。调度、计时的work按原匹配依赖规则，过滤不匹配不额外收费；空选择列表时全部原行为/work/输出保持。

Scheduler和Timer共用按before/after域反查及两侧集合的依赖索引，不展开控制器×依赖或前后分区笛卡尔积。索引构建、逐匹配及整波状态增量准备均检查取消/软deadline，不计work；不完整索引不得执行，任何预算/取消失败不发布候选波、阻碍、前置计数、gap结束或等待汇总。完整波与其匹配状态一起提交。coverage/usage/assessment及各比较沿原唯一计划/时间线消费，不复制匹配或调度规则。

独立dependencies文件及test-config沿同一解析/验证。schedule.request.dependencies仅非空输出两侧数组，保留输入顺序，显式[]归一省略；一份schedule Schema扩展，下游沿原引用承接。新字段须新版严格reader，旧无字段文档保持；C++聚合布局变化需消费者重编，无ABI保证。Core/IPC/SDK/UI/工程格式和依赖不变，无持久化迁移。此为声明条件下的测试顺序，不承诺同域分区排序、最优调度、物理安全或可执行MBIST RTL。

### 7.35 按测试分区声明时钟周期

MemoryTestClock追加partitions（默认空数组）。每个clockDomain可有一个省略/[]的域默认周期，以及若干非空分区选择声明；controller.partition精确命中非空列表时优先使用该声明，否则使用域默认周期，无二者则沿原clock_missing停止候选整波。声明顺序不影响选择，原MemoryTimedEntry.clock仍引用输入clocks索引；unusedClocks仅依据已发布完整波，未提交候选和被覆盖的默认周期不算使用。允许[""]选择空分区，不解析路径/glob，不从RTL推断频率。调度分组、资源/依赖归属保持，改变周期只改变实际计时及其下游覆盖/占用/评估/比较。

同域最多一个默认声明，非空选择列表在同域内必须互不相交，同列表重复也拒绝，即使周期相同；不同域可重复分区标签。保留每周期1..10^12ps、最多10000个声明。每声明最多1024分区项、所有声明总计最多4096项，每项有效UTF8、无NUL、≤4096字节，允许空，域名与分区名合计≤16MiB。未使用声明也全部先验证；预取消优先。域→默认索引/分区索引是歧义检查与运行匹配的同一内部表示，不展开控制器×声明。构建检查取消；Timer构建还检查独立软deadline，不计work，未完成索引不执行计时。原entry每次1work、溢出/时长预算、资源恢复→依赖→可用性等待及整波提交保持；没有匹配周期不发布候选entries、usedClocks、等待或结束状态。

配置timing.clocks[]接受可选partitions；writer仅非空输出原数组顺序，显式[]归一省略。一份timing Schema扩展，下游配置及七类报告沿原引用消费；跨声明重叠与UTF8字节总量仍由输入/API验证。CLI原--test-clock DOMAIN PERIOD_PS保留默认含义，新增可重复--test-partition-clock DOMAIN PARTITION PERIOD_PS创建单分区声明（空参数允许）。沿原timing选项阶段要求及与test-config/比较配置互斥，全部参数先于Design.open验证，不新增报告模式。

旧无选择配置、输出、work及错误保持；重复默认域仍拒绝。新字段/flag需要新版reader，旧reader明确拒绝；C++聚合追加字段要求静态消费者重编，不承诺ABI兼容。Core/protocol/IPC/SDK/UI/工程格式及依赖不变，无持久化迁移。这里表达用户声明的测试周期条件，不表示同一物理时钟能同时产生不同频率，也不生成时钟切换逻辑或可执行MBIST RTL。

### 7.36 Wrapper 边界逐位结构调查

`analysis/wrapper/Boundary.h` 提供 `investigateBoundary(Design&, BoundaryRequest, Cancel)`，
消费公开 ports/resolvePath/instance/step，以指定实例的端口为封闭边界，沿组合依赖和
层级绑定到首个寄存器或结构终点。每个 input 位向内部 forward，每个 output 位向内部
backward，inout 每位依次 forward/backward；位号是 Core 展平位空间，不是声明下标。
可用 ports 精确名字集合选择；空集合为全部，输出保持 Core 端口顺序、位升序。
非法/重复名字先拒绝，合法但不存在的 scope/port 返回 NotFound。不按名字猜时钟/复位。

无 continuation 的上游 process 可另查原 proc：仅 complete 的根 const 表达式且已映射
write 覆盖查询位才作为 const，原查询保留在行 processes(step/hop/response)；其他情况 partial。
结果拥有 snapshot/scope/request/选中 ports、unsupportedPorts、rows 和计数/完整性。
每行保存 port 下标、bit、upstream、原始 step 页（point/QueryResult）、终点引用
（kind/step/hop/可选 continuation）和完整性/hasConservative。register 向前终点保留
每个 continuation 的 data/clock/control/async 角色；向后在寄存器输出停，不越过寄存器追输入。
原 step 的 from/next 位范围、map、fact、via 保持，终点引用仅在所在行解释。
边界由本 scope 的 port ref 与 hop.via 识别（from.ref 不等于 via，以免把起点误作终点），嵌套 scope 同样停止，不沿父侧网线扩散；
嵌套边界的 pin 位若 Core hop 未给出，不推算或伪造。共享 body 的 occurrence 保持独立。

遍历按 step 页/hop/continuation 原顺序深度优先，每行按 point(ref,bits,side) 去重；
活动栈再次命中为 cycle/partial，已完成节点合流不当循环。遇寄存器、边界、常量、
unconnected 停止；blackbox/primitive/unresolved/未知 hop 或不符合上述常量条件的无依赖 process
保留原证据并 partial。无 hop 的点记录 dangling 终点（仅 step，不带 hop）。Core 非预算
partial、保守依赖均不升级；hasConservative 表示实际页或 continuation 的保守精度，
保守关系仍可结构遍历，行标 partial。interface/multi/未知方向/零位宽端口不虚造位行，
放 unsupportedPorts 并 partial。结构传播不做常量剪枝、布尔可满足性或状态值求解。

每行 summary 仅供导航：完整行的终点全是寄存器 data/输出为 register，只有 clock/control/async
为 control，只有边界为 boundary，只有常量为 constant，只有 unconnected 为 unconnected，
只有 dangling 为 dangling，其他组合为 mixed；任何 partial 行为 unknown。它不是 wrapper
共享/专用/免插入决策，不是功能路径、时钟物理域或 DFT 安全证明。summary 汇总终点角色，
沿途组合条件仍由原 step 保留，不把它解释成端口只具备该一种用途。

BoundaryLimits 默认 maxPorts=10000、maxBits=10000（方向行数）、maxWork=1000000、
maxDepth=64、maxMillis=30000、pageSize=64；上限依次100000/100000/10000000/256/60000/1000，
全部至少1。work 为每个检查的选中端口、每个候选行、每个 step 调用、每个 hop、每个
continuation 各1；为无依赖 process 查询原 proc、扫描每个 write/exprMap 段亦各1；scope/ports 查询和输入验证不计 work。时间从 scope 查询前起算，
maxPorts 检查在选中端口集合建成后，最多提交前 maxPorts 端口及其行。
maxBits/work/time/depth 中止时丢弃当前半行及证据，保留完整行前缀、已消耗 work、stop
（reason/可选 port/bit/upstream），complete=false；深度从端口 point=0，depth>=maxDepth
不再查询。未知语义只使该行 partial，继续后续行；预算停止整个调查。取消优先参数检查，
所有遍历检查点与 Core 查询透传 token，返回 Cancelled 错误，无半成功报告；返回值在
Design/request 销毁后有效。整端口向量、单 Core 调用、编译/排序为软预算边界，非硬内存/时间。

新增 `dft-wrapper --top TOP --scope INSTANCE [--port NAME] FILE...`，支持原 -f/-F/-I/-D
输入约定和上述六限额。仅新增 `rtl-wrapper-boundary-v1`/formatVersion1 严格 Schema，
新增封装严格拒绝未知字段，引用的 Core 事实仍遵循原 Schema 的字段扩展规则。
原所有分析算法/Schema/CLI 不改；0 正常，--require-complete partial4，参数2、设计/目标3、
内部/写出5、取消130。新增 C++ 库可静态链接，不保证新 ABI 稳定；无 IPC/TS/UI/持久化变更。

### 7.37 显式 Wrapper 单元建议与寄存器位资源统计

`analysis/wrapper/CellPlan.h` 的 `planWrapperCells(Design&, CellPlanRequest, Cancel)`
先验证声明，再仅调用一次7.36调查，随后计算逐位方向行的wrapper建议。结果含完整原始
`source: BoundaryReport` 和拥有型 `plan`；不接收可伪造的外部调查结果，不解析opaque ref。
这是一份结构候选方案，不生成插入RTL、不认证扫描寄存器/时序/测试模式/物理可测试性。

请求包含boundary、policy（maxInputCandidates默认4、maxOutputCandidates默认1，各1..1000000）、
rules和limits。每条规则是精确port名字、direction=input/output/both、action=exclude/dedicated/share，
可选bits（Core展平lsb/width，省略为全端口）。最多10000条；port非空有效UTF8无NUL且≤4096bytes，
名称总量≤1MiB；bits.width>0，lsb/width/末端均≤MAX_SAFE_INTEGER。同名规则的方向集合与位区间
不得同时相交，省略bits与任意范围相交；无关/未用规则也先校验，预取消优先。
对已调查选中端口，显式bits必须在实际width内，否则BadRequest；调查因maxPorts没保留或未选择
的端口规则不猜测存在性，保留unusedRules，plan partial。只有匹配已提交行的规则算used，
未匹配任何已提交行的规则均列原始索引并置unused_rule；不静默忽略名字/方向拼错。

候选来自该原始行的register_data continuation目标Slice或register_output hop.from。
按状态signal ref归组，位范围求并（相交/相邻合并），不按register fact去重、不逐位展开。
每组保留原terminal下标和规范ranges、bits数；共享body的不同occurrence不合并。
同一位被多个过程事实/路径引用只计一次；候选总数为不同state signal位的并集基数。
行内candidates按signal字典序、ranges按lsb升序；sharedSignals按首次选用顺序、rows按提交顺序。
原始row/step/hop/continuation保留为解释依据。计数用安全整数并检查溢出。

逐行规则优先级：显式exclude → excluded；显式dedicated → dedicated；其余自动或share请求
先要求原行complete且无conservative，否则blocked/evidence_partial。任何clock/control/async
寄存器用途得到blocked/control_usage，任何process或binding continuation非data/非exact/
非bitwise以及register_data非exact/非bitwise得到blocked/non_data_path（自动和显式share均如此）。其余终点只有
register_data/register_output且至少一个候选才可共享；候选数在对应输入/输出阈值内为
shared_candidate，超过阈值默认dedicated/candidate_limit，显式share则blocked/candidate_limit。
非寄存器终点或无候选默认dedicated/no_register_candidate，显式share则blocked/no_register_candidate。
混合寄存器与边界/常量终点不当作纯共享候选。优先级中control_usage先于non_data_path；
summary不用于证明。exclude/dedicated规则仍保留原候选证据及source partial，不升级源质量。

每行含sourceRow、可选rule、decision/reason、candidates及candidateBits。
plan按已提交行给出inputRows/outputRows/excluded/dedicated/sharedCandidate/blocked、
sharedCandidateBits（逐行候选数之和）、uniqueSharedBits（所有shared_candidate行按signal位并集）、
addedCells（dedicated方向行数）。sharedSignals提供规范signal/ranges/bits及引用的plan rows。
inout两方向分别计proposal，不能把addedCells当实际物理单元数或优化合并后的扫描规模。
plan.complete要求source完整、所有source行处理完成、无blocked且所有规则被使用；原source
partial、blocked、unused_rule分别给出原因。显式声明的排除/专用建议不消除source_partial。

规划限制maxRows默认10000/上限100000，maxWork默认1000000/上限10000000，maxMillis默认
30000/上限60000，均至少1。独立时间从原调查完成后开始；work为每个候选行、每条规则
匹配检查、每个terminal、每个扫描的hop/continuation、候选/全局合并在收集和归并两次扫描中，每个输入区间各1。范围检查/排序/规则索引建造/unused统计是软时间检查且不计work。
每行候选、used规则、计数和sharedSignals在同一提交点生效；maxRows/work/time中止丢弃
整个未提交行及其全局变更，保留已消耗work和已提交前缀，stop={reason,sourceRow}。
取消返回Cancelled错误而非半成功，确定性deadline走同一实现；不增加硬heap/time保证。

CLI新增`--plan-cells`及`--max-input-candidates N`/`--max-output-candidates N`、
`--cell-rule PORT input|output|both exclude|dedicated|share`、
`--cell-bit-rule PORT LSB WIDTH input|output|both exclude|dedicated|share`、
`--max-plan-rows/work/millis N`；相关选项没有--plan-cells时拒绝，静态错误在Design.open前拒绝。
原边界选择和预算沿用；新严格`rtl-wrapper-cell-plan-v1`/formatVersion1封装引用原Schema，
require-complete使用整体plan.complete，退出码政策保持。默认模式旧输出/错误保持；新标识和
选项需要新版reader，旧reader明确拒绝。新API与旧Boundary聚合布局隔离，不修改Core/IPC/TS/
工程持久化或依赖；不承诺新增ABI稳定。

### 7.38 显式 Wrapper 逻辑链组织

`ChainPlan.h`提供`planWrapperChains(Design&, ChainPlanRequest, Cancel)`；先校验完整声明，
仅调用一次7.37的planWrapperCells，拥有原`source:CellPlanReport`与新增`layout`。
这是按声明组织结构候选的逻辑位置方案，不插入RTL、不推断扫描兼容、时钟域、锁存器兼容性或物理安全。
原Boundary/CellPlan API、布局和Schema不改。

请求含cells（原CellPlanRequest）、chains（1..1024条{name,capacity}，名称唯一，capacity为
1..MAX_SAFE_INTEGER）、assignments（最多10000条{port,direction,可选bits,chain}）及可选
非空defaultChain。链名/端口名为非空有效UTF8无NUL、各≤4096bytes，链名及所有引用/端口名
总量≤1MiB。所有chain引用必须指向声明，defaultChain亦然；不默默创建链。同port匹配规则的
方向/位区间不得重叠，沿7.37验证，即使未使用也拒绝。选中端口显式范围越界BadRequest，
未选/源截断未保留端口的规则不猜存在性；匹配已提交行才消费assignment，unused原索引使partial。
链未使用本身合法。显式规则优先defaultChain，无两者的可用行blocked/unassigned。

按source.plan.rows顺序组织，行内依7.37候选signal/ranges顺序。excluded→excluded；
原blocked→blocked/source_blocked；其余dedicated/shared_candidate需有目标链。dedicated每方向行
新增长度1的专用逻辑段；shared_candidate的所有候选signal位均需组织，不任意选择一个候选。
同一实际state signal位在同一链已存在时复用原位置，不重复收费；首次出现的未占用区间追加到链尾，
区间内位号升序对应位置升序。不同occurrence ref不合并。若任一位已在另一链，整行blocked/chain_conflict，
不迁移、不复制状态位，也不消耗容量；先命中的冲突随遍历顺序确定。不会为链长度平衡自动改派。
共享候选区间使用有序不相交索引，不按位展开，既有段不移动/合并，以保持已发布位置。

每链保留声明顺序与name/capacity/length/segments。每段含kind=dedicated/shared、offset、length、
首次分配的sourceRow；shared另含signal/bits（bits.width=length）。连续新片段按遍历顺序追加，
同一新段不得超声明容量；若全行新增长度将超剩余容量，整行blocked/capacity，继续下一行。
行含sourceRow（source.plan.rows索引）、可选assignment与chain下标、status/reason、newBits/reusedBits
及uses[{segment,offset,width}]；segment引用该行chain中的段，offset为段内偏移，width为使用长度。
通过该段可追溯signal位或专用源行及链位置。成功行status=placed/reason=allocated；排除行为
excluded/excluded；上述阻碍为blocked。非placed行uses空、newBits/reusedBits均0，不发布半个行映射。
assignment匹配可用于excluded/blocked行，仍算已使用；defaultChain不消耗assignment。

layout计数为已提交rows/placed/excluded/blocked，dedicatedBits/sharedBits为实际新增段长度，
reusedBits为各placed行复用位数之和，totalBits为全部链length之和（dedicatedBits+sharedBits）。
链可包含输入/输出方向，但同一状态位只能归一链；此约束不证明物理测试模式能共享。
complete要求source.plan.complete、所有源行处理、无blocked/unused以及无预算停止；source_partial、
blocked_row、unused_assignment和预算原因分别保留。源质量不因所有可用行已放置而升级。

ChainLimits默认maxRows=10000/maxSegments=10000/maxWork=1000000/maxMillis=30000，
上限依次100000/100000/10000000/60000，均至少1。独立时间从CellPlan完成后起算。
work为每处理一行、每检查一条assignment、每个候选范围、每个新或已占用片段各1；dedicated
新增段亦为片段。索引查找、输入范围检查/unused统计和最终汇总为软时间/取消检查，不计work。
每一行的segments/位置/计数/assignment使用在共同提交点生效。maxRows/work/time或新片段将超
maxSegments（全局段数）停止整个组织，丢弃本行全部暂存及映射、保留已耗work与完整行前缀；
stop={reason:budget_rows|budget_segments|budget_work|budget_time,sourceRow}。片段预算在暂存新段前检查，
因此可能先于整行容量判断停止。取消返回Cancelled无半报告，预取消优先输入错误；确定性deadline
走同一实现。编译/单Core提取/输入排序仍是软预算边界，不保证硬heap/time。

CLI新`--plan-chains`（与--plan-cells显式标志互斥，但可用其policy/rules/预算选项），
`--chain NAME CAPACITY`、`--chain-default NAME`、`--chain-port PORT input|output|both CHAIN`、
`--chain-bits PORT LSB WIDTH input|output|both CHAIN`及`--max-chain-rows/segments/work/millis N`。
链选项无--plan-chains时拒绝，静态错误先于Design.open；原边界及cell选项继续传给原实现。
新增严格`rtl-wrapper-chain-plan-v1`/formatVersion1封装引用原CellPlan/Boundary/Core Schema，
require-complete看layout.complete，退出政策不变。新flag/算法需新版reader；旧模式输出/错误保持、
help有意扩展。新增API静态消费者需重编，不承诺ABI稳定；无Core/IPC/TS/UI/工程格式或新依赖变化。

### 7.39 Wrapper 分析配置输入

`WrapperConfigInput.h`新增`WrapperConfig = variant<BoundaryRequest,CellPlanRequest,ChainPlanRequest>`，
`parseWrapperConfig(string_view, Cancel)`及`loadWrapperConfig(filesystem::path, Cancel)`返回
Result<WrapperConfig>。拥有原请求类型，无第二份策略表示；解析不打开Design或执行分析，
成功值可直接传给7.36/7.37/7.38原入口。预取消优先语法/参数/文件错误，取消返回Cancelled，
格式/文件/静态语义错误返回BadRequest；解析过程中不保留输入借用。原分析API与输出不变。

新输入封装formatVersion=1、kind="wrapper-config"，mode为boundary/cells/chains，必填boundary；
boundary含必填scope，可选ports/limits，均为原BoundaryRequest字段。mode=boundary禁止planning/chaining；
mode=cells可选planning、禁止chaining；mode=chains可选planning、必须chaining。
planning含可选policy/rules/limits，对应原CellPlanRequest；rule必填port/direction/action，可选bits。
chaining必填chains声明数组，可选assignments/defaultChain/limits，对应原ChainPlanRequest；
assignment必填port/direction/chain，可选bits。声明必填name/capacity，bits必填lsb/width。
不允许未知字段、null代省略、重复键（包括转义同名键）或未知枚举；缺省使用原请求默认值。
mode是唯一阶段选择，不允许隐式从有无字段猜测。JSON整数按精确数学值读取，允许1.0/1e0，
不经double舍入；所有值必须为非负安全整数，再用原完整请求validator检查范围、重叠、引用、
名称字节数与总量。无关/unused声明同样校验，scope/port存在性及实际位宽仍由原分析查询检查。

输入限1MiB原始UTF8字节（含空白）；严格解码、重复键/深度政策复用Core JsonDecode。
文件必须为可读普通文件，符号链接指向普通文件可用；拒目录/FIFO/缺失/空路径/NUL路径，
按块读并执行相同字节上限及取消检查。不支持include、环境替换、相对RTL路径或自动文件搜索。
读取前文件类型检查与打开不是原子安全事务，正常本地文件输入适用；不宣称硬IO期限。
新`wrapper-config.schema.json`封装严格，类型/局部范围/模式关联可机验；名称UTF8字节上限、
总字节量、区间末端/交叠/引用等跨项语义由原validator执行，不声称Schema单独证明全部语义。

CLI新增`--config FILE`，配置决定scope/ports/阶段/全部分析策略与预算，禁止同时出现任何
对应手工选项（即使同值，按出现判定），包括--scope/--port/六调查限额、--plan-cells/
--plan-chains及cell/chain选项。--top、RTL/-f/-F/-I/-D与--require-complete仍由CLI提供；
它们不存入配置，工作目录和原文件列表路径约定不变。配置与参数冲突、解析及完整静态验证
均在Design.open前拒绝；旧参数退出码、默认/单元/链报告、require-complete定义保持。
新选项须新版binary，旧reader拒绝；不新增输出算法版本，不把配置文件路径加进报告。
它是显式分析声明，不是会话恢复/工程持久化；不新增Core/IPC/TS/UI能力或依赖。

现有memory及wrapper输入共用analysis/input的有界JSON/文件读取内部实现；memory公开签名、
字段、错误文本及行为保持，专用语义各由自己的validator负责，无wrapper→memory依赖。

### 7.40 同一边界调查的 Wrapper 多方案比较

`ChainComparison.h`新增`compareWrapperChains(Design&, ChainComparisonRequest, Cancel)`及
`validateChainComparisonRequest`。请求含2..8条`configurations[{name,request:ChainPlanRequest}]`、
reference（默认索引0）和独立comparison limits。名称唯一、有效非空UTF8无NUL、≤4096bytes；
reference必须有效。先验证所有名称与完整原请求，所有BoundaryRequest的scope、ports顺序和六
limits必须逐值相同（包含解析后默认值），否则BadRequest，不能比较不同选择范围或调查预算。
预取消优先验证；仅调用一次7.36调查，随后用该原始事实及原7.37/7.38实现分别规划各配置。
不接收外部伪造report，不解析opaque ref，不修改单方案的排序、精度、规则或预算语义。

拥有型结果含一次完整`source:BoundaryReport`、原顺序configurations[{name,plan,layout}]、
reference、limits、complete/work/reasons、summaries和chains矩阵。各plan.sourceRow指共同source.rows，
各layout.sourceRow仍指本配置plan.rows；原结构和字段全部保留，不复制N份BoundaryReport。
同一Design直接调用原单方案API，在相同完整调查与未到软时限的条件下，plan/layout及原source相等。
动态实际端口位宽错误使整个调用失败；取消返回Cancelled，无半报告。报告在请求/Design销毁后有效。

每配置summary含configuration原索引、comparable和可选delta。只有参考及该配置layout.complete均为true
才comparable并给delta；否则无delta，不用partial前缀数字做差。delta为该配置减参考的有符号安全整数，
字段与ChainCounts相同：rows/placed/excluded/blocked/dedicatedBits/sharedBits/reusedBits/totalBits。
参考项在自身完整时差值全0；参考partial使所有summary和矩阵entry不可比较。单配置partial不阻止
其它两个完整配置比较。差值反映结构候选的逻辑资源数量，不是扫描质量、优化最优性或物理代价。

chains矩阵按参考链声明顺序，再按其余配置原顺序逐条加入首次见到的链名；按精确名称关联，
与声明下标无关。每行含name、可选referenceChain以及按配置原序的entries。每entry含configuration、
可选chain（本layout.chains索引）、presence=both/added/removed/absent（相对参考是否声明）和comparable；
comparable资格与summary一致，为true才给delta{capacity,length}。缺失链的capacity/length按0参与差值，
声明但未使用的链与缺失链用presence和索引区分；相同名称只是声明身份，不认证物理链等价。
可比较差值基于完整的原配置报告，即使矩阵因自身预算截断，已提交entry和summary差值仍有效。

独立limits默认maxChains=10000/maxWork=1000000/maxMillis=30000，上限100000/10000000/60000，
均至少1；矩阵时间从所有配置plan/layout生成后开始。work每候选链名行1、每配置entry1；
名称索引/summary/最终汇总不计work，但有软时间/取消检查。maxChains/work/time停止丢弃整条
未完成矩阵行，保留已提交前缀和耗work，stop={reason:budget_chains|budget_work|budget_time,chain:下一矩阵行索引}。
整体complete要求source完整、所有layout完整、矩阵全部提交且无stop；source_partial、configuration_partial
与预算原因分开记录。各原调查/单元/链预算独立、不会被comparison限额替代；排序/单次提取/编译仍为软边界。
确定性截止内部入口走同一矩阵实现，不承诺硬总耗时/内存。

CLI重复`--compare-chains NAME FILE`2..8次，FILE必须是7.39 mode=chains配置；可选
`--reference NAME`及`--max-comparison-chains/work/millis N`，这些选项无compare时拒绝。
该模式禁止--config和所有手工分析选项，允许原top/RTL/-f/-F/-I/-D/require-complete；
全部文件/名称/请求静态验证先于Design.open，不新增配置文件格式或文件include。
新增严格`rtl-wrapper-chain-comparison-v1`/formatVersion1报告Schema引用原Boundary/CellPlan/ChainPlan，
局部字段/差值存在关系由Schema校验，跨数组引用和算术由实现/回归核对。require-complete看整体complete，
旧退出码政策和三个单方案输出保持；新flag/算法需新版reader，无Core/IPC/TS/UI/工程存储或依赖变化。

### 7.41 Wrapper 逐位链覆盖与阻碍定位

`ChainCoverage.h`新增`inspectWrapperCoverage(Design&, ChainCoverageRequest, Cancel)`和
`validateChainCoverageRequest`。请求含原chains:ChainPlanRequest及独立limits；先完整校验后
仅调用一次7.38 planWrapperChains，拥有原source:ChainPlanReport和新增coverage，不接受外部报告。
原调查、单元、链输出及算法不变，不解析opaque ref或重新判定候选。不生成扫描RTL、不认证测试覆盖率。

覆盖按原BoundaryReport.rows顺序，每个已调查的端口位/方向最多一行，sourceRow指该原数组；
cellRow/chainRow仅在对应原行已发布时给出，分别引用source.source.plan.rows/source.layout.rows。
stage为planning/chaining，status为placed/excluded/blocked/pending，reason始终存在：
没有单元行→planning/pending/planning_not_reached；单元excluded或blocked→planning相应status及
原单元reason（即使链未处理，也保留该已知决定，不改为pending）；其它单元决策在链未到达时
→chaining/pending/chain_not_reached；有链行则沿原status/reason，placed为chaining/placed/allocated。
已有chainRow即保留索引，包括单元排除/阻碍行，但首要原因仍指原单元决定。
未调查的端口位、unsupported端口只留在原source，不伪造coverage行；原source partial始终保持。

placed行positions按原chainRow.uses顺序，每项含use（原uses索引）、chain（原layout.chains索引）、
segment（该链原segments索引）、kind、chainOffset=segment.offset+use.offset、width=use.width。
shared项另有signal（原segment.signal）和bits{lsb=segment.bits.lsb+use.offset,width=use.width}；
dedicated省略signal/bits。链位置是逻辑区间，不逐位展开；别名可指同一链位置，不能把它们算新增资源。
非placed行positions为空；原source中的candidate/terminal/rule/assignment仍可沿上述索引追溯。
原算法已保证位置/位区间的安全整数边界，转换使用检查加法，不允许环绕或浮点近似。

coverage含limits、complete/work/reasons、rows、counts及ports汇总，可选stop。
counts={rows,placed,excluded,blocked,pending,positions}只统计已提交覆盖行/位置数，不是链资源计数。
ports按首次已提交行出现顺序分组{port,upstream,counts}，port引用原BoundaryReport.ports；
同一inout端口的两个方向分开。每行全部positions、全局counts及对应端口counts在同一提交点生效。
complete要求原layout.complete且所有原边界行处理完成且无本阶段stop；否则保留source_partial
或budget_rows/positions/work/time原因。已知placed/excluded行不因其它位partial改写，整体质量不升级。

limits默认maxRows=10000/maxPositions=10000/maxWork=1000000/maxMillis=30000，上限依次
100000/100000/10000000/60000，均至少1。时间在原ChainPlan结束后独立起算。work每候选覆盖行1、
每placed use转换1；原行索引构造、port查找和最终汇总不计work，但检查软时间/取消。
行满只在下一原边界行到来时停止；位置满只在需要下一位置时停止，后续无位置行仍可提交。
预算中断丢弃整条候选行/positions/全部计数和新port组，保留先前完整前缀及已耗work；
stop={reason,sourceRow:下一原边界行索引}。预取消优先非法输入，取消返回Cancelled无半报告；
确定性deadline内部入口使用同一覆盖实现。上游各预算仍独立，不保证全链硬耗时或heap界限。

CLI新增`--chain-coverage`，仅配合手工`--plan-chains`或`--config`的chains模式；与--compare-chains/
--plan-cells/boundary配置互斥。`--max-coverage-rows/positions/work/millis N`无该flag时拒绝；
覆盖flag和限额不算手工规划参数，可叠加chains配置，其余原配置/手工互斥规则不变。
全部静态验证在Design.open前。新增严格rtl-wrapper-chain-coverage-v1/formatVersion1报告Schema
引用原ChainPlan；require-complete看coverage.complete，旧模式默认/错误/输出不变，help有意扩展。
新增公共静态消费者需编译，不承诺ABI；无新配置格式、Core/IPC/TS/UI/工程存储或生产依赖。

### 7.42 Wrapper 链共享状态的功能时钟检查

新增`ChainClocks.h`的`inspectWrapperChainClocks(Design&,ChainClockRequest,Cancel)`和静态验证。
请求包含原chains及独立limits；校验后调用一次原planWrapperChains，报告拥有原source和clocks。
仅检查已分配segment的共享状态功能时钟，不改链布局/候选、不插入RTL，不证明scan/test时钟、
CDC、锁存器、复位、门控测试可控性或物理时序。专用单元没有现存RTL功能时钟，明确标为dedicated。

按原链顺序、链内segment顺序生成rows{chain,segment,status,reason,matches,groups}。共享segment
通过Design.object取得所属实例，用Design.registers(nonrecursive)按页读取该实例寄存器事实；
实例缓存仅在本调用内复用。保留pages{inst,response}完整查询回复。只匹配相同signal及相交位区间，
matches{page,fact,bits,check?,group?}索引原页items，bits为精确交集。必须完整查询所有该实例事实，
且匹配区间恰好覆盖segment、无重叠，才能检查时钟；否则unresolved/register_facts_partial、
register_gap或register_overlap，不从前缀作唯一性结论。无逐位展开，不解析opaque ref。

每个受支持事件要求非空signal、单bit、posedge/negedge；通过object识别port并置side=inside，
复用sequential SourceLogic真实RTL求解，无外部时钟根/常量假设。checks{event,status,reason,proof?,group?}
按完整事件(signal,bits,edge,type)缓存；JSON event使用Core ClockEvent形状，不输出async type。只接受primary_input且origin/sourceRef单bit，反相奇偶修正
事件边沿。groups{point,sourceRef,edge}按(sourceRef,origin bit,effective edge)合并，point保留实际源。
其它事件/常量/悬空/组合生成/歧义/预算深度不足均unresolved，保留原proof；不把未知来源合并。
同一segment所有匹配均resolved时，groups一个→resolved/single_clock，多个→mixed/mixed_clocks；
否则unresolved/clock_unresolved，可保留已知groups。专用row为dedicated/clock_not_in_rtl、空matches/groups。

每条原链都有summary{chain,processedSegments,resolvedBits,unresolvedBits,dedicatedBits,groups,status}，
计数仅纳入已提交行，groups为这些行的已知组，排序按首次遇到；不重复计算链别名引用。
status优先mixed_clock(已知至少两组，即使还未知)，否则有未知/未处理segment→unresolved，
否则单已知组→single_clock，否则有专用位→dedicated_only，否则empty。
single_clock仅指已分配共享状态；dedicatedBits仍提示专用时钟需后续定义。全局complete继承原layout，
并要求所有segment处理且无unresolved；mixed是确定的分析结果，不自动使complete=false。
原partial始终保留source_partial；未知行追加clock_unresolved。require-complete只判断完整性，不判断混钟可接受性。

limits默认maxRows=10000/maxRegisters=10000/maxWork=1000000/maxDepth=64/maxMillis=30000/pageSize=64，
上限依次100000/100000/10000000/256/60000/1000，均正整数。阶段时间在原链结束后起算。
work对每候选segment、object查询、register页查询、每页事实索引、每匹配检查各1；SourceLogic沿用其
工作量并共享maxWork/截止；roots与汇总不计work但检查取消/软时间。maxRegisters限制已取得事实总数，
恰好满且无next可完成；需要新实例/下一页时停止。maxRows只在下一segment需要发布时判定。
预算stop={reason,chain,segment}指下一未提交segment，原因budget_rows/registers/work/time。
整行matches/groups/链计数在检查点提交；已耗work和已完整取得的pages/checks/groups可保留为观察证据，
不等于该行已发布，summary只从发布行计算。未发布行不会贡献资源计数。取消优先静态验证，返回Cancelled
不返回半报告；同一实现提供确定性deadline内部入口。缓存/区间排序和单次Core查询为软边界，非硬heap/耗时保证。

CLI新增--chain-clocks，支持原手工--plan-chains或chains配置，互斥--chain-coverage/--compare-chains。
--max-clock-rows/registers/work/depth/millis、--clock-page-size无该flag拒绝；这些附加选项不算手工规划，
静态校验先于open。严格rtl-wrapper-chain-clocks-v1/formatVersion1 Schema引用原链、Core事实及既有LogicProof。
原命令/API/DTO/Schema/配置v1保持；新增API静态消费者需重编，不承诺ABI。复用现有analysis/sequential库，
没有第三方新依赖、Core/IPC/TS/UI/存储格式修改。本单元A实现和自测后交既有协调器独立B/C，不冒称已验收。

### 7.43 Wrapper 链共享状态异步控制保持约束

新增`ChainResets.h`的`inspectWrapperChainResets(Design&,ChainResetRequest,Cancel)`及验证函数。
请求含clock:ChainClockRequest和独立limits；验证后仅调用一次7.42，拥有原source:ChainClockReport，
复用其完整寄存器页与匹配，不再次枚举寄存器，不接受外部报告、不改变规划。读取RegisterInfo.async，
分析现存共享状态异步reset/set的非激活条件；不覆盖同步复位、clock gating、test模式或物理时序。

按原ChainPlan的全部已分配segment顺序生成rows，含chain/segment、可选sourceRow(7.42 rows索引)、
complete/status/reason、events和holds。上游未检查该segment→pending/clock_analysis_not_reached；
dedicated→dedicated/control_not_in_rtl；上游register_facts_partial/gap/overlap→unresolved并保留原reason。
其它行使用上游精确matches，即使功能时钟未解析也继续分析异步事件，不把clock未知推成reset未知。
events每项{match,event,check}指source.clocks.rows[sourceRow].matches及其原寄存器async索引，
按match、async原顺序排列。全局checks{event,status,reason,proof?,input?,high?}缓存完整事件身份。

支持非空signal、单bit、posedge/negedge且type=reset/set的事件。按object识别port侧inside，调用既有
SourceLogic，无外部常量/根假设。primary_input且源单bit时记录inputs{point,sourceRef}，按(ref,bit)合并；
check=resolved/primary_input，高电平要求high=(event.edge==negedge) XOR (inversions为奇数)，即将
原事件保持非激活。high=false表示要求该顶层输入为0。检查保持原async type，包括set，与事件事实关联。
二值constant按求解后的最终值判断：与原事件非激活值(edge==negedge)相同→inactive/constant_inactive，
否则asserted/constant_asserted；X/Z、generated/gated/undriven/unsupported等均unresolved，保留proof。
只有resolved给出input/high；不会把未知源当成同一个输入。专用单元不虚构reset要求。

holds={input,low,high}按首次已知输入顺序累积，low/high可同时true表示矛盾；不输出单一“推荐电平”
覆盖冲突。row状态优先asserted(任一恒定激活)、conflict(同input要求两电平)、unresolved(任一未知事件)、
hold(有输入约束)、clear(无输入要求且全部已知非激活)。clear原因为no_async_controls或constant_inactive；
hold/conflict/asserted/unresolved原因为inactive_inputs/conflicting_levels/constant_asserted/control_unresolved。
已知asserted/conflict不能掩盖未知事件，row.complete仍为false。pending/匹配失败complete=false，dedicated=true。
无async仅证明已知寄存器事实没有异步控制，不证明没有同步复位。

每条原链有summary{chain,processedSegments,complete,clearBits,holdBits,conflictBits,assertedBits,
unresolvedBits,pendingBits,dedicatedBits,holds,status}；位计数按已提交row状态计原segment.length，别名只计一次。
summary.holds合并该链已提交行，跨segment相反要求也形成conflict；conflictBits仅是行内冲突位数，
不能当作跨行受影响位总量。status优先asserted→任一行冲突或holds矛盾的conflict→未处理/不完整的unresolved
→hold→有clearBits的clear→dedicated_only→empty。summary.complete仅表达该链已分配segment的异步证据；
全局resets.complete额外继承source.clocks.complete，保留source_partial。冲突/恒定激活是明确结论，
不自动降低完整性；未知行追加control_unresolved。require-complete只检完整性，不充作通过判决。
各链约束独立，不假定不同链同时测试或合并成全设计测试协议。

limits默认maxRows=10000/maxEvents=100000/maxWork=1000000/maxDepth=64/maxMillis=30000，
上限100000/1000000/10000000/256/60000，均正整数。阶段在原时钟检查后起算。每候选segment、
每match扫描、每事件引用、每新object查询各耗1work；SourceLogic共享work/deadline，深度不足保留未知。
maxEvents统计已访问事件引用（不是唯一check），预算中断保留该访问计数/已耗work；成功行才计入链汇总。
事件预算满后仍可提交无事件行；事件/工作/时间中断丢弃整条候选row/events/holds及汇总变更，
已完整获取的checks/inputs作为观察证据可保留。stop={reason,chain,segment}为下一未提交segment，
reason=budget_rows/events/work/time；chain允许等于链数表示末尾时间检查。缓存、汇总和Core单次查询为软预算。
预取消优先静态错误，取消返回Cancelled无报告；内部确定性deadline入口复用同一实现。

CLI新增--chain-resets，配手工--plan-chains或chains配置；与--chain-clocks/coverage/comparison互斥。
原clock限额允许单独配resets以限定上游阶段；新增--max-reset-rows/events/work/depth/millis无resets拒绝。
静态验证先于open，配置v1不变。严格rtl-wrapper-chain-resets-v1/formatVersion1 Schema引用原ClockReport、
AsyncEvent与LogicProof，跨数组身份/布尔约束由实现和回归核对。原API/DTO/Schema/默认输出不变，
仅扩展CLI/CMake并增加wrapper消费者；复用现有sequential，无Core/IPC/TS/UI/工程存储/第三方新依赖。
新增静态消费者需重编，不承诺ABI；本批7.42/7.43尚待协调器统一独立B/C复验。

### 7.44 Wrapper 链功能控制兼容性

新增ChainCompatibility.h的inspectWrapperChainCompatibility/validateChainCompatibilityRequest。
请求含resets:ChainResetRequest、groups:[{name,chains:[原链名]}]及独立limits；验证后只调用一次7.43，
拥有完整source:ChainResetReport。仅比较已分配状态的功能时钟/异步非激活条件，不更改规划或原证明。
判据固定为single_functional_clock：一个活动集合内须只有一个已知输入位/有效边沿，且所有异步控制
可保持非激活、没有任何功能时钟输入被要求固定电平。这是明确的分析策略，不声称多时钟设计本身非法，
不证明scan时钟、test模式、物理时序、同步复位或RTL插入安全。

groups为空时按原链顺序各建一个同名独立集合，不默认所有链同时活动；非空时仅分析声明集合。
同一原链可在不同集合复用，但同集合链名唯一；集合名唯一，成员非空、全部引用已声明链。
最多1024集合、总16384成员；名称规则沿原chain（非空、UTF8、无NUL、每项至4096字节），
显式集合名和成员名总字节至1MiB。无论预算是否访问到均静态验证，先于Design.open；预取消优先错误。

compatibility.groups保留{name,chains:[原链索引]}，rows按集合顺序完整前缀发布。
row={group,complete,status,allocatedSharedBits,allocatedDedicatedBits,clockGroups,holds,heldClocks,reasons}：
位数为成员原segment.length库存（并非已解析位数），成员仅计一次；clockGroups为原source.source.clocks.groups索引，
holds复用7.43的{input,low,high}、input引用source.resets.inputs；均按成员及原证据首次遇见顺序合并。
heldClocks={clockGroup,input}按clockGroups顺序给出同一ref+bit既是功能时钟又被holds固定的证据，不论要求低/高均冲突。
只使用原已提交clock/reset链汇总，不把上游未提交check/input/group观察项计入约束；不解析opaque ref。

reasons顺序固定：constant_asserted、conflicting_levels、held_clock、mixed_clocks、clock_unresolved、
reset_unresolved、dedicated_controls_undefined，仅输出实际存在项。前四项任一→status=conflict；
没有冲突但任一后三项→unresolved；都无且原已分配位数为0→empty，否则compatible。
constant_asserted来自原成员reset.assertedBits；conflicting_levels来自原成员行内冲突或合并holds两极；
mixed_clocks指至少两个原功能时钟组；clock_unresolved指成员clock已提交段数不足或unresolvedBits>0；
reset_unresolved指成员reset.complete=false；专用位控制尚无RTL定义，dedicated_controls_undefined。
row.complete仅要求后三项均无，已知冲突不掩盖未知；原全局source partial不自动污染其它集合的局部完整性。
全局complete继承source.resets.complete，并要求全部集合发布且各row.complete；reasons为source_partial、
control_unresolved及预算原因。counts按已提交行状态计groups/compatible/conflict/unresolved/empty。
完整conflict是证据完整而非通过；require-complete只看全局完整性。

limits默认maxGroups=1024/maxWork=1000000/maxMillis=30000，上限1024/10000000/60000，均正数。
阶段在7.43后起算，每候选group、每成员、每原segment库存项、每clockGroup引用、每hold引用、每时钟/保持
身份比对各耗1work；合并/索引和单次原查询为软预算。中断整行及counts不发布，已耗work保留；
stop={reason,group:下一未提交集合索引}，reason=budget_groups/work/time，group可等于集合数表示末尾时间检查。
取消返回Cancelled无半报告；内部确定性deadline入口复用生产实现。原各阶段独立预算，不承诺硬总时限/heap。

CLI新增--chain-compatibility，配原手工plan-chains或chains配置；重复--compatibility-group NAME CHAIN
按首次NAME出现顺序组织集合，再按出现顺序添加成员；组/成员重复和未知引用按上述规则拒绝。
--max-compatibility-groups/work/millis限定新阶段，原clock/reset预算可用于上游，无需显式两个模式flag。
与显式chain-clocks/resets/coverage及comparison互斥，配置v1不增加字段。新严格
rtl-wrapper-chain-compatibility-v1/formatVersion1 Schema引用原ResetReport；旧API/DTO/Schema/默认输出保持。
仅CLI/CMake扩展及analysis/wrapper新增模块，无Core/IPC/TS/UI/工程存储/新依赖，新增静态消费者重编、无ABI承诺。
7.42–44的独立验收状态以REVIEW_LOG最新固定条目为准，A自测不当独立验收。

### 7.45 Wrapper 自动功能活动批次

新增ChainActivityPlanRequest/Report、planWrapperChainActivity/validateChainActivityPlanRequest。
请求resets:ChainResetRequest、inspection:ChainCompatibilityLimits和limits:ChainActivityPlanLimits。
验证后只调用一次7.44的默认单链模式（groups为空），拥有完整source:ChainCompatibilityReport。
按原链声明顺序做first-fit：仅已提交、complete且status=compatible的单链可纳入批次。
对每个已有批次依次先检查容量，再用7.44同一个内部集合评价函数检查合并成员；首个compatible批次接纳。
都不合适则创建新批次。批次内顺序为原链顺序、批次顺序为创建顺序；每链最多归属一个批次。
不优化最少批次数，不重新分配/拆分链，不改变原布局；batch是可能同时满足功能控制要求的集合，不是测试时间表。

activity.rows按原链顺序完整前缀发布，含chain、status、可选sourceRow和batch。
已有singleton结果的sourceRow指向source.compatibility.rows；未提交原结果为pending且省略sourceRow。
已知conflict保留conflict（即使该证据同时不完整），unresolved保留，empty不纳入批次。
compatible但其allocatedSharedBits超过每批位容量为oversized；其余成功纳入为assigned并带batch索引。
activity.batches含chains（原链索引）、sharedBits、clockGroup、holds（原input索引及low/high），
内容与该成员集合的7.44完整compatible行一致。只消费已提交上游证据；中断不发布候选批次、行或计数。
counts记录chains/assigned/conflict/unresolved/empty/oversized/pending和assignedSharedBits，只累计已提交行。
全局complete继承source.compatibility.complete，且本阶段所有链处理完成；已知conflict/oversized不使证据不完整。
reasons为source_partial及预算原因；complete不意味着所有链可安排，require-complete只检查完整性。

limits默认maxBatches=1024/maxChainsPerBatch=1024/maxSharedBitsPerBatch=9007199254740991/
maxWork=1000000/maxMillis=30000，上限分别1024/1024/9007199254740991/10000000/60000，均正整数。
上游inspection、clock/reset/chain等预算独立保留，所有静态请求先于Design打开验证；预取消优先。
新阶段在原报告后起算；每候选链、每已有批次容量检查耗1work，合并及新批次评价按7.44的单组work逐项计入。
同一候选链的尝试成本即使中止仍保留；整链行、目标批次及counts在最后检查点一起提交。
新批次超过maxBatches停止，不跳过当前链；即使达到批次数上限，后续链仍可加入已有批次或发布不参与行。
stop={reason,chain:下一未提交原链索引}，budget_batches/work/time；末尾时间检查chain可等于原链数。
取消返回Cancelled，不返回半报告。内部确定性deadline入口走同一生产实现，单次查询/索引/拷贝仍为软预算。

CLI --plan-activity配原--plan-chains或chains配置；--max-activity-batches/chains/bits/work/millis设置新限额。
原--max-compatibility-*作为上游inspection预算可用，--compatibility-group不适用；与所有其他显式报告模式互斥。
新rtl-wrapper-chain-activity-v1/formatVersion1严格Schema引用原兼容报告。旧输出/API/Schema/配置v1保持；
抽取7.44内部单组评价以保证同一判据，无Core/IPC/TS/UI/工程格式/依赖变化，新静态消费者需重编。
本能力仅single_functional_clock策略，未知/专用控制不升级，不认证scan/test/物理时序或RTL插入。

### 7.46 Wrapper 功能活动脉冲时序

新增ChainActivityScheduleRequest/Report、scheduleWrapperChainActivity/validateChainActivityScheduleRequest。
请求activity:ChainActivityPlanRequest、pulse:{setupTicks=1,highTicks=1,lowTicks=1,pulses=1}和独立limits。
验证后只调用一次7.45，拥有完整source:ChainActivityPlanReport；只为原已提交activity.batches按顺序生成时序，不再次调查或重排链。
所有时间为显式抽象tick，不换算Hz/ns，不推定端口可实际驱动、状态隔离或任意非目标状态安全。
setupTicks可为0，其余pulse字段正数，均至9007199254740991；period=highTicks+lowTicks、
duration=setupTicks+pulses*period必须精确在该safe整数范围，否则BadRequest先于Design打开。

每行row={batch,start,end,firstEdge,lastEdge,lastReturn,clockGroup,idleHigh,activeHigh,activeTicks,idleTicks,holds}。
clockGroup指向原source.source.source.source.clocks.groups，holds={input,high}指向原reset.inputs；
输入位/ref、有效边沿均在原证据中，不解析opaque ref。原批次compatible保证holds恰有一个电平。
有效posedge的idleHigh=false/activeHigh=true，negedge相反；activeTicks取activeHigh对应的high/lowTicks，idleTicks取另一值。
在start设置时钟idle及全部holds；建立setupTicks后，每次先变active，保持activeTicks后返回idle，保持idleTicks，再重复。
第k个目标边沿=firstEdge+k*period（k=0..pulses-1），firstEdge=start+setupTicks；
lastEdge=firstEdge+(pulses-1)*period，lastReturn=lastEdge+activeTicks，end=start+duration。
holds在整个[start,end]保持；行尾时钟处于idle。下一批start=上一行end，第一行start=0。
边界同tick时前一批结束、再建立当前批输入；不承诺切换时非目标状态不改变。
报告只保留压缩重复参数，不按pulses展开。源码有效边沿已包含反相，不再次反转。

schedule={pulse,periodTicks,batchTicks,limits,complete,work,reasons,rows,counts,stop?}。
counts={batches,chains,sharedBits,elapsedTicks}只累计已提交行，elapsedTicks为最后end、空计划为0。
上游即使不完整也可对其已提交批次给出局部时序，但complete继承source.activity.complete，reasons含source_partial。
完整conflict/oversized等上游排除仍保留在source中；schedule.complete不意味着所有链可用或激励功能正确。

limits默认maxRows=1024/maxTicks=9007199254740991/maxWork=1000000/maxMillis=30000，
上限分别1024/9007199254740991/10000000/60000，均正数。新阶段在7.45后起算，
每候选batch、每原成员链、每原hold各耗1work，时序/holds/counts整行在最后检查点一起发布。
maxRows或maxTicks不足时停止于下一未提交batch；maxTicks是时间容量，优先级为time检查→rows→ticks→work，
即使单行duration超过maxTicks也返回有原source的空partial，不在静态校验拒绝。work保留已耗成本。
stop={reason,batch}，budget_rows/ticks/work/time；最后时间检查batch可等于原批次数。
取消返回Cancelled无半报告，静态预取消优先；内部确定性deadline复用同一实现。借用只限同步栈，结果拥有证据。
软预算不保证硬总耗时/heap、任意中途取消或并发安全。

CLI --schedule-activity配原手工--plan-chains或chains配置；--pulse-setup/high/low/count设置pulse。
--max-schedule-rows/ticks/work/millis限制新阶段。原activity/compatibility/clock/reset限额可用于上游，
但显式--plan-activity/chain-compatibility/resets/clocks/coverage/comparison模式与新模式互斥，compatibility-group不适用。
没有schedule模式的pulse/schedule参数拒绝；配置v1不增加字段。新rtl-wrapper-activity-schedule-v1/formatVersion1
严格Schema引用原活动报告。旧API/DTO/Schema/默认输出保持，仅CLI/CMake接入和新增wrapper模块，
无Core/IPC/TS/UI/工程格式/第三方依赖修改，新增静态消费者重编、无ABI承诺。

### 7.47 Wrapper 现有检查的可读诊断与声明定位出口

本节收口既有检查，不增加新的DFT规划判据。历史S2-*分析计划名不等同Studio产品S2放行；
Wrapper是Studio路线S3 Scan的分析后端，memory为S4后端。本工程的CLI出口与Studio宿主接线、计划保存/失效、生成产物分别验收。
当前切片出口为chains输入→已有兼容检查→可读阻碍→真实声明位置→修改约束后复验；达到后停止本批能力追加。

新增ChainExplanationRequest/Report、explainWrapperChains/validateChainExplanationRequest。
请求resets:ChainResetRequest、inspection:ChainCompatibilityLimits及独立limits；只调用一次7.44默认单链模式，拥有完整source。
按原layout.chains顺序生成rows，含chain、status、controlsComplete、reasons、可选compatibilityRow及segments。
有已提交兼容行则直接保留状态/完整性/原因；无行则pending/false/compatibility_not_reached，不从观察项推结论。
每段记录segment、boundaryRow、portLocation、可选stateLocation/clockRow/resetRow；
segment.sourceRow指向原cell plan行，再取sourceRow指向boundary行，端口名/ref/bit/方向在原boundary中。
clockRow/resetRow来自已提交原行，完整索引可用时保留，未处理时省略；不复制或改判clock/reset原因。

locations按首次访问ref去重，调用Design.source(ref,Definition)，含ref及span或error二选一。
NotFound/Unsupported作为显式不可用定位保留并令完整性partial；其他错误（含取消）传播，不伪造位置。
SourceSpan为快照内声明位置和contentHash，不读取磁盘新文本，不冒充写入语句或自动修复。
缓存定位可在候选链中断时保留为观察；只统计完整发布的链/段，不把这些定位当兼容结论。

limits默认maxChains=1024/maxSegments=10000/maxLocations=10000/maxWork=1000000/maxMillis=30000，
上限1024/100000/100000/10000000/60000，均正数。新阶段在原报告后起算；
每已提交clock/reset索引行、每候选链、每segment、每唯一定位查询各1work；索引中断stop.chain=0。
每链及其全部segments/counts在最后检查点一起发布，中断保留已耗work/定位缓存但丢弃候选链。
stop={reason,chain}，budget_chains/segments/locations/work/time；末尾时间检查chain可等于原链数。
counts={chains,segments,compatible,conflict,unresolved,empty,pending}仅计已发布链，status不代表自动修复可行。
complete继承source.compatibility.complete，并要求所有链发布且所查定位均可用；reasons为source_partial/location_unavailable及预算原因。
局部controlsComplete独立于全局源/位置完整性。预取消优先静态错误，内部确定性deadline复用生产实现；软预算不保证硬总时限/heap。

writeChainExplanation JSON为rtl-wrapper-chain-explanation-v1/formatVersion1，新严格Schema引用原兼容报告及SourceSpan。
formatChainExplanation返回人可读文本：scope/快照/完整性、各上游阶段完整性/预算原因、每链状态/原因、每段端口/状态声明、原clock/reset行状态和检查原因、clock/保持条件。
所有名称/路径/消息用原JsonWriter字符串转义后呈现，避免换行/控制字节破坏诊断行；text非机器稳定协议。
CLI新增--explain-chains及--format json|text（默认json，仅该模式支持）；错误仍沿原JSON/退出码，require-complete仍只看完整性。
--max-explain-chains/segments/locations/work/millis限制新阶段，原compatibility/clock/reset预算用于上游。
其他显式模式及compatibility-group互斥，配置v1不增加字段。旧API/DTO/writer/Schema/默认输出保持，
仅CLI/CMake接入及新增wrapper诊断模块，无Core/IPC/TS/UI/工程格式/依赖修改，新增静态消费者需重编、无ABI承诺。

### 7.48 Wrapper CLI 可安装交付入口

沿7.47既有CLI出口补标准安装/搬移运行，不新增规划算法或Studio接线。
HIER_BUILD_ANALYSIS=ON时，analysis提供CMake安装组件WrapperCLI：bin/dft-wrapper（按平台带可执行后缀）、
share/dft-wrapper内的schemas/wrapper全部原Schema、schemas/sequential/logic-report.schema.json、
schemas/protocol/hier.schema.json、examples、README、THIRD_PARTY_NOTICES、verify.py及manifest.json。
GNUInstallDirs bin/data目录可改为无..、无绝对路径的相对目录；不向Core公共库或其他组件添加安装承诺。
先拒绝原值中的parent traversal、绝对路径、驱动前缀及控制字符，再对允许的./、内部./、重复/末尾分隔符作词法规范化。
安装DESTINATION与清单采用相同规范相对路径；`.`表示prefix根目录，生成文件路径不得残留./或重复分隔符。
目标名展开后payload与executable列表再次统一规范化并排序，文件种类不能因路径表示不同而丢失；verify对手工非规范清单仍严格拒绝。
manifest为wrapper-cli-manifest-v1，formatVersion=1、kind=dft-wrapper-install、configuration/system/processor/sanitized元数据，
files按相对POSIX路径排序，含path/bytes/sha256/kind（executable/data），不包含清单自身、绝对构建路径或生成时刻。
它是本地字节完整性清单，不是来源签名/公证或全局身份验证，不扫描/管理同prefix其他软件的文件。

verify.py --prefix PREFIX从脚本相邻manifest读取，仅stdlib Python。完整校验静态结构、UTF8/重复key、相对路径、
非负精确整数/小写SHA256、唯一文件名、常规文件/父路径及内容hash，POSIX可执行文件须可运行。
不得跟随组件payload的symlink或通过..跳出prefix，不修改安装树；明确失败且非零，不尝试修复。
清单至2MiB、最多4096文件、单路径至4096字节。格式严格版本1，不静默接受未知字段/版本。

bundle.py --build BUILD --output FILE.tar.gz [--config CONFIG] [--cmake CMAKE]调用标准cmake --install --component WrapperCLI，
先安装临时空prefix并调用同一verify校验，再按清单及manifest生成相对路径tar.gz，保留原生可执行权限。
输出必须不存在，归档在输出父目录的临时文件完成后无覆盖发布；失败不发布半归档、不删除已有目标。
发行归档拒绝manifest.sanitized=true，开发者仍可cmake install测试sanitizer本机组件。
工具不自行编译、下载或创建工作会话；临时资源用RAII风格上下文回收。单机普通filesystem错误处理不承诺恶意并发路径切换安全。

原生CLI不依赖Python或源码/构建目录。包只承诺构建目标平台/架构及该平台系统运行库；第三方声明随包保留，
不宣称跨平台通用或所有非系统动态依赖自动打包。生产/开发构建来源由构建者负责，manifest记录CMake构建元数据。
旧公开API/CLI参数/默认JSON/Schema/配置v1不变；仅analysis CMake新增安装与打包入口和材料，不扩Core/IPC/TS/UI/工程格式。

### 7.49 已有原生 Analysis CLI 套件交付

沿7.47–48的既有能力交付出口，新增CMake组件AnalysisCLI，不增加领域判据或相邻规划算法。
bin内含dft-seqcheck/dft-objects/dft-memory/dft-wrapper，share/dft-analysis内含全部原sequential/objects/memory/wrapper报告及输入Schema、
protocol引用依赖、四工具示例、README、原第三方声明和共享verify/bundle。Schema保持原URI，离线registry不能依赖网络回补。
共享CMake安装函数/模板生成独立数据树与清单，原WrapperCLI组件、share/dft-wrapper、文件集合和v1格式保持。
两个组件可共用同一prefix的原生工具，各自清单独立；更新构建后须重装所需组件并复验，不自动刷新另一组件的清单。

套件清单为analysis-cli-manifest-v1、formatVersion=1、kind=dft-analysis-install；其余字段、精确数值/路径/hash/上界规则沿7.48。
同一verify严格接受原Wrapper格式/种类配对（一个原生工具）或套件格式/种类配对；套件必须恰有四个executable，
basename去掉平台.exe后恰为四命令名，数量正确但名称错误亦拒绝。未知/混配格式、版本、字段、缺失/修改/链接均非零JSON错误且不写回。
新增套件安装Schema不改原Schema；字节清单仍不是签名、来源认证或恶意并发filesystem安全保证。

bundle新增可选--component WrapperCLI|AnalysisCLI，默认WrapperCLI保留旧调用。
先标准临时组件安装、用共享verify核字节和格式，再核manifest.kind对应请求组件，不能把另一合法组件当套件发布。
AnalysisCLI同样拒绝sanitizer发行，输出不覆盖和临时资源清理沿7.48；不编译、下载或创建工作会话。
四工具示例仅调用原CLI：时序事实、对象过滤、显式模型/测试配置的内存规划时序、Wrapper已知冲突及排除后复验。
模型成本/功能是显式输入，不因示例输出完整就推断真实RAM、scan插入或物理时序通过。

全部原C++实现/公开头/API/ABI、CLI分析参数/默认JSON/退出码、报告/输入Schema及配置版本保持；无Core/IPC/TS/UI/工程格式/依赖变化。
本机原平台/架构和系统运行库限制沿7.48，Python只用于可选校验和归档。Studio接线/保存失效/生成产物仍单独交付。

### 7.50 四个原生命令的报告文件导出

沿既有CLI出口增加可选前缀 `TOOL --output FILE -- ORIGINAL_ARGS`，覆盖dft-seqcheck/objects/memory/wrapper。
仅在argv[1]精确为--output时识别，必须有FILE、分隔符--和后续原参数；不扫描或改写原参数中的字面--output值。
无前缀仍调用原入口；help追加导出用法，version字节保持。单独help/version不能作为报告导出。
该能力只保存原writer/Wrapper text的原字节，不改变报告Schema、查询、领域判据或执行次数，不增加工程/会话存储格式。

先核前缀和UTF8非空文件路径，再核父目录存在且是目录、目标不存在（普通文件/目录/符号链接均拒绝），不创建父目录。
使用同父唯一私有临时目录捕获同步CLI stdout，写入并关闭完整文件后，用hard link无覆盖发布；目标发布后移除临时名字。
不使用可覆盖rename降级；文件系统不支持链接或发布前出现目标均output_failed/5，既有目标保持。
后端返回0/1/4时发布原报告且返回原码，stdout不再复制报告。1包括seq的fail-on-error，4仍代表partial，不升级为成功。
后端2/3/5/130等返回不发布目标，恢复控制台原错误字节及原退出码。输出I/O失败为output_failed/5，前缀语法/路径文本错误为invalid_arguments/2；
新层错误用原JsonWriter，seq保持无formatVersion错误外壳，其余三个工具沿原versioned错误结构。

公共输出层只在同步CLI栈借用Main/argv/stdout缓冲，以RAII恢复原流和回收自有临时文件/目录；不是多线程通用API，不改变原信号处理。
硬进程终止可能留下.dft-report-*临时目录；最终文件只在完整关闭后出现。无fsync/断电持久性、硬总时间/heap或恶意并发路径切换安全承诺。
仅在前缀模式增加文件I/O；原Core软预算不覆盖导出耗时。其他仓库、API/ABI、报告/输入Schema、配置、IPC/TS/UI/工程格式和第三方依赖不变。

### 7.51 既有 CLI 发行归档的字节复现

沿7.48–49共享bundle出口规范归档头，不新增组件、参数、清单格式或领域功能。
标准临时安装、严格verify、组件匹配及sanitizer拒绝仍在归档前执行；输出不存在、完整关闭后hard link无覆盖发布、失败清理保持。
tar成员恰为清单payload及清单自身，按规范POSIX名排序；显式构造常规文件头，mtime/uid/gid为0、uname/gname为空，
executable模式0755、data及manifest0644，不导入宿主的权限附加位、时间或用户PAX属性，Unicode/长路径用标准PAX表达。
gzip header不含随机临时文件名，mtime=0、压缩等级9。相同清单/payload字节及相同Python/tarfile/zlib工具链重复归档应逐字节一致。
不同压缩库/工具版本的压缩字节不保证相同；SHA变化不代表领域报告变化，旧归档仍可解包并用原verify校验。
原生可执行性与payload字节保持；不扩签名/来源认证、动态依赖、平台或恶意并发filesystem保证，API/ABI/报告Schema/配置/IPC/TS/UI/工程格式不变。

### 7.52 安装清单的文本生成边界

沿7.48–51修复生产者的文本输入边界；strict verify及清单字段/版本/文件集合保持。
目录及构建metadata须为合法Unicode scalar UTF8，拒绝C0/C1控制字符（U+0000–001F、007F–009F）。
NUL不能由OS argv或CMake字符串传入；不据不可达输入宣称执行覆盖。正常Unicode/组合序列/补充平面保留原字节，不作名称归一。
配置阶段检查bin/data、system/processor和单/多配置名称，路径原绝对/parent traversal/驱动/CMake语法字符拒绝及规范化保持。
生成Manifest脚本嵌入同一检查实现，JSON引用前再核实际configuration及全部字符串；不能安装成功后才靠verify发现非法JSON。
system/processor以hex数据嵌入脚本后还原，合法引号/反斜杠及CMake形式文本不改变脚本语义，JSON仍准确转义。
此前接受的控制字符和非法UTF8改为明确拒绝；旧合法安装树/归档仍可读取，不放宽消费者，无新增Python依赖或安装payload。
仅安装生成材料/输入边界变化，C++/API/ABI、原生CLI/报告Schema/配置文件/IPC/TS/UI/工程格式和依赖不变；不扩大恶意并发filesystem或跨平台保证。

### 7.53 已有分析 CLI 的 Node 宿主调用层

analysis/host独立提供无第三方运行时依赖的ESM包@dft-studio/native-analysis，不捆绑/下载原生程序。
NativeAnalysisHost构造接收必需绝对binaryDirectory，可选绝对cwd（默认捕获构造时process.cwd），
timeoutMs=30000、killGraceMs=250、maxStdoutBytes=16777216、maxStderrBytes=1048576。
timeoutMs为1至2147483647整数，grace为0至30000，输出各1至67108864；非法配置同步抛NativeAnalysisError/invalid_request。
run({tool,args,cwd?,format?,signal?,onStderr?})返回Promise；tool仅四个原basename，args为字符串数组，cwd可覆盖默认绝对目录。
路径/参数必须是无NUL的合法Unicode scalar字符串；请求和argv在run调用期间复制。空argv可以交后端原参数检查。
使用固定目录下的工具名（Windows加.exe），shell=false，stdin忽略；参数逐项原样传递，不扫描后续字面--output。
仅拒绝args[0]=--output，因为文件导出不返回stdout报告。format默认json，text仅Wrapper允许；不自动改写原生--format参数。

报告仅在直接子进程及其管道close后交付。结果含kind、tool、pid、原exitCode、format、payload及拥有的stdout/stderr字节。
0/1/4为kind=report，保留原码；2/3/5/130为kind=backend_error，始终按JSON读取原错误，不能因请求text而丢失原错误。
JSON须严格UTF8且为非null/非数组对象；text须严格UTF8。不去BOM或替换坏字节，不复制领域Schema/判据，应用按原Schema验证业务结果。
未知退出码、信号退出或无法启动分别失败；0不代表无冲突，4仍partial，host不发布/改写任务或设计会话状态。
NativeAnalysisError.code为invalid_request/disposed/cancelled/timeout/spawn_failed/process_failed/output_limit/output_invalid/output_io/callback_failed；
details保留可用tool/pid、原exitCode/signal和有界stdout/stderr，cause保留原异常。run的验证错误以rejected Promise返回。

signal预取消不spawn；已运行的取消/超时/超限/I/O或日志回调异常以首次观察到的终止原因优先，SIGTERM后grace内未close则SIGKILL。
onStderr同步按原chunk提供独立Uint8Array副本，用于实时日志；异常或返回Promise令调用失败，异步拒绝被观察，不传播到Node事件回调。超限只保留上限前缀并继续排空管道，stdout不流式发布半报告。
activeCount表示尚未close的自有调用；dispose幂等，先拒绝新run，再取消全部自有任务并等待close/监听器和计时器回收。完成后不再调用日志回调。
AbortSignal公开监听注册抛错以invalid_request收尾；若注册同步重入取消/dispose，返回后不得spawn，迟到或抛错前已注册的自有监听仍须移除。首次终止原因不被后续取得/释放异常覆盖。
取消到达close之前优先于报告发布；close后取消无效。独立调用的取消不影响其他调用；应用仍负责会话代际及过期结果丢弃。
只管理直接子进程，不提供任意子孙进程组、OS沙箱、硬总时限/heap、全局泄漏或来源认证保证；事件循环/回调阻塞会延迟计时器。
不新增Core NDJSON/IPC方法、领域算法、Studio页面或工程存储；旧C++/ABI、CLI/Schema/组件集合和SDK接口不变。

### 7.54 设计会话绑定与旧分析结果失效

同一Node包0.2.0新增NativeAnalysisSession(options)，options沿7.53；原NativeAnalysisHost接口/行为/根导出保持。
session初始empty。setDesign(input|null)返回Promise：input={designId,cwd,top,files?,filelists?,includeDirs?,defines?}，
designId/top为非空合法scalar无NUL字符串，cwd绝对；files/includeDirs/defines为字符串数组，filelists为{path,mode:'f'|'F'}数组。
files/filelists至少一项；相对文件/列表/include路径按cwd词法resolve为绝对原生参数，不作realpath、Unicode归一或源码读取。
先完整复制/验证再改变当前状态；输入拥有且深冻结。shared argv为--top TOP、files、各-f/-F、-I、-D，保持各数组顺序。
这只是四工具原打开参数的边界翻译；不解释分析选项、不复制DFT或原报告Schema判据。

sessionId在实例内固定；每次有效setDesign（即使相同designId/参数）生成新generation绑定，立即失效旧绑定/receipt，状态replacing。
取消旧Host全部调用并等待child/pipes close，之后创建使用该cwd的新Host，发布ready绑定；null清空为empty。
替换进行时新的setDesign/run明确replacing拒绝，不暗排队/后一次覆盖；无效输入不影响原ready会话。
dispose幂等，立即disposed并失效所有receipt，拒新工作，等待替换及全部直接child回收；替换中dispose不能激活新Host。
binding只在ready可取，activeCount包含替换中仍未close的旧Host，disposed/empty/ready/replacing状态是生命周期而非领域质量。

run沿7.53的tool/args/format/signal/onStderr，但不允许覆盖cwd；先快照原分析args，再以前缀拼共享argv交原Host。
共享参数和完整最终argv/cwd在receipt中记录；args由可信宿主提供，原生可接受额外输入，不能据会话标签声称实际编译与浏览Core相同。
原报告snapshotId/inputHash/完整性保持原事实，generation是应用意图身份，不替代编译快照/磁盘来源或持久任务ID。
返回深冻结元数据receipt={binding,request,result}；result沿7.53保留原拥有输出，不深冻字节/业务payload。
Promise成功交付前再核当前binding；换代/清空/关闭后的旧调用以NativeAnalysisSessionError/stale_result拒绝，保留旧binding和原result或异常cause。
当前会话的NativeAnalysisError仍原样传播；旧调用即使native已经返回、但Promise尚未发布，也不能成功进入新会话。
isCurrent(receipt)核本session的WeakSet品牌和当前绑定，伪造/其它session/旧generation均false；assertCurrent不通过时抛stale_result。
已交付后保存在应用中的receipt须在消费时再核当前性；本包不缓存历史，不伪称阻止应用直接读取旧对象。
NativeAnalysisSessionError.code为invalid_request/no_design/replacing/disposed/stale_result，保留可用binding/result/cause；构造非法options同步抛原Host错误，其余异步方法返回rejected Promise。
会话不发布或存储Studio任务/工程，不新增IPC/NDJSON/Schema；Studio RunService/设计重连接线仍须实际宿主单独交付，不造第二持久任务系统。

### 7.55 原报告验证与摘要核验的源码阅读

包0.3.0新增可选子路径/reports，导出AnalysisReportReader和AnalysisReportError；原根Host/Session接口保持。
reader=await AnalysisReportReader.open({schemaDirectory})，目录须绝对，读取原AnalysisCLI安装schemas全闭包及原URI，不联网/重写/复制Schema。
只读常规.schema.json，拒绝内部符号链接，最多256份/每份2MiB/总16MiB/目录深度8；严格UTF8对象、唯一$id，原protocol SourceSpan必需，缺引用/错误Schema明确失败。
Ajv8.17.1/ajv-formats3.0.1（MIT）执行原draft2020-12，禁coerce/default/remove，不重算领域判据；原根入口不加载该依赖。
两个直接及四个传递依赖按npm-shrinkwrap锁定后随包bundle，实际依赖/许可字节一并交付，不要求消费者缓存或联网解析传递版本。

reader.read(session,receipt,schemaId)同步核session.assertCurrent，schemaId必须来自receipt.tool对应的sequential/objects/memory/wrapper目录。
只接受JSON；复制原stdout后严格UTF8/JSON解析，再用所选原Schema验证，不信任调用者可变payload。
report退出0/1/4须有algorithm，backend_error退出2/3/5/130须有error；不把version JSON当分析、不从exit0推无冲突或把4升级complete。
只有formatVersion和algorithm两字段的原生版本封套以not_report拒绝，即使所选原Schema也认可Version分支。
上限stdout16MiB、遍历深度128/节点1000000、SourceSpan位置10000；超限明确失败，不静默截断报告。
返回品牌只读报告{binding,request,kind,exitCode,schemaId,bytes,sha256,payload,locations}，payload和位置深冻、原metadata保持。
locations为报告树中通过原protocol SourceSpan验证的对象，按文档先序给JSON pointer及原span；错误封套不提取源码位置。
isCurrent/assertCurrent核本reader品牌并委派原session/receipt当前性，伪造/其它reader/旧代拒绝；不持久缓存历史。

await reader.readSource(report,locationIndex,{contextLines=2,maxFileBytes=8388608,maxExcerptBytes=65536,signal?})只接受本reader当前报告的位置。
contextLines为0至100整数，文件1至64MiB，片段1至1MiB；预取消不读，异步检查点和发布前核取消与当前性，始终回收自有文件handle。
从原span.path一次打开常规文件，POSIX以NONBLOCK避免FIFO阻塞；跟随正常编译路径的文件别名，不承诺路径沙箱。
完整有界读取的同一份bytes计算SHA256并解码UTF8，摘要须精确等于原contentHash；不符source_changed，不以当前磁盘冒快照文本。
校验原byte offset顺序/范围/UTF8边界和行范围，以LF/CRLF保留原文本，按上下文行截取；超过片段预算失败，不冒完整片段。
起点按含LF的行区间[start,nextLineStart)归属，LF后首字节属于下一行；最后一行允许EOF起点，末尾LF之后有空末行。半开终点仍可等于声明行的nextLineStart或EOF。
返回{span,contentHash,firstLine,lastLine,text,selection:{start,end,unit:'utf16'}}，选择为片段内end-exclusive UTF16索引，原span/行列不改写或猜测。
文本/hash来自同一读取，不保证磁盘随后未变/读取中整体版本原子性；只有与原快照hash相符才成功，不提供写回/自动修复/硬总时间或heap保证。
AnalysisReportError.code为invalid_request/schema_invalid/unknown_schema/wrong_tool/json_required/not_report/report_invalid/report_limit/source_unavailable/source_changed/source_invalid/source_limit/cancelled/stale_result，保留message/cause/details；旧Session当前性错误原样传播。
新增Node消费边界，不改C++/ABI/原CLI/Schema、SDK/IPC/UI/工程格式/组件；Studio持久任务和页面接线仍另交付。

### 7.56 Studio 现有任务服务的原生分析入口

Studio新增analysis.native应用/CLI命令（analyze native），输入{projectFile,tool,schemaId,args}，tool为7.53四工具，args为原分析参数数组；CLI以--tool/--schema/--args-json传入。
只通过原ProjectWorkspace单写者和RunService执行、取消、关闭、发布、恢复及当前输入重跑；不增加第二任务/历史系统。
输入使用当前工程原filelist、f/F、工作目录、top及defines，传给原NativeAnalysisSession；完整最终argv和原生安装身份保存，不将绑定标签当编译来源认证。
独立固定Node包0.3.1和四CLI安装不替换旧浏览Core，安装清单的所有文件大小/hash及工具执行权限在调用前核验；原Schema闭包用于Reader验证。

新增StoredResult分支native.analysis，含原tool/schemaId/kind/exitCode、原stdout严格UTF8文本、原stderr base64和stdout SHA256；使用原16MiB产物上限/摘要/record发布点。
0/1/4均成功发布原报告；2/3/5/130产生failed任务，原backend_error封套保留在run.error.details.native且result=null，CLI返回原码，不冒领域通过。宿主失败/取消仍沿原失败/取消终态，不能挂旧结果。
只沿用原报告根quality（存在且结构受原Schema认可）；没有根质量时显示partial/native_quality_not_summarized，不重算嵌套领域判据。
仅沿用原根snapshot的inputHash及inputHashComplete；其它报告的记录身份为请求摘要且inputHashComplete=false，freshness始终unknown，不支持数值比较。
RunInput参数按新命令机器Schema复核，保存结果读回核原stdout摘要、工具/Schema/退出/参数与算法身份；历史阅读不要求原生可执行程序仍可运行，不暗重算历史。
run rerun仍必须--use-current，保留tool/schemaId/原分析args并使用当前工程和磁盘，保留旧结果；不宣称归档全部RTL或精确重放。

原stdout上限4MiB、stderr256KiB，native软超时60秒；外部取消监听在取得后、首个await前才发布任务所有权，注册失败/重入关闭或启动别的任务不能遗留job或绕过单任务限制。
宿主失败诊断中的有界stdout/stderr以stdoutBase64/stderrBase64保存，避免字节数组的JSON膨胀破坏16MiB任务文件预算；超限时仅为原前缀，不冒完整报告。
旧工程/RunRecord版本、旧ResultEnvelope/RegisterAnalysisResult与原CLI/IPC方法保持；StoredResult为追加联合（历史响应可含新分支），新命令先提供应用/CLI，既有Tasks能显示保存的原生历史。
新分析表单、历史源码专用阅读/修复交互、Tcl和Desktop启动入口未因此完成，不冒完整Studio S2/S3/S4验收。
Studio当前非Git工作目录：真实修改其源码；交付在Hierarchy固定可重放补丁、依赖包和前后源码摘要，不初始化新仓库，不改旧独立oracle。

### 7.57 历史原生报告、桌面启动与源码证据

Node包0.4.0为Reader追加readSaved({tool,kind,exitCode,stdout},schemaId)及readSavedSource(report,index,options)。
readSaved复制Uint8Array并沿原Schema/工具/退出/版本/深度/位置上限校验，返回独立品牌的只读{historical:true,freshness:'unknown',tool,kind,exitCode,schemaId,bytes,sha256,payload,locations}。
没有session binding/request；原isCurrent/assertCurrent不接受这种历史品牌，readSource也不接受；readSavedSource仅接受同reader历史品牌。
历史与当前读取共用一份Schema和源码范围/摘要/UTF8/资源回收逻辑；历史不判断当前设计，仅同一读取bytes匹配原SourceSpan.contentHash才返回。品牌/结构验证不是保存来源认证，也不是路径沙箱。

Studio的analysis.native.report只读命令(analyze report RUN)从原RunStore取成功native结果或明确backend_error封套，核保存摘要/输入后用readSaved重验原Schema；输出原payload和位置清单，不重算判据。
analysis.native.source(analyze source RUN --location N --expect-report-hash SHA)要求runId/报告SHA256/locationIndex及可选contextLines(0..100，默认2)。
server核当前保存报告摘要等于请求摘要，路径仅取其原位置；返回原span/摘要/上下文/UTF16半开选择。摘要不符或文件变化明确失败，不返回猜测文本；不写源码。
历史阅读只核固定Schema数据身份，不要求四CLI可执行程序仍存在；原任务存储和0.3.1历史字节不迁移，freshness仍unknown。

桌面analysis.native启动仍走RunService；共享基础profile仅映射四工具/原schemaId和scope/recursive/必要definition参数，另有显式高级JSON参数，不复制业务规则。
任务中提供原报告按需展开/分段显示、原位置索引及摘要核验的只读源码高亮。响应绑定runId/报告摘要与当前选择，切换任务/位置或卸载后迟到响应不能覆盖当前视图。
源码用原text按返回UTF16范围切片标记，保持CRLF/BOM/Unicode，不把浏览器textarea换行规范化后的偏移当作原偏移。
新增只读应用/CLI命令和严格Desktop方法/响应DTO，IPC不接受任意path/span/raw报告；运行、取消、重跑、保存/导出和旧结果入口保持。
错误/partial/exit1原义保持；输入或源码改动后用户用原当前输入重跑。新表单/证据阅读不等于自动修复、写RTL、Scan/MBIST编辑生成或完整Studio S2/S3/S4。

### 7.58 原生分析的真实 Tcl 批处理与控制台

在既有同一个BatchService、安全Tcl子解释器和RunService上，显式开放dft::analysis::native、dft::analysis::native::report/source及既有dft::run::rerun；CLI/application/GUI的任务和报告语义不另定义。
analysis.native的-tool/-schemaId为原字符串，-args是一个真实Tcl字符串列表，例如[list --scope chip_top --recursive]，不用JSON文本或Tcl源码仿真器。缺省args仍由原机器Schema决定，工具/Schema/参数/退出/有界诊断继续原生产处理。
类型描述只对原Schema显式string items且有安全整数maxItems的array增加string-list；原36入口的名字、标量类型、位置参数含义保持，不能把任意新增CLI自动加入Tcl。
私有桥由原生llength/foreach取得列表元素；count及每个UTF8元素的base64以冒号分隔，再沿原字段base64封装。count必须是规范十进制并匹配元素数、不得超过原Schema的maxItems；空列表与单个空字符串不同。Node只解协议帧，不解析或eval Tcl列表/JSON源码。原4MiB帧、1MiB脚本/输出、1000命令、软超时和finally清理边界保持；不提供Tcl堆硬上限或OS沙箱。

native启动和rerun均直接调用该BatchService借用的原RunService，立即返回实际runId；rerun必须显式-useCurrent true，可引用同工程历史，但只将新runId纳入当前脚本所有权。
wait/cancel仍仅接受当前脚本/控制台创建的新句柄；外部任务与旧父runId不因此获得取消/等待权。成功脚本join，失败/取消/关闭取消并排空所有所属任务，已发布历史不回滚、不另建任务账本。
原0/1/4仍为成功任务且保留原码；2/3/5/130为failed及原封套；wait返回原RunDetail，脚本必须检查任务状态/原码，脚本成功不等于领域通过。
report/source沿7.57历史服务，原报告SHA/索引/context/hash拒绝与unknown freshness保持，返回Tcl dict/list/原文字符串；源文本不进入eval，不写RTL。
通过原CLI batch/shell及工作台已保存脚本/Console共享实现；不增加IPC方法、工程/任务/脚本存储格式、C++/ABI/原Schema/Node0.4包或Tcl9.0.4运行时版本。三项native目录追加实际Tcl surface；run.rerun原已声明Tcl，本次才进入显式白名单。新能力不是完整S2/S3/S4或自动修复/生成。

### 7.59 从已保存原生分析生成可审阅的 Tcl 工作流

analysis.native.script（analyze script RUN，Tcl dft::analysis::native::script）只读取得原RunStore终态native任务及已核成员/摘要的provenance.json，按原NativeAnalysisArgs/nativeAnalysisOptions校验并拥有参数，生成确定的UTF8/LF Tcl脚本。
返回{formatVersion:1,runId,parameters,provenanceHash,inputMode:'current_project',freshness:'unknown',script,contentHash,bytes}；hash均沿Studio sha256:前缀，bytes为UTF8十进制字符串。没有已发布参数或非native任务明确拒绝；不调用原生程序，不宣称当前设计或来源签名。
脚本只复用保存的tool/schemaId/args，执行时使用当前所选工程/磁盘；不会把工程路径/原RTL快照写成精确重放。脚本使用局部apply作用域，立即取得原RunService新句柄并wait，打印原状态/退出；0/1/4保持成功任务原码，failed任务保留历史并显式报脚本错误，不推断领域通过。
每个参数按一个Tcl双引号字面词编码，转义反斜杠、双引号、$、方括号、brace和控制字符；没有用户文本拼进命令语法/注释/变量名。真实Tcl验证特殊字节往返，不使用安全child缺少的encoding，也不在Node解析Tcl或运行生成脚本。模板版本是当前生成规则，不承诺不同版本生成字节相同。

analysis.native.script.export（analyze export-script RUN）要求expectedScriptHash并重新生成/核匹配，沿原exportNewFile发布新文件；GUI只接受runId/摘要并走原生保存对话框，不收任意输出路径。取消对话框不写文件。
analysis.native.script.create（analyze save-script RUN）要求runId/expectedScriptHash、documentId、项目相对path和expectedHash，重新核脚本后调用原createDocument，创建并绑定text.tcl；成功后当前文档/工程和脚本列表可见，用户在原保存脚本入口显式执行。
原createDocument输入追加可选initialText（省略仍空文件），先拥有/验证UTF16和1MiB UTF8上限，再把完整bytes写入临时文件、sync并原排他发布、绑定；返回实际text/bytes/hash。原相对路径/父目录/禁止覆盖/绑定冲突/manifest冲突与已创建未绑定文件保留政策保持。新特定script.create IPC不接受raw脚本文本；Tcl控制台/批处理活动时仍拒修改工程。
两项写操作预取消仍拒绝，接受后沿原不可取消发布政策返回实际结果，不在发布完成后误报取消；读预览协作取消。创建/导出不会自动执行脚本或写RTL，不新增任务库/工程格式；新text.tcl使用既有绑定/文档模型，旧任务/文档无迁移。
旧DocumentCreateInput/Args/Desktop三定义为兼容可选扩展，其余旧定义/命令保持，新增专用DTO/CLI/IPC；只有只读script预览加入Tcl白名单。Node0.4/Tcl9.0.4/原native/Core/SDK与锁不升级，不作为全S2/S3/S4或自动修复验收。


### 7.60 已保存原生报告的有界结构比较

analysis.native.compare（analyze compare BASELINE CANDIDATE，Tcl dft::analysis::native::compare）仅调用7.57原保存报告校验，不启动工具、不读当前RTL或改写历史。返回formatVersion1、两侧runId/原裸reportSha256/tool/schemaId/kind/exitCode和原根quality.completeness（缺失unknown）、freshness unknown、inputIdentity/recordedDigestEqual，以及结构差异。
两侧tool/schemaId/kind及原payload.algorithm/version相同才eligible；否则reasons明确列出且不产差异。eligible只表示可以按同一结构查看，不证明指标、scope、单位或领域判据可比；partial和不同scope仍可结构查看，原值全部保留，不产numeric delta/pass/fail。
inputIdentity只在两原snapshot.inputHashComplete均true且各有合法inputHash时分类same_complete_digest/different_complete_digest，否则unknown；记录摘要相同也不推成当前fresh。

mode固定json_by_position；对象key按UTF16码元排序，数组只按原位置比较，不按名称猜配、不忽略snapshotId/openedAt或其它字段。RFC6901 pointer转义~/；added/removed/changed行两侧用null表达不存在，存在JSON null用type=null的值描述。每个值描述含对已解析值按JSON.stringify序列化后的UTF8 bytes、sha256:摘要、最多512bytes良构UTF8 preview及truncated；它不是原报告文本子串，不保留数字词法/空白，不把短预览当原值。原报告摘要仍对原stdout。替换容器类型或新增/删除整个分支只产生该路径一行。最多200差异、100000访问节点；固定DFS原子行前缀，complete/stopReason明确区分complete/change_limit/visit_limit/incompatible，完整且changes为空才是结构相同；partial输入与差异遍历完成分开。循环期间分批让出事件循环并检查取消，沿既有软资源边界，不作硬时间/heap保证。
comparisonHash为除自身字段外确定JSON的Studio sha256:摘要；所有原生报告身份经过原历史校验。analysis.native.compare.export（analyze export-comparison BASELINE CANDIDATE --expect-comparison-hash --output）重新生成/核hash，沿exportNewFile排他发布pretty JSON+LF；返回comparisonHash、实际文件contentHash/bytes/output。接受前取消拒绝，接受后沿原不可取消发布政策返回真实结果；GUI输出只走原生保存框，不接raw报告或任意输出path。
桌面在原Tasks结果中选择同工程native基线，显示两侧原退出/质量/摘要与输入身份、eligibility/截断及逐路径差异。选择差异时从两原locations中选同pointer/后代pointer；无位置时逐级查最近含原位置的非根祖先容器并明确显示该容器（边界按JSON pointer分隔符，不能误配前缀），不跳到其它行或无关全报告位置。位置每次显示100项，选择后沿原source服务读取两侧摘要匹配片段；无位置不猜。切换run/基线/比较/位置/卸载清旧响应与源码，迟到请求不得覆盖新选择；导出绑定当前comparisonHash，取消不写。旧run.compare/RunComparison、旧工程/任务/原报告Schema、Node0.4/Tcl9.0.4/依赖均保持，无存储迁移或新领域规则；新read命令显式加入Tcl，写导出不加入白名单。新能力仅A实现/验证后交既有协调器，非B/C新接受或完整Studio S2/S3/S4。

### 7.61 绑定 JSON 文档驱动现有 Wrapper 原生配置

Studio新增原始text.json，与既有SDC/YAML/Tcl共用TextDocument/DocumentStore、创建/保存/撤销/冲突/恢复与在线/离线编辑器；JSON磁盘仍为原始UTF8文本，不写包络，不自动格式化或转成第二个计划模型。旧三类保持，DocumentCreateInput/Args/Desktop及DocumentEnvelope四定义仅向documentType枚举追加text.json，旧调用/默认不变；旧程序无需前向认识新类型，无工程/任务迁移。此显式新兼容扩展不冒B75针对旧三类型的字面Schema守卫仍通过，JSON恢复草稿沿扩展后的原DocumentEnvelope。

analysis.wrapper.config.preview（analyze wrapper-config DOCUMENT）只读取当前工程明确绑定的text.json普通文件，沿原项目路径/真实路径规则，句柄NOFOLLOW/NONBLOCK、严格UTF8、1MiB字节上限/取消；不接受任意输入路径。通过原固定发行wrapper-config.schema.json检查解析后形状，原C++严格重复键/精确数字及关系验证仍是执行权威，预览validation固定schema_only，不冒完整配置/领域通过。返回documentId/原reference/text/contentHash、原mode、stage/requireComplete、projectHash、NativeAnalysisOptions、inputMode current_disk、freshness unknown与previewHash（除自身外确定JSON摘要）。不执行工具或打开Design，不需要可执行程序；读取固定Schema数据须沿原发行身份核验。

stage默认config：boundary/cells/chains模式分别映射原三输出Schema及--config。链模式可显式选择coverage/clocks/resets/compatibility/activity/schedule/explanation，分别只追加原--chain-coverage/--chain-clocks/--chain-resets/--chain-compatibility/--plan-activity/--schedule-activity/--explain-chains（explanation固定--format json），配对原对应Schema。非chains选链stage明确拒绝；不推导规则/链/容量/电气事实，不接受任意extraArgs/schema override。配置路径相对当前显式cwd生成，原--top/filelist/cwd仍由工程拥有，--require-complete仅显式选择。所有原报告/0/1/4与failed原码、源码/历史语义保持。

analysis.wrapper.config.run（analyze run-wrapper-config DOCUMENT --expect-preview-hash ...）再次预览并核hash/工程绑定，必须匹配当前workspace快照；桌面在flush后拒所选打开文档dirty，异步校验后再核dirty/工程与取消，立即交同一RunService.startNativeAnalysis。Desktop返回真实runId，CLI等待原RunDetail；实际保存commandId仍analysis.native，无第二任务库或新RunRecord。预览只约束接受前读取的配置bytes，原工具执行时读当前磁盘；接受后外部改盘不承诺原子配置快照/归档重放，freshness保持unknown，历史参数/生成脚本/原rerun使用保存选项及当前输入。运行入口不加入Tcl白名单（避免第二所有权路径），Tcl可用只读预览options经原native入口显式执行。

analysis.wrapper.config.create（analyze create-wrapper-config）从显式scope/mode创建最小原格式JSON：boundary/cells使用原默认策略，chains必须提供显式chainName和正安全整数capacity，生成该链/defaultChain；其它mode拒chain字段，不猜链容量/库模型。要求documentId/项目相对path/expectedHash，复用原createDocument(text.json,initialText)，成功进入原编辑器；完整发布后绑定失败仍保留未绑定文件。创建不执行分析，不写RTL。严格IPC只收ID/stage/bool/hash与模板字段，不收raw配置/任意读路径；批处理或Console活动拒创建/GUI另起任务。预览显式加入Tcl只读入口，写创建/运行不自动开放。

Tasks新增配置面板共用原项目/文档回调/flush/任务选择：刷新JSON文档→选择/预览原文本与选项→显式运行→原任务/报告/源码/结构比较；模板创建后打开同一在线/离线编辑器，保存后必须重新预览，dirty/摘要变化明确拒绝；切文档/stage/操作/卸载使旧响应失效。该工作流是Studio Wrapper宿主接线（路线S3的现有后端），不是整个S2/S3/S4、Scan插入或物理验收，不新增分析算法、依赖/Node0.4/Tcl9.0.4/Core/SDK升级。B75/C30只有限接受2601dd06，新单元仅A实现/验证后交既有协调器。

### 7.62 绑定JSON文档驱动现有memory规划和检查

Studio路线S4的已有memory后端接线复用7.61的原text.json文档、排他创建、编辑/恢复、原RunService及历史报告/源码/比较。analysis.memory.config.preview输入scope、libraryDocumentId、可选stage（默认mapping）、testDocumentId、clockDocumentId、recursive/requireComplete。只读明确绑定JSON的普通文件，每份严格UTF8/1MiB；三份输入按library/test/clocks角色核原发行memory-library/memory-test-config/memory-clock-expectations Schema（包括原引用闭包）。共享读取/Schema模块供Wrapper和memory使用；Wrapper的既有接口、错误码和结果保持。原C++拥有重复键/精确数值、完整关系和领域规则，preview只作schema_only，执行仍传原文件路径，不把JSON.parse结果重新写盘。

固定十stage翻译到原CLI：mapping仅--memory-library；clocks另--clock-sources；plan另--plan-tests --test-config；domains再--inspect-test-domains；clock-check再--check-test-clocks；schedule再--schedule-tests；timing再--time-tests；assessment在timing另--assess-tests；coverage在timing另--test-coverage；resources在timing另--test-resource-usage。对应唯一原report Schema（memory-map/clock-sources/test-plan/test-domains/clock-check/test-schedule/test-timing/test-assessment/test-coverage/resource-usage）。mapping/clocks拒多余test/clock选择，所有plan分支必须test，只有clock-check/assessment必须clock且其它分支拒多余clock。scope是显式原实例路径，recursive和requireComplete显式开关；库模型由原native读取，宿主不猜definition、引脚/容量/成本/时钟，不另加--definition或任意参数。

预览含projectFile/projectHash、规范选择、每份role/documentId/reference/text/contentHash、原选项、validation schema_only/inputMode current_disk/freshness unknown/previewHash（除自身外确定JSON摘要）。analysis.memory.config.run要求原选择和expectedPreviewHash，在同RunService自己的workspace上复核全部所选文档dirty、原盘hash、工程快照与取消，再调用原native入口；任务仍analysis.native。各文件顺序捕获，接受后仍可被外部修改，不承诺原子多文件快照/归档精确重放。旧原码0/1/4及failed封套保持，领域pass/fail不由GUI重算。

analysis.memory.config.create使用严格kind分支模板：library要求显式definitionName/words/dataBits、clockPin/addressPin/dataInPin/dataOutPin/edge及operationsPerWord/powerMicrowatts，仅生成四个声明角色和一条成本；test要求显式instancePath/clockDomain/periodPicoseconds，partition缺省空，仅生成一个exact assignment及声明时钟；clocks要求显式clockDomain/sourcePath/sourceBit/edge，仅生成一个允许来源。完整复杂模型/规则/资源/依赖仍在原JSON编辑器按原Schema编辑；模板不猜库或测试架构、不自动执行/写RTL。create沿原createDocument(text.json,initialText)，失败保留原已发布未绑定文件。

新增三应用/CLI命令analyze memory-config/run-memory-config/create-memory-config和严格Desktop DTO；IPC不收raw JSON/任意读路径或args覆盖。Tcl仅显式只读dft::analysis::memory::config，create/run不扩白名单。GUI Tasks面板选择三文档、stage与scope，逐份审阅原文本/hash，flush后显式运行并选原任务；模板创建打开原在线/离线编辑器，切选择/操作/卸载隔离迟到响应，批处理/Console活动拒创建或GUI另起任务。旧204定义/117命令、工程/RunRecord/报告Schema/Node0.4/Tcl/Core/SDK/依赖锁不变，无迁移/新算法/Scan或MBIST插入、物理验收或全S4完成主张。前单元text.json已声明的B75旧枚举字面守卫差异保留，不修改B oracle或把A执行推为新B/C验收。

7.62源码边界：当前memory原报告含层次路径但不携带SourceSpan，故原历史reader的位置清单为空；宿主保留原报告/索引拒绝，不从名称推测源码。该单元的修改后复验通过保存JSON/当前输入重跑和原结构比较完成；不宣称新增memory精确源码出口。

### 7.63 已保存配置的同次调查领域比较

Studio路线S3 Wrapper与S4 memory宿主接线在7.61–62原JSON/RunService上增加同次调查的原生比较。此能力调用已经存在的领域比较CLI，不从两个历史报告的结构差异推导领域可比；7.60历史结构查看保持不变。新增analysis.wrapper.compare.preview/run及analysis.memory.compare.preview/run，严格CLI/应用/Desktop/Tasks；不扩Tcl复杂对象输入白名单，保存任务仍可用原native脚本生成/执行入口。

Wrapper输入configurations为2..8个{name,documentId}有序项（名字唯一、良构Unicode/无NUL/UTF8不超过128bytes），可选referenceName缺省第一项、requireComplete缺省false。只读取绑定text.json，核原wrapper-config Schema且mode必须chains，翻译重复--compare-chains NAME FILE和明确--reference NAME，配原wrapper-chain-comparison Schema。共同边界/完整关系/原可比资格与delta仍由原C++验证，不推导链等价或物理结论。

memory输入显式scope、libraryDocumentId、2..8个{name,documentId,clockDocumentId?}，可选mode=timing（缺省）/assessment/resources、recursive/requireComplete缺省false。每项documentId必须原memory-test-config格式；assessment要求每项clockDocumentId为原memory-clock-expectations，其它模式拒该字段。翻译原--memory-library、--plan-tests --schedule-tests --time-tests、重复--compare-test-config NAME FILE；assessment再逐名配--compare-clock-expectations，resources另加--compare-resource-usage；配原memory-test-comparison/memory-test-assessment-comparison/memory-resource-usage-comparison Schema。参考恒为第一项，不替用户排序、排名或猜模型/资源身份。原native一次调查/原时钟证据和complete-only delta、缺失resource与0的区别保持。

预览复用7.62唯一读取/原Schema闭包；每份1MiB、相同documentId缓存一次原bytes（仍按角色复核），唯一文档合计最多4MiB，超限明确拒绝。不接任意路径/raw JSON/args/schema覆盖。返回projectFile/projectHash、拥有的规范selection（tool判别）、按首次选择顺序去重的documents（原reference/text/hash和roles）、原NativeAnalysisOptions、schema_only/current_disk/unknown和previewHash。Shape-only不替代原重复键/精确数字/关系校验；执行仍传原文件而非重写JSON。多文件顺序捕获与接受后的current_disk变化不承诺原子快照或全部RTL精确重放。

RunService新增两个类型化门面，仅用自身workspace复核全部所选打开文档dirty、规范预览摘要、工程快照和取消，再沿原startNativeAnalysis；CLI等原终态、Desktop返回真实runId、批处理/Console活动拒GUI另起任务。输入数组及每项在首个await前复制，调用方后续修改不改变接受内容。原analysis.native持久参数/0/1/4及failed封套、历史/当前rerun/原Tcl脚本生成/导出与关闭所有权保持，无新任务/计划库或存储迁移。

Tasks比较面板显式选工具、memory模式/库/scope、2..8个命名配置及必要时钟文档、显式前后移序/Wrapper参考名与完整性开关；刷新绑定文档、逐份审阅保存文本/hash后显式运行原任务。可重复选同一配置作对照，名字必须唯一；切工具/模式/行/文档/参考/操作/卸载使旧预览失效，旧响应不能覆盖新选择。运行接受后收起配置面板，给原任务/结果留出视口；保留选择供下次显式展开。Tasks输入区独立有界滚动（最多45%高度），原任务/结果保留剩余可滚动空间，原表单入口/回调保持。编辑/模板创建沿原两面板和JSON编辑器，不另存第二套方案表示。

原NativeAnalysisView对四个受原Schema核验的比较report增加原值摘要：Wrapper原summary与delta、memory timing原metrics与delta、assessment原verdict/计数与delta、resource逐格原status/可选delta；不重算可比/差值或补0，不输出自动推荐。resource每页20行明确位置/总量，原完整JSON/通用结构查看始终可读；换任务或报告清旧分页。该摘要读取已经验证的原report，不新增报告/判据权威，非比较report保持原视图。旧212定义/120命令、工程/任务/原生报告Schema、Core/SDK/Node0.4/Tcl9.0.4/四native/全部锁保持，新定义/四命令仅新增。前turnB75旧枚举守卫差异保留且不改oracle；本单元为A实现/验证，不冒新B/C或完整S3/S4接受。

### 7.64 合法memory library包络与离线配置工作流修复

依据B-CONFIG-76-01/02，7.62的mapping报告选择须遵循原生产条件：通过原memory-library-input Schema的配置若含可选library，原CLI创建PinLibrary并在mapping输出rtl-library-memory-v1（library与analysis包络），宿主必须选择原library-memory Schema；无library仍memory-map。其它九stage与三比较模式使用原输出Schema，因为原CLI在planTests/clockSources阶段不加该包络。预览、实际任务、历史报告/原文导出/脚本仍沿唯一原Schema和原原文摘要，不删除可选library、不把合法成功改成失败，也不推导库模型。仅修正合法输入的options.schemaId；旧无library调用、DTO/工程/RunRecord、依赖/native字节保持。

离线工作区在打开原JSON编辑器、Console和Tasks时采用可增长的页面流，顶部块保留自身内容高度，Tasks有独立确定的可用高度与有界输入/结果滚动，不能让剩余flex空间压成0后子控件溢出覆盖其它控件。页面可用普通滚轮滚动，配置Preview/Run及保存/关闭不要求强制click或关闭编辑器绕行；离线页头在窄窗可换行。在线Dockview布局不因此改变。原DocumentController/flush/dirty/恢复、配置预览/运行/Console所有权保持，不能用隐藏原编辑器代替布局修复。

本单元完成合法完整library的原生mapping与其余阶段/比较兼容、原保存报告阅读，以及在线/离线JSON编辑→保存→预览→原任务/结果的可操作闭环。已发表的7.61–63旧原始报告/接口保持；原B76冻结只原样重执行，不修改oracle。B76两项由B复验后决定关闭，C31有限接受不替代B反例的修复验收。无新增算法/自动库推断/存储迁移/Core ABI/Node/Tcl/native包升级，不作全S3/S4或物理结论。

### 7.65 已保存配置的真实Tcl运行与首次运行前脚本

沿7.61–64同一已保存配置/RunService，为Wrapper单配置、memory单配置和两种比较开放显式Tcl preview/run。单配置保留原preview命令并新增run，比较新增preview/run；run均需原expectedPreviewHash，在同一BatchService拥有的workspace复核全部dirty/原文本和工程摘要后通过原四个RunService门面接受真实analysis.native任务，立即返回本批次拥有的runId。wait/cancel/错误/关闭沿原owned集合，不另开写者；原生成功0/1/4及错误封套保持。CLI/application原run依旧等待RunDetail，Tcl的handle语义明示为适配行为。

比较的-configurations为2..8个Tcl字典组成的有序list，每项仅name/documentId及memory assessment的可选clockDocumentId。Tcl先核list、字典成对/重复字段、项数及允许字段，受限configuration-list帧仅逐字面字符串编码；Node再次核计数/字段/重复并用原DTO校验。不得eval配置或把JSON/任意对象通用化为解释器能力。名字Unicode/128bytes/唯一、角色及4MiB等原服务规则保持；requireComplete在新增六个Tcl入口及两个原单配置preview入口按显式bool接受；旧调用缺省false及其它入口原行为保持。新增命令只扩大实际Tcl surface，不开放模板创建/导出/任意文件写入到Tcl。

analysis.config.script/同名create/export使用严格selection={kind,input}（kind=wrapper/memory/wrapper-comparison/memory-comparison），input沿对应原四个已发表输入DTO，加expectedPreviewHash绑定已审阅配置。只读preview重新运行原配置preview并核hash，返回规范selection、projectHash/previewHash、script/hash/bytes、current_project/unknown；不要求已有任务或native执行文件，不执行分析。生成的Tcl以局部apply保存规范选择数据，在每次执行时先用对应typed preview读取当前已保存文档，再以新previewHash调用typed run，随后owned wait并打印原status/exit/freshness。脚本只保存选择意图及本次生成依据摘要，不嵌配置原文/工程绝对路径/原生args或固定报告Schema，不把生成时输入宣称为今后精确重放。合法library包络或配置mode变化由执行时原服务重新选择；文档移除/错误/dirty仍明确拒绝。

create/export重新验证原expectedPreviewHash及expectedScriptHash，创建再核同workspace全部所选dirty，沿原createDocument(text.tcl,initialText)/exportNewFile排他发布；Desktop不接output路径且使用原保存框。生成代码的Tcl原子字面量编码由历史native-script与新配置脚本共用，旧脚本文本逐字节保持。Tasks三配置面板可从当前已审阅selection打开共享脚本预览，创建绑定后进入同一在线/离线编辑器，再用原Tcl automation运行；切选择/旧响应/卸载和所有权沿原版本保护。旧原生历史脚本继续固定原参数语义，不迁移/静默更改。

旧224定义保持，新增脚本DTO/三命令；六旧目录仅追加Tcl surface/明确Tcl名，旧CLI/API/IPC/工程/任务/原报告Schema及全部依赖/Core/native/Tcl运行时字节不变。仅Studio bridge.tcl适配器扩展，不是替换Tcl引擎。此为现有Wrapper/memory生产自动化出口，不作整个S2/S3/S4、RTL生成或物理结论；仅A实现/验证，B76两项仍待B复验关闭，不在本turn启动/等待独立B/C。

### 7.66 配置运行的审阅依据、当前配置核对与显式重跑

沿7.61–65四种配置运行（含Tcl/GUI/CLI），在原prepare的同一次最终复核返回后捕获小型ConfiguredEvidence：version1、规范selection、原projectHash/previewHash、按原捕获顺序的唯一documentId/contentHash/roles。此为被接受的配置审阅依据，不是执行时文件系统原子快照或原配置文本归档。继续传原磁盘路径给native，不把摘要当成执行字节认证；RunInput.documents/resources和inputHashComplete/freshness原义保持。

证据只追加到新任务原provenance.json的可选configuration字段，沿原有界文件/摘要与终态manifest发布，不新增artifact路径、RunRecord/工程版本或任务库。正常/失败/取消各次provenance重写保留同一捕获值；通用analysis.native及旧run.rerun仍原参数语义，不按参数路径猜配置意图。旧prepare公开函数仍返回NativeAnalysisOptions，新增review函数供RunService捕获原同次preview，不能在接受后重新读文件伪装当时依据。脚本生成与任务证据共用规范selection投影，不建第二份选择表示。

analysis.config.history只读校验原终态native历史/已提交provenance摘要、证据严格结构/所选角色与唯一文档集合、projectManifestHash及tool身份。无configuration的旧或通用任务返回available=false/not_recorded，不猜意图；损坏证据报run_corrupt。返回已保存审阅依据、rerunOf来源（如有）及current_disk/unknown。若原preview可读取当前绑定配置，返回其当前previewHash/projectHash/规范selection、各保存文档原hash与当前hash的same/changed、projectMatches，以及same_review或changed_review；同字节也不表示绑定/整个工程相同，是否同审阅由原完整previewHash判定。当前文档缺失/类型错误/无效等返回current=unavailable与原错误，保留saved依据；取消仍是取消而非unavailable。读取不要求浏览Core/native执行文件，原固定Schema数据仍必需。

analysis.config.history.run要求runId、expectedPreviewHash和useCurrent=true。从原校验历史取规范意图，重新走同workspace原四个prepareReview和dirty/工程/取消/摘要检查，然后接受原analysis.native新任务；新provenance用原rerunOf记录来源并保存新的配置依据。错误/partial/退出码/所有权/关闭沿原RunService。CLI/application等待RunDetail，Tcl返回本批拥有的runId并沿原wait/cancel；新read/run两个命令明确追加，不改变旧参数重跑。原artifact查看/导出可读新增provenance，无新导出能力到Tcl。

Tasks原native历史增加显式Review configured inputs：显示saved选择/角色/摘要与当前磁盘核对、原错误/RTL freshness unknown，刷新后才能用所审阅hash显式Run with current configurations。运行前flush原编辑器，dirty仍拒绝；新任务选入原历史，旧记录不改写。旧任务无证据明确解释；隐藏/切run/关闭/卸载清旧响应，保存/阅读/任务仍由原服务拥有。该功能不将已保存配置哈希升级为全输入fresh、不补历史证据或迁移旧任务，不作全S2/S3/S4、精确重放或物理放行。旧233定义保持，新增证据/历史DTO与两目录/CLI/Tcl/strict IPC能力；原Core/SDK/Node/native/Tcl运行时/依赖锁不变。本批独立B/C复验由既有协调器后续安排，不在本turn启动/等待。

### 7.67 Desktop命令与成功返回的类型关联

依据B-CONFIG-77-01，公开DesktopBridge必须能表示所有已实现合法返回，包含ConfigScriptPreview、配置脚本export的原contentHash/bytes/output、ConfiguredHistoryView、DocumentSavePreview/Report及原可取消保存框的null。保留原DesktopRequest与实际IPC v1封套/DTO；按其method建立完整DesktopResults类型表，由已有公开服务类型或ReturnType引用结果，不复制业务字段。DesktopValue/Response依method分发；DesktopBridge.request从请求推导成功value，宽DesktopRequest仍返回完整成功联合，原ok=false的code/message保持。类型关联不是运行时验证或来源认证，原strict readRequest/Schema/权限与所有权检查继续生效。

原main dispatch的每个返回在相应method处作编译检查，异步结果/保存框null和全部已有命令纳入同一类型表；无新命令、业务判据或第二handler实现。renderer原串行request由请求推导结果，移除调用方任意指定T的断言；请求包含多个method时仅得到相应返回联合，调用方须实际收窄，不能假装为任意结果。各原界面、flush/error/取消/关闭行为与IPC数据不因此改变，旧输入/命令Schema、工程/任务/报告/依赖/Core/SDK/native/Tcl字节保持，无持久化迁移。此单元仅修复并完成已实现Desktop能力的类型链，不冒整个Studio或新B/C通过；B77由B定向复验关闭。

串行客户端在src/desktop/client.ts由renderer与公开类型消费者共用createDesktopRequester：每个客户端独立排队，保留成功值含null/false，服务错误转换为原DesktopRequestError，传输拒绝原样传播，失败后队列继续。renderer/model保留原request和错误类出口，委托此客户端；只延后读取实际window bridge，无新增全局任务/计时器、领域状态或协议。DesktopInput将原请求联合与已推导method相交，保持对象字面量的多余字段检查，不因泛型开放raw script/output或缺少useCurrent的请求。

兼容承诺针对原请求调用形状、宽请求消费、线协议与数据格式。若外部消费者自行实现DesktopBridge.request，旧的无关联宽返回函数可能需要按新的method关联签名调整其声明；不能把本次类型完善说成所有第三方实现者零源码修改。内置preload与原调用已实际构建；自定义运行时bridge仍由提供方保证真实对应结果。

### 7.68 已保存任务历史的摘要分页与筛选

原run.list及RunList/RunRecord/历史存储保持原含义。新增只读run.query，CLI run query与显式Tcl dft::run::query、严格Desktop共用原RunStore。输入可选commandId（三个原持久任务命令）/status（原七状态）、limit（默认50，1..200）、scanLimit（默认500，1..2000）与不透明cursor；输入在首个await前拥有。按原runId字符串降序继续，不宣称按任意导入createdAt排序。每页最多检查scanLimit个候选目录/返回limit个匹配摘要，原未发布无record目录跳过并计数；损坏/不安全目录沿原错误拒绝，不默默略过。候选前后、异步读取阶段返回后及发布前检查取消，失败出口的取消仍优先，不返回取消后的半页。

RunHistoryEntry仅保留原runId/commandId/status/createdAt与可选startedAt/endedAt，不复制可能很大的input/error详情/结果；打开原run.show才读原完整记录和报告。RunHistoryPage含runs、规范selection、scanned/skippedUnpublished、hasMore与有后续候选时的nextCursor；服务拥有者另附原activeRunIds，全历史非终态不能冒当前owned任务。hasMore指尚有更旧候选，不保证下一页有匹配；稀疏筛选可有空页并继续。目录名称工作集仍为O(N)，排序为O(N log N)比较，不将有界record读取说成固定总目录内存/硬耗时。

游标version1包含canonical工程文件+projectId的摘要、规范筛选/limit/scanLimit摘要及最后检查的合法runId，严格base64url/UTF8/结构/规范编码。非法游标invalid_run_cursor/2，不同工程或selection为run_cursor_mismatch/6，不用游标路径读任意文件。游标无来源签名或授权意义，不是持久会话/历史索引库。工程普通绑定内容变化不使同工程历史失效；分页期间新记录/状态/删除可改变当前内容，不作跨页原子快照或全量计数/完整性承诺。刷新最新页可见新的较大ID，前后页均重新读取当前磁盘，旧详情不改写。

Tasks使用同run.query提供命令/状态筛选、较旧/较新页与最新页；页/筛选/游标导航仅在读成功后一起发布，失败保留上一成功页，换代/卸载隔离迟到响应。分页不启动Core/native、不取消任务；原onRunsChanged刷新当前页，原全部activeRunIds仍用于禁止GUI另起任务。显式接受新任务时回到未筛选首页并保持真实新runId可读，即使其ID不在当前返回页；旧报告/配置依据/脚本/重跑继续原服务。无新存储版本/领域算法/依赖、自动删除或归档，也不把本单元或A turn完成当新B/C接受。

Tasks显式页长100以保持原首页/同页比较候选范围，服务缺省仍50。摘要保留原commandId字符串，未来或未知ID只按原文展示，不猜作design.check；筛选仅开放当前三个生产任务命令。输入类型/长度预算错误沿invalid_input/2，符合输入结构但不可解码或非规范的token才为invalid_run_cursor/2。原RunStore.bytes以O_NONBLOCK打开再fstat，拒绝FIFO等非普通文件，避免在类型校验前阻塞；普通文件/原摘要/旧reader格式不变，此为本次同存储读取边界的必要兼容修复。

### 7.69 从三种已保存任务生成同一任务服务的 Tcl 工作流

新增只读run.script（CLI run script RUN、Tcl dft::run::script）及run.script.create/export（run save-script/export-script）。预览从原已提交artifact读取/核同provenance，要求原三命令的终态任务；无已发布参数明确run_script_unavailable/3，坏记录保持原错误。返回RunScriptPreview：formatVersion1、runId/commandId、provenanceHash、replayMode、script/contentHash/UTF8十进制bytes、current_project/unknown；配置分支另含configurationPreviewHash。输入只runId，不收raw脚本或任意参数。

design.check生成原dft::run::start，register从原RegisterAnalysisArgs拥有scope/recursive/maxFacts并生成analysis.registers；均wait当前脚本owned新句柄，真实非succeeded显式错误，成功报告原结果状态/质量，不把诊断invalid或partial说成领域通过。通用native委托原7.59生成器，旧接口/脚本字节保持。记录有原ConfiguredEvidence时不退回旧native args：沿原savedConfiguredEvidence/showConfiguredHistory校验并审阅当前所选文档，委托7.65 previewConfigScript；replayMode=current_configurations，脚本运行时再次原typed preview/run。当前配置缺失/无效明确拒绝生成，saved依据仍可通过旧history阅读；无证据native为saved_parameters。预览不启动工具、拿writer或改历史；协作取消/错误出口仍检查取消。

创建/导出重新生成并核expectedScriptHash，变化run_script_changed/6；配置当前内容影响脚本review hash，不能以旧确认静默保存新意图。create复用原createDocument原始text.tcl/manifest hash/排他发布；配置分支拒全部所选dirty文档，委托阶段仍保留原配置/文档错误。export复用原exportNewFile，GUI原生保存框取消不写/不接任意path；预取消拒绝、接受后仍原不可取消完成政策。GUI所有终态任务提供统一入口，原native入口/标签/方法保留兼容，原单writer/batch/Console互斥保持；生成/保存不自动运行。

新预览/命令/严格Desktop类型仅追加，复用原输入/导出/DocumentCreated格式，无任务/工程/报告/Node包/依赖/Core ABI迁移。脚本使用当前工程/文件并创建新任务，不是归档RTL/原子执行快照或来源签名。配置生成有当前文档审阅前提，通用保存参数生成不要求当前RTL可用；原native literal脚本与旧generic rerun语义不改。不宣称全S2/S3/S4或B/C新接受。

### 7.70 全历史比较基线与原诊断/寄存器比较的审阅导出

原run.compare/RunComparison及numeric eligibility/partial/input identity/top/算法定义完全保持。新增run.compare.review（CLI run review-comparison BASELINE CANDIDATE、Tcl dft::run::compare::review）只读调用一次原compareRuns，返回RunComparisonReview{formatVersion:1,comparison,comparisonHash}，comparison为原StoredRunComparison（诊断或寄存器分支），不复制原判据；hash为除自身外固定JSON的Studio sha256摘要。摘要只绑定该比较输出，不增加原报告原始字节身份/来源认证或当前输入验证，不升级原unknown。查询预取消/异步阶段返回与发布前检查取消，失败出口取消优先；原底层IO仍协作边界。

新增run.compare.export（run export-comparison BASELINE CANDIDATE --expect-comparison-hash HASH --output ABSOLUTE_NEW_FILE）重新生成review并核摘要，变化run_comparison_changed/6。沿原exportNewFile排他发布pretty JSON+LF，返回comparisonHash/contentHash/UTF8十进制bytes/output。不可比较结果也可导出原原因/空metrics，不冒可比较；取消在接受前拒绝，接受后保留原不可取消发布政策。Desktop只传两ID/hash，经原生保存框选新路径，取消null不写，不收raw比较或任意output。旧run.compare及native compare/export DTO/算法/字节不因此改变，新只读review进Tcl白名单，export不进入。

原保存结果/原生比较共用RunBaselinePicker，从run.query逐页选择基线，独立于Tasks当前100摘要。沿原live/扫描预算/cursor政策，选定runId与候选列表分页分开保存，换页不默默改选择；最后成功页在查询失败时保持，迟到/卸载/候选换代结果不发布。保留原两个select aria-label及旧同页候选，额外提供较旧/较新/刷新和明确saved run ID输入；直接ID须原run.show成功且非当前candidate才提交；native入口沿原native succeeded/failed筛选，通用入口保留跨命令候选并交原服务显示不兼容，错误保留原选定基线。候选只是入口，不推兼容：最终仍原compareRuns/compareNativeReports判定，failed/partial/算法scope冲突不猜或隐藏。

design/register页面使用review显示原comparison、摘要和原身份/原因，显式导出当前所审阅hash；换基线/候选/关闭清旧比较，迟到响应隔离。native保持原结构比较/位置证据/导出服务，只换共享基线选择入口。未选或正在读基线时不接受新比较动作；分页/阅读不启动任务、不改历史。存储/工程/报告/依赖/Core ABI不迁移，不引入领域指标/完整性新判据、自动运行、索引库/定时器或全量历史快照。当前单元不作整个S2/S3/S4或B/C新接受。


### 7.71 有序保存任务工作流的审阅、执行和脚本交付

新增run.workflow.preview/run/create/export，输入为1..8个唯一、有序runIds，均为7.69支持的终态保存任务；输入在首await前拥有并严格校验。preview沿同一prepareRunScript生成器核每个已提交参数/配置选择，不复制领域参数解释，返回formatVersion1、规范runIds、steps（原runId/commandId/replayMode/provenanceHash/可选configurationPreviewHash/contentHash）、projectHash、script/contentHash/十进制UTF8 bytes、previewHash、current_project/unknown与failurePolicy=stop_on_task_error。previewHash绑定除自身外的完整固定JSON；projectHash绑定当前工程原文。组合脚本为局部apply、按原顺序逐个执行原局部脚本并返回新runId列表；总文本最多1MiB。只保留选择意图/摘要，不归档RTL、持久化新工作流模型或增加第二任务库。

run先重新生成全部步骤并核expectedPreviewHash，当前工程、来源参数或配置审阅改变以run_workflow_changed/6拒绝且尚未启动任何步骤。全部选中配置的dirty在同workspace执行/创建前明确run_workflow_dirty/6拒绝，执行前复核writer和工程摘要。配置脚本在每步执行时仍沿原typed preview/run复核当前文档；没有原子跨步骤文件快照承诺。执行只把内部生成的ScriptCapture(path=<saved-task-workflow>，虚拟输入不冒磁盘文件)交原BatchService.start，沿原Tcl运行时/单batch/Console互斥、owned RunService/wait/cancel/关闭join/120秒软时限/输出和命令预算。原脚本非succeeded报错终止后续；早前已发布任务保留，不回滚；diagnostic invalid、register partial和原native成功0/1/4不变成额外领域失败。没有workflow父RunRecord或新执行引擎。

CLI run preview-workflow/run-workflow/save-workflow/export-workflow使用--run-ids-json有序字符串数组。preview只读、可与原writer并存，Tcl仅开放dft::run::workflow::preview -runIds真实有序list；run/create/export不进入Tcl白名单，避免嵌套batch/文件写入授权扩大。CLI/application run返回原BatchReport并保留取消/失败exit；Desktop run立即返回{id}，查询/取消/结果复用原batch.status/cancel及通知。main既有Console共享batch，不能启动第二owner。

create/export重审expectedPreviewHash再沿原createDocument(text.tcl,initialText)/exportNewFile排他发布；create额外沿原expectedHash/documentId/path前提，export返回previewHash/contentHash/bytes/output。Desktop原生保存框取消null，不收raw脚本/output路径。接受后的短发布保留原不可取消政策；保存不自动运行。Tasks的有序列表跨当前历史页保留明确ID，可从终态详情加入、手输/移除/上下移动，改序清旧预览；可见原每步模式与hash，明确运行后展开原Tcl automation，原报告/cancel保持唯一权威。卸载/换代隔离迟到UI响应，原编辑器flush和创建回调保持。

仅追加机器Schema/四命令和严格Desktop类型；原246定义/135目录描述保持。7.69仅导出同一prepare函数供第二真实消费者复用，原单任务脚本字节/调用和存储不改；无工程/RunRecord/原报告/依赖锁/Core ABI/SDK/Node/Tcl/native迁移。B78/C33有限接受及B正式关闭保持；本单元不冒全Studio S2/S3/S4、新领域算法/物理验收或新B/C通过。


### 7.72 有序任务结果的显式对齐、原比较审阅与导出

新增只读run.workflow.results及run.workflow.results.export。输入baselineRunIds为1..8个唯一有序ID，candidateRunIds为0..8个唯一有序ID且长度不大于baseline；首await前拥有两数组，按调用者顺序把候选对应前缀基线。pairing=caller_order明确这不是批次来源认证/自动匹配或证明未运行；无candidate的行仅not_supplied，不叫not_run。所有被提供的任务必须是原终态，非终态run_workflow_results_pending/6，不以磁盘running推owned。输出RunWorkflowResultsReview：formatVersion1、projectId、两原有序ID数组、rows、freshness=unknown、reviewHash；行含index、原RunHistoryEntry投影的baseline/candidate（无候选为null）和显式comparison分支。没有整体领域通过/失败或新的质量算法。

两边均analysis.native时只调用原compareNativeReports，保留eligible/reasons/json_by_position、200changes/100000visited/512previewBytes、complete/stopReason、原report身份与unknown。仅原native_report_unavailable作为该行unavailable原错误code/message返回；坏历史/摘要/Schema/IO和其它错误明确失败，不泛泛降级。其它组合调用原compareRuns，机器Schema引用原StoredRunComparison联合，保留诊断invalid、寄存器decimal字符串/partial与不兼容空metrics；未知/混合命令不猜成另一种任务。not_supplied不运行比较。任务摘要只是入口，最后原reader/comparer仍权威；不读当前RTL/启动Core/native/拿writer或改历史。阶段返回/发布和错误出口检查协作取消，原IO与当前磁盘非原子边界保持。

reviewHash为除自身外固定JSON的摘要，绑定本次projectId、顺序/摘要和原比较输出，不认证候选来自某次执行、额外报告原文字节或当前fresh。响应/导出pretty JSON+LF最多8MiB，超出run_workflow_results_limit/3，不发布截断审阅；各native比较原软预算不变。export重新生成并核expectedReviewHash，变化run_workflow_results_changed/6，沿原exportNewFile排他发布，返回reviewHash/contentHash/十进制UTF8 bytes/output。坏历史不略过，预取消拒绝、接受后短导出原不可取消政策保持。Desktop原生保存框取消null，不收raw report/output路径；Tcl仅只读dft::run::workflow::results -baselineRunIds/-candidateRunIds真实list（各max8），export不入白名单。CLI run workflow-results/export-workflow-results以--baseline-run-ids-json和--candidate-run-ids-json传数组。

Tasks新增结果审阅区：直接工作流接受时捕获当时基线选择，只有原batch.status中匹配id的终态report才一次性填充其runIds；后续其它batch/通知不覆写已编辑配对，原BatchService仍唯一执行状态。允许用户显式编辑两ID数组，改动清旧审阅/迟到响应隔离，失败保留输入并明确错误；既有状态/取消继续在原Tcl automation。原每行任务可打开到同一历史详情，再沿既有报告/源依据/重跑；原比较数值/原native有界差异与hash可审并导出。不是保存新的工作流会话/父RunRecord，关闭后配对丢弃；离线历史仍可按ID手动重建。旧有序运行/脚本/原比较接口、257 Schema定义/139目录对象及工程/任务/报告/依赖/Core/SDK/Tcl/native字节保持。本单元不代新B/C验收或完整S2/S3/S4/物理结论。


### 7.73 首次运行前的显式有序分析工作流

新增analysis.workflow.preview/run/create/export（CLI analysis preview-workflow/run-workflow/save-workflow/export-workflow --steps-json）。严格input.steps为1..8个有序判别联合：{kind:design}；{kind:registers,input:原RegisterAnalysisOptions}；{kind:native,input:原NativeAnalysisOptions}；{kind:configured,input:原ConfigScriptInput}。同一步可重复，先按机器Schema校验并在首await前拥有全部嵌套数组/对象。无需已有历史或首次分析副作用；这不是新的持久化计划格式，关闭后临时选择丢弃，可显式保存为原text.tcl文档。

preview用原registerAnalysisOptions/nativeAnalysisOptions规范默认/原参数，配置调用原previewConfigScript并保留已审expectedPreviewHash/规范selection。三任务脚本文本在task-script.ts与旧历史入口共用，配置原生成器不改；旧历史headers/脚本文本与摘要逐字保持。原有序脚本组合共用同一typed生成函数；新组合仅静态步骤标签和局部apply，最多1MiB UTF8，所有step先审查后才允许执行。AnalysisWorkflowPreview含formatVersion1、规范steps、各步commandId/contentHash/bytes、projectHash、script/hash/bytes、previewHash、current_project/unknown及stop_on_task_error；hash绑定除自身外完整固定JSON。无任务/报告/工作流父记录，不归档RTL或认证未来执行来源。

run重新审全部steps/expectedPreviewHash，原配置expected hash/所选dirty/工程writer/hash在首任务之前拒绝。共享原工作流接受末段：校验workspace及当前工程摘要，然后只把内部生成ScriptCapture(<selected-task-workflow>虚拟输入)交原BatchService.start。原Tcl/RunService是唯一执行与owned wait/cancel/close join/Console互斥；原120s batch/60s native/输出与命令预算保持。真实执行错误停后续、已发布前缀保留，diagnostic invalid/register partial/native成功0/1/4不增领域失败。配置每步执行仍原typed preview/run当前已保存选择，非跨步骤原子输入快照。普通参数不要求预先跑Core，运行时错误沿原服务保存；预览不拿writer/启动后端。协作取消、失败出口优先和接受后原终态政策保持。

create/export重审previewHash、沿原createDocument(text.tcl)/exportNewFile与manifest hash/排他发布；创建同workspace所选dirty仍拒绝，导出返回previewHash/contentHash/bytes/output。Desktop run立即{id}并复用原batch.status/cancel/通知；CLI/application run返回原BatchReport/原退出码。Desktop导出原生保存框取消null，不收raw脚本/output路径；接受后短发布原不可取消政策。四新命令不进入Tcl白名单，避免引入任意嵌套JSON解释/写入能力；输出脚本沿已有typed Tcl入口执行。

Tasks的Current input workflow从设计检查、原register/native表单以及四种当前已审配置入口添加显式step，支持有序增删/移动、显式JSON编辑、审阅/直接运行/保存导出。改动清旧preview/迟到卸载隔离，输入在busy时不再暗改；配置按钮只从原已审preview携带selection/hash，不推新领域默认。接受后展开原Automation；原BatchReport.saved runIds可打开同一历史详情/报告，无基线时不伪造结果比较，已有历史workflow/results接口保持。旧按钮/标签/方法仍原义，旧控制台/配置和持久格式保持。

旧266 Schema定义/141命令对象保持，只追加显式工作流DTO/四命令与严格Desktop返回。为第二真实消费者提取原脚本渲染/组合及接受末段，原历史脚本与原错误/取消/排他语义保持；原RunService/BatchService、四配置生成器、比较/任务/工程/依赖锁/Core ABI/SDK/Node/Tcl/native字节不变。B79/C34对7.70–72有限接受保持，本单元不代新独立B/C或完整S2/S3/S4/物理验收。


### 7.74 选定任务的完整原值报告审阅与导出

新增run.report.review/export（CLI run review-report/export-report --run-ids-json，Tcl仅dft::run::report::review -runIds）。严格1..8个唯一有序终态runIds在首await前拥有，selection=caller_order不认证批次来源；不要求基线，不作比较或整体领域通过判定。按原showRun保留完整RunDetail（任务/结果/日志/原产物清单，机器引用原StoredRunDetail联合），逐产物用原showArtifact核已发布身份/bytes/hash并保留ArtifactContent原值，含已保存工程清单/参数依据/结果文本。native行再委托原showNativeReport返回原schema校验的payload/locations；只有native_report_unavailable显式unavailable，坏历史/摘要/Schema/文本/IO等其它错误均失败，非native为not_native。不读当前RTL/拿writer/启动工具/修改历史，无新任务/持久库/工作流父记录或归档重放承诺。

RunReportReview含formatVersion1、projectId、runIds、selection、rows（index/detail/artifacts/native判别联合）、freshness=unknown、reviewHash；hash绑定除自身外完整固定JSON，无不稳定生成时间或来源签名。每个artifact描述须与最初detail清单逐值相等，每行末重新读原detail须全等；返回前复核工程projectId。当前磁盘仍非原子/不抵御同UID一致改写，变化run_report_changed/6不发布半报告。非终态run_report_pending/6。pretty JSON+LF响应/导出最多8MiB，逐行及artifact读取前按声明bytes提前拒超限，最终核实际UTF8；超限run_report_limit/3，不发布截断报告，不承诺硬heap/IO/时间。保留原partial/invalid/native0/1/4和失败/取消/interrupted语义，原缺少已发布产物为原null/空列表，不伪造成功。

export重新读全部原值/核expectedReviewHash和工程身份，再沿原exportNewFile排他发布，返回原reviewHash/contentHash/bytes/output结构。Desktop原生保存框取消null，只收IDs/hash；不收raw报告/output路径。CLI/application预取消拒绝，接受后短导出沿原不可取消政策；read阶段/返回/失败出口协作取消。Tcl只读新增一个命令，有序list max8，export不入白名单。

Tasks新增Saved task report：原Automation终态report用显式按钮复制其runIds，可编辑JSON选择旧任务/顺序或从终态详情加入；动作是显式选择，不订阅第二执行状态或自动覆盖用户编辑。审阅显示原每行任务/状态/质量/native原exit/日志/产物文本/hash与原native报告；可打开原详情/源码消费及显式导出。改动/换代/卸载隔离迟到响应；编辑ID文本后必须先明确应用新选择才可审阅，不以旧选择重新发布review。旧所有入口/277Schema/145命令对象保持，仅追加报告DTO/二命令及严格Desktop返回；无工程/报告/依赖锁/Core ABI/SDK/Node/Tcl/native迁移。B79/C34只覆盖7.70–72，本新增和7.73尚无新B/C独立接受，不冒完整S2/S3/S4或物理验收。


### 7.75 已保存任务参数转为可编辑的当前分析工作流

新增只读run.workflow.inputs（CLI run editable-inputs --run-ids-json；Tcl dft::run::workflow::inputs -runIds；Desktop同canonical ID）。严格1..8唯一有序runIds在首await前拥有，逐项沿同一prepareRunScript读取原已提交参数和配置意图，不重新解释provenance或Tcl。原prepare内部额外返回typed step，原preview/脚本/headers/hash/错误和配置检查不变；普通design/register/native使用原规范参数，configured必须沿原showConfiguredHistory/previewConfigScript重审当前绑定selection/hash，不缺失回退旧native args。所有来源读取完成才返回，取消/错误不返回部分可编辑队列。

RunEditableInputsReview含formatVersion1、runIds、sources（原RunWorkflowStep的runId/commandId/replayMode/provenanceHash/可选configurationPreviewHash/contentHash）、steps（原AnalysisWorkflowStep联合）、projectHash、inputMode=current_project、freshness=unknown、reviewHash。hash绑定完整固定body；返回前复核工程原diskHash，变化run_inputs_changed/6。pretty JSON+LF响应最多1MiB，超限run_inputs_limit/3；这是输出上限，非硬heap/IO/时限或原子跨文件快照。来源hash是已读审阅依据，不是未来执行/批次来源认证；读取不拿writer/启动后端/新建任务/改历史，不要求当前RTL可用，配置Schema和当前绑定文档仍必需。

Current input workflow可从原任务详情/有序历史选择显式填入来源IDs，或手动JSON输入；Read saved task inputs显示原来源、saved_parameters/current_configurations模式和摘要，随后明确Append reviewed inputs加入临时typed队列。加入前必须先应用当前队列尚未提交的JSON编辑，且总步数<=8；保留已有步骤、深拥有加入值，不自动运行或覆盖队列。来源IDs修改清旧读取结果，异步换代/卸载隔离迟到响应；读取中保持原busy/编辑器flush。普通参数可编辑scope/递归/上限/native args，配置selection可编辑但原expectedPreviewHash必须经过既有配置审阅更新；不把旧审阅hash当通用授权。

编辑后的全部预审/run/create/export继续原analysis.workflow四入口、原Batch/RunService/Console互斥/取消/close join和原脚本/报告交付。用户必须明确Apply编辑、重新审阅后再运行或保存；新任务不改原来源记录，不把编辑后结果与旧来源冒成同一归档输入。原所有机器定义/命令对象和已发布数据/依赖/Core ABI保持，仅追加读取DTO/一个只读命令及严格Desktop返回，无新持久化计划/任务/父记录/领域算法。B79/C34有限接受仍仅7.70–72，7.73–75尚无新独立B/C接受，不冒全S2/S3/S4或物理结论。

### 7.76 临时工作流的统一草稿保护与队列撤销

针对C-S2-35-01/B80-G02，Tasks持有同一临时工作流草稿：已应用steps、JSON原文、数据revision、busy与已应用队列历史。所有design/原register/native表单/四配置/历史来源追加、移动/删除/清空及撤销/重做共用同步边界。JSON原文与规范已应用队列不同即pending，期间普通队列动作拒绝并保留原文字和steps；合法或非法JSON均不得被steps effect或另一加队入口覆盖。明确Apply只解析原array<=8结构，业务合法性仍交原严格服务；失败保留编辑并显示错误。仅明确Discard丢弃尚未应用的文字。

新增Undo/Redo applied workflow steps和Clear workflow steps，历史最多16个深拥有的已应用队列快照，包含Apply/追加/改序/删除/清空；新队列修改清redo，pending期间不可借撤销隐式丢弃文字。JSON键入不逐字符记录历史，Apply同一队列仅规范文字而不新增队列历史。每个数据revision立即使旧preview不可用，异步响应仍沿原组件换代/卸载隔离；busy不改变数据revision，且共同边界拒绝busy期间改写。原preview/run/create/export、原owner/取消/close join/报告保持，不新增领域验证、持久化草稿、恢复或硬heap预算承诺。没有新增IPC/CLI/Tcl/Schema/工程/RunRecord/依赖/ABI；此为A修订，C/B问题仍待提出方对固定交付复核。

### 7.77 工作流当前配置的显式刷新候选

新增只读analysis.workflow.refresh（CLI analysis refresh-workflow --steps-json、严格Desktop同名），输入复用AnalysisWorkflowInput/1..8有序步骤，输出复用AnalysisWorkflowPreview。仅该显式读取动作允许从旧configured.expectedPreviewHash重新取得当前所选已保存文档的新依据；选择本身仍严格校验，普通design/register/native按原规范参数。配置读取/规范selection/脚本文本与旧previewConfigScript共用同一内部prepare，调用原四个配置preview，不另写领域解析或执行链。旧preview/run/create/export保持原hash核对/dirty/owner与错误，刷新不改变其接受条件。刷新在首await前拥有全部输入，全部步骤成功才返回，末工程hash/原1MiB脚本限制及协作取消/失败出口优先保持；缺文档/坏配置不回退，不要求当前RTL/native执行文件可用，不拿writer/启动任务/修改历史。候选hash是本次读取依据，非多文件原子快照或未来执行/来源认证。

Current input workflow增加Refresh configured workflow inputs，展示完整typed候选及旧/新配置摘要。队列和旧确认在读取期间不被候选自动覆盖；用户明确Apply refreshed workflow configurations才经7.76共同guard深拥有替换队列/记撤销历史，并使旧preview失效，必须再Review才可run/create/export。pending JSON/busy拒刷新与应用；队列revision/来源读取换代/卸载隔离迟到候选，错误不返半候选。没有新增持久化计划/会话/任务/父记录/领域算法/依赖/ABI，旧机器定义逐值保持，只追加一个命令目录/CLI/IPC能力；不加Tcl嵌套JSON命令，原Tcl白名单保持。本批均A实现/验证，C-S2-35-01/B80-G02仍由提出方针对固定修订复核。


### 7.78 原比较与双方完整任务报告的一体审阅交付

新增只读run.workflow.report.review和export（CLI run workflow-report/export-workflow-report，baseline-run-ids-json/candidate-run-ids-json沿原双列表；Tcl仅dft::run::workflow::report::review的两个max8 list）。输入复用RunWorkflowResultsInput/Args及原export输入；1..8基线、候选唯一有序前缀可为空，首await前拥有。复用原reviewWorkflowResults与reviewRunReport，保留原比较/eligibility/partial/invalid/native退出/缺报告及每份原任务、日志、产物文本/hash/native完整对象。无新领域判定、自动对齐或来源认证，not_supplied仅无ID。

RunWorkflowReportReview新增一个定义：formatVersion1、projectId、selection=caller_order、comparison原RunWorkflowResultsReview、baseline原RunReportReview、candidate原RunReportReview或null、freshness=unknown、reviewHash。依次读比较、双方原完整报告，核projectId/ID顺序/比较行摘要与完整任务字段相符，末重读原比较须全等，并复核工程身份；变化run_workflow_report_changed/6，错误/取消无半报告。pretty JSON+LF合计最多8MiB，逐阶段及最终检查，超限run_workflow_report_limit/3，子报告原更早错误保持；非硬heap/IO/时间或跨文件全局原子快照，不抵御同UID一致恶意改写。读取不拿writer/启动工具/新建任务/改历史，缺RTL/执行文件仍按原历史服务可读。

export重新读/核完整expectedReviewHash与工程身份，再沿原exportNewFile排他发布，输出复用原reviewHash/contentHash/bytes/output；GUI原生保存框取消null，不收raw报告/任意输出路径。预取消由原应用边界拒，接受后短发布政策保持。Workflow results review增加完整报告审阅/导出，ID改变/上下文换代清旧两种review、busy锁编辑、迟到/卸载隔离，原任务报告视图由两个真实消费者共用；打开原详情/源码仍原链。旧Schema定义/命令对象/持久文件/脚本/依赖/Core ABI保持，仅新增一输出定义和两目录/CLI/strict Desktop能力、一个只读Tcl。无新工作流父任务/会话库或全S2/S3/S4/物理结论，本批只是A实现/验证。

### 7.79 运行前的工作流输入改动审阅

analysis.workflow.changes.review/export（CLI analysis workflow-changes/export-workflow-changes、strict Desktop；无Tcl）接收baselineRunIds（1..8唯一有序）和steps（1..8原AnalysisWorkflowStep）。首await深拥有，沿原reviewRunEditableInputs重建来源、previewAnalysisWorkflow预审当前队列，不另解析provenance/配置或生成Tcl。输出WorkflowInputChangesReview嵌入完整原baseline/candidate，pairing=caller_order、按index列unchanged/changed/added/removed；规范step深值比较忽略对象键顺序、数组有序，行只存index/status，不复制参数。来源配置仍按原current_configurations重建，不是归档配置/RTL前后比较、自动对齐、领域数值可比或执行结论。

来源与候选必须同projectHash，末两者重读全值核同，再核工程hash，变化workflow_input_changes_changed/6；错误/取消无半结果。pretty JSON+LF响应最多4MiB，超限workflow_input_changes_limit/3，子服务原更早错误保持；原非原子当前文件/unknown/协作IO取消/软预算/同UID边界保持。export重读核expectedReviewHash与工程身份，沿原exportNewFile排他发布，返回原RunWorkflowResultsExport结构。Desktop只收输入/hash，原生保存框取消null；预取消及接受后短发布沿原政策。读取不拿writer/执行工具/新增或修改任务、配置、父记录或持久化会话。

Current input workflow显式审阅来源IDs与已应用队列，展示两侧完整输入和位置改动并可导出。队列数据revision/来源ID编辑/pending/换代/卸载清旧结果，原同步草稿guard/busy及迟到响应隔离保持；不自动应用、不授权Run，执行仍需原完整预审及hash/owner检查。只新增定义/命令与生产入口，所有旧机器对象/公共调用/脚本/工程格式/依赖/Core ABI保持。

### 7.80 已审阅输入改动的明确执行与Tcl交付

在7.79只读审阅之上新增三个明确动作analysis.workflow.changes.run/create/script.export，CLI analysis run-workflow-changes/create-workflow-changes/export-workflow-changes-script，strict Desktop同名；不增加Tcl嵌套JSON能力。输入原baselineRunIds/steps及expectedReviewHash；创建再需documentId/path/expectedHash，脚本导出复用原WorkflowInputChangesExportInput。首await深拥有，重新运行完整7.79审阅并核完整hash，随后只调用原startAnalysisWorkflow/createAnalysisWorkflow/exportAnalysisWorkflow，传原candidate.steps和previewHash。原dirty/配置hash/全预审/writer/互斥/取消/close join/文件创建/排他导出均保留，无第二脚本生成器、执行owner、持久化模型或父任务。

CLI run返回原BatchReport，原120秒默认、错误exit与持久终态取消政策保持；Desktop接受返回原{id}并接原automation/通知/取消/详情/报告，创建返回原DocumentCreated，脚本导出返回原AnalysisWorkflowExport/保存取消null。原7.79 JSON export及原Run/create/export不改含义。新动作缺或旧完整reviewHash拒绝，原服务更早错误保持；协作取消优先，无接受前半队列，接受后原任务前缀不回滚。当前磁盘多读非原子、unknown/软预算及短发布保持，不认证归档输入/来源或未来字节。

Current input workflow审阅区增加Run reviewed workflow input changes/Create Tcl from reviewed input changes/Export Tcl from reviewed input changes及文档ID/path。仅用户明确动作开始，原Run仍需单独预审；pending/busy/来源或队列编辑/换代/卸载清旧确认，create后工程变化清旧结果，保存取消保review。运行后的实际runIds只由原BatchReport/任务历史展示，不因增删步骤自动配对或静默截断成旧基线大小。只追加4定义/3命令和严格返回，旧机器对象、执行/工程文件格式、依赖/Core ABI保持。

### 7.81 不同长度队列的完整修订报告

新增run.workflow.revision.report.review/export（CLI run revision-report/export-revision-report、strict Desktop；Tcl仅dft::run::workflow::revision::report::review双max8 list）。输入复用RunWorkflowResultsInput/ExportInput，基线1..8、候选0..8各唯一有序，候选可更长。新RunWorkflowRevisionReportReview复用原完整报告字段，增加必需unpairedCandidateRunIds：comparison仍为原reviewWorkflowReport中的全部基线与至多同长度候选前缀的原RunWorkflowResultsReview，baseline为全部原报告，candidate为全部候选原RunReportReview或null；尾部候选完整保留且明确没有基线/没有比较，不伪造对象/自动对齐或修改旧接口前缀限制。selection=caller_order/freshness=unknown不变。

首await拥有列表。读取原paired完整报告后，有额外候选时读取全部原candidate报告并核共同完整rows前缀全等；末原paired与全部candidate重读核同/工程身份。原终态/缺报告/坏产物/native退出及取消错误保持，变化run_workflow_revision_report_changed/6，pretty JSON+LF合计8MiB超限run_workflow_revision_report_limit/3，子服务更早错误保持，无半结果。输出上限非硬heap/IO/时间或全局原子快照，原协作取消/unknown/多文件非原子/同UID限制保持。export重读核完整expectedReviewHash与工程身份后原exportNewFile排他发布，原生保存取消null；预取消与接受后短发布沿原。不启动工具/拿writer/新增任务、父记录或会话模型。

Workflow results review新增完整revision审阅/导出、未配对候选说明及全部原候选详情，复用原报告展示。明确Run reviewed workflow input changes可携带已审来源IDs建立原结果context，仅该Batch终态复制全部实际runIds、不自动比较；ID编辑/新context/卸载清旧结果、busy及用户编辑后不再自动覆盖保持。原Run/有序任务Run/旧比较与报告入口不变，旧长候选仍拒绝。只新增1机器定义/2命令/1只读Tcl，旧机器对象/依赖/工程与RunRecord格式/Core ABI保持，不认证执行来源/归档RTL/领域可比或总体结论。

### 7.82 用户明确配对的完整工作流报告

run.workflow.alignment.review/export（CLI run alignment-report/export-alignment-report、strict Desktop；不增加Tcl）接收基线1..8、候选0..8唯一有序IDs，以及0..8个显式{baselineRunId,candidateRunId}配对。每个ID必须属于对应选择，每侧在配对中最多出现一次；不默认按位置/名称/命令配对，不允许复用任务。配对顺序是用户声明顺序。首await拥有两列表及每个配对；严格业务关系在任何历史读取前拒绝。

RunWorkflowAlignmentReview包含formatVersion1/projectId/selection=explicit_pairs/pairs、完整原baseline/candidate报告或null、原comparison或null、unpairedBaselineRunIds/unpairedCandidateRunIds、freshness=unknown/reviewHash。配对非空时comparison为原reviewWorkflowResults在显式配对顺序的两ID列表上返回的完整原对象；内部pairing仍原caller_order，只表达声明的对应关系。空配对comparison=null，不虚构not_supplied比较。完整双方报告保持所有输入ID原顺序，未配对ID各保原选择顺序，明确无比较，不意味着已删除/新增/未执行或领域不可比。

只组合原reviewRunReport/reviewWorkflowResults，不复制领域判据。核共同任务摘要/工程身份，末重读全部原报告和原比较核同，变化run_workflow_alignment_changed/6；合计pretty JSON+LF最多8MiB，超限run_workflow_alignment_limit/3，原子服务更早错误和协作取消保持，无半报告。export核完整审阅hash/工程身份并沿原exportNewFile排他发布，原生保存取消null、不收raw报告或renderer output。原unknown/当前磁盘非原子/软预算/接受后短发布/同UID边界保持。

Workflow results review增显式配对JSON输入及审阅/导出，复用全部原任务报告/比较视图，分别列未配对基线/候选和原详情。IDs/配对编辑、新context/同批填入/新审阅/错误/卸载清旧确认；无自动配对，用户编辑仍阻止批次自动覆盖。旧位置比较/完整revision入口和机器对象全部不变，无新执行/存储/父任务/领域算法/依赖/Core ABI或工程格式迁移。仅本新输入输出/两个能力需新消费者，不扩旧Tcl嵌套JSON白名单。

### 7.83 已导出完整报告的独立只读打开

report.file.review（CLI report inspect --input FILE、Desktop同名原生Open对话框；无Tcl）只读打开现有RunReportReview/RunWorkflowReportReview/RunWorkflowRevisionReportReview/RunWorkflowAlignmentReview四种完整导出JSON。无需打开原工程或启动Core/native执行文件，不恢复工作区/任务/配置/会话，不使用文件内路径读取原工程/产物。Desktop只收method，由主进程原生对话框选择路径，取消null；CLI显式文件路径。每次读后返回拥有值，已显示内容不自动跟随文件修改。

输入文件最多8MiB，显式路径realpath后用非阻塞/不跟随最终链接的只读FD，fstat须普通文件，逐块读到上限+1即拒，首/末FD大小及mtime/ctime/identity核同；预/每块/验证间协作取消，finally关闭FD，无半结果。UTF8严格、JSON及原对应DTO严格Schema；格式/编码/类型/读取/超限/完整性分别稳定saved_report_file_*错误，读取期间换代changed/6，其余文件错误3（CLI输入Shape仍2）。这是源文件大小限制，不承诺总heap/IO/时限、原子文件快照或同UID防篡改。

SavedReportFileReview为formatVersion1/file{path,bytes,contentHash}/kind(tasks|workflow|revision|alignment)/report原DTO/integrity=embedded_hashes_checked。按四原DTO的已有形状识别，未知或混合字段拒绝；核各层reviewHash及原native comparisonHash、runIds/rows/配对/未配对与原摘要关系、全部原产物清单/UTF8文本bytes+sha；原native输出沿readNativeOutput及原AnalysisReportReader核Schema/报告/位置，复用产品随附Schema、不调用分析器。所有原报告/比较指标原样展示，不重算领域比较，不证明文件来自可信来源或当前设计事实；自洽重写仍可能通过，不是来源签名。

主进程严格返回原报告包络，CLI无project要求。桌面在无工程/在线/离线工程均可Open saved report，只读对话框展示文件路径/字节摘要及完整原任务/双方原报告/比较/未配对信息，复用原任务和比较视图；文件内打开任务/源码/重跑动作禁用，无网络/执行/导出写入。关闭/卸载隔离迟到读取，打开错误不显示半报告，取消保留当前查看值。原在线审阅/导出/执行/API、全部旧机器对象/工程与RunRecord/依赖/Core ABI保持；无新持久化格式，仅新增两个输入输出定义和一个CLI/Desktop能力。


### 7.84 已校验完整报告的独立 HTML 交付

report.file.html.export（CLI report export-html --input FILE --expect-content-hash HASH --output ABSOLUTE_NEW_FILE；无Tcl）重新沿7.83读取、严格验证四种完整JSON报告，再核原文件原始bytes的expectedContentHash；不符saved_report_file_changed/6，无半输出。返回SavedReportHtmlExport{formatVersion:1,kind,input{path,bytes,contentHash},output,contentHash,bytes}，摘要/bytes分别为原输入文件与实际HTML字节。首await拥有严格输入，预及读取/渲染后取消拒绝；完整字节交给原排他发布器后沿原短发布不可取消政策返回实际结果。无工程/Core/native执行文件要求，native验证仍需原SDK/随附Schema。

HTML为UTF8单文件，固定样式、无脚本/外链/外部资产/表单/任务执行动作，CSP禁网络/脚本/对象并只许固定内联样式。固定标题/检查边界、原报告kind/projectId/reviewHash和输入摘要、原任务状态/native退出/完整性摘要、显式配对与未配对原ID、原比较完整值以及原完整报告JSON可展开读取；JSON文本经HTML转义，换行/控制字符在JSON内保留转义。无新判据或自动归因，unknown/partial/failed/cancelled等原值不升级。完整原报告JSON解析值与输入report相等；格式化/HTML转义不是输入原始文件字节副本，输入hash仍绑定原文件bytes。HTML不是7.83新的可读输入格式，也不恢复工作区或可信来源。64MiB生成HTML上限不是总heap/时限或断电保证。

Desktop仅接expectedContentHash，主进程绑定当前原生Open成功选择的文件路径；未选择或摘要不符拒绝，renderer不能传input/output/raw报告。保存框取消null且不修改当前查看值；选目标后重新完整读取并核hash，原文件变化拒绝。排他发布原算法提取为无工程文件出口的第二真实消费者，旧exportNewFile仍先执行原工程.dftstudio路径保护，旧错误/无覆盖/链接/临时文件清理保持。新HTML显式输出仅写新文件，不能覆盖原JSON/已有目标/链接。

独立查看对话框新增Export HTML，绑定该次已读contentHash；busy/选择新文件/关闭/卸载隔离旧导出状态，原JSON/服务/比较/工程/RunRecord/依赖/Core ABI和旧机器对象不变。只增加本导出所需输入/输出/严格Desktop定义及一个CLI/Desktop命令，不增加会话持久化或执行owner。


### 7.85 完整报告文件的选定任务交付与内部工程身份

7.83的每个完整任务报告须核各row.detail.run.projectId与该RunReportReview.projectId相同；原外层baseline/candidate工程身份检查贯通到根工程。不一致沿saved_report_file_integrity/3拒绝inspect及HTML，无半输出。此为内部身份一致性，不是来源签名，也不改变已允许的自洽重写/原指标不重算边界（C-S2-38-01修复，关闭由提出方C复核）。

report.file.tasks.review/export（CLI report select-tasks/export-tasks --input FILE --side tasks|baseline|candidate --run-ids-json IDS --expect-content-hash HASH；export再加--expect-review-hash HASH和--output ABSOLUTE_NEW_FILE，无Tcl）从四格式文件中明确选择一侧1..8个唯一有序任务。tasks文件仅side=tasks；其余仅baseline/candidate，缺candidate侧或成员ID拒绝saved_report_selection_unavailable/3或saved_report_selection_missing/6，不跨侧合并/自动选择/截断。首await拥有输入及IDs，重用7.83严格读取并核原文件bytes hash，变化saved_report_file_changed/6。所选rows按caller顺序深拥有、仅重编号index，完整原detail/artifacts/native不改；使用原RunReportReview定义生成新caller_order/unknown报告和原规则reviewHash。新SavedReportTaskSelectionReview含formatVersion/file（原输入canonical path/bytes/hash）/side/report，源file是读取依据，不证明执行血缘。

export重新读取/选择核expectedReviewHash，变化saved_report_selection_changed/6，输出原RunReportReview的pretty JSON+LF而非新持久格式，最多8MiB；超过saved_report_selection_limit/3，无半结果。沿原standalone排他发布器，预/读取/组装后取消拒绝，交完整字节后沿原短发布不可取消返回实际结果。返回formatVersion/input（原file）/side/reviewHash/output/contentHash/bytes。原JSON入口可直接读该交付，再用原HTML出口；不会导入历史/配置或执行任务。

Desktop只收side/runIds/expectedContentHash（export再收expectedReviewHash），主进程绑定最后成功原生Open文件，原生Save选新JSON目标，取消null；不收renderer input/output/raw报告。文件查看新增明确侧/有序IDs、选择审阅和导出。编辑侧/IDs、另开文件/关闭/卸载清旧审阅/状态，busy及generation隔离迟到值，原任务打开/源码/执行动作仍禁用。仅增加所需严格定义/两命令，无Tcl/依赖/Core ABI/工程或RunRecord迁移/持久会话；原四完整报告、HTML和领域比较判据保持。


### 7.86 独立报告内原产物的字节交付

report.file.artifact.review/export（CLI report show-artifact/export-artifact --input FILE --side SIDE --run-id ID --artifact-id ID --expect-content-hash HASH，export再加--expect-artifact-hash HASH/--output ABSOLUTE_NEW_FILE）复用7.85选择一侧一个任务，再按artifactId选唯一原ArtifactContent；零或多个匹配分别saved_report_artifact_missing/6、saved_report_artifact_ambiguous/3。原完整文件、工程身份及全部原SDK/产物摘要检查不绕过。review返回formatVersion/file/side/artifactIndex/content，content为原runId/descriptor/encoding/text拥有值；export重读核原file bytes hash及expectedArtifactHash，变化saved_report_artifact_changed/6，UTF8字节与原artifact.bytes/sha256完全相同，沿原standalone排他发布，无工程/执行文件或内部路径读取。

report.file.artifacts.review/export（CLI report artifact-bundle/export-artifact-bundle，沿7.85同侧1..8有序IDs及原file hash；export加--expect-bundle-hash HASH/新output）复用原选择审阅，按选定任务顺序和原产物顺序生成最多64文件的只读清单及USTAR包。每任务artifactId须唯一，歧义3，超过64或归档16MiB拒saved_report_artifact_limit/3，不截断。无产物时仍可交manifest-only包，保留选择/原完整报告hash，不虚构文件。

清单formatVersion1/source（原file）/projectId/side/runIds/reportReviewHash/files/freshness=unknown；每file含从0开始的taskIndex/artifactIndex、runId、原ArtifactItem、memberPath、naming。归档只含manifest.json和普通文件，固定顺序、mtime/uid/gid0、mode0600、无链接/设备/绝对路径。成员路径为tasks/四位序号/artifacts/四位序号/文件名；原relativePath仅取最终basename，若不是1..64个以ASCII字母或数字起始且只含字母数字._-的便携名字，显式生成artifact-序号.txt，清单naming标original_basename或generated并保留原relativePath。报告内目录/..、分隔符、控制字符或Unicode不能进入归档路径；不读取这些路径，也不在产品内解包。所有原文本转UTF8字节仍核原sha/bytes，不改内容。USTAR头512bytes、两零块结束，无PAX/长名/压缩，实际包内总字节16MiB上限非硬heap/IO/时限。参考GNU tar标准格式，独立Python tarfile和系统tar验证。

SavedReportArtifactBundleReview含formatVersion/file/manifest/bytes/contentHash/bundleHash；bytes/hash为实际TAR字节，bundleHash为其余包络固定JSON摘要。export重生成核expectedBundleHash后沿原排他短发布器，取消在预/读取/组装后拒绝，发布后返回实际结果。内容/源及选择全hash绑定，不认证可信来源/执行血缘/当前事实，不恢复工程/任务/配置或执行任何文件。归档是交付容器，不是新工程/RunRecord或report inspect可导入格式。

Desktop四能力仅收side/IDs/相应hash，主进程路径仍来自最后成功原生Open，Save选原单文件或TAR新目标、取消null，不接renderer input/output/raw数据。选定任务审阅后可审阅原产物清单、按项查看原文/保存、导出TAR；更改选择/新文件/同文件重开/关闭/卸载清旧清单与原文，busy/generation隔离迟到值。原参数/领域比较/四报告/JSON与HTML/发布器/SDK/Tcl/依赖/Core ABI/工程和会话格式保持，仅追加所需定义与四CLI/Desktop命令。


### 7.87 完整独立报告的离线交付包

report.file.package.review/export（CLI report package/export-package --input FILE --expect-content-hash HASH，export再--expect-package-hash HASH/--output ABSOLUTE_NEW_FILE）复用原完整file reader和所有原工程身份/SDK/嵌入摘要检查，从单次已校验拥有快照生成完整离线包。无需原工程/Core/native执行文件。首await拥有严格输入；源bytes变化saved_report_file_changed/6，packageHash变化saved_report_package_changed/6，128产物或32MiB包超限saved_report_package_limit/3，歧义产物ID仍原ambiguous/3，无截断/半包。

TAR顺序为manifest.json、report.json、index.html、所有原产物。report.json为完整原四DTO的prettyJSON+LF，保留全部比较/配对/未配对/partial/failed值，不声称与源JSON原始排版字节相同；index.html复用7.84原静态CSP/转义renderer。产物按tasks或baseline→candidate侧及原任务/产物顺序，路径在7.86安全序号路径前加侧名，原字节/descriptor保留；每任务ID唯一，合计最多128。每成员为普通USTAR，原固定metadata和安全命名规则保持，无解包/导入/执行；产品无需Python/tar依赖。

SavedReportPackageReview包含formatVersion/file/kind/manifest/bytes/contentHash/packageHash；manifest为formatVersion/source/kind/projectId/reportReviewHash/freshness=unknown/members。members包含两个固定报告成员及原产物：path/role(report_json|report_html|artifact)/bytes/contentHash/artifact，artifact为null或包含side/taskIndex/artifactIndex/runId/原ArtifactItem/naming。manifest不列自身hash以避免自引用；外包bytes/contentHash覆盖整个TAR，packageHash覆盖其余review包络。export重读重建再核expectedPackageHash，沿原standalone排他短发布器，预/组装取消拒、已发布结果返回真实成功。返回formatVersion/file/kind/packageHash/output/contentHash/bytes。

Desktop review仅expectedContentHash，export再expectedPackageHash；主进程源路径来自最后成功原生Open，Save原生选新TAR/取消null，拒renderer路径/raw内容。完整报告对话框可审阅包的全部成员/摘要并导出；新Open/关闭/卸载清确认，源变更/错误清旧包，忙及generation隔离迟到回复。只追加必要Schema/两命令，无Tcl/依赖/ABI/工程或历史会话格式改变。原8MiB输入与HTML64MiB检查保持，32MiB归档仅字节预算，非硬heap/时限/原子快照、来源认证/脱敏/当前事实/领域signoff。


### 7.88 选定任务的完整离线包及归档命名澄清

7.86命名按与OS无关的词法路径：`/`和反斜杠均视为分隔，取最后组件；不解析磁盘路径。最后组件空或不满足1..64便携ASCII规则则generated，否则original_basename。完整原relativePath保留在manifest，不缩短合法原名。普通USTAR name字段为100字节，可正好填满而不加NUL；7.87 candidate侧64字符原名形成100字节路径必须接受（C-S2-39-01修复）。原B84 A02基于POSIX唯一分隔的断言不由A修改，后续B按本明确语义记录裁定；此澄清非新实现前置。

report.file.tasks.package.review/export（CLI report task-package/export-task-package）复用7.85选择输入input/side/1..8唯一有序runIds/expectedContentHash；export再expectedPackageHash/output。首await严格拥有，原完整file身份/SDK/hash检查及所选prettyJSON8MiB预算不变，再复用7.87同一包构建器生成manifest.json、report.json、index.html及全部所选原产物。report.json是原caller_order/unknown RunReportReview，仅重排/重编号原完整rows；不包含未选任务或原跨任务comparison，不自动配对或宣称领域可比。源file是完整输入的path/原bytes/hash，不冒所选JSON的字节摘要。

新SavedReportTaskPackageManifest扩展原包清单并要求selection{side,runIds}；reportReviewHash绑定所选任务报告。kind=tasks，成员artifact.side=tasks指包内report.json，selection.side指原文件来源侧。新SavedReportTaskPackageReview使用该清单，外层沿原file/kind/bytes/contentHash/packageHash；packageHash含selection，换侧或顺序即使部分原值相同也不能复用确认。原SavedReportPackageManifest/Review机器定义不改。export返回原SavedReportPackageExport，重读/重选/重建核源及完整packageHash，再原排他短发布；错误沿原selection/file/package，未发布无目标，接受后取消返回实际发布结果。

HTML复用原静态CSP/转义renderer，新增显式所选侧/IDs和“所选任务报告”标题/说明，来源完整文件摘要单独标明，不把子集冒充完整输入。原完整HTML与完整包默认字节保持。归档仍只含普通USTAR，原128产物/32MiB和safe naming限制，无解包/导入执行/历史恢复；soft预算/unknown/非认证/未脱敏边界保持。

Desktop review仅原选择输入，export再expectedPackageHash，主进程绑定原Open路径/原生Save目标，取消null，拒renderer input/output/raw。已审任务区增加选定任务包预览/导出；更改侧/IDs/顺序、新Open/关闭卸载清旧包，busy/generation隔离迟到。原子JSON/单产物/产物包及完整报告包保持；只追加必要定义/两个CLI/Desktop方法，不加Tcl/依赖/ABI/工程或会话迁移。


### 7.89 当前项目已保存任务报告直接完整打包

run.report.package.review/export（CLI run report-package/export-report-package）将当前项目原四种已审报告直接交付为7.87同构普通USTAR，不需中间JSON文件。输入projectFile、selection判别联合{kind:tasks|workflow|revision|alignment,input:对应原RunReportInput/RunWorkflowResultsInput/RunWorkflowAlignmentInput}、expectedReviewHash；export另expectedPackageHash/output。首await前严格校验并深拥有；按kind委托原四reader生成完整原DTO，核expectedReviewHash。保留caller order、未知freshness、partial/failed/native退出、比较/pairs/未配对；不运行任务、读当前RTL、替换原数据权威或导入归档。

共用组包器接收明确项目来源：manifest.source={kind:saved_tasks,projectFile:规范路径,projectId,reportReviewHash}，其余formatVersion/kind/projectId/reportReviewHash/freshness/members沿7.87。RunReportPackageReview用source替代file，包含manifest/bytes/contentHash/packageHash；RunReportPackageExport用source替代file，返回实际output/bytes/contentHash/packageHash。包内report.json是原完整DTO pretty LF，HTML标题及来源明确来自项目已保存任务，保留全部原JSON及原静态CSP/转义，不伪造未存在的输入文件或当前设计结论。manifest无自身递归摘要，外层TAR摘要覆盖完整成员；packageHash同时绑定规范项目路径、kind、原报告和所有内容。原file/所选包及HTML默认字节保持，新来源使用独立Schema。

export重读原报告及projectId、重建包并核两级摘要，变化run_report_package_changed/6，原reader错误沿原码；再次确认项目身份后通过原项目感知exportNewFile发布，拒.dftstudio及既有/link目标，并发只一胜。预/早取消不发布，进入原短发布后返回实际成功；CLI application不得把已发布成功改取消。原8MiB完整报告、64MiB HTML、128产物和32MiB包软限额/单一命名器不变，限额拒绝不截断，零产物合法。项目及历史读取是非原子重验，不认证来源或脱敏，不引入硬heap/IO/时限承诺。

Desktop review只收selection/expectedReviewHash，export再expectedPackageHash；projectFile来自已打开workspace，output来自原生Save，取消null，拒renderer路径/raw。Tasks已审报告和三种已审workflow报告均提供直接审包/导出；按当前已审报告的IDs/pairs构造selection，编辑输入/更换报告/工程卸载清包确认，busy及generation隔离迟到。原JSON出口及无工程file出口保持。仅新增两个CLI/GUI命令，Tcl/依赖/ABI/工程/历史/会话格式不变。


### 7.90 完整离线报告包的独立只读打开

report.package.file.review（CLI report inspect-package --input FILE；Desktop同名原生Open，无Tcl）读取7.87完整文件包、7.88所选任务包、7.89项目直包三种来源，承载四种原完整DTO。旧report.file.review仍只读取JSON。无需原工程/Core/native执行文件，不读manifest内源路径，不解包、创建目录/任务或恢复工程/会话；原native SDK及随附Schema仍用于原DTO校验。

输入strict形状、首await拥有路径；共享原普通文件/FD identity/逐块取消/finally关闭读取边界，最多32MiB，读取期间变化saved_report_package_file_changed/6，其余read/type/limit/format/integrity错误3，输入形状2、取消130。内存解析最多131普通USTAR成员，首三个须manifest.json/report.json/index.html，拒路径穿越/重复/链接/目录/设备/PAX/GNU扩展/压缩/坏header或checksum/截断/非零padding及非精确双零结尾；不沿成员路径访问磁盘。包内report.json的实际字节受已读取的32MiB完整TAR总预算约束，不再套用原JSON文件入口的8MiB输入预算：合法紧凑输入经原producer格式化可能膨胀，旧合法完整包必须可往返；也不以重新compact序列化大小推断原源文件字节。原独立JSON文件入口仍限8MiB，7.88所选报告及7.89项目报告自身的序列化预算也保持原计量和拒绝行为。包内DTO经原UTF8/JSON/四DTO Schema和全部原嵌入摘要/native关系检查。共享payload解析/验证保留已有saved_report_file_*错误及取消130，未分类的解析/验证异常归一为saved_report_file_read/3，不泄漏内部异常；不要求接受过深等不支持内容，不冒包认证。

manifest严格匹配原三种定义，来源分支显式区分原file与saved_tasks；所选任务包保原selection.side及有序runIds，必须与包内原报告IDs相同。核kind/projectId/reportReviewHash及项目来源身份；委托唯一原组包器从已验证DTO和原manifest来源重新构建，完整TAR逐字节一致才接受，覆盖所有成员、普通metadata、顺序、HTML与原产物及源/selection。此版本只接收当前canonical格式1普通USTAR完整交付；tar重排/重新包装不视为原交付，不接受产物only包。内部自洽重新生成仍可能通过，不是来源签名/当前事实/领域签核；manifest源路径和hash仅原声明。

SavedReportPackageFileReview包含formatVersion1、file（实际打开包规范路径/bytes/contentHash）、package（原三种review联合，含原source或file来源与完整manifest/packageHash）、kind/report原拥有DTO、integrity=package_bytes_and_embedded_hashes_checked。打开包的file身份与package内原来源明确区分，不伪装成实际读取过原来源。原32MiB TAR/8MiB独立源JSON输入/128产物/64MiBHTML为soft预算，不承诺总heap/IO/时限或多文件原子快照。

Desktop只收method，无renderer input/output/raw/path；原生Open取消null，主进程不更新JSON文件出口选择。独立Report package入口在无工程/在线/离线均可用，复用原只读四报告内容、显示实际包身份及完整清单/原来源和选择；不执行/加载包内HTML，任务/源码/运行动作禁用。另开/错误/关闭/卸载用generation隔离迟到结果，取消保留当前值。旧JSON查看及全部出口字节、Schema旧对象、依赖/Tcl/ABI/工程格式不变。

### 7.91 已验证包成员的原文预览与单文件保存

report.package.file.member.review/export（CLI report package-member/export-package-member，无Tcl）从7.90可接受的完整包中显式选择manifest.members里的一个成员。review输入input、memberPath、expectedContentHash；export另expectedMemberHash和output。strict校验并首await拥有输入；expectedContentHash绑定实际TAR身份，不是manifest内来源声明。每次重读并完成7.90全部校验，再核TAR摘要和清单成员精确匹配；变化saved_report_package_file_changed/6，不存在的成员saved_report_package_member_missing/6，导出成员摘要不符saved_report_package_member_changed/6。memberPath不连接磁盘路径，manifest.json不是清单成员；不自动解包、创建目录或恢复工程。

SavedReportPackageMemberReview返回formatVersion1、file实际包身份、kind、packageHash、memberIndex（manifest.members零基索引）、member原清单描述及encoding=utf-8/text完整原文。Export返回相同身份和描述及实际output/bytes/contentHash，不返回text。成员字节来自本次完整校验的内存包，不重新序列化JSON/HTML或原产物，不另读原工程/源路径；不执行HTML。原32MiB/131成员/128产物软预算及旧JSON文件8MiB输入界限保持，单独保存的大JSON可能不能经旧JSON入口重开，应保留原包。原错误域、取消130与FD关闭保持，export预发布检查取消后使用原standalone exclusive publisher，既有文件/链接不覆盖，短发布完成后返回成功不改报取消；无项目绑定，不新增项目感知输出规则。

Desktop review只收memberPath/expectedContentHash，export再expectedMemberHash；主进程绑定最近成功原生Open的包路径，与JSON选择独立，Save目标来自原生对话框。取消null保留当前值；保存前后重新核完整包及两级hash。renderer明确选择成员、先预览再保存；展示原文用React文本，保存只按用户明确目标。更换成员、同文件重开、新源、错误、关闭/卸载清旧确认，busy和generation隔离迟到。仅新增两个命令和对应strict输入/输出定义，旧公开定义/报告字节/依赖/Core ABI/工程及会话格式不变。


### 7.92 从已验证完整包选择任务并再次交付

report.package.file.tasks.review/export 与 report.package.file.tasks.package.review/export（CLI report package-select-tasks/package-export-tasks/package-task-package/package-export-task-package，无Tcl）从7.90/7.91实际打开的完整包选择一侧1..8唯一有序任务。复用7.85输入、选择规则及JSON返回定义：file/input指实际TAR规范路径/bytes/contentHash，不是包内源声明。每次先严格拥有输入并完整重读校验所有包成员，再核expectedContentHash，变化saved_report_package_file_changed/6；原selection side/missing/8MiB错误保持。唯一选择器深拥有完整原rows、只重排重编号，生成原caller_order/unknown RunReportReview，不带原跨任务比较，不重算领域值、不声称脱敏。JSON export另核expectedReviewHash后发布原prettyJSON+LF，可用原JSON入口重开。

完整包review/export复用原ReportTaskSelectionArgs/ReportTaskPackageExportArgs，export另核expectedPackageHash。新ReportPackageTaskSource为{kind:saved_package,file:实际输入TAR身份,packageHash:输入包原review摘要}；SavedPackageTaskManifest使用该source、kind=tasks、selection{side,runIds}，其余沿原清单。SavedPackageTaskReview/Export用source替代原file，保留原其余包络字段。source只记录紧邻输入包，不递归嵌入旧清单，不伪造JSON来源或认证血缘。新包的report.json/HTML/原产物由唯一组包器产生，HTML明确输入是已校验包，原三来源默认字节保持。8MiB所选报告、128产物/32MiB TAR及原命名器不变。

完整包reader新增该显式来源分支，核kind=tasks和selection.runIds与报告相同，再经同一组包器完整重建逐bytes比较；source声明不访问磁盘，来源包可不存在。SavedReportPackageFileReview仅tasks分支增加此review联合，其余原字段和定义保持。新版本读原三来源及新来源；旧版本明确拒新source，不承诺旧reader读新格式。原包成员接口可预览/保存新包全部原字节。没有工程/任务历史/ABI/会话格式变更。

四方法接实际CLI和Desktop：renderer只传侧/IDs/相应hash，主进程绑定独立的最近成功包Open，Save原生选择新JSON/TAR。取消null保值，错误/换侧/顺序/重开/关闭卸载清确认并隔离迟到，包选择和成员操作互斥，原JSON选择不污染。共享原standalone排他发布器；发布前取消拒绝，已提交短发布返回真实成功。功能仅交付原报告任务，不开启原任务/源码/执行、自动解包或恢复；旧限制和unknown/非认证边界保持。


### 7.93 结构化时钟/复位检查与命名场景输入

沿7.5既有原生分析及7.56/57任务入口，Studio提供SequentialAnalysisInput及纯参数翻译sequentialAnalysisOptions。
必填scope；mode默认structural，可选logic；recursive/clockUsage/requireComplete/failOnError默认false；clockRoots与inputValues默认空。
根为{path,bit}，输入为{path,bit,value:0|1}，每组至多64项，bit为安全非负整数；场景为{name,inputValues}，显式提供时2..8项，名称唯一、非空、至多128 UTF8字节。
scenarios与全局非空inputValues互斥。structural拒绝逻辑根/值/场景/clockUsage与逻辑专属预算；usage/scenario预算仅在对应模式可用。
相同path+bit在同组拒绝重复；不同路径的语义别名、输入方向/存在/位宽仍由原生PrimaryInputs判断，不在宿主复制路径或领域规则。
文本拒绝NUL/非法scalar；scope/path不裁剪或猜测。limits可选且只接受maxFacts/maxInstances(1..100000)、maxChecks(1..10000)、maxTraceNodes(1..1000000)、maxTraceEdges(0..4000000)、maxDepth(0..1000)、maxMillis(1..60000)、maxLogicWork/maxUsageWork(1..1000000)、maxScenarioMillis(1..60000)、maxComparisons(1..100000)。未指定不改后端默认。

输出仍为原NativeAnalysisOptions，argv确定顺序：scope、recursive、logic、usage、roots、全局values或逐场景values、limits、退出政策。
报告Schema按最高实际模式选择：scenarios:1 > sequential:5(values) > sequential:4(roots) > sequential:3(usage) > sequential:2(logic) > sequential:1；不允许额外argv或Schema覆盖污染该结构化入口。原高级analysis.native完整保留。组合请求仍须满足旧128 argv/64KiB边界；每组64项不是所有最大值可同时提交的承诺。
新增analysis.sequential.preview（CLI analyze sequential-preview --input-json JSON）与analysis.sequential.run（CLI analyze sequential --project FILE --input-json JSON）；run调用唯一RunService.startNativeAnalysis，持久commandId仍analysis.native，结果/产物/退出码/取消/历史/重跑/原Tcl命令及工作流格式均保持，无工程或旧结果迁移。预览不打开工程或后端，仅做形状/模式检查；不是设计语义验证或固定磁盘快照。
Desktop仅新增纯preview typed IPC，无路径注入；新结构化表单审阅生成的argv/Schema后，通过原native启动或加入原有有序工作流。编辑即失效预览、过期响应不发布，失败可重试；已加入队列的是选定时的拥有值。真实运行读当前磁盘，旧SourceSpan摘要校验继续生效。
所有判断、场景同快照比较、partial及exit4优先/exit1策略由原原生工具给出；不执行SDC、不推导静态值下的测试协议/波形等价或领域签核。Core/原生ABI/协议/Schema、安装包与依赖不变。新增Studio请求Schema/命令是显式增量，不将旧精确库存测试自动称通过。

### 7.94 时钟/复位原报告的结果查询与证据导航

新增analysis.sequential.results（CLI analyze sequential-results --project FILE --run ID），只读已存dft-seqcheck的kind=report结果（含原生exit0/1/4，不以零违规为前提），接受原sequential:1–5及scenarios:1；完整验证仍唯一调用showNativeReport。其它工具/后端错误拒sequential_report_unavailable/3，不启动后端、不修改任务。
请求必填runId；可选expectedReportSha256（64位小写hex，不匹配native_report_changed/6）；section为checks/findings/registers/comparisons，默认checks；offset默认0，limit默认20、1..50。索引是原数组零基索引，不是筛选后行号；offset基于筛选后的稳定原顺序。非比较section在场景报告可选scenarioIndex（默认0），普通报告拒该字段；comparisons仅场景报告可用、comparisonIndex默认0，拒scenarioIndex。越界选择拒sequential_selection/2；not_run场景显式返回状态和空行，不能当作零问题或complete。
checkIndex筛选checks本项、findings.check、registers.clockCheck/asyncChecks显式引用，比较section拒该字段；pathContains按原check.path/register.signalPath或比较双方check.path做区分大小写的字面子串；rule只在checks/findings按原findings规则筛选；verdict仅checks；change仅comparisons（changed/unchanged/unresolved）。不相关筛选字段拒绝，不静默忽略；文本须合法Unicode scalar、无NUL。没有新领域判断、按叶名匹配或重排。
响应保留根quality、选定报告quality、场景名称/原status和原比较summary；缺失值用null而非零/complete，freshness固定unknown。每行含原index、JSON pointer、完整原value及原SDK locations中的source索引（仅该pointer本身/后代），total为原数组数、matched为过滤数、nextOffset只表示剩余显示行，不表示原分析完整。响应序列化8MiB上限，超限sequential_results_limit/3，不截断原value。
Desktop主进程绑定当前工程，仅接受上述请求字段；typed结果与CLI共享服务。桌面提供场景/比较选择、规则/判据/路径筛选、分页，按原finding.check/register.clockCheck/asyncChecks及比较baselineCheck/scenarioCheck导航，原source摘要读取继续核reportSha256/locationIndex，原始完整JSON保持可读。切换选择清旧页/错误并隔离迟到响应；源码视图仍为只读，不意味着修复应用或物理签核。旧命令、结果、Schema定义及所有持久格式不变。
当前重跑的任务ID可能先于record.json提交点返回。TasksPanel按原run.query区分已拥有但未在发布清单中的活动ID，显示等待并沿原runs-changed更新；不提前run.show未发布记录，也不把非活动缺失记录错误忽略。保持原任务提交点/返回/取消语义，无轮询或定时器。

7.94的新增结果边界也将普通非native任务或无原生JSON输出的native_report_unavailable定向映射为sequential_report_unavailable/3；旧analysis.native.report不改，取消、run_corrupt及真实读取/安装错误原样保留。

### 7.95 保存的时钟/复位任务条件编辑

新增analysis.sequential.inputs（CLI analyze sequential-inputs --project FILE --run ID），请求复用NativeReportArgs；Desktop只收runId。调用原reviewRunEditableInputs读取一个已发布终态任务及原provenance，不运行后端/改历史，保留原工程身份/错误/取消。仅native dft-seqcheck、sequential1..5/scenarios1可转为SequentialAnalysisInput。参数逆向转换与7.93共用limit映射及最终正向验证；支持scope/recursive/logic/clock-usage、显式clock-root、全局或逐scenario input-value、既有预算及require-complete/fail-on-error，固定元数消耗字面值，保持场景/根/值原顺序。拒未知flag/多余参数/重复单值flag/非规范非负安全十进制整数、缺scope、互斥或不能用7.93表示的组合；重建Schema须与原一致，拒sequential_inputs_unavailable/3，不静默丢弃任何原参数。原高级native及通用历史编辑入口继续可用。
SequentialInputsReview包含runId、原provenanceHash、projectHash、原parameters和规范input、inputMode=current_project/freshness=unknown；原来源只是已验证保存参数，不证明当前RTL/未来执行/精确重放。请求首await拥有，预/异步后及失败出口取消保持。返回严格新增定义，原定义/目录对象不变，无新任务或工程持久格式。
Tasks显式Load saved clock/reset inputs把只读候选送入原结构化表单，用户Apply saved clock/reset inputs才整体替换字段并清旧preview；读取错误保留已有草稿，编辑/新读取/卸载隔离迟到候选。任务/队列busy时拒Apply；载入后仍须Review，随后沿原start或工作流队列/脚本/报告执行，使用当前工程和磁盘文件。新来源不冒原rerunOf，旧任务保持不可变；原通用编辑/原始argv入口不变。

### 7.96 时钟/复位条件的工程JSON文档

新增analysis.sequential.document.preview（CLI analyze sequential-document --project FILE --document-id ID）与analysis.sequential.document.create（CLI analyze create-sequential-document --project FILE --input-json JSON）；无新Tcl命令。文档是原text.json，内容直接使用7.93 SequentialAnalysisInput，不引入独立格式包络/工程枚举或会话草稿持久化。create输入{documentId,path,expectedHash,input}，先拥有与严格验证，经同一正向编码→逆向规范化生成pretty JSON+LF；调用原createDocument(text.json,initialText)，要求原工程hash/排他ID和安全相对路径，失败不覆盖，文件发布后绑定失败仍保留文件。创建只保存条件，不运行分析。
preview输入仅documentId，只读取原工程显式绑定text.json的普通文件，复用readConfigDocument的项目路径、NOFOLLOW/NONBLOCK、严格UTF8、1MiB和取消。原文按标准JSON.parse解码，再以同一参数编码器校验全部形状/模式/预算/argv限制，返回原document{documentId,reference,text,contentHash}、projectHash、规范input和options、inputMode=saved_document/freshness=unknown。无重复键词法检查或RTL语义验证，原文本与实际解读参数都展示；不执行后端。结束复核工程diskHash，变化sequential_document_changed/6；解析JSON失败sequential_document_invalid/2，形状/模式invalid_input/2，文件/绑定错误沿sequential_document前缀及原路径错误保留。Desktop读取在本workspace核所选打开文档dirty，前后均拒sequential_document_dirty/6；当前workspace工程hash不同project_conflict/6，CLI只读当前磁盘。
原结构化表单Review成功后可Save reviewed clock/reset inputs，显式新ID/path，经原创建回调进入工程和原JSON编辑器；保存不自动覆盖任何旧文档。刷新JSON文档列表→选择→Load保存原文和规范参数候选→Apply才替换整表/清旧preview→编辑并重新Review→原native/start或拥有值队列。创建/读取互斥；编辑/选文档/刷新/新历史源/卸载清候选和迟到资格，错误保已有字段，busy禁止Apply/新读写。读取使用当时已保存bytes，外部后续修改不暗改已载入/排队参数；执行仍使用当前工程/RTL，保存参数只是显式值来源，不是文件链接执行、旧输入归档或领域签核。原高级入口、历史任务、通用JSON编辑/冲突/恢复、工作流/Tcl/报告保持。

### 7.97 有序时钟/复位条件回归

新增analysis.sequential.profiles.preview/run（CLI analyze sequential-profiles / run-sequential-profiles，--project FILE --input-json JSON）。preview输入documentIds为1..8个不同的已绑定JSON文档ID，保留顺序，可选expectedPreviewHash；run必须有该hash。逐项复用7.96读取/校验/唯一编码，生成原AnalysisWorkflowPreview；返回documents（每项documentId/reference/contentHash/规范input）、workflow、previewHash、inputMode=saved_documents/freshness=unknown。摘要绑定有序来源身份、原文hash和原工作流（包括项目hash）；不重复返回最多8MiB原文。聚合层核初末工程及每项读取projectHash一致，否则sequential_profiles_changed/6；单文档读取内部发现工程变化仍沿sequential_document_changed/6。expectedPreviewHash不符也同码；原文档解析/绑定/文件错误保持，不把不可读当作成功变化。
Desktop先后检查全部选中JSON编辑器dirty（sequential_document_dirty/6）及workspace项目hash（project_conflict/6）。服务首await前深拥有请求、每次读取和返回检查取消；读取不启动后端。run重新读取核摘要、检查dirty、交原acceptTaskWorkflow/BatchService执行所审阅拥有值，stop_on_task_error、终态/取消/产物沿原批次；最后acceptTaskWorkflow的再次dirty/hash拒绝保留原run_workflow_dirty/run_workflow_changed。CLI只读磁盘且完整drain/close。接受后外部JSON修改不暗改参数；RTL/工程依原当前输入执行，不是磁盘事务快照或旧RTL重放。原RunRecord不增加文档来源持久字段，原参数/provenance仍唯一历史证据。
桌面新增条件回归面板，刷新绑定JSON→显式选择/排序/移除→审阅来源摘要/规范参数/Tcl→运行，或重新核摘要后原子追加全部native步骤到既有当前输入工作流。后一入口沿原8步/草稿/忙态约束，拒绝时不部分追加；队列拥有值，可通过原工作流保存/导出Tcl及结果入口，后续文件变动不追踪链接。编辑选择/刷新/卸载令旧审阅/迟到响应无效，失败保选择、清失效审阅可重试。新增strict DTO/目录/typed IPC，旧对象/工程/RunRecord/会话/Core/native/ABI/依赖不变；无新Tcl命令或执行owner。

### 7.98 保存的时钟/复位检查结论对照

新增analysis.sequential.compare及.export（CLI analyze compare-sequential / export-sequential-comparison，--project FILE --input-json JSON）。两侧选择{runId,scenarioIndex?,expectedReportSha256?}；普通报告禁止scenarioIndex，场景报告默认0，越界沿sequential_selection/2。唯一loadSequentialReport复用原SDK/Schema验证及7.94的unsupported错误分类，不启动后端/改任务。每侧返回原run/hash/Schema、选定场景名/状态、scope/algorithm/formatVersion/recursive和原根/选中quality；not_run没有报告，不能当空complete。两侧必须有report且scope/algorithm/formatVersion/recursive相同，否则eligible=false、明确reasons且不产生对照行。外层单场景报告与scenario内同算法版本可对照。
每个check按原path、point.slice.bits.lsb/width、显式side或null的元组字面分组，不使用opaque ref、数组位置或叶名猜测；原side缺省不等同inside/outside，width=0也不猜实际宽度。任侧同key多项标ambiguous并保留全部原索引/指针，绝不任意配对。唯一双侧只比较原verdict与按rule/severity排序的findings多重集合，标changed或unchanged；不是源信号/波形/逻辑等价或物理改善判决，不比较跨快照opaque源ref。单侧存在时，只有双方选定及根quality均complete才标added/removed，否则unresolved；双方都有的已报告结论可对照但保留quality。
输入可选status六枚举/pathContains字面过滤（合法Unicode scalar、无NUL）、offset默认0、limit默认20且1..50；顺序为baseline首次key顺序再candidate新增key。summary是全部key状态计数，total/matched/nextOffset只描述显示集合。每行含key/status及两侧全部原check{index,pointer,value,findings,locationIndices,registerIndices}；registerIndices仅来自原register.clockCheck/asyncChecks显式引用，供原寄存器source导航，不按名称猜关联；source仍由原native.source以run/hash/location验证。输入check合计上限100000（不静默截断），迭代每128项让出并检查取消；页序列化8MiB，超限sequential_comparison_limit/3。输入首await前深拥有。comparisonHash绑定完整页，freshness=unknown，mode=verdict_and_rules。
export输入加expectedComparisonHash/output，重新读取同一页并核摘要，不符sequential_comparison_changed/6；沿原exportNewFile排他发布pretty JSON+LF，不覆盖/不写内部目录。输出复用NativeComparisonExport；导出的是明确页，不冒完整比较集合。Desktop绑定工程/导出对话框，原baseline picker选择历史、显式加载两报告/场景、筛选分页和原双侧source证据；更换选择清旧页/证据、隔离迟到，原完整JSON比较保留。新增strictDTO/目录/typedIPC，旧对象/Core/native/ABI/依赖/工程/任务/会话格式不变。

### 7.99 Wrapper 保存报告的结果与证据追查

新增 analysis.wrapper.results（CLI analyze wrapper-results --project FILE --input-json JSON），Desktop 绑定当前工程。输入 {runId,expectedReportSha256?,section?,rowIndex?,textContains?,offset?,limit?}；section 是已定义的 Wrapper 结果数组名，缺省选最外层阶段的主数组，offset 默认0、limit 默认20且1..50。rowIndex 选择原数组索引，textContains 对 JSON.stringify(原完整记录) 作大小写敏感字面子串过滤（合法 Unicode scalar，无NUL），不是正则/路径解析/领域查询。单报告没有的 section 或越界 rowIndex 拒绝 wrapper_selection/2；不存在的过滤匹配为空页。

唯一原 showNativeReport/SDK/Schema/RunStore 校验后，接受 wrapper-boundary/cell-plan/chain-plan/chain-coverage/chain-clocks/chain-resets/chain-compatibility/chain-activity/activity-schedule/chain-explanation 的 v1 报告。配置比较继续原专用视图，此入口不把配置比较冒单报告；普通任务、backend_error 或不支持 Schema 为 wrapper_report_unavailable/3；原 native.report 错误保持，取消/损坏/安装/读取错误原样传播。expectedReportSha256 变化沿 native_report_changed/6。

沿各已知报告的 source 包络收集边界、单元计划、链布局、覆盖、时钟、复位、兼容、活动、调度、解释阶段。响应包含原 scope、每阶段 pointer/complete/reasons/counts/stop（未提供为null）、可选 section 清单与原数组总数；不合成 quality、通过判决或重算数字。数组覆盖 ports/边界 rows、plan rows/sharedSignals、layout chains/rows、coverage rows/ports、clocks checks/groups/rows/chains、resets inputs/checks/rows/chains、compatibility groups/rows、activity rows/batches、schedule rows、explanation rows/locations。缺阶段不提供 section，不补成空 complete。freshness=unknown；显示分页不影响原 complete。

行保留原 index/pointer/完整 value、原 SDK locations 中本行及其后代的 locationIndices，以及显式关系 links {label,section,rowIndex,available}。关系只取原 sourceRow/cellRow/chainRow/chain/group/check/input/batch/compatibilityRow、链 segment 的 sourceRow、解释段的 boundaryRow/clockRow/resetRow/portLocation/stateLocation 等已定义索引；跨层按原报告结构定位，不按名称/opaque ref/叶名猜测或跨 run 配对。目标未包含时 available=false；无引用不构造链接。链段和关系仍在原完整行中，不截断原值；界面分页显示链接，明确目标 section/index，保留原 source pointer。

首 await 拥有严格请求，加载前后及扫描每128行让出检查取消。单 section 至多100000原行，页序列化至多8MiB，超限 wrapper_results_limit/3，拒绝而不截断。服务不运行后端、不改历史。桌面只读取当前选择，切换/过滤/重试清旧页与源码并隔离迟到结果；按 links 导航并可返回上一选择，源码仍用原 run/hash/location 核验。原原始报告、配置编辑/运行及保存比较保持。只新增 API/CLI/typed IPC/Schema；无新任务、导出/执行 owner、Tcl、依赖、native/Core/ABI 或持久格式变化。此能力解释已有 RTL 规划结论，不宣称插链、当前 RTL 等价或物理签核。


### 7.100 Memory 保存结果与原规划关联

analysis.memory.results（CLI analyze memory-results --project FILE --input-json JSON）为只读已发布dft-memory单报告入口，调用唯一showNativeReport/RunStore/SDK/原Schema。支持memory-map、library-memory、macro-interfaces、memory-test-plan/rules/domains/schedule/timing/coverage/assessment、memory-clock-sources/check、memory-resource-usage的v1；不接受三种comparison（原比较视图保留）。普通任务/不支持报告仅在新边界拒memory_report_unavailable/3，原native reader错误不改，损坏/安装/取消原样传播。无后端执行、任务历史写入或领域重算。

MemoryResultsInput必填runId；expectedReportSha256可选64小写hex、不匹配native_report_changed/6；section为固定原集合枚举，默认当前最外结果集合；rowIndex是原数组索引（0..100000），textContains为1..4096合法scalar无NUL文本，按JSON.stringify完整原值区分大小写字面包含；offset默认0（0..100000），limit默认20（1..50）。缺失section/越界rowIndex拒memory_selection/2；原集合超过100000或页序列化超过8MiB拒memory_results_limit/3，不截断value。请求在首await前深拥有，读取前后及扫描每128行yield检查取消。

页保留run/hash/schema/exit/freshness=unknown/scope、各原stage的pointer/complete/reasons/counts/stop、原集合pointer/total、筛选matched、分页nextOffset及行原index/pointer/value。counts只投影阶段自身原数字/字符串标量（排除formatVersion/algorithm），不求和/更改单位；原无complete/reasons/counts/stop用null，不把未报告当complete/零。Memory的来源树按原algorithm及source/investigation/report/analysis/interfaces/catalog字段解析，library与rules封套保留对应集合，不按名称重绑定。

各行links只引用原显式索引：映射→macro/model，macro→catalog实例，计划→mapping/assignment/controller，controller→model/profile/steps内plannedMemory；时钟→mapping/macro/group，domain→mapping/assignment/group/clock，clock-check→domain/expectation；schedule waves→controller，timing→声明clock/等待resource/dependency；coverage→macro/mapping/plannedMemory/controller/wave，assessment→macro/coverage/clockCheck，resource usage→声明resource/原timing wave，rules choice→memory/rule/assignment。局部pin/step/entry/interval/source保留在完整原父记录内，不当全局数组索引。目标不存在available=false；不猜名称、计算调度或赋新判决。原SDK locationIndices仅取同pointer或后代，Memory无SourceSpan时明确无来源位置，不凭path生成坐标。

Desktop主进程绑定当前工程，renderer不可注入工程路径；提供section、字面筛选、分页、显式跳转/返回、原记录和每层完整性，复用原配置编辑/保存/重审/重跑。切换/错误/卸载隔离迟到，旧完整JSON/配置比较/历史保持。与Wrapper抽取共用原值分页和结果展示，Wrapper既有DTO/筛选/错误/标签不变、领域关系适配独立。新增严格Schema与命令；无原生/C++/依赖/ABI/工程或会话格式更改。本单元不等于MBIST插入、物理时序或S4整体完成。

7.100 同链兼容修复：7.62 的plan配置若显式含rules，按原后端输出选择memory-test-rules:1；显式assignments仍memory-test-plan:1。其余stage/原参数/规则优先级不变，既有错误历史不重写。原native入口仍可显式选择自己的Schema。


### 7.101 保存的 Memory / Wrapper 条件恢复

新增analysis.planning.inputs（CLI analyze planning-inputs --project FILE --run ID），只读终态native任务，原previewNativeScript/RunStore验证provenance与参数，原savedConfiguredEvidence验证已记录的配置选择。仅wrapper和memory单配置；比较/其它tool不在此入口支持。响应PlanningInputsReview包含runId、provenanceHash、projectHash、原parameters、selection(kind/input)、documents(documentId/reference)、recoveryMode(recorded_selection/parameter_paths)、inputMode=current_project/freshness=unknown。不运行后端、不写文件、不预审当前JSON内容，也不认证当前RTL或重放旧输入。

有原配置证据时使用显式documentId和原选择；不以旧路径替换当前绑定。无配置证据的旧native/脚本任务，仅支持现有配置入口能表达的单报告参数。正向构造参数集中供原preview与逆向验证共用；逆向按固定元数读取所有参数、拒重复/未知/冲突/丢失开关和不匹配Schema，保留scope/recursive/requireComplete/stage，允许开关顺序变化但不放宽语义。根据当前工程workingDirectory解析显式参数路径，与当前text.json绑定解析后的绝对词法路径精确匹配；workingDirectory沿原配置编码器解析realpath，位于声明cwd下的绝对路径同步该目录别名（如macOS /var与/private/var），相对路径基于实际cwd。支持相对/绝对与正规化点段；不对配置文件追realpath/inode或内容、不按文件名/目录搜索猜绑定。零匹配/多匹配均拒planning_inputs_binding/3；已有证据的ID缺失/类型变化同码。可读内容/文件存在与JSON有效性留给原Preview，便于修复已损坏/缺失配置。

不支持类型/参数为planning_inputs_unavailable/3；仅将原native_script_unavailable映射到该新边界，原run_corrupt/读取/取消保持；不将配置证据损坏回退为路径猜测。输入严格runId，首await前拥有，前后取消；读取开始/结束工程hash不一致planning_inputs_changed/6。Desktop绑定当前workspace并核projectHash；无新Tcl、原Schema/原命令对象/持久化格式/依赖/Core/ABI改变。原通用历史编辑/配置历史/重跑保持。

Tasks显式Load saved planning inputs读取只读候选，标清来源模式、原参数及当前绑定；只有Apply saved planning inputs才把对应Memory或Wrapper表单选择整体替换、清旧preview并展开。候选读取/Apply期间不修改JSON；必须重新Preview再走原dirty/hash/运行或工作流队列保护。更换来源、表单编辑、刷新、其它动作和卸载清候选/隔离迟到；busy禁止应用。成功Apply后再次修改配置不会暗改已排队值，原配置工作流执行语义保持。已记录ID与原路径匹配是两种明确来源，不合并为历史文件快照。

7.101 同链兼容修复：Memory/Wrapper 表单沿原单个 active latch 互斥；刷新期间编辑会废弃旧响应，但该请求结束仍须释放自身 busy 状态，避免表单和历史恢复入口永久禁用。返回数据/错误仍按 revision 隔离，未允许重叠写入。


7.101 目录别名范围补充（cycle246，回应B89-AMB-01/C-S2-44-01）：workingDirectory为工程相对路径时同样支持相对参数、规范绝对参数、同一cwd的目录别名绝对参数；显式绝对别名cwd亦支持。仅对路径的目录前缀做realpath，前缀必须精确等于实际cwd，余下词法后缀原样保留；不追配置文件或cwd以下目录的别名，不按basename/inode/内容配对。不存在的配置仍可按绑定恢复，供后续修复；多个绑定归一到同一路径继续拒绝。既有ID选择优先不变。

### 7.102 保存规划记录的显式对照

新增analysis.planning.compare / analysis.planning.compare.export（CLI analyze compare-planning / export-planning-comparison --project FILE --input-json JSON）。输入kind=memory|wrapper及baseline/candidate两侧{runId,section,rowIndex,expectedReportSha256?}；section为对应原结果枚举，rowIndex必填0..100000。用户显式选择两条记录，不按名称/数组位置自动认作同一对象。首await前严格校验并深拥有输入；复用7.99/100的唯一reader/SDK、选择、原关联及错误。两侧返回原limit=1完整结果页（含所有stage元数据、section列表及所选行原值/pointer/locations/links）；报告身份以sha核验，不调用后端、不写历史。

仅同scope、同section、同原stage可做JSON对照；不兼容仍返回两侧原页、eligible=false及理由，不伪造差异。模式selected_records_json，freshness=unknown。复用原diffNativeJson：对象按键、数组按位置，最多200变化/100000访问/512字节差异预览；changes.pointer相对所选原值，完整原值不截断。complete及stopReason仅表示差异遍历完整性，不代表原报告完整性或工程有效性；无差异且未完成不得标相同。结果序列化最多8MiB，超过拒planning_comparison_limit/3；原页限制继承，不宣称reader heap硬界。comparisonHash=sha256:摘要覆盖其余整个响应的JSON字节。取消检查继承两reader与diff，并在返回前检查。

导出附加expectedComparisonHash、output；重读重算若不等拒planning_comparison_changed/6，使用原exportNewFile独占写新文件，导出完整已审响应，返回原NativeComparisonExport；不覆盖旧文件。桌面导出路径只由主进程保存对话框选取，renderer无projectFile/output注入。Saved outputs可选基线、两侧集合/原索引、查看两侧质量及完整原值/差异/原源码证据，再导出；选择变化清旧响应与导出资格，忙态互斥，代际/卸载隔离迟到。源码仍使用原run/hash/location核验，缺本行位置明确无证据。原整报告对照/结果浏览/条件恢复/配置工作流保持。

无新Tcl、持久格式、原生算法/Core/ABI/依赖变化；新增严格Schema/typedIPC/API/CLI。此对照不推断业务对象身份、输入等价、预算改进、MBIST/插链或物理签核；S3/S4整体仍未完成。

### 7.103 Memory test-config 结构化批量编辑

在既有S4配置/保存/原生规划闭环上新增 `analysis.memory.test.preview` / `.save`，CLI `analyze preview-memory-test` / `save-memory-test --project FILE --input-json JSON`。输入documentId及changes；changes只接受可选完整assignments数组、clocks数组、planningPolicy、schedulingPolicy、timingPolicy。省略字段保留；提供数组/策略对象则替换对应整组（空数组/空对象明确清空），不按名称推断合并，不生成实例或时钟。策略映射原planning/scheduling/timing.policy，其余limits/resources/dependencies等原值保留；clocks映射timing.clocks。rules模式可改策略/周期，但拒绝提供assignments而隐式转换模式；独立memory-test-rules仍使用原JSON编辑器。

Preview只读已绑定text.json当前磁盘，原1MiB/UTF8/普通文件界限；原native memory-test-config Schema唯一校验领域字段，显示原文与完整候选、项目/原文/候选hash、明确替换字段、validation=schema_only。原JSON重复键（包含转义同名）、非标量Unicode、超过64层或非安全整数/非整数字面量拒绝结构化改写，以免重序列化改变信息；指数/小数数字拼写请先在原JSON编辑器显式规范化。候选按2空格加换行序列化并限1MiB；不声称原生语义/RTL有效，仍需原配置Preview/Run。

Save必须带expectedReviewHash，重读项目/原JSON重算候选并核同；使用已有ProjectWorkspace租约、openDocument/changeDocument/saveDocument与atomicReplace，不创建第二写入owner。拒绝已打开dirty或旧磁盘基线、项目变更、文档路径变更；编辑前最后检查版本与取消，进入编辑/保存提交段后不响应取消，返回实际保存结果。保存失败不回滚磁盘或覆盖新外部字节，保留候选dirty及原恢复草稿；错误包含文档标识，桌面重新同步原编辑器。成功返回原DocumentEditorSnapshot，Undo仍能恢复此前文本；CLI工作区关闭前保留原恢复机制。空changes允许只读装载，不作为Save授权；Save空修改拒绝。无自动运行、自动选择/规则展开、自动取舍。

桌面Memory配置面板提供表格批量编辑实例路径/domain/partition及周期，三类原策略数值字段；装载与编辑清除旧review，只有已审候选可显式Save。重读/保存期间同面板busy互斥，变更/卸载代际隔离；保存后同步现有打开文档并清除运行Preview，需重新审阅运行。严格Schema/typed IPC/API/CLI同步新增；原410定义/196命令对象不改，无工程/RunRecord/ABI/Core/依赖迁移。不重开M5/M6冻结、不把作者验证称B/C验收。

### 7.104 Wrapper 配置的显式字段组编辑

新增 analysis.wrapper.edit.preview/save，CLI analyze preview-wrapper-edit / save-wrapper-edit（--project FILE --input-json JSON）；typed IPC 仅绑定当前工程。输入 {documentId,changes}；save 增 expectedReviewHash。changes 可选 ports:string[]、rules:原 planning.rules、planningPolicy:原 planning.policy、chains:原 chaining.chains、assignments:原 chaining.assignments、defaultChain:string|null。省略保留，提供整组替换，null 仅用于删除 defaultChain；空数组/对象仍按原 native Schema。scope、mode、limits 和未选择组原值保留。不隐式切换 boundary/cells/chains：boundary 禁止规划/链字段；cells 禁止链字段，拒 wrapper_edit_mode/2。JSON 形状、取值及候选使用原 wrapper-config Schema；关联语义（容量、位段、命名、完整性）由原 native 执行判定，不在 Studio 另算。

review 返回 projectFile/projectHash/documentId、originalText/originalHash、candidateText/candidateHash、拥有的 changes、replacedFields、原 mode、validation=schema_only 及绑定整个 body 的 reviewHash。读取复用原普通绑定 JSON/UTF8/1MiB边界；结构化编辑的重复键、非标量Unicode、深度64、安全整数字面量检查与7.103共享，避免解析再序列化丢信息。候选 pretty JSON+LF 至多1MiB；不修改原JSON读取入口。preview允许空changes用于载入，save拒空changes。

7.103与本节共享已审文档提交机制、无损JSON检查及renderer载入/审阅/保存的生命周期hook；各自字段表格和类型独立，Memory原DTO/错误/序列化含义保持。save重读核review/project/hash/dirty/旧文档基线，经原ProjectWorkspace租约、changeDocument/checkpoint、捕获revision的saveDocument及atomicReplace提交。wrapper_edit_dirty/changed与memory_test对应，既有project_conflict及底层冲突保持。提交前取消不编辑，提交后返回实际结果；失败留原恢复草稿，不添加writer或自动回滚。CLI最终释放本次workspace并保留失败草稿。

桌面在原Wrapper配置面板按原mode载入表格：端口、规则及可选位段、策略、链容量、端口分配及可选位段和默认链。明确选择整组替换，可复查原文/候选后保存；清除旧运行审阅，原JSON编辑器同步并保留Undo/Redo，重新审阅后沿原native/队列运行。编辑/选择/卸载隔离迟到响应，busy互斥；保存失败刷新原恢复候选。新增契约不改旧对象、工程/任务/会话持久格式、Core/native/SDK/ABI或依赖，不表示新插链算法或S4整体完成。
