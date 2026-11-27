# B25 观察控制接线独立复验

本轮新增标准接线验收通过。固定5c81d81的生产与473bfb0逐字保持；B原维护/报告原样导入。
新增16设施测试在接线前基线为9绿7红，当前16/16通过；真实标准controls确实执行原B观察脚本，不只是stub通过。
C-90/C-91已由C24关闭，保持关闭；本轮不重跑同字节119/42/包2、旧117/28/6或Core全量，不宣告M5整体完成。

## 固定对象与独立冻结

- 完整交付5c81d81e4b46e58b66f4b911a85ecf03e02d5202，接线e0a1deceeb2dac08641dcf39621d7dc75555c787；运行时7aea654不变。
- B维护51606dc → 导入722caf57bb71a55f687db899c3b7803db1dccd9b；报告94be13e → c1f7b62c5edb791a68d420fbfc04e19760c25ce0。
- 新B冻结b98dfb50ffa5f2603b11319ad17c9f47cfaa7ca7；三个文件为计划、gate/cases.mjs和gate/run.mjs。
- DESIGN351113字节/SHA256 f0da663bb4fc4517cfe0e9ebaac3013059e05b1b25f54cd9a2374a90505248f5。
  §6.15.1–4正文另与473bfb0逐字核同；只更新接受状态，没有新业务oracle。

依据为DESIGN、已冻B24控制、旧B标准门禁原则和公开npm/命令接口；未读取A生产实现、新wrapper测试、source-position-browser、自测档或聊天生成预期。
公开wrapper是本轮被测设施，按原字节复制执行；不在fixture中实现它。A交接中的完成/自报结果不算本B证据。
独立16在执行新旧wrapper前先提交冻结，无skip/xfail，不根据运行结果修改预期。

## 验收条件、覆盖与判断

逐项输入/预期/依据见gate/cases.mjs。16项全部是OS子进程/门禁设施，不是SourceView或UI→Core测试。

| 组             | 数量 | 输入与判断                                                                                                                                   |
| -------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 正常/重复      | 2    | 原7个显式文件＋新观察入口各执行一次；重复各自marker独立。root/tools绑定wrapper检出，caller假root及外部cwd不能污染；controls无需npm可执行入口 |
| 新观察入口故障 | 5    | missing/directory须在任何子项前非零、marker0；exit23保持23，SIGTERM非零且报告信号，throw保留错误文本，不吞失败                               |
| 较早子项故障   | 2    | 普通脚本exit23/SIGTERM后不再运行后续项，防止只在末项测传播而漏掉短路                                                                         |
| 旧显式输入     | 4    | 多文件node --test首/第二输入缺失、第二输入为目录、晚位旧入口缺失；全部前置拒绝，marker0                                                      |
| 非法调用       | 3    | 无mode、未知mode、额外参数均非零且不执行子项                                                                                                 |

普通脚本的exit23不套到node --test聚合子文件；后者有自己的退出语义。
不强加“wrapper必须穷举所有传递jsx/module预检”新契约；本轮全体预检只针对显式子命令输入。
fixture每例以mktemp建立自有带空格/中文根、复制原wrapper、注入字面子进程桩；去掉NODE_TEST_CONTEXT继承，核args/cwd/P/T/marker和失败后执行集合。
finally只删除明确验证的自有临时目录，保留每次argv/cwd/UTC/状态/信号/耗时与stdout/stderr压缩原流；cleanupErrors均空。
所有故障只在该副本，不改主树、P或旧B冻结。重复case在旧基线首轮即红，其第二轮断言尚未到达，不冒称已执行两次。

正常路径核对8个入口；故障矩阵选择4/8入口missing、2/8入口directory，不是全部入口的笛卡尔穷举。
当前16用例共17次wrapper调用（repeat两次），不算17项产品测试。

真实标准controls另从完整输出解析唯一B观察报告：6真实同步阳性、18真实延迟阴性、24合成、2 React DOM提交、7透明性/清理；
48条观察逐项passed且observed只在sync为true，产品执行0，清理channels0/probeActivefalse/listeners0。
eventPhase和dispatchEvent即时DOM只作观察，不当同步/提交判据。

## 实际命令

E=/tmp/hier-b-orch25-observation.2GQA30；P=E/checkout with space 中文；B为dft_hierachy-test-m5-tree，branch=test/m5-tree。
N=/Users/jiangbowang/.npm-global/bin/node v24.21.0；npm=/opt/homebrew/bin/npm10.9.2；PATH首部固定Node目录。
TS5.9.3、React/DOM18.3.1、@types/react18.3.26、Playwright1.64.1、esbuild0.25.11、Chromium156.0.8078.4，macOS/arm64。
独立命令cwd=B，HIER_B_PRODUCT_ROOT=P、HIER_B_BROWSER_TOOLS=P/web、HIER_B_NPM_BIN=npm；标准npm命令cwd=P。
新16脚本只需Node，不会使用浏览器或执行生产。

