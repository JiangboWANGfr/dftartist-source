# B23：SourceView 位置查询交互独立冻结与只读基线

2026-10-17，独立测试Agent B。token=dft-orch-23-b-62380bb0-eb67-4655-b838-1e77661348fb。

## 结论与固定交付

**独立冻结完成，不是新交互验收通过。**
固定提案产品 **57fb80db5581028549e116e40d3f21b759f9b1b2**（提案29e1871acab57ac1840e5bcda1ba322a8275bffa）仍只有只读SourceView。
119个实际DOM/事件/生命周期场景执行 **38绿、81红、skip/blocked0**；
规范声明模式42条语义负例通过，生产声明缺新出口/positionQuery，能力阶段明确非零，生产语义负例执行0。
两个真实包外消费组均红；最终五个包外trusted输入实际执行、0绿5红、skip/blocked0。
不把上述红色改成skip，不用proposal代替生产，不把38个无查询/旧行为绿写成新功能通过。

依据是DESIGN §6.15、公开生产声明及旧B字面DTO，不读取A实现/生产diff/隔离消费者/能力脚本/自测档建oracle。
DESIGN：350864字节/SHA256 **7d7d43afa14c6cc7a3da2d3fb08f8c79e7196064bceb5917fca6e8d9e464d8ba**，M/P逐字一致。
最新C23已对该固定契约通过C审、无新阻塞；C结论独立，不冒充B执行。C-88/C-89保持关闭。

- 初始B：test/m5-tree，f23d6f5d27851286cb012d70bb7aa5ca412ef495，干净。
- 先行冻结：**87dd0bae9c73886fcd6713c721e671566f0fe805**，11个新文件，正式产品基线命令均在该提交之后。
- 必需包入口设施修订：**781a1f2dd3532f49739b57080fb42559fa19f1e2**，只改新runner的包模式ESM解析；业务119项、42类型预期、fixture均不变。
- 计划：docs/plans/B-source-position-interaction-freeze.md；测试目录web/tests/independent-source-position-interaction。
  cases.mjs逐项列id/group/input/expected/basis，types.ts逐项列语义负例，README列输入与计数边界。

## 可验证验收与覆盖

| 组                 | 数量 | 只读基线绿/红 | 输入与判断依据                                                                                                                                                                                                     |
| ------------------ | ---- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 配置               | 15   | 4/11          | 省略兼容；显式undefined/null/数组/函数/缺回调/错类型TypeError；原getter抛值；旧字段优先；两回调只读一次，不枚举扩展/冻caller                                                                                       |
| 启用说明/双实例    | 2    | 0/2           | 可见提示、Alt+Enter、直接追加aria-describedby而保留范围说明；实例ID、配置、document独立                                                                                                                            |
| 非success/changed  | 5    | 5/0           | 不查询/不宣称快捷键，不阻止原生事件                                                                                                                                                                                |
| 有效键盘           | 16   | 0/16          | Text/Element/mark前中后/空文/EOF/BOM/tab/CRLF/代理对，反向focus/折叠，iframe的ownerDocument；原document/UTF-16 offset同事件栈一次调用                                                                              |
| 无效键盘           | 14   | 14/0          | modifiers/repeat/composing/无选区/多Range/跨面板及实例/外部目标：不查询、不preventDefault                                                                                                                          |
| 普通事件           | 7    | 7/0           | 单击/移动/contextmenu/copy/scroll/拖动/Selection变化不自动查询                                                                                                                                                     |
| 真实浏览器输入     | 5    | 0/5           | 实际dblclick：scale0.5/1/1.5及真实双轴已滚动文档；实际Alt+Enter反向选区，不以合成事件冒充                                                                                                                          |
| 鼠标受控分支       | 11   | 8/3           | 原生caret主/回退/缺失/null/外部hit、target/button/modifiers；缺失固定提示，不猜offset                                                                                                                              |
| 命令/反馈/生命周期 | 40   | 0/40          | 原Promise即时观察、sync throw/undefined/opaque/Aggregate/非thenable、then只读一次/正确this/跨realm/嵌套首次结算；未提交render、配置/document/动作次序、退出恢复/卸载、提示清理、冻结浅记录、onError抛值/返回值责任 |
| 实际模型集成       | 4    | 0/4           | 生产Navigation/SDK、手写Transport；pending/候选，CRLF/代理对交L6拒绝、旧显示document交L6拒绝stale_document，不在UI修复offset或替换新文档                                                                           |

