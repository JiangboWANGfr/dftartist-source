# 源码候选确认：隔离契约材料

当前运行时与标准命令见[实施计划](../../../docs/plans/M5-source-confirmation-runtime.md)；本目录保留A29提案与A30/C-94修订历史。
旧消费者C17和能力见证明确断言生产缺方法，因此新增方法后不能在当前树把这些命令当运行时门禁；请按对应固定历史提交使用。
规范唯一来源：[DESIGN §6.17](../../../docs/DESIGN.md)。
执行记录：[A29 计划](../../../docs/plans/M5-source-confirmation-contract.md)。
本目录不在生产构建或公开 exports 中，不实现确认、动作签发或过期校验；C 审查和 B 独立冻结仍为生产实施前置。

## 实际可执行检查

在仓库根执行，使用已构建的当前 web 包和普通 Core：

```sh
node web/contracts/source-confirmation/verify-types.mjs
HIER_BIN="$PWD/core/build/hier" node --test web/contracts/source-confirmation/capabilities.test.mjs
npm --prefix web run check
```

`proposal.d.ts` 在隔离声明中扩展现有导航类，仅增加两个同步方法及动作/错误类型。
`consumer.ts` 保留原构造器、状态、异步命令的类型兼容，22 个负例逐一移除预期错误标记并确认语义诊断。
检查器绑定真实 protocol/Selection 生成声明，拒绝缺模块或未消费标记冒充语义拒绝，且不引入 Node/React/Electron 类型。
展开动作在 TypeScript 中可保留品牌，特意作为正例；运行时必须拒绝复制动作，名义品牌不证明签发身份。

三个能力见证直接使用现有生产接口：

1. shared Core：公开 metadata 确定五个命中的地址空间、逐页原 Reply、顺序重载不缓存、跨模型并发合并、文档身份更新、Selection 历史/快照边界、借用 client 释放。
2. per-instance Core：相同能力；真实子进程退出和输入文件字节不变均有断言。
3. Selection：同身份 no-op 保留旧 origin、通知 AggregateError 发生在提交之后、历史与 disposed 错误。

它们明确断言生产新方法/错误尚未导出；不把直接调用 Selection.select 当 confirmCandidate 已实现。
当前 source.resolve 的不缓存行为以 DESIGN §5.6.6 及生产方法表为准。
提案中的“同 Reply 在新页链再发布”是未来独立测试适配器的生命周期输入，不是当前 SDK 连续重载能力。

## 首失败与范围

A 首轮见证错误假设 source.resolve 缓存，两个 Core 用例在严格身份断言处失败，Selection 用例通过。
按已有 §5.6.6 和实际结果修正 A 见证及提案依据，保留首源码与完整输出；没有修改产品或 B 预期。
固定档 `docs/m5_source_confirmation_contract_a_verification.json` 保存命令、双流、输入、原失败和保护证据。
`node web/contracts/source-confirmation/verify-evidence.mjs` 只核可携档；加 `--inputs` 另核当前材料是否仍为固定字节，均不执行产品测试。
实现新方法后，本目录的“方法缺失”断言应作为历史提案材料保留；正式运行时回归由 B 冻结并另接标准入口。

本轮不覆盖新确认运行时、候选列表/键盘、真实 Electron UI→Core、全 Core 构建/单测、M7 或远端 CI。
无工程持久化，旧工程加载/迁移不适用；API 增量仅为提案，生产 Schema/IPC/ABI 均不变。

## A30 修订

C-94指出ambient声明的私有品牌被隐式导出。已增加显式export边界和C23禁止品牌导入负例，保留原22项；修前品牌可导入，修后2724+2741，23项在生产实施前通过。C-94关闭归C。后续新增生产方法后，原C17及旧能力见证保持历史用途，正式门禁使用B生产声明消费者。
