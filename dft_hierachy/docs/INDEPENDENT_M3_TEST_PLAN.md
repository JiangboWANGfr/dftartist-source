# Agent B 独立 M3 冻结测试（2026-10-11）

## 依据、边界与执行方法

依据原始 A12/A13/A16 验收及公开 DESIGN 4.4/4.5、5.4、5.5，不依据 Agent A 的实现、实现说明、diff 或自测结果。产品基线固定为 `e8f6087a40433ac8c21aee45ed1afea5f82bbed8`，与获批 M2 产品一致；在独立 `test/m3` 分支只增加测试和测试登记。旧 M2 断言、旧工程和参考仓库不改。

契约为 C 已关闭 C-46～C-48 后的 DESIGN，SHA-256：
`e8217ff1afcddf83cee27814c70727310767544d74cd95636a4024e0f4d48ab2`。
本冻结不代表 M3 实现通过。预期先锁定，再运行完整基线；输入合法性/现有 verify-facts 控制可在冻结前运行，以排除不合法 HDL。试制的动态连续赋值左值被固定前端诊断为非法常量下标，因此未纳入合法 KAT；没有据实现结果降低语义预期。

共 **60 个 Python 测试方法 + 15 个 C++ API 用例**。CLI 正常、错误用例均带合法成功控制，不把 unknown-command 的 bad_request 当成参数校验成功；CLI 每次重开 Design，**不声称同快照分页、查询乱序、缓存或取消覆盖**。这些由独立公开 API 用例承担。C++ 新类型只经公开 Design.h 引入；以后允许类型表示/头文件位置的测试编译适配，不允许改 oracle。

```sh
cmake -S core -B <build> -DHIER_TEST_M3=ON <原有依赖参数>
cmake --build <build> --target hier b_m3_api
ctest --test-dir <build> -R '^b_m3_' --output-on-failure
# 基线尚缺公开 API 时，先单独执行 CLI 并记录编译可用性：
HIER_BIN=<固定基线 hier 的绝对路径> python3 core/tests/m3/run_baseline.py
```

M3 开关默认 OFF，仅表示里程碑尚未交付，避免把完成的 M2 门禁误报为回归；选择 ON 后缺方法、缺字段必须红，不 skip/xfail。b_m3_api 超时 600 秒只是运行器防挂，不是性能验收阈值。

## 输入冻结 SHA-256

| 文件（core/tests/fixtures/m3） | SHA-256 |
|---|---|
| flow.sv | 8821b1a9667691c8f2a8c9803ecaf464b72c0a34eeb232b7971ea539b8fabcda |
| lookup.sv | 30a5531740c7570525936927e5d5e56950052ea7ffaad3038fee209903d56a06 |
| source.sv | dbd54a4937bf869e3c82aaacbdeea8bc1beed9dbe883b320b9b5d35bacb42942 |
| source_include.svh | 87bdb8f50e1e91dca2c629f525351a91e28a14a8b0f5d96ab490e4afd048d095 |
| source_large.sv | cc8d4da08c884ccb2b807fca8e9da01c4610198a5218f688400fdf77544280bc |

source_large.sv 是基线公开 `synthetic/gen.py --fanout 10 --depth 5 --unique 0` 的完整输出，111112 个实例、100000 个 leaf；没有从查询结果生成 fixture 或期望。静态文件与运行时临时副本分别用于不可变源码/磁盘修改测试；临时副本 RAII 清理，不修改冻结输入。

## 验收条件及现有覆盖检查

