# B-ORCH-18：C-87 标准入口窄复验

## 结论与固定对象

**B 独立窄复验通过：原四输入由 1 过 / 3 败转为 4/4，各子命令24/24。**
普通 unset 命令无需提供正确产品根也通过。C-87 正式关闭仍由 C；本报告不代 C 关闭，也不宣布 M5 整体完成。

固定产品 `cc1191ae842974b7e1b1aee7d34cd776886e0c59`；
前轮基线 `a7587b6fb3e8c57675021cb14ab50822aef5fa08`。
原 B C-87 冻结 `12d793a52681d889d22541009ca8fa83ea62ea59` 原样使用，
测试分支 test/m5-tree 起点 `3313057b47904419c64b46b25bc5850398049e9c`。

已读AGENTS、最新交接、DESIGN §6.13、VALIDATION、M3-coordination及相关计划。
已读 A 交付摘要，非严格盲测；**未读取 A 修复源码、实现 diff、自测源码或 A 机器档生成 oracle**。
只按 git 对象元数据核定变更范围，判断仍来自已冻结 input/expected/basis、公开标准门禁与规范。
本轮不增加产品功能或修改任何冻结测试/预期；只增加 B 报告、便携证据和核档器。

## 四项冻结及实际结果

共同输入为真实 `npm --prefix P/web run test:viewmodel`；
P 是包含空格、中文的固定干净检出，child cwd 是仓库外系统临时目录。
预期均 exit0、实际至少保留24项、pass=tests、fail/skip/cancel/todo均0。
这不要求未来新增测试后永远恰好24；以下24是本次实际值，不是放宽/替换原冻结。

| HIER_B_PRODUCT_ROOT 输入  | 原 a7587b6 实际       | 当前 cc1191a 实际 |
| ------------------------- | --------------------- | ----------------- |
| unset                     | exit1，23过/1加载失败 | exit0，24/24      |
| 自有临时目录内不存在路径  | exit1，23过/1加载失败 | exit0，24/24      |
| 有效、已构建的旧 b55 产品 | exit1，23过/1加载失败 | exit0，24/24      |
| 当前正确 P 根             | exit0，24/24，仅对照  | exit0，24/24      |

原红来自 B17 的原始捕获，本轮未重新执行旧基线或改写历史未接受状态。
当前四child实际 argv/cwd/envRoot/status/signal及完整双流由冻结测试记录；
无 signal/watchdog/工具错误，所有子命令24项均零fail/skip/cancel/todo。
未把4×24与额外直接unset的重复执行累计为120个新独立产品场景。
C-87 测试 finally 清自有目录并清进程组 watchdog；不据此宣称全进程无泄漏或产品超时 SLA。

## B 实际命令

`B=/Users/jiangbowang/MOI/2025/dftartist/2026.9/dft_hierachy-test-m5-tree`；
`E=/tmp/hier-b-orch18-c87.Ai98wY`；
`P=E/checkout with space 中文`；
`OLD=/tmp/hier-b-orch16-ready.Ij2g9V/source`，HEAD=b55f27de0a40ca0ffefac4a20a38ad7cf287f66e。
`N=/Users/jiangbowang/.npm-global/bin/node`（24.21.0），npm10.9.2/TS5.9.3，macOS arm64。
npm命令显式PATH=`/Users/jiangbowang/.npm-global/bin:/opt/homebrew/bin:/usr/bin:/bin`。
以下路径缩写仅便于阅读；机器档保留全部绝对argv、实际cwd、UTC完成时间、耗时、退出及完整合并输出。
四child的stdout/stderr另外完整分离记录；/private/tmp与/tmp是同一位置。

| 实际命令 / 环境 / cwd                                                                                                                        | 退出 / 实际结果                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| P：`npm --prefix web ci --ignore-scripts --no-audit --no-fund`                                                                               | 0；71依赖独立安装                                                    |
| /tmp：`env -u HIER_B_PRODUCT_ROOT -u HIER_B_OLD_PRODUCT_ROOT npm --prefix P/web run check`                                                   | 0；195定义/27方法、四包TS、49模块/167依赖及7分层反例，6.948秒        |
| /tmp：`HIER_B_PRODUCT_ROOT=P HIER_B_OLD_PRODUCT_ROOT=OLD N --test B/web/tests/independent-source-navigation/recheck/viewmodel-gate.test.mjs` | 0；4/4，各child24/24，1.429秒                                        |
| /tmp：`env -u HIER_B_PRODUCT_ROOT -u HIER_B_OLD_PRODUCT_ROOT npm --prefix P/web run test:viewmodel`                                          | 0；直接普通命令24/24，0.355秒                                        |
| /tmp：同unset两变量的`npm --prefix P/web run test:independent:m5:source-navigation:controls`                                                 | 0；8设施，不算新Navigation模型或Core                                 |
| /tmp，HIER_B_PRODUCT_ROOT=P：`N --test B/web/tests/independent-source-navigation/recheck/wrapper.facility.test.mjs`                          | 0；23接线设施                                                        |
| /tmp，同根：`N --test B/web/tests/independent-source-navigation/recheck/coexistence.test.mjs`                                                | 0；8公开模型共存/取消/诊断行为                                       |
| B：原`recheck/verify-evidence.mjs --inputs`                                                                                                  | 0；核B17原70捕获/33输入，原1过3败与未接受状态保持；当前产品语义执行0 |
| B，HIER_B_PRODUCT_ROOT=P：`N web/tests/independent-source-navigation/recheck/verify-c87-evidence.mjs --inputs --product`                     | 0；34B输入/1016产品与声明pin检查；核档器产品语义执行0                |
| B冻结文件/新报告/新核档器的Prettier、node --check、git diff --check及E/provenance、protect、analyze                                          | 最终均0；完整命令见捕获或后置回执                                    |

