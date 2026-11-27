# hdl-core P0+P1 Implementation Plan — Build + Hierarchy Dump (differentially verified)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A self-contained C++20 binary `hdl` whose `hdl dump <filelist|dir>` produces a `DesignHierarchy` JSON **semantically identical** to the existing Python `tools/dump_hierarchy.py`, verified by a differential test on real RTL.

**Architecture:** Link slang as a static library (`slang::slang`). Replicate `extractor.py` + `dump_hierarchy.py` logic exactly in C++: own filelist parser → `SyntaxTree::fromFiles` (single compilation unit) → `Compilation` → walk instance tree → emit JSON. Layered as `ir` (data) / `frontend` (only file touching slang) / `service` (ported algorithms) / `json` (writer) / `app` (CLI). The differential test against the Python oracle is the correctness gate.

**Tech Stack:** C++20, Apple clang 17, CMake 4.0 + Unix Makefiles (no ninja), slang v10.0.101 (prebuilt static), Python 3.12 + pyslang 11.0.0 (oracle only, for the differential test).

---

## Verified facts (do not re-derive)

**slang:**
- Prebuilt install (use for build): `/Users/jiangbowang/MOI/2025/dftartist/code/drawio/drawio-desktop/vendor/slang` — has `lib/cmake/slang/slangConfig.cmake`, static `libsvlang.a`, headers. `find_package(slang)` → imported target **`slang::slang`** (pulls fmt+mimalloc+boost_unordered transitively).
- Source checkout (fallback / rebuild): `/Users/jiangbowang/MOI/2025/dftartist/code/dft_slang/slang` (commit `c8162767dbdc32c14a6e2a6e07f27a3561ad2cf8`, version 10.0.101).
- C++20 required. Build: `cmake -S . -B build -G "Unix Makefiles" -DCMAKE_BUILD_TYPE=Release`.
- API template to copy: `…/dft_slang/slang/tools/hier/hier.cpp`.

**slang C++ API (verified against headers under `…/dft_slang/slang/include/slang/`):**
- Manual compile (matches Python oracle): `slang/syntax/SyntaxTree.h` → `SyntaxTree::fromFiles(std::span<const std::string_view> paths, SourceManager& sm, const Bag& opts={})` returns `nonstd::expected<shared_ptr<SyntaxTree>, pair<error_code, string_view>>`. `slang/ast/Compilation.h` → `Compilation comp; comp.addSyntaxTree(*tree); const RootSymbol& root = comp.getRoot();`.
- Tops: `root.topInstances` → `std::span<const InstanceSymbol* const>`.
- Instance: `InstanceSymbol` (`slang/ast/symbols/InstanceSymbols.h`): public field `const InstanceBodySymbol& body`; `const DefinitionSymbol& getDefinition() const`. Base `Symbol` (`slang/ast/Symbol.h`): public fields `SymbolKind kind`, `std::string_view name`, `SourceLocation location`; methods `std::string getHierarchicalPath() const`, `template<T> const T& as() const`, `const T* as_if() const`.
- Body scope: `InstanceBodySymbol` is a `Scope` (`slang/ast/Scope.h`): `members()` (range of `const Symbol&`); `std::span<const Symbol* const> getPortList() const`.
- `InstanceArraySymbol` (`InstanceSymbols.h`): public `std::span<const Symbol* const> elements`.
- `UninstantiatedDefSymbol` (kind `UninstantiatedDef`): public `std::string_view definitionName`.
- `GenerateBlockSymbol` / `GenerateBlockArraySymbol` (`slang/ast/symbols/BlockSymbols.h`): generate block has an `isUninstantiated` bool; generate-block-array exposes its entries. **VERIFY exact member names in this header during Task 5** (`grep -n "isUninstantiated\|entries\|members" .../BlockSymbols.h`).
- SymbolKind values (`slang/ast/Symbol.h`): `Instance, InstanceArray, GenerateBlock, GenerateBlockArray, Port, MultiPort, InterfacePort, PrimitiveInstance, UninstantiatedDef, Definition, …`.
- SourceManager (`slang/text/SourceManager.h`, namespace `slang`): `const std::filesystem::path& getFullPath(BufferID) const`; `size_t getLineNumber(SourceLocation) const`. `SourceLocation::buffer()` → `BufferID`.
- Diagnostics: `comp.getAllDiagnostics()` → `const Diagnostics&` (iterable of `Diagnostic`, each `bool isError() const`).

**Python oracle (the differential reference):**
- Run: `/Users/jiangbowang/miniforge3/bin/python3 /Users/jiangbowang/MOI/2025/dftartist/Hierarchyshower/tools/dump_hierarchy.py <input>` → JSON on stdout, summary on stderr.
- Test RTL: `/Users/jiangbowang/MOI/2025/dftartist/veirlogPaser/rtl_test` (directory, gps_baseband, ~known hierarchy).

**Oracle output shape (must match semantically):**
```json
{ "schemaVersion": 1,
  "rootInstanceIds": ["<hierPath>", ...],
  "instances": { "<hierPath>": {"id","instanceName","definitionId","parentInstanceId","childInstanceIds","isLeaf"}, ... },
  "definitions": { "<defId>": {"id","designName","filePath"?}, ... } }
```

**⚠ Version-skew risk:** pyslang **11.0.0** vs C++ slang **10.0.101**. `getHierarchicalPath()` / member ordering could differ between versions, which would make the differential test fail on *version artifacts* rather than port bugs. Handled in **Task 7** (decision point): if the diff is only benign version formatting, either (a) build C++ against a slang matching pyslang 11, or (b) make the comparator tolerant of the specific documented diff. Do NOT paper over real structural diffs.

---

## File Structure

