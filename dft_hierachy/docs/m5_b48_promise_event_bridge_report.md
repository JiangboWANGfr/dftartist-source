# B48 独立报告：pending 原 Promise 的公开命令→React 事件截止桥接探索

本轮已完成七个**已知消费者设施**的独立冻结和执行；不是 SourceCandidatesView 替身、正式 Q1 oracle 或组件放行。Q1Closed/approvedObserver/formalUIOracle 均保持 false，候选 UI/Core/Electron 目标执行0。

## 固定对象与范围

- A 固定产品：a3468d074d71ac9d22c51b2c7df0acaf25fc79dc。
- B 初始：60963889a4607e7469a9bbd018e44f925ccce7e4，分支 test/m5-tree。
- 首冻六文件：1146d39bfbf7d46e9ff181f5f3dba4cc2ee5f84b。
- 独立边界修订：68afcb78140df40cd43ff0a4596efe4025a4d632。七项消费者及其 reaction 预期不变。
- DESIGN 全文390820字节/SHA256 c653c753460e948fde92aa6f08978d1e7f0fd3be6922bc0cf9b7fb587a8a238c；§6.18.1至§7前15412字节/SHA256 baa78949e5354e1ed384e0f57b141002c1f3c1391a1fd25a790dca9ed08de1db，沿前冻未变。

依据 DESIGN §5.6.3/6、§6.13.2、§6.18.5/6及C47允许的 pending 子集探索。只用规范、旧B fixture与公开接口定义预期，不读A生产实现/diff/自测定oracle。日志读取含A状态和自测摘要，但其结果未作本B证据，不宣称日志阅读全程盲审。

M=/Users/jiangbowang/MOI/2025/dftartist/2026.9/dft_hierachy；
B=/Users/jiangbowang/MOI/2025/dftartist/2026.9/dft_hierachy-test-m5-tree；
E=/private/tmp/hier-b-orch48-q1-bridge.ryIO68；P=E/fixed product 中文（独立detached、原锁fresh构建）。
N=/Users/jiangbowang/.npm-global/bin/node；D=web/tests/independent-source-candidates-view/promise-event-bridge；
H=web/tests/independent-source-candidates-view/promise-heap-diagnostic/facility.test.mjs。

## 输入、截止及实际观察

实际 SDK、SourceNavigationModel、SelectionModel 和合法 controlled Transport，准备 complete+next 原前缀或原文档绑定；测量期间不答 source.resolve。
公开方法同步 Reflect.apply 一次，原 receiver/零参数/原 Promise 原样返回；wrapper 返回前 debugger baseline，此时消费者尚未收到原值。观察器不读取 then/constructor getter、不加处理器、不替换 Promise/realm/prototype。
普通 React 按钮中装入已知消费者，React根外稳定祖先按同一 native Event 身份在冒泡尾暂停；不等 click/Runtime.evaluate 回包才截取。原 Promise 仍 pending，late marker 为 false。暂停内重复原堆保持反应链身份，不调用显式GC。
P05/P06由真实Nav pending通知内flushSync卸载：layout cleanup、空DOM早于baseline；原调用栈继续收到相同Promise，祖先尾仍到达。没有用active=false替代真实卸载。

| 控制 | 原命令/已知消费者               | 截止新增 reactions/dual/single/empty | 最终                 |
| ---- | ------------------------------- | ------------------------------------ | -------------------- |
| P01  | loadMore / 直接双分支           | 1/1/0/0                              | 通过                 |
| P02  | reloadCandidates / 原生 await   | 1/1/0/0                              | 通过                 |
| P03  | loadMore / 空转发后派生消费     | 1/0/0/1                              | 通过（负控被区分）   |
| P04  | reloadCandidates / 微任务才安装 | 0/0/0/0                              | 通过；later才1/1/0/0 |
| P05  | loadMore / 同步卸载后仍消费     | 1/1/0/0                              | 通过                 |
| P06  | loadMore / 同步卸载后跳过       | 0/0/0/0                              | 通过（负控被区分）   |
| P07  | loadMore / 仅成功分支           | 1/0/1/0                              | 通过（负控被区分）   |

