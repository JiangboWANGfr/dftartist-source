# Agent B：C-52修复复验计划

固定修复产品8a944f0bf8a32ca4c4b0b321f478d7a392ff6511；红基线ec23459，历史资源旧基线2a58463已记录，不覆盖。主树DESIGN SHA487211cec837aed48879f9915372780f1c03b7b0adf61cccbcbc4bb36a6e89e0，§4.1/4.8/5.5.3/5.5.5。强制读日志看到A修复概述/自述，不标严格盲审，不读实现/diff/自测代码定预期。B固定树自己重编，不复用A产品二进制或结果，不更新/修改共享依赖源。

原样复验6e1a14f四模式资源门禁（原生普通配置，3×相邻/5×总体阈值不改）、C-51三API、C-49库五API、lookup五API、42 CLI和原M2/分层27入口。三配置旧语义与sanitizer，普通完整80CLI保持真实红结果；未交付未来API不skip。

新增公共API三用例，先独立冻结后运行；全为四个同定义occurrence、两模式、cache0/64MiB：

- 四个unpacked或streaming8→库6输入：errorCount>0、未truncated、所有错误有消息/fixture及连接行2或11；四子实例ref独立可浏览，三次逐个绑定/proc查询后完整diagnostics rows/count不变化，verify拒绝误成功。
- 四个合法streaming8→库8：各自pin/process引用独立；根8、a8/conservative/all/data uses和Write.deps、target pin bits8、exprMap identity8手算；三次重查，verify成功，保存ProcessInfo脱离Design生命周期仍可读。
- 一个library input A8读取n2.s，四个target同定义：只n2 loads partial/hier_ref at其ref，drivers complete空；n0/n1/n3 loads/drivers均complete空。local/hier两reach，两实例模式/零正常缓存；verify mismatch0并实际跳过外部引用。不从bodyCount推断身份，也不把shared/per等价当唯一oracle。

歧义：DESIGN没有明确多个occurrence位于同一错误源码行时diagnostic按location或occurrence去重，故不自行规定全局errorCount=1或4；分别要求非空且消息位置/同快照重复查询稳定，原单occurrence C-51精确error1不改。没有provider查询次数/内部成本hook，也不采用A自测计数作规范。

在现有ec23459自行链接新API做修改前语义基线；其资源三模式红已有冻结证据可原样复跑。切8a并按新构建自动流程独立构建，不读Slang扩展实现；本地阶段扩展/SHA策略/异常边界交C评审。三配置全部静态消费者重编。API/IPC/Schema/工程格式不由B改变，观察版本不当跨语言Schema/ABI证明。

不运行A自测以代替独立证据；不宣称完整M3放行，不虚构IPC/UI/迁移/取消/资源释放。没有确定性取消适配、内存绝对SLA、Linux/远端CI或新故障注入。计划/报告仅测试/docs范围，无产品模块变更。
