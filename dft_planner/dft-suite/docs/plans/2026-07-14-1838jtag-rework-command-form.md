# 1838jtag 返工（命令式 stap_host_list + catalog 纠正 + PTAP/STAP 标签）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** 按设计 §11 更正把已实现的 1838jtag 从「嵌套块 + 三 IP」改成正确模型：specgen 只留 StapPipeline 一个 IP；spec 输出改成命令式 `set spec [create_dft_specification -stap_host_list { pipe()/sec_host()/host … }]`；client/secondary 数据源显示 PTAP/STAP。

**Architecture:** genconn 信号展开（§6.2）不动。改动 = catalog 收窄 + 标签 helper + dft-suite 命令式输出落盘 + dft-core `genJtag1838Spec` 改命令式并把 `genDftSpec` 重构成「read_config_data 壳只包 SSN/EDT/BScan，jtag1838 命令块独立追加」。C++ 侧读 secondary 的 `placement`：pin→`sec_host`、other→`host`；StapPipeline dftIp→`pipe(<实例名>)`。

**Tech Stack:** dft-suite（TS/React，`node --test`）+ dft-core（C++17/CMake/ctest）。

**基线：** dft-suite `feat/1838jtag`（Phase A 之上）、dft-core `feat/1838jtag`（Phase B 之上）。真源：设计 §11。

**范围与已知后续：** 本计划做 catalog 纠正 / PTAP-STAP 标签 / 命令式输出（dft-suite+dft-core）。**不含**：secondary 的 `placement="other"` 在 UI 里可设（需放开 `validate.ts:20`/`edit.ts:508`/`Inspector.tsx:242` 的 client-only 门槛）——列为**后续 RW-followup**；C++ 已按 placement 读 pin/other，doc 里手填 other 即出 `host`，故命令式生成本身不被 UI 门槛卡住。

---

## Task 1: dft-suite catalog 收窄到只留 StapPipeline

**Files:** `src/genconn/core/dft-model.ts`、`src/specgen/catalog.ts`、`src/specgen/ipvisual.ts`、`tests/unit/specgen-catalog.test.ts`

- [ ] **Step 1: 改测试（先让它红）**——把 `tests/unit/specgen-catalog.test.ts` 里 JTAG1838 那个用例整体替换为只断言 StapPipeline：

```ts
test("JTAG1838：catalogBus + 只有 StapPipeline 一个可放置 IP", () => {
  assert.equal(catalogBus("STapPipeline"), "JTAG1838");
  const sp = catalogEntry("STapPipeline");
  assert.equal(sp.abbr, "SPP");
  assert.equal(sp.bus, "JTAG1838");
  assert.deepEqual(sp.ports.map((p) => p.name), ["scan_in", "scan_out", "tck"]);
  assert.equal(DFT_CATALOG.filter((e) => e.bus === "JTAG1838").length, 1);
});
```
（首行 import 加 `DFT_CATALOG`：`import { catalogEntry, catalogBus, dftIpSize, DFT_CATALOG } from "../../src/specgen/catalog.ts";`）

- [ ] **Step 2: 跑测试确认 FAIL**

Run: `node --test tests/unit/specgen-catalog.test.ts`
Expected: FAIL（当前有 3 个 JTAG1838 IP，`length === 1` 断言失败；且旧用例引用的 `catalogEntry("STap")` 已删）。

- [ ] **Step 3: `dft-model.ts` DftIpType 删两项**——把
```ts
  | "STap" | "STapPipeline" | "SecondaryHostScanInterface";
```
改成
```ts
  | "STapPipeline";
```

- [ ] **Step 4: `catalog.ts` 删 STap + SecondaryHostScanInterface 两个条目**（保留 `STapPipeline` 条目、`bus` 联合、`catalogBus`/`portBus` 不变）。删掉 `DFT_CATALOG` 里这两块：
```ts
  { ipType: "STap", ... },
  { ipType: "SecondaryHostScanInterface", ... },
```

- [ ] **Step 5: `ipvisual.ts` 删两色**——`IP_COLORS` 里删 `STap` 与 `SecondaryHostScanInterface` 两行（`Record<DftIpType>` 是穷尽的，删了 DftIpType 就必须删对应色，否则 typecheck 报多余键；保留 `STapPipeline`）。

