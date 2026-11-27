# B49：C-99 部分构造所有权独立冻结、修订与复验

共同fixture的C-99修订已完成：构造成功一个资源即由共同scope持有；中途失败逐项回滚，保留原setup、cleanup任意值及各层cause；成功移交后的close并发/重复/同步重入不重复释放。
**C-99仍开放，待提出方C定向复核关闭。** 本轮不是产品泄漏验收、候选UI或Q1放行。

## 固定对象与独立性

固定A产品887698bf1a82a1496b3af7eaede22a2abd68de82；B初始93771ac8e6fb656aaccbf8c73b439bc48a3a3841。
基于DESIGN§5.6的SDK/Transport生命周期、§6.18.1自有模型/SDK释放顺序及AGENTS所有权/原异常规则，C48交接明确了需补的pair部分构造路径。
不读A实现/diff/自测或C/A探针源码定义oracle；自己的旧fixture及公开入口用于真实对象输入。日志读取包含A摘要，但别人执行不记为B证据，不宣称全程盲审。

| 独立提交                                 | 内容                                     |
| ---------------------------------------- | ---------------------------------------- |
| e178afb0e0c67c9c7607069ce120d4c02f06f766 | 首冻10项、仪表及计划                     |
| 9275f41df8cedec42746c2852bb1df604c62cdb9 | 同步重入close的第11项                    |
| 7661091145f110f2ec7ec68e7f2dbbd64be14b95 | 只修共同pagination/public-model.mjs      |
| a49fcbe755aa51fd90e644082a5597b9181539ad | 原ready→两公开命令→结算→close正常回归    |
| b466edf2ba1e7de1545bd334efbbc77fcc04eb75 | 独立第12项合法异步关闭、收窄07的证明声明 |

初始10项的仪表和断言、追加11项和两个正常命令、追加12项均保持各自冻结字节；没有按实现修改期望。计划07措辞后修，不回写原冻结版本。
共同helper之外，原B G01/G02、selection两个清理控制、其它旧测试/历史证据/标准入口保持。

M=/Users/jiangbowang/MOI/2025/dftartist/2026.9/dft_hierachy；
B=/Users/jiangbowang/MOI/2025/dftartist/2026.9/dft_hierachy-test-m5-tree；
E=/private/tmp/hier-b-orch49-c99.tjFbrc；P=E/fixed product 中文（独立detached、原锁fresh构建）。
N=/Users/jiangbowang/.npm-global/bin/node；D=web/tests/independent-source-candidates-view/context-ownership。

## 输入、预期与实际基线

使用公开真实HierClient/SourceNavigationModel/SelectionModel子类。故障构造在super前抛，其余实际构造/dispose委托真实base；wire包装只计注册/退订并透传。原setup对象带poison cause getter，不准读取/格式化猜测展平。
每项收集全部已取得对象/监听ledger；红基线在证据断言后finally用真实base补释放残留，不将补释放算为被测helper的释放。

| ID      | 输入/必须正确的行为                                                    | 原helper | 修后  |
| ------- | ---------------------------------------------------------------------- | -------- | ----- |
| 01      | pair第二Selection抛原对象；两Nav/Client及首Selection各释放一次、监听零 | 失败     | 通过  |
| 02      | 第二Nav/Client清理分别抛对象/undefined；继续清理并保留原setup/cause/值 | 失败     | 通过  |
| 03      | 内层及外层清理都失败；逐层保留收到的原异常，不读任意cause做展平        | 失败     | 通过  |
| 04      | pair第二Nav构造抛null；已取得第二Client也须释放                        | 失败     | 通过  |
| 05      | 首Selection构造抛false；早先Nav/Client回滚、原值保持                   | 失败     | 通过  |
| 06      | 首Nav构造抛undefined；Client回滚且真实拒绝，不能用真值判有无错误       | 失败     | 通过  |
| 07      | 旧同步close故障下ready拒绝；自有Client仍须释放                         | 失败     | 通过  |
| 08      | 成功移交前不释放，重复/并发close各对象释放一次                         | 失败     | 通过  |
| 09      | 正常close三dispose均抛原值，后续资源仍释放、标签顺序保持               | 通过     | 通过  |
| 10      | Client在super前失败，fixture自有wire仍关闭                             | 失败     | 通过  |
| 11      | Nav.dispose同步重入close，全部对象仅释放一次、监听零                   | 失败     | 通过  |
| 12      | closed同步标记，close handler微任务投递；ready拒绝、Client释放一次     | 失败     | 通过  |
| 正常2项 | ready→loadMore/reloadCandidates各一请求→合法complete→成功→close        | 通过2    | 通过2 |

首冻直接运行10项 **1通过/9失败**。初修后10/10；追加11项首次在未提交初修稿上失败，ledger三资源均释放两次，首断言停于Nav=2，不能称其余两条assert也执行。
最终未改断言，在固定原helper上合并14项独立运行 **3通过/11失败**，在修后helper上 **14/14通过**。正常两命令、原完整close多错误处理原本就通过，不归为新实现。
主C-99反例的原ledger明确第二Nav disposed=false/releases0、第二Client releases0；修后所有已成功创建资源releases1、Nav/Selection disposed=true、监听零。多层错误对象身份由运行时assert严格核对；JSON摘要不独立证明对象身份。

