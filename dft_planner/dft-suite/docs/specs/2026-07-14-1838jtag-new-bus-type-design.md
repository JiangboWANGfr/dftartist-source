# 新增总线类 1838jtag（IEEE 1838 STAP）：genconnection + specgen — 设计

- 日期：2026-07-14
- 状态：**已实现 Phase A/B1/B2，但 2026-07-14 用户澄清后需返工 —— 见 §11（更正 v2，取代 §3 D3 / §4 / §5 D3 / §7 的输出形式与 catalog）。** §6.2 genconn 信号名仍有效。
- 参考 IP：`/Users/jiangbowang/MOI/2025/dftartist/specgen`（`1838jtag.docx`）、`tshell_ref_DftSpecification/IjtagNetwork.v`（STAP schema 真源）、`specgen2/`（schema 原型）
- 目标仓：`dft-suite`（Electron/React，UI+模型+TS 兜底）与 `dft-core`（C++ 生成真源）

## 1. 背景与目标

现在总线类有 4 种：`SSN | IJTAG | BISR | BSCAN`。新增第 5 种 **1838jtag**（IEEE 1838，3D/tile 堆叠芯片的二级 TAP 接入）。要求 **genconnection 和 specgen 都增加这一类**，端到端能真出文件。

**关键区分（用户明确）**：`ijtag = IEEE 1687`（已有，SIB 那套），`1838jtag = IEEE 1838`（新增，STAP 那套）。两者**并列**，新类**不复用** `IjtagNetwork`/`ijtag` 命名。

## 2. 1838jtag 是什么（概念核对）

IEEE 1838 用 **STAP（Secondary TAP，二级 TAP）** 把上层 host 的 JTAG 接入下钻到各 die/tile。文档三缩写：

- `ptap` = 主 TAP（Primary TAP，host 侧入口）
- `sp` = `STapPipeline`（STAP 流水线，跨 tile 打拍）
- `stap` = `STap`（二级 TAP）

`stap_host_list` 把这些元件按 **tile 拓扑顺序**串成链，例如：
`pipe(start) pipe(to_left) sec_host(host_left_stap) pipe(from_left) pipe(to_right) sec_host(host_right_stap) pipe(from_right) pipe(end)`。docx 四张图 = 左右双 host / 单 host / 纯 host / to_host+host 四种 tile 摆位。

Tessent schema 里它挂在 `DftSpecification/IjtagNetwork/HostScanInterface/Tap/HostSTap` 下，成员 `STap` / `STapPipeline` / `SecondaryHostScanInterface`，信号是 TAP 那套（`tck/tms/trst/reset/scan_in/scan_out/capture_en/shift_en/update_en`，前缀 `stap_to_*` / `stap_from_*`）。与现有 IJTAG（`tck/reset/ce/se/ue/sel/si/so`，SIB）**信号集不同 → 是真正的新类**。

## 3. 现状核对（已逐一验证）

生成真源分层，两仓一一对应，加一类要两边都动：

