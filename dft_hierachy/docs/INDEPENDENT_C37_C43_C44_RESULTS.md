# Agent B：C-37补充 / C-43 / C-44独立验收（2026-10-11）

## 结论与固定对象

固定产品快照`d98a124c95694c9d50f27bd1ad6ff86a3e754471`的B独立语义、公开API、
资源回归和故障退路门禁通过。原断言未放宽；修复前新增门禁确实失败。
这补齐C要求的当前快照证据，M2最终阶段放行交C核对，不把有限测试全绿当作HDL穷尽证明。

- 修改前M2：`a6b3c8dd906a16c94ab7af5e5dc278e9e95406f1`。
- 新测试冻结：**`c5f74b0`**，9项语义Python+1项打开资源方法+4项C++公开API用例。
- 故障注入适配：**`5502e1f`**，只增加精确head/source SHA白名单；三个故障和退路预期不变。
- 原70个Python方法和原4个blackbox位置API用例与`4c86795`比较无变化。
- 预期依据：DESIGN 4.1、4.4、4.6、4.8、5.4、第10节，公开LibraryProvider接口及
  C公开HDL反例；完整输入/预期/判断依据见[独立测试计划](INDEPENDENT_TEST_PLAN.md)末节。
- 冻结时正式DESIGN SHA-256：`7d3565981359a92f6dc364f791fb8ade68c43d0fb3cc5766b429f78e29770107`。

没有查看A修复源码/diff、自测或资源脚本来定义/调整预期，也不转记A/C执行结果。
冻结后仅为沿用B既有故障注入适配，读取唯一生成事实→验证边界附近8行。
在B的detached `dft_hierachy-b-verify`自行重建三种配置；第三方源码/构建产物复用，
产品不从A在途二进制取证。新C++用例临时登记链接公开库，fixture取B测试树。
产品临时登记和mutation均已恢复，隔离工作树git status为空；A产品代码、旧工程、
参考仓库和真实设计未改，仅向共享REVIEW_LOG追加交接。

## 修改前基线：已有通过与新增失败

旧a6b3c8d二进制SHA与上轮B报告相同，另存为`hier-a6b3c8d-before-c37-c43-c44`，
不会因新构建覆盖而把绿测误记成红测。其Release旧70方法本轮重跑：**70/70，12.630s**。
旧Debug/ASan的70项通过仅作为[上轮历史记录](INDEPENDENT_C35_C42_RESULTS.md)，未伪装本轮重跑。

| 基线 / 新增门禁 | 结果 |
|---|---|
| Release / ASan，9项语义方法 | 各3通过、6失败；44个subTest断言失败，0error/0skip，退出1 |
| Release / ASan，4项LibraryProvider API用例 | 各1通过、3失败；544断言中472通过、72失败，退出42 |
| Release，1项打开资源方法 | 失败；两个相邻增长subTest及总体增长共3个断言失败，退出1，5.858s |

语义控制通过：14个top×共享/逐实例的合法性、重复父体数组目标隔离、整变量非零set规则。
失败覆盖双向external角色、目标反向查询、step传播及拼接/切片/未知常量分类。
API的In控制通过，Out/InOut/Ref失败；DYNAMIC_SECTION确保两个模式和命名/位置均执行，
不因一个REQUIRE提前结束而把没跑的组合算作通过。失败输入编译errors=0，不用损坏HDL造红。

基线资源三档median RSS为24,674,304 / 179,650,560 / 1,729,167,360字节，
body仍5/6/7；故门槛失败确实来自打开物化增长，而非共享未启用或输入错误。
更早6518f80的B保留二进制作历史控制，同输入门槛通过，median为
8,568,832 / 8,568,832 / 8,667,136字节；这不是当前修复的替代证据。

本轮最初直接启动C++用错构建目录层级（漏`tests/`），是harness启动错误，修正后重新执行；
不记为产品红测或有效覆盖。缺失文件负例会打印预期诊断，不是意外失败。

## 当前快照：三档独立回归

| 配置 | Python语义旧70+新9 | Python资源1项 | C++公开API | 基础CTest |
|---|---|---|---|---|
| RelWithDebInfo | 79/79，14.737s | 1/1，0.214s | 26用例 / 2263断言通过 | 17/17 |
| Debug | 79/79，26.956s | 1/1，0.377s | 同上 | 17/17 |
| ASan+UBSan | 79/79，127.830s | 1/1，0.696s | 同上，无sanitizer报告 | 17/17 |