| 需求 | 正确行为 | 原有覆盖及本轮补齐 |
|---|---|---|
| A13 / C-46 | 根 RHS 类型、树形、顺序准确；exprMap 从结果绝对位到 target 平坦位，覆盖每个 Write，不由 deps/排序猜值 | M2 有精确依赖/常量切片/访问集合；缺完整类型树和左值值投影，本轮补 |
| A12 step | 每条事实/continuation 的角色、精度、位段与双向映射；高扇出分页不漏重且冷热相同 | M2 基础 step 已有；M3 原始 fact、per-continuation map、页边界未覆盖，本轮补 |
| A12 trace / C-47 | 三策略、有限环、位关系组合、探索预算/frontier；primitive 语义缺口不能作无路径证明 | 原有 cone/paths 未实现；本轮 CLI 手写关系 + API 稳定性 |
| A16 查找 | 六类、全 occurrence、过滤、路径歧义全候选；同快照稳定分页和错误游标 | M1 导航分页已有；M3 search/resolvePath/instancesOf 未交付，本轮补 |
| A16 源码 / C-48 | 字节半开坐标、宏/include、不可变快照及表内读；所有页并集保留全部重叠 occurrence | 原有 source/resolveSource/readSource/checkInputs 未交付，本轮补 |
| 取消/异常/资源 | 预取消明确 cancelled，后续正常；文件损坏/删除错误准确；大总线为区间、大源码有界页 | 预取消和临时资源释放本轮补；执行中取消、物化成本需受审计适配，不能用 sleep 竞速 |
| M2 回归 | 79 语义方法 + 1 打开资源方法及旧 API 集合保留 | 不修改；独立基线重新运行并单列报告 |

所有表内 CLI 用例除大规模 API 项外均在 shared/per-instance 两模式执行。方法名即稳定测试 ID，代码中的 subTest 明确每个具体输入及预期。

## Python 逐项输入与 oracle

### test_inputs.py（2）

1. `all_handwritten_inputs_compile_in_both_modes`：flow 的 19 个顶层 + lookup 双顶层 + source 顶层，diags errors=0，roots 名字恰好等于选择；依据合法 HDL/显式 tops。
2. `existing_fact_checker_controls_small_inputs`：flow/lookup/source × 两模式，退出0/mismatched=0；只作固定基线输入控制，不作为新 M3 语义 oracle。

### test_expr.py（11；依据 4.5、5.5.3）

| 方法 test_ 后缀 | 输入 | 预期 |
|---|---|---|
| binary_keeps_left_right_operands_and_type | gate=a&b | and、width4、unsigned，args=a,b；ref 无不适用字段 |
| mux_has_three_ordered_args_not_an_alternative_shape | choice=sel?a:b | args=sel,a,b，禁止替代 cond/then/else 形状 |
| concat_is_high_to_low_unlike_binding_segments | joined={a[1:0],b[1:0]} | concat args 高到低 a2,b2，width4 |
| unary_and_reduction_have_one_operand | ~a、&a | not4/reduce_and1 各一个 ref4 |
| four_state_constant_preserves_width_and_digits | 4'b10xz | const4 原四态数字，不伪造 slice/args/uses |
| other_keeps_conversion_and_only_projected_dependencies | 零扩展、截断、位移、加法 | other4，uses 分别 a[1:0]、b[3:0]、a[2:0]、a/b[3:0]，摘要 all/conservative/data |
| init_and_input_port_expression_have_trees | 初始化 xor、子端口 xor2 | 均有树，port_expr xor2 |
| procedural_source_has_no_value_expression_tree | always_comb | 无 expr，每个 Write 无 exprMap |
| reordered_constant_lvalues_have_opposite_values | {a,b}=01 与 {b,a}=01 | a/b 值分别0/1及1/0，exprMap 与 Write 顺序无关，deps 空 |
| nested_lvalue_keeps_same_bus_segments_and_flat_coordinates | {q[7:6],{s,q[5:4]}}=10101；q[7:4] | q平坦位0/1/2/3→根0/1/3/4，s0→根2；值1/0/0/1及1 |
| nonzero_lsb_shift_maps_result_not_operand_after_write_split | y[6:3]=a<<1 | y3 无deps/from0→to3；y[6:4] from1→to4，与 Dep a[2:0] 分开 |

值投影检查逐个验证目标不重叠、恰好覆盖及(to,from)排序；微小 KAT 位运算是独立 checker，不允许产品以逐位算法处理宽总线。

### test_step.py（8；依据 5.5.2）

