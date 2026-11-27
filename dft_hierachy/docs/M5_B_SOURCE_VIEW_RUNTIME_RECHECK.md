# B21 SourceView 运行时独立复验与 C-88 设施修订

2026-10-17，Agent B，cycle21/token=dft-orch-21-b-c8a0a832-4f93-46f6-adaa-912c7ab4f1d9。

**原冻结89+19真实DOM、28生产类型负例、6组真实包外消费均通过；新增缩放专项9项中5通过/4失败，独立确认C-89。**
普通 npm 三入口及所列相关回归也由 B 实际执行通过。C-88 已由提出方C21正式关闭于B修订70f91e5；固定产品内旧脚本仍待A吸收修订。
不对该单元作无保留通过结论；交A修复C-89后复验，不代C关闭，不宣告完整M5、Electron或UI→Core整链通过。

## 固定版本与 oracle

- 完整产品：d4230224005f116272369c2e501a4e468151e9bc；运行时6a91b2222eebcccb0c8de5b432731eda0dece084。
- DESIGN：339683字节，SHA256 2edd3f5bcf120da0ff6e0c13de04eb27c1401d650e652608f1b627b353c54069，§6.14。
- B 原冻结：64f570d9bb2306a2350b6fcf607d8c65a51458e6；Q1/Q2 增量最终f79827e75b733db7036e213943a3c627b800bcd2。
- B 设施修订：**70f91e5b8e8e968da0b34d534c3461b33f139d52**；B 起点d38847c，test/m5-tree。报告独立提交，SHA见REVIEW_LOG。
- 缩放专项独立冻结：**90ff51d3203a5511b70b8228dd54af7669ffa2a7**，4新增文件；提交后才首次运行9项，未放宽旧预期。
- [本轮计划](plans/B-source-view-runtime-recheck.md)；原逐例输入/预期/依据仍在
  [89项](../web/tests/independent-source-view/cases.mjs)与[19项](../web/tests/independent-source-view/q1q2/cases.mjs)。

没有从 A 组件/接线实现、diff、负例或自测档生成预期。非严格盲测，已读固定交接、规范、计划与公开包入口。
B 只实施必要的 C-88 设施适配，不改任何业务期望，不替产品写修复。
旧 commit、原红基线和历史报告不改写；新绿属于当前产品，不追溯把尚未实现时的红变绿。

## 覆盖与实际结果

89项覆盖五态/旧文旧错清除、UTF-16原文/非空mark/空文与EOF/changed、诊断只读三字段及恶意getter、
非法/合法props、局部滚动/新旧data/隐藏及零视口恢复/StrictMode/多实例、焦点/键盘/原生文本选择与复制、借用SDK/L6资源以及无CSS基础布局。
19项专项覆盖className省略/空串/显式undefined等8输入、直接正文容器ARIA关联的8文档及换态/多实例/严格模式3场景。
不固定组件标签、ID拼写、私有CSS类或算法，也不把SDK受控Transport当Core/Electron。

28项生产类型负例逐一去掉expect-error，只接受对应行真实语义诊断，正例0诊断，20个真实fixture值类型正确。
6组真实tarball消费执行pack/install/发布声明/React peer与单实例/公开CSS/包外浏览器挂载，不用monorepo alias或替代组件。

| 运行范围 | 实际通过 | 计数边界 |
| --- | ---: | --- |
| B直接原DOM | 89/89 | 真正生产SourceView，fail0/skip0/blocked0；10.012秒 |
| B直接Q1/Q2 DOM | 19/19 | 同一生产组件，fail0/skip0/blocked0；3.062秒 |
| B新增缩放DOM | 5/9，失败4 | §6.14.4原可见性/身份规则，C-89；skip0/blocked0，不是能力缺失或设施失败 |
| B直接包外 | 6/6 | 全本地tarball显式offline，真实安装与外部消费者；4.553秒 |
| 生产类型 | 28/28 | 原普通入口和修订后real/alias均实际执行；唯一语义仍28，不按重复运行相加 |
| 普通SourceView model/package/controls | 各退出0 | model重跑同一89+19/28；package重跑6；不算新场景 |
| B设施控制 | 清单5、原生浏览器5+14、Q2 fixture8 | 设施明确productMounted=false；不与108产品DOM混计 |
| 既有A入口设施，由B执行 | 19/19 | 是A authored wrapper控制，不冒充B独立业务oracle |
| B树/属性/导航模型相关回归 | Node287 / model281 / model310 | 各无失败/skip，相关严格类型入口也通过；不是历史1096属性全层或2511全集 |
| 既有A客户端/ViewModel回归，由B执行 | 47 / 24 | 作者归A、执行归B，不与独立SourceView计数相加 |

