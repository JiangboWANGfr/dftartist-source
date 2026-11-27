# B M4 候选整合复验与确定性门禁前置清单

2026-10-12；Agent B独立测试工程师。只记录本轮实际执行；不是Agent C契约/代码评审。

## 固定对象与结论

A交接固定 **2b25f0fab69653a0426e2a74b09b178503add3ba**；
DESIGN SHA **28916edcb2a14725108af2120ef9ada95e1cd26a10608c91562d3bd114163874**；
Schema SHA **30a9ca285b813202b5a9867485a6d301cbd450b31098c582542c3a11c89a1420**。
自有detached契约目录固定此SHA，不使用移动主树或A二进制作产品验证。

本人 **a7c150ab4bed9370e43831bff044eb9b029c0afe** 的13个最终测试/登记/报告文件，
与固定整合快照均**逐字一致**；采集时主树同13项也一致，每项源/固定/当时主树SHA保存于
[本轮机器证据](m4_b_integration_reverify.json)。这证明最终候选未被改写；
不冒称本轮审查了A完整16提交作者/顺序或重新核对78个M3冻结hash。

自有测试/环境独立重跑固定Schema：**27方法、655/655、0skip、退出0**，
corpus SHA **29d46057bbd8d071eca858d3e4536ce4c7bb81470d8a800761e878ee7f492cc6** 与原冻结相同。
自有Node正则对照14/14、退出0。Schema与b502同字节，因此此绿不表示新增私有门禁或M4运行时完成。

§5.6.8及深度计数仍待C审查；日志目前已见C领取，不把领取当认可。
B-15已追加：具体解码/SessionState/worker声明、finish后feed返回及取消意图时隙控制仍欠输入。
本轮提供下列**31项验收设计**，不是已经实现/正式冻结/执行的31项测试。
真实私有门禁0项执行，产品运行时0项执行；B11/12/13不关闭，B14原歧义关闭保持。
接口未实现本身是已知阶段事实，不计新运行时缺陷。

## 实际命令、证据和边界

| B实际执行 | 结果 |
|---|---|
| own Node内联检查13项本人最终文件与固定快照及采集时主树 | 退出0，13/13原字节一致；只读本人已冻结文件，不读取A生产实现/diff |
| B_M4_SCHEMA=自有固定目录 … own venv python -B core/tests/m4/test_schema_contract.py | 退出0，655/655、27方法、0skip；逐case与corpus SHA在JSON |
| 同固定Schema … own Node core/tests/m4/test_pattern_parity.mjs | 退出0，14/14；仅Node原生RegExp，不是生成TS验证器 |
| 固定目录git rev-parse/status、DESIGN/Schema哈希；本机工具版本 | 固定2b25、工作树干净、哈希符合；Node24.21.0、Python3.13.3/jsonschema4.25.1、macOS26.0.1 arm64 |
| 固定快照三个拟私有头的存在性检查 | FrameReader.h/SessionState.h/SessionProbe.h均尚未交付；只检查路径存在，不读实现 |
| 文档/JSON/corpus/13hash/31唯一验收ID/链接/空白 | 独立实际结果在JSON的documentValidation及提交前记录；不冒称全仓formatter/lint |

完整命令/目录/退出码和实际capture在JSON；使用原B自有venv/npm环境，没有再安装依赖或改lock。
[原B报告](M4_B_CONTRACT_VERIFICATION.md)及证据
[m4_b_contract_verification.json](m4_b_contract_verification.json) SHA
**e1068dc5f6cb32259d9a0827a4fbca16334081790b1edfcff3d763ec06ee273c** 保持原字节，
包括旧2b的655=644/11红、5bd schema6缺入口基线及测试装配失败。
本轮没有重跑旧产品的53入口红/25setup错误，不将它们算新运行。
没有Core重编/CTest、web check或前端功能新执行；新改动仅B报告/验收设计/证据，
不为文档改动重复M3大构建。私有门禁尚无受审可调用接口，不能用替代reader/scheduler冒充执行。
A日志、自测及主树二进制不算B结果；共享摘要已暴露，不称严格盲测。

## 独立验收设计（待接口审定，不是执行结果）

依据§5.2/§5.6.2/§5.6.4及新增草案的明确不变量；
不把A实施计划的需求列表当测试期望。以下给出输入/事件序列和应观察的行为，
具体调用签名不猜测，未明确项保留而不补“默认答案”。
分帧单元必须feed同一生产实现；状态单元必须调用同一生产State；
线程门禁还须真实worker接线，三种证明分别报告。

