# §6.9 属性合入版：B原样复验

B-M5-PROPERTIES-INTEGRATED-RETEST-01，2026-10-16。

**固定`462304d0f5ecbaa6547af661b436c8a0296f1854`原样独立复验通过：标准810+281+5=1096项，0skip。**
本人新隔离源码没有上一轮的测试overlay；冻结仍为`c2c0facbd03449e3ed16dc3015ccb6a01edeab14`，不改oracle或生产代码。
这补齐合入版实际执行证据，不是复用9a415f6+overlay的旧通过，也不是M5/UI/Electron整体放行。

## 依据及合入身份

依据已受审DESIGN §6.9/§6.6.6、已通过的subscribe释放补文及B冻结输入。
当前DESIGN SHA256 `9f084b387564bdd7c24c1030c1a10fe63cb4f9c944e1e888b446c8786b760f22`；
相对9a415f6只有五处审批/实施状态替换，完整规范正文按精确替换核同，未重新定义预期。
已读共享A/C摘要，非严格盲测；未以A实现或自测归档、C临时控制定oracle。

三组B原始提交与导入的mode/blob/path delta逐字节相同：

| B原始   | A导入                                    |
| ------- | ---------------------------------------- |
| 235d19d | 018b8b0e5d774475dded3d14a03732897cf8b8d9 |
| c2c0fac | e68f0a735bc154db99308d3423858d63908c476a |
| cdeb7b6 | 99c5118fbf359503e7a3f75e3365fd9bd3da4931 |

11个B交付文件与cdeb7b6原blob完全相同。
Core、protocol、全部web/packages、web/scripts、package.json/lock、tsconfig.json及check.sh与9a415f6的Git对象一致。
本轮只新增B复验报告、计划、档案/核验器，无生产API/ABI/IPC/Schema/依赖/锁/工程格式变化。
原[验收映射](M5_B_INSTANCE_PROPERTIES_ACCEPTANCE.md)、[冻结及初红](M5_B_INSTANCE_PROPERTIES_FREEZE.md)、
[上一轮复验](M5_B_INSTANCE_PROPERTIES_RETEST.md)保留；没有删测试、放宽、skip/xfail、假Model或私有hook。

## 本人构建与实际命令

独立产品`/tmp/hier-b-m5-properties-integrated.7nVDlB/source`，固定462304d；Node24.21.0/npm10.9.2/TS5.9.3。
仅复用第三方源码与本人第三方node_modules，workspace链接指向新产品，四包强制重建；不跨工作树复用产品二进制。
新Unix Makefiles/RelWithDebInfo，M3/FUTURE ON、observer OFF；hier及生产依赖新构建82.101秒、0 warning行。
不是native全目标、CTest或三配置构建；A完整check.sh的执行不计入B本轮结果。

```sh
export PATH=/Users/jiangbowang/.npm-global/bin:/opt/homebrew/bin:/usr/bin:/bin
export HIER_B_PRODUCT_ROOT=/tmp/hier-b-m5-properties-integrated.7nVDlB/source
export HIER_BIN="$HIER_B_PRODUCT_ROOT/core/build-verify/hier"
export HIER_SCHEMA_PYTHON=/tmp/hier-b-m4-schema.UweewL/bin/python
```

以下在本人产品根运行。精确argv、cwd、UTC、退出码、完整合并stdout/stderr在机器档中，非仅摘要。

