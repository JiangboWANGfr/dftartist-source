# B35 独立部分冻结与 C-96 设施修订

完成两项 B 工作：原行 page/index/action 与精确激活的八项 DOM 部分冻结；C-96 核验 CLI 入口修订。
没有候选组件交付或产品运行时变更，不能据设施通过放行 UI/M5。C-96 已交修订，**仍由提出方 C 复核关闭**。
A33-B-OBSERVER-01 已由 A 关闭并获 C35 定向复核；C-95、Q2 保持既有关闭，B32-Q1 仍 open。

## 固定来源

| 对象                                 | SHA                                                                                 |
| ------------------------------------ | ----------------------------------------------------------------------------------- |
| 产品 P                               | 54ff2866c174c92212ccf62c5b65d7b537ecf96d                                            |
| B 初始                               | 49853d988fd60dc58869c25e33e37a6765d63f63                                            |
| actions 首冻 / 设施纠正              | fea9ebd17bb72166d0b6e59c9da0f2fb406cdf5c / 8a3bd0ad6efad897c354516cd2ae1b30ee977894 |
| CLI 首冻 / tmp canonical 分类适配    | 325f28a1d338f1156432ba08a7022a20b6d2dfd3 / 030d47eceaf7a9ed5b921dec6573eb3228a14e28 |
| CLI 别名首修                         | feeead2d8ff4b7fb4315e7605499078e2acf477f                                            |
| stdin/eval 四项定义 / 导入保护修订   | f792a7abdd59317602d0288c2bd0595a00d63dd8 / 27ed9f7e9d893b5599fa0196d51cf8d8402f19b3 |
| CLI 测试顶层注册适配，最终可执行集合 | 0fd82ec03af7009d2a830cc211d5b4b4c1a30773                                            |

按提交顺序作为一组导入，再运行最终集合；**不要单独运行 f792a7a 的递归注册错误版本**。
首版、所有设施失败/修订及原始输出均保留；最终报告提交 SHA 在 REVIEW_LOG。
本 B 未读取 A/C 探针源码、实现或自测预期生成 oracle；最新问题标题仅为触发线索，依据仍是 DESIGN/既有门禁要求。

## 需求、覆盖与纠正

八个输入见 actions/cases.mjs 的 input/expected/basis，依据已审 DESIGN §6.18.1/3/4 与 C32 已接受调用透传范围：
双行各原 page/index 签发、稳定 rerender/焦点不重签、主指针/独立 AT/Enter/Space 恰一次确认原 action+原 Selection，
准备微任务前 pointerdown 捕获不可用不得偷换新 action，以及 pointercancel 后独立 AT 使用当前绑定。
键盘在 keydown 分发后、keyup 前核一次确认与 defaultPrevented，之后再核无原生额外激活。
两项 pointer 边缘明确为 synthetic，不声称真实触笔/触摸平台或辅助技术设备验收。

独立设施审查先发现并复现 B35-TF01/02：首版错误要求签发调用 index0→1 时间顺序；配套 click 的 MouseEvent 缺 pointerId。
三项原设施反例为 1 通过/2 失败。按规范改为原 page/index 映射（允许合法反向签发）及同 pointerId/type 的 PointerEvent。
只纠正 A01 detail 的非规范顺序限制；8 个 id/input/expected/basis 相同，其余七条 detail 未改。
旧 64 DOM/30 类型与旧 helper/fixtures 均保持，不把本 B 测试缺陷当产品失败。

C-96 的正确判据来自原门禁：CLI 不因路径别名跳过验证；合法有非空报告，无效归档/输入非零诊断，导入不自动核档。
先冻 12 项再修；首跑 6/6 中“canonical inputs”实为系统 tmpdir 别名，归一化夹具后未修入口为 7/5。
最小修双方 realpath 比较；后发现 stdin 的 argv1='-' / eval 非文件参数会抛 ENOENT，增加 4 项并仅对非文件入口判为非 main。
四项输入先定义于 f792a7a，但错误嵌套注册导致两次运行递归，已定向 SIGTERM；**两次中止不算有效红基线或修后通过**。
注册适配 0fd82ec 在导入保护修订后才完成；本报告不声称这四项可执行基线先于修订。
以最终同一 16 项在独立 feeead2 历史入口复制树取得 12 通过/4 失败，再记录最终 16/16。

## 实际命令与结果

E=/private/tmp/hier-b-orch35-actions.WVnEXb，P=E/fixed product 中文；B=dft_hierachy-test-m5-tree。
A=B/web/tests/independent-source-candidates-view/actions；R=B/web/tests/independent-source-candidates-view/pagination/release。
Node v24.21.0/Darwin arm64，Chromium156.0.8078.4；模型/浏览器显式 HIER_B_PRODUCT_ROOT=P、HIER_B_BROWSER_TOOLS=P/web。

