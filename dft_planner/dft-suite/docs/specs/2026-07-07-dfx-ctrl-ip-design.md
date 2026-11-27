# DFX Ctrl IP(控制/观测)—— dft_ctrl 流程并入 dft-core / dft-suite 设计规格

> **一句话**:导入设计 → 搜索/选中想控制的 instance 加入画布 → 在大弹窗表格里勾选该 instance
> 要**控制**和**观测**的引脚(mux/直连自动判定、可改)→ 实时预览并生成 `.v / .icl / .tcl` 三件套。
> 生成能力 = dft-core 新库 **ctrlgen-core**(+CLI),驱动判定 = **hdl-core tie 补丁**,
> 交互 = **dft-suite 连接生成工作区**。
>
> 日期:2026-07-07 · 状态:v5 定稿(语义、命名、交互全部经用户确认)· 参考样例:
> `/Users/jiangbowang/MOI/2025/dftartist/dft_ctrl/`(EMA / pll_ctrl_1&2 / fuse_ctrl)

---

## 0. 已确认的决策(用户拍板)

| #  | 决策                                                                                                                                                                                                                    |
| -- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1 | 不兼容旧`module_info` 格式,输入只有新 JSON spec                                                                                                                                                                       |
| D2 | mux/直连**自动判定**(依据目标引脚原驱动),每引脚允许用户手动改                                                                                                                                                     |
| D3 | mux 实例名`u_dfx_<目标实例>_<被控引脚>_persistent_mux_inst_ds<x>`,**每个 mux 独立取号、逐个递增(ds1、ds2…,不共用)**;UI 新建的 ctrl 模块默认命名 `<基名>_ds<x>`(模块计数器与 mux 计数器相互独立,均文档级自增) |
| D4 | 引脚选择界面 =**双击弹出近全屏大弹窗**(genconn 中央区无 tab 系统,不新造;确认/取消关闭弹窗即回画布)                                                                                                                |
| D5 | 左栏新增**「DFX Ctrl」清单面板**,关软件重开后从这里一键定位/再编辑历史修改                                                                                                                                              |
| D6 | 单击清单项 = 在**共同页面**(genconn 画布)整组展示该修改:ctrl 块 + 全部目标块 + 控制/观测连线 + **mux 符号**,视野自动 fit;另提供「在单独 schematic 页面打开」(只读详情页,每修改一页)。默认共同页面           |
| D7 | **悬空**控制引脚仅 `create_connection`、不 `delete_connection`(无连接可删)                                                                                                                                    |
| D8 | **总线控制每 bit 一个 mux**;总线各位**按位独立自动判定**缝合方式(混合驱动不需要特殊规则)                                                                                                                    |

默认假设(按此执行,可推翻;见 §9):

- A2 IP 端口名默认 = 引脚名;多实例合并**同名冲突时自动加实例前缀**。实例前缀 / mux 名中的
  `<目标实例>` 若为层次路径,`/` 一律替换为 `_` 扁平化;替换后仍重名 → parseSpec 报错。
- A3 `inout` 引脚 v1 不可选(表格中禁用 + 提示)。
- A4 产物只有 Tessent 流(.v/.icl/.tcl),不做 inject-core 直改 .v(留作扩展)。
- A6 mux 计数器**跨 ctrl 模块连续**(模块 A 用了 ds1/ds2,模块 B 的第一个 mux 是 ds3);
  模块计数器独立同理。两计数器只增不回收(见 §9)。

**2026-07-08 重设计决策(M3,取代 M2 的画布中心方案,详见 §5):**

