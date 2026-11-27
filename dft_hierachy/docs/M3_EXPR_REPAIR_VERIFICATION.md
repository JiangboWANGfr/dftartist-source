# Agent B：表达式修复固定快照复验（2026-10-11）

## 结论

固定产品 **`2a58463eda6e72381ed7ead028a9d6ea11a8f605`**：原19项+新8项表达式CLI
在RelWithDebInfo/Debug/ASan+UBSan均 **27/27**；新C-49 API均 **5用例/13,852断言**
通过；原M2/基础回归均 **27/27**。B原反例的Write.deps/other.uses、loads和back-step
均已恢复，**B-M3-01在此固定快照关闭**。

新C-51诊断API各 **1通过/2失败、0 skip**，真实声明负例及合法8位streaming对照
通过，但非法库输入仍没有公开错误、verifyFacts仍成功。保留 **C-51待修复**，不将
正常路径绿测写成表达式单元无遗留问题。C-49/C-50提出方C已关闭，B的新增独立
边界测试支持该结论；不代C/D关闭其他条目，不宣称完整M3验收通过。

## 独立性、版本和冻结

- 公开DESIGN SHA：`487211cec837aed48879f9915372780f1c03b7b0adf61cccbcbc4bb36a6e89e0`，
  包括已回复D-01/D-02的契约。读取REVIEW_LOG看到A自述/C反例，不声称严格盲审；
  未读A新实现、diff、自测代码或C探针来设计期望，A/C结果不计作本次B执行。
- 修改前红基线 **`23dcc05429dcbb0fe5d9cc7e2814500f2e54acba`**。B自建独立产品树
  `dft_hierachy-b-verify`，不复用A产品二进制；复用锁定第三方源码而不更新依赖。
  Slang sourceId仍为`07b9237d652d3a61abd674ae487791fcd97fc0b0a896a6c797b879f4620480db`。
- 测试树`test/m3`仍以旧产品e8f6087为底，未引入A实现。试制冻结ef37b58，输入
  前提纠正b967c6a，最终表达式/D冻结 **`4ba8aca`**；收尾收到C-51后另冻结
  **`c6f5f10`**。所有最终预期均在各自语义运行之前提交。
- 原60 CLI方法、15 API、69fdcea的8项、原输入及M2断言完全保留，与8bb21b1对照
  无差异。新增8 CLI、5 C-49 API、3 C-51 API、3 D-01未来API分别登记，不skip/xfail。
- 逐项输入/判据见 [M3_EXPR_REPAIR_PLAN.md](M3_EXPR_REPAIR_PLAN.md) 和
  [M3_LIBRARY_DIAGNOSTICS_PLAN.md](M3_LIBRARY_DIAGNOSTICS_PLAN.md)。
  最终boundary fixture SHA=`94fba5974d0eb0d68c11bf47b49909facab4572c0cc59d1db4d039b20388d32d`；
  diagnostic fixture SHA=`9ea51ad252a7e34a0d0639d83316b51b97401df5840a9a1d6714008966f34553`。

## 输入、预期与覆盖

| 类别 | 输入与矩阵 | 独立判断依据 |
|---|---|---|
| C-49合法库输入 | input2/4/6；unsigned/signed a4&b4；named/position；两模式；cache0/64MiB | 目标语境根width、exprMap完整identity；截断低位、零扩展无dep、符号扩展高位依赖源sign位；两个u/v保留独立process/ref；真实声明是第二控制，手算deps是第一oracle |
| C-49非按位及常量 | a4+b4、~4'b1010；2/4/6、模式/cache | 算术conservative/full a4/b4；常量2'b01/4'b0101/**6'b110101**，不能先做4位取反再补0；常量折为trivial binding或const根均严格核对全位 |
| C-50范围与角色 | 缩减/比较一位零扩展、混合拼接、精度交织、full signed reduction、partial/full control | 原Write保持exact或conservative；摘要仅部分覆盖就conservative，真正full exact/all仍exact；data/control不混；不按Dep.align直接猜摘要精度 |
| D-02移位 | signed/unsigned >>>1/7、>>、<<<、4→6赋值语境及$unsigned(s) | 手算源位；符号填位来自实际转换后左操作数，不按signal原声明；超过位宽仍符号复制或补0；值映射和依赖分别验证 |
| 所有权/历史 | cache0重查、两个实例、销毁Design后读保存ProcessInfo | 值与映射不借缓存或Design生命周期，sanitizer检查；不能用CLI重复打开替代这个同快照API测试 |
| C-51异常路径 | unpacked array→input6、streaming8→input6；库/真实声明；两模式/cache；合法streaming8→input8 | 错误可浏览但error1/message非空/源文件及连接行正确，重复查询不重复/丢诊断，verify拒绝无错误通过；合法对照complete并保留a8保守关系 |
| D-01后续追踪 | 单个2位inout/ref p绑定{y,a}；unknown方向控制 | 正反向跨位非空保守路线、full cone；策略停止、零边自身命中、unknown partial否定保证；当前未交付API，不能计作运行通过 |

