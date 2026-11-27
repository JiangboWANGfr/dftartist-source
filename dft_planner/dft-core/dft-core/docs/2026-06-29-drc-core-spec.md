# drc-core 设计规格(方向④:clock/reset DFT-DRC)

> `drc-core`(`libdrc`):跑在 hdl-core 设计模型上的 **结构型 clock/reset DFT-DRC** 引擎。
> 早期 RTL 预检 / lint —— 抓"时钟/复位不可控"这类最贵、最早、最常见的 DFT 坑。
>
> 日期:2026-06-29 ｜ 状态:Draft(spec,未实现)｜ 依据:`veirlogPaser/DFT-DRC-详解.md`、
> `DFT-DRC-仅时钟与复位检查-可行吗.md` ｜ 架构:`2026-06-28-dft-core-architecture.md`

---

## 0. 范围与非目标

**做(v1):** 纯结构可判定的 clock + reset 可控性检查 —— 每个触发器的时钟/异步复位**能否从顶层主输入(PI)控制**,以及是否被内部逻辑生成/门控。不需要测试协议(STIL)、扫描链、ATPG。正是 slang elaborate 结构的强项。

**不做(专用工具 + 测试协议那一档):** 扫描链 trace、ATPG、fault simulation、at-speed(launch-on-capture)、总线冲突、覆盖率。

**定位(诚实):** 早期 RTL lint,**「必要非充分」** —— "结构上能从 PI 控到" ≠ "测试时真被控到"(取决于后续插入的测试逻辑)。不替代签核级 scan-DRC。

---

## 1. 规则集(v1)

源自 DFT-DRC 详解的 C1–C6 / R1–R5,取**纯结构可判定**子集:

| 规则 | 名称 | 定义 / 检测 | 严重度 |
|---|---|---|---|
| **CLK-UNCTRL** (C1) | 时钟不可控 | FF 时钟脚反向 trace 追不到顶层输入端口(PI) | error |
| **CLK-GEN** (C2/C4) | 内部生成/派生时钟 | 时钟由内部 always/assign 或某 FF 的 Q(分频)产生,无测试旁路 | error |
| **CLK-GATED** (C3) | 门控时钟 | 时钟经组合逻辑门控(`gclk = clk & en`),enable 非 PI 可控 | warn |
| **CLK-AS-DATA** (C5) | 时钟当数据 | 同一信号既进时钟脚又进数据/异步脚 | warn |
| **RST-UNCTRL** (R1) | 异步复位不可控 | FF 异步 set/reset 反向 trace 追不到 PI | error |
| **RST-GEN** (R3/R4) | 内部生成的异步复位 | 异步复位由内部逻辑/另一个 FF 产生 | error |

**前置(R5)** 同步 vs 异步区分:**同步复位本质是数据,不告警**;只有**异步** set/reset(在敏感列表里出现的边沿信号)才进 reset 检查。这是分类前提,不是单独规则。

**v2+(需更多语义,后续):** C6 移位时多时钟独立可控、R2 移位时复位强制关断 —— 需"测试模式"概念,留后。

---

## 2. 算法:时钟/复位 → PI 的反向可达

```
1. 枚举时序元件:遍历设计,找所有 always_ff / 边沿触发 always 块(ProceduralBlock)。
2. 抽取敏感事件:每个块的 SignalEventControl 列表 →
     · 时钟 = posedge/negedge 的主时钟表达式(约定:第一个边沿,或非复位的那个)
     · 异步复位 = 敏感列表里除时钟外的其它边沿信号(EdgeKind != None)
     · 同步复位(if(rst) 在时钟块体内,不在敏感列表)→ 归为数据,跳过
3. 对每个 clock net 和每个 async-reset net,反向 trace:
     net → 它的驱动(driver)→ 上游 net/端口 → 穿过层次边界(实例端口↔父 net)→ ... 直到:
       · 到达顶层输入端口(PI)            → 可控(若中途只过 buffer/inv = OK)
       · 中途经组合逻辑(assign/gate)     → CLK-GATED / CLK-GEN(看是门控还是生成)
       · 到达某 FF 的 Q                    → CLK-GEN(派生/分频时钟)/ RST-GEN
       · 追到头仍非 PI(悬空/常量/内部)   → CLK-UNCTRL / RST-UNCTRL
4. CLK-AS-DATA:对每个 clock net,检查它是否还出现在某 FF 的数据输入 / 组合数据路径。
```

跨层次反向追是关键:一个子块实例的时钟端口连到父层的某个 net(L3 netlist 给出端口↔net),父层的 net 又被父层逻辑驱动(L4 drivers),如此向上直到顶层 PI。

---

## 3. 依赖 hdl-core 提供什么

