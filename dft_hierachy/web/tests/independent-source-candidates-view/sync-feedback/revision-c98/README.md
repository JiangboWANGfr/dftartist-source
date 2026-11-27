# C-98 修订设施

旧 S01/S02 语义输入、cases/assertions/public-model/facility 及历史证据不改。
原 fixture/run 改接原生 window.error + unhandledrejection 与 runner pageerror。
边界仅允许已由真实 componentDidCatch 收到且通过 [原E,原X] 断言的同一原对象；
且仅许可该次componentDidCatch当下已记录的具体事件索引，之后同对象的逸出仍拒绝，不固定React报告次数；
同名/同message/同AggregateError类型不构成许可。保留所有事件，不 preventDefault、不读原Promise。
runner 的 pageerror 必须逐项 name/message/order 对应上述原身份边界事件，不能吞掉其他pageerror。
仅作原锁Playwright/Chromium的精确空message投影：原{name,message:""}在pageerror为{name:"",message:原name}。
该投影在原生原对象身份分类之后执行，不按错误类型豁免；首稿未做映射的S01适配失败保留。

probe.mjs 明确别名到 probe-view.jsx 设施对照，不执行生产候选组件。S02原始公开模型、DOM click/flushSync及原runCase都保留。
--legacy 选固定产品内的历史原fixture；默认选修订fixture。--leak只在反馈资格已撤销时抛原E，正常分支正确return。
断言始终是“泄漏必须被runCase拒绝”，不是看见漏检就算测试通过；因此旧--legacy --leak必须留下exit1。
默认零错误S02正控及--S01真实React边界正控应通过；对应泄漏负控在修订后应识别（探针exit0表示设施识别预期负例，不是目标UI通过）。
命令与结果见对应冻结计划/报告。15秒外层工具watchdog仅设施防挂。没有Core/Electron纵向/Q1证明。
