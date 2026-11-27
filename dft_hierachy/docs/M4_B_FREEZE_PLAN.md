# B M4 schema7独立测试候选与基线

## 固定对象、权威及范围

初始公开草案2b18f16b50e071f4b198d2542a1b1a9c66398bbb（DESIGN dcdb322356f05c3076db1820181a5b3bc78fceee70fb641c3b9b706d51503adc、Schema99180c67675ff16a0d9ec6fb541c1fd5b48bde3179ebcea2c69762c561ded07c）保留为旧红。最终Schema复验固定b50277e3b2f85d6806ce81948c1bf63eecb702d7，DESIGN e4a4d09baf46ae2807fbd25abde416b9f390c825613d96cc9762dac66930ea85、Schema30a9ca285b813202b5a9867485a6d301cbd450b31098c582542c3a11c89a1420。B分支test/m4从1408dfd创建，M3 test/m3与自建5bd产品保持。C已正式关闭C60～62并认可公开客户端生命周期；2b25f0f的DESIGN28916edc…/同Schema为受审对象，既定对应子集正式冻结。随后C认可67c6afa同字节私有声明，B以3118b68代码冻结并关闭B15原输入缺口；首批固定SDK6875e37独立复验已完成。完整Core运行时、跨语言decoder/服务/容量等门禁仍未完成，不扩大为已受审客户端单元的停止条件。

需求依据DESIGN §5.2/§5.6、原B-11/12/13、公开Core模型和Schema；不读A实现/生产diff/新自测源/报告，不复制A正反例。Schema是受测公开机器契约，不能用它生成自己的正确答案。共享日志/公开计划摘要已暴露，不称严格盲测；期望独立从文字与手写输入推导。

仅修改B的测试/fixture/必要测试入口与计划/报告；不改生产、Schema、DESIGN、C/A测试、协调表或锁/engines。新Schema7静态验证与当前5bd schema6/缺serve的真实基线分开记录。没有项目持久化，保存/恢复/迁移/规划编辑不适用。

## 可验证验收矩阵

| 单元 | 独立输入 | 预期/判断依据 |
|---|---|---|
| Schema与27方法登记 | 手写方法/TS名称/默认值/16非QueryResult、11QueryResult清单 | 参数/结果/响应关联全覆盖，非QueryResult恒complete，partial/reasons及空结果不丢；按pending method而非通用Success验证 |
| 帧与模型正反例 | 完整schema7 hello、旧1/6/未知protocol，27手写成功/错误、 populated模型变体；缺/null/错误枚举/bool/浮点/安全整数边界/已知保留字段/未知扩展 | 接受合法/拒绝非法；不以Schema输出生成期望；跨字段与raw NDJSON限制另测，static检查不冒充运行时 |
| 服务与分帧 | 原8协议语义；新增缺字段/恢复、快照优先、递增id消费、非法cancel、LF/CRLF/UTF拆包粘包/坏UTF/重复键/长度深度/EOF | 合法关联新id一次错误后可恢复；不可关联protocol_error后非零退出；stdout仅帧，正常EOF回收0，未知/已结束cancel无回复 |
| HierClient | 真实AbortController、显式喂消息的FakeTransport、完整手写对象 | waiting/ready/closed，wire/客户端/transport错误分开、乱序/迟到/关闭代次、每订阅者独立取消/最后离开一次cancel/新id、合并与只读隔离 |
| LRU | cacheEntries2/0、超出byte预算的多字节Reply、ports/params/bindings vs分页/磁盘/trace | complete成功有限缓存、触碰更新/淘汰、任一0禁用；partial/error/取消不缓存；不猜未定义canonical key的精确字节序列 |
| Node Transport及E2E | 自有Node假生产者独立进程和真实自建Core两个集合 | shell=false/args保持、分帧/异常/EOF/退订/错误有界stderr、close回收exited；假生产者不当Core E2E，真实Client→Node→Core需全部层实际存在 |
| TS/Schema/生成 | 公开typed签名/同一独立样例的接受拒绝 | 生成可复现与C++/TS一致必须实际执行；生成器命令/导出未定义时单列，不能凭常量相等称通过 |

## 原测试刺激与歧义处理

旧client以children喂partial/indexing，但§5.1与新§5.6.3都要求children非QueryResult恒complete；新Schema严格验证后该刺激不再合法。这不是产品失败，也不能为了保留旧绿而允许非法partial。拟保留原children参数/快照断言用合法complete，另用合法instancesOf/search承载原partial上传及不缓存语义；先明确记录并交C确认，不删除该语义或按实现改预期。旧schema1/minimal InstInfo适配完整schema7对象及onClose/Unsubscribe，同样不改变原意。

