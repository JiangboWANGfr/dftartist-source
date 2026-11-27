# Agent B：C-51 / 查找单元独立复验（2026-10-11）

固定产品 **ec234597141b6ae8ca87d2fbe1863ff001d37730**。B自建工作树及三配置，不使用A二进制、自测结果或实现代码推导期望。读取强制REVIEW_LOG已看到A交接，故不声称严格盲审。主树DESIGN SHA为487211cec837aed48879f9915372780f1c03b7b0adf61cccbcbc4bb36a6e89e0；B分支仍以旧产品为底，其旧DESIGN文件不冒充本轮契约。

## 独立冻结与验收条件

测试分支test/m3：首冻 **a36cf38952cef5c4cd916ef59eb9f06fa5bbda08**；按原文字面搜索契约纠正B自己的控制前提后，最终冻结 **85056ef4987046170e3e3983038c6825c1dba0e6**。输入、预期、判断依据与未测边界见[M3_LOOKUP_FREEZE_PLAN.md](M3_LOOKUP_FREEZE_PLAN.md)。

新增4 CLI方法、5公共API用例；原76 CLI、15 M3 API、C-49/C-51和D-01冻结均保留，原文件对603634e差异为零，无skip/xfail。

- 六种命中手算136项；kind顺序、元数据、真实HDL路径回查；同快照limit1/7/11变换分页、去重/完整、冷热、两模式/cache0/64MiB等价。
- scope alpha.u_extra手算12项，port/signal集合7项；空kinds无结果、省略全部、重复/顺序规范化；游标绑定text/kinds/scope/方法/快照，不绑定limit。错查询bad_request，跨快照stale_cursor，非法游标和无效limit拒绝。
- 新fixture手算20 occurrence：top2/leaf12/blackbox3/primitive3，6定义含unused。定义分页含顶层、缺失模块和buf，不折叠共享实例，unused完整空。实例search的公开def字段控制与instancesOf逐项对照。
- 二维(0,1)×(-2,-1)真实数组及escaped数组；escaped字面grid[1][-1]与真实数组元素区分，所有child.pathText回查；有效但不存在的下标完整空，错误语法bad_request，多top省略前缀不默选、不做任意后缀查找。
- 旧children与新search：limit1有效，0/负数/非数字/尾随垃圾/小数/大数溢出拒绝。
- 有效预取消search/instancesOf/resolvePath返回Cancelled；冷/热、cache0/64MiB，原cursor反复重试与正常页相同，最终全页仍完整。保存页在Design销毁后可读。

首轮API4通过/1失败、9713成功/16失败断言是B控制前提错误：搜索edge_a同时命中后代pathText，不是精确定义过滤。纠正为公开def字段筛选，手算12/3/3/1/1/0、分页及错误断言不改；第一次结果保留在机器证据，不报作产品缺陷。最终API5/5、10365断言通过。

## 实际运行

macOS arm64；RelWithDebInfo / Debug / RelWithDebInfo+ASan+UBSan。产品配置HIER_TEST_M3=ON、HIER_BUILD_EXPERIMENTS=OFF，第三方源码锁定复用但产品自行编译。C++严格-Werror无新增警告；原三目标重复库链接警告和mimalloc配置建议仍存在。新独立API外部CMake只链接B固定快照同配置静态库；Debug Catch2 d后缀、ASan编译/链接均启用sanitizer。

| B实际集合 | 普通 | Debug | ASan+UBSan |
|---|---|---|---|
| 原表达式27 + 原lookup9 + 相关错误2 + 新CLI4 | 42/42，退出0 | 42/42，退出0 | 42/42，退出0 |
| 新lookup公共API | 5/5，10365断言 | 同左 | 同左 |
| 原C-49库输入公共API | 5/5，13852断言 | 同左 | 同左 |
| 原C-51诊断公共API | 3/3，608断言 | 同左 | 同左 |
| 既有M2/基础/分层等回归 | 27/27，退出0 | 27/27，退出0 | 27/27，退出0 |

