# M3 私有 observer 适配与审查边界

这是 A 提供的测试构建适配。C 已认可固定 3c2bdd2 的既有机制，以及061d1d1的
C-59两个新增事件，并正式关闭C-58/C-59。B 的原八项与新增两项独立冻结及三配置
执行分别见 [原 observer 报告](M3_R3_OBSERVER_VERIFICATION.md) 和
[C59 报告](M3_R3_C59_VERIFICATION.md)；具体机制认可、独立测试和原生整合分别记录。
不改变 DESIGN 的成本/取消/时间契约，不新增公开生产注入入口。

## 构建与生命周期

`HIER_TEST_OBSERVER` 默认 OFF。只有 L2/L3 私有依赖 `hier_observation`；公开模型/头、
Design/OpenOptions、CLI/JSON 不提供观察字段。OFF 的 emit 为空函数，now 直接使用 steady_clock，
没有 Sink/Scope/thread_local 状态或可安装回调。ON 是明确的测试产物，不能混用 ON/OFF 的对象文件。
测试目标须 PRIVATE 链接 hier_observation 并与开启适配的产品归档一起重编。
标准 check.sh 显式设普通配置 OFF、Debug/ASan ON，避免依赖已有 CMake 缓存。

`Scope` 在当前线程借用一个 `Sink`，析构恢复外层；不可复制。context 和 occurrence span 只在同步
调用期间有效，观察者不得留存 span、递归进入 Design、修改事实或抛异常。回调签名 noexcept；
可记计数及在指定事件同步 request_stop。取消仍由实际 Cancel 检查和 Result 错误路径处理，
observer 不替换结果/索引/缓存，不返回假 Hop。测试时钟只替换 L3 时间读取，须单调且与steady_clock
使用同一 duration；不用 sleep/线程竞速，不改变生产计时。Scope 必须覆盖完整同步查询。

## 已交付事件的精确语义

| 事件 | 位置与含义 | 取消边界 |
|---|---|---|
| StepBodyAdmitted | Step::load，重复context和第三体拒绝之后、首次取得该逻辑context的事实之前；subject=BodyId，occurrence借用InstKey | 回调后、任何该体读取前检查；冷热都产生 |
| ConnectionIndexEntry | Builder::add，非空关系进入局部未完成索引前 | 立即检查；取消不发布未完成索引 |
| ConnectionIndexNode | buildCoverage，每个真实覆盖树节点构造前 | 立即检查 |
| ConnectionSeekNode / Compare | findNext每个访问节点；overlaps lower_bound每次区间比较 | 节点立即检查；一次二分比较数由索引长度决定，非每比较回调都新增生产检查 |
| StepCandidate | emit每条已由索引找到的候选、构造Hop前 | 立即检查 |
| HopMaterialize | hop工厂开始一次Hop构造；并非最终返回条数 | 原循环/finish检查；可观察本页中间构造 |
| HopEmit | Hop加入本页后；amount为continuation数 | 原循环/finish检查，取消不返回半页 |
| CachePublish / Evict | 实际缓存发布/淘汰之前；subject=BodyId，amount为含索引的计费字节 | 回调后、该操作前检查；事件是尝试，不是成功发布证明 |
| OccurrenceVisit / Publish | 构建DFS每次栈帧访问；完成后发布前，amount为总occurrence数 | 立即检查；计数不是源码命中物化数 |
| TraceRelation | 每个分段关系进入Pending构造前 | 紧接原取消检查 |
| TraceFilterRange | routes区间合并每个既有范围访问 | 紧接原取消检查；不声称所有内存分配都被统计 |

冷索引构造与热页必须分别记录。逻辑body预算不可用物理提取次数代替。
边界事件与实际返回结果/重试共同验证缓存发布，不以一次通知断言缓存内部状态。
额外参数均为已存在的数值/借用span，不构造图或字符串，不另维护事实来源。

## source 接入（C 已认可）

