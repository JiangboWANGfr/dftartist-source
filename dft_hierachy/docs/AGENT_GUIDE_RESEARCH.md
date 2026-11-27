# Agent 规则文件调研与本工程取舍

日期：2026-10-11。以下是读取公开主分支文件得到的观察；外部规则不适用于本仓库。只借鉴组织方式，不复制它们的业务约定或授权流程。

## 实际项目的做法

| 来源 | 观察 | 本工程采用 |
|---|---|---|
| [VS Code AGENTS.md](https://github.com/microsoft/vscode/blob/main/AGENTS.md) 和 [详细指南](https://github.com/microsoft/vscode/blob/main/.github/copilot-instructions.md) | 根文件很短，指向同一份项目指南；详细指南提供分层、具体命令和资源/错误处理规则 | 根入口负责导航与关键约束，架构继续链接 DESIGN，不复制第二套层次说明 |
| [Grafana AGENTS.md](https://github.com/grafana/grafana/blob/main/AGENTS.md) | 提供构建、单测、集成、E2E、lint/格式及生成命令；明确要求读目录专属规则 | 验证指南列真实命令、执行范围和结果；需要目录专属规则时再增设，不每个目录放空模板 |
| [Zed AGENTS.md](https://github.com/zed-industries/zed/blob/main/AGENTS.md) 与 [.rules](https://github.com/zed-industries/zed/blob/main/.rules) | AGENTS 入口指向已有规则；要求错误传递、异步资源生命周期；规则维护强调具体、局部和经过评审 | 重复踩到的实际问题才写长期规则，阶段进度放日志/计划；不照搬外部项目的人类审阅或 README 修改要求 |

[AGENTS.md 格式说明](https://agents.md/) 建议采用仓库根的 **AGENTS.md**，并可按目录分层；没有强制模板字段。因此本工程使用这个名称，不新增含义不明的 `agent.md`/`AGENT.md` 副本。

[Claude Code 官方说明](https://code.claude.com/docs/en/memory#share-one-file-with-other-coding-tools) 支持在 CLAUDE.md 中以 `@AGENTS.md` 导入共享规则。本工程只保留一个短导入文件，不复制完整内容，避免两种工具的规则分叉。

## 文件分工

| 文件 | 职责 | 本轮处理 |
|---|---|---|
| 根 AGENTS.md | 稳定操作约束、修改前总结、职责、兼容、质量和完成标准 | 新建；按用户本轮要求落实 |
| CLAUDE.md | 共享规则的工具入口 | 新建，仅导入 |
| docs/EXECPLANS.md + docs/plans/ | 复杂任务计划、实际证据、风险和执行进度 | 新建指南及 M3 计划 |
| docs/VALIDATION.md | 构建测试命令、阶段边界、不能冒充通过的情况 | 新建，指向实际 CMake/npm/check.sh |
| docs/DESIGN.md | 唯一架构及行为契约 | 复用，保持已冻结 SHA |
| docs/REVIEW_LOG.md | 用户决定、A/B/C 的追加交接与问题关闭 | 复用，不覆盖历史 |
| README.md | 人类阅读的启动入口 | 只增加入口链接与验证范围说明 |

## 还需要哪些约束

**文档不是强制执行器。** 现有 CMake 的单向链接、禁止越层测试、-Werror、ASan/UBSan，以及 web 的 dependency-cruiser 才是已经存在的可执行约束。AGENTS 要指向它们，不能代替它们。

| 约束 | 应放在哪里 | 当前处理 |
|---|---|---|
| 公共字段/枚举/错误的机器一致性 | 权威 Schema、生成或结构对照测试 | M4 的 B-12 已跟踪；不在本轮先造一份会漂移的 JSON Schema |
| 代码格式 | .clang-format / 前端 formatter 配置与检查脚本 | 当前未配置完整 formatter；先遵守相邻风格及 diff 检查，工具配置应独立提交，不全仓格式化 |
| 自动门禁 | CI 调用 check.sh 和阶段测试，分支保护要求通过 | 现有本地入口复用；仓库尚无远端 workflow/分支保护配置，不声称它们已启用 |
| 代码审查归属 | 实际维护者确定后的 CODEOWNERS / PR 模板 | 不虚构账号、强制审批人或空 CODEOWNERS；当前按用户指定 B/C 文件交接 |
| 兼容/迁移 | DESIGN 契约、具体 ExecPlan、真实旧版 fixture 与迁移测试 | 修改对应接口时必须提供；新工程首版没有会话文件，不能冒充存在兼容样例 |
| 依赖可复现 | 既有 CMake 固定版本、npm lock、工具链/环境记录 | 复用，不增加生产依赖 |

无需为同一事项再创建 ARCHITECTURE.md、另一套 ADR 决定表和重复的 CONTRIBUTING 规则；若以后出现独立维护需求，再从现有权威文件抽取并更新链接。
