# dft-core 架构 + 底层路线图

> 仓库 `dft-core` 是 DFT 工具链的**原生(C++)内核套件**。装多个分层库,被(将要重写的)
> Hierarchyshower / newProject UI 当薄客户端共用。本文定架构、目录归属、四个底层方向怎么做、顺序。
>
> 日期:2026-06-28 ｜ 状态:Draft ｜ 前置:`2026-06-27-hdl-core-design.md`(hdl-core 库设计)、
> `2026-06-27-DesignHierarchy-complete.md`(四层数据模型)、`2026-06-27-layers-and-api.md`(分层职责/API)

---

## 0. 命名

- **仓库 `dft-core`**:DFT 工具链原生内核套件(伞名)。
- 库:`hdl-core`(HDL→设计模型)、`genconn-core`(连接生成)、`drc-core`(DFT-DRC)。
- 早先否掉的是把 HDL **引擎**叫 dft-core(会窄化引擎);现在 dft-core 是**整个套件**的名字,内含 hdl-core 等库,不冲突。

---

## 1. 组织原则:一个仓库 + 多个分层库(不是都塞进 hdl-core)

判据 = **对 slang 的依赖** + **关注点**:

```
              依赖 slang(设计模型)
        ┌───────────────────────────┐
        │  hdl-core  (libhdlcore)    │  HDL→设计模型:hierarchy/ports/netlist/behavior
        │   方向① get-netlist        │  (slang 唯一落点)
        │   方向② interface/类型/参数 │
        └─────────────┬─────────────┘
                      │ link
          ┌───────────┴───────────┐
          ▼                       ▼
   ┌──────────────┐       ┌──────────────────┐
   │ drc-core     │       │ genconn-core     │
   │ (libdrc)     │       │ (libgenconn)     │
   │ 方向④ DFT-DRC│       │ 方向③ 连接生成    │  基本不依赖 slang(纯业务)
   └──────────────┘       └──────────────────┘
```

- **方向①② → `hdl-core` 库内**(它们就是设计模型本身)。
- **方向④ DFT-DRC → 独立库 `drc-core`**,链接 hdl-core(跑在设计模型上)。
- **方向③ 连接生成 → 独立库 `genconn-core`**,基本独立(连接生成不解析 RTL;需要端口时可选调 hdl-core)。

**为什么分库**:三种不同关注点(把 HDL 变模型 / 在模型上查规则 / 把连接规格变文件),边界清晰、能独立测试、各自演进。塞一起会让 hdl-core 变大杂烩。

**为什么一个仓库(monorepo)**:三库共享 `third_party/slang` 打包 + 构建系统,最终被合并 App 一起用;分仓库要复制 slang、跨仓依赖更麻烦。

---

## 2. 目录结构

```
dft-core/                          ← 仓库(umbrella)
  CMakeLists.txt                   顶层:构建各库 + 各 CLI
  third_party/slang/               vendored slang v10.0.101(共享)
  hdl-core/                        → libhdlcore(slang)。现有,方向①②在此扩展
    ir/        DesignIR.h
    frontend/  SlangCompile        唯一 #include slang
    service/   Filelist Hierarchy DesignDb SlangHelpers
               (+ Netlist 方向① / TypeInfo 方向②)
    json/      JsonWriter JsonValue
    protocol/  NdjsonServer
  genconn-core/                    → libgenconn(方向③,新增)
    model/ expand/ order/ generate/ validate/ parse/ document/ tcl/ vinject/
  drc-core/                        → libdrc(方向④,新增,链接 hdlcore)
    rules/ ...
  app/
    cli_main.cpp                   hdl(serve/dump/query)—— HDL 引擎
    (genconn CLI / drc CLI 随各库加)
  test/
    unit/ diff/ rtl/
  docs/
```

> 现状:`hdl-core/`(原 `core/`)已就位,P0–P3 完成并差分验证;`genconn-core/`、`drc-core/` 待建。

---

## 3. 四个方向「怎么做」

### 方向① get-netlist 整层网表(hdl-core,先做)

- **做什么**:给一个实例,返回其 body 内**一整层**:所有 net(`InstanceBodySymbol`(Scope)的 `membersOfType<NetSymbol>` / `VariableSymbol`)+ 所有子实例端口和本模块边界端口到 net 的绑定。
- **怎么做**:复用已有 `connNet`(`getPortConnections`→`getExpression`→`getSymbolReference`);拼接/部分位连接用 `LSPUtilities::visitLSPs` 兜底。产出 `LocalNetlist`(= 完整数据模型 L3)。
- **放哪**:`hdl-core/service/Netlist.{h,cpp}`;新增 `DesignDb::getNetlist(ownerInstanceId)` + RPC `get-netlist`。
- **怎么测**:Python daemon 无此方法 → 无现成 oracle。推荐**先给 Python daemon 加一个参考 `get-netlist`**(几十行,它有全部 slang 访问),再走差分;或手写小 RTL + 已知网表 golden。

