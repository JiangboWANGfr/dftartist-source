# Agent B 独立验收与基线记录（2026-10-10）

## 范围、依据与隔离

用户确认本轮对象为**新 dft_hierachy，按 DESIGN.md 覆盖当前及后续里程碑**。
依据：正式 DESIGN.md 1.2–1.3、4.3–4.9、5.1–5.4、6、10，及只读
`ref/HIERARCHY_REWRITE.md` 的 A01–A24。当前正式 DESIGN 文件 SHA-256：
`8ff29e926db5cec15c34bd5f6f9fc4df80ea322a091da57c8dbe6b4f6e7744af`。

基线为 B 自己的 `test/m2` 冻结点 `ad75d160c001e608d8401bf7576fc3de5e92c595`，
其中产品仍是修改前 M1；不是 A 的工作分支。仅阅读该基线公开头文件、公开 TS
入口、构建/测试文件和 fixture，未查阅 A 当前实现分支、commit、diff 或实现源码。
工作区要求必读的 REVIEW_LOG 有历史实现汇报，它们不作为 oracle。
没有根据实现或自测结果改变期望；本轮也不接手 C 的实现评审。

公开头文件/TS 入口修改时间均为 2026-10-06，早于本轮。
产品由 B 工作树重新构建到 `core/build-independent`，不使用 A 的当前二进制；
仅复用已下载的 Slang/Catch2 等第三方源码，未读取 A 产品源码。
旧 `dft_planner` 只用于范围辨别，未改写，也不把其测试算作新工程覆盖。

第一版明确排除 A20 会话保存/跨编译重映射、A21 规划编辑。
工程创建/保存/加载/恢复、旧工程文件兼容、规划事务撤销/重做不列为新工程失败项。
SelectionModel 的 back/forward 是导航历史，不是规划编辑撤销。

## 验收条件及原有覆盖审计

| 可验证条件 | 依据/里程碑 | 修改前测试 | 本轮状态 |
|---|---|---|---|
| 实例身份、数组 occurrence、共享事实不串接 | A01–A03、4.1–4.3/M2 | M1 导航+43 个已冻结 M2 用例 | 保留手写 oracle；新增绕过测试缓存的重复驱动查询 |
| 位空间、拼接、四态、扩展/截断、悬空 | A04–A06、4.4/M2 | NavTest、deps/pins/conn | 保留；新增未知宽度查询必须 partial |
| 复合端口、interface 不支持边界 | A09–A10、5.4/M2 | contract 5 用例 | 可解析复合端口、整体 unresolved 已冻；B-10已按支持矩阵关闭，局部 unresolved 仅预留、不计实现/覆盖 |
| process at 能区分同位号的不同信号 | C-34 已写入 5.4/M2 | ProcessAt 单 process 两写两读 | 保留，不仅比较数字位号 |
| 事实检查分清 Slang、自检、层次跳过、失败 | 5.4、10/M2 | verify 4 用例 | 保留计数与正向前提；读/写漏位 mutation 等实现后执行 |
| 空模块可查且集合为空、完整 | 4.9、5.3/M2 | 无独立全空模块集合测试 | 新 fixture + 集成测试 |
| 分页无漏重、游标绑定方法/实例、limit 可变 | 5.2/M2 | M1 children 有；signals/procs 无 | 新集成测试 |
| 参数错误返回非零+准确 JSON，不误报成功 | 4.3、5.3/M2 | drivers 少量错误参数 | 新增 loads 和 JSON 消息/结果互斥检查 |
| 错误不损坏设计、返回值不悬空/改写事实 | 4.8、5.1、A22–A23 | 打开失败、错误引用 | 新 C++ 公共 API 单元测试；仅生命周期 smoke，非泄漏证明 |
| TS/C++ 版本相同；对象/JSON Schema 一致 | A23、5.2/M4 | TS/C++ 常量各自存在，无三方 parity | 新版本 parity；没有权威 JSON Schema，不能宣称结构 parity 已完成 |
| NDJSON 握手/错误/快照/FIFO/取消/EOF | 5.2/M4 | 无服务端测试 | 新真实进程协议测试，基线为红 |
| 客户端关联乱序回复、去重、取消、partial、订阅释放 | 6.1/M4 | 只有版本常量与层检查 | 新假 Transport 单元测试，基线为红 |
| 导航历史与订阅释放 | 6.2/M5 | 无 | 新 SelectionModel 单元测试，基线为红 |
| React 显示 partial/错误、最后意图、过期结果隔离 | A14–A19、6/M5–M6 | 无组件/演示壳 | 下表列 E2E 验收；尚不可执行，不计已覆盖 |
| 容量/超时/后台任务和内存释放 | A22、10/M7 | 分层与 sanitizer 探针，不是产品泄漏回归 | 生命周期 smoke 已跑；真实资源/性能预算未定义，测量待 M7 |