所有浏览器/包运行的cleanupErrors为空；fixture根/借用对象/订阅/任务清理在冻结范围内通过，不等于证明无限时间或任意负载无泄漏。
两条非零捕获分账：修订前C-88合法路径别名设施复现退出1；C-89新增9项运行退出1，其中4项实际产品定位失败。
不把一个命令退出1算作只有一个失败用例，也不把4个产品失败隐藏在原108绿测后。

## C-88：独立复现、两处适配与回归

P/web经macOS正常/tmp与/private/tmp两种路径访问，同一device/inode、同一React类型18.3.26：
原脚本proposal以别名退出1，精确失败是pos.inputs.includes(react)；仅换realpath后原脚本退出0/28负例/20fixture。
本轮不把C之前执行当B证据。

只修改原verify-types.mjs两处表达式：预期React路径用fs.realpathSync；实际存在的compiler input用realpath精确比较。
保留真实React声明消费断言、全部strict参数、readonly/联合/28诊断行检查、fixture和Node/Electron ambient排除。
虚拟fixture文件不直接realpath。没有删除断言、复制第二套核型脚本或改预期取绿。

[路径回归](../web/tests/independent-source-view/recheck/verify-c88-paths.mjs)先检查脚本只发生上述两个精确文本替换，
再运行proposal/production×real/alias四组，均退出0/各28负例/正例0诊断/20fixture，56.289秒。
它证明同一真实React文件被消费，不将“某个同名文件存在”当成功，也不将4次执行说成112种类型规则。

当前B的verify-types.mjs为4610字节/SHA256 8bb8069f82d69f4b09de436aa6ef22fd86a3e2929160f54c2062c0ae1151f4f8；
原文件SHA256 6b7a54f90b7676277fc0615e56014952e0fa7d3bec6361862901b060b5935cf6保留于固定P、原commit与机器档。
当前这个设施文件不再声称逐字等于旧冻结。旧核档器--inputs在纯固定P核原字节；
当前适配使用本轮精确变换核验器，不绕过旧hash或改历史机器档。

## 实际命令与环境

### C-89独立追加冻结与复现

收尾时读到C公开反例后，依据已有§6.14.4“首次/新data起点进入可测正文视口，同data保留用户滚动”另冻9项。
未读C探针源码/截图、A组件/diff，不使用C的输出数值作预期。输入沿原B longText/point和合法L6 DTO；
实际DOM Range与变换后的正文视口比较，按实测布局比例处理border/scrollbar，不硬编码scrollTop/Left或算法。
固定预留宿主尺寸避免原生scroll anchoring；原文/mark、焦点/Selection、父/页面滚动分别核对。

| 宿主scale | 首次 | 新data（相同值但新身份） | 同data用户滚动 |
| --- | --- | --- | --- |
| 0.5 | 失败 | 失败 | 通过 |
| 1 | 通过 | 通过 | 通过 |
| 1.5 | 失败 | 失败 | 通过 |

B实测示例：scale0.5首次正文视口left35/right260/top200.5/bottom324，caret left407.617/top787.5，目标在右/下方视口外；
scale1.5首次视口top233.5，caret top=-282.5，目标在上方视口外。这些是失败证据而非期望常数。
四红均为exact start outside actual scaled viewport；无焦点/Selection/祖先滚动错误或cleanup错误。
B仅确认可观察行为不符合契约，不读取实现确定内部算法根因。C-89 Medium/open，交A修复/C窄复核，不增加设计审批。
[新增清单](../web/tests/independent-source-view/scale/cases.mjs)、[计划](plans/B-source-view-scale-freeze.md)。

### 环境与命令

N=/Users/jiangbowang/.npm-global/bin/node（24.21.0）；npm=/opt/homebrew/bin/npm（10.9.2），TS5.9.3。
B=/Users/jiangbowang/MOI/2025/dftartist/2026.9/dft_hierachy-test-m5-tree。
E=/tmp/hier-b-orch21-source-view.GAIiol；P=E/checkout with space 中文，纯detached固定产品。
T=P/web（本轮独立npm ci安装82依赖），React/DOM18.3.1、React types18.3.26、Playwright1.64.1、esbuild0.25.11，
Chromium156.0.8078.4，macOS arm64。
PATH=/Users/jiangbowang/.npm-global/bin:/opt/homebrew/bin:/usr/bin:/bin；
直接B入口显式HIER_B_PRODUCT_ROOT=P、HIER_B_BROWSER_TOOLS=T、HIER_B_NPM_BIN=/opt/homebrew/bin/npm。
直接package另设npm_config_offline=true；普通package使用固定产品公开入口的默认本地tarball策略，不改产品脚本。