| 方法 test_ 后缀 | 输入 | 预期 |
|---|---|---|
| backward_bitwise_maps_use_absolute_queried_coordinates | gate[3:2] back | 两个 process Hop，a/b[3:2]，map2→2 width2 |
| mux_control_is_exact_all_not_matching_same_bit | choice[3] back | sel0 control/exact/all，无逐位 map |
| concat_selects_correct_operand_at_each_end | joined 四个输出位 | b0,b1,a0,a1 精确映射 |
| fact_identity_is_independent_of_clip_and_direction | bit_paths a/b[0/1] 正反向 | 同一 Write/Dep 的 fact 不随裁剪/方向变 |
| register_kind_and_all_event_roles_in_both_directions | feedback q back/clk forward | register、data/control/clock/async 均保留，同一 via |
| unknown_direction_candidate_has_explicit_reason | 无库 A(a) 引脚，两向 endpoint/step | 候选blackbox_pin有reason；step仅unresolved/blackbox，不追加无原因候选 |
| unknown_width_is_not_a_fabricated_one_bit_or_unconnected | 无库 EMPTY() outside back | partial/unknown_pin_width at引脚，无虚构 at.bits/map/next |
| wide_identity_uses_one_interval_map | 1048576 位 y=a | 一个 continuation，一个整段 map；结构规模断言，不是时间 SLA |

### test_trace.py（18；依据 5.5.4）

| 方法 test_ 后缀 | 输入 | 预期 |
|---|---|---|
| primitive_cone_strategy_and_semantic_frontier_are_distinct | buf，a forward，三策略 | structural complete；另两种 partial/unsupported，actual pin frontier bits/side，无cursor |
| paths_distinguishes_primitive_true_disconnection_and_unknown_blackbox | buf、y=0 无a关联、unknown box | 均空路线，分别partial/unsupported、complete、partial/blackbox；不删除 frontier/reason |
| primitive_pin_target_hit_does_not_require_internal_semantics | a→buf输入引脚outside | 完整非空路线，无额外unsupported |
| combinational_cycle_keeps_two_real_edges_and_terminates | a=b,b=a | 2节点2真实边，complete，无frontier |
| structural_stops_at_process_not_an_input_dependency | gate structural | process终点boundary，无a/b依赖节点 |
| combinational_preserves_mux_data_and_control | choice combinational | a/b/sel，全角色，非conservative |
| arithmetic_is_complete_but_conservative | total=a+b | 两依赖all/conservative，complete，与partial区分 |
| register_boundary_and_full_feedback_keep_events | feedback，三策略 | 前两者register终点；full带clock/async/control/data，有限反馈 |
| depth_zero_returns_unexplored_origin_frontier | a forward maxDepth0 | 仅起点，无边，budget_depth depth0 frontier |
| exact_node_and_edge_limits_do_not_fake_a_truncation | 组合环预算2节点2边 | 恰好完成为complete，不用size==limit猜截断 |
| one_short_node_and_zero_edge_budgets_report_unconsumed_work | 同环，nodes1/edges0 | 不插入关系，partial对应原因，frontier保留起点 |
| paths_composes_bit_relations_not_bus_name_reachability | a0→c0/c1，c={b0,b1} | c0 complete空；c1图中真正见证位关系 |
| paths_zero_edge_hit_precedes_depth_zero | a0→a0 depth0 | 一个命中节点、零边、complete |
| paths_empty_partial_is_not_a_no_route_proof | a0→c1 nodes1 | 空路线partial/budget_nodes，frontier不丢 |
| paths_all_relation_is_conservative_and_prunes_unrelated_inputs | a0→total3 | 非空保守路线，无无关b支路 |
| paths_restores_requested_inside_and_outside_port_anchors | hierarchy a0→first.d0 两side | 保留实际目标side锚点及binding边 |
| multi_driver_facts_are_not_merged_by_equal_endpoint_labels | y=a 与 y=b | 两via两fact，不因目标相同合并 |
| external_actual_target_and_interface_reasons_survive_strategy_stop | second.s层次读/first.s未读；interface.s | actual target hier_ref，不广播兄弟；interface_port；structural不擦原因 |

共同图不变量：ID唯一、边端点存在、原始fact非空、关系位段在节点内、conservative只能all、boundary不伪造依赖、hasConservative仅汇总返回边。这里只验证返回关系；同快照 ID 乱序等价由 API 另测。

### test_lookup.py（9；依据 5.5.1/5.5.5）

