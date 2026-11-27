# B31：源码候选确认运行时独立复验

**限定结论：固定16b18a0a8a994291b275083ac7d389930f894878通过本轮B独立测试。**
原121行为/37公开类型、新Q1六项/真实Core八项、标准完整web独立入口均实际通过；不是M5/UI/Electron整体放行。
C31已由提出方关闭C-94、接受Q1补文/运行时并核对新增B输入，无新C阻塞；C执行不计作B证据。

B起点05047bf9fd98b1a93b40cccd69499c8ca40df2d3；
新冻结 **bb3428ce324dbd3cc48f280aa8954c5c87374941**（7新路径/742行）。
原0a83e08的11冻结输入/05047bf历史档/questions.mjs保持原样。报告/核档器另提交，不改18份新旧oracle输入。
规范DESIGN §6.17：371090字节/SHA256 fa6f4f47cc7003092c793ed1f78d03fd08bbc23f957d2b34e5fe0fd5b7444065。

## 独立验收与初始基线

输入/预期/依据在原cases+boundaries/types及新recheck/q1/core；依据规范、旧B HDL、公开接口，不读取A新增运行时/自测源码或用A自报结果生成oracle。
已读取A交接与计划用于定位固定对象/范围，不能将其中实现说明作为行为依据。

Q1原3 SDK点×2方法独立补冻：source/resolveSource同步起步拒绝reentrant_change；
obj.source答复后readSource异步续步无其它保护时create为not_ready、伪confirm为invalid_action。
真实旧模型三个透明公共SDK观察点证明输入栈前提，不把pending当重入；本B的B30-Q1由补文+6实跑闭环，历史问题文件不重写。
旧8fdc91a73fedaaa889d795928489363640df7588在同冻结代码上能力基线退出1：Q1 0/6、Core 0/8且全blocked；
原121/37也分别缺方法/缺导出，0语义执行。不是原基线121/6/8条功能断言失败，更不是通过。

真实Core八输入为旧B refKind HDL plain/macro×shared/per-instance×pageSize1/200：
公开children/def/procs/source元数据独立得到五地址，不从source.resolve候选推地址类型；逐项原ref/def映射、
同链追加保留、真正页链/文档重启失效、原Selection历史/同身份no-op、无确认wire请求或导航发布、借用client存活、
八Core进程退出0及八生成fixture目录回收均有断言。
八场景共80次同步确认调用（每页1场景12次、200场景8次，**含同身份no-op，不是80次选择状态改变或80个新增测试**）。
该链为SDK→Node→Core→Nav→Selection，不含React/Electron IPC。

## 实际命令、目录与结果

Node24.21.0/npm10.9.2/Darwin25 arm64；
B=/Users/jiangbowang/MOI/2025/dftartist/2026.9/dft_hierachy-test-m5-tree；
P=/private/tmp/hier-b-orch31-confirm.rtozcJ/fixed product 中文；
O=/private/tmp/hier-b-orch31-confirm.rtozcJ/pre-implementation；
E=/private/tmp/hier-b-orch31-confirm.rtozcJ。
R=web/tests/independent-source-confirmation/recheck，N=其父目录。
完整argv/cwd/env/退出/耗时/完整输出在档；下表产品命令显式HIER_B_PRODUCT_ROOT=P或O。
outer stdout_*是合并stdout+stderr，utc是结束；助手内层18命令分离双流。
标准web的schema Python复用既有只读venv，实际绝对路径在捕获argv；未冒称新建独立工具环境。