```
hdl-core/
  CMakeLists.txt                   # top-level: find slang, build libhdlcore + hdl
  cmake/SlangConfig.cmake.in       # (not needed P1; placeholder removed)
  core/
    ir/DesignIR.h                  # POD structs: PortInfo, ModuleDefinition, InstanceNode, DesignHierarchy
    json/JsonWriter.h              # minimal JSON emitter (header-only)
    service/Filelist.h             # parse_filelist signature
    service/Filelist.cpp           # port of extractor.parse_filelist (dir + file modes)
    frontend/SlangCompile.h        # compileSingleTree(files) -> Compilation (only slang-touching header pair)
    frontend/SlangCompile.cpp
    service/Hierarchy.h            # child_instances, leafName, kind, defInfo, selectRoots, buildHierarchy
    service/Hierarchy.cpp
  app/cli_main.cpp                 # `hdl dump|--version|--help`
  test/
    rtl/tiny/                      # handcrafted tiny RTL for unit/integration tests
      top.sv  sub.sv
    unit/test_filelist.cpp         # parse_filelist unit tests (ctest)
    unit/test_json.cpp             # JsonWriter unit tests (ctest)
    diff/compare.py                # normalize + deep-compare two DesignHierarchy JSONs
    diff/run_diff.sh               # run python oracle vs hdl dump, compare
  docs/superpowers/plans/2026-06-27-hdl-core-p0-p1-hierarchy-dump.md   # this file
```

---

### Task 0: Project scaffold + link slang + `hdl --version` (P0 gate)

**Files:**
- Create: `/Users/jiangbowang/MOI/2025/dftartist/dft-core/CMakeLists.txt`
- Create: `/Users/jiangbowang/MOI/2025/dftartist/dft-core/app/cli_main.cpp`

- [ ] **Step 1: Write top-level CMakeLists.txt**

```cmake
cmake_minimum_required(VERSION 3.20)
project(hdl_core CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# --- locate slang (prebuilt install by default; override with -DSLANG_INSTALL_DIR=...) ---
set(SLANG_INSTALL_DIR
    "/Users/jiangbowang/MOI/2025/dftartist/code/drawio/drawio-desktop/vendor/slang"
    CACHE PATH "Prebuilt slang install prefix")
list(PREPEND CMAKE_PREFIX_PATH "${SLANG_INSTALL_DIR}")
find_package(slang REQUIRED)

# --- core static library (P1: only what's needed for dump) ---
add_library(hdlcore STATIC
  core/service/Filelist.cpp
  core/frontend/SlangCompile.cpp
  core/service/Hierarchy.cpp)
target_include_directories(hdlcore PUBLIC ${CMAKE_SOURCE_DIR}/core)
target_link_libraries(hdlcore PUBLIC slang::slang)

# --- CLI executable ---
add_executable(hdl app/cli_main.cpp)
target_link_libraries(hdl PRIVATE hdlcore)

# --- tests ---
enable_testing()
add_subdirectory(test)
```

- [ ] **Step 2: Write a minimal `app/cli_main.cpp` that only handles `--version`**

```cpp
#include <cstdio>
#include <cstring>
#include <string_view>

int main(int argc, char** argv) {
    if (argc >= 2 && std::string_view(argv[1]) == "--version") {
        std::printf("hdl-core 0.0.1 (slang backend)\n");
        return 0;
    }
    std::fprintf(stderr, "usage: hdl <--version|dump> ...\n");
    return 2;
}
```

- [ ] **Step 3: Create a minimal `test/CMakeLists.txt` (empty for now so add_subdirectory works)**

Create `/Users/jiangbowang/MOI/2025/dftartist/dft-core/test/CMakeLists.txt`:
```cmake
# tests added in later tasks
```

- [ ] **Step 4: Configure + build, verify slang links**

Run:
```bash
cd /Users/jiangbowang/MOI/2025/dftartist/dft-core
cmake -S . -B build -G "Unix Makefiles" -DCMAKE_BUILD_TYPE=Release
cmake --build build -j --target hdl
./build/hdl --version
```
Expected: configures (finds slang), builds `hdl`, prints `hdl-core 0.0.1 (slang backend)`. (At this point `hdlcore`'s .cpp files don't exist yet — temporarily comment out the `add_library(hdlcore ...)` + `target_link_libraries(hdl PRIVATE hdlcore)` and link `hdl` directly to `slang::slang` for this step, OR create empty stub .cpp files. Prefer: create the three .cpp with just `// impl in later tasks` so the lib builds empty.)

- [ ] **Step 5: Prove slang actually works — compile a tiny RTL and print top instances**

Temporarily extend `cli_main.cpp` `main` with a `selftest` branch:
```cpp
#include "slang/ast/Compilation.h"
#include "slang/syntax/SyntaxTree.h"
#include "slang/ast/symbols/InstanceSymbols.h"
// ... inside main, before usage error:
if (argc >= 3 && std::string_view(argv[1]) == "selftest") {
    std::string_view path = argv[2];
    std::array<std::string_view,1> files{path};
    slang::SourceManager sm;
    auto tree = slang::syntax::SyntaxTree::fromFiles(files, sm);
    if (!tree) { std::fprintf(stderr, "parse error\n"); return 1; }
    slang::ast::Compilation comp;
    comp.addSyntaxTree(*tree);
    for (auto* top : comp.getRoot().topInstances)
        std::printf("top: %s\n", std::string(top->name).c_str());
    return 0;
}
```
Run:
```bash
printf 'module sub(); endmodule\nmodule top(); sub u_sub(); endmodule\n' > /tmp/t.sv
cmake --build build -j --target hdl && ./build/hdl selftest /tmp/t.sv
```
Expected: prints `top: top` (slang reports `top` as the only real top; `sub` is instantiated). Remove the `selftest` branch after — it was only to verify the toolchain.

- [ ] **Step 6: Commit**

```bash
git -C /Users/jiangbowang/MOI/2025/dftartist/dft-core add -A
git -C /Users/jiangbowang/MOI/2025/dftartist/dft-core commit -m "P0: CMake + slang link + hdl --version"
```

---

### Task 1: IR header (`core/ir/DesignIR.h`)

**Files:**
- Create: `/Users/jiangbowang/MOI/2025/dftartist/dft-core/core/ir/DesignIR.h`

- [ ] **Step 1: Write the POD structs (the data model — no slang, no algorithms)**

