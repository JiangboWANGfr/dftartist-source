# B26 SourceHit.refKind 独立验收

Oracle 是固定 DESIGN §6.16 / §5.5.6、既有 Schema7 公开契约及 B 自有输入，不是 A 的实现、自测或准备脚本。
产品基线 146bfa6069f611855f946344090a7b953303dd43；C26 已通过契约，但该版本尚无生产字段。
本目录不改生产。每个机器 case 都保存 id/input/expected/basis；`inventory.mjs` 可导出完整输入表。

## 验收与输入表

| 层             | 独立输入                                                                             | 正确结果 / 判断依据                                                                                                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TS             | types.ts 的正例及 RK01–RK40 逐项去标记                                               | 旧对象仍可赋值；新联合/可选字段精确；非法字段/空值/显式 undefined 拒绝；SDK/候选只读。只接受相应行的语义诊断，不把缺模块/符号当负例绿。                                                                    |
| Schema         | wire-cases.mjs 208 项：Hit100 / Page29 / Result31 / Response31 / enum17              | 缺字段旧页、合法两值、三种 SourceKind、opaque ref/inst 的正交组合、未知扩展接受；非法 tag、旧必填/范围/嵌套错误拒绝。required 和 additionalProperties 不变，JSON 无隐式强转/默认值。                       |
| SDK/模型       | sdk-cases.mjs 23 项：8 正常/兼容，15 非法响应                                        | 真实 SDK 的旧页/合法标签/partial/空页/并发/换页保持拥有、冻结与值；非法 tag 整响应 protocol_error、关闭退订、所有 pending 恰结算一次；模型不发布非法页。不是 Core/UI。                                     |
| SDK→Node→Core  | core-fixture.mjs 24 项：共享/逐实例 × 普通/宏 × 定义/实例/端口/信号/process/register | 每个目标 occurrence 均出现；从公开独立枚举获身份，不解 ref；每个命中权威标记。include、CRLF、UTF8 注释、宏物理位置及 limit1/2/200 的完整旧字段有序投影不变。每项所有 limit 都检查，不将页数累计为新 case。 |
| C++ JSON       | serialization.cpp 7 项（其中旧形状兼容控制2项）                                      | 默认/四字段聚合空 optional 不输出；Definition/Object 正确字符串且不依赖 kind/ref/inst；nullopt 省略；±非法强转抛 invalid_argument。缺新头时7项 blocked，不当作语义负例通过。                               |
| C++ 生成验证器 | 同一208输入，真实 DecodeFrame/生成 WireSchema                                        | 与权威 Schema 相同结果，Debug/Release/ASan-UBSan 各重放；不存在的定义不得以 unknown→false 冒充负例通过。                                                                                                   |
| C++ Design API | 同一24 HDL，CoreApi.cpp                                                              | `--core-api` 在同版本全 Core + 消费者重编后验证独立目标、标签与所有 span/旧字段投影；头字段缺失则能力失败/0执行。不能用只编译 adapter 或复用 Core 冒称 fresh。                                             |

不把多个层或三配置的同一输入合并计为业务验收总数。Schema 的 191 项旧生成器兼容对照有独立 legacyExpected；新枚举17项在旧版本不适用，单列 blocked，不 skip/pass。

## 命令

所有 runner 要求显式 `HIER_B_PRODUCT_ROOT`（绝对固定检出），依赖工具来自 `HIER_B_BROWSER_TOOLS=$P/web`。
先在 P/web 锁依赖并 `npm run check`；B 源码可在独立测试 worktree 执行。Node24 / TS5.9.3，C++20。

```sh
node web/tests/independent-source-ref-kind/inventory.mjs
node web/tests/independent-source-ref-kind/verify-types.mjs proposal
node web/tests/independent-source-ref-kind/verify-types.mjs production
node web/tests/independent-source-ref-kind/verify-schema.mjs proposal
node web/tests/independent-source-ref-kind/verify-schema.mjs production
node web/tests/independent-source-ref-kind/run-sdk.mjs
HIER_BIN="$P/core/b-ref-kind-baseline/hier" node web/tests/independent-source-ref-kind/run-core.mjs
node web/tests/independent-source-ref-kind/verify-native.mjs --core-api
```

proposal 是仅存在于测试内存的类型/Schema 规范增量，设施绿不等于产品绿。production 使用实际公开声明、Schema、JS 生成器与 SDK。
实施后请将 `HIER_B_LEGACY_PRODUCT_ROOT` 指向原始固定旧版本；不得为取绿把 legacy lane 换成新产品。
native runner 捕获编译器/子命令双流、配置和状态；仅使用自有临时目录，并在退出/失败路径逐项释放。
15秒是死锁保护，不是产品时延 SLA；不靠 sleep 或竞速取消建 oracle。

## 保留回归与限制

本轮新增标签不改变 source 排序/游标/全部 occurrence/成本/取消规则。既有独立 B 的 M3SourceSort、M3Increment 是大 occurrence、有界物化和页内确定性取消的精确 oracle；实施后须与新三配置链一起复验，不能用本轮小 fixture、partial 的 controlled response 或预取消替代。
本轮未重复未变的完整旧总门禁、真实 Electron UI→Core、候选确认生命周期、M7/其他平台/远端 CI。后续 Selection 仅测试公开类型映射形状，不声称确认/旧页过期/UI 已实现。
新工程首版无持久化；保存、恢复、旧工程迁移不适用。SourceHit 的 C++ 布局确有变化，要求全部库/消费者同版本重编，不测试或承诺旧 ABI 混用。

本轮不存在需按实现自行选答案的规范歧义。若某公开 API 适配失败，保留首失败和源码，单独修设施，不改此处业务期望。
