# B renderer 1087f78独立复验与C-82/C-83补冻

## 结论与固定点

**1087f78不放行。** 原冻结99/16及既有1195回归通过，但本轮独立补冻C-82的25项实际5通过/20失败/0skip，
随后C-83独立12项实际4通过/8失败/0skip，关闭后send直接抛其它诊断code，违反关闭分类。
分别确认foreign误关/覆盖首因及closed-send分类两缺口；原集合绿不覆盖这些新边界，两意见仍由C关闭。

| 固定对象                            | SHA                                      |
| ----------------------------------- | ---------------------------------------- |
| 产品                                | 1087f78c19cb4e3400bb4093c575b51144c9c7e6 |
| 原99/16冻结                         | c99143c5baff94fbe1f41a5c3da77a0b70f475e9 |
| 历史缺出口基线/B本轮起点            | 7e96134aa4271729ebae7b6573bce124193b0484 |
| 本轮C82独立输入冻结（先提交再执行） | d3d69d60233f173bd6f77bda4c368606dc0b00d3 |

本轮C83独立输入冻结：**ee7561e9335bc4e1699cf88bf6000156d9822c79**，同样先提交再实际执行。
任务B-ORCH-3-RENDERER-RECHECK-01；cycle3 token dft-orch-3-b-59118b25-3f3e-4ff3-9932-bfebb0a6e8c3。
oracle为DESIGN §6.8/§5.6.2/5.6.5、公开声明、B原fixture。未读A实现/diff/新增自测来形成预期；
已读共享交接摘要，不声称严格盲测。C-82公开问题是线索，C探针未读/未借执行结果；本报告数字均为B实际执行。

## C-82验收条件、输入与结果

新增目录`web/tests/independent-electron-renderer/c82/`，`run.mjs --list`逐项列输入/预期/依据，原99/16不改。
Bridge可控输入仍只是真实公开renderer工厂的单元边界；SDK为真实公开HierClient，不是假Transport或Electron。

| 输入分组（均在connect结果前经本次callback到达）              | 正确行为/规范依据                                                                         | 本轮实际                                                             |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 另一id的frame、version7、未知kind、json错类型；当前未关闭    | foreign事件零影响；当前id应可ready→roots，不能被额外close/release。§6.8.3                 | 4项失败：当前领取被错误close                                         |
| 上述4类foreign事件×当前正常/异常首因×foreign在当前close前/后 | 正常undefined或原诊断不变；不因foreign改变工厂/ready/自己的IPC调用。§6.8.3、§5.6.5/§6.8.4 | 16项失败：undefined被替换或document_navigated被invalid_ipc_frame覆盖 |
| foreign closed的对应5种情形                                  | 忽略foreign，只按自己id的状态；同样规范                                                   | 5项通过，为隔离/首因正向对照                                         |

共25输入，全部实际进入语义阶段；闭合20项各有无foreign控制和插入foreign变体。
成对关系直接来自“其它id事件丢弃”，不是把控制端实现输出选为绝对正确答案；两端各自仍需保持闭合/不能ready及已知异常诊断。
BER-Q01未唯一规定工厂Promise返回closed Transport或拒绝，本测试接受两种合法形态，但插入foreign不能改变同一合法领取的结果。
Q02精确坏原JSON reason、Q03声明外桥异常/id格式也未据A实现补定。
本次20失败均非watchdog或cleanup错误；finally仍清自有SDK/Transport，外层核Bridge登记归零。

## C-83独立关闭发送分类补冻

依据同一DESIGN §6.8.3/§5.6.5的关闭优先规则及公开ElectronFailure允许的code/origin，新增c83目录12输入，
逐项枚举正常关闭、已有transport_closed诊断及not_ready/client、protocol_error/client、not_found/core、bad_request/core，
各覆盖已绑/未绑接收者。send必须始终transport_closed/transport、Bridge零发送，原onClose正常undefined或DTO诊断不变。
在独立冻结ee7561e之后执行：正常/transport诊断4项通过，其余4诊断×2状态8项失败，错误仍是各自原code而非transport_closed。
这不是SDK ready/pending已知失败的扩大，也不要求把普通Core响应转成关闭；真实preload尚未实现的产生概率不影响当前公开接口正确性。
未读C探针或A实现来定预期；8失败无watchdog/cleanup错误，原99与C82的25未改。

## B实际命令、环境与范围

P=`/tmp/hier-b-orch3-renderer.iRHIDr/source`（独立fresh detached固定产品），T为B自有test/m5-tree。
Node24.21.0、macOS arm64；PATH前置`/Users/jiangbowang/.npm-global/bin`。
产品门禁cwd=P；单独B renderer/C82/审计入口cwd=T且显式`HIER_B_PRODUCT_ROOT=P`。
Core回归显式`HIER_BIN=P/core/build-b-review/hier`；Schema最终显式`HIER_SCHEMA_PYTHON=/tmp/hier-b-orch3-renderer.iRHIDr/schema-venv/bin/python`。
详细argv/cwd/UTC/时长/退出和完整原始输出存机器档，包含环境红与新语义红，不只存通过摘要。

