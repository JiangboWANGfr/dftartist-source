# B30：源码候选确认独立冻结与初始基线

结论：**独立测试已冻结，新生产功能未实现/未验收**。固定产品 ecbe0380045491db031ad20bf84735bbbfe8496d；
B起点 c8792cec85bb54c9ea3399151d0b64e0f5c4563a；冻结 **0a83e08b8339b2d594597ebd161d5428212f3129**（11新增路径）。
本报告/核档器另提交，不改11冻结输入或任何旧oracle/产品。

唯一oracle：固定DESIGN §6.17，370144字节/SHA256
1e2345280834df49b3aeb63b9e0541b01ab20b4bff6c7ebf7ae3771f93d82e61，加§6.5/6.11–6.16、历史B fixture和公开接口。
没有读取A新隔离测试/实现/diff生成预期，A交接仅定位固定对象。新契约含状态语义，而非从实现猜算法。

## 验收与现有覆盖

原文档/候选/导航/Selection已有原8异步命令、页/文档身份、partial/ready/游标/取消、历史/错误/通知/资源覆盖；没有两个新方法及动作真实性/代次。
新增目录web/tests/independent-source-confirmation中，cases+boundaries有121条输入、预期、依据；types有37逐项语义负例。
--list列清单（不执行）；questions单列6输入（不是skip）。

| 验收族          | 必测数 | 判定要点                                                         |
| --------------- | -----: | ---------------------------------------------------------------- |
| 错误导出        |      1 | 九码/Error继承/message，不冻结未承诺name文案                     |
| 权威映射        |     16 | refKind正交kind/inst；单项ref/def；partial/occurrence不猜/不多选 |
| 签发/参数       |     22 | 原页/下标/-0/冻结；恶意输入/Proxy/副本/边界无探测                |
| 动作身份        |     11 | 无品牌伪造/展开/描述符复制/Proxy/跨模型借用                      |
| 就绪与空页      |      7 | not_ready/invalid_index顺序，缺数据不自动选择                    |
| Selection品牌   |     10 | 真子类/原基类边界；伪原型/Proxy/覆写无外部dispatch               |
| 旧Selection错误 |      6 | disposed/snapshot/input/通知重入，含同身份no-op                  |
| 历史/no-op      |      2 | 不消费动作、不强改origin、不破坏forward                          |
| 文档/页链       |     16 | 追加/加入/失败/取消/重启/新绑定/非法命令/晚回复                  |
| 同Reply新链适配 |      1 | 同页同快照仍旧动作过期，仅新动作可确认                           |
| ready起步       |      1 | 排队未起步不提前失效，实际重载失效                               |
| 错误优先级      |      3 | disposed在先；伪动作在ready/目标之前                             |
| 通知/确认重入   |     13 | 原8拒绝Promise，新2同步；别的模型不全局禁止                      |
| 提交后异常      |      1 | 已提交、通知同行继续、原抛值保留、保护恢复                       |
| 释放/晚反馈     |      5 | Nav/Selection分别dispose、异常优先、client仍活                   |
| 诊断重入        |      6 | source/read/resolve原data getter内新2阻止，原Core错误保留        |

共同检查原页身份/数据不变、无额外wire请求/取消/重载、无导航发布；清理所有models/client/订阅，所有观测Promise一次settle。
类型正例先行，缺模块/公开导出不能当作37负例成功；readonly/名义品牌/参数/返回同步与旧异步、无Node/React泄漏。

## 实际命令与结果

环境Node v24.21.0/npm10.9.2/Darwin25 arm64。
B=/Users/jiangbowang/MOI/2025/dftartist/2026.9/dft_hierachy-test-m5-tree；
P=/private/tmp/hier-b-orch30-confirm.pkO5sG/fixed product 中文；
E=/private/tmp/hier-b-orch30-confirm.pkO5sG。
下表短写N=web/tests/independent-source-confirmation，所有产品运行明确HIER_B_PRODUCT_ROOT=P。
完整argv/cwd/退出/耗时/压缩完整输出在主档；outer stdout_*实际合并stdout+stderr，utc是结束时间。助手18命令另为分离双流。

| 实际命令（B为cwd，另注明除外）                                                              | 退出/实际结果                                                                                    |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| git worktree add --detach P ecbe038...（主仓库）                                            | 0；独立固定产品，不借移动主构建                                                                  |
| npm ci --prefix web --ignore-scripts（P）                                                   | 0；锁与package未变                                                                               |
| npm --prefix web run check（P）                                                             | 0；196定义/27方法、TS、53模块/175依赖与7越层反例                                                 |
| node N/run.mjs                                                                              | **1**；121 planned/0 executed/0passed/121blocked/0skip，缺createCandidateAction；不是121断言失败 |
| node N/verify-types.mjs                                                                     | **1**；生产正例缺新导出/方法，37负例0执行                                                        |
| node N/verify-types.mjs --proposal                                                          | 0；B独立提案类型正例0诊断，37/37语义负例；不是生产通过                                           |
| node --test N/facility.test.mjs                                                             | 0；6/6，无skip；仅SDK无缓存/合并、B同页重发适配、原Selection、fixture转发                        |
| node web/tests/independent-source-document/run.mjs                                          | 0；306/306                                                                                       |
| node web/tests/independent-source-candidates/run.mjs                                        | 0；281/281                                                                                       |
| node web/tests/independent-source-navigation/run.mjs                                        | 0；284/284                                                                                       |
| node --test P/web/tests/independent/selection-contract.test.mjs（P）                        | 0；159/159                                                                                       |
| node web/tests/independent-source-ref-kind/run-sdk.mjs                                      | 0；23/23，0skip/blocked                                                                          |
| HIER_B_BROWSER_TOOLS=P/web node web/tests/independent-source-view/run.mjs                   | 0；89/89，Chromium156.0.8078.4，buildWarnings/cleanupErrors空                                    |
| HIER_B_BROWSER_TOOLS=P/web node web/tests/independent-source-position-interaction/run.mjs   | 修正工具pin后0；119/119，同浏览器，warnings/cleanupErrors空                                      |
| P/web/node_modules/prettier/bin/prettier.cjs --check 新测试/计划；git diff --cached --check | 0                                                                                                |
| node N/verify-evidence.mjs --inputs                                                         | 最终0；43捕获/81材料/11现场冻结输入；当前产品0执行                                               |
| node N/verify-controls.mjs                                                                  | 0；1正/8负核档回执，当前产品0执行                                                                |
| node E/protect.mjs --protect                                                                | 0；初始M1162/B777/P1144字节及mtime、主48声明/3hier、原日志前缀保持                               |

