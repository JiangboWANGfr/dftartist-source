# B C56/C57：独立冻结与固定1f42红基线

**结论：两个专项缺陷在三配置均独立复现，当前增量不放行。** 新四API各1通过/3失败、1520成功/328失败断言；新五CLI各2通过/3失败。直接wire、inside、side/位段及真实绑定深度控制通过；不是编译失败、缺入口或环境错误。正式关闭归C，交A固定修复后复验。

## 固定范围、验收与冻结

产品1f42fb2711764cfba863acc12a06b46b33f28c44，DESIGN SHA487211cec837aed48879f9915372780f1c03b7b0adf61cccbcbc4bb36a6e89e0。B测试首冻aa90b39b768f793db18372ba50bbc532b4c85b83，side-aware检查器补强b64338b690fe8415ce26dfd673d9bfc895e7fa1f；计划/每项输入与预期：[M3_C56_C57_FREEZE_PLAN.md](M3_C56_C57_FREEZE_PLAN.md)。实际命令、退出码、全部逐方法状态/计数、失败样本和诊断：[m3_c56_c57_baseline.json](m3_c56_c57_baseline.json)。

B干净detached产品树及三配置仍使用自己从固定产品重编的库，新增API独立编译链接，CLI使用相应自建hier；主树A在途代码不读不改，不用A/C执行代验。不读取A实现/diff/自测或C探针源码；强制日志已暴露两方概要，不称严格盲测。只依据DESIGN§4.3/5.5.2/5.5.4与独立HDL，不从输出反推预期。

新fixture是四位leaf的assign q=d，父侧分别4'b10xz、a&b、direct a；另有单buf及unknown方向/已知一位blackbox。全部diags error0。预期来源：端口可作paths两端，按实际side/PortInternal补源锚点并计工作预算；boundary可视化不消费依赖深度；起点0、真实绑定一次1。同side零边命中不允许偷偷把不同side当同状态，单次step仍不自动翻面。

| 新冻结项 | 输入/预期 | 独立实际结果 |
|---|---|---|
| C56路径 | constant/expr/direct-wire的outside d→inside d、signal d、outside q；whole0+4/clip1+2，完整非空且有位关系见证；cache0/64MiB、shared/per、同快照冷热ID稳定 | constant/expr仍complete空，wire所有路线控制通过 |
| C56预算与side控制 | 非零边已知路线，maxNodes1/maxEdges0须partial/相应frontier；同side同位段maxDepth0零边命中；d0 outside→d1 inside完整空；inside d→outside q完整非空 | 仅expr的两个预算仍错误complete空；constant和wire预算正确partial。零边/不同位/inside控制通过 |
| C57直接语义停止 | 从primitive输入pin或unknown方向已知宽度A的outside起点，combinational/full语义frontier应depth0、实际point/side/reason、无cursor | 均partial/reason正确，仅depth仍1而非0 |
| C57真实关系/策略/深度控制 | 从a经一真实绑定到primitive输入pin应depth1；structural完整停止无语义frontier；maxDepth0 budget_depth且depth0 | 全部通过，不能用所有终点一律减一修复 |

fixture SHA256 4b20d69aab70a06959838160b2c2d5c49ea961d0121f27d9a64182849b835116；CPP 32b316725b9457ec9f44ba62447b5695cc19c24897ac7f958723403cc4c8f8fe；最终CLI 41be926f178b5c864ecce35aace97a95e7acf18149079dbb7e5a6e3ebd06ca58。

## 实际三配置结果与失败分母

沿用B普通RelWithDebInfo、Debug、RelWithDebInfo+ASan/UBSan产品；HIER_TEST_M3=ON、HIER_BUILD_EXPERIMENTS=OFF。外部新目标-j2、严格-Werror；模型/产品头来自固定树。没有新增警告、编译适配、skip/xfail或额外sanitizer内存/UB报告。