openedAt格式与日期、未知字段/已知判别字段、空/null与默认值按文字独立固定。inputHash的精确序列化和canonical cache key byte形状尚无完整编码格式：本轮只冻结不变量/下界，不自行造另一权威格式。非法JS查询参数的本地或Core拒绝位置若未明确，单列，不假定某实现。

队列满256/排队与执行中取消的确定性调度、id耗尽需新私有适配时先交C审；不sleep或用大输入竞速强迫cancelled，不从0/1 progress推断取消必胜。raw请求bytes/depth、恰好一次普通/合法竞态、公开事件控制可先测。未批准适配的单元明确未执行，不称全取消已冻结。

## 执行进度与证据

- [x] 计划先独立commit；固定Schema目录/自有测试分支，核对SHA/已有变更。
- [x] 手写独立Schema corpus及验收表，先提交候选再运行；使用B临时jsonschema环境，启用format，不改生产依赖。
- [x] 必要旧fixture/传输适配及客户端/Node/协议增量先独立提交再运行；测试刺激修订与初败保留，C确认另记录。
- [x] baseline: B自有5bd CLI与自有TS基线；缺导出/缺hello是入口红，未到深层断言不能计业务已测试；Schema静态失败/测试缺陷/工具缺失分开。
- [x] 独立报告/JSON保存命令/退出码/逐case/fixture及contract/hash、环境和未执行项；测试commit独立交A/C，主REVIEW_LOG仅追加本人条目。
- [x] C认可的公开Schema与客户端生命周期对应既定子集正式冻结；655判断含569结构输入/86登记检查，39客户端及现有Node/协议候选，冻结与实际产品通过分开。
- [x] C认可B15具体声明后，真实私有类测试先独立提交；ON/OFF语法0、预处理OFF25/ON31，缺定义链接1/1、0业务执行；B关闭原冻结输入缺口，不关闭runtime门禁。
- [x] 首批固定SDK6875独立安装/构建；原58与新增6 Node、同655公开生成API/27规范化、TS消费/重生成/browser打包，实际结果独立存证。
- [ ] 完整C++/TS decoder一致性、真实Core serve/元数据/27分派、Node精确首次绑定容量/stderr/ID极值及其他M4剩余门禁；B11/12/13剩余与后续阶段不提前关闭。

不为本契约增量重复M3无变化完整构建，M3历史1408dfd保持。web类型/层级、测试语法/lint与本地链接/空白必要执行，未运行formatter/CI不称通过。临时测试工具依赖隔离并记录版本；所有子进程/文件仅自有范围RAII/finally清理。没有当前产品绿结果时不为预算或pending清理降低预期。

### Schema首跑输入修订（2026-10-12）

候选e1a5365、纯格式dc9d840先提交后运行固定2b：655判断633符合22不符。11项来自B正例刺激错误：端口/绑定direction误写input（§4.4明确in/out）；search缺path/def（§5.5.5明确所属定义）；interface reason误写interface（§4.4/5.4为interface_port）。仅更正手写输入并补必填字段，接受/拒绝预期不改，修订另提交后重跑。另11项为段内next/终点at约束与尾LF的真实机器契约拒绝缺口；正式分类由独立复验确认，不把全部22项写成产品缺陷。

两次原始/较详细证据因输出上限被工具截断，JSON解析失败属采集问题，不当Schema新增失败；改为仅保留通过case标识及全部失败输入/预期/实际和可重建corpus SHA，重新完整捕获，不声称原始XML/JSON全量已保存。首次ruff format检查为1，纯格式提交后不改oracle。

### C62旧客户端刺激确认及候选补充

原八项的参数/快照、并发合并、乱序、partial不缓存、取消/迟到、Core错误恢复、退订与dispose目标保留。children正例按已审§5.1改complete，partial上传转instancesOf并增独立正例，children.partial另应protocol_error。这是原刺激缺陷修订，不据A实现取绿。FakeTransport增加公开onClose及幂等退订/close、完整schema7/InstInfo；显式喂包，不自动回答。await实际send通知消除未规定的同步发送假设，deadline仅harness。

候选进一步覆盖not_ready/旧schema/EOF/重复hello、独立订阅者取消、规范默认合并、三个允许缓存方法、entry LRU、多字节reply下界和只读隔离/旧连接回调。B14构造前hello/close的晚订阅未定，不在FakeTransport选择默认重播。Node真实适配、服务坏帧全矩阵、TS生成和确定性队列等留下一受审单元，不冒称已实现/已运行。

