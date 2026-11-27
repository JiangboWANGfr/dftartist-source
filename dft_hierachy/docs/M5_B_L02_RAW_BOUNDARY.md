# Agent B：L02 原始命令失败补冻与独立基线

日期：2026-10-16。任务 B-M5-L02-RAW-01。
结论：**完成获批窄适配与48项独立输入冻结；20真实模型控制、14浏览器适配控制通过。
生产缺HierarchyTree，48项实际L7语义未执行，不能放行UI/M5。**

## 固定对象、职责与来源

- B工作树 test/m5-tree，起点8efd1cfa742eecaeb35cf5c28e33ce593873f6fd。
- 本人产品仍为2ad2450d7135763a403b642468a682370c21f022，
  /tmp/hier-b-m5-tree-runtime.zM31cP/source；不推进到A新属性契约分支。
- 主DESIGN SHA256 749ff2981dce4b81f8312388a1bc924685d315e7bc1b1738adbd36a4d3b0a795。
  §6.7与受审b753daa逐字相同，13708字节，SHA256
  6a2ec54ba597429c4b3b171cea4af826f337cbd8343bccd644d263ff82d2601c。
- oracle仅依据该规范、C批准B-UI-ADAPTER-01的五项限制、原B公开Transport/模型消费者。
  已读共享A/C摘要，非严格盲验；未查看A新实现/diff/自测资产或C探针来定预期。
- 期间C正式关闭C79/C80并批准§6.9可交B冻结；这是C结论，不是本报告重验或属性输入已经交付。

[计划](plans/B-M5-l02-command-fault.md)、[新集合说明](../web/tests/independent-tree-view/ui/l02/README.md)。
原140输入/所有旧设施/历史文件均不改；新集合单独运行，不偷偷加入旧集合或更改A标准接线。

## 条件、输入与预期

| 输入分区                                                                                       | 冻结判据                                                                                             | 实际边界                                              |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| undefined/null/0/false/空串/冻结对象/有害Proxy × select/loadRoots × absent/capture/throw，42项 | 真实委托成功后直接原值throw/reject；一次真实调用/提交；Object.is身份；零raw反射/getter/coerce/序列化 | 输入已冻，生产语义0执行                               |
| absent                                                                                         | 固定可见“操作失败”；不读raw.message/code或把undefined当无错                                          | DOM判据已冻；AX/读屏另列                              |
| capture                                                                                        | 一次回调、原RowId/原错误；退出动作/方法调用栈后的微任务checkpoint、notificationDepth=0               | 不要求DOM事件冒泡或固定内部微任务链长度               |
| throw undefined                                                                                | 下一render AggregateError；两项均实际拥有，长度2、顺序及Object.is身份精确                            | 显式Object.hasOwn(0/1)，不能以空洞第二项冒充undefined |
| roots异步成功后故障                                                                            | 真实status已消失仍保留启动来源RowId；已提交roots/选择/历史不回滚                                     | 包装刻意产生新Promise，不是原L6/Core拒绝              |
| 两命令×卸载/替换/重挂，6项                                                                     | 不调用旧/新回调、不发布本地/Boundary错误；旧模型真实提交保留，零raw探测                              | 不证明L09–11的原Promise独立消费                       |

每项具体input/expected/basis可由
`node web/tests/independent-tree-view/ui/l02/run.mjs --list`完整枚举。
新关联仅为L02及对应模式L03/L04/L05；不冒称L07原观察者AggregateError或L08预期生命周期取消。
同步select从真实带forward分支的历史开始，核替换选择、旧forward清除、back回原值/forward回新值。
所有finally恢复原descriptor，登记/结算自有Promise，清理真实模型/SDK/page；外层逐项清理browser/server和重绑端口。

## 输入提交与设施验证

