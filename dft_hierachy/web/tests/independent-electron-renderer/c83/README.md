# C-83关闭发送分类独立补冻

DESIGN §6.8.3/§5.6.5关闭优先：send始终transport_closed/transport；§6.8.4原onClose首因/诊断不变。
正常关闭、transport_closed/transport及声明允许的not_ready/client、protocol_error/client、not_found/core、bad_request/core，
分别覆盖已绑/未绑接收者，12项。真实公共Transport，Bridge只是输入控制；无Electron、SDK ready缺陷扩大或BER选型。

```sh
node web/tests/independent-electron-renderer/c83/run.mjs --list
HIER_B_PRODUCT_ROOT=/absolute/B/fixed/source node web/tests/independent-electron-renderer/c83/run.mjs
```

先独立提交，再跑固定1087f78；错误分类、Bridge零发送、原onClose原因分别断言，finally检查登记回收。
不改原99/16、C82的25或旧1195集合与历史红；不将Core业务响应转换为关闭事件。
