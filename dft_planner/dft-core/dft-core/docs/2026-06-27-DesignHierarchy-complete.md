# DesignHierarchy 完整数据模型(四层)

> 现有 `Hierarchyshower/docs/DesignHierarchy.md` 只描述了 slang 知道的**一部分**。
> 本文档把它补完整,供 hdl-core 的 IR 实现、协议序列化。
>
> 日期:2026-06-27 ｜ 状态:Draft ｜ 配套:`2026-06-27-hdl-core-design.md`

---

## 0. 为什么要补完整

slang elaborate 之后是一棵**完整的设计模型**。现有 `DesignHierarchy` 只是它的一个**窄投影**,
只够"层次树浏览 + 端口面板"。它把设计知识分成四层,**现在只覆盖了前两层**:

| 层                | 管什么                       | 现状                             | 谁需要它                                  |
| ----------------- | ---------------------------- | -------------------------------- | ----------------------------------------- |
| **L1 结构** | 实例树:谁实例化谁            | ✅ 已有                          | 层次树浏览                                |
| **L2 接口** | 每个模块的端口(名/方向/位宽) | ✅ 已有(但类型/interface 没展开) | 端口面板                                  |
| **L3 连接** | 网表:端口接到哪根线、谁连谁  | ❌**缺**                   | 连接生成、Show on Schematic、fanin/fanout |
| **L4 行为** | assign / always 里的逻辑驱动 | ❌**缺**                   | 时钟/复位 DFT-DRC、behavioral fanin       |

**L3(连接)和 L4(行为)正是你 DFT 壁垒(连接生成 + DRC)的核心**,却恰恰是缺的两层。
本文档补齐 L3、L4,并把 L2 的类型 / interface / 参数补全。

**向后兼容原则:只增不改。** L1、L2 现有字段一律保留、语义不变 —— 这样差分测试、newProject
里已存的 `domainId/definitionId` 绑定都不受影响。新增内容用更高的 `schemaVersion` 标记。

---

## 1. 设计哲学:全部按 id 寻址、懒加载

补完整 **不等于** 一次性把整棵网表+行为全 dump 出来(openc910 那样会爆)。沿用现有
`childrenLoaded` 的思路:

- **eager(开局就有)**:只有骨架 —— 根、实例树一层、定义名。
- **lazy(点到才取)**:端口、局部网表(L3)、信号驱动(L4)、类型细节 —— 都按 id 寻址,
  用户点哪个节点 / 哪个端口,才现算现填,并缓存。

每类重数据配一个 `*Loaded` 标志 + 一个超大保护 `truncated`。

---

## 2. 完整数据模型

### 2.0 顶层

```ts
interface DesignHierarchy {
  schemaVersion: number;                          // 补完整后 +1
  rootInstanceIds: string[];                      // 真顶(已过滤假顶)
  instances: Record<string, InstanceNode>;        // L1 结构,扁平、按 id
  definitions: Record<string, ModuleDefinition>;  // 按模块去重
  // L3/L4 不放顶层 —— 它们按 instanceId 懒加载(见 2.3 / 2.4),
  // 避免把整设计的网表/行为塞进一个 JSON。
}
```

### 2.1 L1 结构层(保留 + 一个小补)

```ts
interface InstanceNode {
  // —— 现有字段,全部保留,语义不变 ——
  id: string;                 // = hierarchicalPath(带 [i]),稳定唯一
  instanceName: string;
  kind: "module" | "primitive" | "blackbox";
  definitionId: string;
  parentInstanceId: string | null;
  childInstanceIds: string[];          // 含 primitive/blackbox
  isLeaf: boolean;
  childrenLoaded: boolean;
  instantiationLine?: number;
  portWidthOverrides?: Record<string, number>;   // 参数化致端口位宽偏离 def

  // —— 新增 ——
  paramOverrides?: Record<string, string | number>; // 这个实例覆盖了哪些参数(比 portWidthOverrides 更全;
                                                     // 解释"为什么这个实例的端口更宽")
  netlistLoaded?: boolean;             // L3 局部网表是否已加载(见 2.3)
}
```

`ModuleDefinition` 见 2.2(端口/参数有扩展)。

### 2.2 L2 接口层(扩展:类型 / interface 展开 / 完整参数)

```ts
interface ModuleDefinition {
  id: string;                 // = `${name}|${绝对路径}`
  designName: string;
  filePath?: string;
  definitionLine?: number;
  ports?: PortInfo[];                       // 扩展见下
  parameters?: ParamInfo[];                 // 升级:不再是 Record,带类型/localparam
}

interface PortInfo {
  // —— 现有 ——
  name: string;
  direction: "in" | "out" | "inout";
  width: number;                            // 永远是 elaborate 后的具体整数
  busLabel: string;                         // 预渲染 "data[31:0]"
  portKind?: "port" | "multiport" | "interface";

  // —— 新增 ——
  dataType?: TypeInfo;                      // 类型细节(struct/enum/array…),不只位宽
  // interface 端口展开(portKind === "interface" 时):
  interfaceType?: string;                   // 如 "axi_if"
  modport?: string;                         // 如 "master"
  interfaceSignals?: PortInfo[];            // 展开后内部信号(懒;axi 的 awvalid/awready/…)
  // multiport / 部分位端口(portKind === "multiport" 时):
  subPorts?: { expr: string; width: number }[];
}

interface ParamInfo {
  name: string;
  value: string | number;                   // elaborate 后的具体值
  type?: string;                            // "int" | "string" | "logic[...]"…
  isLocal?: boolean;                        // localparam?
}

interface TypeInfo {
  kind: "scalar" | "packedArray" | "unpackedArray" | "struct" | "union" | "enum" | "interface";
  width: number;                            // packed 总位宽
  repr: string;                             // 预渲染类型名,如 "logic [31:0]" / "my_struct_t"
  fields?: { name: string; type: TypeInfo }[];   // struct/union
  enumValues?: Record<string, number>;           // enum
  unpackedDims?: [number, number][];             // unpacked 维度 [msb,lsb]…
}
```

