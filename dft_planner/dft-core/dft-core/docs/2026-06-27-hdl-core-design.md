# hdl-core 设计规格(Spec)

> slang C++ 设计层次内核 —— 把 `.v` filelist 解析、elaborate、转成 `DesignHierarchy`,
> 作为 Hierarchyshower / newProject 共享的统一原生内核。
>
> 日期:2026-06-27 ｜ 状态:Draft(待 review)｜ 仓库:`dftartist/dft-core`

---

## 0. 背景与动机

现状:

- **Hierarchyshower**:Electron + React/TS,用 **pyslang**(Python 绑定)起一个常驻 daemon
  (`tools/hierarchy_daemon.py` + `extractor.py`),NDJSON over stdio,已能把 filelist 转成
  `DesignHierarchy` JSON(见 `Hierarchyshower/docs/DesignHierarchy.md`)。
- **newProject(GenConnection)**:纯 TS。`src/core/` 把连接规格生成 Tessent 连接文件,
  **不解析 Verilog**,有 70+ 测试 + golden 文件兜底。
- **veirlogPaser**:前期研究,结论是 slang 生产可用、pyslang 对 MVP 够用,并勾勒了
  "语言无关 IR + 可插拔前端" 与 clock/reset DFT-DRC 方向。

为什么现在转 C++(四个动机,均已确认):

1. **性能与规模** —— openc910 级(~15000 实例):daemon 启动、内存、lazy 展开延迟,要原生速度、进程内 elaborate。
2. **打包成单一二进制** —— 去掉 Electron 对 Python/pyslang 运行时的依赖,发一个自包含程序。
3. **统一共享内核 / 技术壁垒** —— 一个 C++ 内核被 Hierarchyshower + newProject + 未来 DFT-DRC 共用。
4. **掌控 elaborate 流程** —— 直接用 slang C++ API,拿 pyslang 表面拿不到的能力(自定义 pass、DRC、网表级分析)。

最终形态(已确认):**C++ 内核做成独立引擎(daemon/CLI),说 NDJSON;
Hierarchyshower、newProject 都是薄客户端;最终两者合并成一个软件,共享这个内核。**

---

## 1. 范围

**本期(P0–P4)做:**

- 用 slang(C++ 库)把 `.v` filelist → `DesignHierarchy`。
- 复刻现有 Python daemon 的全部能力:hierarchy 树、lazy 展开、端口、源码定位、trace(fanin/fanout/drivers)。
- 对外说 **NDJSON over stdio**,与现有 daemon **同契约**——UI 几乎不动。
- 出**独立二进制**(daemon + CLI),静态链接 slang,无 Python 运行时依赖。
- **差分测试**:以现有 Python daemon 为 oracle,保证逐字段一致。

**本期不做(留接口 / 后续阶段):**

- newProject 的连接生成核心:**暂留 TS**(有 golden 兜底,非性能瓶颈,非壁垒)。
- DFT-DRC 引擎(clock/reset 检查):留接口,后续。
- VHDL 前端(GHDL adapter):留接口,后续。
- 两个 app 合并的 UI 工作:后续。

---

## 2. 语言决定:C++20(不是 C,也不是 Rust)

被 slang 锁死,不是偏好问题:

- **slang 是 C++20 库**,核心是 `slang::ast::Compilation` / `InstanceSymbol` 这些类与模板。
  **C 无法直接消费** C++ 类(只能再套 `extern "C"` 壳,纯属加活)。
- **Rust 不行** —— 没有成熟的 slang 绑定;要么自己写 C++ FFI 桥(等于还是写 C++),要么重写解析器(不可能)。
- "单二进制 + 进程内 elaborate + 掌控 pipeline" 三个动机都指向**直接链接 libslang 的 C++**。
- 协议壳(NDJSON)与缓存用 C++ 写也最省事,保持一个二进制。

→ **整个内核 C++20,slang 当库静态链接。**

---

## 3. 构建产物:静态库 + 可执行二进制(不发布动态库)

这是本 spec 明确要回答的问题:**编成动态库、静态库,还是二进制?**

### 3.0 先用大白话讲清三个概念

