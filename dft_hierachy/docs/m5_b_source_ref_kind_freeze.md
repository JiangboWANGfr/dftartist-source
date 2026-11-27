# B26 SourceHit.refKind 独立冻结与初始基线

固定产品 `146bfa6069f611855f946344090a7b953303dd43`，提案 `4488b5bc15f7e2174ef18e5c1841ce2e7b999740`。
冻结 `764445d4c91a0113fddaae5d7027eb8fd16946e3`（17 个新 B 文件，冻结先于正式产品基线运行）。
DESIGN §6.16：358496 字节 / SHA256 `2651710744667cac02fca0830c6733671db24cc2347a75b13c379ef93ad942a9`；C26 已接受该契约。

结论：本轮完成**独立测试冻结及未实现基线取证**，不是字段实现验收。固定产品仍无生产 refKind；新增预期保持，不 skip/xfail，不将缺模块/类型计为负例通过。
不读 A 的新契约 consumer、能力脚本、实现 diff、自测档或聊天建 oracle。输入来自规范、B 原始 HDL 和公开 API。

## 输入、预期与覆盖

`web/tests/independent-source-ref-kind/README.md`、`inventory.mjs`、各 cases 文件保存逐项 id/input/expected/basis。

- TS：40 个逐项去标记反例；proposal 只是规范设施，production 正例先判能力。
- Wire：208 个独立结构输入，涵盖 Hit100/Page29/Result31/Response31/enum17；191 个已有定义另与真实旧生成器按 legacyExpected 对照。
- SDK：23 项（8 正常/旧兼容、15 非法）；真实 SDK 和候选模型，controlled Transport，包含空页、partial、混合标签、并发乱序、第二项/第二页非法、pending/订阅/拥有与清理。
- SDK→Node→Core：24 项（共享/逐实例 × 普通/宏 × 定义/实例/端口/信号/process/register），原始 include/CRLF/UTF8 HDL，独立公共枚举身份，1/2/200 全页并集及完整旧字段有序投影。不能从 SourceKind、inst 或 ref 前缀猜种类。
- C++：7 个新默认/聚合/枚举/省略/非法序列化输入，其中旧形状2项另为基线兼容控制；同208结构回放及24个同版本完整 Core API 消费者案例预置三配置。相同输入跨层/配置不累加成新业务数。

Source 排序/游标/有界物化/取消的既有独立 B fixture 原样保留，尤其 `M3ObserverTest.cpp`、`M3SourceSortTest.cpp`、`M3SourceIncrementTest.cpp` 与原 source 大工程夹具；页内确定性取消与大 occurrence 的原生观察断言仍须在 A 实施后与新链一起复验。本轮未用小 HDL、partial controlled response、预取消或 sleep 代替那些断言。
真实 Core 本次只运行 ordinary complete 分页；partial 仅有结构与 SDK 保留测试，没有强造 Core 生产 partial 或声称已动态验证其新标签。
没有新规范歧义；未完成的 Selection 确认、生命周期和 UI 不在本字段单元。保存/恢复/工程迁移为首版范围外。

## 实际命令与结果

E=`/tmp/hier-b-orch26-ref-kind.OGFPtI`；P=`E/checkout with space 中文` 为 detached 固定产品；B=`dft_hierachy-test-m5-tree`，分支 `test/m5-tree`，起点 e75ee93。
N=`/Users/jiangbowang/.npm-global/bin/node` v24.21.0；PATH 以该 Node 目录与 /opt/homebrew/bin 开头。
以下测试命令默认 cwd=B、`HIER_B_PRODUCT_ROOT=P`、`HIER_B_BROWSER_TOOLS=P/web`；记录保存展开后的完整 argv、cwd、UTC、耗时和输出。

