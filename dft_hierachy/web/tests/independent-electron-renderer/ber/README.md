# BER-Q01～03精确独立输入

固定DESIGN edac525后同字节§6.8，获C认可的规则是oracle，不读A实现/新增自测生成预期。
40项：Q01 6、Q02 7、Q03 27（connect2/start4/send3/重入快照2/清理12/opaque id4）。
原99/25/12和16类型不改，强reason/工厂形态/坏桥规则单独增量；先提交再运行。

```sh
node --test web/tests/independent-electron-renderer/ber/facility.test.mjs
node web/tests/independent-electron-renderer/ber/run.mjs --list
HIER_B_PRODUCT_ROOT=/absolute/B/fixed/source node web/tests/independent-electron-renderer/ber/run.mjs
```

真实公开工厂/Transport/SDK，Bridge仅输入，非Electron/preload/Core E2E。
坏release在副作用前抛错时，夹具自己的登记由B finally强制断开，报告fixtureFaultDetach；
该动作不记为产品release，也不声称坏桥成功回收远端资源。本组断言产品清理尝试顺序、首因及本地终态，非堆内存泄漏保证。
close故障的同步返回形态未另作规范猜测，surfaceThrows仅观测；产品其余规范断言不放宽。
没有sleep，15秒watchdog只防挂死，所有异常原样记账，不能用proposal/fake工厂/skip取绿。
