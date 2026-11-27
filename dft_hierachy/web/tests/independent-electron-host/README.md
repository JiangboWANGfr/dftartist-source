# B71 Node文本回归及Electron宿主有限冻结

唯一行为依据：固定e2179b3的DESIGN §5.6.5/§6.8、Schema7/protocol2、已审main/preload/bridge声明、原B M4/renderer/真实Core HDL。未读取A实现/diff/新增自测定oracle；必需交接已见，不声称盲测。

- text-cases.mjs：逐项input/expected/basis，原B字节/文本/词法输入重放到私有文本分支，不替代Node入口。
- host-cases.mjs：main/preload逐项来源/文档/会话/connectionId/领取/start/原文本/授权坏包、早关闭/导航/崩溃/重开/首绑、桥表面/登记/释放/发送失败。Electron依赖输入只是单元刺激，实际生产函数从正式package exports加载，不提供假产品工厂。
- text-core.test.mjs：原B id_boundary.sv的真实Core→文本→结构克隆字符串→原解码器→SDK roots/children；不是Electron。
- run-e2e.mjs/electron-*：独立真实sandbox/contextIsolation/noNode窗口→真实contextBridge/SDK/Core→关闭。必须实际Electron可执行文件和main/preload生产入口；缺能力退出1、0executed/blocked/0skip，不用Node模拟转绿。实际runtime/peer由A实现固定，不自行下载二进制或改生产依赖。
- types.ts/types.mjs：16 main/preload公开类型负例；proposal只验证已有声明表达性，production缺正向能力时0负例执行；不得把缺模块诊断当16拒绝通过。官方Electron声明只读依赖，不自造WebContents类型。
- facility.test.mjs：库存/输入队列/真实byte producer三个控制，不能算产品或Electron验收。

```sh
HIER_B_PRODUCT_ROOT=/absolute/fixed-product node web/tests/independent-electron-host/run-text.mjs
HIER_B_PRODUCT_ROOT=/absolute/fixed-product HIER_BIN=/absolute/B-owned/hier node --test web/tests/independent-electron-host/text-core.test.mjs
HIER_B_PRODUCT_ROOT=/absolute/fixed-product node web/tests/independent-electron-host/run-host.mjs
HIER_B_PRODUCT_ROOT=/absolute/fixed-product node web/tests/independent-electron-host/run-host.mjs --preload
HIER_B_PRODUCT_ROOT=/absolute/fixed-product node web/tests/independent-electron-host/types.mjs --proposal
HIER_B_PRODUCT_ROOT=/absolute/fixed-product node web/tests/independent-electron-host/types.mjs
HIER_B_PRODUCT_ROOT=/absolute/fixed-product HIER_BIN=/absolute/B-owned/hier HIER_B_ELECTRON_BIN=/absolute/electron node web/tests/independent-electron-host/run-e2e.mjs
```

所有case在文件内明确输入/预期/依据；run-host/run-text加--list列库存，不执行产品。生产入口不做文件路径fallback（私有文本明确只用于本包内分支）。Node24；支持固定产品的现有esbuild/TS，不新增生产依赖。localhost producer为确定性字节刺激与stdin记录，不模拟Core，finally关闭自有进程/socket/server；watchdog仅防挂死，不作为SLA/竞态选择。

原renderer/路径及M4冻结不动、不扩张已充分冻结单元；只处理此前明确剩余宿主范围。单元依赖输入不验证Electron API实现；真实E2E不含UI面板/dft-suite/完整processor_core/M5/M7/读屏/跨平台/远端CI。首版无持久化；保存恢复/迁移不适用。旧树51/C-81/D-03/M6保持原归属。

规范未定策略不自行猜实现：不固定随机ID格式、内部监听组织；局部4MiB不代表IPC系统队列/堆上界。单帧发送含字面CR/LF的具体关闭reason需与§6.8通用原JSON/外壳错误边界核对，本轮main只冻结无歧义的json类型错误与坏JSON reason；文本通道仍明确拒绝分隔符。真实main/preload与runtime未交付时如实能力阻塞，不能据本冻结称宿主已验收。
