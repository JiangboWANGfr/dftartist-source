# Register Count (slang) — 设计规格

- 日期：2026-07-09
- 状态：设计中（待用户审阅）
- 涉及仓库：`dft-core`（slang 计数内核 + 协议 + CLI）、`dft-suite`（UI 显示）
- 相关：`dft-core/docs/2026-06-29-drc-core-spec.md`（yosys `reg_count.py` 验 7762 FF 的标尺）、`dft-core/docs/2026-06-27-DesignHierarchy-complete.md`（`SeqElement` / `get-sequential`）

---

## 1. 目标

用 **slang** 前端得到设计的**寄存器数量（register number = 触发器 bit 数）**，替代早期用 yosys 数 `$dff` 的 `reg_count.py`；并在 dft-suite 里用一个**可排序的 Register Count 报告 tab** 逐 instance 显示每个实例的寄存器数量（own / subtree 子树滚动汇总 / memory），**不改动层次树**。

**验收基准**：gps_baseband 已知 7762 FF，slang 计数应与 yosys `$dff` 位数在 **±2%** 以内（详见 §7）。

## 2. 计数口径（已定）

对每个精细化后的 instance，"own register bits" = 被时钟边沿驱动的变量位宽之和：

1. 遍历该 instance body 里的**边沿触发过程块**（`always_ff`，或 `always` 且带 `posedge/negedge` 时序）——复用 `getSequential` 已有的块识别逻辑（`DesignDb.cpp:558` `extractSeq` 的前半段）。
2. 在每个块体内收集所有**赋值 LHS 的目标变量符号**（最长静态前缀）：
   - 递归遍历块体语句，命中 `AssignmentExpression`；取 `assign.left()`。
   - LHS 是 concatenation/streaming（`{a,b} <= …`）→ 递归各 operand；否则 `left().getSymbolReference()` 解析穿过 element/member select 得到基符号（与 `collectSyms` 同款，`DesignDb.cpp:501`）。
3. 跨块对目标变量符号**去重**（同一变量在多个块里被赋值只算一次），对每个唯一变量按 `sym->getType().getBitWidth()` 求和 → own bits。

**口径决策**：

- **Memory / unpacked 数组排除**：目标变量若 `getType().isUnpackedArray()` 为真（如 `reg [7:0] mem[0:255]`），**不计入 register number**（它们是 RAM，不是 scan flop；与 yosys `$dff`/DFT scan-cell 语义一致）。其位数另计入 `memoryBits` 字段，供后续单列展示（本期不在 UI 显示）。
- **partial-bit 赋值**（只赋 `q[3:0]`）：按变量**声明全宽**计数。相对 yosys 可能轻微高估，作为已知偏差记录（§7 容差覆盖）。
- **blackbox / primitive**：无 RTL body，own = 0。
- **subtree**：`subtree = own + Σ 子实例 subtree`，自底向上一趟 walk 完成（子实例含展平的 instance 数组、下降的 generate 块——沿用 `collectChildren`/`walkSeq`，`DesignDb.cpp:607`）。

## 3. C++ 计数内核（dft-core/hdl-core）

新增（不改 `get-sequential`，保持 DRC 契约）：

```cpp
// DesignDb.h
struct RegCount {
    std::string instanceId;   // = hierarchicalPath
    int own = 0;              // 本实例 body 直接推断的 flop bit
    int subtree = 0;          // own + 子实例 subtree
    int memoryBits = 0;       // 被时钟驱动的 unpacked 数组 bit（own 口径，排除在 own/subtree 外）
};

struct RegCountResult {
    std::vector<RegCount> counts;  // 每个 instance 一条
    int total = 0;                 // 顶层 subtree 之和（全设计 flop 总数）
};

RegCountResult DesignDb::getRegisterCounts();
```

实现：一趟后序 walk（与 `walkSeq` 同结构）。每个 instance：
- `collectProcBlocks(inst.body, …)` → 过滤出边沿触发块（复用 `extractSeq` 的时序判定，抽成 `isEdgeTriggered(pb)` 辅助）。
- 新 helper `collectAssignTargets(const Statement& body, std::set<const ValueSymbol*>& out)` 收集 LHS 目标（§2.2）。
- 对去重后的目标按 `isUnpackedArray()` 分流累加到 `own` / `memoryBits`。
- 递归子实例，回填 `subtree`。

新增辅助函数放在 `DesignDb.cpp` 的匿名 namespace（与 `extractSeq`/`walkSeq` 同区）。

### 协议

