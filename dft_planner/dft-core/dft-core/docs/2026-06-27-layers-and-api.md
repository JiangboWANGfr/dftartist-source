# 分层职责 + 对外 API / CLI

> 本文档讲两件事:① 内核**每一层的职责**(谁干什么、依赖谁、禁止什么);
> ② 内核**对外提供的 API 与 CLI**。
>
> 日期:2026-06-27 ｜ 状态:Draft ｜ 命名:已定 `hdl-core`
>
> 二进制:`hdl-engine`(daemon)/ `hdl`(CLI 查询工具);静态库:`libhdlcore`。

---

## 0. 命名:`hdl-core`

引擎本质是个**通用 RTL elaboration + 设计模型内核**,DFT(连接生成 / DRC)只是**跑在它上面的一个应用**,
VHDL 以后也要接。所以用通用名 `hdl-core`,不用 `dft-core`(那会把通用引擎窄化成"DFT 专用")。

---

## 1. 先厘清:有两种"层",别混

|                    | 是什么                          | 有哪些                                                                   |
| ------------------ | ------------------------------- | ------------------------------------------------------------------------ |
| **代码分层** | C++**源码**怎么组织成模块 | `ir` / `frontend` / `service` / `cache` / `protocol` / `app` |
| **数据分层** | 设计**模型**装哪些信息    | L1 结构 / L2 接口 / L3 连接 / L4 行为(见`DesignHierarchy-complete.md`) |

两者**正交**:代码层是"工序",数据层是"信息"。关系是 —— `service` 里每个能力对应一个数据层:

| 数据层  | service 能力     | 对外方法                      |
| ------- | ---------------- | ----------------------------- |
| L1 结构 | 展开子实例       | `expand-children`           |
| L2 接口 | 取端口/类型/参数 | `get-ports`                 |
| L3 连接 | 取一层局部网表   | `get-netlist`               |
| L4 行为 | 取信号驱动       | `get-drivers` / `trace-*` |

---

## 2. 代码分层职责

**依赖方向(铁律,只能从上往下依赖):**

```
app  →  protocol  →  service  →  frontend  →  ir
                         ↘  cache  ↗            ↑
                                    (frontend 还依赖 slang)
ir 不依赖任何人;只有 frontend 碰 slang。
```

逐层:

### 2.1 `ir/` —— 设计模型(纯数据)

- **职责**:定义语言无关的数据结构(`InstanceNode`/`ModuleDefinition`/`PortInfo`/`NetInfo`/…)+ 指向
  解析器内部对象的**不透明句柄**。
- **拥有**:数据类型本身。
- **依赖**:无(只标准库)。
- **暴露**:数据结构 + 句柄类型。
- **禁止**:❌ 不含算法 ❌ 不碰 slang ❌ 不做 IO。它就是"通用零件",谁都认它。

### 2.2 `frontend/` —— HDL → IR 翻译(唯一碰 slang 的层)

- **职责**:驱动 slang 编译、遍历 slang symbol、合成稳定 id、把结果翻成 `ir`。
- **拥有**:所有 slang 调用、id/defId 合成规则、句柄的真实含义。
- **依赖**:`ir` + slang。
- **暴露**:`Frontend` 接口 —— `open(filelist) → roots`、`expand(handle)`、`ports(handle)`、
  `netlist(handle)`、`drivers(handle, net)`。**入参出参全是 `ir` 类型,绝不漏出 slang 类型。**
- **禁止**:❌ 不含业务策略(假顶过滤那种归 service)。换 VHDL = 加一个 `ghdl` 实现这个接口。

### 2.3 `service/` —— 能力编排(业务逻辑)

- **职责**:把 frontend 的原始能力组织成对外"能力集合";含**假顶过滤**、**懒加载调度**、**缓存协调**。
- **拥有**:`root_filter`、lazy 策略、trace 算法编排。
- **依赖**:`ir` + `frontend` + `cache`。
- **暴露**:`DesignService` —— `open` / `expandChildren` / `getPorts` / `getNetlist` / `getDrivers` /
  `traceFanin` / `traceFanout` / `getSourceLocation`。**这是内核真正的 API(见 §4)。**
- **禁止**:❌ 不碰 slang ❌ 不碰 stdio / JSON(那归 protocol)。

### 2.4 `cache/` —— 缓存与持久化

- **职责**:`design.hierarchy.json` 落盘缓存(key = filelist mtime + schemaVersion);已展开句柄/结果的内存缓存。
- **依赖**:`ir`。
- **暴露**:`get` / `put` / `invalidate`。
- **禁止**:❌ 不算业务,只存取。