| 实际命令                                                                                                                                                                        | 结果                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 导入/来源/规范Node断言                                                                                                                                                          | 0，三组delta/11文件/八组生产与接线对象/五处状态替换核同                             |
| `npm --prefix web run typecheck -- --force`                                                                                                                                     | 0，四包完整TS重建                                                                   |
| `cmake -S core -B core/build-verify -G 'Unix Makefiles' ...`及`cmake --build core/build-verify --target hier -j 4`                                                              | 0/0，完整配置参数见档案                                                             |
| `npm --prefix web run test:independent:m5:properties`                                                                                                                           | 0，281/281，正例零诊断、22真实类型负例拒绝、平台类型依赖0                           |
| `npm --prefix web run test:independent:m5:properties:core`                                                                                                                      | 0，5/5真实Model→SDK→Node→本人Core                                                   |
| `npm --prefix web run test:independent`                                                                                                                                         | 0，逐段810/810、281/281、5/5，0skip/fail/cancelled/todo；22类型负例另计             |
| `npm --prefix web run test:independent:m5:tree`                                                                                                                                 | 0，287/287及35+14类型，保持共享诊断旧消费者                                         |
| `npm --prefix web run check`                                                                                                                                                    | 0，195定义/27方法、34模块/88依赖和7分层负探针                                       |
| `npm --prefix web run test:schema`                                                                                                                                              | 0，655结构/登记检查、27参数规范化；失败/skip/缺失方法均0                            |
| `node --unhandled-rejections=strict --test --test-reporter=tap web/tests/independent-properties/fixture-check.test.mjs web/tests/independent-properties/core-controls.test.mjs` | 0，16/16=13 SDK控制+3 Core控制，不等于模型Core5                                     |
| `run.mjs --list`、`core-runtime.mjs --list`、`verify-inputs.mjs`（均在independent-properties目录）                                                                              | 0，281/5库存与上轮完整枚举逐字节相同，input/expected/basis保持                      |
| `node web/tests/independent-properties/verify-retest-evidence.mjs`                                                                                                              | 0，核旧33捕获/28pin及历史失败，不增加新语义执行数                                   |
| 串行全部输入/进程审计                                                                                                                                                           | 0，703跟踪文件匹配目标，产品clean/overlay0，无本人Core遗留；原B480及其中旧454均保持 |

Tree、真实Core子集和重复入口有重叠，不累加成新总数。SDK/Node/Core不等Electron IPC。
本人新hier 9326152字节，SHA256 `ac58e88d5031ab22a36bde4e1dba344ee90c1a21146462a4b1ec8b5b1792ce38`。
产品703项文件映射SHA256 `279f4be58feb1e1e34f5d1fdb21398be9314aacb764f4395f201607b6ebf19df`。

## 完整证据

[机器档](m5_b_properties_integrated_retest.json)：16份命名完整捕获，全部退出0；原始288564字节/gzip44603字节，25项固定源码pin。
SHA256 `327a7e45ff306e5745e6d67966157b62cac5688ed126ac6ca8475e24fb659da5`。
它是命名入口的完整记录，不声称包含所有探索工具调用；本轮全绿不抹去旧失败。
新281枚举仍85658字节/SHA52e8c231…，Core5仍1391字节；原252 metadata及历史初红保持。

```sh
node web/tests/independent-properties/verify-integrated-evidence.mjs
```

[核验器](../web/tests/independent-properties/verify-integrated-evidence.mjs)已退出0，核解压长度/hash、分段运行和类型诊断、输入一致性、
导入/来源与历史档案保持；只验档，不运行模型。收尾格式/归档/diff检查另存
[archive checks](m5_b_properties_integrated_retest_archive_checks.json)，不混入16份产品运行。

## 限制与交接

本轮是固定合入版独立复验，不新建契约等待，不代表整个M5验收。
未重复完整check.sh/native全目标/CTest/Debug/ASan、C++654独立重放；没有UI/AX/读屏/Electron、真实大设计/M7、Linux/远端CI结论。
首版保存恢复/旧格式迁移、计划编辑undo-redo不适用；原L06/原view Promise/Electron等前置保持。
C-81仍另一修订单元，未在此修复/关闭；不因属性单元通过推导真实root身份已补齐。

交A：固定462304d的原样合入/标准1096已获B本次验证，不需修改生产或再次请求运行时契约批准。
交C：使用本固定提交与分段证据完成其独立评审，新增29项oracle的最终状态以C在REVIEW_LOG的结论为准；B不代C关闭意见。
