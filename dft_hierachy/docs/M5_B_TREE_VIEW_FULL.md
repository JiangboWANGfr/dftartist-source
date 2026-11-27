# Agent B：树 UI 输入扩展冻结与独立复核

## 结论

输入/预期已独立冻结到 **5aa7f5ac992c6ba8cf42be5f92d3286cdd4f7ab0**：
140项浏览器输入＝原C76的24项＋新114项通用UI＋2项真实Core UI。
另有C-77观察负对照4项，不加进140当作144项产品通过。
95条件逐项映射，89条关联浏览器用例、6条为类型/回归/手工/后续Electron；
**不是95所有子分支完整冻结或生产L7/M5验收通过。**

实际生产仍缺HierarchyTree，最终入口退出1，**140计划／0语义执行／0skip**。
原800项独立回归通过；新夹具、真实Core桥及C77控制通过，但从未挂载生产树。
C-77确认成立，视图独立登记/消费旧拒绝仍未验证；关闭归C。
L02直接raw拒绝需C审适配；实际读屏8步只冻结、未执行。
本轮中途C已通过Electron§6.8，下一独立单元可继续冻结，本轮未交付Electron测试或运行时。

## 版本、来源、兼容

B test/m5-tree，从干净d4a0c8529b5db42df330c0f4e05e5ef7c679efd2开始；
先提交计划5bef27d，后提交上述输入。结果提交另记主日志。
输入提交中的测试/fixture/矩阵保持；结果只更新本轮计划、增加报告/证据及归档核验器。

UI规范固定b753daa6222ba942d900d38368dde67730dbde26 DESIGN§6.7；
当时全文SHA163ae6caf3eb6698c2d72e5af9eb9cc492a4f957bac9d58a2b8d10c78dfbb3ad。
当前2bed83b全文SHA36fd76c2b0df8f44827644ff045c789ce5175bb5be39f27d20dba1816f542de0仅新增§6.8。
§6.7正文相同，尾部空白统一单换行后13708字节SHA
6a2ec54ba597429c4b3b171cea4af826f337cbd8343bccd644d263ff82d2601c。

使用本人/tmp/hier-b-m5-tree-runtime.zM31cP/source固定2003dc0：
279份生产/构建/锁定输入与目标mode/type/blob一致，前后干净；
原B截至d4a0c85的380跟踪文件逐个原blob保持。27直接来源hash对齐冻结Git对象。
已读共享摘要，非严格盲验；不读A实现/原型/自测/diff或C探针定oracle，
只按规范、公开声明、原B输入与修改前产品设计测试，不借A/C产品或浏览器。

无生产源码/依赖/锁/API/IPC/Schema/Core ABI/配置/工程格式变化。
首版无会话持久化、保存恢复、旧格式迁移、计划编辑undo-redo；选择导航历史仍测试。

## 冻结内容与判断依据

[95条件新映射](M5_B_TREE_VIEW_ACCEPTANCE_FULL.md)、
[机器映射](../web/tests/independent-tree-view/ui/coverage.json)、
[入口及完整命令](../web/tests/independent-tree-view/ui/README.md)。
`ui/run.mjs --list`逐项输出input/expected/basis与C77限制，不只是用例标题。

新增覆盖props非法值/undefined/模型绑定，三类行、空根、失败/取消/重试/前缀/游标，
同名及escaped/数组/HTML/Unicode标签、跨页scope与模式切换，
选择历史、多项/定义/端口/信号owner定位、宿主唯一导航协调者，
键盘端点/Tab/焦点旧父链回退，双视图ID/订阅/会话局部状态，
5001宽树、深度120的121已加载实例加真实pending status，
推导DOM上界、ARIA/Chromium AX及真实Core UI两个输入。
未规定alert/status/aria-live包装的地方不强冻具体错误DOM角色。
展开控件button/role=button的可访问操作解释明确交C核，不从原型猜DOM命名。

旧C76夹具只读作为构建资产，新overlay只扩展B宿主和公开Transport。
实际React/SDK/L6，公开方法委托并保留原返回/抛出；
订阅包装委托原注册/off，仅计数及标记通知深度。
不造HierarchyTree/模型替身，不改私有字段、L6内部catch、调度器或时钟。
全局拒绝仅记录、不preventDefault；零unhandled不作为视图独立消费证明。

## 本轮实际执行

Node24.21.0、TS5.9.3、macOS arm64/Darwin25.0.0；独立Chromium156.0.8078.4。
复用C76锁定React/ReactDOM18.3.1、Playwright1.64.1、esbuild0.25.11，本轮无依赖安装。
browser技能发现首选内置执行接口不可用，已告知改独立Playwright，新建本人浏览器/服务器。
复用本人SDK/L6和RelWithDebInfo Core，不声称fresh native构建；
Core9323240字节SHA0e7f24f54aa619414811357c3388fd06cb919215099cc8381f87c4dd87400e6a。

测试在B目录；产品npm命令在本人固定source根。
HIER_B_PRODUCT_ROOT、HIER_BIN及React类型路径明确指向本人固定输入，完整argv/cwd见机器证据。

