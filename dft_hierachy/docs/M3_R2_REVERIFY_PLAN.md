# R2-B 固定修复复验计划

## 目标与验收

执行协调计划R2-B。固定产品1f42fb2711764cfba863acc12a06b46b33f28c44，DESIGN SHA256 487211cec837aed48879f9915372780f1c03b7b0adf61cccbcbc4bb36a6e89e0。依据§4.3/4.4/5.4/5.5.1–5.5.4/5.5.7和B冻结fixture，不从A实现/自测改变预期。

1. C53：EMPTY未知宽度inside/outside、back/forward均partial/unknown_pin_width，无虚构at/map/next；非空显式位段bad_request。已知宽度未知方向对照partial/blackbox。
2. C54：合法streaming未知引脚连接的数据整段/裁剪不能complete空驱动/前驱，保留blackbox原因和关联；forward/loads也必须保留读取。declared及独立LibraryProvider In/Out4区分明确方向。
3. 原step分页/游标/side/角色/常量/映射/事实身份、共享与逐实例、冷热cache0/正预算保持；C认可限定真实L2/L3提取后取消及LRU/借用所有权保持。
4. 前序expr/library/diagnostics/lookup/occurrence、M2基础/共享/分层和原生RSS门禁不回归。已有trace18CLI及D01三API执行，不能把缺source的混合API构建冒称完整M3验收。

## 基线、边界与修改点

B测试HEAD a22ee50487c99c5f30f71c649707e2a52b66845f，最终边界冻结2e6411ee6dfbe2b23cf0870bce69266ed122081f。修改前37a红基线及所有初始失败永久保留于M3_R1_STEP_VERIFICATION.md/json，不重复改写或猜测引入提交。本轮没有新oracle，测试源/fixture不改。收尾收到C55后仅修测试目标的PRIVATE依赖，冻结a8aa140并单列固定产品原登记失败与受限overlay验证；其余新增均为本计划、独立报告及机器证据。

实际链CLI→JSON→Design→DB/Frontend；使用B独立detached产品树及三个build-b目录，第三方源码只读复用，不使用A产品输出。模型/静态消费者重新编译；schema/协议观察不等于ABI或M4权威Schema/TS一致性。首版无会话持久化，工程保存/恢复/迁移不适用，React/Electron/NDJSON后续里程碑不伪造验证。

## 执行步骤

- [x] 核对干净工作树、固定产品/契约/冻结hash，追加主日志领取。
- [x] B自有三配置重编产品及全部可交付独立API；先核对CTest登记。
- [x] 三配置执行原80CLI及新增边界3CLI，分别保留分母、缺入口和语义断言失败。
- [x] 三配置执行八套语义/限定适配API、27项前序CTest；普通独立执行RSS四方法。
- [x] 核对测试文件无变更、共享依赖未污染、无额外sanitizer报告；报告实际退出码/命令/数量/缺口，独立提交并交A/C/协调者。
- [x] 收尾C55：三配置独立复现仓库目标缺DB头，冻结仅PRIVATE依赖修正；在受限测试overlay下重编/执行仓库入口及外部runner，恢复固定树并交A/C。

## 风险与交接

C同步运行其他独立构建，资源竞争影响墙钟，时间不是绝对SLA；RSS原相对阈值不变，仅普通原生执行。完整混合15API仍含未交付source，不能放宽/拆改原测试取绿。通用observer未获交付/审查，热逻辑准入/seek候选/中间物化/索引产出循环取消/确定性时钟仍未验收。缺陷正式关闭归提出方C；R2子集通过不是完整M3放行。

## 进度与实际证据

开始已读取最新调度/日志，确认R2前置条件满足；按本计划运行后将结果写入M3_R2_REVERIFY.md与m3_r2_reverify.json。历史37a证据保留，未读取A生产实现/diff/自测代码；强制交接阅读暴露A概要，不称严格盲测。

本轮三配置原80CLI各72通过/8缺source失败、0skip；新增边界3/3，八API合计31用例/32980断言全部通过，前序CTest27/27；原生RSS四方法通过。C53/C54冻结复验通过，正式关闭仍归C。混合15API语法编译退出1、执行0用例，缺source相关公开类型/方法；没有拆改该oracle或把完整M3标为通过。实际证据与结论边界见独立报告/JSON。

C55原固定目标三配置均编译退出2、运行0；a8aa140仅PRIVATE链接hier_db，测试overlay下八仓库API重编、CTest8/8及八外部API复跑三配置均通过，原adapter3/144不变。产品二进制SHA不变，overlay已撤销并重配，固定产品树干净；原登记并未因此变绿，仍待A吸收/C关闭。
