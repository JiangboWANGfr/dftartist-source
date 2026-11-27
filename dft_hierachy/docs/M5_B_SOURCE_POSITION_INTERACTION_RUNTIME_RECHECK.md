# B24 SourceView 位置交互独立复验

本单元B独立复验通过：固定473bfb0/运行时7aea654，维护后的原119DOM、42生产类型、包2及旧117/28/6均通过。
原119的111通过/8失败和包外五红完整保留；先以无SourceView对照证实设施缺陷，再维护观察，不改业务预期。
C-90/C-91由C本人确认关闭；本报告不代C关闭，不宣告M5整体完成。

## 固定输入与提交

- 完整产品：473bfb03289186bb1b1ca669870d714b161a2785；运行时7aea654fe1d04ed2af659d243c518a95afc123ba。
- 原冻结87dd0ba、ESM维护781a1f2、原基线报告3ebb18c；历史产品57fb80d的38绿/81红保持。
- 本轮设施独立提交：51606dc6c74d97c2ab32b4a0200a40a7889e664d。
- 标准入口测试衍生检出：5dca9f9b4d0502d845a8e60f1d1dd250070be4d9，仅在473bfb0原样导入51606dc。
- DESIGN §6.15：350977字节/SHA256 71b60ca6906375d4b098d0deb87f442e166fbc04998625fc51ad0dcac2c901ce。

规范/原B fixture/公开接口为oracle；未读取A生产实现、diff、自测档、消费者或浏览器对照源码来设计预期。
A交接已暴露八红数量和待验证归因，不声称完全盲测；其解释与C执行均不替代本B证据。
已有B助手只参与通用设施编写/静态复核；以下正式命令由B主代理实际执行并捕获。

## 两项设施缺陷的独立证据与窄维护

C-90：原capture中置true、queueMicrotask清false不能证明trusted事件处理器同栈。
本轮不挂SourceView的native addEventListener、IDL属性、普通React三类宿主，各真实双击/Alt+Enter：
6次同步调用中旧标记全部false，新监听器try/finally活动栈全部true；各自queueMicrotask、Promise.then、MessageChannel延迟18次全部false。
部分微任务延迟仍eventPhase=2/3，因此不能仅换成eventPhase>0。另24次合成观察通过，但不充真实用户输入。
通用探针只观测原监听器动态调用区间，不实现SourceView事件、DOM位置或业务规则。
保留原checkCall的次数、原document、原offset和同栈断言；仅trusted场景在createRoot前安装探针，要求活动事件严格等于capture的原事件。
原受控dispatchEvent同步标记保持。

C-91：普通React按钮不挂产品，插入的before/immediate/after为false/false/true，删除为true/true/false。
原三场景在dispatchEvent返回即读DOM，尚未观察提交。
仅对mouse-unavailable、feedback-mouse-hint-clears、feedback-new-action-clears加入MutationObserver谓词等待，原提示、直接ARIA、原文、几何/滚动和清理断言保持。
locate次数/同栈及无同步failure仍在等待前检查，清提示时原命令仍未结算；不用生产flushSync或固定sleep。
runner既有15秒watchdog只防设施挂起，不是产品超时/性能契约。

7组设施透明性/清理检查包括函数this/remove/duplicate/options getter、对象handleEvent/once、AbortSignal、passive、IDL返回false/原getter/移除、DOM立即满足/取消/抛值（含undefined）及dispose迁移/幂等。
Observer在满足/取消/异常时断开；卸载roots后dispose探针，恢复原native注册/IDL描述符；页面/browser/server和自有模型/SDK按原finally释放。
新控制cleanup为channels0/probeActivefalse/probeListeners0，产品和包输出cleanupErrors均空。

原cases/types/proposal/verify-types/package/run、旧117输入与旧档未改；原fixture只允许有明确前后字节/mtime pin的观察维护。
没有删除断言、skip、xfail、修改期望、改变API或产品行为。

## 实际命令与结果