固定原helper回放使用E/use-original-helper.mjs的Node registerHooks：仅将当前B的pagination/public-model模块定向到固定P的同字节原helper，不路由产品/其它测试、不写回仓库。仪表/断言不变，原helper字节与B初始Git blob一致并内嵌归档。它是测试模块隔离，不是新的产品时钟/行为适配。

## 仅有的一处旧helper修订与证明边界

原共同context在Client/ready/Nav/Selection之后才组装c，Selection构造失败时外层拿不到资源。现从wire起建立唯一close scope，构造成功即写入该scope；try覆盖Client创建、握手等待和两个模型创建。失败先逐项释放，成功清理原样重抛；本级有清理错误才AggregateError([本级收到的原错误, 各清理原值], {cause: 原错误})。
不展平原错误/cause，不使用错误真值过滤；dispose某项抛出仍尝试其余项。closing Promise在同步dispose起步前发布，重入/并发/重复共享释放工作；保留原关闭开始同步执行的实现方式，不靠延后到微任务掩盖重入。
第11项只直接证明同栈重入后的次数/监听，不将其扩大为专门验证返回Promise身份或同步起步时刻；代码审查与运行断言分别记。

**07边界修订**：初计划误称旧fixture同步close为合法Transport；DESIGN§5.6禁止close栈同步投递handler。保留07全部旧输入/失败，只将它明示为超出合法投递时序的故障控制，不计合法Transport覆盖；期望未放宽。
新第12项单独覆盖合法时序：原wire同步置closed，使hello不能抢先成功；只包装关闭handler为queueMicrotask，并检查注册active；构造返回前deliveries0，随后一次，ready原transport_closed拒绝。固定原helper实际Client releases0失败，修后1通过。没有只把整个close延迟。
12没有执行“先退订再投递”的抑制分支，不声称完整Transport sticky/晚绑定/所有时序已覆盖。共同旧Transport不是本轮新增生产Transport实现。
不要求外层回收尚未成功构造并返回的对象内部私有资源，构造故障在super前；不泛称已证明所有生产构造异常泄漏。
相邻ready在context成功移交后才发起命令时的初始化错误/close错误传播不在本C-99输入内，本轮未改pointer/actions/multipage的该catch，不声称所有setup异常已覆盖。

## 实际命令与回归

PATH=/Users/jiangbowang/.npm-global/bin:/opt/homebrew/bin:/usr/bin:/bin；公开模型测试显式HIER_B_PRODUCT_ROOT=P、浏览器另设HIER_B_BROWSER_TOOLS=P/web；cwd=B（npm在P/web）。精确argv/cwd/时间/退出/signal/完整分离双流均在提交档。

| 实际命令                                                                    | exit/秒/结果                                                      |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| git worktree add --detach P 887698b；N E/protect.mjs --snapshot             | 0/0.678；0/0.796                                                  |
| npm ci --offline --ignore-scripts；npm run check（P/web）                   | 0/0.657；0/7.909，196定义/27方法、tsc-b、54模块182依赖、7分层负例 |
| N --test --test-reporter=tap D/partial-construction.test.mjs，修前/初修后   | **1/0.150，1过9失败**；0/0.137，10/10                             |
| N --test … D/reentrant-close.test.mjs，初修稿                               | **1/0.126，0过1失败**                                             |
| N --test … D/partial-construction.test.mjs D/reentrant-close.test.mjs，最终 | 0/0.136，11/11                                                    |
| 同上加 --import E/use-original-helper.mjs                                   | **1/0.143，固定原helper1过10失败**                                |
| N --test … D/normal-command.test.mjs，固定原/修后                           | 0/0.143；0/0.128，均2/2                                           |
| N --test … D/async-close.test.mjs，固定原/修后                              | **1/0.156**；0/0.133                                              |
| N --test … D中四个test文件，固定原/修后                                     | **1/0.164，3过11失败**；0/0.143，14/14                            |
| N --test … 相关14/最终16个文件                                              | 0/0.191，159/159；0/0.225，162/162                                |
| 九个既有目录的run.mjs --controls                                            | 全0，详下表，59/59                                                |
| N pointer-session/run.mjs                                                   | **1/0.439，planned2/executed0/passed0/failed0/blocked2/skipped0** |
| N E/source-audit.mjs；N E/seal.mjs                                          | 0/0.476，85条Git/原流；0/0.256，证据1正8负                        |

162项含共同构造及各实际消费链Node设施、原selection两控制、B48六项透传设施；不是整个web测试全集。B48只补了两条真实ready/命令/close正常回归，不重跑其16Node/7React堆控制或56原堆，不把旧结果归本轮。