七项baseline各有一个真实模型内部reaction，差值必须扣除它；不能把内部消费或最终无unhandled当视图消费。闭包数量只描述这些已知控制，不判生产函数角色。
完成测量后才发送合法complete成功回复、等待控制自身输出；不是错误分支行为/原抛值反馈验收。全部正常路径清理errors/unhandled/cleanupErrors、pageErrors/外层cleanupErrors空，wire监听0、React DOM空、方法恢复。原模型/Selection不被借用视图取消或替换。
输入由HTMLElement.click产生，是synthetic激活，不是trusted设备/读屏/Electron。

## 首轮失败及独立修订：B48-INPUT-01

首冻浏览器7项5过2失败：P02/P04已得到正确反应链，但收尾把Transport规范化params误当L6调用options，要求cursor自有字段不存在。
独立公开API探针也先错误预期undefined，exit1，实际为首页空字符串。保留该探针、原异常/双流，不称探针首轮成功。
DESIGN§5.6.3明确缺省/空串是首页，§5.6.6要求方法默认在SDK边界补齐；旧B导航和分页输入亦明确wire首页空串。
据这些独立依据，改为reload wire cursor严格等于空串，loadMore仍严格等于原next；新增一个规范化边界控制，未改七个反应链预期或生产实现。
修后探针exit0、Node16/16、浏览器7/7，B作为提出方按此范围关闭B48-INPUT-01。首冻/原28堆、修订/新28堆及失败均保留。

## 实际命令与结果

命令前缀 PATH=/Users/jiangbowang/.npm-global/bin:/opt/homebrew/bin:/usr/bin:/bin；
浏览器显式 HIER_B_PRODUCT_ROOT=P、HIER_B_BROWSER_TOOLS=P/web、HIER_B_Q1_EVIDENCE_ROOT=E，cwd=B（npm另注）。

| 实际命令                                                        | exit / 秒 / 结果                                                   |
| --------------------------------------------------------------- | ------------------------------------------------------------------ |
| git worktree add --detach P a3468d0；N E/protect.mjs --snapshot | 0/0.718；0/0.973                                                   |
| npm ci --offline --ignore-scripts；npm run check（cwd=P/web）   | 0/0.745；0/7.318，196定义/27方法、tsc-b、54模块182依赖、7分层负例  |
| N --test --test-reporter=tap D/facility.test.mjs H              | 0/0.068，首冻15/15                                                 |
| N D/run.mjs --list；N D/run.mjs，首冻                           | 0/0.035；**1/8.737，7执行5过2失败**                                |
| N E/cursor-probe.mjs；N E/cursor-probe-corrected.mjs            | **1/0.056**；0/0.054                                               |
| 上述Node命令，修订后；N D/run.mjs，修订后                       | 0/0.068，16/16；0/8.718，7/7                                       |
| N E/source-audit.mjs；N E/package-heaps.mjs                     | 0/0.292；0/8.587                                                   |
| N E/protect.mjs --check；N E/seal.mjs                           | 0/0.636；0/0.219                                                   |
| N E/verify.mjs                                                  | 0/4.411，metadata API1正8负、56原堆重放、缺省/不存在heapRoot两负控 |

Node24.21.0/Darwin arm64、React/DOM18.3.1、Playwright1.64.1、Chromium156.0.8078.4/revision f842f52ef39fd97b449eb27cff414bf05a98ddce、V8 15.6.75、esbuild0.25.11、Prettier3.9.10，原锁无新依赖。
npm verbose stderr如实保存，不能称全部stderr为空。两个fixture bundle不同：首冻e5359c7e74916119fd1a49f6601ff950bdf31b4d1c975071a94c674630a87746；修订4cd9bbed7ffa46821290dc8b8a8b55a27d5e99d9f6811fb355bbddc4c333fb66。均为runner实际buffer原字节，不是另行重建。
一次工具编排源码拼接语法失败、一次编排在格式命令后引用未定义E，均未启动对应审计/保护命令，不能冒称有命令捕获；后续正确调用成功，不影响输入/旧字节。

## 归档、原堆与独立回读

[提交证据](m5_b48_promise_event_bridge_evidence.json)含21次完整命令捕获/42外层分离双流、19材料、157校验压缩块；内含42条来源Git/84完整流、两个冻结阶段12份原输入及两次runner实际bundle/metafile/result。
12当前输入（六新+六旧）、B47两历史引用、98fresh产物metadata、规范和原失败均有长度/SHA。显式metadata API是1正8负，拒绝空对象、缺首失败、流篡改、丢堆索引、路径穿越、丢pin、正式oracle冒称及重算checksum的晚微任务伪造。