| #   | 决策                                                                                                                                                                                                                                                                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D9  | DFX**不再用 genconn 画布**。新增独立功能:hierarchy 树右键**「Add to DFX Ctrl」** → 把 instance 加入一个**专用、单例复用**的 **DFX Ctrl 原理图 tab**;再加别的 instance **累加共存**(不新开、不替换)。genconn 画布的 DFX(ctrl 块/overlay/左栏清单/画布级联删)全部移除。        |
| D10 | 在 DFX Ctrl tab 里**双击某个 instance 块** → 配置弹窗(用该节点 daemon nodeId 直接 seed,不再经画布反查)。确认后 **ctrl 块 + mux 直接渲染进这张 tab**,用 ELK 自动布线:控制 `ctrl 输出 → mux → 目标引脚`,观测 `目标引脚 → ctrl 输入`,`dfx_mode 源 → ctrl.dfx_mode + 各 mux.sel`。 |
| D11 | **数据仍持久化在 genconn 文档**(A1):`ctrlIps`(spec)+ 计数器 + 新增 `dfxInstances`(加入 DFX tab 的 nodeId 列表);UI 全在 hierarchy DFX tab。`DocCtrlIp` 去画布化(丢 `ctrlInstId`/画布 instId 映射;目标由 `spec.pins[].target` 承载)。复用现成 localStorage/undo/migrate,不新建持久化。  |
| D12 | 原有「Show on Hierarchical Schematic」(信号追踪图)**保持独立不动**,仅顺带修 tab 增殖:默认复用一个 tab + 右键「在新 tab 打开」选项。「累加共存」只属于 DFX Ctrl tab。                                                                                                                            |
| D13 | 渲染复用 hierarchy 原理图内核(`core/schematic.ts` 的 SchNode/toElkGraph + `schematic/laid.ts` + `elkLayout.ts`,即 detailGraph 已用的那套纯模块);判定/构建/生成核心(judge/build/dftCtrlgen)与 genconn 无关,直接复用。                                                                            |

## 1. 语义(从 dft_ctrl 样例提炼;pll_ctrl_1.tcl 的中文注释为权威)

### 1.1 生成的 ctrl IP(RTL + ICL)

从 ctrl IP 自身视角:**控制 = output,观测 = input**;公共 `input wire dfx_mode`。

| 方向 | IP 端口                                | RTL                                   | ICL                                                                                                                    |
| ---- | -------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 控制 | `output <pin>` + `input <pin>_tdr` | `<pin> = AND2(<pin>_tdr, dfx_mode)` | `DataInPort  <pin>_tdr {DefaultLoadValue 1'b0;}`(标量)/ `DataInPort  <pin>_tdr[N-1:0] {DefaultLoadValue 0;}`(总线) |
| 观测 | `input <pin>` + `output <pin>_tdr` | `<pin>_tdr = AND2(<pin>, dfx_mode)` | `DataOutPort  <pin>_tdr {}`(总线同样带 `[N-1:0]`)                                                                  |

**确定性版式/命名(逐字节 golden 依赖,对齐 `dfx_ip_gen.pl` 语义)**:

- 端口声明顺序:控制 `_tdr` 输入们 → `dfx_mode` → 观测输入们 → 控制输出们 → 观测 `_tdr` 输出们;
  标量端口 `input wire  X`(双空格),总线 `input wire [N-1:0] X`。
- AND2 实例名 `<pin>_persistent_and2_inst`;总线用 generate:标签 `<pin>_gen`、genvar `i_<pin>`、
  `endgenerate` 后跟一个空行。
- ICL 关键字后双空格;总线端口名带宽度后缀;`Module <名> { … }` 包裹。
- 门控 cell 默认 `cell_and2`(Z/A1/A2);schema 保留字段但 **UI v1 不暴露配置入口**(§8)。

**具体例子**(控制 `PLL_1/enable`、观测 `PLL_1/LOCKED`,生成 `pll_ctrl_ds1`):

```verilog
module pll_ctrl_ds1 (
  input wire  enable_tdr,    // ← IJTAG TDR 写入的控制值(JTAG 可写)
  input wire dfx_mode,       // ← 总开关
  input wire  LOCKED,        // ← 从 PLL_1/LOCKED 采回的观测值
  output wire  enable,       // → 驱动 PLL_1/enable(经 mux)
  output wire  LOCKED_tdr    // → 送回 TDR 供 JTAG 读出
);

cell_and2 enable_persistent_and2_inst (.Z(enable), .A1(enable_tdr), .A2(dfx_mode));
cell_and2 LOCKED_persistent_and2_inst (.Z(LOCKED_tdr), .A1(LOCKED), .A2(dfx_mode));
endmodule
```

```
Module pll_ctrl_ds1 {
  DataInPort  enable_tdr {DefaultLoadValue 1'b0;}
  DataOutPort  LOCKED_tdr {}
}
```

`dfx_mode=0`:控制输出恒 0、观测读出恒 0,芯片功能模式完全不受影响;
`dfx_mode=1`:JTAG 往 TDR 写什么,`enable` 就输出什么;`LOCKED` 的实时值可经 JTAG 读回。
`.icl` 的作用就是告诉 Tessent「`enable_tdr` 是要挂进 IJTAG 扫描链的可写位、`LOCKED_tdr` 是可读位」,
Tessent IJTAG 插入时据此自动生成 TDR 寄存器并连到这两个端口。

