# B58：ObjectConnectionsView 有限独立冻结

依据固定 `4aa11f45af83e9cf0c2b53d932da85b44eb5050a` 的 DESIGN §6.21 及明确沿用的 §6.19，Schema7/protocol2 和真实公开模型。
仅新增此 UI 的有限集合：82 个浏览器输入（81 个 controlled Transport + 真实模型，1 个原 HDL/Core 纵向），24 个严格类型负例、3 个包外输入。
`cases.mjs` 逐项记录输入、预期、依据。4 个 Node fixture 控制、1 个浏览器模型控制和1个真实 Core 模型控制另账，不计 UI 通过。
不读取 A consumer/实现/diff/自测生成 oracle；已读必需共享交接摘要，不声称完全盲读。

## 运行

P 为独立固定产品检出，先按锁安装并 `npm --prefix web run check`；T 为已存在的隔离浏览器工具目录（React/DOM18.3.1、esbuild0.25.11、Playwright1.64.1）。
Core 纵向与其控制须显式 HIER_BIN，先核对 B 自有构建的源码树与二进制 SHA，不能使用移动主树产物：

```sh
HIER_B_PRODUCT_ROOT=P node web/tests/independent-connections-view/types.mjs proposal
HIER_B_PRODUCT_ROOT=P node web/tests/independent-connections-view/types.mjs production
HIER_B_PRODUCT_ROOT=P node --test web/tests/independent-connections-view/facility.test.mjs
HIER_B_PRODUCT_ROOT=P HIER_B_BROWSER_TOOLS=T node web/tests/independent-connections-view/run.mjs --controls
HIER_B_PRODUCT_ROOT=P HIER_B_BROWSER_TOOLS=T HIER_BIN=B固定自有Core node web/tests/independent-connections-view/run.mjs --core-control
HIER_B_PRODUCT_ROOT=P HIER_B_BROWSER_TOOLS=T HIER_BIN=B固定自有Core node web/tests/independent-connections-view/run.mjs
HIER_B_PRODUCT_ROOT=P HIER_B_BROWSER_TOOLS=P/web HIER_B_NPM_BIN=/opt/homebrew/bin/npm node web/tests/independent-connections-view/package.mjs
node web/tests/independent-connections-view/run.mjs --list
```

proposal 只映射公开隔离声明，production 只读真实生产声明；去掉全部 expect-error 后逐行核真实诊断，不能把缺导出的一组编译失败计为24条负例执行。
UI 能力缺失报告82计划、0执行、82阻塞、0skip，不制造替代组件。沿原 B scope/runner/CoreWire/bridge/HDL/外部 tarball 工具；
包输入的原4个探针是前提，不计入新3项。包外类型与 native import 均取实际安装包，不用 workspace alias 替代。

## 独立事实与有限边界

普通 fixture 只提供 Schema 合法 wire，经真实 SDK/模型发布；不赋模型 state/DTO，不实现 View。
方法观察保持 receiver、参数、原返回/抛值；scope 只为自己启动的模型控制任务登记拒绝，UI 动作仍须产品消费原 Promise。
L6 自带处理意味着零 unhandled 不是 L7 即时消费的强证明；不以此解决旧 L06/L09–11/Q1 或新增观察设施。
原 window.error/unhandled 计数保留，普通路径零意外事件；预期非法 props/回调二次抛由真实 Boundary 核原错误，
原全局事件单报，不按身份/类型/消息或 React 重试次数过滤。watchdog 只防测试死锁，不是生产 SLA。
各自拥有的根、订阅、SDK、browser/server/Core 按原工具清理；不 dispose/cancel/clear 借用的模型。

DOM 仅依规范 region、原生表格/表头/按钮、任务文字和原字段定位，不冻结 CSS class/私有结构。
等价可读标签/布局调整须记录为纯定位适配，不能改字段原值、顺序、缺失、原 ref 或命令预期。
通用观察、堆/成本、M7/真实读屏/跨平台/远端CI及真实 Electron main/preload 不在本有限单元；新工程首版无持久化迁移。
已验收的连接83/24/5、实例面板69/30/3不重开；若生产抽取其共有逻辑，由 A 跑原集合回归，B再独立复验相应固定交付。

## 单列规范与 Schema 的可达性差异

DESIGN §6.21.2 要求 complete 附 reasons 也展示、value 空文本区别缺失；当前权威 Completeness 对 complete 的 reasons 限 maxItems0，
FourStateValue 亦排除空串。合法 SDK→真实模型通路不能发布这两个输入，Node 控制显式确认拒绝，不伪造 L6 state 取覆盖。
这两条作为防御性展示要求保留，但本冻结不声称经合法 wire 执行；由规范维护者后续澄清，不依据未来实现裁决、不阻塞其余明确范围。
合法的空 reason.detail、空端点集合/路由、缺失可选字段、零位宽及128位四态文本保留原 fixture。