## 自动用例清单：输入、预期与依据

下面每一行对应一个 test method（循环/subTest 不另算用例）。全部基于 fixture
源码和契约手算；低位在前、不解析公开引用 ID。除标明者外，既测共享也测逐实例模式。

### M2 用例清单（原冻结49个，下文另登记新增3个）

| 用例（文件/类/方法） | 输入 | 预期结果 | 依据 |
|---|---|---|---|
| deps/RuleTable/every_row | precision/ops.sv 19 种运算的 y 每位 | 等于 OPS 手写集合；dynamic_part 允许注明的上下界 | 4.4 运算表、9.1 |
| deps/Roles/concatenation_on_the_left | lhs_concat 的 `{hi,lo}=a` | lo 对 a0/1，hi 对 a2/3 | 4.4 bitwise |
| deps/Roles/nested_if_and_case | nested 的 y0/1 | 仅各写位的数据与所在条件依赖 | 4.4 角色 |
| deps/Roles/clock_and_async_roles | ff.q 两位 | d=data、clk=clock、rst_n 同时 async/control | 4.4 |
| deps/Kinds/processes_are_listed_in_declaration_order | init/pins/seq/multi/occ | 精确种类与声明顺序；occ 本体无源 | 5.4 |
| deps/Kinds/procedural_kinds | if/ff/seq.s | always_comb/always_ff/always | 5.4 |
| deps/Initializers/initializers_are_drivers | init.x/w/two | 网线 init 位映射；two 同时有 init 与 assign | 4.4、5.4 |
| pins/Bindings/every_form | pins 13 实例 | PINS 手写信号、常量、悬空、expr 逐位映射 | 4.3–4.4 |
| pins/Bindings/every_pin_is_reported | pins 13×4 端口 | 52 绑定，包括省略端口 | 4.4 规则1 |
| pins/Bindings/segments_are_as_coarse_as_the_source | u_concat.d | 两个等宽片段，低 b 后高 a | 4.4 规则2 |
| pins/Bindings/bindings_are_in_slot_then_port_order | pins | 子实例位置优先，再按端口声明序 | 5.4 |
| conn/Occurrences/every_occurrence_has_the_same_local_facts | occ 四 occurrence | n/q/ck 的每位依赖正确 | A01、4.1 |
| conn/Occurrences/every_occurrence_has_its_own_identity | 同上 | 四不同 process 引用且所属实例正确 | 4.3 |
| conn/Occurrences/bindings_of_each_occurrence | 两普通+两数组元素 | 各自 clk/data/qarr 切片，不串接 | A01、C-30 |
| conn/Occurrences/drivers_through_the_hierarchy_stay_in_their_occurrence | 各 occurrence.d/clk | 正确顶层端口与一层 via | 4.7 |
| conn/Occurrences/loads_through_the_hierarchy_stay_in_their_occurrence | clk_a/b、da/db/d0/d1、qarr3 | 正确 occurrence 的 process 集合 | 4.7 |
| conn/Occurrences/local_reach_stops_at_ports_and_pins | u_b.d、occ.db/clk_a | own_port/module_pin 正确、3 路扇出 | 5.4 端点表 |
| conn/Occurrences/port_side | u_b.d outside/inside | 外侧父信号，内侧 n 驱动读取；direct 映射 | 4.3、5.4 |
| conn/Occurrences/bad_requests | 缺 side/reach、多余 side、半 Slice | 非零，bad_request；先解析有效对象 | 4.3、5.3 |
| conn/Occurrences/a_whole_object_is_the_default_slice | n 不传 Slice | 覆盖位0/1，同一驱动 | 5.3 |
| conn/MultipleDrivers/all_real_drivers_are_kept | multi.m/t | 两真实驱动都保留，各控制条件不合并 | A03 |
| conn/ThreeLevels/drivers_cross_two_boundaries | xhier.mid、u3.i | 两层 via、正确偏移、alias 停在真实源 | A11、4.7 |
| conn/ThreeLevels/loads_fan_out | xhier.mid/in | 正确4源；未连接位空且 complete | A11、4.9 |
| conn/ThreeLevels/local_loads_of_a_fan_out | xhier.mid0/1 | 本层引脚+process，不提前跨层 | 5.4 |
| conn/PinEndpoints/constant | u_const.d 第1位 | const 值唯一 1'bx，无 bits | 5.4 |
| conn/PinEndpoints/constant_two_bit_slice | 同端口 lsb1 width2 | const 值唯一 2'b0x，queried=1/2，无 bits | 5.4 |
| conn/PinEndpoints/unconnected | u_open.d2 | unconnected，不是 unresolved | 4.4 |
| conn/PinEndpoints/expression | u_expr.d2 | 父实例 port_expr，正确写位 | 4.4 规则5 |
| conn/HierarchicalReferences/a_signal_written_through_a_hierarchical_reference | top.c1.poke | partial/hier_ref，不伪装空 complete | 5.4 |
| conn/HierarchicalReferences/a_signal_read_through_a_hierarchical_reference | top.c0.poke | partial/hier_ref | 5.4 |
| conn/HierarchicalReferences/the_referring_processes_say_so | peek/c1.poke 对应源 | externalRefs 精确源码文本/read/write，proc partial | 5.4 |
| conn/HierarchicalReferences/a_process_without_one_is_complete | mux_assign | complete、reasons 空 | 5.4 |
| conn/Registers/registers_per_written_bit | seq.q/s/p/p2/c | 手写8个寄存位、时钟/复位/置位；组合 c 排除 | 4.6、5.4 |
| conn/Registers/a_register_names_its_process_and_instance | seq 寄存器列表 | process/inst/signal/ref kind 相互一致 | 5.4 |
| verify/VerifyFacts/holds_on_the_fixtures | conn.sv、ops.sv | exit0、slangCompared>0、mismatched0 | 5.4 |
| verify/VerifyFacts/hierarchical_references_are_reported_as_skipped | bits.sv/top | exit0、slangCompared>0、skippedExternal>0 | 5.4 |
| verify/VerifyFacts/source_kinds_without_slang_oracle_use_independent_checks | only_init/only_port_expr | exit0、Slang0、自检>0、跳过0、错误0 | 5.4 |
| verify/VerifyFacts/fails_when_nothing_was_checked | 错 top/损坏 HDL/无源模块 | 正向命令先成功；三异常非零 | 5.4 |
| contract/CompositePorts/non_ansi_port_maps_low_and_high_halves | split_port.joined | mapped complete；低 lo 两位，高 hi 两位 | 5.4 |
| contract/CompositePorts/connection_crosses_each_mapped_segment | split_port.lo/hi 每位 | 驱动为顶层 data 的位0/1/2/3 | 4.7、5.4 |
| contract/CompositePorts/interface_port_reports_whole_unresolved_mapping | misc.iu.b | unresolved/interface_port | 4.4、5.4 |
| contract/UnknownBlackboxWidth/unconnected_pin_has_no_fabricated_bit_space | mystery_cell.A(a)/Y() | 仅 A/Y；A宽1，Y宽null/segments[]/unknown_pin_width | 4.4 |
| contract/UnknownBlackboxWidth/unknown_width_query_is_partial_not_empty_complete（新增） | Y 整体 drivers/loads/outside | partial，原因 unknown_pin_width | 4.4 规则2 |
| contract/ProcessAt/one_process_identifies_each_written_and_read_signal | process_at 同源写y/z、读a/b | 唯一源；每端点 at 引用正确、bits=at.bits | 5.4 |
| boundaries/Boundaries/empty_body_has_complete_empty_collections（新增） | boundary_empty | ports/signals/bindings/procs/registers 空，完整，无 next | 4.9、5.3 |
| boundaries/Boundaries/bit_arguments_are_atomic_for_drivers_and_loads（新增） | n 有效 Slice，再分别缺 lsb/width | 正向 exit0；反向非零 bad_request+非空消息、无 result | 5.3 |
| boundaries/Boundaries/signals_and_processes_page_without_gaps_when_limit_changes（新增） | occ.u_b 分页1→1000 | 拼接等于全量，无漏/重，最后无 next | 5.2 |
| boundaries/Boundaries/cursor_is_bound_to_method_and_instance（新增） | signals/u_a 游标用于u_b或procs | 非零 bad_request | 5.2 |
| boundaries/Boundaries/repeated_queries_do_not_duplicate_real_drivers（新增） | multi.m 三次真实 CLI 调用 | 每次恰好两不同 process，JSON一致 | A03、4.3 |