| 关注点              | dft-suite（TS）                                                                                               | dft-core（C++）                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| BusType 联合        | `genconn/core/model.ts:10` `"SSN"\|"IJTAG"\|"BISR"\|"BSCAN"`                                                 | `genconn-core/model.h`（string 比较）                                                                                    |
| genconn 信号展开    | `genconn/core/expand.ts` `DESC` 表                                                                        | `genconn-core/expand.cpp` `clientPrefix/bases`（逐 busType 分支）                                                      |
| genconn 连接/校验   | `genconn/core/generate.ts`、`vinject.ts`                                                                  | `genconn-core/generate.cpp`（含逐 busType 校验）                                                                         |
| genconn 真源落盘    | `GeneratePanel` → `dftGenconn.generateAll`                                                               | `genconn generate-all`（CLI）                                                                                            |
| 图层/颜色           | `genconn/layers.ts` `BUS_LAYERS`、`layout.ts:342` `BUS_COLOR`（exhaustive Record）、`LayerMenu.tsx` | —                                                                                                                         |
| specgen 域过滤      | `specgen/busFilter.ts` `Domain = "SSN"\|"BSCAN"`                                                           | —                                                                                                                         |
| specgen 目录        | `specgen/catalog.ts`（可放置 IP + 端口 + `catalogBus`）                                                   | `specgen-core/catalog.cpp`                                                                                               |
| specgen schema      | `specgen/schema/*.schema.json`（datapath/bscan）                                                            | `specgen-core/datapath.cpp`、`bscan.cpp`                                                                               |
| specgen 全文档生成  | 无（只有`gen.ts` fragment 兜底）                                                                            | `specgen-core/dftspec.cpp` `genDftSpec`（硬编码顶层段名 `SSN {`、经 `genBScanSpec` 出 `EmbeddedBoundaryScan {`） |
| specgen 段→文件    | `store/outputLayout.ts` `specFilesBySection`（SSN/EDT/EmbeddedBoundaryScan）                              | —                                                                                                                         |
| specgen 域循环/预览 | `specgen/Workspace.tsx`（硬编码 SSN+BSCAN 两次 `gen()`、`specByDomain`、palette、specDisplay）          | —                                                                                                                         |

**已就位**（无需动）：图层系统（`BUS_LAYERS`/`layerStateOf`/`LayerMenu` 已支持任意 busType 列层）、DI 跨层机制、schema 驱动的 `genBlock`。

**要补**：BusType 加 1 项后，`BUS_COLOR`（exhaustive Record）会编译报错逼你加色——这是好事；其余 SSN/BSCAN 的硬编码分支要扩到三态。

## 4. 顶层段形态（生成产物长相）

采纳「嵌套块、独立命名、保留 Tessent 内部层级」：

```tcl
read_config_data -in_wrapper $dftspec -rep -from_string {
  Jtag1838 {
    HostScanInterface(1) {
      Tap(1) {
        HostSTap {
          STapPipeline(sp1) { Interface { scan_in: stap_si; scan_out: stap_so; tck: tck; } }
          STap(stap1) {
            Interface {
              Client { scan_in: stap_si; tms: tms; tck: tck; }
              Host   { scan_out: stap_to_tdi; scan_in: stap_from_tdo; }
            }
          }
          SecondaryHostScanInterface(h1) { to_tck: h1_to_tck; from_tdo: h1_from_tdo; to_tdi: h1_to_tdi; }
        }
      }
    }
  }
}
```

顶层 wrapper 名 `Jtag1838`（内部 token），落盘到 `Spec/1838jtag/<design>.dftspec`。

## 5. 决策记录

| #  | 决策                 | 结论                                                                                                                                                                                                     |
| -- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1 | 改动范围             | **两仓都改**（dft-suite + dft-core），端到端真出文件                                                                                                                                               |
| D2 | 数据模型定位         | **新建并列顶层 BusType**（与 SSN/IJTAG/BISR/BSCAN 平级），独立图层/域/输出文件                                                                                                                     |
| D3 | spec 输出形式        | **嵌套块**（非命令式 `-stap_host_list`），**不叫 IjtagNetwork/ijtag**                                                                                                                      |
| D4 | 1838 段内部结构      | **保留 Tessent 内部层级**：顶层 `Jtag1838 { HostScanInterface/Tap/HostSTap/{STapPipeline,STap,SecondaryHostScanInterface} }`，只把最外层 wrapper 从 `IjtagNetwork` 换名 `Jtag1838`（已确认） |
| D5 | 内部 token vs 显示名 | **建议** token=`JTAG1838`（标识符安全，避免数字开头边角），显示名=`1838jtag`；易改（**待确认**）                                                                                         |

## 6. genconnection 详细设计（§怎么生成 genconnection）

### 6.1 数据模型 + 图层

