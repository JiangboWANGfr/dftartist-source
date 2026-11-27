# B44：未提交 render 三项独立部分冻结

固定产品 `7e79435a2bfd2e9da85d75a81790374c3bda25de`；B初始 `5190002d9be7e441d38774a519ee5c0bf4fe5ade`。
首冻 `52ae45cfe5a4c8fa7cf6e6ea5f515cf5004237a1`，普通React对照一行适配 `7cc75a63c5321ff5189f6c4d061e9a2ee6000d0e`，
最终独立范围修订冻结 `fa52c594bdca96233f3fe995b9e9ff78eeee1520`。均先提交再执行对应测试，首稿与原结果不删。
依据唯一DESIGN §6.18.1/3/5、公开声明、B35/B33合法fixture；不读A生产实现/diff/自测生成oracle。

## 覆盖与结果

B40 D01–06是实际commit后的微任务/同栈失效，不等同本轮未提交primary。
候选元素→候选后render/layout witness→最后gate，均在同一Suspense primary，确保真正遍历过候选后才悬挂。
必须见证尾gate已读、after-candidate sibling已render、primary未layout提交而fallback可见，不能以fallback或外层wrapper单独假绿。
宿主自有gate Promise不属于模型命令Promise；不读then、不替换模型或消费UI原Promise，Q1无新增观察/关闭。

| ID  | 输入                                                                            | 正确行为 / 当前基线                                                                                          |
| --- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| U01 | 真实ready候选primary挂在尾部gate，未提交后卸载，再开放gate并排空检查点          | 未提交及卸载后零签发/命令/反馈/Selection动作/query，原state/page/选择/历史及模型存活保持；**目标执行0/阻塞** |
| U02 | 两模型对首次render前就绪；未提交旧对换新对并实际提交，再开放旧gate              | 旧对无命令复活；只新原page/index一批绑定，零查询/确认/选择/借用dispose；**同上**                             |
| U03 | 原模型/state/page不变；gate开放后同一host调用栈显式flushSync重试首次primary提交 | 整个flushSync返回后、host栈让出前零命令；随后微任务仅一批原tuple；**同上**                                   |

U03明确是显式同栈重试，不穷尽所有自动/并发重试。布局快照只证明其执行时，另有完整flushSync返回检查，包含同步passive effects。
新React负控在同一helper中实际用useEffect向普通数组写一条记录，整栈检查确实拒绝；不实现候选逻辑或代替产品。
本专项不产生确认输入，不宣称trusted设备/平台读屏/ElectronE2E。

最终 **12/12新Node设施、5/5浏览器前提、30/30相关旧设施通过**。
TAP fail/cancelled/skipped/todo均0。**3DOM planned3/executed0/passed0/failed0/blocked3/skipped0，exit1**，缺正式SourceCandidatesView/CSS；
不是三项语义通过或失败，不造候选替身取绿。累计104计划DOM/30历史类型仍部分冻结。

Node12=库存1+未提交断言正2负3+已提交断言正1负3+host gate1+真实模型1。
浏览器5=真实SDK原tuple1+普通React Suspense abandon/replace/resume3+真实passive-effect整栈负控1，全部candidateUI=false。
12设施在首冻与修订各实际执行；当前以fa52c59为有效范围，首稿中的额外订阅负例不沿用为产品要求。
普通React probe只验证渲染/提交时序，不假装SourceCandidatesView；真实SDK/Nav/Selection均实际执行。

## 首稿问题、修订与未定边界

1. 首次普通React替换对照漏传Plain，错误走默认缺失的真实候选出口，导致Element type is invalid、两原生error及两pageerror。**exit1原双流保留**；7cc75a6仅加Plain参数后四前提通过，目标oracle未改。
2. 静态质询及本B自查发现layout witness不是整栈证明，fa52c59补同栈显式重试+返回前检查及passive负控，不按A实现调整。
3. **B44-SCOPE-01：规范未明定/未覆盖**。§6.18.1未明确规定未提交阶段瞬时Navigation.subscribe调用次数为0；撤回首稿过强预期，只保留诊断，不自行选正确次数、不把subscribe当命令。Selection“不订阅”是明文要求，仍检查。
   实际UI退订完整证明未补齐，不能用host最终model.dispose代替。原52ae/7cc及其通过记录按历史保留，不回写为当前oracle。
4. 自身source-audit首稿重复声明old变量，**SyntaxError/exit1完整保存**，未执行内部审计；仅修自身变量名后48命令审计通过，范围修订后另有最终49命令版本，三份脚本/两份结果保留。不是产品/A缺陷。

## 本B实际命令

E=/private/tmp/hier-b-orch44-uncommitted.WPdmcK；P=E/fixed product 中文（独立detached固定产品）；cwd=/Users/jiangbowang/MOI/2025/dftartist/2026.9/dft_hierachy-test-m5-tree。
N=/Users/jiangbowang/.npm-global/bin/node；PATH=/Users/jiangbowang/.npm-global/bin:/opt/homebrew/bin:/usr/bin:/bin；
测试显式HIER_B_PRODUCT_ROOT=P、HIER_B_BROWSER_TOOLS=P/web。
Node24.21.0/Darwin arm64、Chromium156.0.8078.4；React/DOM18.3.1、esbuild0.25.11、Playwright1.64.1、Prettier3.9.10均原锁。