- **可执行二进制(executable)**:用户/系统能**直接运行**的程序,比如 `./hdl-engine`。双击或命令行就能跑。
- **静态库(`.a`)**:一**盒零件**。它**不能单独运行**,只是给我们自己用的半成品;编译时被**焊进**最终的可执行程序里。
  程序发布后,这盒零件已经在程序肚子里了,**不需要再带它**。
- **动态库(`.so` / `.dylib`)**:一个**外挂插件文件**。程序**运行时**才去硬盘上**找它、加载它**;
  所以发布程序时**必须把这个文件一起带上、放对位置**,否则用户一跑就报"找不到库"。

**我们的选择:把内核逻辑做成静态库(零件盒),焊进两个可执行程序里。** 这样每个程序都是
**自带全部零件、放哪都能跑、不依赖任何外部 `.so/.dylib`** 的独立程序 —— 这才叫"单一自包含二进制"。

### 3.1 三个产物各自是干嘛的

- **`libhdlcore`(静态库,零件盒)**:内核全部逻辑编译成的半成品。**用户永远不直接接触它**,
  它只是被下面两个程序焊接进去。slang 也一样,被焊进去,不单独存在。
- **`hdl-engine`(可执行,长期后台运行)**:常驻的后台**引擎进程**。Hierarchyshower 一启动就把它当子进程
  拉起来;之后用户每展开一个节点、点一个端口,UI 就通过管道(NDJSON)问它、它答复。
  **一个打开的设计 = 一个 hdl-engine 进程**(替换现在那个 Python daemon)。
- **`hdl`(可执行,命令行查询工具)**:打开项目后**逐个查** —— `hdl ports/def/inst/netlist/…` 各拿一项,
  `hdl dump` 整树导出(对应现在的 `dump_hierarchy.py`)。每次运行重新编译、跑完即退;给人/脚本/CI/差分测试用。
  (详见 [`2026-06-27-layers-and-api.md`](2026-06-27-layers-and-api.md) §5。)

### 3.2 形态一览表

| 产物               | 形态                    | 内容                                                                        | 为什么                                                                                                                                                                   |
| ------------------ | ----------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `libhdlcore`     | **静态库 `.a`** | 内核全部逻辑:`ir` + `frontend` + `service` + `cache` + `protocol` | ① 满足"单一自包含二进制"——Electron`resources/` 里不用额外带 `.so/.dylib`;② 将来做 N-API addon / 合并 app 时同一个静态库直接复用,不改;③ 链接期优化、版本锁定省心 |
| slang              | **静态链接**      | slang 及其依赖(fmt 等)                                                      | 不留外部`.so`,保持单二进制                                                                                                                                             |
| `hdl-engine`      | **可执行二进制**  | 常驻 daemon,NDJSON over stdio                                               | Hierarchyshower / 未来合并 app`spawn` 它(替换现 Python daemon)                                                                                                         |
| `hdl` | **可执行二进制**  | CLI 查询工具(`ports`/`def`/`inst`/`netlist`/`dump`…)                  | 人/脚本/CI/差分测试;`hdl dump` 对应`dump_hierarchy.py`                                                                                                                  |

两个可执行都**静态链接 `libhdlcore` + slang ⇒ 各自是一个自包含二进制**。

**为什么不对外发布动态库(`.so`/`.dylib`)?** 那会破坏"单一自包含二进制"的目标,还要管运行时
库路径。动态库形态**只保留给未来**:当两个 app 合并、需要把内核直接嵌进 Node 时,做一个
**N-API addon(`.node`,本质是动态库)** —— 那时同一个 `libhdlcore`(可能编成 PIC 静态库或
直接编进 `.node`)被复用。**所以"核心做成库"这个决定,现在就为将来铺好了路。**

一句话:**核心 = 静态库 `libhdlcore`;对外交付 = 两个自包含可执行二进制;动态库留给将来的 N-API。**

---

## 4. 架构总览与数据流

```
.v filelist ──> [slang Driver: 解析选项/filelist/+define+/+incdir+]
            ──> [slang Compilation: 单棵树 elaborate]
            ──> [frontend/slang_adapter: 填进语言无关 IR]
            ──> [service: 根选择/假顶过滤 · lazy expand · ports · trace]
            ──> [protocol: NDJSON]  <──stdio──>  Electron daemon.cjs(不变)
            └──> [cache: design.hierarchy.json]
```