| B实际命令                                                                                                                                                                                                                                   | 退出及证据                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| git worktree add --detach P 16b18a0... / O 8fdc91a...（主树）                                                                                                                                                                               | 均0；各自固定目录，不借主构建                                 |
| npm ci --prefix web --ignore-scripts（P/O）                                                                                                                                                                                                 | 均0，锁不改                                                   |
| npm --prefix web run check（P） / run typecheck（O）                                                                                                                                                                                        | 0，196定义/27方法、TS、53模块/175依赖、7越层反例              |
| cmake -S core -B core/build-b31 -G 'Unix Makefiles' -DCMAKE_BUILD_TYPE=RelWithDebInfo -DCMAKE_EXPORT_COMPILE_COMMANDS=ON -DHIER_SANITIZE=OFF -DHIER_TEST_OBSERVER=ON -DHIER_TEST_M3=ON -DHIER_BUILD_EXPERIMENTS=OFF（P，另6只读SOURCE_DIR） | 0；实际完整argv在档                                           |
| cmake --build core/build-b31 --target hier -j 6（P）                                                                                                                                                                                        | 0 / 92.189秒；新自有目录冷构建hier，非全Core测试构建/非三配置 |
| node N/run.mjs（O）                                                                                                                                                                                                                         | 1；121planned/0executed/121blocked/0skip                      |
| node N/verify-types.mjs（O）                                                                                                                                                                                                                | 1；正例缺导出、37负例0执行                                    |
| node R/run.mjs（O） / --core（O）                                                                                                                                                                                                           | 各1；0/6、0/8，全blocked；冻结后同源码又核两能力门禁          |
| node N/run.mjs（P）                                                                                                                                                                                                                         | 0 / 0.294秒；121/121、0失败/blocked/skip                      |
| node N/verify-types.mjs（P）                                                                                                                                                                                                                | 0 / 11.137秒；正例0诊断、37逐项语义负例                       |
| node R/run.mjs（P）                                                                                                                                                                                                                         | 0 / 0.356秒；Q1 6/6                                           |
| HIER_BIN=P/core/build-b31/hier node R/run.mjs --core（P）                                                                                                                                                                                   | 0 / 2.507秒；8/8，所有进程/fixture清理断言通过                |
| node --test N/facility.test.mjs（P）                                                                                                                                                                                                        | 0；原6设施，非确认运行时计数                                  |
| node --test R/facility.test.mjs（O）                                                                                                                                                                                                        | 0；7设施，含栈前提/输入/双故障和可控deadline，非产品取消/性能 |
| HIER_BIN=P/core/build-b31/hier HIER_SCHEMA_PYTHON=<既有venv> npm --prefix web run test:independent（P）                                                                                                                                     | **0 / 217.642秒**；完整标准web链，输出1040497字节，零跳过     |
| node R/verify-evidence.mjs --inputs                                                                                                                                                                                                         | 0；41捕获/96材料/18现场oracle，只核档，当前产品0执行          |
| node R/verify-controls.mjs                                                                                                                                                                                                                  | 0；1正/8负元数据回执，当前产品0执行                           |
| Prettier新文件check、git diff --cached --check、node E/protect.mjs --protect                                                                                                                                                                | 0；保护细节见下                                               |

原121直接/标准各运行一次，不累计成242个覆盖；37同理。
标准入口中的A作者Q1六/真实Core二是B实际执行的补充接线回归，**不是独立B oracle**；独立Q1/Core仍以本B6/8为准。

## 完整web分项与边界

从完整输出逐个解析36份有kind的机器报告和9个Node测试摘要，而非只信退出0：
首组810/810；source document306/类型34/Core14/精度4；
candidates281/类型47/Core13；point258/类型32/Core11；navigation310/类型46/Core10；
SourceView DOM89+Q1Q2 19+scale9、位置交互119、类型28/42、外部tarball消费6/2；
refKind类型40/SDK23/Core24；确认121/公开37均通过。
此外renderer99/C82 25/C83 12/BER40+6及原identity/属性/树/选择等标准步骤实际经过，完整原输出保留。
上述不同层/类型/子集不混合相加。Node摘要依次810/13/8/5/3/36/4/12/2均pass=tests、fail/cancelled/skip/todo=0。
最后12为B6设施+A6，最后2为A Core补充；不是额外B独立确认用例。

SourceView两份控制报告planned89/19、executed0/passed0是明确设施，不计产品通过；
其它明确业务报告按真实执行数核对，所有本轮相关通过没有skip/xfail。
这些既有浏览器/renderer回归不能替代新候选UI/键盘/Electron main-preload-IPC链。

## 首设施问题与来源保护