### b502修订复验及历史刺激校核

同655候选不改期望跑b502，654符合/1不符；最后一个正例把unknown_pin_width写成blackbox_pin。回查本人已冻结并于M3验收的M3StepBoundaryTest.cpp51–54明确kind==unresolved，旧§5.5的未知宽终点不能虚构引脚。因此只修kind为unresolved，接受预期仍true，不根据A实现/Schema反推答案；另提交后同最终字节重跑旧2b/新b502。初655/654/1红与原corpus留存。

原协议增量首lint有unused queue，串行后续commit使组合命令整体0，输出留证但不计lint绿；删未用import后逐命令ruff0。同样保留apply_patch重复Delete/Add路径在写入前失败及无文件修改的记录。

### b502 B14候选

新§5.6.5明确微任务投递、唯一接收权、每次关闭注册独立、关闭优先和dispose胜者后，Fake改为遵守该公开规则的受控消息/关闭投递，补8个客户端晚绑定顺序；不把Fake的缓冲实现当Node产品测试。EOF资源断言改在明确dispose之后检查退订，避免未规定的自动退订时机；没有读A实现或从产品失败改期望。真实Node字节容量/原始残帧、启动失败exited/进程回收仍待独立产品适配门禁。

### 本轮交付（2026-10-12）

最终测试0cf9837；[B独立报告](M4_B_CONTRACT_VERIFICATION.md)与[实际机器证据](m4_b_contract_verification.json)。同最终655旧644/11、新655/0；Node正则14/14。运行时候选39客户端、11 Node+1真实E2E、25协议：当前基线分别缺HierClient/Node/serve入口，未到深层断言；完整web57为4控制/常量绿、53入口红、0skip。C++/TS消费者语法退出1/2，骨架web check及新增测试格式/语法退出0。

B接受并关闭B14原规范歧义，只限文字契约，不替C审查或实际Node容量/竞态验收。C60/61/62归C正式关闭；B11/12/13剩余及生成器/受控调度/reader专项未完成。Node控制producer非Core；OS写分片不是精确framer.read证明。旧红、所有刺激/工具采集更正另存，不称M4全量通过。

### C认可后子集正式冻结与cwd适配（2026-10-12）

C已关闭C60/61/62、认可B14生命周期，B正式冻结已明确的公开Schema/客户端/既定Node协议候选，不要求全部未来M4测试先绿再开始实现。收尾收到C对新SessionContract.h SHA0295e91c…/DESIGN e458f011…具体声明和取消动作的认可，B15转续确定性私有测试代码冻结；未关闭，完整运行时/生成/容量等验收仍分别推进。

纯EOF空白提交ba35d12；cwd预期由B独立原生Node复现后在1eb90da正规化为resolve(cwd)，args/cwd/env目标不变，新增同/异目录控制。原raw相等probe退出1，正规化+父目录拒绝probe0；旧stub实跑58为5控制/常量绿53入口红，4选中控制全绿；这些不是A正在写的新产品结论。原报告与hash保留历史，新hash和正式子集边界见[M4_B_CWD_SUBSET_FREEZE](M4_B_CWD_SUBSET_FREEZE.md)及[机器证据](m4_b_cwd_subset_freeze.json)。等待A固定runtime交付后独立复验，不测移动主树。

### 私有冻结与首批SDK独立复验续交付（2026-10-12）

B15按C已审SHA0295e91c…声明/§5.6.9落码，代码3118b68、[私有冻结报告](M4_B_PRIVATE_FREEZE.md)及[证据](m4_b_private_freeze.json)；原输入缺口关闭。随后领取固定SDK6875e37、在自有detached目录安装其锁文件，不借A构建物，不读实现/diff/新自测源。

原58同输入旧stub5绿53红，新SDK55绿3红；39客户端+11 Node产品全绿。新增6 Node源码先提交0ba7518再运行，全绿；完整64为61绿3红0skip，保留旧Core无serve和未来M5两红。公开生成API同655（569结构+86登记）全符合、27规范化/2版本检查符合，TS消费和四文件重生成/浏览器打包0；不当C++ decoder/真实Electron/UI验收。见[SDK独立复验报告](M4_B_SDK_REVERIFY.md)及[机器证据](m4_b_sdk_reverify.json)，剩余容量/资源/真实Core各门禁另验。
