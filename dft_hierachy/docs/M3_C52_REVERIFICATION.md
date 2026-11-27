# Agent B：8a944f0 C-52修复独立复验（2026-10-11）

原生C-52四模式资源门禁 **4/4通过**，EmptyLibrary/custom miss/一个真实库命中最大档由约676.6MiB恢复约8.2MiB，原3×相邻/5×总体阈值未改。C-51正确诊断、库语境和查找回归保留。**B冻结的C-52资源反例已通过，不放行整个M3。** 收尾收到C独立复核：C已正式关闭C-52、保持C-51关闭。下面仅记录B自己执行的证据，不转录C的数据。

## 固定对象、规范、独立性

- 产品8a944f0bf8a32ca4c4b0b321f478d7a392ff6511，修改前ec234597141b6ae8ca87d2fbe1863ff001d37730。B自己的detached验证树独立重编Slang及Core消费者，不复用A二进制或执行结果。
- 主树DESIGN SHA487211cec837aed48879f9915372780f1c03b7b0adf61cccbcbc4bb36a6e89e0，§4.1/4.8/5.5.3/5.5.5。读取强制REVIEW_LOG看到A修复概述，故不标严格盲审；未读A实现/diff/自测代码或C探针定oracle。
- 原资源冻结6e1a14f、lookup85056ef、C-49/C-51及原80 CLI/未来API全部保留。新增occurrence三API先冻结 **a16dd819e9666374ca1bb15fbd6589f132fa5482** 再跑红基线/新产品，不skip/xfail、不放宽期望。
- 新输入library_occurrences.sv SHA=ee6863a49e8418da617b249e8d2ecea26e9958eedb710ca1d3def18ef8e34605；新API SHA=28c399e6bd4bb10c441596d1b803b789048120b9f906bf4ba287284f6b174653。
- 计划及输入/预期/判据：[M3_C52_REVERIFY_PLAN.md](M3_C52_REVERIFY_PLAN.md)。B分支仍以旧产品为底，不把其中旧DESIGN当本轮主树契约。测试/docs改动不修改产品/公开模型/IPC/工程格式。

## 资源红基线与当前原生结果

macOS arm64 RelWithDebInfo，fanout10/depth3,4,5/unique0，四模式各三档×三次独立新进程，seed524437乱序档次。只公开open/snapshot/diagnostics；error0/fast/bodyCount=depth+2均通过，时间只记录。复用旧C-44 wait4测量与相对RSS门禁，不引入绝对M7 SLA。

| 模式 | 旧ec23459 depth3/4/5 RSS bytes中位数 | 当前8a944f0 depth3/4/5 |
|---|---|---|
| none | 8568832 / 8568832 / 8699904 | 8568832 / 8568832 / 8617984 |
| EmptyLibrary | 14663680 / 77840384 / 709443584 | 8568832 / 8568832 / 8617984 |
| custom miss | 14663680 / 77840384 / 709443584 | 8568832 / 8568832 / 8617984 |
| 一个真实库命中 | 14680064 / 77856768 / 709459968 | 8568832 / 8568832 / 8634368 |

旧本轮重新实际执行1通过/3失败、退出1（9失败断言，非9个产品缺陷）；新4/4、退出0。外部runner登记的CTest资源入口也1/1、退出0，底层四方法全部运行，无零匹配假绿。原2a58463四模式绿基线保留旧报告，不冒充本轮再次执行。

## 三配置语义/既有回归

RelWithDebInfo / Debug / RelWithDebInfo+ASan+UBSan；HIER_TEST_M3=ON、HIER_BUILD_EXPERIMENTS=OFF。资源阈值只跑普通原生，不用sanitizer RSS冒充原生预算。严格-Werror无新增C++编译警告；原三个libhier_frontend重复链接警告及mimalloc配置建议保持。

| B实际集合 | 普通 | Debug | ASan+UBSan |
|---|---|---|---|
| 原42 CLI（expr27/lookup9/new lookup4/相关errors2） | 42/42，退出0 | 42/42，退出0 | 42/42，退出0 |
| 原C-49库语境公共API | 5/5，13852断言 | 同左 | 同左 |
| 原C-51诊断公共API | 3/3，608断言 | 同左 | 同左 |
| 原lookup公共API | 5/5，10365断言 | 同左 | 同左 |
| 新重复occurrence/层次目标API | 3/3，1768断言 | 同左 | 同左 |
| 原M2/基础/共享/分层回归 | 27/27，退出0 | 27/27，退出0 | 27/27，退出0 |

API均退出0、0 skip，运行未出现sanitizer内存/UB报告。M2普通/Debug/ASan耗时21.66/35.58/158.64秒。原C-51单occurrence仍精确error1、消息及行号、三次重查不重复、verify拒绝误成功；合法8位对照仍complete并依赖完整。

