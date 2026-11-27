# pad-core 设计（Pad I/O → 边界扫描配置生成器）

- 日期：2026-07-10
- 状态：设计定稿，待实现
- 所属：`dft-core`（新库 `pad-core`）+ `dft-suite`（新 UI 模块，P2）

## 1. 背景与目标

在芯片/子系统网表里，I/O pad（输入/输出/双向 pad 单元）需要被识别、分类，并配置进 Tessent 边界扫描（Boundary Scan / Embedded Boundary Scan）流程。当前没有工具把「网表里的 pad 实例」和「cell library 里的 pad 定义」自动对上并产出 Tessent 配置，全靠手写。

`pad-core` 的目标：

> 上传一份 cell library + 指定网表 filelist → 自动抽出所有 pad 实例、判定方向、上溯到芯片顶层 port 名 → 生成一张**可编辑配置表** → 由表产出两段 **Tessent 边界扫描配置**。

定位与 `genconn-core` / `ctrlgen-core` 一致：一个**生成器**库，C++ 内核，UI 当薄客户端。

## 2. 范围（P1 / P2）

**P1（本期实现，dft-core）**
- cell library 解析（**全部 cell，不止 pad**）。
- pad 实例抽取（大小写敏感精确匹配 + 逐层下钻 + gpio 上溯）。
- 可编辑配置表（自动列 + 人工列）。
- 生成输出 A（`read_config_data … AuxiliaryInputOutputPorts`）。
- 生成输出 B（`set_boundary_scan_port_options`）。
- 对外：CLI + NDJSON（沿用 dft-core 既有契约）。
- `func` / `enable` 列**入表但不生成**（只存值 + 预留接口）。

**P2（后续，留接口）**
- `func=ssn` 的 SSN datapath 生成（`ssn_bus_data_in/out[N-1:0]`）。
- 其它 `func` 选项。
- `enable`（手动控制信号）的生成。
- UI（`dft-suite/src/pad/` + `src/core-bridge/pad.ts`）。

## 3. 架构

```
上传 cell lib(.tcelllib) ─┐
                         ├─► pad-core (C++) ─► ① 配置表(auto+edit) ─► ② Tessent 配置 A+B
网表 filelist(chip_top.f)─┘         │
                                    └─ 依赖 hdl-core(slang) 取全层网表连接
```

- **dft-core / pad-core（新库）**：解析、抽取、建表、生成。复用 `hdl-core` 的 `LocalNetlist` / `NetConnection`（不改 slang / hdl-core 逻辑）。
- **dft-suite / src/pad（P2）**：表格编辑器、design_level 选择、lib 上传、生成预览。**薄客户端，不做 TS 逻辑镜像**，全部经 `src/core-bridge/pad.ts` 调 pad-core 的 NDJSON。

## 4. 输入

1. **cell library**：用户上传的 `.tcelllib`（不同公司命名不同，不假设叫 ipad/opad/iopad）。
2. **网表 filelist**：如 `chip_top.f`（喂给 hdl-core / slang）。
3. **design_level**：`chip` | `phy` | `sub`。
4. **辅助端口类别**（仅 phy/sub）：`external` | `internal`（用户选）。
5. **配置 overlay**（可选 JSON）：人工列的覆盖值（`bscan_en` / `reuse` / `func` / `enable`）。

## 5. cell library 解析

解析**所有** model（后续功能需要），每个 model 记：

```
CellDef {
  name        // 原样 module 名（大小写保留）
  cellType    // cell_type 值（pad / and / or / dff / ...）
  pins[] {
    name
    attrs[]   // 该 pin 的属性名列表
  }
}
```

pad 判定**只认标准属性名**（Tessent 跨厂商统一），不认具体 cell/pin 名：

| 属性 | 含义 | 用途 |
|---|---|---|
| `cell_type = pad` | 此 model 是 pad | 纳入 pad 集合 |
| `pad_from_io` | 外部脚，输入 | dir=in，标记 padPin |
| `pad_to_io` | 外部脚，输出 | dir=out，标记 padPin |
| `pad_pad_io` | 外部脚，双向 | dir=inout，标记 padPin |
| `pad_from_pad` / `pad_to_pad` | core 侧脚 | 标记 corePin |
| `pad_enable_high` / `pad_enable_low` | 输出使能脚 | 标记 enablePin + 极性 |
| `pad_pull0` / `pad_pull1` | 弱上/下拉 | 记录 pull |

由此得 pad 字典：`cellName → { dir, padPin, corePins, enablePin, enablePolarity, pull }`。

## 6. pad 实例抽取

1. 从 pad 字典取 pad cell 的 module 名集合。
2. hdl-core 展开 filelist，遍历**全层**实例（含 `pad8_io_macro_*` 等子模块）。
3. **大小写敏感、精确匹配**实例 module 名 ∈ pad cell 集合 → 判为 pad 实例。
   - 不做大小写归一/别名。名字对齐是用户责任（用户已将网表统一为与 lib 一致的大小写）。
   - **诊断（可选）**：若某实例名与某 pad cell 仅差大小写，输出 warning「疑似 pad，大小写不一致」，不自动改。
   - `iopad_sel` 之类（lib 无、实为 AND 选择器）因字典无它而自然排除。
4. 每个 pad 实例，按字典的 pin 角色，从其 `NetConnection` 读出各脚所连 net：
   - `padNet` = padPin 连的 net；`coreOutNet` / `coreInNet` = corePin 连的 net；`autoEnableNet` = enablePin 连的 net。
5. **gpio 上溯**：把 `padNet` 沿层次上溯到 **chip 顶层 port 名**，作为表的 `gpio`。

