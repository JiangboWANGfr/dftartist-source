# B-M4-WIRING-01 最终常跑接线独立复验

2026-10-13，Agent B；**固定c87f1fa8786a88e9a4a3a892073d42aa536b4a02的本接线单元通过。**
标准M4 runner确实258/258，新增projection CTest在完整三配置都执行；无新增生产语义缺陷。
不是M5实现、GUI验收或协调者M4整体放行结论。

计划：[B-M4-wiring](plans/B-M4-wiring.md)；完整实际命令/退出码/gzip/SHA：[机器证据](m4_b_wiring_reverify.json)。
本轮不重新设计oracle，不查看A实现/diff/详细自测来定预期；共享日志摘要已读，不冒称严格盲测。

## 固定对象与需求依据

使用新自有detached目录/tmp/hier-b-m4-wiring.VMWj3F/source，完整fresh native三配置构建，
不借A/C二进制/构建目录或上一B产品。只读复用已核HEAD/干净状态的六项第三方源码。
DESIGN SHA bbd8ff1b66e20dd8014de5b4fedc2a7a09686ec7c62a0fe41e8dae5b39d43e67；
Schema30a9ca285b813202b5a9867485a6d301cbd450b31098c582542c3a11c89a1420；
私有声明0295e91ce7b1aac4d8b2a7a9011686f431a787e27747a45309ae6cb636901af6。
本轮前置是C认可fresh控制及B原5ad7baa/be6b6d6/30a5ac0冻结，A固定接线交付到达。

| 验收条件 | 输入 / 独立判断依据 |
|---|---|
| 冻结没有变化 | 两份ID文件、RTL、最终投影脚本、1ab原输入脚本，分别对B独立分支逐字/SHA相同；timeout/断言不改 |
| 运行时未改 | 所选82份运行时代码/声明/包配置git blob metadata对532相同；不从实现读取逻辑定预期 |
| 常跑没有遗漏 | package.json明确9个B文件；运行真实标准入口，258方法/0skip，含13 SDK +3真实Core ID边界 |
| 纯输入来源门禁有效 | 同B最终精确类型脚本，原65输入和指定字段/次序；35合法30拒绝；true→1专门负对照拒绝 |
| CTest实际执行 | 新projection命令指向该固定脚本/fixture，M4标签/timeout60；三完整批次各新增1，登记非零且实际执行 |
| 全功能回归 | M3/FUTURE ON，优化observer OFF，Debug/优化sanitizer ON，完整单批75/78/80；旧M1～M4与实际SDK→Node→Core不被替换 |
| 红基线没有掩盖 | 全独立260/258绿/2既知M5红/0skip；不删、xfail或将缺实现报为通过 |

修改前使用原B自有固定532：`ctest -N -R '^b_m4_raw65_projection$'`登记**0个**，明确未集成而非通过；
原`npm run test:independent:m4`实际242/242。新ID行为已在a7/532通过的原证据仍按原对象引用，
不是本轮才新增功能，不必制造语义红测。

## 本轮B实际执行

