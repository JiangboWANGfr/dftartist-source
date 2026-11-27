# B ObjectConnectionsModel 有限独立冻结

依据固定b5450f8 DESIGN §6.20/§6.9/§6.10.4和机器Schema，不取A consumer/witness/实现/diff为oracle。
计划与范围见 docs/plans/B-M5-object-connections-freeze.md。仅数据单元，不是连接展示或Electron IPC验收。

从B仓库根，以固定产品独立构建的P为HIER_B_PRODUCT_ROOT、B自编同源码Core为HIER_BIN：

```sh
node web/tests/independent-connections/run.mjs --list
node web/tests/independent-connections/run.mjs
node web/tests/independent-connections/verify-types.mjs proposal
node web/tests/independent-connections/verify-types.mjs production
node --test web/tests/independent-connections/fixture-check.test.mjs
node web/tests/independent-connections/core.mjs sdk
node web/tests/independent-connections/core.mjs model
```

run.mjs列出有限id/input/expected/basis；无新模型时capability失败，executed=0/blocked=计划数/skip=0，不提供假实现。
24个独立类型负例实际去标后按语句span核诊断；proposal只导入固定公开声明，production只用根出口。
6个fixture/SDK控制不是模型测试。Core sdk/model各5个场景，重叠的源KAT不相加冒称新覆盖；5个Core进程退出/监听退订另报。
复用原B公开Transport、真实SDK和清理scope，唯一新增包装是透明记录object/drivers/loads原Promise/Reply。
独立SV手算source[7:3]→d[4:0]，故d[2:1]对应source[5:4]；常量01zx的[2:1]=1z。
不以任意合法wire Endpoint推断真实Core事实。原Reply身份、五态和调度由模型集合验证，不以SDK控制代签。

未硬冻的歧义：slice形状本身不可读时，后续根getter的错误优先级；drivers自身同步抛值/同栈释放时loads是否仍发起。
另不规定child outside起始绑定是否必须计一条via：当前规范只明确其父体上下文，不能由查询ref本身推导路线数；连接模型仍必须完整保留原via。
正常返回Promise时的两调用间无await明确，采用公开Transport观察两查询启动；不增加私有时钟/调度hook。
无持久化/迁移，不重开已验收面板或属性数据，不新增堆/读屏/跨平台/观察设施前置。
