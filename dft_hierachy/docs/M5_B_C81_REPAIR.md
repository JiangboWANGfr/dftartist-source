# Agent B：C-81独立修订与冻结

冻结 **4b341810a813b692cd11c51e49215c8c5efc2772**，B基线ee0b4a3，产品固定7a8b4e102093edf71d07fd096aab8bf28a4884c4。
依据受审DESIGN §6.7.1/6.7.3和C-81，不以A实现/diff/自测定义期望；已读共享评审摘要，不是严格盲验。
**测试设施已修订，交C复核，不自行关闭C-81；生产UI仍未验收。**

## 行为与见证

replace不先卸载，在已有root上render新模型；unmount销毁，remount销毁后仍以旧模型新建root。
fixture用无DOM/命令副作用的真实React父Frame记录useState token及useLayoutEffect挂载/清理；
root由fixture自有WeakMap标识，无React私有字段、产品测试hook、反馈或取消算法复制。
这是宿主的实际挂载先决条件，不是对生产函数组件内部实例身份的观察。

六条既有late用例新增见证断言：replace前后root/token相同、一次挂载/零清理且模型已换；
remount均不同、两次挂载/一次清理且仍旧模型；unmount之后二者null。
真实生产用例的原值身份、提交/历史、旧新回调零次、无本地/Boundary反馈、零raw探测、精确恢复断言未删除或放宽。
48项input/expected/basis/顺序输出逐字保持；原140及历史报告/失败保持。

## 实际执行（Node24.21.0 / macOS arm64）

命令从B树执行，产品参数明确为`HIER_B_PRODUCT_ROOT=/tmp/hier-b-m5-c81.rQznJp/source`。
该树从固定7a8b4e1新建且clean，离线安装71开发包、自有四包TS构建；不借其它工作树产品构建或Core二进制。

| 命令/输入                                                                    | 实际结果                                                                                             | 判断边界                                                                 |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `node --test web/tests/independent-tree-view/ui/l02/c81/transition.test.mjs` | 修前2过1败/退出1；冻结后3/3、0skip/退出0                                                             | 原样实际transition函数的宿主调用顺序                                     |
| `node web/tests/independent-tree-view/ui/l02/c81/run-controls.mjs`           | 修前4过2败/退出1；冻结后6/6/退出0                                                                    | Chromium156.0.8078.4真实React标记宿主，不是假HierarchyTree或真实模型命令 |
| 既有`l02/adapter.test.mjs`，`--unhandled-rejections=throw --test`            | 20/20、0skip/退出0                                                                                   | 真实SDK/L6故障适配及原descriptor恢复                                     |
| 既有`l02/run.mjs --self-check`                                               | 14/14/退出0                                                                                          | 真实浏览器SDK/L6控制，不是产品48语义                                     |
| 既有`l02/run.mjs`生产入口                                                    | 退出1，缺HierarchyTree，48计划/0语义/0skip                                                           | 能力红保持，未伪造48条逐项失败/通过                                      |
| 既有`l02/verify-inputs.mjs`及`run.mjs --list`                                | 均0；442原文件、140原枚举保持；48枚举仍26731字节/SHA c7cc9e75…                                       | 来源/库存不是语义执行                                                    |
| 固定产品`npm --prefix web run check`                                         | 0；四包TS、195定义/27方法、34模块/88依赖、7分层负探针                                                | 不是Core构建或UI验收                                                     |
| 固定产品`npm --prefix web run test:independent:m5:tree`                      | 287/287、0skip及35+14类型负例/退出0                                                                  | 受影响前序L6回归，不计为C-81产品UI                                       |
| B来源审计                                                                    | 0；485个既有跟踪文件仅fixture/cases/runner三项授权修改，另482保持；八个冻结测试文件与4b34181逐字相同 | 历史归档/旧140/旧fixture文件未改                                         |

修前两个replace实际观测root1→2/token1→2、挂载2/清理1；修后root1→1/token1→1、挂载1/清理0、新模型。
unmount/remount正对照均保留。所有浏览器入口cleanupErrors为空、浏览器断开、server停止、原端口可重绑；无新增bundle warning。
这些检查不构成通用堆内存无泄漏证明。重复运行不累加测试数。

完整命名捕获和修前fixture压缩文本见[m5_b_c81_repair.json](m5_b_c81_repair.json)。
该档不是全部探索终端全录；一次编排JS语法错误未启动命令，一次最终空增量输出没有被当作完整捕获，已按相同冻结重跑并保留说明。
在B树执行`node web/tests/independent-tree-view/ui/l02/c81/verify-evidence.mjs`核解压长度/hash、预期非零、资源、48红及八源码pin；它只验档。

## 兼容、限制与交接

仅B测试设施/报告，不改产品、M0–M4规则、API/ABI/IPC/Schema/工程格式/依赖锁；首版无保存恢复或旧格式迁移。
本轮未重跑1096属性/全集、Core三配置、90联合/Core worker、原140生产语义、AX/读屏/Electron/M7/大设计/Linux/远端CI。
L06强观察和L09–11原Promise消费依旧独立未解决；零unhandled不能填补它们。
交C审查本冻结及两类初红/挂载见证后决定C-81关闭；交A原样吸收，不据设施3/6/20/14宣称生产UI或M5完成。
属性单元既有B/C通过保持；Source新契约需其对应审查/冻结，不以A领取或移动HEAD作为已交付。
共享REVIEW_LOG只追加、不提交，A正在写的Source/计划等脏项全部保护。
