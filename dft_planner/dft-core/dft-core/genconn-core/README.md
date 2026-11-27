# genconn-core

连接生成核心(newProject `src/core/` 生成管线的 C++ 移植)。独立库,不依赖 slang;
仅复用 hdl-core 的头-only JSON 解析器读输入。**输出与 TS `generate()` 逐字节一致。**

## 输入 / 输出

- **输入**:`GenConnDocument` JSON(newProject `document.ts` `serialize()` 产物)——
  `{ schemaVersion, library:{defs:[HardenDef...]}, ui:{openDefId, rootDefId} }`。
- **输出**:Tessent 连接文件文本(`TopModuleConnections(<top>) { ChildBlock... }`)+ 提升接口的 `.tcl`。

## C++ 库 API(`libgenconncore`)

```cpp
#include "model.h"      // HardenDef / BusInterface / HardenInstance / BusConnection /
                        // HardenLibrary / GenConnDocument / InterfaceSignal
#include "document.h"   // genconn::parseDocument(jsonText) -> GenConnDocument
#include "generate.h"   // 生成管线
#include "expand.h" "order.h" "validate.h"   // 子能力(信号展开 / 排序 / 校验)

namespace genconn {
  struct GenResult { std::string file; std::string text; };

  // 某层(root)的连接文件;nullopt = 本层无 tiling 子块、不产文件。
  std::optional<GenResult> generate(const HardenDef& root, const HardenLibrary& lib, bool isRoot);
  // 提升(portedFrom)接口的 TCL 馈通;nullopt = 无提升接口。
  std::optional<GenResult> generateTcl(const HardenDef& root, const HardenLibrary& lib, bool isRoot);
  // 覆盖整库:每个含 tiling 子块的 def 各产一份(+ tcl)。
  std::vector<GenResult>   generateAll(const HardenLibrary& lib, const std::string& rootId);

  GenConnDocument parseDocument(const std::string& jsonText);
}
```

子能力(供复用 / 测试):`basesOf/clientSignal/secondarySignal/expandInterface`(expand.h)、
`orderInterfaces/expandDef`(order.h)、`validateDef/effectivePd`(validate.h)。

### vinject —— 把 DFT 信号注入真实 .v 网表(vinject.h)

```cpp
bool        genconn::defNeedsDft(root, lib);
std::string genconn::injectDft(vText, lib, parentDefId);  // 锚定文本拼接,保留原文
```
CLI:`genconn inject <doc.json> <netlist.v> [parentDefId]`。做三件事:声明 DFT wire、给各实例端口表末尾追加 `.<信号>(<网>)`、接口提升(portedFrom)加顶层 port + 馈通。**与 TS injectDft 逐字节一致**(`genconn_inject_diff`,chip.v 真实网表)。

**正则/锚定 splice 覆盖不到的情况(与 TS 同限,故意保持):**
- **ANSI 模块头**(`module M(input a,...)`):显式抛错,只支持非 ANSI 头。
- **位置(顺序)端口连接**(`sub u(a,b)` 无 `.port`):会在末尾追加命名 DFT 端口 → 混用非法。
- **实例数组** `u[3:0]`、**一句多实例** `sub a(),b();`:正则匹配不到 / 误扫。
- **字符串字面量含 `(` `;` `endmodule`**、**Verilog 属性 `(* *)`**、**未展开宏**:不被注释屏蔽,可能干扰括号/边界。
- 同名模块取首个。

目标是**综合产出的"规整"门级网表**(命名连接、一句一实例、非 ANSI),上述情形基本不出现。需更强鲁棒时:由 hdl-core 用 slang 给出源码锚点(端口表/实例连接表范围),genconn-core 仍做 splice —— 见架构文档。

**未移植:** `edit.ts`(540 行 UI 不可变操作,纯 UI 层)。

## CLI(`genconn`)

```
genconn generate     <doc.json>   # root 连接文件文本 → stdout
genconn generate-all <doc.json>   # 全部文件(===FILE:<path>=== 分隔)→ stdout
```

## 测试:差分(权威 oracle = TS `generate`)

`test/diff/genconn_diff.sh`(ctest `genconn_diff`):

1. `newProject/tools/genconn-oracle.ts emit-doc` → 用 chip fixture 序列化出 `GenConnDocument` JSON(C++ 的输入)。
2. `genconn-oracle.ts generate-all`(TS)与 `genconn generate-all`(C++)各出文本。
3. **逐字节 diff** —— 当前 MATCH(chip fixture:BSCAN/IJTAG/BISR/SSN 四类总线、BISR 电源域、
   7 实例、26 连接)。

另:C++ 输出对 golden 文件(`newProject/top.top_level_ports_and_connectionss`)做**语义**比对
(经 `parseConn` AST)—— MATCH。(golden 与当前 TS 输出本就空白格式不同,故 golden 用语义比、
TS 用逐字节比;后者是权威。)