| ID | 输入/事件序列 | 正确行为/判断结果 | 依据 |
|---|---|---|---|
| R01 | UTF8帧F1={"v":"位𝒟é"}与F2={"v":[]}组成F1+LF+F2+CRLF；枚举每个两块切分点和逐字节feed | 恰好两帧，原始UTF8字节分别等于F1/F2；每次最多一帧，frame的consumed包含本次所取分隔符，剩余后缀由调用方继续feed | 5.6.2/5.6.8 |
| R02 | 一次span包含三帧{}+LF及未分隔尾串x | 每次只返回一帧且不消费后缀；三帧后尾串need_more；finish为fault | 5.6.8 |
| R03 | 半个UTF8字符或半帧后feed空span，再继续其余字节 | 空span consumed=0且不视为EOF；最终合法帧字节不丢失 | 5.6.8 |
| R04 | 恰1MiB字节的JSON对象F={"x":""}中填1048568个ASCII a，再LF或分片CR/LF | 行合法；不含分隔符的frame恰1048576字节；CR只在LF前剥一个 | 5.6.2/5.6.8 |
| R05 | 同F增加一个ASCII a，使原始JSON为1048577字节 | fault；后续feed不消费/不产出；finish重复fault。不猜首次fault consumed的精确值 | 5.6.2/5.6.8 |
| R06 | 恰1MiB内容之后分片CR，再非LF字节 | 待判定CR成为内容后超限fault；不能无限暂存；输出/consumed不证明瞬时分配上界 | 5.6.8 |
| R07 | 空reader直接finish；完整LF帧后finish；重复finish | 前两者clean，重复返回同一值 | 5.6.8 |
| R08 | 仅CR/仅空格/未结束JSON/未完成UTF8，不带LF时finish | 任一非空残片fault；重复仍fault | 5.6.8 |
| R09 | LF或CRLF空行；fault后feed合法帧 | 空行立即fault；后续consumed=0，不复活 | 5.6.8 |
| R10 | frame包含两个相邻CR后LF | 仅最后一CR作分隔；frame仍保留前一CR，严格解码是否合法另判 | 5.6.8 |
| R11 | finish(clean)后feed合法帧与空span | 不接受数据、不产出、重复finish保持clean；返回ReadStatus待澄清，不擅自断言fault/need_more | 5.6.8/B15 |
| D01 | 完整正常请求root为1，未知extra含127个嵌套对象；params单独为{} | 最大同时打开容器深度128，严格解码接受；未知字段不绕过深度限制 | 5.6.2 |
| D02 | D01未知extra再多一个嵌套容器 | 深度129，不可关联帧错误；服务event protocol_error后非零退出 | 5.6.2 |
| D03 | 对象/数组交替嵌套，同深度128/129两组 | 128接受/129拒绝，数组也计一层，不按字段路径数量 | 5.6.2 |
| D04 | 浅层字符串包含大量[]{}、转义引号、转义反斜线和UTF8 | 字符串内字符不计容器，合法JSON不误报超深 | 5.6.2 |
| D05 | request原始JSON同时含键id与\u0069d；nested extra同时含a与\u0061 | 按解码后键名重复，拒绝；不同对象各自含a不是重复 | 5.6.8 |
| D06 | 空白行/非对象数组/非法UTF8/注释/尾随内容/两个未分隔JSON对象 | 严格解码拒绝；framer不代替语义解码。收到完整帧才解码 | 5.6.2/5.6.8 |
| S01 | before_take固定0运行+256排队，再普通请求257 | 256准入；257一次bad_request/queue_full，不占槽。wire新id已消费的复用规则另由真实I/O测试，不归State负责 | 5.6.2/5.6.4 |
| S02 | before_core固定1运行+255排队，再新增请求 | 未结算上限含运行任务，第257拒绝；不是仅队列容量256 | 5.6.4 |
| S03 | 排队1/2/3；取消2两次，再加入4并依次执行 | 2一次cancelled/无开始完成progress；槽即释放；其余执行顺序1/3/4，不能重复释放 | 5.2/5.6.4 |
| S04 | 无待结算id/已成功id/已取消id收到cancel | 忽略无帧，无历史状态无界保存；已提交结果不反改 | 5.2/5.6.4 |
| S05 | 运行项在before_core暂停；I/O取消后再放行 | 在调用前检查观察取消，唯一cancelled；不假称Core内部执行中取消 | 5.6.4/5.6.8 |
| S06 | 真实查询已返回，在after_core暂停；取消后放行 | 最终检查观察取消，一次cancelled，成功候选不发布 | 5.6.4/5.6.8 |
| S07 | 成功已提交，after_terminal暂停；后到cancel | 已有一次成功不可改为cancelled，无第二终态 | 5.2/5.6.4/5.6.8 |
| S08 | 取消意图已记录但其stop_source.request_stop尚未执行；再finish | 若最终检查先观察到意图则cancelled；不只测token已停止的情况。当前worker probes不能固定此时隙，受审控制入口待交接 | 5.6.8/B15 |
| S09 | 任务占槽后 finish/cancel/close多次组合 | 只有一次终态/一次槽释放；关闭后禁止发布、不能再准入；返回形状/观察入口待声明，不写替代State | 5.6.4/5.6.8 |
| T01 | worker停在before_take，I/O取消待取1并保留2，随后放行 | 重新读取队列，只执行仍存在2；禁止借用旧项或把1当已运行 | 5.6.8 |
| T02 | worker在before_core/after_core探针等待时关闭会话 | 独立closing token唤醒probe；关闭后不发布；worker真实join且Design于worker销毁 | 5.6.4/5.6.8 |
| T03 | probe等待期间故意断言失败或测试析构 | RAII释放闩锁/响应closing，不使join悬挂；仅测试资源清理不修改Core结果 | 5.6.8 |
| T04 | ON真实worker门禁与OFF真实serve相同正常输入 | ON仅观察控制，不改变wire语义；OFF无安装参数/存储/回调/公共符号；具体入口与消费者检查需C认可 | 5.6.8 |
| T05 | 同用例于Debug与ASan+UBSan运行，probe外部引用先释放 | 会话持有probe直到join，无悬空、线程遗留或提前销毁；不借别人的产物，不用sleep判断时序 | 5.6.8 |