现有 Design.run 在测试侧缓存命令；新增重复测试刻意绕过它。
三次 CLI 调用属于跨进程重放，**不声称验证同一内核缓存淘汰/同一进程并发**。

### C++ 公共 API 新单元测试（4 个）

| LifecycleTest 名称 | 输入 | 预期/依据 |
|---|---|---|
| public schema version agrees with snapshot and build | nav 设计、buildInfo、公开常量 | 三方 schemaVersion 相同；protocol2（5.2/A23） |
| failed queries do not poison the live design | 同一设计连续3轮 malformed/absent/valid | BadRequest/NotFound 区分，之后 top_a 可查（5.1/A23） |
| returned values survive owner destruction | 12次打开、拷贝 escaped 实例、销毁 owner | 返回名字/路径仍正确，不悬空（公开值返回/A22） |
| caller edits to returned values do not edit facts | 修改返回的 name/path，再查询 | 原 top_a 事实未改（4.8 不可变快照） |

### M4 真实 Core 子进程协议测试（8 个）

所有用例先要求第一条为 hello/protocol2/SnapshotInfo，且能力含 cancel/progress；
未启动服务不能让负向测试假通过。输入为 nav/nav.sv，错误后不重启服务。

| Protocol 方法 | 输入 | 预期/依据（均5.2） |
|---|---|---|
| hello_and_roots_have_typed_complete_reply | inst.roots/id1 | top_a/top_b，ok、complete、无 error |
| unknown_method_is_error_and_next_query_recovers | 未知方法→roots | unknown_method、非空消息、无 result；后续成功 |
| wrong_snapshot_is_rejected_without_poisoning_current_one | 错 snapshot→当前 snapshot | stale_snapshot；当前仍成功 |
| not_found_is_distinct_from_malformed_reference | i:999 / i:1..0 | not_found / bad_request |
| batch_requests_return_fifo_once_each | 连续发11/12/13，再14 | 回复顺序11/12/13，结果相同，下一条14无重复 |
| cancelling_unknown_or_finished_request_produces_no_reply | 结束1后取消1/999，再请求2 | 下一终态仅2；忽略两取消 |
| source_read_cannot_read_arbitrary_path | file 是表外路径字符串 | not_found，无源码结果 |
| eof_exits_and_releases_child_process | 成功请求后关闭stdin | 进程自然退出、读线程结束；强制 kill 不能通过断言 |