`hdl-core/protocol/NdjsonServer.cpp` 新增 `get-register-count` 方法：
```json
{ "counts": [ {"instanceId": "...", "own": 512, "subtree": 5120, "memoryBits": 0}, ... ],
  "total": 7762 }
```

### CLI

`app/cli_main.cpp` 新增 `regcount <filelist> [opts]`：打印 `total` + 每 instance 一行（`instanceId  own  subtree`），供回归与 yosys 对比。用法行加入 usage（对齐现有 `sequential`，`cli_main.cpp:213`）。

## 4. UI 显示（dft-suite）——专门的 Register Count 报告 tab

**关键决策**：**不**在层次树里加行内徽标（会让树变脏）。改为在右侧工作面（`TabArea`）新增一个**单例报告 tab**，一张可排序表列出所有 instance 的 own / subtree / memory。树完全不动。与 DFX Ctrl tab（`openDfxCtrlTab`，`store.ts:172`）同款：singleton、内容由 daemon 数据派生。

### 类型 & bridge

- `src/core-bridge/model.ts`：
  - 新增 `RegCount { instanceId, own, subtree, memoryBits }` 与 `RegCountResult { counts, total }`（镜像协议）。
  - `Tab` 联合类型新增 `RegCountTabSpec { id: "regcount"; kind: "regcount"; title: string }`（单例、无自带 id，内容由 `regCounts` 派生，与 `DfxCtrlTabSpec` 同构）。
- `src/core-bridge/client.ts`：新增 `getRegisterCounts(): Promise<RegCountResult>`（`window.dft.design.query("get-register-count", {})`）。

> `NodeState` **不加** `regBits` 字段——树不显示寄存器数。

### store（`src/hierarchy/store.ts`）

- 新增 state：`regCounts: RegCountResult | null`（默认 `null`；`blankState` 里加，`reset`/新设计打开时清空）。
- 新增 action `openRegCountTab()`：与 `openDfxCtrlTab` 同款——tab 已存在则激活，否则 `addTab`（`REGCOUNT_TAB_ID = "regcount"`, `kind: "regcount"`, `title: "寄存器统计"`）。
- **加载策略：按需懒加载**（比急加载省——不打开报告就不跑全设计 walk）。首次打开报告 tab 时 `hs.getRegisterCounts()` 填充 `regCounts`；已有缓存直接用。失败则报告 tab 内显示错误态，不影响其它功能。

### 组件

- `src/hierarchy/TabArea.tsx`：`tabbody` 分支新增 `{active?.kind === "regcount" && <RegCountTab />}`。
- 新建 `src/hierarchy/RegCountTab.tsx`：
  - 挂载时若 `regCounts == null` 触发一次 `hs.getRegisterCounts()`（loading / error / ready 三态）。
  - 渲染 `total` + 一张表：列 `Instance | own | subtree | memory`。
  - **默认层级视图**（daemon 前序 = parent 紧接其子孙，按深度缩进 + 显示 leaf 名，读起来是棵树，保留层级结构）。点数值列头（own/subtree/memory）**平铺排序**找 flop 大户；点 Instance 列头回到层级视图。顶部 filter 按 instanceId 子串过滤。
  - **点击行 → 选中树里对应实例**（复用 `selectInstance({ nodeId, defId })`；defId 从 `instances[id]` 取，取不到则只滚动/高亮，不报错）。
  - 表样式加到 `src/hierarchy/styles.css`（等宽数字列、右对齐、sticky 表头）。
- 入口按钮：`src/hierarchy/Workspace.tsx` 左侧 `leftdock` 在 `<HierarchyTree />` 上方加一个极简 dock 头，放「寄存器统计」按钮 → `openRegCountTab()`。仅在 `status==="ready"` 时可点。

报告 tab 布局示意：
```
┌ 寄存器统计 ───────────────────────────────┐
│ 🔍 filter…                    total 7762  │
│ Instance            own   subtree   mem   │
│ ───────────────────────────────────────── │
│ soc_top               0    7762      0    │
│ soc_top.cpu         128    7120      0    │
│ soc_top.dma          40     642    512    │
│ soc_top.dma.regfile 512     512      0    │
│ …                                         │
└───────────────────────────────────────────┘
点列头排序 · 点行高亮左侧树里对应实例 · 树本身零改动
```

## 5. 组件边界

