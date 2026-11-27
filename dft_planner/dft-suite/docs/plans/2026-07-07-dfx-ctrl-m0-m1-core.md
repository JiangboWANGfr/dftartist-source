# DFX Ctrl — M0 hdl-core tie 补丁 + M1 ctrlgen-core 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** hdl-core 能区分常量 tie 与悬空并支持深层直查(M0);新库 ctrlgen-core + `ctrlgen` CLI 从 CtrlIpSpec JSON 生成 `.v/.icl/.tcl` 三件套,EMA 样例逐字节 golden(M1)。

**Architecture:** 全部改动在 **dft-core 仓**(`/Users/jiangbowang/MOI/2025/dftartist/dft-core`)。M0 = SlangHelpers 加常量求值 helper + Netlist/NdjsonServer 加 `tie` 字段 + DesignDb 惰性祖先展开与 constant driver + Python oracle 同步。M1 = 照 genconn-core 模式新建 ctrlgen-core 静态库(纯文本模板,不依赖 slang)+ `app/ctrlgen_main.cpp` CLI + golden 测试。

**Tech Stack:** C++20、slang v10(vendored,`Expression::eval(EvalContext&)`)、自研 header-only JSON(`hdl-core/json/JsonValue.h`)、ctest(无测试框架,`assert`+shell)、Python3(shell 测试内嵌断言)。

**Spec:** `/Users/jiangbowang/MOI/2025/dftartist/dft-suite/docs/specs/2026-07-07-dfx-ctrl-ip-design.md`(v5 定稿,§1 语义 / §3 M0 / §4 M1)。

**前置事实(已核实,直接引用):**
- NDJSON 协议:请求 `{"id":N,"method":"...","params":{...}}` 一行一个;响应 `{"id":N,"result":{...}}`;`hdl serve <filelist>` 起 daemon,stdout 第一行是 ready 事件。
- filelist 相对路径按 `.f` 所在目录解析(`Filelist.cpp:75`)。
- ctest 注册模式与 shell 测试样板见 `test/CMakeLists.txt`、`test/diff/sequential.sh`。
- slang `Expression::constant` 是 private;公开 API 是 `getConstant()` 与 `eval(EvalContext&)`;`EvalContext` 可从 `const Symbol&` 构造(`third_party/slang/include/slang/ast/EvalContext.h:53-58`)。

**分支:** 在 dft-core 仓开 `feat/ctrlgen`(Task 1 Step 0)。

---

## M0:hdl-core tie 补丁

### Task 1: tie 场景 fixture + 失败的 ground-truth 测试

**Files:**
- Create: `/Users/jiangbowang/MOI/2025/dftartist/dft-core/test/rtl/tie/tie.v`
- Create: `/Users/jiangbowang/MOI/2025/dftartist/dft-core/test/rtl/tie/tie.f`
- Create: `/Users/jiangbowang/MOI/2025/dftartist/dft-core/test/diff/tie.sh`
- Modify: `/Users/jiangbowang/MOI/2025/dftartist/dft-core/test/CMakeLists.txt`

- [ ] **Step 0: 开分支**

```bash
cd /Users/jiangbowang/MOI/2025/dftartist/dft-core && git checkout -b feat/ctrlgen
```

- [ ] **Step 1: 写 RTL fixture(覆盖 tie0/tie1/多位常量/悬空/真实网,三层层次考验惰性展开)**

`test/rtl/tie/tie.v`:

```verilog
module kid(input a, input b, input [3:0] c, input d, input e, output y);
  assign y = e & a;
endmodule

module mid(input clk, output z);
  wire w;
  assign w = clk;
  kid u_kid(.a(1'b0), .b(1'b1), .c(4'b0101), .d(), .e(w), .y(z));
endmodule

module top(input clk, output z);
  mid u_mid(.clk(clk), .z(z));
endmodule
```

`test/rtl/tie/tie.f`(相对路径按 .f 目录解析):

```
tie.v
```

- [ ] **Step 2: 写失败的 shell 测试**

`test/diff/tie.sh`(样板:`test/diff/sequential.sh` 的 shell+内嵌 Python 断言模式;NDJSON 驱动照 `test/diff/daemon_diff.py` 的 Daemon 类):

```bash
#!/usr/bin/env bash
# M0 tie-patch ground truth: constant tie vs unconnected vs real net on the
# handcrafted tie.v design, plus lazy ancestor registration for deep queries.
set -euo pipefail
HDL=${HDL:-/Users/jiangbowang/MOI/2025/dftartist/dft-core/build/hdl}
DIR=${1:-/Users/jiangbowang/MOI/2025/dftartist/dft-core/test/rtl/tie}
PY=${PY:-python3}

"$PY" - "$HDL" "$DIR/tie.f" <<'PYEOF'
import json, subprocess, sys
hdl, fl = sys.argv[1], sys.argv[2]
p = subprocess.Popen([hdl, "serve", fl], stdin=subprocess.PIPE,
                     stdout=subprocess.PIPE, text=True, bufsize=1)
ready = json.loads(p.stdout.readline())

def req(obj):
    p.stdin.write(json.dumps(obj) + "\n"); p.stdin.flush()
    return json.loads(p.stdout.readline())

# 1) deep get-netlist WITHOUT expand-children first -> lazy ancestor registration
nl = req({"id": 1, "method": "get-netlist",
          "params": {"ownerInstanceId": "top.u_mid"}})["result"]
conn = {c["port"]: c for c in nl["connections"] if c["instanceId"] == "top.u_mid.u_kid"}
assert conn, f"lazy get-netlist returned no u_kid connections: {nl}"
assert conn["a"]["net"] == "" and conn["a"]["tie"] == "1'b0", conn["a"]
assert conn["b"]["net"] == "" and conn["b"]["tie"] == "1'b1", conn["b"]
assert conn["c"]["net"] == "" and conn["c"]["tie"] == "4'b101", conn["c"]
assert conn["d"]["net"] == "" and conn["d"]["tie"] == "", conn["d"]      # dangling
assert conn["e"]["net"] == "w" and conn["e"]["tie"] == "", conn["e"]     # real net

# 2) trace-drivers (also without prior expand): tie -> kind "constant"
td = req({"id": 2, "method": "trace-drivers",
          "params": {"nodeId": "top.u_mid.u_kid", "port": "a"}})["result"]
assert [s["kind"] for s in td["sources"]] == ["constant"], td
assert td["sources"][0]["label"] == "1'b0", td
td = req({"id": 3, "method": "trace-drivers",
          "params": {"nodeId": "top.u_mid.u_kid", "port": "d"}})["result"]
assert td["sources"] == [], td                                            # dangling stays empty
td = req({"id": 4, "method": "trace-drivers",
          "params": {"nodeId": "top.u_mid.u_kid", "port": "e"}})["result"]
assert any(s["kind"] == "logic" for s in td["sources"]), td               # assign w = clk

p.stdin.close(); p.wait()
print("tie OK")
PYEOF
```

```bash
chmod +x /Users/jiangbowang/MOI/2025/dftartist/dft-core/test/diff/tie.sh
```

- [ ] **Step 3: 注册 ctest**

在 `test/CMakeLists.txt` 的 sequential 测试块(约 :60-63)之后追加:

```cmake
add_test(NAME tie
  COMMAND ${CMAKE_COMMAND} -E env HDL=$<TARGET_FILE:hdl>
          bash ${CMAKE_SOURCE_DIR}/test/diff/tie.sh
          ${CMAKE_SOURCE_DIR}/test/rtl/tie)
```

- [ ] **Step 4: 构建并确认测试失败**

```bash
cd /Users/jiangbowang/MOI/2025/dftartist/dft-core
cmake --build build -j && ctest --test-dir build -R '^tie$' --output-on-failure
```

Expected: FAIL —— `KeyError: 'tie'` 或 `assert conn` 失败(深层未注册返回空 connections)。

- [ ] **Step 5: Commit**

```bash
git add test/rtl/tie test/diff/tie.sh test/CMakeLists.txt
git commit -m "test(hdl-core): tie ground-truth scene — constant tie vs dangling vs real net, deep lazy query (red)"
```

