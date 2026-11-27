# SearchModel：B 独立有限冻结

依据固定 `6bddc5b7d5704e1cb9c434fc48e3033d3e2d4cc0` 的 DESIGN §6.22、§5.5.5、明确继承的输入/分页/通知/诊断契约及 Schema7/protocol2。仅使用公开 SDK/类型和原 B fixture；未使用 A consumer、search.sv、能力见证或实现生成 oracle。必读交接/计划包含摘要，不声称完全盲读。

## 有限清单与验收条件

| 集合                 | 数量 | 输入与预期依据                                                                                                                                                                                                         |
| -------------------- | ---: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 受控真实 SDK/模型    |  100 | `cases.mjs` 每项固定 id、group、input、expected、basis；§6.22.1 自有字段/数组投影、pageSize/快照/字面 text/kinds/scope，§6.22.2 原 Reply/六类命中/重复行/partial/空页/游标，§6.22.3 加入/取消/迟到/借用/通知/诊断/释放 |
| 严格类型负例         |   26 | `types.ts` SEARCH-T01–26；正确消费者先零诊断，再仅内存去标记，每项对应语句必须有真实诊断且不得以范围外诊断替代                                                                                                         |
| 真实 SDK/Core 模型链 |    4 | `core.mjs` 每项固定 input/expected/basis；原 B LF 双 occurrence HDL，实例分页、scope/同名 port+signal/definition 地址与显式路径、空 kinds/语义错误、共享消费者取消/释放                                                |
| 独立基础控制         |  4+1 | `fixture-controls.test.mjs` 的 Schema/SDK/partial/重复关闭控制及 `core-controls.test.mjs` 的原 SDK/Core 实例分页；不是 SearchModel 验收                                                                                |

正常路径、合法最大 pageSize、空 text/kinds/页、非法值/自有 undefined/洞/继承项、描述符及 getter 抛出原值、投影和通知重入/释放、Core 原错误、异步加入/取消/替换与迟到回复均在固定清单内。命中匹配/顺序归 Core，模型只保留原结果，不解析 ref 前缀，不构造第二个 DTO/搜索索引。definition 地址不隐式选 occurrence，process/register 展示路径不承诺可 resolve。

`run.mjs --list` 和 `run.mjs --core --list` 可输出逐项输入、预期和判断依据，不启动产品。真实执行的 watchdog 仅防测试悬挂，不是产品超时 SLA；中途 Core 预算/内存/成本另账，不用预取消或公开关闭断言代替。通知返回 Promise 不 await，并不等于任意 then-free/堆安全证明。

## 执行

Node24+，先在自有固定产品目录按原锁安装并完成 Web check。沿用原 SDK/Transport 和 Core scope，不改其旧 oracle；受控 Transport 不是 Core/Electron。旧 scope 负责原 Promise、模型、SDK、监听与子进程清理，新包装只记录真实公开方法，保持 receiver、原 Promise/Reply/Error。没有替代 SearchModel、写模型 state 或替换结果 DTO。

```sh
export HIER_B_PRODUCT_ROOT=/absolute/fixed-product
export HIER_B_BROWSER_TOOLS="$HIER_B_PRODUCT_ROOT/web"
export HIER_BIN=/absolute/B-owned-same-source-Core/hier
export HIER_B_NPM_BIN=/opt/homebrew/bin/npm
export PATH="/Users/jiangbowang/.npm-global/bin:$PATH"
node web/tests/independent-search/verify-types.mjs proposal
node web/tests/independent-search/verify-types.mjs production
node --test --test-timeout=30000 web/tests/independent-search/fixture-controls.test.mjs
node --test --test-timeout=60000 web/tests/independent-search/core-controls.test.mjs
node web/tests/independent-search/run.mjs
node web/tests/independent-search/run.mjs --core
```

`proposal.d.ts` 必须逐字等于上述固定公开声明；proposal 编译不是生产导出验收。严格模式含 exactOptionalPropertyTypes/noUncheckedIndexedAccess/skipLibCheck=false/types=[]，禁止 Node/React/Electron 类型依赖。

基线缺 SearchModel/SearchError 时，模型入口只报能力红：100/4 planned、0 executed、相应 blocked、0 skip，不能记为 104 条语义失败或通过。生产正向类型不通过时 26 负例 executed=0；proposal 26 真实拒绝另账。已验收连接视图/旧面板不因新契约再开全量前置。

## 边界与交接

本单元无 UI，不验收 React/Electron IPC、宿主 index.ready 自动协调、Selection/定位交互、完整 processor_core/M5/M7、读屏/跨平台或远端 CI。首版无持久化，工程创建/保存/恢复/迁移不适用。SDK/Core 控制成功不表示新模型 partial/通知/任务状态机已运行。既有字段/Schema/ABI/依赖/工程格式不改。

先独立冻结 commit，再跑固定基线，实际命令/双流/退出码/限制写 B 计划及共享 REVIEW_LOG（仅追加、不提交日志）。C60 已接受契约，B 有限冻结后 A 直接生产实现；不新增观察设施或测试类别作为前置。