- [ ] **Step 6: 跑测试 + typecheck 确认 PASS**

Run: `node --test tests/unit/specgen-catalog.test.ts && npm run typecheck`
Expected: PASS + typecheck 绿。

- [ ] **Step 7: 全量回归**

Run: `node --test 'tests/unit/*.test.ts'`
Expected: 全绿（注意 specgen-schema-jtag1838 单测仍引用 STap schema——它测的是 schema JSON 不是 catalog，schema 文件本 task 不动，故不受影响；若它因 componentSchema 找 STap 而 STap 仍在 schema JSON 里则仍过）。

- [ ] **Step 8: Commit**

```bash
git add src/genconn/core/dft-model.ts src/specgen/catalog.ts src/specgen/ipvisual.ts tests/unit/specgen-catalog.test.ts
git commit -m "fix(specgen): 1838jtag catalog 收窄到只留 StapPipeline（STap/SecondaryHostScanInterface 属 genconn 边界接口）"
```

---

## Task 2: PTAP/STAP 数据源标签（dft-suite）

**Files:** `src/genconn/layout.ts`（加 helper）、`src/specgen/Workspace.tsx`、`src/genconn/CanvasView.tsx`、`src/genconn/Inspector.tsx`

> 纯视图标签，不影响生成。JTAG1838：client→`PTAP`、secondary→`STAP`。

- [ ] **Step 1: `src/genconn/layout.ts` 加导出 helper**（`barLabel` 附近）：

```ts
import type { BusInterface, Role } from "./core/model.ts";
// ... 已有 import 里确保 Role 可用；若已 import BusInterface，补 Role。

/** 数据源/接口显示名：JTAG1838 按 role 显示 PTAP(client)/STAP(secondary)；其余回退 busType。纯视图。 */
export function busTypeLabel(busType: BusInterface["busType"], role: Role): string {
  if (busType === "JTAG1838") return role === "client" ? "PTAP" : "STAP";
  return busType;
}
```
（若 `Role` 未从 model.ts 导出，改用 `BusInterface["role"]` 作参数类型：`role: BusInterface["role"]`。）

- [ ] **Step 2: SpecGen 画布 caption 用它**——`src/specgen/Workspace.tsx` 的 bars 渲染处（当前 `text={bar.busType}` 那行，约 501 行）：

先在顶部 import 补 `busTypeLabel`：`import { defOutline, selfBars, barAnchor, BUS_COLOR, hexTint, busTypeLabel, ... } from "../genconn/layout.ts";`
再把
```tsx
                        <Text ... text={bar.busType} fontStyle="bold" ... />
```
改成
```tsx
                        <Text ... text={busTypeLabel(bar.busType, bar.role)} fontStyle="bold" ... />
```

- [ ] **Step 3: genconn 盒内节点标签用它**——`src/genconn/CanvasView.tsx:402`：
把
```tsx
            <Text x={-16} y={-6} width={32} align="center" text={"◆" + OTHER_LABEL[i.busType]} .../>
```
改成
```tsx
            <Text x={-16} y={-6} width={32} align="center" text={"◆" + (i.busType === "JTAG1838" ? busTypeLabel(i.busType, i.role) : OTHER_LABEL[i.busType])} .../>
```
（顶部 import 补 `busTypeLabel`。）

- [ ] **Step 4: Inspector 下拉预览用它**——`src/genconn/Inspector.tsx:249`，把内联的 `({ SSN:"pad", ... })[iface.busType]` 预览文本，对 JTAG1838 显示 `busTypeLabel`：
```tsx
              <option value="other">other（盒内：{iface.busType === "JTAG1838" ? busTypeLabel(iface.busType, iface.role) : ({ SSN: "pad", BSCAN: "tap", BISR: "bisrController", IJTAG: "tap", JTAG1838: "tap" } as const)[iface.busType]}）</option>
```
（顶部 import 补 `busTypeLabel`。）

- [ ] **Step 5: typecheck + 全量单测**

Run: `npm run typecheck && node --test 'tests/unit/*.test.ts'`
Expected: 全绿。

- [ ] **Step 6: Commit**