reader 允许 progress/index 插入；JSON 错误、EOF、无回复会显式失败。
用例失败也清理子进程、管道和读线程。20秒为测试安全限时，不是产品性能承诺。

### 前端新单元测试（11 个）

| 测试名称（略去 M4/M5 前缀） | 输入 | 预期/依据 |
|---|---|---|
| children sends typed params/current snapshot and preserves completeness | hello→children(limit2)→partial | method/params/snapshot正确；Reply原样透传（6.1） |
| equal concurrent requests share one wire request | 相同children并发2次 | 仅1次send，两调用都有同一结果（6.1） |
| distinct requests resolve to their own out-of-order replies | 两实例children，先回第二条 | 不同id，各自结果不串接（5.2/6.1） |
| partial results must not be cached | partial 后重查同参数 | 第二次真正send（6.1） |
| abort rejects without waiting for Core; late reply cannot resolve another request | pending→abort→晚旧回复→新回复 | 立即reject，cancel目标正确，新请求仍取新结果（5.2/6.1） |
| Core errors reject and do not prevent subsequent success | not_found→有效children | reject而非成功，后续Reply正确（6.1/A23） |
| index-ready subscription can be released | ready→unsubscribe→ready | 仅第一次回调（6.1） |
| dispose releases transport | client.dispose | Transport.close被调用（6.1/A22） |
| history restores exact object, bits and origin | select树A→图B→back→forward | A/B 的引用、位段、origin完整恢复（6.2） |
| subscriber sees selection and can unsubscribe | selectA→unsubscribe→selectB | 收到A，之后无新回调（6.2） |
| public TypeScript and C++ protocol versions match DESIGN 5.2 | TS出口常量与C++公开头 | 均等于2；不冒充JSON Schema结构验证（5.2） |

仅通过公开包出口运行；没有客户端类/模型类时明确失败，不能 skip。
没有拿测试假 Transport 的自回复当 oracle；所有响应和期望均由测试显式输入。

## 后续验收规格（尚未自动化，不能计入通过数）

