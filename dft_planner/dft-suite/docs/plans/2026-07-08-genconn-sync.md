# genconn 引擎增量同步 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 newProject 领先、dft-core C++ 与 dft-suite TS 两侧都缺（或已漂移）的 4 个 genconn 引擎特性同步到两侧，并加一条差分守护测试防止再次漂移。

**Architecture:** genconn 生成逻辑存在三份实现：newProject `src/core/`（原型真源）、dft-core `genconn-core/`（C++，`genconn` CLI 出最终文件）、dft-suite `src/genconn/core/`（TS，跑交互编辑/校验/预览/同步注入）。三份必须语义一致。用「同一份 feature fixture doc 喂给三方、逐字节 diff」的差分测试兜底：先让测试 RED（暴露分歧），再逐特性改到 GREEN。

**Tech Stack:** C++20 + CMake/ctest（dft-core）；TypeScript + `node --test`（dft-suite/newProject）。差分 oracle = newProject `node`。

**仓库根路径：**
- `NP` = `/Users/jiangbowang/MOI/2025/dftartist/newProject`
- `CORE` = `/Users/jiangbowang/MOI/2025/dftartist/dft-core`
- `SUITE` = `/Users/jiangbowang/MOI/2025/dftartist/dft-suite`

---

## 背景：4 个确认的 delta（源自 `NP/src/core` vs 两侧的实测 diff）

| # | 特性 | newProject 侧逻辑（目标） | C++ 现状 | dft-suite TS 现状 |
|---|---|---|---|---|
| G1 | BISR `omitMemCtrl` | 为真时 `basesOf` 略过 `mem_chain_select`/`mem_disable`；`generate` 两端不一致报错；`compatible` 需同值 | ❌ 无（`basesOf` 无条件含两信号） | ❌ 无 |
| G2 | SSN `ifNamePlacement:"prefix"\|"postfix"` | 默认 prefix=接口名在前(`<if>_ssn_to_bus_clock`)；postfix=接口名在后(`ssn_to_bus_clock_<if>`) | ✅ 仅 prefix（无字段、无 postfix 分支） | ⚠️ 仅 postfix（与 C++ 相反，已漂移） |
| G3 | SSN 多接口去重键 `SSN:<interfaceName>` | `validateDef`/`clientKey` 用 `SSN:${interfaceName}` 区分多个 SSN client | ❌ 用裸 `SSN` | ❌ 用裸 `SSN` |
| G4-校验 | `placement:"pin"\|"other"` + `isDataSource` 校验规则 | `validateDef`：`placement==="other"` 仅 `isDataSource && role==="client"` 合法 | ❌ 无 | ❌ 无 |

> 本计划只做 G1–G4 的**引擎/校验**部分（生成 + 校验，两侧一致 + golden）。G4 的**纯 UI 部分**（Inspector `placement/dataSource` 开关、Canvas 盒内渲染、`setInterfacePlacement/setDataSource/setInterfaceInnerPos` 编辑函数与 `innerPos` 视图字段）拆到后续 `genconn-sync-ui` 计划，不在此。

---

## File Structure

**dft-core（C++ 引擎 + 测试）**
- Modify `CORE/genconn-core/model.h` — `BusInterface` 加 `omitMemCtrl` / `ifNamePlacement` 两字段。
- Modify `CORE/genconn-core/document.cpp` — `parseIface` 解析上述两字段。
- Modify `CORE/genconn-core/expand.cpp` — `basesOf` 支持 omitMemCtrl；SSN `toPrefix/fromPrefix` 支持 ifNamePlacement + `ifSuffix`。
- Modify `CORE/genconn-core/generate.cpp` — 连接两端 omitMemCtrl mismatch 检查。
- Modify `CORE/genconn-core/validate.cpp` — SSN client key 用 interfaceName；placement=other 校验。
- Create `CORE/test/fixtures/genconn_features.doc.json` — 覆盖 G1–G4 的 feature fixture doc。
- Create `CORE/test/diff/genconn_features_diff.sh` — 用同一 doc 跑 TS oracle vs C++，逐字节 diff。
- Modify `CORE/test/CMakeLists.txt` — 注册 `genconn_features_diff` 测试。