**56份完整原堆不内嵌Git JSON。** 原字节共615578137字节，lossless gzip sidecar共110950445字节，位于E/heap-sidecar。Git档逐份保留原/压缩长度与SHA256、相对文件名；原未压缩文件同时留在E/event-bridge-QKja7D及E/event-bridge-NNOw3j。只带Git JSON不能声称取得原堆或完成原堆回放；复制该归档时须另带sidecar目录。
本B已实际显式调用verifyHeapSidecar，逐份校验56压缩/原字节和SHA，重建每份heap graph，按原Promise heap ID核baseline/immediate/repeated/later与归档投影相同，再核差值；不是只回读摘要。恢复后及两份暂停内快照分别保存，不回填截止。
封后verify/corrupt-heap-control/格式/提交及最终保护回执另留E，不递归改档。

复核API（导入本身不运行）：

```js
const a = JSON.parse(
  fs.readFileSync("docs/m5_b48_promise_event_bridge_evidence.json"),
);
verifyEvidence(a, { root: process.cwd() }); // metadata/双流；明确返回 rawHeapsReplayed: 0
checkEvidenceControls(a); // 1正8负，不执行产品
verifyHeapSidecar(a, {
  heapRoot: "/private/tmp/hier-b-orch48-q1-bridge.ryIO68/heap-sidecar",
});
```

## 来源、保护、新C状态与交接

只核B自己的测试来源raw blob/delta：249c20a→fabed9a、9adca59→6777110、179bfdc→c0dcbed、6096388→732cda0，四笔及最终11路径相等；未查看A生产实现/diff定oracle。core/protocol/web packages/scripts/原锁/check七树项同bf8ef4d，P fresh98编译JS/声明同M及旧B47 pins。
M/B/P旧ordinary1408/991/1390、M49声明/3Core bytes与mtime及原日志前2982655字节/SHAae0063433f4b29a675640a5bf4d10dffb124c29b3c5eab1d7dcc8dc87f78946a保持；共享日志仅追加不提交，保留并发C48。主树/index/原协调/research不改。

已读C48正式结论：G01/G02会话边界在synthetic范围合理，B47-FACILITY-01原窄修复成立；**新增C-99开放**，指公共context部分构造失败时第二Nav/Client未回滚。该新事实未由本B复现/修复，不称关闭；需后续独立单元先冻pair异常释放控制再修共同所有权helper，保留原selection控制和G01/G02预期。
C48明确不以C-99阻断本轮pending探索，但本B48也**没有覆盖部分构造异常回滚**，不能泛称所有异常路径资源已释放；正常七项清理通过不能消除C-99。本轮不重跑B47同一全量门禁。
已有B辅助静态审首冻及修订，未发现新确定设施阻断；未执行，不代C。C48未审本轮尚未交付桥。

交A：可原样导入首冻、边界修订及证据提交，保留失败/不足；不据设施绿实施/放行完整候选组件。交C：请审原值透传、真实通知同步卸载、根外同事件截止/late反例、baseline差值及外部原堆回放；未获正式oracle认可。
下一B单元：C-99需独立冻结并修helper部分构造所有权；Q1仍需settled、合法分支角色和实际候选桥等差额，不能强迫then写法。累计106计划DOM/30历史类型仍部分冻结，连续原行新代次/旧闭包/完整生命周期/空态强关联/AX/真实纵向链差额保持。

本轮不改生产/API/ABI/C++/TS/IPC/Schema/protocol2/schema7/依赖/配置/工程格式；首版无持久化，保存/恢复/迁移不适用。
未跑无变化Core三配置/CTest/ASan、完整check.sh、属性1096/旧DOM/类型/包消费全集、真实Core候选UI/Electron/IPC、大设计、Node20/22/跨平台/压力/远端CI。不是整个M5或完整产品构建通过。
D无新输入/D-03仍M6；本cycle48完成本单元冻结、实际证据和交接后结束，不接管A/C/D、不新会话/定时器/另排消息或轮询。