### 2.3 L3 连接层(新增:局部网表)—— 连接生成 / Schematic 的地基

**单位 = 一个模块体内部的一层**(正好是"Show on Schematic" 画一层、或连接生成处理一层的单位)。
按 `ownerInstanceId` 懒加载。

```ts
// 协议:get-netlist(ownerInstanceId) → LocalNetlist
interface LocalNetlist {
  ownerInstanceId: string;                  // 这是谁的 body 内部
  nets: Record<string, NetInfo>;            // 本层声明的 net/wire/logic,按 name
  connections: PortConnection[];            // 本模块边界端口 + 所有子实例端口的绑定
  loaded: boolean;
  truncated?: boolean;                      // 巨型模块的截断保护(配 log,不静默)
}

interface NetInfo {
  name: string;
  width: number;
  busLabel: string;                         // 预渲染 "wdata[31:0]"
  netKind: "wire" | "logic" | "reg" | "port" | "const" | "supply"; // 大类
}

interface PortConnection {
  instanceId: string;        // 端点所属实例。== ownerInstanceId → 本模块的边界端口;
                             //                != → 某个子实例的端口
  port: string;              // 端口名
  // 端口接到什么(可能是整条 net,也可能是部分位/拼接/常量):
  net?: string;              // 简单情形:整条 net 名
  expr: string;              // 预渲染连接表达式:"wdata[3:0]" / "{a,b}" / "1'b0" / "net0"
  bits?: [number, number];   // 部分位选 [msb,lsb](可选)
}
```

> 实现备注:网表结构在同一 def 的不同实例间相同(只位宽随参数变),可像端口那样
> "def 代表实例 + 按实例 width 覆盖" 缓存。模型对外仍按 instanceId 寻址。

### 2.4 L4 行为层(新增:信号驱动)—— 时钟/复位 DRC 的地基

把 assign / always 投影成"**这条信号被谁驱动**"。**不**搬整个 RTL 逻辑,只投影 DRC/trace 需要的驱动关系。
按 `signalId` 懒加载(沿用现有 `trace-drivers` 的产物形状,把它升级成可缓存的一层)。

```ts
// 协议:get-drivers(ownerInstanceId, net) → SignalDrivers
interface SignalDrivers {
  signalId: string;                         // = `${ownerInstanceId}/${netName}`
  netName: string;
  bus?: string;                             // 预渲染位宽
  drivers: DriverInfo[];
  loaded: boolean;
}

interface DriverInfo {
  kind: "input_port" | "assign" | "always" | "instance_output" | "const";
  label: string;                            // 人读标签,如 "always_ff @(posedge clk)"
  detail?: string;                          // 表达式/敏感列表细节
  sourceInstanceId?: string;                // kind=instance_output:哪个子实例
  sourcePort?: string;                      // kind=instance_output:哪个端口
  file?: string;
  line?: number;
  // DRC 用的可选标注(后续):
  clockEdge?: "posedge" | "negedge";        // always 的时钟沿(时钟/复位检查)
}
```

---

## 3. 字段 → 功能映射(补充部分)

| 字段                                 | 服务的功能                                             |
| ------------------------------------ | ------------------------------------------------------ |
| `InstanceNode.paramOverrides`      | 解释参数化实例差异、自动配置 harden                    |
| `PortInfo.dataType` / `TypeInfo` | struct/enum 端口正确显示、连接生成位对齐               |
| `PortInfo.interfaceSignals`        | SV interface 端口展开成真实信号(连接/DRC 必需)         |
| `PortInfo.subPorts`                | multiport 拆分                                         |
| `LocalNetlist` / `NetInfo`       | **连接生成**、Show on Schematic 画一层、内部走线 |
| `PortConnection`                   | 端口↔net 绑定,fanin/fanout 的边,部分位/拼接连接       |
| `SignalDrivers` / `DriverInfo`   | **时钟/复位 DRC**、behavioral fanin、组合环检测  |
| `DriverInfo.clockEdge`             | 时钟沿识别(DFT 时钟可控性)                             |

---

## 4. 协议增量(对齐现有 daemon 契约,只加方法)

现有 7 个方法不变,新增 2 个懒加载方法:

| 方法            | 入参                       | 出参              | 用途                            |
| --------------- | -------------------------- | ----------------- | ------------------------------- |
| `get-netlist` | `{ownerInstanceId}`      | `LocalNetlist`  | L3:一层局部网表(连接/Schematic) |
| `get-drivers` | `{ownerInstanceId, net}` | `SignalDrivers` | L4:某信号的驱动来源(DRC/fanin)  |

(现有 `trace-fanin`/`trace-fanout`/`trace-drivers` 可视为 L3/L4 的"按端口即时查询"版本;
新方法是把同样的信息升级成**可缓存、可整层取**的形态。)

---

## 5. 与现有文档 / 差分测试的关系

- **L1、L2 老字段逐字不变** → 现有 Python daemon 的 `dump_hierarchy.py` 输出仍是本模型的**子集**,
  差分测试照常以它为 oracle(只比对老字段);L3/L4/类型细节是**新增能力**,单独测。
- `schemaVersion` 从 1 → 2,缓存据此失效。
- **范围声明**:本模型"完整"是指**覆盖 DFT 目标所需的四层(结构/接口/连接/行为)**,
  **不是** SystemVerilog 全 AST 镜像(函数/任务/断言/覆盖率/时序等不在内,按需再投影)。
