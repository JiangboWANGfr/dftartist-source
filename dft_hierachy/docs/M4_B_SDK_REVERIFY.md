# B 首批M4 SDK固定对象独立复验

2026-10-12；Agent B，独立测试工程师。

## 结论与固定对象

首批SDK **6875e37e55ee8cf6d25f4c4d206fca0619e3f4f5** 的已冻结公开子集通过：
39项HierClient、既有11项Node产品及新增6项Node专项，共**56项产品用例通过**。
完整独立集合**64项61通过、3失败、0skip**；
三红为旧Core没有serve的真实E2E，以及尚未交付的M5两项。没有删除、skip或假Core取绿。

公开生成API的原655判断（**569结构输入+86登记/默认值**）全部符合，
27方法规范化合法/保留已知输入字段/幂等/不改输入、2版本导出符合。
这是本批SDK子集结论，**不是整个M4完成、C++/TS decoder一致或真实Core纵向验收**。

产品源码固定在B自有detached目录 /tmp/hier-b-m4-runtime.0oTOvk；
B按该产品锁文件自行npm ci和构建，不读A实现、生产diff、新自测源码或独立自测报告，
不运行A的test:client或check-schema-corpus脚本，不借A dist、二进制或可写构建输出。
共享REVIEW_LOG/公开交接摘要已暴露，不称严格盲测；公开README、包清单和生成d.ts可读。
黑盒调用公开接口和生成命令不等于采用实现定义正确答案。

公开契约沿用C已审2b25f0fab69653a0426e2a74b09b178503add3ba及原DESIGN/Schema；
Schema SHA **30a9ca285b813202b5a9867485a6d301cbd450b31098c582542c3a11c89a1420**，
独立corpus SHA **29d46057bbd8d071eca858d3e4536ce4c7bb81470d8a800761e878ee7f492cc6**。
新增私有声明67c6afa的SHA0295e91c…/DESIGN e458f011…已经另单元受审冻结，
不把声明编译绿写成此SDK的私有运行绿。
产品锁SHA **fceb9ebbeebff0e83f36d6688d2e8d940dd6272fc4b791e71fb65da32719d84d**；
B旧stub的锁文件不修改。

## 测试源码与必要适配

原[39项客户端](../web/tests/independent/client.test.mjs)、
[Node/真实Core候选](../web/tests/independent/node-transport.test.mjs)、
[公开TS消费](../web/tests/independent/client-contract.ts)均使用冻结字节；
cwd修订已由B原生对照和C认可，不再按产品输出修改期望。

新增[公开生成API重放](../core/tests/m4/replay_runtime_schema.mjs)先提交
c80671f98579d9fc16197696f010e8a7c4e27a42。
首跑因B适配只认识字符串definition，而冻结样例也有纯本地$ref对象，入口AssertionError退出1；
外层试图解析非JSON输出另产生采集错误，不是生成validator拒绝合法输入。
9fefeb9d19abfa246d49d3fe5b03ee583ddf7c04只将纯#/$defs/名字映射至公开validateDefinition，
不改原JSON输入或接受/拒绝期望；规范化只选27个合法params正例，不拿missing.params负例做正输入。
使用B原[手写Python corpus](../core/tests/m4/test_schema_contract.py)作为原oracle，
不复制A重放代码、正反例或Schema自动生成期望。

新增[Node边界](../web/tests/independent/node-boundaries.test.mjs)与
[独立raw producer](../web/tests/independent/fixtures/node-boundary-producer.mjs)
先独立提交 **0ba7518a3d5bdd4a7c38fba5147d1bb60cfc06eb**，再运行固定SDK。
producer只按显式B_fixture_control输出字节，不实施Core模型/业务或自动回答查询。
六项输入/预期如下；依据DESIGN §5.6.2/5.6.5/5.6.7：

| 输入/操作 | 独立预期 |
|---|---|
| 没有receiver时send；随后close再send | 先not_ready/client，后transport_closed/transport，关闭状态优先 |
| 第一receiver实际收到hello，再注册第二个 | 第二次bad_request/client；第一接收权不被破坏，后续echo仍到第一receiver |
| 同一onClose函数注册两次；重复close；关闭后晚注册和立即取消 | 两次注册各通知一次，微任务异步；重复close不重发；晚通知异步且排队通知可取消 |
| raw帧包含id及转义后的同名\\u0069d | 解码后重复键造成transport_closed并回收exited |
| raw未知扩展对象内含位及\\u4f4d | 嵌套Unicode同名键也关闭并回收，不仅检查顶层字面key |
| hello已实际交付后响应text为é重复2097169次（4194338字节） | 完整值/长度/complete保留；首次绑定的4MiB上限不泄漏为所有后续帧上限 |

这些输入由原需求推导，不按SDK实现修oracle。全部close/exited清理由after/finally保证；
5秒仅是harness上界，不是产品SLA或取消竞赛赢家。
OS bytewise写入不能证明Core reader每次read的精确切分；该门禁由另冻CPP测试承担。

## 修改前基线与实际复验

完整命令、目录、退出码、TAP、逐case和hash见[机器证据](m4_b_sdk_reverify.json)。
旧结果也见[此前子集冻结报告](M4_B_CWD_SUBSET_FREEZE.md)；不回填覆盖原报告。