进程模型(不变):**一个设计一个引擎进程**。`Compilation` 常驻内存(slang 的 symbol 是 arena
分配,指针在 Compilation 存活期内一直有效),所以**一次 elaborate、之后每次 expand/select/trace
都很快**——和现在 pyslang daemon 同思路,但原生速度 + 无 Python。

**铁律:只有 `frontend/slang_adapter.cpp` 能 `#include` slang。** 上面所有层只认 `ir/`。
这样升级 slang、以后加 VHDL adapter 都不波及上层——这就是"统一内核 + 壁垒"骨架。

---

## 5. 目录结构与模块职责

```
hdl-core/
  CMakeLists.txt                 slang 用 FetchContent 拉、钉版本、静态链接
  core/                          → 编成静态库 libhdlcore
    ir/        DesignIR.h        InstanceNode / ModuleDefinition / PortInfo + slang 句柄
    frontend/  slang_adapter.cpp 唯一碰 slang 的地方(以后加 ghdl_adapter.cpp)
    service/   compile.cpp       Driver 解析 → 单树 → 候选顶
               root_filter.cpp   过滤 SRAM/PLL 死假顶(移植 extractor.py 逻辑)
               expand.cpp        走一层 body.members → 子实例(lazy)
               ports.cpp         get-ports(def 代表实例 + 按 node 的 overrides)
               trace.cpp         fanin / fanout / drivers(AnalysisManager)
    cache/     hierarchy_cache.cpp  design.hierarchy.json 缓存(mtime + schemaVersion)
    protocol/  ndjson_server.cpp 请求/响应/ready 事件,对齐现有契约
  app/                           → 编成可执行二进制
    daemon_main.cpp              hdl-engine:常驻 daemon(NDJSON)
    cli_main.cpp                 hdl:命令行查询工具(roots/defs/def/inst/ports/netlist/drivers/dump)
  test/
    differential/                差分测试(以 Python daemon 为 oracle)
    unit/                        手写小 RTL 单测
  docs/
    2026-06-27-hdl-core-design.md  本文件
```

### 5.1 把模块当成一条"流水线"——跟一次操作走一遍

模块职责其实就是**一条把 RTL 变成"可点击的树"的流水线**,每个模块是一道工序,只做一件事、交给下一道。

**开局(用户打开一个 filelist):**

1. **service/compile + slang Driver**:读 filelist、处理 `+define+`/`+incdir+`,把所有 `.v` 编成**一棵 slang 树**并 elaborate。〔进 = filelist；出 = slang Compilation〕
2. **service/root_filter**:slang 给一堆候选顶(含 27 个死 SRAM 假顶),挑出**真顶**。〔进 = 候选顶；出 = rootInstanceIds〕
3. **frontend/slang_adapter**:把真顶这一层翻译成 **IR 的 InstanceNode**(只这一层,懒)。〔进 = slang symbol；出 = ir/InstanceNode〕
4. **protocol/ndjson_server**:把根 + 候选顶打包成 `ready` 事件,一行 JSON 写到 stdout。〔出 = NDJSON〕

→ UI 画出树的第一层。

**之后(用户展开 `soc_top.u_cpu`):**

5. **protocol** 收到一行 `{"method":"expand-children","params":{"nodeId":"soc_top.u_cpu"}}`。
6. **service/expand**:找到该节点的 slang 句柄,走它 body 的**一层** members,得到子实例。
7. **frontend/slang_adapter**:把这些子实例翻译成 InstanceNode。
8. **protocol**:打包成响应一行 JSON 发回。

→ UI 展开这一层。(点端口走 **service/ports**;Show on Schematic 走 **service/trace + L3 网表**;各是一道独立工序。)

**贯穿始终:**