| 浏览器前提目录     | 通过数 | 秒    |
| ------------------ | ------ | ----- |
| pagination         | 11     | 0.889 |
| actions            | 9      | 0.488 |
| multipage          | 8      | 0.494 |
| pointer-rebind     | 9      | 0.480 |
| deferred-bindings  | 5      | 0.466 |
| uncommitted-render | 5      | 0.454 |
| feedback-lifecycle | 5      | 0.442 |
| sync-feedback      | 4      | 0.458 |
| pointer-session    | 3      | 0.447 |

全部是旧已冻真实模型/普通React/原生输入前提，不是候选UI。B43的两个故意全局error/rejection、B42两个AggregateError/boundaryEvents分别精确匹配其负控，**不能称全部pageErrors为空**；其余清理通道/未预期全局错误/解除资源错误为空。B47三前提含真实pair及Selection-only确认，原G01/G02目标两DOM仍缺SourceCandidatesView/公开CSS。
focus-scroll仅常量导入且独立context，不按构造影响追加；未做其它候选目标DOM/旧包消费/类型/CLI全集。

Node24.21.0/Darwin arm64、React/DOM18.3.1、Chromium156.0.8078.4、Playwright1.64.1、esbuild0.25.11、Prettier3.9.10，原锁无新依赖。
npm verbose stderr原样保留，不称所有stderr为空。九个旧runner只记录实际bundleSHA，未保存该九次原buffer；不冒称截获原bundle，也不为本修订追加重建充数。所有runner/实际输入67 pins、98产物及锁可回读。
首次计划行补丁因Prettier表格空白不匹配被拒、未写文件；重读后正确追加。该工具层读取/补丁拒绝无外部命令捕获，不能混为Node测试失败。

## 证据、保护与交接

[提交证据](m5_b49_c99_context_ownership_evidence.json)包含48命令捕获/96外层完整分离双流、12材料；API计数288校验压缩块，另校验两个顶层helper副本。内含85条来源Git/170完整双流、四冻结阶段原输入、原/修helper字节与binary patch、保护快照及67当前输入pins、四个B47/B48历史档引用。封后格式/API回读/提交/最终保护回执另留E，不递归改档。
重入首失败作用于未提交初修稿，该稿没有单独字节pin，不能称仅凭归档能重建那份中间稿；相同冻结控制随后在固定原helper上独立再红，归档嵌入该固定原字节及最终修订。原测试失败/双流照留，不用事后重建冒充原buffer。
显式verifyEvidence(a,{root:B})及checkEvidenceControls(a)为1正8负；拒绝空对象、越权关闭C-99/Q1、删首红、隐藏非零、坏checksum、缺输入以及重算checksum但伪造cleanup结果。导入本身不执行，核档也不重跑产品。

生产core/protocol/web packages/scripts/原锁/check七树项同a3468d0；P fresh98JS/声明同M与B48固定pins。DESIGN全文391362/SHA aa139f7db070ba6a64bbbe9d20624a30a9964293d5bd73b9d4ce9c201aef8599；规范§6.18.1至§7前15412/SHA baa78949e5354e1ed384e0f57b141002c1f3c1391a1fd25a790dca9ed08de1db保持。
旧M/B/P ordinary1409/1000/1391除明示B helper外bytes/mtime不变，M49声明/3Core及原日志前3017524字节/SHAd75a480c8234ebae0363e8b654fbce77bd22ca9cfab3728435f26df357784b28保持。唯一允许变更helper最终5861字节/SHA08ca6a01bd3a4726124bfea8e96a826390b2aa79736e73656ee99c0b11c110ed，另存mtime pin；M旧helper、原协调/research、其它历史档/入口不改。
旧B48归档仍按其93771ac固定原helper pins核验；当前B有意修改该一个helper，**不能对当前B传root调用旧B48 API后声称旧pins仍匹配**。本B49有独立新67 pins，不重写历史档。A固定887698b尚无B48九路径，未导入不当复验完成。

已读C49：它只审A48的复现/状态增量，C-99保持开放；未审本B49新固定修订或B48桥。B辅助仅静态核本控制/修订，提出07证明边界已据规范收窄并新增12；未执行、不代C审。
**交A**：可按顺序原样吸收e178afb、9275f41、7661091、a49fcbe、b466edf及本证据提交；C-99与B48探索保持独立来源，保留首红/修订/不足。
**交C**：请定向核共同scope取得/移交/回滚、falsy原抛值/多层cause、同步重入与合法微任务关闭、原selection控制和受影响59前提；只有提出方C可关闭C-99，本B不提前代签。

无生产/API/ABI/公开TS/C++/IPC/Schema/protocol2/schema7/依赖/配置/工程格式变化；首版无持久化，保存/恢复/迁移不适用。
未跑无变化Core三配置/CTest/ASan、完整check.sh、属性1096、旧DOM/类型/包消费全集、真实Core候选UI/Electron/IPC、大设计、Node20/22/跨平台/压力/远端CI。Q1/正式oracle/106计划DOM/30历史类型完整验收/候选组件/M5均未放行，L06/L09–11不得凭SDK完成。
D无新输入/D-03仍M6；本cycle49完成B设施冻结/修订/实际证据和交接后结束，不接管A/C/D、不新会话/定时器或另排消息。
