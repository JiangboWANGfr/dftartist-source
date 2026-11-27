# B34 独立专项：公开调用观察器恢复失败

本轮完成 B 自有测试设施修订与相关回归，不是产品资源缺陷修复或候选 UI 验收。
A33-B-OBSERVER-01 交提出方 A 复核关闭；B32-Q1 仍 open。C-95 保持 C 已关闭，Q2 保持原限定关闭。

## 固定来源与独立性

| 对象                      | SHA                                      |
| ------------------------- | ---------------------------------------- |
| 固定产品 P                | f725b1e2445744e5f4398bbd8fd2ace31ceb6cef |
| B 初始                    | 4f4fb5ba10c49487b566096112cf16e7af86c123 |
| 首先冻结 R01–08           | ad3e74954bc522f656572a310a029799c551759b |
| 修前追加冻结 setup R09–11 | f27fee694e70848bb08cda01446852bf39e098b2 |
| 仅 B helper 修订          | c8b42f8bb748e1baab2615c4f104f9ce2fa272e0 |

判断依据是 B33 原 README/计划的“恢复原描述符/继承所有权，失败必须报告，后续清理继续”及原设施测试。
A 问题标题仅作线索；未读取 A 的反例源码、便携探针、自测预期或聊天来生成 oracle。
读到 C 首轮交接后，仅按同一既有要求补齐 setup 的三个独立输入，未读 C 探针。
两次冻结都在 helper 修改之前提交并运行未修基线，原八条输入、预期和测试主体保持。
所有故障对象属于测试局部夹具，不推断真实产品会冻结模型，不扩为产品内存安全/取消失败。

## 验收与实际覆盖

每项完整 input/expected/basis 见 `web/tests/independent-source-candidates-view/pagination/release/cases.mjs`。

| ID  | 输入与正确行为                                                      | 原样基线 → 修后 |
| --- | ------------------------------------------------------------------- | --------------- |
| R01 | 继承方法正常删除包装，暴露原继承方法                                | 通过 → 通过     |
| R02 | own 方法原 writable/enumerable/描述符精确恢复                       | 通过 → 通过     |
| R03 | 继承包装不可配置且不可写：报一项恢复失败，后续方法仍恢复            | 失败 → 通过     |
| R04 | 继承包装不可配置但可写：不能伪装恢复原所有权，报错并继续            | 失败 → 通过     |
| R05 | 两个不可删除继承包装：两项失败均收集                                | 失败 → 通过     |
| R06 | own 定义恢复失败，之后的其它 own 描述符仍恢复                       | 通过 → 通过     |
| R07 | delete trap 抛任意 Symbol，原抛值身份保留，之后仍清理               | 通过 → 通过     |
| R08 | preventExtensions 不妨碍删除可配置包装，正常恢复                    | 通过 → 通过     |
| R09 | 安装 getter 抛 Symbol，无恢复故障则原样重抛并回滚                   | 通过 → 通过     |
| R10 | 安装 getter 锁住一个包装后抛 Symbol：聚合首因和恢复失败，之后仍清理 | 失败 → 通过     |
| R11 | 安装 getter 锁住两个包装后抛 null：保留 null 首因并收齐两项恢复失败 | 失败 → 通过     |

不冻结错误文案或具体 Error 子类。要求 AggregateError 收集实际恢复失败；不允许把 false 静默作为成功。
修订仅检查 `Reflect.deleteProperty` 的 false 并抛诊断 Error，沿既有收集器继续清理；不触碰调用 receiver/参数/返回/原抛值及 Promise 消费路径。

## 实际命令与结果

E=`/private/tmp/hier-b-orch34-observer-release.riO75Y`；P=`E/fixed product 中文`；B 为 `dft_hierachy-test-m5-tree`。
N=`B/web/tests/independent-source-candidates-view/pagination`，R=`N/release`。
Node v24.21.0、Darwin arm64；Chromium 156.0.8078.4。PATH 与完整 argv/cwd/耗时/原输出在归档，不以他人运行代替。
Node 及浏览器旧设施均使用 B 夹具/修后 helper，`HIER_B_PRODUCT_ROOT=P`、`HIER_B_BROWSER_TOOLS=P/web` 指向独立固定产品。