### Task 2: `connTie` 常量求值 helper

**Files:**
- Modify: `/Users/jiangbowang/MOI/2025/dftartist/dft-core/hdl-core/service/SlangHelpers.h:51-53`(在 connNet 声明后追加)
- Modify: `/Users/jiangbowang/MOI/2025/dftartist/dft-core/hdl-core/service/SlangHelpers.cpp:145-151`(在 connNet 实现后追加)

- [ ] **Step 1: 声明(SlangHelpers.h,connNet 声明之后)**

```cpp
// Constant tie on an input port connection: "1'b0" / "1'b1" / "4'b101" (SVInt binary
// literal, no leading zeros). nullopt = not a constant (real net, dangling, output,
// composite, or contains x/z).
std::optional<std::string> connTie(const slang::ast::PortConnection* pc);
```

文件顶部补 `#include <optional>`(如尚无)。

- [ ] **Step 2: 实现(SlangHelpers.cpp,connNet 之后、namespace 结尾之前)**

```cpp
std::optional<std::string> connTie(const PortConnection* pc) {
    const Expression* e = pc->getExpression();
    if (!e) return std::nullopt;                             // dangling .d()
    if (e->kind == ExpressionKind::Assignment) return std::nullopt;  // output port
    if (e->getSymbolReference()) return std::nullopt;        // real net -> not a tie
    EvalContext ctx(pc->port);
    ConstantValue cv = e->eval(ctx);
    if (!cv || !cv.isInteger()) return std::nullopt;
    const auto& iv = cv.integer();
    if (iv.hasUnknown()) return std::nullopt;                // x/z -> treat as non-tie
    return iv.toString(slang::LiteralBase::Binary, /*includeBase*/ true);
}
```

includes 区(SlangHelpers.cpp:1-15)追加:

```cpp
#include "slang/ast/EvalContext.h"
#include "slang/numeric/ConstantValue.h"
```

- [ ] **Step 3: 构建**

```bash
cmake --build build -j 2>&1 | tail -5
```

Expected: 无错误。若 `EvalContext ctx(pc->port)` 报没有匹配构造函数,改用 `EvalContext ctx(ASTContext(*pc->port.getParentScope(), LookupLocation::after(pc->port)))`(EvalContext.h:53-58 两种构造都有,前者是后者的便捷形式)。

- [ ] **Step 4: Commit**

```bash
git add hdl-core/service/SlangHelpers.h hdl-core/service/SlangHelpers.cpp
git commit -m "feat(hdl-core): connTie — constant-eval a port connection into a binary tie literal"
```

### Task 3: get-netlist 加 `tie` 字段

**Files:**
- Modify: `/Users/jiangbowang/MOI/2025/dftartist/dft-core/hdl-core/service/Netlist.h:21-26`
- Modify: `/Users/jiangbowang/MOI/2025/dftartist/dft-core/hdl-core/service/Netlist.cpp:83-101`
- Modify: `/Users/jiangbowang/MOI/2025/dftartist/dft-core/hdl-core/protocol/NdjsonServer.cpp:181-195`

- [ ] **Step 1: NetConnection 加字段(Netlist.h)**

```cpp
struct NetConnection {
    std::string instanceId;  // == ownerInstanceId -> a boundary port; else a child instance
    std::string port;
    std::string direction;  // in | out | inout
    std::string net;        // resolved net/var name ("" if composite/unconnected)
    std::string tie;        // constant tie literal ("1'b0"/"4'b101"); "" if net or dangling
};
```

- [ ] **Step 2: 填充(Netlist.cpp 子实例循环,`c.net = net ? ... : "";` 之后)**

```cpp
            c.net = net ? std::string(net->name) : "";
            if (!net)
                if (auto t = connTie(pc)) c.tie = *t;
```

(connNet 已在此文件使用,connTie 同头文件,无需新 include。)

- [ ] **Step 3: 序列化(NdjsonServer.cpp get-netlist 分支,`w.key("net"); w.value(c.net);` 之后)**

```cpp
            w.key("tie");
            w.value(c.tie);
```

- [ ] **Step 4: 构建 + 跑 tie 测试**

```bash
cmake --build build -j && ctest --test-dir build -R '^tie$' --output-on-failure
```

Expected: 仍 FAIL,但错误推进到断言 1(`assert conn` — 深层查询返回空,惰性展开还没加)。若你想先验证 tie 字段本身,可把 tie.sh 的请求 1 临时改为先 `expand-children` top 再查 —— 不必,Task 4 一起过。

- [ ] **Step 5: Commit**

```bash
git add hdl-core/service/Netlist.h hdl-core/service/Netlist.cpp hdl-core/protocol/NdjsonServer.cpp
git commit -m "feat(hdl-core): get-netlist connections carry tie literal (distinguish tie vs dangling)"
```

### Task 4: traceDrivers 常量源 + 两查询的惰性祖先展开

**Files:**
- Modify: `/Users/jiangbowang/MOI/2025/dftartist/dft-core/hdl-core/service/DesignDb.h:58-69`(kind 注释)
- Modify: `/Users/jiangbowang/MOI/2025/dftartist/dft-core/hdl-core/service/DesignDb.cpp:365-435`

- [ ] **Step 1: DesignDb.h 注释更新**

```cpp
struct DriverSourceInfo {
    std::string kind;  // "port" | "logic" | "constant"
```

- [ ] **Step 2: 惰性祖先展开(照 traceNetToSource 先例 DesignDb.cpp:638-644)**

在匿名 namespace 或 DesignDb 私有处不动,直接在两个函数开头插入同一段。`getNetlist` 开头(`auto it = p_->inst.find(ownerInstanceId);` 之前):

```cpp
    // register ancestor prefixes lazily (same as traceNetToSource) so deep
    // direct queries work without prior expand-children
    {
        size_t pos = 0;
        while ((pos = ownerInstanceId.find('.', pos)) != std::string::npos) {
            try {
                expandChildren(ownerInstanceId.substr(0, pos));
            } catch (...) {
            }
            ++pos;
        }
        try {
            expandChildren(ownerInstanceId);
        } catch (...) {
        }
    }
```

(注意最后多一次对自身的 expandChildren:get-netlist 需要 owner 的**孩子**也注册。)

`traceDrivers` 开头(`auto it = p_->inst.find(nodeId);` 之前)插入同样的循环,把 `ownerInstanceId` 换成 `nodeId`,但**不要**对自身 expandChildren(nodeId 是叶子级实例,注册到父层即可;循环本身已覆盖所有前缀)。

- [ ] **Step 3: traceDrivers 常量源(替换 `if (!net) return r;` 一行)**

```cpp
    const Symbol* net = netOf(self, port);
    if (!net) {
        // constant tie -> report it; dangling stays empty (M0 tie patch)
        for (auto* pc : self.getPortConnections()) {
            if (pc->port.kind == SK::Port && pc->port.name == port) {
                if (auto tie = hdl::service::connTie(pc)) {
                    DriverSourceInfo s;
                    s.kind = "constant";
                    s.id = "const:" + nodeId + "." + port;
                    s.label = *tie;
                    s.detail = *tie;
                    r.sources.push_back(std::move(s));
                }
                break;
            }
        }
        return r;
    }
```

- [ ] **Step 4: 构建 + tie 测试通过**

```bash
cmake --build build -j && ctest --test-dir build -R '^tie$' --output-on-failure
```

Expected: `tie OK`,PASS。

- [ ] **Step 5: Commit**

```bash
git add hdl-core/service/DesignDb.h hdl-core/service/DesignDb.cpp
git commit -m "feat(hdl-core): trace-drivers constant sources + lazy ancestor expansion for deep get-netlist/trace-drivers"
```

### Task 5: Python oracle 同步(daemon_diff 回绿)

**Files:**
- Modify: `/Users/jiangbowang/MOI/2025/dftartist/Hierarchyshower/tools/hierarchy_daemon.py`(注意:在 **Hierarchyshower 仓**)

- [ ] **Step 1: 先看差分现在挂不挂**