| 命令/集合                                        | 实际结果                                                                                                                                                                                    |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 新 `ui/run.mjs --self-check` 开发/最终           | 均0；最终mixed10行/4查询、wide5001/1、deep122/122、空0/1、长前缀42/2；StrictMode最终2mount/2cleanup，一次真实点击；重试/reveal、poison、订阅、独立SDK等待者取消及空reload通过。未挂载生产树 |
| `ui/run.mjs --core-self-check` 开发/最终         | 均0；最终浏览器SDK/L6→B HTTP测试桥→真实NDJSON Core，11查询/12投影行，深端口owner与原选择保持；重开两快照，各exit={code:0,signal:null}，无poll/缓冲残留。未挂载生产树，不是Electron          |
| 默认生产浏览器入口，初次/最终                    | 均1；初次138与最终140库存保留，最终140计划/0执行/0skip，缺出口                                                                                                                              |
| 修订声明直接消费原46消费者，初次/最终            | 均0；正例零诊断，46项去标记的真实负诊断，消费者/验证器原字节                                                                                                                                |
| 原生产类型/出口能力入口                          | 均1；类型4个2305＋46个2578＋1个7006，共51，源因缺API；不是46语义失败；真实出口仅版本常量                                                                                                    |
| 原公开模型plain Node                             | 0；4/4、零skip/todo/cancelled                                                                                                                                                               |
| 新C77观察控制plain Node，初次/最终               | 均0；父4/4；raw无人处理子进程预期1，其余三种0；不是UI通过                                                                                                                                   |
| 本人产品 `npm --prefix web run test:independent` | 0；800/800、零skip/todo/cancelled                                                                                                                                                           |
| `test:independent:m5`                            | 0；原241及33类型负例、读取类型消费者通过                                                                                                                                                    |
| `test:independent:m5:tree`                       | 0；原287及35＋14类型负例、合法输入消费者通过                                                                                                                                                |
| `npm --prefix web run check`                     | 0；生成、TS增量构建、分层和7负探针，不称全仓ESLint                                                                                                                                          |
| 新输入格式/语法/95映射/链接/diff/来源            | 均0；冻结时7个mjs语法、95条件/140输入/8手工步骤、11本地链接及27Git来源                                                                                                                      |
| `ui/verify-evidence.mjs`                         | 最终0；完整归档及Git输入核验。该新增核验工具最初ESM绑定错误退出1，仅修正工具后通过，见下文独立记录                                                                                          |

138→139→140是冻结前添加SDK独立等待者/局部会话输入及深pending场景的开发库存。
没有根据生产执行结果放宽预期。未来真实产品执行仍须检验产品及测试本身。
800含241/287等子集；46重复运行、公共模型4和C77控制4不跨层重复累加。

## C77及剩余项

[C77独立确认与负对照](../web/tests/independent-tree-view/ui/c77-observation.md)：
没有视图处理器时，真实L6无论有无B观察器都正常退出，
故原C76-13只能支持晚反馈/所有权，不能证明视图登记并消费旧拒绝。
L09/L10/L11和新枚举已标未验证。原24及历史红不改，B不自行关闭C77。
只拦then/catch会误判合法原生async/await，不据此设假门禁，不改L6内部catch。

L02的[公开方法边界适配申请](../web/tests/independent-tree-view/ui/command-error-adapter.md)待C审，
真实AggregateError的内层primitive/Proxy不冒充命令直接拒绝值。
L06当前用例核自有已处理异步回调不聚合/不重复，未证明组件完全不await返回值；
强观察仍需另补，不拿等价终态当内部行为证明。
[8项实际辅助技术步骤](../web/tests/independent-tree-view/ui/assistive-technology.md)未执行；
生产DOM/AX同样零执行，不称读屏合规。
C现已通过§6.8，但真实隔离preload/来源/新文档/旧id、首帧/早关闭、错误DTO和回收
尚待后续B冻结，HTTP测试桥不等于Electron，也不验证原始数字证据/生产背压/M7。

交A：输入可原样吸收，不因140/89映射推定完整95或所有前置满足；
不改原B测试或L6 catch绕C77，缺出口红保持至真实交付。
交C：复核新判据/真实夹具、窗口/ARIA、展开控件解释、适配申请和C77覆盖纠正；关闭本人意见归C。
下一单元可继续已获前置的Electron独立准备，不重新请求用户批准既定路线。

## 归档与未执行

[主机器证据](m5_b_tree_view_full.json) SHA256 **5db8ea2494817e4288f7b0ae13a59a1cbc1fe81d23161a2527993d2f93fd7bcd**：
32完整命名捕获，374478原字节／74095 gzip字节，逐项解压/长度/hash通过；
27源码/配置hash对齐5aa7f5a Git对象。是hash清单，不是完整源码嵌入，
完整测试在独立提交。四个顶层非零均为已知缺出口/类型红，
C77预期子进程exit1嵌在通过的父TAP中；这32份无非预期测试/环境失败。

[归档工具后续检查](m5_b_tree_view_full_archive_checks.json)另记两次：
首次把CommonJS require直接存成.mjs导致ReferenceError（初次工具返回未单独存档，复现完整记录保留），
仅加createRequire的ESM绑定后通过；没有改测试oracle、原32输出或产品。
不隐瞒此工具错误，也不声称捕获所有探索性读取/编辑。
复核命令：`node web/tests/independent-tree-view/ui/verify-evidence.mjs`。
本轮计划进度可更新；其冻结快照仍按Git对象验证，其余冻结输入保持。

未执行生产140语义、实际AX/读屏、Electron、Core三配置/check.sh、真实大设计、
Linux/远端CI、覆盖率和M7；无native变更，不跑无关构建充数。
类型临时输入为证据保留；本人浏览器/页面/HTTP/Core关闭，模型/SDK按宿主顺序释放，
不把这项检查称通用堆上界证明。主日志只追加不提交，协调/research/A/C计划、旧工程/ref保持。
