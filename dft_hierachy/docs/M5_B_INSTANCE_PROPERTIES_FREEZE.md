# §6.9 实例属性：B独立冻结与初始基线

B-M5-PROPERTIES-FREEZE-01，2026-10-16，分支`test/m5-tree`。

**最终测试冻结：`c3103c68ba555cc8c0a5b93365a22c5eabc73228`。**
已冻结252项模型运行时输入、5项真实Core模型集成输入、严格类型消费者及22项类型负例。
修改前产品缺少新导出：模型、Core模型入口、生产类型均退出1；模型语义实际执行0项。
这不是257项业务断言失败，也不是模型通过、实现验收或M5放行。对应B独立冻结及初红已交付A，
不再等待C-81；后续报告归档不改变冻结SHA。

## 依据、独立性与覆盖

依据已获C通过的DESIGN §6.9及继承的§6.6.6，不以实现输出决定正确性。
规范全文SHA256 `749ff2981dce4b81f8312388a1bc924685d315e7bc1b1738adbd36a4d3b0a795`；
§6.9文本SHA256 `9a992b3f6bd62f61fd5e4612736f1891712d258df18e9444d9009ce94cc7b90b`，
与受审`68955ff5f514622d8187ba182130bdac98b2cf79`一致。
只读该固定提交的公共`m5-instance-properties.d.ts`供B自写类型消费者编译。
已读共享A/C日志摘要，因此不自称严格盲测；未用A新实现、diff、消费者、SDK见证或自测归档定oracle。

[验收映射](M5_B_INSTANCE_PROPERTIES_ACCEPTANCE.md)记录需求、观察边界及规范依据；
[运行说明](../web/tests/independent-properties/README.md)提供入口与资源所有权说明。
每项稳定ID、input、expected、basis由两个`--list`完整枚举，并保存在机器证据中。

| 分区                           | 模型输入数 | 主要验收                                                                            |
| ------------------------------ | ---------: | ----------------------------------------------------------------------------------- |
| construct / input              |     3 / 15 | 构造不工作、固定快照、无强转、非法输入原子性                                        |
| data / tasks                   |      8 / 9 | get先行、同signal的ports→params、完整原子发布、原Reply事实、join/retry/reload/cache |
| lifecycle / errors / ownership | 35 / 7 / 4 | 任一阶段取消/清空/释放、首错和原错误身份、共享SDK/另一模型不被关闭                  |
| notifications / promises       |     34 / 4 | 聚合顺序/cause、重入、dispose优先、listener不被await、L6丢弃原Promise               |
| diagnostic                     |        133 | 精确读取失败、零raw探测、函数/循环/共享/稀疏数组所有权、诊断中释放和订退阅          |

另5项真实Core模型输入覆盖B独立SV、原事实保留、错误重试、SDK存活、两模型及重开快照。
严格类型22负例检验Reply/ResultOf、readonly状态联合、错误词汇及exact optional。
原Tree/Selection/M4覆盖不能代替这些新模型条件；新增入口不偷偷接进原810项统计。

测试调用真实HierClient及原B公开Transport，不补假Model、不读私有调度、不加生产hook。
方法观察委托原公开方法并保留Promise/Reply/Error身份；诊断数据经真实HierError及Transport.onClose送达。
独立SV固定同定义W=2/6、localparam/type参数和空实例；宽度/flags是独立已知答案，
参数展示文本只要求保留Core原文，不自行规定十进制拼写。

## 提交顺序与设施修正

先提交输入，再执行初始基线；设施自检发现的问题独立提交，原始失败不覆盖。

| 提交                                       | 内容与边界                                                                                                     |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `7bce75c76cca0e161ea2cc818d46fc25ead72533` | 首次独立冻结、计划和验收映射                                                                                   |
| `371920e856547f3616dce809dda01c7cf1c93bb9` | 两条类型负例注释落点适配。首次提案编译4诊断；改为对应属性类型变量，非法origin/裸ports值及拒绝预期不变          |
| `456368d1a6d9060058de56cb7de1539ad19aec6d` | constructor原错误观察改为同次真实snapshot getter委托，避免错误要求两次独立读取异常身份相等；增加1项真实SDK控制 |
| `c3103c68ba555cc8c0a5b93365a22c5eabc73228` | 复用原B安全失败格式化；实际检查编译源平台类型依赖而非写死计数；不改输入/业务预期                               |

