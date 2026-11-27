# B42 同步确认错误反馈：独立部分冻结与初始基线

## 结论与固定对象

产品 **e4e99c1d32cebd561e531b4c13a6dd4aff6df271**，B初始 **8077277a4263a47a93c79c546d601d4828cc9aa7**。
先提交八份输入冻结 **509d4d8c3d31b149145ee47a17ed88ee2eaa278f**，再运行新测试；未根据实现改预期。
**17/17新Node设施、4/4浏览器前提、28/28旧相关设施通过**，TAP fail/cancelled/skipped/todo全0。
**两个候选DOM planned2/executed0/passed0/failed0/blocked2/skipped0、能力门禁exit1**，
缺生产公开SourceCandidatesView及source-candidates-view.css；不是两项语义失败或通过。
本轮实际执行真实SDK/Nav/Selection及普通React/DOM；候选UI和真实Core/Electron纵向执行0，不把产品执行统称0。

C42首轮限定接受的是上一轮B41，未提出新确定缺陷；本B42仍待对应C审。本轮不重复同字节全量门禁。
累计98计划DOM/30历史类型仍部分冻结；Q1、完整候选组件/M5不放行，C-97保持提出方C已关闭。

## 独立验收、现有覆盖与新输入

依据DESIGN §6.18.1/3/5及§6.5.4/§6.17，不读A实现/diff/自测或聊天生成oracle。
读取A固定交接只确定对象与剩余任务，不把A15/5/41等结果当本B运行。
原B32已测Selection提交后AggregateError/中性反馈，但未查回调再抛及同栈替换回调资格；
B40是已提交微任务签发/撤销，B41是焦点/局部滚动，不能推定本两个交错已冻结。
输入/逐项预期见
[cases](../web/tests/independent-source-candidates-view/sync-feedback/cases.mjs)与
[计划](plans/M5-source-candidates-view-b42-sync-feedback.md)。

| ID  | 实际输入与正确判据                                                                                                         | 初始目标基线 |
| --- | -------------------------------------------------------------------------------------------------------------------------- | ------------ |
| S01 | 合法wire/真实模型两原行完成绑定；真实Selection监听器在选择提交后抛原值，原confirmCandidate同步抛E；onCommandError再抛原值X | 能力阻塞     |
| S02 | 同一原DOM click栈产生E后，无await地flushSync替换回调；不得让微任务先于替换运行                                             | 能力阻塞     |

S01要求确认/回调各一次；failure浅冻结、command=confirm、action及error为原身份；
下一有效render交宿主边界AggregateError.errors恰为[E,X]、顺序和身份不变，
已提交选择/历史不回滚、不重试、不多查。E取自原公开调用记录，不另造异常替UI。
S02要求反馈不在同步click中发生；替换后旧/新回调均不得收到旧迟到失败，也不向新会话抛错误；
更换回调保留当前逻辑焦点/原动作/模型/已提交选择，不重签/确认/查询。
两项均不要求原DOM节点身份、特定错误message或错误内层结构；不枚举未知error来设计判据。

S02用HTMLElement.click，无配套pointerdown，为辅助激活形状合成事件；
不声称trusted鼠标、读屏平台或Electron E2E。click→检查→flushSync在同一次evaluate/JS调用栈内，
不在两个Playwright往返之间抢微任务。MessageChannel仅为规定微任务的后续检查点，不靠sleep。
S01边界使视图卸载后仍只读借用模型，不能用back/forward伪造回滚补偿。
两个目标UI交错、边界传播、资格撤销和卸载异常分支实际尚未执行，不从设施通过推成UI通过。

## 公开调用链、资源及设施

复用B35/actions/public-model和B33合法Transport，真实HierClient→SourceNavigationModel→原SelectionModel。
host登记真实Selection监听器，通知参数是原已提交Selection；单/双监听器都在抛值后保持提交，
双监听器仍按顺序收到同一值且errors保留原抛值。无mock模型、伪state或候选替身。
复用C已审原公开方法记录器，只记录receiver/args/原return/throw；不读then、不替换Promise/模型行为、
不替组件安装catch。host只消费自身load/locate Promise，Q1无新观察适配、仍open。

Node17=库存1+failure身份/冻结5+AggregateError顺序/身份6+资格抑制3+真实模型2。
浏览器4=真实单/双Selection通知2+普通实际React错误边界1+普通DOM click同栈回调替换1；
全部candidateUI=false，普通组件不是候选替身。实际controls cleanup.errors/unhandled及releaseErrors均空。
先卸载视图、取消DOM等待、恢复观察器、退订host Selection，再释放自有Nav/Selection/SDK/wire与host Promise。
15秒watchdog仅设施防挂，不构成产品超时验收；只说明当前执行路径清理，不称全部异常释放已测。

## 实际命令与环境

E=/private/tmp/hier-b-orch42-sync-feedback.XHFVet；P=E/fixed product 中文，独立detachede4e99。
测试cwd=/Users/jiangbowang/MOI/2025/dftartist/2026.9/dft_hierachy-test-m5-tree；安装/check cwd=P/web。
N=/Users/jiangbowang/.npm-global/bin/node；PATH=/Users/jiangbowang/.npm-global/bin:/opt/homebrew/bin:/usr/bin:/bin；
测试显式HIER_B_PRODUCT_ROOT=P、HIER_B_BROWSER_TOOLS=P/web。
Node24.21.0、Chromium156.0.8078.4、React/DOM18.3.1、esbuild0.25.11、Playwright1.64.1、Prettier3.9.10，
只在P离线安装原锁工具，未重编主树声明或Core。

