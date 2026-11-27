# B37：指针原行动作部分冻结与两项规范设施纠正

## 结论与固定对象

修订后的六项输入已独立冻结；25主Node设施、2契约回归、9浏览器前提通过。候选生产组件/CSS仍缺失，DOM planned6/executed0/passed0/failed0/blocked6/skip0。
累计84计划DOM/30历史类型仍部分冻结，不是完整候选UI/M5或设备E2E验收。Q1原Promise实际组件消费保持open。

| 对象                                       | 固定SHA                                  |
| ------------------------------------------ | ---------------------------------------- |
| 产品P/A36交付                              | 0272e902c36fc8333e78b3a891a37e46fcc15a1c |
| B初始                                      | 578e22cea4d6cbeab6584f4569a2314a3ce2822d |
| 初始六输入（历史，不能作为最终正确oracle） | 08b53c263b11871ea8fb843ed64622ab7bff74da |
| 先冻两项规范设施正例                       | a8062c72b1e3c502e6d3b34f3cdde638f4ab7583 |
| 规范纠正后的最终六输入/设施                | 2da0dd5f326f136f4ba31b30f678d98330103bc2 |

B为test/m5-tree。证据提交SHA见REVIEW_LOG最终交接，四笔依序交A原样吸收；不把领取、导入或元数据检查算产品复验。
依据DESIGN §6.18.3/5、§6.17及§6.11.3、合法fixture和公开接口，不按A实现/diff/自测/聊天生成oracle。
本轮DESIGN 387950字节/SHA256 1b393733ba90e6b401d98544a425c65a315e69b599f48858e66b8c579f570950；§6.18.1以后规范与旧9958f0e原字节相同。

## 初始测试问题与独立纠正

已有B辅助器按规范检查新B代码，指出两处确定过约束；它不是独立C审查，未运行这些业务测试。

- 首冻用Object.keys精确比较failure，额外要求三字段可枚举。§6.18.5仅承诺浅冻结和原command/action/error值，未承诺枚举性。
- 首冻假设同Reply新链即可保证DOM旧行连续存在。§6.11.3 reload清页链；若视图已提交空列表，§6.18.3要求抑制旧指针的配套click，不能一律期待stale_action。

原首冻23 Node/8浏览器前提绿、6 DOM缺组件阻塞全部保留；这些设施绿没有证明错误oracle正确，实际候选UI语义从未执行。
另在a806先冻不可枚举冻结failure合法、已移除原行配套click可断言0确认两个正例，未修断言实际0通过/2失败。
2da修订后同一两项2/2；仍拒绝未冻结/错误action或error/重复与错误确认。没有根据A实现输出修改预期、放宽旧基线或删除失败。
对应理由和边界见docs/plans/M5-b37-oracle-preconditions.md；原08源码也完整嵌入本轮归档，不抹除历史。

## 最终输入、预期与依据

普通重载使用旧合法controlled Transport：发起reload进入pending后，宿主必须先等模型空页链及实际DOM零行，再答复值相等但身份不同的新原Reply，并等新行准备完成。
这显式建立“原行已经移除”的前提，不靠React内部key/handler、私有state、同值推断或调度碰巧跳过pending。

| 用例 | 输入                                                                        | 明确预期及依据                                              |
| ---- | --------------------------------------------------------------------------- | ----------------------------------------------------------- |
| P01  | primary synthetic mouse down→普通reload/观察DOM零行→值相等新行→配套up/click | 0确认、0失败反馈、Selection/历史不变；§6.18.3原行移除规则   |
| P02  | 同上，primary synthetic pen                                                 | 同上；不声称真实笔设备E2E                                   |
| P03  | 同上，primary synthetic touch                                               | 同上；不声称触摸平台E2E                                     |
| P04  | mouse down→上述重载/旧行移除→pointercancel→独立AT形状click                  | 交当前新行原action一次成功，不复用旧动作；§6.18.3           |
| P05  | 无配套down→普通reload/旧行移除→独立AT形状click                              | 当前新action一次成功；§6.18.3                               |
| P06  | mouse down→同链loadMore追加→配套up/click                                    | 交down时原action一次成功，不能换成最新绑定；§6.18.3/§6.17.2 |

