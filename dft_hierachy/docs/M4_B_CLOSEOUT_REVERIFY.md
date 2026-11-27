# B-M4-CLOSEOUT-01 独立复验报告

2026-10-13，Agent B。固定产品 **532365d70a29215daac98a6b411d3689d746140a**；
raw接线8463d1f、工具链930ea58；代码级运行时仍a7d1501。
本单元通过：raw65冻结投影/生产接线、受审ID边界、native三配置、GCC13.4全新优化sanitizer
及原source_sort。**不是M4整体放行，也不是候选库迁入生产验收。**

执行计划：[B-M4-closeout](plans/B-M4-closeout.md)。
完整命令、退出码、耗时、gzip输出及SHA：[机器证据](m4_b_closeout_reverify.json)。
所有语义执行使用B自己的固定产品目录/构建，不借A/C/D二进制或build volume。

## 基线、规范与独立性

产品目录/tmp/hier-b-m4-closeout.M3YER8/source，自有branch test/m4从1abdbcf继续。
DESIGN bbd8ff1b66e20dd8014de5b4fedc2a7a09686ec7c62a0fe41e8dae5b39d43e67；
Schema30a9ca285b813202b5a9867485a6d301cbd450b31098c582542c3a11c89a1420；
SessionContract0295e91ce7b1aac4d8b2a7a9011686f431a787e27747a45309ae6cb636901af6。
预期来自DESIGN§5.6.1/.2/.5/.6/.7/.9、原B源码/fixture和C认可的控制范围。
共享日志的A/C/D摘要不可避免已读，不冒称严格盲测；未查看A实现/diff/详细自测来确定oracle。
必要的固定版本metadata、公开声明、构建/CI入口与运行日志单独检查。

Git blob metadata确认82份选定运行时代码/声明/包配置对a7相同；Markdown文档排除，README变化单列。
24份交集B测试/fixture中23份字节相同，BWireReplay是已审纯空白差异，去空白相同，
并实际执行654原独立结构/登记重放；不声称Core注册表可枚举整个method-set/count。
产品目录只有四份B新增测试/fixture overlay；生产、Schema和锁文件未改。

## 新冻结测试、输入与判断依据

| 文件 / 提交 | 输入与独立预期 |
|---|---|
| id-boundaries.test.mjs / **5ad7baae94ef68f7b9021ac47802296a8920867e** | 13项：默认1、MAX-1/MAX、拒发不回绕、原pending乱序/Core错误、合并/缓存、pre-abort/非法参数、最后cancel、迟到帧、dispose/新连接 |
| id-real-core.test.mjs + id_boundary.sv / **30a5ac04ee25b29800a296e23ee6ef493ff1724e** | 3项真实SDK→Node→Core；手写单模块a→y/两个1位端口；MAX-1/MAX响应、complete缓存、MAX cancel和新进程ID1；每进程公开exited为code0/signal=null |
| verify_raw65_projection.py / **be6b6d6048a43f1138fd4a1d62d181ef4dafffb8** | 原B 1ab脚本仅输入构造AST，65项逐值/类型/顺序相同；不执行D候选、不用actual、不补缺失offset。bool true改数字1的负对照必须退出1 |
| AsanFrameReuseProbe.cpp / bb88a82；格式3536c98 | 公共ASan接口，65536次非递归顺序调用全部得到fake frame；无计时阈值、不禁UAR，源码纯格式前后分别绑定SHA |

ID适配仅在自己刚构造、未投递hello/未查询/未发送的HierClient中，检查nextId为自身可写data
property且严格初值1、WeakSet一次护栏，设MAX或MAX-1一次。此后不再读取/写入该属性、
pending/deduplicated/cache/failure，也不改SDK query/send；全部刺激/观察经公开API。
真实Transport观察器从构造开始记录并原样转发，不替换生产SDK方法或伪造回复。

规范歧义仍列明：DESIGN未指定ID耗尽具体error.code/data.reason，故只断言HierError、client origin、
非空诊断、拒发不毒化等公开行为，不把当前实现值采用为正确答案。
真实cancel只证明合法wire、本地subscriber结算和自然进程回收；不声称Core执行中取消。

## 修改前基线与当前实际结果

| B实际命令 / 配置 | 退出 / 结果 |
|---|---|
| 自有a7d1501 SDK/Core，分别node --test两份新ID文件 | **0；13/13 + 3/3，0skip**。旧运行时原已满足；没有凭空制造“尚未实现”的红测 |
| 固定532365d，两份新ID文件 | **0；13/13 + 3/3，0skip** |
| 原raw65投影脚本 / 当前fixture | **0；65一致，35接受30拒绝**；fixtureSHA ebabddb8eeb56012ea22d77e080da757c59177ce26159e6a9ad71ca1d6a99155 |
| native caffeinate -dimsu、Node24 PATH、HIER_SCHEMA_PYTHON、自有./check.sh、JOBS=3 | **0**；优化74/74（32.32s）、Debug77/77（70.37s）、优化ASan+UBSan79/79（176.21s）；web生成/类型/分层/违规探针、A客户端27、原B M4子集242、真实Core集成2均执行通过 |
| native ctest -N -L M4；随后-L M4 -V | **0；实际10/10**。Reader/state22方法2448断言、OFF worker3/49、C++654、raw65、协议25、EOF/Unicode24等；ON worker由Debug/ASan完整批次覆盖 |
| 手工显式9个M4独立文件，含新16项 | **0；单批258/258，0skip**；不是把不同旧批次相加 |
| npm run test:independent（全部） | **1；单批260/258绿/2既知M5红/0skip**。SelectionModel未导出，两项均保留、不放宽或跳过。此前257批次亦归档 |
| 原Python结构门禁；TS test:schema；生产C++重放 | **0；Python655/655、TS655/655、C++654/654**；TS额外默认归一化27项、无缺失公开方法 |
| 严格公开client-contract.ts；generate_cpp.py --check | **0**；C++生成195定义/27登记定义零差异（不是宣称可观察Core注册表全集） |
| 自有官方固定donor GCC13.4/Ubuntu24.04 image、全新volume，优化ASan+UBSan/observer全重编 | **0**；所有对象重新编译，137个Slang TU同样插桩；完整构建1267.85s |
| 同产物原source_sort -R/-V隔离执行 | **0；2方法、3411168断言、5.16s**；原600秒、RUN_SERIAL、-O2/ASan+UBSan/observer/-Werror/source SHA全部核对 |
| 同Linux配置完整ctest -j2 | **0；79/79，123.60s**；不是只跑source_sort或新raw目标 |
| B非计时sanity，同源/flags，GCC13.3与13.4 | **13.3退出1，4096/65536；13.4退出0，65536/65536**。B使用64字节局部数组，不冒用A/C不同探针的8192数字 |
| 新涉及JS/Python/C++格式、ruff、Prettier、diff空白 | 最终**0**；C++用clang-format23.1.3明确LLVM/4空格/100列/指针左侧。没有宣称仓库已统一ESLint或SV formatter |