```bash
ctest --test-dir build -R 'daemon_diff' --output-on-failure 2>&1 | tail -15
```

Expected: FAIL —— C++ 侧 connections 多了 `tie` 键,逐字段比对不等。(若环境缺 pyslang 被 skip,后续步骤照做,以 tie.sh + 人工核对为准。)

- [ ] **Step 2: oracle 加 `_conn_tie`(紧挨 `_conn_net`,hierarchy_daemon.py:228 附近)**

```python
    @staticmethod
    def _conn_tie(pc):
        """Constant tie literal for an input port connection ("1'b0"/"4'b101"), "" otherwise.
        Mirrors C++ hdl::service::connTie (SlangHelpers.cpp)."""
        e = pc.expression
        if e is None:
            return ""
        try:
            if e.kind.name == "Assignment":
                return ""
            if e.getSymbolReference() is not None:
                return ""
            cv = e.constant  # literals/folded constants; None if not constant
            if cv is None:
                return ""
            v = cv.value
            if not isinstance(v, int):
                return ""      # x/z or non-integer -> treat as non-tie (C++ 同语义)
            w = e.type.bitWidth
            return f"{w}'b{v:b}"
        except Exception:
            return ""
```

- [ ] **Step 3: get_netlist 的 child 连接 dict(约 :368-377)加 tie 键**

在组装 connection dict 处(有 `"net": ...` 的地方)加一行:

```python
                "tie": "" if net is not None else self._conn_tie(pc),
```

(变量名以该函数实际局部名为准 —— 与 `"net"` 键取值同一个 `pc`/`net`。)

- [ ] **Step 4: trace_drivers(:324)加 constant 分支**

在「解析不到 net → 返回空」的路径改为:

```python
        if net is None:
            tie = self._conn_tie(pc) if pc is not None else ""
            sources = []
            if tie:
                sources = [{"kind": "constant", "id": f"const:{nodeId}.{port}",
                            "label": tie, "detail": tie, "file": "", "line": 0, "bus": False}]
            return {"sources": sources, "netName": "", "bus": False}
```

(C++ 侧 DriverSourceInfo 默认 file=""、line=0、bus=false,序列化恒输出全部键 —— 两侧字段必须逐一相同。`pc` 为该函数内找端口连接的局部变量;若现实现是先 `netOf` 式取 net、没保留 pc,把查找循环改成同时返回 (net, pc)。)

- [ ] **Step 5: 差分回绿 + 全量 ctest**

```bash
ctest --test-dir build -R 'daemon_diff' --output-on-failure
ctest --test-dir build --output-on-failure 2>&1 | tail -5
```

Expected: 全部 PASS。

- [ ] **Step 6: 两仓分别 commit**

```bash
cd /Users/jiangbowang/MOI/2025/dftartist/Hierarchyshower
git add tools/hierarchy_daemon.py
git commit -m "feat(oracle): mirror hdl-core tie patch — connection tie field + constant driver source"
cd /Users/jiangbowang/MOI/2025/dftartist/dft-core
```

---

## M1:ctrlgen-core 库 + CLI + golden

### Task 6: EMA golden fixture + spec JSON fixture

**Files:**
- Create: `/Users/jiangbowang/MOI/2025/dftartist/dft-core/test/fixtures/ctrlgen/`(golden 三件套 + 两个 spec json)

- [ ] **Step 1: 拷贝 EMA golden(源目录名含空格,注意引号)**

```bash
cd /Users/jiangbowang/MOI/2025/dftartist/dft-core
mkdir -p test/fixtures/ctrlgen
SRC="/Users/jiangbowang/MOI/2025/dftartist/dft_ctrl/untitled folder"
cp "$SRC/dfx_mem_ema_ctrl.v" "$SRC/dfx_mem_ema_ctrl.icl" "$SRC/dfx_mem_ema_ctrl.tcl" test/fixtures/ctrlgen/
```

- [ ] **Step 2: 记录三个文件的确切字节结尾(生成器必须复刻)**

```bash
for f in test/fixtures/ctrlgen/dfx_mem_ema_ctrl.{v,icl,tcl}; do echo "== $f"; tail -c 24 "$f" | xxd; done
```

把输出粘贴到 commit message 里。预期 `.tcl` 结尾是 `\n\n\n`(尾部 2 空行);`.v`/`.icl` 以实际输出为准 —— 若 `.v` 结尾是 `endmodule\n` 则生成器 Task 8 的结尾照写,若多一个 `\n` 则生成器补一个(下同 `.icl`)。**这是格式定版步骤,后续任务以此为准。**

- [ ] **Step 3: 生成 ema.spec.json(targets 从 golden tcl 机器提取,保证零抄写错误)**

```bash
python3 - <<'PYEOF'
import json, re
tcl = open("test/fixtures/ctrlgen/dfx_mem_ema_ctrl.tcl").read()
targets = {}
en_target = None
for m in re.finditer(r"^delete_connection (\S+)$", tcl, re.M):
    t = m.group(1)
    b = re.search(r"_ema_tdr_ovrd_(\d+)_0/buf_din$", t)
    if b:
        targets[int(b.group(1))] = t
    else:
        en_target = t
assert len(targets) == 192 and en_target, (len(targets), en_target)
spec = {
    "schemaVersion": 2,
    "moduleBase": "dfx_mem_ema_ctrl",
    "pins": [
        {"portName": "ema_tdr_ovrd_en", "mode": "control", "width": 1,
         "stitch": "replace", "target": en_target},
        {"portName": "ema_tdr_ovrd", "mode": "control", "width": 192,
         "stitch": "replace", "targets": [targets[i] for i in range(192)]},
    ],
}
json.dump(spec, open("test/fixtures/ctrlgen/ema.spec.json", "w"), indent=2, ensure_ascii=False)
print("ema.spec.json:", len(spec["pins"][1]["targets"]), "targets")
PYEOF
```

Expected: `ema.spec.json: 192 targets`。注意 `dsIndex` 缺省 —— EMA 模块名无 `_ds` 后缀(spec §4.1)。

- [ ] **Step 4: 写 chip_top 新语义 spec fixture(手写,来源 spec §4.3/样例 tcl)**

`test/fixtures/ctrlgen/pll.spec.json`:

```json
{
  "schemaVersion": 2,
  "moduleBase": "pll_ctrl",
  "dsIndex": 1,
  "pins": [
    { "portName": "enable", "mode": "control", "width": 1, "stitch": "mux",
      "target": "PLL_1/enable",
      "muxName": "u_dfx_PLL_1_enable_persistent_mux_inst_ds1" },
    { "portName": "LOCKED", "mode": "observe", "width": 1, "target": "PLL_1/LOCKED" }
  ]
}
```

`test/fixtures/ctrlgen/fuse.spec.json`(引脚拼写以 `fbi_instance_ctrl.tcl` 为准:`read_buffer`/`donFB`,忽略样例 module_info/.v 的笔误):

```json
{
  "schemaVersion": 2,
  "moduleBase": "fbi_instance_ctrl",
  "pins": [
    { "portName": "read_buffer", "mode": "control", "width": 1, "stitch": "replace",
      "target": "u_dfx_fbi_instance_read_buffer_persistent_buf/A" },
    { "portName": "donFB", "mode": "observe", "width": 1,
      "target": "u_dfx_fbi_instance_donFB_persistent_buf/Y" }
  ]
}
```

- [ ] **Step 5: Commit**

```bash
git add test/fixtures/ctrlgen
git commit -m "test(ctrlgen): EMA byte-golden trio + machine-extracted ema.spec.json + pll/fuse spec fixtures"
```

### Task 7: ctrlgen-core 骨架 —— model.h + parseSpec(TDD)

