# Agent B：表达式修复与D契约增量独立冻结（2026-10-11）

## 范围、依据、不可替代的判据

固定复验产品`2a58463`；修复前红基线`23dcc05`。公开DESIGN SHA-256
`487211cec837aed48879f9915372780f1c03b7b0adf61cccbcbc4bb36a6e89e0`，
依据4.4/4.5/4.8/5.5.3及已回复D-01/D-02的条文。原60方法/15API、
补充69fdcea的8方法全部保留。本轮只增加测试/fixture/构建适配和记录，不改产品。

已按工作区规定读REVIEW_LOG，看到A修复自述与C反例，故不声称没有接触交接信息；
不查看A新实现、diff、自测代码或用其结果制定期望。下面手算oracle和真实HDL
端口对照在新语义运行前冻结；只参考基线公开头文件。事实检查器是独立控制，
其绿结果不能替代手工关系、精度、根宽度和值位映射。

试制ef37b58输入`core/tests/fixtures/m3/expr_boundaries.sv` SHA-256：
`c8d3af099e9acc4ae50df5a07847485fc34cff806d9b50d75ba9f66986ab5b60`。

## CLI：新增8方法，每项两实例模式

| 方法 | 输入 | 预期/判断依据 |
|---|---|---|
| reduction_and_comparison_zero_extension_preserve_exact_low_bit_deps | `4'(|a)`、`4'(a==b)` | 只有y[0] exact/all依赖a4（比较另b4），高三位无依赖；根other4摘要必须conservative/all/data，不改Write精度 |
| mixed_concat_summary_does_not_claim_partial_all_is_exact | `6'({a,|b})` | y[4:1]按位a，y[0] exact/all b4，y[5]常量；摘要a4/b4均conservative，不可把只影响最低位的b标签为exact |
| sign_extended_reduction_retains_genuine_full_exact_all | `4'($signed(|a))` | 符号扩展一位缩减：所有四位都exact/all依赖a4；other摘要保留exact/all，不能一概降级 |
| mixed_precision_neither_downgrades_writes_nor_overstates_summary | `6'({|a,(a[2:0]+b[2:0])})` | 低三位保守a3/b3，高一位exact/all a4，最高两位常量；摘要a4/b3保守，保持Write各自精度 |
| control_role_partial_and_full_coverage_are_distinct | `4'({sel?1'b1:1'b0})` / `4'($signed(sel? |a: |b))` | 前者拼接操作数先自定位为1位，只有低位control sel，因此摘要conservative/control；后者所有四位control sel及data a4/b4皆exact/all，摘要不丢role/不错误降级 |
| arithmetic_shift_signedness_and_large_counts_have_handwritten_deps | signed/unsigned4右移1/7、逻辑右移、算术左移 | signed>>>1低到高源位1,2,3,3；unsigned为1,2,3,无；signed>>>7全部3；unsigned>>>7全无；逻辑>>1补0；<<<1低到高无,0,1,2 |
| shift_uses_context_width_and_cast_not_signal_declaration_alone | s signed4>>>1赋y6；`$unsigned(s)>>>1`赋y6 | signed目标语境先扩左操作数到6，源1,2,3,3,3,3；显式unsigned为1,2,3,无,无,无；不能仅按原signal声明判断 |
| fixture_legality_and_checker_controls | summary/shift/loop三个top | diags=0错误、单指定root、verify-facts退出0/mismatched0；不把非法HDL或绿checker当退路oracle |

所有被检目标的exprMap必须根结果identity、mapped、正宽度、根/目标不越界、
恰好覆盖目标、无重叠、(to,from)排序。Write按位展开只是这些小型手算KAT，
不要求产品逐位构图。摘要按输入位/角色/精度集合比较，不假设合法段合并方式。

## 公共API：C-49新增5用例

`M3ExprLibraryTest.cpp`只包含公开Design头，不含Frontend或Slang。
LibraryProvider为absent_input提供unsigned位空间输入A，宽度2/4/6，
名字/方向/宽度来自输入，attrs不解释；真正declared_input作为第二控制。
每次打开用B_PIN_WIDTH宏使真实声明宽度与库声明一致，宏内容仍是固定测试参数。