### 2.5 `protocol/` —— NDJSON over stdio 壳

- **职责**:读写一行行 JSON、按 `id` 关联请求响应、开局发 `ready` 事件、错误编码。
- **依赖**:`service` + `ir`(序列化)。
- **暴露**:`runStdioServer(service)`。
- **禁止**:❌ 不含业务逻辑 —— 它只把 JSON ↔ `DesignService` 调用互相翻译。换个协议(gRPC/HTTP)只改这层。

### 2.6 `app/` —— 入口

- **职责**:命令行参数解析,把 `service` 接到 `protocol`(daemon)或直接出 JSON(CLI)。
- **依赖**:全部。
- **产物**:`hdl-engine`(daemon main,`daemon_main.cpp`)、`hdl`(CLI 查询工具,`cli_main.cpp`)。

---

## 3. 对外有三个 API 面(分清"真 API"和"适配层")

```
       ┌─────────────── 真正的 API ───────────────┐
CLI  ──┤                                          │
NDJSON─┤──►  DesignService (C++ 库 API, libhdlcore) ──► frontend ──► slang
       └──────────────────────────────────────────┘
```

| API 面                    | 形态                                       | 给谁用                                     | 本质                          |
| ------------------------- | ------------------------------------------ | ------------------------------------------ | ----------------------------- |
| **C++ 库 API**      | `libhdlcore` 的头文件(`DesignService`) | 将来 N-API addon / 直接链接 / 合并后的 app | **真 API**              |
| **NDJSON 进程 API** | stdio 上的一行行 JSON                      | 现在的 Electron 客户端                     | 库 API 的**进程适配**   |
| **CLI**             | 命令行                                     | 离线 / CI / 差分测试                       | 库 API 的**命令行适配** |

> 关键:**NDJSON 和 CLI 都是薄壳,真正的能力在 C++ 库 API(`DesignService`)。**
> 所以"对外 API"= `DesignService` 的方法集;NDJSON / CLI 只是它的两种调用方式。

### 3.1 `DesignService` —— `libhdlcore` 对外的真 API(逐方法)

这就是 `libhdlcore` 的头文件长相。**打开一个 HDL 项目 = `open()` 一次(编译+elaborate),
之后所有 def / inst / port / 连接 / 驱动 都是这个对象上的方法:**

```cpp
namespace hdl {

struct OpenOptions {                                  // = filelist + slang 选项
  std::vector<std::string> filelists;                 // .f 文件
  std::vector<std::string> defines;                   // "NAME=VAL"
  std::vector<std::string> incdirs;
  std::vector<std::string> tops;                      // 限定真顶(空=自动)
  std::vector<std::pair<std::string,std::string>> substs;  // 路径替换
};

class DesignService {
 public:
  // 生命周期:一次 parse+elaborate,对象常驻持有 Compilation
  static std::unique_ptr<DesignService> open(const OpenOptions&, Diagnostics&);

  // —— L1 结构 ——
  std::vector<std::string>  rootInstanceIds() const;              // 真顶
  std::vector<CandidateTop> candidateTops()   const;              // 候选顶(含假顶,带标记)
  const InstanceNode*       instance(std::string_view nodeId) const;     // 单个 inst
  ExpandResult              expandChildren(std::string_view nodeId);     // 展开一层子实例

  // —— 定义 ——
  std::vector<std::string>  definitionIds() const;                // 所有 def 的 id
  const ModuleDefinition*   definition(std::string_view defId) const;    // 单个 def

  // —— L2 接口 ——
  PortsResult               getPorts(const NodeOrDef&);           // 端口(+ 参数化 overrides)

  // —— 源码定位 ——
  SourceLoc                 getSourceLocation(LocKind, const NodeOrDef&);

  // —— L3 连接 ——
  LocalNetlist              getNetlist(std::string_view ownerInstanceId);

  // —— L4 行为 ——
  SignalDrivers             getDrivers(std::string_view ownerInstanceId, std::string_view net);
  TraceResult               traceFanin (std::string_view nodeId, std::string_view port);
  TraceResult               traceFanout(std::string_view nodeId, std::string_view port);

  // —— 批量导出 ——
  DesignHierarchy           dumpHierarchy(const DumpOptions&);
};

} // namespace hdl
```

**一张表看全:同一个方法,三种叫法(库 API ↔ NDJSON ↔ CLI),一一对应:**