```cpp
#pragma once
#include <map>
#include <optional>
#include <string>
#include <vector>

namespace hdl::ir {

struct PortInfo {
    std::string name;
    std::string direction;   // "in" | "out" | "inout"
    int width = 0;
    std::string busLabel;
};

struct ModuleDefinition {
    std::string id;                          // "name|absPath" or "name|"
    std::string designName;
    std::optional<std::string> filePath;     // present only if non-empty
};

struct InstanceNode {
    std::string id;                          // hierarchicalPath
    std::string instanceName;
    std::string definitionId;
    std::optional<std::string> parentInstanceId;   // nullopt => null (root)
    std::vector<std::string> childInstanceIds;
    bool isLeaf = false;
};

struct DesignHierarchy {
    int schemaVersion = 1;
    std::vector<std::string> rootInstanceIds;
    // insertion-ordered maps so output order is deterministic (DFS order)
    std::vector<std::pair<std::string, InstanceNode>> instances;
    std::vector<std::pair<std::string, ModuleDefinition>> definitions;
};

}  // namespace hdl::ir
```

- [ ] **Step 2: Verify it compiles standalone**

Run:
```bash
cd /Users/jiangbowang/MOI/2025/dftartist/dft-core
clang++ -std=c++20 -fsyntax-only -Icore core/ir/DesignIR.h
```
Expected: no output (exit 0).

- [ ] **Step 3: Commit**

```bash
git -C /Users/jiangbowang/MOI/2025/dftartist/dft-core add -A
git -C /Users/jiangbowang/MOI/2025/dftartist/dft-core commit -m "P1: IR data model (DesignIR.h)"
```

---

### Task 2: Filelist parser (TDD) — `core/service/Filelist.{h,cpp}`

Port of `extractor.parse_filelist` (PORT SPEC §1.1). Both directory and file modes.

**Files:**
- Create: `core/service/Filelist.h`, `core/service/Filelist.cpp`
- Test: `test/unit/test_filelist.cpp`

- [ ] **Step 1: Write the header**

```cpp
#pragma once
#include <string>
#include <utility>
#include <vector>

namespace hdl::service {

// varmap: ordered (k,v); substs: ordered (a,b). Mirrors extractor.parse_filelist.
// Returns resolved file paths in oracle order. `ignored` collects +/- lines (file mode).
std::vector<std::string> parseFilelist(
    const std::string& path,
    const std::vector<std::pair<std::string, std::string>>& varmap,
    const std::vector<std::pair<std::string, std::string>>& substs,
    std::vector<std::string>& ignored);

}  // namespace hdl::service
```

- [ ] **Step 2: Write failing unit tests** (`test/unit/test_filelist.cpp`)

```cpp
#include "service/Filelist.h"
#include <cassert>
#include <cstdio>
#include <filesystem>
#include <fstream>
using namespace hdl::service;
namespace fs = std::filesystem;

static void write(const std::string& p, const std::string& c) {
    std::ofstream(p) << c;
}

int main() {
    fs::path dir = fs::temp_directory_path() / "hdl_fltest";
    fs::remove_all(dir); fs::create_directories(dir);

    // file mode: comments, +/- ignored, var + subst, relative resolved vs filelist dir
    write((dir / "a.sv").string(), "module a; endmodule");
    write((dir / "b.v").string(),  "module b; endmodule");
    std::string fl = (dir / "files.f").string();
    write(fl,
        "// comment\n"
        "+incdir+foo\n"
        "-y bar\n"
        "${SRC}/a.sv\n"
        "b.v\n");
    std::vector<std::string> ignored;
    auto files = parseFilelist(fl, {{"SRC", dir.string()}}, {}, ignored);
    assert(files.size() == 2);
    assert(files[0] == (dir / "a.sv").string());     // ${SRC} expanded
    assert(files[1] == (dir / "b.v").string());      // relative -> joined to filelist dir
    assert(ignored.size() == 2);                     // +incdir, -y

    // directory mode: headers (.svh/.vh) before sources (.v/.sv), each sorted
    fs::path d2 = dir / "rtl"; fs::create_directories(d2);
    write((d2 / "z.v").string(),  "module z; endmodule");
    write((d2 / "a.v").string(),  "module a2; endmodule");
    write((d2 / "h.svh").string(), "// header");
    std::vector<std::string> ig2;
    auto fs2 = parseFilelist(d2.string(), {}, {}, ig2);
    assert(fs2.size() == 3);
    assert(fs2[0].ends_with("h.svh"));               // header first
    assert(fs2[1].ends_with("a.v"));                 // sources sorted
    assert(fs2[2].ends_with("z.v"));
    std::printf("test_filelist OK\n");
    return 0;
}
```

- [ ] **Step 3: Add the test to `test/CMakeLists.txt`**

```cmake
add_executable(test_filelist unit/test_filelist.cpp)
target_link_libraries(test_filelist PRIVATE hdlcore)
add_test(NAME filelist COMMAND test_filelist)
```

- [ ] **Step 4: Run, verify it fails to link/build (parseFilelist not implemented)**

Run: `cmake --build build -j --target test_filelist`
Expected: link error `undefined symbol parseFilelist`.

- [ ] **Step 5: Implement `Filelist.cpp`** (exact port of PORT SPEC §1.1)

```cpp
#include "service/Filelist.h"
#include <algorithm>
#include <filesystem>
#include <fstream>
namespace fs = std::filesystem;

namespace {
const char* kExts[] = {".v", ".sv", ".svh", ".vh"};
bool isHeader(const std::string& ext) { return ext == ".vh" || ext == ".svh"; }

std::string strip(const std::string& s) {
    size_t a = s.find_first_not_of(" \t\r\n\f\v");
    if (a == std::string::npos) return "";
    size_t b = s.find_last_not_of(" \t\r\n\f\v");
    return s.substr(a, b - a + 1);
}
std::string replaceAll(std::string s, const std::string& from, const std::string& to) {
    if (from.empty()) return s;
    size_t pos = 0;
    while ((pos = s.find(from, pos)) != std::string::npos) { s.replace(pos, from.size(), to); pos += to.size(); }
    return s;
}
}  // namespace

namespace hdl::service {

std::vector<std::string> parseFilelist(
    const std::string& path,
    const std::vector<std::pair<std::string, std::string>>& varmap,
    const std::vector<std::pair<std::string, std::string>>& substs,
    std::vector<std::string>& ignored) {

    std::error_code ec;
    if (fs::is_directory(path, ec)) {
        std::vector<std::string> heads, srcs;
        for (const char* ext : kExts) {
            std::vector<std::string> matches;
            for (auto& e : fs::recursive_directory_iterator(path)) {
                if (e.is_regular_file() && e.path().extension() == ext)
                    matches.push_back(e.path().string());
            }
            std::sort(matches.begin(), matches.end());
            for (auto& m : matches) (isHeader(ext) ? heads : srcs).push_back(m);
        }
        heads.insert(heads.end(), srcs.begin(), srcs.end());
        return heads;
    }

    std::string base = fs::absolute(path).parent_path().string();
    std::vector<std::string> files;
    std::ifstream in(path);
    std::string raw;
    while (std::getline(in, raw)) {
        std::string line = strip(raw);
        if (line.empty() || line.rfind("//", 0) == 0 || line.rfind("#", 0) == 0) continue;
        if (line[0] == '+' || line[0] == '-') { ignored.push_back(line); continue; }
        for (auto& [k, v] : varmap) {
            line = replaceAll(line, "${" + k + "}", v);
            line = replaceAll(line, "$" + k, v);
        }
        for (auto& [a, b] : substs) line = replaceAll(line, a, b);
        files.push_back(fs::path(line).is_absolute() ? line : (fs::path(base) / line).string());
    }
    return files;
}

}  // namespace hdl::service
```