| 实际命令                                                                         | 状态与准确边界                                                                                                                                                                                  |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci --ignore-scripts --no-audit --no-fund`；`npm run check`（cwd=P/web）     | 0/0；fresh 锁依赖、四包 TS、195 定义/27 方法和分层检查。不是完整 CI。                                                                                                                           |
| `N web/tests/independent-source-ref-kind/inventory.mjs`                          | 0；208/23/24/40 输入及字面 fixture 自校验，非产品通过。                                                                                                                                         |
| `N .../verify-types.mjs proposal`                                                | 0，12.680秒；正例0诊断，40/40 相应行语义拒绝；未引入 Node/React/Electron ambient。仅测试内 proposal。                                                                                           |
| `N .../verify-types.mjs production`                                              | 1，0.672秒；公共新导出/字段缺失，stage=positive-public-capability，40项语义负例0执行/0通过。不能把2724/2578等算预期语义拒绝。                                                                   |
| `N .../verify-schema.mjs proposal`                                               | 0，0.212秒；内存规范 Schema 208/208，旧生成器兼容191/191。不是新生产验收。                                                                                                                      |
| `N .../verify-schema.mjs production`                                             | 1，0.189秒；真实权威 Schema 与 JS 生成器各191执行/130通过/61失败，缺新枚举17 blocked；旧191兼容全部通过。新 enum/$ref 两项能力红，原required/扩展/无默认三项绿。                                |
| `N .../run-sdk.mjs`                                                              | 1，0.143秒；23执行/8通过/15失败/0skip/0blocked，cleanupErrors=[]。15项均仍接受非法tag，不是超时/设施红。后续协议关闭等断言尚未到达；finally主动释放不算产品协议关闭已通过。                     |
| `HIER_BIN=P/core/b-ref-kind-baseline/hier N .../run-core.mjs`                    | 1，7.585秒；24执行/0通过/24失败/0skip/0blocked。24项均先完成三种limit的独立目标及完整旧投影，再因缺权威refKind失败；cleanupErrors=[]，不是 fixture/握手失败。                                   |
| `N .../verify-native.mjs --core-api`                                             | 1，16.916秒；Debug/Release/ASan-UBSan 各真实旧JSON兼容2/2；生成C++验证器各191执行=130通过/61失败+17 blocked。新头缺失，每配置7项新序列化与24项完整Core API均0执行/blocked；未调用完整Core构建。 |
| `python3.12 protocol/schema/scripts/generate_cpp.py --check`（cwd=P）            | 0；原195定义/27方法无生成差异，不代表新字段已生成。                                                                                                                                             |
| `N .../independent-source-position-interaction/gate/verify-evidence.mjs`         | 0；B25可携档来源核对，不重跑其旧业务总门禁。                                                                                                                                                    |
| `N E/audit.mjs`；`N E/protect.mjs --protect`；`git diff --check e75ee93 764445d` | 0/0/0；原B导入、302个未变生产Git对象、48声明、17冻结源、旧文件字节/mtime及日志前缀保护。                                                                                                        |

`...` 表示 `web/tests/independent-source-ref-kind`；完整展开命令和未经截断输出在机器档内。
格式检查/JS语法/旧消费者编译和隔离新头形状 `-fsyntax-only` 也分别封存；隔离新头只用于检查测试设施编译形状，未作为生产头/实现或产品验收执行。

Core基线为 B 自有目录下的字节一致副本：9324776 字节 / SHA256 `5b967e60ce21d99c4dd455efe1effbc08f230fba6fbe9535baee04281c666057`。
来源是初始已 pin 的主树旧二进制，生产 Git 树与已验收5c81d81相同；**复用，不是 fresh native 构建，不是三配置完整 Core 验收**。
P 中唯一自有未跟踪材料为 `core/b-ref-kind-baseline/hier`，显式 hash 校验，不伪称 P 完全 clean；tracked产品保持不变。

## 原失败与设施适配

1. B 助手冻结前 proposal 正例调试首次退出1：Prettier 将 RK29 错误所在行移至嵌套属性，触发2578/2375；只将同一输入保持单行注释适配，第二次正例退出0。两次均语义执行0，不计产品失败/40项通过。
   封存原 CommandExecution 事件、完整 merged 输出、修前只读源码捕获及确定重建文本、修后原回执。事件时间不是进程开始时间；重建文本不是原文件快照/mtime。不为恢复重跑。
2. `pre-freeze-protection` 原退出1：新自有基线二进制路径不受Git忽略，原设施错误要求P无任何untracked。只改E保护脚本为精确唯一允许路径并逐字节核SHA；保留原脚本/失败，重跑0。不改产品/测试预期/快照。
3. 首版可携/现场核档各退出1：原 CommandExecution 的 cwd 是 `file://` URL，核档器误与普通路径直接比较。只增加 `fileURLToPath` 规范化；保留首版997793字节/SHA b44974acd8613973515207ff845bba505a37db02e1fc4c41e40965b367dd0cd4、原核档器及两次失败。修正后首版可携核档0；最终归档另收这些原始回执，不重跑产品或修改冻结。

另有只读路径探索、一次摘要脚本误匹配空syntax输出及一次apply*patch结构诊断，不归作产品测试或新缺陷。所有正式 runner 首次结果原样保留；本轮未针对业务红改预期重跑取绿。
外层捕获以 stderr=STDOUT 合并，字段历史名 stdout*\* 实为combined输出；utc为捕获结束、不是虚构开始时间。native内层分别捕获双流。

## 可携证据、保护与交接

机器档 `docs/m5_b_source_ref_kind_freeze.json` 含完整捕获、初始快照、规范/公开头/旧B依赖、全部冻结源、设施脚本及助手原调试证据；逐块压缩/长度/SHA。
`verify-evidence.mjs` 默认仅可携核档；`--inputs` 另核本地B输入，不执行产品业务。最终核档/提交与日志后保护回执在E，不递归修改已封档证据。
原主1104/B739/P1086文件、48声明/Core二进制及日志原2212981字节前缀保持；主树日志只追加，不暂存/提交。旧B25两笔导入的完整binary补丁和6个文件与原B逐字一致。

交A：在原授权内实施已获C审且B冻结的§6.16链，原样导入冻结与报告，保持本轮初始红证据。非法输入不得降为缺省；每个实际Core命中标记，不按ref/kind/inst推断。
交C：可审本独立冻结/分账/设施与之后固定实现，不以本轮设施绿替代字段实现。既有C编号不重开，无新增审批。
下一轮B需固定实现SHA，复验本目录及原成本/取消/大occurrence回归，实际完成同版本三配置Core构建后才登记对应通过。
未执行真实Electron UI→Core、完整check.sh/CTest、旧无变SourceView全门禁、候选确认/UI、其他平台/M7/远端CI；M5整体未完成。本轮结束，不新会话/计时器/其它会话消息。