| 实际命令                                                                                                                             | 退出/结果                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `npm --prefix web ci --offline --no-audit --no-fund`；`npm --prefix web run check`                                                   | 均0；锁定71开发包、四包TS/生成/分层/违规探针，无锁变更                                                              |
| `cmake -S core -B core/build-b-review -G "Unix Makefiles" ...`                                                                       | 0；RelWithDebInfo，M3/FUTURE ON，observer/sanitize/experiments OFF；六份第三方只读源码FetchContent路径固定          |
| `cmake --build core/build-b-review --target hier -j 4`；本树`hier --version`                                                         | 均0；81.84秒自有全新Core/第三方编译，0 warning；protocol2/schema7/slang12/fast                                      |
| renderer原`run.mjs`                                                                                                                  | 0；99/99、0skip，包含15真实SDK输入，不另加总                                                                        |
| renderer原`verify-types.mjs`                                                                                                         | 0；真正公共正例0诊断，16真实语义负例拒绝；未用proposal alias                                                        |
| renderer原`browser-gate.mjs`                                                                                                         | 0；13模块bundle、无Node realm加载/工厂导出形状；未在该realm调用工厂，不是Electron                                   |
| renderer原`facility.test.mjs`/`verify-fixture-schema.mjs`/`verify-evidence.mjs`                                                      | 均0；7设施、2正2负Schema KAT、旧22捕获/10pin历史红完整性，均非新产品语义                                            |
| `npm --prefix web run test:independent`                                                                                              | 0；原810 + 属性281 + Core5 + renderer99 =1195，全部通过/0skip；包含属性22和renderer16类型检查，不把类型加进运行总数 |
| `npm --prefix web run test:independent:m4`                                                                                           | 0；原268/268、0skip，含旧声明/共享10及自有真实Core回归                                                              |
| `npm --prefix web run test:independent:m5`；`...:m5:tree`                                                                            | 均0；241/241与287/287、零skip，含各自实际公共类型消费者/负例；与1195重叠，不重复加总                                |
| 初始Python环境探测；初次`npm --prefix web run test:schema`                                                                           | 均1；所选Python缺jsonschema，未执行Schema corpus，不是产品655语义失败                                               |
| `python3 -m venv <本轮schema-venv>`；该python `-m pip install --disable-pip-version-check -r protocol/schema/tests/requirements.txt` | 均0；锁定既有隔离工具，jsonschema4.25.1；无生产依赖修改                                                             |
| 指定本轮venv后同一`test:schema`                                                                                                      | 0；655/655、0skip、27参数归一化、缺失方法0                                                                          |
| C82 `facility.test.mjs`；`run.mjs --list`                                                                                            | 均0；2输入设施控制/25枚举，先于冻结与产品执行                                                                       |
| C82 `run.mjs`（冻结后）                                                                                                              | **1**；实际25，5通过/20失败/0skip；确定的C-82实现红                                                                 |
| 本轮`review-1087f78-provenance.mjs`初/终；资源/配置检查                                                                              | 均0；固定版本与旧源/原始枚举保持；未见本树自有Core进程遗留                                                          |

C83实际命令：同样cwd=T，`node web/tests/independent-electron-renderer/c83/run.mjs --list`先退出0，
冻结后显式产品根执行同入口去掉`--list`退出1，12项实际4绿8红、0skip；输入枚举/输出完整保留。

独立Core二进制9324536字节，SHA256 `b16e232f26728620f732e70b57f1321b8fdad2ae0971872b00d1d1bb9667b94e`。
Slang v12.0/Catch2 v3.7.1及fmt/mimalloc/boost_regex/tomlplusplus六源码Git版本和clean初终一致；
编译仅复用源码，未借用主树或C/A产品二进制/对象。Core及protocol/schema树对象与782c599逐字相同，
因此本轮只为真实SDK回归构建优化hier目标，未跑Core CTest/Debug/ASan三配置，不冒称完整check.sh或里程碑放行。
进程扫描/登记清理不是普遍无内存泄漏保证。

## 保护、证据与交接

509份原B跟踪文件原样，144份旧B输入与固定产品相同；renderer原15份交付字节相同，原99/16枚举逐字对历史档。
产品751文件、主树750非日志跟踪文件匹配固定SHA；18未跟踪文件初终hash相同，领取前日志前缀保留。
来源审计只hash字节/核Git出处，不读取生产实现来建立oracle；C82新4源与C83新3源另pin，未重写旧能力红、140/48/C81或属性历史。
只新增B输入/计划/报告/证据/核档工具，主树仅追加REVIEW_LOG且不提交；无生产/API/ABI/IPC/Schema/工程格式/锁变更，迁移不适用。
只读路径探测中，旧B无AGENTS、旧依赖glob及最初猜错的属性目录无匹配；没有启动测试，不计产品失败。

机器档`docs/m5_b_renderer_1087f78_review.json`与`c82/verify-review-evidence.mjs`保留/核验32条实际捕获、17份原/新冻结源pin和红绿分类；
核档工具本身不运行产品，也不关闭C82/C83。完整归档统计见REVIEW_LOG最终交接。
机器档186118字节，SHA256 `a45131e0f8d59a19105c6312cecce5f66f8bcdd0c733f3695fc9435bac486d13`；
32条完整命名捕获共377976原输出字节/66781 gzip字节。实际核档退出0，17pin/红绿/枚举验证通过；最终Prettier及diff空白检查0。
报告补写C83时一次补丁因Prettier表格空格导致上下文不匹配而未应用，按实际本B文档重定位后补写；未改产品或冻结输入，不计产品失败。
交A修C82/C83后交固定SHA；保留原99/16、1195回归与本25/12，不通过修改期望/skip取绿，标准门禁对应接线另由A实施。
交C按实际固定修复复核关闭；本B证据确认两项，不代关，BER三窄点不因旧99绿或本补冻自动关闭。
Source已获审但本轮未冻结，main/preload/真实contextBridge/窗口权限/导航/崩溃/进程回收/Electron→Core E2E仍须各自独立输入与执行。
L06/L09–11、生产UI/AX、M7、Linux/远端CI及完整M5不在本结论范围；未读取A新增10自测作为oracle或B执行。
本协调器token交接后结束，不新建会话/定时器、不恢复旧B监控、不向A/C/D会话投递消息、不执行旧ack。
