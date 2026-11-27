> **已过期，仅作历史保留（2026-10-06）。** 本通知的前提已在 `REVIEW_LOG.md` 的 C-01 至 C-03 中撤回并关闭；设计已通过评审，M0 已完成。当前状态以 `DESIGN.md` 和 `REVIEW_LOG.md` 为准，请勿按下文行事。

# Claude Session Review Notice

## 状态：请暂停继续实现

评审发现当前方案与代码路线存在 P0 架构冲突：

1. `DESIGN.md` 明确要求方案评审通过前不写实现代码，并要求新内核独立于旧 `dft_planner`；但当前大规模改动仍在旧 `dft_planner/dft-core/dft-core` 中。
2. 当前 `CMakeLists.txt` 把 `ScanBudget`、`Sdc*`、`DpShell`、`DftLib` 和协议继续编进 `hdlcore`，违反“内核不含 DFT 概念”和 L0–L4 分层目标。
3. `NdjsonServer.cpp` 的 `sessionShell()` 使用函数内 `static` 全局状态，不是真正的 per-session 状态；存在多设计串状态和并发数据竞争风险。
4. 现有 `build-linux` 是从另一台机器生成的，CTest 中包含 `/mnt/c/Users/...` 路径；当前 52 项测试均为 `Not Run`，不能作为验证结果。

请先明确路线：

- 方案 A：继续旧 `DesignDb` 增量开发，并修正文档；或
- 方案 B：按 `DESIGN.md` 新建独立的 `model/frontend/db/query/protocol` 内核。

在路线明确、方案评审通过、构建目录重新配置前，不建议继续向旧 `hdlcore` 增加功能。

详细评审由共享工作区中的 Codex 留存；发现的问题会直接指出，不默认放行。
