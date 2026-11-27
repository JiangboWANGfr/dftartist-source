# B M4私有确定性测试冻结与缺定义基线

2026-10-12；Agent B。B15原“缺声明/返回/取消时隙控制”的冻结输入缺口由B确认关闭；
不表示私有runtime或整个M4已经验收。

## 固定对象与独立性

C认可的DESIGN SHA **e458f01177b20c0eb60693c90196b7374aa264be5aefe4e178fa94fc927550fd**，
SessionContract.h SHA **0295e91ce7b1aac4d8b2a7a9011686f431a787e27747a45309ae6cb636901af6**，
现已随A声明快照67c6afacef638e1bdc43a2c3507f33aedcee4e94交接。
B收到C认可后继续，不以旧“还无接口”事实阻止已获准单元。

计划先冻b2ad180，测试eb17c21→d24c07d→
**3118b6863e03d2772f4829d77b4b4cd026388bf1**。
B只新增[测试输入/断言及deadline](../core/tests/m4/private/PrivateTestSupport.h)、
[reader/decoder](../core/tests/m4/private/ReaderDecodeTest.cpp)、
[State](../core/tests/m4/private/SessionStateTest.cpp)、
[真实worker](../core/tests/m4/private/SessionWorkerTest.cpp)。
调用同一受审FrameReader/decodeFrame/SessionState/SessionWorker，
没有自己的解析器、调度器、假worker、假Core查询或生产注入。
不读取A实现/diff/新自测源/独立自测报告；共享交接摘要已暴露，不称严格盲测。

受审头只按字节捕获到B临时目录供编译，没有提交第二份生产接口。
模型、Catch2静态库及旧hier_protocol来自B自建5bd4b46，第三方Catch2源码只读复用并核对
commit fa43b77429ba76c462b1898d6cd2f2d7a9416b14。
B不借A二进制或可写构建输出；公开Schema、Core实现/API/ABI、依赖/工程格式/旧测试及协调表不改。

## 原验收设计落码与新增边界

[此前31项输入/预期/依据](M4_B_INTEGRATION_REVERIFY.md)逐项映射在
[机器证据](m4_b_private_freeze.json)的acceptanceMapping。
这是31验收ID分组，不是要求每ID恰好对应一TEST_CASE，也不把操作性门禁说成已运行。

| 代码层级 | 方法数量 | 可辨别的行为 |
|---|---|---|
| reader/decoder | 10 | 短UTF8两帧的每字节切分/逐字节、CRLF/单帧consumed后缀、空span/拥有帧、1MiB/+1及pendingCR、EOF/粘滞/finish后状态；128/129对象数组/未知字段、字符串括号、数字词法/拥有树、解码后重复键/第二引号byteOffset、UTF8优先和JSON/non_object |
| SessionState | 12 | 256含运行/FIFO/拥有请求和回复、拒绝不移动、排队cancel一次无progress/释放槽、错误/重复finish不碰真槽、intent但token仍false优先于候选、成功先提交对照、停止动作锁外回调可查State、close和等待；768积压+预留/不重复计start progress/低于256仍背压 |
| SessionWorker OFF | 3 | 实际RTL打开和roots、重复start/稳定waitOpened/close+join；close-before-start、真实打开错误。运行时要求schema7身份，不用当前schema6缺字段伪造快照 |
| SessionWorker ON | 9（含OFF3） | before_take旧队首被取消后重取；before_core/after_core取消且未执行request_stop；after_terminal成功先赢；真实256准入和cancel输出未排空仍背压；closing唤醒/weakprobe到join/失败scope析构释放 |

现有源共**OFF25 / ON31方法**。这是预处理得到的方法集合，不是运行成功数。
新增UTF8 1MiB/+1对照能区分按字符计数；reply id按数值比较而非词法（允许1与1.0）。
State768三个对照分别区分槽容量与输出容量、仅accepted移动和原请求重试、
progress消耗预留而非用unsettled*3再加已入队记录重复计费。