| 用例 | 输入矩阵 | 独立期望 |
|---|---|---|
| unsigned bitwise context | a4&b4；宽2/4/6×named/position×shared/per×cache0/64MiB | 根目标宽度、所有Write exprMap identity全覆盖；低min(width,4)位exact/bitwise a/b同位，高扩展无dep；两个u/v不能并为同一process；重查仍同ref/语义 |
| signed operands | signed a4&b4；同上矩阵 | 扩展高位分别exact依赖a[3]/b[3]；截断保留低位；unsigned库pin不等于删除RHS符号扩展；真实声明对照树op/signed及手工deps |
| arithmetic context | a4+b4；宽2/4/6×模式×cache | 根other为目标宽度；所有目标位保守/all依赖原a4/b4，即使2位结果截断也不把V1全输入保守规则改为低2位 |
| constant context | ~4'b1010；宽2/4/6×模式×cache | 值分别2'b01/4'b0101/6'b110101，不能先算4位再补零；compile-time常量可按4.4折成const绑定，或非平凡port_expr中的const根，分别严格检查全部位/根宽度/无dep |
| owned return | unsigned width6、cache0、两模式 | 保存两个ProcessInfo，重查询后销毁Design；保存值/树/映射仍可安全读取，ASan检查；不是借用缓存、不是仅CLI重复打开 |

无库/未知信息回归仍由旧冻结覆盖；不借库输入契约新增blackbox逻辑。
每种实际声明控制同样需complete、正确width/映射/手工依赖和verify0。

## D-01：独立冻结3个未来API用例

`M3BlackboxLoopTest.cpp`使用只有一个2位inout/ref p的黑盒，`.p({y,a})`。
内部没有cell实现可读，a/y是两条不同标量网线；不把真值定义放入fixture。

1. 已知InOut/Ref×两模式：a→y和y→a的paths非空/complete/hasConservative，
   forward(a)与back(y) full cone包含另一端；有blackbox all/conservative/data关系，map为空。
2. structural/combinational只沿绑定并complete策略停止、不有blackbox内部边；
   a→a零边命中在maxDepth0也complete，无frontier，不虚构精确内部依赖。
3. 库声明方向Unknown但宽2：a→y不得给complete否定证明，必须partial/blackbox，
   保留frontier、不造已知内部blackbox关系。

这3用例单独目标`b_m3_blackbox_loop`；cone/paths未交付时记录编译/入口未实现，
不skip成绿、不阻碍独立编译C-49目标。类型表示若未来头文件需适配，仅做记录的
等义类型适配，不能改正反向关系、精度或否定保证。本轮不冒充关闭D/C契约审查。

## 执行、构建和验收边界

先提交本冻结，再在23dcc05运行新增CLI和C-49 API，记录各个first failure，
独立构建之后固定2a58463三配置跑原19+新8、C-49五用例及M2 27入口。
视时间执行原全60仅作未交付入口登记，不要求假实现cone/paths/IPC/UI。

正常集成新增b_m3_expr_boundaries/b_m3_expr_library/b_m3_blackbox_loop；
外部`core/tests/m3/independent_api`只链接B自己的固定头/静态库及其Catch2，
可不改产品树测试登记即执行新API，保持严格-Werror及同配置sanitizer。
这不是新生产依赖、协议/Schema/工程格式变更，无持久化迁移；本阶段CLI→Core
是实际集成，不称Electron IPC。执行中取消/时间/索引成本仍需受审适配，
本轮不将高层输出数量当资源成本证据。旧源码/真实设计/参考仓库只读。

## 试制 ef37b58 后的两处输入前提纠正

旧23dcc05试跑8方法为3通过/5失败，其中control和loop checker的首次失败并非
新产品缺陷：`4'(mux)`会把4位语境传播到条件表达式，按4.4条件规则其control
在全4位发布。要测“一位结果再零扩展”，须先用单项拼接把mux自定位在1位；
保持相同一位partial-control的手算oracle，改为`4'({mux})`。
纯黑盒loop无assign/init，因此verify-facts报“no applicable connection sources”
而不是编译合法性失败；增加不接a/y的常量初始化checker_control，提供独立
checker控制，不改变D-01两条网线和黑盒绑定。两处均只改输入并重新冻结再跑，
不取A修复输出作为预期，不隐藏第一轮运行。最终fixture SHA见复验报告。

同一个checker前提在两个constant top也适用：常量可折为trivial binding，
没有assign/init时checker返回no applicable connection sources。初次新快照
API为4用例通过/1失败，失败的24断言全部在verify0，不在取反值/宽度判据。
为这两个top同样补不参与被测绑定的checker_control初始化，保留
2'b01/4'b0101/6'b110101取反语境预期。Debug独立链接适配Catch2固定的d后缀，
第一次缺库为构建适配失败，不记为产品语义失败；随后重新构建/执行。

最终补充fixture SHA-256：
`94fba5974d0eb0d68c11bf47b49909facab4572c0cc59d1db4d039b20388d32d`。
所有最终计数只记这个重新冻结之后的完整执行；试制结果另列，旧失败不擦除。