**Files:**
- Create: `/Users/jiangbowang/MOI/2025/dftartist/dft-core/ctrlgen-core/model.h`
- Create: `/Users/jiangbowang/MOI/2025/dftartist/dft-core/ctrlgen-core/spec.h`
- Create: `/Users/jiangbowang/MOI/2025/dftartist/dft-core/ctrlgen-core/spec.cpp`
- Create: `/Users/jiangbowang/MOI/2025/dftartist/dft-core/test/unit/test_ctrlgen_spec.cpp`
- Modify: `/Users/jiangbowang/MOI/2025/dftartist/dft-core/CMakeLists.txt`(genconncore 块之后)
- Modify: `/Users/jiangbowang/MOI/2025/dftartist/dft-core/test/CMakeLists.txt`

- [ ] **Step 1: model.h(风格对齐 genconn-core/model.h:纯数据 struct、string 枚举带注释)**

```cpp
#pragma once
// DFX ctrl IP model (spec: dft-suite docs/specs/2026-07-07-dfx-ctrl-ip-design.md §4.1).
// Pure data; parseSpec (spec.h) normalizes stitch/muxName to per-bit vectors.
#include <optional>
#include <string>
#include <vector>

namespace ctrlgen {

struct GateCell {
    std::string name = "cell_and2";
    std::string out = "Z";
    std::string a = "A1";
    std::string b = "A2";
};

struct PinSpec {
    std::string portName;
    std::string mode;                   // "control" | "observe"
    int width = 1;
    std::optional<std::string> target;  // scalar / homogeneous bus (-> target[i])
    std::vector<std::string> targets;   // per-bit heterogeneous; size == width
    // control only; normalized to size == width by parseSpec. "mux"|"replace"|"connect"
    std::vector<std::string> stitch;
    std::vector<std::string> muxName;   // size == width; "" on non-mux bits
};

struct CtrlIpSpec {
    int schemaVersion = 2;
    std::string moduleBase;
    std::optional<int> dsIndex;         // nullopt -> module name = moduleBase (EMA form)
    std::string dfxModeSource = "u_dfx_static_hyper_ctl_tdr/dfx_mode";
    GateCell gateCell;
    std::vector<PinSpec> pins;
};

inline std::string moduleName(const CtrlIpSpec& s) {
    return s.dsIndex ? s.moduleBase + "_ds" + std::to_string(*s.dsIndex) : s.moduleBase;
}

}  // namespace ctrlgen
```

- [ ] **Step 2: spec.h**

```cpp
#pragma once
#include <string>

#include "model.h"

namespace ctrlgen {

// Parse + validate + normalize (stitch/muxName -> per-bit). Throws std::runtime_error
// with a one-line reason on any spec violation (docs/specs §4.4).
CtrlIpSpec parseSpec(const std::string& jsonText);

}  // namespace ctrlgen
```

- [ ] **Step 3: 写失败的单测(样板:test/unit/test_filelist.cpp —— 无框架,assert + printf OK)**

`test/unit/test_ctrlgen_spec.cpp`:

```cpp
#include "spec.h"

#include <cassert>
#include <cstdio>
#include <stdexcept>
#include <string>

using namespace ctrlgen;

static bool throws(const std::string& json) {
    try {
        parseSpec(json);
        return false;
    } catch (const std::runtime_error&) {
        return true;
    }
}

int main() {
    // scalar mux control + observe; dsIndex present
    auto s = parseSpec(R"({
      "schemaVersion": 2, "moduleBase": "pll_ctrl", "dsIndex": 1,
      "pins": [
        {"portName":"enable","mode":"control","width":1,"stitch":"mux",
         "target":"PLL_1/enable","muxName":"u_dfx_PLL_1_enable_persistent_mux_inst_ds1"},
        {"portName":"LOCKED","mode":"observe","width":1,"target":"PLL_1/LOCKED"}
      ]})");
    assert(moduleName(s) == "pll_ctrl_ds1");
    assert(s.pins.size() == 2);
    assert(s.pins[0].stitch.size() == 1 && s.pins[0].stitch[0] == "mux");
    assert(s.pins[0].muxName[0] == "u_dfx_PLL_1_enable_persistent_mux_inst_ds1");
    assert(s.gateCell.name == "cell_and2");  // default
    assert(s.dfxModeSource == "u_dfx_static_hyper_ctl_tdr/dfx_mode");

    // no dsIndex -> bare module name (EMA form); uniform bus stitch normalized per-bit
    auto e = parseSpec(R"({
      "schemaVersion": 2, "moduleBase": "m",
      "pins": [{"portName":"b","mode":"control","width":3,"stitch":"replace",
                "targets":["x/A","y/A","z/A"]}]})");
    assert(moduleName(e) == "m");
    assert(e.pins[0].stitch.size() == 3 && e.pins[0].stitch[2] == "replace");
    assert(e.pins[0].muxName.size() == 3 && e.pins[0].muxName[0] == "");

    // per-bit stitch array + per-bit muxName
    auto p = parseSpec(R"({
      "schemaVersion": 2, "moduleBase": "m",
      "pins": [{"portName":"c","mode":"control","width":2,"target":"U/c",
                "stitch":["replace","mux"],"muxName":[null,"u_dfx_U_c_persistent_mux_inst_ds1"]}]})");
    assert(p.pins[0].stitch[0] == "replace" && p.pins[0].stitch[1] == "mux");
    assert(p.pins[0].muxName[0] == "" && p.pins[0].muxName[1] != "");

    // violations (docs/specs §4.4)
    assert(throws(R"({"schemaVersion":2,"moduleBase":"9bad","pins":[]})"));            // bad identifier
    assert(throws(R"({"schemaVersion":2,"moduleBase":"m","pins":[
      {"portName":"a","mode":"control","width":1,"target":"t"}]})"));                  // control missing stitch
    assert(throws(R"({"schemaVersion":2,"moduleBase":"m","pins":[
      {"portName":"a","mode":"observe","width":1,"target":"t","stitch":"mux"}]})"));   // observe with stitch
    assert(throws(R"({"schemaVersion":2,"moduleBase":"m","pins":[
      {"portName":"a","mode":"control","width":2,"stitch":"replace","targets":["t"]}]})")); // targets len != width
    assert(throws(R"({"schemaVersion":2,"moduleBase":"m","pins":[
      {"portName":"a","mode":"control","width":1,"stitch":"replace","target":"t","targets":["t"]}]})")); // both
    assert(throws(R"({"schemaVersion":2,"moduleBase":"m","pins":[
      {"portName":"a","mode":"control","width":1,"stitch":"mux","target":"t"}]})"));   // mux missing muxName
    assert(throws(R"({"schemaVersion":2,"moduleBase":"m","pins":[
      {"portName":"a","mode":"control","width":1,"stitch":"replace","target":"t"},
      {"portName":"a","mode":"observe","width":1,"target":"t2"}]})"));                 // dup portName

    std::printf("test_ctrlgen_spec OK\n");
    return 0;
}
```

- [ ] **Step 4: CMake 接线(顶层 CMakeLists.txt,genconncore 块后;test/CMakeLists.txt 单测块)**

顶层(占位 3 个生成器 cpp 先建空实现,Task 8-10 填):

```cmake
# --- ctrlgen-core library: DFX ctrl IP generation (no slang) ---
add_library(ctrlgencore STATIC
  ctrlgen-core/spec.cpp
  ctrlgen-core/gen_v.cpp
  ctrlgen-core/gen_icl.cpp
  ctrlgen-core/gen_tcl.cpp)
target_include_directories(ctrlgencore
  PUBLIC ${CMAKE_SOURCE_DIR}/ctrlgen-core
  PRIVATE ${CMAKE_SOURCE_DIR}/hdl-core)  # header-only json/JsonValue.h
```

test/CMakeLists.txt:

```cmake
add_executable(test_ctrlgen_spec unit/test_ctrlgen_spec.cpp)
target_link_libraries(test_ctrlgen_spec PRIVATE ctrlgencore)
add_test(NAME ctrlgen_spec COMMAND test_ctrlgen_spec)
```

空占位文件(本任务创建,内容仅注释 + include,防 CMake 报缺文件):

```bash
for f in gen_v gen_icl gen_tcl; do
  printf '// filled in by M1 tasks\n#include "model.h"\n' > ctrlgen-core/$f.cpp
done
```

- [ ] **Step 5: 确认单测失败(缺 spec.cpp 实现 → 链接错误也算 red)**