### 1.2 缝合 tcl(每个 ctrl 模块一份)

1. 头两行固定(只有名字变):`create_instance  u_<模块名> -of_module <模块名>` +
   `create_connection  <dfx_mode源> u_<模块名>/dfx_mode`。dfx_mode 源默认
   `u_dfx_static_hyper_ctl_tdr/dfx_mode`(schema 可填,UI v1 不暴露)。
2. **控制引脚**按目标原驱动自动判定(D2,可手动改);**总线按位独立判定**(D8),
   每一位单独套用下表,位 i 的「IP 输出」为 `<pin>[i]`:

   | 目标引脚(位)原驱动 | stitch      | 缝合命令                                                                                       | 样例                                          |
   | ------------------ | ----------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------- |
   | 常量 0(tie-0)      | `replace` | `delete_connection <目标>` + `create_connection <IP输出> <目标>`                           | EMA 193 根、fuse`read_buffer`(`.A(1'b0)`) |
   | 常量 1 或真实逻辑  | `mux`     | `add_input_pin_dft_mux_override "<目标>" "<IP输出>" "<dfx_mode源>" "<mux名(D3)>"`,不删原连接 | `PLL_1/enable`(接 `1'b1`)                 |
   | 悬空未连接         | `connect` | 仅`create_connection <IP输出> <目标>`(D7)                                                    | —                                            |

   总线走 mux 的位**每位一个 mux 实例**(D8),各自按 D3 独立取号(如位 3、位 7 需要 mux →
   `…_persistent_mux_inst_ds4`、`…_persistent_mux_inst_ds5`);混合常量总线(如 `4'b0101`)
   自然分解为各位的 replace/mux,无特殊规则。
3. **观测引脚**:`create_connection "<目标输出>" "<IP输入>"`,网上加负载,不删不 mux。
4. 目标一律**层次路径**;多实例的引脚可合入同一个 ctrl 模块(模块号不变,端口名按 A2)。
5. **总线两种形态**:同构(整线接同一目标的 `<target>[i]`)与**逐位异构**(每位接不同实例引脚,
   如 EMA 位 i → `…/U_dft_donttouch_ema_tdr_ovrd_<i>_0/buf_din`,位号嵌在实例名中间)——
   schema 用 `targets[]` 显式列出(§4.1)。

## 2. 架构与分工

```
dft-suite 连接生成工作区(交互)                     dft-core(能力)
┌────────────────────────────────────┐
│ 层次面板+搜索 ──选 instance──► 画布   │   hdl daemon(常驻查询)
│ 双击块 ──► DFX 配置大弹窗            │◄──  get-ports / get-netlist(+tie 补丁)
│   引脚表格+自动判定+实时预览          │      trace-drivers(+constant 补丁)
│ 左栏 DFX Ctrl 清单(定位/详情页)      │
└──────────────┬─────────────────────┘
               │ CtrlIpSpec(存 genconn 文档 JSON)
               ▼
        ctrlgen CLI(一次性命令,resources/bin)
               ├─► <模块名>.v / .icl / .tcl(三件套)
               └─► GeneratePanel 文件列表统一下载
```

生成器是**纯函数**(不查设计);驱动判定在 UI 侧完成,结论(每引脚 stitch)写进 spec。

## 3. 前置:hdl-core 补丁(M0)

现状两处缺口,均已定位到改动点:

1. **tie 与悬空不可分**:`.pin(1'b0)` 在 trace-drivers 返回空 sources、get-netlist net 为空串,
   与未连接同形(`DesignDb.cpp` 注释明写 unconnected/constant 合并)。补法:
   连接表达式无 symbol reference 时做 slang 常量求值;get-netlist connection 加 `tie` 字段
   (`"1'b0"`/`"1'b1"`/多位值/空);trace-drivers 常量时返回 `kind:"constant"`;Python 差分 oracle 同语义补齐。
2. **深层 nodeId 未注册则静默返空**:daemon 的 DesignDb 只登记 expand-children 展开过的实例,
   未注册的深层 nodeId 下 traceDrivers/getNetlist 静默返回空(`DesignDb.cpp:366-378`)——会被
   自动判定误读为「悬空→connect」。补法:照 `traceNetToSource` 的惰性祖先展开先例
   (`DesignDb.cpp:638-644`)在 traceDrivers/getNetlist 内补齐,UI 无需感知。

