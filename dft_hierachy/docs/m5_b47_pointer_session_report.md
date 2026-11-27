# B-ORCH-47：会话切换撤销配套手势部分冻结

本轮完成两项独立测试输入及设施修订；**目标候选 DOM 执行0/阻塞2，不是组件通过**。
固定产品bf8ef4d5e6496ae5f8f0cda670c57f70a555d205，B初始f373301c3e9d0bfecffdc3aacd8a2ed1b59f32b8。
行为oracle仅为DESIGN §6.18.1/3/5、§6.17和原公开接口/合法fixture，不据A实现/diff/自测修改预期。

## 固定输入与验收

| 固定点             | SHA                                      |
| ------------------ | ---------------------------------------- |
| 原七输入首冻       | 249c20aab9bc5ae9b82fb4d635bcddef2194a50b |
| 两异常清理控制先冻 | 9adca599753cc2714cab4e24f7641311b7f1f653 |
| 最终八输入冻结     | 179bfdc3e14a98700b4c2f68ed94d67576e15aa6 |

D=web/tests/independent-source-candidates-view/pointer-session，八输入为计划、cases/assertions/public-model/facility.test/cleanup-control.test/fixture/run。
G01/G02在首冻至最终字节不变，异常控制也先冻/先红后修；本报告/API/可携证据另提交，不改旧oracle或产品。

| ID  | 输入                                                                                                        | 判断依据与预期                                                                                                   |
| --- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| G01 | ready旧行主指针down，原View位置实际提交预备好的另一真实Nav/Selection对，匹配up/click，再独立无down AT click | §6.18.1/3：跨会话配套click两对零确认/反馈、选择/历史不变；独立AT交当前原action给新Selection一次                  |
| G02 | 同原Nav/state/page，只替换同snapshot真实Selection身份并提交，其余输入同G01                                  | Selection身份也是会话边界；旧action在L6仍有效，故不能靠模型拒绝掩盖UI旧手势；配套零确认，独立AT到新Selection一次 |

同一host View类型/位置，无host key变更、主动卸载重挂、私有React handler访问或HTMLElement身份要求。
新会话DOM及原tuple签发就绪后才激活；配套PointerEvent用相同id37/type mouse/detail1，独立HTMLElement.click没有down/detail0。
签发只取原page/index，事件中不临时签发；Selection-only不额外规定原模型必须为同tuple返回不同action身份。
先检查两模型全部公开confirm记录为零，再单独检查AT精确receiver/action/Selection/arity及一次成功；模型throw/no-op不能当零调用。
两Nav原state/page、wire数量保持，借用模型存活；AT不改旧Selection，无新查询或失败反馈。
B37只覆盖旧行已移除/同链append，B41只核切换焦点；本两项不等于持续原行新代次stale_action、旧闭包直接调用或完整生命周期。

## 实际结果

最终Node **14/14**，fail/cancelled/skipped/todo均0：

- 十纯设施：两输入库存、零confirm接受binding、returned/thrown确认不可冒零调用、AT精确当前确认及action/Selection/receiver/重复四反例、配套与AT输入形状。
- 两真实模型前提：pair普通当前确认；Selection-only旧action实际可提交到新Selection，旧Selection未改、无新请求。
- 两真实SelectionModel子类异常控制：第二构造抛原对象，首对象dispose调用真实base后正常/再抛原Error，检查已dispose、释放次数及原cause/聚合身份。

浏览器前提 **3/3**：两个真实模型前提+普通React同位置rerender/配套事件→独立AT形控制，全部candidateUI=false。
普通React控制mount1/unmount0，实际事件down/up/click(detail1)/click(detail0)，均synthetic；不是候选替身、trusted鼠标/触笔/触摸平台或读屏E2E。

