# B43：反馈内会话失效与最近动作部分冻结

固定产品 `0a0f0f17c80606781d91317065a69b65b380459c`；B 初始 `b7b61626d646ac06ee57edb68f3964dd149a4ef3`。
首冻 `ed2dcb306bfe16f74a6ef667a8b8e470c082a942`，先 commit 九份输入再执行。计划见 M5-source-candidates-view-b43-feedback-lifecycle.md。
依据 DESIGN §6.18.1/3/5、§6.5.4/6.17、公开声明与独立合法 wire/真实模型 fixture；没有读 A 生产实现/diff/自测生成 oracle。

## 输入、预期及实际

| ID  | 输入                                                        | 独立预期                                                                                                | 目标实际          |
| --- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------- |
| T01 | 原 action0 确认已提交选择后抛 E；回调同步卸载 root 再抛原 X | 浅冻原 failure 一次，提交/历史保留；无失效边界或全局错误，无重试/query/dispose 共享模型                 | 缺组件/CSS，执行0 |
| T02 | 两真实模型对事件前就绪；旧回调同步换模型对后抛 X            | 旧确认/回调各一次、旧提交保留；新模型仅合法初次绑定，不接旧选择/反馈/边界或全局异常                     | 同上              |
| T03 | 同一次 evaluate 同栈 click 原行0/1，中间无 await            | 两原 action 确认各一次、两真实提交；仅最近 action1 原 E1 的一次 failure/中性反馈，无重新签发/重试/query | 同上              |

E 来自真实 Selection 提交后宿主 listener 抛值，经原 confirmCandidate 同步透传；X 是原 Symbol。两连续 E 不要求互异。
记录器保持原 receiver/args/return/throw，不读取 then、安装原 Promise 处理器或替 UI 消费；完成 Promise 只属于宿主。
合成 HTMLElement.click 无 pointerdown，为辅助激活形状，不称 trusted 设备、平台读屏、真实 Core 或 Electron E2E。

新增原生 window.error/unhandledrejection 与 runner pageerror 两通道。设施各注入一个明确原 Error/原 Promise rejection，核原身份及恰好两条匹配 pageerror；只移除确知的设施记录，不删除目标事件，不 preventDefault。无事件不能证明 Q1。
先 root 卸载、取消 DOM 等待、解除宿主完成等待、恢复公开记录器、退订宿主 listener，再释放自有模型/SDK/wire，MessageChannel 检查点后关闭全局观察；异常逐项留存。15秒 watchdog 仅设施防挂。

## 本 B 实际命令

E=/private/tmp/hier-b-orch43-feedback-lifecycle.EByZiq；P=E/fixed product 中文，独立 detached 固定产品；cwd=/Users/jiangbowang/MOI/2025/dftartist/2026.9/dft_hierachy-test-m5-tree。
N=/Users/jiangbowang/.npm-global/bin/node；PATH=/Users/jiangbowang/.npm-global/bin:/opt/homebrew/bin:/usr/bin:/bin。
浏览器测试显式 HIER_B_PRODUCT_ROOT=P、HIER_B_BROWSER_TOOLS=P/web；Node24.21.0/Darwin arm64、Chromium156.0.8078.4、React/DOM18.3.1、esbuild0.25.11、Playwright1.64.1、Prettier3.9.10 与既有锁一致。