主要命令：

- git worktree add --detach P e4e99c1…；npm ci --offline --ignore-scripts；npm run check。
- N --test --test-reporter=tap web/tests/independent-source-candidates-view/sync-feedback/facility.test.mjs。
- N web/tests/independent-source-candidates-view/sync-feedback/run.mjs --list；同脚本--controls；同脚本无参数门禁。
- N --test --test-reporter=tap web/tests/independent-source-candidates-view/actions/facility.test.mjs web/tests/independent-source-candidates-view/pagination/release/release.test.mjs。
- N E/source-audit.mjs 509d4d8…；N E/runtime-pins.mjs；N E/protect.mjs --check；定向Prettier、git diff --check及node --check新纯验档API。

web check通过196定义/27方法生成一致性、tsc -b、54模块/182依赖及7分层负例；
不是完整web测试、根check.sh或Core构建。新fixture编译warnings空。
新bundle SHA256 **0da1a984ca5427546e4f423987b8ce87cb8b5300f107512abe9d101937c7df98**。
本B至此唯一非零为能力DOM；npm诊断stderr保留，不声称所有stderr空。
下表为封档前已完成16捕获，后续元数据/格式/封档实际捕获见最终档或非递归E回执；
每条均保存完整argv/env/cwd/UTC起止/耗时/exit及stdout/stderr，不把A/C的执行计入。

| 捕获名                         | exit / 耗时 |
| ------------------------------ | ----------- |
| fixed-product                  | 0 / 0.566s  |
| initial-snapshot               | 0 / 0.784s  |
| locked-tools-install           | 0 / 0.591s  |
| fixed-product-web-check        | 0 / 6.621s  |
| freeze-format                  | 0 / 0.129s  |
| freeze-stage                   | 0 / 0.010s  |
| freeze-staged-whitespace       | 0 / 0.008s  |
| freeze-commit                  | 0 / 0.025s  |
| frozen-node-facilities         | 0 / 0.086s  |
| frozen-DOM-inventory           | 0 / 0.032s  |
| frozen-browser-premises        | 0 / 0.847s  |
| frozen-DOM-baseline            | 1 / 0.425s  |
| related-historical-facilities  | 0 / 0.128s  |
| runtime-input-and-source-audit | 0 / 0.132s  |
| strict-protection              | 0 / 0.700s  |
| evidence-API-syntax            | 0 / 0.020s  |

## 来源、可携证据与保护

本B实际核两笔B41→A的完整raw blob delta及最终11路径tree/blob对象一致，
用原Git元数据证明导入来源，不声称本轮保存了完整文本patch原流。
来源审计22条Git命令/44原流保留；13运行输入（八新冻结+五原支持文件）与509d4d8固定对象同字节。
当前规范§6.18.1至6.18末与B41固定DESIGN材料比较，状态段变化不改变该行为oracle。
49新生成声明与主既有声明字节一致；98编译文件及原工具/锁/CSS/旧档用runtime pins另核。

主/B/P原普通1327/916/1309路径及主49声明/3普通Core字节和mtime保护；
日志原前2768410字节/SHA41486a3b3fa2944767c8bdc8ac6264fe2f4bf39c5d3cdc8ecc9eff96ed6c0759保持，只追加不提交。
保护已有REVIEW_LOG修改与未跟踪M3-coordination/research；旧工程/ref/真实输入未写。
全部新增限测试/计划/报告/证据；无前序产品/API/ABI/TS/IPC/Schema/protocol2/schema7/依赖/配置/工程格式变化。
首版无持久化，保存/加载/旧格式迁移不适用。

可携档docs/m5_b42_sync_feedback_freeze.json包含实际双流、输入/原helper、规范/来源审计原流、
保护/执行脚本/报告和runtime pins；显式import sync-feedback/evidence.mjs的verifyEvidence或checkEvidenceControls验档。
只node执行纯API文件不等于验档；验档本身产品执行0，与真实模型/浏览器执行分列。
须实际回读1正7负并拒绝空档；最终字节/SHA与提交在REVIEW_LOG，封后回执留E，不递归修改档。
冻结计划未勾执行项保留冻结前原文，完成证据以本报告/最终日志为准，不修改冻结输入。

## 限制与交接

未重跑无变化CLI全集、Core三配置/CTest/ASan、属性1096、完整web/check.sh、旧DOM/30类型全集、
完整包外/真实Core候选UI/Electron/IPC/跨平台/Node20/22/压力/远端CI；不记全量构建或里程碑通过。
Q1强观察、未提交render/连续原行新代次/旧闭包、其它迟到反馈/完整生命周期、
空态强关联/AX、包外/纵向及L06/L09–11仍有差额。本单元不自行指定未定关联编码或新观察适配作为正确答案。

交A原样吸收两项冻结和后续证据，不改oracle取绿；交C定向审同步E/X链、同栈替换及清理边界。
交D/协调器：本轮独立部分冻结完成后结束，D无新输入/D-03仍M6，不接管ACD、不新会话/定时器、不继续轮询。