初次与最终252/5输入枚举逐字节相同。模型能力始终缺失，未根据A实现修改语义oracle。
初次15项控制与最终16项重叠，不能相加；新增1项是公开getter观测控制，不是模型通过。

## 实际命令与结果

环境：Node24.21.0、npm10.9.2、TypeScript5.9.3，使用显式Node24 PATH；不安装依赖。
所有命令的精确argv、cwd、UTC时间、退出码及完整合并stdout/stderr在机器证据中。
运行前设置本人固定产品与普通Core：

```sh
export HIER_B_PRODUCT_ROOT=/tmp/hier-b-m5-tree-runtime.zM31cP/source
export HIER_BIN="$HIER_B_PRODUCT_ROOT/core/build/hier"
export PATH=/Users/jiangbowang/.npm-global/bin:/opt/homebrew/bin:/usr/bin:/bin
```

以下相对测试入口在B工作树运行；`npm --prefix web`两条在本人固定产品根运行。

| 实际命令                                                                                                                                                                        | 退出码 | 实际结果                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -----: | -------------------------------------------------------------------------------------------- |
| `node web/tests/independent-properties/run.mjs --list`                                                                                                                          |      0 | 252项，初始/最终枚举相同                                                                     |
| `node web/tests/independent-properties/core-runtime.mjs --list`                                                                                                                 |      0 | 5项，初始/最终枚举相同                                                                       |
| `node web/tests/independent-properties/verify-inputs.mjs`                                                                                                                       |      0 | 唯一ID及input/expected/basis库存校验                                                         |
| `node web/tests/independent-properties/run.mjs`                                                                                                                                 |      1 | 缺InstancePropertiesModel；计划252、执行0、skip0、results空                                  |
| `node web/tests/independent-properties/core-runtime.mjs`                                                                                                                        |      1 | 相同能力缺失；计划5、执行0、skip0，能力前不启动Core                                          |
| `node web/tests/independent-properties/verify-types.mjs production`                                                                                                             |      1 | 6项TS2305缺新增导出，加22项级联unused expect-error；负例实际执行0，不能算22项成功拒绝        |
| `node web/tests/independent-properties/verify-types.mjs proposal`                                                                                                               |      0 | 最终自写正例零诊断，22负例真实诊断；编译源Node/React/Electron平台类型依赖0，不等生产导出通过 |
| `node --unhandled-rejections=strict --test --test-reporter=tap web/tests/independent-properties/fixture-check.test.mjs web/tests/independent-properties/core-controls.test.mjs` |      0 | 最终16/16，13真实SDK/公开访问器控制+3独立SV/Core控制；fail/skip/cancelled/todo均0            |
| `npm --prefix web run test:independent`                                                                                                                                         |      0 | 原810/810；fail/skip/cancelled/todo均0，不含新增模型语义                                     |
| `npm --prefix web run check`                                                                                                                                                    |      0 | 生成/类型/分层门禁；195定义/27方法、4包、31模块72依赖、7项分层负探针；增量tsc-b而非全新构建  |
| Prettier / 串行范围来源审计                                                                                                                                                     |      0 | 冻结输入格式通过，原454项/产品303项身份和本人二进制保持，最终产品clean、无本人遗留Core       |

生产出口另行实测：InstancePropertiesModel/Error均undefined；TreeModel/SelectionModel仍为function。
三个真实Core控制已执行宽度/参数flags、非实例ref拒绝、重开快照及子进程正常退出；
这只能证明设施/既有SDK-Core链，不证明新模型取消、通知、诊断或资源释放已通过。
测试实现有finally回收及死锁watchdog，不把watchdog当产品SLA，也不把未执行路径称为已见证。

## 固定来源与保护

