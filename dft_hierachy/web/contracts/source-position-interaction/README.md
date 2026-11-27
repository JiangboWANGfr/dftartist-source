# SourceView 位置查询交互提案

唯一规范：[DESIGN §6.15](../../../docs/DESIGN.md#615-m5-sourceview-位置查询交互2026-10-17提案待c审b冻)。
执行与状态：[计划](../../../docs/plans/M5-source-position-interaction.md)。本目录由A维护，不是B冻结集合。

`proposal.d.ts`复用生产SourceViewProps/SourceDocument，仅声明拟新增的可选positionQuery；
生产包尚未导出该字段。`consumer.ts`包含真实L6适配和旧props兼容示例，不作为运行时组件执行。
`verify-types.mjs`使用实际React/生产声明，逐一去掉20个负例指令，要求原行产生语义错误；没有Node/Electron ambient。

仓库根目录执行：

```sh
npm --prefix web run check
node web/contracts/source-position-interaction/verify-types.mjs
HIER_BIN="$PWD/core/build/hier" node --test web/contracts/source-position-interaction/model-capabilities.test.mjs
HIER_A_EVIDENCE="/绝对路径/已存在的证据目录" node web/contracts/source-position-interaction/native-capabilities.mjs
```

## 能力见证的边界

- `model-capabilities.test.mjs`直接使用现有SourceNavigationModel、真实SDK/本机Core；临时复制既有fixture后验证
  LF/CRLF、候选pending与结果、非法UTF-16边界、旧document和changed拒绝。只改临时输入并关闭进程，不实现或调用新的UI交互。
- `native-fixture.jsx`只挂载现有生产SourceView，未设置positionQuery或事件处理器；原文含BOM/中文/非BMP/tab/CRLF/孤立CR。
- `native-capabilities.mjs`用现有Playwright/Chromium和React，见证0.5/1/1.5缩放下原生caret API、mark文本边界、
  DOM前缀原文单元与反向Selection.focus。Selection由见证脚本设置；没有执行真实双击/快捷键，不是新交互端到端测试。
  bundle/HTML/截图只写显式证据目录，服务仅本机临时端口，退出关闭浏览器/服务。只计3个原生能力场景，不计B产品DOM项。

20类型、2组模型/Core、3组原生DOM能力均不能替代C契约审查、B新冻结或未来生产交互验收。
旧B117DOM/28类型/6包保持，原B22绿与B21红各自固定；本轮不改其输入和标准测试入口。
真实用户事件、命令原Promise观察/过期反馈/错误边界、包外交互消费者须由实施轮次在新冻结下实际验证。