完整绝对argv/cwd/UTC完成时间/耗时/合并stdout+stderr均入档。主要命令：

- npm --prefix P/web ci --ignore-scripts --no-audit --no-fund；npm --prefix P/web run check：各0。
  check6.748秒，四包fresh TS/195定义27方法/51模块170依赖/7分层反例。
- B的run.mjs、q1q2/run.mjs、package.mjs：各0；输入/预期均为原冻结。
- B的scale/run.mjs：冻结90ff51d之后实际退出1，9执行/5通过/4失败/skip0/cleanup0；不是xfail或替代组件。
- 原verify-types.mjs proposal：alias1、real0；修订后recheck/verify-c88-paths.mjs：0/四组。
- npm --prefix P/web run test:independent:m5:source-view：0，26.128秒；
  :package：0，4.691秒；:controls：0，4.126秒。正常路径通过不作为原alias已修的替代证据。
- npm --prefix P/web run test:independent:m5:tree / :properties / :source-navigation / test:client / test:viewmodel：各0。
- P中的原verify-evidence.mjs --inputs与q1q2/verify-evidence.mjs --inputs：各0，只核历史档。
- E/audit.mjs、E/protect.mjs --protect、Prettier --check、node --check、git diff --check：各0。
- 本轮recheck/verify-runtime-evidence.mjs --inputs --product --protect：0；核档不是产品再次执行。

browser技能内置执行入口四种发现不可用，按fallback使用固定Playwright；没有声称内置浏览器已连接或借用A截图。
本轮没有新增产品依赖、改生产文件或用假SourceView代真实导出。

## 证据、保护、兼容与限制

[机器档](m5_b_source_view_runtime_recheck.json)：**788397字节 / SHA256 d74dc71ea04b77a07bc4b1ece6e70e69b1f513c5cdc4424f10d954c522a957df**。
40完整命令捕获、86材料、87校验gzip块含原快照；每捕获另有完整gzip输出，C-88四个子执行也各存完整gzip/sha/argv。
[核档器](../web/tests/independent-source-view/recheck/verify-runtime-evidence.mjs)校验原19输入和当前3维护文件、C-88精确变换、原失败、全部当前绿与资源清理。
--product需显式P，--protect需本机原路径；提交/日志后置回执只存E，不递归改档。

保护共享1031/B698/P1013原文件，**仅B核型脚本1个已有文件登记允许变更**，其余字节+mtime保持；
共享46声明、P独立46声明逐字一致、初始2manifest及实际8工具pin保持。
旧25文件在共享/P原样，B除登记的核型适配外24文件原样，历史报告与红保持。
原日志2049469字节前缀保持；主树HEAD/暂存不动，B提交后干净；M3-coordination/research与旧工程/ref原样。
292个Core/protocol/ci及client/viewmodel/protocol-types生产blob与de11aa2完全一致；没有据此冒称本轮重跑原生测试。

B无API/ABI/IPC/Schema/protocol2/schema7/锁/配置/工程格式变更。
产品本次公开新增SourceView/Props、CSS子路径和React peer已按实际包消费者验证；旧版本导出2保持。
首版无持久化，旧工程加载/恢复/迁移不适用。

未执行Core新编译/CTest/sanitizer、SDK→真实Core回归与2511全集、完整check.sh三配置、真实main/preload/Electron IPC/UI→Core整链、
候选确认Selection/L06/L09–11 UI收口、操作系统剪贴板/读屏、Linux/真实设计规模/远端CI、SSR或M7性能；
不拿浏览器、SDK受控Transport或同字节Core身份替代这些能力。

交A原样吸收70f91e5、90ff51d及本报告提交；C21已正式关闭C-88，仅关闭其审过的B修订，不宣称旧固定P脚本已修。
本B只记录C的关闭事实，不将C四组执行冒称B再次执行；B自己的独立复现/四组取证仍按本档归属。
原冻结门禁通过，但新增C-89四红使B不作本单元无保留通过结论；交A修复后按90ff51d及原冻结复验。
不接管下一源码交互或A/C/D，不把本单元当M5整体。新事实出现前的未提交草稿非交付，已在E保留，不重写历史冻结/红。
C-87/早期已验单元不重开，D-03仍M6，不新增D/用户审批、新会话/定时器或跨会话投递。本轮交接后结束。
