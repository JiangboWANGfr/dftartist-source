# B-ORCH-10 源码候选分页独立冻结及旧基线

本轮完成独立测试冻结，不是尚未实现的 SourceCandidatesModel 运行时验收。
C-ORCH-10 已认可同一 §6.11；A 可按既定前置实施，无额外批准要求。

## 固定对象与交付

- 旧生产/契约：`61db0b26d90f6017d040a63eb06361c9bb3c4b14`。
- DESIGN SHA256：`0fd34f932a8b3d6f6bbc367f64c8eaf0afb0697c3ec971f2d3ade05a53a6fa52`。
- B 首冻：`88e2e2a565600f55617c70864cb824df72976d4b`，在模型、类型和设施执行前提交。
- B 分层修订/最终冻结：`e5118800c8f3f07fcc0238539ab0e39bc1fd7554`。
- 测试分支 `test/m5-tree`，工作树 `dft_hierachy-test-m5-tree`；只新增测试/计划/报告，不改产品或旧 B oracle。
- [计划](plans/B-source-candidates-independent.md)、[执行说明](../web/tests/independent-source-candidates/README.md)、
  [机器档](m5_b_source_candidates_freeze.json)、[归档核验](../web/tests/independent-source-candidates/verify-freeze.mjs)。
- E=`/tmp/hier-b-orch10-candidates.Uipz7ifQ`，P=`E/source`：独立 detached、无产品 overlay，未用 A/C 构建输出。
- 只从规范、隔离公开声明、原 B fixture/公共 API 冻结；未查看 A 实现/consumer/verify-types/witness 内容定 oracle。
  已读取交付摘要及含验证信息的计划，故不声称严格盲测；这些摘要不生成预期。

## 验收条件及覆盖检查

旧产品已有 SDK、树、属性和 SourceDocument 冻结，不能替代本模型 pages/partial/cursor/输入投影。
原 SourceDocument 306/14/34、本轮新 281/13/47 各自分账，不加到旧 1628 总数。

| 新集合                                                 | 输入、正确行为和依据                                                                                                                  |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| ownership 12 / pages 5                                 | ready/构造/借用释放、原 Reply 和所有 occurrence/顺序/身份；SDK 字节 query、页参数及 AbortSignal；§6.11.1–3                            |
| partial 8 / paging-errors 7                            | 首/后续、空/非空/next；partial 仍 success 不穷尽、不取 next；超页和当前/历史游标循环、重载历史清零；§6.11.2                           |
| errors 10 / tasks 12                                   | 原 HierError、前缀保留、stale_cursor 不暗重发、load 与 loadMore 恢复区别、加入/换目标/取消/晚页；§6.11.3                              |
| input 53 / input-boundaries 29 / options 24            | 原语/Schema、字段有无/顺序/一次探测 Get、后投影异常优先、重入/dispose、旧合法任务保留；§6.11.1                                        |
| notifications 31 / diagnostics 84 / promise-resource 6 | 注册/通知/聚合/cause、动作通知 dispose 接管、循环/共享/函数/空洞/Proxy 捕获、原 Promise 内部消费；§6.11.3→§6.9.4/6.10.4/6.6.6         |
| real-model/Core 13                                     | B 原 include/BOM/Unicode/CRLF 和独立宏、1/2/200 页大小、精确五候选、整行/空白/半开末点、磁盘变化、游标/跨快照及借用 SDK；§5.5.6/§6.11 |
| types 47                                               | 正向消费者先成功，再逐个实际语义负诊断；原 Reply/只读联合/错误必需与禁止/显式 undefined/非 Selection API；公开声明                    |

完整输入/预期/basis/id 均由 `run.mjs --list`（以及 `--core --list`）、`verify-types.mjs --list`列出。
真实链的 ref 句柄从公开 roots/children/ports/drivers 获取，端口显式 side=inside；
预期五候选及范围来自 B 原 HDL 字节和规范，不从 resolveSource 实际输出生成。
原 leaf107字节 SHA256 `2b19339021a552f70120b78cd116a76837dac9289f137c0de9c37d4d1b1dea5d`保持。
不要求未规定的 pages 包装跨发布身份、构造 snapshot getter 一次或 idle 页数组空元组；
恶意回复 getter 精细顺序和旧 observer 聚合后的 stale_cursor 再聚合不另造 oracle，见执行说明。

## 本人实际命令与结果

下表脚本从 B 工作树运行，环境 `HIER_B_PRODUCT_ROOT=P`；Core 项再设置
`HIER_BIN=P/core/build-b-candidates/hier`。Node24.21.0 / TS5.9.3 / Prettier3.6.2，macOS arm64。
完整 argv、cwd、完成 UTC、退出码、时长与合并 stdout/stderr 原文保存在机器档。