```bash
git add src/genconn/layout.ts src/specgen/Workspace.tsx src/genconn/CanvasView.tsx src/genconn/Inspector.tsx
git commit -m "feat(specgen): 1838jtag 数据源标签 PTAP(client)/STAP(secondary)"
```

---

## Task 3: dft-suite 把 jtag1838 命令文本直接落 Spec/1838jtag/（绕过 splitSpecSections）

**Files:** `src/store/outputLayout.ts`、`src/specgen/Workspace.tsx`、`tests/unit/output-layout.test.ts`

> jtag1838 域输出是命令式 tcl（无 `read_config_data` 壳），`splitSpecSections` 提不出块，故整段直接落文件、不加 wrapper。

- [ ] **Step 1: 改测试（先红）**——`tests/unit/output-layout.test.ts`，把 `specFilesBySection` 那个用例改为：`Jtag1838` 不再来自 `secs`，改由新参数 `rawJtag1838` 传入且**不被 read_config_data 包裹**：

```ts
test("specFilesBySection：SSN/EDT/BScan 走块；1838jtag 命令文本原样落盘（不加 wrapper）", () => {
  const r = specFilesBySection("top", { SSN: "SSN {}", EDT: "EDT {}", EmbeddedBoundaryScan: "EmbeddedBoundaryScan {}" }, "set spec [create_dft_specification -stap_host_list {\n  pipe(a)\n}]\n");
  assert.deepEqual(r.map((f) => f.relPath), [
    "Spec/ssn/top.dftspec", "Spec/edt/top.dftspec", "Spec/bscan/top.dftspec", "Spec/1838jtag/top.dftspec",
  ]);
  const j = r.find((f) => f.relPath === "Spec/1838jtag/top.dftspec")!;
  assert.ok(j.text.startsWith("set spec [create_dft_specification"), "命令文本原样，不含 read_config_data");
});
```

- [ ] **Step 2: 跑测试确认 FAIL**

Run: `node --test tests/unit/output-layout.test.ts`
Expected: FAIL（`specFilesBySection` 目前签名两参、`secs.Jtag1838` 走 wrap，新签名/断言不满足）。

- [ ] **Step 3: `src/store/outputLayout.ts` 改 `specFilesBySection`**——加第三参 `rawJtag1838`，jtag1838 直接落不 wrap；删掉原来走 `secs.Jtag1838` 的那行：

```ts
export function specFilesBySection(design: string, secs: Record<string, string>, rawJtag1838?: string): OutFile[] {
  const wrap = (s: string) => `read_config_data -in_wrapper $dftspec -rep -from_string {\n${s}\n}\n`;
  const put = (sec: string | undefined, rel: string): OutFile[] => (sec && sec.trim()) ? [{ relPath: rel, text: wrap(sec) }] : [];
  return [
    ...put(secs.SSN, `Spec/ssn/${design}.dftspec`),
    ...put(secs.EDT, `Spec/edt/${design}.dftspec`),
    ...put(secs.EmbeddedBoundaryScan, `Spec/bscan/${design}.dftspec`),
    ...(rawJtag1838 && rawJtag1838.trim() ? [{ relPath: `Spec/1838jtag/${design}.dftspec`, text: rawJtag1838 }] : []),
  ];
}
```

- [ ] **Step 4: `src/specgen/Workspace.tsx` 三处对齐**

(a) `specSections()`（约 269 行）**去掉** JTAG1838 的 `splitSpecSections` 合并（命令式提不出块、且避免让括号扫描器跑命令文本）：
```ts
  const specSections = (): Record<string, string> => ({ ...splitSpecSections(specByDomain.SSN), ...splitSpecSections(specByDomain.BSCAN) });
```

(b) 保存按钮（约 666 行）传 `specByDomain.JTAG1838` 作第三参：
```tsx
                    <button onClick={() => { const d = scope?.designName ?? "dft"; for (const f of specFilesBySection(d, specSections(), specByDomain.JTAG1838)) downloadText(`${d}.${f.relPath.split("/")[1]}.dftspec`, f.text); }}>保存</button>
```

(c) 写入工程按钮（约 667 行）同样传第三参：
```tsx
                    {projOpen && <button onClick={() => void writeToProject(specFilesBySection(scope?.designName ?? "dft", specSections(), specByDomain.JTAG1838))}>写入工程</button>}
```

