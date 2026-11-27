# B36：跨页同值原行动作冻结与 C-97 独立红绿

## 结论与固定对象

本轮仅新增候选组件的六项跨页专项，累计78计划DOM/30历史类型用例仍属部分冻结。生产组件/CSS未提供，六项DOM均0执行、6blocked、0skip，不能据设施通过宣称UI或M5完成。
C-97独立32输入先冻、原基线16通过16失败；仅修两份B核验器的main识别后32/32、旧16 CLI回归16/16。C-96已由C关闭；C-97仍交C复核关闭，B不代关。

| 对象                               | 固定SHA                                  |
| ---------------------------------- | ---------------------------------------- |
| A35产品P                           | 9958f0e140b27304f5305a3b67da4ad7f62fe96c |
| B初始                              | 7e07d98cbffeb3fbc87e3db6c1662f3b1a713a0d |
| 六项跨页输入/断言/fixture/计划首冻 | a6819375b5bc03f6df9c21a7855dfd22d4c4fae8 |
| C-97 32项导入/真正CLI输入首冻      | e655f8b8402aa059d42e804473d0edf3bb8f13d8 |
| C-97最小设施修订                   | 97b7dcd385d02ba52c70386969412dd6b135e36f |

B分支test/m5-tree；证据提交SHA见REVIEW_LOG最终交接。本报告不回改首冻计划的待办或预期。
独立依据为DESIGN §6.18.1–4/§6.17及公开接口；只用A固定SHA/交付范围，不读其实现、探针、自测或聊天生成oracle。
DESIGN原387789字节，SHA256 6c7493ea6a71f651dc9618bb66635a1a27a28a8a32f81741041343091cbb4aeb。

## 验收输入、预期与判断依据

两页各两个值完全相同的合法命中，挂载前由宿主完成两次真实查询。每个显示行使用原page/页内itemIndex及其原action；不能按ref去重、使用flat index、克隆page或同值错误action。
四个tuple各签发一次，但签发时间顺序不属于契约；Node/浏览器使用不同合法顺序作正控。

| 用例 | 输入                                           | 预期及依据                                                   |
| ---- | ---------------------------------------------- | ------------------------------------------------------------ |
| M01  | 两页四个同值行，仅挂载                         | 显示四行、四个原tuple/action、零确认/额外查询；§6.18.1–3     |
| M02  | 第三行可信鼠标click                            | 仅确认第二页index0原action一次，不能用flat index2；§6.18.3–4 |
| M03  | 第四行AT形状程序化click                        | 仅确认第二页index1原action一次；§6.18.3–4                    |
| M04  | 第一行可信Enter down/up                        | down后up前确认第一行原action且阻止默认，up不再确认；§6.18.4  |
| M05  | 第二行可信Space down/up                        | 同上使用第一页面内index1，up不再确认；§6.18.4                |
| M06  | 同状态className重渲染，第二行ArrowDown到第三行 | 原绑定不变、只改变本地焦点、零确认；§6.18.2–4                |

逐项可执行输入/预期/basis在multipage/cases.mjs；14 Node设施含库存、合法任意签发顺序、八项错误断言拒绝、三个真实模型前提。
浏览器8项为四个真实模型原action确认与四种原生输入前提，并无替代候选UI。用真实SDK/Navigation/Selection/Transport及既有B公开透传观察器，不伪造state DTO。
宿主预加载Promise由宿主消费，不记作UI消费；不读取then、额外catch或引擎hook证明Q1。键盘检查在down派发后up前，不扩称同步事件栈内完成。

C-97独立验收为“程序化导入无执行/额外输出，真正CLI必须核验有效档并明确拒绝无效档”。每模块12导入正例（real/alias × -e/--eval=/stdin × 消费者带/不带--archive）及4直接CLI正反例，共32。
消费者argv1等于现存模块路径仍仅输出loaded；无效消费者archive不得使import核档或失败。watchdog仅为测试设施15秒上限，不是产品超时契约；没有skip/xfail或改预期取绿。

