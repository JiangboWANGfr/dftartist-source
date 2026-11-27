# dft-core

DFT 工具链的**原生(C++)内核套件**,被(将要重写的)**Hierarchyshower** / **newProject**
UI 当薄客户端共用。一个仓库,多个分层库:

| 库 | 作用 | 状态 |
| --- | --- | --- |
| **hdl-core** (`libhdlcore`) | HDL filelist → 设计模型(hierarchy / ports / netlist / 类型 / 参数 / interface / behavior),基于 slang | ✅ P0–P3 + 方向①② —— 差分验证为 Python daemon 的 drop-in |
| **genconn-core** (`libgenconncore`) | 连接生成(连接规格 → Tessent 连接文件 / TCL)+ DFT 注入 payload | ✅ 方向③/③.2 —— 与 TS generate / injectDft 逐字节一致 |
| **inject-core** (`libinjectcore`) | slang 锚定的 DFT→.v 注入(链 genconn 载荷 + slang 解析) | ✅ 商业级:全网表(ANSI/位置/数组/转义/属性);chip.v 与正则版逐字节一致 |
| **drc-core** (`libdrc`) | DFT-DRC(clock/reset 可控性) | 🔜 方向④(先写 spec) |
| **ctrlgen-core** (`libctrlgencore`) | DFX ctrl IP 生成(CtrlIpSpec → .v/.icl/缝合 tcl) | ✅ M1 —— EMA 三件套逐字节 golden |
| **pad-core** (`libpadcore`) | pad I/O 识别(celllib+netlist)→ 可编辑配置表 → 边界扫描配置(read_config_data / set_boundary_scan_port_options) | ✅ P1 |
| **specgen-core** (`libspecgencore`) | SSN DataPath spec 生成(scope → DftSpecification `.spec`)+ `specgen gen` CLI | ✅ M0 —— 与 TS `genDftSpec` 逐字节 golden(basic/edt/multidatapath/extraoutput/muxsecondary) |

- 语言:**C++20**;slang(v10.0.101)vendored 进 `third_party/slang`,构建自包含。
- hdl-core 对外:**NDJSON over stdio**(`hdl serve`,与现有 Python daemon 同契约)+ CLI(`hdl dump/ports/...`)。

## 文档

- 架构 + 底层路线图:[`docs/2026-06-28-dft-core-architecture.md`](docs/2026-06-28-dft-core-architecture.md)
- hdl-core 库设计:[`docs/2026-06-27-hdl-core-design.md`](docs/2026-06-27-hdl-core-design.md)
- 完整四层数据模型:[`docs/2026-06-27-DesignHierarchy-complete.md`](docs/2026-06-27-DesignHierarchy-complete.md)
- 分层职责 + 对外 API/CLI:[`docs/2026-06-27-layers-and-api.md`](docs/2026-06-27-layers-and-api.md)
- 验证结果(P0–P3):[`docs/2026-06-27-p0-p1-results.md`](docs/2026-06-27-p0-p1-results.md)

## 构建

```bash
cmake -S . -B build -G "Unix Makefiles" -DCMAKE_BUILD_TYPE=Release
cmake --build build -j
ctest --test-dir build
```