E=/tmp/hier-b-orch24-position.H6aXFS；P=E/checkout with space 中文为纯产品473bfb0；I=E/standard integration 中文为上述测试衍生检出。
B=/Users/jiangbowang/MOI/2025/dftartist/2026.9/dft_hierachy-test-m5-tree，branch=test/m5-tree。
N=/Users/jiangbowang/.npm-global/bin/node（v24.21.0），npm=/opt/homebrew/bin/npm（10.9.2）。
固定TS5.9.3、React/DOM18.3.1、@types/react18.3.26、Playwright1.64.1、esbuild0.25.11、Chromium156.0.8078.4；macOS/arm64。
独立命令cwd=B；环境HIER_B_PRODUCT_ROOT=P、HIER_B_BROWSER_TOOLS=P/web、HIER_B_NPM_BIN=npm及固定Node PATH。
下表文件均在web/tests；完整绝对argv/cwd/UTC/退出码/耗时及合并双流原输出见机器档，不以摘录替代原输出。

| 命令/实际输入                                                                   | 结果                                                                                      |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| npm --prefix P/web ci --ignore-scripts --no-audit --no-fund；run check          | 0/0；fresh锁依赖、四包TS、生成/分层检查通过                                               |
| 原3ebb18c independent-source-position-interaction/run.mjs                       | 1；实际119，111绿/8红，skip/blocked0，12.512秒                                            |
| 原 independent-source-position-interaction/package.mjs                          | 1；2组1绿/1红；类型组过，真实浏览器五项0绿/5红，执行未阻塞                                |
| independent-source-position-interaction/verify-types.mjs production             | 0；42语义负例逐项过，无缺出口代通过，20.788秒                                             |
| independent-source-position-interaction/verify-observation.mjs                  | 0；24真实观察/24合成/2DOM提交/7透明性，productExecuted0，1.008秒                          |
| 51606dc independent-source-position-interaction/run.mjs                         | 0；119/119，skip/blocked0，11.985秒                                                       |
| 51606dc independent-source-position-interaction/package.mjs                     | 0；包2/2，9真实tarball/13子命令，真实trusted5/5，4.060秒                                  |
| independent-source-view/run.mjs、q1q2/run.mjs、scale/run.mjs                    | 各0；89/19/9共117DOM通过                                                                  |
| independent-source-view/verify-types.mjs production                             | 0；原28类型通过                                                                           |
| independent-source-view/package.mjs（离线重跑）                                 | 0；原包6/6，4.059秒，未改旧文件                                                           |
| independent-source-navigation/run.mjs；ready-baseline/run.mjs；verify-types.mjs | 各0；284+26=310模型、46生产语义负例                                                       |
| independent-source-position/run.mjs；verify-types.mjs                           | 各0；258模型、32生产语义负例                                                              |
| independent-source-candidates/run.mjs                                           | 0；281模型                                                                                |
| inventory、原native、公共边界设施                                               | 原inventory3、native8、导航/位置等17设施均0；不计业务通过                                 |
| npm --prefix web run test:independent:m5:source-view（cwd=I）                   | 0，58.214秒；旧28类型/117DOM、新42类型/119DOM实际执行                                     |
| npm --prefix web run test:independent:m5:source-view:package（cwd=I）           | 0，8.528秒；旧包6、新包2（真实5输入）                                                     |
| npm --prefix web run test:independent:m5:source-view:controls（cwd=I）          | 0，5.930秒；标准原设施/新inventory3/native8，另A作者wrapper32/32；执行归B、作者归属不混淆 |
| npm --prefix I/web ci/check；输入/衍生身份/保护审计；Prettier；git diff --check | 均0；主树/纯P未改，完整原文件/声明/日志前缀核对                                           |

新24/24/2/7观察设施为单独正式命令，标准controls尚未接线它，不把标准入口称作已自动包含这些新控制。
标准wrapper/包浏览器对部分相同119/42/5重复执行不累加为新业务用例。
4个实际L6/SDK交互场景仍为受控Transport，不是Core。

### 保留的四条正式非零与诊断