完整普通80 CLI实际 **45通过/35失败/0 skip、退出1**：7个step字段/unknown边界，28个trace/source及相关错误入口缺失，未到达的断言不计执行过。原混合15项M3 API和D-01未来3项本轮未编译/运行；独立API目标避免混合缺接口，不作为这些未来用例通过。原资源四方法单列，不加入CLI80分母。

## 新冻结专项及其修改前行为

本轮先在ec23459自己链接新API，**3/3、1768断言、退出0**：这些是原本已正确行为的回归门禁，不将其称作旧产品新增红例。旧资源红测才是C-52反例。

- 四个同定义unpacked或streaming8→库6 occurrence：设计可浏览但有具体错误，fixture与连接行2/11正确；四子实例ref独立；三次逐个bindings/proc查询后diagnostics rows/count稳定，verify拒绝无错误通过。
- 四个合法streaming8→库8：每occurrence pin/process独立，使用所属a8/conservative/all/data，根8、Write目标引脚8、exprMap identity8；三次重查，verify成功；保存值脱离Design生命周期可读。
- 库input A8只读取n2.s：四同定义target中仅n2 loads partial/hier_ref指向其ref；其drivers完整空，其他三者两个方向都完整空；local/hier reach、shared/per-instance、cache0/64MiB全测。verify mismatched0且实际skippedExternal>0。

歧义单列：DESIGN未规定“多个occurrence同一错误源码位置”诊断按location或occurrence去重，因此新增用例只规定具体非空错误/位置/同快照稳定，不偷采A的全局error1或4作为规范；原单occurrence C-51精确error1不变。没有猜provider调用次数，也没有内部hook。

## 新依赖构建的观察与边界

B正常构建实际重编本地Slang扩展及三配置Core/静态消费者。上游Compilation.h/.cpp在开始/过程中/结束SHA完全相同：fdff61304e3460ccd98191b5fef0eaa355a761ada50d40e64ecfd59b2319654c / 11ae44ba59e54486f64d46df3b4a800af5dc3c425934e156f1c0ad05b880c664。各B build-local overlay SHA一致：头29d84ffd01536f69ee9f6a5cce4f0884615b1dd89ed346f9d5911c2959b5bf25，源dd29389422cbb7c7101e6878ccaddd0c8945557d47fc35669c943662565d3bfe；三静态归档每个实际含一个Compilation.cpp.o，旧build残留.o文件不等于归档重复成员。

这些是构建/集成观察，不是扩展生命周期、异常边界、源码SHA拒绝策略、未支持Slang tag限制的正式C审结论。未篡改共享上游源、未读overlay源码/实现定测试预期，也未运行A故障注入或将其转记B证据。观察protocol2/schemaVersion3/原frontend sourceId，不当外部Slang ABI或M4权威Schema/TS一致性证明。

## 实际复现命令 / 未执行

在B验证树，三build分别执行：
```sh
cmake --build core/build-b --target hier hier_tests b_review_api b_followup_api -j4
ctest --test-dir core/build-b \
  -R '^unit$|^b_review_api$|^b_followup_api$|^cli_version$|^verify_sharing_|^layering_|^m2_' \
  --output-on-failure
```

B测试树使用各自HIER_BIN运行run_baseline.py的42/80集合；外部independent_api指定B固定头/库/Catch2源/配置（ASan显式B_SANITIZE=ON），重编并分别执行b_m3_library_occurrence、b_m3_library_diagnostics、b_m3_expr_library、b_m3_lookup_increment的--reporter xml。普通另构建b_m3_library_open_probe，以原test_library_open_scaling.py和登记CTest执行。

所有数据/逐方法状态/初始红例/构建和回归日志/输入与binary SHA见[m3_c52_reverification.json](m3_c52_reverification.json)。没有执行whole check.sh、A测试、web/M4 NDJSON/React/Electron IPC、Linux/远端CI/TSan、真实设计verify-facts/verify-sharing、带库真实设计绝对性能、mutation、执行中取消/局部成本适配、全面任务/文件释放或异常注入。首版无会话持久化，工程保存/迁移不适用。完整构建只指明确列出的目标，不称默认全M3 build/CTest通过。

交接C：B独立资源反例和新增occurrence/target oracle均绿，与C已作出的C-52关闭结论相符；本地Slang扩展审查归属C，不冒充B运行时异常注入证据。交接A：原样吸收新增测试和本报告，按既定路线继续step/trace/source。B不修改产品、不变更路线、不宣称整个M3放行。

收尾格式修正：C指出历史B报告M3_LOOKUP_VERIFICATION.md末尾多一个空行；本次仅移除该空行，不改写内容、oracle或历史执行结果。没有运行A生产跨提交diff，故不宣称其整体空白检查已经通过。