119中5个为真实浏览器输入，110为受控DOM/生命周期场景，4个为真实模型/SDK+受控Transport场景。
受控caret/多Range、KeyboardEvent/MouseEvent适配与真实输入分账；不声明系统复制/剪贴板或真实Core。

81红均在缺新输入校验、提示、回调读取或locate调用的契约断言处失败；没有watchdog、构建、清理或未知DOM错误。
四个模型场景已成功创建真实模型并取得文档，但停止在UI没有调用locate；
40个反馈场景主要停止在缺事件入口，**后面的Promise/失效/回调深层断言尚未到达，不能声称其实现已验证**。
这些后续期望已经冻结，等待固定实现原样执行。负向绿只是当前只读行为，不足以证明未来正向处理正确。

独立类型使用真实React/L6声明，strict/exactOptionalPropertyTypes/noUncheckedIndexedAccess、无Node/Electron ambient。
proposal正例零诊断，逐项移除42个expected-error后只在对应行出现语义诊断，缺模块/未用指令不充负例通过。
production缺SourceViewPositionFailure/SourceViewPositionQuery和positionQuery；其余隐式any/unused指令是缺接口的级联，
不能计为42条已完成语义负例。

## 本人实际命令、环境及失败分类

E=/tmp/hier-b-orch23-position.bKMaep。
P=E/checkout with space 中文（detached固定产品）；T=P/web。
B=/Users/jiangbowang/MOI/2025/dftartist/2026.9/dft_hierachy-test-m5-tree。
N=/Users/jiangbowang/.npm-global/bin/node；npm=/opt/homebrew/bin/npm。
B脚本cwd=B；env为HIER_B_PRODUCT_ROOT=P、HIER_B_BROWSER_TOOLS=T、HIER_B_NPM_BIN=/opt/homebrew/bin/npm；
PATH=/Users/jiangbowang/.npm-global/bin:/opt/homebrew/bin:/usr/bin:/bin。
npm构建命令cwd=P。每条正式捕获含绝对argv/cwd/UTC/耗时/退出码/完整合并stdout+stderr gzip/SHA。

| 实际命令                                                                          | 退出/结果                                                                   |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| git worktree add --detach P 57fb80d                                               | 0；独立固定检出，未用移动主树产物                                           |
| npm --prefix P/web ci --ignore-scripts --no-audit --no-fund                       | 0，0.658秒；fresh锁依赖82包                                                 |
| npm --prefix P/web run check                                                      | 0，6.996秒；四包TS、195定义/27方法、分层51模块/170依赖及7反例               |
| N --test web/tests/independent-source-position-interaction/inventory.test.mjs     | 0；冻结后3项设施检查                                                        |
| N web/tests/independent-source-position-interaction/run.mjs --controls            | 0，最终0.749秒；8原生设施，不挂SourceView                                   |
| N web/tests/independent-source-position-interaction/verify-types.mjs proposal     | 0，20.643秒；42/42，生产交互执行0                                           |
| N web/tests/independent-source-position-interaction/verify-types.mjs production   | 1，0.878秒；缺新生产API，semantic执行0，无skip                              |
| N web/tests/independent-source-position-interaction/run.mjs                       | 1，12.185秒；119执行38绿81红，skip/blocked0，逐页卸载/关闭，cleanupErrors空 |
| N web/tests/independent-source-position-interaction/package.mjs，原冻版/ESM修订后 | 1→1，3.489/4.230秒；第一次含设施阻塞，最终两消费组为功能红，见下文          |
| N web/tests/independent-source-view/recheck/verify-c89-evidence.mjs               | 0；无--inputs离线核历史B22档，不计当前117/28/6执行                          |
| N E/audit.mjs；N E/protect.mjs --protect（分别执行）                              | 各0；旧输入/底层对象/声明/原文件与日志前缀保护                              |
| Prettier --check新目录与计划；git diff --check                                    | 均0；无新构建警告或未说明skip                                               |

macOS arm64，Node24.21.0、TS5.9.3、React/DOM18.3.1、@types/react18.3.26、Playwright1.64.1、esbuild0.25.11、Chromium156.0.8078.4。
已完整读browser技能，四种发现均无内置执行工具，按fallback使用固定Playwright；不是in-app/Electron认证。
B辅助只负责新增类型/包设施与只读检查；表内正式命令由主B重新执行，辅助预检不冒充产品验收。
微任务/MessageChannel/显式deferred为同步点，无sleep竞速。Node watchdog仅防设施挂死，不是产品超时或性能阈值。