本轮不复用A产品二进制/生成物；P全新npm/TS构建，OLD仅作为错误根，不执行其Core。
标准test:viewmodel是A authored回归，由B真实执行；四环境标准入口判据是B独立冻结，两者分账。

## 范围、兼容与保护

独立比较 git ls-tree 路径/模式/OID：Core、protocol、web/packages、web/contracts四完整生产树不变；
DESIGN、Schema、API/ABI、IPC、package/lock、标准接线及配置/工程格式保持。
全树只12个路径变更：B17原样新增9文件、A机器档新增1、执行计划与单个A生命周期测试各1。
B九文件及C-87测试/计划均与原冻结对象同一，不读A修改内容来定义正确答案。
DESIGN仍326921字节/SHA256 `fec8a65ab9a62e1966a300e1eaa81fd6286361acd2cd4bb2063c21c96c2780f1`。

实际字节+mtime保护：共享989、B起点670、纯P971、旧错误根946个非日志文件；
共享45、旧根42声明不变；P新生成45声明与共享逐字节相同。
原日志1967861字节前缀SHA256 `e870fc0e6d2384a772cd8e366768ff91d11a421800f652c775274d8a3ebb6398`保持。
主树原REVIEW_LOG修改、M3-coordination/research保留；日志只追加不提交，主树暂存空。
本轮报告提交只含B三个新增文件，旧冻结、B17报告与原红不改。

B17的310/46/10、2511独立回归和75CTest仍是**前轮同生产树事实，不是B18重新执行**；
本次仅标准入口接线修复，按公开验证规则与上轮交接做窄复验，不因报告导入重复全量门禁。

## 便携证据与事故分账

[m5_b_c87_gate_recheck.json](m5_b_c87_gate_recheck.json)：
**964199字节 / SHA256 ef03c19f675fb74e6b173d647fde56b5d20d08d05c6afd0a6a03f22fb464d8b0**。
16当前完整捕获、2历史原红、50材料、45声明pin，共68压缩块；
解压原文2020146字节、gzip672392字节。材料含原冻结/fixture闭包、规范/Schema、对象来源、
完整初始保护、统计/保护/捕获脚本及本核档器，两个历史红明确标记notCurrentExecution。

初次877k字符快照的压缩wrapper输出超工具传输上限而截断，不能作有效capture；
原截断工具回执另存事故材料，改分块读取并校验完整摘要后才用作保护输入。
这是一次B证据传输事故，不是产品测试失败，也未靠删除/放宽测试恢复。
16正式当前捕获均exit0；不把事故或2历史红伪装成当前产品失败/当前执行。
封档后的格式/核档/提交/最终日志保护回执只存E，避免递归改档。

## 交接与限制

- 交A：原冻结四输入与普通入口已由B实际验绿；可原样吸收B报告，不需要新oracle/契约审批。
- 交C：B确认C-87反例消失；模块路径/boot时序/环境恢复的实现审查与C-87正式关闭归C。本B不接管。
- 交协调器/D：B18窄复验完成；后续遵循已授权任务与各自前置，不因报告导入再跑本轮四项/2511。
- 本轮未构建/执行Core、三配置CTest/check.sh、ASan/UBSan、Linux真实设计、远端CI或全进程资源预算；
  不把A执行或前轮结果算本轮。原全量证据仍可独立核档。
- 无真实React/Electron/main/preload/IPC/UI E2E验收；L06/L09–11、SourceView/候选UI、
  Selection权威地址、M5整体、D-03/M6、M7及持久化/旧工程迁移均不因此完成。
  首版无持久化，本轮工程保存/恢复兼容项不适用，不虚构通过。
- 不改产品、不接管A/C/D，不新会话/计时器或恢复监控，不跨会话投递；追加最终交接后结束本轮。