| 阶段/场景 | 输入/操作 | 预期及判断依据 | 当前缺口 |
|---|---|---|---|
| M2 运行时降级/mutation | 人为漏一个 data 读位，再漏一个写目标位 | verify-facts 两次非零且 mismatched>0；重建全部 Slang 本地写位、保守读依赖、保留事件角色（10） | mutation须有实现；不读取A源码来设计预期 |
| M3 A12 | 两assign组合环、时序反馈、高扇出；逐项小 maxNodes/maxDepth | 能结束；预算 partial 有对应原因/frontier；相同事实不无限重复 | trace/graph结果细节待公开契约落地 |
| M3 A16 | 同名跨scope、escaped含点、多top；多页搜索；多实例同源码位置 | 不按标签合并，定位正确对象；无漏重，源码候选全部返回 | 搜索过滤/源码命中完整结构尚未冻结 |
| M4 排队/执行取消 | 可控工作线程屏障，取消指定排队/执行请求 | queued必须cancelled；running依检查点成功或cancelled但恰好一次；不得发布半成品缓存（5.2） | 缺可控执行屏障；不用时间竞争当oracle |
| M4 快照重载与传输关闭 | 旧成功/旧错误晚到；关闭transport时仍有pending | 不污染新快照；全部等待失败（5.2/6.1） | 响应缺snapshot、Transport无关闭通知，见B-11 |
| M5 React/Core E2E | 演示壳打开nav，展开、属性、源码；坏引用/partial | DOM显示正确对象和可读错误/不完整提示，不是假成功（6.1/6.3/A23） | 无演示壳、IPC通道/挂载入口，不猜DOM选择器 |
| M5 快速连续展开折叠 | 延迟children回复；true/false/true意图；双击 | 最终展开状态取最后意图，去重，无幽灵行（6.2/A15） | TreeRow/RowId完整契约未定 |
| M6 图投影回归 | 同图按不同顺序展开/折叠、bus开关，加入plan/analysis片段 | 保留原事实、位映射、来源；多驱动不丢；外部片段不回写内核（6.2/A17） | GraphPort/LaidOutGraph/LayoutService完整契约未定 |
| M6 Worker 异常/超时/过期结果 | Worker throw/退出/超时，切图后旧布局返回，retry | failed可见、数据仍可查；旧布局丢弃；retry成功（6.2/A18） | LayoutService取消/超时接口与阈值未定 |
| M7 资源/真实设计回归 | processor_core/openc910/合成10万实例，反复打开关闭 | 记录输入SHA、P50/P95、内存峰值/关闭后内存、后台进程线程/文件数；满足用户确定预算（10/A22） | 用户尚未确定三项预算；本轮不声称测过真实性能 |
| 集成阶段Electron | IPC调用Core，停Core/恢复，开关回滚 | 错误到UI；新旧进程输入一致；回滚不污染（7.2） | 不在独立M0–M7，需集成宿主契约 |

## 独立待澄清项（不从实现选择答案）

- B-10已关闭：正式DESIGN 5.4支持矩阵及10节一致规定片段级unresolved仅预留，不要求M2触发，也不计实现或测试覆盖；可解析复杂端口必须完整映射，整体unresolved仍须传播partial。未来启用局部降级须先冻结合法输入、手写映射/原因/查询期望。不能以编译错误充作oracle，也不声称所有合法HDL均无法触发。
- B-11：5.2成功/失败回复示例没有 snapshot 字段，但6.1要求按响应快照丢弃。需规定响应字段或明确以哪个关联信息判断。Transport 仅 send/onMessage/close，没有 EOF/error 订阅；需规定何时/如何通知等待请求失败。TS rejection 的类型/错误码字段也未定，现有客户端测试只要求reject，**尚不能证明错误码无损到UI**。
- B-12：没有权威 JSON Schema；TS目前只出口版本常量，C++只有M1模型。请定义Schema交付物/权威来源、版本兼容策略及未知字段/缺字段/非法字段的处理。不能复制实现生成“正确Schema”。坏NDJSON无id时如何关联错误、重复请求id如何处理也未定。
- B-13：TreeRow/RowId、GraphPort/LaidOutGraph、LayoutService及应用挂载/IPC接口不完整；不自行设定UI选择器、timeout数值、去重请求多订阅者的取消语义、Selection相同项重复选择/历史分叉规则或缓存容量。
- 需要取消和缓存淘汰的**可控、非生产语义更改**测试适配时，应单独评审；不得降低预期去适应实现。

## 修改前基线运行记录

机器 Darwin arm64；AppleClang17，RelWithDebInfo，Slang12.0，Node24.21.0。
默认Node23.11不符合项目engines，首次npm ci失败；改用机器已装Node24后离线安装成功，
未改engines或package-lock，也未增加依赖。非sanitizer构建，不能宣称泄漏已排除。

| 执行项 | 结果 | 分类 |
|---|---|---|
| 原有C++测试 `hier_tests '~[independent]'` | 14用例/1263断言全通过 | 修改前回归 |
| 新C++测试 `hier_tests '[independent]'` | 4用例/80断言全通过 | 基线已满足的新增要求 |
| CTest排除m2/m4 | 16/16通过（unit包含上述两组） | 原有CLI/共享门禁/分层未回归 |
| web原有 `npm run check` | typecheck、依赖规则、5个故意违规探针全过 | 修改前前端回归 |
| M2 deps/pins/conn/verify/contract/boundaries | 7/4/23/4/6/5，共49方法均未通过，0skip | signals/procs/bindings/verify-facts缺失或port缺ref/internal；不是语义验证成功 |
| M4协议 | 8方法失败，0skip | 首次握手前报 `hier: unknown command serve` |
| web独立测试 | 11方法：1pass、10fail、0skip | parity通过；8个HierClient、2个SelectionModel因出口缺失失败 |
| boundary_empty fixture诊断 | errors0/warnings0 | 新输入有效，不能把语法错归咎未实现 |

