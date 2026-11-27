# Agent B：固定表达式单元独立验收（2026-10-11）

## 结论

固定产品 `23dcc05429dcbb0fe5d9cc7e2814500f2e54acba`：原冻结表达式 **11/11**、M2 回归 **27/27** 在 RelWithDebInfo、Debug、ASan+UBSan 均通过。
新冻结补充 **8 方法中 6 通过、2 失败、0 skip**，三配置一致；两个失败揭示同一 **B-M3-01 High**：合法 streaming RHS 丢失已知输入依赖，却报告 complete，独立事实检查也错误通过。**表达式单元暂不放行**，不能用旧绿测覆盖新反例。

原60方法/15API冻结、M2历史放行及 C-46～C-48 的设计关闭保持有效；不宣称整个 M3 已交付。

## 固定对象与独立性

- 公开 DESIGN SHA-256：`e8217ff1afcddf83cee27814c70727310767544d74cd95636a4024e0f4d48ab2`；依据 4.4、4.5、5.5.3 设计预期。
- 原独立冻结 `92d8f08`，基线/严格类型 harness 适配 `00633bb`。补充试制 `df9a5c2`，纠正测试前提并重新冻结 **`69fdcea`**，再运行最终8方法。原60方法、原fixture、15API与旧M2断言均不改。
- 补充输入 SHA-256：`fb3da0009217f5385f686242d22b0a18433e33cf2bbf62c0f8a315252c9d610b`；逐项输入、手算位关系和判据见 [M3_EXPR_SAFETY_PLAN.md](M3_EXPR_SAFETY_PLAN.md)。
- B测试分支 `test/m3` 仍以旧产品 `e8f6087` 为底；实际运行产品来自独立 detached 工作树 `dft_hierachy-b-verify`，固定到 `23dcc05`。不查看 A 的表达式实现、diff、fixture或自测结果制定期望，不复用 A 的产品二进制。
- 自行重建三配置的 `hier hier_tests b_review_api b_followup_api`；使用锁定的第三方源码缓存，Slang sourceId=`07b9237d652d3a61abd674ae487791fcd97fc0b0a896a6c797b879f4620480db`，未更新依赖。
- 平台 macOS/arm64。HIER_TEST_M3=ON，HIER_BUILD_EXPERIMENTS=OFF；ASan+UBSan 另开 HIER_SANITIZE=ON。不运行 A 的 hier_expr_tests。
- 新 C-49/C-50 条目在本轮补充冻结和三配置运行后才读到；它们另作后续交接，不计作本轮 B 已验证、已冻结的反例。

## 实际执行

| 集合 | RelWithDebInfo | Debug | ASan+UBSan |
|---|---|---|---|
| 原 `test_expr`（11方法） | 11通过 | 11通过 | 11通过 |
| 新 `test_expr_safety`（8方法） | 6通过/2失败 | 6通过/2失败 | 6通过/2失败 |
| 合并明确选择的19方法 | 17通过/2失败，退出1 | 同左 | 同左 |
| 原 M2 及单元/API/CLI/分层回归 | 27/27，退出0 | 27/27，退出0 | 27/27，退出0 |

均0 skip；方法数不等于 shared/per-instance 的 subTest 错误事件数。ASan+UBSan未报告内存/UB问题，但语义失败仍使新集合门禁失败。

```sh
# 在 B 测试目录 core/tests/m3；三配置分别设置 HIER_BIN
HIER_BIN=/absolute/dft_hierachy-b-verify/core/build-b/hier \
  PYTHONDONTWRITEBYTECODE=1 python3 run_baseline.py test_expr test_expr_safety

# 在独立产品工作树；build-b-debug/build-b-asan 同样执行
ctest --test-dir core/build-b \
  -R '^unit$|^b_review_api$|^b_followup_api$|^cli_version$|^verify_sharing_|^layering_|^m2_' \
  --output-on-failure
```

M2为18个既有基础/API/CLI/共享/分层入口和9个M2入口；Python 79语义方法+1资源方法。原C++测试另直接执行，18/1343、4/376、4/544，共26用例/2263断言通过；缺失文件 stderr 是既有负例。三配置回归耗时18.40/32.26/153.28秒，仅作运行记录，不是性能SLA。

普通配置另跑原完整 **60方法：14通过/46失败/0 skip，退出1**。原基线4通过/56失败；表达式10个方法新通过，其余39方法仍停在新CLI入口/选项、7方法未满足新step字段。没有将后续未到达断言宣称执行过。15个新API用例本轮未编译/运行，历史未实现编译基线见 [M3_BASELINE_REPORT.md](M3_BASELINE_REPORT.md)。

逐方法状态、失败traceback末650字符、三配置回归尾日志、原60方法结果及原始反例输出见 [m3_expr_verification.json](m3_expr_verification.json)。

### 固定二进制 SHA-256

