# C-81：同挂载模型替换的独立修订

依据 DESIGN §6.7.1/6.7.3 与 REVIEW_LOG C-81；不从生产实现或输出定义期望。
原48项 input/expected/basis/顺序、原140及历史证据保持；只修宿主转换并强化六项前置断言。

| 输入（select微任务 / loadRoots持有回复） | root / React父Frame        | 模型                 | 预期清理             |
| ---------------------------------------- | -------------------------- | -------------------- | -------------------- |
| unmount                                  | 均销毁，当前identity为null | 旧模型由宿主继续拥有 | 一次清理、无新挂载   |
| replace                                  | root与Frame挂载token保持   | 换新模型             | 零清理、仍一次挂载   |
| remount                                  | root/token均更换           | 仍旧模型             | 一次清理、第二次挂载 |

Frame只返回children，用React公开useState/useLayoutEffect记录宿主实际生命周期；不读React内部，
不观察或规定生产HierarchyTree内部实现身份。无key/类型变化地包住原uiElement，只提供先决条件见证。
root的WeakMap ID、旧新模型身份和effect计数均先在浏览器内比较，只输出安全标量。
原错误身份/真实提交/历史/旧新callback零次/无本地或Boundary反馈/零raw探测/finally恢复断言全部保留。

Node24，从B测试树运行：

```sh
node --test web/tests/independent-tree-view/ui/l02/c81/transition.test.mjs
node web/tests/independent-tree-view/ui/l02/c81/run-controls.mjs
HIER_B_PRODUCT_ROOT=/absolute/B/fixed/source node web/tests/independent-tree-view/ui/l02/run.mjs --self-check
HIER_B_PRODUCT_ROOT=/absolute/B/fixed/source node web/tests/independent-tree-view/ui/l02/run.mjs
```

前三个设施层次分账：Node3项宿主调用；真实React/Chromium6项标记宿主转换；既有14项真实SDK/L6故障适配。
六项标记宿主只执行原样抽取的实际transition函数；select/loadRoots在这里仅区分触发调度方式，不是假称执行模型命令。
它不替代生产组件、实现反馈/拒绝算法或计入48项产品语义。原20项Node适配控制另保持。
修前3项为2过1败，6项为4过2败；两条replace都实际root1→2/token1→2、清理1次，非同挂载。
修后分别3/3和6/6；生产仍缺HierarchyTree时最后入口必须非零，48计划/0语义/0skip。

C-81关闭归C。L06强观察、L09–11原Promise消费、Electron/AX/读屏与M5整体验收仍未由本设施证明。
无生产API/ABI/IPC/Schema/依赖锁/工程格式变更，无保存恢复/旧格式迁移；不重开已通过属性单元。
