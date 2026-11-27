# B-ORCH-11：SourceCandidates 运行时独立复验

结论：B 接受固定产品 `a35122adbb93a94943ff8e783b0d76a79729c59f` 在受审 §6.11 原始分页数据单元的本轮冻结范围；
使用 B 独立窄修订 `fa8d99549eca7031f0ff9aa19e79e230553f50e7`，无产品修改。
新模型281/281、真实模型/Core13/13、生产类型负例47/47及标准独立1922/1922通过，均0skip。
这是明确测试版本/overlay 下的 B 结论，不把未改主树入口称为全绿，不代 C 实现审查，也不宣告 M5 整体完成。

## 固定对象、原始红和独立修订

- 产品：`a35122adbb93a94943ff8e783b0d76a79729c59f`；旧生产 `61db0b26d90f6017d040a63eb06361c9bb3c4b14`。
- 当前 DESIGN SHA256：`170df382cfd105d4fd279fb46b3a2d5628607ef58f52f42f5ba0d289b46c8207`。
  §6.11.1–4规范正文与受审旧版逐字节一致，正文 SHA256
  `79f388c887de984937763583004c5c657305835b4d4e5b0f2fc03aecc74c76ed`。
- B原冻结 `88e2e2a/e511880`，原报告 `1d10fc8`；当前B测试修订 `fa8d995`。
- E=`/tmp/hier-b-orch11-candidates.HuQPgCqs`；
  P=`E/checkout with space 中文`，独立detached固定a35122a。
- 先在纯P运行原冻结：B实际281/273通过/8失败/0skip；八项都是
  `SC-late-{cancel,clear,reload,replace}-{first,next}` 的最后一行取消帧字段断言。
  原错误、此前已完成的所有断言、完整输出及原源文件均保留。
- 既有 DESIGN §5.2、权威 Schema Cancel、公开生成声明规定 `params.target`；
  B误写为 `params.id`。旧B Wire只clone与筛method，没有改名。
  **只修改该一行**，输入/ID/expected/basis、任务取消/晚页/前缀与其他断言不动；
  依据既有规范，不从A实现/selftest生成预期。
- 新增四设施控制：正确target；只有id缺target；target不同但id相同；真实SDK独立订阅及最后一方取消。
  params允许扩展字段，不把出现id一概判非法。不加生产别名，不删除/skip八例。
- P唯一overlay为同一行B修订，原/修后17149/17153字节，SHA256分别
  `abd1f9a843ff6376aa19d565c48070e286db586b4f525bd7b10982bc2ededa68` /
  `3c9b911df80df71f93939c4e933184353212648a759160f720271ab4b19053ec`。
  19份原B导入文件中仅此文件一行变化，其余18份相同；中途“其余19份”是计数简写，准确集合为总19。
- [执行计划](plans/B-candidates-runtime-recheck.md)；[窄修订控制](../web/tests/independent-source-candidates/cancel-frame.facility.test.mjs)。
  未读A生产实现/diff/consumer/witness来构造oracle；读取过交付摘要/含A结果的计划，故不声称严格盲测。

## 本人实际执行

Node24.21.0 / TS5.9.3 / Prettier3.6.2，macOS arm64。
B脚本cwd为B测试树，显式 `HIER_B_PRODUCT_ROOT=P`；
产品入口cwd=P，`HIER_BIN=P/core/build-b-review/hier`。
完整argv/cwd/UTC/退出/时间及合并stdout/stderr见[机器档](m5_b_candidates_runtime_recheck.json)。