目标候选DOM：**planned2/executed0/passed0/failed0/blocked2/skipped0，exit1**。
正式SourceCandidatesView及公开CSS仍缺，单一能力gate非零，未把两目标逐案伪通过。CSS为ERR_PACKAGE_PATH_NOT_EXPORTED，不声称候选CSS解析/布局/AX通过。
首冻和修订后门禁同为两阻塞；真实模型/原生输入前提不替UI执行。

## B47-FACILITY-01：异常清理遗漏的独立红绿

首冻正常Node12/12、浏览器3/3通过，但静态质询发现group setup catch丢弃dispose返回错误，只抛原setup值。
先独立冻结两异常控制9adca59，再运行修改前设施：**2项1过1失败，exit1**。正常清理原样抛setup值已通过，清理再抛时原helper没有聚合，断言失败。
修订逐项保留cleanup原错误，只有cleanup失败时抛AggregateError([原setup值,...cleanup原值],{cause:原setup值})；cleanup成功仍抛原值，不把cause覆盖。
修后同两控制在最终14项中通过，首冻/原失败/原输入保留。**本提出方B确认修复完成并关闭B47-FACILITY-01，仍交C审本增量**，不将B设施错误归产品或更改G01/G02预期。
真实子类只用于设施故障，不覆盖产品模型行为，不作为候选假实现。

## 命令与证据边界

E=/private/tmp/hier-b-orch47-pointer-session.SGR4uK，P=E/fixed product 中文，独立detached固定产品。
B=/Users/jiangbowang/MOI/2025/dftartist/2026.9/dft_hierachy-test-m5-tree。
N=/Users/jiangbowang/.npm-global/bin/node，PATH=/Users/jiangbowang/.npm-global/bin:/opt/homebrew/bin:/usr/bin:/bin。
测试cwd=B，显式HIER_B_PRODUCT_ROOT=P、HIER_B_BROWSER_TOOLS=P/web。安装/构建cwd=P/web，原锁offline/ignore-scripts，无新依赖。

| B实际命令                                                                         | exit / 秒 / 结果                                                   |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| git worktree add --detach P bf8ef4d5…；N E/protect.mjs --snapshot                 | 0/0.764；0/0.893，先取保护基线                                     |
| npm ci --offline --ignore-scripts；npm run check（P/web）                         | 0/0.641；0/6.521；196定义/27方法、tsc-b、54模块182依赖、7分层负例  |
| N --test --test-reporter=tap D/facility.test.mjs，首冻                            | 0/0.142，12/12                                                     |
| N D/run.mjs --list；--controls；普通运行，首冻                                    | 0/0.032；0/0.805，3前提；1/0.436，2DOM阻塞                         |
| N --test --test-reporter=tap D/cleanup-control.test.mjs，修前                     | **1/0.144，1过1失败**，B47设施遗漏反例                             |
| N --test --test-reporter=tap D/facility.test.mjs D/cleanup-control.test.mjs，最终 | 0/0.144，14/14                                                     |
| N D/run.mjs --controls；普通运行，最终                                            | 0/0.868，3/3；1/0.448，两DOM阻塞                                   |
| N E/source-audit.mjs，首核/补核历史双watchdog后                                   | 0/0.730；0/0.723，58Git/116完整流、4来源/8路径、17输入/98产物/规范 |
| N E/protect.mjs --check，报告前                                                   | 0/0.716，M/B/P旧路径、49声明/3Core及日志原前缀保持                 |

实际Node24.21.0/Darwin arm64、React/DOM18.3.1、Chromium156.0.8078.4、Playwright1.64.1、esbuild0.25.11、Prettier3.9.10。
安装/check的npm verbose stderr原样保存，不说全stderr为空；两个fixture构建warnings均空。
原/最终runner bundle分别1cbb1ffeb96886aff4a65dc8f5cebfad91daea4329b4a4bb44da71a1fa01832a、efcac0017cd63567a5ab0b883939db90b87f68e23586ee220cc4b77caf5d8c90；改了B设施所以不冒称两个bundle字节相同。