| 实际命令/阶段                                                                      | 退出与结果                                                                                                |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| node --test --test-reporter=tap A/facility.test.mjs                                | 首冻0，12/12；纠正冻结后0，17/17，最终 fail/skip/cancel/todo0；含断言正负与三真实 SDK/Nav/Selection 前提  |
| node A/run.mjs --controls                                                          | 首冻0，8/8；纠正冻结后0，9/9（三真实模型+六原生输入）；cleanup errors/unhandled/releaseErrors空，非候选UI |
| node A/run.mjs                                                                     | 两版均1；缺组件/CSS能力红，planned8/executed0/passed0/failed0/blocked8/skip0                              |
| node --test E/pre-correction.test.mjs；E/post-correction.test.mjs                  | 1，3项1通过/2失败；0，2/2；仅B设施缺陷/修正见证                                                           |
| node --test --test-reporter=tap R/cli.test.mjs（首冻/分类适配）                    | 1，6通过/6失败；1，7通过/5失败，后者均alias五模式                                                         |
| 同12项CLI，首修；固定A旧入口独立复制树重放                                         | 0，12/12；1，仍7通过/5失败，当前产品树未改                                                                |
| stdin/eval新增首轮两次运行                                                         | 均1，因B递归注册错误手动终止，原SIGTERM/取消/输出全部保留；不是16项执行完成                               |
| 最终注册后同16项CLI；隔离feeead2入口重放                                           | 0，16/16；1，12通过/4失败（stdin/eval×real/alias）                                                        |
| P根 npm --prefix web run typecheck -- --force；P/web npm run check                 | 均0，2.669秒/4.778秒，49重建声明与主树字节相同                                                            |
| 固定P的旧B34 release/verify-evidence.mjs --inputs；--verify-controls旧B34 controls | 均0，历史38捕获/24材料/5输入、6回执；纯核档，不把旧执行算本轮                                             |
| E/audit.mjs、freeze-integrity.mjs、protect.mjs；Prettier check及staged diff check  | 均0，来源/期望/原文件保护与格式                                                                           |
| node A/verify-evidence.mjs；--inputs；--self-test                                  | 均0，68捕获/45材料/12当前输入/8初版输入；1正6负元数据控制，无当前产品语义执行                             |

主档 docs/m5_b_candidate_action_identity.json：**2011422字节**，SHA256 **06a0fe8ab11d3f58302539d75cc2fe6d899c9c8512dc08193ee90f551abd1c5e**。
68 捕获含完整 argv/cwd/退出/耗时/合并 stdout+stderr 字节与 SHA，45 材料包括初版/当前输入、历次CLI测试、原/中间入口、保护/来源脚本及快照。
九条非零分类保留：两次缺组件、原设施反例、两次CLI未修、一次固定旧CLI重放、两次中止、一次隔离导入缺口重放。
不是九个产品缺陷，也不把中止/cancel计入最终通过或skip0声明。
封档后回执及新核验器真实/alias/无效/导入CLI控制另存 docs/m5_b_candidate_action_identity_controls.json，不递归改主档。

## 保护、限制与交接

仅一条旧B路径授权变化：pagination/release/verify-evidence.mjs，16343字节/SHA256 f383de46fca24dd48639b3591644daf2c142df68b8ba4f0ec41c5a4ea496d0a0 →
16565字节/SHA256 7273b685996dbc61178a0721a87972aebb21050d803b3abf7582ef50ae518933；只改main识别/删除未用import，verify/selfTest/旧pins不变。
M1244/B840/P1226原路径中其余3309项字节/mtime保持，含M49声明/3普通Core、P锁、研究/协调文件。
日志原2527228字节/SHA256 9565d772919703c9c4a727d2e0236da861d2909db1eedba0ab0693260bd658f8保持，仅追加，不暂存提交。
只读四笔B导入完整patch/raw delta及最终9路径一致，Core/protocol/web/packages/scripts/依赖锁/check.sh生产差异为空。
不写旧工程/ref/设计输入，不新会话/定时器、不向ACD发消息，不代提出方关闭C-96。

无生产API/ABI/IPC/Schema/protocol2/schema7/依赖/配置/工程格式变化；首版无持久化，保存/加载迁移不适用。
未执行Core构建/三配置CTest/ASan、完整web/check.sh、确认/属性/旧全UI/30类型全集、包外/Linux/Windows/M7/远端CI或真实Core候选UI/Electron链。
累计72计划DOM/30类型不等于完整冻结/已执行；本次单页两个索引不覆盖跨页页内下标或同值重复命中动作绑定。
旧pointerdown→重绑、旧闭包/同Reply新链、读取顺序/通知栈/未提交render、生命周期/焦点滚动/完整tarball/真实Core UI差额仍在。
B32-Q1原Promise实际组件即时双分支消费仍open；透传记录/模型/原生设施不证明消费，未使用then改写/无unhandled充证明。

- 交A：按固定提交顺序一组原样导入，全部到0fd82ec后再跑CLI；不要运行有记录的中间注册错误版；保持旧档/hash，不再重复同字节全量门禁。
- 交C：定向复核actions八输入/具体透传与keydown边界、C-96别名/导入修订及所有设施失败分账；C-96仅由C决定关闭。
- 协调器/D：B本轮部分冻结/设施维护完成，完整组件前置尚未齐；D无新任务、D-03仍M6，M5/旧树L06/L09–11/Electron未完成。