cases.mjs逐项input/expected/detail/basis。对append既有行可保留绑定或重签，不额外规定时间顺序；新增尾页仍必须绑定原page/页内index。
只有宿主显式过渡命令增加一次实际wire请求；确认不新增请求或导航发布，重复/克隆/最新动作替换、错误Selection等由纯断言反例拒绝。
真实SDK/Nav/Selection和旧公开方法透传记录，无替代候选UI或伪造NavigationState。新三类型PointerEvent均为真实浏览器中的合成事件，不冒充trusted OS输入。
同Reply公开SDK返回适配只用于已审L6前提：旧动作stale、新动作有效、同链追加旧动作有效；不证明DOM连续保留，不扩大为真实Core缓存行为。
宿主消费自己发起的过渡Promise，不记作组件消费；不读then/加catch/引擎hook建立新观察点，Q1不关闭。

## 本B实际执行与证据边界

E=/private/tmp/hier-b-orch37-pointer.ooBKJE；P=E/fixed product 中文独立detached；Node24.21.0/Darwin arm64、Chromium156.0.8078.4。
模型命令显式HIER_B_PRODUCT_ROOT=P，浏览器另HIER_B_BROWSER_TOOLS=P/web；固定PATH采用npm-global Node。完整argv/cwd/起止/退出/耗时及分离双流在便携档，表中只缩写路径。

| 实际命令                                                                            | exit / 结果                                                                                                                   |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| git worktree add --detach P 0272e90；P/web npm ci --offline --ignore-scripts        | 0；0，锁定工具不变                                                                                                            |
| P中npm --prefix web run typecheck -- --force；P/web npm run check                   | 0；0，196定义/27方法、TS、54模块182依赖、7层负控；不是完整web/check.sh                                                        |
| 首冻node --test --test-reporter=tap pointer-rebind/facility.test.mjs                | 0，23/23，仅历史设施                                                                                                          |
| 首冻node pointer-rebind/run.mjs --controls；不带--controls                          | 0，8/8前提；1，6 DOM缺组件/0执行/6blocked                                                                                     |
| node --test --test-reporter=tap pointer-rebind/contract-facility.test.mjs 修前/修后 | **1，0通过2失败** → 0，同两输入2/2；先冻a806再修断言                                                                          |
| 修订后node --test --test-reporter=tap pointer-rebind/facility.test.mjs              | 0，25/25，原23加0确认拒绝反例和普通重载空pending前提                                                                          |
| 修订后node pointer-rebind/run.mjs --controls                                        | 0，9/9：4真实模型前提+可信plain-button鼠标/合成pen/touch/cancel-AT/独立AT五输入前提；非候选UI                                 |
| 修订后node pointer-rebind/run.mjs                                                   | **1，planned6/executed0/passed0/failed0/blocked6/skip0**，缺SourceCandidatesView/CSS，不计6通过                               |
| P中旧multipage/verify-evidence.mjs --inputs                                         | 0，B36历史41捕获/33材料/12输入有效，当前产品0执行；不是本B重跑旧32/16 CLI                                                     |
| node E/runtime.mjs；node E/corrected-runtime.mjs                                    | 0/0，首冻9文件与修订11文件各按固定提交原字节核验，P生成49声明与M同字节；旧B36档/controls原SHA不变                             |
| 现有B辅助器来源审计；主B逐流回验                                                    | 45条只读命令全0、90完整双流；4组完整raw delta/前后mode/type/blob与最终17路径同源，生产仅树metadata；不声称比较了完整patch正文 |
| Prettier --check相关冻结及设施；git diff --check/--cached --check                   | 0，相关格式/空白通过                                                                                                          |
| node E/protect.mjs --check                                                          | 0，3404原普通文件字节+mtime全部不变，另49声明/3 Core、P锁/原日志前缀保持，无旧路径例外                                        |
| node E/seal.mjs                                                                     | 0，35捕获/124材料/11输入pins，含两阶段完整源码与失败                                                                          |
| 显式import evidence.mjs后调用verifyEvidence(a,{root:B}) / checkEvidenceControls(a)  | 0/0，核当前11输入、1正6负元数据对照；不执行产品                                                                               |
| node E/sealed-integrity.mjs                                                         | 0，复制后父档及纯metadata模块与封存原字节一致                                                                                 |

