# SpecGen：DesignInstance 按总线连线 + spec 预览/输出按层分开 — 设计

日期：2026-07-13
状态：设计（用户已确认方向；R1 spike 已验证 → 无需 dft-core 改动，可全程在 dft-suite 内做）
关联：`src/specgen/catalog.ts`、`src/specgen/wire.ts`、`src/specgen/DftIpNode.tsx`、`src/specgen/Workspace.tsx`、`src/specgen/busFilter.ts`（新）、`src/store/outputLayout.ts`、`src/core-bridge/specgen.ts`（`../dft-core` 无需改，仅调用）

## 背景与问题

紧接「图层几何独立」之后，用户在 `chip4.arch` 上遇到两个卡点：

1. **同一个 DesignInstance 不能被 SSN 与 BSCAN 各连一条线。** `DesignInstance` 的端口是**不分总线**的通用 `bus_data_in`/`bus_data_out`（`catalog.ts:41`）。SSN 的线先占了 `bus_data_in`，BSCAN 层再想连同一个 `bus_data_in` 时被 fan-in 规则（`wire.ts:38`「每个 in 只接一条」）拒绝。结果：一个子块的 SSN 数据通路和 BSCAN 扫描链没法同时挂上。

2. **spec 预览/输出没有按层分开。** 生成器 `specgen gen` 产出**一份合并 spec**（`read_config_data … { SSN { DataPath(1){…} } … }`），且**任一总线网络不完整就整份失败**（实测 chip4/chip3 都因 `BScan 链断裂` 整份报错，连 SSN 段都看不到）。用户想：SSN 层看 SSN spec、BSCAN 层看 BSCAN spec，生成时分文件保存。

## 目标

- **A. DesignInstance 按总线拆端口**：SSN 线连 DI 的 SSN 口、BSCAN 线连 DI 的 BSCAN 口，互不冲突；拉线按活动层解析到对应总线端口。
- **B. spec 预览/输出按层分开**：按域过滤 doc 分别生成，SSN 层显示 SSN spec、BSCAN 层显示 BSCAN spec、「全部」并排；输出按顶层段拆 SSN/EDT/BScan 三文件；**一层断链不拖累另一层**。

## 非目标

- 不改图层几何独立那套（已完成）。
- 不引入 DI 的 secondary BScan 口（YAGNI，先只做主链 in/out；需要再加）。
- 不追求「一份合并 spec」输出（B 改为按顶层段拆 SSN/EDT/BScan 三文件；若下游仍需合并，另议）。
- **不写老数据格式迁移**（用户已确认不用兼容）。DI 端口从 2 口变 4 口，老 `.arch` 里的 DI 加载后自动补齐；既有 SSN 线仍引用 `bus_data_in/out`，无需迁移。

---

## Part A — DesignInstance 按总线拆端口

### A1. 端口模型（`catalog.ts`）
`DftPort` 增一个可选 `bus?: "SSN" | "BSCAN"`。DesignInstance 的 `ports` 从 `[bus_data_in, bus_data_out]` 扩为四口：

```ts
// DesignInstance ports（bus 标注）
{ name: "bus_data_in",   dir: "in",  side: "left",  role: "data", bus: "SSN" },   // SSN 口保留原名（生成器按此名读 SSN 数据通路，非为数据兼容）
{ name: "bus_data_out",  dir: "out", side: "right", role: "data", bus: "SSN" },
{ name: "bscan_scan_in", dir: "in",  side: "left",  role: "data", bus: "BSCAN" }, // 新增 BSCAN 主链 in/out（仅 UI/model 用名）
{ name: "bscan_scan_out",dir: "out", side: "right", role: "data", bus: "BSCAN" },
```
- `bscan_scan_in/out` 是 **UI/model 内部名**（避免 UI 上 SSN/BSCAN 两条线撞同一 `bus_data_in`、并让按层渲染/归属清晰）。
- **生成器只认 DI 的 `bus_data_in/out`**（R1 已验证）→ 生成 BSCAN 域 doc 时由 `filterDocToDomain` 把这两个名**归一化回 `bus_data_in/out`**（见 B1）。

### A2. 按活动层解析 DI 端口
DI 是「一个盒、按层显示不同口」而非「四个口一起露出」，避免视觉杂乱：

- **拉线到 DI（in）**：`Workspace.tsx` `onBodyEnter` 现在取 `ports.find(p => p.dir==="in" && p.role!=="clock" && …)`。改为：DI 时取 `p.dir==="in" && p.bus === activeLayer`（活动层的 in 口）。
- **从 DI 起线（out）**：`DftIpNode` 的 `outPort = ports.find(p => p.dir==="out" && p.role!=="clock")`。DI 时需按活动层取 `p.bus === activeLayer` 的 out 口 → `DftIpNode` 需拿到 `activeLayer`（新增 prop）或由 Workspace 传入已解析的 outPort。
- 非 DI 的单总线 IP：`bus` 缺省，解析逻辑不变。