所有路径finally卸载根、撤销DOM等待/事件观察、恢复公开调用透传、释放自有Selection/Nav/SDK/wire，并过两个显式任务检查点后释放全局error/rejection监听。
前提cleanup.errors/globalErrors/unhandled、controlPageErrors及所有releaseErrors为空；门禁gatePageErrors为空。释放全部自有page/browser/server；没有长驻服务或新增调度。
15秒watchdog只防设施挂死；不用sleep竞速，没有产品时间/内存预算主张。不读then/改Promise/替组件消费；宿主仅消费自己准备模型的命令。

## C47状态与历史事实

C47正式限定认可B46已知控制可行性、范围修订/引擎固定及导入，允许继续pending子集透明桥接探索；**不批准通用UI oracle、不关闭Q1**。
本B47不在该固定审查对象，不代C提前接受本两项。B44/C45、B45/C46及C-98原关闭保持。
B46-FACILITY-01仅“缩小暂停内GC证明”的修订已获C47核实，本提出方B确认该设施事项按此范围关闭；不等于原暂停GC已成功或Q1通过。
另独立核原B46档CDP记录：**Runtime.evaluate与HeapProfiler.collectGarbage均有20秒watchdog，退出错误为后者**。原档始终保留两条；本轮不重跑或回写原摘要，不称只发生一条。
后续可沿C47边界继续pending桥接，已结算/合法分支角色/真实同步卸载等不足仍保持不可判定。

## 来源、保护与可携交接

B46→A四笔raw blob delta及最终八路径相等：
7f8c9a2→189b530、ca03602→44c2bd8、51f7d0d→34f1982、f373301→92c076f。
只核自有测试来源，不读A生产实现/diff定oracle。九个复用helper与原B/A字节相等；当前17输入=八本专项+九旧helper。
core/protocol/web packages/scripts/原锁/check七树项与29e02551相同；P独立fresh构建的98JS/声明与M及B46 pins相同。
规范§6.18.1至§7前15412字节/SHA256 baa78949e5354e1ed384e0f57b141002c1f3c1391a1fd25a790dca9ed08de1db保持。
M/B/P原ordinary1396/980/1378及M49声明/3Core bytes/mtime保持；原日志前2945692字节/SHA256 a0a3ebf20bb8b39c9d07b8a5b15229ee1bc13fd6995e769f7875509563b9601c保持，只追加不stage/commit。
旧工程/ref/真实设计/协调/research不写，主树index空。B46证据API回读是核档，不是重跑10/14诊断或28条产品执行。

可携docs/m5_b47_pointer_session_freeze.json保存原七输入、异常控制先冻/红测、修订后八输入、全部分离双流/源审计/保护/本报告及显式API。
API校SHA/长度、正负控制/空对象拒绝；封后格式/回读/提交/日志保护回执另留E，不递归改档。
辅助静态质询只核B设施、未运行/修改、不代C审。

交A：可原样吸收本两项及设施修订；两DOM当前仍阻塞，不据真实模型/原生前提宣称UI通过。
交C：请审G01/G02会话边界、配套与独立AT分阶段原参数/零调用判据，以及B47-FACILITY-01先红后修与cause证据；本B不代C接受。
累计106计划DOM/30历史类型仍部分冻结；持续原行stale_action/旧闭包、Q1、完整退订/空态强关联/AX、真实Core候选UI/Electron/IPC差额保持。
未跑无变化Core三配置/CTest/ASan、完整check.sh、属性1096/旧74/4/5及旧DOM/类型/包消费全集、真实大设计/Node20/22/跨平台/压力/远端CI；不称完整构建或M5通过。
无产品/API/ABI/C++/TS/IPC/Schema/protocol2/schema7/依赖/配置/工程格式改变；首版无持久化，保存/恢复/迁移不适用本增量。
D无新输入、D-03仍M6；交接后结束本轮，不接管A/C/D、不新会话/LaunchAgent或另排消息。
