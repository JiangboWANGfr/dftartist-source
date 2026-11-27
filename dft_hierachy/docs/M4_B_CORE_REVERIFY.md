# Agent B：M4 Core、边界与 Unicode 独立复验

状态：本轮独立测试已冻结并执行；M4 整体尚不收口。2026-10-13。
本报告不使用 A 自测作为通过证据，不负责关闭 C 的问题编号。
完整命令、首败、逐用例及压缩原始日志见同目录 m4_b_core_reverify.json。

## 对象与独立性

| 固定产品 | B 自有目录 | 用途 |
|---|---|---|
| 6b7cd4987abbbb118580ce5f6ec0cee8a7497aad | /tmp/hier-b-m4-core.KeMY1r | 修复前基线、三配置、Linux |
| 50c4fe375ed467daf3c266f7ec263ed11e416693 | /tmp/hier-b-m4-review-50c4fe3 | 四项修复，不含 Unicode |
| a7d1501caad21170d23f2e6295f93c1f505998ea | /tmp/hier-b-m4-unicode-a7d1501 | 最终 Unicode/四项修复独立候选 |

DESIGN 初版 e458f011…，C 已裁定的 Unicode 增量为7903957/bbd8ff1b…；
Schema30a9ca28…、SessionContract0295e91c…、锁fceb9ebb…均未变。
Node24.21.0、AppleClang17、macOS26.0.1 arm64；Linux GCC13.3/arm64 原生、
hier-ci:ubuntu24.04 固定镜像e37a4859…、B volume hier-b-m4-core-kemy1r、5GiB/4CPU。
第三方六仓库的固定HEAD/clean已核对，只读源码复用，未借 A/C 二进制或 build。

一次公开签名定位错误把client.ts纳入rg，返回少量签名/转发行；已在共享日志披露。
后续只读 B 测试、契约/Schema/公开或必要的不可变声明及构建登记。
REVIEW_LOG 的实现/自测摘要不可避免可见，未据其改预期；不能称严格盲测或零实现接触。
独立测试期望来自规范、历史冻结和手写输入，不从 A 新实现、diff 或自测源导出。

## 验收条件、输入与判据

| 独立集合 | 输入 | 预期及判断依据 |
|---|---|---|
| 27方法/分页/元数据，共34项 | 手写sdk_core.sv：两等值leaf occurrence、大小写信号、4assign+1always_ff | 27公开方法均真实发wire；名字/计数/角色/位段/源hash按RTL手定；同快照查询不变、游标绑定查询、错误保留Core归属且可恢复，DESIGN5.2/5.5/5.6.1/3 |
| raw整数 | 原始1、1.0、1e0、10e-1、0.1e1，尾数/指数非整数、±1e-400，32位和JS安全整数上界 | 按数学值及字段范围判断，不先parse-stringify；childCount是uint32，Diagnostics.errorCount是UInt；未知扩展1.25合法，DESIGN5.6.2+Schema |
| 参数快照重入 | diagnostics.maxItems、definitions.limit、drivers.slice.ref合法getter内dispose；正常getter/abort/已关闭对照 | disposed/client结算、不send、不悬挂；正常getter一次wire且成功；abort是cancelled/client，DESIGN5.6.5/7；harness guard不是SLA |
| Unicode raw Node | 合法代理对、转义NUL、真实UTF8、组合字符；6种孤立/反序/错误配对转义用于已知名字、未知键/嵌套值 | 合法值原样接受、不规范化；非法raw入站transport_closed/transport且invalid_frame，DESIGN7903957/C裁定 |
| Unicode JS出站/custom Transport | 同一6种非法JS码元用于已知文本、未知字段/键/数组；合法标量对照 | 出站bad_request/client且未send、连接仍可继续；custom非法字符串protocol_error/client关闭；键/未知字段不能先忽略绕过标量检查 |
| 真实Core24项 | 上述10类raw转义用于未知键/值；手写3MiB注释源 | 20 Unicode正反例；source.read两进度后实际取4096字节未完成回复、不再读stdout，干净/残片stdin EOF自然0/非零；关闭stdout读端非零；完整排空可恢复原text，DESIGN5.6.2/4 |
| C批准的Node私有控制27项 | 真实FrameInbox/NdjsonReader/StderrTail；实际Buffer长度、手控microtask | 精确4MiB/+1、256/+1帧、完整+残片、分片CRLF/UTF8、原始空白、首交付前后与close优先；stderr精确64KiB/latest-tail；不修改private状态或注入ID，DESIGN5.6.5+C批准声明 |
| TS655 / C++654 | 原B569结构同输入、原81登记旗标+3默认 | TS额外可枚举method-set/count共86登记；C++findMethod无枚举API故不声称这2项观测；C++额外未知方法1，共654；只调实际decoder/validator/normalize，无第二解析器或资源控制注入 |
| 原私有门禁 | 原10 reader/decode+12 state、真实worker OFF3/ON9；原25真实协议 | 原字节/超时不变；1MiB/128层/UTF8/重复键/EOF、256槽/FIFO/768输出/取消竞争、唯一终态/join/资源回收，DESIGN5.6.8/9 |
| 前序与专项回归 | 原M1/M2/M3冻结及SnapshotContract | 完整CTest实际执行；层次引用、复合端口、未知宽度blackbox、process.at、常量切片保留原KAT及结构正反例，不根据新实现改成更宽接受集合 |

