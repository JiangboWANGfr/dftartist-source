# R1-B：step独立验收与增量冻结

固定产品37a1b3cb7797be47b62fafd18a1a216e9348d403，修改前8a944f0bf8a32ca4c4b0b321f478d7a392ff6511；DESIGN SHA487211cec837aed48879f9915372780f1c03b7b0adf61cccbcbc4bb36a6e89e0，§4.3/4.4/5.4/5.5.1/5.5.2/5.5.7。只读公开头和B自己的fixture/旧冻结，不读A实现/diff/测试代码定oracle。日志已暴露A概述，不标严格盲审。

## 验收条件及覆盖

原step CLI8用例完整保留：绝对映射、all control、concat、fact方向/裁剪不变、寄存器角色、未知方向/宽度、百万位区间。原公共API高扇出门禁位于混合M3ApiTest，因未交付trace/source不能编译全文件，本轮在独立runner补同语义专用集合，不删除旧文件。

新增M3StepIncrementTest六用例输入与预期：
- flow.sv fanout12独立参数体 + step_edges.sv四同定义共享体，每页当前+一个逻辑子体，至多一continuation，全部页恰为12/4个各自d，cold/hot/cache0/64MiB、shared/per-instance顺序和分页相同。
- flow gate两依赖：maxHops1生成两页，无漏重；游标绑定ref/方向/位段/快照，页大小可改，原游标可重试；预取消返回Cancelled后正常重试，返回值在Design销毁后可读。非法页大小、零宽/越界、side和格式游标均拒绝。
- step_edges reversed/repeated pin外侧back：引脚位1→a0、2→a1、3→a0，允许连续关系合并为区间；显式outside两个方向只查询父侧，inside forward查询本体，continuation可直接接续。顶层outside和引脚缺side拒绝。由HDL拼接低到高手算，不从输出拟合；初冻中分区/隐式翻面的错误前提及三轮失败另保留于下节。
- 4'b10xz绑定单查bit0/1/2/3分别z/x/0/1，无next/map/at，剪裁不改变绑定fact。
- 两个assign分别驱动y：两process/fact不合并，反向与前向、clip2依赖同一原fact，绝对映射2→2。
- q低2寄存器高2组合：三关系(register data低2/register clock all/process data高2)，反方向事实相认。

每个关系还检查必填fact、next≤1、bitwise覆盖同宽/from/slice边界及Hop.map兼容拼接、conservative⇒all、all空map。预期均依据规范；身份编码不猜。跨快照只要求游标stale，不要求fact跨快照编码稳定。

## 执行与回归

先冻结独立测试提交，再在旧8a链接记录编译缺字段/缺Cancel（未执行的语义断言不记通过/失败）；原CLI8另实际跑旧基线。产品验证树切固定37a，三配置独立构建Core消费者及外部B API；运行原42+step8=50 CLI、六新API、原库C49/C51/lookup/occurrence API、M2回归和原生资源4方法。普通完整80仍真实记录后续缺口，不skip/xfail。资源阈值不改且不在sanitizer跑。明确HIER_TEST_M3=ON，不声称默认完整未来目标绿。

## 修改范围与兼容

只改B测试/fixture/注册/docs，不改产品和前序oracle，不改DESIGN/API/IPC/Schema或工程格式。产品消费者必须对固定头重编，观察schema4不当M4 TS一致性/ABI证明。CLI→Core集成不是IPC。工程持久化首版排除。

## 待审适配与未验收

逻辑体预算输出能证明分页语义，不能证明内部工作成本；预取消不等于执行中取消。现有Frontend虚接口适配已先交C限定审，再冻结实施（3c00e04），明确仅提取后同步取消/真实正预算LRU/借用的L2/L3内部集成子集，不sleep竞争、不编写生产hook。候选扫描/构造、热逻辑体准入、索引与产出取消仍需进一步获审observer。无权威Schema/TS/UI/NDJSON，Linux/远端CI/TSan/全资源释放不在本轮实际证据。

报告另记录实际命令、退出码、断言、输入hash与未执行项。新失败先交A/C，不改期望取绿。

## 首轮测试前提纠正（保留原证据）

37a普通首冻API实际5通过/1失败、4717成功/1失败断言、退出42。反序拼接要求恰三Hop是B前提错误：§5.5.2第5条允许连续映射合并，pin1→a0及pin2→a1恰连续，允许两个或三个interval分区。纠正为2≤Hop≤3并将这些最多三位映射展开核对手算关系{1→0,2→1,3→0}，重复a0不能丢，next≤1和from/slice同宽/兼容映射仍强制。fixture/映射语义不改，非产品缺陷；先重新冻结再跑，旧首冻及首次失败不抹除，不将归一化扩展到百万位总线。

第二冻a6db518在三配置均5通过/1失败、4762成功/1失败断言、退出42，触及下一个未执行前提：outside forward要求恰一个全宽Hop不符合“fact为原绑定片段”及同事实才合并的规则。片段可以分别进同一内部d，正确oracle是每个Hop进本实例d、绝对identity映射、四位并集无漏重，continuation可直接查询；不自行规定不同fact合并。修正只去掉未规定的分区数量，保留所有映射/side/事实身份判断。本轮两次错误前提均属B测试，保留证据，不报A产品缺陷。

第三冻a2f65a4三配置均5通过/1失败、4765成功/2失败断言、退出42。此前解释“outside forward进内部”仍错误，与§5.5.2规则1的“不隐式再次翻面”冲突。本次明确纠正：outside两个方向不能进child内部，所有continuation属于父体a；要查询本体必须显式inside，inside forward有关系且continuation属于child、可直接接续。源码映射/输入、outside back三位手算和其他五用例不改；本记录覆盖前述错误的跨面解释，不改写历史记录。三个前提失败均由B负责，非产品缺陷；生产实现未读取。
