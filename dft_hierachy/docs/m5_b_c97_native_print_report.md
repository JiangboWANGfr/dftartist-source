# B38：C-97 组合 print/eval 原生兼容专项

## 固定输入与结论

产品固定 `9e99a041c05fbdd574e146c8c35aaa003914f2b1`；B 初始 `8ed98381d0a47ea3e860d1c570fdf1851d713c26`。
先冻结 `2e50c7867306966d739b503bb59ea00dcb9ef4bf`，再修订 `1724c0d95c367e27534e2096ab9fcd4a3c5d0cc3`。
这是 B 自有三个核档设施的兼容修订，不是产品实现。C-97 是否关闭交 C 决定；Q1、完整组件、M5、UI/Electron 均未借此放行。

| 原生运行时（Darwin arm64） | 未修三入口，76 项        | 同冻结输入，修后三入口 | 回放固定旧产品三入口 |
| -------------------------- | ------------------------ | ---------------------- | -------------------- |
| Node 20.12.2               | exit1，64 通过 / 12 失败 | exit0，76/76           | exit1，64/12         |
| Node 22.0.0                | exit1，64 通过 / 12 失败 | exit0，76/76           | exit1，64/12         |
| Node 24.21.0               | exit0，76/76             | exit0，76/76           | 未重复回放           |

四份红结果的失败名均恰为：3 模块 × real/alias × 有/无消费者 archive 的 `-pe` 导入，共 12 项；分开/长形态、单 print、真正 CLI 对照仍通过。
76 是独立用例数，不因三个版本执行而声称有 228 个不同用例。所有 TAP 的 cancelled/skipped/todo 均为 0，无 xfail 或预期改绿。

## 验收条件、输入和判断依据

依据 B36 的导入无副作用/真正 CLI 必须真实核档契约、AGENTS 兼容规则、web engines，以及公开 Node CLI。先读规范/公开接口，不用 A 实现、diff、自测或 C 探针生成 oracle。
测试文件 `web/tests/independent-source-candidates-view/imports/combined-print.test.mjs` 与计划已先提交冻结，修订后逐字节保持。

- 4 个运行时前提：`-pe`、`-p -e`、`--print --eval`、`-p` 打印 `void 0` 为 `undefined\n`，exit0、stderr 空。使用 CommonJS 动态 import，不把 print 与不支持它的 ESM eval 组合。
- 48 个导入：3 模块 × real/alias × 4 形态 × 有/无无效消费者 `--archive`；消费者 argv1 特意与真实目标模块路径相同。只允许消费者的 `B38_LOADED=function` 和 print 的 `undefined` 两行，顺序不限；exit0/stderr 空。不得额外核档输出或读取消费者 archive。
- 24 个真正 CLI：3 模块 × real/alias × 有/无 inline `--title=-pe` 数据 × 有效/无效档。有效须非空 JSON、verified/metadataOnly 为 true、currentProductExecuted 为 0；无效须 exit1 且有诊断，不能空成功或吞异常。
- alias fixture 使用 realpath 与独立 mkdtemp，finally 仅移除自身目录；取消继承 NODE_TEST_CONTEXT，15 秒为 fixture watchdog，不是产品超时契约。
- 首冻前探索把 `-ep` 当合法，原生 20 实际 exit9，另有分开 `--title -pe` 缺值 exit9。完整初稿/原失败保留，冻结前改用合法矩阵及 inline title 数据；不是产品缺陷，不是跳过已冻结用例。

唯一修订为三个旧 main fallback 正则各插入一个 `+` 字节：`^-[ep]$` → `^-[ep]+$`。
native import.meta.main 优先、realpath、verify/selfTest、历史档/pins 和产品全部保持。不是根据实现改变测试预期。

