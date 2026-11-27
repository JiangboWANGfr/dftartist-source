# B41 独立焦点/局部滚动部分冻结及初始基线

## 结论

产品固定 **548d57b4a2d4dd413063ddaf15ca46d123420ecb**，B初始 **6ee5fc4ed572faf67dba5dcd6f1d6ac581ea1e6c**。
先提交输入冻结 **936f4115910234f65cf9870a35b8c07594e0f9e4**（8文件），再运行基线；不存在先看A实现再改期望。
15/15新Node设施、5/5浏览器前提、41/41相关旧设施通过，TAP fail/cancelled/skipped/todo均0。
**新六DOM planned6/executed0/passed0/failed0/blocked6/skipped0，能力门禁exit1**：
未交付公开SourceCandidatesView及source-candidates-view.css。这是未实现能力阻塞，不是六项语义断言失败，也不是六项UI通过。
本轮没有针对产品结果修改冻结输入；后续仅新增报告、纯验档API、可携证据。

本B实际运行了真实SDK、Navigation/Selection及现有SourceView，不能笼统写成产品执行0。
候选DOM、真实Core和Electron纵向执行0。Q1仍open；累计96计划DOM/30历史类型仍属部分冻结。
上一轮B40最终输入已由C41限定接受，不代表本B41经C审或完整组件/M5放行；C-97保持C已关闭，不重开。

## 独立验收及覆盖核查

依据固定DESIGN §6.18.4及§6.18.1/3；输入和逐项预期见
[cases.mjs](../web/tests/independent-source-candidates-view/focus-scroll/cases.mjs)及
[冻结计划](plans/M5-source-candidates-view-b41-focus-scroll.md)。
旧B32已有三行Arrow/Home/End/基本Tab，B40为六项提交/微任务签发撤销；没有据此认定实测非零滚动、行移除焦点或多实例强检查完成。

| ID  | 新输入与判据                                                                                                                      | 初始产品基线 |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| F01 | 原生Tab入列/End到缺refKind末行/离开再入；首入首行、仅一roving Tab位、旧行可聚焦且aria-disabled、再入记忆行                        | 能力阻塞     |
| F02 | 非零且无合法裁切的列表滚动，原tuple持焦；host追加及普通rerender后仍为当前对应行、保留滚动，同state不重复签发                      | 能力阻塞     |
| F03 | 原行持焦，reload的真实pending与零DOM行先于唯一新命中答复；交当前列表容器非操作按钮/body/新行，下一ArrowDown才入新行               | 能力阻塞     |
| F04 | 外部sentinel持焦；host追加及预备完成的双模型对切换不抢焦点，新会话首次列表入口首行                                                | 能力阻塞     |
| F05 | 20合法页40命中，目标初始确实被列表裁切；34次原生ArrowDown后目标可见、仅本列表移动，父/页面/真实SourceView不动                     | 能力阻塞     |
| F06 | 两非空实例；第二实例原生键盘到10且可见/滚动稳定，再操作第一到34；第二非零滚动/roving记忆保持，ID与实际IDREF本地唯一、旧行非空说明 | 能力阻塞     |

所有项要求无确认、Selection历史/身份改变、额外查询或借用模型释放；host查询只允许显式append/reload。
不用ref/deep-equality构造身份，不强制原HTMLElement保持，不规定候选私有class。
port必须是共同包含全部行的唯一实测overflow祖先，否则fixture-premise阻塞；不是直接归产品错误。
保留只在稳定port尺寸、滚动范围未裁切前提下检查，舍入容差0.5 CSS像素。
F06快照先等目标可见且连续三帧scroll稳定；帧等待与DOM观察均纳入取消清理，不固定产品完成时限。
F06只查存在的DOM ID/IDREF与真正非空说明，不冒称完整AX/读屏或空态强关联。
现无候选组件，六项实际DOM链路、候选port布局、这些交错与清理异常分支均尚未执行；设施审查不能代替未来真组件复验。