## 实际命令与结果

执行机macOS/arm64；三构建分别RelWithDebInfo、Debug、RelWithDebInfo+ASan/UBSan。
各配置HIER_TEST_M3=ON、HIER_BUILD_EXPERIMENTS=OFF；只构建B所需的hier和原单元/API目标，
不运行A表达式自测。严格-Werror下无新增C++警告；原三测试目标重复libhier_frontend.a
的Apple链接警告、mimalloc配置建议仍在，不能称所有工具输出完全无警告。

```sh
# B独立产品工作树，各配置分别执行
cmake -S core -B core/build-b -DCMAKE_BUILD_TYPE=RelWithDebInfo \
  -DHIER_TEST_M3=ON -DHIER_BUILD_EXPERIMENTS=OFF
cmake --build core/build-b --target hier hier_tests b_review_api b_followup_api -j4
ctest --test-dir core/build-b \
  -R '^unit$|^b_review_api$|^b_followup_api$|^cli_version$|^verify_sharing_|^layering_|^m2_' \
  --output-on-failure

# B测试目录core/tests/m3，各配置使用自己的hier
HIER_BIN=/absolute/dft_hierachy-b-verify/core/build-b/hier \
  PYTHONDONTWRITEBYTECODE=1 python3 run_baseline.py test_expr test_expr_safety test_expr_boundaries
```

新API用B的`core/tests/m3/independent_api`外部CMake项目，显式传HIER_CORE_ROOT、
HIER_CORE_BUILD、HIER_CATCH_SOURCE；只链接B对应快照/配置的静态库，独立目标为
`b_m3_expr_library`、`b_m3_library_diagnostics`、`b_m3_blackbox_loop`。Debug使用固定
Catch2 d后缀；ASan目标加-fsanitize=address,undefined和-fno-omit-frame-pointer。
因此不需要给产品树临时改测试文件；主树尚未吸收本新增冻结，不冒充其默认CTest。

| B集合 | 普通 | Debug | ASan+UBSan |
|---|---|---|---|
| 原expr11+安全8+新boundary8 | **27/27，退出0** | 同左 | 同左 |
| C-49公共API | **5/5、13,852断言，退出0** | 同左 | 同左 |
| C-51诊断公共API | **1通过/2失败；520成功/64失败断言，退出42** | 同左 | 同左 |
| 原M2/基础/分层等回归入口 | **27/27，退出0** | 同左 | 同左 |

均0 skip。64重复失败断言不是64个产品缺陷；C-51两种错误×两模式×两cache共8个
库负例快照，各自缺诊断并三次误过verify；真实声明对照和合法8位两入口均通过。
ASan/UBSan无内存/UB报告，但诊断语义仍失败。旧M2回归耗时20.99/32.81/158.02秒；
原C++26用例/2263断言另直接执行通过，缺失文件stderr是已有负例。

普通另跑原60方法：**14通过/46失败**；恢复固定产品并重建后明确跑当前完整
**76 CLI方法：30通过/46失败，0 skip、退出1**。46仍为39新入口/选项未实现、
7 step契约字段未实现；不是新表达式功能回归，不能声称未到达的深层断言已经执行。
原15新M3 API本轮未编译/运行；D-01单独编译实际退出2，缺TracePoint/Budget/cone/paths，
20条截断/级联诊断不等于20个独立缺陷，3个用例实际运行数为0。