### A3. 连线校验与总线归属
- fan-in 规则不变（每个**端口**一条线）。因 SSN 线落 `bus_data_in`、BSCAN 线落 `bscan_scan_in`，是不同端口 → 不再冲突。
- `wireBus(w)`（`Workspace.tsx`）现在对 DI 端点返回 `null`（DI 跨层）。改为：端点是 DI 端口时，用**该端口的 `bus`** 定层。→ 顺手修掉现在「两端都是 DI 的线跨层恒可见」的 hack：DI 线现在能正确归属 SSN/BSCAN，按层门控（`layerStateOf`）。
- `endpointDir`/`validateDftWire` 不需改（按端口名查 dir/role 已够）。

### A4. 渲染
- DI 仍是一个盒，恒显所有层（跨层节点）。但**它连出的线**按 A3 的总线归属做层门控：SSN 层只显 DI 的 SSN 线、BSCAN 层只显 BSCAN 线。
- 起线点（`DftIpNode` 四边 dot / 盒身 in 靶）按活动层对应到该层端口。

---

## Part B — spec 预览/输出按层分开（含 EDT 独立文件）

**生成器实测**：产出的 spec = 若干**并列顶层段** `SSN{}` / `EDT{}`（由 ScanHost 的 chain 挂出，独立段）/ `BScan{}`，同在一个 `read_config_data{ }` 里；且**任一段网络不完整 → 整份生成失败**。策略：**按域独立生成（稳健）+ 按顶层段切文件（拆出 EDT）**。

### B1. 两个生成域（各自独立生成，互不拖累）
- **SSN 域** = SSN 接口 + `catalogBus===SSN` 的 IP（ScanHost/Pipeline/…，**含 EDT**）+ DesignInstance + SSN/EDT 线 → 生成 `{ SSN{} [EDT{}] }`。
- **BSCAN 域** = BSCAN 接口 + BSCAN IP + DesignInstance + BSCAN 线 → 生成 `{ EmbeddedBoundaryScan{} }`。
- 新纯函数 `filterDocToDomain(doc, defId, domain)`（`src/specgen/busFilter.ts`），domain ∈ {SSN, BSCAN}：按 `interface.busType` / `catalogBus(ip)`（DI 恒留）/ `wireBus(w)`（A3 的归属，含 DI 端口 bus）过滤；其余原样，`ui.rootDefId=defId`。
- **BSCAN 域额外归一化**：把保留下来的 DI 线端点里 `bscan_scan_in`→`bus_data_in`、`bscan_scan_out`→`bus_data_out`（R1：生成器只认 `bus_data_in/out`）。该域只剩 BSCAN 线，归一化后不会与 SSN 线撞。
- 两域各自 `try/catch`：BScan 断链只让 BSCAN 域报错，SSN 域照常出——正解当前卡点。
- **已知局限**：EDT 与 ScanHost 强耦合，同属 SSN 域，故 EDT 断链会连累 SSN 域生成。v1 接受（EDT 在 SSN 层，用户就在眼前修）；记录待后续可细分。

### B2. 顶层段切分（新纯函数 `splitSpecSections`）
`splitSpecSections(specText): Record<string, string>`——按顶层 `NAME { … }` 花括号配对提取各段，返回「段名→段文本」。SSN 域输出得到 `{ SSN, EDT? }`，BSCAN 域输出得到 `{ EmbeddedBoundaryScan }`（BScan 顶层段名实为 `EmbeddedBoundaryScan`，R1 实测）。

### B3. 预览按活动层（`Workspace.tsx` 预览 effect）
- 现在防抖调 `dftSpecgen.generate(serialize(docForGen))` 出一份 `specText`。
- 改为按活动层：`"SSN"` → 显示 SSN 域生成结果（含 SSN+EDT 段）；`"BSCAN"` → BScan；`null`（全部）→ 两域并排。
- 各域各自 try/catch，一域报错不挡另一域；面板标题标域名 `DftSpecification (SSN)` / `(BScan)`。

