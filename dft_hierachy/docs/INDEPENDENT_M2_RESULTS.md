# Agent B：M2独立复跑与mutation记录（2026-10-10）

## 固定输入与测试边界

- 实现快照：`6518f80508d4911d22f0a2bc3e46cbe46dabb985`。
- 已交付冻结测试：`e401736`；本轮3项增补先冻结为`1502f4c`，原断言不变。
- 独立mutation工具/fixture：`861d8a2`，不调用A的mutation脚本。
- 测试工作树：`dft_hierachy-test-m2`；实现仅检出到独立、detached的
  `dft_hierachy-b-verify`，在该目录自行配置和构建，不使用A的在途二进制。
- 判断依据：正式DESIGN 4.3–4.9、5.3–5.4、10及用户A-M2-01决定。
  测试输入/手写映射/预期在查找实现注入点前定义，未因实现输出放宽断言。
- B-10按5.4支持矩阵关闭：片段级unresolved仅预留，不计实现/测试；支持的ANSI/
  non-ANSI复合端口仍必须完整映射，interface整体unresolved仍须正确传播partial。

冻结后仅为**注入缺陷**查看Connections.cpp的生成事实→独立验证边界，
不是基于A实现重新推导oracle或接手C代码审查。注入和恢复均用apply_patch，
只改隔离工作树；A、旧工程和参考仓库均未改。

## 已执行结果

| 项目 | 独立结果 |
|---|---|
| RelWithDebInfo，六组Python M2测试 | 52/52通过，0skip（含ANSI/interface inside新增3项） |
| mutation后恢复的RelWithDebInfo再次全量M2测试 | 52/52通过，0skip |
| 原有导航/共享/分层CTest | 16/16通过 |
| C++公共API单元测试 | 18用例、1343断言通过，包含B的4个生命周期/版本测试 |
| Debug / ASan/UBSan，六组Python M2测试 | 各52/52通过，0skip；14.803s / 85.362s |
| Debug / ASan/UBSan，原有CTest | 各16/16通过 |
| Debug / ASan/UBSan，C++单元测试 | 各18用例、1343断言通过 |
| 输出层mutation | 4/4被独立冻结断言捕获；各control先通过、注入audit非空 |
| 生成事实层mutation | 3/3满足独立失败计数与运行时退路断言；每项恢复后重新构建并确认mismatched=0 |

首次用宽泛CTest过滤时，额外选中了A的`connection_state`，但本次仅构建B所需
`hier/hier_tests`，该A测试二进制不存在而报Not Run；这不是产品失败，也不记为通过。
随后明确选择原有1–16项独立执行，全部通过。A新增6组测试不作为B的独立覆盖证据。

## 独立真实设计回归（RelWithDebInfo与ASan/UBSan）

| 设计 | verify-sharing：实例/共享body/逐实例body | different/failed |
|---|---|---|
| processor_core | 324 / 17 / 122 | 0 / 0 |
| openC910 | 15848 / 503 / 15848 | 0 / 0 |

| 设计/提取模式 | slangCompared | selfChecked | skippedExternal | mismatched |
|---|---:|---:|---:|---:|
| processor_core/shared | 306 | 597 | 0 | 0 |
| processor_core/per-instance | 562 | 737 | 0 | 0 |
| openC910/shared | 42728 | 0 | 0 | 0 |
| openC910/per-instance | 296867 | 0 | 0 | 0 |

两个构建独立执行上述全部命令，计数一致，均退出0，无sanitizer报告。
真实设计没有externalRefs覆盖时不声称验证了该路径；
bits.sv的skippedExternal>0与partial/hier_ref由独立52项测试专门断言。
共享等价不是正确性证明，不能替代手写KAT。

## 第一层：输出mutation（oracle敏感性，不是运行时退路证明）

`mutant_hier.py`只在真实CLI成功后改公共JSON。`run_mutations.py`先跑同一测试的
原始control，之后要求audit证明实际注入、测试以断言失败且没有ERROR。
CLI启动失败、JSON解码错误、未注入或control不通过都不能记为“杀死mutant”。

| 故障 | 注入与对应冻结测试 | 结果 |
|---|---|---|
| array_occurrence | 把u_arr[1].d绑定错误复用为u_arr[0].d；Occurrences.bindings_of_each_occurrence | control过；共享/逐实例2个subTest失败，捕获 |
| precision | 把精确Dep的precision改成conservative；RuleTable.every_row | control过；80个subTest失败，捕获 |
| multi_driver | 删除查询返回的一个真实process；MultipleDrivers.all_real_drivers_are_kept | control过；2个subTest失败，捕获 |
| hier_ref | 将hier_ref的partial伪装complete；HierarchicalReferences.a_signal_written_through_a_hierarchical_reference | control过；2个subTest失败，捕获 |

这是对这些故障模型的断言反向验证，不声称穷尽所有实现缺陷，也不以输出proxy
声称内部checker已发现错误。后者由下一层单独验证。

