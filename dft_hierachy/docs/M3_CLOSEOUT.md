# M3：A 实现交付与独立验收索引

日期：2026-10-12。A 的 M3 实现及整合工作已交付，B/C 最终复核均通过，当前没有待 A 修复的确定缺陷。
总里程碑及调度表仍由协调者依据这些证据更新；本文件不替代独立报告，不改写历史红基线。

## 固定对象

| 对象 | 版本 |
|---|---|
| 最终生产实现 | `061d1d17e147d3c468ef94a8c5ee2e7ae6563317` |
| 原生测试及标准门禁集成，A/B/C 最终验证对象 | `5bd4b46fd8b81ffda973a6e648e3acfeceb8f138` |
| M3 冻结 DESIGN SHA-256 | `487211cec837aed48879f9915372780f1c03b7b0adf61cccbcbc4bb36a6e89e0` |
| B 最终计划、报告，原样吸收 | `470eb99` → `1408dfd`，主树 `b2495a3` → `7ee6cc4` |

后续 M4 文档的 SHA 不追溯替换 M3 冻结值。生产代码、B oracle、schemaVersion=6、protocol=2 均未因这次文档整合变化。

## 验收与实际证据

| 要求 | 交付及证据 |
|---|---|
| A12/A13：表达式、step、cone/paths | [M3 计划](plans/M3.md)、[R2 独立复验](M3_R2_REVERIFY.md)；最终 B 全集合含表达式、step、追踪边界回归 |
| A16：查找、路径、全部 occurrence 与源码正反查 | [source 实现证据](M3_SOURCE_A_VERIFICATION.md)、[公开修复独立复验](M3_R3_FIX_REVERIFY.md)；最终 B 集合保留原 source/physical 测试 |
| 确定性有限成本、动态取消、冷重试与热缓存 | [原 observer 冻结](M3_R3_OBSERVER_FREEZE_PLAN.md)、[C59 新冻结](M3_R3_C59_FREEZE_PLAN.md)、[最终 B 报告](M3_R3_C59_NATIVE_REVERIFY.md)；覆盖范围和未证明项以报告为准 |
| 原生 PRIVATE 绑定、默认门禁、前序回归 | [A 原生整合报告](M3_C59_NATIVE_A_VERIFICATION.md)、[A 机器证据](m3_c59_native_a_verification.json)、[B 最终机器证据](m3_r3_c59_native_reverify.json) |
| C-58/C-59 正式关闭及最终实现审查 | [REVIEW_LOG](REVIEW_LOG.md) 的 C 修复复核及“R3-C 新 C59 原生整合审查通过”条目；C 无新增待修项 |

### A 已执行的最终产品门禁

`PATH=/Users/jiangbowang/.npm-global/bin:$PATH JOBS=4 ./check.sh`：退出 0，完整构建及
普通 OFF **64/64**、Debug ON **67/67**、ASan/UBSan ON **69/69**。另先在普通 ON
配置实际运行 `ctest --test-dir core/build -R '^b_m3_(observer|source_sort)$' --output-on-failure`，
**2/2**；先归档 ON，后由 check.sh 恢复普通 OFF。执行日期及完整参数以 A 原报告为准，本次没有重跑。

真实设计在同一生产实现 061d1d1 上已有 NX9000/OpenC910 共 10 条命令全通过，见
[修复验证报告](M3_C58_C59_A_VERIFICATION.md)；不将其记成这次文档整合的新测试。

### B 新固定版本最终独立执行

自有固定 5bd 工作树，三配置显式 M3/observer ON：

- 原生十四 API 每配置 **67 用例 / 3,550,682 断言 / 0 skip**。
- 其中新 source_sort **2 用例 / 72 场景 / 3,411,168 断言**，原 observer **8/285**，公开十二目标 **57/139,229**。
- 原 CLI **88/88**；`ctest … -R '^b_m3_' --output-on-failure` 为 **27/27**，前序回归另 **27/27**，均退出 0。
- 原资源门禁四方法 / 36 样本通过，最大中位数 8,847,360 bytes；只证明原 open/snapshot/diagnostics 相对增长门禁。

完整命令、各配置和计数归属见 B 最终报告。重复的 XML/CLI wrapper/CTest 不重复算覆盖。

### C 新固定版本最终独立执行

C 自有固定树全目标增量构建；三个 ON 配置选定 CTest 各 **16/16**，恢复普通 OFF 后 **14/14**，均退出 0。
C 的 sanitizer 是 **Debug+ASan/UBSan**，不是 A/B 的优化配置；这不是三套全 CTest。
实际审查标准脚本显式开关、编译宏和登记、生产目录及 B 冻结差异，结论通过。
原证据 `/tmp/hier-c-r3-native.wIqYgt/evidence.json`，SHA-256
`fc36ac0eff4073dfdc8ea5ee094fe573085df61d8bf546c799df14f4d8b6d9e8`；持久交接见 REVIEW_LOG。

## 剩余范围与下一步

- 本次只整合文档；执行 JSON/78 文件 hash/原样吸收/差异与链接检查，不重跑无变化产品。
- web 类型及分层已通过；独立 web 仍 **1 绿 / 10 红 / 0 skip**，分别为八项 M4 客户端、两项 M5 选择模型尚未实现。
- M4 先收敛 B-11/B-12 及 B-13 的客户端部分，完成 C 契约审查和 B 独立冻结，再实施 NDJSON/TS 纵向链。
- Linux/Windows/远端 CI、TSan、所有分配和 I/O 取消粒度、M7 绝对资源/最长等待预算未由上述结果证明。既有重复静态库链接警告保留。
- 当前交付是 CLI → Core；Electron/React 尚未接入。首版无会话持久化，旧工程加载/迁移对本次不适用。

B 下一步重点是 M4 独立契约与红基线；C 重点是 M4 生命周期、兼容及单一 Schema 来源。
不重复请求 B/C 关闭已经完成的 M3 专项。