### B4. 输出三文件（`outputLayout.ts`）
```ts
export function specFilesBySection(design: string, secs: Record<string, string>): OutFile[] {
  const wrap = (s: string) => `read_config_data -in_wrapper $dftspec -rep -from_string {\n${s}\n}\n`;
  const put = (sec: string | undefined, rel: string): OutFile[] => sec?.trim() ? [{ relPath: rel, text: wrap(sec) }] : [];
  return [
    ...put(secs.SSN,                 `Spec/ssn/${design}.dftspec`),
    ...put(secs.EDT,                 `Spec/edt/${design}.dftspec`),
    ...put(secs.EmbeddedBoundaryScan,`Spec/bscan/${design}.dftspec`),
  ];
}
```
- 「保存」/「写入工程」改写这三份（下载则分次/打包）。旧 `specFile` 单文件视调用点保留或删。
- **待对齐**：多份 dftspec 的 `-rep`（整体替换）vs 追加语义，按下游 Tessent 流程定；默认每份独立带同款 wrapper。

---

## R1 —— 已由 spike 验证（结论已并入上文设计）

**结论：生成器已支持「BScan 链里放 DesignInstance」，直接输出 `EBScanInstance`，无需 dft-core 改动。** 实测最小链 `BSCAN client → DI → client`：
```
EmbeddedBoundaryScan {
  HostBScanInterface (client) {
    EBScanInstance (harden1_i1) { }
  }
}
```
**关键约束**：生成器只认 DI 上的 `bus_data_in`/`bus_data_out`（试 `scan_in`/`bscan_scan_in` 均报「BScan 链断裂：走不到 client 的 in 脚」）。即：DI 在 SSN 与 BScan 两条链上**都用 `bus_data_in/out`**，靠链追溯到哪种接口来区分 SSN vs BScan。

**因此设计的关键调整**（已并入 A1/B1）：
- Part A 的 DI **UI 端口**仍用区分名（`bscan_scan_in/out`）——为了 UI 上不撞 fan-in、按层渲染/归属清晰。
- 但 `filterDocToDomain(_, "BSCAN")` 生成 doc 时，把 DI 的 `bscan_scan_in/out` **归一化回 `bus_data_in/out`**（该域 doc 里只剩 BSCAN 线，不会与 SSN 线撞），生成器才认。SSN 域 doc 里 DI 本就是 `bus_data_in/out`，不动。

**R2：DI 的 BSCAN 端口方向语义。** 扫描链串行 in→out；主链单进单出足够（非目标已排除 secondary）。

## 测试与验收

**Part A**
1. 单测（catalog/wire）：DI 有四口带 bus 标注；SSN 线落 `bus_data_in`、BSCAN 线落 `bscan_scan_in`，两条同时存在校验通过（不再 fan-in 冲突）。
2. 单测：`wireBus` 对 DI 端口按端口 bus 归属；两端都是 DI 的 SSN 线归 SSN、BSCAN 线归 BSCAN。
3. e2e/手动：SSN 层连 DI、切 BSCAN 层再连同一 DI，两条线各自只在本层显示。

**Part B**
4. 单测：`filterDocToDomain(doc,"SSN")` 只留 SSN 接口/IP（含 EDT）/线 + DI；`"BSCAN"` 只留 BSCAN + DI，且 DI 线端点 `bscan_scan_in/out` 归一化为 `bus_data_in/out`。
5. 单测：`splitSpecSections` 从 `{ SSN{} EDT{} }` 切出 `{SSN, EDT}`（花括号配对，不吞不漏）；从 `{ EmbeddedBoundaryScan{} }` 切出 `{EmbeddedBoundaryScan}`。
6. 集成（CLI，回归当前痛点）：一个「SSN 完整、BSCAN 故意断链」的 doc → `filterDocToDomain` 后 SSN 域生成成功、BSCAN 域生成报错，**互不影响**。
7. 集成（CLI，回归 R1）：一个「BSCAN client → DI → client」doc → `filterDocToDomain(_,"BSCAN")` 归一化后生成含 `EBScanInstance` 的 `EmbeddedBoundaryScan` spec。
8. 单测：`specFilesBySection({SSN,EDT,EmbeddedBoundaryScan})` 落 `Spec/ssn/…` + `Spec/edt/…` + `Spec/bscan/…`（各带 wrapper）。

## 已决（用户确认）
- **B 生成方式** = 按域过滤分开生成（稳健）。
- **B 文件命名** = 子目录：`Spec/ssn/…` + `Spec/edt/…` + `Spec/bscan/…`（EDT 顺 SSN/BSCAN 同款风格）。
- **不兼容老数据格式**（无迁移）。
- **R1 已 spike 验证：生成器支持 DI→EBScanInstance，无需 dft-core 改动**；代价是 BSCAN 域生成前把 DI 端口归一化回 `bus_data_in/out`（已并入 B1）。

## 剩余待对齐（实施时定，不阻塞）
- 多份 dftspec 文件的 `-rep`/追加语义（下游 Tessent 流程）——默认每份独立带 wrapper。
- EDT 断链连累 SSN 域的局限，是否需后续把 SSN 数据通路与 EDT 再拆生成。