### 真实tarball与窄设施修订

真实离线pack共9个（4个@hier包及React运行依赖闭包），独立cache安装、npm ls peer与非软链单实例核验均0。
原types.ts逐字复制到包外consumer，类型只消费实际安装的声明；
浏览器所有@hier、React/DOM runtime都从该consumer解析，CSS用真实公开子路径，无workspace/proposal fallback。
最终类型红仍继续浏览器组，truePack=true；五个trusted输入实际执行、均因缺locate而红，清理为空。
包的五项与119中的同五项不累加；42语义负例也不由包的正例编译重复计数。

首次包浏览器组遇B设施错误：CJS require.resolve无法解析import-only的@hier/client公共出口，
尚未挂产品，子报告executed0/blocked5。初次完整输出与原87dd0ba runner保留，不能把该阶段算成五个功能红。
781a1f2只将包模式改为真实Node ESM的import.meta.resolve，在实际consumer工作目录解析四包；
不改manifest、不加私有路径/默认导出、不放宽业务断言。随后type组仍因新API缺失红，browser组5实际红。
其余正式非零为生产类型/119DOM/最终包两个组的预期未实现基线；共四条非零捕获全部保留。

早期只读查找发生过dist尚未生成/可选声明文件名不存在；这是查找诊断，不是产品测试。
有预冻的重复清单/原生设施检查，均不累加为业务场景；没有新交互自测被误当生产通过。
本轮无A实现或自测导致的预期修改，无新契约歧义。

## 封存、保护与交接

机器档docs/m5_b_source_position_interaction_freeze.json：
**850095字节/SHA256 77ca1a322f3c128afc78183def5fd42f2a90e88f4184e555d56c5d31a79d128e**。
24完整捕获、104材料、103去重压缩块；含原冻结11文件、原/修runner、旧26oracle、规范、46声明、工具pin、初始快照及审计代码。
子包13命令的stdout/stderr单独gzip/SHA、9 tarball身份、实际peer/入口/构建输入、初次设施红与最终功能红也封存。
recheck/verify-evidence.mjs --inputs实际0：逐块/原输出/逐项ID/预期绿红分类/类型语义/真实包数据验证，
104材料和2808个原文件字节mtime匹配，46主树声明、2原清单及日志前缀保护通过。
不带--inputs可离线重放；带该参数核原现场，不能当移动HEAD门禁。核档不是产品重跑。
后置核档/提交/日志回执留E，不递归修改封存档。

相对a757417，Core/protocol/ci/web生产包/check.sh/manifest/锁共300 Git对象不变；
26个既有SourceView测试在B/P逐字相同，M/P fresh的46声明相同。
主树1057/B712/P1039原非日志文件及主树46声明字节mtime保持，
初始日志2115991字节前缀/SHA c36b821fd1321a346fa4753e9d1d026a6471505a965679844d9300e48b87381e保持，
固定产品干净，主树暂存0。旧工程/ref/M3-coordination/research不改，共享日志只追加不提交。
不新建会话/定时器，不给A/C/D跨会话投递。

交A/协调器：C23契约审查与本B对应冻结前置现已齐备；原样吸收87dd0ba、781a1f2和本报告提交后，可按原路线实施同一SourceView增量。
当前红是未实现基线，不是功能验收。实现后交固定SHA，运行原119/42/包2、旧117/28/6与受影响导航/位置回归。
不从本报告推断尚未运行的所有深层断言已经通过，不改旧规范/历史档取绿。
交C：B冻结、原始基线及必需ESM设施适配在此独立交付；C-88/C-89不重开，无新审批请求。
交D：D-03仍归M6，无新架构取舍或D审批。

本轮未执行Core重编/CTest/ASan/完整check.sh/完整产品独立总入口、真实main/preload/Electron UI→Core、
候选确认→Selection、系统剪贴板/读屏/SSR、其他浏览器/Linux/真实设计规模/远端CI/M7；
首版无工程持久化，保存/恢复/旧版本迁移不适用。
原117/28/6仍归B22/C22固定a757417，本纯提案只核身份、不重跑全量。
不宣告新交互或M5整体完成。本轮交接结束。