| B 路径（均在 web/tests/independent-source-candidates-view 下） | 修前 bytes / SHA256                                                      | 修后 bytes / SHA256                                                      |
| -------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| pagination/release/verify-evidence.mjs                         | 16759 / 025a56b461704a924b32233914623faec7952683b81a985b01980b4d6fad9198 | 16760 / ccdc133652c12e1c6ae3cb063b715c0f146cfc499a3d365c5f41119f3cec4aa9 |
| actions/verify-evidence.mjs                                    | 20834 / d87fb1e6e597d5f2785a862c8e0556221e8e1b3b3deac3af38d5c5573c4fd4b8 | 20835 / 6a4afd0a7339753e0745931f5e6ecc7de93c6ff0c9961fec3273173f3d2d078b |
| multipage/verify-evidence.mjs                                  | 10172 / 9fa9191cd03593c596c40f4e26670ac1846c177c4f68292301f535bf9425d2ea | 10173 / c81dae73a2bdb8642741e8e81ccf46871aa86abdba9c6f5a74f4e309ccce5bf3 |

## 原生运行时来源和复现

E=`/private/tmp/hier-b-orch38-c97.yLofVz`，P=`E/fixed product 中文`，B=`/Users/jiangbowang/MOI/2025/dftartist/2026.9/dft_hierachy-test-m5-tree`。
20/22 从官方 HTTPS 下载发行 tarball 与 SHASUMS256，固定摘要校验后只在 E 解出 bin/node。24 使用本机真实二进制。
无全局安装、依赖升级、GPG 签名验证或 Node24 伪装版本分支；选取 20.12.2 不等于穷举最低 20.12.0 及全部受支持 patch/OS。这些旧版本仅做兼容测试，不是部署建议。

| 运行时  | tarball SHA256                                                   | 实际 bin/node bytes / SHA256                                                 |
| ------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 20.12.2 | 98eb624b52efec2530079e1d11296ec0ac20771b94b087d21649250339cf5332 | 94141712 / ccdd66080156689799b6418cacc46799eb9961f45087fa79f5c64033a0c1aa07  |
| 22.0.0  | ea96d349cfaa67aa87ceeaa3e5b52c9167f7ac302fd8d1ff162d0785e9dc0785 | 111871136 / 9507031f6769f2381eae353b3614bafa871c957dc6f2ae86a3af948acdf9b178 |
| 24.21.0 | 本机，非本轮下载                                                 | 122129232 / e4b5a3af0e05c75de2eae013904145f40fe7fc2a6e6f17510128bf45cca4e79b |