| `DesignService` 方法(真 API) | NDJSON method                      | CLI 子命令                                     |
| ------------------------------ | ---------------------------------- | ---------------------------------------------- |
| `open()`                     | spawn 时隐含                       | 每个子命令先隐含`open`                       |
| `rootInstanceIds()`          | `ready` 事件                     | `hdl roots`                                  |
| `candidateTops()`            | `ready` 事件                     | `hdl roots --all`                            |
| `definitionIds()`            | `list-defs` 🆕                   | `hdl defs`                                   |
| `definition(defId)`          | `get-def` 🆕                     | `hdl def <defId>`                            |
| `instance(nodeId)`           | `get-inst` 🆕(UI 平时用 expand)  | `hdl inst <nodeId>`                          |
| `expandChildren(nodeId)`     | `expand-children`                | `hdl children <nodeId>`                      |
| `getPorts(node\|def)`         | `get-ports`                      | `hdl ports <nodeId\|defId>`                   |
| `getSourceLocation(...)`     | `get-source-location`            | `hdl loc --inst <id>` / `--def <id>`       |
| `getNetlist(owner)`          | `get-netlist` 🆕                 | `hdl netlist <nodeId>`                       |
| `getDrivers(owner,net)`      | `get-drivers` 🆕                 | `hdl drivers <nodeId> <net>`                 |
| `traceFanin/Fanout(...)`     | `trace-fanin` / `trace-fanout` | `hdl fanin` / `hdl fanout <nodeId> <port>` |
| `dumpHierarchy(...)`         | (整树 dump)                        | `hdl dump [-o] [--ports] [--netlist]`        |

> 带 🆕 的 NDJSON 方法是为对齐库 API 而新增的查询接口(现有 UI 不强依赖,但补上后 CLI/脚本能逐个查)。

### 3.2 调用路径:NDJSON / CLI 怎么"落"到 `libhdlcore`

**三个入口,最后都落到同一组 `DesignService` 方法。**

CLI 一次查询 `hdl ports f.list u_cpu.u_alu`:

```
app/cli_main 解析参数
  → DesignService::open({filelists:["f.list"]})     // libhdlcore:一次 parse+elaborate
  → svc->getPorts("u_cpu.u_alu")                     // libhdlcore:service→frontend→slang
  → 打印 JSON → 进程退出
```

daemon `hdl-engine f.list`(Electron 用,**编一次、查很多次**):

```
app/daemon_main
  → svc = DesignService::open(...)                   // 一次编译,常驻
  → 循环:stdin 读一行 NDJSON
        → protocol::dispatch(line, *svc)             // method 名映射到 svc 方法
              "get-ports" → svc->getPorts(...)
        → 返回值序列化成一行 JSON → stdout
```

Electron 端到端:

```
React 点端口 → daemon.cjs 写 {"id":1,"method":"get-ports","params":{"nodeId":"u_cpu.u_alu"}}\n
  → hdl-engine:protocol 解析 → svc->getPorts → 结果 → 一行 JSON → stdout
  → daemon.cjs 读到行,按 id resolve promise
```

> 所以:**`protocol` 把 NDJSON method 翻译成 `svc->方法()`;`cli_main` 把子命令翻译成 `svc->方法()`。
> 两者都只是"翻译官",真活全在 `DesignService`。**

---

## 4. NDJSON 进程 API(方法清单)

**生命周期**:Electron `spawn` 引擎 → 引擎编译+elaborate → 发 `ready` 事件 →
之后"请求一行 / 响应一行" → 关闭设计时 kill 进程。

**消息格式**:请求 `{"id","method","params"}`;响应 `{"id","result"}` 或 `{"id","error":{code,message}}`;
事件 `{"event":"ready",...}`。

**已实现的 9 个方法 + ready 事件(全部差分验证为 Python daemon 逐字节 drop-in):**

| 方法 / 事件 | 入参 | 出参 | 数据层 |
| --- | --- | --- | --- |
| `ready`(事件) | — | `{candidateTops, defCount}` | L1 |
| `ping` | — | `{roots, defCount}` | — |
| `expand-children` | `{nodeId}` | `{childInstanceIds, children:[meta…]}` | L1 |
| `get-ports` | `{defId}`\|`{nodeId}` | `{ports:[{name,direction,width,busLabel,type,portKind,interfaceType,modport}], portWidthOverrides}` | L2 |
| `get-parameters` 🆕② | `{defId}`\|`{nodeId}` | `{parameters:[{name,value,type,isLocal}]}` | L2 |
| `get-source-location` | `{kind, defId\|nodeId}` | `{file, line}` | L1/L2 |
| `get-netlist` 🆕① | `{ownerInstanceId}` | `{ownerInstanceId, nets:[{name,width,busLabel,netKind}], connections:[{instanceId,port,direction,net}], truncated}` | L3 |
| `trace-fanin` / `trace-fanout` | `{nodeId, port}` | `{edges:[…], nodes:[meta…], truncated}` | L3 |
| `trace-drivers` | `{nodeId, port}` | `{sources:[{kind,id,label,detail,file,line,bus}], netName, bus}` | L4 |

