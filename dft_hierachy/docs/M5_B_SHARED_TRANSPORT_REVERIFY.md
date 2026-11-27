# B-M5-SHARED-TRANSPORT-01：固定8d9c334复验

结论：本轮M4既有行为的独立复验通过；不等于M5 UI/Electron放行。
产品固定8d9c33421693bf39288051e8ab39583d0b13d13a，归档2563cdcc仅作对象元数据。
DESIGN全文SHA256为36fd76c2b0df8f44827644ff045c789ce5175bb5be39f27d20dba1816f542de0。

## 独立性与来源

Agent B / test/m5-tree，起点c9256dd，计划f48ed1d。
以DESIGN §5.6.2/.5/.6/.7、§6.8和原B冻结为oracle；未读A实现/diff/新增自测/机器证据或C探针。
已读共享REVIEW_LOG的实现摘要，因此不是严格盲验。结构相同、单一实现及新内部解码器的源码审查归C。

新增输入初冻8459f9cb4a003ceb4d5e3a40758bdadcb6372e4b；
记录夹具修正后的固定输入464f83aa513512036fb1b0c3eab43688fbf95851。
[输入与限制](../web/tests/independent-transport-sharing/README.md)、
[测试](../web/tests/independent-transport-sharing/compatibility.test.mjs)、
[独立realm控制](../web/tests/independent-transport-sharing/realm-controls.mjs)。

本人运行树/tmp/hier-b-m5-tree-runtime.zM31cP/source从原2003dc0固定推进到8d9c334。
推进前后247项Core/protocol/构建/锁Git mode/type/blob逐项相同，48项原运行输入相同，
B起点全部399跟踪文件字节保持。仅复用本目录本人既有三配置Core；没有fresh native编译或借A/C产物。
目标TS执行`npm --prefix web run typecheck -- --force`，成功重建；Node24.21.0、TS5.9.3/macOS arm64。

## 新增验收输入与预期

| 输入                                 | 预期/判断依据                                                                                  |
| ------------------------------------ | ---------------------------------------------------------------------------------------------- |
| S01：公共main/node运行导出           | 原基线分别3/1项，纯重构不新增生产导出                                                          |
| S02：公共入口声明                    | 原基线index.d.ts 381字节、node/index.d.ts 587字节及SHA保持；额外产物稳定检查，不是通用兼容判据 |
| S03：browser bundle在独立realm加载   | globalThis的Buffer/process/require/module均undefined；真实SDK和原私有inbox可执行               |
| S04：异步绑定、重复绑定、队列        | FIFO，首投递异步，唯一接收者；重复绑定为真实HierError bad_request/client                       |
| S05：队列首投递前close               | 缓存不再投递，late push返回false                                                               |
| S06：首投递前unsubscribe再绑定       | 取消后不投递，但不恢复绑定所有权                                                               |
| S07两项：256/257个小帧               | 全部有序交付，不提前误作溢出、掉帧或关闭                                                       |
| S08：首实际交付后4MiB+1 UTF-8负载    | 初始缓冲上限解除；使用真实计数字节，不以小对象冒充                                             |
| S09：缓存hello→真实SDK roots→dispose | complete空列表；订阅释放，后续请求disposed/client                                              |

共10项：S07有两个边界输入。没有导入A新内部模块路径或新生产钩子，Transport是受控B夹具。
隔离VM不是真实浏览器/Electron/IPC或安全沙箱证明；原始整数词法证据由原119项真实Node reader/SDK输入覆盖，
不以跨realm解析对象或JSON.stringify冒充原文本证据。

## 基线、失败与目标结果

修改前2003dc0：原raw119+私有27共146/146通过。
新增初版9/10，唯一失败为S03的词法`typeof require`被esbuild改写成本地动态require shim，
不是host global。B在推进产品之前改为`typeof globalThis.require`等，并加入未打包realm直接检查，
undefined预期不变；原冻源和失败完整保留。修正后旧基线10/10，目标10/10。
新增没有“功能尚未实现”的M4红；本轮纯内部重构，兼容输入应在前后都绿。

| 本轮目标执行            | 实际结果                                        |
| ----------------------- | ----------------------------------------------- |
| 新兼容/realm            | 10/10                                           |
| 原raw119+私有27         | 146/146                                         |
| 原M4协议集合            | 258/258                                         |
| 原B独立全量             | 800/800                                         |
| 选择/树专项及类型       | 241、287运行通过；33、35+14类型及合法消费者通过 |
| 真实SDK→Node→Core三配置 | 每配置原B14/14；不是Electron                    |
| 普通Core CTest          | 75/75，54.32秒                                  |
| Debug Core CTest        | 78/78，118.91秒                                 |
| ASan+UBSan Core CTest   | 80/80，433.36秒                                 |
| Schema/参数规范化       | 655（569结构+86元数据）与27通过                 |
| web check               | 生成、四包类型、分层检查及7个负探针通过         |
| C++生成静态检查         | 195定义/27方法通过                              |
| 已知UI能力红            | 退出1；HierarchyTree尚未导出；零生产UI语义执行  |

146/258/241/287和默认Core14与800有包含关系，不相加；新10另列，前后重复不算20个不同输入。
原生三配置只执行本人已有产物的回归，非本轮编译、冷构建或性能SLA；每组`ctest -j 1`，三组并行。
普通observer OFF，Debug/ASan ON，M3/FUTURE均ON，ASan HIER_SANITIZE=ON。
没有本轮编译warning统计；不冒称ESLint或完整check.sh/A新增29项执行。

## 证据与交接

[机器证据](m5_b_shared_transport_verification.json)保存27条命名捕获：完整argv/cwd/退出码、
279851原字节、61388 gzip字节，包含最初B夹具失败和既有UI能力红，非tail拼凑。
固定来源清单与完整审核程序也保存在捕获内，不声称嵌入全部产品源码。
52项固定Git来源校验通过；归档SHA256为9daf14b186b656922022a7a7d9235c2e6d6f472d509c5b1415a25c97f463e38e。
[后检记录](m5_b_shared_transport_archive_checks.json)另保留验证器首跑路径多退一层的ENOENT及修正后退出0，
只改B验证工具定位，不改归档、产品或预期，避免归档自引用。
[验证器](../web/tests/independent-transport-sharing/verify-evidence.mjs)逐份解压/长度/SHA核对，并校验固定Git来源：

```sh
node web/tests/independent-transport-sharing/verify-evidence.mjs
```

产物/来源仍固定：Core及构建输入247项、原运行输入48项、B起点399项；主运行树干净。
生产API/IPC/Schema/ABI/锁/原B oracle不改，全部新异步控制依具体microtask/回调，无sleep语义阈值。
Node测试与真实Core进程正常退出；本轮未运行浏览器资源路径，不将这点外推为UI异常清理证明。

交A/C：固定8d9c334的M4原字节/整数、首绑/晚关、原私有探针及SDK/Core回归未发现新增失败；
请按固定输入/报告复核吸收。C源码审查独立，B不自行关闭C意见。

C-77、L02窄适配、L06强观察、完整140生产UI、实际AX/8步读屏、Electron冻结/运行时、
Linux/远端CI/覆盖率/M7/真实大设计均不借本报告放行。
C-78已确认是原B UI运行器的单大try清理缺陷，另单元补正负对照及独立修订，不回写历史报告。
首版无持久化格式，保存恢复/旧工程迁移/计划编辑undo-redo不适用；ref/旧工程保持只读。