| 命令                                                                                                                                  | exit / 结果                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| git worktree add --detach P 0a0f0f17…；P/web npm ci --offline --ignore-scripts                                                        | 0/0.610秒；0/0.665秒                                                                                                |
| P/web npm run check                                                                                                                   | 0/6.701秒；196定义/27方法、tsc -b、54模块/182依赖、7分层负例；非完整web/check.sh                                    |
| N --test --test-reporter=tap web/tests/independent-source-candidates-view/feedback-lifecycle/facility.test.mjs                        | 0/0.088秒，16/16：库存1、两连续提交断言正1负6、最近反馈正1负3、全局通道正1负2、真实模型1                            |
| N 同目录 run.mjs --list；--controls                                                                                                   | 0/0.032秒，T01–03；0/0.835秒，5/5前提                                                                               |
| N 同 run.mjs 无参                                                                                                                     | **1/0.425秒**，planned3/executed0/passed0/failed0/blocked3/skipped0，缺公开组件/CSS                                 |
| N --test --test-reporter=tap sync-feedback/facility.test.mjs actions/facility.test.mjs pagination/release/release.test.mjs（均同I根） | 0/0.132秒，相关旧45/45                                                                                              |
| N E/source-audit.mjs ed2dcb3…                                                                                                         | 0/0.139秒，25 Git命令/50完整流；两B42→A raw blob元数据delta相等、最终11对象相等、16冻结运行输入不变、49声明字节相等 |
| N E/protect.mjs --check                                                                                                               | 0，多次；主/B/P原普通1339/927/1321路径字节/mtime、主49声明/3Core、日志前缀不变；P干净、主未stage                    |
| 定向Prettier、git diff --check/暂存空白、N --check evidence.mjs                                                                       | 均0；非全库format/lint                                                                                              |
| N E/runtime-pins.mjs；N E/seal.mjs；N E/verify-final.mjs                                                                              | 封档流程显式校验：98产物/锁/报告/API/规范与历史档 pins，纯API 1正7负及空档拒绝；封后回执不递归入档                  |

5浏览器前提：真实两连续Selection确认1、普通实际React回调内卸载/替换2、原生error/rejection负控2，全部 candidateUI=false。
TAP fail/cancelled/skipped/todo均0。两已知故障控制 pageerror 逐条匹配；目标 gatePageErrors=[]、cleanup.errors/unhandled=[]、releaseErrors=[]。bundle SHA256 37310e13452f61df9a5e8e1efe2f51ee74bc44ec9e322325ca6cd3a2ec3342e1，warnings空。
保留能力门禁原exit1及完整双流，不用假的候选视图取绿。实际 SDK/Nav/Selection 与普通React/DOM执行过；候选DOM、真实Core候选UI、Electron纵向执行0。验档 API 自身产品执行0，不等于本轮全部产品执行0。

## 证据、保护和限制

可携档 docs/m5_b43_feedback_lifecycle_freeze.json 含全部入档命令双流、16运行输入、原规范/来源/保护/封档脚本、报告及runtime pins，gzip 块逐一长度/SHA回读；纯 API 需 import 调用 verifyEvidence/checkEvidenceControls，直接 node API 不等于验档。历史档和首冻输入不修改。
DESIGN388767字节/SHA66e4f5e882aa9ba9678215e367c4b17cee61cc91410fa7b63e57e399c40ede1d；本节15412字节/SHAbaa78949e5354e1ed384e0f57b141002c1f3c1391a1fd25a790dca9ed08de1db与B42相同。
初始日志前2803255字节/SHA475df194d0aab12fdfe0acef34c2a2f6877abcbf2485389ce55bea802b36ed47保持，日志仅追加不提交。主正常3Core未重建；原协调/research改动、旧工程/ref/真实输入未写。

C43 新增 **C-98 open**：旧 B42 S02 漏检全局同步异常。本 B43 三项新 fixture 的观察不是对应旧 S02 修复或 C 关闭；旧历史17/4/28结果不抹去。对应修订作为独立单元处理，本档保护旧S02原字节。
累计101计划DOM/30历史类型仍部分冻结，Q1/完整SourceCandidatesView/M5不放行。C-97/既有关闭项不重开，D无新输入/D-03仍M6。
未重跑无变化CLI/Core三配置/CTest/ASan、属性1096、完整web/check.sh、旧DOM/30类型/包外全集、真实Core候选UI/Electron/IPC、跨平台/Node20/22/压力/远端CI。
无生产/API/ABI/TS/IPC/Schema/protocol2/schema7/依赖/工程格式变化；首版排除持久化，保存/加载/恢复/迁移不适用。
交A可原样吸收首冻与证据，不改oracle；交C定向审T01–03及设施，不代签C；交D保持纵向差额。不新会话/定时器、不向ACD会话发消息、不继续排队轮询。