间接 tie(`assign net = 1'b0` 再接引脚)v1 不求值,按「真实逻辑 → mux」保守处理。

## 4. ctrlgen-core(dft-core 第五库,M1)

### 4.1 输入 `CtrlIpSpec`(实例中心)

```jsonc
{
  "schemaVersion": 2,
  "moduleBase": "pll_ctrl",              // 基名
  "dsIndex": 1,                           // 可省略/null → 终名 = moduleBase(EMA golden 即此形态);
                                          // UI 新建默认分配 _ds<x>(D3)
  "dfxModeSource": "u_dfx_static_hyper_ctl_tdr/dfx_mode",
  "gateCell": { "name": "cell_and2", "out": "Z", "a": "A1", "b": "A2" },
  "pins": [
    { "portName": "enable",  "mode": "control", "width": 1, "stitch": "mux",
      "target": "PLL_1/enable",
      "muxName": "u_dfx_PLL_1_enable_persistent_mux_inst_ds1" },   // D3;UI 生成,CLI 只校验
    { "portName": "LOCKED",  "mode": "observe", "width": 1, "target": "PLL_1/LOCKED" },
    { "portName": "ema_tdr_ovrd", "mode": "control", "width": 192, "stitch": "replace",
      "targets": ["…/U_dft_donttouch_ema_tdr_ovrd_0_0/buf_din", "…191 more…"] },
    { "portName": "cfg", "mode": "control", "width": 4, "target": "U_X/cfg",  // 混合驱动总线示例
      "stitch": ["replace", "mux", "replace", "mux"],               // 按位(D8),下标 = 位号
      "muxName": [null, "u_dfx_U_X_cfg_persistent_mux_inst_ds2", null,
                  "u_dfx_U_X_cfg_persistent_mux_inst_ds3"] }
  ]
}
```

- 实例名 = `u_<终模块名>`。
- **target / targets 二选一**:`target` 用于标量与同构总线(按位展开为 `<target>[i]`);
  `targets[]`(长度必须 = width)用于逐位异构散接(EMA 形态,§1.2.5)。
- `stitch` 只对 control 有意义且必填:**字符串 = 整线一致;数组(长度 = width)= 按位**(D8)。
  observe 不带 stitch。
- `muxName` 与 stitch 同形:标量 mux 用字符串;按位时为数组,仅 mux 位非 null。
  由 UI 按 D3 逐个取号生成写入,CLI 只校验合法标识符与形状。
- `portName` 为 A2 处理后的终名。

### 4.2 API 与 CLI

```cpp
namespace ctrlgen {
  CtrlIpSpec  parseSpec(const std::string& jsonText);
  std::string generateVerilog(const CtrlIpSpec&);
  std::string generateIcl(const CtrlIpSpec&);
  std::string generateStitchTcl(const CtrlIpSpec&);
}
```

`ctrlgen gen <spec.json>` → stdout 按 `===FILE:<name>===` 多文件标记输出
(与 `genconn generate-all` 同格式,Electron 侧 `parseFileMarkers` 零新解析代码)。

### 4.3 golden 与版式定版

**第一组:EMA 三件套逐字节 golden**(`dft_ctrl/untitled folder/`,已核对无笔误;
ctest `ctrlgen_golden_ema`(第二组为 `ctrlgen_golden_pll`/`ctrlgen_golden_fuse`),模式同 `genconn_inject_diff`)。需复刻的怪癖清单:

- `.v`:标量端口双空格、generate 块间空行(§1.1);
- `.icl`:关键字后双空格、标量 `1'b0` / 总线 `0`、总线端口带 `[191:0]`;
- `.tcl`:**按字节(ASCII/C-locale)排序**(`_109_0` 排在 `_10_0` 前;等价 `LC_ALL=C sort`);
  头两行命令后双空格;标量 `create_connection` 两参数间双空格、总线带 `[i]` 的行单空格;
  空行结构:头后 2 空行、delete 块→create 块之间 3 空行、文件尾 2 空行。
- 其 spec JSON:`moduleBase:"dfx_mem_ema_ctrl"`、**无 dsIndex**、`targets[]` 192 条 + 标量 `_en` 一条。

**第二组:chip_top golden**(mux / 观测 / `_ds<x>` 新语义;样例 tcl 是手写说明含笔误,期望输出以本 spec 为准):