**假设**：pad 是黑盒（.v 无 module 定义），实例必须用**具名端口连接**（`.PAD(...)`），slang 才能拿到 pin 名。目标网表满足此条件。

## 7. 配置表

| 列 | 来源 | 说明 |
|---|---|---|
| `gpio` | 自动（顶层 port） | 芯片管脚名，如 `GPIO_01` |
| `pad` | 自动 | pad cell / 实例 |
| `dir` | 自动（lib 属性） | in / out / inout |
| `bscan_en` | 手填，默认 **no** | y/n；驱动输出 B 的 dont_touch |
| `reuse` | 手填（仅 inout） | in / out；驱动输出 A 的分组 |
| `func` | 手填 | ssn / …（可扩展）/ 自由输入；P1 只存 |
| `enable` | 手填 | 控制信号名；P1 只存 |

overlay JSON 以 pad 实例路径为 key，覆盖 4 个人工列。默认：`bscan_en=no`，`reuse` 空（inout 不强制），`func` 空，`enable` 默认继承 `autoEnableNet`。

## 8. design_level → wrapper / 类别 映射

| design_level | `-in_wrapper $dftspec/…` | 辅助端口类别前缀 |
|---|---|---|
| `chip` | `BoundaryScan` | `internal_auxiliary_*_ports` |
| `phy` / `sub` | `EmbeddedBoundaryScan` | `external_` 或 `internal_`（用户选） |

## 9. 输出 A：read_config_data（辅助端口）

- **成员**：仅**被指派了 `reuse` 的 pad**。
- **分组**：`reuse=in` → 输入列表；`reuse=out` → 输出列表。
- **排除**：`func=ssn` 的口**不进** A（被 SSN 接管，走 ssn_bus）。

```
read_config_data -in_wrapper $dftspec/<Wrapper> -rep -from_string {
  AuxiliaryInputOutputPorts {
    <cat>_auxiliary_input_ports  : <reuse=in 且 func≠ssn 的 gpio, 逗号分隔>;
    <cat>_auxiliary_output_ports : <reuse=out 且 func≠ssn 的 gpio, 逗号分隔>;
  }
}
```

## 10. 输出 B：set_boundary_scan_port_options

- `-pad_io_ports { }` = **表里全部 pad 的 gpio**（不受 bscan_en 影响），按截图风格换行排版。
- `dont_touch` 列表 = **`bscan_en=yes` 的 gpio**。
- **不输出任何注释行**。

```
set_boundary_scan_port_options -pad_io_ports { \
   <全部 pad 的 gpio, 分行> }
set_boundary_scan_port_options [get_ports [list <bscan_en=yes 的 gpio>]] -cell_options dont_touch
```

## 11. func = ssn（P2 语义，P1 留接口）

- `func` 是可选功能项：`ssn` 现有，未来会加其它，需设计成**可扩展枚举 + 自由输入**。
- 选 `ssn` 时，该方向被 SSN datapath 接管，其总线信号：
  - 输入：`ssn_bus_data_in[N-1:0]`
  - 输出：`ssn_bus_data_out[N-1:0]`
  - **位宽 N = 该方向（in / out）里 `func=ssn` 的口计数。**
- **P1**：只记录 `func=ssn`、预留 SSN 接口（含 N 的计算与 ssn_bus 命名约定），**不生成** SSN datapath；这些口从输出 A 中排除（见 §9）。

## 12. enable（P2）

- `enable` = 手动填写的 DFT 控制信号名，默认继承 `autoEnableNet`。
- **P1 只入表存值，不参与生成。**

## 13. 对外接口（dft-core）

新增 `app/pad_main.cpp`，与 genconn/ctrlgen 同风格。

**CLI**
- `pad table -f <filelist> --lib <celllib> [--config <overlay.json>] [--json]`
  → 打印配置表（文本表 / JSON）。
- `pad gen -f <filelist> --lib <celllib> [--config <overlay.json>] --level chip|phy|sub [--aux external|internal]`
  → 打印输出 A + 输出 B。

**NDJSON**（供 P2 UI）
- `pad.table` → 表数据数组。
- `pad.generate` → { outputA, outputB }。

## 14. 核心数据模型

```
PadInstance {
  path            // 层次路径, 唯一 key
  cell            // pad cell 名（原样）
  gpio            // 上溯到的顶层 port 名
  dir             // in | out | inout（lib）
  padNet, coreInNet, coreOutNet, autoEnableNet

  // 人工列（overlay 覆盖）
  bscanEn         // bool，默认 false
  reuse           // "" | in | out（仅 inout）
  func            // "" | ssn | <自由>
  enable          // 默认 = autoEnableNet
}
```

## 15. 非目标

- 不做 pull / 驱动强度等电气分析，只做方向 + 端口结构。
- 不改 slang / hdl-core 既有逻辑。
- P1 不做 UI、不做 SSN datapath / enable 生成。

## 16. 分期总结

- **P1**：lib 全解析 → pad 抽取 + gpio 上溯 → 表 → 输出 A + B（CLI/NDJSON）。
- **P2**：func=ssn datapath、enable 生成、其它 func、UI（dft-suite/src/pad + core-bridge/pad.ts）。

## 17. 待确认 / 风险

- gpio 上溯：多层网表里 padNet 到顶层 port 的映射需覆盖 bus/位选与经 wrapper 的情况；以目标网表为准做验证 fixture。
- `-pad_io_ports` 排版：以截图为准（每行若干、续行 `\`、末行 `}` 紧贴），需字节级对齐 golden。
- overlay key：用实例层次路径；若 UI 更适合用 gpio 作 key，P2 再评估。