1. `genconn/core/model.ts`：`BusType` 加 `"JTAG1838"`。C++ `genconn-core/model.h` 无枚举（string 比较），无需改类型、只改用到的分支。
2. `genconn/layers.ts`：`BUS_LAYERS` 追加 `"JTAG1838"`。
3. `genconn/layout.ts:342` `BUS_COLOR`：加一色（如 `#f59e0b` 琥珀，区别于 BSCAN 紫）。exhaustive Record 会强制补。
4. `LayerMenu` 自动多出一层（无需改）。

### 6.2 信号展开（新 DESC 条目）—— **由用户 genconnection 图锁定**

`genconn/core/expand.ts` 的 `DESC` 加 `JTAG1838`。共 9 个 base（leaf）；`ijtag_` 限定词**只**出现在 reset/ce/se/ue，且位于「接口名/`stap_`」与「`to_`/`from_`/叶名」之间。client 端无接口名前缀（同 IJTAG）。

| leaf  | 组   | client（`stap_`）  | secondary（接口名`<if>`，如 `host_stap`） | I/O(client/sec) |
| ----- | ---- | -------------------- | --------------------------------------------- | --------------- |
| tck   | down | `stap_tck`         | `<if>_to_tck`                               | in / out        |
| tms   | down | `stap_tms`         | `<if>_to_tms`                               | in / out        |
| trst  | down | `stap_trst`        | `<if>_to_trst`                              | in / out        |
| reset | down | `stap_ijtag_reset` | `<if>_ijtag_to_reset`                       | in / out        |
| ce    | down | `stap_ijtag_ce`    | `<if>_ijtag_to_ce`                          | in / out        |
| se    | down | `stap_ijtag_se`    | `<if>_ijtag_to_se`                          | in / out        |
| ue    | down | `stap_ijtag_ue`    | `<if>_ijtag_to_ue`                          | in / out        |
| tdi   | down | `stap_tdi`         | `<if>_to_tdi`                               | in / out        |
| tdo   | up   | `stap_tdo`         | `<if>_from_tdo`                             | out / in        |

命名规则（复现上表，逐字节对齐用户图）：

- client = `stap_` + `[ijtag_]` + leaf
- secondary down = `<if>_` + `[ijtag_]` + `to_` + leaf；secondary up = `<if>_` + `[ijtag_]` + `from_` + leaf
- `<if>` = secondary 接口名（tile 里如 `host_stap` / `host_r1_stap` / `host_r2_stap`，多 host 时逐个）。

**实现取舍（plan 阶段定）**：现有 `DESC` 把 bus token+方向都塞进 `toPrefix/fromPrefix`，而 STAP 的 `ijtag_` 是**逐 base** 的。两条路：(a) 给 `Base` 加可选 `qual` 段（reset/ce/se/ue=`ijtag_`，其余空），`clientSignal`/`secondarySignal` 在叶名前注入 qual（现有 bus qual 恒空、行为不变）；(b) 给 JTAG1838 单独一个 name-builder。倾向 (a)，改动小且通用。

C++ `genconn-core/expand.cpp` 同步加同一分支（逐字节对齐 TS）。`generate.cpp` 初版无需该类专属校验（无 variant/pd 类维度）。

### 6.3 连接语义

沿用现有 secondary→client 相邻配对（host 侧 secondary 接口 vs die 侧 client 接口，按 base 逐根对接）。tile 的 `stap_host_list` **顺序**不进 genconnection（那是 spec 侧的 tile 编排），genconn 只管一对 host↔stap 的物理连线。

## 7. specgen 详细设计（§怎么生成 spec 数据流）

### 7.1 域 / 过滤 / 输出（TS）

