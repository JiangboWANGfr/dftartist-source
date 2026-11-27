# B62：SearchResultsView 有限独立冻结

规范固定c4390a66592914c9232609dbf16dcd62776fc311的DESIGN §6.23及明确继承的§6.21/§6.19。原Schema7/protocol2、公开声明和B原HDL/手算事实为oracle；不读取A consumer、模型见证、search.sv、实现/diff/自测反推预期。必读共享交接/计划有摘要，不声称完全盲读。

## 清单与判断依据

84浏览器场景：19非法props/品牌/Proxy、1可选undefined、5五态、3原query表示、3原字段/文本/reasons、5完整性空页/next、6明确命令、7原生输入、3Selection命名空间/外部bits/被动更新、6订阅生命周期、9原state/指针/原query/未提交/迟到反馈、8原错误结算、5焦点/Tab/滚动/多挂载、1诊断、1原页内index、1释放、1真实Core链。逐项id/input/expected/basis见cases.mjs及run.mjs --list。

26类型负例见types.ts；proposal仅映射固定公开声明，production读真实根声明。先正向零诊断，再内存去全部指令，逐项对应行真实拒绝且不许其它诊断代替。可选undefined的运行时省略与TS exactOptional边界分账；同步void回调在TS允许返回Promise，但其返回由宿主负责，不把此事实改成组件await承诺。

3包外输入（root/types、六CSS入口、React peer）复用原tarball消费门禁；原4包探针是前提、不是新3项通过。真正安装后root import与声明/CSS解析均不用workspace alias。能力缺失的根/CSS实际失败与peer通过分开记录。

4 Node+1浏览器真实模型+1Core模型基础控制单列，不代84 UI。普通controlled Transport只提供合法wire，经真实SDK/模型发布；没有仿组件、写state、第二DTO或假的Core/Selection。只读声明字段，complete-with-reasons不可由当前SDK合法发布，控制明确拒绝，不为覆盖造假状态。

## 运行与初始红

P自有固定检出，先原锁安装/Web check；T=P/web，Node24、原React18.3.1/esbuild0.25.11/Playwright1.64.1。Core必须B自有同源码构建并按SHA核对，不能用A/C移动产物。runner/清理/HTTP Core桥及packager沿用旧工具；无新观察设施。仅DOM/AX，不代表真实读屏/跨平台/Electron。

```sh
export HIER_B_PRODUCT_ROOT=/absolute/fixed-product
export HIER_B_BROWSER_TOOLS="$HIER_B_PRODUCT_ROOT/web"
export HIER_B_NPM_BIN=/opt/homebrew/bin/npm
export HIER_BIN=/absolute/B-owned-same-source/hier
export PATH="/Users/jiangbowang/.npm-global/bin:$PATH"
node web/tests/independent-search-results-view/types.mjs proposal
node web/tests/independent-search-results-view/types.mjs production
node --test web/tests/independent-search-results-view/facility.test.mjs
node web/tests/independent-search-results-view/run.mjs --controls
node web/tests/independent-search-results-view/run.mjs --core-control
node web/tests/independent-search-results-view/run.mjs
node web/tests/independent-search-results-view/package.mjs
```

先独立冻结commit再跑固定基线。缺SearchResultsView/CSS时84 planned、0 executed、84 blocked、0 skip；不是84语义失败或通过。缺生产正类型时26负例executed=0；proposal通过另账。真实Core/UI用原树fixture的literal plain实例及b_tree_leaf定义，定义ref来自独立children元数据而非A搜索输出，定义选择不自动fetch occurrence。

动作来源固定原state/query/page/index；UI观察保留原公开方法receiver/Promise/Error，不按实现挑预期。命令原Promise须由产品消费，零unhandled不扩大为Q1/任意then-free证明。原局部watchdog防挂起，非产品超时SLA；资源close与所有权只报告原断言范围。

沿旧工具保留原始window.error总数：普通场景要求无意外全局事件；预期非法props/回调二次抛场景由真实Boundary核TypeError或原AggregateError，原始全局总数另报、不按身份/消息/React重试次数过滤。该旧机制不逐一归因这些预期Boundary场景的其它window.error，不宣称其原始事件为零或所有事件都已确证归因；本轮不新建通用错误观察设施。

## 边界与交接

原SearchModel100/26/4、旧视图/包/树不重开。真实生产抽取共有代码时才按影响复验其原集合。首版无持久化，工程创建/保存/恢复/迁移不适用。搜索表单草稿、自动index.ready协调/树reveal/源码读取/definition多实例选择、真实Electron main/preload/dft-suite、完整processor_core/M5/M7、读屏/跨平台/远端CI不由本有限单元放行。

结果/原流/冻结SHA/未执行项写B计划与共享REVIEW_LOG（只EOF追加、不提交），C对应审/B有限冻结后A直接生产，不增加新开工前置。