原 7 个与现有 Python daemon 同契约;`get-netlist`(①)、`get-parameters`(②)、端口 `type`/`portKind`/
`interfaceType`/`modport`(②)为补完 L2/L3 后新增(Python daemon 也加了同语义实现作差分 oracle)。
方向④ 将再加 `get-sequential`(枚举时序元件 + clock/reset 边沿,见 drc-core spec)。

---

## 5. CLI

两个二进制:**`hdl-engine`**(daemon,给 GUI)+ **`hdl`**(命令行查询工具,给人/脚本/CI)。
公共选项(都接受):`[--define NAME=VAL]... [--incdir DIR]... [--top NAME]... [--subst FROM=TO]...`。

### 5.1 `hdl-engine` —— daemon(编一次,查很多次)

```
hdl-engine <filelist> [公共选项]
```

- 编译给定 filelist 后**常驻**,从 **stdin** 读 NDJSON 请求、向 **stdout** 写 NDJSON 响应。
- 由 Electron `spawn`(路径默认 `resources/hdl-engine`,可用 `HDL_ENGINE` 覆盖)。
- 退出:stdin EOF 或收到 `shutdown`。

### 5.2 `hdl` —— 命令行查询工具(打开项目后逐个拿 def / inst / port)

**正是你要的:** 打开/解析一个 HDL 项目后,用子命令逐个查。每个子命令 = 一个 `DesignService` 方法,
输出 JSON(可 `| jq`):

```
hdl roots    <filelist> [--all]            # 真顶(--all 连假顶,带标记)
hdl defs     <filelist>                    # 列出所有 module definition 的 id
hdl def      <filelist> <defId>            # 单个 def:designName/filePath/line/参数
hdl inst     <filelist> <nodeId>           # 单个 inst:kind/definitionId/父子/行号
hdl children <filelist> <nodeId>           # 展开一层子实例
hdl ports    <filelist> <nodeId|defId>     # 端口(L2:name/dir/width/busLabel/类型)
hdl netlist  <filelist> <nodeId>           # 一层局部网表(L3:nets + connections)
hdl drivers  <filelist> <nodeId> <net>     # 某信号的驱动来源(L4)
hdl fanin    <filelist> <nodeId> <port>    # / hdl fanout …
hdl loc      <filelist> (--inst <nodeId> | --def <defId>)   # 源码文件+行号
hdl dump     <filelist> [-o OUT.json] [--ports] [--netlist] # 整树导出(对齐 dump_hierarchy.py)
```

例:

```
hdl ports  cpu.f  soc_top.u_cpu.u_alu | jq
hdl defs   cpu.f
hdl def    cpu.f  'alu|/abs/path/alu.sv'
```

### 5.3 一个重要取舍:一次查询 vs 重复查询

`hdl <子命令>` **每次都会重新 `open`(= 重新编译 + elaborate)**。

- **少量/一次性查询、脚本**:直接 `hdl ports …` 最方便(可接受重编)。
- **大设计(openc910)上要查很多次**:别反复 `hdl`(每次重编几秒~几分钟)。两种省法:
  - 用 daemon:`hdl-engine` 编一次,之后发任意多条 NDJSON 查询。
  - 批量喂 NDJSON:`hdl-engine f.list < queries.ndjson > answers.ndjson`(编一次、批量答)。
- **要全量、且反复用**:先 `hdl dump` 出一份 JSON,之后用 `jq` 离线查(不再重编)。

> 一句话:`hdl-engine`(daemon)和 `hdl`(CLI)**调用的是同一组 `DesignService` 方法**,
> 区别只是"编一次查多次" vs "每次重编查一次"。

### 5.4 通用

- `--version` / `--help`;`--self-test`(编一段内置小 RTL 自检)。

---

## 6. 小结

- **代码 6 层**,依赖单向 `app→protocol→service→frontend→ir`(+cache),**只有 frontend 碰 slang**。
- **数据 4 层** L1–L4,各对应 service 的一组方法。
- **对外真 API = `DesignService`(C++ 库)**;NDJSON 与 CLI 是它的两个薄适配。
- NDJSON 方法集前 7 个与现有 daemon 同契约(UI 不动),L3/L4 新增 2 个。