**newProject（只加 oracle 模式，不碰 golden）**
- Modify `NP/tools/genconn-oracle.ts` — 加 `generate-all-doc <doc.json>` 模式：读外部 doc、跑 TS `generateAll`。

**dft-suite（TS 引擎 + 防漂移测试）**
- Modify `SUITE/src/genconn/core/model.ts` — `BusInterface` 加 `omitMemCtrl` / `ifNamePlacement`。
- Modify `SUITE/src/genconn/core/expand.ts` — omitMemCtrl + ifNamePlacement（把当前 postfix 硬编码改成 prefix 默认 + postfix 选项）。
- Modify `SUITE/src/genconn/core/generate.ts` — omitMemCtrl mismatch 检查。
- Modify `SUITE/src/genconn/core/validate.ts` — SSN client key + placement=other 校验。
- Modify `SUITE/src/genconn/core/edit.ts` — `compatible` 含 omitMemCtrl；`clientKey` 用 interfaceName；`portInterface`/`newLikeInterface` 复制 omitMemCtrl。
- Create `SUITE/tests/integration/genconn-parity.test.ts` — feature doc 喂 dft-suite TS `generateAll` 与 `genconn` CLI，逐字节 diff（防 TS 漂移）。

---

## Task 1: 差分脚手架（先让测试 RED）

**Files:**
- Create: `CORE/test/fixtures/genconn_features.doc.json`
- Modify: `NP/tools/genconn-oracle.ts`
- Create: `CORE/test/diff/genconn_features_diff.sh`
- Modify: `CORE/test/CMakeLists.txt`

- [ ] **Step 1: 造 feature fixture doc**

写一个最小 doc，含：一个 hierarchical 顶层 def + 两个子 instance（一个 secondary、一个 client），接口覆盖 (a) 两个 BISR 接口，其一 `omitMemCtrl:true`；(b) 两个 SSN client 接口，不同 `interfaceName`（触发 G3），其中 secondary 侧接口用于验证 ifNamePlacement 默认 prefix。结构对齐 `NP/test/fixture.chip.ts` 的字段命名（先读它确认 def/interface/connection 的确切 JSON 形状再落笔）。写到 `CORE/test/fixtures/genconn_features.doc.json`。

先读 `NP/test/fixture.chip.ts` 与 `NP/src/core/model.ts` 确认字段，再据此构造。doc 顶层形如 `{ "schemaVersion":1, "library":{"defs":[...]}, "ui":{"openDefId":"...","rootDefId":"..."} }`。

- [ ] **Step 2: 给 oracle 加 `generate-all-doc` 模式**

在 `NP/tools/genconn-oracle.ts` 的 `mode` 分支里加（放在 `inject` 分支旁）：

```ts
} else if (mode === "generate-all-doc") {
  // generate-all-doc <doc.json> —— 读外部 doc，跑 TS generateAll（feature fixture 差分用）
  const d: GenConnDocument = JSON.parse(readFileSync(process.argv[3], "utf8"));
  for (const r of generateAll(d.library, d.ui.rootDefId)) {
    process.stdout.write(`===FILE:${r.file}===\n`);
    process.stdout.write(r.text);
  }
}
```

（`readFileSync`/`GenConnDocument`/`generateAll` 该文件已 import，无需新增 import。）

- [ ] **Step 3: 写差分脚本**

Create `CORE/test/diff/genconn_features_diff.sh`（照抄 `genconn_diff.sh` 的骨架）：