B起点`3db2ee42713449373e8953b2e2e0edef691dbd06`的454项文件逐字节不变，含旧L02/C-81及其历史证据。
产品固定本人`2ad2450d7135763a403b642468a682370c21f022`；303项生产/Core/Schema/构建/锁输入与既有B来源逐项相同。
最终输入映射SHA256 `2fb926a53f9830390e1917cbda7f33850e30e5900fb033c8790d708142dc7d18`。

| 本人既有Core |     字节 | SHA256                                                             |
| ------------ | -------: | ------------------------------------------------------------------ |
| normal       |  9323240 | `0e7f24f54aa619414811357c3388fd06cb919215099cc8381f87c4dd87400e6a` |
| debug        | 48368088 | `8e0be50b04f605ad5bf31adf392b1bb9532e7d4a47cb3c92ea757c7232a0f58e` |
| asan         | 38596680 | `21aa1003240cc40f3aea1a59366731e8aec255496db100bec201844b9e6b2c28` |

本次真实Core控制只运行normal，不冒称重跑三配置Core单测。未借A/C构建、缓存、二进制或浏览器。
并行门禁期间一次范围记录productClean=false，303项输入/二进制身份仍相同，但未捕获当时脏路径；
不能推断具体原因。原记录保留。门禁结束后的严格串行审计确认产品status空、303项不变及无本人Core，退出0；
不将“最终clean”改写成“始终clean”。

## 完整证据与复核

[机器归档](m5_b_instance_properties_freeze.json)：28份命名完整输出，原始281003字节，gzip39463字节，20项固定源码pin。
SHA256 `6b2e3ab84e71e3695ca3cfce3b222cbef2f7c017417fc70cc6a0cdd322cf0546`。
包括首次提案4诊断、能力红、最终正负类型、16控制、810回归、web门禁、原始/最终范围观察，非仅摘要或尾部。
它是这些命名入口的完整捕获，不声称穷尽所有探索命令。

252项枚举75679字节，SHA256 `cde21ad8baad5e660aadaafad07b6239a1f18bc57520585fa5916e4cb98a5dce`；
5项Core枚举1391字节，SHA256 `99c074b6c10478305591eacc54ab54a1f60966912eae080b4a6e4357e561d062`。
[独立归档核验器](../web/tests/independent-properties/verify-evidence.mjs)验证解压长度/SHA、退出码、
能力红的0执行边界、完整枚举一致性、类型/控制/回归计数及源码pin。

```sh
node web/tests/independent-properties/verify-evidence.mjs
```

该核验器已退出0；只核档案，不执行模型。归档收尾的检查另存
[archive checks](m5_b_instance_properties_freeze_archive_checks.json)，不混入28份原始运行数或改变冻结输入。

## 限制、歧义和交接

§6.9未明确disposed模型上同步subscribe的精确错误及其与非法listener的优先级，单列请C/A澄清；
不挪用Tree行为猜答案，不阻塞已明确的异步disposed规则或本冻结。
裸ObjectRef无快照来源标签；不要求识别不可观测的相同字符串来源。
未知width=0/interface/复合事实用合法Schema输入覆盖，不冒称本轮真实Core未知blackbox运行。

本单元只新增独立测试/文档/证据，不改生产API/ABI/IPC/Schema/依赖/锁/工程格式/标准接线。
不适用首版排除的保存恢复、旧格式迁移、计划编辑undo-redo。
未运行新native全构建、完整check.sh/Core全套/Schema corpus/真实设计/M7/Linux/远端CI或覆盖率统计。
无PropertiesPanel、React/Electron IPC、浏览器、AX/读屏结论；SDK→Node→Core不等Electron IPC。
L6丢弃原模型Promise输入不等未来L7原view Promise消费。

交A：用最终冻结SHA按已通过§6.9实施，公共诊断纯抽取与行为分提交，保留Tree/Selection回归；不得据库存宣称实现通过。
交C：优先审oracle/真实公开Transport、访问器观测、通知/诊断释放边界和证据分账；只有C关闭其意见。
交B后续：在A固定实现提交上原样复验，再单独修订C-81的replace/remount及真实root身份见证；
本次C-81未修复、未关闭，原L06/Promise/Electron等限制保持。
