# B renderer Transport 黑盒冻结（不是Electron整体验收）

依据已获C通过的DESIGN §6.8及§5.6.2/5、公开Bridge声明和旧B wire fixture。
`run.mjs --list`逐项列输入、预期及依据；只调用真实公开工厂/Transport/SDK，不导入实现内部。
BridgeInput只是公共Bridge事件/结果输入控制器，没有Transport、预加载IPC或反馈实现。

```sh
node web/tests/independent-electron-renderer/run.mjs --list
node --test web/tests/independent-electron-renderer/facility.test.mjs
HIER_B_PRODUCT_ROOT=/absolute/B/fixed/source node web/tests/independent-electron-renderer/run.mjs
HIER_B_PRODUCT_ROOT=/absolute/B/fixed/source node web/tests/independent-electron-renderer/verify-types.mjs
HIER_B_PRODUCT_ROOT=/absolute/B/fixed/source node web/tests/independent-electron-renderer/browser-gate.mjs
```

Node24，产品四包先在自有固定树构建。公开ESM子路径在产品package作用域解析，缺导出不走文件路径fallback。
运行时缺工厂时退出1、planned库存/0 executed/0 skipped，不伪造每项语义失败或fake工厂取绿。
类型只有正例零诊断后才逐项运行16个真实负例；缺模块不是16负例通过。
`verify-types.mjs --proposal`明确使用获审隔离声明检查输入，只是契约设施控制，绝不作为生产类型出口通过或自动fallback。
浏览器打包/无Node全局realm的模块加载与工厂导出形状另列，尚不在该realm调用工厂。
不能用Node执行成功替代；它也不是真实Electron或浏览器UI。

task边界用setImmediate排空微任务，不依赖sleep或固定微任务层数。15秒watchdog只防测试挂死，非产品SLA。
finally关闭每个自有SDK/Transport并检查Bridge登记回收；不自建Core进程、窗口、计时器或自动消息。

本轮只冻结renderer可观测单元、SDK原文本数字证据/错误集成及类型输入。
真实main/preload、contextBridge、跨窗口/子frame/导航权限、进程强制回收、双端总资源和Core/Electron E2E必须另冻/执行。
不改变原API/IPC/Schema/依赖锁，不接标准门禁，不改旧140/48/C81/属性或历史红，不宣称M5完成。
规范窄歧义BER-Q01～03见[计划](../../../docs/plans/B-M5-electron-renderer-freeze.md)，不按实现猜答案。