| 方法 test_ 后缀 | 输入 | 预期 |
|---|---|---|
| multi_top_omission_returns_all_candidates_in_reference_order | u_extra/绝对alpha.u_extra | 省top返回alpha/beta两个，不默选；绝对一个 |
| escaped_names_and_instance_array_are_distinct | escaped点/斜线/字面u[3]与数组u[3] | 依语法分别命中不同ref，禁止显示名合并 |
| generate_signed_subscript_mixed_separator_and_scope_not_an_object | g[-1]、混合分隔、scope/不存在 | 数值负下标可导航；scope不伪造对象；无匹配complete空 |
| same_name_port_and_signal_return_both_not_a_preferred_object | alpha.q | port/signal两个候选、有序 |
| search_six_kinds_and_occurrences_have_handwritten_counts | 空text search | definition4/instance13/port37/signal49/process22/register11，共136；metadata/roundtrip |
| scope_does_not_capture_prefix_siblings_and_duplicate_filters_do_not_duplicate_hits | u与u_extra，重复kind | scope按对象子树；重复filter不重复命中 |
| search_is_literal_case_sensitive_and_does_not_trim_text | STATE、空格、.* | 字面区分大小写、不trim、不正则 |
| numeric_instance_order_places_two_before_ten | fanout g[0..11] | 数值顺序，不按文本10排在2前 |
| definition_instances_preserve_all_shared_occurrences_and_unused_definition | path_leaf/path_unused | 11个叶occurrence；未使用定义complete空 |

### test_source.py（7；依据 5.5.6）

| 方法 test_ 后缀 | 输入 | 预期 |
|---|---|---|
| reverse_source_keeps_overlapping_definition_and_all_occurrences | include内assign首字节，limit1000 | DefRef + left/right实例 + 两process，共5命中，不择一 |
| reverse_source_limit_one_is_complete_page_not_budget_partial | 同位置limit1 | 1 item+next，complete，不添加budget_nodes |
| reverse_source_line_query_contains_precise_column_hits | 整行/精确列/statement end | 行命中包含列命中；半开end不再命中该process |
| utf8_byte_columns_tab_and_half_open_statement_range | 中文+tab后的assign | 字节offset/column与原文件独立计算，真实include路径/hash |
| macro_statement_uses_physical_invocation_not_virtual_buffer | M3_WIRE调用 | 最外宏调用范围/hash，不用虚拟展开偏移 |
| instance_declarators_on_same_line_have_distinct_ranges | left(...),right(...) | 两个独立declarator，从名字到右括号，不包含整句 |
| source_read_is_table_scoped_and_hashes_exact_input_bytes | 表内FileRef/路径文本/checkInputs | UTF8原文/原字节SHA/matches=true；表外not_found；未改changed空complete |

### test_errors.py（5；依据 5.5.1 参数/错误顺序）

| 方法 test_ 后缀 | 错误输入 | 预期（成功控制后） |
|---|---|---|
| path_syntax_errors_are_not_empty_success | 空文本/空段/未终止转义/非法下标/尾分隔/Tcl | bad_request，不是complete空 |
| search_rejects_bad_scope_kind_and_page_size_after_success_control | 错kind、signal scope、不存在scope、limit0/-1 | 分别bad_request/not_found，非internal |
| trace_validation_rejects_wrong_kinds_sides_slices_and_budgets | 错对象/side、配对字段缺失、位段越界/0宽、预算负/0/溢出 | bad_request；不存在ref为not_found |
| paths_requires_paired_slices_and_valid_target | 两端不成对、signal side、目标位段越界 | bad_request，不隐式修正 |
| source_inapplicable_kinds_are_not_found_not_internal | top例化/signal语句、0/超界坐标、limit0、表外FileRef | 无适用位置not_found，坐标/页参数bad_request；有消息/非零退出 |

## C++ API 逐项输入与 oracle（15）

用例题名是完整 ID；以下短名顺序与 M3ApiTest.cpp 一致，依据同一 5.5 契约：