| 集合 | 普通 | Debug | ASan+UBSan |
|---|---|---|---|
| 新trace_boundary配置/重编 | 退出0 | 退出0 | 退出0 |
| 四新API | 1通过/3失败，1520成功/328失败断言，runner42 | 同左 | 同左 |
| 五新CLI首冻 | 2通过/3失败、退出1、0skip | 同左 | 同左 |
| 五新CLI side-aware补强后 | 2通过/3失败、退出1、0skip | 同左 | 同左 |
| 旧C53/C54边界最小复跑 | 3/3、648断言、退出0 | 同左 | 同左 |
| 旧限定取消/LRU适配最小复跑 | 3/3、144断言、退出0 | 同左 | 同左 |

API总1848断言，每配置328失败细分：C56路线288、C56预算24、C57深度16。原生另实际复跑同runner收集逐表达式计数；每个runner退出42，保留该退出码的JSON汇总wrapper退出1。CLI每配置36失败事件：路线24、expr预算4、直接语义深度8。重复组合计数不代表328/36个独立缺陷。

两个通过CLI方法分别为inside/同side零边正对照，以及真实绑定/structural/预算深度控制。API第一/第二case内wire/inside/不同位等对照也通过，最后纯C57控制case通过。原生额外12项完整预算回复证明expr两预算红、constant/wire两预算绿；不能凭总体红色把绿色控制误写失败。

## B检查器补强与范围

首冻直接引用旧小图检查器时忽略side，对同ref两侧可能产生错误零边见证。B自己检查发现后，仅新增模块补强为side-aware的有限四位关系组合，并显式校验inside正对照complete；这不是A缺陷、不放宽预期、不改CPP/fixture/旧oracle。先独立提交b64338b再重跑三配置CLI，原首冻结果全部保留。检查器自身四个纯数据控制（side区别、bitwise连接、不同位、all投影）退出0；不归作产品用例。产品仍要求区间算法，不由四位checker推断性能合格。

本轮只增加冻结tests/fixture及两个注册入口，无生产/API/Schema/IPC/工程格式更改；B产品树最终干净仍1f42，三个CLI SHA不变，Slang共享上游h/cpp SHA仍fdff6130…/11ae44ba…。新增仓库API/CLI登记尚在B分支，原固定产品未吸收，不称其新目标已由原仓库门禁执行；本轮使用实际自建Core库的独立外部runner，核对CTest登记有1个新目标。

R2原80/新增step三边界及八API/27前序/RSS结果保留在提交076d042的[M3_R2_REVERIFY.md](M3_R2_REVERIFY.md)，不重复计为本增量全量新执行。新五方法/四API单列，不加入原80或三step边界。C已正式关闭C53/C54；C55仅PRIVATE依赖修正a8aa140经C认可，原1f42仍待A吸收/C核对关闭。C56 High/C57 Medium保持开放，A已领取修复。

没有运行通用observer/热准入/seek/候选/中间物化计数、索引/产出循环取消、确定性时钟、真实设计/Linux/CI/TSan/fuzz/mutation/覆盖率或本增量全量Core门禁。source尚未交付，混合未来15API在076d042记录编译失败/运行0；不拆改取绿。NDJSON/TS/React/Electron/UI属于后续，首版无session持久化/恢复/迁移，本轮不适用。

## 交接

**A：** 原样按a8aa140→076d042→aa90b39→b64338b顺序吸收，保留旧全部oracle/阈值；修C56/C57并交固定产品供复验，不能只修未裁剪输出pin目标或粗暴所有终点减一。

**C：** 新独立红证据支持原编号，原因/side/clip/正预算与真实绑定深度已单列；正式关闭归你，不重开C53/C54。

**协调者：** R2-B语义原冻结复验及新专项冻结/红基线完成；C55修正经C认可待产品吸收，C56/C57待A固定修复。当前1f42增量/完整M3不放行，没有observer新交付就不推进其独立验收。