## 本B实际运行

E=/private/tmp/hier-b-orch36-multipage.sqZfmC；P=E/fixed product 中文（独立detached）；B为本测试worktree。
Node24.21.0/Darwin arm64，Chromium156.0.8078.4。模型命令显式HIER_B_PRODUCT_ROOT=P；浏览器另HIER_B_BROWSER_TOOLS=P/web；PATH固定npm-global/bin、Homebrew、系统目录。
实际argv/cwd/退出/耗时/完整合并stdout+stderr均在归档；来源审计82条只读命令为分离双流，共164流。合并流不伪称独立双流；这些是本B及既有B助手的实际执行，不把A/C探针算B。

| 实际命令（路径缩写不改变归档argv）                                           | exit / 结果                                                                                              |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| git worktree add --detach P 9958f0e；P/web npm ci --offline --ignore-scripts | 0；0，锁定工具，无生产依赖变化                                                                           |
| P中npm --prefix web run typecheck -- --force；P/web npm run check            | 0；0，生成196定义/27方法、TS/54模块182依赖/7层负控；不是完整web/check.sh                                 |
| node --test --test-reporter=tap multipage/facility.test.mjs                  | 0，14/14                                                                                                 |
| node multipage/run.mjs --controls                                            | 0，8/8非候选UI前提；cleanup errors/unhandled/releaseErrors空                                             |
| node multipage/run.mjs                                                       | 1，planned6/executed0/passed0/failed0/blocked6/skip0，缺SourceCandidatesView及CSS                        |
| node --test --test-reporter=tap imports/cli-import.test.mjs（修前/修后）     | 1，16pass/16fail；0，32pass/0fail。输入先提交e655，再改设施                                              |
| node --test 同一冻结测试（固定旧P入口回放）                                  | 1，16pass/16fail，旧源码字节不改                                                                         |
| node --test 同一冻结测试（移除native main单行的fallback分支回放）            | 0，32/32；仅在Node24强制分支，不是原生Node20/22验收                                                      |
| node --test --test-reporter=tap pagination/release/cli.test.mjs              | 0，旧16/16，含真正CLI有效/无效、别名、stdin/eval、inputs拒绝、自检/控制非空输出                          |
| P中actions/verify-evidence.mjs --inputs；--verify-controls旧B35控制档        | 0；0，只核历史固定P元数据，不是新产品执行                                                                |
| B中actions/verify-evidence.mjs（不带--inputs）                               | 0，旧B35的68捕获/45材料元数据有效                                                                        |
| B中actions/verify-evidence.mjs --inputs                                      | 1，16759不等于历史pin16565；授权修订后的预期拒绝，不改旧pins取绿                                         |
| B中pagination/release/verify-evidence.mjs --inputs                           | 0，旧B34五输入未变                                                                                       |
| node E/runtime.mjs；来源审计                                                 | 0，首冻八文件不变/P生成49声明与M字节相同；82只读命令/164完整流/九组B→A导入patch/raw/blob与最终16路径同源 |
| node E/protect.mjs --protect（首次post-run/等待check后）                     | 1看到并发层检查临时__layering_probe__.ts；0按原条件重验。前者属B验证时序，不是产品回归                   |
| Prettier新证据设施首次/修正后                                                | 2，E/seal.mjs括号语法错误；0，已修复仅封档脚本并保留原失败。冻结业务输入无改动                           |
| Prettier --check新增冻结及授权设施；git diff --check                         | 0；0                                                                                                     |
| node E/protect-authorized.mjs                                                | 0，其余3355原普通路径byte/mtime、49声明/3 Core/锁/日志前缀不变，仅两份旧B入口精确授权                    |
| node E/seal.mjs；node multipage/verify-evidence.mjs --inputs；--self-test    | 0；0；0，完整便携核档、1正6负元数据对照；不执行当前产品                                                  |
| node --test --test-reporter=tap multipage/evidence-cli.test.mjs              | 0，8/8，real/alias × 有效/无效/自检/eval携模块argv及无效消费者archive                                    |