每个用例的名称/输入/预期写在独立源码或原655 corpus的对应行；机器证据保留完整原始
TAP/unittest/CPP行、输入corpus和逐行passed。Node raw producer只是边界刺激，
不是假 Core 端到端；34项和Core24项确实执行自建生产 Core。

## 先冻结、再运行及基线差分

B 测试分支为test/m4，非产品运行时分支；实际运行使用上述固定产品。
计划de959a4；SDK源81a781e，运行前资源自审beebd1e；边界347b73c；
Schema刺激纠错b4478d1；C++重放7d428fb→f85d8e5；纯格式744e82f。
Node控制9dafce5→e05b89d，后者使每个partial数字也直接取真实Buffer.length，预期不变。
各提交只包含 B 测试/计划；产品、Schema、公开API、依赖/锁不变。

| 集合 | 修改前 | 中间50c4fe3 | 最终a7d1501 |
|---|---|---|---|
| 原64 SDK/未来 | 6b7：62绿2个M5红 | 62绿2个M5红 | 含在217中：原62绿、M5两红 |
| 新34真实SDK | 旧5bd Core+6875 SDK：34 hookFailed，0深层业务运行；6b7：34/34 | 34/34 | 34/34（全217内） |
| 边界119 | 6b7：50绿69红 | 65绿54个Unicode拒绝红 | 119/119 |
| 真实Core24 | 6b7：22绿、2个背压EOF Timeout20s | 24/24 | 24/24 |
| Node私有控制27 | 6b7：26绿、空bind microtask后误释放容量1红 | 未重跑该单独集合 | 27/27 |
| 全独立前端217 | 原冻结未包含新增项 | 分组执行，不伪造整批 | 215绿2个M5红、退出1、0skip |
| 加新控制后的全独立前端244 | 原冻结未包含新增项 | 未执行该整批 | 一次真实命令242绿2个M5红、退出1、0skip |
| 结构/映射 | 6b7：TS655/655、C++654/654 | 未单列重放 | TS655/655、C++654/654、原Python655通过 |

69个修复前失败具体为12个精确数字拒绝、3个dispose重入和54个Unicode拒绝；
最终这些全部转绿，正常路径/合法小数整数/未知fraction/合法Unicode不变。
原M5缺SelectionModel两红未删/改/skip，不据其否决本批M4，也不称全项目全绿。

首347b73c的111项41绿70红单独保留；5项涉及错误字段范围或缺reach的刺激，
不将其全归为产品缺陷。B在读到A刺激建议前已按Schema独立自审：
3个MAX_SAFE正例移至真实UInt，childCount补uint32最大的小数/指数对照，
drivers补必填reach；数学和行为预期不放宽。首source/Core输入/断言原样保留。

## 构建、配置与回归结论