| 实际命令                                                                                 | 退出与结果                                                                                              |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| npm --prefix P/web ci --ignore-scripts --no-audit --no-fund；run check                   | 0/0，fresh锁依赖、四包TS/生成/分层通过，check6.811秒                                                    |
| N web/tests/independent-source-position-interaction/gate/run.mjs，P指向旧473bfb0固定检出 | 1，2.421秒；16实际9绿7红，skip/blocked0。旧wrapper未接新入口，正常/重复及新入口五故障为红，原失败全保留 |
| 同命令，P指向本轮5c81d81                                                                 | 0，2.807秒；16/16，skip/blocked0，含重复case两次命令，所有清理过                                        |
| npm --prefix web run test:independent:m5:source-view:controls，cwd=P                     | 0，9.114秒；真实原B观察24/24/2/7已由原输出逐项核对；另A作者wrapper36/36，执行归B、作者归属单列          |
| N E/audit.mjs（缓冲区修订后）                                                            | 0，0.164秒；两笔B完整补丁/8路径blob一致，原41测试材料、302生产Git对象、48声明与旧接受身份一致           |
| N web/tests/independent-source-position-interaction/recheck/verify-runtime-evidence.mjs  | 0；B24可携档完整核验，只验档不记作本轮业务执行                                                          |
| Prettier、node --check、git diff --check、E/protect.mjs --protect                        | 均0；初始文件/声明字节与mtime、日志前缀保持                                                             |
| gate/verify-evidence.mjs，及--inputs                                                     | 均0；本轮核档并核2939项原输入/48主树声明及日志前缀，不是产品执行                                        |

两个正式非零均封存：上述旧基线7红；来源审计第一次git show完整B报告补丁超过Node默认1MiB缓冲区，ENOBUFS退出1。
后者为B设施缺陷；将审计缓冲区显式设16MiB后0，未改产品/测试预期，原错误和审计前后脚本均封存。
测试内按预期注入的exit23/SIGTERM/throw是成功的负向断言，不误记为产品失败。
未读A新增自测源码来改oracle；标准命令自动执行的A36不替代新16独立测试。
新16目前是本轮显式独立命令，未宣称已自动接标准总入口；原B观察控制则已实际接入。

## 证据、兼容和保护

机器档[m5_b_source_position_observation_gate_recheck.json](m5_b_source_position_observation_gate_recheck.json)：
597434字节/SHA256 5855c510ee8029cb974d61339cf712fd55dea6aa76369fc3a1aeb61eb147a7fb。
17完整正式捕获、23材料、23压缩块；完整合并双流及子进程分别双流、原/新wrapper、独立fixture、规范、工具清单/锁、初始快照与审计脚本。
封存后核档/正文身份/报告/提交/共享日志回执单列E/post-seal-receipts.json，不递归更新档。

可携核档（不执行产品）：

    node web/tests/independent-source-position-interaction/gate/verify-evidence.mjs
    node web/tests/independent-source-position-interaction/gate/verify-evidence.mjs --inputs

旧B24档1069639字节/SHA b27ec085888057c54c107bef3b6f8bdf7aa16571655de4e907159962511be008原样保持；新档仅引用pin和核验输出，不改历史材料。
主树1088/B733/P1070初始文件和48主树声明字节/mtime保持，新增文件仅B测试/报告；原有M3-coordination/research保留。
日志初始2185043字节/SHA8ea2c793d874cc006bd1cb1a09045d260d155c7fe066abdd27b5db8c2869c857前缀保护，REVIEW_LOG仅追加不提交。
生产L0–L7/Core/协议/Schema/CSS/依赖锁/public API/ABI/工程格式均无本轮变更；没有新增业务实现或期望修订。

## 限制与交接

本轮只验新增接线，不重跑业务119/42/包2、旧117/28/6、Core重编/CTest/ASan、完整check.sh/test:independent。
未执行A新增浏览器产品补充脚本，相关源码/资源审查归C；不把A执行记成B。
未验真实main/preload/Electron UI→Core、候选确认→Selection、L06/L09–11、OS剪贴板/读屏/SSR、其他平台/浏览器、真实设计规模/M7或远端CI。
首版无持久化，工程保存/损坏文件/恢复/迁移不适用。browser技能内置执行入口缺失，按fallback锁定Playwright仅本机页，不称in-app/Electron认证。

- 交A：本轮B门禁16及证据可原样导入；生产不变的报告/测试导入只核来源，无需再重复同一业务全量。
- 交C：本轮未发现新增确定接线失败，不重开C-90/C-91；新16预期和故障输出独立可核，A探针修订审查仍归C。
- 交协调器/D：B25完成；下一候选确认权威地址契约尚须正式C审/B冻，不自行进入实现。D-03仍M6，不接管、不增审批/会话/定时器。
