# B M4 Core 固定候选独立复验计划

## 目标、依据与对象

2026-10-12，Agent B。固定产品6b7cd4987abbbb118580ce5f6ec0cee8a7497aad，
自己的detached目录/tmp/hier-b-m4-core.KeMY1r，自己的test/m4起点4a2ca9a。
DESIGN e458f011…、Schema30a9ca28…、SessionContract0295e91c…已核对原字节。
按DESIGN §5.2/§5.6与原B冻结，不读A实现/生产diff/新自测源码/独立自验报告；
共享交接摘要已暴露，不称严格盲测。允许读取公开声明、使用文档和必要构建登记。

已交付serve与schema7，故原旧CoreE2E红现在须用新自建Core实际运行；
不借A或C的二进制/构建输出。第三方源码核对HEAD/clean后只读复用。
本轮不修改产品/Schema/公开接口/锁/协调表/他方研究，不进入UI/旧持久化范围。

## 验收矩阵与既有覆盖

- 直接生产reader/decode：B原10方法分片/UTF8/1MiB/128层/重复键/EOF，输入与期望保持。
- SessionState：B原12方法256槽/FIFO/取消意图与token时隙/768输出预留/拥有值重试/close。
- 真实worker：B原OFF3、ON9，before_take/调用前后/终态之后精确顺序、唯一终态、join与probe寿命。
- 真实协议：原8基础与17新增边界，共25，按既有输入关联/顺序/错误恢复/protocol_error/关闭与资源回收判断。
- SDK：原39客户端、17真实Node用例、实际SDK→Node→本轮自建Core；
  完整64保留M5两个后续红，不以未来红否决本批，也不skip取绿。
- 元数据/27方法：原公共SnapshotContract与结构655/14模式；
  对27个SDK函数增加手写RTL纵向KAT，输入/预期先冻结再调用，不能复制A新的SDK集成测试。
  新signals筛选/游标与inputHash不变量按DESIGN5.6.1/3单独定义，不自行制造精确hash编码。
- 兼容/前序：新静态消费者重编；M1/M2/M3冻结原样运行，特别是宽总线、连接事实/位映射/时钟及source排序。
  不凭A的22份CLI差分设置预期。
- OFF/ON：本轮真实库nm与公开消费者/安装头，只查自己产物；预处理不等于二进制隔离。
- Linux source_sort：自己的Linux/GCC ASan构建/目录，原fixture与600秒门禁不改；
  独立运行并保存环境、输出/超时，不以A的旧78/81+新9/9推断全量绿。

## 执行与记录

1. 计划独立提交、主REVIEW_LOG追加领取；核对冻结源hash后配置。
2. 普通优化OFF、Debug ON、优化RelWithDebInfo+ASan/UBSan ON分别独立完整构建。
   先CTest -N确认登记，再跑对应B门禁和前序/完整项目回归，A新增探针只作项目回归不作B oracle。
3. 在固定SDK锁下自行安装/构建，运行B原64、655公开重放、类型消费/模式与生成检查。
4. 新27方法/元数据/筛选及必要服务I/O测试从需求补冻，保留修改前红，独立提交。
5. Docker环境可用；复用已固定hier-ci镜像但不复用A/C构建物，Linux sanitizer自己编译。
   先构建后隔离source_sort，重型测试不与本人的其他压力同时运行，记录可见外部资源争用。
6. 报告/机器证据保留实际命令/退出码/配置/输入源hash/逐用例与断言、
   初败/工具装配问题/未执行项；测试和报告独立commit，共享日志仅追加。

## 歧义与风险

Unicode初始策略歧义已由C裁定、DESIGN7903957/bbd8ff1b同步，现冻结标量值策略。
含键/未知嵌套/JS出站与自定义Transport，配合法代理对/NUL/真实UTF8/不规范化正例；
非法raw token不经JSON.parse重写。新增review-boundaries与test_review_wire_eof先提交再执行。
精确Node首次绑定容量/内部启动拒绝/ID耗尽仍可能需要受审可观测适配；
只测公开可辨别行为，不用sleep猜已经接收额外字节或取消赢家。
stderr界限若从公开error.data可明确判断，则从契约补输入；若输出编码/诊断字段未定，单列。
服务部分写/慢消费者不能单靠输出条数证明内部容量/瞬时分配，应分开证据。
Linux现有红可能是实现/测试/环境，先原样复现；不延长40/600秒、不改fixture或删除门禁。
首次配置错用Debug+San，额外压力结果保留，不能写成标准优化San门禁复现；
核对check.sh45–47/ci入口22–24后在新目录使用RelWithDebInfo+San重跑。

## 进度

首新增111项执行41绿70红。按Schema复核首刺激：childCount最大4294967295，
将3个MAX_SAFE正例迁移到Diagnostics.errorCount的UInt（不是降低安全整数预期），
childCount补32位最大的小数/指数正例；drivers getter补必填reach=local。
5项首失败涉及无效刺激/错字段范围，不能报告为产品缺陷；首日志保留，修正先提交再执行。

- [x] 阅读最新交接/用户决定、相关DESIGN、AGENTS/VALIDATION/EXECPLANS/协调规则，明确角色。
- [x] 固定自有产品目录、核对契约/锁、第三方6个HEAD与clean。
- [x] 冻结源核对与6b7三配置重建、私有/协议/回归（Debug两次全量有系统时钟/睡眠超时，隔离4绿，不冒称完整74绿）。
- [x] 新27方法/119 raw/24 Core/27 Node私有等需求增量先冻结与修改前基线，再固定a7d执行。
- [x] SDK/结构/类型/nm产物隔离，TS655、实际CPP654；Node容量/stderr受审后27实际执行。
- [x] Linux标准source_sort第二次原600秒无本人重型重叠复跑，仍600.04s Timeout/退出8；随后其余已建定向5/5退出0，原门禁不变。
- [x] 独立证据/报告/提交/共享交接；Linux根因/固定修复交A、ID耗尽需受审入口，均未宣称已过。
