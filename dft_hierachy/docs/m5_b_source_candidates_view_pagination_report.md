# B33 C-95分页部分冻结与基线报告

## 结论与固定对象

产品 **4d80e422f597c4c0f362a9e5ce1ca7557787fb9c**；规范修订7a1675f2a4aa3bb0b1d4862c694aa627cc387410。
独立冻结 **9fd645b779c36e43205aa5161d94da3f93adb1ae**，8新增文件/1248行；B分支test/m5-tree，前序579c731。

新增8项C-95真实DOM输入及公开方法透传记录设施，原8529290的56DOM/30类型和579c731历史证据保持。
新组件仍未实现：**planned8/executed0/passed0/blocked8/skip0，能力门禁退出1**。
不是8项语义断言已失败/通过；11 Node及11浏览器设施不是候选UI通过，不能累计成30个新产品用例。

依据固定DESIGN §6.18.2/6和§6.11.2、合法Schema7、旧B fixture/公开接口。
未读取A新见证源码/实现/diff生成oracle，未执行A五项自测充独立B。交接中的A数字仅作来源/范围信息。
C33已由提出方关闭C-95；本报告不代关闭，不把其6组见证计B执行。Q2保持B限定关闭，**B32-Q1仍open**。

## 验收拆分与新增输入

| 输入                                  | 预期                                                                    |
| ------------------------------------- | ----------------------------------------------------------------------- |
| complete+next                         | 可明确续一页；原cursor、原首页保持，原loadMore恰一次                    |
| complete无next                        | 不可续页，原公开loadMore调用0                                           |
| partial+next / partial无next          | 均不可续页；保留原next/reasons及partial警告，不发成功no-op命令冒充禁用  |
| 上述两种partial显式重新查询           | 原reloadCandidates恰一次，从空cursor首请求恢复；旧读者仍见原partial页   |
| complete首页→partial末页（有/无next） | 恰追加一次后停止，原两页及tail next/reasons保持，禁用后不再调用loadMore |

cases.mjs逐项有input/expected/basis。不可操作允许省略/隐藏/原生disabled/aria-disabled/继承fieldset/inert等，
不冻结某个特定内部布局；实际事件与原公开命令记录判断，不从选择通知次数猜命令次数。
每个命令检查receiver、空参数、原返回记录；不自行拼cursor，不发额外SDK请求、不写Selection。

C32已接受的public-calls观察范围仅为原调用、参数/receiver、原action/返回Promise/抛值身份。
记录器不读取then、不装catch、不改原返回、不替模型/组件处理错误，不证明原Promise已消费。
native await仍合法；Node测试中的同步owner副作用不是实际组件卸载证明，派生Promise反例只核身份判据。

## 本B实际执行

P=/private/tmp/hier-b-orch33-pagination.1ZPET8/fixed product 中文；
E=/private/tmp/hier-b-orch33-pagination.1ZPET8。
新入口N=web/tests/independent-source-candidates-view/pagination，命令从B树运行，显式
HIER_B_PRODUCT_ROOT=P、HIER_B_BROWSER_TOOLS=P/web；npm命令cwd=P。
Node24.21.0/Darwin arm64；React/ReactDOM18.3.1、esbuild0.25.11、Playwright1.64.1、Chromium156.0.8078.4。

| 实际命令                                                                     | 结果与范围                                                                                                          |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| npm --prefix web ci --ignore-scripts --offline；typecheck -- --force         | 0/0；独立锁安装/生成49声明，主产物不动                                                                              |
| node N/run.mjs --list                                                        | 0；8独立输入/预期/依据，不执行业务                                                                                  |
| node N/run.mjs（冻结后）                                                     | **1/0.975秒**；缺SourceCandidatesView，8全blocked/0skip；CSS根子路径也缺，不伪称DOM执行                             |
| node --test N/facility.test.mjs（冻结后）                                    | **0/0.184秒；11/11**调用记录/恢复/错误/原Promise身份及真实SDK/Nav/Selection设施                                     |
| node N/run.mjs --controls（冻结后）                                          | **0/0.693秒；11/11**，8合法模型前提+真实鼠标点击/继承fieldset禁用/inert祖先3原生设施；cleanup/release/unhandled为空 |
| npm --prefix web run check（P）                                              | **0/6.443秒**；生成一致性、TS构建、分层/7越层反例                                                                   |
| 旧B32 verify-evidence --inputs；verify-controls --verify旧档                 | 0/0，核旧35捕获/24材料/9输入及1正8负；当前产品0执行                                                                 |
| 新源/计划/报告Prettier check、git diff --cached --check、E/protect --protect | 0；固定输入及原文件保护                                                                                             |
| node N/verify-evidence.mjs --inputs                                          | 0；26捕获/21材料/8冻结输入，仅核档                                                                                  |
| node N/verify-controls.mjs --out E/archive-controls.json；--verify该档       | 0；1正/8正确重封gzip+hash负档实际AssertionError退出1，非缺模块/语法错误                                             |

