# C-82 独立补冻

固定1087f78；oracle仅DESIGN §6.8.3其它id隔离/提前关闭及§5.6.5/§6.8.4首因不覆写。
25输入=5种foreign事件×（开放领取1 + 正常/异常首因×前/后顺序4）。闭合用例各运行无foreign控制和插入foreign变体，
对照关系由规范直接给出，不从控制端输出反推绝对行为；两端各自也须保持当前关闭且不能ready及已知异常诊断。
不选择BER-Q01工厂返回closed Transport还是拒绝Promise，也不选择Q02/Q03精确行为。

```sh
node --test web/tests/independent-electron-renderer/c82/facility.test.mjs
node web/tests/independent-electron-renderer/c82/run.mjs --list
HIER_B_PRODUCT_ROOT=/absolute/B/fixed/source node web/tests/independent-electron-renderer/c82/run.mjs
```

使用实际公共工厂和真实SDK；Bridge只有事件/领取结果控制，无fake Transport或Electron。
先提交新输入再跑产品。原99/16、旧能力红及已验收属性不改；25另计，不反写1195历史集合。
finally在断言失败时仍清SDK/Transport及Bridge登记；15秒watchdog非SLA，不靠sleep竞速。