- 版式定版:与 EMA 同一套空行布局(头后 2 空行、delete→add 块间 3 空行、尾 2 空行;无 delete 块则省略);
  mux 与观测行参数**带引号**(与 §1.2 示例一致),replace/connect 的控制行不带引号(EMA 式);无尾随空格。
- fuse 样例各文件拼写不一致,以 `fbi_instance_ctrl.tcl`(`read_buffer`/`donFB`)为准,忽略
  module_info/.v 的 `read_buffe`/`doneFB`。
- 命名规则已全部确认(§9),随 M1 一并冻结。

### 4.4 校验与错误

| 情形                                                                                     | 行为                                             |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 模块/端口/mux 名非法标识符、端口重名(A2 扁平化后仍撞)                                    | parseSpec 报错                                   |
| control 缺 stitch、observe 带 stitch、`targets[]` 长度 ≠ width、target/targets 同时给 | parseSpec 报错                                   |
| stitch/muxName 形状不符(数组长度 ≠ width、mux 位缺 muxName、非 mux 位带 muxName)        | parseSpec 报错                                   |
| stitch 与驱动状态不匹配(如对悬空 replace)                                                | 由 UI 保证不产生(§5.2 映射);CLI 不接设计,不复查 |
| 目标引脚方向不符(控制≠input、观测≠output)、不存在                                      | UI 侧拦截(表格禁用)                              |
| 同一目标引脚被两个 ctrl IP 重复控制                                                      | UI 侧拦截(勾选时提示已被`<模块名>` 占用)       |

## 5. dft-suite UI

> **说明**:§5 已于 2026-07-08 重设计为**原理图中心**(M3,决策 D9–D13)。M2 已落地的
> **判定/构建/生成/桥接**(judge/build/detailGraph/dftCtrlgen、Electron 接线、schema v2、
> hdl-core 数据源)全部保留复用;M2 的**genconn 画布中心 UI**(画布 ctrl 块、DfxOverlay、
> genconn 左栏 DfxPanel、confirmCtrlIp 的落画布逻辑、DfxDetail 独立页)被 M3 取代/移除。
> M2 的历史设计见本仓 git 历史;下文为现行(M3)设计。

### 5.1 入口:hierarchy 树右键「Add to DFX Ctrl」(D9)

- hierarchy 工作区左侧树节点右键菜单新增 **「Add to DFX Ctrl」**(与既有「Show on Hierarchical
  Schematic」「Add to GenConnection」并列)。点击 → 把该 instance 的 nodeId 加入
  `doc.dfxInstances`(去重),并打开/激活 **DFX Ctrl tab**(见 §5.2),该实例块出现在图上。
- 累加语义(D9):对多个实例分别「Add to DFX Ctrl」,它们**共存在同一张 DFX Ctrl tab**里。
- 既有「Show on Hierarchical Schematic」不变;顺带修其 tab 增殖(§5.5)。

### 5.2 DFX Ctrl tab(专用原理图工作台,D9/D10/D13)

- **单例复用 tab**:固定 id(如 `dfx:ctrl`),仿 hierarchy 现有 ports-tab 的单例范式;
  「Add to DFX Ctrl」始终复用它、累加实例,不新开。tab 标题「DFX Ctrl」。
- **渲染(D13)**:图 = `doc.dfxInstances` 的实例块 + `doc.ctrlIps` 派生的 ctrl 块/mux/接线,
  用 hierarchy 原理图内核纯模块布局:`core/schematic.ts`(SchNode/SchEdge/toElkGraph)+
  `schematic/laid.ts`(toLaid/boundsOf/fitTransform)+ `schematic/elkLayout.ts`。渲染层可复用/
  参照 `SchematicTab.tsx` 的 Konva 双 Layer 范式,新建 `DfxCtrlTab`(或复用其可复用部分)。
- **实例块**:每个 dfxInstance 一个 SchNode(instanceName/designName + 引脚,来自 `getPorts`);
  ELK 自动布局。