每档合计**80个Python方法**，无skip/expectedFailure；资源独立串行测量，不混进语义耗时。
C++计数为原18/1343+旧B API4/376+新B API4/544，不把多次执行重复累加成用例。
CTest显式选择unit、b_review_api、cli_version、verify_sharing_*、layering_*共17项；
没有把A新增测试或未构建目标计入B独立证据。新b_followup_api另独立执行。

新门禁同时核对：source externalRefs和process reason.at；target drivers/loads的两个reach
及signal reason.at；step back/forward；库方向In/Out/InOut/Ref×命名/位置；非访问方向
complete且空；重复父体u[0]与u[1]非干扰。常量分类用手写oracle核对普通拼接、反向
声明切片、嵌套拼接、等价拆分及x0邻接，保留整变量0010仍set的既有规则。
先前复合端口、未知宽度blackbox、层次引用自检与常量切片断言随旧70项完整重跑。

## C-44资源对照：只测open+info

使用B原M0 `fixtures/synthetic/gen.py`，fanout10、depth3/4/5、unique0；
实例1112/11112/111112，body5/6/7。各档三个新进程、固定种子4437乱序。
用wait4取各子进程峰值RSS，macOS字节 / Linux KiB规范为字节；缺数据不skip。
相邻median≤3倍、总体≤5倍在运行修复版前冻结，非A的“4倍+16MiB”门槛。

| 配置 / median RSS字节 | 1112实例 / 5 body | 11112实例 / 6 body | 111112实例 / 7 body |
|---|---:|---:|---:|
| a6b3c8d Release | 24,674,304 | 179,650,560 | 1,729,167,360 |
| d98a124 Release | 8,568,832 | 8,568,832 | 8,683,520 |
| d98a124 Debug | 15,302,656 | 15,695,872 | 15,990,784 |
| d98a124 ASan+UBSan | 35,323,904 | 35,815,424 | 36,225,024 |

当前27个样本（RSS和时间）、基线三档median/每次时间、输入SHA保存在
[资源审计JSON](INDEPENDENT_C37_C43_C44_RESOURCES.json)。输入SHA分别为：

- depth3：`8199345efb516717de9580ef5545eddb177d5e699a40587f7161dfc4dd9712a9`
- depth4：`97c5a49467c3f0ba1702de822fac651adc8693451623a00f4bda662ba7ef1546`
- depth5：`cc8d4da08c884ccb2b807fca8e9da01c4610198a5218f688400fdf77544280bc`

openC910也用相同B测量器独立打开三次，body均503：旧版RSS
1,152,368,640 / 1,152,335,872 / 1,152,368,640字节；当前
450,166,784 / 450,150,400 / 450,166,784字节。
新openC910计时与随后B构建/ASan任务有重叠，仅记录观察值，不用于加速比或时间SLA。
合成新版Release约10–14ms接近10ms轮询分辨率，不声称真实耗时为零或精确亚10ms。

60s每子进程/240sCTest是harness防悬挂限时，非产品取消预算。这里证明已报告的无
外部引用共享打开回归被捕获并消除；不覆盖密集外部引用上界、完整连接查询内存、
所有平台或M7的绝对峰值/打开/取消预算。

## 两层故障注入与恢复

沿用冻结B工具，输出mutation四项array_occurrence、precision、multi_driver、hier_ref
均被独立原断言捕获；control先通过、有真实注入audit、FAIL而无ERROR，runner退出0。
这是oracle敏感性，不把输出代理当内部checker证明。

验证前生成事实mutation三项全部通过：

- drop_read / drop_write：verify-facts非零、mismatched>0；重建y/z完整写目标、
  conservative/all的a/b/rst_n本地依赖，保留clk clock与rst_n async。
- erase_init：自检失败、Slang对照0、mismatched>0；proc与连接查询partial/unsupported。

每项注入前与finally恢复后control均mismatched=0；恢复源SHA、删除精确生成对象后
重建，不留下mutant二进制。恢复后的Release再次跑**79/79，16.106s**。
临时CMake登记也已恢复，detached实现树干净。

## 当前快照的真实设计回归

