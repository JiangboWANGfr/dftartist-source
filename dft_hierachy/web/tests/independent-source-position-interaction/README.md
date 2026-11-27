# B 独立 SourceView 位置交互冻结

依据固定57fb80db5581028549e116e40d3f21b759f9b1b2的DESIGN §6.15（350864字节/SHA256 7d7d43afa14c6cc7a3da2d3fb08f8c79e7196064bceb5917fca6e8d9e464d8ba）。
C23已通过契约；本目录不是A隔离消费者/能力见证的副本，不读其实现/自测建oracle。
只使用公开SourceView、SourceNavigationModel、SDK和原B SourceDocument字面DTO。
输入、预期、依据逐项保存在cases.mjs及types.ts，计划见docs/plans/B-source-position-interaction-freeze.md。

## 验收与计数

119个业务场景：

| 组                | 数量 | 输入与预期                                                                                                                                                                                                                                   |
| ----------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| config            | 15   | 显式undefined/null/数组/函数/缺回调/错类型同步TypeError；省略兼容；旧字段优先；getter原值；每render仅读两回调一次，不读扩展/枚举/冻结caller                                                                                                  |
| activation        | 2    | 启用说明/shortcut/范围说明直接关联；双实例说明ID/回调/document局部性                                                                                                                                                                         |
| disabled          | 5    | 五态中的非success及changed，不查询/不宣称快捷键                                                                                                                                                                                              |
| key               | 16   | Text/Element/mark/空code/EOF、BOM/CRLF/代理对/tab原始offset、反向focus/折叠、iframe ownerDocument；一次同栈原值调用                                                                                                                          |
| key-ignore        | 14   | 修饰/repeat/composition/无选区/多Range/跨面板/跨实例/外部目标：不查询、不preventDefault                                                                                                                                                      |
| ignore            | 7    | 单击/移动/contextmenu/copy/scroll/拖动/Selection变化不查询                                                                                                                                                                                   |
| trusted-mouse/key | 5    | 真实浏览器dblclick三种scale及双轴已滚动文档；真实Alt+Enter反向选区；原生caret给出event client位置，非字符宽度推算                                                                                                                            |
| mouse             | 11   | 受控原生caret主/回退/缺失/null/外部端点与target/button/modifiers；缺失提示可见/direct aria，不猜offset                                                                                                                                       |
| feedback          | 40   | 显式deferred、原返回即使同步卸载/换配置仍观察；sync throw/undefined/reject/Aggregate/nonthenable；then只读一次/正确this/跨realm/嵌套首次结算；未提交render/文档配置动作身份与恢复不复活；原失败浅冻结、无opaque probe、onError反馈与错误边界 |
| model             | 4    | 生产SourceNavigationModel+SDK+手写Transport：pending/候选与原document；CRLF/代理对交L6拒绝，旧显示document由L6拒绝stale_document，不替换最新doc                                                                                              |

42条类型负例逐项撤掉expected-error，必须在对应行产生语义诊断，缺导出/缺模块不充负例通过。
proposal只核独立规范形状，不是生产。production必须消费真实公开声明；缺新API以非零能力阶段停止、语义执行0。
正例覆盖旧四项props、回调成组、Promise<void>及unknown错误、void回调返回值责任、严格optional与readonly。
真实React声明按realpath身份确认，Node/Electron ambient输入为0。

2个外部包组：真实离线npm pack/install（四个@hier包和React运行依赖闭包）；
独立消费原types.ts和包外五个trusted输入。编译红仍继续浏览器组。
全部@hier/React runtime从外部安装目录解析，不能fallback workspace/proposal。
两组与已执行的119/42重复部分不累加为新场景。

设施另计：inventory 3，原生DOM对照8（不挂SourceView，无替代事件实现）。
受控KeyboardEvent/MouseEvent、caret缺失/端点注入和多Range适配不是受信任浏览器输入。
浏览器默认选词/焦点行为不当组件副作用；受控事件检查组件不改Selection/focus/scroll，真实鼠标不preventDefault，
真实键盘仅成功命中时preventDefault。DOM原文不等于OS剪贴板承诺。

## 执行

设置HIER_B_PRODUCT_ROOT为固定检出，HIER_B_BROWSER_TOOLS为其web工具目录，
HIER_B_NPM_BIN为真实npm绝对入口；使用Node24、固定TS/React/Playwright及已安装Chromium。
先在固定检出执行npm --prefix web ci --ignore-scripts和npm --prefix web run check。

    node --test web/tests/independent-source-position-interaction/inventory.test.mjs
    node web/tests/independent-source-position-interaction/run.mjs --controls
    node web/tests/independent-source-position-interaction/verify-types.mjs proposal
    node web/tests/independent-source-position-interaction/verify-types.mjs production
    node web/tests/independent-source-position-interaction/run.mjs
    node web/tests/independent-source-position-interaction/package.mjs

--list仅列清单；--trusted-only只跑原五项，是tarball消费入口，不改变预期。
HIER_B_PACKAGE_VIEWS_ENTRY和HIER_B_PACKAGE_CSS由包脚本设定，用于实际安装的同一个public出口，
同时所有@hier与React从该consumer解析，普通产品测试不设它们。
fixture使用真实公开组件，不包含新SourceView实现。
业务同步点为显式Promise、微任务与MessageChannel；runner/子命令watchdog仅防设施挂死，不是产品超时/性能SLA。
每页独立挂载，finally卸载、结清自有deferred、还原原生端点覆盖、释放自有model/client并关闭browser/server；
调用方模型不由组件dispose/cancel。

## 当前基线与范围

新交互未实现。生产类型缺新导出/props、有效事件无locate/提示与新配置校验应红；负向无查询/旧字段检查可绿。
事件未调用时，后续异步深层断言尚未到达，不能把红用例登记说这些断言已被实现验证。
初始结果以独立报告/完整命令原输出为准；不skip/xfail，不根据A实现放宽预期。
无新规范歧义；C23解释的Promise解析/嵌套首次结算属于原契约，不新增审批。
后续发现测试设施缺陷须保留原失败和说明后窄适配，不能改业务预期取绿。

原只读117DOM/28类型/6包与旧红绿证据不改，当前纯契约无生产变化以输入身份核对代重复全量门禁。
新交互实现后需原119/42/包2及旧门禁、相关导航/位置/包出口回归。当前model集成不是Core；
真实UI→Core/main/preload/Electron、候选确认→Selection、系统剪贴板/读屏/SSR、
其他浏览器/Linux/远端CI/M7未执行，首版无持久化，不虚构工程保存/迁移验收。
browser技能内置执行入口不可用，按fallback使用固定Playwright，不称in-app/Electron认证。