旧组件回归是本B实跑，不把A/C的既有能力、冷编或自测算作B；不重跑已关闭C-93全量。

## 首失败、独立性与来源

B类型设施首轮外目录解析@hier失败；只明确映射P公开声明。继而B ambient .d.ts无显式export边界导致品牌泄露，
no-public-brand确实无语义诊断；加export边界才通过。原v1/v2源码、首proposal和输出保留。
两个中间红统计仅把已通过24写executed、实编译第25项失败且blocked旧37；最终计数器按编译数修，历史不改。
预冻结只读检查纠正undefined默认转0、旧无refKind恢复fixture、未承诺的枚举/name/prototype过约束；全依据规范/B事实，不来自A实现。

位置浏览器首次缺HIER_B_BROWSER_TOOLS，在产品执行前失败；补显式固定P工具后119真实过，不改业务预期。
封档核验首把“7文件×B/main两处”错作7条，实为14；只更核档器计数并核7×2与对象/mode，原14 !=7输出和首源码存控制档。
所有首失败保留，不借复跑产品掩盖设施错误。

独立只读助手18命令全0，原档445627字节/SHA
a95dce632624fd9e2d0d02ae5b39d7f06eb03038e817beea6aba07d1ccfb722e。
d6→ecbe：core生产77/公开头37/protocol9/web生产77/generated4/锁package12集合不变；
B301b7be→A50d5ddc、Bc8792ce→Ad011c2e完整路径/mode/type/before-after blob delta相同，最后7输入在B/main14处同源。
48声明/3二进制历史及现场mtime保持。助手为B内部来源审计，不替代C；不读A新测试内容。

## 证据与限制、交接

主档docs/m5_b_source_confirmation_freeze.json：
1453065字节/SHA256 **3ed2f6f35610adb9f52a364700b90bad55c190d371288809ef6a146fb9bdf53d**。
控制档docs/m5_b_source_confirmation_archive_checks.json：
39081字节/SHA256 **393950c93f57c1271ef0fab8300365569593fe5abb3adda0af65c03d13ceadd9**。
8正确重封gzip/hash的篡改均因AssertionError退出1，非缺模块/ENOENT：零执行假绿、生产/提案类型计数、旧导航零跑、缺材料、改fixture、M5误完成等。
封档后回执不递归塞回主档；控制档保留首核档红。归档验证仅读取，不运行产品入口。

B30-Q1：任意SDK覆写回调（尤其异步readSource）是否处命令保护动态区间不明，6输入只列问题/两解释；
不自行用实现选答案，不算121/skip。真正诊断getter重入6项仍冻结。
同Reply新链仅公开resolveSource返回原已验证Reply的独立适配；无私有钩子或sleep/GC竞速，与实际SDK不缓存/并发共享分账。
精确基类调用次数、原异常外壳身份、强引用增长及pending发布前内部失效顺序仍需C审核；黑盒不虚称已全证明。

并发最新C30条目已经接受§6.17（契约SHA同本冻结）；早期B记录/封档中的“待C/不由B断言”保留为当时审阅阶段，
本报告明确**不再等待契约批准**。C要求审固定同Reply适配来源：本冻结harness/对应case已提交供其审；B不代C接受该适配。
交A按顺序原样导入冻结及本报告提交，保持旧oracle；按既有C适配前置继续生产实现，随后再交固定SHA给B运行121/公开37及回归。
Q1不阻塞明确集合，不能凭未规定SDK回调强制实现答案。

没有生产API/ABI/IPC/protocol2/schema7/配置/锁/依赖/格式修改；仅测试及报告。
首版无持久化，工程保存/恢复/迁移不适用；未执行新确认Core/IPC/Electron E2E、完整Core冷构建/单测/全CTest、
完整check.sh/test:independent、全SourceView包/scale/q1q2/远端CI或内存GC验收。
旧浏览器89/119不包括新候选UI、键盘和Electron接线，L06/L09–11/M5未据此完成；D-03仍M6。
只追加共享日志不提交，M3-coordination/research、旧工程/ref保护；不接管A/C/D、不投递其它会话、不新会话/定时器。本B本轮交接后结束。
