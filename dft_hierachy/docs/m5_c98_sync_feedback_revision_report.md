# C-98：旧 S02 全局同步异常设施修订报告

固定产品0a0f0f17c80606781d91317065a69b65b380459c；B初始738d21c959b6e7858693d330b40d51414c00342a。
独立预期依据DESIGN §6.18.1/5，未根据A生产实现/自测改预期。C43确定反例只作为待独立复现的问题，不把C执行算本B证据。

## 固定交付与前后判定

1. 6430529f1303c37864d07da95d3980dde6d55bdb：先冻结6输入，再跑修改前旧fixture。
2. 172b742df7840d50e702c89da5858d3e4219a693：原fixture/run接双通道，兼容原锁Playwright空message投影。
3. 1dae4eb59c2cd3d95bb4bc33289aa83aab342f2b：静态质询后先补冻同wrapper迟到逸出反例，再留初始失败。
4. ee9e1a1b7fed62e5de42cb97c7e4850fe7d1ddc0：许可限真实componentDidCatch当下已经记录的具体事件索引及原对象。未固定React开发报告次数。
5. 独立证据提交及SHA见REVIEW_LOG；此报告/新API/归档另提交，不改变上述输入历史。

| 输入                                                                                                      | 冻结正确判据                                               | 本B基线/最终                                                                                       |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 旧S02，确认提交后同栈换callback；明确负控微任务抛真实原E                                                  | runCase必须拒绝                                            | 旧detail.pass=true/全局error及pageerror各1，新增断言exit1；最终runRejected/globalErrors1/探针exit0 |
| 相同输入，只将已撤销反馈分支改正确return                                                                  | 提交1/回调0/边界0/两全局通道0                              | 旧与新均exit0                                                                                      |
| S01正常回调再抛X                                                                                          | 原[E,X]真实Boundary1，既提交不回滚；仅相应实际边界事件许可 | 最终exit0。首稿仅因Playwright空message适配exit1，原失败保存                                        |
| S01已捕获wrapper后，同一wrapper在微任务全局再抛                                                           | 必须拒绝，身份相同不等于许可后续全部事件                   | 第一修订仍漏检/新增断言exit1；最终Boundary报告2、迟到global4并拒绝，探针exit0                      |
| Node事件分类、原身份/索引、错误wrapper、原Promise身份、不抑制事件及释放、pageerror错/多/少、空message适配 | 正控通过、全部负例拒绝                                     | 13新+61相关旧=74/74，0skip                                                                         |

这些是显式别名的**设施对照**，不是生产SourceCandidatesView替代。原runCase内detail.candidateUI=true仅是旧返回字段，本探针顶层productionCandidateUIExecuted=0覆盖其解释，绝不计目标UI通过。
别名仅存在独立probe.mjs；正常产品run.mjs仍只解析固定真实公开包/CSS，缺失仍exit1、planned2/executed0/passed0/failed0/blocked2/skipped0。

## 设施修订边界

只改两个既有文件sync-feedback/fixture.jsx和run.mjs；旧cases/assertions/public-model/facility、首冻和历史证据不改。
记录原window.error及unhandledrejection的原值/原Promise，不preventDefault、不读then、不安装原Promise handler，持续至清理后检查点；随后移除监听器。
Boundary真正componentDidCatch立即快照“已发生事件的index+原value”；通过原[E,X]断言后才激活对应快照许可。相同错误对象后续再抛仍拒绝；没有类型/message豁免。
runner在goto前安装pageerror，清理/关闭page后核事件数量、顺序、精确投影；不是用序列化message替代页面内身份。
原锁Playwright1.64.1的exceptionToError/splitErrorMessage会把空message原{name,message:""}投影成{name:"",message:原name}。本B只读其本地工具源核对此设施适配；不约束产品错误message，也不借适配消除原生未分类事件。

## 本B实际执行

E=/private/tmp/hier-b-c98.SRlK1G；P=/private/tmp/hier-b-orch43-feedback-lifecycle.EByZiq/fixed product 中文（复用本轮已经独立构建的detached固定产品，未重建主产物）；
cwd=/Users/jiangbowang/MOI/2025/dftartist/2026.9/dft_hierachy-test-m5-tree；N=/Users/jiangbowang/.npm-global/bin/node；
PATH=/Users/jiangbowang/.npm-global/bin:/opt/homebrew/bin:/usr/bin:/bin；测试显式HIER_B_PRODUCT_ROOT=P/HIER_B_BROWSER_TOOLS=P/web。
Node24.21.0/Chromium156.0.8078.4、React/DOM18.3.1、esbuild0.25.11、Playwright1.64.1、Prettier3.9.10均既有锁版本。

I=web/tests/independent-source-candidates-view；R=I/sync-feedback/revision-c98。完整argv/cwd/时间/exit/双流及所有阶段原bundle在可携档。

