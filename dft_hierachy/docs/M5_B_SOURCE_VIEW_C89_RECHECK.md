# B22：SourceView C-89 固定交付独立复验

2026-10-17，独立测试 Agent B。token：dft-orch-22-b-db9f6c46-9c4a-4c17-a7fe-629b6ee3afb8。

## 结论与固定输入

固定产品 **a757417971426a9f7fe9ac00dd7e424868154463**（运行时交付 **8deed59e9530e732870fea769f537ca423538c58**）：
原冻结 **89+19+9=117 实际 DOM、28 类型规则、6 外部 tarball 消费组全部通过**，fail/skip/blocked 为 0。
缩放专项由上轮固定产品 d423022 的 5 绿 4 红变为本轮 9/9；未改动业务 oracle、fixture 或原断言。
C-89 的 B 复验通过；收尾读取最新 C22 交接时，C 已对同一 a757417 正式关闭 C-89。
该关闭属于 C 的结论，不冒充 B 执行；C-88 已由 C21 关闭，不重开。
本报告不宣告 M5 完成。

依据为 DESIGN §6.14、公开 DTO/声明和独立 B fixture，不读取 A 实现、生产 diff、自测档或烟测脚本生成预期。
DESIGN：339810 字节，SHA256 24963da4bc2ea72af2cc210c5ac74cbef8280892d04da185578110b4d94596ba。
原业务冻结 64f570d/f79827e/90ff51d、类型路径设施维护 70f91e5 保持原样。
原始输入及验收说明见原冻结计划、cases、fixture、README；本轮只增加接线设施和报告。

新增设施的先行冻结 **580ac568fc1874d2f8e18c86ea88889cb69bb547**；
隔离记录器修订 **3bef718d5611f5e5e230b2329dbe8c06923f5e35**。
两者只涉及 B 新计划/接线控制，非产品修改。B 分支 test/m5-tree 从 ba5ad27 开始。

## 专项验收条件

| 输入 / 场景                                             | 预期与判断依据                                                                                            | 本轮结果   |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------- |
| 原 89 项文本/高亮/状态/生命周期/无 CSS 及原 19 项 Q1/Q2 | 保持原冻结逐项手写预期；公开契约、真实 DOM 而非设施替身                                                   | 108/108    |
| scale=0.5、1、1.5，首次挂载/新 data，各 2 阶段          | 用真实 Range 起点与实际缩放后的正文视口比较，应可见；原文、mark、外部焦点/Selection、页面与父容器状态保持 | 6/6        |
| 三种 scale，同 data 再渲染                              | 用户内部滚动 17/23 保持，同时无外部焦点/Selection/祖先副作用                                              | 3/3        |
| 生产类型 28 条负例，20 个类型 fixture                   | 正例无诊断；负例按原规则失败；仅真实 React 声明，无 Node/Electron 类型泄漏                                | 28/28      |
| 六组真实打包/外部安装消费                               | 实际 npm pack/install，按原打包/导出/类型/浏览器/CSS/依赖契约验收，命令均退出 0                           | 6/6        |
| 普通 model/package/controls 三入口                      | model 实际执行 117 DOM+28 类型；package 实际消费 6 组；controls 与产品计数分账                            | 全部退出 0 |

缩放验收不固定产品 scrollTop，也不从某个实现反推定位公式。
旧 4 红为 scale 0.5/1.5 的首次/新 data 起点不在真实视口；历史报告/输出保留，未将其改成绿档。

## 实际命令与结果

证据目录 E=/tmp/hier-b-orch22-c89.rJLwYs。
独立 detached 产品 P=E/checkout with space 中文；T=P/web。
B=/Users/jiangbowang/MOI/2025/dftartist/2026.9/dft_hierachy-test-m5-tree。
N=/Users/jiangbowang/.npm-global/bin/node，npm=/opt/homebrew/bin/npm。
所有捕获均记录绝对 argv、cwd、UTC、耗时、退出码、完整合并 stdout/stderr 的压缩字节及 SHA。
安装命令另带 --no-audit --no-fund；完整参数以机器档为准。
表中 B 测试命令均从 B 执行并设置 HIER_B_PRODUCT_ROOT=P、HIER_B_BROWSER_TOOLS=T、
HIER_B_NPM_BIN=/opt/homebrew/bin/npm；PATH 以 /Users/jiangbowang/.npm-global/bin 开头。
类型别名复验改用 E/tools alias 中文→P/web，包含空格、中文与 macOS /tmp→/private/tmp。

| 实际命令                                                                         | 结果 / 秒                                                                   |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| npm --prefix P/web ci --ignore-scripts                                           | 0 / 0.429；fresh 固定锁安装 82 包                                           |
| npm --prefix P/web run check                                                     | 0 / 6.872；四包 TS、Schema 195 定义/27 方法、分层 51 模块/170 依赖与 7 反例 |
| N web/tests/independent-source-view/run.mjs                                      | 0 / 9.676；89/89 实际 DOM                                                   |
| N web/tests/independent-source-view/q1q2/run.mjs                                 | 0 / 2.809；19/19 实际 DOM                                                   |
| N web/tests/independent-source-view/scale/run.mjs                                | 0 / 1.807；9/9 实际缩放 DOM                                                 |
| N web/tests/independent-source-view/verify-types.mjs production（工具 alias）    | 最终 0 / 14.858；28/28                                                      |
| npm_config_offline=true N web/tests/independent-source-view/package.mjs          | 0 / 4.565；6/6 实际 tarball 组                                              |
| npm --prefix P/web run test:independent:m5:source-view                           | 0 / 26.504；28 类型、89+19+9 DOM                                            |
| npm --prefix P/web run test:independent:m5:source-view:package                   | 0 / 3.913；6/6                                                              |
| npm --prefix P/web run test:independent:m5:source-view:controls                  | 0 / 3.515；清单 5、类型 fixture 8、原生设施 5+14、A wrapper 23              |
| N web/tests/independent-source-view/recheck/aggregate-wiring.mjs                 | 最终 0 / 1.107；2 接线控制，productExecuted=0                               |
| npm --prefix P/web run test:independent:m5:tree                                  | 0 / 6.647；287 Node 测试与严格类型检查                                      |
| npm --prefix P/web run test:independent:m5:properties                            | 0 / 1.461；281 model 场景与类型检查                                         |
| npm --prefix P/web run test:independent:m5:source-navigation                     | 0 / 10.446；310 model 场景及 46 类型负例                                    |
| npm --prefix P/web run test:client / test:viewmodel（分别执行）                  | 各 0 / 0.512、0.420；47/24，A 编写、B 本轮实际执行                          |
| N web/tests/independent-source-view/recheck/verify-runtime-evidence.mjs --inputs | 0；验证旧 40 捕获档及历史失败，不是旧产品重跑                               |
| N E/audit.mjs、N E/protect.mjs --protect、Prettier --check、git diff --check     | 均 0；字节/mtime/输入身份保护                                               |