| 事件 | 精确位置与载荷 | 取消边界 |
|---|---|---|
| SourceIndexRange | L2 sourceIndex 的 add，在加入一个共享范围/引用序列之前；subject=file 编号。定义和其 occurrence 是两个序列，不是两个物理区间 | 已取消时不再发事件；回调后立即检查，不加入当前项 |
| SourceIndexPublish | 全部范围分组/排序/去重完成、写入缓存前；amount=共享范围组数 | 立即检查，取消不发布；重试仍重新构建 |
| SourceCandidate | L3 从有序合并队列选出一个去重后的命中身份；subject=固定范围组编号 | 立即检查；最多 limit+1 次，用额外一个判断 next |
| SourceHitMaterialize | 构造本页 SourceHit/字符串/SourceSpan 前 | 立即检查；计数不超过 limit |
| SourceHitEmit | SourceHit 已加入局部页；amount=本页条数 | 立即检查；取消不返回半页，游标无副作用 |

SourceCandidate 前会维护各匹配共享序列的数值身份队列。这些轻量身份不含 SourceHit/SourceSpan，
每序列只留当前一个 occurrence；不把所有 occurrence 预先放入队列。首次 Occurrences/SourceIndex
建表事件单列；热页不会重新建表。只读使用 SourceSnapshot 的 hash/行偏移，磁盘改动不换索引代次。
B 原八项已覆盖其受审有限范围；既有 Frontend 提取后取消/LRU 适配与本机制分别保留。

## C-59 整理段增量（C 已认可）

位置为 `core/db/src/SourceIndex.cpp` 的 `orderSequences`，仅整理当前范围组的共享
SourceSequence，不展开 occurrence；仍由原 sourceIndex 的局部 groups 唯一拥有。

| 事件 | 真实操作和载荷 | 取消边界 |
|---|---|---|
| SourceIndexSortCompare | std::sort 比较器每次比较 `(owner,id,ref)` 之前；subject=正在建立的范围组编号，amount=1 | 先检查已有停止，再 emit，再立即检查；停止则在比较前抛私有 SourceIndexInterrupted |
| SourceIndexDedupCandidate | std::unique 谓词每次检查相邻保留项/候选是否同一序列之前；subject/amount 同上 | 同上，在相等判断前响应停止 |

每次真实比较/去重候选均检查，严格于至多 256 候选间隔；事件数量不是命中数或文件数，
排序比较次数由标准库实现决定，不能冻结精确总比较数。不声称这些事件包含所有交换、
移动、内存释放或 OS 时间。没有未停止请求时的虚假中断，OFF 同样保留生产 Cancel 检查。
仅在 orderSequences 内捕获该私有类型并返回失败，外层返回 cancelled；不吞其他异常。
被打断的 std::sort/std::unique 只要求容器可销毁，其内容不会再被访问、发布或复用。
SourceIndexPublish 仍只在全部组成功后出现；重试须通过完整有序结果及再次整理共同
证明未复用半成品。Scope 生命周期/禁止重入/不得抛异常等已认可边界不变。

A 增补五级四分支宏生成 1024 声明的同范围用例，在排序/去重第 257 和 769 个事件
同步停止，检查 cancelled、无发布/物化、冷重建与热全量结果。它仅是 A 回归；B 在
C 认可后独立构造了769/2305声明及513声明×12数组的72场景，并在固定1410407
三配置完成外部验证。该冻结原样进入 b_m3_source_sort，原生整合结果另记录。

## 验证归属与限制

默认 OFF 构建 `cmake --build core/build --target hier hier_step_index_tests -j4` 退出0。
ON 的 A 机制测试已接入 a_m3_observation，覆盖 Scope 恢复、首屏物化、索引/产出取消重试及假时钟。
上述默认OFF命令是初版历史执行；固定版本/实际命令以对应报告为准。
C 的机制审查与两项关闭记录见 REVIEW_LOG；B 的独立报告链接见开头。A 在主树重跑
冻结测试只证明整合，不改记为 B 的独立执行。测试阈值由 B 独立决定，不从 A 当前计数拟合。
受审事件与现有用例不覆盖所有内存分配、swap/move/析构或 OS 时间，不据此承诺 M7
最长等待/绝对资源预算；原生专项全部通过也不自动等于整个 M3 已正式验收。
