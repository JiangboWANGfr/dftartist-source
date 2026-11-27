# C-77：观察盲区的 B 独立确认与覆盖纠正

C 提出方与关闭归 C。本轮只读了 REVIEW_LOG 中的判据，没有读取 C 的复现脚本或把其执行记作 B 亲测。
原 24 项、旧夹具/报告和历史缺出口红保持。

## 本轮 B 实际负对照

```sh
HIER_B_PRODUCT_ROOT=/absolute/B/product node --unhandled-rejections=throw --test --test-reporter=tap web/tests/independent-tree-view/ui/c77-observation-boundaries.test.mjs
```

4 项父测试各自派生独立 plain Node 进程，清除子进程 NODE_OPTIONS，确认没有
unhandledRejection/uncaughtException 监听。通过两个 setImmediate 跨完整循环检查点，不用定时 sleep。

| 子进程输入                            | 预期/本轮实际退出             | 判断                                       |
| ------------------------------------- | ----------------------------- | ------------------------------------------ |
| 原生 Promise 拒绝，没有消费者         | 1 / 1                         | 控制环境确实能发现完全无人处理的原生拒绝   |
| 原生 Promise 拒绝，有消费者           | 0 / 0，原错误身份保持         | 合法控制处理器有效；不是生产视图           |
| 真实 L6，没有视图或 B Promise 观察器  | 0 / 0，页failed、模型活/SDK开 | L6兜底足以让进程正常退出，不能推断视图处理 |
| 真实 L6，加原 B observe，但仍没有视图 | 0 / 0，页failed、B记录失败    | B观察器也不提供“视图已登记”的证据          |

原 B observe 从本人的冻结 fixture 抽出为测试控制，未修改它；
调用返回值===真实 loadRoots 的原 Promise，原错误身份及状态保持。
此处片段 trimEnd 后 SHA 为 a66614fb416fe747d16eeb82a7105876db3d793d249476394fdca87e24409d93，
不与不同片段边界的 hash 冒称相同。真实 SDK/公开 Transport 来自原 B harness，前后 hash 相同。
父测试4/4是**观察控制通过**，不是C76-13/生产视图4项通过。

## 覆盖纠正与仍未证明的性质

C76-13 的三个原输入仍能检查晚反馈抑制、旧模型结算及借用所有权。
它们和全局 unhandled==0 **不能证明**视图在动作栈中为原 Promise 登记拒绝处理、卸载后由视图继续消费。
新 run --list 对这三项追加 limitations（原 cases.mjs 字节不改），coverage.json 的 L09/L10/L11
明确保留这个缺口。新测试也不把普通零全局拒绝当作独立消费证明。

当前不引入“只拦 .then/.catch 就算完整”的假门禁：合法原生 async/await 可绕过 own then 的观测，
这种适配会误拒合法消费者。改变 Promise.constructor/species 或替换返回 Promise 又不是纯观察，
须先交 C 审；不在本轮偷偷做，不改 L6 内部 catch。

状态：B确认C-77成立；**视图登记/旧拒绝独立消费仍未验证**，交C复核本补充证据与覆盖标记；
B不自行关闭C-77，也不因已有140个输入就称95全部冻结完整/生产通过。