| 实际命令                                                                                                                                                                                        | exit / 结果                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| git worktree add --detach P 7e79435…；P/web npm ci --offline --ignore-scripts                                                                                                                   | 0/.724秒；0/.546秒                                                                        |
| P/web npm run check                                                                                                                                                                             | 0/6.470秒；196定义/27方法生成一致性、tsc -b、54模块/182依赖/7分层负例；非完整web/check.sh |
| N --test --test-reporter=tap web/tests/independent-source-candidates-view/uncommitted-render/facility.test.mjs（初始/最终）                                                                     | 0/.088秒；0/.087秒，各12/12                                                               |
| N 同目录run.mjs --list                                                                                                                                                                          | 0/.031秒，原U01–03库存；最终输入正文/计划与fa52固定                                       |
| N 同run.mjs --controls（初稿/Plain适配/最终范围）                                                                                                                                               | **1/.848秒**；0/.686秒四前提；0/.823秒最终五前提                                          |
| N 同run.mjs无参（首稿/Plain适配/最终范围）                                                                                                                                                      | **1/.434秒、1/.429秒、1/.443秒**，均目标能力0执行/blocked3/skip0                          |
| N --test --test-reporter=tap web/tests/independent-source-candidates-view/deferred-bindings/facility.test.mjs web/tests/independent-source-candidates-view/feedback-lifecycle/facility.test.mjs | 0/.084秒，旧相关30/30                                                                     |
| N E/source-audit.mjs（首稿/变量修正）；N E/source-audit-scoped.mjs                                                                                                                              | **1/.022秒语法失败**；0/.350秒48命令；0/.378秒最终49命令/98完整流                         |
| N E/runtime-pins.mjs；N E/protect.mjs --check；定向格式/语法/git空白                                                                                                                            | 均通过；98编译文件/49声明/锁/规范/旧档及当前输入pins                                      |
| N E/seal.mjs；N E/verify-final.mjs（显式import纯API）                                                                                                                                           | 逐块长度SHA及1正7负/空对象拒绝通过；封后回执留E，不递归入档                               |

最终正常globalErrors/unhandled/resource errors与pageerror均空，releaseErrors空，bundle SHA **bbb34dcc653cbc09ea43c3e1fb605edd82105ea6c59f4885115edb6c4b9e26d2**。
初稿 **dc7c24af921687c727670a179af2ae97cc33e0ad6f300c83528580791bf816d8**、Plain适配 **d0230d076e26aa051b47b53f1718b5a4886025d035bb3754c5f3ca1ddd3ca332**各留原值，不声明各阶段原bundle相同。
npm诊断stderr完整保留，不声称所有stderr空；新fixture构建warnings空。

先卸载，再release host gate、取消DOM等待、恢复原方法观察器，再释放自有模型/SDK/wire；两MessageChannel检查点后移除全局观察。
恢复/释放逐项尽力继续并留诊断；无sleep竞态，15秒watchdog仅防设施挂死，不成为产品超时。
没有新原Promise强观察、cancel/timeout或订阅所有权结论。

## 来源、保护、交接

最终来源审计49 Git命令/98完整流：七组B43/C98→A raw blob元数据delta相等、最终23路径tree/blob对象相等；
9首冻原文、7cc中间fixture与最终15运行输入固定。一行Plain适配时，九首冻文件中八份保持、fixture仅该一行变化；最终明确7份新文件做范围修订，完整原文和中间版另存，不冒称九文件全程不变。
49声明与独立新构建P字节相等；98编译产物与既有B43 pins/主树逐字节相等，DESIGN §6.18.1至第7节前15412字节/SHAbaa78949e5354e1ed384e0f57b141002c1f3c1391a1fd25a790dca9ed08de1db不变。
审计只读B自有测试/原声明及A导入blob元数据，不读A生产实现作为oracle，不声称保存了A完整文本patch。
历史B43/C98档/报告/API/pins当前root显式通过，验档不是本轮重跑其全部运行门禁。
封存前已读C44最新结论：C本人在固定7e79435正式关闭C-98、限定接受B43三项，未新增确定缺陷；不包含并行的本B44，不据此自行放行新三项或关闭Q1。

主/B/P原普通1361/948/1343路径bytes/mtime、主49声明/3普通Core保持；只新增B测试/计划/报告/API/档，主未stage。
日志原前2842526字节/SHAe6e95224b5079bf0982aabb93e8643030b56497b7a3668562bedf284617e7bda保持，只追加不提交；协调research/旧工程ref/真实输入未写。
当前DESIGN389079字节/SHAcf4e54a311bd25f2ccae0dc975d081fbe47bfe14befdf8db2a992502d206a5a5。
可携档 docs/m5_b44_uncommitted_render_freeze.json 含各实际原双流/初始错误、全部自身输入/旧原文/中间版、规范、来源/保护/采集/封档脚本/报告/API与runtime pins。
纯API必须import调用verifyEvidence/checkEvidenceControls，直接node文件不等于验档，验档自身产品执行0。

无生产/API/ABI/TS/IPC/Schema/protocol2/schema7/依赖/配置/工程格式变化；首版无持久化，保存/恢复/旧文件迁移不适用。
未重跑无变化CLI/Core三配置/CTest/ASan、属性1096、完整web/check.sh、旧DOM/30类型/包外全集、真实Core候选UI/Electron/IPC、Node20/22/跨平台/压力/远端CI，不称完整构建/门禁。
Q1、连续原行新代次stale_action/旧闭包、其余生命周期/退订/空态强关联/AX/包外/纵向差额保持；未提交仅本三种交错部分冻结，完整组件/M5不放行。

交A：首冻52ae45c→Plain适配7cc75a6→有效范围fa52c59→独立证据提交原样吸收，不保留首稿过强订阅oracle作为产品门禁。
交C：定向审同一primary尾门控、整栈返回前检查与passive负控、B44-SCOPE-01规范边界及所有实际资源/来源/证据；B不代审批。
交D/协调器：本轮B交接后结束，D无新输入/D-03仍M6，C-97/既有关闭项及属性不重开，不凭SDK设施宣称L06/L09–11/UI/Electron完成，不新会话/定时器/ACD会话消息。
