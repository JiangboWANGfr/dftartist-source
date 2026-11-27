# B19 SourceView 主干冻结与无实现红基线

2026-10-17，独立测试 Agent B；cycle19，token=dft-orch-19-b-089ea857-7b8f-414c-bd97-e586796859cd。

主干测试已先冻结，初始红基线已实际运行。**不是组件验收通过；B-SOURCEVIEW-Q1/Q2 未澄清，完整实施前置仍未齐。**
C19 主干认可、要求两处明文澄清；本报告不替 A/C 关闭问题或放行实现。

## 固定版本与独立性

- 产品：df14ae6b931bf1f9f27345a5df86723bb8a0546d，纯 detached 独立 checkout。
- 测试冻结：64f570d9bb2306a2350b6fcf607d8c65a51458e6，11 个新增文件，提交完成后才运行正式红基线。
- B 分支：test/m5-tree；起点4ad1720db86ee7c8320fcd968bc477a60f95d224。报告另交独立提交，不把报告提交冒充更早冻结。
- DESIGN：338037 字节，SHA256 cd1b5d2822231bf7f73a126d915e9880656d417dff61e31136f0d0ad40af0362，§6.14。
- oracle 来自规范、Schema、原 B fixture、既有合法 SourceDocumentState 和公开类型提案；不是严格盲测，已读 A 固定交接及 C19 结论，
  未读 A 消费者负例、自测档或 SourceView 实现来生成预期。没有 SourceView 替代组件，也没有修改产品使测试变绿。

[冻结计划](plans/B-source-view-freeze.md)、[逐例输入/预期/依据](../web/tests/independent-source-view/cases.mjs)、
[类型逐例](../web/tests/independent-source-view/types.ts)、[运行说明](../web/tests/independent-source-view/README.md)。

## 覆盖与判断依据

89 个计划 DOM 用例都有独立输入、预期和规范条款。物理字节来源是 B 的 TextEncoder 文本常量；
UTF-16 位置表不是从组件输出回算。20 个实际 fixture 值另以真实生产 SourceDocumentState 严格编译校验。

| 组 | 数量 | 输入及关键判据 |
| --- | ---: | --- |
| 五态 | 5 | idle/pending/success/failed/cancelled；region 名称、busy/polite、正文/诊断所属状态 |
| 状态切换 | 8 | success→四种非成功/新 success；旧错误→idle/pending/success；旧文本/mark/错误原子清除 |
| 原文 | 10 | LF/CRLF/CR/BOM/tab/尾换行/非 BMP/HTML 样文本/空文/混合；code.textContent 逐 UTF-16 相同、无 HTML 执行 |
| 非空范围 | 3 | astral、CRLF、多行半开范围；单 mark 精确切片，前中后拼接还原原文 |
| 空范围 | 4 | 空文件、中间、EOF、尾换行 EOF；可见位置/“空范围”、不高亮邻字符、不插入假码元 |
| changed | 3 | 当前内容缩短/清空/不同；无旧精确范围、警告及有效描述引用 |
| 诊断 | 3 | failed/cancelled/HTML 文字；只读 origin/code/message，不读 data/dataIssue/cause/toJSON/getter/ownKeys |
| 非法 props | 21 | label 空白/非原始 string、height 非有限正数、class 非 string；宿主错误边界捕获 TypeError |
| 合法 props | 3 | 原始 label、空 class、小正高度；原值及组件整体高度 |
| 滚动 | 20 | 初次/重入 success、新 data/同 data 包装、用户滚动、props/父重渲染、隐藏/零视口恢复、长行/跨屏/空范围/StrictMode；只滚自身，不抢焦点 |
| 可访问性与原生交互 | 6 | Tab、键盘滚动、只读、浏览器 Selection/复制文本、多实例关联 ID 无冲突 |
| 生命周期 | 2 | 实际 SDK/L6 借用对象可继续使用；组件不订阅/发请求/取消/释放宿主资源，不建 timer/ResizeObserver/全局键盘监听 |
| 不导入可选 CSS | 1 | 原文、五态和基础高度/no-wrap/滚动布局仍成立 |

不固定私有 CSS 类、标签、ID 字符串、消息标点或 getter 次数。允许空 code 外壳和不改文本的空锚点；
role=status 的隐含 polite 合法。非法 state 伪造不属于新校验契约。只观察 TypeError 不足以证明验证顺序，顺序静态核对交 C。

另冻28个独立 TypeScript 负例（逐一去掉 expect-error，只接受该行真实语义诊断）和正例；
proposal 与 production 分账。TS exactOptional 拒绝显式 undefined 不替运行时 Q1 作答。

包外测试计划6组：React peer 范围、浏览器根导出及无 Node/Electron/ReactDOM 生产入口依赖、真实发布声明、
公开 CSS、单一 React 实例、实际包外 ReactDOM 渲染/无仓库内部依赖。
脚本先真实 npm pack；将来能力存在后才装实际 tarball、严格编译及浏览器渲染，不手改产品 manifest 或造 CSS。
**当前仅 pack+tar 读取 manifest 执行成功，后续安装/6组语义都未执行，不能提前声称该未来路径已被产品验证。**

## 实际命令、结果