- [ ] **Step 5: 跑测试 + typecheck 确认 PASS**

Run: `node --test tests/unit/output-layout.test.ts && npm run typecheck`
Expected: PASS + typecheck 绿。

- [ ] **Step 6: 全量单测**

Run: `node --test 'tests/unit/*.test.ts'`
Expected: 全绿。

- [ ] **Step 7: Commit**

```bash
git add src/store/outputLayout.ts src/specgen/Workspace.tsx tests/unit/output-layout.test.ts
git commit -m "fix(specgen): 1838jtag 命令文本直接落 Spec/1838jtag/（绕过 read_config_data 块提取）"
```

---

## Task 4: dft-core `genJtag1838Spec` 改命令式 + `genDftSpec` 重构 + catalog/schema 收尾

**Files（dft-core 仓）:** `specgen-core/jtag1838.h`、`specgen-core/jtag1838.cpp`、`specgen-core/dftspec.cpp`、`specgen-core/catalog.cpp`、`test/unit/test_specgen_jtag1838.cpp`；撤 schema：`specgen-core/schema.h`、`specgen-core/schema.cpp`、`CMakeLists.txt`、`specgen-core/schema_embedded.h.in`、`specgen-core/jtag1838.schema.json`

- [ ] **Step 1: 改 golden 单测（先红）**——`test/unit/test_specgen_jtag1838.cpp`：
  - 删掉引用 `jtag1838ComponentSchema` 的 schema 断言（那部分随 schema 一起撤）。
  - 把端到端 `want` 改成命令式（同一 fixture：client cl → StapPipeline sp1 → secondary r1(默认 pin) → cl）：

```cpp
    std::string want =
        "set spec [create_dft_specification -stap_host_list {\n"
        "  pipe(sp1)\n"
        "  sec_host(r1)\n"
        "}]\n";
```
  顶部 include 去掉 `#include "schema.h"`（若仅为 schema 断言而 include），保留 `dftspec.h`/`document.h`。`main()` 里 schema 断言删除后，只剩 fixture→genDftSpec→比对。

- [ ] **Step 2: 构建确认 FAIL**

```bash
cd /Users/jiangbowang/MOI/2025/dftartist/dft-core
cmake --build build -j
ctest --test-dir build -R specgen_jtag1838_unit --output-on-failure
```
Expected: FAIL（现产出的是嵌套 `Jtag1838 { … }` 块，非命令式）。

- [ ] **Step 3: `specgen-core/jtag1838.h` 简化**——`StapNode` 改成只存 token 串（或保留 type/name，本步用 token 串最简）：

```cpp
#pragma once
// STAP(IEEE 1838) datapath 生成：命令式 stap_host_list。单链，无分支。
#include <string>
#include <vector>

#include "model.h"

namespace specgen {

// scope -> "set spec [create_dft_specification -stap_host_list { ... }]\n"；无 JTAG1838 client 链 -> 空串。
std::string genJtag1838Spec(const SpecgenScope& scope);

}  // namespace specgen
```

- [ ] **Step 4: `specgen-core/jtag1838.cpp` 改命令式**——链遍历同 bscan，收集 token：StapPipeline→`pipe(<实例名>)`；secondary→`placement=="other"?"host":"sec_host(<接口名>)"`：