| 构建 | 初次验收 SHA-256 |
|---|---|
| RelWithDebInfo | `19b4ca8876cdd601efb93fdb3a11665b17647b6f7211fa9f55193502b9e30d94` |
| Debug | `1de455a932a8e24b813455001bdf40dcc401661497cb01f250b4326f68844183` |
| ASan+UBSan | `34ccfda14818bad119134c98cd306a7f9f0ac4433494dbad4f100f47d204810f` |

补测旧基线后，工作树恢复 `23dcc05` 并重建普通配置，SHA变为 `985e0bd229d7d0231662a91e0904e48d8b724f54e393a6929133be56343b3540`。没有假定重建字节相同：19方法及M2 27入口重新执行，结果保持17/2与27/27（16.01秒）；直接C++测试也通过。原60方法证据属于初次普通二进制，不转记为重建后二进制的新执行。最终产品工作树干净。

## B-M3-01 High：streaming RHS 漏依赖/摘要，检查器未拦截

合法、零编译错误输入：

```systemverilog
module stream_right(input wire [7:0] a, output wire [7:0] y);
  assign y = {<<{a}};
endmodule
```

判据：DESIGN 4.4 的流拼接为保守依赖，输出全部位依赖参数全部位；5.5.3 other.uses 是完整可解析摘要。对于这个8位输入，Write.deps和other.uses均应包含 a[7:0] 的 data/conservative/all。未知表达式值不能抹掉已知依赖；静态y左值的根结果→目标映射仍应identity8。

固定 `23dcc05` 实际：

- `proc x:0:0 --top stream_right <fixture>`：expr为other8、text非空，但 **uses=[]，唯一Write.deps=[]**；exprMap=identity8（这部分正确），completeness=complete。
- `loads s:0:0 --reach local ...`：result=[]、complete；`step s:0:1 --dir back ...`：process hop的next/map均为空、hasConservative=false、complete。已知数据路径消失，不是仅UI标签错误。
- `verify-facts ...`：退出0，`slangCompared=1 selfChecked=0 skippedExternal=0 mismatched=0`。检查器通过不能替代手写依赖oracle；不在未审实现时猜测内部根因。
- shared/per-instance、三配置同样失败，无 sanitizer 报告。

失败方法：`test_other_streaming_rhs_does_not_make_static_target_mapping_unresolved` 停在uses断言；`test_streaming_rhs_keeps_conservative_dependency_and_independent_checker` 的facts子场景停在deps断言，checker子场景仍通过。前一方法的后续映射断言未到达；identity事实由独立raw proc查询确认，不伪称其断言通过。

### 修改前归因

将同一独立产品工作树切到旧 `e8f6087a40433ac8c21aee45ed1afea5f82bbed8`，仅重建普通hier，SHA=`78b219796d6aaa235ee74f22bed4de021c7f8d2820ed6bc2eb7f761e5a1bb558`。最终新8方法实际 **1通过/7失败/0 skip**：合法性方法通过，6方法首先缺width等新契约字段，依赖方法在deps处失败；verify控制仍通过。

旧raw proc为Write.deps=[]，other.uses却包含a8（旧precision=exact/all），loads=[]，verify-facts仍mismatched=0。因此 **Write/loads/检查器漏检是旧有遗漏，other.uses为空是新快照相对旧输出的退化**。不将全部问题宣称本提交新引入，也不将旧exact标签当成正确新oracle。

交接 A 修复并提交固定head，保留a8保守依赖及摘要；C复核输出完整性和独立校验安全性。B不修改产品、不通过放宽断言来绿测。

## 测试安全退路、纠错和未覆盖项

- 两个合法streaming左值的位排列可手算，公开契约允许精确mapped，或无法安全映射时unresolved/unsupported且partial.at指向process；本轮实际走后者并通过。不是根据 A 当前实现强制“必须unresolved”。mapped分支每段仍严格检查位映射，原静态普通拼接必须mapped断言不变。
- 初始df9a5c2误把普通静态输入拼接当成port_expr，与DESIGN 4.4规则4冲突。明确登记为B测试错误，改为规则5的非平凡`~{...}`输入并重新冻结69fdcea后重跑；不计作产品缺陷、不隐藏第一次失败。
- 实际版本回复protocol=2/schemaVersion=2。没有据此宣称TS/机器Schema/ABI兼容通过；新API全阶段、高成本取消/缓存/淘汰适配仍待交付。
- 未执行整个check.sh、npm/web/React/Electron IPC、Linux、真实设计、mutation、持久化/撤销重做及跨请求并发资源释放；新项目首版不提供session保存/恢复，不套用旧工程规范。
- C-49/C-50为新交接待独立补测；D-01黑盒同引脚跨位、D-02算术右移文档待明确，未偷偷纳入冻结oracle或声称关闭。冻结只表示测试不可随实现迁移预期，不表示产品已验收。