| 实际命令                                                                                                                                                           | 结果及严格范围                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| P: `npm --prefix web ci --ignore-scripts --no-audit --no-fund`；`npm --prefix web run check`                                                                       | 均0；独立71包，195定义/27方法、四包 TS、41模块123依赖、7分层负控制                                      |
| P: `cmake -S core -B core/build-b-candidates -G "Unix Makefiles" -DCMAKE_BUILD_TYPE=RelWithDebInfo ...`；`cmake --build core/build-b-candidates --target hier -j4` | 均0；fresh hier77.82秒，M3/FUTURE ON，OBSERVER/SANITIZE OFF；只读复用六份固定第三方源码，非复用产品对象 |
| `node web/tests/independent-source-candidates/run.mjs`                                                                                                             | 初始及修订后均1；planned281、executed0、pass0/fail0/skip0，缺公开 SourceCandidatesModel                 |
| 同上 `--core`                                                                                                                                                      | 初始及修订后均1；planned13、executed0、pass0/fail0/skip0；在模型能力门前停止，非13项 Core 失败          |
| `node .../verify-types.mjs`                                                                                                                                        | 初始及修订后均1；正向生产消费者缺8个公开导出，47负例实际0、skip0；派生 any/never 诊断不算47项失败       |
| `node .../verify-types.mjs --proposal`                                                                                                                             | 0；独立正例0诊断、47/47逐项拒绝；只验已审隔离声明，不是生产 exports 或模型运行                          |
| `node --test .../facility.test.mjs`                                                                                                                                | 首次1：5pass/1fail；独立修订后0：6/6，0skip/cancel/todo                                                 |
| `node .../sdk-controls.mjs`                                                                                                                                        | 两次均0：12/12，0skip；真实 SDK→Node→B新编 Core，全部拥有进程等待正常退出；不算新模型13项               |
| 原 `independent-source-document/run.mjs` / `--core` / `verify-types.mjs`                                                                                           | 均0：原306模型、14真实模型/Core、34逐项类型负例通过，均未修改旧输入/预期                                |
| 新14份 mjs `node --check`；Prettier检查；`git diff --check`                                                                                                        | 均0；格式/语法不是语义验收                                                                              |
| `node .../verify-freeze.mjs --inputs --product`                                                                                                                    | 0；核34捕获/20原材料/46产品pin/54压缩块、855产品文件、20 B 原材料及红/绿计数；不新增产品用例            |

B Core9326184字节，SHA256
`1e5b6f05e8716fc7cdf45124eb17a9fe1dbf26bb6a2046374799bb7ed4186590`。
独立瞬时进程表检查该规范化二进制路径活进程0；不把瞬时表代替各实际控制中的退出断言。
未执行新模型 OS Promise 子测试：它们属于281计划，旧产品能力缺失时不进入执行。
watchdog 只是 B 测试卡死保护，非产品取消/超时 SLA；未用 sleep 调度代替确定性观察。

## 初始失败及独立修订

首设施失败是 B 将 SDK 首页省略 cursor 的要求错误用于 wire 参数。
规范 §5.6.3/§5.6.6 及权威 Schema 的 RequestCursor(default="") 早已要求 SDK 补齐默认；
修订只分开 SDK 与 wire：调用 SDK 仍严格省略 cursor，wire 则严格为 ""，后续仍用原 next。
没有根据 A 实现放宽查询、Reply、页数、partial、错误/生命周期预期。
原失败与首冻完整保留；修订单独 e511880，未修改或掩盖首冻提交。
旧生产缺模型/类型是符合当前阶段的能力红，不是新实现缺陷，不关闭他人的意见。

## 证据、保护和交接

机器档517154字节，SHA256
`77f8aeff28ef0d0fe08f50d61ec151612584bb5461750addae2302f3363b19fe`；
34完整捕获、20可携 B 原材料、46产品pin；54块原文778527字节/压缩193199字节逐块核验。
归档生成后的格式/核档/报告/提交/日志回执另存 E，有限归档不递归引用自己。

共享873非日志文件（855跟踪+18原未跟踪）、B原589文件、固定产品855文件保持；
P无产品 overlay，37新编生成声明与共享公开声明字节一致；主树暂存空。
原日志1714987字节前缀 SHA256
`1481cec979e9cfb4efa313a7bbd7cf8f10eb2950747fc0df333ca4da54de21e7`保持。
REVIEW_LOG只追加不提交，不碰协调/research历史脏项。

交 A：导入首冻88e2e2a及分层修订e511880，按已审契约实施生产模型并接标准门禁；
本报告/核档脚本是辅助交付，不需为导入报告另建收尾单元或重复旧全量门禁。
交 C：实现后审原页链/错误优先级/生命周期、借用和宿主边界；B将固定新实现 SHA 后复验。
目前没有新生产变更可供运行时验收，不宣告 M5 完成。
未执行完整1628、M4全量、CTest/Debug/ASan三配置/check.sh、Linux、真实Electron/UI/E2E、远端CI；
UI/SourceView/changed禁点/UTF16适配/自动ready协调/Selection及 main/preload/L06/L09–11 不由SDK控制推导完成。
首版无会话持久化，保存/加载/恢复/旧工程迁移不适用；D-03仍限M6。
不创建会话/计时器、不恢复监控、不排队其它会话消息；本轮交接后结束。
