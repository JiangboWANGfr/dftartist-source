# B-ORCH-17：SourceNavigation 独立运行时复验

## 结论与固定对象

**本轮交付不放行：C-87 High/open。** 冻结的功能行为通过，但标准 `test:viewmodel`
在 unset、无效根和有效旧产品根三输入下失败；正确根的通过仅是对照，不是修复。
C-87 由 C 提出，本 B 独立冻结并实际复现；关闭权仍归 C。Q1/Q2、C-86 保持已关闭。

- 固定产品：`a7587b6fb3e8c57675021cb14ab50822aef5fa08`，纯 detached，无覆盖 A 实现。
- 原 B 冻结：`bdbc2c7fa2fd86c895e05aa9e3bfc25d401d8085`；
  ready 补充：`0efe853560ade65d1c7252fd214998df6c2ecdb1`。
- 本轮 8 共存行为 / 23 接线设施先冻结后执行：
  `b5671a46e87d877b67b89f938f35e4c1e6acfc0f`。
- C-87 四项标准入口边界先冻结后执行：
  `12d793a52681d889d22541009ca8fa83ea62ea59`。
- 测试分支 `test/m5-tree`，起点 `8a541eb70fe1d3a7b6bd8624d2177db0de819bb2`。
- DESIGN 326921 字节，SHA256
  `fec8a65ab9a62e1966a300e1eaa81fd6286361acd2cd4bb2063c21c96c2780f1`。

已读 AGENTS、最新 REVIEW_LOG、§6.13、关联契约/计划与公开验证门禁。
读过 A 交付摘要和 C 意见，非严格盲测；未读取 A 运行时实现、实现 diff 或自测源码生成 oracle。
判断依据仍是已审规范、原始 byte/HDL fixture、Schema、公开类型和标准入口职责。
本轮未修改生产实现、原测试预期、依赖、Schema 或工程格式。

## 可验证条件与覆盖

| 条件 / 判断依据                | 输入与预期                                                                                                                 | B 实际结果                    |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| §6.13 聚合、文档绑定、事件资格 | 原冻结正常/边界/错误、重入、晚页、Q1/Q2、取消/释放；原 Reply/错误/监听身份与结算规则                                       | 310 模型全过                  |
| 公开类型、SDK→Node→Core        | 46 负类型必须产生目标诊断而非缺模块；真实 HDL/byte fixture 10 Core，不用设施 stub 代替                                     | 46 / 10 全过                  |
| 旧共享 SDK 的其它模型独立性    | 8 输入覆盖双方向共享请求取消/释放、诊断作用域；只拒拥有者等待者、不错误 wirecancel，原错误身份保持                         | 新 8/8                        |
| 公开接线及非零传播             | 模型第二 --all、Core --core、controls 聚合；5 必需入口各 exit/signal/missing，目录代文件、非法参数                         | 新 23/23；旧 41/41 原样       |
| 标准入口固定当前产品           | unset / 不存在根 / 已构建旧 b55 根 / 正确当前根；真实 npm 子命令均须 exit0、tests≥24、pass=tests、零 fail/skip/cancel/todo | 4 项：1 过 / 3 败，整体不接受 |
| 跨模块回归                     | 原 SourceDocument/Candidates/Position、树/选择/属性/renderer、Core/Schema                                                  | 完整 2511 与 CTest75 全过     |

新清单通过各冻结文件的 `--list` 给出每项 input/expected/basis；原模型/类型/Core清单保持。
8 共存行为采用公开 API/Transport，以及原 B 的公开错误读取故障注入，不固定私有协作实现。
23 接线设施仅验入口传递与失败传播，不算新模型或真实 Core 语义。
C-87 测试是实际 npm 执行，不 stub 产品；四项 child receipt 保留 argv、cwd、环境根、状态、完整双流。
自有临时目录 finally 清理；C-87 独立20秒进程组 watchdog 是设施界限，不是产品 SLA。
23 接线旧式同步设施的超时后组清理，不据此宣称任意挂死后代都有独立异步 watchdog 保证。

## 实际执行

缩写仅为阅读：`B=/Users/jiangbowang/MOI/2025/dftartist/2026.9/dft_hierachy-test-m5-tree`；
`E=/tmp/hier-b-orch17-navigation.hnGWbJ`；`P=E/source`；
`OLD=/tmp/hier-b-orch16-ready.Ij2g9V/source`；
`N=/Users/jiangbowang/.npm-global/bin/node`。
实际 capture 使用绝对展开 argv，cwd 的 /private/tmp 与 /tmp 是同一目录。
统一 Node24.21.0、npm10.9.2、TS5.9.3；PATH 显式
`/Users/jiangbowang/.npm-global/bin:/opt/homebrew/bin:/usr/bin:/bin`，不拿 ambient Node23 替代。