Python failure计数含subTest，不等于方法数：deps171、pins4、conn56+8errors、
verify11、contract12+6errors、boundaries7；协议8。
这些红结果只证明入口/字段尚未实现，**不证明深层断言已经被执行验证**。
没有把上述失败做成expected-failure或全skip。本次明确启用
`HIER_TEST_FUTURE=ON` 并实际运行全部协议用例；该选项默认OFF且配置时明确提示，
避免把尚未到期的M4混入M2强制门禁。M2不受这个选项影响。前端未来测试用显式
`test:independent` 入口，不改原有check的阶段门槛；以后进入对应阶段需更新CI选择。

基线 `hier` SHA-256：`04a54f0e2b9be9fb6f40c8a5360c75760e97271540c71782c7fd83f700ec1f8f`。
fixture SHA-256：

- conn.sv：`97c05b72ac441143b348580eda17fae4ab97d3cf9059e2e3eb1b895f5f93a664`
- ports_edge.sv：`0640b62f3a3313f0fc3cdd7c37bcbe3b18c12dac49d480689c13f8cd89b8430b`
- ops.sv：`d982d3eaf78069319fbe3b14a4071ddb171d3aaee184eadf6d4d043ea435480e`

### 复现

按README配置构建B工作树（可用已有第三方源码的FETCHCONTENT_SOURCE_DIR覆盖，
`HIER_BUILD_EXPERIMENTS=OFF`、`HIER_TEST_FUTURE=ON`），不得把A当前工作树作为源目录。

```sh
cmake -S core -B core/build-independent -DHIER_BUILD_EXPERIMENTS=OFF -DHIER_TEST_FUTURE=ON
cmake --build core/build-independent --target hier hier_tests -j 6
core/build-independent/tests/hier_tests '~[independent]'
core/build-independent/tests/hier_tests '[independent]'
ctest --test-dir core/build-independent -E 'm2_|m4_' --output-on-failure
ctest --test-dir core/build-independent -R 'm2_|m4_' --output-on-failure
cd web
npm ci --ignore-scripts --offline
npm run check
npm run test:independent
```

前端须让PATH中的node符合engines；本机使用 `/Users/jiangbowang/.npm-global/bin/node`。
详细C++/Python输出保存在本机build-independent/Testing/Temporary/LastTest.log，
两次CTest概要在baseline-existing.log/baseline-new.log。日志是可再生成构建产物，
不纳入测试提交；本文件保存可复现命令、输入指纹、结果与失败分类。

本轮只增加测试、fixture、测试登记/运行脚本与本报告；20秒子进程限时及180秒CTest
限时是防止测试自身悬挂的适配，未改变产品规范。B-11至B-13与UI/性能待测项
解决之前，不能宣称对应后续阶段或M0–M7已全面验收；它们不阻塞M2。

## C复核后的专项增补与重新冻结（2026-10-10）

正式DESIGN当前SHA-256：`9be6405a1fd4a2d6f746b4f69f222941ddaaf5849c60ec2046d46d45ce787e3c`。
依据5.4支持矩阵和C的覆盖要求关闭B-10，补以下3个方法；原49个断言不放宽。
本节以前的基线结果是历史记录，仍指修改前M1，不用后续实现结果改写。

| CompositePorts新增方法 | 输入 | 独立手写期望/依据 |
|---|---|---|
| explicit_ansi_port_has_complete_ordered_mapping | ansi_ports.sv/ansi_split：input .joined({hi[1:0],lo[1:0]}) | mapped/complete；portBits0/2→lo0/2，portBits2/2→hi0/2（5.4支持矩阵） |
| explicit_ansi_mapping_is_used_by_cross_hierarchy_queries | 查询u_split.lo/hi每位的hier驱动 | 依次为顶层data位0/1/2/3，complete（4.7、5.4） |
| interface_inside_query_propagates_partial_and_location | misc.iu.b整体，inside，drivers/loads×local/hier | partial/interface_port；原因at指该端口。不虚构interface的bit0（4.4、5.4） |

三个方法都运行共享/逐实例模式，M2方法总数变为52。新增ANSI fixture先在B的M1
二进制上独立验证：errorCount=0、warningCount=0。三个新方法在同一修改前二进制上
为红（10个subTest失败、1个错误，0skip），原因是signals未提供、port缺ref，
不是非法fixture。未查看A实现来设计或修改这些期望。