1. 原119八红：五trusted同栈观察、mouse-unavailable、feedback-new-action-clears、feedback-mouse-hint-clears；不是删除用例后取绿。
2. 原包2中的浏览器五红：同一旧trusted观察，产品实际执行5；非缺能力/skip。
3. 原旧包6首次缺npm_config_offline=true，安装访问registry在30秒watchdog被SIGTERM，产品执行0/blocked6。
   归设施/环境，不沿用旧runner的capabilityFailures标签误称产品缺能力；保留完整输出，显式offline后原样6/6。
4. 收尾B输入审计把已新增设施文件拿去读取旧3ebb18c blob，退出1；改为枚举固定旧tree后通过。
   前后审计脚本和原错误均封存，无产品变更。不是产品回归，也不抹去失败。

另有只读候选路径不存在、B旧检出没有AGENTS、查找无更深AGENTS的非零诊断，不计作产品测试；规范从主树AGENTS完整读取。
共享阶段条目“导航310”在26单独执行前合计过早，本轮已追加更正：284和26两条实际命令均在档，总计310；不重写原日志。

## 证据与保护

机器档[完整复验档](m5_b_source_position_interaction_runtime_recheck.json)：1069639字节，
SHA256 b27ec085888057c54c107bef3b6f8bdf7aa16571655de4e907159962511be008。
49完整命令捕获、115材料、113去重压缩块，另86生成运行时文件pin。
材料含初始快照、规范、工具清单/锁、48声明、原/维护后fixture、未改cases/types与全部B设施；不嵌入A实现作为oracle。
原B23档850095字节/SHA77ca1a322f3c128afc78183def5fd42f2a90e88f4184e555d56c5d31a79d128e保持；旧核档工具独立执行0。

可携核档（只验档、不执行产品）：

    node web/tests/independent-source-position-interaction/recheck/verify-runtime-evidence.mjs
    node web/tests/independent-source-position-interaction/recheck/verify-runtime-evidence.mjs --inputs

首次核档均0；后者在原证据主机另核2952项原输入字节/mtime或运行时hash与共享日志前缀。
初始主树1079/B726/P1061原文件和48主树声明保持，唯一授权旧文件改动为B fixture，前后pin另存。
初始日志2151627字节/SHA527b62b3420ac34f58dfd4d5ba3857c5174a54c5a8c1e85589b3e7373cffee9a前缀保持，日志只追加不提交。
44旧声明字节不变，2旧公开声明兼容增量/2内部声明新增；302生产文件与48声明在P/I逐字相同。
Core/protocol/ci、L0–L6、依赖锁与公共CSS等相对57fb80d的Git对象身份保持；不据版本常量相同冒称全结构验证。
封存后的核档/提交/日志/保护回执单独留E/post-seal-receipts.json，不递归更新机器档。

## 限制与交接

API增量属于A既定可选L7契约，B仅改测试；无新增Core API/ABI、IPC、Schema、依赖、工程格式或持久化修改。
未重编Core/执行CTest/ASan、完整check.sh或完整test:independent，不将A此前执行归作B；本轮为L7局部增量的比例回归。
未执行main/preload/真实Electron UI→Core、候选确认→Selection、L06/L09–11、OS剪贴板/读屏/SSR、其他浏览器/平台/Linux、真实设计规模、远端CI/M7。
首版无会话持久化，工程保存/恢复/损坏格式/旧版本迁移当前不适用；不虚构验收。
浏览器技能内置Node REPL发现不可用，按fallback独立Playwright，仅本机测试页；不是in-app/Electron认证。

- 交A：原样导入51606dc及本报告/机器档提交，保留旧冻结/旧失败；标准入口若接新观察控制按同一设施运行，不改业务oracle。
- 交C：复核C-90/C-91设施修订、同步/延迟区分力及三处提交等待；仅C可关闭。B未发现本固定产品新的确定业务失败。
- 交协调器/D：本轮B单元交付结束；D-03仍M6，不接管，不新增审批或新会话/定时器。
  纯报告/测试原样导入且生产字节不变时核来源即可，不重复同一全量门禁；新增生产/规范事实再开相应独立复验。