```bash
cmake -S . -B build >/dev/null && cmake --build build -j 2>&1 | tail -3
```

Expected: `undefined reference`/未声明 —— parseSpec 未实现。

- [ ] **Step 6: 实现 spec.cpp(JSON 模式照 genconn-core/document.cpp:hdl::json::Value + find/str)**

```cpp
#include "spec.h"

#include <regex>
#include <set>
#include <stdexcept>

#include "json/JsonValue.h"  // header-only parser shared from hdl-core

namespace ctrlgen {

namespace {
using hdl::json::Value;

[[noreturn]] void fail(const std::string& why) { throw std::runtime_error("ctrlgen spec: " + why); }

bool isIdent(const std::string& s) {
    static const std::regex re("[A-Za-z_][A-Za-z0-9_$]*");
    return std::regex_match(s, re);
}

std::string reqStr(const Value& v, const std::string& k) {
    const Value* f = v.find(k);
    if (!f || f->type != Value::Type::Str || f->s.empty()) fail("missing string field '" + k + "'");
    return f->s;
}

PinSpec parsePin(const Value& v) {
    PinSpec p;
    p.portName = reqStr(v, "portName");
    if (!isIdent(p.portName)) fail("portName not an identifier: " + p.portName);
    p.mode = reqStr(v, "mode");
    if (p.mode != "control" && p.mode != "observe") fail("mode must be control|observe");
    if (const Value* w = v.find("width")) {
        if (w->type != Value::Type::Int || w->i < 1) fail("width must be int >= 1");
        p.width = static_cast<int>(w->i);
    }
    const Value* t = v.find("target");
    const Value* ts = v.find("targets");
    if (t && ts) fail(p.portName + ": target and targets are mutually exclusive");
    if (!t && !ts) fail(p.portName + ": needs target or targets");
    if (t) {
        if (t->type != Value::Type::Str || t->s.empty()) fail(p.portName + ": bad target");
        p.target = t->s;
    } else {
        if (ts->type != Value::Type::Array) fail(p.portName + ": targets must be array");
        for (const auto& e : ts->arr) {
            if (e.type != Value::Type::Str || e.s.empty()) fail(p.portName + ": bad targets entry");
            p.targets.push_back(e.s);
        }
        if (static_cast<int>(p.targets.size()) != p.width)
            fail(p.portName + ": targets length != width");
    }

    const Value* st = v.find("stitch");
    const Value* mn = v.find("muxName");
    if (p.mode == "observe") {
        if (st || mn) fail(p.portName + ": observe pin must not carry stitch/muxName");
        return p;
    }
    if (!st) fail(p.portName + ": control pin needs stitch");
    auto oneStitch = [&](const std::string& s) {
        if (s != "mux" && s != "replace" && s != "connect")
            fail(p.portName + ": stitch must be mux|replace|connect");
        return s;
    };
    if (st->type == Value::Type::Str) {
        p.stitch.assign(p.width, oneStitch(st->s));
    } else if (st->type == Value::Type::Array) {
        for (const auto& e : st->arr) {
            if (e.type != Value::Type::Str) fail(p.portName + ": stitch array entries must be strings");
            p.stitch.push_back(oneStitch(e.s));
        }
        if (static_cast<int>(p.stitch.size()) != p.width) fail(p.portName + ": stitch length != width");
    } else {
        fail(p.portName + ": stitch must be string or array");
    }

    p.muxName.assign(p.width, "");
    if (mn) {
        if (mn->type == Value::Type::Str) {
            p.muxName.assign(p.width, mn->s);
        } else if (mn->type == Value::Type::Array) {
            if (static_cast<int>(mn->arr.size()) != p.width) fail(p.portName + ": muxName length != width");
            for (int i = 0; i < p.width; ++i) {
                const auto& e = mn->arr[static_cast<size_t>(i)];
                if (e.type == Value::Type::Str) p.muxName[static_cast<size_t>(i)] = e.s;
                else if (e.type != Value::Type::Null) fail(p.portName + ": muxName entries must be string|null");
            }
        } else {
            fail(p.portName + ": muxName must be string or array");
        }
    }
    for (int i = 0; i < p.width; ++i) {
        const bool isMux = p.stitch[static_cast<size_t>(i)] == "mux";
        const std::string& m = p.muxName[static_cast<size_t>(i)];
        if (isMux && (m.empty() || !isIdent(m))) fail(p.portName + ": mux bit needs identifier muxName");
        if (!isMux && !m.empty()) fail(p.portName + ": non-mux bit must not carry muxName");
    }
    return p;
}
}  // namespace

CtrlIpSpec parseSpec(const std::string& jsonText) {
    Value root = hdl::json::parse(jsonText);
    CtrlIpSpec s;
    if (const Value* v = root.find("schemaVersion"); v && v->type == Value::Type::Int)
        s.schemaVersion = static_cast<int>(v->i);
    s.moduleBase = reqStr(root, "moduleBase");
    if (!isIdent(s.moduleBase)) fail("moduleBase not an identifier: " + s.moduleBase);
    if (const Value* v = root.find("dsIndex"); v && v->type == Value::Type::Int)
        s.dsIndex = static_cast<int>(v->i);
    if (const Value* v = root.find("dfxModeSource"); v && v->type == Value::Type::Str)
        s.dfxModeSource = v->s;
    if (const Value* g = root.find("gateCell")) {
        if (const Value* v = g->find("name"); v && v->type == Value::Type::Str) s.gateCell.name = v->s;
        if (const Value* v = g->find("out"); v && v->type == Value::Type::Str) s.gateCell.out = v->s;
        if (const Value* v = g->find("a"); v && v->type == Value::Type::Str) s.gateCell.a = v->s;
        if (const Value* v = g->find("b"); v && v->type == Value::Type::Str) s.gateCell.b = v->s;
    }
    std::set<std::string> names;
    if (const Value* pins = root.find("pins"))
        for (const auto& e : pins->arr) {
            PinSpec p = parsePin(e);
            if (!names.insert(p.portName).second) fail("duplicate portName: " + p.portName);
            s.pins.push_back(std::move(p));
        }
    return s;
}

}  // namespace ctrlgen
```

- [ ] **Step 7: 单测通过**

```bash
cmake --build build -j && ctest --test-dir build -R '^ctrlgen_spec$' --output-on-failure
```

Expected: `test_ctrlgen_spec OK`,PASS。(若 JsonValue 的 ParseError 不是 runtime_error 子类,throws() 需再 catch `hdl::json::ParseError` —— JsonValue.h:38-41 声明其继承 std::runtime_error,应已覆盖。)

- [ ] **Step 8: Commit**

```bash
git add ctrlgen-core CMakeLists.txt test/CMakeLists.txt test/unit/test_ctrlgen_spec.cpp
git commit -m "feat(ctrlgen): ctrlgen-core skeleton — model + parseSpec with per-bit stitch normalization (TDD)"
```

### Task 8: generateVerilog(TDD + 对齐 dfx_ip_gen.pl 版式)

**Files:**
- Create: `/Users/jiangbowang/MOI/2025/dftartist/dft-core/ctrlgen-core/gen_v.h`
- Modify: `/Users/jiangbowang/MOI/2025/dftartist/dft-core/ctrlgen-core/gen_v.cpp`(替换占位)
- Create: `/Users/jiangbowang/MOI/2025/dftartist/dft-core/test/unit/test_ctrlgen_gen.cpp`
- Modify: `/Users/jiangbowang/MOI/2025/dftartist/dft-core/test/CMakeLists.txt`

- [ ] **Step 1: gen_v.h(gen_icl.h/gen_tcl.h 同风格,本任务一并创建三个头)**

```cpp
// gen_v.h
#pragma once
#include <string>
#include "model.h"
namespace ctrlgen {
// RTL: control -> <pin> = AND2(<pin>_tdr, dfx_mode); observe -> <pin>_tdr = AND2(<pin>, dfx_mode).
// Byte-format tracks dfx_ip_gen.pl (docs/specs §1.1): double-space scalar ports, generate loops.
std::string generateVerilog(const CtrlIpSpec& spec);
}  // namespace ctrlgen
```