## 第二层：生成事实mutation（验证前注入，独立检查退路）

`fallback_events.sv`是独立fixture：一个always_ff写y/z，过程体读a/b/rst_n，
事件读clk/rst_n。`check_internal_fault.py`的预期仅据fixture与DESIGN第10节。
注入点在生成的proc.writes之后、独立访问/需求投影验证之前；不改任何oracle遍历。

| 故障 | 独立验收断言 | 结果 |
|---|---|---|
| drop_read | 删除一个data Dep；verify-facts非零且mismatched>0；y/z完整保留，每目标依赖a/b/rst_n的conservative/all，并保留clk clock与rst_n async | 通过 |
| drop_write | 删除z的完整写目标；同样非零且mismatched>0；不仅修剩余y，必须重新发布y/z两个完整写目标与上述保守/事件依赖 | 通过 |
| erase_init | 删除only_init的init写；Slang对照0、自检>0、mismatched>0、非零；proc.writes为空，proc和initialized的drivers/loads均partial/unsupported | 通过 |

每次注入前control成功、mismatched=0；每次finally恢复源文件SHA并强制重建，
恢复后再次独立control成功、mismatched=0。防止秒级mtime复用mutant对象文件，
只删除精确的生成物 `CMakeFiles/hier_frontend.dir/frontend/src/Connections.cpp.o`，
随后重建它；不删除源码，不reset工作树，不覆盖A的修改。

## 指纹与复现

- 恢复后Connections.cpp SHA-256：`db1577239af9b6b5bfa9ae9b1d4f67374edd4e1d1ade7ce514ab2167f1139eca`。
- 恢复后本机release hier SHA-256：`b15c888ca088d99dee1db7d40cb8b0a3ed742f8b386f8a2bc9a2aac0b7995792`。
- processor_core.vc SHA-256：`50620bceb5572a78800fd80cae21df4b77655cdbfc9050c42cc474e9d78872fb`。
- C910_asic_rtl.fl SHA-256：`1cf05df7d0e1c2f47a6ad696fde959276ba495d2752df2f5bcd537c7a6fa60e6`。

机器为macOS/arm64、AppleClang17、Slang12.0。filelist哈希仅锁定清单，不替代
整个HDL输入内容哈希；以上不声称完成M7性能/内存预算验收。

从B测试树运行（HIER_BIN必须指向自行构建的固定实现）：

```sh
cd core/tests/m2
HIER_BIN=/absolute/path/to/b-verify/core/build-b/hier python3 -m unittest -v test_deps test_pins test_conn test_verify test_contract test_boundaries
HIER_BIN=/absolute/path/to/b-verify/core/build-b/hier python3 run_mutations.py
cd ../../..
python3 core/tests/m2/run_internal_mutations.py --source-root /absolute/path/to/dft_hierachy-b-verify --build-dir /absolute/path/to/dft_hierachy-b-verify/core/build-b
```

内部mutation脚本限定detached的b-verify工作树、精确实现head及初始源SHA；
必须有apply_patch可执行入口，期间不得在同一source/build上并发改写或构建。
若将来实现head或注入点变动，先审查测试适配，不静默换oracle。
Debug/ASan的52项命令仅将HIER_BIN换为对应独立构建目录的hier。

真实设计命令从隔离实现树执行：

```sh
core/build-b/hier verify-sharing -f ../nx9000/design/processor_core/processor_core.vc --top processor_core
core/build-b/hier verify-facts -f ../nx9000/design/processor_core/processor_core.vc --top processor_core
core/build-b/hier verify-facts --per-instance-bodies -f ../nx9000/design/processor_core/processor_core.vc --top processor_core
```

openC910用`-f ../openc910/design/filelists/C910_asic_rtl.fl --top openC910`；
CODE_BASE_PATH指向本次构建内专属openc910_base，其中gen_rtl只读链接到
工作区openc910/design。测试不改真实设计。

## 结论边界

上述是B自己执行的证据，不引用A的自测当通过依据。B-11～B-13、M3完整追踪、
M4客户端/协议、M5/M6 UI/布局、M7性能/释放预算仍未据此通过；Linux未跑。
本轮结果仍须交C独立审查与最终CI门禁，不把B子集通过等同所有SystemVerilog正确。

复跑期间REVIEW_LOG新增C-35～C-42的确定反例，C结论为M2不放行。
本报告记录的是原冻结52项子集与mutation结果，不抵消这些缺陷。
B正在将公开反例及边界扩展为新的独立KAT，并在未修复快照上先记录红结果；
保持旧断言不变，修复后的复核另记，不能把当前子集全绿称为M2验收通过。

后续B已在同一隔离工作树重新固定到修复交付a6b3c8d并独立构建验证；
该新快照的18项增补红→绿与全部复跑证据见
[INDEPENDENT_C35_C42_RESULTS.md](INDEPENDENT_C35_C42_RESULTS.md)。本文件的旧快照结果不变。
