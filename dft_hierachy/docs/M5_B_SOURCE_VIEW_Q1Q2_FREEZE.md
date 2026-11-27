# B20 SourceView Q1/Q2 增量冻结与红基线

固定产品 **de11aa25bb6f0501d499342621c20acef87350fc**，2026-10-17。
DESIGN§6.14：339655字节，SHA256 dd046501a6dadcd2bb89e594310ef279a669cb91dd4b0a73b9ec6503e4f4aa66。
cycle20/token=dft-orch-20-b-203d9bd3-fe98-4969-9f07-bbf7a7790421。

**B-SOURCEVIEW-Q1/Q2 的明文回复可验收，本B确认关闭规范歧义；增量测试已独立冻结。**
这不是运行时/DOM通过，也不代C完成窄复核。组件仍未实现，不能以本报告放行SourceView产品或M5整体。

## 冻结与覆盖

B分支test/m5-tree，起点f6ab33f9e7c1f200e6cced1f6db117836b84c5d8。
首冻6ffef4e9e10f5fcf702c079650dadaf537916659（8新增文件）；
最终冻结 **f79827e75b733db7036e213943a3c627b800bcd2**（只删两个新Markdown的尾部空行，不改可执行oracle）。
后者之后单独运行最终专项基线；两次提交/运行原输出均保留，没有amend/reset改写历史。

[计划](plans/B-source-view-q1q2-freeze.md)、
[逐例输入/预期/依据](../web/tests/independent-source-view/q1q2/cases.mjs)、
[运行说明](../web/tests/independent-source-view/q1q2/README.md)。

| 专项输入 | 数量 | 独立预期与依据 |
| --- | ---: | --- |
| className省略、空串、显式undefined、null、String包装、number、array、symbol | 8 | §6.14.1；前两种合法，其余同步TypeError；宿主保留own-property省略/undefined差异，不强转、不伪造SourceDocumentFailure |
| 非空短文/双轴溢出、空范围中间/空文件/EOF/尾换行EOF、changed空文/短文 | 8 | §6.14.3/.4；同一tabIndex0双轴正文滚动容器直接关联当前可见code外说明；无溢出仍适用；原文保持 |
| 连续exact→空范围→changed、多实例、StrictMode | 3 | §6.14.3/.4/.5；当前说明关联更新、实例ID无冲突、严格模式语义不变 |

共19计划产品场景，另8个真实生成文档fixture严格编译为生产SourceDocumentState，不造第二套DTO。
B19原14文件保持逐字节不变，原89 DOM/28类型/6包消费及历史open/三红不改写；未来组件必须同时跑原套件与本增量。
这些有行为交叠，不能称19个新增功能或把108条计划写成已执行通过。
未读A实现/消费者负例/自测档定oracle；非严格盲测，已读固定交接/公开提案及C意见。

原生DOM设施14项：合法div/pre、display:contents说明、ID列表顺序；拒绝仅祖先、同样可聚焦双轴overflow的祖先替代、
非职责pre、无滚动职责、非tabIndex0、失效ID、隐藏说明、跨实例说明、code内说明、重复ID。
这些不是SourceView替代组件，只测试B断言能否拒错/容许合法形态。
滚动职责在读关联属性前选定，不因近层缺关联而去接受祖先；可见文字用DOM Range，不要求说明包装盒拥有ClientRect。
冻结前静态QA发现并修正了这两处设施边界，12项草稿控制与最终14项分账，没有迁就A输出。

## 实际命令与结果

N=/Users/jiangbowang/.npm-global/bin/node（24.21.0），npm=/opt/homebrew/bin/npm（10.9.2），TS5.9.3，macOS arm64。
B=/Users/jiangbowang/MOI/2025/dftartist/2026.9/dft_hierachy-test-m5-tree。
E=/tmp/hier-b-orch20-source-view.EcKWx2，P=E/checkout with space 中文（纯detached）。
HIER_B_PRODUCT_ROOT=P；
HIER_B_BROWSER_TOOLS=/Users/jiangbowang/MOI/2025/dftartist/2026.9/dft_hierachy/web/tests/independent-tree-view/c76/browser。
PATH=/Users/jiangbowang/.npm-global/bin:/opt/homebrew/bin:/usr/bin:/bin。
React/DOM18.3.1、Playwright1.64.1、esbuild0.25.11，Chromium156.0.8078.4。
工具只供测试，生产包在P独立安装/构建，没有共用A产品二进制。

下表省略N和web/tests/independent-source-view/q1q2/前缀；机器档保存完整argv/cwd/UTC完成时间/耗时/合并stdout+stderr。