```cpp
// gen_icl.h
#pragma once
#include <string>
#include "model.h"
namespace ctrlgen {
// ICL: control -> DataInPort <pin>_tdr {DefaultLoadValue 1'b0|0;}; observe -> DataOutPort {}.
std::string generateIcl(const CtrlIpSpec& spec);
}  // namespace ctrlgen
```

```cpp
// gen_tcl.h
#pragma once
#include <string>
#include "model.h"
namespace ctrlgen {
// Tessent stitch tcl: header + sorted delete block + sorted add block (docs/specs §1.2/§4.3).
std::string generateStitchTcl(const CtrlIpSpec& spec);
}  // namespace ctrlgen
```

- [ ] **Step 2: 失败单测(精确到字节的期望文本;bus+scalar+observe 全覆盖)**

`test/unit/test_ctrlgen_gen.cpp`:

```cpp
#include "gen_icl.h"
#include "gen_tcl.h"
#include "gen_v.h"
#include "spec.h"

#include <cassert>
#include <cstdio>
#include <string>

using namespace ctrlgen;

// 逐行 diff 打印,失败时能看到第一处不一致
static void eq(const std::string& got, const std::string& want, const char* what) {
    if (got == want) return;
    size_t n = std::min(got.size(), want.size()), i = 0;
    while (i < n && got[i] == want[i]) ++i;
    std::fprintf(stderr, "%s mismatch at byte %zu\n--- got ---\n%s\n--- want ---\n%s\n",
                 what, i, got.c_str(), want.c_str());
    assert(false);
}

int main() {
    auto s = parseSpec(R"({
      "schemaVersion": 2, "moduleBase": "demo", "dsIndex": 2,
      "pins": [
        {"portName":"en","mode":"control","width":1,"stitch":"mux",
         "target":"U_A/en","muxName":"u_dfx_U_A_en_persistent_mux_inst_ds1"},
        {"portName":"cfg","mode":"control","width":2,"target":"U_A/cfg",
         "stitch":["replace","connect"]},
        {"portName":"ok","mode":"observe","width":1,"target":"U_A/ok"}
      ]})");

    eq(generateVerilog(s), std::string() +
        "module demo_ds2 (\n"
        "  input wire  en_tdr,\n"
        "  input wire [1:0] cfg_tdr,\n"
        "  input wire dfx_mode,\n"
        "  input wire  ok,\n"
        "  output wire  en,\n"
        "  output wire [1:0] cfg,\n"
        "  output wire  ok_tdr\n"
        ");\n\n"
        "cell_and2 en_persistent_and2_inst (.Z(en), .A1(en_tdr), .A2(dfx_mode));\n"
        "generate\n"
        "genvar i_cfg;\n"
        "for(i_cfg=0; i_cfg<2; i_cfg=i_cfg+1) begin: cfg_gen\n"
        "    cell_and2 cfg_persistent_and2_inst (.Z(cfg[i_cfg]), .A1(cfg_tdr[i_cfg]), .A2(dfx_mode));\n"
        "end\n"
        "endgenerate\n\n"
        "cell_and2 ok_persistent_and2_inst (.Z(ok_tdr), .A1(ok), .A2(dfx_mode));\n"
        "endmodule\n", "verilog");

    eq(generateIcl(s), std::string() +
        "Module demo_ds2 {\n"
        "  DataInPort  en_tdr {DefaultLoadValue 1'b0;}\n"
        "  DataInPort  cfg_tdr[1:0] {DefaultLoadValue 0;}\n"
        "  DataOutPort  ok_tdr {}\n"
        "}\n", "icl");

    eq(generateStitchTcl(s), std::string() +
        "create_instance  u_demo_ds2 -of_module demo_ds2\n"
        "create_connection  u_dfx_static_hyper_ctl_tdr/dfx_mode u_demo_ds2/dfx_mode\n"
        "\n\n"
        "delete_connection U_A/cfg[0]\n"
        "\n\n\n"
        "add_input_pin_dft_mux_override \"U_A/en\" \"u_demo_ds2/en\" \"u_dfx_static_hyper_ctl_tdr/dfx_mode\" \"u_dfx_U_A_en_persistent_mux_inst_ds1\"\n"
        "create_connection \"U_A/ok\" \"u_demo_ds2/ok\"\n"
        "create_connection u_demo_ds2/cfg[0] U_A/cfg[0]\n"
        "create_connection u_demo_ds2/cfg[1] U_A/cfg[1]\n"
        "\n\n", "tcl");

    std::printf("test_ctrlgen_gen OK\n");
    return 0;
}
```

注册(test/CMakeLists.txt):

```cmake
add_executable(test_ctrlgen_gen unit/test_ctrlgen_gen.cpp)
target_link_libraries(test_ctrlgen_gen PRIVATE ctrlgencore)
add_test(NAME ctrlgen_gen COMMAND test_ctrlgen_gen)
```

- [ ] **Step 3: 跑单测确认失败**

```bash
cmake --build build -j 2>&1 | tail -3
```

Expected: 链接错误(generateVerilog/Icl/Tcl 未实现)。

- [ ] **Step 4: 实现 gen_v.cpp**

```cpp
#include "gen_v.h"

#include <sstream>
#include <vector>

namespace ctrlgen {

namespace {
std::string widthStr(int w) { return w > 1 ? "[" + std::to_string(w - 1) + ":0]" : ""; }
}  // namespace

std::string generateVerilog(const CtrlIpSpec& s) {
    std::ostringstream o;
    o << "module " << moduleName(s) << " (\n";

    // port order tracks dfx_ip_gen.pl: control _tdr inputs, dfx_mode, observe inputs,
    // control outputs, observe _tdr outputs. Scalar -> "input wire  x" (double space).
    std::vector<std::string> ports;
    for (const auto& p : s.pins)
        if (p.mode == "control")
            ports.push_back("input wire " + widthStr(p.width) + " " + p.portName + "_tdr");
    ports.push_back("input wire dfx_mode");
    for (const auto& p : s.pins)
        if (p.mode == "observe")
            ports.push_back("input wire " + widthStr(p.width) + " " + p.portName);
    for (const auto& p : s.pins)
        if (p.mode == "control")
            ports.push_back("output wire " + widthStr(p.width) + " " + p.portName);
    for (const auto& p : s.pins)
        if (p.mode == "observe")
            ports.push_back("output wire " + widthStr(p.width) + " " + p.portName + "_tdr");
    for (size_t i = 0; i < ports.size(); ++i)
        o << "  " << ports[i] << (i + 1 == ports.size() ? "" : ",") << "\n";
    o << ");\n\n";

    auto emitGate = [&](const PinSpec& p, bool control) {
        const auto& g = s.gateCell;
        const std::string tdr = p.portName + "_tdr";
        const std::string z = control ? p.portName : tdr;
        const std::string a1 = control ? tdr : p.portName;
        if (p.width == 1) {
            o << g.name << " " << p.portName << "_persistent_and2_inst (." << g.out << "(" << z
              << "), ." << g.a << "(" << a1 << "), ." << g.b << "(dfx_mode));\n";
        } else {
            const std::string i = "i_" + p.portName;
            o << "generate\n"
              << "genvar " << i << ";\n"
              << "for(" << i << "=0; " << i << "<" << p.width << "; " << i << "=" << i
              << "+1) begin: " << p.portName << "_gen\n"
              << "    " << g.name << " " << p.portName << "_persistent_and2_inst (." << g.out
              << "(" << z << "[" << i << "]), ." << g.a << "(" << a1 << "[" << i << "]), ."
              << g.b << "(dfx_mode));\n"
              << "end\n"
              << "endgenerate\n\n";
        }
    };
    for (const auto& p : s.pins)
        if (p.mode == "control") emitGate(p, true);
    for (const auto& p : s.pins)
        if (p.mode == "observe") emitGate(p, false);

    o << "endmodule\n";
    return o.str();
}

}  // namespace ctrlgen
```