| 固定产品/配置 | 实际结果 |
|---|---|
| 6b7 RelWithDebInfo、SanOFF、ObserverOFF | 全build退出0；CTest71/71，31.62s |
| 6b7 Debug、SanOFF、ObserverON | 首全量71/74，第二全量73/74均退出8；原超时4项同二进制隔离4/4；不能拼一次完整74绿 |
| 6b7 标准RelWithDebInfo、ASan/UBSan、ObserverON | 全build0；完整CTest76/76，260.46s |
| 6b7 额外Debug+San、ObserverON（非标准） | 原生额外build0，未运行其完整CTest；Linux详细结果另记 |
| 50c4 RelWithDebInfo、SanOFF、ObserverOFF | 全build0；完整CTest71/71，29.01s |
| a7d RelWithDebInfo、SanOFF、ObserverOFF | 全build0；完整CTest72/72，31.90s；包含新24真实服务门禁 |

直跑reader/state22方法2448断言、workerOFF3/49、ON9/752、原协议25/25。
worker缺文件对照的stderr error是预期输入失败，不算编译警告。
npm ci/check、strict消费者、原14 RegExp模式通过；生成来源和分层7负例执行，
不是把tsc当Node/Core运行成功。OFF/ON自己的libhier_protocol nm确实分别无/有
SessionProbe/Phase构造签名；不是仅预处理推断。未声称ABI跨版本兼容或完成安装验收。

Debug超时存在单调时长135/111秒与CTest2972/851秒冲突，source_sort首stdout已经
3411168断言/2方法全通过，仍判914秒Timeout；pmset记录跨夜Maintenance Sleep/DarkWake。
这不是语义全绿证据，也不能仅凭睡眠推测全部根因。原超时未改，
任务范围caffeinate -dimsu后四原超时隔离全绿；未改全机设置。
初优化build中段日志截断及重复静态库警告保留，后续build全stdout压缩采集；
a7d独立完整build仍有Darwin重复库警告，不能套用A增量“无warning”。

## 格式化和独立性维护

744e82f只处理本轮新3JS/2Python。Acorn AST去start/end/raw拼写前后hash逐文件一致，
Python AST去位置逐文件一致；验证后先提交再跑最终候选，输入/期望/超时/方法数不变。
Prettier、Ruff format/check及相对4a2ca9a的本轮完整新增源diff --check通过。
未整理或改写历史冻结源。Shared REVIEW_LOG只追加本人领取/证据/交接；
一次并发追加使本人条目落在旧尾，随后仅移动本人条目到末尾，他方字节未改。

## Linux与未完门禁

Linux原source_sort2方法/fixture/600秒不改，仅用B独立固定6b7自建产物。
额外DebugSan首次600.16秒Timeout/退出8，后来reader_state60秒和step240秒亦超时；
worker9/752、step_increment6/5207及25协议通过，整体定向3/5。原生/其他目标通过
不能关闭它。首次配置选DebugSan是B装配错误，不能标成A标准优化San同配置复现。

标准RelWithDebInfo+San另在/build/asan-release重建5目标，build退出0、捕获无compiler warning。
标准source_sort首测有约80秒与B原生a7d完整编译重叠；虽无另一个Linux压力任务，
不能称完全独占。首测600.04s Timeout/退出8；同二进制第二次在01:29:08～01:39:08UTC，
无本人重型编译/压力重叠，仍600.04s Timeout/退出8（wrapper600.286s）。采样约100%CPU、
515.9MiB；宿主普通应用仍有负载，不声称整机零负载。实际方法/断言完成数未知。
source_sort二进制SHA6ba7d948…，hier c363715e…，-O2及address,undefined flags实际核对。
其余已建目标详见机器证据和追加状态；
不放宽门禁或把资源竞争直接当根因，不借A/C Linux绿或拼完整Linux全量通过。

随后同标准产物5个定向CTest全部通过、退出0、36.25s：reader/state、worker、
step原8方法、step_increment、原25协议。全量Linux未执行，source_sort仍红；
不能把这5绿覆盖先前完整独立600秒失败。

Node私有控制已在C正式批准后冻结执行，27项基线26/1→最新27/27；不把私有单元
当公开Transport错误归属/进程清理的替代。C随后已独立关闭C-63～66并复核e05b89d的27项，
此为共享审查结论，不冒称B关闭。剩余事项：Linux原红及新B冻结的正式runner吸收；
ID耗尽无已批准控制入口。最新a7d的B原生Debug/ASan全量和Linux全量
未执行，6b7三配置结果不能冒称最新HEAD三配置全绿。未测TSan/远端CI/Windows，
未开始M5/M6 UI、Electron IPC或旧工程保存/恢复，没有从旧工程移植未定契约。
