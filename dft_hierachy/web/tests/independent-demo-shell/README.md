# B73 demo 壳一次有限冻结

唯一行为依据为固定 ee14d3c 的 DESIGN §6.27，以及原公开包/HDL事实。必要A交接已见，不读A实现/diff/新增自测生成预期。
本目录不实现demo，也不重开已充分冻结组件。

- cases.mjs：25真实Electron控制/UI场景，逐项input/expected/basis和可执行体。13控制＋12 UI。
- electron.mjs/run.mjs/ui.mjs：实际生产app、原预加载桥、真实IPC/Core；只替换dialog.showOpenDialog返回固定文件/取消/错误及其完成门闩。
  页面操作用真实DOM/原生Electron输入；不伪造SDK/模型/IPC或Core。没有生产工厂就明确能力红。
- types.ts/types.mjs：20严格类型负例；proposal验证隔离声明表达性，production必须绑定实际app声明，无提案fallback。
- design.sv/broken.sv/fixtures.mjs：B手写真实输入，两个同定义occurrence、两位连接与转义名；canonical临时目录含空格/Unicode，filelist相对 ../rtl。
- core-control.test.mjs：2个真实SDK/Node/Core输入控制，只证明source/-F fixture和回收前提，不计demo。
- probe.mjs：原公开SDK/renderer桥的真实roots往返；用于三个控制场景确认坏token/旧id之后当前会话仍可查询，
  不仅检查一个可能已变终态的id仍能close。不是假Core或新的demo控制器。
- facility.test.mjs：3个库存/字节刺激/路径控制，不计产品。
- cases.deferred：4项需求已明、现有app公开面无法确定性刺激的缺口，不伪装已执行/已冻结可执行用例；见计划/B73-DEMO-Q01。

```sh
HIER_B_PRODUCT_ROOT=/absolute/fixed node web/tests/independent-demo-shell/types.mjs --proposal
HIER_B_PRODUCT_ROOT=/absolute/fixed HIER_B_DEMO_TYPES=/absolute/fixed/web/apps/demo/actual-bridge.ts node web/tests/independent-demo-shell/types.mjs
HIER_B_PRODUCT_ROOT=/absolute/fixed HIER_BIN=/absolute/B-owned/hier node --test web/tests/independent-demo-shell/core-control.test.mjs
node --test web/tests/independent-demo-shell/facility.test.mjs
HIER_B_PRODUCT_ROOT=/absolute/fixed HIER_BIN=/absolute/B-owned/hier HIER_B_DEMO_ENTRY=/absolute/fixed/web/apps/demo/actual-built-main.mjs node web/tests/independent-demo-shell/run.mjs
node web/tests/independent-demo-shell/run.mjs --list
```

ENTRY/TYPES是公开构建/声明文件的测试绑定，不规定新产品API或源码布局；入口必须属于固定真实app。
入口未提供时尝试demo/package.json main，仅作常规发现，不将package.json布局当产品验收条件。
UI角色/可访问语义只是DOM绑定，精确中文文案、组件DOM组织不作为oracle；真实实现后必要的绑定适配须B记录，不能改变场景input/expected/basis。
首冻无app时，本driver/原生picker/UI输入适配尚未实证；该历史能力红保留。

B74维护只改启动/DOM绑定，不改变25项input/expected/basis。实际构建入口为
`web/apps/demo/dist/main.mjs`，声明为`dist/types/bridge.d.ts`；外部窗口通过
HIER_B_DEMO_PRELOAD（默认入口同目录preload.cjs）绑定同一真实preload。
公共SDK出口由Node父进程解析，不在Electron中把process.execPath当Node。
可用`--case ID`定向复现；planned仍是25，unselected明确另账，不冒称全量。

DC12在重载后丢失旧executeJavaScript返回上下文时明确bindingBlocked，保留token/权限预期，
不等待永不结算的旧Promise，也不要求合法新文档永远不能打开。blocked不计passed/failed/skip，
整体仍exit1。DU11通过已查询的真实PathResolutionView按钮产生external选择，
不是树自身click（§6.7.2允许树聚焦），不暴露或伪造SelectionModel。
路径结果按原fixture唯一行；源码候选按原sum文本范围的第二occurrence绑定，
不从opaque ref推名字。源码保留断言比较完整候选行文本，不用可能全空的u0/u1名称筛选。

45秒watchdog只硬清理核对PID/PGID/命令归属的测试自有组，记录cleanup且该场景失败；
不是正常产品回收或超时SLA。具体原失败、适配和限制见B-M5-demo-shell-revalidation计划。

C74报告真实C-103后仅追加DR01，同源码协调类别，位于单独regressions数组；
原cases仍25且元数据不变。默认运行25+1，结果分originalPlanned/regressionPlanned。
该回归验证保留文档后同kind/不同target仍有可达的明确加载动作，
不对唯一已选option强发change冒充用户操作。完整输入/预期/依据可用--list查看。

M5-A-04包外执行仍复用同一driver，默认26及其元数据不变。必要目录绑定为
HIER_B_PRODUCT_ROOT=外部交付根、HIER_B_DEMO_APP_DIR=其app目录、
HIER_B_DEMO_ENTRY=其app/dist/main.mjs；公开包/声明解析取该目录普通node_modules，
不借仓库源码alias或workspace链接。types.mjs在外部根使用包的公共exports.types或types字段。

另有原M5阶段目标的一条显式工作流，不加入默认26：

```sh
HIER_B_PRODUCT_ROOT=/absolute/outside-demo HIER_BIN=/absolute/B-owned/hier HIER_B_DEMO_APP_DIR=/absolute/outside-demo/app HIER_B_DEMO_ENTRY=/absolute/outside-demo/app/dist/main.mjs HIER_B_PROCESSOR_FILELIST=/absolute/nx9000/design/processor_core/processor_core.vc node web/tests/independent-demo-shell/run.mjs --processor-core
```

输入/预期/依据在processor-workflow.mjs及B-M5-demo-package-validation计划。
它只用原native picker边界和公开DOM动作，按原RTL核根/深层实例/搜索/源码/关闭，
不声明穷举跨页、退出挂起、性能或全局零泄漏。

每场景独占真实Electron进程，父进程核实际版本、场景id/完成记录/cleanup及exit；不因缺能力/显示环境而skip。
watchdog仅防挂死，非产品SLA；无新Promise/堆/Q1或trusted-device观察设施，不声称全局零泄漏。
processor_core真实UI与完整M5/旧宿主/跨平台/读屏/M7另验；无持久化，保存恢复/迁移不适用。