1. `specgen/busFilter.ts`：`Domain` 加 `"JTAG1838"`；`filterDocToDomain` 支持该域（DI 跨层恒留照旧）；`wireBusOf` 走 `catalogBus`。
2. `specgen/catalog.ts`：加 STAP 可放置 IP（`STap`/`STapPipeline`/`SecondaryHostScanInterface`/`HostSTap`），`bus: "JTAG1838"`，端口取 scan_in/scan_out/tck/tms 等；`catalogBus` 扩到三值。`DftIpType`（`genconn/core/dft-model.ts`）加对应类型。
3. `store/outputLayout.ts` `specFilesBySection`：加 `Jtag1838 → Spec/1838jtag/<design>.dftspec`。
4. `specgen/Workspace.tsx`：`specByDomain` 加第三键；`gen()` 多调一次 `"JTAG1838"`；palette / specDisplay / `specSections` 从「SSN|BSCAN 二分支」扩成三分支。
5. `catalog.ts`/`busFilter.ts` 里现在写死 `"SSN" | "BSCAN"` 的联合类型统一扩为含 `"JTAG1838"`。

### 7.2 全文档生成（C++，dft-core）—— **schema 由 specgen2 `add_ijtag_ips.py` 锁定**

STAP 元件 schema 已在 `specgen/specgen2/add_ijtag_ips.py`（用户亲建，已进 `schema.json`）。**逐字段照搬**进 `specgen/schema/jtag1838.schema.json` + C++ 对应组件：

- **STap**（id）props：`parent_instance`、`leaf_instance_name`、`so_retiming`(on|off)、`3dcr_bypass_value`(0|1)；blocks：
  - `Interface`（无 id）→ `Client`（无 id）：scan_in/scan_out/tms/tck/trst/reset/capture_en/shift_en/update_en；`Host`（无 id）：scan_out/scan_in/tms
  - `SecondaryHostScanInterface`（id）：to_tck/to_trst/to_tms/from_tdo/to_tdi
- **STapPipeline**（id）props：`parent_instance`、`leaf_instance_name`、`capture_value`(0|1|self)、`so_retiming`(on|off)；blocks：`Interface`（无 id）scan_in/scan_out/tck/shift_en/capture_en
- **Tap**：复用 schema.json 里 `IjtagNetwork.HostScanInterface.Tap` 现有定义
- specgen2 里三者 wrapper=`IjtagNetwork.HostScanInterface`；本仓移植时把最外层换成 `Jtag1838.HostScanInterface`（D3/D4）

> 注：`SecondaryHostScanInterface` 的 spec **props 只有 5 个可配端口**（to_tck/to_trst/to_tms/to_tdi/from_tdo）；genconnection 里多出的 reset/ce/se/ue（`<if>_ijtag_to_*`）由生成器按 §6.2 自动派生、不进 spec 可配项。两处不矛盾。

落码步骤：

1. 新增 `specgen-core/jtag1838.{h,cpp}`（类比 `bscan.cpp`）：`linearizeStapChain`（按连线遍历 host→pipe→stap 链，DI→STAP 元件、host in→out 直通）+ `genJtag1838Spec`（出 §4 的 `Jtag1838 { HostScanInterface { Tap { HostSTap { … } } } }`）。
2. `specgen-core/dftspec.cpp` `genDftSpec`：在 SSN/EDT/BScan 之后追加 `genJtag1838Spec(scope)`，非空则拼进 wrapper。
3. 逐字节 golden：造一个 tile fixture（对应 docx 单 host 图），核对生成文本。

## 8. 交付切分（两仓，建议顺序）

按 BScan 先例的 A/B 切法，但两者本次都在范围内（D1）：

- **Phase A — dft-suite（UI/模型，无 C++）**：§6.1–6.3 的 TS 侧 + §7.1。交付后：genconn 能画 1838jtag 边界接口/连线/图层门控、Inspector 显示 STAP 信号名；specgen 能放置 STAP 节点、按层过滤。预览文本暂不含 `Jtag1838`（全文档走 C++）。
- **Phase B — dft-core（C++ 移植 + 桥接）**：§6.2 的 `expand.cpp` 分支 + §7.2。genconn/specgen 真出 1838jtag 文本。逐字节 golden。
- 参考已齐：genconn 精确名 = 用户 genconnection 图（§6.2 表）；spec schema = `specgen2/add_ijtag_ips.py`（§7.2）。无外部依赖，可直接进 plan。

