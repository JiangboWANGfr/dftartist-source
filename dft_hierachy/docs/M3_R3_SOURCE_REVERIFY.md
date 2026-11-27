# B R3 source 固定3c2bdd2独立复验

**结论：原source与前序集合三配置通过，新增五公开source用例通过；C58独立反例三配置红，source/M3整体不放行。** C59是C报告的整理段内取消缺口，B没有受审的段内事件，不能称已实测。已认可旧observer机制后再单独冻结ON测试，不把本OFF阶段改记为内部成本/执行中取消通过。

## 固定范围与独立性

产品3c2bdd210324737f82ea29c1afeed4c04727c495；DESIGN SHA256487211cec837aed48879f9915372780f1c03b7b0adf61cccbcbc4bb36a6e89e0。B旧oracle/报告03729db；新增公开source首冻624c09d、必要头适配14c869f、C58独立冻ecc606b。所有旧fixture/API/CLI预期不变。固定树dft_hierachy-b-verify干净detached；三配置HIER_TEST_M3=ON/OBSERVER=OFF/EXPERIMENTS=OFF；普通RelWithDebInfo、Debug、ASan+UBSan。

只使用B自建产品/静态消费者和外部runner；变更的公开模型/头及全部实际使用消费者重编/重新链接，未变第三方对象复用，不称从零或全部目标构建。没有测试overlay。未读A实现/diff/自测报告、A新增测试源或C探针源；必读日志已见摘要，不称严格盲测。读取的Observe.h/事件说明仅为C认可后的私有适配接口，不作为正确输出oracle。

[计划/逐用例依据](M3_R3_SOURCE_REVERIFY_PLAN.md)、[实际命令/退出码/各方法与断言/RSS/hash](m3_r3_source_reverify.json)。个别构建工具返回截断，仅为摘录，不声称完整raw日志。不同入口重复实际执行不重复算为不同oracle。

## 三配置实际结果

| 集合 | 普通 | Debug | ASan+UBSan |
|---|---|---|---|
| 产品/实际消费者/十仓库API构建 | 退出0 | 退出0 | 退出0 |
| 原88CLI单次执行 | 88/88、0skip、退出0 | 同左 | 同左 |
| 原15混合API | 15/102083、退出0 | 同左 | 同左 |
| 原九API | 35/34828、退出0 | 同左 | 同左 |
| 十仓库API XML总计 | 50/136911、退出0 | 同左 | 同左 |
| 上十API＋source/errors实际仓库CTest | 12/12、退出0、4.01s | 12/12、7.94s | 12/12、31.50s |
| 十一外部API（加新source五） | 55/139136、退出0 | 同左 | 同左 |
| 新source公开边界 | 5/2225、退出0 | 同左 | 同左 |
| 新C58物理身份两用例 | 1通过/1失败、92成功/1失败断言 | 同左 | 同左 |
| 前序M1/M2/共享/分层 | 27/27、退出0、21.28s | 27/27、36.27s | 27/27、161.75s |

新C58 runner退出42、JSON wrapper退出1，0skip；构建退出0。软链接正对照及相同字节的独立物理文件控制通过，**硬链接修改后changed实际两个FileRef，预期一个**。不猜FileRef编码、硬链接显示路径选择或照抄C探针。旧原15的十万leaf首屏1+next、全部页100001无漏重等外部语义执行；单凭输出条数仍不证明内部物化上界。

新五用例覆盖两层宏最外物理范围/两SourceKind/12数组occurrence数值顺序（手算37命中）、页1→2/1→7、冷热/shared/per/cache0/64MiB、重复include与-D虚拟buffer、主文件symlink、EOF/半开/空白/错误坐标、多文件修改与恢复/hash、原游标不变/预取消重试、跨方法游标/非法枚举、RAII临时目录清理。精确字节与SHA手写/独立哈希，非产品返回生成。新目标仅B树登记/外部执行，未装入A固定产品，不能称A仓库新增目标通过。

## 资源、web、兼容

原生provider相对RSS四方法4/4退出0，36样本，fanout10/depth3/4/5、原seed524437及相邻3×/总5×未改；最大中位数8830976 bytes。none/empty/miss中位数8585216/8585216/8798208，sparse8585216/8585216/8830976。只open/snapshot/diagnostics，不作source/trace成本或M7绝对SLA。Debug/ASan不跑原生RSS门禁。

Node24.21.0，独立固定树npm ci --ignore-scripts退出0（缺依赖才安装）；镜像审计端点404，不称安全审计成功。web check类型/分层/五反向探针退出0；test:independent11方法1通过/10失败/0skip、退出1，M4 HierClient8/M5 SelectionModel2未实现，协议版本控制通过。未改engines/lockfile来取绿，lock SHA保持211e18d6…；CLI→Core不是Electron IPC/NDJSON。

实测protocol2/schema6；公开source类型与布局边界要求重编，不承诺旧ABI。权威机器Schema/完整TS结构一致性未交付，版本控制通过不冒充其验证。首版持久化/工程创建保存加载恢复/迁移/撤销重做不适用。

## 基线与测试适配保留

旧333c484独立报告03729db为历史：88观察80通过/8缺source失败，原15API语法编译1/运行0；不覆写为本轮执行。新增source五对B保留的修改前公开头实际语法编译退出1、运行0，SourcePos/Kind等未实现。

首冻624c09d辅助mkdtemp漏unistd.h，三外部新增目标编译退出2、五用例运行0；仅补SDK实际声明头14c869f，不改oracle/fixture。首轮旧头检查也带此测试错误，不能全归功能缺失；补头后纯source缺失错误另记。另一次CLI证据wrapper调用嵌套python命令错误，三配置SyntaxError退出1/产品方法运行0；随后纠正命令并完成实际88/88。全部错误原记录保留，未拿重试覆盖红证据。几次只读observer文件路径核对误拼Observation.h，后按rg实际Observe.h成功读取/hash；不当产品失败或成功门禁。

正常集合无额外ASan/UB报告，严格-Werror通过，既有重复静态库链接提示保留；无全量C++ formatter门禁。共享第三方Compilation.h/.cpp及契约SHA不变；产品与B测试树无未归属改动。未执行whole check.sh/全目标完整构建/完整CTest、真实设计独立verify、Linux/远端CI/TSan/fuzz/mutation/覆盖率/分配失败注入。

## 交接与继续

A：可原样吸收B624c09d→14c869f→ecc606b，保留原oracle和红历史；修C58/C59并提供新固定版本。C：B独立确认C58，软链接/独立同字节控制保留，正式关闭仍归你；C59未以现有事件冒充段内取消验证。协调者：R3-B本OFF source复验交付，对应公开子集绿不等于完整source/M3放行。

C在本轮认可旧私有observer机制，B已领取新冻结/ON验证任务；SourceCandidate只统计选中身份、publish通知是操作前尝试。C59新整理事件仍需独立适配评审。后续继续在自有固定对象工作，主树只追加本人事实，不改协调表或夹带他人日志。