```bash
#!/usr/bin/env bash
# genconn-core feature-fixture 差分：C++ generate-all vs TS oracle（逐字节）。
set -euo pipefail
GENCONN=${GENCONN:-/Users/jiangbowang/MOI/2025/dftartist/dft-core/build/genconn}
ORACLE_DIR=${ORACLE_DIR:-/Users/jiangbowang/MOI/2025/dftartist/newProject}
NODE=${NODE:-node}
DOC=${DOC:-/Users/jiangbowang/MOI/2025/dftartist/dft-core/test/fixtures/genconn_features.doc.json}
ORACLE="$ORACLE_DIR/tools/genconn-oracle.ts"
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
"$NODE" "$ORACLE" generate-all-doc "$DOC" >"$tmp/ts.txt" 2>/dev/null
"$GENCONN" generate-all "$DOC"            >"$tmp/cxx.txt"
if diff -q "$tmp/ts.txt" "$tmp/cxx.txt" >/dev/null; then
  echo "MATCH — genconn features TS==C++ ($(wc -c <"$tmp/cxx.txt") bytes)"
else
  echo "MISMATCH:"; diff "$tmp/ts.txt" "$tmp/cxx.txt" | head -60; exit 1
fi
```

- [ ] **Step 4: 注册 ctest**

在 `CORE/test/CMakeLists.txt` 里 `genconn_diff` 测试旁加：

```cmake
  add_test(NAME genconn_features_diff
    COMMAND ${CMAKE_COMMAND} -E env GENCONN=$<TARGET_FILE:genconn> NODE=${HDL_NODE}
            bash ${CMAKE_SOURCE_DIR}/test/diff/genconn_features_diff.sh)
```

（放进 `if(HDL_NODE)` 块内，与现有 `genconn_diff` 同条件。）

- [ ] **Step 5: 跑 oracle 自身，确认 TS 侧能出结果（此时代表「目标」输出）**

Run: `cd $NP && node tools/genconn-oracle.ts generate-all-doc $CORE/test/fixtures/genconn_features.doc.json`
Expected: 打印 `===FILE:...===` + 顶层连接文本，含 `<if>_ssn_to_...`（prefix 风格）、BISR 接口里 `omitMemCtrl:true` 那个**不含** `mem_chain_select`/`mem_disable`。若报错，回到 Step 1 修 doc 字段。

- [ ] **Step 6: 构建并跑差分，确认 RED**

Run: `cd $CORE && cmake --build build -j genconn && ctest --test-dir build -R genconn_features_diff --output-on-failure`
Expected: **FAIL（MISMATCH）** —— C++ 尚未实现 omitMemCtrl/多 SSN key，输出与 TS 目标不符。这就是我们要消掉的红。

- [ ] **Step 7: Commit**

```bash
cd $CORE && git add test/fixtures/genconn_features.doc.json test/diff/genconn_features_diff.sh test/CMakeLists.txt && git commit -m "test(genconn): feature-fixture differential scaffold (RED)"
cd $NP && git add tools/genconn-oracle.ts && git commit -m "test(genconn): oracle generate-all-doc mode for feature fixture"
```

---

## Task 2: G1 — BISR `omitMemCtrl`

**Files:**
- Modify: `CORE/genconn-core/model.h`, `document.cpp`, `expand.cpp`, `generate.cpp`
- Modify: `SUITE/src/genconn/core/model.ts`, `expand.ts`, `generate.ts`, `edit.ts`

- [ ] **Step 1: C++ model + parse**

`model.h` 的 `BusInterface`（`bscanVariant` 后）加：
```cpp
    std::optional<bool> omitMemCtrl;
```
`document.cpp` `parseIface` 末尾（`portedFrom` 前）加：
```cpp
    bi.omitMemCtrl = optBool(v, "omitMemCtrl");
```

- [ ] **Step 2: C++ expand.basesOf 支持 omitMemCtrl**