所有TAP cancel/skip/todo均0；两次浏览器cleanup errors/unhandled/releaseErrors为空，fixture构建warnings空，不据此证明原Promise已消费。
唯一三条非零为初始DOM能力门禁、两项规范设施修前红、修订后DOM能力门禁，完整保留并分账；不作为三项生产缺陷或六条UI通过。
P web check完成后才查clean/保护，未重现上一轮层探针并发误报。未将A/C执行或其本轮自测数字算作本B证据。

## 便携归档与保护

主档docs/m5_b_pointer_rebind_freeze.json：**1215331字节**，SHA256 **429f35eb6699c21df88bc636a72d4ccadbced4ec35ba165b38afe63c92e34255**。
35完整分离双流捕获、124材料、11当前冻结pins；材料包含原08九文件、当前修订11文件、规范/初始保护/捕获与封档脚本、既有helper、来源脚本/原审计/90实际gzip流。
不是仅给临时目录索引；B助手来源45命令与本B主包装命令分开署明，静态意见不冒充独立C或产品执行。
后封回执另存docs/m5_b_pointer_rebind_freeze_controls.json，不递归修改主档。

pointer-rebind/evidence.mjs仅导出纯metadata API，**没有CLI入口或参数解析**。必须显式import后调用verifyEvidence/checkEvidenceControls；直接node执行该模块不能算核档，也没有--inputs/--verify-controls命令。
本轮没有新增生产CLI或未知参数静默接受的验收约定；核档实际Node消费者argv及单一JSON结果均被记录。

原M1276/B870/P1258共3404普通文件全部byte/mtime保持，49声明/3普通Core及P package/lock另查；没有授权改任何本轮开始前的B路径。
原日志前2593125字节/SHA256 b7592185078b14d5f8f74cf502fb560aab01d6f364e222d1edf4cd4ba0c9c044保持，REVIEW_LOG仅追加不暂存提交；原M3-coordination/research、旧工程/ref/设计输入未写。
修改仅本轮新B测试/计划/证据；无生产/前序行为、API/ABI/C++结构/IPC/Schema/protocol2/schema7/依赖/配置/工程文件变化。首版无持久化，无保存/恢复/旧格式迁移。

## 剩余范围与交接

连续原行保留时的新代次stale_action DOM、直接旧React闭包、通知/读取/未提交render、完整生命周期/会话切换/焦点滚动/包外/真实Core UI/Electron等仍有差额；本次只冻结已显式建立前提的旧行移除/独立激活/同链append。
未跑Core构建/三配置CTest/ASan、完整check.sh、旧78DOM/30类型/确认/属性全集、Node20/22、Electron/原生IPC/跨平台/M7/远端CI或性能/并发压力。生产输入未变，未用重复全量绿充数。

收尾读到并行C37：C本人限定认可B36跨页六输入，**C-97普通eval/stdin修复仅部分有效，原生Node20组合-pe在三个旧核验入口仍误判，整体不关闭**。
这是C本轮独立证据，不是本B在Node20复现；本pointer单元封档不追写这些外来执行为B。三个旧入口本轮未修改，未宣称已修组合参数。
下一独立B单元应优先按导入/真正CLI契约冻结组合参数与原生受支持Node边界、记录旧红后修三入口并保留旧档/pins/16回归；该任务已有明确触发/前置，无需新增用户批准。

- 交A：依序吸收08、a806、2da及证据提交，**最终使用2da修订集合，08仅历史**。保持84计划DOM为部分冻结、Q1 open，不能据设施绿实施未满足完整前置的组件。
- 交C：复核规范设施纠正红绿、真实pending/DOM旧行移除前提和0/1确认原action；不把SDK同Reply前提当连续DOM覆盖。本轮未代关C-97/C-95/Q2。
- 交后续B：优先C37已给的C-97组合参数/native Node20修订，再继续Q1及其它明确差额；此剩余是可执行任务，不是等待批准或外部阻塞。
- 交协调器/D：本次pointer冻结/证据/交接完成后结束本轮；D无新增任务、D-03仍M6。M5/旧树L06/L09–11/UI/Electron均未完成；无新会话/定时器/跨会话投递，不接管ACD。