所有时序由条件变量/状态/stop动作控制，无sleep竞速。
5秒deadline只保护harness不会无限等待，不作为取消赢家或产品SLA；probe只记录值/门闩，
不调用Design、不改结果/stop token。取消意图来自实际State.cancel返回动作，
B特意暂不request_stop，再让真实worker经过最终检查；不是预取消或0/1progress猜状态。
State直接测试不证明完整服务I/O；真实worker测试不证明CLI stdout背压，证据分报。

## 实际基线命令与结果

完整命令、参数、目录、退出码、源/库/fixture SHA、初/最终输出在JSON。

| 实际B执行 | 结果与允许结论 |
|---|---|
| C++20 -Wall -Wextra -Werror -pthread -fsyntax-only三TU，observer=0/1 | 各**退出0，无诊断**；包括真实调用声明/输入类型，可编译消费，不是链接/业务通过 |
| 同源ON/OFF -E -P，独立采集原输出hash/方法名字 | 各**退出0**；OFF25/ON31，OFF无SessionProbe/Phase、ON可见；仅声明预处理，不是OFF二进制/安装符号隔离 |
| 同三TU+自有旧libhier_protocol/Catch2Main/Catch2，真实尝试链接 | 两配置各**退出1**；FrameReader、decodeFrame、SessionState、SessionWorker未定义；没有二进制，**0方法/0业务断言执行** |
| 捕获头/四源/自有库/fixture哈希；git范围空白 | 退出0；captured头与C字节相同，nav输入原样；不执行不变M3全构建充数 |

Apple clang17/macOS arm64、C++20；Catch2库和旧protocol库hash在证据。
编译期可以消费当前旧schema6模型，但worker源中的schema7/snapshotId运行断言不因此被略过；
独立公开SnapshotContract模型门禁仍有原红，正式Core增量时必须重编/验证，不冒称ABI兼容。
没有执行任何新reader/decoder/State/线程业务；不能把链接失败算31业务断言失败。

**装配与自审保留。** 最初只读定位误用m3/旧测试路径、Catch2-src自有路径及Model尾部范围，
后来按实际unit/和自有CMake缓存定位共享源码；一次库shasum相对B测试树指错目录退出1，
实际在自有5bd目录补核对0，均不是产品缺陷。首代码syntax即0；后按明确字节/数值规则增强输入，
每次代码先独立提交再跑最终两配置syntax0/link1。源码构建阶段UTF8字节、feed循环guard、
未规定完成后token清理时机的断言均先按规范自审；没有从产品深层失败更改oracle。

## 关闭B15与仍未执行的门禁

可调用声明、finish后ReadStatus、owning停止动作和768计费现已给出、C认可、B代码冻结，
故B15原输入缺口关闭。A可按同签名实现对应私有子单元，不需要在实现前先让无定义测试全绿。

尚未通过：真实ON/OFF链接/运行、OFF serve接线及wire ID登记/重试、关闭join/锁与资源/实际符号安装隔离、
Debug/ASan/UBSan/TSan、部分写/背压/输出字节容量。
consumed/frame不能证明瞬时分配没有复制整块输入；需后续受审分配观察或C实现审查。
worker join/weakprobe不单独证明Design析构线程身份；需C真实接线、sanitizer等实际证据。
边界probe不冒称Core长循环内部取消，原M3 checkpoint门禁仍保留。

B11/12/13实际交付/验收、全TS-C++ decoder同输入/生成器、真实Core schema7及全27方法、Node容量等分别推进。
M5–M7 UI和Studio持久化/迁移不是本单元。没有新UI/RTL/多平台/远端CI通过结论。

**后续交接：** A保持C审声明字节并实现真实私有类/构建入口，不修改B期望；
B执行对应ON/OFF/真实服务和sanitizer；C审唯一状态/锁外回调/所有权及OFF产物。
本报告收尾收到A固定SDK **6875e37**，B在下一独立单元复验，不将那批运行结果算入此链接基线。
