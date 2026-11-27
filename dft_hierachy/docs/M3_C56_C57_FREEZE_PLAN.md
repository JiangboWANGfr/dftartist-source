# B C56/C57 专项冻结（R2-B续领）

固定产品1f42fb2711764cfba863acc12a06b46b33f28c44为修复前红基线，DESIGN SHA487211cec837aed48879f9915372780f1c03b7b0adf61cccbcbc4bb36a6e89e0。C在最新日志明确指出两项并交B独立冻结；不读取A实现/diff/自测或C探针源码。按§4.3/5.5.2/5.5.4及手写HDL定义正确行为，未修改契约或旧oracle。

## 输入、预期、依据

独立trace_boundaries.sv：四位leaf只有assign q=d；父侧分别4'b10xz、a&b、直接a。三个父体合法且error0，inside源是正对照；outside源已经表示输入引脚的值，必须通过已证明本体映射接入内部，不把父侧常量/表达式当成无路线。表达式不倒推成wire，单次step仍不自动翻面。

1. C56：outside d到inside d、本体signal d、outside q，整段0+4及裁剪1+2均非空完整路线，无frontier；端点side存在且经图关系确有手算逐位route。CLI另用既有独立小图位关系组合检查；仅fixture四位，产品仍要求区间工作。
2. 同side同位段在maxDepth0前命中，完整零边；不同side的同位段必须通过边连接，不当零边等价；不同位不能误连（d outside bit0→d inside bit1为空完整）。inside d→outside q及direct-wire outside控制均保持。
3. 起点/源锚点与内部工作照常计预算：maxNodes1或maxEdges0不能完成这条非零边路线，须partial/相应原因，保留outside起点及实际裁剪位段frontier。不限预算冷/热重复图ID稳定；shared/per-instance×cache0/64MiB。
4. C57：直接从primitive输入pin outside起点向前combinational/full停止，unsupported语义frontier在同pin、depth0、无cursor；unknown方向已知宽度pin A同样为blackbox/depth0。boundary可视化不算可继续关系。
5. 从父侧a经一个真实绑定到primitive输入pin，unsupported frontier深度1；structural策略完整停止，无语义frontier；maxDepth0时budget_depth、depth0且尚未探测内部。防止粗暴所有终点减一。

公开API四用例、CLI五方法分别冻结；无私有适配/observer。新分母不加入原80/新增step三边界，C53/C54已由C关闭保持；C55必要依赖修正a8aa140独立保留。

## 执行与交接

先独立提交全部测试/fixture/两个构建注册及本计划，然后链接B干净固定1f42三配置重编公开API、运行新CLI和API红基线。未实现/编译问题与语义断言失败分别记录；不改预期取绿、不猜ID编码/确定性成本。原冻结三配置及C55结果见076d042，不重复转记为本增量新执行；需要时最小复跑旧绿集。

本轮无生产/API/Schema/IPC/工程格式修改，只增测试与必要注册。实际链CLI/公开Design→Core；React/Electron/NDJSON及持久化不适用。A接收冻结后固定修复供B复验，C正式关闭编号；source/observer仍待既定前置，不提前放行完整M3。

### B检查器补强记录

首冻aa90b39在固定1f42三配置API各1通过/3失败（1520成功/328失败断言）、CLI各2通过/3失败，原结果保留。B检查新增CLI时发现引用自带的旧小图位见证忽略side；同ref端点可能被同时当初始状态，弱于本计划的两侧区别。仅本新增模块改为side-aware的四位检查器，并给已声明完整的inside正对照显式complete断言；不改变fixture、目标预期或任何旧测试，不把此检查器弱点记为A产品缺陷。补强另commit后重跑CLI；CPP未改，首冻原API结果继续有效。

## 完成与交接

专项冻结及修复前红基线已完成。side-aware补强b64338b三配置CLI结果仍2通过/3失败，0skip；检查器四个纯数据自检通过。新API严格编译通过、每配置1848断言中328失败；旧C53/C54边界和限定适配另最小三配置复跑通过。完整报告[M3_C56_C57_BASELINE.md](M3_C56_C57_BASELINE.md)，实际逐方法/断言/命令/12项预算回复与SHA在m3_c56_c57_baseline.json。C55修正已获C认可但待A固定吸收，C56/C57保持开放交A修复，未代C关闭。B验证树干净固定1f42，所有旧fixture/oracle/资源阈值保留。