## 真实模型/测量设施

合法受控Transport→原HierClient→原SourceNavigationModel/SelectionModel，未伪造state/候选组件。
80行ASCII文档按真实SHA256构造SourceSpan/Read；pageSize4按公开Schema映射wire.limit4，每页2项，20页40行，第39行缺refKind。
F04预备两对真实模型后才render，不在切换的两个提交之间等待第二模型准备。
只复用C已审公开方法原调用/receiver/args/return/throw透传，不读then、不改Promise、不替组件消费。
host只catch自己loadMore/reload/locate的原Promise，host记录按调用前索引及name/receiver/value/arity校验。
未新增Q1强观察器/适配；没有用raw error、parent链接或unhandled空集证明原Promise双分支已消费。

Node15：库存1、滚动正反7、保留及几何/裁切3、逻辑焦点2、真实模型2。
浏览器5：真实模型追加/空页2；真实SourceView几何、普通DOM局部滚动测量及故意移动父容器负例3；
全部candidateUI=false，不是候选列表替身验收。
实际测得window(top60,left20)、outer(80,30)、sourceHost(15,12)、SourceView实际内部port(23,11)，均有非零余量。
普通DOM控制单独scrollTop70后保护范围不动；故意父scrollTop+5被断言拒绝。
controls清理errors/unhandled及browser/server releaseErrors均空；目标能力门禁只运行能力页，无目标用例清理成功的虚构结论。

## 实际命令、固定环境与原始证据

E=/private/tmp/hier-b-orch41-focus.Ok2iwR；P=E/fixed product 中文，独立detached548d57b。
测试cwd=/Users/jiangbowang/MOI/2025/dftartist/2026.9/dft_hierachy-test-m5-tree；工具安装/check cwd=P/web。
N=/Users/jiangbowang/.npm-global/bin/node；PATH=/Users/jiangbowang/.npm-global/bin:/opt/homebrew/bin:/usr/bin:/bin。
测试显式HIER_B_PRODUCT_ROOT=P、HIER_B_BROWSER_TOOLS=P/web，不从主树重新编译或运行Core。
Node24.21.0、Chromium156.0.8078.4、React/DOM18.3.1、esbuild0.25.11、Playwright1.64.1、Prettier3.9.10，原lock离线安装。

主要执行：

- git worktree add --detach P 548d57b…；npm ci --offline --ignore-scripts；npm run check。
- N --test --test-reporter=tap web/tests/independent-source-candidates-view/focus-scroll/facility.test.mjs。
- N web/tests/independent-source-candidates-view/focus-scroll/run.mjs --list；同脚本--controls；同脚本无参数DOM门禁。
- N --test --test-reporter=tap web/tests/independent-source-candidates-view/deferred-bindings/facility.test.mjs web/tests/independent-source-candidates-view/pointer-rebind/facility.test.mjs web/tests/independent-source-candidates-view/pointer-rebind/contract-facility.test.mjs（41/41）。
- N E/source-audit.mjs 936f411… source-audit-captured.json；N E/protect.mjs --check；定向Prettier和git diff --check。

web check通过196定义/27方法生成一致性、tsc -b、54模块/182依赖及7个分层违规负例；
它不是全量web测试、根check.sh或完整Core构建。
新bundle SHA256 **dbd56089467527755cdf1c2a1a8098634aa615b547ee82dca264c0dbdd8415b9**，编译warnings空。
本B新测试唯一非零是能力DOM exit1；npm诊断stderr原样保留，不声称所有stderr空。

以下为封档前已完成的17条完整捕获；完整argv/env/cwd/UTC起止/耗时/exit/原stdout+stderr入档，后续纯元数据/格式/封档回执另见证据或E。