新API均退出0/0 skip，sanitizer无内存/UB报告。M2回归耗时20.42/33.93/150.63秒。C-51两类非法库输入的错误数1、具体message/file/line、三次重查不丢失/重复、verify拒绝误成功均通过；真实声明对照和合法8位streaming也通过。**B冻结的C-51反例已通过，交提出方C正式复核关闭；不代C关闭。**

完整普通80 CLI实际 **45通过/35失败/0 skip，退出1**；其中原76为41/35，新4为4/0。35仍是7个step必需字段/unknown边界失败、28个trace/source/相关错误入口缺失。未到达断言不算运行过，完整M3仍未放行。原混合15项API、D-01三项未来API本轮未编译/运行，不以独立lookup5例冒充其通过；主产品树尚未合入本轮测试，不把外部runner说成主树默认CTest。

## 修改前红基线

本轮先在原固定2a58463、原B构建上运行：
- 新4 CLI：0通过/4失败、退出1、0 skip。fixture六定义/20实例控制已通过；def-instances/resolve-path/search入口缺失。旧children对1x和1.2实际成功，而应bad_request。
- 新lookup API首次编译退出2，ObjectHit/HitKind/SearchQuery/search等未交付，运行0用例。前提纠正不新增旧接口；该编译证据是首冻版本，不冒充最终版本在旧head再次运行。
- 原C-51 API：1通过/2失败，520成功/64失败断言，退出42。此前27项表达式/M2旧head通过结果见旧报告，不计作本轮新执行。

随后切固定ec23459，三配置重新编译产品和API；未读实现、diff或A测试。新产品schemaVersion3/protocol2只是观察，公共模型消费者重新编译，不能当权威机器Schema/TS结构一致性或ABI二进制兼容证明。

## 复现命令

在B验证树：
```sh
cmake --build core/build-b --target hier hier_tests b_review_api b_followup_api -j4
ctest --test-dir core/build-b \
  -R '^unit$|^b_review_api$|^b_followup_api$|^cli_version$|^verify_sharing_|^layering_|^m2_' \
  --output-on-failure
# Debug/ASan分别替换为build-b-debug/build-b-asan
```

在B测试树core/tests/m3：
```sh
HIER_BIN=/absolute/dft_hierachy-b-verify/core/build-b/hier python3 run_baseline.py \
  test_expr test_expr_safety test_expr_boundaries test_lookup test_lookup_edges \
  test_errors.Errors.test_path_syntax_errors_are_not_empty_success \
  test_errors.Errors.test_search_rejects_bad_scope_kind_and_page_size_after_success_control
# 完整80另加test_inputs/test_step/test_trace/test_source并使用整个test_errors
```

API用core/tests/m3/independent_api，传HIER_CORE_ROOT、HIER_CORE_BUILD、HIER_CATCH_SOURCE、CMAKE_BUILD_TYPE（ASan加B_SANITIZE=ON），构建b_m3_lookup_increment/b_m3_expr_library/b_m3_library_diagnostics；每个以--reporter xml执行。逐方法状态、Catch2结果、回归尾日志、SHA见[m3_lookup_verification.json](m3_lookup_verification.json)。

## 未执行 / 不适用

预取消不是执行中取消；返回条数不是内部物化成本。确定性半成品取消、成本计数/高扇出有界物化、真实缓存淘汰需受C审适配，仍未验收；未用sleep竞争、hook或假产品。固定查询顺序/冷热不等于完整随机历史测试。未运行whole check.sh、A测试、web/M4 NDJSON/React/Electron IPC、Linux/远端CI、真实设计、带库真实设计性能、mutation、超时/并发和全任务资源释放。M4机器Schema/TS一致性、M5/M6 UI留待对应交付。首版无session持久化，工程保存/迁移不适用。未修改产品、公共API、DESIGN或旧工程。

后续请A保留本冻结，推进既定step/trace/source；请C独立核对C-51生命周期/带库成本和lookup索引发布/游标边界。B此次结论只针对已实际运行的专项，不宣称完整M3验收。