### 方向② interface 端口展开 + 类型/参数(hdl-core)

- **做什么**:`InterfacePortSymbol` 展开成 modport 信号;`Type` 出 struct/enum/packed 细节(`TypeInfo`);`getParameters()` 出参数表。
- **怎么做**:扩展 `SlangHelpers::portDicts` + 新增 `TypeInfo` 提取;`get-ports` 加字段(向后兼容,只增),或加 `get-parameters`。
- **放哪**:`hdl-core/service/`(扩展 SlangHelpers + 新 TypeInfo)。
- **怎么测**:同①(Python 参考实现差分,或带 interface/参数的小 RTL golden)。

### 方向③ 连接生成 → `genconn-core`(独立库)

- **做什么**:移植 newProject `src/core/` 的 10 个 TS 模块到 C++:`model` / `expand`(总线→信号)/ `order` / `generate`(核心)/ `validate` / `parse` / `document` / `tcl` / `vinject` / index。
- **放哪**:`genconn-core/`,独立库(不解析 RTL;校验端口时可选链接 hdl-core)。对外:`genconn` CLI(连接规格 JSON → `.top_level_ports_and_connectionss` / `.tcl` / 注入后 .v)。
- **怎么测**:**最强 oracle —— TS 实现 + golden 文件**(`newProject/.../top.top_level_ports_and_connectionss`,70+ 测试)。差分:同一输入跑 TS `generate` 与 C++ `generate`,逐字节/语义比对。
- **提醒**:连接生成**不是壁垒**、有 golden 兜底说明现状没问题、纯为"统一原生内核"。540 行的 `edit.ts` 等要精确复刻,风险中等。

### 方向④ DFT-DRC → `drc-core`(独立库,壁垒增量,靠后)

- **做什么**:clock/reset 可控性检查——从每个时钟/复位 net 反向追到 PI,判可控;gated-clock、clock-as-data、reset-as-logic 等(见 `veirlogPaser/DFT-DRC-详解.md` 的 6 条)。
- **怎么做**:跑在设计模型上,用方向①的整层网表 + 已有 `trace-drivers`/AnalysisManager 行为层 + 跨层向上追。
- **放哪**:`drc-core/`,链接 hdl-core。对外:`drc` CLI / 报告。
- **依赖**:**必须在①之后**(要整层网表 + 跨层连通)。
- **怎么测**:无现成 oracle(新能力)→ 手写小 RTL,每条规则配已知 pass/fail golden;可选 yosys 当标尺交叉验证。
- **提醒**:四个里**最需先单独 brainstorm/写 spec** —— 规则精确定义、"什么算可控"的边界要先定清,不能直接开写。

---

## 4. 顺序 + 测试 oracle 总览

| 顺序 | 方向 | 库 | 风险 | oracle / 测试 |
|---|---|---|---|---|
| 1 | ① get-netlist | hdl-core | 低 | Python 参考实现差分(或手写 golden) |
| 2 | ② interface/类型/参数 | hdl-core | 低 | 同上 |
| 3 | ③ 连接生成 | genconn-core | 中 | **TS + golden 差分(最强)** |
| 4 | ④ DFT-DRC | drc-core | 高(先 spec) | 手写 golden + yosys 标尺 |

确认顺序:**①②③ 先做,④ 靠后**(需先写 DRC spec)。

---

## 5. 已完成基线(不在本路线图内,供参考)

hdl-core 库 P0–P3 已完成并差分验证为 Python daemon 的逐字节 drop-in:
- 结构(hierarchy/expand)、接口(ports + 参数化 overrides)、源码定位
- trace-fanin/fanout(实例拓扑)+ trace-drivers(AnalysisManager 行为 fanin)= **Show on Schematic 后端已完整**
- NDJSON daemon(`hdl serve`)+ CLI(dump/query);openc910 17100 实例,~25× pyslang
- 详见 `2026-06-27-p0-p1-results.md`

---

## 6. 下一步

按本路线图,先给**方向① get-netlist** 写详细实现 plan(`docs/superpowers/plans/`),含:Python 参考 `get-netlist`(做 oracle)、`LocalNetlist` 结构、`DesignDb::getNetlist`、RPC、差分测试。