| 实际命令                                                                                                                                                                                                                        | 退出与结果                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| P: `npm --prefix web ci --ignore-scripts --no-audit --no-fund`；`npm --prefix web run check`                                                                                                                                    | 均0；独立71包；195定义/27方法、四包TS、45模块144依赖、7分层负控制                                             |
| B: 原 `node web/tests/independent-source-candidates/run.mjs`                                                                                                                                                                    | 1；实际281，273pass/8fail/0skip，完整原红保留                                                                 |
| B: 修后同命令 / `--core` / `verify-types.mjs`                                                                                                                                                                                   | 均0；281/281、13/13真实模型→SDK→Node→Core、正例0诊断且47负例逐项拒绝                                          |
| B: `node --test .../facility.test.mjs .../cancel-frame.facility.test.mjs`                                                                                                                                                       | 0；原6+新4=10/10，0skip/cancel/todo，设施不加到模型计数                                                       |
| P: `cmake -S core -B core/build-b-review -G "Unix Makefiles" -DCMAKE_BUILD_TYPE=RelWithDebInfo ...`；`cmake --build core/build-b-review --target hier -j4`                                                                      | 均0；B fresh hier78.54秒，M3/FUTURE ON、OBSERVER/SANITIZE OFF；只读复用六份核SHA依赖源码，不用A/C对象或二进制 |
| P: `npm --prefix web run test:independent`                                                                                                                                                                                      | 0，34.89秒；实际1922/1922，0skip，包含最后候选Core13，非只跑到1909                                            |
| P: `npm --prefix web run test:independent:m4`                                                                                                                                                                                   | 0；268 Node+26身份=294/294、0skip，与1922重叠不再加总                                                         |
| P: `npm --prefix web run test:client` / `test:core`                                                                                                                                                                             | 均0；现有SDK47/47、实际SDK/Core3/3回归，非新增B oracle                                                        |
| P: `HIER_SCHEMA_PYTHON=/tmp/hier-b-orch3-renderer.iRHIDr/schema-venv/bin/python npm --prefix web run test:schema`                                                                                                               | 0；原655/655+27参数规范化，failed0/skip0；复用B隔离工具环境                                                   |
| P: Selection `verify-selection-types.mjs production`；Tree `verify-tree-types.mjs production` / `verify-diagnostic-read-types.mjs production`；`tsc -p web/tests/independent-tree/tsconfig.diagnostic-callable-production.json` | 全0；旧33/35/14逐项类型负例及callable正例保持                                                                 |
| B: 新测试/计划Prettier、`git diff --check`、公开声明/保护/来源/计数核验                                                                                                                                                         | 全0；核档不是新产品语义执行                                                                                   |
| B: `node .../recheck/verify-evidence.mjs --inputs --product`                                                                                                                                                                    | 0；32捕获/24原材料/51pin/56块，核24 B材料/880产品文件/唯一overlay及原红和实际结果                             |

独立全集逐批核为810 Node、26身份、281属性、5属性Core、renderer99+25+12+40+6、
306 Source+4 BD、14 SourceCore、新281候选+13候选Core，共1922。
标准wrapper还执行已有属性/Source/renderer类型与浏览器包边界；类型/打包不加产品语义数量。
UI/Electron并未由这些renderer/SDK控制获得验收。

B Core9329368字节/SHA256
`971dedb67cfaa3181a1549db8b4c81e19a109867550523e579d25a469ffe7df4`。
实际Core任务均等待拥有进程退出；末尾独立规范化路径进程表0，不把瞬时表代替实际退出断言。
完整重编的是hier及其依赖目标，不把它写成默认全目标/CTest或三配置构建。

## 兼容与保护

Core/protocol整树与61db0b2相同；无本轮B生产/API/ABI/IPC/Schema/依赖/工程格式改动。
新编41份声明与主树当前声明一致、主树原41份字节未动；相对旧37份，35份原字节相同，
index仅为公共入口增量、target-data-model为内部投影声明变动，新增4份。
公开声明通过TS checker核：旧42个root export全在，仅增加约定的8个SourceCandidates导出，无删除；
这不代替旧行为回归，旧行为由上面冻结集执行。

共享898非日志（880跟踪+18原未跟踪）全部保持；B原608文件仅授权cases一行变化；
P原880文件仅同一B测试overlay；主树暂存空，协调/research旧脏项保留。
原日志1742559字节/SHA256
`e6f7a0b33c07ba5fea9a3f05fda39720f205a499ed04729899afc66201ccfc1c`前缀保持；
REVIEW_LOG仅追加不提交。未改旧B10归档及历史verifier约束来适配当前根。

## 可携证据、限制与交接

机器档645580字节/SHA256
`a6f183cae6df653ac5333efd459980c485878da36cfadbc47fb53b3fb2b3cc3b`；
32完整捕获、24可携材料（含原e511880 cases）、51产品pin、56块原文975176/压缩238843字节逐块核验。
归档生成后格式/核档/报告/commit/最终交接回执另存E，不递归归档自身。
[独立核验脚本](../web/tests/independent-source-candidates/recheck/verify-evidence.mjs) 不执行或替代生产模型。

交A：导入fa8d995并核窄修订/新设施原样；不需改产品或增加params.id别名。
本报告和归档核验属于辅助交付，不为吸收报告另建收尾单元或重复本轮1922。
交C：B实际接受范围如上，实施审查仍由C独立给结论；不替C关闭意见。
未运行check.sh、native CTest/Debug/ASan、Linux/真实设计/真实Electron/UI/E2E、旧dft-suite或远端CI；
不宣告自动ready刷新、当前文档身份/UTF16/changed禁点/Selection/SourceView及main/preload/L06/L09–11完成。
首版无持久化，工程保存/恢复/旧格式迁移不适用；D-03仍限M6。
本轮B职责、证据和交接已完成，不新建会话/计时器、不恢复监控、不排队其他会话消息。