官方固定来源：[20.12.2 校验清单](https://nodejs.org/download/release/v20.12.2/SHASUMS256.txt)、[22.0.0 校验清单](https://nodejs.org/download/release/v22.0.0/SHASUMS256.txt)、[20.12.2 CLI](https://nodejs.org/download/release/v20.12.2/docs/api/cli.html#-p---print-script)。原清单全文已归档，runtime 二进制/tarball 不塞入 git；实际 URL、长度、SHA、原命令、版本/平台/arch/mainType 均留证。

令 N 为上述实际 node 绝对路径，I=`web/tests/independent-source-candidates-view`；实际执行形式（完整 argv/cwd/双流见主档）：

```sh
"$N" --test --test-reporter=tap "$B/$I/imports/combined-print.test.mjs"
env HIER_B_VERIFIER_ROOT="$P" "$N" --test --test-reporter=tap "$B/$I/imports/combined-print.test.mjs"
"$N" --test --test-reporter=tap "$B/$I/imports/cli-import.test.mjs"
"$N" --test --test-reporter=tap "$B/$I/pagination/release/cli.test.mjs"
"$N" --test --test-reporter=tap "$E/legacy-M8-snapshot/$I/multipage/evidence-cli.test.mjs"
```

## 历史回归和 pin 边界

三个版本各自旧 import **32/32**、旧 release CLI **16/16**、旧 multipage CLI **8/8**，均 exit0。
最后 8 项明确在独立 fixture：固定 P 中历史 12 输入、旧档、旧测试逐字节复制，仅使用本轮新 multipage 入口（它不在旧 12 pins 中）。没有修改旧测试/期望/档。
fixture 的 15 文件完整 pins 留在实际准备回执；12 文本输入/测试/新入口可携，旧大档使用固定 SHA 引用而非重复嵌入。

当前 B 执行 multipage 无参数 metadata exit0；`--inputs` **exit1，20835 !== 20834**，准确拒绝旧档的 actions pin。固定 P 的同一 `--inputs` exit0/12 pins；当前 release `--inputs` exit0/5 pins。
因此不宣称“当前全部文件匹配 B36 的 12 pins”或“当前根旧 M8 --inputs 绿”；没有为了绿而换历史 SHA。metadata 输出的旧 Node 未执行字段是历史事实，不能覆盖本轮新原生证据。

## 来源、可携证据与保护

`docs/m5_b_c97_native_print.json`：**1314460 bytes**，SHA256 **7b112985339a7301bcadbc5be0083855162c27e8434fa88c662ac9eea20dbf04**。
51 次命令捕获、132 材料、8 当前输入、4 旧档固定引用；每项完整 stdout/stderr 分离 gzipBase64/bytes/SHA，保留全部 9 条非零（探索 4、旧红 2、固定旧负回放 2、历史 pin 拒绝 1）。无输出截断、信号退出或子命令捕获错误。
归档含新/旧三入口、首冻输入、初始保护、精确授权、官方 checksum、运行时/封档脚本及四组来源的 45 命令/90 完整原流。逐块解压并验字节/SHA/原压缩块 SHA，不靠临时目录索引冒充可携证据。

现有 B 辅助器只读核 A37 对 B37 的四组 raw delta/逐提交 blob 与最终 15 文件，均一致；未比 patch body，不跑产品，非 C 审查。主 B 封档时再次逐块核 90 流。
DESIGN SHA 为 20233a66e6f3462bbc38c51a194e0dc3a07b91292947e47978e4d818f32d789a；§6.18.1 以后与前基线保持。A37 只有规范/测试输入吸收，不新增产品 runtime 输入。

新增 `imports/evidence.mjs` 是纯导出 API，无自动 CLI/argv。必须显式 import 后调用 `verifyEvidence(a,{root})` 与 `checkEvidenceControls(a)`；直接 `node evidence.mjs --inputs` 的空成功不算核档。
封后在三个原生版本各实际调用 API，均 1 正/7 负 metadata 控制通过、0 产品执行；控制分别拒绝冒关 C97、损坏材料、删旧红、篡改通过数、缺审计原流、冒充原生未执行、输入 SHA 篡改。后封回执另档，避免递归改主档。

3448 原普通路径严格 bytes/mtime 保持；仅 B 三个入口精确授权 old/new SHA/mtime，额外主树 49 声明/3 普通 Core 保持。独立 P detached 固定、git 干净；格式工具仅 P 中 npm ci --offline --ignore-scripts，不改锁/依赖。
共享日志初始前 2632246 字节/SHA04b5ce8c1156f44c1b473a4da2fc0be52d3aaaee42f5cebda8c6322bfb906cb7 保持；只追加不提交；协调/research/旧工程/ref/设计输入不写。首冻与其他旧档、84 计划 DOM/30 历史类型/公开观察 helper 保持。

## 限制与交接

本轮只执行 B 元数据 CLI 设施兼容单元。未跑完整 web/check.sh、Core 构建/三配置 CTest/ASan、属性全集、旧 DOM/类型/tarball、真实 Core-UI/Electron/IPC、性能压力、Linux/Windows/远端 CI；它们不是本修订的通过结论。
无生产/前序行为、TypeScript/Schema/C++ 结构、公开 API/ABI/IPC/protocol2/schema7、依赖/配置/工程格式变化；首版不含持久化，保存/恢复/迁移不适用，未增加相关产品能力。
本轮 DOM 执行 0，不声称合成指针是设备 E2E，不以 SDK 或 CLI 测试关闭 L06/L09–11、Q1 或完整组件差额。

- 交 A：按顺序原样吸收首冻、最小修订及本报告/证据。保留旧 pins；仅同步本单元事实，不称 C-97 已由 B 关闭。
- 交 C：依据固定 SHA 定向审 main 识别、原生 20/22 红绿、24 对照、真正 CLI 正反与历史 pin 拒绝；由 C 决定 C-97 关闭。
- 交协调器：本 B38 单元结束，不接管 A/C/D、不新会话/定时器；后续 Q1 等仍按既有前置领取，不在本轮扩散。