冻结前只读审查修正B Core设施：外层race不取消主体可能跳过finally，改为Core scope内部deadline后逐项释放；
主体原错误与cleanup原错误分账，后续释放不因前项失败停止，runner显式封存两者。7设施中的双故障/挂起deadline是确定性测试，不以sleep测试产品取消。
这些在当前新增6/8执行前冻结，不根据A实现或通过结果改期望；原Core设施源码保存。

本轮唯一当前非零设施捕获为runtime-metadata：
首把生成的Slang Compilation.cpp算入28个“自有生产”并要求-Werror；真实该项属于Slang目标，27自有生产单元全部-Werror。
仅更正metadata过滤范围，不重编/不改产品、不放宽业务期望；原脚本/AssertionError完整保留，最终metadata0。
其余非零都是实施前能力/类型门禁（含同冻结代码重核6/8），当前产品测试无隐藏红。

自有hier：9327560字节/SHA256 **09be55869499150109dd57eb93a5ebf52213f2a71afd1f439325a2362b3acc48**；
342 compile_commands、27自有生产-Werror，冷构建输出无warning:/error:。49份实际生成声明与主树逐字相同，新增方法不泄露私有brand。
6依赖源码18条只读Git命令校验tag/HEAD/clean、2403文件与B29原pin逐项同hash，仅复用源码，不复用Core编译输出。

内部只读助手18命令均0，机器档604822字节/SHA
b4f3ea41fe1156dffae14a34123a444615dc36735060fca5096527b2275e3fcd已携入。
B0a83e08→A6197d1e、B05047bf→Afd141f9完整path/mode/type/before-after blob delta同；
最后16路径在B/main共32处同源。Core生产77/公开头37/protocol9/generated4/锁4未变；
web生产仅元数据核变更路径，不读取实现生成oracle。声明45同/3变/1新，依赖字段不变。
M1184/B793/P1166/O1161原文件字节**及mtime**保持，主49声明/3旧Core严格保持；B提交后clean，P/O tracked clean。
日志原前2394223字节/SHA25600af4666cda4dc6a6cb8439aeb95d47e51ab8aeebd1064d81cdbe55f2f34b03b保持；
只追加共享日志，不暂存/提交，M3-coordination/research、旧工程/ref保持。

## 归档、限制与交接

主档docs/m5_b_source_confirmation_recheck.json：
**2445292字节/SHA256 53f8fc6cb8717863498d829bdc23c4850370f4ead7cf9f126789c2ed7c7179e9**，41捕获/96材料/18新旧oracle。
控制档docs/m5_b_source_confirmation_recheck_controls.json：
**45501字节/SHA256 81e806681a0272f4c8c486cdd3e3ea6868d88b15bfe0979789cab55e4c5c5fe6**，1正0/8负AssertionError1。
负档正确重封gzip/hash，覆盖原121零执行、Q1 blocked假绿、Core清理失败、类型零执行、原始完整web内Nav零跑而绿汇总、
基线假绿、篡改oracle及M5/全CTest过度声明；非缺模块/ENOENT。核档重读原始完整输出对照汇总，不只看布尔绿。
首39捕获草档原样移E保留（非删除）；固定源码补核旧6/8后最终41捕获。所有首输出不改写，封档后回执不递归写回主档。

交A依次原样导入bb3428c及本报告提交；已通过单元不重复审批/全量，不重开C-92/C-93或C-94。
Q1由本B已闭环，C31也接受补文/输入；C-94已由C关闭，不再待其批准。
可按既定M5路线推进后续单元，保留全部旧冻结和上述范围；B不接管A/C/D、不发其它会话、不新会话或后台定时器。

未执行完整check.sh、三配置Core/ASan-UBSan/native7/208/24或全CTest；本轮只冷建一个hier，Cpp未改的来源核同不能冒称其单测重跑。
内部精确一次select、原异常外壳、弱持有和pending前内部顺序由C静态审查，不凭黑盒独立全证实。
没有Linux/Windows/真实大设计/M7/远端CI或新Electron UI→IPC→Core；首版无持久化，保存/恢复/迁移不适用。
M5整体、L06/L09–11、候选列表/键盘/Electron剩余不因此完成；D-03仍M6。**本B本轮独立复验、补冻及证据交接完成。**