## 9. 测试

- **单测**：`expand.ts` JTAG1838 展开（client/secondary 各 base 名+方向）；`catalog` `catalogBus`/新 IP；`busFilter` 三域过滤；`splitSpecSections`/`specFilesBySection` 出 `Spec/1838jtag/`。
- **golden（C++）**：genconn 一对 host↔stap 连接文件；specgen 一个 tile fixture 的 `Jtag1838 {}` 段，逐字节。
- **typecheck** 干净（BusType 扩后所有 exhaustive 处补齐）；`npm test` 全绿；`npm run test:e2e` 真机核验放置/过滤/生成。

## 10. 明确不做

- tile 拓扑自动编排（start/to_left/from_right 那套顺序推导）——初版由用户在画布摆放/连线决定，`pipe()` 名 = StapPipeline 实例名，由用户命名。
- 其它总线类的任何改动；BISR/EDT 无关项。

## 11. 更正 v2（2026-07-14 用户澄清，取代 §3 D3 / §4 / §5 D3 / §7 输出与 catalog）

先前把 1838jtag 的 spec 输出定成嵌套块、catalog 放了三个 IP——**错**。用户澄清后的正确模型：

**元件构成**
- **client = PTAP**（primary tap，data source；genspec 中 client data source 标签显示 `PTAP`）。client source 可 pin/tap。
- **secondary = STAP**（genspec 中标签显示 `STAP`）。secondary 的两种放置**复用现有 `BusInterface.placement`**：
  - `placement = "pin"` → 生成 `sec_host(<interfaceName>)`（对应 genconnection 里的 SecondaryHostScanInterface 端口）。
  - `placement = "other"`（=stap）→ 生成 `host`（可像 client TAP 一样在 module 内移动的 STap）。
- **specgen 唯一可放置 IP = `StapPipeline`（=pipe）**。**STap、SecondaryHostScanInterface 都不是 specgen IP**（前者=secondary(other)，后者=secondary(pin)，都是 genconn 边界接口）。→ Phase A catalog 里加的这两个要删。

**spec 输出形式（取代 §4 嵌套块）= 命令式 `stap_host_list`，一行一个 token，无 `set_dft_specification_requirements`/`check_design_rules` 前缀：**
```tcl
set spec [create_dft_specification -stap_host_list {
  pipe(start)
  pipe(to_left)
  sec_host(host_left_stap)
  pipe(from_left)
  pipe(to_right)
  sec_host(host_right_stap)
  pipe(from_right)
  pipe(end)
}]
```
- `pipe(<name>)` = StapPipeline 实例（name = 实例名，用户命名 start/to_left/from_left/…）。
- `sec_host(<name>)` = secondary(placement=pin)，name = interfaceName。
- `host` = secondary(placement=other)。
- token 顺序 = 从 PTAP(client) 沿链遍历序（docx 四张图 = 四种 tile 拓扑）。

**因此需返工（§6.2 genconn 信号展开不变；下列为增量）：**
- **Phase A（dft-suite）**：`catalog.ts` 删 STap+SecondaryHostScanInterface（留 StapPipeline）、`dft-model.ts` DftIpType 删这两个、`ipvisual.ts` 删两色；client/secondary 数据源标签 PTAP/STAP（按 role）；jtag1838 域输出是命令式 tcl（非 `read_config_data` 块）→ `splitSpecSections`/`specFilesBySection`/Workspace 对 jtag1838 域改为「整段命令文本直接落 `Spec/1838jtag/`」，不再当块提取。
- **Phase B2（dft-core）**：`genJtag1838Spec` 改出命令式 `stap_host_list`（链遍历 linearizer 复用，映射简化：StapPipeline→`pipe(name)`、secondary(pin)→`sec_host(name)`、secondary(other)→`host`；去掉 DI→STap）；`catalog.cpp` 删 STap；`jtag1838.schema.json`/`jtag1838ComponentSchema` 命令式下不再需要（可撤）；frozen golden 改成命令式。