重复执行同一冻结不累加为新场景；清单/原生设施/wrapper 不计产品 DOM。
所有实际浏览器套件 cleanupErrors 空，生产装载与构建无新警告；六组消费命令全部成功并清理。
内置 browser 执行入口发现不可用，依据已完整读取的 browser 技能 fallback 使用固定 Playwright，
不是 in-app browser 或 Electron。环境为 macOS arm64、Node24.21.0、TS5.9.3、
React/DOM18.3.1、@types/react18.3.26、Playwright1.64.1、esbuild0.25.11、Chromium156.0.8078.4。

### 总入口接线与设施失败分账

完整 test:independent 本轮**没有作为产品总门禁执行**。
新控制将固定公开 package.json 原字节复制到自有临时目录，真实 npm 展开原脚本；
仅子 node/tsc 为记录器，嵌套 npm 通过真实绝对 Node/npm 执行，不复制/运行产品或 Core。

- 正例：SourceView model→package→controls 各一次，wrapper 在后；记录 cwd/executor/类型检查入口。
- 负例：model 记录器返回 23，npm 返回 23，package/controls/wrapper 均未调用。
- 两控制退出 0、清理为空，证明公开脚本展开和 && 短路；不能证明 runner 内部或完整 2511/Core 门禁通过。
  runner 的真实分派另由上表三个普通入口实际运行验证。

保留三条正式非零捕获，不改写：

1. b22_types28_alias：1；B 漏建 alias，ENOENT，尚未进入类型检查。显式建 alias 后原脚本通过 28 项。
2. b22_aggregate_wiring：1；新隔离设施失败，尚未执行产品。
3. b22_aggregate_wiring_diagnostic：1；确认复制的 type:module 使 require 记录器非法。
   新设施改用 ESM，并显式支持嵌套 npm 与 tsc，原顺序/短路预期不变；3bef718 后两控制通过。

另有一次工具源代码解析失败（未开始执行/改文件），及一次归档构建脚本写错 VALIDATION 路径的 ENOENT；
均为本轮编辑/归档事件，已修正，不混入产品失败或伪称产品执行。
收尾更新报告的一次 patch 因 Prettier 表格空白而整体拒绝，无文件变化；精确上下文重试成功。
新接线设施得到只读 B 辅助静态检查；辅助检查不算产品测试。

## 证据、保护与交接

机器档 docs/m5_b_source_view_c89_recheck.json：
**800103 字节 / SHA256 8b2857882727089a6ec6dd2c4b7f2b38b346584f00e75cfdcda4a77479712494**。
包含 26 完整命令捕获、92 材料、91 去重压缩块（含初始快照、46 声明、固定依赖 pin、原 B 输入与新设施）。
独立 verifier 验证原始输出、逐项 ID/统计、28 条类型规则、117 DOM、6 包、控制短路及失败分类。
运行 N web/tests/independent-source-view/recheck/verify-c89-evidence.mjs --inputs 已退出 0：
92 份材料、2773 个原文件字节/mtime、46 主树声明、初始工具清单与日志前缀全部匹配。
去掉 --inputs 可离线重放档案；两者都不算新产品执行。后置核验/提交/日志回执留 E，不递归修改封存档。

24 个既有 SourceView 测试文件在 B/P 逐字相同；Core/协议/ci/client/viewmodel/protocol-types 共 292 Git 对象相对上轮一致，
M/P 的 46 份生成声明相同。主树1042、原B707、产品1024个非日志文件字节/mtime均保持。
初始共享日志2086826字节前缀SHA256 b15bcf7e4ff17fdcc50783f149b58418345c792f741ddc33ab235cb588ac26da保持，
主树暂存0，固定产品干净；旧工程/ref、已有 M3-coordination/research 不改。
只新增 B 文件、只追加共享 REVIEW_LOG、不提交它，不新建会话/定时器/跨会话投递。

交 A/协调器：原冻结117/28/6在固定a757417上独立通过；可吸收本轮B新设施与报告，不改原测试/历史证据。
交 C：最新 C22 交接已正式关闭 C-89；本轮 B 对应的独立证据在此完成，不挪用 C 执行。
交 D：没有新增架构/契约审批请求，D-03仍归M6。
本轮未执行 fresh native build/CTest/ASan/完整 check.sh/完整 test:independent、真实 main/preload/Electron UI→Core、
候选确认 Selection、系统剪贴板/读屏/SSR、其他浏览器、Linux/真实设计规模/远端CI/M7；
SDK/model/DOM证据不得替代这些验证。本轮交接结束。