```cpp
#include "jtag1838.h"

#include <stdexcept>
#include <unordered_set>

#include "datapath.h"
#include "gen.h"

namespace specgen {

namespace {
std::optional<std::string> ipOwnerOf(const Graph& g, const std::string& k) {
    auto it = g.ipOf.find(k);
    if (it == g.ipOf.end()) return std::nullopt;
    return it->second;
}
}  // namespace

std::string genJtag1838Spec(const SpecgenScope& scope) {
    const genconn::BusInterface* client = nullptr;
    for (const auto& i : scope.interfaces)
        if (i.busType == "JTAG1838" && i.role == "client") { client = &i; break; }
    if (!client) return "";

    Graph g = buildGraph(scope);
    DftEndpoint startEp; startEp.kind = "iface"; startEp.instanceId = scope.id;
    startEp.interfaceId = client->id; startEp.pin = "out";
    DftEndpoint endEp = startEp; endEp.pin = "in";
    std::string startKey = keyOf(startEp), endKey = keyOf(endEp);

    std::vector<std::string> tokens;
    std::unordered_set<std::string> seenIp, seenSec, guard{startKey};

    auto oneSucc = [&](const std::string& k) -> std::string {
        auto it = g.adj.find(k);
        const std::vector<std::string>& succ = it == g.adj.end() ? std::vector<std::string>{} : it->second;
        if (succ.empty()) throw std::runtime_error("STAP 链断裂：走不到 client 的 in 脚");
        if (succ.size() > 1) throw std::runtime_error("STAP 链出现分支（当前不支持）");
        return succ[0];
    };

    std::string cur = startKey;
    while (cur != endKey) {
        auto ipId = ipOwnerOf(g, cur);
        if (ipId && !seenIp.count(*ipId)) {
            seenIp.insert(*ipId);
            const DftIpInstance* ip = g.ipById.at(*ipId);
            if (ip->ipType == "STapPipeline") tokens.push_back("pipe(" + ip->instanceName + ")");
        }
        std::string next;
        auto fit = g.ifaceIdOf.find(cur);
        std::string pin = cur.substr(cur.rfind(':') + 1);
        if (fit != g.ifaceIdOf.end() && pin == "in") {
            const std::string& ifId = fit->second;
            const genconn::BusInterface* itf = nullptr;
            for (const auto& f : scope.interfaces) if (f.id == ifId) { itf = &f; break; }
            if (!itf || itf->role != "secondary") throw std::runtime_error("STAP 链到达非 secondary 的 in 脚");
            if (!seenSec.count(ifId)) {
                seenSec.insert(ifId);
                if (itf->placement.value_or("pin") == "other") tokens.push_back("host");
                else tokens.push_back("sec_host(" + itf->interfaceName.value_or(ifId) + ")");
            }
            DftEndpoint outEp; outEp.kind = "iface"; outEp.instanceId = scope.id;
            outEp.interfaceId = ifId; outEp.pin = "out";
            next = keyOf(outEp);
        } else {
            next = oneSucc(cur);
        }
        if (guard.count(next)) throw std::runtime_error("STAP 链有环");
        guard.insert(next);
        cur = next;
    }
    if (tokens.empty()) return "";

    std::string inner;
    for (const auto& t : tokens) inner += ind(1) + t + "\n";
    return "set spec [create_dft_specification -stap_host_list {\n" + inner + "}]\n";
}

}  // namespace specgen
```
（`ind` 来自 `gen.h`。确认 C++ `genconn::BusInterface` 有 `placement`（model.h 有 `std::optional<std::string> placement;`）。）

- [ ] **Step 5: `specgen-core/dftspec.cpp` 重构——read_config_data 壳只包 SSN/EDT/BScan，jtag1838 命令块独立追加**

`genJtag1838Spec` 调用点（B2 加的 `std::string jtag1838Block = genJtag1838Spec(scope);` 保留）。把 `genDftSpec` 里「`out = "read_config_data … {\n"` … `out += bscanBlock; out += "}\n";`」这段结构改成：只有 SSN/EDT/BScan 有内容时才输出 read_config_data 壳，jtag1838Block 在壳之后独立追加。具体：
  - 保留空判断 `if (dps.empty() && bscanBlock.empty() && jtag1838Block.empty())` 抛错。
  - 把 `std::string out = "read_config_data -in_wrapper $dftspec -rep -from_string {\n";` 改为条件化：
```cpp
    std::string out;
    bool hasBlockForm = !dps.empty() || !bscanBlock.empty();
    if (hasBlockForm) out += "read_config_data -in_wrapper $dftspec -rep -from_string {\n";
```
  - SSN/EDT 段的产出保持不变（仍在 `if (!dps.empty())` 内）。
  - 把结尾 `out += bscanBlock; out += "}\n";` 改为：
```cpp
    out += bscanBlock;
    if (hasBlockForm) out += "}\n";
    out += jtag1838Block;
    return out;
```
  这样 jtag1838-only scope（dps 空、bscan 空）→ `out` 只含 `jtag1838Block`（命令式），无 read_config_data 壳。