A-M2-01用户决定保持4.4精确依赖断言不变：源码访问集合与Slang核对，输出影响集合
另用独立逆向需求投影验证。常量移位丢弃的高位不能被强行加回Dep；原OPS不变。
冻结后才对已交付实现进行独立构建/复跑或查找必要mutation注入点，不用其代码作oracle，
不修改A工作树，不运行A的自测/mutation脚本作为B证据。复跑与mutation结果另行追加。

## C-35～C-42独立回归冻结（2026-10-10）

根据C的公开反例和正式DESIGN设计，未看修复实现/commit/diff/自测。
DESIGN SHA-256：`121fa20a54f875211ce3b670a752a83fb1686b9fb067bcdb5edc0c37724e6c94`。
输出连接转换与无库位置引脚的补充契约以当前4.4为准，不以现有输出为准。
`review_edges.sv`为独立fixture；每项语义用例覆盖共享和逐实例。
旧52项不改预期，新增18个Python方法及4个独立C++公开API用例。

| 需求/用例组 | 输入 | 手写预期与判断依据 |
|---|---|---|
| 输入合法性 | fixture的19个top，diags/roots | errors=0且一项指定top；排除用编译错误伪造partial |
| C-35，3方法 | ANSI/non-ANSI joined({hi,lo})接a^b、sel?a:b | 每pin位依赖同位a/b，条件为control；expr/port_expr保留整体偏移；子侧驱动停在对应process，反向父信号负载不漏（4.4.5、5.4） |
| C-36，3方法 | unsigned/signed 2位输出接4位；4位接2位；等宽拼接左值置换 | 转换expr写完整父侧目标；0/1低位依赖子pin同位，零扩高位无依赖、符号扩高位依赖bit1；每位只一个转换process驱动；截掉bit2/3无父侧负载；拼接映射2/3/0/1（4.4.7） |
| C-37，2方法 | wire初始化/显式assign/输入端口表达式跨层读u.s，输出端口跨层写u.s | loads/drivers local/hier与step均partial/hier_ref，at指被读写信号；已知本地事实不能掩盖反向外部访问（5.4 B-07） |
| C-38，2 Python方法+4 C++用例 | 无库/有库；命名/位置；显式空中间位置 | 无库匿名引用逐位置唯一，宽度1/null/1；空位不前移后续y；有库按A/X/Y声明匹配、方向in/in/out、空位按库宽度unconnected；实际连接查询触达blackbox（4.4.1/2及位置契约） |
| C-39，3方法 | interface内部信号s、modport b的inside/outside及父侧绑定 | drivers/loads各reach停在interface，partial/interface_port，at正确；绑定原因不是unknown_pin_width（4.4 interface表） |
| C-40，1方法 | verify-facts/verify-sharing打开不存在源/不存在filelist/不完整或非法选项 | 有成功control；失败必须非零且JSON bad_request，消息非空；不能用退出0误报CI成功（5.3、第10节fail-closed） |
| C-41，2方法 | constant if、parameter true/false、嵌套dead分支有额外写目标 | verify-facts非零mismatch不得被接受；合法输入应检查成功、mismatch=0；依赖仅可达a/b/c，精确、无死分支控制/数据污染（5.4源码访问与输出投影、4.4规则表） |
| C-42，1方法 | reset分支0/正常1；set分支1/正常0；两个异步事件else-if、两位目标正常01 | 时钟posedge clk；异步reset/set分类只据对应异步分支，不据正常常量；逐位q均给正确异步事件（4.6、5.4） |

C++新目标`b_review_api`用M2公开LibraryProvider/连接结构，M1无法编译该目标是
功能未提供，不算skip或pass；既有`hier_tests`与基线二进制仍可独立运行。
冻结后先以固定、未修复的`6518f805`自行构建二进制跑新测试，记录具体失败，
不得expectedFailure/skip，也不把C执行证据替换为B执行证据。
旧子集、真实设计与mutation复跑详见[INDEPENDENT_M2_RESULTS.md](INDEPENDENT_M2_RESULTS.md)。

冻结复核发现一处规范歧义：无库引脚的**宽度已知、方向unknown**时，4.4明确要求
保留连接，但未完整规定drivers/loads的端点类别和partial reason。最初新测试擅自
要求blackbox_pin且complete，超出了契约；在检出/运行修复版本前取消这个未授权假设，
仅拒绝“空且complete”，允许有端点或显式partial。方向未知的具体返回形态仍需正式
契约补齐，不能据此计作方向判定已经验收。旧52项预期不变，其余新语义断言不变。
初次Python运行另遇缩进语法错误，已在b7b4e11仅修复缩进；不记为产品缺陷或红测。

## C-37补充 / C-43 / C-44独立增补冻结（2026-10-10）