| 实际命令（cwd，额外环境）                                                                                                                                                                                                                                             | 退出 / 结果                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `npm --prefix web ci --ignore-scripts --no-audit --no-fund`；`npm --prefix web run check`（P）                                                                                                                                                                        | 0 / 71依赖；195定义/27方法、四包类型构建、49模块/167依赖与分层检查                |
| `N web/tests/independent-source-navigation/ready-baseline/run.mjs --all`（B，HIER_B_PRODUCT_ROOT=P）                                                                                                                                                                  | 0 / 310/310                                                                       |
| `N web/tests/independent-source-navigation/verify-types.mjs`（B，同上）                                                                                                                                                                                               | 0 / 46负例、正例无诊断                                                            |
| SourceDocument/Candidates/Position 原 model/type 脚本（B，同上；完整 argv 在档）                                                                                                                                                                                      | 0 / 306+281+258模型，34+47+32类型                                                 |
| `N --test web/tests/independent-source-navigation/recheck/coexistence.test.mjs`（B，同上）                                                                                                                                                                            | 0 / 8/8                                                                           |
| `N --test web/tests/independent-source-navigation/recheck/wrapper.facility.test.mjs`（B，同上）                                                                                                                                                                       | 0 / 23/23                                                                         |
| `npm --prefix web run test:independent:m5:source-navigation`、对应 `:controls`、`:core`（P，HIER_BIN=P/core/build-b-review/hier；完整环境在档）                                                                                                                       | 均0 / 46+310、8设施、10真实Core                                                   |
| 原 wrapper设施二组（B，HIER_B_PRODUCT_ROOT=P；完整 argv 在档）                                                                                                                                                                                                        | 0 / 41=20+21                                                                      |
| `cmake -S core -B core/build-b-review -DCMAKE_BUILD_TYPE=RelWithDebInfo -DHIER_BUILD_EXPERIMENTS=OFF -DHIER_TEST_M3=ON -DHIER_TEST_FUTURE=ON -DHIER_TEST_OBSERVER=OFF -DHIER_SCHEMA_PYTHON=/Users/jiangbowang/miniforge3/bin/python3.12` 加6项已核第三方源码路径（P） | 0 / 新目录配置，完整6个 FETCHCONTENT 参数在 b17_core_configure capture            |
| `cmake --build core/build-b-review -j 8`（P）                                                                                                                                                                                                                         | 0 / 全注册目标，自建70.597秒                                                      |
| `ctest --test-dir core/build-b-review --output-on-failure`（P）                                                                                                                                                                                                       | 0 / 75/75，55.343秒                                                               |
| `npm --prefix web run test:schema`（P，HIER_SCHEMA_PYTHON 同上）                                                                                                                                                                                                      | 0 / 655/655及27规范化                                                             |
| `npm --prefix web run test:independent`（P，HIER_BIN、自有正确 HIER_B_PRODUCT_ROOT、PATH 同上）                                                                                                                                                                       | 0 / 2511全过，58.721秒                                                            |
| `npm --prefix web run test:client`、`test:viewmodel`（P，HIER_BIN、HIER_B_PRODUCT_ROOT=P）                                                                                                                                                                            | 0 / 47及24；A authored回归由B实际执行，不冒充独立设计；24仅环境对照               |
| `npm --prefix web run test:core`（P，HIER_BIN同上）                                                                                                                                                                                                                   | 0 / 3 SDK→自建Core集成                                                            |
| `env -u HIER_B_PRODUCT_ROOT npm --prefix web run test:viewmodel`（P，显式PATH）                                                                                                                                                                                       | **1 / 24=23过、1加载失败**                                                        |
| `N --test web/tests/independent-source-navigation/recheck/viewmodel-gate.test.mjs`（B，HIER_B_PRODUCT_ROOT=P、HIER_B_OLD_PRODUCT_ROOT=OLD、显式PATH）                                                                                                                 | **1 / 外层4=1过、3败**；四 child 分别 exit1/1/1/0，均实际24项，前三23/1、最后24/0 |
| 历史 ready-baseline/verify-evidence.mjs --inputs（B）                                                                                                                                                                                                                 | 0 / 只核原27输入，不算本轮产品执行                                                |
| 格式、语法、diff检查、来源/声明/保护、完整统计校核（完整 argv 在档）                                                                                                                                                                                                  | 最终0；两次审计脚本初红另保留如下                                                 |

完整 2511 = 810 基础 Node + 26身份 + 属性281/5Core + renderer99/25/12/40/6，
再加 document306/4时序/14Core + candidates281/13Core + position258/11Core + navigation310/10Core。
类型分组22/16/34/47/32/46以及13+8设施另计；原 controls/重复入口/新8及23不重复相加。
bundle控制仅说明JS realm边界，不说明真实UI或Electron。
所有已通过模型/Core与清单均零 fail/skip；新C-87三项红原样保留，无 skip/xfail 或预期改绿。

