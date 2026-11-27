# Agent B：C-52 provider非空共享打开回归（2026-10-11）

**C-52独立复现，仍为High阻塞。** 原查找/诊断专项的绿测保持，但不能据此放行带库共享打开或完整M3。C已正式关闭C-51；B不代C关闭新资源意见。

独立oracle冻结 **6e1a14f7ca270bd33918a20f78b9cea643c7cbe0**，未读A实现/diff/selftests或C探针代码。只依据DESIGN4.1、既有B C-44手写资源门禁及公开Design/LibraryProvider/SnapshotInfo。输入/预期见[M3_LIBRARY_OPEN_SCALING_PLAN.md](M3_LIBRARY_OPEN_SCALING_PLAN.md)。保留旧C-44、所有诊断/lookup测试，不改变3×相邻/5×总体RSS增长阈值，不设新绝对SLA。

四个独立方法：无provider、EmptyLibrary、未命中的自定义provider、top上恰好一个真实库命中。后两者避免EmptyLibrary特判掩盖回归。fanout10/depth3,4,5/unique0，三次独立进程、固定种子乱序；仅open/snapshot/diagnostics，没有search/连接查询。Sparse在top插入一个A8←d8缺失单元，重复体中不加cell；公开errorCount0、fast、bodyCount=depth+2均通过。

普通macOS arm64，峰值RSS bytes的中位数：

| 模式 | 旧2a58463 depth3/4/5 | 当前ec23459 depth3/4/5 | 相对增长门禁 |
|---|---|---|---|
| 无provider | 8568832 / 8568832 / 8650752 | 8568832 / 8568832 / 8699904 | 通过 |
| EmptyLibrary | 8568832 / 8568832 / 8650752 | 14663680 / 77840384 / 709443584 | 失败 |
| 自定义未命中 | 8568832 / 8568832 / 8650752 | 14663680 / 77840384 / 709443584 | 失败 |
| 一个真实库命中 | 8568832 / 8568832 / 8667136 | 14680064 / 77856768 / 709459968 | 失败 |

**修改前基线4/4通过、退出0；当前1通过/3失败、退出1，9个失败断言，不是9个不同产品缺陷。** 三个非空provider的两档相邻和总体增长均违反已冻结阈值。所有4×3×3组测量都有error0/fast/正确body数，不把对外共享字段当作内部未展平证明。当前最大档约676.6MiB，旧约8.3MiB。

冻结后先跑当前ec，再切B自己的detached树到2a并重新编译hier/公开probe；完整旧基线通过。恢复ec、重新编译产品/全部B原生API/probe，再测四模式得到同样1/3、相同中位数。恢复后原生42 CLI、lookup5/10365、C-49库5/13852、C-51诊断3/608及M2回归27/27（17.35秒）均通过，验证树干净固定ec。初次新目标未生成Make规则，重新运行外部CMake配置后构建成功；不是语义失败，没有调整测试预期。

三配置先前结果与完整80 CLI45/35见[M3_LOOKUP_VERIFICATION.md](M3_LOOKUP_VERIFICATION.md)及e9a1439；旧/新/恢复的测量、输入hash、binary hash、回归与返回码见[m3_library_open_scaling.json](m3_library_open_scaling.json)。B测试分支generator depth5未插入库cell的实际SHA=cc8d4da08c884ccb2b807fca8e9da01c4610198a5218f688400fdf77544280bc；sparse depth5 SHA=693cd22b2854454f8aa544569931d1c60ea159ce87a0b4416db62c8972167208。5807cd6报告曾误写C输入hash，机器证据自始保存B实际hash，本提交只纠正文档，不改输入/oracle/结果。

命令在B测试树（可换等价绝对路径）：

```sh
B_LIBRARY_OPEN_PROBE=/absolute/dft_hierachy-b-verify/core/build-b-api-boundaries/b_m3_library_open_probe \\
  python3 core/tests/m3/test_library_open_scaling.py
```

observer目标登记在独立external runner与B普通M3 CMake；主树尚未吸收，不冒充默认CTest。本次只跑原生资源比例，不拿Debug/sanitizer RSS作原生预算、未运行Linux或绝对M7资源上限；轮询只用于wait4完成/安全超时，不是取消竞态oracle。未执行内部归因/资源释放/取消成本适配、mutation或新IPC。实现修复由A负责，正式关闭由C负责。

交接A：原样吸收6e1a14f测试，优先修复C-52，保留C-51错误位置/verify门禁和外部引用共享排除。只修EmptyLibrary分支不足以通过miss/sparse门禁。B等待固定修复head再重跑，不修改产品或放宽阈值。
