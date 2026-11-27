# B-M5-GATE-REVERIFY-01：标准入口固定复验

结论：固定2ad2450d7135763a403b642468a682370c21f022的两个公开npm入口接线通过独立复验。
M4实际268/268、独立全集810/810，原B十项逐名且各一次；受控加载失败均正确非零传播。
check.sh本轮只核未变Git身份和原调用，**未执行整个脚本**，不称三个入口均实际重跑。

## 固定点、独立性与来源

B test/m5-tree起点dd54553；计划/初始控制1cdbb27，负控制路径固定c0f2f95c9ac3593bdd3bb1fecf9a4bb7194bafed。
原B业务测试仍为464f83aa513512036fb1b0c3eab43688fbf95851。
依据DESIGN §5.6.2/.5/.6/.7、原B冻结及已审交接，不读A产品实现/diff/新增自测/证据或C探针建立预期。
已读共享摘要，非严格盲验；本任务读取的package.json是公开执行入口，check.sh读取本人原8d9基线。
DESIGN SHA36fd76c2b0df8f44827644ff045c789ce5175bb5be39f27d20dba1816f542de0保持。

同一本人/tmp/hier-b-m5-tree-runtime.zM31cP/source先8d9c334、再固定2ad2450。
283项生产Core/TS、protocol、ci/check.sh、构建/锁Git mode/type/blob相同；
package.json删去两条已知test script后解析对象完全相等，两脚本只在末尾追加原compatibility.test.mjs。
21项B交付文件对齐本B原Git对象；B起点全部418跟踪文件字节保持。
三份本人Core二进制大小/SHA未改、未借A/C产物、未编译native；公开入口按原配置实际运行tsc -b，非fresh TS构建。

## 输入、预期与实际结果

| 测试/输入            | 预期依据                                 | 本轮实际                                                                         |
| -------------------- | ---------------------------------------- | -------------------------------------------------------------------------------- |
| 旧8d9标准M4/全集     | 原入口尚无新增十项，原冻结回归           | 258/258、800/800，退出0                                                          |
| 目标标准M4           | 原258加B十项；逐名确认，不只看计数       | 268/268，十项各一次，退出0                                                       |
| 目标标准独立全集     | 原800加同一B十项                         | 810/810，十项各一次，退出0                                                       |
| M4指定文件加载失败   | 真npm命令必须非零，不能吞新测试失败      | 原258通过、一个文件加载失败，退出1                                               |
| 全集指定文件加载失败 | 同上                                     | 原800通过、一个文件加载失败，退出1                                               |
| 三配置Core M4标签    | 同一生产输入的相关原生回归，不接受零匹配 | 各11/11，退出0；非完整75/78/80                                                   |
| web check            | 生成/类型/分层保持                       | 195定义/27方法、四包类型、7违规负探针通过，退出0                                 |
| Schema/参数规范化    | 原权威结构/元数据/默认值保持             | 655+27通过，退出0                                                                |
| 原C78阶段/真实桥     | 原设施修订保持，不借重构改oracle         | 18/18，退出0；不含七项浏览器控制                                                 |
| B归档/库存           | 历史记录与当前文件版本边界保持           | M4 27捕获/52来源、C78 16捕获/8当前+2历史、旧UI 32捕获/27来源、140库存/95映射通过 |

268是810重叠子集；两次十项不是20个不同输入；负控制一个加载失败不算十项语义失败。
16/18/25项C78也有包含关系，不将旧七项浏览器归档核验计成本轮重跑。
Node24.21.0/TS5.9.3/macOS arm64。三配置使用本人原目录/原产物，普通observer OFF、Debug/ASan ON；
三份Core全量回归75/78/80属于前序64b1e0b，不重记本轮执行，无本轮编译warning统计。

### 负控制的隔离

[B加载控制](../web/tests/independent-transport-sharing/gate-failure-control.mjs)由本次命令的NODE_OPTIONS启用，
只拒绝B兼容测试的精确文件URL，marker为B_GATE_FAILURE_CONTROL_SHARED_TEN_ONLY。
没有写/删/skip/xfail任何原冻文件或产品；其余原测试确实执行并通过。
首次负执行前将/tmp所有权路径canonicalize，保留两个控制提交；不改预期或生产钩子。
真实失败输出、唯一失败文件及原通过数量均归档，缺工具/环境失败不作为正确负控制。

check.sh与8d9相同，SHA954b72a7c96ad03adde0e4a107d1fe1b67952185679b13fc54f894fd6009d9d2；
原基线set -euo pipefail及M4调用静态核验，依调用链接入十项的判断是静态推论，非本轮整个脚本执行证据。
没有运行A新增29项自测来定义oracle，也未把A的check.sh结果记成B执行。

## S07报告勘误（不改冻结测试）

前序64b1e0b报告的S07表格“256/257全部有序交付”等表述错误。
原464f83a测试始终要求：256帧全部接受并FIFO投递；第257帧拒绝、overflow计数1，关闭前缓存清空、seen=[]。
本轮重新从B原冻源核对；旧基线和目标实际执行均按这组原断言通过。
原测试、原报告和失败记录保留。本节与REVIEW_LOG追加纠正文字，不回写历史或根据A实现改变预期。

## 证据、复跑与交接

主归档SHA256为0a44d83cb0e594dc292ae8584056b4b90efa642bc9347e472c112c920dd855f8。
[后检记录](m5_b_standard_gates_archive_checks.json)另存归档/逐名/来源、格式及资源/空白检查，三项均0，避免自引用。

[机器证据](m5_b_standard_gates_verification.json)：21条命名完整捕获，292722原字节/73835gzip字节，
含完整argv/cwd/退出、两个正确非零控制、前后入口输出、静态链与来源审计；不是所有探索终端全录。
一次工具编排在checkout成功后发现工具环境无URL全局，子门禁尚未开始，修正工具侧URL字符串后运行；非产品失败。
[核验器](../web/tests/independent-transport-sharing/verify-standard-gate-evidence.mjs)
核每份完整输出长度/SHA/退出、四份固定Git/当前源、两入口十项各一次与正确负控制：

```sh
node web/tests/independent-transport-sharing/verify-standard-gate-evidence.mjs
HIER_BIN=/absolute/B/source/core/build/hier npm --prefix /absolute/B/source/web run test:independent:m4
HIER_BIN=/absolute/B/source/core/build/hier npm --prefix /absolute/B/source/web run test:independent
```

交A/C：当前两个npm标准入口独立复验通过；原B业务输入/版本边界不变，可核本固定报告吸收。
本单元不新增API/ABI/IPC/Schema/默认值/锁/工程格式，不重开共享模块或S02公共契约。
C78关闭仍归C；C79定位修订、获批L02窄适配、L06/原Promise观察和Electron冻结继续分单元。
本轮无真实浏览器/生产UI/AX/读屏/Electron、M7/真实大设计/Linux/远端CI/覆盖率结论。
首版无保存恢复/迁移/计划编辑undo-redo；共享日志只追加不提交，协调/research/ref/旧工程保持。