| 单元 | 职责 | 依赖 | 接口 |
|---|---|---|---|
| `collectAssignTargets` (C++) | 从块体收集 LHS 目标变量 | slang AST | `(Statement&, set<ValueSymbol*>&)` |
| `getRegisterCounts` (C++) | 全层次逐 instance 计数 + 汇总 | 上者 + walk | `RegCountResult` |
| `get-register-count` (协议) | 序列化 | 上者 | NDJSON |
| `getRegisterCounts` (TS bridge) | 调用 daemon | window.dft | `Promise<RegCountResult>` |
| store `regCounts` + `openRegCountTab` | 缓存报告数据 + 开/激活单例 tab | bridge | Zustand 字段/action |
| `RegCountTab` 组件 | 可排序表、filter、点行选中实例 | `regCounts` + `selectInstance` | React |
| dock 头「寄存器统计」按钮 | 打开报告 tab | `openRegCountTab` | React |

## 6. 错误处理

- 计数是尽力而为，不阻塞主流程：C++ 侧任何单块解析异常 → 该块贡献 0，不抛。
- UI `getRegisterCounts` 失败 → 报告 tab 内显示错误态；层次树与其它 tab 不受影响。
- 变量位宽为 0（异常类型）→ 该目标贡献 0。

## 7. 验证与验收（接 yosys 交叉验证）

1. **单元测试**（dft-core `test/`，ctest）：小型定向用例——
   - 单块 `reg [31:0]` → own=32；
   - 多块赋同一 `reg [7:0]` → own=8（去重）；
   - `always @(*)` 组合块 → own=0；
   - `reg mem[0:255]` 时钟驱动 → own=0、memoryBits=2048（若元素 [7:0]）；
   - 两层层次滚动 → subtree = 各层之和。
2. **黄金对比**：gps_baseband 跑 `hdl regcount`，与 yosys（`read_verilog; hierarchy; flatten; proc;` 数 `$dff`）对比。**验收 = 差异 ≤ ±2%**（partial-bit 高估在此容差内）。yosys 缺席则该项跳过并在日志标注。
3. **UI 冒烟**：打开 gps_baseband → 点「寄存器统计」开报告 tab，`total` ≈ 7762，按 subtree 排序顶行为顶层实例；点某行能高亮左侧树里对应实例；数字自洽（顶层 subtree = 各子实例 subtree 之和 + 顶层 own）。

### A5 实测（2026-07-09）

- **输入**：`hdl regcount` 用 `gps_baseband.fl`（12 个源文件的 filelist，`.fl` 内相对路径需在 `rtl_test/` 目录下执行）；yosys 用同一批 12 个 `.v` 文件显式 `read_verilog -sv`。
- **slang 总数**：`total = 7762`，`memoryBits` 汇总 = 0（所有实例均为 0，本设计无 slang 侧识别出的 memory）。
- **yosys dff cell 数**：553（`538 $dff + 15 $adff`，`stat -width` + `flatten` 后统计，无其它 flop 类型如 `$dffe`/`$sdff`/`$dlatch` 出现）。
- **yosys dff bit 数**：7762（`7674 dff bits + 88 adff bits`，用 `stat -width` 按 `$dff_N`/`$adff_N` 的 N 做位宽加权求和得到）。
- **差异**：slang 7762 vs 7762 基线 → **0.00%**；slang 7762 vs yosys bit 数 7762 → **0.00%**。
- **±2% 内？**：是（精确相等）。
- **备注**：yosys 在 `carrier_nco` 模块内额外推断出 12 个 `$mem`（768 memory bits，`$auto$mem.cc` 内部命名），经追查该模块源码中 `combined_carr_value` 是 `wire`（连续赋值拼接位宽，非 `reg`/非时钟驱动），并非真实寄存器——是 yosys elaboration 的内部表示产物，slang 和 yosys 的 flop 统计都正确地未把它计入，因此不影响上述 delta 结论；仅记录以备将来复核。
- **复现脚本**：`dft-core/test/diff/regcount_yosys.sh <hdl-bin> <regcount-input> <verilog-file>...`（yosys 命令固化为 `read_verilog -sv ...; hierarchy -auto-top; proc; opt_clean; flatten; opt_clean; stat -width`，用 python 解析 `$dff_N`/`$adff_N` 做位宽加权）。

## 8. Open Questions（默认已定，可回退）

- 超大设计（openc910）报告表行数极多 → 表格虚拟化/分页/截断（本期不做，先直出；必要时再加）。
- 是否再补一个「选中实例速览」（选中树节点时在 Ports tab 顶显示其寄存器数）——本期只做报告 tab。

## 9. 非目标

- 不做 scan chain 规划 / 覆盖率估算（后续 DFT 阶段）。
- 不识别 DFT 库单元（CGC/scan-FF）内部语义——黑盒 own=0。
- 不改 `get-sequential` / DRC 现有契约。