- [ ] **Step 6: `specgen-core/catalog.cpp` 删 STap 条目**（保留 StapPipeline）——删掉 B2 加的：
```cpp
        {"STap",
         {{"scan_in", "in", "data"}, {"scan_out", "out", "data"}, {"tck", "in", "clock"}}},
```

- [ ] **Step 7: 撤 schema 内嵌（命令式不需要组件 config schema）**
  - `CMakeLists.txt`：删 `file(READ … jtag1838.schema.json SPECGEN_JTAG1838_SCHEMA_CONTENT)` 行。
  - `specgen-core/schema_embedded.h.in`：删 `JTAG1838_SCHEMA_JSON` 行。
  - `specgen-core/schema.h`：删 `jtag1838ComponentSchema` 声明。
  - `specgen-core/schema.cpp`：删 `jtag1838Components()` + `jtag1838ComponentSchema()`。
  - 删文件 `specgen-core/jtag1838.schema.json`（`git rm`）。

- [ ] **Step 8: 构建确认 PASS**

```bash
cmake --build build -j
ctest --test-dir build -R specgen_jtag1838_unit --output-on-failure
```
Expected: PASS（命令式 golden 逐字节）。若 got/want 差，多半是 token 顺序或缩进，改实现不改 golden（除非能证明 golden 错）。

- [ ] **Step 9: 全量回归**

```bash
ctest --test-dir build
```
Expected: 全绿——`specgen_diff`/`specgen_bscan_diff`/`specgen_edt_diff` 等仍对 TS oracle 逐字节一致（`genDftSpec` 重构后：无 jtag1838 client 的 scope，`hasBlockForm` 恒真、`jtag1838Block` 恒空，输出与原来逐字节相同）。

- [ ] **Step 10: Commit**

```bash
git add specgen-core/jtag1838.h specgen-core/jtag1838.cpp specgen-core/dftspec.cpp specgen-core/catalog.cpp \
  specgen-core/schema.h specgen-core/schema.cpp CMakeLists.txt specgen-core/schema_embedded.h.in \
  test/unit/test_specgen_jtag1838.cpp
git rm specgen-core/jtag1838.schema.json
git commit -m "fix(specgen-core): genJtag1838Spec 改命令式 stap_host_list + genDftSpec 重构 + 撤 schema/STap catalog"
```

---

## Self-Review

**1. Spec coverage（对照 §11）：**
- catalog 只留 StapPipeline → Task 1。✓
- PTAP/STAP 标签（client/secondary，按 role，纯视图）→ Task 2。✓
- 命令式 `set spec [create_dft_specification -stap_host_list {pipe()/sec_host()/host}]`、一行一个、无 requirements/DRC 前缀 → Task 4（生成）+ Task 3（落盘）。✓
- pipe(name)=StapPipeline 实例名、sec_host=secondary(pin)、host=secondary(other)→ Task 4 映射。✓
- §6.2 genconn 信号展开不动 → 不在本计划。✓

**2. Placeholder scan：** 无 TBD；每步完整代码 + 命令。✓

**3. Type consistency：**
- `busTypeLabel(busType, role)`（Task 2 Step 1）在 CanvasView/Inspector/Workspace 一致调用。✓
- `specFilesBySection(design, secs, rawJtag1838?)` 新签名（Task 3 Step 3）与两个调用点（Step 4b/4c）+ 测试（Step 1）一致。✓
- C++ `genJtag1838Spec(scope)` 返回命令串（Task 4 Step 3/4），`genDftSpec` 追加（Step 5）；`StapNode` 结构删除、改 token 串——jtag1838.cpp 不再用 `jtag1838ComponentSchema`（Step 7 撤之一致）。✓
- golden（Task 4 Step 1）token 顺序 pipe(sp1)/sec_host(r1) = 从 cl 沿链遍历序，与实现一致。✓

**后续（RW-followup，另起）：** 放开 secondary 的 `placement="other"` UI 门槛（`validate.ts:20`/`edit.ts:508`/`Inspector.tsx:242` 的 client-only 判断）+ layout 让 secondary(other) 渲染成盒内可移动 STap，才能在 UI 里造出 `host`。C++ 已按 placement 读，doc 手填即生效。