Release与ASan/UBSan均已独立执行下列全部项，计数一致、退出0，无sanitizer报告。

| 设计 | verify-sharing：实例 / 共享body / 逐实例body | different / failed |
|---|---|---|
| processor_core | 324 / 17 / 122 | 0 / 0 |
| openC910 | 15848 / 503 / 15848 | 0 / 0 |

| 设计 / 模式 | slangCompared | selfChecked | skippedExternal | mismatched |
|---|---:|---:|---:|---:|
| processor_core/shared | 306 | 597 | 0 | 0 |
| processor_core/per-instance | 562 | 737 | 0 | 0 |
| openC910/shared | 42728 | 0 | 0 | 0 |
| openC910/per-instance | 296867 | 0 | 0 | 0 |

不把真实设计skip=0当成externalRefs覆盖；其方向、skip、partial/at由小型KAT单独断言。
输入filelist沿用旧报告，只复用输入，不复用旧通过结果：
`../nx9000/design/processor_core/processor_core.vc`，top processor_core；
`../openc910/design/filelists/C910_asic_rtl.fl`，top openC910。
CODE_BASE_PATH为隔离树`core/build-b/openc910_base`，其gen_rtl只读链接工作区openc910/design。
清单SHA分别为`50620bceb5572a78800fd80cae21df4b77655cdbfc9050c42cc474e9d78872fb`、
`1cf05df7d0e1c2f47a6ad696fde959276ba495d2752df2f5bcd537c7a6fa60e6`；清单哈希不替代全量输入哈希。

## 指纹、歧义与后续边界

macOS26.0.1/arm64，Slang12.0.0，B本机源/二进制SHA-256：

- d98a124 Connections.cpp（恢复后）：`395ee97f61a80955c617b39c33c3b9e76c0965311bc760febdd33d5df4fc6183`
- 当前Release（最后恢复重建）：`de49d8d5c19b8270a65d982af718d28b902e7b2d192689700e511bc408826178`
- 当前Release（本轮资源测量及首次绿测前）：`71b0add720f4c0421452126ed27475e6f21103361d680ac3a2a0270dab0534a2`
- 当前Debug：`0286914e7cf889d81081a2ed44f45f991f68850262065cdd32f32af2e25a85a3`
- 当前ASan/UBSan：`8bf3766ecc5f01b97929168bcd7b29cdefb67a1b05831e14bcb59b93950d8d1d`
- 红测a6b3c8d Release：`fe9f61414fa6a2aefdc635118de2d652a4bfd3275449238a39e2ca1644344eee`
- 红测a6b3c8d ASan：`96a1a78edb5b7b0c0a501c5939fdec1378750f8e5835607adf66eee695a326a8`

C-45的§4.1实际目标隔离与§5.4旧广播说明冲突仍待A同步；本轮依据已接受的§4.1，
不放宽未访问兄弟complete断言，也不宣称支持完整层次引用解析。C将其列Low文档待办，
不阻塞三项代码问题关闭。无库引脚方向unknown的具体端点/reason仍是独立规范歧义。
Linux、覆盖率、TSan未执行；B-11～B-13及M3–M7追踪、协议/Schema/TS一致性、
取消/并发、UI/IPC与预算没有因本报告而验收。新工程会话保存/恢复不在第一版范围。

## 复现

在B测试树`core/tests/m2`，HIER_BIN指B自行构建的固定产品快照：

```sh
HIER_BIN=/absolute/path/to/b-verify/core/build-b/hier python3 -m unittest -q test_deps test_pins test_conn test_verify test_contract test_boundaries test_review_edges test_review_followup
HIER_BIN=/absolute/path/to/b-verify/core/build-b/hier python3 -m unittest -q test_open_scaling
HIER_BIN=/absolute/path/to/b-verify/core/build-b/hier python3 run_mutations.py
python3 run_internal_mutations.py --source-root /absolute/path/to/dft_hierachy-b-verify --build-dir /absolute/path/to/dft_hierachy-b-verify/core/build-b
```

Debug/ASan切换HIER_BIN；资源测试独立串行。C++新`b_followup_api`链接同一套公开库，
HIER_FIXTURES指B的core/tests/fixtures。正式合入冻结测试已有CMake登记，隔离树的临时
登记已撤回。内部mutation只允许detached b-verify和精确固定SHA，期间勿并发构建同一源。