N=/Users/jiangbowang/.npm-global/bin/node（24.21.0）；npm=/opt/homebrew/bin/npm（10.9.2），TS5.9.3，macOS arm64。
B=/Users/jiangbowang/MOI/2025/dftartist/2026.9/dft_hierachy-test-m5-tree。
P=/tmp/hier-b-orch19-source-view.gproIV/checkout with space 中文。
T=/Users/jiangbowang/MOI/2025/dftartist/2026.9/dft_hierachy/web/tests/independent-tree-view/c76/browser。
PATH=/Users/jiangbowang/.npm-global/bin:/opt/homebrew/bin:/usr/bin:/bin。
HIER_B_PRODUCT_ROOT=P、HIER_B_BROWSER_TOOLS=T、HIER_B_NPM_BIN=/opt/homebrew/bin/npm。
T 仅提供已固定测试工具，P 的四个生产包由 B 独立安装/构建，不复用他人的产品二进制。

以下省略重复的 N 和 web/tests/independent-source-view/ 前缀，完整绝对 argv/cwd/完成 UTC/耗时/合并 stdout+stderr 都在机器档。

| 实际命令 | 退出 | 实际结果 |
| --- | ---: | --- |
| npm --prefix P/web ci --ignore-scripts --no-audit --no-fund | 0 | 独立安装71依赖 |
| npm --prefix P/web run check | 0 | 四包 TS、195定义/27方法、49模块/167依赖、7分层反例；8.231秒 |
| --test inventory.test.mjs；run.mjs --list | 各0 | 3项 B fixture/清单检查通过；最终89个具名用例、两项公开歧义 |
| verify-types.mjs proposal | 0 | 正例0诊断、28/28独立负例、20个真实生成 fixture 类型正确；13.532秒 |
| verify-types.mjs production | 1 | 正例能力失败：缺 SourceView/SourceViewProps；负例 executed0，blocked28（由计划推导）；不是28个负例失败 |
| run.mjs --self-check | 0 | Chromium156.0.8078.4、React/DOM18.3.1，5个设施检查；StrictMode mounts2/cleanups2；productMounted=false |
| run.mjs | 1 | 缺生产 SourceView，1次能力失败；DOM planned89/executed0/pass0/fail0/skip0/blocked89 |
| package.mjs | 1 | 真实 npm pack 和 tar 读 manifest 各0；React peer 未实现，1次能力失败；6组 planned/executed0/skip0/blocked6 |
| Prettier --check 九个冻结代码文件；六个 mjs 的 node --check；git diff --check | 各0 | 格式/语法/空白通过，不是产品语义测试 |
| E/protect.mjs --protect | 0 | 共享999/B673/P981原文件字节+mtime、共享45声明、6工具pin及日志前缀保持 |
| verify-evidence.mjs --inputs --product --protect | 0 | 11冻结输入/981产品文件/2653原文件/90声明检查（45产品+45共享）/6工具pin；不执行产品 |

正式基线仅3条非零捕获，均是尚未实现的能力门禁；没有设施错误或清理错误。
类型能力缺失另外导致28条 unused expect-error 伴随诊断，仍不代表28次负例已运行。
草稿设施自检、早期85项清单及格式控制全部保留并标 setup-or-draft，**不把它们和最终89/正式执行相加**。
没有修改冻结预期来迁就红基线。

browser 技能要求先查内置执行入口；四种发现均无 node_repl js 工具，按技能 fallback 使用现有固定 Playwright。
实际浏览器探针通过只证明 React/Range/布局/StrictMode 设施，不证明 SourceView 的 DOM/ARIA/滚动/资源行为通过。

## 两项未冻结分支与交接

1. **B-SOURCEVIEW-Q1，open**：JS 显式 className:undefined 是省略还是同步 TypeError？
   主干已有省略/空串/非 string 对照，但 runtime undefined 分支必须 A 明文回 DESIGN 后 B 补冻。
2. **B-SOURCEVIEW-Q2，open**：空范围/EOF 是否沿用 aria-describedby；源码区域的语义关联目标究竟是 region/pre/可聚焦正文，或哪些等价目标？
   已冻非空 exact/changed ID 有效、说明在 code 外、多实例无冲突；没有以任意标签层次替规范作答。

交 A 明文澄清、交 C 窄补文核对、B 随后补充这两个分支；不新增 D/用户审批，不重做已认可主干。
C-87 维持 C18 关闭；C-81及已验属性单元不重开。未把 turn 结束等同 SourceView 实施放行。

## 证据与边界

[机器档](m5_b_source_view_contract_freeze.json)：638183字节，SHA256
8a9ee6a3b6949e83e48a7cbe2bcba01c63f9a85cafe8548507551ae533272efd。
32份完整命令捕获、62材料（11冻结输入+6公开规范/Schema/提案+45生产声明）、
63个校验 gzip 块（含领取快照）。捕获额外独立自带完整 gzip 输出。
[核验器](../web/tests/independent-source-view/verify-evidence.mjs) 可离线核档；
--inputs 核冻结文件，--product 需显式 P，--protect 另需本机原路径。校验不冒充复验产品。
报告/核档/提交后回执留 E，不递归把档案自身或末次提交收入档。

共享 REVIEW_LOG 仅追加、不提交；原日志前1995140字节保持。主树 HEAD/暂存不动，M3-coordination/research 原样，
45生成声明及测试工具原样，不动旧项目/ref，不改生产 API/ABI/protocol2/schema7/工程格式/依赖锁。
本轮没有 Core/CTest/ASan/UBSan、历史2511全量、真实 Electron/main/preload/IPC、L06/L09–11收口、
SourceView 产品 DOM、包外6组语义、系统剪贴板/读屏认证、远端CI/Linux、SSR/hydration、完整M5或M7预算的通过证据。
SDK受控Transport只是后续组件借用所有权探针，不是Core或Electron。只按本轮固定无组件交付收红基线。完成交接后结束本轮。