`expand.cpp` 的 BISR 分支改为（对齐 `NP/src/core/expand.ts`）：
```cpp
    if (i.busType == "BISR") {
        std::vector<Base> b;
        if (!i.omitMemCtrl.value_or(false)) b.push_back(down("mem_chain_select"));
        b.push_back(down("shift_en"));
        b.push_back(down("clk"));
        if (!i.omitMemCtrl.value_or(false)) b.push_back(down("mem_disable"));
        b.push_back(down("reset"));
        b.push_back(down("si"));
        b.push_back(up("so"));
        return b;
    }
```

- [ ] **Step 3: C++ generate mismatch 检查**

读 `CORE/genconn-core/generate.cpp` 找到配对连接两端接口（对应 `NP/src/core/generate.ts` line 99 的 `S`/`C` 两端）的位置，加：
```cpp
        if (S.busType == "BISR" &&
            S.omitMemCtrl.value_or(false) != C.omitMemCtrl.value_or(false))
            throw std::runtime_error("omitMemCtrl mismatch on connection '" + conn.id + "'");
```
（变量名 `S`/`C`/`conn` 按 generate.cpp 实际命名对齐；先读该文件确认。）

- [ ] **Step 4: dft-suite TS 对应改动**

`SUITE/src/genconn/core/model.ts` `BusInterface` 加 `omitMemCtrl?: boolean;`。
`SUITE/src/genconn/core/expand.ts` BISR 的 `bases` 改成（对齐 NP）：
```ts
    bases: (i) => [
      ...(i.omitMemCtrl ? [] : [down("mem_chain_select")]),
      down("shift_en"), down("clk"),
      ...(i.omitMemCtrl ? [] : [down("mem_disable")]),
      down("reset"), down("si"), up("so"),
    ],
```
`SUITE/src/genconn/core/generate.ts` 加（对齐 NP line 99–100）:
```ts
    if (S.busType === "BISR" && !!S.omitMemCtrl !== !!C.omitMemCtrl)
      throw new Error(`omitMemCtrl mismatch on connection '${conn.id}'`);
```
`SUITE/src/genconn/core/edit.ts`：`compatible()` 加 `if (s.busType === "BISR" && !!s.omitMemCtrl !== !!c.omitMemCtrl) return false;`；`portInterface`/`newLikeInterface` 复制 `omitMemCtrl: src.omitMemCtrl`（对齐 NP edit.ts diff）。

- [ ] **Step 5: 跑两侧验证**

Run: `cd $CORE && cmake --build build -j genconn && ctest --test-dir build -R genconn_diff --output-on-failure`
Expected: 现有 `genconn_diff` 仍 MATCH（G1 对无 omitMemCtrl 的 chip 无影响）。
Run: `cd $SUITE && npm run typecheck`
Expected: PASS（TS 类型干净）。

- [ ] **Step 6: Commit**

```bash
cd $CORE && git add genconn-core/ && git commit -m "feat(genconn-core): BISR omitMemCtrl (skip mem_chain_select/mem_disable + mismatch check)"
cd $SUITE && git add src/genconn/core/ && git commit -m "feat(genconn): BISR omitMemCtrl parity with core"
```

---

## Task 3: G2 — SSN `ifNamePlacement`（⚠️ 先验证再改）

**Files:**
- Modify: `CORE/genconn-core/model.h`, `document.cpp`, `expand.cpp`
- Modify: `SUITE/src/genconn/core/model.ts`, `expand.ts`

- [ ] **Step 1: ⚠️ 先用 oracle 确认「默认行为」基线**

Run: `cd $NP && node tools/genconn-oracle.ts generate-all | grep -m3 ssn_to`
观察 newProject 当前默认输出：接口名在前（`<if>_ssn_to_bus_clock`）还是在后（`ssn_to_bus_clock_<if>`）。
再看 C++：`$CORE/build/genconn generate-all <(node ...emit-doc)` 的 ssn_to 行。
**判定**：预期 newProject 默认 = C++ = prefix（接口名在前）；dft-suite TS = postfix（在后，已漂移）。若与预期不符，**停下**在此记录实际三方行为，再决定 default 语义（不要盲改）。

