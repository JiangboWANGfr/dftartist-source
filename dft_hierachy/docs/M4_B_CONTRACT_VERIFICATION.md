# B M4 契约复验、独立候选冻结与修改前基线

日期2026-10-12；执行者Agent B；本报告只记录B实际执行。

## 结论与固定对象

修订草案 **b50277e3b2f85d6806ce81948c1bf63eecb702d7** 的27方法/655项独立结构判断全部符合，0skip、退出0。
同一最终输入、期望与代码在旧草案 **2b18f16b50e071f4b198d2542a1b1a9c66398bbb** 为644符合/11失败、退出1；
最终corpus SHA-256 **29d46057bbd8d071eca858d3e4536ce4c7bb81470d8a800761e878ee7f492cc6**。
九项Hop条件约束、两项尾LF拒绝缺口已修正；这是独立结构复验，不是已实现TS/Core收发的一致性或M4运行时验收。

DESIGN SHA **e4a4d09baf46ae2807fbd25abde416b9f390c825613d96cc9762dac66930ea85**；
Schema SHA **30a9ca285b813202b5a9867485a6d301cbd450b31098c582542c3a11c89a1420**。
修改前运行时始终固定B自建 **5bd4b46fd8b81ffda973a6e648e3acfeceb8f138**、protocol2/schema6，
CLI二进制SHA **643d8a20e93ed241da66299410670b412e64e29035a4adffc8c11781d51b29a7**。
b502只是受测公开契约，不把旧5bd运行结果归到b502产品。

独立分支test/m4从1408dfd创建，测试代码最终冻结 **0cf983720e890cbe00f35bda507ff8a0597d32df**；
计划8d5d9cb先提交，各新增候选先提交再运行，修订提交及文件SHA在
[机器证据](m4_b_contract_verification.json)。
本报告提交只含B计划/报告/证据，不改产品、Schema、DESIGN、A/C测试或协调表。

B-14原“晚订阅可能无正确答案”的歧义已经由§5.6.5解决，B认可并关闭**该契约歧义**。
这不替C审批新生命周期方案，也不表示Node真实竞态通过。
截至报告收尾最新日志仍只有A修订交接，未见C对b502的正式复核结论；
完整M4正式门禁/验收及B-11/12/13剩余项不提前关闭。

## 独立性与原覆盖

依据DESIGN §5.2/§5.6、§4/§5.4/§5.5域模型、公开接口及本人原M3冻结定义正确行为。
公开Schema是被测机器契约，不用Schema生成预期，不复制A/C样例或探针。
共享REVIEW_LOG和公开计划摘要已经暴露，因此不称严格盲测；
未看A生产实现、生产diff、A/C新测试源或另行自测报告。A日志数字不计入本报告。

修改前B现有协议8项、客户端8项、M5选择2项、协议常量1项。协议实际8项全部在缺hello的setUp失败；
web实际11项为1通过/10失败/0skip：8缺HierClient、2缺selection。没有旧M4业务绿基线。
M3层次引用、复合端口、未知宽度blackbox、process.at与常量切片等既有冻结及1408dfd历史验收保持；
本轮无生产变化，不重跑旧M3大构建充作新M4证据。

## 可验证输入、预期与依据

全部具体输入和断言可由所链接提交源码及证据SHA重建；655个case标识、接受/拒绝结果及所有失败输入保存于JSON。
精简采集不声称已经保存每个成功样例的完整原始JSON/TAP。