1. **search pages**：lookup双top，完整手数136；页7→11拼接恰等于完整有序集合、无重复/游标循环。
2. **cursors reject**：search首屏游标，用于换text、instancesOf为BadRequest；另一Design为StaleCursor。
3. **definition pagination**：path_leaf全11，页2→3不合并共享occurrence，unused空，两模式。
4. **high fanout**：12不同TAG逻辑体，maxHops1000仍提前分页；每页≤1相邻continuation；12子目标无漏重；冷/热fact页边界相同。不预热子体后声称冷测。
5. **fixed seed / tiny cache**：seed120316，cache1字节/64MiB各自快照；8轮shuffle cone/paths/search/resolvePath，返回ID/refs与该快照控制相同。不要求跨快照ID相等，不称已证明实际淘汰次数。
6. **shared/per-instance**：bit_paths a0→b0两模式同语义路线/基数/保守性；不同快照opaque ID不比较。
7. **pre-cancelled**：9个可取消查询分别预停止；必须Cancelled无partial，然后正常search/paths仍成功。
8. **invalid before cancelled**：nodes0+预停止，先BadRequest，符合确定错误顺序。
9. **disk edits**：临时source追加注释；read新字节/新hash/matches=false，checkInputs仅该FileRef；旧span/hash和原分页游标结果不变。
10. **source pages**：source_leaf模块token，恰DefRef+2实例；每页1，后来1/2页大小变化，顺序不变、无漏重，两模式。此例检查热结果稳定性，不单凭它证明冷索引成本。
11. **source cursor / retry**：换file/line/col及col存在性BadRequest，跨快照StaleCursor，预取消某页Cancelled，用原游标重试仍1条；非法游标BadRequest。
12. **100000 leaves**：固定生成器leaf定义首字节，首屏limit1且next；后续limit512每页有界、游标前进，全集恰100001个ref。完整序列起点DefRef，不只规范共享实例；不通过响应长度证明内部未全量物化。
13. **invalid UTF8 / deletion**：临时改0xff为Unsupported，删除为NotFound；checkInputs changed且complete=false，旧source仍可用；RAII销毁设计和临时目录。
14. **CRLF**：临时输入替换LF→CRLF；完整原文保留、module起点原字节offset/第2行第1列。
15. **library / attrs**：A in/Y out/EMPTY in width1的LibraryProvider；三策略complete，full才有blackbox all/conservative/data边；attrs role=flipflop/clock=A不得猜寄存器/改变策略。

## 尚需适配、契约歧义与后续里程碑

以下**不计入本轮已覆盖/已通过**，没有用实现或竞速猜答案：

- 执行中取消、取消索引构建后原游标重试、单调时间budget、索引代次失效，需要经过 C 审的确定性检查点/时钟适配。现有预取消不冒充这些测试。
- 最多两个逻辑体、≤256候选/≤64KiB取消粒度、源码不全量物化、缓存实际淘汰，需受审的计数/观察点。当前输出基数/页边界、百万位区间和10万命中分页只能证明外部约束，不能独自证明内部成本。
- SearchQuery.kinds 空数组与 omitted、scope/kinds绑定游标及C++side的具体类型表示尚无公开可编译结构，不能根据A未来实现猜字段表示；CLI覆盖已有明确filter语义，其余应仅适配类型后补断言。
- exprMap unresolved 的合法非静态左值输入还需与已固定前端合法性边界收敛；不允许静态常量重排退为unresolved通过。既有opaque/complex_port/hier_ref/process.at/常量切片由未修改的M2专项集继续兜底。
- M4：协议参数/错误/Schema/TS/C++一致性、取消竞态/超时/并发、对象及后台任务释放（B-11/B-12）。现有M4未来测试仍保留，不运行CLI来假装IPC已覆盖。
- M5/M6：树/图/源码选择、撤销重做、幂等重复操作、异步late reply、Electron IPC（B-13）。按DESIGN已定范围验收，不扩展成旧dft-suite工程保存恢复需求。
- DESIGN用户决定排除首版session保存/加载/恢复；旧版本工程兼容、损坏工程文件不在新工程M3实现范围。M7整机RAM/耗时门槛仍由用户决定，不能自行填写。

基线实际通过/失败及不可执行 API 将另写 `M3_BASELINE_REPORT.md`；缺接口不计作15条API运行过，缺命令不计作相应深层语义已执行。