| 实际命令/阶段                                                                       | 退出、结果                                                                                       |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `node --test --test-reporter=tap R/release.test.mjs`，首冻/未修 B 与显式旧 P helper | 两次 1，8 项 5 通过/3 失败；R03–05 断言失败                                                      |
| 同命令，补冻/未修 B 与旧 P helper                                                   | 两次 1，11 项 6 通过/5 失败；R03–05/R10–11 断言失败                                              |
| 同命令，修后 B                                                                      | 0/0.059 秒，11/11，fail/skip/cancelled/todo 0                                                    |
| `HIER_B_OBSERVER_ENTRY=P/N相对路径/public-calls.mjs` 同冻输入重放                   | 1/0.062 秒，仍 6 通过/5 失败，负向对照保持                                                       |
| `node --test --test-reporter=tap N/facility.test.mjs`                               | 0/0.127 秒，原 11/11；原 Promise.then 零读取、返回/抛值身份不变                                  |
| `node N/run.mjs --controls`                                                         | 0/0.833 秒，原 11/11 真实模型/原生浏览器设施；cleanup errors/unhandled/releaseErrors 空          |
| `node N/run.mjs`                                                                    | 1/0.410 秒，缺生产组件/CSS；planned 8/executed 0/passed 0/blocked 8/skip 0，非八项语义通过或失败 |
| `npm --prefix web run typecheck -- --force`，P 根目录                               | 0/2.586 秒；独立重建 49 声明与主树字节相同                                                       |
| `npm run check`，P/web                                                              | 0/4.557 秒；未代替完整 web/check.sh/产品全集                                                     |
| 旧 `P/N相对路径/verify-evidence.mjs --inputs`                                       | 0，历史原字节输入有效                                                                            |
| 旧 `N/verify-evidence.mjs`                                                          | 0，纯历史核档，当前产品执行 0                                                                    |
| 旧 `N/verify-evidence.mjs --inputs`，当前修后 B                                     | **1，按原锁拒绝 helper 2164 != 2045 字节，预期历史输入范围拒绝，不隐藏/改锁取绿**                |
| 新 `node R/verify-evidence.mjs`、`--inputs`、`--self-test`                          | 均 0；纯元数据核档 38 捕获/24 材料/5 输入，1 正 10 负控制，无产品执行                            |
| Prettier check、保护核对、own diff check                                            | 0；不格式化无关历史输入                                                                          |

主归档 `docs/m5_b_observer_restoration.json`：**1021877 字节**，SHA256 `ebed41df6ef60811ff4d8959a46b34374f131135bfe684f3c7c83bc23ea4cc02`。
38 实际完整捕获含上述七条预期非零，24 材料含所有五项冻结/修后输入、新旧 helper、原保护快照、脚本及独立只读来源审计。
父捕获是 stdout/stderr 合并原字节，未称分离双流；子来源审计保留 18 命令/36 分离双流且已逐项解压核 hash。
归档不递归更新；封档/核档/负控制/报告格式与保护回执另存 `docs/m5_b_observer_restoration_controls.json`。
可用 `node R/verify-evidence.mjs --verify-controls docs/m5_b_observer_restoration_controls.json` 核对回执。
负控制覆盖压缩损坏、digest、缺捕获/材料、基线计数/失败 ID、修后计数、浏览器 cleanup、缺能力冒充 UI 通过及 Q1 越权关闭；改内容的反例会重算压缩/字节/hash，非仅校验和拒绝。

## 旧档、保护和范围

唯一旧路径变化：`N/public-calls.mjs`，旧 2045 字节/SHA256 `62f440139ca838de6669914f8eb5371ed42b26a475c9d6d42339f57649946b54`，
新 2164 字节/SHA256 `d0dbb8f616429fbd38787be486e8824f708adbfc5e3301d25f6c143de5bf5697`。
原 B33 档/controls/verifier/其余输入一字不改；旧 --inputs 只能绑定旧 helper，新 verifier 明确单列新旧 SHA，不能取代历史核验器。
主树 1235、B 原 832、P 原 1217 路径中，只有上述 B helper 授权变更，另外 3283 项字节和 mtime 严格保持。
主树 49 生成声明/3 普通 Core、P 锁文件、日志前 2499609 字节/SHA256 `683e4e5c42680f8429b0f30a68381b77a017edac4b28e5ce78532b1d328dc00f` 保持。
固定 A 交付只读元数据核对两笔 B 导入 patch/raw delta 一致、13 文件 26 比较相同；Core/protocol/web/packages/scripts/锁/check.sh 生产差异为空，不是执行产品测试。
保护 M3-coordination/research/旧工程/ref/设计输入；共享 REVIEW_LOG 只追加，不暂存提交；无新会话/计时器/跨会话消息。

无生产 API/ABI、IPC、Schema/protocol2/schema7、依赖、配置、工程格式变化或迁移；首版无持久化，旧工程保存/加载迁移不适用。
没有执行 Core 构建/三配置 CTest/ASan、完整 web/check.sh、旧确认/属性/旧全 UI、包外/Linux/Windows/M7/远端 CI 或真实 Core UI/Electron 链。
原 64 计划 DOM/30 类型仍不是全量冻结/已执行。设施无额外 catch/then/Promise 包装不等于原 Promise 实际组件消费已证明。

## 交接

- A：按三笔固定测试/修订顺序原样导入，再导入本报告；复核 A33-B-OBSERVER-01 后由提出方决定关闭，不重写旧档 pins。Q1 及实际 UI 差额仍须保持。
- C：审查单路径设施修订、先冻后修的基线、setup 首因/所有错误聚合、失败后继续清理及无 Promise 消费；不因观察设施绿而放行完整候选组件。
- 协调器/D：本轮 B 专项完成；D 无新增目标、D-03 仍 M6；M5/旧树 L06/L09–11/UI/Electron 不宣称完成。到此结束本轮。