- **配置入口(D10)**:**双击实例块** → 打开配置弹窗(§5.3),用该块 nodeId 直接 seed。
- **ctrl 块 + mux 渲染(D10)**:每条 `DocCtrlIp` 派生:1 个 ctrl 块 SchNode(端口 = `dfx_mode`
  + 每 pin 的 IP 侧含 `_tdr`)、每个 mux 位 1 个 mux SchNode(kind blackbox,in0/in1/sel/out)、
    1 个 dfx_mode 源节点;边(ELK 自动布线):控制 mux `ctrl.<pin> → mux.in1`、`mux.out → 目标.pin`;
    控制 replace/connect `ctrl.<pin> → 目标.pin` 直连;观测 `目标.pin → ctrl.<pin>`;
    `dfx源 → ctrl.dfx_mode` + `dfx源 → 各 mux.sel`。(这套建图逻辑 = M2 `detailGraph.ts` 的推广:
    从单修改详情图扩展到「整个 DFX tab 的多修改合图」。)
- 点 ctrl 块/实例块可高亮该组;工具条「适应/重排」复用 SchematicTab 习惯。

### 5.3 配置弹窗(nodeId 驱动,去画布化)

入口:DFX Ctrl tab 里双击实例块;双击已有 ctrl 块 = 编辑该修改。近全屏 modal overlay(Esc 取消)。
弹窗内部(表格 + 判定 + 预览)**复用 M2 DfxDialog 的判定/构建/预览逻辑**,仅解耦其 genconn 绑定:

- **seed 改 nodeId**:new 模式入参从 `seedInstId`(genconn 画布块)改为 `seedNodeId`(daemon nodeId
  = SchNode.id);loadRows 直接用 nodeId 走 `getPorts`+`getNetlist`(先 netlist 后 ports,M0.2 惰性注册)。
- **确认去画布化**:`confirmCtrlIp` 不再 `addBlockAt`/`resolveCtrlTargets` 落 genconn 画布;只
  `allocModuleDs`/`allocMuxDs` 取号 + `buildCtrlIpSpec` + `upsertCtrlIp(doc, {spec})` 写 `doc.ctrlIps`。
  确认后 DFX Ctrl tab 依 `doc.ctrlIps` 重新建图(ctrl 块 + mux 出现)。
- 表格/判定/方向收窄/缝合二落一/重复控制拦截/基名→终名/400ms 三件套预览:**全部沿用 M2**(§4.4、判定映射不变)。
- **预览区加宽 + 可拖 + 可展开(2026-07-08 反馈)**:右预览默认宽度 `clamp(420px,40vw,720px)`(a);
  表格/预览间加**可拖拽分隔条**(b);顶部加**「展开预览」**按钮,点后暂隐左表格、预览吃满盒宽(d)。
- **「+ 添加目标实例」可删(2026-07-08 反馈)**:多目标时表格**分组头行加 `✕`**,`removeTarget(nodeId)`
  同时从 `targets` 与 `rows` 滤掉该 nodeId(预览/计数/确认禁用自动联动);分组头仅多目标时显示,
  天然防删到最后一个。edit 模式删已有目标 = **仅把该目标引脚从本次修改摘除**(不回收其历史,语义简单可预期)。

### 5.4 DFX Ctrl 清单 + 生成/下载 + 删除

- **清单**:DFX Ctrl tab 内(侧栏或浮层)或 hierarchy 左栏一处,列出 `doc.ctrlIps` 每条
  `pll_ctrl_ds1 · N 目标 · X控/Y观`(N 目标 = 引脚数,对齐既有实现);单击高亮该组、双击/✎ 编辑、
  🗑 删除(`window.confirm`)。
- **生成/下载**:配置弹窗右侧已实时预览 `.v/.icl/.tcl`;下载在弹窗内提供(`downloadText`,
  纯浏览器 API 无 genconn 依赖)。另可在 DFX Ctrl tab 提供「全部生成/下载」入口(遍历
  `doc.ctrlIps` 调 `dftCtrlgen.gen(c.spec)`,同 M2 GeneratePanel 逻辑)。
- **删除(去画布化的级联)**:删一条 ctrlIp → `removeCtrlIp(doc, mod)` → DFX tab 依 doc 重建、
  该 ctrl 块/mux/接线消失(无画布 instId 需级联)。从 DFX tab 移除一个实例块 → 从 `dfxInstances`
  删该 nodeId;若该实例仍被某 ctrlIp 引用为目标,提示或一并清理(实现时定,默认:阻止并提示先删配置)。
  所有删除保持一次 `set` = 一步 undo。

### 5.5 其他改动

- **持久化(D11)**:genconn 文档 schema 再升级,新增 `dfxInstances: string[]`(nodeId 列表);
  `DocCtrlIp` 简化去画布字段(`ctrlInstId`/画布 `targets` 映射移除或置空,目标由 `spec.pins[].target`
  承载)。migrate 兜底 `dfxInstances ??= []`;localStorage/undo/Ctrl+S 复用。
