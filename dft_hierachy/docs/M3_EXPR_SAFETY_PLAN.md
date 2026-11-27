# Agent B：表达式安全补充冻结（2026-10-11）

本补充依据公开 DESIGN 4.4/4.5、5.5.3，SHA
`e8217ff1afcddf83cee27814c70727310767544d74cd95636a4024e0f4d48ab2`。
在执行新 fixture 的 proc/exprMap 查询前提交。原60方法/15API及其输入完全不改；
另加8个CLI方法，登记 `b_m3_expr_safety`。测试分支仍是 `test/m3`，不改产品。

输入 `core/tests/fixtures/m3/expr_safety.sv` SHA-256：
`fb3da0009217f5385f686242d22b0a18433e33cf2bbf62c0f8a315252c9d610b`。
不读取 A 的 fixture、表达式实现或自测来制定以下 oracle。

| test_expr_safety 方法 | 输入 | 预期与依据 |
|---|---|---|
| inputs_are_legal_in_both_modes | 5个top × shared/per-instance | diags errors=0，恰好选择的root；不以非法输入测试退路 |
| streaming_left_is_exact_bit_reverse_or_explicit_unresolved | `{<<{y}}=a`，a/y8 | 根ref a8；mapped时 y平坦bit i 来自根bit7-i；unresolved必须仅含status/reason=unsupported，partial.at=process；不得identity猜值 |
| streaming_chunk_lvalue_never_guesses_sorted_write_order | `{<<2{hi,lo}}=4'b1100` | 根const4，deps为空；按2位块倒序，hi来自根0/1（值00），lo来自根2/3（值11）；不能按声明/Write排序猜。或显式unresolved/unsupported |
| other_streaming_rhs_does_not_make_static_target_mapping_unresolved | `y={<<{a}}`，a/y8 | RHS other8/text非空/uses a8 conservative-all-data；左值y布局确定，exprMap必须identity(mapped)，不得因other自动退unresolved |
| sign_extension_root_type_and_value_map_are_separate_from_deps | signed a3→signed y6 | 根other width6/signed=true；根结果→y映射identity6，而非直接把a3当根值位空间 |
| initialized_slice_maps_root_zero_not_source_bit_three | wire initialized=a[3] | init/ref width1，source slice lsb3；expr结果0→目标0，不是from3 |
| nontrivial_input_and_output_extension_port_expressions_use_result_coordinates | 子d4接`~{a[1:0],a[3:2]}`；q2接y6 | 两port_expr；输入not根4及内层有序concat→引脚d4 identity；输出零扩展other根6→父y6 identity；拆Write仍覆盖目标全部位 |
| streaming_rhs_keeps_conservative_dependency_and_independent_checker | `y={<<{a}}`，a/y8；verify-facts | 一个Write，Dep a8 conservative/all/data；独立checker退出0/mismatched0。两检查分subTest，checker的绿结果不能替代手写Dep oracle |

每个映射检查根范围、目标覆盖、正宽度、无目标重叠及(to,from)排序。正常、保守、
partial不可混为一类；成功/失败的具体分支记录在结果报告，不用skip/xfail。

## 为什么不冻结 streaming 必须 unresolved

DESIGN 规定“无法安全确定映射时显式unresolved”，并未禁止将静态流拼接正确映射。
这两个输入的位排列可手工计算，BitMap也可用单个位段表示；故不能仅因 A 当前
选择未支持，独立测试就要求任何正确实现一律返回partial。测试允许两种**契约允许**
的安全结果，分别严格验证；这不放宽既有静态普通拼接/重排必须mapped的断言。
若用户/C要将流拼接固定为V1必须unresolved，须补公开范围约定，不能由B猜实现决定。

当前验收head固定`23dcc05429dcbb0fe5d9cc7e2814500f2e54acba`；修改前红基线
继续用`e8f6087`。新测试冻结后分别运行并记录实际深度。取消/缓存计数适配未增加，
不把CLI重复打开称为同快照乱序或所有权测试。无API/IPC/Schema/工程格式改动；
本补充仅为测试和记录，不要求产品扩展范围。

## B 的试制测试缺陷及重新冻结

首个试制冻结为`df9a5c2`（7方法）。其port_expr输入用了普通静态拼接却要求
生成port_expr，与DESIGN 4.4规则4“平凡输入展开成绑定，不产生驱动源”直接冲突。
这是B测试设计错误，不是产品缺陷；不把该失败计入产品问题。
按同一公开规范的规则5，将输入改为非平凡`~{...}`，保留结果坐标oracle，
重新冻结后再运行；不是修改产品或放宽期望。新增第8方法锁定独立的streaming
RHS依赖及检查器控制，目标/依赖预期仍来自4.4规则表，不取产品输出。
旧60方法与fixture完全不动，前一输入SHA保留在`df9a5c2`历史中，不覆盖执行事实。