- **ir/** 是工序之间传递的**统一零件**——谁都只认它,不认 slang。
- **cache/** 把算过的结果(整份 hierarchy JSON、已展开的句柄)存起来,下次不重算。

> 一句话:每个模块只做一件事,数据沿 `filelist → slang → ir → NDJSON` **单向流动**;
> `slang_adapter` 是唯一碰 slang 的工序,`ir` 是唯一的"通用零件"。

---

## 6. 组件详解(逐项解释"还需要什么"的那张表)

> 用户要求:把组件表里每个功能讲清楚是什么意思。下面逐项展开。

### 6.1 Design IR / 设计模型 —— `core/ir/`

**是什么**:语言无关的内存数据模型,整个内核的中枢。**完整四层数据模型(结构/接口/连接/行为)
见 [`2026-06-27-DesignHierarchy-complete.md`](2026-06-27-DesignHierarchy-complete.md)** —— 现有
`Hierarchyshower/docs/DesignHierarchy.md` 只覆盖前两层(结构 + 接口),L3 连接 / L4 行为是为连接生成、
DFT-DRC 补的。核心结构:

- `InstanceNode`:层次树里一个具体实例。字段:`id`(=hierarchicalPath,稳定唯一)、
  `instanceName`、`kind`(module/primitive/blackbox)、`definitionId`、`parentInstanceId`、
  `childInstanceIds`、`isLeaf`、`childrenLoaded`、`instantiationLine?`、`portWidthOverrides?`。
- `ModuleDefinition`:模块定义,按 `name|绝对路径` 去重(一个定义被多次实例化只存一份)。
  字段:`id`、`designName`、`filePath?`、`definitionLine?`、`ports?`、`parameters?`。
- `PortInfo`:端口。字段:`name`、`direction`(in/out/inout)、`width`、`busLabel`(预渲染
  `data[31:0]`)、`portKind?`。
- 另含**内部 elaborate 句柄**:每个 `InstanceNode` 持有指向 slang `InstanceSymbol*` 的不透明
  句柄,供 lazy 展开/取端口用(不序列化、不出 IR 边界)。

**为什么重要**:所有上层只认 IR,不认 slang。换/升级解析器只动 adapter。

### 6.2 Frontend adapter / 前端适配 —— `core/frontend/`

**是什么**:唯一与具体 HDL 解析器耦合的层。`slang_adapter` 负责:驱动 slang 编译、遍历
slang 的 symbol 树、把它翻译成 IR。
**为什么重要**:这是"可插拔前端"。以后支持 VHDL = 加一个 `ghdl_adapter`(GHDL→yosys→JSON 或
GHDL 直接出),上层零改动。**加语言 = 加一个 adapter,不动内核。**

### 6.3 Filelist / 选项解析 —— `service/compile.cpp`(用 slang Driver)

**是什么**:读 `.v` filelist(`.f` 文件),处理 `+define+宏`、`+incdir+包含目录`、`-y 库目录`、
`-f 嵌套 filelist`、路径替换(`--subst`)。
**怎么做**:直接用 slang 的 `slang::driver::Driver`——这些选项全免费,比现在 `extractor.py`
手写的那套健壮得多。

### 6.4 Service / 查询层 —— `core/service/`

**是什么**:内核业务逻辑,跑在 IR 上,除了通过句柄触发 lazy elaborate 外不直接碰 slang。包含:

- `compile`:编译 + 建根候选。
- `root_filter`:假顶过滤(见 6.6)。
- `expand`:展开一个节点的一层子实例(lazy)。
- `ports`:取端口,含参数化实例的 `portWidthOverrides`(见 6.x / DesignHierarchy.md §3.7)。
- `trace`:fanin / fanout / drivers。
  **为什么重要**:这是对外暴露的"能力集合",直接对应现有 daemon 的 7 个 RPC 方法。

### 6.5 协议 / 传输壳 —— `core/protocol/ndjson_server.cpp`

**是什么**:把 service 的能力包成 **NDJSON(一行一个 JSON)请求/响应/事件**,over stdio。
请求 `{"id","method","params"}` → 响应 `{"id","result"}` / `{"id","error"}`;启动发 `ready` 事件
(候选顶 + defCount)。
**为什么重要**:与现有 Python daemon **同契约**,所以 Electron 侧 `daemon.cjs` 只改 spawn 命令,
UI 一行不动。

### 6.6 根选择 / 假顶过滤 —— `service/root_filter.cpp`

**是什么**:slang 的 `topInstances` 只是**候选**,里面混着大量没被实例化进设计的死假顶
(SRAM、PLL、testbench、vendor macro)。实测 openc910 报 29 个候选,其中 27 个是死 SRAM 假顶。
这一层把**真顶**挑出来(支持多真顶并列)。
**为什么重要**:它本身就是产品价值——用户要看的是真设计树,不是一堆假顶。逻辑须**忠实移植
`extractor.py`**(见 §7 硬约束)。

### 6.7 缓存 / 持久化 —— `core/cache/hierarchy_cache.cpp`

**是什么**:把整份 `DesignHierarchy` 导成 `design.hierarchy.json`,按 **filelist mtime +
schemaVersion** 做 key,命中就不重编;另含 lazy 句柄缓存(已展开实例的指针存 map,按 id 寻址)。
**为什么重要**:大设计不能每次全量重编;懒加载 + 缓存是规模可扩展的关键。

### 6.8 Diagnostics / 诊断

**是什么**:slang 的编译错误/警告,用 `TextDiagnosticClient` 格式化后透传 UI(文件 + 行号)。
**为什么重要**:filelist 不全、语法错时,用户要看得到原因。

### 6.9 构建系统 —— `CMakeLists.txt`

**是什么**:CMake;slang 用 `FetchContent` 拉源码、钉版本、静态链接;`core/` 出静态库
`libhdlcore`,`app/` 出两个可执行(见 §3)。
**为什么重要**:可复现构建 + 单二进制交付。

### 6.10 测试 —— `test/`

**是什么**:见 §8。差分测试(Python daemon 当 oracle)+ 规模测试(openc910)+ 单元测试。
**为什么重要**:这是整个重写**去风险的核心**。

### 6.11 DFT-DRC 引擎(future)

**是什么**:clock/reset 可控性检查,跑在 IR 上(prior 研究里的高价值方向)。
**本期**:只在 service 留接口,不实现。

### 6.12 连接生成核心(future)

**是什么**:newProject 的 `generate`/`edit`/`validate`/`expand`/`vinject`。
**本期**:**暂留 TS**(有 golden 兜底、非性能瓶颈、非壁垒)。以后再评估迁 C++。

### 6.13 打包

**是什么**:把 `hdl-engine` 二进制放进 Electron `resources/`,像现在 spawn Python 一样 spawn 它
(`HDL_ENGINE` 环境变量指定路径,默认 `resources/hdl-engine`)。
**为什么重要**:落地"单二进制、无 Python 依赖"。

---

## 7. slang C++ API 映射 + 硬约束

| 现在(pyslang)                                 | C++(slang)                                                                                                                                         |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SyntaxTree.fromFiles` + 手写 filelist 解析 | **`slang::driver::Driver`**(`+define+`/`+incdir+`/`-y`/`-f` 全免费)                                                                |
| `Compilation` / `getRoot().topInstances`  | `slang::ast::Compilation` / `getRoot().topInstances`                                                                                           |
| `comp.getDefinitions()`                     | `compilation.getDefinitions()`                                                                                                                   |
| `instance.body` 走 members                  | `InstanceSymbol::body` → `InstanceBodySymbol::members()`,判 `SymbolKind::Instance/InstanceArray/GenerateBlock(Array)`                       |
| `body.portList`                             | `body.getPortList()` → `PortSymbol`/`MultiPortSymbol`/`InterfacePortSymbol`;方向 `port.direction`,位宽 `port.getType().getBitWidth()` |
| `sm.getFullPath / getLineNumber`            | `SourceManager::getFullPath(BufferID)` / `getLineNumber(SourceLocation)`                                                                       |
| `comp.getAllDiagnostics()`                  | 同名 +`TextDiagnosticClient` 格式化                                                                                                              |
| `AnalysisManager.analyze`                   | `slang::analysis::AnalysisManager`(trace-drivers 用)                                                                                             |

**硬约束(必须满足,否则差分测试不过 + 破坏现有数据):**

- 稳定 `id`(= hierarchicalPath,带数组 `[i]`、generate/array 元素取 path 末段)和
  `definitionId`(= `name|绝对路径`)**必须与现有 Python 输出逐字一致**——否则 newProject 里已存的
  `domainId` 绑定会失效。
- 因此 `root_filter` 与 id 合成要**忠实移植 `extractor.py`**,不是重新发明。

---

## 8. 测试策略(去风险的核心)

**差分测试 —— 现有 Python daemon 当"标准答案 oracle":**

1. 同一份 RTL,C++ `hdl dump` vs Python `dump_hierarchy.py`,整份 `DesignHierarchy` JSON
   逐字段比对(ids / definitionIds / childInstanceIds 集合 / kind / isLeaf 全等)。
2. 对一组探针 node/port,逐个 RPC 方法比对输出。
3. 测试集:`rtl_test/gps_baseband`(已知 7762 FF)、`new/chip.v`、最后 `openc910`。

**规模测试**:openc910 测 compile 时间 / 内存 / expand 延迟——验证"性能"动机兑现多少(对比 pyslang)。
**单元测试**:手写小 RTL 覆盖 参数化 / generate / array / blackbox / 多 top。

→ **Python daemon 在差分测试全绿之前不删,一直当 oracle。**

---

## 9. 与现有 UI 的对接(drop-in)

- `Hierarchyshower/electron/daemon.cjs` 里 spawn 的命令:`python3 hierarchy_daemon.py` → `./hdl-engine`
  (路径由 `HDL_ENGINE` 决定,默认 `resources/hdl-engine`)。
- `ready` 事件、7 个方法(`expand-children`/`get-ports`/`get-source-location`/
  `trace-fanin`/`trace-fanout`/`trace-drivers`/`ping`)的 JSON 形状**不变**。
- 打包:二进制进 `resources/`,spawn 方式同现在。**彻底去掉 Python/pyslang 运行时依赖。**

---

## 10. 分阶段计划(都在"建 C++ 引擎"范围内)

| 阶段                        | 内容                                                                                                                     | 验收                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| **P0 地基**           | CMake + slang FetchContent 在 macOS 能编出来;`hdl-engine` 编一个文件、打印 top instances                                | 能跑、能打印                          |
| **P1 hierarchy 导出** | Driver 解析 filelist → 单树 → 根选择/假顶过滤 →`hdl dump` 出 `DesignHierarchy` JSON                     | **rtl_test 差分测试通过**       |
| **P2 daemon**         | NDJSON 壳 +`open`/`ready`/`ping`/`expand-children`(lazy)/`get-ports`/`get-source-location`;切 `daemon.cjs` | Hierarchyshower 全链路跑在 C++ 引擎上 |
| **P3 trace**          | `trace-fanin`/`trace-fanout`/`trace-drivers`(AnalysisManager)                                                      | trace 差分测试通过                    |
| **P4 规模 + 打包**    | openc910 验证 + 二进制进 Electron resources                                                                              | 规模/内存达标、打包可分发             |
| 🔜 后续                     | DFT-DRC 引擎、VHDL adapter、迁 newProject 核心                                                                           | ——                                  |

---

## 11. 风险与缓解

| 风险                                 | 缓解                                               |
| ------------------------------------ | -------------------------------------------------- |
| id 方案漂移(破坏现有绑定 + 差分失败) | 差分测试 + 忠实移植`extractor.py` 的 id/假顶逻辑 |
| slang API 变动                       | 钉 slang 版本 + 全锁在`slang_adapter` 一个文件里 |
| `AnalysisManager` 较新/接口不稳    | trace 单独成 P3,可降级                             |
| 跨平台单二进制                       | 先 macOS 静态链接,Linux 后补                       |
| FetchContent 首次编译慢              | 钉版本 + CI 缓存;可选 vcpkg/预编译(见待定②)       |

---

## 12. 待 review 拍板点

- **②** slang 获取方式:**FetchContent 拉源码编**(干净、可钉版本,首次编译慢)vs **vcpkg/预编译**。
  本 spec 默认 FetchContent。
- **③** 分阶段顺序是否要调。
- 仓库名 `hdl-core` 是否合适。