> Note: Python `os.path.join(base, line)` and `fs::path(base)/line` agree for normal relative paths. `fs::absolute(path).parent_path()` mirrors `os.path.dirname(os.path.abspath(path))`.

- [ ] **Step 6: Build + run the test**

Run: `cmake --build build -j --target test_filelist && ctest --test-dir build -R filelist -V`
Expected: `test_filelist OK`, ctest PASS.

- [ ] **Step 7: Commit**

```bash
git -C /Users/jiangbowang/MOI/2025/dftartist/dft-core add -A
git -C /Users/jiangbowang/MOI/2025/dftartist/dft-core commit -m "P1: filelist parser (port of extractor.parse_filelist) + tests"
```

---

### Task 3: Minimal JSON writer (TDD) — `core/json/JsonWriter.h`

**Files:**
- Create: `core/json/JsonWriter.h` (header-only)
- Test: `test/unit/test_json.cpp`

- [ ] **Step 1: Write failing test** (`test/unit/test_json.cpp`)

```cpp
#include "json/JsonWriter.h"
#include <cassert>
#include <cstdio>
using hdl::json::JsonWriter;

int main() {
    JsonWriter w;
    w.beginObject();
    w.key("a"); w.value(1);
    w.key("s"); w.value(std::string("x\"y\\z"));
    w.key("arr"); w.beginArray(); w.value(std::string("p")); w.value(true); w.endArray();
    w.endObject();
    std::string out = w.str();
    // escaping + structure
    assert(out.find("\"a\":1") != std::string::npos);
    assert(out.find("\"x\\\"y\\\\z\"") != std::string::npos);
    assert(out.find("[\"p\",true]") != std::string::npos);
    std::printf("test_json OK\n");
    return 0;
}
```

- [ ] **Step 2: Add to `test/CMakeLists.txt`**

```cmake
add_executable(test_json unit/test_json.cpp)
target_include_directories(test_json PRIVATE ${CMAKE_SOURCE_DIR}/core)
add_test(NAME json COMMAND test_json)
```

- [ ] **Step 3: Run, verify build fails (no header)**

Run: `cmake --build build -j --target test_json`
Expected: fatal error `json/JsonWriter.h not found`.

- [ ] **Step 4: Implement `JsonWriter.h`** (compact output; differential test normalizes anyway)

```cpp
#pragma once
#include <string>

namespace hdl::json {

class JsonWriter {
public:
    void beginObject() { sep(); buf_ += '{'; first_.push_back(true); }
    void endObject()   { buf_ += '}'; first_.pop_back(); }
    void beginArray()  { sep(); buf_ += '['; first_.push_back(true); }
    void endArray()    { buf_ += ']'; first_.pop_back(); }
    void key(const std::string& k) { sep(); writeStr(k); buf_ += ':'; pendingKey_ = true; }
    void value(const std::string& v) { sepVal(); writeStr(v); }
    void value(int v) { sepVal(); buf_ += std::to_string(v); }
    void value(bool v) { sepVal(); buf_ += (v ? "true" : "false"); }
    void valueNull() { sepVal(); buf_ += "null"; }
    const std::string& str() const { return buf_; }

private:
    void sep() {  // before a key (in object) or element (in array)
        if (pendingKey_) { pendingKey_ = false; return; }
        if (!first_.empty()) { if (!first_.back()) buf_ += ','; first_.back() = false; }
    }
    void sepVal() {  // before a value: if it follows a key, no comma; else array element
        if (pendingKey_) { pendingKey_ = false; return; }
        if (!first_.empty()) { if (!first_.back()) buf_ += ','; first_.back() = false; }
    }
    void writeStr(const std::string& s) {
        buf_ += '"';
        for (char c : s) {
            switch (c) {
                case '"':  buf_ += "\\\""; break;
                case '\\': buf_ += "\\\\"; break;
                case '\n': buf_ += "\\n";  break;
                case '\r': buf_ += "\\r";  break;
                case '\t': buf_ += "\\t";  break;
                default:
                    if (static_cast<unsigned char>(c) < 0x20) {
                        char b[8]; std::snprintf(b, sizeof b, "\\u%04x", c); buf_ += b;
                    } else buf_ += c;
            }
        }
        buf_ += '"';
    }
    std::string buf_;
    std::vector<bool> first_;
    bool pendingKey_ = false;
};

}  // namespace hdl::json
```
(Add `#include <vector>` and `#include <cstdio>` at top.)

- [ ] **Step 5: Build + run**

Run: `cmake --build build -j --target test_json && ctest --test-dir build -R json -V`
Expected: `test_json OK`, PASS.

- [ ] **Step 6: Commit**

```bash
git -C /Users/jiangbowang/MOI/2025/dftartist/dft-core add -A
git -C /Users/jiangbowang/MOI/2025/dftartist/dft-core commit -m "P1: minimal JSON writer + tests"
```

---

### Task 4: Compile front-end — `core/frontend/SlangCompile.{h,cpp}`

Port of `extractor.compile_single_tree`. The **only** files (besides Hierarchy.cpp) that include slang.

**Files:**
- Create: `core/frontend/SlangCompile.h`, `core/frontend/SlangCompile.cpp`

