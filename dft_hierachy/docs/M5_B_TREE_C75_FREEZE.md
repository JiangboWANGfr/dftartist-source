# Agent B：C-75函数诊断所有权独立冻结

**B-M5-TREE-C75-FREEZE-01完成冻结，不通过未修复运行时。**
固定运行时17be3657ef13101953bcdfcadc801d3e8911ebb9、接线f099169553c34b1282b7b7a95880af97350b6b2c。
独立冻结提交d1bfe6a77a01050e6219734b9c371e1690335270，计划c4c380f。
30项先提交后执行，**3通过/27失败，0cancelled/skip/todo**。
普通对象同形正对照三方法全部通过，函数特有路径全部红；C-75 Medium仍开放，
不把C-74已关闭或旧248/761绿测当函数所有权已修复。

## 输入、预期与依据

唯一行为依据是既有DESIGN §6.6.2/§6.6.6、HierError公开Readonly<Record<string,unknown>>输入。
已读共享C摘要，非严格盲验；不读实现源码/diff、A消费者/自测或C探针定oracle。
真实HierClient/TreeModel、原B公共Transport.onClose传原HierError；
不用SDK替换/private hook。每例plain Node明确--unhandled-rejections=throw，无全局拒绝监听。
子进程20秒/父30秒只是防挂，不是性能SLA。本轮没有测试装配或环境失败。

每种输入分别走roots、children、reveal，共10场景×3方法：

| 场景 / 每组三项 | 输入与预期                                                                                    | 未修复绿 / 红 |
| --------------- | --------------------------------------------------------------------------------------------- | ------------- |
| plain           | 无枚举属性普通函数；拥有冻结的空结构投影、非源别名，不执行函数/hidden/symbol值                | 0 / 3         |
| properties      | 函数带detail.value=1、scalar；字段自有冻结，调用者之后改child/scalar/加属性不影响旧值         | 0 / 3         |
| shared          | 两字段/数组共享函数，函数self/owner循环、一次getter；图关系保持/一次读/旧值稳定               | 0 / 3         |
| array           | 数组内重复函数；元素共享身份、函数子属性不借用源                                              | 0 / 3         |
| root            | 可调用且带字段/自循环的根data；同样结构捕获，不返回源函数                                     | 0 / 3         |
| ordinary        | 普通对象同形共享/循环/getter正对照；原深拥有/冻结保持                                         | 3 / 0         |
| throw           | 函数自有detail Get抛undefined；read [handler,detail]、空冻结data/issue、原HierError、后续停止 | 0 / 3         |
| dispose-return  | detail Get内dispose后返回；disposed.cause原SDK错误，立即idle/rows空/无通知、不再读取          | 0 / 3         |
| dispose-throw   | 同步dispose后再抛undefined；disposed优先，原cause不替换、不复活                               | 0 / 3         |
| enumerate       | 可调用Proxy ownKeys抛undefined；enumerate [handler]、原错误、停止后续字段                     | 0 / 3         |

不约束副本仍可调用或typeof必须function；诊断接口只承诺只读结构，不承诺源函数执行行为。
不执行函数、不冻结源Error/函数/子对象、不静默丢字段或保留可变别名；
成功真正省略dataIssue，失败严格投影，通知及生命周期规则沿原68。
new helper递归冻结检查同时覆盖object/function，避免原通用helper略过函数导致假绿；原helper本身不改。

两份严格TS配置（生产/提案）分别exit0；无cast、无私有hook。
nested函数/数组/普通getter及带调用签名+字符串索引签名的根函数均合法；
TreeFailure.data仍是readonly unknown结构，输入消费者不额外声称输出可调用。
这只是正类型检查，不是新增14负例或运行时通过。

红基线在第一不满足断言处停止，例如外部别名、缺读取失败投影、dispose未触发；
不声称被首败阻断的后续mutation检查已经执行。源输入/后续判断全部保留供修复复验。
C所述修复前也存在为C证据；本轮B仅执行f099函数基线，未新重放旧dfc函数版本，
不将其标为17be365新引入回归。

## 本人实际执行与来源

在本人/tmp/hier-b-m5-tree-runtime.zM31cP/source固定f099运行，
Node24.21.0/TS5.9.3/macOS arm64，不借其它session产品。

| 命令/集合                                                                  | 退出 / 实际结果                                                       |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| node --test tests/independent-tree/diagnostic-callable.probe.mjs           | 1；30项3通过/27失败                                                   |
| tsc -p tests/independent-tree/tsconfig.diagnostic-callable-production.json | 0；合法输入0诊断                                                      |
| 对应proposal配置                                                           | 0；合法输入0诊断                                                      |
| 原标准test:independent:m5:tree                                             | 0；248/248，35+14生产类型负例                                         |
| 原diagnostic-task-boundaries.probe.mjs                                     | 0；9/9                                                                |
| 显式本人普通Core HIER_BIN test:independent                                 | 0；761/761                                                            |
| 新源/旧源字节与语法/格式/diff审计                                          | 0；五新源匹配冻结/执行目录，18旧Tree文件及原9保持；无生产跟踪文件修改 |

新的父文件是.probe.mjs，单独跑，不暗增原标准248/默认761，也不把27红skip/xfail成绿。
807eb15的36命令/三配置完整门禁属于本轮前一C-74复验，不充C-75新构建或修复验收。
本C-75冻结无Core/SDK/Schema/ABI/依赖/工程格式变化，未再跑Core重建/CTest/check.sh；
UI/Electron/浏览器/真实大设计/Linux/远端CI/M7未执行，首版保存恢复/迁移不适用。

[机器证据](m5_b_tree_c75_freeze.json)，SHA256 **5ad9fbdc8cf0e70a1f7dceb70ba59e877586f3bd98223944d3f9ed4cbf01a171**。
8条完整命令，152092原输出字节/29668 gzip字节；
5内嵌源/配置10892解压/3840压缩字节，逐份长度/SHA核验，
内外不重复相加，不声称记录每次初始只读检索或提交。
[计划](plans/B-M5-tree-c75.md)及全部历史17/68/9/248/761报告/输入保持。

## 交接

交A：按d1bfe6a原样吸收五份测试/消费者/配置，修复函数自有字段结构捕获及读取保护；
显式接入新30运行父文件和生产合法输入类型检查，保留旧17/68/9与标准248/761。
不得冻结源函数、丢字段、禁合法输入或改oracle取绿；给固定修复及接线SHA后B/C复验。
若选择排除可调用输入，需要另行明确契约审查/冻结，不是本次已授权的隐式处理。

交C/协调者：既有规范的C-75独立冻结与红基线已补齐，当前无新规范歧义；
C-74关闭保持，C-75仍待修，关闭归C，不要求用户重复批准既定修复路线。
主树仅追加本人交接，不提交共享日志/协调/research，不改他方计划。