> 若 Task 6 Step 2 的 xxd 显示 EMA `.v` 文件尾多一个 `\n`,把 `o << "endmodule\n";` 改为 `"endmodule\n\n"` —— 以 fixture 字节为准,单测期望同步改。

- [ ] **Step 5: 构建,verilog 断言通过(icl/tcl 仍红)→ Commit**

```bash
cmake --build build -j && ./build/test_ctrlgen_gen 2>&1 | head -5
git add ctrlgen-core/gen_v.h ctrlgen-core/gen_icl.h ctrlgen-core/gen_tcl.h ctrlgen-core/gen_v.cpp \
        test/unit/test_ctrlgen_gen.cpp test/CMakeLists.txt
git commit -m "feat(ctrlgen): generateVerilog — perl-format-compatible RTL emitter (TDD, icl/tcl still red)"
```

### Task 9: generateIcl

**Files:**
- Modify: `/Users/jiangbowang/MOI/2025/dftartist/dft-core/ctrlgen-core/gen_icl.cpp`

- [ ] **Step 1: 实现**

```cpp
#include "gen_icl.h"

#include <sstream>

namespace ctrlgen {

namespace {
std::string widthStr(int w) { return w > 1 ? "[" + std::to_string(w - 1) + ":0]" : ""; }
}  // namespace

std::string generateIcl(const CtrlIpSpec& s) {
    std::ostringstream o;
    o << "Module " << moduleName(s) << " {\n";
    for (const auto& p : s.pins)
        if (p.mode == "control")
            o << "  DataInPort  " << p.portName << "_tdr" << widthStr(p.width)
              << " {DefaultLoadValue " << (p.width > 1 ? "0" : "1'b0") << ";}\n";
    for (const auto& p : s.pins)
        if (p.mode == "observe")
            o << "  DataOutPort  " << p.portName << "_tdr" << widthStr(p.width) << " {}\n";
    o << "}\n";
    return o.str();
}

}  // namespace ctrlgen
```

> 同样:若 fixture `.icl` 尾部是 `}\n\n`,末行改 `"}\n\n"`,单测期望同步。

- [ ] **Step 2: 构建 + icl 断言通过 → Commit**

```bash
cmake --build build -j && ./build/test_ctrlgen_gen 2>&1 | head -5
git add ctrlgen-core/gen_icl.cpp
git commit -m "feat(ctrlgen): generateIcl — DataInPort/DataOutPort with scalar 1'b0 / bus 0 defaults"
```

### Task 10: generateStitchTcl

**Files:**
- Modify: `/Users/jiangbowang/MOI/2025/dftartist/dft-core/ctrlgen-core/gen_tcl.cpp`

- [ ] **Step 1: 实现**

```cpp
#include "gen_tcl.h"

#include <algorithm>
#include <sstream>
#include <vector>

namespace ctrlgen {

std::string generateStitchTcl(const CtrlIpSpec& s) {
    const std::string mod = moduleName(s);
    const std::string inst = "u_" + mod;

    std::vector<std::string> dels, adds;
    for (const auto& p : s.pins) {
        for (int i = 0; i < p.width; ++i) {
            const std::string bit = p.width == 1 ? "" : "[" + std::to_string(i) + "]";
            const std::string tgt = p.targets.empty() ? *p.target + bit
                                                      : p.targets[static_cast<size_t>(i)];
            const std::string ipPin = inst + "/" + p.portName + bit;
            if (p.mode == "observe") {
                // observe: add a load, quoted new-style (docs/specs §1.2.3 / §4.3)
                adds.push_back("create_connection \"" + tgt + "\" \"" + ipPin + "\"");
                continue;
            }
            const std::string& st = p.stitch[static_cast<size_t>(i)];
            if (st == "mux") {
                adds.push_back("add_input_pin_dft_mux_override \"" + tgt + "\" \"" + ipPin +
                               "\" \"" + s.dfxModeSource + "\" \"" +
                               p.muxName[static_cast<size_t>(i)] + "\"");
            } else {
                if (st == "replace") dels.push_back("delete_connection " + tgt);
                // EMA quirk: scalar create uses double space between args, bus single
                adds.push_back("create_connection " + ipPin + (p.width == 1 ? "  " : " ") + tgt);
            }
        }
    }
    // EMA golden is byte-sorted (C locale): plain std::string operator< IS that order.
    std::sort(dels.begin(), dels.end());
    std::sort(adds.begin(), adds.end());

    std::ostringstream o;
    o << "create_instance  " << inst << " -of_module " << mod << "\n";
    o << "create_connection  " << s.dfxModeSource << " " << inst << "/dfx_mode\n";
    o << "\n\n";  // 2 blank lines after header (EMA layout)
    if (!dels.empty()) {
        for (const auto& d : dels) o << d << "\n";
        o << "\n\n\n";  // 3 blank lines between delete and add blocks
    }
    for (const auto& a : adds) o << a << "\n";
    o << "\n\n";  // 2 trailing blank lines
    return o.str();
}

}  // namespace ctrlgen
```

- [ ] **Step 2: 全部单测通过**

```bash
cmake --build build -j && ctest --test-dir build -R '^ctrlgen' --output-on-failure
```

Expected: ctrlgen_spec、ctrlgen_gen 都 PASS。

- [ ] **Step 3: Commit**

```bash
git add ctrlgen-core/gen_tcl.cpp
git commit -m "feat(ctrlgen): generateStitchTcl — sorted delete/add blocks, EMA blank-line layout, quoted mux/observe"
```

### Task 11: `ctrlgen` CLI + EMA 逐字节 golden

**Files:**
- Create: `/Users/jiangbowang/MOI/2025/dftartist/dft-core/app/ctrlgen_main.cpp`
- Create: `/Users/jiangbowang/MOI/2025/dftartist/dft-core/test/diff/ctrlgen_golden.sh`
- Modify: `/Users/jiangbowang/MOI/2025/dftartist/dft-core/CMakeLists.txt`
- Modify: `/Users/jiangbowang/MOI/2025/dftartist/dft-core/test/CMakeLists.txt`

- [ ] **Step 1: CLI(风格照 app/genconn_main.cpp:手写 argv 分发、===FILE:=== 标记、退出码 0/2)**

```cpp
#include "gen_icl.h"
#include "gen_tcl.h"
#include "gen_v.h"
#include "spec.h"

#include <cstdio>
#include <exception>
#include <fstream>
#include <sstream>
#include <string_view>

static std::string readFile(const std::string& p) {
    std::ifstream in(p);
    std::stringstream ss;
    ss << in.rdbuf();
    return ss.str();
}

// ctrlgen gen <spec.json> -> <mod>.v / <mod>.icl / <mod>.tcl (===FILE:<name>=== delimited)
int main(int argc, char** argv) {
    if (argc >= 3 && std::string_view(argv[1]) == "gen") {
        try {
            auto spec = ctrlgen::parseSpec(readFile(argv[2]));
            const std::string mod = ctrlgen::moduleName(spec);
            std::printf("===FILE:%s.v===\n", mod.c_str());
            std::fputs(ctrlgen::generateVerilog(spec).c_str(), stdout);
            std::printf("===FILE:%s.icl===\n", mod.c_str());
            std::fputs(ctrlgen::generateIcl(spec).c_str(), stdout);
            std::printf("===FILE:%s.tcl===\n", mod.c_str());
            std::fputs(ctrlgen::generateStitchTcl(spec).c_str(), stdout);
            return 0;
        } catch (const std::exception& e) {
            std::fprintf(stderr, "ctrlgen: %s\n", e.what());
            return 2;
        }
    }
    std::fprintf(stderr, "usage: ctrlgen gen <spec.json>\n");
    return 2;
}
```

顶层 CMakeLists.txt(genconn 可执行块后):

```cmake
add_executable(ctrlgen app/ctrlgen_main.cpp)
target_link_libraries(ctrlgen PRIVATE ctrlgencore)
```

- [ ] **Step 2: golden shell 测试(先写,含 EMA + pll + fuse 三个用例;pll/fuse 期望文件 Task 12 冻结,本任务先只跑 ema)**