- [ ] **Step 2: C++ 加 `ifNamePlacement` 字段 + postfix 分支**

`model.h` `BusInterface` 加：
```cpp
    std::optional<std::string> ifNamePlacement;  // "prefix"(默认) | "postfix"
```
`document.cpp` `parseIface` 加：`bi.ifNamePlacement = optStr(v, "ifNamePlacement");`
`expand.cpp` SSN 三处都要改（对齐 NP `src/core/expand.ts` 的 `DESC.SSN`，逐字核对后落笔）：

1. **clientPrefix SSN**（⚠️ **ungated**，无论 placement 都接口名在前，当前 C++ 硬编码 `"ssn_"` 是分歧）：
```cpp
// clientPrefix SSN 分支：
if (i.busType == "SSN")
    return i.interfaceName.has_value() ? (*i.interfaceName + "_ssn_") : "ssn_";
```
2. **toPrefix / fromPrefix SSN**（按 placement 分流；prefix=默认=当前 C++ 行为，只需补 postfix 分支）：
```cpp
bool ssnPostfix(const BusInterface& i) { return i.ifNamePlacement.value_or("prefix") == "postfix"; }
// toPrefix SSN：  if (i.busType=="SSN") return ssnPostfix(i) ? "ssn_to_"   : (ifName(i)+"_ssn_to_");
// fromPrefix SSN：if (i.busType=="SSN") return ssnPostfix(i) ? "ssn_from_" : (ifName(i)+"_ssn_from_");
```
3. **ifSuffix**（新增；只 SSN postfix 的 secondary 端追加 `_<if>`）：
```cpp
std::string ifSuffix(const BusInterface& i) {
    return (i.busType == "SSN" && ssnPostfix(i)) ? ("_" + ifName(i)) : "";
}
// secondarySignal: s.name = prefix + b.name + ifSuffix(i) + suffix(w);  // ⚠️ ifSuffix 在位宽括号之前，位宽仍在最末（对齐 NP expand.test.ts: ssn_to_bus_data_in_r1[3:0]）
```
> 说明：NP 里 `ifSuffix` 只在 `secondarySignal` 拼接，client 端不加 ifSuffix（client 用 clientPrefix 已带接口名）。feature fixture 的两个 SSN client(s0/s1) 正是靠 clientPrefix 的 `<if>_ssn_` 产出 `s0_ssn_bus_clock`/`s1_ssn_bus_clock`——不改 clientPrefix 则 `genconn_features_diff` 到 Task 4 也不会 green。

- [ ] **Step 3: dft-suite TS 对齐到「prefix 默认 + postfix 选项」**

`SUITE/src/genconn/core/model.ts` 加 `ifNamePlacement?: "prefix" | "postfix";`
`expand.ts` SSN 表项从当前硬编码 postfix 改为（对齐 NP）：
```ts
    clientPrefix: (i) => (i.interfaceName ? `${i.interfaceName}_ssn_` : "ssn_"),
    toPrefix: (i) => (i.ifNamePlacement === "postfix" ? "ssn_to_" : `${i.interfaceName}_ssn_to_`),
    fromPrefix: (i) => (i.ifNamePlacement === "postfix" ? "ssn_from_" : `${i.interfaceName}_ssn_from_`),
    ifSuffix: (i) => (i.ifNamePlacement === "postfix" ? `_${i.interfaceName}` : ""),
```
（先读 `SUITE/src/genconn/core/expand.ts` 确认 SSN 表项与 `ifSuffix` 应用位置，逐字段替换。）

- [ ] **Step 4: 跑差分 + 现有 dft-suite genconn 测试**