| 捕获名                         | exit / 耗时 |
| ------------------------------ | ----------- |
| fixed-product                  | 0 / 0.642s  |
| initial-snapshot               | 0 / 0.818s  |
| locked-tools-install           | 0 / 0.638s  |
| fixed-product-web-check        | 0 / 6.567s  |
| pre-freeze-format              | 0 / 0.143s  |
| pre-freeze-diff                | 0 / 0.006s  |
| freeze-format                  | 0 / 0.146s  |
| freeze-stage                   | 0 / 0.025s  |
| freeze-staged-whitespace       | 0 / 0.009s  |
| freeze-commit                  | 0 / 0.025s  |
| frozen-node-facilities         | 0 / 0.092s  |
| frozen-DOM-inventory           | 0 / 0.032s  |
| frozen-browser-premises        | 0 / 0.971s  |
| frozen-DOM-baseline            | 1 / 0.422s  |
| related-historical-facilities  | 0 / 0.131s  |
| runtime-input-and-source-audit | 0 / 0.278s  |
| strict-protection              | 0 / 0.786s  |

首次元数据source-audit返回过大，工具截断capture JSON，编排JSON.parse报错；不把截断返回列为完整捕获。
首次source-audit.json及source-audit-first.mjs保留；改为摘要输出、另名后重跑同一元数据审计，
未改目标测试或重跑产品测试取绿。两次审计的内部41条git原双流均留可携档，不冒称第一次外层截断流已完整。
17之后的实际命令和验档正负例以最终档中的captures为准；不为凑计数丢弃原失败。
首次seal的纯验档API误重用runtime局部变量，SyntaxError/exit1，尚未执行任何验档判据或产品测试；
已保留初稿API、完整失败stderr及首次归档，修正该设施语法后另名重新封档。
这是元数据设施修订，不涉及936f411的八份测试输入或产品预期。

## 来源、保护及交接

三组B40→A吸收完整patch逐字节相同，最终11路径同字节；本B实际审计41条git命令并保留82原流，
不是援引A的执行。只读测试/文档固定对象及公开Schema/声明；未读A实现、实现diff或自测生成oracle。
10运行输入（8新冻结文件+2原观察helper）与936f411固定对象相同；49新生成声明与主已有声明字节一致。
主/B/P原普通路径1315/905/1297及主49声明/3普通Core字节/mtime保持；主声明不编译。
日志原前2736119字节/SHA256 2be67d60f49062dbc4a64696375f025ca26b0e96d670f83c2da5ddb4beb1743b保持，
仅追加不暂存/提交；M3-coordination/research、旧工程/ref和真实设计输入未写。

可携档 **docs/m5_b41_focus_scroll_freeze.json** 含完整执行双流、输入/旧helper、固定DESIGN、审计原流、保护基线/脚本、报告及runtime pins。
纯验档API为focus-scroll/evidence.mjs，须显式import调用verifyEvidence或checkEvidenceControls；
只node运行API文件不代表验档，API不运行产品。最终回读须1正7负/空档拒绝，实际结果和档SHA在REVIEW_LOG交接。
冻结计划内未勾的执行清单保留冻结前原文；完成证据以本报告及最终日志为准，不改冻结oracle。

未重跑无变化CLI全集/Core三配置/CTest/ASan/属性1096、旧DOM/30类型全集、
真实Core候选UI/Electron/IPC、完整包外/跨平台/Node20/22/远端CI/压力。
Q1强观察、未提交render、连续原行新代次stale_action/旧闭包、完整生命周期/空态强关联及AX树仍留差额。
首版无持久化，工程保存/恢复/旧文件迁移不适用；不由SDK绿宣称L06/L09–11或Electron完成。

交A：原样吸收输入冻结及后续证据提交，依据能力缺口保留blocked语义，不改oracle适配实现。
交C：定向审六项规范/port唯一性/几何前提/焦点容器、原host调用与清理；本B不代签C。
交D/协调器：本轮部分冻结结束，D无新输入/D-03仍M6；Q1/完整组件前置不齐，
不创建新会话/定时器、不发ACD会话消息、不自行下一轮轮询。