- [ ] **Step 1: Write the header**

```cpp
#pragma once
#include <memory>
#include <string>
#include <vector>

namespace slang::ast { class Compilation; }
namespace slang::syntax { class SyntaxTree; }
namespace slang { class SourceManager; }

namespace hdl::frontend {

// Owns SourceManager + tree for the Compilation's lifetime.
struct Design {
    std::unique_ptr<slang::SourceManager> sm;
    std::shared_ptr<slang::syntax::SyntaxTree> tree;
    std::unique_ptr<slang::ast::Compilation> comp;
    int errorCount = 0;             // non-fatal; hierarchy may be partial
};

// Single SyntaxTree from all files (matches pyslang SyntaxTree.fromFiles).
std::unique_ptr<Design> compileSingleTree(const std::vector<std::string>& files,
                                          std::string& parseError);

}  // namespace hdl::frontend
```

- [ ] **Step 2: Implement `SlangCompile.cpp`**

```cpp
#include "frontend/SlangCompile.h"
#include "slang/ast/Compilation.h"
#include "slang/syntax/SyntaxTree.h"
#include "slang/text/SourceManager.h"
#include "slang/diagnostics/Diagnostics.h"

namespace hdl::frontend {

std::unique_ptr<Design> compileSingleTree(const std::vector<std::string>& files,
                                          std::string& parseError) {
    auto d = std::make_unique<Design>();
    d->sm = std::make_unique<slang::SourceManager>();

    std::vector<std::string_view> views;
    views.reserve(files.size());
    for (auto& f : files) views.emplace_back(f);

    auto treeOrErr = slang::syntax::SyntaxTree::fromFiles(views, *d->sm);
    if (!treeOrErr) {
        parseError = std::string(treeOrErr.error().second);
        return nullptr;
    }
    d->tree = *treeOrErr;
    d->comp = std::make_unique<slang::ast::Compilation>();
    d->comp->addSyntaxTree(d->tree);

    int errs = 0;
    for (const auto& diag : d->comp->getAllDiagnostics())
        if (diag.isError()) ++errs;
    d->errorCount = errs;
    return d;
}

}  // namespace hdl::frontend
```

> `getAllDiagnostics()` triggers elaboration (matches the Python). Errors are counted but NOT fatal (dump emits partial hierarchy on errors, per PORT SPEC §11 main()).

- [ ] **Step 3: Smoke-test via temporary main wiring**