Run: `cd $CORE && cmake --build build -j genconn && ctest --test-dir build -R "genconn_diff$|genconn_features_diff" --output-on-failure`
Expected: 两个都 MATCH。
Run: `cd $SUITE && npm run typecheck && node --test tests/integration/genconn-generate.test.ts`
Expected: PASS。⚠️ 若 dft-suite 现有测试因 SSN 命名从 postfix 变 prefix 而 FAIL —— 说明该测试此前编码了「漂移后的错误行为」，据 C++/newProject 真源更新它，并在 commit message 注明这是纠正 TS 漂移。

- [ ] **Step 5: Commit**

```bash
cd $CORE && git add genconn-core/ && git commit -m "feat(genconn-core): SSN ifNamePlacement prefix|postfix option"
cd $SUITE && git add src/genconn/core/ tests/ && git commit -m "fix(genconn): align SSN naming to prefix-default + add postfix option (was drifted to postfix)"
```

---

## Task 4: G3 — SSN 多接口去重键

**Files:**
- Modify: `CORE/genconn-core/validate.cpp`
- Modify: `SUITE/src/genconn/core/validate.ts`, `edit.ts`

- [ ] **Step 1: C++ validate key**

`validate.cpp` 的 client key 改（对齐 NP validate.ts）：
```cpp
        std::string key = (i.busType == "BISR")
                              ? ("BISR:" + i.powerDomain.value_or("undefined"))
                              : (i.busType == "SSN")
                                    ? ("SSN:" + i.interfaceName.value_or(""))
                                    : i.busType;
```

- [ ] **Step 2: dft-suite TS 对应**

`validate.ts` 的 key 改成 `i.busType === "SSN" ? \`SSN:${i.interfaceName ?? ""}\` : ...`（对齐 NP diff）。
`edit.ts` 的 `clientKey` 同改：`i.busType === "SSN" ? \`SSN:${i.interfaceName ?? ""}\` : ...`。

- [ ] **Step 3: 验证**

Run: `cd $CORE && cmake --build build -j genconn && ctest --test-dir build -R "genconn_diff$|genconn_features_diff" --output-on-failure`
Expected: 两个 MATCH（feature fixture 的多 SSN 接口现在被正确区分，不再误报重复 client）。
Run: `cd $SUITE && npm run typecheck`
Expected: PASS。

- [ ] **Step 4: Commit**

```bash
cd $CORE && git add genconn-core/validate.cpp && git commit -m "feat(genconn-core): SSN client dedup key by interfaceName (multi-SSN)"
cd $SUITE && git add src/genconn/core/ && git commit -m "feat(genconn): SSN client key by interfaceName parity"
```

---

## Task 5: G4-校验 — `placement=other` 规则

**Files:**
- Modify: `CORE/genconn-core/model.h`, `document.cpp`, `validate.cpp`
- Modify: `SUITE/src/genconn/core/model.ts`, `validate.ts`

- [ ] **Step 1: 字段**

C++ `model.h` `BusInterface` 加：
```cpp
    std::optional<std::string> placement;  // "pin" | "other"
    std::optional<bool> isDataSource;
```
`document.cpp` `parseIface` 加：`bi.placement = optStr(v, "placement"); bi.isDataSource = optBool(v, "isDataSource");`
dft-suite `model.ts` `BusInterface` 加 `placement?: "pin" | "other";` 与 `isDataSource?: boolean;`。

- [ ] **Step 2: 校验规则（两侧）**

C++ `validate.cpp` `validateDef` 的接口循环里（对齐 NP validate.ts line 20–22）加：
```cpp
        if (i.placement.value_or("") == "other" &&
            !(i.isDataSource.value_or(false) && i.role == "client"))
            throw std::runtime_error("def '" + def.designName +
                "': placement=other only for data-source client (interface '" + i.id + "')");
```
dft-suite `validate.ts` 对应加（对齐 NP diff 的 TS 版）：
```ts
    if (i.placement === "other" && !(i.isDataSource && i.role === "client")) {
      throw new Error(`def '${def.designName}': placement=other 仅 data source 的 client 可用（interface '${i.id}'）`);
    }
```