- **Show on Schematic tab 复用(D12)**:`openSchematic` 默认复用单例 schematic tab(仿 ports-tab
  find-and-replace),图缓存 key 从 tab-id 解耦为 seedNodeId;ContextMenu 加「Show on Schematic in
  New Tab」显式新开。与 DFX Ctrl tab 相互独立。
- **移除 M2 genconn 画布 DFX**:删 `DfxOverlay`、CanvasView 的 DFX 双击/右键入口与 overlay Layer、
  genconn 左栏 `DfxPanel` 挂载、`confirmCtrlIp` 的画布落块段、`resolveCtrlTargets` 画布映射、
  `deleteInstance`/`deleteSelected` 的 ctrlIp 反向级联(改为 §5.4 的去画布删除)。保留 judge/build/
  detailGraph(推广为 DFX tab 建图)/generation/schema。
- **Electron 接线**:M2 已完成(`ctrlgen` CLI 桥),不变。

## 6. 测试

| 层               | 内容                                                                                                                                                        |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| hdl-core(M0)     | tie 识别单测(tie0/tie1/多位/混合/悬空/逻辑);惰性展开(深层 nodeId 直查);Python oracle 差分                                                                   |
| ctrlgen-core(M1) | parseSpec 边界(targets 长度/二选一/stitch 匹配/扁平化重名);EMA 逐字节 golden(C-locale 排序);chip_top 第二组 golden                                          |
| dft-suite 单测   | 搜索匹配与截断;判定映射(tie0→replace / tie1&逻辑→mux / 悬空→connect,总线按位;「直连」二落一);schema 升级兼容;双计数器只增、mux 号跨模块连续;重复控制拦截 |
| dft-suite e2e    | 搜索→入画布→双击配置→勾选→预览三件套→确认→清单单击整组高亮/单独页面出拓扑(mock daemon)                                                                |

## 7. 里程碑

- **M0** hdl-core 补丁:tie 识别 + 惰性展开(前置,小)——已完成
- **M1** ctrlgen-core 库 + CLI + 双组 golden(命名已全确认,§9)——已完成
- **M2** suite UI(判定/构建/生成/桥接/schema)——已完成;其画布中心 UI 由 M3 取代
- **M3** 原理图中心重设计(2026-07-08,D9–D13):DFX Ctrl tab + ctrl/mux ELK 渲染 +
  弹窗 nodeId 驱动去画布化 + 预览加宽/可拖/展开 + 目标可删 + Show-on-Schematic tab 复用 +
  移除 genconn 画布 DFX

## 8. 非目标

- inject-core 直改 .v;hdl-core `find-instances`(触发条件见 §5.1);
- 间接 tie(`assign net=常量`)常量求值(保守走 mux);
- gateCell / dfxModeSource 的 **UI 配置入口**(schema 字段保留、取默认值;有多项目差异需求再开);
- 总线**逐位手动覆盖**缝合方式(自动判定已按位,手动覆盖 v1 整线生效;有需求再加);
- ICL 网络级拓扑(SIB/ScanRegister 链由 Tessent IJTAG 插入);SDC/UPF;inout 引脚(A3)。

## 9. 确认记录(2026-07-07,全部关闭)

- 总线控制**每 bit 一个 mux**(D8);混合常量总线按位判定(随每 bit 一 mux 自然成立)。
- mux 的 ds 号**不共用**、逐个递增 ds1/ds2…(D3)。
- 悬空控制引脚仅 `create_connection`(D7)。
- **模块计数器与 mux 计数器相互独立**(第 1 个模块 `pll_ctrl_ds1` 的第 1 个 mux 也叫 `…_ds1`)。
- **mux 号跨 ctrl 模块连续**(A6:模块 A 用了 ds1/ds2,模块 B 的第一个 mux 从 ds3 开始)。

无遗留待确认项,第二组 golden 可随 M1 冻结。

## 10. 合并注记(2026-07-07)

- M0/M1 在 dft-core `feat/ctrlgen` 分支;合并须带 Hierarchyshower 的 oracle 补丁(a4e88b9/a4f578e)。
- dft-suite 预存的 genconn-generate golden 失败,因 dft-core 缺 SSN 命名修复 1d515dc;合并后自愈。