DESIGN SHA-256：`7d3565981359a92f6dc364f791fb8ade68c43d0fb3cc5766b429f78e29770107`。
基线a6b3c8d，待验收交付d98a124；不查看修复代码/diff或A的自测/资源脚本作为oracle。
新增9个语义Python方法、1个独立资源方法、4个C++公共API用例；旧70方法和原4个API
用例不改，完整M2 Python门槛成为80方法（资源测试在CTest单独串行）。

| 验收条件 / 测试 | 输入 | 手写期望和依据 |
|---|---|---|
| 合法性控制 | review_followup.sv全部14个top × shared/per-instance | 指定top唯一、编译errors=0；非法输入不能充当语义红测 |
| C-37 source角色 | 普通inout/ref、tran/tranif1连接u.s | 所有引用源externalRefs读写角色并集恰为read/write；各源partial/hier_ref，at为该process（4.1、5.4） |
| C-37目标反向查询 | 同一u.s，drivers/loads × local/hier | 两方向都partial/hier_ref，at指u.s；源侧partial不能抵消目标漏标 |
| C-37 step传播 | 同一u.s，back/forward | partial/hier_ref（5.4 B-07）；只验M2逐跳状态，不冒充M3追踪全验收 |
| C-37 occurrence非干扰 | 两个重复父体，每个都有u[0]/u[1]，只读u[1].s | local/hier：u[1] partial/hier_ref；u[0] complete且无负载（4.1真实symbol身份隔离） |
| C-37库方向4 API用例 | LibraryProvider的In/Out/InOut/Ref × 命名/位置 × shared/per-instance | 绑定采用库方向；source读/写集合恰等于声明方向；target loads/drivers按读写方向partial、反向无访问则complete；at正确；verifyFacts零mismatch且external计作skip（4.4、4.8、5.4） |
| C-43目标投影 | {hi,lo}←10；{q[7:6],q[5:4]}←0010；嵌套{hi,{mid,lo}}←101 | 每左值操作数分别分类：hi set/lo reset；q位空间0/1 set、2/3 reset；hi/lo set、mid reset（4.6） |
| C-43等价改写 | 上述普通拼接/切片拼接改成逐操作数独立赋值 | 两种写法都等于手写期望，不能仅要求两个错误结果相等 |
| C-43四态边界 | {hi,lo}←x0 | hi unknown、lo reset，邻接未知不能污染零目标（4.6） |
| C-43既有规则回归 | 整变量q[3:0]←0010 | 整变量仍为set，不能擅自改成按单个位0/1分类（4.6） |
| C-44共享打开成本 | 原M0 synthetic/gen.py，fanout10、depth3/4/5、unique0 | 实例1112/11112/111112，body5/6/7，fast、一顶层；仅open+info，不查询连接。每档3个新进程、固定种子乱序，wait4峰值RSS规范为字节，记录全部9次时间和输入SHA（4.1、M0 V3/V8历史基线） |

资源回归使用**相邻档median RSS不超过3倍、最大/最小不超过5倍**的容差哨兵，
捕获已知逐实例物化的数量级增长；不是产品内存预算，也不是某台机器的绝对8MB承诺。
容差在运行修复版前冻结，不使用A门槛“4倍+16MiB”。所有时间只记录，不设硬SLA。
60s每子进程/240sCTest是harness防悬挂限时，超时失败且清理子进程，不是产品取消预算。
RSS缺失/非正、命令失败、共享未启用或缺依赖都必须失败，不能skip；Linux以KiB→byte
规范化，macOS按byte，其他平台明确失败，不伪装跨平台已验证。资源方法单独串行执行。

仍需文档同步：4.1已要求层次引用目标/祖先隔离，5.4旧段落仍说明同body的保守广播。
本轮非干扰用例依据4.1的真实symbol隔离，不声称支持未承诺的层次连接解析。
方向unknown端点形态、B-11～B-13、M7预算继续单列，不从当前修复输出推导新规范。

本冻结为`c5f74b0`，独立红→绿及当前d98a124回归见
[INDEPENDENT_C37_C43_C44_RESULTS.md](INDEPENDENT_C37_C43_C44_RESULTS.md)，
含资源审计JSON；旧70项与旧API断言不变。本节之前的历史基线不改写。

## M3 独立冻结入口（2026-10-11）

C 已复核关闭 C-46～C-48；按 DESIGN `e8217ff1...` 新增的 60 个 CLI 方法与
15 个 API 用例见 [INDEPENDENT_M3_TEST_PLAN.md](INDEPENDENT_M3_TEST_PLAN.md)。
产品基线为 `e8f6087`，旧 M2 测试原样保留。M3 接口可用性与实际语义失败
分别报告；上述历史 M2 结果不改写为 M3 已通过。