- [ ] **Step 3: 验证**

Run: `cd $CORE && cmake --build build -j genconn && ctest --test-dir build -R "genconn_diff$|genconn_features_diff" --output-on-failure`
Expected: 两个 MATCH（feature fixture 不含非法 other → 不触发；placement 是纯校验/视图，不改生成文本）。
Run: `cd $SUITE && npm run typecheck`
Expected: PASS。

- [ ] **Step 4: Commit**

```bash
cd $CORE && git add genconn-core/ && git commit -m "feat(genconn-core): placement=other validation (data-source client only)"
cd $SUITE && git add src/genconn/core/ && git commit -m "feat(genconn): placement=other validation parity"
```

---

## Task 6: dft-suite 防漂移守护 + 全绿

**Files:**
- Create: `SUITE/tests/integration/genconn-parity.test.ts`
- Modify: `SUITE/tests/fixtures/` (放一份 feature doc 供 TS 侧读)

- [ ] **Step 1: 拷 feature fixture 到 dft-suite**

把 `CORE/test/fixtures/genconn_features.doc.json` 复制到 `SUITE/tests/fixtures/genconn_features.doc.json`（TS 侧读同一份数据）。

- [ ] **Step 2: 写 parity 测试**

参考 `SUITE/tests/integration/genconn-generate.test.ts` 与 `cli.test.ts` 的既有模式（如何 spawn `genconn` CLI + 如何 import TS `generateAll`）。Create `SUITE/tests/integration/genconn-parity.test.ts`：读 feature doc → ① dft-suite TS `generateAll(doc.library, doc.ui.rootDefId)` 拼成 `===FILE:===` 文本 → ② spawn `genconn generate-all <doc>` → `assert.strictEqual` 两者逐字节相等。断言失败即代表 TS 与 C++（真源）漂移。

先读那两个既有测试确认 CLI 定位方式（`bin.cjs resolveBin` / `DFT_CORE_BIN_DIR` / `../dft-core/build`）与 import 路径，照抄。

- [ ] **Step 3: 跑守护测试，确认 GREEN**

Run: `cd $SUITE && node --test tests/integration/genconn-parity.test.ts`
Expected: PASS（经 Task 2–5 后 TS 已与 C++ 一致）。若 FAIL，diff 输出会指出哪个特性两侧仍不一致，回到对应 Task 修。

- [ ] **Step 4: 两仓全量测试**

Run: `cd $CORE && ctest --test-dir build --output-on-failure`
Expected: 全绿（含 `genconn_diff` / `genconn_features_diff` / 其余既有）。
Run: `cd $SUITE && npm test`
Expected: 全绿（typecheck + unit + integration）。

- [ ] **Step 5: Commit**

```bash
cd $SUITE && git add tests/ && git commit -m "test(genconn): TS<->core parity guard on feature fixture (prevents TS drift)"
```

---

## Self-Review 备注

- **Spec 覆盖**：G1(Task2) / G2(Task3) / G3(Task4) / G4-校验(Task5) / 防漂移守护(Task1+Task6) 均有任务。G4-UI 明确划出（后续 `genconn-sync-ui` 计划）。
- **G2 风险**：Task3 Step1 强制先验证三方基线再改，Step4 显式处理「dft-suite 旧测试编码了漂移行为」的情况——符合 spec「不确定就停下确认」。
- **类型一致**：C++ 字段 `omitMemCtrl`/`ifNamePlacement`/`placement`/`isDataSource` 与 TS 同名；oracle 模式名 `generate-all-doc` 在 Task1 定义、Task1/Task6 引用一致。
- **前置**：需能构建 dft-core（`cmake -S . -B build && cmake --build build`）且 `node` 可用（差分 oracle 依赖）。