| B实际执行 | 结果与判断边界 |
|---|---|
| 同原58用例跑B旧stub | 5通过53失败、0skip、退出1；39缺HierClient、12缺Node入口、2缺M5；不计深层产品断言 |
| 同原58跑固定6875 SDK | 55通过3失败、0skip、退出1；原50项产品入口红转成深层通过，4控制+1常量保持绿 |
| 新6项跑B旧stub | 文件加载退出1，缺公开HierError；TAP只有1个文件失败，0业务方法执行，不称6项深层全失败 |
| 新6项跑固定6875 SDK | 6/6、0skip、退出0；实际Node进程/公开adapter，不当Core E2E |
| 原58+新增6完整集合 | 64项61通过3失败、0skip、退出1；39客户端+17 Node产品全绿，三红原样保留 |
| B独立generated replay，内部实际运行B Python | Python退出0、同655全部符合；生成API655符合、27规范化/2版本检查符合，退出0 |
| npm --prefix web ci --ignore-scripts --no-audit --no-fund | 退出0；固定新锁、自有依赖树。非本平台可选依赖丢弃是正常安装；不是全量供应链审计 |
| npm --prefix web run check | 退出0；生成195定义/27方法零差异、TS构建、20模块/31依赖分层、7个项目负探针；不是B业务用例数量 |
| 原client-contract.ts strict/NodeNext/ES2022 noEmit | 退出0；公开签名消费及3项@ts-expect-error符合，不代表全部C++结构一致 |
| npm --prefix web run generate:protocol | 退出0；四生成文件前后SHA相同，产品tracked diff为空 |
| esbuild公开client根入口 platform=browser | 退出0，1752164字节；metafile10输入均为client/protocol-types dist，输出imports为空，无Node adapter输入；只证明打包，不是浏览器实际执行或CSP验收 |
| 三新增MJS各自node --check；5文件同字节assert；自身diff空白 | 各命令退出0；不冒称全JS lint/formatter |

生成文件wire.generated.ts、registry.generated.ts、validators.generated.js、
validators.LICENSE.txt的前后SHA完整登记。
SDK固定树只多两个原样B测试文件，tracked源码/锁/Schema不变；
编译生成输出属于B，不混为A的新移动实现。
原四份B证据JSON的SHA复核均与已登记相同，历史失败未抹掉。

完整集合三项红的实际诊断：

- 真实HierClient→Node→B自建旧Core：protocol_error，First frame must be hello。
  使用Core5bd4b46fd8b81ffda973a6e648e3acfeceb8f138、schema6/无serve，
  二进制SHA643d8a20e93ed241da66299410670b412e64e29035a4adffc8c11781d51b29a7；
  确实运行了该旧Core，不借A新构建，不称新serve缺陷或验证通过。
- M5 history与subscriber：SelectionModel未导出，入口断言失败；保持后续里程碑红。

## 仍未验证的门禁和交接

B15原输入缺口已在[私有冻结报告](M4_B_PRIVATE_FREEZE.md)确认关闭：
代码3118b68；声明ON/OFF语法0、OFF25/ON31预处理，真实链接1/1缺定义、0业务执行。
A可保持受审签名实现reader/decode/State/真实worker并交固定Core及CMake/调用入口。

本批没有新的Core serve/SnapshotInfo/inputHash/27方法分派；
完整真实E2E、C++/TS raw decoder同输入、ON/OFF私有运行、
线程唯一终态/部分写/背压/关闭join、ASan/UBSan/TSan和安装/符号隔离仍待对应固定交付。
不重复不变M3全构建充当M4证据，旧M3最终独立报告1408dfd保留。

首次绑定精确256帧/4MiB、stderr64KiB尾截断与诊断、启动内部拒绝观察、ID耗尽仍是独立待验门禁。
若adapter在上限暂停stdout/backpressure，producer尝试写第257帧或额外字节并不证明adapter已收到它；
因此不把“尝试写超量后应立即close”当唯一正确行为，也不靠sleep竞速取此结论。
须在对应受审控制/可观测边界下证明已接收字节和容量；不据实现选择某个变体。
本批大帧仅证明首次实际交付后的合法大响应，不证明首次绑定上限或内存峰值。
原stderr用例证明与stdout分离/退出码保持，不证明64KiB精确有界。

UI/Electron/React/Worker布局、工程保存恢复/损坏文件/旧持久化迁移，
以及M5–M7、Studio编辑文档都不属于当前SDK子单元，不以无产品代码假造E2E或放宽DESIGN范围。
D研究和D-03来源所有权不代替新DESIGN或本批验收，不挪入M4阻塞。

交A：可原样吸收独立重放9fefeb9及Node专项0ba7518；保持三红与原期望。
交C：审真实生成/校验/Node接线、容量/资源和后续私有实现；本批黑盒绿不替代C代码审查。
B仅提交自己的测试/计划/证据，并在共享REVIEW_LOG追加领取与实际交接；
不改产品、Schema、DESIGN、锁文件、协调表或他方测试/研究。

## 采集限制与异常保留

npm ci的verbose输出受工具预算截断，退出码/最终安装结果保留，
不声称已归档完整安装原始日志；最终TAP和655解析结果完整保存。
首次replay适配AssertionError及外层JSON采集错误按测试装配分类并保留；
一次报告定位误在B旧树找M3-coordination，sed退出1，
随后在共享主树读取实际文件；不是产品或业务测试失败。
初次机器证据装配使用了编排环境不存在的structuredClone，JSON写入前ReferenceError；
Markdown已写入，随后只改用JSON值拷贝完成证据，测试输入/预期不变。
两次校验记录补丁因行前缀/上下文顺序在写入前被拒绝，正规化后再验证。
此前私有证据JSON尾逗号已经另commit0b378ac修复，历史记录保持不再重写。
未运行新增全仓formatter/浏览器UI/远端CI/Linux/规模压力，不将未执行写成通过。