| 实际命令                                                                                                                                                                                            | exit / 结果                                                                                                                             |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| N --test --test-reporter=tap R/channels.test.mjs（首冻）                                                                                                                                            | 0，初版10/10；最终增补为13                                                                                                              |
| N R/probe.mjs --legacy；--legacy --leak                                                                                                                                                             | 0/.851秒；**1/.445秒**，旧漏检的初始新增断言失败保留                                                                                    |
| N R/probe.mjs --S01（第一版）                                                                                                                                                                       | **1/.386秒**，格式适配失败；页面内原[E,X]/Boundary正确，不伪称产品缺陷                                                                  |
| N R/probe.mjs --S01 --boundary-leak（先冻后跑第一修订）                                                                                                                                             | **1/.912秒**，同对象迟到逸出漏检                                                                                                        |
| N R/probe.mjs --S01 --boundary-leak；--S01（最终）                                                                                                                                                  | 0/.916秒；0/.471秒，负/正控区分                                                                                                         |
| N R/probe.mjs；--leak（最终）                                                                                                                                                                       | 0/.837秒；0/.444秒，S02正/负控区分                                                                                                      |
| N --test --test-reporter=tap R/channels.test.mjs I/sync-feedback/facility.test.mjs I/feedback-lifecycle/facility.test.mjs I/actions/facility.test.mjs I/pagination/release/release.test.mjs（最终） | 0/.140秒，74/74；fail/cancelled/skipped/todo0                                                                                           |
| N I/sync-feedback/run.mjs --controls（最终）；--list；无参（最终）                                                                                                                                  | 0/.444秒，原4前提；0/.030秒，原S01/S02库存；**1/.434秒**，生产能力阻塞2                                                                 |
| N E/lineage-final.mjs                                                                                                                                                                               | 0/.162秒，14自身Git命令/28完整流；6首冻/2旧原文/2中间版/8最终输入，历史B42旧root通过但修订live root按旧pin明确拒绝；B43原档当前root通过 |
| N E/protect.mjs --check；定向Prettier、语法、git diff --check；显式纯验档                                                                                                                           | 均通过；封后回执留E，不递归入档                                                                                                         |

原4浏览器前提仍candidateUI=false；最终正常清理resource errors/unhandled/globalErrors均空，允许的两个开发边界事件和两pageerror保留。故障探针有预期全局事件，不被清空；释放错误均空。
正常runner最终bundleSHA342f3ef15a325a0a903595ebcdeb114f8e9beb6f3513d7ecf54bdde2f86da075；不同阶段bundle原值各自留档，不声明全部同字节。
本次另有两个未纳入有效通过证据的初始化/采集问题：首次未显式PATH导致spawnSync git ENOENT（未完成snapshot）；首次正控stdout因嵌bundle过大被工具截断，解析捕获JSON失败，未保存该次完整输出。随后修正PATH并用磁盘完整捕获重跑；不把这两次算通过或隐藏为产品失败。两次apply_patch上下文/重复目标校验拒绝未改文件，不算测试执行。
原始反例、首稿适配失败及所有后续有效执行双流完整保存；API解压核每流/嵌套bundle长度SHA、固定输入/规范/历史pins并有负向防伪校验。

## 保护、交接与限制

保护主/B/P原普通1339/939/1321路径（仅B两个旧文件为明确授权修订）；其他旧路径bytes/mtime、主49声明/3普通Core、98已构建JS/声明一致。主改动仍只有既有REVIEW_LOG/未跟踪协调research，日志只追加不提交。
日志本单元原前2820277字节/SHA9510b066e150f854f9e7b2f1d4078e3bb5cb37f0d0b77451f84c323e50a4bb1f保护；旧工程/ref/真实输入未写。
旧B42档、报告、pins与固定P逐字节保持；历史API不能被修改以接受新live fixture，按旧root重放/验档。新修订另立证据，不回写历史为绿。

C-98仍open，交C复核后由C决定关闭；静态B辅助质询不代C审批。交A按6430529→172b742→1dae4eb→ee9e1a1及独立证据顺序原样吸收，不改oracle取绿。
本轮先前B43三项首冻ed2dcb3/证据738d21c仍独立有效，其档root输入未变；累计101计划DOM/30类型部分冻结。
没有生产/API/ABI/TS/IPC/Schema/protocol2/schema7/依赖/配置/工程格式变化，首版持久化/旧文件迁移不适用。
未重跑无变化CLI/Core三配置/CTest/ASan/属性1096/完整web/check.sh/旧DOM类型包外全集/真实Core候选UI/Electron/跨平台/压力/远端CI。实际SDK/Nav/Selection与普通React/DOM/明确设施double执行，正式候选UI/Core纵向/Electron0；不称完整门禁。
Q1/完整组件/M5、L06/L09–11/UI/Electron差额不变，D无新输入/D-03仍M6。不新会话/定时器、不发ACD会话消息，本轮交接后结束。