(No standalone unit test yet — exercised by Task 6's `hdl dump`. Just build the lib.)
Run: `cmake --build build -j --target hdlcore`
Expected: compiles clean.

- [ ] **Step 4: Commit**

```bash
git -C /Users/jiangbowang/MOI/2025/dftartist/dft-core add -A
git -C /Users/jiangbowang/MOI/2025/dftartist/dft-core commit -m "P1: single-tree compile front-end"
```

---

### Task 5: Hierarchy builder — `core/service/Hierarchy.{h,cpp}`

Ports: `child_instances`, `_leaf_name`, kind, `node_def_name`/`def_id`, `select_roots`, `build_hierarchy` (PORT SPEC §3–§7, §11).

**Files:**
- Create: `core/service/Hierarchy.h`, `core/service/Hierarchy.cpp`

- [ ] **Step 1: VERIFY the BlockSymbols header members** (one-time API check)

Run:
```bash
S=/Users/jiangbowang/MOI/2025/dftartist/code/dft_slang/slang/include/slang
grep -n "isUninstantiated\|struct\|class\|members\|elements\|entries" $S/ast/symbols/BlockSymbols.h | head -40
grep -n "definitionName\|class UninstantiatedDefSymbol" $S/ast/symbols/InstanceSymbols.h | head
```
Expected: confirm `GenerateBlockSymbol::isUninstantiated` (bool) and how `GenerateBlockArraySymbol` exposes child blocks (member range vs `.entries`). Use the confirmed names in Step 3. If `GenerateBlockArraySymbol` is itself a `Scope`, recurse via `members()`.

- [ ] **Step 2: Write the header**

```cpp
#pragma once
#include "ir/DesignIR.h"
namespace slang::ast { class Compilation; }

namespace hdl::service {

// roots: real tops (false-tops filtered). buildHierarchy walks them into IR.
hdl::ir::DesignHierarchy buildHierarchy(slang::ast::Compilation& comp);

}  // namespace hdl::service
```

- [ ] **Step 3: Implement `Hierarchy.cpp`** (use names confirmed in Step 1)

```cpp
#include "service/Hierarchy.h"
#include "slang/ast/Compilation.h"
#include "slang/ast/Symbol.h"
#include "slang/ast/Scope.h"
#include "slang/ast/symbols/CompilationUnitSymbols.h"   // RootSymbol
#include "slang/ast/symbols/InstanceSymbols.h"
#include "slang/ast/symbols/BlockSymbols.h"
#include "slang/ast/symbols/MemberSymbols.h"
#include "slang/text/SourceManager.h"

using namespace slang::ast;
using SK = slang::ast::SymbolKind;

namespace {

// child_instances(scope): flatten arrays, descend generate blocks, emit instances/blackbox/primitive leaves.
void collectChildren(const Scope& scope, std::vector<const Symbol*>& out) {
    for (const Symbol& m : scope.members()) {
        switch (m.kind) {
            case SK::Instance:
                out.push_back(&m); break;
            case SK::InstanceArray:
                for (auto* e : m.as<InstanceArraySymbol>().elements) out.push_back(e);
                break;
            case SK::UninstantiatedDef:
            case SK::PrimitiveInstance:
                out.push_back(&m); break;
            case SK::GenerateBlock: {
                auto& gb = m.as<GenerateBlockSymbol>();
                if (!gb.isUninstantiated) collectChildren(gb, out);   // VERIFY field name (Step 1)
                break;
            }
            case SK::GenerateBlockArray:
                // GenerateBlockArraySymbol is a Scope of GenerateBlockSymbol members; recurse each.
                for (const Symbol& e : m.as<GenerateBlockArraySymbol>().members())
                    if (e.kind == SK::GenerateBlock) collectChildren(e.as<GenerateBlockSymbol>(), out);
                break;
            default: break;
        }
    }
}

std::vector<const Symbol*> childInstances(const InstanceSymbol& inst) {
    std::vector<const Symbol*> out;
    collectChildren(inst.body, out);
    return out;
}

bool isReal(const Symbol& s) { return s.kind == SK::Instance; }

std::string leafName(const Symbol& s) {
    if (!s.name.empty()) return std::string(s.name);
    std::string hp = s.getHierarchicalPath();
    auto pos = hp.rfind('.');
    return pos == std::string::npos ? hp : hp.substr(pos + 1);
}

// (defId, designName, filePath?) for any instance kind. Mirrors node_def_name + def_id + add_def_for.
struct DefInfo { std::string id, designName; std::string filePath; bool hasPath = false; };

DefInfo defInfo(const Symbol& s, const slang::SourceManager& sm) {
    DefInfo d;
    if (s.kind == SK::Instance) {
        const auto& defn = s.as<InstanceSymbol>().getDefinition();
        d.designName = std::string(defn.name);
        std::string path;
        try { path = sm.getFullPath(defn.location.buffer()).string(); } catch (...) { path.clear(); }
        d.id = d.designName + "|" + path;
        if (!path.empty()) { d.filePath = path; d.hasPath = true; }
    } else if (s.kind == SK::UninstantiatedDef) {
        d.designName = std::string(s.as<UninstantiatedDefSymbol>().definitionName);
        d.id = d.designName + "|";
    } else {  // primitive et al.
        d.designName = "primitive";
        d.id = "primitive|";
    }
    return d;
}

// select_roots (dump variant): all non-leaf tops; fallback to all tops.
std::vector<const InstanceSymbol*> selectRoots(Compilation& comp) {
    std::vector<const InstanceSymbol*> tops(comp.getRoot().topInstances.begin(),
                                            comp.getRoot().topInstances.end());
    std::vector<const InstanceSymbol*> nonleaf;
    for (auto* t : tops) {
        std::vector<const Symbol*> kids; collectChildren(t->body, kids);
        if (!kids.empty()) nonleaf.push_back(t);
    }
    return nonleaf.empty() ? tops : nonleaf;
}

}  // namespace

namespace hdl::service {

hdl::ir::DesignHierarchy buildHierarchy(Compilation& comp) {
    const slang::SourceManager& sm = *comp.getSourceManager();
    hdl::ir::DesignHierarchy h;

    auto roots = selectRoots(comp);
    for (auto* r : roots) h.rootInstanceIds.push_back(r->getHierarchicalPath());

    std::map<std::string, bool> defSeen;
    std::map<std::string, bool> instSeen;

    auto addDef = [&](const Symbol& s) {
        DefInfo di = defInfo(s, sm);
        if (defSeen.count(di.id)) return di.id;
        defSeen[di.id] = true;
        hdl::ir::ModuleDefinition md;
        md.id = di.id; md.designName = di.designName;
        if (di.hasPath) md.filePath = di.filePath;
        h.definitions.emplace_back(di.id, std::move(md));
        return di.id;
    };

    // explicit-stack DFS: (symbol, parentId-or-null)
    struct Frame { const Symbol* sym; std::optional<std::string> parent; };
    std::vector<Frame> stack;
    for (auto it = roots.rbegin(); it != roots.rend(); ++it)
        stack.push_back({*it, std::nullopt});

    while (!stack.empty()) {
        Frame f = stack.back(); stack.pop_back();
        const Symbol& s = *f.sym;
        std::string id = s.getHierarchicalPath();
        if (instSeen.count(id)) continue;
        instSeen[id] = true;

        std::vector<const Symbol*> kids;
        if (isReal(s)) collectChildren(s.as<InstanceSymbol>().body, kids);

        hdl::ir::InstanceNode node;
        node.id = id;
        node.instanceName = leafName(s);
        node.definitionId = addDef(s);
        node.parentInstanceId = f.parent;
        node.isLeaf = kids.empty();
        for (auto* c : kids) node.childInstanceIds.push_back(c->getHierarchicalPath());
        h.instances.emplace_back(id, std::move(node));

        for (auto it = kids.rbegin(); it != kids.rend(); ++it)
            stack.push_back({*it, id});
    }
    return h;
}

}  // namespace hdl::service
```

> `#include <map>`, `<optional>`, `<vector>`, `<string>` as needed. Note DFS pushes children reversed so pop order matches the natural child order (matches Python's `stack.pop()` over `reversed`-pushed children — VERIFY child ordering parity in Task 7; adjust push order if `childInstanceIds` order diverges).

- [ ] **Step 4: Build the lib**

Run: `cmake --build build -j --target hdlcore`
Expected: compiles. Fix any member-name mismatches flagged by the compiler against the real headers (esp. generate-block fields from Step 1).

- [ ] **Step 5: Commit**

```bash
git -C /Users/jiangbowang/MOI/2025/dftartist/dft-core add -A
git -C /Users/jiangbowang/MOI/2025/dftartist/dft-core commit -m "P1: hierarchy builder (child_instances/select_roots/build_hierarchy port)"
```

---

### Task 6: `hdl dump` CLI wiring — `app/cli_main.cpp`

**Files:**
- Modify: `app/cli_main.cpp`

- [ ] **Step 1: Implement `dump` (filelist/dir → DesignHierarchy JSON on stdout)**

```cpp
#include "service/Filelist.h"
#include "frontend/SlangCompile.h"
#include "service/Hierarchy.h"
#include "json/JsonWriter.h"
#include "slang/ast/Compilation.h"
#include <cstdio>
#include <string>
#include <string_view>
#include <vector>

static std::string emitJson(const hdl::ir::DesignHierarchy& h) {
    hdl::json::JsonWriter w;
    w.beginObject();
    w.key("schemaVersion"); w.value(h.schemaVersion);
    w.key("rootInstanceIds"); w.beginArray();
    for (auto& r : h.rootInstanceIds) w.value(r);
    w.endArray();
    w.key("instances"); w.beginObject();
    for (auto& [id, n] : h.instances) {
        w.key(id); w.beginObject();
        w.key("id"); w.value(n.id);
        w.key("instanceName"); w.value(n.instanceName);
        w.key("definitionId"); w.value(n.definitionId);
        w.key("parentInstanceId"); if (n.parentInstanceId) w.value(*n.parentInstanceId); else w.valueNull();
        w.key("childInstanceIds"); w.beginArray();
        for (auto& c : n.childInstanceIds) w.value(c);
        w.endArray();
        w.key("isLeaf"); w.value(n.isLeaf);
        w.endObject();
    }
    w.endObject();
    w.key("definitions"); w.beginObject();
    for (auto& [id, d] : h.definitions) {
        w.key(id); w.beginObject();
        w.key("id"); w.value(d.id);
        w.key("designName"); w.value(d.designName);
        if (d.filePath) { w.key("filePath"); w.value(*d.filePath); }
        w.endObject();
    }
    w.endObject();
    w.endObject();
    return w.str();
}

static int cmdDump(int argc, char** argv) {
    // hdl dump <filelist|dir> [--var k=v]... [--subst a=b]...
    if (argc < 3) { std::fprintf(stderr, "usage: hdl dump <filelist|dir> [--var k=v] [--subst a=b]\n"); return 2; }
    std::string input = argv[2];
    std::vector<std::pair<std::string,std::string>> varmap, substs;
    for (int i = 3; i + 1 < argc; i += 2) {
        std::string_view flag = argv[i]; std::string kv = argv[i+1];
        auto eq = kv.find('=');
        if (eq == std::string::npos) { std::fprintf(stderr, "expected k=v: %s\n", kv.c_str()); return 2; }
        std::pair<std::string,std::string> p{kv.substr(0, eq), kv.substr(eq + 1)};
        if (flag == "--var") varmap.push_back(p);
        else if (flag == "--subst") substs.push_back(p);
        else { std::fprintf(stderr, "unknown flag: %s\n", std::string(flag).c_str()); return 2; }
    }
    std::vector<std::string> ignored;
    auto files = hdl::service::parseFilelist(input, varmap, substs, ignored);
    if (files.empty()) { std::fprintf(stderr, "no source files resolved from %s\n", input.c_str()); return 2; }
    std::string parseErr;
    auto design = hdl::frontend::compileSingleTree(files, parseErr);
    if (!design) { std::fprintf(stderr, "parse error: %s\n", parseErr.c_str()); return 2; }
    if (design->errorCount)
        std::fprintf(stderr, "WARN: %d compile errors — hierarchy may be partial\n", design->errorCount);
    auto h = hdl::service::buildHierarchy(*design->comp);
    std::string json = emitJson(h);
    std::fwrite(json.data(), 1, json.size(), stdout);
    std::fputc('\n', stdout);
    std::fprintf(stderr, "wrote %zu instances, %zu definitions, roots=%zu\n",
                 h.instances.size(), h.definitions.size(), h.rootInstanceIds.size());
    return 0;
}

int main(int argc, char** argv) {
    if (argc >= 2 && std::string_view(argv[1]) == "--version") { std::printf("hdl-core 0.0.1 (slang backend)\n"); return 0; }
    if (argc >= 2 && std::string_view(argv[1]) == "dump") return cmdDump(argc, argv);
    std::fprintf(stderr, "usage: hdl <--version|dump> ...\n");
    return 2;
}
```

- [ ] **Step 2: Build**

Run: `cmake --build build -j --target hdl`
Expected: builds clean.

- [ ] **Step 3: Smoke-run on tiny RTL**

Run:
```bash
printf 'module sub(); endmodule\nmodule top(); sub u_sub(); endmodule\n' > /tmp/t.sv
./build/hdl dump /tmp/t.sv | python3 -m json.tool | head -40
```
Expected: valid JSON with `rootInstanceIds: ["top"]`, instances `top` + `top.u_sub`, definitions `sub|…` and `top|…`.

- [ ] **Step 4: Commit**

```bash
git -C /Users/jiangbowang/MOI/2025/dftartist/dft-core add -A
git -C /Users/jiangbowang/MOI/2025/dftartist/dft-core commit -m "P1: hdl dump CLI -> DesignHierarchy JSON"
```

---

### Task 7: Differential test vs Python oracle (P1 gate)

**Files:**
- Create: `test/diff/compare.py`, `test/diff/run_diff.sh`

- [ ] **Step 1: Write `compare.py`** (semantic deep-compare, order-sensitive on childInstanceIds)

```python
#!/usr/bin/env python3
import json, sys

def load(p):
    with open(p) as f: return json.load(f)

def diff(a, b, path=""):
    out = []
    if type(a) != type(b):
        return [f"{path}: type {type(a).__name__} != {type(b).__name__}"]
    if isinstance(a, dict):
        for k in sorted(set(a) | set(b)):
            if k not in a: out.append(f"{path}.{k}: missing in A")
            elif k not in b: out.append(f"{path}.{k}: missing in B")
            else: out += diff(a[k], b[k], f"{path}.{k}")
    elif isinstance(a, list):
        if len(a) != len(b): out.append(f"{path}: len {len(a)} != {len(b)}")
        for i in range(min(len(a), len(b))): out += diff(a[i], b[i], f"{path}[{i}]")
    else:
        if a != b: out.append(f"{path}: {a!r} != {b!r}")
    return out

if __name__ == "__main__":
    a, b = load(sys.argv[1]), load(sys.argv[2])
    d = diff(a, b, "")
    if d:
        print(f"MISMATCH ({len(d)} diffs):")
        for line in d[:50]: print(" ", line)
        sys.exit(1)
    print("MATCH")
```

- [ ] **Step 2: Write `run_diff.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
HDL=${HDL:-/Users/jiangbowang/MOI/2025/dftartist/dft-core/build/hdl}
PY=/Users/jiangbowang/miniforge3/bin/python3
ORACLE=/Users/jiangbowang/MOI/2025/dftartist/Hierarchyshower/tools/dump_hierarchy.py
HERE=$(cd "$(dirname "$0")" && pwd)
INPUT=${1:?usage: run_diff.sh <filelist|dir>}

"$PY" "$ORACLE" "$INPUT" > /tmp/oracle.json 2>/dev/null
"$HDL" dump "$INPUT" > /tmp/cxx.json 2>/dev/null
"$PY" "$HERE/compare.py" /tmp/oracle.json /tmp/cxx.json
```

- [ ] **Step 3: Run differential test on the tiny RTL first**

Run:
```bash
chmod +x /Users/jiangbowang/MOI/2025/dftartist/dft-core/test/diff/run_diff.sh
printf 'module sub(); endmodule\nmodule top(); sub u_sub(); endmodule\n' > /tmp/t.sv
/Users/jiangbowang/MOI/2025/dftartist/dft-core/test/diff/run_diff.sh /tmp/t.sv
```
Expected: `MATCH`. If MISMATCH, the diff lines point at the exact divergent field — fix the port (most likely: defId path formatting, childInstanceIds order, or leafName).

- [ ] **Step 4: Run differential test on real RTL (gps_baseband)**

Run:
```bash
/Users/jiangbowang/MOI/2025/dftartist/dft-core/test/diff/run_diff.sh \
  /Users/jiangbowang/MOI/2025/dftartist/veirlogPaser/rtl_test
```
Expected: `MATCH`. 

**If MISMATCH due to slang version skew (pyslang 11 vs C++ 10):** inspect the diff lines.
- If diffs are **structural** (different instances/defs/children sets) → real bug or real version difference; investigate per-node.
- If diffs are **only formatting** of `getHierarchicalPath` (e.g., array index syntax) or absolute paths → decide:
  - (a) **Align versions** — rebuild C++ against a slang matching pyslang 11 (point `SLANG_INSTALL_DIR`/source at v11; or `pip install`-match pyslang to v10), OR
  - (b) document the benign diff and normalize it in `compare.py`.
  Record the decision in this plan and a commit message. Prefer (a) for a true drop-in.

- [ ] **Step 5: Wire the differential test into ctest**

Append to `test/CMakeLists.txt`:
```cmake
add_test(NAME diff_tiny
  COMMAND ${CMAKE_COMMAND} -E env HDL=$<TARGET_FILE:hdl>
          bash ${CMAKE_SOURCE_DIR}/test/diff/run_diff.sh ${CMAKE_SOURCE_DIR}/test/rtl/tiny)
```
Create `test/rtl/tiny/top.sv` with the tiny two-module design so the test is self-contained.

- [ ] **Step 6: Run the full suite**

Run: `ctest --test-dir build --output-on-failure`
Expected: `filelist`, `json`, `diff_tiny` all PASS.

- [ ] **Step 7: Commit**

```bash
git -C /Users/jiangbowang/MOI/2025/dftartist/dft-core add -A
git -C /Users/jiangbowang/MOI/2025/dftartist/dft-core commit -m "P1: differential test vs python oracle (gps_baseband MATCH) — P1 gate green"
```

---

## P1 Done = milestone

`hdl dump` reproduces the Python `dump_hierarchy.py` output, verified on real RTL. slang links, the oracle logic is ported, the differential harness exists. **This is shippable and de-risks everything downstream.**

---

## Roadmap: P2–P4 (separate plans, written when reached)

**P2 — NDJSON daemon (`hdl serve` / `hdl-engine`) + `hdl` query subcommands.**
- Add `core/protocol/NdjsonServer.{h,cpp}` (read line → dispatch → write line) and a JSON *parser* (add nlohmann/json via FetchContent, or extend the writer with a small parser).
- Port the daemon's stateful registry (`self.inst`, `self.defs`, `def_inst`), lazy `expand-children`, `get-ports` (def-rep + per-node overrides, PORT SPEC §8), `get-source-location`, `ping`, the `ready` event (candidate tops ranked by `subtree_size_capped(cap=2000)` + `subtreeSize`).
- Port `_meta` (includes `kind`), `candidate_roots`, `select_root`. UnknownModule-tolerant compile gate (PORT SPEC §6/§10.4).
- CLI query subcommands (`hdl roots/defs/def/inst/children/ports/loc`) each = one service call.
- Swap `Hierarchyshower/electron/daemon.cjs` spawn to the binary; differential-test each RPC vs the Python daemon. Hierarchyshower runs end-to-end on C++.

**P3 — Trace + L3/L4 (`get-netlist`, `get-drivers`, `trace-fanin/fanout/drivers`).**
- Port `_conn_net`/`_net_of`/`_on_net`/`_trace` (instance-port topology; PORT SPEC §9.1–9.2) using `InstanceSymbol::getPortConnections()` → `PortConnection::getExpression()` → resolve `ValueSymbol` (NamedValueExpression `.symbol`; concat/select via `LSPUtilities::visitLSPs`).
- Port `trace_drivers` via `slang::analysis::AnalysisManager`: `comp.getRoot(); comp.getAllDiagnostics(); comp.freeze(); am.analyze(comp); am.getDrivers(net)` → `ValueDriver{containingSymbol, source, kind, isInputPort, getSourceRange}` (PORT SPEC §9.3, analysis report §3).
- L3 `LocalNetlist` (nets via `body.membersOfType<NetSymbol>()` + port connections) and L4 `SignalDrivers` per the complete data model doc.

**P4 — Scale + packaging.**
- openc910 (`/Users/jiangbowang/MOI/2025/dftartist/veirlogPaser/openc910`) — measure compile time / memory / expand latency vs pyslang; validate the "performance" driver.
- Build a self-contained static binary; place under Electron `resources/`; `HDL_ENGINE`/`HDL_BIN` env wiring.

---

## Self-Review notes
- **Spec coverage:** P1 covers spec §1 (scope: filelist→DesignHierarchy), §2 (C++20/slang), §4 dataflow (manual single-tree path chosen over Driver for oracle parity — documented deviation), §5 modules (ir/frontend/service/json/app subset), §8 differential test. Ports/trace/daemon = P2/P3 (roadmapped).
- **Deviation from spec §3/§7:** spec proposed slang `Driver` for filelist/options; P1 deliberately uses the manual `SyntaxTree::fromFiles` path to match the Python oracle exactly (Driver's multi-unit + `+define` handling would break byte-parity). Driver-based mode is a future opt-in, tested separately.
- **Version skew** (pyslang 11 vs slang 10) is the top risk → Task 7 Step 4 decision gate.
- **API names to verify at compile time** (flagged inline): `GenerateBlockSymbol::isUninstantiated`, `GenerateBlockArraySymbol` child traversal, `UninstantiatedDefSymbol::definitionName`, `SourceManager::getFullPath` return type (`std::filesystem::path` → `.string()`).