11 Node设施包括：清单、this/参数/原返回、Promise.then禁止读取、任意原抛值不枚举、
原描述符/继承所有权恢复、安装中途失败回滚、恢复失败仍释放后续方法、wrong-this原异常、
同步副作用后原Promise返回、派生身份强反例，以及真实SDK/Nav签发/确认的page/index/action/零额外查询。
故意不可恢复的测试对象描述符只属设施清理故障注入，不当产品资源失败或成功。

浏览器controls不挂载候选替身。真实SDK/Nav八前提已执行，普通续页/partial no-op/reload/旧页身份保持均为旧L6设施证明。
全部focused命令仅初始及冻结后DOM能力门禁两次预期非零，未出现未说明的设施/产品运行时失败。
冻结前静态审查依规范修正了判据：native label section区域、fieldsets/inert继承禁用、全wire数量及分阶段清理；
未根据A实现改变预期。冻结后的8项DOM仍未进入，不能排除未来组件路径上的测试设施问题。

## 证据、来源与保护

主档docs/m5_b_source_candidates_view_pagination.json：
**1006276字节，SHA256 59c9b99032ad5d74ba25931b7c9b96389c619f7bafde9f6396c3a5d216305a67**；
26捕获/21材料/8冻结输入，含原输出、argv/cwd/退出/耗时、规范/Schema、独立源码/保护/助手原始审计。
outer stdout_*合并双流，utc为完成时刻；助手内层36路为分离原始双流。
使用17个有界块经apply_patch搬运并重核SHA，未重复B32的截断传输问题。
后封核档/报告/控制回执单列控制档或E，不递归改主档。

助手只读来源18命令全0，589828字节/SHA256 72c9b0f002f7d856ada6160891311049f1a5859aef358d594158a1f69b30cf04，已携主档。
B8529290→A9886073、B579c731→A8c5b15b两笔完整path/mode/type/blob delta相等；最终14文件B/main28处同源。
Core77/公开头37、protocol9、web/packages60、web/scripts8、锁4/check.sh未变；未借实现或自测生成oracle。
助手静态复核的是本B新增设施，未运行产品/代独立B或C验收。

主M1221/B819/P1203原路径字节与mtime保持，主49声明/3普通Core严格保持；P生成49声明逐字同主树。
日志初始前2468508字节/SHA256 a16cb09053fef0812f3ca721673a0569ae1fdd133ed9cf752cf02b2c2edceac7保持，
C33并发条目保留，只追加REVIEW_LOG不提交；M3-coordination/research、旧工程/ref保护。B只新增测试/报告。

## 剩余边界与交接

C-95已由C33关闭，新增对应8项DOM已独立冻结但尚未执行。当前累计是旧56+新8=64条计划DOM，**不是64通过**；
旧30生产类型本轮未重跑，不能借A/C运行记成B新执行。
公开调用次数/原action与返回值已有可复用透明记录设施，但新组件实际调用路径仍0执行；
不能据设施绿关闭所有精确动作差额，更不能关闭B32-Q1原Promise强观察。

仍需补冻：真实组件原Promise即时成功/拒绝观察及同步卸载/迟到反馈强反例；
旧pointerdown/闭包/同Reply新链、读取顺序/store订阅/flushSync未提交render/绑定失败批次、
通知后异常/回调替换再抛、诊断不可遍历、多实例焦点/局部滚动、完整tarball/peer/CSS包外与真实Core UI。
这些不是等待C重复批准已明确部分；B按既定规范继续具体差额，具体新观察点仍交C审。
Q2当前合法输入边界保持关闭，未知reason显示仍不可达/未覆盖，不放宽Schema。

交A：原样导入9fd645b及本报告提交，不改旧56/30；C-95不重开，按剩余冻结差额推进，不能把本部分集合当完整组件实施放行。
交C：请核本固定新增输入及限定调用透传范围；不把11设施写成UI或原Promise消费通过。
交协调器/D：本轮新增冻结/取证/独立提交完成，到此结束；D无新任务，D-03仍M6。

未跑旧确认/属性完整全集、完整web/check.sh、Core构建/三配置CTest/ASan/native、旧全UI/包外、Linux/Windows/大型设计/M7/远端CI。
没有新Core或Electron main-preload-IPC UI E2E，不称M5整体/旧树L06/L09–11/Electron完成。
无生产API/ABI/IPC/Schema/protocol2/schema7/依赖/配置/工程格式变化；首版无持久化，保存/恢复/旧工程迁移不适用。
不新会话/定时器、不向ACD会话投递、不接管其工作。
