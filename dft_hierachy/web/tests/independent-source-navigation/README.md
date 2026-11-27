# B SourceNavigation 独立冻结

仅据DESIGN§6.13及旧B手算表/原始HDL/公开接口；不读取A实现/consumer/verifier/capabilities定oracle。
从B工作树执行，固定产品先web构建；真实Core仅用该固定产品B自建产物。

```sh
HIER_B_PRODUCT_ROOT=/fixed/product node web/tests/independent-source-navigation/run.mjs --list
HIER_B_PRODUCT_ROOT=/fixed/product node web/tests/independent-source-navigation/run.mjs
HIER_B_PRODUCT_ROOT=/fixed/product HIER_BIN=/fixed/product/core/build-b-review/hier node web/tests/independent-source-navigation/run.mjs --core
HIER_B_PRODUCT_ROOT=/fixed/product node web/tests/independent-source-navigation/verify-types.mjs
# 控制，不是新运行时接受：
HIER_B_PRODUCT_ROOT=/fixed/product node --test web/tests/independent-source-navigation/facility.test.mjs
HIER_B_PRODUCT_ROOT=/fixed/product node web/tests/independent-source-navigation/verify-types.mjs --proposal
```

--list给每例id/input/expected/basis，不执行。缺SourceNavigationModel/Error时停能力门、planned/actual0/skip0，非零退出，无fallback。
--proposal仅把新API第一组导入指向隔离声明，旧类型仍从真实公开包取；正例先成功，负例再逐项真实编译，types=[]。
不要求跨字段TS自动收窄或候选query.col声明必需（这是运行时不变量），不冻结completion Promise或强求桥Promise等于子命令。
不硬编码所有通知次数/内部订阅实现；只验证有规范依据的可观察转换，原始SDK Reply、文档/页身份和错误值保留。
所有自有上下文、Promise、SDK模型、Core进程和临时fixture收尾；15秒watchdog只防挂起，不是产品SLA。
公开方法故障注入明确标记，只装饰原接口且finally恢复prototype，不作假的协调器，不称合法wire。
两项公共候选reload故障注入以可装饰公开原型方法为设施前置；未命中装饰器属于设施不适用，不能据此判产品违约，
也不计为产品通过或skip。公开契约不要求方法一定自有于该prototype。
ready事件注入在受控Transport的公开index帧，使用既有Schema的Reason对象与cursor归一化，不制造实现私有事件。
原B-NAV-Q1/Q2的两个精细阶段暂待规范澄清，未纳确定oracle、不计skip/已覆盖，见B计划/REVIEW_LOG。
无UI/Electron、Selection/SourceView、main/preload、L06/L09–11、旧工程迁移或M7结论；首版无持久化。