drc-core **链接 hdl-core(libhdlcore)**,通过它拿设计模型(不直接碰 slang —— 保持"只有 frontend 碰 slang"的铁律)。

**hdl-core 已提供(够用的部分):**
- 层次:`expand-children` / instance tree(找所有实例、穿层次)。
- L3 连接:`get-netlist`(一层的 nets + 端口↔net 绑定)→ 反向追的"边"。
- L4 行为:`trace-drivers`(某 net 的驱动:input port / assign / always,带 file:line)→ 反向追的"驱动来源"。
- `trace-fanin/fanout`(实例端口拓扑)、`get-ports`(方向)。

**hdl-core 需新增(为 DRC):**
1. **枚举时序元件 + clock/reset 事件**:新 service/RPC,如 `get-sequential`(或 `get-clocks`)——
   遍历 ProceduralBlock(AlwaysFF/edge-Always),返回 `[{ownerInstanceId, file, line, clockNet, clockEdge, asyncResets:[{net,edge}]}]`。
   实现:slang `ProceduralBlockSymbol.procedureKind` + body 的 `TimingControl`(`SignalEventControl.expr` + `EdgeKind`),
   信号符号经 `LSPUtilities`/`NamedValueExpression.symbol` 取 net(已有 §9.3 行为层基础)。
2. **(可选)位级/常量识别**:driver 是否常量、是否纯 buffer/inv,辅助"只过 buffer = 可控"判定。
   v1 可简化:driver kind=assign 且 RHS 是单一信号(buffer)→ 透传继续追;否则按 GEN/GATED。

> 即:DRC 的"原料"(net、driver、edge)都由 hdl-core 提供;drc-core 只做"反向可达 + 规则判定 + 报告"。

---

## 4. 输出(violation report)

```ts
interface Violation {
  rule: "CLK-UNCTRL" | "CLK-GEN" | "CLK-GATED" | "CLK-AS-DATA" | "RST-UNCTRL" | "RST-GEN";
  severity: "error" | "warn";
  signal: string;            // 出问题的 clock/reset net(hierPath/netName)
  instanceId: string;        // 所属时序元件的 owner 实例
  file: string; line: number;
  path: string[];            // 反向 trace 路径(net → driver → ... ),便于定位
  message: string;
}
interface DrcReport { violations: Violation[]; checked: { flops: number; clocks: number; resets: number }; }
```

CLI:`drc check <filelist> [选项]` → JSON 报告(+ 可读摘要到 stderr)。

---

## 5. 测试策略(无现成 oracle → 手写 golden + yosys 标尺)

DRC 是**新能力**,没有 Python/TS oracle 可差分。两条:

1. **手写小 RTL,每条规则配 pass/fail 用例 + golden 期望报告**:
   - CLK-UNCTRL:时钟接内部 net(不连 PI);对照:时钟直连顶层端口(应 clean)。
   - CLK-GEN:`reg clk_div; always @(posedge clk) clk_div<=~clk_div;` 用 clk_div 当时钟。
   - CLK-GATED:`assign gclk = clk & en;`。
   - CLK-AS-DATA:`always @(posedge clk) ...; assign y = clk;`。
   - RST-UNCTRL / RST-GEN:异步复位接内部逻辑 / 另一个 FF。
   - 同步复位用例 → 不应告警(R5)。
2. **yosys 当标尺(可选,交叉验证)**:`read_verilog; hierarchy; flatten; proc;` 看 `$dff` 的 `CLK`/`ARST` 引脚来源是否为顶层端口 —— 与 drc-core 的可控性结论对比(像前期 `reg_count.py` 用 yosys 验 7762 FF 那样)。

---

## 6. 阶段

| 阶段 | 内容 |
|---|---|
| ④.1 | hdl-core 加 `get-sequential`(枚举时序元件 + clock/reset 事件 + 边沿),Python oracle 差分 |
| ④.2 | drc-core 反向可达框架 + CLK-UNCTRL / RST-UNCTRL(+ 同步/异步区分) |
| ④.3 | CLK-GEN / RST-GEN / CLK-GATED / CLK-AS-DATA |
| ④.4 | DrcReport + `drc` CLI + 手写 golden 套件 + yosys 交叉验证 |

---

## 7. 边界(诚实声明)

- 只判"结构上能否从 PI 控到",不判"测试模式下实际是否被控"(后者取决于插入的测试逻辑 / test mode 信号)。
- 不处理 DFT 库单元(BUFGCE、CGC、scan-FF)的语义 —— 黑盒按端口拓扑处理,必要时需用户标注。
- 是早期 lint,**必要非充分**;不替代签核级 scan-DRC + ATPG。