`test/diff/ctrlgen_golden.sh`:

```bash
#!/usr/bin/env bash
# Byte-exact golden: ctrlgen gen <spec> vs frozen fixtures.
# usage: ctrlgen_golden.sh <spec.json> <golden_prefix>  (expects <prefix>.v/.icl/.tcl)
set -euo pipefail
CTRLGEN=${CTRLGEN:-/Users/jiangbowang/MOI/2025/dftartist/dft-core/build/ctrlgen}
SPEC=$1
PREFIX=$2

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
"$CTRLGEN" gen "$SPEC" > "$tmp/out.txt"

python3 - "$tmp/out.txt" "$tmp" <<'PYEOF'
import re, sys
raw = open(sys.argv[1]).read()
parts = re.split(r"===FILE:(.+?)===\n", raw)
for name, text in zip(parts[1::2], parts[2::2]):
    open(f"{sys.argv[2]}/{name.split('/')[-1]}", "w").write(text)
PYEOF

fail=0
for ext in v icl tcl; do
  want="$PREFIX.$ext"
  got="$tmp/$(basename "$PREFIX").$ext"
  if ! diff -q "$want" "$got" >/dev/null; then
    echo "MISMATCH $ext:"; diff "$want" "$got" | head -20; fail=1
  fi
done
[ "$fail" = 0 ] && echo "MATCH — $(basename "$PREFIX") byte-identical" || exit 1
```

```bash
chmod +x test/diff/ctrlgen_golden.sh
```

test/CMakeLists.txt:

```cmake
add_test(NAME ctrlgen_golden_ema
  COMMAND ${CMAKE_COMMAND} -E env CTRLGEN=$<TARGET_FILE:ctrlgen>
          bash ${CMAKE_SOURCE_DIR}/test/diff/ctrlgen_golden.sh
          ${CMAKE_SOURCE_DIR}/test/fixtures/ctrlgen/ema.spec.json
          ${CMAKE_SOURCE_DIR}/test/fixtures/ctrlgen/dfx_mem_ema_ctrl)
```

- [ ] **Step 3: 跑 EMA golden,修字节差异直到 MATCH**

```bash
cmake -S . -B build >/dev/null && cmake --build build -j
ctest --test-dir build -R '^ctrlgen_golden_ema$' --output-on-failure
```

Expected: 第一轮很可能 MISMATCH(行尾/空行细节)。**修复原则:改生成器不改 fixture**,每轮 diff 头 20 行定位;直至 `MATCH — dfx_mem_ema_ctrl byte-identical`。同时确认 Task 8/9 单测期望是否需要随生成器微调同步。

- [ ] **Step 4: Commit**

```bash
git add app/ctrlgen_main.cpp test/diff/ctrlgen_golden.sh CMakeLists.txt test/CMakeLists.txt \
        ctrlgen-core test/unit/test_ctrlgen_gen.cpp
git commit -m "feat(ctrlgen): CLI + EMA byte-golden green — ===FILE:=== markers, golden diff harness"
```

### Task 12: chip_top 第二组 golden(mux / 观测 / _dsx)冻结

**Files:**
- Create: `/Users/jiangbowang/MOI/2025/dftartist/dft-core/test/fixtures/ctrlgen/pll_ctrl_ds1.{v,icl,tcl}`
- Create: `/Users/jiangbowang/MOI/2025/dftartist/dft-core/test/fixtures/ctrlgen/fbi_instance_ctrl.{v,icl,tcl}`
- Modify: `/Users/jiangbowang/MOI/2025/dftartist/dft-core/test/CMakeLists.txt`

- [ ] **Step 1: 生成候选产物**

```bash
./build/ctrlgen gen test/fixtures/ctrlgen/pll.spec.json
./build/ctrlgen gen test/fixtures/ctrlgen/fuse.spec.json
```

- [ ] **Step 2: 人工核对清单(对照 spec §1 与样例 tcl 语义,逐项打勾)**

- `pll_ctrl_ds1.v`:端口序 enable_tdr → dfx_mode → LOCKED → enable → LOCKED_tdr;两个 cell_and2。
- `pll_ctrl_ds1.icl`:DataInPort enable_tdr(1'b0)+ DataOutPort LOCKED_tdr。
- `pll_ctrl_ds1.tcl`:header 两行;无 delete 块;add 块 = mux 行(带引号,mux 名 `..._ds1`)+ 观测行(带引号,目标在前)。
- `fbi_instance_ctrl.*`:模块名**无** `_ds`;tcl 有 delete(`.../read_buffer_persistent_buf/A`)+ create(IP 输出在前,标量双空格)+ 观测行。

- [ ] **Step 3: 冻结为 fixture + 注册两个 golden 测试**

```bash
./build/ctrlgen gen test/fixtures/ctrlgen/pll.spec.json  > /tmp/pll.out
./build/ctrlgen gen test/fixtures/ctrlgen/fuse.spec.json > /tmp/fuse.out
python3 - <<'PYEOF'
import re
for src, outdir in [("/tmp/pll.out", "test/fixtures/ctrlgen"), ("/tmp/fuse.out", "test/fixtures/ctrlgen")]:
    raw = open(src).read()
    parts = re.split(r"===FILE:(.+?)===\n", raw)
    for name, text in zip(parts[1::2], parts[2::2]):
        open(f"{outdir}/{name}", "w").write(text)
        print("froze", name)
PYEOF
```

test/CMakeLists.txt 追加:

```cmake
add_test(NAME ctrlgen_golden_pll
  COMMAND ${CMAKE_COMMAND} -E env CTRLGEN=$<TARGET_FILE:ctrlgen>
          bash ${CMAKE_SOURCE_DIR}/test/diff/ctrlgen_golden.sh
          ${CMAKE_SOURCE_DIR}/test/fixtures/ctrlgen/pll.spec.json
          ${CMAKE_SOURCE_DIR}/test/fixtures/ctrlgen/pll_ctrl_ds1)
add_test(NAME ctrlgen_golden_fuse
  COMMAND ${CMAKE_COMMAND} -E env CTRLGEN=$<TARGET_FILE:ctrlgen>
          bash ${CMAKE_SOURCE_DIR}/test/diff/ctrlgen_golden.sh
          ${CMAKE_SOURCE_DIR}/test/fixtures/ctrlgen/fuse.spec.json
          ${CMAKE_SOURCE_DIR}/test/fixtures/ctrlgen/fbi_instance_ctrl)
```

- [ ] **Step 4: 全量回归 + README 表加第五行**

```bash
cmake -S . -B build >/dev/null && ctest --test-dir build --output-on-failure 2>&1 | tail -5
```

Expected: 100% tests passed。README.md 的库表格追加:

```markdown
| **ctrlgen-core** (`libctrlgencore`) | DFX ctrl IP 生成(CtrlIpSpec → .v/.icl/缝合 tcl) | ✅ M1 —— EMA 三件套逐字节 golden |
```

- [ ] **Step 5: Commit**

```bash
git add test/fixtures/ctrlgen test/CMakeLists.txt README.md
git commit -m "test(ctrlgen): freeze chip_top second golden (mux/observe/_dsx) + README fifth library row"
```

---

## Self-review 已核对

- spec §3 两项 M0 补法 → Task 2-4;§4.1/4.2/4.3/4.4 → Task 7-12;Python oracle 层约定 → Task 5。
- 类型一致性:`moduleName(spec)`(自由函数)全计划统一;`PinSpec.stitch/muxName` 归一化为 per-bit 在 parseSpec,下游直接按位索引。
- 已知风险与对策:(a) EMA 文件尾字节 Task 6 Step 2 先定版,生成器按其修;(b) `EvalContext` 构造若签名不符,Task 2 Step 3 给了备用写法;(c) pyslang `e.constant` 若不可用,daemon_diff 会红,替代写法为对 `e.kind.name in ("IntegerLiteral","UnbasedUnsizedIntegerLiteral","Conversion")` 分支后取字面量值 —— 语义仍须与 C++ eval 一致,以 daemon_diff 为准绳。