| 层级/测试文件 | 输入与边界 | 正确行为和依据 |
|---|---|---|
| [Schema单元](../core/tests/m4/test_schema_contract.py) | 手写27方法参数、非空实例/端口/绑定/过程/寄存器、step/图/源码；旧版本、必填缺失/null、错枚举、布尔/小数、safe-int/int32边界、日期、保留字段/未知扩展 | 逐方法参数/响应关联；16非QueryResult恒complete、11 QueryResult可partial且原因不丢；§5.2/5.6.1–3及域模型 |
| 同一Schema单元 | process/register三后继；六终点非空next；primitive缺at；未知宽unresolved合法无at；M2 BoundaryRoute和M3 Hop分别输入 | 段内next≤1、终点next为空、已知引脚位空间at正确；不强造未知宽at，不把旧边界路线改成Hop；§5.5及修订§5.6.3 |
| [Node正则对照](../core/tests/m4/test_pattern_parity.mjs) | 同手写Hash/FourStateValue合法值、LF/CR/CRLF、空白/大写/错长度/位字符共14项 | 全字符串匹配；原样非法字符串拒绝，不trim；只是Node原生RegExp，不冒充生成TS验证器 |
| [客户端单元候选](../web/tests/independent/client.test.mjs) | 完整schema7 hello和显式喂包FakeTransport；pending乱序、迟到、旧代次、Core错误、EOF/dispose、重复hello、schema1/6/8、not_ready | ready一次结算、请求关联不串线、错误code/origin/message/data准确保留并可继续正常查询、退订与幂等释放；§5.6.1/5.6.5 |
| 同一客户端候选 | 同参数并发、规范默认、独立AbortController、末订阅者退出、旧响应后同参数新调用 | 合并仅一wire请求；一个中止不伤另一；最后中止恰好一个cancel、新调用新id，旧响应不结算或缓存新请求；§5.6.6 |
| 同一客户端候选 | 三个允许缓存方法、entries2访问刷新/淘汰、UTF-8回复字节单独超2048预算、任一0、非法cacheOptions、消费者改返回值 | 仅ports/params/bindings的complete缓存；分页/partial不缓存、有限LRU/字节计费、0禁用、运行时无共享污染；不猜未定义key的精确编码 |
| 同一客户端B14候选 | 8个可控hello/非hello/close/构造/dispose/microtask顺序 | 预绑定不挑帧、不丢关闭，close在首投递前优先；dispose胜者为disposed；ready已成功不被EOF反改；不是实际Node容量/进程测试 |
| [原协议8项](../core/tests/acceptance/test_protocol.py)及[新协议17项](../core/tests/acceptance/test_protocol_boundaries.py) | 实际Core子进程、新id缺params后恢复/复用、snapshot优先、非法cancel、null页字段、三帧粘包、UTF-8字节写/CRLF、坏JSON/UTF、重复键、非对象/空行、超1MiB/深度140、残片/正常EOF | 可关联错误只回复一次且新请求恢复；不可关联protocol_error后非零退出且无第二终态；普通FIFO/正常EOF0、reader和子进程回收；§5.6.2/5.6.4 |
| [Node适配11项与E2E1项候选](../web/tests/independent/node-transport.test.mjs) | 公共@hier/client/node工厂、自有[受控生产者](../web/tests/independent/fixtures/node-producer.mjs)、字面args/cwd/env、分帧/粘包、坏JSON/UTF/EOF片段、退订/重复close、第二接收者、失败启动、stderr、零宽限 | shell=false保持参数；解码错误transport_closed；晚onClose异步一次、exited保留失败/退出并回收；真实Core E2E另用B的HIER_BIN，不把假生产者称Core |
| [C++公开消费者](../core/tests/m4/SnapshotContract.cpp) | 只包含公开Model.h，检查六新增元数据成员、旧tops类型和schema7 | 公开模型必须提供修订契约，需重编消费者；只是语法编译，不冒充ABI测试 |
| [TS公开消费者](../web/tests/independent/client-contract.ts) | public HierClient、schema7快照、查询返回型与错误参数的@ts-expect-error | 必须有公开typed接口、非法null/枚举不能通过；入口不存在时unused指令是连带现象，不当三个独立类型缺陷 |

C-62自行确认并适配：旧children.partial刺激确实违反已有恒complete要求。
保留原八项测试目标，children正例使用complete，真实partial及不缓存改用instancesOf，另补children.partial→protocol_error；
三种允许缓存方法分别正测。不放宽Schema，不删/skip旧测试目标，不据实现改答案。
正式关闭C-62归C。

## 实际命令与结果

逐命令、完整已捕获输出或结构化精简结果在JSON；各命令退出码独立记录，不能用最后命令绿覆盖前一失败。

| 实际执行 | 结果与允许结论 |
|---|---|
| B venv python -B core/tests/m4/test_schema_contract.py，B_M4_SCHEMA固定旧/新Schema | 同最终corpus：旧655=644/11、退出1；新655/655、退出0，27方法、0skip |
| Node core/tests/m4/test_pattern_parity.mjs，分别固定旧/新Schema | 两边14/14、退出0；旧Python与Node的两个尾LF差异在新Schema消除；未跑TS生成/C++解码 |
| 真实5bd --version / serve fixture | version退出0为protocol2/schema6；serve退出2，普通bad_request“unknown command serve”，不是hello |
| HIER_BIN=自建5bd python3 -m unittest -v test_protocol test_protocol_boundaries | 25项全部setUp缺event/hello错误、退出1，0深层断言；8原有+17新候选，已尝试真实子进程并清理 |
| own Node --test四个independent测试文件，HIER_BIN=自建5bd | 57项：4通过/53失败/0skip、退出1；39缺HierClient、12缺Node入口、2缺M5 selection。4绿仅常量1+Fake控制2+独立生产者控制1；0项M4深层行为已执行 |
| c++ -std=c++20 -fsyntax-only，include自有5bd公开模型 | 退出1：新增成员concept失败（首先缺snapshotId）及6!=7；不是运行时或六个独立失败 |
| own tsc --noEmit --strict --module NodeNext … client-contract.ts | 退出2：HierClient未导出，另三个unused @ts-expect-error随之出现；类型消费没有通过 |
| npm --prefix web run check | 退出0：原骨架类型检查、依赖层级和5个违规注入测试通过；不含新消费者和产品功能门禁 |
| Ruff check / format --check两个新增Python文件；Node --check四文件；pip check | 各退出0。旧test_protocol保持旧格式，不宣称全仓formatter绿；Node语法检查不称JS lint/formatter |
| own npm ci --ignore-scripts --no-audit --no-fund；venv固定jsonschema/ruff安装 | 退出0，工具隔离，lock SHA保持211e18d6399b816961d027aa8cbe6a3f5ee405524a495f85ef5a1dd3e8a8d73c |