逐方法JSON、Catch2每用例计数/前8个失败表达式、回归尾日志和二进制SHA见
[m3_expr_repair_verification.json](m3_expr_repair_verification.json)。

## 修改前基线与恢复

最终fixture冻结后将B验证树切回23dcc05，自行重建普通hier及新API：

| 新集合 | 旧23dcc05实际结果 | 执行到的判据 |
|---|---|---|
| CLI boundary8 | 4通过/4失败，退出1 | D-02、genuine full exact、合法性控制通过；4摘要方法在精度标签失败 |
| C-49 API5 | **0通过/5失败，476失败断言，退出42** | 窄化事实缺失/partial、扩展根width/映射错误；常量高位实际0而应1，隔离checker后仍失败，不能说原constant失败全是checker前提 |
| C-51 API3 | 0通过/3失败，72失败断言，退出42 | 两库错误仍漏诊断；合法streaming依赖还未修复 |
| D-01未来API3 | 编译退出2，运行0 | 接口未实现，不skip |

这不是旧e8f6087的M3起始基线重写，而是本次表达式修复前的基线。旧库负例已缺
公开错误，故B不宣称“C-51只有新快照才首次出现可见错误计数退化”；新增绑定路径的
内部原因由C审查，独立测试锁定当前应报告的错误和门禁。

之后恢复固定2a58463并重建普通产品/新API，再实际执行76 CLI、C-49、C-51及M2回归：
30/46、5/5、1/2、27/27（17.63秒），结果不变。重建hier SHA从初次
`9587c5e4e2fcf0accb8b171636fb9afb5b919c4e397338a106965e0741cad5ac`变为
`728451a0de0cdd8500af448492ea1126c9079f22a7aacfb70a2e63f9a08b649f`，
没有假定同head必字节相同。Debug/ASan hier为
`cd3ca2001cadfbecaebc00b2eac7248d32a906b6a5e8970ed5de0508ec23fdc9` /
`1ad718f457355ab00c77d28f55b750fe8cd191db1d31ea9ce713d9618a095614`。
最终产品验证树干净，固定head无实现改动。

## B-M3-01、C-51与交接

- `y={<<{a}}`：proc的Write.deps与other.uses均为a8/conservative/all/data，值映射
  identity8；loads有该process，back-step继续到a8且hasConservative=true，均complete；
  verify-facts相比源1/mismatch0。原冻结断言在三配置通过，**B关闭原可见漏依赖反例**。
- B本轮没有故障注入的checker负控制；不将A mutation结果算为B证明。检查器内部
  独立性及故意删dep的抗性仍由C/受审适配覆盖，不宣称所有漏依赖都可检测。
- C-51独立负例仍稳定返回errorCount0/items为空，重复查询后verify成功；真实声明
  error1及正确文件/连接行对照通过。不给错误输入伪造complete值语义，也不把通用
  unsupported当成准确编译错误。交A修复、C原编号复核，B以固定新head保留负例复验。
- D-01已补3个API用例，等待cone/paths交付；D-02手写依赖及转换语境KAT通过，不代
  D正式关闭文档条目。C-49/C-50边界绿测不抵消C-51。

## B自己的输入/构建纠错与范围限制

试制ef37b58中，直接`4'(mux)`会把语境传到mux四位，不能作为只低位control的
oracle；改`4'({mux})`先自定位为一位后扩展。纯blackbox/常量binding没有checker
适用源，增加不接被测网线/绑定的checker_control初始化；保留所有值/依赖判据。
Debug独立目标初次缺Catch2 d后缀为构建适配失败，已纠正。旧运行不覆盖，最终
统计仅计重新冻结后的完整执行，不把这些B前提错误登记成产品缺陷。

没有产品API/ABI/JSON/IPC/工程文件修改，版本观察仍protocol2/schemaVersion2，
不是权威Schema/TS一致性或旧ABI兼容证明。未执行整个check.sh、npm/web、UI/IPC、
Linux、真实大设计、mutation、取消/时钟/索引成本适配或高层持久化/撤销重做。
首版不提供session持久化，不套旧工程规范；C-51属于实际Core异常诊断链，不虚构
UI已接通。冻结/实现/独立验收分别记录；其他已冻结单元可按现有路线开发，M3整阶段
仍需处理红入口、新API和资源/取消门禁。