| 固定提交                                 | 内容与原因                                                                       |
| ---------------------------------------- | -------------------------------------------------------------------------------- |
| 2eedb50ce3cf32ab6550cb840b3744a78bd4aac8 | 先冻计划、48输入、真实公开方法适配及20控制，再首次执行                           |
| 5e1d2f8cf11d6e0193624aaed9849fcf7c41c902 | 按C既有“两真实条目”要求显式检查own entries，补库存/原442保护核验；不据实现改预期 |
| 2665880b6eb621194e2b04f26a565bf7f59ad1cf | 仅收窄新covers标签，去掉误关联L07/L08；输入/expected/basis/次序完全保持          |
| 152f33af0d8f497144626283acda33430f0d6757 | 归档/固定来源核验工具，不改oracle                                                |

20控制＝十四原值/命令组合、两真实委托先失败、两caller异常finally恢复、
一非法命令拒绝、一已有own descriptor精确/幂等恢复。
真实select观察者AggregateError及真实SDK的not_found/core拒绝均保留，未被注入Proxy覆盖。
真实loadRoots成功后新边界Promise与原返回Promise明确不相等；控制不能证明视图消费了任一Promise。

14浏览器控制只直接调用真实SDK/L6公开命令，不挂假/生产HierarchyTree，也不重写视图反馈算法。
核直接raw身份、所有Proxy trap计数0、真实提交/历史、原descriptor恢复、模型/SDK监听归零。
callback三模式/晚会话等真正L7分支仍未执行，不用这些控制替代产品组件。

## 修改前产品基线与本轮实际命令

命令在B测试树运行，除npm两项在本人固定产品目录。
均显式使用Node24 PATH、HIER_B_PRODUCT_ROOT及本人HIER_BIN；
完整argv/cwd/UTC/退出与stdout/stderr见机器证据，不同集合及重复运行不累加。

| 实际入口                                                     | 退出/结果                                                             | 结论                                         |
| ------------------------------------------------------------ | --------------------------------------------------------------------- | -------------------------------------------- |
| 新adapter.test.mjs，Node --unhandled-rejections=throw --test | 0，20/20，0skip/todo/cancelled；首次和最终均过                        | B适配及真实模型提交控制，不是UI通过          |
| 新run.mjs --self-check                                       | 0，14/14；最终2.824秒，重复执行不加计                                 | 实际浏览器SDK/L6控制，生产UI0                |
| 新run.mjs（固定修改前产品）                                  | **1**；48计划、0生产语义/0skip；首次和最终均缺HierarchyTree           | 能力初红，不称48个语义断言失败               |
| 八文件联合：新20 + 原C77四 + 原C79/C80/C78六文件66           | 0，90/90，8.195秒，0skip/todo/cancelled                               | 原70保持；不与单独20/14重复相加              |
| npm --prefix web run test:independent                        | 0，810/810，3.759秒，0skip/todo/cancelled                             | 原M4/M5/实际Core相关回归；不包含本次48生产UI |
| npm --prefix web run check                                   | 0，5.540秒；195生成定义/27方法、四包类型、31模块/72依赖、七分层负探针 | 原增量工具链，不声称force全重建              |
| 新verify-inputs.mjs、原run.mjs --list                        | 0；新48；原442文件字节保持；原140枚举42609字节                        | 新旧库存分开，不是UI覆盖率                   |
| 原verify-coverage.mjs                                        | 0；95条件/140输入/8手工步骤                                           | 原pending-C输出保留历史，不代表C尚未批准适配 |
| 原c79-verify-history.mjs                                     | 0；旧UI32/C78十六/C80十完整捕获及27/10/6固定来源，后续差异4/2/0保持   | 历史核验，不冒记为重跑旧语义                 |
| 新fixture esbuild、Prettier、diff空白及归档核验              | 0；bundle零warning；21完整捕获与12来源核验通过                        | Node/浏览器fixture编译，不称原生新编译       |