| 实际入口 | 退出 / 结果 |
|---|---|
| fresh三配置cmake与`JOBS=4 caffeinate -dimsu ./check.sh`（Node24 PATH、B schema venv） | **0**；完整优化75/75（17.77s）、Debug78/78（38.95s）、优化ASan+UBSan80/80（131.56s） |
| 标准check内web生成/类型/分层/违规探针；client及M4 runner/真实Core | 全执行；A client27/27、**B常跑258/258，0skip**、真实SDK→Core集成2/2；不是手工拼接旧批次 |
| M4登记`ctest -N -L M4`，随后`-L M4 -V` | **0；11/11**，新增projection与原raw65/C++654/reader/state/worker/stdio/协议/EOF等一起运行 |
| 完整三配置LastTest.log | 各包含新projection65一致、raw65/65、C++654/654；reader/state22方法2448断言；OFF worker3/49、ON9/752及原M3 source_sort均实际运行 |
| 直接B projection正例 / 专门true→1负对照 | 分别**0 / 1**；精确值/类型/顺序一致，失败明确在类型比较，不改生产fixture |
| `npm run test:schema`；`generate_cpp.py --check` | **0**；TS655/655、归一化27项/无缺公开方法；C++195定义/27 Schema登记定义生成零差异，不声称Core注册表全集可枚举 |
| strict公开client-contract.ts消费者 | 初次2（声明产物尚未构建）；等待typecheck后同一源码/预期重跑**0**，无类型/测试修改 |
| `npm run test:independent`（HIER_BIN为本固定产品） | **1；260总/258绿/2既知M5红/0skip**；两项均SelectionModel尚未导出，非ID/接线失败 |
| ruff check/format、Prettier涉及JS/package、diff空白 | **0**；源文件未改。不宣称有全仓ESLint/C++或SV统一格式器 |

Native AppleClang17、macOS26.0.1/arm64，CMake4.0.2、Node24.21.0；schema专用venv Python3.13.3，
部分CTest使用FindPython3选定3.12.10。M0实验明确OFF，M3/FUTURE ON，标准原flags/timeout不改。
三配置fresh build.log各有6条重复库链接警告，原样留存；configure有mimalloc说明及未用override
警告，不把完整fresh编译写成“无warning”。

三配置hier SHA分别为：

- 优化16e6b0ca5c606bc29358553fbd13ad6720164ce955146e50b5d2b1840968d2f4
- Debug ecd34149790f6ac85c78a45867d7e66b8b74f7289c19c3d267b3c71ad21d0310
- 优化sanitizer 7d36c92e4dc33aed437f6bc64599cd14c8778c11ecd8e230b431c3ed0038953e

工作树最终干净、HEAD始终c87；原Schema、fixture、锁文件SHA保持。主树同期M5文档准备未读为本轮新规范，
没有跟随移动main的dirty DESIGN/其他agent改动；C新审查记录只作交接事实，不当作B亲测。

## 勘误与边界

原[e8报告](M4_B_CLOSEOUT_REVERIFY.md)两处手工计数83→82已经**44772fb2472fec64e611b1802211eda7e6eecf23**
单独勘误；原机器输出一直为82（排除两个.md），一致性结论、所有命令/50份gzip、原e8提交均未改写。
C已经核实并接受；本轮计数明确82，不套用C另选89份路径的数量。
初次strict类型检查早于workspace声明生成而失败是本轮B装配顺序问题，初败与最终成功均归档。
没有用此错误下调期望或指控产品接口缺失。

本轮未改生产、公开API/ABI、IPC、Schema、依赖、工程格式、控制范围或原B oracle；
首版无会话持久化，旧工程恢复/迁移不适用。GUI/Electron、真实nx9000/openc910资源、远端CI、
候选迁移/M5/M6本轮未执行。具体ID耗尽code/data.reason未规范化，不把A当前值默认为稳定协议。
真实cancel仍仅证明wire/本地subscriber/自然进程清理，不扩称Core执行中取消。

Linux不因纯常跑接线重新全量编译；原B固定532、GCC13.4优化sanitizer79/79、原600秒source_sort
2方法/3411168断言5.16s独立通过，仍见[e8原机器证据](m4_b_closeout_reverify.json)，不是c87新Linux执行。
旧13.3无本人重型重叠超时与未重跑的Linux非sanitizer两配置仍保留；不借A/C执行补填。

## 交接

交A：c87常跑登记已通过本B独立验收，不再只属A自测；原测试/源码不需要重设计或新控制。
吸收本次独立报告及44772fb文档勘误，不改原e8历史证据。
交C/协调者：C已认可固定接线与控制；B本轮标准完整批次/常跑258证据已补齐，可据双方记录核定M4状态。
本B记录不代协调者直接修改里程碑状态，不预批尚未固定的新M5契约/实现。