## 来源、构建与非零结果分账

自建二进制 9325112 字节，SHA256
`cdb0b7fe5b5a282ef7a18f915be14e63a8ffe9f5164e31d9526843bd02fcd926`。
AppleClang17/CMake4.0.2，单 RelWithDebInfo、observer OFF、sanitizer OFF。
共享的6项第三方仅复用源码，经前后 git-clean与2403跟踪文件hash核对；没有复用他人产品二进制。

本次完整目标构建有 **6条重复库 linker warning、0 compiler warning**。
早期 warning 审计误将历史 B13 仅 `--target hier` 的日志和本次全目标比较而退出1；
修正审计明确目标集不同，Core源码树虽相同，也**不声明全目标警告零增量**。
另一次完整统计审计未区分类型报告与模型 results 而 TypeError 退出1，修正解析后按实际结果核2511。
两次原脚本/输出均保留，是 B 审计设施失败，不是产品语义失败或放宽 oracle。
另两条非零 capture 才是本轮实际 C-87：直接 unset 与四项入口测试。四条非零各有归属。

## 证据、保护与可复核性

便携机器档 [m5_b_source_navigation_runtime_recheck.json](m5_b_source_navigation_runtime_recheck.json)：
**1635863字节 / SHA256 5d8b7c8992623dc795d55ccddbb065198e5c2b15b9172f0e812bb76db76128e9**。
70捕获、60材料、52公开pin、4构建产物pin，共130压缩块，原文2976928字节、gzip1090799字节。
含 argv/cwd/UTC/耗时/退出/完整原输出、两个新freeze、历史模型/HDL输入、规范/Schema/声明、
构建缓存/CTest日志、保护/来源/统计脚本及独立初红。
功能阶段52捕获档原样嵌入为历史材料（840122字节、
`13fe2de892c36f98e30e68662bbfeca7f69d0adc5b59e05843ca5805b9ab6273`）；
其中当时的 true 仅指尚未发现 C-87 的功能阶段，**最终v2 acceptance=false**，不覆盖历史事实。

实际最终核档命令（B，PATH如前、HIER_B_PRODUCT_ROOT=P）：

```sh
/Users/jiangbowang/.npm-global/bin/node web/tests/independent-source-navigation/recheck/verify-evidence.mjs --inputs --product
```

退出0，核33个B输入、1017个产品/公开/产物检查（有交叠，不当新语义），
证实310/46/10、8/23、2511/75和C-87的1过3败；核档器执行产品语义0。
核档之后的最终报告/commit/日志保护回执只存 E，不递归更改封档70捕获。
最终静态QA后补强核档断言：四项envRoot/oldProduct及摘要交叉一致、四条非零捕获集合完整。
只更新核档器及其入档材料/本报告hash；原70捕获、两次冻结、产品预期和1过3败结论未变，未重复产品语义。

共享979、B起点661、纯产品961个非日志文件保持；原B254测试及导入24文件保持。
原42个生成声明中41原样、barrel只增加，新3份，当前45声明与共享产品一致。
52公开pin/4构建产物pin复核；共享staged=0，原日志1930585字节前缀SHA256
`bf7b10b37b8f1190640905e255c00137296d263b586a01c93ce3d30a0ddae473`保持。
仅B自有测试/报告commit；共享 REVIEW_LOG 只追加、不提交，M3-coordination/research保留。

## 限制与交接

- **交 A：** 修常规 viewmodel 测试入口的当前产品绑定，保留B专用 fixture 的显式固定根要求及全部310/46/10预期；
  不删除/skip测试或靠补环境变量宣称修复。交新固定SHA与普通unset/错误根结果，不需要新D/用户契约审批。
- **交 C：** B已独立复现C-87，关闭由C对应复核；不新增同义缺陷号、不重开Q1/Q2/C-86。
- **后续 B：** 固定修复后先跑这四项冻结与标准入口；若仅测试入口变、产品pin不变，不因报告导入或状态收尾重复同一2511全量。
- 本轮未执行 Debug/ASan/UBSan/完整check.sh三配置、Linux真实设计、远端CI或全进程FD/内存/性能预算。
  所有Core测试是真实SDK/Node/Core，但不是React UI/main/preload/真实Electron IPC/E2E；L06/L09–11不能据此完成。
- SourceView/候选UI、Selection权威地址判别、M5整体、D-03/M6和M7仍保持后续范围；
  首版无持久化，工程创建/保存/恢复及旧工程迁移不在本单元，不虚构通过。
- 不接管A/C/D，不开新独立会话/计时器，不恢复监控或跨会话投递。完成本轮交接后结束。