完整TAP的fail/cancel/skip/todo、浏览器JSON及非零诊断保留。六种非零捕获不混为六项产品失败，也没有丢弃基线红、保护时序失败或封档设施错误。

## 最小修订、历史绑定与保护

只给两个旧B核验入口增加native import.meta.main优先及eval/print消费者的旧Node fallback排除，再沿用realpath；verify/selfTest/历史inputs校验/归档/业务测试预期不变。

| 文件                                   | 原bytes / SHA256                                                         | 新bytes / SHA256                                                         |
| -------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| pagination/release/verify-evidence.mjs | 16565 / 7273b685996dbc61178a0721a87972aebb21050d803b3abf7582ef50ae518933 | 16759 / 025a56b461704a924b32233914623faec7952683b81a985b01980b4d6fad9198 |
| actions/verify-evidence.mjs            | 20640 / 0ecc1eb9caefd481851fc4ff2fec6f0d1226a35acbc30a374627741fc0dc298c | 20834 / d87fb1e6e597d5f2785a862c8e0556221e8e1b3b3deac3af38d5c5573c4fd4b8 |

M1260/B855/P1242原普通路径中恰两份旧B核验入口授权；其余3355 byte+mtime严格保持。精确旧/新mtimeNs在authorized-verifier-changes材料。
M49声明/3普通Core二进制及P package/lock保持；P源码clean、M暂存为空。原日志前2560705字节SHA256 9eb97b4ead8e0f52ef10f269a8243daa36748d5c62fe857b71fcddac9265931f保持。
旧72 DOM/30类型/模型helper/历史档和pins未改；M3-coordination/research、旧工程/ref/设计输入未写；日志只追加不提交。
无生产API/ABI/C++结构/IPC/Schema/protocol2/schema7/依赖/配置/工程格式变化。首版无持久化，工程保存/恢复/旧文件迁移不适用，不自行增加实现契约。

## 便携证据与交接

归档docs/m5_b_multipage_action_identity.json：5612856字节，SHA256 0649b26e60b9d930827f400e6ece8da98fc640b93431b09fcc31aa8aab35886d。
41完整捕获/33材料/12输入pins，包含九组B来源的完整opaque patch/双流、初始保护、两入口旧源码/授权、新冻结源码、回放准备/封档脚本及DESIGN；不是只给临时目录索引。
后封回执另存docs/m5_b_multipage_action_identity_controls.json，不递归修改归档。核验器只核历史元数据，不声称又跑一遍产品。

Q1仍open；原Promise实际组件消费、同Reply新链/旧pointerdown重绑/旧闭包、读取/通知栈/未提交render、完整生命周期/焦点滚动/包外/真实Core UI等差额不借本次关闭。
未跑Core构建/三配置CTest/ASan、确认/属性全集、旧DOM/30类型全集、完整web/check.sh、Electron/原生IPC/跨平台/M7/远端CI/性能与并发压力。Node20/22未安装；Homebrew23.11不在支持范围，未据此宣称兼容。

- 交A：按a681937、e655f8b、97b7dcd及本轮证据提交原样导入B文件；不要更新历史档pins掩盖范围变化。B35需要固定旧P核inputs或仅核元数据，不能把导入行为当产品/UI通过。
- 交C：按固定B修订复核C-97与32红绿/旧16回归/native与fallback边界，由提出方关闭；本轮新六项仅跨页部分冻结。无需重开已关闭C-96/C-95/Q2。
- 交协调器/D：本轮到此完成；Q1/完整组件前置未齐，D无新任务/D-03仍M6；M5/旧树L06/L09–11/Electron未完成。没有新会话/定时器或跨会话投递，不接管ACD。
