# dft_hierachy

Hierarchy 的重写：设计数据库内核（C++）加层级树和局部网表图组件（TypeScript）。

协作入口：[AGENTS.md](AGENTS.md)。复杂变更先写 [ExecPlan](docs/EXECPLANS.md)，验证命令和适用阶段见 [VALIDATION.md](docs/VALIDATION.md)。当前事实与 A/B/C 交接以 REVIEW_LOG 最新条目为准。

| 目录 | 内容 |
|---|---|
| `docs/DESIGN.md` | 设计文档 |
| `docs/M0_RESULTS.md` | M0 的验证结论和测量数据 |
| `docs/REVIEW_LOG.md` | 评审往来 |
| `core/` | C++ 内核。五层，每层一个构建目标；只有 `frontend` 能看到 Slang |
| `web/` | TypeScript。四个包，分层由检查器强制 |
| `ref/` | 参考仓库，只读 |

## 构建与测试

```sh
# C++：首次会下载并构建 Slang v12.0 和 Catch2，约 1 分钟
cmake -S core -B core/build
cmake --build core/build -j
ctest --test-dir core/build

# TypeScript
cd web && npm install && npm run check
```

需要：
- CMake 3.28 以上，支持 C++20 的编译器。
- Node `^20.12`、`^22` 或 `>=24`（分层检查器不支持 21 和 23）。`web/.nvmrc` 指定 24；版本不符时 `npm install` 会直接报错。

Slang v12.0 带有本项目维护的诊断前编译阶段扩展，用于保留共享打开规模及库输入诊断。
CMake 校验原文件哈希并在构建目录生成覆盖文件，不修改下载或复用的上游源码。
更换 `HIER_SLANG_TAG` 或复用不同的 Compilation 源码时会明确配置失败，须先移植和验证
该扩展；详见 [共享与依赖验证](core/frontend/SHARING_VERIFIED.md)。

## 提交前的检查

```sh
./check.sh                                   # 产品变更收尾的标准门禁；纯文档检查见 VALIDATION
./check.sh --designs <processor_core.vc> <openc910/design>   # 加上真实设计回归
./check.sh --linux                           # 加上 Linux 容器里的构建和测试，需要 Docker
```

`check.sh` 做的事：
- 三种构建：带优化、Debug、带 AddressSanitizer 和 UndefinedBehaviorSanitizer。本工程自己的代码开高等级警告并视为错误。
- 每种构建里跑全部 C++ 测试。
- TypeScript 的类型检查、分层规则，以及"分层规则确实能拦住违规"的测试。
- M4 客户端测试、B 冻结的 M4 测试文件子集，以及真实 SDK → Node → Core 集成。
  `npm --prefix web run test:independent` 另保留完整集合中的 M5 待实现测试；阶段状态见执行计划。

任何一步失败，脚本以非零状态退出。以后接 CI 平台，只需要调用这个脚本。

`ci/linux.sh` 在 Ubuntu 24.04 容器（GCC 13）里做同样的三种构建和测试；源码只读挂载，构建产物在 Docker 卷里，不写工作区。在 ARM 的 Mac 上默认跑的是 ARM 版 Linux；`PLATFORM=linux/amd64 ci/linux.sh` 可以模拟 x86_64，但很慢。

## 命令行

`hier <命令> [<实例>] <设计>`，单次查询命令输出一行 JSON；`serve` 保持一个 NDJSON 会话。
`hier --help` 列出全部命令和选项。

```sh
H=core/build/hier
$H info      -f design.f --top top      # 打开了什么：前端、顶层、数量
$H roots     -f design.f --top top
$H children  i:0 --limit 50 -f design.f --top top
$H ports     i:0.3 -f design.f --top top
$H params    i:0.3 -f design.f --top top
$H ancestors i:0.3.1 -f design.f --top top
$H defs      -f design.f --top top
$H search "state" --kind signal --limit 50 -f design.f --top top
$H resolve-path 'top.g[2].u' -f design.f --top top
$H def-instances d:0 --limit 1000 -f design.f --top top
$H diags     -f design.f --top top
$H serve     -f design.f --top top      # hello 后在 stdin/stdout 上收发协议帧

# 检查"共享模块体"与"每个实例单独提取"的结果是否一致，有差异时退出码为 1
$H verify-sharing -f design.f --top top
```

实例引用（如 `i:0.3`）由其他命令输出，原样传回即可，不要自己拼。

M3 查找命令及逐事实 `step` 已实现；完整里程碑进度见 [执行计划](docs/plans/M3.md)。
`search` 使用区分大小写的字面子串，`--kind` 可重复；`--scope` 限定实例子树。
路径接受点或斜线分隔，转义标识符必须以空白终止。返回所有候选，端口与同名信号各有引用。

M3 游标绑定同一个 `Design` 快照，不能跨重新打开的工程使用。CLI 每次调用都会新建快照，
`--limit` 控制该次输出上限；连续翻页通过 C++ API 或 M4 `serve` 保持同一个 `Design` 实例。
`step` 返回绝对位坐标、稳定事实身份及每条 continuation 的角色/精度/映射。
端口必须指定 `--side inside|outside`；分页除 `--max-hops` 外还受两个逻辑模块体的上限约束，
冷热缓存边界相同，有 `next` 时须继续取页。M2 endpoint 的 `via` 保留原路由结构。
当前模型版本为 7，传输协议版本为 2；公开模型布局与取消重载要求静态库消费者重新编译。
M4 服务端实现及独立验收边界见 [M4 计划](docs/plans/M4.md)，
协议/生成命令和 schema6→7 兼容说明见 [Schema 文档](protocol/schema/README.md)，
客户端使用见 [SDK 文档](web/packages/client/README.md)。

## 重跑 M0 的测量

```sh
core/experiments/run_m0.sh <processor_core.vc> <openc910/design> [旧 dft-core 源码目录]
```

路径可以是相对路径。任何一项实验失败、任一设计有编译错误、或共享比较出现不一致，脚本都以非零状态退出。

## 独立 Wrapper CLI 安装

开启 `HIER_BUILD_ANALYSIS=ON` 后可构建 `dft-wrapper`，再用 CMake 的 `WrapperCLI` 组件安装到独立 prefix。
安装树可整体搬移，含诊断与约束复验示例、报告 Schema 和完整性清单；原生工具不要求 Node/Python。
具体命令见[Wrapper CLI 包说明](analysis/wrapper/packaging/README.md)。该交付属于 Studio Scan 分析后端的独立 CLI，不代表 Studio 宿主已接入。

如需全部已有分析命令，构建 `dft-seqcheck dft-objects dft-memory dft-wrapper` 后安装 `AnalysisCLI` 组件。
[Analysis CLI 套件说明](analysis/packaging/README.md)提供四工具示例与显式 `--component AnalysisCLI` 归档命令；原 WrapperCLI 用法保持。