| B本人实际命令 | 退出 / 实际结果 |
| --- | --- |
| npm --prefix P/web ci --ignore-scripts --no-audit --no-fund；run check | 各0；独立71依赖、四包TS、195定义/27方法、49模块/167依赖、7分层反例 |
| --test inventory.test.mjs；run.mjs --list | 各0；2项清单/fixture检查、19具名场景和两项已明确分支 |
| verify-fixtures.mjs | 0；8文档值/严格0诊断，真实生产DTO声明，Node/Electron ambient输入0；不是组件执行 |
| run.mjs --self-check | 0；14/14原生DOM正反探针；productMounted=false、生产executed0 |
| run.mjs | **1**；生产SourceView缺失，1能力失败；planned19/executed0/pass0/fail0/skip0/blocked19 |
| 原verify-evidence.mjs --inputs（根目录） | 0；旧32捕获/三红/11原冻结输入保持，只核历史档，不是旧套件重跑 |
| E/audit.mjs | 0；B19的14文件在共享/B/P原样；选定304生产/构建blob与df14ae6相同，不读实现diff定预期 |
| Prettier最终完整新增目录；node --check五个冻结mjs；git diff --check | 各0；静态/设施检查 |
| 本增量verify-evidence.mjs --inputs --product --protect | 0；8冻结输入、996产品原文件、2697原文件、90声明检查（45生产+45共享）、6工具pin及日志前缀 |

正式最终专项只有1个缺能力红。首次冻结也跑出相同能力红，不能将二次运行算两种产品缺陷。
所有实际非零完整保留：冻结前verify-fixtures格式检查退出1；首次暂存检查退出2（两个新增Markdown尾空行）；
首冻/最终各一次能力红退出1。前两项为B设施/空白，不是产品或规范错误，已修正并复核0。
首次暂存检查返回后仍提交是B执行控制失误；不隐瞒或重写该提交，以独立纯空白提交修正后重新运行最终基线。
另一次apply_patch拒绝对同一路径同时Delete/Add，无文件变化；改用Update成功。这是编辑工具错误，不是测试执行。

browser技能查不到内置执行入口，按fallback使用已有Playwright。
没有把原生DOM设施当作SourceView、内置浏览器、Electron或读屏认证；无sleep产品SLA或假组件。

## 证据与保护

[机器档](m5_b_source_view_q1q2_freeze.json)：**637514字节 / SHA256 e9f69d6fb3b33ebd0866f99f26d35a85acc4769cb8aec6d9a599565c3c579077**。
41完整命令捕获、61材料（8冻结+6公开规范/Schema/提案+45生产声明+2B保护/范围脚本）、62校验gzip块含原快照；
每次捕获另带完整gzip输出。草稿、首冻、最终分阶段标记。
[核档器](../web/tests/independent-source-view/q1q2/verify-evidence.mjs)核档不执行产品；--inputs校验最终冻结，--product指定P，--protect需本机原路径。
报告/核档/提交及日志后置回执留E，不递归改机器档。

共享1014/B687/P996原文件字节+mtime、共享45生成声明、6工具pin保持；领取日志2020334字节前缀保持。
主树HEAD/暂存不动，B自有提交不含共享日志。M3-coordination/research、旧工程/ref原样。
无API/ABI/IPC/Schema/protocol2/schema7/依赖锁/工程格式变化；不增加持久化或旧格式迁移。

## 交接与限制

- 交A：按顺序吸收6ffef4e及f79827e，再取本报告提交；B确认Q1/Q2关闭是规范明文+独立冻结完成，不是实现已过。
  生产组件以后同时跑原89与专项19，以及原28类型和6组包外门禁。不得据SDK/类型探针宣称UI/Electron完成。
- 交C：Q1/Q2补文由B确认；窄审结论以C最新日志为准，不代C关闭其它意见或新增D/用户审批。
  取证后新见C-88合法工具路径别名问题，**单独待B设施维护与C复核**；本轮未复现/修复/关闭C-88，未把C的执行算作B证据。
  它不是Q1/Q2规范歧义，不用它撤销本次独立冻结，也不宣称旧类型入口支持该路径。
- 交协调器：B20增量完成；C-87维持已闭、C-81/已验属性单元不重开，D阶段响应保持、D-03仍M6。
  当前SourceView产品DOM19及原89/28/6重复执行、Core/CTest/sanitizer/2511、真实main/preload/Electron IPC、
  L06/L09–11/候选Selection UI收口、系统剪贴板/读屏、远端CI/Linux、SSR、M5整体和M7都无本轮通过证据。
  不接管A/C/D，不新会话/定时器或跨会话投递；交接后结束本轮。