C78原七个实际资源worker仍各启动两个本人Core/待poll；正常退出0、六故障非零，
在补救前核进程/poll/页面/浏览器/server回收及端口重绑，报告保持完整。
本次L02三次browser控制及三次能力门禁各自均browser断开/server停止、端口可重绑、cleanupErrors=[]。
L02本身不启动Core。结束资源审计无本人遗留Core。

## 来源、兼容与保护

原442 B文件全部保持；旧140完整枚举SHA256
6f2333cf262f6a74e1675780d708bc32bba598850491eb3ade7c1791a7fb832d不变。
最终新48枚举26731字节，SHA256
c7cc9e75d6a2302d4da51d59a3f64d1d79133c23beceed55f7b3ddb4389111a2。
早期29131字节枚举及能力初红均保留；归档核验器逐项确认metadata之外的输入/预期/依据/次序不变。

303项固定产品Core/生产包/Schema/构建/锁相关文件与2ad2450 Git逐项同字节，产品干净。
复用本人既有三份Core，字节/本轮起点SHA保持：普通9323240 /
0e7f24f54aa619414811357c3388fd06cb919215099cc8381f87c4dd87400e6a，
Debug48368088 / 8e0be50b04f605ad5bf31adf392b1bb9532e7d4a47cb3c92ea757c7232a0f58e，
ASan38596680 / 21aa1003240cc40f3aea1a59366731e8aec255496db100bec201844b9e6b2c28。
无native重编、完整check.sh/75-78-80/Schema语料/独立268入口重跑；不冒记前轮结果或新原生warning结论。

Node24.21.0、npm10.9.2、TS5.9.3、React18.3.1、本人Chromium156.0.8078.4/macOS arm64。
使用browser技能：首选执行接口检索不可用并告知后，沿其回退流程使用B隔离Playwright；
未借A/C二进制、缓存或浏览器状态。该技能影响的是浏览器验证路径，不改变测试预期。
主日志领取前1270363字节前缀SHA
4b69033fe5b45f1b3094d4e2a42c8386adbbc684df375adcd99edfb249c18ae2保持；
主树原REVIEW_LOG/coordination/research三类未提交项保护，日志只追加不提交。

未改生产API/ABI/IPC/Schema、配置/格式、依赖/锁或前序产品模块。
首版无保存恢复/旧格式迁移/计划编辑undo-redo；本轮只涉及选择导航历史。
SDK/公开Transport不是Electron IPC；没有新增保存格式或虚构兼容路径。

## 证据与交接

[完整机器档](m5_b_l02_raw_boundary.json)：SHA256
**9798f8eb5c894a9138d448d86a4c1c975a56c5104c16c7bc1a6db59d1a17dd6c**，
21条命名完整捕获338523原字节/52338gzip字节、12个当前/历史Git来源。
完整解压/长度/SHA/退出、原值控制/真实报告/原140/303来源核验均0；
不是所有探索工具调用档。[后检档](m5_b_l02_raw_boundary_archive_checks.json)另记录归档/格式/空白三条完整捕获，
472原字节/398gzip字节，全部0；最终文件SHA256
b06c355bb6207e13b3fb41ca54778bb63c59bdb161f8e588b6547945d5051d99，另核解压/长度/hash通过。

交C：核新公开方法窄适配是否遵守获批限制，尤其先真实提交、真实失败不覆盖、新Promise标签、
零raw探测/两实际entries、来源RowId和晚会话/descriptor finally恢复。生产缺组件，不能据此关闭L7验收。

交A：可原样吸收独立输入/设施/报告，不必迎合未规范DOM。
新集合未擅自接入标准入口；生产交付后应实际执行48条，能力红必须保留直到真实导出出现。

下一独立B单元可按C已通过§6.9冻结实例属性；不读取A新见证作oracle。
L06强“不await”、L09–11原Promise消费、Electron独立冻结仍未补；
140/48生产UI、实际AX/读屏、PropertiesPanel/M5、真实设计/M7、Linux/远端CI/覆盖率均未放行。
当前没有新规范歧义或确认的新产品缺陷，不新增编号、不自行关闭C条目。