长度1048576与深度128是不同约束；深度取最大同时打开对象/数组，根为1，
params另一分支不与extra分支深度相加。重复键以解码后的键名判断；
读到空行framer应fault，读到空白非空行则由严格解码拒绝，不混淆职责。
UTF8逐字节/每切分点必须直接feed，OS write可合并不能替代此单元；
返回consumed/frame也不能证明没有瞬时复制整块输入，分配/容量另需受审观察或C代码审查。

## B-15：不得猜测的前置输入

1. **可调用声明不足。** FrameReader有feed/finish签名，但严格解码没有输入/输出类型，
   SessionState没有拥有的request/result类型、admit/take/cancel/finish/close具体签名及可观察终态/progress出队，
   私有worker启动/关闭/join入口也未定义。B需要经C认可的声明草案，不要求先实现runtime，
   不要求公开第三方JSON类型，不自行发明一套scheduler或私有ABI。
2. **finish后feed状态歧义。** 不消费、不产出、重复finish稳定可直接作为oracle；
   返回fault还是need_more尚未决定。A/C应明确该ReadStatus或明确本版测试只冻结上述不变量。
   初次fault的精确consumed也没有规范，本轮不猜它；粘滞后0消费已明确。
3. **取消时隙不能由现probe独立固定。** worker四阶段可测调用前/调用后取消和成功先提交；
   不能证明已经覆盖I/O“记录取消意图 → 锁外request_stop”的间隙。
   如果所有取消都已完成request_stop才放行worker，忽略意图、只检查token的实现也可能通过这些测试。
   需要受审方式在stop尚未置位时控制finish；例如状态操作向调用方返回拥有的stop_source副本，
   仅作可选方向，B不替A/C选实现，不增加未经审定的生产注入。
4. **独立待办不能被本草案掩盖。** Node256帧/4MiB预绑定容量和64KiB stderr、
   生成器zero-diff/TS-C++同输入校验、实际部分写/背压、客户端id耗尽、输入hash/key编码
   仍按原M4待办处理，不称reader/scheduler草案已经覆盖。

这只影响对应私有测试的可执行冻结；不新增全M4总开关，
不阻塞其他已有C认可+B冻结的单元。新私有接口不改公开API/ABI/wire/Schema/M3 observer；
正式接入时仍需C检查OFF隔离及实际调用点，B给ON/真实OFF/Debug/ASan独立证据。
React/Electron/history/undo等按M5–M7；首版无工程持久化，不新增旧工程保存/迁移测试。

## 交接与完成边界

本轮完成固定候选原样整合复验和原Schema重跑，31项只是后续测试设计。
本提交仅新增B文档/证据，不改原13项oracle、旧报告或A/C工作树/计划/协调表。
B-15归B本人确认关闭，C60/61/62及私有适配认可归C，不能互代。

A补可评审的私有声明与未定返回/时隙控制；C可逐单元认可，不要求全M4等待；
B在对应前置满足后继续编写/正式冻结同一生产入口的确定性测试。
没有新的固定运行时可验时不重复缺入口基线取数；后续实际产品交付再按同一独立oracle真实复验。