环境macOS26.0.1/arm64、Python3.13.3/jsonschema4.25.1/Ruff0.14.0、Node24.21.0/npm10.9.2、
TypeScript5.9.3、Apple clang17。显式UTC日历FormatChecker由B测试自己注册，不依赖不一定安装的可选format插件。
自有目录与二进制SHA、提交链及每文件SHA均在JSON；没有借用A产品或验证环境。
B CMake只登记未来m4_protocol包含两个模块，本轮用直接unittest命令，没有声称新CTest已执行。

## 保留的失败与测试装配更正

1. 首655为633符合/22失败：11是B正例刺激错误（direction应in/out、ObjectHit.path/def必填、interface_port reason），依DESIGN修正b03159e，预期布尔不改；剩11为真实Schema拒绝缺口。
2. b502首次原corpus为654/1，unknown_pin_width正例误kind=blackbox_pin。本人既已冻结的M3StepBoundaryTest51–54要求unresolved，3d1fb05只更正kind，不看A实现；最后相同字节在旧/新重跑644/11与655/0。不能把先前每个红都计产品缺陷。
3. 两次详细输出因工具上限截断而JSON采集失败；改精简capture后完整采集case标识/所有失败输入与corpus SHA，原问题留档，不称原始全量日志存在。
4. 首Ruff格式为1，dc9d840纯格式；协议首lint unused queue为1，组合命令末commit掩盖总退出码，a1fe5fc更正后独立lint/format0。一次重复Delete/Add补丁在写入前被拒绝，无文件变更。
5. Node候选自审发现roots是InstInfo[]而非items页；按§5.2修正。stdout/stderr跨管道没有读取顺序，不能要求首次close一定已看到全部尾串；明确收窄本项为stderr不混stdout/保留非零退出，64KiB精确tail另待受控reader。修改在ab62f43留档，深层产品断言尚未执行。
6. 最终Core错误断言加强为message/data原样相等；仅规范自审，没有借产品失败改预期。一次证据组装缺内存解析键在文件写入前失败，从既有完整compact stdout解析后继续，实际结果不变。

## 未执行门禁、歧义与交接

以下不是通过项或“全冻结”：真实Node首投递前256帧/4MiB含残帧、精确64KiB stderr上下文、
启动失败的exited内部提前观察；确定性队列256/背压/部分写/排队及执行中取消赢家/id耗尽；
exact framer.feed拆包及深度128边界。需要私有读入/调度适配时，先给C审方案再由B补冻结。
现有多次OS write可能被合并，不能称已覆盖所有内部read切分；深度140只覆盖明确超限。

完整TS/C++同655输入接受拒绝、生成器零diff、27方法运行时语义和新snapshot输入摘要/SignalFilter，
需后续公开工具/接口与固定产品。不能以27机器登记/静态绿称所有Core方法已服务化。
inputHash序列化和canonical key未给精确完整编码，本阶段仅冻结规范不变量/UTF-8计费下界，不自行发明格式；
不以运行时输出倒推答案。受控适配、完整生成命令/导出位置未交付项单列，不能用sleep、预取消或progress猜竞态。

React/Electron/Core错误展示及重试、undo/redo/重复操作、组件/图资源是M5–M7；
当前DESIGN无持久化工程，创建/保存/加载/恢复/旧格式迁移不适用，不借旧dft_planner定义新工程答案。
其他M3已验收行为保留1408dfd历史结论，未新增Linux/Windows/远端CI或RTL结论。

**交C：** 复核b502及B实际655与C62刺激修订，关闭本人C60/61/62；审B14生命周期与必要受控reader/scheduler测试适配。
**交A：** 可按[计划](M4_B_FREEZE_PLAN.md)和独立提交链读取/吸收候选，不改B oracle；在C审+B对应门禁满足后实施受影响单元，再交固定产品让B真实复验。
**B下一步：** C认可后完成相应正式冻结；私有适配受审后补剩余专项，实际接口交付后同一测试复跑。
本轮候选/基线单元完成，不把“等待后续runtime”当M4已经通过；共享REVIEW_LOG只追加本人交接，协调状态由协调者维护。