native配置M3/FUTURE ON，优化observer OFF、Debug/优化sanitizer ON；HIER_BUILD_EXPERIMENTS
显式OFF（所有B配置相同）。Linux用GCC13.4.0/CMake3.28.3/aarch64；native AppleClang17、
CMake4.0.2/macOS26.0.1/arm64，Node24.21.0。Schema专用venv Python3.13.3；部分CTest默认
解释器为FindPython3选定的3.12.10，不能混写成全套都用3.13。

Linux image hier-b-ci:ubuntu24.04-gcc13.4-m4-closeout，由固定Dockerfile自行构建；
官方GCC donor manifest3617a214…，Ubuntu base534baea6…；第三方toolchain layers复用缓存，
内容ID2107812c5ff57e883f86cac13a4e80abf21b6c5b0dd4d109051c069a4a81f0ca与A工具链相同，
不包含借来的A产品。全新B volume hier-b-m4-closeout-gcc13-4，2CPU/5GiB；六个只读
第三方源码HEAD/干净状态均校验。Source_sort二进制SHA
**a25b13cf2d6fe5040a18593166ca60b12a4c09a3894bb938b54e7339e6d8ffed**；
hier **1a152fbb23df006046a57f59126fde7dc4bbd1906f701482486aee2dad5e80cc**。
旧13.3原600秒失败保持于[b4d2c47报告](M4_B_CORE_REVERIFY.md)，不是同binary由红变绿。

## 失败、警告与装配纠错

B测试树自身尚是旧SDK模板，误在该树直接执行新ID文件两次均模块加载退出1、未进入13语义
方法；一次完整复现归档，不报成13功能失败。实际a7/532 baseline均另用自有真实SDK执行。
首次metadata把README也当运行时、BWireReplay字节差异直接当错误，退出1；随后仅排除文档，
保留已审空白例外，82代码/声明和原oracle核对成功，没有改生产或隐藏差异。
首次C++风格检查退出1，3536c98仅空白排版；公开sanity两编译器执行绑定排版前sourceSHA，
不谎称对新源码/新binary再跑。投影检查加强精确类型后正例0、专门负对照1。

native完整build.log各有6条duplicate libraries链接警告；旧B6b完整/部分历史日志已出现
同类警告（历史release日志本身工具截断，未拿它证明完整警告数量）。配置日志保留mimalloc
说明及未用MIMALLOC override警告，Linux本次compile日志无编译warning；不概括为整个任务无警告。
初步证据摘要提取一次把巨大JSON行打印到工具导致展示截断，随后只提取短摘要；原gzip档案
完整且独立验证，不拿截断展示写入证据文件。其他只读命令路径/旧日志解析错误均未改oracle。

## 验收边界与交接

本单元无产品/API/ABI/IPC/Schema/配置/旧工程格式变更，只有独立测试、手写fixture和证据。
首版无会话持久化，保存/恢复/旧工程加载迁移不适用；GUI/Electron、M5 DOM/ARIA/M6画布/Worker、
真实nx9000/openc910资源回归、远端CI和候选jsoncons新GCC编译本轮未执行。
Linux无sanitizer优化/Debug两个完整配置未由B本轮重跑；不能借A/C的三配置替为B执行。
M0实验目标OFF不是这些历史技术假设的新验收；M4整体状态仍由日志/协调角色决定。

交A：原样吸收5ad7baa/30a5ac0的两个ID文件与RTL fixture，将原242 M4 runner补成258，
以标准门禁确认集成，不复制SDK实现；现阶段手工258和glob260确实已由B执行。
交C：核对两个fresh控制、参数/缓存/取消/新连接oracle、真实Transport只观察转发的边界；
ID耗尽code/data未规范化项单独保留。C-67～69仅研究报告纠偏关闭，不改变候选红/许可条件。
B本轮未发现新的生产语义缺陷；不代C关闭意见、不把D-03/M5/M6或整M4写成已完成。

2026-10-13勘误：初稿两处手工汇总83应为82。原机器证据metadata_frozen_audit_final自始为82，
已排除frontend/SHARING_VERIFIED.md与client/README.md；逐blob一致结论、测试、50份gzip和SHA未变。
原e8d9e68/db55d190报告作为历史提交保留，本次只纠正文档计数，不重写原日志/命令结果。
